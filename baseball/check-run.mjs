#!/usr/bin/env node
/* A WHOLE RUN, IN A REAL BROWSER, TO THE SCREEN IT ENDS ON.
 *
 *   node baseball/check-run.mjs           a Classic run and a daily, about three minutes
 *
 * Every other checker here asks whether one thing is right. check-atbats holds the
 * line score to the score it was handed, check-bracket holds the field to the run,
 * check-badges plays the game in node and never opens a page. NOTHING REACHED THE
 * RESULTS SCREEN. The theme walk drafts a few picks and stops, so the results
 * screen, the trophy cabinet, the share card, the board submit and the daily record
 * had never been exercised in a browser at all, and they are the last five things a
 * player meets.
 *
 * That is the join this file is about. The bug that lives there is the one the
 * football game's own long walk exists for: three files each individually correct,
 * wrong only together, in the page, with the last screen still up and the button
 * doing nothing for ever. A mid-beat exception leaves exactly that, so `pageerror`
 * is collected throughout and is its own failure.
 *
 * NOTHING REACHES THE NETWORK. The leaderboard is a real Supabase project holding a
 * real competition, so every request out of the page is refused at the route and the
 * refusals are counted: a submit that got out would file a fabricated season on the
 * live board. That is the Stripe note in this repo's own words, arriving at a
 * different service.
 *
 * FOUR THINGS A WALKER OF THIS GAME HAS TO KNOW, each of which cost a round:
 *
 *   the board      #opts is EMPTY until the reels land, because paintOpts is
 *                  spinBoth's callback. Waiting on the container waits on nothing.
 *   a tile         is not always a signing. A man who fits two open slots opens the
 *                  position chooser, and a walk that does not answer it clicks the
 *                  same tile for ever at "Spin 1 of 12".
 *   a sheet        is a scrim over the whole page, so the next press lands on the
 *                  scrim and retries against a sheet nobody closed. The failure
 *                  reads as a button that cannot be clicked.
 *   the panel      lists at most six badges and then says how many more, so its
 *                  count comes from the headline rather than from its rows.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import http from 'http';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8137;

/* Served over http rather than file://, because the page fetches its pool and its
   curated chemistry beside itself and a file:// origin refuses both. */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = await new Promise((res) => {
  const s = http.createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      rep.writeHead(404).end('no'); return;
    }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
      .end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const errors = [];
const blocked = [];

async function openPage(opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  /* EVERYTHING OUT OF THE PAGE IS REFUSED, and counted rather than merely aborted:
     a run that silently stopped talking to the board would look the same as one
     that was never wired to it. The pool and the page itself are same-origin and
     go to the local server above. */
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://localhost:' + PORT)) return route.continue();
    blocked.push(u);
    return route.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.addInitScript(() => {
    try { localStorage.setItem('rtd_seen_intro_v1', '1'); } catch (_) {}
  });
  await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  if (opts && opts.daily) await p.click('#daily-card');
  else await p.click('#b-start');
  await p.waitForSelector('#s-draft.on', { timeout: 20000 });
  return { ctx, p };
}

/* THE TILES ARE PAINTED AFTER THE REELS LAND, not with them: `spinBoth` takes
   `paintOpts` as its callback, so `#opts` is empty for as long as the year and the
   team are still turning. Waiting on the container rather than on its children
   is therefore waiting on nothing, and a scripted click ignores pointer events, so
   the walk would sign off a board that was not on screen yet and the next spin
   would land on a draft that never redrew. */
async function board(p) {
  await p.waitForFunction(() => {
    const o = document.getElementById('opts');
    return o && o.querySelectorAll('.tile').length > 0;
  }, null, { timeout: 25000 });
}

/* Twelve picks, taking the dearest tile that is signable. An affordable tile is
   what the page itself decides, so the walk asks the page rather than working it
   out again: a second copy of that rule is the Full Team glow bug waiting to
   happen, where the picture read one thing and the board read another. */
async function draft(p) {
  for (let i = 0; i < 12; i++) {
    await board(p);
    const took = await p.evaluate(() => {
      const tiles = [...document.querySelectorAll('#opts .tile')]
        .filter((t) => !t.classList.contains('off') && !t.disabled);
      if (!tiles.length) return null;
      /* The dearest signable man, read off the tile's own price cell. A blocked
         tile prints a REASON in that cell rather than a price, which is why the
         filter comes first rather than the parse standing in for it. */
      const price = (t) => {
        const m = /\$([\d.]+)M/.exec((t.querySelector('.pr') || {}).textContent || '');
        return m ? parseFloat(m[1]) : 0;
      };
      const pick = tiles.sort((a, b) => price(b) - price(a))[0];
      const name = (pick.querySelector('.nm') || pick).textContent.trim();
      pick.click();
      return name;
    });
    /* A TILE IS NOT ALWAYS A SIGNING. A man who fits more than one open slot opens
       the position chooser instead, and the walk has to answer it: without this the
       sheet sat there, the next pass read the same board, clicked the same tile,
       and the draft never left "Spin 1 of 12". It is the natural slot where the
       sheet marks one, which is what the sheet itself leads with. */
    await p.waitForTimeout(60);
    await p.evaluate(() => {
      const sheet = document.getElementById('sheet-pos');
      if (!sheet || !sheet.classList.contains('on')) return;
      const opts = [...sheet.querySelectorAll('.pos-opt')];
      (opts.find((o) => o.classList.contains('natural')) || opts[0]).click();
    });
    if (took == null) {
      /* No signable tile: the re-spin is the way on, and it is what a player does. */
      const spun = await p.evaluate(() => {
        const b = document.getElementById('b-respin');
        if (!b || b.disabled) return false;
        b.click(); return true;
      });
      if (!spun) return { stalled: i };
      i--;
      continue;
    }
    await p.waitForTimeout(90);
  }
  return { stalled: null };
}

/* The season, then October, then the screen it all ends on. Every beat here is
   driven by a timer in the page, so the walk presses the page's own way forward
   rather than waiting any of them out. */
async function toResults(p) {
  await p.waitForSelector('#s-squad.on', { timeout: 30000 });
  await p.click('#b-playball');
  await p.waitForSelector('#s-season.on', { timeout: 20000 });
  await p.waitForSelector('#b-sim-fast', { state: 'visible', timeout: 30000 });
  await p.click('#b-sim-fast');
  /* October is a bracket that reveals itself, a series card and a live game, and
     which of the three is up depends on how the season went. Press whichever way
     forward is on screen until the results screen is. */
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    if (await p.$('#s-over.on')) return true;
    await p.evaluate(() => {
      const hit = (sel) => {
        const e = document.querySelector(sel);
        if (e && e.offsetParent !== null && !e.disabled) { e.click(); return true; }
        return false;
      };
      hit('#b-brk-skip') || hit('#sr-simall') || hit('#gm-simall') || hit('#sr-sim');
    });
    await p.waitForTimeout(300);
  }
  return !!(await p.$('#s-over.on'));
}

