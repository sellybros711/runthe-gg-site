/* Your terminology, and the names it gives your plays.
 *
 *   suggest(sc, play, terms) -> { name, parts: [{ text, why }], describe }
 *
 * A coach teaches the playbook their words once, and every play is named from
 * them. Pure: no DOM, no storage. The playbook stores the terms; this reads
 * them. The pattern is 4th and What's names.js, built for basketball: a
 * basketball play is named from its SET and its ACTIONS, not from routes.
 *
 * WHAT A PLAY IS MADE OF, for naming:
 *   set      read from where the five start: Box, Horns, 1-4 High, Stack,
 *            4-Out 1-In, 5-Out (or a set the coach saved under a name)
 *   actions  each screen and handoff, named the way the clipboard names it
 *            (playbook.js planOf: pin-down, flare screen, pick and roll ...),
 *            with who it is for and the side of the floor it happens on
 *
 * THE TERMS (all optional; the preset fills every gap):
 *   preset    'numbers' (Pin 2) or 'positions' (Pin SG)
 *   sets      { setKey: word }
 *   actions   [{ action, side, who, word }]   side: any, left, right; who: any or O1 to O5
 *   series    [{ set, actions: [..], word }]  a set and/or two or more actions together
 *   pattern   the order: any of 'set', 'side', 'play'
 *
 * WHICH RULE WINS (the same rules as 4th and What): a series before single
 * actions, the biggest first (each action it names, and its set, count one).
 * Then each action left takes the most specific action rule: a named player
 * beats a side, a side beats any. Ties go to the rule written first. The same
 * word twice running is said once. A series that names a set takes the set's
 * place too: "Horns plus a pick and roll is Horns Twist" reads Horns Twist.
 */
import { planOf, labelsOf, holderAfter, spotsAfter, shooterOf, IDS } from './playbook.js';
import { COURT, dist, toRim, zoneOf } from './court-geo.js';

export const ACTIONS = Object.freeze(['pin-down', 'down screen', 'flare screen', 'back screen', 'UCLA screen', 'cross screen',
  'stagger', 'pick and roll', 'pick and pop', 'ball screen', 'handoff']);
/* The preset's word for each action, before the player it is for. */
export const ACTION_WORD = Object.freeze({ 'pin-down': 'Pin', 'down screen': 'Down', 'flare screen': 'Flare', 'back screen': 'Back',
  'UCLA screen': 'UCLA', 'cross screen': 'Cross', 'stagger': 'Stagger', 'pick and roll': 'Pick', 'pick and pop': 'Pop',
  'ball screen': 'Ball', 'handoff': 'Handoff' });
export const SETS = Object.freeze({ box: 'Box', horns: 'Horns', high14: '1-4 High', stack: 'Stack', out41: '4-Out', out5: '5-Out', other: 'Set' });
export const SET_KEYS = Object.freeze(Object.keys(SETS));

export function defaults() {
  return { preset: 'numbers', sets: {}, actions: [], series: [], pattern: ['set', 'play'] };
}
export function clean(t) {
  const d = defaults(); t = t || {};
  return {
    preset: t.preset === 'positions' ? 'positions' : 'numbers',
    sets: t.sets && typeof t.sets === 'object' ? t.sets : d.sets,
    actions: Array.isArray(t.actions) ? t.actions : [],
    series: Array.isArray(t.series) ? t.series : [],
    pattern: Array.isArray(t.pattern) && t.pattern.length ? t.pattern : d.pattern
  };
}

/* ---------- reading a play ---------- */

/* The set, from where the five start. Feet: the rim at (25, 5.25). */
export function setOf(spots) {
  const P = IDS.map(id => spots[id]);
  const off = p => Math.abs(p.x - COURT.RIM.x);
  const block = p => p.y < 11 && off(p) >= 3 && off(p) <= 11;
  const elbow = p => p.y >= 14 && p.y <= 23 && off(p) >= 4 && off(p) <= 11;
  const corner = p => p.y < 12 && off(p) >= 17;
  const top = p => p.y >= 24 && off(p) <= 9;
  const outside = p => toRim(p) >= 19;
  const count = f => P.filter(f).length;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (dist(P[i], P[j]) < 3.5 && P[i].y < 14) return 'stack';
  if (count(top) >= 1 && count(elbow) === 2 && count(corner) === 2) return 'horns';
  if (count(top) >= 1 && count(elbow) === 2 && count(block) === 2) return 'box';
  if (count(top) >= 1 && P.filter(p => p.y >= 13 && p.y <= 24 && !top(p)).length === 4) return 'high14';
  if (count(outside) === 5) return 'out5';
  if (count(outside) === 4) return 'out41';
  return 'other';
}

const sideOf = p => (p.x < COURT.RIM.x ? 'left' : 'right');

/* Every action in the play, in drawing order. */
export function describe(sc, play, opt = {}) {
  const set = opt.set || setOf(play.spots);
  let plan = null;
  try { plan = planOf(sc, play); } catch (e) { plan = null; }
  const labels = labelsOf(sc, play), actions = [];
  play.steps.forEach((s, j) => {
    const action = labels[j];
    if (!action || !ACTIONS.includes(action)) return;
    const P = plan && plan[j];
    let who = s.who, screener = null, at = null;
    if (s.kind === 'pass') { who = s.to; screener = s.from; at = spotsAfter(play, play.steps.slice(0, j))[s.from]; }
    else if (P && P.uses.length) { screener = play.steps[P.uses[0].screen].who; at = P.uses[0].at; }
    actions.push({ action, who, screener, side: sideOf(at || s.pts[s.pts.length - 1]), order: j, beat: s.beat || 1 });
  });
  const shooter = shooterOf(play);
  const shotAt = shooter ? spotsAfter(play, play.steps)[shooter] : null;
  return { set, side: actions.length ? actions[0].side : null, actions, shooter, shotZone: shotAt ? zoneOf(shotAt) : null,
    handler: holderAfter(sc, []) };
}

