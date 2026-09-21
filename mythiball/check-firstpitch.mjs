/* CAN A STRANGER READ ONE PITCH.

     node mythiball/check-firstpitch.mjs

   Every other checker in this game asks whether something is CORRECT. This
   one asks whether it can be SEEN, which is the question that was never put
   and the reason the game read as broken inside two pitches while every
   suite was green.

   IT MEASURES THE GLASS, NOT THE SOURCE. A zone drawn at `lineWidth = 2` is
   a claim about logical field pixels, and what a thumb is aiming at is CSS
   pixels after the camera, the crop and the browser's own last step. So the
   numbers here are read back off the canvas and out of FIELD_CAM rather
   than reasoned about from the alpha something was drawn with. That is the
   same discipline `one grid` already runs on, pointed at legibility.

   WHAT IT DELIBERATELY DOES NOT DO is pin a pixel count or a hex. Every
   assertion is a property that survives a redesign: a contrast ratio, a
   minimum size on screen, a state that has to end. Pinned numbers would
   make this a test of the three phones somebody thought of, and this file
   exists precisely because the last year of checks tested the wrong thing
   very thoroughly.

   The bands are the accessibility floors for a graphical object somebody
   has to locate, not taste: 3:1 for the thing you aim at, and a size floor
   for the thing you track. */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + path.join(here, 'index.html');

let failures = 0;
const ok = (cond, what, detail) => {
  if (cond) { console.log('  ok   ' + what); return; }
  failures++;
  console.log('  FAIL ' + what + (detail ? '\n       ' + detail : ''));
};

/* WCAG relative luminance, so "can it be seen" is the same question here as
   it is anywhere else on this site. */
const lum = ([R, G, B]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function game(browser, w, h, dpr) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h },
    deviceScaleFactor: dpr, isMobile: w < 900, hasTouch: w < 900 });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.clear());
  await pg.goto(URL);
  await pg.waitForTimeout(400);
  await pg.evaluate(() => {
    Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
    State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
    State.opponent = OPPONENTS[0]; State.innings = 5; State.mode = 'exhibition';
    startGame({ mode: 'exhibition', youHome: false });
  });
  return { ctx, pg, errors };
}

