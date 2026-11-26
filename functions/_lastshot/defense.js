/* MAN TO MAN, AND WHAT HAPPENS ON A SCREEN.
 *
 * POSITION. Every X guards one O and stands between his man and the rim.
 *   on the ball   onBallGap feet off, a big more if he is out on a guard
 *                 (cushion: he cannot let the quick man by, so he concedes
 *                 the jumper)
 *   off the ball  offGap feet off by who he guards (glued to the SG, well off
 *                 the C), shaded toward the ball: a little one pass away
 *                 (deny), a lot two passes away (help), scaled by sag
 *   in the air    the receiver's man closes out to where the ball will land
 * He chases with a lag (motion.js), so a hard cut gains a step.
 *
 * LOW MAN HELP. A ball inside helpZone feet with his own defender beaten
 * brings the helper nearest the rim after helpDelay, to stand between the
 * ball and the rim. Nobody helps off the SG. The helper's own man is the one
 * left open, which is the whole point of a drive and kick.
 *
 * THE TAG (2026-11-26). A cutter coming free (on the move, his own man
 * tagGap feet or more behind him and trailing, not sat rim side, after
 * tagDelay) gets a tag from the
 * nearest defender within tagReach: never the man on the ball, never the
 * one on the SG, never a man going under (that concedes the jumper on
 * purpose). The tagger steps into the cutter's path, tagOff feet off him
 * rim side, until the cutter's own man is back (tagHold seconds after) or
 * the ball goes to the tagger's own man, who is the one left open. That is
 * what the read (sim.js, reads.js) sees: the primary covered, the tagger's
 * man free. A zone does not tag: it sits.
 *
 * ONE SCREEN SCHEME is rolled per possession and revealed on the result. Each
 * has a strength and a price:
 *   switch  the screener's man takes the cutter. No gap at the screen, but
 *           a big can end up on a guard (who gets room for a three, or a
 *           step to the rim) and a guard on a big (who gets the rim).
 *   over    the cutter's man fights over the top: stuck on the screener for
 *           overHold, then trailing. The screener's man shows on the ball (or
 *           bumps a curl) for showTime. No mismatch, the jumper gets a late
 *           hand, but a cut to the rim or a roll gets behind it.
 *   under   the cutter's man ducks under the screen and sags underGap feet
 *           off for underTime. The rim and the roll stay covered, the
 *           jumper is wide open. Going under a pin-down for a shooter is the
 *           one thing a coach screams about.
 * The sim calls useScreen() when a cutter reaches a screen he was drawn off.
 *
 * ZONES (2026-10-30). Instead of a man, a zone defender owns a spot in the
 * zone's shape (ZONE_SHAPES), and the whole shape shifts toward the ball.
 * He takes the man nearest his spot within zoneReach, stands between him and
 * the rim on a leash back to the spot, and closes out on the ball when it
 * comes into his area. A zone does not chase screens: it sits. The gaps a
 * coach attacks come out of the shapes, not out of rules: a 2-3 is soft in
 * the corners and the high post, a 1-3-1 on the short corner and the
 * baseline, a 3-2 in the middle and on the block.
 * The MATCH-UP zone plays man principles, switches every screen and sags into
 * the lane like a zone. */
import { COURT, dist, toRim } from './court-geo.js';
import { isAreaZone } from './scenario.js';

/* Each zone's spots, by defender (X1 the PG's size up to X5 the C's). */
export const ZONE_SHAPES = Object.freeze({
  zone23: { X1: { x: 18, y: 21 }, X2: { x: 32, y: 21 }, X3: { x: 10, y: 9 }, X4: { x: 40, y: 9 }, X5: { x: 25, y: 7 } },
  zone131: { X1: { x: 25, y: 29 }, X2: { x: 39, y: 18 }, X3: { x: 11, y: 18 }, X4: { x: 25, y: 16 }, X5: { x: 25, y: 5.5 } },
  zone32: { X1: { x: 25, y: 27 }, X2: { x: 39, y: 20 }, X3: { x: 12, y: 19 }, X4: { x: 19, y: 8 }, X5: { x: 31, y: 8 } }
});

/* Where a zone defender stands. Sets x.man to the man he has, so help, the
   result and the debug lines read the same as in man. */
