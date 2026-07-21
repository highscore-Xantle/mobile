/**
 * social.ts — friends, blocks (24h), upvotes, and direct game invites.
 * Thin typed wrappers over the SECURITY DEFINER RPCs in migration 0017,
 * plus a few hooks the UI screens consume.
 *
 * "Search again" lives entirely in the matchmaking screens (re-enter
 * matchmaking) and needs nothing here — but blocks feed matchmaking, so a
 * player you just blocked won't be re-paired to you on the next search.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useSession } from './useSession';

// Supabase caches realtime channels by topic name, so two mounts using the
// same name collide: navigating away calls removeChannel() (async), and the
// remount gets the still-subscribed channel back — then `.on()` after
// subscribe() throws and crashes the tree. A per-mount-unique suffix avoids
// the collision entirely.
let _channelSeq = 0;
function useUniqueChannelId(prefix: string): string {
  const [id] = useState(() => `${prefix}_${++_channelSeq}`);
  return id;
}

export interface FriendProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
}
export interface FriendRow extends FriendProfile {
  /** 'accepted' friend, 'incoming' pending request to me, 'outgoing' my pending request. */
  kind: 'accepted' | 'incoming' | 'outgoing';
}
export interface GameInvite {
  id: string;
  from_user: string;
  to_user: string;
  room_code: string;
  game_kind: string;
  created_at: string;
}

// ── Mutations ─────────────────────────────────────────────────────────────────
export const sendFriendRequest = (addressee: string) =>
  rpc('send_friend_request', { p_addressee: addressee });
export const respondFriendRequest = (requester: string, accept: boolean) =>
  rpc('respond_friend_request', { p_requester: requester, p_accept: accept });
export const removeFriend = (other: string) =>
  rpc('remove_friend', { p_other: other });
export const blockPlayer = (blocked: string) =>
  rpc('block_player', { p_blocked: blocked });
export const unblockPlayer = (blocked: string) =>
  rpc('unblock_player', { p_blocked: blocked });
export const upvotePlayer = (target: string) =>
  rpc('upvote_player', { p_target: target });
export const respondGameInvite = (inviteId: string, accept: boolean) =>
  rpc('respond_game_invite', { p_invite: inviteId, p_accept: accept });

// Players I've blocked that are still within the 24h window, with profiles.
export function useBlockedPlayers() {
  const { session } = useSession();
  const me = session?.user?.id;
  const [blocked, setBlocked] = useState<FriendProfile[]>([]);

  const refresh = useCallback(async () => {
    if (!me) { setBlocked([]); return; }
    const { data, error } = await supabase
      .from('player_blocks')
      .select('blocked, expires_at')
      .gt('expires_at', new Date().toISOString());
    if (error) { console.warn('[blocks] load failed:', error.message); return; }
    const ids = (data ?? []).map((r: any) => r.blocked);
    if (ids.length === 0) { setBlocked([]); return; }
    const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
    setBlocked(ids.map((id: string) => ({
      id, username: byId.get(id)?.username ?? null, avatar_url: byId.get(id)?.avatar_url ?? null,
    })));
  }, [me]);

  useEffect(() => { refresh(); }, [refresh]);
  return { blocked, refresh };
}

/** My shareable friend code (generated + persisted on first call). */
export async function getMyFriendCode(): Promise<string> {
  const { data, error } = await supabase.rpc('my_friend_code');
  if (error) throw error;
  return data as string;
}
/** Send a friend request to whoever owns this code. */
export const addFriendByCode = (code: string) =>
  rpc('add_friend_by_code', { p_code: code });

/** Create a room, then invite a friend straight into it. Returns the room code. */
export async function inviteFriendToGame(friendId: string, gameKind: string): Promise<string> {
  const { data: room, error } = await supabase.rpc('create_room', {
    p_game_kind: gameKind, p_state: {}, p_is_group: false, p_max: 2,
  });
  if (error || !room) throw error ?? new Error('Could not create room');
  // game_kind is derived server-side from the room now (the RPC no longer
  // trusts a client-supplied kind/code — see migration 0018).
  const { error: invErr } = await supabase.rpc('create_game_invite', {
    p_to: friendId, p_room_code: room.code,
  });
  if (invErr) {
    // Don't leave the just-created lobby orphaned if the invite failed.
    await supabase.rpc('discard_room', { p_room: room.id }).then(undefined, () => {});
    throw invErr;
  }
  return room.code;
}

