import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { useSession } from './useSession';

type PresencePayload = { user_id: string; online_at: string };

interface PresenceContextValue {
  isOnline: (id: string | null | undefined) => boolean;
  onlineIds: Set<string>;
  /** False until the first presence sync arrives. Before that, onlineIds is
   *  empty — which reads as "everyone is offline". Anything that PENALIZES
   *  a user for being offline (e.g. auto-forfeit) must wait for this. */
  synced: boolean;
}

const PresenceContext = createContext<PresenceContextValue>({
  isOnline: () => false,
  onlineIds: new Set(),
  synced: false,
});

/**
 * Mount once near the app root (see src/app/_layout.tsx) so the presence
 * heartbeat runs for the whole authenticated session, not just while a
 * particular screen is focused — and so every screen shares one Realtime
 * channel/subscription instead of each opening its own.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!userId) { setOnlineIds(new Set()); setSynced(false); return; }
    setSynced(false);

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>();
        setOnlineIds(new Set(Object.keys(state)));
        setSynced(true);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
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

  const value = useMemo<PresenceContextValue>(() => ({
    isOnline: (id) => !!id && onlineIds.has(id),
    onlineIds,
    synced,
  }), [onlineIds, synced]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/** Read shared presence state — must be under <PresenceProvider> (mounted at the app root). */
export function usePresence() {
  return useContext(PresenceContext);
}
