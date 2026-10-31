/* 4th and What: the route library and the concept library.
 *
 *   FAW_ROUTES.LIST                       every route a player can be given, with its default depth
 *   FAW_ROUTES.make(type, at, depth)      the route's points (yards from the ball) for a player at `at`
 *   FAW_ROUTES.CONCEPTS                   pass and run concepts, by name
 *   FAW_ROUTES.apply(play, name)          the play with that concept put on its formation
 *   FAW_ROUTES.sides(play)                the receivers on each side, outside first, and the strength
 *
 * A route here is only a starting drawing: it becomes ordinary drawn points,
 * which the coach can drag and extend on the field. The engine runs whatever
 * the points say (players run exactly what is drawn), and names.js names
 * the result, so nothing here is a promise about how a route plays.
 *
 * "Outside" is toward the sideline the player stands nearer. Depth is yards
 * past the line of scrimmage.
 *
 * Plain script: window.FAW_ROUTES, module.exports in node.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var FM = isNode ? require('./formations.js') : root.FAW_FORMATIONS;

  var LIST = [
    { type: 'go', label: 'Go', depth: 20 },
    { type: 'seam', label: 'Seam', depth: 18 },
    { type: 'fade', label: 'Fade', depth: 18 },
    { type: 'slant', label: 'Slant', depth: 2 },
    { type: 'hitch', label: 'Hitch', depth: 6 },
    { type: 'out', label: 'Out', depth: 8 },
    { type: 'in', label: 'In', depth: 8 },
    { type: 'dig', label: 'Dig', depth: 12 },
    { type: 'curl', label: 'Curl', depth: 12 },
    { type: 'comeback', label: 'Comeback', depth: 15 },
    { type: 'post', label: 'Post', depth: 10 },
    { type: 'corner', label: 'Corner', depth: 10 },
    { type: 'drag', label: 'Drag', depth: 3 },
    { type: 'cross', label: 'Cross', depth: 14 },
    { type: 'flat', label: 'Flat', depth: 2 },
    { type: 'arrow', label: 'Arrow', depth: 3 },
    { type: 'wheel', label: 'Wheel', depth: 18 },
    { type: 'swing', label: 'Swing', depth: 1 }
  ];
  var BY = {}; LIST.forEach(function (r) { BY[r.type] = r; });

  function clampX(x) { return Math.max(-25, Math.min(25, x)); }
  function P(x, y) { return [Math.round(clampX(x) * 10) / 10, Math.round(y * 10) / 10]; }

  /* The points of a route, not counting where he starts. */
  function make(type, at, depth) {
    var x = at[0], y0 = at[1], o = x < -0.3 ? -1 : 1, d = depth != null ? depth : (BY[type] ? BY[type].depth : 10);
    var back = y0 < -2.5;  /* a back starts from the backfield */
    switch (type) {
      case 'go': return [P(x, d)];
      case 'seam': return [P(x - o * 0.8, 4), P(x - o * 0.8, d)];
      case 'fade': return [P(x + o * 1.5, 6), P(x + o * 2.5, d)];
      case 'slant': return [P(x, d), P(x - o * 4, d + 4)];
      case 'hitch': return [P(x, d), P(x - o * 0.5, d - 1.5)];
      case 'out': return [P(x, d), P(x + o * 4, d - 0.5)];
      case 'in': return [P(x, d), P(x - o * 7, d)];
      case 'dig': return [P(x, d), P(x - o * 9, d)];
      case 'curl': return [P(x, d), P(x - o * 1.5, d - 2)];
      case 'comeback': return [P(x, d), P(x + o * 2, d - 3)];
      case 'post': return [P(x, d), P(x - o * 6, d + 10)];
      case 'corner': return [P(x, d), P(x + o * 6, d + 8)];
      case 'drag': return [P(x - o * 2, d), P(x - o * 16, d + 1)];
      case 'cross': return [P(x, 6), P(x - o * 16, d)];
      case 'flat': return back ? [P(x + o * 4, y0 + 2.5), P(x + o * 8, d)] : [P(x + o * 2, d), P(x + o * 6, d + 1)];
      case 'arrow': return [P(x + o * 5, d)];
      case 'wheel': return back ? [P(x + o * 5, y0 + 2), P(x + o * 8, 3), P(x + o * 8, d)] : [P(x + o * 4, 1), P(x + o * 6, 4), P(x + o * 6, d)];
      case 'swing': return [P(x + o * 3, y0 + 0.5), P(x + o * 7, y0 + 2.5), P(x + o * 9, d)];
    }
    return [P(x, d)];
  }

  /* The eligible receivers on each side, outside first. A man on the ball's
     line (x 0) counts to the right. Backs count apart. Strength is the side
     with more men split out; even is no strength. */
  function sides(play) {
    var O = FM.place(play.formation, play.moved);
    var L = [], R = [], backs = [];
    FM.ELIGIBLE.forEach(function (id) {
      if (FM.isBackfield(O[id])) backs.push(id);
      else if (O[id][0] < 0) L.push(id); else R.push(id);
    });
    L.sort(function (a, b) { return O[a][0] - O[b][0]; });
    R.sort(function (a, b) { return O[b][0] - O[a][0]; });
    var strong = L.length > R.length ? 'left' : R.length > L.length ? 'right' : null;
    return { O: O, left: L, right: R, backs: backs, strong: strong,
      strongList: strong === 'left' ? L : R, weakList: strong === 'left' ? R : L };
  }

  /* ---------- the concepts ----------
     `strong` and `weak` give each receiver on that side a route, outside man
     first; `back` is for the back. A side with fewer men skips the extras; a
     side with more keeps the last route for them. `reads` names the read
     order as [side, index] pairs ('back' for the back). Runs give a handoff. */
  var CONCEPTS = [
    { name: 'Four Verts', kind: 'pass', strong: [['go'], ['seam'], ['seam']], weak: [['go'], ['seam']], back: ['block'], reads: [['strong', 1], ['weak', 1], ['strong', 0]] },
    { name: 'Mesh', kind: 'pass', strong: [['corner', 10], ['drag', 2], ['dig', 10]], weak: [['dig', 12], ['drag', 4]], back: ['flat', 2], reads: [['strong', 1], ['weak', 1], ['back']] },
    { name: 'Smash', kind: 'pass', strong: [['hitch', 5], ['corner', 10], ['flat', 2]], weak: [['hitch', 5], ['corner', 10]], back: ['block'], reads: [['strong', 1], ['strong', 0], ['weak', 0]] },
    { name: 'Flood', kind: 'pass', strong: [['go'], ['out', 12], ['flat', 2]], weak: [['post', 12], ['dig', 12]], back: ['flat', 2], reads: [['strong', 1], ['strong', 2], ['back']] },
    { name: 'Stick', kind: 'pass', strong: [['go'], ['flat', 2], ['hitch', 6]], weak: [['slant', 2], ['hitch', 5]], back: ['block'], reads: [['strong', 2], ['strong', 1], ['weak', 0]] },
    { name: 'Snag', kind: 'pass', strong: [['corner', 8], ['hitch', 6.5], ['flat', 2]], weak: [['slant', 2], ['go']], back: ['block'], reads: [['strong', 1], ['strong', 2], ['strong', 0]] },
    { name: 'Slant Flat', kind: 'pass', strong: [['slant', 2], ['flat', 2], ['seam']], weak: [['slant', 2], ['flat', 2]], back: ['block'], reads: [['strong', 0], ['strong', 1], ['weak', 0]] },
    { name: 'Curl Flat', kind: 'pass', strong: [['curl', 12], ['flat', 2], ['seam']], weak: [['curl', 12], ['flat', 2]], back: ['block'], reads: [['strong', 0], ['strong', 1], ['weak', 0]] },
    { name: 'Spacing', kind: 'pass', strong: [['hitch', 5], ['hitch', 5], ['hitch', 5]], weak: [['hitch', 5], ['hitch', 5]], back: ['flat', 2], reads: [['strong', 1], ['strong', 0], ['back']] },
    { name: 'Dagger', kind: 'pass', strong: [['dig', 15], ['seam'], ['flat', 2]], weak: [['go'], ['drag', 3]], back: ['block'], reads: [['strong', 0], ['weak', 1], ['strong', 2]] },
    { name: 'Levels', kind: 'pass', strong: [['dig', 12], ['in', 6], ['flat', 2]], weak: [['go'], ['in', 6]], back: ['block'], reads: [['strong', 0], ['strong', 1], ['back']] },
    { name: 'Drive', kind: 'pass', strong: [['dig', 12], ['drag', 2], ['go']], weak: [['go'], ['seam']], back: ['flat', 2], reads: [['strong', 1], ['strong', 0], ['back']] },
    { name: 'Y Cross', kind: 'pass', strong: [['post', 12], ['cross', 15], ['flat', 2]], weak: [['go'], ['dig', 12]], back: ['block'], reads: [['strong', 1], ['weak', 1], ['strong', 2]], tight: 'cross' },
    { name: 'Inside Zone', kind: 'run', run: 'inside' },
    { name: 'Outside Zone', kind: 'run', run: 'outside' },
    { name: 'Power', kind: 'run', run: 'power' },
    { name: 'Toss', kind: 'run', run: 'toss' },
    { name: 'QB Sneak', kind: 'run', run: 'sneak' }
  ];

  function blank(play) { return { formation: play.formation, moved: JSON.parse(JSON.stringify(play.moved || {})), customFormation: play.customFormation, routes: [], blocks: [], handoff: null, targets: [] }; }

  function apply(play, name) {
    var c = null; CONCEPTS.forEach(function (x) { if (x.name === name) c = x; });
    if (!c) return play;
    var p = blank(play), S = sides(play), O = S.O;
    var strongList = S.strong ? S.strongList : S.right, weakList = S.strong ? S.weakList : S.left;
    if (c.kind === 'run') return runConcept(p, c, S);
    var who = { strong: [], weak: [] };
    function give(id, spec) {
      if (!spec) return;
      if (spec[0] === 'block') { p.blocks.push({ who: id, to: [O[id][0] + (O[id][0] < 0 ? 1.2 : -1.2), O[id][1] - 1.6] }); return; }
      p.routes.push({ who: id, type: spec[0], depth: spec[1] != null ? spec[1] : BY[spec[0]].depth, pts: make(spec[0], O[id], spec[1]) });
    }
    [['strong', strongList, c.strong], ['weak', weakList, c.weak]].forEach(function (g) {
      g[1].forEach(function (id, i) { var spec = g[2][Math.min(i, g[2].length - 1)]; if (i >= g[2].length) spec = ['go']; give(id, spec); who[g[0]].push(id); });
    });
    S.backs.forEach(function (id, i) { if (id === 'QB') return; give(id, i === 0 ? c.back : ['block']); });
    (c.reads || []).forEach(function (r) {
      var id = r[0] === 'back' ? S.backs.filter(function (b) { return b !== 'QB'; })[0] : who[r[0]][r[1]];
      if (id && p.targets.indexOf(id) < 0 && p.routes.some(function (x) { return x.who === id; })) p.targets.push(id);
    });
    if (!p.targets.length && p.routes.length) p.targets.push(p.routes[0].who);
    p.targets = p.targets.slice(0, 3);
    return p;
  }

  function runConcept(p, c, S) {
    var O = S.O, rb = S.backs.filter(function (b) { return b !== 'QB'; })[0];
    /* run to the strength, or right on a balanced set */
    var o = S.strong === 'left' ? -1 : 1;
    if (c.run === 'sneak' || !rb) {
      p.handoff = { to: 'QB', path: [[0, 1.5], [0, 4]] };
      return p;
    }
    var a = O[rb];
    if (c.run === 'inside') p.handoff = { to: rb, path: [[o * 0.5, a[1] + 1.8], [o * 2, 0.5], [o * 2.5, 6]] };
    else if (c.run === 'outside') p.handoff = { to: rb, path: [[o * 3, a[1] + 1.2], [o * 7, -0.5], [o * 9, 5]] };
    else if (c.run === 'toss') p.handoff = { to: rb, path: [[o * 6, a[1] + 1], [o * 11, -1], [o * 13, 5]] };
    else {
      /* power: a lead block from the other back or the tight end, inside the end man */
      p.handoff = { to: rb, path: [[o * 1, a[1] + 1.8], [o * 3.5, 0.5], [o * 4, 6]] };
      var lead = S.backs.filter(function (b) { return b !== 'QB' && b !== rb; })[0] || (FM.isBackfield(O.TE) ? 'TE' : null);
      if (!lead && Math.abs(O.TE[0]) < 9) lead = 'TE';
      if (lead) p.blocks.push({ who: lead, to: [O[lead][0] + o * 2.5, Math.min(O[lead][1] + 3, 1.5)] });
    }
    return p;
  }

  var API = { LIST: LIST, BY: BY, make: make, sides: sides, CONCEPTS: CONCEPTS, apply: apply };
  if (isNode) module.exports = API;
  else root.FAW_ROUTES = API;
})(typeof window !== 'undefined' ? window : this);
