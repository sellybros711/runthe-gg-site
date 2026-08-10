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

function parse(src) {
  const m = src.match(/window\.RTG_JERSEYS\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) throw new Error('unparseable');
  return JSON.parse(m[1]);
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
if (b.total < a.total * 0.85) problems.push(`total dropped ${a.total} -> ${b.total} (>15%)`);
for (const sport of ['NFL', 'NBA', 'MLB']) {
  if (a.by[sport] > 0 && b.by[sport] < a.by[sport] * 0.6) {
    problems.push(`${sport} dropped ${a.by[sport]} -> ${b.by[sport]} (>40%)`);
  }
}
if (problems.length) { console.error('GUARD FAIL:', problems.join('; ')); process.exit(1); }
console.log('GUARD OK: dataset is healthy, safe to commit.');
process.exit(0);
