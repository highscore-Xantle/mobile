// Draughts.
//   roomCode param  → online 1v1 (from invite / join).
//   mp=online param → matchmaking "versus" join → live match, or a disguised
//                     bot after ~15s if no one joins.
//   neither         → Practice vs Bot.
// Themed screen (amber/gold), a You-vs-Opponent scoreboard with avatars +
// running score, and a header menu with Quit.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
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
const THEME_BG: [string, string] = ['#2E1F0E', '#131009'];

type Player = { name: string; avatar: string | null };

const AV_POOL = Array.from({ length: 20 }, (_, i) => `https://i.pravatar.cc/150?img=${i + 1}`);
const BOT_NAMES = ['Alex Morgan', 'Sam Rivera', 'Jordan Blake', 'Riley Chen', 'Casey Kim', 'Taylor Reed', 'Jamie Cruz', 'Drew Parker', 'Quinn Lee', 'Avery Stone', 'Noah West', 'Mia Frost'];
const rand = (n: number) => Math.floor(Math.random() * n);

function pickBotMove(board: Board, color: PieceColor): Move | null {
  const moves = legalMoves(board, color);
  if (moves.length === 0) return null;
  const maxCap = Math.max(...moves.map((m) => m.captures.length));
  const best = moves.filter((m) => m.captures.length === maxCap);
  return best[rand(best.length)];
}

function useMe(): Player {
  const { session } = useSession();
  const [me, setMe] = useState<Player>({ name: 'You', avatar: null });
  useEffect(() => {
    if (!session?.user) return;
    supabase.from('profiles').select('username, avatar_url').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setMe({ name: data?.username || 'You', avatar: data?.avatar_url || null }));
  }, [session?.user?.id]);
  return me;
}

export default function Draughts() {
  const { roomCode, mp } = useLocalSearchParams<{ roomCode?: string; mp?: string }>();
  if (roomCode) return <OnlineDraughts roomCode={roomCode} />;
  if (mp === 'online') return <VersusJoin />;
  return <BotDraughts />;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ uri, name, size = 48 }: { uri: string | null; name: string; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.extrabold, fontSize: size * 0.4, color: colors.textMuted }}>{(name?.[0] || '?').toUpperCase()}</Text>
    </View>
  );
}

// ── Shell (header menu + scoreboard + board + result) ─────────────────────────
function Shell({
  me, opp, myScore, oppScore, board, myColor, myTurn, onMove, result, onRematch, showRematch, children,
}: {
  me: Player; opp: Player; myScore: number; oppScore: number;
  board: Board | null; myColor: PieceColor | null; myTurn: boolean; onMove: (m: Move) => void;
  result: string | null; onRematch?: () => void; showRematch?: boolean; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const quit = () => { setMenu(false); router.replace('/home'); };

  return (
    <View style={styles.root}>
      <GradientFill colors={THEME_BG} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* menu */}
        <View style={styles.topRow}>
          <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]} onPress={() => setMenu(true)} accessibilityLabel="Menu">
            <FontAwesome name="ellipsis-h" size={16} color={colors.text} />
          </Pressable>
        </View>

        {/* scoreboard */}
        <View style={styles.scoreboard}>
          <View style={styles.player}>
            <Avatar uri={me.avatar} name={me.name} size={46} />
            <Text style={styles.pName} numberOfLines={1}>{me.name}</Text>
          </View>
          <View style={styles.scoreCenter}>
            <Text style={styles.score}>{myScore}</Text>
            <Text style={styles.vs}>VS</Text>
            <Text style={styles.score}>{oppScore}</Text>
          </View>
          <View style={[styles.player, { alignItems: 'flex-end' }]}>
            <Avatar uri={opp.avatar} name={opp.name} size={46} />
            <Text style={styles.pName} numberOfLines={1}>{opp.name}</Text>
          </View>
        </View>

        <View style={styles.boardWrap}>
          {board && <DraughtsBoard board={board} myColor={myColor} myTurn={myTurn} onMove={onMove} />}
        </View>

        {result && (
          <View style={styles.result}>
            <Text style={styles.resultText}>{result}</Text>
            {showRematch && onRematch && (
              <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={onRematch}>
                <View style={styles.ctaInner}><GradientFill colors={THEME} /><Text style={styles.ctaText}>Rematch</Text></View>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>

      {/* menu modal */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.scrim} onPress={() => setMenu(false)} />
        <View style={styles.menuSheet}>
          <Pressable style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]} onPress={quit}>
            <FontAwesome name="sign-out" size={16} color={colors.danger} />
            <Text style={styles.menuRowText}>Quit game</Text>
          </Pressable>
        </View>
      </Modal>

      {children}
    </View>
  );
}

// ── Practice vs Bot ───────────────────────────────────────────────────────────
const HUMAN: PieceColor = 'b';
const BOT: PieceColor = 'r';

