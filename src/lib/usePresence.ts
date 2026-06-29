import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

type PresencePayload = { user_id: string; online_at: string };

/**
 * Tracks the current user as online in a shared Supabase Realtime presence
 * channel and exposes a lookup for any user's online state.
 *
 * Call once near the root of the authenticated app (e.g. home screen) so
 * the presence heartbeat runs even when the user isn't on the profile page.
 * App backgrounding automatically untrack/retracks via AppState.
 */
export function usePresence(userId: string | null) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    // Untrack when app goes to background so others see accurate status.
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        channel
          .track({ user_id: userId, online_at: new Date().toISOString() })
          .catch(console.warn);
      } else {
        channel.untrack().catch(console.warn);
      }
    });

    return () => {
      appStateSub.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    /** Returns true if the given user_id is currently online. */
    isOnline: (id: string) => onlineIds.has(id),
    onlineIds,
  };
}
