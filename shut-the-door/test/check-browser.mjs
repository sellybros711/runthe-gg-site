/* Shut The Door: the page, played in Chromium.
 *
 *   node shut-the-door/test/check-browser.mjs
 *   SHOTS=/some/dir node shut-the-door/test/check-browser.mjs   and a screenshot of every screen
 *
 * Serves the repo root with a tiny static server, then at 390x844 and at
 * 1440x900:
 *   1. home loads, with the pitcher's card and the situation, and no tutorial
 *      opens by itself
 *   2. every sheet opens from its button and closes: menu, how to play,
 *      stats, past dailies, settings, account
 *   3. the grid is the pitcher's view: cell 0 (catcher's left) is drawn on the
 *      right, through screenCol()
 *   4. take the mound, scout the batter (the heat map lands on the same grid)
 *   5. throw a whole outing to a result: every pitch animates, a tap skips it
 *      and none is needed. Between the first pitch and the last nothing is
 *      graded or tipped: no grade card, no strip square, no band word, no
 *      banner, flash or sheet, and nothing over the field (the owner,
 *      2026-10-17). One quiet play by play line under the scoreboard.
 *   6. the end reveal: outcome, strip, percentile, pitched like and the real
 *      pitcher's night, on screen together; share
 *   7. run it back is practice; a reload shows today as done
 *   8. ?debug=1 shows the seed
 *   9. no page error and no console error anywhere
 *  10. the framing: the whole batter, catcher and umpire (and in 3D home plate)
 *      are in frame for a left and a right handed hitter, cells 38 px or more
 *  14. the 3D mound: the canvas renders, and every kind of result plays its
 *      motion (from a trace of each play), with the pitch's trail and its aimed
 *      and actual markers, and no 3D grid
 *  11. all three endings, forced through the mock (?mockEnd=): door shut,
 *      door's open (a runner put out on a double play, then the tying run)
 *      and walk-off (runners moving up, then scoring), with the runners on
 *      the field and on the scorebar's diamond; the proxy note and a reveal
 *      with no pitch count; the stats sheet from the account and from the
 *      device
 *  13. the brand: the outlined lockup in the header for the theme, the
 *      manifest and its icons, the favicons and the apple touch icon
 *  12. the pitching coach: never open by itself, opens from its button, says
 *      one line on the outing, then the lesson (your call against the best on
 *      the mirrored mini grid, the why, next time, the numbers, how the pros
 *      do it when there is a pro), then the pattern, then the whole outing
 *      pitch by pitch with band and reason. On the real engine and on the
 *      mock: a pro, no pro (?mockPro=none) and no lesson (?mockLesson=none)
 *
 * Steps 1 to 10 play the real engine (no mock switch). Step 11 forces each
 * ending through mock-api.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  const tries = ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

let passes = 0, fails = 0;
function ok(c, m) { if (c) { passes++; console.log('  ok ' + m); } else { fails++; console.log('  FAIL ' + m); } }

const TYPES = { '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/shut-the-door/';

const pw = loadPlaywright();
/* one running number per screen size, across the main run and the endings */
const SHOT_N = {};
const nextN = (tag) => { SHOT_N[tag] = (SHOT_N[tag] || 0) + 1; return String(SHOT_N[tag]).padStart(2, '0'); };
const browser = await pw.chromium.launch(CHROME ? { executablePath: CHROME } : {});


/* ---- shared steps ------------------------------------------------------- */

/* Headless Chromium draws WebGL in software, a frame in a large fraction of a second, so on a real
   clock a pitch would show two frames. The 3D mound takes a stepped clock for the check: a pitch
   plays every frame of its motion at 15 a second, and draws every third. */
const STAGE_TEST = () => { window.STD_STAGE_TEST = { step: 1 / 15, renderEvery: 3 }; };

/* The owner's rule while pitching: nothing graded, nothing tipped, nothing
   over the field. Returns what broke it, or an empty list. */
async function quietProblems(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
    };
    const mound = document.getElementById('s-mound'), out = [];
    if ([...mound.querySelectorAll('.sq, .pill, .strip')].some(vis)) out.push('a grade square');
    const text = mound.innerText;
    if (/\b(green|yellow|orange|red)\b/i.test(text)) out.push('a band word');
    if (/\b(best call|pts|hold \d|next time)\b/i.test(text)) out.push('grade copy');
    if ([...document.querySelectorAll('.gcard, .callout, .flash, #toast.on')].some(vis)) out.push('a banner or card');
    if ([...document.querySelectorAll('.sheet')].some((s) => !s.hidden)) out.push('a sheet');
    const sc = document.getElementById('m-scene').getBoundingClientRect();
    const fine = (el) => el && (el.tagName === 'CANVAS' || el.closest('.grid') || el.id === 'm-proxy' || el.id === 'm-dbg');
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
      const el = document.elementFromPoint(sc.left + sc.width * i / 6, sc.top + sc.height * j / 6);
      if (!fine(el)) { out.push('over the field: ' + (el ? el.id || el.className || el.tagName : 'nothing')); return out; }
    }
    return out;
  });
}

/* The 3D mound (3d/stage.js). Waits for its downloads, then reads pixels straight off the WebGL
   canvas after a draw: the park, the people and the zone's surroundings, not a blank or one color. */
