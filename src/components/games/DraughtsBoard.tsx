// Draughts board (React Native port of love-meet's web board).
// Wooden frame, checker surface, red/white pieces with king crowns, gold
// legal-move dots, tap-to-select, and orientation flip so the viewer's own
// pieces sit at the bottom. Pieces animate to their destination (snap-fast).
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GradientFill } from '../GradientFill';
import {
  isLost, legalMoves, legalMovesFrom,
  type Board, type Move, type Piece, type PieceColor, type Square,
} from '../../lib/draughts';
import { colors, font } from '../../theme';

const GOLD_PIECE: [string, string] = ['#F0CE7A', '#A9791A'];   // 'r'
const BLACK_PIECE: [string, string] = ['#3A3A37', '#0C0C0B'];  // 'b'
const DARK_SQ = '#5B3B22';   // wood brown
const LIGHT_SQ = '#E6CBA0';  // tan
const GOLD = '#F5C451';

function AnimatedPiece({ piece, cell, flip, selected, canSelect }: {
  piece: Piece; cell: number; flip: boolean; selected: boolean; canSelect: boolean;
}) {
  const dr = flip ? 7 - piece.r : piece.r;
  const dc = flip ? 7 - piece.c : piece.c;
  const tx = useSharedValue(dc * cell);
  const ty = useSharedValue(dr * cell);
  const lift = useSharedValue(0);

  useEffect(() => {
    tx.value = withTiming(dc * cell, { duration: 130, easing: Easing.out(Easing.quad) });
    ty.value = withTiming(dr * cell, { duration: 130, easing: Easing.out(Easing.quad) });
  }, [dc, dr, cell]);
  useEffect(() => {
    lift.value = withTiming(selected ? 1 : 0, { duration: 150, easing: Easing.out(Easing.quad) });
  }, [selected]);

  const style = useAnimatedStyle(() => ({
    // Lift the selected piece up + scale it — reads as "picked up".
    transform: [
      { translateX: tx.value },
      { translateY: ty.value - lift.value * cell * 0.2 },
      { scale: 1 + lift.value * 0.16 },
    ],
  }));

  const disc = cell * 0.78;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: cell, height: cell, alignItems: 'center', justifyContent: 'center', zIndex: selected ? 20 : 1 }, style]}>
      <View
        style={{
          width: disc, height: disc, borderRadius: disc / 2,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: selected ? GOLD : canSelect ? 'rgba(245,196,81,0.55)' : 'rgba(0,0,0,0.35)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: selected ? 10 : 3 },
          shadowOpacity: selected ? 0.6 : 0.5,
          shadowRadius: selected ? 12 : 4,
          elevation: selected ? 16 : 5,
        }}
      >
        <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: disc / 2, overflow: 'hidden' }}>
          <GradientFill colors={piece.color === 'r' ? GOLD_PIECE : BLACK_PIECE} />
        </View>
        {/* gloss highlight */}
        <View style={{ position: 'absolute', top: disc * 0.12, left: disc * 0.2, width: disc * 0.4, height: disc * 0.26, borderRadius: disc * 0.2, backgroundColor: 'rgba(255,255,255,0.28)' }} />
        {piece.king && <Text style={{ fontSize: disc * 0.5 }}>👑</Text>}
      </View>
    </Animated.View>
  );
}

