/* RunTheHouse, the visual language.
 *
 * Browser only. window.RH_UI.
 *
 * WHY THIS IS A FILE AND NOT CSS
 *
 * The simulation tracks a lot: how sixteen people feel about you, how stale
 * each of those reads is, who is working with whom, who holds power, who is on
 * the block, who is hungry, who is holding something secret. All of it was
 * rendered as small grey text in the same size and weight, and the result was
 * unreadable. A player could not answer "who is dangerous to me right now"
 * without reading fifteen labels one at a time.
 *
 * GDD §17 forbids relationship NUMBERS. It does not forbid making things
 * legible, and taking numbers away raises the bar on everything else: if you
 * cannot say 62, the colour and the shape have to carry it.
 *
 * ── THE COLOUR LANGUAGE ────────────────────────────────────────────────────
 *
 * One journey, red through grey to blue, and it means exactly one thing
 * everywhere it appears: how somebody feels about YOU.
 *
 *   red      they want you gone
 *   grey     nothing either way
 *   blue     they are with you
 *
 * That keeps §17's rule that the aggressive accent belongs to eviction and
 * betrayal, because the red end of this ramp IS betrayal. Nothing else in the
 * interface may use these seven colours for anything else, or the language
 * stops meaning anything.
 *
 * The warm end used to be gold, which was the right answer on a black panel and
 * is invisible on cream. Blue is now both the brand and the top of this ramp,
 * which is a happy accident worth keeping: the house colour literally means
 * somebody is with you. Every value below is picked for contrast against
 * --panel (#ffffff) and --cream (#f7f3ea), not against black.
 *
 * ── EVERY GLYPH DRAWN FOR THIS GAME ────────────────────────────────────────
 *
 * §17 again: no stock icon sets. These are geometric, hard-edged, and read as
 * stencilled onto institutional surfaces rather than as app furniture.
 */

'use strict';