async function stageReady(page) {
  const on = await page.evaluate(() => !!(window.STD_STAGE && window.STD_STAGE.supported()));
  if (!on) return false;
  await page.waitForFunction(() => window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 90000 });
  await page.evaluate(() => window.STD_UI.state.scene.real.ready);
  return true;
}
async function canvasRenders(page) {
  return page.evaluate(() => {
    const st = window.STD_STAGE.current, gl = st.renderer.getContext();
    st.render();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4), seen = new Set();
    let lit = 0, n = 0;
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
      gl.readPixels(Math.floor(W * i / 12), Math.floor(H * j / 12), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      seen.add((px[0] >> 4) + ',' + (px[1] >> 4) + ',' + (px[2] >> 4));
      if (px[0] + px[1] + px[2] > 30) lit++;
      n++;
    }
    const cv = document.getElementById('m-canvas'), r = cv.getBoundingClientRect();
    return { W, H, css: [Math.round(r.width), Math.round(r.height)], colors: seen.size, lit: lit / n, s3d: document.getElementById('m-scene').classList.contains('s3d') };
  });
}

/* What a PitchResult must look like on the field (3d/play.js reads it; this is the spec, written
   apart from it): the hitter's motion, where the ball goes, the umpire's signal. */
function expectedMotion(tr) {
  const r = tr.result, swing = ['swinging_strike', 'foul', 'foul_tip', 'in_play'].includes(r);
  const batter = swing ? 'swing' : r === 'hit_by_pitch' ? 'hbp' : tr.check ? 'check' : 'take';
  const ball = tr.dirt ? ['dirt'] : r === 'foul_tip' ? ['tip'] : r === 'foul' ? ['back', 'pulled'] : r === 'in_play' ? ['play'] : r === 'hit_by_pitch' ? ['hbp'] : ['glove'];
  const ump = r === 'called_strike' ? 'strike' : r === 'foul' ? 'foul' : r === 'hit_by_pitch' ? 'hbp' : null;
  return { batter, ball, ump };
}
/* Read one play's trace (the stage keeps it): the reading matches the result, and the frames show
   it: the ball flies with its trail, the aimed and actual markers show, a swing moves the bat, a
   ball in play leaves, the umpire signals, and no 3D grid is drawn. Returns what is wrong, or an
   empty list. */
function motionProblems(tr) {
  const out = [], e = expectedMotion(tr), name = tr.result + (tr.bb ? ' ' + tr.bb : '') + (tr.check ? ' (check)' : '') + (tr.dirt ? ' (dirt)' : '');
  if (tr.m.batter !== e.batter) out.push(name + ': the hitter does ' + tr.m.batter + ', not ' + e.batter);
  if (!e.ball.includes(tr.m.ball)) out.push(name + ': the ball goes ' + tr.m.ball + ', not ' + e.ball.join(' or '));
  if ((tr.m.ump || null) !== e.ump) out.push(name + ': the umpire signals ' + tr.m.ump + ', not ' + e.ump);
  if (tr.s.some((x) => x.grid)) out.push(name + ': the 3D grid was drawn in play (the game draws its own, while aiming)');
  if (tr.skipped) return out;
  // the pitch's own picture (not a grade): its trail, and where it was aimed against where it went
  if (!tr.s.some((x) => x.trail > 0.1)) out.push(name + ': no trail behind the pitch');
  if (!tr.s.some((x) => x.aimed > 0.1)) out.push(name + ': no aimed marker');
  if (!tr.s.some((x) => x.actual > 0.1)) out.push(name + ': no marker where it crossed');
  if (tr.frames < 5) out.push(name + ': only ' + tr.frames + ' frames');
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const balls = tr.s.filter((x) => x.ball);
  if (balls.length < 3) { out.push(name + ': the ball was seen in ' + balls.length + ' frames'); return out; }
  const flew = Math.max(...balls.map((x) => d(x.ball, balls[0].ball)));
  if (flew < 14) out.push(name + ': the ball flew ' + flew.toFixed(1) + ' m');
  const s0 = tr.s[0], before = tr.s.filter((x) => x.t < tr.resultAt - 0.15), after = tr.s.filter((x) => x.t >= tr.resultAt);
  const tip0 = (before.length ? before : tr.s)[0].tip;
  const batMove = Math.max(...tr.s.map((x) => d(x.tip, tip0)));
  if (e.batter === 'swing' && batMove < 0.8) out.push(name + ': the bat moved ' + batMove.toFixed(2) + ' m in a swing');
  if (e.batter === 'check' && batMove < 0.12) out.push(name + ': the bat moved ' + batMove.toFixed(2) + ' m in a check swing');
  if (e.batter === 'hbp' && Math.max(...tr.s.map((x) => d(x.pel, s0.pel))) < 0.05) out.push(name + ': the hitter did not flinch');
  const ballAt = (t) => { const b = balls.filter((x) => x.t >= t); return b.length ? b : null; };
  if (tr.m.ball === 'play' || tr.m.ball === 'back' || tr.m.ball === 'pulled') {
    const b = ballAt(tr.resultAt);
    const off = b ? Math.max(...b.map((x) => d(x.ball, b[0].ball))) : 0;
    if (off < (tr.m.ball === 'play' ? 6 : 2)) out.push(name + ': off the bat the ball went ' + off.toFixed(1) + ' m');
  }
  if (e.ump && after.length) {
    const rise = (k) => Math.max(...after.map((x) => x[k][1] - s0[k][1]));
    const moved = (k) => Math.max(...after.map((x) => d(x[k], s0[k])));
    const okU = e.ump === 'strike' ? Math.max(rise('uR'), rise('uL')) > 0.2 : e.ump === 'foul' ? Math.min(rise('uR'), rise('uL')) > 0.2 : Math.max(moved('uR'), moved('uL')) > 0.2;
    if (!okU) out.push(name + ': the umpire did not signal ' + e.ump);
  }
  return out;
}

