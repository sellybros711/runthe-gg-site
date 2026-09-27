/* Run The Diamond Pro, in a browser: the once-a-day limit and the offer.
 *
 *   node baseball/check-pro.mjs
 *
 * The six extra modes get one free start a day each, and Pro removes the limit.
 * Every way that breaks is silent: a gate that never closes sells nothing and
 * throws nothing, and a gate that closes on Classic takes the game away from
 * everybody while every screen still renders. So this plays the modes through
 * the real tiles and reads what the page does.
 *
 * THE ACCOUNT IS A STAND-IN. auth.js is replaced at the route with a module that
 * answers what each case says, so a signed in account, a Pro account and a server
 * meter can be staged without a live project. The CDN script for supabase-js is
 * refused, and so is the checkout: Stripe is live, and a request that got out
 * would open a real payment page. The checkout call is ANSWERED rather than let
 * through, and what it was sent is read back.
 *
 * WHAT THE SERVER HALF DOES is proved in SQL, not here:
 *   supabase/test/baseball_pro_test.sql
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const { createRequire } = await import('node:module');
const require_ = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require_('playwright')); }
catch (_) { try { ({ chromium } = require_('/opt/node22/lib/node_modules/playwright')); } catch (e) { chromium = null; } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((f) => existsSync(f));

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = 8907;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const PAGE = process.env.RTD_PAGE ? path.resolve(process.env.RTD_PAGE) : null;
const server = await new Promise((res) => {
  const s = createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    let file = path.join(ROOT, p.replace(/^\/+/, ''));
    /* A mutated copy of the page, for proving a claim bites. */
    if (PAGE && p === '/baseball/index.html') file = PAGE;
    if (!existsSync(file) || statSync(file).isDirectory()) { rep.writeHead(404).end('no'); return; }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

/* The Eastern day, the way the page works it out. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const FAKE_AUTH = `
window.RTD_AUTH = (function () {
  const cfg = window.__FAKE || {};
  const listeners = [];
  const st = () => ({ ready: true, waiting: false, signedIn: !!cfg.signedIn,
    userId: cfg.signedIn ? 'user-1' : null, email: cfg.signedIn ? 'tester@example.com' : null,
    name: cfg.signedIn ? 'tester' : null });
  window.__spent = [];
  return {
    API_VERSION: 1,
    boot() { setTimeout(() => listeners.forEach((f) => f(st())), 30); return true; },
    state: st,
    onChange(f) { listeners.push(f); return () => {}; },
    token: () => (cfg.signedIn ? 'tok-1' : null),
    signIn: async () => ({ error: null }), signUp: async () => ({ error: null }),
    signInGoogle() {}, signOut: async () => {}, available: async () => true,
    setName: async () => ({ error: null }), claim: async () => false, deleteAccount: async () => ({}),
    premiumProducts: async () => (cfg.signedIn ? (cfg.pro ? ['rtd_premium'] : []) : []),
    modeState: async () => (cfg.signedIn ? (cfg.meter || null) : null),
    modeSpend: async (m) => { window.__spent.push(m); return { ok: true, pro: !!cfg.pro, mode: m }; },
  };
})();`;

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const errors = [];

async function open(fake, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1280, height: opts.h || 900 } });
  await ctx.addInitScript(([f, plays]) => {
    window.__FAKE = f;
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('rtd_seen_intro_v1', '1');
        if (plays) localStorage.setItem('rtd_modeplays_v1', JSON.stringify(plays));
      }
    } catch (e) {}
  }, [fake, opts.plays || null]);
  await ctx.route('**/cdn.jsdelivr.net/**', (r) => r.abort());
  await ctx.route('**/googletagmanager.com/**', (r) => r.abort());
  await ctx.route('**/pagead2.googlesyndication.com/**', (r) => r.abort());
  await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await ctx.route('**/fonts.gstatic.com/**', (r) => r.abort());
  await ctx.route('**/supabase.co/**', (r) => r.abort());
  await ctx.route('**/baseball/auth.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_AUTH }));
  const sent = [];
  await ctx.route('**/api/stripe/checkout-bundle', async (r) => {
    sent.push({ body: r.request().postDataJSON(), auth: r.request().headers().authorization });
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ error: 'stripe_not_configured' }) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:' + PORT + '/baseball/' + (opts.query || ''));
  await page.waitForSelector('#s-intro.on', { timeout: 30000 });
  await page.waitForTimeout(250);
  return { ctx, page, sent };
}
const onScreen = (page, id) => page.evaluate((i) => !!document.querySelector('#' + i + '.on'), id);
const home = async (page) => {
  await page.evaluate(() => { document.getElementById('b-quit').click(); });
  await page.waitForSelector('#s-intro.on');
  await page.waitForTimeout(80);
};
const tile = (page, id) => page.evaluate((i) => {
  document.querySelector('#hp-tiles [data-mode="' + i + '"]').click();
}, id);
const chip = (page, id) => page.evaluate((i) => {
  const c = document.querySelector('#hp-tiles [data-mode="' + i + '"] .hp-meter');
  return c ? c.textContent : '';
}, id);
const plays = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rtd_modeplays_v1') || '{}'));

