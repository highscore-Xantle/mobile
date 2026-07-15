/**
 * Glass — the surface primitive. Every card, sheet, chip and nav bar is one of
 * these, so depth stays consistent across iOS, Android and web.
 *
 * Anatomy (this is what separates "glass" from "a grey box"):
 *   1. BlurView            — the frosted backdrop (real backdrop-filter on web)
 *   2. rgba(255,255,255,.05) fill  — the pane itself
 *   3. hairline border     — 1px, so the pane has an edge
 *   4. a brighter TOP edge — implies a light source above. Do not skip this.
 *
 * WHY TWO VIEWS: iOS clips a shadow when `overflow: hidden` is on the same view,
 * so the OUTER view carries the shadow/glow and the INNER view does the clipping.
 * `style` is applied to the INNER view — that is where the children live, so a
 * caller passing `padding`/`flexDirection` gets what they expect. (Applying it
 * to the outer view instead is what produced the "content trapped in a tiny box
 * inside a giant empty card" bug.)
 */
import { useRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, glass, motion, radius as R, shadow } from '../../theme';

interface GlassProps {
  children?: ReactNode;
  /** Layout + padding for the card CONTENT. */
  style?: StyleProp<ViewStyle>;
  /** Sizing/margin for the outer shell (width, margin, transform). */
  outerStyle?: StyleProp<ViewStyle>;
  radius?: number;
  raised?: boolean;
  /** Accent halo behind the card. */
  glow?: string;
  /** Blur strength. 0 disables the BlurView (cheaper in long lists). */
  intensity?: number;
}

export function GlassCard({
  children, style, outerStyle, radius = R.md, raised = false, glow, intensity = glass.blurIntensity,
}: GlassProps) {
  return (
    <View
      style={[
        { borderRadius: radius },
        raised && shadow.card,
        glow ? shadow.glow(glow) : null,
        outerStyle,
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius, borderColor: glass.border }, style]}>
        {/* Backdrop layers sit BEHIND the children. */}
        {intensity > 0 && (
          <BlurView
            intensity={intensity}
            tint={glass.tint}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glass.fill }]} />
        {/* The light source: a brighter 1px top edge. */}
        <View pointerEvents="none" style={[styles.topHighlight, { backgroundColor: glass.topHighlight }]} />
        {children}
      </View>
    </View>
  );
}

/**
 * PressableGlass — a GlassCard that behaves like a physical object: scales down
 * on press, springs back, and fires a haptic on native.
 */
export function PressableGlass({
  children, style, outerStyle, onPress, radius = R.md, raised = true, glow, disabled, intensity,
}: GlassProps & { onPress?: () => void; disabled?: boolean }) {
  const pressed = useSharedValue(0);
  // Absorb double-taps: most consumers navigate onPress, and a double-tap
  // pushed the target screen twice (duplicate stack entries break back).
  const lastPressRef = useRef(0);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(1 - pressed.value * (1 - motion.pressScale), motion.spring) }],
    opacity: withTiming(disabled ? 0.45 : 1, { duration: motion.duration.micro }),
  }));

  return (
    <Animated.View style={[aStyle, outerStyle]}>
      <Pressable
        disabled={disabled}
        onPressIn={() => {
          pressed.value = 1;
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => { pressed.value = 0; }}
        onPress={() => {
          const now = Date.now();
          if (now - lastPressRef.current < 600) return;
          lastPressRef.current = now;
          onPress?.();
        }}
        style={Platform.OS === 'web' && !disabled ? ({ cursor: 'pointer' } as ViewStyle) : undefined}
      >
        <GlassCard style={style} radius={radius} raised={raised} glow={glow} intensity={intensity}>
          {children}
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surfaceSolid, // opaque base under the blur
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
