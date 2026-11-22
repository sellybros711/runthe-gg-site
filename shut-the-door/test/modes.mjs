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
// then 179: 12 of the 13 clubs' situations at the end, each from its first day (modes.js POOL.FROM)
const sql179 = readFileSync(join(ROOT, 'supabase', '179_shut_the_door_thirteen_clubs.sql'), 'utf8');
const put179 = [...sql179.matchAll(/^\s*\('(std-[a-z0-9-]+)', (\d+), date '(\d{4}-\d\d-\d\d)'\)/gm)].map(m => [m[1], +m[2], m[3]]);
// then 184: the Reds' situation at the end, from a day of its own (modes.js POOL.GROW's last)
const sql184 = readFileSync(join(ROOT, 'supabase', '184_shut_the_door_reds.sql'), 'utf8');
const put184 = [...sql184.matchAll(/^\s*\('(std-[a-z0-9-]+)', (\d+), date '(\d{4}-\d\d-\d\d)'\)/gm)].map(m => [m[1], +m[2], m[3]]);
const REDS = M.POOL.GROW[M.POOL.GROW.length - 1];
const rows = [...sql.matchAll(/^\s*\('(std-[a-z0-9-]+)', (\d+)\)/gm)].map(m => [m[1], +m[2]])
  .filter(r => !gone.has(r[0])).concat(put).concat(put179.map(r => [r[0], r[1]])).concat(put184.map(r => [r[0], r[1]])).sort((a, b) => a[1] - b[1]);
check('the server\'s situations are the schedule\'s rotation, in order',
  JSON.stringify(rows.map(r => r[0])) === JSON.stringify(sched.rotation) && rows.every((r, i) => r[1] === i),
  `${rows.length} rows against ${sched.rotation.length}`);
// the first day: 163 moved it (2026-11-16 in 160, 2026-11-05 from 163), the live database's last word
const ep = (readFileSync(join(ROOT, 'supabase', '163_shut_the_door_vote_nov5.sql'), 'utf8')
  .match(/shutdoor_vote_epoch\(\) returns date\s+language sql immutable as \$\$ select date '(\d{4}-\d\d-\d\d)'/) || [])[1];
check('the server\'s vote epoch (163) is modes.js\'s', ep === M.VOTE.EPOCH, `${ep} against ${M.VOTE.EPOCH}`);
// the fixed pack is for the days before the vote, all of them served from the first thirty (POOL.BASE)
check('the server\'s fixed rotation length is the thirty the days before the vote were served from', sql.includes(`% ${M.POOL.BASE}) + ${M.POOL.BASE}) % ${M.POOL.BASE}`)
  && M.POOL.BASE === 30 && M.addDays(M.VOTE.EPOCH, -1) < M.POOL.FROM);
check('179 adds the 12 past the thirty, each from POOL.FROM, the first growth',
  put179.length === 12 && M.POOL.GROW[0][0] === M.POOL.BASE + 12 && M.POOL.GROW[0][1] === M.POOL.FROM
  && put179.every((r, i) => r[0] === sched.rotation[M.POOL.BASE + i] && r[2] === M.POOL.FROM),
  `${put179.length} rows`);
check('184 adds the Reds, the rotation\'s last, from POOL.GROW\'s last day, after POOL.FROM',
  put184.length === 1 && REDS[0] === sched.rotation.length && put184[0][0] === 'std-2025-pagan-mil'
  && put184[0][0] === sched.rotation[REDS[0] - 1] && put184[0][1] === REDS[0] - 1 && put184[0][2] === REDS[1] && REDS[1] > M.POOL.FROM,
  JSON.stringify(put184));
