/* Shut The Door: the pitching coach.
 *
 * window.STD_COACH.open(ctx). The feedback for the whole outing, as a
 * conversation, after the outing is over and only when the player taps
 * "talk to pitching coach" (the owner, 2026-10-17). Nothing here opens by
 * itself, and nothing of it shows during play.
 *
 * The coach has no face and no figure (the owner, 2026-10-18). It is a voice,
 * set like the menus: a sheet, the coach's lines down the left, the player's
 * answers as chips at the bottom.
 *
 * In order:
 *   1. one line on the outing (outcome, pitches, runs, percentile)
 *   2. the worst pitch: result.lesson (CONTRACT.md section 15), your call
 *      against the best on the mirrored mini grid, the why, next time, the
 *      numbers, and how the pros do it when lesson.pro is there
 *   3. the pattern line, when the lesson has one
 *   4. an offer to go through the rest: every pitch in order with its band
 *      and its grade's reason, from the outing's own grades and log
 *
 * Every number is read off the result, the lesson or the grades. None is
 * typed here.
 *
 * ctx: {scn, result, outing, typeName(t), batterAt(i), outsWords(n),
 *       basesWords(b), lastName(s)}
 */
(function () {
'use strict';
var C = window.STD_CONTRACT, M = window.STD_MOUND, MN = window.STD_MENUS;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var TYPE_NAME = { FF: 'four-seam', SI: 'sinker', FC: 'cutter', SL: 'slider', ST: 'sweeper', SV: 'slurve', CU: 'curveball',
  KC: 'knuckle curve', CH: 'changeup', FS: 'splitter', FO: 'forkball', KN: 'knuckleball' };
var HITS = { single: 1, double: 1, triple: 1, home_run: 1 };
var STEP = 260;            // the pause between the coach's lines, in ms

var X = null, queue = [], timer = 0, run = 0;

function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

/* ---- the transcript ---------------------------------------------------- */

function scrollEnd() {
  var box = $('coach-log');
  if (box) box.scrollTop = box.scrollHeight;
}
function addLine(html, cls) {
  var el = document.createElement('div');
  el.className = 'cm ' + (cls || 'coach');
  el.innerHTML = html;
  $('coach-log').appendChild(el);
  scrollEnd();
  return el;
}
/* the coach says things one after another, with a beat between */
function say(items, then) {
  var my = run;
  var wait = reduced() ? 0 : STEP;
  var dots = null;
  function next() {
    if (my !== run) return;
    if (dots) { dots.remove(); dots = null; }
    var it = items.shift();
    if (!it) { if (then) then(); return; }
    var el = addLine(it.html, it.cls);
    if (it.after) it.after(el);
    if (items.length && wait) { dots = addLine('<span class="typing"><i></i><i></i><i></i></span>', 'coach dots'); }
    timer = setTimeout(next, items.length ? wait : 0);
  }
  next();
}
function chips(list) {
  var box = $('coach-chips');
  box.innerHTML = '';
  list.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (c.quiet ? ' quiet' : '');
    b.dataset.chip = c.id;
    b.textContent = c.label;
    b.addEventListener('click', function () {
      box.innerHTML = '';
      if (c.echo !== false) addLine(esc(c.label), 'me');
      c.go();
    });
    box.appendChild(b);
  });
  scrollEnd();
}

/* ---- words ------------------------------------------------------------- */