/* The outing's own pitches on the 3D mound: each played its result's motion (a tapped one is
   judged on its reading only), every hitter in turn. */
function traceCheck(label, play) {
  const probs = [].concat(...play.traces.map(motionProblems));
  const kinds = [...new Set(play.traces.map((t) => t.result + (t.bb ? ' ' + t.bb : '')))];
  ok(play.traces.length === play.pitches && probs.length === 0,
    label + ': each of the ' + play.traces.length + ' pitches played its motion on the 3D mound (' + kinds.join(', ') + ')' + (probs.length ? ': ' + probs.slice(0, 4).join(' | ') : ''));
}

/* Every kind of PitchResult, played on the 3D mound straight from a PitchResult (the stage's own
   entry, no engine draw): both hands, each pitch type in turn. Returns the problems and the kinds. */
async function everyResult(page) {
  return page.evaluate(async () => {
    const S = window.STD_UI.state, st = window.STD_STAGE.current, C = window.STD_CONTRACT;
    const was = st.bat, kinds = [];
    const plays = [
      ['ball', 'take', 3, { b: 0, s: 0 }, null, { x: 1.4, zn: 0.5 }],
      ['ball', 'take', 20, { b: 1, s: 0 }, null, { x: 0.2, zn: -1.1 }],          // in the dirt
      ['ball', 'take', 9, { b: 1, s: 2 }, null, { x: 0.8, zn: -0.15 }],          // a check swing, two strikes
      ['called_strike', 'take', 18, { b: 0, s: 0 }, null, { x: 0.5, zn: 0.2 }],
      ['swinging_strike', 'swing', 22, { b: 0, s: 1 }, null, { x: 0.1, zn: 0.0 }],
      ['foul', 'swing', 7, { b: 1, s: 1 }, { bb: 'popup', ev: 70, la: 60, spray: 0 }, { x: 0.05, zn: 0.8 }],
      ['foul', 'swing', 11, { b: 1, s: 1 }, { bb: 'ground', ev: 92, la: 4, spray: -44 }, { x: -0.3, zn: 0.4 }],
      ['foul_tip', 'swing', 12, { b: 2, s: 1 }, null, { x: 0.0, zn: 0.6 }],
      ['in_play', 'swing', 17, { b: 0, s: 0 }, { bb: 'ground', ev: 95, la: -6, spray: 12, result: 'out', text: 'grounds out to short' }, { x: 0.1, zn: 0.3 }],
      ['in_play', 'swing', 12, { b: 0, s: 0 }, { bb: 'line', ev: 104, la: 14, spray: -20, result: 'single', text: 'lines a single to left' }, { x: 0.0, zn: 0.5 }],
      ['in_play', 'swing', 7, { b: 0, s: 0 }, { bb: 'fly', ev: 99, la: 31, spray: 25, result: 'out', text: 'flies out to right' }, { x: 0.0, zn: 0.8 }],
      ['in_play', 'swing', 7, { b: 0, s: 0 }, { bb: 'popup', ev: 80, la: 58, spray: 5, result: 'out', text: 'pops out to second' }, { x: 0.1, zn: 0.9 }],
      ['hit_by_pitch', 'take', 14, { b: 0, s: 0 }, null, { x: 0, zn: 0.4 }],
    ];
    const out = [];
    for (const hand of ['L', 'R']) {
      const b = S.scn.batters.find((x) => x.bats === hand);
      if (!b) { out.push('no ' + hand + ' handed hitter in the pack'); continue; }
      st.setBatter(b);
      for (const [i, [result, batter, cell, countBefore, inPlay, at]] of plays.entries()) {
        const a = S.scn.pitcher.arsenal[i % S.scn.pitcher.arsenal.length];
        // the hit by pitch comes in on the hands: inside is the hitter's side of the plate
        const x = result === 'hit_by_pitch' ? (hand === 'L' ? 1 : -1) * 1.55 : at.x;
        const pr = { n: i + 1, call: { type: a.type, cell }, actual: { x, zn: at.zn }, actualCell: C.cellAt(x, at.zn), velo: a.velo, batter, result,
          inPlay, countBefore, count: countBefore, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false };
        await st.play({ pr, quick: true });
        const tr = st.trace;
        kinds.push(hand + ' ' + result + (inPlay ? ' ' + inPlay.bb : '') + (tr.check ? ' check' : '') + (tr.dirt ? ' dirt' : ''));
        out.push(tr);
      }
    }
    st.setBatter(was);
    S.grid.place(st.gridRect());
    st.draw();
    return { traces: out.filter((x) => typeof x === 'object'), errors: out.filter((x) => typeof x === 'string'), kinds };
  });
}

/* Throw a whole outing. The first pitch gets no tap at all, to show the game
   goes on by itself; later ones are skipped with a tap. The quiet rule is
   checked through each flight and after it. */
