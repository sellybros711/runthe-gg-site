/* The page: home, then the clipboard, the live play and the result. It holds
 * no rules; the sim decides everything and this only shows it.
 *
 * FOUR WAYS IN (home): the Daily Last Shot (daily.js, daily-ui.js: one
 * situation a day, practice on random seeds as much as you like, then one
 * scored run on the day's seed that the Arcade Lab's daily service files,
 * ranks and pays gems for), Play the scenario (the game, down 1 with 22.0),
 * the Ladder (levels.js, ladder-ui.js: a level opens on this same clipboard in
 * LEVEL mode, with its own scenario, its forced scheme, its own saved play and
 * a result card with stars), and My Playbooks (book-ui.js). A playbook play opens on this same clipboard in
 * EDIT mode: its own situation (clock, who has the ball), its name and notes
 * above, edits saved as they happen, and every watched run counted against
 * the scheme the sim used.
 *
 * BEAT MY PLAY (challenge.js, beat-ui.js): every result card but a
 * playbook's makes a link with the run's situation, seed and play. Opening
 * one (#beat=) is BEAT mode: their result worked out from their play, Watch
 * their play, and the clipboard on their spot with the same seed and scheme.
 *
 * Who is signed in comes from the arcade's sign in (/arcade/auth.js,
 * window.RTG_AUTH), loaded by web/play.html as the Arcade Lab shell does.
 *
 * ACCOUNT PLUG POINTS still out of scope:
 *   TODO(results): save a free play or ladder possession through a gated API,
 *     the way the daily's run is filed (daily-ui.js). */
import { SCENARIO as SC, isZone } from './scenario.js';
import { simulate } from './sim.js';
import { IDS, emptyPlay, problems, playKey, scenarioFor, previewOf, framesOf, GO_AT_MIN, GO_AT_NEW } from './playbook.js';
import { LEVELS, levelById, levelScenario, levelOpt, starsOf } from './levels.js';
import { loadLadder, saveLadder, renderLadder, isOpen, nextOf, starsIn, maxStars, clockLine, scoutLine, starText, cleanPlay as cleanStored } from './ladder-ui.js';
import { dailyScenario, scoreOf, cleanPlay as filePlay } from './daily.js';
import { challengeOpt, beats } from './challenge.js';
import * as D from './daily-ui.js';
import { readHash, clearHash, openChallenge, beatLink, shareBeat, theirLine, sitLine, scoutOf, renderChallenge, renderBadLink } from './beat-ui.js';
import { adder, verdictBlock, checklist, factsOf, summaryOf, scoreLineOf } from './cards.js';
import { createBoard } from './board.js';
import { mountBooks } from './book-ui.js';
import { createCourt, between, warm } from './court.js';
import { shareText, dailyShareText } from './share.js';
import { freshSeed } from './rng.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);
const KEY = 'last_shot_play_v1', SPEED_KEY = 'last_shot_speed';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

let play = loadPlay();
let hintTimer = null, lastResult = null, live = null, debugOn = false, runPlay = null;
/* playback speed (1 or 2, remembered), a pause for the browser check, and
   whether anything has run yet (the starter's Run It pulses until then) */
let speed = lsGet(SPEED_KEY) === '2' ? 2 : 1, paused = false, ranOnce = false, lastTiming = null;
const sound = createSound();
/* The AudioContext waits for a gesture: the first touch anywhere makes it. */
document.addEventListener('pointerdown', () => sound.unlock(), { passive: true });
/* 'game' (the scenario), 'edit' (a playbook play: { book, entry }),
   'level' (a ladder level: lvl = { L, sc }), 'daily' (the Daily: dly, below)
   or 'beat' (a Beat my play link: chal, below) */
let mode = 'game', edit = null, lvl = null;
/* THE DAILY. day is GET today ({ dateKey, dayNumber, seed, config, played,
   gems }) or null; dayState says how loading it went. dly is the daily on the
   clipboard: { sc, openedAt, local (daily-ui loadDay), scoring, busy }. */
let day = null, dayState = 'loading', dly = null;
/* A CHALLENGE: { ch, sc, theirs: { res, score }, mine (the play I draw),
   watching (their play is the run on show) } */
let chal = null;
/* The player's ladder: best stars and a play per level (ladder-ui.js). */
let ladder = loadLadder();
/* The scenario this play runs in: the game's, the play's own situation, or the level's. */
const SCX = () => (mode === 'edit' && edit ? scenarioFor(SC, edit.entry.situation) : mode === 'level' && lvl ? lvl.sc
  : mode === 'daily' && dly ? dly.sc : mode === 'beat' && chal ? chal.sc : SC);

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
    if (mode === 'daily') dayBarSync();
    if (!hintTimer || !$('hint').textContent) $('hint').textContent = defaultHint();
  },
  scenario: () => SCX(),
  /* the defense the scout told you about: the clipboard sets it up that way */
  scheme: () => (mode === 'level' && lvl ? lvl.L.scheme : mode === 'beat' && chal ? chal.ch.scheme : null)
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
  else if (mode === 'level' && lvl) { ladder.plays[lvl.L.id] = p; saveLadder(ladder); }
  else if (mode === 'daily' && dly) { dly.local.play = p; D.saveDay(dly.local); }
  else if (mode === 'beat' && chal) chal.mine = p;
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
/* Run It: a fresh seed, but a challenge always runs on its link's seed and
   scheme (the same roll they had), and the daily's button is Practice. */
