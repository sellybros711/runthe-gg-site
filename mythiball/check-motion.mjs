#!/usr/bin/env node
/* The motion on every screen that is not the game, held to what it promises.

     node mythiball/check-motion.mjs

   EVERY CLAIM HERE IS ABOUT HOW A SCREEN ENDS UP, NOT HOW IT LOOKS WHILE IT
   MOVES. An entrance is a fraction of a second; what can go wrong with one is
   that it never finishes (a card left at opacity nought, which renders as a
   hole and throws nothing), that it plays again on every tap (a page that
   flinches whenever it is touched), that it reaches the game (six checkers
   measure rectangles over the field), or that it keeps going for somebody who
   asked the operating system for no motion at all. None of those is visible
   in a single screenshot and all of them are properties.

   It also reads the stylesheet: an animation that moves anything but a
   transform or an opacity repaints on every frame, and that is the stutter
   the whole block was written to avoid. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
import path from 'node:path';
import fs from 'node:fs';

const PAGE = process.env.MYTHIBALL_PAGE
  ? path.resolve(process.env.MYTHIBALL_PAGE)
  : path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), 'index.html');
const PAGE_URL = 'file://' + PAGE;

let fails = 0;
const ok = (cond, what, why) => {
  if (cond) console.log('  ok   ' + what);
  else { fails++; console.log('  FAIL ' + what + (why ? '\n         ' + why : '')); }
};

/* ---- 1. the stylesheet ---- */
console.log('the keyframes move a transform or an opacity and nothing else');
{
  const src = fs.readFileSync(PAGE, 'utf8');
  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  const frames = [...css.matchAll(/@keyframes\s+(mo-[\w-]+)\s*\{/g)];
  /* `animation-timing-function` inside a keyframe is not a property that
     is animated: it is the easing of the segment that starts there, which
     is how a sweep can run linear and then stop dead. */
  const allowed = new Set(['transform', 'opacity', '--n', 'animation-timing-function']);
  const bad = [];
  for (const m of frames) {
    /* Brace matched rather than regexed: a keyframe block holds blocks. */
    let i = m.index + m[0].length, depth = 1;
    const start = i;
    while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    const body = css.slice(start, i - 1);
    for (const d of body.matchAll(/([\w-]+)\s*:/g)) {
      if (!allowed.has(d[1])) bad.push(m[1] + ' animates ' + d[1]);
    }
  }
  /* A regex that finds nothing passes: the count is the coverage. */
  ok(frames.length >= 15, `the motion block is there to read (${frames.length} keyframes)`, 'found ' + frames.length);
  ok(bad.length === 0, 'every one is compositor only', bad.join(', '));
}

const browser = await chromium.launch();

async function open(opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true }, opts || {}));
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(PAGE_URL);
  await pg.evaluate(() => localStorage.clear());
  await pg.goto(PAGE_URL);
  await pg.evaluate(() => { Sound.muted = true; PREFS.coach = false; PREFS.cutscenes = false; });
  return { ctx, pg, errors };
}

const SCREENS = {
  menu:        () => { State.screen = 'menu'; render(); },
  howto:       () => { State.screen = 'howto'; render(); },
  meet:        () => { State.screen = 'meet'; render(); },
  settings:    () => { State.screen = 'settings'; render(); },
  roster:      () => { State.mode = 'exhibition'; State.screen = 'roster'; render(); },
  franchise:   () => { State.screen = 'franchise'; render(); },
  'season-hub': () => { State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
                        State.innings = 5; State.mode = 'season'; startSeason(); },
  cup:         () => { State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
                       State.innings = 5; State.mode = 'cup'; startCup(); },
};

