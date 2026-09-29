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
head('1. EVERY ARENA IS IN THE CATALOGUE ONCE, AND THE BLACKTOP IS WHERE EVERYBODY STARTS');
{
  const list = CT.ARENAS.map((a) => a.id);
  claim(new Set(list).size === list.length, `${list.length} arenas, no id twice`);
  claim(CT.START === 'blacktop' && CT.ARENAS[0].id === CT.START && CT.status(CT.ARENAS[0], null).ok,
    'the Blacktop is first, and yours as a guest');
  claim(CT.ARENAS.filter((a) => a.unlock.free).length === 1, 'and it is the only free arena');
  claim(new Set(CT.ARENAS.map((a) => a.name)).size === CT.ARENAS.length, 'no two arenas share a name');
  claim(CT.ARENAS.every((a) => a.nod && CT.TIERS[a.tier] && a.unlock && a.unlock.label),
    'each has a line, a known tier and a rule in words');
  claim(CT.ARENAS.every((a) => (a.tier === 'pro') === !!a.unlock.pro), 'the Pro arenas and only they ask for Pro');
  /* The page draws a card per tier; a tier with no rule is a pill with no colour. */
  claim(Object.keys(CT.TIERS).every((t) => PAGE_SRC.includes('.ar-card.r-' + t + ' .rar')), 'every tier has its colour on the page');
  /* The SQL constraint on rtf_profiles.arena lists the ids a profile may store. */
  const SQL = fs.readFileSync(path.join(ROOT, 'supabase/129_hoops_profiles.sql'), 'utf8');
  const ck = /rtf_profiles_arena_ck check \(arena is null or arena in \(([^)]*)\)/.exec(SQL);
  const allowed = ck ? [...ck[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : [];
  claim(list.every((id) => allowed.includes(id)), 'every arena id is one the profile row may store', list.filter((id) => !allowed.includes(id)).join(','));
}

// ── 1b. the ladder ──────────────────────────────────────────────────────────
head('1b. THE LADDER CLIMBS, AND THE LEAGUE ASKS FOR A LONG TIME');
{
  const road = CT.ARENAS.filter((a) => a.unlock.reqs);
  const of = (a, k) => { const q = a.unlock.reqs.find((x) => x.k === k); return q ? q.of : 0; };
  let climbs = true, why = '';
  for (let n = 1; n < road.length; n++) {
    for (const k of Object.keys(CT.REQ)) if (of(road[n], k) < of(road[n - 1], k)) { climbs = false; why = road[n].id + ' asks less ' + k; }
    if (of(road[n], 'runs') <= of(road[n - 1], 'runs')) { climbs = false; why = road[n].id + ' asks no more runs'; }
  }
  claim(climbs, `every rung asks at least as much of everything as the one below it, and more runs (${road.length} rungs)`, why);
  claim(road.every((a) => of(a, 'runs') > 0 && of(a, 'badges') > 0), 'every rung asks for runs AND badges: dedication and achievements');
  const tiers = CT.ARENAS.map((a) => a.tier).filter((t) => t !== 'pro');
  const order = Object.keys(CT.TIERS);
  claim(tiers.every((t, n) => !n || order.indexOf(t) >= order.indexOf(tiers[n - 1])), 'the tiers run street, rec, college, league, legend in order');
  const league = road.filter((a) => a.tier === 'league' || a.tier === 'legend');
  claim(league.length >= 4 && league.every((a) => of(a, 'runs') >= 100 && of(a, 'days') >= 15 && of(a, 'badges') >= 40),
    'every league arena wants 100 runs, 40 badges and 15 different days or more');
  claim(road.slice(-3).every((a) => of(a, 'rings') > 0), 'and the top three want rings too');
  claim(Object.keys(CT.REQ).every((k) => road.some((a) => of(a, k) > 0)), 'every kind of requirement is asked by some rung');
}

// ── 1c. the court ──────────────────────────────────────────────────────────
head('1c. THE LINES ARE A REGULATION HALF COURT');
{
  const C = CT.COURT, mid = C.W / 2;
  const three = CT.SHAPES.find((s) => s.pts.length > 40 && s.pts[0][0] === C.CORNER && s.pts[0][1] === 0);
  claim(!!three, 'there is a three point line that starts on the baseline in the corner');
  if (three) {
    const p = three.pts;
    const onArc = p.slice(2, -2).every((q) => Math.abs(Math.hypot(q[0] - mid, q[1] - C.RIM) - C.R3) < 1e-6);
    const joins = Math.abs(Math.hypot(p[1][0] - mid, p[1][1] - C.RIM) - C.R3) < 1e-6 && p[1][0] === C.CORNER;
    const apex = Math.max(...p.map((q) => q[1]));
    claim(joins && onArc, 'the corner runs straight until it meets the 23.75 ft arc, and the arc is round about the rim');
    claim(Math.abs(p[1][1] - 14.2) < 0.1, `the corner is straight for 14.2 ft (${p[1][1].toFixed(2)})`);
    claim(Math.abs(apex - (C.RIM + C.R3)) < 0.05 && apex < C.HALF, `the arc tops out at ${apex.toFixed(2)} ft, well short of half court`);
    claim(p.every((q) => q[0] >= C.CORNER - 1e-9 && q[0] <= C.W - C.CORNER + 1e-9), 'and never leaves the court between the corners');
  }
  const ft = CT.SHAPES.filter((s) => s.pts.every((q) => Math.abs(Math.hypot(q[0] - mid, q[1] - C.FT) - C.FTR) < 1e-6) && s.pts.length > 10);
  const solid = ft.find((s) => s.k === 'l'), dash = ft.find((s) => s.k === 'dash');
  claim(!!solid && !!dash && solid.pts.every((q) => q[1] >= C.FT - 1e-9) && dash.pts.every((q) => q[1] <= C.FT + 1e-9),
    'the free throw circle is solid toward half court and dashed inside the lane');
  const cc = CT.SHAPES.filter((s) => s.pts.length > 30 && s.pts.every((q) => Math.abs(Math.hypot(q[0] - mid, q[1] - C.HALF) - C.CC) < 1e-6));
  claim(cc.length === 1, 'the center circle sits on the half court line');
  claim(Math.abs(CT.pct(0, C.HALF).y - 80) < 1e-9, 'half court is 80% of the way down the box, where the spots were laid out');
  claim(CT.SHAPES.filter((s) => s.pts.length === 2 && s.pts[0][1] === C.MARK && s.pts[1][1] === C.MARK).length === 2,
    'the 28 ft marks cross both sidelines');
  const marks = CT.SHAPES.filter((s) => s.pts.length === 2 && s.pts[0][1] === s.pts[1][1] && [11, 14, 17].includes(s.pts[0][1]));
  claim(marks.length === 6 && CT.SHAPES.filter((s) => s.k === 'mk').length === 2, 'three lane marks and a block on each side of the lane');
  const svg = CT.lines('t');
  claim(!/NaN|undefined|Infinity/.test(svg) && refs(svg).every((r) => ids(svg).includes(r)), 'the lines SVG draws, and its apron resolves');
  const all = ['h-court', 'court', 'o-court'].map((k) => CT.lines(k)).join('');
  claim(new Set(ids(all)).size === ids(all).length, 'three courts on one page share no id');
  const classes = new Set([...svg.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(' ')));
  /* The apron is the one mark painted by its own gradient, inside the SVG. */
  const unstyled = [...classes].filter((k) => k !== 'lines-svg' && k !== 'apron' && !new RegExp('\\.lines-svg \\.' + k + '\\b').test(PAGE_SRC));
  claim(!unstyled.length, `every mark the SVG draws is styled by the page (${classes.size})`, unstyled.join(','));
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
  /* read by the page's CSS, or by the lines SVG courts.js lays over the floor */
  const LINES = CT.lines('t');
  const unread = vars.filter((v) => !PAGE_SRC.includes('var(' + v) && !LINES.includes('var(' + v));
  claim(!unread.length, `every floor property is read by the page (${vars.length})`, unread.join(', '));
}

// ── 4. the rules ───────────────────────────────────────────────────────────
head('4. THE RULES: A GUEST GETS THE BLACKTOP, AND EVERY RULE CAN BE MET');
{
  const days = (n) => Object.fromEntries(Array.from({ length: n }, (_, k) => ['2025-01-' + String(k + 1).padStart(2, '0'), 1]));
  const blank = { version: 1, runs: 0, rings: 0, playoffs: 0, bestWins: 0, feats: {}, days: {} };
  const full = { version: 1, runs: 600, rings: 6, playoffs: 200, bestWins: 66, feats: {}, days: Object.assign(days(31), Object.fromEntries(Array.from({ length: 31 }, (_, k) => ['2025-03-' + String(k + 1).padStart(2, '0'), 1]))) };
  const guest = CT.unlockedIds({ signed: false, pro: true, badges: 999, c: full });
  claim(guest.length === 1 && guest[0] === 'blacktop', 'a guest with a full career and Pro still gets the Blacktop alone', guest.join(','));
  claim(CT.ARENAS.slice(1).every((a) => /^Sign in and /.test(CT.status(a, { signed: false }).label)),
    'and every locked card tells a guest the one step: sign in');
  const none = CT.unlockedIds({ signed: true, pro: false, badges: 0, c: blank });
  claim(none.length === 1 && none[0] === 'blacktop', 'a fresh account has the Blacktop alone', none.join(','));
  claim(CT.best({ signed: true, badges: 0, c: blank }) === 'blacktop', 'and plays there');
  const all = CT.unlockedIds({ signed: true, pro: false, badges: 120, c: full });
  claim(all.length === CT.ARENAS.length - 2, 'a long career opens everything but the two Pro arenas', all.length + '');
  claim(CT.best({ signed: true, badges: 120, c: full }) === 'banners', 'and plays at the top of the ladder');
  claim(CT.unlockedIds({ signed: true, pro: true, badges: 0, c: blank }).length === 3, 'and Pro opens exactly those two');
  /* One short of a rung is not the rung, in any of its parts. */
  const home = CT.BY_ID.home, need = Object.fromEntries(home.unlock.reqs.map((q) => [q.k, q.of]));
  const at = (d) => ({ signed: true, badges: need.badges + (d.badges || 0),
    c: { runs: need.runs + (d.runs || 0), rings: 0, days: days(need.days + (d.days || 0)) } });
  claim(CT.status(home, at({})).ok, `the Hardwood opens at exactly ${home.unlock.label.toLowerCase()}`);
  claim(['runs', 'badges', 'days'].every((k) => !CT.status(home, at({ [k]: -1 })).ok),
    'and one run, one badge or one day short of it keeps it shut');
  const st = CT.status(home, at({ days: -3 }));
  claim(st.parts.length === 3 && st.parts.find((q) => q.k === 'days').have === need.days - 3 && st.have < st.of,
    'the card is told each part and how far along it is');
  /* Every counter a rule reads is one the page keeps. */
  for (const k of ['runs', 'rings'])
    claim(new RegExp('function blankCareer\\(\\)\\{[^}]*\\b' + k + ':').test(PAGE_SRC), `career.${k} is a field the page keeps`);
  const blankSrc = PAGE_SRC.slice(PAGE_SRC.indexOf('function blankCareer(){'), PAGE_SRC.indexOf('function blankCareer(){') + 400);
  claim(/\bdays: \{\}/.test(blankSrc) && /stampDay\(c, true\)/.test(PAGE_SRC) && /stampDay\(c, false\)/.test(PAGE_SRC),
    'career.days is kept, and a run and a mode both stamp the day');
  const CL = fs.readFileSync(path.join(HERE, 'cloud.js'), 'utf8');
  claim(/CAREER_COUNTS = \[[^\]]*'days'/.test(CL), 'and cloud.js merges it, or a second device would drop every day played');
  claim(CT.ARENAS.every((a) => !a.unlock.reqs || CT.status(a, { signed: true, badges: 999, c: full }).ok),
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
  const rp = window.RTF_COURTS.RIM_PCT;
  rim.style.cssText = 'position:absolute;width:0;height:0;left:' + rp.x + '%;top:' + rp.y + '%';
  floor.appendChild(rim);
  const rr = rim.getBoundingClientRect(), hp = el.querySelector('.hoop').getBoundingClientRect();
  rim.remove();
  const fr = floor.getBoundingClientRect(), cr = el.getBoundingClientRect();
  const far = parseFloat(el.style.getPropertyValue('--tq-far'));
  return { tq: el.classList.contains('tq'), n: out.length, worst: Math.max(...out),
    hoop: Math.hypot(rr.left - (hp.left + hp.width / 2), rr.top - (hp.top + hp.height * 0.52)),
    farPx: Math.abs((fr.top - cr.top) - far / 100 * cr.height), scene: !!el.querySelector('.scene svg') };
}, sel);

/* A career that has climbed a good way up the ladder: plenty of runs, rings,
   feats that light a cabinet's worth of badges, and thirteen days played. */
const RICH = { version: 1, runs: 60, rings: 6, playoffs: 40, bestWins: 68, bestRating: 0, bestLabel: '', totalWins: 0,
  totalLosses: 0, clubs: {}, shapes: {}, beat72: 1, seasons: {}, colleges: {}, rows: [],
  byClub: { BOS: { runs: 1, rings: 0, bestWins: 50 } },
  feats: { 'cq.best': 25, 'cq.runs': 12, 'ps.par': 3, 'ps.played': 12, 'fx.title': 2, 'fx.days': 12, 'daily.streak': 8 },
  days: Object.fromEntries(Array.from({ length: 13 }, (_, k) => ['2025-02-' + String(k + 1).padStart(2, '0'), 2])) };

const browser = await pw.chromium.launch({ executablePath: CHROME });
try {
  head('6. THE FIVE SPOTS STAND ON THE TILTED FLOOR, TO A PIXEL');
  for (const [w, h] of [[390, 844], [360, 740], [1280, 900]]) {
    const { ctx, page, boom } = await open(browser, w, h);
    await toDraft(page);
    const lines = await page.evaluate(() => ['h-court', 'court', 'o-court'].map((id) => {
      const svg = document.querySelector('#' + id + ' .lines-svg');
      const l = svg && svg.querySelector('.l');
      return !!svg && !!l && getComputedStyle(l).vectorEffect === 'non-scaling-stroke' && parseFloat(getComputedStyle(l).strokeWidth) >= 1.4;
    }));
    claim(lines.every(Boolean), `${w}x${h}: all three courts carry the lines, at a weight that does not stretch`, lines.join(','));
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

  head('8. A CHOICE THE ACCOUNT CANNOT BACK FALLS BACK TO THE HIGHEST RUNG IT HAS REACHED');
  {
    const pick = (id) => ({ 'rtf.arena.v1': JSON.stringify({ u1: id }) });
    const ask = (page) => page.evaluate(() => {
      window.RTF_PAGE.arenaChanged();
      const info = window.RTF_PAGE.arena.info();
      return { cur: window.RTF_PAGE.arena.current(), best: window.RTF_COURTS.best(info), badges: info.badges };
    });
    let o = await open(browser, 390, 844, { acct: 'u1', career: RICH, ls: pick('boardwalk') });
    await o.page.waitForTimeout(200);
    let r = await ask(o.page);
    claim(!['blacktop', 'boardwalk'].includes(r.best), `the fixture career has climbed past the street (${r.best}, ${r.badges} badges)`);
    claim(r.cur === 'boardwalk', 'an account plays in the arena it chose when it can back it', r.cur);
    await o.page.evaluate(() => { window.__acct = null; window.__authCb && window.__authCb(); });
    claim(await o.page.evaluate(() => window.RTF_PAGE.arena.current()) === 'blacktop', 'signed out, the same browser draws the Blacktop');
    /* Another account does not wear the first one's choice. Which rung it
       reaches is its own career's, which the cloud save swaps in on sign in and
       this stand-in does not, so the claim is about the choice. */
    await o.page.evaluate(() => { window.__acct = 'u2'; window.__authCb && window.__authCb(); });
    r = await ask(o.page);
    claim(r.cur !== 'boardwalk' && r.cur === r.best, 'another account on it does not wear that choice', r.cur);
    await o.ctx.close();
    for (const [ls, what] of [[{}, 'no choice at all'], [pick('banners'), 'a stored arena the account has not earned'],
      [pick('neon'), 'a Pro arena on an account without Pro']]) {
      o = await open(browser, 390, 844, { acct: 'u1', career: RICH, ls });
      await o.page.waitForTimeout(200);
      r = await ask(o.page);
      claim(r.cur === r.best, `${what} plays on the highest rung reached (${r.cur})`);
      await o.ctx.close();
    }
    o = await open(browser, 390, 844, { acct: 'u1', career: Object.assign({}, RICH, { runs: 0, days: {} }) });
    await o.page.waitForTimeout(200);
    claim((await ask(o.page)).cur === 'blacktop', 'and a signed in account with nothing played starts on the Blacktop');
    await o.ctx.close();
  }

  head('9. THE LOCKER: THE JERSEY, THE CAMERA AND THE SHELF');
  {
    const { ctx, page, boom } = await open(browser, 390, 844, { acct: 'u1', career: RICH });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.RTF_PAGE.openProfile());
    await page.click('#pt-locker');
    const shelf = await page.evaluate(() => ({
      cards: document.querySelectorAll('#lk-arenas .ar-card').length,
      open: document.querySelectorAll('#lk-arenas .ar-card:not(.lock)').length,
      earned: window.RTF_COURTS.unlockedIds(window.RTF_PAGE.arena.info()).length,
      reqs: document.querySelectorAll('#lk-arenas .ar-card.lock .reqs span').length,
      kits: document.querySelectorAll('#lk-kits .sw').length,
      owned: [...document.querySelectorAll('#lk-kits .sw:not(.lock)')].map((b) => b.dataset.kit),
      shown: !document.querySelector('#pf-locker').hidden && document.querySelector('#pf-list').hidden,
    }));
    claim(shelf.shown, 'the Locker tab shows the locker and hides the record');
    claim(shelf.cards === CT.ARENAS.length && shelf.open === shelf.earned && shelf.open > 2,
      `every arena on the shelf, and the ${shelf.earned} this career earned open (${shelf.open})`);
    claim(shelf.reqs >= 3, `a locked card lists each thing it still wants (${shelf.reqs} parts)`);
    claim(shelf.kits === 31 && shelf.owned.join() === 'house,BOS', `the house colors and every club, with the club played in One Franchise open (${shelf.owned})`);
    await page.click('#lk-kits .sw[data-kit="LAL"]');
    claim(await page.evaluate(() => !document.querySelector('#lk-kits .sw[data-kit="LAL"]').classList.contains('on')),
      'a locked club cannot be worn');
    await page.click('#lk-kits .sw[data-kit="BOS"]');
    await page.fill('#lk-num', '33');
    const id = await page.evaluate(() => document.querySelector('#pf-id').textContent);
    claim(/Celtics colors/.test(id) && /#33/.test(id), 'wearing the Celtics and number 33 is what the identity row says', id);
    await page.click('#lk-arenas [data-use="blacktop"]');
    claim(await page.evaluate(() => window.RTF_PAGE.arena.current() === 'blacktop' &&
      document.querySelector('#court').getAttribute('data-arena') === 'blacktop'), 'Play here puts the court in that arena, and back on the Blacktop is a choice');
    await page.click('.seg [data-cam="top"]');
    claim(await page.evaluate(() => !document.querySelector('#court').classList.contains('tq')), 'the camera switch reaches the court');
    claim(!boom.length, 'nothing threw', boom.join(' | '));
    await ctx.close();
  }

  head('10. A DAY PLAYED IN A MODE COUNTS, AND AN ARENA IT OPENS IS SAID');
  {
    /* The Rooftop wants 15 runs, 10 badges and 3 different days. The fixture
       has the runs and the badges and two days long past, so the day a mode is
       played on is the one that opens it. */
    const career = Object.assign({}, RICH, { runs: 15, rings: 0, playoffs: 5, days: { '2025-01-01': 1, '2025-01-02': 1 } });
    const { ctx, page } = await open(browser, 390, 844, { acct: 'u1', career });
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => {
      const info = window.RTF_PAGE.arena.info();
      return { badges: info.badges, roof: window.RTF_COURTS.status(window.RTF_COURTS.BY_ID.rooftop, info).ok,
        rec: window.RTF_COURTS.status(window.RTF_COURTS.BY_ID.rec, info).ok };
    });
    claim(before.badges >= 10 && !before.roof && !before.rec, `the fixture is one day short of the Rooftop (${before.badges} badges)`);
    const said = await page.evaluate(async () => {
      const seen = [];
      const mo = new MutationObserver(() => seen.push(document.body.innerText.match(/Arena unlocked: [^\n]+/)?.[0]));
      mo.observe(document.body, { subtree: true, childList: true, characterData: true });
      window.RTF_PAGE.feats({ max: { 'cq.best': 1 } });
      await new Promise((r) => setTimeout(r, 6500));
      mo.disconnect();
      return seen.filter(Boolean);
    });
    claim(said.some((s) => /The Rooftop/.test(s)), 'a Conquest game on a third day names the Rooftop', said.join(' | ') || 'nothing said');
    const days = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('runthefloor_career_v1')).days || {}).length);
    claim(days === 3, `and the career now counts three days (${days})`);
    await ctx.close();
  }

  head('11. THE PROFILE IS THE ACCOUNT\'S: READ ON SIGN IN, WRITTEN ON EVERY CHOICE');
  {
    const career = RICH;
    const row = { jersey_club: 'BOS', jersey_num: '33', arena: 'boardwalk', camera: 'top',
      last_club: 'LAL', last_era: 'eighties', guide_seen: true };
    let o = await open(browser, 390, 844, { acct: 'u1', career, row });
    await o.page.waitForTimeout(400);
    const got = await o.page.evaluate(() => ({
      arena: window.RTF_PAGE.arena.current(), camera: window.RTF_PAGE.arena.camera(),
      club: localStorage.getItem('rtf.club.v1'), era: localStorage.getItem('rtf.era.v1'),
      look: JSON.parse(localStorage.getItem('rtf.look.v1') || '{}').u1,
      tq: document.querySelector('#court').classList.contains('tq') }));
    claim(got.arena === 'boardwalk' && got.camera === 'top' && !got.tq, 'a fresh browser draws the arena and camera the account holds', JSON.stringify(got));
    claim(got.look && got.look.club === 'BOS' && got.look.num === '33', 'and wears the account\'s jersey');
    claim(got.club === 'LAL' && got.era === 'eighties', 'and its One Franchise and Decades doors remember the account\'s picks');
    await o.page.evaluate(() => window.RTF_PAGE.openProfile());
    await o.page.click('#pt-locker');
    await o.page.click('#lk-arenas [data-use="blacktop"]');
    await o.page.click('.seg [data-cam="tq"]');
    await o.page.fill('#lk-num', '7');
    const sent = await o.page.evaluate(() => window.__sent);
    claim(sent.some((f) => f.arena === 'blacktop') && sent.some((f) => f.camera === 'tq') && sent.some((f) => f.num === '7'),
      'every choice in the Locker is written to the account as it is made', JSON.stringify(sent));
    await o.ctx.close();
    /* A browser holding choices the account has never heard of sends them up. */
    o = await open(browser, 390, 844, { acct: 'u1', career, row: {},
      ls: { 'rtf.arena.v1': JSON.stringify({ u1: 'boardwalk' }), 'rtf.look.v1': JSON.stringify({ u1: { club: 'BOS', num: '12' } }),
        'rtf.cam.v1': 'top', 'rtf.club.v1': 'CHI' } });
    await o.page.waitForTimeout(400);
    const up = await o.page.evaluate(() => Object.assign({}, ...window.__sent));
    claim(up.arena === 'boardwalk' && up.club === 'BOS' && up.num === '12' && up.camera === 'top' && up.lastClub === 'CHI',
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
