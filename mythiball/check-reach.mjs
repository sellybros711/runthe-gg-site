#!/usr/bin/env node
/* MythiBall: can a thumb reach it?

   `body.ingame` sets `overflow:hidden`, so a control laid out past the edge of
   the window is not a scroll away. It is GONE. Four of them were, and every one
   rendered perfectly:

     Bunt      24px off the right at 320x568, so the third swing was unreachable
     End Game  24px below the bottom at 320x568 while pitching
     Mound     18px below the bottom at 667x375 held sideways
     Slowball  30px off the right at 844x390 held sideways

   AND ONE UNDER ANOTHER IS THE WORSE HALF OF THE SAME FAULT: off the screen it
   does nothing, and underneath something else it does the WRONG thing. A chip
   pinned to a corner lands on whatever is in that corner, and the corner of a
   deck is where the buttons are. Sideways on a 667 by 375 phone the End Game
   chip covered ten pixels of Mound, so a tap meaning "change my pitcher" opened
   the sheet that abandons the game.

   NOTHING ELSE HERE CAN SEE THIS. `check-firstpitch` measures the glass and asks
   whether one pitch can be READ; `verify-rules` puts the game in a situation and
   asks whether the rule is right. A button off the side of the window is neither:
   the rule is right, the picture is right, and the control is not there.

   IT PLAYS RATHER THAN POSING. The first version measured the first frame of a
   game and would have passed the fault it was written for, because the deck
   grows: the play by play fills up all game, a pitching deck is taller than a
   batting one, and the mound offer and the send button come and go with the
   situation. So it plays at each screen and samples every pressable control's
   rectangle throughout, keeping the WORST reading. It is bounded in wall clock
   rather than in presses, because a press budget is a guess about how fast the
   game runs, and it reaches the result screen by ENDING the game: that screen's
   controls are worth sampling and nothing about them depends on how it got
   there.

   BOTH POINTER KINDS, because one of the four was a label naming keys, and the
   label is shorter on a touch screen. A phone is the device that ships and a
   narrow desktop window is the pessimistic case, so it asks for both.

   AND IT TURNS EVERY SCREEN SIDEWAYS MID GAME, which is a thing a player does
   with a phone and nothing here had ever done. `roomfill` is the class the
   stylesheet keys off and it is toggled in `render()`, so a window turned during
   a game kept whichever answer it had at kickoff while the media queries beside
   it moved on: one branch's CSS with the other branch's class. The rectangles
   are only asked of a turned window the game fits in, which in landscape means
   371 pixels of height; the class agreement is asked always.

     node mythiball/check-reach.mjs
     node mythiball/check-reach.mjs --quick   one screen, for a loop
   `MYTHIBALL_PAGE` points it at another copy of the page. */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + (process.env.MYTHIBALL_PAGE
  ? path.resolve(process.env.MYTHIBALL_PAGE) : path.join(here, 'index.html'));

const QUICK = process.argv.includes('--quick');

let failures = 0;
const ok = (cond, what, detail) => {
  if (cond) { console.log('  ok   ' + what); return; }
  failures++;
  console.log('  FAIL ' + what + (detail ? '\n       ' + detail : ''));
};

/* width, height, device ratio, touch, you at home.
   320x568 is the shortest phone anybody holds and the one three of the four
   faults were on. 667x375 and 844x390 are the same phones sideways, where the
   deck is a column beside the field rather than a band under it. */
/* THE ONE SCREEN `--quick` TAKES IS THE PITCHING HALF OF THE SHORTEST PHONE,
   which is `youHome: true`: the deck is tallest when you are pitching (a pitch
   picker, a release meter and a mound offer against a swing row), and that is
   the half the End Game row was pushed off the bottom of. Taking the batting
   half instead would run a smaller deck on the screen with the least room. */
const SCREENS = QUICK ? [
  [320, 568, 2, true, true],
] : [
  [320, 568, 2, true, false],
  [320, 568, 2, false, true],
  [390, 844, 3, true, true],
  [667, 375, 2, true, false],
  [844, 390, 3, false, true],
  [1440, 900, 1, false, false],
];