function zoneTarget(x, st, T) {
  const shape = ZONE_SHAPES[st.scheme], R = COURT.RIM;
  /* A zone reacts to the catch: while a pass is in the air the shape follows
     the ball, and nobody leaves his spot to meet it. That is what a skip pass
     beats. */
  const b = ballPos(st);
  const spot = id => {
    const a = shape[id];
    return { x: a.x + ((b ? b.x : 25) - 25) * (T.zoneShiftX ?? 0.35), y: Math.max(3, a.y + ((b ? b.y : 16) - 16) * (T.zoneShiftY ?? 0.22)) };
  };
  const me = spot(x.id);
  // the ball is mine when my spot is the nearest to it
  if (b) {
    let near = null, nd = Infinity;
    for (const y of st.X) { const d = dist(spot(y.id), b); if (d < nd) { nd = d; near = y; } }
    const holder = st.ball.holder;
    if (near === x && holder) {
      x.man = holder;
      const L = toRim(b) || 1, g = Math.min(T.onBallGap ?? 3, L * 0.6);
      return { x: b.x + (R.x - b.x) / L * g, y: b.y + (R.y - b.y) / L * g };
    }
  }
  // else the man nearest my spot, on a leash back to it
  let man = null, md = T.zoneReach ?? 9.5;
  for (const id of Object.keys(st.O)) { const d = dist(st.O[id].pos, me); if (d < md) { md = d; man = id; } }
  if (!man) return me;
  x.man = man;
  const P = st.O[man].pos, L = toRim(P) || 1, g = Math.min(T.zoneGap ?? 3.2, L * 0.6);
  const t = { x: P.x + (R.x - P.x) / L * g, y: P.y + (R.y - P.y) / L * g };
  const k = T.zoneLeash ?? 0.6;
  return { x: me.x + (t.x - me.x) * k, y: me.y + (t.y - me.y) * k };
}

const sizeOf = (T, a) => (T.size && T.size[a]) || 3;

/* Where X wants to stand right now. */
export function targetFor(x, st, T) {
  if (!x.arch) x.arch = st.O[x.man].arch;
  const R = COURT.RIM;
  if (x.freezeT > 0 && x.pos) return { ...x.pos };
  if (isAreaZone(st.scheme) && !(st.help && st.help.x === x.id)) return zoneTarget(x, st, T);
  if (st.help && st.help.x === x.id) return { ...st.help.spot };
  if (st.tag && st.tag.x === x.id && st.tag.spot) {
    const f = st.ball.flight;
    if (!(f && !f.lost && f.to === x.man)) return { ...st.tag.spot };
  }
  if (x.showT > 0 && x.showOn) return showSpot(st, x.showOn);

  const man = st.O[x.man], b = ballPos(st);
  const fl = st.ball.flight;
  const onBall = st.ball.holder === x.man || (fl && fl.to === x.man && !fl.lost);
  const P = onBall && fl && fl.to === x.man ? fl.b : man.pos;
  const toRimX = R.x - P.x, toRimY = R.y - P.y, L = Math.hypot(toRimX, toRimY) || 1;
  let gap;
  if (onBall) {
    gap = T.onBallGap ?? 3;
    const edge = sizeOf(T, x.arch) - sizeOf(T, man.arch);
    if (edge >= 2 && toRim(P) > 16) gap += (T.cushion ?? 1.4) * (edge - 1);
  } else gap = ((T.offGap && T.offGap[man.arch]) ?? 4) + (st.scheme === 'matchup' ? (T.matchupGap ?? 1.5) : 0);
  if (x.underT > 0) gap = Math.max(gap, T.underGap);
  gap = Math.min(gap, L * 0.6);
  let tx = P.x + toRimX / L * gap, ty = P.y + toRimY / L * gap;
  if (!onBall && b) {
    const far = dist(man.pos, b) > (T.farSide ?? 24);
    const h = (far ? (T.helpFar ?? 0.28) : (T.helpNear ?? 0.1)) * ((T.sag && T.sag[man.arch]) ?? 1) * (st.scheme === 'matchup' ? (T.matchupSag ?? 2) : 1);
    tx += (b.x - tx) * h; ty += (b.y - ty) * h;
  }
  return { x: tx, y: ty };
}

/* Showing on the ball, or bumping a curl: a step in front of the man, the
   way he is heading, rim side. */
