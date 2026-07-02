/**
 * Home — Wins Feed
 *
 * The primary social experience. Contains:
 *   1. Sticky header  — avatar (→ profile), wordmark, notification bell (→ alerts tab)
 *   2. Live strip     — horizontally scrollable live games (data from existing poll)
 *   3. Wins feed      — infinitely scrolling FlatList of WinCards
 *
 * Architecture:
 *   • useWinsFeed   — pagination, optimistic likes, error/loading state
 *   • useSession    — auth guard
 *   • LiveStrip     — decoupled, receives pre-fetched rooms (existing 10-s poll)
 *   • WinCard       — memoised, receives stable callbacks
 *   • CommentSheet  — lazy-rendered modal; only mounted when a post is active
 *
 * Performance:
 *   • FlatList with windowSize/maxToRenderPerBatch tuned for card feed
 *   • renderItem + keyExtractor memoised with useCallback
 *   • Header rendered as a sticky stickyHeaderIndices element so it stays
 *     visible without a separate fixed-position View above the list
 *   • No anonymous arrow functions inside renderItem
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FontAwesome } from '@expo/vector-icons';
import { useSession } from '../../lib/useSession';
import { supabase } from '../../lib/supabase';
import { useWinsFeed } from '../../lib/useWinsFeed';
import type { WinPost } from '../../lib/useWinsFeed';
import { GradientFill } from '../../components/GradientFill';
import { Avatar } from '../../components/ui/Avatar';
import { LiveStrip } from '../../components/Feed/LiveStrip';
import type { LiveGame, ActiveRoom } from '../../components/Feed/LiveStrip';
import { WinCard } from '../../components/Feed/WinCard';
import { CommentSheet } from '../../components/CommentSheet';
import { MenuDrawer } from '../../components/MenuDrawer';
import { colors, font, gradients, radius, shadow, space } from '../../theme';

// ─── Feed skeleton card ───────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.authorRow}>
        <View style={skeletonStyles.avatar} />
        <View style={skeletonStyles.meta}>
          <View style={[skeletonStyles.line, { width: '50%' }]} />
          <View style={[skeletonStyles.line, { width: '30%', marginTop: 6 }]} />
        </View>
      </View>
      <View style={[skeletonStyles.line, { width: '80%', marginBottom: 8 }]} />
      <View style={[skeletonStyles.line, { width: '60%' }]} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.md,
    gap: space.sm,
  },
  authorRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', marginBottom: space.xs },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt },
  meta: { flex: 1 },
  line: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt },
});

// ─── Empty / error states ─────────────────────────────────────────────────────

function EmptyFeed() {
  return (
    <View style={stateStyles.wrap} accessibilityLabel="No posts yet">
      <Text style={stateStyles.emoji}>🏆</Text>
      <Text style={stateStyles.title}>No wins yet</Text>
      <Text style={stateStyles.sub}>
        Play a game, share your result, and it'll appear here.
      </Text>
    </View>
  );
}

function ErrorFeed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={stateStyles.wrap} accessibilityLabel="Error loading feed">
      <Text style={stateStyles.emoji}>⚠️</Text>
      <Text style={stateStyles.title}>Couldn't load the feed</Text>
      <Text style={stateStyles.sub}>{message}</Text>
      <Pressable
        style={stateStyles.retryBtn}
        onPress={onRetry}
        accessibilityLabel="Retry loading the feed"
        accessibilityRole="button"
      >
        <Text style={stateStyles.retryText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

const stateStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: space.xl * 2,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  emoji: { fontSize: 52 },
  title: { fontFamily: font.black, fontSize: 20, color: colors.text, textAlign: 'center' },
  sub: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: space.sm,
    backgroundColor: colors.blue,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  retryText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
});

// ─── Pagination footer ────────────────────────────────────────────────────────

function FeedFooter({ loading, hasNextPage }: { loading: boolean; hasNextPage: boolean }) {
  if (!loading || !hasNextPage) return null;
  return (
    <View style={footerStyles.wrap} accessibilityLabel="Loading more posts">
      <ActivityIndicator color={colors.blue} />
    </View>
  );
}

const footerStyles = StyleSheet.create({
  wrap: { paddingVertical: space.xl, alignItems: 'center' },
});

// ─── GAMES catalogue (for the live strip data) ────────────────────────────────

const GAMES_META: Record<string, { emoji: string; gradient: [string, string] }> = {
  'number-duel': { emoji: '🔢', gradient: ['#3B9DE7', '#4967E0'] },
  'pixel-rush': { emoji: '🎮', gradient: gradients.button },
};

// ─── Home ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !session) router.replace('/login');
  }, [session, authLoading]);

  // ── Live rooms (10-second poll, same pattern as old home.tsx) ────────────────
  const [liveRooms, setLiveRooms] = useState<Record<string, ActiveRoom[]>>({});
  const [liveLoading, setLiveLoading] = useState(true);

  const fetchLiveRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select(`code, game_kind, state, room_players ( display_name, profiles ( username ) )`)
      .eq('status', 'active');
    if (!data) { setLiveLoading(false); return; }
    const map: Record<string, ActiveRoom[]> = {};
    data.forEach((r: any) => {
      const names: string[] = (r.room_players ?? []).map((p: any) =>
        p.display_name || p.profiles?.username || 'Player',
      );
      const room: ActiveRoom = { code: r.code, round: r.state?.round ?? 1, playerNames: names };
      if (!map[r.game_kind]) map[r.game_kind] = [];
      map[r.game_kind].push(room);
    });
    setLiveRooms(map);
    setLiveLoading(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchLiveRooms();
    const interval = setInterval(fetchLiveRooms, 10_000);
    return () => clearInterval(interval);
  }, [session, fetchLiveRooms]);

  // Build typed LiveGame array for the strip.
  const liveGames: LiveGame[] = Object.entries(liveRooms)
    .filter(([, rooms]) => rooms.length > 0)
    .map(([gameId, rooms]) => ({
      id: gameId,
      title: gameId
        .split('-')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(' '),
      emoji: GAMES_META[gameId]?.emoji ?? '🎮',
      gradient: GAMES_META[gameId]?.gradient ?? gradients.button,
      rooms,
    }));

  // ── Wins feed ────────────────────────────────────────────────────────────────
  const { posts, loading: feedLoading, refreshing, hasNextPage, error, refresh, fetchNextPage, mutateLike } =
    useWinsFeed(session?.user.id);

  // ── Comment sheet ────────────────────────────────────────────────────────────
  const [activePostId, setActivePostId] = useState<string | null>(null);

  const handleOpenComment = useCallback((postId: string) => {
    Haptics.selectionAsync();
    setActivePostId(postId);
  }, []);

  const handleCloseComment = useCallback(() => {
    setActivePostId(null);
  }, []);

  // ── Live tile press — navigate to viewer ─────────────────────────────────────
  const handleLiveTilePress = useCallback(
    (game: LiveGame) => {
      if (game.id === 'number-duel' && game.rooms.length > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push({
          pathname: '/game/[id]',
          params: { id: 'number-duel-viewer', roomCode: game.rooms[0].code },
        });
      }
    },
    [router],
  );

  // ── FlatList callbacks (memoised to avoid re-renders) ────────────────────────
  const keyExtractor = useCallback((item: WinPost) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: WinPost }) => (
      <WinCard post={item} onLike={mutateLike} onComment={handleOpenComment} />
    ),
    [mutateLike, handleOpenComment],
  );

  // ── Avatar letter ─────────────────────────────────────────────────────────────
  const avatarLetter =
    (session?.user?.user_metadata?.username as string)?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ??
    '?';

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (authLoading || !session) return null;

  // ─── Header (rendered via ListHeaderComponent to scroll with list) ──────────
  const ListHeader = (
    <View style={styles.listHeader}>
      {/* Live strip */}
      <LiveStrip games={liveGames} loading={liveLoading} onTilePress={handleLiveTilePress} />

      {/* Feed section label */}
      <Text style={styles.feedLabel}>WINS FEED</Text>

      {/* Initial loading skeletons */}
      {feedLoading && posts.length === 0 && (
        <View style={styles.skeletonList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(i * 80).springify().damping(14)}>
              <SkeletonCard />
            </Animated.View>
          ))}
        </View>
      )}

      {/* Error state */}
      {error && !feedLoading && (
        <ErrorFeed message={error} onRetry={refresh} />
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <MenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Comment sheet — only mounts when a post is active */}
      {activePostId && (
        <CommentSheet
          postId={activePostId}
          visible={!!activePostId}
          currentUserId={session.user.id}
          currentUsername={(session.user.user_metadata?.username as string) ?? null}
          currentAvatarUrl={null}
          onClose={handleCloseComment}
        />
      )}

      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* ── Sticky header ───────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top > 0 ? 0 : space.sm) }]}>
          {/* Left — user avatar */}
          <Pressable
            style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
            onPress={() => router.push('/profile')}
            accessibilityLabel="Open profile"
            accessibilityRole="button"
          >
            <Avatar letter={avatarLetter} size={38} showOnline />
          </Pressable>

          {/* Centre — wordmark */}
          <View style={styles.wordmarkRow}>
            <Text style={[styles.wordmark, { color: colors.blue }]}>X</Text>
            <Text style={styles.wordmark}>antle</Text>
          </View>

          {/* Right — notifications */}
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/(tabs)/notifications');
            }}
            accessibilityLabel="Open notifications"
            accessibilityRole="button"
          >
            <FontAwesome name="bell" size={18} color={colors.text} />
          </Pressable>
        </View>

        {/* ── Feed list ───────────────────────────────────────────────────── */}
        <FlatList
          data={posts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={!feedLoading && !error ? <EmptyFeed /> : null}
          ListFooterComponent={
            <FeedFooter loading={feedLoading && posts.length > 0} hasNextPage={hasNextPage} />
          }
          contentContainerStyle={styles.feedContent}
          ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
          onEndReached={fetchNextPage}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.blue}
            />
          }
          // ── Performance knobs ─────────────────────────────────────────────
          windowSize={7}
          maxToRenderPerBatch={5}
          initialNumToRender={6}
          removeClippedSubviews
          accessibilityLabel="Wins feed"
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  // Sticky header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    zIndex: 10,
  },
  avatarBtn: { padding: 2 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { fontFamily: font.display, fontSize: 24, color: colors.text, letterSpacing: -0.5 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },

  // Feed
  feedContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  listHeader: {
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md,
  },
  feedLabel: {
    fontFamily: font.extrabold,
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 1.5,
    marginTop: space.xs,
  },
  skeletonList: { gap: space.md },
});