$('bRun').addEventListener('click', () => (mode === 'beat' && chal ? run(chal.ch.seed, challengeOpt(chal.ch)) : run(freshSeed())));
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

/* How long OVERTIME stays up on its own before the verdict, in wall seconds. */
const OT_BEAT = 1.1;

/* The shot readout: the caption's own word, then the make chance. */
const readout = e => (e.p != null ? e.text + ' · ' + Math.round(e.p * 100) + '%' : e.text);

/* pl: the play to run, when it is not the one on the clipboard (their play
   in a challenge, or the daily's play as it was filed) */
function run(seed, opt, pl) {
  const tap = performance.now();
  sound.unlock();
  const S = SCX();
  /* a ladder level always plays its own scheme (the scout's, or the roll) */
  const res = simulate(S, pl || play, seed, mode === 'level' && lvl ? levelOpt(lvl.L) : (opt || {}));
  runPlay = JSON.parse(JSON.stringify(pl || play));
  lastResult = res; ranOnce = true; lastTiming = null;
  if (mode === 'edit' && edit) books.countRun(edit, res);
  $('board').hidden = true; $('court').hidden = false;
  clipTools(false);
  $('sheet').classList.remove('on'); $('vGame').classList.remove('lres'); clearStars(); $('hint').textContent = '';
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
    after: null, spin: 0, cut: null, winner: false, made: false, tap };
  const ot = res.how === 'ot';
  caps.q = []; caps.until = 0; $('pop').classList.remove('on', 'final', 'shot');
  setScore(S.us, S.them, start);
  let prev = performance.now();

  function toEnd() {
    live.phase = 'end'; live.w = 0;
    $('clock').classList.remove('them'); $('stage').classList.remove('slow');
    sound.buzzer();
    /* OVERTIME gets its own beat: the word, then how it went (phase 'ot'). */
    if (ot) { live.phase = 'ot'; cutUi(null); banner('OVERTIME'); buzz(30); return; }
    endJuice();
  }
  function endJuice() {
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
    cutVerdict(answer, res);
    if (answer.scored || answer.tied) { live.them = res.them; flip('sThem'); sound.swish(); }
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
    } else if (live.phase === 'after' || ((live.phase === 'end' || live.phase === 'ot') && !live.cut)) {
      // the first beat at the rim at speed, then the rest is dead time
      if (live.after) live.after.t += dt * (live.after.t > 0.6 ? DEAD : 1);
      fr = last; clock = last.t;
    }
    if (live.phase === 'cut' || ((live.phase === 'end' || live.phase === 'ot') && live.cut)) {
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
        /* after the make, the cutaway and the overtime beat say how it ended */
        if (live.made && (answer || ot)) continue;
        if (e.final && answer) continue;
        if (!e.quiet) caption(e);
        if (/Good$/.test(e.text)) {
          live.made = true;
          live.us = S.us + res.shot.points; flip('sUs'); sound.swish();
          if (res.how === 'make' && res.outcome === 'win') { live.winner = true; banner('GAME WINNER'); sound.crowd(); buzz([40, 50, 40, 50, 140]); }
          else if (ot && res.ot.after === 'end') { banner('TIED IT'); buzz(30); }
        }
        if (e.text === 'They answered') live.them = res.them;
      }
    }
    pumpCaptions(now);
    setScore(live.us, live.them, Math.max(0, clock));
    if (live.phase === 'after') {
      const played = live.after.t >= (shotEnds ? AFTER : 0.4);
      if (played && !caps.q.length) { if (answer) startCut(); else toEnd(); }
    } else if (live.phase === 'ot') {
      live.w += raw * (speed > 1 ? 1.5 : 1);
      if (live.w >= OT_BEAT) {
        const fin = res.events.find(e => e.final);
        banner(res.outcome === 'win' ? 'WON IN OT' : null);
        pop(fin ? fin.text : res.outcome === 'win' ? 'You win' : 'They win', true);
        endJuice(); live.winner = res.outcome === 'win';
        live.phase = 'end'; live.w = 0;
      }
    } else if (live.phase === 'end') {
      live.w += raw;
      const wait = (live.winner ? 1.3 : ot ? 1.1 : 0.5) / (speed > 1 ? 1.5 : 1);
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
function cutVerdict(A, res) {
  const v = $('cutV'), good = A.scored || A.tied;
  v.className = 'cutv on ' + (good ? 'good' : 'miss');
  /* up 2, their two only ties it; tied, their miss only means overtime */
  v.textContent = good ? 'GOOD' : res.how === 'ot' ? 'They missed' : 'They missed. You win';
  $('cutSub').textContent = A.scored ? 'They answered.' : A.tied ? 'They tied it.' : res.how === 'ot' ? 'Still tied.' : '';
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
  if (mode === 'level' && lvl) { showLevelResult(res); return; }
  if (mode === 'daily' && dly && dly.scoring) { const sc = dly.scoring; dly.scoring = null; showDailyCard(sc.result, res); return; }
  if (mode === 'beat' && chal) { showBeatResult(res); return; }
  $('card').className = 'card';
  const win = res.outcome === 'win';
  const when = res.shotAt != null ? 'Shot went up with ' + res.shotAt.toFixed(1) + ' left.' : 'No shot.';
  const c = $('card');
  c.innerHTML = '';
  const add = adder(c);
  /* a daily practice says so, and its defense is the practice roll's, not today's */
  const practice = mode === 'daily';
  if (practice) add('p', 'practag', 'Practice · not scored');
  add('h2', 'verdict ' + (win ? 'win' : 'lose'), win ? 'WINNER' : 'LOSE');
  add('div', 'finalscore', scoreLineOf(res.us, res.them, res.how === 'ot'));
  add('p', 'facts', when + (practice ? ' Practice defense: ' : isZone(res.scheme) ? ' Their defense: ' : ' Their call on screens: ') + res.schemeName + '.');
  add('p', 'reason', res.reason);
  const row = add('div', 'row');
  const btn = (label, cls, fn, id, to) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; if (id) b.id = id; b.addEventListener('click', () => fn(b)); (to || row).appendChild(b); return b; };
  btn(practice ? 'Again' : 'Replay', 'go', () => run(freshSeed(), lastOpt), 'bReplay');
  btn('Back to Clipboard', 'alt', backToBoard, 'bBack');
  if (mode === 'edit') btn('Back to playbook', 'alt', () => { backToBoard(); books.showBook(edit.book.id); }, 'bBackBook');
  const row2 = add('div', 'row');
  if (!practice) btn('Share', 'alt', b => doShare(shareText(runPlay, res), b), 'bShare', row2);
  const ch = beatOf(res);
  if (ch) btn('Beat my play', 'alt', b => shareChallenge(ch, b), 'bBeat', row2);
  const dbg = btn(debugOn ? 'Hide seed' : 'Seed', '', () => { debugOn = !debugOn; pre.hidden = !debugOn; dbg.textContent = debugOn ? 'Hide seed' : 'Seed'; }, 'bSeed', row2);
  dbg.className = 'link';
  const pre = add('div', 'dbg'); pre.id = 'seedBox'; pre.hidden = !debugOn;
  pre.textContent = 'seed ' + res.seed + '\nscheme ' + res.scheme + '\nshot ' + JSON.stringify(res.shot) + '\nanswer ' + JSON.stringify(res.answer) + '\nplay ' + playKey(runPlay);
  $('sheet').classList.add('on');
}