function BotDraughts({ opp: oppInit }: { opp?: Player }) {
  const me = useMe();
  const opp = oppInit ?? { name: 'Bot', avatar: AV_POOL[0] };
  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [turn, setTurn] = useState<PieceColor>(HUMAN);
  const [winner, setWinner] = useState<PieceColor | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const boardRef = useRef(board);
  boardRef.current = board;

  const finish = (w: PieceColor) => {
    setWinner(w);
    if (w === HUMAN) setMyScore((s) => s + 1); else setOppScore((s) => s + 1);
  };
  const commit = (b: Board, move: Move, mover: PieceColor) => {
    const next = applyMove(b, move);
    setBoard(next);
    const other: PieceColor = mover === 'b' ? 'r' : 'b';
    if (isLost(next, other)) { finish(mover); setTurn(mover); } else setTurn(other);
  };
  const onMove = (move: Move) => { if (turn === HUMAN && !winner) commit(board, move, HUMAN); };

  useEffect(() => {
    if (turn !== BOT || winner) return;
    const t = setTimeout(() => {
      const move = pickBotMove(boardRef.current, BOT);
      if (!move) { finish(HUMAN); setTurn(HUMAN); return; }
      commit(boardRef.current, move, BOT);
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, winner]);

  useEffect(() => {
    if (winner || turn !== HUMAN) return;
    if (legalMoves(board, HUMAN).length === 0) finish(BOT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, board, winner]);

  const rematch = () => { setBoard(initialBoard()); setTurn(HUMAN); setWinner(null); };

  return (
    <Shell
      me={me} opp={opp} myScore={myScore} oppScore={oppScore}
      board={board} myColor={HUMAN} myTurn={turn === HUMAN && !winner} onMove={onMove}
      result={winner ? (winner === HUMAN ? '🏆  You win!' : `${opp.name} wins`) : null}
      onRematch={rematch} showRematch
    />
  );
}

// ── Versus join (matchmaking) ─────────────────────────────────────────────────
function VersusJoin() {
  const router = useRouter();
  const me = useMe();
  const { session } = useSession();
  const meId = session?.user?.id ?? null;

  const [phase, setPhase] = useState<'searching' | 'online' | 'bot'>('searching');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [flashUri, setFlashUri] = useState(AV_POOL[0]);
  const [botOpp, setBotOpp] = useState<Player | null>(null);

  useEffect(() => {
    if (!meId) return;
    let active = true;
    (async () => {
      const { data: room, error } = await supabase.rpc('matchmake_draughts');
      if (!active) return;
      if (error || !room) { setPhase('bot'); return; }
      setRoomCode(room.code);
      setRoomId(room.id);
      if (room.status === 'active') setPhase('online');
    })();
    return () => { active = false; };
  }, [meId]);

  // Flash random photos in the opponent slot.
  useEffect(() => {
    if (phase !== 'searching' || botOpp) return;
    const id = setInterval(() => setFlashUri(AV_POOL[rand(AV_POOL.length)]), 130);
    return () => clearInterval(id);
  }, [phase, botOpp]);

  // Listen for a real join; else settle on a (disguised) bot after 15s.
  useEffect(() => {
    if (phase !== 'searching' || !roomId) return;
    const ch = supabase
      .channel(`mm_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        ({ new: row }: any) => { if (row?.status === 'active') setPhase('online'); })
      .subscribe();
    const timer = setTimeout(() => {
      supabase.rpc('cancel_matchmaking', { p_room: roomId });
      const opp: Player = { name: BOT_NAMES[rand(BOT_NAMES.length)], avatar: AV_POOL[rand(AV_POOL.length)] };
      setBotOpp(opp);                     // freeze the flashing on this identity
      setFlashUri(opp.avatar!);
      setTimeout(() => setPhase('bot'), 1200);
    }, 15000);
    return () => { void supabase.removeChannel(ch); clearTimeout(timer); };
  }, [phase, roomId]);

  const cancel = () => { if (roomId) supabase.rpc('cancel_matchmaking', { p_room: roomId }); router.back(); };

  if (phase === 'online' && roomCode) return <OnlineDraughts roomCode={roomCode} />;
  if (phase === 'bot') return <BotDraughts opp={botOpp ?? undefined} />;

  return (
    <View style={styles.root}>
      <GradientFill colors={THEME_BG} />
      <SafeAreaView style={[styles.safe, { justifyContent: 'center' }]} edges={['top', 'bottom']}>
        <Text style={styles.joinHeading}>{botOpp ? 'Opponent found!' : 'Finding an opponent…'}</Text>
        <View style={styles.versus}>
          {/* me */}
          <View style={styles.vCard}>
            <Avatar uri={me.avatar} name={me.name} size={92} />
            <Text style={styles.vName} numberOfLines={1}>{me.name}</Text>
            <View style={styles.joinedPill}><Text style={styles.joinedText}>JOINED</Text></View>
          </View>

          <Text style={styles.bigVs}>VS</Text>

          {/* opponent (flashing → settled) */}
          <View style={styles.vCard}>
            <Animated.View entering={FadeIn}>
              <Avatar uri={flashUri} name="?" size={92} />
            </Animated.View>
            <Text style={styles.vName} numberOfLines={1}>{botOpp ? botOpp.name : 'Searching…'}</Text>
            <View style={[styles.joinedPill, !botOpp && { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.joinedText, !botOpp && { color: colors.textMuted }]}>{botOpp ? 'JOINED' : 'WAITING'}</Text>
            </View>
          </View>
        </View>

        {!botOpp && (
          <Pressable onPress={cancel} hitSlop={10} style={{ marginTop: space.xl, alignSelf: 'center' }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Online 1v1 ────────────────────────────────────────────────────────────────
type RoomState = { board: Board; turn: PieceColor; status: 'playing' | 'done'; winner: PieceColor | null };

function OnlineDraughts({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const me = useMe();
  const { session } = useSession();
  const meId = session?.user?.id ?? null;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<PieceColor | null>(null);
  const [opp, setOpp] = useState<Player>({ name: 'Opponent', avatar: null });
  const [state, setState] = useState<RoomState | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const scoredRef = useRef(false);

  const persist = (s: RoomState) => { if (roomId) supabase.rpc('update_room_state', { p_room: roomId, p_state: s as any }); };

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
        .from('room_players').select('user_id, display_name, profiles(username, avatar_url)').eq('room_id', room.id);
      const o = players?.find((p: any) => p.user_id !== meId);
      setOpp({
        name: o?.display_name || (o?.profiles as any)?.username || 'Opponent',
        avatar: (o?.profiles as any)?.avatar_url || null,
      });

      const ex = room.state as Partial<RoomState> | null;
      if (ex?.board) setState({ board: ex.board, turn: ex.turn ?? 'b', status: ex.status ?? 'playing', winner: ex.winner ?? null });
      else if (hostIsMe) {
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

  // Tally the result once.
  useEffect(() => {
    if (state?.status === 'done' && !scoredRef.current && myColor) {
      scoredRef.current = true;
      if (state.winner === myColor) setMyScore(1); else setOppScore(1);
    }
  }, [state?.status, state?.winner, myColor]);

  const onMove = (move: Move) => {
    if (!state || !myColor || state.status !== 'playing' || state.turn !== myColor) return;
    const next = applyMove(state.board, move);
    const other: PieceColor = myColor === 'b' ? 'r' : 'b';
    const won = isLost(next, other);
    const s: RoomState = { board: next, turn: won ? myColor : other, status: won ? 'done' : 'playing', winner: won ? myColor : null };
    setState(s); persist(s);
  };

  useEffect(() => {
    if (!state || !myColor || state.status !== 'playing' || state.turn !== myColor) return;
    if (legalMoves(state.board, myColor).length === 0) {
      const other: PieceColor = myColor === 'b' ? 'r' : 'b';
      const s: RoomState = { ...state, status: 'done', winner: other };
      setState(s); persist(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.turn, state?.status, myColor]);

  const result = state?.status === 'done' ? (state.winner === myColor ? '🏆  You win!' : `${opp.name} wins`) : null;

  return (
    <Shell
      me={me} opp={opp} myScore={myScore} oppScore={oppScore}
      board={state?.board ?? null} myColor={myColor} myTurn={!!state && state.status === 'playing' && state.turn === myColor} onMove={onMove}
      result={result} onRematch={() => router.replace('/home')} showRematch={false}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131009' },
  safe: { flex: 1, paddingHorizontal: space.lg },

  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: space.sm },
  menuBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },

  scoreboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, marginBottom: space.md },
  player: { width: 96, gap: 6 },
  pName: { fontFamily: font.bold, fontSize: 13, color: colors.text },
  scoreCenter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  score: { fontFamily: font.display, fontSize: 30, color: colors.white },
  vs: { fontFamily: font.extrabold, fontSize: 13, color: ACCENT, letterSpacing: 1 },

  boardWrap: { flex: 1, justifyContent: 'center' },
  result: { alignItems: 'center', gap: space.md, paddingBottom: space.lg },
  resultText: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.card, minWidth: 180 },
  ctaInner: { paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuSheet: { position: 'absolute', top: 90, right: space.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden', minWidth: 170, ...shadow.card },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14, paddingHorizontal: space.lg },
  menuRowText: { fontFamily: font.bold, fontSize: 15, color: colors.text },

  // versus join
  joinHeading: { fontFamily: font.extrabold, fontSize: 22, color: colors.text, textAlign: 'center', marginBottom: space.xl },
  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vCard: { flex: 1, alignItems: 'center', gap: space.sm },
  vName: { fontFamily: font.bold, fontSize: 15, color: colors.text, maxWidth: 120 },
  bigVs: { fontFamily: font.display, fontSize: 24, color: ACCENT, paddingHorizontal: space.md },
  joinedPill: { backgroundColor: 'rgba(74,222,128,0.16)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  joinedText: { fontFamily: font.extrabold, fontSize: 10, color: colors.success, letterSpacing: 1 },
  cancelText: { fontFamily: font.bold, fontSize: 14, color: ACCENT },
});
