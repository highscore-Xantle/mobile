import { useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown, FadeOutUp,
  useAnimatedStyle, useSharedValue,
  withTiming, withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Comment { id: string; username: string; text: string; }
interface GuessEvent { username: string; guess: string; hint: 'higher' | 'lower' | 'correct'; }
interface FloatingReaction { id: string; emoji: string; x: number; }

const QUICK_REACTIONS = ['❤️', '🔥', '😱', '👏'];

// ─── Floating Reaction ────────────────────────────────────────────────────────
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

// ─── Hint chip ────────────────────────────────────────────────────────────────
function HintChip({ hint }: { hint: 'higher' | 'lower' | 'correct' }) {
  const cfg = {
    higher: { label: '↑', color: colors.blue },
    lower: { label: '↓', color: colors.danger },
    correct: { label: '✓', color: colors.success },
  }[hint];
  return (
    <View style={[hintStyles.chip, { backgroundColor: cfg.color + '22' }]}>
      <Text style={[hintStyles.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}
const hintStyles = StyleSheet.create({
  chip: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: font.extrabold, fontSize: 14 },
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NumberDuelViewer() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const router = useRouter();
  const { session } = useSession();

  const [viewerCount, setViewerCount] = useState(0);
  const [playerA, setPlayerA] = useState({ name: 'Player 1', score: 0 });
  const [playerB, setPlayerB] = useState({ name: 'Player 2', score: 0 });
  const [round, setRound] = useState(1);
  const [revealA, setRevealA] = useState<string | null>(null);
  const [revealB, setRevealB] = useState<string | null>(null);
  const [guessEvents, setGuessEvents] = useState<GuessEvent[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [commentInput, setCommentInput] = useState('');

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const commentsRef = useRef<FlatList>(null);

  const username = (session?.user?.user_metadata?.username as string) ?? session?.user?.email ?? 'Viewer';

  // ── Presence + channel ────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode || !session) return;

    const ch = supabase.channel(`game_live_${roomCode}`, {
      config: { presence: { key: session.user.id } },
    });

    // Live guess events (no secrets during guessing phase)
    ch.on('broadcast', { event: 'guess_result' }, ({ payload }) => {
      setGuessEvents(prev => [{
        username: payload.username ?? 'Player',
        guess: payload.guess,
        hint: payload.hint,
      }, ...prev].slice(0, 30));
    });

    // Secrets only revealed at round end
    ch.on('broadcast', { event: 'round_end' }, ({ payload }) => {
      setRevealA(payload.secretA);
      setRevealB(payload.secretB);
      setRound(payload.nextRound ?? round + 1);
    });

    ch.on('broadcast', { event: 'next_round' }, ({ payload }) => {
      setRevealA(null);
      setRevealB(null);
      setRound(payload.round);
      setGuessEvents([]);
    });

    // Viewer comments
    ch.on('broadcast', { event: 'viewer_comment' }, ({ payload }) => {
      setComments(prev => [...prev, {
        id: Date.now().toString(),
        username: payload.username,
        text: payload.text,
      }].slice(-50));
      setTimeout(() => commentsRef.current?.scrollToEnd({ animated: true }), 100);
    });

    // Viewer reactions
    ch.on('broadcast', { event: 'viewer_reaction' }, ({ payload }) => {
      const id = Date.now().toString() + Math.random();
      const x = 20 + Math.random() * 200;
      setFloatingReactions(prev => [...prev, { id, emoji: payload.emoji, x }]);
    });

    // Viewer count via presence
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

  // ── Send comment ──────────────────────────────────────────────────────────
  const sendComment = () => {
    if (!commentInput.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    channelRef.current?.send({
      type: 'broadcast', event: 'viewer_comment',
      payload: { username, text: commentInput.trim() },
    });
    setCommentInput('');
  };

  // ── Send reaction ─────────────────────────────────────────────────────────
  const sendReaction = (emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    channelRef.current?.send({
      type: 'broadcast', event: 'viewer_reaction',
      payload: { username, emoji },
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />

        {/* Floating reactions layer */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {floatingReactions.map(r => (
            <FloatingEmoji
              key={r.id} emoji={r.emoji} x={r.x}
              onDone={() => setFloatingReactions(prev => prev.filter(f => f.id !== r.id))}
            />
          ))}
        </View>

        <SafeAreaView style={styles.safe}>

          {/* ── Header ── */}
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

          {/* ── Player cards ── */}
          <View style={styles.playerCards}>
            {[
              { player: playerA, reveal: revealA },
              { player: playerB, reveal: revealB },
            ].map(({ player, reveal }, i) => (
              <View key={i} style={styles.playerCard}>
                <Text style={styles.playerCardName} numberOfLines={1}>{player.name}</Text>
                <Text style={styles.playerCardScore}>{player.score}</Text>
                {/* Secret: only shown after round ends */}
                <View style={styles.secretBox}>
                  <Text style={styles.secretBoxLabel}>SECRET</Text>
                  <Text style={[styles.secretBoxValue, !reveal && { color: colors.textFaint }]}>
                    {reveal ?? '???'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Round indicator ── */}
          <View style={styles.roundRow}>
            <Text style={styles.roundText}>Round {round} of 12</Text>
            {revealA && <Text style={styles.revealNote}>Round ended — secrets revealed!</Text>}
          </View>

          {/* ── Live guess feed ── */}
          <View style={styles.guessFeed}>
            <Text style={styles.feedTitle}>Live Guesses</Text>
            <FlatList
              data={guessEvents}
              keyExtractor={(_, i) => i.toString()}
              renderItem={({ item }) => (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.guessRow}>
                  <Text style={styles.guessUsername}>{item.username}</Text>
                  <Text style={styles.guessValue}>{item.guess}</Text>
                  <HintChip hint={item.hint} />
                </Animated.View>
              )}
              style={styles.guessList}
              contentContainerStyle={{ gap: 6 }}
              showsVerticalScrollIndicator={false}
            />
          </View>

          {/* ── Comments strip ── */}
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

          {/* ── Bottom input ── */}
          <View style={styles.bottomBar}>
            {/* Quick reactions */}
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

            {/* Comment input */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
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
  secretBox: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', marginTop: 4,
  },
  secretBoxLabel: { fontFamily: font.extrabold, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5 },
  secretBoxValue: { fontFamily: font.display, fontSize: 20, color: colors.cyan },

  roundRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.lg, marginBottom: space.sm,
  },
  roundText: { fontFamily: font.extrabold, fontSize: 13, color: colors.textFaint, letterSpacing: 0.5 },
  revealNote: { fontFamily: font.semibold, fontSize: 12, color: colors.success },

  guessFeed: { flex: 1, paddingHorizontal: space.lg },
  feedTitle: { fontFamily: font.bold, fontSize: 14, color: colors.textMuted, marginBottom: 6 },
  guessList: { flex: 1 },
  guessRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
  },
  guessUsername: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted, flex: 1 },
  guessValue: { fontFamily: font.display, fontSize: 18, color: colors.text },

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
