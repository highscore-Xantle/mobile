import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, SlideInUp,
  useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
import { NumberKeypad } from '../../components/NumberKeypad';
import { RoundScoreboard } from '../../components/RoundScoreboard';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_ROUNDS = 12;
const PICK_SECONDS = 30;

function getDifficulty(round: number): 'easy' | 'medium' | 'hard' {
  if (round <= 6) return 'easy';
  if (round <= 10) return 'medium';
  return 'hard';
}

function getMaxDecimalPlaces(diff: 'easy' | 'medium' | 'hard') {
  if (diff === 'easy') return 0;
  if (diff === 'medium') return 1;
  return 2;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'picking' | 'guessing' | 'round_end' | 'game_over';

interface GuessEntry {
  value: string;
  hint: 'higher' | 'lower' | 'correct';
}

interface GameState {
  round: number;
  phase: Phase;
  mySecret: string | null;
  opponentSecretRevealed: string | null; // only set at round_end
  myGuesses: GuessEntry[];
  myScore: number;
  opponentScore: number;
  winner: 'me' | 'opponent' | 'draw' | null;
}

// ─── Screen shake animation hook ─────────────────────────────────────────────
function useShake() {
  const translateX = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const shake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    translateX.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  };
  return { style, shake };
}

// ─── Countdown timer ─────────────────────────────────────────────────────────
function Countdown({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) { onExpire(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);
  const pct = remaining / seconds;
  const color = pct > 0.5 ? colors.success : pct > 0.25 ? colors.warning : colors.danger;
  return (
    <View style={cdStyles.wrap}>
      <Text style={[cdStyles.text, { color }]}>{remaining}</Text>
      <View style={cdStyles.track}>
        <View style={[cdStyles.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}
const cdStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  text: { fontFamily: font.display, fontSize: 28 },
  track: { width: 120, height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});

// ─── Hint badge ───────────────────────────────────────────────────────────────
function HintBadge({ hint }: { hint: 'higher' | 'lower' | 'correct' }) {
  const config = {
    higher: { label: '↑ Higher', bg: 'rgba(59,157,231,0.15)', color: colors.blue },
    lower: { label: '↓ Lower', bg: 'rgba(248,113,113,0.15)', color: colors.danger },
    correct: { label: '✓ Correct!', bg: 'rgba(74,222,128,0.15)', color: colors.success },
  }[hint];
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(12)}
      style={[hintStyles.badge, { backgroundColor: config.bg }]}
    >
      <Text style={[hintStyles.text, { color: config.color }]}>{config.label}</Text>
    </Animated.View>
  );
}
const hintStyles = StyleSheet.create({
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, alignSelf: 'center' },
  text: { fontFamily: font.extrabold, fontSize: 14 },
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NumberDuel() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { style: shakeStyle, shake } = useShake();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [myName, setMyName] = useState('You');
  const [opponentName, setOpponentName] = useState('Opponent');
  const [isHost, setIsHost] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [state, setState] = useState<GameState>({
    round: 1, phase: 'picking',
    mySecret: null, opponentSecretRevealed: null,
    myGuesses: [], myScore: 0, opponentScore: 0, winner: null,
  });

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const diff = getDifficulty(state.round);
  const allowDecimal = diff !== 'easy';

  // ── Initial room fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode || !session) return;
    (async () => {
      const { data: room } = await supabase
        .from('rooms').select('id, host_id').eq('code', roomCode).single();
      if (!room) { Alert.alert('Room not found'); router.replace('/home'); return; }

      const { data: players } = await supabase
        .from('room_players')
        .select('user_id, display_name, profiles(username)')
        .eq('room_id', room.id);

      setRoomId(room.id);
      const me = players?.find((p: any) => p.user_id === session.user.id);
      const opp = players?.find((p: any) => p.user_id !== session.user.id);
      setMyName(me?.display_name || (me?.profiles as any)?.username || 'You');
      setOpponentName(opp?.display_name || (opp?.profiles as any)?.username || 'Opponent');
      setIsHost(room.host_id === session.user.id);
      setLoading(false);
    })();
  }, [roomCode, session]);

  // ── Realtime channel ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;
    const ch = supabase.channel(`game_live_${roomCode}`);
    ch.on('broadcast', { event: 'guess_result' }, ({ payload }) => {
      // Only process opponent's guess results
      if (payload.userId === session?.user.id) return;
      // We don't show opponent's guesses to the player (fairness),
      // but we update the live broadcast for viewers
    })
    .on('broadcast', { event: 'round_end' }, ({ payload }) => {
      setState(prev => ({
        ...prev,
        phase: 'round_end',
        opponentSecretRevealed: payload.opponentSecret,
        myScore: payload.scores[session?.user.id ?? ''] ?? prev.myScore,
        opponentScore: Object.entries(payload.scores)
          .find(([k]) => k !== session?.user.id)?.[1] as number ?? prev.opponentScore,
      }));
    })
    .on('broadcast', { event: 'game_over' }, ({ payload }) => {
      const myScore = payload.scores[session?.user.id ?? ''] ?? 0;
      const oppScore = Object.values(payload.scores).find((v, i) =>
        Object.keys(payload.scores)[i] !== session?.user.id
      ) as number ?? 0;
      setState(prev => ({
        ...prev, phase: 'game_over',
        myScore, opponentScore: oppScore,
        winner: myScore > oppScore ? 'me' : oppScore > myScore ? 'opponent' : 'draw',
      }));
    })
    .on('broadcast', { event: 'next_round' }, ({ payload }) => {
      setState(prev => ({
        ...prev, phase: 'picking',
        round: payload.round,
        mySecret: null, opponentSecretRevealed: null,
        myGuesses: [],
      }));
      setInputValue('');
    })
    .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [roomCode, session]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleLockSecret = async () => {
    if (!inputValue || !roomId) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Store secret via RPC (server holds the secret, never sent to opponent)
    const { error } = await supabase.rpc('set_player_secret', {
      p_room_id: roomId,
      p_secret: parseFloat(inputValue),
    });
    if (error) { Alert.alert('Error', error.message); setSubmitting(false); return; }
    setState(prev => ({ ...prev, mySecret: inputValue, phase: 'guessing' }));
    setInputValue('');
    setSubmitting(false);
  };

  const handleAutoSecret = () => {
    const d = getDifficulty(state.round);
    let val: string;
    if (d === 'easy') val = String(Math.floor(Math.random() * 101));
    else if (d === 'medium') val = (Math.random() * 100).toFixed(1);
    else val = (Math.random() * 100).toFixed(2);
    setInputValue(val);
  };

  const handleSubmitGuess = async () => {
    if (!inputValue || !roomId) return;
    const guess = parseFloat(inputValue);
    setSubmitting(true);
    const { data, error } = await supabase.rpc('submit_guess', {
      p_room_id: roomId,
      p_guess: guess,
    });
    setSubmitting(false);
    setInputValue('');

    if (error) { Alert.alert('Error', error.message); return; }

    const hint: 'higher' | 'lower' | 'correct' = data.hint;
    Haptics.impactAsync(
      hint === 'correct' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
    );
    if (hint !== 'correct') shake();

    // Broadcast for viewers (no secret info)
    channelRef.current?.send({
      type: 'broadcast', event: 'guess_result',
      payload: { userId: session?.user.id, guess: inputValue, hint },
    });

    setState(prev => ({
      ...prev,
      myGuesses: [{ value: inputValue, hint }, ...prev.myGuesses],
    }));
  };

  const handleNextRound = () => {
    if (!isHost) return;
    const nextRound = state.round + 1;
    channelRef.current?.send({
      type: 'broadcast', event: 'next_round',
      payload: { round: nextRound },
    });
    setState(prev => ({
      ...prev, phase: 'picking', round: nextRound,
      mySecret: null, opponentSecretRevealed: null, myGuesses: [],
    }));
    setInputValue('');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <GradientFill colors={gradients.background} />
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/home')} style={styles.backBtn}>
            <Text style={styles.backText}>← Exit</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Number Duel</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Scoreboard */}
        <View style={styles.scoreboardWrap}>
          <RoundScoreboard
            round={state.round}
            totalRounds={TOTAL_ROUNDS}
            scoreA={state.myScore}
            scoreB={state.opponentScore}
            nameA={myName}
            nameB={opponentName}
            difficulty={diff}
          />
        </View>

        <Animated.View style={[styles.gameArea, shakeStyle]}>
          {/* ── PICKING PHASE ── */}
          {state.phase === 'picking' && (
            <Animated.View entering={FadeIn} style={styles.phase}>
              <Text style={styles.phaseTitle}>Pick your secret number</Text>
              <Text style={styles.phaseSub}>
                {diff === 'easy' ? 'Whole numbers only (0–100)' :
                 diff === 'medium' ? '1 decimal place (e.g. 42.5)' :
                 '2 decimal places (e.g. 42.75)'}
              </Text>

              <Countdown seconds={PICK_SECONDS} onExpire={handleAutoSecret} />

              <View style={styles.display}>
                <Text style={styles.displayText}>{inputValue || '—'}</Text>
              </View>

              <NumberKeypad
                value={inputValue}
                onChange={setInputValue}
                allowDecimal={allowDecimal}
                maxLength={7}
              />

              <Pressable
                style={({ pressed }) => [styles.cta, (!inputValue || submitting) && styles.ctaDisabled, pressed && styles.pressed]}
                onPress={handleLockSecret}
                disabled={!inputValue || submitting}
              >
                <GradientFill colors={gradients.button} />
                <Text style={styles.ctaText}>{submitting ? 'Locking in…' : 'Lock In 🔒'}</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* ── GUESSING PHASE ── */}
          {state.phase === 'guessing' && (
            <Animated.View entering={FadeIn} style={styles.phase}>
              <View style={styles.secretLocked}>
                <Text style={styles.secretLockedLabel}>YOUR SECRET</Text>
                <Text style={styles.secretLockedValue}>{state.mySecret}</Text>
              </View>

              <Text style={styles.phaseTitle}>Guess their number</Text>

              {state.myGuesses.length > 0 && (
                <ScrollView style={styles.historyScroll} contentContainerStyle={{ gap: 8 }}>
                  {state.myGuesses.map((g, i) => (
                    <View key={i} style={styles.historyRow}>
                      <Text style={styles.historyValue}>{g.value}</Text>
                      <HintBadge hint={g.hint} />
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={styles.display}>
                <Text style={styles.displayText}>{inputValue || '—'}</Text>
              </View>

              <NumberKeypad
                value={inputValue}
                onChange={setInputValue}
                allowDecimal={allowDecimal}
                maxLength={7}
              />

              <Pressable
                style={({ pressed }) => [styles.cta, (!inputValue || submitting) && styles.ctaDisabled, pressed && styles.pressed]}
                onPress={handleSubmitGuess}
                disabled={!inputValue || submitting}
              >
                <GradientFill colors={gradients.button} />
                <Text style={styles.ctaText}>{submitting ? 'Checking…' : 'Guess →'}</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* ── ROUND END OVERLAY ── */}
          {state.phase === 'round_end' && (
            <Animated.View entering={SlideInUp.springify().damping(14)} style={styles.overlay}>
              <Text style={styles.overlayTitle}>Round {state.round} Over!</Text>
              <View style={styles.revealRow}>
                <View style={styles.revealCard}>
                  <Text style={styles.revealLabel}>Your secret</Text>
                  <Text style={styles.revealValue}>{state.mySecret}</Text>
                </View>
                <View style={[styles.revealCard, { borderColor: 'rgba(59,157,231,0.4)' }]}>
                  <Text style={styles.revealLabel}>Their secret</Text>
                  <Text style={[styles.revealValue, { color: colors.cyan }]}>{state.opponentSecretRevealed}</Text>
                </View>
              </View>
              <Text style={styles.scoreLabel}>
                {myName} {state.myScore} — {state.opponentScore} {opponentName}
              </Text>
              {state.round < TOTAL_ROUNDS ? (
                isHost ? (
                  <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={handleNextRound}>
                    <GradientFill colors={gradients.button} />
                    <Text style={styles.ctaText}>Next Round →</Text>
                  </Pressable>
                ) : (
                  <View style={styles.waitingRow}>
                    <ActivityIndicator color={colors.blue} />
                    <Text style={styles.waitingText}>Waiting for host...</Text>
                  </View>
                )
              ) : null}
            </Animated.View>
          )}

          {/* ── GAME OVER ── */}
          {state.phase === 'game_over' && (
            <Animated.View entering={FadeInUp.springify()} style={styles.overlay}>
              <Text style={styles.trophyEmoji}>
                {state.winner === 'me' ? '🏆' : state.winner === 'draw' ? '🤝' : '😔'}
              </Text>
              <Text style={styles.overlayTitle}>
                {state.winner === 'me' ? 'You Win!' : state.winner === 'draw' ? "It's a Draw!" : `${opponentName} Wins!`}
              </Text>
              <Text style={styles.finalScore}>
                Final Score: {state.myScore} — {state.opponentScore}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
                onPress={() => router.replace('/home')}
              >
                <GradientFill colors={gradients.button} />
                <Text style={styles.ctaText}>Back to Home</Text>
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>

      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.sm,
  },
  backBtn: { padding: space.xs },
  backText: { fontFamily: font.bold, fontSize: 14, color: colors.textFaint },
  headerTitle: { fontFamily: font.display, fontSize: 18, color: colors.text },
  scoreboardWrap: { paddingHorizontal: space.lg, marginBottom: space.md },
  gameArea: { flex: 1, paddingHorizontal: space.lg },

  phase: { flex: 1, gap: space.md },
  phaseTitle: { fontFamily: font.black, fontSize: 22, color: colors.text, textAlign: 'center' },
  phaseSub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  display: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg,
    alignItems: 'center', borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  displayText: { fontFamily: font.display, fontSize: 42, color: colors.text, letterSpacing: 6 },

  secretLocked: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: 'rgba(46,126,240,0.08)', padding: space.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(46,126,240,0.2)',
  },
  secretLockedLabel: { fontFamily: font.bold, fontSize: 11, color: colors.blue, letterSpacing: 1 },
  secretLockedValue: { fontFamily: font.display, fontSize: 22, color: colors.text },

  historyScroll: { maxHeight: 130 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.sm },
  historyValue: { fontFamily: font.bold, fontSize: 18, color: colors.text, width: 80 },

  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, textAlign: 'center', paddingVertical: 18 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },

  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg,
    backgroundColor: colors.bg, borderRadius: radius.xl, padding: space.xl,
    borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  overlayTitle: { fontFamily: font.black, fontSize: 28, color: colors.text, textAlign: 'center' },
  revealRow: { flexDirection: 'row', gap: space.md, width: '100%' },
  revealCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md,
    alignItems: 'center', borderWidth: 1, borderColor: colors.hairline,
  },
  revealLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textFaint, letterSpacing: 1, marginBottom: 4 },
  revealValue: { fontFamily: font.display, fontSize: 32, color: colors.text },
  scoreLabel: { fontFamily: font.extrabold, fontSize: 16, color: colors.textMuted },
  waitingRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  waitingText: { fontFamily: font.semibold, fontSize: 15, color: colors.textMuted },
  trophyEmoji: { fontSize: 72 },
  finalScore: { fontFamily: font.bold, fontSize: 18, color: colors.textMuted },
});
