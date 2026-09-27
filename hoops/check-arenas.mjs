#!/usr/bin/env node
/* Run The Floor: arenas, the three-quarter camera, and the Locker.
 *
 *   node hoops/check-arenas.mjs          the catalogue, the art, the rules, the page
 *   node hoops/check-arenas.mjs --quick  no browser
 *
 * Everything that goes wrong here goes wrong silently. An SVG url() pointing at
 * an id that is not there draws nothing; two scenes on one page sharing an id
 * paint each other; a rule nobody can meet is an arena nobody sees; a choice the
 * account cannot back has to fall back to the home floor; and the tilted floor
 * and the five spots standing on it are two copies of one perspective, which
 * drift the first time either is tuned. baseball/check-parks.mjs is the model.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CT = require('./courts.js');
const QUICK = process.argv.includes('--quick');
const PAGE_SRC = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

let fails = 0, passes = 0;
const claim = (ok, what, why) => {
  if (ok) { passes++; console.log('  ok    ' + what); }
  else { fails++; console.log('  FAIL  ' + what + (why ? '  (' + why + ')' : '')); }
};
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));
const ids = (svg) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const refs = (svg) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);

// ── 1. the catalogue ─────────────────────────────────────────────────────────
head('1. EVERY ARENA IS IN THE CATALOGUE ONCE, AND THE HOME ARENA IS FREE');
{
  const list = CT.ARENAS.map((a) => a.id);
  claim(new Set(list).size === list.length, `${list.length} arenas, no id twice`);
  claim(CT.ARENAS[0].id === 'home' && CT.status(CT.ARENAS[0], null).ok, 'the home arena is first and yours as a guest');
  claim(new Set(CT.ARENAS.map((a) => a.name)).size === CT.ARENAS.length, 'no two arenas share a name');
  const RAR = ['Starter', 'Common', 'Rare', 'Epic', 'Legendary', 'Pro'];
  claim(CT.ARENAS.every((a) => a.nod && RAR.includes(a.rarity) && a.unlock && a.unlock.label),
    'each has a line, a known rarity and a rule');
  claim(CT.ARENAS.every((a) => (a.rarity === 'Pro') === !!a.unlock.pro), 'the Pro arenas and only they ask for Pro');
  /* The page draws a card per rarity; a rarity with no rule is a pill with no colour. */
  claim(RAR.slice(1).every((r) => PAGE_SRC.includes('.ar-card.r-' + r.toLowerCase())), 'every rarity has its colour on the page');
}

