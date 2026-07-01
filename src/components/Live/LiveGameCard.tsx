/**
 * LiveGameCard — card for a single active room on the Live tab.
 *
 * Shows game metadata + player names + round info and a Watch CTA.
 * Wrapped in React.memo to prevent unnecessary re-renders in the
 * FlatList when unrelated rooms update.
 */
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { colors, font, radius, shadow, space } from '../../theme';
import type { ActiveRoom } from '../../lib/useLiveRooms';

// ─── GAMES_META ───────────────────────────────────────────────────────────────
// Centralised display info for each game kind.
const GAMES_META: Record<string, { emoji: string; label: string; gradient: [string, string] }> = {
  'number-duel': { emoji: '🔢', label: 'Number Duel', gradient: ['#3B9DE7', '#4967E0'] },
  'pixel-rush':  { emoji: '🎮', label: 'Pixel Rush',  gradient: ['#489AE7', '#3B6DCF'] },
};

// ─── Pulsing dot ──────────────────────────────────────────────────────────────
function PulsingDot() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.6, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1, true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={dot.wrap}>
      <Animated.View style={[dot.dot, style]} />
    </View>
  );
}
const dot = StyleSheet.create({
  wrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
});

// ─── LiveGameCard ─────────────────────────────────────────────────────────────
export interface LiveGameCardProps {
  gameId: string;
  room: ActiveRoom;
  onWatch: (roomCode: string, gameId: string) => void;
}

export const LiveGameCard = memo(function LiveGameCard({ gameId, room, onWatch }: LiveGameCardProps) {
  const meta = GAMES_META[gameId] ?? { emoji: '🎮', label: gameId, gradient: ['#3B9DE7', '#4967E0'] };
  const players = room.playerNames.join(' vs ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onWatch(room.code, gameId)}
      accessibilityLabel={`Watch ${meta.label}: ${players}, round ${room.round}`}
      accessibilityRole="button"
    >
      {/* Left — emoji + game info */}
      <View style={styles.left}>
        {/* LIVE pill */}
        <View style={styles.livePill}>
          <PulsingDot />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        <Text style={styles.emoji}>{meta.emoji}</Text>

        <View style={styles.info}>
          <Text style={styles.gameLabel}>{meta.label}</Text>
          <Text style={styles.players} numberOfLines={1}>{players}</Text>
          <Text style={styles.round}>Round {room.round}</Text>
        </View>
      </View>

      {/* Right — Watch chip */}
      <View style={styles.watchChip}>
        <Text style={styles.watchText}>Watch →</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.md,
    gap: space.md,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  left: { flex: 1, gap: 4 },

  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 4,
  },
  liveText: {
    fontFamily: font.extrabold,
    fontSize: 10,
    color: colors.danger,
    letterSpacing: 1,
  },

  emoji: { fontSize: 32, marginBottom: 4 },

  info: { gap: 2 },
  gameLabel: {
    fontFamily: font.extrabold,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  players: {
    fontFamily: font.black,
    fontSize: 16,
    color: colors.text,
  },
  round: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: colors.textMuted,
  },

  watchChip: {
    backgroundColor: 'rgba(59,157,231,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(59,157,231,0.25)',
  },
  watchText: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.blue,
  },
});
