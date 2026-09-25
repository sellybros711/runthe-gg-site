/*
 * check-board.mjs - the leaderboard, in a real browser, in every state it has.
 *
 *   node hoops/check-board.mjs
 *
 * WHY THIS IS A BROWSER WALK AND NOT AN ASSERTION ON board.js.
 * supabase/test/hoops_board_test.sql already proves the server refuses an
 * incoherent run, and it proves it against a real Postgres. What no SQL can
 * see is the join: whether the page sends the run it is looking at, asks about
 * the board that run is on, and says something true when the answer does not
 * come back. Every one of those fails SILENTLY, because the whole client fails
 * soft by design: a null is the ordinary answer on a project that has not run
 * the migration, so a page that asked the wrong question would print exactly
 * what a healthy page with nobody on the board prints.
 *
 * NOTHING EVER REACHES THE REAL PROJECT. Every request to the Supabase host is
 * intercepted and answered by the stand-in below, and the supabase-js CDN is
 * refused outright in the walks that are not about accounts. A board checker
 * that could write to the live table would put its own fixtures on the real
 * leaderboard.
 *
 * CONTENT-RANGE IS NOT A CORS-SAFELISTED RESPONSE HEADER, and that cost an
 * hour the first time. PostgREST returns the exact count there, and a
 * cross-origin reply that does not name it in Access-Control-Expose-Headers
 * hands the page a response whose header JavaScript cannot read. countOf()
 * then answers null, every count comes back as "no opinion", and the standing
 * reports the board unreachable while the LIST beside it renders perfectly: a
 * harness fault that looks exactly like the defect this file is written to
 * catch. A real Supabase project exposes it. So does CORS below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = '/opt/node22/lib/node_modules/playwright/index.js';

/* HOW MANY MEN A DRAFT SIGNS, read out of the engine rather than written. It
   was a literal 6 in the draft loop, which is the class of thing that makes a
   walk quietly stop drafting a whole roster the day the roster size moves: the
   loop signs six on a five man game, the sixth press lands on a screen that is
   no longer the draft, and the failure it reports is about whatever that
   screen happens to be. */
const ROSTER_SIZE = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'hoops', 'engine.js'), 'utf8');
  const m = /const SLOTS = \[([^\]]*)\]/.exec(src);
  if (!m) throw new Error('could not read SLOTS out of engine.js');
  return m[1].split(',').filter(x => x.trim()).length;
})();

let pass = 0;
const failures = [];
const ok = (cond, what) => { if (cond) pass++; else failures.push(what); };
const is = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${what}\n      expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range,content-length',
};

/* ── the stand-in ──────────────────────────────────────────────────────────
 * One object so a walk can move it between states mid-run, which is how the
 * three empty states are reached without three page loads. */
const stub = {
  mode: 'rows',          // rows | empty | down | nomigration
  rows: [],
  calls: [],
  bodies: [],
  yourId: 4242,
};

function fakeRow(i, o = {}) {
  const wins = o.wins ?? (70 - i);
  return {
    id: o.id ?? (1000 + i), created_at: '2026-09-18T12:00:00Z',
    display_name: o.name || ('player' + i),
    run_mode: o.mode || 'league', lock_key: o.key ?? null, daily_day: o.day ?? null,
    wins, losses: 82 - wins, games: 82, playoff_wins: o.po ?? 0,
    depth: o.ring ? 6 : 2 + (o.po ?? 0),
    made_playoffs: true, title_won: !!o.ring, beat_record: wins >= 72, is_goat: wins >= 74,
    seed_label: 'Top six seed', point_diff: 5.5, rating: o.rating ?? (80 - i),
    ortg: 118, drtg: 112, chemistry: 1.4, structure_mult: 1.02, archetype: 'Triangle',
    spend_musd: 120, respins: 0, all_time_rank: 50 + i,
    picks: o.picks || [], slots: o.slots || [],
  };
}