// ── 2. the art ───────────────────────────────────────────────────────────────
head('2. EVERY SCENE AND PREVIEW DRAWS, AND DRAWS ONLY WHAT IT DEFINES');
for (const a of CT.ARENAS) {
  for (const [what, svg] of [['scene', CT.scene(a.id, 't')], ['preview', CT.preview(a.id, 't')]]) {
    const defs = new Set(ids(svg));
    const missing = [...new Set(refs(svg).filter((r) => !defs.has(r)))];
    const dup = ids(svg).filter((v, i, l) => l.indexOf(v) !== i);
    claim(!/NaN|undefined|Infinity/.test(svg) && !missing.length && !dup.length && !/var\(/.test(svg),
      `${a.name} ${what}: no NaN, every url() resolves, no id twice, literal colours`,
      [missing.length && 'missing ' + missing.join(','), dup.length && 'dup ' + dup.join(',')].filter(Boolean).join('; '));
  }
}
{
  /* Thirteen previews are drawn into one sheet, and three courts carry a scene
     beside them: every id has to be that arena's and that surface's own. */
  const all = CT.ARENAS.map((a) => CT.preview(a.id, 'lk') + CT.scene(a.id, 'court')).join('') +
    CT.scene('home', 'h-court') + CT.scene('home', 'o-court') + CT.preview('home', 'na');
  const l = ids(all);
  claim(new Set(l).size === l.length, 'every arena drawn at once, three ways, shares no id');
}

// ── 3. the floors ────────────────────────────────────────────────────────────
head('3. EVERY FLOOR IS AN ARENA, AND EVERY SURFACE HAS ITS LAYERS ON THE PAGE');
{
  claim(Object.keys(CT.FLOOR).every((k) => CT.BY_ID[k]), 'no floor for an arena that is not in the catalogue');
  const surfs = new Set(CT.ARENAS.map((a) => CT.floorOf(a.id).surf));
  for (const sf of surfs) {
    if (sf === 'wood') { claim(/\.court \.floor\{[^}]*--tone:/.test(PAGE_SRC), 'wood is the floor rule itself'); continue; }
    const rule = new RegExp('\\.court\\[data-surf="' + sf + '"\\] \\.floor\\{([^}]*)\\}').exec(PAGE_SRC);
    claim(!!rule && /--tone:/.test(rule[1]) && /--seams:/.test(rule[1]) && /--grain:/.test(rule[1]),
      `the ${sf} surface swaps all three plank layers`);
  }
  /* Every custom property a floor hands a court is one the page's CSS reads. */
  const vars = [...CT.floorVars('glass').matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
  const unread = vars.filter((v) => !PAGE_SRC.includes('var(' + v));
  claim(!unread.length, `every floor property is read by the page (${vars.length})`, unread.join(', '));
}

// ── 4. the rules ─────────────────────────────────────────────────────────────
head('4. THE RULES: A GUEST GETS THE HOME ARENA, AND EVERY RULE CAN BE MET');
{
  const blank = { version: 1, runs: 0, rings: 0, playoffs: 0, bestWins: 0, feats: {} };
  const full = { version: 1, runs: 40, rings: 4, playoffs: 20, bestWins: 66,
    feats: { 'cq.best': 25, 'ps.par': 3, 'fx.title': 2 } };
  const guest = CT.unlockedIds({ signed: false, pro: true, badges: 99, c: full });
  claim(guest.length === 1 && guest[0] === 'home', 'a guest with a full career and Pro still gets the home arena alone', guest.join(','));
  claim(CT.ARENAS.slice(1).every((a) => /^Sign in and /.test(CT.status(a, { signed: false }).label)),
    'and every locked card tells a guest the one step: sign in');
  const none = CT.unlockedIds({ signed: true, pro: false, badges: 0, c: blank });
  claim(none.length === 1, 'a fresh account has the home arena alone', none.join(','));
  const all = CT.unlockedIds({ signed: true, pro: false, badges: 60, c: full });
  claim(all.length === CT.ARENAS.length - 2, 'a full career opens everything but the two Pro arenas', all.length + '');
  claim(CT.unlockedIds({ signed: true, pro: true, badges: 0, c: blank }).length === 3, 'and Pro opens exactly those two');
  /* A rule that reads a feat nothing writes is an arena nobody will ever see. */
  const BSRC = fs.readFileSync(path.join(HERE, 'badges.js'), 'utf8');
  const writers = ['conquestFeats', 'fixFeats', 'passesFeats'].map((f) => {
    const i = BSRC.indexOf('function ' + f + '(');
    return i < 0 ? '' : BSRC.slice(i, BSRC.indexOf('\n}\n', i));
  }).join('\n');
  const CSRC = fs.readFileSync(path.join(HERE, 'courts.js'), 'utf8');
  const feats = [...CSRC.matchAll(/feat\(i\.c, '([a-z.]+)'\)/g)].map((m) => m[1]);
  claim(feats.length >= 3, `the rules read ${feats.length} mode feats`);
  for (const k of feats) claim(writers.includes("'" + k + "'"), `${k} is written by a mode`);
  /* And the career counters are fields the page keeps. */
  for (const k of ['runs', 'rings', 'playoffs', 'bestWins'])
    claim(new RegExp('function blankCareer\\(\\)\\{[^}]*\\b' + k + ':').test(PAGE_SRC), `career.${k} is a field the page keeps`);
  /* Each rule counts up: meeting it by one more is still meeting it. */
  claim(CT.ARENAS.every((a) => !a.unlock.need || CT.status(a, { signed: true, badges: 999, c: full }).ok),
    'every counted rule is met by a career past it');
}

// ── 5. the projection ────────────────────────────────────────────────────────
head('5. THE PROJECTION IS A PERSPECTIVE');
{
  const r = 0.72;
  const base = CT.project(30, 100, r);
  claim(Math.abs(base.x - 30) < 1e-9 && Math.abs(base.y - 100) < 1e-9 && Math.abs(base.s - 1) < 1e-9, 'the near edge does not move');
  const far = CT.project(50, 0, r), mid = CT.project(50, 50, r);
  claim(far.y > 0 && far.y < mid.y && far.s < mid.s && mid.s < 1, 'the far end is higher up and smaller');
  claim(CT.project(0, 0, r).x > 0 && CT.project(100, 0, r).x < 100, 'and narrower');
  claim(Math.abs(CT.farEdge(r) - far.y) < 1e-9, 'farEdge is project at the far baseline');
}

if (QUICK) finish();

// ── 6. the page ──────────────────────────────────────────────────────────────
const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
async function serve(route) {
  const u = new URL(route.request().url());
  if (u.hostname !== 'local.test') return route.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return route.abort();
  await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
}
/* An account, faked where the page reads it, so nothing reaches the live
   project. `career` is written before the page boots. */
function fakeAuth(opts) {
  return (o) => {
    window.__acct = o.acct;
    window.__sent = [];
    const fake = { boot() {}, onChange(f) { window.__authCb = f; setTimeout(f, 30); },
      /* the profile row, stood in: what the server holds, and every write sent to it */
      getProfile() { return Promise.resolve(window.__acct ? (o.row === undefined ? {} : o.row) : null); },
      setProfile(f) { window.__sent.push(f); return Promise.resolve({}); },
      state() { return window.__acct ? { ready: true, signedIn: true, userId: window.__acct, name: 'tester' } : { ready: true, signedIn: false }; } };
    Object.defineProperty(window, 'RTF_AUTH', { get() { return Object.assign(this.__a || {}, fake); }, set(v) { this.__a = v; }, configurable: true });
    if (o.career) localStorage.setItem('runthefloor_career_v1', JSON.stringify(o.career));
    for (const [k, v] of Object.entries(o.ls || {})) localStorage.setItem(k, v);
  };
}
async function open(browser, w, h, opts) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', serve);
  await page.addInitScript(fakeAuth(), opts || {});
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => { const x = document.querySelector('#frg-x'); if (x) x.click(); });
  await page.waitForTimeout(200);
  return { ctx, page, boom };
}
async function toDraft(page) {
  await page.evaluate(() => document.querySelector('#b-start').click());
  await page.waitForSelector('.opts:not(.pending) .ptile', { timeout: 30000 });
  await page.waitForTimeout(300);
}

