/* MAN TO MAN, AND WHAT HAPPENS ON A SCREEN.
 *
 * Every X guards one O. He stands between his man and the rim: tight on the
 * ball, a step off away from it and shaded toward the ball (help). He chases
 * with a lag (motion.js), so a hard cut gains a step.
 *
 * One screen scheme is rolled per possession and revealed on the result:
 *
 *   switch  the screener's defender takes the cutter. The gap stays small,
 *           but a big can end up on a guard.
 *   over    the cutter's defender fights over the top. He is held for
 *           overHold seconds, then chases from behind: open on the catch.
 *   under   the cutter's defender ducks under the screen and sags underGap
 *           feet off for underTime seconds: open for a jumper, the rim covered.
 */
import { COURT, dist } from './court-geo.js';

/* Where X wants to stand right now. */
export function targetFor(x, st, T) {
  const man = st.O[x.man], rim = COURT.RIM;
  const onBall = st.ball.holder === x.man;
  const toRimX = rim.x - man.pos.x, toRimY = rim.y - man.pos.y, L = Math.hypot(toRimX, toRimY) || 1;
  let gap = onBall ? T.onBallGap : T.offBallGap;
  if (x.underT > 0) gap = Math.max(gap, T.underGap);
  gap = Math.min(gap, L * 0.6);
  let tx = man.pos.x + toRimX / L * gap, ty = man.pos.y + toRimY / L * gap;
  if (!onBall) {
    const b = ballPos(st);
    tx += (b.x - tx) * T.help; ty += (b.y - ty) * T.help;
  }
  return { x: tx, y: ty };
}

export function ballPos(st) {
  if (st.ball.holder) return st.O[st.ball.holder].pos;
  return st.ball.pos;
}

/* Called every tick. A cutter (moving, not the screener) who passes within
   screenReach of a set screen meets the scheme, once per screen and cutter.
   Returns a caption event or null. */
export function screens(st, T) {
  let ev = null;
  for (const sid of Object.keys(st.O)) {
    const s = st.O[sid];
    if (!s.screen) continue;
    for (const cid of Object.keys(st.O)) {
      if (cid === sid) continue;
      const c = st.O[cid];
      const key = sid + '>' + cid + '@' + s.screen.n;
      if (st.screened[key] || !c.path.length) continue;
      if (dist(c.pos, s.screen.at) > T.screenReach) continue;
      st.screened[key] = true;
      const xc = defenderOf(st, cid), xs = defenderOf(st, sid);
      if (!xc || !xs) continue;
      const scheme = st.scheme;
      if (scheme === 'switch') { const m = xc.man; xc.man = xs.man; xs.man = m; }
      else if (scheme === 'over') xc.holdT = T.overHold;
      else xc.underT = T.underTime;
      st.lastScreen = { screener: sid, cutter: cid, kind: screenKind(st, s, c), t: st.clock };
      ev = { kind: 'screen', scheme, screener: sid, cutter: cid };
    }
  }
  return ev;
}

export function defenderOf(st, oid) {
  for (const x of st.X) if (x.man === oid) return x;
  return null;
}

/* What a coach would call this screen. */
export function screenKind(st, s, c) {
  if (st.ball.holder === c.id) return 'ball screen';
  const goal = c.path.length ? c.path[c.path.length - 1] : c.pos;
  if (goal.y > c.pos.y + 2 && s.screen.from && s.screen.from.y > s.screen.at.y) return 'pin-down';
  if (goal.y > c.pos.y + 2) return 'down screen';
  if (goal.y < c.pos.y - 2) return 'back screen';
  return 'screen';
}
