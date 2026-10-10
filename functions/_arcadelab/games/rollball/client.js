/* Roll-Ball in the browser: input, a fixed-step loop, drawing and the screens.
 * The rules are sim.js, the same file the server replays. This file only
 * decides when a throw happens and records it as { f, a, p }. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { api, session, makeSound, makeHaptics, makeHost, share, countdown, reducedMotion } from '../../shared/kit.js';
import { shareText } from '../../shared/share.js';
import { dateKey, dayNumber } from '../../shared/seed.js';

const VERSION = 'rollball-1';
const $ = id => document.getElementById(id);
const DEBUG = /[?&]debug=1/.test(location.search);
const sound = makeSound(), haptics = makeHaptics(), host = makeHost($('host'));
const RM = reducedMotion();

const ZONE_NAME = { '1B': 'SINGLE', '2B': 'DOUBLE', '3B': 'TRIPLE', HR: 'HOME RUN', F: 'FOUL' };
const ZONE_COL = { '1B': '#22B07D', '2B': '#d9a51c', '3B': '#e07a2a', HR: '#E0533D', F: '#141414' };

/* ---------- state ---------- */
let today = null;           // the server's answer to /today
let mode = 'daily';         // or 'practice'
let st = null;              // the sim
let prev = null;            // the sim's ball position one step ago, for interpolation
let log = [];
let running = false, paused = false, startedAt = 0, finishing = false;
let pending = null;         // a throw waiting for the next step
let aim = null;             // { a, p, from } while aiming
let keys = { left: false, right: false, charging: false, chargeT: 0 };
let keyAngle = 0;
let fps = 0;

/* ---------- canvas and projection ---------- */
const cv = $('c'), cx = cv.getContext('2d'), stage = $('stage');
let W = 0, H = 0, DPR = 1, KX = 1, KY = 1, BOTTOM = 0, OFFX = 0, boardImg = null;
const FAR = 345;
const sOf = y => 1 - 0.36 * Math.max(0, Math.min(1, y / FAR));
/* The lane is foreshortened harder than the board, so the board (where the
   scoring happens) gets most of the screen. */
const proj = y => y < C.LIP_Y ? y * 0.62 : C.LIP_Y * 0.62 + (y - C.LIP_Y) * 1.02;
function SX(x, y) { return OFFX + W / 2 + x * KX * sOf(y); }
function SY(y) { return BOTTOM - proj(y) * KY; }

function resize() {
  const r = $('stage').getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  cv.width = W * DPR; cv.height = H * DPR;
  const w = Math.min(W, H * 0.7); OFFX = 0;
  KX = (w * 0.47) / ((C.BOARD_HALF + 8) * sOf(C.BOARD_FRONT));
  BOTTOM = H * 0.9;
  KY = (H * 0.84) / proj(FAR);
  boardImg = null;
}

function circlePts(cx0, cy0, r, n = 56) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; const x = cx0 + r * Math.cos(t), y = cy0 + r * Math.sin(t); pts.push([SX(x, y), SY(y)]); }
  return pts;
}
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }

/* The static part of the playfield, drawn once per size. */
function drawBoard() {
  const off = document.createElement('canvas'); off.width = W * DPR; off.height = H * DPR;
  const g = off.getContext('2d'); g.scale(DPR, DPR);
  const L = st.layout;
  // side gutters and the cabinet
  g.fillStyle = '#d9d5cc';
  poly(g, [[SX(-C.BOARD_HALF - 8, C.BOARD_FRONT - 8), SY(C.BOARD_FRONT - 8)], [SX(C.BOARD_HALF + 8, C.BOARD_FRONT - 8), SY(C.BOARD_FRONT - 8)],
    [SX(C.BOARD_HALF + 8, C.BOARD_BACK + 6), SY(C.BOARD_BACK + 6)], [SX(-C.BOARD_HALF - 8, C.BOARD_BACK + 6), SY(C.BOARD_BACK + 6)]]); g.fill();
  // the board
  g.fillStyle = '#20231f';
  poly(g, [[SX(-C.BOARD_HALF, C.BOARD_FRONT), SY(C.BOARD_FRONT)], [SX(C.BOARD_HALF, C.BOARD_FRONT), SY(C.BOARD_FRONT)],
    [SX(C.BOARD_HALF, C.BOARD_BACK), SY(C.BOARD_BACK)], [SX(-C.BOARD_HALF, C.BOARD_BACK), SY(C.BOARD_BACK)]]); g.fill();
  // the lane
  const lane = g.createLinearGradient(0, SY(0), 0, SY(C.LIP_Y));
  lane.addColorStop(0, '#c99a62'); lane.addColorStop(1, '#a87a46');
  g.fillStyle = lane;
  poly(g, [[SX(-C.LANE_HALF - 3, -14), SY(-14)], [SX(C.LANE_HALF + 3, -14), SY(-14)], [SX(C.LANE_HALF + 3, C.LIP_Y), SY(C.LIP_Y)], [SX(-C.LANE_HALF - 3, C.LIP_Y), SY(C.LIP_Y)]]); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
  for (let x = -C.LANE_HALF + 7; x < C.LANE_HALF; x += 7) { g.beginPath(); g.moveTo(SX(x, -14), SY(-14)); g.lineTo(SX(x, C.LIP_Y), SY(C.LIP_Y)); g.stroke(); }
  // rails
  g.fillStyle = '#141414';
  for (const sgn of [-1, 1]) {
    poly(g, [[SX(sgn * (C.LANE_HALF + 3), -14), SY(-14)], [SX(sgn * (C.LANE_HALF + 7), -14), SY(-14)], [SX(sgn * (C.LANE_HALF + 7), C.LIP_Y), SY(C.LIP_Y)], [SX(sgn * (C.LANE_HALF + 3), C.LIP_Y), SY(C.LIP_Y)]]);
    g.fill();
  }
  // the ramp up to the board
  g.fillStyle = '#3a3a36';
  poly(g, [[SX(-C.LANE_HALF - 7, C.LIP_Y), SY(C.LIP_Y)], [SX(C.LANE_HALF + 7, C.LIP_Y), SY(C.LIP_Y)],
    [SX(C.BOARD_HALF, C.BOARD_FRONT), SY(C.BOARD_FRONT)], [SX(-C.BOARD_HALF, C.BOARD_FRONT), SY(C.BOARD_FRONT)]]); g.fill();
  // the ramp lip
  g.fillStyle = '#E0533D';
  poly(g, [[SX(-C.LANE_HALF - 7, C.LIP_Y), SY(C.LIP_Y)], [SX(C.LANE_HALF + 7, C.LIP_Y), SY(C.LIP_Y)], [SX(C.LANE_HALF + 7, C.LIP_Y + 4), SY(C.LIP_Y + 4)], [SX(-C.LANE_HALF - 7, C.LIP_Y + 4), SY(C.LIP_Y + 4)]]); g.fill();
  // the rings, outside in
  const fills = { '1B': '#1d7f5c', '2B': '#a77d12', '3B': '#b45a19' };
  const zones = ['1B', '2B', '3B'];
  L.ring.r.forEach((r, i) => {
    const z = zones[i];
    poly(g, circlePts(L.ring.x, L.ring.y, r)); g.fillStyle = fills[z]; g.fill();
    g.lineWidth = z === st.day.hot ? 3.5 : 2; g.strokeStyle = z === st.day.hot ? '#ffe680' : 'rgba(255,255,255,.75)'; g.stroke();
  });
  // ring labels
  g.fillStyle = 'rgba(255,255,255,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lbl = (t, x, y, sz) => { g.font = '800 ' + Math.round(sz * sOf(y)) + 'px Outfit, sans-serif'; g.fillText(t, SX(x, y), SY(y)); };
  const [r1, r2] = L.ring.r;
  lbl('1B', L.ring.x, L.ring.y - (r1 + r2) / 2, 13); lbl('2B', L.ring.x, L.ring.y - (r2 + L.ring.r[2]) / 2, 12); lbl('3B', L.ring.x, L.ring.y, 11);
  if (st.day.hot) {
    const yy = st.day.hot === '1B' ? L.ring.y + (r1 + r2) / 2 : st.day.hot === '2B' ? L.ring.y + (r2 + L.ring.r[2]) / 2 : L.ring.y + L.ring.r[2] + 4;
    g.fillStyle = '#ffe680'; lbl('HOT +1', L.ring.x, Math.min(yy, L.ring.y + r1 - 4), 10);
  }
  boardImg = off;
}