/* The situation a run was in, for a Beat my play link: the free play's,
   the level's (with its scout scheme), the daily's (never a scheme), the
   challenge's own. A playbook play has its own situation, so none. */
function beatOf(res) {
  const base = mode === 'game' ? { clock: SC.clock, down: 1, set: 'box', scheme: lastOpt.scheme || null }
    : mode === 'level' && lvl ? { clock: lvl.L.sit.clock, down: lvl.L.sit.down || 1, set: lvl.L.set, scheme: lvl.L.scheme }
    : mode === 'daily' && day ? { clock: day.config.clock, down: day.config.down, set: day.config.set, scheme: null }
    : mode === 'beat' && chal ? { clock: chal.ch.clock, down: chal.ch.down, set: chal.ch.set, scheme: chal.ch.scheme }
    : null;
  return base ? { ...base, seed: res.seed, play: runPlay } : null;
}
async function shareChallenge(ch, b) {
  const url = beatLink(ch);
  if (!url) { b.textContent = 'Too long for a link'; setTimeout(() => { b.textContent = 'Beat my play'; }, 1800); return; }
  lastBeatUrl = url;
  await shareBeat(url, b);
}
let lastBeatUrl = null;

/* THE LEVEL RESULT: the stars one at a time, what each one asks and whether
   this run did it, a new best, then Next level, Try again or the Ladder. */
