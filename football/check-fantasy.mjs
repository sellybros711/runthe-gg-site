/*
 * check-fantasy.mjs : Fantasy Challenge, in a real browser.
 *
 *   node football/check-fantasy.mjs
 *   node football/check-fantasy.mjs --quick   the engine half, no browser
 *
 * WHY THIS EXISTS, and it is the same sentence as every other checker in this directory:
 * nothing here throws when it is wrong.
 *
 *   A draft that strands renders an empty board and waits for ever.
 *   A projection that does not add up is six numbers and a seventh that is simply wrong.
 *   A door built for the public before the mode is finished looks exactly like a door.
 *   A wheel that re-rolls on reload is a wheel with unlimited spins, and the only symptom
 *     is that somebody's lineup is better than it should be.
 *
 * THE MODE IS NOT LAUNCHED. fantasy-access.js ships FANTASY_LIVE = false, so the door is
 * built for a tester and for nobody else, and the FIRST section asserts exactly that, in
 * both directions. It is the only one of the three access files still deciding anything,
 * so it is the only one whose gate can currently cost a reader a mode they should have.
 *
 * THE AUTH IS STUBBED AND THE ACCESS FILE IS NOT. The sandbox has no account, so a real
 * sign-in is not available, but the question here is what the PAGE does with an answer.
 * So auth.js is replaced with a stub that reports a chosen account and the real
 * fantasy-access.js is served untouched: the gate under test is the shipped one.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';
const QUICK = process.argv.includes('--quick');

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};

const D = (await import('./fantasy/draft.js')).default;
const ACCESS = (await import('./fantasy-access.js')).default;
const NOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data/fantasy_now.json'), 'utf8'));
const POOL = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data', NOW.file), 'utf8'));

/* ================================================================
   THE FLAG, AND THE LIST THAT GOES WITH IT
   ================================================================ */
console.log('THE MODE IS GATED, AND THE GATE IS READ OFF DISK');
{
  const src = fs.readFileSync(path.join(ROOT, 'football/fantasy-access.js'), 'utf8');
  /* Asserted in either position, the way Full Team's launch line is. Flipping it opens an
     unfinished mode to everybody, so it should be a decision rather than a merge. */
  ok('fantasy-access.js ships FANTASY_LIVE = false', /FANTASY_LIVE = false/.test(src));
  ok('  and no email address is in it, which is the file\'s own rule',
    !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(src.replace(/runthe\.gg\/football\/fantasy-access\.js/g, '')));
  ok('  a tester is allowed', ACCESS.allowed({ name: ACCESS.TESTERS[0], userId: null }));
  ok('  and a stranger is not', !ACCESS.allowed({ name: 'nobody-at-all', userId: 'x' }));
  ok('  and so is nobody at all', !ACCESS.allowed(null));
}

/* ================================================================
   THE WEEK ON DISK IS A WEEK THAT CAN BE DRAFTED
   ================================================================ */
