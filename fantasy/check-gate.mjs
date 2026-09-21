/* The gate, in a real browser, in every account state.
 *
 *   npx wrangler pages dev . --port 8788 \
 *     --binding SUPABASE_URL=http://127.0.0.1:9099 SUPABASE_SERVICE_ROLE=svc-test-key
 *   node fantasy/check-gate.mjs
 *
 * It starts its own stand-in Supabase on 9099 and expects wrangler to already
 * be serving the site on 8788. Pass a base url as the first argument to point
 * it somewhere else.
 *
 *
 * WHY A BROWSER AND NOT curl
 * ---------------------------------------------------------------------------
 * curl proves the status line and the bytes, and this file's first section
 * does that too. What curl cannot see is the half that actually decides
 * whether the product leaks: the gate is JavaScript, and the question is what
 * a real browser has on screen and in its network log AFTER that JavaScript
 * has run. A 404 body that a script then fills with the product is still a
 * leak, and it is invisible to anything that does not execute the page.
 *
 *
 * THE ASSERTION THAT MATTERS MOST IS A NEGATIVE ONE
 * ---------------------------------------------------------------------------
 * A signed-out visitor must make NO request at all. Not a request that is
 * refused: none. The gate returns before it touches the network when there is
 * no session in localStorage, and that is deliberate, because a request is an
 * observable and "this URL does something when you visit it" is itself the
 * information being protected.
 *
 * That claim cannot be checked by looking at the screen, because the screen is
 * a correct 404 either way. So the browser's request log is read.
 *
 *
 * EVERY CHECK IS AGAINST A STATE THAT CAN ACTUALLY HAPPEN
 * ---------------------------------------------------------------------------
 * scripts/check-account-states.mjs already makes this argument for the two
 * games: a boot crash in ONE account state has shipped here before, past a
 * green suite, because no check opened that state. The states here are signed
 * out, signed in and not on the list, signed in and on it, and signed in with
 * a token the server will refuse.
 */
import { chromium } from 'playwright';
import http from 'node:http';

const BASE = process.argv[2] || 'http://127.0.0.1:8788';
const REF = 'jcrrxqfpdelrmvjuihnm';
const SKEY = `sb-${REF}-auth-token`;

const MEMBER = '00000000-0000-0000-0000-00000000000a';
const STRANGER = '00000000-0000-0000-0000-00000000000c';
const TOKENS = { 'tok-member': MEMBER, 'tok-stranger': STRANGER };
const ALLOWLIST = new Set([MEMBER]);

/* Words that must never reach a stranger. Deliberately includes the two tool
 * names and the words that would give the product away to somebody reading a
 * page source, rather than a single sentinel string: a check for one magic
 * word passes the day somebody renames it. */
const SECRETS = [
  'Run The Fantasy League', 'Start / Sit', 'Trade Analyzer',
  'sportsbook', 'projection', 'The Odds API', 'nflverse',
];

let fails = 0;
const ck = (label, cond, detail) => {
  console.log((cond ? ' ok   ' : ' FAIL ') + label + (cond || !detail ? '' : `\n         ${detail}`));
  if (!cond) fails++;
};

/* ------------------------------------------------------------------ *
 * The stand-in Supabase. Only the two endpoints app.js calls.
 * ------------------------------------------------------------------ */
function stub() {
  return new Promise((done) => {
    const s = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const send = (c, b) => {
        res.writeHead(c, { 'content-type': 'application/json' });
        res.end(JSON.stringify(b));
      };
      if (u.pathname === '/auth/v1/user') {
        const id = TOKENS[auth];
        return id ? send(200, { id }) : send(401, { message: 'invalid token' });
      }
      if (u.pathname === '/rest/v1/fantasy_access_allowlist') {
        /* The endpoint must present the SERVICE key here, never the visitor's
           own token. Asserted by refusing anything else, so a rewrite that
           forwarded the user token would fail this file rather than quietly
           working for the one account whose token it was. */
        if (auth !== 'svc-test-key') return send(401, { message: 'not the service role' });
        const m = (u.searchParams.get('user_id') || '').replace(/^eq\./, '');
        return send(200, ALLOWLIST.has(m) ? [{ user_id: m }] : []);
      }
      send(404, {});
    });
    s.listen(9099, '127.0.0.1', () => done(s));
  });
}

