/**
 * AmbientCanvas — the cinematic backdrop every screen sits on.
 *
 * Two things make a dark UI feel premium rather than flat:
 *   1. the canvas is a GRADIENT, never a flat fill (and never pure #000),
 *   2. the light MOVES — slow, barely-perceptible blurred blobs drifting behind
 *      the content.
 *
 * The blobs are tinted with the live accent, so the whole app re-lights itself
 * when you scroll to a different game (see lib/accent.tsx).
 *
 * Motion is honest about reduced-motion: if the OS asks for less, the blobs are
 * placed but never animate.
 */
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, AccessibilityInfo, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useState } from 'react';
import { colors, gradients, motion } from '../../theme';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

/** One slowly-drifting blurred light. */
function Blob({
  color, size, x, y, delay, reduced,
}: {
  color: string; size: number; x: number; y: number; delay: number; reduced: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withTiming(1, { duration: 14000 + delay, easing: Easing.inOut(Easing.sin) }),
      -1,
      true, // reverse — a drift, not a loop that snaps back
    );
  }, [reduced, delay, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x + t.value * 40 - 20 },
      { translateY: y + t.value * 56 - 28 },
      { scale: 1 + t.value * 0.12 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.1,
          // Native gets a real blur via a huge shadow radius; web gets a CSS filter.
          ...Platform.select({
            web: { filter: `blur(${Math.round(size / 3)}px)` } as object,
            default: {
              shadowColor: color,
              shadowOpacity: 0.9,
              shadowRadius: size / 3,
              shadowOffset: { width: 0, height: 0 },
            },
          }),
        },
        style,
      ]}
    />
  );
}

export function AmbientCanvas({ accent = colors.blue }: { accent?: string }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();

  return (
    <>
      <LinearGradient
        colors={gradients.background}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <Blob color={accent}          size={width * 0.9} x={-width * 0.25} y={-height * 0.08} delay={0}    reduced={reduced} />
      <Blob color={colors.blueDeep} size={width * 0.8} x={width * 0.45}  y={height * 0.18}  delay={2600} reduced={reduced} />
      <Blob color={colors.cyan}     size={width * 0.6} x={width * 0.05}  y={height * 0.62}  delay={5200} reduced={reduced} />
    </>
  );
}

export { useReducedMotion };
export const AMBIENT_MOTION = motion; // re-export so screens don't re-import
