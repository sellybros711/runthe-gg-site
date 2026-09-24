/*
 * check-draft.mjs - the draft screen's shape, on a desktop and on a phone.
 *
 *   node hoops/check-draft.mjs
 *
 * ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 *
 * Every other checker here asks whether the game is RIGHT. This one asks
 * whether the screen it is played on is the shape it says it is, and that is a
 * different question with a different failure mode: a layout rule that does
 * not apply throws nothing, logs nothing, and renders a page that looks like a
 * page. The draft shipped at a 660px wrap with the court taking a fixed 316px
 * rail out of it, so on a 1512px monitor the board a player actually reads was
 * drawn 298px wide, narrower than it is on a phone, with the position tabs
 * overflowing and the sort row wrapped onto two lines. Nothing anywhere said
 * so for as long as it shipped.
 *
 * ── THREE THINGS IT HOLDS, AND ALL THREE HAVE ALREADY BEEN WRONG ───────────
 *
 * THE WIDE RULES REALLY MATCH. `.wrap:has(#s-draft.active)` is how the draft
 * gets its width, and the rule was first written `.on`, which is the football
 * game's class and not this one's. It matched nothing: no error, a draft that
 * stayed 660px wide, which is indistinguishable from the bug the block exists
 * to fix. Caught by measuring the wrap rather than by looking at the screen.
 *
 * A MEDIA QUERY ADDS NO SPECIFICITY. The wide block sits about eleven hundred
 * lines above the base rules it argues with, so at equal weight the later one
 * wins. `.sortbar{margin-top:0}` lost that way and kept a 40px hole between
 * two controls that belong together. Worse, the `max-width` block that has
 * always claimed to draw a shorter court on a phone lost it too, for the whole
 * life of the file: the draft court drew at the base 1/0.94 on every phone
 * that ever loaded it. Both are asserted here as MEASUREMENTS of the rendered
 * box, because reading the stylesheet is how you get told what was intended.
 *
 * THE PHONE DID NOT MOVE. The wide layout needs one wrapper in the markup, and
 * a wrapper is exactly the kind of change that quietly costs a margin. Two
 * random drafts are two different boards, so comparing screenshots across runs
 * measures the players; this measures ONE page twice, with the wrapper flat
 * and not, which is a controlled comparison with no seed in it.
 *
 * Every assertion is a PROPERTY, never a pinned pixel: which column a thing is
 * in, how many columns the board has, whether one box is wider than another.
 * Pinning the numbers would make this a test of whichever monitor somebody
 * happened to have.
 *
 * NOTHING HERE REACHES A NETWORK. Every request off local.test is refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
async function serve(route) {
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

/* Draft screen, one spin in, which is every state this file cares about: the
   board is drawn, the court is drawn, nothing has been signed. */
async function draftPage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { timeout: 30000 });
  /* The first-time guide covers the button it points at. */
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await page.evaluate(() => document.querySelector('#b-start').click());
  /* THE PARENT CARRIES `pending`, NEVER THE TILE, and this file's own section
     6 already writes that down. Waiting on `#opts .ptile:not(.pending)` returns
     the moment the tiles EXIST, which is mid-spin, so section 5 read a board
     that had not landed and then found `#b-respin` still disabled by reelBusy,
     broke out after ONE board and failed on about one run in ten. Measured
     over 3000 real drafts, 9.8% of single boards hold no two-position man and
     0.03% of four-board searches do, which is the whole of the difference
     between a guard that flakes and one that does not. */
  await page.waitForSelector('.opts:not(.pending) .ptile', { timeout: 30000 });
  await page.waitForTimeout(500);
  return { page, ctx, boom };
}