async function playOuting(page, o) {
  const CELLS = o.cells || [23, 12, 7, 21, 18, 3, 16, 13, 22, 8, 11, 24];
  const r = { pitches: 0, problems: [], sawMove: false, sawOut: false, pbp: [], traces: [], lastN: null };
  const done = () => page.evaluate(() => document.getElementById('s-result').classList.contains('on'));
  for (let i = 0; i < 80; i++) {
    if (await done()) break;
    const nTypes = await page.$$eval('#m-arsenal .pitch', (b) => b.length);
    await page.click(`#m-arsenal .pitch >> nth=${o.type0 ? 0 : i % nTypes}`);
    await page.click(`#m-scene .grid .cell[data-cell="${o.cell != null ? o.cell : CELLS[i % CELLS.length]}"]`);
    if (i === 0 && o.shot) await o.shot('ready');
    const label = await page.textContent('#m-throw');
    if (!/throw|shut it/.test(label)) { r.problems.push('the throw button was not ready: ' + label); break; }
    await page.click('#m-throw');
    r.pitches++;
    const tapless = i === 0 || !!o.noSkip;
    let shotTaken = false;
    for (let t = 0; t < 80; t++) {
      await page.waitForTimeout(tapless ? 90 : 60);
      if (!tapless && t === 2) await page.mouse.click(o.w / 2, Math.round(o.h * 0.5));
      const s = await page.evaluate(() => ({ dots: document.querySelectorAll('#m-runners circle').length, outs: document.querySelectorAll('#m-runners circle.out').length,
        busy: /pitching/.test(document.getElementById('m-throw').textContent), over: document.getElementById('s-result').classList.contains('on') }));
      if (s.dots) r.sawMove = true;
      if (s.outs) r.sawOut = true;
      if (s.over) break;
      const q = await quietProblems(page);
      if (q.length) r.problems.push('pitch ' + r.pitches + ': ' + q.join(', '));
      if (i === 0 && t === 8 && o.shot && !shotTaken && !o.runnerShots) { shotTaken = true; await o.shot('pitch-flight'); }
      if (o.runnerShots && s.dots && !shotTaken && t > 6) { shotTaken = true; await o.shot('runners-p' + r.pitches); }
      if (!s.busy) break;
    }
    const tr = await page.evaluate(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.trace);
    if (tr && tr.n !== r.lastN) { r.traces.push(tr); r.lastN = tr.n; }
    if (await done()) break;
    const after = await quietProblems(page);
    if (after.length) r.problems.push('after pitch ' + r.pitches + ': ' + after.join(', '));
    r.pbp.push(await page.textContent('#m-pbp'));
    if (i === 0 && o.shot) await o.shot('after-pitch');
  }
  await page.waitForSelector('#s-result.on', { timeout: 6000 });
  return r;
}

/* The end: everything at once, the coach still closed. */
async function revealCheck(page, label, pitches) {
  const rv = await page.evaluate(() => {
    const vis = (id) => { const el = document.getElementById(id); const b = el && el.getBoundingClientRect(); return !!(b && b.width > 0 && b.height > 0); };
    return { outcome: vis('r-outcome') && document.getElementById('r-outcome').textContent, strip: document.querySelectorAll('#r-strip .sq').length,
      pct: vis('r-pct') && document.getElementById('r-pct').textContent, like: vis('r-like'), real: vis('r-reveal'), coachBtn: vis('r-coach'),
      sheetOpen: [...document.querySelectorAll('.sheet')].some((s) => !s.hidden), labels: Object.values(window.STD_CONTRACT.OUTCOME_LABEL) };
  });
  ok(rv.labels.includes(rv.outcome) && rv.strip === pitches && /^\d+(st|nd|rd|th)$/.test(rv.pct) && rv.like && rv.real,
    label + ': the end reveals the outcome (' + rv.outcome + '), the strip (' + rv.strip + '), the percentile (' + rv.pct + '), pitched like and the real one together');
  ok(rv.coachBtn && !rv.sheetOpen, label + ': "talk to pitching coach" is there and nothing opened by itself');
}

