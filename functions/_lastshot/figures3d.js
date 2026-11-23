/* THE 3D PLAYERS (2026-11-22), for the shot cam (shotcam3d.js).
 *
 * There is no basketball player model yet, so these are stylized figures
 * built in code from simple primitives: a torso in the jersey with its
 * number front and back, shorts with a trim band, a head with hair, arms
 * and legs on hinged pivots, socks and shoes. Home is navy with gold, away
 * is red (court2d.js HOME and AWAY, the board's own colours).
 *
 * THIS IS THE ONE MODULE A REAL MODEL REPLACES. The rest of the shot cam
 * only calls figureKit(THREE).build(team, number, i) for a figure (a Group
 * placed at the feet, facing +Z) and kit.pose(fig, p) once a frame with
 * what the sim says he is doing. A rigged GLB swaps in here: build() clones
 * the skinned mesh and its number decal, pose() drives its bones (or blends
 * its clips) from the same p. Nothing outside this file knows about limbs.
 *
 * pose(fig, p), p:
 *   code    the sim's pose code for him this frame (sim.js POSE):
 *             offense 0 stand, 1 run, 2 dribble on the move, 3 dribble
 *             standing, 4 shooting, 5 screen set, 6 hands up for the pass,
 *             7 pass thrown, 8 holding the ball
 *             defense 0 stance, 1 slide, 2 run, 3 stuck on a screen, 4 contest
 *   def     true for the defense
 *   gait    0 to 100, where he is in his stride (the sim's own, frame.g)
 *   jump    the shooter only: seconds into his jumper, release at RELEASE
 *   close   a contesting defender: 0 to 1 into his close-out
 *   cheer   1 on a made winner for the home side (their arms go up), -1 for
 *           the side that lost it (hands to heads), 0 otherwise
 *   t       wall seconds, for the idle sway (never a position: those are the sim's)
 *   i       which player, so the sway is not in step
 *
 * Nothing here moves a player across the floor. Where each one stands and
 * faces is the sim's frame; this only bends the limbs. */

/* THE JUMPER, in seconds from leaving the floor: the gather (a dip, ball to
   the chest) runs before 0, the rise to the release at RELEASE, then the
   follow through held in the air, the landing at AIR, and the knees taking
   it. The shot cam opens at the release (the frame the sim puts the ball in
   the air), so it shows release, follow through and landing; the gather and
   the rise are the board's, before the cut. */
export const GATHER = 0.3, RELEASE = 0.16, AIR = 0.56, JUMP_FT = 1.25;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

/* How high off the floor he is, and how far into the motion, at s seconds. */
export function jumper(s) {
  if (s < 0) { const u = clamp(1 + s / GATHER, 0, 1); return { lift: 0, dip: Math.sin(u * Math.PI / 2) * 0.45, arms: 'gather', u }; }
  if (s < AIR) { const u = s / AIR; return { lift: 4 * JUMP_FT * u * (1 - u), dip: 0, arms: s < RELEASE ? 'rise' : 'follow', u: s < RELEASE ? s / RELEASE : (s - RELEASE) / (AIR - RELEASE) }; }
  const l = s - AIR;
  return { lift: 0, dip: l < 0.32 ? Math.sin(clamp(l / 0.32, 0, 1) * Math.PI) * 0.4 : 0, arms: l < 0.7 ? 'follow' : 'down', u: clamp((l - 0.7) / 0.5, 0, 1) };
}

export const HOME = { jersey: '#1f4e79', trim: '#ffd23f', num: '#ffffff', edge: '#ffd23f', shoe: '#f2f2f2' };
export const AWAY = { jersey: '#d9473a', trim: '#f4efe4', num: '#f4efe4', edge: '#7a1d16', shoe: '#202226' };
const SKIN = ['#8d5a3b', '#c58c62', '#5a3825', '#e0b18c', '#6e4630'];
const HAIR = '#1a1310';
/* Away numbers, so their five read as a team, not as blanks. */
export const AWAY_NUMBERS = [11, 23, 4, 32, 50];

