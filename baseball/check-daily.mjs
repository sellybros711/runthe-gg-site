/* The daily rolls at Eastern midnight, and survives a clock change.
 *
 *   node baseball/check-daily.mjs
 *
 * IT SHIPPED ON UTC, which rolls at 7 or 8pm Eastern. So the board somebody was
 * part way through was taken off them in the middle of their own evening, and the
 * one try they had for the day had been spent on what was now yesterday's puzzle.
 * Nothing threw. The daily card even said "midnight UTC", so it was honest about a
 * clock that was wrong for the people reading it.
 *
 * EVERY WAY THIS BREAKS IS INVISIBLE ON THE MACHINE IT IS WRITTEN ON. A developer
 * in one time zone, running once, sees a day number and a key that look right. What
 * is wrong is what they do at 8pm, at 1am, on the Sunday in March the clocks move,
 * and on the Sunday in November when 1am happens twice. So this walks those
 * instants rather than sampling now.
 *
 * The functions are lifted out of the page and driven, never copied: a second
 * implementation of a date rule agrees with itself, which is exactly what mythiball's
 * send curve did for as long as its sweep carried a hand-written duplicate.
 */
import { readFileSync } from 'fs';

const SRC = readFileSync(new URL('index.html', import.meta.url), 'utf8');

/* Brace-matched out of the page, the way hoops/verify.mjs lifts its own. The names
   are asserted first: a reader that finds nothing would let every claim below pass
   green, which is how an extractor in this repo has been silently wrong five times. */
function lift(name, kind) {
  const head = kind === 'const'
    ? new RegExp('const\\s+' + name + '\\s*=')
    : new RegExp('function\\s+' + name + '\\s*\\(');
  const at = SRC.search(head);
  if (at < 0) return null;
  if (kind === 'const') {
    const eol = SRC.indexOf('\n', at);
    return SRC.slice(at, eol + 1);
  }
  let i = SRC.indexOf('{', at), depth = 0, j = i;
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}') { depth--; if (!depth) break; }
  }
  return SRC.slice(at, j + 1);
}

const NAMES = [['DAILY_EPOCH', 'const'], ['DAILY_V', 'const'], ['easternISO', 'fn'],
  ['dayNumberOf', 'fn'], ['dailyNo', 'fn']];
const parts = NAMES.map(([n, k]) => [n, lift(n, k)]);
const missing = parts.filter(([, s]) => !s).map(([n]) => n);

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

head('0. THE READER FOUND WHAT IT CAME FOR');
claim(!missing.length, 'every function this file drives is still in the page',
  'missing: ' + missing.join(', '));
if (missing.length) { console.log('\n1 of 1 checks FAILED'); process.exit(1); }

const api = new Function(parts.map(([, s]) => s).join('\n')
  + '\nreturn { DAILY_EPOCH, DAILY_V, easternISO, dayNumberOf, dailyNo };')();

/* ── 1. the key is the Eastern date, at the hours that tell the two apart ── */
head('1. THE DAY IS THE EASTERN DATE');

/* An instant, and what Eastern calls it. The evening hours are the whole case: under
   the old clock the board rolled at 00:00 UTC, which is the middle of them.
   BOTH OFFSETS ARE WALKED, and the first draft of this file got that wrong in
   exactly the way the page did: it wrote the winter offset against a March date.
   Daylight saving starts on the second Sunday in March, so 2026-03-09 is already
   UTC-4 and 2026-01-14 is UTC-5. A fixture that assumes one offset all year is the
   same bug this file exists to catch, wearing a test's clothes. */
const CASES = [
  // EST, UTC-5
  ['2026-01-15T00:30:00Z', '2026-01-14', '7:30pm Eastern in winter, mid evening'],
  ['2026-01-15T04:59:00Z', '2026-01-14', '11:59pm EST, the last minute of the day'],
  ['2026-01-15T05:00:00Z', '2026-01-15', 'midnight EST, the roll'],
  // EDT, UTC-4
  ['2026-03-10T00:30:00Z', '2026-03-09', '8:30pm Eastern in spring, mid evening'],
  ['2026-03-10T03:59:00Z', '2026-03-09', '11:59pm EDT, the last minute of the day'],
  ['2026-03-10T04:00:00Z', '2026-03-10', 'midnight EDT, the roll'],
  ['2026-07-04T16:00:00Z', '2026-07-04', 'noon Eastern in summer'],
  ['2026-12-25T20:00:00Z', '2026-12-25', 'afternoon Eastern in winter'],
];
for (const [iso, want, what] of CASES) {
  const got = api.easternISO(new Date(iso));
  claim(got === want, `${what}: ${iso} is ${want}`, `got ${got}`);
}

