#!/usr/bin/env node
/* NBA award winners, for Sportegories (scripts/nba-awards.json).
 *
 * WHY THIS EXISTS
 * scripts/fetch-awards.mjs reads Wikipedia's award categories, and for the NBA
 * the Rookie of the Year, Defensive Player of the Year and Sixth Man lookups
 * come back empty. So Sportegories had no NBA winner of any of the three:
 * "Rookie of the Year" could only check NFL and MLB players, "Defensive Player
 * of the Year" refused Ben Wallace and Dikembe Mutombo, and the live lookup was
 * the only thing standing between a right answer and a red row.
 *
 * Basketball-Reference's award voting table is mirrored as a CSV on
 * raw.githubusercontent.com (sumitrodatta/bball-reference-datasets). This keeps
 * only the winners, under the same award names awards.js uses, and writes them
 * where scripts/build-sportegories.mjs reads them.
 *
 *   node scripts/fetch-nba-awards.mjs      then  node scripts/build-sportegories.mjs
 *
 * BAA and ABA awards are left out: the categories say NBA.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data/Player%20Award%20Shares.csv';
const TAG = {
  'nba mvp': 'NBA MVP',
  'nba roy': 'Rookie of the Year',
  'nba dpoy': 'Defensive Player of the Year',
  'nba smoy': 'Sixth Man of the Year'
};

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const res = await fetch(URL);
if (!res.ok) { console.error('fetch failed: HTTP ' + res.status); process.exit(1); }
const rows = parseCSV(await res.text());
const head = rows.shift(), col = (n) => head.indexOf(n);
const [iS, iA, iP, iW] = ['season', 'award', 'player', 'winner'].map(col);
if ([iS, iA, iP, iW].some((i) => i < 0)) { console.error('unexpected columns: ' + head.join(',')); process.exit(1); }

const out = {}, count = {};
let last = 0;
for (const r of rows) {
  if (r[iW] !== 'TRUE' || !TAG[r[iA]]) continue;
  const name = r[iP].trim(), tag = TAG[r[iA]];
  (out[name] = out[name] || []);
  if (!out[name].includes(tag)) out[name].push(tag);
  count[tag] = (count[tag] || 0) + 1;
  last = Math.max(last, +r[iS] || 0);
}
// A short table means the source changed shape, not that fewer awards exist.
const floor = { 'NBA MVP': 60, 'Rookie of the Year': 70, 'Defensive Player of the Year': 40, 'Sixth Man of the Year': 40 };
const short = Object.keys(floor).filter((t) => (count[t] || 0) < floor[t]);
if (short.length) { console.error('too few winners for: ' + short.join(', ') + ' ' + JSON.stringify(count)); process.exit(1); }

const file = path.join(ROOT, 'scripts/nba-awards.json');
writeFileSync(file, JSON.stringify({ source: URL, through: last, winners: out }, null, 0) + '\n');
console.log('wrote ' + Object.keys(out).length + ' players through the ' + last + ' season: ' + JSON.stringify(count));
