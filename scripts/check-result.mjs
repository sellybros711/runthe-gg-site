/* Does the shared result row say the right thing, and does every game feed it?
 *
 * result.js owns the stat row under each game's headline number, and the two
 * things it says that no game said before are the ones worth pinning: where
 * you came today, and whether that best is NEW. Both have edges that are easy
 * to get wrong and impossible to notice, because a wrong percentile still
 * renders and still reads plausibly.
 *
 * So: the rank wording across field sizes, and the contract every wired game
 * has to hold up (the spec object, with the fields the row reads).
 *
 * Run: node scripts/check-result.mjs      (no network, no browser)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

/* A DOM stub thin enough to load the module and call the pure parts. */
function boot() {
  const el = () => ({ style: {}, className: '', id: '', setAttribute() {}, removeAttribute() {},
                      appendChild() {}, querySelector: () => null, querySelectorAll: () => [],
                      classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
                      hasAttribute: () => false });
  const box = {
    document: { readyState: 'complete', createElement: el, head: el(), documentElement: el(),
                getElementById: () => null, querySelector: () => null, addEventListener() {} },
    MutationObserver: function () { this.observe = function () {}; },
    console, Math, String, Object, Array, JSON, Date
  };
  box.self = box; box.window = box; box.globalThis = box;
  createContext(box);
  runInContext(readFileSync('arcade/result.js', 'utf8'), box);
  return box.RTGResult;
}

/* ---- 1. the rank wording ---------------------------------------------- */
console.log('\n1) the rank chip says the right thing for the field it is in');
{
  const R = boot();
  const txt = (h) => h == null ? null : h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const cases = [
    // [rank, total, expected]
    [1, 50, '1st today', 'winning says 1st, never Top 2%'],
    [6, 50, 'Top 12% today', 'a big field gets a percentage'],
    [50, 50, 'Top 100% today', 'last in a big field still reads as a placing'],
    [3, 9, '3rd of 9 today', 'a small field gets the count, with an ordinal'],
    [2, 9, '2nd of 9 today', 'ordinals: 2nd'],
    [11, 11, '11th of 11 today', 'ordinals: 11th, not 11st'],
    [1, 9, '1st today', '1st wins even in a small field'],
    [2, 3, null, 'a field of three is not a leaderboard'],
    [1, 1, null, 'alone on the board says nothing'],
    [0, 40, null, 'no rank, no chip'],
    [5, 0, null, 'no field, no chip'],
    [null, null, null, 'nothing at all, no chip']
  ];
  for (const [rank, total, want, why] of cases) {
    const got = txt(R.rankChip(rank, total));
    if (got !== want) fail(why + ': rank ' + rank + ' of ' + total + ' gave ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
    else ok(why);
  }
  // the boundary itself, stated once so a change to FIELD_MIN has to be deliberate
  const below = txt(R.rankChip(4, R.FIELD_MIN - 1));
  const at = txt(R.rankChip(4, R.FIELD_MIN));
  if (!/of/.test(below) || !/%/.test(at)) fail('the field-size boundary is not where FIELD_MIN says it is');
  else ok('percentages start exactly at FIELD_MIN (' + R.FIELD_MIN + ')');
}

/* ---- 2. ordinals ------------------------------------------------------- */
console.log('\n2) ordinals, including the ones people get wrong');
{
  const R = boot();
  const want = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th',
                 21: '21st', 22: '22nd', 23: '23rd', 101: '101st', 111: '111th', 112: '112th' };
  let n = 0;
  for (const k of Object.keys(want)) {
    const got = R.ord(Number(k));
    if (got !== want[k]) fail('ord(' + k + ') gave ' + got + ', want ' + want[k]);
    else n++;
  }
  if (n === Object.keys(want).length) ok('all ' + n + ' correct, 11th/12th/13th included');
}

/* ---- 3. every wired game feeds the row -------------------------------- */
/* The row is only as good as the spec each game sets, and a game that stops
   setting one degrades silently to the row it always had. So the wiring is
   asserted in the page source: the module is loaded, and the spec is built
   with the fields the row reads. */
console.log('\n3) every wired game loads result.js and sets a spec');
{
  /* Wired = the free four plus the two that were free before the swap, whose
     players still land on these screens every day. Read from tokens.js rather
     than listed, so the day the free set moves again this follows it. */
  const tk = readFileSync('arcade/tokens.js', 'utf8');
  const free = new Function('return ' + /var FREE_LIST\s*=\s*(\[[^\]]*\])/.exec(tk)[1])();
  const WIRED = [...new Set([...free, 'almamater', 'crossword'])];
  const NEED = ['key:', 'date:', 'isBest:'];
  for (const g of WIRED) {
    const src = readFileSync('arcade/' + g + '/index.html', 'utf8');
    if (!/src="\/arcade\/result\.js\?v=\d+"/.test(src)) { fail(g + ': does not load result.js'); continue; }
    const m = src.match(/window\.RTGResultSpec\s*=\s*\{[\s\S]{0,400}?\}/);
    if (!m) { fail(g + ': never sets window.RTGResultSpec'); continue; }
    const missing = NEED.filter((k) => m[0].indexOf(k) < 0);
    // a best to show, in either of the two shapes (a number, or preformatted)
    if (m[0].indexOf('best:') < 0 && m[0].indexOf('bestText:') < 0) missing.push('best: or bestText:');
    if (missing.length) fail(g + ': spec is missing ' + missing.join(', '));
    else ok(g);
  }
}

/* ---- 4. the spec is set where the best is still known ------------------ */
/* isBest cannot be recovered later: by the time the modal is open the new
   best is in storage and looks exactly like an old one. Each game therefore
   has to build the spec in the same place it compares them. */
console.log('\n4) isBest is computed against a previous best, not a stored one');
{
  const EXPECT = {
    sportegories: /total>prevBest/,
    career: /run>PREVBEST/,
    almamater: /run>PREVBEST/,
    crossword: /newBestT/,
    guess: />PREVBEST/,
    match: />\s*mBest/
  };
  for (const [g, re] of Object.entries(EXPECT)) {
    const src = readFileSync('arcade/' + g + '/index.html', 'utf8');
    const m = src.match(/window\.RTGResultSpec\s*=\s*\{[\s\S]{0,400}?\}/);
    if (!m) { fail(g + ': no spec'); continue; }
    if (!re.test(m[0])) fail(g + ': isBest does not compare against the previous best (' + re + ')');
    else ok(g + ': compares against the previous best');
  }
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\nresult ok');
