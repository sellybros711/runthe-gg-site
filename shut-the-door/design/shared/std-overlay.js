/* Shut The Door design mockups: what is drawn over the render. MOCKUP CODE, never loaded by the game.

   The 5x5 grid is placed in 3D at the front of the plate (contract section 2: catcher's view in
   the data) and projected through the same camera as the render, so the pitcher's view mirror
   comes from the projection itself. The tracer is the pitch's real flight under its pack
   movement, projected the same way. One global, STD_OV. */
(function () {
  'use strict';
  const T = window.STD3D, SC = window.STD_SCENE;

  function stage(host, o) {
    const w = o.w || host.clientWidth, h = o.h || host.clientHeight;
    const c3 = document.createElement('canvas'), c2 = document.createElement('canvas');
    c3.className = 'r3d'; c2.className = 'r2d';
    host.appendChild(c3); host.appendChild(c2);
    const dpr = o.dpr || window.devicePixelRatio || 1;
    c2.width = Math.round(w * dpr); c2.height = Math.round(h * dpr); c2.style.width = w + 'px'; c2.style.height = h + 'px';
    const r = SC.renderView(c3, Object.assign({}, o, { w, h, dpr }));
    const g = c2.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let gp = null, cp = null;
    if (o.pixelOverlay) {
      // a second overlay at the render's own cell size, upscaled nearest: lines drawn here are pixel art
      cp = document.createElement('canvas'); cp.className = 'r2d px';
      cp.width = Math.round(w * o.res); cp.height = Math.round(h * o.res);
      cp.style.width = w + 'px'; cp.style.height = h + 'px'; cp.style.imageRendering = 'pixelated';
      host.insertBefore(cp, c2);
      gp = cp.getContext('2d'); gp.setTransform(o.res, 0, 0, o.res, 0, 0);
    }
    const crisp = () => {
      // threshold the pixel overlay's alpha so every pixel is on or off, never a soft edge
      if (!gp) return; const id = gp.getImageData(0, 0, cp.width, cp.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 110) d[i + 3] = 0; else d[i + 3] = 255; }
      gp.putImageData(id, 0, 0);
    };
    return { cam: r.cam, g, gp, crisp, w, h };
  }

  /* cell quad on screen: four projected corners of cell (r, c) at the front of the plate */
  function cellQuad(cam, cell, b) {
    const G = SC.gridCorners(b), r = Math.floor(cell / 5), c = cell % 5;
    const x0 = G.x0 + c * G.cw, x1 = x0 + G.cw, zt = G.z1 - r * G.rh, zb = zt - G.rh;
    return [[x0, 0, zt], [x1, 0, zt], [x1, 0, zb], [x0, 0, zb]].map((p) => cam.project(p));
  }
  function quadPath(g, q, inset) {
    let pts = q;
    if (inset) { const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2; pts = q.map((p) => [p[0] + (cx - p[0]) * inset, p[1] + (cy - p[1]) * inset]); }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath();
  }
  function gridBox(cam, b) {
    const G = SC.gridCorners(b);
    const P = (x, z) => cam.project([x, 0, z]);
    return { outer: [P(G.x0, G.z1), P(G.x1, G.z1), P(G.x1, G.z0), P(G.x0, G.z0)], zone: [P(G.zx0, G.zz1), P(G.zx1, G.zz1), P(G.zx1, G.zz0), P(G.zx0, G.zz0)] };
  }

  /* The grid. st: { chase, chaseW, zone, zoneW, cells: fn(g, quad, cell, inZone), sel, selStyle(g, quad), heat, heatColor } */
  function drawGrid(g, cam, st, b) {
    const B = gridBox(cam, b);
    for (let cell = 0; cell < 25; cell++) {
      const r = Math.floor(cell / 5), c = cell % 5, inZ = r >= 1 && r <= 3 && c >= 1 && c <= 3;
      const q = cellQuad(cam, cell, b);
      if (st.heat) { quadPath(g, q, st.heatInset || 0); g.fillStyle = st.heatColor(st.heat[cell]); g.fill(); }
      if (st.cell) st.cell(g, q, cell, inZ);
    }
    if (st.chase) {
      g.save(); g.strokeStyle = st.chase; g.lineWidth = st.chaseW || 1; if (st.dash) g.setLineDash(st.dash);
      for (let cell = 0; cell < 25; cell++) { quadPath(g, cellQuad(cam, cell, b)); g.stroke(); }
      g.restore();
    }
    if (st.zone) { g.save(); g.strokeStyle = st.zone; g.lineWidth = st.zoneW || 2; if (st.zoneShadow) { g.shadowColor = st.zoneShadow; g.shadowBlur = 6; } quadPath(g, B.zone); g.stroke(); g.restore(); }
    if (st.sel != null && st.selStyle) st.selStyle(g, cellQuad(cam, st.sel, b), st.sel);
    return B;
  }

  /* The pitch: positions in feet, the spinless path, and where it was aimed. */
  function pitch() {
    const F = window.STD_FIG;
    const rp = F.build('pitcher', SC.KITS.pitcher, { pos: [0, 60.5, 0.83], fwd: [0, -1] }, 'release');
    const hand = rp.B.wrR, rel = [hand[0] - 0.05, hand[1] - 0.25, hand[2] + 0.05];
    const aimed = SC.cellPoint(21), actualCell = 16, a0 = SC.cellPoint(actualCell);
    const actual = [a0[0] + 0.1, 0, a0[2] - 0.12];
    const P = T.pitchPath(rel, actual, 77.9, 12.9, -16.1, 60);
    return { rel, aimed, actual, actualCell, aimedCell: 21, pts: P.pts, spinless: P.spinless, T: P.T };
  }
  const FRAME_K = { release: 24, mid: 41, arrive: 60 };

  function drawPath(g, cam, pts, k0, k1, fn) {
    const sp = pts.slice(k0, k1 + 1).map((p) => cam.project(p));
    fn(sp);
    return sp;
  }
  function ballAt(g, cam, p, st) {
    const s = cam.project(p), r = Math.max(2.2, 0.121 * cam.scaleAt(p)) * (st.grow || 1.4);
    if (st.blur && st.prev) {
      const q = cam.project(st.prev); g.save(); g.strokeStyle = st.blur; g.lineCap = 'round'; g.lineWidth = r * 1.8; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(s[0], s[1]); g.stroke(); g.restore();
    }
    if (st.glow) { g.save(); g.shadowColor = st.glow; g.shadowBlur = r * 3; g.fillStyle = st.fill || '#fff'; g.beginPath(); g.arc(s[0], s[1], r, 0, 7); g.fill(); g.restore(); }
    const gr = g.createRadialGradient(s[0] - r * 0.35, s[1] - r * 0.4, r * 0.1, s[0], s[1], r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, st.fill || '#f1efe8'); gr.addColorStop(1, st.edge || '#b9b3a6');
    g.fillStyle = gr; g.beginPath(); g.arc(s[0], s[1], r, 0, 7); g.fill();
    if (st.seam) { g.strokeStyle = st.seam; g.lineWidth = Math.max(0.8, r * 0.16); g.beginPath(); g.arc(s[0] - r * 0.9, s[1], r * 0.75, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(s[0] + r * 0.9, s[1], r * 0.75, Math.PI - 0.9, Math.PI + 0.9); g.stroke(); }
    return { s, r };
  }

  /* A movement glyph for a pitch button, in the pitcher's view: the induced break as a curve.
     pfxX is catcher's view, so the pitcher sees it mirrored. Returns SVG markup. */
  function glyph(p, o) {
    o = o || {}; const W = o.size || 34, c = W / 2, k = (o.scale || 0.62);
    const dx = -p.pfxX * k, dz = -p.pfxZ * k;          // screen: right is +, down is +
    const ex = c + dx * 0.9, ey = c + dz * 0.9;
    const sx = c - dx * 0.25, sy = c - dz * 0.25 - 4;
    const mx = sx + (ex - sx) * 0.2, my = sy + (ey - sy) * 0.15 - 1;
    const col = o.color || 'currentColor';
    return `<svg viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" aria-hidden="true"><path d="M${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${o.w || 2}" stroke-linecap="round" ${o.dash ? 'stroke-dasharray="' + o.dash + '"' : ''}/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${o.r || 3.2}" fill="${col}"/></svg>`;
  }

  /* A small 5x5 mini grid for cards (pitcher's view: columns mirrored). marks: [{cell, kind}] */
  function miniGrid(marks, o) {
    o = o || {}; const s = o.cell || 16, gap = o.gap || 2, W = 5 * s + 4 * gap;
    let out = `<svg viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" aria-hidden="true">`;
    for (let cell = 0; cell < 25; cell++) {
      const r = Math.floor(cell / 5), c = 4 - (cell % 5); // pitcher's view: mirror the column
      const inZ = r >= 1 && r <= 3 && cell % 5 >= 1 && cell % 5 <= 3;
      const m = (marks || []).find((x) => x.cell === cell);
      const fill = m ? m.fill : inZ ? o.zone : o.chase;
      out += `<rect x="${c * (s + gap)}" y="${r * (s + gap)}" width="${s}" height="${s}" rx="${o.rx == null ? 2 : o.rx}" fill="${fill}" ${m && m.stroke ? `stroke="${m.stroke}" stroke-width="2"` : ''}/>`;
      if (m && m.label) out += `<text x="${c * (s + gap) + s / 2}" y="${r * (s + gap) + s / 2 + 4}" text-anchor="middle" font-size="${s * 0.55}" font-weight="700" fill="${m.labelColor || '#fff'}" font-family="${o.font || 'Inter, sans-serif'}">${m.label}</text>`;
    }
    return out + '</svg>';
  }

  /* a small label on a pill, for markers on the stage */
  function tag(g, x, y, text, o) {
    o = o || {}; g.save(); g.font = o.font || '600 10px Inter, sans-serif';
    const w = g.measureText(text).width + 12, h = o.h || 17;
    const x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    g.fillStyle = o.bg || 'rgba(0,0,0,0.7)'; g.beginPath(); g.roundRect(x0, y - h / 2, w, h, o.r == null ? h / 2 : o.r); g.fill();
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = 1; g.stroke(); }
    g.fillStyle = o.color || '#fff'; g.textBaseline = 'middle'; g.fillText(text, x0 + 6, y + 0.5); g.restore();
  }
  window.STD_OV = { tag, stage, cellQuad, quadPath, gridBox, drawGrid, pitch, FRAME_K, drawPath, ballAt, glyph, miniGrid };
})();
