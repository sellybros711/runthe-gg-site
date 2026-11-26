/* THE OPTIONS AND THE READ (the owner, 2026-11-26: "the game should know when
 * someone is open to shoot. Every play drawn will have multiple shooting
 * options", and "the person shooting should be the open man depending on what
 * the defense does").
 *
 * TWO HALVES, BOTH PURE:
 *
 *   optionsOf(sc, play)   from the drawing alone: every man who, by the end
 *                         of the play, stands where he can catch and score
 *                         (a play with no action at all has only the man
 *                         with the ball),
 *                         with a short label a coach would say ("wing three
 *                         off the pin-down", "roll to the rim", "spot-up,
 *                         weak side"). The drawn Shoot is option 1; the rest
 *                         are ranked by design value (below). The clipboard
 *                         lists them and the sim reads exactly these.
 *
 *   choose                at the decision moment the sim (readNow) looks
 *                         ahead for each option: how open he will be when the
 *                         ball gets to him and he lets it go, the lane's risk
 *                         (laneRisk), and what the make is worth. choose()
 *                         keeps the call while it is close to the best look,
 *                         and goes off it when the defense took it away.
 *
 * DESIGN VALUE (the clipboard's ranking): the shooter's open make rate for the
 * zone he ends in, times what those points are worth in this game (worthOf),
 * times how the play frees him (HOW): off a screen in full, a roll or a pop a
 * touch less, a spot-up less, a pull-up at the pull-up cost. Under MIN_DESIGN
 * he is not an option (a center at the arc). At most MAX_OPTIONS are listed.
 *
 * Nothing here draws a random number. */
import { COURT, dist, toRim, zoneOf, segDist } from './court-geo.js';
import { IDS, planOf, spotsAfter, holderAfter } from './playbook.js';

export const MAX_OPTIONS = 5;
export const MIN_DESIGN = 0.3;
/* How the play frees each kind of option, for the design ranking only. */
const HOW = { cut: 1, roll: 0.97, pop: 0.92, spot: 0.85, post: 0.8 };

/* What a make of `points` is worth here: 1 if it takes the lead, the
   overtime coin if it ties, nothing if you are still behind. A down 1 game
   values every make the same, so the read there is the best make chance. */
export function worthOf(sc, points) {
  const lead = sc.us + points - sc.them;
  return lead > 0 ? 1 : lead === 0 ? (sc.tuning.overtimeWin ?? 0.5) : 0;
}

/* A spot on the floor in a coach's words. */
export function spotWord(p) {
  const z = zoneOf(p), ax = Math.abs(p.x - COURT.RIM.x);
  if (z === 'rim') return 'at the rim';
  if (z === 'three') return p.y <= COURT.CORNER_Y ? 'corner three' : ax <= 7 ? 'top three' : 'wing three';
  if (p.y >= 15 && ax <= 4) return 'high post';
  if (p.y >= 14 && ax <= 12) return 'elbow jumper';
  if (p.y <= 9 && ax >= 7) return 'baseline jumper';
  return toRim(p) <= 11 ? 'short jumper' : 'long two';
}

/* The man with the ball when the play makes its read, the drawn shooter (or
   null), and the index of the pass the read replaces (or -1). */
export function deciderOf(sc, play) {
  const steps = play.steps || [];
  const shot = steps.findIndex(s => s.kind === 'shoot');
  let lp = -1;
  steps.forEach((s, i) => { if (s.kind === 'pass') lp = i; });
  const shooter = shot >= 0 ? steps[shot].who : null;
  if (lp >= 0 && steps[lp].to === holderAfter(sc, steps)) return { who: steps[lp].from, call: shooter, pass: lp };
  return { who: holderAfter(sc, steps), call: shooter, pass: -1 };
}

