import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { GradientFill } from '../../components/GradientFill';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

const GAME_LABELS: Record<string, string> = {
  'pixel-rush': 'Pixel Rush',
  'number-duel': 'Number Duel',
};

/**
 * Web fallback for shared invite links — reached when someone taps a Xantle
 * invite link without the app installed (a bare xantle:// deep link can't
 * open in a browser at all, so this is what buildInviteLink points at
 * instead once EXPO_PUBLIC_WEB_URL is configured). Also reachable by anyone
 * WITH the app installed, in which case tapping through opens it directly.
 */
export default function JoinLanding() {
  const { code, kind } = useLocalSearchParams<{ code: string; kind?: string }>();
  const [attempted, setAttempted] = useState(false);

  const gameLabel = GAME_LABELS[kind ?? ''] ?? 'a game';
  const deepLink = kind === 'pixel-rush' ? `xantle://game/${code}` : `xantle://room/${code}`;

  const openApp = () => {
    setAttempted(true);
    Linking.openURL(deepLink).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🎮</Text>
          <Text style={styles.title}>You're invited to {gameLabel}!</Text>

          <Text style={styles.codeLabel}>JOIN CODE</Text>
          <Text style={styles.code}>{code}</Text>

          <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={openApp}>
            <GradientFill colors={gradients.button} />
            <Text style={styles.ctaText}>Open in Xantle →</Text>
          </Pressable>

          <Text style={styles.hint}>
            {attempted
              ? "Nothing happened? You'll need the Xantle app installed first — ask whoever invited you, or come back here once it's installed."
              : `Already have Xantle? Tap above to jump straight in. Don't have it yet? Once installed, enter code ${code || ''} from the home screen.`}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.xl,
    alignItems: 'center',
    gap: space.sm,
    ...shadow.card,
  },
  emoji: { fontSize: 48, marginBottom: space.xs },
  title: { fontFamily: font.black, fontSize: 22, color: colors.text, textAlign: 'center' },
  codeLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textFaint, letterSpacing: 1.5, marginTop: space.md },
  code: { fontFamily: font.display, fontSize: 40, color: colors.cyan, letterSpacing: 6, marginBottom: space.sm },
  cta: { alignSelf: 'stretch', borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow, marginTop: space.sm },
  ctaText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white, textAlign: 'center', paddingVertical: 16 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
  hint: {
    fontFamily: font.semibold, fontSize: 13, color: colors.textMuted,
    textAlign: 'center', lineHeight: 19, marginTop: space.sm,
  },
});
