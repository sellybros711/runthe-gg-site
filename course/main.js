/* Run The Course: the page. Boot, the loop, the HUD, the results card.
 *
 * The sim (sim.js) is the game. This file feeds it commands, steps it on a
 * fixed tick, and shows what it says. The renderer (render.js) draws the
 * state and is the only file that knows three.js.
 *
 * NOTHING OPENS A GUIDE BY ITSELF. A first visit goes straight into day 1,
 * and the goal line (part of the HUD) says the next thing to do. How it
 * works is behind a button in the menu. */
import { CONFIG, GAME } from './config.js?v=2';
import { MAP } from './map.js?v=2';
import { startShift, step, endShift, makeCtx, command, goalOf, clockOf, sheetOf, stations } from './sim.js?v=2';
import { makeBot } from './bot.js?v=2';
import { createStore } from './store.js?v=2';
import { createAnalytics } from './analytics.js?v=1';
import { createInput } from './input.js?v=1';
import { createRenderer } from './render.js?v=2';

const $ = id => document.getElementById(id);
const money = n => (n < 0 ? '-$' + (-n).toLocaleString('en-US') : '$' + n.toLocaleString('en-US'));
const DEBUG = new URLSearchParams(location.search).has('debug');
const cfg = CONFIG, map = MAP, TICK = 1 / cfg.shift.tick;

const auth = () => { const a = window.RTG_AUTH, s = a && a.state ? a.state() : null; return s && s.signedIn ? { token: a.token(), userId: s.userId } : null; };
const store = createStore({ cfg, map, auth });
const analytics = createAnalytics({ token: () => { const a = auth(); return a && a.token; } });

let R = null;
try { R = createRenderer($('view'), map, cfg); } catch (e) { $('fail').style.display = 'flex'; }

let S = null, ctx = null, course = null, courseKey = '', acc = 0, last = 0, scale = 1, paused = false, showRoute = false, bot = null;
let goal = null, goalKey = '', seenGoals = new Set(), ended = false, saving = null;
const keyOf = c => c.seed + ':' + c.shiftsFiled + ':' + c.cash;

