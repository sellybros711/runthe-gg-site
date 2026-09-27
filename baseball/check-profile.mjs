/* The profile, in a browser: the header circle, the profile pages, Customize, the
 * career kept on the server, and the circles on the leaderboard.
 *
 *   node baseball/check-profile.mjs
 *
 * THE SERVER IS A STAND-IN, and it is one server shared by every page this file
 * opens. auth.js is replaced at the route with a module whose profile and career
 * calls go through page.exposeFunction to the object below, so two browser
 * contexts are two devices on one account. It keeps the rules 127 keeps (the
 * career only ever adds, a season already held is never replaced, every row is
 * filed under the caller), and supabase/test/baseball_profile_test.sql proves the
 * real SQL keeps them.
 *
 * What is asked here is the page's half, which is what can lose a player's things
 * quietly: that a device sends every season it holds, that a second device gets
 * them back, that a server that cannot be reached never wipes anything, and that a
 * locked choice is never saved.
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
const PORT = 8911;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const PAGE = process.env.RTD_PAGE ? path.resolve(process.env.RTD_PAGE) : null;

const server = await new Promise((res) => {
  const s = createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    let file = path.join(ROOT, p.replace(/^\/+/, ''));
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

/* ── the stand-in server ─────────────────────────────────────────────── */
const UID = 'user-1';
let SRV;
function resetServer() { SRV = { profile: null, career: [], down: false, calls: [] }; }
const PICKS = ['B', 'C'];
function serverOp(op, arg) {
  SRV.calls.push(op);
  if (SRV.down) return null;
  if (op === 'myProfile') return SRV.profile ? { ...SRV.profile } : {};
  if (op === 'saveProfile') {
    const p = SRV.profile || {};
    for (const k of Object.keys(arg || {})) p[k] = arg[k] === '' ? null : arg[k];
    SRV.profile = p; return { row: { ...p } };
  }
  if (op === 'careerMerge') {
    const held = new Map(SRV.career.map((r) => [r.ts, r]));
    for (const r of arg || []) if (r && r.ts && !held.has(r.ts)) held.set(r.ts, { ...r, u: UID });
    SRV.career = [...held.values()].sort((a, b) => a.ts - b.ts).slice(-1000);
    return SRV.career.map((r) => ({ ...r }));
  }
  if (op === 'profilesOf') {
    const out = {};
    if (SRV.profile) out[UID] = { user_id: UID, ...SRV.profile };
    return out;
  }
  return null;
}

const FAKE_AUTH = `
window.RTD_AUTH = (function () {
  const cfg = window.__FAKE || {};
  const listeners = [];
  let signedIn = !!cfg.signedIn, name = cfg.name === undefined ? 'slugger' : cfg.name;
  const st = () => ({ ready: true, waiting: false, signedIn, userId: signedIn ? '${UID}' : null,
    email: signedIn ? 'tester@example.com' : null, name: signedIn ? name : null });
  const fire = () => listeners.forEach((f) => f(st()));
  const srv = (op, arg) => window.__srv(op, arg === undefined ? null : arg);
  return {
    API_VERSION: 2,
    boot() { setTimeout(fire, 30); return true; },
    state: st, onChange(f) { listeners.push(f); return () => {}; },
    token: () => (signedIn ? 'tok-1' : null),
    signIn: async () => ({ error: null }), signUp: async () => ({ error: null }), signInGoogle() {},
    signOut: async () => { signedIn = false; fire(); }, available: async () => true,
    setName: async (n) => { window.__renamed = n; name = n; fire(); return { error: null }; },
    claim: async () => false,
    deleteAccount: async () => { window.__deleted = true; signedIn = false; fire(); return { ok: true }; },
    premiumProducts: async () => [], modeState: async () => null, modeSpend: async () => ({ ok: true }),
    myProfile: () => srv('myProfile'), saveProfile: (f) => srv('saveProfile', f),
    careerMerge: (rows) => srv('careerMerge', rows), profilesOf: (ids) => srv('profilesOf', ids),
  };
})();`;

/* A season row, the shape recordRun files. */
let tsn = 1760000000000;
const row = (o) => Object.assign({ ts: ++tsn, u: UID, wins: 88, losses: 74, titleWon: false, madePlayoffs: false,
  rating: 70, chemLinks: [], picks: [], era: null, franchise: null, division: null }, o);

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const errors = [];