/* The coach: only from its button; the lesson; the pro or not; every pitch. */
async function coachCheck(page, label, pitches, expect, shot) {
  await page.waitForTimeout(1200);
  ok(await page.isHidden('#sheet-coach'), label + ': the coach does not open by itself');
  await page.click('#r-coach');
  await page.waitForSelector('#sheet-coach.on', { timeout: 3000 });
  await page.waitForSelector('#coach-chips [data-chip="rest"]', { timeout: 20000 });
  const c = await page.evaluate(() => {
    const L = window.STD_UI.state.result.lesson, log = document.getElementById('coach-log');
    const lc = log.querySelector('.cc.lesson'), pc = log.querySelector('.cc.pro');
    return { L: L ? { why: (L.why || []).length, pro: !!L.pro, pattern: !!L.pattern } : null, text: log.innerText,
      opener: (log.querySelector('.cm.coach') || {}).textContent || '',
      lesson: !!lc, you: !!(lc && lc.querySelector('.cell.m-target')), best: !!(lc && lc.querySelector('.cell.m-best')),
      why: lc ? lc.querySelectorAll('.cc-why li').length : 0, next: !!(lc && lc.querySelector('.cc-next')), num: !!(lc && lc.querySelector('.cc-num')),
      pro: !!pc, proCell: !!(pc && pc.querySelector('.cell.m-actual')), pattern: !!log.querySelector('.cm.pattern') };
  });
  ok(/\d+ pitch/.test(c.opener), label + ': the coach opens with one line on the outing');
  if (expect && 'lesson' in expect) ok(!!c.L === expect.lesson, label + ': the result ' + (expect.lesson ? 'has' : 'has no') + ' lesson, as forced');
  if (!c.L) {
    ok(/nothing to fix\. every pitch was the right idea\./.test(c.text) && !c.lesson, label + ': no lesson, the coach says the contract\'s line');
  } else {
    ok(c.lesson && c.you && c.best, label + ': the lesson shows your pitch against the best on the mirrored mini grid');
    ok(c.why === c.L.why && c.why >= 2 && c.next && c.num, label + ': with ' + c.why + ' why lines, next time and the numbers');
    ok(c.pro === c.L.pro && (!c.pro || c.proCell), label + ': ' + (c.L.pro ? 'how the pros do it, with the pro\'s pitch on a grid' : 'no pro example, no pro block'));
    if (expect && 'pro' in expect) ok(c.L.pro === expect.pro, label + ': the pro is ' + (expect.pro ? 'there' : 'null') + ', as forced');
    ok(c.pattern === c.L.pattern, label + ': the pattern line ' + (c.L.pattern ? 'shows' : 'is absent, as in the lesson'));
  }
  if (shot) await shot(c.L ? (c.L.pro ? 'coach-lesson' : 'coach-lesson-no-pro') : 'coach-no-lesson');
  await page.click('#coach-chips [data-chip="rest"]');
  await page.waitForSelector('#coach-chips [data-chip="done"]', { timeout: 20000 });
  const rv = await page.evaluate(() => [...document.querySelectorAll('#coach-log .review li')].map((li) => ({ band: li.dataset.band, why: (li.querySelector('.rv-why') || {}).textContent || '' })));
  ok(rv.length === pitches && rv.every((x) => /^(green|yellow|orange|red)$/.test(x.band) && x.why.length > 5), label + ': going through the rest lists all ' + rv.length + ' pitches with band and reason');
  if (shot) await shot('coach-review');
  await page.click('#coach-chips [data-chip="done"]');
  await page.waitForSelector('#sheet-coach', { state: 'hidden', timeout: 3000 });
}