function typeName(t) { return (X.typeName && X.typeName(t)) || TYPE_NAME[t] || t; }
function batterHand(name) {
  var b = X.scn.batters.filter(function (x) { return x.name === name; })[0];
  return b ? b.bats : 'R';
}
function sit(count, outs, bases) {
  return count.b + '-' + count.s + ' · ' + X.outsWords(outs) + ' · ' + X.basesWords(bases);
}
function proDate(d) {
  var t = Date.parse(d + 'T12:00:00Z');
  return isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toLowerCase() : d;
}
function opener(r) {
  var p = r.pitches, runs = r.runs != null ? r.runs : null;
  var ps = p + (p === 1 ? ' pitch' : ' pitches');
  var rs = runs == null ? '' : runs === 0 ? ' no runs.' : ' ' + runs + (runs === 1 ? ' run.' : ' runs.');
  var a = r.outcome === 'door_shut' ? 'you shut the door. ' + ps + '.' + rs
    : r.outcome === 'tie_held' ? 'they tied it. you held the tie. ' + ps + '.' + rs
    : r.outcome === 'walk_off' ? 'walk-off. ' + ps + '.' + rs
    : 'the go-ahead run got home. ' + ps + '.' + rs;
  var b = r.percentile != null ? ' that beat ' + Math.round(r.percentile) + '% of closers in this spot.' : '';
  return a + b;
}

/* ---- blocks ------------------------------------------------------------ */

function lessonCard(L) {
  var bats = batterHand(L.batter), pr = MN.PRINCIPLE[L.principle], n = L.numbers || {};
  var why = (L.why || []).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('');
  return '<div class="cc lesson">' +
    '<p class="lbl">pitch ' + esc(L.pitchN) + ' · ' + esc(L.batter) + '</p>' +
    '<h3 class="cc-head">' + esc(L.headline) + '</h3>' +
    '<div class="cc-top"><div class="cc-mini" data-grid="lesson"></div><div class="cc-sit">' +
    '<p class="quiet">' + esc(sit(L.count, L.outs, L.bases)) + '</p>' +
    '<p><span class="key you"></span>you: ' + esc(typeName(L.call.type)) + ', ' + esc(M.cellWords(L.call.cell, bats)) + '</p>' +
    '<p><span class="key best"></span>best: ' + esc(typeName(L.bestCall.type)) + ', ' + esc(M.cellWords(L.bestCall.cell, bats)) + '</p>' +
    '</div></div>' +
    (pr ? '<p class="cc-pr"><b>' + esc(pr.title) + '.</b> ' + esc(pr.line) + '</p>' : '') +
    (why ? '<ul class="cc-why">' + why + '</ul>' : '') +
    '<p class="cc-next">' + esc(L.nextTime) + '</p>' +
    (n.callValue != null ? '<p class="cc-num">' + (L.tied ? 'kept it tied ' : 'hold ') + n.callValue.toFixed(1) + '% with your pitch. ' + n.bestValue.toFixed(1) + '% with the best. ' + n.lostPts.toFixed(1) + ' pts lost.</p>' : '') +
    '</div>';
}
function proCard(p) {
  var words = p.bats ? ', ' + M.cellWords(p.cell, p.bats) : '';
  return '<div class="cc pro">' +
    '<p class="lbl">how the pros do it</p>' +
    '<div class="cc-top"><div class="cc-mini" data-grid="pro"></div><div class="cc-sit">' +
    '<p><b>' + esc(p.pitcher) + '</b> to <b>' + esc(p.batter) + '</b></p>' +
    '<p class="quiet">' + esc(p.game) + ' · ' + esc(proDate(p.date)) + '</p>' +
    '<p class="quiet">' + esc(sit(p.count, p.outs, p.bases)) + '</p>' +
    '<p>' + esc(TYPE_NAME[p.type] || p.type) + esc(words) + '</p>' +
    '<p class="cc-res">' + esc(p.result) + '</p></div></div></div>';
}
function mountGrids(el, L) {
  el.querySelectorAll('[data-grid]').forEach(function (host) {
    var g = new M.Grid(host, { mini: true });
    if (host.dataset.grid === 'lesson') {
      g.setHand(batterHand(L.batter));
      g.setMarks({ target: L.call.cell, best: L.bestCall.cell });
    } else {
      if (L.pro.bats) g.setHand(L.pro.bats);
      g.setMarks({ actual: L.pro.cell });
    }
  });
}

