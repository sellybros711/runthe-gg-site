/* 4th and What: the clipboard, where the play is drawn.
 *
 * A top down whiteboard about 36 yards across, from 9 yards behind the ball to
 * 30 past it (and the end zone when it is that close). The line of
 * scrimmage and the line to gain are drawn in marker. Eleven tokens on
 * offense: the five linemen are locked, the QB and five eligible receivers
 * are yours. Eleven X's on defense in the alignment the formation draws.
 *
 * EXACTLY FOUR TOOLS:
 *   Route    drag from a receiver to draw his route. Drag again from its end
 *            to add more. Routes are numbered in the order they are drawn.
 *   Block    drag a short bar from a receiver or back: he stays in to protect
 *            on a pass, or leads the way on a run.
 *   Handoff  tap the QB, then a back (or the QB again, to keep it). That
 *            makes it a run: drag from the ball carrier to draw his path.
 *   Target   tap a receiver for the first read (a star), then another for
 *            the checkdown (a 2). Passes only.
 * Hold a player still for a moment, then drag, to move him before the snap.
 *
 * Pointer events, never mouse events, so one code path serves a thumb, a pen
 * and a mouse. The play is the engine's play object, relative to the ball.
 *
 * Plain script: window.FAW_BOARD.
 */
(function (root) {
  'use strict';
  var FM = root.FAW_FORMATIONS;
  var X0 = -18, X1 = 18, YTOP = 30, YBOT = -9;
  var LABEL = { QB: 'Q', RB: 'R', WR1: 'X', WR2: 'Z', SLOT: 'H', TE: 'Y' };
  var HOLD_MS = 280, MAX_UNDO = 60;

  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* Ramer Douglas Peucker: a hand drawn line becomes a few clean segments. */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var a = pts[0], b = pts[pts.length - 1], idx = -1, far = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = len(dx, dy) || 1;
      var d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
      if (d > far) { far = d; idx = i; }
    }
    if (far <= eps) return [a, b];
    return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
  }

  function emptyPlay(formation) { return { formation: formation || 'gun3x1', moved: {}, routes: [], blocks: [], handoff: null, targets: [] }; }

  function create(canvas, opt) {
    var ctx = canvas.getContext('2d');
    var P = emptyPlay(opt.formation), tool = 'route', armed = false, undo = [];
    var W = 0, H = 0, DPR = 1, S = 10, ytop = YTOP;
    var drag = null;

    function scenario() { return opt.scenario(); }
    function pos() { return FM.place(P.formation, P.moved); }
    function defense() { return FM.defense(P.formation, P.moved, scenario().distance); }
    function routeOf(id) { for (var i = 0; i < P.routes.length; i++) if (P.routes[i].who === id) return P.routes[i]; return null; }
    function blockOf(id) { for (var i = 0; i < P.blocks.length; i++) if (P.blocks[i].who === id) return P.blocks[i]; return null; }
    function isRun() { return !!(P.handoff && P.handoff.to); }

    function changed() { draw(); opt.onChange && opt.onChange(P); }
    function save() { undo.push(JSON.stringify(P)); if (undo.length > MAX_UNDO) undo.shift(); }

    /* ---------- the picture ---------- */

    /* With the bottom ad on (body.rtg-sticky-on, set by /assets/rtg-ads.js), the board narrows
       until the tools and Snap It sit 8px above the banner at scroll 0. It keeps the whole field
       (every yard a route can reach is still drawn), it is just smaller. Off, this is a no-op and
       the board is exactly as wide as the column. */
    var box = canvas.parentNode, FIT_GAP = 8, FIT_MIN = 0.6;
    function room() {
      var doc = root.document;
      if (!doc.body.classList.contains('rtg-sticky-on') || !box.offsetParent) return Infinity;
      /* Down to the row that holds Snap It: the rows under it (download, save, test) are reached by
         scrolling like any page, so they may pass under the banner. */
      var snap = doc.getElementById('bSnap');
      var last = (snap && snap.parentNode) || box.parentNode.lastElementChild, b = box.getBoundingClientRect();
      var below = last.getBoundingClientRect().bottom - b.bottom;
      var ad = parseFloat(root.getComputedStyle(doc.documentElement).getPropertyValue('--sticky-ad-h')) || 0;
      return root.innerHeight - ad - FIT_GAP - (b.top + root.scrollY) - below;
    }
    function layout() {
      box.style.width = ''; box.style.alignSelf = '';
      var r = canvas.getBoundingClientRect();
      DPR = Math.min(3, root.devicePixelRatio || 1);
      W = Math.max(200, Math.round(r.width));
      var goal = scenario().ballOn;
      ytop = goal <= YTOP ? Math.max(goal + 10 > 40 ? goal : goal + 10, 18) : YTOP;
      var fit = Math.floor(room() * (X1 - X0) / (ytop - YBOT));
      if (fit < W) {
        W = Math.max(200, Math.round(W * FIT_MIN), fit);
        box.style.width = W + 'px'; box.style.alignSelf = 'center';
      }
      S = W / (X1 - X0);
      H = Math.round((ytop - YBOT) * S);
      canvas.style.height = H + 'px';
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      draw();
    }
    function sx(x) { return (x - X0) * S; }
    function sy(y) { return (ytop - y) * S; }
    function toYd(cx, cy) { var r = canvas.getBoundingClientRect(); return [X0 + (cx - r.left) / S, ytop - (cy - r.top) / S]; }

    function marker(col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
    function arrow(a, b, col) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L = len(dx, dy) || 1, ux = dx / L, uy = dy / L, k = 0.9;
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(sx(b[0]), sy(b[1]));
      ctx.lineTo(sx(b[0] - ux * k - uy * k * 0.6), sy(b[1] - uy * k + ux * k * 0.6));
      ctx.lineTo(sx(b[0] - ux * k + uy * k * 0.6), sy(b[1] - uy * k - ux * k * 0.6));
      ctx.closePath(); ctx.fill();
    }
    function line(pts, col, w, dash) {
      marker(col, w); ctx.setLineDash(dash || []); ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(sx(p[0]), sy(p[1])); else ctx.moveTo(sx(p[0]), sy(p[1])); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    function star(x, y, r, col) {
      ctx.fillStyle = col; ctx.strokeStyle = '#5a3d00'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    function badge(x, y, text, bg, fg) {
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, S * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = fg; ctx.font = '800 ' + Math.round(S * 0.7) + 'px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
    }

    function draw() {
      if (!W) return;
      var sc = scenario(), Y0 = 100 - sc.ballOn, dist = sc.distance, goal = sc.ballOn;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = '#f6f4ee'; ctx.fillRect(0, 0, W, H);
      /* the end zone, if it is on the board */
      if (goal < ytop) { ctx.fillStyle = 'rgba(33,64,124,.12)'; ctx.fillRect(0, 0, W, sy(goal)); ctx.fillStyle = 'rgba(33,64,124,.55)'; ctx.font = Math.round(S * 1.6) + 'px "Permanent Marker", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('END ZONE', W / 2, sy(goal) / 2); }
      else { ctx.fillStyle = 'rgba(33,64,124,.5)'; ctx.font = Math.round(S * 0.95) + 'px "Permanent Marker", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('End zone ' + goal + ' yards away', W / 2, 4); }
      /* yard lines, hashes, and the yard line numbers down the side */
      for (var y = Math.ceil(YBOT); y <= ytop; y++) {
        var fy = Y0 + y, five = fy % 5 === 0;
        if (y > goal) continue;
        if (five) { marker('rgba(60,90,140,.28)', fy % 10 === 0 ? 1.6 : 1); ctx.beginPath(); ctx.moveTo(0, sy(y)); ctx.lineTo(W, sy(y)); ctx.stroke(); }
        else { marker('rgba(60,90,140,.22)', 1); [-3.1, 3.1].forEach(function (hx) { ctx.beginPath(); ctx.moveTo(sx(hx - 0.35), sy(y)); ctx.lineTo(sx(hx + 0.35), sy(y)); ctx.stroke(); }); }
        /* the yard numbers sit just above their line, inside the board, and
           never under the line of scrimmage or the line to gain */
        var onMarker = Math.abs(y) < 1.6 || Math.abs(y - Math.min(goal, dist)) < 1.6;
        if (fy % 10 === 0 && fy > 0 && fy < 100 && !onMarker && sy(y) > S * 1.2) {
          var n = fy <= 50 ? fy : 100 - fy;
          ctx.fillStyle = 'rgba(60,90,140,.45)'; ctx.font = '700 ' + Math.round(S * 0.9) + 'px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText(String(n), 5, sy(y) - 2); ctx.textAlign = 'right'; ctx.fillText(String(n), W - 5, sy(y) - 2);
        }
      }
      /* the box */
      ctx.fillStyle = 'rgba(200,57,42,.06)'; ctx.fillRect(sx(-5.6), sy(7.5), sx(5.6) - sx(-5.6), sy(0) - sy(7.5));
      /* the line of scrimmage and the line to gain */
      var fd = Math.min(goal, dist);
      line([[X0, fd], [X1, fd]], '#e3a21a', 4);
      line([[X0, 0], [X1, 0]], '#2a6fd6', 4);

      var O = pos(), D = defense();

      /* the defense: X's in red marker */
      D.forEach(function (d) {
        var x = sx(d.at[0]), y2 = sy(d.at[1]), r = S * 0.55;
        marker('#c8392a', 3); ctx.beginPath(); ctx.moveTo(x - r, y2 - r); ctx.lineTo(x + r, y2 + r); ctx.moveTo(x + r, y2 - r); ctx.lineTo(x - r, y2 + r); ctx.stroke();
      });

      /* what is drawn: blocks, routes, the run */
      P.blocks.forEach(function (b) {
        var a = O[b.who]; if (!a) return;
        var to = b.to;
        line([a, to], '#1d2633', 3);
        var dx = to[0] - a[0], dy = to[1] - a[1], L = len(dx, dy) || 1, px = -dy / L * 0.8, py = dx / L * 0.8;
        line([[to[0] + px, to[1] + py], [to[0] - px, to[1] - py]], '#1d2633', 4);
      });
      P.routes.forEach(function (r, i) {
        var a = O[r.who]; if (!a) return;
        var pts = [a].concat(r.pts);
        var dim = isRun();
        line(pts, dim ? 'rgba(36,86,168,.45)' : '#2456a8', 3);
        arrow(pts[pts.length - 2], pts[pts.length - 1], dim ? 'rgba(36,86,168,.45)' : '#2456a8');
        var m = pts[1], dx = m[0] - a[0], dy = m[1] - a[1], L = len(dx, dy) || 1;
        badge(sx(a[0] + dx / L * 1.3), sy(a[1] + dy / L * 1.3), String(i + 1), '#2456a8', '#fff');
      });
      if (isRun()) {
        var c = O[P.handoff.to], q = O.QB;
        if (P.handoff.to !== 'QB') line([q, c], '#2f9e57', 2.5, [5, 5]);
        var path = [c].concat(P.handoff.path || []);
        if (path.length > 1) { line(path, '#2f9e57', 5); arrow(path[path.length - 2], path[path.length - 1], '#2f9e57'); }
      }
      /* targets */
      /* each mark sits beside the end of its route, on whichever side is
         clearest of every other route, player and mark */
      var taken = [];
      var segs = [];
      P.routes.forEach(function (r) { var pts = [O[r.who]].concat(r.pts); for (var k = 1; k < pts.length; k++) segs.push([pts[k - 1], pts[k], r.who]); });
      var segDist = function (p, a, b) {
        var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1);
        return len(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
      };
      P.targets.forEach(function (id, i) {
        var r = routeOf(id); if (!r) return;
        var e = r.pts[r.pts.length - 1], best = null, bs = -1;
        for (var k = 0; k < 8; k++) {
          var ang = k * Math.PI / 4, c = [e[0] + Math.cos(ang) * 1.3, e[1] + Math.sin(ang) * 1.3], m = 1e9;
          segs.forEach(function (sg) { m = Math.min(m, segDist(c, sg[0], sg[1]) * (sg[2] === id ? 1.6 : 1)); });
          Object.keys(O).forEach(function (pid) { m = Math.min(m, len(O[pid][0] - c[0], O[pid][1] - c[1]) - 0.4); });
          taken.forEach(function (q) { m = Math.min(m, len(q[0] - c[0], q[1] - c[1]) - 0.5); });
          if (c[0] < X0 + 0.6 || c[0] > X1 - 0.6 || c[1] > ytop - 0.6) m -= 5;
          if (m > bs) { bs = m; best = c; }
        }
        taken.push(best);
        if (i === 0) star(sx(best[0]), sy(best[1]), S * 0.85, '#ffd23f');
        else badge(sx(best[0]), sy(best[1]), '2', '#ffd23f', '#3a2a00');
      });

      /* the line to gain's label: on a little card just above or below the
         line, wherever along it is clearest of X's, routes and players.
         Drawn after the routes so nothing crosses it. */
      var label = fd >= goal ? 'goal line' : 'line to gain';
      ctx.font = Math.round(S * 0.85) + 'px "Permanent Marker", cursive';
      var lw = ctx.measureText(label).width / S + 0.8, lh = 1.2, lb = null, ls = -1;
      [X1 - 0.3 - lw, X0 + 0.3, -lw / 2, 8 - lw / 2, -8 - lw / 2].forEach(function (x0) {
        [fd + 0.3, fd - 0.3 - lh].forEach(function (y0) {
          var m = 1e9;
          var inBox = function (q) { var dx = Math.max(x0 - q[0], 0, q[0] - (x0 + lw)), dy = Math.max(y0 - q[1], 0, q[1] - (y0 + lh)); return len(dx, dy); };
          D.forEach(function (d) { m = Math.min(m, inBox(d.at)); });
          Object.keys(O).forEach(function (pid) { m = Math.min(m, inBox(O[pid])); });
          segs.forEach(function (sg) { for (var k = 0; k <= 10; k++) { var t = k / 10; m = Math.min(m, inBox([sg[0][0] + (sg[1][0] - sg[0][0]) * t, sg[0][1] + (sg[1][1] - sg[0][1]) * t])); } });
          taken.forEach(function (q) { m = Math.min(m, inBox(q)); });
          if (m > ls + 0.01) { ls = m; lb = [x0, y0]; }
        });
      });
      ctx.fillStyle = 'rgba(246,244,238,.94)'; ctx.fillRect(sx(lb[0]), sy(lb[1] + lh), lw * S, lh * S);
      ctx.fillStyle = '#b37800'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, sx(lb[0] + 0.4), sy(lb[1] + lh / 2));

      /* the offense */
      FM.LINEMEN.forEach(function (id) {
        var a = O[id], x = sx(a[0]), y3 = sy(a[1]), r = S * 0.6;
        ctx.fillStyle = '#dcd7cc'; ctx.strokeStyle = '#6b6f78'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(x - r, y3 - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
      });
      FM.EDITABLE.forEach(function (id) {
        var a = O[id], x = sx(a[0]), y4 = sy(a[1]), r = S * 0.95;
        var hot = (drag && drag.who === id) || (armed && id === 'QB') || (isRun() && P.handoff.to === id);
        ctx.fillStyle = hot ? '#ffd23f' : '#fff'; ctx.strokeStyle = '#1d2633'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y4, r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1d2633'; ctx.font = '800 ' + Math.round(S * 0.95) + 'px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(LABEL[id], x, y4 + 0.5);
      });
      /* the ball */
      ctx.fillStyle = '#8a4b22'; ctx.beginPath(); ctx.ellipse(sx(0), sy(-0.2), S * 0.32, S * 0.48, 0, 0, 7); ctx.fill();
      /* the line being drawn right now */
      if (drag && drag.pts && drag.pts.length > 1) line(drag.pts, drag.kind === 'block' ? '#1d2633' : drag.kind === 'path' ? '#2f9e57' : '#2456a8', 3, [6, 5]);
    }

    /* ---------- touching it ---------- */

    function hit(p, ids) {
      var O = pos(), best = null, bd = 1.7;
      ids.forEach(function (id) { var a = O[id], d = len(a[0] - p[0], a[1] - p[1]); if (d < bd) { bd = d; best = id; } });
      return best;
    }
    function routeEndNear(p) {
      for (var i = 0; i < P.routes.length; i++) { var r = P.routes[i], e = r.pts[r.pts.length - 1]; if (len(e[0] - p[0], e[1] - p[1]) < 1.5) return r.who; }
      if (isRun() && P.handoff.path && P.handoff.path.length) { var e2 = P.handoff.path[P.handoff.path.length - 1]; if (len(e2[0] - p[0], e2[1] - p[1]) < 1.5) return '#path'; }
      return null;
    }
    function clampPt(p) { return [clamp(p[0], -25.5, 25.5), clamp(p[1], -12, 50)]; }

    function down(ev) {
      if (drag) return;
      var p = toYd(ev.clientX, ev.clientY), who = hit(p, FM.EDITABLE);
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      drag = { id: ev.pointerId, start: p, who: who, kind: null, pts: null, t0: Date.now(), moved: false, timer: null };
      if (who) drag.timer = setTimeout(function () { if (drag && !drag.moved) { drag.kind = 'move'; save(); hint('Move him, then let go.'); draw(); } }, HOLD_MS);
      ev.preventDefault();
    }
    function move(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      var p = toYd(ev.clientX, ev.clientY), far = len(p[0] - drag.start[0], p[1] - drag.start[1]) * S;
      if (!drag.moved && far > 6) {
        drag.moved = true; clearTimeout(drag.timer);
        if (!drag.kind) begin(p);
      }
      if (drag.kind === 'move') {
        var O = pos(), np = [clamp(p[0], -24, 24), Math.min(-0.6, Math.max(-11, p[1]))];
        var clash = Object.keys(O).some(function (id) { return id !== drag.who && len(O[id][0] - np[0], O[id][1] - np[1]) < 1.5; });
        if (!clash) {
          var old = O[drag.who], dx = np[0] - old[0], dy = np[1] - old[1];
          P.moved[drag.who] = np;
          var r = routeOf(drag.who); if (r) r.pts = r.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
          var b = blockOf(drag.who); if (b) b.to = [b.to[0] + dx, b.to[1] + dy];
          if (isRun() && P.handoff.to === drag.who) P.handoff.path = P.handoff.path.map(function (q) { return [q[0] + dx, q[1] + dy]; });
        }
        draw(); return;
      }
      if (drag.pts) {
        var last = drag.pts[drag.pts.length - 1], q2 = clampPt(p);
        if (len(q2[0] - last[0], q2[1] - last[1]) > 0.35) drag.pts.push(q2);
        draw();
      }
    }
    /* What a drag means, decided once it starts moving. */
    function begin(p) {
      var O = pos();
      if (tool === 'route' || tool === 'handoff') {
        var endOf = routeEndNear(drag.start);
        var carrier = isRun() ? P.handoff.to : null;
        if (drag.who && drag.who === carrier) { drag.kind = 'path'; drag.extend = false; drag.pts = [O[drag.who]]; return; }
        if (!drag.who && endOf === '#path') { drag.kind = 'path'; drag.extend = true; drag.pts = [P.handoff.path[P.handoff.path.length - 1]]; return; }
        if (tool === 'handoff') return;
        if (drag.who && drag.who !== 'QB') { drag.kind = 'route'; drag.extend = false; drag.pts = [O[drag.who]]; return; }
        if (!drag.who && endOf) { drag.who = endOf; drag.kind = 'route'; drag.extend = true; var r = routeOf(endOf); drag.pts = [r.pts[r.pts.length - 1]]; return; }
      }
      if (tool === 'block' && drag.who && drag.who !== 'QB') { drag.kind = 'block'; drag.pts = [O[drag.who]]; return; }
    }
    function up(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      clearTimeout(drag.timer);
      var d = drag; drag = null;
      if (d.kind === 'move') { hint(); changed(); return; }
      if (!d.moved) { tap(d.who, d.start); return; }
      if (!d.pts || d.pts.length < 2) { draw(); return; }
      var pts = simplify(d.pts, 0.8).slice(1);
      var total = 0, prev = d.pts[0]; pts.forEach(function (q) { total += len(q[0] - prev[0], q[1] - prev[1]); prev = q; });
      if (total < 1.2) { draw(); return; }
      save();
      if (d.kind === 'route') {
        var r = routeOf(d.who);
        P.blocks = P.blocks.filter(function (b) { return b.who !== d.who; });
        if (d.extend && r) r.pts = r.pts.concat(pts).slice(0, 8);
        else { P.routes = P.routes.filter(function (x) { return x.who !== d.who; }); P.routes.push({ who: d.who, pts: pts.slice(0, 6) }); }
        hint(P.targets.length || isRun() ? '' : 'Now pick a Target: who does the QB look to first?');
      } else if (d.kind === 'path') {
        P.handoff.path = d.extend ? P.handoff.path.concat(pts).slice(0, 8) : pts.slice(0, 6);
        hint('Snap it when you are ready.');
      } else if (d.kind === 'block') {
        var a = d.pts[0], e = d.pts[d.pts.length - 1], dx = e[0] - a[0], dy = e[1] - a[1], L = len(dx, dy), k = L > 3.5 ? 3.5 / L : 1;
        P.blocks = P.blocks.filter(function (b) { return b.who !== d.who; });
        P.routes = P.routes.filter(function (x) { return x.who !== d.who; });
        P.targets = P.targets.filter(function (x) { return x !== d.who; });
        P.blocks.push({ who: d.who, to: [a[0] + dx * k, a[1] + dy * k] });
      }
      changed();
    }
    function tap(who, p) {
      if (tool === 'handoff') {
        if (!armed && who === 'QB') { armed = true; hint('Now tap the back who gets it. Tap the QB again to keep it.'); draw(); return; }
        if (armed && who) {
          save(); armed = false;
          var O = pos(), at = O[who];
          P.handoff = { to: who, path: [[at[0], Math.max(4, at[1] + 6)]] };
          P.targets = [];
          P.blocks = P.blocks.filter(function (b) { return b.who !== who; });
          P.routes = P.routes.filter(function (r) { return r.who !== who; });
          hint('It is a run. Drag from ' + (who === 'QB' ? 'the QB' : 'him') + ' to draw the path.');
          changed(); return;
        }
        if (!armed && who && isRun() && P.handoff.to === who) { save(); P.handoff = null; hint('Back to a pass.'); changed(); return; }
        armed = false; hint('Tap the QB first.'); draw(); return;
      }
      if (tool === 'target') {
        if (isRun()) { hint('A run has no target.'); return; }
        if (!who || who === 'QB') return;
        if (!routeOf(who)) { hint('Draw him a route first.'); return; }
        save();
        var i = P.targets.indexOf(who);
        if (i === 0) P.targets.shift();
        else if (i === 1) P.targets.splice(1, 1);
        else if (!P.targets.length) P.targets = [who];
        else P.targets = [P.targets[0], who];
        hint(P.targets.length === 1 ? 'Tap another for the checkdown, if you want one.' : P.targets.length === 2 ? 'Snap it when you are ready.' : '');
        changed(); return;
      }
      if (who && tool === 'route') hint(who === 'QB' ? 'The QB throws. Use Handoff to make it a run.' : 'Drag from him to draw his route.');
      if (who && tool === 'block') hint('Drag a short bar from him.');
    }
    function hint(t) { opt.onHint && opt.onHint(t == null ? defaultHint() : t); }
    function defaultHint() {
      return { route: 'Drag from a receiver to draw his route.', block: 'Drag a short bar from a receiver or back.', handoff: 'Tap the QB, then a back.', target: isRun() ? 'A run has no target.' : 'Tap who the QB looks to first.' }[tool];
    }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', function (ev) { if (drag && ev.pointerId === drag.id) { clearTimeout(drag.timer); drag = null; draw(); } });
    root.addEventListener('resize', layout);
    root.addEventListener('rtg-sticky', layout);   // the bottom ad filled, changed height or closed

    return {
      layout: layout, draw: draw,
      play: function () { return copy(P); },
      setPlay: function (p) { P = copy(p); armed = false; changed(); },
      setFormation: function (id) { if (id === P.formation) return; save(); P = emptyPlay(id); armed = false; changed(); },
      setTool: function (t) { tool = t; armed = false; hint(); draw(); },
      tool: function () { return tool; },
      undo: function () { if (!undo.length) return false; P = JSON.parse(undo.pop()); armed = false; changed(); return true; },
      clear: function () { save(); var f = P.formation, m = P.moved, cf = P.customFormation; P = emptyPlay(f); P.moved = m; if (cf) P.customFormation = cf; armed = false; hint(); changed(); },
      isRun: isRun,
      ready: function () { return isRun() ? true : P.targets.length > 0; },
      box: function () { return FM.boxCount(defense()); },
      /* for the checks: drive the board in yards, as a finger would */
      toScreen: function (p) { var r = canvas.getBoundingClientRect(); return [r.left + sx(p[0]), r.top + sy(p[1])]; },
      positions: pos
    };
  }

  root.FAW_BOARD = { create: create, emptyPlay: emptyPlay, simplify: simplify, LABEL: LABEL };
})(typeof window !== 'undefined' ? window : this);
