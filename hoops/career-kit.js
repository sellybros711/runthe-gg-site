/*
 * Run The Floor: the Career kit. The Arena Arcade design system in one file.
 *
 *   window.RTF_KIT   tokens, components, pixel art, team theming
 *
 * DESIGN.md is the spec and hoops/design/style-guide.html renders every part
 * of this file in every state. A screen in Career is built from what is here
 * and nothing else: a rule a screen needs that is not in the kit goes into the
 * kit (and the style guide) first.
 *
 * IT IS CSS CARRIED IN A SCRIPT, on purpose. check-cachebust reads a
 * `<script src>` and never a `<link>`, and a stylesheet caches exactly like a
 * script, so a stylesheet beside the page would be the one file a returning
 * visitor could hold a stale copy of with nothing anywhere noticing. This is
 * the arrangement /assets/store.js and football/fantasy/skin.js already use.
 * The sheet is injected once, at load, so the first frame is styled.
 *
 * EVERY TOKEN IS PREFIXED --k-. index.html owns --bg, --card, --orange and the
 * rest for the draft game, and Career has to sit on that page without one
 * system reaching into the other.
 *
 * PIXEL ART IS DRAWN, NOT LOADED. The player is painted procedurally by
 * baller.js and cached as a data url, so everything that stands beside him
 * (crowds, hardwood, brick, icons, trophies) is too: one cell per canvas
 * pixel, shown at a whole-number scale with image-rendering:pixelated, lit from
 * the upper left, shaded toward a cool hue and highlighted toward a warm one,
 * and outlined in a dark shade of its own colour rather than black. That is the
 * sprite's own rulebook (AUDIT-design.md section 9) applied to the props.
 */
