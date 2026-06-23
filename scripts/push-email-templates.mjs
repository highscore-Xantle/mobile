// Pushes the branded Xantle OTP email template to Supabase (Confirm-signup +
// Magic-link) via the Management API — no dashboard editing.
//
// 1. Get a Supabase access token: https://supabase.com/dashboard/account/tokens  (Generate new token)
// 2. Run (PowerShell):
//      $env:SUPABASE_ACCESS_TOKEN="sbp_xxx"; node scripts/push-email-templates.mjs
// 3. (optional) revoke the token afterwards — it's account-level.
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ref = (supaUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref) { console.error('✗ Could not read project ref from EXPO_PUBLIC_SUPABASE_URL in .env'); process.exit(1); }
if (!token) { console.error('✗ Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)'); process.exit(1); }

const SUBJECT = 'Your Xantle sign-in code';

// Email-client-safe HTML (tables + inline styles). {{ .Token }} = the 6-digit OTP.
const HTML = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#101217;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#101217;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:460px;background-color:#1C222B;border-radius:20px;border:1px solid rgba(255,255,255,0.07);">
          <tr><td style="padding:42px 36px;text-align:center;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="font-size:42px;font-weight:800;letter-spacing:-1px;color:#F4F7FF;line-height:1;">X<span style="color:#56C5F5;">antle</span></div>
            <div style="height:4px;width:62px;background-color:#2E7EF0;border-radius:2px;margin:14px auto 0;"></div>
            <div style="color:#939BA7;font-size:15px;margin:30px 0 18px;">Enter this code to sign in</div>
            <table role="presentation" cellpadding="0" cellspacing="0" align="center">
              <tr><td style="background-color:#272D3A;border-radius:14px;padding:18px 26px;font-size:36px;font-weight:800;letter-spacing:12px;color:#F4F7FF;font-family:Menlo,Consolas,'Courier New',monospace;">{{ .Token }}</td></tr>
            </table>
            <div style="color:#939BA7;font-size:13px;line-height:20px;margin:26px 0 0;">This code expires in 1 hour.<br/>If you didn't request it, you can safely ignore this email.</div>
            <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:30px;padding-top:20px;color:#6C7689;font-size:12px;">Xantle · Games for every gathering</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const body = {
  mailer_subjects_confirmation: SUBJECT,
  mailer_templates_confirmation_content: HTML,
  mailer_subjects_magic_link: SUBJECT,
  mailer_templates_magic_link_content: HTML,
};

console.log(`Pushing OTP templates to project ${ref} …`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const txt = await res.text();
if (res.ok) {
  console.log('OK ✓ — Confirm-signup + Magic-link templates updated. Re-run the email test to see it.');
} else {
  console.error(`✗ ${res.status}: ${txt.slice(0, 400)}`);
  if (res.status === 401) console.error('  -> token invalid/expired. Generate a new one at supabase.com/dashboard/account/tokens');
}