/* THE OLD CLOCK REALLY DID DIFFER, or this file is asserting a property both
   answers have and proving nothing. */
{
  const d = new Date('2026-03-10T00:30:00Z');
  const utc = d.toISOString().slice(0, 10);
  claim(utc !== api.easternISO(d),
    `and UTC disagrees at that hour (UTC ${utc}, Eastern ${api.easternISO(d)})`);
}

/* ── 2. a clock change does not move the day number ── */
head('2. THE DAY NUMBER IS ARITHMETIC, NOT A LOCAL MIDNIGHT');

/* Two local midnights are 23 or 25 hours apart across a change. `dayNumberOf` does
   its arithmetic in UTC over a date already resolved in Eastern, so consecutive
   dates are always exactly one apart. Spring forward and fall back are both walked. */
for (const [a, b, what] of [
  ['2026-03-07', '2026-03-08', 'the day before the spring change'],
  ['2026-03-08', '2026-03-09', 'the day the clocks go forward'],
  ['2026-10-31', '2026-11-01', 'the day the clocks go back'],
  ['2026-12-31', '2027-01-01', 'across a year boundary'],
]) {
  const step = api.dayNumberOf(b) - api.dayNumberOf(a);
  claim(step === 1, `${what}: ${a} to ${b} is one day`, `stepped ${step}`);
}

/* Every day of a whole year steps by exactly one, which is the claim a handful of
   spot dates cannot make. */
{
  let worst = null;
  const d = new Date(Date.UTC(2026, 0, 1));
  let prev = api.dayNumberOf('2026-01-01');
  for (let i = 1; i < 400; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    const n = api.dayNumberOf(iso);
    if (n - prev !== 1 && !worst) worst = `${iso} stepped ${n - prev}`;
    prev = n;
  }
  claim(!worst, '400 consecutive dates each step by one', worst);
}

claim(api.dayNumberOf(api.DAILY_EPOCH) === 1,
  `the epoch is day 1 (${api.DAILY_EPOCH})`, 'got ' + api.dayNumberOf(api.DAILY_EPOCH));
/* Hoops kept an epoch that was a day out for a whole evening and only the clamp
   made it look right. The clamp is a guard against a wrong device clock. */
claim(api.dayNumberOf(api.DAILY_EPOCH) > 0 && api.dayNumberOf('2025-12-31') === 0,
  'and the day before it is 0, so the clamp is not hiding an off-by-one',
  'day before epoch reads ' + api.dayNumberOf('2025-12-31'));

/* ── 3. the fallback answers something ── */
head('3. A BROWSER WITH NO TIME ZONE DATABASE STILL GETS A DAY');

/* Every allowance on this page fails open, and a daily that threw here would take
   the front page with it: paintDailyCard runs during boot. */
{
  const real = globalThis.Intl;
  let got = null, threw = null;
  try {
    globalThis.Intl = undefined;
    const iso = new Function(parts.map(([, s]) => s).join('\n') + '\nreturn easternISO();')();
    got = iso;
  } catch (e) { threw = String(e); }
  finally { globalThis.Intl = real; }
  claim(!threw, 'easternISO does not throw without Intl', threw);
  claim(/^\d{4}-\d{2}-\d{2}$/.test(got || ''), 'and still answers a date: ' + got);
}

/* ── 4. the migration cannot lock anybody out ── */
head('4. A RECORD FROM THE OLD CLOCK IS READ AS "NOT TODAY"');

/* The shape the page stores, and the two readers that decide whether today is
   spent. Lifted rather than restated, for the reason at the top of this file. */
const todays = lift('todaysDaily', 'fn');
const streakFn = lift('dailyStreak', 'fn');
claim(!!todays && !!streakFn, 'todaysDaily and dailyStreak are still in the page');

