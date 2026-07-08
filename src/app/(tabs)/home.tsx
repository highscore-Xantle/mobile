/**
 * Home — "Home of Fun" games showcase.
 *
 * Reference layout: no logo; round menu + cart header; two-line title; a
 * diagonal blue sweep upper-right; category chips; and a scroll-driven carousel
 * of game cards. Cards are a custom shape (straight bottom, slanted-up top) via
 * react-native-svg; the active card lifts + scales while neighbours recede
 * (scale/fade), driven by scroll position for a smooth, finger-tracked feel.
 */
import { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useSession } from '../../lib/useSession';
import { GradientFill } from '../../components/GradientFill';
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
const BASE_W = Math.round(SCREEN_W * 0.66);
const CARD_W = BASE_W - 6;                        // trim width slightly (height unchanged)
const CARD_H = Math.round(BASE_W * 1.24);
const GAP = 16;
const ITEM = CARD_W + GAP;
const CARD_INSET = Math.round((SCREEN_W - CARD_W) / 2); // centers the active card
const SLANT = 22;   // top-right sits this much higher than top-left

// Rounded path through a set of points — draws the slanted-top card.
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

const CARD_PATH = roundedPath([[0, SLANT], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]], 22);

function GameCard({
  game, index, scrollX, onPress,
}: {
  game: typeof GAMES[number];
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
}) {
  const gid = `gc-${game.id}`;

  // Active card lifts + scales; neighbours recede (scale down, drop, fade).
  const aStyle = useAnimatedStyle(() => {
    const dist = index - scrollX.value / ITEM;
    const input = [-1, 0, 1];
    // No opacity fade — cards stay fully solid; recede via scale + lift only.
    return {
      transform: [
        { scale: interpolate(dist, input, [0.84, 1, 0.84], Extrapolation.CLAMP) },
        { translateY: interpolate(dist, input, [34, -8, 34], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View style={[{ width: CARD_W, height: CARD_H }, styles.cardShadow, aStyle]}>
      <Pressable onPress={onPress} style={StyleSheet.absoluteFill}>
        <Svg width={CARD_W} height={CARD_H} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0" stopColor="#2F3745" />
              <Stop offset="1" stopColor="#20262E" />
            </SvgLinearGradient>
          </Defs>
          <Path d={CARD_PATH} fill={`url(#${gid})`} />
        </Svg>

        <View style={[styles.cardArt, { height: CARD_H * 0.6 }]}>
          {game.image
            ? <Image source={game.image} style={styles.cardImg} contentFit="contain" />
            : <Text style={styles.cardEmoji}>{game.emoji}</Text>}
        </View>

        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{game.title}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>{game.tagline}</Text>
        </View>

        {!game.available && (
          <View style={styles.soonBadge}><Text style={styles.soonText}>SOON</Text></View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  const [activeCat, setActiveCat] = useState(0);

  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollX.value = e.contentOffset.x; });

  if (!session) return null;

  const openGame = (game: typeof GAMES[number]) => {
    if (!game.available) return;
    if (game.route) router.push(game.route as Parameters<typeof router.push>[0]);
    else router.push(`/setup/${game.id}` as any);
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={[colors.bgTop, colors.bgBottom]} />

      {/* Blue band — straight vertical on the right, top to near the nav */}
      <View style={styles.rightBand} pointerEvents="none">
        <GradientFill colors={[colors.blueBright, colors.blueDeep]} />
      </View>

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingTop: insets.top > 0 ? space.xs : space.md }]}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => router.push('/notifications')}
            accessibilityLabel="Notifications"
          >
            <FontAwesome name="bell" size={17} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.titleSolid}>Home of</Text>
          <Text style={styles.titleOutline}>Fun</Text>
        </View>

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

        <View style={{ flex: 1 }} />

        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.carousel}
          contentContainerStyle={styles.cardRow}
        >
          {GAMES.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} scrollX={scrollX} onPress={() => openGame(g)} />
          ))}
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },

  rightBand: {
    position: 'absolute',
    top: 0, bottom: 48, right: 0,          // occupies the top; bottom comes down a bit
    width: Math.round(SCREEN_W * 0.34),   // ~30–35% of the width
    overflow: 'hidden',
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 12,          // soft curve near the nav, like the sample
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: space.lg,
  },
  iconBtn: {
    width: 46, height: 46, borderRadius: 12,   // box shape, small radius
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.hairline,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },

  titleBlock: { marginBottom: space.xl },
  titleSolid: { fontFamily: font.display, fontSize: 40, lineHeight: 44, color: colors.text },
  titleOutline: { fontFamily: font.display, fontSize: 40, lineHeight: 44, color: 'rgba(234,240,250,0.28)' },

  catRow: { flexDirection: 'row', gap: space.md, marginBottom: space.xl },
  catChip: {
    width: 54, height: 54, borderRadius: 14,   // box shape, small radius
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.hairline,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 10, elevation: 8,
  },
  catChipActive: { backgroundColor: colors.blue, borderColor: colors.blue, ...shadow.blueGlow },

  // Full-bleed: break out of the safe-area padding so cards use the device width,
  // first card flush to the edge (no margin).
  carousel: { marginHorizontal: -space.lg, marginBottom: 24 },
  cardRow: { gap: GAP, paddingTop: 8, paddingBottom: space.sm, paddingLeft: CARD_INSET, paddingRight: CARD_INSET },
  // Thick 3D drop shadow under each card.
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 16,
  },
  cardArt: {
    position: 'absolute', top: SLANT, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  cardEmoji: { fontSize: 68 },
  cardImg: { width: '78%', height: '78%' },
  cardText: { position: 'absolute', left: space.lg, bottom: space.lg },
  cardTitle: { fontFamily: font.extrabold, fontSize: 19, color: colors.text },
  cardSub: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted, marginTop: 3 },
  soonBadge: {
    position: 'absolute', top: SLANT + space.sm, right: space.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
  },
  soonText: { fontFamily: font.bold, fontSize: 10, color: colors.white, letterSpacing: 1 },

  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