/* THE SPOTS ARE WHERE THE FLOOR IS. A marker is dropped onto the tilted floor at
   each spot's flat position (so the browser's own perspective places it) and
   the spot, which the page placed with project(), has to be on top of it. */
const alignment = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const floor = el.querySelector('.floor');
  const out = [];
  for (const sp of el.querySelectorAll('.spot')) {
    const m = document.createElement('i');
    m.style.cssText = 'position:absolute;width:0;height:0;left:' + sp.dataset.px + '%;top:' + sp.dataset.py + '%';
    floor.appendChild(m);
    const a = m.getBoundingClientRect(), b = sp.getBoundingClientRect();
    out.push(Math.hypot(a.left - (b.left + b.width / 2), a.top - (b.top + b.height / 2)));
    m.remove();
  }
  /* The hoop hangs over the rim's point on the floor too. */
  const rim = document.createElement('i');
  rim.style.cssText = 'position:absolute;width:0;height:0;left:50%;top:7%';
  floor.appendChild(rim);
  const rr = rim.getBoundingClientRect(), hp = el.querySelector('.hoop').getBoundingClientRect();
  rim.remove();
  const fr = floor.getBoundingClientRect(), cr = el.getBoundingClientRect();
  const far = parseFloat(el.style.getPropertyValue('--tq-far'));
  return { tq: el.classList.contains('tq'), n: out.length, worst: Math.max(...out),
    hoop: Math.hypot(rr.left - (hp.left + hp.width / 2), rr.top - (hp.top + hp.height * 0.52)),
    farPx: Math.abs((fr.top - cr.top) - far / 100 * cr.height), scene: !!el.querySelector('.scene svg') };
}, sel);