/* ---------- matching ---------- */

const any = v => !v || v === 'any';
const BALL_SCREENS = ['pick and roll', 'pick and pop', 'ball screen'];
function tagFor(sc, who, preset) {
  if (!who) return '';
  return preset === 'positions' ? sc.roster[who].arch : who.slice(1);
}

/* Series: the biggest first; each takes actions once, and its set if it names one. */
function matchSeries(d, series) {
  const used = {}, hits = [];
  let setUsed = false;
  const list = series.map((c, i) => ({ c, i }))
    .filter(x => x.c && x.c.word && Array.isArray(x.c.actions) && (x.c.actions.length + (any(x.c.set) ? 0 : 1)) >= 2)
    .sort((a, b) => (b.c.actions.length + (any(b.c.set) ? 0 : 1)) - (a.c.actions.length + (any(a.c.set) ? 0 : 1)) || a.i - b.i);
  for (const { c } of list) {
    if (!any(c.set) && (setUsed || c.set !== d.set)) continue;
    const take = [];
    const ok = c.actions.every(a => {
      const hit = d.actions.find(x => x.action === a && !used[x.order] && !take.includes(x));
      if (hit) { take.push(hit); return true; }
      return false;
    });
    if (!ok) continue;
    take.forEach(x => { used[x.order] = true; });
    if (!any(c.set)) setUsed = true;
    const what = [any(c.set) ? null : SETS[c.set]].concat(c.actions).filter(Boolean).join(' plus ');
    hits.push({ order: take.length ? Math.min(...take.map(x => x.order)) : -1, text: c.word, why: what + ' is ' + c.word, set: !any(c.set) });
  }
  return { hits, used, setUsed };
}

function actionWord(sc, a, rules, preset) {
  let best = null, bs = -1;
  rules.forEach(x => {
    if (!x || !x.word || x.action !== a.action) return;
    if (!any(x.who) && x.who !== a.who) return;
    if (!any(x.side) && x.side !== a.side) return;
    const score = (any(x.who) ? 0 : 4) + (any(x.side) ? 0 : 2);
    if (score > bs) { bs = score; best = x; }
  });
  if (best) return { text: best.word, why: a.action + (any(best.who) ? '' : ' for ' + tagFor(sc, a.who, preset)) + (any(best.side) ? '' : ' on the ' + a.side) + ' is ' + best.word };
  /* a ball screen is called by who sets it (Pick 4); the rest by who it frees (Pin 2) */
  const tag = tagFor(sc, BALL_SCREENS.includes(a.action) ? a.screener : a.who, preset);
  return { text: (ACTION_WORD[a.action] || a.action) + (tag ? ' ' + tag : ''), why: null };
}

/* ---------- the name ---------- */

export function suggest(sc, play, terms, opt = {}) {
  terms = clean(terms);
  const d = describe(sc, play, opt);
  const mc = matchSeries(d, terms.series);
  const items = mc.hits.slice();
  d.actions.forEach(a => { if (!mc.used[a.order]) { const w = actionWord(sc, a, terms.actions, terms.preset); w.order = a.order; items.push(w); } });
  items.sort((a, b) => a.order - b.order);
  /* a series that names a set stands where the set would */
  const setHit = mc.hits.find(h => h.set) || null;
  let playParts = items.filter(x => x !== setHit).filter((x, i, a) => i === 0 || x.text !== a[i - 1].text).slice(0, 3);
  if (!playParts.length && !setHit && d.shooter) {
    const z = d.shotZone === 'three' ? 'Three' : d.shotZone === 'rim' ? 'Drive' : 'Jumper';
    playParts = [{ text: z + ' ' + tagFor(sc, d.shooter, terms.preset), why: null }];
  }
  const setWord = opt.setName || terms.sets[d.set] || SETS[d.set];
  const parts = [];
  terms.pattern.forEach(p => {
    if (p === 'set' && setHit) parts.push({ text: setHit.text, why: setHit.why });
    else if (p === 'set' && setWord) parts.push({ text: setWord, why: opt.setName ? 'your saved set' : terms.sets[d.set] ? 'your word for ' + SETS[d.set] : null });
    else if (p === 'side' && d.side) parts.push({ text: d.side === 'left' ? 'Left' : 'Right', why: null });
    else if (p === 'play') playParts.forEach(x => parts.push({ text: x.text, why: x.why }));
  });
  if (setHit && !terms.pattern.includes('set')) parts.unshift({ text: setHit.text, why: setHit.why });
  const name = parts.map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
  return { name: name || 'New play', parts, describe: d };
}

/* A frame's caption, from its actions and passes: "5 pins down for 2." */
export function captionOf(sc, play, beat, terms) {
  terms = clean(terms);
  const t = who => tagFor(sc, who, terms.preset);
  const d = describe(sc, play);
  const out = [];
  play.steps.forEach((s, j) => {
    if ((s.beat || 1) !== beat) return;
    const a = d.actions.find(x => x.order === j);
    if (a && a.action === 'handoff') out.push(t(a.screener) + ' hands off to ' + t(a.who) + '.');
    else if (a && a.screener) out.push(t(a.screener) + ' sets the ' + a.action + ' for ' + t(a.who) + '.');
    else if (s.kind === 'pass') out.push(t(s.from) + ' passes to ' + t(s.to) + '.');
    else if (s.kind === 'shoot') out.push(t(s.who) + ' shoots.');
  });
  return out.join(' ');
}
