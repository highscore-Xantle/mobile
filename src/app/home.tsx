import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '../lib/useSession';
import { GradientFill } from '../components/GradientFill';
import { RolloverReveal } from '../components/RolloverReveal';
import { MenuDrawer } from '../components/MenuDrawer';
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [session, loading]);

  const handleMenuPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuOpen(true);
  };
  
  const handleAvatarPress = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  const handleGamePress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/game/${id}`);
  };

  const avatarLetter =
    (session?.user?.user_metadata?.username as string)?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ?? '?';

  if (loading || !session) return null;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />

      <MenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <SafeAreaView style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── Top Bar ─────────────────────────────── */}
          <View style={styles.topBar}>
            {/* Avatar chip with blue glow */}
            <Pressable
              style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
              onPress={handleAvatarPress}
            >
              <View style={styles.avatarInner}>
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </View>
            </Pressable>

            {/* Wordmark */}
            <View style={styles.wordmarkRow}>
              <Text style={[styles.wordmark, { color: colors.blue }]}>X</Text>
              <Text style={styles.wordmark}>antle</Text>
            </View>

            {/* Hamburger menu */}
            <Pressable
              style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
              onPress={handleMenuPress}
            >
              <View style={styles.menuBar} />
              <View style={[styles.menuBar, { width: 18 }]} />
              <View style={[styles.menuBar, { width: 14 }]} />
            </Pressable>
          </View>

          {/* ── Hero Card ───────────────────────────── */}
          <RolloverReveal delay={100} duration={800} style={styles.heroSection}>
            <View style={styles.heroCard}>
              <GradientFill colors={gradients.featured} />
              {/* Background watermark */}
              <Text style={styles.heroWatermark}>X</Text>
              
              <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>Game Night{'\n'}Starts Here.</Text>
                <Text style={styles.heroSub}>
                  Pick a game. Gather your crew.{'\n'}Let the chaos begin.
                </Text>
              </View>
            </View>
          </RolloverReveal>

          {/* ── Game Grid (D2 Launcher) ─────────────── */}
          <RolloverReveal delay={280} duration={800} style={styles.gamesSection}>
            
            <View style={styles.sectionHeader}>
              <Text style={themeText.h2}>Pick a Game</Text>
              <Pressable onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                <Text style={styles.seeAll}>SEE ALL →</Text>
              </Pressable>
            </View>

            <View style={styles.gridRow}>
              {GAMES.map((g) => (
                <Pressable
                  key={g.id}
                  style={({ pressed }) => [styles.gameCard, pressed && styles.pressedCard]}
                  onPress={() => handleGamePress(g.id)}
                >
                  <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
                  
                  {/* Image/Gradient band at top */}
                  <View style={styles.gameImageBand}>
                    <GradientFill colors={g.gradient} />
                  </View>

                  {/* Info area */}
                  <View style={styles.gameInfo}>
                    <Text style={styles.gameTag}>{g.tag}</Text>
                    <Text style={styles.gameTitle}>{g.title}</Text>
                  </View>

                  {/* Arrow chip */}
                  <View style={styles.gameArrowChip}>
                    <Text style={styles.gameArrow}>→</Text>
                  </View>
                </Pressable>
              ))}
            </View>

          </RolloverReveal>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const GAMES = [
  { id: 'trivia', title: 'Trivia Royale', tag: 'PARTY', gradient: gradients.featured },
  { id: 'spy', title: 'Find the Spy', tag: 'SOCIAL', gradient: gradients.button },
];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingBottom: space.xl },

  // ── Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  avatarWrap: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: colors.blue,
    ...shadow.blueGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontFamily: font.extrabold, fontSize: 17, color: colors.blue },
  
  wordmarkRow: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { fontFamily: font.display, fontSize: 24, color: colors.text, letterSpacing: -0.5 },
  
  menuBtn: {
    width: 44, height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1, borderColor: colors.hairline,
    ...shadow.card,
  },
  menuBar: { width: 22, height: 2.5, borderRadius: 2, backgroundColor: colors.text },

  // ── Hero card
  heroSection: { marginBottom: space.xl },
  heroCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    minHeight: 200,
    borderWidth: 1, borderColor: colors.hairline,
    ...shadow.card,
  },
  heroWatermark: {
    position: 'absolute',
    right: -20, top: -40,
    fontFamily: font.display,
    fontSize: 220,
    color: colors.white,
    opacity: 0.07,
  },
  heroContent: {
    flex: 1,
    padding: space.lg,
    paddingVertical: space.xl,
    justifyContent: 'flex-end',
  },
  heroTitle: {
    fontFamily: font.black,
    fontSize: 32,
    color: colors.white,
    lineHeight: 38,
    marginBottom: space.sm,
  },
  heroSub: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },

  // ── Games Section
  gamesSection: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  seeAll: { fontFamily: font.bold, fontSize: 12, color: colors.blue, letterSpacing: 0.5 },
  
  gridRow: { flexDirection: 'row', gap: space.md },
  gameCard: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    height: 160,
    borderWidth: 1, borderColor: colors.hairline,
    ...shadow.card,
  },
  gameImageBand: { height: '55%', width: '100%' },
  gameInfo: { padding: space.sm, gap: 2 },
  gameTag: { fontFamily: font.extrabold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.5 },
  gameTitle: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  
  gameArrowChip: {
    position: 'absolute',
    bottom: space.sm,
    right: space.sm,
    width: 24, height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameArrow: { fontFamily: font.bold, fontSize: 12, color: colors.blue },

  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
  pressedCard: { transform: [{ scale: 0.97 }], opacity: 0.95 },
});