function drawPockets(frame) {
  for (const p of st.layout.pockets) {
    const c = S.pocketAt(p, frame);
    poly(cx, circlePts(c.x, c.y, C.POCKET_R + 2.5, 32)); cx.fillStyle = '#E0533D'; cx.fill();
    poly(cx, circlePts(c.x, c.y, C.POCKET_R, 32)); cx.fillStyle = '#0b0b0b'; cx.fill();
    cx.fillStyle = '#fff'; cx.font = '800 ' + Math.round(10 * sOf(c.y)) + 'px Outfit, sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('HR', SX(c.x, c.y + C.POCKET_R + 7), SY(c.y + C.POCKET_R + 7));
    if (p.slide && !RM) {
      cx.strokeStyle = 'rgba(224,83,61,.35)'; cx.lineWidth = 1.5; cx.setLineDash([3, 4]);
      cx.beginPath(); cx.moveTo(SX(p.x - p.slide.amp, p.y), SY(p.y)); cx.lineTo(SX(p.x + p.slide.amp, p.y), SY(p.y)); cx.stroke(); cx.setLineDash([]);
    }
  }
}

function drawBall(x, y, z) {
  const s = sOf(y), r = 3.6 * KX * s;
  // shadow on the surface, the ball lifted by its height
  cx.fillStyle = 'rgba(0,0,0,.25)';
  cx.beginPath(); cx.ellipse(SX(x, y), SY(y) + r * 0.4, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); cx.fill();
  const bx = SX(x, y), by = SY(y) - z * KY * 0.9 * s;
  const gr = cx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.2, bx, by, r);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#c9c5bb');
  cx.fillStyle = gr; cx.beginPath(); cx.arc(bx, by, r, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#141414'; cx.lineWidth = 1.2; cx.stroke();
}

function drawAim() {
  const a = aim ? aim.a : keyAngle, p = aim ? aim.p : keys.chargeT;
  if (!aim && !keys.charging && !(st.phase === 'ready' && (keys.left || keys.right))) return;
  // a faint guide up the lane, longer with more power
  const len = 40 + p * (C.LIP_Y - 30);
  cx.fillStyle = 'rgba(20,20,20,.55)';
  for (let d = 10; d < len; d += 9) {
    const x = d * Math.sin(a), y = d * Math.cos(a);
    if (Math.abs(x) > C.LANE_HALF) break;
    cx.beginPath(); cx.arc(SX(x, y), SY(y), 2.1 * sOf(y), 0, Math.PI * 2); cx.fill();
  }
  // the power meter
  const mx = W - 22, mh = H * 0.32, my = BOTTOM - mh;
  cx.fillStyle = 'rgba(20,20,20,.12)'; cx.fillRect(mx, my, 12, mh);
  cx.fillStyle = p > 0.85 ? '#E0533D' : '#22B07D'; cx.fillRect(mx, my + mh * (1 - p), 12, mh * p);
  cx.strokeStyle = '#141414'; cx.lineWidth = 1.5; cx.strokeRect(mx, my, 12, mh);
}