console.log('\nTHE POOL IS A BOARD, NOT A FILE THAT PARSES');
{
  ok('fantasy_now.json points at a pool that exists', !!POOL.pool && POOL.pool.length > 0,
    `${POOL.season} week ${POOL.week}, ${POOL.pool ? POOL.pool.length : 0} men`);
  ok('  it locks at a real instant', Number.isFinite(Date.parse(POOL.locks_at || '')),
    POOL.locks_at);
  /* EVERY SLOT HAS TO BE FILLABLE OR THE MODE CANNOT BE PLAYED AT ALL. A pool missing one
     position renders perfectly and strands every draft at the same spin. */
  for (const pos of [...new Set(D.SLOTS)]) {
    const n = POOL.pool.filter((p) => p.position === pos).length;
    ok(`  ${pos}: enough men to fill a board`, n >= D.DRAW, `${n} men`);
  }
  /* The cap has to cover the cheapest legal lineup with room to make a choice, or the
     reserve floor eats every board and the wheel picks the team. */
  const floor = D.reserveAfter(POOL.pool, -1);
  ok('  the cap clears the reserve floor with real room', D.CAP_MUSD > floor * 2,
    `floor $${floor.toFixed(1)}M against a $${D.CAP_MUSD}M cap`);
  /* NOBODY IS PRICED ABOVE THE CAP, which would be a man on the board who can never be
     signed: he would be offered, refused and there would be nothing on screen to say why. */
  const over = POOL.pool.filter((p) => p.price_musd > D.CAP_MUSD - floor);
  ok('  and nobody on the board is unsignable', !over.length,
    over.length ? over.slice(0, 3).map((p) => p.name).join(', ') : 'all reachable');

  /* THE WHEEL REACHES AS FAR AS THE LEAGUE STARTS, AND THE CLAIM IS THE RULE, NOT A NUMBER.
     A depth pinned at 40 would be the whole quarterback position and a quarter of the
     receivers, so two of five quarterback offers were men who will not play. Asserted as
     the property (never past what the league starts, never more than the ceiling) so the
     next pool shape is covered without anybody re-deriving it. */
  const clubs = D.clubsIn(POOL.pool);
  ok('  the wheel reads the week\'s own club count', clubs === POOL.clubs_playing,
    clubs + ' against ' + POOL.clubs_playing);
  for (const pos of [...new Set(D.SLOTS)]) {
    const starts = D.SLOTS.filter((s) => s === pos).length;
    const got = D.depthFor(POOL.pool, pos);
    ok(`  ${pos}: the wheel reaches ${got}`,
      got === Math.min(D.DEPTH, clubs * starts) && got >= D.DRAW,
      `${starts} a club x ${clubs} clubs, capped at ${D.DEPTH}`);
  }
}

/* ================================================================
   A DRAFT ALWAYS FINISHES, AND NEVER OVER THE CAP
   ================================================================ */
console.log('\nA DRAFT ALWAYS FINISHES');
{
  /* Three ways of drafting, because a strand is a property of how the money was spent and
     a bot that never spends cannot find one. GREEDY is the one that can: it is the way to
     run out of money, and it is also what a player who likes the best name does. */
  const BOTS = {
    greedy: (b) => b[0],
    thrifty: (b) => b[b.length - 1],
    random: (b, rnd) => b[Math.floor(rnd() * b.length)],
  };
  let stranded = 0, over = 0, short = 0, runs = 0, worst = 0;
  for (const name of Object.keys(BOTS)) {
    for (let r = 0; r < 400; r++) {
      const c = { seed: (r * 2654435761 + name.length) >>> 0, men: [] };
      const rnd = D.rngOf(c.seed ^ 0x5bf03635);
      for (let i = 0; i < D.SLOTS.length; i++) {
        const board = D.boardFor(POOL.pool, c, i);
        if (!board.length) { stranded++; break; }
        /* EVERY MAN OFFERED MUST BE SIGNABLE. An offer the cap cannot take is a button that
           does nothing, which is worse than no button. */
        const left = D.CAP_MUSD - D.spent(c);
        for (const m of board) if (m.price_musd > left + 1e-9) over++;
        c.men.push(BOTS[name](board, rnd));
      }
      runs++;
      if (c.men.length < D.SLOTS.length) { short++; continue; }
      worst = Math.max(worst, D.spent(c));
      if (D.spent(c) > D.CAP_MUSD + 1e-9) over++;
      /* THE SIX ARE SIX DIFFERENT MEN. Both running back slots draw from the same pool, so
         without the exclusion the same man fills them both and the lineup is illegal in a
         way nothing on the screen would show. */
      const ids = new Set(c.men.map((m) => m.player_id));
      if (ids.size !== D.SLOTS.length) short++;
    }
  }
  ok(`${runs} drafts, three ways, none stranded`, !stranded, `${stranded} stranded`);
  ok('  every one finished with six different men', !short, `${short} did not`);
  ok('  and nothing was ever offered or signed over the cap', !over,
    `worst spend $${worst.toFixed(1)}M of $${D.CAP_MUSD}M`);
}

/* ================================================================
   THE ONE NUMBER HAS TO BE THE SIX ADDED UP
   ================================================================ */
