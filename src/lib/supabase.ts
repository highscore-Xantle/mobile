// Supabase client for Xantle. Auth session persists via AsyncStorage.
// Requires: npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail with a readable message instead of supabase-js's opaque "supabaseUrl is
  // required." In a release build this means the EAS env wasn't set — see the
  // `env` block in eas.json (these are EXPO_PUBLIC_* values, inlined at build time).
  throw new Error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Locally: copy .env.example to .env. In EAS builds: set them in eas.json -> build.<profile>.env.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // AsyncStorage's web shim touches `window` even during Expo Router's
    // Node-side render pass, which has no `window` and crashes the server.
    // On web, omit it — supabase-js falls back to its own SSR-safe storage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // Web reads the token from the URL hash after email confirmation; native doesn't use URLs
  },
});