const main = async () => {
  const browser = await chromium.launch();

  /* ---- the ball is not still there ---- */
  {
    console.log('the ball is not still there');
    /* `pitch.closed` used to be set only where the AT BAT ends, so after a
       called ball, a called strike, a foul or a whiff (which is most
       pitches) the arrived ball went on being drawn in the mitt for the
       whole 2200ms gap. Measured on a 390 phone before the fix: a flight of
       42 to 46 frames, then 152 to 157 frames of a ball sitting motionless
       on the plate. The reader spent three times longer looking at where
       the pitch stopped than at the pitch.

       THE ASSERTION IS THAT THE STATE ENDS, never how many frames it runs
       for. A frame count is a claim about the machine the check ran on. */
    const { ctx, pg, errors } = await game(browser, 390, 844, 3);
    const r = await pg.evaluate(() => new Promise((res) => {
      const seen = { held: 0, cleared: false, calls: 0 };
      const t0 = performance.now();
      const tick = () => {
        const g = State.game;
        if (!g) return requestAnimationFrame(tick);
        const p = g.pitch;
        /* a pitch that has ARRIVED: e is clamped at 1 and it is still open */
        if (p && !p.closed && p.arrivedAt) seen.held++;
        if (p && p.closed) seen.cleared = true;
        if (seen.cleared || performance.now() - t0 > 22000) {
          return res({ ...seen, ms: performance.now() - t0 });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    ok(r.cleared, 'an arrived pitch closes rather than sitting in the mitt',
      JSON.stringify(r));
    /* The hold has to be long enough to read the catch by. Both ends
       matter: cleared instantly the catch never registers, never cleared
       and the screen is a still life of the last pitch. */
    ok(r.held >= 2, 'and it is held long enough to see the catch',
      `only ${r.held} frame(s) with the ball in the mitt`);
    ok(errors.length === 0, 'no page errors', errors.join(' | '));
    await pg.close(); await ctx.close();
  }

  /* ---- you can see what you are aiming at ---- */
  {
    console.log('you can see what you are aiming at');
    /* The strike zone was a 2px LOGICAL line, which is 1.78 CSS pixels on a
       390 phone, at 2.23:1 against the grass behind it, with a 6% fill at
       1.33:1. The geometry was right and the aim worked; a reader simply
       could not find the box. Nothing in the repo could report it, because
       every guard asks whether a thing is drawn correctly rather than
       whether it can be seen.

       It is read across THREE screens, because the fault was a length
       written in the wrong unit and that is exactly the class of bug that
       is fine on the machine it was written on. */
    for (const [label, w, h, dpr] of [['phone upright', 390, 844, 3],
                                      ['small phone', 320, 568, 2],
                                      ['desktop', 1280, 900, 1]]) {
      const { ctx, pg, errors } = await game(browser, w, h, dpr);
      await pg.waitForFunction(() => {
        const g = State.game;
        return g && plateViewActive(g) && (!g.pitch || g.pitch.closed);
      }, { timeout: 25000 });
      const r = await pg.evaluate(() => {
        const P = plateGeom();
        const cv = document.getElementById('field');
        const c = cv.getContext('2d');
        /* INVERTS FIELD_CAM the way fieldPointFromEvent does. The canvas
           shows a WINDOW on the world, so a fraction of the element times
           FIELD_W would be right only when nothing is cropped. */
        const toBmp = (lx, ly) => [
          (lx / PIX - FIELD_CAM.sx) * FIELD_CAM.draw,
          (ly / PIX - FIELD_CAM.sy) * FIELD_CAM.draw];
        const [bx0, by] = toBmp(P.zx - P.zw, P.zy);
        const [bx1] = toBmp(P.zx + P.zw, P.zy);
        const pad = 30;
        const x0 = Math.max(0, Math.round(bx0 - pad));
        const wid = Math.min(cv.width - x0, Math.round(bx1 - bx0 + pad * 2));
        if (wid < 20) return { tooSmall: true };
        const d = c.getImageData(x0, Math.round(by), wid, 1).data;
        const px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        return { px, edgeAt: bx0 - x0, view: FIELD_VIEW,
                 /* the frame's width as it lands on the glass */
                 lineCss: (typeof zoneLineMin === 'function' ? zoneLineMin() : 2) * FIELD_VIEW,
                 zoneCssW: (P.zw * 2) * FIELD_VIEW, zoneCssH: (P.zh * 2) * FIELD_VIEW };
      });
      if (r.tooSmall) {
        ok(false, `${label}: the zone is on screen to be measured`);
        await pg.close(); await ctx.close(); continue;
      }
      const L = Math.round(r.edgeAt);
      const lums = r.px.map(lum);
      const grass = lums.slice(Math.max(0, L - 14), Math.max(1, L - 5));
      const grassAvg = grass.reduce((a, b) => a + b, 0) / grass.length;
      const edge = Math.max(...lums.slice(Math.max(0, L - 4), L + 5));
      const c = ratio(edge, grassAvg);
      ok(c >= 3, `${label}: the zone's frame clears 3:1 against the grass`,
        `measured ${c.toFixed(2)}:1`);
      ok(r.lineCss >= 2.5, `${label}: and it is at least 2.5 CSS px wide`,
        `measured ${r.lineCss.toFixed(2)}px`);
      /* A target a thumb has to hit. The pad of a finger is about 45px, and
         the zone is aimed at rather than tapped exactly, so the floor here
         is the box being findable rather than the whole thumb fitting. */
      ok(r.zoneCssW >= 40 && r.zoneCssH >= 40,
        `${label}: the zone is at least 40 CSS px on both axes`,
        `measured ${r.zoneCssW.toFixed(0)}x${r.zoneCssH.toFixed(0)}`);
      ok(errors.length === 0, `${label}: no page errors`, errors.join(' | '));
      await pg.close(); await ctx.close();
    }
  }

  /* ---- a character lands on the grid ---- */
  {
    console.log('a character lands on the grid');
    /* THE FIELD WAS SHARP AND THE PEOPLE WERE NOT, and one rounding is the
       whole of it. The world is drawn into a low resolution canvas through
       a 1/PIX transform, so three logical units are one pixel of the blit,
       and a sprite's destination was rounded to a whole LOGICAL unit. Two
       positions in every three therefore put the bitmap between two pixels,
       and a bitmap between two pixels is resampled over its WHOLE SURFACE
       rather than at its edges. Reported as the characters being super
       blurry, which is exactly what it looks like: the chalk is crisp and
       the man standing on it is a photograph of a man.
       Measured through one character at three of the sizes this game draws,
       the share of his pixels that are one of his own palette colours went
       37%, 46% and 55% to 100% on all three, purely from the destination.

       IT IS ASKED OF THE DESTINATION AND NOT OF THE PIXELS, because a
       colour count cannot say WHOSE pixel it is: a figure overlaps the
       grass, the dirt and the man behind him. The property is exact and it
       is the one that broke. */
    const { ctx, pg, errors } = await game(browser, 390, 844, 3);
    await pg.waitForFunction(() => State.game && plateViewActive(State.game),
      { timeout: 25000 });
    const r = await pg.evaluate(() => new Promise((res) => {
      const c = pixWorld.getContext('2d');
      const real = c.drawImage;
      const off = [];
      let n = 0;
      c.drawImage = function (img, ...a) {
        /* only the five and nine argument forms place a bitmap */
        if (a.length === 4 || a.length === 8) {
          const k = Math.abs(this.getTransform().a) || 1;
          const [dx, dy] = a.length === 4 ? [a[0], a[1]] : [a[4], a[5]];
          n++;
          const fx = Math.abs(dx * k - Math.round(dx * k));
          const fy = Math.abs(dy * k - Math.round(dy * k));
          if (fx > 1e-6 || fy > 1e-6) {
            off.push(`${(dx * k).toFixed(3)},${(dy * k).toFixed(3)}`);
          }
        }
        return real.call(this, img, ...a);
      };
      requestAnimationFrame(() => requestAnimationFrame(() => {
        c.drawImage = real;
        res({ n, off: off.slice(0, 6), bad: off.length });
      }));
    }));
    ok(r.n > 0, 'the frame put bitmaps on the field at all',
      'nothing was drawn, so the check below asserted nothing');
    ok(r.bad === 0, 'every one of them lands on a whole pixel of the blit',
      `${r.bad} of ${r.n} landed between two: ${r.off.join('  ')}`);
    ok(errors.length === 0, 'no page errors', errors.join(' | '));
    await pg.close(); await ctx.close();
  }

  /* ---- nothing is standing on the zone ---- */
  {
    console.log('nothing is standing on the zone');
    /* The controls float over the picture, which is what stopped the game
       being a wide box with a ballgame in it. What that can cost is the one
       thing this screen exists for: framed on the canvas rather than on the
       part of the canvas a player can see, the zone's bottom edge came out
       under the swing row. And a crop narrow enough to hold the batter cut
       the zone's left edge off the frame entirely on a phone, because a 390
       by 810 arena can only show 97 of the world's 320 blocks across.

       So both claims are read off the GLASS: where the zone lands in CSS
       pixels, and where the deck starts. Neither is derived from the camera
       twice. */
    for (const [label, w, h, dpr] of [['phone upright', 390, 844, 3],
                                      ['small phone', 320, 568, 2],
                                      ['phone sideways', 844, 390, 3],
                                      ['desktop', 1280, 800, 1],
                                      ['desktop, tall', 1512, 900, 1]]) {
      const { ctx, pg, errors } = await game(browser, w, h, dpr);
      await pg.waitForFunction(() => State.game && plateViewActive(State.game),
        { timeout: 25000 });
      await pg.waitForTimeout(250);
      const r = await pg.evaluate(() => {
        const P = plateGeom();
        const cv = document.getElementById('field');
        const box = cv.getBoundingClientRect();
        /* logical field pixels to the page, through the camera the same way
           fieldPointFromEvent inverts it */
        const toPage = (lx, ly) => [
          box.left + (lx / PIX - FIELD_CAM.sx) / FIELD_CAM.sw * box.width,
          box.top + (ly / PIX - FIELD_CAM.sy) / FIELD_CAM.sh * box.height];
        const [x0, y0] = toPage(P.zx - P.zw, P.zy - P.zh);
        const [x1, y1] = toPage(P.zx + P.zw, P.zy + P.zh);
        const m = document.querySelector('.meter-wrap');
        const mb = m.getBoundingClientRect();
        const ar = cv.parentElement.getBoundingClientRect();
        return { x0, y0, x1, y1, deckTop: mb.top,
                 /* A PHONE HELD SIDEWAYS PUTS THE DECK BESIDE THE FIELD, in
                    a column of its own, and a column that starts high up the
                    window is not standing on anything. The claim is about
                    OVERLAP, so it is only asked where the two share a
                    column. Read as a height, sideways failed on a screen
                    with nothing wrong with it. */
                 deckOver: mb.right > x0 && mb.left < x1,
                 arena: { l: ar.left, t: ar.top, r: ar.right, b: ar.bottom },
                 vw: innerWidth, vh: innerHeight };
      });
      const margin = 4;
      ok(r.x0 >= r.arena.l - margin && r.x1 <= r.arena.r + margin,
        `${label}: the whole zone is across the frame`,
        `zone ${r.x0.toFixed(0)}..${r.x1.toFixed(0)} in an arena `
        + `${r.arena.l.toFixed(0)}..${r.arena.r.toFixed(0)}`);
      ok(r.y0 >= r.arena.t - margin && r.y1 <= r.arena.b + margin,
        `${label}: and down it`,
        `zone ${r.y0.toFixed(0)}..${r.y1.toFixed(0)} in an arena `
        + `${r.arena.t.toFixed(0)}..${r.arena.b.toFixed(0)}`);
      /* THE ONE THAT BREAKS WHEN THE DECK GROWS. A control the game is
         waiting on may not stand on the thing it is waiting for. */
      ok(!r.deckOver || r.y1 <= r.deckTop + margin,
        `${label}: and the swing row does not stand on it`,
        `the zone ends at ${r.y1.toFixed(0)} and the deck starts at ${r.deckTop.toFixed(0)}`);
      ok(errors.length === 0, `${label}: no page errors`, errors.join(' | '));
      await pg.close(); await ctx.close();
    }
  }

  await browser.close();
  console.log('');
  if (failures) { console.log(`${failures} check(s) failed.`); process.exit(1); }
  console.log('A pitch reads.');
};

main().catch((e) => { console.error(e); process.exit(1); });
