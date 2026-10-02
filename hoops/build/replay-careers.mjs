/*
 * Run The Floor: replay seeded careers and fingerprint each one.
 *
 *   node hoops/build/replay-careers.mjs --out a.json          record
 *   node hoops/build/replay-careers.mjs --against a.json      compare
 *   node hoops/build/replay-careers.mjs --story off           as a migrated save plays
 *
 * A refactor of the event engine has to change NOTHING, and the way to prove
 * that is to play the same careers before and after and compare every field
 * of every career at the end. The fingerprint is the whole save, so a single
 * moved draw anywhere in thirty seasons shows up.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../career.js');
const E = require('../engine.js');
const league = C.seedLeague(require('../data/players.json'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 1000), OUT = arg('out', null), AGAINST = arg('against', null), STORY = arg('story', 'on');
const POL = ['random', 'first', 'last'];
const res = {};
for (let i = 0; i < N; i++) {
  const seed = 'rp' + i;
  const L = C.newLife({ seed, league, start: i % 2 ? 'hs' : 'draft', story: STORY !== 'off' });
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
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res));
if (AGAINST) {
  const want = JSON.parse(fs.readFileSync(AGAINST, 'utf8'));
  const diff = Object.keys(want).filter((k) => want[k] !== res[k]);
  console.log(diff.length ? 'DIFFERENT: ' + diff.length + ' of ' + Object.keys(want).length + ' (' + diff.slice(0, 5).join(', ') + ')' : 'identical: ' + Object.keys(want).length + ' careers');
  process.exit(diff.length ? 1 : 0);
}
console.log('recorded ' + N + ' careers');
