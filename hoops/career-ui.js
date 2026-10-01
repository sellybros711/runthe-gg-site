/* Run The Floor: the Career screens.
 *
 * The rules live in career.js and this file only draws them. It talks to the
 * page through window.RTF_PAGE, the same way modes-ui.js does, and its
 * stylesheet is injected from here for that file's reason: the markup and the
 * rules that dress it belong to one release.
 *
 * ONE SCREEN, THREE VIEWS. #s-car is the whole mode: the builder before a
 * career, the life while one is running, and the Hall of Fame card once it is
 * over. The front page's hero (#career in index.html) is painted from here
 * too, because only this file knows what a career is.
 *
 * THE CAREER IS ON THE ACCOUNT. It is one key, `rtf.life.v1`, and that key is
 * a slot on the shelf (hoops/cloud.js MODE_KEYS), written through
 * RTF_MODES_UI.write so a career started on a phone carries on on a laptop.
 * The browser copy is written first and synchronously, the way every other
 * save in this game is.
 */
(function(){
'use strict';

var E = window.RTF_ENGINE, C = window.RTF_CAREER;
var P = window.RTF_PAGE;
if (!E || !C || !P) return;

var KEY = 'rtf.life.v1';
var $ = function(id){ return document.getElementById(id); };
var esc = P.esc;
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

// ─── storage ────────────────────────────────────────────────────────────────

/* { cur: the career in progress or null, hof: the finished ones, newest first }. */
function load(){
  try {
    var v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return { cur: v.cur || null, hof: Array.isArray(v.hof) ? v.hof : [] };
  } catch (e) {}
  return { cur: null, hof: [] };
}
var S = null;
function store(){ if (!S) S = load(); return S; }
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  var M = window.RTF_MODES_UI;
  if (M && M.write) M.write(KEY);
}
/* After a pull from the shelf, what is in memory was read from the old copy. */
function reload(){
  if (onScreen()) return;
  S = null;
  renderHero();
}
function onScreen(){ var el = $('s-car'); return !!(el && el.classList.contains('active')); }

// ─── the stylesheet ─────────────────────────────────────────────────────────

var CSS = [
'#s-car{padding-bottom:20px;}',
'.cr-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 12px;}',
'.cr-top h2{margin:0;}',
'.cr-top .cr-home{background:transparent;border:1px solid var(--cardb);color:var(--mut);padding:7px 12px;font-size:12.5px;}',
/* the builder */
'.cr-build .lab{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:800;margin:14px 0 7px;}',
'.cr-name{display:flex;gap:8px;}',
'.cr-name input{flex:1 1 auto;min-width:0;font:inherit;font-size:16px;font-weight:700;color:var(--ink);background:rgba(255,255,255,.04);border:1px solid var(--cardb);border-radius:9px;padding:10px 12px;}',
'.cr-name input:focus{outline:2px solid var(--orange);outline-offset:1px;}',
'.cr-name .cr-num{flex:0 0 72px;text-align:center;}',
'.cr-name button{flex:0 0 auto;padding:0 14px;}',
'.cr-chips{display:flex;gap:6px;flex-wrap:wrap;}',
'.cr-chips button{flex:1 1 0;min-width:52px;background:rgba(255,255,255,.04);border:1px solid var(--cardb);color:var(--mut);padding:10px 6px;font-size:13px;}',
'.cr-chips button.on{background:linear-gradient(180deg,var(--orange),var(--orange-dk));border-color:var(--orange);color:#fff;}',
'.cr-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
'.cr-opt{text-align:left;background:rgba(255,255,255,.035);border:1px solid var(--cardb);color:var(--ink);padding:11px 12px;border-radius:11px;font-weight:600;}',
'.cr-opt b{display:block;font-size:14px;font-weight:800;margin-bottom:2px;}',
'.cr-opt small{display:block;font-size:12px;color:var(--mut);line-height:1.4;font-weight:500;}',
'.cr-opt.on{border-color:var(--orange);background:rgba(240,120,45,.12);box-shadow:inset 0 0 0 1px var(--orange);}',
'.cr-preview{display:flex;gap:14px;align-items:center;margin:16px 0 4px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.18);}',
'.cr-preview .cr-bars{flex:1 1 auto;}',
'.cr-town{margin:10px 0 0;font-size:13.5px;color:var(--ink);font-weight:700;}',
'.cr-sub{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:800;margin:16px 0 6px;}',
'.cr-final p.cr-col{color:var(--ink);font-weight:700;}',
'.cr-place{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:10px 12px;border:1px solid var(--cardb);border-radius:12px;font-size:13.5px;color:var(--mut);}',
'.cr-place b{color:var(--ink);}',
'.cr-place button{flex:0 0 auto;padding:7px 12px;font-size:12.5px;}',
'.cr-place[hidden]{display:none;}',
'.cr-epi p{margin:0 0 10px;font-size:14px;line-height:1.5;}',
'.cr-epi p:last-child{margin:0;}',
'.cr-epi .k,.cr-lifeline{display:block;}',
'.cr-epi .k{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:800;margin-bottom:2px;}',
'.cr-lifeline{font-size:13px;color:var(--mut);margin:14px 0 0;}',
'.cr-rivalwho{font-size:13px;color:var(--mut);margin:0 0 6px;}',
'.cr-vs td:nth-child(2),.cr-vs td:nth-child(3),.cr-vs th:nth-child(2),.cr-vs th:nth-child(3){text-align:right;}',
'.cr-vs td.win{color:#3ddc97;font-weight:800;}',
/* the identity card */
'.cr-id{position:relative;display:flex;gap:14px;align-items:center;padding:16px;border-radius:14px;overflow:hidden;margin:0 0 12px;',
'  background:linear-gradient(135deg,var(--c1,#1d2433),#0e131c 78%);border:1px solid var(--cardb);}',
'.cr-id:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,.35));pointer-events:none;}',
'.cr-id > *{position:relative;z-index:1;}',
'.cr-jersey{flex:0 0 64px;width:64px;height:70px;}',
'.cr-who{flex:1 1 auto;min-width:0;}',
'.cr-who b{display:block;font-family:var(--display);font-weight:400;font-size:24px;line-height:1.05;text-transform:uppercase;letter-spacing:.01em;}',
'.cr-who span{display:block;font-size:12.5px;color:rgba(255,255,255,.78);margin-top:3px;}',
'.cr-ovr{flex:0 0 auto;text-align:center;}',
'.cr-ovr b{display:block;font-family:var(--display);font-weight:400;font-size:40px;line-height:.95;}',
'.cr-ovr span{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:rgba(255,255,255,.7);}',
'.cr-meters{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:0 0 12px;}',
'@media (min-width:560px){.cr-meters{grid-template-columns:repeat(4,1fr);}}',
'.cr-m{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:10px;padding:8px 9px;}',
'.cr-m .t{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:800;}',
'.cr-m .t b{color:var(--ink);font-family:var(--num);font-variant-numeric:tabular-nums;letter-spacing:0;font-size:12px;}',
'.cr-bar{height:6px;border-radius:4px;background:rgba(255,255,255,.07);margin-top:6px;overflow:hidden;}',
'.cr-bar i{display:block;height:100%;border-radius:4px;background:var(--orange);transition:width .5s ease;}',
'.cr-m.health .cr-bar i{background:#3ddc97;}',
'.cr-m.fame .cr-bar i{background:#f2c14e;}',
'.cr-m.trust .cr-bar i{background:#6aa9ff;}',
'.cr-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px;}',
'.cr-fact{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:10px;padding:8px 10px;}',
'.cr-fact .k{display:block;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--dim);font-weight:800;}',
'.cr-fact b{display:block;font-size:14px;font-weight:800;margin-top:2px;font-family:var(--num);font-variant-numeric:tabular-nums;}',
'.cr-fact small{display:block;font-size:11px;color:var(--mut);}',
/* the stage: what just happened, then what is next */
'.cr-stage{margin:0 0 12px;}',
'.cr-beats{list-style:none;margin:0 0 10px;padding:0;}',
'.cr-beats li{position:relative;padding:8px 10px 8px 26px;border-radius:9px;font-size:14px;line-height:1.45;background:rgba(255,255,255,.03);margin:0 0 6px;',
'  animation:crin .35s ease-out both;}',
'.cr-beats li:before{content:"";position:absolute;left:10px;top:14px;width:7px;height:7px;border-radius:50%;background:var(--mut);}',
'.cr-beats li.good:before{background:#3ddc97;}',
'.cr-beats li.bad:before{background:#ff6b6b;}',
'.cr-beats li.gold{background:rgba(242,193,78,.1);color:#ffe3a0;font-weight:700;}',
'.cr-beats li.gold:before{background:#f2c14e;}',
'@keyframes crin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
'.cr-result{border-left:3px solid var(--orange);background:rgba(240,120,45,.08);border-radius:0 10px 10px 0;padding:10px 12px;margin:0 0 10px;animation:crin .3s ease-out both;}',
'.cr-result.good{border-color:#3ddc97;background:rgba(61,220,151,.08);}',
'.cr-result.bad{border-color:#ff6b6b;background:rgba(255,107,107,.08);}',
'.cr-result.gold{border-color:#f2c14e;background:rgba(242,193,78,.1);}',
'.cr-result .y{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-weight:800;}',
'.cr-result p{margin:4px 0 0;font-size:14.5px;line-height:1.5;}',
'.cr-diffs{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;}',
'.cr-diffs span{font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.06);font-family:var(--num);font-variant-numeric:tabular-nums;}',
'.cr-diffs span.up{color:#3ddc97;background:rgba(61,220,151,.1);}',
'.cr-diffs span.down{color:#ff8a8a;background:rgba(255,107,107,.1);}',
'.cr-card{border:1px solid var(--cardb);border-radius:14px;padding:16px;background:linear-gradient(180deg,#1a2130,#111722);animation:crin .35s ease-out both;}',
'.cr-card .eye{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--orange);font-weight:800;}',
'.cr-card h3{font-family:var(--display);font-weight:400;text-transform:uppercase;font-size:22px;line-height:1.1;margin:5px 0 6px;letter-spacing:.01em;}',
'.cr-card p.q{margin:0 0 12px;color:var(--mut);font-size:14.5px;line-height:1.5;}',
'.cr-card .cr-choices{display:flex;flex-direction:column;gap:8px;}',
'.cr-choice{text-align:left;background:rgba(255,255,255,.045);border:1px solid var(--cardb);color:var(--ink);padding:12px 14px;border-radius:11px;font-weight:700;font-size:15px;}',
'.cr-choice small{display:block;font-weight:500;font-size:12.5px;color:var(--mut);margin-top:2px;}',
'.cr-choice:hover:not(:disabled){border-color:var(--orange);background:rgba(240,120,45,.1);}',
'.cr-card.clutch{border-color:#f2c14e;background:radial-gradient(500px 220px at 50% -40px,rgba(242,193,78,.22),transparent 70%),linear-gradient(180deg,#221d12,#141109);}',
'.cr-card.clutch .eye{color:#f2c14e;}',
'.cr-card.fa .cr-choice b{display:block;}',
'.cr-next{margin:0;}',
'.cr-acts{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0;}',
'.cr-acts button{flex:1 1 0;min-width:120px;font-size:12.5px;padding:9px 10px;}',
/* draft night */
'.cr-draft{text-align:center;padding:20px 14px;border-radius:14px;margin:0 0 10px;background:radial-gradient(420px 200px at 50% 0,rgba(240,120,45,.2),transparent 70%),#0e131c;border:1px solid var(--cardb);}',
'.cr-draft .tick{font-family:var(--display);font-size:15px;letter-spacing:.06em;color:var(--mut);text-transform:uppercase;min-height:22px;}',
'.cr-draft .pk{font-family:var(--display);font-size:64px;line-height:1;margin:6px 0;}',
'.cr-draft .tm{font-family:var(--display);font-size:26px;text-transform:uppercase;}',
/* ratings, season, tabs */
'.cr-rt{display:grid;grid-template-columns:1fr;gap:6px 16px;}',
'@media (min-width:560px){.card .cr-rt{grid-template-columns:1fr 1fr;}}',
'.cr-rt .r{display:grid;grid-template-columns:86px 1fr 26px;align-items:center;gap:8px;font-size:12px;color:var(--mut);}',
'.cr-rt .r b{text-align:right;color:var(--ink);font-family:var(--num);font-variant-numeric:tabular-nums;font-size:13px;}',
'.cr-rt .cr-bar{margin:0;}',
'.cr-rt .r.hi .cr-bar i{background:#3ddc97;}',
'.cr-tabs{display:flex;gap:6px;margin:0 0 10px;}',
'.cr-tabs button{flex:1 1 0;background:rgba(255,255,255,.04);border:1px solid var(--cardb);color:var(--mut);padding:8px;font-size:12.5px;}',
'.cr-tabs button.on{color:var(--ink);border-color:var(--orange);background:rgba(240,120,45,.1);}',
'.cr-log{list-style:none;margin:0;padding:0;max-height:420px;overflow:auto;}',
'.cr-log li{font-size:13px;line-height:1.45;padding:6px 0;border-top:1px solid var(--line);color:var(--mut);display:flex;gap:10px;}',
'.cr-log li .yr{flex:0 0 40px;color:var(--dim);font-family:var(--num);font-variant-numeric:tabular-nums;font-weight:700;}',
'.cr-log li.gold{color:#ffe3a0;}',
'.cr-log li.good{color:var(--ink);}',
'.cr-tbl{width:100%;border-collapse:collapse;font-size:12px;font-family:var(--num);font-variant-numeric:tabular-nums;}',
'.cr-tblw{overflow-x:auto;margin:0 -4px;padding:0 4px;}',
'.cr-tbl th{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:800;text-align:right;padding:5px 4px;white-space:nowrap;}',
'.cr-tbl td{text-align:right;padding:6px 4px;border-top:1px solid var(--line);white-space:nowrap;}',
'.cr-tbl th:first-child,.cr-tbl td:first-child,.cr-tbl th:nth-child(2),.cr-tbl td:nth-child(2){text-align:left;}',
'.cr-tbl tr.champ td{color:#ffe3a0;}',
'.cr-aw{display:flex;flex-wrap:wrap;gap:6px;}',
'.cr-aw span{font-size:12px;font-weight:800;padding:5px 10px;border-radius:999px;background:rgba(242,193,78,.12);color:#ffe3a0;}',
/* the Hall of Fame card */
'.cr-final{text-align:center;padding:24px 16px;border-radius:16px;margin:0 0 12px;border:1px solid #f2c14e;',
'  background:radial-gradient(520px 240px at 50% -30px,rgba(242,193,78,.25),transparent 70%),linear-gradient(180deg,#1d1a12,#10131b);}',
'.cr-final .eye{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#f2c14e;font-weight:800;}',
'.cr-final .v{font-family:var(--display);font-size:40px;line-height:1;margin:8px 0 6px;text-transform:uppercase;}',
'.cr-final .nm{font-size:16px;font-weight:800;}',
'.cr-final p{margin:6px 0 0;color:var(--mut);}',
'.cr-tot{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 0;}',
'.cr-tot div{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;padding:8px 4px;}',
'.cr-tot b{display:block;font-family:var(--display);font-size:22px;font-weight:400;}',
'.cr-tot span{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-weight:800;}',
/* the sheet for things off the court */
'.cr-sheet{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(4,6,10,.62);}',
'.cr-sheet[hidden]{display:none;}',
'.cr-sheet .in{width:100%;max-width:560px;max-height:82vh;overflow:auto;background:#121826;border:1px solid var(--cardb);border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));}',
'.cr-sheet h3{font-family:var(--display);font-weight:400;font-size:20px;text-transform:uppercase;margin:0 0 4px;}',
'.cr-sheet .cash{font-size:13px;color:var(--mut);margin:0 0 12px;}',
'.cr-actrow{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);}',
'.cr-actrow div{flex:1 1 auto;min-width:0;}',
'.cr-actrow b{display:block;font-size:14px;}',
'.cr-actrow small{display:block;color:var(--mut);font-size:12px;}',
'.cr-actrow button{flex:0 0 auto;font-size:12.5px;padding:8px 12px;}',
'@media (prefers-reduced-motion:reduce){.cr-beats li,.cr-result,.cr-card{animation:none;}.cr-bar i{transition:none;}}',
].join('\n');
(function(){
  if (document.getElementById('cr-css')) return;
  var st = document.createElement('style');
  st.id = 'cr-css';
  st.textContent = CSS;
  document.head.appendChild(st);
})();

// ─── pieces ─────────────────────────────────────────────────────────────────

function skin(code){
  if (!code) return { primary: '#2b3242', secondary: '#c9ccd6', bg: '#2b3242', on: '#fff' };
  return E.clubSkin ? E.clubSkin(code) : { primary: '#2b3242', secondary: '#c9ccd6', bg: '#2b3242', on: '#fff' };
}
/* A jersey in the club's colours with your number on it. Drawn, so it is the
   one picture of the player this mode has, and it changes when you move. */
function jersey(L){
  var k = L && C.colorsOf ? C.colorsOf(L) : skin(null);
  var num = L && L.num != null ? L.num : '';
  return '<svg class="cr-jersey" viewBox="0 0 64 70" aria-hidden="true">'
    + '<path d="M14 4 L24 4 Q32 14 40 4 L50 4 L60 14 L54 26 L50 24 L50 66 L14 66 L14 24 L10 26 L4 14 Z" fill="' + k.primary + '" stroke="' + k.secondary + '" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<path d="M24 4 Q32 14 40 4" fill="none" stroke="' + k.secondary + '" stroke-width="3"/>'
    + '<text x="32" y="50" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="24" fill="' + k.secondary + '" stroke="rgba(0,0,0,.35)" stroke-width=".6">' + esc(String(num)) + '</text>'
    + '</svg>';
}
function bar(v){ return '<div class="cr-bar"><i style="width:' + Math.max(2, Math.min(100, v)) + '%"></i></div>'; }
function money(m){ return C.money(m); }
function teamName(c){ return c ? E.teamName(c) : 'No club'; }
/* A scout's letter for the ceiling, because the number would be a promise. */
function grade(L){
  var gap = L.pot;
  return gap >= 92 ? 'A+' : gap >= 88 ? 'A' : gap >= 84 ? 'B+' : gap >= 80 ? 'B' : gap >= 76 ? 'C+' : 'C';
}
function seasonTag(y){ return (y - 1) + '-' + String(y).slice(2); }

function diffsHtml(d){
  if (!d || !d.length) return '';
  return '<div class="cr-diffs">' + d.map(function(x){
    var v = x.money ? (x.d > 0 ? '+' : '-') + money(Math.abs(x.d)) : (x.d > 0 ? '+' : '') + x.d;
    return '<span class="' + (x.d > 0 ? 'up' : 'down') + '">' + esc(x.label) + ' ' + v + '</span>';
  }).join('') + '</div>';
}

// ─── the builder ────────────────────────────────────────────────────────────

var form = null;
function freshForm(){
  var seed = String(Math.floor(Math.random() * 1e9));
  return { seed: seed, name: C.randomName(seed), num: Math.floor(Math.random() * 100), pos: 'SF', arch: 'twoway', bg: 'oad', start: 'hs' };
}
function lifeOpts(){
  return { seed: form.seed, name: form.name, num: form.num, pos: form.pos, arch: form.arch, bg: form.bg, start: form.start, league: league() };
}
function preview(){ return C.newLife(lifeOpts()); }
var LEAGUE = null;
function league(){
  if (LEAGUE) return LEAGUE;
  var d = P.data;
  if (!d || !d.allPlayers) return null;
  var rows = [];
  for (var k in d.allPlayers) rows.push(d.allPlayers[k]);
  LEAGUE = C.seedLeague(rows);
  return LEAGUE;
}

function buildView(){
  if (!form) form = freshForm();
  var L = preview();
  var pos = C.POS.map(function(p){ return '<button data-pos="' + p + '" class="' + (form.pos === p ? 'on' : '') + '">' + p + '</button>'; }).join('');
  var arch = C.ARCH_KEYS.map(function(k){ var a = C.ARCHES[k];
    return '<button class="cr-opt' + (form.arch === k ? ' on' : '') + '" data-arch="' + k + '"><b>' + esc(a.name) + '</b><small>' + esc(a.blurb) + '</small></button>'; }).join('');
  var bg = C.BG_KEYS.map(function(k){ var b = C.BACKGROUNDS[k];
    return '<button class="cr-opt' + (form.bg === k ? ' on' : '') + '" data-bg="' + k + '"><b>' + esc(b.name) + '</b><small>Age ' + b.age + '. ' + esc(b.blurb) + '</small></button>'; }).join('');
  var road = form.start === 'hs';
  var starts = '<button class="cr-opt' + (road ? ' on' : '') + '" data-start="hs"><b>High school</b><small>Age 15. Recruiting, college, March, then the draft.</small></button>'
    + '<button class="cr-opt' + (!road ? ' on' : '') + '" data-start="draft"><b>Draft night</b><small>Skip ahead. Pick how you got there.</small></button>';
  var rv = road && C.roadView ? C.roadView(L) : null;
  var rt = C.RATINGS.map(function(k){
    return '<div class="r"><span>' + C.RATING_NAME[k] + '</span>' + bar(L.rt[k]) + '<b>' + L.rt[k] + '</b></div>';
  }).join('');
  return '<div class="card cr-build">'
    + '<div class="cr-top"><h2>New career</h2><button class="cr-home" id="cr-home">Home</button></div>'
    + '<p class="dim" style="margin:0">Your player is made up. The schools and the league are real.</p>'
    + '<span class="lab">Name and number</span>'
    + '<div class="cr-name"><input id="cr-name" maxlength="28" value="' + esc(form.name) + '" aria-label="Player name">'
    + '<input id="cr-num" class="cr-num" inputmode="numeric" maxlength="2" value="' + form.num + '" aria-label="Jersey number">'
    + '<button class="ghost" id="cr-dice" type="button" aria-label="New random name">New</button></div>'
    + '<span class="lab">Position</span><div class="cr-chips" id="cr-pos">' + pos + '</div>'
    + '<span class="lab">Your game</span><div class="cr-opts" id="cr-arch">' + arch + '</div>'
    + '<span class="lab">Where it starts</span><div class="cr-opts" id="cr-start">' + starts + '</div>'
    + (road ? '<p class="cr-town">' + esc(rv.what) + ' at ' + esc(rv.where) + '. ' + esc(rv.sub) + '.</p>'
      : '<span class="lab">Your road to the draft</span><div class="cr-opts" id="cr-bg">' + bg + '</div>')
    + '<div class="cr-preview"><div class="cr-ovr"><b>' + C.ovrOf(L) + '</b><span>Overall</span></div>'
    + '<div class="cr-bars cr-rt">' + rt + '</div></div>'
    + '<p class="dim" style="font-size:12.5px;margin:6px 0 14px">Scouts grade your ceiling <b>' + grade(L) + '</b>. Age ' + L.age + '. How high you go is up to you.</p>'
    + '<button class="big" id="cr-go">' + (road ? 'Start your sophomore year' : 'Go to the draft combine') + '</button>'
    + '</div>';
}
function wireBuild(){
  var root = $('s-car');
  var nm = $('cr-name'), nu = $('cr-num');
  if (nm) nm.oninput = function(){ form.name = nm.value; };
  if (nu) nu.oninput = function(){ var v = nu.value.replace(/\D/g, '').slice(0, 2); nu.value = v; form.num = v === '' ? 0 : +v; };
  $('cr-dice').onclick = function(){ var s = String(Math.floor(Math.random() * 1e9)); form.seed = s; form.name = C.randomName(s); render(); };
  root.querySelectorAll('[data-pos]').forEach(function(b){ b.onclick = function(){ form.pos = b.getAttribute('data-pos'); render(); }; });
  root.querySelectorAll('[data-arch]').forEach(function(b){ b.onclick = function(){ form.arch = b.getAttribute('data-arch'); render(); }; });
  root.querySelectorAll('[data-bg]').forEach(function(b){ b.onclick = function(){ form.bg = b.getAttribute('data-bg'); render(); }; });
  root.querySelectorAll('[data-start]').forEach(function(b){ b.onclick = function(){ form.start = b.getAttribute('data-start'); render(); }; });
  $('cr-home').onclick = goHome;
  $('cr-go').onclick = function(){
    var name = String(form.name || '').replace(/\s+/g, ' ').trim() || C.randomName(form.seed);
    var o = lifeOpts(); o.name = name;
    var L = C.newLife(o);
    store().cur = L;
    form = null;
    stage = { beats: [], result: null };
    save();
    render();
    window.scrollTo(0, 0);
  };
}

// ─── the life ───────────────────────────────────────────────────────────────

/* What the last press produced, which is not saved: a reload starts from the
   card on top rather than replaying the sentence that led to it. */
var stage = { beats: [], result: null, draft: null };
var tab = 'log';

function idCard(L){
  var v = C.view(L), k = C.colorsOf(L);
  var ct = L.contract;
  var rv = C.roadView(L);
  var sub = L.age + ' · ' + L.pos + ' · ' + C.ARCHES[L.arch].name;
  var club = rv ? rv.what + (rv.level === 'High school' ? ' at ' + rv.where : '') + (v.role ? ' · ' + v.role.label : '')
    : L.team ? teamName(L.team) + (v.role ? ' · ' + v.role.label : '') : (L.draft && !L.draft.team ? 'Undrafted' : 'Draft prospect');
  return '<div class="cr-id" style="--c1:' + k.primary + '">'
    + jersey(L)
    + '<div class="cr-who"><b>' + esc(L.name) + '</b><span>' + esc(sub) + '</span><span>' + esc(club) + '</span>'
    + (rv ? '<span>' + esc(rv.sub) + '</span>' : '')
    + (!rv && ct && ct.kind !== 'overseas' ? '<span>' + money(ct.salary) + ' a year · ' + ct.years + (ct.years === 1 ? ' year left' : ' years left') + '</span>' : '')
    + '</div><div class="cr-ovr"><b>' + v.ovr + '</b><span>Overall</span></div></div>';
}
function meters(L){
  var m = L.m;
  var one = function(cls, name, val){ return '<div class="cr-m ' + cls + '"><div class="t">' + name + ' <b>' + val + '</b></div>' + bar(val) + '</div>'; };
  return '<div class="cr-meters">' + one('health', 'Health', m.health) + one('morale', 'Morale', m.morale)
    + one('fame', 'Fame', m.fame) + one('trust', 'Coach', m.trust) + '</div>';
}
function facts(L){
  var s = L.season, v = C.view(L);
  var rec = s ? s.w + '-' + s.l : '-';
  var recSub = s ? seasonTag(s.year) + (s.g ? ' · game ' + s.g : ' · not started') : (L.year ? seasonTag(L.year) : '');
  var line = v.line ? v.line.pts + ' pts' : '-';
  var lineSub = v.line ? v.line.reb + ' reb · ' + v.line.ast + ' ast' : 'This season';
  return '<div class="cr-facts">'
    + '<div class="cr-fact"><span class="k">Record</span><b>' + rec + '</b><small>' + esc(recSub) + '</small></div>'
    + '<div class="cr-fact"><span class="k">Your line</span><b>' + line + '</b><small>' + lineSub + '</small></div>'
    + thirdFact(L)
    + '</div>';
}

/* The third fact is the one that matters at this stage of a life: the class
   ranking in high school, the mock draft in college, the money after. */
function thirdFact(L){
  var a = L.am, lv = a && L.stage !== 'nba' ? a.level : null;
  if (lv === 'hs') return '<div class="cr-fact"><span class="k">Ranking</span><b>' + (a.rank > 600 ? '-' : '#' + a.rank) + '</b><small>' + (a.rank > 600 ? 'Unranked' : C.starsOf(a.rank) + ' stars') + '</small></div>';
  if (lv === 'col') {
    var p = C.projectedPick(L, a.stock || 0);
    return '<div class="cr-fact"><span class="k">Mock draft</span><b>' + (p <= 60 ? C.ordinal(p) : '-') + '</b><small>NIL ' + money(L.cash) + '</small></div>';
  }
  return '<div class="cr-fact"><span class="k">Bank</span><b>' + money(L.cash) + '</b><small>' + money(L.earned) + ' earned</small></div>';
}

function cardHtml(L, c){
  var cls = c.kind === 'clutch' ? ' clutch' : c.kind === 'fa' ? ' fa' : '';
  var opts = c.options.map(function(o, i){
    return '<button class="cr-choice" data-i="' + i + '">' + esc(o.label) + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</button>';
  }).join('');
  return '<div class="cr-card' + cls + '" id="cr-card"><div class="eye">' + esc(c.eyebrow || '') + '</div>'
    + '<h3>' + esc(c.title) + '</h3>' + (c.text ? '<p class="q">' + esc(c.text) + '</p>' : '')
    + '<div class="cr-choices">' + opts + '</div></div>';
}
function beatsHtml(list){
  if (!list || !list.length) return '';
  return '<ul class="cr-beats">' + list.map(function(b, i){
    return '<li class="' + (b.tone || '') + '" style="animation-delay:' + (REDUCED ? 0 : i * 90) + 'ms">' + esc(b.text) + '</li>';
  }).join('') + '</ul>';
}
function resultHtml(r){
  if (!r) return '';
  return '<div class="cr-result ' + (r.tone || '') + '"><div class="y">You: ' + esc(r.label) + '</div><p>' + esc(r.text) + '</p>' + diffsHtml(r.diff) + '</div>';
}
function draftHtml(d){
  if (!d) return '';
  var k = skin(d.team);
  return '<div class="cr-draft" id="cr-draftbox" style="--c1:' + k.primary + '">'
    + '<div class="tick" id="cr-tick">The commissioner steps up</div>'
    + '<div class="pk" id="cr-pk" style="color:' + k.secondary + '">#' + d.pick + '</div>'
    + '<div class="tm" id="cr-tm">' + esc(teamName(d.team)) + '</div></div>';
}

function stageHtml(L){
  var out = '';
  if (stage.draft) out += draftHtml(stage.draft);
  out += resultHtml(stage.result);
  out += beatsHtml(stage.beats);
  if (L.pending.length) out += cardHtml(L, L.pending[0]);
  else {
    var lab = C.nextLabel(L);
    if (lab) out += '<button class="big cr-next" id="cr-next">' + esc(lab) + '</button>';
    var acts = C.actsOpen(L);
    if (acts.length) {
      out += '<div class="cr-acts">';
      if (acts.some(function(a){ return a.id === 'coach'; })) out += btnAct(acts, 'coach');
      if (acts.some(function(a){ return a.id === 'trade'; })) out += btnAct(acts, 'trade');
      out += '<button class="ghost" id="cr-off">Off the court</button></div>';
    }
  }
  return '<div class="cr-stage" id="cr-stage">' + out + '</div>';
}
function btnAct(acts, id){
  var a = acts.filter(function(x){ return x.id === id; })[0];
  return '<button class="ghost" data-act="' + id + '"' + (a.ok ? '' : ' disabled') + '>' + esc(a.name) + (a.used ? ' (done)' : '') + '</button>';
}

function ratingsHtml(L){
  var w = C.WEIGHTS[L.pos];
  var rows = C.RATINGS.map(function(k){
    return '<div class="r' + (w[k] >= 0.2 ? ' hi' : '') + '"><span>' + C.RATING_NAME[k] + '</span>' + bar(L.rt[k]) + '<b>' + L.rt[k] + '</b></div>';
  }).join('');
  return '<div class="card"><h2>Ratings <span class="sub">Green counts most at ' + L.pos + '. Ceiling ' + grade(L) + '.</span></h2><div class="cr-rt">' + rows + '</div></div>';
}
function tabsHtml(L){
  var body = '';
  if (tab === 'log') {
    var log = L.log.slice().reverse().slice(0, 160);
    body = '<ul class="cr-log">' + log.map(function(e){ return '<li class="' + (e.tone || '') + '"><span class="yr">' + e.y + '</span><span>' + esc(e.t) + '</span></li>'; }).join('') + '</ul>';
  } else if (tab === 'seasons') body = seasonsTable(L);
  else body = trophies(L);
  var t = function(id, name){ return '<button class="' + (tab === id ? 'on' : '') + '" data-tab="' + id + '">' + name + '</button>'; };
  return '<div class="card"><div class="cr-tabs">' + t('log', 'Story') + t('seasons', 'Seasons') + t('trophies', 'Trophy case') + '</div>' + body + '</div>';
}
function seasonsTable(L){
  var am = amTable(L.amHist || []);
  if (!L.history.length) return am || '<p class="dim">No seasons yet.</p>';
  var rows = L.history.slice().reverse().map(function(h){
    return '<tr class="' + (h.po === 'Champion' ? 'champ' : '') + '"><td>' + seasonTag(h.y) + '</td><td>' + esc(h.t ? E.TEAM_NAMES[h.t] || h.t : '-') + '</td>'
      + '<td>' + h.ovr + '</td><td>' + h.gp + '</td><td>' + h.pts + '</td><td>' + h.reb + '</td><td>' + h.ast + '</td>'
      + '<td>' + h.w + '-' + h.l + '</td><td>' + esc(h.po) + '</td></tr>';
  }).join('');
  return '<div class="cr-tblw"><table class="cr-tbl"><thead><tr><th>Season</th><th>Team</th><th>OVR</th><th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>Record</th><th>Finish</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + (am ? '<h3 class="cr-sub">Before the league</h3>' + am : '');
}
/* High school, college and a pro year, newest first. */
function amTable(list){
  if (!list.length) return '';
  var rows = list.slice().reverse().map(function(h){
    var fin = h.finish || '-';
    if (h.seed) fin = h.seed + ' seed · ' + fin;
    return '<tr class="' + (/champion/i.test(fin) ? 'champ' : '') + '"><td>' + seasonTag(h.y) + '</td><td>' + esc(h.school) + '</td>'
      + '<td>' + h.ovr + '</td><td>' + h.gp + '</td><td>' + h.pts + '</td><td>' + h.reb + '</td><td>' + h.ast + '</td>'
      + '<td>' + h.w + '-' + h.l + '</td><td>' + esc(fin) + '</td></tr>';
  }).join('');
  return '<div class="cr-tblw"><table class="cr-tbl"><thead><tr><th>Season</th><th>School</th><th>OVR</th><th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>Record</th><th>Finish</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function awardCounts(L){
  var n = {};
  L.history.concat(L.amHist || []).forEach(function(h){ (h.aw || []).forEach(function(a){ n[a] = (n[a] || 0) + 1; }); });
  var order = ['champ', 'mvp', 'fmvp', 'an1', 'an2', 'an3', 'dpoy', 'star', 'roy', '6moy', 'mip', 'scor', 'ad1', 'ad2', 'olympic',
    'c_champ', 'c_npoy', 'c_mop', 'c_aa1', 'c_aa2', 'c_f4', 'c_fr', 'c_cpoy', 'c_allconf', 'hs_state', 'hs_mrbb', 'hs_aag', 'hs_allstate'];
  return order.filter(function(k){ return n[k]; }).map(function(k){ return { k: k, n: n[k], name: C.AWARD_NAME[k] }; });
}
function trophies(L){
  var T = C.totals(L);
  var aw = awardCounts(L);
  var chips = aw.length ? '<div class="cr-aw">' + aw.map(function(a){ return '<span>' + (a.n > 1 ? a.n + 'x ' : '') + esc(a.name) + '</span>'; }).join('') + '</div>'
    : '<p class="dim">Nothing yet. Go get something.</p>';
  return '<div class="cr-tot" style="margin-top:0">'
    + '<div><b>' + T.pts.toLocaleString() + '</b><span>Points</span></div>'
    + '<div><b>' + T.reb.toLocaleString() + '</b><span>Rebounds</span></div>'
    + '<div><b>' + T.ast.toLocaleString() + '</b><span>Assists</span></div>'
    + '<div><b>' + T.rings + '</b><span>Rings</span></div></div>'
    + '<div style="margin-top:12px">' + chips + '</div>'
    + rivalHtml(L)
    + '<p class="cr-lifeline">Off the floor: <b>' + esc(C.lifeLine(L)) + '</b></p>';
}
/* You against the man drafted next to you. */
function rivalHtml(L){
  var r = L.rival;
  if (!r) return '';
  var T = C.totals(L);
  var row = function(lab, a, b){ return '<tr><td>' + lab + '</td><td class="' + (a > b ? 'win' : '') + '">' + a.toLocaleString('en-US') + '</td><td class="' + (b > a ? 'win' : '') + '">' + b.toLocaleString('en-US') + '</td></tr>'; };
  var last = r.seasons[r.seasons.length - 1];
  return '<h3 class="cr-sub">Your rival</h3>'
    + '<p class="cr-rivalwho"><b>' + esc(r.name) + '</b>, drafted ' + C.ordinal(r.pick) + '. '
    + (r.retired ? 'Retired.' : last ? E.teamName(last.team) + ', ' + last.pts + ' a night last season.' : 'Rookie year ahead.') + '</p>'
    + '<table class="cr-tbl cr-vs"><thead><tr><th></th><th>You</th><th>' + esc(r.name.split(' ').slice(-1)[0]) + '</th></tr></thead><tbody>'
    + row('Points', T.pts, r.pts) + row('All-Star', T.star, r.star) + row('MVP', T.mvp, r.mvp) + row('Rings', T.rings, r.rings)
    + '</tbody></table>';
}

function lifeView(L){
  return '<div class="cr-top"><h2>Career</h2><button class="cr-home" id="cr-home">Home</button></div>'
    + idCard(L) + meters(L) + stageHtml(L) + facts(L) + ratingsHtml(L) + tabsHtml(L)
    + (L.phase === 'after' ? '' : '<button class="ghost" id="cr-quit" style="width:100%;margin-top:4px">Retire now</button>');
}

function wireLife(L){
  var root = $('s-car');
  $('cr-home').onclick = goHome;
  var nx = $('cr-next');
  if (nx) nx.onclick = function(){ doStep(); };
  root.querySelectorAll('.cr-choice').forEach(function(b){
    b.onclick = function(){ doChoose(+b.getAttribute('data-i')); };
  });
  root.querySelectorAll('[data-act]').forEach(function(b){ b.onclick = function(){ doAct(b.getAttribute('data-act')); }; });
  root.querySelectorAll('[data-tab]').forEach(function(b){ b.onclick = function(){ tab = b.getAttribute('data-tab'); render(); }; });
  var off = $('cr-off');
  if (off) off.onclick = openOff;
  var q = $('cr-quit');
  if (q) q.onclick = function(){
    if (!confirm('Retire now? The career ends here and goes in your Hall of Fame.')) return;
    var beats = C.retireNow(L);
    if (L.retired) return finish();
    stage = { beats: beats, result: null, draft: null };
    save();
    render();
    scrollStage();
  };
  if (stage.draft) animateDraft();
}

function doStep(){
  var L = store().cur;
  if (!L) return;
  var res = C.step(L);
  stage = { beats: res.beats || [], result: null, draft: null };
  var d = (res.beats || []).filter(function(b){ return b.kind === 'draft' && b.pick; })[0];
  if (d) stage.draft = { pick: d.pick, team: d.team };
  if (L.retired) return finish();
  save();
  render();
  scrollStage();
}
function doChoose(i){
  var L = store().cur;
  if (!L) return;
  var res = C.choose(L, i);
  if (!res) return;
  stage = { beats: res.beats || [], result: res, draft: null };
  if (L.retired) return finish();
  save();
  render();
  scrollStage();
}
function doAct(id){
  var L = store().cur;
  var res = L && C.act(L, id);
  if (!res) return;
  closeOff();
  stage = { beats: [], result: res, draft: null };
  save();
  render();
  scrollStage();
}
/* The stage is where the eye goes after a press, not the top of the page. */
function scrollStage(){
  var st = $('cr-stage');
  if (!st) return;
  var r = st.getBoundingClientRect();
  if (r.top < 60 || r.top > window.innerHeight * 0.55) {
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 70), behavior: REDUCED ? 'auto' : 'smooth' });
  }
}