(function(){
'use strict';

var API_VERSION = 2;

/* ─── colour ───────────────────────────────────────────────────────────── */

function rgb(h){ h = String(h).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function hex(c){ return '#' + c.map(function(v){ v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(a, b, t){ var x = rgb(a), y = rgb(b); return hex(x.map(function(v, i){ return v + (y[i] - v) * t; })); }
function lum(c){ var a = rgb(c).map(function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
function contrast(a, b){ var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

/* The five step ramp every prop is drawn with, the sprite's own recipe in
   short: shadows lean toward a cool navy, highlights toward a warm cream. */
var COOL = '#1b2140', WARM = '#fff3d6';
function ramp(base){ return [mix(base, COOL, 0.62), mix(base, COOL, 0.32), base, mix(base, WARM, 0.28), mix(base, WARM, 0.55)]; }
function outlineOf(base){ return mix(base, '#0b0e1a', 0.62); }

/* ─── tokens ───────────────────────────────────────────────────────────── */

var T = {
  floor: '#0a0d18', panel: '#111629', panel2: '#18203a', panel3: '#202a4a', frame: '#2d3a66', frameHi: '#4a5c99',
  ink: '#eef2f9', ink2: '#b8c3e6', ink3: '#8fa0d6',
  accent: '#ff7a1a', accentLip: '#b04a06', accentInk: '#160b02',
  gold: '#ffd166', good: '#3ecf8e', bad: '#ff6b6b', warn: '#ffb347', trust: '#7fb2ff', live: '#e5322d',
  shade: '#05070d',
};

/* ─── team theming ─────────────────────────────────────────────────────── */

/* A club's published colours are facts about the club and are never used raw
   for text: half the league is navy or black and would vanish on --k-panel.
   --k-team-ink is the colour lifted (or lowered) until it reads as text on a
   panel, --k-team-on is white or near black on a solid --k-team-1 fill, and
   --k-team-ring is the frame colour, which only has to read as a shape. */
function liftTo(c, bg, want){
  var x = c;
  for (var i = 0; i < 20 && contrast(x, bg) < want; i++) x = mix(x, lum(bg) < 0.2 ? '#ffffff' : '#000000', 0.12);
  return x;
}
function teamVars(c1, c2){
  c1 = c1 || '#2b3242'; c2 = c2 || '#c9ccd6';
  /* The secondary leads the ring when the primary is too dark to be seen on
     the floor: the Spurs and the Nets are black and silver. */
  var lead = contrast(c1, T.panel) >= 1.6 ? c1 : (contrast(c2, T.panel) >= 1.6 ? c2 : c1);
  return {
    '--k-team-1': c1, '--k-team-2': c2,
    '--k-team-ring': liftTo(lead, T.panel, 2.2),
    '--k-team-ink': liftTo(lead, T.panel, 4.6),
    '--k-team-on': contrast(c1, '#ffffff') >= contrast(c1, '#0a0d18') ? '#ffffff' : '#0a0d18',
    '--k-team-glow': mix(lead, T.floor, 0.55),
  };
}
function theme(el, c1, c2){
  var v = teamVars(c1, c2);
  for (var k in v) el.style.setProperty(k, v[k]);
  return v;
}

/* ─── pixel art ────────────────────────────────────────────────────────── */

var CACHE = {};
function cached(key, draw){
  if (CACHE[key]) return CACHE[key];
  if (typeof document === 'undefined') return '';
  var cv = document.createElement('canvas');
  draw(cv);
  return (CACHE[key] = { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height });
}
/* A seeded stream, so the same crowd is the same crowd on every visit. */
function rng(seed){ var s = 0; seed = String(seed); for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0; s = (s >>> 0) % 2147483646 + 1; return function(){ s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/* Crowds. A row is a band of heads over shoulders, six cells tall, offset half
   a seat every other row. `fill` is how full the building is (a Tuesday high
   school game is not a Finals), `colors` are shirt colours (the home side
   wears its colours). */
function crowd(w, h, o){
  o = o || {};
  var key = 'crowd:' + [w, h, o.fill, o.tone, (o.colors || []).join(','), o.seed].join('|');
  return cached(key, function(cv){
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), r = rng(key);
    var dark = o.tone === 'warm' ? '#140f1f' : '#0b1020';
    c.fillStyle = dark; c.fillRect(0, 0, w, h);
    var shirts = (o.colors && o.colors.length ? o.colors : []).concat(['#2a2340', '#33415e', '#4b2f3a', '#20304f', '#3b3b46', '#5a3a2a']);
    var skins = ['#4b2c19', '#6c4027', '#8b5735', '#aa6f45', '#c88c60', '#dfa77d', '#efc39f'];
    var fill = o.fill == null ? 0.9 : o.fill;
    for (var row = 0; row < h; row += 6){
      var off = (row / 6) % 2 ? 2 : 0;
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, row + 5, w, 1);
      for (var x = -off; x < w; x += 4){
        if (r() > fill) continue;
        var up = r() < 0.07 ? -1 : 0;
        var sh = shirts[(r() * shirts.length) | 0];
        c.fillStyle = mix(sh, COOL, 0.25); c.fillRect(x + 1, row + 3 + up, 3, 2);
        c.fillStyle = sh; c.fillRect(x + 1, row + 3 + up, 2, 1);
        var sk = skins[(r() * skins.length) | 0];
        c.fillStyle = sk; c.fillRect(x + 1, row + 1 + up, 2, 2);
        c.fillStyle = mix(sk, WARM, 0.3); c.fillRect(x + 1, row + 1 + up, 1, 1);
        if (o.flash && r() < 0.03){ c.fillStyle = '#fff6da'; c.fillRect(x + 3, row + up, 1, 1); }
      }
    }
    /* The upper deck is in the dark. */
    var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(5,7,13,.75)'); g.addColorStop(1, 'rgba(5,7,13,.05)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

/* Hardwood, boards running away from the camera, with the seam every seven
   cells, grain flecks and a lit top. `lines` paints a free-throw arc. */
function wood(w, h, o){
  o = o || {};
  var key = 'wood:' + [w, h, o.lines ? 1 : 0, o.stain || ''].join('|');
  return cached(key, function(cv){
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), r = rng(key);
    var base = o.stain || '#c98b4e';
    var tones = [base, mix(base, '#000', 0.04), mix(base, '#fff', 0.05), mix(base, '#000', 0.08)];
    for (var x = 0; x < w; x++){
      var plank = Math.floor(x / 7);
      for (var y = 0; y < h; y++){
        c.fillStyle = tones[(plank * 7 + Math.floor((y + plank * 5) / 13) * 3) % tones.length];
        c.fillRect(x, y, 1, 1);
      }
    }
    c.fillStyle = mix(base, COOL, 0.45);
    for (var s = 0; s < w; s += 7) c.fillRect(s, 0, 1, h);
    for (var k = 0; k < w * h / 40; k++){ c.fillStyle = r() < 0.5 ? mix(base, WARM, 0.25) : mix(base, COOL, 0.25); c.fillRect((r() * w) | 0, (r() * h) | 0, 2, 1); }
    if (o.lines){
      c.fillStyle = '#efe6d2';
      c.fillRect(0, 4, w, 1);
      var cx = w / 2, rx = Math.min(w / 4, 26), ry = Math.max(4, Math.round(h / 4));
      for (var a = 0; a <= 180; a += 2){
        var t = a * Math.PI / 180;
        c.fillRect(Math.round(cx + Math.cos(t) * rx), Math.round(4 + Math.sin(t) * ry), 1, 1);
      }
    }
    var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,236,196,.14)'); gr.addColorStop(1, 'rgba(5,7,13,.55)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
}

/* Painted brick, for the high school gym. */
function brick(w, h, o){
  o = o || {};
  var key = 'brick:' + [w, h, o.color || ''].join('|');
  return cached(key, function(cv){
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), r = rng(key);
    var base = o.color || '#8d3b2c';
    c.fillStyle = mix(base, COOL, 0.45); c.fillRect(0, 0, w, h);
    for (var row = 0; row * 4 < h; row++){
      for (var x = (row % 2) * 4 - 4; x < w; x += 8){
        var tint = r() < 0.5 ? 0 : 0.08;
        c.fillStyle = mix(base, r() < 0.5 ? COOL : WARM, tint); c.fillRect(x, row * 4, 7, 3);
        c.fillStyle = mix(base, WARM, 0.18); c.fillRect(x, row * 4, 7, 1);
      }
    }
  });
}

/* Rooms. A whole set, drawn at one cell per pixel: the stage behind the player
   on the hub and in every scene. One function so the five stage looks share a
   floor line, a light and a camera, and only what the brief says may change
   between them changes: the ground, the light and one accent.

     kind   'hs' | 'col' | 'intl' | 'gl' | 'nba', and for scenes 'press' |
            'draft' | 'studio' | 'locker' | 'hall' | 'home' | 'office' |
            'hotel'
     o.c1, o.c2   the home colours (school, club)
     o.floorAt    where the floor starts, as a share of the height (0.6) */
function room(kind, w, h, o){
  o = o || {};
  var c1 = o.c1 || '#c8102e', c2 = o.c2 || '#ffffff';
  var key = 'room:' + [kind, w, h, c1, c2, o.floorAt || '', o.seed || ''].join('|');
  return cached(key, function(cv){
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), r = rng(key);
    var fy = Math.round(h * (o.floorAt || 0.6));
    function rect(x, y, ww, hh, col){ c.fillStyle = col; c.fillRect(x, y, ww, hh); }
    function people(y0, y1, fill, shirts, opts){
      opts = opts || {};
      var skins = ['#4b2c19', '#6c4027', '#8b5735', '#aa6f45', '#c88c60', '#dfa77d', '#efc39f'];
      for (var row = y0, n = 0; row < y1; row += 5, n++){
        rect(0, row + 4, w, 1, 'rgba(0,0,0,.35)');
        for (var x = (n % 2) * 2 - 2; x < w; x += 4){
          if (r() > fill) continue;
          var up = (opts.wave && r() < 0.18) ? -1 : 0;
          var sh = shirts[(r() * shirts.length) | 0], sk = skins[(r() * skins.length) | 0];
          rect(x + 1, row + 2 + up, 3, 2, mix(sh, COOL, 0.2)); rect(x + 1, row + 2 + up, 2, 1, sh);
          rect(x + 1, row + up, 2, 2, sk); rect(x + 1, row + up, 1, 1, mix(sk, WARM, 0.3));
          if (opts.flash && r() < 0.025) rect(x + 3, row - 1 + up, 1, 1, '#fff6da');
          if (opts.arms && r() < 0.08) rect(x, row - 1 + up, 1, 2, sk);
        }
      }
    }
    function spot(cx, top, spread, alpha){
      for (var y = top; y < h; y++){
        var half = Math.round((y - top) * spread) + 2;
        var a = alpha * (1 - (y - top) / (h - top) * 0.55);
        rect(cx - half, y, half * 2, 1, 'rgba(255,236,196,' + a.toFixed(3) + ')');
      }
    }
    function floor(stain, paint){
      var tones = [stain, mix(stain, '#000', 0.05), mix(stain, '#fff', 0.05), mix(stain, '#000', 0.09)];
      for (var y = fy; y < h; y++) for (var x = 0; x < w; x++){
        var plank = Math.floor(x / 6);
        rect(x, y, 1, 1, tones[(plank * 7 + Math.floor((y + plank * 5) / 11) * 3) % 4]);
      }
      for (var s = 0; s < w; s += 6) rect(s, fy, 1, h - fy, mix(stain, COOL, 0.42));
      if (paint){
        /* The lane, in the home colour, foreshortened. */
        var lw = Math.round(w * 0.34), lx = Math.round(w * 0.5 - lw / 2);
        for (var y2 = fy + 3; y2 < h; y2++){
          var grow = Math.round((y2 - fy) * 0.35);
          rect(lx - grow, y2, lw + grow * 2, 1, mix(paint, stain, 0.35));
        }
      }
      rect(0, fy + 2, w, 1, '#efe6d2');
      var cx = Math.round(w / 2), rx = Math.round(w * 0.22), ry = Math.max(3, Math.round((h - fy) * 0.35));
      for (var aa = 0; aa <= 180; aa += 2){
        var t = aa * Math.PI / 180;
        rect(Math.round(cx + Math.cos(t) * rx), Math.round(fy + 2 + Math.sin(t) * ry), 1, 1, '#efe6d2');
      }
      for (var k = 0; k < (h - fy) * w / 30; k++) rect((r() * w) | 0, fy + ((r() * (h - fy)) | 0), 2, 1, r() < 0.5 ? mix(stain, WARM, 0.25) : mix(stain, COOL, 0.25));
      var g = c.createLinearGradient(0, fy, 0, h); g.addColorStop(0, 'rgba(255,236,196,.12)'); g.addColorStop(1, 'rgba(5,7,13,.5)');
      c.fillStyle = g; c.fillRect(0, fy, w, h - fy);
    }
    function banner(x, y, ww, hh, col, trim){
      rect(x, y, ww, hh, col); rect(x, y, ww, 1, mix(col, WARM, 0.3));
      rect(x + ww - 1, y, 1, hh, mix(col, COOL, 0.35));
      for (var i = 0; i < ww; i += 2) rect(x + i, y + hh, 1, 1, trim || col);
      rect(x + 1, y + Math.round(hh / 2), ww - 3, 1, trim || '#ffffff');
    }

    if (kind === 'hs'){
      /* A high school gym: painted brick, folded bleachers, fluorescent tubes,
         a scoreboard on the wall, the school's state banners. */
      rect(0, 0, w, fy, mix('#8d3b2c', COOL, 0.35));
      for (var row = 0; row * 4 < fy; row++) for (var x = (row % 2) * 4 - 4; x < w; x += 8){
        rect(x, row * 4, 7, 3, mix('#8d3b2c', r() < 0.5 ? COOL : WARM, r() * 0.1));
        rect(x, row * 4, 7, 1, mix('#8d3b2c', WARM, 0.16));
      }
      for (var t2 = 8; t2 < w; t2 += 34) rect(t2, 2, 18, 1, '#eaf6f0');
      var sbw = 24, sbx = Math.round(w / 2 - sbw / 2);
      rect(sbx - 1, 5, sbw + 2, 11, '#0b0e1a'); rect(sbx, 6, sbw, 9, '#141a2c');
      for (var d = 0; d < 4; d++){ rect(sbx + 3 + d * 5, 8, 3, 5, d < 2 ? '#ff4b3a' : '#ffb347'); rect(sbx + 4 + d * 5, 10, 1, 1, '#141a2c'); }
      banner(6, 5, 8, 12, c1, c2); banner(18, 5, 8, 12, c1, c2); banner(w - 14, 5, 8, 12, c2 === '#ffffff' ? '#1d2440' : c2, c1);
      var by = Math.round(fy * 0.55);
      for (var b2 = by; b2 < fy; b2 += 3){ rect(0, b2, w, 2, '#b98a54'); rect(0, b2, w, 1, '#d6a86c'); rect(0, b2 + 2, w, 1, '#5a3d22'); }
      people(by - 2, fy - 2, 0.32, [c1, c2, '#3b3b46', '#20304f', '#6a5a4a']);
      c.fillStyle = 'rgba(200,255,220,.06)'; c.fillRect(0, 0, w, fy);
      floor('#d9a463', c1);
    } else if (kind === 'col'){
      /* A college arena: the student section in the school's colours, two
         warm spots, hanging banners for the tournament runs. */
      rect(0, 0, w, fy, '#0e1222');
      people(4, fy - 3, 0.97, [c1, c1, c1, c2, '#ffffff', mix(c1, '#000', 0.3)], { wave: true, arms: true });
      for (var bb = 0; bb < 5; bb++) banner(4 + bb * Math.round(w / 5), 0, 6, 9, bb % 2 ? c2 : c1, bb % 2 ? c1 : c2);
      rect(0, fy - 3, w, 3, mix(c1, '#000', 0.35)); rect(0, fy - 3, w, 1, mix(c1, WARM, 0.2));
      floor('#cf995a', c1);
      spot(Math.round(w * 0.3), 0, 0.42, 0.10); spot(Math.round(w * 0.7), 0, 0.42, 0.10);
    } else if (kind === 'intl'){
      /* Abroad: an older building, flags and drums in the end, ad boards on
         the floor line, smoke in the light. */
      rect(0, 0, w, fy, '#101622');
      people(3, fy - 6, 0.85, [c1, c2, '#2e3a50', '#3b3b46'], { arms: true });
      for (var f = 6; f < w; f += 23){ rect(f, 4, 1, 12, '#cfd6e6'); rect(f + 1, 4, 7, 5, c1); rect(f + 1, 9, 7, 2, c2); }
      for (var ab = 0; ab < w; ab += 16){
        var col = [c1, '#f2f2f0', '#1d2440', c2][(ab / 16) % 4];
        rect(ab, fy - 6, 15, 5, col); rect(ab + 2, fy - 4, 9, 1, col === '#f2f2f0' ? '#1d2440' : '#f2f2f0');
      }
      for (var sm = 0; sm < 5; sm++){ c.fillStyle = 'rgba(190,200,220,.05)'; c.fillRect(0, Math.round(fy * 0.2 + sm * 4), w, 3); }
      floor('#a8794a', null);
    } else if (kind === 'gl'){
      /* The G League: a small arena with the upper deck curtained off. */
      rect(0, 0, w, fy, '#0c1120');
      var cy = Math.round(fy * 0.5);
      for (var cx = 0; cx < w; cx++) rect(cx, 0, 1, cy, cx % 4 < 2 ? '#1a1f30' : '#141826');
      rect(0, cy, w, 1, '#2a3048');
      people(cy + 2, fy - 2, 0.5, [c1, c2, '#3b3b46', '#20304f']);
      floor('#c08a55', null);
    } else if (kind === 'press'){
      /* The press room: a step-and-repeat wall in the home colours, a skirted
         table at the front, a row of mics, the odd camera flash. */
      rect(0, 0, w, h, mix(c1, '#0b0e1a', 0.55));
      for (var py = 0; py < h; py += 10) for (var px = (py / 10 % 2) * 11 - 11; px < w; px += 22){
        rect(px + 3, py + 2, 12, 5, mix(c1, '#0b0e1a', 0.3)); rect(px + 4, py + 3, 10, 1, mix(c2, c1, 0.4));
        rect(px + 4, py + 5, 6, 1, mix(c2, c1, 0.6));
      }
      c.fillStyle = 'rgba(5,7,13,.35)'; c.fillRect(0, 0, w, h);
      for (var fl2 = 0; fl2 < 5; fl2++) if (r() < 0.6){ var fx = (r() * w) | 0, fyy = (r() * h * 0.5) | 0; rect(fx, fyy, 1, 1, '#fffbe8'); rect(fx - 1, fyy, 3, 1, 'rgba(255,251,232,.5)'); rect(fx, fyy - 1, 1, 3, 'rgba(255,251,232,.5)'); }
      var ty = Math.round(h * 0.74);
      rect(0, ty, w, h - ty, '#141a2c'); rect(0, ty, w, 2, mix(c1, WARM, 0.2)); rect(0, ty + 2, w, 1, mix(c1, '#000', 0.4));
      for (var sk = 0; sk < w; sk += 4) rect(sk, ty + 4, 1, h - ty - 4, '#0f1422');
      var nx = Math.round(w / 2 - 10); rect(nx, ty + 5, 20, 7, '#f1efe8'); rect(nx, ty + 10, 20, 2, c1); rect(nx + 3, ty + 7, 14, 1, '#1d2440');
      for (var mi = 0; mi < 4; mi++){ var mx = Math.round(w * 0.36) + mi * 9; rect(mx, ty - 7, 1, 7, '#2a2e38'); rect(mx - 1, ty - 10, 3, 4, '#454b58'); rect(mx - 1, ty - 10, 1, 1, '#7a8191'); }
      spot(Math.round(w * 0.5), 0, 0.3, 0.12);
    } else if (kind === 'draft'){
      /* Draft night: a theatre, a giant screen in the club's colours, the stage,
         the podium, blue spotlights and the floor full of families at tables. */
      rect(0, 0, w, h, '#050a1e');
      for (var dy = 0; dy < h * 0.6; dy++) rect(0, dy, w, 1, mix('#050a1e', '#10204e', dy / (h * 0.6)));
      var sw2 = Math.round(w * 0.5), sx2 = Math.round(w / 2 - sw2 / 2);
      rect(sx2 - 2, 5, sw2 + 4, 24, '#0b0e1a'); rect(sx2, 7, sw2, 20, mix(c1, '#05070d', 0.15));
      for (var sl = 7; sl < 27; sl += 2) rect(sx2, sl, sw2, 1, mix(c1, '#05070d', 0.3));
      rect(sx2 + 4, 11, sw2 - 8, 3, mix(c2, '#ffffff', 0.2)); rect(sx2 + 10, 17, sw2 - 20, 2, mix(c2, c1, 0.4));
      var st2 = Math.round(h * 0.56);
      rect(0, st2, w, 5, '#1c2a55'); rect(0, st2, w, 1, '#5d78c8');
      rect(Math.round(w * 0.74), st2 - 12, 9, 12, '#1a2445'); rect(Math.round(w * 0.74), st2 - 12, 9, 2, '#5d78c8');
      for (var bm = 0; bm < 2; bm++) spot(Math.round(w * (bm ? 0.78 : 0.22)), 0, 0.3, 0.08);
      people(st2 + 7, h, 0.75, ['#1b2238', '#24304f', '#2e2a3d', mix(c1, '#000', 0.4), '#3a3f4b'], { flash: true });
      for (var tb = 6; tb < w; tb += 26) rect(tb, h - 8, 16, 2, '#e9e6dc');
    } else if (kind === 'studio'){
      /* The studio: three screens, the network colour on the desk, a city at
         night behind glass. c1 is the network's colour here, not a club's. */
      rect(0, 0, w, h, '#0c0816');
      for (var bx = 0; bx < w; bx += 7){ var bh = 10 + ((r() * 18) | 0); rect(bx, 40 - bh, 6, bh, '#151026'); for (var wy = 40 - bh + 2; wy < 38; wy += 3) if (r() < 0.4) rect(bx + 1 + ((r() * 4) | 0), wy, 1, 1, '#ffd98a'); }
      rect(0, 40, w, 1, mix(c1, '#0c0816', 0.4));
      var scw = Math.round(w * 0.24);
      for (var sci = 0; sci < 3; sci++){
        var scx = Math.round(w * 0.1) + sci * (scw + Math.round(w * 0.06));
        rect(scx - 1, 9, scw + 2, 18, '#05070d'); rect(scx, 10, scw, 16, mix(c1, '#0c0816', 0.45 + sci * 0.1));
        rect(scx + 2, 12, scw - 4, 1, mix(c1, WARM, 0.4)); if (sci === 1){ for (var bar2 = 0; bar2 < 5; bar2++) rect(scx + 3 + bar2 * 5, 24 - bar2 * 2 - 2, 3, bar2 * 2 + 2, '#f1efe8'); }
      }
      var dk = Math.round(h * 0.7);
      rect(0, dk, w, h - dk, '#121726'); rect(4, dk - 3, w - 8, 4, '#232a3d'); rect(4, dk - 3, w - 8, 1, mix(c1, WARM, 0.25)); rect(4, dk + 1, w - 8, 2, c1);
      spot(Math.round(w * 0.5), 0, 0.4, 0.06);
    } else if (kind === 'locker'){
      /* The locker room: stalls in the home colour with a jersey in each, a
         bench, carpet and the logo circle in the middle of it. */
      rect(0, 0, w, h, '#151a26');
      var ly = 6, lh = Math.round(h * 0.56), lw = 14;
      for (var lx = 0; lx < w; lx += lw){
        rect(lx, ly, lw - 1, lh, mix(c1, '#0b0e1a', 0.45)); rect(lx, ly, lw - 1, 1, mix(c1, WARM, 0.25)); rect(lx + lw - 1, ly, 1, lh, '#090c14');
        rect(lx + 2, ly + 3, lw - 5, 2, mix(c1, '#0b0e1a', 0.2));
        var jx = lx + 3, jy = ly + 9; rect(jx, jy, 7, 11, c1); rect(jx + 2, jy, 3, 2, mix(c1, '#0b0e1a', 0.4)); rect(jx, jy + 2, 7, 1, c2); rect(jx + 2, jy + 5, 3, 3, c2);
        rect(lx + 3, ly + lh - 8, 7, 3, '#2a3048');
      }
      var by2 = Math.round(h * 0.68);
      rect(0, ly + lh, w, by2 - ly - lh, '#20263a');
      rect(6, by2 - 4, w - 12, 3, '#7a5432'); rect(6, by2 - 4, w - 12, 1, '#a07448'); rect(10, by2 - 1, 2, 4, '#3a2a18'); rect(w - 12, by2 - 1, 2, 4, '#3a2a18');
      rect(0, by2 + 3, w, h - by2 - 3, mix(c1, '#0b0e1a', 0.7));
      var cx2 = Math.round(w / 2), cy2 = Math.round((by2 + h) / 2 + 2), rr = 14;
      for (var a2 = 0; a2 < 360; a2 += 4){ var t3 = a2 * Math.PI / 180; rect(Math.round(cx2 + Math.cos(t3) * rr), Math.round(cy2 + Math.sin(t3) * rr * 0.35), 1, 1, c2); }
      spot(Math.round(w * 0.5), 0, 0.35, 0.08);
    } else if (kind === 'home'){
      /* Home, late: a dark living room, a window on the city, a couch, a lamp
         and a phone on the coffee table lighting up the ceiling. Nothing in
         it wears a club's colours, because it is not the club's. */
      rect(0, 0, w, h, '#17141f');
      for (var hw = 0; hw < w; hw += 5) rect(hw, 0, 1, Math.round(h * 0.66), '#1b1824');
      var wx = Math.round(w * 0.58), ww2 = Math.round(w * 0.3), wy0 = 6, wh2 = Math.round(h * 0.36);
      rect(wx - 2, wy0 - 2, ww2 + 4, wh2 + 4, '#2b2433');
      rect(wx, wy0, ww2, wh2, '#0a1124');
      for (var sx3 = wx; sx3 < wx + ww2; sx3 += 4){ var tall = 6 + ((r() * wh2 * 0.6) | 0); rect(sx3, wy0 + wh2 - tall, 3, tall, '#141c33'); for (var wl = wy0 + wh2 - tall + 2; wl < wy0 + wh2 - 1; wl += 3) if (r() < 0.35) rect(sx3 + 1, wl, 1, 1, '#ffd98a'); }
      rect(wx + Math.round(ww2 / 2), wy0, 1, wh2, '#2b2433'); rect(wx, wy0 + Math.round(wh2 / 2), ww2, 1, '#2b2433');
      rect(wx + 3, wy0 + 3, 3, 3, '#e8ecf6');
      var lx3 = Math.round(w * 0.16), ly3 = Math.round(h * 0.2);
      rect(lx3 - 4, ly3, 9, 6, '#e8c890'); rect(lx3 - 4, ly3, 9, 1, '#fff0c8'); rect(lx3, ly3 + 6, 1, Math.round(h * 0.62) - ly3 - 6, '#2a2430');
      spot(lx3, ly3 + 6, 0.5, 0.10);
      var fl3 = Math.round(h * 0.66);
      rect(0, fl3, w, h - fl3, '#2a1f1a');
      for (var fx3 = 0; fx3 < w; fx3 += 8) rect(fx3, fl3, 1, h - fl3, '#231a16');
      var rgx = Math.round(w * 0.2), rgw = Math.round(w * 0.6);
      rect(rgx, fl3 + 4, rgw, h - fl3 - 5, '#3a2c3c'); rect(rgx + 2, fl3 + 6, rgw - 4, 1, '#4a3a4c');
      var cy4 = Math.round(h * 0.5), cxw = Math.round(w * 0.52), cx4 = Math.round(w * 0.06);
      rect(cx4, cy4, cxw, Math.round(h * 0.14), '#3d4a6b'); rect(cx4, cy4, cxw, 1, '#5a6a92');
      rect(cx4 - 3, cy4 + 3, 4, Math.round(h * 0.16), '#34405e'); rect(cx4 + cxw - 1, cy4 + 3, 4, Math.round(h * 0.16), '#34405e');
      rect(cx4, cy4 + Math.round(h * 0.14), cxw, Math.round(h * 0.06), '#2c3651');
      for (var cu = cx4 + 4; cu < cx4 + cxw - 6; cu += Math.round(cxw / 3)) rect(cu, cy4 + 2, Math.round(cxw / 3) - 3, 1, '#46557a');
      var tx3 = Math.round(w * 0.62), tyy = Math.round(h * 0.74);
      rect(tx3, tyy, Math.round(w * 0.24), 3, '#5a3d28'); rect(tx3, tyy, Math.round(w * 0.24), 1, '#7a5638');
      rect(tx3 + 3, tyy + 3, 1, 5, '#3a2818'); rect(tx3 + Math.round(w * 0.24) - 4, tyy + 3, 1, 5, '#3a2818');
      var phx = tx3 + Math.round(w * 0.1);
      rect(phx, tyy - 2, 4, 2, '#0b0e1a'); rect(phx + 1, tyy - 2, 2, 1, '#9fe0ff');
      for (var gl2 = 1; gl2 < 14; gl2++){ c.fillStyle = 'rgba(160,220,255,' + (0.05 - gl2 * 0.003).toFixed(3) + ')'; c.fillRect(phx + 2 - gl2 * 2, tyy - 3 - gl2 * 3, gl2 * 4, 3); }
      c.fillStyle = 'rgba(40,60,120,.18)'; c.fillRect(0, 0, w, h);
    } else if (kind === 'office'){
      /* The general manager's office: dark wood, a big desk, the club's
         framed jerseys on the wall and the practice court through the glass. */
      rect(0, 0, w, h, '#20180f');
      for (var ow = 0; ow < w; ow += 7){ rect(ow, 0, 6, Math.round(h * 0.64), '#2a1f14'); rect(ow, 0, 1, Math.round(h * 0.64), '#33261a'); }
      var gx = Math.round(w * 0.55), gw = Math.round(w * 0.4), gy = 5, gh = Math.round(h * 0.34);
      rect(gx - 1, gy - 1, gw + 2, gh + 2, '#0b0e1a'); rect(gx, gy, gw, gh, '#3a3020');
      for (var pk = gx; pk < gx + gw; pk += 4) rect(pk, gy + Math.round(gh * 0.5), 1, Math.round(gh * 0.5), '#4a3c26');
      rect(gx, gy + Math.round(gh * 0.5), gw, 1, '#efe6d2'); rect(gx + Math.round(gw / 2) - 4, gy + Math.round(gh * 0.5), 8, Math.round(gh * 0.5), mix(c1, '#3a3020', 0.5));
      c.fillStyle = 'rgba(200,220,255,.10)'; c.fillRect(gx, gy, gw, gh);
      for (var fj = 0; fj < 3; fj++){ var fjx = Math.round(w * 0.06) + fj * Math.round(w * 0.15), fjy = 8;
        rect(fjx - 1, fjy - 1, 13, 16, '#c9a23a'); rect(fjx, fjy, 11, 14, '#14100a');
        rect(fjx + 2, fjy + 2, 7, 10, c1); rect(fjx + 4, fjy + 2, 3, 2, '#14100a'); rect(fjx + 2, fjy + 4, 7, 1, c2); rect(fjx + 4, fjy + 7, 3, 3, c2); }
      var dy3 = Math.round(h * 0.64);
      rect(0, dy3, w, h - dy3, '#1a140d');
      var dkx = Math.round(w * 0.12), dkw = Math.round(w * 0.76), dky = Math.round(h * 0.72);
      rect(dkx, dky, dkw, h - dky, '#4a2f1c'); rect(dkx, dky, dkw, 2, '#6b4529'); rect(dkx, dky + 2, dkw, 1, '#2a1a0e');
      rect(dkx + 6, dky - 3, 10, 3, '#efe6d2'); rect(dkx + 7, dky - 2, 8, 1, '#9aa4b2');
      rect(dkx + dkw - 18, dky - 6, 9, 6, '#0b0e1a'); rect(dkx + dkw - 17, dky - 5, 7, 4, mix(c1, '#0b0e1a', 0.3));
      rect(dkx + Math.round(dkw / 2) - 2, dky - 2, 5, 2, '#2a2e38');
      spot(Math.round(w * 0.45), 0, 0.32, 0.10);
    } else if (kind === 'hotel'){
      /* A hotel on a road trip: the bed, a door with the hall light under it,
         the curtains half open on somebody else's city, a lamp on low. */
      rect(0, 0, w, h, '#1c1a24');
      for (var hp = 0; hp < w; hp += 3) rect(hp, 0, 1, Math.round(h * 0.62), hp % 6 ? '#1f1d28' : '#22202c');
      var hwx = Math.round(w * 0.36), hww = Math.round(w * 0.3), hwy = 5, hwh = Math.round(h * 0.4);
      rect(hwx, hwy, hww, hwh, '#0b1226');
      for (var hs3 = hwx; hs3 < hwx + hww; hs3 += 3){ var ht = 4 + ((r() * hwh * 0.7) | 0); rect(hs3, hwy + hwh - ht, 2, ht, '#18213a'); if (r() < 0.5) rect(hs3, hwy + hwh - ht + 2, 1, 1, '#ffe2a0'); }
      rect(hwx - 6, hwy - 2, 8, hwh + 6, '#6b3a3a'); rect(hwx + hww - 2, hwy - 2, 8, hwh + 6, '#6b3a3a');
      for (var cf = 0; cf < hwh + 6; cf += 3){ rect(hwx - 4, hwy - 2 + cf, 1, 2, '#53292a'); rect(hwx + hww + 2, hwy - 2 + cf, 1, 2, '#53292a'); }
      var drx = Math.round(w * 0.84), drw = Math.round(w * 0.12);
      rect(drx, 6, drw, Math.round(h * 0.6) - 6, '#3a3242'); rect(drx + drw - 3, Math.round(h * 0.34), 2, 2, '#c9a23a');
      rect(drx, Math.round(h * 0.6) - 1, drw, 1, '#fff0c8');
      var hfl = Math.round(h * 0.62);
      rect(0, hfl, w, h - hfl, '#2b2633');
      for (var hc = 0; hc < w * (h - hfl) / 12; hc++) rect((r() * w) | 0, hfl + ((r() * (h - hfl)) | 0), 1, 1, '#332d3c');
      var bdx = Math.round(w * 0.04), bdw = Math.round(w * 0.46), bdy = Math.round(h * 0.56);
      rect(bdx, bdy - 10, 4, 10, '#4a3a2a'); rect(bdx, bdy, bdw, Math.round(h * 0.2), '#e8e4dc'); rect(bdx, bdy, bdw, 2, '#ffffff');
      rect(bdx + 6, bdy - 3, 12, 4, '#f4f1ea'); rect(bdx, bdy + Math.round(h * 0.12), bdw, Math.round(h * 0.08), '#5a6a92');
      var lpx = Math.round(w * 0.56), lpy = Math.round(h * 0.42);
      rect(lpx - 3, lpy, 7, 5, '#e8c890'); rect(lpx, lpy + 5, 1, 6, '#3a3040'); rect(lpx - 4, lpy + 11, 9, 4, '#3a2c22');
      spot(lpx, lpy + 5, 0.55, 0.08);
      c.fillStyle = 'rgba(30,40,90,.16)'; c.fillRect(0, 0, w, h);
    } else if (kind === 'hall'){
      /* The Hall of Fame: dark wood, gold columns, bronze plaques down the
         walls, a carpet to the stage and one warm light. */
      rect(0, 0, w, h, '#1d160c');
      for (var hx = 0; hx < w; hx += 6) rect(hx, 0, 1, h, '#241b0f');
      for (var col2 = 0; col2 < w; col2 += 33){ rect(col2 + 2, 0, 5, Math.round(h * 0.7), '#a8761c'); rect(col2 + 2, 0, 1, Math.round(h * 0.7), '#ffd166'); rect(col2 + 6, 0, 1, Math.round(h * 0.7), '#5a3d10'); }
      for (var pl = 0; pl < w; pl += 33){ var ppx = pl + 13; for (var prow = 0; prow < 3; prow++){ var ppy = 8 + prow * 13; rect(ppx, ppy, 10, 10, '#6b4a1a'); rect(ppx + 1, ppy + 1, 8, 8, '#c08a36'); rect(ppx + 3, ppy + 2, 4, 3, '#7a5420'); rect(ppx + 2, ppy + 6, 6, 1, '#7a5420'); } }
      var hf = Math.round(h * 0.7);
      rect(0, hf, w, h - hf, '#2a2212'); rect(0, hf, w, 2, '#e8b33c');
      for (var cy3 = hf + 2; cy3 < h; cy3++){ var half = Math.round((cy3 - hf) * 0.9) + 8; rect(Math.round(w / 2) - half, cy3, half * 2, 1, cy3 % 2 ? '#8a1c22' : '#7a161c'); }
      spot(Math.round(w * 0.5), 0, 0.36, 0.2);
    } else {
      /* The NBA: a dark upper deck, the LED ribbon in the home colours, a full
         lower bowl with phones flashing, courtside, one hot spotlight. */
      rect(0, 0, w, fy, '#090c16');
      people(0, Math.round(fy * 0.38), 0.85, ['#1a2238', '#202a40', '#1d1d28'], {});
      var ry0 = Math.round(fy * 0.4);
      rect(0, ry0, w, 3, '#05070d');
      for (var lx2 = 0; lx2 < w; lx2 += 2) rect(lx2, ry0 + 1, 1, 1, (lx2 / 2) % 6 < 3 ? c1 : c2);
      people(ry0 + 4, fy - 3, 0.97, [c1, c2, c1, '#2a2340', '#33415e', '#4b2f3a'], { flash: true, arms: true });
      rect(0, fy - 3, w, 3, '#0b0e1a'); for (var q = 2; q < w; q += 9) rect(q, fy - 2, 5, 1, mix(c1, WARM, 0.25));
      var jb = 26, jx = Math.round(w / 2 - jb / 2);
      rect(jx, 0, jb, 6, '#05070d'); rect(jx + 1, 1, jb - 2, 4, mix(c1, '#000', 0.25)); rect(jx + 2, 2, 6, 2, c2);
      floor('#c98b4e', c1);
      spot(Math.round(w * (o.spotAt || 0.5)), 0, 0.34, 0.16);
    }
    var vg = c.createRadialGradient(w / 2, h * 0.55, h * 0.2, w / 2, h * 0.55, w * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,7,13,.55)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  });
}

/* Icons. A grid of letters: o outline, s shadow, b base, h highlight,
   w white detail, k dark detail. The colours come off one base through ramp(),
   so every icon is lit like the sprite. */
var ICONS = {
  heart: ['.oo.oo.', 'ohbobbo', 'obbbbbo', 'obbbbso', '.obbso.', '..oso..', '...o...'],
  face: ['.ooooo.', 'ohbbbbo', 'obkbkbo', 'obbbbbo', 'obkbkbo', 'osbkbso', '.ooooo.'],
  star: ['...o...', '..ohb..', 'oobhbbo', '.obbbo.', '.obsbo.', 'osb.bso', 'oo...oo'],
  clip: ['..ooo..', 'oohwboo', 'obbbbbo', 'obkkkbo', 'obbbbbo', 'obkkbbo', 'ooooooo'],
  cash: ['ooooooo', 'ohbbbbo', 'obwkwbo', 'obkwkbo', 'obwkwbo', 'osbbbso', 'ooooooo'],
  ball: ['..ooo..', '.ohbko.', 'ohbkbbo', 'okkkkko', 'obbkbso', '.oskso.', '..ooo..'],
  trophy: ['ooooooo', 'ohbbbbo', '.obbbo.', '..obo..', '..oso..', '.ooooo.', '.osssso'],
  medal: ['.o...o.', '..o.o..', '..ooo..', '.ohbbo.', '.obbbo.', '.osbso.', '..ooo..'],
  arrow: ['o......', 'oo.....', 'obo....', 'obbo...', 'obo....', 'oo.....', 'o......'],
  up: ['...o...', '..obo..', '.obbbo.', 'oobbboo', '..obo..', '..obo..', '..ooo..'],
  down: ['..ooo..', '..obo..', '..obo..', 'oobbboo', '.obbbo.', '..obo..', '...o...'],
  lock: ['..ooo..', '.o...o.', '.o...o.', 'ooooooo', 'ohbkbbo', 'obbkbbo', 'ooooooo'],
  check: ['......o', '.....oo', 'o...obo', 'oo.obo.', 'oboobo.', '.obbo..', '..oo...'],
  mic: ['..ooo..', '.ohbbo.', '.obbbo.', '.obbbo.', 'o.ooo.o', '.o.o.o.', '..ooo..'],
  shoe: ['.......', 'ooo....', 'ohbo...', 'obbbooo', 'obbbbbo', 'owwwwwo', 'ooooooo'],
  ring: ['..ooo..', '.ohwho.', 'o.ooo.o', 'o.o.o.o', 'o.ooo.o', '.o...o.', '..ooo..'],
  whistle: ['.......', '.oooo..', 'ohbbbooo', 'obbbbbbo', 'obkbboo.', '.oooo...', '.......'],
  plane: ['...o...', '...oo..', 'oooboo.', 'ohbbbbo', 'oooboo.', '...oo..', '...o...'],
  home: ['...o...', '..obo..', '.obbbo.', 'ohbbbbo', 'obkbkbo', 'obkbkbo', 'ooooooo'],
  sound: ['...o...', '..oo.o.', 'oohbo.o', 'ohbbo.o', 'oobbo.o', '..oo.o.', '...o...'],
  mute: ['...o...', '..oo...', 'oohbo.o', 'ohbbooo', 'oobbo.o', '..oo...', '...o...'],
  vault: ['ooooooo', 'ohbbbbo', 'obkkkbo', 'obkwkbo', 'obkkkbo', 'osbbbso', 'ooooooo'],
  tree: ['..ooo..', '.ohbbo.', 'ohbbbbo', 'obbsbbo', '.ooooo.', '...k...', '..kkk..'],
  share: ['....oo.', '...obo.', 'ooobbo.', 'ohbbbo.', 'obbbo..', 'osbo...', 'ooo....'],
  crown: ['.......', 'o..o..o', 'oo.o.oo', 'ohbobbo', 'obbbbbo', 'owbwbwo', 'ooooooo'],
  shield: ['ooooooo', 'ohbbbbo', 'obbwbbo', 'obwwwbo', '.obwbo.', '..obo..', '...o...'],
  sprout: ['.oo.oo.', 'ohbobho', '.oobo..', '...o...', '.ooooo.', '.obbbo.', '..ooo..'],
  flame: ['...o...', '..oho..', '.ohbo..', '.obbbo.', 'obbhbbo', 'obswsbo', '.ooooo.'],
  globe: ['..ooo..', '.ohbbo.', 'ohkbkbo', 'obbkbbo', 'obkbkbo', '.osbso.', '..ooo..'],
  six: ['.ooooo.', 'obbbbo.', 'obo....', 'obbbbo.', 'obo.obo', 'obbbbbo', '.ooooo.'],
  net: ['ooooooo', 'ohbbbbo', '.okwko.', '.owkwo.', '..okw..', '..owo..', '...o...'],
  shirt: ['oo...oo', 'ohoooho', 'obbbbbo', '.obbbo.', '.obbbo.', '.obsbo.', '.ooooo.'],
  film: ['ooooooo', 'okbbbko', 'obhbbbo', 'okbbbko', 'obbbbso', 'okbbbko', 'ooooooo'],
};
var ICON_BASE = {
  heart: '#e5483f', face: '#f2b632', star: '#ffd166', clip: '#7fb2ff', cash: '#3ecf8e', ball: '#e2762a',
  trophy: '#e8b33c', medal: '#e8b33c', arrow: '#ff7a1a', up: '#3ecf8e', down: '#ff6b6b', lock: '#8fa0d6',
  check: '#3ecf8e', mic: '#b8c3e6', sound: '#ffd166', mute: '#8fa0d6', shoe: '#ff7a1a', ring: '#ffd166', whistle: '#b8c3e6', plane: '#7fb2ff', home: '#c98b4e',
  vault: '#b8c3e6', tree: '#3ecf8e', share: '#ff7a1a',
  crown: '#ffd166', shield: '#7fb2ff', sprout: '#3ecf8e', flame: '#ff7a1a', globe: '#7fb2ff', six: '#b8c3e6', net: '#f4f1e8',
  shirt: '#7fb2ff', film: '#b8c3e6',
};
/* The big icons: the same letters on an eleven cell grid, for the trophy and
   badge tiles. At seven cells the outline ring is most of a medal, and a
   crown and a trophy were the same blob in two colours. */
var ICONS_L = {
  trophy: ['..ooooooo..', 'oohhbbbbsoo', 'o.ohbbbbo.o', 'o.ohbbbbo.o', '.oohbbbsoo.', '...obbbso..', '....obso...', '....obo....', '...obbbo...', '..obbbbso..', '..ooooooo..'],
  crown: ['...........', 'o....o....o', 'oo..oho..oo', 'obo.obo.obo', 'obbobbbobbo', 'ohbbbbbbbbo', 'obwbbwbbwbo', 'obbbbbbbbbo', 'ossssssssso', 'ooooooooooo', '...........'],
  medal: ['orqo...oqro', '.orqo.oqro.', '..orqoqro..', '...orqro...', '...ooooo...', '..ohhhbso..', '.ohbbwbbso.', '.ohwwwwwso.', '.obbwbwbso.', '..osbbbso..', '...ooooo...'],
  star: ['.....o.....', '....oho....', '...ohbbo...', 'oohhbbbbsoo', '.ohbbbbbso.', '..obbbbbo..', '..obbbbbo..', '.obbsosbbo.', '.obso.osbo.', 'obso...osbo', 'ooo.....ooo'],
  shield: ['ooooooooooo', 'ohhbbbbbbso', 'ohbbbbbbbso', 'ohbwbbbwbso', 'ohbbwbwbbso', '.ohbbwbbso.', '.obbbbbbso.', '..obbbbso..', '...obbso...', '....oso....', '.....o.....'],
  sprout: ['.ooo...ooo.', 'ohhbo.ohbbo', 'obbbsoobbso', '.osbbobbso.', '..ooobooo..', '....obo....', '....obo....', '.ooooooooo.', '.okkkkkkko.', '..okkkkko..', '..ooooooo..'],
  six: ['..ooooooo..', '.ohhbbbbso.', '.obbooooo..', '.obbo......', '.obbooooo..', '.ohbbbbbbo.', '.obbo..obbo', '.obbo..obbo', '.obbooobbso', '..osbbbbso.', '...oooooo..'],
  up: ['.....o.....', '....oho....', '...ohbbo...', '..ohbbbbo..', '.ohbbbbbbo.', 'oooohbsoooo', '...ohbso...', '...ohbso...', '...ohbso...', '...ohbso...', '...ooooo...'],
  flame: ['.....o.....', '....oho....', '...ohbo.o..', '...ohbooho.', '..ohbbbobbo', '.ohbbbbbbso', 'ohbbbhhbbso', 'obbbhwwhbso', 'obbshwwhsso', '.obsswwsso.', '..ooooooo..'],
  globe: ['...ooooo...', '..ohbkbbo..', '.ohbbkbbbo.', 'ohkkkkkkkko', 'obbbbkbbbso', 'obbbbkbbbso', 'okkkkkkkkko', '.obbbkbbso.', '..obbkbso..', '...ooooo...', '...........'],
  net: ['ooooooooooo', 'ohhbbbbbbso', 'ooooooooooo', '.owkwkwkwo.', '.okwkwkwko.', '..owkwkwo..', '..okwkwko..', '...owkwo...', '...okwko...', '....owo....', '....ooo....'],
  ball: ['...ooooo...', '..ohbkbbo..', '.ohbbkbbbo.', 'ohkbbkbbkso', 'obbkbkbkbso', 'okkkkkkkkko', 'obbkbkbkbso', 'osbkbkbkbso', '.osbbkbbso.', '..osbkbso..', '...ooooo...'],
};
/* THE ICONS ARE DRAWN, NOT TYPED. Seven and eleven cell letter grids could
   not say what a badge was: Board man came out as a red dagger, morale as a
   die, the Sixth Man award as a Cyrillic letter. Every icon is now a few
   shapes on a sixteen cell grid (circles, boxes, polygons, strokes, arcs and
   a 3x5 pixel font for numbers), rasterized cell by cell, lit from the top
   left on each material's own ramp and outlined once around the whole
   silhouette, so every icon is lit like the sprite. One drawing serves both
   sizes: 16px in a line of text, 48px on a tile. */
var MAT = {
  w: '#f4f1e8', k: '#1b2033', g: '#ffc94a', o: '#e2762a', r: '#e5483f', u: '#3f74d8', s: '#c9d2e3', i: '#8f9bb8',
  n: '#8a5a2b', p: '#d39a6a', m: '#3ecf8e', d: '#1e8c5b', c: '#7fe0ff', y: '#fff1a8', q: '#f29ab0', t: '#e9c39b', a: '#3a4062',
  e: '#2c3a5c', l: '#cfe4ff',
};
var FLAT = { k: 1, a: 1 };
var DIG = {
  '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '6': ['###', '#..', '###', '#.#', '###'], '$': ['.##', '#..', '.#.', '..#', '##.'], '+': ['...', '.#.', '###', '.#.', '...'],
};
function starPts(cx, cy, ro, ri){ var p = []; for (var i = 0; i < 10; i++){ var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
function inPoly(p, x, y){ var c = false; for (var i = 0, j = p.length - 1; i < p.length; j = i++){ var a = p[i], b = p[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function segD(x, y, x1, y1, x2, y2){ var dx = x2 - x1, dy = y2 - y1, t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1); t = Math.max(0, Math.min(1, t)); var ex = x1 + t * dx - x, ey = y1 + t * dy - y; return Math.sqrt(ex * ex + ey * ey); }
function hit(op, x, y){
  var t = op[0];
  if (t === 'C') { var dx = x - op[1], dy = y - op[2]; return dx * dx + dy * dy <= op[3] * op[3]; }
  if (t === 'E') { var ex = (x - op[1]) / op[3], ey = (y - op[2]) / op[4]; return ex * ex + ey * ey <= 1; }
  if (t === 'R') return x >= op[1] && x <= op[1] + op[3] && y >= op[2] && y <= op[2] + op[4];
  if (t === 'P') return inPoly(op[1], x, y);
  if (t === 'L') return segD(x, y, op[1], op[2], op[3], op[4]) <= op[5] / 2;
  if (t === 'A') { var ax = x - op[1], ay = y - op[2], d = Math.sqrt(ax * ax + ay * ay); if (Math.abs(d - op[3]) > op[4] / 2) return false;
    var ang = Math.atan2(ay, ax) * 180 / Math.PI; if (ang < 0) ang += 360; var a0 = ((op[5] % 360) + 360) % 360, a1 = ((op[6] % 360) + 360) % 360;
    if (op[6] - op[5] >= 360) return true; return a0 <= a1 ? ang >= a0 && ang <= a1 : ang >= a0 || ang <= a1; }
  return false;
}
/* A medal: a ribbon in two colours and a disc, with a number when it has one. */
function medalOps(n, ribA, ribB){
  var o = [['P', [[3.5, 1], [6.8, 1], [9, 7.5], [6, 7.5]], ribA || 'r'], ['P', [[12.5, 1], [9.2, 1], [7, 7.5], [10, 7.5]], ribB || 'u'], ['C', 8, 10.4, 4.8, 'b']];
  if (n) o.push(['B', 7, 8, DIG[n], 'k']); else o.push(['P', starPts(8, 10.6, 2.8, 1.2), 'w']);
  return o;
}
function trophyOps(){
  return [['P', [[3, 2.2], [13, 2.2], [12.3, 6.5], [10.2, 9], [5.8, 9], [3.7, 6.5]], 'b'], ['A', 3.4, 5, 2.3, 1.2, 90, 270, 'b'], ['A', 12.6, 5, 2.3, 1.2, -90, 90, 'b'],
    ['R', 7, 8.8, 2, 2.6, 'b'], ['R', 4.6, 11.2, 6.8, 1.6, 'b'], ['R', 3.6, 12.8, 8.8, 2, 'n']];
}
function ballSeams(cx, cy, r){
  var t = r > 5 ? 0.75 : 0.6;
  return [['L', cx, cy - r + 0.6, cx, cy + r - 0.6, t, 'k'], ['L', cx - r + 0.6, cy, cx + r - 0.6, cy, t, 'k'], ['A', cx - r * 1.35, cy, r * 1.05, t, -42, 42, 'k'], ['A', cx + r * 1.35, cy, r * 1.05, t, 138, 222, 'k']];
}
function tankOps(m){ return [['P', [[3.8, 1.5], [6.2, 1.5], [8, 3.8], [9.8, 1.5], [12.2, 1.5], [12.4, 5.5], [13.6, 7], [13.4, 14.8], [2.6, 14.8], [2.4, 7], [3.6, 5.5]], m || 'b']]; }
var ICON16 = {
  heart: { b: '#e5483f', ops: [['C', 5.4, 6, 3.4, 'b'], ['C', 10.6, 6, 3.4, 'b'], ['P', [[2.1, 7.2], [13.9, 7.2], [8, 14]], 'b']] },
  face: { b: '#ffc94a', ops: [['C', 8, 8, 6.4, 'b'], ['E', 5.7, 6.3, 0.9, 1.4, 'k'], ['E', 10.3, 6.3, 0.9, 1.4, 'k'], ['A', 8, 8.4, 3.7, 1.3, 25, 155, 'k']] },
  star: { b: '#ffc94a', ops: [['P', starPts(8, 8.6, 7.2, 3.1), 'b']] },
  clip: { b: '#8a5a2b', ops: [['R', 2.8, 2.6, 10.4, 12.6, 'b'], ['R', 4.2, 4.4, 7.6, 9.6, 'w'], ['R', 5.5, 1.4, 5, 2.8, 'i'], ['L', 5.6, 7, 10.4, 7, 0.9, 'k'], ['L', 5.6, 9.4, 10.4, 9.4, 0.9, 'k'], ['L', 5.6, 11.8, 8.8, 11.8, 0.9, 'k']] },
  cash: { b: '#3ecf8e', ops: [['R', 1.2, 3.8, 13.6, 8.6, 'b'], ['R', 2.6, 5.2, 10.8, 5.8, 'd'], ['C', 8, 8.1, 2.4, 'b'], ['B', 6.5, 5.6, DIG.$, 'w']] },
  ball: { b: '#e2762a', ops: [['C', 8, 8, 6.6, 'b']].concat(ballSeams(8, 8, 6.6)) },
  trophy: { b: '#ffc94a', ops: trophyOps() },
  starcup: { b: '#ffc94a', ops: trophyOps().concat([['P', starPts(8, 5.2, 2.6, 1.1), 'w']]) },
  medal: { b: '#ffc94a', ops: medalOps() },
  med1: { b: '#ffc94a', ops: medalOps('1') },
  med2: { b: '#c9d2e3', ops: medalOps('2') },
  med3: { b: '#d08a4a', ops: medalOps('3') },
  arrow: { b: '#ff7a1a', ops: [['P', [[1.6, 6], [8.6, 6], [8.6, 2.4], [14.6, 8], [8.6, 13.6], [8.6, 10], [1.6, 10]], 'b']] },
  back: { b: '#b8c3e6', ops: [['P', [[14.4, 6], [7.4, 6], [7.4, 2.4], [1.4, 8], [7.4, 13.6], [7.4, 10], [14.4, 10]], 'b']] },
  up: { b: '#3ecf8e', ops: [['P', [[8, 1.4], [14.4, 8], [10.4, 8], [10.4, 14.6], [5.6, 14.6], [5.6, 8], [1.6, 8]], 'b']] },
  down: { b: '#ff6b6b', ops: [['P', [[8, 14.6], [14.4, 8], [10.4, 8], [10.4, 1.4], [5.6, 1.4], [5.6, 8], [1.6, 8]], 'b']] },
  chart: { b: '#3ecf8e', ops: [['R', 1.6, 10, 3.2, 4.6, 'b'], ['R', 6.4, 6.8, 3.2, 7.8, 'b'], ['R', 11.2, 3, 3.2, 11.6, 'b'], ['R', 1, 14.2, 14, 1, 'w']] },
  lock: { b: '#ffc94a', ops: [['A', 8, 6.4, 3.4, 1.7, 180, 360, 'i'], ['R', 4.6, 6, 1.7, 2, 'i'], ['R', 9.7, 6, 1.7, 2, 'i'], ['R', 2.8, 7.4, 10.4, 7.6, 'b'], ['C', 8, 10.4, 1.3, 'k'], ['R', 7.4, 10.6, 1.2, 2.6, 'k']] },
  check: { b: '#3ecf8e', ops: [['L', 2.6, 8.6, 6.2, 12.2, 2.6, 'b'], ['L', 6.2, 12.2, 13.6, 3.8, 2.6, 'b']] },
  mic: { b: '#c9d2e3', ops: [['L', 8, 9.5, 8, 13.4, 1.8, 'a'], ['R', 4.8, 13.2, 6.4, 1.6, 'a'], ['E', 8, 5.6, 3.4, 4.2, 'b'], ['L', 5.4, 4.4, 10.6, 4.4, 0.7, 'k'], ['L', 5, 6.4, 11, 6.4, 0.7, 'k'], ['R', 6, 9.4, 4, 1.2, 'i']] },
  megaphone: { b: '#ff7a1a', ops: [['R', 4.6, 9.4, 2, 4.4, 'a'], ['P', [[1.6, 6.2], [5.6, 6.2], [13, 2.2], [13, 13.8], [5.6, 9.8], [1.6, 9.8]], 'b'], ['R', 12.4, 2.2, 1.8, 11.6, 'w']] },
  shoe: { b: '#ff7a1a', ops: [['P', [[1.6, 4.4], [6, 4.4], [7.4, 7.6], [12.4, 8.6], [14.6, 10.6], [14.6, 12.4], [1.6, 12.4]], 'b'], ['R', 1.4, 11.8, 13.4, 2.4, 'w'], ['L', 6.6, 6.4, 8.6, 9, 0.8, 'w'], ['L', 8.4, 6.8, 10.2, 9.2, 0.8, 'w']] },
  wings: { b: '#ff7a1a', ops: [['P', [[7.6, 9.6], [0.2, 4.6], [0.6, 2.4], [2.6, 3.4], [2.4, 0.6], [4.8, 2.2], [5.4, 0.2], [7.4, 2.8], [8.6, 1.6], [9.6, 7.6]], 'w'], ['L', 2.8, 5, 7.6, 8.6, 0.7, 'l'], ['L', 5.2, 3.6, 8.4, 7.6, 0.7, 'l'], ['P', [[6.4, 8], [9.6, 8], [10.6, 10], [13.4, 10.6], [15.2, 12], [15.2, 13.4], [6.4, 13.4]], 'b'], ['R', 6.2, 12.8, 9.2, 2, 'w'], ['L', 9.4, 9, 10.6, 10.6, 0.8, 'w']] },
  ring: { b: '#ffc94a', ops: [['A', 8, 10.2, 3.8, 2, 0, 360, 'b'], ['P', [[8, 1.2], [11.2, 4.2], [8, 7.2], [4.8, 4.2]], 'c']] },
  whistle: { b: '#c9d2e3', ops: [['A', 3.4, 4.6, 2.4, 0.9, 120, 300, 'r'], ['C', 6, 9.6, 4.4, 'b'], ['R', 7.6, 5.6, 7, 3.8, 'b'], ['C', 6, 9.6, 1.5, 'k']] },
  home: { b: '#c98b4e', ops: [['R', 3.2, 7.4, 9.6, 7.4, 'b'], ['P', [[1, 8.6], [8, 1.6], [15, 8.6]], 'r'], ['R', 7, 10.4, 2.4, 4.4, 'a'], ['R', 4.4, 9, 1.8, 1.8, 'y'], ['R', 10.2, 9, 1.8, 1.8, 'y']] },
  sound: { b: '#ffc94a', ops: [['P', [[1.6, 6], [4.6, 6], [8.6, 2.4], [8.6, 13.6], [4.6, 10], [1.6, 10]], 'b'], ['A', 8.6, 8, 3, 1.1, -50, 50, 'b'], ['A', 8.6, 8, 5.6, 1.1, -50, 50, 'b']] },
  mute: { b: '#8fa0d6', ops: [['P', [[1.6, 6], [4.6, 6], [8.6, 2.4], [8.6, 13.6], [4.6, 10], [1.6, 10]], 'b'], ['L', 10.4, 5.6, 14.6, 10.4, 1.4, 'r'], ['L', 14.6, 5.6, 10.4, 10.4, 1.4, 'r']] },
  vault: { b: '#8f9bb8', ops: [['R', 1.4, 1.6, 13.2, 12, 'b'], ['R', 2.8, 3, 10.4, 9.2, 'e'], ['C', 7.2, 7.6, 3.2, 's'], ['C', 7.2, 7.6, 1.2, 'a'], ['L', 7.2, 4.4, 7.2, 5.4, 0.8, 'a'], ['L', 4, 7.6, 5, 7.6, 0.8, 'a'], ['L', 12, 5.4, 12, 9.8, 1.4, 'g'], ['R', 2.6, 13.6, 2.4, 1.8, 'a'], ['R', 11, 13.6, 2.4, 1.8, 'a']] },
  tree: { b: '#3ecf8e', ops: [['R', 7, 9, 2, 5.8, 'n'], ['C', 8, 5.4, 4.6, 'b'], ['C', 4.6, 8.4, 3, 'b'], ['C', 11.4, 8.4, 3, 'b']] },
  share: { b: '#ff7a1a', ops: [['R', 1.8, 5.8, 9.4, 9, 'i'], ['R', 3.2, 7.2, 6.6, 6.2, 'e'], ['L', 5.6, 11, 12, 4.6, 1.8, 'b'], ['P', [[8.6, 1.4], [14.6, 1.4], [14.6, 7.4]], 'b']] },
  crown: { b: '#ffc94a', ops: [['P', [[1.6, 13.4], [1.6, 4.6], [5, 8.6], [8, 2.6], [11, 8.6], [14.4, 4.6], [14.4, 13.4]], 'b'], ['R', 1.6, 11, 12.8, 2.4, 'w'], ['C', 8, 12.2, 0.9, 'r'], ['C', 4.6, 12.2, 0.8, 'u'], ['C', 11.4, 12.2, 0.8, 'u']] },
  shield: { b: '#7fb2ff', ops: [['P', [[2.2, 1.8], [13.8, 1.8], [13.8, 8], [8, 14.8], [2.2, 8]], 'b'], ['P', starPts(8, 7, 3.4, 1.4), 'w']] },
  sprout: { b: '#3ecf8e', ops: [['P', [[3.6, 10], [12.4, 10], [11.2, 15], [4.8, 15]], 'n'], ['L', 8, 10, 8, 6, 1.2, 'b'], ['P', [[8, 7], [2.4, 2.8], [1.8, 5.2], [5, 7.6]], 'b'], ['P', [[8, 6], [13.6, 1.8], [14.2, 4.4], [11, 6.8]], 'b']] },
  flame: { b: '#ff7a1a', ops: [['P', [[8, 0.8], [11.4, 4.6], [13.4, 8.8], [12.8, 12.4], [10.2, 14.8], [5.8, 14.8], [3.2, 12.4], [2.8, 8.8], [4.8, 5.6], [6, 7.6], [6.8, 4.4]], 'b'], ['P', [[8, 6.6], [10.4, 9.8], [10.4, 12.6], [8, 13.8], [5.6, 12.6], [5.6, 9.8]], 'g'], ['E', 8, 11.8, 1.3, 1.6, 'w']] },
  globe: { b: '#3f74d8', ops: [['C', 8, 8, 6.6, 'b'], ['P', [[4, 3.6], [8, 3], [8.4, 6], [6, 8.6], [3.4, 7.4]], 'm'], ['P', [[9.6, 8.4], [13.6, 8.8], [12.4, 12.4], [9.4, 13]], 'm']] },
  torch: { b: '#ffc94a', ops: [['P', [[5.4, 9.4], [10.6, 9.4], [9.4, 15.2], [6.6, 15.2]], 'b'], ['R', 3.8, 7.8, 8.4, 2.2, 'b'], ['P', [[8, 0.4], [11.8, 4], [12, 7.8], [4, 7.8], [4.2, 4], [6.2, 4.6]], 'o'], ['P', [[8, 3.4], [10, 5.6], [9.8, 7.8], [6.2, 7.8], [6, 5.6]], 'y']] },
  net: { b: '#e2762a', ops: [['L', 3.2, 5, 5.4, 14.2, 0.8, 'w'], ['L', 6.2, 5, 7, 14.2, 0.8, 'w'], ['L', 9.8, 5, 9, 14.2, 0.8, 'w'], ['L', 12.8, 5, 10.6, 14.2, 0.8, 'w'], ['L', 3.8, 8.6, 12.2, 8.6, 0.8, 'w'], ['L', 4.8, 11.8, 11.2, 11.8, 0.8, 'w'], ['R', 1.2, 2.6, 13.6, 2.6, 'b']] },
  shirt: { b: '#7fb2ff', ops: tankOps() },
  six: { b: '#ffc94a', ops: tankOps().concat([['B', 5, 5, DIG['6'], 'k', 2]]) },
  film: { b: '#c9d2e3', ops: [['L', 11, 12, 15, 15, 1.8, 'a'], ['C', 7.4, 7.4, 6.4, 'b'], ['C', 7.4, 3.9, 1.4, null], ['C', 10.9, 7.4, 1.4, null], ['C', 7.4, 10.9, 1.4, null], ['C', 3.9, 7.4, 1.4, null], ['C', 7.4, 7.4, 1, 'k']] },
  target: { b: '#e5483f', ops: [['C', 8, 8, 6.6, 'b'], ['C', 8, 8, 4.7, 'w'], ['C', 8, 8, 2.8, 'b'], ['C', 8, 8, 1, 'w']] },
  play: { b: '#1e8c5b', ops: [['R', 1.6, 1.6, 12.8, 12.8, 'b'], ['L', 3.6, 3.6, 6.6, 6.6, 1, 'w'], ['L', 6.6, 3.6, 3.6, 6.6, 1, 'w'], ['A', 11, 11, 1.9, 1, 0, 360, 'w'], ['L', 6.4, 8, 9.4, 9.8, 0.9, 'g'], ['P', [[9.8, 8.4], [10.6, 10.8], [8.4, 10.6]], 'g']] },
  board: { b: '#cfe4ff', ops: [['R', 1.4, 1.2, 13.2, 8.4, 'b'], ['R', 5, 4, 6, 4, 'r'], ['R', 6, 4.9, 4, 2.2, 'b'], ['L', 5.2, 11, 6.6, 15, 0.8, 'w'], ['L', 10.8, 11, 9.4, 15, 0.8, 'w'], ['L', 8, 11, 8, 15, 0.8, 'w'], ['R', 4.2, 9.6, 7.6, 1.6, 'o']] },
  dunk: { b: '#e2762a', ops: [['L', 5.6, 11, 7.2, 15.2, 0.8, 'w'], ['L', 12.4, 11, 10.8, 15.2, 0.8, 'w'], ['L', 9, 11, 9, 15.2, 0.8, 'w'], ['L', 6.2, 13.2, 11.8, 13.2, 0.7, 'w'], ['L', 0.6, 0.8, 3.6, 3, 1, 'g'], ['L', 0.4, 4.6, 3, 5.8, 1, 'g'], ['L', 3.8, 0.2, 5.2, 1.6, 1, 'g'], ['C', 9.2, 5.6, 4.4, 'b']].concat(ballSeams(9.2, 5.6, 4.4), [['R', 2.4, 9.4, 13.2, 1.9, 'r']]) },
  brain: { b: '#f29ab0', ops: [['E', 5.6, 8, 4.4, 5.6, 'b'], ['E', 10.4, 8, 4.4, 5.6, 'b'], ['L', 8, 2.8, 8, 13.2, 0.8, 'k'], ['A', 5.4, 6, 2, 0.8, 200, 340, 'k'], ['A', 10.6, 6, 2, 0.8, 200, 340, 'k'], ['A', 5.4, 10.6, 2, 0.8, 20, 160, 'k'], ['A', 10.6, 10.6, 2, 0.8, 20, 160, 'k']] },
  bucket: { b: '#c9d2e3', ops: [['A', 8, 7.6, 6, 1, 180, 360, 'a'], ['C', 8, 5.2, 4, 'o']].concat(ballSeams(8, 5.2, 4), [['P', [[2.2, 7.4], [13.8, 7.4], [12.2, 15], [3.8, 15]], 'b'], ['R', 2.2, 7.2, 11.6, 1.6, 'i']]) },
  dime: { b: '#e2762a', ops: [['L', 1.4, 4.6, 5.6, 4.6, 1, 'w'], ['L', 0.8, 8, 5.2, 8, 1, 'w'], ['L', 1.4, 11.4, 5.6, 11.4, 1, 'w'], ['C', 10.2, 8, 5, 'b']].concat(ballSeams(10.2, 8, 5)) },
  grab: { b: '#e2762a', ops: [['C', 6.4, 9.8, 5.2, 'b']].concat(ballSeams(6.4, 9.8, 5.2), [['P', [[12.6, 0.8], [15.6, 4.6], [13.8, 4.6], [13.8, 9.4], [11.4, 9.4], [11.4, 4.6], [9.6, 4.6]], 'm']]) },
  clock: { b: '#f4f1e8', ops: [['R', 6.6, 0.8, 2.8, 1.8, 'r'], ['C', 8, 9, 6.2, 'b'], ['L', 8, 9, 8, 4.6, 1.1, 'k'], ['L', 8, 9, 11, 10.6, 1.1, 'k'], ['C', 8, 9, 0.9, 'r']] },
  bandage: { b: '#e9c39b', ops: [['P', [[1.6, 10.6], [10.6, 1.6], [14.4, 5.4], [5.4, 14.4]], 'b'], ['P', [[5.4, 8], [8, 5.4], [10.6, 8], [8, 10.6]], 'w'], ['C', 3.8, 10.6, 0.5, 'n'], ['C', 5.4, 12.2, 0.5, 'n'], ['C', 10.6, 3.8, 0.5, 'n'], ['C', 12.2, 5.4, 0.5, 'n']] },
  dumbbell: { b: '#8f9bb8', ops: [['L', 3, 8, 13, 8, 1.6, 'a'], ['R', 1.2, 3.8, 2.8, 8.4, 'b'], ['R', 12, 3.8, 2.8, 8.4, 'b'], ['R', 4, 5, 1.8, 6, 'b'], ['R', 10.2, 5, 1.8, 6, 'b']] },
  angry: { b: '#e5483f', ops: [['C', 3, 2.6, 1.5, 'w'], ['C', 13, 2.6, 1.5, 'w'], ['C', 8, 9.2, 5.8, 'b'], ['L', 4.8, 6.8, 7.4, 8, 1.1, 'k'], ['L', 11.2, 6.8, 8.6, 8, 1.1, 'k'], ['C', 6, 9.4, 0.8, 'k'], ['C', 10, 9.4, 0.8, 'k'], ['A', 8, 14.4, 3, 1.1, 210, 330, 'k']] },
  spotlight: { b: '#fff1a8', ops: [['P', [[3.6, 4.8], [6.4, 3.6], [14.4, 12.4], [5.6, 14]], 'b'], ['E', 9.8, 13, 5.8, 1.9, 'w'], ['R', 0.6, 14.2, 15, 1.6, 'n'], ['P', [[0.4, 2.4], [4.6, 0.4], [6.8, 4.2], [2.6, 6.2]], 'i'], ['L', 3.2, 5.4, 6.6, 3.8, 1, 'y']] },
  bulb: { b: '#fff1a8', ops: [['C', 8, 6.4, 5.4, 'b'], ['R', 5.6, 10.6, 4.8, 2.2, 's'], ['R', 6.2, 12.8, 3.6, 1.6, 'i'], ['R', 7, 14.2, 2, 1, 'a'], ['A', 8, 7.6, 1.8, 0.8, 180, 360, 'n'], ['L', 6.2, 7.6, 7, 10.4, 0.7, 'n'], ['L', 9.8, 7.6, 9, 10.4, 0.7, 'n']] },
  anvil: { b: '#8f9bb8', ops: [['P', [[0.4, 4.4], [4.2, 3.2], [14.8, 3.2], [14.8, 6.6], [11.2, 7.6], [10.2, 10.4], [13, 12.2], [13, 14.8], [3.4, 14.8], [3.4, 12.2], [6.2, 10.4], [5.6, 7.6], [4, 6.4], [0.4, 5]], 'b'], ['R', 4.4, 3.2, 10.4, 1, 's']] },
  bag: { b: '#e5483f', ops: [['A', 8, 6, 2.8, 1.1, 180, 360, 'a'], ['R', 2.8, 5.6, 10.4, 9.4, 'b'], ['B', 6.5, 7.8, DIG.$, 'w']] },
  piggy: { b: '#f29ab0', ops: [['P', [[4, 4.6], [5.6, 2.2], [6.8, 5]], 'b'], ['E', 7.6, 9, 6, 4.6, 'b'], ['E', 13.4, 9, 1.6, 1.8, 'q'], ['R', 3.6, 12.4, 1.8, 2.6, 'b'], ['R', 9.6, 12.4, 1.8, 2.6, 'b'], ['C', 10.6, 7.6, 0.7, 'k'], ['R', 6, 4.6, 3.2, 0.9, 'k'], ['C', 7.6, 2.4, 1.6, 'g']] },
  tophat: { b: '#3a4062', ops: [['E', 8, 12.6, 7, 2, 'b'], ['R', 4.2, 2, 7.6, 10.4, 'b'], ['R', 4.2, 8.8, 7.6, 1.8, 'r']] },
  moneybag: { b: '#c9a15a', ops: [['P', [[4.6, 1.6], [11.4, 1.6], [9.6, 4.6], [6.4, 4.6]], 'b'], ['C', 8, 10, 5.4, 'b'], ['R', 6.2, 4, 3.6, 2.6, 'b'], ['R', 5.6, 4.6, 4.8, 1.1, 'k'], ['B', 6.5, 7.8, DIG.$, 'd']] },
  bolt: { b: '#ffc94a', ops: [['P', [[9.4, 0.8], [2.8, 9], [7.4, 9], [5.8, 15.2], [13.2, 6.4], [8.6, 6.4], [11, 0.8]], 'b']] },
  people: { b: '#7fb2ff', ops: [['C', 5.2, 4.6, 2.6, 'p'], ['E', 5.2, 12.4, 4.2, 4, 'b'], ['C', 11, 5.2, 2.4, 'p'], ['E', 11, 12.8, 3.8, 3.6, 'm']] },
  paper: { b: '#f4f1e8', ops: [['R', 1.6, 2.2, 12.8, 12, 'b'], ['R', 3, 3.6, 10, 2, 'k'], ['R', 3, 7, 4.4, 4.4, 'i'], ['L', 8.6, 7.6, 13, 7.6, 0.8, 'k'], ['L', 8.6, 9.6, 13, 9.6, 0.8, 'k'], ['L', 3, 12.8, 13, 12.8, 0.8, 'k']] },
};
function icon16(name, color){
  var d = ICON16[name]; if (!d) return null;
  var base = color || d.b;
  return cached('i16:' + name + ':' + base, function(cv){
    var N = 16, SS = 4, grid = [];
    for (var y = 0; y < N; y++){ grid.push([]); for (var x = 0; x < N; x++) grid[y].push(null); }
    d.ops.forEach(function(op){
      if (op[0] === 'B') { var bx = Math.round(op[1]), by = Math.round(op[2]), sc = op[5] || 1; op[3].forEach(function(row, j){ for (var i = 0; i < row.length; i++) if (row[i] === '#') for (var v = 0; v < sc; v++) for (var u = 0; u < sc; u++) if (grid[by + j * sc + v]) grid[by + j * sc + v][bx + i * sc + u] = op[4]; }); return; }
      var m = op[op.length - 1];
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++){
        var n = 0;
        for (var j = 0; j < SS; j++) for (var i = 0; i < SS; i++) if (hit(op, x + (i + 0.5) / SS, y + (j + 0.5) / SS)) n++;
        if (n * 2 >= SS * SS) grid[y][x] = m;
      }
    });
    cv.width = N; cv.height = N;
    var c = cv.getContext('2d'), RM = {};
    var col = function(m){ return m === 'b' ? base : MAT[m] || base; };
    var at = function(x, y){ return y >= 0 && y < N && x >= 0 && x < N ? grid[y][x] : null; };
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++){
      var m = grid[y][x];
      if (m) {
        var hx = col(m);
        if (FLAT[m]) { c.fillStyle = hx; c.fillRect(x, y, 1, 1); continue; }
        var R = RM[hx] || (RM[hx] = ramp(hx));
        /* A seam or a line drawn on a shape is part of it: the light follows
           the shape's own edge, not every line across it. */
        var diff = function(q){ return q !== m && !FLAT[q]; };
        var up = diff(at(x, y - 1)), dn = diff(at(x, y + 1)), lf = diff(at(x - 1, y)), rt = diff(at(x + 1, y));
        c.fillStyle = up && lf ? R[4] : up || lf ? R[3] : dn && rt ? R[0] : dn || rt ? R[1] : R[2];
        c.fillRect(x, y, 1, 1);
      } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        c.fillStyle = '#070912'; c.fillRect(x, y, 1, 1);
      }
    }
  });
}
function icon(name, color, big){
  var g = (big && ICONS_L[name]) || ICONS[name]; if (!g) return null;
  var base = color || ICON_BASE[name] || '#b8c3e6';
  return cached('icon:' + name + ':' + base + (g.length > 7 ? ':L' : ''), function(cv){
    var h = g.length, w = 0; g.forEach(function(r){ w = Math.max(w, r.length); });
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), R = ramp(base);
    var P = { o: outlineOf(base), s: R[1], b: R[2], h: R[4], w: '#f4f1e8', k: mix(base, '#0b0e1a', 0.78), r: '#d8434b', q: '#3f74d8' };
    for (var y = 0; y < h; y++) for (var x = 0; x < g[y].length; x++){
      var ch = g[y][x]; if (!P[ch]) continue;
      c.fillStyle = P[ch]; c.fillRect(x, y, 1, 1);
    }
  });
}
/* An <img> of a pixel asset at a whole-number scale. */
function img(asset, scale, cls, alt){
  if (!asset) return '';
  var s = Math.max(1, Math.round(scale || 2));
  return '<img class="k-px' + (cls ? ' ' + cls : '') + '" src="' + asset.url + '" width="' + asset.w * s + '" height="' + asset.h * s + '" alt="' + (alt || '') + '"' + (alt ? '' : ' aria-hidden="true"') + ' draggable="false">';
}
function iconHtml(name, scale, color, alt){
  if (ICON16[name]) return img(icon16(name, color), Math.max(1, Math.round((scale || 2) * 7 / 16)), 'k-ico k-i16', alt);
  return img(icon(name, color), scale || 2, 'k-ico', alt);
}
/* A tile icon: the eleven cell drawing at 4x where there is one, the seven
   cell one at 6x where there is not, so both come out about 44px. */
function badgeHtml(name, color, alt){ if (ICON16[name]) return img(icon16(name, color), 3, 'k-ico', alt); return ICONS_L[name] ? img(icon(name, color, true), 4, 'k-ico', alt) : img(icon(name, color), 6, 'k-ico', alt); }

/* ─── the stylesheet ───────────────────────────────────────────────────── */

var CSS = [
':root{',
'  --k-floor:' + T.floor + ';--k-panel:' + T.panel + ';--k-panel-2:' + T.panel2 + ';--k-panel-3:' + T.panel3 + ';',
'  --k-frame:' + T.frame + ';--k-frame-hi:' + T.frameHi + ';--k-shade:' + T.shade + ';',
'  --k-ink:' + T.ink + ';--k-ink-2:' + T.ink2 + ';--k-ink-3:' + T.ink3 + ';',
'  --k-accent:' + T.accent + ';--k-accent-lip:' + T.accentLip + ';--k-accent-ink:' + T.accentInk + ';',
'  --k-gold:' + T.gold + ';--k-good:' + T.good + ';--k-bad:' + T.bad + ';--k-warn:' + T.warn + ';--k-trust:' + T.trust + ';--k-live:' + T.live + ';',
'  --k-team-1:#2b3242;--k-team-2:#c9ccd6;--k-team-ring:#4a5c99;--k-team-ink:#b8c3e6;--k-team-on:#ffffff;--k-team-glow:#1c2440;',
'  --k-f-display:"Anton",Impact,"Arial Narrow",sans-serif;',
'  --k-f-text:"Archivo",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
'  --k-f-pixel:"Press Start 2P","Anton",monospace;',
'  --k-t-hero:44px;--k-t-h1:32px;--k-t-h2:24px;--k-t-num:24px;--k-t-body:15px;--k-t-small:13px;--k-t-label:11px;--k-t-pix:8px;',
'  --k-s-1:4px;--k-s-2:8px;--k-s-3:12px;--k-s-4:16px;--k-s-5:24px;--k-s-6:32px;--k-s-7:48px;',
'  --k-px:3px;',
'  --k-m-snap:120ms;--k-m-quick:180ms;--k-m-move:320ms;--k-m-wipe:420ms;--k-m-count:900ms;',
'  --k-e-quick:cubic-bezier(.2,.8,.2,1);--k-e-move:cubic-bezier(.16,1,.3,1);--k-e-wipe:cubic-bezier(.7,0,.2,1);',
'}',
'@media (prefers-reduced-motion:reduce){:root{--k-m-snap:0ms;--k-m-quick:0ms;--k-m-move:0ms;--k-m-wipe:0ms;--k-m-count:0ms;}}',

/* Base. A kit root resets what it needs and nothing outside it. */
'.k-root{font-family:var(--k-f-text);font-size:var(--k-t-body);line-height:1.5;color:var(--k-ink);}',
'.k-root *,.k-root *::before,.k-root *::after{box-sizing:border-box;}',
'.k-px{image-rendering:pixelated;image-rendering:crisp-edges;display:inline-block;vertical-align:middle;}',
'.k-root :focus-visible,.k-root .is-focus{outline:2px solid var(--k-gold);outline-offset:3px;}',
'.k-root :focus:not(:focus-visible){outline:none;}',

/* Type roles. */
'.k-hero{font-family:var(--k-f-display);font-weight:400;font-size:var(--k-t-hero);line-height:.92;text-transform:uppercase;letter-spacing:.01em;margin:0;}',
'.k-h1{font-family:var(--k-f-display);font-weight:400;font-size:var(--k-t-h1);line-height:1;text-transform:uppercase;letter-spacing:.01em;margin:0;}',
'.k-h2{font-family:var(--k-f-display);font-weight:400;font-size:var(--k-t-h2);line-height:1.05;text-transform:uppercase;letter-spacing:.01em;margin:0;}',
'.k-num{font-family:var(--k-f-pixel);font-size:var(--k-t-num);line-height:1;font-variant-numeric:tabular-nums;}',
'.k-label{font-family:var(--k-f-text);font-size:var(--k-t-label);font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--k-ink-3);line-height:1.3;}',
'.k-pix{font-family:var(--k-f-pixel);font-size:var(--k-t-pix);line-height:1.6;letter-spacing:.02em;text-transform:uppercase;}',
'.k-small{font-size:var(--k-t-small);line-height:1.45;color:var(--k-ink-2);}',
'.k-dim{color:var(--k-ink-2);}',

/* The stepped pixel frame. Four offset box-shadows with no spread draw the
   four edges and leave each corner empty, which is the pixel corner; nothing
   is clipped, so a focus ring and a tooltip are never cut off. */
'.k-panel{position:relative;background:var(--k-panel);margin:var(--k-px);padding:var(--k-s-4);',
'  box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-frame),0 var(--k-px) 0 0 var(--k-frame),calc(var(--k-px)*-1) 0 0 0 var(--k-frame),var(--k-px) 0 0 0 var(--k-frame);}',
'.k-panel.k-team{box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-team-ring),0 var(--k-px) 0 0 var(--k-team-ring),calc(var(--k-px)*-1) 0 0 0 var(--k-team-ring),var(--k-px) 0 0 0 var(--k-team-ring);}',
'.k-panel.k-gold{box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-gold),0 var(--k-px) 0 0 var(--k-gold),calc(var(--k-px)*-1) 0 0 0 var(--k-gold),var(--k-px) 0 0 0 var(--k-gold);}',
'.k-panel.k-tight{padding:var(--k-s-3);}',
'.k-panel.k-flush{padding:0;}',
'.k-eyebrow{display:flex;align-items:center;gap:var(--k-s-2);font-family:var(--k-f-pixel);font-size:var(--k-t-pix);line-height:1.6;color:var(--k-gold);text-transform:uppercase;margin-bottom:var(--k-s-2);}',

/* Buttons. The primary is the one action on a screen: accent, a dark pixel
   rim and a 3px lip that the press pushes into. */
'.k-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:var(--k-s-2);min-height:48px;padding:12px 20px;margin:var(--k-px) var(--k-px) calc(var(--k-px)*2);border:0;cursor:pointer;',
'  font-family:var(--k-f-text);font-weight:800;font-size:15px;letter-spacing:.06em;text-transform:uppercase;line-height:1.1;color:var(--k-accent-ink);background:var(--k-accent);',
'  box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-shade),calc(var(--k-px)*-1) 0 0 0 var(--k-shade),var(--k-px) 0 0 0 var(--k-shade),0 var(--k-px) 0 0 var(--k-accent-lip),0 calc(var(--k-px)*2) 0 0 var(--k-shade);',
'  transition:transform var(--k-m-snap) steps(2),box-shadow var(--k-m-snap) steps(2),filter var(--k-m-quick);}',
'.k-btn:hover,.k-btn.is-hover{filter:brightness(1.08);}',
'.k-btn:active,.k-btn.is-pressed{transform:translateY(var(--k-px));box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-shade),calc(var(--k-px)*-1) 0 0 0 var(--k-shade),var(--k-px) 0 0 0 var(--k-shade),0 var(--k-px) 0 0 var(--k-shade);}',
'.k-btn:disabled,.k-btn[aria-disabled="true"]{background:var(--k-panel-3);color:var(--k-ink-3);filter:none;cursor:not-allowed;transform:none;',
'  box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-frame),calc(var(--k-px)*-1) 0 0 0 var(--k-frame),var(--k-px) 0 0 0 var(--k-frame),0 var(--k-px) 0 0 var(--k-frame);}',
'.k-btn.k-block{display:flex;width:calc(100% - var(--k-px)*2);}',
'.k-btn.k-big{min-height:56px;font-size:17px;}',
'.k-btn.k-sec{color:var(--k-ink);background:var(--k-panel-2);',
'  box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-frame),calc(var(--k-px)*-1) 0 0 0 var(--k-frame),var(--k-px) 0 0 0 var(--k-frame),0 var(--k-px) 0 0 var(--k-frame),0 calc(var(--k-px)*2) 0 0 var(--k-shade);}',
'.k-btn.k-sec:active,.k-btn.k-sec.is-pressed{box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-frame),calc(var(--k-px)*-1) 0 0 0 var(--k-frame),var(--k-px) 0 0 0 var(--k-frame),0 var(--k-px) 0 0 var(--k-frame);}',
'.k-btn.k-quiet{color:var(--k-ink-2);background:transparent;box-shadow:none;margin:0;min-height:44px;padding:10px 12px;letter-spacing:.08em;font-size:13px;}',
'.k-btn.k-quiet:hover{color:var(--k-ink);filter:none;}',
'.k-btn.k-quiet:active{transform:translateY(1px);box-shadow:none;}',
'.k-btn.k-icon{min-height:44px;min-width:44px;padding:8px;}',

/* Chips and the segmented choice. Selected is shape AND colour, never colour
   alone: the chosen chip wears the gold ring and a check. */
'.k-chips{display:flex;flex-wrap:wrap;gap:var(--k-s-2);}',
'.k-chip{min-height:40px;padding:8px 14px;margin:2px;border:0;cursor:pointer;background:var(--k-panel-2);color:var(--k-ink-2);font:700 13px var(--k-f-text);',
'  box-shadow:0 -2px 0 0 var(--k-frame),0 2px 0 0 var(--k-frame),-2px 0 0 0 var(--k-frame),2px 0 0 0 var(--k-frame);transition:background var(--k-m-quick),color var(--k-m-quick);}',
'.k-chip:hover,.k-chip.is-hover{color:var(--k-ink);background:var(--k-panel-3);}',
'.k-chip[aria-pressed="true"],.k-chip[aria-checked="true"],.k-chip.is-on{color:var(--k-ink);background:#2a2412;box-shadow:0 -2px 0 0 var(--k-gold),0 2px 0 0 var(--k-gold),-2px 0 0 0 var(--k-gold),2px 0 0 0 var(--k-gold);}',
'.k-chip[aria-pressed="true"]::before,.k-chip[aria-checked="true"]::before,.k-chip.is-on::before{content:"";display:inline-block;width:6px;height:6px;margin-right:6px;background:var(--k-gold);vertical-align:1px;}',
'.k-chip:disabled{opacity:.45;cursor:not-allowed;}',

/* Tabs. */
'.k-tabs{display:flex;gap:2px;border-bottom:2px solid var(--k-frame);}',
/* An icon button that wears its word under it; icon tabs that scroll in one row; a labelled spec sheet; a fold. */
'.k-ib{position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:46px;height:46px;padding:6px 0 4px;border:0;cursor:pointer;',
'  background:linear-gradient(180deg,#232c4c,#1a2140);color:var(--k-ink-2);box-shadow:inset 0 0 0 2px #34416f,inset 0 -3px 0 rgba(0,0,0,.3);font:800 8.5px/1 var(--k-f-text);letter-spacing:.08em;text-transform:uppercase;}',
'.k-ib:hover,.k-ib:focus-visible{color:#fff;box-shadow:inset 0 0 0 2px var(--k-accent),inset 0 -3px 0 rgba(0,0,0,.3);outline:none;}',
'.k-ib:active{transform:translateY(2px);}',
'.k-ib i{position:absolute;top:4px;right:4px;width:6px;height:6px;background:#5b6584;}',
'.k-ib[aria-pressed="true"] i{background:#3ecf8e;box-shadow:0 0 6px #3ecf8e;}',
'.k-ib[aria-pressed="false"]{opacity:.8;}',
'@media (max-width:359px){.k-ib{width:40px;}}',
'.k-spec{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;margin:0;}',
'.k-spec > div{min-width:0;padding:6px 8px;background:rgba(143,160,214,.07);box-shadow:inset 2px 0 0 var(--k-team,#34416f);}',
'.k-spec dt{font:800 9.5px/1.2 var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);}',
'.k-spec dd{margin:3px 0 0;font:700 13px/1.3 var(--k-f-text);color:var(--k-ink);overflow-wrap:anywhere;}',
'.k-itabs.k-tabs{display:flex;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;gap:2px;margin:-4px -4px 12px;padding:0 4px;}',
'.k-itabs::-webkit-scrollbar{display:none;}',
'.k-itabs .k-itab{flex:1 0 auto;min-width:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:9px 8px 10px;font-size:10px;letter-spacing:.1em;}',
'.k-itabs .k-itab .k-icon,.k-itabs .k-itab svg,.k-itabs .k-itab img{opacity:.55;transition:opacity var(--k-m-snap),transform var(--k-m-snap);}',
'.k-itabs .k-itab[aria-selected="true"] .k-icon,.k-itabs .k-itab[aria-selected="true"] svg,.k-itabs .k-itab[aria-selected="true"] img{opacity:1;transform:translateY(-1px);}',
'.k-itabs .k-itab[aria-selected="true"]{background:linear-gradient(180deg,rgba(255,122,26,0),rgba(255,122,26,.12));}',
'.k-fold{margin:0 0 12px;border:1px solid rgba(143,160,214,.18);padding:8px 10px;}',
'.k-fold summary{cursor:pointer;font:800 11px var(--k-f-text);letter-spacing:.1em;text-transform:uppercase;color:var(--k-ink-2);}',
'.k-fold[open] summary{margin-bottom:8px;}',
'.k-fold > summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;margin:0;}',
'.k-fold > summary::-webkit-details-marker{display:none;}',
'.k-fold > summary::after{content:"+";margin-left:8px;font:400 12px var(--k-f-pixel);color:var(--k-accent);}',
'.k-fold[open] > summary::after{content:"-";}',
'.k-fold[open] > summary{margin-bottom:10px;}',
'.k-foldn{margin-left:auto;font:700 11px var(--k-f-text);letter-spacing:.04em;text-transform:none;color:var(--k-ink-3);}',
'.k-tab{flex:1;min-height:44px;border:0;background:transparent;color:var(--k-ink-3);font:800 12px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;cursor:pointer;position:relative;}',
'.k-tab:hover,.k-tab.is-hover{color:var(--k-ink);}',
'.k-tab[aria-selected="true"]{color:var(--k-ink);}',
'.k-tab[aria-selected="true"]::after{content:"";position:absolute;left:12%;right:12%;bottom:-2px;height:4px;background:var(--k-accent);}',

/* Meters: an icon, ten pips and the value. The pips step, they never slide,
   and a change flashes the meter once. */
'.k-meters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--k-s-2);}',
'.k-meter{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 2px;background:transparent;border:0;color:inherit;cursor:help;font:inherit;}',
'.k-meter .k-pips{display:flex;gap:1px;}',
'.k-pips i{width:4px;height:10px;background:var(--k-panel-3);}',
'.k-pips i.on{background:var(--k-pip,var(--k-good));}',
'.k-meter .k-mv{font-family:var(--k-f-pixel);font-size:10px;color:var(--k-ink);}',
'.k-meter .k-mk{font-family:var(--k-f-pixel);font-size:7px;color:var(--k-ink-3);letter-spacing:.04em;}',
'.k-meter.is-up .k-pips{animation:k-pulse-up 900ms steps(6) 1;}',
'.k-meter.is-down .k-pips{animation:k-pulse-down 900ms steps(6) 1;}',
'@keyframes k-pulse-up{0%,33%,66%{filter:brightness(1.8) drop-shadow(0 0 0 var(--k-good));}16%,50%,100%{filter:none;}}',
'@keyframes k-pulse-down{0%,33%,66%{filter:brightness(1.6) hue-rotate(140deg);}16%,50%,100%{filter:none;}}',

/* Tooltip, shown on hover, on keyboard focus, and on a tap (script toggles
   .is-open), so a phone can read what a meter does. */
'.k-tip{position:absolute;z-index:30;left:50%;bottom:calc(100% + 8px);width:220px;transform:translateX(-50%);padding:10px 12px;background:var(--k-panel-3);color:var(--k-ink);font:500 13px/1.45 var(--k-f-text);text-align:left;',
'  box-shadow:0 -2px 0 0 var(--k-frame-hi),0 2px 0 0 var(--k-frame-hi),-2px 0 0 0 var(--k-frame-hi),2px 0 0 0 var(--k-frame-hi),0 6px 0 0 var(--k-shade);',
'  opacity:0;visibility:hidden;pointer-events:none;transition:opacity var(--k-m-quick),visibility 0s var(--k-m-quick);}',
'.k-tip b{display:block;font:800 11px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-gold);margin-bottom:2px;}',
'.k-has-tip:hover .k-tip,.k-has-tip:focus-visible .k-tip,.k-has-tip.is-open .k-tip{opacity:1;visibility:visible;transition-delay:0s;}',
'.k-tip.k-left{left:0;transform:none;}.k-tip.k-right{left:auto;right:0;transform:none;}',

/* Rating rows: label, a stepped bar of 20 cells, the value, and a delta. */
'.k-rows{display:grid;gap:6px;}',
'.k-row{display:grid;grid-template-columns:108px 1fr 30px 40px;align-items:center;gap:var(--k-s-2);font-size:13px;color:var(--k-ink-2);}',
'.k-row.is-key{color:var(--k-ink);}',
'.k-bar{display:grid;grid-template-columns:repeat(20,1fr);gap:1px;height:8px;}',
'.k-bar i{background:var(--k-panel-3);}',
'.k-bar i.on{background:var(--k-bar,var(--k-accent));}',
'.k-bar.k-fill i.on{animation:k-cell var(--k-m-quick) steps(1) both;}',
'@keyframes k-cell{from{opacity:0;}to{opacity:1;}}',
'.k-row .k-v{font-family:var(--k-f-pixel);font-size:10px;color:var(--k-ink);text-align:right;}',
'.k-delta{font-family:var(--k-f-pixel);font-size:8px;text-align:left;}',
'.k-delta.up{color:var(--k-good);}.k-delta.down{color:var(--k-bad);}',

/* The player card: the stage, the man in the light, the name and the number. */
'.k-card-player{position:relative;overflow:hidden;padding:0;}',
'.k-stage{position:relative;height:240px;overflow:hidden;background:var(--k-floor);}',
'.k-stage .k-set{position:absolute;left:50%;top:0;transform:translateX(-50%);}',
'.k-stage .k-crowd{position:absolute;left:50%;top:0;transform:translateX(-50%);}',
'.k-stage .k-floorart{position:absolute;left:50%;bottom:0;transform:translateX(-50%);}',
'.k-stage .k-spot{position:absolute;left:30%;top:-30px;width:300px;height:320px;transform:translateX(-50%);',
'  background:radial-gradient(ellipse 42% 62% at 50% 0%,rgba(255,236,196,.30),rgba(255,236,196,0) 72%);pointer-events:none;}',
'.k-stage .k-teamwash{position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,var(--k-team-glow) 160%);mix-blend-mode:screen;opacity:.6;pointer-events:none;}',
'.k-stage .k-scrim-r{position:absolute;inset:0;background:linear-gradient(270deg,rgba(5,7,13,.88) 0,rgba(5,7,13,.6) 34%,rgba(5,7,13,0) 62%);pointer-events:none;}',
'.k-stage .k-actor{position:absolute;left:30%;bottom:14px;transform:translateX(-50%);}',
'.k-card-player .k-id{position:absolute;right:var(--k-s-4);top:var(--k-s-4);left:56%;text-align:right;}',
'.k-card-player .k-id .k-hero{text-shadow:3px 3px 0 var(--k-shade);font-size:36px;}',
'.k-card-player .k-id .k-tag{margin-top:8px;}',
'.k-card-player .k-ovr{position:absolute;right:var(--k-s-4);bottom:var(--k-s-4);text-align:right;}',
'.k-card-player .k-ovr .k-num{font-size:30px;color:#fff;text-shadow:3px 3px 0 var(--k-team-1),3px 3px 0 var(--k-shade);display:block;}',
'.k-card-player .k-ovr .k-pix{color:var(--k-gold);}',
'.k-card-player .k-strip{display:flex;flex-wrap:wrap;gap:6px;padding:var(--k-s-3) var(--k-s-4);border-top:3px solid var(--k-frame);background:var(--k-panel);}',

/* Tags and badges. */
'.k-tag{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;font-family:var(--k-f-pixel);font-size:8px;line-height:1;white-space:nowrap;text-transform:uppercase;color:var(--k-ink);background:var(--k-panel-2);',
'  box-shadow:0 -2px 0 0 var(--k-frame),0 2px 0 0 var(--k-frame),-2px 0 0 0 var(--k-frame),2px 0 0 0 var(--k-frame);}',
'.k-tag.k-acc{background:var(--k-accent);color:var(--k-accent-ink);box-shadow:0 -2px 0 0 var(--k-shade),0 2px 0 0 var(--k-shade),-2px 0 0 0 var(--k-shade),2px 0 0 0 var(--k-shade);}',
'.k-tag.k-gold{background:#2a2412;color:var(--k-gold);box-shadow:0 -2px 0 0 var(--k-gold),0 2px 0 0 var(--k-gold),-2px 0 0 0 var(--k-gold),2px 0 0 0 var(--k-gold);}',
'.k-tag.k-team{background:var(--k-team-1);color:var(--k-team-on);box-shadow:0 -2px 0 0 var(--k-shade),0 2px 0 0 var(--k-shade),-2px 0 0 0 var(--k-shade),2px 0 0 0 var(--k-shade);}',
'.k-badge{display:flex;flex-direction:column;align-items:center;gap:6px;width:84px;text-align:center;font:700 11px/1.3 var(--k-f-text);color:var(--k-ink-2);}',
'.k-badge .k-medal{width:56px;height:56px;display:grid;place-items:center;background:var(--k-panel-2);',
'  box-shadow:0 -3px 0 0 var(--k-gold),0 3px 0 0 var(--k-gold),-3px 0 0 0 var(--k-gold),3px 0 0 0 var(--k-gold),0 7px 0 0 var(--k-shade);}',
'.k-badge.is-locked .k-medal{box-shadow:0 -3px 0 0 var(--k-frame),0 3px 0 0 var(--k-frame),-3px 0 0 0 var(--k-frame),3px 0 0 0 var(--k-frame);}',
'.k-badge.is-locked .k-medal img{filter:grayscale(1) brightness(.6);}',

/* The decision card. Numbered options a thumb can reach and a keyboard can
   press (1, 2, 3); the hint is the consequence, written plainly. */
'.k-decision .k-h1{margin-bottom:var(--k-s-2);}',
'.k-decision > p{margin:0 0 var(--k-s-3);color:var(--k-ink-2);}',
'.k-opts{display:flex;flex-direction:column;gap:var(--k-s-2);list-style:none;margin:0;padding:0;}',
'.k-opt{display:flex;align-items:flex-start;gap:var(--k-s-3);width:100%;min-height:56px;padding:12px;border:0;cursor:pointer;text-align:left;color:var(--k-ink);background:var(--k-panel-2);font:700 15px/1.3 var(--k-f-text);',
'  box-shadow:0 -2px 0 0 var(--k-panel-3),0 2px 0 0 var(--k-panel-3),-2px 0 0 0 var(--k-panel-3),2px 0 0 0 var(--k-panel-3);transition:background var(--k-m-quick);}',
'.k-opt .k-key{flex:none;width:22px;height:22px;display:grid;place-items:center;font-family:var(--k-f-pixel);font-size:9px;color:var(--k-accent-ink);background:var(--k-accent);margin-top:1px;}',
'.k-opt small{display:block;margin-top:3px;font:500 13px/1.4 var(--k-f-text);color:var(--k-ink-2);}',
'.k-opt:hover,.k-opt.is-hover{background:var(--k-panel-3);}',
'.k-opt:active,.k-opt.is-pressed{transform:translateY(2px);}',
'.k-opt.is-chosen{background:var(--k-accent);color:var(--k-accent-ink);}',
'.k-opt.is-chosen small{color:#3f1d05;}',
'.k-opt.is-chosen .k-key{background:var(--k-accent-ink);color:var(--k-accent);}',
'.k-opt:disabled{opacity:.5;cursor:not-allowed;}',
'.k-opt .k-tone{margin-left:auto;flex:none;}',

/* The receipt: what changed and why, after every decision. */
'.k-receipt{display:grid;gap:var(--k-s-2);}',
'.k-receipt .k-what{font-size:15px;color:var(--k-ink);margin:0;}',
'.k-receipt ul{list-style:none;margin:0;padding:0;display:grid;gap:4px;}',
'.k-receipt li{display:grid;grid-template-columns:auto 1fr auto;gap:var(--k-s-2);align-items:center;padding:6px 0;border-top:1px dashed rgba(143,160,214,.22);font-size:13px;color:var(--k-ink-2);}',
'.k-receipt li b{font-family:var(--k-f-pixel);font-size:9px;}',
'.k-receipt li .up{color:var(--k-good);}.k-receipt li .down{color:var(--k-bad);}',
'.k-receipt .k-flag{font-size:12px;color:var(--k-gold);}',

/* Tables. Tabular figures, a pixel rule under the head, and a horizontal
   scroller that says it scrolls. */
'.k-tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}',
'.k-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;}',
'.k-table th{font:800 10px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);text-align:right;padding:6px 8px;border-bottom:3px solid var(--k-frame);white-space:nowrap;}',
'.k-table td{padding:7px 8px;text-align:right;color:var(--k-ink-2);border-bottom:1px solid rgba(143,160,214,.12);white-space:nowrap;}',
'.k-table th:first-child,.k-table td:first-child{text-align:left;}',
'.k-table tr.is-best td{color:var(--k-gold);}',
'.k-table tr.is-now td{color:var(--k-ink);background:rgba(255,122,26,.08);}',

/* Media: a headline and a social post. */
'.k-headline{display:grid;gap:4px;padding:var(--k-s-3) 0;border-top:1px solid rgba(143,160,214,.14);}',
'.k-headline .k-out{font:800 10px var(--k-f-text);letter-spacing:.14em;text-transform:uppercase;color:var(--k-out,var(--k-trust));}',
'.k-headline h4{margin:0;font:700 16px/1.3 var(--k-f-text);color:var(--k-ink);}',
'.k-post{display:grid;grid-template-columns:36px 1fr;gap:var(--k-s-2);padding:var(--k-s-2) 0;}',
'.k-post .k-ava{width:36px;height:36px;background:var(--k-panel-3);display:grid;place-items:center;font-family:var(--k-f-pixel);font-size:10px;color:var(--k-ink);}',
'.k-post b{font-size:13px;}.k-post b span{color:var(--k-ink-3);font-weight:500;}',
'.k-post p{margin:2px 0 0;font-size:14px;color:var(--k-ink-2);}',

/* The broadcast package. */
'.k-bug{display:inline-flex;align-items:stretch;font-family:var(--k-f-pixel);font-size:9px;line-height:1;background:var(--k-shade);',
'  box-shadow:0 -2px 0 0 var(--k-frame),0 2px 0 0 var(--k-frame),-2px 0 0 0 var(--k-frame),2px 0 0 0 var(--k-frame);}',
'.k-bug > span{display:flex;align-items:center;gap:6px;padding:7px 8px;}',
'.k-bug .k-tm{background:var(--k-c,var(--k-team-1));color:var(--k-on,var(--k-team-on));}',
'.k-bug .k-sc{color:#fff;min-width:30px;justify-content:flex-end;}',
'.k-bug .k-clock{color:var(--k-gold);}',
'.k-lower{display:flex;align-items:flex-end;gap:var(--k-s-3);max-width:520px;}',
'.k-lower .k-plate{flex:1;background:var(--k-team-1);color:var(--k-team-on);padding:8px 12px 10px;position:relative;',
'  box-shadow:0 -3px 0 0 var(--k-shade),0 3px 0 0 var(--k-shade),-3px 0 0 0 var(--k-shade),3px 0 0 0 var(--k-shade);}',
'.k-lower .k-plate::after{content:"";position:absolute;left:0;right:0;bottom:-3px;height:3px;background:var(--k-gold);}',
'.k-lower .k-plate b{display:block;font-family:var(--k-f-display);font-weight:400;font-size:24px;line-height:1;text-transform:uppercase;}',
'.k-lower .k-plate span{font-family:var(--k-f-pixel);font-size:8px;opacity:.85;}',
'.k-tape{display:grid;grid-template-columns:1fr auto 1fr;gap:var(--k-s-2) var(--k-s-3);align-items:center;}',
'.k-tape .k-side{text-align:center;}',
'.k-tape .k-mid{font-family:var(--k-f-pixel);font-size:8px;color:var(--k-ink-3);text-align:center;}',
'.k-tape .k-l,.k-tape .k-r{font-family:var(--k-f-pixel);font-size:11px;}',
'.k-tape .k-l{text-align:right;}.k-tape .win{color:var(--k-gold);}',
'.k-ticker{display:flex;align-items:center;overflow:hidden;height:30px;background:var(--k-shade);border-top:3px solid var(--k-team-ring);white-space:nowrap;}',
'.k-ticker b{flex:none;height:100%;display:flex;align-items:center;padding:0 10px;background:var(--k-team-1);color:var(--k-team-on);font-family:var(--k-f-pixel);font-size:8px;}',
'.k-ticker .k-run{display:inline-flex;gap:48px;padding-left:12px;animation:k-tick 26s linear infinite;font:600 12px var(--k-f-text);color:var(--k-ink-2);}',
'@keyframes k-tick{to{transform:translateX(-50%);}}',
'@media (prefers-reduced-motion:reduce){.k-ticker .k-run{animation:none;}}',
'.k-wipe{position:fixed;inset:0;z-index:90;pointer-events:none;background:var(--k-team-1);transform:translateX(-101%);',
'  -webkit-mask:linear-gradient(90deg,#000 0 92%,transparent 92% 94%,#000 94% 96%,transparent 96%);mask:linear-gradient(90deg,#000 0 92%,transparent 92% 94%,#000 94% 96%,transparent 96%);}',
'.k-wipe.is-on{animation:k-wipe var(--k-m-wipe) var(--k-e-wipe) both;}',
'@keyframes k-wipe{0%{transform:translateX(-101%);}45%,55%{transform:translateX(0);}100%{transform:translateX(101%);}}',

/* Toasts. */
'.k-toasts{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;display:grid;gap:8px;width:min(420px,calc(100% - 32px));pointer-events:none;}',
'.k-toast{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--k-panel-3);color:var(--k-ink);font:700 14px var(--k-f-text);pointer-events:auto;',
'  box-shadow:0 -3px 0 0 var(--k-frame-hi),0 3px 0 0 var(--k-frame-hi),-3px 0 0 0 var(--k-frame-hi),3px 0 0 0 var(--k-frame-hi),0 7px 0 0 var(--k-shade);',
'  animation:k-toast-in var(--k-m-move) var(--k-e-move) both;}',
'.k-toast.k-gold{box-shadow:0 -3px 0 0 var(--k-gold),0 3px 0 0 var(--k-gold),-3px 0 0 0 var(--k-gold),3px 0 0 0 var(--k-gold),0 7px 0 0 var(--k-shade);}',
'@keyframes k-toast-in{from{transform:translateY(16px);opacity:0;}to{transform:none;opacity:1;}}',

/* Sheets and modals. On a phone a sheet rises from the bottom; from 640px it is
   a centred modal. The backdrop is a dark scrim, never a blur over the arena. */
'.k-scrim{position:fixed;inset:0;z-index:70;background:rgba(5,7,13,.72);display:flex;align-items:flex-end;justify-content:center;}',
'.k-scrim[hidden]{display:none;}',
'.k-sheet{width:100%;max-width:560px;max-height:86vh;overflow:auto;margin:0;padding:var(--k-s-5) var(--k-s-4) calc(var(--k-s-5) + env(safe-area-inset-bottom));background:var(--k-panel);',
'  box-shadow:0 -3px 0 0 var(--k-frame-hi);animation:k-sheet-up var(--k-m-move) var(--k-e-move) both;}',
'@media (min-width:640px){.k-scrim{align-items:center;}.k-sheet{margin:var(--k-s-5);box-shadow:0 -3px 0 0 var(--k-frame-hi),0 3px 0 0 var(--k-frame-hi),-3px 0 0 0 var(--k-frame-hi),3px 0 0 0 var(--k-frame-hi),0 9px 0 0 var(--k-shade);}}',
'@keyframes k-sheet-up{from{transform:translateY(24px);opacity:0;}to{transform:none;opacity:1;}}',
'.k-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:var(--k-s-3);margin-bottom:var(--k-s-3);}',

/* States: empty, loading, error. */
'.k-state{display:grid;justify-items:center;gap:var(--k-s-2);padding:var(--k-s-5) var(--k-s-4);text-align:center;color:var(--k-ink-2);}',
'.k-state p{margin:0;max-width:300px;font-size:14px;}',
'.k-state.k-error{color:var(--k-ink);}',
'.k-loading .k-bounce{animation:k-bounce 600ms steps(4) infinite;}',
'@keyframes k-bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-9px);}}',
'@media (prefers-reduced-motion:reduce){.k-loading .k-bounce{animation:none;}}',

/* Ad slot: designed in, labelled, never inside a decision or over a control. */
'.k-ad{display:grid;place-items:center;min-height:100px;margin:var(--k-s-4) var(--k-px);background:repeating-linear-gradient(45deg,var(--k-panel),var(--k-panel) 6px,var(--k-panel-2) 6px,var(--k-panel-2) 12px);color:var(--k-ink-3);}',
'.k-ad::before{content:"Sponsored";font:800 10px var(--k-f-text);letter-spacing:.14em;text-transform:uppercase;}',

/* Count up: the figure is drawn by script; the final number is in the DOM from
   the first frame so a reader and a screen reader get the answer. */
'.k-count{font-variant-numeric:tabular-nums;}',

/* Entering, once. A screen adds .k-in to what is new; a re-render that keeps an
   element keeps it still. */
'.k-in{animation:k-in var(--k-m-move) var(--k-e-move) both;}',
'@keyframes k-in{from{transform:translateY(10px);opacity:0;}to{transform:none;opacity:1;}}',
].join('\n');

function inject(){
  if (typeof document === 'undefined' || document.getElementById('rtf-kit-css')) return;
  var st = document.createElement('style');
  st.id = 'rtf-kit-css';
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/* ─── behaviour ────────────────────────────────────────────────────────── */

/* A rating bar: twenty cells, value out of 99, lit one by one with a stagger
   when `fill` is asked for (a change), still otherwise. */
function bar(v, color, fill){
  var on = Math.round(Math.max(0, Math.min(99, v)) / 99 * 20), h = '';
  for (var i = 0; i < 20; i++) h += '<i' + (i < on ? ' class="on"' + (fill ? ' style="animation-delay:' + (i * 30) + 'ms"' : '') : '') + '></i>';
  return '<span class="k-bar' + (fill ? ' k-fill' : '') + '"' + (color ? ' style="--k-bar:' + color + '"' : '') + ' aria-hidden="true">' + h + '</span>';
}
function tickerHtml(label, items){
  var run = items.map(function(t){ return '<span>' + t + '</span>'; }).join('');
  return '<div class="k-ticker"><b>' + label + '</b><span class="k-run">' + run + run + '</span></div>';
}

/* Ten pips off a value out of 100. */
function pips(v, n){ n = n || 10; var on = Math.round(Math.max(0, Math.min(100, v)) / 100 * n), s = ''; for (var i = 0; i < n; i++) s += '<i' + (i < on ? ' class="on"' : '') + '></i>'; return s; }

/* A tap on a tooltip host opens it on a touch screen and a second tap or a tap
   anywhere else closes it. Hover and keyboard focus are pure CSS. */
function wireTips(root){
  if (!root || root._kTips) return;
  root._kTips = true;
  root.addEventListener('click', function(e){
    var h = e.target.closest && e.target.closest('.k-has-tip');
    var open = root.querySelectorAll('.k-has-tip.is-open');
    for (var i = 0; i < open.length; i++) if (open[i] !== h) open[i].classList.remove('is-open');
    if (h) h.classList.toggle('is-open');
  });
}

/* Counts a number up into an element. Reduced motion lands on the answer. */
function countUp(el, to, opts){
  if (!el) return;
  var o = opts || {}, from = o.from || 0, dur = o.ms == null ? 900 : o.ms, fmt = o.format || function(v){ return Math.round(v).toLocaleString('en-US'); };
  el.setAttribute('aria-label', fmt(to));
  if (reduced() || dur <= 0){ el.textContent = fmt(to); return; }
  var t0 = null;
  function f(t){
    if (!el.isConnected) return;
    if (t0 == null) t0 = t;
    var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
}

function reduced(){ return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; }

var toastBox = null;
function toast(html, cls, ms){
  if (typeof document === 'undefined') return;
  if (!toastBox){ toastBox = document.createElement('div'); toastBox.className = 'k-toasts k-root'; toastBox.setAttribute('role', 'status'); toastBox.setAttribute('aria-live', 'polite'); document.body.appendChild(toastBox); }
  var t = document.createElement('div');
  t.className = 'k-toast' + (cls ? ' ' + cls : '');
  t.innerHTML = html;
  toastBox.appendChild(t);
  setTimeout(function(){ t.remove(); }, ms || 3200);
}

var wipeEl = null;
function wipe(cb){
  if (typeof document === 'undefined' || reduced()){ if (cb) cb(); return; }
  if (!wipeEl){ wipeEl = document.createElement('div'); wipeEl.className = 'k-wipe'; wipeEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(wipeEl); }
  wipeEl.classList.remove('is-on'); void wipeEl.offsetWidth; wipeEl.classList.add('is-on');
  setTimeout(function(){ if (cb) cb(); }, 190);
}

/* A dialog: focus goes in, Tab stays in, Escape and the scrim close it, and
   focus goes back to whatever opened it. */
function dialog(scrim, opts){
  var o = opts || {}, back = document.activeElement;
  scrim.hidden = false;
  var sheet = scrim.querySelector('.k-sheet') || scrim;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  if (o.label) sheet.setAttribute('aria-label', o.label);
  function focusables(){ return Array.prototype.slice.call(sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function(x){ return !x.disabled && x.offsetParent !== null; }); }
  function close(){ scrim.hidden = true; scrim.removeEventListener('keydown', key); scrim.removeEventListener('click', out); if (back && back.focus) back.focus(); if (o.onClose) o.onClose(); }
  function key(e){
    if (e.key === 'Escape'){ e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(); if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]){ e.preventDefault(); f[0].focus(); }
  }
  function out(e){ if (e.target === scrim) close(); }
  scrim.addEventListener('keydown', key);
  scrim.addEventListener('click', out);
  var first = focusables()[0]; if (first) first.focus();
  return { close: close };
}

var API = {
  API_VERSION: API_VERSION, T: T, CSS: CSS,
  mix: mix, contrast: contrast, ramp: ramp, teamVars: teamVars, theme: theme,
  crowd: crowd, wood: wood, brick: brick, room: room, icon: icon, img: img, iconHtml: iconHtml, badgeHtml: badgeHtml, ICONS_L: Object.keys(ICONS_L), ICONS: Object.keys(ICONS), ICON16: Object.keys(ICON16), icon16: icon16,
  pips: pips, bar: bar, tickerHtml: tickerHtml, wireTips: wireTips, countUp: countUp, toast: toast, wipe: wipe, dialog: dialog, reduced: reduced, inject: inject,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined'){ window.RTF_KIT = API; inject(); }
})();
