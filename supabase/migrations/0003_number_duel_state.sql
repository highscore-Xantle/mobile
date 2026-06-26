-- ── Number Duel State Machine Migration ───────────────────────────────────────
alter table public.rooms add column if not exists state jsonb not null default '{}'::jsonb;
drop function if exists public.create_room(text, boolean, int);

create or replace function public.create_room(p_game_kind text, p_state jsonb default '{}'::jsonb, p_is_group boolean default false, p_max int default 2)
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
  insert into public.rooms (code, host_id, game_kind, state, is_group, max_players)
       values (c, me, p_game_kind, p_state, p_is_group,
               case when p_is_group then greatest(3, least(50, p_max)) else 2 end)
    returning * into r;
  insert into public.room_players (room_id, user_id, is_host) values (r.id, me, true);
  return r;
end $$;
grant execute on function public.create_room(text, jsonb, boolean, int) to authenticated;

create or replace function public.update_room_state(p_room uuid, p_state jsonb)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  select * into r from public.rooms where id = p_room;
  if r.id is null then raise exception 'room not found'; end if;
  if r.host_id <> me then raise exception 'only host can update state'; end if;
  update public.rooms set state = p_state where id = r.id returning * into r;
  return r;
end $$;
grant execute on function public.update_room_state(uuid, jsonb) to authenticated;

create or replace function public.reset_room(p_room uuid, p_state jsonb)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms;
begin
  select * into r from public.rooms where id = p_room;
  if r.id is null then raise exception 'room not found'; end if;
  if r.host_id <> me then raise exception 'only host can reset'; end if;
  update public.rooms set status = 'lobby', state = p_state where id = r.id returning * into r;
  return r;
end $$;
grant execute on function public.reset_room(uuid, jsonb) to authenticated;
