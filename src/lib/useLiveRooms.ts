/**
 * useLiveRooms — shared live-room polling hook.
 *
 * Extracted from home.tsx and games.tsx to eliminate duplication.
 * All three consumers (Home, Games, Live tab) share a single
 * definition of the 10-second polling pattern.
 *
 * Returns a `Record<gameId, ActiveRoom[]>` map, a loading flag,
 * and an imperative `refresh()` for pull-to-refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { ActiveRoom } from '../components/Feed/LiveStrip';

export type { ActiveRoom };

export interface LiveRoomsState {
  liveRooms: Record<string, ActiveRoom[]>;
  loading: boolean;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 10_000;

export function useLiveRooms(): LiveRoomsState {
  const [liveRooms, setLiveRooms] = useState<Record<string, ActiveRoom[]>>({});
  const [loading, setLoading]     = useState(true);
  // Prevent concurrent fetches from racing on slow connections.
  const fetchingRef = useRef(false);

  const fetchRooms = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      // Filter out stale rooms (older than 2 hours) that were never properly finished
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('rooms')
        .select(`code, game_kind, state, room_players ( display_name, profiles ( username ) )`)
        .eq('status', 'active')
        .gte('created_at', twoHoursAgo);

      if (!data) return;

      const map: Record<string, ActiveRoom[]> = {};
      data.forEach((r: any) => {
        const names: string[] = (r.room_players ?? []).map((p: any) =>
          p.display_name || p.profiles?.username || 'Player',
        );
        const room: ActiveRoom = {
          code:        r.code,
          round:       r.state?.round ?? 1,
          playerNames: names,
        };
        if (!map[r.game_kind]) map[r.game_kind] = [];
        map[r.game_kind].push(room);
      });

      setLiveRooms(map);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  return { liveRooms, loading, refresh: fetchRooms };
}
