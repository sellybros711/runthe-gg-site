/* POST /api/newsletter/subscribe  {email, source, website}
 *
 * The home page's email box, for visitors without an account. Signed-in
 * players never come here: their checkbox calls newsletter_set() directly.
 *
 * It ALWAYS answers {ok:true} for a well-formed address, whether a confirm
 * email went out, the address is already on the list, or it is cooling down,
 * so the form cannot be used to learn who is subscribed. `website` is a
 * honeypot: a field hidden from people that form-filling bots fill in.
 */
import { rpc, sendMail, siteBase, esc } from './_lib.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE || !env.RESEND_API_KEY) {
    return json({ ok: false, error: 'Signups are not open yet. Please try again soon.' }, 503);
  }
  let body = {};
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request.' }, 400); }
  if (body.website) return json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return json({ ok: false, error: 'That does not look like an email address.' }, 400);
  }
  const source = String(body.source || 'home').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);

  let token;
  try { token = await rpc(env, 'newsletter_guest_request', { p_email: email, p_source: source }); }
  catch (e) { return json({ ok: false, error: 'Something went wrong. Please try again.' }, 502); }
  if (!token) return json({ ok: true });

  const link = `${siteBase(env, request)}/api/newsletter/confirm?t=${encodeURIComponent(token)}`;
  try {
    await sendMail(env, {
      to: email,
      subject: 'Confirm your RunThe.GG release news',
      text: `Tap the link below to get an email when a new RunThe.GG game or big update ships.\n\n${link}\n\nIf you did not ask for this, ignore this email and nothing happens.`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<h2 style="margin:0 0 12px">One tap to confirm</h2>
<p style="line-height:1.6;color:#333">Confirm and we will email you when a new RunThe.GG game or big update ships. That is all we send.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#46bd30;color:#05220b;font-weight:800;text-decoration:none;padding:13px 20px;border-radius:10px;display:inline-block">Confirm my email</a></p>
<p style="font-size:13px;color:#666;line-height:1.5">If you did not ask for this, ignore this email and nothing happens.</p></div>`,
    });
  } catch (e) {
    return json({ ok: false, error: 'We could not send the confirm email. Please try again.' }, 502);
  }
  return json({ ok: true });
}
