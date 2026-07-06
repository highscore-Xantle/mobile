// Supabase Edge Function: google-verify
//
// Victor's flow: Google is used ONLY to verify the user's email. Supabase's
// Google provider is NOT enabled. The app performs a native Google sign-in and
// POSTs the resulting Google ID token here. We:
//   1. verify the ID token against Google's public keys (signature, issuer,
//      audience = one of our OAuth client IDs, email_verified === true);
//   2. provision a normal Supabase user for that verified email (email_confirm
//      true so no confirmation email is needed) — created once, reused after;
//   3. mint a one-time token the app exchanges for a session via verifyOtp.
//
// The service-role key is auto-injected by Supabase (SUPABASE_SERVICE_ROLE_KEY)
// and never leaves this function.
//
// Deploy:  supabase functions deploy google-verify
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// Accepted audiences — our Web / iOS / Android OAuth client IDs. Overridable
// via a GOOGLE_CLIENT_IDS secret (comma-separated) without redeploying code.
const ALLOWED_AUD = (
  Deno.env.get('GOOGLE_CLIENT_IDS') ??
  [
    '320434998275-btjc4h4rn75014pa76jdtq770i9g66ng.apps.googleusercontent.com',
    '320434998275-d5b3u4ofb1bk0p70bl0b0oju722qcvts.apps.googleusercontent.com',
    '320434998275-3gkea2oceg3fi1vf5qki97t2q6najekv.apps.googleusercontent.com',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let idToken: string | undefined;
  try {
    ({ idToken } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!idToken) return json({ error: 'Missing idToken' }, 400);

  // 1. Verify the Google ID token.
  let payload: {
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
    sub?: string;
  };
  try {
    const res = await jwtVerify(idToken, JWKS, {
      issuer: GOOGLE_ISS,
      audience: ALLOWED_AUD,
    });
    payload = res.payload as typeof payload;
  } catch (e) {
    return json({ error: 'Invalid Google token', detail: String(e) }, 401);
  }

  const email = payload.email?.toLowerCase();
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!email || !emailVerified) {
    return json({ error: 'Email missing or not verified by Google' }, 401);
  }

  // 2. Provision the Supabase user (service role — auto-injected env).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true, // Google already verified it — skip Supabase confirmation.
    user_metadata: {
      full_name: payload.name ?? null,
      avatar_url: payload.picture ?? null,
      provider: 'google',
    },
  });
  // Returning users trip a "already registered" error — that's expected, ignore it.
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    return json({ error: 'Could not create user', detail: createErr.message }, 500);
  }

  // 3. Mint a one-time token the app exchanges for a session (no email sent).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return json({ error: 'Could not create session token', detail: linkErr?.message ?? null }, 500);
  }

  return json({ token_hash: link.properties.hashed_token, email });
});
