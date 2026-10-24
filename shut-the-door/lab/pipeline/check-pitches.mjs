/* Every pitch moves like the real pitch: every arsenal pitch in every pack, thrown by either hand.
 *
 *   node shut-the-door/lab/pipeline/check-pitches.mjs            the check
 *   node shut-the-door/lab/pipeline/check-pitches.mjs --list     every pitch's numbers, passing or not
 *   node shut-the-door/lab/pipeline/check-pitches.mjs --dir D    measure another copy of 3d/ (D holds
 *                                                                pitch.js, preview.js, units.js), for a
 *                                                                before and after
 *
 * The rules are written in arm side and glove side (a righty's arm side is the third base side,
 * Statcast's x < 0; a lefty's is the first base side, x > 0) and mapped to the screen through the
 * game's own camera (park.js pitcherEye) and P(), the one mirror of the 3D scene. For each pitch:
 *
 *   1. side   the horizontal break goes the way its family goes, and the way the sign of his own pfxX
 *             goes. Arm side: four-seam, sinker, changeup, splitter, forkball. Glove side: cutter,
 *             slider, sweeper, slurve, curveball, knuckle curve. Under SIDE_MIN_IN either way is
 *             real (a cutting four-seamer, a gyro slider), so only the pfxX sign is held there.
 *             On screen, from behind the pitcher, glove side is to the right for a lefty and to the
 *             left for a righty: measured on the projected path, so a flip in P(), the camera or
 *             the flight fails here.
 *   2. size   the break the flight draws against the same pitch with no spin out of the same hand
 *             (Statcast's pfx, over the whole flight) is his pfxX and pfxZ within SIZE_TOL.
 *   3. aim    the flight crosses the front of the plate on the aim point (the cell plus at) within
 *             CROSS_IN, and the aim ball (preview.js) sits on it too.
 *   4. spin   the aim ball spins like the family (preview.js spinOf), in arm side and glove side and
 *             mirrored for the other hand: four-seam pure backspin, sinker and changeup arm side and
 *             up, the changeup slower, cutter glove side and up, slider mostly gyro glove side,
 *             sweeper sidespin glove side, curveball and knuckle curve topspin, splitter low spin;
 *             and the ball turns about that axis through P().
 *   5. colour the indicator's palette (preview.js PITCH_COLORS) is ui.js PITCH_COLORS, the break
 *             chart's and the buttons', so a pitch is one colour everywhere.
 *
 * A failure prints the pack, the pitcher, the hand and the pitch, and the exit code is 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..');
const VENDOR = pathToFileURL(path.join(GAME, '3d/vendor/three-0.170.0/')).href;
// the page's import map, for node: 'three' and 'three/addons/' are the vendored build
register('data:text/javascript,' + encodeURIComponent(`const V = ${JSON.stringify(VENDOR)};
export async function resolve(s, c, n) {
  if (s === 'three') return { url: V + 'three.module.min.js', shortCircuit: true };
  if (s.startsWith('three/addons/')) return { url: V + 'addons/' + s.slice(13), shortCircuit: true };
  return n(s, c);
}`));

const argv = process.argv.slice(2);
const LIST = argv.includes('--list');
const DIR = argv.includes('--dir') ? path.resolve(argv[argv.indexOf('--dir') + 1]) : path.join(GAME, '3d');

export const SIDE_MIN_IN = 2;       // under this much run, a pitch of any family can go either way
export const SIZE_TOL = 0.1;        // the drawn break against his pfx: 10% (and at least SIZE_MIN_IN)
export const SIZE_MIN_IN = 0.5;
export const CROSS_IN = 0.1;        // the crossing point against the aim point, inches

const ARM = new Set(['FF', 'SI', 'CH', 'FS', 'FO']);
const GLOVE = new Set(['FC', 'SL', 'ST', 'SV', 'CU', 'KC']);

const url = (f, v) => pathToFileURL(path.join(DIR, f)).href + (v ? '?v=' + v : '');
const THREE = await import('three');
const pitchMod = await import(url('pitch.js', 'check'));
const previewMod = await import(url('preview.js', 'check'));
const { Ghost } = previewMod;
const { P, FT } = await import(url('units.js', 'check'));
const { pitcherEye } = await import(pathToFileURL(path.join(GAME, '3d/park.js')).href);
const { flight, cellPoint } = pitchMod;
const releaseOf = pitchMod.releaseOf || ((p) => ({ x: p.throws === 'L' ? 1.9 : -1.9, y: 54.0, z: 5.6 }));

const SZ = { szTop: 3.4, szBot: 1.6 };
// where the player aims: every row and column, centres and the corners of the free aim
const AIMS = [[12, null], [0, null], [4, null], [20, null], [24, null], [6, [0.5, 0.5]], [8, [-0.5, 0.5]], [16, [0.5, -0.5]], [18, [-0.5, -0.5]], [11, [0.3, -0.2]], [13, [-0.25, 0.4]]];
const IN = 12;
// the hand each pitch is thrown with in the loop below (the aim ball's spin is mirrored by it)

/** The game's camera, framed for a hitter on this side, on a 390x844 phone. */
function camera(bats) {
  const cam = new THREE.PerspectiveCamera(10, 1, 0.05, 900);
  const eye = pitcherEye(cam);
  eye.setSide(bats);
  eye.resize(390, 844);
  eye.update(0.8);
  cam.updateMatrixWorld(true);
  return cam;
}
const cams = { R: camera('R'), L: camera('L') };
const screenX = (cam, v) => v.clone().project(cam).x;

