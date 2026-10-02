/* Run The Floor: the live ticker.
 *
 * A stretch of the season used to arrive as one line: "At the break: 31-24".
 * This plays it: the games go by on a scoreboard a few a second, the record
 * climbs, your line keeps a running average, and the nights worth stopping
 * for (a career high, a triple-double, forty) stop the clock for a beat.
 * Speed is yours: 1x, 2x, 4x, or skip to the end.
 *
 * NOTHING HERE IS INVENTED. Every game on it is a game career.js played:
 * the opponent, home or away, the result and your line come off
 * L.season.box, which the engine writes as it plays the stretch without
 * drawing anything extra from its seeded rng. There is no score, because
 * the engine settles a game on its odds rather than its points, and a
 * scoreline made up for the ticker would be the one thing on it that was
 * not true. Playoff series show their games the same way.
 *
 * It is a broadcast, so it only plays with scenes on, and reduced motion
 * shows the finished board at once. window.RTF_TICKER: play(data, opts),
 * strip(data), dataFor(L, before).
 */
(function(){
'use strict';
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
var E = window.RTF_ENGINE;
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var CSS = [
'.tk{position:fixed;inset:0;z-index:89;display:flex;flex-direction:column;justify-content:center;align-items:center;background:rgba(3,5,10,.94);color:#f1f3f8;font-family:var(--body,system-ui);padding:calc(14px + env(safe-area-inset-top,0px)) 14px calc(14px + env(safe-area-inset-bottom,0px));}',
'.tk[hidden]{display:none;}',
'.tk-box{width:min(100%,560px);background:#0b0f1d;padding:14px;box-shadow:0 -3px 0 0 var(--c1),0 3px 0 0 var(--c1),-3px 0 0 0 var(--c1),3px 0 0 0 var(--c1),0 0 0 6px #05070d;}',
'.tk-top{display:flex;align-items:center;gap:8px;margin:0 0 12px;}',
'.tk-live{display:inline-flex;align-items:center;gap:6px;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:8px;text-transform:uppercase;padding:6px 7px;background:#05070d;}',
'.tk-live i{width:6px;height:6px;background:#ff4b4b;box-shadow:0 0 8px #ff4b4b;animation:tkLive 1.2s steps(2) infinite;}',
'@keyframes tkLive{50%{opacity:.3}}',
'.tk-lab{flex:1 1 auto;min-width:0;font-family:var(--k-f-display,var(--display,Impact));font-size:20px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.tk-bug{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:0 0 12px;}',
'.tk-bug div{background:#05070d;padding:8px 6px;text-align:center;}',
'.tk-bug b{display:block;font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:clamp(22px,7vw,32px);line-height:1;color:#ffd166;font-variant-numeric:tabular-nums;}',
'.tk-bug small{display:block;margin-top:4px;font-family:var(--k-f-pixel,var(--display,Impact));font-size:7px;text-transform:uppercase;color:#8fa0d6;}',
'.tk-strip{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 10px;min-height:20px;}',
'.tk-g{width:15px;height:15px;background:#1a2138;position:relative;}',
'.tk-g.w{background:#3ecf8e;box-shadow:inset 0 3px 0 0 #8ff0c2,inset 0 -2px 0 0 #1e8c5b;}',
'.tk-g.l{background:#e5483f;box-shadow:inset 0 3px 0 0 #ff9b92,inset 0 -2px 0 0 #8e2420;}',
'.tk-g.out{opacity:.45;}',
'.tk-g.key:after{content:"";position:absolute;left:5px;top:-5px;width:5px;height:3px;background:#ffd166;}',
'.tk-g.new{animation:tkPop .18s steps(2) both;}',
'@keyframes tkPop{from{transform:scale(1.6)}to{transform:none}}',
'.tk-now{min-height:46px;display:flex;align-items:center;gap:10px;padding:8px 10px;background:#05070d;margin:0 0 12px;font-size:14px;line-height:1.35;}',
'.tk-now b{font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:18px;letter-spacing:.03em;text-transform:uppercase;}',
'.tk-now.key{box-shadow:inset 4px 0 0 0 #ffd166;}',
'.tk-now.key b{color:#ffd166;}',
'.tk-wire{overflow:hidden;white-space:nowrap;font-size:12.5px;color:#cdd6f4;background:#05070d;padding:6px 0;margin:0 0 12px;}',
'.tk-wire span{display:inline-block;padding-left:100%;animation:tkWire 14s steps(140) infinite;}',
'.tk-wire[hidden]{display:none;}',
'@keyframes tkWire{to{transform:translateX(-100%)}}',
'.tk-ctl{display:flex;gap:6px;}',
'.tk-ctl button{flex:1 1 0;min-height:44px;border:0;border-radius:0;background:#18203a;color:#fff;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:9px;text-transform:uppercase;box-shadow:0 -2px 0 0 #2d3a66,0 2px 0 0 #2d3a66,-2px 0 0 0 #2d3a66,2px 0 0 0 #2d3a66;cursor:pointer;}',
'.tk-ctl button[aria-pressed="true"]{background:#ffd166;color:#05070d;}',
'.tk-ctl button.go{flex:1.6 1 0;}',
'.tk-ctl button.go.fin{background:#ffd166;color:#05070d;}',
'.tk-ctl button:focus-visible{outline:2px solid #fff;outline-offset:3px;}',
'.cr-tk{margin:12px 0 0;}',
'.cr-tk .tk-strip{margin:6px 0 0;}',
'@media (prefers-reduced-motion:reduce){.tk-live i,.tk-g.new,.tk-wire span{animation:none}.tk-wire span{padding-left:0;white-space:normal}}',
].join('\n');
function cssOnce(){
  if (document.getElementById('tk-css')) return;
  var st = document.createElement('style'); st.id = 'tk-css'; st.textContent = CSS; document.head.appendChild(st);
}
function nick(c){ return E && E.TEAM_NAMES ? E.TEAM_NAMES[c] || c : c; }

/* What the last press played, read off the season the engine left. `before`
   is the record before the press, so the board starts where it was. */
function dataFor(L, before, beats){
  var s = L.season;
  if (!s || !L.team || L.stage !== 'nba') return null;
  var news = (beats || []).filter(function(b){ return b.kind === 'news'; }).map(function(b){ return b.text.replace(/^Around the league: /, ''); });
  var colors = window.RTF_CAREER ? window.RTF_CAREER.colorsOf(L) : { primary: '#c8102e', secondary: '#fff' };
  if (before && before.phase !== L.phase && (L.phase === 'early' || L.phase === 'mid' || L.phase === 'late') && s.box && s.box.length) {
    var games = s.box.map(function(g){ return { n: g[0], opp: g[1], home: !!g[2], won: !!g[3], pts: g[4], reb: g[5], ast: g[6], out: g[4] < 0 }; });
    var w = 0, l = 0; games.forEach(function(g){ if (g.won) w++; else l++; });
    var best = 0;
    games.forEach(function(g){ if (!g.out && g.pts > best) best = g.pts; });
    games.forEach(function(g){ g.key = !g.out && (g.pts >= 40 || (g.pts >= 30 && g.pts === best) || (g.pts >= 10 && g.reb >= 10 && g.ast >= 10)); });
    return { kind: 'rs', label: 'Games ' + games[0].n + ' to ' + games[games.length - 1].n, team: L.team, c1: colors.primary, c2: colors.secondary,
      w0: s.w - w, l0: s.l - l, games: games, news: news };
  }
  /* A press in the playoffs: the series it finished, and the one in play. */
  var po = s.po;
  if (before && po && (L.phase === 'po' || before.phase === 'po' || before.phase === 'late')) {
    var series = [];
    var done = po.results.slice(before.poDone || 0);
    done.forEach(function(r){ series.push({ round: r.round, opp: r.opp, games: r.games || [], won: r.won, over: true }); });
    if (po.cur && po.cur.games && po.cur.games.length) series.push({ round: po.cur.round, opp: po.cur.opp, games: po.cur.games.slice(), over: false });
    if (!series.length) return null;
    return { kind: 'po', label: 'The playoffs', team: L.team, c1: colors.primary, c2: colors.secondary, series: series, news: news };
  }
  return null;
}
var ROUND = ['First round', 'Second round', 'Conference finals', 'The Finals'];

/* The finished board, for the screen behind with scenes off. Small, and it
   goes under the card, so it never pushes an answer below the fold. */
function strip(d){
  cssOnce();
  if (!d) return '';
  if (d.kind === 'rs') {
    return '<div class="cr-tk k-panel"><div class="k-eyebrow">' + esc(d.label) + '</div><div class="tk-strip" role="img" aria-label="' + esc(sumOf(d)) + '">'
      + d.games.map(function(g){ return '<i class="tk-g ' + (g.won ? 'w' : 'l') + (g.out ? ' out' : '') + (g.key ? ' key' : '') + '" title="' + esc(gameLine(g)) + '"></i>'; }).join('') + '</div></div>';
  }
  return '<div class="cr-tk k-panel">' + d.series.map(function(sr){
    return '<div class="k-eyebrow">' + esc(ROUND[sr.round] || 'Series') + ' vs ' + esc(nick(sr.opp)) + '</div><div class="tk-strip">' + sr.games.map(function(g){ return '<i class="tk-g ' + (g ? 'w' : 'l') + '"></i>'; }).join('') + '</div>';
  }).join('') + '</div>';
}
function gameLine(g){
  var where = (g.home ? 'vs ' : 'at ') + nick(g.opp);
  if (g.out) return 'Game ' + g.n + ' ' + where + ': ' + (g.won ? 'won' : 'lost') + '. You sat.';
  var pl = function(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); };
  return 'Game ' + g.n + ' ' + where + ': ' + (g.won ? 'won' : 'lost') + '. ' + pl(g.pts, 'point') + ', ' + pl(g.reb, 'rebound') + ', ' + pl(g.ast, 'assist') + '.';
}
function sumOf(d){
  var w = 0, l = 0; d.games.forEach(function(g){ if (g.won) w++; else l++; });
  return d.label + ': ' + w + ' and ' + l + '.';
}

var ov = null, live = null;
function keys(e){
  if (!live) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); live.skip(); }
  else if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.tk-ctl') && !document.activeElement.classList.contains('go')) return; e.preventDefault(); e.stopPropagation(); live.go(); }
}
document.addEventListener('keydown', keys, true);

