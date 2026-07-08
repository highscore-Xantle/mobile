import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  BounceIn, FadeIn, FadeInDown, FadeInUp, SlideInUp,
  useAnimatedStyle, useSharedValue,
  withSequence, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { mulberry32, seedFor } from '../../lib/usePixelGame';
import { useSession } from '../../lib/useSession';
import { Confetti } from '../../components/Confetti';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { NumberKeypad } from '../../components/NumberKeypad';
import { RoundScoreboard } from '../../components/RoundScoreboard';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

// ─── Constants ────────────────────────────────────────────────────────────────
const PICK_SECONDS = 30;

type Phase = 'picking' | 'opponent_picking' | 'drama' | 'guessing' | 'round_end' | 'game_over';
type Hint = 'higher' | 'lower' | 'correct' | 'hot' | 'warm' | 'cold' | 'timeout';

interface GuessEntry { value: string; hint: Hint; }

export interface RoundStat {
  round: number;
  winner: 'host' | 'guest' | 'draw';
  winnerName: string;
  secret: number | null;
  guesses: number;
}

interface GameState {
  round: number;
  phase: Phase;
  mySecret: number | null;
  myGuesses: GuessEntry[];
  opponentGuesses: GuessEntry[];   // for live viewer broadcast
  myScore: number;
  opponentScore: number;
  roundWinner: 'me' | 'opponent' | null;
  opponentSecretReveal: number | null; // only set at round_end
  winner: 'me' | 'opponent' | 'draw' | null;
  
  // Stats
  guessTimeSum: number;
  guessCount: number;
  closestMiss: number | null;
  matchHistory: RoundStat[];
}

