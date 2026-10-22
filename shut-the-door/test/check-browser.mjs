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
 *      2026-10-17). One quiet play by play line under the scoreboard. The live
 *      field minimap shows after the first play, with a dot only for a ball in play.
 *      The first pitch is a free tap off a cell's centre (the crosshair there, the
 *      call's cell and at right, catcher's view) and checks the meter: one panel
 *      over the pitch buttons and the throw button, the effort bar only with
 *      STD_METER.EFFORT, the stop locks, and the call carries cell, at and q.
 *   6. the end reveal: outcome, strip, percentile, pitched like, the verdict
 *      against the real pitcher and the side by side card, on screen together; share
 *      opens the share sheet, the result card draws, and "copy the text" copies it
 *   7. run it back is practice; a reload shows today as done
 *   8. ?debug=1 shows the seed
 *   9. no page error and no console error anywhere
 *  10. the framing: the whole batter, catcher and umpire (and in 3D home plate)
 *      are in frame for a left and a right handed hitter, cells 38 px or more
 *  14. the 3D mound: the canvas renders, and every kind of result plays its
 *      motion (from a trace of each play), with the pitch's trail and its aimed
 *      and actual markers, and no 3D grid
 *  11. all four endings, forced through the mock (?mockEnd=): door shut,
 *      held the tie (a solo home run ties it, play goes on, the scorebar
 *      says tied, then three outs), door's open (a runner put out on a double
 *      play, the tying run, then the go-ahead run with the walk-off off)
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
 *
 * SOFTWARE GL, AND WHY THE CHECK DRAWS ONLY WHERE IT LOOKS. Headless Chromium
 * here and on CI draws WebGL with SwiftShader, on the CPU. Measured in this
 * container (2026-10-22): an animation frame with no draw costs about 14 ms,
 * but one draw of the mound costs 5 to 8 s at 390x844 and 1440x900 (2.5 s at
 * device pixel ratio 1, still 1.4 s at a quarter of the pixels: the skinned
 * people and the park are the cost, not the pixels). The stage drew every third
 * play frame, once more at the end of the pitch and again for the set after
 * it, so one pitch cost 30 s to a minute and more on a busy machine. Nothing
 * hung: no await waited on an event that never came. It was only slow. Step
 * 14's 28 plays took 14 to 18 minutes, and the outing of step 5 prints nothing
 * until its last pitch, so the run looked stalled right after step 14. Add the
 * second screen size and the eight forced endings and it needed hours, so the
 * job's timeout killed it every time, and nothing after the first pitch was
 * ever checked. The outing's own loop also waited a fixed 80 polls a pitch,
 * not until the pitch was over.
 *
 * So the check keeps everything the game computes and skips only the
 * rasterising nobody reads:
 *   - the stage's clock is stepped (window.STD_STAGE_TEST, which stage.js
 *     reads): a pitch plays every frame of its motion at 30 a second, whatever
 *     the wall clock does
 *   - once the stage is loaded, its renderer's draw call is wrapped
 *     (fastDraw): the game's own draws are counted and skipped. Every pose, bone,
 *     ball, trail, marker and umpire signal is still computed each frame, and
 *     the trace reads those (people.js updates its matrices itself, so a
 *     sample never needs a draw)
 *   - where the check reads pixels (canvasRenders) it draws for real and reads
 *     the canvas back: on the mound, after the 28 plays of step 14, after the
 *     whole outing of step 5 and at the end of every forced ending, so a broken
 *     shader or scene still fails
 *   - with SHOTS set, nothing is skipped (the screenshots need real frames):
 *     slow, for a person looking at the pictures
 * Every step has a deadline and a name (step(), and a watchdog). A step that
 * runs past it fails and names itself, so a stall shows where it is. Each line
 * carries the seconds since the start.
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
const T0 = Date.now();
const secs = () => ((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's';
function ok(c, m) { if (c) { passes++; console.log(secs() + '  ok ' + m); } else { fails++; console.log(secs() + '  FAIL ' + m); } }

/* The watchdog: the step in hand, and when it began. A step that runs past its deadline ends the
   run as a failure that names it, instead of a hang (step() is called at each numbered step). */
let STEP = { name: 'start', at: Date.now(), limit: 420 };
function step(name, limit = 420) { STEP = { name, at: Date.now(), limit: SHOTS ? limit * 10 : limit }; }
const watchdog = setInterval(() => {
  const s = (Date.now() - STEP.at) / 1000;
  if (s < STEP.limit) return;
  fails++;
  console.log(secs() + '  FAIL stalled: "' + STEP.name + '" ran ' + Math.round(s) + ' s, past its ' + STEP.limit + ' s');
  console.log(`\n${passes} ok, ${fails} failed`);
  process.exit(1);
}, 5000);
watchdog.unref();

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

/* Headless Chromium draws WebGL in software, a frame in seconds, so on a real clock a pitch would
   show two frames. The 3D mound takes a stepped clock for the check: a pitch plays every frame of
   its motion at 30 a second (quick play runs 1.8 times as fast, so a sample every 0.06 s of the
   game's time). At 15 a second the first sample of the ball could land almost 2 m past the
   release, and the flight check below read a slider's 16 m flight as 13.7. With SHOTS set it draws
   every sixth frame, as many draws as before; otherwise fastDraw skips them all. */
/* It also counts WebGL context losses on the page (the event does not bubble; a capture listener on
   the document still hears it). The game does not rebuild what it made with render targets after a
   restore (the environment light, at least): forced on purpose, the mound then draws 29 colors and
   40% lit, with a black sky. A loaded machine can lose the context on its own, so the pixel check says
   when one happened. (QA issue 2026-10-22-shut-the-door-context-loss-dark-mound.) */
const STAGE_TEST = () => {
  window.STD_STAGE_TEST = { step: 1 / 30, renderEvery: 6 };
  window.STD_CHECK_CTXLOST = 0;
  document.addEventListener('webglcontextlost', () => { window.STD_CHECK_CTXLOST++; }, true);
};

/* The fast path (see the header): once the stage is loaded, its renderer's draws are counted and
   skipped, unless the check asks for one (window.STD_CHECK_DRAW). With SHOTS set every draw is
   real. Idempotent: homeWarm and stageReady both call it. */
async function fastDraw(page) {
  if (SHOTS) return;
  await page.evaluate(() => {
    const st = window.STD_STAGE && window.STD_STAGE.current;
    if (!st || !st.renderer || st.renderer.realRender) return;
    const r = st.renderer;
    r.realRender = r.render;
    window.STD_CHECK_SKIPPED = 0;
    r.render = function (scene, camera) {
      if (window.STD_CHECK_DRAW) return r.realRender.call(r, scene, camera);
      window.STD_CHECK_SKIPPED++;
    };
  });
}

/* The owner's rule while pitching: nothing graded, nothing tipped, nothing
   over the field. Returns { out: what broke it (or an empty list), gone, over }.
   gone: the mound is not on screen, so there is no field to judge. The field samples are read off
   #m-scene's box, and a hidden screen's box is 0x0 at (0,0), where every sample lands on the
   header. That is how a run once failed "over the field: hdr" (390x844, doors_open, pitch 4,
   2026-10-22): the go-ahead run ended the outing between the loop's look at the result screen and
   this sample, and finish() had already hidden the mound (show('s-result')). The header was never
   over the field. So the answer comes from one snapshot: the mound on screen and judged, or gone,
   with whether the result is up (over). The caller fails a mound that left with no result, and
   a mound on screen with a field of no size fails here. */
async function quietProblems(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
    };
    const mound = document.getElementById('s-mound'), out = [];
    if (!mound.classList.contains('on')) return { out, gone: true, over: document.getElementById('s-result').classList.contains('on') };
    if ([...mound.querySelectorAll('.sq, .pill, .strip')].some(vis)) out.push('a grade square');
    const text = mound.innerText;
    if (/\b(green|yellow|orange|red)\b/i.test(text)) out.push('a band word');
    if (/\b(best call|pts|hold \d|next time)\b/i.test(text)) out.push('grade copy');
    if ([...document.querySelectorAll('.gcard, .callout, .flash, #toast.on')].some(vis)) out.push('a banner or card');
    if ([...document.querySelectorAll('.sheet')].some((s) => !s.hidden)) out.push('a sheet');
    const sc = document.getElementById('m-scene').getBoundingClientRect();
    if (sc.width < 1 || sc.height < 1) { out.push('the field has no size on the mound (' + Math.round(sc.width) + 'x' + Math.round(sc.height) + ')'); return { out, gone: false, over: false }; }
    const fine = (el) => el && (el.tagName === 'CANVAS' || el.closest('#m-aim') || el.id === 'm-proxy' || el.id === 'm-dbg' || el.closest('#m-mini'));
    samples: for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
      const el = document.elementFromPoint(sc.left + sc.width * i / 6, sc.top + sc.height * j / 6);
      if (!fine(el)) { out.push('over the field: ' + (el ? el.id || el.className || el.tagName : 'nothing')); break samples; }
    }
    return { out, gone: false, over: false };
  });
}

