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
import { SCENARIO as SC, isZone } from './scenario.js';
import { simulate } from './sim.js';
import { IDS, emptyPlay, problems, playKey, scenarioFor, previewOf, framesOf, GO_AT_MIN } from './playbook.js';
import { createBoard } from './board.js';
import { mountBooks } from './book-ui.js';
import { createCourt, between, warm } from './court.js';
import { shareText } from './share.js';
import { freshSeed } from './rng.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);
const KEY = 'last_shot_play_v1', SPEED_KEY = 'last_shot_speed';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

let play = loadPlay();
let hintTimer = null, lastResult = null, live = null, debugOn = false;
/* playback speed (1 or 2, remembered), a pause for the browser check, and
   whether anything has run yet (the starter's Run It pulses until then) */
let speed = lsGet(SPEED_KEY) === '2' ? 2 : 1, paused = false, ranOnce = false, lastTiming = null;
const sound = createSound();
/* The AudioContext waits for a gesture: the first touch anywhere makes it. */
document.addEventListener('pointerdown', () => sound.unlock(), { passive: true });
/* 'game' (the scenario) or 'edit' (a playbook play: { book, entry }) */
let mode = 'game', edit = null;
/* The scenario this play runs in: the game's, or the play's own situation. */
const SCX = () => (mode === 'edit' && edit ? scenarioFor(SC, edit.entry.situation) : SC);

function loadPlay() {
  const raw = lsGet(KEY);
  /* FIRST RUN: nothing saved yet, so the clipboard opens with a play already
     on it (a pin-down for O2, holding till 6.0) and Run It pulses. No popup. */
  if (raw == null) return starterPlay();
  try {
    const p = JSON.parse(raw);
    if (p && p.spots && Array.isArray(p.steps) && Object.keys(p.spots).length === 5) return p;
  } catch (e) {}
  return emptyPlay(SC);
}
function starterPlay() {
  return { spots: JSON.parse(JSON.stringify(SC.spots)), goAt: 6, steps: [
    { kind: 'screen', who: 'O5', pts: [{ x: 35, y: 10.5 }], beat: 1 },
    { kind: 'move', who: 'O2', pts: [{ x: 33.5, y: 9 }, { x: 38, y: 14 }, { x: 43, y: 23 }], beat: 1 },
    { kind: 'pass', from: 'O1', to: 'O2', beat: 1 },
    { kind: 'shoot', who: 'O2', beat: 1 }] };
}
const STARTER = playKey(starterPlay());

