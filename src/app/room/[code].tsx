import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { Easing, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

export default function RoomLobby() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);

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
          router.replace({ pathname: '/game/[id]', params: { id: payload.new.game_kind, roomCode: code } });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomSub);
    };
  }, [code, session]);

  useEffect(() => {
    if (!room) return;
    const playersSub = supabase
      .channel(`players_${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${room.id}` }, () => {
        fetchPlayers(room.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(playersSub);
    };
  }, [room]);

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
    setLoading(false);

    if (roomData.status === 'active') {
      router.replace({ pathname: '/game/[id]', params: { id: roomData.game_kind, roomCode: code } });
    }
  };

  const fetchPlayers = async (roomId: string) => {
    const { data } = await supabase
      .from('room_players')
      .select('*, profiles(username)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (data) setPlayers(data);
  };

  const handleStartGame = async () => {
    if (!room || !canStart) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Host sets room active in DB via RPC to bypass RLS restrictions
    const { error } = await supabase.rpc('start_room', { p_room: room.id });
    if (error) {
      Alert.alert('Error starting game', error.message);
      return;
    }

    // Host navigates
    router.replace({ pathname: '/game/[id]', params: { id: room.game_kind, roomCode: code } });
  };

  const handleToggleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextState = !isFlipped;
    setIsFlipped(nextState);
    flipAnim.value = withTiming(nextState ? 1 : 0, { duration: 400 });
  };

  const handleCopy = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied!', 'Room code copied to clipboard.');
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Join my Xantle game! The room code is: ${code}`,
        title: 'Xantle Room Code',
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
          <Pressable onPress={() => router.replace('/home')} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.gameKind}>{room.game_kind.toUpperCase()}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>

          {/* Flippable Room Code Banner */}
          <View style={styles.cardContainer}>
            <Animated.View style={[styles.codeCard, frontAnimatedStyle]}>
              <Pressable style={styles.shareBadge} onPress={handleShare}>
                <FontAwesome name="share" size={12} color={colors.white} />
              </Pressable>

              <Text style={styles.codeLabel}>ROOM CODE</Text>
              <Text style={styles.codeValue}>{code}</Text>

              <View style={styles.cardActionsRow}>
                <Pressable style={styles.cardBtn} onPress={handleCopy}>
                  <FontAwesome name="copy" size={16} color={colors.blue} />
                  <Text style={styles.cardBtnText}>Copy Code</Text>
                </Pressable>
                <Pressable style={styles.cardBtn} onPress={handleToggleFlip}>
                  <FontAwesome name="qrcode" size={16} color={colors.cyan} />
                  <Text style={styles.cardBtnText}>Show QR</Text>
                </Pressable>
              </View>
            </Animated.View>

            <Animated.View style={[styles.codeCard, styles.qrCard, backAnimatedStyle]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleToggleFlip} />
              <Text style={styles.codeLabel}>SCAN TO JOIN</Text>
              <View style={styles.qrWrapper}>
                <QRCode value={code} size={150} color={colors.bg} backgroundColor={colors.white} />
              </View>
              <View pointerEvents="none" style={styles.qrFooterRow}>
                <FontAwesome name="refresh" size={12} color={colors.textMuted} />
                <Text style={styles.qrFooterText}>Tap to flip</Text>
              </View>
            </Animated.View>
          </View>

          {/* Read-Only Rules Section */}
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
                <Text style={styles.ruleValue}>{room.state?.rounds || 12}</Text>
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

          {/* Players List */}
          <View style={styles.playersSection}>
            <Text style={styles.sectionHeader}>Players ({players.length}/{room.max_players})</Text>
            {players.map((p, i) => {
              const displayName = p.display_name || p.profiles?.username || 'Guest';
              const isMe = p.user_id === session?.user.id;
              return (
                <Animated.View
                  key={p.id}
                  entering={FadeInDown.springify().damping(14).stiffness(90).delay(i * 100)}
                  style={[styles.playerRow, isMe && styles.playerRowMe]}
                >
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarLetter}>{displayName[0].toUpperCase()}</Text>
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
          ) : (
            <Animated.View style={[styles.waitingBox, pulseStyle]}>
              <ActivityIndicator color={colors.blue} style={{ marginRight: 8 }} />
              <Text style={styles.waitingText}>Waiting for host to start...</Text>
            </Animated.View>
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
    borderColor: 'rgba(59,157,231,0.2)'
  },
  qrCard: { justifyContent: 'space-between', paddingVertical: space.xl },
  shareBadge: { position: 'absolute', top: space.md, right: space.md, padding: 8, backgroundColor: 'rgba(59,157,231,0.1)', borderRadius: radius.pill },
  codeLabel: { fontFamily: font.black, fontSize: 13, color: colors.blue, textTransform: 'uppercase', letterSpacing: 2, marginBottom: space.xs },
  codeValue: { fontFamily: font.display, fontSize: 56, color: colors.text, letterSpacing: 8, marginBottom: space.lg },
  qrWrapper: { padding: space.md, backgroundColor: colors.white, borderRadius: radius.lg },
  qrFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
  qrFooterText: { fontFamily: font.bold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  cardActionsRow: { flexDirection: 'row', gap: space.md, width: '100%', marginTop: 'auto' },
  cardBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg },
  cardBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  playersSection: { gap: space.md },
  sectionHeader: { fontFamily: font.extrabold, fontSize: 16, color: colors.text, marginBottom: space.xs },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, gap: space.md,
  },
  playerRowMe: { borderColor: colors.blue, backgroundColor: 'rgba(46,126,240,0.05)' },
  playerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  playerAvatarLetter: { fontFamily: font.bold, fontSize: 16, color: colors.textMuted },
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
  pressedCard: { transform: [{ scale: 0.98 }], opacity: 0.95 },

  waitingBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, backgroundColor: colors.surface,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.hairline,
  },
  waitingText: { fontFamily: font.semibold, fontSize: 16, color: colors.textMuted },
});
