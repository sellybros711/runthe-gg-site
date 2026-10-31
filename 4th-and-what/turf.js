/* 4th and What: the field, drawn from above on turf.
 *
 *   var V = FAW_TURF.view(canvas, { BX, Y0, marker, behind, ahead, across })
 *                                    (across: yards shown side to side, centred on the
 *                                    ball; the whole width when left out)
 *   V.layout()                       size the canvas to its box (css width), keep the aspect
 *   V.field()                        the turf: stripes, yard lines and numbers, hashes, end zones,
 *                                    the line of scrimmage and the line to gain
 *   V.play(play, o)                  a play (yards from the ball) with its routes, blocks, the run,
 *                                    motion, the fake, the reads, and the defense if asked
 *   V.frame(res, t, o)               the engine's result at time t: everybody where the sim put him
 *   V.toRel(clientX, clientY)        a touch, in yards from the ball
 *   V.toScreen([x, y])               yards from the ball, to page pixels (for the checks)
 *   FAW_TURF.thumb(play, w, h, o)    a small picture of a play, for cards and lists
 *   FAW_TURF.COLOR, LABEL            each player's colour and letter
 *
 * The coach's whiteboard became turf in the 2026-10-31 redesign (the owner's
 * template): every screen shows the same field, colours and letters, so a
 * player learns one picture. Printed pages stay on white (diagram.js), which
 * is what a copier wants.
 *
 * Coordinates: x across the field (the ball at BX), y down it (the line of
 * scrimmage at Y0, the opponent's goal line at 100). A play is drawn in yards
 * from the ball; the engine's frames are in field yards.
 *
 * Plain script: window.FAW_TURF.
 */
