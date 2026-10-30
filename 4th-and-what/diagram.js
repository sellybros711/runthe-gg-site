/* 4th and What: a play drawn the way a coach prints it.
 *
 *   FAW_DIAGRAM.draw(ctx, x, y, w, h, play, opt)
 *
 * Every export uses this: the one play PNG, the printed cards, the call sheet,
 * the wristband. A clean coaching diagram on white: circles for the skill
 * players, boxes for the line, routes as lines with arrows, blocks as a T,
 * the run in a heavier line, the read as a star. It fits the drawn play to
 * the box it is given, so a wristband cell and a full page show the same play.
 *
 * opt (all optional):
 *   color      true for colour, false for black and white (the default prints well anywhere)
 *   defense    draw the defense's alignment as X's (needs distance)
 *   distance   for the defense and the line to gain
 *   field      faint yard lines
 *   los        the line of scrimmage
 *   gain       the line to gain
 *   letters    the players' letters in their circles
 *   numbers    each route's number, in drawing order
 *   reads      the star and the 2
 *   weight     line weight: 1 normal, 0.7 thin, 1.5 bold
 *   formation  a saved formation's { moved } to use in place of the play's own
 *
 * Plain script: window.FAW_DIAGRAM.
 */
(function (root) {
  'use strict';
  var FM = root.FAW_FORMATIONS;
  var LETTER = { QB: 'Q', RB: 'R', WR1: 'X', WR2: 'Z', SLOT: 'H', TE: 'Y' };

  function len(x, y) { return Math.sqrt(x * x + y * y); }

  /* The yards a drawing needs, so it can be fitted to its box. */
  function bounds(play, O, opt) {
    var xs = [], ys = [];
    Object.keys(O).forEach(function (id) { xs.push(O[id][0]); ys.push(O[id][1]); });
    (play.routes || []).forEach(function (r) { (r.pts || []).forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    (play.blocks || []).forEach(function (b) { xs.push(b.to[0]); ys.push(b.to[1]); });
    if (play.handoff && play.handoff.path) play.handoff.path.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
    if (opt.defense || opt.gain) ys.push(Math.min(opt.distance || 5, 25) + 1);
    if (opt.defense) ys.push(8);
    var x0 = Math.min.apply(null, xs) - 2, x1 = Math.max.apply(null, xs) + 2, y0 = Math.min.apply(null, ys) - 1.5, y1 = Math.max.apply(null, ys) + 2;
    return { x0: Math.min(x0, -8), x1: Math.max(x1, 8), y0: Math.min(y0, -6), y1: Math.max(y1, 6) };
  }

  function draw(ctx, X, Y, W, H, play, opt) {
    opt = opt || {};
    var col = !!opt.color, wt = opt.weight || 1;
    var ink = '#111', route = col ? '#1f4fa8' : '#111', run = col ? '#1d7f45' : '#111', block = '#111', def = col ? '#c8392a' : '#666', gold = col ? '#e3a21a' : '#111';
    var O = FM.place(play.formation, opt.formation ? opt.formation.moved : play.moved);
    var b = bounds(play, O, opt);
    /* one scale both ways, centred in the box */
    var s = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0));
    var ox = X + (W - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy = Y + (H - (b.y1 - b.y0) * s) / 2 + b.y1 * s;
    var sx = function (v) { return ox + v * s; }, sy = function (v) { return oy - v * s; };
    var lw = Math.max(1, s * 0.16 * wt);
    ctx.save();
    ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (opt.field) {
      ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = Math.max(0.5, lw * 0.4);
      for (var yy = Math.ceil(b.y0 / 5) * 5; yy <= b.y1; yy += 5) { ctx.beginPath(); ctx.moveTo(X, sy(yy)); ctx.lineTo(X + W, sy(yy)); ctx.stroke(); }
    }
    if (opt.gain && opt.distance) { ctx.strokeStyle = gold; ctx.setLineDash([lw * 3, lw * 2]); ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(X, sy(opt.distance)); ctx.lineTo(X + W, sy(opt.distance)); ctx.stroke(); ctx.setLineDash([]); }
    if (opt.los !== false) { ctx.strokeStyle = col ? '#2a6fd6' : '#999'; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(X, sy(0)); ctx.lineTo(X + W, sy(0)); ctx.stroke(); }

    if (opt.defense) {
      FM.defense(play.formation, opt.formation ? opt.formation.moved : play.moved, opt.distance || 5).forEach(function (d) {
        var x = sx(d.at[0]), y = sy(d.at[1]), r = s * 0.5;
        ctx.strokeStyle = def; ctx.lineWidth = lw * 0.9;
        ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
      });
    }

    function path(pts, color, width, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(sx(p[0]), sy(p[1])); else ctx.moveTo(sx(p[0]), sy(p[1])); }); ctx.stroke(); ctx.setLineDash([]);
    }
    function arrow(a, z, color, size) {
      var dx = z[0] - a[0], dy = z[1] - a[1], L = len(dx, dy) || 1, ux = dx / L, uy = dy / L, k = size;
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(sx(z[0]), sy(z[1]));
      ctx.lineTo(sx(z[0] - ux * k - uy * k * 0.55), sy(z[1] - uy * k + ux * k * 0.55));
      ctx.lineTo(sx(z[0] - ux * k + uy * k * 0.55), sy(z[1] - uy * k - ux * k * 0.55));
      ctx.closePath(); ctx.fill();
    }
    var isRun = !!(play.handoff && play.handoff.to);
    (play.blocks || []).forEach(function (bk) {
      var a = O[bk.who]; if (!a) return;
      path([a, bk.to], block, lw);
      var dx = bk.to[0] - a[0], dy = bk.to[1] - a[1], L = len(dx, dy) || 1, px = -dy / L * 0.7, py = dx / L * 0.7;
      path([[bk.to[0] + px, bk.to[1] + py], [bk.to[0] - px, bk.to[1] - py]], block, lw * 1.2);
    });
    (play.routes || []).forEach(function (r, i) {
      var a = O[r.who]; if (!a || !r.pts || !r.pts.length) return;
      var pts = [a].concat(r.pts);
      path(pts, route, lw, isRun ? [lw * 2.5, lw * 2] : null);
      arrow(pts[pts.length - 2], pts[pts.length - 1], route, 0.9);
      if (opt.numbers) {
        var m = pts[1], dx = m[0] - a[0], dy = m[1] - a[1], L = len(dx, dy) || 1, nx = a[0] + dx / L * 1.6, ny = a[1] + dy / L * 1.6;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = route; ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.arc(sx(nx), sy(ny), s * 0.5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = route; ctx.font = '700 ' + Math.round(s * 0.62) + 'px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), sx(nx), sy(ny) + 0.5);
      }
    });
    if (isRun) {
      var c = O[play.handoff.to], q = O.QB, rp = [c].concat(play.handoff.path || []);
      if (play.handoff.to !== 'QB') path([q, c], run, lw * 0.8, [lw * 1.5, lw * 1.5]);
      if (rp.length > 1) { path(rp, run, lw * 1.7); arrow(rp[rp.length - 2], rp[rp.length - 1], run, 1.1); }
    }
    if (opt.reads !== false && !isRun) (play.targets || []).forEach(function (id, i) {
      var r = null; (play.routes || []).forEach(function (x) { if (x.who === id) r = x; }); if (!r) return;
      var e = r.pts[r.pts.length - 1], x = sx(e[0]) + s * 0.9, y = sy(e[1]) - s * 0.9;
      if (i === 0) {
        ctx.fillStyle = col ? '#ffd23f' : '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, lw * 0.5); ctx.beginPath();
        for (var k = 0; k < 10; k++) { var an = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.32 : s * 0.75; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, lw * 0.5);
        ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ink; ctx.font = '800 ' + Math.round(s * 0.7) + 'px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('2', x, y + 0.5);
      }
    });

    /* the players last, over every line */
    FM.LINEMEN.forEach(function (id) {
      var a = O[id], x = sx(a[0]), y = sy(a[1]), r = s * 0.55;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, lw * 0.7);
      ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    });
    FM.EDITABLE.forEach(function (id) {
      var a = O[id], x = sx(a[0]), y = sy(a[1]), r = s * 0.7;
      var carrier = isRun && play.handoff.to === id;
      ctx.fillStyle = carrier && col ? '#d9f2e2' : '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, lw * 0.8);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
      if (opt.letters !== false) {
        ctx.fillStyle = ink; ctx.font = '800 ' + Math.round(s * 0.8) + 'px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(LETTER[id], x, y + 0.5);
      }
    });
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(sx(0), sy(-0.1), s * 0.22, s * 0.32, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  /* One play as a PNG data url, w by h pixels. */
  function png(play, w, h, opt) {
    var c = root.document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    draw(x, 0, 0, w, h, play, opt);
    return c;
  }

  root.FAW_DIAGRAM = { draw: draw, png: png, LETTER: LETTER };
})(typeof window !== 'undefined' ? window : this);
