/*
 * check-home.mjs - how far a player scrolls before the front page is over.
 *
 *   node hoops/check-home.mjs
 *
 * ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 *
 * The front page carried two open cards of prose at the bottom of it, "How a
 * run goes" and "Why six stars lose", and between them they were 1,682px of a
 * 3,082px page at 390 and 1,846 of 3,236 at 360. MORE THAN HALF THE HOME
 * SCREEN WAS AN ESSAY, on every visit, for as long as somebody kept playing.
 * Reported by a player as too much to scroll.
 *
 * Nothing could report it and nothing did. The cards rendered, the words were
 * right, and length is not a thing any other checker here asks about: verify
 * asks whether the game is correct, check-draft asks whether one screen is
 * the shape it claims, and neither of them has an opinion about how long a
 * page is. So this one measures the page in SCREENS of the viewport, because
 * 1.7 screens is the complaint answered and 1,450px is a number.
 *
 * ── WHAT IT HOLDS ──────────────────────────────────────────────────────────
 *
 * THE CARD IS SHUT ON ARRIVAL. That is the whole of the fix: the prose is one
 * folded card now, and the only way the page goes back to four screens is for
 * somebody to open it by default or take the fold out.
 *
 * FOLDED IS NOT HIDDEN. The comment that used to sit over the second card
 * argued that a game page whose every word arrives after a click reads as
 * empty to a crawler and to a reviewer, and that argument survives a details
 * element and would not survive the obvious alternative, which is to move the
 * text to the rules page and link it. So the words are COUNTED in the DOM
 * while the card is shut, which is the property that alternative breaks.
 *
 * THE CEILING IS A BAND, NOT A PIXEL. Two screens at a phone width is what
 * this page should cost: the doors, the league, and the fold. It is measured
 * at the two narrow widths that actually bind and at a desktop, because the
 * defect was worst at 360 and this page is read on a phone.
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

async function homePage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { timeout: 30000 });
  /* The first-time guide is a scrim over the whole page and it is correct: it
     is not what this file is about, and it is dismissed the same way a reader
     dismisses it. */
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await page.waitForTimeout(300);
  return { page, ctx, boom };
}

const browser = await pw.chromium.launch({ executablePath: CHROME });