/** Invite a friend into a room that already exists (e.g. the lobby you're
 *  hosting). The caller must be seated in that room (enforced server-side). */
export const inviteFriendToRoom = (friendId: string, roomCode: string) =>
  rpc('create_game_invite', { p_to: friendId, p_room_code: roomCode });

async function rpc(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}

// ── Friends hook ──────────────────────────────────────────────────────────────
// Returns accepted friends + pending requests (both directions), each with
// the OTHER person's profile, and a refresh(). Online status is layered on by
// the caller via usePresence (kept out of here so this stays pure data).
export function useFriends() {
  const { session } = useSession();
  const me = session?.user?.id;
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!me) { setFriends([]); setLoading(false); return; }
    // RLS returns only rows where I'm requester or addressee.
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('requester, addressee, status');
    // On a transient failure keep whatever's already shown rather than
    // wiping the list to a misleading "No friends yet".
    if (error) { console.warn('[friends] load failed:', error.message); setLoading(false); return; }
    // De-dupe by the other user — a reciprocal/duplicate pair of rows would
    // otherwise render twice with the same key. An accepted row wins over a
    // pending one for the same person.
    const rank = { accepted: 2, incoming: 1, outgoing: 0 } as const;
    const byOther = new Map<string, { otherId: string; kind: FriendRow['kind'] }>();
    for (const r of (rows ?? []) as any[]) {
      const otherId = r.requester === me ? r.addressee : r.requester;
      const kind: FriendRow['kind'] =
        r.status === 'accepted' ? 'accepted'
        : r.addressee === me ? 'incoming'   // they requested me
        : 'outgoing';                        // I requested them
      const prev = byOther.get(otherId);
      if (!prev || rank[kind] > rank[prev.kind]) byOther.set(otherId, { otherId, kind });
    }
    const others = [...byOther.values()];
    if (others.length === 0) { setFriends([]); setLoading(false); return; }
    const ids = [...new Set(others.map((o) => o.otherId))];
    const { data: profs } = await supabase
      .from('profiles').select('id, username, avatar_url').in('id', ids);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
    setFriends(others.map((o) => ({
      id: o.otherId,
      username: byId.get(o.otherId)?.username ?? null,
      avatar_url: byId.get(o.otherId)?.avatar_url ?? null,
      kind: o.kind,
    })));
    setLoading(false);
  }, [me]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-pull when either side of a friendship row changes.
  const friendsChannelId = useUniqueChannelId('friendships');
  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel(friendsChannelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => refresh())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [me, refresh, friendsChannelId]);

  return { friends, loading, refresh };
}

// ── Incoming game invites hook ────────────────────────────────────────────────
// Live pending invites addressed to me. Used by the global invite listener to
// surface an accept/decline prompt.
export function useIncomingInvites() {
  const { session } = useSession();
  const me = session?.user?.id;
  const [invites, setInvites] = useState<GameInvite[]>([]);

  const refresh = useCallback(async () => {
    if (!me) { setInvites([]); return; }
    const { data, error } = await supabase
      .from('game_invites')
      .select('id, from_user, to_user, room_code, game_kind, created_at')
      .eq('to_user', me).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) { console.warn('[invites] load failed:', error.message); return; } // keep prior
    setInvites((data ?? []) as GameInvite[]);
  }, [me]);

  useEffect(() => { refresh(); }, [refresh]);

  const invitesChannelId = useUniqueChannelId('invites');
  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel(invitesChannelId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'game_invites', filter: `to_user=eq.${me}` },
        () => refresh())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [me, refresh, invitesChannelId]);

  return { invites, refresh };
}

/** Upvote count for a profile. Via an RPC because player_upvotes RLS is
 *  self-scoped — a direct count would only ever see the viewer's own row. */
export async function getUpvoteCount(target: string): Promise<number> {
  const { data } = await supabase.rpc('get_upvote_count', { p_target: target });
  return (data as number | null) ?? 0;
}