/* every pitch in order: who, the count, the call, the band and the reason */
function review() {
  var o = X.outing, log = (o && o.log) || [], gr = (o && o.grades) || [];
  if (!log.length || log.length !== gr.length) return '<p>the pitch log is not here for this outing.</p>';
  var bi = 0;
  var rows = log.map(function (p, i) {
    var g = gr[i], b = X.batterAt(bi), cb = p.countBefore || { b: 0, s: 0 };
    if (p.paOver) bi++;
    var same = g.bestCall && g.bestCall.type === p.call.type && g.bestCall.cell === p.call.cell;
    var best = !same && g.bestCall ? '<p class="rv-best">best: ' + esc(typeName(g.bestCall.type)) + ', ' + esc(M.cellWords(g.bestCall.cell, b.bats)) +
      '. it kept ' + g.lost.toFixed(1) + (g.tied ? ' pts more of the tie.</p>' : ' pts more hold.</p>') : '';
    return '<li class="rv-p ' + esc(g.band) + '" data-band="' + esc(g.band) + '">' +
      '<div class="rv-h"><span class="sq ' + esc(g.band) + '"></span><b>' + (i + 1) + '</b>' +
      '<span>' + esc(X.lastName(b.name)) + ' · ' + cb.b + '-' + cb.s + (g.tied ? ' · tied' : '') + '</span><span class="rv-band">' + esc(g.band) + '</span></div>' +
      '<p class="rv-call">' + esc(typeName(p.call.type)) + ', ' + esc(M.cellWords(p.call.cell, b.bats)) + '</p>' +
      '<p class="rv-why">' + esc(g.reason) + '</p>' + best + '</li>';
  }).join('');
  return '<ol class="review">' + rows + '</ol>';
}

/* a good pitch that got hit: the one place the outcome is mentioned, to say
   that it does not count against the call */
function greenGotHit() {
  var o = X.outing;
  if (!o || !o.log) return false;
  return o.log.some(function (p, i) { return o.grades[i] && o.grades[i].band === 'green' && p.result === 'in_play' && p.inPlay && HITS[p.inPlay.result]; });
}

/* ---- the conversation -------------------------------------------------- */

function start() {
  var r = X.result, L = r.lesson, lines = [{ html: esc(opener(r)) }];
  if (L) {
    lines.push({ html: 'your costliest pitch was number ' + esc(L.pitchN) + '. here it is.' });
    lines.push({ html: lessonCard(L), cls: 'coach card', after: function (el) { mountGrids(el, L); } });
    if (L.pro) {
      lines.push({ html: 'here is a pro doing it right.' });
      lines.push({ html: proCard(L.pro), cls: 'coach card', after: function (el) { mountGrids(el, L); } });
    }
    if (L.pattern) lines.push({ html: '<span class="lbl">one more thing</span>' + esc(L.pattern), cls: 'coach pattern' });
  } else {
    lines.push({ html: 'nothing to fix. every pitch was the right idea.', cls: 'coach none' });
  }
  if (greenGotHit()) lines.push({ html: 'one more. a good pitch got hit. that happens. the grade is the decision, not the result.' });
  lines.push({ html: 'want to go through the rest?' });
  say(lines, function () {
    chips([
      { id: 'rest', label: 'go through the rest', go: rest },
      { id: 'done', label: 'done', quiet: true, echo: false, go: function () { MN.close(); } },
    ]);
  });
}
function rest() {
  say([
    { html: 'every pitch, in order. the color is how good the call was in that moment.' },
    { html: review(), cls: 'coach card review-card' },
    { html: 'that is the outing. come back tomorrow for a new spot.' },
  ], function () {
    chips([
      { id: '101', label: 'pitching 101', go: function () { MN.show('101'); }, echo: false },
      { id: 'done', label: 'done', quiet: true, echo: false, go: function () { MN.close(); } },
    ]);
  });
}

function open(ctx) {
  X = ctx;
  run++;
  clearTimeout(timer);
  $('coach-log').innerHTML = '';
  $('coach-chips').innerHTML = '';
  MN.open('sheet-coach');
  start();
}

window.STD_COACH = { open: open };
})();
