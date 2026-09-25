/*
 * check-bracket.mjs - the playoff bracket, as arithmetic and as a screen.
 *
 *   node hoops/check-bracket.mjs
 *   node hoops/check-bracket.mjs --quick     the arithmetic only, no browser
 *
 * ── WHY IT IS ITS OWN FILE ─────────────────────────────────────────────────
 *
 * Its subject is a page, which is the same argument check-boss.mjs makes in
 * the football game and check-live.mjs makes next door. Nothing about the
 * bracket is in the engine: it is a picture of a field the run is walking
 * through, and the run itself is decided somewhere else entirely.
 *
 * ── AND EVERY WAY IT BREAKS RENDERS PERFECTLY ──────────────────────────────
 *
 * IT SPOILS ITSELF. Every decoration game is decided the first time its
 * pairing is asked for, and the first round's pairings are known at the tip,
 * so the whole field resolves on the first screen unless something holds it
 * back. That shipped in the first draft of this: the conference final column
 * named the 5 seed while the first round was still being revealed, which
 * tells a reader who wins their own semifinal before their first round is
 * over. It is a perfectly rendered bracket and it is reading ahead.
 *
 * IT DECIDES SOMETHING. The opponent each round is a net rating drawn by
 * poBeginRound and the postseason is fitted against it. A bracket that
 * quietly became the thing that picked the opponent would rebuild the
 * difficulty curve with nothing anywhere reporting it.
 *
 * IT CONTRADICTS ITSELF. Sixteen seats carry a seed and a record, so a 7 seed
 * printed above an 8 seed with more wins is a bracket arguing with its own
 * seeding, and the player's own record is the one number in the column that
 * is not ours to choose.
 *
 * IT NAMES SOMEBODY. This game says "played like a 58 win team" rather than
 * naming a club, for the reason written over the results screen. Fifteen
 * seats is fifteen chances to break that.
 *
 * NOTHING HERE REACHES A NETWORK.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = '/opt/node22/lib/node_modules/playwright/index.js';
const QUICK = process.argv.includes('--quick');

const require = createRequire(import.meta.url);
const E = require(path.join(HERE, 'engine.js'));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'data', f), 'utf8'));
E.setTeams(read('teams.json'));

let pass = 0;
const failures = [];
const ok = (cond, what) => { if (cond) pass++; else failures.push(what); };
const is = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${what}\n      expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const is0 = (n, what) => ok(n === 0, `${what}\n      ${n} failures`);
const head = (s) => console.log('\n' + s + '\n' + '-'.repeat(s.length));

const pageSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

/* THE FUNCTIONS ARE LIFTED OUT OF THE SHIPPED PAGE, never copied here, which
   is verify.mjs's own rule and mythiball's hardest-won one: a hand written
   duplicate of an arithmetic agrees with itself for ever, including after the
   page has stopped agreeing with it. Brace matched rather than regexed to a
   closing line, because a `}` at the start of a line inside a function would
   otherwise cut it in half. */
function fnSource(name){
  const heads = ['function ' + name + '(', 'var ' + name + ' = ', 'var ' + name + '='];
  for (const h of heads) {
    const at = pageSrc.indexOf(h);
    if (at < 0) continue;
    if (h[0] === 'v') {
      const end = pageSrc.indexOf(';\n', at);
      return pageSrc.slice(at, end + 1);
    }
    let depth = 0;
    for (let j = pageSrc.indexOf('{', at); j < pageSrc.length; j++) {
      if (pageSrc[j] === '{') depth++;
      else if (pageSrc[j] === '}' && --depth === 0) return pageSrc.slice(at, j + 1);
    }
  }
  return null;
}