/* The family rules for the aim ball's spin, in arm side and glove side. The push of a spin is
   axis x velocity; the velocity is about -y, so the push is (axis.z, 0, -axis.x), catcher's view. */
const UP = new Set(['FF', 'SI', 'FC', 'CH']), DOWN = new Set(['CU', 'KC']), SIDE = new Set(['ST']);
function spinBad(type, hand) {
  const out = [], s = previewMod.spinOf(type, hand), o = previewMod.spinOf(type, hand === 'R' ? 'L' : 'R');
  const armSign = hand === 'R' ? -1 : 1, px = s.axis.z, pz = -s.axis.x;
  const want = ARM.has(type) ? 'arm' : 'glove';
  if (Math.abs(px) > 0.02 && (Math.sign(px) === armSign ? 'arm' : 'glove') !== want) out.push(`spin: it pushes ${want === 'arm' ? 'glove' : 'arm'} side, a ${type} spins ${want} side`);
  if (UP.has(type) && !(pz > 0)) out.push(`spin: a ${type} is backspin (it pushes up), this pushes ${pz.toFixed(2)}`);
  if (DOWN.has(type) && !(pz < 0)) out.push(`spin: a ${type} is topspin (it pushes down), this pushes ${pz.toFixed(2)}`);
  if (SIDE.has(type) && !(Math.abs(px) > 2 * Math.abs(pz))) out.push('spin: a sweeper is sidespin');
  if (type === 'SL' && !(Math.abs(s.axis.y) >= 0.7)) out.push('spin: a slider is mostly gyro');
  if (type === 'FF' && !(Math.abs(s.axis.y) <= 0.2 && pz > 0.9 * Math.hypot(px, pz))) out.push('spin: a four-seam is pure backspin');
  if (type === 'CH' && !(s.rps < previewMod.spinOf('FF', hand).rps)) out.push('spin: a changeup turns slower than his four-seam');
  if ((type === 'FS' || type === 'FO') && !(s.rps < 0.6)) out.push('spin: a splitter is low spin');
  if (Math.abs(Math.hypot(s.axis.x, s.axis.y, s.axis.z) - 1) > 1e-6) out.push('spin: the axis is not a unit vector');
  // a mirror across the plate's centre line keeps the axis's x (up and down pushes) and flips y and z
  if (Math.hypot(s.axis.x - o.axis.x, s.axis.y + o.axis.y, s.axis.z + o.axis.z) > 1e-9) out.push('spin: the other hand is not its mirror');
  return out;
}

const packsDir = path.join(GAME, 'data/packs');
const fails = [];
let n = 0, wrongWay = 0, wrongSize = 0;
const scene = new THREE.Scene();
const ghost = new Ghost(scene);