/* ---- 2. every screen arrives, and every entrance finishes ---- */
for (const [tag, dims] of [['phone', { viewport: { width: 390, height: 844 } }],
                           ['desktop', { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }]]) {
  console.log(`\nevery screen arrives and settles, ${tag}`);
  const { ctx, pg, errors } = await open(dims);
  /* From the menu, so each screen below is a CHANGE of screen. */
  await pg.evaluate(() => { State.screen = 'menu'; render(); });
  for (const [name, go] of Object.entries(SCREENS)) {
    if (name === 'menu') continue;
    const at = await pg.evaluate(async (src) => {
      State.screen = 'menu'; render();
      (0, eval)('(' + src + ')')();
      const rising = document.querySelectorAll('#app .mo-in').length;
      /* Sampled while it moves: a slam or a rise that pushes the page wider
         than the window puts a sideways scrollbar under a phone. */
      let wide = 0;
      for (const t of [30, 120, 260]) {
        await new Promise(r => setTimeout(r, t));
        wide = Math.max(wide, document.documentElement.scrollWidth - innerWidth);
      }
      return { rising, wide };
    }, go.toString());
    await pg.waitForTimeout(1900);
    const end = await pg.evaluate(() => {
      const left = document.querySelectorAll('#app .mo-in, #app .mo-row').length;
      /* Nothing on the screen is left see through. A card stuck at the first
         keyframe renders as a gap and reports nothing. */
      const faint = [...document.querySelectorAll('#app .screen > *, #app .screen > .card > *')]
        .filter(e => parseFloat(getComputedStyle(e).opacity) < 0.99).length;
      return { left, faint };
    });
    ok(at.rising >= 2, `${name}: rises in (${at.rising} units)`, 'units ' + at.rising);
    ok(end.left === 0 && end.faint === 0, `${name}: and every entrance finished`,
       `${end.left} still carrying an entrance class, ${end.faint} left faint`);
    ok(at.wide <= 0, `${name}: nothing pushes the page sideways on the way in`, `${at.wide}px too wide`);
  }
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 3. the same screen again does not replay it ---- */
console.log('\na tap on a screen answers, and the screen does not arrive again');
{
  const { ctx, pg, errors } = await open();
  await pg.evaluate(() => { State.screen = 'settings'; render(); });
  await pg.waitForTimeout(1600);
  const t = await pg.$$('#app .toggle:not(.on)');
  ok(t.length > 0, 'settings has a choice to make', 'no toggle');
  const label = t.length ? ((await t[0].textContent()) || '').trim() : '';
  if (t.length) await t[0].click();
  const r = await pg.evaluate((label) => {
    const hit = [...document.querySelectorAll('#app .toggle')].find(b => b.textContent.trim() === label);
    return { rising: document.querySelectorAll('#app .mo-in').length,
             popped: !!(hit && hit.classList.contains('mo-pop')), on: !!(hit && hit.classList.contains('on')) };
  }, label);
  ok(r.on, `the toggle took (${label})`, JSON.stringify(r));
  ok(r.rising === 0, 'nothing on the page rose in again', r.rising + ' units replayed');
  ok(r.popped, 'and the pressed one popped', JSON.stringify(r));
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 4. never on the game ---- */
console.log('\nthe game carries none of it');
{
  const { ctx, pg, errors } = await open();
  const r = await pg.evaluate(async () => {
    State.team = ROSTER.slice(0, 9).map(c => c.k); State.opponent = OPPONENTS[0];
    State.innings = 5; State.mode = 'exhibition';
    startGame({ mode: 'exhibition', youHome: false });
    await new Promise(r => setTimeout(r, 400));
    return { screen: State.screen, rising: document.querySelectorAll('#app .mo-in, #app .mo-row').length };
  });
  ok(r.screen === 'game' && r.rising === 0, 'a game screen gets no entrance', JSON.stringify(r));
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 5. the result: a scoreboard that counts, and a celebration that ends ---- */
console.log('\nthe result screen');
const toResult = async (pg, you, them) => pg.evaluate(async ({ you, them }) => {
  State.team = ROSTER.slice(0, 9).map(c => c.k); State.opponent = OPPONENTS[0];
  State.innings = 5; State.mode = 'exhibition';
  startGame({ mode: 'exhibition', youHome: false });
  await new Promise(r => setTimeout(r, 300));
  const g = State.game;
  const Y = g.away.isYou ? g.away : g.home, T = g.away.isYou ? g.home : g.away;
  Y.score = you; T.score = them; g.over = true; g.live = false;
  State.screen = 'result'; render();
  /* THE NUMBER IN THE DOM IS THE RESULT FROM THE FIRST FRAME. The counting
     figure is paint; anything that reads the page reads the answer. */
  const runs = [...document.querySelectorAll('.fb-runs')].map(e => e.textContent.trim());
  return { runs, cv: !!document.querySelector('.confetti-cv') };
}, { you, them });
{
  const { ctx, pg, errors } = await open();
  const first = await toResult(pg, 7, 3);
  /* You bat first here, so you are the away row, which is the TOP row. */
  ok(first.runs.join(',') === '7,3', 'the scoreboard holds the real score from frame one (away over home)', first.runs.join(','));
  ok(first.cv, 'a win opens the celebration', JSON.stringify(first));
  const pe = await pg.evaluate(() => {
    const c = document.querySelector('.confetti-cv');
    return c ? getComputedStyle(c).pointerEvents : 'gone';
  });
  ok(pe === 'none', 'and it never takes a press', pe);
  await pg.waitForTimeout(2200);
  const counted = await pg.evaluate(() => [...document.querySelectorAll('.fb-runs')]
    .map(e => getComputedStyle(e, '::after').counterReset));
  ok(counted.join(',') === 'n 7,n 3', 'the figures land on the score', counted.join(','));
  await pg.waitForTimeout(3200);
  ok(await pg.evaluate(() => !document.querySelector('.confetti-cv')), 'the celebration removes itself when it is down', '');
  /* Leaving mid celebration takes it with it. */
  await toResult(pg, 5, 1);
  await pg.evaluate(() => { State.game = null; State.screen = 'menu'; render(); });
  ok(await pg.evaluate(() => !document.querySelector('.confetti-cv')), 'and leaving the screen ends it at once', '');
  const loss = await toResult(pg, 1, 4);
  ok(!loss.cv, 'a loss is not celebrated', JSON.stringify(loss));
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 6. the tilt is for a mouse ---- */
console.log('\nthe tilt follows a mouse and ignores a finger');
{
  const { ctx, pg } = await open({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
  await pg.waitForTimeout(1500);
  const tile = await pg.$('.hmode');
  const box = await tile.boundingBox();
  await pg.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2);
  await pg.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.25);
  const rx = await pg.evaluate(() => document.querySelector('.hmode').style.getPropertyValue('--ry'));
  ok(rx && parseFloat(rx) > 0, 'a mouse over a tile tips it toward the pointer', 'ry=' + rx);
  await ctx.close();
}
{
  const { ctx, pg } = await open();
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(() => {
    const t = document.querySelector('.hmode');
    const b = t.getBoundingClientRect();
    t.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: b.right - 4, clientY: b.top + 4 }));
    return t.style.getPropertyValue('--ry');
  });
  ok(!r, 'a phone never tilts', 'ry=' + r);
  await ctx.close();
}

/* ---- 7. reduced motion is a full stop ---- */
console.log('\nreduced motion');
{
  const { ctx, pg, errors } = await open({ reducedMotion: 'reduce' });
  const r = await pg.evaluate(async () => {
    const out = {};
    for (const s of ['menu', 'howto', 'settings']) {
      State.screen = s; render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      out[s] = document.getAnimations().filter(a => a.playState === 'running').length;
    }
    return out;
  });
  ok(Object.values(r).every(n => n === 0), 'no screen runs an animation', JSON.stringify(r));
  const win = await toResult(pg, 6, 2);
  ok(!win.cv, 'and a win is not showered', JSON.stringify(win));
  const counted = await pg.evaluate(() => [...document.querySelectorAll('.fb-runs')]
    .map(e => getComputedStyle(e, '::after').counterReset));
  ok(counted.join(',') === 'n 6,n 2', 'the scoreboard reads the score with nothing counting', counted.join(','));
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 8. how to play opens with the quick start ---- */
console.log('\nhow to play opens by showing how to play');
{
  /* FIRST, MOVING, AND STILL A LESSON WHEN IT STOPS. The page used to open
     on eight hundred words, so a stranger met the rules before the controls.
     The quick start is four loops above all of that. What can go wrong is
     that it slides down the page as cards are added, that its loops stop
     (a picture of a step is not the step), or that the frame reduced motion
     rests on is a frame that explains nothing. */
  const { ctx, pg, errors } = await open();
  await pg.evaluate(() => { State.screen = 'howto'; render(); });
  await pg.waitForTimeout(1200);
  const r = await pg.evaluate(async () => {
    const s = document.querySelector('#app .screen');
    const qs = s && s.querySelector(':scope > .qs');
    if (!qs) return { found: false };
    const kids = [...s.children];
    const qsTop = qs.getBoundingClientRect().top;
    const firstProse = kids.filter(k => k.matches('.card') && k !== qs)
      .reduce((m, k) => Math.min(m, k.getBoundingClientRect().top), Infinity);
    const steps = [...qs.querySelectorAll('.qs-step')];
    const running = steps.map(st => document.getAnimations()
      .filter(a => a.playState === 'running' && a.effect && st.contains(a.effect.target)).length);
    /* Where every moving part is, sampled across a third of a loop. A
       hold phase can be most of a second, so one pair of readings is a
       coin toss on whether it lands in one. */
    const at = () => steps.map(st => [...st.querySelectorAll('.mv')].map(e => {
      const b = e.getBoundingClientRect(); return [b.x, b.y, b.width];
    }));
    const reads = [];
    for (let i = 0; i < 4; i++) { reads.push(at()); await new Promise(r => setTimeout(r, 450)); }
    const moved = steps.map((_, i) => reads.some(rd => rd[i].some((v, j) =>
      v.some((n, k) => Math.abs(n - reads[0][i][j][k]) > 1))));
    return {
      found: true,
      second: kids.indexOf(qs) === 1 && kids[0].matches('h2'),
      above: qsTop < firstProse,
      steps: steps.length,
      whole: steps.every(st => st.querySelector('svg') && st.querySelector('h4') && st.querySelector('p')),
      running, moved,
    };
  });
  ok(r.found, 'the page has a quick start', JSON.stringify(r));
  if (r.found) {
    ok(r.second && r.above, 'and it is the first thing under the heading, above every card of prose', JSON.stringify(r));
    ok(r.steps === 4 && r.whole, 'four steps, each a picture, a name and a line', JSON.stringify(r));
    ok(r.running.every(n => n >= 2), 'every step is animating', r.running.join(','));
    ok(r.moved.every(Boolean), 'and its parts actually move on the glass', r.moved.join(','));
  }
  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await ctx.close();

  /* Reduced motion keeps the pictures and stops them on the frame that
     explains the step. Each claim is a relation between two drawn things,
     so a restyle that keeps the lesson keeps passing. */
  const still = await open({ reducedMotion: 'reduce' });
  await still.pg.evaluate(() => { State.screen = 'howto'; render(); });
  await still.pg.waitForTimeout(600);
  const z = await still.pg.evaluate(() => {
    const c = sel => { const b = document.querySelector('.qs ' + sel).getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, top: b.top, bottom: b.bottom }; };
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const green = c('.pi-green'), cur = c('.pi-cur');
    return {
      running: document.getAnimations().filter(a => a.playState === 'running'
        && document.querySelector('.qs').contains(a.effect && a.effect.target)).length,
      aim: near(c('.aim-bat ellipse:nth-child(3)'), c('.aim-ball circle')),
      swing: near(c('.sw-oval ellipse:nth-child(3)'), c('.sw-ball circle')),
      curIn: cur.y >= green.top && cur.y <= green.bottom,
      ring: c('.fi-ring').w / c('.fi-sweet').w,
      out: parseFloat(getComputedStyle(document.querySelector('.qs .fi-out')).opacity),
    };
  });
  ok(z.running === 0, 'under reduced motion nothing in it runs', z.running + ' running');
  ok(z.aim < 1.5 && z.swing < 1.5, 'and it rests with the bat on the ball', JSON.stringify(z));
  ok(z.curIn, 'the release rests in the green', JSON.stringify(z));
  ok(z.ring < 1.6 && z.out > 0.99, 'the catch rests at its tightest, called out', JSON.stringify(z));
  ok(still.errors.length === 0, 'no page errors', still.errors.join(' | '));
  await still.ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nthe motion settles, stays off the game and stops when asked');
process.exit(fails ? 1 : 0);