let starTimers = [];
function showLevelResult(res) {
  const L = lvl.L, n = starsOf(res), prev = ladder.best[L.id] || 0, better = n > prev;
  if (better) { ladder.best[L.id] = n; saveLadder(ladder); }
  levelBar(L);
  const win = res.outcome === 'win', reduce = reduced();
  const c = $('card');
  c.className = 'card lvl';
  c.innerHTML = '';
  c.dataset.stars = String(n);
  const add = adder(c);
  add('p', 'lvlname', L.id + ' · ' + L.title);
  verdictBlock(add, win, scoreLineOf(res.us, res.them, res.how === 'ot'), n, reduce);
  if (better && n > 0) add('p', 'newbest', prev ? 'New best. Up from ' + prev + '.' : 'New best.');
  checklist(add, n, factsOf(res));
  add('p', 'reason', res.reason);
  add('p', 'facts', (isZone(res.scheme) ? 'Their defense: ' : 'Their call on screens: ') + res.schemeName + '.');
  const row = add('div', 'row');
  const btn = (label, cls, fn, id, to) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; if (id) b.id = id; b.addEventListener('click', () => fn(b)); (to || row).appendChild(b); return b; };
  /* Next level once the next one is open; first when this run won it */
  const next = nextOf(L.id), canNext = !!next && isOpen(ladder, next.id);
  const goNext = () => btn('Next level', n >= 1 ? 'go' : 'alt', () => openLevel(next), 'bNextLvl');
  if (canNext && n >= 1) goNext();
  btn('Try again', canNext && n >= 1 ? 'alt' : 'go', () => run(freshSeed()), 'bReplay');
  if (canNext && n < 1) goNext();
  const row2 = add('div', 'row');
  btn('Edit the play', 'alt', backToBoard, 'bBack', row2);
  btn('Back to Ladder', 'alt', openLadder, 'bLadder', row2);
  const ch = beatOf(res);
  if (ch) btn('Beat my play', 'alt', b => shareChallenge(ch, b), 'bBeat', row2);
  const dbg = btn(debugOn ? 'Hide seed' : 'Seed', '', () => { debugOn = !debugOn; pre.hidden = !debugOn; dbg.textContent = debugOn ? 'Hide seed' : 'Seed'; }, 'bSeed', row2);
  dbg.className = 'link';
  const pre = add('div', 'dbg'); pre.id = 'seedBox'; pre.hidden = !debugOn;
  pre.textContent = 'level ' + L.id + '\nseed ' + res.seed + '\nscheme ' + res.scheme + '\nshot ' + JSON.stringify(res.shot) + '\nanswer ' + JSON.stringify(res.answer) + '\not ' + JSON.stringify(res.ot) + '\nplay ' + playKey(runPlay);
  cardUp(res, n);
}
/* Up with the card: the clipboard's controls aside, the last frame behind
   it, the stars landing one at a time, a ding each; three of them is a party. */
function cardUp(res, n) {
  const c = $('card'), reduce = reduced();
  $('vGame').classList.add('lres');
  if (res) court.draw(res.frames[res.frames.length - 1]);
  $('sheet').classList.add('on');
  c.scrollTop = 0;
  clearStars();
  for (let i = 0; i < n; i++) starTimers.push(setTimeout(() => { sound.star(i + 1); buzz(12); }, reduce ? 0 : (250 + i * 400 + 200)));
  if (n === 3) starTimers.push(setTimeout(() => party(c), reduce ? 0 : 1450));
}
function clearStars() { for (const t of starTimers) clearTimeout(t); starTimers = []; }
/* Three stars: the card glows, a PERFECT tag, confetti and a fanfare. */
function party(c, word = 'PERFECT') {
  c.classList.add('perfect');
  if (word) { const tag = document.createElement('div'); tag.className = 'perfecttag'; tag.textContent = word; c.appendChild(tag); }
  sound.fanfare(); buzz([30, 40, 30, 40, 30, 40, 160]);
  if (reduced()) return;
  const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const cols = ['#ffd23f', '#22B07D', '#E8742A', '#1f4e79', '#E0533D'];
  for (let i = 0; i < 26; i++) {
    const b = document.createElement('i');
    b.style.left = (4 + (i * 37) % 92) + '%';
    b.style.background = cols[i % cols.length];
    b.style.animationDelay = ((i * 53) % 400) / 1000 + 's';
    b.style.setProperty('--dx', ((i * 29) % 60 - 30) + 'px');
    box.appendChild(b);
  }
  c.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}

function backToBoard() {
  live = null; clearStars();
  $('vGame').classList.remove('lres');
  $('sheet').classList.remove('on');
  banner(null); cutUi(null); $('clock').classList.remove('them'); $('stage').classList.remove('slow');
  caps.q = []; $('pop').classList.remove('on', 'final', 'shot');
  $('court').hidden = true; $('board').hidden = false;
  clipTools(true);
  const S = SCX();
  setScore(S.us, S.them, S.clock);
  board.draw();
}

