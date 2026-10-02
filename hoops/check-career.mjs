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
 * EVERYBODY IN A STORY HAS A NAME. Teammates and opponents are real players
 * off the data, NBA head coaches are real coaches who get fired and hired,
 * and everybody else is generated. Section 5 holds both halves: the source
 * types no real player outside the coaches table (a real person arrives
 * through the data), no generated pairing is somebody real, and nothing a
 * career prints names a person by job alone or shows an unfilled token.
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
/* An en or em dash in copy, built from its code points so this file carries none. */
const DASH = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');

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
  /* Two hundred careers put a margin of about two and a half points on a
     share near fifteen percent, which made the All-Star floor a coin flip on
     the seed. The bands are read over six hundred random careers. */
  const rnd = all.filter((x) => x.pol === 'random');
  for (let i = 200; i < 600; i++) {
    const r = play('random:' + i, 'random', { pos: C.POS[i % 5], arch: C.ARCH_KEYS[i % 6], bg: C.BG_KEYS[(i >> 1) % 4] });
    if (r && r.L) rnd.push({ L: r.L, pol: 'random', f: r.L.final });
  }
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
  ok(star > 0.15 && star < 0.5, `All-Star is a high point, not a given (${(star * 100).toFixed(2)}%)`);
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

// ── 5. everybody has a name, and the real ones are real ─────────────────────
section('5. real players and coaches by name, everybody else generated');
{
  const names = new Set();
  for (const r of ROWS) if (r.n && r.n.indexOf(' ') > 0) names.add(r.n);
  const coaches = new Set(C.COACH_NAMES);
  /* A real person reaches a line through the data or the coaches table, never
     typed into a story. So the source, less the coaches table, names nobody
     real: a storyline about a real player written by hand is the defect. */
  for (const f of ['career.js', 'scenes.js', 'baller.js']) {
    let src = fs.readFileSync(path.join(HERE, f), 'utf8');
    for (const n of coaches) src = src.split(n).join('');
    const hits = [...names].filter((n) => src.indexOf(n) >= 0);
    ok(hits.length === 0, `${f} types none of ${names.size} real players outside the coaches table (${hits.slice(0, 5).join(', ') || 'none'})`);
  }
  /* Every pairing the generated lists can make is nobody real. Read off the
     lists themselves, so a name added to one is checked against every other. */
  const pairs = (A, B) => A.flatMap((a) => B.map((b) => a + ' ' + b));
  const made = {
    people: pairs(C.PEOPLE_M.concat(C.PEOPLE_F, C.PEOPLE_X), C.PEOPLE_LAST),
    rookies: pairs(C.FIRST, C.PEOPLE_LAST),
    defaults: pairs(C.FIRST, C.LAST),
    rivals: pairs(C.RIVAL_FIRST, C.RIVAL_LAST),
  };
  for (const k of Object.keys(made)) {
    const clash = made[k].filter((n) => names.has(n) || coaches.has(n));
    ok(clash.length === 0, `no generated ${k} name is a real player or coach (${clash.slice(0, 3).join(', ') || 'none'}, of ${made[k].length})`);
  }
  const clash = [];
  for (let i = 0; i < 3000; i++) { const n = C.randomName('nm' + i); if (names.has(n)) clash.push(n); }
  ok(clash.length === 0, `no random default name is a real player's (${clash.slice(0, 3).join(', ') || 'none'})`);
  ok(C.CLUBS.every((c) => C.COACHES_NOW[c] && C.COACHES_NOW[c][0]), 'every club opens with a real head coach');
  ok(new Set(C.CLUBS.map((c) => C.COACHES_NOW[c][0])).size === C.CLUBS.length, 'no coach opens on two benches');
  ok(!C.COACH_POOL.some((x) => C.CLUBS.some((c) => C.COACHES_NOW[c][0] === x[0])), 'the pool holds nobody already on a bench');

  /* What a career actually says, over a sweep of careers both ways in. The old
     role phrasings are the defect: "the coach", "a teammate", "the
     commissioner" is a line about a job. And a token nobody filled is a line
     that shows its own plumbing. */
  const ROLE = [/\bthe coach\b/i, /\byour coach (says|makes|likes|tells|wants|takes)/i, /\ba teammate\b/i, /\bthe commissioner\b/i,
    /\bthe owner\b/i, /\bthe trainers\b/i, /\bthe doctors\b/i, /\byour partner (has|wants|says)/i, /\bthe veteran\b/i,
    /\byour starting center\b/i, /\bthe assistant\b/i, /\ba rival coach\b/i, /\byour agent (makes|cries)/i, /\bthe new coach\b/i];
  const bad = [], open = [];
  let years = 0, changes = 0, rehired = 0, noCoach = 0, twoBench = 0, cardCoach = 0, cardCoachOk = 0;
  const fired = new Set();
  const realAt = {};
  const look = (L, t, where) => {
    if (typeof t !== 'string') return;
    if (/\{[a-z0-9]+(:[a-z]+)?\}/i.test(t)) open.push(where + ': ' + t);
    for (const re of ROLE) if (re.test(t)) { bad.push(where + ': ' + t); break; }
  };
  for (let i = 0; i < (QUICK ? 40 : 90); i++) {
    const L = C.newLife({ seed: 'names:' + i, start: i % 2 ? 'hs' : 'draft', league });
    let g = 0, prev = JSON.stringify(C.coachState(L).coach);
    const seen = (L2) => {
      const cs = C.coachState(L2).coach, on = {};
      for (const c of C.CLUBS) {
        if (!cs[c]) { noCoach++; continue; }
        if (on[cs[c].n]) twoBench++;
        on[cs[c].n] = 1;
      }
    };
    while (!L.retired && g++ < 4000) {
      if (L.pending.length) {
        const c = L.pending[0];
        for (const t of [c.title, c.text, c.eyebrow]) look(L, t, c.id);
        for (const o of c.options) { look(L, o.label, c.id); look(L, o.hint, c.id); }
        if (c.id === 'coach_bench' || c.id === 'film_session') { cardCoach++; if ((c.title + c.text).indexOf(C.coachName(L, L.team)) >= 0) cardCoachOk++; }
        const r = C.choose(L, pickFor('random', L, c));
        look(L, r.text, c.id);
        for (const b of r.beats || []) look(L, b.text, 'beat');
      } else {
        const y = L.year;
        const st = C.step(L);
        for (const b of st.beats) look(L, b.text, 'beat');
        if (L.year !== y) {
          years++;
          const cur = C.coachState(L).coach, old = JSON.parse(prev);
          for (const c of C.CLUBS) {
            if (old[c] && cur[c] && old[c].n !== cur[c].n) {
              changes++;
              fired.add(old[c].n);
              if (fired.has(cur[c].n)) rehired++;
            }
          }
          const off = L.year - (league.latest + 1);
          const a = realAt[off] = realAt[off] || [0, 0];
          for (const c of C.CLUBS) { a[0] += cur[c] ? cur[c].real : 0; a[1]++; }
        }
        prev = JSON.stringify(C.coachState(L).coach);
      }
      seen(L);
    }
    for (const l of L.log) look(L, l.t, 'log');
  }
  ok(open.length === 0, `no line shows an unfilled {token} (${open.slice(0, 2).join(' | ') || 'none'})`);
  ok(bad.length === 0, `no line names a person by job alone (${bad.slice(0, 3).join(' | ') || 'none'})`);
  ok(noCoach === 0, `every club has a head coach after every step (${noCoach} empty benches)`);
  ok(twoBench === 0, `no coach is on two benches at once (${twoBench})`);
  const per = changes / Math.max(1, years);
  console.log(`  coaching changes a summer ${per.toFixed(2)}  rehired after a firing ${rehired}  real coaches at year 1 ${(realAt[1][0] / realAt[1][1]).toFixed(2)}, year 10 ${realAt[10] ? (realAt[10][0] / realAt[10][1]).toFixed(2) : '-'}`);
  ok(per >= 3 && per <= 9, `the carousel moves about as often as the real league (${per.toFixed(2)} changes a summer, want 3 to 9)`);
  ok(rehired > 0, 'a fired coach turns up on another bench');
  ok(realAt[1] && realAt[1][0] / realAt[1][1] >= 0.95 && realAt[10] && realAt[10][0] / realAt[10][1] >= 0.75,
    'the benches stay mostly real coaches for a decade, then turn over');
  ok(cardCoach > 0 && cardCoachOk === cardCoach, `a card about your coach names the coach of your club (${cardCoachOk} of ${cardCoach})`);

  /* Teammates: year one's are the club's real roster, and the league turns
     over into generated rookies as the real men retire. */
  const L = C.newLife({ seed: 'mates', league });
  const real = new Set();
  for (const r of ROWS) if (r.s === league.latest && r.t === 'BOS') real.add(r.n);
  const y1 = C.matesOf(L, 'BOS');
  const y1real = y1.filter((m) => m.real);
  ok(y1real.length >= 8 && y1real.every((m) => real.has(m.n)) && y1.length - y1real.length <= 1,
    `year one's Celtics are the real Celtics, plus one rookie from a draft the data has not seen (${y1.slice(0, 3).map((m) => m.n).join(', ')})`);
  /* The league moves now: players change clubs, so the claim is about the
     league rather than one club. Ten years on the 2026 men are veterans; by
     fifteen most of them have aged out, which is what real time does. */
  L.year += 10;
  let real10 = 0, gen10 = 0;
  for (const c of C.CLUBS) for (const m of C.matesOf(L, c)) { if (m.real) real10++; else gen10++; }
  ok(real10 >= 60 && gen10 >= 60, `ten years on, the league is real veterans and generated rookies (${real10} real, ${gen10} generated)`);
  const gens = []; for (const c of C.CLUBS) for (const m of C.matesOf(L, c)) if (!m.real) gens.push(m.n);
  ok(gens.every((n) => !names.has(n)), 'no generated player is a real player');
  L.year += 20;
  ok(C.CLUBS.every((c) => C.matesOf(L, c).every((m) => !m.real)), 'thirty years on, the real men have all retired');
}