function drawDebug(alpha) {
  const L = st.layout;
  cx.strokeStyle = '#0f0'; cx.lineWidth = 1;
  for (const r of L.ring.r) { poly(cx, circlePts(L.ring.x, L.ring.y, r)); cx.stroke(); }
  for (const p of L.pockets) { const c = S.pocketAt(p, st.frame); poly(cx, circlePts(c.x, c.y, C.POCKET_R, 24)); cx.stroke(); }
  cx.beginPath(); cx.moveTo(SX(-C.LANE_HALF, 0), SY(0)); cx.lineTo(SX(-C.LANE_HALF, C.LIP_Y), SY(C.LIP_Y));
  cx.moveTo(SX(C.LANE_HALF, 0), SY(0)); cx.lineTo(SX(C.LANE_HALF, C.LIP_Y), SY(C.LIP_Y)); cx.stroke();
  let d = $('dbg'); if (!d) { d = document.createElement('div'); d.id = 'dbg'; d.className = 'dbg'; $('stage').appendChild(d); }
  d.textContent = 'fps ' + fps.toFixed(0) + '  seed ' + st.seed + '\nlayout ' + L.id + '  hot ' + st.day.hot +
    '\nframe ' + st.frame + '  phase ' + st.phase + '  a ' + alpha.toFixed(2) +
    '\nV ' + C.V_MIN + '..' + C.V_MAX + '  carry ' + C.CARRY_S + '  jit ' + C.CARRY_JITTER +
    '\nball ' + st.x.toFixed(1) + ',' + st.y.toFixed(1) + ' z' + st.z.toFixed(1);
}

function render(alpha) {
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H);
  if (!st) return;
  if (!boardImg) drawBoard();
  cx.drawImage(boardImg, 0, 0, W, H);
  drawPockets(st.frame);
  const ix = prev ? prev.x + (st.x - prev.x) * alpha : st.x;
  const iy = prev ? prev.y + (st.y - prev.y) * alpha : st.y;
  const iz = prev ? prev.z + (st.z - prev.z) * alpha : st.z;
  if (st.phase !== 'over') drawBall(ix, iy, iz);
  if (st.phase === 'ready') drawAim();
  if (DEBUG) drawDebug(alpha);
}

/* ---------- the loop ---------- */
let last = 0, acc = 0, fpsT = 0, fpsN = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) last = ts;
  let dt = Math.min(0.25, (ts - last) / 1000); last = ts;
  fpsN++; fpsT += dt; if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  if (running && !paused && st && !st.over) {
    acc += dt;
    while (acc >= C.DT) { tick(); acc -= C.DT; if (!running) break; }
  }
  render(running ? acc / C.DT : 1);
}

function tick() {
  // the keyboard charges a throw a step at a time, so it is frame-exact too
  if (st.phase === 'ready') {
    if (keys.left) keyAngle = Math.max(-C.MAX_ANGLE, keyAngle - 0.006);
    if (keys.right) keyAngle = Math.min(C.MAX_ANGLE, keyAngle + 0.006);
    if (keys.charging) keys.chargeT = Math.min(1, keys.chargeT + C.DT / 1.3);
  }
  if (pending && st.phase === 'ready') {
    const f = st.frame;
    if (S.throwBall(st, pending.a, pending.p)) { log.push({ f, a: pending.a, p: pending.p }); onThrow(); }
    pending = null;
  }
  prev = { x: st.x, y: st.y, z: st.z };
  const ball = st.ball;
  S.step(st);
  if (st.event) onEvent(st.event);
  if (stage.dataset.phase !== st.phase) stage.dataset.phase = st.phase;
  if (st.ball !== ball && !st.over) { hud(); prev = null; host.set(st.ball >= 7 ? 'nervous' : 'idle', 'ready'); }
}

function round4(v) { return Math.round(v * 10000) / 10000; }
function queueThrow(a, p) {
  if (!running || paused || st.phase !== 'ready' || pending) return;
  pending = { a: round4(Math.max(-C.MAX_ANGLE, Math.min(C.MAX_ANGLE, a))), p: round4(Math.max(0, Math.min(1, p))) };
}