/* Draft night counts through the picks before yours, then lands. */
function animateDraft(){
  var d = stage.draft, tick = $('cr-tick'), pk = $('cr-pk'), tm = $('cr-tm');
  if (!d || !tick || REDUCED) return;
  var L = store().cur;
  var order = C.draftOrder(L);
  var n = 1;
  pk.style.visibility = 'hidden'; tm.style.visibility = 'hidden';
  var step = Math.max(28, Math.min(90, 1400 / Math.max(1, d.pick)));
  var t = setInterval(function(){
    if (!document.body.contains(tick)) { clearInterval(t); return; }
    if (n >= d.pick) {
      clearInterval(t);
      tick.textContent = 'With the ' + C.ordinal(d.pick) + ' pick';
      pk.style.visibility = ''; tm.style.visibility = '';
      stage.draft = null;
      return;
    }
    tick.textContent = 'Pick ' + n + ': the ' + (E.TEAM_NAMES[order[n - 1]] || order[n - 1]) + ' are on the clock';
    n++;
  }, step);
}

// ─── off the court ──────────────────────────────────────────────────────────

function openOff(){
  var L = store().cur;
  if (!L) return;
  var sh = $('cr-sheet');
  var acts = C.actsOpen(L).filter(function(a){ return a.id !== 'coach' && a.id !== 'trade'; });
  sh.querySelector('.in').innerHTML = '<h3>Off the court</h3><p class="cash">In the bank: <b>' + money(L.cash) + '</b>. One of each a season.</p>'
    + acts.map(function(a){
      return '<div class="cr-actrow"><div><b>' + esc(a.name) + '</b><small>' + esc(a.blurb) + (a.cost ? ' · ' + money(a.cost) : '') + '</small></div>'
        + '<button data-oact="' + a.id + '"' + (a.ok ? '' : ' disabled') + '>' + (a.used ? 'Done' : 'Do it') + '</button></div>';
    }).join('')
    + '<button class="ghost" id="cr-sheet-x" style="width:100%;margin-top:10px">Close</button>';
  sh.hidden = false;
  sh.querySelectorAll('[data-oact]').forEach(function(b){ b.onclick = function(){ doAct(b.getAttribute('data-oact')); }; });
  $('cr-sheet-x').onclick = closeOff;
  sh.onclick = function(e){ if (e.target === sh) closeOff(); };
}
function closeOff(){ var sh = $('cr-sheet'); if (sh) sh.hidden = true; }