// ── 1. the arithmetic, lifted ───────────────────────────────────────────────
head('1. the field is a field: seeded, ordered, and its own shape');
{
  /* COVERAGE IS HALF THE CHECK. A reader that finds nothing lets every
     assertion below pass vacuously, which is how an extractor in this repo
     has been silently wrong three times. */
  const WANT = ['brkSeedOf', 'brkColumnWins', 'brkLadder', 'brkOdds', 'brkResolve',
    'BRK_TREE', 'BRK_OVER'];
  const missing = WANT.filter((n) => !fnSource(n));
  is(missing, [], 'every function this section reads is still in the page');
  if (missing.length) { report(); process.exit(1); }

  const src = WANT.map(fnSource).join('\n');
  const lift = new Function('E', src + '\nreturn {'
    + WANT.join(', ') + '};')(E);
  const { brkSeedOf, brkColumnWins, brkLadder, brkOdds, brkResolve, BRK_TREE } = lift;

  /* THE TREE IS THE REAL ONE. No reseeding in the NBA, so 1/8 meets 4/5 and
     2/7 meets 3/6, and every seed appears exactly once. */
  const flat = BRK_TREE.reduce((a, b) => a.concat(b), []).sort((a, b) => a - b);
  is(flat, [1, 2, 3, 4, 5, 6, 7, 8], 'every seed is in the tree exactly once');
  is0(BRK_TREE.filter((p) => p[0] + p[1] !== 9).length,
    'every pairing adds to nine, which is what a fixed NBA bracket is');
  is(BRK_TREE.map((p) => p[0]), [1, 4, 3, 2],
    'and the column is drawn in bracket order, so a reader can follow a line');

  /* THE SEED TRACKS THE RECORD, and its split is the engine's own. A run the
     engine sends to the play-in must never be handed a top six seed here. */
  let seedBad = 0, orderBad = 0, last = 0;
  for (let w = E.CONSTANTS.TOP_SIX_WINS; w <= 82; w++) {
    const s = brkSeedOf(w);
    if (s < 1 || s > 6) seedBad++;
    if (last && s > last) orderBad++;
    last = s;
  }
  is0(seedBad, 'a top six record is seeded one to six and never lower');
  is0(orderBad, 'and more wins never means a worse seed');
  ok(brkSeedOf(82) === 1, 'the best record in the league is the one seed');
  ok(brkSeedOf(E.CONSTANTS.TOP_SIX_WINS) === 6,
    'and the last record that clears the line is the six');

  /* A COLUMN NEVER PRINTS A WORSE SEED WITH MORE WINS, and the case that
     breaks a per-seed band is the player's own record: the engine lets a 43
     win run into the play-in, which sits under any band written for an 8
     seed. Swept over every anchor a run can arrive with. */
  let mono = 0, anchored = 0, cols = 0;
  for (let seed = 1; seed <= 8; seed++) {
    for (let w = 30; w <= 78; w += 1) {
      const rng = E.createSeededRNG(seed * 1000 + w);
      const col = brkColumnWins(seed, w, rng);
      cols++;
      if (col[seed - 1] !== w) anchored++;
      for (let i = 1; i < col.length; i++) if (col[i] > col[i - 1]) mono++;
      if (col.length !== 8) mono++;
    }
  }
  ok(cols > 300, `the sweep ran (${cols} columns)`);
  is0(anchored, "the player's own seat keeps the player's own record");
  is0(mono, 'no seat in a column has more wins than the seat above it');

  /* A CONFERENCE IS AS WIDE AS A REAL ONE. The walk used to step one to three
     wins a seed and nothing else, so a far conference anchored on a 67 win top
     seed drew a 56 win 8 seed and every club in it was better than every club
     in the player's own. Driven the way brkBuild anchors the far side, and the
     near side from a player at every seed, the 8 seed has to sit in play-in
     territory and the column has to be about as wide as the NBA's. */
  let narrow = 0, fat8 = 0, farCols = 0;
  for (let i = 0; i < 400; i++) {
    const rng = E.createSeededRNG(90000 + i);
    const top = brkLadder(1) - 1 + Math.floor(rng() * 5);
    const col = brkColumnWins(1, top, rng);
    farCols++;
    if (col[0] - col[7] < 14) narrow++;
    if (col[7] > E.CONSTANTS.TOP_SIX_WINS) fat8++;
  }
  let nearFat8 = 0;
  for (let seed = 1; seed <= 7; seed++) {
    for (let w = 43; w <= 70; w++) {
      const col = brkColumnWins(seed, w, E.createSeededRNG(seed * 77 + w));
      if (seed < 8 && col[7] > E.CONSTANTS.TOP_SIX_WINS + 2) nearFat8++;
    }
  }
  ok(farCols === 400, 'the far conference sweep ran');
  is0(narrow, 'the far conference runs at least fourteen wins from its 1 seed to its 8');
  is0(fat8, 'and its 8 seed never has a top six record');
  is0(nearFat8, "and the player's own conference never draws an 8 seed well clear of the top six line");

  /* The reveal's own odds. Nothing downstream reads them, so what matters is
     that they are a probability and that the better seed is never the
     underdog. */
  let oddsBad = 0;
  for (let a = 1; a <= 8; a++) {
    for (let b = a + 1; b <= 8; b++) {
      const p = brkOdds(a, b);
      if (!(p >= 0.5 && p <= 0.93)) oddsBad++;
      if (b > a + 1 && p < brkOdds(a, b - 1)) oddsBad++;
    }
  }
  is0(oddsBad, 'the better seed is favoured, more so the wider the gap');

  let seriesBad = 0, sweeps = 0, sevens = 0, n = 0;
  const rng = E.createSeededRNG(31);
  for (let i = 0; i < 4000; i++) {
    const hi = { seed: 1 + Math.floor(rng() * 4) };
    const lo = { seed: hi.seed + 1 + Math.floor(rng() * 4) };
    const r = brkResolve(hi, lo, rng);
    n++;
    if (r.w !== 4) seriesBad++;
    if (r.l < 0 || r.l > 3) seriesBad++;
    if (r.win !== hi && r.win !== lo) seriesBad++;
    if (r.lose === r.win) seriesBad++;
    if (r.l === 0) sweeps++;
    if (r.l === 3) sevens++;
  }
  is0(seriesBad, 'every series is won four games to nought, one, two or three');
  ok(sweeps / n > 0.05 && sweeps / n < 0.6,
    `sweeps happen and are not the norm (${(100 * sweeps / n).toFixed(0)}%)`);
  ok(sevens / n > 0.05 && sevens / n < 0.45,
    `and a game seven is a real tail (${(100 * sevens / n).toFixed(0)}%)`);
}

