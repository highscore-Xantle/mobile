/**
 * Glass — the surface primitive. Every card, sheet, chip and nav bar is one of
 * these, so depth stays consistent across iOS, Android and web.
 *
 * Anatomy (this is what separates "glass" from "a grey box"):
 *   1. BlurView            — the frosted backdrop (real backdrop-filter on web)
 *   2. rgba(255,255,255,.05) fill  — the pane itself
 *   3. hairline border     — 1px, so the pane has an edge
 *   4. a brighter TOP edge — implies a light source above. Do not skip this.
 */
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, glass, motion, radius as R, shadow } from '../../theme';

interface GlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius. Defaults to the system default (16). */
  radius?: number;
  /** Lift the card off the canvas with a drop shadow. */
  raised?: boolean;
  /** Accent halo behind the card (used for the active/primary surface). */
  glow?: string;
  /** Blur strength. 0 disables the BlurView (cheaper in long lists). */
  intensity?: number;
}

export function GlassCard({
  children, style, radius = R.md, raised = false, glow, intensity = glass.blurIntensity,
}: GlassProps) {
  return (
    <View
      style={[
        { borderRadius: radius },
        raised && shadow.card,
        glow ? shadow.glow(glow) : null,
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius, borderColor: glass.border }]}>
        {intensity > 0 && (
          <BlurView
            intensity={intensity}
            tint={glass.tint}
            style={StyleSheet.absoluteFill}
            // Android's BlurView is expensive and can look muddy; the fill below
            // carries the surface there.
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.fill }]} />
        {/* The light source: a brighter 1px top edge. */}
        <View style={[styles.topHighlight, { backgroundColor: glass.topHighlight }]} />
        {children}
      </View>
    </View>
  );
}

/**
 * PressableGlass — a GlassCard that responds like a physical object: scales down
 * on press (150ms), springs back, and fires a haptic on native.
 */
export function PressableGlass({
  children, style, onPress, radius = R.md, raised = true, glow, disabled,
}: GlassProps & { onPress?: () => void; disabled?: boolean }) {
  const pressed = useSharedValue(0);

  const aStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(1 - pressed.value * (1 - motion.pressScale), motion.spring) },
    ],
    opacity: withTiming(disabled ? 0.5 : 1, { duration: motion.duration.micro }),
  }));

  return (
    <Animated.View style={aStyle}>
      <Pressable
        disabled={disabled}
        onPressIn={() => {
          pressed.value = 1;
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => { pressed.value = 0; }}
        onPress={onPress}
        // Web: show a real pointer + keyboard focus ring (engine checklist).
        style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : undefined}
      >
        <GlassCard style={style} radius={radius} raised={raised} glow={glow}>
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