console.log('\nTHE PROJECTION IS THE SIX, ADDED UP');
{
  /* This is the football game's box score rule in one line: the mode shows exactly one
     number about the future, so the only property it must have is that it is the parts.
     Asserted over real drafts rather than on a fixture, because rounding is where an
     identity like this comes apart. */
  let bad = 0, n = 0;
  for (let r = 0; r < 300; r++) {
    const c = { seed: (r * 40503 + 7) >>> 0, men: [] };
    const rnd = D.rngOf(c.seed);
    for (let i = 0; i < D.SLOTS.length; i++) {
      const board = D.boardFor(POOL.pool, c, i);
      if (!board.length) break;
      c.men.push(board[Math.floor(rnd() * board.length)]);
    }
    if (!D.full(c)) continue;
    n++;
    const sum = c.men.reduce((t, m) => t + m.proj, 0);
    if (Math.abs(D.projected(c) - sum) > 0.051) bad++;
  }
  ok(`${n} lineups: the projected total is the six projections`, !bad && n > 0, `${bad} off`);
  /* AND THE SLOTS ARE THE SLOTS. A lineup whose men do not match the shape is a lineup that
     would be scored against a different game. */
  ok('  the shape is QB, RB, RB, WR, WR, TE', D.SLOTS.join(',') === 'QB,RB,RB,WR,WR,TE',
    D.SLOTS.join(','));
}

/* ================================================================
   THE SAME SEED IS THE SAME BOARD
   ================================================================ */
console.log('\nA RELOAD CANNOT RE-ROLL THE WHEEL');
{
  /* THE WHOLE POINT OF STORING A SEED. If a board were drawn fresh on every paint, a player
     who did not like their five men would press reload until they did, and five chances
     would be as many as they had patience for. Nothing about that is visible: the board
     renders, the draft finishes, the lineup is legal. */
  const c = { seed: 123456789, men: [] };
  const a = D.boardFor(POOL.pool, c, 0).map((m) => m.player_id).join(',');
  const b = D.boardFor(POOL.pool, c, 0).map((m) => m.player_id).join(',');
  ok('the same chance, asked twice, offers the same men', a === b && a.length > 0);
  const other = D.boardFor(POOL.pool, { seed: 987654321, men: [] }, 0)
    .map((m) => m.player_id).join(',');
  ok('  and a different chance does not', a !== other);
  /* Proving the check has teeth: a board that ignored the seed would pass the first
     assertion by accident only if it were constant, which the second rules out. */
  const after = D.boardFor(POOL.pool, { seed: 123456789, men: [POOL.pool[0]] }, 0)
    .map((m) => m.player_id).join(',');
  ok('  and signing somebody changes what is left', after !== a);
}

if (QUICK) {
  console.log(fails ? `\n${fails} FAILED` : '\nall good (engine only)');
  process.exit(fails ? 1 : 0);
}

/* ================================================================
   THE BROWSER HALF
   ================================================================ */
