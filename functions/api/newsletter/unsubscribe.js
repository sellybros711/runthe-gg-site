/* /api/newsletter/unsubscribe?t=<token>
 *
 * GET shows a page with one button, so a mail scanner that pre-fetches every
 * link in an email cannot unsubscribe somebody by looking at it.
 * POST unsubscribes. The newsletter carries this URL in a List-Unsubscribe
 * header with List-Unsubscribe-Post (RFC 8058), which is the one-click button
 * Gmail and Outlook show beside the sender: they POST here with no page at all.
 */
import { rpc, page, UUID, esc } from './_lib.js';

function tokenOf(request) { return new URL(request.url).searchParams.get('t') || ''; }
const bad = () => page('That link did not work', '<p>It may be incomplete. Reply to any newsletter and we will take you off the list by hand.</p><a class="b" href="/">Back to RunThe.GG</a>', 400);

export async function onRequestGet(context) {
  const t = tokenOf(context.request);
  if (!UUID.test(t)) return bad();
  return page('Unsubscribe?', `<p>You will stop getting RunThe.GG release emails. Your account and games are not affected.</p>
<form method="post" action="/api/newsletter/unsubscribe?t=${esc(t)}"><button class="b" type="submit">Unsubscribe</button><a class="b" style="background:transparent;color:#f1f5fb;border:1px solid rgba(255,255,255,.2);margin-left:8px" href="/">Keep me on</a></form>`);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const t = tokenOf(request);
  if (!UUID.test(t) || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return bad();
  let ok = false;
  try { ok = await rpc(env, 'newsletter_unsubscribe', { p_token: t }); } catch (e) { ok = false; }
  if (!ok) return bad();
  return page('You\'re unsubscribed', '<p>No more release emails. If you change your mind, tick the newsletter box in any game\'s profile or on the home page.</p><a class="b" href="/">Back to RunThe.GG</a>');
}
