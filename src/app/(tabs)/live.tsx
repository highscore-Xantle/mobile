/**
 * Live tab — displays all currently active game rooms in real time.
 *
 * Architecture:
 *   • useLiveRooms() — shared 10-second polling hook (no duplication)
 *   • LiveGameCard   — memoised per-room card
 *   • FlatList with pull-to-refresh, loading skeletons, empty + error states
 *   • Tapping a card navigates to the appropriate game viewer
 *
 * The polling cadence matches home.tsx and games.tsx exactly because
 * all three now consume the same useLiveRooms hook.
 */
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FontAwesome } from '@expo/vector-icons';
import { GradientFill } from '../../components/GradientFill';
import { LiveGameCard } from '../../components/Live/LiveGameCard';
import { useLiveRooms, type ActiveRoom } from '../../lib/useLiveRooms';
import { colors, font, gradients, radius, space } from '../../theme';

// ─── Types internal to this screen ───────────────────────────────────────────

interface FlatItem {
  key: string;
  gameId: string;
  room: ActiveRoom;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={sk.card}>
      <View style={sk.left}>
        <View style={sk.pill} />
        <View style={sk.emoji} />
        <View style={sk.line} />
        <View style={[sk.line, { width: '60%' }]} />
      </View>
      <View style={sk.chip} />
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.hairline,
    padding: space.md, gap: space.md, opacity: 0.5,
  },
  left:  { flex: 1, gap: 6 },
  pill:  { width: 50, height: 18, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  emoji: { width: 32, height: 32, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  line:  { width: '80%', height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  chip:  { width: 80, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={st.empty} accessibilityLabel="No live games right now">
      <Text style={st.emoji}>📡</Text>
      <Text style={st.emptyTitle}>Nothing live right now</Text>
      <Text style={st.emptySub}>
        When players start games, they'll appear here.{'\n'}Pull down to refresh.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  empty:      { alignItems: 'center', paddingVertical: space.xl * 2, gap: space.md, paddingHorizontal: space.lg },
  emoji:      { fontSize: 56, marginBottom: space.sm },
  emptyTitle: { fontFamily: font.black, fontSize: 20, color: colors.text, textAlign: 'center' },
  emptySub:   { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});

// ─── Live tab ─────────────────────────────────────────────────────────────────

export default function LiveTab() {
  const router = useRouter();
  const { liveRooms, loading, refresh } = useLiveRooms();

  // Flatten Record<gameId, ActiveRoom[]> → FlatList items (one per room)
  const items = useMemo<FlatItem[]>(() => {
    const result: FlatItem[] = [];
    Object.entries(liveRooms).forEach(([gameId, rooms]) => {
      rooms.forEach((room) => {
        result.push({ key: `${gameId}-${room.code}`, gameId, room });
      });
    });
    return result;
  }, [liveRooms]);

  const handleWatch = useCallback((roomCode: string, gameId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (gameId === 'number-duel') {
      router.push({ pathname: '/game/[id]', params: { id: 'number-duel-viewer', roomCode } } as any);
    }
    // Future games: add cases here (pixel-rush viewer, etc.)
  }, [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: FlatItem; index: number }) => (
      <Animated.View entering={FadeInDown.springify().damping(14).delay(index * 60)}>
        <LiveGameCard gameId={item.gameId} room={item.room} onWatch={handleWatch} />
      </Animated.View>
    ),
    [handleWatch],
  );

  const keyExtractor = useCallback((item: FlatItem) => item.key, []);

  // Count of unique active games (for the header badge)
  const liveGameCount = Object.keys(liveRooms).length;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.title}>Live</Text>
            {liveGameCount > 0 && (
              <View style={styles.countBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.countText}>
                  {items.length} game{items.length !== 1 ? 's' : ''} live
                </Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={refresh}
            style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Refresh live games"
            accessibilityRole="button"
          >
            <FontAwesome name="refresh" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {loading && items.length === 0 ? (
          // Initial loading skeletons
          <View style={styles.list}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<EmptyState />}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
            refreshControl={
              <RefreshControl
                refreshing={loading && items.length > 0}
                onRefresh={refresh}
                tintColor={colors.blue}
              />
            }
            windowSize={7}
            maxToRenderPerBatch={8}
            accessibilityLabel="Live games list"
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  title: {
    fontFamily: font.black,
    fontSize: 28,
    color: colors.text,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  countText: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.danger,
    letterSpacing: 0.3,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    marginTop: space.xs,
  },

  list: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
});
