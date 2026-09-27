/*
 * FIELDCAST: the broadcast field every game in The Perfect Season and Perfect College Season
 * is played out on. The playoff broadcast, the bowl, the challenge bowl, the boss battle and
 * the Full Team live games all hand their drives here through the page's drawDriveChart,
 * which delegates to RTG_FIELD.paint and keeps its old body as the fallback for a blocked or
 * stale copy of this file.
 *
 * IT DECIDES NOTHING. Every drive it is handed was already decided by the page: the start,
 * the end, the result and the clock. What is drawn between those is decoration, and it is
 * all derived from the drive itself on a seed built from the drive, so a repaint of the same
 * moment is the same picture and the page's own random streams are never touched.
 *
 * WHAT IT DRAWS, far to near:
 *   a lit stadium, with a crowd that erupts on the side that scored
 *   an LED ribbon board along the front of the stands
 *   the field in perspective, a broadcast camera rather than a diagram
 *   every drive as a lane of turf, newest nearest the camera, older ones receding
 *   the drive in progress played out snap by snap: the ball, the two lines, the formation,
 *     and the down and distance over the ball
 *   the moment: TOUCHDOWN, FIELD GOAL, NO GOOD, INTERCEPTED, SAFETY, ON DOWNS
 *
 * THE MOMENTS FIRE THEMSELVES. A drive whose end the clock has just crossed is the event, so
 * no page has to call anything new, and a jump (Sim to the end, a reload, the final repaint)
 * crosses too much at once to be a moment and fires nothing.
 *
 * THE DOWNS ARE MADE UP, SO A PAGE WHOSE DOWNS ARE REAL TURNS THEM OFF. The playoff broadcast
 * builds its drives backwards from a score, so a down and distance invented from the drive is
 * as honest as the drive. The boss board plays forward down by down, so it passes `downs:false`
 * and the real situation on the live drive (`sit`), and nothing invented can disagree with the
 * fourth down card under it.
 */
