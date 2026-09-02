/* Does day.js agree with the games, the hub and the tier rules about today?
 *
 * day.js is the one place that knows what "done today" looks like in every
 * game's save, which games a given tier can open, what is next, and when
 * the day is finished. Three surfaces read it (the hub's ring and Day Card,
 * every result screen's strip). If its idea of a save's shape drifts from a
 * game's, the ring stops filling and nothing throws, so this pins the shapes
 * with fixtures written the way the games actually write them, and walks the
 * tiers and the edges: the spent trial played today, the wrap-around next,
 * the day boundary, the share text.
 *
 * Run: node scripts/check-day.mjs      (no network, no browser)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(m + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); else ok(m); };

const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const YDAY = (() => { const d = new Date(Date.now() - 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const SESSION = JSON.stringify({ access_token: 'f', user: { id: 'u' } });

function boot(seed) {
  const store = { ...seed };
  const LS = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; }
  };
  const box = { localStorage: LS, document: { dispatchEvent() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} } },
                Event: function () {}, requestAnimationFrame: (f) => f(), navigator: {}, console, Date, JSON, Math, String, Object, Array };
  box.self = box; box.window = box; box.globalThis = box;
  createContext(box);
  runInContext(readFileSync('arcade/tokens.js', 'utf8'), box);
  runInContext(readFileSync('arcade/day.js', 'utf8'), box);
  return box;
}

/* ---- 1. the order matches the hub ---------------------------------------- */
console.log('\n1) day.js lists the games in the hub\'s order');
{
  const hub = readFileSync('arcade/index.html', 'utf8');
  const m = hub.match(/var ALL = \[([^\]]+)\]/);
  const hubOrder = m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : null;
  const day = boot({}).RTGDay.GAMES;
  if (!hubOrder) fail('could not read the hub\'s ALL list');
  else eq(day, hubOrder, 'same twelve keys, same order');
}

/* ---- 2. every game's "done today" shape ---------------------------------- */
console.log('\n2) each game\'s save is recognised as done today, and not yesterday');
const SAVES = {
  sportegories: (t) => ['rtg_sportegories_v1', JSON.stringify({ last: { d: t, score: 41 }, best: 50 })],
  crossword:    (t) => ['rtg:cw:v1', JSON.stringify({ lastDone: t, best: 70 })],
  almamater:    (t) => ['rtg:almamater:v1', JSON.stringify({ lastDone: t, last: { run: 11 } })],
  career:       (t) => ['rtg:career:v1', JSON.stringify({ lastDone: t, last: { run: 18 } })],
  match:        (t) => ['grid_match_result_' + t, JSON.stringify({ grade: 'Perfect' })],
  rollcall:     (t) => ['rtg_rollcall_v1', JSON.stringify({ last: { d: t, score: 7, total: 15 } })],
  chain:        (t) => ['rtg_chain_v1', JSON.stringify({ last: { d: t, solved: true } })],
  rankit:       (t) => ['rtg:rankit:v2', JSON.stringify({ lastDone: t })],
  guess:        (t) => ['rtg:guess:v1', JSON.stringify({ lastDone: t, last: { won: true, tries: 4 } })],
  table:        (t) => ['rtg:table:v1', JSON.stringify({ lastDone: t, last: { run: 6 } })],
  oddone:       (t) => ['rtg:oddone:v1', JSON.stringify({ lastDone: t, last: { run: 3 } })]
};
const MEMBER = { 'sb-jcrrxqfpdelrmvjuihnm-auth-token': SESSION, runthegrid_pro: '1' };
for (const [key, mk] of Object.entries(SAVES)) {
  const [k, v] = mk(TODAY);
  const s = boot({ ...MEMBER, [k]: v }).RTGDay.state();
  const g = s.games.find((x) => x.key === key);
  if (!g || !g.done) fail(key + ': today\'s save not seen as done');
  else if (!g.line) fail(key + ': done but no result line');
  const [k2, v2] = mk(YDAY);
  const s2 = boot({ ...MEMBER, [k2]: v2 }).RTGDay.state();
  const g2 = s2.games.find((x) => x.key === key);
  if (g2 && g2.done) fail(key + ': YESTERDAY\'s save counted as today');
}
{
  const hl = boot({ ...MEMBER, runthegrid_tokens_v3: JSON.stringify({ date: TODAY, plays: { highlow: 1 }, sf: {}, bonus: 0 }) }).RTGDay.state();
  if (!hl.games.find((x) => x.key === 'highlow').done) fail('highlow: a play today not seen as done');
}
if (!bad) ok('all twelve, today yes and yesterday no');