export function figureKit(THREE) {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, o));
  const geo = {
    torso: new THREE.CapsuleGeometry(0.62, 1.1, 4, 14),
    shorts: new THREE.CylinderGeometry(0.66, 0.74, 1.25, 14),
    band: new THREE.CylinderGeometry(0.75, 0.75, 0.16, 14, 1, true),
    leg: new THREE.CapsuleGeometry(0.22, 2.0, 3, 8),
    arm: new THREE.CapsuleGeometry(0.16, 1.75, 3, 8),
    head: new THREE.SphereGeometry(0.42, 16, 12),
    hair: new THREE.SphereGeometry(0.44, 14, 6, 0, Math.PI * 2, 0, 1.2),
    shoe: new THREE.BoxGeometry(0.42, 0.3, 0.85),
    num: new THREE.PlaneGeometry(0.95, 0.95)
  };
  const mats = new Map();
  const mat = (key, make) => { let m = mats.get(key); if (!m) mats.set(key, (m = make())); return m; };
  function numberMat(n, T) {
    return mat('n' + T.jersey + n, () => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.font = '900 92px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = T.edge; g.strokeText(String(n), 64, 70);
      g.fillStyle = T.num; g.fillText(String(n), 64, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
    });
  }

  /* One figure. team: 'home' or 'away'. Feet at the origin, facing +Z, about 6.5 ft tall. */
  function build(team, n, i) {
    const T = team === 'home' ? HOME : AWAY;
    const jersey = mat('j' + T.jersey, () => std(T.jersey, { roughness: 0.62 }));
    const trim = mat('t' + T.trim, () => std(T.trim, { roughness: 0.5 }));
    const skin = mat('s' + (i % SKIN.length), () => std(SKIN[i % SKIN.length], { roughness: 0.55 }));
    const hairM = mat('hair', () => std(HAIR, { roughness: 0.9 }));
    const shoe = mat('sh' + T.shoe, () => std(T.shoe, { roughness: 0.5 }));
    const fig = new THREE.Group();
    const hips = new THREE.Group(); hips.position.y = 3.15; fig.add(hips);
    const sh = new THREE.Mesh(geo.shorts, jersey); sh.scale.set(1.12, 1, 0.82); sh.position.y = -0.1; hips.add(sh);
    const band = new THREE.Mesh(geo.band, trim); band.scale.set(1.12, 1, 0.82); band.position.y = -0.64; hips.add(band);
    const chest = new THREE.Group(); chest.position.y = 0.55; hips.add(chest);
    const torso = new THREE.Mesh(geo.torso, jersey); torso.scale.set(1.18, 1, 0.74); torso.position.y = 0.95; chest.add(torso);
    const head = new THREE.Mesh(geo.head, skin); head.position.y = 2.3; chest.add(head);
    const hair = new THREE.Mesh(geo.hair, hairM); hair.position.y = 2.34; chest.add(hair);
    const nm = numberMat(n, T);
    for (const z of [0.47, -0.47]) { const p = new THREE.Mesh(geo.num, nm); p.position.set(0, 1.05, z); if (z < 0) p.rotation.y = Math.PI; chest.add(p); }
    const limb = (gm, m, x, y, len, parent) => {
      const piv = new THREE.Group(); piv.position.set(x, y, 0); parent.add(piv);
      const mesh = new THREE.Mesh(gm, m); mesh.position.y = -len / 2; piv.add(mesh);
      return piv;
    };
    const legs = [-0.34, 0.34].map(x => { const p = limb(geo.leg, skin, x, -0.35, 2.44, hips); const s = new THREE.Mesh(geo.shoe, shoe); s.position.set(0, -2.62, 0.16); p.add(s); return p; });
    const arms = [-0.86, 0.86].map(x => limb(geo.arm, skin, x, 1.62, 2.07, chest));
    fig.userData = { hips, chest, legs, arms, team };
    return fig;
  }

  /* The limbs for this frame (see the header for p). Index 0 is his right side. */
  function pose(fig, p) {
    const { hips, chest, legs, arms } = fig.userData;
    const ph = (p.gait || 0) / 100 * Math.PI * 2, t = p.t || 0, i = p.i || 0;
    let swing = 0, ax = [0.12, 0.12], az = [0.1, -0.1], dip = 0, spread = 0, lean = 0, lift = 0, turn = 0;
    const run = a => { swing = a; ax = [-Math.sin(ph) * a * 0.9, Math.sin(ph) * a * 0.9]; lean = 0.12; };
    const sway = Math.sin(t * 1.4 + i * 1.7);
    const c = p.code | 0;
    if (p.jump != null) {
      // the jumper: the shooting hand is his right
      const J = jumper(p.jump);
      lift = J.lift; dip = J.dip;
      if (J.arms === 'gather') { ax = [-1.0 - J.u * 0.3, -1.0 - J.u * 0.3]; az = [-0.25, 0.25]; }
      else if (J.arms === 'rise') { ax = [lerp(-1.3, -2.75, ease(J.u)), lerp(-1.3, -2.45, ease(J.u))]; az = [0.05, -0.2]; }
      else if (J.arms === 'follow') { ax = [-2.85, lerp(-2.45, -1.9, ease(J.u))]; az = [0.05, -0.35]; }
      else { ax = [lerp(-2.85, 0.1, ease(J.u)), lerp(-1.9, 0.1, ease(J.u))]; az = [0.1, -0.1]; }
      lean = -0.06;
    } else if (!p.def) {
      if (c === 1) run(0.75);
      else if (c === 2) { run(0.6); ax = [-0.7, Math.sin(ph) * 0.4]; }
      else if (c === 3) { dip = 0.2; ax = [-0.6 - Math.sin(ph * 2) * 0.2, 0.2]; }
      else if (c === 5) { spread = 0.2; dip = 0.25; ax = [-0.55, -0.55]; az = [-0.55, 0.55]; }
      else if (c === 6) { ax = [-1.4, -1.4]; az = [0.2, -0.2]; dip = 0.1; }
      else if (c === 7) { ax = [-1.55, -1.55]; az = [0, 0]; }
      else if (c === 8) { ax = [-1.0, -1.0]; az = [-0.35, 0.35]; dip = 0.15; }
      else { ax = [0.1 + sway * 0.05, 0.1 - sway * 0.05]; turn = sway * 0.05; dip = 0.08 + Math.max(0, sway) * 0.03; }
    } else {
      if (c === 4) {
        // the close out: chop the feet, then the hand goes up as the ball does
        const k = ease(p.close == null ? 1 : p.close);
        spread = lerp(0.24, 0.1, k); dip = lerp(0.4, 0.05, k); lean = lerp(0.1, 0.18, k);
        ax = [lerp(-0.4, -2.95, k), lerp(-0.4, -0.7, k)]; az = [lerp(0.9, 0.08, k), lerp(-0.9, -0.5, k)];
        lift = Math.sin(clamp(k, 0, 1) * Math.PI) * 0.35;
      }
      else if (c === 1) { spread = 0.18 + Math.sin(ph) * 0.08; dip = 0.4; az = [0.9, -0.9]; ax = [-0.3, -0.3]; }
      else if (c === 2) run(0.8);
      else if (c === 3) { dip = 0.2; ax = [-0.4, -0.2]; lean = -0.15; }
      else { spread = 0.24; dip = 0.42 + sway * 0.03; az = [0.95, -0.95]; ax = [-0.3, -0.3]; turn = sway * 0.04; }
    }
    if (p.cheer > 0) { ax = [-2.9 + Math.sin(t * 9 + i) * 0.15, -2.9 - Math.sin(t * 9 + i) * 0.15]; az = [0.25, -0.25]; lift = Math.max(lift, Math.abs(Math.sin(t * 6 + i)) * 0.5); swing = 0; lean = -0.05; }
    else if (p.cheer < 0) { ax = [-2.4, -2.4]; az = [-0.9, 0.9]; lean = 0.2; swing = 0; }
    legs[0].rotation.set(Math.sin(ph) * swing - dip * 0.5, 0, -spread);
    legs[1].rotation.set(-Math.sin(ph) * swing - dip * 0.5, 0, spread);
    arms[0].rotation.set(ax[0], 0, -az[0]); arms[1].rotation.set(ax[1], 0, -az[1]);
    hips.position.y = 3.15 - dip - (swing ? Math.abs(Math.cos(ph)) * 0.12 : 0) + lift;
    chest.rotation.set(lean + dip * 0.3, turn, 0);
    return lift;
  }

  return { build, pose, geo, dispose() { for (const g of Object.values(geo)) g.dispose(); for (const m of mats.values()) { if (m.map) m.map.dispose(); m.dispose(); } } };
}
