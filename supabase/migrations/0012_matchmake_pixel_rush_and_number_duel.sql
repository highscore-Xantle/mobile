-- Xantle — "Play Online" matchmaking for Pixel Rush and Number Duel, copying
-- Draughts' matchmake_draughts() pattern (0011_draughts_matchmaking.sql)
-- instead of Pixel Rush's old enqueue_or_match() queue-table approach.
--
-- Why: enqueue_or_match() returns SQL NULL while the caller is still waiting
-- to be matched. Postgres/PostgREST serializes a NULL row of a composite
-- return type as a JSON object with every field null, not bare `null` — the
-- client's truthiness check treated that all-null object as "matched" and
-- navigated to /game/null, which is the "returns to Go home and doesn't
-- start" bug. matchmake_draughts() sidesteps this entirely by ALWAYS
-- returning a real row: status 'active' if paired immediately, 'lobby' if
-- the caller is now waiting (client watches for the row to flip to active,
-- with a client-side bot-fallback timeout). This migration gives Pixel Rush
-- and Number Duel the same shape.

-- ── Pixel Rush (games/game_players schema) ───────────────────────────────────
create or replace function public.matchmake_pixel_rush()
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; c text;
begin
  if me is null then raise exception 'auth required'; end if;

  -- A recent open 1v1 pixel_rush game, hosted by someone else, with one player.
  select gm.* into g
    from public.games gm
   where gm.game_type = 'pixel_rush'
     and gm.kind = '1v1'
     and gm.status = 'lobby'
     and gm.host_id <> me
     and gm.created_at > now() - interval '40 seconds'
     and (select count(*) from public.game_players gp where gp.game_id = gm.id) = 1
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

  -- None open → create one and wait for someone (or the client's bot fallback).
  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.games where invite_code = c and status <> 'finished');
  end loop;
  insert into public.games (host_id, kind, game_type, max_players, invite_code, status)
       values (me, '1v1', 'pixel_rush', 2, c, 'lobby')
    returning * into g;
  insert into public.game_players (game_id, user_id, is_host) values (g.id, me, true);
  return g;
end $$;
grant execute on function public.matchmake_pixel_rush() to authenticated;

-- cancel_pixel_rush_match: drop the caller's still-waiting lobby game (used on
-- the client's bot-fallback timeout or when the player backs out).
create or replace function public.cancel_pixel_rush_match(p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  delete from public.games where id = p_game and host_id = me and status = 'lobby';
end $$;
grant execute on function public.cancel_pixel_rush_match(uuid) to authenticated;

-- ── Number Duel (rooms/room_players schema — same shape as Draughts) ─────────
create or replace function public.matchmake_number_duel()
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; c text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select rm.* into r
    from public.rooms rm
   where rm.game_kind = 'number-duel'
     and rm.status = 'lobby'
     and rm.host_id <> me
     and rm.created_at > now() - interval '40 seconds'
     and (select count(*) from public.room_players rp where rp.room_id = rm.id) = 1
   order by rm.created_at asc
   limit 1
   for update skip locked;

  if r.id is not null then
    insert into public.room_players (room_id, user_id, is_host) values (r.id, me, false);
    update public.rooms set status = 'active', started_at = now() where id = r.id returning * into r;
    return r;
  end if;

  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.rooms where code = c and status <> 'finished');
  end loop;
  insert into public.rooms (code, host_id, game_kind, state, is_group, max_players, status)
       values (c, me, 'number-duel', '{}'::jsonb, false, 2, 'lobby')
    returning * into r;
  insert into public.room_players (room_id, user_id, is_host) values (r.id, me, true);
  return r;
end $$;
grant execute on function public.matchmake_number_duel() to authenticated;
-- cancel_matchmaking(uuid) from 0011_draughts_matchmaking.sql is already
-- generic (deletes any caller-hosted 'lobby' room regardless of game_kind),
-- so Number Duel reuses it as-is — no new cancel function needed.