/* ---------- the screens ---------- */
let lastOpt = {};
const VIEWS = ['vHome', 'vGame', 'vBooks', 'vLadder', 'vBeat'];
function show(v) {
  for (const id of VIEWS) $(id).hidden = id !== v;
  $('back').dataset.to = v === 'vHome' ? 'arcade' : v === 'vGame' && mode === 'edit' ? 'book' : v === 'vGame' && mode === 'level' ? 'ladder'
    : v === 'vGame' && mode === 'beat' ? 'beat' : v === 'vBooks' ? 'books' : 'home';
  /* the hash (#beat= or #daily) holds only while its screen is up, so a
     reload after leaving lands on home */
  const keep = (mode === 'beat' && (v === 'vGame' || v === 'vBeat')) || (mode === 'daily' && v === 'vGame');
  if (!keep) clearHash();
  if (v === 'vGame') requestAnimationFrame(() => board.draw());
  window.scrollTo(0, 0);
}
$('back').addEventListener('click', e => {
  const to = $('back').dataset.to;
  if (to === 'arcade') return;
  e.preventDefault();
  if (live) backToBoard();
  if (to === 'ladder') openLadder();
  else if (to === 'beat' && chal) openBeatIntro();
  else if (to === 'book' && edit) books.showBook(edit.book.id);
  else if (to === 'books' && books.back()) return;
  else goHome();
});
function goHome() {
  if (live) backToBoard();
  clearStars();
  mode = 'game'; edit = null; lvl = null; dly = null; chal = null; bars(); homeSync(); show('vHome');
}
/* The edit bar shows for a playbook play, the level bar for a level, the
   day bar for the Daily, the challenge bar for a Beat my play link. Run It
   is Practice on the Daily. */
function bars() {
  $('editBar').hidden = mode !== 'edit'; $('lvlBar').hidden = mode !== 'level';
  $('dayBar').hidden = mode !== 'daily'; $('beatBar').hidden = mode !== 'beat';
  $('bRun').textContent = mode === 'daily' ? 'Practice' : 'Run It';
}

/* Home's Ladder card: the stars so far. The Daily card: today, or what you
   filed, and the clock to the next one. */
function homeSync() {
  $('hLadderStars').textContent = starsIn(ladder) + ' of ' + maxStars() + ' stars';
  $('hLadderSub').textContent = LEVELS.length + ' late game spots. Win one to open the next.';
  D.homeCard({ today: day, error: dayState === 'error', off: dayState === 'off' });
}

/* THE LADDER. Read again from storage each time, so another tab's stars show. */
function openLadder() {
  if (live) backToBoard();
  clearStars();
  mode = 'game'; edit = null; lvl = null; dly = null; chal = null; bars();
  ladder = loadLadder();
  renderLadder($('vLadder'), ladder, openLevel);
  show('vLadder');
}
/* A level on the clipboard: its spots and clock, the scout, its saved play
   (or a blank one on its set, Go at min(clock, 8.0)). */
function openLevel(L) {
  if (!L) return;
  mode = 'level'; edit = null; lvl = { L, sc: levelScenario(L) };
  const saved = ladder.plays[L.id];
  play = saved ? JSON.parse(JSON.stringify(saved)) : { spots: JSON.parse(JSON.stringify(lvl.sc.spots)), steps: [], goAt: Math.min(lvl.sc.clock, GO_AT_NEW) };
  lastOpt = levelOpt(L);
  bars(); levelBar(L);
  show('vGame'); backToBoard(); board.reset();
}
function levelBar(L) {
  $('lvlId').textContent = L.id;
  $('lvlTitle').textContent = L.title;
  $('lvlStars').textContent = starText(ladder.best[L.id] || 0);
  $('lvlSit').textContent = clockLine(L);
  $('lvlScout').textContent = scoutLine(L);
  $('lvlScout').hidden = !L.scheme;
}

/* ---------- the Daily ---------- */
/* GET today, once the sign in has said who this is. */
let dayLoad = null;
function loadToday() {
  if (dayLoad) return dayLoad;
  dayState = 'loading'; homeSync();
  dayLoad = (async () => {
    await D.whenSignedIn();
    const r = await D.api('GET', 'today');
    const t = r.data;
    if (r.status === 200 && t && t.config && Number.isInteger(t.seed) && t.dateKey) { day = t; dayState = 'ok'; }
    else { day = null; dayState = r.status === 404 ? 'off' : 'error'; }
    dayLoad = null;
    homeSync();
    return day;
  })();
  return dayLoad;
}
$('hDaily').addEventListener('click', async () => {
  if (!day) { await loadToday(); if (!day) return; }
  openDaily();
});

/* The Daily on the clipboard: the day's spots, clock and score, the play
   kept for today (or a blank one on the set), no scout. Played already: the
   filed card first, practice behind it. A fresh day posts start once. */