async function run(w, h, theme) {
  console.log(`\n${w}x${h}, ${theme}`);
  const tag = w + '-' + theme;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/shut-the-door\/$/, '') });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('runthegrid_theme', t); } catch (e) {} }, theme);
  await page.addInitScript(STAGE_TEST);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  /* nothing leaves the machine: the fonts answer empty, anything else is refused */
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    // supabase-js from the CDN: an empty script, so auth.js stays signed out with no network
    if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    return route.abort();
  });
  const shot = async (name, full) => {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `${tag}-${nextN(tag)}-${name}.png`), fullPage: !!full });
  };

  /* 1 */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-main:not([hidden])', { timeout: 15000 });
  await page.waitForSelector('#b-take', { state: 'visible' });
  const home = await page.evaluate(() => ({
    title: document.getElementById('h-title').textContent,
    ars: document.querySelectorAll('#h-pitcher .ars li:not(.hd)').length,
    sit: document.getElementById('h-sit').textContent,
    openSheets: [...document.querySelectorAll('.sheet')].filter((s) => !s.hidden).length,
    robots: document.querySelector('meta[name=robots]').content,
  }));
  ok(home.title.length > 0 && home.ars >= 2 && /lead/.test(home.sit) && /out/.test(home.sit), '1 home shows the spot, the situation and the arsenal (' + home.ars + ' pitches)');
  ok(home.openSheets === 0, '1 no sheet or tutorial opened by itself');
  ok(/noindex/.test(home.robots), '1 the page is noindexed');
  await shot('home', true);

  /* 13: the brand. The outlined lockup in the header, the icons, the manifest */
  const brand = await page.evaluate(async () => {
    const bm = async (src) => { const b = await createImageBitmap(await (await fetch(src)).blob()); return [b.width, b.height]; };
    const imgs = [...document.querySelectorAll('.hdr .lockup img')].filter((i) => getComputedStyle(i).display !== 'none');
    const wm = await (await fetch(document.querySelector('.hdr .wm-light').getAttribute('src'))).text();
    const man = JSON.parse(await (await fetch(document.querySelector('link[rel=manifest]').getAttribute('href'))).text());
    const icons = [];
    for (const ic of man.icons) icons.push({ sizes: ic.sizes, purpose: ic.purpose, px: (await bm(ic.src)).join('x') });
    const heads = [];
    for (const l of document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')) heads.push((l.getAttribute('sizes') || 'touch') + '=' + (await bm(l.getAttribute('href'))).join('x'));
    return { shown: imgs.length, loaded: imgs.every((i) => i.complete && i.naturalWidth > 0), wmVisible: imgs.some((i) => i.classList.contains('wm')),
      outlined: /<path/.test(wm) && !/<text/.test(wm), name: man.name, themeColor: man.theme_color, display: man.display, icons, heads,
      theme: document.documentElement.dataset.theme, meta: document.getElementById('themeMeta').content };
  });
  ok(brand.shown === 2 && brand.loaded && brand.wmVisible, '13 the header shows the mark and the ' + brand.theme + ' wordmark, both loaded');
  ok(brand.outlined, '13 the wordmark is outlined paths, with no live font');
  ok(brand.name === 'Shut The Door' && /^#[0-9a-f]{6}$/i.test(brand.themeColor) && brand.display === 'standalone', '13 the manifest names the game, in the palette (' + brand.themeColor + ')');
  const want = ['192x192 any 192x192', '512x512 any 512x512', '512x512 maskable 512x512'];
  ok(want.every((x) => brand.icons.some((i) => i.sizes + ' ' + i.purpose + ' ' + i.px === x)), '13 the manifest icons are 192, 512 and a maskable 512, at their sizes');
  ok(['32x32=32x32', '16x16=16x16', 'touch=180x180'].every((x) => brand.heads.includes(x)), '13 favicon 32 and 16 and the apple touch icon 180 are linked and the right size');

  /* 2 */
  for (const [btn, id, name] of [['#b-menu', 'sheet-menu', 'menu'], ['[data-open="how"]', 'sheet-how', 'how'], ['[data-open="stats"]', 'sheet-stats', 'stats'],
    ['@menu [data-open="past"]', 'sheet-past', 'past'], ['[data-open="settings"]', 'sheet-settings', 'settings'], ['#b-profile', 'sheet-auth', 'account']]) {
    /* past dailies lives in the menu only */
    if (btn.startsWith('@menu')) { await page.click('header #b-menu'); await page.waitForSelector('#sheet-menu.on'); await page.click('#sheet-menu ' + btn.slice(6)); }
    else await page.click('#h-main ' + btn + ', header ' + btn);
    await page.waitForSelector('#' + id + '.on', { timeout: 3000 });
    await page.waitForTimeout(260);
    const filled = await page.evaluate((i) => document.querySelector('#' + i + ' .sh-in').textContent.trim().length, id);
    ok(filled > 20, '2 ' + name + ' opens and has something in it');
    await shot('sheet-' + name);
    await page.click('#' + id + ' .sh-x');
    await page.waitForSelector('#' + id, { state: 'hidden', timeout: 3000 });
  }
  /* pitching 101: from the menu, and from inside how to play */
  await page.click('header #b-menu');
  await page.waitForSelector('#sheet-menu.on');
  await page.click('#sheet-menu [data-open="101"]');
  await page.waitForSelector('#sheet-101.on', { timeout: 3000 });
  const p101 = await page.evaluate(() => ({ n: document.querySelectorAll('#p101-body .p101 li').length, keys: [...document.querySelectorAll('#p101-body .p101 li')].map((l) => l.dataset.principle) }));
  ok(p101.n === 11, '2 pitching 101 opens from the menu with every principle (' + p101.n + ')');
  await page.waitForTimeout(260);
  await shot('sheet-101');
  await page.click('#sheet-101 .sh-x');
  await page.click('#h-main [data-open="how"]');
  await page.waitForSelector('#sheet-how.on');
  await page.click('#how-body [data-open-101]');
  ok(await page.isVisible('#sheet-101'), '2 how to play links to pitching 101');
  await page.click('#sheet-101 .sh-x');
  await page.waitForSelector('#sheet-101', { state: 'hidden' });

  /* the theme flips and the scene repaints in the other palette */
  const t0 = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('#b-theme');
  const t1 = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('runthegrid_theme')]);
  ok(t1[0] !== t0 && t1[1] === t1[0], '2 the theme button flips the site theme key (' + t0 + ' to ' + t1[0] + ')');
  await shot('home-' + t1[0], true);
  await page.click('#b-theme');

  /* 3 and 4 */
  await page.click('#b-take');
  await page.waitForSelector('#s-mound.on .grid .cell', { timeout: 5000 });
  /* 14: the mound is 3D */
  const is3d = await stageReady(page);
  ok(is3d, '14 the mound is the 3D scene (WebGL here)');
  if (is3d) {
    const cv = await canvasRenders(page);
    ok(cv.s3d && cv.W >= cv.css[0] && cv.colors >= 12 && cv.lit > 0.9, '14 the 3D canvas renders (' + cv.W + 'x' + cv.H + ' for ' + cv.css.join('x') + ' css px, ' + cv.colors + ' colors in 121 samples)');
  }
  await page.waitForTimeout(200);
  const mirror = await page.evaluate(() => {
    const r = (c) => document.querySelector('#m-scene .grid .cell[data-cell="' + c + '"]').getBoundingClientRect();
    const C = window.STD_CONTRACT;
    return { c0: r(0).left, c4: r(4).left, c20: r(20).top, c0t: r(0).top, sc: C.screenCol(0), w: r(12).width, hgt: r(12).height };
  });
  ok(mirror.c0 > mirror.c4 && mirror.sc === 4, '3 the grid is the pitcher\'s view: cell 0 is drawn right of cell 4');
  ok(mirror.c20 > mirror.c0t, '3 row 0 is high, row 4 is low');
  ok(mirror.w >= 36 && mirror.hgt >= 36, '3 a cell is big enough to tap (' + Math.round(mirror.w) + 'x' + Math.round(mirror.hgt) + ')');
  await shot('mound');
  await page.click('#m-batter');
  await page.waitForSelector('#m-scout:not([hidden])');
  const heat = await page.evaluate(() => [...document.querySelectorAll('#m-scene .grid .cell')].filter((c) => c.style.background).length);
  ok(heat === 25, '4 scouting paints the heat map on the same 25 cells');
  await shot('scout');
  await page.click('#m-scout [data-heat="swing"]');
  await shot('scout-swings');
  await page.click('#m-batter');
  ok(await page.evaluate(() => document.getElementById('m-scout').hidden), '4 scouting closes on a second tap');

  /* 10 */
  for (const hand of ['L', 'R']) {
    const fr = await page.evaluate((hand) => {
      const S = window.STD_UI.state, was = S.scene.bat;
      const b = S.scn.batters.find((x) => x.bats === hand);
      S.scene.setBatter(b); S.grid.place(S.scene.gridRect()); S.scene.draw({});
      const f = S.scene.figureBoxes();
      const c = document.querySelector('#m-scene .grid .cell[data-cell="12"]').getBoundingClientRect();
      return { f, cell: [c.width, c.height], was: S.scn.batters.indexOf(was) };
    }, hand);
    const inside = (bx) => bx.x0 >= 0 && bx.x1 <= fr.f.W && bx.y0 >= 0 && bx.y1 <= fr.f.H;
    /* the 3D set frames like the lab the owner approved: the hitter, the catcher, the umpire and
       home plate whole (the top of the bat may leave the frame), and a cell no smaller than 38 px.
       The old drawing keeps its own rule: everyone in, cells 44 */
    const R = (v) => Math.round(v), is3d = !!fr.f.plate;
    ok(inside(fr.f.batter) && inside(fr.f.catcher) && inside(fr.f.umpire) && (!is3d || inside(fr.f.plate)),
      '10 a ' + (hand === 'L' ? 'left' : 'right') + ' handed hitter, the catcher' + (is3d ? ', the umpire and the plate' : ' and the umpire') + ' are all in frame (batter ' + R(fr.f.batter.x0) + '-' + R(fr.f.batter.x1) + ', catcher ' + R(fr.f.catcher.x0) + '-' + R(fr.f.catcher.x1) + (is3d ? ', plate ' + R(fr.f.plate.x0) + '-' + R(fr.f.plate.x1) + ', ' + R(fr.f.plate.y1) : '') + ' of ' + fr.f.W + 'x' + fr.f.H + ')');
    const minCell = is3d ? 38 : 44;
    ok(fr.cell[0] >= minCell && fr.cell[1] >= minCell, '10 cells stay tappable with him in frame (' + Math.round(fr.cell[0]) + 'x' + Math.round(fr.cell[1]) + ', ' + minCell + ' at least)');
    await shot('framing-' + hand);
    await page.evaluate((i) => { const S = window.STD_UI.state; S.scene.setBatter(S.scn.batters[i]); S.grid.place(S.scene.gridRect()); S.scene.draw({}); }, fr.was);
  }

  /* 14: every kind of result plays its own motion, for a hitter from each side */
  if (is3d) {
    const ev = await everyResult(page);
    const probs = ev.errors.concat(...ev.traces.map(motionProblems));
    ok(ev.traces.length === 26 && probs.length === 0, '14 every pitch result plays its motion (' + ev.traces.length + ' plays: ' + [...new Set(ev.kinds.map((k) => k.slice(2)))].join(', ') + ')' + (probs.length ? ': ' + probs.slice(0, 4).join(' | ') : ''));
    await shot('after-every-result');
    /* stills of one pitch for the record: in flight with its trail, and just after the plate with
       the aimed and actual markers (a called strike that missed its spot a little) */
    for (const when of ['flight', 'crossed']) {
      await page.evaluate((when) => {
        const S = window.STD_UI.state, st = window.STD_STAGE.current, C = window.STD_CONTRACT, a = S.scn.pitcher.arsenal[0];
        const pr = { n: 99, call: { type: a.type, cell: 18 }, actual: { x: 0.35, zn: 0.15 }, actualCell: C.cellAt(0.35, 0.15), velo: a.velo, batter: 'take', result: 'called_strike',
          inPlay: null, countBefore: { b: 0, s: 0 }, count: { b: 0, s: 1 }, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false };
        document.getElementById('m-scene').classList.add('flying');
        st.still(pr, when);
      }, when);
      await shot('still-' + when);
    }
    await page.evaluate(() => { document.getElementById('m-scene').classList.remove('flying'); window.STD_STAGE.current.draw(); });
  }

  /* 5 */
  const play = await playOuting(page, { w, h, shot });
  ok(play.pitches > 0, '5 a whole outing on the real engine (' + play.pitches + ' pitches)');
  ok(play.problems.length === 0, '5 nothing graded, tipped or over the field from the first pitch to the last' + (play.problems.length ? ': ' + play.problems.slice(0, 3).join(' | ') : ''));
  if (is3d) traceCheck('5', play);
  ok(play.pbp.length && play.pbp.every((x) => x && x.length > 3), '5 one line of play by play after each pitch ("' + (play.pbp[0] || '') + '")');

  /* 6 */
  await revealCheck(page, '6', play.pitches);
  await shot('result', true);
  await page.click('#r-share');
  await page.waitForSelector('#toast.on', { timeout: 3000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/Shut The Door #\d+/.test(clip) && /runthe\.gg\/shut-the-door/.test(clip) && ![...clip].some((ch) => ch.charCodeAt(0) === 0x2013 || ch.charCodeAt(0) === 0x2014), '6 share copies the share text');
  await shot('shared');

  /* 12, on the real engine */
  await coachCheck(page, '12', play.pitches, null, shot);

  /* 7 */
  await page.click('#r-again');
  await page.waitForSelector('#s-mound.on');
  const practice = await page.evaluate(() => window.STD_UI.state.outing.mode);
  ok(practice === 'practice', '7 run it back starts a practice outing');
  await shot('practice');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-done:not([hidden])', { timeout: 8000 });
  ok(await page.isHidden('#b-take'), '7 after a reload today shows as done');
  await shot('home-done', true);

  /* 8 */
  await page.goto(BASE + '?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-main:not([hidden])');
  await page.click('#d-again');
  await page.waitForSelector('#s-mound.on');
  const dbg = await page.evaluate(() => { const d = document.getElementById('m-dbg'); return !d.hidden && /seed/.test(d.textContent); });
  ok(dbg, '8 ?debug=1 shows the seed');
  await shot('debug');

  /* 9 */
  ok(errors.length === 0, '9 no page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

/* 11: one forced outing per ending */
async function ending(w, h, end, extra) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(STAGE_TEST);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    // supabase-js from the CDN: an empty script, so auth.js stays signed out with no network
    if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    return route.abort();
  });
  const shot = async (name, full) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${tag}-${nextN(tag)}-${end}-${name}.png`), fullPage: !!full }); };
  await page.goto(BASE + '?mockEnd=' + end + (extra || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-take', { state: 'visible', timeout: 15000 });
  const proxy = /mockProxy/.test(extra || '');
  if (proxy) {
    ok(await page.isVisible('#h-proxy'), '11 ' + end + ': the proxy note is on the home screen');
    await shot('home-proxy', true);
  }
  await page.click('#b-take');
  await page.waitForSelector('#s-mound.on .grid .cell');
  const is3d = await stageReady(page);
  if (proxy) ok(await page.isVisible('#m-proxy'), '11 ' + end + ': the proxy note is on the mound, small');
  const play = await playOuting(page, { w, h, shot, runnerShots: end !== 'door_shut', type0: true, cell: 12, noSkip: end !== 'door_shut' });
  const k = play.pitches, sawMove = play.sawMove, sawOut = play.sawOut;
  ok(play.problems.length === 0, '11 ' + end + ': nothing graded, tipped or over the field during play' + (play.problems.length ? ': ' + play.problems.slice(0, 3).join(' | ') : ''));
  ok(is3d, '11 ' + end + ': on the 3D mound');
  if (is3d) traceCheck('11 ' + end, play);
  const res = await page.evaluate(() => ({ o: document.getElementById('r-outcome').textContent, cls: document.getElementById('r-outcome').className, rv: document.getElementById('r-reveal').textContent, st: document.getElementById('r-streak').textContent, them: window.STD_UI.state.outing.score.them, start: window.STD_UI.state.scn.situation.score.them }));
  const sawRun = res.them > res.start;
  ok(res.cls.includes(end), '11 ' + end + ': the outing ends ' + res.o + ' after ' + k + ' pitches');
  if (end !== 'door_shut') {
    ok(sawMove, '11 ' + end + ': runners move on the scorebar diamond');
    ok(sawRun, '11 ' + end + ': runs score (' + res.start + ' to ' + res.them + ')');
  }
  if (end === 'doors_open') ok(sawOut, '11 doors_open: the double play shows a runner put out');
  if (/mockNull/.test(extra || '')) ok(/at least 13 pitches/.test(res.rv), '11 ' + end + ': a reveal with no pitch count shows its note');
  const auth = /mockAuth/.test(extra || '');
  if (auth) ok(/#\d+ of \d+ today/.test(res.st), '11 ' + end + ': signed in, the result shows the account\'s rank');
  await revealCheck(page, '11 ' + end, k);
  await shot('result', true);
  /* 12 */
  await coachCheck(page, '12 ' + end, k, { lesson: !/mockLesson=none/.test(extra || ''), pro: !/mockPro=none/.test(extra || '') && !/mockLesson=none/.test(extra || '') }, shot);
  await page.click('#r-home');
  await page.click('#h-main [data-open="stats"]');
  await page.waitForSelector('#sheet-stats.on');
  await page.waitForFunction(() => !/loading/.test(document.getElementById('stats-body').textContent), null, { timeout: 3000 });
  const src = await page.textContent('#stats-body .src-tag');
  ok(auth ? src === 'your account' : src === 'this device', '11 ' + end + ': the stats sheet reads ' + src);
  await page.waitForTimeout(250);
  await shot('stats-' + (auth ? 'account' : 'device'));
  ok(errors.length === 0, '11 ' + end + ': no page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

try {
  await run(390, 844, 'light');
  await run(1440, 900, 'dark');
  console.log('\nthe three endings');
  await ending(390, 844, 'door_shut', '&mockLesson=none');
  await ending(390, 844, 'doors_open', '&mockPro=none');
  await ending(390, 844, 'walk_off', '&mockProxy=1&mockNull=1&mockAuth=1');
  await ending(1440, 900, 'door_shut', '&mockLesson=none');
  await ending(1440, 900, 'doors_open', '&mockAuth=1');
  await ending(1440, 900, 'walk_off', '&mockPro=none');
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e && e.message ? e.message.split('\n')[0] : e));
}
await browser.close();
server.close();
console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
