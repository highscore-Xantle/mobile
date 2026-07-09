// Draughts.
//   roomCode param   → online 1v1 (from lobby / invite / join).
//   mp=online param  → matchmaking: wait for an opponent, fall back to a bot
//                      after 10s.
//   neither          → Practice vs Bot (local single device).
// Board state (online) lives in rooms.state and syncs via postgres_changes on
// rooms. Screen accents follow the Draughts theme (amber/gold).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
import DraughtsBoard from '../../components/games/DraughtsBoard';
import { GAMES } from '../(tabs)/games';
import {
  applyMove, initialBoard, isLost, legalMoves,
  type Board, type Move, type PieceColor,
} from '../../lib/draughts';
import { colors, font, radius, shadow, space } from '../../theme';

const DRAUGHTS = GAMES.find((g) => g.id === 'draughts')!;
const THEME = DRAUGHTS.theme;
const ACCENT = DRAUGHTS.accent;

function pickBotMove(board: Board, color: PieceColor): Move | null {
  const moves = legalMoves(board, color);
  if (moves.length === 0) return null;
  const maxCap = Math.max(...moves.map((m) => m.captures.length));
  const best = moves.filter((m) => m.captures.length === maxCap);
  return best[Math.floor(Math.random() * best.length)];
}

export default function Draughts() {
  const { roomCode, mp } = useLocalSearchParams<{ roomCode?: string; mp?: string }>();
  if (roomCode) return <OnlineDraughts roomCode={roomCode} />;
  if (mp === 'online') return <Matchmaking />;
  return <BotDraughts />;
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function Shell({
  sub, board, myColor, myTurn, onMove, result, onPrimary, primaryLabel, children,
}: {
  sub: string;
  board: Board | null;
  myColor: PieceColor | null;
  myTurn: boolean;
  onMove: (m: Move) => void;
  result: string | null;
  onPrimary?: () => void;
  primaryLabel?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <GradientFill colors={[colors.bgTop, colors.bgBottom]} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Draughts</Text>
          <View style={styles.iconBtn} />
        </View>
        <Text style={styles.sub}>{sub}</Text>

        <View style={styles.boardWrap}>
          {board
            ? <DraughtsBoard board={board} myColor={myColor} myTurn={myTurn} onMove={onMove} />
            : <ActivityIndicator color={ACCENT} />}
        </View>

        {result && (
          <View style={styles.result}>
            <Text style={styles.resultText}>{result}</Text>
            {onPrimary && (
              <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={onPrimary}>
                <View style={styles.ctaInner}>
                  <GradientFill colors={THEME} />
                  <Text style={styles.ctaText}>{primaryLabel}</Text>
                </View>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
      {children}
    </View>
  );
}

// ── Practice vs Bot ───────────────────────────────────────────────────────────
const HUMAN: PieceColor = 'b';
const BOT: PieceColor = 'r';

function BotDraughts({ note }: { note?: string }) {
  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [turn, setTurn] = useState<PieceColor>(HUMAN);
  const [winner, setWinner] = useState<PieceColor | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const commit = (b: Board, move: Move, mover: PieceColor) => {
    const next = applyMove(b, move);
    setBoard(next);
    const opp: PieceColor = mover === 'b' ? 'r' : 'b';
    if (isLost(next, opp)) { setWinner(mover); setTurn(mover); } else setTurn(opp);
  };
  const onMove = (move: Move) => { if (turn === HUMAN && !winner) commit(board, move, HUMAN); };

  useEffect(() => {
    if (turn !== BOT || winner) return;
    const t = setTimeout(() => {
      const move = pickBotMove(boardRef.current, BOT);
      if (!move) { setWinner(HUMAN); setTurn(HUMAN); return; }
      commit(boardRef.current, move, BOT);
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, winner]);

  useEffect(() => {
    if (winner || turn !== HUMAN) return;
    if (legalMoves(board, HUMAN).length === 0) setWinner(BOT);
  }, [turn, board, winner]);

  const rematch = () => { setBoard(initialBoard()); setTurn(HUMAN); setWinner(null); };

  return (
    <Shell
      sub={note ?? 'Practice vs Bot'}
      board={board}
      myColor={HUMAN}
      myTurn={turn === HUMAN && !winner}
      onMove={onMove}
      result={winner ? (winner === HUMAN ? '🏆  You win!' : '🤖  Bot wins') : null}
      onPrimary={rematch}
      primaryLabel="Rematch"
    />
  );
}

// ── Matchmaking (Play Online) ─────────────────────────────────────────────────
function Matchmaking() {
  const router = useRouter();
  const { session } = useSession();
  const meId = session?.user?.id ?? null;
  const [phase, setPhase] = useState<'searching' | 'online' | 'bot'>('searching');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const searchBoard = useMemo(() => initialBoard(), []);

  // Enter the queue: join an open room or create one and wait.
  useEffect(() => {
    if (!meId) return;
    let active = true;
    (async () => {
      const { data: room, error } = await supabase.rpc('matchmake_draughts');
      if (!active) return;
      if (error || !room) { setPhase('bot'); return; }   // fall back to bot on any hiccup
      setRoomCode(room.code);
      setRoomId(room.id);
      if (room.status === 'active') setPhase('online');   // paired immediately
    })();
    return () => { active = false; };
  }, [meId]);

  // Waiting: listen for someone to join; bot-fallback after 10s.
  useEffect(() => {
    if (phase !== 'searching' || !roomId) return;
    const ch = supabase
      .channel(`mm_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        ({ new: row }: any) => { if (row?.status === 'active') setPhase('online'); })
      .subscribe();
    const timer = setTimeout(() => {
      supabase.rpc('cancel_matchmaking', { p_room: roomId });
      setPhase('bot');
    }, 10000);
    return () => { void supabase.removeChannel(ch); clearTimeout(timer); };
  }, [phase, roomId]);

  const cancel = () => {
    if (roomId) supabase.rpc('cancel_matchmaking', { p_room: roomId });
    router.back();
  };

  if (phase === 'online' && roomCode) return <OnlineDraughts roomCode={roomCode} />;
  if (phase === 'bot') return <BotDraughts note="No one around — playing the bot!" />;

  return (
    <Shell sub="Play Online" board={searchBoard} myColor={HUMAN} myTurn={false} onMove={() => {}} result={null}>
      <Modal transparent visible animationType="fade" onRequestClose={cancel}>
        <View style={styles.overlay}>
          <View style={styles.searchCard}>
            <ActivityIndicator color={ACCENT} size="large" />
            <Text style={styles.searchTitle}>Finding an opponent…</Text>
            <Text style={styles.searchSub}>
              You're in the queue. If no one joins in a few seconds, you'll play an intelligent bot.
            </Text>
            <Pressable onPress={cancel} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Shell>
  );
}

// ── Online 1v1 ────────────────────────────────────────────────────────────────
type RoomState = { board: Board; turn: PieceColor; status: 'playing' | 'done'; winner: PieceColor | null };

function OnlineDraughts({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const { session } = useSession();
  const meId = session?.user?.id ?? null;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<PieceColor | null>(null);
  const [oppName, setOppName] = useState('Opponent');
  const [state, setState] = useState<RoomState | null>(null);

  const persist = (s: RoomState) => {
    if (roomId) supabase.rpc('update_room_state', { p_room: roomId, p_state: s as any });
  };

  useEffect(() => {
    if (!roomCode || !meId) return;
    let active = true;
    (async () => {
      const { data: room } = await supabase.from('rooms').select('id, host_id, state').eq('code', roomCode).single();
      if (!active || !room) return;
      const hostIsMe = room.host_id === meId;
      setRoomId(room.id);
      setMyColor(hostIsMe ? 'b' : 'r');

      const { data: players } = await supabase
        .from('room_players').select('user_id, display_name, profiles(username)').eq('room_id', room.id);
      const opp = players?.find((p: any) => p.user_id !== meId);
      setOppName(opp?.display_name || (opp?.profiles as any)?.username || 'Opponent');

      const ex = room.state as Partial<RoomState> | null;
      if (ex?.board) {
        setState({ board: ex.board, turn: ex.turn ?? 'b', status: ex.status ?? 'playing', winner: ex.winner ?? null });
      } else if (hostIsMe) {
        const fresh: RoomState = { board: initialBoard(), turn: 'b', status: 'playing', winner: null };
        setState(fresh);
        supabase.rpc('update_room_state', { p_room: room.id, p_state: fresh as any });
      }
    })();
    return () => { active = false; };
  }, [roomCode, meId]);

  useEffect(() => {
    if (!roomId) return;
    const ch = supabase
      .channel(`draughts_${roomCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        ({ new: row }: any) => {
          const s = row?.state as RoomState | undefined;
          if (s?.board) setState({ board: s.board, turn: s.turn, status: s.status, winner: s.winner });
        })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [roomId, roomCode]);

  const onMove = (move: Move) => {
    if (!state || !myColor || state.status !== 'playing' || state.turn !== myColor) return;
    const next = applyMove(state.board, move);
    const opp: PieceColor = myColor === 'b' ? 'r' : 'b';
    const won = isLost(next, opp);
    const s: RoomState = { board: next, turn: won ? myColor : opp, status: won ? 'done' : 'playing', winner: won ? myColor : null };
    setState(s);
    persist(s);
  };

  useEffect(() => {
    if (!state || !myColor || state.status !== 'playing' || state.turn !== myColor) return;
    if (legalMoves(state.board, myColor).length === 0) {
      const opp: PieceColor = myColor === 'b' ? 'r' : 'b';
      const s: RoomState = { ...state, status: 'done', winner: opp };
      setState(s); persist(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.turn, state?.status, myColor]);

  const result = state?.status === 'done'
    ? (state.winner === myColor ? '🏆  You win!' : `😔  ${oppName} wins`)
    : null;

  return (
    <Shell
      sub={`Online · vs ${oppName}`}
      board={state?.board ?? null}
      myColor={myColor}
      myTurn={!!state && state.status === 'playing' && state.turn === myColor}
      onMove={onMove}
      result={result}
      onPrimary={() => router.replace('/home')}
      primaryLabel="Back to Home"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.xs },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline },
  title: { fontFamily: font.extrabold, fontSize: 20, color: colors.text },
  sub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: space.lg },
  boardWrap: { flex: 1, justifyContent: 'center' },
  result: { alignItems: 'center', gap: space.md, paddingBottom: space.lg },
  resultText: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow, minWidth: 180 },
  ctaInner: { paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  searchCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, alignItems: 'center', gap: space.md, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: colors.hairline },
  searchTitle: { fontFamily: font.extrabold, fontSize: 18, color: colors.text },
  searchSub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  cancelText: { fontFamily: font.bold, fontSize: 14, color: ACCENT, marginTop: space.sm },
});