async function playOne(browser, w, h, dpr, touch, youHome) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: dpr,
    hasTouch: touch, isMobile: touch,
  });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.clear());
  await pg.goto(URL);
  await pg.evaluate((yh) => {
    Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
    window.confirm = () => true;
    State.gameSpeed = 'fast'; applyGameSpeed();
    State.team = ROSTER.slice().sort(() => Math.random() - 0.5).slice(0, 9).map(c => c.k);
    State.teamName = 'Testers';
    State.opponent = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
    State.innings = 5; State.mode = 'exhibition';
    startGame({ mode: 'exhibition', youHome: yh });
    /* The fielding windows, armed at their own ideal. A rAF watcher rather
       than a harness poll, because a window can be shorter than one poll,
       and a game where nobody fields is a game that ends sooner and has
       fewer decks to look at. */
    window.__fielded = 0;
    const tick = () => {
      const g = State.game, p = g && g.play;
      if (p) {
        const win = p.throwActive ? p.throwWindow : p.catchActive ? p.catchWindow : null;
        if (win && !win.resolved && !win.__armed && win.duration) {
          win.__armed = true;
          const ideal = p.throwActive && win.ideal != null ? win.ideal : 0.5;
          const at = win.startedAt + ideal * win.duration;
          setTimeout(() => {
            if (win.resolved) return;
            window.__fielded++;
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
          }, Math.max(0, at - performance.now()));
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, youHome);

  const worst = new Map();     /* control -> the worst overflow it ever had */
  const seen = new Set();      /* every control this screen ever offered */
  const overlaps = new Set();  /* pairs that were ever on top of each other */
  let pageOver = 0, samples = 0, guard = 0;
  /* BOUNDED IN WALL CLOCK RATHER THAN IN PRESSES, because a press budget is a
     guess about how fast the game runs and a five inning game at Fast is
     minutes of real time. What this needs is not a finished game: it needs the
     deck at its FULLEST, and the play by play is what grows it, so a couple of
     innings is most of the way there. The result screen is reached by ending
     the game rather than by waiting it out, since its controls are worth
     sampling and nothing about them depends on how the game got there. */
  /* TWO MINUTES WHETHER OR NOT IT IS THE QUICK RUN, because the budget is not
     what `--quick` is for: it cuts the SCREENS from six to one. The coverage
     claim is that the play by play filled, and a minute of a Fast game does not
     fill it, so a shorter budget here would make CI fail on a page with nothing
     wrong with it. */
  const until = Date.now() + 120e3;
  while (Date.now() < until) {
    guard++;
    const st = await pg.evaluate(() => {
      const g = State.game;
      const btn = [...document.querySelectorAll('#app button, #app .btn')]
        .find(e => {
          if (!/^(Continue|Next|Play|Sim the rest|Skip|Got it)/i.test((e.textContent || '').trim())) return false;
          const s = getComputedStyle(e);
          return s.display !== 'none' && s.visibility !== 'hidden';
        });
      if (btn) { btn.click(); return {}; }
      if (!g || g.over) return { over: true };
      /* Space is the one key that means "act" on every screen of this game:
         it swings, it releases, and it answers a fielding window. */
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      return {};
    }).catch(e => ({ err: String(e).slice(0, 90) }));
    if (st.err) return { err: st.err };
    if (st.over) break;

    if (guard % 3 === 0) {
      samples++;
      const lay = await pg.evaluate(() => {
        const out = [];
        const boxes = [];
        for (const e of document.querySelectorAll('#app button, #app .btn')) {
          const s = getComputedStyle(e);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          const r = e.getBoundingClientRect();
          if (!r.height || !r.width) continue;
          const name = (e.textContent || '').trim().slice(0, 22) || e.id || 'unnamed';
          const over = Math.max(r.bottom - innerHeight, r.right - innerWidth, -r.top, -r.left);
          out.push([name, Math.round(over)]);
          boxes.push({ name, t: r.top, b: r.bottom, l: r.left, r: r.right });
        }
        /* AND NO TWO OF THEM MAY OVERLAP, which is the worse half of the same
           fault: a control off the screen does nothing and a control UNDER
           another one does the wrong thing. A chip pinned to a corner lands on
           whatever is in that corner, and the corner of a deck is where the
           buttons are. */
        const hits = [];
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], c = boxes[j];
            const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
            const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
            if (ox > 1 && oy > 1) {
              hits.push(`${a.name} under ${c.name} (${Math.round(ox)}x${Math.round(oy)})`);
            }
          }
        }
        return { out, hits, page: Math.round(document.documentElement.scrollHeight), win: innerHeight };
      }).catch(() => null);
      if (lay) {
        for (const [t, o] of lay.out) {
          seen.add(t);
          if (o > 1) worst.set(t, Math.max(worst.get(t) || 0, o));
        }
        for (const hit of lay.hits) overlaps.add(hit);
        pageOver = Math.max(pageOver, lay.page - lay.win);
      }
    }
    await pg.waitForTimeout(110);
  }
  /* AND TURNED SIDEWAYS MID GAME, which is a thing a player does with a phone
     and which nothing here had ever done. The media queries follow the window
     on their own; the layout CLASS is toggled in `render()`, and the resize
     handler returned early on any screen but the menu, so a window turned
     during a game kept whichever answer it had at kickoff and got one branch's
     CSS with the other branch's class. */
  const turned = await pg.setViewportSize({ width: h, height: w })
    .then(() => pg.waitForTimeout(700))
    .then(() => pg.evaluate(() => {
      const out = [], boxes = [];
      for (const e of document.querySelectorAll('#app button, #app .btn')) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (!r.height || !r.width) continue;
        const name = (e.textContent || '').trim().slice(0, 22) || e.id || 'unnamed';
        out.push([name, Math.round(Math.max(r.bottom - innerHeight, r.right - innerWidth, -r.top, -r.left))]);
        boxes.push({ name, t: r.top, b: r.bottom, l: r.left, r: r.right });
      }
      const hits = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
        const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
        if (ox > 1 && oy > 1) hits.push(`${a.name} under ${c.name} (turned)`);
      }
      /* The class the stylesheet keys off has to agree with the query the
         script reads, or the two halves of the layout are describing
         different windows. */
      const agree = document.body.classList.contains('roomfill') === ROOMFILL.matches;
      return { out, hits, agree, page: Math.round(document.documentElement.scrollHeight), win: innerHeight };
    })).catch(() => null);
  /* THE RECTANGLES ONLY COUNT IF THE TURNED WINDOW IS ONE THE GAME FITS IN,
     and the class agreement counts always. Landscape needs 371 pixels of window
     height: the sideways deck is a fixed 339 of content whatever the window is
     (the line score, the meter and its rows, the controls) plus the brand strip.
     Turning a 320 by 568 phone gives 320 of height, which is 51 short, and that
     was true before any of this: the deck has to be redesigned to fit there
     rather than a rule moved, and it is written up below. Asserting the
     rectangles there would be holding the page to a size it has never claimed. */
  const LANDSCAPE_FLOOR = 371;
  if (turned && w >= LANDSCAPE_FLOOR) {
    for (const [t, o] of turned.out) { seen.add(t); if (o > 1) worst.set(t + ' (turned)', o); }
    for (const hit of turned.hits) overlaps.add(hit);
    pageOver = Math.max(pageOver, turned.page - turned.win);
  }
  await pg.setViewportSize({ width: w, height: h }).catch(() => {});
  await pg.waitForTimeout(400);

  /* Now the result screen, whose controls nothing above has looked at. */
  const mid = await pg.evaluate(() => {
    const el = document.querySelector('#app .log');
    return {
      inn: State.game ? State.game.inning : 0,
      log: State.game && State.game.log ? State.game.log.length : 0,
      /* THE CAP IS THE CLAIM, NOT A LINE COUNT. The play by play is held to
         40vh and scrolls past it, so the deck is as tall as it will ever get
         the moment the box overflows. Counted in LINES the threshold is a
         guess about the font and the phone: measured, two minutes of a Fast
         game writes thirteen of them, and thirteen already overflows 227
         pixels. Asked of the box, there is nothing to guess. */
      full: el ? (el.scrollHeight > el.clientHeight + 2) : false,
      logPx: el ? Math.round(el.clientHeight) : 0,
    };
  }).catch(() => ({ inn: 0, log: 0, full: false, logPx: 0 }));
  await pg.evaluate(() => {
    const g = State.game;
    if (g && !g.finished) { g.over = true; g.winner = g.home.score >= g.away.score ? 'home' : 'away'; finishGame(); }
  }).catch(() => {});
  await pg.waitForTimeout(1200);
  const res = await pg.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('#app button, #app .btn')) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (!r.height || !r.width) continue;
      out.push([(e.textContent || '').trim().slice(0, 22) || e.id || 'unnamed',
                Math.round(Math.max(r.right - innerWidth, -r.left))]);
    }
    return { out, screen: State.screen };
  }).catch(() => ({ out: [], screen: '?' }));
  for (const [t, o] of res.out) { seen.add(t); if (o > 1) worst.set(t + ' (result)', o); }

  const fin = await pg.evaluate(() => ({
    screen: State.screen, fielded: window.__fielded | 0,
    inn: State.game ? State.game.inning : 0,
    sc: State.game ? State.game.away.score + '-' + State.game.home.score : '',
  })).catch(() => ({}));
  fin.inn = mid.inn; fin.log = mid.log; fin.full = mid.full; fin.logPx = mid.logPx;
  await ctx.close();
  return { worst, seen, overlaps, pageOver, samples, errs, fin,
           turnAgree: turned ? turned.agree : null };
}