function onThrow() {
  sound.play('roll'); haptics.buzz(12);
  $('hint').textContent = '';
  host.set(st.ball >= 7 ? 'nervous' : 'idle', 'watching');
}

function onEvent(e) {
  if (e.type === 'launch') sound.play('launch');
  else if (e.type === 'land') { sound.play('land'); haptics.buzz(20); }
  else if (e.type === 'rail') sound.play('rail');
  else if (e.type === 'result') {
    const pop = $('pop');
    pop.textContent = ZONE_NAME[e.zone] + (e.hot ? ' +1' : '');
    pop.style.background = ZONE_COL[e.zone];
    pop.classList.remove('on'); void pop.offsetWidth; pop.classList.add('on');
    if (e.zone === 'HR') { sound.play('big'); haptics.buzz([30, 40, 60]); host.set('hype', 'homer'); }
    else if (e.zone === 'F') { sound.play('foul'); host.set('disappointed', 'foul'); }
    else { sound.play('good'); host.set(e.zone === '3B' ? 'celebrate' : 'idle', 'hit'); }
    hud();
  } else if (e.type === 'over') finish();
}

/* ---------- HUD ---------- */
function hud() {
  $('hBases').textContent = st.score;
  $('hBall').textContent = Math.min(C.BALLS, st.ball + 1) + '/' + C.BALLS;
  drawDiamond();
}
/* The bases as a mini diamond: each result lights the bags it reached. */
function drawDiamond() {
  const svg = $('diamond');
  const last = st.results[st.results.length - 1];
  const reached = last ? last.bases : 0;
  const pts = [[26, 46], [46, 26], [26, 6], [6, 26]];
  let s = '<path d="M26 46 L46 26 L26 6 L6 26 Z" fill="none" stroke="#141414" stroke-width="2"/>';
  pts.forEach((p, i) => {
    const lit = i === 0 ? reached >= 4 : reached >= i;
    s += '<rect x="' + (p[0] - 5) + '" y="' + (p[1] - 5) + '" width="10" height="10" transform="rotate(45 ' + p[0] + ' ' + p[1] + ')" fill="' +
      (lit ? (reached >= 4 ? '#E0533D' : '#22B07D') : '#fff') + '" stroke="#141414" stroke-width="1.5"/>';
  });
  svg.innerHTML = s;
}

/* ---------- input ---------- */
/* Full power is this far a pull: whatever room the lane leaves below its top. */
const PULL_FULL = () => Math.max(120, Math.min(H * 0.26, H - SY(C.LIP_Y) - 20));
function stagePt(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
cv.addEventListener('pointerdown', e => {
  sound.unlock();
  if (!running || paused || !st || st.phase !== 'ready' || pending) return;
  const p = stagePt(e);
  // forgiving: a drag can start anywhere on the lane, so a thumb has room to
  // pull back even though the ball sits near the bottom of the screen
  if (p.y < SY(C.LIP_Y) - 30) return;
  cv.setPointerCapture(e.pointerId);
  aim = { from: p, a: 0, p: 0 };
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (!aim) return;
  const p = stagePt(e), dx = p.x - aim.from.x, dy = p.y - aim.from.y;
  const pull = Math.max(0, dy);
  aim.p = Math.max(0, Math.min(1, pull / PULL_FULL()));
  // a slingshot: pull back and to the left to roll right
  aim.a = Math.max(-C.MAX_ANGLE, Math.min(C.MAX_ANGLE, Math.atan2(-dx, Math.max(30, pull)) * 0.9));
});
function release() {
  if (!aim) return;
  const a = aim; aim = null;
  if (a.p < 0.04) return;   // a tap is not a throw
  queueThrow(a.a, a.p);
}
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', () => { aim = null; });

addEventListener('keydown', e => {
  if (!running || paused) return;
  if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  else if (e.key === ' ' && !e.repeat) { sound.unlock(); keys.charging = true; keys.chargeT = 0; e.preventDefault(); }
});
addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft') keys.left = false;
  else if (e.key === 'ArrowRight') keys.right = false;
  else if (e.key === ' ' && keys.charging) { keys.charging = false; if (keys.chargeT >= 0.04) queueThrow(keyAngle, keys.chargeT); keys.chargeT = 0; e.preventDefault(); }
});

