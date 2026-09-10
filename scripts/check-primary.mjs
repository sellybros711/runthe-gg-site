/* IS THE CLUB UNDER A PLAYER'S NAME HIS CLUB?
 *
 * A player wrote in: Alma Mater captioned Tom Seaver "MLB . BOSTON RED SOX".
 * He pitched sixteen games there in 1986, at the end of twenty years, eleven of
 * them with the Mets. Two games were reading the LAST entry of the entity's
 * team list, which is not a career order and is right 15% of the time.
 *
 * The rule now is: e.pt if primary.js holds one, else e.t[0], never e.t last.
 *
 * WHAT MAKES THIS CHECKABLE is that basketball has a second, independent
 * record in this repo. hoops/data/players.json is one row per player per
 * season back to 1974, built by a different pipeline for a different game, so
 * scoring the arcade's answer against it is a real test rather than the build
 * agreeing with itself. Football and baseball have no second source, so they
 * get the structural checks and the named cases only.
 *
 * A tie counts as right for either club: a player who split his career evenly
 * has no single answer, and the builder picks the later spell on purpose.
 *
 * Run: node scripts/check-primary.mjs      (no network, no browser)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

const nk = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/* The corpus, loaded the way a game page loads it, so e.pt is folded on by
   data.js exactly as it will be in a browser. */
const ctx = createContext({ console });
ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx;
for (const f of ['arcade/match/entities.js', 'arcade/former.js', 'arcade/stars.js',
                 'arcade/awards.js', 'arcade/supplement.js', 'arcade/primary.js',
                 'arcade/data.js']) {
  runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
}
const ENT = ctx.GRID_ENTITIES, PRI = ctx.RTG_PRIMARY;
const club = (e) => e.pt || ((e.t && e.t.length) ? e.t[0] : null);

/* ---- 1. the file loaded and reached the corpus --------------------------- */
console.log('\n1) primary.js is loaded and folded onto the corpus');
{
  if (!PRI || !PRI.of) fail('primary.js did not define window.RTG_PRIMARY.of');
  else if (!PRI.count || PRI.count < 2000) fail('primary.js holds only ' + (PRI.count || 0) + ' players');
  else if (!PRI.matched || PRI.matched < 1500) {
    fail('data.js folded only ' + (PRI.matched || 0) + ' onto the corpus: the join is broken, ' +
         'which is silent because every game then falls back');
  } else ok(PRI.count + ' players held, ' + PRI.matched + ' matched onto corpus entities');
}

/* ---- 2. the named cases -------------------------------------------------- */
/* The ones a person can check by eye, including the reported one. These are
   what make a wrong answer visible: a percentage cannot tell you that the
   caption under Tom Seaver says Boston. */
console.log('\n2) the reported case, and the others it was wrong about');
{
  const CASES = [
    ['MLB', 'Tom Seaver', 'New York Mets'],
    ['MLB', 'Nolan Ryan', null],            // career began 1966: declined, falls back
    ['NFL', 'Brett Favre', 'Green Bay Packers'],
    ['NFL', 'Emmitt Smith', 'Dallas Cowboys'],
    ['NBA', 'Shaquille O\'Neal', 'Los Angeles Lakers'],
    ['NBA', 'Charles Barkley', 'Philadelphia 76ers'],
    ['NBA', 'Gary Payton', 'Seattle SuperSonics'],
    ['NFL', 'Tom Brady', 'New England Patriots'],
    ['MLB', 'Mike Trout', 'Los Angeles Angels']
  ];
  for (const [sport, name, want] of CASES) {
    const e = ENT.find((x) => x && x.name === name && x.sport === sport);
    if (!e) { fail(name + ' is not in the corpus'); continue; }
    const got = club(e);
    if (want && got !== want) fail(name + ': the card would say ' + JSON.stringify(got) + ', want ' + want);
    else if (!want && !got) fail(name + ': no club at all');
    else ok(name + ': ' + got + (e.pt ? '' : ' (from the first club, no tenure held)'));
  }
}

/* ---- 3. nobody is captioned with a club they barely played for ----------- */
/* The shape of the reported bug, asserted against the whole corpus rather than
   a list: the club shown must never be the LAST entry of a multi-club career
   unless it is also the first or the one tenure picked. Seaver failed this. */
