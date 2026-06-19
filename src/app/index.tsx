import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { GradientFill } from '../components/GradientFill';
import { colors, font, gradients, radius, shadow } from '../theme';

const LINE_TUCK = 18; // how far the underline tucks left under the X's right leg
const LINE_H = 7;
const ANTLE_LIFT = 8; // raise "antle" a touch above the X's vertical centre

export default function Landing() {
  const [antleW, setAntleW] = useState(0); // measured width of "antle" so the line ends exactly at "e"
  const [xW, setXW] = useState(0); // measured width of "X" so the line starts at its right leg

  // reveal beats
  const antleIn = useSharedValue(0); // 1. "antle" rises in
  const xIn = useSharedValue(0); // 2. big "X" slides in -> "Xantle"
  const line = useSharedValue(0); // 3. right leg extends into the underline
  const cta = useSharedValue(0); // 4. button + tagline arrive

  useEffect(() => {
    antleIn.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) });
    xIn.value = withDelay(1700, withTiming(1, { duration: 1700, easing: Easing.out(Easing.back(1.3)) }));
    line.value = withDelay(4000, withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.cubic) }));
    cta.value = withDelay(7000, withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, []);

  const xStyle = useAnimatedStyle(() => ({
    opacity: xIn.value,
    transform: [{ translateX: (1 - xIn.value) * -80 }, { scale: 0.9 + xIn.value * 0.1 }],
  }));

  const antleStyle = useAnimatedStyle(() => ({
    opacity: antleIn.value,
    transform: [{ translateY: (1 - antleIn.value) * 14 - ANTLE_LIFT }],
  }));

  const lineStyle = useAnimatedStyle(() => ({
    width: line.value * (antleW + LINE_TUCK),
    opacity: line.value,
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: cta.value,
    transform: [{ translateY: (1 - cta.value) * 18 }],
  }));

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.logoBox}>
            <Animated.Text
              style={[styles.xBig, xStyle]}
              onLayout={(e) => setXW(e.nativeEvent.layout.width)}
            >
              X
            </Animated.Text>

            <Animated.Text
              style={[styles.antle, antleStyle]}
              onLayout={(e) => setAntleW(e.nativeEvent.layout.width)}
            >
              antle
            </Animated.Text>

            <Animated.View style={[styles.legLine, { left: xW - LINE_TUCK }, lineStyle]} />
          </View>
        </View>

        <Animated.View style={[styles.ctaWrap, ctaStyle]}>
          <Link href="/login" asChild>
            <Pressable style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaPressed]}>
              <View style={styles.ctaInner}>
                <GradientFill colors={gradients.button} />
                <Text style={styles.ctaText}>Get started</Text>
                <View style={styles.ctaArrowChip}>
                  <Text style={styles.ctaArrow}>→</Text>
                </View>
              </View>
            </Pressable>
          </Link>
          <Text style={styles.tagline}>Games for every gathering</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  safe: { flex: 1, paddingHorizontal: 28, paddingBottom: 34 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // logo row: full-height X with "antle" nested at its vertical middle
  logoBox: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  xBig: {
    fontFamily: font.display,
    fontSize: 104,
    lineHeight: 104,
    color: colors.text,
    includeFontPadding: false,
  },
  antle: {
    fontFamily: font.display,
    fontSize: 60,
    lineHeight: 60,
    color: colors.text,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  // the X's right leg, extended: a white line along the bottom, joined to the leg tip
  legLine: {
    position: 'absolute',
    bottom: 28,
    height: LINE_H,
    borderRadius: LINE_H / 2,
    backgroundColor: colors.text,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },

  ctaWrap: { alignSelf: 'stretch', alignItems: 'stretch', gap: 18 },
  ctaBtn: { borderRadius: radius.lg + 2, ...shadow.blueGlow },
  ctaPressed: { transform: [{ scale: 0.97 }], opacity: 0.97 },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: radius.lg + 2,
    paddingVertical: 20,
    paddingHorizontal: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  ctaText: { color: colors.white, fontFamily: font.extrabold, fontSize: 18.5, letterSpacing: 0.4 },
  ctaArrowChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: { color: colors.white, fontFamily: font.extrabold, fontSize: 17, marginTop: -1 },
  tagline: {
    fontFamily: font.semibold,
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
