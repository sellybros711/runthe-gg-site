/* Run The Floor: the screens for Conquest, Fix History and Six Passes.
 *
 * The rules live in modes.js and this file only draws them. It talks to the
 * page through window.RTF_PAGE, which index.html publishes before it boots, so
 * it never reaches into the page's own closure and the page never reaches into
 * this one. Browser only.
 *
 * ITS STYLESHEET IS INJECTED FROM HERE, which is /assets/store.js's arrangement
 * and for its reason: a stylesheet in its own file is a second thing with a
 * cache version that nothing checks, and the markup and the rules that dress it
 * belong to one release.
 */
(function(){
'use strict';

var E = window.RTF_ENGINE, M = window.RTF_MODES;
var P = window.RTF_PAGE;
if (!E || !M || !P) return;

var UI_VERSION = 1;
var $ = function(id){ return document.getElementById(id); };
var esc = P.esc;
var money = P.money;

// ─── storage ───────────────────────────────────────────────────────────────

/* Wrapped, because a private window throws on the accessor itself. */
function lsGet(k){
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function lsSet(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  syncWrite(k);
}
function lsDel(k){ try { localStorage.removeItem(k); } catch (e) {} syncWrite(k); }

/* ── EVERY MODE IS ON THE ACCOUNT ─────────────────────────────────────────
 *
 * Every key this file writes that is a player's record (the Conquest run and
 * bests, Fix History's days and season, Six Passes' days, both endless
 * puzzles) is also a slot on the account's shelf. hoops/cloud.js says which
 * key is which slot and how two copies of it combine; this is the half that
 * sends and adopts. The browser copy is a cache: a write lands here first,
 * synchronously, and goes up behind it; a pull on sign in brings the account's
 * copy down and the account's copy wins wherever the two cannot be combined.
 *
 * The clock slots count their own writes (`rtf.rev.v1`), which is the whole of
 * how a device that played later beats one that played earlier. A write the
 * shelf refuses answers with what the shelf holds, and that is adopted or
 * merged on the spot. Guests write the cache and nothing else, and their
 * records go up with the next sign in. */
var REV_KEY = 'rtf.rev.v1';
function revs(){
  try { var r = JSON.parse(localStorage.getItem(REV_KEY) || '{}'); return (r && typeof r === 'object') ? r : {}; }
  catch (e) { return {}; }
}
function setRev(slot, n){
  var r = revs();
  r[slot] = n;
  try { localStorage.setItem(REV_KEY, JSON.stringify(r)); } catch (e) {}
}
function modeCL(){ return (P.cloudMode && P.cloudMode.CL()) || null; }
function rawGet(k){ try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function rawPut(k, v){
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}
function modePush(key, slot){
  if (!P.cloudMode || !P.cloudMode.ready()) return;
  var CLm = modeCL();
  var sent = P.cloudMode.push(slot, function(){
    var payload = { rev: revs()[slot] || 0, v: rawGet(key) };
    return { payload: payload, progress: CLm.modeProgress(slot, payload) };
  });
  if (sent && sent.then) sent.then(function(res){
    /* REFUSED: the shelf is further along. Take what it holds. */
    if (res && res.ok === false) modeAdopt(key, slot, res, true);
  });
}
function syncWrite(k){
  var CLm = modeCL();
  var slot = CLm && CLm.MODE_KEYS[k];
  if (!slot) return;
  if (CLm.modeKind(slot) === 'clock') setRev(slot, (revs()[slot] || 0) + 1);
  modePush(k, slot);
}
/* Which screen a key's record is on screen in. A record is never swapped out
   from under somebody playing it: the device keeps its own and its next write,
   counted past the shelf's, is the one that stands. */
var MODE_SCREEN = { cq: 's-cq', fixrun: 's-fix', fixend: 's-fix', psend: 's-pass', passes: 's-pass', life: 's-car' };
function onScreen(slot){
  var id = MODE_SCREEN[slot], el = id && $(id);
  return !!(el && el.classList.contains('active'));
}
/* One slot, from the shelf. Answers whether the browser copy changed. */
function modeAdopt(key, slot, row, claim){
  var CLm = modeCL();
  var theirs = row && row.payload && typeof row.payload === 'object' ? row.payload : null;
  var here = rawGet(key), mine = revs()[slot] || 0;
  if (!claim) {
    /* ANOTHER ACCOUNT'S BROWSER: the account's own copy stands alone, and
       no copy at all means nothing, never the previous reader's record. */
    rawPut(key, theirs ? theirs.v : null);
    setRev(slot, theirs ? (theirs.rev || 0) : 0);
    return JSON.stringify(here) !== JSON.stringify(theirs ? theirs.v : null);
  }
  if (CLm.modeKind(slot) === 'merge') {
    var merged = CLm.modeMerge(slot, here, theirs ? theirs.v : null);
    if (merged == null) return false;
    var changed = JSON.stringify(merged) !== JSON.stringify(here);
    if (changed) rawPut(key, merged);
    if (!theirs || JSON.stringify(merged) !== JSON.stringify(theirs.v)) modePush(key, slot);
    return changed;
  }
  if (!theirs) { if (here != null) modePush(key, slot); return false; }
  var tr = theirs.rev || 0;
  /* A TIE GOES TO THE SHELF, so two devices that never wrote after this
     shipped agree on one copy rather than each keeping its own. */
  if (tr >= mine) {
    if (onScreen(slot)) { setRev(slot, Math.max(mine, tr)); return false; }
    setRev(slot, tr);
    if (JSON.stringify(here) === JSON.stringify(theirs.v)) return false;
    rawPut(key, theirs.v);
    return true;
  }
  modePush(key, slot);
  return false;
}
/* Every slot, from a pull. `by` is the shelf's rows by slot name. */
function cloudAdopt(by, claim){
  var CLm = modeCL();
  if (!CLm) return;
  var changed = false;
  for (var key in CLm.MODE_KEYS) {
    var slot = CLm.MODE_KEYS[key];
    if (modeAdopt(key, slot, by && by[slot], claim)) changed = true;
  }
  if (!changed) return;
  /* What is in memory was read from the old copies. */
  if (!onScreen('cq')) cq = null;
  if (!onScreen('fixrun')) { fx = null; fxSt = null; fxDayPz = null; }
  if (!onScreen('psend')) psPz = null;
  if (window.RTF_CAREER_UI) window.RTF_CAREER_UI.reload();
  var home = $('s-home');
  if (home && home.classList.contains('active')) renderHome();
}

// ─── pixel art ─────────────────────────────────────────────────────────────

/* A GRID OF LETTERS AS AN SVG, one rect per run of a colour. The logo is built
   the same way (hoops/build/logo-art.mjs), which is what keeps every icon on
   these screens the same kind of thing as the mark in the top bar. `pal` maps
   a letter to a colour; a dot is empty. */
function pix(rows, pal, cell, cls){
  var h = rows.length, w = rows[0].length, out = [];
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w;) {
      var ch = rows[y][x], n = 1;
      while (x + n < w && rows[y][x + n] === ch) n++;
      if (ch !== '.' && pal[ch]) {
        out.push('<rect x="' + x + '" y="' + y + '" width="' + n + '" height="1" fill="' + pal[ch] + '"/>');
      }
      x += n;
    }
  }
  return '<svg class="px ' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + (w * cell)
    + '" height="' + (h * cell) + '" shape-rendering="crispEdges" aria-hidden="true">' + out.join('') + '</svg>';
}

var ART = {
  crown: [
    'g....g....g',
    'gg..ggg..gg',
    'ggggggggggg',
    'grgggbgggrg',
    'ggggggggggg',
    'ddddddddddd'
  ],
  rewind: [
    '....t....t.',
    '...tt...tt.',
    '..ttt..ttt.',
    '.tttt.tttt.',
    '..ttt..ttt.',
    '...tt...tt.',
    '....t....t.'
  ],
  /* A tank top. P is the club's fill, S its accent, k the outline. */
  jersey: [
    '..kk...kk..',
    '.kPSk.kSPk.',
    '.kPSkkkSPk.',
    'kkPSSSSSPkk',
    'kPPPPPPPPPk',
    'kPPPPPPPPPk',
    '.kPPPPPPPk.',
    '.kPPPPPPPk.',
    '.kPPPPPPPk.',
    '.kSSSSSSSk.',
    '.kkkkkkkkk.'
  ],
  heart: [
    '.rr.rr.',
    'rrrrrrr',
    'rrrrrrr',
    '.rrrrr.',
    '..rrr..',
    '...r...'
  ]
};

function jersey(code, cell){
  var s = E.clubSkin(code);
  return pix(ART.jersey, { P: s.bg, S: s.accent, k: '#05060b' }, cell || 3, 'jersey');
}

/* THE HOOP, which is what the ball is going to. Six Passes used a bullseye and
   a golf flag, which are two other sports. */
ART.hoop = [
  'wwwwwwwwwww',
  'w.........w',
  'w..rrrrr..w',
  'w..r...r..w',
  'wwwwwwwwwww',
  '..ooooooo..',
  '...n.n.n...',
  '....n.n....',
  '...n.n.n...',
  '....nnn....'
];
var HOOP_PAL = { w: '#f5f5f5', r: '#ef4444', o: '#f97316', n: '#cbd5e1' };

/* Two colours mixed, as hex. t is the share of b. */
function mixHex(a, b, t){
  var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), o = '#';
  [16, 8, 0].forEach(function(sh){
    var x = Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    o += (x < 16 ? '0' : '') + x.toString(16);
  });
  return o;
}

/* A PLAYER CARD IN PIXELS: head and shoulders, in the jersey of the club he
 * did the most for.
 *
 * IT IS A SILHOUETTE ON PURPOSE. This game has no licensed art, and a face
 * drawn from a hash would put a guess about somebody's hair, build and skin on
 * a real person, and be wrong about most of them. So the figure is the one
 * true thing it can be: a dark shape in a real club's colours. The two things
 * it does read off the data are the CLUB (where his win shares were earned)
 * and his FRAME, because a center really is broader across the shoulders than
 * a point guard. `light` is the side the rim light comes from, so the two
 * ends of a puzzle face each other. */
var portraitMemo = {};
function portraitFacts(id){
  if (portraitMemo[id]) return portraitMemo[id];
  var ws = {}, mins = {};
  data().players.forEach(function(p){
    if (p.i !== id || p.t === 'TOT') return;
    ws[p.t] = (ws[p.t] || 0) + p.w;
    var pos = p.pp || 'SF';
    mins[pos] = (mins[pos] || 0) + (p.mp || 0) * (p.g || 1);
  });
  var club = Object.keys(ws).sort(function(a, b){ return ws[b] - ws[a]; })[0] || 'NBA';
  var pos = Object.keys(mins).sort(function(a, b){ return mins[b] - mins[a]; })[0] || 'SF';
  return (portraitMemo[id] = { club: club, big: pos === 'C' || pos === 'PF', guard: pos === 'PG' || pos === 'SG' });
}
function portraitRows(big, guard, light){
  var W = 20, H = 22, cx = 9.5, HW = big ? 9.6 : guard ? 7.4 : 8.5, JW = HW - 2.6;
  var g = [];
  for (var y = 0; y < H; y++) {
    var row = [];
    for (var x = 0; x < W; x++) {
      var dx = x - cx, c = y < 11 ? 'B' : 'D';
      if ((dx * dx) / 64 + ((y - 7.5) * (y - 7.5)) / 64 <= 1) c = 'L';
      var head = (dx * dx) / (3.9 * 3.9) + ((y - 6.8) * (y - 6.8)) / (4.8 * 4.8) <= 1;
      var neck = y >= 10 && y <= 13 && Math.abs(dx) <= 1.6;
      var sh = y >= 13 && Math.abs(dx) <= Math.min(HW, 2 + (y - 12) * 3);
      if (head || neck || sh) c = 'h';
      if (y >= 14 && Math.abs(dx) <= JW && !(y <= 15 && Math.abs(dx) <= (y === 14 ? 2.6 : 1.6))) c = 'P';
      row.push(c);
    }
    g.push(row);
  }
  var at = function(x, y){ return (y < 0 || y >= H || x < 0 || x >= W) ? null : g[y][x]; };
  var out = g.map(function(r){ return r.slice(); });
  for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
    var c2 = g[y2][x2], lit = at(x2 + (light < 0 ? -1 : 1), y2);
    if (c2 === 'P') {
      var n = [at(x2 - 1, y2), at(x2 + 1, y2), at(x2, y2 - 1)];
      if (n.some(function(v){ return v === 'h'; })) out[y2][x2] = 'S';
    }
    if (c2 === 'h' && (lit === 'B' || lit === 'D' || lit === 'L')) out[y2][x2] = 'r';
  }
  return out.map(function(r){ return r.join(''); });
}
function portrait(id, cell, light){
  var f = portraitFacts(id), sk = E.clubSkin(f.club);
  return pix(portraitRows(f.big, f.guard, light || -1), {
    B: mixHex(sk.bg, '#0b0f17', 0.5), D: mixHex(sk.bg, '#0b0f17', 0.7), L: mixHex(sk.bg, '#0b0f17', 0.3),
    h: '#0a0d14', r: sk.accent, P: sk.bg, S: sk.accent
  }, cell || 3, 'portrait');
}

/* The ball from the logo, as an image, so a life on screen is the same ball as
   the one in the top bar. mark.png is 22px and drawn pixelated at whole
   multiples, which is the logo's own rule. */
function ball(size, dead){
  return '<img class="pxball' + (dead ? ' dead' : '') + '" src="mark.png?v=1" width="' + size
    + '" height="' + size + '" alt="">';
}

// ─── shared bits ───────────────────────────────────────────────────────────

function data(){ return P.data; }

function tsParts(tsId){
  var i = tsId.lastIndexOf('_');
  var code = tsId.slice(0, i), season = Number(tsId.slice(i + 1));
  return { code: code, season: season, name: E.teamDisplay(code, season), short: shortClub(code, season) };
}
/* "'96 CHI", which is how a fan writes a team-season in a list. */
function shortClub(code, season){
  return "'" + String(season).slice(-2) + ' ' + code;
}
function lineOf(p){
  return (p.pts || 0).toFixed(1) + ' pts · ' + (p.reb || 0).toFixed(1) + ' reb · '
    + (p.ast || 0).toFixed(1) + ' ast';
}
function surname(n){ return E.lastNameOf(n); }
function pct(x){ return Math.round(x * 100) + '%'; }
function pct1(x){ var v = Math.round(x * 1000) / 10; return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + '%'; }
function plural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }

/* One share path for the three modes: the sheet where there is one, the
   clipboard where there is not. The page owns it, because the draft's share
   already solved the three browsers it has to work in. */
function share(text){ P.shareText(text); }

// ─── the stylesheet ────────────────────────────────────────────────────────

