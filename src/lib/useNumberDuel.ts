import { supabase } from './supabase';

export type Room = {
  id: string;
  code: string;
  host_id: string;
  game_kind: string;
  status: 'lobby' | 'active' | 'finished';
  is_group: boolean;
  max_players: number;
  state: Record<string, unknown>;
};

/**
 * Pairs with another open Number Duel matchmaking player if one's waiting;
 * otherwise queues the caller. Same idempotent/pollable contract as
 * usePixelGame's enqueueOrMatch — the client polls this repeatedly while
 * waiting, not just once.
 */
export async function enqueueOrMatchRoom(state: Record<string, unknown>): Promise<Room | null> {
  const { data, error } = await supabase
    .rpc('enqueue_or_match_room', { p_type: 'number-duel', p_state: state })
    .select()
    .maybeSingle();
  if (error) throw error;
  // See usePixelGame's enqueueOrMatch for why: a NULL row of a composite
  // return type serializes as an object with every field null, not bare null.
  return (data as any)?.id ? (data as Room) : null;
}

export async function createBotRoom(state: Record<string, unknown>): Promise<Room> {
  const { data, error } = await supabase
    .rpc('create_bot_room', { p_state: state })
    .select()
    .single();
  if (error) throw error;
  return data as Room;
}
