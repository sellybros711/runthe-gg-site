/* Does Sportegories tell the truth about who is playing right now?
 *
 * A player emailed in: the category was "Active NBA Guard" and all three of
 * the names it offered as answers he could have given were retired. Russell
 * Westbrook, Kemba Walker, Lou Williams. The `act` flag came from a curated
 * file where it had been written by hand and was true at the time, and the
 * merge treated it as a one-way union, so a stale yes could never be corrected
 * by a fresher no. 151 players were being called active who are not.
 *
 * That flag is now derived: a current roster spot, or a season in the last two
 * years, and never anyone on a hand-written retired list. The roster alone is
 * not enough, because a roster feed drops the injured (Aaron Judge, Tyreek
 * Hill and Jimmy Butler are all missing from ours), and retiring four stars to
 * fix three would be the worse trade.
 *
 * This holds it there. The failure is invisible in the game: a retired name in
 * an "Active" category renders, scores and reads perfectly plausibly, and the
 * only thing that catches it is somebody who knows the sport.
 *
 * It also checks the other thing that made the same screen wrong: a suggestion
 * list that offered the same player twice, which happened because a player can
 * be held under two position records and the list was built from records
 * rather than from names.
 *
 * Run: node scripts/check-sportegories.mjs      (no network, no browser)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

const raw = readFileSync('arcade/sportegories-data.js', 'utf8');
const D = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf(';')));

const box = { console, Math, String, Object, Array, JSON, Date, RegExp };
box.self = box; box.window = box; box.globalThis = box;
createContext(box);
runInContext(readFileSync('arcade/sportegories.js', 'utf8'), box);
const S = box.RTG_SPORTEGORIES;
S.setData(D);

// the roster snapshot, which is the authority on "active"
const G = {};
new Function('window', 'self', readFileSync('arcade/rosters.js', 'utf8'))(G, G);
const ROSTERS = (G.RTG_ROSTERS && G.RTG_ROSTERS.players) || [];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const ON = new Map();
for (const r of ROSTERS) {
  if (!r || !r.n || !r.s) continue;
  if (!ON.has(r.s)) ON.set(r.s, new Set());
  ON.get(r.s).add(norm(r.n));
}

/* ---- 1. nobody is active who has not been seen in a season ------------- */
/* The rule is: on a current roster, OR a season in the last two years, and
   never anyone on the hand-written retired list. A roster feed alone is not
   enough (it drops the injured: Aaron Judge, Tyreek Hill and Jimmy Butler are
   all absent from it), so this asserts the union, which is what the game
   actually claims when it says "Active". */
console.log('\n1) every player flagged active is on a roster or played recently');
{
  const jg = {};
  new Function('window', 'self', readFileSync('arcade/jerseys.js', 'utf8'))(jg, jg);
  const LAST = new Map();
  for (const st of ((jg.RTG_JERSEYS && jg.RTG_JERSEYS.stints) || [])) {
    if (!st || !st.name || !st.sport) continue;
    const k = st.sport + '|' + norm(st.name);
    const y = +st.y1 || 0;
    if (y > (LAST.get(k) || 0)) LAST.set(k, y);
  }
  const YEAR = new Date().getUTCFullYear();
  let checked = 0;
  const wrong = [];
  for (const rec of D.players) {
    const sport = D.sports[rec[1]];
    if (!ON.has(sport)) continue;
    if (!(rec[7] & 1)) continue;
    checked++;
    const k = norm(rec[0]);
    const onRoster = ON.get(sport).has(k);
    const seen = LAST.get(sport + '|' + k) || 0;
    if (!onRoster && seen < YEAR - 1) wrong.push(sport + ' ' + rec[0] + ' (last ' + (seen || 'never') + ')');
  }
  if (wrong.length) fail(wrong.length + ' active with no roster spot and no recent season: ' +
                         wrong.slice(0, 8).join(', '));
  else ok(checked + ' active players, every one rostered or seen in the last two seasons');
}

/* ---- 2. the hand-written retirements are honoured ---------------------- */
/* The only lever that can retire somebody before a feed catches up, which
   makes it the one that gets used when a player writes in. If it silently
   stopped working, the same email would arrive again. */