var CSS = [
  /* shared */
  '.px{display:block;image-rendering:pixelated;}',
  '.pxball{display:inline-block;image-rendering:pixelated;vertical-align:middle;}',
  '.pxball.dead{filter:grayscale(1) brightness(.45);opacity:.55;}',
  '.mh{font-family:var(--pixel);font-weight:400;text-transform:uppercase;letter-spacing:0;line-height:1.2;}',
  '.mx-eyebrow{font-size:10px;letter-spacing:.2em;text-transform:uppercase;font-weight:800;color:var(--mut);}',
  '.mx-card{position:relative;overflow:hidden;border-radius:14px;border:1px solid var(--cardb);',
  '  background:linear-gradient(180deg,var(--card),#10151f);padding:16px;margin:0 0 14px;}',
  '.mx-scan::after{content:"";position:absolute;inset:0;pointer-events:none;',
  '  background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,transparent 2px 4px);}',
  '.mx-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;',
  '  font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;',
  '  background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--mut);}',
  '.mx-num{font-family:var(--display);font-variant-numeric:tabular-nums;font-weight:400;}',
  '.mx-row{display:flex;gap:8px;flex-wrap:wrap;}',
  '.mx-row > *{flex:1 1 0;}',
  '.mx-say{font-size:14.5px;line-height:1.55;color:var(--mut);margin:6px 0 0;}',
  '.mx-say b{color:var(--ink);}',
  '.mx-stamp{position:absolute;right:14px;top:12px;transform:rotate(-8deg);border:3px solid currentColor;',
  '  border-radius:8px;padding:2px 10px;font-family:var(--pixel);font-size:16px;',
  '  animation:mxStamp .35s cubic-bezier(.2,1.6,.4,1) both;}',
  '@keyframes mxStamp{from{transform:rotate(-8deg) scale(2.2);opacity:0}to{transform:rotate(-8deg) scale(1);opacity:1}}',
  '@keyframes mxRise{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}',
  '@keyframes mxPop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(0);opacity:0}}',
  '@keyframes mxPulse{0%,100%{box-shadow:0 0 0 0 rgba(240,120,45,.5)}50%{box-shadow:0 0 0 8px rgba(240,120,45,0)}}',
  '.mx-rise{animation:mxRise .35s ease both;}',
  '@media (prefers-reduced-motion:reduce){.mx-rise,.mx-stamp{animation:none}}',

  /* the chips the More ways to play tiles use (the tiles themselves are
     styled by the page, beside the grid they live in) */
  '.td-ck{width:14px;height:14px;border-radius:50%;background:var(--green);position:relative;flex:0 0 auto;}',
  '.td-ck::after{content:"";position:absolute;left:4px;top:2px;width:4px;height:7px;border:solid #06140c;border-width:0 2px 2px 0;transform:rotate(45deg);}',
  '.td-end{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin:8px 0 0;font-size:12px;}',
  '.td-end span{font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);}',
  '.td-end button{background:none;border:1px solid rgba(255,255,255,.18);border-radius:999px;color:var(--ink);font:inherit;font-weight:700;padding:5px 11px;cursor:pointer;}',
  '.td-end button:hover{border-color:rgba(255,255,255,.4);}',
  '.td-end span{min-width:58px;text-align:right;}',
  '.td-end button.lk{color:var(--dim);}',
  '.td-pro{display:block;margin:8px auto 0;background:none;border:0;color:#f2c14e;font:inherit;font-weight:800;font-size:13px;',
  'cursor:pointer;padding:2px 6px;}',
  '.td-pro .pro-tag{font-style:normal;margin:0 4px 0 0;}',
  '.pro-tag{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#1b1405;',
  'background:#f2c14e;border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:1px;}',
  '#pro-sheet[hidden]{display:none;}',
  '.pro-list{list-style:none;margin:12px 0;padding:0;}',
  '.pro-list li{padding:9px 0;border-top:1px solid #243047;font-size:14px;line-height:1.4;}',
  '.pro-list li b{display:block;font-size:15px;}',
  '.pro-list li:first-child{border-top:0;}',
  '.pro-price{display:flex;align-items:baseline;gap:8px;margin:6px 0 12px;}',
  '.pro-price b{font-family:var(--display);font-weight:400;font-size:34px;color:#f2c14e;}',
  '.pro-price span{font-size:13px;color:var(--dim);}',
  '.pro-buy{width:100%;background:linear-gradient(180deg,#f7d57a,#e0a93a);color:#1b1405;border:0;border-radius:12px;padding:14px;',
  'font:inherit;font-weight:800;font-size:16px;cursor:pointer;}',
  '.pro-buy[disabled]{opacity:.6;cursor:default;}',
  '.pro-err{color:#fca5a5;font-size:13px;margin:8px 0 0;text-align:center;}',
  '.pro-err[hidden]{display:none;}',
  '.fx-lab{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin:12px 2px 6px;}',
  '.fx-sel{appearance:none;-webkit-appearance:none;color:var(--ink);font:inherit;font-weight:700;}',
  '.ps-slot{margin:12px 0;}',
  '.ps-slot .ps-mates{margin-top:8px;}',
  '.ps-chosen{display:flex;align-items:center;gap:10px;background:#161d2b;border:1px solid #2a3450;border-radius:10px;padding:10px 12px;margin-top:6px;}',
  '.ps-chosen b{flex:1;}',
  '.ps-chosen small{color:var(--dim);}',


  /* ── Conquest ── */
  '.cq-head{display:flex;align-items:center;gap:12px;margin:4px 0 12px;}',
  '.cq-head .mh{font-size:16px;color:#ffae3d;text-shadow:0 2px 0 #a8341f;}',
  '.cq-lives{display:flex;gap:4px;margin-left:auto;}',
  '.cq-lives .pxball.pop{animation:mxPop .6s ease forwards;}',
  '.cq-w{text-align:right;line-height:1;}',
  '.cq-w b{display:block;font-family:var(--pixel);font-size:20px;color:var(--ink);}',
  '.cq-w span{font-size:9.5px;letter-spacing:.16em;color:var(--dim);font-weight:800;}',
  '.cq-line{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 10px;margin:0 0 6px;scrollbar-width:none;}',
  '.cq-line::-webkit-scrollbar{display:none;}',
  '.cq-q{flex:0 0 auto;width:62px;text-align:center;opacity:.55;}',
  '.cq-q.now{opacity:1;}',
  '.cq-q .jersey{margin:0 auto;}',
  '.cq-q .qn{font-size:10px;font-weight:800;color:var(--mut);margin-top:4px;letter-spacing:.04em;}',
  '.cq-q.boss .qn{color:var(--gold);}',
  '.cq-q.beat{opacity:.9;}',
  '.cq-q.beat .qn{color:var(--green);}',
  '.cq-rung{font-size:10px;letter-spacing:.14em;font-weight:800;color:var(--dim);text-transform:uppercase;}',
  /* the court: two benches facing each other on a floor */
  '.cq-court{position:relative;border-radius:14px;padding:14px 12px;border:1px solid rgba(255,255,255,.1);',
  '  background:radial-gradient(circle at 50% 50%,transparent 58px,rgba(255,255,255,.18) 58px 60px,transparent 60px),',
  '  linear-gradient(90deg,transparent calc(50% - 1px),rgba(255,255,255,.18) calc(50% - 1px) calc(50% + 1px),transparent calc(50% + 1px)),',
  '  repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 3px,transparent 3px 22px),',
  '  linear-gradient(180deg,#b9824b,#9a6536);box-shadow:inset 0 0 0 6px rgba(0,0,0,.18);}',
  '.cq-sides{display:grid;grid-template-columns:1fr 1fr;gap:10px;position:relative;}',
  '.cq-side{background:rgba(9,12,18,.86);border-radius:10px;padding:10px;border:1px solid rgba(255,255,255,.1);',
  '  backdrop-filter:blur(2px);min-width:0;}',
  '.cq-side.them{border-color:var(--c-acc,rgba(255,255,255,.1));box-shadow:inset 0 3px 0 var(--c-acc,transparent);}',
  '.cq-side h4{margin:0 0 2px;font-family:var(--display);font-weight:400;font-size:15px;line-height:1.1;',
  '  text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.cq-side .rt{font-size:11px;color:var(--mut);font-weight:700;margin-bottom:8px;}',
  '.cq-side .rt b{color:var(--ink);font-family:var(--num);font-variant-numeric:tabular-nums;}',
  '.cqd-slots{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:0 0 6px;}',
  '.cqd-slot{background:#141a26;border:1px solid var(--cardb);border-radius:9px;padding:6px 4px;text-align:center;min-width:0;}',
  '.cqd-slot .s{display:block;font-family:var(--display);font-size:12px;color:var(--orange);}',
  '.cqd-slot b{display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.cqd-slot b.open{color:var(--dim);font-weight:600;}',
  '.cqd-slot.now{border-color:var(--orange);box-shadow:0 0 0 1px var(--orange) inset;}',
  '.cqd-slot.done b{color:var(--ink);}',
  '.cqd-cards{display:grid;gap:8px;}',
  '.cqd-card{display:block;width:100%;text-align:left;background:#141a26;border:1px solid var(--cardb);',
  '  border-left:4px solid var(--c-acc);border-radius:12px;padding:12px 14px;color:var(--ink);font-family:var(--body);cursor:pointer;}',
  '.cqd-card:hover{filter:none;border-color:var(--orange);border-left-color:var(--c-acc);}',
  '.cqd-top{display:flex;align-items:center;gap:8px;}',
  '.cqd-club{font-weight:800;font-size:13px;color:var(--mut);}',
  '.cqd-pos{margin-left:auto;font-family:var(--display);font-size:13px;color:var(--orange);}',
  '.cqd-name{font-family:var(--display);font-weight:400;font-size:22px;line-height:1.1;text-transform:uppercase;margin:6px 0 8px;}',
  '.cqd-line{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;}',
  '.cqd-line span{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);font-weight:800;text-align:center;}',
  '.cqd-line b{display:block;font-family:var(--num);font-variant-numeric:tabular-nums;font-size:16px;color:var(--ink);letter-spacing:0;}',
  '.cq-man{display:grid;grid-template-columns:22px 1fr;gap:6px;align-items:baseline;padding:4px 0;',
  '  border-top:1px solid rgba(255,255,255,.06);font-size:12.5px;min-width:0;}',
  '.cq-man .s{font-family:var(--display);font-size:11px;color:var(--orange);}',
  '.cq-man .n{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.cq-man .n small{display:block;font-weight:600;color:var(--dim);font-size:10.5px;}',
  '.cq-man.new .n{color:var(--gold);}',
  '.cq-vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;',
  '  font-family:var(--pixel);font-size:12px;color:#fff;background:#05060b;border:2px solid #ffae3d;',
  '  border-radius:999px;width:40px;height:40px;display:grid;place-items:center;}',
  '.cq-boss{display:inline-flex;align-items:center;gap:6px;color:var(--gold);font-family:var(--pixel);font-size:10px;margin-bottom:6px;}',
  /* the odds bar */
  '.cq-odds{margin:12px 0 4px;}',
  '.cq-bar{position:relative;height:14px;border-radius:999px;overflow:hidden;background:#2a1a1a;',
  '  border:1px solid rgba(255,255,255,.1);}',
  '.cq-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;',
  '  background:linear-gradient(90deg,#f0782d,#ffae3d);transition:width .6s ease;}',
  '.cq-bar-l{display:flex;justify-content:space-between;font-size:12px;font-weight:800;margin-top:6px;}',
  '.cq-bar-l .y{color:#ffae3d;} .cq-bar-l .t{color:var(--mut);}',
  /* the scoreboard */
  '.sb{background:#05060b;border:2px solid #2a3350;border-radius:12px;padding:14px;position:relative;',
  '  box-shadow:inset 0 0 30px rgba(240,120,45,.08);}',
  '.sb-q{font-family:var(--pixel);font-size:10px;color:#ff6b3d;letter-spacing:.1em;text-align:center;margin-bottom:10px;}',
  '.sb-row{display:grid;grid-template-columns:1fr repeat(var(--per,4),26px) 58px;gap:6px;align-items:center;',
  '  padding:6px 0;border-top:1px solid rgba(255,255,255,.06);}',
  '.sb-row:first-of-type{border-top:0;}',
  '.sb-row .tn{font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.sb-row .qv{font-family:var(--num);font-variant-numeric:tabular-nums;font-size:12px;color:var(--dim);text-align:center;}',
  '.sb-row .qv.on{color:var(--ink);}',
  '.sb-row .tot{font-family:var(--pixel);font-size:18px;text-align:right;color:#ffcf6b;',
  '  text-shadow:0 0 10px rgba(255,160,60,.45);}',
  '.sb-row.lead .tn{color:#ffae3d;}',
  '.sb-lead{font-size:12.5px;color:var(--mut);margin-top:10px;line-height:1.5;}',
  '.sb-lead b{color:var(--ink);}',
  /* the steal */
  '.cq-take{display:grid;gap:8px;margin-top:8px;}',
  '.cq-pick{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;text-align:left;',
  '  background:#141a26;border:1px solid var(--cardb);border-radius:10px;padding:10px 12px;color:var(--ink);',
  '  font-family:var(--body);font-weight:600;cursor:pointer;}',
  '.cq-pick:hover:not(:disabled){filter:none;border-color:rgba(255,255,255,.25);}',
  '.cq-pick.on{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset;background:#1d1a12;}',
  '.cq-pick .ps{font-family:var(--display);font-size:13px;color:var(--orange);text-align:center;}',
  '.cq-pick .pn{font-weight:800;font-size:14px;line-height:1.25;}',
  '.cq-pick .pn small{display:block;color:var(--dim);font-weight:600;font-size:11.5px;}',
  '.cq-pick .pw{font-family:var(--num);font-variant-numeric:tabular-nums;font-size:12px;color:var(--mut);text-align:right;}',
  '.cq-pick .pw b{display:block;font-size:14px;color:var(--ink);}',
  '.cq-drops{display:grid;gap:6px;margin:8px 0 2px 44px;}',
  '.cq-drop{display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;',
  '  background:rgba(255,255,255,.03);border:1px dashed rgba(255,255,255,.18);border-radius:9px;padding:9px 12px;',
  '  color:var(--ink);font-family:var(--body);font-weight:700;font-size:13px;cursor:pointer;}',
  '.cq-drop .d{font-family:var(--num);font-variant-numeric:tabular-nums;font-weight:800;}',
  '.cq-drop .d.up{color:var(--green);} .cq-drop .d.dn{color:var(--red);}',
  '.cq-none{font-size:12.5px;color:var(--dim);margin:6px 0 2px 44px;}',
  /* the game plan */
  '.cq-plans{display:grid;gap:6px;margin-top:10px;}',
  '.cq-plan{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;text-align:left;width:100%;',
  '  background:#141a26;border:1px solid var(--cardb);border-radius:10px;padding:9px 12px;color:var(--ink);',
  '  font-family:var(--body);font-weight:600;cursor:pointer;}',
  '.cq-plan:hover{filter:none;border-color:rgba(255,255,255,.25);}',
  '.cq-plan.on{border-color:var(--orange);box-shadow:0 0 0 1px var(--orange) inset;background:#221811;}',
  '.cq-plan .pn{font-weight:800;font-size:14px;line-height:1.2;}',
  '.cq-plan .pn small{display:block;color:var(--dim);font-weight:600;font-size:11.5px;}',
  '.cq-plan .pv{font-family:var(--num);font-variant-numeric:tabular-nums;font-size:14px;font-weight:800;white-space:nowrap;}',
  '.cq-plan .pv .y{color:#ffae3d;} .cq-plan .pv .t{color:var(--mut);} .cq-plan .pv i{font-style:normal;color:var(--dim);font-size:11px;margin:0 5px;}',
  '.cq-verdict{margin-top:14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--cardb);',
  '  font-size:13.5px;line-height:1.5;color:var(--mut);}',
  '.cq-verdict b{color:var(--ink);} .cq-verdict .up{color:var(--green);} .cq-verdict .dn{color:var(--red);}',
  /* the end */
  '.cq-trail{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}',
  '.cq-trail .t{display:flex;flex-direction:column;align-items:center;width:44px;font-size:9.5px;font-weight:800;color:var(--mut);}',
  '.cq-trail .t.l .jersey{filter:grayscale(1) brightness(.5);}',
  '.cq-big{font-family:var(--pixel);font-size:36px;color:#ffcf6b;text-shadow:0 3px 0 #a8341f;line-height:1;}',

  /* ── Fix History ── */
  /* Two classes deep, or .cq-head .mh wins and the title comes out orange. */
  '.cq-head .fx-mh{color:#5eead4;text-shadow:0 2px 0 #0f766e;}',
  '.fx-banner{display:flex;align-items:center;gap:14px;border-radius:14px;padding:14px 16px;margin:0 0 12px;',
  '  background:linear-gradient(135deg,var(--c-bg),#0b0f17 130%);border:1px solid rgba(255,255,255,.12);',
  '  box-shadow:inset 0 -4px 0 var(--c-acc);position:relative;overflow:hidden;}',
  '.fx-banner::after{content:"";position:absolute;inset:0;pointer-events:none;',
  '  background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 2px,transparent 2px 4px);}',
  '.fx-bt{min-width:0;}',
  '.fx-yr{font-family:var(--pixel);font-size:12px;color:var(--c-acc);}',
  '.fx-nm{font-family:var(--display);font-size:26px;line-height:1.05;text-transform:uppercase;color:#fff;margin-top:4px;}',
  '.fx-note{font-size:12.5px;color:rgba(255,255,255,.75);font-weight:700;margin-top:4px;}',
  '.fx-odds{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 2px 4px;}',
  '.fx-odds b{font-size:28px;color:#5eead4;}',
  '.fx-odds .dim{font-size:12px;}',
  '.fx-step{font-family:var(--display);font-weight:400;text-transform:uppercase;font-size:16px;letter-spacing:.03em;margin:16px 2px 8px;}',
  '.fx-five{display:grid;gap:6px;}',
  '.fx-man{position:relative;display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;text-align:left;',
  '  background:#141a26;border:1px solid var(--cardb);border-radius:10px;padding:10px 12px;color:var(--ink);',
  '  font-family:var(--body);font-weight:600;cursor:pointer;}',
  '.fx-man:disabled{cursor:default;opacity:1;}',
  '.fx-man:hover:not(:disabled){filter:none;border-color:rgba(94,234,212,.45);}',
  '.fx-man .fs{font-family:var(--display);font-size:14px;color:#5eead4;}',
  '.fx-man .fn{font-weight:800;font-size:14px;line-height:1.25;min-width:0;}',
  '.fx-man .fn small{display:block;color:var(--dim);font-weight:600;font-size:11.5px;}',
  '.fx-man .fp{font-family:var(--num);font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--mut);text-align:right;}',
  '.fx-man .fp b{display:block;font-size:14px;color:var(--ink);}',
  '.fx-man.out{border-color:var(--red);background:#241416;}',
  '.fx-man.out .fn{text-decoration:line-through;text-decoration-color:rgba(239,68,68,.6);}',
  '.fx-man.in{border-color:#5eead4;background:#10221f;box-shadow:0 0 0 1px #5eead4 inset;}',
  '.fx-tag{position:absolute;right:10px;top:-8px;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;',
  '  background:var(--red);color:#fff;border-radius:999px;padding:2px 8px;}',
  '.fx-tag.in{background:#14b8a6;}',
  '.fx-man.bn{padding:7px 12px;background:#10151f;}',
  '.fx-man.dr{grid-template-columns:40px 1fr auto;}',
  '.fx-man.dr .fs{touch-action:none;cursor:grab;align-self:stretch;display:flex;align-items:center;gap:6px;margin:-10px 0 -10px -12px;padding-left:9px;}',
  '.fx-man.dr .fs::before{content:"";width:6px;height:15px;flex:none;background:radial-gradient(circle,rgba(148,163,184,.75) 1.2px,transparent 1.6px) 0 0/3px 5px;}',
  '.fx-man.dr.bn .fs{margin:-7px 0 -7px -12px;}',
  '.fx-man .fs.off{color:#fbbf24;}',
  '.fx-man.lift{opacity:.35;}',
  '.fx-man.drop{border-color:#5eead4;box-shadow:0 0 0 2px #5eead4 inset;}',
  '.fx-man.pick{border-color:#fbbf24;box-shadow:0 0 0 2px #fbbf24 inset;}',
  '.fx-man.ghost{position:fixed;left:0;top:0;z-index:60;pointer-events:none;box-shadow:0 12px 30px rgba(0,0,0,.55);border-color:#5eead4;}',
  '.fx-lu{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--dim);margin:0 2px 8px;min-height:28px;}',
  '.fx-man.bn .fs{color:var(--dim);font-size:12px;}',
  '.fx-benchh{font-size:10px;letter-spacing:.2em;text-transform:uppercase;font-weight:800;color:var(--dim);margin:12px 2px 6px;}',
  '.fx-dock{position:sticky;bottom:calc(var(--dock, 0px) + 8px + env(safe-area-inset-bottom,0px));z-index:5;display:flex;gap:10px;align-items:center;',
  '  margin-top:14px;padding:10px 12px;border-radius:12px;background:#0f1a1a;border:1px solid rgba(94,234,212,.45);box-shadow:0 8px 24px rgba(0,0,0,.45);}',
  '.fx-dock.top{position:static;box-shadow:none;margin:0 0 4px;}',
  '.fx-dk{flex:1 1 auto;min-width:0;}',
  '.fx-dk b{display:block;font-size:15px;line-height:1.25;margin-top:2px;}',
  '.fx-dk small{display:block;font-size:12px;color:var(--mut);margin-top:2px;}',
  '.fx-dock > button{flex:0 0 auto;width:auto;padding:10px 14px;}',
  '.fx-dock > button:disabled{opacity:.5;}',
  '.fx-chips{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none;}',
  '.fx-chips::-webkit-scrollbar{display:none;}',
  '.fx-chip{flex:0 0 auto;width:auto;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:800;',
  '  background:#141a26;border:1px solid var(--cardb);color:var(--mut);}',
  '.fx-chip.on{background:#0f766e;border-color:#5eead4;color:#fff;}',
  '.fx-fil{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:2px 0 4px;}',
  '.fx-fil .fx-q{padding:10px 12px;font-size:14px;}',
  '.fx-offer{display:block;width:100%;text-align:left;background:#141a26;border:1px solid var(--cardb);border-radius:12px;',
  '  padding:10px 12px;color:var(--ink);font-family:var(--body);cursor:pointer;}',
  '.fx-offer:hover{filter:none;border-color:rgba(94,234,212,.5);}',
  '.fo-h{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;color:var(--mut);margin-bottom:6px;}',
  '.fo-h em{margin-left:auto;font-style:normal;font-family:var(--num);font-variant-numeric:tabular-nums;color:var(--dim);font-size:12px;}',
  '.fo-p{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0;border-top:1px solid rgba(255,255,255,.05);}',
  '.fo-p .hn{font-weight:800;font-size:14px;min-width:0;}',
  '.fo-p .hn em{font-style:normal;color:#5eead4;font-size:11px;margin-left:4px;}',
  '.fo-p .hn small{display:block;color:var(--dim);font-weight:600;font-size:11.5px;}',
  '.fo-p .hp{font-family:var(--num);font-variant-numeric:tabular-nums;font-weight:800;font-size:14px;}',
  '.fx-more{margin-top:4px;}',
  '.fx-swap b + span{display:block;margin-bottom:6px;}',
  '.fxw{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:0 0 10px;}',
  '.fxw-s{background:#141a26;border:1px solid var(--cardb);border-radius:9px;padding:6px 6px;text-align:center;min-width:0;}',
  '.fxw-s b{display:block;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.fxw-s small{display:block;font-size:10px;color:var(--dim);font-weight:700;margin-top:1px;}',
  '.fxw-s.now{border-color:#5eead4;box-shadow:0 0 0 1px #5eead4 inset;}',
  '.fxw-s.now small{color:#5eead4;}',
  '.fxw-s.past{opacity:.65;}',
  '.fxw-s.dealt small{color:var(--gold);}',
  '.fx-now{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#141a26;border:1px solid var(--cardb);',
  '  border-radius:12px;padding:10px 12px;margin:0 0 4px;}',
  '.fx-now b{display:block;font-size:15px;margin-top:3px;}',
  '.fx-now-o{text-align:right;}',
  '.fx-now-o b{font-size:26px;color:#5eead4;margin:0;}',
  '.fx-now-o small{display:block;font-size:11px;color:var(--dim);font-weight:700;}',
  '.fx-picks{display:flex;flex-wrap:wrap;gap:6px;}',
  '.fx-pick{width:auto;border-radius:10px;padding:7px 12px;font-size:13px;font-weight:800;background:#141a26;',
  '  border:1px dashed #3a4a60;color:var(--ink);}',
  '.fx-pick small{display:block;font-size:10.5px;color:var(--dim);font-weight:700;}',
  '.fx-pick.on{border-style:solid;border-color:var(--red);background:#241416;}',
  '.fx-dock:not(.top){flex-wrap:wrap;}',
  '.fx-dock:not(.top) .fx-dk{flex:1 1 100%;}',
  '.fx-dkb{display:flex;gap:6px;flex:1 1 100%;}',
  '.fx-dkb button{flex:1 1 0;width:auto;padding:10px 10px;font-size:13px;}',
  '.fx-dots{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin:4px 0 2px;}',
  '.fx-dots i{width:9px;height:9px;border-radius:2px;background:var(--red);}',
  '.fx-dots i.w{background:var(--green);}',
  '.fx-log{background:#141a26;border:1px solid var(--cardb);border-radius:10px;padding:8px 12px;margin:0 0 6px;}',
  '.fx-log p{margin:3px 0 0;font-size:14px;color:var(--mut);}',
  '.fx-log b{color:var(--ink);}',
  '.fx-offer{cursor:default;}',
  '.fo-act{display:flex;gap:8px;margin-top:8px;}',
  '.fo-act button{flex:1 1 0;width:auto;padding:9px 10px;font-size:13px;}',
  '.tk-top{display:flex;align-items:center;gap:12px;background:#141a26;border:1px solid var(--cardb);border-radius:12px;padding:10px 12px;}',
  '.tk-top b{display:block;font-family:var(--display);font-weight:400;font-size:20px;text-transform:uppercase;line-height:1.1;margin-top:2px;}',
  '.tk-pat{margin-left:auto;text-align:right;font-size:11px;font-weight:800;color:var(--mut);}',
  '.tk-dots{display:flex;gap:4px;justify-content:flex-end;margin-top:4px;}',
  '.tk-dots i{width:10px;height:10px;border-radius:50%;background:#243049;}',
  '.tk-dots i.on{background:#5eead4;}',
  '.tk-list{display:grid;gap:5px;}',
  '.tk-p{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;background:#141a26;',
  '  border:1px solid var(--cardb);border-radius:10px;padding:7px 12px;color:var(--ink);font-family:var(--body);}',
  '.tk-p .hn{font-weight:800;font-size:13.5px;min-width:0;}',
  '.tk-p .hn em{font-style:normal;color:#5eead4;font-size:11px;margin-left:4px;}',
  '.tk-p .hn small{display:block;color:var(--dim);font-weight:600;font-size:11px;}',
  '.tk-p .hp{font-family:var(--num);font-variant-numeric:tabular-nums;font-weight:800;font-size:13.5px;text-align:right;}',
  '.tk-p .hp small{display:block;font-size:10.5px;color:var(--dim);}',
  '.tk-p.on{border-color:#5eead4;background:#10221f;box-shadow:0 0 0 1px #5eead4 inset;}',
  '.tk-p.lock{opacity:.45;}',
  '.tk-short{color:var(--red);} .tk-ok{color:var(--green);}',
  '.tk-reply{border-radius:12px;padding:12px 14px;margin:10px 0 4px;border:1px solid var(--cardb);background:#141a26;}',
  '.tk-reply b{display:block;font-family:var(--display);font-weight:400;font-size:20px;text-transform:uppercase;}',
  '.tk-reply p{margin:4px 0 10px;color:var(--mut);font-size:14px;}',
  '.tk-reply button{width:100%;}',
  '.tk-reply.yes{border-color:rgba(74,222,128,.5);background:#0d1512;} .tk-reply.yes b{color:var(--green);margin-bottom:10px;}',
  '.tk-reply.counter{border-color:rgba(242,193,78,.5);background:#1e1a10;} .tk-reply.counter b{color:var(--gold);}',
  '.tk-reply.no{border-color:rgba(239,68,68,.45);background:#241416;} .tk-reply.no b{color:var(--red);}',
  '.tk-reply.no p{margin-bottom:0;}',
  '.fx-q{width:100%;background:#0b0f17;border:1px solid #2f3b52;border-radius:10px;padding:13px 14px;',
  '  color:var(--ink);font-family:var(--body);font-size:16px;font-weight:600;outline:none;}',
  '.fx-q:focus{border-color:#5eead4;box-shadow:0 0 0 3px rgba(94,234,212,.15);}',
  '.fx-res{display:grid;gap:6px;margin-top:8px;}',
  '.fx-hit{display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;',
  '  background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:9px;padding:9px 12px;',
  '  color:var(--ink);font-family:var(--body);cursor:pointer;}',
  '.fx-hit:hover{filter:none;border-color:rgba(94,234,212,.5);}',
  '.fx-hit.no{opacity:.5;cursor:default;}',
  '.fx-hit .hn{font-weight:800;font-size:14px;min-width:0;}',
  '.fx-hit .hn em{font-style:normal;color:#5eead4;font-size:12px;margin-left:4px;}',
  '.fx-hit .hn small{display:block;color:var(--dim);font-weight:600;font-size:11.5px;}',
  '.fx-hit .hp{font-family:var(--num);font-variant-numeric:tabular-nums;font-weight:800;font-size:14px;}',
  '.fx-hint{font-size:13px;color:var(--dim);margin:8px 2px;line-height:1.5;}',
  '.fx-go{background:linear-gradient(180deg,#14b8a6,#0f766e);border-color:#14b8a6;}',
  '.fx-sheet{position:fixed;inset:0;z-index:60;background:rgba(3,5,9,.72);display:flex;align-items:flex-end;',
  '  justify-content:center;padding:16px;}',
  '.fx-card{width:100%;max-width:520px;background:#121826;border:1px solid #2a3a4a;border-radius:16px;padding:18px;',
  '  box-shadow:0 20px 60px rgba(0,0,0,.6);}',
  '.fx-swap{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-top:10px;}',
  '.fx-swap small{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:var(--dim);}',
  '.fx-swap b{display:block;font-size:16px;line-height:1.2;margin-top:2px;}',
  '.fx-swap span{font-size:12px;color:var(--mut);}',
  '.fx-swap > div:last-child{text-align:right;}',
  '.fx-swap > div:last-child b{color:#5eead4;}',
  '.fx-arrow svg{transform:scaleX(-1);}',
  '.fx-sim{padding:20px 16px;margin-top:4px;}',
  '.fx-big{font-family:var(--pixel);font-size:34px;line-height:1;color:#5eead4;margin:14px 0;',
  '  text-shadow:0 3px 0 #0f766e;display:flex;justify-content:center;align-items:baseline;gap:14px;}',
  '.fx-big .was{font-size:16px;color:var(--dim);text-shadow:none;text-decoration:line-through;}',
  '.fx-meter{position:relative;height:16px;border-radius:999px;background:#0b0f17;border:1px solid #2a3a4a;overflow:hidden;}',
  '.fx-meter .fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#0f766e,#5eead4);width:0;',
  '  transition:width .15s linear;}',
  '.fx-meter .base{position:absolute;top:-2px;bottom:-2px;width:2px;background:#fff;opacity:.65;z-index:1;}',
  '.fx-count{font-size:12px;color:var(--mut);margin-top:8px;font-variant-numeric:tabular-nums;text-align:center;}',
  '.fx-delta{font-family:var(--display);font-size:20px;margin-top:10px;}',
  '.fx-delta.up{color:var(--green);} .fx-delta.dn{color:var(--red);}',
  '.fx-replay{display:flex;align-items:baseline;justify-content:center;gap:10px;flex-wrap:wrap;',
  '  margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:14px;color:var(--mut);}',
  '.fx-replay b{font-size:22px;color:var(--ink);}',
  '.fx-place{font-size:13.5px;color:var(--mut);margin-top:10px;}',
  '.fx-place b{color:#5eead4;}',

  /* ── Six Passes ── */
  '.cq-head .ps-mh{color:var(--gold);text-shadow:0 2px 0 #7a5410;}',
  '.ps-clock{margin-left:auto;text-align:center;background:#05060b;border:2px solid #2a3350;border-radius:8px;padding:4px 10px;}',
  '.ps-clock .mx-eyebrow{font-size:8px;letter-spacing:.14em;}',
  '.ps-clock b{display:block;font-family:var(--pixel);font-size:20px;color:#ff5a36;text-shadow:0 0 8px rgba(255,90,54,.6);}',
  '.ps-clock.low b{animation:psBlink 1s steps(2) infinite;}',
  '@keyframes psBlink{50%{opacity:.35}}',
  '.ps-top{display:grid;grid-template-columns:1fr auto 1fr;grid-template-areas:"a h b" "t t t";gap:10px;align-items:center;margin:0 0 10px;}',
  '.ps-top>.ps-end{grid-area:a;align-self:stretch;}',
  '.ps-top>.ps-end.tgt{grid-area:b;}',
  '.ps-top>.ps-to{grid-area:h;}',
  '.ps-top>.ps-tlw{grid-area:t;margin:0;}',
  '.ps-end{background:#141a26;border:1px solid var(--cardb);border-radius:12px;padding:10px 12px;min-width:0;}',
  '.ps-end b{display:block;font-family:var(--display);font-weight:400;font-size:19px;line-height:1.1;text-transform:uppercase;margin-top:3px;overflow-wrap:anywhere;}',
  '.ps-end small{display:block;font-size:11.5px;color:var(--dim);font-weight:700;margin-top:2px;}',
  '.ps-end .mx-eyebrow{display:block;}',
  '.ps-end.tgt{border-color:rgba(242,193,78,.55);background:#1e1a10;text-align:right;}',
  '.ps-end.tgt b{color:var(--gold);}',
  '.ps-pic{display:flex;margin:0 0 8px;}',
  '.ps-end.tgt .ps-pic{justify-content:flex-end;}',
  '.ps-pic .portrait{border-radius:8px;border:1px solid rgba(255,255,255,.14);box-shadow:0 3px 0 rgba(0,0,0,.35);}',
  '.ps-tlw{position:relative;background:linear-gradient(180deg,#0d1220,#090c14);border:1px solid #232c40;',
  '  border-radius:12px;padding:6px 6px 0;margin:0 0 10px;}',
  '.ps-tl{display:block;width:100%;height:auto;}',
  '.ps-yr{font-size:9px;fill:#6b7a90;font-family:var(--body);font-weight:700;}',
  '.ps-tlw.fresh .ps-arc:last-of-type{stroke-dashoffset:0;animation:psArc .7s ease both;}',
  '@keyframes psArc{from{opacity:0;stroke-dasharray:0 400}to{opacity:1;stroke-dasharray:4 4}}',
  '.ps-ball{position:absolute;top:calc(84 / 104 * 100% - 15px);transition:left .7s cubic-bezier(.3,1.4,.5,1);}',
  '.ps-chain{display:grid;gap:4px;margin:0 0 10px;}',
  '.ps-link{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:baseline;font-size:13.5px;',
  '  padding:7px 10px;border-radius:8px;background:rgba(242,193,78,.06);border:1px solid rgba(242,193,78,.18);}',
  '.ps-link .pn{font-family:var(--pixel);font-size:10px;color:var(--gold);}',
  '.ps-link i{color:var(--dim);font-style:normal;}',
  '.ps-link em{font-style:normal;font-size:11.5px;color:var(--mut);font-weight:700;}',
  '.ps-q{margin-bottom:8px;}',
  '.ps-pick{display:grid;gap:10px;}',
  '.ps-grp{background:#10151f;border:1px solid var(--line);border-radius:10px;padding:10px;}',
  '.ps-gh{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;color:var(--c-acc);margin-bottom:8px;}',
  '.ps-mates{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:6px;}',
  '.ps-mate{background:#161d2b;border:1px solid #2a3450;border-radius:8px;padding:6px 10px;color:var(--ink);',
  '  font-family:var(--body);font-weight:700;font-size:13px;text-align:left;cursor:pointer;line-height:1.2;',
  '  min-width:0;width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}',
  '.ps-mate small{display:block;font-size:10.5px;color:var(--dim);font-weight:700;overflow:hidden;text-overflow:ellipsis;}',
  '.ps-mate:hover:not(:disabled){filter:none;border-color:var(--gold);}',
  '.ps-mate.used{opacity:.35;}',
  '.ps-gh em{font-style:normal;color:var(--dim);margin-left:4px;}',
  '.ps-more{background:none;border:1px dashed #3a4666;border-radius:8px;padding:6px 10px;color:var(--mut);',
  '  font-family:var(--body);font-weight:800;font-size:12px;cursor:pointer;}',
  '.ps-mate.tgt{border-color:var(--gold);background:#2a2412;box-shadow:0 0 0 1px var(--gold) inset;animation:mxPulse 1.4s infinite;}',
  '.ps-go{background:linear-gradient(180deg,#d9a52a,#a8781a);border-color:#d9a52a;}',
  '.ps-done{padding:18px 16px 16px;margin:0 0 12px;text-align:center;position:relative;overflow:hidden;}',
  '.ps-done.win{border-color:rgba(242,193,78,.7);background:radial-gradient(120% 90% at 50% 0%,rgba(242,193,78,.22),rgba(242,193,78,0) 60%),#141a26;',
  '  box-shadow:0 0 0 1px rgba(242,193,78,.35),0 10px 40px rgba(242,193,78,.18);}',
  '.ps-done.miss{border-color:rgba(255,90,54,.5);background:radial-gradient(120% 90% at 50% 0%,rgba(255,90,54,.16),rgba(255,90,54,0) 60%),#141a26;}',
  '.ps-done-top{display:flex;align-items:center;justify-content:center;gap:22px;flex-wrap:wrap;}',
  '.ps-verdict{display:grid;justify-items:center;gap:4px;}',
  '.ps-head{font-family:var(--pixel);font-size:30px;line-height:1.1;color:var(--gold);text-shadow:0 3px 0 #7a5410,0 0 22px rgba(242,193,78,.45);}',
  '.ps-done.miss .ps-head{color:#ff5a36;text-shadow:0 3px 0 #6e1f0e;}',
  '.ps-done.win .ps-head{animation:psPop .6s cubic-bezier(.3,1.6,.5,1) both;}',
  '@keyframes psPop{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}',
  '.ps-stars{display:flex;gap:4px;font-size:22px;line-height:1;}',
  '.ps-stars span{color:#3a4258;}',
  '.ps-stars span.on{color:var(--gold);text-shadow:0 0 10px rgba(242,193,78,.6);}',
  '.ps-score{display:grid;justify-items:center;background:#05060b;border:2px solid #2a3350;border-radius:10px;padding:8px 16px;}',
  '.ps-score b{font-family:var(--pixel);font-size:34px;line-height:1;color:var(--gold);}',
  '.ps-done.miss .ps-score b{color:#ff5a36;}',
  '.ps-score span{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin-top:6px;}',
  '.ps-lane{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;gap:6px 4px;margin:16px 0 4px;}',
  '.ps-hop{display:grid;justify-items:center;gap:4px;width:64px;}',
  '.ps-hop b{font-size:11.5px;font-weight:800;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.ps-lp{display:flex;}',
  '.ps-lp .portrait{border-radius:7px;border:1px solid rgba(255,255,255,.16);}',
  '.ps-hop.last .ps-lp .portrait{border-color:var(--gold);box-shadow:0 0 0 2px rgba(242,193,78,.35),0 0 16px rgba(242,193,78,.4);}',
  '.ps-hop.last b{color:var(--gold);}',
  '.ps-arrow{display:grid;justify-items:center;align-content:center;height:44px;min-width:34px;}',
  '.ps-arrow span{font-size:9.5px;font-weight:800;color:var(--mut);white-space:nowrap;}',
  '.ps-arrow i{display:block;width:28px;height:2px;margin-top:4px;background:repeating-linear-gradient(90deg,var(--gold) 0 4px,transparent 4px 7px);position:relative;}',
  '.ps-arrow i::after{content:"";position:absolute;right:-2px;top:-3px;border:4px solid transparent;border-left:6px solid var(--gold);border-right:0;}',
  '.ps-best{margin:10px auto 0;max-width:520px;}',
  '@media(max-width:480px){.ps-lane{gap:6px 2px;} .ps-hop{width:48px;} .ps-hop b{max-width:48px;font-size:10.5px;}',
  '  .ps-arrow{min-width:36px;} .ps-arrow span{font-size:8.5px;} .ps-arrow i{width:24px;}}',
  '.ps-acts{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:14px;}',
  '.ps-acts button{flex:0 1 320px;min-width:0;width:auto;}',
  /* THE DESKTOP. The page widens, the timeline sits between the two ends, and
     the picker is two columns of even tiles rather than one long column. */
  '@media(min-width:920px){',
  '  .wrap:has(#s-pass.active){max-width:1040px;}',
  '  .ps-top{grid-template-columns:230px 1fr 230px;grid-template-areas:"a t b";gap:14px;align-items:stretch;}',
  '  .ps-top>.ps-to{display:none;}',
  '  .ps-top>.ps-tlw{display:flex;flex-direction:column;justify-content:flex-end;}',
  '  .ps-end{display:flex;flex-direction:column;justify-content:flex-end;padding:14px 16px;}',
  '  .ps-end b{font-size:24px;}',
  '  .ps-pic{margin-bottom:auto;padding-bottom:12px;}',
  '  .ps-pick{grid-template-columns:1fr 1fr;align-items:start;}',
  '  .ps-head{font-size:40px;}',
  '  .ps-hop{width:76px;} .ps-hop b{max-width:76px;font-size:12.5px;}',
  '  .ps-arrow{min-width:52px;} .ps-arrow i{width:44px;}',
  '}',
  '.ps-done i{color:var(--dim);font-style:normal;}',

  /* the leaderboard sheet */
  '.mb-top{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
  '.mb-top button.sm{padding:6px 12px;font-size:12px;}',
  '.mb-chain{margin:0 0 4px;padding:0;list-style:none;display:grid;gap:2px;counter-reset:ch;}',
  '.mb-chain li{display:flex;align-items:baseline;gap:8px;font-size:12.5px;padding:3px 0;border-top:1px solid rgba(255,255,255,.04);}',
  '.mb-chain li b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.mb-chain small{color:var(--dim);font-weight:600;font-variant-numeric:tabular-nums;}',
  '.mb-chain em{font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#5eead4;}',
  '.mb-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;}',
  '.mb-stats div{background:rgba(255,255,255,.03);border-radius:6px;padding:6px 8px;}',
  '.mb-stats small{display:block;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:800;}',
  '.mb-stats b{font-family:var(--num);font-variant-numeric:tabular-nums;font-size:15px;}',
  '.mb-deals{margin:0 0 10px;padding:0;list-style:none;font-size:12px;color:var(--mut);display:grid;gap:3px;}',
  '.mb-deals b{color:var(--ink);}',
  '.mb-ros{display:grid;gap:2px;}',
  '.mb-man{display:grid;grid-template-columns:1fr auto;gap:8px;font-size:12.5px;padding:3px 0;border-top:1px solid rgba(255,255,255,.04);}',
  '.mb-man small{color:var(--dim);font-weight:600;}',
  '.mb-man em{font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#5eead4;margin-left:6px;}'
].join('\n');