/* The 3D mound (3d/stage.js). Waits for its downloads, then reads pixels straight off the WebGL
   canvas after a draw: the park, the people and the zone's surroundings, not a blank or one color. */
/* The home screen gets the 3D mound ready (ui.js warm3d): wait for that before the tap on take the
   mound, as a player reading the spot would. Software GL compiles shaders on the main thread for
   seconds, and a tap while it does waits on it. */
async function homeWarm(page) {
  // the warm compiles every shader in software: seconds alone, minutes on a loaded machine
  await page.waitForFunction(() => !(window.STD_STAGE && window.STD_STAGE.supported()) || (window.STD_STAGE.current && window.STD_STAGE.current.loaded), null, { timeout: 240000 })
    .catch(async (e) => {
      // say how far the stage got (stage.js marks each phase) and whether the context was lost on the way
      const at = await page.evaluate(() => JSON.stringify({ marks: window.STD_STAGE && window.STD_STAGE.marks, lost: window.STD_CHECK_CTXLOST || 0, now: Math.round(performance.now()) })).catch(() => 'the page did not answer');
      throw new Error('the 3D warm did not finish in 240 s: ' + at + '\n' + e.message);
    });
  await gpuSettled(page);
  await fastDraw(page);
}
/* loaded means the warm's GL work is issued, not done: the GPU process (SwiftShader, on the CPU) still
   owes the shader compiles and the warm's two draws. The next tap waits behind all of it, because the
   page takes an input only with a frame, so a click on the home screen once took 83 s to return, past
   Playwright's 30 s (step 8, load 50, 2026-10-22). One read of a pixel waits for the GPU to finish
   (measured: the read took 86 s, and the click after it 0.3 s). On a phone's GPU it is instant. */
async function gpuSettled(page) {
  await page.evaluate(() => {
    const st = window.STD_STAGE && window.STD_STAGE.current;
    if (!st || !st.renderer) return;
    const gl = st.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  });
}