async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());

  if (u.hostname === 'cdn.jsdelivr.net') {
    /* Accounts are refused in every walk here. They are a separate surface
       with its own states, and letting the real library load would put a live
       auth client and a real network request into a board test. */
    return route.abort();
  }

  if (u.hostname === 'board.test') {
    stub.calls.push(u.pathname + u.search);
    if (req.method() === 'POST') {
      try { stub.bodies.push({ path: u.pathname, body: JSON.parse(req.postData() || '{}') }); }
      catch (e) { stub.bodies.push({ path: u.pathname, body: null }); }
    }
    const json = (status, body, extra) => route.fulfill({
      status, contentType: 'application/json',
      headers: Object.assign({}, CORS, extra || {}), body,
    });
    if (stub.mode === 'down') return json(503, JSON.stringify({ message: 'service unavailable' }));
    if (stub.mode === 'nomigration') {
      return json(404, JSON.stringify({ message: 'relation "public.rtf_runs" does not exist' }));
    }
    if (u.pathname.endsWith('/rtf_submit_run')) return json(200, String(stub.yourId));
    if (u.pathname.endsWith('/rtf_claim_run')) return json(200, 'true');
    if (u.pathname.endsWith('/rtf_board_modes')) return json(200, '[]');

    const wantsCount = (req.headers()['prefer'] || '').includes('count=exact');
    const empty = stub.mode === 'empty';
    if (wantsCount) {
      /* Two different counts behind one shape: how many are AHEAD of this run
         (the score=gt. query) and how many there are at all. */
      const ahead = u.search.includes('score=gt.') || u.search.includes('rating=gt.');
      const n = empty ? 0 : (ahead ? 40 : 312);
      return json(200, '[]', { 'content-range': '0-0/' + n });
    }
    return json(200, JSON.stringify(empty ? [] : stub.rows));
  }

  if (u.hostname !== 'local.test') return route.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return route.abort();
  await route.fulfill({ status: 200,
    contentType: TYPES[path.extname(f)] || 'application/octet-stream',
    body: fs.readFileSync(f) });
}

async function newPage(browser, boom) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 220)));
  page.on('console', (m) => {
    /* The deliberate 503 and 404 below are this file's own doing, and the
       refused CDN is too. Anything else from the console is the page. */
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::|Failed to load resource/.test(t)) return;
    boom.push('console: ' + t.slice(0, 200));
  });
  await page.route('**/*', serve);
  await page.addInitScript(() => { window.RTF_BOARD_URL = 'http://board.test'; });
  return page;
}

async function boot(page) {
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await page.waitForTimeout(250);
}

/* Draft best-available and play it out. The page is the only thing that knows
   how, so this presses what a player presses rather than calling run.js. */
/* HOW MANY ARE SIGNED, read out of the SAVED RUN and not off the screen.
   The draft board is rebuilt on every spin and its tiles are held back behind
   `visibility:hidden` while the reels turn, so counting DOM nodes answers
   "has the reel finished" as often as it answers "did that signing land".
   The run is written to storage on every state change and is the only thing
   here that cannot be mid-animation. */
const signedCount = (page) => page.evaluate(() => {
  try {
    const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
    return r && Array.isArray(r.roster) ? r.roster.length : -1;
  } catch (e) { return -1; }
});