let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('\nPlaywright is not available here, so the browser half cannot run.');
  console.log(fails ? `\n${fails} FAILED` : '\nall good (engine only)');
  process.exit(fails ? 1 : 0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2' };

/* The auth stub. `who` is null for a signed out visitor. It fires a change the way the real
   one does, because the page waits for that rather than reading state() once: a gate that
   read immediately would flash the shut screen at every tester. */
const authStub = (who) => `
  (function(){
    var s = ${JSON.stringify(who)};
    var ls = [];
    window.PS_AUTH = {
      boot: function(){ setTimeout(function(){
        ls.forEach(function(f){ try{ f(state()); }catch(e){} }); }, 30); return true; },
      state: state,
      onChange: function(f){ ls.push(f); return function(){}; },
    };
    function state(){
      return { ready:true, signedIn:!!s, userId: s&&s.userId, name: s&&s.name };
    }
  })();`;

async function openPage(browser, url, opts = {}) {
  const { who = null, viewport = { width: 390, height: 844 }, at = null,
    results = null, storage = null } = opts;
  const page = await browser.newPage({ viewport });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  /* Pinning the clock is how the lock gets tested at all: the shipped week is in the future
     or it is not, and a checker that only works before Thursday is a checker that starts
     failing on Thursday for the wrong reason. */
  if (at != null) {
    await page.addInitScript(`(function(){
      var real = Date.now, off = ${at} - real();
      Date.now = function(){ return real() + off; };
    })();`);
  }
  /* EACH newPage() GETS ITS OWN CONTEXT AND THEREFORE ITS OWN localStorage, which is worth
     knowing before writing any walk here that spans two pages: a lineup submitted on one is
     simply not there on the next, and the symptom is the second page sitting on the home
     screen for ever waiting for an entry it never had. So an entry is carried across by
     hand, which is also the honest fixture: it is the same bytes the first page wrote. */
  if (storage) {
    await page.addInitScript(`(function(){
      try { localStorage.setItem(${JSON.stringify(storage.key)},
        ${JSON.stringify(storage.value)}); } catch(e){}
    })();`);
  }
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    /* auth.js is the ONE file swapped. fantasy-access.js is served exactly as it ships. */
    if (rel === '/football/auth.js') {
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: authStub(who) });
    }
    /* THE RESULTS FILE IS FABRICATED AND NOT BUILT, for two reasons. The real build needs
       nflverse, so a checker that called it would need the network; and a week nobody
       drafted has no business sitting in the repo as 47KB of dead data just to be a
       fixture. What is under test here is what the PAGE does with an answer.
       A MISS IS SERVED AS A 404, deliberately: that is the state the page spends most of
       its life in, and a route that answered `{}` instead would never exercise it. */
    if (/^\/football\/data\/results_/.test(rel)) {
      if (!results) return r.fulfill({ status: 404, body: 'no' });
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(results) });
    }
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    await r.fulfill({ status: 200,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream',
      body: fs.readFileSync(f) });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, boom };
}

const TESTER = { name: ACCESS.TESTERS[0], userId: null };
const STRANGER = { name: 'somebody-else', userId: '00000000-0000-0000-0000-000000000000' };
const FANTASY = 'http://local.test/football/fantasy/';
const BEFORE = Date.parse(POOL.locks_at) - 36 * 3600 * 1000;
const AFTER = Date.parse(POOL.locks_at) + 60 * 1000;

const browser = await pw.chromium.launch({ executablePath: CHROME });
const screenOn = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','));

/* ---------------------------------------------------------------- */
console.log('\nTHE GATE HAS THREE ANSWERS AND THEY ARE THREE DIFFERENT SENTENCES');
const said = {};
for (const [label, who, want] of [
  ['a tester gets the mode', TESTER, 's-home'],
  ['a signed in stranger does not', STRANGER, 's-shut'],
  ['a signed out visitor does not', null, 's-shut'],
]) {
  const { page, boom } = await openPage(browser, FANTASY, { who, at: BEFORE });
  await page.waitForFunction(() => !document.getElementById('s-load').classList.contains('on'),
    null, { timeout: 15000 }).catch(() => {});
  const on = await screenOn(page);
  ok(label, on === want, on + (boom.length ? ' | ' + boom.join(' | ') : ''));
  ok('  and nothing threw', !boom.length, boom.join(' | ') || 'clean');
  said[label] = await page.evaluate(() => document.getElementById('shut-say').textContent.trim());
  await page.close();
}
/* A blank box is how a feature teaches somebody it is broken, and one message for two
   different situations tells half the readers to go and do something that will not help.
   The commissioner standings' own lesson, arriving here. */
const shut = Object.values(said).filter(Boolean);
ok('  the two refusals say different things', new Set(shut).size === shut.length,
  shut.join(' || '));