const browser = await pw.chromium.launch({ executablePath: CHROME });
try {
  head('6. THE FIVE SPOTS STAND ON THE TILTED FLOOR, TO A PIXEL');
  for (const [w, h] of [[390, 844], [360, 740], [1280, 900]]) {
    const { ctx, page, boom } = await open(browser, w, h);
    await toDraft(page);
    for (const a of ['home', 'blacktop', 'glass']) {
      await page.evaluate((a) => window.RTF_PAGE.arena.force(a), a);
      const r = await alignment(page, '#court');
      claim(r.tq && r.scene && r.n === 5 && r.worst < 1.5 && r.hoop < 1.5 && r.farPx < 1.5,
        `${w}x${h} ${a}: five spots on their floor points, the hoop on the rim, the building at the far edge`,
        `spots off by ${r.worst.toFixed(2)}px, hoop ${r.hoop.toFixed(2)}px, far edge ${r.farPx.toFixed(2)}px`);
      const surf = await page.evaluate(() => document.querySelector('#court').getAttribute('data-surf'));
      claim(surf === CT.floorOf(a).surf, `${a} wears its own surface (${surf})`);
    }
    claim(!boom.length, `${w}x${h}: nothing threw`, boom.join(' | '));
    await ctx.close();
  }

  head('7. THE CAMERA IS A CHOICE, AND OVERHEAD IS THE OLD FLAT COURT');
  {
    const { ctx, page } = await open(browser, 390, 844);
    await toDraft(page);
    await page.evaluate(() => window.RTF_PAGE.arena.setCamera('top'));
    const flat = await page.evaluate(() => {
      const el = document.querySelector('#court');
      const sp = [...el.querySelectorAll('.spot')].map((s) => [s.style.left, s.dataset.px + '%', s.style.top, s.dataset.py + '%']);
      return { tq: el.classList.contains('tq'), scene: el.querySelector('.scene').innerHTML,
        tf: getComputedStyle(el.querySelector('.floor')).transform, flat: sp.every((a) => a[0] === a[1] && a[2] === a[3]) };
    });
    claim(!flat.tq && !flat.scene && flat.tf === 'none' && flat.flat, 'overhead: no tilt, no building, every spot at its flat point');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#b-start:not([disabled])', { state: 'attached', timeout: 30000 });
    claim(await page.evaluate(() => window.RTF_PAGE.arena.camera()) === 'top', 'and the choice survives a reload');
    await ctx.close();
  }

  head('8. A CHOICE THE ACCOUNT CANNOT BACK FALLS BACK TO THE HOME ARENA');
  {
    const good = { version: 1, runs: 5, rings: 0, playoffs: 3, bestWins: 50, bestRating: 0, bestLabel: '', totalWins: 0,
      totalLosses: 0, clubs: {}, shapes: {}, beat72: 0, seasons: {}, colleges: {}, rows: [], byClub: { BOS: { runs: 1, rings: 0, bestWins: 50 } }, feats: {} };
    const pick = (id) => ({ 'rtf.arena.v1': JSON.stringify({ u1: id }) });
    let o = await open(browser, 390, 844, { acct: 'u1', career: good, ls: pick('parquet') });
    await o.page.waitForTimeout(200);
    claim(await o.page.evaluate(() => { window.RTF_PAGE.arenaChanged(); return window.RTF_PAGE.arena.current(); }) === 'parquet',
      'an account that made the playoffs three times plays in the Parquet it chose');
    await o.page.evaluate(() => { window.__acct = null; window.__authCb && window.__authCb(); });
    claim(await o.page.evaluate(() => window.RTF_PAGE.arena.current()) === 'home', 'signed out, the same browser draws the home floor');
    await o.page.evaluate(() => { window.__acct = 'u2'; window.__authCb && window.__authCb(); });
    claim(await o.page.evaluate(() => window.RTF_PAGE.arena.current()) === 'home', 'and so does another account on it');
    await o.ctx.close();
    o = await open(browser, 390, 844, { acct: 'u1', career: good, ls: pick('cathedral') });
    await o.page.waitForTimeout(200);
    claim(await o.page.evaluate(() => { window.RTF_PAGE.arenaChanged(); return window.RTF_PAGE.arena.current(); }) === 'home',
      'a stored arena the account has not earned draws the home floor');
    await o.ctx.close();
    o = await open(browser, 390, 844, { acct: 'u1', career: good, ls: pick('neon') });
    await o.page.waitForTimeout(200);
    claim(await o.page.evaluate(() => { window.RTF_PAGE.arenaChanged(); return window.RTF_PAGE.arena.current(); }) === 'home',
      'and so does a Pro arena on an account without Pro');
    await o.ctx.close();
  }

  head('9. THE LOCKER: THE JERSEY, THE CAMERA AND THE SHELF');
  {
    const career = { version: 1, runs: 5, rings: 0, playoffs: 1, bestWins: 50, bestRating: 0, bestLabel: '', totalWins: 0,
      totalLosses: 0, clubs: {}, shapes: {}, beat72: 0, seasons: {}, colleges: {}, rows: [], byClub: { BOS: { runs: 1, rings: 0, bestWins: 50 } }, feats: {} };
    const { ctx, page, boom } = await open(browser, 390, 844, { acct: 'u1', career });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.RTF_PAGE.openProfile());
    await page.click('#pt-locker');
    const shelf = await page.evaluate(() => ({
      cards: document.querySelectorAll('#lk-arenas .ar-card').length,
      open: document.querySelectorAll('#lk-arenas .ar-card:not(.lock)').length,
      kits: document.querySelectorAll('#lk-kits .sw').length,
      owned: [...document.querySelectorAll('#lk-kits .sw:not(.lock)')].map((b) => b.dataset.kit),
      shown: !document.querySelector('#pf-locker').hidden && document.querySelector('#pf-list').hidden,
    }));
    claim(shelf.shown, 'the Locker tab shows the locker and hides the record');
    claim(shelf.cards === CT.ARENAS.length && shelf.open === 2, `every arena on the shelf, and the two this career earned open (${shelf.open})`);
    claim(shelf.kits === 31 && shelf.owned.join() === 'house,BOS', `the house colors and every club, with the club played in One Franchise open (${shelf.owned})`);
    await page.click('#lk-kits .sw[data-kit="LAL"]');
    claim(await page.evaluate(() => !document.querySelector('#lk-kits .sw[data-kit="LAL"]').classList.contains('on')),
      'a locked club cannot be worn');
    await page.click('#lk-kits .sw[data-kit="BOS"]');
    await page.fill('#lk-num', '33');
    const id = await page.evaluate(() => document.querySelector('#pf-id').textContent);
    claim(/Celtics colors/.test(id) && /#33/.test(id), 'wearing the Celtics and number 33 is what the identity row says', id);
    await page.click('#lk-arenas [data-use="rec"]');
    claim(await page.evaluate(() => window.RTF_PAGE.arena.current() === 'rec' &&
      document.querySelector('#court').getAttribute('data-arena') === 'rec'), 'Play here puts the court in that arena');
    await page.click('.seg [data-cam="top"]');
    claim(await page.evaluate(() => !document.querySelector('#court').classList.contains('tq')), 'the camera switch reaches the court');
    claim(!boom.length, 'nothing threw', boom.join(' | '));
    await ctx.close();
  }

  head('10. A MODE THAT OPENS AN ARENA SAYS SO');
  {
    const career = { version: 1, runs: 1, rings: 0, playoffs: 0, bestWins: 30, bestRating: 0, bestLabel: '', totalWins: 0,
      totalLosses: 0, clubs: {}, shapes: {}, beat72: 0, seasons: {}, colleges: {}, rows: [], feats: {} };
    const { ctx, page } = await open(browser, 390, 844, { acct: 'u1', career });
    await page.waitForTimeout(200);
    const said = await page.evaluate(async () => {
      const seen = [];
      const t = document.getElementById('toast') || document.body;
      const mo = new MutationObserver(() => seen.push(document.body.innerText.match(/Arena unlocked: [^\n]+/)?.[0]));
      mo.observe(document.body, { subtree: true, childList: true, characterData: true });
      window.RTF_PAGE.feats({ max: { 'cq.best': 10 } });
      await new Promise((r) => setTimeout(r, 6500));
      mo.disconnect();
      return seen.filter(Boolean);
    });
    claim(said.some((s) => /The Fieldhouse/.test(s)), 'ten straight in Conquest names the Fieldhouse', said.join(' | ') || 'nothing said');
    await ctx.close();
  }

  head('11. THE PROFILE IS THE ACCOUNT\'S: READ ON SIGN IN, WRITTEN ON EVERY CHOICE');
  {
    const career = { version: 1, runs: 5, rings: 0, playoffs: 3, bestWins: 50, bestRating: 0, bestLabel: '', totalWins: 0,
      totalLosses: 0, clubs: {}, shapes: {}, beat72: 0, seasons: {}, colleges: {}, rows: [], byClub: { BOS: { runs: 1, rings: 0, bestWins: 50 } }, feats: {} };
    const row = { jersey_club: 'BOS', jersey_num: '33', arena: 'parquet', camera: 'top',
      last_club: 'LAL', last_era: 'eighties', guide_seen: true };
    let o = await open(browser, 390, 844, { acct: 'u1', career, row });
    await o.page.waitForTimeout(400);
    const got = await o.page.evaluate(() => ({
      arena: window.RTF_PAGE.arena.current(), camera: window.RTF_PAGE.arena.camera(),
      club: localStorage.getItem('rtf.club.v1'), era: localStorage.getItem('rtf.era.v1'),
      look: JSON.parse(localStorage.getItem('rtf.look.v1') || '{}').u1,
      tq: document.querySelector('#court').classList.contains('tq') }));
    claim(got.arena === 'parquet' && got.camera === 'top' && !got.tq, 'a fresh browser draws the arena and camera the account holds', JSON.stringify(got));
    claim(got.look && got.look.club === 'BOS' && got.look.num === '33', 'and wears the account\'s jersey');
    claim(got.club === 'LAL' && got.era === 'eighties', 'and its One Franchise and Decades doors remember the account\'s picks');
    await o.page.evaluate(() => window.RTF_PAGE.openProfile());
    await o.page.click('#pt-locker');
    await o.page.click('#lk-arenas [data-use="rec"]');
    await o.page.click('.seg [data-cam="tq"]');
    await o.page.fill('#lk-num', '7');
    const sent = await o.page.evaluate(() => window.__sent);
    claim(sent.some((f) => f.arena === 'rec') && sent.some((f) => f.camera === 'tq') && sent.some((f) => f.num === '7'),
      'every choice in the Locker is written to the account as it is made', JSON.stringify(sent));
    await o.ctx.close();
    /* A browser holding choices the account has never heard of sends them up. */
    o = await open(browser, 390, 844, { acct: 'u1', career, row: {},
      ls: { 'rtf.arena.v1': JSON.stringify({ u1: 'parquet' }), 'rtf.look.v1': JSON.stringify({ u1: { club: 'BOS', num: '12' } }),
        'rtf.cam.v1': 'top', 'rtf.club.v1': 'CHI' } });
    await o.page.waitForTimeout(400);
    const up = await o.page.evaluate(() => Object.assign({}, ...window.__sent));
    claim(up.arena === 'parquet' && up.club === 'BOS' && up.num === '12' && up.camera === 'top' && up.lastClub === 'CHI',
      'choices made before the account had a row go up on the way in', JSON.stringify(up));
    await o.ctx.close();
  }
} finally {
  await browser.close();
}
finish();

function finish() {
  console.log('\n' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
}