async function stageReady(page) {
  const on = await page.evaluate(() => !!(window.STD_STAGE && window.STD_STAGE.supported()));
  if (!on) return false;
  await page.waitForFunction(() => window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 240000 });
  await page.evaluate(() => window.STD_UI.state.scene.real.ready);
  await fastDraw(page);
  return true;
}
/* A real draw of the stage as it stands, read back off the canvas: not blank, not one color. */
async function canvasRenders(page) {
  return page.evaluate(() => {
    const st = window.STD_STAGE.current, gl = st.renderer.getContext();
    window.STD_CHECK_DRAW = true;
    try { st.render(); } finally { window.STD_CHECK_DRAW = false; }
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4), seen = new Set();
    let lit = 0, n = 0;
    for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
      gl.readPixels(Math.floor(W * i / 12), Math.floor(H * j / 12), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      seen.add((px[0] >> 4) + ',' + (px[1] >> 4) + ',' + (px[2] >> 4));
      if (px[0] + px[1] + px[2] > 30) lit++;
      n++;
    }
    const cv = document.getElementById('m-canvas'), r = cv.getBoundingClientRect();
    return { W, H, css: [Math.round(r.width), Math.round(r.height)], colors: seen.size, lit: lit / n, s3d: document.getElementById('m-scene').classList.contains('s3d'), lost: window.STD_CHECK_CTXLOST || 0 };
  });
}

function pixelsOk(label, cv) {
  ok(cv.s3d && cv.W >= cv.css[0] && cv.colors >= 12 && cv.lit > 0.9, label + ' (' + cv.W + 'x' + cv.H + ' for ' + cv.css.join('x') + ' css px, ' + cv.colors + ' colors and ' + Math.round(cv.lit * 100) + '% lit in 121 samples' + (cv.s3d ? '' : ', not the 3D scene') + (cv.lost ? ', after ' + cv.lost + ' WebGL context loss' + (cv.lost > 1 ? 'es' : '') + ' on this page' : '') + ')');
}

/* What a PitchResult must look like on the field (3d/play.js reads it; this is the spec, written
   apart from it): the hitter's motion, where the ball goes, the umpire's signal. */
