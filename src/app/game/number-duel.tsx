import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  BounceIn, FadeIn, FadeInDown, FadeInUp, SlideInUp,
  useAnimatedStyle, useSharedValue,
  withSequence, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useGoBackOr } from '../../lib/navigation';
import { playSound } from '../../lib/sounds';
import { useSession } from '../../lib/useSession';
import { usePresence } from '../../lib/usePresence';
import { Confetti } from '../../components/Confetti';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { NumberKeypad } from '../../components/NumberKeypad';
import { RoundScoreboard } from '../../components/RoundScoreboard';
import { AV_POOL, VersusSearch, randomBotOpponent, useMyVersusProfile, type VersusPlayer } from '../../components/VersusSearch';
import { seedFor } from '../../lib/usePixelGame';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

// ─── Constants ────────────────────────────────────────────────────────────────
const PICK_SECONDS = 30;
// Disconnect forfeit grace. 30s (not 10s): a phone call or an app switch
// backgrounds the app and untracks presence — losing the match over a
// 12-second interruption is worse than the winner waiting a little longer.
const DISCONNECT_GRACE_MS = 30000;
const MATCH_SECONDS = 15;
// How long the "Opponent found!" reveal holds before the match starts —
// same beat for a real opponent and a bot, so a real match no longer snaps
// in before you even see who you're playing.
const REVEAL_MS = 1500;
// How long the round-end screen holds before the next round auto-starts.
const ROUND_END_SECONDS = 5;
// Number Duel's own colours (match the game icon), for the matchmaking
// screen — the shared dark-blue background didn't read as "this game".
// Mirrors the theme/accent in (tabs)/games.tsx.
const ND_THEME = ['#6E362B', '#2A1512'] as [string, string]; // red-brown, matches the keypad board (keep in sync with games.tsx number-duel theme)
const ND_ACCENT = '#E39A5B';                                  // amber, sampled from the keypad glow

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

/** Bot's own secret for the round — whole or decimal, matching this round's rules. */
function randomSecret(allowDecimal: boolean, isHard: boolean): number {
  if (!allowDecimal) return Math.floor(Math.random() * 101);
  return parseFloat((Math.random() * 100).toFixed(isHard ? 2 : 1));
}

/** How long the bot takes to land on the human's secret — longer when decimals are in play.
 * A human needs several guess-and-hint round trips to close in on a 0-100
 * secret (or a 2-decimal one), so this needs to stay well above "a couple
 * guesses' worth" of time or the bot solves before the human gets a fair
 * shot. */
function botSolveDelayMs(allowDecimal: boolean, isHard: boolean): number {
  const base = !allowDecimal ? 35000 : isHard ? 55000 : 45000;
  return base + Math.random() * 20000;
}

// ─── Route dispatcher ─────────────────────────────────────────────────────────
// Same shape as Draughts (game/draughts.tsx):
//   roomCode param  → online 1v1 (from invite / join / a resolved match).
//   mp=online param → matchmaking "versus" join → live match, or a bot after
//                     MATCH_SECONDS if no one joins.
export default function NumberDuel() {
  const { roomCode, mp } = useLocalSearchParams<{ roomCode?: string; mp?: string }>();
  if (!roomCode && mp === 'online') return <VersusJoin />;
  // Neither param (stale deep link, typo'd push): the game screen would sit
  // on an infinite spinner with no back affordance — go to the game's page.
  if (!roomCode) return <Redirect href="/details/number-duel" />;
  return <OnlineNumberDuel />;
}

