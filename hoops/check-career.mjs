/*
 * Run The Floor: Career, the rules and the screens.
 *
 *   node hoops/check-career.mjs           everything
 *   node hoops/check-career.mjs --quick   the engine only, no browser
 *
 * Career is one invented player's whole NBA life, a season at a time, with a
 * card to answer between every stretch of games. Every way it goes wrong is
 * silent: a career that never ends is a button that keeps saying "Next
 * season", a card nobody can reach is content nobody sees, and a season of
 * 81 wins renders exactly like a season of 41. So the claims are PROPERTIES
 * over hundreds of careers played three ways, plus one career played through
 * the real page.
 *
 * THE LINE ABOUT REAL PEOPLE IS ASKED OF THE SOURCE. Every rival, mentor and
 * teammate an event talks about is a role, never a name, and the way that
 * breaks is somebody writing a storyline with a real name in it. No
 * measurement of an output can see a string that was never drawn, so section
 * 5 reads every player name in the data against career.js itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const C = require('./career.js');
const ROWS = require('./data/players.json');
const QUICK = process.argv.includes('--quick');

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const league = C.seedLeague(ROWS);

/* Three ways to answer a card, so a branch only one policy takes is still
   walked. `random` is seeded off the career, so the sweep is the same sweep
   every run. */
function pickFor(pol, L, c) {
  const n = c.options.length;
  if (pol === 'first') return 0;
  if (pol === 'last') return n - 1;
  return (L.steps * 7 + c.key.length * 3 + L.age) % n;
}
function play(seed, pol, opts, hook) {
  const L = C.newLife(Object.assign({ seed, league }, opts));
  const seen = [];
  let guard = 0;
  while (!L.retired && guard++ < 3000) {
    if (L.pending.length) {
      const c = L.pending[0];
      seen.push(c.id);
      const i = pickFor(pol, L, c);
      C.choose(L, i);
    } else C.step(L);
    if (hook) hook(L);
  }
  return { L, seen, guard };
}

// ── 1. every career ends, and nothing in it is broken ──────────────────────
section('1. six hundred careers, three ways of answering, all of them end');
const all = [];
const fired = {};
{
  let notDone = 0, bad = [], twoOpts = true, maxW = 0, maxPpg = 0, maxGuard = 0, cards = 0;
  for (const pol of ['first', 'last', 'random']) {
    for (let i = 0; i < 200; i++) {
      const opts = { pos: C.POS[i % 5], arch: C.ARCH_KEYS[i % 6], bg: C.BG_KEYS[(i >> 1) % 4] };
      let r;
      try { r = play(pol + ':' + i, pol, opts, (L) => {
        if (L.pending.length && L.pending[0].options.length < 2 && L.pending[0].id !== 'fa') twoOpts = false;
      }); } catch (e) { bad.push(pol + i + ': ' + String(e).slice(0, 120)); continue; }
      const { L, seen, guard } = r;
      cards += seen.length;
      for (const id of seen) fired[id] = (fired[id] || 0) + 1;
      if (!L.retired) notDone++;
      maxGuard = Math.max(maxGuard, guard);
      for (const h of L.history) {
        maxW = Math.max(maxW, h.w);
        maxPpg = Math.max(maxPpg, h.pts);
        for (const k of ['pts', 'reb', 'ast', 'stl', 'blk', 'min', 'fgp', 'tpp', 'ovr', 'w', 'l', 'gp']) {
          if (!Number.isFinite(h[k])) bad.push(`${pol}${i} ${h.y}: ${k} is ${h[k]}`);
        }
        if (h.w + h.l !== 82) bad.push(`${pol}${i} ${h.y}: a record of ${h.w}-${h.l}`);
        if (h.gp > 82 || h.gp < 0) bad.push(`${pol}${i} ${h.y}: ${h.gp} games`);
        /* An award has a floor a season has to clear, whatever the draw says. */
        const aw = h.aw || [];
        if (aw.includes('roy') && h.pts < 11) bad.push(`${pol}${i} ${h.y}: Rookie of the Year at ${h.pts} a night`);
        if (aw.includes('mvp') && h.ovr < 89) bad.push(`${pol}${i} ${h.y}: MVP at an overall of ${h.ovr}`);
        if (aw.includes('scor') && h.pts < 30.5) bad.push(`${pol}${i} ${h.y}: a scoring title at ${h.pts}`);
        if (aw.includes('fmvp') && h.po !== 'Champion') bad.push(`${pol}${i} ${h.y}: Finals MVP without the ring`);
      }
      for (const k of Object.keys(L.rt)) if (L.rt[k] < 25 || L.rt[k] > 99) bad.push(`${pol}${i}: ${k} at ${L.rt[k]}`);
      if (!Number.isFinite(L.cash) || !Number.isFinite(L.earned)) bad.push(`${pol}${i}: money is not a number`);
      all.push({ L, pol, f: L.final });
    }
  }
  ok(bad.length === 0, `nothing throws and every number is a number (${bad.slice(0, 3).join(' | ') || 'none'})`);
  ok(notDone === 0, `every career reaches retirement (${notDone} did not)`);
  ok(maxGuard < 600, `inside a sane number of presses (worst ${maxGuard})`);
  ok(twoOpts, 'every card but free agency offers a real choice');
  /* The best real team lost nine. A game's odds are clamped at 0.84, so a
     74 win season is a draw in the tail and has to stay one: the claim is how
     often, and a hard ceiling nobody reaches. The ceiling was written as the
     sample's own max once (76), and a change to who gets drafted moved one
     season to 77 in nine thousand, which is a coin landing, not a defect. */
  let big = 0, seasonsAll = 0;
  for (const x of all) for (const h of x.L.history) { seasonsAll++; if (h.w >= 74) big++; }
  ok(big / seasonsAll < 0.005, `a 74 win season is rare (${(big / seasonsAll * 100).toFixed(2)}% of seasons)`);
  ok(maxW < 80, `nobody wins 80 (${maxW})`);
  ok(maxPpg <= 38, `no season averages more than 38 a night (${maxPpg})`);
  console.log(`  ${all.length} careers, ${cards} cards answered`);
}

