// Native Google sign-in → Supabase session, via our own "google-verify" Edge
// Function (Supabase's Google provider is intentionally NOT used).
//
// Flow: GoogleSignin returns a Google ID token → we POST it to the Edge
// Function, which verifies the email with Google, provisions a Supabase user,
// and returns a one-time token_hash → we exchange that for a session with
// verifyOtp. Requires a dev build that includes the native module.
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

const EDGE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/google-verify`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    // The WEB client ID sets the ID token's audience — this is what the Edge
    // Function verifies against. iosClientId is required for the iOS flow.
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  configured = true;
}

/**
 * Runs the full native-Google → Supabase-session flow.
 * Returns the verifyOtp `data` ({ user, session }) on success.
 * Throws on failure; the caller should ignore `statusCodes.SIGN_IN_CANCELLED`.
 */
export async function signInWithGoogle() {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const result = await GoogleSignin.signIn();
  // google-signin v13+ returns { type, data: { idToken } }; be tolerant of shape.
  const idToken =
    (result as { data?: { idToken?: string | null } })?.data?.idToken ??
    (result as { idToken?: string | null })?.idToken ??
    null;
  if (!idToken) throw new Error('Google did not return an ID token.');

  if (!ANON_KEY) {
    // Without this check, a missing env var silently sent a literal
    // "Bearer undefined" header instead of failing with a readable error.
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY — cannot verify Google sign-in.');
  }

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Anon key satisfies the function gateway's default JWT check.
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ idToken }),
  });
  const body = (await res.json()) as { token_hash?: string; error?: string };
  if (!res.ok || !body.token_hash) {
    throw new Error(body.error ?? 'Google verification failed. Please try again.');
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: body.token_hash,
    type: 'magiclink',
  });
  if (error) throw error;
  return data;
}

export { statusCodes };
