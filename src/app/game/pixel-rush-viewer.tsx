import { useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle, useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
import PixelBoard from '../../components/PixelBoard';
import {
  DEFAULT_PUZZLE_IMAGE, gridForRound, playerLabel, seedFor, useGame,
} from '../../lib/usePixelGame';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

interface Comment { id: string; username: string; text: string; }
interface FloatingReaction { id: string; emoji: string; x: number; }

const QUICK_REACTIONS = ['❤️', '🔥', '😱', '👏'];

// ─── Floating Reaction (same pattern as the Number Duel viewer) ──────────────
function FloatingEmoji({ emoji, x, onDone }: { emoji: string; x: number; onDone: () => void }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withTiming(-220, { duration: 2000 });
    opacity.value = withTiming(0, { duration: 2000 });
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
    position: 'absolute',
    bottom: 80,
    left: x,
  }));

  return <Animated.Text style={[style, { fontSize: 28 }]}>{emoji}</Animated.Text>;
}

export default function PixelRushViewer() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const router = useRouter();
  const { session } = useSession();

  // Pixel Rush is DB-driven (unlike Number Duel's P2P broadcast), so match
  // state — scores, round, board — comes straight from the same realtime hook
  // players use. RLS already allows any authenticated user to read it.
  const { game, players, round, loading } = useGame(roomCode);

  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [commentInput, setCommentInput] = useState('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const commentsRef = useRef<FlatList>(null);

  const username = (session?.user?.user_metadata?.username as string) ?? session?.user?.email ?? 'Viewer';

  // ── Presence + live social layer (comments/reactions only — game state is DB-driven) ──
  useEffect(() => {
    if (!roomCode || !session) return;

    const ch = supabase.channel(`game_live_${roomCode}`, {
      config: { presence: { key: session.user.id } },
    });

    ch.on('broadcast', { event: 'viewer_comment' }, ({ payload }) => {
      setComments(prev => [...prev, {
        id: Date.now().toString(),
        username: payload.username,
        text: payload.text,
      }].slice(-50));
      setTimeout(() => commentsRef.current?.scrollToEnd({ animated: true }), 100);
    });

    ch.on('broadcast', { event: 'viewer_reaction' }, ({ payload }) => {
      const id = Date.now().toString() + Math.random();
      const x = 20 + Math.random() * 200;
      setFloatingReactions(prev => [...prev, { id, emoji: payload.emoji, x }]);
    });

    ch.on('presence', { event: 'sync' }, () => {
      setViewerCount(Object.keys(ch.presenceState()).length);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: session.user.id });
      }
    });

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [roomCode, session]);

  const sendComment = () => {
    if (!commentInput.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    channelRef.current?.send({
      type: 'broadcast', event: 'viewer_comment',
      payload: { username, text: commentInput.trim() },
    });
    setCommentInput('');
  };

  const sendReaction = (emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    channelRef.current?.send({
      type: 'broadcast', event: 'viewer_reaction',
      payload: { username, emoji },
    });
  };

  const roundNo = game?.current_round ?? 1;
  const grid = gridForRound(roundNo);
  const seed = game ? seedFor(game.id, roundNo) : 0;
  const startedAt = round?.started_at ? new Date(round.started_at).getTime() : Date.now();
  const imageUrl = round?.image_url ?? DEFAULT_PUZZLE_IMAGE;
  const showBoard = game?.status === 'active' && round && round.status !== 'awaiting_image';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {floatingReactions.map(r => (
            <FloatingEmoji
              key={r.id} emoji={r.emoji} x={r.x}
              onDone={() => setFloatingReactions(prev => prev.filter(f => f.id !== r.id))}
            />
          ))}
        </View>

        <SafeAreaView style={styles.safe}>

          <View style={styles.header}>
            <Pressable onPress={() => router.replace('/home')} style={styles.backBtn}>
              <Text style={styles.backText}>← Home</Text>
            </Pressable>
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <View style={styles.viewerChip}>
              <Text style={styles.viewerText}>👁 {viewerCount}</Text>
            </View>
          </View>

          {!loading && game && (
            <View style={styles.playerCards}>
              {players.map((p) => (
                <View key={p.id} style={styles.playerCard}>
                  <Text style={styles.playerCardName} numberOfLines={1}>{playerLabel(p)}</Text>
                  <Text style={styles.playerCardScore}>{p.score}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.roundRow}>
            <Text style={styles.roundText}>Round {roundNo} of {game?.rounds_total ?? '—'}</Text>
          </View>

          <View style={styles.boardArea}>
            {showBoard ? (
              <PixelBoard
                image={imageUrl}
                seed={seed}
                grid={grid}
                startedAt={startedAt}
                locked
                onSolve={() => {}}
              />
            ) : (
              <Text style={styles.waitingText}>
                {loading ? 'Loading match…' : 'Waiting for the next round…'}
              </Text>
            )}
          </View>

          <View style={styles.commentStrip}>
            <FlatList
              ref={commentsRef}
              data={comments}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <Text style={styles.commentText} numberOfLines={2}>
                  <Text style={styles.commentUsername}>{item.username} </Text>
                  {item.text}
                </Text>
              )}
              style={{ maxHeight: 80 }}
              showsVerticalScrollIndicator={false}
            />
          </View>

          <View style={styles.bottomBar}>
            <View style={styles.reactionRow}>
              {QUICK_REACTIONS.map(e => (
                <Pressable
                  key={e}
                  onPress={() => sendReaction(e)}
                  style={({ pressed }) => [styles.reactionBtn, pressed && { transform: [{ scale: 1.3 }] }]}
                >
                  <Text style={styles.reactionEmoji}>{e}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Say something…"
                placeholderTextColor={colors.textFaint}
                value={commentInput}
                onChangeText={setCommentInput}
                onSubmitEditing={sendComment}
                returnKeyType="send"
                maxLength={120}
              />
              <Pressable
                style={[styles.sendBtn, !commentInput.trim() && { opacity: 0.4 }]}
                onPress={sendComment}
                disabled={!commentInput.trim()}
              >
                <GradientFill colors={gradients.button} />
                <Text style={styles.sendText}>↑</Text>
              </Pressable>
            </View>
          </View>

        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.sm,
  },
  backBtn: { padding: space.xs },
  backText: { fontFamily: font.bold, fontSize: 14, color: colors.textFaint },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.85)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.white },
  liveText: { fontFamily: font.extrabold, fontSize: 12, color: colors.white, letterSpacing: 1 },
  viewerChip: {
    backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline,
  },
  viewerText: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },

  playerCards: { flexDirection: 'row', paddingHorizontal: space.lg, gap: space.md, marginBottom: space.sm },
  playerCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  playerCardName: { fontFamily: font.bold, fontSize: 14, color: colors.textMuted, maxWidth: 100, textAlign: 'center' },
  playerCardScore: { fontFamily: font.display, fontSize: 34, color: colors.text },

  roundRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.lg, marginBottom: space.sm,
  },
  roundText: { fontFamily: font.extrabold, fontSize: 13, color: colors.textFaint, letterSpacing: 0.5 },

  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  waitingText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted },

  commentStrip: {
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderTopWidth: 1, borderColor: colors.hairline,
  },
  commentText: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  commentUsername: { fontFamily: font.extrabold, color: colors.text },

  bottomBar: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  reactionRow: { flexDirection: 'row', gap: space.md },
  reactionBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  reactionEmoji: { fontSize: 22 },
  inputRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: 12,
    fontFamily: font.semibold, fontSize: 15, color: colors.text,
    borderWidth: 1, borderColor: colors.hairline,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', ...shadow.blueGlow,
  },
  sendText: { fontFamily: font.extrabold, fontSize: 18, color: colors.white },
});
