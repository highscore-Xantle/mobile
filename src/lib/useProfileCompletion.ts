/**
 * useProfileCompletion — derives profile completeness from Supabase.
 *
 * Single source of truth for whether a user's profile is complete.
 * Consumed by:
 *   • ProfileCompletionBanner (home top-of-feed)
 *   • Settings "Complete your profile" row
 *
 * The three required fields are: username, avatar_url, country.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type RequiredField = 'username' | 'avatar_url' | 'country';

export interface ProfileCompletion {
  isComplete: boolean;
  missingFields: RequiredField[];
  completionPercent: number;   // 0, 33, 67, 100
  loading: boolean;
  /** Force a re-fetch (e.g. after saving a field). */
  refresh: () => void;
}

const REQUIRED: RequiredField[] = ['username', 'avatar_url', 'country'];

export function useProfileCompletion(userId: string | undefined): ProfileCompletion {
  const [loading, setLoading]       = useState(true);
  const [missing, setMissing]       = useState<RequiredField[]>(REQUIRED);
  // Guard against stale async results after unmount.
  const activeRef = useRef(true);

  const check = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setMissing(REQUIRED);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('username, avatar_url, country')
      .eq('id', userId)
      .single();

    if (!activeRef.current) return;

    if (!data) {
      setMissing(REQUIRED);
    } else {
      setMissing(REQUIRED.filter((f) => !data[f]));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    activeRef.current = true;
    check();
    return () => { activeRef.current = false; };
  }, [check]);

  const filled = REQUIRED.length - missing.length;

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
    completionPercent: Math.round((filled / REQUIRED.length) * 100),
    loading,
    refresh: check,
  };
}
