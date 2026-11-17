/* The glove hand stays in the glove: no finger of the hand a glove is on is ever drawn outside it, and
 * the bare hand keeps every finger.
 *
 *   node shut-the-door/lab/pipeline/check-mitt.mjs            every pack (the catcher), and a spread of fielders
 *   node shut-the-door/lab/pipeline/check-mitt.mjs --quick    one pack and a few plays of each kind
 *
 * Written after the owner's phone (2026-11-17): "we need to hide the catchers fingers that are
 * protruding thru the catchers mitt". The mitt is a pillow about 12 cm deep on the hand; the hand and
 * its curled fingers are thicker than its pocket, and the mitt takes the part of the glove's facing the
 * wrist does not (people.js catcherReach), so the bare fingers came out through its face. The glove
 * hand is now not drawn (people.js gloveHandOff, fielders.js figureMaterial). This plays the game's own
 * 3D mound (3d/stage.js) in headless Chromium, without drawing, and poses it frame by frame (10 a
 * second):
 *
 *   THE CATCHER (the set's, people.js) for the first left and the first right handed hitter of each pack:
 *   the setup crouch and the target, receiving and framing at every edge of the zone, the block of a
 *   ball in the dirt, the swing and the foul tip, the hit by pitch, his rise on a ball in play, and the
 *   life at the set (idle.js: the mitt worked at the wrist) over 20 s, which is his pose through the
 *   next hitter's walk up too (walkin.js moves the hitter alone). Each frame, every vertex of his skin
 *   that the glove hand's finger and thumb bones carry FINGER_W or more of, and that is still in a drawn
 *   triangle, must be inside the mitt (no more than TOL outside its surface, by a ray's crossings of the
 *   mitt's own mesh). And every triangle of his bare right hand is drawn.
 *   THE FIELDERS (fielders.js, the catcher among them on the broadcast) through a spread of the balls in
 *   play (inplay-cases.mjs), steals of second and third thrown down by the catcher, and pickoffs at every
 *   base: every figure on the field with a glove, each frame, every finger vertex of the glove hand the
 *   shader does not discard must be inside the glove (its ellipsoid, TOL); the bare hand's are all drawn.
 *
 * There is no throw back to the mound in the scene: the play ends with the ball in the mitt.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inplayCases } from './inplay-cases.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const QUICK = process.argv.includes('--quick');
const FINGER_W = 0.1, TOL = 0.003;

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/shut-the-door/`;

const packs = fs.readdirSync(path.join(ROOT, 'shut-the-door', 'data', 'packs')).filter((f) => f.endsWith('.json')).sort();
const browser = await loadPlaywright().chromium.launch(CHROME ? { executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(BASE);
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 400000 });
// the fielders' clips in, so the bodies move as the game shows them; nothing drawn
await page.evaluate(async () => { const st = window.STD_STAGE.current; await st.inplay.motion; st.renderer.render = () => {}; });

// the page side: the finger tests, installed once
await page.evaluate(async ({ FINGER_W, TOL }) => {
  const url = (re) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => re.test(n));
  const THREE = await import(url(/three\.module(\.min)?\.js/));
  const IDLE = await import(url(/\/3d\/idle\.js/));
  const finger = (s) => new RegExp(`^(thumb|index|middle|ring|pinky)_0[123]_${s}$`);
  const weights = (geo, names, re) => {
    const on = names.map((n) => re.test(n)), si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, w = new Float32Array(si.count);
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) if (on[si.getComponent(i, k)]) w[i] += sw.getComponent(i, k);
    return w;
  };
  // inside a closed mesh: a ray's crossings of its triangles (both faces) are odd
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3();
  const DIR = new THREE.Vector3(0.0123, 0.0071, 1).normalize();
  const crossings = (geo, o) => {
    const pos = geo.attributes.position, idx = geo.index ? geo.index.array : null, n = idx ? idx.length : pos.count;
    let hits = 0;
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(pos, idx ? idx[t + k] : t + k);
      e1.subVectors(tri[1], tri[0]); e2.subVectors(tri[2], tri[0]); pv.crossVectors(DIR, e2);
      const det = e1.dot(pv); if (Math.abs(det) < 1e-12) continue;
      tv.subVectors(o, tri[0]); const u = tv.dot(pv) / det; if (u < 0 || u > 1) continue;
      qv.crossVectors(tv, e1); const v = DIR.dot(qv) / det; if (v < 0 || u + v > 1) continue;
      if (e2.dot(qv) / det > 0) hits++;
    }
    return hits;
  };
  // outside only if the point TOL nearer the mitt's centre is outside too (a vertex on the surface is in)
  const outsideMitt = (geo, p, c) => { if (crossings(geo, p) % 2) return false; const q = p.clone().addScaledVector(c.clone().sub(p).normalize(), TOL); return crossings(geo, q) % 2 === 0; };

  const v = new THREE.Vector3();
  // THE SET'S CATCHER: his skinned meshes, each vertex's weight on the glove hand's fingers and the bare one's
  let catcherParts = null;
  const catcherOf = (c) => {
    if (catcherParts && catcherParts.c === c) return catcherParts;
    const parts = [];
    for (const m of c.meshes) {
      if (!m.isSkinnedMesh) continue;
      const names = m.skeleton.bones.map((b) => b.name);
      const wl = weights(m.geometry, names, finger('l')), wr = weights(m.geometry, names, finger('r'));
      const list = [], bare = [];
      for (let i = 0; i < wl.length; i++) { if (wl[i] >= FINGER_W) list.push(i); if (wr[i] >= 0.5) bare.push(i); }
      if (list.length || bare.length) parts.push({ m, list, bare });
    }
    const mesh = c.mitt.children.find((o) => o.isMesh);
    return (catcherParts = { c, parts, mesh });
  };
  const rules = new WeakMap();
  const cutRule = (mat) => {
    if (rules.has(mat)) return rules.get(mat);
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    if (mat.onBeforeCompile) mat.onBeforeCompile(sh);
    const one = (ax) => { const m = sh.fragmentShader.match(new RegExp(`vGloveHand\\.${ax} >= ([0-9.]+) && uHide\\.${ax} < 0\\.5`)); return m && /\)\s*discard;/.test(sh.fragmentShader.slice(m.index, m.index + 200)) ? +m[1] : null; };
    const r = { l: one('x'), r: one('y') };
    rules.set(mat, r);
    return r;
  };
  window.__mitt = {
    /** the set's catcher now: { out: finger vertices drawn outside the mitt, n: tested, bareMissing } */
    catcher(st) {
      const c = st.people.catcher, P = catcherOf(c);
      c.root.updateMatrixWorld(true);
      const inv = P.mesh.matrixWorld.clone().invert(), ctr = new THREE.Vector3();
      P.mesh.geometry.computeBoundingBox(); P.mesh.geometry.boundingBox.getCenter(ctr);
      let out = 0, n = 0, bareMissing = 0;
      for (const { m, list, bare } of P.parts) {
        const idx = m.geometry.index.array, drawn = new Uint8Array(m.geometry.attributes.position.count);
        for (let k = 0; k < idx.length; k++) drawn[idx[k]] = 1;
        for (const i of bare) if (!drawn[i]) bareMissing++;
        for (const i of list) {
          if (!drawn[i]) continue;
          n++;
          m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
          if (outsideMitt(P.mesh.geometry, v, ctr)) out++;
        }
      }
      return { out, n, bareMissing };
    },
    /** every fielder on the field with a glove: { out, n, bareMissing, who } */
    fielders(ip) {
      const T = ip.crew.t, res = { out: 0, n: 0, bareMissing: 0, who: [] };
      const lists = T.__mittLists || (T.__mittLists = new Map());
      const listFor = (geo) => {
        if (lists.has(geo)) return lists.get(geo);
        const wl = weights(geo, T.names, finger('l')), wr = weights(geo, T.names, finger('r')), L = { l: [], r: [] };
        for (let i = 0; i < wl.length; i++) { if (wl[i] >= FINGER_W) L.l.push(i); if (wr[i] >= FINGER_W) L.r.push(i); }
        lists.set(geo, L);
        return L;
      };
      const M = new THREE.Matrix4(), G = new THREE.Matrix4(), u = new THREE.Vector3();
      for (let n = 1; n <= 9; n++) {
        const f = ip.fielders[n];
        if (!f || !f.root.visible || !f.glove) continue;
        f.root.updateMatrixWorld(true);
        const geo = f.mesh.geometry, L = listFor(geo), gh = geo.attributes.gloveHand, hide = f.mesh.material.userData.hide.value;
        // what the shader discards (fielders.js figureMaterial), read off the shader it compiles: the
        // threshold on each hand's glove weight past which the fragment goes, while that hand's glove is on
        const rule = cutRule(f.mesh.material);
        const cut = (i) => !!gh && ((rule.l != null && gh.getX(i) >= rule.l && hide.x < 0.5) || (rule.r != null && gh.getY(i) >= rule.r && hide.y < 0.5));
        const s = f.glove, bare = s === 'l' ? 'r' : 'l', gl = T.gloves && T.gloves[s];
        if (!gl) { res.out++; res.who.push(`F${n} no glove frame`); continue; }
        for (const i of L[bare]) if (cut(i)) res.bareMissing++;
        // a posed vertex back into the glove's frame: the glove is rigid on the hand bone
        const hi = T.index[`hand_${s}`];
        M.copy(f.mesh.matrixWorld).invert().multiply(f.mesh.skeleton.bones[hi].matrixWorld).multiply(f.mesh.skeleton.boneInverses[hi]).invert();
        G.copy(gl.frame).invert().multiply(M);
        let bad = 0;
        for (const i of L[s]) {
          if (cut(i)) continue;
          res.n++;
          f.mesh.getVertexPosition(i, v);
          u.copy(v).applyMatrix4(G);
          const r = Math.hypot(u.x / (gl.half.x + TOL), u.y / (gl.half.y + TOL), u.z / (gl.half.z + TOL));
          if (r > 1) bad++;
        }
        if (bad) { res.out += bad; res.who.push(`F${n} ${bad}`); }
      }
      return res;
    },
    idle(st, role, seed, clock, A) { IDLE.apply(st.people[role], role, seed, clock, A); },
    idleSnap(st) { return IDLE.snapshot(st.people.catcher); },
    idleRestore(sn) { IDLE.restore(sn); },
    idleSeed(key) { return IDLE.seedFor('catcher', key); },
    idleAmp(c) { return IDLE.ampAt(c); },
  };
}, { FINGER_W, TOL });

