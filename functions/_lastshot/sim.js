/* THE POSSESSION. A pure fixed-step sim: the scenario, the play and a seed
 * in, the whole possession out (outcome, reason, captions, and a frame list
 * the court plays back). No DOM, no Math.random, no clock but its own, so the
 * same three inputs give the same result anywhere.
 *
 * The rng is drawn in one order: the screen scheme first, then each risky
 * pass, then the shot, then their answer. */
import { mulberry32 } from './rng.js';
import { SCHEMES, SCHEME_NAMES } from './scenario.js';
import { COURT, dist, segDist, toRim, zoneOf } from './court-geo.js';
import { advanceRunner, advanceDefender, speedOf, separate, pinBehind, turnFace } from './motion.js';
import { targetFor, screens, defenderOf, useScreen } from './defense.js';
import { shotQuality, openWord } from './shot.js';
import { IDS, problems, planOf } from './playbook.js';

export const DT = 1 / 60;
const FRAME_EVERY = 2;

/* opt (both optional, both leave every other run exactly as it was):
 *   scheme   force the screen scheme ('switch', 'over', 'under'). It is still
 *            rolled first and then replaced, so every draw after it falls the
 *            same way (Test it, against one scheme).
 *   preview  run the play only as far as its steps go, with no shot, no
 *            bail-out and no result: the storyboard's Play frame. The play
 *            passed in is the steps up to the end of that frame. */
export function simulate(sc, play, seed, opt = {}) {
  const bad = problems(sc, play, { preview: !!opt.preview });
  if (bad.length) throw new Error('play cannot run: ' + bad.join(' '));
  const T = sc.tuning, rng = mulberry32(seed >>> 0);
  const rolled = SCHEMES[Math.floor(rng() * SCHEMES.length)];
  const st = {
    clock: sc.clock, scheme: SCHEMES.includes(opt.scheme) ? opt.scheme : rolled, screened: {}, lastScreen: null,
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
      if (!p.path.length) { p.spd = 0; continue; }
      advanceRunner(p, DT, st.ball.holder === id ? T.dribbleSpeed : T.runSpeed, T);
      if (!p.path.length && p.pending) { p.screen = p.pending; p.pending = null; }
    }
    for (const id of IDS) if (!st.O[id].path.length) st.O[id].vel = { x: 0, y: 0 };

    // the defense
    const ev = screens(st, T);
    if (ev) cap(ev.scheme === 'switch' ? 'Switch on the screen' : ev.scheme === 'over' ? 'Fought over the top' : 'Went under the screen', { slow: true });
    for (const x of st.X) {
      x.holdT = Math.max(0, x.holdT - DT); x.underT = Math.max(0, x.underT - DT);
      let aim = targetFor(x, st, T), hold = 0;
      // Fighting over the top: stuck on the screener's body until the hold runs out.
      const ls = st.lastScreen, scr = x.holdT > 0 && ls ? st.O[ls.screener] : null;
      if (scr) { const pin = pinBehind(x, scr.pos, T); aim = { x: aim.x * 0.3 + pin.x * 0.7, y: aim.y * 0.3 + pin.y * 0.7 }; hold = 0.5; }
      advanceDefender(x, aim, DT, T.defSpeed, T.defLag, hold, T);
    }
    separate(IDS.map(id => st.O[id]), st.X, T);
    animate(st, DT);

    st.clock = Math.max(0, st.clock - DT);
    if (!st.shot) stepCheck(sc, play, st, T, rng, cap);
    if (opt.preview) {
      // A frame is over once every step in it is done and the ball has landed.
      const done = st.run && st.run.every(r => r.state === 'done') && !st.ball.flight && !st.pass;
      if (done || st.clock <= 0) st.end = { outcome: 'preview', how: 'preview' };
      if (tick % FRAME_EVERY === 0 || st.end) frame(st);
      continue;
    }
    if (!st.shot && !st.end && st.clock <= sc.bailoutAt + 1e-9) {
      if (st.ball.holder) shoot(sc, st, T, rng, cap, st.ball.holder, true);
      else st.bailPending = true;
    }
    if (!st.shot && !st.end && st.clock <= 0) end(st, 'lose', 'clock', cap, 'Time');
    if (tick % FRAME_EVERY === 0 || st.end) frame(st);
  }
  frame(st);
  if (opt.preview) return { seed: seed >>> 0, preview: true, scheme: st.scheme, schemeName: SCHEME_NAMES[st.scheme], endClock: round1(st.clock), events: st.events, frames: st.frames };
  return result(sc, play, st, seed);
}

