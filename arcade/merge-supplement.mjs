/* =============================================================================
 * Run The Arcade — merge an achievement/stat supplement into the corpus
 *
 *   node grid/merge-supplement.mjs
 *
 * The base corpus ships with empty awards/draft/milestones. This reads
 * grid/data/awards.supplement.json (hand-authored, keyed by display_name),
 * merges those memberships into the matching players' attributes in
 * grid/data/corpus.json, and reports matched/unmatched names. After running,
 * re-run  node grid/import-corpus.js  to regenerate match/entities.js so the new
 * achievement/statistical categories (NBA MVP, 500 HR Club, No. 1 Picks, ...)
 * become available to the generator.
 * ========================================================================== */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, 'data', 'corpus.json');
const SUPP = path.join(__dirname, 'data', 'awards.supplement.json');

const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
const supp = JSON.parse(fs.readFileSync(SUPP, 'utf8'));

// name -> player entity (first match). Players only.
const byName = {};
for (const e of corpus) {
  if (e.entity_type === 'player' || e.entity_type === 'athlete') {
    if (!byName[e.display_name]) byName[e.display_name] = e;
  }
}

function ensureArr(attrs, key) { if (!Array.isArray(attrs[key])) attrs[key] = []; return attrs[key]; }
function addUnique(arr, v) { if (arr.indexOf(v) === -1) { arr.push(v); return true; } return false; }

let added = 0;
const unmatched = [];
function applyList(map, attrKey, value) {
  for (const name of map) {
    const p = byName[name];
    if (!p) { unmatched.push(name); continue; }
    const arr = ensureArr(p.attributes, attrKey);
    if (addUnique(arr, value)) added++;
  }
}

// awards
for (const award of Object.keys(supp.awards || {})) {
  applyList(supp.awards[award], 'awards', award);
}
// milestones
for (const m of Object.keys(supp.milestones || {})) {
  applyList(supp.milestones[m], 'milestones', m);
}
// first overall picks -> draft_position [1]
if (supp.firstOverallPick && supp.firstOverallPick.names) {
  for (const name of supp.firstOverallPick.names) {
    const p = byName[name];
    if (!p) { unmatched.push(name); continue; }
    const arr = ensureArr(p.attributes, 'draft_position');
    if (arr.indexOf(1) === -1) { arr.length = 0; arr.push(1); added++; }
  }
}

fs.writeFileSync(CORPUS, JSON.stringify(corpus, null, 2) + '\n');

// report
const uniqUnmatched = [...new Set(unmatched)];
console.log('=== merge-supplement ===');
console.log('  memberships added: ' + added);
console.log('  unmatched names (' + uniqUnmatched.length + '): ' + (uniqUnmatched.length ? uniqUnmatched.join(', ') : 'none'));
console.log('  -> wrote grid/data/corpus.json');
console.log('\nNext: node grid/import-corpus.js  then  cd grid/match && node verify-generator.js');
