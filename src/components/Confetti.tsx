import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const COLORS = ['#3B9DE7', '#4ADE80', '#FBBF24', '#F87171', '#C084FC', '#FFFFFF'];
const PIECE_COUNT = 32;
const FALL_DISTANCE = 480;

function ConfettiPiece({ index, width }: { index: number; width: number }) {
  const progress = useSharedValue(0);

  // Randomized once per piece — module-level Math.random is fine here, this is
  // a regular React component render, not a deterministic multiplayer path.
  const piece = useMemo(() => ({
    left: Math.random() * width,
    color: COLORS[index % COLORS.length],
    size: 6 + Math.random() * 7,
    delay: Math.random() * 220,
    duration: 1300 + Math.random() * 800,
    drift: (Math.random() - 0.5) * 90,
    spin: 180 + Math.random() * 360,
    circle: Math.random() > 0.5,
  }), [index, width]);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: piece.duration, easing: Easing.out(Easing.quad) }),
    );
  }, [piece.delay, piece.duration, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.8 ? 1 : Math.max(0, 1 - (p - 0.8) / 0.2),
      transform: [
        { translateY: p * FALL_DISTANCE },
        { translateX: p * piece.drift },
        { rotate: `${piece.spin * p}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        style,
        {
          left: piece.left,
          width: piece.size,
          height: piece.size,
          backgroundColor: piece.color,
          borderRadius: piece.circle ? piece.size / 2 : 2,
        },
      ]}
    />
  );
}

/** Fire-once confetti burst — mount with `active` true to play it. */
export function Confetti({ active }: { active: boolean }) {
  const { width } = useWindowDimensions();
  if (!active) return null;
  return (
    <Animated.View pointerEvents="none" style={styles.root}>
      {Array.from({ length: PIECE_COUNT }, (_, i) => (
        <ConfettiPiece key={i} index={i} width={width} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', zIndex: 10 },
  piece: { position: 'absolute', top: -20 },
});
