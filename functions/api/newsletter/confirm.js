/* GET /api/newsletter/confirm?t=<token>  -  the link in the confirm email. */
import { rpc, page, UUID } from './_lib.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const t = new URL(request.url).searchParams.get('t') || '';
  if (!UUID.test(t) || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    return page('That link did not work', '<p>It may be incomplete or out of date. You can sign up again from the home page.</p><a class="b" href="/">Back to RunThe.GG</a>', 400);
  }
  let ok = false;
  try { ok = await rpc(env, 'newsletter_confirm', { p_token: t }); } catch (e) { ok = false; }
  if (!ok) {
    return page('That link did not work', '<p>It may be out of date, or you unsubscribed after it was sent. You can sign up again from the home page.</p><a class="b" href="/">Back to RunThe.GG</a>', 400);
  }
  return page('You\'re in', '<p>We will email you when a new game or big update ships. Every email has a one-tap unsubscribe.</p><a class="b" href="/">Play a game</a>');
}
