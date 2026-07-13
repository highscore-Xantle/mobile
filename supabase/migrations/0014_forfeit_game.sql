-- Xantle — Pixel Rush forfeit-on-disconnect. Only the host can call
-- set_round_image, so if the host's app closes mid-match, every other
-- player was stuck on "awaiting_image" forever with no way for the game to
-- ever finish. This lets any remaining player in a 1v1 claim the win once
-- the app has detected (via presence) that the other side is gone — the
-- client only calls this after its own grace period, this function is just
-- the "declare the match over" primitive.
create or replace function public.forfeit_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  if me is null then raise exception 'auth required'; end if;
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status = 'finished' then return; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  update public.games
     set status = 'finished', finished_at = now(), winner_player = me, winner_is_bot = false
   where id = g.id;
  update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = me;
end $$;
grant execute on function public.forfeit_game(uuid) to authenticated;
