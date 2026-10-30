/* The page: home, then the clipboard, the live play and the result. It holds
 * no rules; the sim decides everything and this only shows it.
 *
 * TWO WAYS IN (home): Play the scenario (the game, down 1 with 22.0), and My
 * Playbooks (book-ui.js). A playbook play opens on this same clipboard in
 * EDIT mode: its own situation (clock, who has the ball), its name and notes
 * above, edits saved as they happen, and every watched run counted against
 * the scheme the sim used.
 *
 * Who is signed in comes from the arcade's sign in (/arcade/auth.js,
 * window.RTG_AUTH), loaded by web/play.html as the Arcade Lab shell does.
 *
 * ACCOUNT PLUG POINTS still out of scope:
 *   TODO(results): save a finished possession (seed, play, outcome) through a
 *     gated API like /api/arcade/*, replayed on the server by sim.js.
 *   TODO(trophies, streaks, leaderboards): once results are saved; a daily
 *     scenario would take a dated seed and a board like RTG_BOARD's. */
import { SCENARIO as SC } from './scenario.js';
import { simulate } from './sim.js';
import { emptyPlay, problems, playKey, scenarioFor, previewOf, framesOf } from './playbook.js';
import { createBoard } from './board.js';
import { mountBooks } from './book-ui.js';
import { createCourt, between, warm } from './court.js';
import { shareText } from './share.js';
import { freshSeed } from './rng.js';

const $ = id => document.getElementById(id);
const KEY = 'last_shot_play_v1';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

let play = loadPlay();
let hintTimer = null, lastResult = null, live = null, debugOn = false;
/* 'game' (the scenario) or 'edit' (a playbook play: { book, entry }) */
let mode = 'game', edit = null;
/* The scenario this play runs in: the game's, or the play's own situation. */
const SCX = () => (mode === 'edit' && edit ? scenarioFor(SC, edit.entry.situation) : SC);

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
  changed(p, f) {
    $('bRun').disabled = problems(SCX(), p).length > 0;
    $('bUndo').disabled = !p.steps.length && !(f && f.beat > 1);
    $('bClear').disabled = !p.steps.length;
    if (f) frameStrip(p, f);
    if (!hintTimer || !$('hint').textContent) $('hint').textContent = defaultHint();
  },
  scenario: () => SCX()
};
function defaultHint() {
  if (!board) return '';
  if (!play.steps.length && !board.tool) return 'Drag players to set the floor. Then pick a tool.';
  if (!problems(SCX(), play).length) return 'Ready. Run It.';
  return board.tool ? '' : 'Pick a tool.';
}

const board = createBoard($('board'), SC, () => play, p => {
  play = p;
  if (mode === 'edit' && edit) books.playChanged(edit, p);
  else lsSet(KEY, JSON.stringify(p));
}, ui);
const court = createCourt($('court'));

document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
  const t = board.setTool(b.dataset.tool);
  document.querySelectorAll('.tool').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.tool === t)));
  ui.hint({ move: 'Drag from a player to draw his route.', screen: 'Drag from a player. He sets a screen at the end.', pass: 'Tap the man with the ball, then a teammate.', shoot: 'Tap the man with the ball to shoot.' }[t] || '');
}));
$('bUndo').addEventListener('click', () => board.undo());
$('bClear').addEventListener('click', () => board.clear());
$('bRun').addEventListener('click', () => run(freshSeed()));
$('bFrame').addEventListener('click', () => playFrame());
$('bNext').addEventListener('click', () => { if (board.nextFrame()) ui.hint('Frame ' + board.beat + '. Everyone starts where the last frame ended.'); });

/* ---------- the storyboard strip ---------- */
function frameStrip(p, f) {
  const box = $('frames');
  const fr = framesOf(p, f.frames);
  box.innerHTML = '';
  fr.forEach((steps, i) => {
    const b = document.createElement('button');
    b.className = 'fr' + (i + 1 === f.beat ? ' on' : '');
    b.dataset.beat = String(i + 1);
    b.setAttribute('aria-label', 'Frame ' + (i + 1) + (steps.length ? '' : ', empty'));
    b.innerHTML = '<b>' + (i + 1) + '</b><small>' + (steps.length ? steps.length + (steps.length === 1 ? ' step' : ' steps') : 'empty') + '</small>';
    b.addEventListener('click', () => board.setBeat(i + 1));
    box.appendChild(b);
  });
  $('bFrame').disabled = !(fr[f.beat - 1] && fr[f.beat - 1].some(k => p.steps[k].kind !== 'shoot'));
  if (edit && edit.syncFrameNote) edit.syncFrameNote();
}

/* Play frame: the frame on show, on the court, from where it starts. No shot,
   no clock that counts, then back to the clipboard. */
