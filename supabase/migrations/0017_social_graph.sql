-- Xantle — social graph: friends, blocks (24h), upvotes, and direct
-- game invites. Plus "search again" is pure client (re-enter matchmaking),
-- so it needs no schema — but blocks feed into matchmaking here so that
-- "search again" can't re-pair you with someone you just blocked.
--
-- All tables are RPC-write / self-scoped-read. Draughts objects are NOT
-- touched; matchmake_draughts keeps its current behaviour (block-exclusion
-- is added to number-duel and pixel_rush only, the games in active dev).

-- ── Tables ───────────────────────────────────────────────────────────────────

-- One row per friend relationship. A request is (requester -> addressee,
-- pending); acceptance flips status. "My friends" = accepted rows where I am
-- on either side.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  constraint friendship_not_self check (requester <> addressee),
  constraint friendship_unique unique (requester, addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee) where status = 'pending';
create index if not exists friendships_pair_idx on public.friendships (requester, addressee, status);

-- 24h (rolling) block. Matchmaking skips a lobby if EITHER party has an
-- unexpired block against the other.
create table if not exists public.player_blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (blocker, blocked),
  constraint block_not_self check (blocker <> blocked)
);
create index if not exists player_blocks_blocked_idx on public.player_blocks (blocked);

-- Reputation: one upvote per (voter, target), ever. Count is public (shown on
-- profiles); who voted is not sensitive but we keep reads self+target scoped.
create table if not exists public.player_upvotes (
  voter uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (voter, target),
  constraint upvote_not_self check (voter <> target)
);
create index if not exists player_upvotes_target_idx on public.player_upvotes (target);

-- Direct game invite: a friend creates a room, then invites another friend
-- straight into it (no code sharing). The invitee sees pending invites in
-- realtime and accepts to join the room.
create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  room_code text not null,
  game_kind text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  constraint invite_not_self check (from_user <> to_user)
);
create index if not exists game_invites_to_pending_idx on public.game_invites (to_user) where status = 'pending';

-- ── RLS: readable by the parties involved; all writes via RPCs below ─────────
alter table public.friendships    enable row level security;
alter table public.player_blocks  enable row level security;
alter table public.player_upvotes enable row level security;
alter table public.game_invites   enable row level security;

create policy friendships_read on public.friendships for select
  using (auth.uid() = requester or auth.uid() = addressee);
create policy blocks_read on public.player_blocks for select
  using (auth.uid() = blocker);
