/* 4th and What: the home screen's clipboard.
 *
 * A whiteboard on a clipboard, where a few plays draw themselves in marker
 * one after another, each one named the way the playbook names it
 * (FAW_NAMES.suggest with a coach's sample words). It shows both halves of the
 * page at once: draw a play and run it, then keep it in your own words.
 *
 * Decoration only: it reads no saves and runs no sim. It draws while the home
 * screen is showing and the tab is visible, and holds one finished play when
 * the player asks for less motion.
 *
 * Plain script: window.FAW_HOME.
 */
(function (root) {
  'use strict';
  var FM = root.FAW_FORMATIONS, NM = root.FAW_NAMES;

  /* A coach's sample words, so the names read like a real call. */
  var TERMS = { concepts: [{ types: ['slant', 'flat'], word: 'Snag' }, { types: ['go', 'seam'], word: 'Verts' }] };
  var PLAYS = [
    { formation: 'gun3x1', moved: {}, blocks: [], handoff: null, targets: ['WR1'],
      routes: [{ who: 'WR1', pts: [[-13.5, 1.5], [-9.5, 5.5]] }, { who: 'SLOT', pts: [[-9.5, 1], [-13.5, 3]] },
        { who: 'TE', pts: [[-6.2, 6], [3, 6.5]] }, { who: 'WR2', pts: [[13.5, 12], [12.5, 10]] }] },
    { formation: 'gun2x2', moved: {}, blocks: [], handoff: null, targets: ['SLOT'],
      routes: [{ who: 'WR1', pts: [[-13.5, 13]] }, { who: 'SLOT', pts: [[-8.5, 13]] }, { who: 'TE', pts: [[8.5, 13]] }, { who: 'WR2', pts: [[13.5, 13]] }] },
    { formation: 'gun2x2', moved: {}, routes: [], targets: [],
      blocks: [{ who: 'LT', to: [-3.6, 1.4] }, { who: 'LG', to: [-1.6, 1.4] }, { who: 'C', to: [0.4, 1.4] }, { who: 'RG', to: [2.4, 1.4] }, { who: 'RT', to: [4.6, 1.4] }],
      handoff: { to: 'RB', path: [[-0.4, -3.6], [2.8, 0.2], [3.2, 8]] } }
  ];
  var X0 = -16, X1 = 16, Y0 = -7, Y1 = 14;
  var BLUE = '#2456a8', RED = '#c8392a', INK = '#1d2633', GREEN = '#2f9e57', GOLD = '#e3a21a';
  /* the timeline of one play, in seconds */
  var T_SET = 0.7, T_ROUTE = 0.6, T_NAME = 0.7, T_HOLD = 2.4, T_WIPE = 0.5;

  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { t = clamp(t); return t * (2 - t); }

  /* What one play draws, in order: each stroke is a polyline in yards. */
  function strokes(play) {
    var O = FM.place(play.formation, play.moved), out = [];
    (play.blocks || []).forEach(function (b) { if (O[b.who]) out.push({ pts: [O[b.who], b.to], col: INK, w: 2.5, block: true }); });
    (play.routes || []).forEach(function (r) { if (O[r.who]) out.push({ pts: [O[r.who]].concat(r.pts), col: BLUE, w: 3, arrow: true }); });
    if (play.handoff && play.handoff.to) out.push({ pts: [O[play.handoff.to]].concat(play.handoff.path), col: GREEN, w: 4.5, arrow: true });
    return { O: O, D: FM.defense(play.formation, play.moved, 5), list: out, name: NM.suggest(play, TERMS).name };
  }

  function create(canvas, nameEl, isShown) {
    var ctx = canvas.getContext('2d'), W = 0, H = 0, S = 1, DPR = 1, ox = 0, oy = 0;
    var cache = PLAYS.map(strokes), idx = 0, t0 = 0, raf = 0;
    var still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function layout() {
      var r = canvas.getBoundingClientRect(); if (!r.width) return false;
      DPR = Math.min(root.devicePixelRatio || 1, 2); W = r.width; H = r.height;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      S = Math.min(W / (X1 - X0), H / (Y1 - Y0)); ox = (W - (X1 - X0) * S) / 2; oy = (H - (Y1 - Y0) * S) / 2;
      return true;
    }
    function sx(x) { return ox + (x - X0) * S; }
    function sy(y) { return oy + (Y1 - y) * S; }
    function pen(col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }

    /* a polyline drawn to fraction f of its length; returns the pen's last segment */
    function partial(pts, f) {
      var total = 0, i, segs = [];
      for (i = 1; i < pts.length; i++) { var l = len(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
      var left = total * f, a = pts[0], b = pts[0];
      ctx.beginPath(); ctx.moveTo(sx(a[0]), sy(a[1]));
      for (i = 1; i < pts.length && left > 0; i++) {
        var k = Math.min(1, left / (segs[i - 1] || 1));
        a = pts[i - 1]; b = [a[0] + (pts[i][0] - a[0]) * k, a[1] + (pts[i][1] - a[1]) * k];
        ctx.lineTo(sx(b[0]), sy(b[1])); left -= segs[i - 1];
      }
      ctx.stroke();
      return [a, b];
    }
    function arrow(a, b, col) {
      var dx = sx(b[0]) - sx(a[0]), dy = sy(b[1]) - sy(a[1]), L = len(dx, dy); if (L < 1) return;
      var ux = dx / L, uy = dy / L, s = S * 0.9;
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(sx(b[0]) + ux * s * 0.4, sy(b[1]) + uy * s * 0.4);
      ctx.lineTo(sx(b[0]) - ux * s * 0.6 - uy * s * 0.5, sy(b[1]) - uy * s * 0.6 + ux * s * 0.5);
      ctx.lineTo(sx(b[0]) - ux * s * 0.6 + uy * s * 0.5, sy(b[1]) - uy * s * 0.6 - ux * s * 0.5);
      ctx.closePath(); ctx.fill();
    }

    function frame(t) {
      var p = cache[idx], n = p.list.length;
      var tDraw = T_SET + n * T_ROUTE, tName = tDraw + T_NAME, tEnd = tName + T_HOLD, tAll = tEnd + T_WIPE;
      if (still) t = tEnd;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      /* the board's own lines: the line of scrimmage, the line to gain, faint hashes */
      for (var y = -5; y <= Y1; y += 5) { pen('rgba(60,90,140,.18)', 1); ctx.beginPath(); ctx.moveTo(0, sy(y)); ctx.lineTo(W, sy(y)); ctx.stroke(); }
      pen('rgba(42,111,214,.75)', 3); ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(W, sy(0)); ctx.stroke();
      pen(GOLD, 3); ctx.beginPath(); ctx.moveTo(0, sy(5)); ctx.lineTo(W, sy(5)); ctx.stroke();

      var set = ease(t / T_SET), r = S * 0.62;
      /* the defense, in red X's */
      ctx.globalAlpha = set;
      p.D.forEach(function (d) {
        var x = sx(d.at[0]), yy = sy(d.at[1]), q = r * 0.75;
        pen(RED, 2.5); ctx.beginPath(); ctx.moveTo(x - q, yy - q); ctx.lineTo(x + q, yy + q); ctx.moveTo(x + q, yy - q); ctx.lineTo(x - q, yy + q); ctx.stroke();
      });
      /* the offense: boxes for the line, circles for everyone else */
      Object.keys(p.O).forEach(function (id) {
        var a = p.O[id], x = sx(a[0]), yy = sy(a[1]);
        ctx.fillStyle = '#fff'; pen(INK, 2.5); ctx.beginPath();
        if (FM.LINEMEN.indexOf(id) >= 0) ctx.rect(x - r, yy - r, r * 2, r * 2); else ctx.arc(x, yy, r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      /* the strokes, one after another */
      p.list.forEach(function (s, i) {
        var f = ease((t - T_SET - i * T_ROUTE) / T_ROUTE); if (f <= 0) return;
        pen(s.col, s.w); var seg = partial(s.pts, f);
        if (f < 1) return;
        if (s.arrow) arrow(seg[0], seg[1], s.col);
        if (s.block) {
          var a = s.pts[0], b = s.pts[1], dx = b[0] - a[0], dy = b[1] - a[1], L = len(dx, dy) || 1;
          pen(s.col, 3.5); ctx.beginPath(); ctx.moveTo(sx(b[0] - dy / L * 0.7), sy(b[1] + dx / L * 0.7)); ctx.lineTo(sx(b[0] + dy / L * 0.7), sy(b[1] - dx / L * 0.7)); ctx.stroke();
        }
      });
      /* the name, written out left to right */
      var nf = clamp((t - tDraw) / T_NAME);
      if (nameEl.textContent !== p.name) {
        /* a long name shrinks to fit the board's width on one line */
        nameEl.textContent = p.name; nameEl.style.fontSize = '';
        var fs = parseFloat(root.getComputedStyle(nameEl).fontSize);
        while (nameEl.scrollWidth > nameEl.clientWidth && fs > 12) { fs -= 1; nameEl.style.fontSize = fs + 'px'; }
      }
      nameEl.style.clipPath = 'inset(0 ' + Math.round((1 - nf) * 100) + '% 0 0)';
      /* the eraser: the board wipes clean, then the next play */
      var wf = clamp((t - tEnd) / T_WIPE);
      if (wf > 0) { ctx.fillStyle = '#f6f4ee'; ctx.fillRect(0, 0, W * ease(wf), H); nameEl.style.opacity = String(1 - wf); }
      else nameEl.style.opacity = '1';
      return t >= tAll;
    }

    function tick(now) {
      raf = 0;
      if (!isShown() || document.hidden) { t0 = 0; return; }
      if (!W && !layout()) { raf = root.requestAnimationFrame(tick); return; }
      if (!t0) t0 = now;
      if (frame((now - t0) / 1000)) { idx = (idx + 1) % cache.length; t0 = now; }
      if (!still) raf = root.requestAnimationFrame(tick);
    }
    function start() { if (!raf) { t0 = 0; raf = root.requestAnimationFrame(tick); } }
    root.addEventListener('resize', function () { W = 0; nameEl.textContent = ''; start(); });
    document.addEventListener('visibilitychange', start);
    /* the marker font arrives late, and is wider than its stand in: fit again */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { nameEl.textContent = ''; start(); });
    return { start: start };
  }

  root.FAW_HOME = { create: create, PLAYS: PLAYS };
})(window);
