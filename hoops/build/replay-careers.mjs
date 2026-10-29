/*
 * Run The Floor: replay seeded careers and fingerprint each one.
 *
 *   node hoops/build/replay-careers.mjs --out a.json          record
 *   node hoops/build/replay-careers.mjs --against a.json      compare
 *
 * A refactor of the event engine has to change NOTHING, and the way to prove
 * that is to play the same careers before and after and compare every field
 * of every career at the end. The fingerprint is the whole save, so a single
 * moved draw anywhere in thirty seasons shows up.
 *
 * The six frozen version 1 saves are played too, migrated, to a retirement.
 * Since the original engine retired (2026-10-15) there is no story-off replay;
 * the old saves are what still walk the paths a career from before the story
 * engine carries (a league with no front office, no size, no look).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../career.js');
const E = require('../engine.js');
const league = C.seedLeague(require('../data/players.json'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 1000), OUT = arg('out', null), AGAINST = arg('against', null);
const POL = ['random', 'first', 'last'];
const res = {};
for (let i = 0; i < N; i++) {
  const seed = 'rp' + i;
  const L = C.newLife({ seed, league, start: i % 2 ? 'hs' : 'draft' });
  const r = E.createSeededRNG(E.hashSeed(seed + ':policy'));
  const pol = POL[i % 3];
  let g = 0;
  while (!L.retired && g++ < 4000) {
    if (L.pending.length) {
      const n = L.pending[0].options.length;
      C.choose(L, pol === 'first' ? 0 : pol === 'last' ? n - 1 : Math.floor(r() * n));
    } else C.step(L);
  }
  res[seed] = crypto.createHash('sha1').update(JSON.stringify(L)).digest('hex');
}
const FX = JSON.parse(fs.readFileSync(new URL('./fixtures/career-v1-saves.json', import.meta.url), 'utf8')).saves;
for (const k in FX) {
  const L = C.migrate(JSON.parse(JSON.stringify(FX[k])));
  let g = 0;
  while (!L.retired && g++ < 6000) {
    if (L.pending.length) C.choose(L, (L.steps * 7 + L.pending[0].key.length * 3 + L.age) % L.pending[0].options.length);
    else C.step(L);
  }
  res['fx:' + k] = crypto.createHash('sha1').update(JSON.stringify(L)).digest('hex');
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res));
if (AGAINST) {
  const want = JSON.parse(fs.readFileSync(AGAINST, 'utf8'));
  const diff = Object.keys(want).filter((k) => want[k] !== res[k]);
  console.log(diff.length ? 'DIFFERENT: ' + diff.length + ' of ' + Object.keys(want).length + ' (' + diff.slice(0, 5).join(', ') + ')' : 'identical: ' + Object.keys(want).length + ' careers');
  process.exit(diff.length ? 1 : 0);
}
console.log('recorded ' + N + ' careers');
