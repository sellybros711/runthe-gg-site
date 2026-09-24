#!/usr/bin/env node
/* MythiBall: can a thumb reach it?

   `body.ingame` sets `overflow:hidden`, so a control laid out past the edge of
   the window is not a scroll away. It is GONE. Four of them were, and every one
   rendered perfectly:

     Bunt      24px off the right at 320x568, so the third swing was unreachable
     End Game  24px below the bottom at 320x568 while pitching
     Mound     18px below the bottom at 667x375 held sideways
     Slowball  30px off the right at 844x390 held sideways

   NOTHING ELSE HERE CAN SEE THIS. `check-firstpitch` measures the glass and asks
   whether one pitch can be READ; `verify-rules` puts the game in a situation and
   asks whether the rule is right. A button off the side of the window is neither:
   the rule is right, the picture is right, and the control is not there.

   IT PLAYS RATHER THAN POSING. The first version measured the first frame of a
   game and would have passed the fault it was written for, because the deck
   grows: the play by play fills up all game, a pitching deck is taller than a
   batting one, and the mound offer and the send button come and go with the
   situation. So it drives a whole game at each screen and samples every
   pressable control's rectangle throughout, keeping the worst reading.

   BOTH POINTER KINDS, because one of the four was a label naming keys, and the
   label is shorter on a touch screen. A phone is the device that ships and a
   narrow desktop window is the pessimistic case, so it asks for both.

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
const SCREENS = QUICK ? [
  [320, 568, 2, true, false],
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
  let pageOver = 0, samples = 0, guard = 0;
  while (guard++ < 2600) {
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
        for (const e of document.querySelectorAll('#app button, #app .btn')) {
          const s = getComputedStyle(e);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          const r = e.getBoundingClientRect();
          if (!r.height || !r.width) continue;
          const over = Math.max(r.bottom - innerHeight, r.right - innerWidth, -r.top, -r.left);
          out.push([(e.textContent || '').trim().slice(0, 22) || e.id || 'unnamed', Math.round(over)]);
        }
        return { out, page: Math.round(document.documentElement.scrollHeight), win: innerHeight };
      }).catch(() => null);
      if (lay) {
        for (const [t, o] of lay.out) {
          seen.add(t);
          if (o > 1) worst.set(t, Math.max(worst.get(t) || 0, o));
        }
        pageOver = Math.max(pageOver, lay.page - lay.win);
      }
    }
    await pg.waitForTimeout(110);
  }
  const fin = await pg.evaluate(() => ({
    screen: State.screen, fielded: window.__fielded | 0,
    inn: State.game ? State.game.inning : 0,
    sc: State.game ? State.game.away.score + '-' + State.game.home.score : '',
  })).catch(() => ({}));
  await ctx.close();
  return { worst, seen, pageOver, samples, errs, fin };
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
    ok(r.errs.length === 0, `${tag}  no page errors`, [...new Set(r.errs)].join(' | '));
    ok(r.fin.screen === 'result', `${tag}  the game reached its result screen`,
       'screen=' + r.fin.screen);
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
