/**
 * Home — "Home of Fun" games showcase.
 *
 * Reference layout: no logo; round menu + cart header; two-line title; a
 * diagonal blue sweep upper-right; category chips; and a peeking carousel of
 * game cards. Each card is a custom shape — straight bottom, slanted-up top —
 * drawn with react-native-svg (already in the native build).
 */
import { useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
import { MenuDrawer } from '../../components/MenuDrawer';
import { GAMES } from './games';
import { colors, font, radius, shadow, space } from '../../theme';

type FAIcon = React.ComponentProps<typeof FontAwesome>['name'];

const CATEGORIES: { icon: FAIcon; key: string }[] = [
  { icon: 'gamepad', key: 'all' },
  { icon: 'users', key: 'party' },
  { icon: 'bolt', key: 'arcade' },
  { icon: 'trophy', key: 'ranked' },
];

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = Math.round(SCREEN_W * 0.64);   // one prominent card…
const CARD_H = Math.round(CARD_W * 1.46);
const GAP = 18;
const SLANT = 24;   // top-right sits this much higher than top-left

// Rounded path through a set of points — used to draw the slanted-top card.
function roundedPath(pts: number[][], r: number): string {
  const n = pts.length;
  const len = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let d = '';
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const rp = Math.min(r, len(curr, prev) / 2, len(curr, next) / 2);
    const up = [(prev[0] - curr[0]) / len(curr, prev), (prev[1] - curr[1]) / len(curr, prev)];
    const un = [(next[0] - curr[0]) / len(curr, next), (next[1] - curr[1]) / len(curr, next)];
    const p1 = [curr[0] + up[0] * rp, curr[1] + up[1] * rp];
    const p2 = [curr[0] + un[0] * rp, curr[1] + un[1] * rp];
    d += `${i === 0 ? 'M' : 'L'} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} `;
    d += `Q ${curr[0].toFixed(1)} ${curr[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  return d + 'Z';
}

const CARD_PATH = roundedPath(
  [[0, SLANT], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]],
  24,
);

function GameCard({ game, onPress }: { game: typeof GAMES[number]; onPress: () => void }) {
  const gid = `gc-${game.id}`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width: CARD_W, height: CARD_H }, pressed && game.available && styles.pressed]}
    >
      <Svg width={CARD_W} height={CARD_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="#2F3745" />
            <Stop offset="1" stopColor="#20262E" />
          </SvgLinearGradient>
        </Defs>
        <Path d={CARD_PATH} fill={`url(#${gid})`} />
      </Svg>

      {/* Art (emoji stand-in for the game image) */}
      <View style={[styles.cardArt, { height: CARD_H * 0.6 }]}>
        <Text style={styles.cardEmoji}>{game.emoji}</Text>
      </View>

      {/* Title + subtitle bottom-left */}
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{game.title}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>{game.tagline}</Text>
      </View>

      {!game.available && (
        <View style={styles.soonBadge}><Text style={styles.soonText}>SOON</Text></View>
      )}
    </Pressable>
  );
}

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
      <GradientFill colors={[colors.bgTop, colors.bgBottom]} />

      {/* Diagonal blue sweep — upper-right, fades before the bottom */}
      <View style={styles.diagonalClip} pointerEvents="none">
        <View style={styles.diagonalPanel}>
          <GradientFill colors={[colors.blueBright, colors.blueDeep]} />
        </View>
      </View>

      <MenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
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

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleSolid}>Home of</Text>
          <Text style={styles.titleOutline}>Fun</Text>
        </View>

        {/* Category chips */}
        <View style={styles.catRow}>
          {CATEGORIES.map((c, i) => {
            const active = i === activeCat;
            return (
              <Pressable
                key={c.key}
                onPress={() => setActiveCat(i)}
                style={({ pressed }) => [styles.catChip, active && styles.catChipActive, pressed && styles.pressed]}
                accessibilityLabel={c.key}
              >
                <FontAwesome name={c.icon} size={20} color={active ? colors.white : colors.textMuted} />
              </Pressable>
            );
          })}
        </View>

        {/* Push cards down toward the nav */}
        <View style={{ flex: 1 }} />

        {/* Peeking carousel — one prominent card, next peeks in */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + GAP}
          decelerationRate="fast"
          contentContainerStyle={styles.cardRow}
        >
          {GAMES.map((g) => (
            <GameCard key={g.id} game={g} onPress={() => openGame(g)} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },

  diagonalClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  diagonalPanel: {
    position: 'absolute',
    top: -160, right: -150,
    width: 330, height: 620,
    borderRadius: 80,
    overflow: 'hidden',
    opacity: 0.9,
    transform: [{ rotate: '24deg' }],
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.lg,
  },
  roundBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.card,
  },

  titleBlock: { marginBottom: space.xl },
  titleSolid: { fontFamily: font.display, fontSize: 40, lineHeight: 44, color: colors.text },
  titleOutline: { fontFamily: font.display, fontSize: 40, lineHeight: 44, color: 'rgba(234,240,250,0.28)' },

  catRow: { flexDirection: 'row', gap: space.md, marginBottom: space.xl },
  catChip: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  catChipActive: { backgroundColor: colors.blue, ...shadow.blueGlow },

  cardRow: { gap: GAP, paddingBottom: space.md, paddingRight: space.lg },
  cardArt: {
    position: 'absolute', top: SLANT, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  cardEmoji: { fontSize: 76 },
  cardText: { position: 'absolute', left: space.lg, bottom: space.lg },
  cardTitle: { fontFamily: font.extrabold, fontSize: 20, color: colors.text },
  cardSub: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted, marginTop: 3 },
  soonBadge: {
    position: 'absolute', top: SLANT + space.sm, right: space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
  },
  soonText: { fontFamily: font.bold, fontSize: 10, color: colors.white, letterSpacing: 1 },

  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