/* Open a page in one account state and report what the browser ended up with.
 * `token` null means signed out, which is the absence of the key rather than
 * an empty one: an empty string is a state supabase-js never writes. */
async function visit(browser, path, token) {
  const ctx = await browser.newContext();
  const reqs = [];
  await ctx.route('**/*', (route) => {
    reqs.push(route.request().url());
    route.continue();
  });
  if (token) {
    await ctx.addInitScript(([k, t]) => {
      try { localStorage.setItem(k, JSON.stringify({ access_token: t })); } catch (e) {}
    }, [SKEY, token]);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  /* The gate swaps the document in asynchronously, so networkidle is not by
     itself proof it has finished. A short settle rather than a fixed sleep:
     what is waited for is the title changing, with a ceiling so the signed-out
     case (where it never changes, correctly) does not hang the run. */
  await page.waitForFunction(() => document.title !== 'Page Not Found | RunThe.GG',
    null, { timeout: 2500 }).catch(() => {});
  const out = {
    status: res.status(),
    title: await page.title(),
    text: await page.evaluate(() => document.body.innerText),
    html: await page.content(),
    reqs,
    errors,
  };
  await ctx.close();
  return out;
}

const server = await stub();
const browser = await chromium.launch();

console.log('\nThe gate, in a browser, in four account states\n');

/* ------------------------------------------------------------------ *
 * 1. SIGNED OUT
 * ------------------------------------------------------------------ */
{
  const r = await visit(browser, '/fantasy', null);
  ck('signed out: the status is 404', r.status === 404, `got ${r.status}`);
  ck('signed out: the screen is the site 404', /mulligan/i.test(r.text));
  const leak = SECRETS.filter((w) => r.html.includes(w));
  ck('signed out: nothing about the product is in the DOM', leak.length === 0,
    `found: ${leak.join(', ')}`);

  /* THE NEGATIVE ONE, and its first draft was wrong in an instructive way.
     It asked for no request AT ALL and failed on a call to googletagmanager.

     That call is not the gate. It is the site's own 404 page, which carries
     Google Analytics like every other page here, and it arrives because this
     route serves the REAL 404 body rather than a copy. Suppressing it would
     make /fantasy the one path on this site whose 404 does not report, which
     is a tell pointing the wrong way: the whole design is that this route is
     indistinguishable from a missing one, and that has to include what it
     does as well as what it says.

     So the claim is scoped to what the GATE reaches for. Those three are the
     only endpoints that could confirm the route is real, and a signed-out
     visitor must touch none of them. */
  const gateReqs = r.reqs.filter((u) =>
    /\/api\/fantasy\//.test(u) || /supabase/i.test(u) || u.includes(REF));
  ck('signed out: the gate reaches for nothing', gateReqs.length === 0,
    `it requested: ${gateReqs.join(', ')}`);

  /* And the analytics call is asserted to still happen, rather than merely
     tolerated, because its absence would be the tell described above. */
  ck('signed out: the 404 still reports to analytics, exactly like any other 404',
    r.reqs.some((u) => u.includes('googletagmanager.com')));
  ck('signed out: nothing threw', r.errors.length === 0, r.errors.join(' | '));
}

/* ------------------------------------------------------------------ *
 * 2. SIGNED IN, NOT ON THE ALLOWLIST
 * ------------------------------------------------------------------ */
{
  const r = await visit(browser, '/fantasy', 'tok-stranger');
  ck('signed in, not allowlisted: the status is 404', r.status === 404, `got ${r.status}`);
  ck('signed in, not allowlisted: the screen is the site 404', /mulligan/i.test(r.text));
  const leak = SECRETS.filter((w) => r.html.includes(w));
  ck('signed in, not allowlisted: nothing about the product is in the DOM',
    leak.length === 0, `found: ${leak.join(', ')}`);

  /* IT MUST NOT SAY WHY. "You are not authorized" confirms the route exists,
     which is the one thing the brief asks this screen never to do. */
  ck('signed in, not allowlisted: no "not authorized" anywhere',
    !/not authori[sz]ed|access denied|forbidden|allowlist/i.test(r.text));
  ck('signed in, not allowlisted: nothing threw', r.errors.length === 0, r.errors.join(' | '));
}

/* ------------------------------------------------------------------ *
 * 3. SIGNED IN AND ON THE ALLOWLIST
 * ------------------------------------------------------------------ */
{
  const r = await visit(browser, '/fantasy', 'tok-member');
  ck('member: the hub renders', /Run The Fantasy League/.test(r.html));
  ck('member: the 404 body is gone, not merely covered',
    !/mulligan/i.test(r.text), r.text.slice(0, 120));
  ck('member: both tools are named', /Start \/ Sit/.test(r.html) && /Trade Analyzer/.test(r.html));

  /* THE STATUS IS STILL 404 AND THAT IS CORRECT. The route answers 404 to
     everybody; what differs is what the gate then does with the page. Worth
     asserting, because "make it 200 for members" is an obvious looking change
     that would make the route detectable by status alone. */
  ck('member: the status is STILL 404', r.status === 404, `got ${r.status}`);
  ck('member: nothing threw', r.errors.length === 0, r.errors.join(' | '));

  /* An empty pipeline must SAY it is empty. A tool showing no data reads as a
     tool whose data is fine, because nothing on it looks wrong. */
  ck('member: the hub says the pipeline has not run yet',
    /has not run yet/i.test(r.text), r.text.slice(0, 200));
}

/* ------------------------------------------------------------------ *
 * 4. A SUB-ROUTE, because the catch-all has to cover more than /fantasy
 * ------------------------------------------------------------------ */
{
  const r = await visit(browser, '/fantasy/start-sit', 'tok-member');
  ck('member: /fantasy/start-sit renders its own view', /Start \/ Sit/.test(r.html));
  const s = await visit(browser, '/fantasy/start-sit', null);
  ck('signed out: /fantasy/start-sit is the 404 too', /mulligan/i.test(s.text));
  const leak = SECRETS.filter((w) => s.html.includes(w));
  ck('signed out: the sub-route leaks nothing either', leak.length === 0,
    `found: ${leak.join(', ')}`);
}

/* ------------------------------------------------------------------ *
 * 5. A STALE TOKEN, which is what a member with a tab open for an hour has
 * ------------------------------------------------------------------ */
{
  const r = await visit(browser, '/fantasy', 'tok-expired-or-rubbish');
  ck('a token the server refuses ends at the 404, never a broken page',
    /mulligan/i.test(r.text));
  ck('and it does not throw on the way', r.errors.length === 0, r.errors.join(' | '));
}

/* ------------------------------------------------------------------ *
 * 6. THE FILES THEMSELVES ARE NOT FETCHABLE
 * ------------------------------------------------------------------ */
{
  for (const p of ['/fantasy/app/hub.js', '/fantasy/app/start-sit.js', '/fantasy/app/trade.js']) {
    const res = await fetch(BASE + p);
    const body = await res.text();
    ck(`${p} is intercepted, not served`,
      res.status === 404 && !body.includes('export function render'),
      `status ${res.status}, ${body.length} bytes`);
  }
}

/* ------------------------------------------------------------------ *
 * 7. THE REST OF THE SITE IS UNTOUCHED
 * ------------------------------------------------------------------ */
{
  const home = await fetch(BASE + '/');
  ck('the homepage still answers 200', home.status === 200, `got ${home.status}`);
  const four = await fetch(BASE + '/nosuchpath');
  const fourBody = await four.text();
  ck('an ordinary missing path still 404s', four.status === 404, `got ${four.status}`);
  ck('and carries no gate script', !fourBody.includes('/api/fantasy/app'));
}

await browser.close();
server.close();

console.log('');
if (fails) {
  console.error(`${fails} check(s) failed.`);
  process.exit(1);
}
console.log('The gate holds: 404 for everybody, the product only for the allowlist.');
