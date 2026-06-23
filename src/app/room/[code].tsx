import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, withRepeat, withSequence, withTiming, useSharedValue, useAnimatedStyle, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space } from '../../theme';
import { GradientFill } from '../../components/GradientFill';

export default function RoomLobby() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => {
    if (!code || !session) return;
    fetchRoomAndPlayers();

    const roomSub = supabase
      .channel(`room_${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (payload) => {
        setRoom(payload.new);
        if (payload.new.status === 'active') {
          router.replace({ pathname: `/game/${payload.new.game_kind}`, params: { roomCode: code } });
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
      router.replace({ pathname: `/game/${roomData.game_kind}`, params: { roomCode: code } });
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const { error } = await supabase.rpc('start_room', { p_room: room.id });
    if (error) {
      Alert.alert('Error starting game', error.message);
    }
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

  const isHost = room.host_id === session?.user.id;
  const canStart = isHost && players.length >= 2;

  // Pulse animation for waiting text
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    if (!isHost) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [isHost]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

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
          
          {/* Room Code Banner */}
          <Pressable 
            style={({ pressed }) => [styles.codeCard, pressed && styles.pressedCard]} 
            onPress={handleShare}
          >
            <View style={styles.shareBadge}>
              <FontAwesome name="share" size={12} color={colors.white} />
              <Text style={styles.shareText}>SHARE</Text>
            </View>
            <Text style={styles.codeLabel}>ROOM CODE</Text>
            <Text style={styles.codeValue}>{code}</Text>
            <Text style={styles.codeSub}>Tap to share code with friends</Text>
          </Pressable>

          {/* Players List */}
          <View style={styles.playersSection}>
            <Text style={styles.playersHeader}>Players ({players.length}/{room.max_players})</Text>
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
  
  content: { padding: space.lg, gap: space.xl },
  
  codeCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: space.xl,
    paddingTop: space.xl + space.md,
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.hairline,
    ...shadow.card,
  },
  shareBadge: {
    position: 'absolute', top: space.md, right: space.md,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm,
  },
  shareText: { fontFamily: font.bold, fontSize: 10, color: colors.white, letterSpacing: 1 },
  codeLabel: { fontFamily: font.extrabold, fontSize: 12, color: colors.blue, letterSpacing: 2 },
  codeValue: { fontFamily: font.display, fontSize: 56, color: colors.white, letterSpacing: 12, marginVertical: space.sm },
  codeSub: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted },

  playersSection: { gap: space.sm },
  playersHeader: { fontFamily: font.bold, fontSize: 18, color: colors.text, marginBottom: space.xs },
  
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.hairline,
  },
  playerRowMe: {
    borderColor: 'rgba(46, 126, 240, 0.3)',
    backgroundColor: 'rgba(46, 126, 240, 0.05)',
  },
  playerAvatar: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    marginRight: space.md,
  },
  playerAvatarLetter: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  playerName: { flex: 1, fontFamily: font.bold, fontSize: 16, color: colors.text },
  hostBadge: { fontFamily: font.bold, fontSize: 10, color: colors.blue, backgroundColor: 'rgba(46,126,240,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },

  footer: { padding: space.lg, paddingBottom: space.xl },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaInner: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
  pressedCard: { transform: [{ scale: 0.98 }], opacity: 0.95 },

  waitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.hairline,
  },
  waitingText: { fontFamily: font.bold, fontSize: 16, color: colors.textMuted },
});
