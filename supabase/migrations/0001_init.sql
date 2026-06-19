-- Xantle — schema v1: profiles, rooms, room_players, subscriptions.
-- Multiplayer pattern adapted from love-meet: all writes go through SECURITY
-- DEFINER RPCs; tables are read-only to clients via RLS. Apply in the Supabase
-- SQL editor (or `supabase db push`).

-- ── profiles (mirrors auth.users; username captured at onboarding) ──────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── subscriptions (premium $4.99/mo unlocks group play) ─────────────────────
create table if not exists public.subscriptions (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  status      text not null default 'inactive',   -- active | inactive | expired
  plan        text,
  expires_at  timestamptz,
  updated_at  timestamptz not null default now()
);

create or replace function public.has_premium(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

-- ── rooms + players ─────────────────────────────────────────────────────────
do $$ begin create type public.room_status as enum ('lobby','active','finished'); exception when duplicate_object then null; end $$;

create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  host_id      uuid not null references public.profiles(id) on delete cascade,
  game_kind    text not null,
  status       public.room_status not null default 'lobby',
  is_group     boolean not null default false,
  max_players  int not null default 2 check (max_players between 2 and 50),
  state        jsonb not null default '{}'::jsonb,     -- per-game state lives here
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index if not exists rooms_status_idx on public.rooms (status, created_at desc);

create table if not exists public.room_players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  display_name text,
  is_host      boolean not null default false,
  score        int not null default 0,
  joined_at    timestamptz not null default now(),
  unique (room_id, user_id)
);
create index if not exists room_players_room_idx on public.room_players (room_id);

-- ── RPCs ────────────────────────────────────────────────────────────────────
create or replace function public.create_room(p_game_kind text, p_is_group boolean default false, p_max int default 2)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; c text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_is_group and not public.has_premium(me) then
    raise exception 'Group play is a premium feature — subscribe to host groups.';
  end if;
  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.rooms where code = c and status <> 'finished');
  end loop;
  insert into public.rooms (code, host_id, game_kind, is_group, max_players)
       values (c, me, p_game_kind, p_is_group,
               case when p_is_group then greatest(3, least(50, p_max)) else 2 end)
    returning * into r;
  insert into public.room_players (room_id, user_id, is_host) values (r.id, me, true);
  return r;
end $$;
grant execute on function public.create_room(text, boolean, int) to authenticated;

create or replace function public.join_room(p_code text, p_display_name text default null)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; cnt int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.rooms where code = upper(p_code) and status = 'lobby';
  if r.id is null then raise exception 'room not found or already started'; end if;
  if exists (select 1 from public.room_players where room_id = r.id and user_id = me) then return r; end if;
  select count(*) into cnt from public.room_players where room_id = r.id;
  if cnt >= r.max_players then raise exception 'room is full'; end if;
  insert into public.room_players (room_id, user_id, display_name)
       values (r.id, me, nullif(trim(coalesce(p_display_name, '')), ''));
  return r;
end $$;
grant execute on function public.join_room(text, text) to authenticated;

create or replace function public.start_room(p_room uuid)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; cnt int;
begin
  select * into r from public.rooms where id = p_room;
  if r.id is null then raise exception 'room not found'; end if;
  if r.host_id <> me then raise exception 'only the host can start'; end if;
  if r.status <> 'lobby' then raise exception 'already started'; end if;
  select count(*) into cnt from public.room_players where room_id = r.id;
  if cnt < 2 then raise exception 'need at least 2 players'; end if;
  update public.rooms set status = 'active', started_at = now() where id = r.id returning * into r;
  return r;
end $$;
grant execute on function public.start_room(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.subscriptions enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_players  enable row level security;

drop policy if exists "profiles read"  on public.profiles;
create policy "profiles read"  on public.profiles for select to authenticated using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "subs self read" on public.subscriptions;
create policy "subs self read" on public.subscriptions for select to authenticated using (user_id = auth.uid());

drop policy if exists "rooms read" on public.rooms;
create policy "rooms read" on public.rooms for select to authenticated using (true);
drop policy if exists "rooms no write" on public.rooms;
create policy "rooms no write" on public.rooms for insert to authenticated with check (false);

drop policy if exists "players read" on public.room_players;
create policy "players read" on public.room_players for select to authenticated using (true);
drop policy if exists "players no write" on public.room_players;
create policy "players no write" on public.room_players for insert to authenticated with check (false);

-- ── realtime ────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_players') then
    alter publication supabase_realtime add table public.room_players;
  end if;
end $$;
