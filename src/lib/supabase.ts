// Supabase client for Xantle. Auth session persists via AsyncStorage.
// Requires: npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced early so a missing .env is obvious in dev.
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY missing — copy .env.example to .env');
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    // AsyncStorage's web shim touches `window` even during Expo Router's
    // Node-side render pass, which has no `window` and crashes the server.
    // On web, omit it — supabase-js falls back to its own SSR-safe storage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN has no URL session; web auth handled separately
  },
});
