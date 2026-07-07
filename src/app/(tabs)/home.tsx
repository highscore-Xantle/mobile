/**
 * Home — "Home of Fun" games showcase.
 *
 * Redesigned to the reference layout: no logo; round menu + cart icons in the
 * header; a big two-line title; a diagonal blue sweep on the upper-right that
 * fades before the bottom; a row of category chips (first is active); and large
 * game cards. Content is intentionally minimal — iterating on the design live.
 *
 * (The previous wins-feed lives in useWinsFeed/WinCard and can be moved to the
 * Live tab if we want to keep it.)
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
import { MenuDrawer } from '../../components/MenuDrawer';
import { GAMES } from './games';
import { colors, font, radius, shadow, space } from '../../theme';

type FAIcon = React.ComponentProps<typeof FontAwesome>['name'];

// Category chips — first one is the active (blue) state, like the sample.
const CATEGORIES: { icon: FAIcon; key: string }[] = [
  { icon: 'gamepad', key: 'all' },
  { icon: 'users', key: 'party' },
  { icon: 'bolt', key: 'arcade' },
  { icon: 'trophy', key: 'ranked' },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(0);

  if (!session) return null;

  const openGame = (game: typeof GAMES[number]) => {
    if (!game.available) return;
    if (game.route) router.push(game.route as Parameters<typeof router.push>[0]);
    else router.push(`/setup/${game.id}` as any);
  };

  return (
    <View style={styles.root}>
      {/* Base background */}
      <GradientFill colors={[colors.bgTop, colors.bgBottom]} />

      {/* Diagonal blue sweep — upper-right, fades before the bottom */}
      <View style={styles.diagonalClip} pointerEvents="none">
        <View style={styles.diagonalPanel}>
          <GradientFill colors={[colors.blueBright, colors.blueDeep]} />
        </View>
      </View>

      <MenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* ── Header: round menu (left) + cart (right), no logo ── */}
        <View style={[styles.header, { paddingTop: insets.top > 0 ? space.xs : space.md }]}>
          <Pressable
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Menu"
          >
            <FontAwesome name="bars" size={18} color={colors.text} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
            onPress={() => {}}
            accessibilityLabel="Store (coming soon)"
          >
            <FontAwesome name="shopping-bag" size={16} color={colors.text} />
          </Pressable>
        </View>

        {/* ── Title ── */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleSolid}>Home of</Text>
          <Text style={styles.titleOutline}>Fun</Text>
        </View>

        {/* ── Category chips ── */}
        <View style={styles.catRow}>
          {CATEGORIES.map((c, i) => {
            const active = i === activeCat;
            return (
              <Pressable
                key={c.key}
                onPress={() => setActiveCat(i)}
                style={({ pressed }) => [
                  styles.catChip,
                  active && styles.catChipActive,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel={c.key}
              >
                <FontAwesome name={c.icon} size={20} color={active ? colors.white : colors.textMuted} />
              </Pressable>
            );
          })}
        </View>

        {/* Push the cards down toward the nav, like the sample */}
        <View style={{ flex: 1 }} />

        {/* ── Game cards ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
          style={styles.cardScroll}
        >
          {GAMES.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => openGame(g)}
              style={({ pressed }) => [styles.card, pressed && g.available && styles.pressed]}
            >
              {/* Product image area (gradient + emoji stand-in) */}
              <View style={styles.cardImage}>
                <GradientFill colors={g.gradient} />
                <Text style={styles.cardEmoji}>{g.emoji}</Text>
                {!g.available && (
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonText}>SOON</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardTitle}>{g.title}</Text>
              <Text style={styles.cardSub} numberOfLines={1}>{g.tagline}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const CARD_W = 172;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },

  // Diagonal blue sweep
  diagonalClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  diagonalPanel: {
    position: 'absolute',
    top: -160,
    right: -150,
    width: 330,
    height: 620,
    borderRadius: 80,
    overflow: 'hidden',
    opacity: 0.9,
    transform: [{ rotate: '24deg' }],
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.lg,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },

  // Title
  titleBlock: { marginBottom: space.xl },
  titleSolid: {
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 44,
    color: colors.text,
  },
  titleOutline: {
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 44,
    color: 'rgba(234,240,250,0.28)',
  },

  // Category chips
  catRow: { flexDirection: 'row', gap: space.md, marginBottom: space.xl },
  catChip: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catChipActive: { backgroundColor: colors.blue, ...shadow.blueGlow },

  // Game cards
  cardScroll: { flexGrow: 0 },
  cardRow: { gap: space.lg, paddingBottom: space.md, paddingRight: space.lg },
  card: {
    width: CARD_W,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.md,
    ...shadow.card,
  },
  cardImage: {
    height: 268,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  cardEmoji: { fontSize: 72 },
  soonBadge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  soonText: { fontFamily: font.bold, fontSize: 10, color: colors.white, letterSpacing: 1 },
  cardTitle: { fontFamily: font.extrabold, fontSize: 18, color: colors.text },
  cardSub: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted, marginTop: 2 },

  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