// ══ 1. a Classic run, end to end ═══════════════════════════════════════════
head('1. A WHOLE RUN REACHES THE SCREEN IT ENDS ON');
const { ctx, p } = await openPage({});
const drafted = await draft(p);
claim(drafted.stalled === null, 'twelve picks, with no board the draft could not go on from',
  drafted.stalled != null ? `stalled at pick ${drafted.stalled + 1}` : '');
const arrived = await toResults(p);
claim(arrived, 'the season and October hand off to the results screen');

// ══ 2. what the results screen says ════════════════════════════════════════
head('2. AND IT HAS SOMETHING TO SAY ON IT');
const r = await p.evaluate(() => {
  const txt = (id) => (document.getElementById(id) || {}).textContent?.trim() || '';
  const seen = (id) => {
    const e = document.getElementById(id);
    return !!e && e.offsetParent !== null;
  };
  return {
    record: txt('ro-record'), verdict: txt('ro-verdict'),
    rating: txt('ro-rating'), rank: txt('ro-rank'), eff: txt('ro-eff'),
    takes: txt('ro-takes'), arch: txt('ro-arch'),
    rosterRows: document.querySelectorAll('#r-roster .rrow, #r-roster .rline, #r-roster li').length,
    rosterText: (document.getElementById('r-roster') || {}).textContent?.trim().length || 0,
    badges: txt('ro-newbadges'),
    share: seen('b-share'), again: seen('b-again'), trophy: seen('b-trophy-2'),
    stored: (() => { try { return JSON.parse(localStorage.getItem('rtd_history') || '[]'); } catch (_) { return []; } })(),
  };
});
claim(/\d+\s*[^\d]\s*\d+/.test(r.record), `the record is a record: ${JSON.stringify(r.record)}`);
claim(/\w/.test(r.verdict), `a verdict, rather than an empty hero: ${JSON.stringify(r.verdict)}`);
/* THE THREE CELLS ARE THE WHOLE OF WHAT THE SCREEN CLAIMS ABOUT THE DRAFT, and two
   of the three have failed silently on this page before: the rating was re-anchored
   twice, and a branch beside them read a field outcomeOf has never set, so it was
   dead on every run the game had ever played. An empty cell renders perfectly.
   THE DRAFT GRADE IS A LETTER AND NOT A NUMBER, which the first draft of this
   asserted wrongly and reported a correct screen as broken. */