function expectedMotion(tr) {
  const r = tr.result, swing = ['swinging_strike', 'foul', 'foul_tip', 'in_play'].includes(r);
  const batter = swing ? 'swing' : r === 'hit_by_pitch' ? 'hbp' : tr.check ? 'check' : 'take';
  const ball = tr.dirt ? ['dirt'] : r === 'foul_tip' ? ['tip'] : r === 'foul' ? ['back', 'pulled'] : r === 'in_play' ? ['play'] : r === 'hit_by_pitch' ? ['hbp'] : ['glove'];
  const ump = r === 'called_strike' ? 'strike' : r === 'foul' ? 'foul' : r === 'hit_by_pitch' ? 'hbp' : null;
  // a pitch above the belt (the zone's middle) knocks him down, four in five, picked from the drawn
  // pitch's id (FNV-1a, never the engine's random stream); with no drawn pitch, always
  const fnv = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const fall = r === 'hit_by_pitch' && tr.zn > 0.5 && (tr.drawn == null || fnv(tr.drawn) % 5 !== 0);
  return { batter, ball, ump, fall };
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
  if (!!tr.m.fall !== e.fall) out.push(name + (e.fall ? ': the hitter should go down' : ': the hitter went down'));
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
  if (e.fall) {
    // down, and clear of the plate (its middle is the origin; he started in the box beside it)
    const end = tr.s[tr.s.length - 1].pel;
    if (end[1] > 0.45) out.push(name + ': the hitter is not down (hips ' + end[1].toFixed(2) + ' m up)');
    if (Math.hypot(end[0], end[2]) < Math.hypot(s0.pel[0], s0.pel[2])) out.push(name + ': the hitter fell toward the plate');
  }
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
      ['hit_by_pitch', 'take', 14, { b: 0, s: 0 }, null, { x: 0, zn: 0.85 }],
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
const PITCH_MS = SHOTS ? 300000 : 60000;
async function playOuting(page, o) {
  const CELLS = o.cells || [23, 12, 7, 21, 18, 3, 16, 13, 22, 8, 11, 24];
  const r = { pitches: 0, problems: [], sawMove: false, sawOut: false, pbp: [], traces: [], lastN: null };
  const done = () => page.evaluate(() => document.getElementById('s-result').classList.contains('on'));
  for (let i = 0; i < 80; i++) {
    if (await done()) break;
    const nTypes = await page.$$eval('#m-arsenal .pitch', (b) => b.length);
    await page.click(`#m-arsenal .pitch >> nth=${o.type0 ? 0 : i % nTypes}`);
    const cellNo = o.cell != null ? o.cell : CELLS[i % CELLS.length];
    const freeTap = i === 0 && !o.type0;
    if (freeTap) {
      /* FREE AIM (the owner, 2026-10-22): a tap off the cell's centre puts the crosshair exactly there,
         keeps that cell, and its at is the point in the cell in catcher's view: u toward the catcher's
         right (its sign on screen read from screenCol()), v up. Every call the UI sends is recorded. */
      const f = await page.evaluate((c) => {
        const A = window.STD_API;
        if (!A.__rec) { const t = A.throwPitch; window.__calls = []; A.throwPitch = function (id, call) { window.__calls.push(JSON.parse(JSON.stringify(call))); return t.apply(this, arguments); }; A.__rec = true; }
        const b = document.querySelector('#m-aim .cell[data-cell="' + c + '"]').getBoundingClientRect();
        return [b.left + b.width * 0.8, b.top + b.height * 0.3];
      }, cellNo);
      await page.mouse.click(f[0], f[1]);
      const a = await page.evaluate(() => {
        const S = window.STD_UI.state, C = window.STD_CONTRACT, x = document.querySelector('#m-aim .aim-x').getBoundingClientRect();
        return { cell: S.cell, at: S.at, cx: x.left + x.width / 2, cy: x.top + x.height / 2, dir: C.screenCol(C.cellOf(0, 1)) - C.screenCol(C.cellOf(0, 0)) };
      });
      const want = [0.3 * a.dir, 0.2];
      ok(a.cell === cellNo && a.at && Math.abs(a.at[0] - want[0]) <= 0.02 && Math.abs(a.at[1] - want[1]) <= 0.02,
        '5 a free tap keeps its cell (' + a.cell + ') and its point in it, catcher\'s view (at ' + JSON.stringify(a.at) + ', ' + JSON.stringify(want) + ' wanted)');
      ok(Math.abs(a.cx - f[0]) < 1.5 && Math.abs(a.cy - f[1]) < 1.5, '5 the crosshair sits where the finger was, not on the cell\'s centre');
    } else {
      await page.click(`#m-aim .cell[data-cell="${cellNo}"]`);
    }
    if (i === 0 && o.shot) await o.shot('ready');
    const label = await page.textContent('#m-throw');
    if (!/throw|shut it/.test(label)) { r.problems.push('the throw button was not ready: ' + label); break; }
    await page.click('#m-throw');
    /* The release meter (draft PR #658, the owner's call 2026-10-22): where the page has one and
       the setting is on, the throw button starts a needle and the next tap on it is the release.
       That page must show it, and it gets its tap here (after its own 120 ms guard against the tap
       that started it). A page with no meter, or with it off, throws on the button as before. */
    const wantsMeter = await page.evaluate(() => {
      let p = {}; try { p = JSON.parse(localStorage.getItem('std_ui_v1') || '{}') || {}; } catch (e) {}
      return !!(window.STD_METER && document.getElementById('m-meter')) && p.meter !== false;
    });
    if (wantsMeter) {
      const shown = await page.waitForSelector('#m-meter:not([hidden])', { timeout: 10000 }).then(() => true, () => false);
      if (!shown) { r.problems.push('pitch ' + (r.pitches + 1) + ': the release meter did not show after throw'); break; }
      await page.waitForTimeout(200);
      /* the meter (the owner, 2026-10-22: rebuilt): one panel over the pitch buttons and the throw
         button, so the scene never moves; the effort bar only when STD_METER.EFFORT is true */
      const eff = await page.evaluate(() => window.STD_METER.EFFORT === true);
      if (freeTap) {
        const lay = await page.evaluate(() => {
          const m = document.getElementById('m-meter').getBoundingClientRect(), b = document.querySelector('#m-arsenal .pitch').getBoundingClientRect();
          const t = document.getElementById('m-throw').getBoundingClientRect(), sc = document.getElementById('m-scene').getBoundingClientRect();
          return { over: m.top <= b.top + 1 && m.bottom >= t.bottom - 1 && m.top >= sc.bottom - 1, h: m.height, effRow: !document.querySelector('#m-meter .rm-eff').hidden };
        });
        ok(lay.over && lay.h >= 90, '5 the meter is one panel over the pitch buttons and the throw button, under the scene (' + Math.round(lay.h) + ' px tall)');
        ok(lay.effRow === eff, '5 the effort bar shows only when STD_METER.EFFORT is true (' + eff + ')');
      }
      if (eff) {
        const say0 = await page.textContent('#m-say');
        if (say0 !== 'set your effort') r.problems.push('pitch ' + (r.pitches + 1) + ': the step line at the effort bar read "' + say0 + '"');
        await page.click('#m-meter');
        await page.waitForTimeout(450);
      }
      // the step line under the meter says how to stop it (the owner, 2026-10-22)
      const say = await page.textContent('#m-say');
      if (say !== 'stop it in the bright band') r.problems.push('pitch ' + (r.pitches + 1) + ': the step line under the meter read "' + say + '"');
      await page.click('#m-meter');
      if (freeTap) {
        /* the stop locks: the needle holds where it was stopped, the word goes up, and the call
           carries the cell, the free aim's at, the release q (and e with effort) */
        const n0 = await page.evaluate(() => document.querySelector('#m-meter .rm-needle').style.left);
        await page.waitForTimeout(150);
        const st = await page.evaluate(() => ({ n1: document.querySelector('#m-meter .rm-needle').style.left, done: document.getElementById('m-meter').classList.contains('is-done'),
          word: document.querySelector('#m-meter .rm-word').textContent, call: (window.__calls || []).slice(-1)[0] }));
        ok(st.done && st.n1 === n0 && st.word.length > 0, '5 the meter locks on the stop: the needle holds at ' + n0 + ' and says "' + st.word + '"');
        const c = st.call || {};
        ok(c.cell === cellNo && Array.isArray(c.at) && c.at.length === 2 && typeof c.q === 'number' && c.q >= 0 && c.q <= 1 && (eff ? typeof c.e === 'number' : !('e' in c)),
          '5 the call carries the cell, at, q' + (eff ? ' and e' : '') + ' (' + JSON.stringify(c) + ')');
      }
    }
    r.pitches++;
    const tapless = i === 0 || !!o.noSkip;
    let shotTaken = false, ended = false;
    /* until the pitch is over, by a deadline and not a count of polls: a slow pitch must not leave
       the loop clicking on through a busy mound, and one that never ends fails by name */
    const deadline = Date.now() + PITCH_MS;
    for (let t = 0; Date.now() < deadline; t++) {
      await page.waitForTimeout(tapless ? 90 : 60);
      if (!tapless && t === 2) await page.mouse.click(o.w / 2, Math.round(o.h * 0.5));
      const s = await page.evaluate(() => ({ dots: document.querySelectorAll('#m-runners circle').length, outs: document.querySelectorAll('#m-runners circle.out').length,
        busy: /pitching/.test(document.getElementById('m-throw').textContent), over: document.getElementById('s-result').classList.contains('on') }));
      if (s.dots) r.sawMove = true;
      if (s.outs) r.sawOut = true;
      if (s.over) { ended = true; break; }
      const q = await quietProblems(page);
      if (q.gone) {
        // the outing ended between the look above and this sample (see quietProblems), or worse
        if (!q.over) r.problems.push('pitch ' + r.pitches + ': the mound left the screen with no result');
        ended = true; break;
      }
      if (q.out.length) r.problems.push('pitch ' + r.pitches + ': ' + q.out.join(', '));
      if (i === 0 && t === 8 && o.shot && !shotTaken && !o.runnerShots) { shotTaken = true; await o.shot('pitch-flight'); }
      if (o.runnerShots && s.dots && !shotTaken && t > 6) { shotTaken = true; await o.shot('runners-p' + r.pitches); }
      if (!s.busy) { ended = true; break; }
    }
    if (!ended) { r.problems.push('pitch ' + r.pitches + ' was still playing after ' + PITCH_MS / 1000 + ' s'); break; }
    const tr = await page.evaluate(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.trace);
    if (tr && tr.n !== r.lastN) { r.traces.push(tr); r.lastN = tr.n; }
    if (await done()) break;
    const after = await quietProblems(page);
    if (after.gone) {
      if (!after.over) r.problems.push('after pitch ' + r.pitches + ': the mound left the screen with no result');
      break;
    }
    if (after.out.length) r.problems.push('after pitch ' + r.pitches + ': ' + after.out.join(', '));
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
      sheetOpen: [...document.querySelectorAll('.sheet')].some((s) => !s.hidden), labels: Object.values(window.STD_CONTRACT.OUTCOME_LABEL),
      cmp: document.querySelectorAll('#r-reveal .cmp-row').length, bats: document.querySelectorAll('#r-reveal .cmp-bat').length, vs: vis('r-real') && document.getElementById('r-real').className };
  });
  ok(rv.cmp >= 4 && rv.bats >= 1 && /beat|matched|lost/.test(rv.vs), label + ': the side by side card (' + (rv.cmp - 1) + ' rows, ' + rv.bats + ' batters) and the verdict (' + rv.vs + ')');
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
  const at = (n, lim) => step(w + 'x' + h + ' ' + n, lim);
  at('open the page');
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
  at('1 home');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-main:not([hidden])', { timeout: 15000 });
  await homeWarm(page);
  await page.waitForSelector('#b-take', { state: 'visible' });
  const home = await page.evaluate(() => {
    const sit = window.STD_UI.state.scn.situation, bug = document.querySelector('#h-sit .scorebar');
    const q = (s) => (bug && bug.querySelector(s)) || null;
    return {
      title: document.getElementById('h-title').textContent,
      ars: document.querySelectorAll('#h-pitcher .ars li:not(.hd)').length,
      sit, aria: document.getElementById('h-sit').getAttribute('aria-label') || '',
      // the scorebug (PR #642): both clubs with their runs, the half and the inning, the outs lit, the bases
      runs: bug ? [...bug.querySelectorAll('.sb-team b')].map((b) => +b.textContent) : [],
      inn: (q('.sb-inn') || {}).textContent || '', outsLit: bug ? bug.querySelectorAll('.sb-outs i.on').length : -1,
      bases: bug ? [...bug.querySelectorAll('.sb-bases rect')].filter((r) => r.classList.contains('on')).length : -1,
      stakes: (document.getElementById('h-setup') || {}).textContent || '',
      stakesShown: !!document.getElementById('h-setup') && document.getElementById('h-setup').getBoundingClientRect().height > 0,
      openSheets: [...document.querySelectorAll('.sheet')].filter((s) => !s.hidden).length,
      robots: document.querySelector('meta[name=robots]').content,
    };
  });
  ok(home.title.length > 0 && home.ars >= 2, '1 home shows the spot and the arsenal (' + home.ars + ' pitches)');
  const pop = (n) => { let c = 0; for (; n; n >>= 1) c += n & 1; return c; };
  ok(home.runs.length === 2 && home.runs[0] === home.sit.score.us && home.runs[1] === home.sit.score.them
    && new RegExp('^(top|bot) ' + home.sit.inning + '$').test(home.inn.trim()) && home.outsLit === home.sit.outs && home.bases === pop(home.sit.bases | 0)
    && /(up|down) \d|tied/.test(home.aria) && /out/.test(home.aria),
    '1 the scorebug has the score (' + home.runs.join('-') + '), the inning (' + home.inn.trim() + '), the outs and the bases, as the pack has them ("' + home.aria + '")');
  ok(home.stakesShown && /door is shut/.test(home.stakes), '1 the stakes line is under it ("' + home.stakes.trim() + '")');
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
  at('2 the sheets');
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
  at('3 take the mound');
  await homeWarm(page);
  await page.click('#b-take', { timeout: 120000 });   // software GL: the first frame of the mound takes seconds
  await page.waitForSelector('#s-mound.on #m-aim .cell', { timeout: 5000 });
  /* 14: the mound is 3D */
  const is3d = await stageReady(page);
  ok(is3d, '14 the mound is the 3D scene (WebGL here)');
  if (is3d) {
    pixelsOk('14 the 3D canvas renders', await canvasRenders(page));
  }
  await page.waitForTimeout(200);
  const mirror = await page.evaluate(() => {
    const r = (c) => document.querySelector('#m-aim .cell[data-cell="' + c + '"]').getBoundingClientRect();
    const C = window.STD_CONTRACT;
    return { c0: r(0).left, c4: r(4).left, c20: r(20).top, c0t: r(0).top, sc: C.screenCol(0), w: r(12).width, hgt: r(12).height };
  });
  ok(mirror.c0 > mirror.c4 && mirror.sc === 4, '3 the grid is the pitcher\'s view: cell 0 is drawn right of cell 4');
  ok(mirror.c20 > mirror.c0t, '3 row 0 is high, row 4 is low');
  ok(mirror.w >= 36 && mirror.hgt >= 36, '3 a cell is big enough to tap (' + Math.round(mirror.w) + 'x' + Math.round(mirror.hgt) + ')');
  await shot('mound');
  /* 3: aim on the field and the pad (the owner, 2026-10-22). Big pitch buttons with the number, the
     name and the pack's speed; one throw button; the step line. A drag over the zone moves the
     crosshair with the pointer (free aim, never snapped) and picks the cell it is let go in,
     through screenCol(); the break preview follows it; the zone takes touch-action none, so a drag
     never scrolls the page. The drag ends on a cell's centre, so the crosshair is there. */
  const pad = await page.evaluate(() => {
    const S = window.STD_UI.state, ars = S.scn.pitcher.arsenal;
    const btns = [...document.querySelectorAll('#m-arsenal .pitch')];
    return {
      buttons: btns.every((b, i) => b.querySelector('.pk').textContent === String(i + 1) && b.querySelector('.pt b').textContent === ars[i].name &&
        b.querySelector('.pv em').textContent === String(Math.round(ars[i].velo))),
      tall: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
      throwWord: document.querySelector('#m-throw b').textContent, say: document.getElementById('m-say').textContent,
      touch: getComputedStyle(document.getElementById('m-aim')).touchAction, grids: document.querySelectorAll('#m-scene .grid').length,
    };
  });
  ok(pad.buttons && pad.tall >= 44, '3 each pitch is a big button with its number, its name and the pack\'s speed (' + Math.round(pad.tall) + ' px tall)');
  ok(pad.throwWord === 'throw' && pad.say === 'pick a pitch', '3 one throw button, and the step line says what to do ("' + pad.say + '")');
  ok(pad.touch === 'none' && pad.grids === 0, '3 the aim is on the field (no separate grid) and a drag there never scrolls the page');
  await page.click('#m-arsenal .pitch >> nth=0');
  ok(await page.textContent('#m-say') === 'aim: drag or tap the zone', '3 with a pitch picked, the step line says aim');
  const at12 = await page.evaluate(() => { const r = document.querySelector('#m-aim .cell[data-cell="12"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; });
  const scroll0 = await page.evaluate(() => [window.scrollY, document.querySelector('main').scrollTop]);
  await page.mouse.move(at12[0], at12[1]);
  await page.mouse.down();
  // two columns right and one row down on screen, then let go
  await page.mouse.move(at12[0] + at12[2], at12[1] + at12[3] * 0.5, { steps: 4 });
  await page.mouse.move(at12[0] + at12[2] * 2, at12[1] + at12[3], { steps: 4 });
  const mid = await page.evaluate(() => ({ dragging: document.getElementById('m-aim').classList.contains('dragging'), cell: window.STD_UI.state.cell, hover: window.STD_UI.state.hover }));
  await page.mouse.up();
  const drag = await page.evaluate(() => {
    const S = window.STD_UI.state, C = window.STD_CONTRACT, st = window.STD_STAGE && window.STD_STAGE.current;
    const x = document.querySelector('#m-aim .aim-x').getBoundingClientRect(), c = document.querySelector('#m-aim .cell[data-cell="' + S.cell + '"]').getBoundingClientRect();
    return { cell: S.cell, row: C.rowOf(S.cell), sc: C.screenCol(S.cell), on: Math.abs(x.left + x.width / 2 - (c.left + c.width / 2)) < 2 && Math.abs(x.top + x.height / 2 - (c.top + c.height / 2)) < 2,
      ghost: st && st.ghostSpec ? st.ghostSpec.cell : null, is3d: !!st, say: document.getElementById('m-say').textContent, ready: !document.getElementById('m-throw').disabled,
      tag: document.querySelector('#m-aim .aim-tag').textContent, words: window.STD_UI.cellWords(S.cell, S.scn.batters[S.outing.batterIndex].bats),
      scroll: [window.scrollY, document.querySelector('main').scrollTop] };
  });
  ok(mid.dragging && mid.cell == null && mid.hover != null, '3 mid drag the crosshair moves and the preview follows, nothing picked yet');
  ok(drag.row === 3 && drag.sc === 4 && drag.on, '3 a drag picks the cell it ends in, through screenCol() (row ' + drag.row + ', screen column ' + drag.sc + '), the crosshair where it was let go');
  ok(!drag.is3d || drag.ghost === drag.cell, '3 the break preview aims where the crosshair is (' + drag.ghost + ')');
  ok(drag.tag.indexOf(drag.words) === 0 && !/\b(left|right)\b/.test(drag.tag), '3 the crosshair says where in inside and away words ("' + drag.tag + '")');
  ok(drag.ready && drag.say === 'tap throw' && drag.scroll.join() === scroll0.join(), '3 the throw button is ready, the step line says throw, and the page did not scroll');
  await shot('aimed');
  /* the heat map is always on: 25 painted tiles in the on-field aim before any tap, and the card opens over it */
  const heat = await page.evaluate(() => [...document.querySelectorAll('#m-aim .aim-heat i')].filter((c) => c.style.background).length);
  ok(heat === 25, '4 the heat map is in the on-field zone before any tap, on the same 25 cells');
  await page.click('#m-batter');
  await page.waitForSelector('#m-scout:not([hidden])');
  await shot('scout');
  await page.click('#m-heat [data-heat="swing"]');
  const swingOn = await page.evaluate(() => document.querySelector('#m-heat [data-heat="swing"]').getAttribute('aria-selected') === 'true');
  ok(swingOn, '4 the damage and swings switch is on the mound, outside the card');
  await shot('scout-swings');
  await page.click('#m-heat [data-heat="damage"]');
  await page.click('#m-batter');
  ok(await page.evaluate(() => document.getElementById('m-scout').hidden), '4 scouting closes on a second tap');

  /* 10 */
  at('10 the framing');
  for (const hand of ['L', 'R']) {
    const fr = await page.evaluate((hand) => {
      const S = window.STD_UI.state, was = S.scene.bat;
      const b = S.scn.batters.find((x) => x.bats === hand);
      S.scene.setBatter(b); S.grid.place(S.scene.gridRect()); S.scene.draw({});
      const f = S.scene.figureBoxes();
      const c = document.querySelector('#m-aim .cell[data-cell="12"]').getBoundingClientRect();
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
    at('14 every pitch result');
    const ev = await everyResult(page);
    const probs = ev.errors.concat(...ev.traces.map(motionProblems));
    ok(ev.traces.length === 28 && probs.length === 0, '14 every pitch result plays its motion (' + ev.traces.length + ' plays: ' + [...new Set(ev.kinds.map((k) => k.slice(2)))].join(', ') + ')' + (probs.length ? ': ' + probs.slice(0, 4).join(' | ') : ''));
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
      await page.waitForTimeout(400);   // the game's grid fades out in flight (.15 s)
      await shot('still-' + when);
    }
    await page.evaluate(() => { document.getElementById('m-scene').classList.remove('flying'); window.STD_STAGE.current.draw(); });
    pixelsOk('14 after the 28 plays the canvas still draws', await canvasRenders(page));
  }

  /* 5 */
  at('5 the outing', 900);
  const play = await playOuting(page, { w, h, shot });
  if (is3d) pixelsOk('5 after the outing the canvas still draws', await canvasRenders(page));
  ok(play.pitches > 0, '5 a whole outing on the real engine (' + play.pitches + ' pitches)');
  ok(play.problems.length === 0, '5 nothing graded, tipped or over the field from the first pitch to the last' + (play.problems.length ? ': ' + play.problems.slice(0, 3).join(' | ') : ''));
  if (is3d) traceCheck('5', play);
  ok(play.pbp.length && play.pbp.every((x) => x && x.length > 3), '5 one line of play by play after each pitch ("' + (play.pbp[0] || '') + '")');

  /* the minimap (minimap.js): the field shows after the first play; a dot only for a ball in play, and
     never for a take, a strike or a foul; no text on it (the distance is an estimate, never a number) */
  const mini = await page.evaluate(() => {
    const el = document.getElementById('m-mini'), M = window.STD_MINIMAP;
    return {
      shown: !el.hidden,
      dots: [...el.querySelectorAll('.mm-dot')].map((d) => ({ n: d.dataset.n, bb: d.dataset.bb })),
      texts: el.querySelectorAll('text').length,
      fly: M.spot({ bb: 'fly', ev: 100, la: 30, spray: -20 }),
      foulSide: M.spot({ bb: 'fly', ev: 100, la: 30, spray: -60 }),
      popup: M.spot({ bb: 'popup', ev: 70, la: 60, spray: 0 }),
      hud: { lit: document.querySelectorAll('#m-count .row i.on').length, aria: document.getElementById('m-count').getAttribute('aria-label') },
    };
  });
  const inPlayNs = play.traces.filter((t) => t.result === 'in_play').map((t) => String(t.n));
  const comparable = is3d && play.traces.length > 0;
  ok(mini.shown, '5 the minimap shows after the first play');
  ok(mini.texts === 0, '5 the minimap has no text: no distance is shown');
  ok(mini.fly && mini.fly.x < 0 && mini.fly.y > 0, '5 spray -20 lands left of centre, out from home (' + JSON.stringify(mini.fly) + ')');
  ok(mini.foulSide === null, '5 a spray past the foul line gets no dot');
  ok(mini.popup && mini.popup.y < 150, '5 a popup comes down near the infield (' + JSON.stringify(mini.popup) + ')');
  if (comparable) {
    ok(mini.dots.every((d) => inPlayNs.includes(d.n)), '5 every dot is a ball in play, none for a take (' + mini.dots.length + ' dots, ' + inPlayNs.length + ' in play)');
    ok(!inPlayNs.length || mini.dots.length > 0, '5 an in-play pitch draws a dot on the field');
  }
  ok(/^\d balls, \d strikes$/.test(mini.hud.aria || '') && mini.hud.lit <= 5, '5 the scorebug count is lit as balls and strikes (' + mini.hud.aria + ')');

  /* 6 */
  at('6 the result');
  await revealCheck(page, '6', play.pitches);
  await shot('result', true);
  /* Share (PR #652): the button opens the share sheet, which draws the result card (card.js) and
     offers the image and the text. The sheet opens from the button, the card draws, and "copy the
     text" copies the share text. Before #652 the button copied at once, and this step waited for that
     toast; on main after #652 it timed out, and the sheet left open then covered the coach button
     (CI, 2026-10-22).
     The toast is up for 2.2 s (ui.js toast). A click returns only once the page has taken the input,
     which under software GL can wait behind the GPU for longer than that, so the watch starts before
     the tap and keeps what the toast said. */
  await page.evaluate(() => {
    const t = document.getElementById('toast');
    window.STD_CHECK_TOAST = '';
    new MutationObserver(() => { if (t.classList.contains('on') && !window.STD_CHECK_TOAST) window.STD_CHECK_TOAST = t.textContent; }).observe(t, { attributes: true, attributeFilter: ['class'] });
  });
  await page.click('#r-share');
  await page.waitForSelector('#sheet-share.on', { timeout: 5000 });
  const card = await page.waitForFunction(() => {
    const i = document.getElementById('sh-img');
    if (/did not draw/.test(document.getElementById('share-body').textContent)) return 'the image did not draw';
    return i && i.complete && i.naturalWidth > 0 ? i.naturalWidth + 'x' + i.naturalHeight : null;
  }, null, { timeout: 60000 }).then((hd) => hd.jsonValue(), () => 'no image in 60 s');
  ok(/^\d+x\d+$/.test(card), '6 share opens the share sheet and the card draws (' + card + ')');
  await shot('share-sheet');
  await page.click('#sh-text');
  const toastSeen = await page.waitForFunction(() => window.STD_CHECK_TOAST, null, { timeout: 10000 }).then(() => true, () => false);
  const said = await page.evaluate(() => window.STD_CHECK_TOAST);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => 'unreadable: ' + String(e && e.message || e).slice(0, 80)));
  ok(toastSeen && /^copied/.test(said) && /Shut The Door #\d+/.test(clip) && /runthe\.gg\/shut-the-door/.test(clip) && ![...clip].some((ch) => ch.charCodeAt(0) === 0x2013 || ch.charCodeAt(0) === 0x2014),
    '6 copy the text copies the share text (toast "' + (said || 'none in 10 s') + '", ' + clip.split('\n').length + ' lines)');
  await page.click('#sheet-share .sh-x');
  await page.waitForSelector('#sheet-share', { state: 'hidden', timeout: 3000 });
  await shot('shared');

  /* 12, on the real engine */
  at('12 the coach');
  await coachCheck(page, '12', play.pitches, null, shot);

  /* 7 */
  at('7 run it back');
  await page.click('#r-again');
  await page.waitForSelector('#s-mound.on');
  const practice = await page.evaluate(() => window.STD_UI.state.outing.mode);
  ok(practice === 'practice', '7 run it back starts a practice outing');
  await shot('practice');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-done:not([hidden])', { timeout: 20000 });
  ok(await page.isHidden('#b-take'), '7 after a reload today shows as done');
  await shot('home-done', true);

  /* 8 */
  at('8 debug');
  await page.goto(BASE + '?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-main:not([hidden])');
  await homeWarm(page);
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
  step(w + 'x' + h + ' 11 ' + end + ': open the page');
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
  await homeWarm(page);
  await page.click('#b-take', { timeout: 120000 });   // software GL: the first frame of the mound takes seconds
  await page.waitForSelector('#s-mound.on #m-aim .cell');
  const is3d = await stageReady(page);
  if (proxy) ok(await page.isVisible('#m-proxy'), '11 ' + end + ': the proxy note is on the mound, small');
  step(w + 'x' + h + ' 11 ' + end + ': the outing', 900);
  const play = await playOuting(page, { w, h, shot, runnerShots: end !== 'door_shut', type0: true, cell: 12, noSkip: end !== 'door_shut' });
  const k = play.pitches, sawMove = play.sawMove, sawOut = play.sawOut;
  ok(play.problems.length === 0, '11 ' + end + ': nothing graded, tipped or over the field during play' + (play.problems.length ? ': ' + play.problems.slice(0, 3).join(' | ') : ''));
  ok(is3d, '11 ' + end + ': on the 3D mound');
  if (is3d) traceCheck('11 ' + end, play);
  if (is3d) pixelsOk('11 ' + end + ': at the end the canvas still draws', await canvasRenders(page));
  step(w + 'x' + h + ' 11 ' + end + ': the result and the coach');
  const res = await page.evaluate(() => ({ o: document.getElementById('r-outcome').textContent, cls: document.getElementById('r-outcome').className, rv: document.getElementById('r-reveal').textContent, st: document.getElementById('r-streak').textContent, them: window.STD_UI.state.outing.score.them, start: window.STD_UI.state.scn.situation.score.them }));
  const sawRun = res.them > res.start;
  ok(res.cls.includes(end), '11 ' + end + ': the outing ends ' + res.o + ' after ' + k + ' pitches');
  if (end !== 'door_shut') {
    ok(sawMove, '11 ' + end + ': runners move on the scorebar diamond');
    ok(sawRun, '11 ' + end + ': runs score (' + res.start + ' to ' + res.them + ')');
  }
  if (end === 'doors_open') ok(sawOut, '11 doors_open: the double play shows a runner put out');
  if (end === 'tie_held') {
    const bug = await page.evaluate(() => ({ tied: document.querySelector('#s-mound .scorebar').classList.contains('tied'), inn: document.getElementById('m-inn').textContent, pbp: document.getElementById('m-pbp').textContent }));
    ok(bug.tied && /tied/i.test(bug.inn), '11 tie_held: the scorebar says tied (' + bug.inn + ')');
    ok(res.them === res.start + 1, '11 tie_held: the tying run scored and the outing went on to three outs');
  }
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
  if (!SHOTS) console.log('the fast path: the game\'s own WebGL draws are skipped, the check draws where it reads pixels (see the header)');
  await run(390, 844, 'light');
  await run(1440, 900, 'dark');
  console.log('\nthe four endings');
  await ending(390, 844, 'door_shut', '&mockLesson=none');
  await ending(390, 844, 'tie_held', '&mockAuth=1');
  await ending(390, 844, 'doors_open', '&mockPro=none');
  await ending(390, 844, 'walk_off', '&mockProxy=1&mockNull=1&mockAuth=1');
  await ending(1440, 900, 'door_shut', '&mockLesson=none');
  await ending(1440, 900, 'tie_held', '&mockPro=none');
  await ending(1440, 900, 'doors_open', '&mockAuth=1');
  await ending(1440, 900, 'walk_off', '&mockPro=none');
} catch (e) {
  fails++;
  console.log(secs() + '  FAIL in "' + STEP.name + '": ' + (e && e.message ? e.message.split('\n')[0] : e));
  // Playwright's call log says why an action waited (not visible, not stable, another element on top)
  if (e && e.message && e.message.includes('\n')) console.log('       ' + e.message.split('\n').slice(1).filter((l) => l.trim()).slice(-6).map((l) => l.trim()).join(' / '));
}
await browser.close();
server.close();
console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