let fails = 0;
const say = (ok, line) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };

// THE SET'S CATCHER, pack by pack
for (const file of QUICK ? packs.slice(-1) : packs) {
  const scn = JSON.parse(fs.readFileSync(path.join(ROOT, 'shut-the-door', 'data', 'packs', file), 'utf8')).scenario;
  const r = await page.evaluate(async ({ scn }) => {
    const st = window.STD_STAGE.current, C = window.STD_CONTRACT, K = window.__mitt;
    st.setScenario(scn);
    // the target at every corner, edge and the middle of the zone and off it, each received (framed at
    // the edges), a ball in the dirt blocked, the swing, the foul tip, a hit by pitch, balls in play
    const plays = [
      ['called_strike', 'take', 12, null, { x: 0, zn: 0.5 }],
      ['called_strike', 'take', 0, null, { x: -0.7, zn: 0.95 }],
      ['called_strike', 'take', 4, null, { x: 0.7, zn: 0.95 }],
      ['called_strike', 'take', 20, null, { x: -0.7, zn: 0.05 }],
      ['called_strike', 'take', 24, null, { x: 0.7, zn: 0.05 }],
      ['ball', 'take', 2, null, { x: 0.05, zn: 1.25 }],
      ['ball', 'take', 10, null, { x: -1.3, zn: 0.5 }],
      ['ball', 'take', 14, null, { x: 1.4, zn: 0.5 }],
      ['ball', 'take', 22, null, { x: 0.2, zn: -1.1 }],
      ['swinging_strike', 'swing', 22, null, { x: 0.1, zn: 0.0 }],
      ['foul_tip', 'swing', 12, null, { x: 0.0, zn: 0.6 }],
      ['foul', 'swing', 7, { bb: 'popup', ev: 70, la: 60, spray: 0 }, { x: 0.05, zn: 0.8 }],
      ['in_play', 'swing', 17, { bb: 'ground', ev: 95, la: -6, spray: 12 }, { x: 0.1, zn: 0.3 }],
      ['hit_by_pitch', 'take', 14, null, { x: 0, zn: 0.4 }],
    ];
    const firstL = scn.batters.find((b) => b.bats === 'L'), firstR = scn.batters.find((b) => b.bats === 'R');
    const out = [];
    for (const b of [firstL, firstR].filter(Boolean)) {
      st.setBatter(b);
      const acc = { frames: 0, n: 0, out: 0, bareMissing: 0, at: null };
      const add = (q, at) => { acc.frames++; acc.n += q.n; acc.bareMissing += q.bareMissing; if (q.out) { acc.out += q.out; acc.at = acc.at || at; } };
      for (const [i, [result, batter, cell, inPlay, at]] of plays.entries()) {
        const a = scn.pitcher.arsenal[i % scn.pitcher.arsenal.length];
        const x = result === 'hit_by_pitch' ? (b.bats === 'L' ? 1 : -1) * 1.55 : at.x;
        const pr = { n: i + 1, call: { type: a.type, cell }, actual: { x, zn: at.zn }, actualCell: C.cellAt(x, at.zn), velo: a.velo, batter, result,
          inPlay: inPlay && { ...inPlay, result: 'out', text: 'out' }, countBefore: { b: 0, s: 0 }, count: { b: 0, s: 0 }, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false };
        const { tEnd } = st.prepare(pr);
        for (let t = 0; t <= tEnd; t += 0.1) { st.pose(t); add(K.catcher(st), `${result} cell ${cell} t=${t.toFixed(1)}`); }
        // the life at the set on this target (the pose at t 0), 20 s of it
        if (i < 9) {
          st.pose(0);
          const sn = K.idleSnap(st), seed = K.idleSeed(`${b.id}:${i}`);
          for (let c = 0; c <= 20; c += 0.25) { K.idleRestore(sn); K.idle(st, 'catcher', seed, c, K.idleAmp(c)); add(K.catcher(st), `idle on cell ${cell} at ${c.toFixed(2)} s`); }
          K.idleRestore(sn);
        }
      }
      out.push({ name: b.name, bats: b.bats, acc });
    }
    return out;
  }, { scn });
  for (const h of r) {
    const A = h.acc;
    say(A.frames > 0 && A.out === 0, `${file.replace('.json', '')} catcher, ${h.name} (${h.bats}) up: ${A.out} glove hand finger vertices drawn outside the mitt of ${A.n} tested over ${A.frames} frames${A.at ? ` (first at ${A.at})` : ''}`);
    say(A.bareMissing === 0, `${file.replace('.json', '')} catcher, ${h.name} (${h.bats}) up: his bare hand is whole (${A.bareMissing} of its finger vertices not drawn)`);
  }
}

