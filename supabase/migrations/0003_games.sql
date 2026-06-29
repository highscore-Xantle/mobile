-- Xantle — schema v3: generic multiplayer "games" backend for Pixel Rush (D4).
-- Separate from rooms/room_players (Number Duel) for now; see note in PR #12
-- review about unifying later. Built to match the client contract in
-- src/lib/usePixelGame.ts exactly (table shapes + 8 RPCs).
--
-- IMPORTANT semantics: games.winner_player and game_rounds.winner_player store
-- the winner's USER id (auth.uid()) — the client matches them with
-- game_players.user_id, not the game_players row id.

-- ── games ─────────────────────────────────────────────────────────────────
create table if not exists public.games (
  id             uuid primary key default gen_random_uuid(),
  host_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null,                       -- mode, e.g. '1v1'
  game_type      text not null,                       -- which game, e.g. 'pixel_rush'
  max_players    int  not null default 2 check (max_players between 2 and 8),
  status         text not null default 'lobby' check (status in ('lobby','active','finished')),
  invite_code    text not null unique,
  current_round  int  not null default 0,
  rounds_total   int  not null default 10,
  winner_player  uuid references public.profiles(id) on delete set null,  -- user id
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists games_status_idx on public.games (status);

-- ── game_players ────────────────────────────────────────────────────────────
create table if not exists public.game_players (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,   -- null for guests
  guest_name  text,
  is_host     boolean not null default false,
  score       int not null default 0,        -- rounds won this match
  trophies    int not null default 0,         -- games won (lifetime, survives rematch)
  joined_at   timestamptz not null default now(),
  unique (game_id, user_id),
  check (user_id is not null or guest_name is not null)
);
create index if not exists game_players_game_idx on public.game_players (game_id);
create index if not exists game_players_user_idx on public.game_players (user_id);

-- ── game_rounds ───────────────────────────────────────────────────────────
create table if not exists public.game_rounds (
  game_id        uuid not null references public.games(id) on delete cascade,
  round_no       int  not null,
  image_url      text,
  status         text not null default 'awaiting_image' check (status in ('awaiting_image','racing','done')),
  started_at     timestamptz,
  winner_player  uuid references public.profiles(id) on delete set null,  -- user id
  winner_time_ms int,
  primary key (game_id, round_no)
);

-- ── RPCs (SECURITY DEFINER; all writes go through these so RLS can stay read-only) ──

-- create_game: host opens a lobby + joins as host. Returns the row (client .select().single()).
create or replace function public.create_game(p_kind text, p_max int default 2, p_type text default 'pixel_rush')
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; c text;
begin
  if me is null then raise exception 'auth required'; end if;
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

-- join_game: add caller to a lobby if there's room.
create or replace function public.join_game(p_code text, p_guest_name text default null)
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; cnt int;
begin
  if me is null then raise exception 'auth required'; end if;
  select * into g from public.games where invite_code = upper(p_code) for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status <> 'lobby' then raise exception 'game already started'; end if;
  select count(*) into cnt from public.game_players where game_id = g.id;
  if cnt >= g.max_players then raise exception 'game full'; end if;
  insert into public.game_players (game_id, user_id, guest_name, is_host)
       values (g.id, me, p_guest_name, false)
  on conflict (game_id, user_id) do nothing;
  return g;
end $$;
grant execute on function public.join_game(text, text) to authenticated;

-- start_game: host flips to active, opens round 1.
create or replace function public.start_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only host can start'; end if;
  update public.games set status = 'active', current_round = 1, started_at = now() where id = g.id;
  insert into public.game_rounds (game_id, round_no, status) values (g.id, 1, 'awaiting_image')
  on conflict (game_id, round_no) do nothing;
end $$;
grant execute on function public.start_game(uuid) to authenticated;

-- set_round_image: host posts the puzzle image and starts the race for a round.
create or replace function public.set_round_image(p_game_id uuid, p_round int, p_image text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only host can set image'; end if;
  insert into public.game_rounds (game_id, round_no, image_url, status, started_at)
       values (p_game_id, p_round, p_image, 'racing', now())
  on conflict (game_id, round_no)
       do update set image_url = excluded.image_url, status = 'racing', started_at = now();
end $$;
grant execute on function public.set_round_image(uuid, int, text) to authenticated;

-- submit_solve: first solver wins the round (atomic — only the update that flips
-- winner_player from null succeeds), and gains a round point.
create or replace function public.submit_solve(p_game_id uuid, p_round int, p_time_ms int)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); updated int;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  update public.game_rounds
     set winner_player = me, winner_time_ms = p_time_ms, status = 'done'
   where game_id = p_game_id and round_no = p_round and winner_player is null and status = 'racing';
  get diagnostics updated = row_count;
  if updated > 0 then
    update public.game_players set score = score + 1 where game_id = p_game_id and user_id = me;
  end if;
end $$;
grant execute on function public.submit_solve(uuid, int, int) to authenticated;

-- auto_advance_round: move to the next round, or finish + crown the champion.
-- Row-locks the game and guards on current_round so concurrent callers don't double-advance.
create or replace function public.auto_advance_round(p_game_id uuid, p_round int)
returns void language plpgsql security definer set search_path = public as $$
declare g public.games; champ uuid;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status <> 'active' or g.current_round <> p_round then return; end if;  -- already advanced
  if g.current_round < g.rounds_total then
    update public.games set current_round = current_round + 1 where id = g.id;
    insert into public.game_rounds (game_id, round_no, status) values (g.id, g.current_round + 1, 'awaiting_image')
    on conflict (game_id, round_no) do nothing;
  else
    select user_id into champ from public.game_players
      where game_id = g.id and user_id is not null
      order by score desc, joined_at asc limit 1;
    update public.games set status = 'finished', finished_at = now(), winner_player = champ where id = g.id;
    if champ is not null then
      update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = champ;
    end if;
  end if;
end $$;
grant execute on function public.auto_advance_round(uuid, int) to authenticated;

-- request_rematch: host resets the same game back to lobby. Scores reset, trophies
-- (lifetime games won) are kept so profile stats stay accurate.
create or replace function public.request_rematch(p_game_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only host can rematch'; end if;
  delete from public.game_rounds where game_id = g.id;
  update public.game_players set score = 0 where game_id = g.id;
  update public.games
     set status = 'lobby', current_round = 0, winner_player = null, started_at = null, finished_at = null
   where id = g.id
  returning * into g;
  return g;
end $$;
grant execute on function public.request_rematch(uuid) to authenticated;

-- leave_game: drop the caller; finish if empty, hand off host if the host leaves.
create or replace function public.leave_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; remaining int; new_host public.game_players;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then return; end if;
  delete from public.game_players where game_id = p_game_id and user_id = me;
  select count(*) into remaining from public.game_players where game_id = p_game_id;
  if remaining = 0 then
    update public.games set status = 'finished', finished_at = now() where id = p_game_id;
  elsif g.host_id = me then
    select * into new_host from public.game_players where game_id = p_game_id order by joined_at asc limit 1;
    update public.game_players set is_host = true where id = new_host.id;
    if new_host.user_id is not null then
      update public.games set host_id = new_host.user_id where id = p_game_id;
    end if;
  end if;
end $$;
grant execute on function public.leave_game(uuid) to authenticated;

-- ── RLS — read-only for clients; all writes are via the SECURITY DEFINER RPCs above ──
alter table public.games        enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds  enable row level security;

drop policy if exists "games readable" on public.games;
create policy "games readable" on public.games for select to authenticated using (true);

drop policy if exists "game_players readable" on public.game_players;
create policy "game_players readable" on public.game_players for select to authenticated using (true);

drop policy if exists "game_rounds readable" on public.game_rounds;
create policy "game_rounds readable" on public.game_rounds for select to authenticated using (true);

-- ── Realtime — the client subscribes to postgres_changes on all three ──
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='games') then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_players') then
    alter publication supabase_realtime add table public.game_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_rounds') then
    alter publication supabase_realtime add table public.game_rounds;
  end if;
end $$;
