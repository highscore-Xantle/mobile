-- Draughts "Play Online" matchmaking (rooms-based).
--   matchmake_draughts(): join a recent open draughts room that's waiting for a
--     second player, or create one and wait. Returns the room; status 'active'
--     means you were paired immediately, 'lobby' means you're waiting.
--   cancel_matchmaking(): drop your waiting room (used on the 10s bot-fallback
--     or when the player backs out).

create or replace function public.matchmake_draughts()
returns public.rooms language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; c text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  -- A recent draughts room in lobby, hosted by someone else, with one player.
  select rm.* into r
    from public.rooms rm
   where rm.game_kind = 'draughts'
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

  -- None open → create a room and wait for someone (or the bot fallback).
  loop
    c := upper(substring(md5(random()::text) for 5));
    exit when not exists (select 1 from public.rooms where code = c and status <> 'finished');
  end loop;
  insert into public.rooms (code, host_id, game_kind, state, is_group, max_players, status)
       values (c, me, 'draughts', '{}'::jsonb, false, 2, 'lobby')
    returning * into r;
  insert into public.room_players (room_id, user_id, is_host) values (r.id, me, true);
  return r;
end $$;
grant execute on function public.matchmake_draughts() to authenticated;

create or replace function public.cancel_matchmaking(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  delete from public.rooms where id = p_room and host_id = me and status = 'lobby';
end $$;
grant execute on function public.cancel_matchmaking(uuid) to authenticated;
