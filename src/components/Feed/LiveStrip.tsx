/**
 * LiveStrip — horizontally scrollable live games banner.
 *
 * Receives `liveRooms` (already fetched + polled by the home screen) and
 * renders one `LiveTile` per game that has active rooms. Decoupled from
 * polling logic so it can be composed into any screen without side-effects.
 *
 * States:
 *   loading  → skeleton tiles
 *   empty    → hidden (no strip shown when there is nothing live)
 *   populated → scrollable tiles with pulsing LIVE badge
 */
import { memo, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import { colors, font, radius, space, shadow } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveRoom {
  code: string;
  round: number;
  playerNames: string[];
}

export interface LiveGame {
  id: string;
  title: string;
  emoji: string;
  gradient: [string, string];
  rooms: ActiveRoom[];
}

// ─── LiveDot (animated pulsing dot) ─────────────────────────────────────────

function LiveDot({ color = colors.danger }: { color?: string }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.5, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={dotStyles.wrap}>
      <Animated.View style={[dotStyles.dot, { backgroundColor: color }, style]} />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// ─── LiveTile ────────────────────────────────────────────────────────────────

interface LiveTileProps {
  game: LiveGame;
  onPress: (game: LiveGame) => void;
}

const LiveTile = memo(function LiveTile({ game, onPress }: LiveTileProps) {
  const roomCount = game.rooms.length;
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={() => onPress(game)}
      accessibilityLabel={`${game.title} — ${roomCount} live room${roomCount !== 1 ? 's' : ''}`}
      accessibilityRole="button"
    >
      {/* Background stripe */}
      <View style={styles.tileEmojiBg}>
        <Text style={styles.tileEmoji}>{game.emoji}</Text>
      </View>

      {/* LIVE pill */}
      <View style={styles.livePill}>
        <LiveDot color={colors.white} />
        <Text style={styles.livePillText}>LIVE · {roomCount}</Text>
      </View>

      <Text style={styles.tileTitle} numberOfLines={1}>
        {game.title}
      </Text>
      <Text style={styles.tileSub} numberOfLines={1}>
        {roomCount} game{roomCount !== 1 ? 's' : ''} live
      </Text>
    </Pressable>
  );
});

// ─── Skeleton tile ────────────────────────────────────────────────────────────

function SkeletonTile() {
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.4, { duration: 700 })),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.tile, styles.skeleton, style]} />;
}

// ─── LiveStrip ───────────────────────────────────────────────────────────────

interface LiveStripProps {
  games: LiveGame[];
  loading: boolean;
  onTilePress: (game: LiveGame) => void;
}

export const LiveStrip = memo(function LiveStrip({ games, loading, onTilePress }: LiveStripProps) {
  if (!loading && games.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <View style={styles.header}>
        <LiveDot color={colors.danger} />
        <Text style={styles.headerText}>LIVE NOW</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        accessibilityLabel="Live games strip"
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <SkeletonTile key={i} />)
          : games.map((g) => <LiveTile key={g.id} game={g} onPress={onTilePress} />)}
      </ScrollView>
    </Animated.View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const TILE_W = 130;
const TILE_H = 140;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: space.sm,
  },
  headerText: {
    fontFamily: font.extrabold,
    fontSize: 11,
    color: colors.danger,
    letterSpacing: 1.5,
  },
  strip: {
    gap: space.sm,
    paddingRight: space.md,
  },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    padding: space.sm,
    justifyContent: 'flex-end',
    gap: 4,
    ...shadow.card,
  },
  tilePressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  tileEmojiBg: {
    ...StyleSheet.absoluteFillObject as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: { fontSize: 52, opacity: 0.25 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  livePillText: {
    fontFamily: font.extrabold,
    fontSize: 10,
    color: colors.white,
    letterSpacing: 1,
  },
  tileTitle: {
    fontFamily: font.black,
    fontSize: 14,
    color: colors.text,
  },
  tileSub: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
  },
  skeleton: {
    opacity: 0.4,
  },
});

// Re-export LiveDot so home.tsx can use it without importing from here.
export { LiveDot };
