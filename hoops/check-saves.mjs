/*
 * Run The Floor: Career saves load, migrate, and play on unchanged.
 *
 *   node hoops/check-saves.mjs
 *
 * A save is the one thing a player cannot get back. Version 1 wrote `v: 1` and
 * nothing ever read it, so there was no way to give an old career a field a
 * new feature needs. Version 2 adds `migrate()`, and this file holds it to the
 * only promise that matters: an old career loads, gains what it is missing,
 * and then plays EXACTLY as the old engine would have played it.
 *
 * The fixtures in hoops/build/fixtures/career-v1-saves.json were written by
 * the version 1 engine (career.js as of commit 7c75a34): six careers at six
 * points (a sophomore, a collegian, draft night, mid NBA, a save from before
 * looks, a finished career), plus what that engine did with each over the next
 * 120 presses. They are frozen on purpose. Regenerating them with the current
 * engine would make this a test of the engine agreeing with itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const C = require('./career.js');
const FX = JSON.parse(fs.readFileSync(path.join(HERE, 'build/fixtures/career-v1-saves.json'), 'utf8'));

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

/* The same policy the fixtures were played with. */
function play(L, n) {
  let g = 0;
  while (!L.retired && g++ < n) {
    if (L.pending.length) C.choose(L, (L.steps * 7 + L.pending[0].key.length * 3 + L.age) % L.pending[0].options.length);
    else C.step(L);
  }
  return L;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

section('1. every version 1 save migrates, and a second migrate changes nothing');
for (const k in FX.saves) {
  const L = C.migrate(clone(FX.saves[k]));
  ok(L.v === C.LIFE_VERSION, `${k}: the version is now ${C.LIFE_VERSION} (${L.v})`);
  ok(L.mem && L.people && L.traits && L.opt, `${k}: it gained memory, people, traits and settings`);
  ok(C.TRAITS.every((t) => L.traits[t] && typeof L.traits[t].has === 'boolean'), `${k}: every trait is rolled`);
  const once = JSON.stringify(L);
  ok(JSON.stringify(C.migrate(clone(L))) === once, `${k}: migrate is idempotent`);
}

section('2. the traits a migrated career rolls are the ones a new career would');
{
  const L = C.migrate(clone(FX.saves.nba_mid));
  ok(JSON.stringify(L.traits) === JSON.stringify(C.rollTraits(L.seed)), 'off the seed, so a migrated save and a new one agree');
  const n = C.newLife({ seed: 'fx-nba', name: 'Fix Veteran', story: false });
  ok(JSON.stringify(n.traits) === JSON.stringify(L.traits), 'and newLife rolls the same traits for the same seed');
  /* A story career also gets the trait its origin carries (Phase D), and
     nothing else moves. */
  const s = C.newLife({ seed: 'fx-nba', name: 'Fix Veteran' });
  const moved = Object.keys(s.traits).filter((k) => JSON.stringify(s.traits[k]) !== JSON.stringify(n.traits[k]));
  const carried = C.ORIGINS[s.origin].trait;
  ok(moved.every((k) => k === carried && s.traits[k].has), `a story career differs only by its origin's trait (${moved.join(', ') || 'none'})`);
  const all = {};
  for (let i = 0; i < 2000; i++) { const t = C.rollTraits('t' + i); for (const k in t) if (t[k].has) all[k] = (all[k] || 0) + 1; }
  ok(C.TRAITS.every((k) => all[k] > 150), `every trait turns up (${C.TRAITS.map((k) => k + ' ' + (all[k] || 0)).join(', ')})`);
}

section('3. a migrated career plays on exactly as the old engine played it');
for (const k in FX.saves) {
  const L = play(C.migrate(clone(FX.saves[k])), 120);
  const want = FX.after120[k];
  const got = {
    steps: L.steps, phase: L.phase, stage: L.stage, year: L.year, age: L.age, ovr: C.ovrOf(L), seasons: L.history.length,
    pts: L.history.reduce((a, h) => a + (h.pts || 0) * (h.gp || 0), 0), rt: L.rt, m: L.m, team: L.team, retired: L.retired,
  };
  const diff = Object.keys(want).filter((x) => JSON.stringify(want[x]) !== JSON.stringify(got[x]));
  ok(diff.length === 0, `${k}: 120 presses later it is the same career (${diff.map((x) => x + ' ' + JSON.stringify(want[x]) + ' vs ' + JSON.stringify(got[x])).join('; ') || 'identical'})`);
}

section('4. a save from before looks still draws');
{
  const L = C.migrate(clone(FX.saves.no_look));
  ok(!L.look || typeof L.look === 'object', 'no look is allowed');
  let threw = null;
  try { play(L, 40); C.view && C.view(L); } catch (e) { threw = e; }
  ok(!threw, `and it plays and renders a view (${threw ? threw.message : 'fine'})`);
}

section('5. memory');
{
  const L = C.newLife({ seed: 'mem' });
  C.remember(L, 'test.key', 7);
  ok(C.recall(L, 'test.key').v === 7 && C.recall(L, 'test.key').y === L.year, 'remember stamps the value and the year');
  ok(C.recall(L, 'nothing') === null, 'recall answers null for what never happened');
  const v1 = clone(FX.saves.finished);
  v1.flags = Object.assign({}, v1.flags, { home: true, g7: 2, rivalWins: 3 });
  const M = C.migrate(v1);
  ok(C.recall(M, 'g7.made').v === 2 && C.recall(M, 'rival.beat').v === 3 && C.recall(M, 'hometown.played'), 'the flags version 1 kept are carried into memory');
}

console.log(`\n${passed} passed${failures.length ? ', ' + failures.length + ' FAILED' : ''}`);
if (failures.length) { for (const f of failures) console.log('  FAIL: ' + f); process.exit(1); }