(function (root) {
  'use strict';
  var FM = function () { return root.FAW_FORMATIONS; };
  var FIELD_W = 160 / 3;
  var COLOR = { WR1: '#3d8bff', WR2: '#ef4b3f', SLOT: '#b06cff', TE: '#f5c542', RB: '#2ec4a6', QB: '#5b8cff' };
  var LABEL = { WR1: 'X', WR2: 'Z', SLOT: 'H', TE: 'Y', RB: 'RB', QB: 'QB' };
  var RUN = '#36d399', BLOCK = '#f4f1e8', LOS = '#4aa3ff', GAIN = '#ffd23f';

  function len(x, y) { return Math.sqrt(x * x + y * y); }

  /* the defense's letters: E T T E, the backers M and W (W away from the
     passing strength), corners C, the overhang to the strength $ and the
     other N, the deep safety F */
  function letters(O, D) {
    var left = 0, right = 0;
    FM().ELIGIBLE.forEach(function (id) { if (!FM().isBackfield(O[id]) && Math.abs(O[id][0]) > 3) { if (O[id][0] < 0) left++; else right++; } });
    var strong = left > right ? -1 : 1, out = {};
    D.forEach(function (d) {
      var s = d.at[0] * strong > 0;
      out[d.id] = d.role === 'dl' ? (/^DT/.test(d.id) ? 'T' : 'E') : d.role === 'lb' ? (s ? 'M' : 'W') : /^CB/.test(d.id) ? 'C' : /^NB/.test(d.id) ? (s ? '$' : 'N') : 'F';
    });
    return out;
  }

  var grain = null;
  function grainPattern(ctx) {
    if (grain) return ctx.createPattern(grain, 'repeat');
    grain = document.createElement('canvas'); grain.width = grain.height = 96;
    var g = grain.getContext('2d');
    for (var i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.05)';
      g.fillRect(Math.random() * 96, Math.random() * 96, 1 + Math.random() * 1.5, 1);
    }
    return ctx.createPattern(grain, 'repeat');
  }

  function view(canvas, o) {
    o = o || {};
    var ctx = canvas.getContext('2d'), W = 0, H = 0, S = 1, DPR = 1, xMin = -1, yTop = 0;
    var V = {};
    V.set = function (n) { for (var k in n) o[k] = n[k]; return V; };
    V.opts = function () { return o; };
    V.layout = function (wPx) {
      var r = canvas.getBoundingClientRect();
      W = Math.max(160, Math.round(wPx || r.width || canvas.width));
      DPR = Math.min(2.5, root.devicePixelRatio || 1);
      var span = (o.behind || 11) + (o.ahead || 27);
      S = W / (o.across || FIELD_W + 2);
      H = Math.round(span * S);
      if (!wPx) canvas.style.height = H + 'px';
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      return V;
    };
    function top() { return o.Y0 + (o.ahead || 27); }
    function sx(xa) { return (xa - xMin) * S; }
    function sy(ya) { return (yTop - ya) * S; }
    function rx(x) { return sx(o.BX + x); }
    function ry(y) { return sy(o.Y0 + y); }
    V.scale = function () { return S; };
    V.toRel = function (cx, cy) { var r = canvas.getBoundingClientRect(); return [xMin + (cx - r.left) / S - o.BX, yTop - (cy - r.top) / S - o.Y0]; };
    V.toScreen = function (p) { var r = canvas.getBoundingClientRect(); return [r.left + rx(p[0]), r.top + ry(p[1])]; };

    function pen(col, w, dash) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dash || []); }
    function poly(pts, col, w, dash) {
      pen(col, w, dash); ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(rx(p[0]), ry(p[1])); else ctx.moveTo(rx(p[0]), ry(p[1])); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    function head(a, b, col, k) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L = len(dx, dy) || 1, ux = dx / L, uy = dy / L; k = k || 1.1;
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(rx(b[0] + ux * 0.3), ry(b[1] + uy * 0.3));
      ctx.lineTo(rx(b[0] - ux * k - uy * k * 0.6), ry(b[1] - uy * k + ux * k * 0.6));
      ctx.lineTo(rx(b[0] - ux * k + uy * k * 0.6), ry(b[1] - uy * k - ux * k * 0.6));
      ctx.closePath(); ctx.fill();
    }
    function tbar(a, b, col) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L = len(dx, dy) || 1, px = -dy / L * 0.8, py = dx / L * 0.8;
      poly([a, b], col, Math.max(2, S * 0.22));
      poly([[b[0] + px, b[1] + py], [b[0] - px, b[1] - py]], col, Math.max(2.5, S * 0.28));
    }
    function zig(pts, col) {
      /* motion: a zigzag along the path */
      pen(col, Math.max(1.6, S * 0.18)); ctx.beginPath();
      var amp = 0.45, step = 0.9, first = true;
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = len(dx, dy) || 1, nx = -dy / L, ny = dx / L, n = Math.max(1, Math.round(L / step));
        for (var k = 0; k <= n; k++) {
          var t = k / n, s = k === 0 || k === n ? 0 : (k % 2 ? amp : -amp);
          var x = a[0] + dx * t + nx * s, y = a[1] + dy * t + ny * s;
          if (first) { ctx.moveTo(rx(x), ry(y)); first = false; } else ctx.lineTo(rx(x), ry(y));
        }
      }
      ctx.stroke();
    }
    function token(x, y, fill, label, o2) {
      o2 = o2 || {};
      var r = S * (o2.r || 1.15);
      if (o2.glow) { ctx.fillStyle = 'rgba(255,210,63,.28)'; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,210,63,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = o2.alpha == null ? 1 : o2.alpha;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x + r * 0.12, y + r * 0.18, r, 0, 7); ctx.fill();
      ctx.fillStyle = fill; ctx.strokeStyle = o2.ring || '#ffffff'; ctx.lineWidth = Math.max(1.5, r * 0.16);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
      if (label) {
        ctx.fillStyle = o2.ink || '#fff'; ctx.font = '800 ' + Math.round(r * (label.length > 1 ? 0.82 : 1.15)) + 'px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + r * 0.05);
      }
      ctx.globalAlpha = 1;
    }
    function lineman(x, y, alpha) { token(x, y, '#1c2633', '', { r: 0.95, ring: '#e8edf3', alpha: alpha }); }
    function defender(x, y, mode, letter, alpha) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      if (mode === 'letters') {
        ctx.fillStyle = 'rgba(8,14,22,.55)'; ctx.beginPath(); ctx.arc(x, y, S * 1.05, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(S * 1.25) + 'px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, x, y + 1);
      } else {
        var q = S * 0.75; pen('#fff', Math.max(2, S * 0.3));
        ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function badge(x, y, n) {
      var r = S * 0.85;
      ctx.fillStyle = GAIN; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1d00'; ctx.font = '900 ' + Math.round(r * 1.25) + 'px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x, y + 0.5);
    }

    /* ---------- the turf ---------- */
    V.field = function () {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      xMin = o.across ? o.BX - o.across / 2 : -1; yTop = top();
      var yBot = yTop - H / S;
      /* turf, five yard stripes */
      for (var y = Math.floor(yBot / 5) * 5; y < yTop; y += 5) {
        var band = Math.floor(y / 5);
        ctx.fillStyle = band % 2 ? '#2f6f3a' : '#2a6534';
        ctx.fillRect(0, sy(y + 5), W, 5 * S + 1);
      }
      ctx.fillStyle = grainPattern(ctx); ctx.fillRect(0, 0, W, H);
      /* the end zones */
      [[100, 110], [-10, 0]].forEach(function (z) {
        if (z[1] < yBot || z[0] > yTop) return;
        ctx.fillStyle = 'rgba(18,40,78,.82)'; ctx.fillRect(0, sy(z[1]), W, (z[1] - z[0]) * S);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '900 italic ' + Math.round(S * 4) + 'px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('4TH & WHAT', sx(FIELD_W / 2), sy((z[0] + z[1]) / 2));
      });
      /* the sidelines, yard lines, hashes and numbers */
      pen('rgba(255,255,255,.9)', 2); ctx.strokeRect(sx(0), -2, (FIELD_W) * S, H + 4);
      for (var yl = Math.ceil(yBot); yl <= yTop; yl++) {
        if (yl < 0 || yl > 100) continue;
        if (yl % 5 === 0) {
          pen('rgba(255,255,255,' + (yl % 10 === 0 || yl === 0 || yl === 100 ? '.78' : '.55') + ')', yl === 0 || yl === 100 ? 4 : 1.6);
          ctx.beginPath(); ctx.moveTo(sx(0), sy(yl)); ctx.lineTo(sx(FIELD_W), sy(yl)); ctx.stroke();
          if (yl % 10 === 0 && yl > 0 && yl < 100) {
            var n = yl <= 50 ? yl : 100 - yl;
            ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '800 ' + Math.round(S * 1.9) + 'px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.save(); ctx.translate(sx(6.5), sy(yl)); ctx.rotate(Math.PI / 2); ctx.fillText(String(n), 0, 0); ctx.restore();
            ctx.save(); ctx.translate(sx(FIELD_W - 6.5), sy(yl)); ctx.rotate(-Math.PI / 2); ctx.fillText(String(n), 0, 0); ctx.restore();
          }
        } else {
          pen('rgba(255,255,255,.5)', 1.2);
          [0.6, 23.58, 29.75, FIELD_W - 0.6].forEach(function (hx) { ctx.beginPath(); ctx.moveTo(sx(hx - 0.35), sy(yl)); ctx.lineTo(sx(hx + 0.35), sy(yl)); ctx.stroke(); });
        }
      }
      /* the line of scrimmage and the line to gain */
      if (o.marker != null && o.marker < 100) { pen(GAIN, Math.max(2.5, S * 0.32)); ctx.beginPath(); ctx.moveTo(sx(0), sy(o.marker)); ctx.lineTo(sx(FIELD_W), sy(o.marker)); ctx.stroke(); }
      pen(LOS, Math.max(2.5, S * 0.32)); ctx.beginPath(); ctx.moveTo(sx(0), sy(o.Y0)); ctx.lineTo(sx(FIELD_W), sy(o.Y0)); ctx.stroke();
      return V;
    };

    /* ---------- a play, as drawn ---------- */
    V.play = function (play, d) {
      d = d || {};
      var F = FM(), O = F.place(play.formation, play.moved), isRun = !!(play.handoff && play.handoff.to);
      var showO = d.offense !== false, showD = d.defense;
      var D = showD ? (d.plans || F.defense(play.formation, play.moved, d.distance || 5).map(function (x) { return { id: x.id, role: x.role, at: x.at }; })) : [];
      var LET = showD ? letters(O, D) : {};
      var dimAll = d.dim ? 0.35 : 1;
      /* coverage under everything */
      if (showD && d.coverage && d.plans) d.plans.forEach(function (p) {
        if (p.plan === 'zone' && p.mark) {
          var w = (p.width || 8) * (p.deep ? 0.55 : 0.42), h = p.deep ? 5.5 : 3.6;
          ctx.fillStyle = p.deep ? 'rgba(74,163,255,.30)' : 'rgba(74,163,255,.24)'; ctx.strokeStyle = 'rgba(160,210,255,.6)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(rx(p.mark[0]), ry(p.mark[1]), w * S, h * S, 0, 0, 7); ctx.fill(); ctx.stroke();
        }
        if (p.plan === 'man' && p.man && O[p.man]) poly([p.at, O[p.man]], 'rgba(255,255,255,.55)', 1.5, [4, 4]);
        if (p.plan === 'rush') {
          var to = [p.at[0] * 0.5, -3.5];
          poly([p.at, to], p.blitz ? 'rgba(255,120,90,.9)' : 'rgba(255,255,255,.4)', p.blitz ? 2.5 : 1.5);
          head(p.at, to, p.blitz ? 'rgba(255,120,90,.9)' : 'rgba(255,255,255,.4)', 0.8);
        }
      });
      if (showO) {
        ctx.globalAlpha = dimAll;
        /* blocks */
        (play.blocks || []).forEach(function (b) { if (O[b.who]) tbar(O[b.who], b.to, BLOCK); });
        /* motion: the zigzag from where he lines up to his spot at the snap */
        if (play.motion && play.motion.pts && play.motion.pts.length && O[play.motion.who]) {
          var mp = [O[play.motion.who]].concat(play.motion.pts);
          zig(mp, COLOR[play.motion.who] || '#fff');
        }
        var snapAt = function (id) { return play.motion && play.motion.who === id && play.motion.pts && play.motion.pts.length ? play.motion.pts[play.motion.pts.length - 1] : O[id]; };
        /* routes */
        (play.routes || []).forEach(function (r) {
          if (!O[r.who] || !r.pts || !r.pts.length) return;
          var pts = [snapAt(r.who)].concat(r.pts), col = COLOR[r.who] || '#fff';
          ctx.globalAlpha = dimAll * (isRun ? 0.45 : 1) * (d.highlight && d.highlight !== r.who ? 0.4 : 1);
          poly(pts, col, Math.max(2.4, S * (d.highlight === r.who ? 0.42 : 0.3)));
          head(pts[pts.length - 2], pts[pts.length - 1], col);
          if (d.depths) {
            var brk = r.pts[0], dep = Math.round(brk[1]);
            if (dep > 0) { ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(S * 0.95) + 'px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(String(dep), rx(brk[0]) + S * 0.5, ry(brk[1]) - S * 0.2); }
          }
        });
        ctx.globalAlpha = dimAll;
        /* play action: a dashed fake toward the back */
        if (play.playAction && !isRun) {
          var back = O.RB, q0 = O.QB, mesh = [(q0[0] + back[0]) / 2, (q0[1] + back[1]) / 2];
          poly([q0, mesh], GAIN, Math.max(1.6, S * 0.2), [4, 4]);
          ctx.fillStyle = GAIN; ctx.font = '800 ' + Math.round(S * 0.9) + 'px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('PA', rx(mesh[0]), ry(mesh[1]) + S * 0.4);
        }
        /* the run */
        if (isRun) {
          var c = O[play.handoff.to], q = O.QB;
          if (play.handoff.to !== 'QB') poly([q, c], RUN, Math.max(2, S * 0.2), [5, 5]);
          var path = [c].concat(play.handoff.path || []);
          if (path.length > 1) { poly(path, RUN, Math.max(3.5, S * 0.5)); head(path[path.length - 2], path[path.length - 1], RUN, 1.3); }
        }
        ctx.globalAlpha = 1;
      }
      /* the defense */
      if (showD && d.defenders !== false) D.forEach(function (x) { defender(rx(x.at[0]), ry(x.at[1]), d.defenseStyle || 'x', LET[x.id], d.offense === false ? 1 : 0.92); });
      if (showO) {
        /* the offense */
        F.LINEMEN.forEach(function (id) { lineman(rx(O[id][0]), ry(O[id][1]), dimAll); });
        F.EDITABLE.forEach(function (id) {
          var at = O[id];
          if (play.motion && play.motion.who === id && play.motion.pts && play.motion.pts.length) {
            token(rx(at[0]), ry(at[1]), COLOR[id], '', { alpha: 0.35 * dimAll });
            at = play.motion.pts[play.motion.pts.length - 1];
          }
          token(rx(at[0]), ry(at[1]), COLOR[id], LABEL[id], { glow: d.highlight === id || (d.hot && d.hot.indexOf(id) >= 0), alpha: dimAll });
        });
        /* the ball */
        ctx.fillStyle = '#8a4b22'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(rx(0), ry(-0.15), S * 0.32, S * 0.5, 0, 0, 7); ctx.fill(); ctx.stroke();
        /* the reads, numbered at the end of each route */
        if (d.reads !== false && !isRun) (play.targets || []).forEach(function (id, i) {
          var r = null; (play.routes || []).forEach(function (x) { if (x.who === id) r = x; });
          if (!r || !r.pts.length) return;
          var e = r.pts[r.pts.length - 1], prev = r.pts.length > 1 ? r.pts[r.pts.length - 2] : snapAt(id);
          var dx = e[0] - prev[0], dy = e[1] - prev[1], L = len(dx, dy) || 1;
          badge(rx(e[0] + dx / L * 1.6 - dy / L * 0.9), ry(e[1] + dy / L * 1.6 + dx / L * 0.9), i + 1);
        });
      }
      return V;
    };

    /* ---------- the sim, at time t ---------- */
    V.frame = function (res, t, d) {
      d = d || {};
      /* before the snap (t below 0) the motion plays from res.pre */
      var fr = res.frames, dt = res.dt, base = 0;
      if (t < 0 && res.pre && res.pre.length) { fr = res.pre; base = res.pre[0].t; }
      var i = Math.max(0, Math.min(fr.length - 2, Math.floor((t - base) / dt))), a = fr[i], b = fr[i + 1] || a;
      var u = Math.max(0, Math.min(1, (t - a.t) / dt));
      var F = FM();
      if (d.pre) { a = d.pre; b = d.pre; u = 0; }
      /* the drawn play, faint, as the plan */
      if (d.play) V.play(d.play, { dim: true, reads: false, defense: false });
      if (d.coverage && d.plans) V.play(d.play || { formation: res.formation, moved: {} }, { offense: false, defense: true, plans: d.plans, coverage: true, defenders: false });
      var pos = [];
      res.ids.forEach(function (e, j) {
        var x = a.p[j][0] + (b.p[j][0] - a.p[j][0]) * u, y = a.p[j][1] + (b.p[j][1] - a.p[j][1]) * u;
        pos.push([x, y, e]);
      });
      /* defense under, offense over */
      pos.forEach(function (q) { var e = q[2]; if (e.side === 'D') defender(sx(q[0]), sy(q[1]), d.icons === false ? 'x' : 'x', ''); });
      pos.forEach(function (q) {
        var e = q[2]; if (e.side !== 'O') return;
        if (e.role === 'ol') lineman(sx(q[0]), sy(q[1]));
        else token(sx(q[0]), sy(q[1]), COLOR[e.id] || '#fff', d.icons === false ? '' : LABEL[e.id], { glow: res.throwInfo && res.throwInfo.to === e.id && t >= (res.events.filter(function (x) { return x.kind === 'throw' || x.kind === 'checkdown'; })[0] || { t: 1e9 }).t });
      });
      /* the ball, with its height as size */
      var bx = a.ball[0] + (b.ball[0] - a.ball[0]) * u, by = a.ball[1] + (b.ball[1] - a.ball[1]) * u, bz = a.ball[2] + (b.ball[2] - a.ball[2]) * u;
      var br = S * (0.32 + Math.min(1.2, bz) * 0.12);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sx(bx) + bz * S * 0.15, sy(by) + bz * S * 0.2, br, br * 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a4b22'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx(bx), sy(by), br, br * 1.4, 0, 0, 7); ctx.fill(); ctx.stroke();
      return V;
    };
    V.clear = function () { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); return V; };
    V.size = function () { return { W: W, H: H }; };
    return V;
  }

  /* A small picture of a play, for cards and lists. */
  function thumb(play, w, h, o) {
    o = o || {};
    var c = document.createElement('canvas'); c.className = 'turfthumb';
    c.style.width = w + 'px'; c.style.height = h + 'px';
    var BX = FIELD_W / 2, behind = 9, ahead = Math.max(8, h / w * (FIELD_W + 2) - behind);
    var V = view(c, { BX: BX, Y0: 50, marker: o.distance ? 50 + o.distance : null, behind: behind, ahead: ahead });
    var save = root.devicePixelRatio; V.layout(w);
    c.style.height = h + 'px';
    V.field().play(play, { reads: o.reads !== false, defense: o.defense, depths: false });
    return c;
  }

  /* a phone shows the middle of the field, big enough to draw on with a thumb */
  function across() { return root.innerWidth < 700 ? 38 : null; }

  root.FAW_TURF = { view: view, across: across, thumb: thumb, COLOR: COLOR, LABEL: LABEL, letters: letters, FIELD_W: FIELD_W };
})(window);
