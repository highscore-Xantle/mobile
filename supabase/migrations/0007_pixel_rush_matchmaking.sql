-- Xantle — Pixel Rush matchmaking: bot opponents, open 1v1 matchmaking queue,
-- premium-gated group sizes. Builds on schema v3 (0003_games.sql).
--
-- IMPORTANT: bot players are game_players rows with user_id = null, guest_name =
-- 'Xantle Bot', is_bot = true. Because games.winner_player / game_rounds.winner_player
-- reference profiles(id), they can never point at a bot — so a parallel
-- `winner_is_bot` boolean disambiguates "the bot won" from "not decided yet / draw".

-- ── game_players: bot flag ───────────────────────────────────────────────────
alter table public.game_players add column if not exists is_bot boolean not null default false;

-- ── games / game_rounds: bot-winner flag ─────────────────────────────────────
alter table public.games        add column if not exists winner_is_bot boolean not null default false;
alter table public.game_rounds  add column if not exists winner_is_bot boolean not null default false;

-- ── matchmaking_queue ─────────────────────────────────────────────────────────
create table if not exists public.matchmaking_queue (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  game_type        text not null,
  matched_game_id  uuid references public.games(id) on delete set null,
  created_at       timestamptz not null default now()
);
create unique index if not exists matchmaking_queue_open_idx
  on public.matchmaking_queue (user_id, game_type) where matched_game_id is null;

alter table public.matchmaking_queue enable row level security;
drop policy if exists "own queue row readable" on public.matchmaking_queue;
create policy "own queue row readable" on public.matchmaking_queue
  for select to authenticated using (user_id = auth.uid());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='matchmaking_queue') then
    alter publication supabase_realtime add table public.matchmaking_queue;
  end if;
end $$;

-- ── create_game: premium-gate group sizes (mirrors create_room's gate) ──────
create or replace function public.create_game(p_kind text, p_max int default 2, p_type text default 'pixel_rush')
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; c text;
begin
  if me is null then raise exception 'auth required'; end if;
  if p_max > 2 and not public.has_premium(me) then
    raise exception 'Group play is a premium feature — subscribe to host groups.';
  end if;
  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.games where invite_code = c and status <> 'finished');
  end loop;
  insert into public.games (host_id, kind, game_type, max_players, invite_code)
       values (me, p_kind, p_type, greatest(2, least(8, p_max)), c)
    returning * into g;
  insert into public.game_players (game_id, user_id, is_host) values (g.id, me, true);
  return g;
end $$;
grant execute on function public.create_game(text, int, text) to authenticated;

-- ── enqueue_or_match: pair up two open-matchmaking players, or queue solo ───
-- Matched games skip the lobby entirely (both players already opted in), same
-- as a bot match — starts active with round 1 open immediately.
--
-- Idempotent/pollable by design: if two players call this within the same
-- window, neither's first call finds the other yet (both just queue) — so the
-- CLIENT calls this repeatedly while waiting, not just once. Each call first
-- checks whether the caller was already paired by someone else's poll before
-- attempting to pair again, so repeated calls never double-book the caller.
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
   where game_type = p_type and user_id <> me and matched_game_id is null
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
  on conflict (user_id, game_type) where matched_game_id is null
  do update set created_at = now();

  return null;
end $$;
grant execute on function public.enqueue_or_match(text) to authenticated;

-- ── leave_queue: cancel / timeout out of open matchmaking ───────────────────
create or replace function public.leave_queue(p_type text default 'pixel_rush')
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  delete from public.matchmaking_queue
   where user_id = me and game_type = p_type and matched_game_id is null;
end $$;
grant execute on function public.leave_queue(text) to authenticated;

-- ── create_bot_match: 30s timeout with nobody queued → play the machine ────
create or replace function public.create_bot_match(p_type text default 'pixel_rush')
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; c text;
begin
  if me is null then raise exception 'auth required'; end if;
  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.games where invite_code = c and status <> 'finished');
  end loop;
  insert into public.games (host_id, kind, game_type, max_players, invite_code, status, current_round, started_at)
       values (me, '1v1', p_type, 2, c, 'active', 1, now())
    returning * into g;
  insert into public.game_players (game_id, user_id, is_host) values (g.id, me, true);
  insert into public.game_players (game_id, guest_name, is_host, is_bot) values (g.id, 'Xantle Bot', false, true);
  insert into public.game_rounds (game_id, round_no, status) values (g.id, 1, 'awaiting_image');
  return g;
end $$;
grant execute on function public.create_bot_match(text) to authenticated;

-- ── submit_bot_solve: same atomic first-solver guard as submit_solve, for the
-- bot's game_players row. Caller must themselves be a player in the game so
-- it can't be triggered into someone else's match.
create or replace function public.submit_bot_solve(p_game_id uuid, p_round int, p_time_ms int)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); bot_row public.game_players; updated int;
begin
  if me is null then raise exception 'auth required'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  select * into bot_row from public.game_players where game_id = p_game_id and is_bot limit 1;
  if bot_row.id is null then raise exception 'no bot in this game'; end if;

  update public.game_rounds
     set winner_is_bot = true, winner_time_ms = p_time_ms, status = 'done'
   where game_id = p_game_id and round_no = p_round and winner_player is null and status = 'racing';
  get diagnostics updated = row_count;
  if updated > 0 then
    update public.game_players set score = score + 1 where id = bot_row.id;
  end if;
end $$;
grant execute on function public.submit_bot_solve(uuid, int, int) to authenticated;

-- ── auto_advance_round: now considers bot rows when crowning the champion
-- (previously filtered to `user_id is not null`, which would always crown the
-- human even if the bot scored higher).
create or replace function public.auto_advance_round(p_game_id uuid, p_round int)
returns void language plpgsql security definer set search_path = public as $$
declare g public.games; champ public.game_players;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status <> 'active' or g.current_round <> p_round then return; end if;
  if g.current_round < g.rounds_total then
    update public.games set current_round = current_round + 1 where id = g.id;
    insert into public.game_rounds (game_id, round_no, status) values (g.id, g.current_round + 1, 'awaiting_image')
    on conflict (game_id, round_no) do nothing;
  else
    select * into champ from public.game_players
      where game_id = g.id
      order by score desc, joined_at asc limit 1;
    update public.games
       set status = 'finished', finished_at = now(),
           winner_player = champ.user_id,
           winner_is_bot = coalesce(champ.is_bot, false)
     where id = g.id;
    if champ.user_id is not null then
      update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = champ.user_id;
    end if;
  end if;
end $$;
grant execute on function public.auto_advance_round(uuid, int) to authenticated;

-- ── request_rematch: no rematches against a bot ─────────────────────────────
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
         started_at = null, finished_at = null
   where id = g.id
  returning * into g;
  return g;
end $$;
grant execute on function public.request_rematch(uuid) to authenticated;