(function inject(){
  var s = document.createElement('style');
  s.id = 'modes-css';
  s.textContent = CSS;
  document.head.appendChild(s);
})();

// ═══ CONQUEST ═══════════════════════════════════════════════════════════════

var CQ_KEY = 'rtf.conquest.v1';
var CQ_BEST = 'rtf.conquest.best.v1';
var cq = null;           // the run
var cqView = 'intro';    // intro | preview | game | steal | life | over
var cqGame = null;       // the last game, while it is on screen
var cqSel = null;        // which of their men is picked on the steal screen
var cqTimers = [];

function cqSave(){ if (cq) lsSet(CQ_KEY, cq); }
function cqLoad(){
  var s = lsGet(CQ_KEY);
  if (s && s.v === 1 && Array.isArray(s.roster) && Array.isArray(s.ladder)) cq = s;
}
function cqBest(){ return lsGet(CQ_BEST) || { best: 0, runs: 0, cleared: 0 }; }
function cqClear(){ cqTimers.forEach(clearTimeout); cqTimers = []; }
function later(fn, ms){ cqTimers.push(setTimeout(fn, ms)); }

function cqNew(){
  var seed = Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  cq = M.cqCreate(data(), seed, { draft: true });
  cqView = 'draft';
  cqSave();
  cqRender();
  window.scrollTo(0, 0);
}

function cqOpen(){
  if (!data()) return;
  cqShown = null;
  cqLivesHeld = null;
  if (!cq) cqLoad();
  if (!cq) cqView = 'intro';
  else if (cq.drafting) cqView = 'draft';
  else if (M.cqOver(cq)) cqView = 'over';
  else if (cq.pending) cqView = 'steal';
  else cqView = 'preview';
  P.show('s-cq');
  cqRender();
}

function cqRosterRows(){ return M.cqRoster(cq, data()); }

function cqLivesHtml(pop){
  var h = '';
  var n = cqLivesShown();
  for (var i = 0; i < M.CQ.LIVES; i++) {
    var alive = i < n;
    h += '<span>' + ball(22, !alive).replace('class="pxball', 'class="pxball' + (pop && i === n ? ' pop' : ''))
      + '</span>';
  }
  return h;
}

/* THE COUNT ON SCREEN IS WHAT HAS BEEN SHOWN. cqPlay decides the game before
   the scoreboard starts, so a counter reading the run would say "1 win" in
   the second quarter of the game that earns it. `cqShown` holds the count
   back until the final horn. */
var cqShown = null, cqLivesHeld = null;
function cqWinsShown(){ return cqShown != null ? cqShown : M.cqStreak(cq); }
function cqLivesShown(){ return cqLivesHeld != null ? cqLivesHeld : cq.lives; }
function cqHead(pop){
  return '<div class="cq-head">'
    + pix(ART.crown, { g: '#f2c14e', r: '#ef4444', b: '#60a5fa', d: '#a8781a' }, 3)
    + '<div><div class="mh">Conquest</div><div class="cq-rung">Winners stay on</div></div>'
    + '<div class="cq-lives" aria-label="' + cqLivesShown() + ' lives">' + cqLivesHtml(pop) + '</div>'
    + '<div class="cq-w"><b id="cq-wins">' + cqWinsShown() + '</b><span>WINS</span></div>'
    + '</div>';
}

/* THE LINE OF CHALLENGERS. Everybody beaten, the one on the court, and the
   next few waiting, so a run reads as a queue of teams a fan knows rather
   than as a difficulty number. Past the ladder the queue is not known ahead,
   so it stops at the one on the court. */
function cqLineHtml(){
  var d = data(), h = '<div class="cq-line" id="cq-line">';
  var from = Math.max(0, cq.rung - 3), to = Math.min(cq.ladder.length, cq.rung + 6);
  if (cq.rung >= cq.ladder.length) to = cq.rung + 1;
  for (var k = from; k < to; k++) {
    var ts = M.cqChallenger(cq, d, k), t = tsParts(ts);
    var cls = k < cq.rung ? 'beat' : k === cq.rung ? 'now' : '';
    if (M.cqIsBoss(k)) cls += ' boss';
    h += '<div class="cq-q ' + cls + '">' + jersey(t.code, 4)
      + '<div class="qn">' + (k < cq.rung ? 'W ' : M.cqIsBoss(k) ? 'BOSS ' : '') + esc(t.short) + '</div></div>';
  }
  return h + '</div>';
}

/* "F. Campazzo". Two columns of five on a phone leave about 150px a name, and
   a full name there is an ellipsis on every other row. The surname is the
   part a fan reads, and it comes from the one formatter that knows a "Jr." is
   not a surname. */
function initialed(n){
  var last = surname(n), first = String(n).split(/\s+/)[0];
  return first && first !== last ? first.charAt(0) + '. ' + last : last;
}
function manRow(p, slot, isNew){
  return '<div class="cq-man' + (isNew ? ' new' : '') + '"><span class="s">' + slot + '</span>'
    + '<span class="n" title="' + esc(p.n) + '">' + esc(initialed(p.n)) + '<small>'
    + esc(shortClub(p.t, p.s)) + ' · ' + (p.pts || 0).toFixed(1) + ' pts</small></span></div>';
}
/* "'97 Grizzlies": the heading of a column a third of a phone wide. */
function nickSeason(t){ return "'" + String(t.season).slice(-2) + ' ' + E.teamName(t.code); }

function cqPreviewHtml(){
  var d = data(), pv = M.cqPreview(cq, d), t = tsParts(pv.ts), skin = E.clubSkin(t.code);
  var mine = cqRosterRows();
  var took = {};
  cq.wins.forEach(function(w){ if (w.took) took[w.took] = 1; });
  var you = '<div class="cq-side you"><h4>Your five</h4><div class="rt">Rating <b>'
    + pv.you.rating.toFixed(1) + '</b>' + (pv.you.system ? ' · ' + esc(pv.you.system) : '') + '</div>';
  mine.forEach(function(p, i){ you += manRow(p, E.SLOTS[i], took[cq.roster[i]]); });
  you += '</div>';
  var them = '<div class="cq-side them" style="--c-acc:' + skin.accent + '">'
    + (pv.boss ? '<div class="cq-boss">' + pix(ART.crown, { g: '#f2c14e', r: '#ef4444', b: '#60a5fa', d: '#a8781a' }, 2) + 'Boss</div>' : '')
    + '<h4 style="color:' + skin.accent + '" title="' + esc(t.name) + '">' + esc(nickSeason(t)) + '</h4><div class="rt">Rating <b>'
    + pv.them.rating.toFixed(1) + '</b></div>';
  pv.five.forEach(function(p){ them += manRow(p, p.pp || '', false); });
  them += '</div>';
  var tries = cq.tries ? '<p class="mx-say">Rematch. They beat you last time and they stayed on.</p>' : '';
  return cqHead(false) + cqLineHtml()
    + '<div class="cq-rung" style="margin:0 2px 8px">Game ' + (pv.rung + 1)
    + (pv.rung < M.CQ.RUNGS ? ' of ' + M.CQ.RUNGS : ' · Legends') + '</div>'
    + '<div class="cq-court"><div class="cq-sides">' + you + them + '<div class="cq-vs">VS</div></div></div>'
    + '<div class="cq-odds"><div class="cq-bar"><i style="width:' + (pv.chance * 100).toFixed(1) + '%"></i></div>'
    + '<div class="cq-bar-l"><span class="y">You ' + pct(pv.chance) + '</span><span class="t">'
    + esc(t.short) + ' ' + pct(1 - pv.chance) + '</span></div></div>'
    + tries
    + cqPlanHtml()
    + '<div class="mx-row" style="margin-top:14px"><button class="big" id="cq-go"' + (cq.plan ? '' : ' disabled') + '>'
    + cqGoLabel(pv) + '</button></div>';
}

/* THE GAME PLAN. Both fives' numbers in five areas, and nothing else: no
   edge, and no chance that moves as you tap, because trying all five and
   keeping the best would be a menu rather than a read. The odds bar above is
   the game with no plan, which is what it has always said. */
function cqGoLabel(pv){
  if (!cq.plan) return 'Pick a game plan';
  return pv.boss ? 'Face the boss' : 'Tip off';
}
function cqPlanNum(key, v){ return (Math.round(v * 10) / 10).toFixed(1); }
function cqPlanHtml(){
  var plans = M.cqPlans(cq, data());
  var h = '<div class="mx-card" style="margin-top:12px"><h3 class="fx-step" style="margin-top:0">Pick your game plan</h3>'
    + '<p class="mx-say" style="margin-top:0">Make the game about one thing. It pays where you beat them by the most. Numbers are per game, adjusted for pace.</p>'
    + '<div class="cq-plans">';
  plans.forEach(function(p){
    h += '<button class="cq-plan' + (cq.plan === p.key ? ' on' : '') + '" data-plan="' + p.key + '">'
      + '<span class="pn">' + esc(p.name) + '<small>' + esc(p.stat) + '</small></span>'
      + '<span class="pv"><span class="y">' + cqPlanNum(p.key, p.you) + '</span><i>vs</i><span class="t">'
      + cqPlanNum(p.key, p.them) + '</span></span></button>';
  });
  return h + '</div></div>';
}
function cqWirePlans(){
  document.querySelectorAll('.cq-plan[data-plan]').forEach(function(b){
    b.onclick = function(){
      if (!cq || cq.pending || cq.lost) return;
      var k = b.getAttribute('data-plan');
      M.cqSetPlan(cq, cq.plan === k ? null : k);
      cqSave();
      document.querySelectorAll('.cq-plan[data-plan]').forEach(function(x){
        x.classList.toggle('on', x.getAttribute('data-plan') === cq.plan);
      });
      var go = $('cq-go');
      if (go) { go.disabled = !cq.plan; go.textContent = cqGoLabel(M.cqPreview(cq, data())); }
    };
  });
}

/* HOW THE PLAN WENT, and what the better read was. Said after the game and
   never before it, so the next matchup is still a read. */
function cqPlanName(k){
  var pl = M.CQ_PLANS.filter(function(p){ return p.key === k; })[0];
  return pl ? pl.name : '';
}
function cqVerdictHtml(g){
  if (!g || !g.plan) return '';
  var edge = g.edge, word, cls = '';
  if (edge >= 2.5) { word = 'It worked. Big edge.'; cls = 'up'; }
  else if (edge >= 1) { word = 'It helped.'; cls = 'up'; }
  else if (edge > -1) { word = 'A wash.'; }
  else { word = 'It backfired.'; cls = 'dn'; }
  return '<div class="cq-verdict"><b>' + esc(cqPlanName(g.plan)) + ':</b> <span class="' + cls + '">' + word + '</span>'
    + (g.right ? ' The right read.' : ' Better read: <b>' + esc(cqPlanName(g.bestPlan)) + '</b>.') + '</div>';
}

/* THE GAME, QUARTER BY QUARTER. The score is already decided by cqPlay, and
   this only reveals it: the quarter lines are apportioned to hit it exactly,
   the way the season's own game sheets are. Both box scores are real men,
   because the challenger is a real club's five and not a rating. */
function cqGameHtml(){
  var g = cqGame, t = tsParts(g.ts);
  var per = g.q.periods;
  var head = '<div class="sb-q" id="sb-q">TIP OFF</div>';
  /* FOUR COLUMNS UNTIL THERE IS OVERTIME. A fifth column from the tip says
     the game goes to overtime before a ball is thrown. The cells exist and
     are hidden; the grid widens when one is reached. */
  function row(name, vals, id){
    var h = '<div class="sb-row" id="' + id + '" style="--per:4"><span class="tn">' + esc(name) + '</span>';
    /* Empty until the quarter is played. Printed dim and filled later, the
       final was on the screen before the tip. */
    for (var i = 0; i < per; i++) h += '<span class="qv" data-q="' + i + '" data-v="' + vals[i] + '"'
      + (i >= 4 ? ' hidden' : '') + '>-</span>';
    return h + '<span class="tot">0</span></div>';
  }
  return cqHead(false)
    + '<div class="mx-card mx-scan" style="padding:0;border:0;background:none">'
    + '<div class="sb" id="sb">' + head
    + row('Your five', g.q.yours, 'sb-you') + row(nickSeason(t), g.q.theirs, 'sb-them')
    + '<div class="sb-lead" id="sb-lead" hidden></div></div></div>'
    + '<div id="cq-after"></div>';
}

function cqRunScoreboard(){
  var g = cqGame, per = g.q.periods, q = 0, you = 0, them = 0;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var step = reduce ? 60 : (g.boss ? 900 : 650);
  function set(){
    var yr = $('sb-you'), tr = $('sb-them');
    if (!yr) return;
    yr.querySelector('.tot').textContent = you;
    tr.querySelector('.tot').textContent = them;
    yr.classList.toggle('lead', you > them);
    tr.classList.toggle('lead', them > you);
  }
  function tick(){
    if (!$('sb')) return;
    if (q >= per) return finish();
    var names = g.q.names;
    if (q >= 4) {
      document.querySelectorAll('#sb .sb-row').forEach(function(r){ r.style.setProperty('--per', q + 1); });
      document.querySelectorAll('#sb [data-q="' + q + '"]').forEach(function(el){ el.hidden = false; });
    }
    $('sb-q').textContent = names[q] + (q >= 4 ? '' : ' QUARTER');
    var ty = g.q.yours[q], tt = g.q.theirs[q], f = 0, frames = reduce ? 1 : 8;
    var y0 = you, t0 = them;
    (function count(){
      f++;
      you = y0 + Math.round(ty * f / frames);
      them = t0 + Math.round(tt * f / frames);
      set();
      if (f < frames) later(count, step / frames);
      else {
        document.querySelectorAll('#sb [data-q="' + q + '"]').forEach(function(el){
          el.textContent = el.getAttribute('data-v');
          el.classList.add('on');
        });
        q++;
        later(tick, reduce ? 20 : 180);
      }
    })();
  }
  function finish(){
    $('sb-q').textContent = 'FINAL' + (g.ot ? (g.ot > 1 ? ' / ' + g.ot + 'OT' : ' / OT') : '');
    var sb = $('sb');
    var st = document.createElement('div');
    st.className = 'mx-stamp';
    st.style.color = g.won ? 'var(--green)' : 'var(--red)';
    st.textContent = g.won ? 'W' : 'L';
    sb.appendChild(st);
    cqShown = null;
    cqLivesHeld = null;
    if ($('cq-wins')) $('cq-wins').textContent = M.cqStreak(cq);
    P.bar('Conquest · ' + M.cqStreak(cq) + 'W');
    var lead = $('sb-lead');
    lead.hidden = false;
    lead.innerHTML = '<b>' + g.leadsYou + '</b><br>' + g.leadsThem;
    later(function(){ cqAfterGame(); }, reduce ? 50 : 700);
  }
  later(tick, reduce ? 0 : 450);
}

function leaders(box, n){
  return box.slice().sort(function(a, b){ return b.pts - a.pts; }).slice(0, n)
    .map(function(r){ return esc(surname(r.n)) + ' ' + r.pts; }).join(' · ');
}

function cqTipOff(){
  var d = data();
  /* No plan, no tip. The button says so, and a stale press is refused here
     too rather than playing a game nobody planned. */
  if (!cq.plan) return;
  var pv = M.cqPreview(cq, d);
  cqShown = M.cqStreak(cq);
  cqLivesHeld = cq.lives;
  var rec = M.cqPlay(cq, d);
  cqSave();
  var rng = E.createSeededRNG(E.hashSeed(cq.seed + ':box:' + rec.rung + ':' + (cq.tries - 1)));
  var q = E.quarterLines(rec.you, rec.opp, rec.ot, rng);
  var myBox = E.gameBox(cqRosterRowsFromPreview(pv), rec.you, rng, rec.ot);
  var theirBox = E.gameBox(pv.five, rec.opp, rng, rec.ot);
  cqGame = { ts: rec.ts, won: rec.won, ot: rec.ot, boss: pv.boss, q: q,
    plan: rec.plan, edge: rec.edge, right: rec.right, bestPlan: rec.bestPlan,
    leadsYou: 'You: ' + leaders(myBox, 3),
    leadsThem: esc(tsParts(rec.ts).short) + ': ' + leaders(theirBox, 3) };
  cqView = 'game';
  cqRender();
  cqRunScoreboard();
}
function cqRosterRowsFromPreview(){ return cqRosterRows(); }

function cqAfterGame(){
  var box = $('cq-after');
  if (!box) return;
  var verdict = cqVerdictHtml(cqGame);
  if (cqGame.won) {
    cqView = 'steal';
    cqSel = null;
    box.innerHTML = verdict + cqStealHtml(true);
    cqWireSteal();
  } else if (M.cqOver(cq)) {
    cqRecordBest();
    box.innerHTML = verdict + '<div class="mx-row" style="margin-top:14px"><button class="big" id="cq-end">Last life gone. See the run</button></div>';
    $('cq-end').onclick = function(){ cqView = 'over'; cqRender(); };
    cqSubmit();
  } else {
    /* THE BALL POPS where it was, so the loss costs something you can see. */
    var lives = document.querySelector('.cq-lives');
    if (lives) lives.innerHTML = cqLivesHtml(true);
    box.innerHTML = verdict + '<div class="mx-card mx-rise" style="margin-top:14px"><h2 style="margin:0">They stay on</h2>'
      + '<p class="mx-say">That cost a life. <b>' + plural(cq.lives, 'life', 'lives') + ' left.</b> Beat them to move on.'
      + (M.CQ.BOSS_LIFE ? ' Every boss you beat gives one back.' : '') + '</p>'
      + '<div class="mx-row" style="margin-top:12px"><button class="big" id="cq-again">Rematch</button></div></div>';
    $('cq-again').onclick = function(){ cqView = 'preview'; cqRender(); window.scrollTo(0, 0); };
  }
}

/* WHICH OF THEIRS, THEN WHICH OF YOURS. Tapping one of their five opens the
   slots he can play, and each carries what the swap does to your rating,
   because that is the number the choice is really about and making somebody
   work it out in their head is a quiz rather than a game. */