/* ---------- steps ----------
   The order rule is written out at the top of playbook.js. planOf() turns the
   drawing into start rules and route parts once; schedule() runs them every
   tick: it moves running steps along, then starts any step whose rule is met.
   st.run[i] is { state: 'wait' | 'run' | 'done', part, met, used }. */
function nextStep(sc, play, st, T, rng, cap) {
  if (!st.plan) {
    st.plan = planOf(sc, play);
    st.run = play.steps.map(() => ({ state: 'wait', part: -1, met: {}, thrown: false }));
    st.used = {};
    st.catchAt = {};
    st.uses = st.uses || [];
    st.release = null;
  }
  schedule(sc, play, st, T, rng, cap);
}

function stepCheck(sc, play, st, T, rng, cap) {
  if (!st.plan) return nextStep(sc, play, st, T, rng, cap);
  schedule(sc, play, st, T, rng, cap);
}

function schedule(sc, play, st, T, rng, cap) {
  for (let guard = 0; guard < 20 && !st.shot && !st.end; guard++) {
    let changed = false;
    st.plan.forEach((P, i) => {
      if (st.shot || st.end) return;
      const r = st.run[i];
      if (r.state === 'run') { if (advanceStep(sc, play, st, T, rng, cap, i)) changed = true; }
      else if (r.state === 'wait' && canStart(st, i)) { startStep(st, T, i); changed = true; }
    });
    if (st.release && !st.shot && st.clock <= st.release.at + 1e-9) { shoot(sc, st, T, rng, cap, st.release.who, false); return; }
    if (!changed) return;
  }
}

const isRoute = s => s.kind === 'move' || s.kind === 'screen';

function canStart(st, i) {
  const P = st.plan[i], rule = P.start, run = st.run;
  let ok;
  if (rule.mode === 'first') ok = true;
  else if (rule.mode === 'with' || rule.mode === 'started') ok = run[rule.of].state !== 'wait';
  else if (rule.mode === 'used') ok = !!st.used[rule.screen + '>' + rule.by] || run[rule.by].state === 'done';
  else ok = (rule.group || [rule.of]).every(k => run[k].state === 'done');
  if (!ok) return false;
  // a player does one thing at a time
  if (isRoute(P.s)) return !st.plan.some((Q, k) => k !== i && isRoute(Q.s) && Q.s.who === P.s.who && run[k].state === 'run' && !(Q.s.kind === 'screen' && screenSet(st, k)));
  return true;
}

const screenSet = (st, k) => { const o = st.O[st.plan[k].s.who]; return !!(o.screen && o.screen.n === k); };

function startStep(st, T, i) {
  const P = st.plan[i], r = st.run[i];
  r.state = 'run'; r.t0 = st.clock;
  if (isRoute(P.s)) {
    const p = st.O[P.s.who];
    p.screen = null; p.pending = null; p.path = [];
    r.part = -1;
    feedPart(st, i);
  }
}

/* Give the runner his next part if every screen it waits on is set. */
function feedPart(st, i) {
  const P = st.plan[i], r = st.run[i], next = P.parts[r.part + 1];
  if (!next) return false;
  if (!next.waitFor.every(k => screenSet(st, k))) return false;
  const p = st.O[P.s.who];
  r.part++;
  p.path = next.pts.map(q => ({ x: q.x, y: q.y }));
  if (P.s.kind === 'screen' && r.part === P.parts.length - 1) p.pending = { at: { ...P.route[P.route.length - 1] }, from: { ...P.from }, n: i };
  return true;
}