check('184\'s guard and its first day are POOL.GROW\'s last', [...sql184.matchAll(/day >= date '(\d{4}-\d\d-\d\d)'/g)].every(m => m[1] === REDS[1])
  && /day >= date '/.test(sql184));
check('179\'s guard and its first day are POOL.FROM', [...sql179.matchAll(/day >= date '(\d{4}-\d\d-\d\d)'/g)].every(m => m[1] === M.POOL.FROM)
  && /day >= date '/.test(sql179));
check('the vote begins after daily #1', M.VOTE.EPOCH > C.EPOCH);
// 163's shutdoor_fixed_pack walks ord 0 to 9 before daily #1: the preview rotation must be the rotation's first ten
check('the preview rotation is the rotation\'s first ten (163)', JSON.stringify(sched.previewRotation) === JSON.stringify(sched.rotation.slice(0, 10)));

/* the server's own test expects modes.js's candidates */
// the latest test: 163's, drawn from the rules 8 list (161) and the first day 163 set
// 163's test was drawn from the thirty: its days before POOL.FROM still hold, unchanged. 179's test
// is drawn from the 42 from POOL.FROM, over the same 60 days
const expectOf = (f) => [...readFileSync(join(ROOT, 'supabase', 'test', f), 'utf8')
  .matchAll(/\('(\d{4}-\d\d-\d\d)', '(std-[a-z0-9-]+)', '(std-[a-z0-9-]+)'\)/g)].map(m => m.slice(1));
const agree = (rows) => rows.every(([d, a, b]) => { const c = M.candidates(sched, d); return c[0] === a && c[1] === b; });
const firstOff = (rows) => JSON.stringify(rows.find(([d, a, b]) => { const c = M.candidates(sched, d); return c[0] !== a || c[1] !== b; }));
const expect163 = expectOf('shut_the_door_vote_nov5_test.sql');
const before = expect163.filter(([d]) => d < M.POOL.FROM);
check('163\'s server test checks 60 days', expect163.length === 60);
check('every one of its ' + before.length + ' days before POOL.FROM is still modes.js\'s candidates, day by day', before.length >= 14 && agree(before), firstOff(before));
const expect = expectOf('shut_the_door_thirteen_clubs_test.sql');
check('179\'s server test checks the same 60 days', expect.length === 60 && expect.every((r, i) => r[0] === expect163[i][0]));
// (179's test was drawn before the Reds: its days before their first day still hold, unchanged)
const before184 = expect.filter(([d]) => d < REDS[1]);
check('and its days before the Reds\' first day are modes.js\'s candidates, day by day', before184.length >= 21 && agree(before184), firstOff(before184));
check('179\'s test keeps 163\'s days before POOL.FROM', expect.filter(([d]) => d < M.POOL.FROM).every((r, i) => r.join() === before[i].join()));
const expect184 = expectOf('shut_the_door_reds_test.sql');
check('184\'s server test checks the same 60 days', expect184.length === 60 && expect184.every((r, i) => r[0] === expect163[i][0]));
check('and they are modes.js\'s candidates, day by day', agree(expect184), firstOff(expect184));
check('184\'s test keeps 179\'s days before the Reds\' first day', expect184.filter(([d]) => d < REDS[1]).every((r, i) => r.join() === before184[i].join()));

/* the 12 join on their own day: every day before it is what the thirty alone give, the vote and Survivor */
{
  const thirty = Object.assign({}, sched, { rotation: sched.rotation.slice(0, M.POOL.BASE) });
  const days = []; for (let d = M.VOTE.EPOCH; d < M.addDays(M.POOL.FROM, 120); d = M.addDays(d, 1)) days.push(d);
  const pre = days.filter(d => d < M.POOL.FROM);
  check('before POOL.FROM the vote is the thirty\'s, day by day', pre.every(d => M.candidates(sched, d).join() === M.candidates(thirty, d).join()));
  check('before POOL.FROM Survivor is the thirty\'s: run 0 and run 1, two cycles',
    pre.every(d => [0, 1].every(r => Array.from({ length: 60 }, (_, i) => i).every(i => {
      const x = M.survivorAt(sched, d, r, i), y = M.survivorAt(thirty, d, r, i); return x.pack === y.pack && x.seed === y.seed;
    }))));
  check('the day before POOL.FROM offers none of the 12', M.candidates(sched, M.addDays(M.POOL.FROM, -1)).every(id => sched.rotation.indexOf(id) < M.POOL.BASE));
  const offered = new Set(days.filter(d => d >= M.POOL.FROM).flatMap(d => M.candidates(sched, d)));
  const added = sched.rotation.slice(M.POOL.BASE);
  check('from POOL.FROM each of the 12 is offered within 120 days', added.every(id => offered.has(id)), JSON.stringify(added.filter(id => !offered.has(id))));
  const n42 = M.poolOn(sched, M.POOL.FROM).length;
  check('from POOL.FROM a Survivor cycle is every one of the ' + n42, n42 === 42 && new Set(Array.from({ length: n42 }, (_, i) => M.survivorAt(sched, M.POOL.FROM, 0, i).pack)).size === n42);
}

/* the Reds join on a day of their own: every day before it is what the 42 give (and the thirty before POOL.FROM) */
{
  const fortyTwo = Object.assign({}, sched, { rotation: sched.rotation.slice(0, REDS[0] - 1) });
  const days = []; for (let d = M.VOTE.EPOCH; d < M.addDays(REDS[1], 120); d = M.addDays(d, 1)) days.push(d);
  const pre = days.filter(d => d < REDS[1]);
  check('before the Reds\' day the vote is what it was, day by day', pre.every(d => M.candidates(sched, d).join() === M.candidates(fortyTwo, d).join()));
  check('before the Reds\' day Survivor is what it was: run 0 and run 1, two cycles',
    pre.every(d => [0, 1].every(r => Array.from({ length: 90 }, (_, i) => i).every(i => {
      const x = M.survivorAt(sched, d, r, i), y = M.survivorAt(fortyTwo, d, r, i); return x.pack === y.pack && x.seed === y.seed;
    }))));
  check('the day before the Reds\' day offers no Reds', !M.candidates(sched, M.addDays(REDS[1], -1)).includes('std-2025-pagan-mil'));
  check('from their day the Reds are offered within 120 days', days.filter(d => d >= REDS[1]).some(d => M.candidates(sched, d).includes('std-2025-pagan-mil')));
  check('from their day a Survivor cycle is every one of the ' + sched.rotation.length, M.poolOn(sched, REDS[1]).length === sched.rotation.length
    && new Set(Array.from({ length: sched.rotation.length }, (_, i) => M.survivorAt(sched, REDS[1], 0, i).pack)).size === sched.rotation.length);
}

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
for (const day of ['2026-11-20', M.addDays(M.POOL.FROM, 3)]) {
  const L = M.poolOn(sched, day).length;
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
}

// ---- the plates: plate.js PACK_CLUBS, the server's shutdoor_pack_clubs and the packs agree -----------
{
  console.log('\nthe plates (plate.js, supabase/162, 167 and 178)');
  const fs = await import('fs');
  const { CLUBS, clubNamed } = await import(join(HERE, '..', '3d', 'clubs.js'));
  // a fresh plate.js with its own device store, so each case starts clean
  const fresh = () => {
    const store = {};
    const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const win = { STD_CLUBS: CLUBS, STD_CLUB_NAMED: clubNamed };
    new Function('window', 'localStorage', readFileSync(join(HERE, '..', 'plate.js'), 'utf8'))(win, ls);
    return win.STD_PLATE;
  };
  const PL = fresh();
  const PC = PL.PACK_CLUBS, PT = PL.PACK_THROWBACKS;
  const key = (c) => c ? c.nick.toLowerCase().replace(/[^a-z]/g, '') : null;
  // the packs are the source: each one's closer's team and year, through plate.js keysFor
  const want = {}, wantTb = {}, teams = {};
  for (const f of fs.readdirSync(join(HERE, '..', 'data', 'packs'))) {
    const p = JSON.parse(readFileSync(join(HERE, '..', 'data', 'packs', f), 'utf8'));
    const id = f.replace(/\.json$/, '');
    let pit = null;
    const walk = (o) => { if (pit || !o || typeof o !== 'object') return; if (o.pitcher && o.id === id) { pit = o.pitcher; return; } Object.values(o).forEach(walk); };
    walk(p);
    const ks = PL.keysFor(pit && pit.team, pit && pit.year);
    if (pit && pit.team) teams[id] = pit.team + ' ' + pit.year;
    if (ks[0]) want[id] = ks[0];
    if (ks[1]) wantTb[id] = ks[1];
  }
  const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((id) => id + ':' + o[id]));
  check('every pack with a team has a plate', Object.keys(teams).length > 0 && Object.keys(teams).every((id) => want[id] && PL.club(want[id])),
    JSON.stringify(Object.keys(teams).filter((id) => !want[id])));
  check('plate.js keys every pack with a team by its closer\'s club', sorted(PC) === sorted(want), sorted(want));
  check('plate.js keys every pack in a throwback era by that era\'s plate', sorted(PT) === sorted(wantTb), sorted(wantTb));
  // the server's lists: 162's rows, the two proxy spots 167 added, the 12 clubs 179 added and the Reds 184 added; 178's throwbacks
  const sql = ['162_shut_the_door_plates.sql', '167_shut_the_door_pack_clubs_proxy.sql', '179_shut_the_door_thirteen_clubs.sql', '184_shut_the_door_reds.sql']
    .map((f) => readFileSync(join(HERE, '..', '..', 'supabase', f), 'utf8')).join('\n');
  const rows = {};
  for (const m of sql.matchAll(/\('(std-[a-z0-9-]+)', '([a-z]+)'\)/g)) rows[m[1]] = m[2];
  check('the server\'s shutdoor_pack_clubs is the same list', sorted(rows) === sorted(PC));
  const sql178 = readFileSync(join(HERE, '..', '..', 'supabase', '178_shut_the_door_plates_more.sql'), 'utf8');
  const tbRows = {};
  for (const m of sql178.matchAll(/\('(std-[a-z0-9-]+)', '([a-z]+)', '([a-z]+)'\)/g)) { tbRows[m[1]] = m[3]; check('178 keeps ' + m[1] + '\'s club as 162 has it', PC[m[1]] === m[2]); }
  check('the server\'s throwbacks (178) are the same list', sorted(tbRows) === sorted(PT), sorted(tbRows));
  const all = PL.all();
  check('every key is a plate plate.js draws', Object.values(PC).concat(Object.values(PT)).every((k) => PL.club(k)));
  check('all 30 of today\'s clubs have a plate, in clubs.js\'s order', PL.current30().length === 30 && PL.current30().join() === CLUBS.map(key).join());
  check('every key fits the profile\'s check (162: ^[a-z]{2,16}$) and none repeats',
    all.every((k) => /^[a-z]{2,16}$/.test(k)) && new Set(all).size === all.length);
  check('every throwback has its era, its two colours and today\'s club', PL.THROWBACKS.every((t) => /^\d{4}-\d{4}$/.test(t.era) && t.from <= t.to &&
    /^#[0-9A-F]{6}$/i.test(t.pri) && /^#[0-9A-F]{6}$/i.test(t.sec) && CLUBS.some((c) => key(c) === t.franchise)));

  // the unlock rules
  check('a current club: Tanner Scott\'s 2025 Dodgers unlock the Dodgers', JSON.stringify(PL.keysFor('Los Angeles Dodgers', 2025)) === '["dodgers"]');
  check('a historic era: Lidge\'s 2005 Astros unlock the Astros and the 2000-2012 Astros', JSON.stringify(PL.keysFor('Houston Astros', 2005)) === '["astros","astrosbrick"]');
  check('the same club outside that era: 2022 Astros unlock only the Astros', JSON.stringify(PL.keysFor('Houston Astros', 2022)) === '["astros"]');
  check('a renamed club by its name in its years: a 1994 Montreal Expos closer unlocks the Expos, not the Nationals', JSON.stringify(PL.keysFor('Montreal Expos', 1994)) === '["expos"]');
  check('a renamed club by its name in its years: the 2016 Indians, and the 2003 Florida Marlins',
    JSON.stringify(PL.keysFor('Cleveland Indians', 2016)) === '["indians"]' && JSON.stringify(PL.keysFor('Florida Marlins', 2003)) === '["flmarlins"]');
  check('the Devil Rays are not today\'s Rays by their last word', JSON.stringify(PL.keysFor('Tampa Bay Devil Rays', 2004)) === '["devilrays"]');
  check('a team no club fits unlocks nothing', PL.keysFor('', 2020).length === 0 && PL.keysFor('Brooklyn Robins', 1920).length === 0);
  check('a club with a situation opens on a save', PL.status('dodgers') === 'save' && PL.status('astrosbrick') === 'save');
  check('a throwback with no situation yet says so', PL.status('expos') === 'soon' && PL.status('indians') === 'soon');
  // the plates' "No situation yet" list (status 'soon') holds no club of today's (2026-11-18, supabase/179;
  // the Reds' with supabase/184)
  const soon = PL.current30().filter((k) => PL.status(k) !== 'save');
  check('every one of today\'s 30 clubs has a situation: none says "No situation yet"', soon.length === 0, JSON.stringify(soon));
  check('and its situation is a pack of that club\'s, keyed by today\'s name, never a throwback',
    PL.current30().every((k) => Object.keys(PC).some((id) => PC[id] === k && want[id] === k)));
  {
    const P = fresh();
    const got = P.earn('std-2005-nlcs5-lidge');
    check('a save in 2005 Houston unlocks both its plates on the device, once', JSON.stringify(got) === '["astros","astrosbrick"]' &&
      P.earn('std-2005-nlcs5-lidge').length === 0 && P.unlocked().includes('astrosbrick'));
    check('a save in 2025 Los Angeles unlocks the Dodgers only', JSON.stringify(P.earn('std-2025-scott-kc')) === '["dodgers"]');
    check('a situation with no club unlocks nothing', P.earn('std-not-a-pack').length === 0);
  }

  // Diamond: Pro only, in the client
  {
    const P = fresh();
    P.chooseLocal('diamond');
    check('not Pro: Diamond is locked and never worn, even when the device picked it', !P.unlocked().includes('diamond') && P.current() === null && P.status('diamond') === 'pro');
    P.setServer({ plate: 'diamond', unlocked: ['dodgers'] });
    check('not Pro: an account that stored Diamond wears the plain plate', P.current() === null);
    P.setPro(true);
    check('Pro: Diamond is open and worn', P.unlocked().includes('diamond') && P.current() === 'diamond');
    P.setPro(false);
    P.setServer({ plate: 'diamond', unlocked: ['dodgers', 'diamond'] });
    check('the server\'s list (178 adds Diamond only for Pro) opens it too', P.current() === 'diamond');
    P.setServer({ plate: 'diamond', unlocked: ['dodgers'] });
    check('Pro ends: back to plain', P.current() === null);
    const svg = P.svg('diamond', 'JE', {});
    const one = P.svg('diamond', 'JE', {});
    check('Diamond draws as a gem with the initials, its own gradient ids each time, and nothing that moves',
      /class="plate gem"/.test(svg) && />JE<\/text>/.test(svg) && svg.match(/id="(pg\d+)f"/)[1] !== one.match(/id="(pg\d+)f"/)[1] && !/animate|<style/.test(svg));
  }

  // the count line: every plate shown but plain, today 30 clubs, the throwbacks and Diamond
  {
    const P = fresh();
    check('the count is of ' + all.length + ': 30 clubs, ' + PL.THROWBACKS.length + ' throwbacks and Diamond', all.length === 30 + PL.THROWBACKS.length + 1);
    P.earn('std-2005-nlcs5-lidge'); P.earn('std-2017-ws2-jansen');
    check('three unlocked count 3', P.unlocked().filter((k) => all.includes(k)).length === 3);
    P.setPro(true);
    check('Pro counts Diamond', P.unlocked().filter((k) => all.includes(k)).length === 4);
  }
  console.log('     unlockable today: ' + PL.earnable().join(', '));
}

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
