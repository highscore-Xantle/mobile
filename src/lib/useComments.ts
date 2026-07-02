/**
 * useComments — fetches, paginates, and posts comments for a given post.
 *
 * Loads root-level comments with their replies nested in a single query.
 * Exposing a flat `{ comment, replies }` structure keeps the component
 * layer simple and decoupled from the DB shape.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommentAuthor {
  username: string | null;
  avatar_url: string | null;
}

export interface Reply {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: CommentAuthor;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: CommentAuthor;
  replies: Reply[];
}

interface CommentsState {
  comments: Comment[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useComments(postId: string | null) {
  const [state, setState] = useState<CommentsState>({
    comments: [],
    loading: false,
    submitting: false,
    error: null,
  });

  const fetchingRef = useRef(false);

  const load = useCallback(async (id: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Flat query — fetch ALL comments for the post (roots + replies) in one
      // call and assemble the tree client-side. This avoids the PostgREST
      // self-referential FK schema-cache issue entirely.
      const { data, error } = await supabase
        .from('post_comments')
        .select(
          `
            id, post_id, user_id, parent_id, body, created_at,
            profiles:user_id ( username )
          `,
          // TODO(samuel): add avatar_url back once profiles.avatar_url lands.
        )
        .eq('post_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Build lookup maps.
      const roots: Comment[] = [];
      const replyMap: Record<string, Reply[]> = {};

      (data ?? []).forEach((c: any) => {
        const author: CommentAuthor = {
          username: c.profiles?.username ?? null,
          avatar_url: null, // TODO(samuel): c.profiles?.avatar_url ?? null
        };
        if (!c.parent_id) {
          roots.push({
            id: c.id,
            post_id: c.post_id,
            user_id: c.user_id,
            body: c.body,
            created_at: c.created_at,
            author,
            replies: [],
          });
        } else {
          if (!replyMap[c.parent_id]) replyMap[c.parent_id] = [];
          replyMap[c.parent_id].push({
            id: c.id,
            user_id: c.user_id,
            body: c.body,
            created_at: c.created_at,
            author,
          });
        }
      });

      // Attach replies to their parent root comments.
      const mapped: Comment[] = roots.map((r) => ({
        ...r,
        replies: replyMap[r.id] ?? [],
      }));

      setState((prev) => ({ ...prev, comments: mapped, loading: false }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message ?? 'Failed to load comments.',
      }));
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Reload whenever the target post changes.
  useEffect(() => {
    if (postId) {
      setState({ comments: [], loading: false, submitting: false, error: null });
      load(postId);
    }
  }, [postId, load]);

  /**
   * addComment — calls the `add_comment` RPC and prepends the new comment
   * optimistically so the user sees it immediately.
   *
   * Returns an error string on failure, null on success.
   */
  const addComment = useCallback(
    async (
      body: string,
      parentId: string | null,
      authorUserId: string,
      authorUsername: string | null,
      authorAvatarUrl: string | null,
    ): Promise<string | null> => {
      if (!postId || !body.trim()) return 'Cannot submit an empty comment.';

      setState((prev) => ({ ...prev, submitting: true, error: null }));

      // Optimistic temp id — replaced on reload.
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const tempComment: Comment = {
        id: tempId,
        post_id: postId,
        user_id: authorUserId,
        body: body.trim(),
        created_at: now,
        author: { username: authorUsername, avatar_url: authorAvatarUrl },
        replies: [],
      };
      const tempReply: Reply = {
        id: tempId,
        user_id: authorUserId,
        body: body.trim(),
        created_at: now,
        author: { username: authorUsername, avatar_url: authorAvatarUrl },
      };

      setState((prev) => {
        if (!parentId) {
          return { ...prev, comments: [...prev.comments, tempComment] };
        }
        return {
          ...prev,
          comments: prev.comments.map((c) =>
            c.id === parentId ? { ...c, replies: [...c.replies, tempReply] } : c,
          ),
        };
      });

      try {
        const { error } = await supabase.rpc('add_comment', {
          p_post_id: postId,
          p_body: body.trim(),
          p_parent_id: parentId,
        });
        if (error) throw error;
        // Reload to get the real id from the server.
        await load(postId);
        setState((prev) => ({ ...prev, submitting: false }));
        return null;
      } catch (err: any) {
        // Rollback the temp entry.
        setState((prev) => ({
          ...prev,
          submitting: false,
          error: err?.message ?? 'Failed to post comment.',
          comments: parentId
            ? prev.comments.map((c) =>
                c.id === parentId
                  ? { ...c, replies: c.replies.filter((r) => r.id !== tempId) }
                  : c,
              )
            : prev.comments.filter((c) => c.id !== tempId),
        }));
        return err?.message ?? 'Failed to post comment.';
      }
    },
    [postId, load],
  );

  return { ...state, addComment };
}
