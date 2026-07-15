-- Xantle — fixes from the full-codebase audit (2026-07-13). Three unrelated
-- fixes bundled in one migration since they're all small and independent.
-- Deliberately does NOT touch anything Draughts-specific (matchmake_draughts,
-- cancel_matchmaking) — that game isn't ours to change.

-- ── 1. Profile location/address was world-readable ──────────────────────────
-- profiles has had `select using (true)` since 0001_init.sql (needed so
-- username/avatar_url are visible app-wide), but 0006/0009 added exact GPS
-- coordinates and a street address straight onto that same table — every
-- authenticated user could read every other user's precise location. This is
-- exactly the pitfall 0002_settings.sql called out when it gave push_tokens
-- its own self-only table; that lesson just never got applied here. Nothing
-- in the client currently reads these fields back (onboarding.tsx only ever
-- writes them), so moving them is low-risk.
create table if not exists public.profile_location (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  city       text,
  region     text,
  country    text,
  latitude   double precision,
  longitude  double precision,
  address    text,
  updated_at timestamptz not null default now()
);

-- Guarded so the file is safe to re-run: on a DB where the columns were
-- already migrated + dropped, this copy is skipped instead of erroring.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'city'
  ) then
    insert into public.profile_location (user_id, city, region, country, latitude, longitude, address)
    select id, city, region, country, latitude, longitude, address from public.profiles
    on conflict (user_id) do nothing;
  end if;
end $$;

alter table public.profiles
  drop column if exists city,
  drop column if exists region,
  drop column if exists country,
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists address;

alter table public.profile_location enable row level security;

drop policy if exists "profile_location self read" on public.profile_location;
create policy "profile_location self read" on public.profile_location
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "profile_location self insert" on public.profile_location;
create policy "profile_location self insert" on public.profile_location
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "profile_location self update" on public.profile_location;
create policy "profile_location self update" on public.profile_location
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 2. Matchmaking fixes ─────────────────────────────────────────────────────
-- (a) "Play Online" hijacked PRIVATE invite lobbies: matchmake_* matched into
--     ANY 1-player lobby of that game type — including one someone had just
--     created to invite a friend into. A stranger could take the friend's
--     seat within the 40s window and the game auto-started without the host
--     ever pressing anything. Lobbies now carry a `matchmade` flag and
--     matchmaking only ever touches its own kind.
-- (b) Neither function checked whether the caller already had an open lobby
--     before creating a new one (double-tap / dropped-response retry left
--     orphaned lobbies a third player could match into and wait forever).
--     Now idempotent — but a stale own-lobby (older than the 40s matchable
--     window, e.g. after a crash) is deleted and recreated fresh, otherwise
--     the caller could never be matched again.
-- (c) A partial unique index backstops the double-tap race two concurrent
--     transactions could still win; the unique_violation is caught and the
--     surviving lobby returned.
alter table public.games add column if not exists matchmade boolean not null default false;
alter table public.rooms add column if not exists matchmade boolean not null default false;
create unique index if not exists games_one_matchmade_lobby_per_host
  on public.games (host_id) where (status = 'lobby' and matchmade);
create unique index if not exists rooms_one_matchmade_lobby_per_host
  on public.rooms (host_id) where (status = 'lobby' and matchmade);

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
    -- Stale (crash leftover): older than the matchable window, so nobody can
    -- ever pair into it — recreate fresh instead of returning a dead lobby.
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
    -- A concurrent call from this same user created the lobby first — return it.
    select gm.* into g from public.games gm
     where gm.game_type = 'pixel_rush' and gm.status = 'lobby' and gm.matchmade and gm.host_id = me
     order by gm.created_at desc limit 1;
  end;
  return g;
end $$;
grant execute on function public.matchmake_pixel_rush() to authenticated;

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

-- ── 3. Retire enqueue_or_match / leave_queue ─────────────────────────────────
-- enqueue_or_match returns SQL NULL while the caller is queued, which
-- PostgREST serializes as an all-null JSON object rather than bare `null` —
-- this is the exact bug that caused Pixel Rush's "/game/null" crash. The
-- client was moved to matchmake_pixel_rush (see 0012), but the old function
-- was left callable with the bug still live. Dropping it entirely rather than
-- just leaving it unused, since it's still reachable by any client.
drop function if exists public.enqueue_or_match(text);
drop function if exists public.leave_queue(text);
