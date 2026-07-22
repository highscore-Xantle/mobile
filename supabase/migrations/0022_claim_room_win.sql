-- Xantle — fix Number Duel's split-brain disconnect forfeit.
--
-- The disconnect forfeit was purely client-local: each device set
-- winner='me' the moment it read the opponent as offline. When one player's
-- connection FLAPPED, both sides briefly read the other as offline and BOTH
-- declared themselves the winner ("You Win!" on both screens). There was no
-- single source of truth.
--
-- claim_room_win is that source of truth: the FIRST member to claim wins and
-- the room is recorded finished; any later claim just returns the already-
-- recorded winner. Both clients call it on a detected disconnect, so they
-- converge on exactly one winner. (The genuinely-disconnected player can't
-- reach the server until they reconnect, by which point the connected player
-- has already claimed — so the connected player wins, correctly.)
create or replace function public.claim_room_win(p_room uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.rooms; existing text;
begin
  if me is null then raise exception 'auth required'; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.id is null then raise exception 'room not found'; end if;
  if not exists (select 1 from public.room_players where room_id = p_room and user_id = me) then
    raise exception 'not a player in this room';
  end if;
  existing := r.state->>'winnerUserId';
  if existing is not null then return existing::uuid; end if;  -- already decided
  update public.rooms
     set state = jsonb_set(coalesce(state, '{}'::jsonb), '{winnerUserId}', to_jsonb(me::text)),
         status = 'finished'
   where id = p_room;
  return me;
end $$;
grant execute on function public.claim_room_win(uuid) to authenticated;
