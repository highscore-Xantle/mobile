// Game detail screen (matches the reference product page). Themed hero with
// the game image + meta labels, title, description, a 2×2 feature grid, and a
// bottom price/CTA bar. Content here is PLACEHOLDER — copy gets edited later.
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { GradientFill } from '../../components/GradientFill';
import { GAMES } from '../(tabs)/games';
import { colors, font, radius, shadow, space } from '../../theme';

type FAIcon = React.ComponentProps<typeof FontAwesome>['name'];

const SCREEN_H = Dimensions.get('window').height;
const HERO_H = Math.round(SCREEN_H * 0.46);

// Placeholder content — edit freely.
const META: { label: string; value: string }[] = [
  { label: 'TYPE', value: 'Board' },
  { label: 'PLAYERS', value: '1 – 2' },
  { label: 'MODE', value: 'Online & Bot' },
];
const FEATURES: { icon: FAIcon; title: string; sub: string }[] = [
  { icon: 'bolt', title: 'Forced Captures', sub: 'Take when you can' },
  { icon: 'star', title: 'Flying Kings', sub: 'Long-range moves' },
  { icon: 'users', title: 'Play a Friend', sub: 'Online 1v1' },
  { icon: 'android', title: 'Practice Bot', sub: 'Solo warm-up' },
];

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const game = GAMES.find((g) => g.id === id);

  if (!game) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.text }}>Game not found.</Text>
      </View>
    );
  }

  const play = () => {
    if (!game.available) return;
    if (game.route) router.push(game.route as Parameters<typeof router.push>[0]);
    else router.push(`/setup/${game.id}` as any);
  };

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <GradientFill colors={game.theme} />
          <SafeAreaView edges={['top']}>
            <View style={styles.heroHeader}>
              <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={() => router.back()}>
                <FontAwesome name="chevron-left" size={16} color={colors.white} />
              </Pressable>
              <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={() => {}}>
                <FontAwesome name="bookmark-o" size={16} color={colors.white} />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Meta labels (left) */}
          <Animated.View entering={FadeInDown.delay(120).springify().damping(16)} style={styles.meta}>
            {META.map((m) => (
              <View key={m.label} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{m.label}</Text>
                <Text style={styles.metaValue}>{m.value}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Product image */}
          <Animated.View entering={FadeIn.delay(80).duration(500)} style={styles.heroImgWrap}>
            {game.image
              ? <Image source={game.image} style={styles.heroImg} contentFit="contain" />
              : <Text style={{ fontSize: 120 }}>{game.emoji}</Text>}
          </Animated.View>
        </View>

        {/* ── Body ── */}
        <View style={styles.body}>
          <Animated.Text entering={FadeInDown.delay(160).springify()} style={styles.title}>{game.title}</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220).springify()} style={styles.desc}>
            {game.tagline} Placeholder description — replace with the real copy. It explains how the game
            works, what makes it fun, and why players will keep coming back.
          </Animated.Text>

          {/* Feature grid 2×2 */}
          <View style={styles.grid}>
            {FEATURES.map((f, i) => (
              <Animated.View key={f.title} entering={FadeInDown.delay(280 + i * 60).springify().damping(15)} style={styles.chip}>
                <View style={[styles.chipIcon, { backgroundColor: game.accent }]}>
                  <FontAwesome name={f.icon} size={15} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chipTitle} numberOfLines={1}>{f.title}</Text>
                  <Text style={styles.chipSub} numberOfLines={1}>{f.sub}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Bottom bar ── */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.priceLabel}>PRICE</Text>
          <Text style={styles.price}>Free</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.cta, !game.available && styles.ctaDisabled, pressed && styles.pressed]}
          onPress={play}
          disabled={!game.available}
        >
          <View style={styles.ctaInner}>
            <GradientFill colors={game.theme} />
            <Text style={styles.ctaText}>{game.available ? 'Play' : 'Coming soon'}</Text>
            {game.available && <FontAwesome name="arrow-right" size={14} color={colors.white} />}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  hero: { height: HERO_H, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, overflow: 'hidden' },
  heroHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.lg, paddingTop: space.sm,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  meta: { position: 'absolute', left: space.lg, top: HERO_H * 0.34, gap: space.lg },
  metaRow: { gap: 2 },
  metaLabel: { fontFamily: font.bold, fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5 },
  metaValue: { fontFamily: font.extrabold, fontSize: 15, color: colors.white },
  heroImgWrap: { position: 'absolute', right: -10, top: HERO_H * 0.2, bottom: 24, left: '32%', alignItems: 'center', justifyContent: 'center' },
  heroImg: { width: '100%', height: '100%', transform: [{ rotate: '14deg' }] },

  body: { paddingHorizontal: space.lg, paddingTop: space.xl },
  title: { fontFamily: font.display, fontSize: 34, color: colors.text },
  desc: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, lineHeight: 22, marginTop: space.sm },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xl },
  chip: {
    width: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md,
    borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  chipIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipTitle: { fontFamily: font.bold, fontSize: 13, color: colors.text },
  chipSub: { fontFamily: font.semibold, fontSize: 11, color: colors.textMuted, marginTop: 1 },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 34,
    backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderTopWidth: 1, borderColor: colors.hairline,
  },
  priceLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5 },
  price: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow, minWidth: 160 },
  ctaDisabled: { opacity: 0.6 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: 16, paddingHorizontal: 22 },
  ctaText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
