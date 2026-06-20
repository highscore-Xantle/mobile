import { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * RolloverReveal — B2 design system primitive.
 *
 * Wraps children in a left→right cinematic sweep: content starts offscreen
 * to the left and rolls in, while simultaneously fading from 0 → 1.
 *
 * Usage:
 *   <RolloverReveal delay={200}>
 *     <YourContent />
 *   </RolloverReveal>
 *
 * Props:
 *   children   — what to reveal
 *   delay      — ms before animation starts (default 0)
 *   duration   — ms for the sweep (default 800)
 *   style      — optional extra style on the outer wrapper
 */
export function RolloverReveal({
  children,
  delay = 0,
  duration = 800,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: object;
}) {
  const translateX = useSharedValue(-SCREEN_W);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const easing = Easing.out(Easing.exp);
    translateX.value = withDelay(delay, withTiming(0, { duration, easing }));
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: duration * 0.6, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={[styles.clip, style]}>
      <Animated.View style={animStyle}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow:hidden so the pre-reveal off-screen position doesn't bleed into layout
  clip: { overflow: 'hidden' },
});