// ── 1. the front page fits ──────────────────────────────────────────────────
section('1. the front page is under three screens, on the widths that bind');
{
  /* 360 is narrower AND shorter, so it is the worst case and not 320: what
     costs screens here is prose reflowing into more lines against a viewport
     with fewer pixels to spend on them. Measured before this pass: 3.65
     screens at 390 and 4.37 at 360. */
  for (const [w, h] of [[390, 844], [360, 740], [1512, 950]]) {
    const { page, ctx, boom } = await homePage(browser, w, h);
    const g = await page.evaluate(() => ({
      page: document.documentElement.scrollHeight,
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    const screens = g.page / h;
    /* 2.8 SINCE THE PAGE BECAME FOUR GAMES, and that is a move made on
       purpose rather than to get a run through. The budget was 2.4 while the
       front page held one mode, and the complaint it answered was an essay
       nobody asked for: that essay is still folded, and a check that it stays
       folded is section 2. What grew is Fix History, Six Passes and Conquest,
       each a door, and the page was compacted first: the league card became
       one line, the cards and the Quick Draft court were tightened, and the
       blurbs lost a sentence each. Measured after: 2.30 at 390x844 and 2.67
       at 360x740. An unfolded essay is about a screen and a half on its own,
       so this still fails on the regression it exists for. */
    ok(screens < 2.8, `${w}x${h}: ${screens.toFixed(2)} screens (${g.page}px)`);
    ok(g.over === 0, `${w}x${h}: nothing hangs off the side`);
    ok(boom.length === 0, `${w}x${h}: no page errors (${boom.join(' | ') || 'none'})`);
    await ctx.close();
  }
}

// ── 2. the fold, and the words behind it ────────────────────────────────────
section('2. one shut card, with the prose in the DOM while it is shut');
{
  const { page, ctx } = await homePage(browser, 390, 844);
  const g = await page.evaluate(() => {
    const folds = [...document.querySelectorAll('#s-home details')];
    const ht = document.querySelector('#home-howto');
    /* Read WHILE SHUT. A details keeps its contents in the tree either way,
       which is the entire reason this is a fold rather than a link to the
       rules page, so the count is taken before anything is opened. */
    const words = ht ? (ht.textContent || '').trim().split(/\s+/).length : 0;
    /* Any card on this screen still carrying a wall of prose in the open. */
    const openProse = [...document.querySelectorAll('#s-home > .card')]
      .filter(c => c.tagName !== 'DETAILS'
        && (c.textContent || '').trim().split(/\s+/).length > 90)
      .map(c => (c.querySelector('h2') || c).textContent.trim().slice(0, 30));
    const sum = ht && ht.querySelector('summary');
    const r = sum ? sum.getBoundingClientRect() : { height: 0 };
    return { n: folds.length, open: ht ? ht.open : null, words, openProse,
      head: sum ? (sum.querySelector('h2') || {}).textContent : null,
      tap: Math.round(r.height) };
  });

  ok(g.n === 1, `one folded card on the home screen (${g.n})`);
  ok(g.open === false, 'and it is shut when the page arrives');
  ok(/how to play/i.test(g.head || ''), `headed How to play ("${(g.head || '').trim()}")`);
  /* The two cards it replaced ran to about 460 words between them. */
  ok(g.words > 350, `the prose is in the DOM while it is shut (${g.words} words)`);
  ok(g.openProse.length === 0,
    `nothing else on the screen is a wall of text (${g.openProse.join(', ') || 'none'})`);
  ok(g.tap >= 44, `the summary is a real tap target (${g.tap}px)`);

  /* IT OPENS, which is not as obvious as it reads: the summary carries an h2,
     and a heading is a block that will happily sit across the marker and eat
     the press if it is not told to share the row. */
  await page.evaluate(() => document.querySelector('#home-howto summary').click());
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const ht = document.querySelector('#home-howto');
    return { open: ht.open, h: Math.round(ht.getBoundingClientRect().height),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      /* Both halves are in there, the second one under its own turn. */
      turn: !!ht.querySelector('.ht-turn'),
      rules: !!ht.querySelector('a[href*="how-to-play"]') };
  });
  ok(after.open === true, 'pressing the heading opens it');
  ok(after.h > 800, `and there is a card's worth behind it (${after.h}px)`);
  ok(after.turn, 'with the second half under its own heading');
  ok(after.rules, 'and the full rules still linked from the end of it');
  ok(after.over === 0, 'open, nothing hangs off the side');
  await ctx.close();
}

// ── 3. the guide says what the game actually asks of you ────────────────────
section('3. the first run guide names the games you get to call');
/*
 * The guide is the one screen a stranger cannot skip, and its three steps
 * said "then the season plays itself" and stopped. The most distinctive thing
 * this game does is hand you every Game 7 to play yourself, and a
 * first-timer was told the opposite in as many words.
 *
 * A WORD LIST IS THE ONLY CLAIM THAT FITS. No measurement of the glass can
 * say whether a guide is telling the truth about the mode, which is the same
 * shape as the coach-note guard in the baseball game. What is also asserted
 * is the ROOM: the panel is content sized under a max-height and 360x640 is
 * the tight one, so a fourth step added later has to fail here rather than
 * ship as a guide whose own explanation is below its own fold.
 */
{
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const boom = [];
    page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
    await page.route('**/*', serve);
    await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#b-today:not([disabled])', { timeout: 30000 });
    await page.waitForTimeout(400);

    /* THE ARROW POINTS AT TODAY'S PLAY, which is the button the dock carries
       now that the draft is one mode of four. It was #b-start, and a check
       still reading #b-start would be measuring a button inside a card
       halfway down the page, which the scrim correctly covers. */
    const g = await page.evaluate(() => {
      const pan = document.querySelector('#frg-panel');
      const start = document.querySelector('#b-today');
      const r = start.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        up: !document.querySelector('#frg').hidden,
        steps: [...document.querySelectorAll('#frg-steps li')].map((li) => li.textContent),
        scrolls: pan.scrollHeight > pan.clientHeight + 1,
        need: pan.scrollHeight, have: pan.clientHeight,
        startLive: hit === start || start.contains(hit),
      };
    });

    ok(g.up, `${w}x${h}: the guide is up on a first visit`);
    const all = g.steps.join(' ');
    /* GAME 7 AND NOTHING WIDER. The door used to open on any game that could
       end a series plus every Finals game, which met a first round exit with
       five stops. It opens on a Game 7 alone now (poNext's `big`), so a guide
       still promising the wider rule is a guide that lies. */
    ok(/game 7/i.test(all), `${w}x${h}: it says every Game 7 is yours to play`);
    /* FOUR MODES, AND A GUIDE THAT NAMES THREE HIDES ONE. A first-timer told
       only how to draft never finds the other three, which is the reason the
       guide was rewritten. */
    for (const m of ['Fix History', 'Six Passes', 'Conquest', 'Quick Draft']) {
      ok(all.indexOf(m) >= 0, `${w}x${h}: the guide names ${m}`);
    }
    ok(!/end a series|every game of the finals/i.test(all),
      `${w}x${h}: and no longer promises the wider rule it replaced`);
    /* THE OLD SENTENCE ON ITS OWN IS THE DEFECT. "The season plays itself" is
       still true of the 82 and stays; what may not come back is that clause
       standing alone as the whole of what happens after the draft. */
    ok(!/plays itself[^.]*\.\s*\d+ games[^.]*\.\s*$/i.test(g.steps[2] || ''),
      `${w}x${h}: the season step does not end at "the playoffs if you get there"`);
    ok(!g.scrolls, `${w}x${h}: and the panel does not scroll inside itself `
      + `(${g.need} of ${g.have})`);
    /* The way out of the guide is the button it points at, which is the
       whole of its design and the thing an extra line could cover. */
    ok(g.startLive, `${w}x${h}: today's play is still the element at its own centre`);
    ok(boom.length === 0, `${w}x${h}: no page errors (${boom.join(' | ') || 'none'})`);
    await ctx.close();
  }
}

await browser.close();

console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log(`${passed} assertions passed.`);
