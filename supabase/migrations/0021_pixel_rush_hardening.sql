-- Xantle — Pixel Rush hardening from the full game audit (2026-07-22).

-- ── 1. start_game requires ≥2 players (solo trophy farm) ─────────────────────
-- start_game only checked host + lobby, so a host could create_game() solo,
-- start_game directly, auto-drive their own rounds, and be crowned champion
-- for a free trophy every ~60s with no opponent. Bot matches don't use
-- start_game (create_bot_match sets 'active' itself), so this doesn't affect
-- them.
create or replace function public.start_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; cnt int;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only host can start'; end if;
  if g.status <> 'lobby' then return; end if;  -- double-tap / stray call: no-op
  select count(*) into cnt from public.game_players where game_id = g.id;
  if cnt < 2 then raise exception 'need at least 2 players'; end if;
  update public.games set status = 'active', current_round = 1, started_at = now() where id = g.id;
  insert into public.game_rounds (game_id, round_no, status) values (g.id, 1, 'awaiting_image')
  on conflict (game_id, round_no) do nothing;
end $$;
grant execute on function public.start_game(uuid) to authenticated;

-- ── 2. set_round_image: ANY seated player, active-only, no re-arm ─────────────
-- Was host-only, so a group match whose host disconnected sat on
-- "Setting up round…" forever (nobody else could post the image). The image
-- is deterministic (client seeds it by game id + round), so letting any
-- member post it is safe and every client picks the same one. Also:
--   * require the game to be 'active' (no arbitrary round rows / no setting on
--     a finished game),
--   * only flip awaiting_image → racing (the WHERE on the conflict update),
--     so a second client (or a malicious re-call) can't reset started_at and
--     re-arm the anti-cheat clock on an already-racing round.
create or replace function public.set_round_image(p_game_id uuid, p_round int, p_image text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status <> 'active' then raise exception 'game not active'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  if p_round <> g.current_round then raise exception 'not the current round'; end if;
  insert into public.game_rounds (game_id, round_no, image_url, status, started_at)
       values (p_game_id, p_round, p_image, 'racing', now())
  on conflict (game_id, round_no) do update
       set image_url = excluded.image_url, status = 'racing', started_at = now()
     where public.game_rounds.status = 'awaiting_image';  -- don't re-arm a live round
end $$;
grant execute on function public.set_round_image(uuid, int, text) to authenticated;

-- ── 3. expire_round: a round nobody solves must eventually end ────────────────
-- Rounds only left 'racing' on a solve, so if neither player solves the game
-- hung 'active' forever. Any member can expire a genuinely-stale racing round
-- (older than the client's 90s timeout, re-checked here) to a no-winner
-- 'done'; the normal auto_advance_round then moves the match along.
create or replace function public.expire_round(p_game_id uuid, p_round int)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  update public.game_rounds
     set status = 'done'
   where game_id = p_game_id and round_no = p_round and status = 'racing'
     and started_at is not null and started_at < now() - interval '90 seconds';
end $$;
grant execute on function public.expire_round(uuid, int) to authenticated;