// ─── the end ────────────────────────────────────────────────────────────────

/* One line about the road, for the Hall of Fame card and the share. */
function collegeOf(L){
  var col = (L.amHist || []).filter(function(h){ return h.lvl === 'NCAA'; });
  if (!col.length) {
    var pro = (L.amHist || []).filter(function(h){ return h.lvl !== 'HS'; })[0];
    return pro ? (pro.lvl === 'Overseas' ? 'Turned pro overseas out of high school' : 'Went to the G League out of high school') : '';
  }
  var schools = [];
  col.forEach(function(h){ if (schools.indexOf(h.school) < 0) schools.push(h.school); });
  var titles = col.filter(function(h){ return (h.aw || []).indexOf('c_champ') >= 0; }).length;
  var yrs = col.length === 1 ? 'One and done at ' : col.length + ' years at ';
  return yrs + schools.join(' and ') + (titles ? '. National champion' : '');
}

/* A finished career leaves the slot and goes on the shelf of Hall of Fame
   cards, so the next one can start while this one is still on screen. */
function finish(){
  var st = store(), L = st.cur;
  if (!L) return;
  var f = L.final || C.legacy(L);
  var teams = [];
  L.history.forEach(function(h){ if (h.t && teams.indexOf(h.t) < 0) teams.push(h.t); });
  var card = { name: L.name, num: L.num, pos: L.pos, verdict: f.verdict, blurb: f.blurb, score: f.score,
    from: L.history.length ? L.history[0].y : L.year, to: L.history.length ? L.history[L.history.length - 1].y : L.year,
    teams: teams, totals: f.totals, awards: awardCounts(L), history: L.history, amHist: L.amHist || [], college: collegeOf(L),
    after: f.after || '', jersey: f.jersey || null, rival: f.rival || null, life: f.life || '',
    team: teams[teams.length - 1] || null, at: Date.now() };
  /* The badges, through the page's one feat writer, so a Career badge is
     kept on the account the way every other mode's is. */
  var BD = window.RTF_BADGES;
  if (BD && BD.careerFeats && C.featSummary && P.feats && L.history.length) P.feats(BD.careerFeats(C.featSummary(L)));
  var sum = C.boardSummary ? C.boardSummary(L) : null;
  st.hof.unshift(card);
  if (st.hof.length > 20) st.hof.length = 20;
  st.cur = null;
  st.last = card;
  save();
  render();
  window.scrollTo(0, 0);
  if (sum) fileCareer(card, sum);
}

