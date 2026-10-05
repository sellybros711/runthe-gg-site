/* Run The Floor: the court, and the moments played on it.
 *
 * The owner's condition for cutscenes was that they MOVE: not a player
 * standing there breathing. So this is a small timeline player on a pixel
 * half court. Everything on it is drawn the same way as the man: the players
 * by baller.js's rig, and the ball, the rim, a trophy, a podium and a ring by
 * the same sphere tracer and the same ramps (B.propCanvas). The floor is
 * painted here as boards in perspective, the lane under the rim in the home
 * colour, with a light pool and a reflection of whoever stands on it.
 *
 * ONE GRID. The court is drawn at one cell per sprite cell, so the man, the
 * ball, the rim and the crowd sit on the same pixel grid and the canvas is
 * scaled by a whole number. Nothing is tweened between cells.
 *
 * A PLAYABLE MOMENT DECIDES NOTHING ON ITS OWN. Every press is a touch, a
 * number from -1 to 1, handed to the engine through C.choose(L, i, { touch })
 * (two free throws hand over { touches }). The engine rolls the shot with its
 * own seeded draw, so a perfect release can still rim out, and a career
 * played with the scenes off is the same career with a touch of nought. What
 * the court shows after the press is whatever the engine said, and on a duel
 * career that is two things: whether your shot went down, and how the game
 * went, which are not the same thing.
 *
 * THE SKILL IS IN TWO KINDS OF PRESS, and they read differently on purpose.
 *   A shot is a METER that swings like a pendulum, fastest through the middle
 *   where the green is, with a gold core inside the green. Under pressure the
 *   green drifts (nerves). A drive is two presses: the gather, then the rise.
 *   A stop, a chase-down and a pass are a READ: watch the court and press the
 *   moment he really goes. A jab or a gather that is not the real move is a
 *   fake, and pressing on it is biting. A lamp lights a beat AFTER the real
 *   move for anybody watching the lamp instead of the man, so reading the
 *   court is worth more than reacting to the lamp.
 *
 * ONLY THE INVENTED HAVE FACES. You, your invented teammates, your rival and
 * the commissioner are drawn as people. Anybody on a real roster is drawn in
 * his club's kit with no face and no hair (baller.js `faceless`): the rig and
 * the light, nothing that could be read as a likeness.
 *
 * window.RTF_COURT: stage(host, opts), moment(host, spec, cb), ceremony(...),
 * touchOf, reactTouch, zoneFor, MOMENTS, CLUTCH_KIND, VARIANTS.
 */