// ─── Play Online: matchmake, or fall back to a bot ────────────────────────────
// Copies Draughts' VersusJoin: matchmake_number_duel() always returns a real
// room row (never SQL NULL) — 'active' means paired immediately, 'lobby'
// means wait for a postgres_changes update or the timeout, whichever first.
function VersusJoin() {
  const router = useRouter();
  // Verified back-or-fallback: on web a refresh can land directly on
  // ?mp=online with no history — a bare router.back() no-ops and the Cancel
  // button reads as dead.
  const goBack = useGoBackOr('/details/number-duel');
  const { session } = useSession();
  const meId = session?.user?.id ?? null;
  const me = useMyVersusProfile();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  // The matched opponent (real OR bot) that drives the "Opponent found!"
  // reveal. Null while still searching.
  const [matchedOpp, setMatchedOpp] = useState<VersusPlayer | null>(null);
  const [errored, setErrored] = useState(false);
  // Once ANY outcome has committed (real match, bot match, or cancel), every
  // other pending path must stand down — without this, the bot fallback could
  // fire after a real match already started and yank the player out of it.
  const resolvedRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current); }, []);

  // Show the "Opponent found!" reveal for REVEAL_MS, then enter the match —
  // identical beat for a real opponent and a bot (a real match used to snap
  // in instantly, before you could see who you matched with).
  const revealAndGo = (opp: VersusPlayer, params: Record<string, string>) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setMatchedOpp(opp);
    revealTimerRef.current = setTimeout(() => {
      router.replace({ pathname: '/game/number-duel', params });
    }, REVEAL_MS);
  };

  // The other seat in the matchmaking room — their real name + photo, so the
  // reveal shows who you actually matched with.
  const fetchOpponent = async (rId: string): Promise<VersusPlayer> => {
    const { data } = await supabase
      .from('room_players')
      .select('user_id, display_name, profiles(username, avatar_url)')
      .eq('room_id', rId);
    const opp = (data ?? []).find((p: any) => p.user_id !== meId) as any;
    return {
      name: opp?.display_name || opp?.profiles?.username || 'Opponent',
      avatar: opp?.profiles?.avatar_url ?? null,
    };
  };

  useEffect(() => {
    if (!meId) return;
    let active = true;
    (async () => {
      try {
        const { data: room, error } = await supabase.rpc('matchmake_number_duel');
        if (!active) return;
        if (error || !room) { setErrored(true); return; }
        if (room.status === 'active') {
          // Paired immediately into an existing lobby — reveal who, then go.
          const opp = await fetchOpponent(room.id);
          if (!active) return;
          revealAndGo(opp, { roomCode: room.code });
          return;
        }
        setRoomCode(room.code);
        setRoomId(room.id);
      } catch {
        // Without this catch, a rejected (not just errored) RPC call here left
        // roomId/roomCode unset — the bot-fallback timer below never even
        // starts, so the searching screen never resolves at all.
        if (active) setErrored(true);
      }
    })();
    return () => { active = false; };
  }, [meId]);

  // Listen for a real join; else settle on a (disguised) bot after MATCH_SECONDS.
  useEffect(() => {
    if (!roomId || !roomCode) return;
    // A real opponent joined our lobby → reveal who, then enter the match.
    const resolveToMatch = async () => {
      if (resolvedRef.current) return;
      const opp = await fetchOpponent(roomId);
      revealAndGo(opp, { roomCode });
    };
    const ch = supabase
      .channel(`nd_mm_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        ({ new: row }: any) => {
          if (row?.status === 'active') resolveToMatch();
        })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // An opponent can join in the gap BEFORE this subscription went
          // live — that UPDATE is never delivered, so re-check once now.
          const { data } = await supabase.from('rooms').select('status').eq('id', roomId).maybeSingle();
          if (data?.status === 'active') resolveToMatch();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // A real opponent joining won't be noticed until the bot-fallback
          // timer fires — the timer is the safety net, this is just so a
          // flaky realtime connection is visible, not silent.
          console.warn('[number-duel matchmaking] realtime subscribe failed:', status);
        }
      });
    const timer = setTimeout(async () => {
      try {
        if (resolvedRef.current) return;
        await supabase.rpc('cancel_matchmaking', { p_room: roomId });
        // cancel only deletes rooms still in 'lobby' — if an opponent flipped
        // this room 'active' in the same instant, we're already matched;
        // go play THEM, don't strand them against an empty seat.
        const { data: room } = await supabase.from('rooms').select('status').eq('id', roomId).maybeSingle();
        if (resolvedRef.current) return;
        if (room?.status === 'active') { void resolveToMatch(); return; }
        const { data: botRoom, error } = await supabase.rpc('create_bot_room', { p_state: {} });
        if (resolvedRef.current) return;
        if (error || !botRoom) { setErrored(true); return; }
        const disguise = randomBotOpponent();
        // Pass the disguise through — the game screen would otherwise show
        // the DB's "Xantle Bot" name and a different avatar, blowing the
        // cover the reveal just established.
        revealAndGo(disguise, { roomCode: botRoom.code, botName: disguise.name, botAvatar: disguise.avatar ?? '' });
      } catch {
        // Without this catch, any rejected RPC call here (network blip, etc.)
        // left the user stuck on "Finding an opponent…" forever — nothing
        // else would ever rescue them from that state.
        if (!resolvedRef.current) setErrored(true);
      }
    }, MATCH_SECONDS * 1000);
    return () => {
      void supabase.removeChannel(ch);
      clearTimeout(timer);
      // Hardware back / swipe unmounts without cancel() — without this the
      // lobby stays matchable for 40s and a stranger pairs into a room whose
      // host already left. No-ops if the room was already cancelled/matched.
      if (!resolvedRef.current) void supabase.rpc('cancel_matchmaking', { p_room: roomId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomCode]);

  const cancel = async () => {
    if (roomId) {
      await supabase.rpc('cancel_matchmaking', { p_room: roomId });
      // cancel only deletes rooms still in 'lobby' — a joiner may have
      // flipped it 'active' in the same instant. Abandoning then would
      // strand them against an empty seat; go play them instead.
      const { data } = await supabase.from('rooms').select('status').eq('id', roomId).maybeSingle();
      if (data?.status === 'active' && !resolvedRef.current) {
        resolvedRef.current = true;
        router.replace({ pathname: '/game/number-duel', params: { roomCode } });
        return;
      }
    }
    resolvedRef.current = true;  // stands down every pending navigation path above
    goBack();
  };

  if (errored) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <GradientFill colors={ND_THEME} />
        <Text style={s.phaseTitle}>Couldn't start matchmaking</Text>
        <Pressable style={({ pressed }) => [s.ctaOutline, { marginTop: space.lg, paddingHorizontal: space.xl }, pressed && s.pressed]} onPress={goBack}>
          <Text style={s.ctaOutlineText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <GradientFill colors={ND_THEME} />
      <SafeAreaView style={[s.safe, { justifyContent: 'center' }]}>
        <VersusSearch accent={ND_ACCENT} me={me} matched={matchedOpp} onCancel={cancel} />
      </SafeAreaView>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function OnlineNumberDuel() {
  // botName/botAvatar: the disguise VersusJoin showed while "searching" — a
  // bot match must keep the same fake identity here, not reveal "Xantle Bot".
  const { roomCode, botName, botAvatar } = useLocalSearchParams<{ roomCode: string; botName?: string; botAvatar?: string }>();

  const router = useRouter();
  const { session } = useSession();
  const { isOnline, synced } = usePresence();
  const { style: shakeStyle, shake } = useShake();

  const [roomId,        setRoomId]        = useState<string | null>(null);
  const [myName,        setMyName]        = useState('You');
  const [opponentName,  setOpponentName]  = useState('Opponent');
  const [myAvatar,      setMyAvatar]      = useState<string | null>(null);
  const [opponentAvatar,setOpponentAvatar]= useState<string | null>(null);
  const [opponentId,    setOpponentId]    = useState<string | null>(null);
  const [isBot,         setIsBot]         = useState(false);
  const [isHost,        setIsHost]        = useState(false);
  // Detects "opponent seems to have left" instead of leaving the other
  // player waiting forever with zero indication anything's wrong — there was
  // previously no timeout or signal at all for the opponent_picking wait or
  // the non-host round_end wait. A short grace period avoids flagging a
  // brief background/foreground blip as a disconnect. Once confirmed, the
  // match auto-forfeits to whoever's still here (see effect below).
  const [opponentOffline, setOpponentOffline] = useState(false);
  const [graceRearm, setGraceRearm] = useState(0);
  useEffect(() => {
    // `synced` gate: before the first presence sync, EVERYONE reads as
    // offline — starting the grace timer then would forfeit an online
    // opponent right after mount/reconnect.
    if (isBot || !opponentId || !synced) { setOpponentOffline(false); return; }
    if (isOnline(opponentId)) { setOpponentOffline(false); return; }
    const armedAt = Date.now();
    const t = setTimeout(() => {
      // A timer suspended by backgrounding flushes late on resume, before a
      // fresh presence sync arrives — if far more real time passed than the
      // grace we armed, don't trust the stale state; re-arm instead.
      if (Date.now() - armedAt > DISCONNECT_GRACE_MS + 5000) { setGraceRearm(x => x + 1); return; }
      setOpponentOffline(true);
    }, DISCONNECT_GRACE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBot, opponentId, synced, graceRearm, isOnline(opponentId)]);

  const [forfeitReason, setForfeitReason] = useState<'disconnect' | 'timeout' | null>(null);
  useEffect(() => {
    if (!opponentOffline || gs.phase === 'game_over') return;
    // Re-verify at claim time — the opponent may have re-tracked in the
    // moment between the grace timer expiring and this effect running.
    if (opponentId && isOnline(opponentId)) { setOpponentOffline(false); return; }
    setForfeitReason('disconnect');
    setGs(prev => {
      const nextState = { ...prev, phase: 'game_over' as const, winner: 'me' as const };
      if (isHost && roomId) {
        supabase.rpc('update_room_state', { p_room: roomId, p_state: {
          ...gameRules, round: nextState.round,
          hostScore: isHost ? nextState.myScore : nextState.opponentScore,
          guestScore: isHost ? nextState.opponentScore : nextState.myScore,
        }});
      }
      return nextState;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentOffline]);

  // Pick-timer forfeit escalation: letting the "pick a secret" countdown run
  // out is now an automatic loss of that round (not "auto-fill and keep
  // playing"), and stacks toward forfeiting the whole match. The timer also
  // shrinks each time it happens, so an opponent who's clearly not coming
  // back doesn't make the other player sit through the full countdown again.
  const MAX_PICK_TIMEOUTS = 3;
  const PICK_TIMEOUT_SHRINK_S = 10;
  const [myPickTimeouts, setMyPickTimeouts] = useState(0);
  const pickSeconds = Math.max(10, PICK_SECONDS - myPickTimeouts * PICK_TIMEOUT_SHRINK_S);

  const [inputValue,    setInputValue]    = useState('');
  const [loading,       setLoading]       = useState(true);
  const [submitting,    setSubmitting]    = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [roundEndCount, setRoundEndCount] = useState(ROUND_END_SECONDS); // auto-advance countdown
  const [shared,        setShared]        = useState(false); // post shared to feed
  const [isEditingShare,setIsEditingShare]= useState(false);
  const [shareText,     setShareText]     = useState('');
  // Rematch handshake. 'offering' = we asked, waiting on them; 'incoming' =
  // they asked, we're being prompted; 'accepted' = we said yes, waiting for
  // the go-signal; 'declined' = they said no. Replaces the old one-tap flow
  // that yanked the opponent into the lobby without asking.
  const [rematchState, setRematchState] = useState<'idle' | 'offering' | 'incoming' | 'accepted' | 'declined'>('idle');
  // Handlers close over subscribe-time state — they must read the CURRENT
  // handshake state or a cancel racing an accept still drags both players
  // into the lobby (the exact bug this handshake exists to prevent).
  const rematchStateRef = useRef(rematchState);
  rematchStateRef.current = rematchState;
  const rematchNavRef = useRef(false);
  const guessStartTimeRef = useRef<number>(0);
  // Round numbers in which WE timed out (guess-stage / pick-stage). Used to
  // reconcile the mutual-timeout race: if the opponent's timeout event for
  // the same round arrives after our own already ended it, the round is a
  // draw — not a point each (which double-scored), and not divergent
  // one-sided scores on the two devices.
  const myGuessTimeoutRoundRef = useRef<number | null>(null);
  const myPickTimeoutRoundRef = useRef<number | null>(null);
  // Round in which WE guessed the opponent's secret correctly. Mirrors the
  // timeout refs: if the opponent ALSO guessed correctly in the same round
  // (both solved at once), the two events would otherwise race to a
  // non-deterministic winner that the two devices disagree on. When we see
  // both, reconcile to a draw.
  const myCorrectRoundRef = useRef<number | null>(null);
  // True once WE sent pick_forfeit (3rd strike) — used to reconcile a
  // simultaneous mutual forfeit into a draw instead of two "opponent wins".
  const myPickForfeitRef = useRef(false);
  const botSecretRef = useRef<number | null>(null);
  const botLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botSolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gameRules, setGameRules] = useState({ rounds: 5, difficulty: 'auto', mode: 'classic' });

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

  // Auto-difficulty escalates proportionally to the match length: decimals
  // past the halfway point, hard mode in the final sixth. (The old fixed
  // ">6" / ">10" thresholds were leftovers from the 12-round format and
  // could never fire once matches became 5 rounds.)
  const allowDecimal = gameRules.difficulty === 'hardcore' || (gameRules.difficulty === 'auto' && gs.round > gameRules.rounds / 2);
  const isHard = gameRules.difficulty === 'hardcore' || (gameRules.difficulty === 'auto' && gs.round > gameRules.rounds * (5 / 6));
  const diffDisplay = isHard ? 'hard' : allowDecimal ? 'medium' : 'easy';

  // ── Dynamic Backgrounds ─────────────────────────────────────────────────────
  const bgColors = useSharedValue<string[]>(ND_THEME);
  const updateBgFeedback = (hint: Hint) => {
    if (hint === 'correct') bgColors.value = [colors.success, '#181C25'];
    else if (hint === 'hot' || hint === 'higher' || hint === 'lower') bgColors.value = ['rgba(248,113,113,0.1)', '#181C25'];
    else bgColors.value = ND_THEME;
    setTimeout(() => { bgColors.value = ND_THEME; }, 500);
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
        .select('user_id, display_name, is_bot, profiles(username, avatar_url)')
        .eq('room_id', room.id);

      setRoomId(room.id);
      
      const hostIsMe = room.host_id === session.user.id;
      setIsHost(hostIsMe);

      // Hydrate rules and state from Database
      if (room.state) {
        setGameRules({
          rounds: room.state.rounds || 5,
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
      setOpponentName(
        (opp as any)?.is_bot
          ? (botName || opp?.display_name || 'Opponent')   // keep the search screen's disguise
          : (opp?.display_name || (opp?.profiles as any)?.username || 'Opponent'),
      );
      setMyAvatar((me?.profiles as any)?.avatar_url ?? null);
      setOpponentAvatar(
        (opp as any)?.is_bot
          ? (botAvatar || AV_POOL[seedFor(roomCode ?? room.id, 0) % AV_POOL.length])
          : (opp?.profiles as any)?.avatar_url ?? null,
      );
      setOpponentId(opp?.user_id ?? null);
      setIsBot(!!(opp as any)?.is_bot);
      setLoading(false);
    })();
    // Keyed on the USER ID, not the session object: token refresh emits a new
    // session object every hour, and re-running this mid-match overwrote
    // round/scores from the stale persisted room.state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, session?.user?.id]);

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
  useEffect(() => {
    if (!isBot || gs.phase !== 'picking') return;
    botSecretRef.current = null;
    const delay = 3000 + Math.random() * 5000;
    botLockTimerRef.current = setTimeout(() => {
      botSecretRef.current = randomSecret(allowDecimal, isHard);
      setOpponentReady(true);
      setGs(prev => {
        if (prev.mySecret !== null && prev.phase === 'opponent_picking') return { ...prev, phase: 'drama' };
        return prev;
      });
    }, delay);
    return () => { if (botLockTimerRef.current) clearTimeout(botLockTimerRef.current); };
  }, [isBot, gs.phase, allowDecimal, isHard]);

  // ── Bot: "solve" the human's secret after a delay, unless the human wins first ──
  useEffect(() => {
    if (!isBot || gs.phase !== 'guessing') return;
    const delay = botSolveDelayMs(allowDecimal, isHard);
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

  // Match-over win sound — fires once when this client is the winner.
  useEffect(() => {
    if (gs.phase === 'game_over' && gs.winner === 'me') playSound('win');
  }, [gs.phase, gs.winner]);

  // Close the room when the match ends. Rooms were never marked finished, so
  // the Games tab's LIVE list accumulated every match ever played (including
  // bot rooms) as watchable-forever ghosts. Host-side only; a rematch's
  // reset_room reopens it to 'lobby' just fine afterwards.
  useEffect(() => {
    if (gs.phase !== 'game_over' || !isHost || !roomId) return;
    supabase.rpc('finish_room', { p_room: roomId }).then(({ error }) => {
      if (error) console.warn('[number-duel] finish_room failed:', error.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.phase]);

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

  // ── Round-end auto-advance ────────────────────────────────────────────────
  // Runs on BOTH devices (no host-only button). Ticks 3→2→1 then advances;
  // whichever device fires first broadcasts, the other's advanceRound is a
  // no-op once it's already left round_end. Bot matches advance locally too.
  useEffect(() => {
    if (gs.phase !== 'round_end') return;
    setRoundEndCount(ROUND_END_SECONDS);
    let n = ROUND_END_SECONDS;
    const iv = setInterval(() => {
      n -= 1;
      setRoundEndCount(n);
      if (n <= 0) {
        clearInterval(iv);
        if (gsRef.current.phase === 'round_end') advanceRound();
      }
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.phase, gs.round]);

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
      let ph = gsRef.current.phase;
      if (ph === 'game_over') return;
      // Their guess proves they're in 'guessing' — if we're still stuck in
      // 'opponent_picking', our copy of their player_locked was lost.
      // Recover (advance to drama) instead of silently answering their
      // guesses all round without ever showing our own guessing UI.
      if (ph === 'opponent_picking' && gsRef.current.mySecret !== null) {
        setOpponentReady(true);
        setGs(prev => prev.phase === 'opponent_picking' ? { ...prev, phase: 'drama' } : prev);
        ph = 'drama';
      }
      // Round already ended on this device: STILL answer the guess — a
      // swallowed reply left the guesser's `submitting` stuck true forever
      // (permanent soft-lock; their Guess button never re-enables). The
      // receiver's own phase guard decides whether the hint may score. The
      // one state change we make here: if we ended this round by guessing
      // correctly and their correct guess arrives too → both solved → draw.
      if (ph === 'round_end') {
        const secretR = gsRef.current.mySecret;
        if (secretR === null) return;
        const gR = parseFloat(payload.guess);
        const dR = Math.abs(gR - secretR);
        const hintR: Hint = gameRules.mode === 'blind_duel'
          ? (dR === 0 ? 'correct' : dR <= 5 ? 'hot' : dR <= 15 ? 'warm' : 'cold')
          : (gR === secretR ? 'correct' : gR < secretR ? 'higher' : 'lower');
        ch.send({ type: 'broadcast', event: 'hint_for_opponent',
          payload: { forUserId: payload.userId, guess: payload.guess, hint: hintR, dist: dR } });
        if (hintR === 'correct' && gsRef.current.roundWinner === 'me' && myCorrectRoundRef.current === gsRef.current.round) {
          setGs(prev => ({ ...prev, myScore: prev.myScore - 1, roundWinner: null }));
        }
        return;
      }
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
      // If the round already ended while this reply was in flight, don't
      // score off it — EXCEPT the both-solved-at-once case: the opponent
      // ended the round by guessing correctly this same round, and now our
      // own correct reply arrives → draw, not a loss the clients disagree on.
      if (gsRef.current.phase !== 'guessing') {
        if (hint === 'correct' && gsRef.current.phase === 'round_end'
            && gsRef.current.roundWinner === 'opponent') {
          myCorrectRoundRef.current = gsRef.current.round;
          const reconTime = Date.now() - guessStartTimeRef.current;
          // Record the guess too — it was correct, it just tied instead of
          // won; dropping it undercounted "guesses" and skewed avg time.
          setGs(prev => ({
            ...prev, opponentScore: prev.opponentScore - 1, roundWinner: null,
            myGuesses: [{ value: payload.guess, hint }, ...prev.myGuesses],
            guessCount: prev.guessCount + 1, guessTimeSum: prev.guessTimeSum + reconTime,
          }));
        }
        setSubmitting(false);
        return;
      }
      const timeSpent = Date.now() - guessStartTimeRef.current;
      // Per-guess timing: restart the clock now this guess is resolved, so
      // "Avg Guess Time" measures each guess, not cumulative time since the
      // round started.
      guessStartTimeRef.current = Date.now();

      Haptics.impactAsync(hint === 'correct' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
      if (hint !== 'correct') shake();
      updateBgFeedback(hint);
      playSound(hint === 'correct' ? 'correct' : 'wrong');

      setGs(prev => {
        const newMiss = prev.closestMiss === null ? payload.dist : Math.min(prev.closestMiss, payload.dist);
        return {
          ...prev,
          guessTimeSum: prev.guessTimeSum + timeSpent,
          guessCount: prev.guessCount + 1,
          closestMiss: payload.dist !== 0 ? newMiss : prev.closestMiss,
          myGuesses: [{ value: payload.guess, hint }, ...prev.myGuesses],
          ...(hint === 'correct' ? { myScore: prev.myScore + 1, roundWinner: 'me' as const, phase: 'round_end' as const } : {}),
        };
      });
      if (hint === 'correct') myCorrectRoundRef.current = gsRef.current.round;

      // We just won by guessing correctly. Broadcast OUR secret so the
      // opponent can display the correct "Their secret" on their round-end screen.
      if (hint === 'correct') {
        ch.send({
          type: 'broadcast', event: 'winner_reveals_secret',
          payload: { userId: session?.user.id, secret: gsRef.current.mySecret },
        });
      }

      setSubmitting(false);
    });

    ch.on('broadcast', { event: 'player_timeout' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      setGs(prev => {
        if (prev.phase === 'game_over') return prev;
        if (prev.phase === 'round_end') {
          // Round already decided on this device. If it ended because WE
          // timed out in the same round (mutual timeout), reconcile to a
          // draw; otherwise it's a stale event — ignore it.
          if (prev.roundWinner === 'opponent' && myGuessTimeoutRoundRef.current === prev.round) {
            return { ...prev, opponentScore: prev.opponentScore - 1, roundWinner: null };
          }
          return prev;
        }
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

    // Opponent's pick-secret timer ran out — they lose this round automatically.
    ch.on('broadcast', { event: 'pick_timeout' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      setGs(prev => {
        if (prev.phase === 'game_over') return prev;
        if (prev.phase === 'round_end') {
          // Both pick timers expired the same round → draw, not a point each.
          if (prev.roundWinner === 'opponent' && myPickTimeoutRoundRef.current === prev.round) {
            return { ...prev, opponentScore: prev.opponentScore - 1, roundWinner: null };
          }
          return prev;
        }
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

    // Opponent hit MAX_PICK_TIMEOUTS — they forfeit the whole match.
    ch.on('broadcast', { event: 'pick_forfeit' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      // Terminal state wins — but if BOTH sides struck out simultaneously
      // (each device locally concluded "I forfeited, opponent wins"), their
      // forfeit arriving now means neither actually won: call it a draw so
      // the two devices agree instead of both showing "{opponent} Wins!".
      if (gsRef.current.phase === 'game_over') {
        if (myPickForfeitRef.current && gsRef.current.winner === 'opponent') {
          setGs(prev => ({ ...prev, winner: 'draw' }));
        }
        return;
      }
      setForfeitReason('timeout');
      setGs(prev => {
        if (prev.phase === 'game_over') return prev;
        const nextState = { ...prev, phase: 'game_over' as const, winner: 'me' as const };
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
        if (prev.phase === 'game_over') return prev;
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
      setSubmitting(false); // never carry a stuck in-flight guess into a new round
      setGs(prev => {
        // Only advance FROM round_end. A duplicate next_round (both devices
        // auto-advance) arriving after we've already moved to 'picking' — or
        // a straggler after game_over — is ignored, so history is appended
        // exactly once per device.
        if (prev.phase !== 'round_end') return prev;
        const wRole = prev.roundWinner === 'me' ? (isHost ? 'host' : 'guest') : prev.roundWinner === 'opponent' ? (isHost ? 'guest' : 'host') : 'draw';
        const wName = prev.roundWinner === 'me' ? myName : prev.roundWinner === 'opponent' ? opponentName : 'Draw';
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
      if (payload.userId === session.user.id) return;
      // `winner` arrives in the SENDER's frame ('me' = the sender). We are
      // always the other player here, so flip it into our own frame —
      // without this the guest saw the host's result on every match end.
      const winner = payload.winner === 'me' ? 'opponent' : payload.winner === 'opponent' ? 'me' : 'draw';
      setGs(prev => prev.phase === 'game_over'
        ? prev
        : { ...prev, phase: 'game_over', winner, matchHistory: payload.finalHistory ?? prev.matchHistory });
    });

    // Opponent used the in-app "← Exit" button mid-match. Presence can't
    // catch this (it's app-wide, and they're still in the app), so without
    // this event the remaining player waited forever.
    ch.on('broadcast', { event: 'player_left' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      if (gsRef.current.phase === 'game_over') return;
      setForfeitReason('disconnect');
      setGs(prev => prev.phase === 'game_over' ? prev : { ...prev, phase: 'game_over', winner: 'me' });
    });

    // ── Rematch handshake ──────────────────────────────────────────────
    ch.on('broadcast', { event: 'rematch_offer' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      // Only meaningful on the game-over screen — a stray offer must not
      // paint the prompt over a live match.
      if (gsRef.current.phase !== 'game_over') return;
      setRematchState('incoming');
    });
    ch.on('broadcast', { event: 'rematch_cancel' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      // The other side withdrew/left — dismiss our prompt, unstick us if we
      // were waiting post-accept, and surface it as a decline if it was OUR
      // offer they walked away from.
      setRematchState(prev =>
        (prev === 'incoming' || prev === 'accepted') ? 'idle'
        : prev === 'offering' ? 'declined' : prev);
    });
    ch.on('broadcast', { event: 'rematch_decline' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      if (rematchStateRef.current !== 'offering') return;
      setRematchState('declined');
    });
    ch.on('broadcast', { event: 'rematch_accept' }, ({ payload }) => {
      if (payload.userId === session.user.id) return;
      // Only act if OUR offer is still standing — an accept that raced our
      // cancel must not reset the room and yank anyone anywhere.
      if (rematchStateRef.current !== 'offering') return;
      // Opponent accepted our offer → proceed. The host (whichever side that
      // is) resets the room and fires rematch_go so neither client navigates
      // to a stale/finished lobby before the reset lands.
      proceedToRematch();
    });
    ch.on('broadcast', { event: 'rematch_go' }, () => {
      // Only follow the go-signal if we're actually part of a live handshake.
      if (rematchStateRef.current !== 'offering' && rematchStateRef.current !== 'accepted') return;
      if (rematchNavRef.current) return;
      rematchNavRef.current = true;
      router.replace({ pathname: '/room/[code]', params: { code: roomCode } });
    });

    ch.subscribe();
    chRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // session?.user?.id (not session): an hourly token refresh emits a new
    // session object — tearing the channel down mid-match dropped whatever
    // broadcast was in flight (hint replies, round transitions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBot, roomCode, session?.user?.id, isHost, roomId, gameRules]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const lockSecret = (raw: number) => {
    // Clamp the secret to the round's advertised precision (whole numbers /
    // 1 decimal / 2 decimals) and range. The keypad only limits total length,
    // so without this a player could lock e.g. 42.7519 in a "1 decimal"
    // round — unguessable by exact match, and classic mode has no guess
    // timer, so the round would literally never end.
    const dp = isHard ? 2 : allowDecimal ? 1 : 0;
    const secret = Math.min(100, Math.max(0, Math.round(raw * 10 ** dp) / 10 ** dp));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('click');
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

  const handleLockSecret = () => {
    if (!inputValue) return;
    lockSecret(parseFloat(inputValue));
  };

  // Countdown expiring means the player never locked a secret in — that's
  // now an automatic loss of the round (not "auto-fill a random one and
  // keep playing", which let a player who'd walked away stall the match
  // indefinitely). Stacks toward MAX_PICK_TIMEOUTS strikes, which forfeits
  // the whole match instead of just the round.
  const handlePickTimeout = () => {
    if (gs.mySecret !== null) return; // already locked before the timer fired
    const strikes = myPickTimeouts + 1;
    setMyPickTimeouts(strikes);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    if (strikes >= MAX_PICK_TIMEOUTS) {
      myPickForfeitRef.current = true;
      chRef.current?.send({ type: 'broadcast', event: 'pick_forfeit', payload: { userId: session?.user.id } });
      setForfeitReason('timeout');
      setGs(prev => {
        const nextState = { ...prev, phase: 'game_over' as const, winner: 'opponent' as const };
        if (isHost && roomId) {
          supabase.rpc('update_room_state', { p_room: roomId, p_state: {
            ...gameRules, round: nextState.round,
            hostScore: isHost ? nextState.myScore : nextState.opponentScore,
            guestScore: isHost ? nextState.opponentScore : nextState.myScore,
          }});
        }
        return nextState;
      });
      return;
    }

    myPickTimeoutRoundRef.current = gs.round;
    chRef.current?.send({ type: 'broadcast', event: 'pick_timeout', payload: { userId: session?.user.id } });
    setGs(prev => ({ ...prev, opponentScore: prev.opponentScore + 1, roundWinner: 'opponent', phase: 'round_end' }));
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
        playSound(hint === 'correct' ? 'correct' : 'wrong');
        if (hint === 'correct' && botSolveTimerRef.current) {
          clearTimeout(botSolveTimerRef.current);
          botSolveTimerRef.current = null;
        }
        setGs(prev => {
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
        setSubmitting(false);
      }, 350 + Math.random() * 350);
      return;
    }

    chRef.current?.send({
      type: 'broadcast', event: 'player_guess',
      payload: { userId: session?.user.id, username: myName, guess: guessStr },
    });
  };

  const handleTimeout = () => {
    if (submitting) return;
    if (gs.phase !== 'guessing') return; // round already ended before the timer flushed
    if (botSolveTimerRef.current) { clearTimeout(botSolveTimerRef.current); botSolveTimerRef.current = null; }
    myGuessTimeoutRoundRef.current = gs.round;
    chRef.current?.send({ type: 'broadcast', event: 'player_timeout', payload: { userId: session?.user.id } });
    setGs(prev => ({
      ...prev, opponentScore: prev.opponentScore + 1, roundWinner: 'opponent', phase: 'round_end',
      opponentSecretReveal: isBot ? botSecretRef.current : prev.opponentSecretReveal,
    }));
  };

  // Advance out of round_end. No longer a button: the old "Next Round" CTA
  // was HOST-ONLY (the guest just saw "Waiting for host…"), so an AFK or
  // forfeiting host left the other player stuck forever — the exact stall the
  // pick-timeout forfeit was meant to prevent. Now BOTH devices run a short
  // countdown (see the effect below) and call this automatically. It's
  // idempotent: reads live state from gsRef, only acts while still in
  // round_end, and the next_round handler ignores duplicates the same way —
  // so both devices firing at once is harmless.
  const advanceRound = () => {
    const cur = gsRef.current;
    if (cur.phase !== 'round_end') return;
    const next = cur.round + 1;
    const isGameOver = next > gameRules.rounds;

    const wRole = cur.roundWinner === 'me' ? (isHost ? 'host' : 'guest') : cur.roundWinner === 'opponent' ? (isHost ? 'guest' : 'host') : 'draw';
    const wName = cur.roundWinner === 'me' ? myName : cur.roundWinner === 'opponent' ? opponentName : 'Draw';
    const sec = cur.roundWinner === 'me' ? cur.mySecret : cur.opponentSecretReveal;
    const roundStat: RoundStat = { round: cur.round, winner: wRole as any, winnerName: wName, secret: sec, guesses: cur.myGuesses.length };
    const newHistory = [...cur.matchHistory, roundStat];

    if (isGameOver) {
      const w = cur.myScore > cur.opponentScore ? 'me'
              : cur.opponentScore > cur.myScore ? 'opponent' : 'draw';
      chRef.current?.send({ type: 'broadcast', event: 'game_over', payload: { userId: session?.user.id, winner: w, finalHistory: newHistory } });

      // Persist final history to DB
      if (isHost && roomId) {
        supabase.rpc('update_room_state', { p_room: roomId, p_state: {
          ...gameRules, round: cur.round,
          hostScore: isHost ? cur.myScore : cur.opponentScore,
          guestScore: isHost ? cur.opponentScore : cur.myScore,
          matchHistory: newHistory,
        }});
      }

      setGs(prev => prev.phase === 'game_over' ? prev : ({ ...prev, phase: 'game_over', winner: w, matchHistory: newHistory }));
      return;
    }
    setOpponentReady(false);
    setInputValue('');
    setSubmitting(false); // never carry a stuck in-flight guess into a new round
    chRef.current?.send({ type: 'broadcast', event: 'next_round', payload: { round: next } });
    setGs(prev => prev.phase !== 'round_end' ? prev : ({
      ...prev, phase: 'picking', round: next, mySecret: null,
      myGuesses: [], opponentGuesses: [], roundWinner: null, opponentSecretReveal: null,
      matchHistory: newHistory,
    }));
  };

  // Whoever is host resets the room, then signals both clients to move to the
  // lobby — guaranteeing nobody navigates into a still-'finished' room. The
  // guest just waits for rematch_go.
  const proceedToRematch = async () => {
    if (isHost && roomId) {
      // reset_room failing (room still 'active') and navigating anyway would
      // bounce BOTH clients straight back into the stale mid-match game —
      // the lobby auto-forwards any room whose status reads 'active'.
      const { error } = await supabase.rpc('reset_room', { p_room: roomId, p_state: gameRules });
      if (error) {
        chRef.current?.send({ type: 'broadcast', event: 'rematch_cancel', payload: { userId: session?.user.id } });
        setRematchState('idle');
        Alert.alert('Rematch failed', 'Could not reset the room — please try again.');
        return;
      }
      chRef.current?.send({ type: 'broadcast', event: 'rematch_go', payload: {} });
      if (!rematchNavRef.current) {
        rematchNavRef.current = true;
        router.replace({ pathname: '/room/[code]', params: { code: roomCode } });
      }
    }
    // non-host: navigation happens when rematch_go arrives
  };

  const offerRematch = () => {
    playSound('click');
    setRematchState('offering');
    chRef.current?.send({ type: 'broadcast', event: 'rematch_offer', payload: { userId: session?.user.id } });
  };
  const cancelRematchOffer = () => {
    setRematchState('idle');
    chRef.current?.send({ type: 'broadcast', event: 'rematch_cancel', payload: { userId: session?.user.id } });
  };
  const acceptRematch = () => {
    playSound('click');
    setRematchState('accepted');
    chRef.current?.send({ type: 'broadcast', event: 'rematch_accept', payload: { userId: session?.user.id } });
    proceedToRematch();
  };
  const declineRematch = () => {
    setRematchState('idle');
    chRef.current?.send({ type: 'broadcast', event: 'rematch_decline', payload: { userId: session?.user.id } });
  };
  // Leaving the game-over screen mid-handshake must tell the other side, or
  // they wait forever on an offer/accept that can no longer complete.
  const abandonRematch = () => {
    const st = rematchStateRef.current;
    if (st === 'offering' || st === 'accepted') {
      chRef.current?.send({ type: 'broadcast', event: 'rematch_cancel', payload: { userId: session?.user.id } });
    } else if (st === 'incoming') {
      chRef.current?.send({ type: 'broadcast', event: 'rematch_decline', payload: { userId: session?.user.id } });
    }
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
        <GradientFill colors={ND_THEME} />
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
        {myPickTimeouts > 0 && (
          <Text style={s.strikeWarning}>
            ⚠️ {myPickTimeouts}/{MAX_PICK_TIMEOUTS} timeouts — {MAX_PICK_TIMEOUTS - myPickTimeouts} more forfeits the match
          </Text>
        )}
        <Countdown key={myPickTimeouts} seconds={pickSeconds} onExpire={handlePickTimeout} />
        <View style={s.display}>
          <Text style={s.displayText}>{inputValue || '—'}</Text>
        </View>
        <NumberKeypad value={inputValue} onChange={setInputValue} allowDecimal={allowDecimal} maxLength={7} max={100} />
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
        {/* key on the guess count so each resolved guess restarts the 15s
            window — the rules copy promises "15s limit per guess", not 15s
            for the whole round. */}
        {gameRules.mode === 'time_attack' && <Countdown key={gs.myGuesses.length} seconds={15} onExpire={handleTimeout} active={gs.phase === 'guessing'} />}
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
        <NumberKeypad value={inputValue} onChange={setInputValue} allowDecimal={allowDecimal} maxLength={7} max={100} />
      </Animated.View>
    );

    // ── ROUND END
    if (gs.phase === 'round_end') return (
      <Animated.View entering={SlideInUp.springify().damping(14)} style={[s.phaseContent, s.centered]}>
        <Text style={s.trophyEmoji}>{gs.roundWinner === 'me' ? '🎯' : gs.roundWinner === 'opponent' ? '😤' : '🤝'}</Text>
        <Text style={s.phaseTitle}>{gs.roundWinner === 'me' ? 'You got it!' : gs.roundWinner === 'opponent' ? `${opponentName} won the round!` : "Round drawn — dead heat!"}</Text>
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
        {forfeitReason && (
          <Text style={s.forfeitNote}>
            {forfeitReason === 'disconnect'
              ? (gs.winner === 'me' ? `${opponentName} disconnected — you win by forfeit.` : `You disconnected — ${opponentName} wins by forfeit.`)
              : (gs.winner === 'me' ? `${opponentName} ran out of time too many times — you win by forfeit.` : `You ran out of time too many times — ${opponentName} wins by forfeit.`)}
          </Text>
        )}
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
      const n = Math.max(0, roundEndCount);
      return (
        <View style={s.nextCountWrap}>
          <Text style={s.nextCountLabel}>
            {gs.round < gameRules.rounds ? 'Next round begins in' : 'Results in'}
          </Text>
          <Text style={s.nextCountValue}>{n}</Text>
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
        ) : rematchState === 'offering' ? (
          <View style={s.rematchWaiting}>
            <ActivityIndicator color={colors.blue} />
            <Text style={s.rematchWaitingText}>Waiting for {opponentName} to accept…</Text>
            <Pressable onPress={cancelRematchOffer} hitSlop={8}>
              <Text style={s.rematchCancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : rematchState === 'accepted' ? (
          <View style={s.rematchWaiting}>
            <ActivityIndicator color={colors.blue} />
            <Text style={s.rematchWaitingText}>Starting rematch…</Text>
          </View>
        ) : rematchState === 'declined' ? (
          <View style={s.rematchWaiting}>
            <Text style={s.rematchWaitingText}>{opponentName} declined the rematch.</Text>
            <Pressable style={({ pressed }) => [s.ctaOutline, pressed && s.pressed]} onPress={() => setRematchState('idle')}>
              <Text style={s.ctaOutlineText}>OK</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={({ pressed }) => [s.cta, pressed && s.pressed]} onPress={offerRematch}>
            <GradientFill colors={gradients.button} />
            <Text style={s.ctaText}>Rematch 🔄</Text>
          </Pressable>
        )}
        <Pressable style={({ pressed }) => [s.ctaOutline, pressed && s.pressed]} onPress={() => { abandonRematch(); setTimeout(() => router.replace('/home'), 100); }}>
          <Text style={s.ctaOutlineText}>Back to Home</Text>
        </Pressable>
      </View>
    );

    return null;
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior="padding">
      <GradientFill colors={ND_THEME} />
      <Confetti active={gs.phase === 'game_over' && gs.winner === 'me'} />
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Pressable
            onPress={() => {
              // Quitting a live match concedes it — tell the opponent so
              // they get the win instead of waiting on us forever. Small
              // delay gives the broadcast time to flush before the channel
              // is torn down by unmount.
              if (!isBot && gs.phase !== 'game_over') {
                chRef.current?.send({ type: 'broadcast', event: 'player_left', payload: { userId: session?.user.id } });
                setTimeout(() => router.replace('/home'), 150);
              } else if (!isBot && rematchStateRef.current !== 'idle') {
                // Leaving the game-over screen mid-handshake: tell the other
                // side so their prompt/wait doesn't hang forever.
                abandonRematch();
                setTimeout(() => router.replace('/home'), 100);
              } else {
                router.replace('/home');
              }
            }}
            style={s.backBtn}
          >
            <Text style={s.backText}>← Exit</Text>
          </Pressable>
          <Text style={s.headerTitle}>Number Duel</Text>
          <HeaderAvatar />
        </View>
        <View style={s.scoreboardWrap}>
          <RoundScoreboard round={gs.round} totalRounds={gameRules.rounds} scoreA={gs.myScore} scoreB={gs.opponentScore} nameA={myName} nameB={opponentName} avatarA={myAvatar} avatarB={opponentAvatar} difficulty={diffDisplay} />
        </View>
        <Animated.View style={[s.gameArea, shakeStyle]}>
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {renderContent()}
          </ScrollView>
          <View style={s.ctaWrap}>{renderCTA()}</View>
        </Animated.View>
      </SafeAreaView>

      {/* Incoming rematch prompt — the opponent asked, we choose. */}
      {rematchState === 'incoming' && (
        <View style={s.rematchOverlay}>
          <Animated.View entering={FadeInUp.springify().damping(16)} style={s.rematchCard}>
            <Text style={s.rematchEmoji}>🔄</Text>
            <Text style={s.rematchTitle}>{opponentName} wants a rematch!</Text>
            <Text style={s.rematchSub}>Play another {gameRules.rounds}-round duel?</Text>
            <View style={s.rematchBtnRow}>
              <Pressable style={({ pressed }) => [s.rematchDecline, pressed && s.pressed]} onPress={declineRematch}>
                <Text style={s.rematchDeclineText}>No thanks</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [s.rematchAccept, pressed && s.pressed]} onPress={acceptRematch}>
                <GradientFill colors={gradients.button} />
                <Text style={s.rematchAcceptText}>Rematch</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  rematchWaiting: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  rematchWaitingText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  rematchCancelText: { fontFamily: font.bold, fontSize: 14, color: colors.textFaint, padding: space.xs },
  rematchOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  rematchCard: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: space.xl, alignItems: 'center', gap: space.sm, ...shadow.card },
  rematchEmoji: { fontSize: 44 },
  rematchTitle: { fontFamily: font.display, fontSize: 20, color: colors.text, textAlign: 'center' },
  rematchSub: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: space.sm },
  rematchBtnRow: { flexDirection: 'row', gap: space.md, alignSelf: 'stretch' },
  rematchDecline: { flex: 1, paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center' },
  rematchDeclineText: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  rematchAccept: { flex: 1, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center', overflow: 'hidden' },
  rematchAcceptText: { fontFamily: font.bold, fontSize: 15, color: colors.white },
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
  strikeWarning: { fontFamily: font.semibold, fontSize: 12, color: colors.warning, textAlign: 'center' },
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
  nextCountWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 2 },
  nextCountLabel: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, letterSpacing: 0.3 },
  nextCountValue: { fontFamily: font.display, fontSize: 40, color: colors.text, lineHeight: 46 },
  forfeitNote: { fontFamily: font.semibold, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: -4 },
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
