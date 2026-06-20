import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * useSession — reusable Supabase auth hook.
 *
 * Returns the current session and a loading flag. Subscribes to live
 * auth state changes so components automatically re-render on sign-in/out.
 *
 * Usage:
 *   const { session, loading } = useSession();
 *   if (loading) return <LoadingScreen />;
 *   if (!session) router.replace('/login');
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Get the initial session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Subscribe to auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
