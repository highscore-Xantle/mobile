import { supabase } from './supabase';

export interface LiveMatch {
  /** Matches a GAMES[].id in the Games tab catalogue ('number-duel' | 'pixel-rush'). */
  gameKind: string;
  /** Room code / invite code — what the viewer route needs to join the channel. */
  code: string;
  round: number;
  playerNames: string[];
}

/**
 * Fetches every currently-active, spectatable match across all games. Skips
 * bot practice matches — they have no realtime broadcast / second device, so
 * a spectator opening one just sees a frozen, empty viewer.
 */
export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  const [{ data: rooms }, { data: games }] = await Promise.all([
    supabase
      .from('rooms')
      .select(`code, game_kind, state, room_players ( display_name, is_bot, profiles ( username ) )`)
      .eq('status', 'active'),
    supabase
      .from('games')
      .select(`invite_code, current_round, game_players ( guest_name, is_bot, profile:user_id ( username ) )`)
      .eq('status', 'active')
      .eq('game_type', 'pixel_rush'),
  ]);

  const matches: LiveMatch[] = [];

  (rooms ?? []).forEach((r: any) => {
    if ((r.room_players ?? []).some((p: any) => p.is_bot)) return;
    const playerNames: string[] = (r.room_players ?? []).map((p: any) =>
      p.display_name || p.profiles?.username || 'Player'
    );
    matches.push({ gameKind: r.game_kind, code: r.code, round: r.state?.round ?? 1, playerNames });
  });

  (games ?? []).forEach((g: any) => {
    if ((g.game_players ?? []).some((p: any) => p.is_bot)) return;
    const playerNames: string[] = (g.game_players ?? []).map((p: any) =>
      p.guest_name || p.profile?.username || 'Player'
    );
    matches.push({ gameKind: 'pixel-rush', code: g.invite_code, round: g.current_round ?? 1, playerNames });
  });

  return matches;
}

/** The static viewer filename each game routes spectators to (via the same
 * /game/[id] trick every other cross-schema route in this app uses). */
export function viewerRouteFor(gameKind: string): string {
  return gameKind === 'pixel-rush' ? 'pixel-rush-viewer' : 'number-duel-viewer';
}