for (const [k, label] of [['rating', 'Team rating'], ['rank', 'All-time rank']]) {
  claim(/\d/.test(r[k]), `${label} carries a number: ${JSON.stringify(r[k])}`);
}
claim(/^[A-F][+-]?$/.test(r.eff), `the draft grade is a grade: ${JSON.stringify(r.eff)}`);
claim(/\w/.test(r.takes), "the coach's take is not blank");
claim(/\w/.test(r.arch), `the roster has a shape: ${JSON.stringify(r.arch)}`);
claim(r.rosterText > 100, 'the twelve are listed under it', `roster text ${r.rosterText} chars`);
claim(r.share && r.again && r.trophy, 'there is somewhere to go from here',
  `share ${r.share}, again ${r.again}, trophy ${r.trophy}`);

// ══ 3. the row it files is the row the cabinet reads ═══════════════════════
head('3. THE SEASON IS FILED, AND THE BADGES IT LIT ARE NAMED');
claim(r.stored.length === 1, 'exactly one season is in the history', `${r.stored.length} rows`);
const row = r.stored[0] || {};
claim(row.picks && row.picks.length === 12, 'the filed row carries all twelve picks',
  `picks ${row.picks ? row.picks.length : 'none'}`);
claim(typeof row.rating === 'number' && row.rating > 0, 'and a rating', `rating ${row.rating}`);
claim(typeof row.efficiency === 'number', 'and a draft efficiency', `efficiency ${row.efficiency}`);
/* A FIRST SEASON LIGHTS THE BOTTOM RUNG OF EVERY LADDER, so the panel is dozens of
   names, and "Play ball" is always one of them. newlyEarned answers by asking the
   question either side of the write, so it has to be computed against the history
   BEFORE the row goes in.
   NAMED, NOT COUNTED, because the near miss is what a count waves through: driven
   with the write moved above the ask, the panel still says "1 badge earned" (the
   one rung that needs two rows), and an assertion that merely looked for the word
   "badge" passed on it. Play ball cannot be earned by a history that already
   contains the season, so it is the one name that reports the order. */
/* READ OFF THE HEADLINE, NOT BY COUNTING THE LIST. The panel prints at most six
   badges and then a line saying how many more, so counting the rows tops out at
   six whatever the run did: the first draft of this asked for eight and was a
   threshold the page cannot reach, which is exactly the fault check-badges.mjs
   exists to stop shipping, arriving in the checker instead of the catalogue. */
const litCount = Number((/(\d+)\s+badges?\s+earned/i.exec(r.badges) || [])[1] || 0);
claim(/Play ball/.test(r.badges),
  'the new badges panel names the first season itself',
  `panel says ${JSON.stringify(r.badges.slice(0, 70))}`);
claim(litCount >= 10, `and counts the rest of what this run lit (${litCount})`);

