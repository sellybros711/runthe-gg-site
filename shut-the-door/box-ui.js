/* Shut The Door: the card between two of the closer's halves (rules 8, CONTRACT.md 5j).
 * window.STD_BOX_UI.
 *
 * The owner (2026-10-30): "the user should finish the eighth inning, and then it should show a quick
 * little animated game simulation of the box score of what's happening when your team is hitting,
 * and then it'll put you back into the ninth inning for you to finish the game out."
 *
 * play(halfOver, opts) -> Promise, resolved when the card is done (its own clock, or a tap).
 *   The line score (runs by inning, R H E) starts where the closer's half left it and his team's
 *   real half plays onto it plate appearance by plate appearance: each batter, the scorer's short
 *   form (or the feed's event when it has none), the runs ticking onto the inning and onto R, the
 *   outs and the bases after it. Every number is the halfOver record's (engine.js endHalf): nothing
 *   is invented, and a field the record does not have is left out. Then one line on where he goes
 *   back out: the next half and the score.
 *
 * Quick: about four to eight seconds whatever the half (PA_MS a plate appearance, held between
 * PA_MIN and PA_MAX, then END_MS), shorter with quick play. A tap, a click, Enter, Space or Escape
 * skips it. No grade, no colour by band, nothing to read before going on: it is the broadcast's
 * look at the other dugout, never a popup between pitches.
 */
