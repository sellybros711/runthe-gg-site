/* Today's rosters: the league a Career joins is the real one.
 *
 *   node hoops/check-rosters.mjs
 *
 * hoops/data/rosters.json is every club for the season after the data's newest
 * (written by .github/workflows/hoops-rosters.yml). This holds three things:
 *
 *   the file      thirty clubs, a real roster's size, every man named and born
 *   the season    a career joins on exactly those rosters: nobody retired, nobody
 *                 traded, no invented rookie, and the veterans under contract
 *                 still playing
 *   the handover  the summer after that season is the simulation's
 *
 * Reported by the owner: the game had Curry, LeBron, Durant and Harden able to
 * retire before a season they are under contract for, because the league was
 * seeded off the season that had ended and then aged a year by its own rules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const C = require('./career.js');
const ROWS = require('./data/players.json');
const FILE = path.join(HERE, 'data', 'rosters.json');

let pass = 0;
const bad = [];
const ok = (c, what) => { if (c) pass++; else bad.push(what); };

if (!fs.existsSync(FILE)) {
  console.log('check-rosters: no hoops/data/rosters.json yet, so a career seeds off the data\'s last season.');
  process.exit(0);
}
const RO = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let latest = 0;
for (const r of ROWS) if (r.s > latest) latest = r.s;

// ── the file ──
ok(+RO.season === latest + 1, `the file is for ${latest + 1}, the season after the data's newest (it says ${RO.season})`);
const clubs = Object.keys(RO.clubs || {});
ok(clubs.length === 30 && C.CLUBS.every((c) => clubs.indexOf(c) >= 0), `all thirty clubs (${clubs.length})`);
const odd = [];
for (const c of clubs) {
  const men = RO.clubs[c];
  if (men.length < 12 || men.length > 22) odd.push(c + ' ' + men.length);
  for (const m of men) if (!m.i || !m.n || !(m.b > 1970 && m.b < 2012)) odd.push(c + ' ' + JSON.stringify(m));
}
ok(odd.length === 0, `every roster is a real roster's size and every man has an id, a name and a birth year (${odd.slice(0, 3).join('; ') || 'ok'})`);
const ids = {};
for (const c of clubs) for (const m of RO.clubs[c]) (ids[m.i] = ids[m.i] || []).push(c);
const twice = Object.keys(ids).filter((i) => ids[i].length > 1);
ok(twice.length === 0, `nobody is on two rosters (${twice.slice(0, 3).join(', ') || 'none'})`);
ok(!(RO.twice > 6), `a handful at most were on two club pages and kept on one (${RO.twice || 0})`);
const known = Object.keys(ids).filter((i) => ROWS.some((r) => r.i === i && r.s >= latest - 1)).length;
ok(known / Object.keys(ids).length > 0.6, `most of the league played last season and joins the data (${known} of ${Object.keys(ids).length})`);

// ── late signings (fetch-rosters.mjs SIGNINGS) ──
const { SIGNINGS } = await import('./build/fetch-rosters.mjs');
const RATE = fs.existsSync(path.join(HERE, 'data', 'ratings.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'ratings.json'), 'utf8')).men : {};
for (const s of SIGNINGS) {
  ok((ids[s.i] || []).join() === s.club, `${s.n} signed with ${s.club} and is on that roster and no other (${(ids[s.i] || []).join() || 'none'})`);
  ok(!(s.pay > 0) || (RATE[s.i] && RATE[s.i].p === s.pay), `${s.n} is paid the $${s.pay}M he signed for (${RATE[s.i] && RATE[s.i].p})`);
}

// ── the season a career joins ──
const league = C.seedLeague(ROWS, RO);
ok(league.rs === latest + 1, 'the league is seeded from the file');
const where = (L, n) => { const R = C.rostNow(L); for (const c in R) if (R[c].some((e) => e.n === n)) return c; return null; };
const draft = C.newLife({ seed: 'rost-draft', league });
ok(draft.year === league.rs, `a draft night career joins ${league.rs}`);
const hs = C.newLife({ seed: 'rost-hs', league, start: 'hs' });
C.rostOf(hs);
hs.year = league.rs;
const missing = [], wrong = [];
for (const L of [draft, hs]) {
  const R = C.rostNow(L);
  for (const c of C.CLUBS) {
    const names = (R[c] || []).map((e) => e.n);
    for (const p of league.roster[c]) if (names.indexOf(p[0]) < 0) missing.push(c + ' ' + p[0]);
    if (names.some((n) => !league.roster[c].some((p) => p[0] === n))) wrong.push(c);
  }
}
ok(missing.length === 0, `in ${league.rs} every man on a club's roster is there, veterans included (${missing.slice(0, 4).join(', ') || 'all there'})`);
ok(wrong.length === 0, `and nobody else is: no trade, no signing, no invented rookie (${wrong.slice(0, 4).join(', ') || 'none'})`);
const vets = ['Stephen Curry', 'LeBron James', 'Kevin Durant', 'James Harden'];
for (const n of vets) {
  const file = clubs.find((c) => RO.clubs[c].some((m) => m.n === n));
  if (!file) { console.log(`  note: ${n} is on no roster in the file`); continue; }
  ok(where(draft, n) === file, `${n} plays ${league.rs} for ${file}, as the file has him`);
}

// ── the handover ──
const sim = C.newLife({ seed: 'rost-sim', league });
C.rostOf(sim);
sim.year = league.rs + 1;
const R1 = C.rostNow(sim);
let moved = 0, gone = 0;
for (const c of C.CLUBS) for (const p of league.roster[c]) {
  const now = Object.keys(R1).find((k) => R1[k].some((e) => e.n === p[0]));
  if (!now) gone++; else if (now !== c) moved++;
}
ok(moved > 5, `the summer after ${league.rs} is the simulation's: players change clubs (${moved})`);
ok(gone < 60, `and it does not empty the league of veterans in one summer (${gone} gone)`);

if (bad.length) {
  console.error(`check-rosters: ${bad.length} FAILED, ${pass} passed\n`);
  for (const b of bad) console.error('  FAIL: ' + b);
  process.exit(1);
}
console.log(`check-rosters: ${pass} assertions passed (${league.rs - 1}-${String(league.rs).slice(2)} rosters).`);
