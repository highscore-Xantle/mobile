/**
 * Landing — the front door.
 *
 * ONE route, three platforms. On web this IS the website (rich, multi-section,
 * desktop-wide). On phones it's the welcome screen (tight hero, thumb-reachable
 * CTAs). Same tokens, same motion, same identity — it just gets denser as the
 * viewport grows. See ../../DESIGN-SYSTEM.md.
 *
 * Signed-in users never see it: we redirect straight to /home.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Users, Zap, Trophy, ArrowRight, Gamepad2 } from 'lucide-react-native';
import { AmbientCanvas } from '../components/ui/AmbientCanvas';
import { GlassCard, PressableGlass } from '../components/ui/Glass';
import { useBreakpoint, useType } from '../lib/useBreakpoint';
import { supabase } from '../lib/supabase';
import { GAMES } from './(tabs)/games';
import { colors, font, gradients, maxContentWidth, motion, radius, space } from '../theme';

const HOW = [
  { icon: Users,  title: 'Get everyone in', body: 'One host opens a room. Everyone else joins with a code or a QR scan — nobody gets left setting up.' },
  { icon: Zap,    title: 'Play in seconds', body: 'Pick a game and go. If nobody’s around, you’re matched with an opponent instantly.' },
  { icon: Trophy, title: 'Settle it',       body: 'Live scores, a real winner, and bragging rights that last until the next round.' },
];

export default function Landing() {
  const router = useRouter();
  const { isDesktop, isPhone, gutter } = useBreakpoint();
  const t = useType();
  const [checking, setChecking] = useState(true);

  // Signed in already → skip the front door entirely.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setChecking(false); return; }
      // Valid session — but don't skip straight to /home unless onboarding
      // actually finished (same check login.tsx does). Backgrounding/killing
      // the app mid-onboarding used to drop a user into /home with no
      // username ever set.
      const { data: profile, error } = await supabase
        .from('profiles').select('username').eq('id', session.user.id).single();
      // A FAILED fetch (network flake) is not "no username" — routing an
      // existing user into onboarding on an error let them overwrite their
      // own profile. Only a real "row fetched, username empty" goes there.
      if (error) { router.replace('/home'); return; }
      router.replace(profile?.username ? '/home' : '/onboarding');
    });
  }, [router]);

  if (checking) {
    return (
      <View style={styles.root}>
        <AmbientCanvas />
        <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>
      </View>
    );
  }

  const playable = GAMES.filter((g) => g.available);

  return (
    <View style={styles.root}>
      <AmbientCanvas />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <View style={[styles.bar, { paddingHorizontal: gutter }]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Gamepad2 size={18} color={colors.white} strokeWidth={2.4} />
            </View>
            <Text style={styles.brand}>Xantle</Text>
          </View>

          <View style={styles.barActions}>
            {isDesktop && (
              <Pressable onPress={() => router.push('/login')} style={webCursor}>
                <Text style={styles.barLink}>Sign in</Text>
              </Pressable>
            )}
            <CTA label="Get started" onPress={() => router.push('/login')} compact />
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: space.xxxl }} showsVerticalScrollIndicator={false}>
          <View style={[styles.page, { paddingHorizontal: gutter }]}>

            {/* ── Hero ──────────────────────────────────────────────── */}
            <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
              <Animated.View
                entering={FadeInDown.duration(motion.duration.enter).springify().damping(18)}
                style={isDesktop ? { flex: 1 } : undefined}
              >
                <View style={styles.eyebrow}>
                  <View style={styles.dot} />
                  <Text style={styles.eyebrowText}>PARTY GAMES · IN THE SAME ROOM</Text>
                </View>

                <Text style={[t.display, styles.headline]}>
                  The night is{'\n'}
                  <Text style={{ color: colors.blue }}>yours to win.</Text>
                </Text>

                <Text style={[t.body, styles.sub, isDesktop && { maxWidth: 520 }]}>
                  Xantle turns any gathering into a tournament. Fast games, live scores,
                  and one winner everybody argues about on the way home.
                </Text>

                <View style={[styles.ctaRow, isPhone && styles.ctaRowPhone]}>
                  <CTA label="Play free" onPress={() => router.push('/login')} />
                  <Pressable onPress={() => router.push('/login')} style={[styles.ghost, webCursor]}>
                    <Text style={styles.ghostText}>I have a code</Text>
                  </Pressable>
                </View>

                <Text style={styles.finePrint}>Free to play · No download needed on the web</Text>
              </Animated.View>

              {/* The product, shown rather than described. Fixed width on desktop —
                  a card deck, not three banners stretched across the column. */}
              <Animated.View
                entering={FadeIn.delay(160).duration(motion.duration.enter)}
                style={[styles.cluster, isDesktop && styles.clusterDesktop]}
              >
                {playable.slice(0, 3).map((g, i) => (
                  <GlassCard
                    key={g.id}
                    raised
                    glow={i === 0 ? g.accent : undefined}
                    radius={radius.lg}
                    outerStyle={isDesktop ? { marginLeft: i * 22 } : undefined}
                    style={styles.clusterCard}
                  >
                    <LinearGradient colors={g.theme} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.clusterThumb}>
                      {g.image ? <Image source={g.image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                    </LinearGradient>
                    <View style={styles.clusterText}>
                      <Text style={styles.clusterTitle} numberOfLines={1}>{g.title}</Text>
                      <Text style={styles.clusterTag} numberOfLines={1}>{g.tagline}</Text>
                    </View>
                    <View style={[styles.livePill, { backgroundColor: `${g.accent}22` }]}>
                      <Text style={[styles.livePillText, { color: g.accent }]}>PLAY</Text>
                    </View>
                  </GlassCard>
                ))}
              </Animated.View>
            </View>

            {/* ── How it works ──────────────────────────────────────── */}
            <Text style={[t.h2, styles.section]}>Three taps to chaos</Text>
            <View style={[styles.grid, isDesktop && styles.gridRow]}>
              {HOW.map((h, i) => {
                const Icon = h.icon;
                return (
                  <Animated.View
                    key={h.title}
                    entering={FadeInDown.delay(i * motion.stagger).duration(motion.duration.enter)}
                    style={{ flex: 1 }}
                  >
                    <GlassCard style={styles.howCard} outerStyle={{ flex: 1 }} radius={radius.lg}>
                      <View style={styles.howIcon}>
                        <Icon size={20} color={colors.blue} strokeWidth={2.2} />
                      </View>
                      <Text style={styles.howTitle}>{h.title}</Text>
                      <Text style={styles.howBody}>{h.body}</Text>
                    </GlassCard>
                  </Animated.View>
                );
              })}
            </View>

            {/* ── The line-up ───────────────────────────────────────── */}
            <Text style={[t.h2, styles.section]}>The line-up</Text>
            <View style={[styles.grid, !isPhone && styles.gridWrap]}>
              {GAMES.map((g, i) => (
                <Animated.View
                  key={g.id}
                  entering={FadeInDown.delay(i * motion.stagger).duration(motion.duration.enter)}
                  style={!isPhone ? { width: isDesktop ? '31.5%' : '48%' } : undefined}
                >
                  <PressableGlass
                    radius={radius.lg}
                    glow={g.available ? g.accent : undefined}
                    onPress={() => router.push('/login')}
                    disabled={!g.available}
                    style={styles.gameCard}
                  >
                    <LinearGradient colors={g.cardBg as [string, string, ...string[]]} style={styles.gameArt}>
                      {g.image
                        ? <Image source={g.image} style={styles.gameArtImg} contentFit="contain" />
                        : <Gamepad2 size={28} color={g.accent} strokeWidth={1.6} />}
                    </LinearGradient>
                    <View style={styles.gameMeta}>
                      <Text style={styles.gameTag}>{g.available ? g.tag : 'COMING SOON'}</Text>
                      <Text style={styles.gameTitle}>{g.title}</Text>
                      <Text style={styles.gameTagline} numberOfLines={2}>{g.tagline}</Text>
                    </View>
                  </PressableGlass>
                </Animated.View>
              ))}
            </View>

            {/* ── Closing CTA ───────────────────────────────────────── */}
            <GlassCard
              raised
              glow={colors.blue}
              radius={radius.xl}
              outerStyle={{ marginTop: space.xxl }}
              style={styles.closer}
            >
              <Text style={[t.h1, styles.closerTitle]}>Someone in the room is about to lose.</Text>
              <Text style={[t.body, styles.closerSub]}>Make it official.</Text>
              <View style={[styles.closerCta, isPhone && { alignSelf: 'stretch' }]}>
                <CTA label="Start playing" onPress={() => router.push('/login')} />
              </View>
            </GlassCard>

            <Text style={styles.footer}>© {new Date().getFullYear()} Xantle · Highscore Tech</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────── */

const webCursor = (Platform.OS === 'web' ? { cursor: 'pointer' } : undefined) as ViewStyle;

function CTA({ label, onPress, compact }: { label: string; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} style={webCursor}>
      {({ pressed }) => (
        <LinearGradient
          colors={gradients.button}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.cta,
            compact ? { paddingVertical: 10, paddingHorizontal: space.md } : null,
            pressed ? { opacity: 0.9, transform: [{ scale: motion.pressScale }] } : null,
          ]}
        >
          <Text style={[styles.ctaText, compact ? { fontSize: 13 } : null]}>{label}</Text>
          {!compact && <ArrowRight size={18} color={colors.white} strokeWidth={2.4} />}
        </LinearGradient>
      )}
    </Pressable>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },

  bar: {
    height: 64,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', maxWidth: maxContentWidth, alignSelf: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brandMark: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue,
  },
  brand: { fontFamily: font.display, fontSize: 20, color: colors.text, letterSpacing: 0.5 },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  barLink: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted },

  hero: { paddingTop: space.xl, paddingBottom: space.xxl },
  heroDesktop: {
    flexDirection: 'row', alignItems: 'center', gap: space.xxl,
    paddingTop: space.xxxl, paddingBottom: space.xxxl,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  eyebrowText: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.2, color: colors.textFaint },
  headline: { marginBottom: space.md },
  sub: { color: colors.textMuted, marginBottom: space.xl },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ctaRowPhone: { flexDirection: 'column', alignItems: 'stretch' },
  ghost: {
    paddingVertical: 14, paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline,
    alignItems: 'center',
  },
  ghostText: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  finePrint: { fontFamily: font.regular, fontSize: 12, color: colors.textFaint, marginTop: space.md },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    paddingVertical: 14, paddingHorizontal: space.xl, borderRadius: radius.pill,
  },
  ctaText: { fontFamily: font.bold, fontSize: 15, color: colors.white },

  cluster: { marginTop: space.xl, gap: space.md },
  // A 420px card deck pinned right — not three banners stretched to the column.
  clusterDesktop: { marginTop: 0, width: 420, marginLeft: 'auto' },
  clusterCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  clusterThumb: { width: 46, height: 46, borderRadius: 12, overflow: 'hidden' },
  clusterText: { flex: 1, minWidth: 0 },
  clusterTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  clusterTag: { fontFamily: font.regular, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  livePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  livePillText: { fontFamily: font.bold, fontSize: 10, letterSpacing: 0.8 },

  section: { marginTop: space.xxl, marginBottom: space.lg },
  grid: { gap: space.md },
  gridRow: { flexDirection: 'row' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap' },

  howCard: { padding: space.lg, gap: space.sm, flex: 1 },
  howIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(59,157,231,0.12)', marginBottom: space.xs,
  },
  howTitle: { fontFamily: font.bold, fontSize: 17, color: colors.text },
  howBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: colors.textMuted },

  gameCard: { overflow: 'hidden' },
  gameArt: { height: 132, alignItems: 'center', justifyContent: 'center' },
  gameArtImg: { width: '100%', height: '100%' },
  gameMeta: { padding: space.md, gap: 2 },
  gameTag: { fontFamily: font.bold, fontSize: 10, letterSpacing: 1, color: colors.textFaint },
  gameTitle: { fontFamily: font.display, fontSize: 18, color: colors.text },
  gameTagline: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: colors.textMuted },

  closer: { padding: space.xl, alignItems: 'flex-start' },
  closerTitle: { marginBottom: space.xs },
  closerSub: { color: colors.textMuted },
  closerCta: { marginTop: space.lg },

  footer: {
    fontFamily: font.regular, fontSize: 12, color: colors.textFaint,
    textAlign: 'center', marginTop: space.xxl,
  },
});