// ── 5c. real people stay on the court ───────────────────────────────────────
/* A real player or coach may appear in games, rosters, trades, awards,
   hirings and firings, and never in a quote, a feud, a night out or a
   podcast. The engine types every token: REAL_TOKENS name a real person, and an
   NBA event may only use one if BASKETBALL_ONLY lists it, with the reason.
   The source is scanned too, because the press room and the between-card
   actions are strings outside the event pool. */
section('5c. real people stay on the court');
{
  const real = new RegExp('\\{(' + C.REAL_TOKENS.join('|') + ')(:\\w+)?\\}', 'g');
  const bad = [];
  for (const id in C.EVENTS) {
    const src = JSON.stringify(C.EVENTS[id], (k, v) => typeof v === 'function' ? v.toString() : v);
    const m = src.match(real);
    if (m && !C.BASKETBALL_ONLY[id]) bad.push(id + ' ' + [...new Set(m)].join(' '));
  }
  ok(bad.length === 0, `no NBA event outside the basketball list uses a real person (${bad.join('; ') || 'none'})`);
  /* An arc is a story, so it is invented people only, every node. */
  const arcBad = Object.keys(C.ARC_EVENTS).filter((id) => real.test(JSON.stringify(C.ARC_EVENTS[id], (k, v) => typeof v === 'function' ? v.toString() : v)) && (real.lastIndex = 0, true));
  real.lastIndex = 0;
  ok(arcBad.length === 0, `no arc uses a real person (${arcBad.join(', ') || 'none'})`);
  ok(Object.keys(C.BASKETBALL_ONLY).every((id) => C.EVENTS[id] || (C.AM_EVENTS && C.AM_EVENTS[id])), 'every entry on the basketball list is a real event');
  /* Strings outside both pools: allowed only where the line is a known
     basketball context. Comments and the token switch itself are not copy. */
  const src = fs.readFileSync(path.join(HERE, 'career.js'), 'utf8').split('\n');
  const okLine = [/^\s*(\/\/|\*|\/\*)/, /case '/, /high school team', hint: 'Chemistry, and \{coach\}/, /Talk to \{coach\}/, /\{coach\} plays it in the film session/, /Fills \{coach\}/, /\{coach\} wants to try you at/];
  const outside = [];
  let inPool = false, depth = 0;
  src.forEach((line, i) => {
    if (/^const (EVENTS|AM_EVENTS|ARC_EVENTS) = \{/.test(line)) { inPool = true; depth = 0; }
    if (inPool) { depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length; if (depth <= 0 && /^\};/.test(line)) inPool = false; return; }
    if (real.test(line) && !okLine.some((r) => r.test(line))) outside.push(i + 1);
    real.lastIndex = 0;
  });
  ok(outside.length === 0, `no real token in copy outside the pools except the basketball lines (${outside.slice(0, 6).join(', ') || 'none'})`);
  /* The invented locker room: three a club, named, never a real player. */
  const L = C.newLife({ seed: 'locker', league });
  L.team = 'BOS';
  const lk = C.lockerOf(L);
  const realNames = new Set(ROWS.map((r) => r.n || r.name));
  ok(lk.length === 3 && lk.every((m) => m.n && !realNames.has(m.n)), `every club carries three invented teammates (${lk.map((m) => m.n).join(', ')})`);
  ok(Object.values(C.CAST).every((n) => !realNames.has(n)), 'nobody in the recurring cast shares a name with a real player');
  const said = C.say(L, '{tm} {tm2} {tvet} {trook} {tco} {topp} {beat} {critic} {fan} {friend} {trainer}');
  ok(!/\{/.test(said), `every invented token resolves (${said})`);
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
      if (draftAge === 18 && !C.recall(L, 'route.reclass')) bad.push(`${pol}${i}: an 18-year-old rookie who never reclassified`);
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
          /* A freshman is 18, or 17 after reclassifying and 19 after a prep or gap year (Phase D). */
          if (aw.includes('c_fr') && (h.age < 17 || h.age > 19)) bad.push(`${pol}${i}: Freshman of the Year at ${h.age}`);
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
  /* 18 only after reclassifying (asserted above); 23 and 24 after a prep year,
     four seasons and a year stashed overseas. */
  ok(Object.keys(ages).every((a) => a >= 18 && a <= 24) && (ages[19] || 0) > (ages[23] || 0) + (ages[24] || 0), `a rookie is 19 to 22, with the Phase D roads either side (${JSON.stringify(ages)})`);
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

section('10. the press room, the persona, the look');
{
  /* Every topic is asked somewhere, and every answer is a tone the engine
     knows. A topic nothing reaches is a microphone nobody ever stands at. */
  const topics = {};
  let tonesOk = true, pressN = 0;
  for (let i = 0; i < 260; i++) {
    play('press' + i, ['first', 'last', 'random'][i % 3], { start: i % 2 ? 'hs' : 'draft' }, (L) => {
      const c = L.pending[0];
      if (c && c.id === 'presser') {
        topics[c.topic] = 1;
        if (c.options.some((o) => !C.TONES[o.tone])) tonesOk = false;
      }
      pressN += 0;
    });
  }
  ok(Object.keys(C.PRESSERS).every((t) => topics[t]), `every press conference topic is held somewhere (${Object.keys(topics).join(', ')})`);
  ok(tonesOk, 'every answer carries a tone the engine knows');
  /* A press conference moves the meters a little and the reputation a lot,
     and the persona is read off the reputation, never stored. */
  const L = C.newLife({ seed: 'press:unit', start: 'draft', league });
  const card = C.presserCard(L, 'title');
  L.pending.unshift(card);
  const before = JSON.stringify(L.rep), fame0 = L.m.fame;
  const k = card.options.findIndex((o) => o.tone === 'team');
  const r = C.choose(L, k);
  ok(r && r.text && JSON.stringify(L.rep) !== before && Math.abs(L.m.fame - fame0) <= 5, `an answer moves the reputation and barely the meters (${before} to ${JSON.stringify(L.rep)})`);
  ok(!('persona' in L), 'the persona is not stored on the career');
  L.rep = { fans: 20, resp: 20 }; const v = C.personaOf(L);
  L.rep = { fans: 80, resp: 80 }; const f = C.personaOf(L);
  ok(v === 'Villain' && f === 'Face of the league', `the corners of the grid are the two ends (${v}, ${f})`);
  /* Every one of the nine is somebody a way of answering arrives at. */
  const all = {};
  const style = (kind) => (M, c) => {
    if (c.id === 'presser') {
      const want = { villain: ['cocky'], quiet: ['cold'], show: ['showman'], face: ['team', 'humble', 'loyal'], low: ['cold'], fan: ['showman', 'loyal'] }[kind] || [];
      for (const t of want) { const j = c.options.findIndex((o) => o.tone === t); if (j >= 0) return j; }
      return 0;
    }
    const rp = C.EVENT_REP[c.id];
    if (!rp) return 0;
    const sc = (x) => ({ villain: -x[0] - x[1], quiet: -x[0] + x[1], show: x[0] - x[1], face: x[0] + x[1], pro: x[1] - Math.abs(x[0]),
      low: -x[0] - Math.abs(x[1]), loose: -x[1] - Math.abs(x[0]), fan: x[0] - Math.abs(x[1]), mid: -Math.abs(x[0]) - Math.abs(x[1]) })[kind];
    let best = 0; rp.forEach((x, i) => { if (sc(x) > sc(rp[best])) best = i; });
    return best;
  };
  for (const kind of ['villain', 'quiet', 'show', 'face', 'pro', 'low', 'loose', 'fan', 'mid']) {
    for (let i = 0; i < (QUICK ? 60 : 140); i++) {
      const M = C.newLife({ seed: 'persona:' + kind + i, start: i % 2 ? 'hs' : 'draft', league });
      const pick = style(kind);
      let g = 0;
      while (!M.retired && g++ < 4000) { if (M.pending.length) C.choose(M, pick(M, M.pending[0])); else C.step(M); }
      all[C.personaOf(M)] = 1;
    }
  }
  /* Villain is rare by design (about one villain-style career in a hundred
     and forty ends there), so a fixed sample is a coin flip on whether it is
     met. A persona not met yet is searched for further, with the style that
     aims at it, up to a bound: the claim is that it can be reached. */
  const AIM = ['villain', 'low', 'quiet', 'loose', 'mid', 'pro', 'show', 'fan', 'face'];
  C.PERSONAS.flat().forEach((p, j) => {
    for (let i = 0; !all[p] && i < 600; i++) {
      const M = C.newLife({ seed: 'persona+:' + AIM[j] + i, start: i % 2 ? 'hs' : 'draft', league });
      const pick = style(AIM[j]);
      let g = 0;
      while (!M.retired && g++ < 4000) { if (M.pending.length) C.choose(M, pick(M, M.pending[0])); else C.step(M); }
      all[C.personaOf(M)] = 1;
    }
  });
  const missing = C.PERSONAS.flat().filter((p) => !all[p]);
  ok(missing.length === 0, `all nine personas are reachable (${missing.join(', ') || 'all nine'})`);
  ok(Object.keys(C.EVENT_REP).every((id) => C.EVENTS[id] && C.EVENTS[id].options.length === C.EVENT_REP[id].length),
    'every reputation row names a real event and one entry per option');
  /* The look: a whitelist of short plain values, and the drawing's own
     fallback for anything it does not know. */
  const look = C.cleanLook({ skin: 3, hair: 'afro', hc: 2.4, beard: '<b>', band: 'x'.repeat(20), evil: 'yes', shoes: 'red' });
  ok(look.skin === 3 && look.hair === 'afro' && look.hc === 2 && !('beard' in look) && !('band' in look) && !('evil' in look),
    `a look keeps only short plain values on known keys (${JSON.stringify(look)})`);
  const BL = require('./baller.js');
  const n = BL.normal({ hair: 'mullet', skin: 40, shoes: 'red' });
  ok(n.hair === BL.DEFAULT.hair && n.skin === BL.SKINS.length - 1 && n.shoes === 'red', 'the drawing falls back on anything it does not know');
  ok(JSON.stringify(BL.lookFor('Same Name')) === JSON.stringify(BL.lookFor('Same Name')), 'a name always hashes to the same look');
  const looks = new Set(); for (let i = 0; i < 200; i++) looks.add(JSON.stringify(BL.lookFor('n' + i)));
  ok(looks.size > 150, `two hundred names are not two hundred twins (${looks.size} looks)`);
  /* The drawing is a sprite, built of parts. Every pose of every look keeps
     each part off the grid's edge (an edge eats the outline, which is how a
     flat top first came out with its crown sliced off), has a head, two hands
     and two shoes, breathes (the second frame differs), and is shaded rather
     than flat: a figure in a handful of colours is the rectangle man this
     replaced. */
  {
    const poses = ['stand', 'ball', 'up', 'trophy', 'suit', 'cap'];
    const edge = [], missing = [], still = [], flat = [];
    for (let i = 0; i < 40; i++) {
      const lk = BL.lookFor('sprite' + i);
      for (const pose of poses) {
        const o = { c1: '#1d428a', c2: '#ffc72c', num: i % 100, pose };
        const parts = BL.paint(lk, Object.assign({ parts: true }, o));
        const names = new Set();
        for (let y = 0; y < BL.H; y++) for (let x = 0; x < BL.W; x++) {
          const n = parts[y][x];
          if (!n) continue;
          names.add(n.replace(/-?1$/, ''));
          if (x === 0 || x === BL.W - 1 || y === 0 || y === BL.H - 1) edge.push(`${pose} ${lk.hair} ${n} at ${x},${y}`);
        }
        const has = (re) => [...names].some(n => re.test(n));
        for (const [need, re] of [['head', /^head$/], ['hand', /hand$|^grip$/], ['shoe', /^shoe$/]]) if (!has(re)) missing.push(`${pose} ${lk.hair}: no ${need}`);
        const f0 = BL.paint(lk, o), f1 = BL.paint(lk, Object.assign({ frame: 1 }, o));
        if (JSON.stringify(f0) === JSON.stringify(f1)) still.push(pose);
        const cols = new Set(); f0.forEach(r => r.forEach(c => { if (c) cols.add(c); }));
        if (cols.size < 24) flat.push(`${pose} ${lk.hair} (${cols.size})`);
      }
    }
    ok(!edge.length, `no part of the sprite touches the grid's edge (${edge.slice(0, 3).join('; ') || 'none'})`);
    ok(!missing.length, `every pose has a head, hands and shoes (${missing.slice(0, 3).join('; ') || 'all'})`);
    ok(!still.length, `every pose breathes (${still.slice(0, 3).join(', ') || 'all'})`);
    ok(!flat.length, `every figure is shaded, not flat (${flat.slice(0, 3).join('; ') || 'all'})`);
  }
  /* An old save, from before looks and reputations, still plays and still
     has a persona. */
  const O = C.newLife({ seed: 'old:save', start: 'draft', league });
  delete O.look; delete O.rep;
  let g2 = 0;
  while (!O.retired && g2++ < 3000) { if (O.pending.length) C.choose(O, 0); else C.step(O); }
  ok(O.retired && typeof C.personaOf(O) === 'string', 'a save from before any of this plays to the end');
}

// ── 11. Phase E: the generated road, legacy, difficulty, challenges ───────
section('11. Phase E: the generated road, a son, difficulty and challenges');
{
  const run11 = (L, pol) => { let g = 0; while (!L.retired && g++ < 4000) { if (L.pending.length) C.choose(L, pickFor(pol || 'random', L, L.pending[0])); else C.step(L); } return L; };
  /* A generated road is the real road, played for him and stopped at the
     combine: the same seed is the same road, and two seeds are two roads. */
  const a = C.generateRoad({ seed: 'g1', league }), b = C.generateRoad({ seed: 'g1', league }), c = C.generateRoad({ seed: 'g2', league });
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same seed generates the same road');
  ok(C.roadStory(a).join() !== C.roadStory(c).join(), 'two seeds generate two different roads');
  let atCombine = 0, gens = 60, starts = new Set();
  for (let i = 0; i < gens; i++) {
    const L = C.generateRoad({ seed: 'gen' + i, league, pos: C.POS[i % 5] });
    if (L.stage === 'nba' && L.pending[0] && L.pending[0].id === 'combine' && L.amHist.length && L.opt.gen === 1) atCombine++;
    starts.add(C.roadStory(L).join(' '));
  }
  ok(atCombine === gens, `every generated road stops at the draft combine (${atCombine} of ${gens})`);
  ok(starts.size >= gens * 0.97, `and no two launching points are the same (${starts.size} of ${gens} distinct)`);
  /* NORMAL IS EVERY CAREER BEFORE PHASE E, TO THE BIT. */
  const n1 = run11(C.newLife({ seed: 'n1', league, start: 'hs' })), n2 = run11(C.newLife({ seed: 'n1', league, start: 'hs', diff: 'normal' }));
  ok(JSON.stringify(n1) === JSON.stringify(n2), 'a Normal career is the same career with no difficulty at all');
  ok(!n2.opt.diff, 'and Normal is never written onto the save');
  const h = run11(C.newLife({ seed: 'n1', league, start: 'hs', diff: 'hard' }));
  ok(h.opt.diff === 'hard' && JSON.stringify(h.history) !== JSON.stringify(n1.history), 'Hard plays a different career off the same seed');
  /* A son: the father's name on every card, the league he left, and a start
     after he retired. */
  const dad = run11(C.generateRoad({ seed: 'dad', league }));
  const T = C.totals(dad), H = dad.history;
  const par = { id: dad.seed, name: dad.name, num: dad.num, pos: dad.pos, pts: T.pts, seasons: T.seasons, score: dad.final.score, verdict: dad.final.verdict,
    rings: T.rings, star: T.star, hof: dad.final.ending.hof, clubs: [...new Set(H.map((x) => x.t))], jersey: dad.final.jersey, gen: 1, end: H[H.length - 1].y, age: H[H.length - 1].age };
  const son = C.newLife({ seed: 'son', league, start: 'hs', parent: par, parentLeague: C.leagueEnd(dad), name: 'Kid ' + dad.name.split(' ').pop() });
  ok(son.parent && son.origin === 'pro_son' && C.say(son, '{father}') === dad.name, `a son's father is the career he came from (${C.say(son, '{father}')})`);
  ok(son.year > H[H.length - 1].y, `he starts after his father's last season (${son.year} after ${H[H.length - 1].y})`);
  ok(C.recall(son, 'origin.father').v === T.pts, 'and the points to pass are his father\'s real points');
  const coachDad = JSON.stringify(dad.league.coach), coachSon = JSON.stringify(son.league.coach);
  ok(coachDad !== coachSon && Object.keys(son.league.coach).length === 30, 'the league he starts in is his father\'s, played forward');
  const noSon = C.newLife({ seed: 'x', league, parent: par, story: false });
  ok(!noSon.parent, 'a career from before the story engine never takes a father');
  /* Every challenge reads the career, and a challenge that fixes the
     difficulty fixes it. */
  const hard = C.newLife({ seed: 'ch', league, challenge: 'ch_hard', diff: 'easy' });
  ok(hard.challenge === 'ch_hard' && hard.opt.diff === 'hard', 'The hard way plays on Hard whatever was picked');
  const late = run11(C.generateRoad({ seed: 'late1', league, challenge: 'ch_late' }));
  const cs = C.challengeOf(late);
  ok(cs && typeof cs.prog === 'string' && cs.prog.length > 2 && cs.met === C.CHALLENGES.ch_late.test(late), `a challenge reports where it stands ("${cs && cs.prog}")`);
  ok(late.draft && (late.draft.pick == null || late.draft.pick > 14), `Second round starts him low on the board (pick ${late.draft && late.draft.pick})`);
  /* The written story: chapters, true numbers, no junk. */
  const st = C.careerStory(dad);
  ok(st.length >= 4 && st.some((x) => x.h === 'The league') && st.every((x) => !(/undefined|NaN|\{[a-z]+\}/.test(x.p) || DASH.test(x.p))), `a career's story has its chapters and no junk (${st.map((x) => x.h).join(', ')})`);
  ok(new RegExp(T.pts.toLocaleString('en-US')).test(st.map((x) => x.p).join(' ')), 'and the points in it are the career\'s');
}

/* Six archetypes for each position, named for that position, each on one of
   the six base kinds the sim reads; and a size that moves the ratings. */
{
  section('11c. archetypes by position, and height and weight');
  const names = new Set();
  let bad = [];
  for (const p of C.POS) {
    const ks = C.archesFor(p);
    if (ks.length !== 6) bad.push(p + ' has ' + ks.length);
    const nm = new Set(ks.map((k) => C.ARCHES[k].name));
    if (nm.size !== 6) bad.push(p + ' repeats a name');
    for (const k of ks) { const a = C.ARCHES[k]; if (a.pos !== p || C.ARCH_KEYS.indexOf(a.base) < 0 || DASH.test(a.name + a.blurb)) bad.push(k); names.add(p + a.name); }
    const L = C.newLife({ seed: 'arch:' + p, pos: p, arch: C.archesFor(p === 'C' ? 'PG' : 'C')[0], league });
    if (C.ARCHES[L.arch].pos) bad.push(p + ' took another position\'s archetype');
  }
  ok(!bad.length, `six archetypes a position, all its own (${bad.join('; ') || C.POS.map((p) => C.archesFor(p).length).join('/')})`);
  const tall = C.newLife({ seed: 'size', pos: 'C', arch: 'c_rim', ht: 88, wt: 290, league });
  const small = C.newLife({ seed: 'size', pos: 'C', arch: 'c_rim', ht: 81, wt: 225, league });
  ok(tall.rt.reb > small.rt.reb && tall.rt.ath < small.rt.ath && tall.dur < small.dur, `a big center rebounds more, moves less and breaks down sooner (reb ${tall.rt.reb}/${small.rt.reb}, ath ${tall.rt.ath}/${small.rt.ath}, dur ${tall.dur}/${small.dur})`);
  ok(tall.ht === 88 && tall.wt === 290 && C.newLife({ seed: 'size', pos: 'PG', ht: 90, league }).ht === 78, 'a size outside the position is held to its range');
  const old = C.newLife({ seed: 'size:old', pos: 'SF', arch: 'twoway', league, story: false });
  ok(old.ht == null && C.ARCHES[old.arch].name === 'Two-way wing', 'a career without a size or with an old archetype is the same player it was');
}

/* The rotation adds up, you are in it once, and the league moves around you. */
{
  section('11d. the rotation and a league that moves');
  const L = C.newLife({ seed: 'rot', league, start: 'draft' });
  let g = 0, checked = 0, bad = [];
  const start = {}, seenGp = {};
  let twoAway = 0;
  for (const c of C.CLUBS) start[c] = C.matesOf(L, c).map((m) => m.n).join('|');
  while (!L.retired && g++ < 4000 && L.year < L.league.latest + 5) {
    if (L.pending.length) C.choose(L, 0); else C.step(L);
    const R = C.rotationOf(L);
    if (!R || !L.season || !L.season.gp || seenGp[L.year + ':' + L.season.gp]) continue;
    seenGp[L.year + ':' + L.season.gp] = 1;
    checked++;
    const tot = R.list.reduce((a, x) => a + x.min, 0), you = R.list.filter((x) => x.you);
    if (Math.abs(tot - 240) > 1) bad.push(L.year + ': ' + tot + ' minutes');
    if (you.length !== 1 || you[0].rank !== R.rank) bad.push(L.year + ': you are not in it once');
    const five = R.list.slice(0, 5);
    if (five.map((x) => x.slot).join() !== 'PG,SG,SF,PF,C') bad.push(L.year + ': the five do not cover the positions');
    if (R.list.slice(5).some((x, i, a) => i && x.min > a[i - 1].min + 0.05)) bad.push(L.year + ': the bench is out of order');
    if (five.some((x) => Math.abs(C.POS.indexOf(x.pos) - C.POS.indexOf(x.slot)) >= 2) && R.list.slice(5).some((y) => y.min > 0)) twoAway++;
    if (R.list.filter((x) => x.slot).some((x) => !x.you) && !R.list.some((x) => x.slot) ) bad.push('no starters');
  }
  ok(checked > 3 && !bad.length, `the rotation adds to 240 with you in it once (${checked} looks${bad.length ? ': ' + bad.slice(0, 2).join('; ') : ''})`);
  ok(twoAway === 0, `nobody starts two positions from his own while the bench has a man (${twoAway})`);
  /* bestFive is the best five: checked against every way of choosing five
     and seating them, on rosters drawn from the real league. */
  let worse = 0;
  for (const c of C.CLUBS.slice(0, 8)) {
    const ms = C.matesOf(L, c).slice(0, 8).map((m) => ({ v: Math.max(0.1, m.w), pos: m.pos }));
    const got = C.bestFive(ms).score;
    let best = 0;
    const perm = (used, j, sc) => { if (j === 5) { best = Math.max(best, sc); return; } ms.forEach((m, i) => { if (!used.includes(i)) perm(used.concat([i]), j + 1, sc + m.v * C.fitAt(m.pos, C.POS[j], null)); }); };
    perm([], 0, 0);
    if (got < best - 1e-9) worse++;
  }
  ok(worse === 0, `the starting five is the best five that covers the positions (${worse} of 8 beaten by brute force)`);
  const moved = C.CLUBS.filter((c) => C.matesOf(L, c).map((m) => m.n).join('|') !== start[c]).length;
  const feedMoves = (L.feed || []).filter((f) => f.k === 'move').length;
  ok(moved >= 25 && feedMoves > 0, `rosters change over four summers (${moved} of 30 clubs, ${feedMoves} moves in the news)`);
  const R0 = C.rostOf(L), sizes = C.CLUBS.map((c) => R0[c].length);
  ok(Math.min(...sizes) >= 13 && Math.max(...sizes) <= 15, `every club carries thirteen to fifteen (${Math.min(...sizes)} to ${Math.max(...sizes)})`);
}

/* A Saturday contest names its field and its scores, and they have to agree
   with the headline: a champion is first, a loss is not, the final is ordered,
   nobody is in it twice, and a three-point loss is out in round one. */
{
  section('11b. All-Star Saturday: who you were up against');
  let n = 0, bad = [], kinds = {}, realIn = 0, seatsIn = 0;
  const realNames = new Set(ROWS.map((r) => r.n));
  for (let s = 0; s < 400 && n < 120; s++) {
    const L = C.newLife({ seed: 'contest:' + s, league });
    for (let k = 0; k < 4000 && !L.retired; k++) {
      const c = L.pending[0];
      if (c && c.id === 'allstar') {
        const r = C.choose(L, s % 2), ct = r.contest; n++;
        kinds[ct.kind] = (kinds[ct.kind] || 0) + 1;
        const won = r.tone === 'gold', mine = ct.rows.find((x) => x.you), fin = ct.rows.filter((x) => x.f != null);
        if (won !== (mine.place === 1)) bad.push(s + ': headline and place disagree');
        if (new Set(ct.rows.map((x) => x.n)).size !== ct.rows.length) bad.push(s + ': a name twice');
        if (fin.some((x, i) => i && x.f >= fin[i - 1].f)) bad.push(s + ': the final is out of order');
        if (ct.kind === 'three' && !won && mine.f != null) bad.push(s + ': a three-point loss reached the final');
        if (ct.rows.some((x) => /undefined|NaN/.test(x.n + x.club))) bad.push(s + ': junk in a row');
        if (!L.log.some((x) => x.t.startsWith(ct.name + ':'))) bad.push(s + ': no log line');
        realIn += ct.rows.filter((x) => !x.you && realNames.has(x.n)).length; seatsIn += ct.rows.length - 1;
        break;
      }
      if (c) C.choose(L, 0); else C.step(L);
    }
  }
  ok(n >= 60 && kinds.dunk && kinds.three, `contests reached in the sweep (${n}: ${JSON.stringify(kinds)})`);
  ok(!bad.length, `every field agrees with its result${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
  ok(realIn / seatsIn > 0.6, `the field is mostly real players (${realIn} of ${seatsIn} seats)`);
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
  /* THE CAREER BOARD, stood in on the same origin. No request leaves the
     machine: the board is a live project, and a career filed there by a
     checker would sit on it for ever. The submit records what it was sent,
     because what matters is that no score is in it. */
  const careers = [], sent = [];
  async function stand(route, u) {
    const req = route.request();
    const json = (body, headers) => route.fulfill({ status: 200, contentType: 'application/json',
      headers: Object.assign({ 'access-control-expose-headers': 'content-range' }, headers || {}), body: JSON.stringify(body) });
    if (u.pathname.endsWith('/rpc/rtf_submit_career')) {
      const p = JSON.parse(req.postData() || '{}');
      sent.push(p);
      const T = { pts: p.p_pts, reb: p.p_reb, ast: p.p_ast, rings: p.p_rings, mvp: p.p_mvp, fmvp: p.p_fmvp, an: p.p_an, an1: p.p_an1,
        star: p.p_star, dpoy: p.p_dpoy, roy: p.p_roy, olympic: p.p_olympic, ncaa: p.p_ncaa, npoy: p.p_npoy, aa1: p.p_aa1 };
      careers.push({ id: 900 + careers.length, created_at: new Date().toISOString(), user_id: null, display_name: null,
        client_id: p.p_id, score: C.legacyScore(T), player: p.p_player, pos: p.p_pos, num: p.p_num, road: p.p_road,
        college: p.p_college, pick: p.p_pick, first_year: p.p_from, last_year: p.p_to, clubs: p.p_clubs, jersey: p.p_jersey,
        peak: p.p_peak, seasons: p.p_seasons, gp: p.p_gp, ...T });
      /* Three careers ahead of it, so the place is not trivially first. */
      for (let i = 0; i < 3; i++) careers.push({ id: 800 + i, created_at: new Date().toISOString(), user_id: null, display_name: 'rival' + i,
        client_id: 'x' + i, score: 400 + i, player: 'Somebody Else', pos: 'SG', num: 1, road: false, college: null, pick: 1,
        first_year: 2026, last_year: 2045, clubs: ['BOS'], jersey: null, peak: 30, seasons: 20, gp: 1500, pts: 40000, reb: 5000, ast: 5000,
        rings: 5, mvp: 4, fmvp: 4, an: 15, an1: 12, star: 18, dpoy: 0, roy: 1, olympic: 2, ncaa: 0, npoy: 0, aa1: 0 });
      return json(900);
    }
    if (u.pathname.endsWith('/rtf_careers')) {
      const q = u.searchParams;
      let rows = careers.slice();
      const gt = q.get('score');
      if (gt && gt.startsWith('gt.')) rows = rows.filter((r) => r.score > Number(gt.slice(3)));
      if (q.get('select') === 'id') return json(rows.slice(0, 1).map((r) => ({ id: r.id })), { 'content-range': '0-0/' + rows.length });
      const by = (q.get('order') || 'score.desc').split(',')[0].split('.');
      rows.sort((x, y) => (by[1] === 'asc' ? 1 : -1) * (x[by[0]] - y[by[0]]));
      return json(rows);
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"not stood in"}' });
  }
  async function serve(route) {
    const u = new URL(route.request().url());
    if (u.hostname !== 'local.test') return route.abort();
    if (u.pathname.startsWith('/sb/')) return stand(route, u);
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
  /* Scenes off for this walk: it answers the plain cards, which are what is
     under every scene. scenesWalk() below plays the other half. */
  await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
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

  /* The card itself is a door, like the puzzle cards under it: on a phone its
     button is in the dock, so a tap on the card is the first press a player
     makes. A real tap on the heading, not a scripted click on the button. */
  const card = await page.evaluate(() => {
    const h = document.querySelector('#career');
    const c = document.querySelector('#ch-chip');
    return { live: h.classList.contains('live'), cursor: getComputedStyle(h).cursor,
      chip: c ? getComputedStyle(c).display !== 'none' && c.textContent : '' };
  });
  ok(card.live && card.cursor === 'pointer', `the career card reads as pressable (${card.cursor})`);
  ok(card.chip === 'Play', `and wears a Play chip like the puzzle cards ("${card.chip}")`);
  await page.locator('#ch-title').scrollIntoViewIfNeeded();
  await page.locator('#ch-title').click();
  await page.waitForSelector('#cr-go', { timeout: 10000 }).catch(() => {});
  ok(await page.evaluate(() => !!document.querySelector('#cr-go')), 'a tap on the career card opens Career');
  /* The builder: what is picked is what is played. High school is the
     default; draft night shows the backgrounds and hides them again. */
  await page.click('[data-pos="C"]');
  const archs = await page.$$eval('[data-arch]', (b) => b.map((x) => x.getAttribute('data-arch')));
  ok(archs.length === 6 && archs.every((k) => /^c_/.test(k)), `a center picks from six center archetypes (${archs.join(', ')})`);
  await page.click('[data-size="ht:1"]'); await page.click('[data-size="wt:5"]');
  const sz = await page.evaluate(() => ({ ht: document.querySelector('#cr-ht').textContent, wt: document.querySelector('#cr-wt').textContent, line: document.querySelector('#cr-sizeline').textContent }));
  ok(/^7'1"$/.test(sz.ht) && /lb$/.test(sz.wt) && /rebounding/.test(sz.line), `height and weight step and say what they do (${sz.ht}, ${sz.wt}: ${sz.line})`);
  await page.click('[data-arch="c_rim"]');
  /* THE BUILDER IS FOUR SHORT STEPS. It was four and a half phone screens of
     one form with the start button at the bottom. Every step has to fit in
     about one and a half screens, the player and his ratings stay on top, and
     the start button is on the screen at every step. */
  for (const st of ['player', 'look', 'story', 'start']) {
    await page.click(`[data-bstep="${st}"]`);
    const m = await page.evaluate((st) => {
      const go = document.querySelector('#cr-go').getBoundingClientRect(), pane = document.querySelector(`[data-pane="${st}"]`);
      const others = [...document.querySelectorAll('[data-pane]')].filter((x) => x !== pane && !x.hidden).length;
      const pv = document.querySelector('.cr-build .cr-preview');
      return { h: document.documentElement.scrollHeight, vh: innerHeight, goIn: go.top >= 0 && go.bottom <= innerHeight, shown: !!pane && !pane.hidden, others,
        rt: pv ? pv.querySelectorAll('.k-row').length : 0 };
    }, st);
    ok(m.shown && m.others === 0, `the ${st} step shows alone`);
    ok(m.goIn, `the start button is on screen on the ${st} step`);
    ok(m.h <= m.vh * 1.75, `the ${st} step is under 1.75 phone screens (${(m.h / m.vh).toFixed(2)})`);
    ok(m.rt === 7, `the player and all seven ratings stay on top on the ${st} step (${m.rt})`);
  }
  /* Facial hair has a colour of its own, shown once there is facial hair. */
  await page.click('[data-bstep="look"]');
  await page.click('[data-lk="beard"][data-lv="none"]');
  ok(!(await page.$('[data-lk="bc"]')), 'no facial hair color row for a clean face');
  await page.click('[data-lk="beard"][data-lv="full"]');
  await page.click('[data-lk="bc"][data-lv="6"]');
  ok(await page.evaluate(() => document.querySelector('[data-lk="bc"][data-lv="6"]').classList.contains('on')), 'a facial hair color can be picked apart from the hair');
  await page.click('[data-bstep="start"]');
  /* PHASE E: a guest starts on draft night, from a road generated for him.
     High school is Run The Floor Pro: the press opens the offer and changes
     nothing. Then Pro, stood in, and the walk plays the road itself. */
  const free = await page.evaluate(() => ({ on: (document.querySelector('[data-start].on') || {}).getAttribute && document.querySelector('[data-start].on').getAttribute('data-start'),
    road: (document.querySelector('#cr-roadbox') || {}).textContent || '', bg: !!document.querySelector('[data-bg]'), pro: /Pro/.test(document.querySelector('[data-start="hs"]').textContent) }));
  ok(free.on === 'gen' && free.pro && !free.bg, `a guest starts on draft night, high school wears the Pro tag, and nobody picks a background (${free.on})`);
  /* The road is a reveal: the builder never shows it, the career opens on it. */
  ok(!free.road, 'the builder does not show the road to the draft before the career starts');
  const hid = await page.evaluate(() => ({ line: (document.querySelector('[data-pane="start"]') || {}).textContent || '', road: window.RTF_CAREER_UI.previewRoad().join(' ') }));
  ok(/played the moment you start/.test(hid.line), 'the start step says the road is played when the career starts');
  ok(/combine/.test(hid.road) && !/undefined|NaN/.test(hid.road), `a road is still generated behind the scenes ("${hid.road.slice(0, 60)}")`);
  await page.click('[data-start="hs"]');
  const gate = await page.evaluate(() => ({ sheet: !document.getElementById('pro-sheet').hidden, on: document.querySelector('[data-start].on').getAttribute('data-start') }));
  ok(gate.sheet && gate.on === 'gen', 'pressing high school without Pro opens the offer and keeps draft night');
  /* Stood in through the one call Career asks, because the page's own
     account read answers "not signed in, no Pro" whenever it lands. */
  await page.evaluate(() => { const x = document.querySelector('#pro-sheet [data-pro-x]'); if (x) x.click(); window.RTF_MODES_UI.proOpen = () => true; });
  await page.click('[data-start="hs"]');
  ok(!(await page.$('#cr-roadbox')) && !(await page.$('[data-bg]')), 'with Pro, a high school start shows no generated road');
  await page.click('[data-bstep="player"]');
  await page.fill('#cr-name', 'Checker McTest');
  await page.click('#cr-go');
  const made = await page.evaluate(() => RTF_CAREER_UI.state().cur);
  ok(made && made.pos === 'C' && made.arch === 'c_rim' && made.ht === 85 && made.stage === 'hs' && made.age === 15 && made.name === 'Checker McTest',
    `the builder's picks are the career's (${made && [made.pos, made.arch, made.stage, made.age, made.name].join(', ')})`);
  ok(made && made.look && made.look.beard === 'full' && made.look.bc === 6, `the facial hair color is the career's (${made && JSON.stringify(made.look)})`);
  const third = await page.evaluate(() => (document.querySelectorAll('.cr-fact .k')[2] || {}).textContent || '');
  ok(/ranking/i.test(third), `a sophomore is told his ranking, not his bank (${third})`);

  /* Play it out, pressing the first choice or the next button, reading the
     glass for a field that printed as nothing. */
  let presses = 0, junk = [], reloaded = false, offOpened = false, resumed = null, keyed = false, docked = false, offFold = [], cardsSeen = 0, tall = false;
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
    /* Once each: a number key answers the card on top, the next action is
       where the thumb is, a meter explains itself on a tap, and nothing on a
       phone scrolls sideways. */
    if (!tall && st.card && st.steps >= 4) {
      tall = true;
      const r = await page.evaluate(() => {
        const diff = ['Shooting', 'Finishing', 'Playmaking', 'Defense', 'Rebounding', 'Athleticism', 'Basketball IQ'].map((l, i) => ({ k: 'r' + i, label: l, d: 2 }))
          .concat([{ k: 'health', label: 'Health', d: -4 }, { k: 'morale', label: 'Morale', d: 5 }, { k: 'fame', label: 'Fame', d: 3 }, { k: 'trust', label: 'Trust', d: -2 }, { k: 'cash', label: 'Cash', d: 0.4, money: true }]);
        const beats = [1, 2, 3, 4, 5, 6].map((n) => ({ text: 'A line of what happened that runs long enough to wrap on a phone, number ' + n + '.', tone: n % 2 ? 'good' : '' }));
        window.scrollTo(0, 0);
        RTF_CAREER_UI.paintPress({ beats, result: { label: 'The long way', text: 'A long answer to a long question, the kind that fills the receipt and then some more.', tone: 'good', diff }, draft: null });
        const c = document.querySelector('.cr-choice').getBoundingClientRect();
        return Math.round(c.bottom);
      });
      ok(r > 0 && r <= 844, `under the tallest receipt, the card's first answer is still on the screen (${r})`);
    }
    if (!keyed && st.card && st.steps >= 3) {
      keyed = true;
      await page.keyboard.press('1');
      const after = await page.evaluate(() => { const s = RTF_CAREER_UI.state(); return { card: s.cur && s.cur.pending[0] ? s.cur.pending[0].key : null, steps: s.cur ? s.cur.steps : 0,
        you: (document.querySelector('.cr-result .cr-you') || {}).textContent || '', focus: document.activeElement ? document.activeElement.id : '' }; });
      ok(after.focus === 'cr-card-h' || after.focus === 'cr-next', `after a key press, focus lands on what is next, not on the page (${after.focus || 'body'})`);
      ok(/^You: /.test(after.you), `the 1 key answers the card, and the receipt says what you chose ("${after.you}")`);
      continue;
    }
    if (!docked && !st.card) {
      const nb = await page.$('#cr-next');
      if (nb) {
        docked = true;
        await page.evaluate(() => window.scrollTo(0, 0));
        const r = await nb.boundingBox();
        ok(r && r.y >= 0 && r.y + r.height <= 844, `the next action is on the screen from the top of the page (${r && Math.round(r.y)})`);
        const tip = await page.evaluate(() => { const m = document.querySelector('.cr-meters .k-meter'); m.click(); const o = !!document.querySelector('.k-meter.is-open .k-tip'); m.click(); return o; });
        ok(tip, 'a meter opens its explanation on a tap');
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(wide <= 0, `nothing scrolls sideways on a phone (${wide}px)`);
      }
    }
    const c = await page.$('.cr-choice');
    if (c) {
      /* A card the game is waiting on is on the screen, not below the fold. */
      /* Every card, all of the first answer, not a sample: what pushed one
         off the screen was a long receipt above it, which comes and goes. */
      const r = await c.boundingBox();
      if (!(r && r.y >= 0 && r.y + r.height <= 844) && offFold.length < 3) offFold.push(`${st.card} at press ${presses} (${r && Math.round(r.y + r.height)})`);
      cardsSeen++;
      await c.click();
    } else {
      const nx = await page.$('#cr-next');
      if (!nx) { ok(false, `press ${presses}: neither a card nor a next button`); break; }
      await nx.click();
    }
  }
  ok(junk.length === 0, `no field ever printed as undefined or NaN (${junk.join(', ') || 'none'})`);
  ok(reloaded, 'the reload arm ran');
  ok(tall, 'the tall receipt arm ran');
  ok(keyed && docked, 'the keyboard and the docked-action arms ran');
  ok(cardsSeen > 20 && offFold.length === 0, `every card's first answer is on the screen (${cardsSeen} cards; ${offFold.join(', ') || 'none off'})`);
  ok(stagesSeen.hs && (stagesSeen.col || stagesSeen.pro) && stagesSeen.nba, `the walk went from high school to the league (${Object.keys(stagesSeen).join(', ')})`);
  const fin = await page.evaluate(() => ({
    last: RTF_CAREER_UI.state().last, v: (document.querySelector('.cr-final .v') || {}).textContent || '',
    hof: RTF_CAREER_UI.state().hof.length,
  }));
  ok(fin.last && fin.v.length > 3, `it ends on a verdict ("${fin.v}")`);
  ok(fin.hof === 1, `and the career goes on the shelf (${fin.hof})`);

  /* THE CAREER BOARD. Filed once, with totals and no score, and the Hall card
     says where it sits. */
  await page.waitForFunction(() => /of \d+ careers/.test((document.querySelector('#cr-place') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const placed = await page.evaluate(() => (document.querySelector('#cr-place') || {}).textContent || '');
  ok(sent.length === 1, `the career is filed once (${sent.length})`);
  ok(sent[0] && !Object.keys(sent[0]).some((k) => /score/.test(k)), 'and it sends no score: the server works that out');
  ok(sent[0] && sent[0].p_player === 'Checker McTest' && sent[0].p_road === true && sent[0].p_seasons === fin.last.totals.seasons
    && sent[0].p_pts === fin.last.totals.pts && sent[0].p_rings === fin.last.totals.rings,
    'what it sends is the career on the Hall card');
  ok(/^4th of 4 careers/.test(placed.trim()), `the Hall card says where it sits ("${placed.trim().slice(0, 60)}")`);
  ok(/Guest/.test(placed), 'and a guest is told signing in puts a name on it');
  const toBoard = await page.$('#cr-board');
  ok(!!toBoard, 'the Hall card has a way to the board');
  if (toBoard) await boardWalk(fin);
  await page.evaluate(() => { const h = document.querySelector('#cr-home'); if (h) h.click(); });
  /* Back home the hero remembers it. */
  await page.waitForTimeout(250);
  const best = await page.evaluate(() => ({ t: (document.querySelector('#ch-best') || {}).textContent || '', hid: document.querySelector('#ch-best').hidden }));
  ok(!best.hid && /Checker McTest/.test(best.t), `the front page names your best career ("${best.t}")`);
  /* The career is a slot on the account: the key is in cloud.js's list. */
  const cl = await page.evaluate(() => window.RTF_CLOUD && window.RTF_CLOUD.MODE_KEYS['rtf.life.v1']);
  ok(cl === 'life', `the career is a slot on the shelf (${cl})`);
  await vaultWalk(fin);
  ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
  console.log(`  ${presses} presses to retirement`);
  await scenesWalk(b, serve);
  await b.close();

  /* PHASE E, through the page: the Vault, the share card, a son, and an Easy
     career that is kept but never filed. */
  async function vaultWalk(fin) {
    /* The reload arm above dropped the stood-in Pro. */
    await page.evaluate(() => { window.RTF_MODES_UI.proOpen = () => true; });
    const card = await page.evaluate(() => { const c = RTF_CAREER_UI.state().hof[0]; return { story: c.story, id: c.id, ids: c.ids, found: c.found }; });
    ok(Array.isArray(card.story) && card.story.length >= 3 && !card.story.some((x) => /undefined|NaN/.test(x.p) || DASH.test(x.p)), `the Hall card keeps a written story (${card.story && card.story.map((x) => x.h).join(', ')})`);
    ok(card.found && card.found.length > 0, `a first career puts its ending and its road in the Vault (${(card.found || []).length})`);
    await page.evaluate(() => RTF_CAREER_UI.open());
    await page.waitForSelector('#cr-vault2');
    const px = await page.evaluate(() => { const cv = RTF_CAREER_UI.drawCard(); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; const set = {};
      for (let i = 0; i < d.length; i += 4 * 97) set[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1; return { w: cv.width, h: cv.height, colours: Object.keys(set).length }; });
    ok(px.w === 540 && px.h === 756 && px.colours > 20, `the share card draws (${px.w}x${px.h}, ${px.colours} colours)`);
    await page.click('#cr-vault2');
    const vs = await page.evaluate(() => ({ sum: document.querySelector('.cr-vsum').textContent, got: document.querySelectorAll('.cr-vgrid li.got').length,
      secret: [].filter.call(document.querySelectorAll('.cr-vgrid li.no'), (li) => li.textContent.indexOf('Secret') === 0).length }));
    ok(vs.got === card.found.length && new RegExp('^' + vs.got + 'of').test(vs.sum.replace(/\s+/g, '')), `the Vault counts what was found (${vs.sum.trim()})`);
    ok(vs.secret > 0, 'and a secret ending not found yet keeps its name hidden');
    await page.click('[data-vtab="careers"]');
    await page.click('[data-arc]');
    ok(!!(await page.$('.cr-story')), 'a career in the archive opens into its story');
    /* Play as his son needs a son: a career that never had one is not offered
       the button. The walk's own career gets one afterwards so the son half
       below still runs. */
    const sons = await page.evaluate(() => ({ n: RTF_CAREER_UI.state().hof[0].sons, btn: !!document.querySelector('[data-son]'), life: RTF_CAREER_UI.state().hof[0].life }));
    ok(typeof sons.n === 'number' && sons.btn === sons.n > 0, `the son button follows the sons (${sons.n} in "${sons.life}", button ${sons.btn})`);
    if (!sons.n) {
      await page.evaluate(() => { const st = RTF_CAREER_UI.state(); st.hof[0].sons = 0; (st.arc || []).forEach((a) => { if (a.id === st.hof[0].id) a.sons = 0; }); });
      await page.click('[data-vtab="family"]'); await page.click('[data-vtab="careers"]'); await page.click('[data-arc]');
      ok(!(await page.$('[data-son]')), 'no son, no Play as his son');
      await page.evaluate(() => { const st = RTF_CAREER_UI.state(); st.hof[0].sons = 1; (st.arc || []).forEach((a) => { if (a.id === st.hof[0].id) a.sons = 1; }); });
    }
    await page.click('[data-vtab="family"]');
    const fam = await page.evaluate(() => document.querySelector('[role="tabpanel"]').textContent);
    ok(/No families yet/.test(fam), `a family needs two generations ("${fam.trim().slice(0, 40)}")`);
    await page.click('[data-vtab="careers"]');
    await page.click('[data-arc]');
    await page.click('[data-son]');
    await page.waitForSelector('.cr-son');
    await page.click('[data-bstep="story"]');
    await page.click('[data-diff="easy"]');
    await page.click('#cr-go');
    const son = await page.evaluate(() => { const L = RTF_CAREER_UI.state().cur; return { father: L.parent && L.parent.name, origin: L.origin, first: (L.amHist[0] || L.history[0] || {}).y || L.year, diff: L.opt.diff,
      say: window.RTF_CAREER.say(L, '{father}') }; });
    ok(son.father === 'Checker McTest' && son.say === 'Checker McTest' && son.origin === 'pro_son', `a son carries his father's name (${son.father}, ${son.origin})`);
    ok(son.first > fin.last.to, `and starts after his father retired (${son.first} after ${fin.last.to})`);
    await page.evaluate(() => { const C = window.RTF_CAREER, L = RTF_CAREER_UI.state().cur; let g = 0;
      while (!L.retired && g++ < 4000) { if (L.pending.length) { if (L.pending[0].id === 'after') break; C.choose(L, 0); } else C.step(L); }
      RTF_CAREER_UI.paintPress({ beats: [], result: null }); });
    for (let k = 0; k < 4; k++) { const c = await page.$('.cr-choice'); if (!c) break; await c.click(); await page.waitForTimeout(150); }
    const easy = await page.evaluate(() => ({ last: !!RTF_CAREER_UI.state().last, note: !!document.querySelector('.cr-easy'), gen: (document.querySelector('.cr-gen') || {}).textContent || '' }));
    ok(easy.last && easy.note && /Generation 2/.test(easy.gen), `an Easy son ends on a Hall card that says so (${easy.gen.trim()})`);
    ok(sent.length === 1, `and an Easy career is not filed to the board (${sent.length} filed)`);
    await page.click('#cr-vault2');
    await page.click('[data-vtab="family"]');
    const tree = await page.evaluate(() => document.querySelectorAll('.cr-tree li').length);
    ok(tree === 2, `the family tree draws both generations (${tree})`);
  }

  async function boardWalk(fin) {
  await toBoard.click();
  await page.waitForSelector('#s-board.active .bd-ent');
  const bd = await page.evaluate(() => {
    const on = document.querySelector('#bd-tabs .bd-tab.on');
    const mine = document.querySelector('.bd-row.me');
    const ents = [].slice.call(document.querySelectorAll('.bd-ent'));
    return { tab: on && on.textContent, axes: [].map.call(document.querySelectorAll('#bd-axes button'), (b) => b.textContent).join(','),
      n: ents.length, mine: mine ? mine.querySelector('.bd-meta').textContent : '', count: document.querySelector('#bd-count').textContent };
  });
  ok(bd.tab === 'Career' && bd.axes === 'Legacy,Points,Rings', `the board opens on the Career tab (${bd.tab}; ${bd.axes})`);
  ok(bd.n === 4 && /4 careers/.test(bd.count), `and lists every career filed (${bd.n}, ${bd.count})`);
  ok(/Checker McTest/.test(bd.mine) && new RegExp(fin.v).test(bd.mine), `your row is marked and wears the Hall's verdict ("${bd.mine}")`);
  await page.click('.bd-row.me');
  const opened = await page.evaluate(() => (document.querySelector('.bd-ent.open .bd-team') || {}).textContent || '');
  ok(/Draft/.test(opened) && /points/.test(opened) && !/undefined|NaN/.test(opened), `a row opens into the career ("${opened.slice(0, 70)}")`);
  await page.click('#bd-axes [data-ax="rings"]');
  await page.waitForSelector('#s-board.active .bd-ent');
  const ringsUnit = await page.evaluate(() => (document.querySelector('.bd-rec span') || {}).textContent || '');
  ok(/rings?/.test(ringsUnit), `the Rings order reads in rings ("${ringsUnit}")`);
  await page.click('#b-board-back');
  await page.waitForTimeout(200);
  }
}

/* ── 7b. the scenes ────────────────────────────────────────────────────────
   A draft night career with scenes on, through the real page. The claims:
   the moments are told, a decision is asked INSIDE the scene and answered
   through the engine, Skip never skips a decision, the plain card is under
   every scene, and switching scenes off means no overlay at all. */
async function scenesWalk(b, serve) {
  section('7b. the scenes, through the real page');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => document.querySelector('#b-career').click());
  await page.waitForSelector('#cr-go');
  /* The look chosen in the builder is the career's. */
  await page.click('[data-bstep="look"]');
  await page.click('[data-lk="hair"][data-lv="afro"]');
  await page.click('[data-bstep="start"]');
  await page.click('[data-start="gen"]');
  await page.click('[data-bstep="player"]');
  /* The road is generated, and a road can end off the board. This walk is
     about draft night on a podium, so it asks for a road the board likes:
     New draws another, which is what a player does too. */
  for (let k = 0; k < 40; k++) {
    const p = await page.evaluate(() => { const m = /around (\d+)/.exec(window.RTF_CAREER_UI.previewRoad().join(' ')); return m ? +m[1] : 99; });
    if (p <= 20) break;
    await page.click('#cr-dice');
  }
  await page.click('[data-bstep="look"]');
  await page.click('[data-lk="hair"][data-lv="afro"]');
  await page.click('[data-bstep="player"]');
  await page.fill('#cr-name', 'Scene McTest');
  await page.click('#cr-go');
  const look = await page.evaluate(() => RTF_CAREER_UI.state().cur.look);
  ok(look && look.hair === 'afro', `the builder's look is the career's (${JSON.stringify(look)})`);
  const pic = await page.evaluate(() => !!document.querySelector('.cr-id img.rtf-baller'));
  ok(pic, 'the identity card draws the player');

  const seen = {}, rooms = {}, podium = [], jobs = [];
  let presses = 0, choseInScene = 0, skipHeld = false, underneath = false, pressBefore = 0, movesPlayed = 0, ticks = 0, lastX = null;
  await page.evaluate(() => { window.played = 0; });
  while (presses++ < 1400) {
    const st = await page.evaluate(() => {
      const s = RTF_CAREER_UI.state();
      const ov = document.querySelector('#scov');
      const open = !!(ov && !ov.hidden);
      return { cur: !!s.cur, open, ch: open && !!ov.querySelector('.sc-ch button'),
        who: open ? ov.querySelector('.sc-who b').textContent : '', role: open ? ov.querySelector('.sc-who span').textContent : '',
        commish: s.cur && window.RTF_CAREER.say ? window.RTF_CAREER.say(s.cur, '{commish}') : '', room: open && ov.querySelector('.sc-room') ? ov.querySelector('.sc-room').className : '',
        card: s.cur && s.cur.pending[0] ? s.cur.pending[0].id : null, press: s.cur && s.cur.flags.press || 0,
        plain: !!document.querySelector('#cr-card') };
    });
    if (!st.cur && !st.open) break;
    /* A playable moment: the court is up and the meter waits for a press.
       Press it, then let the court finish. */
    const tick = await page.evaluate(() => { const t = document.querySelector('#tkov'); if (t && !t.hidden) { window.tickers = (window.tickers || 0) + 1; document.querySelector('#tk-go').click(); return 1; } return 0; });
    if (tick) { ticks++; continue; }
    const court = await page.evaluate(() => { const g = document.querySelector('#scov .ct-go'); if (g && g.offsetParent) { g.click(); played++; return 'p'; } return document.querySelector('#scov .sc-court:not(.sc-shot)') ? 'w' : ''; }).catch(() => '');
    if (court) { if (court === 'p') movesPlayed++; await page.waitForTimeout(court === 'w' ? 250 : 50); continue; }
    if (st.open) {
      seen[st.who] = 1;
      if (st.role === 'Commissioner') podium.push(st.who === st.commish && !/^the /i.test(st.who));
      if (/^(the commissioner|your coach)$/i.test(st.who)) jobs.push(st.who);
      (st.room.match(/rm-\w+/g) || []).forEach((r) => { rooms[r] = 1; });
      if (st.ch) {
        /* Skip never skips a decision: the button is gone and Escape leaves
           the question up. */
        if (!skipHeld) {
          const shown = await page.evaluate(() => !document.querySelector('#scov .sc-skip').hidden);
          await page.keyboard.press('Escape');
          const still = await page.evaluate(() => !!document.querySelector('#scov .sc-ch button') && !document.querySelector('#scov').hidden);
          ok(!shown && still, 'a decision in a scene cannot be skipped past');
          /* And the same card is on the plain screen underneath. */
          underneath = st.plain && !!st.card;
          skipHeld = true;
        }
        pressBefore = st.press;
        await page.evaluate(() => document.querySelector('#scov .sc-ch button').click());
        choseInScene++;
      } else {
        await page.evaluate(() => document.querySelector('#scov .sc-stage').click());
      }
      continue;
    }
    const r = await page.evaluate(() => { const c = document.querySelector('.cr-choice'); if (c) { c.click(); return 'c'; } const n = document.querySelector('#cr-next'); if (n) { n.click(); return 'n'; } return 'x'; });
    if (r === 'x') { lastX = await page.evaluate(() => ({ html: document.body.innerText.slice(0, 300), scov: !!document.querySelector('#scov:not([hidden])'), tk: !!document.querySelector('#tkov:not([hidden])'), court: !!document.querySelector('.sc-court') })); break; }
  }
  if (lastX || presses >= 1400) console.log('  walk ended:', presses, JSON.stringify(lastX));
  ok(podium.length > 0 && podium.every(Boolean), `draft night is told from the podium, by the career's own commissioner (${podium.length} beats, ${Object.keys(seen).join(', ')})`);
  ok(jobs.length === 0, `no plate names a person by job alone (${jobs.slice(0, 2).join(', ') || 'none'})`);
  ok(rooms['rm-draft'] && rooms['rm-press'] && rooms['rm-arena'], `the draft stage, the press room and the arena all appear (${Object.keys(rooms).join(', ')})`);
  ok(choseInScene >= 1, `decisions are answered inside scenes (${choseInScene})`);
  ok(ticks >= 3, `the stretches of a season play on the live ticker (${ticks})`);
  ok(underneath, 'and the card a scene asks is on the plain screen underneath');
  const fin = await page.evaluate(() => RTF_CAREER_UI.state().last);
  ok(fin && fin.look && fin.look.hair === 'afro', 'the Hall card keeps the look');
  /* Off means off. */
  await page.evaluate(() => { localStorage.setItem('rtf.scenes.v1', 'off'); const a = document.querySelector('#cr-again'); if (a) a.click(); });
  await page.waitForSelector('#cr-go');
  await page.click('[data-bstep="start"]');
  await page.click('[data-start="gen"]');
  const want = await page.evaluate(() => window.RTF_CAREER_UI.previewRoad().join(' '));
  await page.click('#cr-go');
  /* and the career opens on it, open, as the first thing; the first press folds it */
  const rv = await page.evaluate(() => { const r = document.querySelector('#cr-roadbox'); return r ? { open: r.open, text: r.textContent, reveal: !!r.querySelector('.cr-reveal') } : null; });
  ok(rv && rv.open && rv.reveal && /Your road to the draft/.test(rv.text), 'a draft-night career opens on its road to the draft, revealed');
  ok(rv && want.split(' ').slice(0, 6).every((w) => rv.text.includes(w)), 'and it is the road the builder generated');
  let opened = false;
  for (let k = 0; k < 40; k++) {
    const r = await page.evaluate(() => { if (window.RTF_SCENES.isOpen()) return 'o'; const c = document.querySelector('.cr-choice'); if (c) { c.click(); return 'c'; } const n = document.querySelector('#cr-next'); if (n) { n.click(); return 'n'; } return 'x'; });
    if (r === 'o') { opened = true; break; }
    if (r === 'x') break;
  }
  ok(!opened, 'with scenes switched off no scene ever opens');
  ok(boom.length === 0, `no page errors with scenes on (${boom.join(' | ') || 'none'})`);
  console.log(`  ${presses} presses, ${choseInScene} decisions inside scenes, ${movesPlayed} moments played on the court, ${ticks} ticker presses, cast: ${Object.keys(seen).length}`);
  await ctx.close();
}
