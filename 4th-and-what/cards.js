/* 4th and What: the back of a play card, the position quiz, and the flip.
 *
 *   FAW_CARDS.back(play, opt) -> { lines: [{ who, text }], line, qb, notes, vs: [{ call, label, rate, n }] }
 *   FAW_CARDS.quiz(play, who) -> { who, question, choices: [4], answer }
 *   FAW_CARDS.flipPlay(play)  -> the play mirrored, left for right
 *
 * The back of a card is what a coach hands a player: one line a position (his
 * route and its depth at the break, his block, the carry, a fake), what the
 * line does, the QB's reads in order, the notes, and the rates from Test it.
 * Every number on it is read off the drawn play or the stored test.
 *
 * `play` is a drawn play ({ formation, moved, routes, blocks, handoff, targets,
 * motion, playAction }) or a playbook entry ({ name, notes, distance, play, stats }).
 *
 * opt (all optional):
 *   terms     the coach's terminology, for the run's name (FAW_NAMES)
 *   stats     a Test it result, the shape of entry.stats[distance].test
 *             (an entry's own is used when this is not given)
 *   notes     the notes, in place of the entry's
 *
 * Pure: no DOM, no clock, no Math.random. Plain script: window.FAW_CARDS,
 * module.exports in node.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var FM = function () { return isNode ? require('./formations.js') : root.FAW_FORMATIONS; };
  var E = function () { return isNode ? require('./engine.js') : root.FAW_ENGINE; };
  var N = function () { return isNode ? require('./names.js') : root.FAW_NAMES; };
  var DG = function () { return isNode ? require('./diagram.js') : root.FAW_DIAGRAM; };

  var LETTER = { QB: 'Q', RB: 'R', WR1: 'X', WR2: 'Z', SLOT: 'H', TE: 'Y' };
  var BY_LETTER = { Q: 'QB', R: 'RB', X: 'WR1', Z: 'WR2', H: 'SLOT', Y: 'TE' };
  /* the order the back lists them: the receivers outside in, then the back */
  var ORDER = ['WR1', 'WR2', 'SLOT', 'TE', 'RB'];
  var CALL_KEYS = ['cover0', 'cover1', 'cover1b', 'cover2', 'cover2b', 'cover3', 'cover3b'];
  var CALL_NAME = { cover0: 'Cover 0 blitz', cover1: 'Cover 1', cover1b: 'Cover 1 blitz', cover2: 'Cover 2', cover2b: 'Cover 2 blitz', cover3: 'Cover 3', cover3b: 'Cover 3 blitz' };
  /* a route's usual depth at its break, for the quiz's wrong answers. One leg
     routes (a seam, a go) are said to their depth, not at a break. */
  var USUAL = { flat: 1, slant: 2, drag: 2, out: 5, curl: 8, fade: 6, dig: 10, comeback: 12, corner: 10, post: 10, seam: 14, go: 20 };
  var ONE_LEG = { seam: true, go: true };

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function low(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  /* FNV-1a, 32 bits: a stable number from a string, for anything that must be
     the same every time it is asked (the quiz order, the wristband codes). */
  function hash(str) {
    var h = 2166136261;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function unwrap(p) { return p && p.play && p.play.formation ? { entry: p, play: p.play } : { entry: null, play: p }; }

  function yardsAt(d) { return d === 1 ? '1 yard' : d + ' yards'; }
  /* "Slant at 4 yards", "Go to 20 yards", "Flat behind the line" */
  function routePhrase(type, depth, oneLeg) {
    if (oneLeg) return cap(type) + (depth >= 1 ? ' to ' + yardsAt(depth) : '');
    if (depth >= 1) return cap(type) + ' at ' + yardsAt(depth);
    return cap(type) + (depth === 0 ? ' at the line' : ' behind the line');
  }
  function routeOf(play, id) { var r = null; (play.routes || []).forEach(function (x) { if (x && x.who === id && x.pts && x.pts.length) r = x; }); return r; }
  function blockOf(play, id) { var b = null; (play.blocks || []).forEach(function (x) { if (x && x.who === id && x.to) b = x; }); return b; }
  function isRun(play) { return !!(play.handoff && play.handoff.to); }

  /* A route, read off what was drawn: its type and its depth at the break. */
  function routeInfo(start, pts) {
    var type = E().routeName(start, pts), bp = DG().breakPoint(start, pts);
    return { type: type, depth: Math.round(bp[1]), oneLeg: pts.length === 1 };
  }
  function motionWord(play, A) {
    var m = DG().motionOf(play); if (!m) return null;
    var a = A[m.who], end = m.pts[m.pts.length - 1], side = a[0] < 0 ? -1 : 1;
    var crosses = m.pts.some(function (p) { return (p[0] < 0 ? -1 : 1) !== side && Math.abs(p[0]) > 0.5; });
    if (crosses || Math.abs(end[0]) < 2.5) return 'Jet motion';
    return Math.abs(end[0]) < Math.abs(a[0]) ? 'Short motion' : 'Motion out';
  }
  function runName(play, terms) {
    var t = Object.assign({}, N().clean(terms || {}), { pattern: ['play'] });
    return N().suggest(play, t).name;
  }
  /* The reads the engine will use: drawn routes, not blockers, three at most. */
  function readsOf(play) {
    if (isRun(play)) return [];
    return (play.targets || []).filter(function (id) { return routeOf(play, id) && !blockOf(play, id); }).slice(0, 3);
  }

  /* What one player does, as the back of the card says it. */
  function assignment(play, id, opt) {
    opt = opt || {};
    var A = FM().place(play.formation, play.moved), O = DG().snapSpots(play, A);
    var run = isRun(play), r = routeOf(play, id), bk = blockOf(play, id), text;
    if (run && play.handoff.to === id) text = 'Carries it on ' + runName(play, opt.terms);
    else if (bk) text = run ? (FM().isBackfield(O[id]) ? 'Leads on the run' : 'Blocks his man') : 'Stays in to block';
    else if (r) {
      var ri = routeInfo(O[id], r.pts), ph = routePhrase(ri.type, ri.depth, ri.oneLeg);
      text = run ? 'Decoy ' + low(ph) : ph;
    } else text = 'No assignment drawn';
    if (play.playAction && !run && id === 'RB') text = bk || r ? 'Fake, then ' + low(text) : 'Runs the fake';
    var mw = motionWord(play, A);
    if (mw && play.motion.who === id) text = mw + ', then ' + low(text);
    return text;
  }

  function vsOf(t) {
    var out = [];
    if (!t) return out;
    CALL_KEYS.forEach(function (k) { var a = t[k]; if (a && a.n) out.push({ call: k, label: CALL_NAME[k], rate: Math.round(a.w * 100 / a.n), n: a.n }); });
    return out;
  }

  function back(p, opt) {
    opt = opt || {};
    var u = unwrap(p), play = u.play, entry = u.entry;
    var run = isRun(play);
    var lines = ORDER.map(function (id) { return { who: LETTER[id], id: id, text: assignment(play, id, opt) }; });
    var A = FM().place(play.formation, play.moved), O = DG().snapSpots(play, A);
    var qb;
    if (run && play.handoff.to === 'QB') qb = 'QB: keep it. ' + runName(play, opt.terms) + '.';
    else if (run) qb = 'QB: hand it to the ' + LETTER[play.handoff.to] + '.';
    else {
      var reads = readsOf(play);
      var parts = reads.map(function (id, i) { return (i + 1) + ' ' + LETTER[id] + ' ' + routeInfo(O[id], routeOf(play, id).pts).type; });
      qb = 'QB: ' + (play.playAction ? 'fake to the R. ' : '') + (parts.length ? parts.join(', ') + '.' : 'no reads set.');
      if (reads.length > 1) qb += ' Pocket gone: check it down to the ' + LETTER[reads[reads.length - 1]] + '.';
      else if (reads.length === 1) qb += ' Pocket gone: throw it away.';
    }
    var t = opt.stats || (entry && entry.stats && entry.stats[entry.distance] && entry.stats[entry.distance].test) || null;
    var notes = opt.notes !== undefined ? opt.notes : entry ? entry.notes || '' : play.notes || '';
    return { lines: lines, line: run ? 'Run block' : 'Pass protect', qb: qb, notes: String(notes || ''), vs: vsOf(t) };
  }

  /* ---------- the quiz ---------- */

  function quiz(p, who) {
    var u = unwrap(p), play = u.play;
    var id = BY_LETTER[who] || who, letter = LETTER[id] || who;
    var right = assignment(play, id, {});
    var r = routeOf(play, id), rt = null;
    if (r) { var A = FM().place(play.formation, play.moved); rt = routeInfo(DG().snapSpots(play, A)[id], r.pts).type; }
    var pool = Object.keys(USUAL).filter(function (t) { return t !== rt; }).map(function (t) { return routePhrase(t, USUAL[t], !!ONE_LEG[t]); });
    pool.push('Stays in to block');
    pool = pool.filter(function (t) { return t !== right; });
    /* a small generator off the play itself: the same play and player, the same quiz */
    var seed = hash(JSON.stringify([play.formation, play.moved, play.routes, play.blocks, play.handoff, play.motion || null, !!play.playAction, id]));
    var next = function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (var i = pool.length - 1; i > 0; i--) { var j = next() % (i + 1), tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    var choices = pool.slice(0, 3), at = next() % 4;
    choices.splice(at, 0, right);
    return { who: letter, question: 'What is your assignment?', choices: choices, answer: at };
  }

  /* ---------- the flip ---------- */

  /* The play mirrored left for right: every spot, route, block, the run and the
     motion. Every skill player's spot is written out, so the mirror is exact
     whatever the set, and a saved formation no longer matches it, so that link
     goes. Flipping twice gives back the play with its spots written out. */
  function neg(v) { return v === 0 ? 0 : -v; }
  function mir(p) { return [neg(p[0]), p[1]]; }
  function flipPlay(play) {
    var f = copy(play), A = FM().place(play.formation, play.moved);
    f.moved = {};
    FM().EDITABLE.forEach(function (id) { f.moved[id] = mir(A[id]); });
    f.routes = (play.routes || []).map(function (r) { var o = copy(r); o.pts = (r.pts || []).map(mir); return o; });
    f.blocks = (play.blocks || []).map(function (b) { var o = copy(b); if (b.to) o.to = mir(b.to); return o; });
    if (play.handoff) { f.handoff = copy(play.handoff); if (play.handoff.path) f.handoff.path = play.handoff.path.map(mir); }
    if (play.motion) { f.motion = copy(play.motion); if (play.motion.pts) f.motion.pts = play.motion.pts.map(mir); }
    delete f.customFormation;
    return f;
  }

  var API = { back: back, quiz: quiz, flipPlay: flipPlay, assignment: assignment, readsOf: readsOf, routePhrase: routePhrase,
    hash: hash, LETTER: LETTER, BY_LETTER: BY_LETTER, ORDER: ORDER, CALL_KEYS: CALL_KEYS, CALL_NAME: CALL_NAME };
  if (isNode) module.exports = API;
  else root.FAW_CARDS = API;
})(typeof window !== 'undefined' ? window : this);
