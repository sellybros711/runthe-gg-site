/* The page: clipboard, then the live play, then the result. It holds no
 * rules; the sim decides everything and this only shows it.
 *
 * ACCOUNT PLUG POINTS (out of scope for v1, see the vault note
 * games/last-shot/last-shot-overview.md):
 *   TODO(account): who is signed in. The gated pages load no site shell, so
 *     load /arcade/auth.js and read window.RTG_AUTH.state() as the Arcade Lab
 *     shell does (functions/_arcadelab/shared/kit.js session()).
 *   TODO(results): save a finished possession (seed, play, outcome) through a
 *     gated API like /api/arcade/*, replayed on the server by sim.js.
 *   TODO(trophies, streaks, leaderboards): once results are saved; a daily
 *     scenario would take a dated seed and a board like RTG_BOARD's. */
import { SCENARIO as SC } from './scenario.js';
import { simulate } from './sim.js';
import { emptyPlay, problems, playKey } from './playbook.js';
import { createBoard } from './board.js';
import { createCourt } from './court.js';
import { shareText } from './share.js';
import { freshSeed } from './rng.js';

const $ = id => document.getElementById(id);
const KEY = 'last_shot_play_v1';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

let play = loadPlay();
let hintTimer = null, lastResult = null, live = null, debugOn = false;

function loadPlay() {
  try {
    const p = JSON.parse(lsGet(KEY) || 'null');
    if (p && p.spots && Array.isArray(p.steps) && Object.keys(p.spots).length === 5) return p;
  } catch (e) {}
  return emptyPlay(SC);
}

const ui = {
  hint(t) {
    $('hint').textContent = t || '';
    clearTimeout(hintTimer);
    if (t) hintTimer = setTimeout(() => { $('hint').textContent = defaultHint(); }, 2600);
  },
  changed(p) {
    $('bRun').disabled = problems(SC, p).length > 0;
    $('bUndo').disabled = !p.steps.length;
    $('bClear').disabled = !p.steps.length;
    if (!hintTimer || !$('hint').textContent) $('hint').textContent = defaultHint();
  }
};
function defaultHint() {
  if (!board) return '';
  if (!play.steps.length && !board.tool) return 'Drag players to set the floor. Then pick a tool.';
  if (!problems(SC, play).length) return 'Ready. Run It.';
  return board.tool ? '' : 'Pick a tool.';
}

const board = createBoard($('board'), SC, () => play, p => { play = p; lsSet(KEY, JSON.stringify(p)); }, ui);
const court = createCourt($('court'));

document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
  const t = board.setTool(b.dataset.tool);
  document.querySelectorAll('.tool').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.tool === t)));
  ui.hint({ move: 'Drag from a player to draw his route.', screen: 'Drag from a player. He sets a screen at the end.', pass: 'Tap the man with the ball, then a teammate.', shoot: 'Tap the man with the ball to shoot.' }[t] || '');
}));
$('bUndo').addEventListener('click', () => board.undo());
$('bClear').addEventListener('click', () => board.clear());
$('bRun').addEventListener('click', () => run(freshSeed()));
window.addEventListener('resize', () => { if (live) court.draw(live.res.frames[live.i]); else board.draw(); });

/* ---------- the live play ---------- */
function setScore(us, them, clock) {
  $('sUs').textContent = us; $('sThem').textContent = them; $('clock').textContent = clock.toFixed(1);
}

function run(seed) {
  const res = simulate(SC, play, seed);
  lastResult = res;
  $('board').hidden = true; $('court').hidden = false;
  $('tools').style.visibility = 'hidden'; $('actions').style.visibility = 'hidden';
  $('sheet').classList.remove('on'); $('hint').textContent = '';
  const slows = res.events.filter(e => e.slow).map(e => e.t);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  live = { res, i: 0, g: SC.clock, shown: 0, us: SC.us, them: SC.them };
  setScore(SC.us, SC.them, SC.clock);
  let last = performance.now();
  const F = res.frames;
  function tick(now) {
    if (!live || live.res !== res) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // Slow down near the pass and the shot so they can be read.
    const near = slows.some(t => Math.abs(live.g - t) < 0.45);
    live.g -= dt * (near && !reduce ? 0.4 : 1);
    while (live.i < F.length - 1 && F[live.i + 1].t >= live.g) live.i++;
    const fr = F[live.i];
    court.draw(fr, { debug: debugOn });
    while (live.shown < res.events.length && res.events[live.shown].t >= live.g) {
      const e = res.events[live.shown++];
      if (!e.quiet) pop(e.text);
      if (/Good$/.test(e.text)) live.us = SC.us + res.shot.points;
      if (e.text === 'They answered') live.them = res.them;
    }
    setScore(live.us, live.them, Math.max(0, fr.t));
    if (live.i >= F.length - 1 && live.shown >= res.events.length) { setTimeout(() => showResult(res), 650); return; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function pop(text) {
  const el = $('pop'); el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

/* ---------- the result ---------- */
function showResult(res) {
  setScore(res.us, res.them, res.shotAt != null ? res.shotAt : 0);
  const win = res.outcome === 'win';
  const when = res.shotAt != null ? 'Shot went up with ' + res.shotAt.toFixed(1) + ' left.' : 'No shot.';
  const c = $('card');
  c.innerHTML = '';
  const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; c.appendChild(e); return e; };
  add('h2', 'verdict ' + (win ? 'win' : 'lose'), win ? 'WINNER' : 'LOSE');
  add('div', 'final', res.us + '-' + res.them);
  add('p', 'facts', when + ' Their call on screens: ' + res.schemeName + '.');
  add('p', 'reason', res.reason);
  const row = add('div', 'row');
  const btn = (label, cls, fn, id) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; if (id) b.id = id; b.addEventListener('click', fn); row.appendChild(b); return b; };
  btn('Replay', 'go', () => run(freshSeed()), 'bReplay');
  btn('Back to Clipboard', 'alt', backToBoard, 'bBack');
  const row2 = add('div', 'row');
  const share = document.createElement('button'); share.className = 'btn alt'; share.id = 'bShare'; share.textContent = 'Share';
  share.addEventListener('click', () => doShare(shareText(play, res), share)); row2.appendChild(share);
  const dbg = document.createElement('button'); dbg.className = 'link'; dbg.id = 'bSeed'; dbg.textContent = debugOn ? 'Hide seed' : 'Seed';
  row2.appendChild(dbg);
  const pre = add('div', 'dbg'); pre.id = 'seedBox'; pre.hidden = !debugOn;
  pre.textContent = 'seed ' + res.seed + '\nscheme ' + res.scheme + '\nshot ' + JSON.stringify(res.shot) + '\nanswer ' + JSON.stringify(res.answer) + '\nplay ' + playKey(play);
  dbg.addEventListener('click', () => { debugOn = !debugOn; pre.hidden = !debugOn; dbg.textContent = debugOn ? 'Hide seed' : 'Seed'; });
  $('sheet').classList.add('on');
}

function backToBoard() {
  live = null;
  $('sheet').classList.remove('on');
  $('court').hidden = true; $('board').hidden = false;
  $('tools').style.visibility = ''; $('actions').style.visibility = '';
  setScore(SC.us, SC.them, SC.clock);
  board.draw();
}

async function doShare(text, btn) {
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch (e) { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = 'Share'; }, 1600);
}

/* For the browser check: run a play with a fixed seed and read the result. */
window.__lastShot = { run, get result() { return lastResult; }, get play() { return play; }, setPlay(p) { play = p; board.draw(); } };

setScore(SC.us, SC.them, SC.clock);
board.draw();
$('hint').textContent = defaultHint();