(function(){
  'use strict';
  var API_VERSION = 1;

  var logo = new Image(); logo.src = '/football/field-r.png?v=1';
  var REDUCE = false;
  try { REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var now = function(){ return (window.performance || Date).now(); };

  /* ---------- small tools ---------- */
  function hash(s){
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngOf(seed){
    var a = seed >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(x, a, b){ return x < a ? a : x > b ? b : x; }
  function easeOut(t){ t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t){ t = clamp(t, 0, 1); return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
  function rgb(c){
    if (!c) return [138, 151, 168];
    if (c[0] === '#'){
      var s = c.slice(1);
      if (s.length === 3) s = s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
      var v = parseInt(s.slice(0, 6), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var m = c.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [138, 151, 168];
  }
  function rgba(c, a){ var p = rgb(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }
  function mix(c1, c2, t){
    var a = rgb(c1), b = rgb(c2);
    return 'rgb(' + Math.round(a[0]+(b[0]-a[0])*t) + ',' + Math.round(a[1]+(b[1]-a[1])*t) + ',' + Math.round(a[2]+(b[2]-a[2])*t) + ')';
  }
  function dist(a, b){ var p = rgb(a), q = rgb(b); return Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]); }
  function norm(r){ return r === 'td' ? 'touchdown' : r === 'fg' ? 'field goal' : r; }
  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    if (ctx.roundRect){ ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
  }
  var DISPLAY = "'Anton',Impact,'Arial Narrow',sans-serif";
  var NUMS = "'Big Shoulders Display','Oswald','Arial Narrow',sans-serif";
  var LED = "'Orbitron','Archivo',sans-serif";
  var BODY = "'Archivo','Inter',system-ui,sans-serif";

  /* ---------- the camera ----------
     A symmetric trapezoid with real perspective: screen y is linear in 1/depth, so the lanes
     bunch up toward the far sideline the way a field does from a press box. u runs goal line
     to goal line INCLUDING both end zones (0 to 1 over 120 yards), v runs far sideline (0) to
     near sideline (1). */
  function camera(w, h, dpr){
    var Sy = Math.round(h * 0.25), Ry = Sy + Math.round(h * 0.052), Ty = Ry + Math.round(h * 0.018);
    var By = h - Math.round(4 * dpr);
    var Wb = w * 0.93, Wt = w * 0.66, k = Wb / Wt;
    var hh = (By - Ty) / (1 - 1 / k), hor = By - hh, cx = w / 2;
    var z = function(v){ return k * (1 - v) + v; };
    return {
      w: w, h: h, dpr: dpr, Sy: Sy, Ry: Ry, Ty: Ty, By: By, Wb: Wb, k: k, cx: cx,
      s: Math.max(0.8, Math.min(1.6, w / dpr / 360)),
      z: z,
      P: function(u, v){ var zz = z(v); return [cx + (u - 0.5) * Wb / zz, hor + hh / zz]; },
      ppy: function(v){ return Wb / z(v) / 120; }
    };
  }
  var U = function(yard){ return (yard + 10) / 120; };

  function quad(ctx, C, u1, v1, u2, v2){
    var a = C.P(u1, v1), b = C.P(u2, v1), c = C.P(u2, v2), d = C.P(u1, v2);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]);
    ctx.lineTo(d[0], d[1]); ctx.closePath();
  }
  function line(ctx, C, u1, v1, u2, v2){
    var a = C.P(u1, v1), b = C.P(u2, v2);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }

  /* ---------- the stands ----------
     Drawn once per size and pair of colours into a canvas of their own, a little wider than
     the view so the camera can pan across them. The crowd is a dot matrix, as it is on the
     home page's cards, so the two read as one product. */
  function buildStands(st){
    var C = st.C, dpr = C.dpr, M = st.M, W = C.w + 2 * M;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = C.Ty + 2;
    var g = cv.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, C.Ry);
    sky.addColorStop(0, '#02040a'); sky.addColorStop(1, '#0b1322');
    g.fillStyle = sky; g.fillRect(0, 0, W, C.Ry);
    /* The light rigs, and the pools of light they throw on the upper deck. */
    [0.22, 0.78].forEach(function(fx){
      var x = M + C.w * fx, y = C.Sy * 0.08;
      var rg = g.createRadialGradient(x, y, 0, x, y, C.w * 0.42);
      rg.addColorStop(0, 'rgba(210,228,255,.32)'); rg.addColorStop(.35, 'rgba(160,190,255,.09)');
      rg.addColorStop(1, 'rgba(160,190,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, C.Ry);
      for (var r = 0; r < 2; r++) for (var c = -2; c <= 2; c++){
        g.fillStyle = 'rgba(255,255,255,' + (r ? .75 : .95) + ')';
        g.fillRect(x + c * 3.2 * dpr - dpr, y + r * 3 * dpr, 2.2 * dpr, 2 * dpr);
      }
    });
    /* Three tiers of crowd, each a band of dots over a facade, dots larger on the lower
       tiers because they are nearer. Seeded, so the same crowd is in the same seats on
       every repaint. */
    var rnd = rngOf(hash('crowd|' + st.you.color + '|' + st.them.color));
    var NEUT = ['#8f9bb3', '#5f6b86', '#c7cfdd', '#3e4760', '#d9c8ae', '#9c8ea8'];
    var dots = [];
    var tiers = [[0.22, 0.46, 1.25], [0.52, 0.74, 1.6], [0.78, 1.0, 2.0]];
    tiers.forEach(function(t, ti){
      var y0 = C.Sy * t[0], y1 = C.Sy * t[1];
      g.fillStyle = ti === 0 ? '#0a1020' : ti === 1 ? '#0c1426' : '#0e172b';
      g.fillRect(0, y0 - 1.5 * dpr, W, y1 - y0 + 3 * dpr);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, y1 + 1.5 * dpr, W, Math.max(1, dpr));
      var sz = t[2] * dpr * C.s, sp = sz * 1.95, rows = Math.max(2, Math.floor((y1 - y0) / sp));
      for (var r = 0; r < rows; r++){
        var y = y0 + r * sp + (r % 2 ? sp * 0.1 : 0);
        for (var x = (r % 2) * sp * 0.5; x < W; x += sp){
          var side = (x - M) / C.w;
          var tc = side < 0.46 ? st.you.color : side > 0.54 ? st.them.color : null;
          var fan = tc && rnd() < 0.42;
          var col = fan ? tc : NEUT[Math.floor(rnd() * NEUT.length)];
          var a = fan ? 0.5 + rnd() * 0.35 : 0.16 + rnd() * 0.3;
          g.fillStyle = rgba(col, a.toFixed(2));
          g.fillRect(x, y, sz, sz);
          if (rnd() < 0.07) dots.push({ x: x, y: y, s: sz, ph: rnd() * 6.28, sp: 0.6 + rnd() * 1.6, side: side });
        }
      }
    });
    /* The front wall under the ribbon board. */
    g.fillStyle = '#060a14'; g.fillRect(0, C.Ry, W, C.Ty - C.Ry + 2);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, C.Ry, W, Math.max(1, dpr));
    st.stands = cv; st.twinkle = dots;
  }

  /* ---------- the field ---------- */
  function buildField(st){
    var C = st.C, dpr = C.dpr, M = st.M, W = C.w + 2 * M;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = C.h;
    var g = cv.getContext('2d');
    g.translate(M, 0);
    var college = st.style === 'college';
    /* The apron and the track round it. */
    g.fillStyle = '#081109'; g.fillRect(-M, C.Ty, W, C.h - C.Ty);
    quad(g, C, -0.07, -0.05, 1.07, 1.08); g.fillStyle = college ? '#123a24' : '#163a17'; g.fill();
    /* The turf, darker toward the far side the way it is under lights. */
    var tg = g.createLinearGradient(0, C.Ty, 0, C.By);
    if (college){ tg.addColorStop(0, '#1b5a33'); tg.addColorStop(1, '#2a7a45'); }
    else { tg.addColorStop(0, '#1d4d1f'); tg.addColorStop(1, '#2f7331'); }
    quad(g, C, 0, 0, 1, 1); g.fillStyle = tg; g.fill();
    /* Mowing stripes every five yards. The college field wears them bolder, which is most
       of what tells the two sports apart at a glance. */
    for (var y = 0; y < 100; y += 5){
      if ((y / 5) % 2) continue;
      quad(g, C, U(y), 0, U(y + 5), 1);
      g.fillStyle = 'rgba(255,255,255,' + (college ? .07 : .045) + ')'; g.fill();
    }
    /* A grain of turf so the green is not flat. Seeded, so it never crawls. */
    var rnd = rngOf(hash('turf|' + C.w + 'x' + C.h));
    for (var i = 0; i < 900; i++){
      var p = C.P(rnd(), rnd());
      g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.035)';
      g.fillRect(p[0], p[1], dpr, dpr);
    }
    /* End zones, in each side's colour, with its name painted in them. */
    [[0, st.you], [1, st.them]].forEach(function(e){
      var u1 = e[0] ? 110 / 120 : 0, u2 = e[0] ? 1 : 10 / 120;
      quad(g, C, u1, 0, u2, 1);
      /* Opaque, mixed toward the turf rather than laid over it: a red at half alpha over
         green is brown, and nobody's end zone is brown on purpose. */
      g.fillStyle = mix(e[1].color, '#0c1d12', college ? 0.22 : 0.34); g.fill();
      g.save(); quad(g, C, u1, 0, u2, 1); g.clip();
      g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2 * dpr;
      for (var t = -1; t <= 1.2; t += 0.05) line(g, C, u1, t, u2, t + 0.12);
      g.restore();
      endName(g, C, (u1 + u2) / 2, e[1].name, e[0] ? 1 : -1);
    });
    /* Lines. */
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,.82)'; g.lineWidth = 1.8 * dpr;
    quad(g, C, 0, 0, 1, 1); g.stroke();
    for (y = 5; y <= 95; y += 5){
      var ten = y % 10 === 0;
      g.strokeStyle = 'rgba(255,255,255,' + (y === 50 ? .7 : ten ? .5 : .26) + ')';
      g.lineWidth = (y === 50 ? 1.6 : ten ? 1.2 : 0.8) * dpr;
      line(g, C, U(y), 0, U(y), 1);
    }
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2 * dpr;
    line(g, C, U(0), 0, U(0), 1); line(g, C, U(100), 0, U(100), 1);
    /* Hash marks and sideline ticks, one a yard. */
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.7 * dpr;
    for (y = 1; y < 100; y++){
      if (y % 5 === 0) continue;
      [0.40, 0.60].forEach(function(v){ line(g, C, U(y), v - 0.012, U(y), v + 0.012); });
      line(g, C, U(y), 0.004, U(y), 0.03); line(g, C, U(y), 0.97, U(y), 0.996);
    }
    /* The yard numbers, painted near and far, with the arrow toward the nearer goal. */
    [[0.86, 1], [0.15, 0.62]].forEach(function(row){
      for (var n = 10; n <= 90; n += 10){
        var lab = n <= 50 ? n : 100 - n, p = C.P(U(n), row[0]), sc = C.ppy(row[0]);
        var fs = Math.max(6 * dpr, sc * 5.2) * row[1];
        g.save(); g.translate(p[0], p[1]); g.scale(1, 0.72);
        g.font = '700 ' + fs.toFixed(1) + 'px ' + NUMS;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,255,255,' + (row[1] < 1 ? .38 : .6) + ')';
        g.fillText(String(lab), 0, 0);
        if (n !== 50){
          var dir = n < 50 ? -1 : 1, ax = dir * fs * 0.95;
          g.beginPath(); g.moveTo(ax + dir * fs * 0.22, 0); g.lineTo(ax, -fs * 0.16); g.lineTo(ax, fs * 0.16);
          g.closePath(); g.fill();
        }
        g.restore();
      }
    });
    /* The midfield logo, painted under the play. */
    if (logo.complete && logo.naturalWidth){
      var c = C.P(0.5, 0.5), lh = C.ppy(0.5) * 17, lw = lh * logo.naturalWidth / logo.naturalHeight;
      g.save(); g.globalAlpha = 0.16; g.translate(c[0], c[1]); g.scale(1, 0.62);
      g.drawImage(logo, -lw / 2, -lh / 2, lw, lh); g.restore();
      st.logoIn = true;
    }
    /* Pylons at every corner of both end zones. */
    g.fillStyle = '#ff7a1a';
    [0, 10, 110, 120].forEach(function(x){
      [0, 1].forEach(function(v){
        var p = C.P(x / 120, v), s = C.ppy(v);
        g.fillRect(p[0] - s * 0.35, p[1] - s * 1.1, s * 0.7, s * 1.1);
      });
    });
    /* The goalposts, standing up out of the field into the stands. */
    [-0.006, 1.006].forEach(function(u){ goalpost(g, C, u, 'rgba(255,214,10,.95)'); });
    st.field = cv;
  }
  function endName(g, C, u, txt, dir){
    if (!txt) return;
    var a = C.P(u, 0.12), b = C.P(u, 0.88), s = C.ppy(0.5);
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.save(); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    g.rotate(dir < 0 ? ang - Math.PI : ang);
    g.scale(1, 0.9);
    var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    var fs = s * 6.6;
    g.font = fs.toFixed(1) + 'px ' + DISPLAY;
    var tw = g.measureText(String(txt).toUpperCase()).width;
    if (tw > len * 0.92){ fs *= len * 0.92 / tw; g.font = fs.toFixed(1) + 'px ' + DISPLAY; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.78)';
    g.fillText(String(txt).toUpperCase().slice(0, 12), 0, 0);
    g.restore();
  }
  function goalpost(g, C, u, col){
    var dpr = C.dpr, base = C.P(u, 0.5), s = C.ppy(0.5);
    var cb = 3.4 * s, up = 11 * s, half = 3.1 / 53.3;
    var l = C.P(u, 0.5 - half), r = C.P(u, 0.5 + half);
    g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 1.6 * dpr;
    g.beginPath(); g.moveTo(base[0], base[1]); g.lineTo(base[0], base[1] - cb); g.stroke();
    g.beginPath(); g.moveTo(l[0], l[1] - cb); g.lineTo(r[0], r[1] - cb); g.stroke();
    g.lineWidth = 1.3 * dpr;
    g.beginPath(); g.moveTo(l[0], l[1] - cb); g.lineTo(l[0], l[1] - cb - up); g.stroke();
    g.beginPath(); g.moveTo(r[0], r[1] - cb); g.lineTo(r[0], r[1] - cb - up); g.stroke();
  }

  /* ---------- a drive, snap by snap ----------
     Built from the drive alone: where it started, where it ended, how it ended, and (on the
     boss board) how many plays it really took. Team relative, so advancing is always up. */
  function planDrive(d, from, opts){
    var dir = d.team === 'you' ? 1 : -1;
    var rel = function(ay){ return dir > 0 ? ay : 100 - ay; };
    var res = norm(d.result);
    var rs = rel(clamp(from, 0, 100)), re = rel(clamp(d.endYard, 0, 100));
    if (res === 'touchdown') re = 100;
    var G = re - rs;
    var rnd = rngOf(hash('plan|' + d.team + '|' + d.tStart + '|' + d.startYard + '|' + from));
    var plays = [];
    var pos = rs, down = 1, togo = Math.min(10, 100 - rs), lineTo = rs + togo;
    var target = d.plays > 0 ? d.plays : null;
    var scale = target ? clamp(G / target / 5.5, 0.4, 3) : 1;
    var push = function(g, pass){
      plays.push({ los: pos, gain: g, down: down, togo: Math.round(Math.max(1, lineTo - pos)),
        goal: lineTo >= 100, pass: pass });
      pos += g;
      if (pos >= lineTo){ down = 1; lineTo = Math.min(100, pos + 10); }
      else down++;
    };
    if (d.returnTd){
      plays.push({ los: rs, gain: G, down: 0, togo: 0, run: true, ret: true });
      return { dir: dir, rs: rs, re: re, plays: plays, res: res };
    }
    var guard = 0;
    while (pos < re && guard++ < 18){
      var rem = re - pos, need = lineTo - pos, g, pass = false;
      var roll = rnd();
      if (roll < 0.22){ g = 0; pass = true; }
      else if (roll < 0.62){ g = 1 + Math.floor(rnd() * 6); }
      else if (roll < 0.93){ g = 5 + Math.floor(rnd() * 12); pass = true; }
      else { g = 16 + Math.floor(rnd() * 22); pass = rnd() < 0.7; }
      g = Math.round(g * scale);
      if (down >= 3 && rem > need) g = Math.max(g, need + Math.floor(rnd() * 4));
      if (guard > 14) g = rem;
      g = Math.min(g, rem);
      push(g, pass && g === 0 ? true : pass);
    }
    if (G < 0){ push(G, false); }
    if (res === 'punt' || res === 'field goal' || res === 'miss' || res === 'downs'){
      var burn = 0;
      while (down < 4 && burn++ < 4) push(0, true);
      if (res === 'downs') push(0, true);
    }
    if (!plays.length) push(0, true);
    return { dir: dir, rs: rs, re: re, plays: plays, res: res, rel: rel };
  }

  /* Where everything is at one moment of a drive: the ball, the snap it belongs to, how far
     through it we are, and the formation around it. */
  function driveState(st, d, idx, list, upTo, anchor){
    var t0 = anchor ? anchor.t : d.tStart, y0 = anchor ? anchor.y : d.startYard;
    var p = clamp((upTo - t0) / Math.max(1, d.tEnd - t0), 0, 1);
    var key = d.team + '|' + d.tStart + '|' + d.startYard + '|' + d.endYard + '|' + y0 + '|' + (d.plays || '');
    var plan = st.plans[key];
    if (!plan){ plan = st.plans[key] = planDrive(d, y0, st.opts); }
    var dir = plan.dir, abs = function(r){ return dir > 0 ? r : 100 - r; };
    /* The kick that starts it, from wherever the ball was last, unless this drive picks up
       where one stopped (an anchor) or the ball simply changed hands where it lay. */
    var kickFrom = null;
    if (!anchor){
      var prev = idx > 0 ? list[idx - 1] : null, pr = prev ? norm(prev.result) : null;
      if (!prev) kickFrom = d.team === 'you' ? 65 : 35;
      else if (pr === 'touchdown' || pr === 'field goal') kickFrom = prev.team === 'you' ? 35 : 65;
      else if (pr === 'punt') kickFrom = prev.endYard;
      if (kickFrom != null && Math.abs(kickFrom - d.startYard) < 6) kickFrom = null;
    }
    var segs = [];
    if (kickFrom != null) segs.push({ kind: 'kick', w: 0.9 });
    plan.plays.forEach(function(pl, i){ segs.push({ kind: 'play', pl: pl, w: 1 + (i === plan.plays.length - 1 ? 0.25 : 0) }); });
    var W = 0; segs.forEach(function(s){ W += s.w; });
    var at = p * W, seg = segs[segs.length - 1], f = 1, acc = 0;
    for (var i = 0; i < segs.length; i++){
      if (at <= acc + segs[i].w){ seg = segs[i]; f = (at - acc) / segs[i].w; break; }
      acc += segs[i].w;
    }
    var out = { plan: plan, dir: dir, p: p, abs: abs };
    if (seg.kind === 'kick'){
      var m = easeInOut(f);
      out.kick = true;
      out.ball = kickFrom + (d.startYard - kickFrom) * m;
      out.height = Math.abs(d.startYard - kickFrom) * 0.42 * Math.sin(Math.PI * m);
      out.spin = f * 9;
      out.trail = null;
      return out;
    }
    var pl = seg.pl, SN = 0.36;
    var mv = f < SN ? 0 : easeOut((f - SN) / (1 - SN));
    var rpos;
    if (pl.gain === 0 && pl.pass){
      /* An incompletion: the ball goes downfield and the spot does not move. */
      rpos = pl.los; out.height = mv > 0 && mv < 1 ? 5 * Math.sin(Math.PI * mv) : 0;
      out.ghost = mv > 0 && mv < 1 ? pl.los + 9 * Math.sin(Math.PI * Math.min(1, mv * 1.1)) : null;
    } else {
      rpos = pl.los + pl.gain * mv;
      out.height = pl.pass ? Math.min(9, Math.abs(pl.gain) * 0.4) * Math.sin(Math.PI * Math.min(1, mv / 0.8)) * (mv < 0.8 ? 1 : 0)
                           : (mv > 0 && mv < 1 ? 0.35 * Math.abs(Math.sin(mv * 18)) : 0);
    }
    out.ball = abs(clamp(rpos, -8, 108));
    out.spin = pl.pass ? mv * 6 : 0;
    out.snap = f < SN ? f / SN : null;
    out.mv = mv; out.pl = pl;
    out.trail = abs(clamp(plan.rs, 0, 100));
    out.showDowns = f < SN + 0.05 && pl.down > 0;
    return out;
  }

  /* ---------- the moments ---------- */
  var MOMENT = {
    touchdown: { label: 'TOUCHDOWN', dur: 1500, big: true },
    'field goal': { label: 'FIELD GOAL', dur: 1250, kick: true, delay: 560 },
    miss: { label: 'NO GOOD', dur: 1250, kick: true, delay: 560, gray: true },
    turnover: { label: 'TURNOVER', dur: 1250, red: true },
    downs: { label: 'TURNOVER ON DOWNS', dur: 1250, red: true },
    safety: { label: 'SAFETY', dur: 1300, amber: true }
  };
  function fire(st, d, list, i){
    var res = norm(d.result), def = MOMENT[res];
    if (!def) return;
    var you = st.you, them = st.them, team = d.team === 'you' ? you : them, other = d.team === 'you' ? them : you;
    var label = def.label, sub = team.name, col = team.color;
    if (res === 'turnover'){
      label = d.takeaway === 'INTERCEPTION' ? 'INTERCEPTED' : d.takeaway === 'FUMBLE' ? 'FUMBLE' : 'TURNOVER';
      sub = other.name + ' ball'; col = other.color;
    } else if (res === 'downs'){ sub = other.name + ' ball'; col = other.color; }
    else if (res === 'safety'){ col = other.color; sub = other.name; }
    else if (res === 'touchdown' && d.returnTd){
      var prev = list[i - 1];
      label = prev && prev.takeaway === 'INTERCEPTION' ? 'PICK SIX' : prev && prev.takeaway === 'FUMBLE' ? 'SCOOP AND SCORE' : 'TOUCHDOWN';
    }
    var fx = { res: res, def: def, label: label, sub: sub, col: col, team: d.team, t0: now(),
      yard: clamp(norm(d.result) === 'touchdown' ? (d.team === 'you' ? 104 : -4) : d.endYard, -6, 106),
      v: st.laneV != null ? st.laneV : 0.78 };
    /* ONE CALL AT A TIME. A second moment inside the first one's banner sends the first off
       the screen now, or the two words sit on top of each other and neither can be read. */
    fx.endAt = fx.t0 + (def.delay || 0) + def.dur;
    st.fx.forEach(function(o){ o.endAt = Math.min(o.endAt, fx.t0 + 260); });
    st.fx.push(fx);
    if (st.fx.length > 3) st.fx.shift();
    if (def.big && !REDUCE){
      st.shake = { t0: now(), amp: 3.2 * st.C.dpr };
      st.erupt = { t0: now(), side: d.team, dur: 2600 };
      spawnConfetti(st, fx);
    }
    if (res === 'field goal' && !REDUCE) st.erupt = { t0: now() + def.delay, side: d.team, dur: 1800 };
  }
  function spawnConfetti(st, fx){
    var C = st.C, p = C.P(U(fx.yard), fx.v), dpr = C.dpr;
    var r = rngOf(hash('confetti|' + fx.t0));
    var cols = [fx.col, '#ffd23f', '#ffffff', mix(fx.col, '#ffffff', 0.4)];
    for (var i = 0; i < 70; i++){
      var a = -Math.PI / 2 + (r() - 0.5) * 2.2, sp = (2.2 + r() * 4.2) * dpr;
      st.parts.push({ x: p[0] + (r() - 0.5) * 20 * dpr, y: p[1], vx: Math.cos(a) * sp + (fx.team === 'you' ? -1 : 1) * r() * 1.5 * dpr,
        vy: Math.sin(a) * sp, rot: r() * 6, vr: (r() - 0.5) * 0.4, w: (2 + r() * 2.5) * dpr, h: (3.5 + r() * 3) * dpr,
        c: cols[Math.floor(r() * cols.length)], t0: fx.t0, life: 1400 + r() * 900 });
    }
  }

  /* ---------- painting one frame ---------- */
  function render(st){
    var F = st.frame; if (!F) return;
    var ctx = st.ctx, C = st.C, dpr = C.dpr, t = now();
    st.lastRender = t;
    if (!st.stands) buildStands(st);
    if (!st.field || (!st.logoIn && logo.complete && logo.naturalWidth)) buildField(st);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, C.w, C.h);
    ctx.fillStyle = '#03060c'; ctx.fillRect(0, 0, C.w, C.h);

    /* The camera follows the ball, gently, the way a broadcast pans. */
    var sx = 0, sy = 0;
    if (st.shake){
      var k = (t - st.shake.t0) / 520;
      if (k >= 1) st.shake = null;
      else { var a = st.shake.amp * (1 - k); sx = Math.sin(t * 0.09) * a; sy = Math.cos(t * 0.11) * a * 0.6; }
    }
    var dt = st.lastT ? Math.min(64, t - st.lastT) : 16; st.lastT = t;
    st.pan += (st.panTo - st.pan) * (REDUCE ? 1 : 1 - Math.pow(0.9, dt / 16));
    ctx.translate(sx, sy);

    ctx.drawImage(st.stands, -st.M - st.pan * 0.35, 0);
    drawCrowdLife(st, ctx, t);
    drawRibbon(st, ctx, t);
    ctx.drawImage(st.field, -st.M - st.pan, 0);

    ctx.save();
    ctx.translate(-st.pan, 0);
    drawDrives(st, ctx, F, t);
    ctx.restore();

    drawFx(st, ctx, t);
    drawLiveTag(st, ctx, t, F.upTo >= 3600 && !(F.drives || []).some(function(d){ return d.tEnd > F.upTo || d.result === 'live'; }));
    /* Vignette, to sit the picture inside the broadcast frame. */
    var vg = ctx.createRadialGradient(C.w / 2, C.h * 0.62, C.h * 0.35, C.w / 2, C.h * 0.62, C.w * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = vg; ctx.fillRect(-10, -10, C.w + 20, C.h + 20);
    ctx.restore();
  }

  function drawCrowdLife(st, ctx, t){
    var C = st.C, off = -st.M - st.pan * 0.35, dots = st.twinkle;
    if (!REDUCE){
      for (var i = 0; i < dots.length; i++){
        var d = dots[i], a = 0.5 + 0.5 * Math.sin(t * 0.0021 * d.sp + d.ph);
        if (a < 0.72) continue;
        ctx.fillStyle = 'rgba(255,255,255,' + ((a - 0.72) * 1.4).toFixed(3) + ')';
        ctx.fillRect(d.x + off, d.y, d.s, d.s);
      }
    }
    var er = st.erupt;
    if (er){
      var k = (t - er.t0) / er.dur;
      if (k >= 1) st.erupt = null;
      else if (k > 0){
        var col = er.side === 'you' ? st.you.color : st.them.color;
        var fade = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
        var x0 = er.side === 'you' ? 0 : C.w * 0.45, x1 = er.side === 'you' ? C.w * 0.55 : C.w;
        var gr = ctx.createLinearGradient(x0, 0, x1, 0);
        gr.addColorStop(er.side === 'you' ? 0 : 1, rgba(col, (0.4 * fade).toFixed(3)));
        gr.addColorStop(er.side === 'you' ? 1 : 0, rgba(col, 0));
        ctx.fillStyle = gr; ctx.fillRect(0, 0, C.w, C.Sy);
        /* Flashbulbs. */
        var r = rngOf(hash('bulbs|' + Math.floor(t / 70)));
        for (var j = 0; j < 26 * fade; j++){
          var bx = x0 + r() * (x1 - x0), by = C.Sy * (0.2 + r() * 0.78), s = (1 + r() * 1.8) * C.dpr;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + r() * 0.5).toFixed(2) + ')';
          ctx.fillRect(bx, by, s, s);
        }
      }
    }
  }

  /* The ribbon board: a ticker that becomes the call when something happens. */
  function drawRibbon(st, ctx, t){
    var C = st.C, dpr = C.dpr, y = C.Sy + 1, h = C.Ry - C.Sy - 2;
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, y, C.w, h);
    var fx = st.fx.length ? st.fx[st.fx.length - 1] : null, live = fx && t < fx.endAt;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y, C.w, h); ctx.clip();
    ctx.textBaseline = 'middle';
    var fs = h * 0.66;
    ctx.font = '900 ' + fs.toFixed(1) + 'px ' + LED;
    if (live && (t - fx.t0) > (fx.def.delay || 0)){
      var on = REDUCE || Math.floor((t - fx.t0) / 160) % 2 === 0;
      ctx.fillStyle = rgba(fx.col, 0.28); ctx.fillRect(0, y, C.w, h);
      ctx.fillStyle = on ? '#ffffff' : mix(fx.col, '#ffffff', 0.5);
      var msg = fx.label + '   ' + fx.label + '   ' + fx.label + '   ';
      var w1 = ctx.measureText(msg).width;
      var off = REDUCE ? 0 : -((t - fx.t0) * 0.09 * dpr) % (w1 / 3);
      ctx.fillText(msg + msg, off, y + h / 2);
    } else {
      var txt = st.ticker;
      var tw = ctx.measureText(txt).width + 40 * dpr;
      var o = REDUCE ? 0 : -((t * 0.035 * dpr) % tw);
      ctx.fillStyle = '#ffb547';
      for (var x = o; x < C.w; x += tw) ctx.fillText(txt, x, y + h / 2);
    }
    /* The LED grid over it. */
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    var step = Math.max(2, Math.round(2 * dpr));
    for (var gx = 0; gx < C.w; gx += step) ctx.fillRect(gx, y, Math.max(1, dpr * 0.6), h);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, y - 1, C.w, Math.max(1, dpr * 0.6));
  }

  /* LIVE while the game is being played, FINAL once the clock has run out, in the corner of
     the stands where a broadcast keeps its bug. */
  function drawLiveTag(st, ctx, t, final){
    var C = st.C, dpr = C.dpr, fs = 8 * dpr * Math.min(1.3, C.s), txt = final ? 'FINAL' : 'LIVE';
    ctx.save();
    ctx.font = '800 ' + fs.toFixed(1) + 'px ' + BODY;
    var dot = final ? 0 : fs * 0.7, w = ctx.measureText(txt).width + fs * 1.1 + (dot ? dot + fs * 0.45 : 0), h = fs * 1.75;
    var x = 7 * dpr, y = 6 * dpr;
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(4,7,14,.78)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = Math.max(1, 0.6 * dpr); ctx.stroke();
    var tx = x + fs * 0.55;
    if (dot){
      var a = REDUCE ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(t * 0.004));
      ctx.fillStyle = 'rgba(255,59,72,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(tx + dot / 2, y + h / 2, dot / 2, 0, Math.PI * 2); ctx.fill();
      tx += dot + fs * 0.45;
    }
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(txt, tx, y + h / 2 + 0.5 * dpr);
    ctx.restore();
  }

  function laneV(age){ return 0.8 - age * 0.132; }

  function drawDrives(st, ctx, F, t){
    var C = st.C, dpr = C.dpr, drives = F.drives || [], upTo = F.upTo;
    var visible = [], active = null, ai = -1;
    for (var i = 0; i < drives.length; i++){
      var d = drives[i];
      if (d.tStart > upTo) break;
      visible.push(d);
      if (d.tEnd > upTo || d.result === 'live'){ active = d; ai = visible.length - 1; }
    }
    if (!visible.length){
      /* Before the kickoff: the ball on the tee. */
      drawBall(st, ctx, 35, 0.5, 0, 0, false);
      st.panTo = 0;
      return;
    }
    var MAX = 6, start = Math.max(0, visible.length - MAX), shown = visible.slice(start);
    /* The lanes slide back when a new drive begins, rather than jumping. */
    var newest = shown[shown.length - 1], nk = newest.team + '|' + newest.tStart;
    if (st.newestKey !== nk){ st.newestKey = nk; st.newestAt = t; }
    var slide = REDUCE ? 1 : easeOut((t - st.newestAt) / 480);
    var off = 1 - slide;

    var ds = null;
    if (active){
      ds = driveState(st, active, ai, visible, upTo, active === drives[drives.length - 1] ? F.anchor : null);
    }

    /* The completed drives, oldest and faintest first. */
    for (var j = 0; j < shown.length; j++){
      var dv = shown[j], age = shown.length - 1 - j - off;
      if (dv === active) continue;
      var v = laneV(age), a = clamp(1 - age / (MAX - 0.4), 0.1, 1) * (age < 0 ? 1 + age : 1);
      if (v > 0.97) continue;
      drawRibbon1(st, ctx, dv, dv.startYard, clamp(norm(dv.result) === 'touchdown' ? (dv.team === 'you' ? 100 : 0) : dv.endYard, 0, 100), v, a * 0.85, false);
      drawMark(st, ctx, dv, v, a);
    }
    st.laneV = laneV(-off);

    if (!active){ st.panTo = 0; return; }
    var v0 = laneV(-off);
    var col = active.team === 'you' ? st.you.color : st.them.color;
    var dcol = active.team === 'you' ? st.them.color : st.you.color;
    var sit = active.sit && ds.p >= 0.999 ? active.sit : null;
    var showDowns = st.opts.downs !== false || sit;

    /* The camera leads the ball. */
    var bu = U(clamp(ds.ball, -5, 105));
    st.panTo = clamp((bu - 0.5) * C.w * 0.12, -st.M * 0.85, st.M * 0.85);

    /* The two lines, for a snap that has not happened yet. */
    if (!ds.kick && ds.pl && (ds.snap != null || sit)){
      var losA = sit ? active.endYard : ds.abs(ds.pl.los);
      ctx.lineWidth = 2.2 * dpr;
      ctx.strokeStyle = 'rgba(62,140,255,.95)';
      line(ctx, C, U(losA), 0, U(losA), 1);
      var togo = sit ? sit.toGo : ds.pl.togo, fdR = (sit ? (ds.dir > 0 ? losA : 100 - losA) : ds.pl.los) + togo;
      if (showDowns && fdR < 100){
        var fdA = ds.abs(fdR);
        ctx.strokeStyle = 'rgba(255,214,10,.95)'; ctx.lineWidth = 2.4 * dpr;
        line(ctx, C, U(fdA), 0, U(fdA), 1);
      }
    }
    if (ds.trail != null){
      var lead = ds.pl && ds.pl.gain === 0 && ds.pl.pass ? ds.abs(ds.pl.los) : ds.ball;
      drawRibbon1(st, ctx, active, ds.trail, clamp(lead, 0, 100), v0, 1, true);
    }
    /* At a real fourth down the two sides are set at the line for the snap the card is asking
       about, not still in a heap from the play before it. */
    if (sit && !ds.kick){
      var relL = ds.dir > 0 ? active.endYard : 100 - active.endYard;
      ds = { dir: ds.dir, abs: ds.abs, ball: active.endYard, height: 0, spin: 0, snap: 1, mv: 0,
        pl: { los: relL, gain: 0, pass: false, down: sit.down, togo: sit.toGo } };
    }
    if (!ds.kick && ds.pl && !ds.pl.ret && C.w / dpr >= 260) drawFormation(st, ctx, ds, v0, col, dcol);
    if (ds.ghost != null){
      /* The throw that fell incomplete: the ball in the air, the spot unchanged. */
      drawBall(st, ctx, ds.abs(ds.ghost), v0, ds.height, t * 0.02, true);
    } else {
      drawBall(st, ctx, ds.ball, v0, ds.height || 0, ds.spin || 0, false);
    }
    if (showDowns && !ds.kick && ds.pl && ds.pl.down > 0 && (ds.showDowns || sit)){
      drawDownTag(st, ctx, sit ? sit.down : ds.pl.down, sit ? sit.toGo : ds.pl.togo,
        sit ? (ds.dir > 0 ? active.endYard : 100 - active.endYard) + sit.toGo >= 100 : ds.pl.goal,
        sit ? active.endYard : ds.abs(ds.pl.los), v0, col);
    }
  }

  function drawRibbon1(st, ctx, d, y1, y2, v, alpha, live){
    var C = st.C, dpr = C.dpr, col = d.team === 'you' ? st.you.color : st.them.color;
    var half = live ? 0.034 : 0.026;
    var u1 = U(y1), u2 = U(y2);
    if (Math.abs(u2 - u1) < 0.002) u2 = u1 + (d.team === 'you' ? 0.004 : -0.004);
    var a = C.P(u1, v), b = C.P(u2, v);
    var gr = ctx.createLinearGradient(a[0], 0, b[0], 0);
    gr.addColorStop(0, rgba(col, 0));
    gr.addColorStop(0.35, rgba(col, (alpha * 0.55).toFixed(3)));
    gr.addColorStop(1, rgba(col, (alpha * 0.95).toFixed(3)));
    ctx.save();
    if (live && !REDUCE){ ctx.shadowColor = rgba(col, 0.8); ctx.shadowBlur = 10 * dpr; }
    quad(ctx, C, u1, v - half, u2, v + half);
    ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    /* The leading edge, a chevron pointing the way the drive went. */
    var dir = d.team === 'you' ? 1 : -1, tip = C.P(u2, v), s = C.ppy(v) * 1.8;
    ctx.fillStyle = rgba(col, Math.min(1, alpha + 0.05).toFixed(3));
    ctx.beginPath(); ctx.moveTo(tip[0] + dir * s * 1.2, tip[1]);
    ctx.lineTo(tip[0], tip[1] - s * 0.9); ctx.lineTo(tip[0], tip[1] + s * 0.9); ctx.closePath(); ctx.fill();
    if (d.returnTd){
      ctx.save(); quad(ctx, C, u1, v - half, u2, v + half); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.5).toFixed(3) + ')'; ctx.lineWidth = dpr;
      for (var x = Math.min(a[0], b[0]) - 20 * dpr; x < Math.max(a[0], b[0]) + 20 * dpr; x += 5 * dpr){
        ctx.beginPath(); ctx.moveTo(x, a[1] + 10 * dpr); ctx.lineTo(x + 10 * dpr, a[1] - 10 * dpr); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* How a finished drive ended, where it ended. */
  function drawMark(st, ctx, d, v, alpha){
    var C = st.C, dpr = C.dpr, res = norm(d.result), y;
    if (res === 'touchdown') y = d.team === 'you' ? 104 : -4;
    else y = clamp(d.endYard, 0, 100) + (d.team === 'you' ? 2.2 : -2.2);
    var p = C.P(U(y), v), s = Math.max(5.5 * dpr, C.ppy(v) * 3);
    var txt = res === 'touchdown' ? 'TD' : res === 'field goal' ? 'FG' : res === 'miss' ? 'NG'
      : res === 'turnover' ? (d.takeaway === 'INTERCEPTION' ? 'INT' : d.takeaway === 'FUMBLE' ? 'FUM' : 'TO')
      : res === 'safety' ? 'SAF' : res === 'downs' ? 'DWN' : null;
    if (!txt) return;
    var bg = res === 'touchdown' ? '#ffcc33' : res === 'field goal' ? '#5ee4ff' : res === 'miss' ? '#9aa4b2'
      : res === 'safety' ? '#ffa94d' : d.takeaway ? (d.team === 'you' ? st.them.color : st.you.color) : '#ff4d5e';
    ctx.save(); ctx.globalAlpha = clamp(alpha + 0.15, 0, 1);
    ctx.font = '800 ' + (s * 0.95).toFixed(1) + 'px ' + BODY;
    var tw = ctx.measureText(txt).width + s * 0.9, th = s * 1.35;
    roundRect(ctx, p[0] - tw / 2, p[1] - th / 2, tw, th, th / 2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = res === 'turnover' || res === 'downs' ? '#fff' : '#0a0f18';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, p[0], p[1] + s * 0.04);
    ctx.restore();
  }

  function drawBall(st, ctx, yard, v, height, spin, ghost){
    var C = st.C, dpr = C.dpr, g = C.P(U(clamp(yard, -9, 109)), clamp(v, 0.02, 0.98));
    var s = Math.max(2.4 * dpr, C.ppy(v) * 1.35), lift = height * C.ppy(v);
    /* Its shadow on the turf, which is what says how high it is. */
    ctx.fillStyle = 'rgba(0,0,0,' + (0.42 - Math.min(0.28, height * 0.02)).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(g[0], g[1] + s * 0.25, s * 1.25, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    var x = g[0], y = g[1] - lift - s * 0.55;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35 + Math.sin(spin) * 0.4);
    if (ghost) ctx.globalAlpha = 0.9;
    var bg = ctx.createRadialGradient(-s * 0.4, -s * 0.35, s * 0.1, 0, 0, s * 1.6);
    bg.addColorStop(0, '#b0663a'); bg.addColorStop(1, '#5a2c14');
    ctx.fillStyle = bg; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = Math.max(1, 0.6 * dpr);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 1.5, s * 0.92, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (st.style === 'college'){
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(-s * 1.05, -s * 0.66, s * 0.22, s * 1.32); ctx.fillRect(s * 0.83, -s * 0.66, s * 0.22, s * 1.32);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(0.8, 0.45 * dpr);
    ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.12); ctx.lineTo(s * 0.5, -s * 0.12); ctx.stroke();
    for (var i = -2; i <= 2; i++){ ctx.beginPath(); ctx.moveTo(i * s * 0.2, -s * 0.28); ctx.lineTo(i * s * 0.2, s * 0.04); ctx.stroke(); }
    ctx.restore();
  }

  /* Eleven a side would be noise at this size, so it is the parts a viewer reads: the line,
     the backfield, the front seven and the safeties. They set at the line before the snap and
     chase the ball after it. */
  var OFF = [[-1.2, -0.09], [-1.2, -0.045], [-1.2, 0], [-1.2, 0.045], [-1.2, 0.09], [-4.5, 0], [-7, 0.035]];
  var DEF = [[1.4, -0.07], [1.4, -0.024], [1.4, 0.024], [1.4, 0.07], [5, -0.06], [5, 0.06], [11, -0.14], [11, 0.14]];
  function drawFormation(st, ctx, ds, v0, col, dcol){
    var C = st.C, dpr = C.dpr, pl = ds.pl, mv = ds.mv || 0;
    var fade = ds.snap != null && ds.snap < 0.2 ? ds.snap / 0.2 : 1;
    var ballR = pl.los + (pl.gain === 0 && pl.pass ? 0 : pl.gain) * mv;
    var ppl = [];
    OFF.forEach(function(o, i){
      var y = pl.los + o[0] + (i < 5 ? 2 * mv : (ballR - pl.los - o[0]) * mv * (i === 6 ? 1 : 0.55));
      var v = v0 + o[1] * (1 + mv * (i < 5 ? 0.4 : 0));
      ppl.push([y, v, col]);
    });
    DEF.forEach(function(o){
      var y0 = pl.los + o[0], y = y0 + (ballR - y0) * mv * 0.78;
      var v = v0 + o[1] + (0 - o[1]) * mv * 0.7;
      ppl.push([y, v, dcol]);
    });
    ppl.sort(function(a, b){ return a[1] - b[1]; });
    ctx.save(); ctx.globalAlpha = fade;
    ppl.forEach(function(p){
      var yard = ds.abs(p[0]), v = clamp(p[1], 0.02, 0.98), g = C.P(U(clamp(yard, -8, 108)), v);
      var r = Math.max(1.6 * dpr, C.ppy(v) * 0.95);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(g[0], g[1] + r * 0.2, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p[2]; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = Math.max(0.8, 0.5 * dpr);
      ctx.beginPath(); ctx.arc(g[0], g[1] - r * 0.9, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(g[0] - r * 0.3, g[1] - r * 1.25, r * 0.35, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  var ORD = ['', '1ST', '2ND', '3RD', '4TH'];
  function drawDownTag(st, ctx, down, togo, goal, losA, v0, col){
    var C = st.C, dpr = C.dpr, g = C.P(U(losA), v0);
    var main = ORD[Math.min(4, down)] + ' & ' + (goal ? 'GOAL' : Math.max(1, Math.round(togo)));
    var spot = losA === 50 ? '50' : (losA < 50 ? st.you.name : st.them.name) + ' ' + Math.round(losA < 50 ? losA : 100 - losA);
    var fs = 9.5 * dpr * Math.min(1.25, C.s), fs2 = fs * 0.78;
    ctx.save();
    ctx.font = '800 ' + fs.toFixed(1) + 'px ' + BODY;
    var w1 = ctx.measureText(main).width;
    ctx.font = '700 ' + fs2.toFixed(1) + 'px ' + BODY;
    var w2 = ctx.measureText(spot).width;
    var pad = 5 * dpr, w = w1 + w2 + pad * 3 + 3 * dpr, h = fs * 1.7;
    var x = clamp(g[0] - w / 2, 4 * dpr, C.w - w - 4 * dpr), y = clamp(g[1] - h - 22 * dpr * Math.min(1.2, C.s), C.Ty + 3 * dpr, C.h - h);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6 * dpr;
    roundRect(ctx, x, y, w, h, 4 * dpr); ctx.fillStyle = 'rgba(8,12,22,.9)'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col; ctx.fillRect(x, y, 3 * dpr, h);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd60a'; ctx.font = '800 ' + fs.toFixed(1) + 'px ' + BODY;
    ctx.fillText(main, x + 3 * dpr + pad, y + h / 2 + 0.5 * dpr);
    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '700 ' + fs2.toFixed(1) + 'px ' + BODY;
    ctx.fillText(spot, x + 3 * dpr + pad * 2 + w1, y + h / 2 + 0.5 * dpr);
    ctx.restore();
  }

  function drawFx(st, ctx, t){
    var C = st.C, dpr = C.dpr;
    /* Confetti. */
    if (st.parts.length){
      var keep = [];
      for (var i = 0; i < st.parts.length; i++){
        var p = st.parts[i], age = t - p.t0;
        if (age > p.life) continue;
        var f = age / 16.7;
        var x = p.x + p.vx * f, y = p.y + p.vy * f + 0.07 * dpr * f * f;
        ctx.save(); ctx.globalAlpha = age > p.life - 300 ? (p.life - age) / 300 : 1;
        ctx.translate(x, y); ctx.rotate(p.rot + p.vr * f);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(f * 0.2 + p.rot)) + dpr * 0.5);
        ctx.restore(); keep.push(p);
      }
      st.parts = keep;
    }
    var live = [];
    st.fx.forEach(function(fx){
      var age = t - fx.t0, def = fx.def;
      if (t > fx.endAt) return;
      live.push(fx);
      if (def.kick) drawKick(st, ctx, fx, age);
      var ba = age - (def.delay || 0);
      if (ba >= 0) drawBanner(st, ctx, fx, ba, fx.endAt - fx.t0 - (def.delay || 0));
      if (def.big && age < 280 && !REDUCE){
        ctx.fillStyle = 'rgba(255,255,255,' + (0.3 * (1 - age / 280)).toFixed(3) + ')';
        ctx.fillRect(0, 0, C.w, C.h);
      }
    });
    st.fx = live;
  }

  /* The kick, from the spot to the posts, and through them or wide. */
  function drawKick(st, ctx, fx, age){
    var C = st.C, k = clamp(age / 700, 0, 1), m = easeInOut(k);
    var goalU = fx.team === 'you' ? 1.006 : -0.006;
    var fromU = U(fx.yard), u = fromU + (goalU - fromU) * m;
    var vEnd = fx.res === 'miss' ? 0.5 + 0.14 : 0.5, v = fx.v + (vEnd - fx.v) * m;
    var hY = 16 * Math.sin(Math.PI * Math.min(1, m * 0.62)) + m * 6;
    ctx.save(); ctx.translate(-st.pan, 0);
    if (k < 1){
      var g = C.P(u, v), s = Math.max(2.4 * C.dpr, C.ppy(v) * 1.35 * (1 - m * 0.25));
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(g[0], g[1], s, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(g[0], g[1] - hY * C.ppy(v)); ctx.rotate(age * 0.03);
      ctx.fillStyle = '#8a4a26'; ctx.beginPath(); ctx.ellipse(0, 0, s * 1.4, s * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    } else if (fx.res === 'field goal' && age < 1500){
      goalpost(ctx, C, goalU, 'rgba(255,255,255,' + (0.9 * (1 - (age - 700) / 800)).toFixed(3) + ')');
    }
    ctx.restore();
  }

  function drawBanner(st, ctx, fx, age, dur){
    var C = st.C, dpr = C.dpr;
    var IN = 220, OUT = 260;
    var kin = REDUCE ? 1 : easeOut(age / IN), kout = REDUCE ? 0 : clamp((age - (dur - OUT)) / OUT, 0, 1);
    /* Over the FAR half of the field, because the near lanes are where the ball is. */
    var cy = C.Ty + (C.By - C.Ty) * 0.3, bh = Math.min(C.h * 0.17, 48 * dpr * C.s);
    var bw = C.w * 0.84, skew = bh * 0.32;
    var x = C.w / 2 + (1 - kin) * -C.w * 1.1 + kout * C.w * 1.1;
    var col = fx.def.red ? '#e11d2e' : fx.def.amber ? '#f59e0b' : fx.def.gray ? '#5b6474' : fx.col;
    ctx.save(); ctx.globalAlpha = 1 - kout * 0.6;
    ctx.translate(x, cy);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 14 * dpr;
    ctx.beginPath(); ctx.moveTo(-bw / 2 + skew, -bh / 2); ctx.lineTo(bw / 2 + skew, -bh / 2);
    ctx.lineTo(bw / 2 - skew, bh / 2); ctx.lineTo(-bw / 2 - skew, bh / 2); ctx.closePath();
    var gr = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    gr.addColorStop(0, mix(col, '#ffffff', 0.18)); gr.addColorStop(0.55, col); gr.addColorStop(1, mix(col, '#000000', 0.35));
    ctx.fillStyle = gr; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save(); ctx.clip();
    /* The shine, one sweep across. */
    if (!REDUCE){
      var sx = -bw / 2 + ((age - 120) / 700) * bw * 1.4;
      var sg = ctx.createLinearGradient(sx - bh, 0, sx + bh, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.35)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-bw, bh / 2 - bh * 0.09, bw * 2, bh * 0.09);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2 * dpr; ctx.stroke();
    /* The word, fitted to the slab. */
    var fs = bh * 0.78;
    ctx.font = fs.toFixed(1) + 'px ' + DISPLAY;
    var tw = ctx.measureText(fx.label).width, room = bw * 0.84;
    if (tw > room){ fs *= room / tw; ctx.font = fs.toFixed(1) + 'px ' + DISPLAY; }
    var pop = REDUCE ? 1 : 1 + 0.18 * (1 - easeOut(age / 320));
    ctx.save(); ctx.scale(pop, pop); ctx.transform(1, 0, -0.14, 1, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineJoin = 'round';
    ctx.strokeText(fx.label, 0, fs * 0.04);
    ctx.fillStyle = '#ffffff'; ctx.fillText(fx.label, 0, fs * 0.04);
    ctx.restore();
    if (fx.sub){
      var ss = Math.max(8 * dpr, bh * 0.26);
      ctx.font = '800 ' + ss.toFixed(1) + 'px ' + BODY;
      var sw = ctx.measureText(fx.sub.toUpperCase()).width + ss * 1.4, sh = ss * 1.55;
      ctx.fillStyle = '#0a0f1a'; roundRect(ctx, -sw / 2, bh / 2 - sh * 0.2, sw, sh, sh / 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fx.sub.toUpperCase(), 0, bh / 2 - sh * 0.2 + sh / 2 + ss * 0.04);
    }
    ctx.restore();
  }

  /* ---------- the loop ----------
     A page paints whenever its clock moves, which is the frame. Between those (a score
     holding the clock, a call waiting on the player) this keeps the crowd, the ribbon, the
     banner and the confetti alive, at no more than thirty frames a second when nothing but
     the crowd is moving, and it stops the moment the canvas is off the screen. */
  function loop(st){
    if (st.raf) return;
    var tick = function(){
      st.raf = 0;
      var cv = st.ctx.canvas;
      if (!cv.isConnected || cv.offsetParent === null) return;
      var t = now(), busy = st.fx.length || st.parts.length || st.shake || st.erupt || Math.abs(st.pan - st.panTo) > 0.5
        || (t - (st.newestAt || 0)) < 520;
      if (REDUCE && !busy) return;
      if (t - st.lastPaint > 40 && (busy || t - st.lastRender > 33)) render(st);
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
  }

  function stateFor(cv){
    var st = cv.__rtgField;
    var dpr = window.devicePixelRatio || 1;
    if (!st || st.w !== cv.width || st.h !== cv.height){
      st = cv.__rtgField = { ctx: cv.getContext('2d'), w: cv.width, h: cv.height, plans: {}, fx: [], parts: [],
        pan: 0, panTo: 0, raf: 0, lastPaint: 0, lastRender: 0, prevUp: null, opts: {} };
      st.C = camera(cv.width, cv.height, dpr);
      st.M = Math.ceil(cv.width * 0.06);
    }
    return st;
  }

  /*
   * paint(canvas or context, frame)
   *   frame.drives   the drives, in order, as the page's drawDriveChart has always had them
   *   frame.upTo     the game second the picture is of
   *   frame.you / frame.them   { color, name }
   *   frame.anchor   the boss board's resume point, see drawDriveChart's own note
   *   frame.style    'nfl' or 'college'
   *   frame.downs    false where the page has real downs and the invented ones must not show
   *   frame.ticker   the ribbon board's words, when the page has something better to say
   */
  function paint(target, frame){
    var cv = target && target.canvas ? target.canvas : target;
    if (!cv || !cv.getContext) return;
    var st = stateFor(cv);
    var you = frame.you || { color: '#3a7bd5', name: 'YOU' }, them = frame.them || { color: '#e87461', name: 'OPP' };
    var style = frame.style || 'nfl';
    /* TWO SIDES THAT LOOK ALIKE ARE ONE SIDE. The field paints both teams' players, lanes and
       end zones, so two blues (the boss board meeting Seattle, say) is a game nobody can
       follow. The playoff broadcast already swaps a near miss for coral; this is that rule
       for every caller, with gold for the day your own colour is the coral. */
    if (dist(you.color, them.color) < 110){
      them = { color: dist(you.color, '#e87461') < 110 ? '#f5c542' : '#e87461', name: them.name };
    }
    if (!st.you || st.you.color !== you.color || st.them.color !== them.color || st.you.name !== you.name
        || st.them.name !== them.name || st.style !== style){
      st.you = { color: you.color, name: String(you.name || 'YOU').toUpperCase() };
      st.them = { color: them.color, name: String(them.name || 'OPP').toUpperCase() };
      st.style = style; st.stands = null; st.field = null; st.logoIn = false;
    }
    st.opts = { downs: frame.downs };
    st.ticker = frame.ticker || ('RUNTHE.GG   ' + st.you.name + ' VS ' + st.them.name + '   ');
    var drives = frame.drives || [], up = +frame.upTo || 0;
    /* A new game, or the same game rewound: forget the moments already fired. */
    if (st.prevUp == null || up < st.prevUp - 1){
      st.fx = []; st.parts = []; st.plans = {}; st.erupt = null; st.shake = null;
      st.prevUp = null;
    }
    if (st.prevUp != null && up > st.prevUp){
      var crossed = [];
      for (var i = 0; i < drives.length; i++){
        var d = drives[i];
        if (d.result === 'live') continue;
        if (d.tEnd > st.prevUp && d.tEnd <= up && MOMENT[norm(d.result)]) crossed.push(i);
      }
      if (crossed.length && crossed.length <= 2 && up - st.prevUp < 900){
        /* A clock only moves forward inside a game, so a drive's end is crossed once. */
        var ci = crossed[crossed.length - 1];
        fire(st, drives[ci], drives, ci);
      }
    }
    st.prevUp = up;
    st.frame = { drives: drives, upTo: up, anchor: frame.anchor || null };
    st.lastPaint = now();
    render(st);
    loop(st);
  }

  /* Sizes the canvas for the broadcast and forgets the last game on it. Taller than the old
     chart, because a picture with a stadium in it needs the room. */
  function prepare(cv){
    if (!cv) return null;
    var dpr = window.devicePixelRatio || 1;
    var rect = cv.parentElement ? cv.parentElement.getBoundingClientRect() : { width: 360 };
    var cssW = Math.max(280, rect.width || 360);
    var cssH = Math.round(clamp(cssW * 0.56, 196, 320));
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + 'px';
    if (cv.__rtgField && cv.__rtgField.raf) cancelAnimationFrame(cv.__rtgField.raf);
    cv.__rtgField = null;
    return cv.getContext('2d');
  }

  window.RTG_FIELD = { API_VERSION: API_VERSION, paint: paint, prepare: prepare };
})();
