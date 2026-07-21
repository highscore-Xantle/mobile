/**
 * Live tab — the wins feed + live-games strip.
 *
 * The share flows in both games have been writing posts since the feed
 * shipped, but no screen ever rendered them (this tab was a placeholder) —
 * the entire social loop was invisible. This wires the existing pieces
 * together: LiveStrip (active rooms, 10s poll while focused) on top,
 * the paginated WinCard feed below, CommentSheet on demand.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { CommentSheet } from '../../components/CommentSheet';
import { WinCard } from '../../components/Feed/WinCard';
import { LiveStrip, type LiveGame } from '../../components/Feed/LiveStrip';
import { useWinsFeed } from '../../lib/useWinsFeed';
import { useSession } from '../../lib/useSession';
import { supabase } from '../../lib/supabase';
import { GAMES } from './games';
import { colors, font, gradients, space } from '../../theme';

export default function LiveTab() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { session } = useSession();
  const userId = session?.user?.id;

  const feed = useWinsFeed(userId);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [me, setMe] = useState<{ username: string | null; avatar_url: string | null }>({ username: null, avatar_url: null });

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('username, avatar_url').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (data) setMe(data); });
  }, [userId]);

  // ── Live rooms (same poll the Games tab runs, scoped to focus) ──────────────
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);

  const fetchLive = useCallback(async () => {
    const [{ data: rooms, error: roomsErr }, { data: games, error: gamesErr }] = await Promise.all([
      supabase.from('rooms')
        .select('code, game_kind, state, room_players ( display_name, profiles ( username ) )')
        .eq('status', 'active').order('created_at', { ascending: false }).limit(24),
      supabase.from('games')
        .select('invite_code, current_round, game_players ( guest_name, profile:user_id ( username ) )')
        .eq('status', 'active').eq('game_type', 'pixel_rush')
        .order('created_at', { ascending: false }).limit(24),
    ]);
    if (roomsErr && gamesErr) { setLiveLoading(false); return; } // keep last data on a flaky poll
    const byKind: Record<string, LiveGame> = {};
    const ensure = (id: string) => {
      if (!byKind[id]) {
        const cat = GAMES.find((g) => g.id === id);
        byKind[id] = {
          id,
          title: cat?.title ?? id,
          emoji: cat?.emoji ?? '🎮',
          gradient: (cat?.theme ?? ['#333', '#111']) as [string, string],
          rooms: [],
        };
      }
      return byKind[id];
    };
    (rooms ?? []).forEach((r: any) => {
      ensure(r.game_kind).rooms.push({
        code: r.code,
        round: r.state?.round ?? 1,
        playerNames: (r.room_players ?? []).map((p: any) => p.display_name || p.profiles?.username || 'Player'),
      });
    });
    (games ?? []).forEach((g: any) => {
      ensure('pixel-rush').rooms.push({
        code: g.invite_code,
        round: g.current_round ?? 1,
        playerNames: (g.game_players ?? []).map((p: any) => p.guest_name || p.profile?.username || 'Player'),
      });
    });
    setLiveGames(Object.values(byKind));
    setLiveLoading(false);
  }, []);

  useEffect(() => {
    if (!isFocused) return;      // don't poll from a background tab
    fetchLive();
    const t = setInterval(fetchLive, 10_000);
    return () => clearInterval(t);
  }, [isFocused, fetchLive]);

  const handleTilePress = (game: LiveGame) => {
    const viewerId = game.id === 'pixel-rush' ? 'pixel-rush-viewer'
                   : game.id === 'number-duel' ? 'number-duel-viewer' : null;
    const room = game.rooms[0];
    if (viewerId && room) {
      router.push({ pathname: '/game/[id]', params: { id: viewerId, roomCode: room.code } });
    } else {
      router.push('/games' as any);  // no viewer for this game — Games tab has the details
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const listEmpty = () => {
    if (feed.loading) return <ActivityIndicator color={colors.blue} style={{ marginTop: space.xxl }} />;
    if (feed.error) return (
      <View style={styles.center}>
        <Text style={styles.emoji}>⚠️</Text>
        <Text style={styles.heading}>Couldn't load the feed</Text>
        <Text style={styles.sub}>{feed.error}</Text>
      </View>
    );
    return (
      <View style={styles.center}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={styles.heading}>No wins yet</Text>
        <Text style={styles.sub}>Win a match and share it — it'll show up here.</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Live</Text>
          <HeaderAvatar />
        </View>

        <FlatList
          data={feed.posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <WinCard post={item} onLike={feed.mutateLike} onComment={setCommentPostId} currentUserId={userId} />
          )}
          ListHeaderComponent={
            <LiveStrip games={liveGames} loading={liveLoading} onTilePress={handleTilePress} />
          }
          ListEmptyComponent={listEmpty}
          onEndReached={feed.fetchNextPage}
          onEndReachedThreshold={0.4}
          refreshing={feed.refreshing}
          onRefresh={feed.refresh}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
        />
      </SafeAreaView>

      {userId && (
        <CommentSheet
          postId={commentPostId}
          visible={!!commentPostId}
          currentUserId={userId}
          currentUsername={me.username}
          currentAvatarUrl={me.avatar_url}
          onClose={() => setCommentPostId(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.lg },
  title: { fontFamily: font.black, fontSize: 28, color: colors.text },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingTop: space.xxl },
  emoji: { fontSize: 56, marginBottom: space.sm },
  heading: { fontFamily: font.black, fontSize: 22, color: colors.text },
  sub: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