// THE FIELDERS: a spread of balls in play (each key's, every pack's), steals and pickoffs
const all = [...inplayCases()];
const STEP = QUICK ? Math.ceil(all.length / 12) : Math.ceil(all.length / 160);
const ipCases = all.filter((_, i) => i % STEP === 0).map((c) => ({ pr: c.pr, hand: c.hand, align: c.align, tag: `${c.pack.replace('.json', '')} ${c.key}/${c.label}` }));
const running = [];
for (const to of [2, 3]) for (const out of [false, true]) running.push({ tag: `steal of ${to === 2 ? 'second' : 'third'} ${out ? 'out' : 'safe'}`, pr: { result: 'ball', steal: { from: to - 1, to, result: out ? 'out' : 'safe', margin: out ? -0.2 : 0.2, catcher: { pop: 1.95 }, cover: to === 3 ? 5 : 4 }, bases: 1 << (to - 2) } });
for (const base of [1, 2, 3]) for (const out of [false, true]) running.push({ tag: `pickoff at ${base} ${out ? 'out' : 'safe'}`, pr: { pickoff: { base, out, balk: false, margin: out ? 0.2 : -0.2 }, basesBefore: 1 << (base - 1) } });
const fr = await page.evaluate(({ cases }) => {
  const st = window.STD_STAGE.current, ip = st.inplay, K = window.__mitt, C = window.STD_CONTRACT;
  // a pitch to stage the steals and pickoffs from (a ball, caught)
  const a = st.scn.pitcher.arsenal[0];
  st.prepare({ n: 1, call: { type: a.type, cell: 12 }, actual: { x: 0, zn: 0.5 }, actualCell: C.cellAt(0, 0.5), velo: a.velo, batter: 'take', result: 'ball', inPlay: null, countBefore: { b: 0, s: 0 }, count: { b: 0, s: 0 }, outs: 0, bases: 0, runnerMoves: [], runs: 0, paOver: false });
  const facts0 = ip.facts, out = [];
  for (const c of cases) {
    if (c.hand) ip.facts = { ...facts0, batter: { ...facts0.batter, bats: c.hand } };
    const acc = { frames: 0, n: 0, out: 0, bareMissing: 0, at: null };
    let run;
    try { run = ip.begin(c.pr, st.pitch, c.align ? { align: c.align } : {}); } catch (e) { out.push({ tag: c.tag, err: String(e).slice(0, 200) }); continue; }
    try {
      for (let r = 0; r <= run.realDur; r += 0.1) {
        const s = run.sceneAt(r);
        ip.update(s, st.camera);
        const q = K.fielders(ip);
        acc.frames++; acc.n += q.n; acc.bareMissing += q.bareMissing;
        if (q.out) { acc.out += q.out; acc.at = acc.at || `s=${s.toFixed(2)} ${q.who.join(', ')}`; }
      }
    } catch (e) { out.push({ tag: c.tag, err: String(e).slice(0, 200) }); }
    ip.end(st.camera);
    ip.facts = facts0;
    out.push({ tag: c.tag, acc });
  }
  return out;
}, { cases: [...running, ...ipCases] });
const tot = { frames: 0, n: 0, out: 0, bare: 0, plays: 0 };
for (const r of fr) {
  if (r.err) { say(false, `${r.tag}: could not be staged (${r.err})`); continue; }
  const A = r.acc;
  tot.plays++; tot.frames += A.frames; tot.n += A.n; tot.out += A.out; tot.bare += A.bareMissing;
  if (A.out || A.bareMissing) say(false, `fielders, ${r.tag}: ${A.out} glove hand finger vertices drawn outside the glove, ${A.bareMissing} bare hand finger vertices cut${A.at ? ` (first at ${A.at})` : ''}`);
}
say(tot.plays > 0 && tot.out === 0 && tot.bare === 0, `fielders: ${tot.plays} plays (${running.length} steals and pickoffs, ${ipCases.length} balls in play), ${tot.frames} frames: ${tot.out} glove hand finger vertices drawn outside the glove of ${tot.n} tested, ${tot.bare} bare hand finger vertices cut`);

if (errors.length) { console.log('page errors: ' + errors.join(' | ')); fails++; }
console.log(fails ? `check-mitt: ${fails} FAILED` : 'check-mitt: ok');
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