// ── 2. nobody is named ──────────────────────────────────────────────────────
head('2. the bracket names nobody, which is this game\'s rule');
{
  /* The results screen has said "played like a N win team" since it shipped,
     because printing a real club over a number the model rolled tells
     somebody they beat a team that was never in the room. A bracket of
     fifteen seats is fifteen chances to undo that in one screen, and the
     failure is a page that reads better than the correct one. */
  const at = pageSrc.indexOf('function brkSeat(');
  ok(at > 0, 'the seat painter is in the page');
  const end = pageSrc.indexOf('\n}', at);
  const seat = pageSrc.slice(at, end);
  const named = /nickname|franchise|teamName|E\.team\(|clubSkin/.test(seat);
  ok(!named, 'a seat is drawn without reaching for a club name'
    + (named ? '\n      ' + seat.split('\n').filter((l) => /nickname|franchise|teamName|E\.team\(|clubSkin/.test(l)).join('\n      ') : ''));

  /* AND THE TWO NUMBERS STAY APART. The seat carries the seed, which is the
     field's shape; the note carries the strength the engine drew, which is
     the only number that decides anything. Read as one claim they would make
     the bracket look like it was lying about its own seeding. */
  const note = fnSource('brkSeriesNote') || '';
  ok(/oppWins\(/.test(note), 'the note reads the drawn strength through oppWins');
  ok(/cur\.oppNet/.test(note), 'and off the round rather than off the pending game');
  ok(!/oppWins\(/.test(seat), 'and the seat does not, so the two never merge');
}

// ── 3. the field, driven ────────────────────────────────────────────────────
head('3. the whole field, driven through the runs that break it');
{
  /* THE FIELD IS LIFTED WHOLE, because the claims here are about how its
     pieces feed each other and a lift of one function at a time would be a
     rebuild of the join rather than a test of it. Its only outside
     dependencies are the engine and the run, so the run is the fixture. */
  const WANT = ['BRK_CONFS', 'BRK_TREE', 'BRK_OVER', 'brkWins', 'brkSeedOf',
    'brkColumnWins', 'brkLadder', 'brkOdds', 'brkResolve', 'brk', 'brkBuild', 'brkEntrant',
    'brkGame', 'brkMine', 'brkColumn', 'brkKnown'];
  const missing = WANT.filter((n) => !fnSource(n));
  is(missing, [], 'the whole field is still in the page');
  if (missing.length) { report(); process.exit(1); }

  const src = WANT.map(fnSource).join('\n');
  const make = new Function('E', 'getRun',
    'var run;' + src + '\nreturn function(r){ run = r; brk = null; return {'
    + 'brkBuild, brkGame, brkColumn, brkKnown, brkMine, brkEntrant }; };')(E, null);

  const ROUNDS = ['Play-In', 'First Round', 'Conference Semifinals',
    'Conference Finals', 'NBA Finals'];
  function fixture(seed, wins, outAt, title){
    const seat = E.seedFromRecord(wins);
    const names = E.playoffRoundNames(seat.rounds);
    const results = [];
    for (let i = 0; i < names.length; i++) {
      const won = title ? true : i < outAt;
      results.push({ round: names[i], won: won,
        yourWins: names[i] === 'Play-In' ? (won ? 1 : 0) : (won ? 4 : 2),
        oppWins: names[i] === 'Play-In' ? (won ? 0 : 1) : (won ? 2 : 4),
        oppNet: 3.2, gamesPlayed: 6, games: [] });
      if (!won) break;
    }
    return { seed: seed,
      season: Array.from({ length: 82 }, (unused, i) => ({ won: i < wins })),
      playoffSeed: seat,
      po: { results: results, cur: null, done: true, names: names } };
  }

  /* THE BRACKET HAS TO FINISH WITHOUT YOU, whatever round took you out, and
     the case that broke it is the one where you never entered the field at
     all. A play-in loss left the seat it feeds empty, so every round after it
     stayed permanently TBD and the postseason the player had just been
     knocked out of never happened. */
  let noChamp = 0, wrongChamp = 0, runs = 0;
  for (let s = 1; s <= 40; s++) {
    for (const [wins, outAt] of [[46, 0], [46, 1], [46, 2], [46, 4],
      [58, 0], [58, 1], [58, 3], [64, 2]]) {
      const F = make(fixture(s * 31, wins, outAt, false));
      const B = F.brkBuild();
      runs++;
      const fin = F.brkColumn(B.names.length - 1)[0];
      if (!fin || !fin.won) { noChamp++; continue; }
      /* Somebody who went out cannot be holding the trophy. */
      if (fin.won.you) wrongChamp++;
    }
  }
  ok(runs > 200, `the sweep ran (${runs} runs)`);
  is0(noChamp, 'a bracket the player is out of still crowns somebody');
  is0(wrongChamp, 'and it is never the player who went out');

  /* A play-in loss hands the seat to whoever won it, which is what the real
     bracket does and is the only way the field can finish. */
  let entrant = 0;
  for (let s = 1; s <= 30; s++) {
    const F = make(fixture(s * 7 + 1, 46, 0, false));
    const B = F.brkBuild();
    const first = F.brkColumn(1);
    let seats = 0, mineSeats = 0;
    for (const g of first) for (const e of g.pair) { if (e) seats++; if (e && e.you) mineSeats++; }
    if (seats !== 16) entrant++;
    if (mineSeats !== 0) entrant++;
  }
  is0(entrant, 'a lost play-in fills its seat rather than leaving a hole in the field');

  /* And an undecided play-in leaves it empty, because the player is not in
     it yet: the first round drew them into a seat while the game deciding
     whether they are in it was still on the screen above. */
  let early = 0;
  for (let s = 1; s <= 30; s++) {
    const r = fixture(s * 13 + 5, 46, 0, false);
    r.po.results = [];
    r.po.cur = { roundIndex: 0, yourWins: 0, oppWins: 0, oppNet: 3.2 };
    r.po.done = false;
    const F = make(r);
    const first = F.brkColumn(1);
    let filled = 0;
    for (const g of first) for (const e of g.pair) if (e) filled++;
    if (filled !== 15) early++;
  }
  is0(early, 'and an undecided play-in leaves that seat empty');

  /* A title run is the champion, which is the other end of the same claim. */
  let champBad = 0;
  for (let s = 1; s <= 30; s++) {
    for (const wins of [46, 55, 64]) {
      const F = make(fixture(s * 17 + 3, wins, 9, true));
      const B = F.brkBuild();
      const fin = F.brkColumn(B.names.length - 1)[0];
      if (!fin || !fin.won || !fin.won.you) champBad++;
    }
  }
  is0(champBad, 'a run that wins the Finals is the one holding the trophy');

  /* THE SPOILER GATE. Nothing past the round being played may be drawable,
     and the first round always is. Asked of a run that has just started. */
  let ahead = 0, firstHidden = 0;
  for (let s = 1; s <= 30; s++) {
    for (const wins of [46, 58]) {
      const r = fixture(s * 23 + 2, wins, 9, true);
      r.po.results = [];
      r.po.cur = { roundIndex: 0, yourWins: 0, oppWins: 0, oppNet: 3.2 };
      r.po.done = false;
      const F = make(r);
      const B = F.brkBuild();
      const known = F.brkKnown();
      if (!known[0]) firstHidden++;
      if (B.off && !known[1]) firstHidden++;
      for (let c = B.off + 1; c < B.names.length; c++) if (known[c]) ahead++;
    }
  }
  is0(firstHidden, 'the first round is drawn from the tip, play-in or not');
  is0(ahead, 'and nothing past it is, so the bracket cannot read ahead');
}

if (QUICK) { report(); process.exit(failures.length ? 1 : 0); }

// ── the browser half ────────────────────────────────────────────────────────

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

async function serve(route){
  const u = new URL(route.request().url());
  if (u.hostname !== 'local.test') return route.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return route.abort();
  await route.fulfill({ status: 200,
    contentType: TYPES[path.extname(f)] || 'application/octet-stream',
    body: fs.readFileSync(f) });
}

/* A PHONE, NOT THIS HARNESS'S OWN WINDOW. The layout claims here are about
   the screen the game is played on, and a tall window passes a check on a
   screen that is broken. */
const PHONE = { width: 390, height: 844 };

async function newPage(browser, boom){
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 220)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::|Failed to load resource/.test(t)) return;
    boom.push('console: ' + t.slice(0, 200));
  });
  await page.route('**/*', serve);
  return page;
}