console.log('\n3) no card shows the last club of a career that had several');
{
  let checked = 0;
  const bads = [];
  for (const e of ENT) {
    if (!e || !e.t || e.t.length < 3 || !e.name) continue;
    checked++;
    const shown = club(e);
    if (shown === e.t[e.t.length - 1] && shown !== e.t[0] && !e.pt) {
      bads.push(e.name + ' -> ' + shown);
    }
  }
  if (bads.length) fail(bads.length + ' of ' + checked + ' show a last club with nothing behind it: ' + bads.slice(0, 5).join(', '));
  else ok(checked + ' players with three or more clubs, none captioned by the last one alone');
}

/* ---- 4. scored against basketball's own record --------------------------- */
console.log('\n4) basketball, scored against hoops/data/players.json (1974 to 2025)');
{
  let rows, teams;
  try {
    rows = JSON.parse(readFileSync('hoops/data/players.json', 'utf8'));
    teams = JSON.parse(readFileSync('hoops/data/teams.json', 'utf8')).teams;
  } catch (e) {
    console.log('  note: the hoops data is not readable, skipping (' + e.message + ')');
    rows = null;
  }
  if (rows) {
    const full = {};
    for (const t of (Array.isArray(teams) ? teams : Object.values(teams))) full[t.code] = t.full;
    const seasons = new Map();
    for (const r of rows) {
      if (!r || !r.n || !r.t) continue;
      const k = nk(r.n);
      if (!seasons.has(k)) seasons.set(k, {});
      const m = seasons.get(k);
      m[r.t] = (m[r.t] || 0) + 1;
    }
    /* Every club tied at the top counts as a right answer. */
    const leaders = new Map();
    for (const [k, m] of seasons) {
      const e = Object.entries(m).sort((a, b) => b[1] - a[1]);
      const top = e[0][1];
      const L = e.filter((x) => x[1] === top).map((x) => full[x[0]]).filter(Boolean);
      if (L.length) leaders.set(k, { L, clubs: e.length });
    }
    let n = 0, right = 0, oldRule = 0;
    const wrong = [];
    for (const e of ENT) {
      if (!e || e.sport !== 'NBA' || !e.t || e.t.length < 2 || !e.name) continue;
      const t = leaders.get(nk(e.name));
      if (!t || t.clubs < 2) continue;
      n++;
      if (t.L.indexOf(e.t[e.t.length - 1]) >= 0) oldRule++;
      const shown = club(e);
      if (t.L.indexOf(shown) >= 0) right++;
      else if (wrong.length < 6) wrong.push(e.name + ': ' + shown + (e.pt ? ' [tenure]' : ' [first club]') + ', longest ' + t.L.join('/'));
    }
    const pc = (x) => Math.round((x / n) * 100);
    /* 98% today. The floor is deliberately below that: this is a data check,
       and a scrape that shifts a few players should not fail a build. A drop
       below 90 means the join or the source has broken, not that a player
       changed clubs. */
    if (n < 300) fail('only ' + n + ' basketball players are checkable: the reference did not load properly');
    else if (pc(right) < 90) {
      fail('right for ' + right + ' of ' + n + ' (' + pc(right) + '%), below the 90% floor. ' +
           'Examples: ' + wrong.slice(0, 4).join('; '));
    } else {
      ok('right for ' + right + ' of ' + n + ' (' + pc(right) + '%), against ' + pc(oldRule) + '% for the rule this replaced');
      if (wrong.length) console.log('       the misses are careers that began before the record does: ' + wrong.slice(0, 3).join('; '));
    }
  }
}

/* ---- 5. no game reads the last club any more ----------------------------- */
/* The two that did are fixed; this is what stops a third from being written.
   Matched on the source, because a game that reads e.t last is wrong before it
   ever renders and no runtime check would see it. */
console.log('\n5) no game page takes the last entry of the team list as a club');
{
  const PAGES = ['almamater', 'guess', 'career', 'crossword', 'match', 'oddone', 'rankit', 'table', 'highlow'];
  const hits = [];
  for (const g of PAGES) {
    const src = readFileSync('arcade/' + g + '/index.html', 'utf8');
    /* e.t[e.t.length-1] in any spacing. Comments are stripped first so the
       ones explaining this rule do not trip it. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const re = /([A-Za-z_$][\w$]*)\.t\s*\[\s*\1\.t\.length\s*-\s*1\s*\]/g;
    let m;
    while ((m = re.exec(code))) hits.push(g + ': ' + m[0]);
  }
  if (hits.length) fail('still reading the last club: ' + hits.join(', '));
  else ok('none of the ' + PAGES.length + ' pages');
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\nprimary ok');
