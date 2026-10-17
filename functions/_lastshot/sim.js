/* THE POSSESSION. A pure fixed-step sim: the scenario, the play and a seed
 * in, the whole possession out (outcome, reason, captions, and a frame list
 * the court plays back). No DOM, no Math.random, no clock but its own, so the
 * same three inputs give the same result anywhere.
 *
 * The rng is drawn in one order: the screen scheme first, then each risky
 * pass, then the shot, then their answer. */
import { mulberry32 } from './rng.js';
import { SCHEMES, SCHEME_NAMES } from './scenario.js';
import { COURT, dist, segDist, toRim } from './court-geo.js';
import { advanceRunner, advanceDefender, speedOf } from './motion.js';
import { targetFor, screens, defenderOf } from './defense.js';
import { shotQuality, openWord } from './shot.js';
import { IDS, problems } from './playbook.js';

export const DT = 1 / 60;
const FRAME_EVERY = 2;

export function simulate(sc, play, seed) {
  const bad = problems(sc, play);
  if (bad.length) throw new Error('play cannot run: ' + bad.join(' '));
  const T = sc.tuning, rng = mulberry32(seed >>> 0);
  const st = {
    clock: sc.clock, scheme: SCHEMES[Math.floor(rng() * SCHEMES.length)], screened: {}, lastScreen: null,
    O: {}, X: [], ball: { holder: sc.handler, pos: null, flight: null }, k: -1, pass: null, shot: null,
    events: [], frames: [], end: null, bailPending: false, passes: []
  };
  for (const id of IDS) st.O[id] = { id, arch: sc.roster[id].arch, pos: { ...play.spots[id] }, path: [], vel: { x: 0, y: 0 }, segEnds: 0, screen: null, pending: null };
  for (const [xid, man] of Object.entries(sc.matchups)) {
    const x = { id: xid, man, pos: null, aim: null, vel: { x: 0, y: 0 }, holdT: 0, underT: 0 };
    x.pos = targetFor(x, st, T); x.aim = { ...x.pos };
    st.X.push(x);
  }
  const cap = (text, extra) => st.events.push({ t: round1(st.clock), kind: 'caption', text, ...extra });

  let tick = 0;
  frame(st);
  nextStep(sc, play, st, T, rng, cap);
  while (!st.end) {
    tick++;
    // the ball
    if (st.shot) {
      st.shot.t += DT;
      if (st.shot.t >= st.shot.dur) { finish(sc, st, T, rng, cap); break; }
    } else if (st.ball.flight) {
      const f = st.ball.flight; f.t += DT;
      const k = Math.min(1, f.t / f.dur);
      st.ball.pos = { x: f.a.x + (f.b.x - f.a.x) * k, y: f.a.y + (f.b.y - f.a.y) * k };
      if (k >= 1) catchBall(sc, play, st, T, rng, cap);
    } else if (st.pass && st.pass.releaseAt != null && st.clock <= st.pass.releaseAt + 1e-9) throwBall(st, T, rng, cap);
    if (st.end) break;

    // the offense
    for (const id of IDS) {
      const p = st.O[id];
      if (!p.path.length) continue;
      advanceRunner(p, DT, st.ball.holder === id ? T.dribbleSpeed : T.runSpeed);
      if (!p.path.length && p.pending) { p.screen = p.pending; p.pending = null; }
    }
    for (const id of IDS) if (!st.O[id].path.length) st.O[id].vel = { x: 0, y: 0 };

    // the defense
    const ev = screens(st, T);
    if (ev) cap(ev.scheme === 'switch' ? 'Switch on the screen' : ev.scheme === 'over' ? 'Fought over the top' : 'Went under the screen', { slow: true });
    for (const x of st.X) {
      x.holdT = Math.max(0, x.holdT - DT); x.underT = Math.max(0, x.underT - DT);
      advanceDefender(x, targetFor(x, st, T), DT, T.defSpeed, T.defLag, x.holdT > 0 ? 0.85 : 0);
    }

    st.clock = Math.max(0, st.clock - DT);
    if (!st.shot) stepCheck(sc, play, st, T, rng, cap);
    if (!st.shot && !st.end && st.clock <= sc.bailoutAt + 1e-9) {
      if (st.ball.holder) shoot(sc, st, T, rng, cap, st.ball.holder, true);
      else st.bailPending = true;
    }
    if (!st.shot && !st.end && st.clock <= 0) end(st, 'lose', 'clock', cap, 'Time');
    if (tick % FRAME_EVERY === 0 || st.end) frame(st);
  }
  frame(st);
  return result(sc, play, st, seed);
}