function openDaily() {
  if (!day) return;
  if (live) backToBoard();
  clearStars();
  mode = 'daily'; edit = null; lvl = null; chal = null;
  const sc = dailyScenario(day.config), local = D.loadDay(day.dateKey);
  dly = { sc, local, openedAt: Date.now(), scoring: null, busy: false, confirm: false, err: '' };
  play = local.play ? JSON.parse(JSON.stringify(local.play)) : { spots: JSON.parse(JSON.stringify(sc.spots)), steps: [], goAt: Math.min(sc.clock, GO_AT_NEW) };
  lastOpt = {};
  bars(); dayBarSync();
  show('vGame'); backToBoard(); board.reset();
  if (day.played) { showFiled(); return; }
  if (!local.started) {
    local.started = true; D.saveDay(local);
    D.api('POST', 'start', { dateKey: day.dateKey });
  }
}

/* The day bar: the number, the title, then Take your shot (or its inline
   confirm, or what you filed), and the last error, if any. */
function dayBarSync() {
  if (!dly || !day) return;
  $('dayNo').textContent = '#' + day.dayNumber;
  $('dayTitle').textContent = day.config.title;
  const played = !!day.played;
  $('dayShot').hidden = played || dly.confirm;
  $('dayConfirm').hidden = played || !dly.confirm;
  $('dayDone').hidden = !played;
  if (played) $('dayDoneText').textContent = 'Filed: ' + day.played.scoreText;
  const bad = problems(SCX(), play).length > 0;
  $('bShot').disabled = bad || dly.busy;
  $('bShotYes').disabled = bad || dly.busy;
  $('bShotYes').textContent = dly.busy ? 'Filing...' : 'Shoot';
  $('dayErr').hidden = !dly.err;
  $('dayErr').textContent = dly.err || '';
}
$('bShot').addEventListener('click', () => { if (!dly) return; dly.confirm = true; dly.err = ''; dayBarSync(); });
$('bShotNo').addEventListener('click', () => { if (!dly || dly.busy) return; dly.confirm = false; dayBarSync(); });
$('bShotYes').addEventListener('click', () => takeShot());
$('bDayResult').addEventListener('click', () => showFiled());

/* THE SCORED RUN. Filed first, played after: the server runs the play and
   files it, and only then does the court show it, so a run that does not
   file has shown nothing (the defense stays hidden) and the play is still
   on the clipboard with a line saying why. */
async function takeShot() {
  if (!dly || dly.busy || !day || day.played) return;
  const cp = filePlay(play);
  if (!cp) { dly.err = 'That play is too big to file. Make it simpler.'; dayBarSync(); return; }
  if (problems(dly.sc, cp).length) { dly.err = 'That play can\'t run. Fix it first.'; dayBarSync(); return; }
  const seed = day.seed, score = scoreOf(simulate(dly.sc, cp, seed));
  dly.busy = true; dly.err = ''; dayBarSync();
  const d = dly, wait = D.MIN_POST_MS - (Date.now() - d.openedAt);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  const r = await D.api('POST', 'run', { mode: 'daily', dateKey: day.dateKey, seed, inputs: [cp], score, durationMs: Date.now() - d.openedAt, clientVersion: 'last-shot/' + BUILD });
  if (dly !== d) return;
  d.busy = false;
  if (r.status === 200 && r.data && r.data.result) {
    day.played = r.data.result;
    if (typeof r.data.gems === 'number') day.gems = r.data.gems;
    d.local.scored = cp; d.local.play = play; D.saveDay(d.local);
    d.confirm = false; dayBarSync();
    d.scoring = { result: r.data.result };
    run(seed, {}, cp);
    return;
  }
  if (r.status === 409 || (r.data && r.data.error === 'already_played')) {
    /* filed already (another tab, another device): show what was filed */
    d.confirm = false;
    await refreshToday();
    if (dly === d && day && day.played) { dayBarSync(); showFiled(); return; }
  }
  d.err = D.errorLine(r);
  dayBarSync();
}
async function refreshToday() { day = null; await loadToday(); if (dly && day) dly.sc = dailyScenario(day.config); }
const BUILD = (() => { try { return new URL(import.meta.url).searchParams.get('b') || 'dev'; } catch (e) { return 'dev'; } })();

/* The card for what was filed, with no run to show (a second visit). */
function showFiled() {
  if (!day || !day.played) return;
  if (live) { live = null; }
  $('court').hidden = true; $('board').hidden = false;
  const r = day.played.detail || {};
  setScore(r.us != null ? r.us : dly.sc.us, r.them != null ? r.them : dly.sc.them, r.shotAt != null ? r.shotAt : 0);
  showDailyCard(day.played, null);
}
/* The daily result card: WINNER or LOSE, the stars and the checklist, the
   score's text, today's defense, the rank, the board, gems, Share. */
