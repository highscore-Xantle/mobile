/**
 * useWinsFeed — paginated, optimistically-updated wins feed hook.
 *
 * Responsibilities:
 *  • Fetches posts with author profile, like count, the caller's like status,
 *    and a comment count — all in a single Supabase query using PostgREST
 *    embedding (no extra round-trips).
 *  • Supports cursor-based pagination (keyed on `created_at`).
 *  • Exposes `mutateLike(postId)` for instant optimistic updates with
 *    automatic rollback on RPC failure.
 *  • Exposes `refresh()` and `fetchNextPage()`.
 *
 * Architecture note: state lives here, not in the screen component, so
 * the FlatList can be extracted without touching the data layer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WinPost {
  id: string;
  user_id: string;
  game_type: string;
  match_id: string | null;
  result_text: string;
  media_url: string | null;
  created_at: string;
  // Joined:
  author: {
    username: string | null;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
}

interface FeedState {
  posts: WinPost[];
  loading: boolean;
  refreshing: boolean;
  hasNextPage: boolean;
  error: string | null;
}

const PAGE_SIZE = 15;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWinsFeed(currentUserId: string | undefined) {
  const [state, setState] = useState<FeedState>({
    posts: [],
    loading: true,
    refreshing: false,
    hasNextPage: true,
    error: null,
  });

  // Cursor: ISO timestamp of the oldest post currently loaded.
  const cursorRef = useRef<string | null>(null);
  // Guard against concurrent pagination calls.
  const fetchingRef = useRef(false);

  // ── Core fetch ──────────────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (opts: { cursor: string | null; replace: boolean }) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        let query = supabase
          .from('posts')
          .select(
            `
              id,
              user_id,
              game_type,
              match_id,
              result_text,
              media_url,
              created_at,
              profiles:user_id ( username, avatar_url ),
              post_likes ( user_id ),
              post_comments ( id )
            `,
          )
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (opts.cursor) {
          query = query.lt('created_at', opts.cursor);
        }

        const { data, error } = await query;

        if (error) throw error;

        const rows = (data ?? []) as any[];

        const mapped: WinPost[] = rows.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          game_type: r.game_type,
          match_id: r.match_id ?? null,
          result_text: r.result_text,
          media_url: r.media_url ?? null,
          created_at: r.created_at,
          author: {
            username: r.profiles?.username ?? null,
            avatar_url: r.profiles?.avatar_url ?? null,
          },
          like_count: (r.post_likes ?? []).length,
          comment_count: (r.post_comments ?? []).length,
          viewer_has_liked: currentUserId
            ? (r.post_likes ?? []).some((l: any) => l.user_id === currentUserId)
            : false,
        }));

        const newCursor = mapped.length > 0 ? mapped[mapped.length - 1].created_at : null;
        if (newCursor) cursorRef.current = newCursor;

        setState((prev) => ({
          ...prev,
          posts: opts.replace ? mapped : [...prev.posts, ...mapped],
          loading: false,
          refreshing: false,
          hasNextPage: rows.length === PAGE_SIZE,
          error: null,
        }));
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: err?.message ?? 'Failed to load feed.',
        }));
      } finally {
        fetchingRef.current = false;
      }
    },
    [currentUserId],
  );

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    cursorRef.current = null;
    fetchPage({ cursor: null, replace: true });
  }, [fetchPage]);

  // ── Public API ──────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    cursorRef.current = null;
    setState((prev) => ({ ...prev, refreshing: true, error: null }));
    fetchPage({ cursor: null, replace: true });
  }, [fetchPage]);

  const fetchNextPage = useCallback(() => {
    if (!state.hasNextPage || fetchingRef.current) return;
    fetchPage({ cursor: cursorRef.current, replace: false });
  }, [state.hasNextPage, fetchPage]);

  /**
   * mutateLike — optimistic like toggle.
   *
   * Immediately flips the `viewer_has_liked` flag and adjusts `like_count`
   * in local state, then fires the `toggle_like` RPC. On failure it rolls
   * back the local change and returns the error message.
   */
  const mutateLike = useCallback(
    async (postId: string): Promise<string | null> => {
      // 1. Snapshot before mutation for rollback.
      const snapshot = [...state.posts];

      // 2. Optimistic update.
      setState((prev) => ({
        ...prev,
        posts: prev.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                viewer_has_liked: !p.viewer_has_liked,
                like_count: p.viewer_has_liked ? p.like_count - 1 : p.like_count + 1,
              }
            : p,
        ),
      }));

      // 3. Server call.
      try {
        const { error } = await supabase.rpc('toggle_like', { p_post_id: postId });
        if (error) throw error;
        return null;
      } catch (err: any) {
        // 4. Rollback.
        setState((prev) => ({ ...prev, posts: snapshot }));
        return err?.message ?? 'Failed to update like.';
      }
    },
    [state.posts],
  );

  return {
    ...state,
    refresh,
    fetchNextPage,
    mutateLike,
  };
}