-- Upvote rows: the target and the voter can read (count is derived client-side
-- from the target's own readable rows).
create policy upvotes_read on public.player_upvotes for select
  using (auth.uid() = voter or auth.uid() = target);
create policy invites_read on public.game_invites for select
  using (auth.uid() = from_user or auth.uid() = to_user);

-- ── Friend RPCs ──────────────────────────────────────────────────────────────

-- Send (or auto-accept a reciprocal) friend request. If the addressee had
-- already requested me, this accepts instead of creating a duplicate.
create or replace function public.send_friend_request(p_addressee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  if p_addressee = me then raise exception 'cannot friend yourself'; end if;
  -- Blocked either way? Don't allow a friend request across a block.
  if exists (
    select 1 from public.player_blocks
     where expires_at > now()
       and ((blocker = me and blocked = p_addressee) or (blocker = p_addressee and blocked = me))
  ) then raise exception 'cannot friend a blocked player'; end if;
  -- Reciprocal pending request already there → accept it.
  update public.friendships set status = 'accepted'
   where requester = p_addressee and addressee = me and status = 'pending';
  if found then return; end if;
  insert into public.friendships (requester, addressee, status)
       values (me, p_addressee, 'pending')
  on conflict (requester, addressee) do nothing;
end $$;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_friend_request(p_requester uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
     where requester = p_requester and addressee = me and status = 'pending';
  else
    delete from public.friendships
     where requester = p_requester and addressee = me and status = 'pending';
  end if;
end $$;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Remove a friend (or cancel a pending request), either direction.
create or replace function public.remove_friend(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  delete from public.friendships
   where (requester = me and addressee = p_other)
      or (requester = p_other and addressee = me);
end $$;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ── Block RPCs ───────────────────────────────────────────────────────────────

-- Block for 24h (rolling — re-blocking refreshes the window). Also tears down
-- any friendship so a blocked player can't stay a "friend".
create or replace function public.block_player(p_blocked uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  if p_blocked = me then raise exception 'cannot block yourself'; end if;
  insert into public.player_blocks (blocker, blocked, created_at, expires_at)
       values (me, p_blocked, now(), now() + interval '24 hours')
  on conflict (blocker, blocked)
    do update set created_at = now(), expires_at = now() + interval '24 hours';
  delete from public.friendships
   where (requester = me and addressee = p_blocked)
      or (requester = p_blocked and addressee = me);
end $$;
grant execute on function public.block_player(uuid) to authenticated;

create or replace function public.unblock_player(p_blocked uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  delete from public.player_blocks where blocker = me and blocked = p_blocked;
end $$;
grant execute on function public.unblock_player(uuid) to authenticated;

-- ── Upvote RPC ───────────────────────────────────────────────────────────────

create or replace function public.upvote_player(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  if p_target = me then raise exception 'cannot upvote yourself'; end if;
  insert into public.player_upvotes (voter, target) values (me, p_target)
  on conflict (voter, target) do nothing;
end $$;
grant execute on function public.upvote_player(uuid) to authenticated;

-- ── Game invite RPCs ─────────────────────────────────────────────────────────

-- Invite a friend into a room I've already created. Requires an accepted
-- friendship and no active block.
create or replace function public.create_game_invite(p_to uuid, p_room_code text, p_game_kind text)
returns public.game_invites language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv public.game_invites;
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
  -- Supersede any earlier still-pending invite from me to them.
  update public.game_invites set status = 'expired'
   where from_user = me and to_user = p_to and status = 'pending';
  insert into public.game_invites (from_user, to_user, room_code, game_kind, status)
       values (me, p_to, p_room_code, p_game_kind, 'pending')
  returning * into inv;
  return inv;
end $$;
grant execute on function public.create_game_invite(uuid, text, text) to authenticated;

create or replace function public.respond_game_invite(p_invite uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  update public.game_invites
     set status = case when p_accept then 'accepted' else 'declined' end
   where id = p_invite and to_user = me and status = 'pending';
end $$;
grant execute on function public.respond_game_invite(uuid, boolean) to authenticated;

-- ── Block-aware matchmaking (number-duel + pixel_rush) ───────────────────────
-- Re-defines the two matchmake functions from 0013 with one extra clause:
-- never pair into a lobby whose host is in an unexpired block with me (either
-- direction). Everything else is identical to 0013.

create or replace function public.matchmake_number_duel()
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; c text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select rm.* into r
    from public.rooms rm
   where rm.game_kind = 'number-duel'
     and rm.status = 'lobby'
     and rm.matchmade
     and rm.host_id <> me
     and rm.created_at > now() - interval '40 seconds'
     and (select count(*) from public.room_players rp where rp.room_id = rm.id) = 1
     and not exists (
       select 1 from public.player_blocks b
        where b.expires_at > now()
          and ((b.blocker = me and b.blocked = rm.host_id)
            or (b.blocker = rm.host_id and b.blocked = me)))
   order by rm.created_at asc
   limit 1
   for update skip locked;

  if r.id is not null then
    insert into public.room_players (room_id, user_id, is_host) values (r.id, me, false);
    update public.rooms set status = 'active', started_at = now() where id = r.id returning * into r;
    return r;
  end if;

  select rm.* into r
    from public.rooms rm
   where rm.game_kind = 'number-duel' and rm.status = 'lobby'
     and rm.matchmade and rm.host_id = me
   order by rm.created_at desc limit 1;
  if r.id is not null then
    if r.created_at > now() - interval '40 seconds' then return r; end if;
    delete from public.rooms where id = r.id;
  end if;

  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.rooms where code = c and status <> 'finished');
  end loop;
  begin
    insert into public.rooms (code, host_id, game_kind, state, is_group, max_players, status, matchmade)
         values (c, me, 'number-duel', '{}'::jsonb, false, 2, 'lobby', true)
      returning * into r;
    insert into public.room_players (room_id, user_id, is_host) values (r.id, me, true);
  exception when unique_violation then
    select rm.* into r from public.rooms rm
     where rm.game_kind = 'number-duel' and rm.status = 'lobby' and rm.matchmade and rm.host_id = me
     order by rm.created_at desc limit 1;
  end;
  return r;
end $$;
grant execute on function public.matchmake_number_duel() to authenticated;

create or replace function public.matchmake_pixel_rush()
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; c text;
begin
  if me is null then raise exception 'auth required'; end if;

  select gm.* into g
    from public.games gm
   where gm.game_type = 'pixel_rush'
     and gm.kind = '1v1'
     and gm.status = 'lobby'
     and gm.matchmade
     and gm.host_id <> me
     and gm.created_at > now() - interval '40 seconds'
     and (select count(*) from public.game_players gp where gp.game_id = gm.id) = 1
     and not exists (
       select 1 from public.player_blocks b
        where b.expires_at > now()
          and ((b.blocker = me and b.blocked = gm.host_id)
            or (b.blocker = gm.host_id and b.blocked = me)))
   order by gm.created_at asc
   limit 1
   for update skip locked;

  if g.id is not null then
    insert into public.game_players (game_id, user_id, is_host) values (g.id, me, false);
    update public.games set status = 'active', current_round = 1, started_at = now() where id = g.id returning * into g;
    insert into public.game_rounds (game_id, round_no, status) values (g.id, 1, 'awaiting_image')
    on conflict (game_id, round_no) do nothing;
    return g;
  end if;

  select gm.* into g
    from public.games gm
   where gm.game_type = 'pixel_rush' and gm.kind = '1v1' and gm.status = 'lobby'
     and gm.matchmade and gm.host_id = me
   order by gm.created_at desc limit 1;
  if g.id is not null then
    if g.created_at > now() - interval '40 seconds' then return g; end if;
    delete from public.games where id = g.id;
  end if;

  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.games where invite_code = c and status <> 'finished');
  end loop;
  begin
    insert into public.games (host_id, kind, game_type, max_players, invite_code, status, matchmade)
         values (me, '1v1', 'pixel_rush', 2, c, 'lobby', true)
      returning * into g;
    insert into public.game_players (game_id, user_id, is_host) values (g.id, me, true);
  exception when unique_violation then
    select gm.* into g from public.games gm
     where gm.game_type = 'pixel_rush' and gm.status = 'lobby' and gm.matchmade and gm.host_id = me
     order by gm.created_at desc limit 1;
  end;
  return g;
end $$;
grant execute on function public.matchmake_pixel_rush() to authenticated;

-- Realtime for live pending-invite delivery.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_invites'
  ) then
    alter publication supabase_realtime add table public.game_invites;
  end if;
end $$;
