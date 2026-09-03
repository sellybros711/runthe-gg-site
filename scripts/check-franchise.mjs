/* Guard: one franchise, one team label, in arcade/sportegories-data.js.
 *
 * A player emailed to say Sportegories rejected "Steven Jackson" for "Played
 * for the St. Louis Rams". The corpus was carrying the Rams as two separate
 * teams, split by which upstream source named them rather than by era, so
 * every Rams category refused about half the franchise. The Raiders, Chargers,
 * Athletics, Angels, Braves, Dodgers, Nets, Grizzlies and Clippers all had the
 * same hole.
 *
 * It is a silent failure: the game says "Doesn't fit this category" in exactly
 * the same voice it uses for a genuinely wrong answer, so nobody finds it
 * except a player who knows they are right and bothers to write in. This runs
 * against the built data so a future rebuild cannot quietly reopen it.
 *
 *   node scripts/check-franchise.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = {};
new Function('window', readFileSync(path.join(ROOT, 'arcade/sportegories-data.js'), 'utf8'))(W);
const D = W.RTG_SPORTEGORIES_DATA;

const fails = [];
const T = D.teams;
const iT = new Map(T.map((t, i) => [t, i]));
const player = (n) => D.players.find((p) => p[0] === n);
const plays = (name, team) => {
  const p = player(name);
  if (!p) return 'MISSING FROM CORPUS';
  return p[3].includes(iT.get(team));
};

// 1) No alias may survive as a team in its own right. If one does, the split
//    is back and half the franchise is unreachable again.
for (const old of Object.keys(D.alias || {})) {
  if (iT.has(old) && D.alias[old] !== old) {
    fails.push(`team list still contains "${old}", which should fold into "${D.alias[old]}"`);
  }
}

// 2) No category may name a franchise the team list no longer has.
for (const c of D.cats) {
  for (const old of Object.keys(D.alias || {})) {
    if (D.alias[old] !== old && c.l.includes(old)) {
      fails.push(`category ${c.i} "${c.l}" names a merged franchise`);
    }
  }
}

// 3) Team labels must be clean strings. One arrived as "NO/Oklahoma City\r\n
//    Hornets", which would have printed a newline inside a category label.
for (const t of T) {
  if (t !== t.trim() || /\s{2,}|[\r\n\t]/.test(t)) fails.push(`unclean team label ${JSON.stringify(t)}`);
}

/* 4) Named cases. The starred ones were each checked against the pre-merge data
      and came back FALSE there, so they are the actual regression: if the split
      ever returns, these go red first. The rest spread the net over the other
      merged franchises. */
const CASES = [
  ['Steven Jackson', 'Rams'],       // * the emailed one: 10,135 yards in St. Louis
  ['Kurt Warner', 'Rams'],          // *
  ['Marshall Faulk', 'Rams'],       // *
  ['Isaac Bruce', 'Rams'],          // *
  ['Eric Dickerson', 'Rams'],       // *
  ['Cooper Kupp', 'Rams'],          // *
  ['Gary Payton', 'Oklahoma City Thunder'],   // * Seattle, before the move
  ['Tim Brown', 'Raiders'], ['Howie Long', 'Raiders'], ['Charles Woodson', 'Raiders'],
  ['LaDainian Tomlinson', 'Chargers'], ['Junior Seau', 'Chargers'],
  ['Rickey Henderson', 'Athletics'], ['Reggie Jackson', 'Athletics'],
  ['Nolan Ryan', 'Angels'], ['Vladimir Guerrero', 'Angels'],
  ['Hank Aaron', 'Braves'], ['Jackie Robinson', 'Dodgers'],
  ['Jason Kidd', 'Nets'], ['Pau Gasol', 'Grizzlies']
];
for (const [name, team] of CASES) {
  if (!iT.has(team)) { fails.push(`no team "${team}" in the corpus`); continue; }
  const r = plays(name, team);
  if (r !== true) fails.push(`${name} should count for "${team}" (got ${r})`);
}

/* 5) Categories with no recognizable answers. `n` counts answers above the fame
      gate, and a category at zero has an empty viability map, so the daily
      generator can never serve it. Harmless but dead, and a sharp jump here
      would mean a merge had emptied a pool, so report rather than fail. */
const thin = D.cats.filter((c) => !c.n);
if (thin.length > 40) fails.push(`${thin.length} categories have no recognizable answers (was 33)`);
else if (thin.length) console.log(`note: ${thin.length} categories have no recognizable answers and can never be served, e.g. "${thin[0].l}"`);

if (fails.length) {
  console.error('Franchise check FAILED:\n' + fails.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(`Franchise check passed: ${T.length} teams, ${D.cats.length} categories, ${CASES.length} cases.`);