/* ─── the Career board ──────────────────────────────────────────────────────
   A career that reached the league is filed once, when it ends
   (supabase/130_hoops_careers.sql). The board is optional like everywhere in
   this game: every call fails soft to null and the Hall card never waits for
   it. The row's id is kept ON THE CARD, which rides in the life slot, so it
   is on the account and a guest's careers can be claimed on sign in. */
function BB(){ return P.board ? P.board() : null; }
function signedIn(){ var a = P.auth && P.auth(); return !!(a && a.state && a.state().signedIn); }
function fileCareer(card, sum){
  var B = BB();
  if (!B || !B.submitCareer) return;
  var guest = !signedIn();
  B.submitCareer(sum).then(function(id){
    if (!id) {
      card.board = { off: true, migration: !!B.needsMigration };
      save(); paintPlace(card);
      return;
    }
    card.board = { id: id, guest: guest };
    save(); paintPlace(card);
  });
}
/* Where the career sits, asked fresh every time the card is drawn, because
   the field keeps growing after it was filed. */
function paintPlace(card){
  var el = $('cr-place');
  if (!el || store().last !== card) return;
  var b = card.board;
  if (!b) { el.hidden = true; return; }
  if (b.off) {
    el.hidden = false;
    el.innerHTML = '<span>' + (b.migration ? 'The Career board is not set up on this site yet.' : 'Career board not reachable right now. This career still counts here.') + '</span>';
    return;
  }
  var B = BB();
  el.hidden = false;
  el.innerHTML = '<span>On the Career board.</span><button class="ghost" id="cr-board">See the board</button>';
  wireBoardBtn();
  if (!B || !B.careerPlace) return;
  B.careerPlace(card.score).then(function(pl){
    if (!pl || store().last !== card || !$('cr-place')) return;
    var total = Math.max(pl.total, pl.place);
    el.innerHTML = '<span><b>' + ordinal(pl.place) + '</b> of ' + total.toLocaleString('en-US') + (total === 1 ? ' career' : ' careers')
      + (b.guest && !signedIn() ? '. On the board as Guest. Sign in to put your name on it.' : '.') + '</span>'
      + '<button class="ghost" id="cr-board">See the board</button>';
    wireBoardBtn();
  });
}
function wireBoardBtn(){
  var b = $('cr-board');
  if (b) b.onclick = function(){ if (P.openBoard) P.openBoard({ door: 'career' }); };
}
function ordinal(n){
  var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
/* Every career this browser or this account filed, for the board's own
   marking of your rows. */
function boardIds(){
  var st = store(), ids = {};
  (st.hof || []).concat(st.last ? [st.last] : []).forEach(function(c){ if (c && c.board && c.board.id) ids[c.board.id] = 1; });
  return ids;
}
/* A career finished signed out, taken over on the way in. */
function claimGuests(){
  if (!signedIn()) return;
  var B = BB(), st = store(), any = false;
  if (!B || !B.claimCareer) return;
  (st.hof || []).concat(st.last ? [st.last] : []).forEach(function(c){
    if (!c || !c.board || !c.board.id || !c.board.guest) return;
    c.board.guest = false;
    any = true;
    B.claimCareer(c.board.id);
  });
  if (any) save();
}

function finalView(card){
  var T = card.totals;
  var gp = Math.max(1, T.gp);
  var aw = card.awards && card.awards.length ? '<div class="cr-aw" style="justify-content:center;margin-top:14px">'
    + card.awards.map(function(a){ return '<span>' + (a.n > 1 ? a.n + 'x ' : '') + esc(a.name) + '</span>'; }).join('') + '</div>' : '';
  var hist = { history: card.history || [], amHist: card.amHist || [] };
  return '<div class="cr-top"><h2>Career over</h2><button class="cr-home" id="cr-home">Home</button></div>'
    + '<div class="cr-final"><div class="eye">The verdict</div><div class="v">' + esc(card.verdict) + '</div>'
    + '<div class="nm">' + esc(card.name) + ' · #' + esc(String(card.num)) + ' · ' + card.from + '-' + card.to + '</div>'
    + '<p>' + esc(card.blurb) + '</p>'
    + (card.college ? '<p class="cr-col">' + esc(card.college) + '</p>' : '')
    + (card.jersey ? '<p class="cr-col">Your #' + esc(String(card.num)) + ' hangs in the rafters for the ' + esc(E.TEAM_NAMES[card.jersey] || card.jersey) + '.</p>' : '')
    + '<div class="cr-tot"><div><b>' + T.pts.toLocaleString() + '</b><span>Points</span></div>'
    + '<div><b>' + (T.pts / gp).toFixed(1) + '</b><span>A game</span></div>'
    + '<div><b>' + T.rings + '</b><span>Rings</span></div>'
    + '<div><b>' + T.seasons + '</b><span>Seasons</span></div></div>' + aw + '</div>'
    + (card.after || card.rival || card.life ? '<div class="card cr-epi">'
      + (card.after ? '<p><span class="k">After basketball</span>' + esc(card.after) + '</p>' : '')
      + (card.rival ? '<p><span class="k">Your rival</span>' + esc(card.rival.name) + ': ' + card.rival.pts.toLocaleString('en-US') + ' points, '
        + card.rival.star + 'x All-Star, ' + card.rival.rings + (card.rival.rings === 1 ? ' ring.' : ' rings.')
        + (card.totals.pts > card.rival.pts ? ' You had the better career.' : ' He had the better career.') + '</p>' : '')
      + (card.life ? '<p><span class="k">Off the floor</span>' + esc(card.life) + '.</p>' : '')
      + '</div>' : '')
    + '<div class="cr-place" id="cr-place" hidden></div>'
    + '<div class="btnrow" style="margin:0 0 12px"><button id="cr-share">Share it</button><button class="ghost" id="cr-again">New career</button></div>'
    + '<div class="card"><h2>Season by season</h2>' + seasonsTable(hist) + '</div>';
}
function shareText(card){
  var T = card.totals;
  var bits = [card.name + ': ' + card.verdict + '.', T.pts.toLocaleString() + ' points over ' + T.seasons + ' seasons.'];
  if (T.rings) bits.push(T.rings + (T.rings === 1 ? ' ring.' : ' rings.'));
  if (T.mvp) bits.push(T.mvp + 'x MVP.');
  if (T.star) bits.push(T.star + 'x All-Star.');
  if (card.college) bits.push(card.college + '.');
  return 'Run The Floor · Career\n' + bits.join(' ') + '\nLive your own NBA life: ' + P.SHARE_URL;
}
function wireFinal(card){
  $('cr-home').onclick = goHome;
  $('cr-again').onclick = function(){ store().last = null; save(); form = null; render(); window.scrollTo(0, 0); };
  $('cr-share').onclick = function(){ P.shareText(shareText(card)); };
  paintPlace(card);
}

// ─── the screen ─────────────────────────────────────────────────────────────

function render(){
  var root = $('s-car');
  if (!root) return;
  var st = store();
  if (!root.querySelector('#cr-body')) {
    root.innerHTML = '<div id="cr-body"></div><div class="cr-sheet" id="cr-sheet" hidden><div class="in"></div></div>';
  }
  var body = $('cr-body');
  if (st.cur) { body.innerHTML = lifeView(st.cur); wireLife(st.cur); }
  else if (st.last) { body.innerHTML = finalView(st.last); wireFinal(st.last); }
  else { body.innerHTML = buildView(); wireBuild(); }
  /* The chip in the top bar says who you are mid-career and nothing otherwise:
     it sits beside the Career button, and a second "Career" there reads as
     the same button twice. */
  if (P.bar) P.bar(st.cur ? st.cur.name.split(' ').slice(-1)[0] + ' · ' + C.ovrOf(st.cur) : '');
}
function open(){
  if (!league()) { P.toast('The league is still loading.'); return; }
  S = null;
  stage = { beats: [], result: null, draft: null };
  P.show('s-car');
  render();
}
function goHome(){ closeOff(); P.goHome(); }

// ─── the front page ─────────────────────────────────────────────────────────

/* The hero card is static markup in index.html, so the dock can find its
   button at boot. This fills it in: a career in progress says who and where,
   none says what the mode is. */
function renderHero(){
  var st = store(), L = st.cur;
  var cur = $('ch-cur'), say = $('ch-say'), go = $('b-career'), best = $('ch-best'), path = $('ch-path');
  if (!go) return;
  if (L && !L.retired) {
    var k = C.colorsOf(L);
    var v = C.view(L);
    var rv = C.roadView(L);
    var where = rv ? rv.what + (rv.level === 'High school' ? ' at ' + rv.where : '') : L.team ? teamName(L.team) : 'Draft prospect';
    var when = L.season ? seasonTag(L.season.year) + ' · ' + L.season.w + '-' + L.season.l : (L.year ? 'Summer of ' + (L.year - 1) : '');
    cur.innerHTML = jersey(L) + '<div><b>' + esc(L.name) + '</b><span>' + esc(where) + '</span><span>Age ' + L.age + ' · ' + esc(when) + '</span></div>'
      + '<div class="o"><b>' + v.ovr + '</b><span>OVR</span></div>';
    cur.style.setProperty('--c1', k.primary);
    cur.hidden = false;
    if (say) say.hidden = true;
    if (path) path.hidden = true;
    go.textContent = 'Continue your career';
  } else {
    cur.hidden = true;
    if (say) say.hidden = false;
    if (path) path.hidden = false;
    go.textContent = 'Start your career';
  }
  var top = st.hof.slice().sort(function(a, b){ return b.score - a.score; })[0];
  if (best) {
    best.hidden = !top;
    if (top) best.innerHTML = 'Your best: <b>' + esc(top.name) + '</b>, ' + esc(top.verdict) + '. ' + st.hof.length + (st.hof.length === 1 ? ' career' : ' careers') + ' played.';
  }
  go.disabled = !league();
  go.onclick = open;
}

window.RTF_CAREER_UI = {
  open: open,
  renderHero: renderHero,
  reload: reload,
  /* For the page's dock and for check-career.mjs. */
  KEY: KEY,
  state: function(){ return store(); },
  boardIds: boardIds,
};

function boot(){
  var a = P.auth && P.auth();
  if (a && a.onChange && !boot.wired) { boot.wired = true; a.onChange(claimGuests); claimGuests(); }
  renderHero();
  if (!league()) { setTimeout(boot, 250); return; }
  renderHero();
}
boot();
})();