function showSpot(st, oid) {
  const o = st.O[oid], v = o.vel || { x: 0, y: 0 }, sp = Math.hypot(v.x, v.y);
  const R = COURT.RIM, L = toRim(o.pos) || 1;
  const hx = sp > 1 ? v.x / sp : (R.x - o.pos.x) / L, hy = sp > 1 ? v.y / sp : (R.y - o.pos.y) / L;
  return { x: o.pos.x + hx * 3 + (R.x - o.pos.x) / L * 1, y: o.pos.y + hy * 3 + (R.y - o.pos.y) / L * 1 };
}

export function ballPos(st) {
  if (st.ball.holder) return st.O[st.ball.holder].pos;
  return st.ball.pos;
}

export function defenderOf(st, oid) {
  for (const x of st.X) if (x.man === oid) return x;
  return null;
}

/* Called by the sim once a tick, before the defenders move: the timers this
   file owns and the low man help. Returns null (screen captions come from
   the step runner, which knows what the screen is called). */
export function screens(st, T) {
  const dt = st._defClock == null ? 0 : Math.max(0, st._defClock - st.clock);
  st._defClock = st.clock;
  for (const x of st.X) {
    if (!x.arch) x.arch = st.O[x.man].arch;
    x.showT = Math.max(0, (x.showT || 0) - dt);
    x.freezeT = Math.max(0, (x.freezeT || 0) - dt);
  }
  helpCheck(st, T, dt);
  tagCheck(st, T, dt);
  return null;
}

function tagCheck(st, T, dt) {
  if (!(T.tagGap > 0) || isAreaZone(st.scheme) || st.shot) { st.tag = null; st.tagT = 0; return; }
  const H = st.ball.holder, fl = st.ball.flight;
  // the cutter coming free the most
  let best = null, bg = 0;
  if (H) for (const id of Object.keys(st.O)) {
    const o = st.O[id];
    // a cutter, not a screener on his way to set one
    if (id === H || !o.path.length || o.pending || (o.spd || 0) < (T.tagSpeed ?? 6)) continue;
    const xc = defenderOf(st, id);
    // only a man trailing him: going under, or a switch that sits rim side, is a choice, not a beat
    if (!xc || xc.underT > 0 || dist(xc.pos, COURT.RIM) < toRim(o.pos) - 1) continue;
    const g = dist(xc.pos, o.pos);
    if (g >= T.tagGap && g > bg) { bg = g; best = id; }
  }
  const tg = st.tag;
  if (tg) {
    const xc = defenderOf(st, tg.on), back = xc && dist(xc.pos, st.O[tg.on].pos) < (T.tagBack ?? 3.5);
    const toMine = fl && !fl.lost && st.X.some(x => x.id === tg.x && x.man === fl.to);
    if (toMine) { st.tag = null; st.tagT = 0; return; }
    if (best && best !== tg.on && bg > dist(defenderOf(st, tg.on).pos, st.O[tg.on].pos)) { st.tag = null; st.tagT = 0; }
    else if (back) tg.left -= dt; else tg.left = T.tagHold ?? 0.6;
    if (!st.tag || tg.left <= 0) { st.tag = null; st.tagT = 0; }
    else { tg.spot = tagSpot(st, tg.on, T); return; }
  }
  if (!best) { st.tagT = 0; return; }
  st.tagT = (st.tagT || 0) + dt;
  if (st.tagT < (T.tagDelay ?? 0.15)) return;
  const xc = defenderOf(st, best), xh = defenderOf(st, H), C = st.O[best].pos;
  // the screener's man has the screener (he shows, or switches): the tag comes from elsewhere
  const scr = (st.uses || []).filter(u => u.cutter === best).map(u => u.screener);
  let who = null, wd = T.tagReach ?? 14;
  for (const x of st.X) {
    if (x === xc || x === xh || st.O[x.man].arch === 'SG' || scr.includes(x.man) || (st.help && st.help.x === x.id)) continue;
    const d = dist(x.pos, C);
    if (d < wd) { wd = d; who = x; }
  }
  if (who) st.tag = { x: who.id, on: best, left: T.tagHold ?? 0.6, spot: tagSpot(st, best, T) };
}

/* In the cutter's path: tagOff feet off him toward the rim, a beat ahead of
   where he is heading. */
function tagSpot(st, oid, T) {
  const o = st.O[oid], v = o.vel || { x: 0, y: 0 }, R = COURT.RIM;
  const a = { x: o.pos.x + v.x * 0.25, y: o.pos.y + v.y * 0.25 }, L = toRim(a) || 1, g = Math.min(T.tagOff ?? 2.5, L * 0.6);
  return { x: a.x + (R.x - a.x) / L * g, y: a.y + (R.y - a.y) / L * g };
}