function showDailyCard(result, res) {
  const scored = dly && dly.local.scored;
  const ch = scored ? { clock: day.config.clock, down: day.config.down, set: day.config.set, scheme: null, seed: day.seed, play: scored } : null;
  const parts = D.dailyCard($('card'), { day, result, reduce: reduced() }, {
    share: b => doShare(dailyShareText(day.dayNumber, result.squares, result.scoreText), b),
    beat: ch ? b => shareChallenge(ch, b) : null,
    practice: () => { backToBoard(); dayBarSync(); },
    home: goHome
  });
  if (res) cardUp(res, parts.n);
  else { cardUp(null, 0); }
  fillBoard(parts);
}
async function fillBoard(parts) {
  const d = dly, key = day && day.dateKey;
  const r = await D.api('GET', 'leaderboard?date=' + encodeURIComponent(key || ''));
  if (dly !== d || !parts.box.isConnected) return;
  if (r.status !== 200 || !r.data) { parts.box.innerHTML = ''; parts.box.appendChild(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Couldn\'t load the board.' })); return; }
  parts.rank.textContent = D.rankLine(r.data);
  D.renderBoard(parts.box, r.data, 10);
  dly.board = r.data;
}

/* The clocks to the next one, on home and on the card. A new day reloads. */
setInterval(() => {
  if (!day) return;
  if (D.dateKeyNY(Date.now()) > day.dateKey && !live && mode !== 'daily') { refreshToday(); return; }
  if (!$('vHome').hidden) $('hDailyCount').textContent = D.nextLine();
  const c = $('dCount'); if (c && c.isConnected) c.textContent = D.nextLine();
}, 1000);

/* ---------- Beat my play ---------- */
/* A link: the Challenge screen, or That link didn't work. */
function openBeat(code) {
  if (live) backToBoard();
  clearStars();
  const c = openChallenge(code);
  mode = 'beat'; edit = null; lvl = null; dly = null;
  if (!c) { chal = null; bars(); renderBadLink($('vBeat'), goHome); show('vBeat'); return; }
  let mine = null;
  try { const raw = JSON.parse(lsGet(BEAT_KEY) || 'null'); if (raw && raw.code === code) mine = cleanStored(raw.play); } catch (e) {}
  chal = { ch: c.ch, sc: c.sc, theirs: c.theirs, code, mine: mine || { spots: JSON.parse(JSON.stringify(c.sc.spots)), steps: [], goAt: Math.min(c.sc.clock, GO_AT_NEW) }, watching: false };
  openBeatIntro();
}
const BEAT_KEY = 'last_shot_beat';
function openBeatIntro() {
  if (!chal) return;
  if (live) backToBoard();
  mode = 'beat'; bars();
  renderChallenge($('vBeat'), chal, { watch: watchTheirs, draw: drawYours, home: goHome });
  show('vBeat');
}
/* The clipboard on their spot: the same spots, clock and down, the scout
   when the link has a scheme, and my play (blank the first time). */
function onBeatBoard() {
  mode = 'beat'; play = chal.mine; lastOpt = challengeOpt(chal.ch);
  bars(); beatBar();
  show('vGame');
}
function drawYours() { onBeatBoard(); backToBoard(); board.reset(); }
function watchTheirs() {
  onBeatBoard(); board.reset();
  chal.watching = true;
  run(chal.ch.seed, challengeOpt(chal.ch), chal.ch.play);
}
function beatBar() {
  $('beatTheirs').textContent = theirLine(chal.theirs.res);
  $('beatSit').textContent = sitLine(chal.ch);
  $('beatScout').textContent = scoutOf(chal.ch);
  $('beatScout').hidden = !chal.ch.scheme;
}
$('bWatchBar').addEventListener('click', () => { if (chal && !live) watchTheirs(); });
/* The challenge's cards: their run (Draw yours, Watch again), or mine
   against theirs (You beat it, or They still have it). */
