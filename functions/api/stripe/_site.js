/* WHERE TO SEND A BUYER BACK TO, which is not the same question as what this site is called.
 *
 * Every Stripe endpoint here builds a success_url and a cancel_url, and every one of them
 * built it as `env.SITE_URL || origin`. SITE_URL is https://runthe.gg, so that is the apex,
 * always, whatever host the buyer was actually on.
 *
 * BOTH www.runthe.gg AND runthe.gg SERVE THIS SITE AND NEITHER REDIRECTS TO THE OTHER. The
 * header in cfb/index.html already carries the note, because the same thing bit a link once:
 * a browser keeps a separate localStorage per hostname, so the Supabase session a player
 * signed in with on www does not exist on the apex. Sending a www buyer home to the apex
 * therefore returns them SIGNED OUT, one second after paying, on the one screen in the whole
 * site where that reads as "my money is gone". The page then polls premium_products() as
 * nobody, sees no entitlement, and prints the apologetic "the account can take a moment to
 * catch up" that is meant for a slow webhook. Nothing is wrong with the purchase. The row is
 * there. They are just looking at a different browser profile than the one that owns it.
 *
 * So the base is the ORIGIN THE REQUEST CAME IN ON whenever that origin is this site, and
 * SITE_URL otherwise. "This site" means the same registrable domain as SITE_URL: the apex
 * itself, or any subdomain of it. That keeps www on www and the apex on the apex, and it
 * covers a Pages preview deployment reached through a custom subdomain.
 *
 * IT IS STILL AN ALLOW-LIST AND NOT JUST `origin`. The origin is a header-derived value and
 * this one ends up in a redirect Stripe will follow, so an unrecognised host falls back to
 * SITE_URL rather than being trusted. A *.pages.dev preview is deliberately in that fallback:
 * it is not the configured site, and a redirect to it would be a redirect off-domain.
 *
 * Returns a base with no trailing slash, to be concatenated with a path that starts with one.
 */
export function siteBase(env, request) {
  const configured = String(env.SITE_URL || '').replace(/\/+$/, '');
  let here = null;
  try { here = new URL(request.url); } catch (e) { here = null; }
  if (!here) return configured;
  if (!configured) return here.origin;

  let base = null;
  try { base = new URL(configured); } catch (e) { return configured; }

  const a = here.hostname.toLowerCase();
  const b = base.hostname.toLowerCase();
  // the apex itself, or any subdomain of it (www.runthe.gg, and nothing that merely
  // ends in the same letters: "notrunthe.gg" fails the dot test on purpose)
  if (a === b || a.endsWith('.' + b)) return here.origin;
  return configured;
}
