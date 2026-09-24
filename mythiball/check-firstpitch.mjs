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
/* MYTHIBALL_PAGE points this file at another copy of the page, which is how
   a section proves it has teeth: run it against the commit before the fix
   and read the failure. A guard that has only ever seen the fixed file is a
   guard nobody knows the teeth of. */
const URL = 'file://' + (process.env.MYTHIBALL_PAGE
  ? path.resolve(process.env.MYTHIBALL_PAGE) : path.join(here, 'index.html'));

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

  /* ---- the first notes name this device ---- */
  {
    console.log('the first notes name this device');
    /* These are the one screen a stranger cannot skip: a modal over the
       field, three or four cards, before the first pitch. Every card was
       written once for every device, so a phone was told the bat follows
       "your mouse (or your finger, or the arrow keys)" and that keys 1, 2
       and 3 change the swing, and the one control a phone HAS for bending
       a pitch was named as an arrow key. That is this file's own clubhouse
       rail mistake at the screen it costs most: the rail said "Point at
       something to see what it does" to a touch screen.

       THE CLAIM IS ABOUT HARDWARE, so it is asked as a word list rather
       than as a layout. A note that names a mouse to a finger is wrong
       however well it is laid out, and no measurement of the glass can
       see it. */
    const NEVER = {
      coarse: /\bmouse\b|arrow key|\bclick\b|keys 1/i,
      fine: /\btap\b|your finger/i,
    };
    const seen = {};
    for (const [label, w, h, dpr, touch] of [['a phone', 390, 844, 3, true],
                                             ['a desktop', 1280, 800, 1, false]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h },
        deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch });
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(URL);
      await pg.waitForTimeout(300);
      const r = await pg.evaluate(() => ({
        coarse: COARSE,
        cards: [...COACH.bat, ...COACH.pitch].map(s => s.replace(/<[^>]+>/g, '')),
      }));
      seen[label] = { coarse: r.coarse, joined: r.cards.join(' ') };
      const bad = r.cards.filter(s => NEVER[r.coarse ? 'coarse' : 'fine'].test(s));
      ok(r.cards.length >= 6, `${label}: there are notes to read`,
        `${r.cards.length} cards`);
      ok(bad.length === 0, `${label}: and not one of them names hardware it does not have`,
        bad.map(s => '"' + s.slice(0, 70) + '"').join('  '));
      ok(errors.length === 0, `${label}: no page errors`, errors.join(' | '));
      await pg.close(); await ctx.close();
    }
    /* COVERAGE, which is the half that would go quiet. A query that
       answered the same on both would hand both readers one set, and the
       word lists above are disjoint, so one of the two arms would simply
       have nothing to catch. */
    ok(seen['a phone'] && seen['a desktop']
       && seen['a phone'].coarse !== seen['a desktop'].coarse,
      'and the two devices are actually being told apart',
      JSON.stringify({ phone: seen['a phone'] && seen['a phone'].coarse,
                       desktop: seen['a desktop'] && seen['a desktop'].coarse }));
    ok(seen['a phone'] && seen['a desktop']
       && seen['a phone'].joined !== seen['a desktop'].joined,
      'so they are read two different sets of notes');
  }

  /* ---- what the wide camera cannot reach is still the park ---- */
  {
    console.log('what the wide camera cannot reach is still the park');
    /* The wide view CONTAINS, because a ball in the right field corner is
       the entire point of it, and the world is 320 by 220 blocks against a
       phone arena of about 0.56. So contain leaves a band above and below:
       58% of the arena on a 390 phone, 44% and 48% on the other two. It was
       the arena's near black, so the ballgame was a strip floating in a
       hole, which is the box this pass removed arriving one layer down.

       There is no camera that fixes it. Filling the height crops to 117 of
       320 blocks across and loses both foul lines; filling the width runs
       the world out vertically at any scale; and shortening the arena to
       what the wide view can fill takes the strike zone from 78 CSS pixels
       to 41. So the band stays and stops reading as a hole.

       WHAT IT IS ASSERTED AGAINST IS THE PICTURE, NEVER A COLOUR. Thirteen
       parks paint thirteen skies and `drawField` shades each one, so a hex
       written here would be wrong in twelve of them and wrong again the day
       somebody adds a park. Every park is swept for the same reason. */
    for (const [label, w, h, dpr] of [['phone upright', 390, 844, 3],
                                      ['small phone', 320, 568, 2]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h },
        deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(URL);
      await pg.evaluate(() => localStorage.clear());
      await pg.goto(URL);
      await pg.waitForTimeout(350);
      const r = await pg.evaluate(() => new Promise((res) => {
        Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        const out = []; let i = 0;
        const step = () => {
          if (i >= OPPONENTS.length) return res(out);
          State.opponent = OPPONENTS[i++];
          State.innings = 5; State.mode = 'exhibition';
          startGame({ mode: 'exhibition', youHome: false });
          const g = State.game;
          /* the WIDE camera: nothing in flight and no hold */
          g.pitch = null; g.plateHold = 0; g.aiming = false; g.meter = null;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const cv = document.getElementById('field');
              const c = cv.getContext('2d');
              const at = (y) => { const d = c.getImageData(cv.width >> 1, y, 1, 1).data;
                return [d[0], d[1], d[2]]; };
              const cs = getComputedStyle(cv.parentElement);
              const parse = (v) => { const m = /rgb\((\d+), ?(\d+), ?(\d+)\)/.exec(v || '');
                return m ? [+m[1], +m[2], +m[3]] : null; };
              const box = cv.parentElement.getBoundingClientRect();
              const r2 = cv.getBoundingClientRect();
              out.push({ park: currentTheme().park, band: !!FIELD_CAM.band,
                         dead: Math.round((box.height - r2.height) * 100 / box.height),
                         top: at(0), bottom: at(cv.height - 1),
                         sky: parse(cs.getPropertyValue('--sky')),
                         turf: parse(cs.getPropertyValue('--turf')) });
              step();
            });
          }));
        };
        step();
      }));
      const parks = new Map();
      for (const x of r) if (!parks.has(x.park)) parks.set(x.park, x);
      const rows = [...parks.values()];
      const banded = rows.filter(x => x.band);
      /* COVERAGE. A screen with nothing to fill proves nothing about the
         fill, so this is asked before anything below it. */
      ok(banded.length === rows.length && rows.length > 1,
        `${label}: the wide camera really does leave a band to fill`,
        `${banded.length} of ${rows.length} parks had one`);
      const far = (a, b) => !a || !b ? 999 : Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      const off = banded.filter(x => far(x.top, x.sky) > 2 || far(x.bottom, x.turf) > 2);
      ok(off.length === 0,
        `${label}: and it is that park's own sky and grass, in all ${rows.length}`,
        off.slice(0, 3).map(x => `${x.park}: sky ${x.sky} under a top row of ${x.top}`).join('; '));
      /* AND IT IS NEVER THE FALLBACK, WHICH IS WHAT SHIPPED. Unset counts as
         the fallback: a missing custom property is precisely how the arena
         goes back to painting its own near black, and written as a colour
         test alone this clause passed green on exactly that. */
      const dark = banded.filter(x => !x.sky
        || (x.sky[0] < 30 && x.sky[1] < 40 && x.sky[2] < 45));
      ok(dark.length === 0, `${label}: never the near black it used to be`,
        `${dark.length} parks fall back to the arena's own colour`);
      ok(errors.length === 0, `${label}: no page errors`, errors.join(' | '));
      await pg.close(); await ctx.close();
    }
  }

  /* ------------------------------------------------------------------
     THE MAN AT THE PLATE IS IN THE PICTURE

     There are two batter's boxes. `drawPlateView` puts a lefty at 638 and a
     righty at 322, mirrored about the scene's cx of 480, and the plate
     camera's focus was one number: 596, which is the lefty's framing. On a
     390 phone the crop is 117 of the world's 320 blocks, so a righty's box
     at 68 to 146 was 8.1% in frame. 52 of the 68 characters bat right.

     NOTHING COULD REPORT IT. The scene renders, the swing plays, the aim
     maps correctly, and the zone was never clipped because the keep box
     holds it. It is the fourth thing on this page found by taking a
     screenshot, and it survived that too: the man in the shot was one of
     the sixteen lefties.

     SO IT WALKS ALL SIXTY EIGHT, and it does it by putting each of them in
     the box and RE-FITTING, because one camera read against 68 hypothetical
     batters cannot see a camera that follows the hitter. The first draft of
     this did exactly that and reported the fixed page as still broken.

     IT MEASURES THE LIT FIGURE, NEVER THE CELL. A sprite cell is 64 wide and
     a character's drawing is 40 to 64 of it, so a claim about the cell counts
     transparent margin as a man and overstates every crop: the same 412 phone
     reads 82.5% of the cell and 81% of the figure for one character and 100%
     of both for another.

     WHAT IS ASKED OF HIM IS STRUCTURAL, because on the narrowest screens the
     three things that must be here do not all fit and the batter is what
     gives. The claim is that his PLATE-FACING edge is in frame, so his swing
     and the bat's whole arc are; the share is only a backstop against his
     being gone altogether.

     THE SHARE MOVED FROM 70 TO 25 AND THAT IS NOT A BAND LOOSENED TO MAKE A
     RUN PASS, which is the thing this repo refuses everywhere else. The
     FRAMING was deliberately changed underneath it: the plate now sits at
     48% of the way across instead of 21%, because everything in the scene
     radiates from home and an off-centre origin made the whole view read as
     oblique. That was a playtester's pick between two framings that cannot
     both be had, and the batter is what it was bought with. A guard still
     demanding 70 would be holding the page to a camera it no longer has.

     WHERE 25 COMES FROM. Measured over every plausible phone, the least
     visible batter runs 37.1% to 100%, and it is a tall low-ratio phone
     that binds rather than a narrow one: 360x950 at ratio 2 gets 90 of the
     world's 320 blocks where a 320 phone gets 160. The defect this section
     exists for is 8.1%, and the unmirrored focus gives 0%. So 25 is the
     middle of a real gap, twelve points clear on both sides.

     Coverage is half of it, the same as everywhere else here: a run where
     both hands happened to frame identically would pass having exercised
     nothing, so the crop is asserted to MOVE between the two boxes on a
     phone. A desktop holds the whole world and correctly never moves, which
     is why that claim is asked only where the crop is narrower than the
     scene.
     ------------------------------------------------------------------ */
  {
    console.log('the man at the plate is in the picture');
    /* THE BINDING SCREEN IS TALL AND LOW RATIO, NOT NARROW, which is not
       the order anybody guesses: a 320 phone gets 160 of the world's 320
       blocks and a 360x950 at ratio 2 gets 90. Found by measuring rather
       than by taking the smallest number on the list. */
    for (const [label, w, h, dpr] of [['phone upright', 390, 844, 3],
                                      ['tall phone', 412, 915, 2.625],
                                      ['tallest phone', 360, 950, 2],
                                      ['small phone', 320, 568, 2],
                                      ['sideways', 844, 390, 3]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h },
        deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(URL);
      await pg.evaluate(() => localStorage.clear());
      await pg.goto(URL);
      await pg.waitForTimeout(350);
      await pg.evaluate(() => {
        Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.opponent = OPPONENTS[0]; State.innings = 5; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: false });
      });
      await pg.waitForFunction(() => State.game && plateViewActive(State.game),
        null, { timeout: 20000 });
      const r = await pg.evaluate(() => {
        const P = plateGeom();
        const cv = document.getElementById('field');
        const t = currentBattingTeam();
        const keep = t.batters[t.idx % 9];
        /* The cell's half width in world blocks, off the same three numbers
           `drawRunnerAt` sizes him with. */
        const half = (HERO_DRAW_H * P.batSc * V2_W / V2_H) / 2 / PIX;
        const zone = [(P.zx - P.zw) / PIX, (P.zx + P.zw) / PIX];
        const ball = [(P.zx - PITCH_LOC_MAX * P.zw) / PIX,
                      (P.zx + PITCH_LOC_MAX * P.zw) / PIX];
        /* His lit columns across every pose the plate scene can show him in,
           so the transparent margin in the cell is not counted as a man. */
        const litOf = (c) => {
          let lo = 64, hi = -1;
          for (const p of ['batting', 'load', 'swing', 'follow', 'ready']) {
            const rows = v2Frame(c.k, p);
            if (!rows) continue;
            for (const row of rows) for (let x = 0; x < row.length; x++) {
              if (row[x] !== '.') { if (x < lo) lo = x; if (x > hi) hi = x; }
            }
          }
          return hi < 0 ? [0, 63] : [lo, hi];
        };
        const out = { thin: [], turned: [], lost: [], hands: { L: 0, R: 0 },
                      crops: [], worst: { v: 101, k: null } };
        const crops = new Set();
        for (const c of ROSTER) {
          t.batters[t.idx % 9] = c;
          fitFieldCanvas(cv);
          const C = FIELD_CAM, L = C.sx, R = C.sx + C.sw;
          const lefty = batsLeft(c.k);
          out.hands[lefty ? 'L' : 'R']++;
          crops.add(L + '..' + R);
          const seen = (a, b) =>
            Math.max(0, Math.min(b, R) - Math.max(a, L)) / (b - a);
          const bx = (lefty ? 2 * P.cx - P.batX : P.batX) / PIX;
          const [lo, hi] = litOf(c);
          /* drawRunner mirrors a lefty, so his lit columns mirror with him */
          const a = lefty ? 64 - (hi + 1) : lo, z = lefty ? 64 - lo : hi + 1;
          const fl = bx - half + (a / 64) * half * 2;
          const fr = bx - half + (z / 64) * half * 2;
          const v = +(seen(fl, fr) * 100).toFixed(1);
          if (v < out.worst.v) out.worst = { v, k: c.k, lefty };
          if (v < 25) out.thin.push({ k: c.k, lefty, v });
          /* The edge FACING the plate carries the swing, so it is the one
             that may never go: right for a righty, left for a lefty. */
          const leadIn = lefty ? fl >= L - 1e-6 : fr <= R + 1e-6;
          if (!leadIn) out.turned.push({ k: c.k, lefty, v });
          const zq = seen(zone[0], zone[1]);
          const bq = seen(ball[0], ball[1]);
          if (zq < 0.999 || bq < 0.999) {
            out.lost.push({ k: c.k, zone: +(zq * 100).toFixed(1),
                            ball: +(bq * 100).toFixed(1) });
          }
        }
        t.batters[t.idx % 9] = keep;
        fitFieldCanvas(cv);
        out.crops = [...crops];
        /* A screen wide enough to hold the whole scene has no framing left
           to choose, so it is exempt from the claim that the crop moves. */
        out.whole = FIELD_CAM.sw >= FIELD_W / PIX;
        return out;
      });
      ok(r.hands.L > 0 && r.hands.R > 0,
        `${label}: the roster really does bat both ways`,
        `${r.hands.L} left, ${r.hands.R} right`);
      if (!r.whole) {
        ok(r.crops.length === 2,
          `${label}: and the camera moves between the two boxes`,
          `the crop took ${r.crops.length} value(s): ${r.crops.join(' / ')}`);
      }
      ok(r.turned.length === 0,
        `${label}: every one of the ${r.hands.L + r.hands.R} faces the plate `
        + 'with his swing in frame',
        r.turned.slice(0, 4)
          .map(x => `${x.k} (${x.lefty ? 'L' : 'R'}) ${x.v}%`).join(', ')
          + (r.turned.length > 4 ? ` and ${r.turned.length - 4} more` : ''));
      ok(r.thin.length === 0,
        `${label}: and none is under 25% drawn (worst ${r.worst.v}%, ${r.worst.k})`,
        r.thin.slice(0, 4)
          .map(x => `${x.k} (${x.lefty ? 'L' : 'R'}) ${x.v}% in frame`).join(', ')
          + (r.thin.length > 4 ? ` and ${r.thin.length - 4} more` : ''));
      ok(r.lost.length === 0,
        `${label}: the zone and everything the arm can throw stay in frame`,
        r.lost.slice(0, 3)
          .map(x => `${x.k}: zone ${x.zone}%, ball range ${x.ball}%`).join('; '));
      ok(errors.length === 0, `${label}: no page errors`, errors.join(' | '));
      await pg.close(); await ctx.close();
    }
  }

  /* ---- the field's own instructions are where the eye is ---- */
  {
    console.log('the field\'s own instructions are where the eye is');
    /* Three windows can open once the ball is hit, and each one draws its
       instruction ON THE FIELD through the crisp pass: `THROW TO FIRST ·
       SPACE OR CLICK` under the bar, `CATCH IT!` over the ring. For a pass
       every one of them landed a third of the way to the corner at a third
       of its size, because the bridge into the display bitmap divided by
       PIX twice, and nothing here read type off the canvas so nothing said
       so. This does: it drives a real throw window and a real catch window,
       finds the label's gold on the glass, and asks where and how big.

       THE CLAIMS ARE PROPERTIES. The throw bar is centred on the plate, so
       its label is centred on the crop; it stands in the bottom half; and it
       is at least eight CSS pixels of cap height, which is the floor the
       ball already has. On a screen where the deck floats over the field it
       also has to be ABOVE the deck, because the bar used to sit behind the
       pitch buttons on a desktop and the window was played blind. The
       catch ring's two labels have to bracket the ring. Reintroduce the old
       bridge and the throw label reads 13% across, 32% down, four pixels
       tall: every claim but "found" fails. */
    const boxes = (d, W, H) => {
      /* Self contained, because it is shipped into the page as source. */
      const gold = (d, i) => d[i] >= 232 && d[i + 1] >= 180 && d[i + 1] <= 208
                          && d[i + 2] >= 70 && d[i + 2] <= 112;
      /* Row histogram of gold, split into bands where a row has none: one
         line of type is one band. Returns each band's bbox in bitmap px. */
      const rows = new Array(H).fill(0);
      let x0 = new Array(H).fill(1e9), x1 = new Array(H).fill(-1);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (gold(d, i)) { rows[y]++; if (x < x0[y]) x0[y] = x; if (x > x1[y]) x1[y] = x; }
      }
      const out = []; let cur = null;
      for (let y = 0; y < H; y++) {
        if (rows[y] >= 3) {
          if (!cur) cur = { y0: y, y1: y, x0: x0[y], x1: x1[y], n: rows[y] };
          else { cur.y1 = y; cur.x0 = Math.min(cur.x0, x0[y]); cur.x1 = Math.max(cur.x1, x1[y]); cur.n += rows[y]; }
        } else if (cur && y > cur.y1 + 2) { out.push(cur); cur = null; }
      }
      if (cur) out.push(cur);
      /* A STRAW HAT IS GOLD TOO. Humpty Dumpty bats in one, at the plate,
         which is the bottom centre of the crop: 71 pixels wide, 8 rows,
         centred, and the first draft of this took it for the throw bar's
         label and passed the old page on a desktop. The label is printed on
         the bar's near black, so each band records whether the pixels just
         outside it are dark, and the throw claim asks for that. */
      for (const b of out) {
        const ym = (b.y0 + b.y1) >> 1;
        const dark = (x) => { x = Math.max(0, Math.min(W - 1, x)); const i = (ym * W + x) * 4;
                              return d[i] < 48 && d[i + 1] < 48 && d[i + 2] < 48; };
        b.dark = dark(b.x0 - 4) && dark(b.x1 + 4);
      }
      /* a band of type is wide: a stray gold pixel or a chip is not */
      return out.filter(b => b.x1 - b.x0 > 40 && b.n > 60);
    };
    for (const [label, w, h, dpr] of [['phone', 390, 844, 3], ['desktop', 1440, 900, 1]]) {
      const { ctx, pg, errors } = await game(browser, w, h, dpr);
      await pg.evaluate(() => startGame({ mode: 'exhibition', youHome: true }));
      await pg.waitForTimeout(900);
      /* the throw window */
      await pg.evaluate(() => { const g = State.game; endAtBatCleanup(); g.pitch = null;
        scheduleContactPlay('ground out', currentBatter(), { off: 0, q: 0.6, lefty: batsLeft(currentBatter().k) }); });
      const opened = await pg.waitForFunction(() => State.game.play && State.game.play.throwActive,
        null, { timeout: 8000 }).then(() => true).catch(() => false);
      await pg.waitForTimeout(120);
      const r = await pg.evaluate((boxesSrc) => {
        const boxes = eval('(' + boxesSrc + ')');
        const cv = document.getElementById('field');
        const c = cv.getContext('2d');
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        const rect = cv.getBoundingClientRect();
        const k = cv.width / rect.width;                 /* bitmap px per CSS px */
        const bands = boxes(d, cv.width, cv.height).map(b => ({
          cx: (b.x0 + b.x1) / 2 / cv.width, cy: (b.y0 + b.y1) / 2 / cv.height,
          h: (b.y1 - b.y0 + 1) / k, bottomPage: rect.top + b.y1 / k, dark: b.dark }));
        const m = document.querySelector('.meter-wrap');
        const deckTop = m && m.offsetParent ? m.getBoundingClientRect().top : null;
        const overlaps = deckTop != null && deckTop < rect.bottom - 1;
        return { bands, deckTop, overlaps, cvBottom: rect.bottom };
      }, boxes.toString());
      ok(opened, `${label}: a throw window opens on a grounder`);
      const lab = r.bands.filter(b => b.cy > 0.5 && b.dark).sort((a, b) => b.h - a.h)[0];
      ok(!!lab, `${label}: the throw bar's label is on the glass, on the bar`,
        `gold bands: ${JSON.stringify(r.bands)}`);
      if (lab) {
        ok(Math.abs(lab.cx - 0.5) < 0.06, `${label}: and it is centred on the plate, under the bar`,
          `centre at ${(lab.cx * 100).toFixed(0)}% across`);
        ok(lab.h >= 7, `${label}: and it is at least seven CSS pixels of cap, core pixels only`,
          `${lab.h.toFixed(1)}px`);
        if (r.overlaps) {
          ok(lab.bottomPage < r.deckTop - 2, `${label}: and the bar stands above the deck that floats over the field`,
            `label bottom ${lab.bottomPage.toFixed(0)}, deck top ${r.deckTop.toFixed(0)}`);
        }
      }
      /* the catch window, on a fresh play */
      await pg.waitForFunction(() => !State.game.play, null, { timeout: 15000 }).catch(() => {});
      await pg.waitForTimeout(2500);
      await pg.evaluate(() => { const g = State.game; endAtBatCleanup(); g.pitch = null;
        scheduleFlyCatchMinigame('fly out', currentBatter(), { off: 0, q: 0.6, lefty: batsLeft(currentBatter().k) }); });
      const ring = await pg.waitForFunction(() => State.game.play && State.game.play.catchActive,
        null, { timeout: 8000 }).then(() => true).catch(() => false);
      await pg.waitForTimeout(200);
      const r2 = await pg.evaluate((boxesSrc) => {
        const boxes = eval('(' + boxesSrc + ')');
        const cv = document.getElementById('field');
        const c = cv.getContext('2d');
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        const rect = cv.getBoundingClientRect();
        const k = cv.width / rect.width;
        const cw = State.game.play && State.game.play.catchWindow;
        /* the ring's centre on the bitmap, through the same camera the
           blit used: logical / PIX is blocks, minus the crop, times draw */
        const ring = cw ? { x: (cw.landingX / PIX - FIELD_CAM.sx) * FIELD_CAM.draw / cv.width,
                            y: (cw.landingY / PIX - FIELD_CAM.sy) * FIELD_CAM.draw / cv.height } : null;
        return { ring, bands: boxes(d, cv.width, cv.height).map(b => ({
          cx: (b.x0 + b.x1) / 2 / cv.width, cy: (b.y0 + b.y1) / 2 / cv.height, h: (b.y1 - b.y0 + 1) / k })) };
      }, boxes.toString());
      ok(ring && r2.ring, `${label}: a catch window opens on a fly ball`);
      if (r2.ring) {
        /* within a ring's reach of the ring, in both axes, so the hat at the
           plate cannot be the lower label of a ring in centre field */
        const near = r2.bands.filter(b => Math.abs(b.cx - r2.ring.x) < 0.12 && Math.abs(b.cy - r2.ring.y) < 0.2);
        const above = near.some(b => b.cy < r2.ring.y), below = near.some(b => b.cy > r2.ring.y);
        ok(above && below, `${label}: CATCH IT! and SPACE / CLICK bracket the ring`,
          `ring at (${(r2.ring.x * 100).toFixed(0)}%, ${(r2.ring.y * 100).toFixed(0)}%), bands ${JSON.stringify(r2.bands)}`);
        ok(near.every(b => b.h >= 7), `${label}: and both are at least seven CSS pixels of cap, core pixels only`,
          near.map(b => b.h.toFixed(1)).join(', '));
      }
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