async function main() {
  const browser = await chromium.launch();
  console.log('every control a game offers is inside the window');
  let anySeen = 0, anyFielded = 0, anySamples = 0;
  for (const [w, h, dpr, touch, youHome] of SCREENS) {
    const r = await playOne(browser, w, h, dpr, touch, youHome);
    const tag = `${w}x${h}@${dpr} ${touch ? 'touch' : 'mouse'} ${youHome ? 'home' : 'away'}`;
    if (r.err) { ok(false, tag, r.err); continue; }
    anySeen += r.seen.size; anyFielded += r.fin.fielded | 0; anySamples += r.samples;
    const off = [...r.worst.entries()].map(([t, o]) => `${t} by ${o}px`);
    ok(off.length === 0 && r.pageOver <= 0,
       `${tag}  ${r.seen.size} controls, ${r.samples} samples, ${r.fin.inn} innings, ${r.fin.sc}`,
       (off.length ? 'off the window: ' + off.join(', ') : '') +
       (r.pageOver > 0 ? `  the page is ${r.pageOver}px longer than the window` : ''));
    ok(r.overlaps.size === 0, `${tag}  and none of them is under another`,
       [...r.overlaps].join(', '));
    ok(r.turnAgree === true, `${tag}  turned sideways, the layout class follows the window`,
       'roomfill=' + r.turnAgree);
    ok(r.errs.length === 0, `${tag}  no page errors`, [...new Set(r.errs)].join(' | '));
    ok(r.fin.screen === 'result', `${tag}  the result screen came up and fits`,
       'screen=' + r.fin.screen);
    /* COVERAGE, AND THE FIRST VERSION ASKED THE WRONG THING. It wanted two
       innings, which two minutes of a Fast game does not reach, and innings are
       not what this is about anyway: the deck grows because the PLAY BY PLAY
       fills up, and the log is capped at 40vh, which is about sixteen lines on
       the shortest phone. So the claim is that the log filled, which is the
       state every one of the four faults was worst in. */
    ok(r.fin.full === true, `${tag}  the play by play filled its box`,
       `${r.fin.log} lines in ${r.fin.logPx}px, not overflowing`);
  }
  /* COVERAGE. A run that never opened a deck saw no controls, and a run where
     nobody ever fielded is a shorter game with fewer of them: both would pass
     every claim above having exercised nothing. */
  ok(anySeen > SCREENS.length * 3, 'it saw real decks', anySeen + ' controls across the sweep');
  ok(anySamples > SCREENS.length * 40, 'and sampled them all game', anySamples + ' samples');
  ok(anyFielded > 0, 'and the fielding windows opened', anyFielded + ' played');

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall good');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
