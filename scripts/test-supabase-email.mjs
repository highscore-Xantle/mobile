// Trigger a real Supabase OTP email (via your new custom SMTP) to confirm the
// whole pipeline works — no app needed.
// Run:  node scripts/test-supabase-email.mjs you@email.com
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const email = process.argv[2] || process.env.TEST_EMAIL;
if (!url || !anon) { console.error('✗ EXPO_PUBLIC_SUPABASE_URL / ANON_KEY missing in xantle/mobile/.env'); process.exit(1); }
if (!email) { console.error('✗ Usage: node scripts/test-supabase-email.mjs you@email.com'); process.exit(1); }

const supabase = createClient(url, anon, { auth: { persistSession: false } });
console.log(`Asking Supabase to send an OTP email to ${email} …`);
const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
if (error) {
  console.error('✗ Supabase rejected it:', error.message);
  console.error('  (If it mentions SMTP, recheck Authentication → SMTP Settings. If "rate limit", bump Auth → Rate Limits.)');
} else {
  console.log(`OK ✓ — Supabase accepted the request.`);
  console.log(`Check ${email}: you should get a 6-digit code from "Xantle <noreply@highzcore.tech>".`);
}