/* ---------------------------------------------------------------- */
console.log('\nA WHOLE ENTRY, DRIVEN');
{
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: BEFORE });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });

  /* One helper for one draft, pressing the page's own buttons throughout. Nothing here
     reaches into state: the claim is about what a player can do with a thumb. */
  const draftOne = async () => {
    for (let i = 0; i < D.SLOTS.length; i++) {
      await page.waitForSelector('#d-men .man', { timeout: 10000 });
      const n = await page.locator('#d-men .man').count();
      if (!n) throw new Error('empty board at slot ' + i);
      await page.locator('#d-men .man').nth(i % n).click();
    }
  };

  await page.click('#b-draft');
  await page.waitForSelector('#s-draft.on', { timeout: 10000 });
  await draftOne();
  await page.waitForSelector('#s-review.on', { timeout: 10000 });
  ok('six picks lands on the review screen', true);

  /* THE RELOAD TEST IS DRIVEN THROUGH THE PAGE, not through draft.js, because the property
     that matters is that what is STORED is enough to rebuild the board. A seed kept only in
     a variable passes every engine assertion above and re-rolls on the next visit. */
  await page.click('#b-more');
  await page.waitForSelector('#s-draft.on', { timeout: 10000 });
  const before = await page.locator('#d-men .man .who b').allTextContents();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  await page.waitForSelector('#s-draft.on', { timeout: 10000 });
  const after = await page.locator('#d-men .man .who b').allTextContents();
  ok('  a reload mid draft comes back to the same board',
    before.length > 0 && before.join('|') === after.join('|'),
    before.join(', ') + '  ->  ' + after.join(', '));

  /* Fill the rest of the five. */
  for (let c = 1; c < D.CHANCES; c++) {
    await page.waitForSelector('#s-draft.on', { timeout: 10000 });
    await draftOne();
    await page.waitForSelector('#s-review.on', { timeout: 10000 });
    if (c < D.CHANCES - 1) await page.click('#b-more');
  }
  const five = await page.locator('#r-five .lineup').count();
  ok(`  all ${D.CHANCES} chances are drafted and shown together`, five === D.CHANCES, five + '');
  ok('  and there is no sixth', await page.locator('#b-more').isHidden());

  /* SUBMIT IS REFUSED UNTIL A LINEUP IS CHOSEN. Submitting nothing is not a state this mode
     has, and a live button that does nothing is the worst version of that. */
  ok('  submit is refused until one is picked', await page.locator('#b-submit').isDisabled());
  const proj = await page.locator('#r-five .lineup').nth(2).locator('.pj').innerText();
  await page.locator('#r-five .lineup').nth(2).click();
  ok('  and live once one is', !(await page.locator('#b-submit').isDisabled()));
  await page.click('#b-submit');
  await page.waitForSelector('#s-in.on', { timeout: 10000 });
  const shown = await page.locator('#in-proj').innerText();
  /* THE NUMBER ON THE RECEIPT IS THE NUMBER ON THE LINEUP THAT WAS CHOSEN. Two screens
     computing one figure is exactly where a mode ends up disagreeing with itself. */
  ok('  the submitted screen shows the chosen lineup\'s own projection',
    shown.trim() === proj.split('\n')[0].trim(), shown.trim() + ' against ' + proj.trim());
  ok('  and it names six men', await page.locator('#in-roster .rrow').count() === 6);
  /* SAID PLAINLY. There is no server yet, and a screen that let somebody believe they had
     entered a competition would be the one dishonest thing on it. */
  const note = await page.locator('#in-note').innerText();
  ok('  and it says the lineup is only in this browser', /browser/i.test(note), note.trim());

  /* A RETURN VISIT SHOWS THE ENTRY RATHER THAN OFFERING ANOTHER. */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-in.on', { timeout: 15000 });
  ok('  and coming back lands on the entry, not on a fresh draft', true);
  ok('  nothing threw through any of it', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ---------------------------------------------------------------- */
console.log('\nAND THEN THE WEEK IS SCORED');
{
  /* One entry, drafted and submitted, then the same page reopened with a results file in
     place. The claim is that the six men are described the same way either side of the
     games and that the total is the parts. */
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: BEFORE });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  for (let i = 0; i < D.SLOTS.length; i++) {
    await page.waitForSelector('#d-men .man', { timeout: 10000 });
    await page.locator('#d-men .man').first().click();
  }
  await page.waitForSelector('#s-review.on', { timeout: 10000 });
  await page.locator('#r-five .lineup').first().click();
  await page.click('#b-submit');
  await page.waitForSelector('#s-in.on', { timeout: 10000 });
  const entry = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^ps_fantasy_/.test(k));
    return { key, value: localStorage.getItem(key) };
  });
  const mine = JSON.parse(entry.value).chances[JSON.parse(entry.value).submitted].ids;
  ok('a lineup was submitted', mine.length === D.SLOTS.length, mine.length + ' men');
  const projected = Number((await page.locator('#in-proj').innerText()).trim());
  await page.close();

  /* FIVE OF THE SIX SCORE AND ONE DOES NOT, which is the case the screen has to get right:
     a man who never took the field is a zero AND a sentence, not a blank. */
  const scores = {};
  const want = [22.4, 17.1, 9.9, 4.3, 0.5];
  mine.slice(0, 5).forEach((id, i) => { scores[id] = [want[i], '100 yds, 1 TD']; });
  const total = Math.round(want.reduce((t, x) => t + x, 0) * 10) / 10;
  const RES = { season: POOL.season, week: POOL.week, final: true, games: 16, played: 16,
    scores };

  const back = await openPage(browser, FANTASY,
    { who: TESTER, at: Date.parse(POOL.locks_at) + 4 * 86400000, results: RES,
      storage: entry });
  await back.page.waitForSelector('#s-in.on', { timeout: 15000 });
  await back.page.waitForFunction(() =>
    document.getElementById('in-head').textContent.trim() === 'How it went',
  null, { timeout: 10000 }).catch(() => {});
  const got = await back.page.evaluate(() => ({
    head: document.getElementById('in-head').textContent.trim(),
    lab: document.getElementById('in-lab').textContent.trim(),
    big: document.getElementById('in-proj').textContent.trim(),
    vs: document.getElementById('in-vs').textContent.trim(),
    vsShown: !document.getElementById('in-vs').hidden,
    rows: [...document.querySelectorAll('#in-roster .rrow')].map((r) => ({
      name: r.querySelector('.rn').textContent,
      pts: r.querySelector('.rs') ? r.querySelector('.rs').textContent.trim() : null,
    })),
  }));
  ok('coming back to a scored week shows the result', got.head === 'How it went'
    && got.lab === 'Half PPR', got.head + ' / ' + got.lab);
  /* THE TOTAL IS THE PARTS, which is the one property this screen must have. The football
     box score's rule, arriving at a lineup. */
  ok('  the big number is the six added up', Number(got.big) === total,
    got.big + ' against ' + total);
  ok('  and it names all six', got.rows.length === D.SLOTS.length, got.rows.length + '');
  ok('  every row carries what he scored', got.rows.every((r) => r.pts !== null),
    got.rows.map((r) => r.pts).join(', '));
  /* A MAN WITH NO ROW IN THE RESULTS SCORED ZERO AND IS SAID TO HAVE NOT PLAYED. Read as
     unknown he would be left out, and the lineup would quietly total five men. */
  const missing = got.rows.filter((r) => r.pts === '0.0');
  ok('  the man who did not play is 0.0 and says so', missing.length === 1
    && /did not play/i.test(missing[0].name),
    missing.length + ' at zero: ' + missing.map((r) => r.name).join(' | '));
  /* THE PROJECTION STAYS ON SCREEN. A score with nothing to measure it against says
     nothing about whether the draft was any good. */
  ok('  the projection is still shown beside it', got.vsShown
    && got.vs.indexOf(projected.toFixed(1)) >= 0, got.vs);
  ok('  nothing threw', !back.boom.length, back.boom.join(' | ') || 'clean');
  await back.page.close();

  /* AND AN UNSCORED WEEK IS UNCHANGED. The fetch misses most of the time, so the state the
     page is in for four days of every week is the one worth asserting did not move. */
  const pre = await openPage(browser, FANTASY,
    { who: TESTER, at: BEFORE, storage: entry });
  await pre.page.waitForSelector('#s-in.on', { timeout: 15000 });
  await pre.page.waitForTimeout(1500);
  const before = await pre.page.evaluate(() => ({
    head: document.getElementById('in-head').textContent.trim(),
    big: document.getElementById('in-proj').textContent.trim(),
    vsShown: !document.getElementById('in-vs').hidden,
  }));
  ok('a week with no results file still reads as an entry', before.head === 'You are in'
    && !before.vsShown && Number(before.big) === projected,
    before.head + ' / ' + before.big);
  ok('  nothing threw', !pre.boom.length, pre.boom.join(' | ') || 'clean');
  await pre.page.close();
}

