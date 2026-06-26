// Apply a SQL migration to the Xantle Supabase DB via the Management API query
// endpoint (runs as `postgres`, so DDL + SECURITY DEFINER funcs work). No DB
// password needed — just an account access token.
//
// Run (PowerShell):
//   $env:SUPABASE_ACCESS_TOKEN="sbp_xxx"; node scripts/migrate.mjs supabase/migrations/0002_settings.sql
//
// Get a token at https://supabase.com/dashboard/account/tokens (revoke after if you like).
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ref = (supaUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];

if (!ref) { console.error('✗ Could not read project ref from EXPO_PUBLIC_SUPABASE_URL in .env'); process.exit(1); }
if (!token) { console.error('✗ Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)'); process.exit(1); }
if (!file) { console.error('✗ Usage: node scripts/migrate.mjs <path-to-.sql>'); process.exit(1); }

const sqlPath = resolve(process.cwd(), file);
if (!existsSync(sqlPath)) { console.error(`✗ File not found: ${sqlPath}`); process.exit(1); }
const query = readFileSync(sqlPath, 'utf8');

console.log(`Applying ${file} to project ${ref} …`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const txt = await res.text();
if (res.ok) {
  console.log('OK ✓ — migration applied.');
  if (txt && txt !== '[]' && txt !== '{}') console.log('Result:', txt.slice(0, 500));
} else {
  console.error(`✗ ${res.status}: ${txt.slice(0, 600)}`);
  if (res.status === 401) console.error('  -> token invalid/expired. New one: supabase.com/dashboard/account/tokens');
  process.exit(1);
}
