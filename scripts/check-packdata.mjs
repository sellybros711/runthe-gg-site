/* DO THE PACKED DATASETS STILL SAY WHAT THEY SAID?
 *
 * four of the arcade's generated files ship packed: field names written once as
 * a header, repeated strings written once in a dictionary, every row an array
 * of indices. It saves 1.7 MB of parsing across the games. It also puts a
 * decoder between the scraper and the player, and that decoder is the kind of
 * thing that fails quietly: an off-by-one in a dictionary hands out the wrong
 * college for every player, and every screen still renders.
 *
 * So this asserts the things a decoder can break:
 *
 *   1  every file loads and defines its global, with the fields it used to
 *   2  the decoded rows carry the same field names, not a packer's internals
 *   3  a dictionaried value is a string, never a leftover index
 *   4  the shipped file and a fresh pack of its own contents agree, which is
 *      what catches a packer change that the files were never re-packed for
 *   5  named players still carry the values a human can check by eye
 *
 * Run: node scripts/check-packdata.mjs      (no network, no browser)
 */
import { readFileSync } from 'node:fs';
import { packFile, loadGlobal } from './lib/packdata.mjs';

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

/* What each file has to look like on the other side of the decoder. The field
   lists are the contract the games read through; a packer that dropped one
   would leave the game reading undefined and showing nothing. */
const SPECS = [
  { path: 'arcade/former.js', global: 'RTG_FORMER', key: 'players', meta: ['updated', 'count'],
    fields: ['id', 'name', 'sport', 't', 'col', 'pos'], strings: ['name', 'sport', 'col', 'pos'],
    arrays: ['t'], min: 4000 },
  { path: 'arcade/rosters.js', global: 'RTG_ROSTERS', key: 'players', meta: ['updated', 'count'],
    fields: ['n', 's', 't', 'p'], strings: ['n', 's', 't', 'p'], arrays: [], min: 2000 },
  { path: 'arcade/jerseys.js', global: 'RTG_JERSEYS', key: 'stints', meta: ['updated', 'count'],
    fields: ['name', 'sport', 'team', 'y0', 'y1'], strings: ['name', 'sport', 'team'], arrays: [], min: 5000 },
  { path: 'arcade/awards.js', global: 'RTG_AWARDS', key: 'players', meta: ['updated', 'count'],
    fields: ['aw'], strings: [], arrays: ['aw'], min: 3000, keyed: true }
];

/* ---- 1 to 3: every file loads, and its rows are decoded values ------------ */
console.log('\n1) each packed file loads and decodes to the shape the games read');
const LOADED = {};
for (const s of SPECS) {
  const src = readFileSync(s.path, 'utf8');
  const G = loadGlobal(src, s.global);
  if (!G) { fail(`${s.path} does not define window.${s.global}`); continue; }
  LOADED[s.path] = { src, G };

  for (const m of s.meta) {
    if (G[m] === undefined) fail(`${s.path}: lost its .${m}`);
  }
  const rows = s.keyed ? Object.values(G[s.key]) : G[s.key];
  if (!rows || rows.length < s.min) {
    fail(`${s.path}: ${rows ? rows.length : 0} rows, expected at least ${s.min}`);
    continue;
  }

  /* Check the whole file, not a sample. A dictionary that goes wrong goes
     wrong for one column, and a sample of the first hundred rows is exactly
     where it would not show. */
  const missing = new Set(), leaked = new Set(), wrongArr = new Set();
  for (const row of rows) {
    for (const f of s.fields) if (!(f in row)) missing.add(f);
    for (const f of s.strings) {
      const v = row[f];
      if (v !== null && v !== undefined && typeof v !== 'string') leaked.add(f + '=' + JSON.stringify(v));
    }
    for (const f of s.arrays) {
      const v = row[f];
      if (v === null || v === undefined) continue;
      if (!Array.isArray(v)) { wrongArr.add(f + ' is not an array'); continue; }
      for (const x of v) if (typeof x !== 'string') wrongArr.add(f + ' holds ' + JSON.stringify(x));
    }
    if (Object.prototype.hasOwnProperty.call(row, '__k')) missing.add('the packer\'s own __k key leaked into a row');
  }
  if (missing.size) fail(`${s.path}: rows are missing ${[...missing].join(', ')}`);
  else if (leaked.size) fail(`${s.path}: a dictionary index reached the game as a value: ${[...leaked].slice(0, 3).join(', ')}`);
  else if (wrongArr.size) fail(`${s.path}: ${[...wrongArr].slice(0, 3).join(', ')}`);
  else ok(`${s.path}: ${rows.length} rows, every one carrying ${s.fields.join('/')} as decoded values`);
}

