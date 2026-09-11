/* Regression guard for the scheduled jersey refresh.
 *
 * A daily scrape can be throttled or blocked by an upstream source (especially
 * Basketball-Reference), which would produce a truncated arcade/jerseys.js. If we
 * committed that, the Number Game would silently lose players. This compares the
 * freshly generated file against the committed one and FAILS (exit 1) on a
 * suspicious shrink, so the commit step is skipped and the last-good data stays.
 *
 * Exit 0 = safe to commit. Exit 1 = regression, do not commit.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

/* RUN THE FILE, do not read it.
 *
 * This used to match `window.RTG_JERSEYS = {...}` and JSON.parse the braces,
 * which stopped working the day the generated datasets were packed: the file
 * is now a function that decodes a dictionary, so the regex missed and every
 * run of this guard said "new file unreadable". It exits 1 on that, so the
 * jerseys refresh has been failing safe rather than silently, but it has been
 * failing, and nothing said so because this guard runs only inside its own
 * workflow and is not in the check suite.
 *
 * Executing it is also the honest test: what the games get is whatever this
 * file DOES, not what it looks like. */
function parse(src) {
  const box = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'self', 'globalThis', src)(box, box, box);
  const d = box.RTG_JERSEYS;
  if (!d || !Array.isArray(d.stints)) throw new Error('did not define window.RTG_JERSEYS.stints');
  return d;
}
function tally(data) {
  const by = { NFL: 0, NBA: 0, MLB: 0, NHL: 0 };
  for (const s of data.stints) by[s.sport] = (by[s.sport] || 0) + 1;
  return { total: data.stints.length, by };
}

let oldData, newData;
try { newData = parse(readFileSync('arcade/jerseys.js', 'utf8')); }
catch (e) { console.error('GUARD FAIL: new file unreadable:', e.message); process.exit(1); }
try { oldData = parse(execSync('git show HEAD:arcade/jerseys.js', { encoding: 'utf8' })); }
catch (e) { console.log('GUARD: no committed baseline to compare; allowing.'); process.exit(0); }

const a = tally(oldData), b = tally(newData);
console.log('old', JSON.stringify(a));
console.log('new', JSON.stringify(b));

const problems = [];

/* NO CLUB IN A SEASON IT DID NOT EXIST IN.
 *
 * nflverse writes HOU for the Houston Oilers and for the Houston Texans, which
 * are two different franchises: the Oilers left for Tennessee in 1997 and the
 * Texans were founded in 2002. Reading the code without the season filed eight
 * Oilers seasons under the Texans, so Bruce Matthews, Eddie George, Frank
 * Wycheck and Brad Hopkins each looked like two-franchise careers. A player
 * wrote in when Sportegories refused Bruce Matthews for "Offensive Lineman who
 * never left one franchise": nineteen years, one club, through a relocation
 * and a rename.
 *
 * The count guards below cannot see this. The scrape was the right SIZE and
 * the wrong SHAPE, and a club appearing before it was founded is the cheapest
 * shape there is to state. Add a row whenever a code starts meaning a second
 * club; the resolver in fetch-jerseys.mjs is the other half. */
const FOUNDED = {
  'Houston Texans': 2002, 'Tennessee Titans': 1997, 'Baltimore Ravens': 1996,
  'Carolina Panthers': 1995, 'Jacksonville Jaguars': 1995,
  'Los Angeles Chargers': 2017, 'Las Vegas Raiders': 2020,
  'Charlotte Bobcats': 2004, 'Memphis Grizzlies': 2001, 'Toronto Raptors': 1995,
  'Oklahoma City Thunder': 2008, 'Brooklyn Nets': 2012, 'New Orleans Pelicans': 2013,
  'Washington Nationals': 2005, 'Miami Marlins': 2012, 'Tampa Bay Rays': 2008,
  'Arizona Diamondbacks': 1998, 'Colorado Rockies': 1993, 'Cleveland Guardians': 2022
};
{
  const early = new Map();
  for (const s of newData.stints) {
    const born = FOUNDED[s.team];
    if (born && s.y0 < born) {
      const k = s.team + ' in ' + s.y0 + ' (founded ' + born + ')';
      early.set(k, (early.get(k) || 0) + 1);
    }
  }
  if (early.size) {
    const rows = [...early.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6)
      .map(([k, n]) => k + ' x' + n);
    problems.push('a club is listed before it existed: ' + rows.join('; '));
  }
}

if (b.total < a.total * 0.85) problems.push(`total dropped ${a.total} -> ${b.total} (>15%)`);
for (const sport of ['NFL', 'NBA', 'MLB']) {
  if (a.by[sport] > 0 && b.by[sport] < a.by[sport] * 0.6) {
    problems.push(`${sport} dropped ${a.by[sport]} -> ${b.by[sport]} (>40%)`);
  }
}
if (problems.length) { console.error('GUARD FAIL:', problems.join('; ')); process.exit(1); }
console.log('GUARD OK: dataset is healthy, safe to commit.');
process.exit(0);
