/* 4th and What: a play drawn the way a coach prints it.
 *
 *   FAW_DIAGRAM.draw(ctx, x, y, w, h, play, opt)
 *
 * Every export uses this: the one play PNG, the printed cards, the call sheet,
 * the wristband, the scout card. A clean coaching diagram on white: circles
 * for the skill players, boxes for the line, routes as lines with arrows,
 * blocks as a T, the run in a heavier line, the reads as circled 1, 2 and 3,
 * motion as a zigzag. It fits the drawn play to the box it is given, so a
 * wristband cell and a full page show the same play.
 *
 * opt (all optional):
 *   color       true for colour, false for black and white (the default prints well anywhere)
 *   defense     the defense's alignment: true or 'x' draws X's, 'letters' draws
 *               E T M W C $ N F (needs distance). Off when false.
 *   vs          the "vs Nickel 4-2-5" label when the defense is drawn. On unless
 *               false; a string replaces the text.
 *   call        a call key (cover3b) for the vs label's coverage name
 *   coverage    the defense's plans, as FAW_ENGINE.plans(scenario, play, callKey)
 *               answers: [{ id, role, at, plan, blitz, man, mark, deep, width }],
 *               relative to the ball. Zones shaded at their marks, man as a dashed
 *               line to the receiver, rushers as arrows. Implies letters.
 *   faint       draw the offense faintly (a scout card: the look they face)
 *   distance    for the defense and the line to gain
 *   field       faint yard lines
 *   los         the line of scrimmage
 *   gain        the line to gain
 *   letters     the players' letters in their circles
 *   numbers     each route's number, in drawing order
 *   reads       the circled 1, 2, 3 at the ends of the read routes
 *   depths      each route's depth in yards at its break
 *   weight      line weight: 1 normal, 0.7 thin, 1.5 bold
 *   formation   a saved formation's { moved } to use in place of the play's own
 *
 * The play's optional fields it draws: motion { who, pts } (the player is drawn
 * faintly where he aligns and solid where the motion ends, and his route starts
 * there) and playAction (a short dashed fake from the QB toward the back).
 *
 * Plain script: window.FAW_DIAGRAM. In node, module.exports has the pure parts
 * (letters, front names, break points, snap spots) for the tests and cards.js.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var FM = isNode ? require('./formations.js') : root.FAW_FORMATIONS;
  var LETTER = { QB: 'Q', RB: 'R', WR1: 'X', WR2: 'Z', SLOT: 'H', TE: 'Y' };
  /* Our calls, the way a card names them. */
  var CALL_NAME = { cover0: 'Cover 0 blitz', cover1: 'Cover 1', cover1b: 'Cover 1 blitz', cover2: 'Cover 2', cover2b: 'Cover 2 blitz', cover3: 'Cover 3', cover3b: 'Cover 3 blitz' };

  function len(x, y) { return Math.sqrt(x * x + y * y); }

  /* ---------- the pure parts ---------- */

  /* The play's motion, when it is a real one: a skill player and a path. */
  function motionOf(play) {
    var m = play && play.motion;
    if (!m || !m.who || FM.EDITABLE.indexOf(m.who) < 0 || m.who === 'QB' || !Array.isArray(m.pts) || !m.pts.length) return null;
    return m;
  }
  /* Where everybody is when the ball is snapped: the aligned spots, with the
     man in motion moved to where his motion ends. */
  function snapSpots(play, aligned) {
    var O = {}, m = motionOf(play);
    Object.keys(aligned).forEach(function (id) { O[id] = aligned[id].slice(); });
    if (m) O[m.who] = m.pts[m.pts.length - 1].slice();
    return O;
  }
  /* The break: the last turn before the final leg. A one leg route (a go, a
     seam) has none, so its end stands in. */
  function breakPoint(start, pts) {
    if (!pts || !pts.length) return null;
    return pts.length > 1 ? pts[pts.length - 2] : pts[pts.length - 1];
  }
  /* The passing strength: the side with more receivers split out. */
  function strengthOf(O) {
    var l = 0, r = 0;
    FM.ELIGIBLE.forEach(function (id) { var p = O[id]; if (!p || FM.isBackfield(p) || Math.abs(p[0]) <= 3) return; if (p[0] < 0) l++; else r++; });
    return l > r ? 'left' : r > l ? 'right' : null;
  }
  /* The letters a coach writes for the defense: E and T up front, the backers
     S, M and W (W away from the strength), C on the corners, $ for the nickel
     or overhang to the strength and N for the other, F for the deep safety. */
  function defenseLetters(D, O) {
    var st = strengthOf(O), s = st === 'left' ? -1 : 1, out = {}, used = {};
    if (!st && O.TE) s = O.TE[0] < 0 ? -1 : 1;
    var strong = function (d) { return (d.at[0] < 0 ? -1 : 1) === s; };
    var put = function (d, l) { out[d.id] = l; used[l] = true; };
    var lbs = [], safeties = [];
    D.forEach(function (d) {
      var id = String(d.id);
      if (/^DE/.test(id)) put(d, 'E');
      else if (/^DT/.test(id) || (d.role === 'dl')) put(d, 'T');
      else if (/^CB/.test(id)) put(d, 'C');
      else if (/^NB/.test(id)) put(d, strong(d) ? '$' : 'N');
      else if (d.role === 's') safeties.push(d);
      else if (d.role === 'lb') lbs.push(d);
      else put(d, 'C');
    });
    if (safeties.length === 1) put(safeties[0], 'F');
    else {
      safeties.sort(function (a, b) { return b.at[0] * s - a.at[0] * s; });
      safeties.forEach(function (d, i) { put(d, i === safeties.length - 1 ? 'F' : !used.$ ? '$' : 'S'); });
    }
    lbs.sort(function (a, b) { return b.at[0] * s - a.at[0] * s; });
    var names = { 1: ['M'], 2: ['M', 'W'], 3: ['S', 'M', 'W'], 4: ['S', 'M', 'M', 'W'] }[lbs.length] || [];
    lbs.forEach(function (d, i) { put(d, names[i] || 'M'); });
    return out;
  }
  /* The front, by its bodies: "Nickel 4-2-5". */
  function frontName(D) {
    var dl = 0, lb = 0, db = 0;
    D.forEach(function (d) { if (d.role === 'dl') dl++; else if (d.role === 'lb') lb++; else db++; });
    if (db <= 4) return 'Base ' + dl + '-' + lb;
    var word = db === 5 ? 'Nickel ' : db === 6 ? 'Dime ' : '';
    return word + dl + '-' + lb + '-' + db;
  }
  function vsLabel(D, callKey) {
    return 'vs ' + frontName(D) + (callKey && CALL_NAME[callKey] ? ' · ' + CALL_NAME[callKey] : '');
  }
  /* The defense to draw: the plans when given, else the alignment the formation draws. */
  function defenseFor(play, opt) {
    opt = opt || {};
    if (Array.isArray(opt.coverage) && opt.coverage.length) return opt.coverage;
    var moved = opt.formation ? opt.formation.moved : play.moved;
    return FM.defense(play.formation, moved, opt.distance || 5);
  }

  /* ---------- drawing ---------- */

  /* The yards a drawing needs, so it can be fitted to its box. */
  function bounds(play, A, O, D, plans, opt) {
    var xs = [], ys = [];
    var add = function (p) { if (p) { xs.push(p[0]); ys.push(p[1]); } };
    Object.keys(A).forEach(function (id) { add(A[id]); add(O[id]); });
    (play.routes || []).forEach(function (r) { (r.pts || []).forEach(add); });
    (play.blocks || []).forEach(function (b) { add(b.to); });
    if (play.handoff && play.handoff.path) play.handoff.path.forEach(add);
    var m = motionOf(play); if (m) m.pts.forEach(add);
    if (opt.defense || opt.gain) ys.push(Math.min(opt.distance || 5, 25) + 1);
    if (D) { ys.push(8); D.forEach(function (d) { add(d.at); }); }
    if (plans) plans.forEach(function (d) {
      if (d.plan === 'zone' && d.mark) { var z = zoneSize(d); xs.push(d.mark[0] - z[0], d.mark[0] + z[0]); ys.push(d.mark[1] + z[1]); }
    });
    var x0 = Math.min.apply(null, xs) - 2, x1 = Math.max.apply(null, xs) + 2, y0 = Math.min.apply(null, ys) - 1.5, y1 = Math.max.apply(null, ys) + 2;
    if (D && opt.vs !== false) y1 += 1.6;
    return { x0: Math.min(x0, -8), x1: Math.max(x1, 8), y0: Math.min(y0, -6), y1: Math.max(y1, 6) };
  }
  /* A zone's half width and half height on the drawing: deep ones taller. */
  function zoneSize(d) { return d.deep ? [Math.max(4.5, (d.width || 12) * 0.42), 3.4] : [3.6, 2.1]; }

  function draw(ctx, X, Y, W, H, play, opt) {
    opt = opt || {};
    var col = !!opt.color, wt = opt.weight || 1;
    var ink = '#111', route = col ? '#1f4fa8' : '#111', run = col ? '#1d7f45' : '#111', block = '#111', def = col ? '#c8392a' : '#555', gold = col ? '#e3a21a' : '#111';
    var moved = opt.formation ? opt.formation.moved : play.moved;
    var A = FM.place(play.formation, moved), O = snapSpots(play, A), mo = motionOf(play);
    var plans = Array.isArray(opt.coverage) && opt.coverage.length ? opt.coverage : null;
    var defMode = opt.defense === 'letters' || (plans && opt.defense !== 'x') ? 'letters' : opt.defense ? 'x' : null;
    var D = defMode ? defenseFor(play, opt) : null;
    var b = bounds(play, A, O, D, plans, opt);
    /* one scale both ways, centred in the box */
    var s = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0));
    var ox = X + (W - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy = Y + (H - (b.y1 - b.y0) * s) / 2 + b.y1 * s;
    var sx = function (v) { return ox + v * s; }, sy = function (v) { return oy - v * s; };
    var lw = Math.max(1, s * 0.16 * wt), fam = 'Inter, Arial, sans-serif';
    var offA = opt.faint ? 0.38 : 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (opt.field) {
      ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = Math.max(0.5, lw * 0.4);
      for (var yy = Math.ceil(b.y0 / 5) * 5; yy <= b.y1; yy += 5) { ctx.beginPath(); ctx.moveTo(X, sy(yy)); ctx.lineTo(X + W, sy(yy)); ctx.stroke(); }
    }
    if (opt.gain && opt.distance) { ctx.strokeStyle = gold; ctx.setLineDash([lw * 3, lw * 2]); ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(X, sy(opt.distance)); ctx.lineTo(X + W, sy(opt.distance)); ctx.stroke(); ctx.setLineDash([]); }
    if (opt.los !== false) { ctx.strokeStyle = col ? '#2a6fd6' : '#999'; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(X, sy(0)); ctx.lineTo(X + W, sy(0)); ctx.stroke(); }

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
    function label(text, x, y, px, color, weight, align) {
      ctx.font = (weight || '700') + ' ' + Math.max(6, Math.round(px)) + 'px ' + fam; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, px * 0.28); ctx.strokeStyle = '#fff'; ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    }

    /* ---- the defense's plans, under everything ---- */
    if (plans) {
      plans.forEach(function (d) {
        if (d.plan !== 'zone' || !d.mark) return;
        var z = zoneSize(d);
        ctx.fillStyle = col ? (d.deep ? 'rgba(42,111,214,0.13)' : 'rgba(42,111,214,0.10)') : (d.deep ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.06)');
        ctx.strokeStyle = col ? 'rgba(42,111,214,0.35)' : 'rgba(0,0,0,0.25)'; ctx.lineWidth = Math.max(0.5, lw * 0.4);
        ctx.beginPath(); ctx.ellipse(sx(d.mark[0]), sy(d.mark[1]), z[0] * s, z[1] * s, 0, 0, 7); ctx.fill(); ctx.stroke();
        path([d.at, d.mark], def, Math.max(0.5, lw * 0.45), [lw * 0.8, lw * 1.6]);
      });
      plans.forEach(function (d) {
        if (d.plan === 'man' && d.man && O[d.man]) path([d.at, O[d.man]], def, Math.max(0.6, lw * 0.6), [lw * 2, lw * 1.6]);
        if (d.plan === 'rush') {
          var q = O.QB, dx = q[0] - d.at[0], dy = q[1] - d.at[1], L = len(dx, dy) || 1;
          var go = d.blitz ? Math.min(L - 1.2, Math.max(3, d.at[1] + 1.5)) : Math.min(L - 1.2, 2.6);
          var end = [d.at[0] + dx / L * go, d.at[1] + dy / L * go];
          path([d.at, end], def, lw * (d.blitz ? 1.2 : 0.8));
          arrow(d.at, end, def, d.blitz ? 1.0 : 0.8);
        }
      });
    }
    if (D) {
      var L2 = defMode === 'letters' ? defenseLetters(D, O) : null;
      D.forEach(function (d) {
        var x = sx(d.at[0]), y = sy(d.at[1]), r = s * 0.5;
        if (L2) { label(L2[d.id] || '?', x, y, s * 1.05, def, '800'); return; }
        ctx.strokeStyle = def; ctx.lineWidth = lw * 0.9;
        ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
      });
      if (opt.vs !== false) {
        var vt = typeof opt.vs === 'string' ? opt.vs : vsLabel(D, opt.call);
        label(vt, X + Math.max(4, s * 0.4), sy(b.y1) + s * 0.9, s * 0.85, def, '700', 'left');
      }
    }

    ctx.globalAlpha = offA;
    var isRun = !!(play.handoff && play.handoff.to);
    (play.blocks || []).forEach(function (bk) {
      var a = O[bk.who]; if (!a || !bk.to) return;
      path([a, bk.to], block, lw);
      var dx = bk.to[0] - a[0], dy = bk.to[1] - a[1], L = len(dx, dy) || 1, px = -dy / L * 0.7, py = dx / L * 0.7;
      path([[bk.to[0] + px, bk.to[1] + py], [bk.to[0] - px, bk.to[1] - py]], block, lw * 1.2);
    });
    /* motion: a zigzag from where he lines up to where he is at the snap */
    if (mo) {
      var zz = [], pts0 = [A[mo.who]].concat(mo.pts);
      for (var i = 1; i < pts0.length; i++) {
        var p0 = pts0[i - 1], p1 = pts0[i], dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = len(dx, dy);
        if (L < 0.01) continue;
        var n = Math.max(2, Math.round(L / 0.9)), ux = dx / L, uy = dy / L;
        if (!zz.length) zz.push(p0);
        for (var k = 1; k < n; k++) { var f = k / n, side = k % 2 ? 0.38 : -0.38; zz.push([p0[0] + dx * f - uy * side, p0[1] + dy * f + ux * side]); }
        zz.push(p1);
      }
      if (zz.length > 1) path(zz, route, Math.max(1, lw * 0.8));
    }
    (play.routes || []).forEach(function (r, i) {
      var a = O[r.who]; if (!a || !r.pts || !r.pts.length) return;
      var pts = [a].concat(r.pts);
      path(pts, route, lw, isRun ? [lw * 2.5, lw * 2] : null);
      arrow(pts[pts.length - 2], pts[pts.length - 1], route, 0.9);
      if (opt.numbers) {
        var m = pts[1], dx = m[0] - a[0], dy = m[1] - a[1], L = len(dx, dy) || 1, nx = a[0] + dx / L * 1.6, ny = a[1] + dy / L * 1.6;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = route; ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.arc(sx(nx), sy(ny), s * 0.5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = route; ctx.font = '700 ' + Math.round(s * 0.62) + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), sx(nx), sy(ny) + 0.5);
      }
      if (opt.depths) {
        var bp = breakPoint(a, r.pts), dep = Math.round(bp[1]);
        if (dep >= 1) {
          var out = (bp[0] < 0 ? -1 : 1) * 1.1;
          label(String(dep), sx(bp[0] + out), sy(bp[1]), s * 0.62, col ? '#444' : '#333', '700');
        }
      }
    });
    if (isRun) {
      var c = O[play.handoff.to], q = O.QB, rp = [c].concat(play.handoff.path || []);
      if (play.handoff.to !== 'QB') path([q, c], run, lw * 0.8, [lw * 1.5, lw * 1.5]);
      if (rp.length > 1) { path(rp, run, lw * 1.7); arrow(rp[rp.length - 2], rp[rp.length - 1], run, 1.1); }
    }
    /* play action: the QB's fake, a short dashed step toward the back */
    if (play.playAction && !isRun && O.RB) {
      var q2 = O.QB, rb = O.RB, fx = rb[0] - q2[0], fy = rb[1] - q2[1], fl = len(fx, fy) || 1, go2 = Math.min(2.4, fl * 0.7);
      var fe = [q2[0] + fx / fl * go2, q2[1] + fy / fl * go2];
      path([q2, fe], run, lw * 0.9, [lw * 1.2, lw * 1.2]);
      label('fake', sx(fe[0] + (fx < 0 ? -0.6 : 0.6)), sy(fe[1] - 0.9), s * 0.6, run, '700', fx < 0 ? 'right' : 'left');
    }
    if (opt.reads !== false && !isRun) (play.targets || []).slice(0, 3).forEach(function (id, i) {
      var r = null; (play.routes || []).forEach(function (x) { if (x.who === id) r = x; }); if (!r || !r.pts || !r.pts.length) return;
      var e = r.pts[r.pts.length - 1], x = sx(e[0]) + s * 0.95, y = sy(e[1]) - s * 0.95;
      ctx.fillStyle = i === 0 && col ? '#ffd23f' : '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, lw * 0.55);
      ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = '800 ' + Math.round(s * 0.78) + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y + 0.5);
    });

    /* the players last, over every line */
    FM.LINEMEN.forEach(function (id) {
      var a = O[id], x = sx(a[0]), y = sy(a[1]), r = s * 0.55;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, lw * 0.7);
      ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    });
    function circle(id, a, ghost) {
      var x = sx(a[0]), y = sy(a[1]), r = s * 0.7;
      var carrier = isRun && play.handoff.to === id;
      var was = ctx.globalAlpha; if (ghost) ctx.globalAlpha = was * 0.35;
      ctx.fillStyle = carrier && col ? '#d9f2e2' : '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, lw * 0.8);
      if (ghost) ctx.setLineDash([lw * 1.2, lw]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      if (opt.letters !== false) {
        ctx.fillStyle = ink; ctx.font = '800 ' + Math.round(s * 0.8) + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(LETTER[id], x, y + 0.5);
      }
      ctx.globalAlpha = was;
    }
    FM.EDITABLE.forEach(function (id) {
      if (mo && mo.who === id) circle(id, A[id], true);
      circle(id, O[id], false);
    });
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(sx(0), sy(-0.1), s * 0.22, s * 0.32, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* One play as a PNG data url, w by h pixels. */
  function png(play, w, h, opt) {
    var c = root.document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    draw(x, 0, 0, w, h, play, opt);
    return c;
  }

  var API = { draw: draw, png: png, LETTER: LETTER, CALL_NAME: CALL_NAME, motionOf: motionOf, snapSpots: snapSpots, breakPoint: breakPoint,
    strengthOf: strengthOf, defenseLetters: defenseLetters, frontName: frontName, vsLabel: vsLabel, defenseFor: defenseFor };
  if (isNode) module.exports = API;
  else root.FAW_DIAGRAM = API;
})(typeof window !== 'undefined' ? window : this);
