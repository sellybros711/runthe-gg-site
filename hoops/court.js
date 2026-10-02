/* Run The Floor: the court, and the moments played on it.
 *
 * The owner's condition for cutscenes was that they MOVE: not a player
 * standing there breathing. So this is a small timeline player on a pixel
 * half court. The man is the same sprite (baller.js draws every moving frame
 * with the same rig), the ball flies on a real arc, the rim rattles, the net
 * snaps, the building gets loud, and the sound is cued off the same ticks.
 *
 * ONE GRID. The court is drawn at one cell per sprite cell, so the man, the
 * ball, the rim and the crowd sit on the same pixel grid and the canvas is
 * scaled by a whole number. Nothing is tweened between cells: positions are
 * rounded to a cell on every tick, which is twelve a second.
 *
 * A PLAYABLE MOMENT DECIDES NOTHING ON ITS OWN. The press on the meter is a
 * touch, a number from -1 to 1, and it is handed to the engine through
 * C.choose(L, i, { touch }). The engine rolls the shot with its own seeded
 * draw, so a perfect release can still rim out, and a career played with the
 * scenes off is the same career with a touch of nought. What the court shows
 * after the press is whatever the engine said.
 *
 * ONLY THE INVENTED ARE DRAWN. You are drawn. The man you guard on a final
 * stop is a real opponent, so he is a SHADOW in his club's colour: the rig's
 * outline, filled flat, with no face and no look.
 *
 * window.RTF_COURT: stage(host, opts), moment(host, spec, cb), SHOTS, MOMENTS.
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

var CSS = [
'.ct{position:absolute;inset:0;overflow:hidden;background:#05070d;z-index:3;}',
'.ct canvas{position:absolute;left:50%;bottom:0;transform:translateX(-50%);image-rendering:pixelated;image-rendering:crisp-edges;}',
'.ct-bug{position:absolute;left:8px;top:8px;z-index:4;display:flex;align-items:stretch;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:9px;line-height:1;color:#fff;background:#05070d;box-shadow:0 -2px 0 0 #2d3a66,0 2px 0 0 #2d3a66,-2px 0 0 0 #2d3a66,2px 0 0 0 #2d3a66;}',
'.ct-bug span{display:flex;align-items:center;padding:6px 7px;}',
'.ct-bug .tm{background:var(--c1);color:var(--ink1);}',
'.ct-bug .op{background:var(--oc);color:var(--ink2);}',
'.ct-bug .clk{color:#ffd166;}',
'.ct-bug .clk.hot{animation:ctHot .5s steps(1) infinite;}',
'@keyframes ctHot{50%{color:#ff4b4b}}',
'.ct-call{position:absolute;left:0;right:0;top:40px;z-index:4;padding:8px 12px;font-family:var(--k-f-display,var(--display,Impact));font-size:clamp(16px,4.6vw,24px);letter-spacing:.03em;text-transform:uppercase;color:#fff;text-shadow:2px 2px 0 #05070d;text-align:center;pointer-events:none;}',
'.ct-call:empty{display:none;}',
'.ct-call.big{color:#ffd166;font-size:clamp(24px,8vw,46px);}',
'.ct-ctl{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:5;width:min(92%,420px);display:flex;flex-direction:column;align-items:stretch;gap:8px;}',
'.ct-ctl[hidden]{display:none;}',
'.ct-ctl.ct-ctl-in{position:static;transform:none;width:100%;max-width:440px;margin:4px auto 0;}',
'.ct-lab{display:flex;justify-content:space-between;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:8px;text-transform:uppercase;color:#cdd6f4;text-shadow:1px 1px 0 #05070d;}',
'.ct-bar{position:relative;height:18px;background:#0b0e1a;box-shadow:0 -2px 0 0 #2d3a66,0 2px 0 0 #2d3a66,-2px 0 0 0 #2d3a66,2px 0 0 0 #2d3a66;}',
'.ct-zone{position:absolute;top:0;bottom:0;background:#3ecf8e;box-shadow:inset 0 3px 0 0 #8ff0c2,inset 0 -3px 0 0 #1e8c5b;}',
'.ct-cur{position:absolute;top:-5px;bottom:-5px;width:4px;margin-left:-2px;background:#ffd166;box-shadow:0 0 0 2px #05070d;}',
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
'@media (prefers-reduced-motion:reduce){.ct-bug .clk.hot,.ct-l3{animation:none}}',
].join('\n');
function cssOnce(){
  if (document.getElementById('ct-css')) return;
  var st = document.createElement('style'); st.id = 'ct-css'; st.textContent = CSS; document.head.appendChild(st);
}

// ─── sprites, cached as canvases ─────────────────────────────────────────────

var SPR = {};
function sprite(who, pose){
  var k = JSON.stringify([who.look, who.c1, who.c2, who.num, pose, who.age, who.dress || '', who.shadow || '']);
  if (SPR[k]) return SPR[k];
  var g = B.paint(who.look, { pose: pose, c1: who.c1, c2: who.c2, num: who.num, age: who.age, dress: who.dress });
  var cv = document.createElement('canvas'); cv.width = B.W; cv.height = B.H;
  var c = cv.getContext('2d');
  for (var y = 0; y < B.H; y++) for (var x = 0; x < B.W; x++) {
    var col = g[y][x];
    if (!col) continue;
    /* A shadow: the rig's outline and its light, in one dark tint of the club. */
    if (who.shadow) col = shadowOf(col, who.shadow);
    c.fillStyle = col; c.fillRect(x, y, 1, 1);
  }
  SPR[k] = cv;
  return cv;
}
function rgb(h){ h = String(h).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hex(c){ return '#' + c.map(function(v){ v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(a, b, t){ var x = rgb(a), y = rgb(b); return hex(x.map(function(v, i){ return v + (y[i] - v) * t; })); }
function shadowOf(col, tint){
  var c = rgb(col), l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
  return mix('#0a0d16', tint, 0.18 + l * 0.32);
}
var BALL = null;
function ballArt(){
  if (BALL) return BALL;
  var g = ['..ooo..', '.ohhbo.', 'ohbkbbo', 'okkkkko', 'obbkbso', '.oskso.', '..ooo..'];
  var P = { o: '#3a1606', h: '#ffb070', b: '#e2762a', s: '#a84a14', k: '#5a260a' };
  var cv = document.createElement('canvas'); cv.width = 7; cv.height = 7;
  var c = cv.getContext('2d');
  for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++) { var ch = g[y][x]; var col = P[ch]; if (!col) continue; c.fillStyle = col; c.fillRect(x, y, 1, 1); }
  BALL = cv;
  return cv;
}

// ─── the stage ───────────────────────────────────────────────────────────────

/* A court or a room, sized to its host: about 128 cells tall, one cell a
   whole number of pixels, so a 64-cell man stands about half the height.
     opts.room   'nba' | 'col' | 'hs' | 'gl' | 'intl' | 'draft' | 'hall' | 'press'...
     opts.hoop   draw the basket (a court) or not (a room)
     opts.c1, c2 the home colours, opts.oc the other club's
     opts.me     { look, c1, c2, num, age, build } */
function stage(host, opts){
  cssOnce();
  opts = opts || {};
  var el = document.createElement('div');
  el.className = 'ct';
  el.style.setProperty('--c1', opts.c1 || '#c8102e');
  el.style.setProperty('--oc', opts.oc || '#3a4566');
  el.style.setProperty('--ink1', B.inkOn(opts.c1 || '#c8102e'));
  el.style.setProperty('--ink2', B.inkOn(opts.oc || '#3a4566'));
  el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="ct-call" aria-live="polite"></div>';
  host.appendChild(el);
  var cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  var st = { el: el, cw: 160, ch: 128, k: 3, room: null, floorY: 120, rim: [120, 30], tick: 0, state: {}, opts: opts, raf: 0, timer: 0, dead: false };
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
    /* A room with a stage (the draft theatre, the Hall) stands the man on
       the stage rather than in front of the crowd. */
    if (opts.stand) st.floorY = Math.max(66, Math.min(st.floorY, Math.round(ch * opts.stand)));
    var rimX = Math.round(Math.min(cw * 0.8, cw / 2 + 74));
    st.rim = [rimX, Math.max(18, st.floorY - 96)];
    var art = K.room(opts.room || 'nba', cw, ch, { c1: opts.c1, c2: opts.c2, floorAt: 0.58, seed: 'court:' + (opts.room || 'nba'), spotAt: 0.5 });
    var im = new Image();
    im.onload = function(){ st.room = im; draw(); };
    im.src = art.url;
    st.room = st.room || null;
    draw();
  }
  st.fit = fit;
  var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(el); else window.addEventListener('resize', fit);

  /* The basket: a stanchion off the right edge, the board, the rim in two
     halves so a ball can drop between them, and a net that snaps. */
  function hoopBack(s){
    var rx = st.rim[0], ry = st.rim[1] + (s.rimShake ? (s.rimShake % 2 ? -1 : 1) : 0);
    var px = Math.min(st.cw - 3, rx + 22);
    rect(px, ry - 2, 3, st.floorY - ry + 2, '#2a3048'); rect(px, ry - 2, 1, st.floorY - ry + 2, '#4a5470');
    rect(rx + 8, ry - 3, px - rx - 8, 3, '#2a3048'); rect(rx + 8, ry - 3, px - rx - 8, 1, '#4a5470');
    rect(rx + 6, ry - 22, 3, 28, 'rgba(210,230,255,.55)'); rect(rx + 6, ry - 22, 3, 1, '#ffffff'); rect(rx + 6, ry + 5, 3, 1, '#ffffff');
    rect(rx + 7, ry - 22, 1, 28, 'rgba(255,255,255,.85)');
    rect(rx + 6, ry - 6, 3, 6, 'rgba(255,255,255,0)');
    rect(rx - 6, ry - 1, 13, 1, '#a8380e');
  }
  function hoopFront(s){
    var rx = st.rim[0], ry = st.rim[1] + (s.rimShake ? (s.rimShake % 2 ? -1 : 1) : 0);
    var n = s.net || 0;
    var len = n === 1 ? 12 : n === 2 ? 7 : 9, wide = n === 2 ? 1 : 0;
    for (var i = 0; i < 7; i++) {
      var x0 = rx - 6 + i * 2, x1 = rx - 3 + i + (n === 1 ? 0 : wide * (i - 3) * 0.3);
      for (var y = 0; y < len; y++) {
        var u = y / len, xx = Math.round(lerp(x0, x1, u) + (y % 3 === 1 ? 0.5 : 0));
        rect(xx, ry + 1 + y, 1, 1, y % 2 ? '#e9ecf2' : '#c3c9d6');
      }
    }
    for (var j = 0; j < 4; j++) rect(rx - 4 + j * 2, ry + 1 + Math.round(len * 0.45), 2, 1, '#aab2c4');
    rect(rx - 7, ry, 15, 2, '#e2551d'); rect(rx - 7, ry, 15, 1, '#ff8a4c'); rect(rx - 7, ry + 1, 1, 1, '#a8380e'); rect(rx + 7, ry + 1, 1, 1, '#a8380e');
  }
  function rect(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

  var conf = [];
  function draw(){
    var s = st.state || {};
    ctx.clearRect(0, 0, st.cw, st.ch);
    ctx.imageSmoothingEnabled = false;
    if (st.room) {
      var fy = Math.round(st.ch * 0.58);
      /* A loud building jumps: the crowd above the floor moves a cell. */
      var bump = s.loud >= 2 && !REDUCED && (st.tick % 4 < 2) ? 1 : 0;
      ctx.drawImage(st.room, 0, 0, st.cw, fy, 0, -bump, st.cw, fy);
      ctx.drawImage(st.room, 0, fy, st.cw, st.ch - fy, 0, fy, st.cw, st.ch - fy);
      if (bump) rect(0, fy - 1, st.cw, 1, '#05070d');
    } else rect(0, 0, st.cw, st.ch, '#0b0e1a');
    if (s.flash && !REDUCED) for (var f = 0; f < 6; f++) { var fx = ((st.tick * 37 + f * 53) % st.cw), fyy = ((st.tick * 11 + f * 29) % Math.round(st.ch * 0.5)); rect(fx, fyy, 1, 1, '#fffbe8'); rect(fx - 1, fyy, 3, 1, 'rgba(255,251,232,.5)'); rect(fx, fyy - 1, 1, 3, 'rgba(255,251,232,.5)'); }
    if (s.spot) { ctx.fillStyle = 'rgba(5,7,13,.55)'; ctx.fillRect(0, 0, st.cw, st.ch); }
    if (opts.hoop) hoopBack(s);
    var ball = s.ball;
    if (ball && ball.behind) drawBall(ball);
    var acts = (s.actors || []).slice().sort(function(a, b){ return a.y - b.y; });
    acts.forEach(function(a){
      var who = a.who === 'me' ? opts.me : a.who;
      if (!who) return;
      if (s.spot) { var sw = 30; ctx.fillStyle = 'rgba(255,236,196,.16)'; ctx.fillRect(Math.round(a.x) - sw / 2, 0, sw, st.floorY + 2); }
      var j = a.jump || 0;
      var shw = Math.max(5, 11 - Math.round(j / 4));
      ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(Math.round(a.x) - shw, a.y, shw * 2, 1);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(Math.round(a.x) - shw + 2, a.y + 1, shw * 2 - 4, 1);
      var sp = sprite(who, a.pose);
      var x = Math.round(a.x) - 22, y = Math.round(a.y - 62 - j);
      if (a.flip) { ctx.save(); ctx.translate(x + 44, y); ctx.scale(-1, 1); ctx.drawImage(sp, 0, 0); ctx.restore(); }
      else ctx.drawImage(sp, x, y);
    });
    if (opts.hoop) hoopFront(s);
    if (ball && !ball.behind) drawBall(ball);
    if (s.props) s.props.forEach(function(p){ drawProp(p); });
    if (s.confetti && !REDUCED) {
      if (conf.length < 70) for (var c = 0; c < 4; c++) conf.push({ x: Math.random() * st.cw, y: -2, v: 0.6 + Math.random() * 0.9, c: [opts.c1, opts.c2, '#ffd166', '#ffffff'][(Math.random() * 4) | 0] });
      conf.forEach(function(p){ p.y += p.v; p.x += Math.sin((p.y + p.v * 9) / 6) * 0.4; rect(p.x, p.y, (p.y | 0) % 3 ? 2 : 1, 1, p.c); });
      conf = conf.filter(function(p){ return p.y < st.ch; });
    } else if (!s.confetti) conf = [];
  }
  function drawBall(b){ ctx.drawImage(ballArt(), Math.round(b.x) - 3, Math.round(b.y) - 3); }
  /* A banner going up to the rafters, a ring box, a podium. */
  function drawProp(p){
    if (p.kind === 'banner') {
      var bw = 18, bh = 26, x = Math.round(p.x - bw / 2), y = Math.round(p.y);
      rect(x + bw / 2, 0, 1, y, '#8a93a8');
      rect(x, y, bw, bh, p.c1); rect(x, y, bw, 1, mix(p.c1, '#ffffff', 0.3)); rect(x + bw - 1, y, 1, bh, mix(p.c1, '#000000', 0.35));
      for (var i = 0; i < bw; i += 2) rect(x + i, y + bh, 1, 2, p.c2);
      rect(x + 2, y + 3, bw - 4, 1, p.c2); rect(x + 2, y + bh - 4, bw - 4, 1, p.c2);
      if (p.text) drawDigits(String(p.text), x + bw / 2, y + 8, p.c2);
    } else if (p.kind === 'podium') {
      var px = Math.round(p.x - 9), py = st.floorY - 26;
      rect(px, py, 18, 26, '#1a2445'); rect(px, py, 18, 2, '#5d78c8'); rect(px + 17, py, 1, 26, '#0b0e1a'); rect(px + 4, py + 8, 10, 6, p.c1 || '#c8102e');
      rect(px + 8, py - 7, 1, 7, '#2a2e38'); rect(px + 7, py - 9, 3, 3, '#454b58');
    } else if (p.kind === 'ring') {
      var rx = Math.round(p.x), ry = Math.round(p.y);
      rect(rx - 4, ry - 1, 9, 6, '#14100a'); rect(rx - 4, ry - 1, 9, 1, '#3a2e18');
      rect(rx - 2, ry - 3, 5, 4, '#e8b33c'); rect(rx - 1, ry - 2, 3, 2, '#ffd166'); rect(rx, ry - 4, 1, 1, '#ffffff');
    } else if (p.kind === 'jersey') {
      var jx = Math.round(p.x - 8), jy = Math.round(p.y);
      rect(jx + 3, jy, 10, 2, p.c1); rect(jx, jy + 2, 16, 16, p.c1); rect(jx + 5, jy, 6, 3, '#05070d');
      rect(jx, jy + 2, 3, 6, '#05070d'); rect(jx + 13, jy + 2, 3, 6, '#05070d');
      rect(jx + 3, jy + 2, 10, 1, p.c2); rect(jx, jy + 17, 16, 1, mix(p.c1, '#000000', 0.35));
      if (p.text) drawDigits(String(p.text), jx + 8, jy + 7, p.c2);
    } else if (p.kind === 'trophy') {
      var tx = Math.round(p.x), ty = Math.round(p.y);
      rect(tx - 3, ty + 6, 7, 2, '#a8761c'); rect(tx - 1, ty + 2, 3, 4, '#e8b33c'); rect(tx - 3, ty - 3, 7, 5, '#e8b33c'); rect(tx - 2, ty - 3, 2, 3, '#ffd166');
    }
  }
  var FONT = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'],
    5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
  function drawDigits(t, cx, y, col){
    var w = t.length * 4 - 1, x0 = Math.round(cx - w / 2);
    for (var i = 0; i < t.length; i++) { var g = FONT[t[i]]; if (!g) continue; for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 3; xx++) if (g[yy][xx] === '1') rect(x0 + i * 4 + xx, y + yy, 1, 1, col); }
  }

  /* Play a clip: a function of the tick that returns the state to draw, for
     `len` ticks, with sound cues at ticks. Reduced motion draws the key tick
     and holds it. */
  st.play = function(clip, done){
    cancelAnimationFrame(st.raf); clearTimeout(st.timer);
    var t = 0, last = 0, acc = 0;
    var cues = clip.cues || {};
    if (REDUCED) {
      st.tick = clip.key != null ? clip.key : clip.len - 1;
      st.state = clip.at(st.tick); draw();
      if (clip.call) st.say(clip.call, clip.big);
      Object.keys(cues).forEach(function(k){ if (+k <= st.tick) S.cue(cues[k]); });
      st.timer = setTimeout(function(){ if (!st.dead && done) done(); }, clip.hold != null ? clip.hold : 700);
      return;
    }
    if (clip.call) st.say(clip.call, clip.big);
    function frame(now){
      if (st.dead) return;
      if (!last) last = now;
      acc += now - last; last = now;
      while (acc >= TICK) {
        acc -= TICK;
        if (cues[t]) S.cue(cues[t]);
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
  st.stop = function(){ st.dead = true; cancelAnimationFrame(st.raf); clearTimeout(st.timer); if (ro) ro.disconnect(); if (el.parentNode) el.parentNode.removeChild(el); };
  fit();
  return st;
}

// ─── the moves ───────────────────────────────────────────────────────────────

/* A frame of a set, cycling at `fps` ticks a frame. */
function cyc(set, t, per){ return set + (Math.floor(t / (per || 2)) % B.SETS[set]); }
function arc(p0, p1, h, u){ return [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u) - Math.sin(Math.PI * u) * h]; }
function hand(pose, a, build, s){
  var h = B.handAt(pose, s == null ? 1 : s, build) || [33, 30];
  return [Math.round(a.x) - 22 + h[0], Math.round(a.y - 62 - (a.jump || 0)) + h[1]];
}

/* Every moment's clips, built against a stage. me is { x, y } where he
   stands, and `build` is his build so a hand is where the rig drew it. */
var CLIPS = {
  /* dribbling in place, the ball going down and up off the floor */
  dribble: function(st, x, build, len){
    return { len: len || 24, loop: !len, loud: 2, at: function(t){
      var p = cyc('dribble', t, 2), a = { who: 'me', x: x, y: st.floorY, pose: p };
      var hn = hand(p, a, build);
      var ph = (t % 8) / 8, by = ph < 0.5 ? lerp(hn[1] + 3, st.floorY - 3, ph * 2) : lerp(st.floorY - 3, hn[1] + 3, (ph - 0.5) * 2);
      return { actors: [a], ball: { x: hn[0] + 1, y: by }, loud: 2 };
    }, cues: { 3: 'bounce', 11: 'bounce', 19: 'bounce' } };
  },
  /* gather, rise, release: the ball leaves at the last tick */
  rise: function(st, x, build){
    var seq = ['shot0', 'shot0', 'shot1', 'shot1', 'shot2', 'shot2'];
    return { len: 6, at: function(t){
      var p = seq[t], jmp = [0, 0, 3, 6, 9, 10][t], a = { who: 'me', x: x, y: st.floorY, pose: p, jump: jmp };
      var hn = hand(p, a, build);
      return { actors: [a], ball: { x: hn[0], y: hn[1] - 2 }, loud: 3 };
    }, cues: { 1: 'squeak' } };
  },
  /* the ball in flight from a point to the rim, make or miss, the shooter
     coming down behind it */
  flight: function(st, from, made, shooter, len){
    var rx = st.rim[0], ry = st.rim[1];
    len = len || 14;
    var end = made ? [rx, ry - 1] : [rx + 4, ry - 2];
    var h = Math.max(18, Math.abs(end[0] - from[0]) * 0.35);
    return { len: len, at: function(t){
      var u = t / (len - 1), b = arc(from, end, h, ease(u * 0.92 + 0.08 * u));
      var acts = shooter ? [shooter(t)] : [];
      return { actors: acts, ball: { x: b[0], y: b[1], behind: u > 0.85 && made }, loud: 3 };
    } };
  },
  /* through the net, or off the rim */
  result: function(st, made, shooter){
    var rx = st.rim[0], ry = st.rim[1];
    if (made) return { len: 10, at: function(t){
      return { actors: shooter ? [shooter(t)] : [], ball: t < 7 ? { x: rx, y: ry + 2 + t * 2.2, behind: t < 4 } : { x: rx - (t - 6) * 2, y: st.floorY - 3 - (t === 8 ? 3 : 0) }, net: t < 2 ? 1 : t < 4 ? 2 : 0, loud: 3 };
    }, cues: { 0: 'swish', 8: 'bounce' } };
    return { len: 12, at: function(t){
      var b = t < 2 ? [rx + 4, ry - 2 - t * 2] : arc([rx + 4, ry - 6], [rx - 30, st.floorY - 4], 22, (t - 2) / 9);
      return { actors: shooter ? [shooter(t)] : [], ball: { x: b[0], y: b[1] }, rimShake: t < 4 ? t + 1 : 0, loud: 1 };
    }, cues: { 0: 'clank', 11: 'bounce' } };
  },
  /* after: a celebration, or hands on the head */
  react: function(st, x, made, len){
    len = len || 18;
    return { len: len, key: len - 1, at: function(t){
      var p = made ? (t < 6 ? 'cheer1' : t < 12 ? 'cheer0' : 'cheer3') : (t < 9 ? 'sad1' : 'sad0');
      return { actors: [{ who: 'me', x: x, y: st.floorY, pose: p, jump: made && t < 6 ? [0, 2, 4, 4, 2, 0][t] : 0 }], loud: made ? 3 : 0, flash: made, confetti: made && st.opts.confetti };
    }, cues: made ? { 0: 'roar' } : { 0: 'groan' } };
  },
};

// ─── the moments ─────────────────────────────────────────────────────────────

/* What a moment is: where you stand, what the meter says, what the press
   does, and the clips for make and miss. The engine's card decides which:
   a Game 7 option, a buzzer beater, two free throws, a final stop, a poster,
   a chase-down block. */
var MOMENTS = {
  three: { lab: 'Release', at: -70, act: 'jumper' },
  mid: { lab: 'Release', at: -46, act: 'jumper' },
  drive: { lab: 'Take off', at: -82, act: 'drive' },
  pass: { lab: 'Pass', at: -60, act: 'pass' },
  buzzer: { lab: 'Release', at: -74, act: 'jumper' },
  ft: { lab: 'Release', at: -54, act: 'ft' },
  poster: { lab: 'Take off', at: -82, act: 'drive' },
  stop: { lab: 'Contest', at: -30, act: 'stop' },
  block: { lab: 'Swat', at: -40, act: 'block' },
};
/* Which moment a Game 7 option is. */
var CLUTCH_KIND = ['three', 'drive', 'mid', 'pass'];

/* Turn where the cursor stopped into a touch from -1 to 1: the middle of the
   green is 1, its edge is a half, and the far end of the bar is -1. */
function touchOf(pos, zone){
  var d = Math.abs(pos - 0.5);
  if (d <= zone) return 1 - 0.5 * (d / zone);
  return clamp(0.5 - (d - zone) / (0.5 - zone) * 1.5, -1, 0.5);
}
/* The green: a rating of 30 is a sliver, 95 is a quarter of the bar. */
function zoneFor(rating){ return clamp(0.04 + (rating - 30) * 0.0016, 0.04, 0.15); }

/* Play a moment on a host. spec: { kind, rating, me, c1, c2, oc, room, build,
   bug: { home, away, clock, period }, intro, makeCall, missCall, confetti }.
   cb.resolve(touch) returns { made } (or { made: n } of two for free throws),
   from the engine. cb.done() when the court is finished. */
function moment(host, spec, cb){
  var M = MOMENTS[spec.kind] || MOMENTS.mid;
  var st = stage(host, { pad: spec.ctlHost ? 0 : 140, room: spec.room || 'nba', hoop: true, c1: spec.c1, c2: spec.c2, oc: spec.oc, me: spec.me, confetti: spec.confetti });
  var el = st.el, build = spec.me && spec.me.look ? B.normal(spec.me.look).build : 'standard';
  if (spec.bug) {
    var bug = document.createElement('div');
    bug.className = 'ct-bug';
    bug.innerHTML = '<span class="tm">' + esc(spec.bug.home) + '</span><span class="op">' + esc(spec.bug.away) + '</span><span>' + esc(spec.bug.period || 'Q4') + '</span><span class="clk' + (REDUCED ? '' : ' hot') + '">' + esc(spec.bug.clock || '0:07') + '</span>';
    el.appendChild(bug);
  }
  var ctl = document.createElement('div');
  ctl.className = 'ct-ctl';
  ctl.innerHTML = '<div class="ct-lab"><span>' + esc(spec.rateName || 'Touch') + ' ' + (spec.rating | 0) + '</span><span>Stop it in the green</span></div>'
    + '<div class="ct-bar" role="presentation"><i class="ct-zone"></i><i class="ct-cur"></i></div>'
    + '<button class="ct-go" type="button">' + esc(M.lab) + '</button>'
    + '<div class="ct-hint">Tap, or press Space</div>';
  ctl.hidden = true;
  if (spec.ctlHost) { ctl.classList.add('ct-ctl-in'); spec.ctlHost.appendChild(ctl); } else el.appendChild(ctl);
  var zone = zoneFor(spec.rating || 60);
  var zEl = ctl.querySelector('.ct-zone'), cEl = ctl.querySelector('.ct-cur'), go = ctl.querySelector('.ct-go');
  zEl.style.left = ((0.5 - zone) * 100) + '%'; zEl.style.width = (zone * 200) + '%';
  var pos = 0, dir = 1, armed = false, mraf = 0, mlast = 0, start = 0, pressed = false;
  /* The sweep speeds up a little with the pressure. A full pass is under a
     second, so it is a reflex rather than a wait. */
  var speed = 1.15 + (spec.pressure || 0) * 0.35;
  function sweep(now){
    if (!armed) return;
    if (!mlast) { mlast = now; start = now; }
    var dt = Math.min(0.05, (now - mlast) / 1000); mlast = now;
    pos += dir * speed * dt;
    if (pos >= 1) { pos = 2 - pos; dir = -1; }
    if (pos <= 0) { pos = -pos; dir = 1; }
    cEl.style.left = (pos * 100) + '%';
    /* Nobody presses: the shot clock goes. A late, forced release. */
    if (now - start > 7000) { press(-0.6); return; }
    mraf = requestAnimationFrame(sweep);
  }
  function arm(){
    ctl.hidden = false; armed = true; pressed = false; pos = REDUCED ? 0.5 - zone * 1.6 : 0; dir = 1; mlast = 0;
    cEl.style.left = (pos * 100) + '%';
    if (REDUCED) {
      /* No sweep without motion: the cursor is still and a press lands where
         it stands, which is the edge of the green; a steady hand helps by
         holding it in. */
      cEl.style.left = (pos * 100) + '%';
    } else mraf = requestAnimationFrame(sweep);
    try { go.focus({ preventScroll: true }); } catch (e) {}
  }
  function press(forced){
    if (!armed || pressed) return;
    pressed = true; armed = false; cancelAnimationFrame(mraf);
    var q = forced != null ? forced : touchOf(REDUCED ? 0.5 - zone : pos, zone);
    ctl.hidden = true;
    act(Math.round(q * 100) / 100);
  }
  go.onclick = function(e){ e.stopPropagation(); press(); };
  el.addEventListener('click', function(e){ if (armed) { e.stopPropagation(); press(); } });
  function onKey(e){
    if (!armed) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); press(); }
  }
  document.addEventListener('keydown', onKey, true);

  var rx = st.rim[0];
  var x0 = function(){ return st.rim[0] + M.at; };
  /* the intro: the clock, the dribble, the line from the booth */
  S.crowd(3, 2.4);
  if (M.act === 'stop' || M.act === 'block') introDefense();
  else st.play(Object.assign(CLIPS.dribble(st, x0(), build), { call: spec.intro || '' }));
  arm();

  function finish(made, call){
    st.run([CLIPS.react(st, M.act === 'drive' ? st.rim[0] - 26 : M.act === 'stop' || M.act === 'block' ? st.rim[0] - 30 : x0(), made, 20)], function(){
      st.say(call, true);
      setTimeout(function(){ document.removeEventListener('keydown', onKey, true); if (cb.done) cb.done(made); }, REDUCED ? 600 : 1300);
    });
  }
  function act(q){
    var res = cb.resolve ? cb.resolve(q) : { made: q > 0 };
    var made = !!(res && res.made);
    var x = x0();
    if (M.act === 'jumper') {
      st.run([CLIPS.rise(st, x, build), function(){
        var a = { who: 'me', x: x, y: st.floorY, pose: 'shot2', jump: 10 };
        var from = hand('shot2', a, build);
        return CLIPS.flight(st, [from[0], from[1] - 2], made, function(t){ return { who: 'me', x: x, y: st.floorY, pose: t < 5 ? 'shot3' : 'shot4', jump: Math.max(0, 10 - t * 2) }; }, spec.kind === 'three' || spec.kind === 'buzzer' ? 16 : 13);
      }, function(){ return CLIPS.result(st, made, function(){ return { who: 'me', x: x, y: st.floorY, pose: 'shot4' }; }); }], function(){
        if (spec.kind === 'buzzer' || spec.kind === 'three') S.cue('buzzer');
        finish(made, made ? spec.makeCall : spec.missCall);
      });
    } else if (M.act === 'drive') {
      var end = rx - 26;
      st.run([
        { len: 8, at: function(t){ var p = cyc('dribble', t, 2), xx = lerp(x, end - 8, t / 7), a = { who: 'me', x: xx, y: st.floorY, pose: p }; var hn = hand(p, a, build); return { actors: [a], ball: { x: hn[0] + 1, y: t % 4 < 2 ? hn[1] + 3 : st.floorY - 4 }, loud: 3 }; }, cues: { 0: 'squeak', 4: 'bounce' } },
        { len: 10, at: function(t){
          var seq = ['dunk0', 'dunk1', 'dunk1', 'dunk2', 'dunk2', 'dunk2', 'dunk2', 'dunk3', 'dunk3', 'dunk3'];
          var jmp = [0, 0, 0, 10, 22, 32, 38, 40, 40, 40][t], xx = lerp(end - 8, end, Math.min(1, t / 6));
          var a = { who: 'me', x: xx, y: st.floorY, pose: seq[t], jump: jmp };
          var hn = hand(seq[t], a, build);
          return { actors: [a], ball: { x: hn[0] - 1, y: hn[1] - 2 }, loud: 3 };
        }, cues: { 2: 'squeak' } },
        function(){ return made
          ? { len: 14, key: 3, at: function(t){ var a = { who: 'me', x: end, y: st.floorY, pose: t < 8 ? 'dunk4' : 'shot4', jump: t < 8 ? 40 : Math.max(0, 40 - (t - 7) * 12) }; return { actors: [a], ball: t < 6 ? { x: st.rim[0], y: st.rim[1] + 3 + t * 3, behind: t < 3 } : { x: st.rim[0] - (t - 5) * 2, y: st.floorY - 3 }, net: t < 2 ? 1 : t < 4 ? 2 : 0, rimShake: t < 6 ? t + 1 : 0, loud: 3, flash: true }; }, cues: { 0: 'thud', 1: 'swish', 9: 'bounce' } }
          : CLIPS.result(st, false, function(t){ return { who: 'me', x: end, y: st.floorY, pose: 'shot4', jump: Math.max(0, 40 - t * 10) }; }); },
      ], function(){ finish(made, made ? spec.makeCall : spec.missCall); });
    } else if (M.act === 'pass') {
      st.run([
        { len: 6, at: function(t){ var a = { who: 'me', x: x, y: st.floorY, pose: t < 3 ? 'shot0' : 'shake1' }; var hn = hand(t < 3 ? 'shot0' : 'shake1', a, build, t < 3 ? 1 : -1); return { actors: [a], ball: { x: lerp(hn[0], -6, Math.max(0, t - 2) / 3), y: hn[1] }, loud: 3 }; } },
        { len: 6, at: function(){ return { actors: [{ who: 'me', x: x, y: st.floorY, pose: 'stand' }], loud: 3 }; } },
        function(){ return CLIPS.flight(st, [-4, st.floorY - 70], made, function(){ return { who: 'me', x: x, y: st.floorY, pose: 'stand' }; }, 16); },
        function(){ return CLIPS.result(st, made, function(){ return { who: 'me', x: x, y: st.floorY, pose: 'stand' }; }); },
      ], function(){ finish(made, made ? spec.makeCall : spec.missCall); });
    } else if (M.act === 'ft') {
      var n = res && typeof res.made === 'number' ? res.made : made ? 2 : 0;
      var shots = [n >= 1, n >= 2];
      if (n === 1) shots = [true, false];
      var seq = [];
      shots.forEach(function(mk, si){
        seq.push(CLIPS.dribble(st, x, build, 10));
        seq.push(CLIPS.rise(st, x, build));
        seq.push(function(){ var a = { who: 'me', x: x, y: st.floorY, pose: 'shot2', jump: 10 }; var f = hand('shot2', a, build); return CLIPS.flight(st, [f[0], f[1] - 2], mk, function(t){ return { who: 'me', x: x, y: st.floorY, pose: t < 5 ? 'shot3' : 'shot4', jump: Math.max(0, 10 - t * 2) }; }, 12); });
        seq.push(function(){ return Object.assign(CLIPS.result(st, mk, function(){ return { who: 'me', x: x, y: st.floorY, pose: 'shot4' }; }), { call: si === 0 ? (mk ? 'One.' : 'Off the front.') : '' }); });
      });
      st.run(seq, function(){ finish(n === 2, n === 2 ? spec.makeCall : n === 1 ? spec.halfCall || spec.missCall : spec.missCall); });
    } else if (M.act === 'stop' || M.act === 'block') {
      defenseOut(made);
    }
  }
  /* A final stop or a chase-down: a man in the other jersey (a shadow) drives
     at the rim and you go up with him. */
  var opp = null;
  function oppWho(){
    if (opp) return opp;
    opp = { look: B.lookFor('shadow:' + (spec.oc || '')), c1: spec.oc || '#3a4566', c2: '#c9ccd6', num: '', age: 25, shadow: spec.oc || '#3a4566' };
    return opp;
  }
  function introDefense(){
    var block = M.act === 'block';
    var ox = st.rim[0] - (block ? 70 : 54);
    st.play(Object.assign({ len: 16, loop: true, at: function(t){
      var o = { who: oppWho(), x: ox, y: st.floorY, pose: cyc('dribble', t, 2), flip: true };
      var me = block ? { who: 'me', x: ox - 30, y: st.floorY, pose: cyc('walk', t, 2) } : { who: 'me', x: ox + 26, y: st.floorY, pose: 'block0' };
      var hn = hand(o.pose, o, 'standard');
      return { actors: [o, me], ball: { x: 2 * o.x - hn[0] - 1, y: t % 4 < 2 ? hn[1] + 3 : st.floorY - 4 }, loud: 2 };
    } }, { call: spec.intro || '' }));
  }
  function defenseOut(made){
    var block = M.act === 'block';
    var ox = st.rim[0] - (block ? 70 : 54), end = st.rim[0] - 14;
    st.run([
      { len: 10, at: function(t){
        var u = t / 9, o = { who: oppWho(), x: lerp(ox, end, u), y: st.floorY, pose: t < 6 ? cyc('dribble', t, 2) : 'dunk2', jump: t < 6 ? 0 : (t - 5) * 7, flip: true };
        var me = block ? { who: 'me', x: lerp(ox - 30, end - 14, u), y: st.floorY, pose: t < 7 ? cyc('walk', t, 1) : 'block1', jump: t < 7 ? 0 : (t - 6) * 9 }
          : { who: 'me', x: lerp(ox + 26, end - 6, u), y: st.floorY, pose: t < 5 ? 'block0' : 'block1', jump: t < 5 ? 0 : (t - 4) * 6 };
        var hn = hand(o.pose, o, 'standard');
        return { actors: [o, me], ball: { x: 2 * o.x - hn[0], y: hn[1] - 1 }, loud: 3 };
      }, cues: { 0: 'squeak', 6: 'squeak' } },
      function(){ return { len: 14, key: 2, at: function(t){
        var o = { who: oppWho(), x: end, y: st.floorY, pose: made ? 'shot4' : 'dunk3', jump: Math.max(0, 28 - t * 5), flip: true };
        var me = { who: 'me', x: end - (block ? 14 : 6), y: st.floorY, pose: made ? (t < 6 ? 'block2' : 'block3') : 'block3', jump: made ? Math.max(0, 36 - t * 6) : Math.max(0, 24 - t * 6) };
        var ball = made ? { x: end - 10 - t * 5, y: st.rim[1] + 4 + t * t * 0.6 } : (t < 6 ? { x: st.rim[0], y: st.rim[1] + 2 + t * 2.5, behind: t < 3 } : { x: st.rim[0] - (t - 5) * 2, y: st.floorY - 3 });
        return { actors: [o, me], ball: ball, net: !made && t < 4 ? (t < 2 ? 1 : 2) : 0, loud: made ? 3 : 1, flash: made };
      }, cues: made ? { 0: 'thud', 1: 'roar' } : { 1: 'swish', 2: 'groan' } }; },
    ], function(){ finish(made, made ? spec.makeCall : spec.missCall); });
  }
  return { stop: function(){ document.removeEventListener('keydown', onKey, true); cancelAnimationFrame(mraf); if (ctl.parentNode) ctl.parentNode.removeChild(ctl); st.stop(); }, press: press, stage: st, touchOf: touchOf };
}

// ─── the ceremonies ──────────────────────────────────────────────────────────

/* The moments a career is remembered for, played rather than told: the walk
   across a draft stage and the handshake, the All-Star intro under one light,
   the podium, ring night with a banner going up, a number going to the
   rafters, the Hall. Each is a list of clips against a stage, and c is the
   scene's context (the player, his colours, the year, the commissioner).

   The commissioner is drawn because he is invented: career.js makes him up
   with the rest of the career's people. Nobody real is drawn. */
function suitOf(who, dress){ var o = {}; for (var k in who) o[k] = who[k]; o.dress = dress; return o; }
function walkTo(st, who, x0, x1, len, extra){
  return { len: len, at: function(t){
    var a = { who: who, x: lerp(x0, x1, t / (len - 1)), y: st.floorY, pose: cyc('walk', t, 2), flip: x1 < x0 };
    var s = { actors: [a].concat(extra ? extra(t) : []) };
    return s;
  }, cues: { 2: 'squeak' } };
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
    var pod = { kind: 'podium', x: px, c1: c.c1 };
    return [
      { len: 18, at: function(t){ return { actors: [{ who: me, x: lerp(-26, px - 22, t / 17), y: st.floorY, pose: cyc('walk', t, 2) }], props: [pod] }; }, cues: { 2: 'squeak' } },
      { len: 24, key: 20, at: function(t){ return { actors: [{ who: me, x: px - 22, y: st.floorY, pose: t < 8 ? 'suit' : 'cheer0' }], props: [pod, { kind: 'trophy', x: px, y: st.floorY - 36 }], flash: true, loud: 2 }; }, cues: { 0: 'chime', 8: 'flash', 14: 'flash' } },
    ];
  },
  ring: function(st, c){
    var me = st.opts.me, cx = Math.round(st.cw / 2);
    st.l3(c.name, 'Ring night · ' + (c.year - 1));
    var bx = Math.round(st.cw * 0.22);
    return [
      walkTo(st, me, -26, cx, 16, null),
      { len: 30, key: 29, at: function(t){
        var by = Math.max(4, st.floorY - 40 - t * 4);
        return { actors: [{ who: me, x: cx, y: st.floorY, pose: t < 10 ? 'stand' : 'up' }], props: [{ kind: 'banner', x: bx, y: by, c1: c.c1, c2: c.c2, text: String(c.year - 1).slice(2) }, { kind: 'ring', x: cx, y: st.floorY - 60 + (t < 10 ? 30 - t * 3 : 0) }], loud: 3, flash: true, confetti: t > 10 };
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
    var pod = { kind: 'podium', x: px, c1: '#a8761c' };
    return [
      { len: 18, at: function(t){ return { actors: [{ who: me, x: lerp(-26, px - 22, t / 17), y: st.floorY, pose: cyc('walk', t, 2) }], props: [pod] }; }, cues: { 2: 'squeak' } },
      { len: 20, key: 12, at: function(t){ return { actors: [{ who: me, x: px - 22, y: st.floorY, pose: t < 12 ? 'wave' + (Math.floor(t / 2) % 3) : 'suit', dress: 'suit' }], props: [pod], flash: t < 10 }; }, cues: { 0: 'chime', 2: 'flash' } },
    ];
  },
  title: function(st, c){
    var me = st.opts.me, cx = Math.round(st.cw / 2);
    st.l3(c.name, (c.nick || 'Champions').toUpperCase() + ' · CHAMPIONS');
    return [{ len: 30, key: 12, at: function(t){
      var p = ['cheer1', 'cheer1', 'cheer0', 'cheer0', 'cheer3', 'cheer3', 'cheer1', 'cheer2'][Math.floor(t / 3) % 8];
      return { actors: [{ who: me, x: cx, y: st.floorY, pose: t < 24 ? p : 'trophy', jump: t < 24 && Math.floor(t / 3) % 2 ? 4 : 0 }], loud: 3, flash: true, confetti: true };
    }, cues: { 0: 'buzzer', 2: 'roar' } }];
  },
  debut: function(st, c){
    var me = st.opts.me, cx = Math.round(st.cw / 2);
    st.l3(c.name, 'Number ' + c.num + ' · ' + (c.teamName || ''));
    return [{ len: 24, key: 20, at: function(t){
      var xx = Math.round(lerp(-24, cx, Math.min(1, t / 18))), a = { who: me, x: xx, y: st.floorY, pose: cyc('dribble', t, 2) };
      var hn = hand(a.pose, a, 'standard');
      return { actors: [a], ball: { x: hn[0] + 1, y: t % 4 < 2 ? hn[1] + 3 : st.floorY - 4 }, loud: 2, flash: t > 10 };
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

window.RTF_COURT = { API_VERSION: 1, stage: stage, moment: moment, ceremony: ceremony, CEREMONY: CEREMONY, CLIPS: CLIPS, MOMENTS: MOMENTS, CLUTCH_KIND: CLUTCH_KIND, touchOf: touchOf, zoneFor: zoneFor };
})();