/* ---- floating numbers: a small pool, no allocation in the loop ---- */
const floats = [], P = { x: 0, y: 0 };
for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'float'; document.body.appendChild(d); floats.push(d); }
let floatAt = 0;
function floatText(x, y, text, neg) {
  if (!R) return;
  const d = floats[floatAt++ % floats.length]; R.project(x, y, P);
  d.textContent = text; d.style.left = P.x + 'px'; d.style.top = P.y + 'px'; d.className = 'float' + (neg ? ' neg' : '');
  void d.offsetWidth; d.classList.add('go');
}
function fx(type, x, y, n) {
  if (type === 'cash' || type === 'tip') { if (n > 0) floatText(x, y, '+' + money(n)); if (navigator.vibrate) navigator.vibrate(12); }
  else if (type === 'refund') floatText(x, y, money(-n), true);
  else if (type === 'pad') { floatText(x, y, money(-cfg.economy.pads[n].cost), true); analytics.track('pad_buy', { id: n }); if (R) R.rebuild(S, ctx); }
  else if (type === 'up') { floatText(x, y, cfg.economy.upgrades[n].name + ' Lv ' + S.levels[n]); analytics.track('upgrade', { id: n, level: S.levels[n] }); if (navigator.vibrate) navigator.vibrate(20); if (R) R.rebuild(S, ctx); }
  else if (type === 'built' || type === 'cleared') { if (R) R.rebuild(S, ctx); banner(type === 'built' ? cfg.economy.pads[n].name + ' is open' : 'Plot cleared'); }
  else if (type === 'walkoff') floatText(x, y, 'Walked off', true);
  else if (type === 'mown') floatText(x, y, 'Green ' + n + ' cut');
}
let bannerT = 0;
function banner(text) { const b = $('banner'); b.textContent = text; b.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on'), 1600); }

/* ---- a shift ---- */
function begin() {
  course = store.course(); courseKey = keyOf(course);
  ctx = makeCtx(course, cfg, map); ctx.fx = fx;
  S = startShift(course, cfg, map);
  acc = 0; ended = false; goalKey = ''; bot = null;
  if (R) { R.setStations(stations); R.rebuild(S, ctx); R.snapshot(S); }
  $('dayLabel').textContent = 'Day ' + S.no;
  $('results').classList.remove('on');
  banner('Day ' + S.no);
  analytics.track('shift_start', { no: S.no });
  hud(true);
}
function finish() {
  ended = true; input.release();
  const end = endShift(S, ctx, course), r = end.result, debug = S.debug;
  const mm = Math.floor(r.avgRoundS / 60), ss = Math.round(r.avgRoundS % 60), ds = Math.round((r.stars - r.stars0) * 100) / 100;
  $('resTitle').textContent = 'Day ' + r.no + ' done';
  $('resGoal').innerHTML = '';
  const tag = document.createElement('span'); tag.className = 'tag' + (r.goalMet ? '' : ' miss'); tag.textContent = r.goalMet ? 'Goal met' : 'Goal missed';
  $('resGoal').append(tag, ' ' + money(r.cash) + ' of ' + money(r.goal));
  const rows = [['Rounds played', r.rounds], ['Average round', r.rounds ? mm + ':' + (ss < 10 ? '0' : '') + ss : '-'], ['Cash earned', money(r.cash)], ['Tips', money(r.tips)],
    ['Star rating', r.stars.toFixed(2) + ' (' + (ds >= 0 ? '+' : '') + ds.toFixed(2) + ')'], ['Lowest round', r.low || '-'], ['Walk offs', r.walkOffs], ['Upgrades bought', r.upgrades]];
  const box = $('resRows'); box.textContent = '';
  for (const [k, v] of rows) { const a = document.createElement('span'), b = document.createElement('span'); a.textContent = k; b.textContent = v; box.append(a, b); }
  $('resSave').textContent = debug ? 'Debug tools were on. This day was not saved.' : 'Saving.';
  $('results').classList.add('on');
  analytics.track('shift_end', { no: r.no, rounds: r.rounds, cash: r.cash, tips: r.tips, walk_offs: r.walkOffs, goal_met: r.goalMet, stuck: r.stuck });
  analytics.flush();
  saving = store.finish(end, S.log, debug).then(how => {
    const text = { debug: 'Debug tools were on. This day was not saved.', device: 'Saved on this device. Sign in to keep it everywhere.', saved: 'Saved to your account.',
      offline: 'Saved on this device. It will send when you are back online.', server: 'Your account had a newer course. That one is loaded.',
      refused: 'That day could not be saved. Your account course is loaded.', signedout: 'Saved on this device. Sign in to keep it everywhere.' }[how] || 'Saved on this device.';
    $('resSave').textContent = text;
    return how;
  });
}
$('nextDay').addEventListener('click', () => { const go = () => begin(); if (saving) saving.then(go, go); else go(); });

/* ---- the HUD ---- */
const SH = [];
let hudCash = -1, hudStars = -1, hudClock = '', hudSheet = '', hudMode = '';
function hud(force) {
  const earned = S.tally.fees - S.tally.refunds + S.tally.tips;
  if (force || S.cash !== hudCash || earned !== hud.e) {
    hudCash = S.cash; hud.e = earned;
    $('cash').textContent = money(S.cash);
    $('goalLabel').textContent = 'Today ' + money(earned) + ' of ' + money(S.goal);
    const f = $('barFill'); f.style.width = Math.min(100, S.goal ? earned / S.goal * 100 : 100) + '%'; f.classList.toggle('met', earned >= S.goal);
  }
  if (force || S.stars !== hudStars) { hudStars = S.stars; $('stars').textContent = S.stars.toFixed(2); }
  const c = clockOf(S, cfg);
  if (c !== hudClock) { hudClock = c; $('clock').textContent = c; }
  sheetOf(S, 3, SH);
  let key = '';
  for (const g of SH) key += g.id + g.st + '|';
  if (force || key !== hudSheet) {
    hudSheet = key;
    const box = $('chips'); box.textContent = '';
    for (const g of SH) {
      const el = document.createElement('span'); el.className = 'chip' + (g.st === 'sched' ? '' : ' here');
      const t = document.createElement('i');
      t.textContent = g.st === 'sched' ? clockOf({ tick: g.arrive }, cfg) : 'Here';
      el.append(g.size === 1 ? '1 golfer' : g.size + ' golfers', t); box.append(el);
    }
    if (!SH.length) { const el = document.createElement('span'); el.className = 'chip'; el.textContent = 'No more groups today'; box.append(el); }
  }
  goal = goalOf(S, ctx);
  if (goal.key !== goalKey) {
    goalKey = goal.key;
    const g = $('goalText'); g.textContent = goal.text; g.classList.add('pop'); setTimeout(() => g.classList.remove('pop'), 200);
    const kind = goal.key.split(':')[0];
    if (!seenGoals.has(kind)) { seenGoals.add(kind); analytics.track('goal_step', { key: kind, no: S.no }); }
  }
  if (S.player.mode !== hudMode) { hudMode = S.player.mode; $('leave').style.display = hudMode === 'walk' ? 'none' : 'block'; }
}
const A = { x: 0, y: 0 };
function arrow() {
  const el = $('arrow');
  if (!goal || goal.act || !R) { el.style.display = 'none'; return; }
  R.project(goal.x, goal.y, A);
  const w = innerWidth, h = innerHeight, m = 46;
  if (A.x > m && A.x < w - m && A.y > 120 && A.y < h - 110) { el.style.display = 'none'; return; }
  const cx = w / 2, cy = h / 2, dx = A.x - cx, dy = A.y - cy, k = Math.min((cx - m) / Math.abs(dx || 1), (cy - 130) / Math.abs(dy || 1));
  el.style.display = 'block'; el.style.left = cx + dx * k + 'px'; el.style.top = cy + dy * k + 'px';
  el.style.transform = 'rotate(' + Math.atan2(dx, -dy) + 'rad)';
}

/* ---- input: every action is a command ---- */
const T = { x: 0, y: 0 };
const input = createInput($('view'), $('stick'), {
  onDir(h) { if (S && !ended && !bot) command(S, 'dir', h); },
  onTap(x, y) { if (!S || ended || bot || !R) return; R.pick(x, y, T); command(S, 'goto', Math.round(T.x * 10) / 10, Math.round(T.y * 10) / 10); },
  onLeave() { if (S && !ended && S.player.mode !== 'walk') command(S, 'exit'); }
});
$('leave').addEventListener('click', () => { if (S && !ended) command(S, 'exit'); });

/* ---- the loop: a fixed tick, drawn in between ---- */
let frames = 0, frameMs = 0, ratioStep = 0, good = 0, fps = 0, tps = 0, ticksRun = 0, statT = 0;
const RATIOS = [Math.min(devicePixelRatio || 1, 2), 1.5, 1, 0.75].filter((v, i, a) => i === 0 || v < a[0]);
function size() { if (R) R.resize(innerWidth, innerHeight, RATIOS[ratioStep]); }
addEventListener('resize', size);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!S || paused) return;
  if (!ended) {
    acc += dt * scale;
    let n = 0;
    while (acc >= TICK && n < 12) {
      if (R) R.snapshot(S);
      if (bot) bot(S, ctx);
      step(S, ctx); acc -= TICK; n++; ticksRun++;
      if (S.done) { hud(false); finish(); break; }
    }
    if (n === 12) acc = 0;
    if (!ended) hud(false);
  }
  if (R) { R.draw(S, ctx, ended ? 1 : acc / TICK, now / 1000, ended ? null : goal, { route: showRoute }); arrow(); }
  /* dynamic resolution: drop a step when frames run long, climb back when they are short */
  frames++; frameMs += dt * 1000;
  if (frames >= 90) {
    const avg = frameMs / frames; fps = Math.round(1000 / avg);
    if (avg > 22 && ratioStep < RATIOS.length - 1) { ratioStep++; good = 0; size(); }
    else if (avg < 17.5 && ratioStep > 0 && ++good >= 6) { ratioStep--; good = 0; size(); }
    frames = 0; frameMs = 0;
  }
  if (DEBUG && now - statT > 500) {
    tps = Math.round(ticksRun / ((now - statT) / 1000)); ticksRun = 0; statT = now;
    const i = R ? R.info() : { calls: 0, triangles: 0, dpr: 0 };
    $('dbgStats').textContent = fps + ' fps · ' + tps + ' ticks/s · ' + scale + 'x\n' + i.calls + ' calls · ' + i.triangles + ' tris · dpr ' + i.dpr + (S.debug ? '\nNot saved: debug used' : '');
  }
}
document.addEventListener('visibilitychange', () => {
  paused = document.hidden || $('menu').classList.contains('on');
  if (document.hidden) { input.release(); analytics.last(); }
  last = performance.now();
});