// ══ 4. the cabinet opens on it ═════════════════════════════════════════════
head('4. THE CABINET OPENS, AND IT IS NOT A WALL');
await p.click('#b-trophy-2');
await p.waitForTimeout(350);
const cab = await p.evaluate(() => {
  const body = document.getElementById('trophy-body');
  if (!body) return null;
  const inShutFold = (e) => {
    for (let n = e; n && n !== body; n = n.parentElement) if (n.tagName === 'DETAILS' && !n.open) return true;
    return false;
  };
  const tiles = [...body.querySelectorAll('.ach')];
  return {
    total: tiles.length,
    open: tiles.filter((e) => !inShutFold(e)).length,
    groups: body.querySelectorAll('.trophy-group').length,
    folds: body.querySelectorAll('details.tg-more').length,
    headline: (body.firstElementChild || {}).textContent || '',
    height: Math.round(body.scrollHeight),
    career: (document.getElementById('trophy-career') || {}).textContent || '',
  };
});
claim(cab && cab.total > 100, `every badge in the catalogue is drawn (${cab && cab.total})`);
claim(cab && cab.groups >= 9 && cab.folds >= 1, 'on shelves, with the locked half folded',
  cab ? `${cab.groups} shelves, ${cab.folds} folds` : '');
claim(cab && cab.open > 0 && cab.open < cab.total / 2,
  `what you earned is open and the rest is not (${cab && cab.open} of ${cab && cab.total})`);
/* MEASURED, BECAUSE THE COMPLAINT THIS FOLD ANSWERS IS A NUMBER. Drawn flat the
   sheet is about nine thousand pixels on a phone; a first season should be a
   fraction of that and should grow with what you win. */
claim(cab && cab.height < 4000, `and the sheet is ${cab && cab.height}px rather than nine thousand`);
claim(/\d/.test(cab ? cab.career : ''), 'the career line above it carries numbers');
/* SHUT IT BEHIND US. A sheet is a scrim over the whole screen, so the next section's
   press lands on the scrim and retries for thirty seconds against a sheet nobody
   closed. The failure reads as the button being unclickable. */
await p.click('#sheet-trophy .sheet-x');
await p.waitForSelector('#sheet-trophy.on', { state: 'hidden', timeout: 10000 });

// ══ 5. the share card is drawn, not blank ══════════════════════════════════
head('5. THE SHARE CARD IS DRAWN');
/* PRESSED RATHER THAN CALLED. `drawShareCard` lives inside the page's IIFE and is
   on no global, which is right: a checker that needed it exported would be asking
   the page to grow a seam for the test. What the button does is build the canvas,
   turn it into a blob and, with no navigator.share and no clipboard to fall through
   to, hand the reader a PNG. So the walk hooks `toBlob`, which is a browser API and
   not the page's, and reads the canvas the page passed it.
   The download is asserted too, because the FILE is what a player actually gets. */
await p.evaluate(() => {
  const real = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (...a) {
    window.__shareCanvas = this;
    return real.apply(this, a);
  };
});
const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await p.click('#b-share');
const file = await dl;
await p.waitForTimeout(400);
const card = await p.evaluate(() => {
  const cv = window.__shareCanvas;
  if (!cv || !cv.getContext) return { err: 'the button drew no canvas' };
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  /* A BLANK CARD IS A VALID IMAGE, which is why this reads pixels rather than
     asking whether the function returned. The football card printed its seventh
     row straight through its own closing rule for a whole mode and still rendered,
     saved and shared; it took a player with a screenshot.
     COUNTED AGAINST THE MODAL COLOUR, NOT AGAINST THE FIRST PIXEL. The first draft
     compared every sample with pixel (0,0), which on this card is the border rather
     than the stock, so it reported 97.6% of the image as "not the background" and
     would have passed on a card with one rule drawn across a wash. What says there
     is really something here is how much of it is NOT the one colour it is mostly
     made of, plus how many colours there are at all.
     Sampled on a stride that is not a factor of the width, so the walk cannot land
     on one column. */
  const seen = new Map();
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 37, n++) {
    const k = (d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3);
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const modal = Math.max(...seen.values());
  return { w: cv.width, h: cv.height, sampled: n, colours: seen.size, modalShare: modal / n };
});
claim(!card.err, 'pressing Share draws the card' + (card.err ? ': ' + card.err : ''));
claim(card.w > 400 && card.h > 400, `at a real size (${card.w}x${card.h})`);
claim(card.colours > 40, `and it is not one flat colour (${card.colours} of them)`);
claim(card.modalShare < 0.9,
  `with real ink on it (its commonest colour is ${(card.modalShare * 100).toFixed(1)}% of the card)`);
