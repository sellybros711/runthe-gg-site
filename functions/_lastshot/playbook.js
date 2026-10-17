/* THE PLAY, AS DRAWN. A play is where the five start and an ordered list of
 * steps. The clipboard (board.js) builds one; the sim runs one; the tests
 * write them by hand.
 *
 *   { spots: { O1: {x,y}, ... },
 *     steps: [ { kind: 'move',   who: 'O2', pts: [{x,y}, ...] },
 *              { kind: 'screen', who: 'O5', pts: [...] },
 *              { kind: 'pass',   from: 'O1', to: 'O2' },
 *              { kind: 'shoot',  who: 'O2' } ] }
 *
 * THE ORDER RULE. Steps run in number order. A move or screen starts when the
 * step before it is finished (a screen is finished once it is set, and then it
 * holds). A pass is thrown when its turn comes and lands when the receiver
 * reaches the end of the segment he is on, at once if he is standing. The shot
 * goes up when its turn comes, or at the bail-out mark if it never does. */
export const IDS = Object.freeze(['O1', 'O2', 'O3', 'O4', 'O5']);

export function emptyPlay(sc) {
  return { spots: JSON.parse(JSON.stringify(sc.spots)), steps: [] };
}

/* Who has the ball after the steps so far. */
export function holderAfter(sc, steps) {
  let h = sc.handler;
  for (const s of steps) if (s.kind === 'pass' && s.from === h) h = s.to;
  return h;
}

/* Where each player stands once the steps so far have run. */
export function spotsAfter(play, steps) {
  const at = JSON.parse(JSON.stringify(play.spots));
  for (const s of steps) if ((s.kind === 'move' || s.kind === 'screen') && s.pts.length) at[s.who] = { ...s.pts[s.pts.length - 1] };
  return at;
}

export function shooterOf(play) {
  const s = play.steps.find(s => s.kind === 'shoot');
  return s ? s.who : null;
}

/* Every reason a play cannot run, in plain words. Empty means Run It. */
export function problems(sc, play) {
  const out = [];
  const shots = play.steps.filter(s => s.kind === 'shoot');
  if (shots.length === 0) out.push('Pick a shooter.');
  if (shots.length > 1) out.push('One shooter only.');
  let h = sc.handler;
  play.steps.forEach((s, i) => {
    if (!s || !s.kind) { out.push('Step ' + (i + 1) + ' is broken.'); return; }
    if (s.kind === 'pass') {
      if (s.from !== h) out.push('Step ' + (i + 1) + ': ' + s.from + ' does not have the ball.');
      else if (s.to === s.from || !IDS.includes(s.to)) out.push('Step ' + (i + 1) + ': pass to a teammate.');
      else h = s.to;
    } else if (s.kind === 'shoot') {
      if (s.who !== h) out.push(s.who + ' needs the ball to shoot.');
      if (i !== play.steps.length - 1) out.push('The shot is the last step.');
    } else if (s.kind === 'move' || s.kind === 'screen') {
      if (!IDS.includes(s.who) || !Array.isArray(s.pts) || !s.pts.length) out.push('Step ' + (i + 1) + ' has no route.');
    } else out.push('Step ' + (i + 1) + ' is broken.');
  });
  return out;
}

/* A stable key for a play, for the seed and the debug panel. */
export function playKey(play) {
  const r = n => Math.round(n * 10) / 10;
  const spots = IDS.map(id => r(play.spots[id].x) + ',' + r(play.spots[id].y)).join(';');
  const steps = play.steps.map(s => s.kind[0] + (s.who || s.from + s.to) + (s.pts ? ':' + s.pts.map(p => r(p.x) + ',' + r(p.y)).join(' ') : '')).join('|');
  return spots + '#' + steps;
}
