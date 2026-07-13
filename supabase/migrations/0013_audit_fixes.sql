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

insert into public.profile_location (user_id, city, region, country, latitude, longitude, address)
select id, city, region, country, latitude, longitude, address from public.profiles
on conflict (user_id) do nothing;

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

-- ── 2. Duplicate lobby rooms from a double-tap / client retry ───────────────
-- Neither matchmake_pixel_rush nor matchmake_number_duel checked whether the
-- caller already had an open lobby before creating a new one. A double-tap on
-- "Play Online" (or a retry after a dropped response) could leave the same
-- user hosting two lobby rows — a third real player matching into the
-- orphaned one would wait forever for a host who's actually already playing
-- elsewhere. Now idempotent: return the existing open lobby instead.
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
   where gm.game_type = 'pixel_rush' and gm.kind = '1v1' and gm.status = 'lobby' and gm.host_id = me
   order by gm.created_at desc limit 1;
  if g.id is not null then return g; end if;

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

  select rm.* into r
    from public.rooms rm
   where rm.game_kind = 'number-duel' and rm.status = 'lobby' and rm.host_id = me
   order by rm.created_at desc limit 1;
  if r.id is not null then return r; end if;

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

-- ── 3. Retire enqueue_or_match / leave_queue ─────────────────────────────────
-- enqueue_or_match returns SQL NULL while the caller is queued, which
-- PostgREST serializes as an all-null JSON object rather than bare `null` —
-- this is the exact bug that caused Pixel Rush's "/game/null" crash. The
-- client was moved to matchmake_pixel_rush (see 0012), but the old function
-- was left callable with the bug still live. Dropping it entirely rather than
-- just leaving it unused, since it's still reachable by any client.
drop function if exists public.enqueue_or_match(text);
drop function if exists public.leave_queue(text);
