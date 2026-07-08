// Draughts.
//   • No roomCode  → Practice vs Bot (client-simulated, single device).
//   • With roomCode → online 1v1. Board state lives in rooms.state and syncs
//     via postgres_changes on rooms (same rail Number Duel / room lobby use);
//     each move writes the full state through update_room_state and both
//     clients converge on it. Host plays black (moves first), guest plays red.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
import DraughtsBoard from '../../components/games/DraughtsBoard';
import {
  applyMove, initialBoard, isLost, legalMoves,
  type Board, type Move, type PieceColor,
} from '../../lib/draughts';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

// Bot: forced captures come from the engine; prefer the longest chain.
function pickBotMove(board: Board, color: PieceColor): Move | null {
  const moves = legalMoves(board, color);
  if (moves.length === 0) return null;
  const maxCap = Math.max(...moves.map((m) => m.captures.length));
  const best = moves.filter((m) => m.captures.length === maxCap);
  return best[Math.floor(Math.random() * best.length)];
}

export default function Draughts() {
  const { roomCode } = useLocalSearchParams<{ roomCode?: string }>();
  return roomCode ? <OnlineDraughts roomCode={roomCode} /> : <BotDraughts />;
}

// ── Shell (header + board slot + result) ──────────────────────────────────────
function Shell({
  sub, board, myColor, myTurn, onMove, result, onPrimary, primaryLabel,
}: {
  sub: string;
  board: Board | null;
  myColor: PieceColor | null;
  myTurn: boolean;
  onMove: (m: Move) => void;
  result: string | null;
  onPrimary?: () => void;
  primaryLabel?: string;
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
            : <ActivityIndicator color={colors.blue} />}
        </View>

        {result && (
          <View style={styles.result}>
            <Text style={styles.resultText}>{result}</Text>
            {onPrimary && (
              <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={onPrimary}>
                <View style={styles.ctaInner}>
                  <GradientFill colors={gradients.button} />
                  <Text style={styles.ctaText}>{primaryLabel}</Text>
                </View>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Practice vs Bot ───────────────────────────────────────────────────────────
const HUMAN: PieceColor = 'b';
const BOT: PieceColor = 'r';

function BotDraughts() {
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
      sub="Practice vs Bot"
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

// ── Online 1v1 ────────────────────────────────────────────────────────────────
type RoomState = { board: Board; turn: PieceColor; status: 'playing' | 'done'; winner: PieceColor | null };

function OnlineDraughts({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const { session } = useSession();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<PieceColor | null>(null);
  const [oppName, setOppName] = useState('Opponent');
  const [state, setState] = useState<RoomState | null>(null);
  const meId = session?.user?.id ?? null;

  const persist = (s: RoomState) => {
    if (roomId) supabase.rpc('update_room_state', { p_room: roomId, p_state: s as any });
  };

  // Fetch room + players, set my color, hydrate or (host) initialize.
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

      const existing = room.state as Partial<RoomState> | null;
      if (existing?.board) {
        setState({ board: existing.board, turn: existing.turn ?? 'b', status: existing.status ?? 'playing', winner: existing.winner ?? null });
      } else if (hostIsMe) {
        const fresh: RoomState = { board: initialBoard(), turn: 'b', status: 'playing', winner: null };
        setState(fresh);
        supabase.rpc('update_room_state', { p_room: room.id, p_state: fresh as any });
      }
    })();
    return () => { active = false; };
  }, [roomCode, meId]);

  // Live sync: every move writes the full room.state; both clients hydrate here.
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
    const s: RoomState = {
      board: next,
      turn: won ? myColor : opp,
      status: won ? 'done' : 'playing',
      winner: won ? myColor : null,
    };
    setState(s);       // optimistic
    persist(s);        // sync to opponent
  };

  // If it's my turn and I have no legal moves, I lose.
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: space.sm, paddingBottom: space.xs,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.hairline,
  },
  title: { fontFamily: font.extrabold, fontSize: 20, color: colors.text },
  sub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: space.lg },
  boardWrap: { flex: 1, justifyContent: 'center' },
  result: { alignItems: 'center', gap: space.md, paddingBottom: space.lg },
  resultText: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow, minWidth: 180 },
  ctaInner: { paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
