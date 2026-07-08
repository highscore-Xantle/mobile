// Draughts — Practice vs Bot (stage 1: single-device, client-simulated
// opponent). Multiplayer over rooms/realtime is the next stage.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { GradientFill } from '../../components/GradientFill';
import DraughtsBoard from '../../components/games/DraughtsBoard';
import {
  applyMove, initialBoard, isLost, legalMoves,
  type Board, type Move, type PieceColor,
} from '../../lib/draughts';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

const HUMAN: PieceColor = 'b';   // black, sits at the bottom
const BOT: PieceColor = 'r';

// Bot: forced captures already come from the engine; prefer the longest
// capture chain, otherwise a random legal move.
function pickBotMove(board: Board): Move | null {
  const moves = legalMoves(board, BOT);
  if (moves.length === 0) return null;
  const maxCap = Math.max(...moves.map((m) => m.captures.length));
  const best = moves.filter((m) => m.captures.length === maxCap);
  return best[Math.floor(Math.random() * best.length)];
}

export default function Draughts() {
  const router = useRouter();
  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [turn, setTurn] = useState<PieceColor>(HUMAN);
  const [winner, setWinner] = useState<PieceColor | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const commit = (b: Board, move: Move, mover: PieceColor) => {
    const next = applyMove(b, move);
    setBoard(next);
    const opp: PieceColor = mover === 'b' ? 'r' : 'b';
    if (isLost(next, opp)) { setWinner(mover); setTurn(mover); }
    else setTurn(opp);
  };

  const onHumanMove = (move: Move) => {
    if (turn !== HUMAN || winner) return;
    commit(board, move, HUMAN);
  };

  // Bot's turn.
  useEffect(() => {
    if (turn !== BOT || winner) return;
    const t = setTimeout(() => {
      const move = pickBotMove(boardRef.current);
      if (!move) { setWinner(HUMAN); setTurn(HUMAN); return; }
      commit(boardRef.current, move, BOT);
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, winner]);

  // Human stuck with no legal moves → bot wins.
  useEffect(() => {
    if (winner || turn !== HUMAN) return;
    if (legalMoves(board, HUMAN).length === 0) { setWinner(BOT); }
  }, [turn, board, winner]);

  const rematch = () => {
    setBoard(initialBoard());
    setTurn(HUMAN);
    setWinner(null);
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={[colors.bgTop, colors.bgBottom]} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <FontAwesome name="chevron-left" size={16} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Draughts</Text>
          <View style={styles.iconBtn}>
            <FontAwesome name="android" size={16} color={colors.textMuted} />
          </View>
        </View>

        <Text style={styles.sub}>Practice vs Bot</Text>

        {/* Board */}
        <View style={styles.boardWrap}>
          <DraughtsBoard
            board={board}
            myColor={HUMAN}
            myTurn={turn === HUMAN && !winner}
            onMove={onHumanMove}
          />
        </View>

        {/* Win banner + rematch */}
        {winner && (
          <View style={styles.result}>
            <Text style={styles.resultText}>
              {winner === HUMAN ? '🏆  You win!' : '🤖  Bot wins'}
            </Text>
            <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={rematch}>
              <View style={styles.ctaInner}>
                <GradientFill colors={gradients.button} />
                <Text style={styles.ctaText}>Rematch</Text>
              </View>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
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