(function () {
'use strict';
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var TOTAL_MS = 5200, PA_MIN = 420, PA_MAX = 900, END_MS = 1100, QUICK = 1.5;

function ordinal(n) { var t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
function lastName(n) { var p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p.slice(1).join(' ') : p[0] || ''; }
/* the club's nickname for the head: clubs.js when it has the club, else the last word of the name */
function nick(team) {
  var c = window.STD_CLUB_NAMED ? window.STD_CLUB_NAMED(team) : null;
  if (c && c.nick) return c.nick;
  var p = String(team || '').trim().split(/\s+/);
  return p[p.length - 1] || '';
}
function margin(s) { var m = s.us - s.them; return m > 0 ? 'up ' + m : m < 0 ? 'down ' + -m : 'tied'; }

/* The line score before his team's half: the first plate appearance's line with that plate
   appearance taken back off it (its runs, its hit, the errors on it), and his team's inning not
   yet batted. All of it from the record. */
function lineBefore(ho) {
  var pa = ho.between.pas[0];
  if (!pa || !pa.line) return ho.line;
  var L = JSON.parse(JSON.stringify(pa.line));
  var bat = ho.between.half === 'bottom' ? 1 : 0, fld = 1 - bat, i = ho.between.inning - 1;
  if (L.innings[i]) L.innings[i][bat] = null;
  L.R[bat] -= pa.runs || 0;
  if (L.H) L.H[bat] -= pa.hit ? 1 : 0;
  if (L.E) L.E[fld] -= pa.err || 0;
  return L;
}

function lineHTML(L, ho, flash) {
  var n = Math.max(9, L.innings.length), bat = ho.between.half === 'bottom' ? 1 : 0, at = ho.between.inning - 1;
  var head = '<tr><th scope="col"><span class="vh">team</span></th>';
  for (var k = 0; k < n; k++) head += '<th scope="col">' + (k + 1) + '</th>';
  head += '<th scope="col" class="hx-t">r</th>' + (L.H ? '<th scope="col" class="hx-t">h</th>' : '') + (L.E ? '<th scope="col" class="hx-t">e</th>' : '') + '</tr>';
  var rows = [0, 1].map(function (side) {
    var r = '<tr class="' + (side === bat ? 'bat' : '') + '"><th scope="row">' + esc(L.teams[side]) + '</th>';
    for (var k = 0; k < n; k++) {
      var v = L.innings[k] ? L.innings[k][side] : null, live = side === bat && k === at;
      r += '<td class="' + (live ? 'live' : '') + (live && flash ? ' pop' : '') + '">' + (v == null ? '' : esc(v)) + '</td>';
    }
    r += '<td class="hx-t' + (side === bat && flash ? ' pop' : '') + '">' + esc(L.R[side]) + '</td>' +
      (L.H ? '<td class="hx-t">' + esc(L.H[side]) + '</td>' : '') + (L.E ? '<td class="hx-t">' + esc(L.E[side]) + '</td>' : '') + '</tr>';
    return r;
  }).join('');
  return '<table class="hx-ls" aria-label="Line score"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
}

function sitHTML(outs, bases) {
  var o = '';
  for (var i = 0; i < 3; i++) o += '<i class="' + (i < outs ? 'on' : '') + '"></i>';
  var b = bases | 0;
  return '<svg class="hx-bases" viewBox="0 0 40 30" aria-hidden="true"><path class="sb-path" d="M19.5 6.5 L30.5 17.5 L19.5 28.5 L8.5 17.5 Z"/>' +
    '<rect class="' + (b & 2 ? 'on' : '') + '" x="16" y="3" width="7" height="7" transform="rotate(45 19.5 6.5)"/>' +
    '<rect class="' + (b & 4 ? 'on' : '') + '" x="5" y="14" width="7" height="7" transform="rotate(45 8.5 17.5)"/>' +
    '<rect class="' + (b & 1 ? 'on' : '') + '" x="27" y="14" width="7" height="7" transform="rotate(45 30.5 17.5)"/></svg>' +
    '<span class="hx-outs" role="img" aria-label="' + outs + (outs === 1 ? ' out' : ' outs') + '">' + o + '</span>';
}

function paHTML(pa) {
  var what = pa.short || pa.event || '';
  return '<li><b>' + esc(lastName(pa.batter && pa.batter.name)) + '</b><span class="hx-ev">' + esc(what) + '</span>' +
    (pa.runs ? '<em class="hx-r">+' + esc(pa.runs) + '</em>' : '') + '</li>';
}

var live = null;
/* play the card for one halfOver record; resolves when it is done or skipped */
function play(ho, opts) {
  opts = opts || {};
  if (live) live.done();
  var sec = $('s-half'), bt = ho.between, pas = bt.pas || [];
  var quick = opts.quick ? QUICK : 1;
  var per = Math.max(PA_MIN, Math.min(PA_MAX, TOTAL_MS / Math.max(1, pas.length))) / quick;
  var nx = ho.next;
  $('hx-eye').textContent = (ho.done.half === 'top' ? 'middle of the ' : 'end of the ') + ordinal(ho.done.inning);
  $('hx-head').textContent = nick(bt.team) + ' bat';
  $('hx-line').innerHTML = lineHTML(lineBefore(ho), ho, false);
  $('hx-sit').innerHTML = sitHTML(0, 0);
  $('hx-pas').innerHTML = '';
  $('hx-sum').textContent = '';
  $('hx-next').textContent = '';
  $('hx-next').classList.remove('on');
  sec.classList.remove('hx-end');

  return new Promise(function (res) {
    var timers = [], over = false;
    var show = function (i) {
      var pa = pas[i];
      $('hx-pas').insertAdjacentHTML('beforeend', paHTML(pa));
      if (pa.line) $('hx-line').innerHTML = lineHTML(pa.line, ho, pa.runs > 0);
      $('hx-sit').innerHTML = sitHTML(Math.min(3, pa.outs | 0), pa.bases);
      var list = $('hx-pas');
      list.scrollTop = list.scrollHeight;
    };
    var end = function () {
      $('hx-line').innerHTML = lineHTML(ho.line || (pas.length ? pas[pas.length - 1].line : lineBefore(ho)), ho, false);
      $('hx-sum').textContent = bt.runs === 1 ? '1 run.' : bt.runs + ' runs.';
      $('hx-next').textContent = 'back out for the ' + (nx.half === 'top' ? 'top' : 'bottom') + ' of the ' + ordinal(nx.inning) + '. ' + margin(nx.score) + '.';
      $('hx-next').classList.add('on');
      sec.classList.add('hx-end');
    };
    var done = function () {
      if (over) return;
      over = true;
      timers.forEach(clearTimeout);
      sec.removeEventListener('click', done);
      document.removeEventListener('keydown', key, true);
      live = null;
      res();
    };
    var key = function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); }
    };
    live = { done: done };
    sec.addEventListener('click', done);
    document.addEventListener('keydown', key, true);
    pas.forEach(function (pa, i) { timers.push(setTimeout(function () { show(i); }, 260 / quick + i * per)); });
    var tEnd = 260 / quick + pas.length * per;
    timers.push(setTimeout(end, tEnd));
    timers.push(setTimeout(done, tEnd + END_MS / quick));
  });
}

window.STD_BOX_UI = { API_VERSION: 1, play: play, lineBefore: lineBefore, TOTAL_MS: TOTAL_MS, END_MS: END_MS };
})();
