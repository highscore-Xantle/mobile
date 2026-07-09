-- Xantle — Number Duel "anyone can join" matchmaking, mirroring Pixel Rush's
-- enqueue_or_match / 30s-wait / bot-fallback flow (0007), but pairing into
-- rooms (Number Duel's schema) instead of games (Pixel Rush's schema).
--
-- matchmaking_queue is shared across both games_type namespaces — extended
-- with a second nullable FK so one table can point at either a matched game
-- or a matched room, keyed off which RPC the caller used.

alter table public.matchmaking_queue add column if not exists matched_room_id uuid references public.rooms(id) on delete set null;

drop index if exists matchmaking_queue_open_idx;
create unique index if not exists matchmaking_queue_open_idx
  on public.matchmaking_queue (user_id, game_type) where matched_game_id is null and matched_room_id is null;

-- enqueue_or_match's ON CONFLICT clause must exactly match a unique index's
-- predicate to be valid — since the index above now also checks
-- matched_room_id, this function needs the same guard (in both its ON
-- CONFLICT clause and its "other queued player" lookup, so it can't try to
-- re-match someone who's actually already paired into a room).
create or replace function public.enqueue_or_match(p_type text default 'pixel_rush')
returns public.games language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine public.matchmaking_queue;
  other public.matchmaking_queue;
  g public.games;
  c text;
begin
  if me is null then raise exception 'auth required'; end if;

  select * into mine from public.matchmaking_queue
   where user_id = me and game_type = p_type and matched_game_id is not null
   order by created_at desc limit 1;
  if mine.matched_game_id is not null then
    select * into g from public.games where id = mine.matched_game_id;
    if g.id is not null then return g; end if;
  end if;

  delete from public.matchmaking_queue where created_at < now() - interval '45 seconds';

  select * into other from public.matchmaking_queue
   where game_type = p_type and user_id <> me and matched_game_id is null and matched_room_id is null
   order by created_at asc
   limit 1
   for update skip locked;

  if other.id is not null then
    loop
      c := upper(substring(md5(random()::text) for 5));
      exit when not exists (select 1 from public.games where invite_code = c and status <> 'finished');
    end loop;
    insert into public.games (host_id, kind, game_type, max_players, invite_code, status, current_round, started_at)
         values (other.user_id, '1v1', p_type, 2, c, 'active', 1, now())
      returning * into g;
    insert into public.game_players (game_id, user_id, is_host) values (g.id, other.user_id, true);
    insert into public.game_players (game_id, user_id, is_host) values (g.id, me, false);
    insert into public.game_rounds (game_id, round_no, status) values (g.id, 1, 'awaiting_image');
    update public.matchmaking_queue set matched_game_id = g.id where id = other.id;
    return g;
  end if;

  insert into public.matchmaking_queue (user_id, game_type) values (me, p_type)
  on conflict (user_id, game_type) where matched_game_id is null and matched_room_id is null
  do update set created_at = now();

  return null;
end $$;
grant execute on function public.enqueue_or_match(text) to authenticated;

-- leave_queue previously only checked matched_game_id is null, so a caller
-- who'd just been matched into a ROOM (matched_room_id set, matched_game_id
-- still null) would get incorrectly deleted from the queue by their own
-- leave_queue call — re-guard on both columns.
create or replace function public.leave_queue(p_type text default 'pixel_rush')
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  delete from public.matchmaking_queue
   where user_id = me and game_type = p_type and matched_game_id is null and matched_room_id is null;
end $$;
grant execute on function public.leave_queue(text) to authenticated;

-- ── enqueue_or_match_room: pair up two open-matchmaking players into a room,
-- or queue solo. Idempotent/pollable — same contract as enqueue_or_match.
-- A matched room skips the lobby entirely (both players already opted in),
-- starting active with round 1 open immediately.
create or replace function public.enqueue_or_match_room(p_type text default 'number-duel', p_state jsonb default '{}'::jsonb)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine public.matchmaking_queue;
  other public.matchmaking_queue;
  r public.rooms;
  c text;
begin
  if me is null then raise exception 'auth required'; end if;

  select * into mine from public.matchmaking_queue
   where user_id = me and game_type = p_type and matched_room_id is not null
   order by created_at desc limit 1;
  if mine.matched_room_id is not null then
    select * into r from public.rooms where id = mine.matched_room_id;
    if r.id is not null then return r; end if;
  end if;

  delete from public.matchmaking_queue where created_at < now() - interval '45 seconds';

  select * into other from public.matchmaking_queue
   where game_type = p_type and user_id <> me and matched_game_id is null and matched_room_id is null
   order by created_at asc
   limit 1
   for update skip locked;

  if other.id is not null then
    loop
      c := upper(substring(md5(random()::text) for 5));
      exit when not exists (select 1 from public.rooms where code = c and status <> 'finished');
    end loop;
    insert into public.rooms (code, host_id, game_kind, state, is_group, max_players, status, started_at)
         values (c, other.user_id, p_type, p_state, false, 2, 'active', now())
      returning * into r;
    insert into public.room_players (room_id, user_id, is_host) values (r.id, other.user_id, true);
    insert into public.room_players (room_id, user_id, is_host) values (r.id, me, false);
    update public.matchmaking_queue set matched_room_id = r.id where id = other.id;
    return r;
  end if;

  insert into public.matchmaking_queue (user_id, game_type) values (me, p_type)
  on conflict (user_id, game_type) where matched_game_id is null and matched_room_id is null
  do update set created_at = now();

  return null;
end $$;
grant execute on function public.enqueue_or_match_room(text, jsonb) to authenticated;