// ── 2. the shape of a life ─────────────────────────────────────────────────
section('2. most careers are good ones, a few are great, and the bands hold');
{
  const rnd = all.filter((x) => x.pol === 'random');
  const share = (f) => rnd.filter(f).length / rnd.length;
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))]; };
  const mvp = share((x) => x.f.totals.mvp > 0);
  const star = share((x) => x.f.totals.star > 0);
  const hof = share((x) => x.f.score >= 55);
  const seasons = pct(rnd.map((x) => x.f.totals.seasons), 0.5);
  const peakPts = pct(rnd.map((x) => Math.max(0, ...x.L.history.map((h) => h.pts))), 0.5);
  const rookie = pct(rnd.map((x) => (x.L.history[0] || { pts: 0 }).pts), 0.5);
  const verdicts = new Set(all.map((x) => x.f.verdict));
  console.log(`  MVP ${(mvp * 100).toFixed(1)}%  All-Star ${(star * 100).toFixed(0)}%  Hall ${(hof * 100).toFixed(0)}%`
    + `  seasons p50 ${seasons}  peak ppg p50 ${peakPts}  rookie ppg p50 ${rookie}`);
  /* An MVP is rare and real, an All-Star is a career's high point for about
     a third of players, and the Hall is earned. Measured: 1.0%, 30% and 27%. */
  ok(mvp > 0.002 && mvp < 0.06, `an MVP is rare but reachable (${(mvp * 100).toFixed(1)}%)`);
  ok(star > 0.15 && star < 0.5, `All-Star is a high point, not a given (${(star * 100).toFixed(0)}%)`);
  ok(hof > 0.08 && hof < 0.42, `the Hall is earned (${(hof * 100).toFixed(0)}%)`);
  ok(seasons >= 8 && seasons <= 18, `a career runs a decade or so (${seasons})`);
  ok(peakPts >= 12 && peakPts <= 24, `a typical best season is a starter's (${peakPts})`);
  ok(rookie >= 3 && rookie <= 12, `a rookie is a rookie (${rookie})`);
  ok(verdicts.size >= 5, `the verdicts span the ladder (${[...verdicts].join(', ')})`);
}