const restOf = p => { if (!p.path.length) return 0; let d = dist(p.pos, p.path[0]); for (let k = 1; k < p.path.length; k++) d += dist(p.path[k - 1], p.path[k]); return d; };

/* How far along his drawn route the runner of step i is, in feet. */
function along(st, i) {
  const P = st.plan[i], r = st.run[i], p = st.O[P.s.who];
  if (r.part < 0) return 0;
  const part = P.parts[r.part];
  return Math.max(part.a0, part.a1 - restOf(p));
}

function advanceStep(sc, play, st, T, rng, cap, i) {
  const P = st.plan[i], r = st.run[i], s = P.s;
  if (isRoute(s)) {
    const p = st.O[s.who];
    let changed = false;
    // the screens on his way: the defense meets them as he gets there
    const a = along(st, i);
    for (const u of P.uses) {
      const key = u.screen + '>' + i;
      if (!r.met[key] && a >= u.along - 0.6 && r.part >= 0 && P.parts[r.part].a1 > u.along - 0.6) {
        r.met[key] = true;
        const use = useScreen(st, T, st.plan[u.screen].s.who, s.who, P.uses.length > 1 ? 'stagger' : u.name);
        if (use && !r.capped) cap(schemeCaption(use), { slow: true });
        r.capped = true;
      }
      if (!st.used[key] && (a >= u.along + 2.5 || (!p.path.length && r.part === P.parts.length - 1))) { st.used[key] = true; changed = true; }
    }
    if (p.path.length) return changed;
    if (r.part < P.parts.length - 1) return feedPart(st, i) || changed;
    if (s.kind === 'screen' && !screenSet(st, i)) return changed;
    r.state = 'done'; p.routeEndAt = st.clock;
    return true;
  }
  if (s.kind === 'pass') return r.thrown ? false : tryThrow(sc, play, st, T, rng, cap, i);
  if (s.kind === 'shoot') return tryShoot(st, T, i);
  return false;
}

/* The running route step of a player, if any. */
function runningRoute(st, who) {
  for (let k = st.plan.length - 1; k >= 0; k--) {
    const Q = st.plan[k];
    if (isRoute(Q.s) && Q.s.who === who && st.run[k].state === 'run' && !(Q.s.kind === 'screen' && screenSet(st, k))) return k;
  }
  return -1;
}

/* ---------- the pass ----------
   Leaves when the passer is free, timed to land where the receiver's route
   ends as he gets there; at once if he is standing. */
function tryThrow(sc, play, st, T, rng, cap, i) {
  const s = st.plan[i].s, passer = st.O[s.from], rec = st.O[s.to];
  if (st.ball.holder !== s.from || passer.path.length || runningRoute(st, s.from) >= 0) return false;
  const k = runningRoute(st, s.to);
  let target = rec.pos, eta = 0;
  if (st.plan[i].name === 'handoff' && k >= 0) {
    // hand to hand as he runs by
    if (dist(rec.pos, passer.pos) > 3 && rec.path.length) return false;
  } else if (k >= 0) {
    const Q = st.plan[k], r = st.run[k];
    if (!rec.path.length) return false;                       // waiting on a screen
    if (Q.parts.slice(r.part + 1).some(pt => !pt.waitFor.every(w => screenSet(st, w)))) return false;
    target = Q.route[Q.route.length - 1];
    eta = (Q.len - along(st, k)) / T.runSpeed;
  }
  const flight = dist(passer.pos, target) / T.passSpeed;
  if (eta > flight + 1e-9) return false;
  st.run[i].thrown = true;
  // a short pass to a man running right by the passer is a handoff: the
  // passer is the screen
  const handoff = st.plan[i].name === 'handoff' || (k >= 0 && dist(passer.pos, rec.pos) < 6);
  st.pass = { from: s.from, to: s.to, target: { ...target }, step: i, releaseAt: st.clock, handoff };
  throwBall(st, T, rng, cap);
  if (handoff && !st.end) { const use = useScreen(st, T, s.from, s.to, 'handoff'); if (use) cap(schemeCaption(use), { slow: true }); }
  return true;
}