/* Every scoring option the drawing makes. Pure: the same play, the same list. */
export function optionsOf(sc, play) {
  if (!play || !play.spots || !Array.isArray(play.steps)) return [];
  let plan;
  try { plan = planOf(sc, play); } catch (e) { return []; }
  const steps = play.steps, end = spotsAfter(play, steps), dec = deciderOf(sc, play);
  const ballAt = dec.call ? end[dec.call] : end[dec.who];
  const action = steps.some(s => (s.kind === 'move' || s.kind === 'screen') && s.who !== dec.who);
  const out = [];
  for (const id of IDS) {
    const at = end[id];
    if (!at || !sc.roster[id]) continue;
    const arch = sc.roster[id].arch, A = sc.archetypes[arch], zone = zoneOf(at), points = zone === 'three' ? 3 : 2;
    // his last route, and what it was
    let j = -1;
    steps.forEach((s, k) => { if ((s.kind === 'move' || s.kind === 'screen') && s.who === id) j = k; });
    /* a play with no action (nobody but the man with the ball moves) has no
       options but his own shot: the defense is set, and a one tap shot stays
       a one tap shot. Once anything is drawn, everybody on the floor counts. */
    if (!action && id !== dec.who && id !== dec.call) continue;
    let kind = 'spot', label;
    const where = spotWord(at);
    const P = j >= 0 ? plan[j] : null;
    if (id === dec.who) {
      kind = 'handler';
      label = zone === 'rim' ? 'drive to the rim' : zone === 'three' ? 'pull-up three' : 'pull-up jumper';
    } else if (P && P.uses.length) {
      kind = 'cut';
      label = (zone === 'rim' ? 'cut to the rim' : where) + ' off the ' + P.name;
    } else if (P && P.start && P.start.mode === 'used') {
      kind = toRim(at) <= 9 ? 'roll' : 'pop';
      label = kind === 'roll' ? 'roll to the rim' : zone === 'three' ? 'pop for three' : 'pop to the ' + where.replace(/ jumper$/, '');
    } else if (zone === 'three') {
      const side = Math.abs(at.x - COURT.RIM.x) <= 5 || Math.abs(ballAt.x - COURT.RIM.x) <= 3 ? null : (at.x - COURT.RIM.x) * (ballAt.x - COURT.RIM.x) > 0 ? 'strong side' : 'weak side';
      label = (at.y <= COURT.CORNER_Y ? 'corner spot-up' : 'spot-up') + (side && id !== dec.call ? ', ' + side : '');
    } else {
      kind = zone === 'rim' ? 'post' : 'spot';
      label = zone === 'rim' ? 'dunker spot' : where;
    }
    const how = kind === 'handler' ? (zone === 'rim' ? 1 : zone === 'three' ? sc.tuning.pullupThree : sc.tuning.pullupTwo) : HOW[kind] || HOW.spot;
    const design = Math.round(A[zone] * worthOf(sc, points) * how * 1000) / 1000;
    out.push({ who: id, kind, at: { x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10 }, zone, points, label, design, call: id === dec.call });
  }
  const call = out.find(o => o.call);
  const rest = out.filter(o => !o.call && o.design >= MIN_DESIGN).sort((a, b) => b.design - a.design || IDS.indexOf(a.who) - IDS.indexOf(b.who));
  const list = (call ? [call, ...rest] : rest).slice(0, MAX_OPTIONS);
  return list.map((o, k) => ({ n: k + 1, ...o }));
}

/* The clipboard's line for an option: "1 O2 wing three off the pin-down". */
export const optionLine = o => o.n + ' ' + o.who + ' ' + o.label;

/* ---------- the read, inside the sim ---------- */

/* The risk that a pass from a to b is lost: distance, and a defender sitting
   in its lane (not the passer's own man, not anybody standing on the passer,
   not the receiver's own man closing out on the catch). The sim's throw and
   the read both use this, so the read weighs the risk the throw will roll. */
export function laneRisk(T, defenders, a, b, o = {}) {
  const len = dist(a, b), long = len > T.longPass;
  let lane = Infinity;
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  for (const x of defenders) {
    if (o.handoff || !L2 || x === o.skip || dist(x.pos, a) <= 2) continue;
    const t = ((x.pos.x - a.x) * dx + (x.pos.y - a.y) * dy) / L2;
    if (t < 0.1 || t > (x.man === o.to ? 0.75 : 0.9)) continue;
    lane = Math.min(lane, segDist(x.pos, a, b));
  }
  const longK = long ? Math.min(1, (len - T.longPass) / 10 + 0.3) : 0;
  const laneK = Math.max(0, Math.min(1, (T.laneCover - lane) / T.laneCover));
  const risk = (T.passRiskLong ?? 0.06) * longK + (T.passRiskLane ?? 0.1) * laneK;
  return { risk, long, laneK, len };
}

/* THE CHOICE. cands: [{ n, who, value, open, call }]. The call is the drawn
   option (n 1): he runs it while its value is at least `stay` of the best
   look, and goes to the best look when the defense took it away.

   THE SEAM FOR A COACH'S ORDER (a future rule, not built): `order`, a list of
   option numbers, would make it a progression: the first one in that order
   that is open (4 ft or more) gets the ball, and with nobody open the best
   look does. Nothing passes it yet, so every read is the default rule. */
export function choose(cands, stay, order) {
  if (!cands.length) return null;
  const best = cands.reduce((b, c) => (c.value > b.value + 1e-9 ? c : b), cands[0]);
  if (Array.isArray(order) && order.length) {
    for (const n of order) { const c = cands.find(q => q.n === n); if (c && c.open >= 4) return { pick: c, why: 'order' }; }
    return { pick: best, why: best.open >= 4 ? 'open' : 'best' };
  }
  const call = cands.find(c => c.call);
  if (call && call.value >= best.value * stay - 1e-9) return { pick: call, why: 'call' };
  return { pick: best, why: best.open >= 4 ? 'open' : 'best' };
}

/* The read's own words, short. lead: what the defense did ("They switched."). */
export function readCaption(read, lead) {
  const c = read.options.find(o => o.call), p = read.options.find(o => o.who === read.pick);
  if (!c || !p || read.why === 'call') return null;
  const head = (lead ? lead + ' ' : '') + c.who + ' covered.';
  if (p.who === read.by) return head + ' ' + p.who + ' keeps it.';
  return head + ' ' + p.who + (p.open >= 4 ? ' open.' : ' the best look.');
}