function helpCheck(st, T, dt) {
  const R = COURT.RIM, fl = st.ball.flight;
  let att = null, A = null;
  if (st.ball.holder) { att = st.ball.holder; A = st.O[att].pos; }
  else if (fl && !fl.lost) { att = fl.to; A = fl.b; }
  const lost = (x, P) => x.holdT > 0 || x.freezeT > 0 || dist(x.pos, R) > toRim(P) - 0.5 || dist(x.pos, P) > 5;
  let xd = att ? defenderOf(st, att) : null;
  let inside = A && toRim(A) <= (T.helpZone ?? 13);
  /* THE LOW MAN TAGS THE ROLL (2026-11-26): with the ball outside, a man
     rolling or cutting inside helpZone with his own defender lost draws the
     help before the pass, as a coach teaches it. His man is the one left. */
  if (!inside && st.ball.holder && (T.rollHelp ?? true)) {
    let bd = Infinity;
    for (const id of Object.keys(st.O)) {
      const o = st.O[id], xo = defenderOf(st, id);
      if (id === st.ball.holder || !o.path.length || o.pending || (o.spd || 0) < 6 || !xo) continue;
      const d = toRim(o.pos);
      if (d <= (T.helpZone ?? 13) && d < bd && lost(xo, o.pos)) { bd = d; att = id; A = o.pos; xd = xo; inside = true; }
    }
  }
  const beaten = inside && xd && lost(xd, A);
  if (!beaten || st.shot) { st.helpT = 0; st.help = null; return; }
  st.helpT = (st.helpT || 0) + dt;
  if (st.helpT < (T.helpDelay ?? 0.25)) return;
  if (!st.help || st.help.on !== att) {
    let best = null, bd = Infinity;
    for (const x of st.X) {
      if (x === xd || st.O[x.man].arch === 'SG') continue;
      const d = dist(x.pos, R);
      if (d < bd) { bd = d; best = x; }
    }
    if (!best) { st.help = null; return; }
    st.help = { x: best.id, on: att, spot: null };
  }
  const k = Math.min(3, toRim(A) * 0.6), L = toRim(A) || 1;
  st.help.spot = { x: A.x + (R.x - A.x) / L * k, y: A.y + (R.y - A.y) / L * k };
}

/* A cutter has reached the screen he was drawn off. Apply the scheme.
   name is what the screen is called ('pin-down', 'pick and roll', ...). */
export function useScreen(st, T, screener, cutter, name) {
  const xc = defenderOf(st, cutter), xs = defenderOf(st, screener);
  if (!xc || !xs || xc === xs) return null;
  const scheme = st.scheme, ball = st.ball.holder === cutter;
  if (isAreaZone(scheme)) {
    // a zone sits: nobody chases the cutter over or under, the next spot picks him up
  } else if (scheme === 'switch' || scheme === 'matchup') {
    const m = xc.man; xc.man = xs.man; xs.man = m;
    xc.freezeT = xs.freezeT = T.switchBeat ?? 0.2;
  } else if (scheme === 'over') {
    xc.holdT = T.overHold;
    xs.showT = (T.showTime ?? 0.7) * (ball ? 1 : 0.6);
    xs.showOn = cutter;
  } else {
    xc.underT = T.underTime;
  }
  const use = { screener, cutter, kind: name, name, scheme, t: Math.round(st.clock * 10) / 10, xc: xc.id, xs: xs.id };
  st.lastScreen = use;
  (st.uses || (st.uses = [])).push(use);
  return use;
}

/* Where the defenders start, for the clipboard: the same rule the sim uses. */
export function startSpots(sc, play) {
  const st = { O: {}, X: [], ball: { holder: sc.handler, pos: null, flight: null } };
  for (const id of Object.keys(play.spots)) st.O[id] = { id, arch: sc.roster[id].arch, pos: { ...play.spots[id] }, vel: { x: 0, y: 0 } };
  const out = {};
  for (const [xid, man] of Object.entries(sc.matchups)) st.X.push({ id: xid, man, holdT: 0, underT: 0 });
  for (const x of st.X) out[x.id] = targetFor(x, st, sc.tuning);
  return out;
}