/* ---------------------------------------------------------------- */
console.log('\nTHE WEEK LOCKS AT THE FIRST KICKOFF');
{
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: AFTER });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  ok('after kickoff the draft button is gone', await page.locator('#b-draft').isHidden());
  const lock = await page.locator('#home-lock').innerText();
  ok('  and the rail says so rather than counting down', /lock/i.test(lock), lock.trim());
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ---------------------------------------------------------------- */
console.log('\nTHE BOARD FITS A PHONE');
{
  /* MEASURED AGAINST A PHONE AND NOT AGAINST THE HARNESS WINDOW, which is the trap the live
     board's call box fell into: 390x900 is not a handset, and 740 is the short one worth
     supporting. The deepest thing a thumb has to reach is the fifth man on the board. */
  const { page } = await openPage(browser, FANTASY,
    { who: TESTER, at: BEFORE, viewport: { width: 360, height: 740 } });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  await page.waitForSelector('#d-men .man', { timeout: 10000 });
  const box = await page.locator('#d-men .man').last().boundingBox();
  ok('the fifth man on the board is on screen at 360x740', box && box.y + box.height <= 740,
    box ? `bottom ${Math.round(box.y + box.height)}` : 'no box');
  /* A row whose name pushed the price off the end would still measure fine vertically. */
  const wide = await page.evaluate(() => {
    const el = document.querySelector('#d-men');
    return el.scrollWidth - el.clientWidth;
  });
  ok('  and no row overflows sideways', wide <= 1, wide + 'px over');
  await page.close();
}