/* ---- the menu: sign in, and the guide behind a button ---- */
function paintAcct() {
  const a = window.RTG_AUTH, s = a && a.state ? a.state() : null;
  $('acct').textContent = s && s.signedIn ? 'Signed in' + (s.name ? ' as ' + s.name : '') + '. Your course is saved to your account.' : 'Playing as a guest. Your course is saved on this device.';
  $('signIn').textContent = s && s.signedIn ? 'Account' : 'Sign in to save everywhere';
}
$('menuBtn').addEventListener('click', () => { paintAcct(); $('menu').classList.add('on'); paused = true; input.release(); });
$('closeMenu').addEventListener('click', () => { $('menu').classList.remove('on'); paused = document.hidden; last = performance.now(); });
$('howBtn').addEventListener('click', () => { $('how').hidden = !$('how').hidden; });
$('signIn').addEventListener('click', () => { if (window.RTGAuthUI) window.RTGAuthUI.open(); });

/* ---- debug tools, behind ?debug. A day that uses one is never saved. ---- */
if (DEBUG) {
  $('debug').style.display = 'block';
  for (const b of document.querySelectorAll('#debug [data-scale]')) b.addEventListener('click', () => { scale = +b.dataset.scale; });
  $('dbgCash').addEventListener('click', () => { if (S && !ended) command(S, 'cash', 100); });
  $('dbgSpawn').addEventListener('click', () => { if (S && !ended) command(S, 'spawn'); });
  $('dbgRoute').addEventListener('click', () => { showRoute = !showRoute; });
  $('dbgBot').addEventListener('click', () => { bot = bot ? null : makeBot(); });
}

