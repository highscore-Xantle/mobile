-- Xantle — Pixel Rush match-integrity RPCs (forfeit, concede, guards).
--
-- forfeit_game: only the host can call set_round_image, so if the host's app
-- closed mid-match, every other player was stuck on "awaiting_image" forever.
-- This lets the remaining player in a 1v1 claim the win once the app has
-- detected (via presence) that the other side is gone.
--
-- HARDENED vs the first draft of this migration (which was never applied):
-- the original only checked "caller is a player", which let ANY participant
-- steal a win — the losing player mid-match, any member of a group game, or
-- a player in a self-created bot match (an infinite trophy farm). Now:
--   * game must be a live ('active') 1v1
--   * the opponent must be a real human (bot matches can't be forfeited —
--     the bot never disconnects, and farming wins off it was the exploit)
-- The server can't verify presence itself, so a determined cheat with a
-- second account can still fake a disconnect win — but there is no longer a
-- single-account exploit, and every path the CLIENT calls is legitimate.
create or replace function public.forfeit_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  if me is null then raise exception 'auth required'; end if;
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status = 'finished' then return; end if;
  if g.status <> 'active' then raise exception 'game not active'; end if;
  if g.max_players <> 2 then raise exception 'forfeit is 1v1 only'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  if not exists (
    select 1 from public.game_players
     where game_id = p_game_id and user_id is not null and user_id <> me
       and coalesce(is_bot, false) = false
  ) then
    raise exception 'no human opponent to forfeit against';
  end if;
  update public.games
     set status = 'finished', finished_at = now(), winner_player = me, winner_is_bot = false
   where id = g.id;
  update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = me;
end $$;
grant execute on function public.forfeit_game(uuid) to authenticated;

-- concede_game: the mirror of forfeit_game, for the player who LEAVES. The
-- old flow (leave_game alone) left the game 'active' with one player: the
-- opponent got no win and no signal, and — since the quitter usually stays
-- online in the app — the presence-based auto-forfeit never fired either.
-- Quitting politely was strictly better for the quitter than killing the
-- app. Now the Leave button concedes: opponent (human or bot) gets the win.
create or replace function public.concede_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; opp public.game_players;
begin
  if me is null then raise exception 'auth required'; end if;
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status = 'finished' then return; end if;
  if g.status <> 'active' then raise exception 'game not active'; end if;
  if g.max_players <> 2 then raise exception 'concede is 1v1 only'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  select * into opp from public.game_players
   where game_id = p_game_id and (user_id is null or user_id <> me)
   order by joined_at asc limit 1;
  if opp.id is null then
    -- Nobody left to concede to — just close the game with no winner.
    update public.games set status = 'finished', finished_at = now() where id = g.id;
    return;
  end if;
  update public.games
     set status = 'finished', finished_at = now(),
         winner_player = opp.user_id,
         winner_is_bot = coalesce(opp.is_bot, false)
   where id = g.id;
  if opp.user_id is not null then
    update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = opp.user_id;
  end if;
end $$;
grant execute on function public.concede_game(uuid) to authenticated;

-- start_game: previously had no status guard — the host could call it on an
-- active or even FINISHED game (direct RPC), rewinding it to round 1 and
-- letting auto_advance_round crown (and trophy) the champion again. Now a
-- no-op unless the game is still in the lobby.
create or replace function public.start_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only host can start'; end if;
  if g.status <> 'lobby' then return; end if;  -- double-tap / stray call: no-op
  update public.games set status = 'active', current_round = 1, started_at = now() where id = g.id;
  insert into public.game_rounds (game_id, round_no, status) values (g.id, 1, 'awaiting_image')
  on conflict (game_id, round_no) do nothing;
end $$;
grant execute on function public.start_game(uuid) to authenticated;

-- auto_advance_round: previously callable by ANY authenticated user on ANY
-- active game (games are world-readable, so ids are discoverable), and with
-- no check that the round was actually decided — ten quick calls skipped a
-- whole match and crowned a champion mid-race. Now: caller must be a player,
-- and the round must genuinely be 'done' before the game moves on.
create or replace function public.auto_advance_round(p_game_id uuid, p_round int)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; champ public.game_players;
begin
  if me is null then raise exception 'auth required'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status <> 'active' or g.current_round <> p_round then return; end if;
  if not exists (
    select 1 from public.game_rounds
     where game_id = p_game_id and round_no = p_round and status = 'done'
  ) then return; end if;
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

-- Matches were 10 rounds ("rounds_total default 10") while the rules screen
-- promises "Best of 9" — and an even round count makes 5–5 ties possible,
-- which the tie-break silently awards to whoever joined first. 9 rounds
-- matches the copy and makes a decisive winner guaranteed in a clean match.
alter table public.games alter column rounds_total set default 9;