// ── 3. every card can be dealt ─────────────────────────────────────────────
section('3. every event fires somewhere in the sweep');
{
  /* A card nobody can reach is content nobody sees, and it throws nothing. */
  /* The hometown club only exists for a career that has a hometown, which is
     one that started in high school, so section 8 asks for it. */
  const ids = Object.keys(C.EVENTS).filter((id) => id !== 'hometown_call');
  const dark = ids.filter((id) => !fired[id]);
  ok(dark.length === 0, `every one of ${ids.length} events is dealt (${dark.join(', ') || 'none dark'})`);
  for (const id of ['combine', 'workout', 'agent', 'training', 'clutch', 'fa', 'retire', 'extension', 'allstar', 'injury']) {
    ok(fired[id] > 0, `the ${id} card is dealt (${fired[id] || 0})`);
  }
}

// ── 4. the same choices make the same career, and a save is the career ─────
section('4. determinism, and a reload mid-career changes nothing');
{
  const a = play('det:1', 'random', { pos: 'SG', arch: 'scorer', bg: 'oad' }).L;
  const b = play('det:1', 'random', { pos: 'SG', arch: 'scorer', bg: 'oad' }).L;
  ok(JSON.stringify(a.history) === JSON.stringify(b.history), 'one seed and one set of answers is one career');
  /* Round trip through JSON at every step, which is what a reload is. */
  const L = C.newLife({ seed: 'det:1', pos: 'SG', arch: 'scorer', bg: 'oad', league });
  let M = L, g = 0;
  while (!M.retired && g++ < 3000) {
    M = JSON.parse(JSON.stringify(M));
    if (M.pending.length) C.choose(M, pickFor('random', M, M.pending[0]));
    else C.step(M);
  }
  ok(JSON.stringify(M.history) === JSON.stringify(a.history), 'a career reloaded before every press ends the same way');
  /* And a different seed is a different life. */
  const c = play('det:2', 'random', { pos: 'SG', arch: 'scorer', bg: 'oad' }).L;
  ok(JSON.stringify(c.history) !== JSON.stringify(a.history), 'another seed is another career');
}

// ── 5. nobody real is written into a story ─────────────────────────────────
section('5. no real player is named in any storyline');
{
  const src = fs.readFileSync(path.join(HERE, 'career.js'), 'utf8');
  const names = new Set();
  for (const r of ROWS) if (r.n && r.n.indexOf(' ') > 0) names.add(r.n);
  const hits = [...names].filter((n) => src.indexOf(n) >= 0);
  ok(hits.length === 0, `career.js names none of ${names.size} real players (${hits.slice(0, 5).join(', ') || 'none'})`);
  /* The default names are invented. A random one that happens to be a real
     player is the same line crossed by accident. */
  const clash = [];
  for (let i = 0; i < 3000; i++) { const n = C.randomName('nm' + i); if (names.has(n)) clash.push(n); }
  ok(clash.length === 0, `no random default name is a real player's (${clash.slice(0, 3).join(', ') || 'none'})`);
}

// ── 6. the money and the clock ─────────────────────────────────────────────
section('6. contracts, the cap and the clock');
{
  const L = C.newLife({ seed: 'money', league });
  ok(C.capFor(2027) === 165 && C.capFor(2028) > 165, 'the cap starts at $165M and grows');
  let maxPct = 0, sawFA = 0, sawExt = 0;
  for (const x of all) {
    for (const h of x.L.history) maxPct = Math.max(maxPct, h.sal / C.capFor(h.y));
  }
  for (let i = 0; i < 60; i++) {
    play('fa:' + i, 'random', {}, (M) => {
      const c = M.pending[0];
      if (c && c.id === 'fa') {
        sawFA++;
        for (const o of c.ctx.offers) if (o.salary / C.capFor(M.year) > 0.35 * 1.08 + 0.001) maxPct = 9;
      }
      if (c && c.id === 'extension') sawExt++;
    });
  }
  ok(maxPct <= 0.35 * 1.08 + 0.001, `no deal pays more than the max (${(maxPct * 100).toFixed(1)}% of the cap)`);
  ok(sawFA > 0 && sawExt > 0, `free agency and extensions both happen (${sawFA}, ${sawExt})`);
  ok(L.year === league.latest + 1, `a career starts the season after the data's last (${L.year})`);
}