/* ---------- steps ---------- */
function nextStep(sc, play, st, T, rng, cap) {
  while (!st.end && !st.shot) {
    st.k++;
    const s = play.steps[st.k];
    if (!s) return;
    if (s.kind === 'move' || s.kind === 'screen') {
      const p = st.O[s.who];
      p.path = s.pts.map(q => ({ x: q.x, y: q.y }));
      p.screen = null;
      p.pending = s.kind === 'screen' ? { at: { ...s.pts[s.pts.length - 1] }, from: { ...p.pos }, n: st.k } : null;
      return;
    }
    if (s.kind === 'pass') { startPass(st, s, T); return; }
    if (s.kind === 'shoot') {
      if (st.ball.holder === s.who) shoot(sc, st, T, rng, cap, s.who, false);
      return;
    }
  }
}

function stepCheck(sc, play, st, T, rng, cap) {
  const s = play.steps[st.k];
  if (!s) return;
  let done = false;
  if (s.kind === 'move' || s.kind === 'screen') done = !st.O[s.who].path.length;
  else if (s.kind === 'pass') done = !st.pass && st.ball.holder === s.to;
  else if (s.kind === 'shoot') { if (st.ball.holder === s.who) shoot(sc, st, T, rng, cap, s.who, false); return; }
  if (done) nextStep(sc, play, st, T, rng, cap);
}

/* ---------- the pass ---------- */
function startPass(st, s, T) {
  const r = st.O[s.to];
  // The ball goes where the receiver will be at the end of his segment.
  const target = r.path.length ? r.path[0] : r.pos;
  const eta = r.path.length ? dist(r.pos, r.path[0]) / T.runSpeed : 0;
  const passer = st.O[s.from].path.length ? null : st.O[s.from].pos;
  const flight = dist(passer || st.O[s.from].pos, target) / T.passSpeed;
  st.pass = { from: s.from, to: s.to, target: { ...target }, releaseAt: st.clock - Math.max(0, eta - flight) };
}

function throwBall(st, T, rng, cap) {
  const ps = st.pass, a = { ...st.O[ps.from].pos }, b = ps.target;
  const len = dist(a, b);
  const long = len > T.longPass;
  const xPasser = defenderOf(st, ps.from);
  const lane = st.X.some(x => x !== xPasser && dist(x.pos, a) > 2 && segDist(x.pos, a, b) < T.laneCover);
  let risk = (long ? T.passRisk : 0) + (lane ? T.passRisk : 0);
  const lost = risk > 0 && rng() < risk;
  st.ball = { holder: null, pos: a, flight: { a, b: { ...b }, t: 0, dur: Math.max(0.12, len / T.passSpeed), to: ps.to, lost } };
  st.passes.push({ from: ps.from, to: ps.to, at: round1(st.clock), long, lane, lost });
  if (lost) cap(long ? 'Long pass. Picked off' : 'Jumped the lane', { slow: true });
  else if (st.clock < 7) cap('Late pass', { slow: true });
  else if (long || lane) cap('Risky pass', { slow: true });
  else cap('Pass to ' + ps.to, { slow: true, quiet: true });
  st.pass.releaseAt = null;
}

function catchBall(sc, play, st, T, rng, cap) {
  const f = st.ball.flight;
  if (f.lost) { st.ball = { holder: null, pos: f.b, flight: null }; end(st, 'lose', 'turnover', cap, 'Turnover'); return; }
  st.ball = { holder: f.to, pos: null, flight: null };
  st.pass = null;
  if (st.bailPending) { shoot(sc, st, T, rng, cap, f.to, true); return; }
  stepCheck(sc, play, st, T, rng, cap);
}

/* ---------- the shot ---------- */
function shoot(sc, st, T, rng, cap, who, bailout) {
  if (st.shot) return;
  const p = st.O[who];
  const q = shotQuality(sc, { pos: p.pos, arch: p.arch, speed: speedOf(p) }, st.X, bailout);
  const made = rng() < q.p;
  const dur = q.zone === 'rim' ? T.shotFlight * 0.6 : T.shotFlight;
  st.shot = { who, at: round1(st.clock), from: { ...p.pos }, q, made, t: 0, dur };
  st.ball = { holder: null, pos: { ...p.pos }, flight: null };
  p.path = []; p.pending = null;
  cap(bailout ? 'Bail out' : q.open >= 6 ? 'Wide open' : q.open >= 4 ? 'Open look' : q.open >= 2.5 ? 'Hand in the face' : 'Contested', { slow: true, shot: true });
}

