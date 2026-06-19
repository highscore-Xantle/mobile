// Supabase client for Xantle. Auth session persists via AsyncStorage.
// Requires: npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced early so a missing .env is obvious in dev.
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY missing — copy .env.example to .env');
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN has no URL session; web auth handled separately
  },
});