/* Play a stretch or a round. opts.done() when it is closed. */
function play(d, opts){
  cssOnce();
  opts = opts || {};
  if (!d) { if (opts.done) opts.done(); return null; }
  if (live) live.drop();
  if (!ov) { ov = document.createElement('div'); ov.className = 'tk'; ov.id = 'tkov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Live'); document.body.appendChild(ov); }
  ov.style.setProperty('--c1', d.c1);
  ov.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  var speed = 1, i = 0, timer = 0, ended = false;
  var rs = d.kind === 'rs';
  var items = rs ? d.games : [];
  if (!rs) d.series.forEach(function(sr){ sr.games.forEach(function(g, k){ items.push({ series: sr, k: k, won: !!g }); }); });
  ov.innerHTML = '<div class="tk-box"><div class="tk-top"><span class="tk-live"><i></i>Live</span><span class="tk-lab">' + esc(d.label) + '</span></div>'
    + '<div class="tk-bug">' + (rs
      ? '<div><b id="tk-rec">' + d.w0 + '-' + d.l0 + '</b><small>' + esc(nick(d.team)) + '</small></div><div><b id="tk-ppg">-</b><small>Your points</small></div><div><b id="tk-gp">0</b><small>Games</small></div>'
      : '<div><b id="tk-rec">0-0</b><small>Series</small></div><div><b id="tk-opp">-</b><small>Opponent</small></div><div><b id="tk-gp">0</b><small>Games</small></div>')
    + '</div><div class="tk-strip" id="tk-strip" aria-hidden="true"></div>'
    + '<div class="tk-now" id="tk-now" aria-live="polite"><span>Tip-off.</span></div>'
    + (d.news && d.news.length ? '<div class="tk-wire"><span>' + esc('Around the league: ' + d.news.join('   ·   ')) + '</span></div>' : '')
    + '<div class="tk-ctl"><button type="button" data-sp="1" aria-pressed="true">1x</button><button type="button" data-sp="2" aria-pressed="false">2x</button><button type="button" data-sp="4" aria-pressed="false">4x</button><button type="button" class="go" id="tk-go">Skip</button></div></div>';
  var $ = function(id){ return ov.querySelector('#' + id); };
  var pts = 0, gp = 0, w = d.w0 || 0, l = d.l0 || 0, sw = 0, sl = 0, curSr = null;
  function show(g){
    var cell = document.createElement('i');
    if (rs) {
      cell.className = 'tk-g new ' + (g.won ? 'w' : 'l') + (g.out ? ' out' : '') + (g.key ? ' key' : '');
      if (g.won) w++; else l++;
      if (!g.out) { pts += g.pts; gp++; }
      $('tk-rec').textContent = w + '-' + l;
      $('tk-ppg').textContent = gp ? (pts / gp).toFixed(1) : '-';
      $('tk-gp').textContent = String(w + l - (d.w0 + d.l0));
      var now = $('tk-now');
      now.className = 'tk-now' + (g.key ? ' key' : '');
      now.innerHTML = g.key
        ? '<b>' + (g.pts >= 10 && g.reb >= 10 && g.ast >= 10 ? 'Triple-double' : g.pts + ' points') + '</b><span>' + esc(gameLine(g)) + '</span>'
        : '<span>' + esc(gameLine(g)) + '</span>';
    } else {
      if (g.series !== curSr) { curSr = g.series; sw = 0; sl = 0; $('tk-strip').innerHTML = ''; $('tk-opp').textContent = g.series.opp; ov.querySelector('.tk-lab').textContent = (ROUND[g.series.round] || 'Playoffs') + ' vs ' + nick(g.series.opp); }
      cell.className = 'tk-g new ' + (g.won ? 'w' : 'l');
      if (g.won) sw++; else sl++;
      $('tk-rec').textContent = sw + '-' + sl;
      $('tk-gp').textContent = String(sw + sl);
      var fin = (sw === 4 || sl === 4);
      var now2 = $('tk-now');
      now2.className = 'tk-now' + (fin ? ' key' : '');
      now2.innerHTML = fin ? '<b>' + (sw === 4 ? 'Series won' : 'Series over') + '</b><span>' + esc((sw === 4 ? 'Through, ' : 'Out, ') + sw + '-' + sl + ' against the ' + nick(g.series.opp) + '.') + '</span>'
        : '<span>' + esc('Game ' + (sw + sl) + ': ' + (g.won ? 'a win.' : 'a loss.') + ' ' + sw + '-' + sl + ' in the series.') + '</span>';
    }
    $('tk-strip').appendChild(cell);
  }
  function step(){
    if (ended) return;
    if (i >= items.length) return end();
    var g = items[i++];
    show(g);
    var key = rs ? g.key : (g.series && (i === items.length || items[i].series !== g.series));
    var base = rs ? 150 : 520;
    timer = setTimeout(step, (key ? base * 7 : base) / speed);
  }
  function end(){
    if (ended) return;
    ended = true; clearTimeout(timer);
    while (i < items.length) show(items[i++]);
    var go = $('tk-go');
    go.textContent = 'Continue';
    go.classList.add('fin');
    ov.querySelector('.tk-live').innerHTML = 'Final';
    try { go.focus({ preventScroll: true }); } catch (e) {}
  }
  function close(){
    clearTimeout(timer);
    ov.hidden = true; ov.innerHTML = '';
    document.documentElement.style.overflow = '';
    live = null;
    if (opts.done) opts.done();
  }
  ov.querySelectorAll('[data-sp]').forEach(function(b){
    b.onclick = function(){ speed = +b.getAttribute('data-sp'); ov.querySelectorAll('[data-sp]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); };
  });
  $('tk-go').onclick = function(){ if (ended) close(); else end(); };
  live = { drop: function(){ ended = true; clearTimeout(timer); live = null; }, skip: function(){ if (ended) close(); else end(); }, go: function(){ if (ended) close(); else end(); }, close: close };
  if (REDUCED) end();
  else { try { $('tk-go').focus({ preventScroll: true }); } catch (e) {} timer = setTimeout(step, 450); }
  return live;
}
window.RTF_TICKER = { play: play, strip: strip, dataFor: dataFor, isOpen: function(){ return !!(ov && !ov.hidden); } };
})();