// ── 9. the people around you, and the moments ─────────────────────────────
section('9. a rival, a life, milestones, and what comes after');
{
  let rivals = 0, rivalBad = [], married = 0, kids = 0, maxKids = 0, after = 0, jerseys = 0, jBad = [], miles = 0, milesMissed = 0;
  for (const x of all) {
    const L = x.L, f = x.f;
    if (L.rival) {
      rivals++;
      const r = L.rival;
      if (!Number.isFinite(r.pts) || r.seasons.some((h) => !Number.isFinite(h.pts) || h.pts > 36)) rivalBad.push(L.seed);
      if (r.seasons.length > 0 && r.name === L.name) rivalBad.push(L.seed + ' shares a name');
    }
    const life = C.lifeOf(L);
    if (life.rel === 'married') married++;
    kids += life.kids; maxKids = Math.max(maxKids, life.kids);
    if (f.after && f.after.length > 10) after++;
    if (f.jersey) {
      jerseys++;
      if (L.history.filter((h) => h.t === f.jersey).length < 7) jBad.push(L.seed);
    }
    /* A career that crossed twenty thousand says so in the story. */
    if (f.totals.pts >= 20000) {
      if (L.log.some((e) => /^20,000 career points/.test(e.t))) miles++; else milesMissed++;
    }
  }
  const n = all.length;
  console.log(`  rival ${rivals}/${n}  married ${married}  kids ${kids}  after ${after}  jerseys ${jerseys}  20k club ${miles}`);
  ok(rivals === all.filter((x) => x.L.draft).length, 'every drafted or undrafted career has a rival from its class');
  ok(rivalBad.length === 0, `the rival's numbers are real numbers (${rivalBad.slice(0, 3).join(', ') || 'none'})`);
  ok(married / n > 0.1 && married / n < 0.9 && maxKids <= 4, `a life happens off the floor (${married} married, at most ${maxKids} kids)`);
  ok(after === n, `every career ends on what comes next (${after} of ${n})`);
  ok(jBad.length === 0 && jerseys > 0, `a retired number means seven years in one city (${jerseys} retired, ${jBad.length} wrong)`);
  ok(milesMissed === 0 && miles > 0, `twenty thousand points is a moment (${miles} logged, ${milesMissed} missed)`);
  const src = fs.readFileSync(path.join(HERE, 'career.js'), 'utf8');
  ok(!/partner'?s name/i.test(src), 'the people in your life are roles');
}

// ── 8. the road: high school, college, and the draft it ends at ───────────
section('8. three hundred careers from high school, and where they land');
{
  const fired8 = {}, bad = [], routes = {}, ages = {};
  let notDone = 0, picks = [], hsPts = [], colPts = [], seeds = [], champ = 0, state = 0, five = 0, at17 = 0;
  const road = [];
  for (const pol of ['first', 'last', 'random']) {
    for (let i = 0; i < 100; i++) {
      let r;
      try { r = play('road:' + pol + ':' + i, pol, { start: 'hs', pos: C.POS[i % 5], arch: C.ARCH_KEYS[i % 6] }); }
      catch (e) { bad.push(pol + i + ': ' + String(e).slice(0, 140)); continue; }
      const { L, seen } = r;
      for (const id of seen) fired8[id] = (fired8[id] || 0) + 1;
      if (!L.retired) notDone++;
      road.push({ L, pol, f: L.final });
      routes[L.bg] = (routes[L.bg] || 0) + 1;
      if (L.draft) picks.push(L.draft.pick || 99);
      const draftAge = (L.history[0] || {}).age;
      if (draftAge != null) ages[draftAge] = (ages[draftAge] || 0) + 1;
      for (const h of L.amHist) {
        for (const k of ['pts', 'reb', 'ast', 'gp', 'w', 'l', 'ovr']) if (!Number.isFinite(h[k])) bad.push(`${pol}${i} ${h.lvl} ${h.y}: ${k} is ${h[k]}`);
        const aw = h.aw || [];
        if (h.lvl === 'HS') {
          hsPts.push(h.pts);
          /* Twenty-six games and at most four more in the state tournament. */
          if (h.w + h.l < 26 || h.w + h.l > 30) bad.push(`${pol}${i} ${h.y}: a high school record of ${h.w}-${h.l}`);
          if (aw.includes('hs_mrbb') && h.age < 16) bad.push(`${pol}${i}: Mr. Basketball as a sophomore`);
          if (aw.includes('hs_state')) state++;
          if (h.age === 17) { at17++; if (h.rank <= 25) five++; }
        }
        if (h.lvl === 'NCAA') {
          colPts.push(h.pts);
          /* Thirty-one, a conference tournament, and at most six in March. */
          if (h.w + h.l < 32 || h.w + h.l > 41) bad.push(`${pol}${i} ${h.y}: a college record of ${h.w}-${h.l}`);
          if (h.seed != null) { seeds.push(h.seed); if (h.seed < 1 || h.seed > 16) bad.push(`a ${h.seed} seed`); }
          if (aw.includes('c_fr') && h.age !== 18) bad.push(`${pol}${i}: Freshman of the Year at ${h.age}`);
          if (aw.includes('c_npoy') && h.gp < 20) bad.push(`${pol}${i}: Player of the Year in ${h.gp} games`);
          if (aw.includes('c_champ')) champ++;
          if (aw.includes('c_mop') && !aw.includes('c_champ')) bad.push(`${pol}${i}: Most Outstanding Player without the title`);
        }
      }
    }
  }
  ok(bad.length === 0, `nothing throws and every road number is sane (${bad.slice(0, 3).join(' | ') || 'none'})`);
  ok(notDone === 0, `every road career reaches retirement (${notDone} did not)`);
  const q = (a, p) => { const x = a.slice().sort((m, n) => m - n); return x[Math.floor(p * (x.length - 1))]; };
  console.log(`  high school ppg p50 ${q(hsPts, 0.5)} max ${Math.max(...hsPts)}  college ppg p50 ${q(colPts, 0.5)} max ${Math.max(...colPts)}`);
  ok(Math.max(...hsPts) <= 36 && q(hsPts, 0.5) >= 10 && q(hsPts, 0.5) <= 24, 'high school lines are a high school star\'s');
  ok(Math.max(...colPts) <= 33 && q(colPts, 0.5) >= 8 && q(colPts, 0.5) <= 20, 'college lines are a college player\'s');
  /* Every card the road deals is dealt somewhere. */
  const dark = Object.keys(C.AM_EVENTS).filter((id) => !fired8[id]);
  ok(dark.length === 0, `every one of ${Object.keys(C.AM_EVENTS).length} road events is dealt (${dark.join(', ') || 'none dark'})`);
  for (const id of ['hs_summer', 'offers', 'commit', 'signing', 'declare', 'portal', 'amclutch', 'combine', 'hometown_call', 'after']) ok(fired8[id] > 0, `the ${id} card is dealt (${fired8[id] || 0})`);
  /* Every way out of high school is taken by somebody. Overseas is the one a
     blind policy almost never picks (it needs a ranked player who waited past
     junior year), so a policy that wants it walks it on purpose. */
  for (let i = 0; i < 40 && !routes.intl; i++) {
    const L = C.newLife({ seed: 'abroad:' + i, start: 'hs', league });
    let g = 0;
    while (!L.retired && g++ < 3000) {
      if (L.pending.length) {
        const c = L.pending[0];
        let k = 0;
        if (c.id === 'offers') k = c.options.length - 1;
        if (c.id === 'commit') { const j = c.options.findIndex((o) => o.route === 'intl'); k = j >= 0 ? j : 0; }
        C.choose(L, k);
      } else C.step(L);
    }
    if (L.bg === 'intl' && L.amHist.some((h) => h.lvl === 'Overseas') && L.history.length) routes.intl = (routes.intl || 0) + 1;
  }
  ok(routes.oad && routes.senior && routes.gl && routes.intl, `college, four years, the G League and overseas all happen (${JSON.stringify(routes)})`);
  ok(Object.keys(ages).every((a) => a >= 19 && a <= 22), `a rookie is 19 to 22 (${JSON.stringify(ages)})`);
  ok(champ > 0 && state > 0, `titles happen at both levels (${state} state, ${champ} national)`);
  ok(seeds.length > 0 && seeds.filter((x) => x === 1).length / seeds.length < 0.25, `a 1 seed is the top of the field, not the norm (${seeds.filter((x) => x === 1).length} of ${seeds.length})`);
  /* A five-star is rare. Measured: about one in five of these players, all of
     whom are on the road to the league. */
  ok(five / at17 > 0.06 && five / at17 < 0.32, `about one in five is a five-star by 17 (${(five / at17 * 100).toFixed(0)}%)`);
  /* THE ROAD ENDS WHERE THE BACKGROUNDS DO. A road that hands out better
     players than draft night does makes skipping it a mistake, and the other
     way round makes playing it a chore. So the bands are section 2's. */
  const rnd = road.filter((x) => x.pol === 'random');
  const share = (f) => rnd.filter(f).length / rnd.length;
  const mvp = share((x) => x.f.totals.mvp > 0), hof = share((x) => x.f.score >= 55), star = share((x) => x.f.totals.star > 0);
  const drafted = picks.filter((p) => p <= 60).length / picks.length;
  console.log(`  MVP ${(mvp * 100).toFixed(1)}%  All-Star ${(star * 100).toFixed(0)}%  Hall ${(hof * 100).toFixed(0)}%  drafted ${(drafted * 100).toFixed(0)}%`);
  ok(mvp < 0.07, `an MVP from the road is as rare as from draft night (${(mvp * 100).toFixed(1)}%)`);
  ok(hof > 0.08 && hof < 0.42 && star > 0.15 && star < 0.5, 'the Hall and All-Star rates sit in the same bands');
  ok(drafted > 0.8 && drafted < 1, `most of them are drafted, not all (${(drafted * 100).toFixed(0)}%)`);
  /* And the road round-trips through JSON like the league half does. */
  const a = play('road:det', 'random', { start: 'hs', pos: 'PG', arch: 'floor' }).L;
  let M = C.newLife({ seed: 'road:det', start: 'hs', pos: 'PG', arch: 'floor', league }), g = 0;
  while (!M.retired && g++ < 3000) {
    M = JSON.parse(JSON.stringify(M));
    if (M.pending.length) C.choose(M, pickFor('random', M, M.pending[0])); else C.step(M);
  }
  ok(JSON.stringify(M.amHist) === JSON.stringify(a.amHist) && JSON.stringify(M.history) === JSON.stringify(a.history),
    'a road career reloaded before every press is the same career');
  const src = fs.readFileSync(path.join(HERE, 'career.js'), 'utf8');
  ok(/AM_EVENTS/.test(src), 'the road reads its own cards');
}

if (!QUICK) await browser();

console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log(`${passed} assertions passed.`);

// ── 7. the page ────────────────────────────────────────────────────────────
async function browser() {
  section('7. a whole career through the real page, on a phone');
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
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
  const b = await pw.chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); } catch (e) {} });
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });

  const home = await page.evaluate(() => ({
    docked: !!document.querySelector('#dock #b-career'),
    label: document.querySelector('#b-career').textContent,
    title: (document.querySelector('#ch-title') || {}).textContent || '',
  }));
  ok(home.docked, 'the dock carries the career button on a phone');
  ok(/start your career/i.test(home.label), `with nothing started it says Start ("${home.label}")`);

  await page.evaluate(() => document.querySelector('#b-career').click());
  await page.waitForSelector('#cr-go');
  /* The builder: what is picked is what is played. High school is the
     default; draft night shows the backgrounds and hides them again. */
  await page.click('[data-pos="C"]');
  await page.click('[data-arch="anchor"]');
  ok(!(await page.$('[data-bg]')), 'a high school start asks no background');
  await page.click('[data-start="draft"]');
  ok(!!(await page.$('[data-bg="senior"]')), 'draft night offers the backgrounds');
  await page.click('[data-start="hs"]');
  await page.fill('#cr-name', 'Checker McTest');
  await page.click('#cr-go');
  const made = await page.evaluate(() => RTF_CAREER_UI.state().cur);
  ok(made && made.pos === 'C' && made.arch === 'anchor' && made.stage === 'hs' && made.age === 15 && made.name === 'Checker McTest',
    `the builder's picks are the career's (${made && [made.pos, made.arch, made.stage, made.age, made.name].join(', ')})`);
  const third = await page.evaluate(() => (document.querySelectorAll('.cr-fact .k')[2] || {}).textContent || '');
  ok(/ranking/i.test(third), `a sophomore is told his ranking, not his bank (${third})`);

  /* Play it out, pressing the first choice or the next button, reading the
     glass for a field that printed as nothing. */
  let presses = 0, junk = [], reloaded = false, offOpened = false, resumed = null;
  const stagesSeen = {};
  while (presses++ < 900) {
    const st = await page.evaluate(() => {
      const s = RTF_CAREER_UI.state();
      const t = document.querySelector('#s-car').innerText;
      return { cur: !!s.cur, last: !!s.last, junk: /\bundefined\b|\bNaN\b|\[object/.test(t), steps: s.cur ? s.cur.steps : 0, stage: s.cur && s.cur.stage,
        card: s.cur && s.cur.pending[0] ? s.cur.pending[0].key : null };
    });
    if (st.junk && junk.length < 3) junk.push('press ' + presses);
    if (st.stage) stagesSeen[st.stage] = 1;
    if (!st.cur) break;
    /* Once, mid-career: reload and land on the same card. */
    if (!reloaded && st.steps >= 12 && st.card) {
      reloaded = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
      const lab = await page.evaluate(() => document.querySelector('#b-career').textContent);
      ok(/continue your career/i.test(lab), `mid-career the front page offers to continue ("${lab}")`);
      await page.evaluate(() => document.querySelector('#b-career').click());
      await page.waitForSelector('#s-car.active');
      resumed = await page.evaluate(() => { const s = RTF_CAREER_UI.state(); return s.cur && s.cur.pending[0] ? s.cur.pending[0].key : null; });
      ok(resumed === st.card, `a reload lands on the same card (${st.card} against ${resumed})`);
    }
    /* Once: the off-the-court sheet opens and an action lands. */
    if (!offOpened && st.steps >= 6 && !st.card) {
      const off = await page.$('#cr-off');
      if (off) {
        offOpened = true;
        await off.click();
        await page.waitForSelector('#cr-sheet:not([hidden])');
        const btn = await page.$('#cr-sheet [data-oact]:not([disabled])');
        if (btn) {
          await btn.click();
          const res = await page.evaluate(() => (document.querySelector('.cr-result') || {}).textContent || '');
          ok(res.length > 10, `an action off the court answers in a sentence ("${res.slice(0, 50)}")`);
        } else ok(true, 'the sheet opens (nothing affordable yet)');
        const shut = await page.evaluate(() => { const s = document.querySelector('#cr-sheet'); if (!s.hidden) document.querySelector('#cr-sheet-x').click(); return true; });
        ok(shut, 'and it closes');
      }
    }
    const c = await page.$('.cr-choice');
    if (c) {
      /* A card the game is waiting on is on the screen, not below the fold. */
      if (presses % 15 === 0) {
        const r = await c.boundingBox();
        ok(r && r.y < 844 && r.y + r.height > 0, `the card's first choice is on the screen at press ${presses} (${r && Math.round(r.y)})`);
      }
      await c.click();
    } else {
      const nx = await page.$('#cr-next');
      if (!nx) { ok(false, `press ${presses}: neither a card nor a next button`); break; }
      await nx.click();
    }
  }
  ok(junk.length === 0, `no field ever printed as undefined or NaN (${junk.join(', ') || 'none'})`);
  ok(reloaded, 'the reload arm ran');
  ok(stagesSeen.hs && (stagesSeen.col || stagesSeen.pro) && stagesSeen.nba, `the walk went from high school to the league (${Object.keys(stagesSeen).join(', ')})`);
  const fin = await page.evaluate(() => ({
    last: RTF_CAREER_UI.state().last, v: (document.querySelector('.cr-final .v') || {}).textContent || '',
    hof: RTF_CAREER_UI.state().hof.length,
  }));
  ok(fin.last && fin.v.length > 3, `it ends on a verdict ("${fin.v}")`);
  ok(fin.hof === 1, `and the career goes on the shelf (${fin.hof})`);
  /* Back home the hero remembers it. */
  await page.click('#cr-home');
  await page.waitForTimeout(250);
  const best = await page.evaluate(() => ({ t: (document.querySelector('#ch-best') || {}).textContent || '', hid: document.querySelector('#ch-best').hidden }));
  ok(!best.hid && /Checker McTest/.test(best.t), `the front page names your best career ("${best.t}")`);
  /* The career is a slot on the account: the key is in cloud.js's list. */
  const cl = await page.evaluate(() => window.RTF_CLOUD && window.RTF_CLOUD.MODE_KEYS['rtf.life.v1']);
  ok(cl === 'life', `the career is a slot on the shelf (${cl})`);
  ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
  console.log(`  ${presses} presses to retirement`);
  await b.close();
}
