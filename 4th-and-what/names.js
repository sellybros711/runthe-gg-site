/* 4th and What: your terminology, and the names it gives your plays.
 *
 *   FAW_NAMES.suggest(play, terms, opt) -> { name, parts: [{ text, why }] }
 *
 * A coach teaches the app their words once, and every play is named from
 * them. Pure: no DOM, no storage. The playbook stores the terms; this reads them.
 *
 * WHAT A PLAY IS MADE OF, for naming:
 *   formation  the set (or the coach's own saved formation), and its strength:
 *              the side with more receivers split out. A balanced set has no side.
 *   routes     each drawn route, read as one of the engine's route types (slant,
 *              out, go, curl, post, corner, dig, drag, flat, seam, comeback,
 *              fade), on the left or the right, by a player (X, Z, H, Y, R).
 *   a run      the carrier, which way the path ends (inside or outside, left or
 *              right) and whether somebody leads the way.
 *
 * THE TERMS (all optional; the preset fills every gap):
 *   preset      'tree' (the 1 to 9 route tree: 296) or 'words' (Slant Flat)
 *   formations  { setId: word }
 *   routes      [{ type, side, who, word }]   side: any, left, right, strong, weak
 *   concepts    [{ types: [..], side, word }] two or more routes on one side
 *   runs        [{ carrier, dir, side, lead, word }]
 *   pattern     the order: any of 'formation', 'side', 'play'
 *
 * WHICH RULE WINS: a concept before single routes (the bigger concept first),
 * then the most specific route rule: a named player beats a side, a side beats
 * any. Ties go to the rule written first. The same word twice running is said
 * once, so a concept run on both sides reads "Doubles Snag".
 *
 * Plain script: window.FAW_NAMES, module.exports in node.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var FM = isNode ? require('./formations.js') : root.FAW_FORMATIONS;
  var E = isNode ? require('./engine.js') : root.FAW_ENGINE;

  var ROUTE_TYPES = ['flat', 'slant', 'comeback', 'curl', 'out', 'dig', 'corner', 'post', 'go', 'seam', 'drag', 'fade'];
  var ROUTE_LABEL = { flat: 'Flat', slant: 'Slant', comeback: 'Comeback', curl: 'Curl', out: 'Out', dig: 'Dig', corner: 'Corner', post: 'Post', go: 'Go', seam: 'Seam', drag: 'Drag', fade: 'Fade' };
  /* The classic route tree, plus the routes it has no number for. */
  var TREE = { flat: '1', slant: '2', comeback: '3', curl: '4', out: '5', dig: '6', corner: '7', post: '8', go: '9', seam: '9', drag: '0', fade: '9' };
  var WHO = { WR1: 'X', WR2: 'Z', SLOT: 'H', TE: 'Y', RB: 'R', QB: 'Q' };
  var FORMATION_WORD = { gun3x1: 'Trips', gun2x2: 'Doubles', uc12: 'Ace', empty: 'Empty', iform: 'I' };

  function defaults() {
    return { preset: 'words', formations: {}, routes: [], concepts: [], runs: [], pattern: ['formation', 'side', 'play'] };
  }
  function clean(t) {
    var d = defaults(); t = t || {};
    return {
      preset: t.preset === 'tree' ? 'tree' : 'words',
      formations: t.formations && typeof t.formations === 'object' ? t.formations : d.formations,
      routes: Array.isArray(t.routes) ? t.routes : [], concepts: Array.isArray(t.concepts) ? t.concepts : [],
      runs: Array.isArray(t.runs) ? t.runs : [],
      pattern: Array.isArray(t.pattern) && t.pattern.length ? t.pattern : d.pattern
    };
  }

  /* ---------- reading a play ---------- */

  function describe(play) {
    var O = FM.place(play.formation, play.moved);
    var wide = FM.ELIGIBLE.filter(function (id) { return !FM.isBackfield(O[id]) && Math.abs(O[id][0]) > 3; });
    var left = wide.filter(function (id) { return O[id][0] < 0; }).length, right = wide.length - left;
    var strength = left > right ? 'left' : right > left ? 'right' : null;
    var routes = (play.routes || []).filter(function (r) { return r && r.pts && r.pts.length && r.who !== 'QB'; }).map(function (r, i) {
      var start = O[r.who], end = r.pts[r.pts.length - 1];
      var sx = start[0] !== 0 ? start[0] : end[0];
      return { who: r.who, label: WHO[r.who], type: E.routeName(start, r.pts), side: sx < 0 ? 'left' : 'right', order: i };
    });
    var run = null;
    if (play.handoff && play.handoff.to) {
      var c = O[play.handoff.to], path = play.handoff.path || [], last = path.length ? path[path.length - 1] : [c[0], c[1] + 5];
      var dx = last[0] - 0;
      run = { carrier: WHO[play.handoff.to], dir: Math.abs(dx) <= 4.5 ? 'inside' : 'outside', side: dx < -0.5 ? 'left' : dx > 0.5 ? 'right' : 'middle',
        lead: (play.blocks || []).some(function (b) { return b.who !== play.handoff.to; }) };
    }
    return { formation: play.formation, strength: strength, routes: routes, run: run };
  }

  /* ---------- matching ---------- */

  function sideOk(want, side, strength) {
    if (!want || want === 'any') return true;
    if (want === 'strong') return !!strength && side === strength;
    if (want === 'weak') return !!strength && side !== strength;
    return want === side;
  }
  /* Concepts: the biggest first; a concept takes routes on one side, once each. */
  function matchConcepts(routes, concepts, strength) {
    var used = {}, hits = [];
    var list = concepts.map(function (c, i) { return { c: c, i: i }; })
      .filter(function (x) { return x.c && Array.isArray(x.c.types) && x.c.types.length >= 2 && x.c.word; })
      .sort(function (a, b) { return b.c.types.length - a.c.types.length || a.i - b.i; });
    ['left', 'right'].forEach(function (side) {
      list.forEach(function (x) {
        if (!sideOk(x.c.side, side, strength)) return;
        var pool = routes.filter(function (r) { return r.side === side && !used[r.order]; }), take = [];
        var ok = x.c.types.every(function (t) {
          for (var k = 0; k < pool.length; k++) if (pool[k].type === t && take.indexOf(pool[k]) < 0) { take.push(pool[k]); return true; }
          return false;
        });
        if (!ok) return;
        take.forEach(function (r) { used[r.order] = true; });
        hits.push({ order: Math.min.apply(null, take.map(function (r) { return r.order; })), text: x.c.word, why: x.c.types.map(function (t) { return ROUTE_LABEL[t] || t; }).join(' and ') + ' on the ' + side + ' is ' + x.c.word });
      });
    });
    return { hits: hits, used: used };
  }
  function routeWord(r, rules, strength, preset) {
    var best = null, bs = -1;
    rules.forEach(function (x, i) {
      if (!x || !x.word || x.type !== r.type) return;
      if (x.who && x.who !== 'any' && x.who !== r.label) return;
      if (!sideOk(x.side, r.side, strength)) return;
      var sc = (x.who && x.who !== 'any' ? 4 : 0) + (x.side && x.side !== 'any' ? 2 : 0);
      if (sc > bs) { bs = sc; best = x; }
    });
    if (best) return { text: best.word, why: (ROUTE_LABEL[r.type] || r.type) + ' by the ' + r.label + ' is ' + best.word };
    return { text: preset === 'tree' ? TREE[r.type] || '0' : ROUTE_LABEL[r.type] || r.type, why: null };
  }
  function runWord(run, rules) {
    var best = null, bs = -1;
    rules.forEach(function (x) {
      if (!x || !x.word) return;
      if (x.carrier && x.carrier !== 'any' && x.carrier !== run.carrier) return;
      if (x.dir && x.dir !== 'any' && x.dir !== run.dir) return;
      if (x.side && x.side !== 'any' && x.side !== run.side) return;
      if (x.lead && x.lead !== 'any' && (x.lead === 'yes') !== run.lead) return;
      var sc = ['carrier', 'dir', 'side', 'lead'].filter(function (k) { return x[k] && x[k] !== 'any'; }).length;
      if (sc > bs) { bs = sc; best = x; }
    });
    if (best) return { text: best.word, why: 'that run is ' + best.word };
    var base = run.carrier === 'Q' ? 'Sneak' : run.lead ? 'Power' : run.dir === 'inside' ? 'Inside Zone' : 'Outside Zone';
    var side = run.carrier === 'Q' || run.side === 'middle' ? '' : (run.side === 'left' ? ' Left' : ' Right');
    return { text: base + side, why: null };
  }

  /* ---------- the name ---------- */

  function suggest(play, terms, opt) {
    terms = clean(terms); opt = opt || {};
    var d = describe(play);
    var formation = opt.formationName || terms.formations[d.formation] || FORMATION_WORD[d.formation] || d.formation;
    var side = d.strength ? (d.strength === 'left' ? 'Left' : 'Right') : '';
    var playParts = [];
    if (d.run) playParts.push(runWord(d.run, terms.runs));
    else {
      var mc = matchConcepts(d.routes, terms.concepts, d.strength), items = mc.hits.slice();
      d.routes.forEach(function (r) { if (!mc.used[r.order]) { var w = routeWord(r, terms.routes, d.strength, terms.preset); w.order = r.order; w.tree = !w.why && terms.preset === 'tree'; items.push(w); } });
      items.sort(function (a, b) { return a.order - b.order; });
      /* the tree's numbers run together into one number, as coaches call them */
      var out = [], digits = '';
      items.forEach(function (it) {
        if (it.tree) { digits += it.text; return; }
        if (digits) { out.push({ text: digits, why: null }); digits = ''; }
        out.push(it);
      });
      if (digits) out.push({ text: digits, why: null });
      /* the same word twice running is called once: Snag both sides is "Doubles Snag" */
      out = out.filter(function (x, i) { return i === 0 || x.text !== out[i - 1].text; });
      playParts = out.slice(0, 4);
    }
    var parts = [];
    terms.pattern.forEach(function (p) {
      if (p === 'formation' && formation) parts.push({ text: formation, why: terms.formations[d.formation] ? 'your word for the formation' : null });
      else if (p === 'side' && side) parts.push({ text: side, why: null });
      else if (p === 'play') playParts.forEach(function (x) { parts.push({ text: x.text, why: x.why }); });
    });
    var name = parts.map(function (x) { return x.text; }).join(' ').replace(/\s+/g, ' ').trim();
    return { name: name || 'New play', parts: parts, describe: d };
  }

  var API = { ROUTE_TYPES: ROUTE_TYPES, ROUTE_LABEL: ROUTE_LABEL, TREE: TREE, WHO: WHO, FORMATION_WORD: FORMATION_WORD,
    defaults: defaults, clean: clean, describe: describe, suggest: suggest };
  if (isNode) module.exports = API;
  else root.FAW_NAMES = API;
})(typeof window !== 'undefined' ? window : this);
