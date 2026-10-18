/* Runs inside the lab page (injected by check-deform.mjs). Poses the people frame by frame and
   measures, with CPU skinning (SkinnedMesh.getVertexPosition):
     stretch   every body edge's length over its rest length (worst high and low)
     collar    how far the shirt's collar ring moves away from the skin under it (metres)
     joints    each spine, neck and head joint's twist (about its own axis) and swing, degrees,
               against anatomical limits
   Returns the worst value of each, with the frame and bone. */
window.__deformProbe = (opts) => {
  const L = window.__lab, T = L.THREE;
  const LIMITS = {
    spine_01: { twist: 15, swing: 30 }, spine_02: { twist: 15, swing: 30 }, spine_03: { twist: 15, swing: 30 },
    neck_01: { twist: 35, swing: 40 }, head: { twist: 30, swing: 30 }, neckhead: { twist: 70, swing: 70 },
  };
  const out = {};
  for (const who of opts.people) {
    const p = L.people[who];
    if (!p) continue;
    const body = p.meshes.find((m) => m.material.name === 'skin');
    const shirt = p.meshes.find((m) => (m.material.name || '').startsWith('male_casualsuit'));
    const geo = body.geometry, pos = geo.attributes.position, idx = geo.index;
    const n = pos.count;
    // the bind pose: put the bones back, read rest positions
    for (const [b, bp, bq] of p.bind) { b.position.copy(bp); b.quaternion.copy(bq); }
    p.root.updateMatrixWorld(true);
    const v = new T.Vector3();
    const rest = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld); rest[i * 3] = v.x; rest[i * 3 + 1] = v.y; rest[i * 3 + 2] = v.z; }
    const edges = new Set();
    for (let f = 0; f < idx.count; f += 3) {
      const a = idx.getX(f), b = idx.getX(f + 1), c = idx.getX(f + 2);
      for (const [x, y] of [[a, b], [b, c], [c, a]]) edges.add(x < y ? x * n + y : y * n + x);
    }
    let E = [...edges].map((k) => [Math.floor(k / n), k % n]);
    // what a viewer sees: skin that is not under a garment (more than 4.5 cm from any cloth vertex)
    // and the garments themselves. Skin kept under a collar or hem only to close the gap is hidden,
    // and is not judged.
    const cloths = p.meshes.filter((m) => m.isSkinnedMesh && m !== body && m.visible && /casualsuit|shoes/.test(m.material.name || ''));
    const clothPts = [];
    for (const m of cloths) { const cp = m.geometry.attributes.position; for (let i = 0; i < cp.count; i += 1) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); clothPts.push(v.x, v.y, v.z); } }
    const grid = new Map(), G = 0.05, key = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
    for (let i = 0; i < clothPts.length; i += 3) { const k = key(clothPts[i], clothPts[i + 1], clothPts[i + 2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
    const covered = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      let hit = false;
      for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) for (let dz = -1; dz <= 1 && !hit; dz++) {
        const l = grid.get(`${Math.floor(x / G) + dx},${Math.floor(y / G) + dy},${Math.floor(z / G) + dz}`);
        if (l) for (const j of l) if ((clothPts[j] - x) ** 2 + (clothPts[j + 1] - y) ** 2 + (clothPts[j + 2] - z) ** 2 < 0.045 ** 2) { hit = true; break; }
      }
      covered[i] = hit ? 1 : 0;
    }
    E = E.filter(([a, b]) => !(covered[a] && covered[b]));
    // the garments: every edge of each, with its own rest lengths
    const clothJ = cloths.map((m) => {
      const cpos = m.geometry.attributes.position, cidx = m.geometry.index, cn = cpos.count;
      const r = new Float32Array(cn * 3);
      for (let i = 0; i < cn; i++) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); r[i * 3] = v.x; r[i * 3 + 1] = v.y; r[i * 3 + 2] = v.z; }
      const es = new Set();
      for (let f = 0; f < cidx.count; f += 3) { const a = cidx.getX(f), b = cidx.getX(f + 1), c = cidx.getX(f + 2); for (const [x, y] of [[a, b], [b, c], [c, a]]) es.add(x < y ? x * cn + y : y * cn + x); }
      const ce = [...es].map((k) => [Math.floor(k / cn), k % cn]);
      return { m, cn, ce, len: ce.map(([a, b]) => Math.hypot(r[a * 3] - r[b * 3], r[a * 3 + 1] - r[b * 3 + 1], r[a * 3 + 2] - r[b * 3 + 2])) };
    });
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const boneOf = (i) => { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } return body.skeleton.bones[bi].name; };
    // hinge creases: skin shared by a joint's two bones (elbow, wrist, knee, finger knuckles).
    // The outside of a fully bent hinge stretches and its inside folds in real skin too, so these
    // edges have their own, wider limits; everything else must stay within 1.6x and 0.6x.
    const HINGE = [];
    for (const sd of ['l', 'r']) {
      HINGE.push([`upperarm_twist_${sd}`, `lowerarm_${sd}`], [`lowerarm_twist_${sd}`, `hand_${sd}`], [`thigh_${sd}`, `calf_${sd}`], [`calf_${sd}`, `foot_${sd}`], [`foot_${sd}`, `ball_${sd}`]);
    }
    HINGE.push(['neck_01', 'head']);   // the skull nods on the top of the neck like a hinge
    {
    }
    const bi = Object.fromEntries(body.skeleton.bones.map((b, k) => [b.name, k]));
    const wOn = (i, b) => { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi[b]) w += sw.getComponent(i, k); return w; };
    const inHinge = (i) => HINGE.some(([a, b]) => bi[a] !== undefined && bi[b] !== undefined && wOn(i, a) >= 0.15 && wOn(i, b) >= 0.15);
    const crease = E.map(([a, b]) => inHinge(a) || inHinge(b));
    // fingers: a gripping hand folds its knuckles flat; reported, not judged (at a phone's 30 px
    // a hand is a few pixels, and the batter's are on the bat)
    const FING = /^(index|middle|ring|pinky|thumb)_/;
    const fingerW = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (FING.test(body.skeleton.bones[si.getComponent(i, k)].name)) w += sw.getComponent(i, k); return w; };
    const finger = E.map(([a, b]) => fingerW(a) >= 0.15 || fingerW(b) >= 0.15);
    const restLen = E.map(([a, b]) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]));
    // main bone of each vertex, for the report
    // the collar: shirt vertices on open edges above the chest; each paired with its nearest skin vertex
    let collar = [];
    if (shirt) {
      const sp = shirt.geometry.attributes.position, sidx = shirt.geometry.index, sn = sp.count;
      const cnt = new Map();
      for (let f = 0; f < sidx.count; f += 3) {
        const a = sidx.getX(f), b = sidx.getX(f + 1), c = sidx.getX(f + 2);
        for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = x < y ? x * sn + y : y * sn + x; cnt.set(k, (cnt.get(k) || 0) + 1); }
      }
      const open = new Set();
      for (const [k, c] of cnt) if (c === 1) { open.add(Math.floor(k / sn)); open.add(k % sn); }
      // the neck opening only: open edges within 12 cm of the neck's axis (not the sleeves)
      const neck = new T.Vector3(); p.bones.neck_01.getWorldPosition(neck);
      for (const i of open) {
        shirt.getVertexPosition(i, v).applyMatrix4(shirt.matrixWorld);
        if (Math.hypot(v.x - neck.x, v.z - neck.z) > 0.12 || Math.abs(v.y - neck.y) > 0.15) continue;
        let best = -1, bd = 1e9;
        for (let j = 0; j < n; j++) { const d = (rest[j * 3] - v.x) ** 2 + (rest[j * 3 + 1] - v.y) ** 2 + (rest[j * 3 + 2] - v.z) ** 2; if (d < bd) { bd = d; best = j; } }
        collar.push([i, best, Math.sqrt(bd)]);
      }
    }
    // joint axes in the bind pose
    const axisOf = {};
    for (const name of ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head']) {
      const b = p.bones[name];
      const child = b.children.find((c) => c.isBone);
      axisOf[name] = child ? child.position.clone().normalize() : new T.Vector3(0, 1, 0);
    }
    const bindQ = new Map(p.bind.map(([b, , q]) => [b, q]));
    const twistSwing = (bone) => {
      const q = bindQ.get(bone).clone().invert().multiply(bone.quaternion);
      const ax = axisOf[bone.name];
      const pr = ax.clone().multiplyScalar(q.x * ax.x + q.y * ax.y + q.z * ax.z);
      const tw = new T.Quaternion(pr.x, pr.y, pr.z, q.w).normalize();
      const twist = 2 * Math.acos(Math.min(1, Math.abs(tw.w))) * 180 / Math.PI;
      const swq = q.clone().multiply(tw.clone().invert());
      const swing = 2 * Math.acos(Math.min(1, Math.abs(swq.w))) * 180 / Math.PI;
      return { twist, swing, signedTwist: Math.sign(pr.dot(ax) * (tw.w >= 0 ? 1 : -1)) * twist };
    };
    const worst = { stretch: { v: 1 }, squash: { v: 1 }, collar: { v: 0 }, joint: { v: 0 }, clothStretch: { v: 1 }, clothSquash: { v: 1 }, creaseStretch: { v: 1 }, creaseSquash: { v: 1 }, fingerStretch: { v: 1 }, fingerSquash: { v: 1 } };
    const series = [];
    for (let t = opts.t0; t <= opts.t1 + 1e-6; t += opts.dt) {
      L.poseAt(t);
      p.root.updateMatrixWorld(true);
      const now = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld); now[i * 3] = v.x; now[i * 3 + 1] = v.y; now[i * 3 + 2] = v.z; }
      let hi = 1, hiE = null, lo = 1, loE = null, chi2 = 1, chE = null, clo2 = 1, clE = null, fhi = 1, flo = 1;
      for (let k = 0; k < E.length; k++) {
        const [a, b] = E[k];
        if (restLen[k] < 1e-4) continue;
        const r = Math.hypot(now[a * 3] - now[b * 3], now[a * 3 + 1] - now[b * 3 + 1], now[a * 3 + 2] - now[b * 3 + 2]) / restLen[k];
        if (finger[k]) { if (r > fhi) fhi = r; if (r < flo) flo = r; continue; }
        if (crease[k]) { if (r > chi2) { chi2 = r; chE = k; } if (r < clo2) { clo2 = r; clE = k; } continue; }
        if (r > hi) { hi = r; hiE = k; }
        if (r < lo) { lo = r; loE = k; }
      }
      if (fhi > worst.fingerStretch.v) worst.fingerStretch = { v: fhi, t };
      if (flo < worst.fingerSquash.v) worst.fingerSquash = { v: flo, t };
      if (chi2 > worst.creaseStretch.v) worst.creaseStretch = { v: chi2, t, bone: boneOf(E[chE][0]) + '/' + boneOf(E[chE][1]) };
      if (clo2 < worst.creaseSquash.v) worst.creaseSquash = { v: clo2, t, bone: boneOf(E[clE][0]) + '/' + boneOf(E[clE][1]) };
      let chi = 1, clo = 1;
      for (const c of clothJ) {
        const cp = new Float32Array(c.cn * 3);
        for (let i = 0; i < c.cn; i++) { c.m.getVertexPosition(i, v).applyMatrix4(c.m.matrixWorld); cp[i * 3] = v.x; cp[i * 3 + 1] = v.y; cp[i * 3 + 2] = v.z; }
        for (let k = 0; k < c.ce.length; k++) {
          const [a, b] = c.ce[k];
          if (c.len[k] < 1e-4) continue;
          const r = Math.hypot(cp[a * 3] - cp[b * 3], cp[a * 3 + 1] - cp[b * 3 + 1], cp[a * 3 + 2] - cp[b * 3 + 2]) / c.len[k];
          if (r > chi) { chi = r; }
          if (r < clo) { clo = r; }
        }
      }
      if (chi > worst.clothStretch.v) worst.clothStretch = { v: chi, t };
      if (clo < worst.clothSquash.v) worst.clothSquash = { v: clo, t };
      const nameOf = (e) => (e == null ? '-' : typeof e === 'string' ? e : boneOf(E[e][0]) + '/' + boneOf(E[e][1]));
      if (hi > worst.stretch.v) worst.stretch = { v: hi, t, bone: nameOf(hiE) };
      if (lo < worst.squash.v) worst.squash = { v: lo, t, bone: nameOf(loE) };
      let gap = 0;
      for (const [si2, bj, d0] of collar) {
        shirt.getVertexPosition(si2, v).applyMatrix4(shirt.matrixWorld);
        const d = Math.hypot(v.x - now[bj * 3], v.y - now[bj * 3 + 1], v.z - now[bj * 3 + 2]) - d0;
        if (d > gap) gap = d;
      }
      if (gap > worst.collar.v) worst.collar = { v: gap, t };
      const js = {};
      let neckTw = 0, neckSw = 0;
      for (const name of ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head']) {
        const r = twistSwing(p.bones[name]);
        js[name] = r;
        const lim = LIMITS[name];
        const over = Math.max(r.twist / lim.twist, r.swing / lim.swing);
        if (over > worst.joint.v) worst.joint = { v: over, t, bone: name, twist: +r.twist.toFixed(1), swing: +r.swing.toFixed(1) };
        if (name === 'neck_01' || name === 'head') { neckTw += r.signedTwist; neckSw += r.swing; }
      }
      const oN = Math.max(Math.abs(neckTw) / LIMITS.neckhead.twist, neckSw / LIMITS.neckhead.swing);
      if (oN > worst.joint.v) worst.joint = { v: oN, t, bone: 'neck_01+head', twist: +neckTw.toFixed(1), swing: +neckSw.toFixed(1) };
      series.push([+t.toFixed(3), +hi.toFixed(2), +lo.toFixed(2), +gap.toFixed(3), +js.neck_01.twist.toFixed(0), +js.head.twist.toFixed(0), +js.spine_03.twist.toFixed(0)]);
    }
    out[who] = { worst, collarVerts: collar.length, edges: E.length, series: opts.series ? series : undefined };
  }
  return out;
};