/* ---------------------------------------------------------------- */
console.log('\nTHE DOOR IS BUILT FOR A TESTER AND FOR NOBODY ELSE');
for (const [label, who, want] of [
  ['a tester gets the door', TESTER, true],
  ['a signed in stranger does not', STRANGER, false],
  ['a signed out visitor does not', null, false],
]) {
  const { page, boom } = await openPage(browser, 'http://local.test/football/',
    { who, at: BEFORE });
  await page.waitForTimeout(5000);
  const got = await page.evaluate(() => {
    const el = document.getElementById('b-fantasy');
    if (!el) return { there: false };
    /* WHERE IT SITS, not just that it exists. Appended to the group it landed UNDER the
       "Unlock everything" card, because that card is inserted into the same container by a
       builder that runs afterwards, so the offer ended up in the middle of the list of
       modes with one door stranded below it. Compared by document position rather than by
       index, because the group's contents depend on who is looking. */
    const card = document.getElementById('b-premium');
    const after = card
      ? !!(el.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
    return { there: true, tag: el.tagName, href: el.getAttribute('href'),
      shown: !!(el.offsetWidth || el.offsetHeight),
      aboveStore: after,
      underlined: getComputedStyle(el).textDecorationLine };
  });
  ok(label, got.there === want, JSON.stringify(got));
  if (want) {
    /* AN ANCHOR, because it goes to another page and middle click has to work. */
    ok('  it is a link and it points at the mode', got.tag === 'A' && got.href === '/football/fantasy/',
      got.tag + ' ' + got.href);
    ok('  it is visible', got.shown);
    /* null means this reader is not shown the store at all, which is a fine answer and not
       a pass by default: the claim is only about a page that has both. */
    ok('  and it is with the other mode doors, above the store card',
      got.aboveStore !== false, 'store card ' + (got.aboveStore === null ? 'not drawn'
        : (got.aboveStore ? 'below it' : 'ABOVE it')));
    /* .btn and .hp-full were both written for <button>, so neither turns the browser's own
       underline off, and the underline is the only thing that gives an anchor away here. */
    ok('  and it does not wear the browser\'s underline', got.underlined === 'none',
      got.underlined);
  }
  ok('  the game still boots', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
