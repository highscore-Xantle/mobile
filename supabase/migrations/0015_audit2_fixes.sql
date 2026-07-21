-- Xantle — fixes from the second full audit (2026-07-15).
-- Scope: rooms lifecycle (finish/leave), rematch lobbies leaking back into
-- matchmaking, join_room race, and dead-table cleanup. No Draughts-specific
-- function is touched; the two shared-function changes (join_room lock,
-- reset_room matchmade clear) keep their contracts identical.

-- ── 1. reset_room / request_rematch must clear `matchmade` ──────────────────
-- A matchmade game that goes to a rematch flips back to 'lobby' with
-- matchmade still true. Its created_at is the ORIGINAL creation time — always
-- older than matchmaking's 40s window — so the host's next "Play Online"
-- deems it a stale leftover and DELETES it, cascading the seated opponent's
-- row and stranding them mid-lobby. A rematch lobby is a private continuation
-- between two known players, not a matchmaking slot: clear the flag.
create or replace function public.reset_room(p_room uuid, p_state jsonb)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  select * into r from public.rooms where id = p_room;
  if r.id is null then raise exception 'room not found'; end if;
  if r.host_id <> me then raise exception 'only host can reset'; end if;
  if exists (select 1 from public.room_players where room_id = p_room and is_bot) then
    raise exception 'cannot rematch a bot opponent';
  end if;
  update public.rooms set status = 'lobby', state = p_state, matchmade = false
   where id = r.id returning * into r;
  return r;
end $$;
grant execute on function public.reset_room(uuid, jsonb) to authenticated;

create or replace function public.request_rematch(p_game_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only host can rematch'; end if;
  if exists (select 1 from public.game_players where game_id = g.id and is_bot) then
    raise exception 'cannot rematch a bot opponent';
  end if;
  delete from public.game_rounds where game_id = g.id;
  update public.game_players set score = 0 where game_id = g.id;
  update public.games
     set status = 'lobby', current_round = 0, winner_player = null, winner_is_bot = false,
         started_at = null, finished_at = null, matchmade = false
   where id = g.id
  returning * into g;
  return g;
end $$;
grant execute on function public.request_rematch(uuid) to authenticated;

-- ── 2. finish_room: rooms were NEVER marked finished ─────────────────────────
-- Nothing in the rooms flow ever set status='finished', so the Games tab's
-- "LIVE" list (status='active') accumulated every match ever played — dead
-- games watchable forever, bot rooms included. Any member (not just the
-- host: the host may be the one who disconnected) can close an active room.
create or replace function public.finish_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.room_players where room_id = p_room and user_id = me) then
    raise exception 'not a player in this room';
  end if;
  update public.rooms set status = 'finished' where id = p_room and status = 'active';
end $$;
grant execute on function public.finish_room(uuid) to authenticated;

-- ── 3. leave_room: guests had no way to un-join a lobby ─────────────────────
-- Backing out of a lobby left the seat occupied forever: the room read 2/2,
-- later joiners got 'room is full', and the host could start against an
-- empty chair. Lobby-only and guest-only: mid-game leaving is handled by the
-- games' own concede/forfeit paths, and a departing HOST would strand the
-- room in a different way (host-only RPCs) — that stays a product decision.
create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.id is null then return; end if;
  if r.status <> 'lobby' then return; end if;
  if r.host_id = me then return; end if;
  delete from public.room_players where room_id = p_room and user_id = me;
end $$;
grant execute on function public.leave_room(uuid) to authenticated;

-- ── 4. join_room: TOCTOU race on the capacity check ──────────────────────────
-- The select→count→insert ran unlocked (unlike join_game, which locks the
-- game row), so two simultaneous joins could both pass `cnt < max_players`
-- and overfill a room. Same contract, now with the row locked.
create or replace function public.join_room(p_code text, p_display_name text default null)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; cnt int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.rooms where code = upper(p_code) and status = 'lobby' for update;
  if r.id is null then raise exception 'room not found or already started'; end if;
  if exists (select 1 from public.room_players where room_id = r.id and user_id = me) then return r; end if;
  select count(*) into cnt from public.room_players where room_id = r.id;
  if cnt >= r.max_players then raise exception 'room is full'; end if;
  insert into public.room_players (room_id, user_id, display_name)
       values (r.id, me, nullif(trim(coalesce(p_display_name, '')), ''));
  return r;
end $$;
grant execute on function public.join_room(text, text) to authenticated;

-- ── 5. Drop the dead matchmaking_queue surface ───────────────────────────────
-- Its only consumers (enqueue_or_match / leave_queue) were dropped in 0013;
-- the table, index, policy, and realtime membership were left behind.
drop table if exists public.matchmaking_queue cascade;
