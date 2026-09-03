#!/usr/bin/env node
/* check-gamecopy.mjs
 *
 * One game, one name, one blurb. arcade/gamemarks.js is the source of truth for
 * both; the hub keeps its copy inline in the HTML on purpose (the tile height is
 * driven by the blurb under a 3-line clamp, so injecting it would shift layout,
 * and it is indexable content). Inline plus shared means the two can drift, and
 * they already had: the hub, the calendar and the Vault each described the
 * Number Game differently. This asserts the hub matches the module exactly.
 *
 *   node scripts/check-gamecopy.mjs
 */
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const marks = readFileSync(root + 'arcade/gamemarks.js', 'utf8');
const hub = readFileSync(root + 'arcade/index.html', 'utf8');

function literal(name) {
  const at = marks.indexOf('var ' + name + ' = {');
  if (at < 0) throw new Error('gamemarks.js has no ' + name + ' block');
  const open = marks.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < marks.length; i++) {
    if (marks[i] === '{') depth++;
    else if (marks[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error(name + ' block is unbalanced');
  return new Function('return ' + marks.slice(open, end))();
}

const NAMES = literal('NAMES');
const DESC = literal('DESC');

// Each hub tile: <a class="tile x"> ... data-mark="key" ... <span class="nm">
// ... <span class="desc">. Non-greedy to the closing </a> keeps tiles apart.
const TILE = /<a class="tile [^"]*"[\s\S]*?data-mark="([a-z]+)"[\s\S]*?<span class="nm">([\s\S]*?)<\/span>[\s\S]*?<span class="desc"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/a>/g;

const bad = [];
const seen = new Set();
let m;
while ((m = TILE.exec(hub))) {
  const [, key, name, desc] = m;
  const line = hub.slice(0, m.index).split('\n').length;
  seen.add(key);
  if (!NAMES[key]) { bad.push(`arcade/index.html:${line}  tile "${key}" is not in gamemarks.js`); continue; }
  const nm = name.trim(), ds = desc.trim();
  if (nm !== NAMES[key]) bad.push(`arcade/index.html:${line}  ${key} name\n    hub:    ${nm}\n    module: ${NAMES[key]}`);
  if (ds !== DESC[key]) bad.push(`arcade/index.html:${line}  ${key} blurb\n    hub:    ${ds}\n    module: ${DESC[key]}`);
}

for (const key of Object.keys(NAMES)) {
  if (!seen.has(key)) bad.push(`arcade/index.html  no tile found for "${key}"`);
}
if (Object.keys(DESC).length !== Object.keys(NAMES).length) {
  bad.push('gamemarks.js  NAMES and DESC cover different games');
}

if (bad.length) {
  console.error('Game copy is out of sync with arcade/gamemarks.js:\n');
  for (const b of bad) console.error('  ' + b);
  console.error('\nEdit gamemarks.js, then mirror the text into the hub tile.');
  process.exit(1);
}
console.log(`game copy ok: ${seen.size} tiles match gamemarks.js`);