function startPass(st, s, T) {
  // Kept for older callers: a pass now starts through the plan (tryThrow).
  return null;
}

function throwBall(st, T, rng, cap) {
  const ps = st.pass, a = { ...st.O[ps.from].pos }, b = { ...ps.target };
  const len = dist(a, b);
  const long = len > T.longPass;
  const xPasser = defenderOf(st, ps.from);
  // the closest defender to the line of the pass, not counting the passer's
  // own man or anybody standing on the passer
  // (in the middle of the lane only: the receiver's own man closing out on
  // the catch is a contest, not a steal; a handoff has no lane)
  let lane = Infinity;
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  for (const x of st.X) {
    if (ps.handoff || !L2 || x === xPasser || dist(x.pos, a) <= 2) continue;
    const t = ((x.pos.x - a.x) * dx + (x.pos.y - a.y) * dy) / L2;
    if (t < 0.1 || t > (x.man === ps.to ? 0.75 : 0.9)) continue;
    lane = Math.min(lane, segDist(x.pos, a, b));
  }
  const longK = long ? Math.min(1, (len - T.longPass) / 10 + 0.3) : 0;
  const laneK = Math.max(0, Math.min(1, (T.laneCover - lane) / T.laneCover));
  const risk = (T.passRiskLong ?? 0.06) * longK + (T.passRiskLane ?? 0.1) * laneK;
  const lost = risk > 0 && rng() < risk;
  st.ball = { holder: null, pos: a, flight: { a, b, t: 0, dur: Math.max(0.12, len / T.passSpeed), to: ps.to, lost, step: ps.step, chase: 0 } };
  st.passes.push({ from: ps.from, to: ps.to, at: round1(st.clock), long, lane: laneK > 0, risk: Math.round(risk * 1000) / 1000, lost, handoff: !!ps.handoff });
  if (lost) cap(long ? 'Long pass. Picked off' : 'Jumped the lane', { slow: true });
  else if (long || laneK > 0.5) cap('Risky pass', { slow: true });
  else cap(ps.handoff ? 'Handoff to ' + ps.to : 'Pass to ' + ps.to, { slow: true, quiet: true });
  st.pass = null;
}

function catchBall(sc, play, st, T, rng, cap) {
  const f = st.ball.flight;
  if (f.lost) { st.ball = { holder: null, pos: f.b, flight: null }; end(st, 'lose', 'turnover', cap, 'Turnover'); return; }
  // not there yet: the ball keeps going to his hands
  const rec = st.O[f.to], gap = dist(rec.pos, f.b);
  if (gap > 1.2 && f.chase < 40) {
    f.chase++; f.a = { ...st.ball.pos }; f.b = { ...rec.pos }; f.t = 0; f.dur = Math.max(DT, gap / T.passSpeed);
    return;
  }
  st.ball = { holder: f.to, pos: null, flight: null };
  st.pass = null;
  st.catchAt[f.to] = st.clock;
  if (f.step != null && st.run) st.run[f.step].state = 'done';
  if (st.bailPending) { shoot(sc, st, T, rng, cap, f.to, true); return; }
  stepCheck(sc, play, st, T, rng, cap);
}

/* ---------- the shot ----------
   On the catch, or when his own route ends: a gather (catch and shoot, pull
   up, or a finish at the rim), and the defense closes out meanwhile. */
function tryShoot(st, T, i) {
  const who = st.plan[i].s.who, p = st.O[who];
  if (st.release || st.ball.holder !== who || p.path.length || runningRoute(st, who) >= 0) return false;
  const caught = st.catchAt[who] != null;
  const g = zoneOf(p.pos) === 'rim' ? T.gatherRim : caught && st.catchAt[who] > st.clock - 0.05 ? T.gatherCatch : T.gatherDribble;
  st.release = { who, at: st.clock - (g ?? 0.4) };
  return true;
}

