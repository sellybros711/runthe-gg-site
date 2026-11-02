/* Shut The Door modes.js: the vote's candidates and Survivor's sequence (CONTRACT.md 16 and 17).
 *   node shut-the-door/test/modes.mjs
 *
 *   the server's list of situations is the schedule's rotation, and its vote epoch is modes.js's
 *   the candidates are the ones the server's own test expects (supabase/test/..._vote_survivor_test.sql)
 *   two different candidates a day, neither offered in the 13 days before, so nothing played in
 *   the last 13 days comes back, whichever way every vote goes; and the pairs vary
 *   before the vote, the day's pack is the schedule's, previews included
 *   Survivor: the same run for everyone, every situation once a cycle, its own seed per index,
 *   and a Pro run of its own
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const M = require('../modes.js');
const C = require('../contract.js');
const R = require('../rng.js');
const sched = JSON.parse(readFileSync(join(HERE, '..', 'data', 'schedule.json'), 'utf8'));

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

/* the server holds the same list and the same first day */
const sql = readFileSync(join(ROOT, 'supabase', '160_shut_the_door_vote_survivor.sql'), 'utf8');
// 160's seed, then 161 (rules 8): its deletes and its inserts at the same ord
const sql161 = readFileSync(join(ROOT, 'supabase', '161_shut_the_door_full_close.sql'), 'utf8');
const gone = new Set([...(sql161.match(/delete from public\.shutdoor_packs where id in \(([^)]*)\)/) || ['', ''])[1].matchAll(/'(std-[a-z0-9-]+)'/g)].map(m => m[1]));
const put = [...sql161.matchAll(/^\s*\('(std-[a-z0-9-]+)', (\d+)\)/gm)].map(m => [m[1], +m[2]]);
const rows = [...sql.matchAll(/^\s*\('(std-[a-z0-9-]+)', (\d+)\)/gm)].map(m => [m[1], +m[2]])
  .filter(r => !gone.has(r[0])).concat(put).sort((a, b) => a[1] - b[1]);
check('the server\'s situations are the schedule\'s rotation, in order',
  JSON.stringify(rows.map(r => r[0])) === JSON.stringify(sched.rotation) && rows.every((r, i) => r[1] === i),
  `${rows.length} rows against ${sched.rotation.length}`);
const ep = (sql.match(/shutdoor_vote_epoch\(\) returns date\s+language sql immutable as \$\$ select date '(\d{4}-\d\d-\d\d)'/) || [])[1];
check('the server\'s vote epoch is modes.js\'s', ep === M.VOTE.EPOCH, `${ep} against ${M.VOTE.EPOCH}`);
check('the server\'s fixed rotation length is the rotation\'s', sql.includes(`% ${sched.rotation.length}) + ${sched.rotation.length}) % ${sched.rotation.length}`));
check('the vote begins after daily #1', M.VOTE.EPOCH > C.EPOCH);

/* the server's own test expects modes.js's candidates */
// the latest list's own test: 161's (rules 8), since its candidates are drawn from the new list
const test = readFileSync(join(ROOT, 'supabase', 'test', 'shut_the_door_full_close_test.sql'), 'utf8');
const expect = [...test.matchAll(/\('(\d{4}-\d\d-\d\d)', '(std-[a-z0-9-]+)', '(std-[a-z0-9-]+)'\)/g)].map(m => m.slice(1));
check('the server test checks 60 days', expect.length === 60);
check('and they are modes.js\'s candidates, day by day', expect.every(([d, a, b]) => {
  const c = M.candidates(sched, d); return c[0] === a && c[1] === b;
}), JSON.stringify(expect.find(([d, a, b]) => { const c = M.candidates(sched, d); return c[0] !== a || c[1] !== b; })));

/* the rule itself, over a year of vote days, with every vote going a random way */
{
  const DAYS = 365;
  let bad = 0, repeatPlay = 0, pairs = new Set(), bothNew = 0;
  const played = {};
  let x = 7;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = 0; i < DAYS; i++) {
    const d = M.addDays(M.VOTE.EPOCH, i);
    const [a, b] = M.candidates(sched, d);
    if (!a || !b || a === b) bad++;
    for (let k = 1; k <= M.VOTE.WINDOW; k++) {
      const p = M.addDays(d, -k);
      const ex = M.voteOpen(p) ? M.candidates(sched, p) : [M.fixedPack(sched, p)];
      if (ex.includes(a) || ex.includes(b)) bad++;
    }
    const win = rnd() < 0.5 ? a : b;
    if (played[win] && C.dayOffsetOf(d) - C.dayOffsetOf(played[win]) <= M.VOTE.WINDOW) repeatPlay++;
    played[win] = d;
    pairs.add([a, b].sort().join('|'));
    if (sched.rotation.includes(a) && sched.rotation.includes(b)) bothNew++;
  }
  check(`a year of votes: two different candidates a day, neither offered in the ${M.VOTE.WINDOW} days before`, bad === 0, `${bad}`);
  check(`whichever way the votes go, nothing played in the last ${M.VOTE.WINDOW} days comes back`, repeatPlay === 0, `${repeatPlay}`);
  check('the pairs vary (more than 150 different pairs in a year)', pairs.size > 150, `${pairs.size}`);
  check('every candidate is one of the situations', bothNew === DAYS);
}
check('no candidates before the vote', M.candidates(sched, M.addDays(M.VOTE.EPOCH, -1)) === null);
check('the default is candidate A', M.defaultPack(sched, M.VOTE.EPOCH) === M.candidates(sched, M.VOTE.EPOCH)[0]);

/* before the vote, the schedule's own day */
{
  const days = Object.keys(sched.days).filter(d => d < M.VOTE.EPOCH);
  check('before the vote, the day\'s pack is the schedule\'s', days.length > 0 && days.every(d => M.fixedPack(sched, d) === sched.days[d].pack));
  check('a preview day keeps the rotation it was served from (the first ten)',
    M.fixedPack(sched, '2026-10-25') === sched.previewRotation[9] && M.fixedPack(sched, '2026-10-17') === sched.previewRotation[1]);
}

/* Survivor */
{
  const day = '2026-11-20';
  const L = sched.rotation.length;
  const run0 = Array.from({ length: L * 2 }, (_, i) => M.survivorAt(sched, day, 0, i));
  const again = Array.from({ length: L * 2 }, (_, i) => M.survivorAt(sched, day, 0, i));
  check('Survivor: run 0 is the same sequence every time (everyone gets the same run)', JSON.stringify(run0) === JSON.stringify(again));
  check('every situation once in each cycle of ' + L,
    new Set(run0.slice(0, L).map(x => x.pack)).size === L && new Set(run0.slice(L).map(x => x.pack)).size === L);
  check('each situation has its own seed: the day, the run and the index',
    run0.every((x, i) => x.seed === R.hashSeed(M.SURVIVOR.PREFIX + day + '-0-' + i)) && new Set(run0.map(x => x.seed)).size === run0.length);
  const run1 = Array.from({ length: L }, (_, i) => M.survivorAt(sched, day, 1, i));
  check('a second run (Pro) is a sequence of its own', JSON.stringify(run1.map(x => x.pack)) !== JSON.stringify(run0.slice(0, L).map(x => x.pack))
    && run1.every((x, i) => x.seed !== run0[i].seed));
  const other = M.survivorAt(sched, M.addDays(day, 1), 0, 0);
  check('the next day\'s run is a new one', other.seed !== run0[0].seed);
  check('only a door shut goes on', M.SURVIVOR.CONTINUES === 'door_shut');
}

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
