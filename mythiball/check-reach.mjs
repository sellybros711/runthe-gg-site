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
    window.__fielded = 0; window.__windows = 0;
    const tick = () => {
      const g = State.game, p = g && g.play;
      if (p) {
        const win = p.throwActive ? p.throwWindow : p.catchActive ? p.catchWindow : null;
        if (win && !win.resolved && !win.__armed && win.duration) {
          win.__armed = true; window.__windows++;
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
    /* AND THE REPLAY CHIP IS STAGED RATHER THAN WAITED FOR. It is offered only
       while a highlight is stored, which means only after a double, a triple or
       a home run, so whether this walk ever measures it is a fact about the
       dice: it appeared on two of the six screens, and both of those reported it
       off the window. A control that half the sweep never looks at is the badge
       nothing can light. So once the walk is half way through its budget the
       page's own `rememberHighlight` is called with the longest of the three
       labels, which is the widest the chip ever gets. */
    const stage = Date.now() > until - 60e3;
    const st = await pg.evaluate((doStage) => {
      const g = State.game;
      /* THE FINAL WHISTLE IS ASKED FIRST, and the first version asked it last.
         Pressing Space all game is a dreadful pitcher, so the other side can
         reach the mercy rule inside two minutes; the button branch then found
         `Play again` on the result screen, clicked it, and the readings at the
         end of the walk belonged to a game that was four pitches old. It
         reported a play by play of nought lines on a screen that had just
         played a whole game. */
      if (!g || g.over) return { over: true };
      if (doStage && !g.highlight && !g.play && currentBatter()) {
        rememberHighlight('home run', currentBatter(), { duration: 1200 });
        refreshHud();
      }
      const shown = (e) => {
        if (!e) return false;
        const st = getComputedStyle(e);
        return st.display !== 'none' && st.visibility !== 'hidden';
      };
      const btn = [...document.querySelectorAll('#app button, #app .btn')]
        .find(e => /^(Continue|Next|Got it)/i.test((e.textContent || '').trim()) && shown(e));
      if (btn) { btn.click(); return {}; }
      /* THE PITCHING HALF NEEDS THREE PRESSES AND SPACE IS ONLY THE THIRD.
         A pitch is a type, then Throw, then the release. Space answers the
         release meter and nothing else, so a walk that only pressed Space sat
         on the selection screen for its whole budget: measured, two minutes on
         the pitching half produced nought pitches, nought log lines and an
         inning that never ended, which read as the play by play failing to
         fill rather than as a pitch never being thrown. */
      const row = document.querySelector('#pitch-select');
      if (shown(row)) {
        const types = [...row.querySelectorAll('button[data-pt]')].filter(shown);
        const picked = types.find(e => e.classList.contains('selected'));
        if (types.length && !picked) { types[0].click(); return {}; }
        const thr = [...row.querySelectorAll('button, .btn')]
          .find(e => /^Throw/i.test((e.textContent || '').trim()) && shown(e) && !e.disabled);
        if (thr) { thr.click(); return {}; }
      }
      /* A FIELDING WINDOW BELONGS TO THE WATCHER AND NOT TO THE BLIND PRESS.
         Space answers one, and this loop presses Space as fast as it can, so
         every window was resolved at a t near nought before the watcher's own
         timer could fire at the window's ideal: measured, nought answered at
         the ideal across all six screens, and games finishing 12-0 because a
         throw at t=0 is a throw away. The walk leaves an open window alone. */
      const p = g.play;
      if (p && ((p.throwActive && p.throwWindow && !p.throwWindow.resolved) ||
                (p.catchActive && p.catchWindow && !p.catchWindow.resolved))) return {};
      /* Space is what acts on every other screen: it swings and it releases
         the meter. */
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      return {};
    }, stage).catch(e => ({ err: String(e).slice(0, 90) }));
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
         16vh in a game and scrolls past it, so the deck is as tall as it will
         ever get the moment that box overflows. Counted in LINES the threshold
         is a guess about the font and the phone, and it guessed wrong twice:
         measured, two minutes of a Fast game writes thirteen lines into a box
         that is 91 pixels on the shortest phone and holds about five. Asked of
         the box, there is nothing to guess. */
      /* SIDEWAYS THE BOX IS NOT THERE, and that is the page's own answer
         rather than a hole in this claim. A 217 pixel column on a 375 tall
         phone does not hold the line score, the pitch rows, the way out AND
         the play by play, so the play by play is hidden in that branch the way
         the at bat card already is. What the claim is really about is that the
         deck was at its FULLEST when the rectangles were read, so where the box
         is gone the lines are counted in the game's own state instead. */
      full: el ? (getComputedStyle(el).display === 'none'
                  ? 'hidden' : (el.scrollHeight > el.clientHeight + 2)) : false,
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
    screen: State.screen, fielded: window.__fielded | 0, windows: window.__windows | 0,
    inn: State.game ? State.game.inning : 0,
    sc: State.game ? State.game.away.score + '-' + State.game.home.score : '',
  })).catch(() => ({}));
  fin.inn = mid.inn; fin.log = mid.log; fin.full = mid.full; fin.logPx = mid.logPx;
  await ctx.close();
  return { worst, seen, overlaps, pageOver, samples, errs, fin,
           turnAgree: turned ? turned.agree : null };
}