async function playRun(page, opener) {
  await opener();
  for (let i = 0; i < ROSTER_SIZE; i++) {
    /* A FIXED WAIT BETWEEN PICKS IS A RACE, and so is waiting on the ROSTER
       alone, which is what the second draft of this did. The roster grows
       INSIDE sign(), and sign() spins the next board a beat later
       (setTimeout(spin, 240)), so a wait that fires on the roster returns
       while the board on screen is still the one just signed from. The next
       pass then clicks a tile off a board that is about to be replaced, two
       signings land against one draw, and the draft stalls with an empty
       board and no way on but the Spin button. Reproducing that took a while
       precisely because a slower loop never hits it.

       So the wait is for the NEXT BOARD to be up and readable: the roster has
       grown, there is a fresh draw, and the tiles are out of `pending`. On
       the LAST pick there is no next board, because the draft is over. */
    try {
      /* :not(.pending) IS LOAD-BEARING AND IT IS NOT BELT AND BRACES.
         `.opts.pending` hides the tile's CHILDREN and sets pointer-events
         none on the tile, so the tile itself is a visible box with a size and
         waitForSelector's own visibility test passes on a board that is still
         mid-spin. A scripted .click() ignores pointer-events, so the walk
         signed off a board nobody could have read, and `reelBusy` was still
         true when sign()'s own setTimeout(spin, 240) fired: drawInto returns
         at its first line while a reel is moving, so no draw was ever made
         and the draft sat on an empty board for ever. */
      await page.waitForSelector('.opts:not(.pending) .ptile:not(.off)', { timeout: 25000 });
      await page.evaluate(() =>
        document.querySelector('.opts:not(.pending) .ptile:not(.off)').click());
      /* THE `catch` BELOW IS WHY THIS SIGNATURE IS WORTH LOOKING AT TWICE.
         It was left reading `(want)` while the body asked for `a.want`, so
         every poll threw a ReferenceError, the catch answered false, and the
         wait timed out reporting a draft that had stalled. Nothing had
         stalled: the page had signed the man, drawn the next board and taken
         it out of `pending`, and the dump beside this says all three. A
         reader that cannot read looks exactly like the thing it reads being
         broken, which is this repo's oldest lesson arriving inside a guard. */
      await page.waitForFunction((a) => {
        try {
          const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
          if (!r || !Array.isArray(r.roster) || r.roster.length < a.want) return false;
          if (r.roster.length >= a.full) return true;
          const opts = document.querySelector('.opts');
          return !!r.currentDraw && !!opts && !/pending/.test(opts.className);
        } catch (e) { return false; }
      }, { want: i + 1, full: ROSTER_SIZE }, { timeout: 25000 });
    } catch (e) {
      /* A TIMEOUT HERE REPORTS THE BOARD AND NOT THE DRAFT unless it says
         what it actually found. A page on the home screen, a draft whose
         tiles are all unaffordable, and a reel that never settled are three
         faults behind one message. */
      const st = await page.evaluate(() => {
        let r = null;
        try { r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null'); } catch (e) {}
        return {
          screen: (document.querySelector('.screen.active') || {}).id,
          tiles: document.querySelectorAll('.opts .ptile').length,
          off: document.querySelectorAll('.opts .ptile.off').length,
          pending: /pending/.test((document.querySelector('.opts') || {}).className || ''),
          /* THE THREE THINGS THE WAIT ACTUALLY ASKS FOR. Without them a
             timeout here reports the board and leaves which clause failed to
             be worked out by hand, which is the whole thing the comment above
             says this dump exists to stop. */
          signed: r && Array.isArray(r.roster) ? r.roster.length : -1,
          draw: !!(r && r.currentDraw),
          phase: r ? r.phase : null,
        };
      });
      throw new Error(`draft stalled at pick ${i + 1} (signed ${await signedCount(page)}): `
        + JSON.stringify(st));
    }
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('#b-play'); if (b) b.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = document.querySelector('#b-skip'); if (b) b.click(); });
  /* THE BRACKET NOW STOPS AND ASKS. Every game the series can end in, and
     every Finals game, offers Play it or Sim it, and this file's subject is
     the leaderboard rather than the live board: it takes Sim every time. A
     walk that just waited for the results screen would hang at the first
     door, which is what the first version of this did. hoops/check-live.mjs
     is the one that presses Play. */
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (await page.evaluate(() => !!document.querySelector('#s-over.active'))) break;
    const open = await page.evaluate(() => {
      const d = document.querySelector('#lvdoor');
      if (!d || d.hidden) return false;
      document.querySelector('#b-lv-sim').click();
      return true;
    });
    await page.waitForTimeout(open ? 120 : 200);
  }
  await page.waitForSelector('#s-over.active', { timeout: 30000 });
  await page.waitForTimeout(2500);
}

const sheetState = (page) => page.evaluate(() => ({
  open: document.querySelector('#boardsheet').classList.contains('open'),
  sub: document.querySelector('#lb-sub').textContent,
  door: document.querySelector('#lb-door').value,
  keyShown: !document.querySelector('#lb-keywrap').hidden,
  key: document.querySelector('#lb-key').value,
  note: document.querySelector('#lb-note').textContent.trim(),
  noteClass: document.querySelector('#lb-note').className,
  rows: [...document.querySelectorAll('#lb-rows .lbrow')].length,
  mine: [...document.querySelectorAll('#lb-rows .lbrow')].findIndex((r) => r.classList.contains('you')),
}));