(function () {

// ─── the relationship ramp ───────────────────────────────────────────────────

/* Keyed by the label engine.band() returns, so there is one source of truth for
   the bands and this file cannot drift out of step with the model. */
/*
 * SEVEN STEPS, AND THEY HAVE TO BE TELLABLE APART AT A GLANCE.
 *
 * The first light-theme pass ran red through brown through grey into blue,
 * which is elegant on paper and useless in practice: Cold, Wary and Neutral
 * were three muddy neighbours, and a wall of sixteen tiles read as one colour.
 * Playtest, correctly: "the colors that represent your relationship status feel
 * way too dull and need to be way more clear and identifiable."
 *
 * So the ramp now moves through HUE as well as temperature. It still means one
 * thing and only one thing, how somebody feels about YOU, and it still ends on
 * the house blue so the brand colour means somebody is with you. Grey sits at
 * the middle on purpose and is the only desaturated step in the set, because
 * "nothing either way" should look like the absence of a reading rather than
 * like a reading.
 *
 * `dim` is the wash used behind a tile. `on` is a text colour for that wash.
 */
const BAND = {
  'Done with you': { c: '#c81e14', dim: '#fbdedc', on: '#8e120b', i: 0, short: 'Done' },
  'Cold':          { c: '#e2601d', dim: '#fde6d6', on: '#9c3f0d', i: 1, short: 'Cold' },
  'Wary':          { c: '#c99000', dim: '#fbf0cf', on: '#8a6200', i: 2, short: 'Wary' },
  'Neutral':       { c: '#8c98a5', dim: '#e8ebef', on: '#5d6b7a', i: 3, short: 'Flat' },
  'Warm':          { c: '#1c9e63', dim: '#d7f2e5', on: '#116b43', i: 4, short: 'Warm' },
  'Solid':         { c: '#1668dc', dim: '#d8e6fb', on: '#0f4694', i: 5, short: 'Solid' },
  'Ride or die':   { c: '#5b2bc4', dim: '#e6dcfa', on: '#3e1c8a', i: 6, short: 'Bonded' },
};
const BAND_ORDER = Object.keys(BAND);

function bandColor(label) { return (BAND[label] || BAND.Neutral).c; }
function bandDim(label) { return (BAND[label] || BAND.Neutral).dim; }
function bandOn(label) { return (BAND[label] || BAND.Neutral).on; }
function bandIndex(label) { return (BAND[label] || BAND.Neutral).i; }

/*
 * Staleness as a visual, not a sentence. A read you refreshed this week is
 * solid; one you have not touched in a month is a dashed outline of what it
 * used to be. The player should be able to see neglect across the whole house
 * in one glance, because neglect is the pressure the entire relationship engine
 * runs on and it was previously buried in the words "going stale".
 */
function freshOpacity(conf) { return 0.35 + 0.65 * Math.max(0, Math.min(1, conf)); }
function freshDash(conf) { return conf >= 0.7 ? 'none' : (conf >= 0.4 ? '5 3' : '2 4'); }

// ─── icons ───────────────────────────────────────────────────────────────────

/*
 * 24x24, stroke-first, drawn for this game. Each one is a shape a person could
 * stencil onto a wall: no gradients, no rounded friendliness, nothing that
 * looks bought.
 */
const PATHS = {
  /* Authority. Three rising bars under a lid. */
  captain: '<path d="M4 19h16M6 15h3v4H6zM10.5 11h3v8h-3zM15 7h3v12h-3zM3 4h18"/>',
  /* On the block. A crosshair, because that is what it is. */
  risk: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  /* Safety. A shield. */
  veto: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  /* Rations. An empty bowl with the line where the food should be. */
  rations: '<path d="M4 11h16a8 8 0 01-8 8 8 8 0 01-8-8zM7 7h10"/>',
  /* Something secret. A diamond. */
  power: '<path d="M12 3l8 9-8 9-8-9z"/>',
  /* Working together. Two nodes and the line between them. */
  alliance: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6"/>',
  /* Dangerous. A triangle with weight in it. */
  threat: '<path d="M12 3l9 17H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  /* Watching. */
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  /* A promise that did not hold. A broken line. */
  broken: '<path d="M3 12h6M15 12h6M11 7l2 10"/>',
  /* You. Brackets, the way a file marks its subject. */
  you: '<path d="M8 4H4v16h4M16 4h4v16h-4"/>',
  /* Energy. A cell. */
  energy: '<path d="M9 3h6v3h3v15H6V6h3zM12 10v7M9 13h6"/>',
  /* Time passing without contact. */
  stale: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M12 8v4l3 2"/>',
  /* Gone. */
  out: '<path d="M5 5l14 14M19 5L5 19"/>',
  /* The jury. */
  panel: '<path d="M4 20h16M6 20V10M12 20V6M18 20v-8M3 10h6M9 6h6M15 12h6"/>',
  /* An alliance you know about but are not in. */
  seen: '<circle cx="6" cy="12" r="3" stroke-dasharray="2 2"/><circle cx="18" cy="12" r="3" stroke-dasharray="2 2"/><path d="M9 12h6" stroke-dasharray="2 2"/>',
};

/**
 * @param name  key in PATHS
 * @param size  px
 * @param cls   extra class, usually a colour
 */
function icon(name, size, cls) {
  const d = PATHS[name];
  if (!d) return '';
  const s = size || 14;
  return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" width="${s}" height="${s}"`
    + ` fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"`
    + ` aria-hidden="true">${d}</svg>`;
}

// ─── the phase rail ──────────────────────────────────────────────────────────

/*
 * Ten phases a week, and the interface used to name the current one in eleven
 * grey pixels and nothing else. A player could not tell whether the vote was
 * two steps away or eight, which is the difference between spending energy now
 * and holding it.
 */
const RAIL = [
  { p: 'reset', n: 'Reset', s: 'The week turns over' },
  { p: 'captain_comp', n: 'Captain', s: 'Somebody takes the power' },
  { p: 'scheme1', n: 'Talk', s: 'Before anybody is named' },
  { p: 'safety_call', n: 'Safety', s: 'Anyone holding it decides' },
  { p: 'naming', n: 'Naming', s: 'Two go up' },
  { p: 'veto_draw', n: 'Draw', s: 'Who plays for the Veto' },
  { p: 'veto_comp', n: 'Veto', s: 'The comp that can undo it' },
  { p: 'scheme2', n: 'Talk', s: 'While the names still might change' },
  { p: 'veto_ceremony', n: 'Ceremony', s: 'Used or held' },
  { p: 'scheme3', n: 'Whip', s: 'Last chance to move a vote' },
  { p: 'eviction', n: 'Vote', s: 'One of them leaves' },
  { p: 'fallout', n: 'Fallout', s: 'Who gets blamed' },
];

function railIndex(phase) {
  for (let i = 0; i < RAIL.length; i++) if (RAIL[i].p === phase) return i;
  return -1;
}

function phaseRail(phase) {
  const at = railIndex(phase);
  if (at < 0) return '';
  const cells = RAIL.map((r, i) => {
    const cls = i < at ? 'done' : (i === at ? 'now' : '');
    return `<span class="rl ${cls}" title="${r.s}"><i></i><b>${r.n}</b></span>`;
  }).join('');
  return `<div class="rail">${cells}</div>`
    + `<div class="railnote">${RAIL[at].s}</div>`;
}

// ─── small components ────────────────────────────────────────────────────────

/** A filled proportion bar. Used for energy, threat, alliance strength. */
function bar(pct, color, w) {
  const v = Math.max(0, Math.min(100, pct));
  return `<span class="bbar" style="width:${w || 46}px">`
    + `<span style="width:${v}%;background:${color}"></span></span>`;
}

/**
 * The relationship read, as a seven step ladder with the current rung lit.
 *
 * A ladder rather than a bar because the model is banded, not continuous, and
 * because a bar invites the player to read a number off it, which §17 forbids
 * and which the belief layer could not honestly support anyway.
 */
function ladder(label, conf) {
  const at = bandIndex(label);
  const c = bandColor(label);
  let out = `<span class="ldr" style="opacity:${freshOpacity(conf)}">`;
  for (let i = 0; i < 7; i++) {
    const on = i === at;
    out += `<i class="${on ? 'on' : ''}" style="${on ? `background:${c}` : ''}"></i>`;
  }
  return out + '</span>';
}

/** Legend, so the language is learnable in one place. */
function legend() {
  const swatches = BAND_ORDER.map((k) =>
    `<span class="lg"><i style="background:${BAND[k].c}"></i>${k}</span>`).join('');
  return `<div class="legend"><div class="lgrow">${swatches}</div>`
    + `<div class="lgrow dimrow">`
    + `<span class="lg">${icon('captain', 13)} Captain</span>`
    + `<span class="lg">${icon('risk', 13)} At Risk</span>`
    + `<span class="lg">${icon('veto', 13)} Veto</span>`
    + `<span class="lg">${icon('rations', 13)} Rations</span>`
    + `<span class="lg">${icon('alliance', 13)} With you</span>`
    + `<span class="lg">${icon('seen', 13)} Allied, not with you</span>`
    + `<span class="lg">${icon('threat', 13)} Reads dangerous</span>`
    + `<span class="lg">${icon('stale', 13)} Your read is old</span>`
    + `</div></div>`;
}

// ─── the alliance map ────────────────────────────────────────────────────────

/*
 * The single biggest "I cannot follow this" gap. Alliances drive nominations
 * and votes, the player learns about them through eavesdrops and leaks, and
 * there was nowhere to SEE one. A list of names does not show you that two
 * groups overlap on one person, which is the thing that decides weeks.
 *
 * Only draws what the player knows: alliances they are in, and alliances they
 * have been told about. Everything else stays invisible, which is the point of
 * the fog and is why this cannot just render `state.alliances`.
 */
function allianceMap(state, E) {
  const me = state.human;
  const known = state.alliances.filter((a) => a.alive
    && (a.members.indexOf(me) !== -1 || (a.known && a.known[me] != null)));
  if (!known.length) {
    return '<div class="mapnote">You have not confirmed a single alliance in this house. '
      + 'Eavesdrop, or push a conversation somewhere it should not go.</div>';
  }

  const active = state.cast.filter((p) => p.status === 'active');
  const n = active.length;
  const W = 460, H = 300, cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 42;
  const pos = {};
  active.forEach((p, i) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos[p.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, ang };
  });

  let edges = '';
  known.forEach((a, ai) => {
    const mine = a.members.indexOf(me) !== -1;
    const col = mine ? '#1c56c2' : '#9aa5b1';
    for (let i = 0; i < a.members.length; i++) {
      for (let j = i + 1; j < a.members.length; j++) {
        const A = pos[a.members[i]], B = pos[a.members[j]];
        if (!A || !B) continue;
        /* Bow the line toward the middle so overlapping alliances do not draw
           on top of each other. */
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        const k = 0.22 + ai * 0.05;
        const qx = mx + (cx - mx) * k, qy = my + (cy - my) * k;
        edges += `<path d="M${A.x.toFixed(1)} ${A.y.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}"`
          + ` fill="none" stroke="${col}" stroke-width="${mine ? 2 : 1.2}"`
          + `${mine ? '' : ' stroke-dasharray="3 3"'} opacity="${mine ? 0.9 : 0.6}"/>`;
      }
    }
  });

  let nodes = '';
  for (const p of active) {
    const q = pos[p.id];
    const isMe = p.id === me;
    const band = isMe ? null : E.band(state.rel.belief[me][p.id].v).label;
    const col = isMe ? '#17222f' : bandColor(band);
    const inAny = known.some((a) => a.members.indexOf(p.id) !== -1);
    nodes += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${isMe ? 8 : 6}"`
      + ` fill="${inAny ? col : '#ffffff'}" stroke="${col}" stroke-width="${isMe ? 2.5 : 1.5}"/>`;
    const anchor = q.x < cx - 12 ? 'end' : (q.x > cx + 12 ? 'start' : 'middle');
    const dx = q.x < cx - 12 ? -11 : (q.x > cx + 12 ? 11 : 0);
    const dy = q.y < cy ? -11 : 15;
    nodes += `<text x="${(q.x + dx).toFixed(1)}" y="${(q.y + dy).toFixed(1)}"`
      + ` text-anchor="${anchor}" fill="${isMe ? '#17222f' : '#5d6b7a'}" font-size="11" font-weight="600"`
      + ` font-family="Inter,system-ui,sans-serif">${isMe ? 'YOU' : esc(p.first)}</text>`;
  }

  return `<svg class="amap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`
    + edges + nodes + '</svg>'
    + `<div class="mapnote">${known.filter((a) => a.members.indexOf(me) !== -1).length} you are in, `
    + `${known.filter((a) => a.members.indexOf(me) === -1).length} you have found out about. `
    + 'There are almost certainly more.</div>';
}

function esc(x) {
  return String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ─── sorting the wall ────────────────────────────────────────────────────────

/*
 * Sixteen tiles in generation order is a phone book. The three orders below are
 * the three questions a player actually has, and being able to switch between
 * them is most of what makes the house readable.
 */
const SORTS = {
  house: { n: 'By the house', f: (a, b) => a.id - b.id },
  feel:  { n: 'How they feel', f: null },
  risk:  { n: 'Danger to you', f: null },
};

function sortCast(state, E, list, key) {
  const me = state.human;
  const arr = list.slice();
  if (key === 'feel') {
    arr.sort((a, b) => {
      if (a.id === me) return -1; if (b.id === me) return 1;
      return state.rel.belief[me][b.id].v - state.rel.belief[me][a.id].v;
    });
  } else if (key === 'risk') {
    const danger = (p) => {
      if (p.id === me) return -1e9;
      let d = E.threatScore(state.rel, state.cast, me, p.id, state.panel, state.alliances);
      d += Math.max(0, -state.rel.belief[me][p.id].v) * 0.8;
      if (state.captain === p.id) d += 25;
      return d;
    };
    arr.sort((a, b) => danger(b) - danger(a));
  } else {
    arr.sort((a, b) => a.id - b.id);
  }
  return arr;
}

const api = {
  BAND, BAND_ORDER, bandColor, bandDim, bandOn, bandIndex,
  freshOpacity, freshDash, PATHS, icon,
  RAIL, railIndex, phaseRail, bar, ladder, legend, allianceMap,
  SORTS, sortCast,
};

if (typeof window !== 'undefined') window.RH_UI = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;

})();