function shoot(sc, st, T, rng, cap, who, bailout) {
  if (st.shot) return;
  // already in his shot when the bail-out mark came: that is the play, not a heave
  if (bailout && st.release && st.release.who === who) bailout = false;
  const p = st.O[who];
  const caughtAt = st.catchAt ? st.catchAt[who] : null, endAt = p.routeEndAt;
  // catch and shoot: he caught it and did not dribble anywhere after
  // (a catch in the last step or two of his route counts: he caught it on the run)
  const cs = caughtAt != null && (endAt == null || endAt >= caughtAt - 0.35) && !p.path.length;
  const running = cs && endAt != null && endAt - caughtAt < 0.25 || (bailout && p.path.length > 0 && st.ball.holder !== who);
  const pullup = !cs && (st.ball.holder === who) && (endAt != null || p.path.length > 0);
  const defenders = st.X.map(x => ({ id: x.id, pos: x.pos, arch: x.arch || st.O[sc.matchups[x.id]].arch }));
  const q = shotQuality(sc, { pos: p.pos, arch: p.arch, pullup, running }, defenders, bailout);
  const made = rng() < q.p;
  const dur = q.zone === 'rim' ? T.shotFlight * 0.6 : T.shotFlight;
  st.shot = { who, at: round1(st.clock), from: { ...p.pos }, q, made, t: 0, dur };
  st.ball = { holder: null, pos: { ...p.pos }, flight: null };
  st.release = null;
  st.shotHelp = st.help ? st.help.x : null;
  p.path = []; p.pending = null;
  cap(bailout ? 'Bail out' : q.open >= 6 ? 'Wide open' : q.open >= 4 ? 'Open look' : q.open >= 2 ? 'Hand in the face' : 'Contested', { slow: true, shot: true });
}

/* Their possession, if the make left them time. */
export function answerOdds(sc, at, points) {
  const T = sc.tuning;
  if (at < sc.winWindow) return 0;
  let p = Math.min(T.answerMax, T.answerBase + T.answerPerSec * (at - sc.winWindow));
  if (sc.us + points - sc.them >= 2) p *= T.answerNeedThree;
  return p;
}

function finish(sc, st, T, rng, cap) {
  const s = st.shot;
  if (!s.made) { end(st, 'lose', 'miss', cap, 'No good'); return; }
  st.us = sc.us + s.q.points;
  cap(s.q.points === 3 ? 'Three. Good' : 'Good', { slow: true });
  if (s.at < sc.winWindow) { end(st, 'win', 'make', cap); return; }
  // Their ball. The more time left, the better their look.
  const lead = st.us - sc.them;
  const p = answerOdds(sc, s.at, s.q.points);
  const scored = rng() < p;
  st.answer = { p, scored, points: lead + 1 };
  if (scored) { st.them = st.us + 1; end(st, 'lose', 'answer', cap, 'They answered'); }
  else end(st, 'win', 'stop', cap, 'They missed');
}

function schemeCaption(use) {
  const n = use.name;
  if (use.scheme === 'switch') return 'They switch the ' + n;
  if (use.scheme === 'over') return 'Over the top of the ' + n;
  return 'Under the ' + n;
}

function end(st, outcome, how, cap, text) {
  st.end = { outcome, how };
  if (text) cap(text, { slow: true, final: true });
}

/* ---------- the record ---------- */
const r2 = n => Math.round(n * 100) / 100;
const round1 = n => Math.round(n * 10) / 10;

/* THE LOOK OF IT, tick by tick: which way each body faces, where each one is
   in his stride, and the dribble. None of it feeds back into the play (no
   outcome reads these), but it is integrated here, in the sim's own fixed
   step, so a replay looks exactly the same as the first run. */