// ─── Screen shake ─────────────────────────────────────────────────────────────
function useShake() {
  const tx = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const shake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    tx.value = withSequence(
      withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }),
      withTiming(-8,  { duration: 50 }), withTiming(8,  { duration: 50 }),
      withTiming(0,   { duration: 50 }),
    );
  };
  return { style, shake };
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function Countdown({ seconds, onExpire, active = true }: { seconds: number; onExpire: () => void, active?: boolean }) {
  const [rem, setRem] = useState(seconds);
  useEffect(() => {
    if (!active) return;
    if (rem <= 0) { onExpire(); return; }
    const t = setTimeout(() => setRem(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [rem, active]);
  const pct = rem / seconds;
  const col = pct > 0.5 ? colors.success : pct > 0.25 ? colors.warning : colors.danger;
  return (
    <View style={cd.wrap}>
      <Text style={[cd.num, { color: col }]}>{rem}</Text>
      <View style={cd.track}>
        <View style={[cd.fill, { width: `${pct * 100}%` as any, backgroundColor: col }]} />
      </View>
    </View>
  );
}
const cd = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  num:  { fontFamily: font.display, fontSize: 28 },
  track: { width: 120, height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 2 },
});

// ─── Hint badge ───────────────────────────────────────────────────────────────
function HintBadge({ hint }: { hint: Hint }) {
  const cfg = {
    higher:  { label: '↑ Higher',  bg: 'rgba(59,157,231,0.15)',  color: colors.blue },
    lower:   { label: '↓ Lower',   bg: 'rgba(248,113,113,0.15)', color: colors.danger },
    correct: { label: '✓ Correct!',bg: 'rgba(74,222,128,0.15)',  color: colors.success },
    hot:     { label: '🔥 Hot',    bg: 'rgba(248,113,113,0.15)', color: colors.danger },
    warm:    { label: '😅 Warm',   bg: 'rgba(251,191,36,0.15)',  color: colors.warning },
    cold:    { label: '❄️ Cold',   bg: 'rgba(59,157,231,0.15)',  color: colors.blue },
    timeout: { label: '⏱️ Timeout',bg: 'rgba(156,163,175,0.15)', color: colors.textMuted },
  }[hint];
  return (
    <Animated.View entering={FadeInDown.springify().damping(12)}
      style={[hb.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[hb.text, { color: cfg.color }]}>{cfg.label}</Text>
    </Animated.View>
  );
}
const hb = StyleSheet.create({
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, alignSelf: 'center' },
  text:  { fontFamily: font.extrabold, fontSize: 14 },
});

// Distinct salts so the secret / lock-delay / solve-delay draws from the same
// per-round seed don't correlate with each other (same pattern as
// botOpponent.ts's BOT_SEED_SALT for Pixel Rush).
const BOT_SECRET_SALT = 0x1a2b3c4d;
const BOT_LOCK_SALT = 0x9e3779b9;
const BOT_SOLVE_SALT = 0x5bd1e995;

/**
 * Bot's own secret for the round — whole or decimal, matching this round's
 * rules. Seeded off roomId+round (same seedFor Pixel Rush's puzzle shuffle
 * uses) instead of Math.random(), so it's reproducible/verifiable rather than
 * an opaque roll nobody can check after the fact.
 */
function seededBotSecret(roomId: string, round: number, allowDecimal: boolean, isHard: boolean): number {
  const t = mulberry32((seedFor(roomId, round) ^ BOT_SECRET_SALT) >>> 0)();
  if (!allowDecimal) return Math.floor(t * 101);
  return parseFloat((t * 100).toFixed(isHard ? 2 : 1));
}

/** How long the bot "thinks" before locking its secret in, seeded the same way. */
function seededBotLockDelayMs(roomId: string, round: number): number {
  const t = mulberry32((seedFor(roomId, round) ^ BOT_LOCK_SALT) >>> 0)();
  return 3000 + t * 5000;
}

/**
 * How long the bot takes to land on the human's secret. Calibrated against
 * an optimal binary search (~7 guesses for whole 0-100, ~10 for 1 decimal,
 * ~14 for 2 decimals) at a realistic several-seconds-per-guess human pace —
 * short enough to still feel like a real opponent, long enough that a human
 * playing well actually has a shot at winning the round. Seeded, not
 * Math.random() — see seededBotSecret.
 */
function seededBotSolveDelayMs(roomId: string, round: number, allowDecimal: boolean, isHard: boolean): number {
  const base = !allowDecimal ? 32000 : isHard ? 55000 : 42000;
  const t = mulberry32((seedFor(roomId, round) ^ BOT_SOLVE_SALT) >>> 0)();
  return base + t * 15000;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NumberDuel() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();

  const router = useRouter();
  const { session } = useSession();
  const { style: shakeStyle, shake } = useShake();

  const [roomId,        setRoomId]        = useState<string | null>(null);
  const [myName,        setMyName]        = useState('You');
  const [opponentName,  setOpponentName]  = useState('Opponent');
  const [opponentId,    setOpponentId]    = useState<string | null>(null);
  const [isBot,         setIsBot]         = useState(false);
  const [isHost,        setIsHost]        = useState(false);
  const [inputValue,    setInputValue]    = useState('');
  const [loading,       setLoading]       = useState(true);
  const [submitting,    setSubmitting]    = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [shared,        setShared]        = useState(false); // post shared to feed
  const [isEditingShare,setIsEditingShare]= useState(false);
  const [shareText,     setShareText]     = useState('');
  const guessStartTimeRef = useRef<number>(0);
  const botSecretRef = useRef<number | null>(null);
  const botLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botSolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fallback so a dropped player_guess/hint broadcast doesn't leave the CTA stuck
  // on "Waiting…" for the rest of the round (Realtime broadcast is at-most-once).
  const submittingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameRules, setGameRules] = useState({ rounds: 12, difficulty: 'auto', mode: 'classic' });

  const [gs, setGs] = useState<GameState>({
    round: 1, phase: 'picking',
    mySecret: null, myGuesses: [], opponentGuesses: [],
    myScore: 0, opponentScore: 0,
    roundWinner: null, opponentSecretReveal: null, winner: null,
    guessTimeSum: 0, guessCount: 0, closestMiss: null,
    matchHistory: [],
  });

  const chRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const gsRef   = useRef(gs);  // always-current ref for broadcast callbacks
  gsRef.current = gs;

  const allowDecimal = gameRules.difficulty === 'hardcore' || (gameRules.difficulty === 'auto' && gs.round > 6);
  const isHard = gameRules.difficulty === 'hardcore' || (gameRules.difficulty === 'auto' && gs.round > 10);
  const diffDisplay = isHard ? 'hard' : allowDecimal ? 'medium' : 'easy';

  // ── Dynamic Backgrounds ─────────────────────────────────────────────────────
  const bgColors = useSharedValue(gradients.background);
  const updateBgFeedback = (hint: Hint) => {
    if (hint === 'correct') bgColors.value = [colors.success, '#181C25'];
    else if (hint === 'hot' || hint === 'higher' || hint === 'lower') bgColors.value = ['rgba(248,113,113,0.1)', '#181C25'];
    else bgColors.value = gradients.background;
    setTimeout(() => { bgColors.value = gradients.background; }, 500);
  };

  // ── Fetch room ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode || !session) return;
    (async () => {
      const { data: room } = await supabase
        .from('rooms').select('id, host_id, state').eq('code', roomCode).single();
      if (!room) { Alert.alert('Room not found'); router.replace('/home'); return; }

      const { data: players } = await supabase
        .from('room_players')
        .select('user_id, display_name, is_bot, profiles(username)')
        .eq('room_id', room.id);

      setRoomId(room.id);
      
      const hostIsMe = room.host_id === session.user.id;
      setIsHost(hostIsMe);

      // Hydrate rules and state from Database
      if (room.state) {
        setGameRules({
          rounds: room.state.rounds || 12,
          difficulty: room.state.difficulty || 'auto',
          mode: room.state.mode || 'classic'
        });

        // Recover state if resuming
        if (room.state.round) {
          setGs(prev => ({
            ...prev,
            round: room.state.round,
            myScore: hostIsMe ? (room.state.hostScore || 0) : (room.state.guestScore || 0),
            opponentScore: hostIsMe ? (room.state.guestScore || 0) : (room.state.hostScore || 0),
          }));
        }
      }

      const me  = players?.find((p: any) => p.user_id === session.user.id);
      const opp = players?.find((p: any) => p.user_id !== session.user.id);
      setMyName(me?.display_name  || (me?.profiles  as any)?.username || 'You');
      setOpponentName(opp?.display_name || (opp?.profiles as any)?.username || 'Opponent');
      setOpponentId(opp?.user_id ?? null);
      setIsBot(!!(opp as any)?.is_bot);
      setLoading(false);
    })();
  }, [roomCode, session]);

  // ── Sync heartbeat for P2P state ─────────────────────────────────────────
  useEffect(() => {
    if (isBot || !roomCode || !session || gs.phase !== 'picking' && gs.phase !== 'opponent_picking') return;
    const interval = setInterval(() => {
      chRef.current?.send({
        type: 'broadcast', event: 'sync_state',
        payload: { userId: session.user.id, locked: gs.mySecret !== null }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isBot, roomCode, session, gs.phase, gs.mySecret]);

  // ── Bot: lock its own secret after a short "thinking" delay ────────────────
  // Keyed on gs.round (not gs.phase) — the bot's lock timer must survive the
  // human locking first, which flips phase 'picking' -> 'opponent_picking'.
  // Keying on phase would cancel this timer right then (cleanup on every
  // dependency change) and never reschedule it, leaving the game stuck on
  // "Waiting for Xantle Bot" forever.
  useEffect(() => {
    if (!isBot || !roomId) return;
    botSecretRef.current = null;
    const delay = seededBotLockDelayMs(roomId, gs.round);
    botLockTimerRef.current = setTimeout(() => {
      botSecretRef.current = seededBotSecret(roomId, gs.round, allowDecimal, isHard);
      setOpponentReady(true);
      setGs(prev => {
        if (prev.mySecret !== null && prev.phase === 'opponent_picking') return { ...prev, phase: 'drama' };
        return prev;
      });
    }, delay);
    return () => { if (botLockTimerRef.current) clearTimeout(botLockTimerRef.current); };
  }, [isBot, roomId, gs.round, allowDecimal, isHard]);

  // ── Bot: "solve" the human's secret after a delay, unless the human wins first ──
  useEffect(() => {
    if (!isBot || !roomId || gs.phase !== 'guessing') return;
    const delay = seededBotSolveDelayMs(roomId, gs.round, allowDecimal, isHard);
    botSolveTimerRef.current = setTimeout(() => {
      setGs(prev => {
        if (prev.phase !== 'guessing') return prev; // human already won this round
        const nextState = {
          ...prev, opponentScore: prev.opponentScore + 1, roundWinner: 'opponent' as const,
          opponentSecretReveal: botSecretRef.current, phase: 'round_end' as const,
        };
        if (isHost && roomId) {
          supabase.rpc('update_room_state', { p_room: roomId, p_state: {
            ...gameRules, round: nextState.round,
            hostScore: nextState.myScore, guestScore: nextState.opponentScore,
          }});
        }
        return nextState;
      });
    }, delay);
    return () => { if (botSolveTimerRef.current) clearTimeout(botSolveTimerRef.current); };
  }, [isBot, gs.phase, allowDecimal, isHard, isHost, roomId, gameRules]);

  // Clear any pending timers on unmount so they don't fire after navigation.
  useEffect(() => () => {
    if (botLockTimerRef.current) clearTimeout(botLockTimerRef.current);
    if (botSolveTimerRef.current) clearTimeout(botSolveTimerRef.current);
    if (submittingTimerRef.current) clearTimeout(submittingTimerRef.current);
  }, []);

  // ── Drama Phase Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (gs.phase === 'drama') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const t = setTimeout(() => {
        guessStartTimeRef.current = Date.now();
        setGs(prev => ({ ...prev, phase: 'guessing' }));
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [gs.phase]);

  // ── Realtime P2P channel ─────────────────────────────────────────────────
  // Bot matches have no second device to talk to — the bot's behavior is
  // simulated entirely locally above, so this channel is skipped outright.
  useEffect(() => {
    if (isBot || !roomCode || !session) return;

    const ch = supabase.channel(`game_live_${roomCode}`);

    ch.on('broadcast', { event: 'sync_state' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      if (payload.locked && !opponentReady) {
        setOpponentReady(true);
        setGs(prev => {
          if (prev.mySecret !== null && prev.phase === 'opponent_picking') return { ...prev, phase: 'drama' };
          return prev;
        });
      }
    });

    ch.on('broadcast', { event: 'player_locked' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      setOpponentReady(true);
      setGs(prev => {
        if (prev.mySecret !== null && prev.phase === 'opponent_picking') return { ...prev, phase: 'drama' };
        return prev;
      });
    });

    ch.on('broadcast', { event: 'player_guess' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      const secret = gsRef.current.mySecret;
      if (secret === null) return;

      const guess = parseFloat(payload.guess);
      let hint: Hint;
      const dist = Math.abs(guess - secret);
      
      if (gameRules.mode === 'blind_duel') {
        if (dist === 0) hint = 'correct';
        else if (dist <= 5) hint = 'hot';
        else if (dist <= 15) hint = 'warm';
        else hint = 'cold';
      } else {
        if (guess === secret)      hint = 'correct';
        else if (guess < secret)   hint = 'higher';
        else                       hint = 'lower';
      }

      ch.send({ type: 'broadcast', event: 'hint_for_opponent',
        payload: { forUserId: payload.userId, guess: payload.guess, hint, dist } });

      ch.send({ type: 'broadcast', event: 'guess_result',
        payload: { username: payload.username, guess: payload.guess, hint } });

      if (hint === 'correct') {
        // The opponent guessed OUR secret correctly → they won this round.
        // We know our own secret (= `secret`) but NOT theirs — it will arrive
        // via the `winner_reveals_secret` event the winner broadcasts.
        // DO NOT set opponentSecretReveal here; leave it null until that arrives.
        setGs(prev => ({
          ...prev, opponentScore: prev.opponentScore + 1, roundWinner: 'opponent',
          opponentSecretReveal: null, phase: 'round_end',
        }));
        // secretA = the loser's secret (ours), used by the WINNER to display "Their secret".
        // secretB intentionally omitted — we don't know the winner's secret.
        ch.send({ type: 'broadcast', event: 'round_end',
          payload: { winnerUserId: payload.userId, secretA: secret }
        });
      }
    });

    ch.on('broadcast', { event: 'hint_for_opponent' }, ({ payload }) => {
      if (payload.forUserId !== session.user.id) return;
      const hint: Hint = payload.hint;
      const timeSpent = Date.now() - guessStartTimeRef.current;

      Haptics.impactAsync(hint === 'correct' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
      if (hint !== 'correct') shake();
      updateBgFeedback(hint);

      setGs(prev => {
        const newMiss = prev.closestMiss === null ? payload.dist : Math.min(prev.closestMiss, payload.dist);
        return {
          ...prev,
          guessTimeSum: prev.guessTimeSum + timeSpent,
          guessCount: prev.guessCount + 1,
          closestMiss: payload.dist !== 0 ? newMiss : prev.closestMiss,
          myGuesses: [{ value: payload.guess, hint }, ...prev.myGuesses],
          ...(hint === 'correct' ? { myScore: prev.myScore + 1, roundWinner: 'me', phase: 'round_end' } : {}),
        };
      });

      // We just won by guessing correctly. Broadcast OUR secret so the
      // opponent can display the correct "Their secret" on their round-end screen.
      if (hint === 'correct') {
        ch.send({
          type: 'broadcast', event: 'winner_reveals_secret',
          payload: { userId: session?.user.id, secret: gsRef.current.mySecret },
        });
      }

      // Reset the per-guess clock (see the bot path) so avg-guess-time is measured
      // per guess, not cumulatively from the round start.
      guessStartTimeRef.current = Date.now();
      if (submittingTimerRef.current) { clearTimeout(submittingTimerRef.current); submittingTimerRef.current = null; }
      setSubmitting(false);
    });

    ch.on('broadcast', { event: 'player_timeout' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      setGs(prev => {
        // Guard: if we've already resolved this round (we won, lost, or timed out
        // ourselves), ignore the opponent's timeout — otherwise a simultaneous
        // timeout double-scores and both clients declare themselves the winner.
        if (prev.phase !== 'guessing') return prev;
        const nextState = { ...prev, myScore: prev.myScore + 1, roundWinner: 'me' as const, phase: 'round_end' as const };
        if (isHost && roomId) {
          supabase.rpc('update_room_state', { p_room: roomId, p_state: {
            ...gameRules, round: nextState.round,
            hostScore: nextState.myScore, guestScore: nextState.opponentScore,
          }});
        }
        return nextState;
      });
    });

    ch.on('broadcast', { event: 'round_end' }, ({ payload }) => {
      setGs(prev => {
        // secretA = the LOSER's secret (broadcast by the loser's device).
        // If I am the winner (roundWinner === 'me'), secretA is the opponent's secret → use it.
        // If I am the loser (roundWinner === 'opponent'), secretA is MY OWN secret → ignore;
        //   the winner's secret will arrive shortly via `winner_reveals_secret`.
        const iWon = prev.roundWinner === 'me';
        const nextState = {
          ...prev,
          phase: 'round_end' as const,
          opponentSecretReveal: iWon ? (payload.secretA ?? null) : prev.opponentSecretReveal,
        };
        if (isHost && roomId) {
          supabase.rpc('update_room_state', { p_room: roomId, p_state: {
            ...gameRules, round: nextState.round,
            hostScore: isHost ? nextState.myScore : nextState.opponentScore,
            guestScore: isHost ? nextState.opponentScore : nextState.myScore,
          }});
        }
        return nextState;
      });
    });

    // Winner broadcasts their own secret so the loser can reveal it correctly.
    ch.on('broadcast', { event: 'winner_reveals_secret' }, ({ payload }) => {
      // Filter out echoes from self (Supabase may echo broadcast to sender)
      if (payload.userId === session?.user.id) return;
      setGs(prev => {
        // Only apply if we are the loser — winner already has the correct value from round_end
        if (prev.roundWinner === 'me') return prev;
        return { ...prev, opponentSecretReveal: payload.secret };
      });
    });

    ch.on('broadcast', { event: 'next_round' }, ({ payload }) => {
      setOpponentReady(false);
      setInputValue('');
      setGs(prev => {
        const wRole = prev.roundWinner === 'me' ? (isHost ? 'host' : 'guest') : prev.roundWinner === 'opponent' ? (isHost ? 'guest' : 'host') : 'draw';
        const wName = prev.roundWinner === 'me' ? myName : prev.roundWinner === 'opponent' ? opponentName : 'Timeout';
        const sec = prev.roundWinner === 'me' ? prev.mySecret : prev.opponentSecretReveal;
        const newHistory = [...prev.matchHistory, {
          round: prev.round, winner: wRole as any, winnerName: wName, secret: sec, guesses: prev.myGuesses.length,
        }];
        return {
          ...prev, phase: 'picking', round: payload.round, mySecret: null,
          myGuesses: [], opponentGuesses: [], roundWinner: null, opponentSecretReveal: null,
          matchHistory: newHistory,
        };
      });
    });

    ch.on('broadcast', { event: 'game_over' }, ({ payload }) => {
      // Winner is broadcast as a user id (not the sender-relative 'me'/'opponent'),
      // so each client resolves it from its OWN perspective — otherwise the loser
      // would see the sender's result ("You Win!") verbatim.
      const winner: GameState['winner'] = payload.draw
        ? 'draw'
        : payload.winnerUserId === session.user.id ? 'me' : 'opponent';
      setGs(prev => ({ ...prev, phase: 'game_over', winner, matchHistory: payload.finalHistory ?? prev.matchHistory }));
    });

    ch.on('broadcast', { event: 'rematch_requested' }, () => {
      router.replace({ pathname: '/room/[code]', params: { code: roomCode } });
    });

    ch.subscribe();
    chRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [isBot, roomCode, session, isHost, roomId, gameRules]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleLockSecret = () => {
    if (!inputValue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const secret = parseFloat(inputValue);
    setGs(prev => ({
      ...prev,
      mySecret: secret,
      phase: opponentReady ? 'drama' : 'opponent_picking',
    }));
    setInputValue('');
    chRef.current?.send({
      type: 'broadcast', event: 'player_locked',
      payload: { userId: session?.user.id },
    });
  };

  const handleAutoSecret = () => {
    const v = !allowDecimal
      ? String(Math.floor(Math.random() * 101))
      : isHard ? (Math.random() * 100).toFixed(2)
      : (Math.random() * 100).toFixed(1);
    setInputValue(v);
  };

  const handleSubmitGuess = () => {
    if (!inputValue || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const guessStr = inputValue;
    setInputValue('');

    if (isBot) {
      const timeSpent = Date.now() - guessStartTimeRef.current;
      const guess = parseFloat(guessStr);
      const secret = botSecretRef.current ?? 0;
      const dist = Math.abs(guess - secret);
      const hint: Hint = gameRules.mode === 'blind_duel'
        ? (dist === 0 ? 'correct' : dist <= 5 ? 'hot' : dist <= 15 ? 'warm' : 'cold')
        : (guess === secret ? 'correct' : guess < secret ? 'higher' : 'lower');

      // Small delay so a bot guess still feels like it went somewhere and came back.
      setTimeout(() => {
        Haptics.impactAsync(hint === 'correct' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
        if (hint !== 'correct') shake();
        updateBgFeedback(hint);
        if (hint === 'correct' && botSolveTimerRef.current) {
          clearTimeout(botSolveTimerRef.current);
          botSolveTimerRef.current = null;
        }
        setGs(prev => {
          // Guard: the bot's solve timer may have fired during this 350-700ms
          // delay (photo finish) and already ended the round — don't score on top.
          if (prev.phase !== 'guessing') return prev;
          const newMiss = prev.closestMiss === null ? dist : Math.min(prev.closestMiss, dist);
          return {
            ...prev,
            guessTimeSum: prev.guessTimeSum + timeSpent,
            guessCount: prev.guessCount + 1,
            closestMiss: dist !== 0 ? newMiss : prev.closestMiss,
            myGuesses: [{ value: guessStr, hint }, ...prev.myGuesses],
            ...(hint === 'correct'
              ? { myScore: prev.myScore + 1, roundWinner: 'me' as const, phase: 'round_end' as const, opponentSecretReveal: secret }
              : {}),
          };
        });
        // Reset the per-guess clock so the next guess's time is measured from now,
        // not from the start of the round (which inflated the avg-guess-time stat).
        guessStartTimeRef.current = Date.now();
        setSubmitting(false);
      }, 350 + Math.random() * 350);
      return;
    }

    chRef.current?.send({
      type: 'broadcast', event: 'player_guess',
      payload: { userId: session?.user.id, username: myName, guess: guessStr },
    });
    // If no hint comes back within 8s (dropped broadcast, opponent backgrounded),
    // re-enable the input so the player isn't locked out for the rest of the round.
    if (submittingTimerRef.current) clearTimeout(submittingTimerRef.current);
    submittingTimerRef.current = setTimeout(() => {
      submittingTimerRef.current = null;
      setSubmitting(false);
    }, 8000);
  };

  const handleTimeout = () => {
    if (submitting) return;
    if (botSolveTimerRef.current) { clearTimeout(botSolveTimerRef.current); botSolveTimerRef.current = null; }
    chRef.current?.send({ type: 'broadcast', event: 'player_timeout', payload: { userId: session?.user.id } });
    setGs(prev => {
      if (prev.phase !== 'guessing') return prev; // round already resolved
      return {
        ...prev, opponentScore: prev.opponentScore + 1, roundWinner: 'opponent', phase: 'round_end',
        opponentSecretReveal: isBot ? botSecretRef.current : prev.opponentSecretReveal,
      };
    });
  };

  const handleNextRound = () => {
    const next = gs.round + 1;
    const isGameOver = next > gameRules.rounds;
    
    // Construct history item for this round
    const wRole = gs.roundWinner === 'me' ? (isHost ? 'host' : 'guest') : gs.roundWinner === 'opponent' ? (isHost ? 'guest' : 'host') : 'draw';
    const wName = gs.roundWinner === 'me' ? myName : gs.roundWinner === 'opponent' ? opponentName : 'Timeout';
    const sec = gs.roundWinner === 'me' ? gs.mySecret : gs.opponentSecretReveal;
    const roundStat: RoundStat = { round: gs.round, winner: wRole as any, winnerName: wName, secret: sec, guesses: gs.myGuesses.length };
    const newHistory = [...gs.matchHistory, roundStat];

    if (isGameOver) {
      const w = gs.myScore > gs.opponentScore ? 'me'
              : gs.opponentScore > gs.myScore ? 'opponent' : 'draw';
      // Broadcast the winner as a user id so the other client interprets it from
      // its own perspective (see the game_over handler). Sending 'me'/'opponent'
      // would flip the result on the receiver's screen.
      chRef.current?.send({
        type: 'broadcast', event: 'game_over',
        payload: {
          winnerUserId: w === 'me' ? session?.user.id : w === 'opponent' ? opponentId : null,
          draw: w === 'draw',
          finalHistory: newHistory,
        },
      });
      
      // Persist final history to DB
      if (isHost && roomId) {
        supabase.rpc('update_room_state', { p_room: roomId, p_state: {
          ...gameRules, round: gs.round,
          hostScore: isHost ? gs.myScore : gs.opponentScore,
          guestScore: isHost ? gs.opponentScore : gs.myScore,
          matchHistory: newHistory,
        }});
      }

      setGs(prev => ({ ...prev, phase: 'game_over', winner: w, matchHistory: newHistory }));
      return;
    }
    setOpponentReady(false);
    setInputValue('');
    chRef.current?.send({ type: 'broadcast', event: 'next_round', payload: { round: next } });
    setGs(prev => ({
      ...prev, phase: 'picking', round: next, mySecret: null,
      myGuesses: [], opponentGuesses: [], roundWinner: null, opponentSecretReveal: null,
      matchHistory: newHistory,
    }));
  };

  // Only the host can reset the room (reset_room is host-gated server-side).
  // The reset MUST commit (status -> 'lobby') before either client navigates,
  // or the lobby's "redirect when active" guard bounces both straight back into
  // the finished game. So: await reset, await the broadcast flush, THEN navigate.
  const handleRematch = async () => {
    if (!isHost || !roomId) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('reset_room', { p_room: roomId, p_state: gameRules });
    if (error) {
      setSubmitting(false);
      Alert.alert('Could not rematch', error.message);
      return;
    }
    await chRef.current?.send({ type: 'broadcast', event: 'rematch_requested', payload: {} });
    router.replace({ pathname: '/room/[code]', params: { code: roomCode } });
  };

  // ── Share game result to the Wins Feed ───────────────────────────────────
  const initShare = () => {
    const defaultText = gs.winner === 'me'
      ? `Won ${gs.myScore}–${gs.opponentScore} vs ${opponentName} in Number Duel! 🏆`
      : gs.winner === 'draw'
      ? `Tied ${gs.myScore}–${gs.opponentScore} with ${opponentName} in Number Duel! 🤝`
      : `Lost ${gs.myScore}–${gs.opponentScore} to ${opponentName} in Number Duel 😤`;
    setShareText(defaultText);
    setIsEditingShare(true);
  };

  const handleShareWin = async () => {
    if (shared || !shareText.trim() || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('share_win', {
      p_game_type: 'number-duel',
      p_result_text: shareText.trim(),
      p_match_id: roomId,
    });
    setSubmitting(false);
    if (!error) {
      setShared(true);
      setIsEditingShare(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('Error sharing', error.message);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <GradientFill colors={gradients.background} />
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
    );
  }

  const renderContent = () => {
    // ── PICKING
    if (gs.phase === 'picking') return (
      <Animated.View entering={FadeIn} style={s.phaseContent}>
        <Text style={s.phaseTitle}>Pick your secret number</Text>
        <Text style={s.phaseSub}>
          {!allowDecimal ? 'Whole numbers (0–100)' :
           isHard ? '2 decimals (e.g. 42.75)' : '1 decimal (e.g. 42.5)'}
        </Text>
        <Countdown seconds={PICK_SECONDS} onExpire={handleAutoSecret} />
        <View style={s.display}>
          <Text style={s.displayText}>{inputValue || '—'}</Text>
        </View>
        <NumberKeypad value={inputValue} onChange={setInputValue} allowDecimal={allowDecimal} maxLength={7} max={100} maxDecimals={isHard ? 2 : 1} />
      </Animated.View>
    );

    // ── WAITING FOR OPPONENT
    if (gs.phase === 'opponent_picking') return (
      <Animated.View entering={FadeIn} style={[s.phaseContent, s.centered]}>
        <Text style={s.secretLockedBig}>{gs.mySecret}</Text>
        <Text style={s.phaseTitle}>Secret locked! ✓</Text>
        <View style={s.waitingRow}>
          <ActivityIndicator color={colors.blue} />
          <Text style={s.waitingText}>Waiting for {opponentName}…</Text>
        </View>
      </Animated.View>
    );

    // ── DRAMA PAUSE
    if (gs.phase === 'drama') return (
      <Animated.View entering={FadeIn} style={[s.phaseContent, s.centered]}>
        <Text style={s.trophyEmoji}>🔒</Text>
        <Text style={s.phaseTitle}>Locking Secrets...</Text>
      </Animated.View>
    );

    // ── GUESSING
    if (gs.phase === 'guessing') return (
      <Animated.View entering={FadeIn} style={s.phaseContent}>
        <View style={s.secretBadge}>
          <Text style={s.secretBadgeLabel}>YOUR SECRET</Text>
          <Text style={s.secretBadgeValue}>{gs.mySecret}</Text>
        </View>
        <Text style={s.phaseTitle}>Guess their number</Text>
        {gameRules.mode === 'time_attack' && <Countdown seconds={15} onExpire={handleTimeout} active={gs.phase === 'guessing'} />}
        {gs.myGuesses.length > 0 && (
          <ScrollView style={s.historyScroll} contentContainerStyle={{ gap: 8 }}>
            {gs.myGuesses.map((g, i) => (
              <View key={i} style={s.historyRow}>
                <Text style={s.historyValue}>{g.value}</Text>
                <HintBadge hint={g.hint} />
              </View>
            ))}
          </ScrollView>
        )}
        <View style={s.display}>
          <Text style={s.displayText}>{inputValue || '—'}</Text>
        </View>
        <NumberKeypad value={inputValue} onChange={setInputValue} allowDecimal={allowDecimal} maxLength={7} max={100} maxDecimals={isHard ? 2 : 1} />
      </Animated.View>
    );

    // ── ROUND END
    if (gs.phase === 'round_end') return (
      <Animated.View entering={SlideInUp.springify().damping(14)} style={[s.phaseContent, s.centered]}>
        <Text style={s.trophyEmoji}>{gs.roundWinner === 'me' ? '🎯' : '😤'}</Text>
        <Text style={s.phaseTitle}>{gs.roundWinner === 'me' ? 'You got it!' : `${opponentName} won the round!`}</Text>
        <View style={s.revealRow}>
          <View style={s.revealCard}>
            <Text style={s.revealLabel}>Your secret</Text>
            <Text style={s.revealValue}>{gs.mySecret}</Text>
          </View>
          <View style={[s.revealCard, { borderColor: 'rgba(59,157,231,0.4)' }]}>
            <Text style={s.revealLabel}>Their secret</Text>
            <Text style={[s.revealValue, { color: colors.cyan }]}>{gs.opponentSecretReveal ?? '?'}</Text>
          </View>
        </View>
        <Text style={s.scoreLabel}>{myName} {gs.myScore} — {gs.opponentScore} {opponentName}</Text>
      </Animated.View>
    );

    // ── GAME OVER
    if (gs.phase === 'game_over') return (
      <Animated.View entering={FadeInUp.springify()} style={[s.phaseContent, s.centered]}>
        <Animated.Text entering={BounceIn.duration(700)} style={s.trophyEmoji}>
          {gs.winner === 'me' ? '🏆' : gs.winner === 'draw' ? '🤝' : '😔'}
        </Animated.Text>
        <Text style={s.phaseTitle}>{gs.winner === 'me' ? 'You Win!' : gs.winner === 'draw' ? "It's a Draw!" : `${opponentName} Wins!`}</Text>
        <Text style={s.scoreLabel}>Final: {gs.myScore} — {gs.opponentScore}</Text>
        <View style={s.statsCard}>
          <Text style={s.statsHeader}>Match Stats</Text>
          <Text style={s.statText}>Avg Guess Time: {gs.guessCount ? (gs.guessTimeSum / gs.guessCount / 1000).toFixed(1) : '-'}s</Text>
          <Text style={s.statText}>Closest Miss: {gs.closestMiss ?? '-'}</Text>
        </View>
      </Animated.View>
    );

    return null;
  };

  const renderCTA = () => {
    if (gs.phase === 'picking') return (
      <Pressable style={({ pressed }) => [s.cta, !inputValue && s.ctaDisabled, pressed && s.pressed]} onPress={handleLockSecret} disabled={!inputValue}>
        <GradientFill colors={gradients.button} />
        <Text style={s.ctaText}>Lock In 🔒</Text>
      </Pressable>
    );

    if (gs.phase === 'guessing') return (
      <Pressable style={({ pressed }) => [s.cta, (!inputValue || submitting) && s.ctaDisabled, pressed && s.pressed]} onPress={handleSubmitGuess} disabled={!inputValue || submitting}>
        <GradientFill colors={gradients.button} />
        <Text style={s.ctaText}>{submitting ? 'Waiting…' : 'Guess →'}</Text>
      </Pressable>
    );

    if (gs.phase === 'round_end') {
      if (isHost) return (
        <Pressable style={({ pressed }) => [s.cta, pressed && s.pressed]} onPress={handleNextRound}>
          <GradientFill colors={gradients.button} />
          <Text style={s.ctaText}>{gs.round < gameRules.rounds ? 'Next Round →' : 'See Results'}</Text>
        </Pressable>
      );
      return (
        <View style={s.waitingCta}>
          <ActivityIndicator color={colors.blue} />
          <Text style={s.waitingText}>Waiting for host…</Text>
        </View>
      );
    }

    if (gs.phase === 'game_over') return (
      <View style={{ gap: space.md }}>
        {/* Share to Wins Feed */}
        {!shared ? (
          isEditingShare ? (
            <Animated.View entering={FadeIn} style={s.shareEditBox}>
              <Text style={s.shareEditLabel}>Edit before posting:</Text>
              <TextInput
                style={s.shareInput}
                value={shareText}
                onChangeText={setShareText}
                multiline
                maxLength={200}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Pressable style={s.shareCancelBtn} onPress={() => setIsEditingShare(false)}>
                  <Text style={s.shareCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.sharePostBtn, submitting && s.ctaDisabled]}
                  onPress={handleShareWin}
                  disabled={submitting}
                >
                  <Text style={s.sharePostText}>{submitting ? 'Posting…' : 'Post to Feed'}</Text>
                </Pressable>
              </View>
            </Animated.View>
          ) : (
            <Pressable
              style={({ pressed }) => [s.ctaShare, pressed && s.pressed]}
              onPress={initShare}
              accessibilityLabel="Share result to Wins Feed"
              accessibilityRole="button"
            >
              <Text style={s.ctaShareText}>
                {gs.winner === 'me' ? '🏆  Share Win to Feed' : '📣  Share Result to Feed'}
              </Text>
            </Pressable>
          )
        ) : (
          <View style={s.sharedBadge}>
            <Text style={s.sharedBadgeText}>✓  Shared to Feed!</Text>
          </View>
        )}
        {isBot ? (
          <Pressable style={({ pressed }) => [s.cta, pressed && s.pressed]} onPress={() => router.replace('/setup/number-duel')}>
            <GradientFill colors={gradients.button} />
            <Text style={s.ctaText}>Find another match</Text>
          </Pressable>
        ) : isHost ? (
          <Pressable
            style={({ pressed }) => [s.cta, submitting && s.ctaDisabled, pressed && s.pressed]}
            onPress={handleRematch}
            disabled={submitting}
          >
            <GradientFill colors={gradients.button} />
            {submitting
              ? <ActivityIndicator color={colors.white} />
              : <Text style={s.ctaText}>Rematch 🔄</Text>}
          </Pressable>
        ) : (
          // Only the host can reset the room; the guest waits to be pulled into
          // the fresh lobby by the host's rematch_requested broadcast.
          <View style={s.waitingCta}>
            <ActivityIndicator color={colors.blue} />
            <Text style={s.waitingText}>Host can start a rematch</Text>
          </View>
        )}
        <Pressable style={({ pressed }) => [s.ctaOutline, pressed && s.pressed]} onPress={() => router.replace('/home')}>
          <Text style={s.ctaOutlineText}>Back to Home</Text>
        </Pressable>
      </View>
    );

    return null;
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior="padding">
      <GradientFill colors={gradients.background} />
      <Confetti active={gs.phase === 'game_over' && gs.winner === 'me'} />
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Pressable onPress={() => router.replace('/home')} style={s.backBtn}>
            <Text style={s.backText}>← Exit</Text>
          </Pressable>
          <Text style={s.headerTitle}>Number Duel</Text>
          <HeaderAvatar />
        </View>
        <View style={s.scoreboardWrap}>
          <RoundScoreboard round={gs.round} totalRounds={gameRules.rounds} scoreA={gs.myScore} scoreB={gs.opponentScore} nameA={myName} nameB={opponentName} difficulty={diffDisplay} />
        </View>
        <Animated.View style={[s.gameArea, shakeStyle]}>
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {renderContent()}
          </ScrollView>
          <View style={s.ctaWrap}>{renderCTA()}</View>
        </Animated.View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  backBtn: { padding: space.xs },
  backText: { fontFamily: font.bold, fontSize: 14, color: colors.textFaint },
  headerTitle: { fontFamily: font.display, fontSize: 18, color: colors.text },
  scoreboardWrap: { paddingHorizontal: space.lg, marginBottom: space.sm },
  gameArea: { flex: 1, paddingHorizontal: space.lg },
  scroll: { flexGrow: 1, paddingBottom: space.sm },
  phaseContent: { gap: space.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl },
  phaseTitle: { fontFamily: font.black, fontSize: 22, color: colors.text, textAlign: 'center' },
  phaseSub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  display: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, alignItems: 'center', borderWidth: 1, borderColor: colors.hairline, ...shadow.card },
  displayText: { fontFamily: font.display, fontSize: 42, color: colors.text, letterSpacing: 6 },
  secretLockedBig: { fontFamily: font.display, fontSize: 72, color: colors.blue },
  secretBadge: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: 'rgba(46,126,240,0.08)', padding: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(46,126,240,0.2)' },
  secretBadgeLabel: { fontFamily: font.bold, fontSize: 11, color: colors.blue, letterSpacing: 1 },
  secretBadgeValue: { fontFamily: font.display, fontSize: 22, color: colors.text },
  historyScroll: { maxHeight: 110 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.sm },
  historyValue: { fontFamily: font.bold, fontSize: 18, color: colors.text, width: 80 },
  revealRow: { flexDirection: 'row', gap: space.md, width: '100%' },
  revealCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, alignItems: 'center', borderWidth: 1, borderColor: colors.hairline },
  revealLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textFaint, letterSpacing: 1, marginBottom: 4 },
  revealValue: { fontFamily: font.display, fontSize: 32, color: colors.text },
  scoreLabel: { fontFamily: font.extrabold, fontSize: 16, color: colors.textMuted, textAlign: 'center' },
  trophyEmoji: { fontSize: 64 },
  statsCard: { backgroundColor: colors.surfaceAlt, padding: space.lg, borderRadius: radius.lg, marginTop: space.lg, width: '100%', alignItems: 'center' },
  statsHeader: { fontFamily: font.black, fontSize: 14, color: colors.text, marginBottom: space.sm },
  statText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted },
  ctaWrap: { paddingTop: space.sm, paddingBottom: space.md },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaOutline: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, paddingVertical: 18, alignItems: 'center' },
  ctaOutlineText: { fontFamily: font.bold, fontSize: 16, color: colors.textMuted },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, textAlign: 'center', paddingVertical: 18 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
  waitingCta: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline },
  waitingRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  waitingText: { fontFamily: font.semibold, fontSize: 15, color: colors.textMuted },
  // Share to Feed
  ctaShare: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.blue,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(59,157,231,0.08)',
  },
  ctaShareText: { fontFamily: font.extrabold, fontSize: 16, color: colors.blue },
  sharedBadge: {
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderColor: colors.success,
  },
  sharedBadgeText: { fontFamily: font.extrabold, fontSize: 16, color: colors.success },
  shareEditBox: {
    backgroundColor: colors.surface,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.sm,
  },
  shareEditLabel: { fontFamily: font.bold, fontSize: 12, color: colors.textMuted },
  shareInput: {
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: font.semibold,
    fontSize: 14,
    padding: space.md,
    borderRadius: radius.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  shareCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline },
  shareCancelText: { fontFamily: font.bold, color: colors.textMuted },
  sharePostBtn: { flex: 2, paddingVertical: 12, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.blue },
  sharePostText: { fontFamily: font.bold, color: colors.white },
});