/* ---- 3. tiers --------------------------------------------------------------- */
console.log('\n3) what each tier can open, and the count');
{
  const guest = boot({}).RTGDay.state();
  eq([guest.total, guest.doneN, guest.allDone, guest.next], [4, 0, false, 'sportegories'], 'guest: four on offer, nothing done, Sportegories first');
  const free = boot({ 'sb-jcrrxqfpdelrmvjuihnm-auth-token': SESSION }).RTGDay.state();
  eq([free.total, free.next], [12, 'sportegories'], 'free account with every try open: twelve');
  const spent = boot({ 'sb-jcrrxqfpdelrmvjuihnm-auth-token': SESSION, 'rtg:trial:v1': JSON.stringify({ used: { match: 1, rollcall: 1, chain: 1, rankit: 1, guess: 1, table: 1, oddone: 1, highlow: 1 } }) }).RTGDay.state();
  eq(spent.total, 4, 'free account, every try spent: four');
  const member = boot(MEMBER).RTGDay.state();
  eq(member.total, 12, 'member: twelve');
}

/* ---- 4. the spent trial, played today, stays counted ----------------------- */
console.log('\n4) a trial spent AND played today is still on the ring');
{
  const [k, v] = SAVES.rollcall(TODAY);
  const s = boot({ 'sb-jcrrxqfpdelrmvjuihnm-auth-token': SESSION,
                   'rtg:trial:v1': JSON.stringify({ used: { match: 1, rollcall: 1, chain: 1, rankit: 1, guess: 1, table: 1, oddone: 1, highlow: 1 } }),
                   [k]: v }).RTGDay.state();
  eq([s.total, s.doneN, s.avail.indexOf('rollcall') >= 0], [5, 1, true], 'four free plus the Roll Call they played: 5 total, 1 done');
}

/* ---- 5. next wraps round from where you are ------------------------------- */
console.log('\n5) next() continues from the game you are on');
{
  const [k1, v1] = SAVES.sportegories(TODAY);
  const [k2, v2] = SAVES.crossword(TODAY);
  const D = boot({ ...MEMBER, [k1]: v1, [k2]: v2 }).RTGDay;
  eq(D.next('crossword'), 'almamater', 'after Crossword (done), Alma Mater');
  eq(D.next('highlow'), 'almamater', 'after the last game, wraps to the first unplayed');
  eq(D.next('almamater'), 'career', 'from the game you are on, the one after it');
  const all = {}; for (const mk of Object.values(SAVES)) { const [k, v] = mk(TODAY); all[k] = v; }
  all.runthegrid_tokens_v3 = JSON.stringify({ date: TODAY, plays: { highlow: 1 }, sf: {}, bonus: 0 });
  const done = boot({ ...MEMBER, ...all }).RTGDay;
  const st = done.state();
  eq([st.doneN, st.total, st.allDone, done.next('chain')], [12, 12, true, null], 'all twelve done: allDone and no next');
}

/* ---- 6. the share text ----------------------------------------------------- */
console.log('\n6) the day card reads right');
{
  const [k1, v1] = SAVES.sportegories(TODAY);
  const [k2, v2] = SAVES.career(TODAY);
  const txt = boot({ 'sb-jcrrxqfpdelrmvjuihnm-auth-token': SESSION,
                     'rtg:trial:v1': JSON.stringify({ used: { match: 1, rollcall: 1, chain: 1, rankit: 1, guess: 1, table: 1, oddone: 1, highlow: 1 } }),
                     [k1]: v1, [k2]: v2 }).RTGDay.shareText();
  const lines = txt.split('\n');
  if (!/^Run The Arcade · Day #\d+ · 2\/4$/.test(lines[0])) fail('header: ' + lines[0]);
  else ok('header: ' + lines[0]);
  eq(lines.slice(1, 5), ['✅ Sportegories · 41 pts', '⬜ Daily Crossword', '⬜ Alma Mater', '✅ Career Path · 18 pts'], 'one line per game, in order, done ticked');
  eq(lines[5], 'https://runthe.gg/arcade/', 'the link last');
  // the two dash code points, built rather than typed, so this file passes its own rule
  var DASH = new RegExp('[' + String.fromCharCode(0x2014) + String.fromCharCode(0x2013) + ']');
  if (DASH.test(txt)) fail('share text contains an em or en dash');
  else ok('no dashes');
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\nday ok');