const GATE_RUN = 7.2, GATE_SLIDE = 4.4;   // feet per full stride cycle
function animate(st, dt) {
  const bp = st.ball.holder ? st.O[st.ball.holder].pos : st.ball.pos || COURT.RIM;
  const ang = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
  for (const id of IDS) {
    const p = st.O[id], spd = p.spd || 0, moving = p.path.length > 0 && spd > 0.4;
    let want;
    if (moving && p.head) want = Math.atan2(p.head.y, p.head.x);
    else if (st.ball.holder === id || (st.shot && st.shot.who === id)) want = ang(p.pos, COURT.RIM);
    else want = ang(p.pos, bp);
    p.face = turnFace(p.face, want, moving ? 16 : 7, dt);
    p.gait = ((p.gait || 0) + spd * dt / GATE_RUN) % 1;
    if (st.ball.holder === id) p.drib = ((p.drib || 0) + dt * (1.8 + spd * 0.07)) % 1;
  }
  for (const x of st.X) {
    const spd = x.spd || 0, man = st.O[x.man].pos;
    const want = x.run && spd > 1 ? Math.atan2(x.vel.y, x.vel.x) : ang(x.pos, st.shot ? st.O[st.shot.who].pos : man);
    x.face = turnFace(x.face, want, x.run ? 14 : 9, dt);
    x.gait = ((x.gait || 0) + spd * dt / (x.run ? GATE_RUN : GATE_SLIDE)) % 1;
  }
}

/* Pose codes, read by court.js.
   Offense: 0 stand, 1 run, 2 dribble on the move, 3 dribble standing,
            4 shooting, 5 screen set, 6 hands up for the pass, 7 the pass
            just thrown, 8 holding the ball (the catch).
   Defense: 0 stance, 1 slide, 2 run, 3 stuck on a screen, 4 contest. */
export const POSE = Object.freeze({ STAND: 0, RUN: 1, DRIB: 2, DRIB_STAND: 3, SHOOT: 4, SET: 5, READY: 6, PASS: 7, HOLD: 8,
  STANCE: 0, SLIDE: 1, CHASE: 2, STUCK: 3, CONTEST: 4 });
const CATCH_HOLD = 0.3, CATCH_BLEND = 0.15, PASS_POSE = 0.25;
const deg = a => Math.round(((a || 0) * 180 / Math.PI + 360) % 360);

