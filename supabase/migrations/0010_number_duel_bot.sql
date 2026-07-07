-- Xantle — Number Duel bot opponent, mirroring 0007_pixel_rush_matchmaking.sql's
-- bot pattern but adapted to the rooms/room_players schema (0001/0004).
--
-- Unlike Pixel Rush's bot (server just records a solve time), Number Duel's
-- P2P game logic runs entirely client-side via Realtime broadcast between two
-- real devices — there's no second device for a bot. So the bot's opponent
-- behavior (picking a secret, guessing the human's) is simulated locally in
-- src/app/game/number-duel.tsx. This migration only needs to make a bot
-- room_players row possible so the room looks like a normal 2-player match to
-- every other RPC (join_room, start_room, etc. are unaffected).

alter table public.room_players alter column user_id drop not null;
alter table public.room_players add column if not exists is_bot boolean not null default false;
do $$ begin
  alter table public.room_players add constraint room_players_user_or_bot check (user_id is not null or is_bot);
exception when duplicate_object then null; end $$;

-- ── create_bot_room: host + bot seated immediately, room starts active ──────
-- Skips the lobby entirely — same "no waiting" behavior as create_bot_match.
create or replace function public.create_bot_room(p_state jsonb default '{}'::jsonb)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; c text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.rooms where code = c and status <> 'finished');
  end loop;
  insert into public.rooms (code, host_id, game_kind, state, is_group, max_players, status, started_at)
       values (c, me, 'number-duel', p_state, false, 2, 'active', now())
    returning * into r;
  insert into public.room_players (room_id, user_id, is_host) values (r.id, me, true);
  insert into public.room_players (room_id, display_name, is_bot) values (r.id, 'Xantle Bot', true);
  return r;
end $$;
grant execute on function public.create_bot_room(jsonb) to authenticated;

-- ── reset_room: no rematches against a bot (mirrors request_rematch's guard) ─
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
  update public.rooms set status = 'lobby', state = p_state where id = r.id returning * into r;
  return r;
end $$;
grant execute on function public.reset_room(uuid, jsonb) to authenticated;
