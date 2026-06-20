import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '../lib/useSession';
import { GradientFill } from '../components/GradientFill';
import { RolloverReveal } from '../components/RolloverReveal';
import {
  colors,
  font,
  gradients,
  radius,
  shadow,
  space,
  text as themeText,
} from '../theme';

export default function Home() {
  const router = useRouter();
  const { session, loading } = useSession();

  // Auth guard — redirect to login if there's no active session
  useEffect(() => {
    if (!loading && !session) {
      router.replace('/login');
    }
  }, [session, loading]);

  const handleMenuPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Day 4 / D3: opens the menu drawer (Sam's task)
  };

  const handleAvatarPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Day 4 / D3: navigates to profile screen (Sam's task)
  };

  // Derive initials — prefer username from profile metadata, fallback to email first char
  const avatarLetter =
    (session?.user?.user_metadata?.username as string)?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ??
    '?';

  // Don't render anything while the session is being resolved
  if (loading || !session) return null;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />

      <SafeAreaView style={styles.safe}>

        {/* ── Top Bar ─────────────────────────────── */}
        <View style={styles.topBar}>

          {/* Avatar chip — left */}
          <Pressable
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            onPress={handleAvatarPress}
          >
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          </Pressable>

          {/* App wordmark — centre */}
          <Text style={styles.wordmark}>Xantle</Text>

          {/* Hamburger menu — right */}
          <Pressable
            style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
            onPress={handleMenuPress}
          >
            <View style={styles.menuBar} />
            <View style={[styles.menuBar, { width: 18 }]} />
            <View style={[styles.menuBar, { width: 14 }]} />
          </Pressable>

        </View>

        {/* ── Hero — roll-over reveal ──────────────── */}
        <RolloverReveal delay={100} duration={900} style={styles.heroSection}>
          <View style={styles.heroCard}>
            <GradientFill colors={gradients.featured} />
            <Text style={styles.heroTitle}>Game Night{'\n'}Starts Here.</Text>
            <Text style={styles.heroSub}>
              Pick a game. Gather your crew.{'\n'}Let the chaos begin.
            </Text>
          </View>
        </RolloverReveal>

        {/* ── Games section — second reveal, offset delay ─ */}
        <RolloverReveal delay={380} duration={850} style={styles.gamesSection}>
          <Text style={themeText.h2}>What do you want to play?</Text>
          <Text style={[themeText.hint, { marginTop: space.xs, marginBottom: space.md }]}>
            Game grid coming Day 4 →
          </Text>

          {/* Placeholder game cards (replaced on Day 4) */}
          <View style={styles.cardRow}>
            {PLACEHOLDER_GAMES.map((g) => (
              <Pressable
                key={g.label}
                style={({ pressed }) => [styles.gameCard, pressed && styles.pressed]}
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              >
                <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
                <Text style={styles.gameEmoji}>{g.emoji}</Text>
                <Text style={styles.gameLabel}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        </RolloverReveal>

      </SafeAreaView>
    </View>
  );
}

const PLACEHOLDER_GAMES = [
  { emoji: '🎯', label: 'Game 1' },
  { emoji: '🎲', label: 'Game 2' },
  { emoji: '🃏', label: 'Game 3' },
];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  safe: { flex: 1, paddingHorizontal: space.lg, paddingBottom: space.md },

  // ── Top bar ──────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  avatarLetter: {
    fontFamily: font.extrabold,
    fontSize: 18,
    color: colors.blue,
  },
  wordmark: {
    fontFamily: font.display,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    ...shadow.card,
  },
  menuBar: {
    width: 22,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.text,
  },

  // ── Hero card ─────────────────────────────────────────────────
  heroSection: { marginBottom: space.lg },
  heroCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    paddingVertical: space.xl,
    minHeight: 190,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  heroTitle: {
    fontFamily: font.black,
    fontSize: 30,
    color: colors.white,
    lineHeight: 36,
    marginBottom: space.sm,
  },
  heroSub: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.80)',
    lineHeight: 20,
  },

  // ── Games placeholder ─────────────────────────────────────────
  gamesSection: { flex: 1 },
  cardRow: { flexDirection: 'row', gap: space.sm },
  gameCard: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.xs,
    ...shadow.card,
  },
  gameEmoji: { fontSize: 28 },
  gameLabel: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },

  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