function frame(st) {
  if (!st.vis) animate(st, 0);
  const V = st.vis || (st.vis = { h: st.ball.holder, catchAt: null, from: null, kind: null, lastB: null });
  const fl = st.ball.flight, lastPass = st.passes[st.passes.length - 1];
  // a new pass: how it is thrown is read off the sim's own record of it
  if (fl && V.flight !== fl) { V.flight = fl; V.kind = lastPass && lastPass.lane ? 'bounce' : lastPass && lastPass.long ? 'lob' : 'chest'; V.len = dist(fl.a, fl.b); }
  if (st.ball.holder && !V.h && V.lastB) { V.catchAt = st.clock; V.from = V.lastB; }
  V.h = st.ball.holder;
  const since = V.catchAt == null ? 9 : V.catchAt - st.clock;

  let b;
  if (st.shot) {
    // The arc above the straight line from the release to the rim: high at
    // the hands, a peak that grows with the distance, nothing left at the rim.
    const k = Math.min(1, st.shot.t / st.shot.dur), a = st.shot.from, rim = COURT.RIM, far = toRim(a);
    const rel = st.shot.q.zone === 'rim' ? 6.5 : 7.5, peak = st.shot.q.zone === 'rim' ? 1.6 : 2.4 + far * 0.2;
    b = [r2(a.x + (rim.x - a.x) * k), r2(a.y + (rim.y - a.y) * k), r2(rel * (1 - k) * (1 - k * 0.4) + 4 * peak * k * (1 - k))];
  } else if (st.ball.holder) {
    const p = st.O[st.ball.holder], f = p.face || 0;
    const fx = Math.cos(f), fy = Math.sin(f), rx = -fy, ry = fx;
    const hold = since < CATCH_HOLD || (st.pass && st.pass.from === st.ball.holder && st.pass.releaseAt != null && st.clock - st.pass.releaseAt < 0.2);
    let x, y, z;
    if (hold) { x = p.pos.x + fx * 0.7; y = p.pos.y + fy * 0.7; z = 4; }
    else {
      const ph = p.drib || 0, u = Math.abs(2 * ph - 1);
      x = p.pos.x + rx * 0.95 + fx * 0.55; y = p.pos.y + ry * 0.95 + fy * 0.55; z = 3.1 * (1 - (1 - u) * (1 - u));
    }
    if (since < CATCH_BLEND && V.from) { const w = since / CATCH_BLEND; x = V.from[0] + (x - V.from[0]) * w; y = V.from[1] + (y - V.from[1]) * w; z = V.from[2] + (z - V.from[2]) * w; }
    b = [r2(x), r2(y), r2(z)];
  } else if (fl) {
    const k = Math.min(1, fl.t / fl.dur);
    let z;
    if (V.kind === 'bounce') z = k < 0.6 ? 4 * (1 - k / 0.6) * (1 - 0.3 * k) : 3.6 * ((k - 0.6) / 0.4) * (1.3 - 0.3 * (k - 0.6) / 0.4);
    else if (V.kind === 'lob') z = 4.5 + 4 * k * (1 - k) * Math.min(9, V.len * 0.22);
    else z = 4.2 + 4 * k * (1 - k) * Math.min(2.2, V.len * 0.06);
    b = [r2(st.ball.pos.x), r2(st.ball.pos.y), r2(z)];
  } else b = [r2(st.ball.pos.x), r2(st.ball.pos.y), 0];
  V.lastB = b;

  const near = x => st.shot && Math.hypot(x.pos.x - st.O[st.shot.who].pos.x, x.pos.y - st.O[st.shot.who].pos.y) < 5.5;
  const k = [
    ...IDS.map(id => {
      const p = st.O[id], moving = p.path.length > 0 && (p.spd || 0) > 0.4;
      if (st.shot && st.shot.who === id) return POSE.SHOOT;
      if (st.ball.holder === id) return since < CATCH_HOLD ? POSE.HOLD : moving ? POSE.DRIB : POSE.DRIB_STAND;
      if (fl && lastPass && lastPass.from === id && fl.t < PASS_POSE) return POSE.PASS;
      if (fl && fl.to === id) return POSE.READY;
      if (moving) return POSE.RUN;
      return p.screen ? POSE.SET : POSE.STAND;
    }),
    ...st.X.map(x => near(x) ? POSE.CONTEST : x.holdT > 0 ? POSE.STUCK : x.run && (x.spd || 0) > 2 ? POSE.CHASE : (x.spd || 0) > 1.2 ? POSE.SLIDE : POSE.STANCE)
  ];
  st.frames.push({
    t: r2(st.clock),
    o: IDS.flatMap(id => [r2(st.O[id].pos.x), r2(st.O[id].pos.y)]),
    x: st.X.flatMap(x => [r2(x.pos.x), r2(x.pos.y)]),
    m: st.X.map(x => x.man),
    b, h: st.ball.holder || null,
    s: IDS.filter(id => st.O[id].screen).map(id => [id, r2(st.O[id].screen.at.x), r2(st.O[id].screen.at.y)]),
    f: [...IDS.map(id => deg(st.O[id].face)), ...st.X.map(x => deg(x.face))],
    g: [...IDS.map(id => Math.round((st.O[id].gait || 0) * 100)), ...st.X.map(x => Math.round((x.gait || 0) * 100))],
    k,
    sk: st.shot ? r2(Math.min(1, st.shot.t / st.shot.dur)) : null,
    sw: st.shot ? st.shot.who : null
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
    shot: s ? { zone: s.q.zone, points: s.q.points, open: r2(s.q.open), by: s.q.by, byArch: s.q.byArch, moving: s.q.moving, pullup: s.q.pullup, bailout: s.q.bailout, p: r2(s.q.p), made: s.made } : null,
    answer: st.answer ? { p: r2(st.answer.p), scored: st.answer.scored } : null,
    scheme: st.scheme, schemeName: SCHEME_NAMES[st.scheme],
    screen: st.lastScreen, screens: (st.uses || []).map(u => ({ screener: u.screener, cutter: u.cutter, name: u.name, t: u.t })),
    passes: st.passes,
    reason: reasonOf(sc, st),
    events: st.events, frames: st.frames
  };
}

/* THE ONE LINE. Short sentences, no dashes (the site's copy rules). What a
   coach would say walking back to the bench: who got the look, off what,
   what their defense did about it, and how it ended. */
export function reasonOf(sc, st) {
  const s = st.shot, how = st.end.how;
  const name = id => id + ' (' + sc.roster[id].arch + ')';
  const zoneWord = z => z === 'three' ? 'three' : z === 'rim' ? 'layup' : 'jumper';
  if (how === 'turnover') {
    const p = st.passes[st.passes.length - 1];
    return 'The pass to ' + p.to + ' got picked off.' + (p.long ? ' Too far.' : ' Somebody sat in the lane.');
  }
  if (how === 'clock') return 'The clock ran out before the shot went up.';
  if (s.q.bailout) {
    const tail = s.made ? ' It went in with ' + s.at.toFixed(1) + ' left.' : ' It missed.';
    return 'Nobody got there in time. ' + name(s.who) + ' threw it up at ' + s.at.toFixed(1) + '.' + tail;
  }
  const uses = st.uses || [];
  let use = null, role = null;
  for (let k = uses.length - 1; k >= 0 && !use; k--) {
    if (uses[k].cutter === s.who) { use = uses[k]; role = 'cut'; }
    else if (uses[k].screener === s.who) { use = uses[k]; role = 'screen'; }
  }
  let off = '';
  if (use && role === 'cut') off = ' off the ' + use.name;
  else if (use && role === 'screen') off = s.q.zone === 'rim' ? ' on the roll' : ' on the pop';
  else if (s.q.pullup) off = ' off the dribble';
  const look = openWord(s.q.open);
  const lead = name(s.who) + ' was ' + look + off + '.';

  // what the defense did, in one short sentence
  let d = '';
  const byArch = s.q.byArch, mine = sc.roster[s.who].arch, T = sc.tuning;
  const edge = ((T.size && T.size[byArch]) || 3) - ((T.size && T.size[mine]) || 3);
  if (st.shotHelp && s.q.by === st.shotHelp) d = ' The help came from ' + s.q.by + '.';
  else if (use && use.scheme === 'switch' && Math.abs(edge) >= 2) d = ' The switch left a ' + byArch + ' on him.';
  else if (use && role === 'screen' && use.scheme === 'over') d = s.q.open >= 4 ? ' His man showed on the ball and never got back.' : ' His man showed on the ball and got back.';
  else if (use && role === 'screen' && use.scheme === 'under') d = ' His man stayed home.';
  else if (use && use.scheme === 'switch') d = ' They switched it.';
  else if (use && use.scheme === 'under') d = s.q.zone === 'rim' ? ' They went under and sat in the lane.' : s.q.open >= 4 ? ' They went under and gave him room.' : ' They went under and still got there.';
  else if (use && use.scheme === 'over') d = s.q.open >= 4 ? ' His man got caught on the screen.' : ' They fought over and got a hand up.';

  const when = s.at.toFixed(1);
  if (how === 'miss') return lead + d + ' The ' + zoneWord(s.q.zone) + ' rimmed out.';
  if (how === 'make') return lead + d + ' The ' + zoneWord(s.q.zone) + ' went in with ' + when + ' left.';
  if (how === 'answer') return lead + d + ' It went in with ' + when + ' left. Too early. They scored at the other end.';
  return lead + d + ' It went in with ' + when + ' left. They missed at the other end.';
}