const main = async () => {
  const pw = (await import(PW)).default;
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  const boom = [];

  /* ── 1. the version pair ────────────────────────────────────────────────
     A stale ?v= fails loudly. This one fails SOFTLY by design, which is what
     makes it worse: the page falls through to a stub that answers null to
     everything, so a board.js one version behind degrades to "not reachable"
     and looks exactly like a bad network day. The football game shipped
     exactly that for a release. check-cachebust.mjs holds the pair; what is
     asserted here is that the stub is real, that it does not throw, and that
     it says which half is missing. */
  {
    const src = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
    const need = /var NEED_BOARD = (\d+);/.exec(src);
    const have = /const BOARD_API_VERSION = (\d+);/
      .exec(fs.readFileSync(path.join(HERE, 'board.js'), 'utf8'));
    ok(!!need && !!have, 'the page pins a board API version and board.js declares one');
    if (need && have) is(need[1], have[1], 'the page and board.js agree on the API version');

    const page = await newPage(browser, boom);
    /* One version ahead, which is what a board.js edited without bumping the
       page looks like. The page must come up, must not throw, and must say
       the board is unreachable rather than showing nothing at all. */
    await page.addInitScript(() => {
      Object.defineProperty(window, 'RTF_BOARD', {
        configurable: true,
        get(){ return window.__fakeBoard; },
        set(v){ window.__fakeBoard = Object.assign({}, v, { API_VERSION: 99 }); },
      });
    });
    await boot(page);
    const st = await page.evaluate(() => ({
      thrown: false,
      stub: !!(window.RTF_BOARD && window.RTF_BOARD.API_VERSION === 99),
    }));
    ok(st.stub, 'a board.js at the wrong version is what the page was handed');
    /* The page is alive: the front page drew and the Start button works. */
    ok(await page.evaluate(() => !document.querySelector('#b-start').disabled),
      'and the game still starts with the board at the wrong version');
    is(boom.filter((b) => !/console:/.test(b)), [],
      'nothing threw on a version mismatch');
    await page.context().close();
  }

  /* ── 2. a finished run reaches the board, once, describing itself ──────── */
  const boom2 = [];
  {
    const page = await newPage(browser, boom2);
    stub.mode = 'rows';
    stub.calls = []; stub.bodies = [];
    stub.rows = [fakeRow(0, { ring: true, name: 'jordan' }), fakeRow(1), fakeRow(2),
      fakeRow(3, { name: 'a really long display name that will not fit on a phone' })];
    await boot(page);
    await playRun(page, async () => {
      await page.evaluate(() => document.querySelector('#b-franchise-go').click());
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const c = [...document.querySelectorAll('#clubsheet .clubchip')]
          .find((b) => /Bulls/.test(b.textContent)) || document.querySelector('#clubsheet .clubchip');
        c.click();
      });
      await page.waitForTimeout(1400);
    });

    const subs = stub.bodies.filter((b) => b.path.endsWith('/rtf_submit_run'));
    is(subs.length, 1, 'a finished run is submitted exactly once');
    const body = subs[0] && subs[0].body;
    ok(!!body, 'and it sent a payload');
    if (body) {
      /* THE PAYLOAD IS THE HALF NOTHING ELSE CAN SEE. A run filed on the
         wrong board, or with a season total where a per-game differential
         goes, is refused by the server in the second case and accepted in
         the first, and neither shows up on any screen. */
      is(body.p_club, 'CHI', 'a One Franchise run is filed with its club');
      is(body.p_era, null, 'and with no era');
      is(body.p_daily_day, null, 'and no day');
      is((body.p_picks || []).length, ROSTER_SIZE,
        `all ${ROSTER_SIZE} picks go up`);
      ok((body.p_picks || []).every((k) => /^[0-9a-z]{1,12}\|[12][0-9]{3}\|[A-Z]{2,4}$/.test(k)),
        'every pick is E.pkey\'s own format, which is what the server accepts');
      ok((body.p_picks || []).every((k) => k.endsWith('|CHI')),
        'and on a Bulls run every one of them is a Bull');
      is((body.p_slots || []).length, ROSTER_SIZE, 'and a slot beside each one');
      ok((body.p_slots || []).every((s) => ['PG', 'SG', 'SF', 'PF', 'C', '6TH'].indexOf(s) >= 0),
        'each of which the server knows');
      /* PER GAME AND NOT PER SEASON. The season total is 82 times bigger and
         would be refused by the range check, which is the right direction for
         this to be wrong in and still worth catching here rather than in a
         support message. */
      ok(Math.abs(body.p_point_diff) <= 60,
        `the differential is per game (${body.p_point_diff})`);
      ok(body.p_spend_musd <= 126, 'the spend is inside the cap');
      ok(body.p_rating > 0 && body.p_rating < 200, 'the rating is on its own scale');
      /* The name is the one thing that must never be sendable. */
      is(Object.keys(body).filter((k) => /name/.test(k)), [],
        'nothing in the payload can put a name on a row');
    }

    /* THE FLAG RIDES IN THE SAVED RUN, so a reopened season does not file
       itself a second time. Driven by reloading rather than by reading the
       flag, because the flag being set is not the claim: the claim is that a
       second visit sends nothing. */
    const before = stub.bodies.filter((b) => b.path.endsWith('/rtf_submit_run')).length;
    await boot(page);
    await page.waitForTimeout(2500);
    const after = stub.bodies.filter((b) => b.path.endsWith('/rtf_submit_run')).length;
    is(after, before, 'and reopening the finished run does not submit it again');

    await page.context().close();
  }

  /* ── 3. the standing, and the sheet it opens ───────────────────────────── */
  const boom3 = [];
  {
    const page = await newPage(browser, boom3);
    stub.mode = 'rows'; stub.calls = []; stub.bodies = [];
    /* One of the rows IS this browser's, so the "you" mark has something to
       land on. Without it that assertion can only ever pass by not finding a
       mark, which is the badge that cannot be lit. */
    /* Five real seasons out of the shipped pool, keyed the way a row carries
       them, so tapping the champion's row has a roster to draw. */
    const POOL = JSON.parse(fs.readFileSync(path.join(ROOT, 'hoops', 'data', 'players.json'), 'utf8'));
    const FIVE = ['PG', 'SG', 'SF', 'PF', 'C'].map((pos) => POOL.find((r) => r.pp === pos && r.s === 1996));
    const FIVE_KEYS = FIVE.map((r) => r.i + '|' + r.s + '|' + r.t);
    stub.rows = [fakeRow(0, { ring: true, name: 'jordan', picks: FIVE_KEYS,
        slots: ['PG', 'SG', 'SF', 'PF', 'C'] }),
      fakeRow(1, { id: stub.yourId, name: 'you' }), fakeRow(2)];
    await boot(page);
    /* A DECADES RUN AND NOT A LEAGUE ONE, and that is the difference between
       this section testing something and not. `lbMode` defaults to the
       league, so a league run makes "it opened on the run's own board" true
       whether or not anything reads the run at all: deleting the line that
       looks at it passed this section green. Proved by reintroducing it. */
    await playRun(page, async () => {
      await page.evaluate(() => document.querySelector('#b-decade-go').click());
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const c = document.querySelector('#eragrid .clubchip');
        if (c) c.click();
      });
      await page.waitForTimeout(1400);
    });

    const stand = await page.evaluate(() => {
      const el = document.querySelector('#o-stand');
      return { hidden: el.hidden, text: el.textContent.replace(/\s+/g, ' ').trim(),
        disabled: el.disabled };
    });
    ok(!stand.hidden, 'the results screen says where the run landed');
    ok(/41st/.test(stand.text), `and names the place (${stand.text})`);
    /* SIGNED OUT, THIS RUN IS NOT ON THE LIST, which is named runs only, so
       the field it is placed in has to count it: the stand-in answers 312
       named runs and the place is where it WOULD sit among 313. This read
       "313th of 312" for any signed out run at the bottom before. */
    ok(/Would be 41st of 313/.test(stand.text),
      `out of the field it was counted against, itself included (${stand.text})`);
    ok(/sign in/i.test(stand.text), 'and it says what puts the name on it');
    ok(!/on The /.test(stand.text), 'and the board is named mid-sentence in lower case');
    ok(!stand.disabled, 'and it opens something');

    await page.evaluate(() => document.querySelector('#o-stand').click());
    await page.waitForTimeout(800);
    const s = await sheetState(page);
    ok(s.open, 'tapping it opens the board');
    /* IT HAS TO LAND ON THE RUN'S OWN BOARD. Opening a Decades run onto the
       league shows somebody rows their run is not among, and the first thing
       they do is decide the board is broken. */
    is(s.door, 'era', 'on the board the run was actually played on');
    ok(s.keyShown, 'with the decade it was played in already chosen');
    is(s.rows, 3, 'the rows are listed');
    is(s.mine, 1, 'and this browser\'s own row is the one marked');

    /* HOW FAR IT WENT LEADS THE LINE, because that is what Best run orders on
       and the reason the row above yours is above you. */
    const lines = await page.evaluate(() => [...document.querySelectorAll('#lb-rows .lbrow .who > span')]
      .map((e) => e.textContent));
    ok(/^Champions/.test(lines[0] || ''), `the champion's row says so first (${lines[0]})`);
    ok(/^Bounced in round one/.test(lines[2] || ''), `and a first round exit says that (${lines[2]})`);
    ok(!lines.some((l) => /all time/.test(l)), 'and the line carries no second ranking to argue with the first');

    /* THE FIVE ARE ONE TAP AWAY. The picks ride on every row and nothing drew
       them, so the board answered who won and never what they built. */
    const shut = await page.evaluate(() => {
      const f = document.querySelector('#lb-rows .lbrow .lbfive');
      return f ? f.hidden : null;
    });
    is(shut, true, 'the roster under a row starts folded');
    await page.evaluate(() => document.querySelector('#lb-rows .lbrow').click());
    await page.waitForTimeout(150);
    const five = await page.evaluate(() => {
      const row = document.querySelector('#lb-rows .lbrow');
      const f = row.querySelector('.lbfive');
      return { hidden: f.hidden, exp: row.getAttribute('aria-expanded'),
        names: [...f.querySelectorAll('li')].map((li) => li.textContent) };
    });
    ok(!five.hidden && five.exp === 'true', 'tapping the row opens its five');
    is(five.names.length, 5, 'all five are drawn');
    ok(FIVE.every((r, i) => (five.names[i] || '').includes(r.n)),
      `by name, in slot order (${five.names.join(' | ')})`);
    ok(five.names.every((t) => /1996/.test(t)), 'each with the season it was');

    /* TWO PATHS REACH THE SHEET AND BOTH HAVE TO LAND ON THE SAME BOARD. The
       standing passes the mode; Home and the career sheet pass nothing and
       fall back to the finished run. Two lines in two places, so one of them
       going stale is invisible from the other.

       AFTER A RELOAD, and that is what makes this a test rather than a
       reading of leftover state. `lbMode` is module state: opened once from
       the standing it is already the run's board, so the front page would
       land there whether or not it looks at the run at all. Deleting the
       line that does passed green until this reloaded first. */
    await boot(page);
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('#b-home').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('#b-home-board').click());
    await page.waitForTimeout(900);
    const viaHome = await sheetState(page);
    is(viaHome.door, 'era', 'opening from the front page lands on the same board');
    is(viaHome.key, s.key, 'and on the same decade');

    await page.context().close();
  }

  /* ── 4. all four doors, and the two axes ───────────────────────────────── */
  const boom4 = [];
  {
    const page = await newPage(browser, boom4);
    stub.mode = 'rows'; stub.rows = [fakeRow(0), fakeRow(1)];
    await boot(page);
    await page.evaluate(() => document.querySelector('#b-home-board').click());
    await page.waitForTimeout(700);

    const lastList = () => stub.calls.filter((c) => c.includes('select=id%2C') || c.includes('select=id,'))
      .slice(-1)[0] || '';
    const lastQuery = () => stub.calls.slice(-1)[0] || '';

    /* WHAT EACH DOOR ACTUALLY ASKS FOR. The whole design is four
       competitions, and it is one wrong query parameter away from being one
       board with four labels on it, which would render perfectly. */
    const doors = [
      ['league', 'run_mode=eq.league', 'lock_key', false],
      ['club', 'run_mode=eq.club', 'lock_key=eq.', true],
      ['era', 'run_mode=eq.era', 'lock_key=eq.', true],
      ['daily', 'run_mode=eq.daily', 'daily_day=eq.', false],
    ];
    for (const [door, wantMode, wantKey, keyShown] of doors) {
      stub.calls = [];
      await page.selectOption('#lb-door', door);
      await page.waitForTimeout(500);
      const q = lastQuery();
      ok(q.includes(wantMode), `the ${door} board asks for ${wantMode}`);
      if (keyShown) ok(q.includes(wantKey), `and scopes it with ${wantKey}`);
      else ok(!q.includes('lock_key=eq.'), `and the ${door} board carries no lock`);
      if (door === 'daily') ok(q.includes('daily_day=eq.'), 'today asks for one day');
      const st = await sheetState(page);
      is(st.keyShown, keyShown, `the lock picker is ${keyShown ? 'shown' : 'hidden'} for ${door}`);
      ok(st.sub.length > 0, `and the ${door} board says which board it is`);
      /* NAMED ROWS ONLY. A guest run is a real run and counts, but a board of
         Anonymous rows is not a board. */
      ok(q.includes('display_name=not.is.null'), `the ${door} list asks for named runs`);
    }

    stub.calls = [];
    await page.selectOption('#lb-door', 'league');
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('#lb-ax-rating').click());
    await page.waitForTimeout(500);
    ok(lastQuery().includes('order=rating.desc'), 'the rating axis orders on rating');
    /* THE TIEBREAK REVERSES WITH THE SORT KEY, which is what lets there be no
       ascending twin of any index. Both axes run desc today, so the tiebreak
       is asc: a forward scan on a (col desc, created_at asc) index. */
    ok(lastQuery().includes('created_at.asc'), 'and breaks a tie the way the index runs');
    ok(lastQuery().includes('rating=not.is.null'),
      'and leaves out rows that have no rating, so the list and the count agree');
    await page.evaluate(() => document.querySelector('#lb-ax-record').click());
    await page.waitForTimeout(400);
    ok(lastQuery().includes('order=record_score.desc'), 'the record axis orders on the record alone');
    await page.evaluate(() => document.querySelector('#lb-ax-run').click());
    await page.waitForTimeout(400);
    ok(lastQuery().includes('order=score.desc'),
      'and Best run orders on the score, which leads with how far the run went');

    /* SWITCHING THE DOOR RESETS THE LOCK. Coming back to Decades and getting
       whichever era the last session left behind is a screen answering a
       question nobody asked. */
    await page.selectOption('#lb-door', 'club');
    await page.waitForTimeout(400);
    await page.selectOption('#lb-key', 'BOS');
    await page.waitForTimeout(400);
    await page.selectOption('#lb-door', 'era');
    await page.waitForTimeout(400);
    const eraKey = await page.evaluate(() => document.querySelector('#lb-key').value);
    ok(/^[a-z]+$/.test(eraKey) && eraKey !== 'BOS',
      `changing the door drops the other door's lock (${eraKey})`);

    await page.context().close();
  }

  /* ── 5. the three states that ship broken ──────────────────────────────── */
  const boom5 = [];
  {
    const page = await newPage(browser, boom5);
    stub.mode = 'rows'; stub.rows = [fakeRow(0)];
    await boot(page);
    await page.evaluate(() => document.querySelector('#b-home-board').click());
    await page.waitForTimeout(700);

    const said = {};
    for (const m of ['rows', 'empty', 'down', 'nomigration']) {
      stub.mode = m;
      await page.evaluate(() => document.querySelector('#lb-ax-record').click());
      await page.waitForTimeout(700);
      const st = await sheetState(page);
      said[m] = st.note;
      if (m === 'rows') { is(st.rows, 1, 'a board with a run on it lists it'); }
      else { is(st.rows, 0, `the ${m} board lists nothing`); }
      ok(st.note.length > 20, `and the ${m} board says why, in a sentence`);
    }
    /* FOUR STATES, FOUR SENTENCES. A blank box is how a feature teaches
       somebody it is broken, and three of these states rendering the same
       apology is the same defect with more words. "Nobody yet" is the COMMON
       case on a game this new, so it is the one that must not read as an
       error. */
    is(new Set(Object.values(said)).size, 4, 'each state says something different');
    ok(/first/i.test(said.empty), 'an empty board says being first is the prize');
    ok(!/first/i.test(said.down), 'and an unreachable one does not');
    ok(/not set up|not reachable/i.test(said.down), 'an unreachable board says so');
    ok(/not set up/i.test(said.nomigration),
      'and a missing migration is told apart from a bad network');
    await page.context().close();
  }

  /* ── 6. THE GAME OUTLIVES THE BOARD ─────────────────────────────────────
     The point of every soft failure in board.js. A run finished against a
     database that has never seen the migration still plays, still records in
     the career and still lights its badges, and the only thing missing is a
     row on a list. This is the assertion that would catch somebody making the
     board a dependency. */
  const boom6 = [];
  {
    const page = await newPage(browser, boom6);
    stub.mode = 'nomigration';
    await boot(page);
    await playRun(page, async () => {
      await page.evaluate(() => document.querySelector('#b-start').click());
      await page.waitForTimeout(1200);
    });
    const after = await page.evaluate(() => ({
      record: document.querySelector('#o-record').textContent.trim(),
      earned: !document.querySelector('#o-earnedcard').hidden,
      career: JSON.parse(localStorage.getItem('runthefloor_career_v1') || 'null'),
      standing: document.querySelector('#o-stand').textContent.replace(/\s+/g, ' ').trim(),
    }));
    ok(/^\d+-\d+$/.test(after.record), 'the season still finishes with the board missing');
    ok(after.earned, 'what it earned is still announced');
    ok(after.career && after.career.runs >= 1, 'and it is still in the career');
    ok(/not reachable|not set up/i.test(after.standing),
      'while the standing says the board is the thing that is missing');
    ok(!/1st|first/i.test(after.standing),
      'and never reports an unreachable board as an empty one');
    is(boom6.filter((b) => !/console:/.test(b)), [],
      'and nothing threw with every request failing');

    /* ── 6b. THE CABINET IS AN ACCOUNT'S ──────────────────────────────────
       This run was played signed out, so its results card has to offer the
       badges rather than hand them over, and the career sheet's Badges tab has
       to be the sign-in teaser rather than a cabinet. Then the same page signs
       in and the same tab has to be the cabinet, every tile a ball. Both
       halves are asked on one page, because the claim is that the SAME career
       is read differently by who is holding it. */
    const guest = await page.evaluate(() => {
      const card = document.querySelector('#o-earned');
      const out = {
        ballRows: card.querySelectorAll('.ern:not(.ern-guest) .em.ball').length,
        offer: !!card.querySelector('.ern-guest #b-earned-signin'),
        offerText: (card.querySelector('.ern-guest') || {}).textContent || '',
      };
      document.querySelector('#b-home-career') && document.querySelector('#b-home-career').click();
      document.querySelector('#pt-badges').click();
      const grid = document.querySelector('#pf-badges');
      out.tiles = grid.querySelectorAll('.bdg').length;
      out.teaser = !!grid.querySelector('.bdg-guest');
      out.teaserBalls = grid.querySelectorAll('.bdg-guest svg rect').length > 0;
      out.count = document.querySelector('#pt-count').textContent;
      out.note = !document.querySelector('#pf-badgenote').hidden;
      return out;
    });
    is(guest.ballRows, 0, 'a guest\'s results card hands over no badges');
    ok(guest.offer && /Sign in/.test(guest.offerText) && /\d+ badge/.test(guest.offerText),
      'and instead says how many the run lit and offers the sign in');
    is(guest.tiles, 0, 'a guest\'s Badges tab draws no cabinet');
    ok(guest.teaser && guest.teaserBalls, 'it draws the teaser, balls and all');
    ok(guest.count === '' && !guest.note, 'with no count and no storage note');

    const member = await page.evaluate(() => {
      window.RTF_AUTH.state = () => ({ ready: true, waiting: false, signedIn: true,
        name: 'tester', userId: '00000000-0000-0000-0000-000000000001' });
      document.querySelector('#pt-record').click();
      document.querySelector('#pt-badges').click();
      const grid = document.querySelector('#pf-badges');
      const tiles = [...grid.querySelectorAll('.bdg')];
      return {
        tiles: tiles.length,
        balls: tiles.filter((t) => t.querySelector('.bb svg rect')).length,
        on: grid.querySelectorAll('.bdg.on').length,
        teaser: !!grid.querySelector('.bdg-guest'),
        count: document.querySelector('#pt-count').textContent,
        ballPx: (() => { const b = grid.querySelector('.bdg .bb'); return b ? b.getBoundingClientRect().width : 0; })(),
        cells: (() => { const v = grid.querySelector('.bdg .bb svg'); return v ? v.viewBox.baseVal.width : 0; })(),
      };
    });
    ok(member.tiles > 20 && !member.teaser, 'signed in, the same tab is the cabinet');
    is(member.balls, member.tiles, 'and every badge in it is a ball');
    ok(member.on >= 1, 'the run played signed out lit badges the account now shows');
    ok(/^\d+\/\d+$/.test(member.count), 'and the tab counts them');
    ok(member.cells > 0 && Number.isInteger(member.ballPx / member.cells),
      'a ball is a whole number of pixels a cell (' + member.ballPx + 'px over ' + member.cells + ' cells)');

    /* THE SHELVES. One a group, in badges.js' order, each counting its own
       tiles, and open exactly when something on it is earned: a shelf that
       opened empty is a wall of grey, and one that stayed shut over a badge
       somebody just earned hides the thing they came to look at. */
    const shelves = await page.evaluate(() => {
      const G = window.RTF_BADGES.GROUPS;
      const sh = [...document.querySelectorAll('#pf-badges .bshelf')];
      return {
        groups: G.map((g) => g[0]), drawn: sh.map((d) => d.getAttribute('data-g')),
        total: window.RTF_BADGES.TOTAL,
        tiles: sh.reduce((n, d) => n + d.querySelectorAll('.bdg').length, 0),
        counts: sh.every((d) => {
          const m = d.querySelector('summary .n').textContent.match(/^(\d+)\/(\d+)$/);
          return m && +m[1] === d.querySelectorAll('.bdg.on').length && +m[2] === d.querySelectorAll('.bdg').length;
        }),
        openRule: sh.every((d) => d.open === (d.querySelectorAll('.bdg.on').length > 0)),
      };
    });
    is(shelves.drawn, shelves.groups, 'the cabinet draws one shelf a group, in order');
    is(shelves.tiles, shelves.total, 'and every badge in the catalog is on one of them');
    ok(shelves.counts, 'every shelf counts what is on it');
    ok(shelves.openRule, 'a shelf is open exactly when something on it is earned');

    /* THE OTHER MODES' HOOK. Conquest, Fix History and Six Passes hand their
       feats to RTF_PAGE.feats; what lights has to land on the career, the
       cabinet and a toast, and the toast has to wait for the mode's own. */
    const hook = await page.evaluate(async () => {
      const fresh = window.RTF_PAGE.feats({ add: { 'ps.played': 1, 'ps.solved': 1 } });
      const soon = document.querySelector('#toast').textContent;
      await new Promise((r) => setTimeout(r, 2500));
      const c = JSON.parse(localStorage.getItem('runthefloor_career_v1'));
      return { fresh: fresh.map((b) => b.id), soon, later: document.querySelector('#toast').textContent,
        feats: c && c.feats };
    });
    ok(hook.fresh.includes('ps-first') && hook.fresh.includes('ps-1'), 'a mode\'s feats light its badges (' + hook.fresh + ')');
    ok(hook.feats && hook.feats['ps.solved'] === 1, 'and they are written onto the career');
    ok(!/badge/i.test(hook.soon) && /badges?/i.test(hook.later), 'and the toast waits its turn, then says so');
    await page.context().close();
  }

  await browser.close();

  const allBoom = [...boom, ...boom2, ...boom3, ...boom4, ...boom5, ...boom6]
    .filter((b) => !/console:/.test(b));
  is(allBoom, [], 'no page threw anywhere in this file');

  if (failures.length) {
    console.log(`\n  ${failures.length} FAILED of ${pass + failures.length}:\n`);
    failures.forEach((f) => console.log('    - ' + f));
    process.exit(1);
  }
  console.log(`${pass} assertions passed.`);
};

main().catch((e) => { console.error(e); process.exit(1); });