/* ---- 4: the file on disk is what the packer would write today ------------- */
/* The packer is a build step, so the shipped file can be older than the code
   that writes it. That is fine until the code changes shape, at which point
   the site is serving a format nothing in the repo produces any more and the
   next refresh silently changes every byte. Re-packing the file's own decoded
   contents and comparing catches that here rather than in a 500 KB diff. */
console.log('\n2) the shipped bytes match what the current packer produces');
for (const s of SPECS) {
  const L = LOADED[s.path];
  if (!L) continue;
  const G = L.G;
  const rows = s.keyed
    ? Object.keys(G[s.key]).map((k) => ({ __k: k, ...G[s.key][k] }))
    : G[s.key];
  const banner = (L.src.match(/^\/\*\n([\s\S]*?)\n \*\/\n/) || [])[1];
  const again = packFile({
    global: s.global,
    key: s.key,
    rows,
    meta: s.meta.reduce((o, m) => (o[m] = G[m], o), {}),
    extra: s.path.endsWith('rosters.js') ? (G.divisions ? { divisions: G.divisions } : {})
         : s.path.endsWith('awards.js') ? (G.bySport ? { bySport: G.bySport } : {}) : {},
    mapKey: s.keyed ? '__k' : null,
    banner: banner ? banner.split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n') : ''
  });
  if (again !== L.src) {
    fail(`${s.path} is not what scripts/pack-arcade-data.mjs writes today. ` +
         `Run: node scripts/pack-arcade-data.mjs ${s.path.replace('arcade/', '').replace('.js', '')}`);
  } else ok(`${s.path} is byte-identical to a fresh pack`);
}

/* ---- 5: values a person can check ---------------------------------------- */
/* The point of these is that they are wrong in a way somebody would notice.
   A dictionary that slipped by one would still produce a college, and only a
   named player proves it produced the RIGHT one. */
console.log('\n3) named players still carry the right values');
{
  const F = LOADED['arcade/former.js'];
  if (F) {
    const find = (n) => F.G.players.find((p) => p.name === n);
    const cases = [
      ['Michael Jordan', 'NBA', 'North Carolina'],
      ['Peyton Manning', 'NFL', 'Tennessee'],
      ['Derek Jeter', 'MLB', null]
    ];
    for (const [name, sport, col] of cases) {
      const p = find(name);
      if (!p) { fail(`former.js no longer contains ${name}`); continue; }
      if (p.sport !== sport) fail(`${name}: sport decoded as ${JSON.stringify(p.sport)}, expected ${sport}`);
      else if (col && p.col !== col) fail(`${name}: college decoded as ${JSON.stringify(p.col)}, expected ${col}`);
      else if (!Array.isArray(p.t) || !p.t.length || typeof p.t[0] !== 'string')
        fail(`${name}: team list decoded as ${JSON.stringify(p.t)}`);
      else ok(`${name}: ${p.sport}${col ? ', ' + p.col : ''}, ${p.t.length} club${p.t.length === 1 ? '' : 's'} starting ${p.t[0]}`);
    }
  }
  const A = LOADED['arcade/awards.js'];
  if (A) {
    const k = Object.keys(A.G.players).find((x) => /jordan/.test(x));
    const rec = k && A.G.players[k];
    if (!rec) fail('awards.js: no record found for Jordan');
    else if (!Array.isArray(rec.aw) || typeof rec.aw[0] !== 'string')
      fail('awards.js: award list decoded as ' + JSON.stringify(rec));
    else ok(`awards.js: ${k} holds ${rec.aw.length} awards, first "${rec.aw[0]}"`);
  }
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\npacked data ok');