function finish(sc, st, T, rng, cap) {
  const s = st.shot;
  if (!s.made) { end(st, 'lose', 'miss', cap, 'No good'); return; }
  st.us = sc.us + s.q.points;
  cap(s.q.points === 3 ? 'Three. Good' : 'Good', { slow: true });
  if (s.at < sc.winWindow) { end(st, 'win', 'make', cap); return; }
  // Their ball. The more time left, the better their look.
  const lead = st.us - sc.them;
  let p = Math.min(T.answerMax, T.answerBase + T.answerPerSec * (s.at - sc.winWindow));
  if (lead >= 2) p *= T.answerNeedThree;
  const scored = rng() < p;
  st.answer = { p, scored, points: lead + 1 };
  if (scored) { st.them = sc.them + lead + 1; end(st, 'lose', 'answer', cap, 'They answered'); }
  else end(st, 'win', 'stop', cap, 'They missed');
}

function end(st, outcome, how, cap, text) {
  st.end = { outcome, how };
  if (text) cap(text, { slow: true, final: true });
}

/* ---------- the record ---------- */
const r2 = n => Math.round(n * 100) / 100;
const round1 = n => Math.round(n * 10) / 10;

function frame(st) {
  let b;
  if (st.shot) {
    const k = Math.min(1, st.shot.t / st.shot.dur), a = st.shot.from, rim = COURT.RIM;
    b = [r2(a.x + (rim.x - a.x) * k), r2(a.y + (rim.y - a.y) * k), r2(4 * k * (1 - k) * (6 + toRim(a) * 0.25))];
  } else if (st.ball.holder) b = [r2(st.O[st.ball.holder].pos.x), r2(st.O[st.ball.holder].pos.y), 0];
  else b = [r2(st.ball.pos.x), r2(st.ball.pos.y), st.ball.flight ? 1 : 0];
  st.frames.push({
    t: r2(st.clock),
    o: IDS.flatMap(id => [r2(st.O[id].pos.x), r2(st.O[id].pos.y)]),
    x: st.X.flatMap(x => [r2(x.pos.x), r2(x.pos.y)]),
    m: st.X.map(x => x.man),
    b, h: st.ball.holder || null,
    s: IDS.filter(id => st.O[id].screen).map(id => [id, r2(st.O[id].screen.at.x), r2(st.O[id].screen.at.y)])
  });
}

function result(sc, play, st, seed) {
  const s = st.shot;
  return {
    seed: seed >>> 0, scenario: sc.id,
    outcome: st.end.outcome, how: st.end.how,
    us: st.us || sc.us, them: st.them || sc.them,
    shotAt: s ? s.at : null,
    shooter: s ? s.who : null,
    shot: s ? { zone: s.q.zone, points: s.q.points, open: r2(s.q.open), by: s.q.by, moving: s.q.moving, bailout: s.q.bailout, p: r2(s.q.p), made: s.made } : null,
    answer: st.answer ? { p: r2(st.answer.p), scored: st.answer.scored } : null,
    scheme: st.scheme, schemeName: SCHEME_NAMES[st.scheme],
    screen: st.lastScreen, passes: st.passes,
    reason: reasonOf(sc, st),
    events: st.events, frames: st.frames
  };
}

/* THE ONE LINE. Short sentences, no dashes (the site's copy rules). */
export function reasonOf(sc, st) {
  const s = st.shot, how = st.end.how;
  const name = id => id + ' (' + sc.roster[id].arch + ')';
  const zoneWord = z => z === 'three' ? 'three' : z === 'rim' ? 'layup' : 'jumper';
  if (how === 'turnover') {
    const p = st.passes[st.passes.length - 1];
    return 'The pass to ' + p.to + ' got picked off' + (p.long ? '. Too far' : '. Somebody sat in the lane') + '.';
  }
  if (how === 'clock') return 'The clock ran out before the shot went up.';
  const ls = st.lastScreen;
  let off = '';
  if (ls && ls.cutter === s.who) off = ' off the ' + ls.kind;
  else if (ls && ls.screener === s.who && ls.kind === 'ball screen') off = ' on the roll';
  const look = openWord(s.q.open);
  const lead = (look === 'contested' ? name(s.who) + ' was contested' : name(s.who) + ' was ' + look) + off + '.';
  if (s.q.bailout) {
    const tail = s.made ? ' It went in with ' + s.at.toFixed(1) + ' left.' : ' It missed.';
    return 'Nobody got there in time. ' + name(s.who) + ' threw it up at ' + s.at.toFixed(1) + '.' + tail;
  }
  if (how === 'miss') return lead + ' The ' + zoneWord(s.q.zone) + ' rimmed out.';
  if (how === 'make') return lead + ' The ' + zoneWord(s.q.zone) + ' went up with ' + s.at.toFixed(1) + ' left.';
  if (how === 'answer') return lead + ' It went in with ' + s.at.toFixed(1) + ' left and they answered.';
  return lead + ' It went in with ' + s.at.toFixed(1) + ' left. They missed at the other end.';
}