const geom = (page) => page.evaluate(() => {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const opts = document.querySelector('#opts');
  return {
    wrap: box('.wrap'), court: box('#court'), dtop: box('.dtop'), tabs: box('#tabs'),
    opts: box('#opts'), sort: box('.sortbar'), tile: box('#opts .ptile'),
    cols: getComputedStyle(opts).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    pips: getComputedStyle(document.querySelector('#d-pips')).display,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const browser = await pw.chromium.launch({ executablePath: CHROME });

// ── 1. the wide layout is football's shape ──────────────────────────────────
section('1. a desktop gets picture left, wheel right, board full width');
{
  const { page, ctx, boom } = await draftPage(browser, 1512, 950);
  const g = await geom(page);

  ok(g.wrap.w > 900, `the draft gets a wide wrap (${Math.round(g.wrap.w)}px)`);
  ok(g.cols === 3, `the board is three columns (${g.cols})`);

  /* PICTURE LEFT, WHEEL RIGHT, SIDE BY SIDE. Two claims, because a court above
     a wheel also satisfies "the court is on the left". */
  ok(g.court.x < g.dtop.x, 'the court is left of the wheel');
  ok(g.court.y < g.dtop.bottom && g.dtop.y < g.court.bottom,
    'and beside it rather than above it');

  /* The whole point of the width: the board is wider than either column. */
  ok(g.opts.w > g.court.w * 1.5, 'the board spans both columns');
  ok(Math.abs(g.tabs.w - g.opts.w) < 2, 'and so does the tab row');
  ok(g.tile.w > 260, `a tile is a readable width (${Math.round(g.tile.w)}px)`);

  /* The pips carry the lineup when the court is out of reach, and here it is
     never out of reach. Football hides them at this width for the same reason. */
  ok(g.pips === 'none', 'the six pips are gone, height and all');

  /* THE CASCADE CLAIMS, both of which have already been lost to a later rule
     of equal weight. Measured off the box, never read out of the sheet. */
  ok(Math.abs(g.opts.right - g.sort.right) < 2,
    'the sort sits at the board\'s right edge');
  ok(g.sort.y - g.tabs.bottom < 30,
    `the sort is not adrift from the tabs (${Math.round(g.sort.y - g.tabs.bottom)}px)`);

  ok(g.overflow === 0, 'nothing hangs off the side');
  ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
  await ctx.close();
}

// ── 2. the breakpoint is clean ──────────────────────────────────────────────
section('2. one pixel either side of the breakpoint, and no width gets neither');
{
  const wide = await draftPage(browser, 920, 900);
  const gw = await geom(wide.page);
  ok(gw.cols === 3, `920 is the wide layout (${gw.cols} columns)`);
  ok(gw.pips === 'none', 'and hides the pips');
  ok(gw.overflow === 0, 'with nothing off the side');
  await wide.ctx.close();

  const narrow = await draftPage(browser, 919, 900);
  const gn = await geom(narrow.page);
  ok(gn.cols === 1, `919 is the single column (${gn.cols})`);
  ok(gn.pips === 'flex', 'and keeps the pips');
  ok(gn.court.y > gn.dtop.y, 'with the court under the wheel, not beside it');
  ok(gn.overflow === 0, 'with nothing off the side');
  await narrow.ctx.close();
}

// ── 3. the phone court is the SHORT one ─────────────────────────────────────
section('3. the court a phone draws is the one the file says it draws');
{
  const { page, ctx } = await draftPage(browser, 390, 844);
  const g = await geom(page);
  /* The rule asks for 1/0.72 and the base rule three hundred lines below asks
     for 1/0.94. For the whole life of the file the base won, so this is the
     one assertion here that was RED before it was written. The band is wide
     because the claim is which of two rules applied, not a pixel count. */
  const aspect = g.court.w / g.court.h;
  ok(aspect > 1.3, `the phone court is the short one (aspect ${aspect.toFixed(2)}, `
    + `${Math.round(g.court.w)}x${Math.round(g.court.h)})`);
  ok(g.cols === 1, 'the board is one column');
  ok(g.overflow === 0, 'nothing hangs off the side');
  await ctx.close();
}

// ── 4. the wrapper costs the phone nothing ──────────────────────────────────
section('4. .dtop changes nothing at a width that does not use it');
{
  for (const [w, h] of [[390, 844], [360, 740], [768, 1024]]) {
    const { page, ctx } = await draftPage(browser, w, h);
    /* ONE PAGE, TWO READINGS. display:contents is exactly "as if the wrapper
       were not there", so anything that moves between them is the wrapper's
       doing and nothing else. Two runs would be two different boards. */
    const read = (flat) => page.evaluate((f) => {
      const el = document.querySelector('.dtop');
      el.style.display = f ? 'contents' : '';
      void document.body.offsetHeight;
      const q = (s) => { const e = document.querySelector(s); if (!e) return 'none';
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100).join(','); };
      return [q('.reels'), q('#d-note2'), q('.btnrow'), q('#tabs'), q('#opts'), q('#court'),
        Math.round(document.body.scrollHeight * 100) / 100].join(' / ');
    }, flat);
    const shipped = await read(false);
    const flat = await read(true);
    ok(shipped === flat, `${w}x${h} is identical with and without the wrapper`);
    await ctx.close();
  }
}

// ── 5. a man who plays two spots gets two pills ─────────────────────────────
/* `posPills` has drawn one pill per position since it was written, with a
   comment explaining that one pill reading "PG/SG" in whichever colour the
   data listed first was the wrong answer. It had never once drawn two,
   because every row the fetch produced carried a single position, so the
   branch this section exists for was unreachable for the life of the file.
   Derived eligibility gives 22.0% of rows a second position.

   IT SPINS UNTIL IT FINDS ONE rather than asserting on the first board. A
   board is a real team-season and roughly a fifth of its men are eligible at
   two spots, so a board with none is an ordinary board and not a defect. What
   would be a defect is finding one and drawing it as a single pill. */
section('5. a two-position man draws two pills, not one reading PG/SG');
{
  const { page, ctx, boom } = await draftPage(browser, 1512, 950);
  let seen = 0, tiles = 0, glued = 0, spins = 0;
  for (; spins < 12 && !seen; spins++) {
    const read = await page.evaluate(() => {
      const out = [];
      for (const t of document.querySelectorAll('.opts:not(.pending) .ptile')) {
        const pills = [...t.querySelectorAll('.poss .pos')].map((e) => e.textContent.trim());
        out.push(pills);
      }
      return out;
    });
    tiles += read.length;
    seen += read.filter((p) => p.length > 1).length;
    glued += read.filter((p) => p.some((s) => /[/;]/.test(s))).length;
    if (seen) break;
    const spun = await page.evaluate(() => {
      const b = document.querySelector('#b-respin');
      if (!b || b.disabled) return false;
      b.click(); return true;
    });
    if (!spun) break;
    await page.waitForSelector('.opts:not(.pending) .ptile', { timeout: 30000 });
    await page.waitForTimeout(300);
  }
  ok(tiles > 0, `the board drew tiles to read (${tiles} over ${spins + 1} boards)`);
  ok(seen > 0, `a man eligible at two spots reached a board and drew two pills (${seen})`);
  ok(glued === 0, `no pill carries two positions glued into one (${glued})`);
  ok(!boom.length, `no page error while spinning for one${boom.length ? ': ' + boom[0] : ''}`);
  await ctx.close();
}

/* ── THE LAST PICK IS SAID BEFORE THE TAP, AND THE VALVE IS OPEN ───────────
 *
 * The reserve floor promises a legal roster and never a CHOICE, so a drafter
 * who spends down to it reaches the last slot able to afford one man. Measured
 * before the fix, the last board was a single forced option on 61.0% of
 * cap-spending runs and the re-spin was refused at the same moment on 43.6%,
 * because its fee is charged against a budget already at the floor.
 *
 * Both halves of the answer are on screen and neither throws if it goes: a
 * board with no warning on it looks exactly like a board that did not need
 * one, and "Re-spin ($0M)" reads as a rendering fault rather than as the one
 * thing that screen has to offer.
 *
 * IT DRAFTS THE DEAREST MAN IT CAN, because the cheapest bot is never trapped
 * and a walk that hoards money would pass having exercised nothing. And it
 * RETRIES THE RUN, because half of second to last boards correctly carry no
 * warning at all: one draft is a coin toss on whether the mark exists to find,
 * which is the seed this file's own header warns about reporting. */
{
  const { page, ctx, boom } = await draftPage(browser, 420, 900);

  /* A LANDED BOARD, NEVER JUST A TILE. `pending` sits on the PARENT, so
     `.ptile:not(.pending)` matches every tile the moment it exists, mid-spin
     included, and a scripted click ignores the pointer-events none that is the
     only other thing holding it shut. Pressed early the signing is dropped and
     the walk then reports the page as stuck. CLAUDE.md records this selector
     as load-bearing; this is it being load-bearing. */
  const board = () => page.waitForSelector('.opts:not(.pending) .ptile', { timeout: 20000 })
    .then(() => true, () => false);

  const slotsOpen = () => page.evaluate(() => {
    try {
      const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
      return r && r.roster ? (window.RTF_ENGINE.SLOTS.length - r.roster.length) : -1;
    } catch (e) { return -1; }
  });

  /* The DEAREST man each time, because the cheapest bot is never trapped and a
     walk that hoards money would pass having exercised nothing. */
  const signDearest = async () => {
    if (!(await board())) return false;
    const before = await slotsOpen();
    const got = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.opts:not(.pending) .ptile:not(.off)')];
      if (!t.length) return false;
      const price = (el) => Number((el.querySelector('.price')?.textContent || '')
        .replace(/[^0-9.]/g, '')) || 0;
      t.sort((a, b) => price(b) - price(a));
      t[0].click();
      return true;
    });
    if (!got) return false;
    await page.waitForFunction((n) => {
      try {
        const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
        return r && r.roster && r.roster.length > n;
      } catch (e) { return false; }
    }, before === -1 ? 0 : (5 - before), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(220);
    return true;
  };

  /* Home, then a fresh run. THE DOOR SAYS RESUME once a run is saved, so the
     start button is not what is on it: the run in hand has to be dropped
     first or the walk presses a control that is not there. */
  const freshRun = async () => {
    await page.evaluate(() => { const b = document.querySelector('#b-mark'); if (b) b.click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const ab = document.querySelector('#b-abandon');
      if (ab && ab.offsetParent !== null) ab.click();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.querySelector('#b-start'); if (b) b.click(); });
    return board();
  };

  let warned = null, lastFee = null, attempts = 0;
  while (attempts < 8 && (warned === null || lastFee === null)) {
    attempts++;
    let guard = 0;
    while ((await slotsOpen()) > 2 && guard++ < 10) { if (!(await signDearest())) break; }

    if ((await slotsOpen()) === 2 && (await board()) && warned === null) {
      const w = await page.evaluate(() => ({
        tiles: document.querySelectorAll('#opts .ptile .tight').length,
        all: document.querySelectorAll('#opts .tightall').length,
        text: (document.querySelector('#opts .tight, #opts .tightall') || {}).textContent || '',
      }));
      if (w.tiles + w.all > 0) warned = w;
    }

    while ((await slotsOpen()) > 1 && guard++ < 14) { if (!(await signDearest())) break; }
    if ((await slotsOpen()) === 1 && (await board()) && lastFee === null) {
      lastFee = await page.evaluate(() => {
        const b = document.querySelector('#b-respin');
        return b ? { label: b.textContent, off: b.disabled } : null;
      });
    }
    if ((warned === null || lastFee === null) && attempts < 8) {
      if (!(await freshRun())) break;
    }
  }

  ok(warned !== null,
    `a tight last slot was called out before the tap (found in ${attempts} drafts)`);
  if (warned) {
    /* ONE OR THE OTHER, NEVER BOTH. A mark on every tile says the same thing N
       times, which is this page's own divider rule one line up. */
    ok(!(warned.tiles > 0 && warned.all > 0),
      `the warning is per tile or said once, not both (${warned.tiles} tiles, ${warned.all} lines)`);
    ok(/\$\d/.test(warned.text) || /last pick/i.test(warned.text),
      `and it names what is left or what it costs ("${warned.text.slice(0, 60)}")`);
  }

  ok(lastFee !== null, 'the walk reached the last slot');
  if (lastFee) {
    ok(/free/i.test(lastFee.label),
      `the last slot re-spin is offered as free, not as a price ("${lastFee.label}")`);
    ok(!/\$0/.test(lastFee.label),
      `and never as $0M, which reads as a rendering fault ("${lastFee.label}")`);
    ok(!lastFee.off, 'and the button is live, which is the whole valve');
  }
  ok(!boom.length, `no page error on the draft walk${boom.length ? ': ' + boom[0] : ''}`);
  await ctx.close();
}

// ── 7. a club chip never promises a ring the wheel cannot reach ─────────────
section('7. every ring on a club chip is one you could actually spin into');
/*
 * The picker's own comment already makes this argument about the SEASON count:
 * a chip printing the club's age would promise twenty-eight seasons that
 * cannot be drawn, so it reads R.clubSeasons instead. One line later the ring
 * count was the franchise's ALL TIME total, and the two sit on one line joined
 * by a middot, so Boston read "53 seasons, 18 rings" with eleven of the
 * eighteen out of the pool. Atlanta and Sacramento each said "1 ring" about a
 * wheel holding no championship season whatsoever.
 *
 * THE EXPECTATION COMES OFF A DIFFERENT TABLE FROM THE PAINTER'S. The chip
 * filters f.titles, which is LINEAGE_TITLES; this asks E.wonTitle over every
 * season the wheel offers, which is TITLE_AT. Restating the painter's own
 * filter here would be two implementations of one answer, which is the shape
 * this repo already keeps a standing warning about.
 */
{
  const { page, ctx, boom } = await draftPage(browser, 390, 844);
  /* draftPage lands on the draft, so come back for the door. */
  await page.evaluate(() => { const b = document.querySelector('#b-mark'); if (b) b.click(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const ab = document.querySelector('#b-abandon');
    if (ab && ab.offsetParent !== null) ab.click();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('#b-franchise-go').click());
  await page.waitForSelector('#clubsheet.open #clubgrid .clubchip', { timeout: 15000 });
  await page.waitForTimeout(300);

  const chips = await page.evaluate(() => {
    const E = window.RTF_ENGINE, R = window.RTF_RUN;
    const byName = {};
    for (const f of E.franchises()) byName[f.name] = f;
    return [...document.querySelectorAll('#clubgrid .clubchip')].map((c) => {
      const name = c.querySelector('.cc-name').textContent;
      const ring = c.querySelector('.cc-rings');
      const printed = ring ? Number((ring.textContent.match(/\d+/) || [0])[0]) : 0;
      const f = byName[name];
      const codes = f ? E.franchiseCodes(f.code) : [];
      const seasons = f ? R.clubSeasons(f.code) : [];
      /* A championship season this wheel can actually deal. */
      let reachable = 0;
      for (const s of seasons) if (codes.some((cd) => E.wonTitle(cd, s))) reachable++;
      return { name, printed, reachable, allTime: f ? f.titles.length : 0 };
    });
  });

  ok(chips.length >= 25, `the picker draws every club (${chips.length})`);
  const wrong = chips.filter((c) => c.printed !== c.reachable);
  ok(wrong.length === 0, 'no chip prints a ring the wheel cannot deal'
    + (wrong.length ? `: ${wrong.slice(0, 3).map((c) => `${c.name} says ${c.printed}, can deal ${c.reachable}`).join('; ')}` : ''));

  /* COVERAGE, and it is the assertion that gives the one above teeth. A pool
     where every ring happened to be in the window would pass the line above
     with the filter deleted. Eight clubs are narrowed today, two to zero. */
  const narrowed = chips.filter((c) => c.reachable !== c.allTime);
  ok(narrowed.length >= 6,
    `and the two counts really do differ for some of them (${narrowed.length})`);
  const silent = chips.filter((c) => c.allTime > 0 && c.reachable === 0);
  ok(silent.length >= 2, `including some that must print no ring at all (${silent.length})`);
  ok(silent.every((c) => c.printed === 0),
    'and a club whose only rings are out of reach says nothing about rings');

  ok(!boom.length, `no page error opening the picker${boom.length ? ': ' + boom[0] : ''}`);
  await ctx.close();
}

// ── 8. the screen between the draft and the result knows the team ───────────
section('8. the season screen carries the five men');
/*
 * This screen held one card of three numbers. Measured through the real page,
 * its content ended at 237px of an 844px phone before tip-off and 464px with
 * the season running, against 780 to 3400 on every other screen: the team you
 * had just spent five spins building was absent from the last press of the
 * draft until the results screen.
 *
 * WHAT IS ASSERTED IS THE MEN, NOT THE HEIGHT. A card of the right size
 * holding the wrong roster is the failure worth catching, and a pinned page
 * height is a test of whichever phone somebody had. So the names on the
 * screen are compared against the roster in storage, and the fill is asserted
 * as a SHARE of the window rather than as a pixel count.
 */
{
  const { page, ctx, boom } = await draftPage(browser, 390, 844);
  const board = () => page.waitForSelector('.opts:not(.pending) .ptile', { timeout: 20000 })
    .then(() => true, () => false);

  for (let i = 0; i < 8; i++) {
    if (!(await page.$('#s-draft.active'))) break;
    if (!(await board())) break;
    const got = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.opts:not(.pending) .ptile:not(.off)')];
      if (!t.length) return false;
      t[0].click(); return true;
    });
    if (!got) break;
    await page.waitForTimeout(560);
  }

  await page.waitForSelector('#s-season.active', { timeout: 20000 }).catch(() => {});
  const seen = await page.evaluate(() => {
    const card = document.querySelector('#squadcard');
    if (!card) return null;
    const rows = [...card.querySelectorAll('.slot')];
    let run = null;
    try { run = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null'); } catch (e) {}
    const screen = document.querySelector('#s-season.active');
    return {
      rows: rows.length,
      names: rows.map((r) => (r.querySelector('.who') || {}).childNodes
        ? r.querySelector('.who').childNodes[0].textContent : ''),
      roster: run && run.roster ? run.roster.map((p) => p.n) : [],
      sub: (document.querySelector('#p-spend') || {}).textContent || '',
      fill: screen ? Math.round(screen.getBoundingClientRect().height) : 0,
      view: innerHeight,
      empty: rows.filter((r) => r.classList.contains('empty')).length,
    };
  });

  ok(seen !== null, 'the season screen carries a squad card at all');
  if (seen) {
    ok(seen.rows === 5, `it lists one row a slot (${seen.rows})`);
    ok(seen.empty === 0, `and after a full draft none of them is open (${seen.empty})`);
    /* THE MEN IN STORAGE, so a card of the right shape holding somebody
       else's roster fails rather than passing on its row count. */
    const missing = seen.roster.filter((n) => !seen.names.includes(n));
    ok(seen.roster.length === 5 && missing.length === 0,
      `and the names are the roster's own${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
    ok(/\$[\d.]+M of \$[\d.]+M spent/.test(seen.sub),
      `the sub says what the draft cost ("${seen.sub}")`);
    /* A SHARE, NEVER A PIXEL COUNT. Before this the screen used 28% of a
       phone; the floor is well under what it reaches now and well over what
       one card of three numbers can. */
    ok(seen.fill > seen.view * 0.6,
      `and the screen is no longer mostly empty (${seen.fill}px of ${seen.view})`);
  }
  ok(!boom.length, `no page error reaching the season${boom.length ? ': ' + boom[0] : ''}`);
  await ctx.close();
}

// ── 9. a reel that lands after the run is gone ─────────────────────────────
section('9. a spin lands into its own draw or not at all');
/*
 * FOUND BY SECTION 7, which only wanted to reach the club picker and had to
 * abandon a run to get there. A spin is about a second long, so pressing the
 * wordmark mid-spin and then Abandon leaves two timers pointed at a run that
 * is now null: the landing callback ran anyway, walked into R.remaining(run)
 * and threw "Cannot read properties of null (reading 'roster')" out of an
 * animation, on the home screen.
 *
 * THE THROW IS NOT THE WORST OF IT. dressPage fires first, so the abandoned
 * club painted the FRONT PAGE in its colours on the way out. That renders
 * perfectly, reports nothing, and is a home screen wearing a team the player
 * has just thrown away. `body.clubbed` is the whole of it, which is why this
 * asserts the class rather than the exception.
 *
 * And reelBusy is the other half: it is the flag drawInto refuses on, so a
 * stale spin that simply returned would leave the NEXT draft unable to deal a
 * board at all. The walk starts a second run to say so.
 */
{
  const { page, ctx, boom } = await draftPage(browser, 390, 844);

  /* Mid-spin, deliberately: press Spin and leave before it lands. */
  await page.evaluate(() => { const b = document.querySelector('#b-spin'); if (b && !b.disabled) b.click(); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { const b = document.querySelector('#b-mark'); if (b) b.click(); });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const ab = document.querySelector('#b-abandon');
    if (ab && ab.offsetParent !== null) ab.click();
  });
  /* Well past the landing the callbacks were scheduled for. */
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => ({
    clubbed: document.body.classList.contains('clubbed'),
    home: !!document.querySelector('#s-home.active'),
  }));
  ok(after.home, 'abandoning mid-spin leaves you on the front page');
  ok(!after.clubbed,
    'and the front page is not wearing the colours of the run that was thrown away');
  ok(!boom.length,
    `and nothing threw out of the animation${boom.length ? ': ' + boom[0] : ''}`);

  /* reelBusy has to have been released, or the next run deals no board. */
  await page.evaluate(() => { const b = document.querySelector('#b-start'); if (b) b.click(); });
  const dealt = await page.waitForSelector('.opts:not(.pending) .ptile', { timeout: 20000 })
    .then(() => true, () => false);
  ok(dealt, 'and the next run still deals a board, so the busy flag was released');

  await ctx.close();
}

await browser.close();

console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log(`${passed} assertions passed.`);