/* Pause when the tab is left. */
function pause() { if (running && !st.over) { paused = true; aim = null; keys.charging = false; $('pause').classList.add('on'); } }
function resume() { paused = false; last = 0; $('pause').classList.remove('on'); }
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', pause);
$('pause').addEventListener('click', resume);
$('pause').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') resume(); });

/* Never lose a run to a back swipe. */
function midRun() { return running && st && !st.over && log.length > 0; }
addEventListener('beforeunload', e => { if (midRun()) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('popstate', () => {
  if (midRun() && !confirm('Leave this run? It will not count.')) { history.pushState({ rb: 1 }, ''); return; }
  location.href = '/arcade/';
});
$('back').addEventListener('click', e => { if (midRun() && !confirm('Leave this run? It will not count.')) e.preventDefault(); });

$('mute').setAttribute('aria-pressed', String(sound.muted));
$('mute').addEventListener('click', () => { sound.unlock(); $('mute').setAttribute('aria-pressed', String(sound.toggle())); });

/* ---------- screens ---------- */
function sheet(html) { $('card').innerHTML = html; $('sheet').classList.add('on'); }
function closeSheet() { $('sheet').classList.remove('on'); }

function intro() {
  host.set('idle');
  const played = today && today.played;
  const rule = today ? today.config.rule : S.dailyConfig(st.seed).rule;
  sheet('<h2>Roll-Ball' + (today ? ' <span class="mut">#' + today.dayNumber + '</span>' : '') + '</h2>' +
    '<p class="rule">Roll nine balls. Land them in the rings. Rack up bases.</p>' +
    '<p class="today">Today: ' + esc(rule) + '</p>' +
    '<p class="mut">Touch the lane, pull back and let go. Pull further for more power, sideways to aim. Keyboard: arrows aim, hold Space to charge.</p>' +
    '<div class="row">' + (played ? '<button class="btn" id="bSeen">See today\'s result</button>' : '<button class="btn go" id="bPlay">Play today</button>') +
    '<button class="btn alt" id="bPrac">Practice</button></div>' +
    '<label class="toggle"><input type="checkbox" id="hap"' + (haptics.on ? ' checked' : '') + '> Vibrate on hits</label>');
  if ($('bPlay')) $('bPlay').onclick = () => start('daily');
  if ($('bSeen')) $('bSeen').onclick = () => showResult(today.played, true);
  $('bPrac').onclick = () => start('practice');
  $('hap').onchange = () => haptics.toggle();
}

function start(m) {
  sound.unlock();
  mode = m;
  const seed = m === 'daily' ? today.seed : crypto.getRandomValues(new Uint32Array(1))[0];
  st = S.create(seed); prev = null; log = []; pending = null; aim = null; keyAngle = 0; finishing = false;
  boardImg = null; running = true; paused = false; acc = 0; last = 0; startedAt = performance.now();
  $('pchip').hidden = m !== 'practice';
  closeSheet(); hud();
  $('hint').textContent = 'Touch the lane, pull back, let go';
  history.pushState({ rb: 1 }, '');
}

async function finish() {
  if (finishing) return; finishing = true; running = false;
  const durationMs = Math.round(performance.now() - startedAt);
  const local = { score: st.score, scoreText: S.scoreText(st.score), detail: S.detail(st), squares: S.squares(S.detail(st)),
    gems: 0, dayNumber: today ? today.dayNumber : dayNumber(dateKey(Date.now())) };
  host.set(st.score >= 24 ? 'celebrate' : st.score <= 11 ? 'disappointed' : 'idle', 'over');
  if (mode !== 'daily') return showResult(local, false, 'Practice run. Not scored and no gems.');
  sheet('<h2>Checking the board...</h2>');
  const r = await api('POST', 'roll-ball/run', { mode: 'daily', dateKey: today.dateKey, seed: today.seed, inputs: log,
    score: st.score, durationMs, clientVersion: VERSION }).catch(() => ({ status: 0 }));
  if (r.status === 200) { today.played = r.data.result; showResult(r.data.result, true, null, r.data.gems); }
  else showResult(local, false, r.status === 409 ? 'You already played today.' :
    'This run did not save (' + ((r.data && r.data.error) || 'network') + '). Nothing was scored.', null, r.status === 0);
}

async function showResult(res, saved, note, total, retry) {
  running = false;
  const d = res.detail;
  const text = shareText('Roll-Ball', res.dayNumber, res.scoreText || S.scoreText(res.score), res.squares || S.squares(d));
  sheet('<h2>' + (saved ? 'Today\'s run' : mode === 'practice' ? 'Practice' : 'Run over') + '</h2>' +
    '<div class="score">' + esc(res.scoreText || S.scoreText(res.score)) + '</div><div class="mut">bases</div>' +
    '<div class="strip" aria-label="Ball by ball">' + (res.squares || S.squares(d)).join('') + '</div>' +
    (d && d.cycle ? '<p>Hit for the cycle<span class="badge">CYCLE</span></p>' : '') +
    (saved ? '<p class="gems">+' + res.gems + ' gems' + (total != null ? ' <span class="mut">(' + total + ' total)</span>' : '') + '</p>' +
      '<p class="mut">Gems are just for fun. They have no cash value.</p>' : '') +
    (note ? '<p class="mut">' + esc(note) + '</p>' : '') +
    '<div class="row">' + (saved ? '<button class="btn go" id="bShare">Share</button>' : '') +
    (retry ? '<button class="btn" id="bRetry">Try saving again</button>' : '') +
    '<button class="btn alt" id="bPrac">Practice</button></div>' +
    '<p class="mut">Next daily in <b id="cd"></b></p><div class="board" id="lb"></div>');
  if ($('bShare')) $('bShare').onclick = async () => { const s = await share(text); $('bShare').textContent = s === 'copied' ? 'Copied' : 'Share'; };
  if ($('bRetry')) $('bRetry').onclick = () => { finishing = false; finish(); };
  $('bPrac').onclick = () => start('practice');
  countdown($('cd'));
  if (saved) loadBoard();
}

async function loadBoard() {
  const r = await api('GET', 'roll-ball/leaderboard').catch(() => null);
  if (!r || r.status !== 200 || !$('lb')) return;
  const b = r.data;
  $('lb').innerHTML = '<b>Today\'s board</b> <span class="mut">(' + b.total + ' played)</span>' +
    (b.top.length ? '<ol>' + b.top.slice(0, 10).map(x => '<li' + (x.me ? ' class="me"' : '') + '>' + esc(x.name) + ' <span class="mut">' + x.score + '</span></li>').join('') + '</ol>'
      : '<p class="mut">Sign in to put your name on the board.</p>') +
    (b.me && b.me.rank ? '<p class="mut">You are #' + b.me.rank + '.</p>' : '');
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- boot ---------- */
async function boot() {
  resize(); addEventListener('resize', resize);
  requestAnimationFrame(frame);
  sheet('<h2>Roll-Ball</h2><p class="mut">Loading today\'s board...</p>');
  await session();
  const r = await api('GET', 'roll-ball/today').catch(() => ({ status: 0 }));
  if (r.status !== 200) { sheet('<h2>Roll-Ball</h2><p>Could not load today. <a href="/arcade/">Back to the Arcade</a></p>'); return; }
  today = r.data;
  st = S.create(today.seed);
  if (today.played) { mode = 'daily'; showResult(today.played, true, null, today.gems); return; }
  intro();
}
boot();