function playFrame() {
  const pv = previewOf(SCX(), play, board.beat);
  if (!pv.play.steps.length) return;
  const res = simulate(pv.sc, pv.play, freshSeed(), { preview: true });
  $('board').hidden = true; $('court').hidden = false;
  $('tools').style.visibility = 'hidden'; $('actions').style.visibility = 'hidden';
  const F = res.frames, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let g = F[0].t, i = 0, prev = performance.now(), hold = reduce ? 0 : 0.3, after = 0.5;
  const token = live = { preview: true, res };
  function tick(now) {
    if (live !== token) return;
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (hold > 0) hold -= dt; else g -= dt * (reduce ? 4 : 1);
    while (i < F.length - 1 && F[i + 1].t >= g) i++;
    const a = F[i], b = F[i + 1];
    const u = b && a.t > b.t ? Math.max(0, Math.min(1, (a.t - g) / (a.t - b.t))) : 0;
    court.draw(b ? between(a, b, u) : a, { debug: debugOn });
    if (i >= F.length - 1) { after -= dt; if (after <= 0) { backToBoard(); return; } }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
window.addEventListener('resize', () => { if (live) court.draw(live.res.frames[live.i]); else board.draw(); });

/* ---------- the live play ---------- */
function setScore(us, them, clock) {
  $('sUs').textContent = us; $('sThem').textContent = them; $('clock').textContent = clock.toFixed(1);
}

/* Where playback slows, in game seconds (the clock runs down, so a is the
   later time and b the earlier): every pass in the air, the shot from just
   after the release, and a beat around each screen. */
function slowWindows(res) {
  const F = res.frames, out = [];
  let a = null;
  for (let i = 0; i < F.length; i++) {
    const inAir = !F[i].h && F[i].sk == null && i < F.length - 1;
    if (inAir && a == null) a = F[i].t;
    if (!inAir && a != null) { out.push({ a: a + 0.25, b: F[i].t - 0.12, rate: 0.4 }); a = null; }
  }
  const s = F.find(f => f.sk != null);
  if (s) out.push({ a: s.t + 0.2, b: -1, rate: 0.45 });
  for (const e of res.events) if (e.slow && !e.shot && !e.final) out.push({ a: e.t + 0.3, b: e.t - 0.3, rate: 0.6 });
  return out;
}

const AFTER = 1.15;   // seconds of the ball playing out at the rim

function run(seed, opt) {
  const S = SCX();
  const res = simulate(S, play, seed, opt || {});
  lastResult = res;
  if (mode === 'edit' && edit) books.countRun(edit, res);
  $('board').hidden = true; $('court').hidden = false;
  $('tools').style.visibility = 'hidden'; $('actions').style.visibility = 'hidden';
  $('sheet').classList.remove('on'); $('hint').textContent = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const F = res.frames, last = F[F.length - 1];
  const slows = reduce ? [] : slowWindows(res);
  const rateAt = g => slows.reduce((r, w) => g <= w.a && g >= w.b ? Math.min(r, w.rate) : r, 1);
  const shotEnds = !!res.shot && last.sk != null;
  live = { res, i: 0, g: S.clock, shown: 0, us: S.us, them: S.them, rate: 1, hold: 0.45, after: null, spin: 0, done: false };
  caps.q = []; caps.until = 0; $('pop').classList.remove('on', 'final');
  setScore(S.us, S.them, S.clock);
  let prev = performance.now();
  function tick(now) {
    if (!live || live.res !== res) return;
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    let fr;
    if (live.hold > 0) { live.hold -= dt; fr = F[0]; }   // a beat to see the floor before it moves
    else if (!live.after) {
      // ease in and out of the slow parts rather than lurching
      live.rate += (rateAt(live.g) - live.rate) * Math.min(1, dt * 9);
      live.g -= dt * live.rate;
      while (live.i < F.length - 1 && F[live.i + 1].t >= live.g) live.i++;
      const a = F[live.i], b = F[live.i + 1];
      const u = b && a.t > b.t ? Math.max(0, Math.min(1, (a.t - live.g) / (a.t - b.t))) : 0;
      fr = b ? between(a, b, u) : a;
      if (live.i >= F.length - 1) live.after = { t: 0, made: res.shot ? res.shot.made : false, seed: res.seed };
    } else { live.after.t += dt; fr = last; }
    if (!fr.h) live.spin += dt * 9;
    court.draw(fr, { debug: debugOn, after: live.after && shotEnds ? live.after : null, spin: live.spin });
    while (live.shown < res.events.length && (res.events[live.shown].t >= live.g || live.after)) {
      const e = res.events[live.shown++];
      if (!e.quiet) caption(e);
      if (/Good$/.test(e.text)) live.us = S.us + res.shot.points;
      if (e.text === 'They answered') live.them = res.them;
    }
    pumpCaptions(now);
    setScore(live.us, live.them, Math.max(0, fr.t));
    const played = live.after && live.after.t >= (shotEnds ? AFTER : 0.4);
    if (played && !caps.q.length && !live.done) { live.done = true; setTimeout(() => { if (live && live.res === res) showResult(res); }, 700); return; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* CAPTIONS, ONE AT A TIME. Each stays up long enough to read on a phone; a
   backlog drops its oldest middle line rather than stacking, and the last
   word (final) always shows. */
const caps = { q: [], until: 0 };
function caption(e) {
  caps.q.push(e);
  while (caps.q.length > 2) { const i = caps.q.findIndex(c => !c.final); if (i < 0) break; caps.q.splice(i, 1); }
}
function pumpCaptions(now) {
  if (now < caps.until || !caps.q.length) return;
  const e = caps.q.shift();
  pop(e.text, e.final);
  caps.until = now + (e.final ? 1300 : 950);
}

function pop(text, final) {
  const el = $('pop'); el.textContent = text; el.classList.remove('on'); el.classList.toggle('final', !!final); void el.offsetWidth; el.classList.add('on');
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
  add('div', 'finalscore', res.us + '-' + res.them);
  add('p', 'facts', when + ' Their call on screens: ' + res.schemeName + '.');
  add('p', 'reason', res.reason);
  const row = add('div', 'row');
  const btn = (label, cls, fn, id) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; if (id) b.id = id; b.addEventListener('click', fn); row.appendChild(b); return b; };
  btn('Replay', 'go', () => run(freshSeed(), lastOpt), 'bReplay');
  btn('Back to Clipboard', 'alt', backToBoard, 'bBack');
  if (mode === 'edit') btn('Back to playbook', 'alt', () => { backToBoard(); books.showBook(edit.book.id); }, 'bBackBook');
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
  const S = SCX();
  setScore(S.us, S.them, S.clock);
  board.draw();
}

/* ---------- the screens ---------- */
let lastOpt = {};
const VIEWS = ['vHome', 'vGame', 'vBooks'];
function show(v) {
  for (const id of VIEWS) $(id).hidden = id !== v;
  $('back').dataset.to = v === 'vHome' ? 'arcade' : v === 'vGame' && mode === 'edit' ? 'book' : v === 'vBooks' ? 'books' : 'home';
  if (v === 'vGame') requestAnimationFrame(() => board.draw());
  window.scrollTo(0, 0);
}
$('back').addEventListener('click', e => {
  const to = $('back').dataset.to;
  if (to === 'arcade') return;
  e.preventDefault();
  if (live) backToBoard();
  if (to === 'book' && edit) books.showBook(edit.book.id);
  else if (to === 'books' && books.back()) return;
  else goHome();
});
function goHome() { mode = 'game'; edit = null; $('editBar').hidden = true; show('vHome'); }

/* Play the scenario: the game, as it always was. */
function openGame() {
  mode = 'game'; edit = null; $('editBar').hidden = true;
  play = loadPlay(); lastOpt = {};
  show('vGame'); backToBoard(); board.reset();
}

/* A playbook play on the clipboard (book-ui.js calls this). */
function openPlay(book, entry) {
  mode = 'edit'; edit = { book, entry };
  play = JSON.parse(JSON.stringify(entry.play)); lastOpt = {};
  $('editBar').hidden = false;
  books.fillEditBar(edit);
  show('vGame'); backToBoard(); board.reset();
}

const books = mountBooks({
  sc: SC, show, openPlay, goHome,
  /* run the play on show against a chosen scheme (or a random one) */
  runAgainst(scheme) { lastOpt = scheme ? { scheme } : {}; run(freshSeed(), lastOpt); },
  currentPlay: () => play,
  redraw: () => backToBoard()
});
$('hPlay').addEventListener('click', openGame);
$('hBooks').addEventListener('click', () => books.open());
$('hHow').addEventListener('click', () => $('howSheet').classList.add('on'));
$('howClose').addEventListener('click', () => $('howSheet').classList.remove('on'));

async function doShare(text, btn) {
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch (e) { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = 'Share'; }, 1600);
}

/* For the browser check: run a play with a fixed seed and read the result. */
window.__lastShot = { run, get result() { return lastResult; }, get play() { return play; }, setPlay(p) { play = p; board.reset(); },
  view: () => board.view(), get board() { return board; }, get mode() { return mode; }, get edit() { return edit; }, books,
  simulate: (seed, opt) => { const r = simulate(SCX(), play, seed, opt || {}); return { outcome: r.outcome, reason: r.reason, shotAt: r.shotAt, scheme: r.scheme }; } };

setScore(SC.us, SC.them, SC.clock);
show('vHome');
board.reset();
$('hint').textContent = defaultHint();
/* Trace the players in the background while the coach draws (court.js). */
warm();
