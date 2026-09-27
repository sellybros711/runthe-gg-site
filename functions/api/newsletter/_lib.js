/* Shared by the three newsletter endpoints (subscribe, confirm, unsubscribe).
 *
 * Required Pages env vars (the same Supabase pair the Stripe webhook uses):
 *   SUPABASE_URL             https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE    service-role key (server-side only)
 *   RESEND_API_KEY           re_...  (resend.com, with runthe.gg verified)
 * Optional:
 *   NEWSLETTER_FROM          default "RunThe.GG <news@runthe.gg>"
 *   NEWSLETTER_REPLY_TO      default runthegames@outlook.com
 */
import { siteBase } from '../stripe/_site.js';
export { siteBase };

export const FROM = (env) => env.NEWSLETTER_FROM || 'RunThe.GG <news@runthe.gg>';
export const REPLY_TO = (env) => env.NEWSLETTER_REPLY_TO || 'runthegames@outlook.com';

/* Call a SECURITY DEFINER function with the service role. Returns the parsed
   body, or throws with the status so the caller can answer honestly. */
export async function rpc(env, fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`rpc ${fn} ${r.status}: ${text.slice(0, 200)}`); e.status = r.status; throw e; }
  try { return JSON.parse(text); } catch (e) { return text; }
}

export async function sendMail(env, { to, subject, html, text, headers }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(env), reply_to: REPLY_TO(env), to: [to], subject, html, text, headers }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* A small branded page for the answers a link lands on. It matches the home
   page's dark palette and carries a way back to the games. */
export function page(title, body, status = 200) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} | RunThe.GG</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060a13;color:#f1f5fb;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:24px}
.c{max-width:440px;width:100%;background:#0e1626;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:30px 28px;text-align:center}
h1{font-size:24px;margin:0 0 10px}p{color:#c3cedd;line-height:1.6;margin:0 0 18px}
a.b,button.b{display:inline-block;border:0;cursor:pointer;font:inherit;font-weight:800;text-decoration:none;color:#05220b;background:#6EE84E;border-radius:12px;padding:13px 20px}
button.g{background:transparent;color:#f1f5fb;border:1px solid rgba(255,255,255,.2);margin-left:8px}
.m{font-size:13px;color:#8e9bb1;margin-top:16px}</style></head>
<body><div class="c"><h1>${esc(title)}</h1>${body}</div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