export default function DraughtsBoard({
  board, myColor, myTurn, onMove,
}: {
  board: Board;
  myColor: PieceColor | null;
  myTurn: boolean;
  onMove: (move: Move) => void;
}) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [surface, setSurface] = useState(0);
  const cell = surface / 8;

  const myLegal = useMemo(
    () => (myColor && myTurn ? legalMoves(board, myColor) : []),
    [board, myColor, myTurn],
  );
  useEffect(() => { setSelected(null); }, [board]);

  const movesFromSelected = useMemo<Move[]>(
    () => (selected && myColor ? legalMovesFrom(board, selected, myColor) : []),
    [selected, board, myColor],
  );
  const destAt = (r: number, c: number) => movesFromSelected.find((m) => m.to.r === r && m.to.c === c) ?? null;
  const isMyPiece = (r: number, c: number) => !!board.find((p) => p.r === r && p.c === c && p.color === myColor);
  const hasLegalMove = (r: number, c: number) => myLegal.some((m) => m.from.r === r && m.from.c === c);

  function onSquareTap(r: number, c: number) {
    if (!myColor || !myTurn) return;
    const dest = destAt(r, c);
    if (dest) { onMove(dest); setSelected(null); return; }
    if (isMyPiece(r, c) && hasLegalMove(r, c)) { setSelected({ r, c }); return; }
    setSelected(null);
  }

  const flip = myColor === 'r';
  const toDisp = (r: number, c: number) => ({ dr: flip ? 7 - r : r, dc: flip ? 7 - c : c });
  const cols = flip ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const rows = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const captureAvailable = myLegal.some((m) => m.captures.length > 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>
        <GradientFill colors={['#6D3F17', '#2D1808']} />

        {/* top column letters */}
        <View style={styles.axisRow}>
          {cols.map((l) => <Text key={`tc-${l}`} style={styles.axisText}>{l}</Text>)}
        </View>

        <View style={styles.midRow}>
          <View style={styles.rowNums}>{rows.map((n) => <Text key={`lr-${n}`} style={styles.axisText}>{n}</Text>)}</View>

          {/* playing surface */}
          <View
            style={styles.surface}
            onLayout={(e: LayoutChangeEvent) => setSurface(e.nativeEvent.layout.width)}
          >
            {/* cells */}
            {Array.from({ length: 64 }).map((_, i) => {
              const r = Math.floor(i / 8), c = i % 8;
              const { dr, dc } = toDisp(r, c);
              const dark = (r + c) % 2 === 1;
              const dest = destAt(r, c);
              const sel = !!selected && selected.r === r && selected.c === c;
              return (
                <Pressable
                  key={`cell-${r}-${c}`}
                  onPress={() => onSquareTap(r, c)}
                  disabled={!myTurn || !dark}
                  style={{
                    position: 'absolute',
                    top: `${dr * 12.5}%`, left: `${dc * 12.5}%`,
                    width: '12.5%', height: '12.5%',
                    backgroundColor: dark ? DARK_SQ : LIGHT_SQ,
                    borderWidth: sel ? 2 : 0, borderColor: GOLD,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {dest && <View style={styles.destDot} />}
                </Pressable>
              );
            })}

            {/* pieces */}
            {cell > 0 && board.map((p) => (
              <AnimatedPiece
                key={p.id}
                piece={p}
                cell={cell}
                flip={flip}
                selected={!!selected && selected.r === p.r && selected.c === p.c}
                canSelect={p.color === myColor && hasLegalMove(p.r, p.c)}
              />
            ))}
          </View>

          <View style={styles.rowNums}>{rows.map((n) => <Text key={`rr-${n}`} style={styles.axisText}>{n}</Text>)}</View>
        </View>

        {/* bottom column letters */}
        <View style={styles.axisRow}>
          {cols.map((l) => <Text key={`bc-${l}`} style={styles.axisText}>{l}</Text>)}
        </View>
      </View>

      {/* status */}
      <Text style={styles.status}>
        {!myColor ? "You're watching this match."
          : myTurn ? (myLegal.length === 0 ? 'No legal moves…'
            : `Your turn${captureAvailable ? ' — capture available!' : ''}`)
          : 'Waiting for the other player…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  frame: {
    padding: 12, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 14,
  },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 3 },
  axisText: { flex: 1, textAlign: 'center', fontFamily: font.bold, fontSize: 10, color: 'rgba(253,230,138,0.8)' },
  midRow: { flexDirection: 'row', alignItems: 'stretch' },
  rowNums: { justifyContent: 'space-around', paddingHorizontal: 3 },
  surface: {
    flex: 1, aspectRatio: 1, borderRadius: 6, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.6)',
  },
  destDot: { width: '34%', height: '34%', borderRadius: 999, backgroundColor: GOLD, opacity: 0.85 },
  status: { marginTop: 12, textAlign: 'center', fontFamily: font.semibold, fontSize: 14, color: colors.text },
});
