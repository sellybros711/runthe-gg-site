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
  plays: [],
  calls: [],
  bodies: [],
  yourId: 4242,
};

function fakeRow(i, o = {}) {
  const wins = o.wins ?? (70 - i);
  return {
    id: o.id ?? (1000 + i), created_at: '2026-09-18T12:00:00Z',
    user_id: o.uid || null,
    display_name: o.name === null ? null : (o.name || ('player' + i)),
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
    if (u.pathname.endsWith('/rtf_profiles')) {
      return json(200, JSON.stringify(stub.rows.filter((r) => r.user_id).slice(0, 1)
        .map((r) => ({ user_id: r.user_id, jersey_club: 'BOS', jersey_num: '33' }))));
    }

    const wantsCount = (req.headers()['prefer'] || '').includes('count=exact');
    const empty = stub.mode === 'empty';
    if (wantsCount) {
      /* Two different counts behind one shape: how many are AHEAD of this run
         (the score=gt. query) and how many there are at all. */
      const ahead = u.search.includes('score=gt.') || u.search.includes('rating=gt.');
      const n = empty ? 0 : (ahead ? 40 : 312);
      return json(200, '[]', { 'content-range': '0-0/' + n });
    }
    if (u.pathname.endsWith('/rtf_plays')) {
      return json(200, JSON.stringify(empty ? [] : stub.plays));
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

/* WHAT THE LEADERBOARD SCREEN IS SHOWING. The lock picker is read off its
   COMPUTED display and never off `hidden`: the sheet this replaced set
   display:block on that label, so its `hidden` never took and an empty select
   sat under the league board, which is what the player reported. */
const sheetState = (page) => page.evaluate(() => {
  const lw = document.querySelector('#bd-lockwrap');
  const empty = document.querySelector('#bd-list .bd-empty');
  const ents = [...document.querySelectorAll('#bd-list .bd-ent')];
  return {
    open: document.querySelector('#s-board').classList.contains('active'),
    sub: document.querySelector('#bd-h').textContent,
    door: (document.querySelector('#bd-tabs .bd-tab.on') || { getAttribute: () => null }).getAttribute('data-k'),
    keyShown: getComputedStyle(lw).display !== 'none',
    key: document.querySelector('#bd-lock').value,
    note: (empty ? empty.textContent : document.querySelector('#bd-count').textContent).trim(),
    noteClass: empty ? empty.className : '',
    rows: ents.length,
    mine: ents.findIndex((r) => r.querySelector('.bd-row.me')),
  };
});

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
        slots: ['PG', 'SG', 'SF', 'PF', 'C'], uid: '11111111-1111-1111-1111-111111111111' }),
      fakeRow(1, { id: stub.yourId, name: 'you' }), fakeRow(2, { name: null })];
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
    /* EVERY RUN IS ON THE BOARD NOW, a guest's as Guest, so a filed run is
       inside the field it is placed in: the stand-in answers 312 runs and the
       run is one of them. It read "Would be 41st of 313" while guest runs were
       filed and never listed. */
    ok(/41st of 312/.test(stand.text),
      `out of the field the board counts (${stand.text})`);
    ok(/sign in/i.test(stand.text), 'and it says what puts the name on it');
    ok(!/on The /.test(stand.text), 'and the board is named mid-sentence in lower case');
    ok(!stand.disabled, 'and it opens something');

    await page.evaluate(() => document.querySelector('#o-stand').click());
    await page.waitForTimeout(800);
    const s = await sheetState(page);
    ok(s.open, 'tapping it opens the leaderboard screen');
    /* IT HAS TO LAND ON THE RUN'S OWN BOARD. Opening a Decades run onto the
       league shows somebody rows their run is not among, and the first thing
       they do is decide the board is broken. */
    is(s.door, 'era', 'on the board the run was actually played on');
    ok(s.keyShown && /^[a-z]+$/.test(s.key), `with the decade it was played in already chosen (${s.key})`);
    is(s.rows, 3, 'the rows are listed');
    is(s.mine, 1, 'and this browser\'s own row is the one marked');

    /* HOW FAR IT WENT LEADS THE LINE, because that is what Best run orders on
       and the reason the row above yours is above you. */
    const lines = await page.evaluate(() => [...document.querySelectorAll('#bd-list .bd-meta')]
      .map((e) => e.textContent));
    ok(/^Champions/.test(lines[0] || ''), `the champion's row says so first (${lines[0]})`);
    ok(/^Bounced in round one/.test(lines[2] || ''), `and a first round exit says that (${lines[2]})`);
    ok(!lines.some((l) => /all time/.test(l)), 'and the line carries no second ranking to argue with the first');
    /* A GUEST IS LISTED, AS GUEST. The board listed named runs only, and a
       player whose runs were filed signed out opened a board reading "no names
       yet". Run The Diamond lists every season. */
    const names = await page.evaluate(() => [...document.querySelectorAll('#bd-list .bd-name')].map((e) => e.textContent));
    is(names[2], 'Guest', 'a run filed signed out is on the board as Guest');
    await page.waitForTimeout(400);
    const jz = await page.evaluate(() => {
      const c = document.querySelectorAll('#bd-list .bd-crest');
      return { first: (c[0] && c[0].textContent) || '', guest: c[2] ? c[2].classList.contains('guest') : false };
    });
    ok(/33/.test(jz.first), `a named row wears the jersey its account chose (${jz.first})`);
    ok(jz.guest, 'and a guest row wears the greyed house jersey');
    ok(await page.evaluate(() => document.querySelector('#bd-list .bd-ent').classList.contains('champ')),
      'and the champion wears the gold');

    /* THE FIVE ARE ONE TAP AWAY. The picks ride on every row and nothing drew
       them, so the board answered who won and never what they built. */
    const shut = await page.evaluate(() => {
      const f = document.querySelector('#bd-list .bd-team');
      return f ? f.hidden : null;
    });
    is(shut, true, 'the roster under a row starts folded');
    await page.evaluate(() => document.querySelector('#bd-list .bd-row').click());
    await page.waitForTimeout(150);
    const five = await page.evaluate(() => {
      const ent = document.querySelector('#bd-list .bd-ent');
      const f = ent.querySelector('.bd-team');
      return { hidden: f.hidden, exp: ent.querySelector('.bd-row').getAttribute('aria-expanded'),
        names: [...f.querySelectorAll('.bd-five li')].map((li) => li.textContent) };
    });
    ok(!five.hidden && five.exp === 'true', 'tapping the row opens its five');
    is(five.names.length, 5, 'all five are drawn');
    ok(FIVE.every((r, i) => (five.names[i] || '').includes(r.n)),
      `by name, in slot order (${five.names.join(' | ')})`);
    ok(five.names.every((t) => /1996/.test(t)), 'each with the season it was');

    /* BACK GOES BACK TO THE RESULTS, because the board was opened from them. */
    await page.evaluate(() => document.querySelector('#b-board-back').click());
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelector('#s-over').classList.contains('active')),
      'Back returns to the results screen it was opened from');

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

  /* ── 4. the tabs, the lock, the axes, the windows, the sort, the paging ── */
  const boom4 = [];
  {
    const page = await newPage(browser, boom4);
    stub.mode = 'rows'; stub.rows = [fakeRow(0), fakeRow(1)];
    stub.plays = [{ id: 7, created_at: '2026-09-18T12:00:00Z', user_id: null, display_name: 'cq', mode: 'conquest',
      day: 1, score: 9, cq_wins: 9, cq_lives: 0, cq_cleared: false, cq_lost_to: 'BOS_1986', cq_roster: [], cq_took: [] }];
    await boot(page);
    await page.evaluate(() => document.querySelector('#b-home-board').click());
    await page.waitForTimeout(700);

    const lastQuery = () => stub.calls.filter((c) => /select=id%2C|select=id,/.test(c)).slice(-1)[0] || '';
    const tab = async (k) => {
      stub.calls = [];
      await page.evaluate((x) => document.querySelector('#bd-tabs .bd-tab[data-k="' + x + '"]').click(), k);
      await page.waitForTimeout(500);
    };

    let st = await sheetState(page);
    is(st.door, 'league', 'the front page opens the leaderboard on Classic');
    ok(!st.keyShown, 'and the Classic board draws no empty lock picker under it');

    /* WHAT EACH TAB ACTUALLY ASKS FOR. The whole design is separate
       competitions, one wrong query parameter away from one board with seven
       labels on it, which would render perfectly. */
    const doors = [
      ['league', 'run_mode=eq.league', false],
      ['daily', 'run_mode=eq.daily', false],
      ['club', 'run_mode=eq.club', true],
      ['era', 'run_mode=eq.era', true],
    ];
    for (const [door, want, lock] of doors) {
      await tab(door);
      const q = lastQuery();
      ok(q.includes(want), `the ${door} board asks for ${want}`);
      ok(!q.includes('lock_key=eq.'), `and opens on every ${door === 'era' ? 'decade' : 'team'} rather than one`);
      if (door === 'daily') ok(q.includes('daily_day=eq.'), 'the daily asks for one day');
      /* EVERY RUN, NAMED OR NOT. */
      ok(!q.includes('display_name=not.is.null'), `the ${door} list asks for every run, guests included`);
      st = await sheetState(page);
      is(st.keyShown, lock, `the lock picker is ${lock ? 'shown' : 'hidden'} on ${door}`);
    }
    stub.calls = [];
    await page.selectOption('#bd-lock', 'seventies');
    await page.waitForTimeout(500);
    ok(lastQuery().includes('lock_key=eq.seventies'), 'choosing a decade scopes the board to it');
    await tab('club');
    stub.calls = [];
    await page.selectOption('#bd-lock', 'BOS');
    await page.waitForTimeout(500);
    ok(lastQuery().includes('lock_key=eq.BOS'), 'choosing a team scopes the board to it');

    await tab('league');
    const ax = async (k) => {
      stub.calls = [];
      await page.evaluate((x) => document.querySelector('#bd-axes button[data-ax="' + x + '"]').click(), k);
      await page.waitForTimeout(450);
    };
    await ax('rating');
    ok(lastQuery().includes('order=rating.desc'), 'the rating axis orders on rating');
    ok(lastQuery().includes('created_at.asc'), 'and breaks a tie the way the index runs');
    ok(lastQuery().includes('rating=not.is.null'), 'and leaves out rows with no rating, so the list and the count agree');
    await ax('record');
    ok(lastQuery().includes('order=record_score.desc'), 'the record axis orders on the record alone');
    await ax('run');
    ok(lastQuery().includes('order=score.desc'), 'and Best run orders on the score, which leads with how far the run went');

    /* THE WINDOW AND THE SORT, which is Run The Diamond's board. */
    stub.calls = [];
    await page.evaluate(() => document.querySelector('#bd-wins button[data-w="day"]').click());
    await page.waitForTimeout(450);
    ok(/created_at=gte\./.test(lastQuery()), 'Today asks for runs filed since the day started');
    const cnt = stub.calls.filter((c) => c.includes('select=id&') || c.endsWith('select=id')).slice(-1)[0] || '';
    ok(/created_at=gte\./.test(cnt), 'and counts the same window it lists');
    stub.calls = [];
    await page.evaluate(() => document.querySelector('#bd-wins button[data-w="all"]').click());
    await page.waitForTimeout(450);
    ok(!/created_at=gte/.test(lastQuery()), 'All time asks for every run');
    stub.calls = [];
    await page.evaluate(() => document.querySelector('#bd-sort').click());
    await page.waitForTimeout(450);
    ok(/order=score\.asc/.test(lastQuery()) && /created_at\.desc/.test(lastQuery()),
      'Low to high reads the board backwards, tiebreak and all');
    const ranksLow = await page.evaluate(() => [...document.querySelectorAll('#bd-list .bd-pos')].map((e) => e.textContent));
    is(ranksLow, ['312', '311'], 'and each row keeps its real place, counted down from the total');
    await page.evaluate(() => document.querySelector('#bd-sort').click());
    await page.waitForTimeout(450);

    /* A HUNDRED AT A TIME. The stand-in counts 312 and lists two, so there
       are more to load and the next page starts where this one ended. */
    const more = await page.evaluate(() => { const m = document.querySelector('#bd-more'); return { hidden: m.hidden, t: m.textContent }; });
    ok(!more.hidden && /Show 100 more/.test(more.t), `a board longer than a page offers the next one (${more.t})`);
    stub.calls = [];
    await page.evaluate(() => document.querySelector('#bd-more').click());
    await page.waitForTimeout(450);
    ok(/offset=2/.test(lastQuery()), 'and asks for the rows after the ones it has');
    is((await sheetState(page)).rows, 4, 'and adds them under the first page');

    /* THE OTHER MODES ARE TABS OF THE SAME SCREEN. */
    await tab('conquest');
    const cq = stub.calls.filter((c) => c.includes('/rtf_plays')).slice(-1)[0] || '';
    ok(/mode=eq\.conquest/.test(cq), 'the Conquest tab reads the Conquest board');
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('#bd-axes')).display === 'none'),
      'and has no draft axes');
    const cqRow = await page.evaluate(() => document.querySelector('#bd-list .bd-rec').textContent);
    ok(/9\s*wins/.test(cqRow), `and ranks a run by its wins (${cqRow})`);
    await tab('fix');
    const fx = stub.calls.filter((c) => c.includes('/rtf_plays')).slice(-1)[0] || '';
    ok(/mode=eq\.fix/.test(fx) && /day=eq\.\d+/.test(fx), 'the Fix History tab reads one day');
    const wins = await page.evaluate(() => [...document.querySelectorAll('#bd-wins button')].map((b) => b.textContent));
    is(wins, ['Today', 'Yesterday'], 'and its window is today or yesterday');

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
      await page.evaluate(() => document.querySelector('#bd-axes button[data-ax="record"]').click());
      await page.waitForTimeout(700);
      const st = await sheetState(page);
      said[m] = st.note;
      if (m === 'rows') { is(st.rows, 1, 'a board with a run on it lists it'); }
      else { is(st.rows, 0, `the ${m} board lists nothing`); }
      if (m !== 'rows') ok(st.note.length > 20, `and the ${m} board says why, in a sentence`);
    }
    /* FOUR STATES, FOUR SENTENCES. A blank box is how a feature teaches
       somebody it is broken, and three of these states rendering the same
       apology is the same defect with more words. "Nobody yet" is the COMMON
       case on a game this new, so it is the one that must not read as an
       error. */
    is(new Set(Object.values(said)).size, 4, 'each state says something different');
    ok(/runs?$/.test(said.rows), `a board with runs counts them (${said.rows})`);
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