function cqStealHtml(fresh){
  var d = data(), rec = cq.pending, t = tsParts(rec.ts);
  var opts = M.cqSteals(cq, d);
  var five = M.bestFive(d, rec.ts);
  var mine = cqRosterRows();
  var base = M.cqStrength(cq, d).rating;
  var h = '<div class="mx-card' + (fresh ? ' mx-rise' : '') + '" style="margin-top:14px">'
    + '<h2 style="margin:0">Take one <span class="sub">off the ' + esc(t.name) + '</span></h2>'
    + '<p class="mx-say" style="margin-bottom:6px">He takes the spot of the man you drop, so he has to be able to play it. Your rating now: <b>'
    + base.toFixed(1) + '</b>.</p>'
    + (rec.boss && rec.life ? '' : '')
    + '<div class="cq-take">';
  five.forEach(function(p){
    var k = E.pkey(p);
    var mineOpts = opts.filter(function(o){ return o.take === k; });
    var on = cqSel === k;
    h += '<button class="cq-pick' + (on ? ' on' : '') + '" data-take="' + esc(k) + '">'
      + '<span class="ps">' + esc(p.pp || '') + '</span>'
      + '<span class="pn">' + esc(p.n) + '<small>' + esc(lineOf(p)) + '</small></span>'
      + '<span class="pw"><b>' + p.w.toFixed(1) + '</b>win shares</span></button>';
    if (on) {
      if (!mineOpts.length) {
        h += '<div class="cq-none">He cannot play any spot you could open for him.</div>';
      } else {
        h += '<div class="cq-drops">';
        mineOpts.sort(function(a, b){ return b.delta - a.delta; }).forEach(function(o){
          var out = mine[o.slot];
          var dc = o.delta > 0 ? 'up' : o.delta < 0 ? 'dn' : '';
          h += '<button class="cq-drop" data-take="' + esc(k) + '" data-slot="' + o.slot + '">'
            + '<span>Drop ' + esc(surname(out.n)) + ' (' + E.SLOTS[o.slot] + ')</span>'
            + '<span class="d ' + dc + '">' + (o.delta > 0 ? '+' : '') + o.delta.toFixed(1) + '</span></button>';
        });
        h += '</div>';
      }
    }
  });
  h += '</div><div class="mx-row" style="margin-top:12px"><button class="ghost" id="cq-keep">Keep my five</button></div></div>';
  return h;
}

function cqWireSteal(){
  document.querySelectorAll('.cq-pick').forEach(function(b){
    b.onclick = function(){
      var k = b.getAttribute('data-take');
      cqSel = cqSel === k ? null : k;
      $('cq-after').innerHTML = cqVerdictHtml(cq.pending) + cqStealHtml(false);
      cqWireSteal();
    };
  });
  document.querySelectorAll('.cq-drop').forEach(function(b){
    b.onclick = function(){
      cqDoSteal(b.getAttribute('data-take'), Number(b.getAttribute('data-slot')));
    };
  });
  var keep = $('cq-keep');
  if (keep) keep.onclick = function(){ cqDoSteal(null, null); };
}

function cqDoSteal(take, slot){
  var rec = cq.pending;
  M.cqSteal(cq, data(), take, slot);
  cqSave();
  cqRecordBest();
  var msg = take ? data().allPlayers[take].n + ' is yours.' : 'You kept your five.';
  if (rec.life) msg += ' Boss beaten: a life back.';
  if (M.cqStreak(cq) === M.CQ.RUNGS) msg = 'You beat the best team there has ever been. The court stays open.';
  P.toast(msg);
  cqView = 'preview';
  cqRender();
  window.scrollTo(0, 0);
}

function cqRecordBest(){
  var b = cqBest(), w = M.cqStreak(cq);
  if (w > b.best) b.best = w;
  if (M.cqOver(cq) && !cq.counted) { b.runs++; cq.counted = true; if (M.cqCleared(cq)) b.cleared++; cqSave(); }
  lsSet(CQ_BEST, b);
  cqFeats();
}

/* WHAT THIS RUN HAS PROVED, for the cabinet. Every Conquest feat is a maximum
   of the run as it stands, so asking after every steal and again at the end
   counts nothing twice. The one count, runs finished, rides on `final`, which
   is passed once and marked on the run so a reload cannot pass it again. */
function cqFeats(){
  var BD = window.RTF_BADGES;
  if (!BD || !P.feats || !cq) return;
  var final = M.cqOver(cq) && !cq.featsFiled;
  var d = data();
  P.feats(BD.conquestFeats(cq, M.CQ.RUNGS, function(k){ return d.allPlayers[k]; }, final));
  if (final) { cq.featsFiled = true; cqSave(); }
}

function cqOverHtml(){
  var d = data(), w = M.cqStreak(cq), lost = cq.lost && tsParts(cq.lost.ts);
  var trail = '<div class="cq-trail">';
  cq.wins.forEach(function(x){
    var t = tsParts(x.ts);
    trail += '<div class="t">' + jersey(t.code, 3) + '<span>' + esc(t.short) + '</span></div>';
  });
  if (lost) trail += '<div class="t l">' + jersey(lost.code, 3) + '<span>' + esc(lost.short) + '</span></div>';
  trail += '</div>';
  var took = cq.wins.filter(function(x){ return x.took; }).map(function(x){
    var p = d.allPlayers[x.took];
    return '<b>' + esc(p.n) + '</b> (' + esc(shortClub(p.t, p.s)) + ')';
  });
  var mine = cqRosterRows();
  var five = '<div class="cq-side" style="margin-top:10px">';
  mine.forEach(function(p, i){ five += manRow(p, E.SLOTS[i], false); });
  five += '</div>';
  var best = cqBest();
  var verdict = M.cqCleared(cq) ? 'Ran the floor' : w >= 15 ? 'A legend run' : w >= 8 ? 'Held the court' : w >= 3 ? 'Got some run' : 'Sent to the bench';
  return '<div class="cq-head">' + pix(ART.crown, { g: '#f2c14e', r: '#ef4444', b: '#60a5fa', d: '#a8781a' }, 3)
    + '<div><div class="mh">Conquest</div><div class="cq-rung">Run over</div></div></div>'
    + '<div class="mx-card mx-scan mx-rise" style="text-align:center;padding:22px 16px">'
    + '<div class="mx-eyebrow">' + esc(verdict) + '</div>'
    + '<div class="cq-big" style="margin:14px 0 8px">' + w + '</div>'
    + '<div class="mx-eyebrow" style="color:var(--ink)">' + (w === 1 ? 'win' : 'wins') + ' in a row</div>'
    + (lost ? '<p class="mx-say">Knocked out by the <b>' + esc(lost.name) + '</b>, ' + cq.lost.opp + '-' + cq.lost.you + '.</p>' : '')
    + '<p class="mx-say">Your best: <b>' + best.best + '</b>.</p><div id="cq-place" class="fx-place"></div></div>'
    + '<div class="mx-card"><h2 style="margin:0">The line you beat</h2>' + trail
    + (took.length ? '<p class="mx-say" style="margin-top:12px">You took ' + took.join(', ') + '.</p>' : '<p class="mx-say">You never took anybody.</p>')
    + '<h3>The five you finished with</h3>' + five + '</div>'
    + '<div class="mx-row"><button class="big" id="cq-new">Run it back</button></div>'
    + '<div class="mx-row" style="margin-top:8px"><button class="ghost" id="cq-share">Share</button>'
    + '<button class="ghost" id="cq-board">Leaderboard</button></div>';
}

function cqShareText(){
  var d = data(), w = M.cqStreak(cq), lives = '';
  for (var i = 0; i < M.CQ.LIVES; i++) lives += i < cq.lives ? '🏀' : '⚫';
  var took = cq.wins.filter(function(x){ return x.took; }).slice(-3).map(function(x){
    var p = d.allPlayers[x.took];
    return surname(p.n) + ' ' + shortClub(p.t, p.s);
  });
  var lost = cq.lost ? tsParts(cq.lost.ts) : null;
  return 'Run The Floor · Conquest\n' + lives + ' ' + plural(w, 'win') + ' in a row'
    + (M.cqCleared(cq) ? ' 👑' : '') + '\n'
    + (took.length ? 'Took ' + took.join(', ') + '\n' : '')
    + (lost ? 'Knocked out by the ' + lost.name + '\n' : '')
    + 'Winners stay on. How long can you hold the court?\n'
    + P.SHARE_URL;
}

/* THE OPENING DRAFT. One position at a time, three cards, tap one. Every pick
   is final, the same as a steal. The cards show the stat line and minutes and
   never win shares, because reading past points is what a good pick is. */
function cqDraftHtml(){
  var d = data(), k = cq.roster.length, slot = E.SLOTS[k], cards = M.cqDraftCards(cq, d);
  var h = '<div class="cq-head">' + pix(ART.crown, { g: '#f2c14e', r: '#ef4444', b: '#60a5fa', d: '#a8781a' }, 3)
    + '<div><div class="mh">Conquest</div><div class="cq-rung">Draft your five · Pick ' + (k + 1) + ' of ' + E.SLOTS.length + '</div></div></div>';
  h += '<div class="cqd-slots">';
  E.SLOTS.forEach(function(s, i){
    var key = cq.roster[i], p = key ? d.allPlayers[key] : null;
    h += '<div class="cqd-slot' + (i === k ? ' now' : p ? ' done' : '') + '"><span class="s">' + s + '</span>'
      + (p ? '<b>' + esc(surname(p.n)) + '</b>' : '<b class="open">' + (i === k ? 'Picking' : 'Open') + '</b>') + '</div>';
  });
  h += '</div>';
  h += '<h3 class="fx-step">Pick your ' + slotWord(slot) + '</h3>'
    + '<p class="mx-say" style="margin-top:0">Three role players. Points are loud. Look at the rest of the line too.</p>'
    + '<div class="cqd-cards">';
  cards.forEach(function(key, i){
    var p = d.allPlayers[key], skin = E.clubSkin(p.t);
    h += '<button class="cqd-card mx-rise" style="animation-delay:' + (i * 60) + 'ms;--c-acc:' + skin.accent + '" data-k="' + esc(key) + '">'
      + '<div class="cqd-top">' + jersey(p.t, 3) + '<span class="cqd-club">' + esc(shortClub(p.t, p.s)) + '</span>'
      + '<span class="cqd-pos">' + esc(posTxt(p) || slot) + '</span></div>'
      + '<div class="cqd-name">' + esc(p.n) + '</div>'
      + '<div class="cqd-line"><span><b>' + (p.pts || 0).toFixed(1) + '</b>pts</span><span><b>' + (p.reb || 0).toFixed(1) + '</b>reb</span>'
      + '<span><b>' + (p.ast || 0).toFixed(1) + '</b>ast</span><span><b>' + ((p.stl || 0) + (p.blk || 0)).toFixed(1) + '</b>stl+blk</span>'
      + '<span><b>' + (p.mp || 0).toFixed(0) + '</b>min</span></div></button>';
  });
  h += '</div>'
    + '<div class="mx-row" style="margin-top:12px"><button class="ghost" id="cq-deal">Just deal me five</button></div>';
  return h;
}
/* "SF;SG" is the data's spelling. A reader wants "SF / SG". */
function posTxt(p){ return String(p.ep || p.pp || '').split(';').join(' / '); }
function slotWord(s){
  return { PG: 'point guard', SG: 'shooting guard', SF: 'small forward', PF: 'power forward', C: 'center' }[s] || s;
}

function cqIntroHtml(){
  var b = cqBest();
  return '<div class="cq-head">' + pix(ART.crown, { g: '#f2c14e', r: '#ef4444', b: '#60a5fa', d: '#a8781a' }, 3)
    + '<div><div class="mh">Conquest</div><div class="cq-rung">Winners stay on</div></div></div>'
    + '<div class="mx-card mx-scan" style="padding:20px 16px">'
    + '<div style="display:flex;gap:6px;margin-bottom:12px">' + ball(22) + ball(22) + ball(22) + '</div>'
    + '<p class="mx-say" style="margin:0"><b>Draft five role players and take the court.</b> Real teams line up to take it off you, weakest first. The 1996 Bulls are waiting at the top.</p>'
    + '<p class="mx-say"><b>Pick a game plan every game.</b> Read both fives. Make it about what you do better.</p>'
    + '<p class="mx-say"><b>Beat a team and take one of their guys.</b> He takes the spot of the man you drop, so he has to be able to play it.</p>'
    + '<p class="mx-say"><b>Three lives.</b> Lose and the same team stays on for a rematch. Beat a boss and you get a life back.</p>'
    + (b.best ? '<p class="mx-say">Your best run: <b>' + plural(b.best, 'win') + '</b>.</p>' : '')
    + '</div><div class="mx-row"><button class="big" id="cq-new">Draft your five</button></div>';
}

function cqRender(){
  cqClear();
  var box = $('s-cq');
  if (!box) return;
  var h;
  if (cqView === 'intro' || !cq) h = cqIntroHtml();
  else if (cq.drafting) { cqView = 'draft'; h = cqDraftHtml(); }
  else if (cqView === 'over') h = cqOverHtml();
  else if (cqView === 'game') h = cqGameHtml();
  else if (cqView === 'steal') {
    /* A reload with a win waiting lands here, so the scoreboard is gone and
       the steal stands on its own under the head. */
    h = cqHead(false) + cqLineHtml() + '<div id="cq-after">' + cqVerdictHtml(cq.pending) + cqStealHtml(true) + '</div>';
  }
  else h = cqPreviewHtml();
  box.innerHTML = h;
  P.bar('Conquest · ' + (cq && cq.drafting ? 'Draft' : cq ? cqWinsShown() + 'W' : ''));
  box.querySelectorAll('.cqd-card[data-k]').forEach(function(b){
    b.onclick = function(){
      if (!cq || !cq.drafting) return;
      M.cqDraftPick(cq, data(), b.getAttribute('data-k'));
      if (!cq.drafting) cqView = 'preview';
      cqSave();
      cqRender();
      window.scrollTo(0, 0);
    };
  });
  var deal = $('cq-deal');
  if (deal) deal.onclick = function(){
    /* The same run, with the crew the seed would have dealt. */
    cq = M.cqCreate(data(), cq.seed);
    cqView = 'preview';
    cqSave();
    cqRender();
    window.scrollTo(0, 0);
  };
  var go = $('cq-go'); if (go) go.onclick = cqTipOff;
  cqWirePlans();
  var nw = $('cq-new'); if (nw) nw.onclick = cqNew;
  var sh = $('cq-share'); if (sh) sh.onclick = function(){ share(cqShareText()); };
  var bd = $('cq-board'); if (bd) bd.onclick = function(){ openModeBoard('conquest'); };
  if (cqView === 'steal') cqWireSteal();
  if (cqView === 'over') cqSubmitOrPlace();
  var line = $('cq-line');
  if (line) {
    var now = line.querySelector('.now');
    if (now) line.scrollLeft = Math.max(0, now.offsetLeft - line.clientWidth / 2 + 31);
  }
}

// ═══ FIX HISTORY ════════════════════════════════════════════════════════════

var FX_KEY = 'rtf.fix.v1';          // { days: { [day]: finished result } }
var FX_RUN = 'rtf.fix.run.v2';      // the season in progress: { day, ts, win, trades, done }
var fx = null;                      // today's puzzle: { day, ts, five }
var fxBase = null;                  // today's odds as built
var fxSt = null;                    // the season in progress
var fxBlock = [], fxPicksOn = [];   // the package: pkeys and pick ids
var fxSwapFrom = null;               // a spot tapped, waiting for the one to swap with

/* SWAP TWO MEN. Two starters trade spots. A bench man takes a starter's spot
   and the starter sits. Two bench men is nothing to do. The five goes to the
   engine as keys in SLOTS order, and the engine is what says it is legal. */
function fxSwap(a, b){
  if (!a || !b || a === b) return false;
  var d = data(), st = fxSeason();
  var keys = M.fxLineupAt(d, st, st.win).map(E.pkey);
  var ia = keys.indexOf(a), ib = keys.indexOf(b);
  if (ia < 0 && ib < 0) return false;
  if (ia >= 0 && ib >= 0) { keys[ia] = b; keys[ib] = a; }
  else if (ia >= 0) keys[ia] = b;
  else keys[ib] = a;
  if (M.fxSetLineup(d, st, keys)) return false;
  fxSaveSeason();
  return true;
}

/* DRAG BY THE SPOT LABEL. Only the label takes the drag (touch-action:none),
   so a thumb anywhere else on the row still scrolls the page and a tap still
   shops the man. A press that does not move is a tap on the label: it picks
   that man, and the next label tapped is who he swaps with. */
function fxWireDrag(box, keepY){
  var redo = keepY(function(){});
  box.querySelectorAll('.fx-man.dr [data-grip]').forEach(function(g){
    g.addEventListener('pointerdown', function(ev){
      if (ev.button > 0) return;
      ev.preventDefault();
      var row = g.closest('.fx-man'), from = row.getAttribute('data-k');
      var x0 = ev.clientX, y0 = ev.clientY, ghost = null, over = null, raf = 0, lastY = y0;
      try { g.setPointerCapture(ev.pointerId); } catch (e) {}
      function target(x, y){
        var el = document.elementFromPoint(x, y);
        var m = el && el.closest && el.closest('.fx-man.dr');
        return m && box.contains(m) && m !== row ? m : null;
      }
      function scroll(){
        if (!ghost) return;
        var edge = 70, v = lastY < edge ? -10 : lastY > window.innerHeight - edge ? 10 : 0;
        if (v) window.scrollBy(0, v);
        raf = requestAnimationFrame(scroll);
      }
      function move(e){
        lastY = e.clientY;
        if (!ghost) {
          if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 8) return;
          var r = row.getBoundingClientRect();
          ghost = row.cloneNode(true);
          ghost.className += ' ghost';
          ghost.style.width = r.width + 'px';
          document.body.appendChild(ghost);
          row.classList.add('lift');
          fxSwapFrom = null;
          raf = requestAnimationFrame(scroll);
        }
        ghost.style.transform = 'translate(' + (e.clientX - 24) + 'px,' + (e.clientY - 22) + 'px)';
        var t = target(e.clientX, e.clientY);
        if (t !== over) { if (over) over.classList.remove('drop'); over = t; if (over) over.classList.add('drop'); }
      }
      function up(e){
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        g.removeEventListener('pointercancel', up);
        cancelAnimationFrame(raf);
        if (ghost) {
          ghost.remove();
          row.classList.remove('lift');
          if (over) over.classList.remove('drop');
          if (e.type === 'pointerup' && over) fxSwap(from, over.getAttribute('data-k'));
          redo();
          return;
        }
        if (e.type !== 'pointerup') return;
        if (!fxSwapFrom) fxSwapFrom = from;
        else if (fxSwapFrom === from) fxSwapFrom = null;
        else { fxSwap(fxSwapFrom, from); fxSwapFrom = null; }
        redo();
      }
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
      g.addEventListener('pointercancel', up);
    });
  });
}
var fxView = 'desk';                // 'desk', 'phone', 'stretch'
var fxSort = 'pts', fxPos = 'all';
var fxCallsMemo = null;             // { key, offers }
var fxOddsMemo = null;              // { key, odds }
var fxPending = null;               // the offer awaiting confirm
var fxTalk = null;                  // a negotiation: { with, ins, outs, picks, reply }
var fxBusy = false;

/* ENDLESS: one team after another, off the board. The screens are the daily's
   screens, so the only question every one of them asks is which puzzle is
   current, and `fxEnd` is the answer. Its state is under its own key and never
   the day's: an endless season must not be able to overwrite today's saved
   one, and today's record, streak and place are read off keys endless never
   writes. */
var FX_END = 'rtf.fix.endless.v1';  // { day, run, result, recent:[ts], played }
var fxEnd = false;
var fxDayPz = null;                 // today's puzzle, for the screens that are always about today

function today(){ return P.dayNumberOf(P.easternISO()); }

/* ENDLESS AND BUILD ARE RUN THE FLOOR PRO. `rtf_premium` in premium_products()
   (supabase/123_hoops_pro.sql) is the whole answer, bought through the site's
   one checkout as the `floor-pro` bundle. PRO_LIVE false opens it to everybody,
   which is the switch to reach for if the store ever has to come down: a lock
   with no store behind it is a wall. A friend's link never asks. */
var PRO_LIVE = true;
var PRO_BUNDLE = 'floor-pro';
var PRO_PRICE = '$9.99';
var proOwned = false;
function endlessOpen(){ return !PRO_LIVE || proOwned; }
function fxStore(){ return lsGet(FX_KEY) || { days: {} }; }
/* THREE SHAPES OF RESULT, read as one. The first version was one man for one
   man (slot, out, inKey); the second one trade (with, outs, ins); this one a
   season of them (trades). The first two are read as a season with one deal
   in it so every screen after this has one thing to draw. */
function fxNorm(r){
  if (!r || r.trades) return r;
  if (r.ins) { r.trades = [{ w: 0, with: r.with, outs: r.outs, ins: r.ins, picks: [] }]; return r; }
  r.legacy = true;
  r.trades = [{ w: 0, with: null, outs: [r.out], ins: [r.inKey], picks: [] }];
  return r;
}
function fxResult(day){ return fxNorm(fxStore().days[day] || null); }
function fxKeep(day, r){
  var s = fxStore();
  s.days[day] = r;
  var keys = Object.keys(s.days).map(Number).sort(function(a, b){ return a - b; });
  while (keys.length > 30) delete s.days[keys.shift()];
  lsSet(FX_KEY, s);
}
function fxStreak(){
  var days = fxStore().days, d = today(), n = 0;
  if (!days[d]) d--;
  while (days[d]) { n++; d--; }
  return n;
}

function fxToday(){
  var d = today();
  if (!fxDayPz || fxDayPz.day !== d) fxDayPz = M.fxDaily(data(), d);
  return fxDayPz;
}
function fxEndStore(){ return lsGet(FX_END) || { day: null, ts: null, run: null, result: null, recent: [], played: 0 }; }
/* A PICKED TEAM goes through the same store as an endless one: the number is
   the hash of the team, so opening the same link twice lands on the season in
   progress rather than wiping it. */
function fxEndPick(ts){
  var f = M.fxCustom(data(), ts);
  if (!f) return false;
  var s = fxEndStore();
  if (s.day !== f.day) {
    s.day = f.day; s.ts = ts; s.run = null; s.result = null;
    s.recent = (s.recent || []).concat([ts]).slice(-40);
    lsSet(FX_END, s);
  }
  return true;
}
/* A new endless team. Steered off the teams played lately and off today's,
   so pressing Next never lands on the daily you just finished. */
function fxEndNew(){
  var s = fxEndStore();
  var f = M.fxEndless(data(), Math.random, (s.recent || []).concat([fxToday().ts]));
  s.day = f.day; s.ts = null; s.run = null; s.result = null;
  s.recent = (s.recent || []).concat([f.ts]).slice(-40);
  lsSet(FX_END, s);
  return s;
}
function fxPuzzle(){
  var d = today();
  var picked = null;
  if (fxEnd) { var s = fxEndStore(); if (s.day == null) s = fxEndNew(); d = s.day; picked = s.ts; }
  if (!fx || fx.day !== d) { fx = fxEnd ? (picked && M.fxCustom(data(), picked)) || M.fxDaily(data(), d) : fxToday(); fxBase = null; fxSt = null; fxBlock = []; fxPicksOn = []; fxSwapFrom = null; fxView = 'desk'; }
  return fx;
}
function fxBaseOdds(){
  if (!fxBase) fxBase = M.fxOdds(data(), fxPuzzle().five, fx.day);
  return fxBase;
}
/* The season in progress, kept on the device so a reload lands in the same
   window with the same trades. A saved season for another day is dropped. */
function fxSeason(){
  var p = fxPuzzle();
  if (fxSt && fxSt.day === p.day) return fxSt;
  var s = fxEnd ? fxEndStore().run : lsGet(FX_RUN);
  fxSt = s && s.day === p.day && s.ts === p.ts ? s : M.fxSeasonCreate(data(), p.day, p.ts);
  return fxSt;
}
function fxSaveSeason(){
  if (!fxSt) return;
  if (!fxEnd) { lsSet(FX_RUN, fxSt); return; }
  var s = fxEndStore();
  if (s.day !== fxSt.day) return;
  s.run = fxSt;
  lsSet(FX_END, s);
}
/* Today's, always: this is the front page asking. */
function fxInProgress(){
  var p = fxToday(), s = lsGet(FX_RUN);
  return !!(s && s.day === p.day && (s.win > 0 || (s.trades && s.trades.length)));
}
function fxStKey(st){ return st.day + ':' + st.win + ':' + JSON.stringify(st.trades) + ':' + JSON.stringify(st.lineups || {}); }
/* The odds as the season stands: every trade so far, and nothing more. */
function fxOddsNow(){
  var st = fxSeason(), key = fxStKey(st);
  if (!fxOddsMemo || fxOddsMemo.key !== key) {
    var r = M.fxSeasonOddsStep(data(), st, 0, M.FX.SIMS);
    fxOddsMemo = { key: key, odds: r.titles / M.FX.SIMS, wins: r.wins / M.FX.SIMS };
  }
  return fxOddsMemo;
}