claim(!!file && /\.png$/.test(file.suggestedFilename() || ''),
  `and the reader is handed a file: ${file ? file.suggestedFilename() : 'none'}`);

await ctx.close();

// ══ 6. the daily records itself ════════════════════════════════════════════
head('6. A DAILY IS RECORDED, AND THE CARD SAYS SO NEXT TIME');
const d1 = await openPage({ daily: true });
const dDraft = await draft(d1.p);
claim(dDraft.stalled === null, 'the daily drafts twelve');
const dArrived = await toResults(d1.p);
claim(dArrived, 'and reaches its own results screen');
const stored = await d1.p.evaluate(() => {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const eastern = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  return { daily: read('rtd_daily'), hist: read('rtd_history') || [], eastern };
});
claim(!!stored.daily, 'the daily is written to its own key');
claim(stored.daily && stored.daily.date === stored.eastern,
  `on the EASTERN day, not the browser's (${stored.daily && stored.daily.date} against ${stored.eastern})`);
claim(stored.daily && typeof stored.daily.v === 'number',
  'carrying the version the page checks on the way back in');
claim(stored.daily && typeof stored.daily.n === 'number' && stored.daily.n > 0,
  `and which puzzle it was (#${stored.daily && stored.daily.n})`);
/* A DAILY IS A SEASON TOO. It is filed in the history like any other, with the
   flag set, or the whole daily shelf of the cabinet asks about nothing. */
const dRow = stored.hist[stored.hist.length - 1] || {};
claim(stored.hist.length === 1 && dRow.daily === true,
  'and it is in the history with its own flag set', `rows ${stored.hist.length}, daily ${dRow.daily}`);

/* THE CARD A RETURNING VISITOR MEETS, IN THE SAME JAR THE RUN WAS PLAYED IN, which
   is the half the page's own front screen is for: a daily that recorded itself and
   a front page that does not know it is the same defect as never recording it. */
await d1.p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
await d1.p.waitForSelector('#s-intro.on', { timeout: 20000 });
const backCard = await d1.p.evaluate(() => {
  const card = document.querySelector('.dailycard');
  const go = document.querySelector('.dc-go');
  return { played: !!card && card.classList.contains('played'),
           label: go ? go.textContent.trim() : null,
           text: card ? card.textContent : '' };
});
claim(backCard.played, 'coming back, the card knows the day has been played');
claim(/result/i.test(backCard.label || ''),
  `and says so on the label: ${JSON.stringify(backCard.label)}`);

// ══ 7. nothing got out, and nothing threw ══════════════════════════════════
head('7. NOTHING LEFT THE PAGE, AND NOTHING THREW');
/* The board is a real project holding a real competition. A run that submitted
   would file a fabricated season on it, so this is a claim about the HARNESS as
   much as about the page: every request out was refused at the route. */
const hosts = [...new Set(blocked.map((u) => { try { return new URL(u).host; } catch (_) { return u; } }))];
console.log('        requests refused at the route: ' + blocked.length
  + (hosts.length ? ' (' + hosts.join(', ') + ')' : ''));
/* THE LEADERBOARD IS THE ONE THAT MATTERS. Every other host here is a font or an
   analytics beacon; a request to the board is a season being filed on a live
   competition. It must be refused, and this says so by name rather than by a
   count, because a count of five is the same number whether the board was in it
   or not. */
const boardTried = blocked.filter((u) => /supabase/i.test(u));
/* Every request out was aborted BY CONSTRUCTION, so "nothing got out" is a property
   of the route rather than a finding. What is worth asserting is the other half:
   that the submit path RAN AT ALL. A board.js that quietly stopped submitting looks
   exactly like one that is working, because every call in it fails soft and
   resolves to null by design. */
claim(boardTried.length >= 1,
  `the run tried to file itself on the board, and was refused here (${boardTried.length} attempt(s))`);
claim(errors.length === 0, 'no page error anywhere in two whole runs',
  errors.slice(0, 4).join(' | '));
await d1.ctx.close();

await browser.close();
server.close();
console.log('\n' + (fails ? `${fails} of ${checks} checks FAILED` : `All ${checks} checks passed.`));
process.exit(fails ? 1 : 0);
