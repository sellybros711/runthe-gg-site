/*
 * Run The Floor: the headless career simulator.
 *
 *   node hoops/sim-career.mjs                     1,000 careers, half from high school
 *   node hoops/sim-career.mjs --n 3000            more
 *   node hoops/sim-career.mjs --policy random     one policy (random, first, last, fame, ring)
 *   node hoops/sim-career.mjs --script f.json     a scripted career: { seed, start, picks: [...] }
 *   node hoops/sim-career.mjs --report out.md     write the coverage report as markdown
 *   node hoops/sim-career.mjs --phase D           also fail on balance targets due by that phase
 *
 * Every number NARRATIVE.md promises is measured here, not counted by hand.
 * Two kinds of claim:
 *
 *   INVARIANTS fail the run every time: a crash, a career that never ends, a
 *   token nobody filled, a field printed as undefined, a log line that talks
 *   about a draft from the wrong year, a non-recurring event dealt twice, an
 *   event in the catalog nobody ever sees.
 *
 *   TARGETS are the balance bands in NARRATIVE.md section 10. Each carries the
 *   phase it is due by. A target due by a later phase is printed with where it
 *   stands and does not fail the run until `--phase` reaches it, because the
 *   content that moves it has not been written yet. That is the difference
 *   between a known gap and a known failure.
 *
 * The policies answer cards the way different players do. `random` is seeded
 * off the career, so the sweep is the same sweep every run. `fame` and `ring`
 * look one card ahead on a copy of the career and take what moves fame, or
 * the team's chances, the most.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const C = require('./career.js');
const E = require('./engine.js');
const ROWS = require('./data/players.json');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 1000);
const ONLY = arg('policy', null);
const SCRIPT = arg('script', null);
const REPORT = arg('report', null);
const PHASE = arg('phase', '0');
const PHASES = ['0', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
const due = (p) => PHASES.indexOf(p) <= PHASES.indexOf(PHASE);

const league = C.seedLeague(ROWS);
const clone = (x) => JSON.parse(JSON.stringify(x));

/* Events that are allowed to come back in one career, by design. Anything
   else dealt twice is a repeat. The list shrinks as Phase C gives the
   recurring events memory and cooldowns. */
const SYSTEM = new Set(['training', 'hs_summer', 'injury', 'clutch', 'amclutch', 'moment', 'presser', 'fa', 'extension', 'workout', 'nooffer', 'offers',
  'allstar', 'retire', 'declare', 'portal', 'commit', 'signing', 'build_arch', 'build_pos', 'build_sig', 'goal', 'nickname']);
const RECURS = { has: (id) => SYSTEM.has(id) || C.recurs(id) };