/* Accents and case folded, so "ginobili" finds Manu Ginóbili. */
function fold(s){
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function fxOrdered(rows, five){
  var keys = {};
  five.forEach(function(p){ keys[E.pkey(p)] = 1; });
  var bench = rows.filter(function(p){ return !keys[E.pkey(p)]; })
    .sort(function(a, b){ return (b.mp || 0) - (a.mp || 0); });
  return { starters: five.slice(), bench: bench };
}

function fxLabel(p){ return !fxEnd ? 'Day ' + p.day : p.custom ? 'Picked team' : 'Endless'; }
function fxHead(){
  var p = fxPuzzle(), st = fxEnd ? 0 : fxStreak();
  return '<div class="cq-head">'
    + pix(ART.rewind, { t: '#5eead4' }, 3)
    + '<div><div class="mh fx-mh">Fix History</div><div class="cq-rung">' + fxLabel(p)
    + (st > 1 ? ' · ' + st + ' days in a row' : '') + '</div></div></div>'
    + fxBanner(p.ts);
}
/* A picked team can be a champion, so the note says which. A daily or an
   endless team never is: fxCandidates leaves champions out. */
function fxBanner(ts){
  var t = tsParts(ts), skin = E.clubSkin(t.code);
  var note = E.wonTitle(t.code, t.season) ? 'They won it. Make it a lock.' : 'Good enough to win it. They didn\'t.';
  return '<div class="fx-banner" style="--c-bg:' + skin.bg + ';--c-acc:' + skin.accent + ';--c-on:' + skin.on + '">'
    + jersey(t.code, 5)
    + '<div class="fx-bt"><div class="fx-yr">' + t.season + '</div>'
    + '<div class="fx-nm">' + esc(E.team(t.code).full || E.teamName(t.code)) + '</div>'
    + '<div class="fx-note">' + note + '</div></div></div>';
}

/* One man on a roster. Win shares show on YOUR men only: you know your own
   team, and who the market underpaid elsewhere is the puzzle. */
function fxManHtml(p, label, mark, tap, showWs, drag, off){
  var k = E.pkey(p);
  return '<button class="fx-man' + (mark ? ' ' + mark : '') + (label === 'BN' ? ' bn' : '') + (drag ? ' dr' : '')
    + (drag && fxSwapFrom === k ? ' pick' : '') + '" data-k="' + esc(k) + '"'
    + (tap ? '' : ' disabled') + '>'
    + '<span class="fs' + (off ? ' off' : '') + '"' + (drag ? ' data-grip="1" title="Drag to swap"' : '') + '>' + label + '</span>'
    + '<span class="fn">' + esc(p.n) + '<small>' + esc(lineOf(p)) + ' · ' + (p.mp || 0).toFixed(0) + ' min</small></span>'
    + '<span class="fp"><b>' + money(p.p) + '</b>' + (showWs ? p.w.toFixed(1) + ' WS' : esc(shortClub(p.t, p.s))) + '</span>'
    + (mark === 'out' ? '<span class="fx-tag">On the block</span>'
      : mark === 'in' ? '<span class="fx-tag in">New</span>' : '')
    + '</button>';
}
function fxRosterHtml(rows, five, opts){
  var o = fxOrdered(rows, five), h = '<div class="fx-five">';
  var out = opts.out || {}, inn = opts.inn || {};
  o.starters.forEach(function(p, i){
    var k = E.pkey(p);
    h += fxManHtml(p, E.SLOTS[i], out[k] ? 'out' : inn[k] ? 'in' : '', opts.tap, !inn[k], opts.drag, !E.canFillSlot(p, E.SLOTS[i]));
  });
  h += '</div>';
  if (o.bench.length) {
    h += '<div class="fx-benchh">Bench</div><div class="fx-five">';
    o.bench.forEach(function(p){
      var k = E.pkey(p);
      h += fxManHtml(p, 'BN', out[k] ? 'out' : inn[k] ? 'in' : '', opts.tap, !inn[k], opts.drag);
    });
    h += '</div>';
  }
  return h;
}
function fxSetOf(keys){ var o = {}; keys.forEach(function(k){ o[k] = 1; }); return o; }
/* Every man who came in by trade this season, so the roster can mark him. */
function fxAcquired(st){
  var o = {};
  st.trades.forEach(function(t){ t.ins.forEach(function(k){ o[k] = 1; }); });
  return o;
}

function pickLabel(id){
  var m = /^R([12])Y([0-9]{4})$/.exec(id);
  return m ? "'" + m[2].slice(-2) + (m[1] === '1' ? ' 1st' : ' 2nd') : id;
}
function blockSal(){ return fxBlock.reduce(function(s, k){ return s + data().allPlayers[k].p; }, 0); }
function blockValue(){ return blockSal() + fxPicksOn.reduce(function(s, id){ return s + M.pickValue(id); }, 0); }
function fxRange(){
  var sal = blockSal();
  var lo = Math.max(0, (sal - M.TRADE.SLACK) / M.TRADE.MATCH);
  var hi = Math.min(sal * M.TRADE.MATCH + M.TRADE.SLACK, blockValue());
  return money(lo) + ' to ' + money(hi);
}

/* THE WINDOWS, as a strip: done, now, still to come. */
function fxStepper(st){
  var acq = {};
  st.trades.forEach(function(t){ acq[t.w] = 1; });
  return '<div class="fxw">' + M.FX_WINDOWS.map(function(w, k){
    var cls = k < st.win ? 'past' : k === st.win && !st.done ? 'now' : '';
    return '<div class="fxw-s ' + cls + (acq[k] ? ' dealt' : '') + '"><b>' + esc(w.short) + '</b><small>'
      + (k < st.win ? (acq[k] ? 'Traded' : 'Stood pat') : k === st.win && !st.done ? 'Open now' : 'After ' + w.at) + '</small></div>';
  }).join('') + '</div>';
}
/* The record so far in the one replayed season, which the story follows.
   Games before a window never depend on what is done at it. */
function fxRecordTo(st, games){
  if (!games) return null;
  var rep = M.fxSeasonReplay(data(), st), w = 0;
  for (var i = 0; i < games; i++) if (rep.games[i]) w++;
  return { w: w, l: games - w };
}

function fxDeskHtml(){
  var st = fxSeason(), p = fxPuzzle(), d = data(), win = M.FX_WINDOWS[st.win];
  var base = fxBaseOdds(), now = fxOddsNow(), rec = fxRecordTo(st, win.at);
  var rows = M.fxRosterAt(d, st, st.win), five = M.fxLineupAt(d, st, st.win);
  var coach = M.fxLineup(rows), custom = five.map(E.pkey).join() !== coach.map(E.pkey).join();
  var h = fxHead() + fxStepper(st)
    + '<div class="fx-now"><div><span class="mx-eyebrow">' + esc(win.name) + (rec ? ' · ' + rec.w + '-' + rec.l : '') + '</span>'
    + '<b>' + (rec ? 'Record ' + rec.w + '-' + rec.l + '.' : 'The season starts after this window.') + '</b></div>'
    + '<div class="fx-now-o"><span class="mx-eyebrow">Title odds</span><b class="mx-num">' + pct1(now.odds) + '</b>'
    + (st.trades.length ? '<small>was ' + pct1(base.odds) + '</small>' : '') + '</div></div>'
    + '<h3 class="fx-step">Put up to three players on the block</h3>'
    + '<p class="mx-say" style="margin-top:0">Add picks to sweeten it. Each club that calls makes one offer. One trade a window.</p>'
    + '<div class="fx-lu"><span>Drag a spot to swap two players.</span>'
    + (custom ? '<button class="ghost sm" id="fx-coach">Coach\'s five</button>' : '') + '</div>'
    + fxRosterHtml(rows, five, { tap: true, drag: true, out: fxSetOf(fxBlock), inn: fxAcquired(st) });
  var picks = M.fxPicksLeft(st);
  h += '<div class="fx-benchh">Your picks</div><div class="fx-picks">'
    + (picks.length ? picks.map(function(id){
        return '<button class="fx-pick' + (fxPicksOn.indexOf(id) >= 0 ? ' on' : '') + '" data-pk="' + id + '">' + pickLabel(id)
          + '<small>' + money(M.pickValue(id)) + '</small></button>';
      }).join('') : '<span class="fx-hint" style="margin:0">All traded.</span>') + '</div>';
  var n = fxBlock.length ? fxCallsNow().length : 0;
  var next = st.win + 1 < M.FX_WINDOWS.length ? 'play to game ' + M.FX_WINDOWS[st.win + 1].at : 'finish the season';
  h += '<div class="fx-dock"><div class="fx-dk">';
  if (fxBlock.length) {
    h += '<span class="mx-eyebrow">On the block · ' + money(blockSal())
      + (fxPicksOn.length ? ' + ' + plural(fxPicksOn.length, 'pick') : '') + '</span>'
      + '<b>' + fxBlock.map(function(k){ return esc(surname(d.allPlayers[k].n)); }).join(', ')
      + (fxPicksOn.length ? ', ' + fxPicksOn.map(pickLabel).join(', ') : '') + '</b>'
      + '<small>Takes back ' + fxRange() + '.</small>';
  } else {
    h += '<span class="mx-eyebrow">The block is empty</span><small>Tap a player to shop him.</small>';
  }
  h += '</div><div class="fx-dkb">'
    + (fxBlock.length ? '<button class="fx-go" id="fx-find"' + (n ? '' : ' disabled') + '>' + (n ? 'See ' + n + ' offer' + (n === 1 ? '' : 's') : 'No offers') + '</button>' : '')
    + '<button class="ghost" id="fx-pat">Stand pat, ' + next + '</button></div></div>';
  return h;
}

function fxCallsNow(){
  var st = fxSeason();
  var key = fxStKey(st) + '|' + JSON.stringify(st.talks || {}) + '|' + fxBlock.slice().sort().join(',') + '|' + fxPicksOn.slice().sort().join(',');
  if (!fxCallsMemo || fxCallsMemo.key !== key) fxCallsMemo = { key: key, offers: M.fxCalls(data(), st, fxBlock, fxPicksOn) };
  return fxCallsMemo.offers;
}

var FX_SORTS = [
  ['pts', 'Points', function(p){ return p.pts || 0; }],
  ['reb', 'Rebounds', function(p){ return p.reb || 0; }],
  ['ast', 'Assists', function(p){ return p.ast || 0; }],
  ['def', 'Steals + blocks', function(p){ return (p.stl || 0) + (p.blk || 0); }],
  ['mp', 'Minutes', function(p){ return p.mp || 0; }]
];
function fxFiltered(){
  var d = data();
  var stat = (FX_SORTS.filter(function(s){ return s[0] === fxSort; })[0] || FX_SORTS[0])[2];
  return fxCallsNow().filter(function(o){
    if (fxPos === 'all') return true;
    return o.ins.some(function(k){ return E.canFillSlot(d.allPlayers[k], fxPos); });
  }).map(function(o){
    var ins = o.ins.map(function(k){ return d.allPlayers[k]; });
    return { o: o, ins: ins, v: Math.max.apply(null, ins.map(stat)) };
  }).sort(function(a, b){ return b.v - a.v || a.ins.length - b.ins.length || b.o.sal - a.o.sal; });
}
function fxOfferHtml(x){
  var t = tsParts(x.o.with);
  var h = '<div class="fx-offer" data-w="' + esc(x.o.with) + '">'
    + '<div class="fo-h">' + jersey(t.code, 2) + '<span>' + esc(E.teamName(t.code)) + '</span><em>' + money(x.o.sal) + '</em></div>';
  x.ins.forEach(function(p){
    /* MINUTES ARE ON THE ROW because a stat line alone hides a man who barely
       played. Win shares are not, deliberately: knowing who was worth more
       than he was paid is the puzzle, and printing it is the answer. */
    h += '<div class="fo-p"><span class="hn">' + esc(p.n) + ' <em>' + esc(posTxt(p)) + '</em><small>'
      + esc(lineOf(p)) + ' · ' + (p.mp || 0).toFixed(0) + ' min</small></span><span class="hp">' + money(p.p) + '</span></div>';
  });
  var left = M.fxTriesLeft(fxSeason(), x.o.with);
  return h + '<div class="fo-act"><button class="ghost fo-talk" data-w="' + esc(x.o.with) + '">Counter'
    + (left < M.TRADE.PATIENCE ? ' (' + left + ' left)' : '') + '</button>'
    + '<button class="fx-go fo-take" data-w="' + esc(x.o.with) + '">Take it</button></div></div>';
}

/* THE TABLE: what you ask for from their roster, what you send, and where the
   club stands. The club counts market price, wants more than it gives on a
   proposal (that is the cost of countering), and names its price when you
   come up short. */
function fxTalkHtml(){
  var d = data(), st = fxSeason(), tk = fxTalk, t = tsParts(tk.with);
  var star = M.untouchable(d, tk.with), left = M.fxTriesLeft(st, tk.with);
  var theirs = M.fxRoster(d, tk.with), mine = M.fxRosterAt(d, st, st.win), picks = M.fxPicksLeft(st);
  var gets = tk.outs.reduce(function(s, k){ return s + d.allPlayers[k].p; }, 0)
    + tk.picks.reduce(function(s, id){ return s + M.pickValue(id); }, 0);
  var gives = tk.ins.reduce(function(s, k){ return s + d.allPlayers[k].p; }, 0);
  var tries = M.TRADE.PATIENCE - left;
  var need = tk.ins.length ? M.fxAsking(d, tk.ins, Math.min(M.TRADE.PATIENCE, tries + 1)) : 0;
  var rules = tk.ins.length && tk.outs.length ? M.fxRulesRefusal(d, st, tk.outs, tk.picks, tk.with, tk.ins) : null;
  var row = function(p, side, on, locked){
    return '<button class="tk-p' + (on ? ' on' : '') + (locked ? ' lock' : '') + '" data-side="' + side + '" data-k="' + esc(E.pkey(p)) + '"'
      + (locked ? ' disabled' : '') + '><span class="hn">' + esc(p.n) + ' <em>' + esc(posTxt(p)) + '</em><small>'
      + (locked ? 'Not for sale' : esc(lineOf(p)) + ' · ' + (p.mp || 0).toFixed(0) + ' min') + '</small></span>'
      + '<span class="hp">' + money(p.p) + (side === 'mine' ? '<small>' + p.w.toFixed(1) + ' WS</small>' : '') + '</span></button>';
  };
  var dots = '';
  for (var i = 0; i < M.TRADE.PATIENCE; i++) dots += '<i class="' + (i < left ? 'on' : '') + '"></i>';
  var h = fxHead() + fxStepper(st)
    + '<div class="tk-top">' + jersey(t.code, 3) + '<div><span class="mx-eyebrow">Talking to</span><b>' + esc(E.team(t.code).full || E.teamName(t.code)) + '</b></div>'
    + '<div class="tk-pat"><span>' + plural(left, 'proposal') + ' left</span><span class="tk-dots">' + dots + '</span></div></div>';
  if (tk.reply) h += fxReplyHtml();
  h += '<h3 class="fx-step">You ask for</h3><div class="tk-list">'
    + theirs.map(function(p){ var k = E.pkey(p); return row(p, 'theirs', tk.ins.indexOf(k) >= 0, k === star); }).join('') + '</div>'
    + '<h3 class="fx-step">You send</h3><div class="tk-list">'
    + mine.map(function(p){ return row(p, 'mine', tk.outs.indexOf(E.pkey(p)) >= 0, false); }).join('') + '</div>'
    + '<div class="fx-picks" style="margin-top:8px">' + picks.map(function(id){
        return '<button class="fx-pick' + (tk.picks.indexOf(id) >= 0 ? ' on' : '') + '" data-tpk="' + id + '">' + pickLabel(id)
          + '<small>' + money(M.pickValue(id)) + '</small></button>';
      }).join('') + '</div>';
  var short = gets < need - 1e-9;
  h += '<div class="fx-dock tk-dock"><div class="fx-dk">'
    + '<span class="mx-eyebrow">They get ' + money(gets) + ' · they give ' + money(gives) + '</span>'
    + (tk.ins.length ? '<b class="' + (short ? 'tk-short' : 'tk-ok') + '">' + (left ? 'They want at least ' + money(need) : 'Out of proposals') + '</b>' : '<b>Pick who you want from them</b>')
    + '<small>' + (rules ? esc(rules.charAt(0).toUpperCase() + rules.slice(1)) + '.' : tk.ins.length && tk.outs.length ? 'Works under the salary rules.' : 'Up to three a side.') + '</small></div>'
    + '<div class="fx-dkb"><button class="ghost" id="tk-back">Back to offers</button>'
    + '<button class="fx-go" id="tk-go"' + (left && tk.ins.length && tk.outs.length && !rules ? '' : ' disabled') + '>Propose</button></div></div>';
  return h;
}
function fxReplyHtml(){
  var d = data(), r = fxTalk.reply, t = tsParts(fxTalk.with), club = esc(E.teamName(t.code));
  if (r.verdict === 'yes') return '<div class="tk-reply yes"><b>The ' + club + ' said yes.</b>'
    + '<button class="fx-go" id="tk-deal">Make the trade</button></div>';
  if (r.verdict === 'counter') {
    var what = r.add.kind === 'pick' ? 'the ' + pickLabel(r.add.key) + ' pick' : d.allPlayers[r.add.key].n;
    return '<div class="tk-reply counter"><b>The ' + club + ' want more.</b><p>Add ' + esc(what) + ' and it\'s a deal.</p>'
      + '<button class="fx-go" id="tk-deal">Add ' + (r.add.kind === 'pick' ? 'it' : esc(surname(d.allPlayers[r.add.key].n))) + ' and make the trade</button></div>';
  }
  if (r.verdict === 'no') return '<div class="tk-reply no"><b>' + (r.hung ? 'The ' + club + ' hung up.' : 'No.') + '</b><p>'
    + (r.hung ? 'They will not call again this window.' : 'They wanted ' + money(r.need) + ' and got ' + money(r.got) + '. Nothing on your side closes it.') + '</p></div>';
  return '<div class="tk-reply no"><b>That does not work.</b><p>' + esc(r.reason.charAt(0).toUpperCase() + r.reason.slice(1)) + '.</p></div>';
}
function fxTalkOpen(withTs){
  var o = fxCallsNow().filter(function(x){ return x.with === withTs; })[0];
  fxTalk = { with: withTs, ins: o ? o.ins.slice() : [], outs: fxBlock.slice(), picks: fxPicksOn.slice(), reply: null };
  fxView = 'talk';
  fxRender();
  window.scrollTo({ top: 0 });
}
function fxTalkWire(box){
  var tk = fxTalk, st = fxSeason();
  var keepY = function(fn){ return function(){ var y = window.scrollY; fn.apply(this, arguments); tk.reply = null; fxRender(); window.scrollTo({ top: y }); }; };
  box.querySelectorAll('.tk-p[data-k]').forEach(function(b){
    b.onclick = keepY(function(){
      var k = b.getAttribute('data-k'), list = b.getAttribute('data-side') === 'theirs' ? tk.ins : tk.outs, at = list.indexOf(k);
      if (at >= 0) list.splice(at, 1); else if (list.length < 3) list.push(k);
    });
  });
  box.querySelectorAll('.fx-pick[data-tpk]').forEach(function(b){
    b.onclick = keepY(function(){ var id = b.getAttribute('data-tpk'), at = tk.picks.indexOf(id); if (at >= 0) tk.picks.splice(at, 1); else tk.picks.push(id); });
  });
  $('tk-back').onclick = function(){ fxTalk = null; fxView = 'phone'; fxRender(); };
  $('tk-go').onclick = function(){
    var r = M.fxPropose(data(), st, tk.with, tk.outs, tk.picks, tk.ins);
    r.deal = { outs: (r.outs || tk.outs).slice(), picks: (r.picks || tk.picks).slice(), ins: tk.ins.slice() };
    tk.reply = r;
    fxSaveSeason();
    fxCallsMemo = null;
    fxRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  var deal = $('tk-deal');
  if (deal) deal.onclick = function(){
    var r = tk.reply;
    fxBlock = r.deal.outs; fxPicksOn = r.deal.picks;
    fxTalk = null;
    fxAcceptAndMeasure({ with: tk.with, ins: r.deal.ins, talked: true });
  };
}

function fxPhoneHtml(){
  var d = data(), st = fxSeason(), all = fxCallsNow(), win = M.FX_WINDOWS[st.win];
  var h = fxHead() + fxStepper(st)
    + '<div class="fx-dock top"><div class="fx-dk"><span class="mx-eyebrow">' + esc(win.name) + ' · shopping ' + money(blockSal()) + '</span><b>'
    + fxBlock.map(function(k){ return esc(surname(d.allPlayers[k].n)); }).join(', ')
    + (fxPicksOn.length ? ', ' + fxPicksOn.map(pickLabel).join(', ') : '') + '</b><small>'
    + plural(all.length, 'club') + ' called with an offer.</small></div>'
    + '<button class="ghost" id="fx-back">Change</button></div>'
    + '<h3 class="fx-step">One offer from each club</h3>'
    + '<p class="mx-say" style="margin-top:0">Take it, or counter. A counter costs you: they want more than they give, and they hang up after two.</p>'
    + '<div class="fx-chips" id="fx-sorts">' + FX_SORTS.map(function(s){
        return '<button class="fx-chip' + (s[0] === fxSort ? ' on' : '') + '" data-s="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div>'
    + '<div class="fx-chips" id="fx-poss">' + ['all'].concat(E.SLOTS).map(function(s){
        return '<button class="fx-chip' + (s === fxPos ? ' on' : '') + '" data-p="' + s + '">' + (s === 'all' ? 'Any spot' : s) + '</button>';
      }).join('') + '</div>';
  var list = fxFiltered();
  h += '<div class="fx-res">' + (list.length ? list.map(fxOfferHtml).join('')
    : '<p class="fx-hint">Nothing matches. Loosen a filter.</p>') + '</div>';
  return h;
}

function fxConfirmHtml(){
  var d = data(), o = fxPending, t = tsParts(o.with), mine = tsParts(fxPuzzle().ts);
  var side = function(keys, picks){
    return keys.map(function(k){ var p = d.allPlayers[k];
      return '<b>' + esc(p.n) + '</b><span>' + money(p.p) + '</span>'; }).join('')
      + (picks || []).map(function(id){ return '<b>' + pickLabel(id) + ' pick</b><span>no salary</span>'; }).join('');
  };
  var inSal = o.ins.reduce(function(s, k){ return s + d.allPlayers[k].p; }, 0);
  return '<div class="fx-sheet" id="fx-sheet"><div class="fx-card mx-rise">'
    + '<div class="mx-eyebrow">The trade · ' + esc(M.FX_WINDOWS[fxSeason().win].name) + '</div>'
    + '<div class="fx-swap"><div><small>To ' + esc(E.teamName(t.code)) + '</small>' + side(fxBlock, fxPicksOn) + '</div>'
    + '<div class="fx-arrow">' + pix(ART.rewind, { t: '#5eead4' }, 2) + '</div>'
    + '<div><small>To ' + esc(E.teamName(mine.code)) + '</small>' + side(o.ins) + '</div></div>'
    + '<p class="mx-say">' + money(blockSal()) + ' out, ' + money(inSal) + ' in. The coach starts his best five after the deal. '
    + 'This is your trade for this window.</p>'
    + '<div class="mx-row" style="margin-top:12px"><button class="ghost" id="fx-no">Not yet</button>'
    + '<button id="fx-yes" class="fx-go">Make the trade</button></div></div></div>';
}

/* THE ODDS MOVING, played where you can see them. A thousand seasons with the
   trade in, a slice a frame, so the meter settles as they come in. */
function fxAcceptAndMeasure(offer){
  if (fxBusy) return;
  var st = fxSeason(), d = data();
  var ins = offer.ins.slice().sort(function(a, b){ return d.allPlayers[b].p - d.allPlayers[a].p; });
  var outs = fxBlock.slice().sort(function(a, b){ return d.allPlayers[b].p - d.allPlayers[a].p; });
  if (M.fxDealRefusal(d, st, outs, fxPicksOn, offer.with, ins)) return;
  var was = fxOddsNow().odds;
  M.fxDeal(d, st, outs, fxPicksOn.slice(), offer.with, ins);
  fxSaveSeason();
  /* A deal that came out of a counter or a proposal is a negotiated one. Only
     this screen knows, so the feat is written here, after the deal is legal
     and made rather than on the press. */
  if (offer.talked && P.feats) P.feats({ add: { 'fx.talk': 1 } });
  fxBlock = []; fxPicksOn = []; fxCallsMemo = null;
  fxBusy = true;
  var n = M.FX.SIMS, done = 0, titles = 0, wins = 0, box = $('s-fix');
  box.innerHTML = fxHead() + fxStepper(st) + '<div class="mx-card mx-scan fx-sim">'
    + '<div class="mx-eyebrow">Deal done · replaying history</div>'
    + '<div class="fx-big"><span id="fx-live">0%</span></div>'
    + '<div class="fx-meter"><i class="base" style="left:' + (was * 100) + '%"></i><i class="fill" id="fx-fill"></i></div>'
    + '<div class="fx-count"><span id="fx-n">0</span> of ' + n.toLocaleString() + ' seasons</div></div>'
    + '<p class="mx-say">' + fxDealLine(st.trades[st.trades.length - 1]) + '</p>';
  window.scrollTo({ top: 0 });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var chunk = reduce ? n : 40;
  function step(){
    if (!$('fx-live')) { fxBusy = false; return; }
    var to = Math.min(n, done + chunk);
    var r = M.fxSeasonOddsStep(d, st, done, to);
    titles += r.titles; wins += r.wins; done = to;
    $('fx-live').textContent = pct1(titles / done);
    $('fx-fill').style.width = (titles / done * 100) + '%';
    $('fx-n').textContent = done.toLocaleString();
    if (done < n) requestAnimationFrame(step);
    else {
      fxOddsMemo = { key: fxStKey(st), odds: titles / n, wins: wins / n };
      fxBusy = false;
      fxCloseWindow();
    }
  }
  requestAnimationFrame(step);
}

/* THE WINDOW SHUTS and the season plays to the next one, or to the end. */
function fxCloseWindow(){
  var st = fxSeason();
  M.fxNextWindow(st);
  fxSaveSeason();
  fxBlock = []; fxPicksOn = []; fxCallsMemo = null;
  fxView = 'stretch';
  fxRender();
  window.scrollTo({ top: 0 });
}

function fxStretchHtml(){
  var st = fxSeason(), d = data(), k = st.win - 1;
  var from = M.FX_WINDOWS[k].at, to = st.done ? E.CONSTANTS.REGULAR_SEASON_GAMES : M.FX_WINDOWS[st.win].at;
  var rep = M.fxSeasonReplay(d, st), w = 0, dots = '';
  for (var i = from; i < to; i++) { if (rep.games[i]) w++; dots += '<i class="' + (rep.games[i] ? 'w' : 'l') + '"></i>'; }
  var tot = fxRecordTo(st, to);
  return fxHead() + fxStepper(st)
    + '<div class="mx-card mx-scan fx-sim" style="text-align:center">'
    + '<div class="mx-eyebrow">Games ' + (from + 1) + ' to ' + to + '</div>'
    + '<div class="fx-big"><span class="to">' + w + '-' + (to - from - w) + '</span></div>'
    + '<div class="fx-dots">' + dots + '</div>'
    + '<p class="mx-say">' + tot.w + '-' + tot.l + ' on the season. Title odds <b>' + pct1(fxOddsNow().odds) + '</b>.</p></div>'
    + '<div class="mx-row" style="margin-top:12px"><button class="big fx-go" id="fx-on">'
    + (st.done ? 'Play the rest and the playoffs' : 'Open the ' + esc(M.FX_WINDOWS[st.win].name) + ' window') + '</button></div>';
}

/* THE SEASON IS OVER: the odds are the score and the replay is the story. */
function fxFinish(){
  var st = fxSeason(), d = data(), p = fxPuzzle();
  var o = fxOddsNow(), rep = M.fxSeasonReplay(d, st);
  var r = {
    v: 2, day: p.day, ts: p.ts, trades: st.trades.slice(),
    lineups: st.lineups ? JSON.parse(JSON.stringify(st.lineups)) : undefined,
    odds: o.odds, base: fxBaseOdds().odds, avgWins: o.wins,
    replay: { w: rep.wins, l: rep.losses, title: !!rep.titleWon, story: replayStory(rep) },
    at: Date.now()
  };
  r.headline = fxHeadline(r);
  if (fxEnd) {
    var s = fxEndStore();
    s.result = r; s.run = null; s.played = (s.played || 0) + 1;
    lsSet(FX_END, s);
    fxFeats(r);
  } else {
    fxKeep(p.day, r);
    fxFeats(r);
    lsDel(FX_RUN);
  }
  fxSt = null;
  fxView = 'desk';
  fxRender();
  window.scrollTo({ top: 0 });
}

/* A finished day, told to the cabinet. The streak is days in a row finished,
   read off this device's own store because only it knows which days those are;
   it merges by maximum, so a second device can only ever add to it. */
/* AN ENDLESS SEASON COUNTS FOR EVERYTHING BUT THE CALENDAR. A deal, a gain, a
   title in the replay are skill whatever puzzle they were made on. Days
   finished and days in a row are a claim about coming back each day, and a
   button that deals a new team every press would make both worthless. */
function fxFeats(r){
  var BD = window.RTF_BADGES;
  if (!BD || !P.feats) return;
  if (M.isEndless(r.day)) {
    var f = BD.fixFeats(r, 0);
    delete f.add['fx.days'];
    P.feats(f);
    return;
  }
  var days = fxStore().days, n = 0;
  for (var d = r.day; days[d]; d--) n++;
  P.feats(BD.fixFeats(r, n));
}

/* What happened in the one season everybody's moves are replayed through. */
function replayStory(run){
  var po = run.playoffs;
  if (!po || !po.rounds || !po.rounds.length) return 'Missed the playoffs.';
  if (po.won) return 'Won the title.';
  var last = po.rounds[po.rounds.length - 1];
  return 'Lost in the ' + last.round + ', ' + last.yourWins + '-' + last.oppWins + '.';
}

function names(keys){
  var d = data();
  return keys.map(function(k){ var p = d.allPlayers[k]; return p ? surname(p.n) : '?'; });
}
function andList(a){ return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
function fxDealLine(t){
  var d = data(), inn = d.allPlayers[t.ins[0]];
  var club = t.with ? E.teamName(tsParts(t.with).code) : inn ? shortClub(inn.t, inn.s) : '';
  var sent = names(t.outs).concat((t.picks || []).map(function(id){ return pickLabel(id) + ' pick'; }));
  return '<b>' + esc(andList(sent)) + '</b> to the ' + esc(club) + ' for <b>' + esc(andList(names(t.ins))) + '</b>.';
}

/* The roster a finished result played its last stretch with. */
function fxResultRoster(r){
  var d = data(), p = fxPuzzle();
  if (r.legacy) {
    var five = M.fxApply(p.five, r.slot, d.allPlayers[r.inKey]);
    return { rows: five, five: five };
  }
  var st = { day: r.day, ts: r.ts, win: M.FX_WINDOWS.length, trades: r.trades, lineups: r.lineups, done: true };
  var last = M.FX_WINDOWS.length - 1;
  return { rows: M.fxRosterAt(d, st, last), five: M.fxLineupAt(d, st, last) };
}
/* The dearest man taken back all season: the headline of the moves, and the
   one the board counts who else traded for. */
function fxHeadline(r){
  var d = data(), best = null;
  r.trades.forEach(function(t){ t.ins.forEach(function(k){ var p = d.allPlayers[k];
    if (p && (!best || p.p > d.allPlayers[best].p)) best = k; }); });
  return best;
}

function fxDoneHtml(r){
  var delta = Math.round((r.odds - r.base) * 1000) / 10;
  var up = delta > 0, ro = fxResultRoster(r), acq = {};
  r.trades.forEach(function(t){ t.ins.forEach(function(k){ acq[k] = 1; }); });
  var log = r.trades.length ? r.trades.map(function(t){
    return '<div class="fx-log"><span class="mx-eyebrow">' + esc((M.FX_WINDOWS[t.w] || M.FX_WINDOWS[0]).name) + '</span><p>' + fxDealLine(t) + '</p></div>';
  }).join('') : '<p class="mx-say">You stood pat all season.</p>';
  return fxHead()
    + '<div class="mx-card mx-scan fx-sim" style="text-align:center">'
    + '<div class="mx-eyebrow">Title odds</div>'
    + '<div class="fx-big"><span class="was">' + pct1(r.base) + '</span><span class="to">' + pct1(r.odds) + '</span></div>'
    + '<div class="fx-meter"><i class="base" style="left:' + (r.base * 100) + '%"></i><i class="fill" style="width:' + (r.odds * 100) + '%"></i></div>'
    + '<div class="fx-delta ' + (up ? 'up' : delta < 0 ? 'dn' : '') + '">' + (up ? '+' : '') + delta.toFixed(1) + ' points</div>'
    + '<div class="fx-replay"><span class="mx-eyebrow">The replay</span><b class="mx-num">' + r.replay.w + '-' + r.replay.l + '</b>'
    + '<span>' + esc(r.replay.story) + (r.replay.title ? ' 🏆' : '') + '</span></div>'
    + '<div id="fx-place" class="fx-place"></div></div>'
    + '<h3 class="fx-step">Your moves</h3>' + log
    + '<h3 class="fx-step">The team that finished the season</h3>'
    + fxRosterHtml(ro.rows, ro.five, { inn: acq })
    + (fxEnd
      ? (endlessOpen() ? '<div class="mx-row" style="margin-top:12px"><button class="big fx-go" id="fx-next">Next team</button></div>' : '')
        + '<div class="mx-row" style="margin-top:8px"><button class="' + (endlessOpen() ? 'ghost' : 'big fx-go') + '" id="fx-share">'
        + (fxPuzzle().custom ? 'Send it to a friend' : 'Share') + '</button></div>'
        + '<p class="fx-hint" style="text-align:center">' + (fxPuzzle().custom ? 'The link gives them this team and these calls.' : 'Endless. Off the leaderboard.') + '</p>'
      : '<div class="mx-row" style="margin-top:12px"><button class="big fx-go" id="fx-share">Share</button></div>'
        + '<div class="mx-row" style="margin-top:8px"><button class="ghost" id="fx-board">Today\'s leaderboard</button></div>'
        + endlessDoor('fx-endless', 'Play another team')
        + '<p class="fx-hint" style="text-align:center">A new team tomorrow.</p>');
}

/* The way into endless play from a finished daily. A reader who cannot open it
   is told why rather than shown a button that does nothing; while PRO_LIVE is
   false nobody is that reader. */
function endlessDoor(id, label){
  return '<div class="mx-row" style="margin-top:8px"><button class="ghost" id="' + id + '">' + label
    + (endlessOpen() ? '' : ' <span class="pro-tag">Pro</span>') + '</button></div>';
}

function fxShareText(r){
  var t = tsParts(r.ts);
  var delta = Math.round((r.odds - r.base) * 1000) / 10;
  var bars = Math.max(0, Math.min(10, Math.round(r.odds * 10)));
  var meter = '';
  for (var i = 0; i < 10; i++) meter += i < bars ? '🟩' : '⬛';
  var moves = r.trades.map(function(tr){ return names(tr.outs).join(', ') + ' ➡️ ' + names(tr.ins).join(', '); });
  return 'Run The Floor · Fix History ' + (M.isEndless(r.day) ? (fxPuzzle().custom ? 'Custom' : 'Endless') : '#' + r.day) + '\n'
    + t.name + '\n'
    + (moves.length ? moves.join('\n') : 'Stood pat') + '\n'
    + meter + ' ' + pct1(r.odds) + ' (' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + ')\n'
    + (r.replay.title ? '🏆 Won it in the replay\n' : '')
    + 'Four windows. Can you fix it better?\n' + (fxPuzzle().custom ? linkTo('fix=' + r.ts) : P.SHARE_URL);
}

function fxRender(){
  var box = $('s-fix');
  if (!box || !data()) return;
  if (fxPicking) { fxPickRender(box); return; }
  var p = fxPuzzle(), r = fxEnd ? fxEndResult(p) : fxResult(p.day);
  P.bar('Fix History · ' + fxLabel(p));
  if (r) {
    box.innerHTML = fxDoneHtml(r);
    $('fx-share').onclick = function(){ share(fxShareText(r)); };
    if (fxEnd) {
      var nx = $('fx-next'); if (nx) nx.onclick = function(){ fxEndNew(); fx = null; fxRender(); window.scrollTo({ top: 0 }); };
      return;
    }
    $('fx-board').onclick = function(){ openModeBoard('fix'); };
    var en = $('fx-endless'); if (en) en.onclick = fxOpenEndless;
    fxSubmit(r).then(function(){ fxFillPlace(r); });
    return;
  }
  var st = fxSeason();
  if (fxView === 'stretch' && st.win > 0) {
    box.innerHTML = fxStretchHtml();
    $('fx-on').onclick = function(){
      if (st.done) { fxFinish(); return; }
      fxView = 'desk'; fxRender(); window.scrollTo({ top: 0 });
    };
    return;
  }
  if (st.done) { fxFinish(); return; }
  if (fxView === 'talk' && fxTalk) {
    box.innerHTML = fxTalkHtml();
    fxTalkWire(box);
    return;
  }
  if (fxView === 'phone' && fxBlock.length) {
    box.innerHTML = fxPhoneHtml() + (fxPending ? fxConfirmHtml() : '');
    box.querySelectorAll('.fo-take').forEach(function(b){
      b.onclick = function(){
        var w = b.getAttribute('data-w');
        fxPending = fxCallsNow().filter(function(o){ return o.with === w; })[0] || null;
        fxRender();
      };
    });
    box.querySelectorAll('.fo-talk').forEach(function(b){
      b.onclick = function(){ fxTalkOpen(b.getAttribute('data-w')); };
    });
    box.querySelectorAll('#fx-sorts .fx-chip').forEach(function(b){
      b.onclick = function(){ fxSort = b.getAttribute('data-s'); fxRender(); };
    });
    box.querySelectorAll('#fx-poss .fx-chip').forEach(function(b){
      b.onclick = function(){ fxPos = b.getAttribute('data-p'); fxRender(); };
    });
    $('fx-back').onclick = function(){ fxView = 'desk'; fxPending = null; fxRender(); };
    if (fxPending) {
      $('fx-no').onclick = function(){ fxPending = null; fxRender(); };
      $('fx-yes').onclick = function(){ var x = fxPending; fxPending = null; fxAcceptAndMeasure(x); };
      $('fx-sheet').onclick = function(ev){ if (ev.target === $('fx-sheet')) { fxPending = null; fxRender(); } };
    }
    return;
  }
  fxView = 'desk';
  box.innerHTML = fxDeskHtml();
  var keepY = function(fn){ return function(){ var y = window.scrollY; fn.apply(this, arguments); fxRender(); window.scrollTo({ top: y }); }; };
  box.querySelectorAll('.fx-man[data-k]').forEach(function(b){
    var tap = keepY(function(){
      var k = b.getAttribute('data-k'), at = fxBlock.indexOf(k);
      if (at >= 0) fxBlock.splice(at, 1);
      else if (fxBlock.length < M.TRADE.MAX_OUT) fxBlock.push(k);
    });
    /* The spot label is the drag handle, and its own press is handled on
       pointerup, so a click that lands on it is never also a trade. */
    b.onclick = function(ev){ if (ev.target.closest('[data-grip]')) return; tap(); };
  });
  fxWireDrag(box, keepY);
  var coachBtn = $('fx-coach');
  if (coachBtn) coachBtn.onclick = keepY(function(){
    var st2 = fxSeason();
    M.fxSetLineup(data(), st2, M.fxLineup(M.fxRosterAt(data(), st2, st2.win)).map(E.pkey));
    fxSwapFrom = null; fxSaveSeason();
  });
  box.querySelectorAll('.fx-pick[data-pk]').forEach(function(b){
    b.onclick = keepY(function(){
      var id = b.getAttribute('data-pk'), at = fxPicksOn.indexOf(id);
      if (at >= 0) fxPicksOn.splice(at, 1); else fxPicksOn.push(id);
    });
  });
  var find = $('fx-find');
  if (find) find.onclick = function(){ fxView = 'phone'; fxSort = 'pts'; fxPos = 'all'; fxRender(); window.scrollTo({ top: 0 }); };
  $('fx-pat').onclick = function(){ fxCloseWindow(); };
}

/* ── PICK ANY TEAM ─────────────────────────────────────────────────────────
   Pro. A club, then a season, then the same four windows. Any team whose best
   nine can field the five positions, which is 1,385 of them, champions too. */
var fxPicking = false, fxPickClub = '', fxPickTs = '';
var fxClubMemo = null;
function fxClubs(){
  if (fxClubMemo) return fxClubMemo;
  var by = {};
  M.fxTeams(data()).forEach(function(ts){
    var t = tsParts(ts);
    (by[t.code] = by[t.code] || []).push(ts);
  });
  fxClubMemo = Object.keys(by).map(function(code){
    var yrs = by[code].map(function(ts){ return tsParts(ts).season; });
    var lo = Math.min.apply(null, yrs), hi = Math.max.apply(null, yrs);
    return { code: code, name: E.team(code).full || E.teamName(code), yrs: lo === hi ? String(lo) : lo + '-' + hi,
      seasons: by[code].sort().reverse() };
  }).sort(function(a, b){ return a.name < b.name ? -1 : a.name > b.name ? 1 : a.yrs < b.yrs ? -1 : 1; });
  return fxClubMemo;
}
function fxPickHtml(){
  var clubs = fxClubs(), club = null;
  clubs.forEach(function(c){ if (c.code === fxPickClub) club = c; });
  var h = '<div class="cq-head">' + pix(ART.rewind, { t: '#5eead4' }, 3)
    + '<div><div class="mh fx-mh">Fix History</div><div class="cq-rung">Pick any team</div></div></div>'
    + '<p class="mx-say">Any club. Any year. Four trade windows to win them the title. Off the leaderboard.</p>'
    + '<label class="fx-lab" for="fx-pclub">Club</label><select class="fx-q fx-sel" id="fx-pclub"><option value="">Pick a club</option>'
    + clubs.map(function(c){ return '<option value="' + esc(c.code) + '"' + (c.code === fxPickClub ? ' selected' : '') + '>' + esc(c.name + ' (' + c.yrs + ')') + '</option>'; }).join('')
    + '</select>';
  if (club) {
    h += '<label class="fx-lab" for="fx-pyr">Season</label><select class="fx-q fx-sel" id="fx-pyr"><option value="">Pick a season</option>'
      + club.seasons.map(function(ts){ var t = tsParts(ts); return '<option value="' + esc(ts) + '"' + (ts === fxPickTs ? ' selected' : '') + '>'
        + t.season + (E.wonTitle(t.code, t.season) ? ' · champions' : '') + '</option>'; }).join('')
      + '</select>';
  }
  if (fxPickTs) {
    var five = M.startingFive(data(), fxPickTs);
    h += '<div style="margin-top:14px">' + fxBanner(fxPickTs) + '</div>'
      + '<p class="mx-say">' + esc(five.map(function(p){ return p.n; }).join(', ')) + '.</p>'
      + '<div class="mx-row" style="margin-top:12px"><button class="big fx-go" id="fx-pgo">Rebuild them</button></div>'
      + '<div class="mx-row" style="margin-top:8px"><button class="ghost" id="fx-psend">Send it to a friend</button></div>';
  }
  return h + '<div class="mx-row" style="margin-top:8px"><button class="ghost" id="fx-pback">Back</button></div>';
}
function fxPickRender(box){
  P.bar('Fix History · Pick a team');
  box.innerHTML = fxPickHtml();
  $('fx-pclub').onchange = function(){ fxPickClub = this.value; fxPickTs = ''; fxRender(); };
  var yr = $('fx-pyr'); if (yr) yr.onchange = function(){ fxPickTs = this.value; fxRender(); };
  var go = $('fx-pgo'); if (go) go.onclick = function(){ fxPlayPicked(fxPickTs); };
  var sd = $('fx-psend'); if (sd) sd.onclick = function(){
    share('Run The Floor · Fix History\nRebuild the ' + tsParts(fxPickTs).name + '.\nFour trade windows. Can you win them the title?\n' + linkTo('fix=' + fxPickTs));
  };
  $('fx-pback').onclick = function(){ fxPicking = false; P.goHome(); };
}
function fxOpenPicker(){
  if (!data()) return;
  if (!endlessOpen()) { openPro('build'); return; }
  fxEnd = true; fxPicking = true;
  P.show('s-fix');
  fxRender();
  window.scrollTo({ top: 0 });
}
/* A picked team, played. Also the door a friend's link opens, which is why it
   asks nothing about Pro: whoever made the link paid for the picking. */
function fxPlayPicked(ts){
  if (!data() || !fxEndPick(ts)) return false;
  fxEnd = true; fxPicking = false; fx = null;
  fxEnter();
  window.scrollTo({ top: 0 });
  return true;
}

function fxEndResult(p){
  var s = fxEndStore();
  return s.result && s.result.day === p.day ? fxNorm(s.result) : null;
}
function fxOpenEndless(){
  if (!data()) return;
  if (!endlessOpen()) { openPro('endless'); return; }
  var s = fxEndStore();
  if (s.ts && s.result) fxEndNew();   // a finished picked team is done; endless deals the next
  fxEnd = true; fxPicking = false;
  fxEnter();
}
function fxOpen(){
  if (!data()) return;
  fxEnd = false; fxPicking = false;
  fxEnter();
}
function fxEnter(){
  fxPending = null;
  if (fxView === 'phone' || fxView === 'talk') fxView = 'desk';
  fxTalk = null;
  P.show('s-fix');
  fxRender();
}

// ═══ SIX PASSES ═════════════════════════════════════════════════════════════

var PS_KEY = 'rtf.passes.v1';        // { days: { [day]: { chain:[ids], done, solved } } }
var psG = null;                      // the teammate graph, built on first use
var psPz = null;                     // today's puzzle
var psFilter = '';
/* Endless, the same shape as Fix History's: its own key, and `psEnd` is which
   puzzle the screen is on. The puzzle is stored whole rather than rebuilt,
   because a draw can come back empty and redraw, and a reload has to land on
   the chain it left. */
var PS_END = 'rtf.passes.endless.v1'; // { pz, st, recent:[from>to], played }
var psEnd = false;
var psDayPz = null;

function graph(){ if (!psG) psG = M.psGraph(data()); return psG; }
function psToday(){
  var d = today();
  if (!psDayPz || psDayPz.day !== d) psDayPz = M.psDaily(graph(), d);
  return psDayPz;
}
function psEndStore(){ return lsGet(PS_END) || { pz: null, st: null, recent: [], played: 0 }; }
function psEndNew(){
  var s = psEndStore(), t = psToday();
  var pz = M.psEndless(graph(), Math.random, (s.recent || []).concat([t.from + '>' + t.to]));
  s.pz = pz; s.st = null;
  s.recent = (s.recent || []).concat([pz.from + '>' + pz.to]).slice(-60);
  lsSet(PS_END, s);
  return s;
}
function psEndPick(from, to){
  var pz = M.psCustom(graph(), from, to);
  if (!pz) return false;
  var s = psEndStore();
  if (!s.pz || s.pz.day !== pz.day) {
    s.pz = pz; s.st = null;
    s.recent = (s.recent || []).concat([pz.from + '>' + pz.to]).slice(-60);
    lsSet(PS_END, s);
  }
  return true;
}
function psPuzzle(){
  if (!psEnd) return psToday();
  var s = psEndStore();
  if (!s.pz) s = psEndNew();
  if (!psPz || psPz.day !== s.pz.day) psPz = s.pz;
  return psPz;
}
function psStore(){ return lsGet(PS_KEY) || { days: {} }; }
function psState(){
  var pz = psPuzzle(), s = psEnd ? psEndStore().st : psStore().days[pz.day];
  return s || { chain: [pz.from], done: false, solved: false };
}
/* Today's chain, always: the front page asking. */
function psTodayState(){
  var pz = psToday(), s = psStore().days[pz.day];
  return s || { chain: [pz.from], done: false, solved: false };
}
function psKeep(st){
  if (psEnd) {
    var e = psEndStore();
    if (!e.pz || e.pz.day !== psPuzzle().day) return;
    if (st.done && !(e.st && e.st.done)) e.played = (e.played || 0) + 1;
    e.st = st;
    lsSet(PS_END, e);
    return;
  }
  var s = psStore(), pz = psPuzzle();
  s.days[pz.day] = st;
  var keys = Object.keys(s.days).map(Number).sort(function(a, b){ return a - b; });
  while (keys.length > 30) delete s.days[keys.shift()];
  lsSet(PS_KEY, s);
}
function psStreak(){
  var days = psStore().days, d = today(), n = 0;
  if (!(days[d] && days[d].done)) d--;
  while (days[d] && days[d].done && days[d].solved) { n++; d--; }
  return n;
}
function passesOf(st){ return st.chain.length - 1; }
function spanTxt(id){ var sp = graph().span[id]; return sp[0] === sp[1] ? String(sp[0]) : sp[0] + '-' + sp[1]; }

/* THE TIMELINE: 1974 to today, each man a point at the middle of his career,
   each pass an arc between two of them. It is the picture of what the puzzle
   is, which is moving the ball through time, and it is drawn from the chain
   rather than stored, so a reload draws the same flight. */
function psTimeline(st){
  var g = graph(), pz = psPuzzle();
  var yrs = data().teamSeasons.map(function(t){ return t.season; });
  var y0 = Math.min.apply(null, yrs), y1 = Math.max.apply(null, yrs);
  var W = 340, H = 104, pad = 14, base = 84;
  var X = function(y){ return pad + (y - y0) / (y1 - y0) * (W - pad * 2); };
  var mid = function(id){ var sp = g.span[id]; return (sp[0] + sp[1]) / 2; };
  var h = '<svg class="ps-tl" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">';
  var tsp = g.span[pz.to];
  h += '<rect x="' + X(tsp[0]) + '" y="' + (base - 6) + '" width="' + Math.max(3, X(tsp[1]) - X(tsp[0])) + '" height="12" rx="3" fill="rgba(242,193,78,.28)"/>';
  h += '<line x1="' + pad + '" y1="' + base + '" x2="' + (W - pad) + '" y2="' + base + '" stroke="rgba(255,255,255,.25)" stroke-width="2"/>';
  for (var y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) {
    h += '<line x1="' + X(y) + '" y1="' + (base - 4) + '" x2="' + X(y) + '" y2="' + (base + 4) + '" stroke="rgba(255,255,255,.35)"/>'
      + '<text x="' + X(y) + '" y="' + (base + 16) + '" text-anchor="middle" class="ps-yr">' + y + '</text>';
  }
  for (var i = 1; i < st.chain.length; i++) {
    var a = X(mid(st.chain[i - 1])), b = X(mid(st.chain[i]));
    var peak = base - 18 - Math.min(52, Math.abs(b - a) * 0.45);
    h += '<path class="ps-arc" style="animation-delay:' + (i === st.chain.length - 1 ? 0 : -1) + 's" d="M' + a + ' ' + base
      + ' Q' + ((a + b) / 2) + ' ' + peak + ' ' + b + ' ' + base + '" fill="none" stroke="#f2c14e" stroke-width="2.5" stroke-dasharray="4 4"/>';
  }
  st.chain.forEach(function(id, i){
    h += '<circle cx="' + X(mid(id)) + '" cy="' + base + '" r="' + (i === 0 ? 5 : 4) + '" fill="' + (i === 0 ? '#fff' : '#f2c14e') + '" stroke="#05060b" stroke-width="2"/>';
  });
  /* The hoop at the target's career, drawn in the same pixels as the icon:
     a stanchion, a backboard with its square, the rim and the net. */
  var tx = X(mid(pz.to));
  h += '<g class="ps-hoop" transform="translate(' + (tx - 8) + ',' + (base - 40) + ')" shape-rendering="crispEdges">'
    + '<rect x="7" y="10" width="2" height="30" fill="#8a93a6"/>'
    + '<rect x="0" y="0" width="16" height="10" fill="#f5f5f5"/>'
    + '<rect x="1" y="1" width="14" height="8" fill="#dfe6f0"/>'
    + '<rect x="5" y="3" width="6" height="1" fill="#ef4444"/><rect x="5" y="3" width="1" height="5" fill="#ef4444"/>'
    + '<rect x="10" y="3" width="1" height="5" fill="#ef4444"/>'
    + '<rect x="3" y="10" width="10" height="2" fill="#f97316"/>'
    + '<path d="M4 12 L6 19 M8 12 L8 19 M12 12 L10 19 M6 15 L10 15 M6 19 L10 19" stroke="#e2e8f0" stroke-width="1" fill="none"/>'
    + '</g>';
  var hx = X(mid(st.chain[st.chain.length - 1]));
  h += '</svg><img class="ps-ball pxball" src="mark.png?v=1" width="22" height="22" alt="" style="left:calc('
    + (hx / W * 100) + '% - 11px)">';
  return '<div class="ps-tlw">' + h + '</div>';
}

function psClock(n){
  var left = M.PS.CLOCK - n;
  return '<div class="ps-clock' + (left <= 3 ? ' low' : '') + '"><span class="mx-eyebrow">Shot clock</span><b>'
    + (left < 10 ? '0' : '') + left + '</b></div>';
}

function psEnds(st, tl){
  var g = graph(), pz = psPuzzle();
  /* Once the ball is there the left card is where it started, or both cards
     would name the same man. The portraits are the two ends of the puzzle and
     never move, so the left one is always the man who started with it. */
  var holder = st.done ? pz.from : st.chain[st.chain.length - 1];
  /* ONE GRID, TWO SHAPES. A phone puts the two ends side by side with the hoop
     between them and the timeline under both. A desktop puts the timeline
     BETWEEN the two ends, which is the picture the puzzle is: one career on
     the left, one on the right, and the passes that join them. */
  return '<div class="ps-top"><div class="ps-end"><div class="ps-pic">' + portrait(pz.from, 3, -1) + '</div><span class="mx-eyebrow">'
    + (st.done ? 'Started with' : st.chain.length === 1 ? 'Starts with the ball' : 'Has the ball') + '</span><b>'
    + esc(g.nameOf[holder]) + '</b><small>' + spanTxt(holder) + '</small></div>'
    + '<div class="ps-to">' + pix(ART.hoop, HOOP_PAL, 3) + '</div>'
    + tl
    + '<div class="ps-end tgt"><div class="ps-pic">' + portrait(pz.to, 3, 1) + '</div><span class="mx-eyebrow">Get it to</span><b>' + esc(g.nameOf[pz.to])
    + '</b><small>' + spanTxt(pz.to) + '</small></div></div>';
}

function psChainHtml(st){
  var g = graph();
  if (st.chain.length < 2) return '';
  var h = '<div class="ps-chain">';
  for (var i = 1; i < st.chain.length; i++) {
    var shared = M.psShared(g, st.chain[i - 1], st.chain[i]);
    var t = tsParts(shared[shared.length - 1]);
    h += '<div class="ps-link"><span class="pn">' + i + '</span><span>' + esc(surname(g.nameOf[st.chain[i - 1]]))
      + ' <i>to</i> <b>' + esc(g.nameOf[st.chain[i]]) + '</b></span><em>' + esc(t.short) + '</em></div>';
  }
  return h + '</div>';
}

/* WHO THE MAN WITH THE BALL CAN PASS TO, grouped by STINT rather than by
   season. By season, a ten year career repeats the same locker room ten times
   and Reggie Theus's picker ran to 9,900 pixels. A stint is a run of seasons
   with one club, each teammate is listed once inside it, and the ten best known
   show first with the rest a tap away. A filter searches all of them. */
var psOpenStints = {};
function psStints(holder){
  var g = graph();
  var seasons = (g.seasonsOf[holder] || []).map(function(ts){ return tsParts(ts); })
    .sort(function(a, b){ return a.season - b.season; });
  var out = [];
  seasons.forEach(function(t){
    var last = out[out.length - 1];
    if (last && last.code === t.code && t.season === last.to + 1) { last.to = t.season; last.ts.push(t.code + '_' + t.season); }
    else out.push({ code: t.code, from: t.season, to: t.season, ts: [t.code + '_' + t.season] });
  });
  return out;
}
function psPickerHtml(st){
  var g = graph(), holder = st.chain[st.chain.length - 1], f = fold(psFilter.trim());
  var used = {};
  st.chain.forEach(function(id){ used[id] = 1; });
  var h = '', shown = 0;
  psStints(holder).forEach(function(stint){
    var seen = {}, mates = [];
    stint.ts.forEach(function(ts){
      (g.clubs[ts] || []).forEach(function(id){
        if (id === holder || seen[id]) return;
        seen[id] = 1;
        if (!f || fold(g.nameOf[id]).indexOf(f) >= 0) mates.push(id);
      });
    });
    if (!mates.length) return;
    mates.sort(function(a, b){ return g.careerWs[b] - g.careerWs[a]; });
    var key = stint.code + stint.from, open = f || psOpenStints[key] || mates.length <= 12;
    var list = open ? mates : mates.slice(0, 10);
    var skin = E.clubSkin(stint.code);
    var yrs = stint.from === stint.to ? String(stint.from) : stint.from + '-' + String(stint.to).slice(-2);
    h += '<div class="ps-grp"><div class="ps-gh" style="--c-acc:' + skin.accent + '">' + jersey(stint.code, 2)
      + '<span>' + esc(E.teamName(stint.code)) + ' <em>' + yrs + '</em></span></div><div class="ps-mates">';
    list.forEach(function(id){
      shown++;
      h += '<button class="ps-mate' + (used[id] ? ' used' : '') + (id === psPuzzle().to ? ' tgt' : '') + '" data-id="' + esc(id) + '"'
        + (used[id] ? ' disabled' : '') + '>' + esc(g.nameOf[id]) + '<small>' + spanTxt(id) + '</small></button>';
    });
    if (!open) h += '<button class="ps-more" data-stint="' + esc(key) + '">+' + (mates.length - 10) + ' more</button>';
    h += '</div></div>';
  });
  if (!shown) h = '<p class="fx-hint">Nobody by that name played with him.</p>';
  return h;
}

function psPass(to){
  var g = graph(), pz = psPuzzle(), st = psState();
  if (st.done) return;
  var holder = st.chain[st.chain.length - 1];
  if (!M.psCanPass(g, holder, to) || st.chain.indexOf(to) >= 0) return;
  st.chain.push(to);
  if (to === pz.to) { st.done = true; st.solved = true; }
  else if (passesOf(st) >= M.PS.CLOCK) { st.done = true; st.solved = false; }
  st.at = Date.now();
  psKeep(st);
  psFilter = '';
  psOpenStints = {};
  if (st.done) { if (!psEnd) psSubmit(pz, st); psFeats(pz, st); }
  psRender(true);
  if (st.solved && P.confetti) P.confetti();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* A finished chain, told to the cabinet once. The streak is days in a row
   solved, off this device's store. */
function psFeats(pz, st){
  var BD = window.RTF_BADGES;
  if (!BD || !P.feats || st.featsFiled) return;
  var days = psStore().days, n = 0;
  /* Endless counts every chain and no streak: see fxFeats. */
  if (!M.isEndless(pz.day)) for (var d = pz.day; days[d] && days[d].solved; d--) n++;
  P.feats(BD.passesFeats(!!st.solved, passesOf(st), pz.par, M.PS.CLOCK, n));
  st.featsFiled = true;
  psKeep(st);
}

function psVerdict(st){
  var over = passesOf(st) - psPuzzle().par;
  if (!st.solved) return 'Shot clock violation';
  return over <= 0 ? 'Perfect pass' : over === 1 ? 'One extra pass' : over === 2 ? 'Worked for it' : 'Got it there';
}

/* THE PASSING LANE. A finished chain is drawn as the ball going hand to hand:
   every man who touched it, in order, with the club and season that joined
   each pair written on the pass between them. */
function psLane(st){
  var g = graph(), h = '<div class="ps-lane">';
  st.chain.forEach(function(id, i){
    if (i) {
      var shared = M.psShared(g, st.chain[i - 1], id);
      h += '<div class="ps-arrow"><span>' + esc(tsParts(shared[shared.length - 1]).short) + '</span><i></i></div>';
    }
    var last = i === st.chain.length - 1;
    h += '<div class="ps-hop' + (i === 0 ? ' first' : '') + (last && st.solved ? ' last' : '') + '"><div class="ps-lp">'
      + portrait(id, 2, last ? 1 : -1) + '</div><b>' + esc(surname(g.nameOf[id])) + '</b></div>';
  });
  return h + '</div>';
}

function psDoneHtml(st){
  var g = graph(), pz = psPuzzle(), n = passesOf(st), over = n - pz.par;
  var best = M.psPath(g, pz.from, pz.to);
  var bestHtml = best.map(function(id){ return esc(surname(g.nameOf[id])); }).join(' <i>to</i> ');
  var head = !st.solved ? 'Shot clock' : over <= 0 ? 'Bucket!' : over === 1 ? 'And one!' : 'Scored';
  var stars = '';
  if (st.solved) for (var i = 0; i < 3; i++) stars += '<span class="' + (i < 3 - Math.min(3, Math.max(0, over)) ? 'on' : '') + '">★</span>';
  return '<div class="mx-card ps-done mx-rise ' + (st.solved ? 'win' : 'miss') + '">'
    + '<div class="ps-done-top"><div class="ps-verdict"><div class="mx-eyebrow">' + esc(psVerdict(st)) + '</div>'
    + '<div class="ps-head">' + head + '</div>'
    + (st.solved ? '<div class="ps-stars" aria-label="' + Math.max(0, 3 - Math.max(0, over)) + ' of 3">' + stars + '</div>' : '')
    + '</div><div class="ps-score"><b>' + (st.solved ? n : 'X') + '</b><span>'
    + (st.solved ? (n === 1 ? 'pass' : 'passes') + ' · par ' + pz.par : 'Never got there') + '</span></div></div>'
    + psLane(st)
    + '<p class="mx-say ps-best">' + (st.solved && over <= 0 ? 'No shorter way exists.' : 'A shortest chain: ' + bestHtml + '.') + '</p>'
    + (psEnd ? '' : '<div id="ps-place" class="fx-place"></div>')
    + '<div class="ps-acts">'
    + (psEnd
      ? (endlessOpen() ? '<button class="big ps-go" id="ps-next">Next puzzle</button>' : '')
        + '<button class="' + (endlessOpen() ? 'ghost' : 'big ps-go') + '" id="ps-share">'
        + (pz.custom ? 'Send it to a friend' : 'Share') + '</button>'
      : '<button class="big ps-go" id="ps-share">Share</button>'
        + '<button class="ghost" id="ps-board">Today\'s leaderboard</button>')
    + '</div>'
    + (psEnd
      ? '<p class="fx-hint" style="text-align:center">' + (pz.custom ? 'The link gives them the same two players.' : 'Endless. Off the leaderboard.') + '</p>'
      : endlessDoor('ps-endless', 'Play another puzzle') + '<p class="fx-hint" style="text-align:center">A new puzzle tomorrow.</p>')
    + '</div>';
}

function psShareText(st){
  var g = graph(), pz = psPuzzle(), n = passesOf(st);
  var line = '🏀';
  for (var i = 0; i < n - (st.solved ? 1 : 0); i++) line += '➡️';
  line += st.solved ? '🎯' : '❌';
  return 'Run The Floor · Six Passes ' + (M.isEndless(pz.day) ? (pz.custom ? 'Custom' : 'Endless') : '#' + pz.day) + '\n'
    + surname(g.nameOf[pz.from]) + ' to ' + surname(g.nameOf[pz.to]) + '\n'
    + line + ' ' + (st.solved ? plural(n, 'pass', 'passes') + ' (par ' + pz.par + ')' : 'shot clock') + '\n'
    + 'Real teammates only. Can you do it in fewer?\n' + (pz.custom ? linkTo('pass=' + pz.from + '.' + pz.to) : P.SHARE_URL);
}

function psRender(animate){
  var box = $('s-pass');
  if (!box || !data()) return;
  if (psPicking) { psPickRender(box); return; }
  var pz = psPuzzle(), st = psState(), g = graph(), streak = psEnd ? 0 : psStreak();
  P.bar('Six Passes · ' + psLabel(pz));
  var holder = st.chain[st.chain.length - 1];
  var h = '<div class="cq-head">' + pix(ART.hoop, HOOP_PAL, 3)
    + '<div><div class="mh ps-mh">Six Passes</div><div class="cq-rung">' + psLabel(pz) + ' · Par ' + pz.par
    + (streak > 1 ? ' · ' + streak + ' days in a row' : '') + '</div></div>'
    + (st.done ? '' : psClock(passesOf(st))) + '</div>'
    + (st.done ? psDoneHtml(st) : '')
    + psEnds(st, psTimeline(st).replace('ps-tlw', 'ps-tlw' + (animate ? ' fresh' : '')))
    + (st.done ? '' : psChainHtml(st));
  if (!st.done) {
    h += '<h3 class="fx-step">' + (st.chain.length === 1 ? 'Who does ' : 'Now who does ') + esc(surname(g.nameOf[holder]))
      + ' pass to?</h3><p class="mx-say" style="margin-top:0">Anybody he played with, same team, same season. Every pass is final.</p>'
      + '<input class="fx-q ps-q" id="ps-q" type="search" autocomplete="off" spellcheck="false" placeholder="Filter his teammates" value="' + esc(psFilter) + '">'
      + '<div id="ps-pick" class="ps-pick">' + psPickerHtml(st) + '</div>';
  }
  box.innerHTML = h;
  var wire = function(){
    box.querySelectorAll('.ps-mate[data-id]').forEach(function(b){
      b.onclick = function(){ psPass(b.getAttribute('data-id')); };
    });
    box.querySelectorAll('.ps-more').forEach(function(b){
      b.onclick = function(){
        psOpenStints[b.getAttribute('data-stint')] = 1;
        $('ps-pick').innerHTML = psPickerHtml(psState());
        wire();
      };
    });
  };
  wire();
  var q = $('ps-q');
  if (q) q.oninput = function(){ psFilter = q.value; $('ps-pick').innerHTML = psPickerHtml(psState()); wire(); };
  var sh = $('ps-share'); if (sh) sh.onclick = function(){ share(psShareText(st)); };
  var bd = $('ps-board'); if (bd) bd.onclick = function(){ openModeBoard('passes'); };
  var nx = $('ps-next'); if (nx) nx.onclick = function(){ psEndNew(); psPz = null; psFilter = ''; psOpenStints = {}; psRender(false); window.scrollTo({ top: 0 }); };
  var en = $('ps-endless'); if (en) en.onclick = psOpenEndless;
  if (st.done && !psEnd) psPlace(pz, st);
}

function psLabel(pz){ return !psEnd ? 'Day ' + pz.day : pz.custom ? 'Custom' : 'Endless'; }

/* ── MAKE A PUZZLE ─────────────────────────────────────────────────────────
   Pro. Any two men in the league since 1974, if a chain of real teammates
   joins them inside the shot clock. Par is the shortest chain, worked out
   rather than guessed, so a made puzzle is scored exactly like a daily. */
var psPicking = false, psPickA = '', psPickB = '', psQA = '', psQB = '';
function psSearch(q, not){
  var g = graph(), f = fold(q.trim()), out = [];
  if (f.length < 2) return out;
  Object.keys(g.nameOf).forEach(function(id){ if (id !== not && fold(g.nameOf[id]).indexOf(f) >= 0) out.push(id); });
  return out.sort(function(a, b){ return g.careerWs[b] - g.careerWs[a]; }).slice(0, 8);
}
function psSlotHtml(key, label, id, q, other){
  var g = graph();
  if (id) return '<div class="ps-slot"><span class="mx-eyebrow">' + label + '</span><div class="ps-chosen"><b>' + esc(g.nameOf[id]) + '</b><small>'
    + spanTxt(id) + '</small><button class="ghost sm" data-clear="' + key + '">Change</button></div></div>';
  return '<div class="ps-slot"><span class="mx-eyebrow">' + label + '</span>'
    + '<input class="fx-q ps-q" id="ps-q' + key + '" type="search" autocomplete="off" spellcheck="false" placeholder="Type a name" value="' + esc(q) + '">'
    + '<div class="ps-mates" id="ps-r' + key + '">' + psResultsHtml(key, q, other) + '</div></div>';
}
function psResultsHtml(key, q, other){
  var g = graph();
  return psSearch(q, other).map(function(id){
    return '<button class="ps-mate" data-pick="' + key + '" data-id="' + esc(id) + '">' + esc(g.nameOf[id]) + '<small>' + spanTxt(id) + '</small></button>';
  }).join('');
}
function psPickHtml(){
  var h = '<div class="cq-head">' + pix(ART.hoop, HOOP_PAL, 3)
    + '<div><div class="mh ps-mh">Six Passes</div><div class="cq-rung">Make a puzzle</div></div></div>'
    + '<p class="mx-say">Pick any two players. Play it yourself, or send it to a friend. They play free.</p>'
    + psSlotHtml('a', 'Starts with the ball', psPickA, psQA, psPickB)
    + psSlotHtml('b', 'Get it to', psPickB, psQB, psPickA);
  if (psPickA && psPickB) {
    var why = M.psCustomRefusal(graph(), psPickA, psPickB);
    if (why) h += '<p class="fx-hint" style="text-align:center">Can\'t make that one: ' + esc(why) + '.</p>';
    else {
      var pz = M.psCustom(graph(), psPickA, psPickB);
      h += '<div class="mx-card" style="text-align:center"><span class="mx-eyebrow">Par</span><div class="cq-big ps-big">' + pz.par + '</div></div>'
        + '<div class="mx-row" style="margin-top:12px"><button class="big ps-go" id="ps-pgo">Play it</button></div>'
        + '<div class="mx-row" style="margin-top:8px"><button class="ghost" id="ps-psend">Send it to a friend</button></div>';
    }
  }
  return h + '<div class="mx-row" style="margin-top:8px"><button class="ghost" id="ps-pback">Back</button></div>';
}
function psPickRender(box){
  P.bar('Six Passes · Make a puzzle');
  box.innerHTML = psPickHtml();
  var wireResults = function(){
    box.querySelectorAll('[data-pick]').forEach(function(b){
      b.onclick = function(){
        if (b.getAttribute('data-pick') === 'a') { psPickA = b.getAttribute('data-id'); psQA = ''; }
        else { psPickB = b.getAttribute('data-id'); psQB = ''; }
        psRender(false);
      };
    });
  };
  wireResults();
  ['a', 'b'].forEach(function(k){
    var q = $('ps-q' + k);
    if (q) q.oninput = function(){
      if (k === 'a') psQA = q.value; else psQB = q.value;
      $('ps-r' + k).innerHTML = psResultsHtml(k, q.value, k === 'a' ? psPickB : psPickA);
      wireResults();
    };
  });
  box.querySelectorAll('[data-clear]').forEach(function(b){
    b.onclick = function(){ if (b.getAttribute('data-clear') === 'a') psPickA = ''; else psPickB = ''; psRender(false); };
  });
  var go = $('ps-pgo'); if (go) go.onclick = function(){ psPlayPicked(psPickA, psPickB); };
  var sd = $('ps-psend'); if (sd) sd.onclick = function(){
    var g = graph(), pz = M.psCustom(g, psPickA, psPickB);
    share('Run The Floor · Six Passes\n' + surname(g.nameOf[pz.from]) + ' to ' + surname(g.nameOf[pz.to]) + '. Par ' + pz.par + '.\n'
      + 'Real teammates only. Can you get it there?\n' + linkTo('pass=' + pz.from + '.' + pz.to));
  };
  $('ps-pback').onclick = function(){ psPicking = false; P.goHome(); };
}
function psOpenPicker(){
  if (!data()) return;
  if (!endlessOpen()) { openPro('build'); return; }
  psEnd = true; psPicking = true;
  P.show('s-pass');
  psRender(false);
  window.scrollTo({ top: 0 });
}
/* A made puzzle, played. Also what a friend's link opens, so it asks nothing
   about Pro. */
function psPlayPicked(from, to){
  if (!data() || !psEndPick(from, to)) return false;
  psEnd = true; psPicking = false; psPz = null; psFilter = ''; psOpenStints = {};
  P.show('s-pass');
  psRender(false);
  window.scrollTo({ top: 0 });
  return true;
}

function psOpenEndless(){
  if (!data()) return;
  if (!endlessOpen()) { openPro('endless'); return; }
  var s = psEndStore();
  if (s.pz && s.pz.custom && s.st && s.st.done) psEndNew();
  psEnd = true; psPicking = false;
  psFilter = '';
  P.show('s-pass');
  psRender(false);
}
function psOpen(){
  if (!data()) return;
  psEnd = false; psPicking = false;
  psFilter = '';
  P.show('s-pass');
  psRender(false);
}

// ═══ FRONT PAGE ═════════════════════════════════════════════════════════════

/* ── THE FRONT PAGE: the puzzle strip and the tiles this file owns ───────
 *
 * The front page (index.html) opens on the DAILY PUZZLES, a strip of two
 * cards, then Classic, the Daily Draft in its own spot, then MORE WAYS TO
 * PLAY, one grid of tiles a desktop draws beside the daily card and a phone
 * keeps in a sheet. The page owns the grid and two of its tiles (One
 * Franchise, Decades); this file fills everything that needs to know whether
 * a puzzle is done or a run is live.
 *
 *   #pz-fix   Fix History, today's puzzle, in the strip
 *   #pz-ps    Six Passes, today's puzzle, in the strip
 *   #mw-cq    Conquest, the other unlimited mode
 *   #mw-pro   endless and build, for Pro
 *
 * A TILE IS ONE PRESS. The tag over the name says what kind of mode it is, the
 * chip in the corner says where you are with it, and the sub says what it is.
 * The puzzle cards keep the ids the tiles had (#mc-fix, #mc-ps), so every
 * walker that presses them still finds them. */
function tileHtml(id, ico, tag, name, sub, chip, done){
  return '<button class="mt-main' + (chip ? ' has-chip' : '') + (done ? ' done' : '') + '" id="' + id + '">'
    + '<span class="mt-ico pix">' + ico + '</span>'
    + '<span class="mt-tag">' + tag + '</span><b class="mt-name">' + name + '</b>'
    + '<small class="mt-sub">' + sub + '</small>'
    + (chip ? '<span class="mt-chip' + (done ? '' : ' go') + '">' + chip + '</span>' : '') + '</button>';
}
function puzzleHtml(id, color, ico, tag, name, sub, chip, done){
  return '<button class="pz' + (done ? ' done' : '') + '" id="' + id + '" style="--c:' + color + '">'
    + '<span class="pz-top"><span class="pz-ico">' + ico + '</span><span class="pz-chip">' + chip + '</span></span>'
    + '<span class="pz-tag">' + tag + '</span><b class="pz-name">' + name + '</b>'
    + '<small class="pz-sub">' + sub + '</small></button>';
}
function cqTileHtml(){
  if (!cq) cqLoad();
  var b = cqBest(), live = cq && !M.cqOver(cq);
  var sub = live ? (cq.drafting ? 'Finish your draft.' : plural(M.cqStreak(cq), 'win') + ' and counting.')
    : 'Winners stay on. Beat a real team and take a guy off it.';
  var chip = live ? plural(cq.lives, 'life', 'lives') : b.best ? 'Best ' + b.best + 'W' : 'Play';
  return tileHtml('mc-cq', pix(ART.crown, { g: '#f2c14e', r: '#ef4444', b: '#60a5fa', d: '#a8781a' }, 2),
    'Unlimited', 'Conquest', sub, chip, false);
}
function fixTileHtml(){
  var p = fxToday(), t = tsParts(p.ts), r = fxResult(p.day);
  /* Short on purpose: the card is half a phone wide, and the four windows
     are explained on the screen it opens. */
  var sub = esc(t.name) + '. Win it.';
  if (!r && fxInProgress()) {
    var dayRun = lsGet(FX_RUN);
    sub = esc(t.name) + '. ' + esc(M.FX_WINDOWS[Math.min(dayRun.win, M.FX_WINDOWS.length - 1)].name) + ' window open.';
  }
  return puzzleHtml('mc-fix', '#5eead4', pix(ART.rewind, { t: '#5eead4' }, 2), 'Day ' + p.day, 'Fix History', sub,
    r ? '<i class="td-ck" aria-hidden="true"></i>' + pct1(r.odds) : 'Play', !!r);
}
function psTileHtml(){
  var pz = psToday(), st = psTodayState(), g = graph();
  return puzzleHtml('mc-ps', '#fb923c', pix(ART.hoop, HOOP_PAL, 2), 'Par ' + pz.par, 'Six Passes',
    esc(surname(g.nameOf[pz.from])) + ' to ' + esc(surname(g.nameOf[pz.to])) + '.',
    st.done ? '<i class="td-ck" aria-hidden="true"></i>' + (st.solved ? plural(passesOf(st), 'pass', 'passes') : 'Missed') : 'Play',
    st.done);
}
/* Drawn for everybody. Without Pro each chip wears the lock and opens the
   offer, which is where that press was always going to end: a door nobody can
   see is a mode nobody knows exists. */
function proTileHtml(){
  var lk = endlessOpen() ? '' : ' class="lk"';
  return '<span class="mt-tag">Pro · No daily limit</span><b class="mt-name">Endless</b>'
    + '<div class="td-end"><span>Endless</span><button id="td-efx"' + lk + '>Fix History</button><button id="td-eps"' + lk + '>Six Passes</button></div>'
    + '<div class="td-end"><span>Build</span><button id="td-pfx"' + lk + '>Any team</button><button id="td-pps"' + lk + '>Two players</button></div>'
    + (endlessOpen() ? '' : '<button class="td-pro" id="td-pro"><i class="pro-tag">Pro</i> Unlock both for ' + PRO_PRICE + '</button>');
}
/* How many of today's two puzzles are still open, for the strip's heading. */
function dailiesLeft(){
  if (!data()) return 0;
  return (fxResult(fxToday().day) ? 0 : 1) + (psTodayState().done ? 0 : 1);
}
function renderHome(){
  if (!data()) return;
  var slots = { 'pz-fix': fixTileHtml, 'pz-ps': psTileHtml, 'mw-cq': cqTileHtml, 'mw-pro': proTileHtml };
  for (var k in slots) { var el = $(k); if (el) el.innerHTML = slots[k](); }
  var sec = $('hp-puzzles'); if (sec) sec.hidden = false;
  /* THE HEADING SAYS WHAT IS WAITING, and both done says when the next two
     arrive, because a strip of two green cards reads as nothing left to do
     rather than as a streak to keep. */
  var hl = $('pz-left'), left = dailiesLeft();
  if (hl) {
    hl.textContent = left ? (left === 2 ? 'Two open today' : 'One left today') : 'New ones at midnight ET';
    hl.className = 'pz-left' + (left ? ' open' : '');
  }
  paintToday();
  var c = $('mc-cq'); if (c) c.onclick = cqOpen;
  var f = $('mc-fix'); if (f) f.onclick = fxOpen;
  var ps = $('mc-ps'); if (ps) ps.onclick = psOpen;
  var ef = $('td-efx'); if (ef) ef.onclick = fxOpenEndless;
  var ep = $('td-eps'); if (ep) ep.onclick = psOpenEndless;
  var pf = $('td-pfx'); if (pf) pf.onclick = fxOpenPicker;
  var pp = $('td-pps'); if (pp) pp.onclick = psOpenPicker;
  var tp = $('td-pro'); if (tp) tp.onclick = function(){ openPro(null); };
  if (window.RTF_CAREER_UI) window.RTF_CAREER_UI.renderHero();
}

/* THE DOCK IS CLASSIC'S NOW (index.html's DOCK_FOR), so the daily puzzles
   are rows and nothing here owns a primary button. Kept as a function because
   renderHome and the modes call it after every result. */
function paintToday(){}

// ═══ LEADERBOARDS ═══════════════════════════════════════════════════════════

/* The board is optional, like everywhere else in this game: every call fails
   soft to null and a play is never held up by it. A play finished signed out
   is filed without a name and its id is kept here, so signing in later claims
   it. */
var GUEST_KEY = 'rtf.plays.guest.v1';
function BB(){ return P.board(); }
function signedIn(){ var a = P.auth(); return !!(a && a.state && a.state().signedIn); }
function rememberGuest(id){
  if (!id || signedIn()) return;
  var l = lsGet(GUEST_KEY) || [];
  if (l.indexOf(id) < 0) l.push(id);
  lsSet(GUEST_KEY, l.slice(-60));
}
function claimGuests(){
  if (!signedIn()) return;
  var l = lsGet(GUEST_KEY) || [];
  if (!l.length) return;
  lsDel(GUEST_KEY);
  l.forEach(function(id){ BB().claimPlay(id); });
}
function ordinal(n){
  var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
/* A PLACE NEVER PRINTS PAST ITS FIELD. The two counts are separate requests
   and the play being placed can land between them, or not have landed yet,
   so "42nd of 41" is a reachable answer to two honest questions. The field
   is at least as big as the place in it. */
function placeLine(pl, when){
  if (!pl) return '';
  var total = Math.max(pl.total, pl.place);
  return '<b>' + ordinal(pl.place) + '</b> of ' + total.toLocaleString() + ' ' + when + '.';
}

/* Fix History: file it once, then say where it sits and how many made the
   same move. A null answer leaves the line empty rather than guessing. */
function fxSubmit(r){
  if (r.boardId) return Promise.resolve(r.boardId);
  return BB().submitFix(r).then(function(id){
    if (id) { r.boardId = id; fxKeep(r.day, r); rememberGuest(id); }
    return id;
  });
}
function fxFillPlace(r){
  var el = $('fx-place');
  if (!el) return;
  Promise.all([BB().playPlace('fix', r.day, Math.round(r.odds * 10000) / 10000), BB().moveCount(r.day, fxHeadline(r))])
    .then(function(a){
      if (!$('fx-place')) return;
      var h = placeLine(a[0], 'today');
      var who = esc(surname((data().allPlayers[fxHeadline(r)] || { n: '' }).n));
      if (a[1] != null && a[1] > 1) h += ' ' + plural(a[1] - 1, 'other') + ' traded for ' + who + '.';
      else if (a[1] === 1) h += ' Nobody else has traded for ' + who + ' yet.';
      $('fx-place').innerHTML = h;
    });
}

function psSubmit(pz, st){
  if (st.boardId) return Promise.resolve(st.boardId);
  return BB().submitPasses(pz.day, st.chain, pz.par, st.solved).then(function(id){
    if (id) { st.boardId = id; psKeep(st); rememberGuest(id); }
    return id;
  });
}
function psPlace(pz, st){
  psSubmit(pz, st).then(function(){
    return BB().playPlace('passes', pz.day, st.solved ? 100 - passesOf(st) : 0);
  }).then(function(pl){ if ($('ps-place')) $('ps-place').innerHTML = placeLine(pl, 'today'); });
};

function cqSubmit(){
  if (!cq || !M.cqOver(cq) || cq.boardId) return;
  BB().submitConquest({
    wins: M.cqStreak(cq), lives: cq.lives, cleared: M.cqCleared(cq),
    lostTo: cq.lost ? cq.lost.ts : null, roster: cq.roster.slice(),
    took: cq.wins.filter(function(w){ return w.took; }).map(function(w){ return w.took; }),
    seed: cq.seed
  }).then(function(id){
    if (id) { cq.boardId = id; cqSave(); rememberGuest(id); }
    var el = $('cq-place');
    if (!el) return;
    BB().playPlace('conquest', null, M.cqStreak(cq)).then(function(pl){
      if ($('cq-place')) $('cq-place').innerHTML = placeLine(pl, 'all time');
    });
  });
}
function cqSubmitOrPlace(){
  if (!cq.boardId) return cqSubmit();
  BB().playPlace('conquest', null, M.cqStreak(cq)).then(function(pl){
    if ($('cq-place')) $('cq-place').innerHTML = placeLine(pl, 'all time');
  });
}

/* THE BOARDS ARE ONE SCREEN NOW, the page's own s-board, which is Run The
   Diamond's leaderboard: a tab a mode, a window, a sort, a hundred rows at a
   time, and a row that opens. This file only knows what a Conquest, Fix History
   or Six Passes row SAYS, and hands that over through RTF_MODES_UI.board. */
function openModeBoard(mode){ if (P.openBoard) P.openBoard({ door: mode }); }
function mbDetail(row){
  var d = data();
  if (row.mode === 'fix') {
    var nm = function(k){ var p = d.allPlayers[k]; return p ? esc(surname(p.n)) : '?'; };
    /* A season of trades says how many and who came in. */
    if (Array.isArray(row.fix_trades)) {
      if (!row.fix_trades.length) return 'Stood pat';
      var got = [];
      row.fix_trades.forEach(function(t){ (t.ins || []).forEach(function(k){ got.push(nm(k)); }); });
      return plural(row.fix_trades.length, 'trade') + ' · got ' + got.slice(0, 3).join(', ');
    }
    var ins = row.fix_ins || [row.fix_in], outs = row.fix_outs || [row.fix_out];
    var inn = d.allPlayers[ins[0]];
    var from = row.fix_with ? E.teamName(tsParts(row.fix_with).code) : inn ? shortClub(inn.t, inn.s) : '';
    return ins.map(nm).join(', ') + (from ? ' ' + esc(from) : '') + ' for ' + outs.map(nm).join(', ');
  }
  if (row.mode === 'passes') return row.solved ? 'Par ' + row.par : 'Shot clock ran out';
  var took = (row.cq_took || []).slice(-2).map(function(k){ var p = d.allPlayers[k]; return p ? esc(surname(p.n)) : ''; }).filter(Boolean);
  return took.length ? 'Took ' + took.join(', ') : 'Took nobody';
}
/* A FIX HISTORY ROW OPENS INTO THE SEASON IT WAS. The board already carries
   the club and every trade, so the final roster is rebuilt here from this
   browser's own data with no request: the club, then each trade in order. What
   it cannot say is who started, because the lineup is not filed, so it lists
   the roster by win shares and marks who came in. */
function mbFixTrades(row){
  if (Array.isArray(row.fix_trades)) return row.fix_trades;
  var ins = row.fix_ins || (row.fix_in ? [row.fix_in] : []), outs = row.fix_outs || (row.fix_out ? [row.fix_out] : []);
  return ins.length ? [{ w: 0, with: row.fix_with || null, outs: outs, ins: ins, picks: [] }] : [];
}
function mbFixMore(row){
  var d = data(), trades = mbFixTrades(row);
  var nm = function(k){ var p = d.allPlayers[k]; return p ? esc(surname(p.n)) : '?'; };
  var rows = [];
  try {
    var ok = trades.filter(function(t){ return (t.ins || []).every(function(k){ return d.allPlayers[k]; }); });
    rows = M.fxRosterAt(d, { ts: row.fix_ts, trades: ok }, M.FX_WINDOWS.length - 1).filter(Boolean);
  } catch (e) { rows = []; }
  var got = {};
  trades.forEach(function(t){ (t.ins || []).forEach(function(k){ got[k] = 1; }); });
  var odds = Number(row.fix_odds), base = Number(row.fix_base);
  var h = '<div class="mb-stats">'
    + '<div><small>Title odds</small><b>' + pct1(odds) + '</b></div>'
    + '<div><small>As built</small><b>' + (isFinite(base) ? pct1(base) : '-') + '</b></div>'
    + '<div><small>Replay</small><b>' + (row.replay_wins != null ? row.replay_wins + '-' + (E.CONSTANTS.REGULAR_SEASON_GAMES - row.replay_wins) : '-')
    + (row.replay_title ? ' · Won it' : '') + '</b></div></div>';
  if (trades.length) {
    h += '<ul class="mb-deals">' + trades.map(function(t){
      var w = M.FX_WINDOWS[t.w], club = t.with ? E.teamName(tsParts(t.with).code) : '';
      var gave = (t.outs || []).map(nm).concat((t.picks || []).map(pickLabel));
      return '<li>' + esc(w ? w.name : 'A trade') + ': <b>' + (t.ins || []).map(nm).join(', ') + '</b>'
        + (club ? ' from ' + esc(club) : '') + ' for ' + gave.join(', ') + '</li>';
    }).join('') + '</ul>';
  } else h += '<ul class="mb-deals"><li>Stood pat all season.</li></ul>';
  if (rows.length) {
    h += '<div class="mb-ros">' + rows.slice().sort(function(a, b){ return b.w - a.w; }).map(function(p){
      return '<div class="mb-man"><span>' + esc(p.n) + (got[E.pkey(p)] ? '<em>New</em>' : '') + '</span>'
        + '<small>' + (p.pts || 0).toFixed(1) + ' pts · ' + p.w.toFixed(1) + ' WS</small></div>';
    }).join('') + '</div>';
  }
  return h;
}
/* A SIX PASSES ROW OPENS INTO ITS CHAIN, and a Conquest row into the five it
   finished with and who ended it, drawn from this browser's own data with no
   request, the way a Fix History row opens into its season. */
function mbPassesMore(row){
  var chain = Array.isArray(row.chain) ? row.chain : [];
  if (!chain.length) return '<p class="fx-hint">No chain on file.</p>';
  var g = graph();
  return '<ol class="mb-chain">' + chain.map(function(id, i){
    var sp = g.span[id];
    return '<li><b>' + esc(g.nameOf(id) || id) + '</b>'
      + (sp ? '<small>' + sp[0] + (sp[1] !== sp[0] ? '-' + sp[1] : '') + '</small>' : '')
      + (i ? '' : '<em>Start</em>') + '</li>';
  }).join('') + '</ol>'
    + '<p class="bd-team-foot">' + (row.solved ? plural(row.passes, 'pass', 'passes') + ' against a par of ' + row.par
      : 'The shot clock ran out after ' + plural(Math.max(0, chain.length - 1), 'pass', 'passes')) + '.</p>';
}
function mbConquestMore(row){
  var d = data(), men = Array.isArray(row.cq_roster) ? row.cq_roster : [];
  var h = men.length ? '<div class="mb-ros">' + men.map(function(k){
    var p = d.allPlayers[k];
    return '<div class="mb-man"><span>' + esc(p ? p.n : 'Season not in this version') + '</span>'
      + (p ? '<small>' + esc(shortClub(p.t, p.s)) + ' · ' + (p.pts || 0).toFixed(1) + ' pts</small>' : '') + '</div>';
  }).join('') + '</div>' : '<p class="fx-hint">No roster on file.</p>';
  var foot = [plural(row.cq_wins, 'win')];
  if (row.cq_cleared) foot.push('cleared the whole ladder');
  else if (row.cq_lost_to) foot.push('ended by ' + esc(E.teamName(tsParts(row.cq_lost_to).code)) + ' ' + esc(tsParts(row.cq_lost_to).season || ''));
  return h + '<p class="bd-team-foot">' + foot.join(' · ') + '</p>';
}
/* WHAT A ROW SAYS, for s-board. The value is what the board ranks on, the tag
   is the one mark a row can wear (gold, like a title on the draft boards), and
   `more` is what opens under it. */
function boardBits(row){
  if (row.mode === 'fix') return {
    value: pct1(Number(row.fix_odds)), unit: 'title odds', meta: mbDetail(row),
    champ: !!row.replay_title, tag: 'Won it all', more: function(){ return mbFixMore(row); } };
  if (row.mode === 'passes') return {
    value: row.solved ? String(row.passes) : 'X', unit: row.solved ? 'passes' : 'no chain',
    meta: mbDetail(row), champ: !!(row.solved && row.passes <= row.par),
    tag: row.solved && row.passes < row.par ? 'Under par' : 'At par',
    more: function(){ return mbPassesMore(row); } };
  return {
    value: String(row.cq_wins), unit: row.cq_wins === 1 ? 'win' : 'wins', meta: mbDetail(row),
    champ: !!row.cq_cleared, tag: 'Cleared', more: function(){ return mbConquestMore(row); } };
}
/* WHICH ROWS ARE THIS BROWSER'S, by the board id each mode kept when it filed. */
function boardMine(mode){
  var mine = {}, d = today();
  if (mode === 'fix') [d, d - 1].forEach(function(x){ var r = fxResult(x); if (r && r.boardId) mine[r.boardId] = 1; });
  if (mode === 'passes') { var pd = psStore().days; Object.keys(pd).forEach(function(k){ if (pd[k].boardId) mine[pd[k].boardId] = 1; }); }
  if (mode === 'conquest' && cq && cq.boardId) mine[cq.boardId] = 1;
  return mine;
}

// ═══ WIRING ═════════════════════════════════════════════════════════════════

var ready = false;
/* ── RUN THE FLOOR PRO ─────────────────────────────────────────────────────
   One sheet, opened from any locked door. It says what Pro is, what stays free,
   and takes one press to Stripe through the site's one checkout. */
function proSheetEl(){
  var sh = $('pro-sheet');
  if (!sh) {
    sh = document.createElement('div');
    sh.id = 'pro-sheet';
    sh.className = 'fx-sheet';
    document.body.appendChild(sh);
    sh.addEventListener('click', function(ev){ if (ev.target === sh) closePro(); });
    document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') closePro(); });
  }
  return sh;
}
function closePro(){ var sh = $('pro-sheet'); if (sh) { sh.hidden = true; sh.removeAttribute('data-kind'); } }
function signedAcct(){ var a = P.auth(), st = a && a.state && a.state(); return !!(st && st.signedIn); }
function openPro(why){
  var sh = proSheetEl();
  sh.hidden = false;
  sh.removeAttribute('data-kind');
  paintPro(why);
}
function paintPro(why, kind){
  var sh = $('pro-sheet');
  if (!sh || sh.hidden) return;
  var h = '<div class="fx-card"><div class="mb-top"><h2 style="margin:0">'
    + (kind === 'thanks' ? (proOwned ? 'Pro is on' : 'Thanks for buying Pro') : proOwned ? 'You have Pro' : 'Run The Floor Pro')
    + '</h2><button class="ghost sm" data-pro-x>Close</button></div>';
  if (kind === 'thanks') {
    h += '<p class="mx-say">' + (proOwned ? 'Endless puzzles, build your own, high school careers and the family tree are open. On every device you sign in on.'
      : 'Your payment went through. Pro is on its way to your account and usually lands in a few seconds.') + '</p>';
  } else if (proOwned) {
    h += '<p class="mx-say">Endless puzzles, build your own, high school careers and the family tree are open. Thanks for backing the game.</p>';
  } else {
    var signed = signedAcct();
    h += '<p class="mx-say">' + (why === 'endless' ? 'Out of puzzles for today? Pro keeps them coming.'
        : why === 'build' ? 'Build your own puzzles with Pro.'
        : why === 'career' ? 'Play your road from high school with Pro.'
        : why === 'family' ? 'Play as your son with Pro, and keep a family tree.' : 'The dailies are free. Pro is everything else.') + '</p>'
      + '<ul class="pro-list">'
      + '<li><b>Career from high school</b>Play the road yourself, from age 15 to the draft. Free careers start on draft night.</li>'
      + '<li><b>Family tree</b>When a career ends, play as your son. Every generation is kept.</li>'
      + '<li><b>Endless puzzles</b>A new Fix History team or Six Passes pair every time you finish one.</li>'
      + '<li><b>Rebuild any team</b>Any club, any year, champions too. Four trade windows to win it.</li>'
      + '<li><b>Make a puzzle</b>Pick any two players and send the link. Friends play it free.</li>'
      + '</ul>'
      + '<div class="pro-price"><b>' + PRO_PRICE + '</b><span>once. Yours for good.</span></div>'
      + '<button class="pro-buy" id="pro-buy">' + (signed ? 'Get Pro for ' + PRO_PRICE : 'Sign in to get Pro') + '</button>'
      + '<p class="pro-err" id="pro-err" hidden></p>'
      + '<p class="fx-hint" style="text-align:center">' + (signed
        ? 'One payment through Stripe. Nothing renews. Classic, Conquest, the dailies and Career from draft night stay free.'
        : 'Pro belongs to your RunThe.GG account, so it follows you to every device. The dailies and Career from draft night stay free.') + '</p>';
  }
  sh.innerHTML = h + '</div>';
  sh.querySelectorAll('[data-pro-x]').forEach(function(b){ b.onclick = closePro; });
  var buy = $('pro-buy');
  if (buy) buy.onclick = function(){
    if (!signedAcct()) { closePro(); if (P.openProfile) P.openProfile(); return; }
    buyPro(buy);
  };
}
/* One POST to the site's one checkout. The verdict is read off the `error`
   field and never the status, the contract checkout-bundle.js keeps. */
function buyPro(btn){
  var a = P.auth(), t = a && a.token ? a.token() : null;
  if (!t) { closePro(); if (P.openProfile) P.openProfile(); return; }
  var err = $('pro-err'); if (err) err.hidden = true;
  btn.disabled = true; btn.textContent = 'Opening checkout...';
  var st = a.state && a.state();
  fetch('/api/stripe/checkout-bundle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({ bundle: PRO_BUNDLE, return_path: '/hoops/', email: (st && st.email) || undefined })
  }).then(function(r){ return r.json().catch(function(){ return {}; }); })
    .catch(function(){ return {}; })
    .then(function(d){
      if (d && d.url) { location.href = d.url; return; }
      if (d && d.error === 'already_owned') proRefresh(true);
      btn.disabled = false;
      btn.textContent = 'Get Pro for ' + PRO_PRICE;
      if (err) {
        err.hidden = false;
        err.textContent = d && d.error === 'stripe_not_configured' ? 'Pro is not on sale yet. Try again soon.'
          : d && d.error === 'already_owned' ? 'This account already has Pro.'
          : d && d.error === 'unauthorized' ? 'Sign in again, then try once more.'
          : 'Checkout did not open. Try again.';
      }
    });
}
/* What the account owns. A null answer is no opinion and changes nothing, so a
   dropped connection never takes Pro away mid-puzzle. A slower answer for an
   account that has since changed is dropped. */
var proAsked = 0;
function proRefresh(force){
  var ask = ++proAsked, a = P.auth();
  if (!a || !a.premiumProducts) return Promise.resolve();
  if (!signedAcct()) { proSet(false); return Promise.resolve(); }
  return a.premiumProducts(force).then(function(prods){
    if (ask !== proAsked || !Array.isArray(prods)) return;
    proSet(prods.indexOf('rtf_premium') >= 0);
  }).catch(function(){});
}
function proSet(on){
  if (proOwned === on) return;
  proOwned = on;
  /* Two arenas are Pro's, so owning it changes which floors are yours. */
  if (P.arenaChanged) P.arenaChanged();
  var home = $('s-home');
  if (home && home.classList.contains('active')) renderHome();
  var sh = $('pro-sheet');
  if (sh && !sh.hidden && sh.getAttribute('data-kind') !== 'thanks') paintPro(null);
  /* Career's builder and Hall card offer Pro doors of their own. */
  var CU = window.RTF_CAREER_UI;
  if (CU && CU.proChanged) CU.proChanged();
}
/* COMING BACK FROM STRIPE. The webhook races the redirect, so this asks for
   about ten seconds, past the cache each time, and never says the payment
   failed: it cannot know that. The flag comes off the URL first, so a reload
   cannot replay it. */
function checkoutReturn(){
  var what = null;
  try { what = new URLSearchParams(location.search).get('checkout'); } catch (e) {}
  if (!what) return;
  try {
    var u = new URL(location.href); u.searchParams.delete('checkout');
    history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
  } catch (e) {}
  if (what !== 'success') return;
  var sh = proSheetEl();
  sh.hidden = false; sh.setAttribute('data-kind', 'thanks');
  paintPro(null, 'thanks');
  var waits = [800, 1200, 2000, 3000, 3500], i = 0;
  (function next(){
    if (proOwned || i >= waits.length) return;
    setTimeout(function(){
      proRefresh(true).then(function(){ if (!sh.hidden) paintPro(null, 'thanks'); next(); });
    }, waits[i++]);
  })();
}

/* ── LINKS ─────────────────────────────────────────────────────────────────
   A picked puzzle travels as a hash: #fix=CHI_1996 or #pass=jordami01.jamesle01.
   A hash never reaches the server, so a link works on any host this page is
   served from, and the base is the page the SENDER is on rather than a
   written-out domain (CLAUDE.md: www and the apex are two localStorage jars).
   Opening one is free: the Pro half is making it. */
function linkTo(frag){
  var base = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : P.SHARE_URL;
  return base + '#' + frag;
}
function openLink(){
  var m = /^#(fix|pass)=([A-Za-z0-9_.'-]+)$/.exec(location.hash || '');
  if (!m || !data()) return false;
  var ok = false;
  if (m[1] === 'fix') ok = fxPlayPicked(m[2]);
  else { var ab = m[2].split('.'); ok = ab.length === 2 && psPlayPicked(ab[0], ab[1]); }
  /* The hash has done its job. Left on, a reload after finishing would open
     the finished puzzle rather than the front page. */
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  return ok;
}

function onData(){
  if (ready || !data()) return;
  ready = true;
  var bt = $('boot');
  if (bt && bt.className.indexOf('failed') < 0) bt.className = 'boot done';
  renderHome();
  var a = P.auth();
  if (a && a.onChange) a.onChange(function(){ claimGuests(); proRefresh(false); });
  claimGuests();
  proRefresh(false);
  checkoutReturn();
  openLink();
  window.addEventListener('hashchange', openLink);
}

window.RTF_MODES_UI = {
  UI_VERSION: UI_VERSION,
  /* The page's pull hands every row on the shelf to this, see cloudAdopt. */
  cloudAdopt: cloudAdopt,
  /* A key some other file keeps (Career's), sent to the shelf the same way
     this file's own records are. */
  write: function(k){ syncWrite(k); },
  /* Whether this account owns Run The Floor Pro, for the arenas. */
  pro: function(){ return proOwned; },
  /* Whether Pro's doors are open: owning it, or PRO_LIVE off. Career asks this. */
  proOpen: function(){ return endlessOpen(); },
  openPro: function(why){ openPro(why); },
  onData: onData,
  renderHome: renderHome,
  openConquest: cqOpen,
  openFix: fxOpen,
  openPasses: psOpen,
  /* Every board in one sheet, from the front page's quiet row. */
  openBoards: function(){ if (P.openBoard) P.openBoard(); },
  board: { bits: function(r){ return boardBits(r); }, mine: function(m){ return boardMine(m); } },
  /* The doors the draft's results screen offers: the dailies still open
     today, and Conquest. Built here because only this file knows whether a
     daily is done. */
  doors: function(){
    if (!data()) return [];
    var out = [];
    if (!fxResult(fxToday().day)) out.push({ title: 'Fix History · Day ' + fxToday().day,
      why: 'One real team. Four trade windows. Can you win them the title?', gold: true, go: fxOpen });
    if (!psTodayState().done) out.push({ title: 'Six Passes · Par ' + psToday().par,
      why: 'Get the ball through real teammates.', gold: true, go: psOpen });
    if (!cq) cqLoad();
    out.push({ title: cq && !M.cqOver(cq) ? 'Conquest · ' + M.cqStreak(cq) + ' wins' : 'Conquest',
      why: 'Winners stay on. Take a guy off every team you beat.', gold: false, go: cqOpen });
    return out;
  },
  leave: function(id){ if (id !== 's-cq') cqClear(); },
  /* For the checker. Nothing on the page reads these. */
  _cq: function(){ return cq; },
  _pro: function(on){ proSet(!!on); },
  _proRefresh: function(){ return proRefresh(true); }
};
if (data()) onData();
})();