try {
  head('1. A GUEST GETS ONE FREE START OF EACH MODE A DAY');
  {
    const { ctx, page } = await open({ signedIn: false });
    const line = await page.textContent('#hp-pro');
    /* The price is read off the page's own constant, so a price change is one edit.
       The TERM is asserted beside it: Pro is a yearly subscription, and a price
       shown without "a year" reads as once. */
    const src = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const price = (/const PRO_PRICE='([^']+)'/.exec(src) || [])[1] || '(none)';
    claim(/one free play a day/i.test(line) && line.includes(price + ' a year'),
      'the front page says the rule, the price and that it is yearly', line);
    claim((await chip(page, 'cap')) === '', 'an unplayed mode carries no chip');

    await tile(page, 'cap');
    claim(await onScreen(page, 's-draft'), 'the first Cap Survivor start opens the draft');
    const pl = await plays(page);
    claim(pl.day === today && pl.by && pl.by.guest && pl.by.guest.includes('capsurvivor'),
      'the start is written to the device ledger, on the Eastern day', JSON.stringify(pl));
    await home(page);
    claim((await chip(page, 'cap')) === 'Played today', 'the tile now says it was played today');

    await tile(page, 'cap');
    await page.waitForTimeout(120);
    claim(!(await onScreen(page, 's-draft')), 'the second start does not open the draft');
    claim(await page.evaluate(() => document.getElementById('sheet-pro').classList.contains('on')),
      'it opens the Pro sheet instead');
    const title = await page.textContent('#pro-title');
    claim(/Cap Survivor/.test(title), 'the sheet names the mode that was refused', title);
    const lead = await page.textContent('#pro-in .pro-lead');
    claim(/midnight Eastern/.test(lead), 'and says when it comes back', lead);
    const btn = await page.textContent('#b-pro-buy');
    claim(/Sign in/.test(btn), 'a guest is asked to sign in, not to pay', btn);
    await page.evaluate(() => document.getElementById('b-pro-buy').click());
    await page.waitForTimeout(120);
    claim(await page.evaluate(() => document.getElementById('sheet-trophy').classList.contains('on')),
      'and the button opens the account panel');
    await page.evaluate(() => { document.querySelectorAll('#sheet-trophy [data-close]')[0].click(); });

    /* A picker mode is refused BEFORE its picker, not at the end of it. */
    await tile(page, 'era');
    await page.waitForTimeout(100);
    claim(await onScreen(page, 's-era'), 'an unplayed Eras opens its decade picker');
    await page.evaluate(() => document.querySelector('#s-era .era-card').click());
    claim(await onScreen(page, 's-draft'), 'choosing a decade opens the draft');
    await home(page);
    await tile(page, 'era');
    await page.waitForTimeout(100);
    claim(!(await onScreen(page, 's-era')) && await page.evaluate(() => document.getElementById('sheet-pro').classList.contains('on')),
      'a played Eras is refused before the picker, not after it');
    await page.evaluate(() => { document.querySelector('#sheet-pro [data-close-pro]').click(); });

    /* Classic is never counted. */
    for (let i = 0; i < 3; i++) {
      await page.click('#b-start');
      claim(await onScreen(page, 's-draft'), 'Classic start ' + (i + 1) + ' opens the draft');
      await home(page);
    }
    const pl2 = await plays(page);
    claim(!Object.values(pl2.by || {}).flat().some((m) => m === 'free' || m === 'daily'),
      'Classic is never written to the ledger', JSON.stringify(pl2));
    await ctx.close();
  }

  head('2. YESTERDAY DOES NOT COUNT TODAY');
  {
    const { ctx, page } = await open({ signedIn: false },
      { plays: { day: '2000-01-01', by: { guest: ['capsurvivor', 'era', 'trade'] } } });
    claim((await chip(page, 'cap')) === '', 'a ledger from another day draws no chip');
    await tile(page, 'cap');
    claim(await onScreen(page, 's-draft'), 'and the mode opens');
    await ctx.close();
  }

  head('3. A SIGNED IN ACCOUNT IS COUNTED BY THE SERVER TOO');
  {
    const meter = { signed_in: true, pro: false, day: today, used: ['staff'],
      next_at: new Date(Date.now() + 5 * 3600e3).toISOString() };
    const { ctx, page, sent } = await open({ signedIn: true, meter });
    claim((await chip(page, 'staff')) === 'Played today',
      'a mode the server says was played on another device is marked on this one');
    await tile(page, 'staff');
    await page.waitForTimeout(120);
    claim(!(await onScreen(page, 's-draft')), 'and it is refused here');
    const lead = await page.textContent('#pro-in .pro-lead');
    claim(/in <?\s*[45]h/.test(lead) || /in [45]h/.test(lead), 'the countdown reads off the server clock', lead);
    await page.evaluate(() => document.getElementById('b-pro-buy').click());
    await page.waitForTimeout(250);
    claim(sent.length === 1 && sent[0].body && sent[0].body.bundle === 'diamond-pro',
      'Get Pro posts the diamond-pro bundle to the one checkout', JSON.stringify(sent));
    claim(sent[0] && sent[0].body.return_path === '/baseball/', 'and asks to come back to the game');
    claim(sent[0] && sent[0].auth === 'Bearer tok-1', 'with the account token, never a user id in the body');
    const err = await page.textContent('#pro-err');
    claim(/not on sale yet/.test(err), 'a checkout that is not configured says so on the sheet', err);
    await page.evaluate(() => { document.querySelector('#sheet-pro [data-close-pro]').click(); });

    await tile(page, 'trade');
    await page.waitForTimeout(300);
    const spent = await page.evaluate(() => window.__spent);
    claim(spent.includes('trade'), 'a start is sent to the server meter', JSON.stringify(spent));
    await ctx.close();
  }

  head('4. PRO IS NEVER COUNTED');
  {
    const { ctx, page } = await open({ signedIn: true, pro: true },
      { plays: { day: today, by: { 'user-1': ['capsurvivor'] } } });
    await page.waitForTimeout(200);
    const line = await page.textContent('#hp-pro');
    claim(/Pro/.test(line) && !/\$9\.99/.test(line), 'the front page says Pro and sells nothing', line);
    claim((await chip(page, 'cap')) === 'Unlimited', 'every tile says Unlimited');
    for (let i = 0; i < 2; i++) {
      await tile(page, 'cap');
      claim(await onScreen(page, 's-draft'), 'Pro start ' + (i + 1) + ' of a mode already played opens the draft');
      await home(page);
    }
    claim((await page.evaluate(() => window.__spent)).length === 0, 'and nothing is sent to the meter');
    await ctx.close();
  }

  head('5. COMING BACK FROM STRIPE');
  {
    const { ctx, page } = await open({ signedIn: true, pro: true }, { query: '?checkout=success' });
    await page.waitForSelector('#sheet-pro.on', { timeout: 5000 }).catch(() => {});
    const t = await page.textContent('#pro-title');
    claim(/Pro is on/.test(t), 'the return lands on a sheet saying Pro is on', t);
    claim(!/checkout/.test(await page.evaluate(() => location.search)), 'and the flag is taken off the URL');
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ signedIn: true, pro: false }, { query: '?checkout=cancelled' });
    await page.waitForTimeout(300);
    claim(!(await page.evaluate(() => document.getElementById('sheet-pro').classList.contains('on'))),
      'a cancelled checkout opens nothing');
    await ctx.close();
  }

  head('6. A PHONE REACHES THE SAME GATE THROUGH THE SHEET');
  {
    const { ctx, page } = await open({ signedIn: false }, { w: 390, h: 844,
      plays: { day: today, by: { guest: ['division'] } } });
    await page.click('#b-modes');
    await page.waitForSelector('#sheet-modes.on');
    const sticker = await page.evaluate(() => {
      const s = document.querySelector('#modes-in [data-mode="div"] .mc-sticker');
      return s ? s.textContent : '';
    });
    claim(sticker === 'Played today', 'the mode card says it was played today', sticker);
    await page.evaluate(() => document.querySelector('#modes-in [data-mode="div"]').click());
    await page.waitForTimeout(120);
    claim(!(await onScreen(page, 's-div')) && await page.evaluate(() => document.getElementById('sheet-pro').classList.contains('on')),
      'pressing it opens Pro, not the division picker');
    /* Measured once the sheet has finished rising: mid-slide it is legitimately
       below the fold, and that is the animation rather than the layout. */
    await page.waitForTimeout(700);
    const fits = await page.evaluate(() => {
      const b = document.getElementById('b-pro-buy').getBoundingClientRect();
      return b.bottom <= innerHeight && b.top >= 0;
    });
    claim(fits, 'the buy button is on a phone screen without scrolling');
    const oneLine = await page.evaluate(() => [...document.querySelectorAll('#pro-in .pro-list li')].every((li) => {
      const sp = li.querySelector('span'), em = li.querySelector('em');
      return sp.scrollWidth <= sp.clientWidth + 1 && em.getBoundingClientRect().height < 20;
    }));
    claim(oneLine, 'every mode on the sheet holds one line, name uncut');
    await ctx.close();
  }
} catch (e) {
  bad('the walk could not finish', String(e && e.stack || e));
}

claim(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
server.close();
console.log('\n' + (fails ? fails + ' of ' + checks + ' checks FAILED' : 'all ' + checks + ' checks passed'));
process.exit(fails ? 1 : 0);
