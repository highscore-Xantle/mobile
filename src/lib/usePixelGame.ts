import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type GameStatus = 'lobby' | 'active' | 'finished';

export type Game = {
  id: string;
  host_id: string;
  kind: string;
  game_type: string;
  max_players: number;
  status: GameStatus;
  invite_code: string;
  current_round: number;
  rounds_total: number;
  winner_player: string | null;
  winner_is_bot: boolean;
  started_at: string | null;
  finished_at: string | null;
};

export type GamePlayer = {
  id: string;
  game_id: string;
  user_id: string | null;
  guest_name: string | null;
  is_host: boolean;
  is_bot: boolean;
  score: number;
  trophies: number;
  joined_at: string;
  profile: { username: string | null } | null;
};

export type GameRound = {
  game_id: string;
  round_no: number;
  image_url: string | null;
  status: 'awaiting_image' | 'racing' | 'done';
  started_at: string | null;
  winner_player: string | null;
  winner_is_bot: boolean;
  winner_time_ms: number | null;
};

export function playerLabel(p: GamePlayer): string {
  return p.guest_name || p.profile?.username || 'Player';
}

/** Progressive grid: 3×3 easy → 4×4 medium → 5×5 hard. Matches web exactly. */
export function gridForRound(round: number): number {
  if (round <= 4) return 3;
  if (round <= 7) return 4;
  return 5;
}

/** Deterministic seed from gameId + roundNo — same result on every client. */
export function seedFor(gameId: string, round: number): number {
  let h = 0;
  const s = `${gameId}:${round}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export const DEFAULT_PUZZLE_IMAGE = 'https://picsum.photos/seed/xantle-puzzle/600/600';

/** Subscribe to a game, its players, and current round by invite code. */
export function useGame(code: string | undefined) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [round, setRound] = useState<GameRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gameIdRef = useRef<string | null>(null);

  const fetchPlayers = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from('game_players')
      .select('*, profile:user_id(username)')
      .eq('game_id', gameId)
      .order('joined_at', { ascending: true });
    setPlayers((data ?? []) as GamePlayer[]);
  }, []);

  const fetchRound = useCallback(async (gameId: string, roundNo: number) => {
    if (roundNo === 0) { setRound(null); return; }
    const { data } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('game_id', gameId)
      .eq('round_no', roundNo)
      .maybeSingle();
    setRound((data as GameRound | null) ?? null);
  }, []);

  useEffect(() => {
    if (!code) return;
    let mounted = true;

    async function init() {
      const { data, error: err } = await supabase
        .from('games')
        .select('*')
        .eq('invite_code', code!.toUpperCase())
        .maybeSingle();

      if (!mounted) return;
      if (err || !data) {
        setError(err?.message ?? 'Game not found.');
        setLoading(false);
        return;
      }

      const g = data as Game;
      gameIdRef.current = g.id;
      setGame(g);

      await Promise.all([fetchPlayers(g.id), fetchRound(g.id, g.current_round)]);
      if (mounted) setLoading(false);
    }

    init();

    const ch = supabase
      .channel(`game-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (payload) => {
        if (!mounted) return;
        const g = payload.new as Game;
        // The subscription isn't server-side filtered, so ignore other games' changes.
        if (g.invite_code !== code!.toUpperCase()) return;
        gameIdRef.current = g.id;
        setGame(g);
        fetchRound(g.id, g.current_round);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players' }, () => {
        if (!mounted || !gameIdRef.current) return;
        fetchPlayers(gameIdRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds' }, (payload) => {
        if (!mounted) return;
        const r = payload.new as GameRound;
        if (r.game_id !== gameIdRef.current) return; // only this game's rounds
        setRound(r);
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(ch);
    };
  }, [code, fetchPlayers, fetchRound]);

  return { game, players, round, loading, error };
}

export async function createPixelRushGame(max: number = 2): Promise<Game> {
  const { data, error } = await supabase
    .rpc('create_game', { p_kind: max > 2 ? 'group' : '1v1', p_max: max, p_type: 'pixel_rush' })
    .select()
    .single();
  if (error) throw error;
  return data as Game;
}

export async function joinGame(code: string): Promise<void> {
  const { error } = await supabase
    .rpc('join_game', { p_code: code.toUpperCase(), p_guest_name: null });
  if (error) throw error;
}

export async function startGame(gameId: string): Promise<void> {
  const { error } = await supabase.rpc('start_game', { p_game_id: gameId });
  if (error) throw error;
}

export async function setRoundImage(gameId: string, round: number, imageUrl: string): Promise<void> {
  const { error } = await supabase.rpc('set_round_image', {
    p_game_id: gameId,
    p_round: round,
    p_image: imageUrl,
  });
  if (error) throw error;
}

export async function submitSolve(gameId: string, round: number, timeMs: number): Promise<void> {
  const { error } = await supabase.rpc('submit_solve', {
    p_game_id: gameId,
    p_round: round,
    p_time_ms: timeMs,
  });
  if (error) throw error;
}

export async function autoAdvanceRound(gameId: string, round: number): Promise<void> {
  const { error } = await supabase.rpc('auto_advance_round', {
    p_game_id: gameId,
    p_round: round,
  });
  if (error) throw error;
}

export async function requestRematch(gameId: string): Promise<void> {
  const { error } = await supabase.rpc('request_rematch', { p_game_id: gameId });
  if (error) throw error;
}

export async function leaveGame(gameId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_game', { p_game_id: gameId });
  if (error) throw error;
}

/**
 * Pairs with another open-matchmaking player if one's waiting; otherwise
 * queues the caller. Idempotent — safe (and expected) to call repeatedly
 * while waiting, since two players who queue moments apart won't discover
 * each other until one of them polls again.
 */
export async function enqueueOrMatch(type: string = 'pixel_rush'): Promise<Game | null> {
  const { data, error } = await supabase
    .rpc('enqueue_or_match', { p_type: type })
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as Game) ?? null;
}

export async function leaveQueue(type: string = 'pixel_rush'): Promise<void> {
  const { error } = await supabase.rpc('leave_queue', { p_type: type });
  if (error) throw error;
}

export async function createBotMatch(type: string = 'pixel_rush'): Promise<Game> {
  const { data, error } = await supabase
    .rpc('create_bot_match', { p_type: type })
    .select()
    .single();
  if (error) throw error;
  return data as Game;
}

export async function submitBotSolve(gameId: string, round: number, timeMs: number): Promise<void> {
  const { error } = await supabase.rpc('submit_bot_solve', {
    p_game_id: gameId,
    p_round: round,
    p_time_ms: timeMs,
  });
  if (error) throw error;
}