console.log('\n2) nobody on the retired list is flagged active');
{
  const src = readFileSync('scripts/build-sportegories.mjs', 'utf8');
  const m = /const RETIRED = new Set\(\[([\s\S]*?)\]/.exec(src);
  const names = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  if (!names.length) fail('could not read the retired list');
  else {
    const bad2 = [];
    for (const n of names) {
      for (const rec of D.players) {
        if (norm(rec[0]) === norm(n) && (rec[7] & 1)) bad2.push(rec[0]);
      }
    }
    if (bad2.length) fail('on the retired list but still active: ' + [...new Set(bad2)].join(', '));
    else ok('all ' + names.length + ' honoured: ' + names.join(', '));
  }
}

/* ---- 3. an Active category never offers a retired player ---------------- */
/* The end of the reported bug, asserted the way the player met it: through the
   suggestion list the game prints under a refused answer. */
console.log('\n3) no "Active" category suggests a player it does not call active');
{
  const actives = D.cats.filter((c) => /^Active\b/.test(c.l));
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const byName = new Map();
  for (const rec of D.players) {
    const k = D.sports[rec[1]] + '|' + norm(rec[0]);
    byName.set(k, (byName.get(k) || false) || !!(rec[7] & 1));
  }
  let offers = 0;
  const wrong = [];
  for (const cat of actives) {
    for (const L of LETTERS) {
      for (const n of S.answersFor({ letter: L, cats: [cat] }, 0, 3)) {
        offers++;
        const k = (cat.s || '') + '|' + norm(n);
        if (cat.s && byName.has(k) && byName.get(k) === false) wrong.push(cat.l + ' / ' + L + ': ' + n);
      }
    }
  }
  if (wrong.length) fail(wrong.length + ' retired names offered: ' + wrong.slice(0, 6).join(' | '));
  else ok(offers + ' suggestions across ' + actives.length + ' Active categories, all current');
}

/* ---- 4. a suggestion list never repeats a name -------------------------- */
console.log('\n4) no suggestion list offers the same player twice');
{
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const dupes = [];
  for (const cat of D.cats) {
    for (const L of LETTERS) {
      const names = S.answersFor({ letter: L, cats: [cat] }, 0, 6);
      const seen = new Set();
      for (const n of names) {
        const k = n.toLowerCase();
        if (seen.has(k)) { dupes.push(cat.l + ' / ' + L + ': ' + n); break; }
        seen.add(k);
      }
    }
  }
  if (dupes.length) fail(dupes.length + ' lists repeat a name: ' + dupes.slice(0, 6).join(' | '));
  else ok('none, across every category and letter');
}

/* ---- 5. the reported answers, by name ----------------------------------- */
/* The specific case, pinned. These are cheap and they are the ones somebody
   actually hit, which makes them the ones worth naming in a test. */
console.log('\n5) the reported case');
{
  const cat = D.cats.find((c) => c.l === 'Active NBA Guard');
  if (!cat) { fail('the category "Active NBA Guard" no longer exists'); }
  else {
    const check = (letter, name) => S.check({ letter, cats: [cat] }, 0, name, []);
    const YES = [['J', 'Jalen Williams'], ['S', 'Stephen Curry'], ['A', 'Anthony Edwards']];
    const NO  = [['W', 'Russell Westbrook'], ['W', 'Kemba Walker'], ['W', 'Lou Williams'], ['J', 'Michael Jordan']];
    for (const [L, n] of YES) {
      const r = check(L, n);
      if (!r.ok) fail(n + ' should be an Active NBA Guard (got ' + r.reason + ')');
      else ok(n + ' fits');
    }
    for (const [L, n] of NO) {
      const r = check(L, n);
      if (r.ok) fail(n + ' has retired and must not fit "Active NBA Guard"');
      else ok(n + ' does not fit');
    }
  }
}

/* ---- 6b. the three a player wrote in about, 10 September --------------- */
/* One board, three refusals, three different causes. Pinned by name because
 * that is how they were found and how they would come back:
 *
 *   Bruce Matthews, "Offensive Lineman who never left one franchise". He spent
 *   nineteen years with one, and nflverse writes HOU for the Houston Oilers
 *   AND the Houston Texans, so the scrape gave him two franchises. The Texans
 *   were founded in 2002, a year after he retired.
 *
 *   Dee Brown, "NBA player from a Big Ten school". We held one Dee Brown, the
 *   Celtics dunk champion, who went to Jacksonville. The other was Big Ten
 *   Player of the Year at Illinois and was in no source at all.
 *
 *   Bobby Bonilla, "Outfielder who played for 3+ teams". Eight clubs, and more
 *   of his career in the outfield than anywhere else. We hold one position per
 *   player, and his says Third Baseman. A single label cannot deny a career,
 *   so a mismatch now goes to the live check instead of being called wrong.
 */
console.log('\n6b) the three refusals reported on 10 September');
{
  const CASES = [
    ['Offensive Lineman who never left one franchise', 'B', 'Bruce Matthews', 'fits'],
    ['NBA player from a Big Ten school', 'B', 'Dee Brown', 'fits'],
    ['Outfielder who played for 3+ teams', 'B', 'Bobby Bonilla', 'live']
  ];
  for (const [label, letter, name, want] of CASES) {
    const cat = D.cats.find((c) => c.l === label);
    if (!cat) { fail('the category "' + label + '" no longer exists'); continue; }
    const r = S.check({ letter, cats: [cat] }, 0, name, []);
    if (want === 'fits' && !r.ok) {
      fail(name + ' is refused by "' + label + '" again (' + r.reason + ')');
    } else if (want === 'live' && (r.ok || r.live)) {
      ok(name + ': ' + (r.ok ? 'fits' : 'goes to the live check rather than being called wrong'));
    } else if (want === 'live') {
      fail(name + ' is called wrong by "' + label + '" again (' + r.reason + '), when our one position label cannot know');
    } else ok(name + ' fits "' + label + '"');
  }
  /* And the cause of the first one, at the source, so a refreshed scrape that
     reintroduces it fails here rather than on a player's screen. */
  const bm = D.players.find((r) => r[0] === 'Bruce Matthews');
  const teams = bm ? bm[3].map((i) => D.teams[i]) : [];
  if (teams.indexOf('Houston Texans') >= 0) {
    fail('Bruce Matthews is filed under the Houston Texans, who were founded the year after he retired');
  } else ok('no Houston Texans on a career that ended in 2001: ' + teams.join(', '));
}

/* ---- 6. today's position counts, not just the career one ---------------- */
/* Jalen Williams is a Small Forward by career label and the Guard his club
   lists him at this season, and the older label was refusing him his own
   position. Both are true now and either proves a category. */
console.log('\n6) a roster position proves a category too');
{
  const withR = D.players.filter((r) => r[10] != null && r[10] >= 0);
  if (!withR.length) fail('no player carries a roster position: the second label is not being emitted');
  else {
    ok(withR.length + ' players carry both a career and a roster position');
    const jw = D.cats.find((c) => c.l === 'Active NBA Guard');
    const r = S.check({ letter: 'J', cats: [jw] }, 0, 'Jalen Williams', []);
    if (!r.ok) fail('Jalen Williams is still refused his own roster position');
    else ok('Jalen Williams fits on the roster label while his career label says Forward');
  }
}

/* ---- 7. either name takes the letter, and the game says so --------------- */
/* The rule players get wrong most often, and the one they have written in
 * about twice: the letter can be the FIRST name or the LAST. It was stated
 * correctly on the play screen, in the how-to and in the demo caption, and
 * then the refusal a player meets when they get it wrong said only "Needs to
 * start with B", which is the one moment they are actually reading it.
 *
 * So this checks both halves: that a last-name match really does clear the
 * letter gate, and that the message names both names when it does not. */
console.log('\n7) the letter may be the first name or the last');
{
  const cat = D.cats[0];
  const ask = (name) => S.check({ letter: 'B', cats: [cat] }, 0, name, []);
  const first = ask('Barry Bonds');      // B on the first name
  const last = ask('Chris Bosh');        // B on the last name
  const neither = ask('Michael Jordan');
  if (first.reason === 'letter') fail('Barry Bonds is refused on the letter B, matching on the first name');
  else ok('Barry Bonds clears the letter on his first name');
  if (last.reason === 'letter') fail('Chris Bosh is refused on the letter B, matching on the last name');
  else ok('Chris Bosh clears the letter on his last name');
  if (neither.reason !== 'letter') fail('Michael Jordan should be refused on the letter B');
  else if (!/first or last/i.test(neither.msg || '')) {
    fail('the refusal says ' + JSON.stringify(neither.msg) + ', which does not tell them either name will do');
  } else ok('and the refusal says it: ' + JSON.stringify(neither.msg));

  /* The how-to has to agree, and its example has to be a legal answer. It used
     to offer "Bosh", one line under a rule saying a bare "Chris" will not
     count. */
  const page = readFileSync('arcade/sportegories/index.html', 'utf8');
  const rule = /<span class="b">2<\/span><div>([\s\S]{0,220}?)<\/div>/.exec(page);
  const txt = rule ? rule[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';
  if (!/first name or the last/i.test(txt)) fail('rule 2 no longer says the letter can be the first name or the last: ' + JSON.stringify(txt));
  else if (/[\u201c"]\s*Bosh\s*[\u201d"]/.test(txt)) fail('rule 2 offers a bare surname as an answer, which rule 1 forbids');
  else ok('rule 2 reads: ' + txt.trim());
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\nsportegories ok');