const ui = {
  hint(t) {
    $('hint').textContent = t || '';
    clearTimeout(hintTimer);
    if (t) hintTimer = setTimeout(() => { $('hint').textContent = defaultHint(); }, 2600);
  },
  changed(p, f) {
    $('bRun').disabled = problems(SCX(), p).length > 0;
    $('bRun').classList.toggle('pulse', mode === 'game' && !ranOnce && playKey(p) === STARTER);
    goSync(p);
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

function savePlay(p) {
  play = p;
  if (mode === 'edit' && edit) books.playChanged(edit, p);
  else lsSet(KEY, JSON.stringify(p));
}
const board = createBoard($('board'), SC, () => play, savePlay, ui);

/* ---------- Go at ----------
   When the play starts, in 0.5 steps from 1.0 up to the clock. Stored on the
   play (play.goAt), so it rides into a playbook with the rest of it. A play
   with no goAt goes at once, and shows as the clock. */
const goOf = p => { const c = SCX().clock, g = Number(p && p.goAt); return Number.isFinite(g) ? Math.max(GO_AT_MIN, Math.min(c, g)) : c; };
function goSync(p) {
  const c = SCX().clock, g = goOf(p);
  $('goChip').textContent = 'Go at ' + g.toFixed(1);
  $('goLab').textContent = g < c ? 'Hold till ' + g.toFixed(1) : 'Go at once';
  $('goMinus').disabled = g <= GO_AT_MIN; $('goPlus').disabled = g >= c;
}
function goStep(d) {
  const c = SCX().clock, g = goOf(play);
  const n = Math.round(Math.max(GO_AT_MIN, Math.min(c, Math.round((g + d) * 2) / 2)) * 10) / 10;
  const p = JSON.parse(JSON.stringify(play)); p.goAt = n;
  savePlay(p); board.draw();
}
$('goMinus').addEventListener('click', () => goStep(-0.5));
$('goPlus').addEventListener('click', () => goStep(0.5));

/* ---------- speed and sound ---------- */
function speedSync() { const b = $('bSpeed'); b.textContent = speed + 'x'; b.setAttribute('aria-pressed', String(speed === 2)); }
$('bSpeed').addEventListener('click', () => { speed = speed === 2 ? 1 : 2; lsSet(SPEED_KEY, String(speed)); speedSync(); });
function muteSync() { const b = $('bMute'); b.setAttribute('aria-pressed', String(sound.muted)); b.classList.toggle('off', sound.muted); b.setAttribute('aria-label', sound.muted ? 'Sound off' : 'Sound on'); }
$('bMute').addEventListener('click', () => { sound.setMuted(!sound.muted); muteSync(); });
speedSync(); muteSync();
/* Tools off the screen while a play runs (a visibility, so nothing jumps). */
function clipTools(on) { for (const id of ['tools', 'actions', 'goRow']) $(id).style.visibility = on ? '' : 'hidden'; }
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
  clipTools(false);
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
  const a = $('sUs'), b = $('sThem'), c = $('clock'), t = clock.toFixed(1);
  if (a.textContent !== String(us)) a.textContent = us;
  if (b.textContent !== String(them)) b.textContent = them;
  if (c.textContent !== t) c.textContent = t;
}
/* Points landing: the number flips (nothing moves with reduced motion). */
function flip(id) { const el = $(id); el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

/* Where playback slows, in game seconds (the clock runs down, so a is the
   later time and b the earlier): every pass in the air, the shot from just
   after the release (deepest right at the release), and a beat around each
   screen. */
function slowWindows(res) {
  const F = res.frames, out = [];
  let a = null;
  for (let i = 0; i < F.length; i++) {
    const inAir = !F[i].h && F[i].sk == null && i < F.length - 1;
    if (inAir && a == null) a = F[i].t;
    if (!inAir && a != null) { out.push({ a: a + 0.25, b: F[i].t - 0.12, rate: 0.5 }); a = null; }
  }
  const s = F.find(f => f.sk != null);
  if (s) { out.push({ a: s.t + 0.2, b: -1, rate: 0.5 }); out.push({ a: s.t + 0.04, b: s.t - 0.24, rate: 0.28 }); }
  for (const e of res.events) if (e.slow && !e.shot && !e.final) out.push({ a: e.t + 0.25, b: e.t - 0.25, rate: 0.7 });
  return out;
}

/* Dead time runs at DEAD times speed: the frames before anybody moves, and
   the ball playing out once the outcome is plain. */
const DEAD = 4;
function firstActionT(F) {
  const a = F[0];
  for (let i = 1; i < F.length; i++) {
    const f = F[i];
    if (f.h !== a.h || f.sk != null || f.o.some((v, k) => Math.abs(v - a.o[k]) > 0.25)) return f.t + 0.15;
  }
  return a.t;
}

/* THE HOLD (Go at). The sim starts at goAt and frames[0] is everyone on
   their spots, so the hold is that frame played back fast: the clock races
   from the start down to goAt while the handler dribbles in place. w is wall
   seconds into the hold. */
const HOLD_BOUNCE = 2.5;   // the dribble runs this much faster than the rig's own pace
function holdFrame(f0, w) {
  const t = w * HOLD_BOUNCE, ph = (t * 7 / 4) % 1, u = Math.abs(2 * ph - 1);
  const k = f0.k.slice(), hi = f0.h ? IDS.indexOf(f0.h) : -1;
  if (hi >= 0) k[hi] = 3;
  return Object.assign({}, f0, { t, k, b: hi >= 0 ? [f0.b[0], f0.b[1], 3.1 * (1 - (1 - u) * (1 - u))] : f0.b });
}
const holdWallOf = s => (s > 0.05 ? 0.6 + 0.3 * Math.min(1, s / 16) : 0);

const AFTER = 1.15;   // seconds of the ball playing out at the rim
/* The answer cutaway, in wall seconds at 1x: their clock runs, the shot is
   up, then it plays out with the word on it. */
const CUT = { run: 1.1, fly: 0.85, out: 0.9 };

/* The shot readout: the caption's own word, then the make chance. */
const readout = e => (e.p != null ? e.text + ' · ' + Math.round(e.p * 100) + '%' : e.text);

function run(seed, opt) {
  const tap = performance.now();
  sound.unlock();
  const S = SCX();
  const res = simulate(S, play, seed, opt || {});
  lastResult = res; ranOnce = true; lastTiming = null;
  if (mode === 'edit' && edit) books.countRun(edit, res);
  $('board').hidden = true; $('court').hidden = false;
  clipTools(false);
  $('sheet').classList.remove('on'); $('hint').textContent = '';
  banner(null); cutUi(null);
  const reduce = reduced();
  const F = res.frames, last = F[F.length - 1];
  const slows = reduce ? [] : slowWindows(res);
  const rateAt = g => slows.reduce((r, w) => g <= w.a && g >= w.b ? Math.min(r, w.rate) : r, 1);
  const shotEnds = !!res.shot && last.sk != null;
  const start = res.startClock != null ? res.startClock : S.clock, go = F[0].t;
  const holdGame = Math.max(0, start - go), holdWall = holdWallOf(holdGame);
  const actT = firstActionT(F);
  const answer = res.answer && res.answer.at != null && res.answer.startAt != null ? res.answer : null;
  live = { res, i: 0, g: go, shown: 0, us: S.us, them: S.them, rate: 1, phase: holdWall ? 'hold' : 'beat', w: 0, ph: 0,
    after: null, spin: 0, cut: null, winner: false, tap };
  caps.q = []; caps.until = 0; $('pop').classList.remove('on', 'final', 'shot');
  setScore(S.us, S.them, start);
  let prev = performance.now();

  function toEnd() {
    live.phase = 'end'; live.w = 0;
    $('clock').classList.remove('them'); $('stage').classList.remove('slow');
    sound.buzzer();
    if (res.outcome === 'win') { if (!live.winner) { sound.crowd(); buzz([40, 50, 40, 50, 140]); } }
    else sound.groan();
  }
  function startCut() {
    live.phase = 'cut'; live.cut = { w: 0, said: false };
    caps.q = []; $('pop').classList.remove('on');
    cutUi(answer); $('clock').classList.add('them');
  }
  live.skip = () => {
    if (!live.cut || live.phase !== 'cut') return;
    if (!live.cut.said) say();
    toEnd(); live.w = 0.3;
  };
  function say() {
    live.cut.said = true;
    cutVerdict(answer.scored);
    if (answer.scored) { live.them = res.them; flip('sThem'); sound.swish(); }
    else sound.rim();
  }

  function tick(now) {
    if (!live || live.res !== res) return;
    const raw = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (paused) { requestAnimationFrame(tick); return; }
    const dt = raw * speed;
    let fr = F[0], clock = go;
    if (live.phase === 'beat') {
      // a beat to see the floor before it moves
      live.w += dt; clock = start;
      if (live.w >= (reduce ? 0.15 : 0.3)) { live.phase = 'play'; live.w = 0; }
    } else if (live.phase === 'hold') {
      live.w += raw * (speed > 1 ? 1.5 : 1);
      const u = Math.min(1, live.w / holdWall);
      clock = start - holdGame * (1 - (1 - u) * (1 - u));
      fr = holdFrame(F[0], live.w);
      const ph = (live.w * HOLD_BOUNCE * 7 / 4) % 1;
      if (live.ph < 0.5 && ph >= 0.5) sound.tick();
      live.ph = ph;
      if (u >= 1) { live.phase = 'play'; live.w = 0; clock = go; pop('Go'); caps.until = now + 450; }
    } else if (live.phase === 'play') {
      // ease in and out of the slow parts rather than lurching
      const target = rateAt(live.g) * (live.g > actT ? DEAD : 1);
      live.rate += (target - live.rate) * Math.min(1, raw * 9);
      live.g -= dt * live.rate;
      while (live.i < F.length - 1 && F[live.i + 1].t >= live.g) live.i++;
      const a = F[live.i], b = F[live.i + 1];
      const u = b && a.t > b.t ? Math.max(0, Math.min(1, (a.t - live.g) / (a.t - b.t))) : 0;
      fr = b ? between(a, b, u) : a; clock = fr.t;
      $('stage').classList.toggle('slow', !reduce && live.rate < 0.5 && fr.sk != null);
      if (live.i >= F.length - 1) {
        live.phase = 'after'; live.after = { t: 0, made: res.shot ? res.shot.made : false, seed: res.seed };
        $('stage').classList.remove('slow');
        if (res.shot && !res.shot.made) sound.rim();
      }
    } else if (live.phase === 'after' || (live.phase === 'end' && !live.cut)) {
      // the first beat at the rim at speed, then the rest is dead time
      if (live.after) live.after.t += dt * (live.after.t > 0.6 ? DEAD : 1);
      fr = last; clock = last.t;
    }
    if (live.phase === 'cut' || (live.phase === 'end' && live.cut)) {
      const c = live.cut, A = answer, T1 = CUT.run, T2 = T1 + CUT.fly, T3 = T2 + CUT.out;
      if (live.phase === 'cut') c.w += dt;
      clock = c.w < T1 ? A.startAt - (A.startAt - A.at) * (c.w / T1) : A.at;
      court.drawAnswer({ kind: A.kind, seed: res.seed, k: c.w < T1 ? 0 : Math.min(1, (c.w - T1) / CUT.fly), after: c.w >= T2 ? { t: Math.min(c.w - T2, 1.2), made: A.scored, seed: res.seed >>> 3 } : null });
      if (live.phase === 'cut' && c.w >= T2 && !c.said) say();
      if (live.phase === 'cut' && c.w >= T3) toEnd();
    } else {
      if (!fr.h) live.spin += dt * 9;
      court.draw(fr, { debug: debugOn, after: live.after && shotEnds ? live.after : null, spin: live.spin });
    }
    if (live.phase === 'play' || live.phase === 'after') {
      while (live.shown < res.events.length && (res.events[live.shown].t >= live.g || live.phase === 'after')) {
        const e = res.events[live.shown++];
        if (e.shot) { caption(Object.assign({}, e, { text: readout(e) })); buzz(15); continue; }
        if (e.final && answer) continue;   // the cutaway says how it ended
        if (!e.quiet) caption(e);
        if (/Good$/.test(e.text)) {
          live.us = S.us + res.shot.points; flip('sUs'); sound.swish();
          if (res.how === 'make' && res.outcome === 'win') { live.winner = true; banner('GAME WINNER'); sound.crowd(); buzz([40, 50, 40, 50, 140]); }
        }
        if (e.text === 'They answered') live.them = res.them;
      }
    }
    pumpCaptions(now);
    setScore(live.us, live.them, Math.max(0, clock));
    if (live.phase === 'after') {
      const played = live.after.t >= (shotEnds ? AFTER : 0.4);
      if (played && !caps.q.length) { if (answer) startCut(); else toEnd(); }
    } else if (live.phase === 'end') {
      live.w += raw;
      const wait = (live.winner ? 1.3 : 0.5) / (speed > 1 ? 1.5 : 1);
      if (live.w >= wait) { lastTiming = performance.now() - live.tap; showResult(res); return; }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* The big word over the court (GAME WINNER), or none. */
function banner(text) {
  const el = $('big');
  el.classList.remove('on');
  el.hidden = !text;
  if (text) { el.textContent = text; void el.offsetWidth; el.classList.add('on'); }
}
/* The answer cutaway's words: their ball and the time they got, then how it went. */
function cutUi(A) {
  const el = $('cut');
  el.hidden = !A;
  if (!A) return;
  $('cutHead').textContent = 'Their ball, ' + A.startAt.toFixed(1) + ' left';
  const v = $('cutV'); v.textContent = ''; v.className = 'cutv'; $('cutSub').textContent = '';
}
function cutVerdict(scored) {
  const v = $('cutV');
  v.className = 'cutv on ' + (scored ? 'good' : 'miss');
  v.textContent = scored ? 'GOOD' : 'They missed. You win';
  $('cutSub').textContent = scored ? 'They answered.' : '';
}

/* CAPTIONS, ONE AT A TIME. Each stays up long enough to read on a phone; a
   backlog drops its oldest middle line rather than stacking, and the last
   word (final) always shows. At 2x they stay up a little less. */
const caps = { q: [], until: 0 };
function caption(e) {
  caps.q.push(e);
  while (caps.q.length > 2) { const i = caps.q.findIndex(c => !c.final && !c.shot); if (i < 0) break; caps.q.splice(i, 1); }
}
function pumpCaptions(now) {
  if (now < caps.until || !caps.q.length) return;
  const e = caps.q.shift();
  pop(e.text, e.final, e.shot);
  caps.until = now + (e.final ? 1300 : e.shot ? 1100 : 950) / (speed > 1 ? 1.4 : 1);
}

function pop(text, final, shot) {
  const el = $('pop'); el.textContent = text; el.classList.remove('on', 'shot'); el.classList.toggle('final', !!final);
  if (shot) el.classList.add('shot');
  void el.offsetWidth; el.classList.add('on');
}

/* ---------- the result ---------- */
function showResult(res) {
  banner(null); cutUi(null);
  setScore(res.us, res.them, res.shotAt != null ? res.shotAt : 0);
  const win = res.outcome === 'win';
  const when = res.shotAt != null ? 'Shot went up with ' + res.shotAt.toFixed(1) + ' left.' : 'No shot.';
  const c = $('card');
  c.innerHTML = '';
  const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; c.appendChild(e); return e; };
  add('h2', 'verdict ' + (win ? 'win' : 'lose'), win ? 'WINNER' : 'LOSE');
  add('div', 'finalscore', res.us + '-' + res.them);
  add('p', 'facts', when + (isZone(res.scheme) ? ' Their defense: ' : ' Their call on screens: ') + res.schemeName + '.');
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
  banner(null); cutUi(null); $('clock').classList.remove('them'); $('stage').classList.remove('slow');
  $('court').hidden = true; $('board').hidden = false;
  clipTools(true);
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
  /* the feel: tap to result in ms, the live phase, a pause for screenshots, the sound's state */
  get timing() { return lastTiming; }, get phase() { return live ? live.phase || 'preview' : null; }, set paused(v) { paused = !!v; }, get speed() { return speed; },
  get sound() { return { muted: sound.muted, state: sound.state }; }, starter: starterPlay,
  view: () => board.view(), get board() { return board; }, get mode() { return mode; }, get edit() { return edit; }, books,
  simulate: (seed, opt) => { const r = simulate(SCX(), play, seed, opt || {}); return { outcome: r.outcome, reason: r.reason, shotAt: r.shotAt, scheme: r.scheme, how: r.how, answer: r.answer }; } };
$('cut').addEventListener('pointerdown', () => { if (live && live.skip) live.skip(); });

setScore(SC.us, SC.them, SC.clock);
show('vHome');
board.reset();
$('hint').textContent = defaultHint();
/* Trace the players in the background while the coach draws (court.js). */
warm();
