-- Xantle — hardening from the social-feature security audit (2026-07-16).
-- No critical/high holes were found; these close the medium/low gaps:
--   1. get_upvote_count RPC (RLS made a public count impossible client-side)
--   2. create_game_invite must derive the room from a room the caller is in
--      (was trusting an arbitrary client-supplied room code + game_kind)
--   3. blocks enforced on direct join_room / join_game, not just matchmaking
--   4. friend-request spam cap
--   5. duplicate/asymmetric friendship rows

-- ── 1. Public upvote count via SECURITY DEFINER (bypasses the self-scoped RLS) ─
create or replace function public.get_upvote_count(p_target uuid)
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::int from public.player_upvotes where target = p_target;
$$;
grant execute on function public.get_upvote_count(uuid) to authenticated;

-- ── 2. create_game_invite: room must be one the caller is in; kind derived ────
-- Was inserting a caller-supplied p_room_code / p_game_kind unchecked, so a
-- friend could invite you into a STRANGER's room (rooms are world-readable by
-- code) and your one-tap Accept would auto-join it. Now the room must exist,
-- be a lobby, and have the caller seated; game_kind comes from the room.
-- Signature changes (drops p_game_kind), so drop the old overload first.
drop function if exists public.create_game_invite(uuid, text, text);
create or replace function public.create_game_invite(p_to uuid, p_room_code text)
returns public.game_invites language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rm public.rooms; inv public.game_invites;
begin
  if me is null then raise exception 'auth required'; end if;
  if not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester = me and addressee = p_to) or (requester = p_to and addressee = me))
  ) then raise exception 'can only invite friends'; end if;
  if exists (
    select 1 from public.player_blocks where expires_at > now()
       and ((blocker = me and blocked = p_to) or (blocker = p_to and blocked = me))
  ) then raise exception 'cannot invite a blocked player'; end if;
  -- The room must be a real lobby the caller is actually in.
  select * into rm from public.rooms where code = upper(p_room_code) and status = 'lobby';
  if rm.id is null then raise exception 'room not found'; end if;
  if not exists (select 1 from public.room_players where room_id = rm.id and user_id = me) then
    raise exception 'not a member of that room';
  end if;
  update public.game_invites set status = 'expired'
   where from_user = me and to_user = p_to and status = 'pending';
  insert into public.game_invites (from_user, to_user, room_code, game_kind, status)
       values (me, p_to, rm.code, rm.game_kind, 'pending')   -- kind derived from the room, not the client
  returning * into inv;
  return inv;
end $$;
grant execute on function public.create_game_invite(uuid, text) to authenticated;

-- ── 3. Enforce blocks on direct joins ────────────────────────────────────────
-- A block only stopped auto-matchmaking; a blocked user who read the victim's
-- room/invite code could still join_room / join_game directly. Add the same
-- bidirectional unexpired-block check to both. (join_room is shared with
-- Draughts — this is an additive guard, its normal contract is unchanged.)
create or replace function public.join_room(p_code text, p_display_name text default null)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; cnt int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.rooms where code = upper(p_code) and status = 'lobby' for update;
  if r.id is null then raise exception 'room not found or already started'; end if;
  if exists (select 1 from public.room_players where room_id = r.id and user_id = me) then return r; end if;
  if exists (
    select 1 from public.player_blocks b where b.expires_at > now()
       and ((b.blocker = me and b.blocked = r.host_id) or (b.blocker = r.host_id and b.blocked = me))
  ) then raise exception 'cannot join this player'; end if;
  select count(*) into cnt from public.room_players where room_id = r.id;
  if cnt >= r.max_players then raise exception 'room is full'; end if;
  insert into public.room_players (room_id, user_id, display_name)
       values (r.id, me, nullif(trim(coalesce(p_display_name, '')), ''));
  return r;
end $$;
grant execute on function public.join_room(text, text) to authenticated;

create or replace function public.join_game(p_code text, p_guest_name text default null)
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; cnt int;
begin
  if me is null then raise exception 'auth required'; end if;
  select * into g from public.games where invite_code = upper(p_code) for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status <> 'lobby' then raise exception 'game already started'; end if;
  if exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = me) then return g; end if;
  if exists (
    select 1 from public.player_blocks b where b.expires_at > now()
       and ((b.blocker = me and b.blocked = g.host_id) or (b.blocker = g.host_id and b.blocked = me))
  ) then raise exception 'cannot join this player'; end if;
  select count(*) into cnt from public.game_players where game_id = g.id;
  if cnt >= g.max_players then raise exception 'game full'; end if;
  insert into public.game_players (game_id, user_id, guest_name, is_host)
       values (g.id, me, p_guest_name, false)
  on conflict (game_id, user_id) do nothing;
  return g;
end $$;
grant execute on function public.join_game(text, text) to authenticated;

-- ── 6. discard_room: host cleanup for an unused lobby ────────────────────────
-- inviteFriendToGame creates a room then the invite; if the invite fails the
-- room was orphaned in 'lobby' forever (there's no host leave path). This lets
-- the host delete their own still-empty lobby (only the two seats or fewer).
create or replace function public.discard_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  if me is null then raise exception 'auth required'; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.id is null then return; end if;
  if r.host_id <> me then raise exception 'only host can discard'; end if;
  if r.status <> 'lobby' then raise exception 'room already started'; end if;
  delete from public.rooms where id = p_room;  -- room_players cascades
end $$;
grant execute on function public.discard_room(uuid) to authenticated;

-- ── 4 & 5. Friend-request spam cap + duplicate/asymmetric row fix ────────────
create or replace function public.send_friend_request(p_addressee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  if p_addressee = me then raise exception 'cannot friend yourself'; end if;
  if exists (
    select 1 from public.player_blocks
     where expires_at > now()
       and ((blocker = me and blocked = p_addressee) or (blocker = p_addressee and blocked = me))
  ) then raise exception 'cannot friend a blocked player'; end if;
  -- Already related in EITHER direction (accepted, or a pending I sent) → done.
  -- Prevents the asymmetric duplicate row where B re-requests an already-
  -- accepted friendship with A and shows up twice in the list.
  if exists (
    select 1 from public.friendships
     where (requester = me and addressee = p_addressee)
        or (requester = p_addressee and addressee = me and status = 'accepted')
  ) then return; end if;
  -- Reciprocal pending request from them → accept it instead of duplicating.
  update public.friendships set status = 'accepted'
   where requester = p_addressee and addressee = me and status = 'pending';
  if found then return; end if;
  -- Light spam cap: at most 50 outstanding requests I've sent.
  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 50 then
    raise exception 'too many pending friend requests';
  end if;
  insert into public.friendships (requester, addressee, status)
       values (me, p_addressee, 'pending')
  on conflict (requester, addressee) do nothing;
end $$;
grant execute on function public.send_friend_request(uuid) to authenticated;