/* ---- the two sheets that open OVER the field ----

   THE WALK ABOVE CANNOT SEE THESE AND NEVER COULD. It plays with Space and
   presses the deck, so the bullpen and the coach plaque were the two surfaces
   in this game nothing had ever opened, and `.arena` sets overflow:hidden, so
   a plaque taller than the arena is not a scroll away, it is CUT. Measured,
   both halves of the fault this file exists for were there:

     320x568   the sheet was 445px against a 341px arena, so it hung 52px off
               the TOP and the heading and the note explaining the rule were
               simply not drawn
     667x375   Stay with him, which is the only way out that does not change
               your pitcher, ran 23px past the bottom

   WHAT IT ASKS IS REACHABILITY AND NOT CONTAINMENT, which is the distinction
   the log claim above already makes. The arms live in a scroller now, so their
   rectangles legitimately sit outside the window when they are scrolled away.
   What may never be outside it is the BOX, the heading, and the bar the game
   is waiting on; and the scroller has to actually reach its own last row.

   THE SHADE IS ASSERTED IN BOTH DIRECTIONS. A list clipped on its own edge
   reads as the last row, and a cue still showing at the end of the list is the
   lie the other way, so it has to be on where there is more and off at the
   end. That is the cut sheet's rule in the baseball game, arriving here.

   THE COACH PLAQUE IS MEASURED AND IS CORRECT TODAY, at 196 to 250px against
   every arena in the sweep. It is here because it is the first thing a
   stranger meets and a fourth step would break it in silence. */