(function(){
'use strict';
var B = window.RTF_BALLER, K = window.RTF_KIT;
if (!B || !K) return;
var S = window.RTF_SOUND || { cue: function(){}, crowd: function(){}, on: function(){ return false; } };
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
var TICK = 1000 / 12;

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lerp(a, b, u){ return a + (b - a) * u; }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function ease(u){ return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
function rgb(h){ h = String(h).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hex(c){ return '#' + c.map(function(v){ v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(a, b, t){ var x = rgb(a), y = rgb(b); return hex(x.map(function(v, i){ return v + (y[i] - v) * t; })); }
/* A seeded stream, so a moment shown twice is the same moment. */
function rngOf(seed){
  var h = B.hash(String(seed));
  return function(){ h = (h + 0x6D2B79F5) >>> 0; var t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function pickOf(r, list){ return list[Math.floor(r() * list.length) % list.length]; }

var CSS = [
'.ct{position:absolute;inset:0;overflow:hidden;background:#05070d;z-index:3;}',
'.ct canvas{position:absolute;left:50%;bottom:0;transform:translateX(-50%);image-rendering:pixelated;image-rendering:crisp-edges;}',
'.ct-bug{position:absolute;left:8px;top:8px;z-index:4;display:flex;align-items:stretch;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:9px;line-height:1;color:#fff;background:#05070d;box-shadow:0 -2px 0 0 #2d3a66,0 2px 0 0 #2d3a66,-2px 0 0 0 #2d3a66,2px 0 0 0 #2d3a66;}',
'.ct-bug span{display:flex;align-items:center;padding:6px 7px;}',
'.ct-bug .tm{background:var(--c1);color:var(--ink1);}',
'.ct-bug .op{background:var(--oc);color:var(--ink2);}',
'.ct-bug .clk{color:#ffd166;}',
'.ct-bug .clk.hot{animation:ctHot .5s steps(1) infinite;}',
'.ct-bug .fin{background:#ffd166;color:#05070d;}',
'.ct-bug .fin.w{background:#3ecf8e;}',
'.ct-bug .fin.l{background:#ff4b4b;color:#fff;}',
'@keyframes ctHot{50%{color:#ff4b4b}}',
'.ct-call{position:absolute;left:0;right:0;top:40px;z-index:4;padding:8px 12px;font-family:var(--k-f-display,var(--display,Impact));font-size:clamp(16px,4.6vw,24px);letter-spacing:.03em;text-transform:uppercase;color:#fff;text-shadow:2px 2px 0 #05070d;text-align:center;pointer-events:none;}',
'.ct-call:empty{display:none;}',
'.ct-call.big{color:#ffd166;font-size:clamp(24px,8vw,46px);}',
'.ct-fbk{position:absolute;left:50%;top:40%;z-index:4;transform:translateX(-50%);padding:7px 10px;background:rgba(5,7,13,.82);box-shadow:0 0 0 2px #05070d;white-space:nowrap;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#fff;pointer-events:none;animation:ctPop .7s steps(6) both;}',
'.ct-fbk.p{color:#ffd166;font-size:16px;box-shadow:0 0 0 2px #ffd166;}.ct-fbk.g{color:#8ff0c2;}.ct-fbk.b{color:#ff8a7a;}',
'@keyframes ctPop{0%{transform:translate(-50%,8px) scale(.8);opacity:0}25%{transform:translate(-50%,0);opacity:1}80%{opacity:1}100%{transform:translate(-50%,-10px);opacity:0}}',
'.ct-bars:before,.ct-bars:after{content:"";position:absolute;left:0;right:0;height:9%;background:#000;z-index:4;}',
'.ct-bars:before{top:0}.ct-bars:after{bottom:0}',
'.ct-rp{position:absolute;right:10px;top:12%;z-index:5;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:9px;color:#fff;background:#c8102e;padding:5px 7px;box-shadow:0 0 0 2px #05070d;}',
'.ct-rp[hidden]{display:none;}',
'.ct-ctl{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:5;width:min(92%,420px);display:flex;flex-direction:column;align-items:stretch;gap:8px;}',
'.ct-ctl[hidden]{display:none;}',
'.ct-ctl.ct-ctl-in{position:static;transform:none;width:100%;max-width:440px;margin:4px auto 0;}',
'.ct-lab{display:flex;justify-content:space-between;gap:8px;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:8px;text-transform:uppercase;color:#cdd6f4;text-shadow:1px 1px 0 #05070d;}',
'.ct-bar{position:relative;height:18px;background:#0b0e1a;box-shadow:0 -2px 0 0 #2d3a66,0 2px 0 0 #2d3a66,-2px 0 0 0 #2d3a66,2px 0 0 0 #2d3a66;}',
'.ct-bar[hidden],.ct-cue[hidden]{display:none;}',
'.ct-zone{position:absolute;top:0;bottom:0;background:#3ecf8e;box-shadow:inset 0 3px 0 0 #8ff0c2,inset 0 -3px 0 0 #1e8c5b;}',
'.ct-perf{position:absolute;top:0;bottom:0;left:35%;width:30%;background:#ffd166;box-shadow:inset 0 3px 0 0 #fff1b8,inset 0 -3px 0 0 #c99a2e;}',
'.ct-cur{position:absolute;top:-5px;bottom:-5px;width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 0 2px #05070d;}',
'.ct-cue{display:flex;align-items:center;justify-content:center;gap:10px;height:30px;background:#0b0e1a;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#7f8bb3;box-shadow:0 -2px 0 0 #2d3a66,0 2px 0 0 #2d3a66,-2px 0 0 0 #2d3a66,2px 0 0 0 #2d3a66;}',
'.ct-cue i{width:12px;height:12px;background:#2d3a66;box-shadow:0 0 0 2px #05070d;}',
'.ct-cue.now{color:#05070d;background:#3ecf8e;}',
'.ct-cue.now i{background:#fff;}',
'.ct-go{border:0;border-radius:0;min-height:52px;font-family:var(--k-f-display,var(--display,Impact));font-size:22px;letter-spacing:.06em;text-transform:uppercase;color:#05070d;background:#ffd166;box-shadow:0 -3px 0 0 #05070d,0 3px 0 0 #05070d,-3px 0 0 0 #05070d,3px 0 0 0 #05070d,inset 0 -4px 0 0 #c99a2e;cursor:pointer;}',
'.ct-go:focus-visible{outline:3px solid #fff;outline-offset:4px;}',
'.ct-go:active{transform:translateY(2px);box-shadow:0 -3px 0 0 #05070d,0 3px 0 0 #05070d,-3px 0 0 0 #05070d,3px 0 0 0 #05070d,inset 0 -1px 0 0 #c99a2e;}',
'.ct-hint{font-size:12px;text-align:center;color:rgba(255,255,255,.7);text-shadow:1px 1px 0 #05070d;}',
'.ct-l3{position:absolute;left:8px;bottom:8px;z-index:4;display:flex;align-items:stretch;max-width:calc(100% - 16px);background:#05070d;box-shadow:0 -2px 0 0 var(--c1),0 2px 0 0 var(--c1),-2px 0 0 0 var(--c1),2px 0 0 0 var(--c1);animation:ctL3 .35s steps(4) both;}',
'.ct-l3[hidden]{display:none;}',
'.ct-l3 b{display:block;padding:6px 9px 2px;font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:17px;letter-spacing:.03em;text-transform:uppercase;color:#fff;}',
'.ct-l3 small{display:block;padding:0 9px 7px;font-family:var(--k-f-pixel,var(--display,Impact));font-size:7px;text-transform:uppercase;color:#ffd166;}',
'.ct-l3 i{width:6px;background:var(--c1);box-shadow:inset -2px 0 0 0 #ffd166;}',
'@keyframes ctL3{from{transform:translateX(-110%)}to{transform:none}}',
'@media (prefers-reduced-motion:reduce){.ct-bug .clk.hot,.ct-l3,.ct-fbk{animation:none}}',
].join('\n');
function cssOnce(){
  if (document.getElementById('ct-css')) return;
  var st = document.createElement('style'); st.id = 'ct-css'; st.textContent = CSS; document.head.appendChild(st);
}

// ─── sprites, cached as canvases ─────────────────────────────────────────────

var SPR = {}, SPRN = 0;
function sprite(who, pose){
  var k = JSON.stringify([who.look, who.c1, who.c2, who.num, pose, who.age, who.dress || '', who.faceless ? 1 : 0]);
  if (SPR[k]) return SPR[k];
  if (++SPRN > 400) { SPR = {}; SPRN = 0; }
  var g = B.paint(who.look, { pose: pose, c1: who.c1, c2: who.c2, num: who.num, age: who.age, dress: who.dress, faceless: who.faceless });
  var cv = document.createElement('canvas'); cv.width = B.W; cv.height = B.H;
  var c = cv.getContext('2d');
  for (var y = 0; y < B.H; y++) for (var x = 0; x < B.W; x++) { var col = g[y][x]; if (col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); } }
  SPR[k] = cv;
  return cv;
}
/* The ball turns in the air: four frames of the same traced ball. */
function ballArt(spin){ return B.propCanvas('ball', { spin: (spin | 0) % 4, r: 3.7, w: 9, h: 9 }); }

// ─── the floor ──────────────────────────────────────────────────────────────

/* Boards in perspective, the lane under the rim in the home colour, the
   baseline and the free throw line running into the picture, the arc. It is
   painted once per size, cell by cell, with the wood on the same five-step
   ramp as everything else, cool and dark at the back, warm at the front. */
var FLOORS = {};
function courtFloor(cw, ch, fy, rimX, playY, c1){
  var key = [cw, ch, fy, rimX, playY, c1].join('|');
  if (FLOORS[key]) return FLOORS[key];
  var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  var c = cv.getContext('2d');
  var R = B.ramp('#c48a52'), paint = B.ramp(mix(c1, '#c48a52', 0.3)), line = '#f2ead6';
  var rect = function(x, y, w, h, col){ c.fillStyle = col; c.fillRect(x, y, w, h); };
  var slant = 0.42, ftX = function(y){ return rimX - 40 + (y - playY) * slant; }, baseX = function(y){ return rimX + 9 + (y - playY) * slant; };
  var laneFar = playY - 15, laneNear = playY + 9;
  var plank = 0, acc = 0, row = 2;
  for (var y = fy; y < ch; y++) {
    var u = (y - fy) / Math.max(1, ch - fy);
    if (++acc > row) { acc = 0; plank++; row = 1 + Math.round(u * 4); }
    var seam = acc === 0;
    var base = u < 0.18 ? 1 : u < 0.62 ? 2 : 3;
    for (var x = 0; x < cw; x++) {
      var t = base;
      var h = B.hash(plank * 977 + Math.floor((x + plank * 13) / (9 + Math.round(u * 10))));
      if (h % 5 === 0) t = Math.max(0, t - 1);
      var inLane = y >= laneFar && y <= laneNear && x >= ftX(y) && x <= baseX(y);
      var col = inLane ? paint[t] : R[t];
      if (seam) col = (inLane ? paint : R)[Math.max(0, t - 1)];
      else if (h % 23 === 0) col = (inLane ? paint : R)[Math.max(0, t - 1)];
      rect(x, y, 1, 1, col);
    }
  }
  c.globalAlpha = 0.85;
  /* the lines */
  for (var y2 = Math.max(fy, laneFar); y2 <= Math.min(ch - 1, laneNear); y2++) { rect(Math.round(ftX(y2)), y2, 1, 1, line); rect(Math.round(baseX(y2)), y2, 1, 1, line); }
  for (var y3 = fy; y3 < ch; y3++) rect(Math.round(baseX(y3)), y3, 1, 1, line);
  [laneFar, laneNear].forEach(function(ly){ if (ly >= fy && ly < ch) rect(Math.round(ftX(ly)), ly, Math.round(baseX(ly) - ftX(ly)), 1, line); });
  /* the free throw circle, the half away from the rim */
  for (var a = 0; a < 64; a++) { var th = Math.PI / 2 + a / 63 * Math.PI, cy = (laneFar + laneNear) / 2;
    var px = Math.round(ftX(cy) + Math.cos(th) * 11), py = Math.round(cy + Math.sin(th) * 7);
    if (py >= fy && py < ch) rect(px, py, 1, 1, line); }
  /* the arc, around the rim, squashed by the camera */
  for (var b = 0; b < 160; b++) { var th2 = Math.PI / 2 + b / 159 * Math.PI;
    var qx = Math.round(rimX + Math.cos(th2) * 74), qy = Math.round(playY - 3 + Math.sin(th2) * 19);
    if (qy >= fy && qy < ch && qx >= 0) rect(qx, qy, 1, 1, line); }
  c.globalAlpha = 1;
  /* the back of the floor falls into shadow */
  var gr = c.createLinearGradient(0, fy, 0, fy + (ch - fy) * 0.45);
  gr.addColorStop(0, 'rgba(10,12,30,.55)'); gr.addColorStop(1, 'rgba(10,12,30,0)');
  c.fillStyle = gr; c.fillRect(0, fy, cw, ch - fy);
  FLOORS[key] = cv;
  return cv;
}

// ─── the stage ───────────────────────────────────────────────────────────────

/* A court or a room, sized to its host: about 128 cells tall, one cell a
   whole number of pixels, so a 64-cell man stands about half the height.
     opts.room   'nba' | 'col' | 'hs' | 'gl' | 'intl' | 'draft' | 'hall' | 'press'...
     opts.hoop   draw the basket (a court) or not (a room)
     opts.c1, c2 the home colours (the building's), opts.oc the other club's
     opts.me     { look, c1, c2, num, age } */
function stage(host, opts){
  cssOnce();
  opts = opts || {};
  var el = document.createElement('div');
  el.className = 'ct';
  el.style.setProperty('--c1', opts.bug1 || opts.c1 || '#c8102e');
  el.style.setProperty('--oc', opts.oc || '#3a4566');
  el.style.setProperty('--ink1', B.inkOn(opts.bug1 || opts.c1 || '#c8102e'));
  el.style.setProperty('--ink2', B.inkOn(opts.oc || '#3a4566'));
  el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="ct-call" aria-live="polite"></div><div class="ct-rp" hidden>Replay</div>';
  host.appendChild(el);
  var cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  var st = { el: el, cw: 160, ch: 128, k: 3, room: null, floor: null, fy: 70, floorY: 120, playY: 120, rim: [120, 30], tick: 0, state: {}, opts: opts, raf: 0, timer: 0, dead: false, slow: 1 };
  var roomC1 = opts.roomC1 || opts.c1, roomC2 = opts.roomC2 || opts.c2;
  function fit(){
    var W = el.clientWidth || 360, H = el.clientHeight || 280;
    /* Wide enough for a three: 130 cells across at least, so a phone gets a
       smaller man on a real court rather than a big man cut off at the edge,
       and tall enough for a dunk. Whichever binds sets the cell. */
    var k = Math.max(2, Math.min(Math.floor((H - (opts.pad || 0)) / 124), Math.floor(W / 130)));
    var cw = Math.ceil(W / k), ch = Math.floor(H / k);
    if (cw === st.cw && ch === st.ch && st.room) return;
    st.k = k; st.cw = cw; st.ch = ch;
    cv.width = cw; cv.height = ch;
    cv.style.width = (cw * k) + 'px'; cv.style.height = (ch * k) + 'px';
    /* Anything laid over the bottom of the court (the meter) pushes the
       floor up so it never covers the man. */
    st.floorY = ch - 6 - Math.ceil((opts.pad || 0) / k);
    if (opts.stand) st.floorY = Math.max(66, Math.min(st.floorY, Math.round(ch * opts.stand)));
    st.playY = st.floorY;
    st.fy = Math.round(ch * 0.58);
    var rimX = Math.round(Math.min(cw * 0.8, cw / 2 + 74));
    st.rim = [rimX, Math.max(18, st.floorY - 96)];
    st.floor = opts.hoop ? courtFloor(cw, ch, st.fy, rimX, st.playY, roomC1 || '#c8102e') : null;
    var art = K.room(opts.room || 'nba', cw, ch, { c1: roomC1, c2: roomC2, floorAt: 0.58, seed: 'court:' + (opts.room || 'nba'), spotAt: 0.5 });
    var im = new Image();
    im.onload = function(){ st.room = im; draw(); };
    im.src = art.url;
    draw();
  }
  st.fit = fit;
  var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(el); else window.addEventListener('resize', fit);

  function rect(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  var METAL = B.ramp('#4a5470'), GLASS = 'rgba(200,225,255,.30)';
  /* The basket: a stanchion with a padded base, the arm, the glass seen edge
     on with its frame and a glint, the rim traced in two halves so a ball can
     drop between them, and a net that snaps. */
  function hoopBack(s){
    var rx = st.rim[0], ry = st.rim[1] + (s.rimShake ? (s.rimShake % 2 ? -1 : 1) : 0);
    var px = Math.min(st.cw - 4, rx + 24), base = st.playY - 2;
    rect(px, ry - 4, 4, base - ry, METAL[2]); rect(px, ry - 4, 1, base - ry, METAL[4]); rect(px + 3, ry - 4, 1, base - ry, METAL[0]);
    rect(px - 3, base - 14, 10, 14, mix(roomC1 || '#c8102e', '#05070d', 0.25)); rect(px - 3, base - 14, 10, 1, mix(roomC1 || '#c8102e', '#ffffff', 0.25));
    rect(px - 3, base - 1, 10, 1, '#05070d');
    rect(rx + 10, ry - 5, px - rx - 10, 3, METAL[2]); rect(rx + 10, ry - 5, px - rx - 10, 1, METAL[4]);
    rect(rx + 7, ry - 24, 4, 31, GLASS); rect(rx + 7, ry - 24, 4, 1, '#ffffff'); rect(rx + 7, ry + 6, 4, 1, '#ffffff');
    rect(rx + 7, ry - 24, 1, 31, 'rgba(255,255,255,.75)'); rect(rx + 10, ry - 24, 1, 31, 'rgba(160,180,220,.6)');
    if (!REDUCED && st.tick % 24 < 3) rect(rx + 8, ry - 20 + (st.tick % 24) * 6, 1, 4, '#ffffff');
    var back = B.propCanvas('rim', { half: 'back' });
    ctx.drawImage(back, Math.round(rx - back.width / 2), Math.round(ry - 3));
  }
  function hoopFront(s){
    var rx = st.rim[0], ry = st.rim[1] + (s.rimShake ? (s.rimShake % 2 ? -1 : 1) : 0);
    var n = s.net || 0;
    var len = n === 1 ? 13 : n === 2 ? 8 : 10, wide = n === 2 ? 1 : 0;
    for (var i = 0; i < 7; i++) {
      var x0 = rx - 6 + i * 2, x1 = rx - 3 + i + (n === 1 ? 0 : wide * (i - 3) * 0.3);
      for (var y = 0; y < len; y++) {
        var u = y / len, xx = Math.round(lerp(x0, x1, u) + (y % 3 === 1 ? 0.5 : 0));
        rect(xx, ry + 1 + y, 1, 1, i < 2 ? '#aab2c4' : y % 2 ? '#eef1f6' : '#c3c9d6');
      }
    }
    for (var j = 0; j < 4; j++) rect(rx - 4 + j * 2, ry + 1 + Math.round(len * 0.45), 2, 1, '#aab2c4');
    var front = B.propCanvas('rim', { half: 'front' });
    ctx.drawImage(front, Math.round(rx - front.width / 2), Math.round(ry - 3));
  }

  var conf = [];
  function drawActor(a, refl){
    var who = a.who === 'me' ? opts.me : a.who;
    if (!who) return;
    var sp = sprite(who, a.pose);
    var j = a.jump || 0, x = Math.round(a.x) - 22, y = Math.round(a.y - 62 - j);
    if (refl) {
      /* the floor is varnished: a faint, upside-down copy under the feet */
      ctx.save(); ctx.globalAlpha = 0.1;
      ctx.beginPath(); ctx.rect(0, a.y + 1, st.cw, 20); ctx.clip();
      ctx.translate(a.flip ? x + 44 : x, a.y * 2 + 2 + j); ctx.scale(a.flip ? -1 : 1, -1);
      ctx.drawImage(sp, 0, Math.round(a.y - 62));
      ctx.restore();
      return;
    }
    if (a.alpha != null) { ctx.save(); ctx.globalAlpha = a.alpha; }
    if (a.flip) { ctx.save(); ctx.translate(x + 44, y); ctx.scale(-1, 1); ctx.drawImage(sp, 0, 0); ctx.restore(); }
    else ctx.drawImage(sp, x, y);
    if (a.alpha != null) ctx.restore();
  }
  function draw(){
    var s = st.state || {};
    ctx.clearRect(0, 0, st.cw, st.ch);
    ctx.imageSmoothingEnabled = false;
    var fy = st.fy;
    if (st.room) {
      /* A loud building jumps: the crowd above the floor moves a cell. */
      var bump = s.loud >= 2 && !REDUCED && (st.tick % 4 < 2) ? 1 : 0;
      ctx.drawImage(st.room, 0, 0, st.cw, fy, 0, -bump, st.cw, fy);
      ctx.drawImage(st.room, 0, fy, st.cw, st.ch - fy, 0, fy, st.cw, st.ch - fy);
      if (bump) rect(0, fy - 1, st.cw, 1, '#05070d');
    } else rect(0, 0, st.cw, st.ch, '#0b0e1a');
    /* depth: the upper deck falls into the dark */
    var gr = ctx.createLinearGradient(0, 0, 0, fy);
    gr.addColorStop(0, 'rgba(4,6,14,.62)'); gr.addColorStop(0.7, 'rgba(4,6,14,.18)'); gr.addColorStop(1, 'rgba(4,6,14,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, st.cw, fy);
    if (st.floor) {
      ctx.drawImage(st.floor, 0, 0);
      /* the scorer's table ribbon, in the building's colours, scrolling when it's loud */
      rect(0, fy - 6, st.cw, 6, '#05070d');
      var off = s.loud >= 2 && !REDUCED ? (st.tick * 2) % 24 : 0, rc1 = roomC1 || '#c8102e', rc2 = roomC2 || '#ffffff';
      for (var bx = -24 + off; bx < st.cw; bx += 24) { rect(bx, fy - 5, 16, 4, rc1); rect(bx + 3, fy - 4, 10, 1, rc2); rect(bx + 3, fy - 2, 6, 1, mix(rc2, rc1, 0.5)); }
      /* a pool of light where the play is */
      var fx = s.focus != null ? s.focus : st.rim[0] - 40;
      var lg = ctx.createRadialGradient(fx, st.playY - 6, 2, fx, st.playY - 6, 70);
      lg.addColorStop(0, 'rgba(255,236,196,.22)'); lg.addColorStop(1, 'rgba(255,236,196,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, fy, st.cw, st.ch - fy);
    }
    if (s.flash && !REDUCED) for (var f = 0; f < 6; f++) { var fx2 = ((st.tick * 37 + f * 53) % st.cw), fyy = ((st.tick * 11 + f * 29) % Math.round(st.ch * 0.5)); rect(fx2, fyy, 1, 1, '#fffbe8'); rect(fx2 - 1, fyy, 3, 1, 'rgba(255,251,232,.5)'); rect(fx2, fyy - 1, 1, 3, 'rgba(255,251,232,.5)'); }
    if (s.spot) { ctx.fillStyle = 'rgba(5,7,13,.55)'; ctx.fillRect(0, 0, st.cw, st.ch); }
    if (opts.hoop) hoopBack(s);
    var acts = (s.actors || []).slice().sort(function(a, b){ return (a.y + (a.z || 0)) - (b.y + (b.z || 0)); });
    if (st.floor) acts.forEach(function(a){ drawActor(a, true); });
    var ball = s.ball;
    /* the ball's shadow on the floor, smaller and fainter the higher it is */
    if (ball && st.floor) { var gy = ball.floor || st.playY, hgt = Math.max(0, gy - ball.y), sw = Math.max(1, 4 - Math.round(hgt / 18));
      ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0.08, 0.32 - hgt / 260).toFixed(2) + ')'; ctx.fillRect(Math.round(ball.x) - sw, gy, sw * 2, 1); }
    if (ball && ball.behind) drawBall(ball);
    acts.forEach(function(a){
      if (s.spot) { var sw2 = 30; ctx.fillStyle = 'rgba(255,236,196,.16)'; ctx.fillRect(Math.round(a.x) - sw2 / 2, 0, sw2, a.y + 2); }
      var j = a.jump || 0;
      var shw = Math.max(5, 11 - Math.round(j / 4));
      ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(Math.round(a.x) - shw, a.y, shw * 2, 1);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(Math.round(a.x) - shw + 2, a.y + 1, shw * 2 - 4, 1);
      drawActor(a, false);
    });
    if (opts.hoop) hoopFront(s);
    if (ball && !ball.behind) drawBall(ball);
    if (s.dust) s.dust.forEach(function(d){ var r = d.t; rect(d.x - r, d.y - 1, 1, 1, 'rgba(230,214,190,.7)'); rect(d.x + r, d.y - 1, 1, 1, 'rgba(230,214,190,.7)'); rect(d.x - r + 1, d.y - 2, 1, 1, 'rgba(230,214,190,.45)'); rect(d.x + r - 1, d.y - 2, 1, 1, 'rgba(230,214,190,.45)'); });
    if (s.props) s.props.forEach(function(p){ drawProp(p); });
    if (s.confetti && !REDUCED) {
      if (conf.length < 70) for (var c = 0; c < 4; c++) conf.push({ x: Math.random() * st.cw, y: -2, v: 0.6 + Math.random() * 0.9, c: [opts.c1, opts.c2, '#ffd166', '#ffffff'][(Math.random() * 4) | 0] });
      conf.forEach(function(p){ p.y += p.v; p.x += Math.sin((p.y + p.v * 9) / 6) * 0.4; rect(p.x, p.y, (p.y | 0) % 3 ? 2 : 1, 1, p.c); });
      conf = conf.filter(function(p){ return p.y < st.ch; });
    } else if (!s.confetti) conf = [];
  }
  function drawBall(b){ var a = ballArt(b.spin != null ? b.spin : 0); ctx.drawImage(a, Math.round(b.x) - 4, Math.round(b.y) - 4); }
  /* A banner going up to the rafters, a ring box, a podium, a trophy. The
     solid ones are traced (B.propCanvas); the cloth ones are shaded here. */
  function drawProp(p){
    if (p.kind === 'banner') {
      var bw = 18, bh = 26, x = Math.round(p.x - bw / 2), y = Math.round(p.y), R = B.ramp(p.c1);
      rect(x + bw / 2, 0, 1, y, '#8a93a8');
      for (var i = 0; i < bw; i++) rect(x + i, y, 1, bh, R[i < 3 ? 3 : i > bw - 4 ? 1 : 2]);
      rect(x, y, bw, 1, R[4]);
      for (var i2 = 0; i2 < bw; i2 += 2) rect(x + i2, y + bh, 1, 2, p.c2);
      rect(x + 2, y + 3, bw - 4, 1, p.c2); rect(x + 2, y + bh - 4, bw - 4, 1, p.c2);
      if (p.text) drawDigits(String(p.text), x + bw / 2, y + 8, p.c2);
    } else if (p.kind === 'jersey') {
      var jx = Math.round(p.x - 8), jy = Math.round(p.y), J = B.ramp(p.c1);
      rect(jx + 3, jy, 10, 2, J[2]);
      for (var c = 0; c < 16; c++) rect(jx + c, jy + 2, 1, 16, J[c < 4 ? 3 : c > 12 ? 1 : 2]);
      rect(jx + 5, jy, 6, 3, '#05070d');
      rect(jx, jy + 2, 3, 6, '#05070d'); rect(jx + 13, jy + 2, 3, 6, '#05070d');
      rect(jx + 3, jy + 2, 10, 1, p.c2); rect(jx, jy + 17, 16, 1, J[0]);
      if (p.text) drawDigits(String(p.text), jx + 8, jy + 7, p.c2);
    } else {
      var opt = p.kind === 'podium' ? { c1: p.c1 || '#1a2445', c2: p.c2 || '#c9ccd6' } : {};
      var art = B.propCanvas(p.kind, opt);
      var ax = Math.round(p.x - art.width / 2), ay = p.kind === 'podium' ? st.floorY - art.height + 1 : Math.round(p.y - art.height / 2);
      ctx.drawImage(art, ax, ay);
    }
  }
  var FONT = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'],
    5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
  function drawDigits(t, cx, y, col){
    var w = t.length * 4 - 1, x0 = Math.round(cx - w / 2);
    for (var i = 0; i < t.length; i++) { var g = FONT[t[i]]; if (!g) continue; for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 3; xx++) if (g[yy][xx] === '1') rect(x0 + i * 4 + xx, y + yy, 1, 1, col); }
  }

  /* Play a clip: a function of the tick that returns the state to draw, for
     `len` ticks, with sound cues at ticks. clip.slow plays it at a fraction of
     the speed (a replay). Reduced motion draws the key tick and holds it. */
  st.play = function(clip, done){
    cancelAnimationFrame(st.raf); clearTimeout(st.timer);
    var t = 0, last = 0, acc = 0, per = TICK * (clip.slow || 1);
    var cues = clip.cues || {};
    if (REDUCED) {
      st.tick = clip.key != null ? clip.key : clip.len - 1;
      st.state = clip.at(st.tick); draw();
      if (clip.call) st.say(clip.call, clip.big);
      Object.keys(cues).forEach(function(k){ if (+k <= st.tick && !clip.slow) S.cue(cues[k]); });
      st.timer = setTimeout(function(){ if (!st.dead && done) done(); }, clip.hold != null ? clip.hold : clip.loop ? 1e9 : 600);
      return;
    }
    if (clip.call) st.say(clip.call, clip.big);
    function frame(now){
      if (st.dead) return;
      if (!last) last = now;
      acc += now - last; last = now;
      while (acc >= per) {
        acc -= per;
        if (cues[t] && !clip.slow) S.cue(cues[t]);
        st.tick = t;
        st.state = clip.at(t);
        t++;
        if (t >= clip.len && !clip.loop) { draw(); if (done) done(); return; }
        if (clip.loop && t >= clip.len) t = 0;
      }
      draw();
      st.raf = requestAnimationFrame(frame);
    }
    st.state = clip.at(0); draw();
    st.raf = requestAnimationFrame(frame);
  };
  /* A run of clips, one after another. */
  st.run = function(list, done){
    var i = 0;
    (function next(){
      if (st.dead) return;
      if (i >= list.length) { if (done) done(); return; }
      var c = list[i++];
      if (typeof c === 'function') c = c();
      if (!c) return next();
      st.play(c, next);
    })();
  };
  /* The lower third: a name plate on the home colour with a gold rule. */
  st.l3 = function(name, sub){
    var l = el.querySelector('.ct-l3');
    if (!name) { if (l) l.hidden = true; return; }
    if (!l) { l = document.createElement('div'); l.className = 'ct-l3'; el.appendChild(l); }
    l.hidden = false;
    l.innerHTML = '<i></i><div><b>' + esc(name) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  };
  st.say = function(text, big){ var c = el.querySelector('.ct-call'); c.textContent = text || ''; c.classList.toggle('big', !!big); };
  /* How the press went, over the court for a beat. */
  st.feedback = function(text, tone){
    var o = el.querySelector('.ct-fbk'); if (o) o.parentNode.removeChild(o);
    if (!text) return;
    o = document.createElement('div'); o.className = 'ct-fbk ' + (tone || ''); o.textContent = text; el.appendChild(o);
    setTimeout(function(){ if (o.parentNode) o.parentNode.removeChild(o); }, 900);
  };
  st.replay = function(on){ el.classList.toggle('ct-bars', !!on); el.querySelector('.ct-rp').hidden = !on; };
  st.stop = function(){ st.dead = true; cancelAnimationFrame(st.raf); clearTimeout(st.timer); if (ro) ro.disconnect(); if (el.parentNode) el.parentNode.removeChild(el); };
  fit();
  return st;
}

// ─── the moves ───────────────────────────────────────────────────────────────

/* A frame of a set, cycling at `per` ticks a frame. */
function cyc(set, t, per){ return set + (Math.floor(t / (per || 2)) % B.SETS[set]); }
function arc(p0, p1, h, u){ return [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u) - Math.sin(Math.PI * u) * h]; }
function hand(pose, a, build, s){
  var h = B.handAt(pose, s == null ? 1 : s, build) || [33, 30];
  if (a.flip) h = [44 - h[0], h[1]];
  return [Math.round(a.x) - 22 + h[0], Math.round(a.y - 62 - (a.jump || 0)) + h[1]];
}
/* The ball bouncing under a dribbling hand. */
function dribbleBall(st, a, build, t){
  var hn = hand(a.pose, a, build);
  var ph = (t % 8) / 8, by = ph < 0.5 ? lerp(hn[1] + 3, st.playY - 3, ph * 2) : lerp(st.playY - 3, hn[1] + 3, (ph - 0.5) * 2);
  return { x: hn[0] + (a.flip ? -1 : 1), y: by, spin: t };
}

/* The clips every moment is made of. */
var CLIPS = {
  /* dribbling in place, the ball going down and up off the floor */
  dribble: function(st, x, build, len, extra){
    return { len: len || 24, loop: !len, at: function(t){
      var p = cyc('dribble', t, 2), a = { who: 'me', x: x, y: st.playY, pose: p };
      return { actors: [a].concat(extra ? extra(t) : []), ball: dribbleBall(st, a, build, t), loud: 2, focus: x };
    }, cues: { 3: 'bounce', 11: 'bounce', 19: 'bounce' } };
  },
  /* gather, rise, release: the ball leaves at the last tick */
  rise: function(st, x, build, extra, drift){
    var seq = ['shot0', 'shot0', 'shot1', 'shot1', 'shot2', 'shot2'];
    return { len: 6, at: function(t){
      var p = seq[t], jmp = [0, 0, 3, 6, 9, 10][t], a = { who: 'me', x: x - (drift || 0) * t / 5, y: st.playY, pose: p, jump: jmp };
      var hn = hand(p, a, build);
      return { actors: [a].concat(extra ? extra(t) : []), ball: { x: hn[0], y: hn[1] - 2 }, loud: 3, focus: x };
    }, cues: { 1: 'squeak' } };
  },
  /* the ball in flight from a point to the rim, make or miss */
  flight: function(st, from, made, actors, len, hi){
    var rx = st.rim[0], ry = st.rim[1];
    len = len || 14;
    var end = made ? [rx, ry - 1] : [rx + 4, ry - 2];
    var h = Math.max(18, Math.abs(end[0] - from[0]) * 0.35) * (hi || 1);
    return { len: len, at: function(t){
      var u = t / (len - 1), b = arc(from, end, h, ease(u * 0.92 + 0.08 * u));
      return { actors: actors ? actors(t) : [], ball: { x: b[0], y: b[1], behind: u > 0.85 && made, spin: t }, loud: 3, focus: (from[0] + rx) / 2 };
    } };
  },
  /* through the net, or off the rim */
  result: function(st, made, actors){
    var rx = st.rim[0], ry = st.rim[1];
    if (made) return { len: 10, at: function(t){
      return { actors: actors ? actors(t) : [], ball: t < 7 ? { x: rx, y: ry + 2 + t * 2.2, behind: t < 4, spin: t } : { x: rx - (t - 6) * 2, y: st.playY - 3 - (t === 8 ? 3 : 0), spin: t }, net: t < 2 ? 1 : t < 4 ? 2 : 0, loud: 3, focus: rx };
    }, cues: { 0: 'swish', 8: 'bounce' } };
    return { len: 12, at: function(t){
      var b = t < 2 ? [rx + 4, ry - 2 - t * 2] : arc([rx + 4, ry - 6], [rx - 30, st.playY - 4], 22, (t - 2) / 9);
      return { actors: actors ? actors(t) : [], ball: { x: b[0], y: b[1], spin: t }, rimShake: t < 4 ? t + 1 : 0, loud: 1, focus: rx - 10 };
    }, cues: { 0: 'clank', 11: 'bounce' } };
  },
  /* A miss that a teammate tips back in at the horn. */
  tip: function(st, mate, me){
    var rx = st.rim[0], ry = st.rim[1];
    return { len: 14, at: function(t){
      var mx = lerp(rx - 34, rx - 12, Math.min(1, t / 5));
      var m = { who: mate, x: mx, y: st.playY, pose: t < 5 ? cyc('walk', t, 1) : t < 9 ? 'block2' : 'cheer1', jump: t < 5 ? 0 : t < 9 ? [8, 22, 30, 26][t - 5] : 0 };
      var ball = t < 6 ? { x: lerp(rx - 6, rx - 14, t / 5), y: ry - 6 - Math.sin(t / 5 * Math.PI) * 8, spin: t } : t < 11 ? { x: rx, y: ry + (t - 7) * 3, behind: t < 9, spin: t } : { x: rx - (t - 10) * 2, y: st.playY - 3 };
      return { actors: [m].concat(me ? [me] : []), ball: ball, net: t >= 8 && t < 10 ? 1 : 0, loud: 3, flash: t > 8, focus: rx - 10 };
    }, cues: { 0: 'squeak', 7: 'slap', 8: 'swish', 9: 'buzzer', 10: 'roar' } };
  },
  /* After: one of several celebrations, or one of several ways to hurt. */
  react: function(st, x, made, len, style, mate){
    len = len || 18;
    var CELE = {
      roar: function(t){ return { p: ['cheer1', 'cheer1', 'cheer0', 'cheer0', 'cheer3', 'cheer3'][Math.floor(t / 3) % 6], j: t < 6 ? [0, 2, 4, 4, 2, 0][t] : 0 }; },
      flex: function(t){ return { p: t < 8 ? 'cheer3' : 'cheer2', j: 0 }; },
      point: function(t){ return { p: t < 5 ? 'cheer1' : 'cheer2', j: t < 4 ? 2 : 0, flip: t > 9 }; },
      shimmy: function(t){ return { p: Math.floor(t / 2) % 2 ? 'cheer1' : 'cheer3', j: 0 }; },
      chest: function(t){ return { p: t < 6 ? 'cheer0' : 'cheer1', j: t > 5 && t < 11 ? [3, 7, 9, 7, 3][t - 6] : 0, dx: t < 6 ? t * 1.5 : 9 }; },
      head: function(t){ return { p: t < 9 ? 'sad1' : 'sad0', j: 0 }; },
      hips: function(){ return { p: 'sad0', j: 0 }; },
      knees: function(t){ return { p: t < 5 ? 'sad1' : 'sad2', j: 0 }; },
    };
    var f = CELE[style] || CELE[made ? 'roar' : 'head'];
    return { len: len, key: len - 1, at: function(t){
      var r = f(t), a = { who: 'me', x: x + (r.dx || 0), y: st.playY, pose: r.p, jump: r.j, flip: r.flip };
      var acts = [a];
      if (style === 'chest' && mate) acts.push({ who: mate, x: x + 22 - (t < 6 ? t * 1.5 : 9), y: st.playY, pose: t < 6 ? 'cheer0' : 'cheer1', jump: a.jump, flip: true });
      return { actors: acts, loud: made ? 3 : 0, flash: made, confetti: made && st.opts.confetti, focus: x };
    }, cues: made ? { 0: 'roar' } : { 0: 'groan' } };
  },
};

// ─── the controls ────────────────────────────────────────────────────────────

/* THE METER. The cursor swings like a pendulum, so it is slowest at the ends
   and fastest through the middle where the green is: a press is an
   anticipation, not a wait at the edge. Inside the green is a gold core, a
   perfect release. Turn where the cursor stopped into a touch from -1 to 1:
   the core is 1, the edge of the green a half, and it falls away fast outside
   it to -1 at the far end of the bar. */
function touchOf(pos, zone, center){
  var c = center == null ? 0.5 : center, d = Math.abs(pos - c), core = zone * 0.3;
  if (d <= core) return 1;
  if (d <= zone) return 1 - 0.5 * (d - core) / (zone - core);
  if (d <= zone + 0.06) return 0.5 - 0.5 * (d - zone) / 0.06;
  var far = Math.max(c, 1 - c);
  return clamp(-(d - zone - 0.06) / Math.max(0.01, far - zone - 0.06), -1, 0);
}
/* The green: a rating of 30 is a sliver, 95 is under a quarter of the bar. */
function zoneFor(rating){ return clamp(0.035 + (rating - 30) * 0.0012, 0.035, 0.115); }
/* THE READ. ms after the real move; a press before it is a bite. A better
   rating buys a little time, never the read itself. */
function reactTouch(ms, rating){
  if (ms < 0) return -0.8;
  var d = ms - clamp((rating - 55) * 1.6, -40, 70);
  if (d <= 210) return 1;
  if (d <= 350) return 1 - 0.6 * (d - 210) / 140;
  if (d <= 560) return 0.4 - 0.8 * (d - 350) / 210;
  return -0.7;
}
function grade(q){ return q >= 0.97 ? ['Perfect', 'p'] : q >= 0.4 ? ['Good', 'g'] : q >= 0 ? ['Off', 'b'] : ['Way off', 'b']; }

function controls(spec, st){
  var ctl = document.createElement('div');
  ctl.className = 'ct-ctl';
  ctl.innerHTML = '<div class="ct-lab"><span class="ct-rn"></span><span class="ct-tip"></span></div>'
    + '<div class="ct-bar" role="presentation"><i class="ct-zone"><i class="ct-perf"></i></i><i class="ct-cur"></i></div>'
    + '<div class="ct-cue" hidden><i></i><span>Read him</span><i></i></div>'
    + '<button class="ct-go" type="button">Go</button>'
    + '<div class="ct-hint">Tap, or press Space</div>';
  ctl.hidden = true;
  if (spec.ctlHost) { ctl.classList.add('ct-ctl-in'); spec.ctlHost.appendChild(ctl); } else st.el.appendChild(ctl);
  var bar = ctl.querySelector('.ct-bar'), zEl = ctl.querySelector('.ct-zone'), cEl = ctl.querySelector('.ct-cur'), go = ctl.querySelector('.ct-go');
  var cue = ctl.querySelector('.ct-cue'), cueTx = cue.querySelector('span');
  var cur = null, raf = 0, timers = [];
  function clear(){ cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; }
  function label(rn, tip, btn){ ctl.querySelector('.ct-rn').textContent = rn || ''; ctl.querySelector('.ct-tip').textContent = tip || ''; go.textContent = btn || 'Go'; }
  function finish(q, words, tone){
    if (!cur) return;
    var done = cur.done; cur = null; clear();
    ctl.hidden = true; ctl.removeAttribute('data-armed');
    st.say('');
    st.feedback(words, tone);
    if (tone === 'p') S.cue('perfect');
    done(Math.round(q * 100) / 100);
  }
  var api = {
    el: ctl,
    /* o: { zone, speed (passes a second), nerves 0..1, rn, tip, btn } */
    meter: function(o, done){
      clear();
      cur = { kind: 'meter', done: done };
      label(o.rn, o.tip || 'Stop it in the gold', o.btn);
      bar.hidden = false; cue.hidden = true; ctl.hidden = false; ctl.setAttribute('data-armed', 'meter');
      var zone = o.zone, center = 0.5, phase = 0, pos = 0, last = 0, t0 = 0;
      var w = Math.PI * (o.speed || 1);
      var place = function(){ zEl.style.left = ((center - zone) * 100) + '%'; zEl.style.width = (zone * 200) + '%'; cEl.style.left = (pos * 100) + '%'; };
      cur.press = function(forced){
        var q = forced != null ? forced : touchOf(pos, zone, center), d = pos - center, right = Math.sin(phase) >= 0;
        var gr = grade(q), words = gr[0];
        if (gr[1] !== 'p' && Math.abs(d) > zone * 0.3) words = forced != null ? 'Shot clock' : ((d < 0) === right ? 'Early' : 'Late');
        if (gr[1] === 'g') words = 'Good, ' + words.toLowerCase();
        finish(q, words, gr[1]);
      };
      if (REDUCED) { pos = center - zone * 0.9; place(); return; }
      place();
      raf = requestAnimationFrame(function sw(now){
        if (!cur) return;
        if (!last) { last = now; t0 = now; }
        var dt = Math.min(0.05, (now - last) / 1000); last = now;
        phase += dt * w;
        pos = 0.5 - 0.5 * Math.cos(phase);
        /* nerves: the green will not hold still */
        center = 0.5 + (o.nerves || 0) * 0.08 * Math.sin((now - t0) / 1000 * 2.7);
        place();
        if (now - t0 > 6500) { cur.press(-0.7); return; }
        raf = requestAnimationFrame(sw);
      });
    },
    /* o: { at (ms to the real move), fakes [ms], rating, rn, tip, btn, onFake(i), onCue() } */
    react: function(o, done){
      clear();
      cur = { kind: 'react', done: done };
      label(o.rn, o.tip || 'Press when he goes', o.btn);
      bar.hidden = true; cue.hidden = false; cue.classList.remove('now'); cueTx.textContent = o.wait || 'Read him';
      ctl.hidden = false; ctl.setAttribute('data-armed', 'react');
      var t0 = performance.now(), cueAt = null, faked = 0;
      (o.fakes || []).forEach(function(ms, i){ timers.push(setTimeout(function(){ faked++; if (o.onFake) o.onFake(i); S.cue('squeak'); }, ms)); });
      timers.push(setTimeout(function(){
        cueAt = performance.now();
        if (o.onCue) o.onCue();
        /* the lamp is late on purpose: the man moves first */
        timers.push(setTimeout(function(){ cue.classList.add('now'); cueTx.textContent = 'Now'; }, REDUCED ? 0 : 160));
        timers.push(setTimeout(function(){ if (cur) cur.press(true); }, 1100));
      }, o.at));
      cur.press = function(timeout){
        if (timeout === true) return finish(-0.7, 'Too late', 'b');
        if (cueAt == null) return finish(-0.8, faked ? 'Bit on the fake' : 'Too early', 'b');
        var ms = performance.now() - cueAt + (REDUCED ? -200 : 0);
        var q = reactTouch(ms, o.rating || 60);
        var gr = grade(q);
        finish(q, gr[1] === 'p' ? 'Perfect read' : gr[1] === 'g' ? 'Good read' : 'Late', gr[1]);
      };
    },
    press: function(){ if (cur && cur.press) cur.press(); },
    armed: function(){ return !!cur; },
    stop: function(){ clear(); cur = null; if (ctl.parentNode) ctl.parentNode.removeChild(ctl); },
  };
  go.onclick = function(e){ e.stopPropagation(); api.press(); };
  st.el.addEventListener('click', function(e){ if (cur) { e.stopPropagation(); api.press(); } });
  return api;
}

// ─── the moments ─────────────────────────────────────────────────────────────

/* What a moment is: where you stand, what the press is, and the variants the
   seed picks from, so the same card is not the same picture every time. */
var MOMENTS = {
  three: { at: -70, act: 'jumper', v: ['pullup', 'catch', 'stepback'] },
  mid: { at: -46, act: 'jumper', v: ['fade', 'pullup', 'stepback'] },
  drive: { at: -82, act: 'drive', v: ['dunk', 'layup', 'dunk'] },
  pass: { at: -66, act: 'pass', v: ['corner', 'cut'] },
  buzzer: { at: -74, act: 'jumper', v: ['heave', 'stepback', 'pullup', 'catch'] },
  ft: { at: -54, act: 'ft', v: ['ft'] },
  poster: { at: -82, act: 'drive', v: ['poster'] },
  stop: { at: -30, act: 'stop', v: ['iso', 'iso'] },
  block: { at: -40, act: 'block', v: ['chase'] },
};
var VARIANTS = MOMENTS;
/* Which moment a Game 7 option is. */
var CLUTCH_KIND = ['three', 'drive', 'mid', 'pass'];

/* Play a moment on a host. spec: { kind, rating, rateName, me, mate, c1, c2,
   oc, oc2, room, roomC1, roomC2, bug: { home, away, clock, period }, intro,
   makeCall(s), missCall(s), confetti, pressure, nerves, seed, variant, look }.
   cb.resolve(touch or { touch, touches }) returns { made, won, shots } from
   the engine. cb.done(made) when the court is finished. */
function moment(host, spec, cb){
  var M = MOMENTS[spec.kind] || MOMENTS.mid;
  var R = rngOf(spec.seed || spec.kind);
  var variant = spec.variant || pickOf(R, M.v);
  var st = stage(host, { pad: spec.ctlHost ? 0 : 140, room: spec.room || 'nba', hoop: true, c1: spec.c1, c2: spec.c2, roomC1: spec.roomC1, roomC2: spec.roomC2, oc: spec.oc, me: spec.me, confetti: spec.confetti });
  var el = st.el, build = spec.me && spec.me.look ? B.normal(spec.me.look).build : 'standard';
  var bugFin = null;
  if (spec.bug) {
    var bug = document.createElement('div');
    bug.className = 'ct-bug';
    bug.innerHTML = '<span class="tm">' + esc(spec.bug.home) + '</span><span class="op">' + esc(spec.bug.away) + '</span><span>' + esc(spec.bug.period || 'Q4') + '</span><span class="clk' + (REDUCED ? '' : ' hot') + '">' + esc(spec.bug.clock || '0:07') + '</span>';
    el.appendChild(bug);
    bugFin = function(won){ var c = bug.querySelector('.clk'); c.className = 'fin ' + (won ? 'w' : 'l'); c.textContent = 'Final · ' + (won ? 'W' : 'L'); };
  }
  var ctl = controls(spec, st);
  function onKey(e){
    if (!ctl.armed()) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ctl.press(); }
  }
  document.addEventListener('keydown', onKey, true);
  function calls(x){ return Array.isArray(x) ? pickOf(R, x) : x; }
  var rating = spec.rating || 60, pressure = spec.pressure || 0;
  var rn = (spec.rateName || 'Touch') + ' ' + (rating | 0);
  /* the people on the floor: a defender in the other kit, with no face, and
     an invented teammate in yours */
  var oppLook = B.lookFor('opp:' + (spec.oc || '') + ':' + (spec.seed || ''));
  var opp = { look: oppLook, c1: spec.oc || '#3a4566', c2: spec.oc2 || '#c9ccd6', num: '', age: 26, faceless: true };
  var opp2 = { look: B.lookFor('opp2:' + (spec.seed || '')), c1: opp.c1, c2: opp.c2, num: '', age: 27, faceless: true };
  var mate = spec.mate && spec.mate.look ? { look: spec.mate.look, c1: spec.c1, c2: spec.c2, num: spec.mate.num || '', age: 26 } : null;
  var celebrate = pickOf(R, mate ? ['roar', 'flex', 'point', 'chest', 'shimmy'] : ['roar', 'flex', 'point', 'shimmy']);
  var hurt = pickOf(R, ['head', 'hips', 'knees']);
  var rx = function(){ return st.rim[0]; }, x0 = function(){ return st.rim[0] + (variant === 'heave' ? -98 : M.at); };
  S.crowd(3, 2.4);

  var outcome = null;
  function resolve(arg){
    var res = cb.resolve ? cb.resolve(arg) : { made: (typeof arg === 'number' ? arg : arg.touch) > 0 };
    outcome = res || { made: false };
    return outcome;
  }
  /* the end: the reaction, the final, the call */
  function finish(made, call, x){
    var won = outcome && outcome.won;
    var list = [];
    var shot = made === true || made === 2;
    if (won === true && !shot && mate && /jumper|drive|pass|ft/.test(M.act)) list.push(CLIPS.tip(st, mate, { who: 'me', x: x, y: st.playY, pose: 'shot4' }));
    if (won === false && shot) list.push(CLIPS.react(st, x, true, 6, celebrate, mate));
    var happy = won == null ? shot : won;
    list.push(CLIPS.react(st, x, happy, 20, happy ? (won != null && !shot ? 'roar' : celebrate) : hurt, mate));
    st.run(list, function(){
      if (won != null && bugFin) bugFin(won);
      st.say(call, true);
      setTimeout(function(){ document.removeEventListener('keydown', onKey, true); if (cb.done) cb.done(made); }, REDUCED ? 600 : 1400);
    });
  }
  /* A made shot at the horn is shown again, slower, between letterbox bars. */
  function withReplay(list, made, replay){
    if (!made || REDUCED || !(pressure >= 1 || spec.kind === 'buzzer')) return list;
    return list.concat([function(){ st.replay(true); var c = replay(); c.slow = 2.2; return c; }, function(){ st.replay(false); return null; }]);
  }
  function callFor(made){ return made ? calls(spec.makeCall) : calls(spec.missCall); }

  /* ── a jumper: pull-up, catch-and-shoot, step-back, fadeaway or a heave ── */
  function jumper(){
    var x = x0(), dx = rx() - x;
    /* the closeout stands a step deeper on the floor, so he is beside you rather than on top of you */
    var defX = x + Math.min(24, dx * 0.4);
    var D = function(pose, jump){ return { who: opp, x: defX, y: st.playY - 7, pose: pose, jump: jump || 0, flip: true }; };
    var hi = variant === 'heave' ? 1.35 : 1;
    var speed = 0.9 + pressure * 0.3 + (variant === 'stepback' ? 0.18 : variant === 'heave' ? 0.3 : variant === 'catch' ? -0.12 : variant === 'fade' ? 0.1 : 0);
    var zone = zoneFor(rating) * (variant === 'catch' ? 1.15 : variant === 'heave' ? 0.7 : 1);
    var tip = { pullup: 'Pull up. Stop it in the gold', catch: 'Catch and shoot', stepback: 'Step back. Quicker meter', fade: 'Fade away. Quicker meter', heave: 'From the logo. Small green' }[variant];
    function arm(){
      ctl.meter({ zone: zone, speed: speed, nerves: spec.nerves || 0, rn: rn, tip: tip, btn: 'Release' }, shoot);
    }
    if (variant === 'catch' && mate) {
      st.play({ len: 12, at: function(t){
        var m = { who: mate, x: Math.max(14, x - 46), y: st.playY + 1, pose: t < 4 ? cyc('dribble', t, 2) : 'shake1' };
        var me = { who: 'me', x: x, y: st.playY, pose: t < 8 ? 'stand' : 'shot0' };
        var mh = hand(m.pose, m, 'standard'), myh = hand('shot0', me, build);
        var ball = t < 4 ? dribbleBall(st, m, 'standard', t) : t < 9 ? { x: lerp(mh[0], myh[0], (t - 4) / 4), y: lerp(mh[1], myh[1], (t - 4) / 4) - Math.sin((t - 4) / 4 * Math.PI) * 3, spin: t } : { x: myh[0], y: myh[1] };
        return { actors: [m, me, D('block0')], ball: ball, loud: 2, focus: x };
      }, cues: { 5: 'slap' }, call: spec.intro || '' }, function(){
        st.play({ len: 2, loop: true, at: function(){ var me = { who: 'me', x: x, y: st.playY, pose: 'shot0' }, h = hand('shot0', me, build); return { actors: [{ who: mate, x: Math.max(14, x - 46), y: st.playY + 1, pose: 'stand' }, me, D('block0')], ball: { x: h[0], y: h[1] - 2 }, loud: 2, focus: x }; } });
        arm();
      });
    } else {
      st.play(Object.assign(CLIPS.dribble(st, x, build, null, function(){ return [D('block0')]; }), { call: spec.intro || '' }));
      arm();
    }
    function shoot(q){
      var res = resolve(q), made = !!res.made;
      var sx = x;
      var moves = [];
      if (variant === 'stepback') {
        moves.push({ len: 5, at: function(t){ var a = { who: 'me', x: x - t * 2, y: st.playY, pose: cyc('walk', t, 1), jump: t === 2 ? 2 : 0 }; var hn = hand(a.pose, a, build); return { actors: [a, D('block0')], ball: { x: hn[0], y: hn[1] }, loud: 3, focus: x }; }, cues: { 0: 'squeak' } });
        sx = x - 8;
      }
      var drift = variant === 'fade' ? 7 : 0;
      /* a good release beats the closeout; a bad one gets a hand in its face */
      var late = q >= 0.6 ? 3 : 0;
      moves.push(CLIPS.rise(st, sx, build, function(t){ var ju = Math.max(0, t - late); return [D(ju > 1 ? 'block1' : 'block0', [0, 0, 4, 9, 13, 15][ju] || 0)]; }, drift));
      var from = function(){ var a = { who: 'me', x: sx - drift, y: st.playY, pose: 'shot2', jump: 10 }, f = hand('shot2', a, build); return [f[0], f[1] - 2]; };
      var flyActors = function(t){ return [{ who: 'me', x: sx - drift - (drift ? Math.min(4, t) : 0), y: st.playY, pose: t < 5 ? 'shot3' : 'shot4', jump: Math.max(0, 10 - t * 2) }, D(t < 4 ? 'block2' : 'stand', Math.max(0, 15 - t * 4))]; };
      var flen = variant === 'heave' ? 20 : spec.kind === 'three' || spec.kind === 'buzzer' ? 16 : 13;
      moves.push(function(){ return CLIPS.flight(st, from(), made, flyActors, flen, hi); });
      moves.push(function(){ return CLIPS.result(st, made, function(){ return [{ who: 'me', x: sx - drift, y: st.playY, pose: 'shot4' }, D('stand')]; }); });
      st.run(withReplay(moves, made, function(){ return CLIPS.flight(st, from(), made, flyActors, flen, hi); }), function(){
        if (spec.kind === 'buzzer' || spec.kind === 'three') S.cue('buzzer');
        finish(made, callFor(made), sx - drift);
      });
    }
  }

  /* ── a drive: the gather, then the rise. A dunk, a layup or a poster ── */
  function drive(){
    var x = x0(), end = rx() - 26;
    var poster = variant === 'poster', layup = variant === 'layup';
    var bigX = rx() - 16;
    var big = function(pose, jump, dx){ return { who: opp2, x: bigX + (dx || 0), y: st.playY - 1, pose: pose, jump: jump || 0, flip: true, z: -1 }; };
    var onball = function(t, x1){ return { who: opp, x: x1 + 12, y: st.playY - 2, pose: cyc('walk', t, 2), flip: true, z: -2 }; };
    var extra = function(t){ return poster ? [big('block0')] : [onball(t, x)]; };
    st.play(Object.assign(CLIPS.dribble(st, x, build, null, extra), { call: spec.intro || '' }));
    var zone = zoneFor(rating);
    ctl.meter({ zone: zone * 1.1, speed: 0.85 + pressure * 0.25, nerves: spec.nerves || 0, rn: rn, tip: 'The gather. Time your last step', btn: 'Gather' }, function(q1){
      st.play({ len: 8, loop: false, at: function(t){
        var p = cyc('dribble', t, 2), xx = lerp(x, end - 8, t / 7), a = { who: 'me', x: xx, y: st.playY, pose: t < 7 ? p : 'dunk0' };
        var acts = [a].concat(poster ? [big('block0')] : [onball(t, lerp(x, end - 14, t / 7))]);
        return { actors: acts, ball: t < 7 ? dribbleBall(st, a, build, t) : { x: hand('dunk0', a, build)[0], y: hand('dunk0', a, build)[1] }, loud: 3, dust: t === 7 ? [{ x: xx, y: st.playY, t: 3 }] : null, focus: xx };
      }, cues: { 0: 'squeak', 4: 'bounce' } }, function(){
        st.play({ len: 2, loop: true, at: function(){ var a = { who: 'me', x: end - 8, y: st.playY, pose: 'dunk1' }, h = hand('dunk1', a, build); return { actors: [a].concat(poster ? [big('block0')] : [onball(0, end - 14)]), ball: { x: h[0], y: h[1] }, loud: 3, focus: end }; } });
        ctl.meter({ zone: zone * 0.9, speed: 1.2 + pressure * 0.3, nerves: spec.nerves || 0, rn: rn, tip: 'Now rise. Faster meter', btn: poster ? 'Rise up' : 'Take off' }, function(q2){
          var q = Math.min(q1, q2) < -0.5 ? Math.min(q1, q2) : 0.4 * q1 + 0.6 * q2;
          finishDrive(q);
        });
      });
    });
    function finishDrive(q){
      var res = resolve(q), made = !!res.made;
      var seq = layup ? ['shot0', 'shot1', 'shot1', 'shot2', 'shot2', 'shot2', 'shot3', 'shot3', 'shot3', 'shot4'] : ['dunk0', 'dunk1', 'dunk1', 'dunk2', 'dunk2', 'dunk2', 'dunk2', 'dunk3', 'dunk3', 'dunk3'];
      var top = layup ? 24 : 40, jumps = layup ? [0, 0, 6, 12, 18, 22, 24, 24, 22, 18] : [0, 0, 0, 10, 22, 32, 38, 40, 40, 40];
      var list = [
        { len: 10, at: function(t){
          var xx = lerp(end - 8, end, Math.min(1, t / 6));
          var a = { who: 'me', x: xx, y: st.playY, pose: seq[t], jump: jumps[t] };
          var hn = hand(seq[t], a, build);
          var acts = [a].concat(poster ? [big(t > 4 ? 'block1' : 'block0', t > 4 ? (t - 4) * 4 : 0)] : []);
          return { actors: acts, ball: { x: hn[0] - 1, y: hn[1] - 2 }, loud: 3, focus: xx };
        }, cues: { 2: 'squeak' } },
        function(){ return made
          ? (layup ? CLIPS.result(st, true, function(t){ return [{ who: 'me', x: end, y: st.playY, pose: 'shot4', jump: Math.max(0, top - t * 6) }]; })
            : { len: 14, key: 3, at: function(t){
              var a = { who: 'me', x: end, y: st.playY, pose: t < 8 ? 'dunk4' : 'shot4', jump: t < 8 ? top : Math.max(0, top - (t - 7) * 12) };
              var acts = [a].concat(poster ? [big(t < 3 ? 'block1' : 'sad2', t < 3 ? 6 : 0, -Math.min(10, t * 2))] : []);
              return { actors: acts, ball: t < 6 ? { x: st.rim[0], y: st.rim[1] + 3 + t * 3, behind: t < 3 } : { x: st.rim[0] - (t - 5) * 2, y: st.playY - 3 }, net: t < 2 ? 1 : t < 4 ? 2 : 0, rimShake: t < 6 ? t + 1 : 0, loud: 3, flash: true, dust: poster && t > 2 && t < 8 ? [{ x: bigX - t * 2, y: st.playY, t: t - 2 }] : null, focus: end };
            }, cues: { 0: 'thud', 1: 'swish', 9: 'bounce' } })
          : poster ? { len: 14, key: 4, at: function(t){
            var a = { who: 'me', x: end - Math.min(8, t), y: st.playY, pose: t < 5 ? 'dunk3' : 'sad1', jump: Math.max(0, top - t * 8) };
            return { actors: [a, big('block0')], ball: { x: lerp(st.rim[0] - 10, st.rim[0] - 40, t / 13), y: st.playY - 3 - Math.max(0, 20 - t * 3), spin: t }, loud: 1, focus: end };
          }, cues: { 1: 'thud', 3: 'whistle' } }
            : CLIPS.result(st, false, function(t){ return [{ who: 'me', x: end, y: st.playY, pose: 'shot4', jump: Math.max(0, top - t * 10) }]; }); },
      ];
      st.run(withReplay(list, made && !layup, function(){ return list[0]; }), function(){ finish(made, callFor(made), end); });
    }
  }

  /* ── two free throws: two presses, a breath between ── */
  function ft(){
    var x = x0();
    var crowd = function(t){ return { loud: 2, flash: t % 9 < 2 }; };
    st.play(Object.assign({ len: 24, loop: true, at: function(t){ var p = cyc('dribble', t, 3), a = { who: 'me', x: x, y: st.playY, pose: p }; return Object.assign({ actors: [a], ball: dribbleBall(st, a, build, t), focus: x }, crowd(t)); }, cues: { 4: 'bounce', 16: 'bounce' } }, { call: spec.intro || '' }));
    var zone = zoneFor(rating) * 1.1, speed = 0.8 + pressure * 0.3;
    ctl.meter({ zone: zone, speed: speed, nerves: spec.nerves || 0, rn: rn, tip: 'First shot', btn: 'Shoot' }, function(a){
      st.say('Breathe.');
      setTimeout(function(){
        if (st.dead) return;
        st.say('');
        ctl.meter({ zone: zone, speed: speed + 0.12, nerves: Math.min(1, (spec.nerves || 0) + 0.25), rn: rn, tip: 'Second shot', btn: 'Shoot' }, function(b){
          var res = resolve({ touch: (a + b) / 2, touches: [a, b] });
          var n = typeof res.made === 'number' ? res.made : res.made ? 2 : 0;
          var shots = res.shots || (n === 2 ? [true, true] : n === 1 ? [true, false] : [false, false]);
          var seq = [];
          shots.forEach(function(mk, si){
            seq.push(CLIPS.dribble(st, x, build, 8));
            seq.push(CLIPS.rise(st, x, build));
            seq.push(function(){ var aa = { who: 'me', x: x, y: st.playY, pose: 'shot2', jump: 10 }; var f = hand('shot2', aa, build); return CLIPS.flight(st, [f[0], f[1] - 2], mk, function(t){ return [{ who: 'me', x: x, y: st.playY, pose: t < 5 ? 'shot3' : 'shot4', jump: Math.max(0, 10 - t * 2) }]; }, 12); });
            seq.push(function(){ return Object.assign(CLIPS.result(st, mk, function(){ return [{ who: 'me', x: x, y: st.playY, pose: 'shot4' }]; }), { call: si === 0 ? (mk ? 'One.' : 'Off the front.') : '' }); });
          });
          st.run(seq, function(){ finish(n, n === 2 ? calls(spec.makeCall) : n === 1 ? spec.halfCall || calls(spec.missCall) : calls(spec.missCall), x); });
        });
      }, REDUCED ? 200 : 700);
    });
  }

  /* ── the pass: read the cutter, hit him in stride ── */
  function pass(){
    var x = x0();
    var m = mate || { look: B.lookFor('mate:' + (spec.seed || '')), c1: spec.c1, c2: spec.c2, num: '', age: 26 };
    var dbl = spec.look === 'double';
    var defs = function(t){ var a = [{ who: opp, x: x + 11, y: st.playY - 1, pose: 'block0', flip: true, z: -1 }]; if (dbl) a.push({ who: opp2, x: x - 10, y: st.playY - 2, pose: cyc('walk', t, 2), z: -2 }); return a; };
    var cut = { x: variant === 'corner' ? rx() - 104 : rx() - 96, open: false, t0: 0 };
    var startX = cut.x;
    st.play(Object.assign({ len: 24, loop: true, at: function(t){
      var a = { who: 'me', x: x, y: st.playY, pose: cyc('dribble', t, 2) };
      if (cut.open) cut.x = Math.min(rx() - 30, cut.x + 1.2);
      var mm = { who: m, x: cut.open ? cut.x : startX + Math.sin(t / 4) * 2, y: st.playY + 4, pose: cut.open ? (cut.x >= rx() - 31 ? 'up' : cyc('walk', t, 1)) : 'stand', z: 2 };
      return { actors: [a, mm].concat(defs(t)), ball: dribbleBall(st, a, build, t), loud: 2, focus: x };
    } }, { call: spec.intro || '' }));
    var at = 900 + Math.floor(R() * 900);
    ctl.react({ at: at, fakes: dbl ? [] : [Math.floor(at * 0.45)], rating: rating, rn: rn, tip: 'Hit him the moment he cuts', btn: 'Pass', wait: 'Find him',
      onFake: function(){ st.say(''); }, onCue: function(){ cut.open = true; S.cue('squeak'); } }, function(q){
      var res = resolve(q), made = !!res.made;
      var mx = rx() - 30;
      var list = [
        { len: 6, at: function(t){ var a = { who: 'me', x: x, y: st.playY, pose: t < 3 ? 'shot0' : 'shake1' }, hn = hand(a.pose, a, build); return { actors: [a, { who: m, x: mx, y: st.playY + 4, pose: 'up', z: 2 }].concat(defs(t)), ball: { x: lerp(hn[0], mx, t / 5), y: lerp(hn[1], st.playY - 36, t / 5) - Math.sin(t / 5 * Math.PI) * 4, spin: t }, loud: 3, focus: (x + mx) / 2 }; }, cues: { 0: 'slap' } },
        function(){ return CLIPS.flight(st, [mx + 2, st.playY - 44], made, function(t){ return [{ who: 'me', x: x, y: st.playY, pose: 'stand' }, { who: m, x: mx, y: st.playY + 4, pose: t < 3 ? 'shot2' : 'shot4', jump: Math.max(0, 14 - t * 3), z: 2 }].concat(defs(t)); }, 9); },
        function(){ return CLIPS.result(st, made, function(){ return [{ who: 'me', x: x, y: st.playY, pose: 'stand' }, { who: m, x: mx, y: st.playY + 4, pose: 'shot4', z: 2 }]; }); },
      ];
      st.run(list, function(){ finish(made, callFor(made), x); });
    });
  }

  /* ── the last stop: he jabs, he jabs, he goes. Slide with the real one ── */
  function stop(){
    var ox = rx() - 60, mx = rx() - 34;
    var st8 = { off: 0, go: false, cross: false };
    var O = function(pose, dx, jump){ return { who: opp, x: ox + (dx || 0), y: st.playY, pose: pose, jump: jump || 0 }; };
    st.play(Object.assign({ len: 24, loop: true, at: function(t){
      var o = O(cyc('dribble', t, 2), st8.off);
      var me = { who: 'me', x: mx, y: st.playY - 1, pose: 'block0', flip: true, z: -1 };
      var b = dribbleBall(st, o, 'standard', t);
      if (st8.cross) b.x -= 8;
      return { actors: [o, me], ball: b, loud: 2, focus: (ox + mx) / 2, dust: st8.go ? [{ x: ox, y: st.playY, t: 3 }] : null };
    } }, { call: spec.intro || '' }));
    var fakes = [], n = pressure >= 1 ? 2 : 1 + Math.floor(R() * 2);
    for (var i = 0; i < n; i++) fakes.push(500 + i * 520 + Math.floor(R() * 200));
    var at = fakes[fakes.length - 1] + 520 + Math.floor(R() * 500);
    ctl.react({ at: at, fakes: fakes, rating: rating, rn: rn, tip: 'Jabs are fakes. Slide when the ball crosses', btn: 'Slide', wait: 'Stay down',
      onFake: function(){ st8.off = 4; setTimeout(function(){ st8.off = 0; }, 260); },
      onCue: function(){ st8.cross = true; st8.go = true; st8.off = 6; } }, function(q){
      var res = resolve(q), made = !!res.made;
      var end = rx() - 20;
      var list = [
        { len: 10, at: function(t){
          var u = t / 9, o = { who: opp, x: lerp(ox + 6, end, u), y: st.playY, pose: t < 6 ? cyc('dribble', t, 2) : 'shot2', jump: t < 6 ? 0 : (t - 5) * 3 };
          var me = made ? { who: 'me', x: lerp(mx, end + 9, u), y: st.playY - 1, pose: t < 6 ? cyc('walk', t, 1) : 'block1', jump: t < 6 ? 0 : (t - 5) * 4, flip: true, z: -1 }
            : { who: 'me', x: lerp(mx, mx - 6, u), y: st.playY - 1, pose: t < 3 ? 'block0' : cyc('walk', t, 1), flip: true, z: -1 };
          var hn = hand(o.pose, o, 'standard');
          return { actors: [o, me], ball: { x: hn[0], y: hn[1] - 1, spin: t }, loud: 3, focus: end };
        }, cues: { 0: 'squeak', 6: 'squeak' } },
        function(){ return { len: 14, key: 2, at: function(t){
          var o = { who: opp, x: end, y: st.playY, pose: made ? 'shot4' : 'shot3', jump: Math.max(0, 15 - t * 3) };
          var me = { who: 'me', x: made ? end + 9 : mx - 6, y: st.playY - 1, pose: made ? (t < 6 ? 'block2' : 'block3') : 'sad0', jump: made ? Math.max(0, 16 - t * 3) : 0, flip: made, z: -1 };
          var ball = made ? (t < 4 ? { x: end + 4 + t * 3, y: st.rim[1] - 2 - t, spin: t } : { x: st.rim[0] + 4 - (t - 4) * 4, y: st.rim[1] + (t - 4) * (t - 4) * 0.8, spin: t })
            : (t < 6 ? { x: lerp(end + 4, st.rim[0], t / 5), y: st.rim[1] - 8 + t, behind: t > 3, spin: t } : { x: st.rim[0] - (t - 5) * 2, y: Math.min(st.playY - 3, st.rim[1] + (t - 5) * 5) });
          return { actors: [o, me], ball: ball, net: !made && t > 5 && t < 9 ? 1 : 0, rimShake: made && t > 3 && t < 7 ? t : 0, loud: made ? 3 : 1, flash: made && t > 4, focus: end };
        }, cues: made ? { 4: 'clank', 6: 'roar' } : { 6: 'swish', 8: 'groan' } }; },
      ];
      st.run(list, function(){ finish(made, callFor(made), made ? end + 9 : mx - 6); });
    });
  }

  /* ── the chase-down: he is gone, you are four steps behind. Go up when he does ── */
  function block(){
    var ox0 = rx() - 96, end = rx() - 14;
    var stB = { t: 0, up: false };
    st.play(Object.assign({ len: 60, at: function(t){
      stB.t = t;
      var ox = Math.min(end - 12, lerp(ox0, end - 12, t / 40));
      var o = { who: opp, x: ox, y: st.playY, pose: stB.up ? 'dunk1' : cyc('dribble', t, 1) };
      var me = { who: 'me', x: Math.min(ox - 6, lerp(ox0 - 40, end - 26, t / 40)), y: st.playY + 2, pose: cyc('walk', t, 1), z: 1 };
      return { actors: [o, me], ball: stB.up ? { x: hand('dunk1', o, 'standard')[0], y: hand('dunk1', o, 'standard')[1] } : dribbleBall(st, o, 'standard', t), loud: 2, focus: ox };
    } }, { call: spec.intro || '' }));
    var at = 1500 + Math.floor(R() * 900), fakes = pressure >= 0.5 ? [Math.floor(at * 0.6)] : [];
    ctl.react({ at: at, fakes: fakes, rating: rating, rn: rn, tip: 'Go up when he leaves the floor', btn: 'Swat', wait: 'Chase',
      onFake: function(){ st.say('Hesitation...'); setTimeout(function(){ st.say(''); }, 400); },
      onCue: function(){ stB.up = true; S.cue('squeak'); } }, function(q){
      var res = resolve(q), made = !!res.made;
      st.run([
        { len: 10, at: function(t){
          var o = { who: opp, x: end - 6 + t * 0.6, y: st.playY, pose: t < 3 ? 'dunk1' : 'dunk2', jump: t < 3 ? 0 : Math.min(30, (t - 2) * 6) };
          var me = { who: 'me', x: lerp(end - 26, end - 14, t / 9), y: st.playY + 2, pose: t < 4 ? cyc('walk', t, 1) : 'block1', jump: t < 4 ? 0 : (t - 3) * (made ? 7 : 5), z: 1 };
          var hn = hand(o.pose, o, 'standard');
          return { actors: [o, me], ball: { x: hn[0], y: hn[1] - 1 }, loud: 3, focus: end };
        }, cues: { 0: 'squeak', 5: 'squeak' } },
        function(){ return { len: 14, key: 2, at: function(t){
          var o = { who: opp, x: end, y: st.playY, pose: made ? 'shot4' : 'dunk3', jump: Math.max(0, 28 - t * 5) };
          var me = { who: 'me', x: end - 12, y: st.playY + 2, pose: made ? (t < 6 ? 'block2' : 'block3') : 'block3', jump: made ? Math.max(0, 40 - t * 6) : Math.max(0, 24 - t * 6), z: 1 };
          var ball = made ? (t < 3 ? { x: st.rim[0] + 7, y: st.rim[1] - 8, spin: 0 } : { x: st.rim[0] + 7 - (t - 2) * 4, y: st.rim[1] - 8 + (t - 2) * (t - 2) * 0.7, spin: t }) : (t < 6 ? { x: st.rim[0], y: st.rim[1] + 2 + t * 2.5, behind: t < 3 } : { x: st.rim[0] - (t - 5) * 2, y: st.playY - 3 });
          return { actors: [o, me], ball: ball, net: !made && t < 4 ? (t < 2 ? 1 : 2) : 0, loud: made ? 3 : 1, flash: made, focus: end };
        }, cues: made ? { 0: 'slap', 1: 'roar' } : { 1: 'swish', 2: 'whistle' } }; },
      ], function(){ finish(made, callFor(made), end - 12); });
    });
  }

  ({ jumper: jumper, drive: drive, ft: ft, pass: pass, stop: stop, block: block })[M.act]();

  return { stop: function(){ document.removeEventListener('keydown', onKey, true); ctl.stop(); st.stop(); }, press: function(){ ctl.press(); }, armed: function(){ return ctl.armed(); }, stage: st, variant: variant, touchOf: touchOf };
}

// ─── the ceremonies ──────────────────────────────────────────────────────────

/* The moments a career is remembered for, played rather than told: the walk
   across a draft stage and the handshake, the All-Star intro under one light,
   the podium, ring night with a banner going up, a number going to the
   rafters, the Hall. Each is a list of clips against a stage, and c is the
   scene's context (the player, his colours, the year, the commissioner).

   The commissioner is drawn because he is invented: career.js makes him up
   with the rest of the career's people, and so are the teammates who join a
   title celebration. Nobody real is drawn. */
function suitOf(who, dress){ var o = {}; for (var k in who) o[k] = who[k]; o.dress = dress; return o; }
function walkTo(st, who, x0, x1, len, extra){
  return { len: len, at: function(t){
    var a = { who: who, x: lerp(x0, x1, t / (len - 1)), y: st.floorY, pose: cyc('walk', t, 2), flip: x1 < x0 };
    return { actors: [a].concat(extra ? extra(t) : []) };
  }, cues: { 2: 'squeak' } };
}
function mates(c, n){
  var out = [];
  for (var i = 0; i < n; i++) out.push({ look: B.lookFor('team:' + (c.nick || '') + ':' + (c.year || '') + ':' + i), c1: c.c1, c2: c.c2, num: String((B.hash('n:' + i + (c.nick || '')) % 40) + 1), age: 25 + i });
  return out;
}
var CEREMONY = {
  jersey: function(st, c){
    var me = suitOf(st.opts.me, 'suit'), cap = suitOf(st.opts.me, 'cap'), cx = Math.round(st.cw / 2);
    var com = { look: B.lookFor('commish:' + (c.commish || '')), c1: '#1b2238', c2: '#c9ccd6', num: '', age: 58, dress: 'suit' };
    var comA = function(pose){ return { who: com, x: cx + 16, y: st.floorY, pose: pose || 'suit' }; };
    st.l3(c.name, c.pick ? 'Pick ' + c.pick + ' · ' + (c.teamName || '') : (c.teamName || ''));
    return [
      walkTo(st, me, -26, cx - 16, 16, function(){ return [comA()]; }),
      { len: 10, at: function(t){ return { actors: [{ who: me, x: cx - 16, y: st.floorY, pose: 'shake' + (Math.floor(t / 2) % 3), flip: true }, { who: com, x: cx + 16, y: st.floorY, pose: 'shake' + (Math.floor(t / 2) % 3) }], flash: true }; }, cues: { 0: 'flash', 4: 'flash' } },
      { len: 22, key: 21, at: function(t){ return { actors: [{ who: cap, x: cx - 16, y: st.floorY, pose: 'cheer1' }, comA()], props: [{ kind: 'jersey', x: cx - 16, y: st.floorY - 82 - (t < 4 ? 4 - t : 0), c1: c.c1, c2: c.c2, text: c.num }], flash: true, loud: 2 }; }, cues: { 0: 'chime', 3: 'flash', 9: 'flash' } },
    ];
  },
  allstar: function(st, c){
    var cx = Math.round(st.cw / 2), me = st.opts.me;
    st.l3(c.name, 'All-Star · #' + c.num);
    return [
      walkTo(st, me, st.cw + 26, cx, 18, null),
      { len: 22, key: 14, at: function(t){ return { actors: [{ who: me, x: cx, y: st.floorY, pose: t < 12 ? 'wave' + (Math.floor(t / 2) % 3) : 'cheer1' }], spot: true, flash: t > 4, loud: 3 }; }, cues: { 0: 'organ', 12: 'roar' } },
    ].map(function(cl){ var at = cl.at; cl.at = function(t){ var s = at(t); s.spot = true; return s; }; return cl; });
  },
  award: function(st, c){
    var me = suitOf(st.opts.me, 'suit'), px = Math.round(st.cw / 2) + 18;
    st.l3(c.name, c.award || 'Most Valuable Player');
    var pod = { kind: 'podium', x: px, c1: c.c1, c2: c.c2 };
    return [
      { len: 18, at: function(t){ return { actors: [{ who: me, x: lerp(-26, px - 24, t / 17), y: st.floorY, pose: cyc('walk', t, 2) }], props: [pod] }; }, cues: { 2: 'squeak' } },
      { len: 24, key: 20, at: function(t){ return { actors: [{ who: me, x: px - 24, y: st.floorY, pose: t < 8 ? 'suit' : 'cheer0' }], props: [pod, { kind: 'trophy', x: px - 2, y: st.floorY - 40 - (t < 6 ? 6 - t : 0) }], flash: true, loud: 2 }; }, cues: { 0: 'chime', 8: 'flash', 14: 'flash' } },
    ];
  },
  ring: function(st, c){
    var me = st.opts.me, cx = Math.round(st.cw / 2), team = mates(c, 2);
    st.l3(c.name, 'Ring night · ' + (c.year - 1));
    var bx = Math.round(st.cw * 0.22);
    return [
      walkTo(st, me, -26, cx, 16, function(t){ return [{ who: team[0], x: cx - 30, y: st.floorY - 3, pose: 'stand', z: -1 }, { who: team[1], x: cx + 30, y: st.floorY - 3, pose: 'stand', z: -1 }]; }),
      { len: 30, key: 29, at: function(t){
        var by = Math.max(4, st.floorY - 40 - t * 4);
        return { actors: [{ who: me, x: cx, y: st.floorY, pose: t < 10 ? 'stand' : 'up' }, { who: team[0], x: cx - 30, y: st.floorY - 3, pose: t < 12 ? 'stand' : 'cheer1', z: -1 }, { who: team[1], x: cx + 30, y: st.floorY - 3, pose: t < 14 ? 'stand' : 'cheer0', z: -1 }],
          props: [{ kind: 'banner', x: bx, y: by, c1: c.c1, c2: c.c2, text: String(c.year - 1).slice(2) }, { kind: 'ring', x: cx, y: st.floorY - 66 + (t < 10 ? 30 - t * 3 : 0) }], loud: 3, flash: true, confetti: t > 10 };
      }, cues: { 0: 'organ', 10: 'roar', 12: 'flash' } },
    ];
  },
  rafters: function(st, c){
    var me = suitOf(st.opts.me, 'suit'), cx = Math.round(st.cw / 2);
    st.l3(c.name, 'Number ' + c.num + ' · ' + (c.jerseyName || c.teamName || ''));
    return [
      { len: 34, key: 33, at: function(t){
        var by = Math.max(3, st.floorY - 52 - t * 3);
        return { actors: [{ who: me, x: cx + 22, y: st.floorY, pose: t < 10 ? 'suit' : 'wave' + (Math.floor(t / 2) % 3), dress: 'suit' }], props: [{ kind: 'banner', x: cx - 20, y: by, c1: c.jc1 || c.c1, c2: c.jc2 || c.c2, text: c.num }], loud: 3, flash: t > 8 };
      }, cues: { 0: 'organ', 8: 'roar' } },
    ];
  },
  hall: function(st, c){
    var me = suitOf(st.opts.me, 'suit'), px = Math.round(st.cw / 2) + 16;
    st.l3(c.name, 'Hall of Fame · ' + (c.from || '') + (c.to ? ' to ' + c.to : ''));
    var pod = { kind: 'podium', x: px, c1: '#3a2a12', c2: '#e3a92f' };
    return [
      { len: 18, at: function(t){ return { actors: [{ who: me, x: lerp(-26, px - 24, t / 17), y: st.floorY, pose: cyc('walk', t, 2) }], props: [pod] }; }, cues: { 2: 'squeak' } },
      { len: 20, key: 12, at: function(t){ return { actors: [{ who: me, x: px - 24, y: st.floorY, pose: t < 12 ? 'wave' + (Math.floor(t / 2) % 3) : 'suit', dress: 'suit' }], props: [pod], flash: t < 10 }; }, cues: { 0: 'chime', 2: 'flash' } },
    ];
  },
  title: function(st, c){
    var me = st.opts.me, cx = Math.round(st.cw / 2), team = mates(c, 3);
    st.l3(c.name, (c.nick || 'Champions').toUpperCase() + ' · CHAMPIONS');
    var spots = [-34, 30, -14];
    return [{ len: 34, key: 14, at: function(t){
      var p = ['cheer1', 'cheer1', 'cheer0', 'cheer0', 'cheer3', 'cheer3', 'cheer1', 'cheer2'][Math.floor(t / 3) % 8];
      var acts = [{ who: me, x: cx, y: st.floorY, pose: t < 24 ? p : 'trophy', jump: t < 24 && Math.floor(t / 3) % 2 ? 4 : 0 }];
      team.forEach(function(m, i){ var run = Math.min(1, t / (8 + i * 3)); acts.push({ who: m, x: lerp(i % 2 ? st.cw + 24 : -24, cx + spots[i], run), y: st.floorY - 3 - i, pose: run < 1 ? cyc('walk', t, 1) : ['cheer1', 'cheer0', 'cheer3'][(Math.floor(t / 3) + i) % 3], jump: run >= 1 && (Math.floor(t / 3) + i) % 2 ? 3 : 0, flip: i % 2 === 1, z: -1 }); });
      return { actors: acts, loud: 3, flash: true, confetti: true };
    }, cues: { 0: 'buzzer', 2: 'roar' } }];
  },
  debut: function(st, c){
    var me = st.opts.me, cx = Math.round(st.cw / 2);
    st.l3(c.name, 'Number ' + c.num + ' · ' + (c.teamName || ''));
    return [{ len: 24, key: 20, at: function(t){
      var xx = Math.round(lerp(-24, cx, Math.min(1, t / 18))), a = { who: me, x: xx, y: st.floorY, pose: cyc('dribble', t, 2) };
      var hn = hand(a.pose, a, 'standard');
      return { actors: [a], ball: { x: hn[0] + 1, y: t % 4 < 2 ? hn[1] + 3 : st.floorY - 4, spin: t, floor: st.floorY }, loud: 2, flash: t > 10 };
    }, cues: { 3: 'bounce', 7: 'bounce', 11: 'bounce', 15: 'bounce' } }];
  },
};
/* Play a ceremony on a host. Returns { stop }. */
function ceremony(host, name, c, opts){
  var make = CEREMONY[name];
  if (!make) return null;
  var STAND = { draft: 0.585, hall: 0.73 };
  var st = stage(host, { room: opts.room || 'nba', hoop: false, c1: c.c1, c2: c.c2, me: opts.me, confetti: true, stand: STAND[opts.room] });
  var clips = make(st, c);
  st.run(clips, function(){ if (opts.done) opts.done(); });
  return { stop: st.stop, stage: st };
}

window.RTF_COURT = { API_VERSION: 2, stage: stage, moment: moment, ceremony: ceremony, CEREMONY: CEREMONY, CLIPS: CLIPS, MOMENTS: MOMENTS, VARIANTS: VARIANTS, CLUTCH_KIND: CLUTCH_KIND, touchOf: touchOf, reactTouch: reactTouch, zoneFor: zoneFor };
})();