function showBeatResult(res) {
  const c = $('card'), add = adder(c), reduce = reduced();
  const watching = chal.watching;
  chal.watching = false;
  c.className = 'card lvl beat';
  c.innerHTML = '';
  const btn = (label, cls, fn, id, to) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.id = id; b.addEventListener('click', () => fn(b)); to.appendChild(b); return b; };
  const n = starsOf(res);
  if (watching) {
    add('p', 'lvlname', 'Their play');
    verdictBlock(add, res.outcome === 'win', scoreLineOf(res.us, res.them, res.how === 'ot'), n, reduce);
    add('p', 'dscore', summaryOf(res));
    add('p', 'reason', res.reason);
    add('p', 'facts', (isZone(res.scheme) ? 'Their defense: ' : 'Their call on screens: ') + res.schemeName + '.');
    const row = add('div', 'row');
    btn('Draw yours', 'go', drawYours, 'bDraw2', row);
    btn('Watch again', 'alt', watchTheirs, 'bWatchAgain', row);
    cardUp(res, n);
    return;
  }
  lsSet(BEAT_KEY, JSON.stringify({ code: chal.code, play: chal.mine }));
  const mine = scoreOf(res), won = beats(mine, chal.theirs.score);
  c.dataset.beat = won ? 'yes' : 'no';
  add('p', 'lvlname', 'Beat my play');
  add('h2', 'verdict ' + (won ? 'win' : 'lose'), won ? 'You beat it' : 'They still have it').id = 'beatVerdict';
  const vs = add('div', 'vs');
  add('p', 'vsme', 'You: ' + summaryOf(res), vs).id = 'beatMine';
  add('p', 'vsthem', 'Them: ' + summaryOf(chal.theirs.res), vs).id = 'beatThem';
  add('div', 'finalscore', scoreLineOf(res.us, res.them, res.how === 'ot'));
  add('p', 'reason', res.reason);
  add('p', 'facts', (isZone(res.scheme) ? 'Their defense: ' : 'Their call on screens: ') + res.schemeName + '.');
  const row = add('div', 'row');
  btn('Try again', 'go', () => { backToBoard(); ui.hint('Same roll. Change the play.'); }, 'bReplay', row);
  const ch = beatOf(res);
  if (ch) btn('Beat my play', 'alt', b => shareChallenge(ch, b), 'bBeat', row);
  const row2 = add('div', 'row');
  btn('Watch theirs', 'alt', watchTheirs, 'bWatchAgain', row2);
  btn('Home', 'alt', goHome, 'bCardHome', row2);
  cardUp(res, 0);
  if (won) starTimers.push(setTimeout(() => party(c, null), reduce ? 0 : 400));
}

/* Play the scenario: the game, as it always was. */
function openGame() {
  mode = 'game'; edit = null; lvl = null; dly = null; chal = null; bars();
  play = loadPlay(); lastOpt = {};
  show('vGame'); backToBoard(); board.reset();
}

/* A playbook play on the clipboard (book-ui.js calls this). */
function openPlay(book, entry) {
  mode = 'edit'; edit = { book, entry }; lvl = null; dly = null; chal = null; bars();
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
$('hLadder').addEventListener('click', openLadder);
$('hHow').addEventListener('click', () => $('howSheet').classList.add('on'));
$('howClose').addEventListener('click', () => $('howSheet').classList.remove('on'));

async function doShare(text, btn) {
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch (e) { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = 'Share'; }, 1600);
}

/* For the browser check: run a play with a fixed seed and read the result. */
window.__lastShot = { run, get result() { return lastResult; }, get play() { return play; }, setPlay(p) { if (mode === 'level' || mode === 'daily' || mode === 'beat') savePlay(p); else play = p; board.reset(); },
  /* the feel: tap to result in ms, the live phase, a pause for screenshots, the sound's state */
  get timing() { return lastTiming; }, get phase() { return live ? live.phase || 'preview' : null; }, set paused(v) { paused = !!v; }, get speed() { return speed; },
  get sound() { return { muted: sound.muted, state: sound.state }; }, starter: starterPlay,
  view: () => board.view(), get board() { return board; }, get mode() { return mode; }, get edit() { return edit; }, books,
  simulate: (seed, opt) => { const r = simulate(SCX(), play, seed, mode === 'level' && lvl ? levelOpt(lvl.L) : opt || {});
    return { outcome: r.outcome, reason: r.reason, shotAt: r.shotAt, scheme: r.scheme, how: r.how, answer: r.answer, ot: r.ot, us: r.us, them: r.them, down: r.down, stars: starsOf(r) }; },
  /* the ladder, for check-ladder.mjs */
  get level() { return lvl ? lvl.L.id : null; }, get ladder() { return ladder; }, openLadder, openLevel: id => openLevel(levelById(id)),
  /* the Daily and Beat my play, for check-daily.mjs and check-beat.mjs */
  get day() { return day; }, get dayState() { return dayState; }, get daily() { return dly ? { busy: dly.busy, err: dly.err, confirm: dly.confirm, board: dly.board || null } : null; },
  openDaily, loadToday, get chal() { return chal ? { ch: chal.ch, theirScore: chal.theirs.score, mine: chal.mine } : null; }, get beatUrl() { return lastBeatUrl; },
  runPlay: () => runPlay };
$('cut').addEventListener('pointerdown', () => { if (live && live.skip) live.skip(); });

setScore(SC.us, SC.them, SC.clock);
homeSync();
/* A link in (#beat= a challenge, #daily the Daily), else home. */
function fromHash() {
  const h = readHash(location.hash);
  if (h && h.kind === 'beat') { openBeat(h.code); return true; }
  if (h && h.kind === 'daily') { show('vHome'); loadToday().then(t => { if (t && !$('vHome').hidden) openDaily(); }); return true; }
  return false;
}
if (!fromHash()) show('vHome');
loadToday();
window.addEventListener('hashchange', () => { if (readHash(location.hash)) fromHash(); });
board.reset();
$('hint').textContent = defaultHint();
/* Trace the players in the background while the coach draws (court.js). */
warm();
