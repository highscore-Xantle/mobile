import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { Easing, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { playSound } from '../../lib/sounds';
import { supabase } from '../../lib/supabase';
import { usePresence } from '../../lib/usePresence';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

export default function RoomLobby() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { isOnline } = usePresence();

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  // Hooks must all be declared before any early return (Rules of Hooks)
  const pulse = useSharedValue(0.5);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // ── Flip Card Animation State ──
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useSharedValue(0);

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
    };
  });

  // Derive isHost from state so we can use it in an effect before early return
  const isHost = !!room && room.host_id === session?.user.id;

  // The start RPC resolving AND the realtime 'active' UPDATE both navigate
  // into the game — whichever lands second remounted the game screen
  // mid-handshake (channel resubscribe, state reset). Navigate exactly once.
  const navigatedRef = useRef(false);
  // Whether WE hold a seat in this room. A spectator (deep link into a full
  // room) must not be shoved into the 2-player game screen when it starts.
  const seatedRef = useRef(false);
  const [seated, setSeated] = useState(false);
  const markSeated = () => { seatedRef.current = true; setSeated(true); };
  const goToGame = (gameKind: string) => {
    if (navigatedRef.current || !seatedRef.current) return;
    navigatedRef.current = true;
    router.replace({ pathname: '/game/[id]', params: { id: gameKind, roomCode: code } });
  };

  useEffect(() => {
    if (!isHost && !loading && room) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [isHost, loading, room]);

  useEffect(() => {
    if (!code || !session) return;
    fetchRoomAndPlayers();

    const roomSub = supabase
      .channel(`room_${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (payload) => {
        setRoom(payload.new);
        if (payload.new.status === 'active') {
          goToGame(payload.new.game_kind);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomSub);
    };
    // session?.user?.id, not session: hourly token refresh emits a new
    // session object and would tear down/resubscribe the channel — a status
    // flip landing in that gap was lost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, session?.user?.id]);

  // Fallback poll: the lobby→game handoff is otherwise realtime-only, and a
  // status UPDATE landing while the socket is down (backgrounded app, flaky
  // network, subscribe gap) stranded the guest on "Waiting for host…"
  // forever while the host sat alone in the game.
  useEffect(() => {
    if (!room?.id || room.status !== 'lobby') return;
    const roomId = room.id;
    const t = setInterval(async () => {
      const { data } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
      if (!data) return;
      setRoom(data);
      if (data.status === 'active') goToGame(data.game_kind);
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, room?.status]);

  useEffect(() => {
    if (!room?.id) return;
    const roomId = room.id;
    const playersSub = supabase
      .channel(`players_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
        fetchPlayers(roomId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(playersSub);
    };
    // room.id, not the room object: every rooms UPDATE replaces the object,
    // and resubscribing on each one could drop a player INSERT in the gap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  const fetchRoomAndPlayers = async () => {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (roomError || !roomData) {
      Alert.alert('Error', 'Room not found.');
      router.replace('/home');
      return;
    }

    setRoom(roomData);
    await fetchPlayers(roomData.id);

    // Auto-join: arriving via the shared deep link / QR ("Tap to join →")
    // landed people here as pure spectators — never inserted into
    // room_players, host stuck at 1/2, guest waiting forever. Mirror the
    // Pixel Rush screen's behavior and seat them on arrival.
    if (session) {
      const { data: existing } = await supabase
        .from('room_players').select('user_id')
        .eq('room_id', roomData.id).eq('user_id', session.user.id).maybeSingle();
      if (existing) {
        markSeated();
      } else if (roomData.status === 'lobby') {
        const { error: joinErr } = await supabase.rpc('join_room', { p_code: code });
        if (!joinErr) { markSeated(); await fetchPlayers(roomData.id); }
        // join_room raising (room full, etc.) leaves them a spectator —
        // `seated` stays false, which swaps the footer copy and stops the
        // start navigation from dragging them into a game they have no seat in.
      }
    }

    setLoading(false);

    if (roomData.status === 'active') {
      goToGame(roomData.game_kind);
    }
  };

  const fetchPlayers = async (roomId: string) => {
    const { data } = await supabase
      .from('room_players')
      .select('*, profiles(username, avatar_url)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (data) setPlayers(data);
  };

  const handleStartGame = async () => {
    if (!room || !canStart || starting) return;
    setStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('click');

    const { error } = await supabase.rpc('start_room', { p_room: room.id });
    if (error) {
      setStarting(false);
      Alert.alert('Error starting game', error.message);
      return;
    }

    goToGame(room.game_kind);
  };

  const handleToggleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('click');
    const nextState = !isFlipped;
    setIsFlipped(nextState);
    flipAnim.value = withTiming(nextState ? 1 : 0, { duration: 400 });
  };

  // ── Copy: uses expo-clipboard (works on both iOS & Android) ───────────────
  const handleCopy = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('click');
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Share: deep link + friendly message, opens native share sheet ─────────
  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('click');
    // Generates xantle://room/<code> on native, https://... in Expo Go tunnel
    const deepLink = Linking.createURL(`/room/${code}`);
    try {
      await Share.share({
        title: 'Join my Xantle game 🎮',
        message: `Hey! Join my Xantle game 🎮\n\nRoom code: ${code}\n\nTap to join → ${deepLink}`,
        url: deepLink, // iOS: shown as a rich URL preview in the share sheet
      });
    } catch (err: any) {
      Alert.alert('Error sharing', err.message);
    }
  };

  if (loading || !room) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <GradientFill colors={gradients.background} />
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
    );
  }

  const canStart = isHost && players.length >= 2;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              // A seated guest backing out must give the seat up — otherwise
              // the room stays 2/2 forever, later joiners get "room is full",
              // and the host can start against an empty chair.
              if (seated && !isHost && room?.status === 'lobby') {
                supabase.rpc('leave_room', { p_room: room.id }).then(({ error }) => {
                  if (error) console.warn('[room] leave_room failed:', error.message);
                });
              }
              router.replace('/home');
            }}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.gameKind}>{room.game_kind.toUpperCase()}</Text>
          <HeaderAvatar />
        </View>

        <ScrollView contentContainerStyle={styles.content}>

          {/* Flippable Room Code Banner */}
          <View style={styles.cardContainer}>
            {/*
              Fix: pointerEvents on the Animated.View controls the native hit-test.
              The back face is absolutely positioned and would intercept all touches
              on Android even when visually hidden via backfaceVisibility.
              Setting pointerEvents="none" when not flipped prevents this.
            */}
            <Animated.View
              style={[styles.codeCard, frontAnimatedStyle]}
              pointerEvents={isFlipped ? 'none' : 'auto'}
            >
              {/* Share icon — top-right, opens native share sheet */}
              <Pressable
                style={styles.shareBadge}
                onPress={handleShare}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <FontAwesome name="share" size={14} color={colors.white} />
              </Pressable>

              <Text style={styles.codeLabel}>ROOM CODE</Text>
              <Text style={styles.codeValue}>{code}</Text>

              <View style={styles.cardActionsRow}>
                <Pressable style={styles.cardBtn} onPress={handleCopy}>
                  <FontAwesome
                    name={copied ? 'check' : 'copy'}
                    size={16}
                    color={copied ? colors.success : colors.blue}
                  />
                  <Text style={[styles.cardBtnText, copied && { color: colors.success }]}>
                    {copied ? 'Copied!' : 'Copy Code'}
                  </Text>
                </Pressable>
                <Pressable style={styles.cardBtn} onPress={handleToggleFlip}>
                  <FontAwesome name="qrcode" size={16} color={colors.cyan} />
                  <Text style={styles.cardBtnText}>Show QR</Text>
                </Pressable>
              </View>
            </Animated.View>

            <Animated.View
              style={[styles.codeCard, styles.qrCard, backAnimatedStyle]}
              pointerEvents={isFlipped ? 'auto' : 'none'}
            >
              <Pressable style={StyleSheet.absoluteFill} onPress={handleToggleFlip} />
              <Text style={styles.codeLabel}>SCAN TO JOIN</Text>
              <View style={styles.qrWrapper}>
                {/* Encode a real link — a camera scan of the bare code string
                    ("A3F9C") opens nothing. Same pattern as Pixel Rush. */}
                <QRCode value={Linking.createURL(`/room/${code}`)} size={150} color={colors.bg} backgroundColor={colors.white} />
              </View>
              <View pointerEvents="none" style={styles.qrFooterRow}>
                <FontAwesome name="refresh" size={12} color={colors.textMuted} />
                <Text style={styles.qrFooterText}>Tap to flip</Text>
              </View>
            </Animated.View>
          </View>

          {/* Read-Only Rules Section — these are Number Duel's rules; showing
              "Classic / 5 rounds / Auto" over a Draughts lobby was fiction. */}
          {room.game_kind === 'number-duel' && (
          <View style={styles.settingsSection}>
            <Text style={styles.sectionHeader}>Game Rules</Text>

            <View style={styles.rulesContainer}>
              <View style={styles.ruleItem}>
                <Text style={styles.ruleLabel}>Mode</Text>
                <Text style={styles.ruleValue}>
                  {room.state?.mode === 'classic' ? 'Classic' :
                    room.state?.mode === 'time_attack' ? 'Time Attack' :
                      room.state?.mode === 'blind_duel' ? 'Blind Duel' : 'Classic'}
                </Text>
              </View>

              <View style={styles.ruleItem}>
                <Text style={styles.ruleLabel}>Rounds</Text>
                <Text style={styles.ruleValue}>{room.state?.rounds || 5}</Text>
              </View>

              <View style={styles.ruleItem}>
                <Text style={styles.ruleLabel}>Difficulty</Text>
                <Text style={styles.ruleValue}>
                  {room.state?.difficulty ? room.state.difficulty.charAt(0).toUpperCase() + room.state.difficulty.slice(1) : 'Auto'}
                </Text>
              </View>
            </View>
            <Text style={styles.guestSettingsNote}>These rules were chosen by the host.</Text>
          </View>
          )}

          {/* Players List */}
          <View style={styles.playersSection}>
            <Text style={styles.sectionHeader}>Players ({players.length}/{room.max_players})</Text>
            {players.map((p, i) => {
              const displayName = p.display_name || p.profiles?.username || 'Guest';
              const isMe = p.user_id === session?.user.id;
              const online = isMe || isOnline(p.user_id);
              return (
                <Animated.View
                  key={p.id}
                  entering={FadeInDown.springify().damping(14).stiffness(90).delay(i * 100)}
                  style={[styles.playerRow, isMe && styles.playerRowMe]}
                >
                  <View style={styles.playerAvatarWrap}>
                    <Avatar letter={displayName.charAt(0)} imageUrl={p.profiles?.avatar_url ?? null} size={36} />
                    {!!p.user_id && (
                      <View style={[styles.presenceDot, { backgroundColor: online ? colors.success : colors.textFaint }]} />
                    )}
                  </View>
                  <Text style={styles.playerName}>{displayName} {isMe ? '(You)' : ''}</Text>
                  {p.is_host && <Text style={styles.hostBadge}>HOST</Text>}
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>

        {/* Bottom Action Area */}
        <View style={styles.footer}>
          {isHost ? (
            <Pressable
              style={({ pressed }) => [styles.cta, (pressed || !canStart) && styles.pressed]}
              onPress={handleStartGame}
              disabled={!canStart}
            >
              <View style={styles.ctaInner}>
                <GradientFill colors={canStart ? gradients.button : [colors.surfaceAlt, colors.surfaceAlt]} />
                <Text style={[styles.ctaText, !canStart && { color: colors.textFaint }]}>
                  {canStart ? 'Start Game' : 'Waiting for players...'}
                </Text>
              </View>
            </Pressable>
          ) : seated ? (
            <Animated.View style={[styles.waitingBox, pulseStyle]}>
              <ActivityIndicator color={colors.blue} style={{ marginRight: 8 }} />
              <Text style={styles.waitingText}>Waiting for host to start...</Text>
            </Animated.View>
          ) : (
            <View style={styles.waitingBox}>
              <Text style={styles.waitingText}>Room is full — you're watching, not playing.</Text>
            </View>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  backBtn: { padding: space.xs },
  backText: { fontFamily: font.bold, fontSize: 14, color: colors.textFaint },
  gameKind: { fontFamily: font.extrabold, fontSize: 16, color: colors.text, letterSpacing: 1 },

  content: { padding: space.lg, gap: space.xl, paddingBottom: 48 },

  cardContainer: { position: 'relative', width: '100%', alignItems: 'center' },
  codeCard: {
    width: '100%', minHeight: 280, backgroundColor: colors.surface, padding: space.xl,
    borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: 'rgba(59,157,231,0.2)',
  },
  qrCard: { justifyContent: 'space-between', paddingVertical: space.xl },
  shareBadge: {
    position: 'absolute', top: space.md, right: space.md,
    padding: 10, backgroundColor: 'rgba(59,157,231,0.15)', borderRadius: radius.pill,
  },
  codeLabel: { fontFamily: font.black, fontSize: 13, color: colors.blue, textTransform: 'uppercase', letterSpacing: 2, marginBottom: space.xs },
  codeValue: { fontFamily: font.display, fontSize: 56, color: colors.text, letterSpacing: 8, marginBottom: space.lg },
  qrWrapper: { padding: space.md, backgroundColor: colors.white, borderRadius: radius.lg },
  qrFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
  qrFooterText: { fontFamily: font.bold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  cardActionsRow: { flexDirection: 'row', gap: space.md, width: '100%', marginTop: 'auto' },
  cardBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg },
  cardBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  playersSection: { gap: space.md },
  sectionHeader: { fontFamily: font.extrabold, fontSize: 16, color: colors.text, marginBottom: space.xs },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, gap: space.md,
  },
  playerRowMe: { borderColor: colors.blue, backgroundColor: 'rgba(46,126,240,0.05)' },
  playerAvatarWrap: { width: 36, height: 36 },
  presenceDot: {
    position: 'absolute', bottom: -1, right: -1, width: 11, height: 11,
    borderRadius: 6, borderWidth: 2, borderColor: colors.bg,
  },
  playerName: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.text },
  hostBadge: { fontFamily: font.bold, fontSize: 10, color: colors.blue, letterSpacing: 1, backgroundColor: 'rgba(46,126,240,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },

  settingsSection: {
    backgroundColor: colors.surface, padding: space.lg, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.hairline, gap: space.lg, ...shadow.card,
  },
  rulesContainer: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space.sm },
  ruleItem: { flex: 1, alignItems: 'center', paddingVertical: space.sm },
  ruleLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  ruleValue: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  guestSettingsNote: { fontFamily: font.semibold, fontSize: 12, color: colors.textFaint, textAlign: 'center', fontStyle: 'italic', marginTop: 4 },

  footer: { padding: space.lg, paddingTop: 0, paddingBottom: space.xl },
  cta: { borderRadius: radius.xl, overflow: 'hidden', ...shadow.blueGlow },
  ctaInner: { paddingVertical: 18, alignItems: 'center' },
  ctaText: { fontFamily: font.extrabold, fontSize: 18, color: colors.white, letterSpacing: 0.5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },

  waitingBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, backgroundColor: colors.surface,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.hairline,
  },
  waitingText: { fontFamily: font.semibold, fontSize: 16, color: colors.textMuted },
});
