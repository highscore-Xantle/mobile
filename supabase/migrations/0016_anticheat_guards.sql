-- Xantle — anti-cheat guards flagged by the second audit (2026-07-15).
--
-- HONEST SCOPE NOTE: Pixel Rush's solve is client-attested — the client
-- derives the scramble locally, so the server can never fully verify a
-- solve without a protocol redesign (server-issued scramble + submitted
-- move list, and even then the solution is computable). These guards raise
-- the bar from "script wins instantly, undetectably" to "cheating is rate-
-- limited to humanly-plausible times", which is the ceiling without that
-- redesign. Flagged for a future sprint.

-- ── 1. submit_solve: reject physically-impossible solves ─────────────────────
-- Previously accepted any call the instant a round turned 'racing' — a
-- scripted submit_solve(time_ms:1) won every round before the human's board
-- even unlocked. Rounds start with a 5s preview (racing begins at
-- started_at + 5s), so any "solve" landing before preview + a minimal human
-- solve window is provably fake. Also sanity-clamps the reported time.
create or replace function public.submit_solve(p_game_id uuid, p_round int, p_time_ms int)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.game_rounds;
  updated int;
  min_elapsed constant interval := interval '6.5 seconds'; -- 5s preview + 1.5s floor
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  select * into r from public.game_rounds
   where game_id = p_game_id and round_no = p_round;
  if r.game_id is null then raise exception 'round not found'; end if;
  if r.started_at is not null and now() - r.started_at < min_elapsed then
    raise exception 'solve rejected: too fast';
  end if;
  if p_time_ms is null or p_time_ms < 500 or p_time_ms > 600000 then
    raise exception 'solve rejected: invalid time';
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

-- ── 2. forfeit/concede trophies require a genuinely-played game ──────────────
-- Two colluding accounts could alternate quick concedes (or fake-disconnect
-- forfeits) for unbounded trophies without ever playing a round. The win is
-- still recorded either way (winner_player) — but the TROPHY now requires at
-- least one completed round in the game, so farming demands actually racing
-- rounds at the (now rate-limited) human pace. Innocent case unaffected in
-- practice: a real mid-match disconnect/ragequit virtually always happens
-- after round 1 has been decided.
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
  if exists (select 1 from public.game_rounds where game_id = g.id and status = 'done') then
    update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = me;
  end if;
end $$;
grant execute on function public.forfeit_game(uuid) to authenticated;

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
    update public.games set status = 'finished', finished_at = now() where id = g.id;
    return;
  end if;
  update public.games
     set status = 'finished', finished_at = now(),
         winner_player = opp.user_id,
         winner_is_bot = coalesce(opp.is_bot, false)
   where id = g.id;
  if opp.user_id is not null
     and exists (select 1 from public.game_rounds where game_id = g.id and status = 'done') then
    update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = opp.user_id;
  end if;
end $$;
grant execute on function public.concede_game(uuid) to authenticated;