async function boot(page){
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await widenDoor(page);
  await page.waitForTimeout(200);
}

/* THE DOOR IS A GAME 7 AND A GAME 7 IS RARE. Since the door stopped opening
   on every game that could end a series, a run meets one about one time in
   five, so sections 6 and 7 waited on an event that mostly never came: the
   door was never seen and the run played itself out to the results screen.
   That failed on every run from the commit that made the change, which is a
   guard nobody reads. check-live.mjs met the same problem and widens the door
   inside the page for exactly this; the real rule is asserted there, off the
   engine, so this walk is free to ask for a door on any series game that can
   end it. */
async function widenDoor(page) {
  await page.evaluate(() => {
    const E = window.RTF_ENGINE, real = E.poNext;
    E.poNext = function (po, rng) {
      const n = real.call(this, po, rng);
      if (n && n.bestOf > 1 && (n.elimination || n.closeout)) n.big = true;
      return n;
    };
  });
}

/* Draft best-available through the real board and play the 82.
   `.opts:not(.pending)` is load-bearing: `.opts.pending` hides the tile's
   CHILDREN and sets pointer-events none on the tile, so the tile itself is a
   visible box and a scripted click lands on a board still mid-spin, which
   leaves reelBusy true and the draft on an empty board for ever. */
async function toPlayoffs(page){
  await page.evaluate(() => { try { localStorage.removeItem('runthefloor_run_v1'); } catch (e) {} });
  await page.evaluate(() => document.querySelector('#b-start').click());
  /* HOW MANY TO SIGN IS THE ENGINE'S ANSWER, never a literal. Written 6 this
     loop pressed one more time than the game drafts, so the last press landed
     on a screen that was no longer the draft and the failure it reported was
     a timeout about whatever that screen happened to be. */
  for (let i = 0; i < E.SLOTS.length; i++) {
    await page.waitForSelector('.opts:not(.pending) .ptile:not(.off)', { timeout: 25000 });
    await page.evaluate(() =>
      document.querySelector('.opts:not(.pending) .ptile:not(.off)').click());
    await page.waitForFunction((a) => {
      try {
        const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
        if (!r || !Array.isArray(r.roster) || r.roster.length < a.want) return false;
        if (r.roster.length >= a.full) return true;
        const o = document.querySelector('.opts');
        return !!r.currentDraw && !!o && !/pending/.test(o.className);
      } catch (e) { return false; }
    }, { want: i + 1, full: E.SLOTS.length }, { timeout: 25000 });
  }
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#b-play').click());
  await page.waitForTimeout(700);
  await page.evaluate(() => { const b = document.querySelector('#b-skip'); if (b) b.click(); });
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const st = await page.evaluate(() => ({
      brk: !!document.querySelector('#s-brk.active'),
      over: !!document.querySelector('#s-over.active'),
    }));
    if (st.brk) return true;
    if (st.over) return false;
    await page.waitForTimeout(100);
  }
  return false;
}