async function open(fake, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1280, height: opts.h || 900 } });
  await ctx.exposeFunction('__srv', (op, arg) => serverOp(op, arg));
  await ctx.addInitScript(([f, hist, park]) => {
    window.__FAKE = f;
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('rtd_seen_intro_v1', '1');
        if (hist) localStorage.setItem('rtd_history', JSON.stringify(hist));
        if (park) localStorage.setItem('rtd_park_v1', JSON.stringify(park));
      }
    } catch (e) {}
  }, [fake, opts.history || null, opts.park || null]);
  for (const h of ['cdn.jsdelivr.net', 'googletagmanager.com', 'pagead2.googlesyndication.com',
    'fonts.googleapis.com', 'fonts.gstatic.com']) await ctx.route('**/' + h + '/**', (r) => r.abort());
  await ctx.route(/supabase\.co\/(?!rest\/v1\/rtd_runs)/, (r) => r.abort());
  await ctx.route(/supabase\.co\/rest\/v1\/rtd_runs/, (r) => r.fulfill({ contentType: 'application/json',
    headers: { 'content-range': '0-1/2' },
    body: JSON.stringify([
      { id: 1, user_id: UID, display_name: 'slugger', wins: 101, losses: 61, made_playoffs: true,
        seed_label: 'Division winner', title_won: true, run_mode: 'free', rating: 88, score: 1, picks: [], slots: [] },
      { id: 2, user_id: null, display_name: null, wins: 90, losses: 72, made_playoffs: false,
        seed_label: '', title_won: false, run_mode: 'free', rating: 70, score: 0, picks: [], slots: [] }]) }));
  await ctx.route('**/baseball/auth.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_AUTH }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:' + PORT + '/baseball/');
  await page.waitForSelector('#s-intro.on', { timeout: 30000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}
const openPf = async (page) => {
  await page.click('#b-profile');
  await page.waitForSelector('#sheet-profile.on');
  await page.waitForTimeout(80);
};
const go = async (page, where) => {
  await page.evaluate((w) => document.querySelector('#pf-in [data-go="' + w + '"]').click(), where);
  await page.waitForTimeout(80);
};
const hist = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rtd_history') || '[]'));
const settle = (page) => page.waitForTimeout(250);

try {
  head('1. THE HEADER SAYS WHO IS SIGNED IN');
  {
    resetServer();
    const { ctx, page } = await open({ signedIn: false });
    claim(await page.getAttribute('#b-profile', 'aria-label') === 'Sign in', 'signed out, the header offers to sign in');
    await openPf(page);
    claim(await page.evaluate(() => !!document.querySelector('#pf-in .acct input[type=email]')),
      'and the profile is the sign-in form');
    claim(!SRV.calls.includes('careerMerge'), 'a guest sends nothing to the server');
    const g = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#pf-in button')].find((x) => /Google/.test(x.textContent));
      if (!b) return null;
      const svg = b.querySelector('svg.g-ic'), r = svg && svg.getBoundingClientRect();
      return { fills: svg ? [...svg.querySelectorAll('path')].map((p) => p.getAttribute('fill')) : [],
        w: r ? Math.round(r.width) : 0, oneLine: b.getBoundingClientRect().height < 60 };
    });
    claim(g && g.fills.join() === '#4285F4,#34A853,#FBBC05,#EA4335' && g.w >= 16 && g.oneLine,
      'the Google button carries the Google G in its four colors', JSON.stringify(g));
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
    await ctx.close();
  }
  {
    resetServer();
    const { ctx, page } = await open({ signedIn: true });
    await settle(page);
    claim(await page.evaluate(() => !!document.querySelector('#b-profile.crested svg')),
      'signed in, the header draws the circle');
    await ctx.close();
  }

  head('2. EVERY SEASON THIS DEVICE HOLDS REACHES THE SERVER');
  {
    resetServer();
    const mine = [row({ wins: 95, madePlayoffs: true }), row({ wins: 101, titleWon: true, madePlayoffs: true }),
      row({ franchise: 'NYY', madePlayoffs: true, titleWon: true }), row({ franchise: 'BOS' })];
    const guest = [row({ u: null, wins: 70 })];
    const other = [row({ u: 'someone-else', wins: 66 })];
    const { ctx, page } = await open({ signedIn: true }, { history: mine.concat(guest, other) });
    await settle(page);
    claim(SRV.career.length === 4, 'the four seasons played on this account are on the server', 'server has ' + SRV.career.length);
    claim(!SRV.career.some((r) => r.wins === 70 || r.wins === 66), 'a guest season and another account\'s are not sent');
    const h = await hist(page);
    claim(h.length === 6, 'and nothing on this device was dropped doing it', 'device has ' + h.length);
    claim(SRV.profile && SRV.profile.tier && SRV.profile.ring, 'the rank and ring the cabinet earned are pushed',
      JSON.stringify(SRV.profile));
    await ctx.close();

    head('3. A SECOND DEVICE GETS THEM BACK');
    const d2 = await open({ signedIn: true });
    await settle(d2.page);
    const h2 = await hist(d2.page);
    claim(h2.filter((r) => r.u === UID).length === 4, 'a device that never played them holds all four', 'holds ' + h2.length);
    await openPf(d2.page);
    const seasons = await d2.page.evaluate(() => document.querySelector('#pf-in .pf-stats .sv').textContent);
    claim(seasons === '4', 'and the profile counts them', 'reads ' + seasons);
    const badges = await d2.page.evaluate(() => [...document.querySelectorAll('#pf-in .pf-stats .stk')]
      .find((x) => /Badges/.test(x.textContent)).querySelector('.sv').textContent);
    claim(/^[1-9]\d*\/\d+$/.test(badges), 'with the badges they earned', 'reads ' + badges);
    /* a season this device plays is added, and the first device's are kept */
    const before = SRV.career.length;
    await d2.page.evaluate((r) => {
      const h = JSON.parse(localStorage.getItem('rtd_history') || '[]'); h.push(r);
      localStorage.setItem('rtd_history', JSON.stringify(h));
    }, row({ wins: 77 }));
    await d2.ctx.close();
    const d3 = await open({ signedIn: true });
    await settle(d3.page);
    claim(SRV.career.length === before, 'a device that lost its storage adds nothing and removes nothing');
    await d3.ctx.close();
  }

  head('4. A SERVER THAT CANNOT BE REACHED WIPES NOTHING');
  {
    resetServer();
    SRV.down = true;
    const mine = [row({ wins: 99 }), row({ wins: 98 })];
    const { ctx, page } = await open({ signedIn: true }, { history: mine });
    await settle(page);
    const h = await hist(page);
    claim(h.length === 2, 'the device keeps both seasons', 'holds ' + h.length);
    await openPf(page);
    const seasons = await page.evaluate(() => document.querySelector('#pf-in .pf-stats .sv').textContent);
    claim(seasons === '2', 'and still counts them on the profile', 'reads ' + seasons);
    SRV.down = false;
    await ctx.close();
    const again = await open({ signedIn: true }, { history: mine });
    await settle(again.page);
    claim(SRV.career.length === 2, 'the next time the server answers, both reach it');
    await again.ctx.close();
  }

  head('5. CUSTOMIZE SAVES ONLY WHAT IS EARNED');
  {
    resetServer();
    /* ten seasons, so the season track has opened the first parks after the sandlot */
    const mine = [row({ franchise: 'NYY', madePlayoffs: true, titleWon: true, wins: 100 })];
    for (let i = 0; i < 9; i++) mine.push(row({ wins: 80 + i }));
    const { ctx, page } = await open({ signedIn: true }, { history: mine });
    await settle(page);
    await openPf(page);
    await go(page, 'look');
    const clubs = await page.evaluate(() => document.querySelectorAll('#pf-in .pf-club').length);
    claim(clubs === 30, 'thirty clubs to choose from', 'drew ' + clubs);
    await page.evaluate(() => document.querySelector('#pf-in .pf-club[data-club="BOS"]').click());
    await settle(page);
    claim(!(SRV.profile && SRV.profile.club), 'a club never played is not saved', JSON.stringify(SRV.profile));
    await page.evaluate(() => document.querySelector('#pf-in .pf-club[data-club="NYY"]').click());
    await settle(page);
    claim(SRV.profile && SRV.profile.club === 'NYY' && SRV.profile.rung === 3,
      'a club won with is saved at the top rung', JSON.stringify(SRV.profile));
    await page.evaluate(() => document.querySelector('#pf-in .pf-mark[data-mark="crown"]').click());
    await settle(page);
    claim(SRV.profile.mark !== 'crown', 'a mark whose badge is not earned is not saved');
    await page.evaluate(() => document.querySelector('#pf-in .pf-mark[data-mark="ball"]').click());
    await settle(page);
    claim(SRV.profile.mark === 'ball', 'an earned mark is saved', JSON.stringify(SRV.profile));
    await page.fill('#pf-init', 'z9!');
    await page.click('#pf-init-save');
    await settle(page);
    claim(SRV.profile.initials === 'Z9', 'initials are held to two letters or numbers', JSON.stringify(SRV.profile));
    const parks = await page.evaluate(() => document.querySelectorAll('#pf-parks .pk-card').length);
    claim(parks >= 13, 'the ballparks are on Customize', 'drew ' + parks);
    const use = await page.evaluate(() => { const b = document.querySelector('#pf-parks .pk-use'); if (!b) return null; b.click(); return b.dataset.park; });
    await settle(page);
    claim(use && SRV.profile.park === use, 'a ballpark chosen there is saved on the account', 'chose ' + use + ', saved ' + SRV.profile.park);
    claim(await page.evaluate(() => { const s = document.querySelector('#pf-in .pf-av svg'); return !!s && s.outerHTML.length > 500; }),
      'the preview draws the circle');
    await page.evaluate(() => document.querySelector('#pf-in .pf-club[data-club="NYY"]').click());
    await settle(page);
    claim(SRV.profile.club == null, 'tapping the club you wear takes it off');
    await ctx.close();
  }

  head('6. A PARK CHOSEN BEFORE THIS IS CARRIED OVER, ONCE');
  {
    resetServer();
    const { ctx, page } = await open({ signedIn: true }, { history: [row({})], park: { [UID]: 'cornfield' } });
    await settle(page);
    claim(SRV.profile && SRV.profile.park === 'cornfield', 'the device\'s old choice is saved to the account', JSON.stringify(SRV.profile));
    await ctx.close();
    SRV.profile.park = 'home';
    const b = await open({ signedIn: true }, { history: [row({})], park: { [UID]: 'cornfield' } });
    await settle(b.page);
    claim(SRV.profile.park === 'home', 'and never over a choice the account has since made');
    await b.ctx.close();
  }

  head('7. THE ACCOUNT PAGE');
  {
    resetServer();
    const { ctx, page } = await open({ signedIn: true });
    await settle(page);
    await openPf(page);
    await go(page, 'account');
    await page.fill('#pf-name', 'newname');
    await page.click('#pf-rename');
    await settle(page);
    claim(await page.evaluate(() => window.__renamed === 'newname'), 'a rename goes through the account');
    await page.click('#pf-del');
    claim(await page.evaluate(() => document.getElementById('pf-del').disabled), 'deleting asks for the name first');
    await page.fill('#pf-delname', 'wrong');
    claim(await page.evaluate(() => document.getElementById('pf-del').disabled), 'and a wrong name does not open it');
    await page.fill('#pf-delname', 'newname');
    await page.click('#pf-del');
    await settle(page);
    claim(await page.evaluate(() => window.__deleted === true), 'the right name deletes it');
    claim(await page.getAttribute('#b-profile', 'aria-label') === 'Sign in', 'and the header goes back to Sign in');
    await ctx.close();
  }

  head('8. THE LEADERBOARD DRAWS EVERYBODY\'S CIRCLE');
  {
    resetServer();
    SRV.profile = { club: 'NYY', rung: 3, mark: 'crown', initials: 'SG', tier: 'gold2', ring: 'gold' };
    const { ctx, page } = await open({ signedIn: false });
    await page.evaluate(() => { const b = document.querySelector('[data-open-board],#b-board,#b-board-hp'); if (b) b.click(); });
    await page.waitForTimeout(300);
    const onBoard = await page.evaluate(() => document.getElementById('s-board') && document.getElementById('s-board').classList.contains('on'));
    if (!onBoard) {
      /* The board has one door on the front page; if it moved, say so rather than skip. */
      bad('the leaderboard could be opened', 'no board door found');
    } else {
      await page.waitForSelector('#bd-list .bd-row', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
      const cr = await page.evaluate(() => [...document.querySelectorAll('#bd-list .bd-crest')].map((e) => e.innerHTML.length));
      claim(cr.length === 2 && cr.every((n) => n > 200), 'every row carries a circle, filed by nobody or not', JSON.stringify(cr));
      const gold = await page.evaluate(() => document.querySelector('#bd-list .bd-crest[data-uid]').innerHTML);
      claim(/#0?030?87|003087/i.test(gold), 'and the account\'s row wears its club', gold.slice(0, 120));
    }
    await ctx.close();
  }
} finally {
  claim(!errors.length, 'no page errors', errors.slice(0, 5).join('\n        '));
  await browser.close();
  server.close();
  console.log('\n' + (fails ? fails + ' of ' + checks + ' checks FAILED' : 'All ' + checks + ' checks passed.'));
  process.exit(fails ? 1 : 0);
}
