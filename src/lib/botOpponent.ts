import { PREVIEW_MS } from '../components/PixelBoard';
import { supabase } from './supabase';
import { seedFor } from './usePixelGame';

const BOT_SEED_SALT = 0x5bd1e995;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lifetime win rate (trophies / matches), same aggregation as the profile stats card. */
export async function getRecentWinRate(userId: string): Promise<number> {
  const { data } = await supabase
    .from('game_players')
    .select('trophies')
    .eq('user_id', userId);
  if (!data || data.length === 0) return 0;
  const matches = data.length;
  const trophies = data.reduce((sum, r) => sum + (r.trophies ?? 0), 0);
  return Math.max(0, Math.min(1, trophies / matches));
}

// Solve time counted from when the puzzle actually scrambles for the human
// (started_at + PREVIEW_MS), NOT from started_at itself — the bot's overall
// setTimeout delay adds PREVIEW_MS back on below. Getting this wrong let the
// bot "solve" during the 5s preview, before the human's tiles had even
// shuffled — an unbeatable bot. Ranges are generous vs. a real solve (a 3x3
// "swap any two tiles" puzzle takes a human several look-tap-look cycles).
const GRID_SOLVE_RANGE_MS: Record<number, [number, number]> = {
  3: [9000, 16000],
  4: [15000, 26000],
  5: [24000, 40000],
};

/**
 * Deterministic per-round solve delay for the bot — seeded from the same
 * gameId+round the puzzle shuffle uses, so it's reproducible/verifiable rather
 * than opaque Math.random(). Skewed faster for players with a higher win
 * rate (a stronger bot), clamped so it's never instant or trivially slow.
 */
export function computeBotSolveDelayMs(
  gameId: string,
  round: number,
  grid: number,
  winRate: number,
): number {
  const [min, max] = GRID_SOLVE_RANGE_MS[grid] ?? GRID_SOLVE_RANGE_MS[5];
  const seed = (seedFor(gameId, round) ^ BOT_SEED_SALT) >>> 0;
  const t = mulberry32(seed)();
  // Higher win rate skews the roll toward the fast end of the range.
  const skewed = Math.pow(t, 1 + winRate * 2);
  return PREVIEW_MS + Math.round(min + skewed * (max - min));
}
