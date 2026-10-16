/* The whole-game boost check: from an item's boost to the golfer's stats, the overall, the sim and every
 * screen that shows them.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-boosts.mjs
 *   node golf/check-boosts.mjs --record      write golf/boosts-baseline.json (refuses to replace one)
 *
 *   FROZEN    every boost in the baseline of 2026-10-16 is still there, on the same stats, never lower
 *             (the owner's boost rule). New items and raised boosts pass.
 *   EVERY     each item with a boost, worn alone on a flat 80 golfer, moves exactly its own stats by exactly
 *             its boost, and an item that is not owned moves nothing.
 *   STACK     a full closet adds up to the sum of its items, through the caps (+ACC_SKILL_CAP a stat,
 *             +ACC_TOTAL_CAP in all, the largest trimmed first), and the club level bonus lands on top.
 *   OVR       the overall the page computes is the formula's, gear on or off, for random golfers.
 *   WHERE     boosts reach the career and the opt-in exhibition Head to Head, and never the Daily, ranked
 *             Head to Head, or anything a board ranks on skills.
 *   SIM       the golfer the season sim plays is the golfer the screens show, even when the closet changes
 *             mid-season, and match play reads the same golfer.
 *   SCREENS   the build and draft screens, the radar, the closet, the player card, the bracket, Head to
 *             Head and the share card each show the boosted number the sim plays.
 *   MILESTONE the World No.1 Cap, Major Marker Ball and Legend's Driver are closet items with their milestone's
 *             boost, priced 0 (never in a pack), owned once the milestone is. The two charms stay data only.
 *   OVER 99   an all-99 golfer in the strongest closet: the sim plays every round to a finite score and
 *             beats the 99, and every number above shows in full at 390x844 and 1440x900 with nothing
 *             clipped, wrapped or past its track.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = process.env.HOST || 'http://localhost:8099';
const BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'boosts-baseline.json');
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 300) : '')); };
const info = (n, x) => console.log('  info ' + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 300) : ''));
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

// a fixture the page carries for the length of the check: sign in, own things, set a draft, dress the golfer
const FIX = () => {
  window.__B = {
    init() {
      try { localStorage.clear(); } catch (e) {}
      sbUser = { id: 'boostcheck', email: 'boost@example.com' }; sbUsername = 'boostcheck';
      try { cloudPush = function () {}; } catch (e) {}
      try { toast = function () {}; } catch (e) {}
      try { track = function () {}; } catch (e) {}
      S.daily = false; S.career = null; S.overlay = null; S.look = Object.assign({}, DEFLOOK);
    },
    own(keys) { const s = coinState(); keys.forEach((k) => { s.owned[k] = 1; }); coinSave(s); },
    raw(v) { CATS.forEach((c) => { S.slots[c.k] = { golfer: 'G' + c.k, value: typeof v === 'number' ? v : v[c.k] }; }); },
    // the club with no boost (a pass club today), so a closet can be bare
    bareClub() { const c = CLUBS.find((x) => !cosBoost('club', x.id)); return c ? c.id : null; },
    naked() { const bc = this.bareClub(); if (bc) this.own(['cl:' + bc]);
      S.look = Object.assign({}, DEFLOOK, { cap: false, hatStyle: 'cap', eyewear: 'none', shirtPat: 'none', putter: 'stock', club: bc || 'driver', ball: 'none', cleats: 'none', caddie: '' }); },
    // what finished collections add (setBoostRows), the same whatever is worn
    sets() { const o = {}; setBoostRows().forEach((r) => { for (const k in r.b) o[k] = (o[k] || 0) + r.b[k]; }); return o; },
    boosted() { const out = []; COS_CATS.forEach((c) => (cosmeticItems(c.k) || []).forEach((o) => { if (o.id === 'none') return; const b = cosBoost(c.k, o.id); if (b) out.push({ cat: c.k, id: o.id, key: cosKey(c.k, o.id), b: Object.assign({}, b) }); })); return out; },
    wear(cat, id) { cosEquip(cat, id); if (cat === 'hw') { S.look.cap = true; S.look.hatStyle = id; } },
    stats() { const p = buildPlayer(); const o = {}; CATS.forEach((c) => { o[c.k] = p[c.k]; }); return { st: o, ovr: p.skill, gear: !!p._gear }; },
  };
};

// every boost table the game has, keyed so a baseline can be compared field by field
const TABLES = () => {
  const t = {};
  for (const k in COS_BOOST) t['cos ' + k] = Object.assign({}, COS_BOOST[k]);
  CLUBS.forEach((c) => { if (c.b && Object.keys(c.b).length) t['club ' + c.id] = Object.assign({}, c.b); });
  PUTTERS.forEach((p) => { if (p.b && Object.keys(p.b).length) t['putter ' + p.id] = Object.assign({}, p.b); });
  BAG_CLUBS.forEach((c) => c.tiers.forEach((ti, i) => { t['bag ' + c.k + ' ' + (i + 1)] = Object.assign({}, ti.b); }));
  ACCESSORIES.forEach((a) => { t['acc ' + a.id] = Object.assign({}, a.boost); });
  MILESTONE_ITEMS.forEach((a) => { t['milestone ' + a.id] = Object.assign({}, a.boost); });
  CADDIES.forEach((c) => { const p = c.power || {}; if (p.base) t['caddie ' + c.id] = Object.assign({}, p.base);
    if (p.major) t['caddie ' + c.id + ' major'] = Object.assign({}, p.major); if (p.venue) t['caddie ' + c.id + ' venue'] = Object.assign({}, p.venue.d); });
  return t;
};

const capRef = (sum, sc, tc) => { const o = {}; for (const k in sum) { const v = Math.max(-sc, Math.min(sc, sum[k])); if (v) o[k] = v; }
  let t = Object.values(o).reduce((a, b) => a + b, 0);
  while (t > tc) { let mk = null; for (const k in o) if (o[k] > 0 && (mk === null || o[k] > o[mk])) mk = k; if (mk === null) break; o[mk]--; if (!o[mk]) delete o[mk]; t--; }
  return o; };
const plusSets = (o, sets) => { const r = Object.assign({}, o); for (const k in sets || {}) r[k] = (r[k] || 0) + sets[k]; return r; };
const same = (a, b) => { const ka = Object.keys(a).filter((k) => a[k]), kb = Object.keys(b).filter((k) => b[k]); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };

const b = await chromium.launch();
const errs = [];
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/supabase|googlesyndication|google-analytics|googletagmanager|jsdelivr/, (r) => r.abort());
  await page.goto(HOST + '/golf/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof buildPlayer === 'function' && typeof accBoost === 'function', null, { timeout: 30000 });
  await page.evaluate(FIX);
  const C = await page.evaluate(() => ({ sc: ACC_SKILL_CAP, tc: ACC_TOTAL_CAP, keys: CATS.map((c) => c.k), w: Object.fromEntries(CATS.map((c) => [c.k, c.w])),
    K: OVR_IMBALANCE_K, DD: OVR_DEADBAND, REP: REPLACEMENT }));

  /* ------------------------------------------------------------------ FROZEN */
  head('FROZEN: no boost of 2026-10-16 is lowered, removed or moved');
  const now = await page.evaluate(TABLES);
  if (process.argv.includes('--record')) {
    if (fs.existsSync(BASE)) { console.log('  a baseline exists; it is the record of 2026-10-16 and is never replaced'); process.exit(1); }
    fs.writeFileSync(BASE, JSON.stringify({ recorded: '2026-10-16', rule: 'The owner\'s boost rule: never lower, remove, move or re-stat a boost in this file.', boosts: now }, null, 1) + '\n');
    console.log('  recorded', Object.keys(now).length, 'boosts'); process.exit(0);
  }
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8')).boosts;
  const lost = [];
  for (const k in base) { const was = base[k], is = now[k];
    if (!is) { lost.push(k + ' removed'); continue; }
    for (const s in was) { if (is[s] == null) lost.push(k + ' lost ' + s); else if (is[s] < was[s]) lost.push(k + ' ' + s + ' ' + was[s] + ' -> ' + is[s]); } }
  ok(Object.keys(base).length + ' recorded boosts all stand, none lower', lost.length === 0, lost);
  const added = Object.keys(now).filter((k) => !base[k] || Object.keys(now[k]).some((s) => (now[k][s] || 0) > (base[k][s] || 0)));
  info('new or raised since the baseline', added.length);

  /* ------------------------------------------------------------------ EVERY */
  head('EVERY: each item alone moves exactly its own boost');
  const every = await page.evaluate(() => {
    __B.init(); __B.raw(80);
    const items = __B.boosted(); __B.own(items.map((i) => i.key));
    const rows = items.map((it) => { __B.naked(); const before = __B.stats(); __B.wear(it.cat, it.id);
      const after = __B.stats(), ab = accBoost(), moved = {};
      for (const k in after.st) if (after.st[k] !== before.st[k]) moved[k] = after.st[k] - before.st[k];
      return { key: it.key, b: it.b, moved, ab: Object.assign({}, ab), sets: __B.sets() }; });
    // an item worn but not owned gives nothing
    __B.init(); __B.raw(80); __B.naked(); const it = items.find((i) => i.cat === 'hw' && !FREE_COSMETICS[i.key]); const s0 = __B.stats();
    if (it) __B.wear(it.cat, it.id); const s1 = __B.stats();
    return { rows, bare: __B.bareClub(), unowned: { key: it && it.key, same: JSON.stringify(s0.st) === JSON.stringify(s1.st) } };
  });
  ok('a bare closet exists (a club with no boost)', !!every.bare, every.bare);
  const miss = every.rows.filter((r) => !same(r.moved, capRef(r.b, C.sc, C.tc)) || !same(r.ab, plusSets(capRef(r.b, C.sc, C.tc), r.sets)));
  ok(every.rows.length + ' boost items each reach the golfer exactly', miss.length === 0, miss.slice(0, 6).map((r) => r.key + ' carries ' + JSON.stringify(r.b) + ' moved ' + JSON.stringify(r.moved)));
  const byCat = {}; every.rows.forEach((r) => { const c = r.key.split(':')[0]; byCat[c] = (byCat[c] || 0) + 1; });
  info('boost items by closet slot', byCat);
  ok('an item that is not owned moves nothing', every.unowned.same, every.unowned.key);

  /* ------------------------------------------------------------------ STACK */
  head('STACK: a full closet is the sum of its items, through the caps');
  const stack = await page.evaluate((n) => {
    __B.init(); const items = __B.boosted(); __B.own(items.map((i) => i.key));
    const by = {}; items.forEach((i) => { (by[i.cat] = by[i.cat] || []).push(i); });
    let seed = 7; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const out = [];
    for (let t = 0; t < n; t++) {
      __B.naked(); const worn = [];
      Object.keys(by).forEach((cat) => { if (R() < 0.2) return; const it = by[cat][Math.floor(R() * by[cat].length)]; __B.wear(it.cat, it.id); worn.push(it); });
      const sum = {}; worn.forEach((i) => { for (const k in i.b) sum[k] = (sum[k] || 0) + i.b[k]; });
      const rows = cosmeticBoostRows().length + bagBoostRows().length;
      out.push({ worn: worn.map((i) => i.key), sum, ab: Object.assign({}, accBoost()), rows, sets: __B.sets() }); }
    // the club level bonus: 45 reps on the worn club is level 9, +3 on its primary stat
    __B.naked(); const club = items.find((i) => i.cat === 'club' && Object.keys(i.b).length === 1); __B.wear('club', club.id);
    S.career = { clubReps: { [club.id]: 45 } }; const lv = Object.assign({}, accBoost()); S.career = null;
    return { out, lv, club, sets: __B.sets() };
  }, 300);
  const sbad = stack.out.filter((t) => !same(t.ab, plusSets(capRef(t.sum, C.sc, C.tc), t.sets)) || t.rows !== t.worn.length);
  ok('300 random closets match the capped sum and list every worn item', sbad.length === 0, sbad.slice(0, 3));
  const lvSum = Object.assign({}, stack.club.b); const pk = Object.keys(lvSum)[0]; lvSum[pk] += 3;
  ok('a level 9 club adds +3 on its primary stat', same(stack.lv, plusSets(capRef(lvSum, C.sc, C.tc), stack.sets)), { club: stack.club.key, got: stack.lv });
  const capHit = stack.out.filter((t) => Object.values(t.sum).reduce((a, x) => a + x, 0) > C.tc).length;
  info('closets past the +' + C.tc + ' total cap', capHit + ' of 300');

  /* ------------------------------------------------------------------ OVR */
  head('OVR: the overall moves the way its formula says');
  const ovrRef = (sk, over) => { const v = C.keys.map((k) => sk[k] != null ? sk[k] : C.REP);
    const wm = C.keys.reduce((s, k, i) => s + v[i] * C.w[k], 0), mean = v.reduce((a, x) => a + x, 0) / v.length;
    const below = v.filter((x) => x < mean).map((x) => mean - x); const dd = below.length ? Math.sqrt(below.reduce((a, x) => a + x * x, 0) / v.length) : 0;
    return Math.max(40, Math.min(over ? 112 : 99, wm - C.K * Math.max(0, dd - C.DD))); };
  const ovrs = await page.evaluate((n) => {
    __B.init(); const items = __B.boosted(); __B.own(items.map((i) => i.key)); const by = {}; items.forEach((i) => { (by[i.cat] = by[i.cat] || []).push(i); });
    let seed = 11; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const out = []; for (let t = 0; t < n; t++) { const raw = {}; CATS.forEach((c) => { raw[c.k] = 60 + Math.floor(R() * 40); }); __B.raw(raw); __B.naked();
      if (t % 3) Object.keys(by).forEach((cat) => { const it = by[cat][Math.floor(R() * by[cat].length)]; __B.wear(it.cat, it.id); });
      const s = __B.stats(); out.push({ st: s.st, ovr: s.ovr, gear: true }); }   // a career golfer may read past 99
    return out; }, 200);
  const obad = ovrs.filter((o) => Math.abs(o.ovr - ovrRef(o.st, o.gear)) > 1e-9);
  ok('200 career golfers: overall = weighted mean less the imbalance penalty, ceiling 112', obad.length === 0, obad.slice(0, 2));
  ok('every overall is a finite number', ovrs.every((o) => Number.isFinite(o.ovr)));

  /* ------------------------------------------------------------------ WHERE */
  head('WHERE: career and exhibition get the gear; the Daily and ranked never do');
  const where = await page.evaluate(() => {
    __B.init(); __B.raw(80); const items = __B.boosted(); __B.own(items.map((i) => i.key)); __B.naked();
    const hw = items.find((i) => i.cat === 'hw'); __B.wear(hw.cat, hw.id); const ab = Object.assign({}, accBoost());
    const career = __B.stats().st;
    S.daily = true; const daily = __B.stats().st; S.daily = false;
    S.h2h = S.h2h || {}; S.h2h.slots = {}; CATS.forEach((c) => { S.h2h.slots[c.k] = { golfer: 'H', value: 80 }; });
    S.h2h.seed = H2H_BOOST_MAX + 5; const ranked = h2hSkills();
    S.h2h.seed = 5; const exh = h2hSkills();
    return { ab, career, daily, ranked, exh, hw: hw.key };
  });
  const plus = (o) => { const r = {}; for (const k in o) if (o[k] !== 80) r[k] = o[k] - 80; return r; };
  ok('career: the worn ' + where.hw + ' reaches the golfer', same(plus(where.career), where.ab), plus(where.career));
  ok('Daily: no gear', Object.keys(plus(where.daily)).length === 0, plus(where.daily));
  ok('ranked Head to Head: no gear', Object.keys(plus(where.ranked)).length === 0, plus(where.ranked));
  ok('exhibition Head to Head (opt in, off the record): gear on', same(plus(where.exh), where.ab), plus(where.exh));

  /* ------------------------------------------------------------------ SETS */
  head('SETS: a finished collection is +1 on its stat, on top of the capped gear');
  const sets = await page.evaluate(() => {
    __B.init(); __B.raw(80); const items = __B.boosted(); __B.own(items.map((i) => i.key)); __B.naked();
    const out = {};
    for (const id in COLLECTION_SETS) { const d = dropById(id); const k = COLLECTION_SETS[id];
      __B.init(); __B.raw(80); __B.naked();
      const keys = d.items.map((ci) => cosKey(ci[0], ci[1])); __B.own(keys.slice(0, -1)); const part = __B.stats().st[k];
      __B.own(keys); const full = __B.stats().st[k];
      out[id] = { stat: k, part, full, n: keys.length }; }
    // with the gear cap binding, the set still lands on top: wear the strongest putting closet, then finish Haunted Links
    __B.init(); __B.raw(80); __B.own(items.map((i) => i.key)); __B.naked();
    ['hw:halo', 'ew:prismshades', 'pu:goldplated', 'cl:wand', 'bl:marble'].forEach((k) => { const it = items.find((i) => i.key === k); if (it) __B.wear(it.cat, it.id); });
    const capped = __B.stats().st.put, capLabel = accBoostSummaryNode().textContent; __B.own(dropById('spooky').items.map((ci) => cosKey(ci[0], ci[1]))); const over = __B.stats().st.put;
    S.setupEdit = true; S.screen = 'setup'; S.overlay = null; render();
    const listed = [...document.querySelectorAll('.cb-row')].map((e) => e.textContent.trim());
    return { out, capped, over, listed, capLabel, eight: Object.keys(COLLECTION_SETS).length, stats: new Set(Object.values(COLLECTION_SETS)).size };
  });
  ok('eight collections cover eight different stats', sets.eight === 8 && sets.stats === 8, sets);
  const sbad2 = Object.entries(sets.out).filter(([, v]) => v.part !== 80 || v.full !== 81);
  ok('each collection adds +1 on its stat only when every piece is owned', sbad2.length === 0, sbad2.slice(0, 3));
  ok('the closet says which cap bit (a stat over +' + C.sc + ')', new RegExp('capped at \\+' + C.sc + ' a stat').test(sets.capLabel), sets.capLabel.slice(0, 120));
  ok('a set lands on top of a gear cap that already binds (Putting ' + sets.capped + ' then ' + sets.over + ')', sets.capped === 85 && sets.over === 86, sets);

  /* ------------------------------------------------------------------ PAST 99 */
  head('PAST 99: a caddie and coaching carry a stat past 99 in the career, never in the Daily');
  const past = await page.evaluate(() => {
    __B.init(); __B.raw(98); __B.naked();
    const keep = caddieUnlocked; caddieUnlocked = () => true;
    const cad = CADDIES.find((c) => c.power && c.power.base && c.power.base.app === 2); S.look.caddie = cad.id;
    const career = __B.stats(); S.daily = true; const daily = __B.stats(); S.daily = false;
    S.look.caddie = ''; caddieUnlocked = keep;
    S.career = { fx: [{ k: 'skill', skill: 'put', amt: 3, ev: 5, label: 'Coaching', tone: 'good' }] }; const fx = __B.stats(); S.career = null;
    return { cad: cad.id, career: career.st.app, careerOvr: career.ovr, daily: daily.st.app, fx: fx.st.put };
  });
  ok('a +2 Approach caddie on a 98 reads 100 in the career (' + past.cad + ')', past.career === 100, past);
  ok('and 99 in the Daily, as always', past.daily === 99, past.daily);
  ok('+3 coaching on a 98 reads 101', past.fx === 101, past.fx);

  /* ------------------------------------------------------------------ SIM */
  head('SIM: the golfer the season plays is the golfer the screens show');
  const sim = await page.evaluate(() => {
    __B.init(); reset(); __B.init();
    S.name = 'Boost Check'; S.year = 2; S.careerSeed = 20261016; __B.raw(90);
    S.career = { firsts: { dilemma: 1, storyline: 1 }, arcs: [], seasons: [], wins: 0, story: { feed: [], followers: 1000, confidence: null, seenDil: {}, dilSeason: 0 } };
    const items = __B.boosted(); __B.own(items.map((i) => i.key)); __B.naked();
    ensureWorld(); startSeason(); S.evtIndex = 0;
    // the closet changes after the season started: the next event must play the new golfer
    const hw = items.find((i) => i.cat === 'hw' && i.b.clu); __B.wear(hw.cat, hw.id);
    const shown = __B.stats();
    let played = null; try { beginEvent(); const me = S.curEvt.players.find((o) => o.p.you); played = {}; CATS.forEach((c) => { played[c.k] = me.p[c.k]; }); } catch (e) { played = { err: String(e) }; }
    return { shown: shown.st, played, hw: hw.key };
  });
  ok('a hat put on mid-season plays in the next event (' + sim.hw + ')', JSON.stringify(sim.shown) === JSON.stringify(sim.played), { shown: sim.shown, played: sim.played });
  const fx = await page.evaluate(() => {
    __B.init(); reset(); __B.init(); S.name = 'Boost Check'; S.year = 2; S.careerSeed = 20261016; __B.raw(90); __B.naked();
    S.career = { firsts: { dilemma: 1, storyline: 1 }, arcs: [], seasons: [], wins: 0, story: { feed: [], followers: 1000, confidence: null, seenDil: {}, dilSeason: 0 },
      fx: [{ k: 'skill', skill: 'put', amt: 3, ev: 5, label: 'Coaching', tone: 'good' }] };
    ensureWorld(); startSeason(); S.evtIndex = 0;
    const shown = buildPlayer().put; beginEvent(); const me = S.curEvt.players.find((o) => o.p.you);
    const ew = eventWeights(S.curEvt.evt), base = eventOverall(me.p, ew) + caddieEventEo(ew, S.curEvt.evt.name, S.curEvt.evt.major);
    return { shown, played: me.p.put, fxEo: careerFxEo(ew), extra: me.eo - base - confEo() };
  });
  ok('a coaching boost shows on the golfer and reaches the sim once, as its event bonus', fx.shown === 93 && fx.played === 90 && Math.abs(fx.extra - fx.fxEo) < 1e-9, fx);
  const best = await page.evaluate(() => {
    __B.init(); __B.raw(80); const items = __B.boosted(); __B.own(items.map((i) => i.key)); __B.naked();
    const keep = render; render = function () {};
    try { closetBestOutfit(); } finally { render = keep; } const want = items.filter((i) => i.cat === 'putter').sort((a, b) => Object.values(b.b).reduce((x, y) => x + y, 0) - Object.values(a.b).reduce((x, y) => x + y, 0))[0];
    return { putter: puttEquippedId(), want: want.id, rows: cosmeticBoostRows().map((r) => r.cat + ':' + r.id) };
  });
  ok('Best outfit wears the strongest putter too', best.putter === best.want, best);

  /* ------------------------------------------------------------------ SCREENS */
  // a golfer whose boosted stats are all different from the raw ones, and an all-99 golfer in the
  // strongest closet for the over-99 pass
  const dress = async (raw, best, allSets) => page.evaluate(([raw, best, allSets]) => {
    __B.init(); reset(); __B.init(); S.name = 'Boost Check'; __B.raw(raw);
    const items = __B.boosted(); __B.own(items.map((i) => i.key)); __B.naked();
    if (allSets) for (const id in COLLECTION_SETS) __B.own(dropById(id).items.map((ci) => cosKey(ci[0], ci[1])));
    best.forEach((k) => { const it = items.find((i) => i.key === k); if (it) __B.wear(it.cat, it.id); });
    const s = __B.stats(); return { st: s.st, ovr: Math.round(s.ovr), ab: Object.assign({}, accBoost()) };
  }, [raw, best, !!allSets]);
  const readScreens = async () => page.evaluate(() => {
    const R = {}; const num = (el) => el ? +String(el.textContent).replace(/[^0-9]/g, '') : null;
    S.overlay = null; S.screen = 'build'; render();
    R.buildChip = num(document.querySelector('.ovrchip b'));
    R.buildSlots = [...document.querySelectorAll('.slot .v')].map(num);
    const rt = [...document.querySelectorAll('svg text')].find((t) => t.nextElementSibling && /OVR/.test(t.nextElementSibling.textContent || '')) || [...document.querySelectorAll('svg text')].reverse().find((t) => /^\d+$/.test(t.textContent));
    R.radar = num(rt);
    S.screen = 'draft'; render(); R.draftChip = num(document.querySelector('.ovrchip b'));
    S.setupEdit = true; S.screen = 'setup'; render();
    R.closet = {}; document.querySelectorAll('.cb-row').forEach((e) => { const m = /([+-]\d+)\s+(.+)/.exec(e.textContent.trim()); if (m) R.closet[m[2]] = +m[1]; });
    S.screen = 'build'; render();
    try { openPlayerCardSelf(); R.card = num(document.querySelector('.pcovr b')); document.querySelectorAll('.ov,.pcov,[class*="pcard"]').forEach((e) => { if (e.closest('#app') === null) e.remove(); }); } catch (e) { R.card = 'err ' + e; }
    R.bracket = bracketOvr({ p: buildPlayer() });
    S.h2h = S.h2h || {}; S.h2h.slots = {}; CATS.forEach((c) => { S.h2h.slots[c.k] = { golfer: 'H', value: S.slots[c.k].value }; }); S.h2h.seed = 5;
    R.h2h = h2hOvr(); R.h2hWant = Math.round(ovrFromSkills(h2hSkills(), accBoostTotal() > 0));
    { const ov = String(Math.round(buildPlayer().skill)), w = ovrShieldW(ov); R.share = { full: PIXK.textW(ov, { scale: 2, bold: true }) <= w - 4 && 206 - w >= 150 }; }
    R.rshort = Object.fromEntries(CATS.map((c) => [RSHORT[c.k] || c.k, c.k]));
    return R;
  });
  const checkScreens = (label, d, R) => {
    ok(label + ' build chip shows ' + d.ovr, R.buildChip === d.ovr, R.buildChip);
    ok(label + ' build slots show the boosted stats', JSON.stringify(R.buildSlots) === JSON.stringify(C.keys.map((k) => d.st[k])), R.buildSlots);
    ok(label + ' radar centre shows ' + d.ovr, R.radar === d.ovr, R.radar);
    ok(label + ' draft chip shows ' + d.ovr, R.draftChip === d.ovr, R.draftChip);
    const cl = {}; for (const n in R.closet) cl[R.rshort[n] || n] = R.closet[n];
    ok(label + ' closet boost list is the applied boost', same(cl, d.ab), R.closet);
    ok(label + ' player card shows ' + d.ovr, R.card === d.ovr, R.card);
    ok(label + ' bracket shows ' + d.ovr, R.bracket === d.ovr, R.bracket);
    ok(label + ' exhibition Head to Head shows its geared overall', R.h2h === R.h2hWant, { shows: R.h2h, plays: R.h2hWant });
    ok(label + ' share card prints the overall at full size', R.share.full, d.ovr);
  };
  head('SCREENS: every screen shows the number the sim plays');
  const mid = await dress({ dist: 86, acc: 84, app: 88, sht: 83, scr: 82, bnk: 81, put: 89, clu: 85 }, ['hw:halo', 'ew:monocle', 'cl:wand', 'pu:goldplated']);
  info('geared golfer', mid);
  checkScreens('geared:', mid, await readScreens());
  info('the bag tag on the First Tee carries no rating (name, rank, wins, streak)');

  /* ------------------------------------------------------------------ OVER 99 */
  head('OVER 99: the strongest closet on an all-99 golfer');
  const top = await page.evaluate(() => {
    __B.init(); const items = __B.boosted(); __B.own(items.map((i) => i.key)); __B.raw(99);
    for (const id in COLLECTION_SETS) __B.own(dropById(id).items.map((ci) => cosKey(ci[0], ci[1])));   // every set finished
    // the strongest closet: coordinate ascent on the page's own overall
    const slots = {}; items.forEach((i) => { (slots[i.cat] = slots[i.cat] || [null]).push(i); });
    __B.naked(); let best = buildPlayer().skill; const pick = {};
    for (let pass = 0; pass < 3; pass++) for (const cat in slots) for (const it of slots[cat]) {
      __B.naked(); for (const c in pick) if (c !== cat && pick[c]) __B.wear(c, pick[c].id); if (it) __B.wear(cat, it.id);
      const o = buildPlayer().skill; if (o > best + 1e-9) { best = o; pick[cat] = it; } }
    __B.naked(); for (const c in pick) if (pick[c]) __B.wear(c, pick[c].id);
    return { pick: Object.values(pick).filter(Boolean).map((i) => i.key), ovr: buildPlayer().skill };
  });
  const big = await dress(99, top.pick, true);
  info('strongest closet', { pick: top.pick, ovr: big.ovr, st: big.st });
  ok('the overall passes 99', big.ovr > 99, big.ovr);
  ok('a stat passes 99', Math.max(...Object.values(big.st)) > 99, big.st);
  const play = await page.evaluate((st) => {
    S.career = {}; S.year = 1; S.careerSeed = 20261016; RNG = Math.random;
    const sched = seasonSchedule(1, 20261016), roster = worldField(FIELDSIZE - 1); let nan = 0, best = 99, sum99 = 0, sumG = 0, n = 0;
    const raw = {}; CATS.forEach((c) => { raw[c.k] = 99; });
    for (let s = 0; s < 30; s++) sched.forEach((evt) => { const ew = eventWeights(evt);
      for (let r = 0; r < 4; r++) { const a = simRound(eventOverall(raw, ew), raw.clu, { major: evt.major, finalRd: r === 3, courseAdj: 0 });
        const g = simRound(eventOverall(st, ew), st.clu, { major: evt.major, finalRd: r === 3, courseAdj: 0 });
        if (!Number.isFinite(a) || !Number.isFinite(g)) nan++; sum99 += a; sumG += g; n++; best = Math.min(best, g); } });
    // the hole-by-hole engine reads the same skills in match play and exhibitions
    let holeBad = 0, h99 = 0, hG = 0; const fit = {}; CATS.forEach((c) => { fit[c.k] = 1; });
    for (let i = 0; i < 4000; i++) { const par = 3 + (i % 3), yd = [180, 420, 560][i % 3], att = i % 2 === 0;
      const a = dSimHole(par, yd, 0, raw, fit, null, null, att, mulberry32(i + 1)), g = dSimHole(par, yd, 0, st, fit, null, null, att, mulberry32(i + 1));
      if (![a, g].every((v) => Number.isInteger(v) && v >= -2 && v <= 3)) holeBad++; h99 += a; hG += g; }
    void roster; return { nan, mean99: sum99 / n, meanG: sumG / n, best, holeBad, h99: h99 / 4000, hG: hG / 4000 };
  }, big.st);
  ok('every round the geared golfer plays is a finite score', play.nan === 0, play.nan);
  ok('the geared golfer averages better than the all-99 golfer', play.meanG < play.mean99, { per_round_99: +play.mean99.toFixed(2), geared: +play.meanG.toFixed(2) });
  ok('no impossible round (better than 18 under par)', play.best > -18, +play.best.toFixed(1));
  ok('hole by hole (match play, exhibitions): every hole is eagle to triple, and the geared golfer plays it better', play.holeBad === 0 && play.hG <= play.h99, { bad: play.holeBad, per_hole_99: +play.h99.toFixed(3), geared: +play.hG.toFixed(3) });
  checkScreens('over 99:', big, await readScreens());

  // the layouts, at a phone and a desktop: nothing clipped, wrapped or past its track
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp);
    const L = await page.evaluate(() => {
      const res = []; const fits = (sel, label) => { document.querySelectorAll(sel).forEach((el, i) => { if (!el.getClientRects().length) return;
        const r = el.getBoundingClientRect(), lh = parseFloat(getComputedStyle(el).lineHeight) || r.height;
        const clipped = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible';
        const wrapped = r.height > lh * 1.6 && /^\s*\d+/.test(el.textContent);
        const out = r.right > innerWidth + 1 || r.left < -1;
        if (clipped || wrapped || out) res.push({ label: label + '#' + i, text: el.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height), clipped, wrapped, out }); }); };
      S.overlay = null; S.screen = 'build'; render();
      fits('.ovrchip', 'chip'); fits('.ovrchip b', 'chip number'); fits('.slot .v', 'slot value');
      const dots = [...document.querySelectorAll('svg circle')].filter((c) => c.closest('svg') && c.closest('svg').querySelector('text'));
      const svg = document.querySelector('svg text') && document.querySelector('svg text').closest('svg');
      if (svg) { const sb = svg.getBoundingClientRect(); dots.forEach((d, i) => { const r = d.getBoundingClientRect(); if (r.right > sb.right + 1 || r.left < sb.left - 1 || r.top < sb.top - 1 || r.bottom > sb.bottom + 1) res.push({ label: 'radar dot#' + i, out: true }); }); }
      S.setupEdit = true; S.screen = 'setup'; render(); fits('.cb-row', 'closet boost');
      S.screen = 'build'; render(); try { openPlayerCardSelf(); fits('.pcovr b', 'card number'); document.querySelectorAll('.pcovr').forEach((bx, i) => { const n = bx.querySelector('b'); if (n && n.getBoundingClientRect().width > bx.getBoundingClientRect().width + 1) res.push({ label: 'card badge#' + i, text: n.textContent, out: true }); }); } catch (e) {}
      const hs = document.scrollingElement; const side = hs.scrollWidth > innerWidth + 1;
      return { res, side };
    });
    ok('over 99 at ' + vp.width + 'x' + vp.height + ': every rating fits on one line in its box', L.res.length === 0, L.res.slice(0, 6));
    ok('over 99 at ' + vp.width + 'x' + vp.height + ': no sideways scroll', !L.side);
  }

  head('MILESTONE: three milestone items are real items, with the boosts their old rows carry');
  {
    const M = await page.evaluate(() => {
      const keys = Object.keys(MILESTONE_GEAR), out = [];
      const catOf = (k) => COS_CATS.find((c) => c.pk === k.split(':')[0]).k;
      const s0 = coinState(); keys.forEach((id) => { delete s0.owned[id]; delete s0.owned[MILESTONE_GEAR[id]]; }); coinSave(s0);
      keys.forEach((id) => { const key = MILESTONE_GEAR[id], cat = catOf(key), it = key.split(':')[1], mi = MILESTONE_ITEMS.find((x) => x.id === id);
        out.push({ id, key, before: cosOwned(cat, it), price: cosmeticPrice(cat, it), listed: (cosmeticItems(cat) || []).some((o) => o.id === it),
          same: JSON.stringify(COS_BOOST[key]) === JSON.stringify(mi.boost), pack: packPool().some((e) => cosKey(e.cat, e.id) === key) }); });
      const s = coinState(); keys.forEach((id) => { s.owned[id] = 1; }); coinSave(s);
      out.forEach((r) => { r.after = cosOwned(catOf(r.key), r.key.split(':')[1]); });
      keys.forEach((id) => { delete s.owned[id]; }); coinSave(s);
      const charms = MILESTONE_ITEMS.filter((m) => m.slot === 'charm').map((m) => m.id).filter((id) => MILESTONE_GEAR[id]);
      return { out, charms };
    });
    M.out.forEach((r) => ok(r.key + ': listed, ' + r.id + '\'s boost, never sold or pulled, owned once the milestone is',
      r.listed && r.same && r.price === 0 && !r.pack && !r.before && r.after, r));
    ok('the two charms stay data only (no slot)', M.charms.length === 0, M.charms);
  }

  head('ICON: the tier above ELITE, 100 and up, on the First Tee switch');
  {
    const T = await page.evaluate(() => { const r = {}, kU = sbUser, kN = sbUsername;
      sbUser = { id: 't' }; sbUsername = 'CSel8';
      r.t99 = ovrTier(99).lab; r.t100 = ovrTier(100).lab; r.t112 = ovrTier(112).lab;
      S.cardView = { self: true, name: 'x', look: S.look, ovr: 103 }; S.cardFlipped = false; r.card = /pcovr icon/.test(playerCardHTML(S.cardView));
      sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; r.other = ovrTier(103).lab;
      sbUser = kU; sbUsername = kN; return r; });
    ok('a tester: 99 is ELITE, 100 and 112 are ICON', T.t99 === 'ELITE' && T.t100 === 'ICON' && T.t112 === 'ICON', T);
    ok('a tester\'s player card wears the ICON badge at 103', T.card === true);
    ok('anybody else keeps ELITE until the switch flips', T.other === 'ELITE', T.other);
  }

  head('SERVER: what the boards store');
  {
    const dir = path.join(path.dirname(BASE), '..', 'supabase');
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    const last = files.filter((f) => /function\s+(public\.)?runtour_submit_season\b/i.test(fs.readFileSync(path.join(dir, f), 'utf8'))).pop();
    const sql = last ? fs.readFileSync(path.join(dir, last), 'utf8') : '';
    const clamps = /v_ovr\s+int\s*:=\s*greatest\(\s*40\s*,\s*least\(\s*99\s*,/i.test(sql);
    // KNOWN, the owner's call: the season board stores the overall clamped to 99 while the player's own card shows
    // the geared number. Lifting it is a migration the owner runs (the report has the SQL).
    if (clamps) info('KNOWN, waiting on the owner: ' + last + ' stores a season board overall of at most 99 (your card can show 102)');
    else ok('the season board stores an overall past 99 (' + last + ')', /least\(\s*112/.test(sql), last);
  }

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 3));
} finally { await b.close(); }
console.log(bad ? '\n' + bad + ' failed' : '\nall passed');
process.exit(bad ? 1 : 0);