for (const f of fs.readdirSync(packsDir).filter((x) => x.endsWith('.json')).sort()) {
  const pk = JSON.parse(fs.readFileSync(path.join(packsDir, f), 'utf8'));
  const pit = pk.scenario.pitcher;
  for (const hand of ['R', 'L']) {
    // the other hand: the same pitch mirrored (his pfxX and his release side flip), so both are held
    const mirror = hand !== pit.throws ? -1 : 1;
    const rel0 = releaseOf({ ...pit, throws: pit.throws });
    const rel = { ...rel0, x: rel0.x * mirror };
    const armSign = hand === 'R' ? -1 : 1;          // Statcast x of the arm side
    for (const a0 of pit.arsenal) {
      const a = { ...a0, pfxX: a0.pfxX * mirror };
      const tag = `${f.replace('.json', '')} ${pit.name} as a ${hand === 'R' ? 'righty' : 'lefty'}: ${a.name} (${a.type}, pfx ${a.pfxX} x ${a.pfxZ} in)`;
      n++;
      const bad = [];
      const want = ARM.has(a.type) ? 'arm' : GLOVE.has(a.type) ? 'glove' : null;
      const dataSide = Math.abs(a.pfxX) < 1e-9 ? null : Math.sign(a.pfxX) === armSign ? 'arm' : 'glove';
      if (want && dataSide && Math.abs(a.pfxX) >= SIDE_MIN_IN && dataSide !== want) bad.push(`his pfxX runs ${dataSide} side, a ${a.name} runs ${want} side (data)`);
      let worstSize = 0;
      for (const [cell, at] of AIMS) {
        const aim = cellPoint(cell, SZ.szTop, SZ.szBot, at);
        const ux = at ? at[0] : 0, vz = at ? at[1] : 0;
        const r = Math.floor(cell / 5), c = cell % 5;
        const wantAim = { x: (c - 2 + ux) * 0.553, z: SZ.szBot + ((3.5 - r + vz) / 3) * (SZ.szTop - SZ.szBot) };
        if (Math.hypot(aim.x - wantAim.x, aim.z - wantAim.z) * IN > CROSS_IN) { bad.push(`cell ${cell} at ${JSON.stringify(at)}: the aim point is the cell's centre, not the tap`); break; }
        const fl = flight(rel, aim, a.velo, a.pfxX, a.pfxZ);
        const end = fl.at(fl.T);
        const cross = Math.hypot(end.x - aim.x, end.z - aim.z) * IN;
        if (cross > CROSS_IN) bad.push(`cell ${cell}: the flight crosses ${cross.toFixed(2)} in off the aim point`);
        // the same pitch with no spin, out of the same hand at the same speed and angle
        const vx0 = (fl.at(1e-4).x - fl.at(0).x) / 1e-4, vz0 = (fl.at(1e-4).z - fl.at(0).z) / 1e-4;
        const nsx = rel.x + vx0 * fl.T, nsz = rel.z + vz0 * fl.T - 0.5 * 32.17 * fl.T * fl.T;
        const bx = (end.x - nsx) * IN, bz = (end.z - nsz) * IN;
        const tol = (v) => Math.max(SIZE_MIN_IN, Math.abs(v) * SIZE_TOL);
        const ex = Math.abs(bx - a.pfxX), ez = Math.abs(bz - a.pfxZ);
        worstSize = Math.max(worstSize, Math.abs(a.pfxX) > 0.5 ? bx / a.pfxX : 1);
        if (ex > tol(a.pfxX) || ez > tol(a.pfxZ)) bad.push(`cell ${cell}: the flight breaks ${bx.toFixed(1)} x ${bz.toFixed(1)} in, his pfx is ${a.pfxX} x ${a.pfxZ}`);
        // the break on screen, from behind the pitcher: the flight's end against the no spin end
        for (const bats of ['R', 'L']) {
          const cam = cams[bats];
          const sx = screenX(cam, P(end.x, 17 / 12, end.z)) - screenX(cam, P(nsx, 17 / 12, nsz));
          if (Math.abs(a.pfxX) < 0.5) continue;
          const onScreen = sx > 0 ? 'right' : 'left';
          // glove side is screen right for a lefty, screen left for a righty (the arm side the other way)
          const sideNow = (onScreen === 'right') === (hand === 'L') ? 'glove' : 'arm';
          if (sideNow !== dataSide) bad.push(`cell ${cell}, a ${bats === 'R' ? 'righty' : 'lefty'} hitting: it breaks ${sideNow} side on screen (to the ${onScreen}), his pfxX says ${dataSide}`);
        }
        // the aim ball: on the aim point, at the front of the plate, where the flight crosses
        ghost.set({ release: rel, pitch: a, hand, cell, at, ...SZ });
        const bp = ghost.ball ? ghost.ball.position : ghost.path.pts[ghost.path.pts.length - 1];
        const ae = P(aim.x, 17 / 12, aim.z), fe = P(end.x, end.y, end.z);
        const off = Math.max(bp.distanceTo(ae), bp.distanceTo(fe)) / FT * IN;
        if (off > CROSS_IN) bad.push(`cell ${cell}: the aim ball sits ${off.toFixed(2)} in off the aim point`);
      }
      // 4. spin: the aim ball turns like the family, mirrored for the hand (preview.js spinOf)
      if (previewMod.spinOf && (ARM.has(a.type) || GLOVE.has(a.type))) {
        for (const b of spinBad(a.type, hand)) bad.push(b);
        const s = previewMod.spinOf(a.type, hand), w = ghost.axis1;
        if (w && Math.hypot(w.x + s.axis.x, w.y - s.axis.z, w.z - s.axis.y) > 1e-6) bad.push('the aim ball turns about an axis that is not its spin through P()');
      }
      const uniq = [...new Set(bad.map((b) => b.replace(/^cell \d+(?: at [^:,]*)?[:,] /, '')))];
      if (bad.some((b) => /side/.test(b))) wrongWay++;
      if (bad.some((b) => /breaks .* his pfx/.test(b))) wrongSize++;
      if (LIST || bad.length) console.log(`${bad.length ? 'FAIL' : 'ok  '} ${tag}  drawn ${worstSize.toFixed(2)}x his pfxX`);
      for (const b of uniq.slice(0, 4)) console.log('       ' + b);
      if (bad.length) fails.push(tag);
    }
  }
}
// 5. colour: the indicator's palette is the break chart's and the buttons' (ui.js PITCH_COLORS)
if (previewMod.PITCH_COLORS) {
  const m = fs.readFileSync(path.join(GAME, 'ui.js'), 'utf8').match(/var PITCH_COLORS = (\[[^\]]*\]);/);
  const ui = m ? JSON.parse(m[1].replace(/'/g, '"')) : null;
  if (!ui || JSON.stringify(ui) !== JSON.stringify(previewMod.PITCH_COLORS)) { console.log('FAIL the indicator palette (preview.js PITCH_COLORS) is not ui.js PITCH_COLORS'); fails.push('palette'); }
}
// 5b. each pitch type's own colour is the same map on the page and in the stage (ui.js TYPE_COLORS)
if (previewMod.TYPE_COLORS) {
  const m = fs.readFileSync(path.join(GAME, 'ui.js'), 'utf8').match(/var TYPE_COLORS = (\{[^}]*\});/);
  const ui = m ? JSON.parse(m[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":')) : null;
  if (!ui || JSON.stringify(ui) !== JSON.stringify(previewMod.TYPE_COLORS)) { console.log('FAIL the type colours (preview.js TYPE_COLORS) are not ui.js TYPE_COLORS'); fails.push('type colours'); }
}
console.log(`\n${n} pitches (every arsenal pitch in every pack, both hands, ${AIMS.length} aim points each, both sides of the plate on screen)`);
console.log(`wrong way: ${wrongWay}   wrong size: ${wrongSize}   failing: ${fails.length}`);
if (fails.length) { console.log('check-pitches: FAIL'); process.exit(1); }
console.log('check-pitches: ok');