async function sheets(browser) {
  console.log('the sheets that open over the field');
  for (const [w, h, dpr] of [[320, 568, 2], [360, 640, 2], [667, 375, 2],
                             [390, 844, 3], [1440, 900, 1]]) {
    const tag = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h },
      deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(URL);
    await pg.evaluate(() => localStorage.clear());
    await pg.goto(URL);
    /* THE COACH IS LEFT ON, because it only ever appears on a first visit and
       that is how this game is met. `youHome` puts you in the field first, so
       the pitching cards are the ones drawn and the bullpen is offered. */
    await pg.evaluate(() => {
      Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = true;
      State.gameSpeed = 'fast'; applyGameSpeed();
      State.team = ROSTER.slice(0, 9).map(c => c.k);
      State.teamName = 'Testers';
      State.opponent = OPPONENTS[0];
      State.innings = 5; State.mode = 'exhibition';
      startGame({ mode: 'exhibition', youHome: true });
    });
    await pg.waitForTimeout(1200);
    /* Walked to its LAST step, which is the tallest: the fielding note is the
       longest of the four and the one a fifth would be added beside. */
    let coach = null;
    for (let i = 0; i < 5; i++) {
      const got = await pg.evaluate(() => {
        const b = document.querySelector('.coach');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const btns = [...b.querySelectorAll('button')].map(x => {
          const q = x.getBoundingClientRect();
          return { label: (x.textContent || '').trim(),
                   over: Math.max(0, q.bottom - innerHeight, q.right - innerWidth, -q.top, -q.left) };
        });
        return { h: Math.round(r.height),
                 over: Math.round(Math.max(0, r.bottom - innerHeight, r.right - innerWidth,
                                           -r.top, -r.left)),
                 btns };
      });
      if (!got) break;
      if (!coach || got.h > coach.h) coach = got;
      const next = await pg.$('.coach-bar .btn:not(.ghost)');
      if (!next) break;
      const last = ((await next.textContent()) || '').trim() === 'Play ball';
      await next.click({ force: true });
      await pg.waitForTimeout(220);
      if (last) break;
    }
    ok(coach !== null, `${tag}  the coach plaque came up`, 'not drawn');
    if (coach) {
      const bad = coach.btns.filter(b => b.over > 0).map(b => `${b.label} by ${Math.round(b.over)}px`);
      ok(coach.over === 0 && bad.length === 0,
         `${tag}  and it fits, at its tallest step (${coach.h}px)`,
         (coach.over ? `the plaque is ${coach.over}px outside the window. ` : '') + bad.join(', '));
    }

    /* THE DECK HAS TO HAVE SETTLED, and the first draft opened the bullpen in
       the same frame the coach was dismissed in. The pitch deck was still
       being painted, so the arena was transiently TALLER than it ever is in
       play, and with the cap deliberately removed the sheet fitted at 320x568
       and the guard reported only the sideways arm of its own defect. The
       arena is shortest when the deck is tallest, so the pessimistic reading
       needs the deck drawn and the log started. */
    await pg.evaluate(() => {
      PREFS.coach = false;
      const c = document.querySelector('.coach'); if (c) c.remove();
    });
    await pg.waitForTimeout(3000);
    const pen = await pg.evaluate(async () => {
      openBullpen();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const box = document.querySelector('#pen');
      if (!box) return null;
      const body = box.querySelector('.pen-body');
      const shade = box.querySelector('.pen-shade');
      const bar = box.querySelector('.pen-bar button');
      const H = innerHeight, W = innerWidth;
      const outside = (r) => Math.round(Math.max(0, r.bottom - H, r.right - W, -r.top, -r.left));
      const arms = [...box.querySelectorAll('.pen-arm')];
      const bt = body.getBoundingClientRect();
      /* Reachable means inside the scroller's own CONTENT, so a row scrolled
         away still counts and a row laid out past the content does not. */
      const reach = arms.every(a => {
        const q = a.getBoundingClientRect();
        return q.top - bt.top + body.scrollTop >= -1
            && q.bottom - bt.top + body.scrollTop <= body.scrollHeight + 1;
      });
      const before = { more: body.classList.contains('more'),
                       shade: getComputedStyle(shade).display };
      const scrolls = body.scrollHeight - body.clientHeight;
      body.scrollTop = body.scrollHeight;
      body.dispatchEvent(new Event('scroll'));
      await new Promise(r => requestAnimationFrame(r));
      const lastArm = arms.length ? arms[arms.length - 1].getBoundingClientRect() : null;
      return {
        arms: arms.length, reach, scrolls,
        box: outside(box.getBoundingClientRect()),
        body: outside(bt),
        bar: bar ? outside(bar.getBoundingClientRect()) : 999,
        barLabel: bar ? (bar.textContent || '').trim() : '',
        lastIn: lastArm ? outside(lastArm) === 0 : false,
        shadeBefore: before.shade, moreBefore: before.more,
        shadeAfter: getComputedStyle(shade).display,
        moreAfter: body.classList.contains('more'),
      };
    });
    ok(pen !== null, `${tag}  the bullpen came up`, 'not drawn');
    if (pen) {
      ok(pen.box === 0, `${tag}  the bullpen sheet is inside the window`,
         `${pen.box}px outside it`);
      ok(pen.bar === 0, `${tag}  and the way out of it is on the screen`,
         `${pen.barLabel} is ${pen.bar}px outside the window`);
      ok(pen.arms === 8 && pen.reach, `${tag}  all ${pen.arms} arms are inside the scroller`,
         'arms ' + pen.arms + ', reachable ' + pen.reach);
      ok(pen.lastIn, `${tag}  and scrolling to the end brings the last one on screen`,
         'still outside the window at the scroll end');
      /* Both directions, on the real scroll state rather than on a width: the
         shade is a lie whichever way round it is wrong. */
      ok(pen.moreBefore === (pen.scrolls > 8),
         `${tag}  the shade is on exactly when there is more (${pen.scrolls}px to scroll)`,
         `more=${pen.moreBefore}, shade=${pen.shadeBefore}`);
      ok(pen.shadeAfter === 'none', `${tag}  and it comes off at the end of the list`,
         'shade=' + pen.shadeAfter);
    }
    ok(errs.length === 0, `${tag}  no page errors`, [...new Set(errs)].join(' | '));
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  console.log('every control a game offers is inside the window');
  let anySeen = 0, anyFielded = 0, anySamples = 0, anyWindows = 0, sawReplay = 0;
  for (const [w, h, dpr, touch, youHome] of SCREENS) {
    const r = await playOne(browser, w, h, dpr, touch, youHome);
    const tag = `${w}x${h}@${dpr} ${touch ? 'touch' : 'mouse'} ${youHome ? 'home' : 'away'}`;
    if (r.err) { ok(false, tag, r.err); continue; }
    anySeen += r.seen.size; anyFielded += r.fin.fielded | 0; anySamples += r.samples;
    anyWindows += r.fin.windows | 0;
    if ([...r.seen].some(t => /^Replay/.test(t))) sawReplay++;
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
       fills up, and the log is capped, so it is full the moment it overflows its
       own box. So the claim is that the log filled, which is the state every one
       of the four faults was worst in. */
    ok(r.fin.full === true || (r.fin.full === 'hidden' && r.fin.log >= 8),
       `${tag}  the play by play ${r.fin.full === 'hidden' ? 'is hidden and the game ran' : 'filled its box'}`,
       `${r.fin.log} lines in ${r.fin.logPx}px, not overflowing`);
  }
  /* COVERAGE. A run that never opened a deck saw no controls, and a run where
     nobody ever fielded is a shorter game with fewer of them: both would pass
     every claim above having exercised nothing. */
  ok(anySeen > SCREENS.length * 3, 'it saw real decks', anySeen + ' controls across the sweep');
  ok(anySamples > SCREENS.length * 40, 'and sampled them all game', anySamples + ' samples');
  /* A run where nobody ever fields is a shorter game with fewer decks in it, and
     the two halves of that are asked separately because they fail differently: a
     window that never OPENS means the walk never put a ball in play, and a window
     that opens and is never ANSWERED at its ideal means something else got to it
     first, which is what the blind press was doing. */
  ok(anyWindows > 0, 'and the fielding windows opened', anyWindows + ' opened');
  ok(anyFielded > 0, 'and the walk answered them', anyFielded + ' played');
  ok(sawReplay === SCREENS.length, 'and the Replay chip was measured on every screen',
     sawReplay + ' of ' + SCREENS.length);

  await sheets(browser);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall good');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