function policyPick(pol, L, c, r) {
  const n = c.options.length;
  if (pol === 'first') return 0;
  if (pol === 'last') return n - 1;
  if (pol === 'random') return Math.floor(r() * n);
  /* One card of lookahead on a copy. */
  let best = 0, bestV = -1e9;
  for (let i = 0; i < n; i++) {
    const K = clone(L);
    try { C.choose(K, i); } catch (e) { continue; }
    const v = pol === 'fame' ? K.m.fame - L.m.fame + (C.ovrOf(K) - C.ovrOf(L)) * 0.5
      : (K.season && K.season.mods ? (K.season.mods.win || 0) : 0) * 10 + (C.ovrOf(K) - C.ovrOf(L)) + (K.m.trust - L.m.trust) * 0.1;
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

const JUNK = /\bundefined\b|\bNaN\b|\[object |\{[a-z0-9]+(?::(?:last|first))?\}/;

function run(seed, start, pol, picks) {
  const L = C.newLife({ seed, league, start });
  const r = E.createSeededRNG(E.hashSeed(seed + ':policy'));
  const seen = {}, problems = [];
  let g = 0, k = 0;
  const textOf = (c) => [c.title, c.text, c.eyebrow].concat(c.options.map((o) => o.label + ' ' + (o.hint || ''))).join(' | ');
  while (!L.retired && g++ < 4000) {
    if (L.pending.length) {
      const c = L.pending[0];
      seen[c.id] = (seen[c.id] || 0) + 1;
      const t = textOf(c);
      if (JUNK.test(t)) problems.push('card ' + c.id + ': ' + t.match(JUNK)[0]);
      for (const x of C.continuity(L, c)) problems.push('continuity ' + x);
      const i = picks ? (picks[k++] || 0) % c.options.length : policyPick(pol, L, c, r);
      C.choose(L, i);
    } else C.step(L);
  }
  if (!L.retired) problems.push('never retired');
  for (const x of C.continuityLog(L)) problems.push('continuity ' + x);
  /* The feed is copy too, and it runs forward in time. */
  let fy = -Infinity;
  for (const f of L.feed || []) {
    if (JUNK.test(f.t)) problems.push('feed ' + f.y + ': ' + f.t.slice(0, 80));
    if (f.y < fy) problems.push('continuity the feed goes back in time at ' + f.y);
    fy = Math.max(fy, f.y);
  }
  for (const k in L.traits || {}) if (L.traits[k].known && !L.traits[k].has) problems.push('revealed a trait it does not have: ' + k);
  /* A recurring event stops at its cap. */
  for (const id in seen) { const r = C.STORY_RECURS[id]; if (r && seen[id] > r[1]) problems.push('over cap ' + id + ' ' + seen[id]); }
  for (const e of L.log) {
    if (JUNK.test(e.t)) problems.push('log ' + e.y + ': ' + e.t.slice(0, 80));
    /* A line about a draft names that summer's draft. */
    const m = e.t.match(/\b(\d{4}) NBA Draft\b/i);
    if (m && (+m[1] > e.y || +m[1] < e.y - 1)) problems.push('log ' + e.y + ' talks about the ' + m[1] + ' draft');
  }
  /* A repeat is not an invariant yet: the version 1 engine deals most of its
     pool once a season with no memory, which is the convergence the audit
     measured. Phase C gives events cooldowns and caps; until then the repeats
     are counted against a target due by C. */
  const repeats = Object.keys(seen).filter((id) => seen[id] > 1 && !RECURS.has(id));
  return { L, seen, problems, repeats };
}

function routeOf(L) {
  const r = { start: L.amHist && L.amHist.length ? 'hs' : 'draft' };
  const a = L.am || {};
  r.pre = r.start === 'draft' ? 'bg:' + L.bg : a.route === 'intl' ? 'overseas' : a.route === 'gl' ? 'gleague' : a.college ? 'college' : 'other';
  const p = L.draft && L.draft.pick;
  r.slot = !L.draft || !p ? 'undrafted' : p <= 14 ? 'lottery' : p <= 30 ? 'first' : 'second';
  const clubs = new Set(L.history.map((h) => h.t)).size;
  r.pro = !L.history.length ? 'none' : clubs >= 5 ? 'journeyman' : clubs === 1 && L.history.length >= 10 ? 'lifer' : 'mixed';
  return r;
}

const POLICIES = ONLY ? [ONLY] : ['random', 'first', 'last'];
const results = [];
let crashes = 0;
const t0 = Date.now();
if (SCRIPT) {
  const s = JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));
  results.push(Object.assign(run(s.seed, s.start, 'script', s.picks), { pol: 'script' }));
} else {
  for (let i = 0; i < N; i++) {
    const pol = POLICIES[i % POLICIES.length];
    try { results.push(Object.assign(run('sim' + i, i % 2 ? 'hs' : 'draft', pol), { pol })); }
    catch (e) { crashes++; if (crashes <= 3) console.error('crash sim' + i + ': ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

/* ─── measure ─────────────────────────────────────────────────────────── */

const n = results.length;
const pct = (x) => (100 * x / Math.max(1, n));
const ev = {};
for (const x of results) for (const id in x.seen) { ev[id] = ev[id] || { careers: 0, total: 0, max: 0 }; ev[id].careers++; ev[id].total += x.seen[id]; ev[id].max = Math.max(ev[id].max, x.seen[id]); }
const allIds = new Set(Object.keys(C.EVENTS).concat(Object.keys(C.AM_EVENTS || {})));
const never = [...allIds].filter((id) => !ev[id]);

let ov = 0, pairs = 0;
for (let i = 0; i + 1 < results.length; i += 2) {
  const a = Object.keys(results[i].seen), b = new Set(Object.keys(results[i + 1].seen));
  ov += a.filter((x) => b.has(x)).length / Math.max(1, Math.min(a.length, b.size)); pairs++;
}
const overlap = 100 * ov / Math.max(1, pairs);
const distinct = results.reduce((s, x) => s + Object.keys(x.seen).length, 0) / Math.max(1, n);

const count = (f) => results.filter(f).length;
const T = (x) => C.totals(x.L);
const hs = results.filter((x) => routeOf(x.L).start === 'hs');
const routes = {}, slots = {}, pros = {}, verdicts = {};
for (const x of results) {
  const ro = routeOf(x.L);
  routes[ro.pre] = (routes[ro.pre] || 0) + 1; slots[ro.slot] = (slots[ro.slot] || 0) + 1; pros[ro.pro] = (pros[ro.pro] || 0) + 1;
  const lg = C.legacy(x.L); verdicts[lg.verdict] = (verdicts[lg.verdict] || 0) + 1;
}
const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] || 0; };

const M = {
  'reaches the NBA (high school start)': 100 * hs.filter((x) => x.L.history.length).length / Math.max(1, hs.length),
  'route: college (high school start)': 100 * hs.filter((x) => routeOf(x.L).pre === 'college').length / Math.max(1, hs.length),
  'route: G League, overseas or gap year': 100 * hs.filter((x) => /gleague|overseas/.test(routeOf(x.L).pre)).length / Math.max(1, hs.length),
  'lottery pick': pct(slots.lottery || 0),
  'second round or undrafted': pct((slots.second || 0) + (slots.undrafted || 0)),
  'All-Star at least once': pct(count((x) => T(x).star > 0)),
  'MVP at least once': pct(count((x) => T(x).mvp > 0)),
  'a ring': pct(count((x) => T(x).rings > 0)),
  'Hall of Fame (any tier)': pct(count((x) => C.legacy(x.L).score >= 55)),
  'first ballot or better': pct(count((x) => C.legacy(x.L).score >= 85)),
  'distinct events per career': distinct,
  "two careers' event overlap": overlap,
  'median NBA seasons': median(results.map((x) => x.L.history.length)),
  'events never dealt': never.length,
  'unplanned repeats per career': results.reduce((s, x) => s + x.repeats.length, 0) / Math.max(1, n),
};
/* The story engine, read off every career: how much of it a career meets. */
const per = (f) => results.reduce((s, x) => s + f(x.L), 0) / Math.max(1, n);
const STORY = {
  'arcs started': per((L) => Object.keys(L.arcs || {}).length),
  'arcs resolved': per((L) => Object.values(L.arcs || {}).filter((a) => a.done && a.done !== 'faded').length),
  'traits revealed': per((L) => Object.values(L.traits || {}).filter((t) => t.known).length),
  'people in the ledger': per((L) => Object.keys(L.people || {}).length),
  'skill badges': per((L) => Object.keys(L.badges || {}).length),
  'signature move': 100 * per((L) => L.sig ? 1 : 0),
  'nickname': 100 * per((L) => L.nick ? 1 : 0),
  'goals met (share)': 100 * results.reduce((s, x) => s + (x.L.goals || []).filter((g) => g.met).length, 0) / Math.max(1, results.reduce((s, x) => s + (x.L.goals || []).length, 0)),
  'feed lines': per((L) => (L.feed || []).length),
};
/* NARRATIVE.md section 10, with the phase each band is due by. */
const TARGETS = [
  ['reaches the NBA (high school start)', 85, 95, 'D'],
  ['route: college (high school start)', 55, 70, 'D'],
  ['route: G League, overseas or gap year', 8, 18, 'D'],
  ['lottery pick', 20, 32, 'D'],
  ['second round or undrafted', 30, 45, 'D'],
  ['All-Star at least once', 22, 35, 'C'],
  ['MVP at least once', 1, 3, 'C'],
  ['a ring', 18, 30, 'C'],
  ['Hall of Fame (any tier)', 18, 28, 'D'],
  ['first ballot or better', 5, 10, 'D'],
  ['distinct events per career', 70, 110, 'D'],
  ["two careers' event overlap", 0, 50, 'D'],
  ['median NBA seasons', 11, 14, 'C'],
  ['events never dealt', 0, 0, '0'],
  ['unplanned repeats per career', 0, 0, 'C'],
];

/* ─── report ──────────────────────────────────────────────────────────── */

const out = [];
const P = (s) => { out.push(s); console.log(s); };
P(`# Career simulator report\n\n${n} careers (${POLICIES.join(', ')}), ${secs}s, phase ${PHASE}.\n`);
const problems = [];
if (crashes) problems.push(crashes + ' careers crashed');
for (const x of results) for (const p of x.problems) problems.push(x.L.seed + ' ' + x.pol + ': ' + p);
const byKind = {};
for (const p of problems) { const k = p.replace(/^\S+ \S+: /, '').replace(/\d{4}/g, 'YYYY').replace(/: .*/, ''); byKind[k] = (byKind[k] || 0) + 1; }
P('## Invariants\n');
P(problems.length ? Object.keys(byKind).map((k) => `- FAIL ${k}: ${byKind[k]} (e.g. ${problems.find((p) => p.indexOf(k.split(' ')[0]) >= 0) || ''})`).join('\n') : '- all hold: no crash, every career ends, no junk, no wrong-year draft line, no unplanned repeat');
P('\n## Balance against NARRATIVE.md\n');
P('| measure | now | band | due | |\n|---|---|---|---|---|');
const targetFails = [];
for (const [k, lo, hi, ph] of TARGETS) {
  const v = M[k];
  const inBand = v >= lo && v <= hi;
  if (!inBand && due(ph)) targetFails.push(k);
  P(`| ${k} | ${v.toFixed(1)} | ${lo} to ${hi} | ${ph} | ${inBand ? 'in' : due(ph) ? 'FAIL' : 'not yet'} |`);
}
P('\n## The story engine\n');
P('| per career | value |\n|---|---|\n' + Object.keys(STORY).map((k) => `| ${k} | ${STORY[k].toFixed(1)} |`).join('\n'));
P('\n## Routes\n');
P('| before the NBA | share |\n|---|---|\n' + Object.keys(routes).sort().map((k) => `| ${k} | ${pct(routes[k]).toFixed(1)}% |`).join('\n'));
P('\n| draft slot | share |\n|---|---|\n' + Object.keys(slots).sort().map((k) => `| ${k} | ${pct(slots[k]).toFixed(1)}% |`).join('\n'));
P('\n| in the NBA | share |\n|---|---|\n' + Object.keys(pros).sort().map((k) => `| ${k} | ${pct(pros[k]).toFixed(1)}% |`).join('\n'));
P('\n| verdict | share |\n|---|---|\n' + Object.keys(verdicts).sort((a, b) => verdicts[b] - verdicts[a]).map((k) => `| ${k} | ${pct(verdicts[k]).toFixed(1)}% |`).join('\n'));
P('\n## Event coverage\n');
P('| event | careers | per career, when dealt | most in one career |\n|---|---|---|---|');
for (const id of Object.keys(ev).sort((a, b) => ev[b].careers - ev[a].careers)) P(`| ${id} | ${pct(ev[id].careers).toFixed(1)}% | ${(ev[id].total / ev[id].careers).toFixed(2)} | ${ev[id].max} |`);
if (never.length) P('\nNever dealt: ' + never.join(', '));
const rep = {};
for (const x of results) for (const id of x.repeats) rep[id] = (rep[id] || 0) + 1;
if (Object.keys(rep).length) P('\nRepeated without being designed to recur (careers): ' + Object.keys(rep).sort((a, b) => rep[b] - rep[a]).map((k) => k + ' ' + rep[k]).join(', '));
if (REPORT) fs.writeFileSync(REPORT, out.join('\n') + '\n');

const fail = problems.length > 0 || targetFails.length > 0;
console.log(`\n${fail ? 'FAILED' : 'ok'}: ${problems.length} invariant problems, ${targetFails.length} targets due by phase ${PHASE} out of band`);
process.exit(fail ? 1 : 0);