/* A roster has to reach the playoffs, and the page's own walk takes the first
   affordable tile rather than best-available, so it misses often enough to
   matter. One page, a new run each go, which is the same fresh run at a
   fraction of a fresh browser context's cost. */
async function findBracket(browser, boom){
  const page = await newPage(browser, boom);
  await boot(page);
  for (let a = 0; a < 12; a++) {
    if (await toPlayoffs(page)) return page;
    await page.evaluate(() => { const h = document.querySelector('#b-home'); if (h) h.click(); });
    await page.waitForSelector('#b-start', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(120);
  }
  return null;
}

const railState = (page) => page.evaluate(() => {
  const cols = [...document.querySelectorAll('#brk-rail .brk-col')];
  return cols.map((c) => ({
    head: c.querySelector('.brk-h').textContent,
    now: c.classList.contains('now'),
    games: [...c.querySelectorAll('.brk-g')].map((g) => ({
      live: g.classList.contains('live'),
      seats: [...g.querySelectorAll('.brk-t')].map((t) => ({
        sd: t.querySelector('.sd').textContent,
        nm: t.querySelector('.nm').textContent,
        sc: t.querySelector('.sc').textContent,
        tbd: t.classList.contains('tbd'),
        me: t.classList.contains('me'),
        won: t.classList.contains('won'),
        out: t.classList.contains('out'),
      })),
    })),
  }));
});

function report(){
  console.log('');
  if (failures.length) {
    console.log(`${failures.length} FAILED:`);
    for (const f of failures) console.log('  x ' + f);
    console.log(`\n${pass} passed, ${failures.length} failed.`);
  } else {
    console.log(`${pass} assertions passed.`);
  }
}

const main = async () => {
  const pw = (await import(PW)).default;
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  const boom = [];

  head('4. the field, on the screen');
  const page = await findBracket(browser, boom);
  ok(!!page, 'a run reached the bracket');
  if (!page) { await browser.close(); report(); process.exit(1); }

  {
    const st = await railState(page);
    const names = st.map((c) => c.head);
    console.log('  columns: ' + names.join(' | '));
    ok(st.length === 4 || st.length === 5,
      `four rounds, or five with a play-in (${st.length})`);
    ok(/Finals/.test(names[names.length - 1]), 'and the last one is the Finals');
    const pi = names[0] === 'Play-In';

    /* SIXTEEN SEATS AND FIFTEEN GAMES, which is what an NBA bracket is. A
       play-in run has one more game in front of it. */
    const total = st.reduce((n, c) => n + c.games.length, 0);
    is(total, pi ? 16 : 15, 'the field is fifteen games, sixteen with a play-in');
    is(st[pi ? 1 : 0].games.length, 8, 'eight first round series');
    is(st[pi ? 2 : 1].games.length, 4, 'four semifinals');
    is(st[pi ? 3 : 2].games.length, 2, 'two conference finals');
    is(st[st.length - 1].games.length, 1, 'and one Finals');

    /* NOBODY IS NAMED. Every seat is a seed and a record, or the player, or
       a seat nothing has fed yet. */
    let named = 0, mine = 0;
    for (const c of st) for (const g of c.games) for (const s of g.seats) {
      if (s.me) { mine++; continue; }
      if (s.tbd) { if (s.nm !== 'TBD') named++; continue; }
      if (!/^\d{1,2}-\d{1,2}$/.test(s.nm)) named++;
    }
    is0(named, 'every seat is a record, the player, or TBD, and never a club');
    ok(mine > 0, `the player is in the field (${mine} seats)`);

    /* THE FIRST ROUND IS SEEDED AND THE COLUMN IS ORDERED. Its pairings are
       seeds, so they exist at the tip and are drawn from the start. */
    const first = st[pi ? 1 : 0].games;
    /* A PLAY-IN RUN HAS ONE SEAT THE PLAY-IN HAS NOT FILLED YET, and it is
       correctly TBD, so a pairing with an empty chip is the rule working
       rather than a broken one. The first draft read '' as 0 and reported a
       7 seed paired with nobody as a bracket that does not add up. */
    const pairs = first.map((g) => g.seats.map((x) => x.sd))
      .filter((p) => p.every((x) => x !== ''))
      .map((p) => p.map(Number));
    ok(pairs.length >= 7, `most of the first round is seeded (${pairs.length} of 8)`);
    is0(pairs.filter((p) => p[0] + p[1] !== 9).length,
      'every first round pairing that is filled adds to nine');
    is(first.slice(0, 4).map((g) => g.seats[0].sd), ['1', '4', '3', '2'],
      'and a conference is drawn in bracket order');

    /* RECORDS DESCEND WITH THE SEED, on the screen and not only in the
       arithmetic. Read per conference, because the two are separate fields. */
    let outOfOrder = 0;
    for (const half of [first.slice(0, 4), first.slice(4)]) {
      const bySeed = {};
      for (const g of half) for (const s of g.seats) {
        if (s.me) continue;
        bySeed[+s.sd] = +s.nm.split('-')[0];
      }
      const seeds = Object.keys(bySeed).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < seeds.length; i++) {
        if (bySeed[seeds[i]] > bySeed[seeds[i - 1]]) outOfOrder++;
      }
    }
    is0(outOfOrder, 'a worse seed never shows more wins than a better one');
  }

  // ── 5. it does not read ahead ────────────────────────────────────────────
  head('5. the bracket does not spoil itself');
  {
    const st = await railState(page);
    const pi = st[0].head === 'Play-In';
    /* THE COLUMN AFTER THE ONE BEING PLAYED IS TBD. Every decoration game is
       decided the first time its pairing is asked for, so without a gate the
       conference final column names a seed while the first round is still
       being revealed, which tells a reader who wins their own semifinal
       before their first round is over. */
    const nowAt = st.findIndex((c) => c.now);
    ok(nowAt >= 0, 'a column is marked as the one being played');
    /* THE FIRST ROUND IS ALWAYS DRAWN, play-in or not, because its pairings
       are seeds. So what must be hidden is everything past the LATER of the
       round being played and the first round, which on a bye run is the same
       column and on a play-in run is one along. Written as "past the round
       being played" it failed on a play-in run reporting the correct first
       round as fifteen seats read ahead. */
    const from = Math.max(nowAt, pi ? 1 : 0);
    let ahead = 0, aheadSeats = 0;
    for (let c = from + 1; c < st.length; c++) {
      for (const g of st[c].games) for (const s of g.seats) {
        aheadSeats++;
        if (!s.tbd) ahead++;
      }
    }
    ok(aheadSeats > 0, `there are later rounds to check (${aheadSeats} seats)`);
    is0(ahead, 'no seat past the round being played has anybody in it');

    /* AND THE ROUND BEING PLAYED HAS EXACTLY ONE LIVE BOX, the player's. */
    const live = st.reduce((n, c) => n + c.games.filter((g) => g.live).length, 0);
    is(live, 1, 'exactly one box is ringed, and it is the one being played');
    const liveGame = st[nowAt].games.find((g) => g.live);
    ok(!!liveGame && liveGame.seats.some((x) => x.me),
      'and the player is in it');
  }

  // ── 6. the reveal, and the door above the rail ───────────────────────────
  head('6. the field settles around you, and the door is above the rail');
  {
    /* Watch the round settle. Every step is a full redraw, so what is
       asserted is the property: settled boxes only ever grow in number, and
       nobody unsettles. */
    const tape = await page.evaluate(() => new Promise((done) => {
      const out = [];
      const read = () => [...document.querySelectorAll('#brk-rail .brk-g')]
        .filter((g) => g.querySelector('.brk-t.won')).length;
      out.push(read());
      const t = setInterval(() => { out.push(read()); }, 120);
      setTimeout(() => { clearInterval(t); done(out); }, 4200);
    }));
    let back = 0;
    for (let i = 1; i < tape.length; i++) if (tape[i] < tape[i - 1]) back++;
    is0(back, 'a game that has been decided never goes back to undecided');
    ok(tape[tape.length - 1] >= tape[0],
      `the field settles as it is watched (${tape[0]} to ${tape[tape.length - 1]})`);

    /* THE DOOR, WHEN IT COMES, IS ABOVE THE RAIL. The rail is the tallest
       thing on this screen and it scrolls; a control the game is waiting on
       underneath it is one the player has to go looking for. Measured on a
       phone rather than on this harness's own window. */
    const t0 = Date.now();
    let saw = false;
    while (Date.now() - t0 < 70000) {
      const st = await page.evaluate(() => {
        const d = document.querySelector('#lvdoor');
        if (!d || d.hidden) return null;
        const rail = document.querySelector('#brk-wrap') || document.querySelector('.brk-wrap');
        return {
          top: d.getBoundingClientRect().top,
          bottom: d.getBoundingClientRect().bottom,
          railTop: rail.getBoundingClientRect().top,
          vh: window.innerHeight,
          eye: document.querySelector('#lvd-eye').textContent,
          why: document.querySelector('#lvd-why').textContent,
          note: document.querySelector('#brk-note').textContent,
          play: !!document.querySelector('#b-lv-play'),
        };
      });
      if (st) {
        saw = true;
        ok(st.top < st.railTop,
          `the door is above the bracket (${Math.round(st.top)} against ${Math.round(st.railTop)})`);
        ok(st.bottom <= st.vh,
          `and the whole of it is on the screen (${Math.round(st.bottom)} of ${st.vh})`);
        ok(st.play, 'with something to press');
        ok(/Round|Final|Semi|Play-In/i.test(st.eye),
          `it names the round (${JSON.stringify(st.eye)})`);
        /* THE SEED AND THE FORM, KEPT APART. The note is the one place the
           strength the engine drew is printed, and it must not be printed as
           a season record on a seat. */
        ok(/win team/.test(st.note),
          `the note says what they are playing like (${JSON.stringify(st.note)})`);
        break;
      }
      if (await page.evaluate(() => !!document.querySelector('#s-over.active'))) break;
      await page.waitForTimeout(120);
    }
    ok(saw, 'a door opened somewhere in the bracket');
  }

  // ── 7. a reload lands on the bracket ─────────────────────────────────────
  head('7. a reload comes back to the bracket, not to the season');
  {
    const before = await page.evaluate(() => {
      const r = JSON.parse(localStorage.getItem('runthefloor_run_v1'));
      return { phase: r.phase, rounds: r.po ? r.po.results.length : -1 };
    });
    ok(before.phase === 'playoffs', `the saved run is in the playoffs (${before.phase})`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#b-start:not([disabled])', { state: 'attached', timeout: 30000 });
    await page.evaluate(() => document.querySelector('#b-resume').click());
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => ({
      screen: (document.querySelector('.screen.active') || {}).id,
      cols: document.querySelectorAll('#brk-rail .brk-col').length,
      settled: document.querySelectorAll('#brk-rail .brk-t.won').length,
    }));
    ok(st.screen === 's-brk' || st.screen === 's-over',
      `resuming lands on the bracket (${st.screen})`);
    if (st.screen === 's-brk') {
      ok(st.cols >= 4, `with the whole field on it (${st.cols} rounds)`);
      /* ROUNDS ALREADY PLAYED ARE DRAWN SETTLED. Nothing animated them, and a
         bracket that came back as a page of TBD would read as a run that had
         not started. */
      if (before.rounds > 0) {
        ok(st.settled > 0, `and the rounds already played still settled (${st.settled})`);
      } else { pass++; }
    }

    /* And it finishes: any further door is simmed, because what is under test
       here is that the walk survives a reload rather than what a played game
       does. */
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      if (await page.evaluate(() => !!document.querySelector('#s-over.active'))) break;
      const open = await page.evaluate(() => {
        const d = document.querySelector('#lvdoor');
        if (!d || d.hidden) return false;
        document.querySelector('#b-lv-sim').click();
        return true;
      });
      await page.waitForTimeout(open ? 120 : 200);
    }
    const done = await page.evaluate(() => ({
      screen: (document.querySelector('.screen.active') || {}).id,
      run: JSON.parse(localStorage.getItem('runthefloor_run_v1')),
    }));
    ok(done.screen === 's-over', 'the run reaches its results screen');
    ok(done.run && done.run.phase === 'over' && !!done.run.outcome,
      'and the saved run is finished with an outcome on it');
    /* THE BRACKET THE SCREEN DREW IS THE BRACKET THE RUN PLAYED. Two pictures
       of one postseason is the only way this file's subject can be wrong
       about the game rather than about itself. */
    const rounds = (done.run.playoffs && done.run.playoffs.rounds) || [];
    ok(rounds.length > 0, `the run kept its bracket (${rounds.length} rounds)`);
  }

  head('8. the play-in sits opposite the seat it fills');
  /*
   * A round is a centred list and the play-in is not a round. Every other
   * column holds a whole round, where centring the group is right; the
   * play-in is ONE game feeding ONE named seat, and centred it floated clear
   * of the first round pairing it fills. Measured at 390x844 before the fix:
   * the box at 306 against a target at 259, with the TBD it is about sitting
   * on the line above it.
   *
   * IT HAS TO GO LOOKING FOR A PLAY-IN RUN. About half of runs that reach the
   * postseason take a bye, so a single walk is a coin toss on whether the
   * column exists to be wrong about, which is this repo's own note about a
   * check reporting its own seed.
   */
  {
    const pip = await newPage(browser, boom);
    await boot(pip);
    let geo = null, tries = 0;
    for (; tries < 14 && !geo; tries++) {
      if (!(await toPlayoffs(pip))) {
        await pip.evaluate(() => { const h = document.querySelector('#b-home'); if (h) h.click(); });
        await pip.waitForSelector('#b-start', { state: 'attached', timeout: 10000 });
        await pip.waitForTimeout(120);
        continue;
      }
      /* The alignment runs on a frame after the screen is shown. */
      await pip.waitForTimeout(400);
      const read = await pip.evaluate(() => {
        const cols = [...document.querySelectorAll('#brk-rail .brk-col')];
        if (!cols.length || !/play-in/i.test(cols[0].querySelector('.brk-h').textContent)) return null;
        const box = cols[0].querySelector('.brk-g');
        if (!box || !cols[1]) return null;
        const seed = Number((box.querySelector('.sd') || {}).textContent || 0);
        const b = box.getBoundingClientRect();
        return {
          seed,
          pinned: cols[0].classList.contains('pin'),
          top: Math.round(b.top),
          firsts: [...cols[1].querySelectorAll('.brk-g')].map((g) => {
            const r = g.getBoundingClientRect();
            return { top: Math.round(r.top),
              seeds: [...g.querySelectorAll('.sd')].map((s) => Number(s.textContent || 0)),
              /* The seat the play-in fills is the one still waiting. */
              waiting: !!g.querySelector('.brk-t.tbd') };
          }),
        };
      });
      if (read) geo = read;
      else {
        await pip.evaluate(() => { const h = document.querySelector('#b-home'); if (h) h.click(); });
        await pip.waitForSelector('#b-start', { state: 'attached', timeout: 10000 });
        await pip.waitForTimeout(120);
      }
    }

    ok(!!geo, `a play-in run was found to look at (${tries} runs)`);
    if (geo) {
      ok(geo.pinned, 'the play-in column is marked as the one that anchors');
      /* THE TARGET IS THE SEAT THAT IS WAITING, not the one holding a seed.
         Matching on the play-in seed was the first draft and it found the
         WRONG GAME: the winner is the 7 seed, and until the play-in resolves
         the near side draws that seat as TBD while the FAR conference has a
         real 7 in its own 2/7 pairing. It reported 378 against 680 and blamed
         a page that was correct. Exactly one first round pairing is waiting
         on somebody, and it is this one. */
      const waiting = geo.firsts.filter((g) => g.waiting);
      is(waiting.length, 1, 'exactly one first round seat is waiting on the play-in');
      const target = waiting[0];
      if (target) {
        ok(Math.abs(target.top - geo.top) <= 2,
          `the play-in box is level with that pairing (${geo.top} against ${target.top})`);
        /* COVERAGE. A layout where the target happened to be the middle of
           the column would pass the line above with the anchor deleted,
           because centred is where the box already was. */
        const tops = geo.firsts.map((g) => g.top);
        const mid = (Math.min.apply(null, tops) + Math.max.apply(null, tops)) / 2;
        ok(Math.abs(mid - target.top) > 8,
          `and centring really would have missed it (middle ${Math.round(mid)})`);
      }
    }
    await pip.context().close();
  }

  ok(boom.length === 0, 'nothing threw and the console stayed clean\n      '
    + boom.slice(0, 4).join('\n      '));
  await browser.close();
  report();
  process.exit(failures.length ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
