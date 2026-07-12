import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { playSound } from '../lib/sounds';

const PREVIEW_MS = 5000;
const GAP = 2;

export interface PixelBoardProps {
  image: string;
  seed: number;
  grid: number;
  /** Epoch ms when the round was started server-side. Preview ends at startedAt + 5000. */
  startedAt: number;
  /** Freeze the board — used when this client already solved or the round is done. */
  locked: boolean;
  onSolve: (timeMs: number) => void;
}

export default function PixelBoard({ image, seed, grid, startedAt, locked, onSolve }: PixelBoardProps) {
  const n = grid * grid;
  const { width } = useWindowDimensions();
  // Pixel-perfect tile sizes — non-integer tiles cause blurry rendering.
  const boardSize = Math.min(width - 48, 360);
  const tileSize = Math.floor((boardSize - GAP * (grid - 1)) / grid);
  const actualBoard = tileSize * grid + GAP * (grid - 1);

  const raceStart = startedAt + PREVIEW_MS;

  const [order, setOrder] = useState<number[]>(() => identity(n));
  const [phase, setPhase] = useState<'preview' | 'play' | 'solved'>('preview');
  const [selected, setSelected] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [moves, setMoves] = useState(0);
  const [countdown, setCountdown] = useState(Math.ceil(PREVIEW_MS / 1000));
  const solvedRef = useRef(false);
  const playStartRef = useRef(0);

  // Full reset when a new puzzle arrives (new round or replay).
  useEffect(() => {
    solvedRef.current = false;
    setOrder(identity(n));
    setPhase('preview');
    setSelected(null);
    setElapsed(0);
    setMoves(0);
    setCountdown(Math.ceil(PREVIEW_MS / 1000));
  }, [seed, grid, startedAt, n]);

  // Preview countdown → scatter at raceStart (synced with server clock).
  useEffect(() => {
    if (phase !== 'preview') return;
    const tick = () => {
      const remaining = raceStart - Date.now();
      if (remaining <= 0) {
        setOrder(seededShuffle(seed, n));
        setMoves(0);
        playStartRef.current = Date.now();
        setPhase('play');
        setCountdown(0);
      } else {
        setCountdown(Math.ceil(remaining / 1000));
      }
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [phase, raceStart, seed, n]);

  // Running clock during play.
  useEffect(() => {
    if (phase !== 'play') return;
    const iv = setInterval(() => setElapsed(Date.now() - playStartRef.current), 100);
    return () => clearInterval(iv);
  }, [phase]);

  function tap(slot: number) {
    if (phase !== 'play' || locked) return;
    playSound('click');
    if (selected === null) { setSelected(slot); return; }
    if (selected === slot) { setSelected(null); return; }
    const from = selected;
    setSelected(null);
    setOrder(prev => {
      const next = [...prev];
      [next[from], next[slot]] = [next[slot], next[from]];
      if (!solvedRef.current && isSolved(next)) {
        solvedRef.current = true;
        const timeMs = Math.max(0, Date.now() - raceStart);
        setPhase('solved');
        setElapsed(timeMs);
        playSound('correct');
        onSolve(timeMs);
      }
      return next;
    });
    setMoves(m => m + 1);
  }

  // In preview: show identity order (whole image). In play/solved: show shuffled order.
  const displayOrder = phase === 'preview' ? identity(n) : order;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.timerRow}>
        <Text style={styles.timerText}>
          {phase === 'preview'
            ? 'Study the image…'
            : `⏱ ${(elapsed / 1000).toFixed(1)}s`}
        </Text>
        {phase === 'play' && (
          <Text style={styles.movesText}>{moves} move{moves === 1 ? '' : 's'}</Text>
        )}
      </View>

      <View style={{ width: actualBoard, height: actualBoard }}>
        {Array.from({ length: grid }, (_, row) => (
          <View
            key={row}
            style={{ flexDirection: 'row', gap: GAP, marginBottom: row < grid - 1 ? GAP : 0 }}
          >
            {Array.from({ length: grid }, (_, col) => {
              const slot = row * grid + col;
              const tile = displayOrder[slot];
              const tileRow = Math.floor(tile / grid);
              const tileCol = tile % grid;
              const isSelected = selected === slot && phase === 'play';

              return (
                <Pressable key={col} onPress={() => tap(slot)}>
                  <View
                    style={[
                      styles.tileContainer,
                      { width: tileSize, height: tileSize },
                      isSelected && styles.tileSelected,
                    ]}
                  >
                    <Image
                      source={{ uri: image }}
                      style={{
                        width: tileSize * grid,
                        height: tileSize * grid,
                        position: 'absolute',
                        left: -(tileCol * tileSize),
                        top: -(tileRow * tileSize),
                      }}
                      resizeMode="stretch"
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        {phase === 'preview' && countdown > 0 && (
          <View style={[StyleSheet.absoluteFill, styles.countdownOverlay]} pointerEvents="none">
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}

        {phase === 'solved' && (
          <View style={[StyleSheet.absoluteFill, styles.solvedOverlay]} pointerEvents="none">
            <Text style={styles.solvedEmoji}>🏆</Text>
            <Text style={styles.solvedLabel}>Solved!</Text>
            <Text style={styles.solvedTime}>
              {(elapsed / 1000).toFixed(1)}s · {moves} move{moves === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>

      {phase === 'play' && (
        <Text style={styles.hint}>Tap two tiles to swap them</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  timerText: { fontFamily: 'Nunito_700Bold', fontSize: 14, color: '#EAF0FA' },
  movesText: { fontFamily: 'Nunito_600SemiBold', fontSize: 12, color: '#939BA7' },

  tileContainer: {
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#303747',
  },
  tileSelected: {
    borderWidth: 2.5,
    borderColor: '#FBBF24',
  },

  countdownOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  countdownText: {
    fontFamily: 'Nunito_900Black',
    fontSize: 72,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },

  solvedOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    gap: 6,
  },
  solvedEmoji: { fontSize: 52 },
  solvedLabel: { fontFamily: 'Nunito_900Black', fontSize: 26, color: '#EAF0FA' },
  solvedTime: { fontFamily: 'Nunito_600SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.8)' },

  hint: {
    marginTop: 10,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 12,
    color: '#939BA7',
    textAlign: 'center',
  },
});

// ---- Pure puzzle helpers (identical to web PixelBoard) ----

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function isSolved(a: number[]): boolean {
  return a.every((v, i) => v === i);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(seed: number, n: number): number[] {
  const rand = mulberry32(seed);
  const a = identity(n);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Guarantee the shuffle is never already solved.
  return isSolved(a) ? seededShuffle(seed + 1, n) : a;
}