/* ---- boot: straight into the day. The account's course lands behind it. ---- */
size();
if (R) R.lost(() => { $('fail').style.display = 'flex'; });
begin();
analytics.track('open', { first: analytics.first, signed: !!auth() });
last = performance.now();
requestAnimationFrame(frame);
function resync() {
  store.sync().then(() => {
    /* a different course arrived (the account's): the day starts again on it */
    if (keyOf(store.course()) !== courseKey && (!ended || $('results').classList.contains('on'))) { if (!ended) begin(); }
    paintAcct();
  });
}
let authSeen = null;
if (window.RTG_AUTH && window.RTG_AUTH.onChange) {
  window.RTG_AUTH.onChange(s => { if (!s.resolved) return; const id = s.signedIn ? s.userId : ''; if (id === authSeen) return; authSeen = id; if (id) resync(); else paintAcct(); });
}
addEventListener('pagehide', () => analytics.last());

/* For the checks (test/check-browser.mjs). Nothing on the page calls it. */
window.__course = {
  game: GAME, state: () => S, ctx: () => ctx, info: () => (R ? R.info() : null), store,
  auto(on) { bot = on ? makeBot() : null; }, scale(n) { scale = n; },
  summary: () => ({ no: S.no, tick: S.tick, phase: S.phase, done: S.done, ended, cash: S.cash, goal: goal && goal.text, mode: S.player.mode, fps })
};