/* A v1 record stamped with the UTC date somebody playing at 8pm Eastern would have
   written: that is TOMORROW's date in Greenwich, so read against the Eastern key
   the next evening it matches and the player is refused a board they never saw. */
{
  const store = {};
  const sandbox = new Function('store', `
    ${parts.map(([, s]) => s).join('\n')}
    const DAILY_KEY='rtd_daily';
    function loadDaily(){ return store.v || {}; }
    ${todays}
    ${streakFn}
    return { todaysDaily, dailyStreak, dailyNo, easternISO };
  `)(store);

  const today = sandbox.easternISO();
  const n = sandbox.dailyNo();

  store.v = { date: today, n, streak: 4 };               // v1: no version stamp
  claim(sandbox.todaysDaily() === null,
    'a v1 record carrying today\'s key is not trusted, so the day is playable',
    'got ' + JSON.stringify(sandbox.todaysDaily()));

  store.v = { v: 2, date: today, n, streak: 4 };
  claim(sandbox.todaysDaily() !== null, 'a v2 record for today IS today');

  store.v = { v: 2, date: '2020-01-01', n: 1, streak: 4 };
  claim(sandbox.todaysDaily() === null, 'a v2 record from another day is not today');

  /* What the DOOR shows. */
  store.v = { n, streak: 6 };
  claim(sandbox.dailyStreak() === 6, 'a streak from the old clock is still shown');
  store.v = { n: n - 1, streak: 6 };
  claim(sandbox.dailyStreak() === 6, 'and so is one from yesterday');
  store.v = { n: n - 2, streak: 6 };
  claim(sandbox.dailyStreak() === 0, 'a day missed ends it');
}

/* AND WHAT THE WRITE DOES, which is a different question and was the one left
   unguarded. The first draft of this file asserted only dailyStreak, the READ, and
   a mutation that deleted the migration clause from recordDaily passed green:
   dailyStreak carries a clause of its own that happens to look the same. The clause
   that matters is in recordDaily, so recordDaily is what has to be driven. */
{
  const recordFn = lift('recordDaily', 'fn');
  claim(!!recordFn, 'recordDaily is still in the page');
  const store = {};
  const sb = new Function('store', `
    ${parts.map(([, s]) => s).join('\n')}
    function loadDaily(){ return store.prev || {}; }
    function saveDaily(o){ store.wrote = o; }
    function shownRating(){ return 70; }
    function seasonGrid(){ return 'xxxx'; }
    ${recordFn}
    return { recordDaily, dailyNo };
  `)(store);
  const n = sb.dailyNo();
  const out = { wins: 99, losses: 63, titleWon: false, madePlayoffs: true, chemistry: null, allTimeRank: 12 };

  store.prev = { n: n - 1, streak: 3 };
  sb.recordDaily(out);
  claim(store.wrote.streak === 4, 'playing the day after yesterday extends the streak to 4',
    'got ' + store.wrote.streak);

  /* The migration case: a v1 record written at 8pm Eastern carries the UTC day,
     which is THIS day's number. todaysDaily deliberately ignored it, so this write
     must not read it as a gap. */
  store.prev = { n, streak: 3 };
  sb.recordDaily(out);
  claim(store.wrote.streak === 4,
    'a record from the old clock carrying today\'s number still extends it',
    'got ' + store.wrote.streak + ' (the migration clause is missing)');

  store.prev = { n: n - 3, streak: 9 };
  sb.recordDaily(out);
  claim(store.wrote.streak === 1, 'a gap restarts it at 1', 'got ' + store.wrote.streak);

  claim(store.wrote.v === api.DAILY_V && store.wrote.n === n,
    'and every record it writes carries the version and the day number',
    JSON.stringify({ v: store.wrote.v, n: store.wrote.n }));
}

/* ── 5. nothing still promises the old clock ── */
head('5. THE COPY NAMES THE CLOCK THE GAME KEEPS');

{
  const pages = ['index.html', 'how-to-play.html']
    .map((f) => [f, readFileSync(new URL(f, import.meta.url), 'utf8')]);
  for (const [f, src] of pages) {
    /* Code is allowed to say UTC: dayNumberOf does its arithmetic there on purpose.
       What may not is a sentence a player reads. */
    const text = src.replace(/<script[\s\S]*?<\/script>/g, ' ');
    const inCopy = /midnight UTC|at UTC midnight/i.test(text);
    /* And the strings the script builds, which is where the daily card lives. */
    const inStrings = /'[^']*midnight UTC[^']*'|"[^"]*midnight UTC[^"]*"/i.test(src);
    claim(!inCopy && !inStrings, `${f} does not promise a UTC midnight`);
  }
}

console.log('');
console.log(fails ? `${fails} of ${checks} checks FAILED` : `All ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
