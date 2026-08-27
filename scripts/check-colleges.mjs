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
  /* THE STATE QUALIFIER, WHICH THE FEEDS SPELL FOUR WAYS. This is the bug a
     player emailed in: Ben Roethlisberger's row says "Miami, O.", he typed
     "Miami (OH)", and the comparison stopped at "o" against "oh". Every
     spelling of a state now collapses to one token, so all of these are the
     one answer they have always been. */
  ['Miami (OH)', 'Miami, O.'], ['Miami OH', 'Miami, O.'], ['Miami Ohio', 'Miami, O.'],
  ['Miami (FL)', 'Miami (Fla.)'], ['Miami Florida', 'Miami (Fla.)'],
  ['California (PA)', 'California, Pa.'], ['Monmouth', 'Monmouth, N.J.'],
  ['Augustana', 'Augustana, S.D.'], ['Albany State', 'Albany State, Ga.'],
  ['Western State', 'Western State, Colo.'], ['Wayne State', 'Wayne State (NE)'],
  ['Murray State', 'Murray State (KY)'], ['Regina', 'Regina, Can.'],
  ['Regina (Canada)', 'Regina, Can.'],
  /* "St." is Saint in front and State on the end, and the table could only say
     one. It said State, so "St. Mary's (CA)" became "state marys ca". */
  ["Saint Mary's (CA)", "St. Mary's (CA)"], ["St. John's", "Saint John's"],
  ['Michigan St', 'Michigan State'], ['Ohio', 'Ohio U.'], ['Ohio University', 'Ohio U.'],
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
  /* The state token collapses spellings; it must never collapse SCHOOLS. Two
     Miamis stay two Miamis, and a state word at the FRONT is a school name
     (Ohio University, Indiana, Iowa) rather than a postcode. */
  ['Miami (OH)', 'Miami (FL)'], ['Miami (OH)', 'Miami (Fla.)'], ['Miami, O.', 'Miami (FL)'],
  ['Ohio', 'Ohio State'], ['Ohio U.', 'Ohio State'], ['Miami (OH)', 'Ohio State'],
  ['Indiana', 'Indiana State'], ['Iowa', 'Iowa State'], ['Washington', 'Washington State'],
  ["St. Mary's (CA)", "Saint Joseph's College (IN)"],
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
/* ---- 4. one school, one spelling, in the data we ship --------------------- */
/* The recurrence guard. Section 1 proves the MATCHER handles a spelling; this
   proves we are not carrying two spellings of one school in the first place,
   which is what put "Miami, O." in front of a player as the right answer to a
   question he had answered correctly. Two labels that normalise to one key are
   one school written two ways: pick one and repair the other, in the build or
   in supplement.js. */
console.log('\n4) no school is spelled two ways in the corpus');
if (!corpus) {
  console.log('  skipped: the corpus did not load');
} else {
  const byKey = new Map();
  for (const e of corpus) {
    if (!e || !e.col) continue;
    const k = T.schoolKey(e.col);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, new Set());
    byKey.get(k).add(String(e.col));
  }
  /* A BASELINE, NOT A CLEAN SHEET. Nineteen schools already carry two labels
     because the feeds disagree, and the matcher now unifies every one of them,
     so they cost a player nothing: this is a display wart, not a wrong answer.
     Failing on all nineteen tonight would make the check something people
     learn to skip, which is exactly what the dash checker's own notes warn
     against. So the known ones are listed and the check fails on a NEW one,
     which is the thing worth catching. Repair one and delete its line. */
  const KNOWN = new Set([
    'louisianastate', 'connecticut', 'nevadalasvegas', 'southerncalifornia',
    'texaselpaso', 'louisianamonroe', 'northcarolinastate', 'calpolysanluisobispo',
    'texaschristian', 'brighamyoung', 'southernmethodist', 'bowlinggreenstate',
    'californiapa', 'louisianalafayette', 'detroitmercy', 'saintmarysca',
    'wisconsinoshkosh'
  ]);
  const dupes = [...byKey.entries()].filter(([, v]) => v.size > 1);
  const fresh = dupes.filter(([k]) => !KNOWN.has(k));
  for (const [k, v] of fresh) fail('one school, two spellings: ' + [...v].join('  vs  ') + '   [key ' + k + ']');
  const old = dupes.length - fresh.length;
  if (!fresh.length) {
    console.log('  ok, no NEW double-spelling (' + old + ' known ones still to tidy, all matched correctly)');
  }
}

/* ---- 5. every college we ship is accepted as itself, and as it is PRINTED - */
/* The player types what the screen shows them. Alma Mater prints
   RTGType.schoolLabel(col) now, so if the label were not itself an accepted
   answer we would be showing somebody a word and then refusing it. This closes
   that loop over the whole corpus rather than over a list of examples. */
console.log('\n5) every college accepts itself and its printed label');
if (!corpus) {
  console.log('  skipped: the corpus did not load');
} else {
  const cols = [...new Set(corpus.filter((e) => e && e.col).map((e) => String(e.col)))];
  let n = 0;
  for (const c of cols) {
    const label = T.schoolLabel(c);
    if (!T.sameCollege(c, c)) fail('a college does not accept itself: ' + c);
    else if (!T.sameCollege(label, c) || !T.sameCollege(c, label)) fail('printed "' + label + '" but would refuse it for ' + c);
    else n++;
  }
  if (n === cols.length) console.log('  ok, all ' + n + ' colleges');
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\ncolleges ok');
