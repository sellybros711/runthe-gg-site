/* Does the arcade accept the name a fan actually types for a school?
 *
 * Alma Mater asks you to TYPE the college, and its own how-to promises that
 * "UNC, North Carolina and University of North Carolina all count as the same
 * right answer". It did not hold: somebody typed NC State for Philip Rivers and
 * was told the answer was North Carolina State, which is the same place. The
 * data is not even consistent with itself, carrying both "NC State" and "North
 * Carolina State", both "LSU" and "Louisiana State", both "USC" and "Southern
 * California", so the matcher has to unify the labels our own file uses before
 * it can hope to unify what a player types.
 *
 * The other half matters more. A wrong answer marked RIGHT is the worse bug,
 * and the rule that let abbreviations through was originally "allow any extra
 * two-letter word", which quietly accepted "Texas" for a Texas A&M man, since
 * A&M normalises to two letters. Every pair below that must stay apart is a
 * real school somebody could type instead of the right one.
 *
 * Run: node scripts/check-colleges.mjs      (no network, no data build)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const box = { console };
box.self = box; box.window = box; box.globalThis = box;
createContext(box);
runInContext(readFileSync('arcade/type.js', 'utf8'), box);
const T = box.RTGType;

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };

/* ---- 1. what a fan types reaches the label the data uses ------------------ */
const SAME = [
  ['NC State', 'North Carolina State'], ['NCSU', 'North Carolina State'],
  ['UNC', 'North Carolina'], ['University of North Carolina', 'North Carolina'],
  ['LSU', 'Louisiana State'], ['USC', 'Southern California'],
  ['UCF', 'Central Florida'], ['UMass', 'Massachusetts'], ['UConn', 'Connecticut'],
  ['Ole Miss', 'Mississippi'], ['Pitt', 'Pittsburgh'], ['TCU', 'Texas Christian'],
  ['BYU', 'Brigham Young'], ['SMU', 'Southern Methodist'], ['UTEP', 'Texas-El Paso'],
  ['Va Tech', 'Virginia Tech'], ['Ga Tech', 'Georgia Tech'],
  ['Miss State', 'Mississippi State'], ['A&M', 'Texas A&M'],
  ['Cal', 'California'], ['UAB', 'Alabama-Birmingham'], ['ECU', 'East Carolina'],
  ['WVU', 'West Virginia'], ['FAU', 'Florida Atlantic'], ['FIU', 'Florida International'],
  ['ODU', 'Old Dominion'], ['SDSU', 'San Diego State'], ['App State', 'Appalachian State'],
  ['Southern Miss', 'Southern Mississippi'], ['Penn', 'Pennsylvania'],
  ['Ohio St', 'Ohio State'], ['Michigan St', 'Michigan State'],
  ['St Johns', "St. John's"], ['Miami', 'Miami (FL)'], ['Miami Fla', 'Miami (Fla.)'],
  ['William and Mary', 'William & Mary'], ['Cal Poly', 'Cal Poly San Luis Obispo'],
  ['Bowling Green', 'Bowling Green State'], ['Long Beach St', 'Long Beach State'],
  ['UCSB', 'UC Santa Barbara'], ['Temple', 'Temple University'],
  /* The short form has to work even where the long forms are two different
     schools, which is the whole knot: BC is Boston College to everybody, and
     Texas AM is Texas A&M however you punctuate the ampersand. */
  ['BC', 'Boston College'], ['BU', 'Boston University'],
  ['Texas AM', 'Texas A&M'], ['Texas A and M', 'Texas A&M'],
  ['ND', 'Notre Dame'], ['UVA', 'Virginia'], ['Vandy', 'Vanderbilt'],
  ['Cuse', 'Syracuse'], ['Nova', 'Villanova'], ['Mizzou', 'Missouri'],
];
console.log('1) the short name a fan types reaches the data\'s label');
for (const [a, b] of SAME) {
  if (!T.sameCollege(a, b)) fail('"' + a + '" should be accepted for ' + b);
  if (!T.sameCollege(b, a)) fail('"' + b + '" should be accepted for ' + a + ' (the data uses both)');
}
if (!bad) console.log('  ok, both directions, ' + SAME.length + ' pairs');

/* ---- 2. two different schools never unify --------------------------------- */
const before = bad;
const DIFFER = [
  ['Texas', 'Texas A&M'], ['Florida', 'Florida A&M'], ['North Carolina', 'North Carolina A&T'],
  ['Michigan', 'Michigan State'], ['Ohio', 'Ohio State'], ['Mississippi', 'Mississippi State'],
  ['Oregon', 'Oregon State'], ['Washington', 'Washington State'], ['Arizona', 'Arizona State'],
  ['Miami (FL)', 'Miami (OH)'], ['Alabama', 'Alabama-Birmingham'],
  ['California', 'Cal Poly San Luis Obispo'], ['Kansas', 'Kansas State'],
  ['Penn State', 'Pennsylvania'], ['San Diego', 'San Diego State'],
  ['Southern California', 'South Carolina'], ['Iowa', 'Iowa State'],
  ['Colorado', 'Colorado State'], ['North Carolina', 'North Carolina State'],
  ['Louisiana State', 'Louisiana Tech'], ['Boston College', 'Boston University'],
  ['Miami', 'Ohio'], ['Georgia', 'Georgia Tech'], ['Virginia', 'Virginia Tech'],
  ['Texas', 'Texas Tech'], ['Utah', 'Utah State'], ['Nevada', 'UNLV'],
  ['BC', 'Boston University'], ['BU', 'Boston College'],
];
console.log('\n2) two different schools stay two different schools');
for (const [a, b] of DIFFER) {
  if (T.sameCollege(a, b)) fail('"' + a + '" must NOT be accepted for ' + b);
}
if (bad === before) console.log('  ok, ' + DIFFER.length + ' pairs kept apart');

/* ---- 3. every alias points at a school somebody attended ------------------ */
/* An alias for a school nobody in the corpus went to is dead weight, and one
   with a typo in its target is worse: it silently never fires. */
console.log('\n3) every alias target is a school in the corpus');
let corpus = null;
try {
  const ent = { console }; ent.self = ent; ent.window = ent; ent.globalThis = ent;
  createContext(ent);
  runInContext(readFileSync('arcade/match/entities.js', 'utf8'), ent);
  for (const f of ['former', 'stars', 'awards', 'supplement', 'data']) {
    try { runInContext(readFileSync('arcade/' + f + '.js', 'utf8'), ent); } catch (e) {}
  }
  corpus = ent.GRID_ENTITIES || null;
} catch (e) { corpus = null; }
if (!corpus) {
  console.log('  skipped: the corpus did not load');
} else {
  const keys = new Set();
  for (const e of corpus) if (e && e.col) keys.add(T.schoolKey(e.col));
  const src = readFileSync('arcade/type.js', 'utf8');
  const block = src.slice(src.indexOf('var SCHOOL_ALIAS'), src.indexOf('WORD-LEVEL'));
  const targets = [...block.matchAll(/:\s*'([a-z0-9]+)'/g)].map((m) => m[1]);
  const orphan = [...new Set(targets)].filter((t) => !keys.has(T.schoolKey(t)));
  if (orphan.length) fail('alias targets no player attended: ' + orphan.join(', '));
  else console.log('  ok, all ' + new Set(targets).size + ' alias targets exist in the corpus');
}
if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\ncolleges ok');
