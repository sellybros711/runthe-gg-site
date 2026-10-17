/* Shut The Door design mockups: the scene at the plate, the three looks, and the pitch.
   MOCKUP CODE, never loaded by the game. One global, STD_SCENE. */
(function () {
  'use strict';
  const T = window.STD3D, FIG = window.STD_FIG;

  /* Kits. Generic uniforms in team colours: the Dodgers on the road in grey and blue (the pack's
     teamColors[0] is #005a9c), the home side in white and royal. No logos, no numbers. */
  const MATS = {
    skinA: { c: '#c68b67', spec: 0.06, shin: 18 }, skinB: { c: '#8a5a3e', spec: 0.07, shin: 18 }, skinC: { c: '#e2b493', spec: 0.05, shin: 16 },
    skinD: { c: '#d9a37d', spec: 0.05, shin: 16 },
    white: { c: '#ecebe6', spec: 0.03 }, whiteP: { c: '#e6e5df', spec: 0.03 },
    grey: { c: '#a9adb3', spec: 0.03 }, greyP: { c: '#9fa3a9', spec: 0.03 },
    dodger: { c: '#0b4f9c', spec: 0.06 }, royal: { c: '#1d4b8f', spec: 0.06 },
    helmet: { c: '#173f7c', spec: 0.55, shin: 60 }, helmetLA: { c: '#0b4f9c', spec: 0.5, shin: 60 },
    navy: { c: '#1a2335', spec: 0.04 }, umpGrey: { c: '#6d7279', spec: 0.03 }, black: { c: '#16171a', spec: 0.2, shin: 40 },
    cage: { c: '#1b1c20', spec: 0.35, shin: 30, pattern: cagePattern }, mask: { c: '#202227', spec: 0.3, shin: 30 },
    leather: { c: '#7a4a24', spec: 0.18, shin: 22 }, mitt: { c: '#6b3d1c', spec: 0.2, shin: 22 }, mittIn: { c: '#9a6232', spec: 0.15, shin: 18 },
    bat: { c: '#c79a5e', spec: 0.35, shin: 40 }, shoe: { c: '#15161a', spec: 0.3, shin: 30 }, shoeW: { c: '#e9e9e6', spec: 0.1 },
    belt: { c: '#141518', spec: 0.2 }, glove: { c: '#1d4b8f', spec: 0.1 },
    jacket: { c: '#0b4f9c', spec: 0.12, shin: 20 }, hair: { c: '#4d4741', spec: 0.05 }, hairG: { c: '#c9c4bb', spec: 0.04 }, hairD: { c: '#2a221c', spec: 0.08 }, eye: { c: '#1a1210', spec: 0.6, shin: 60 }, board: { c: '#d9cfb4', spec: 0.05 },
  };
  function cagePattern(p, n, base) {
    // bars across the face cage
    const b = Math.abs(Math.sin(p[2] * 22)) > 0.62 || Math.abs(Math.sin(p[0] * 20)) > 0.86;
    return b ? base : [base[0] * 0.25, base[1] * 0.25, base[2] * 0.25];
  }
  const M = T.materials(MATS), I = M.idx;
  const KITS = {
    pitcher: { skin: I.skinD, jersey: I.grey, pants: I.greyP, sleeve: I.dodger, forearm: I.dodger, socks: I.dodger, socksHigh: true, shoe: I.shoe, belt: I.dodger, cap: I.dodger, glove: I.leather, hair: I.hairD, eye: I.eye, brow: I.hairD },
    batter: { skin: I.skinC, jersey: I.white, pants: I.whiteP, sleeve: I.royal, forearm: I.royal, socks: I.whiteP, shoe: I.shoe, belt: I.royal, helmet: I.helmet, glove: I.black, bat: I.bat, flap: 1, beard: I.belt },
    catcher: { skin: I.skinB, jersey: I.grey, pants: I.greyP, sleeve: I.dodger, forearm: I.dodger, socks: I.dodger, shoe: I.shoe, belt: I.dodger, gear: I.helmetLA, cage: I.cage, mitt: I.mitt, mittIn: I.mittIn },
    ump: { skin: I.skinA, jersey: I.navy, pants: I.umpGrey, sleeve: I.navy, forearm: I.navy, socks: I.black, shoe: I.black, belt: I.black, mask: I.mask, cage: I.cage },
    coach: { skin: I.skinA, jersey: I.jacket, pants: I.greyP, sleeve: I.jacket, forearm: I.jacket, socks: I.dodger, shoe: I.shoe, cap: I.dodger, stache: I.hair, eye: I.eye, brow: I.hair, hairSide: I.hairG, board: I.board },
  };

  /* Looks: the light, the ground, the stands, and the finish. */
  const crowdBase = { seat: '#203a5e', riser: '#16263d', haze: '#0c1220', hazeK: 0.0, full: 0.9, capC: '#1d4b8f' };
  const shirts = ['#1d4b8f', '#1d4b8f', '#e9e9e4', '#e9e9e4', '#c8102e', '#0b4f9c', '#2b2b2b', '#6c7a89', '#f1f1f1', '#3d6db5'];
  const skins = ['#c68b67', '#8a5a3e', '#e2b493', '#d9a37d', '#6d4530'];
  function rgbAll(o) { const r = {}; for (const k in o) r[k] = Array.isArray(o[k]) ? o[k].map((x) => typeof x === 'string' ? T.hex(x) : x) : typeof o[k] === 'string' ? T.hex(o[k]) : o[k]; return r; }
  const LOOKS = {
    // A: under the lights. A cool key from the towers behind the camera, a warm rim from the far
    // side, deep shadow, a soft crowd behind, bloom and grain.
    night: {
      key: [0.35, 0.5, 0.8], keyColor: '#e4ecff', keyI: 2.7, wrap: 0.15, shadowK: 10, shadowFloor: 0.5,
      rim: [-0.5, -0.8, 0.35], rimColor: '#ffd7a0', rimI: 1.25, rimLev: 1.2,
      sky: '#3a4f7a', groundBounce: '#1f3a24', ambI: 0.42,
      ground: rgbAll({ grass: '#2f7a3c', grass2: '#3d9147', stripe: 0.42, dirt: '#9a6a45', track: '#7a5236', chalk: '#f2f1ea', plate: '#f6f6f2' }),
      groundAmb: 0.35, groundKey: 1.0, pool: [0, -1, 26, 0.35],
      wall: '#14233d', wallBand: '#0f1b30', wallLight: 0.55,
      crowd: rgbAll(Object.assign({}, crowdBase, { shirts, skins, light: 0.9, flash: '#fff6d8', haze: '#0b1324', hazeK: 0.25 })),
      skyTop: '#05070d', dof: 1.8, exposure: 1.05, aces: true, sat: 1.12, vignette: 0.55, grain: 0.05,
      bloom: { alpha: 0.32, blur: 5, contrast: 2.2, gain: 1.1 }, finish: { type: 'smooth' },
    },
    // B: a day game in an old park, painted as pixel art: warm sun from the third base side,
    // five step ramps, dithered, outlined.
    day: {
      key: [0.62, 0.42, 0.66], keyColor: '#fff1d6', keyI: 2.3, wrap: 0.25, shadowK: 7, shadowFloor: 0.2,
      rim: null, sky: '#a9c6e8', groundBounce: '#7d7a52', ambI: 0.62,
      ground: rgbAll({ grass: '#4f8f3a', grass2: '#62a347', stripe: 0.55, dirt: '#b47a4c', track: '#a06c43', chalk: '#f4f0e2', plate: '#f8f5ea' }),
      groundAmb: 0.55, groundKey: 0.8,
      wall: '#2c5f3a', wallBand: '#245233', wallLight: 0.8,
      crowd: rgbAll(Object.assign({}, crowdBase, { seat: '#2f5b3c', riser: '#24452e', shirts, skins, light: 0.85, haze: '#9fb0a0', hazeK: 0.15, full: 0.8 })),
      skyTop: '#a9c6e8', dof: 0, exposure: 1.0, aces: false, sat: 1.05, grade: [1.03, 1.0, 0.94],
      finish: { type: 'pixel', levels: 9, dither: 1.0 },
    },
    // C: clean. A soft high key, strong fill, little shadow, a quiet light-grey stand.
    clay: {
      key: [0.3, 0.55, 0.78], keyColor: '#ffffff', keyI: 1.7, wrap: 0.45, shadowK: 5, shadowFloor: 0.45,
      rim: [-0.3, -0.9, 0.3], rimColor: '#e8f0ff', rimI: 0.5,
      sky: '#e9eef6', groundBounce: '#b6c0b0', ambI: 0.95,
      ground: rgbAll({ grass: '#5ea25a', grass2: '#6cb266', stripe: 0.35, dirt: '#c8946a', track: '#bf8d66', chalk: '#ffffff', plate: '#ffffff' }),
      groundAmb: 0.75, groundKey: 0.6,
      wall: '#c9d0db', wallBand: '#bfc7d3', wallLight: 0.95,
      crowd: rgbAll(Object.assign({}, crowdBase, { seat: '#dfe4ec', riser: '#d3d9e2', shirts: ['#b9c1ce', '#c8cfda', '#aab3c2', '#ffb79f', '#a9bdf5', '#d0d6df'], skins: ['#c3c8d1', '#b4bac5'], light: 1.0, haze: '#eef1f5', hazeK: 0.35, full: 0.75, capC: '#a3acbb' })),
      skyTop: '#eef1f5', dof: 2.5, exposure: 1.0, aces: false, sat: 1.0, lift: [0.02, 0.025, 0.035],
      finish: { type: 'toon', b0: 0.5, b1: 0.85, b2: 1.18, k0: 0.55, k1: 0.95, k2: 1.25, k3: 1.5, shadowTint: [0.85, 0.9, 1.15], ink: [0.09, 0.11, 0.16], inner: 0.45 },
    },
  };
  for (const k in LOOKS) { const L = LOOKS[k]; ['keyColor', 'sky', 'groundBounce', 'rimColor', 'wall', 'wallBand', 'skyTop'].forEach((f) => { if (typeof L[f] === 'string') L[f] = T.hex(L[f]); }); }

  /* The data's facts for the sample spot (Daulton Varsho, bats left, zone 1.50 to 3.29 ft). */
  const BATTER = { bats: 'L', szTop: 3.29, szBot: 1.5 };
  // Contract section 2: column c's centre is (c - 2) * 0.553 ft (catcher's view); row r's centre
  // is a third of the zone per row, row 0 high.
  function cellPoint(cell, b) {
    b = b || BATTER; const r = Math.floor(cell / 5), c = cell % 5;
    const x = (c - 2) * 0.553;
    const zr = (4 - r) + 0.5; // 0.5 .. 4.5 rows up from the bottom of the low chase row
    const zN = (zr - 1) / 3;  // zone bottom 0, top 1
    return [x, 0, b.szBot + zN * (b.szTop - b.szBot)];
  }
  function gridCorners(b) {
    b = b || BATTER; const h = (b.szTop - b.szBot) / 3;
    return { x0: -2.5 * 0.553, x1: 2.5 * 0.553, z0: b.szBot - h, z1: b.szTop + h, zx0: -1.5 * 0.553, zx1: 1.5 * 0.553, zz0: b.szBot, zz1: b.szTop, cw: 0.553, rh: h };
  }

  /* Cameras. From behind the mound, raised, long lens. frame is feet across at the look point. */
  function cameraFor(view, w, h) {
    if (view === 'mound') {
      // the pitcher's own eyes, from the rubber, set position: the batter, catcher and umpire 56 feet away
      const frameW = w > h ? 10.5 : 6.3;
      return T.camera([-0.4, 56.5, 7.1], [w > h ? 0.6 : 1.1, 0, w > h ? 3.25 : 2.75], frameW, w, h);
    }
    if (view === 'pitch') {
      // the pitch, watched from just behind the pitcher's eye: the ball leaves big and shrinks into the mitt
      const frameW = w > h ? 13 : 6.1;
      return T.camera([0.3, 62.5, 7.7], [w > h ? 0.4 : 0.75, 0, 3.15], frameW, w, h);
    }
    if (view === 'cf') {
      // the broadcast shot: behind the mound and raised, long lens, the pitcher in front
      const frameW = w > h ? 17 : 10.5;
      return T.camera([1.7, 168, 19], [w > h ? 0.4 : 0.6, 18, 0.6], frameW, w, h);
    }
    if (view === 'coach') return T.camera([1.2, 9.5, 5.2], [0, 0, 5.2], 2.6, w, h);
    if (view === 'hero') return T.camera([1.7, 168, 19], [0.5, 15, 2.9], w > h ? 16 : 10.6, w, h);
    return null;
  }

  /* The figures for one frame of the spot. f: 'aim' | 'release' | 'mid' | 'arrive'. */
  function figuresFor(f, opts) {
    opts = opts || {};
    const figs = [];
    const bPose = f === 'arrive' ? 'batSwing' : f === 'mid' ? FIG.blend(FIG.POSES.batStance, FIG.POSES.batStride, 1) : f === 'release' ? FIG.blend(FIG.POSES.batStance, FIG.POSES.batStride, 0.5) : 'batStance';
    figs.push(FIG.build('batter', KITS.batter, { pos: [2.85, -0.75, 0], fwd: [-1, 0] }, bPose));
    // the catcher sets up on the target: his mitt sits on the line from the eye through the
    // target point, where that line meets his receiving plane
    const tgt = opts.mitt || cellPoint(opts.cell == null ? 12 : opts.cell);
    const eye = opts.eye || [-0.4, 56.5, 7.1], cpos = [0.1, -3.7, 0], ry = -2.35;
    const k = (ry - tgt[1]) / (tgt[1] - eye[1]);
    const mc = [tgt[0] + (tgt[0] - eye[0]) * k, ry, tgt[2] + (tgt[2] - eye[2]) * k];
    const crouch = JSON.parse(JSON.stringify(FIG.POSES.crouch));
    // the mitt's centre sits 0.08 ahead of and 0.24 above the wrist (std-figures.js)
    crouch.handL = [mc[0] - cpos[0], mc[1] - 0.08 - cpos[1], mc[2] - 0.24];
    const low = Math.max(0, 2.3 - mc[2]);
    crouch.torsoPitch += low * 16; crouch.headPitch -= low * 14; crouch.pelvis[2] -= low * 0.12;
    figs.push(FIG.build('catcher', KITS.catcher, { pos: cpos, fwd: [0, 1] }, crouch));
    figs.push(FIG.build('ump', KITS.ump, { pos: [0.95, -6.3, 0], fwd: [0, 1] }, 'ump'));
    if (opts.pitcher === true) {
      const pp = f === 'release' ? 'release' : f === 'mid' || f === 'arrive' ? 'follow' : 'set';
      const p = FIG.build('pitcher', KITS.pitcher, { pos: [0, 60.5, 0.83], fwd: [0, -1] }, pp);
      figs.push(p);
    }
    return figs;
  }

  /* The sample pitch for the frames: Yamamoto's curveball (77.9 mph, pfx 12.9 in across, -16.1
     in up: the pack's numbers), aimed down and away at cell 21, landing at cell 16. */
  function samplePitch() {
    const rel = [-1.85, 54.3, 5.75];
    const aimed = cellPoint(21), actual = [cellPoint(16)[0] + 0.12, 0, cellPoint(16)[2] - 0.08];
    const P = T.pitchPath(rel, actual, 77.9, 12.9, -16.1, 60);
    return { rel, aimed, actual, ...P };
  }

  function renderView(canvas, o) {
    const cam = o.cam || cameraFor(o.view, o.w, o.h);
    const L = LOOKS[o.look];
    const figs = o.figures || figuresFor(o.frame || 'aim', Object.assign({ eye: cam.pos }, o));
    const R = T.render(canvas, { cssW: o.w, cssH: o.h, res: o.res || 1, dpr: o.dpr, cam: o.cam || cam, look: L, figures: figs, mats: MATS, matList: M.list, transparent: o.transparent });
    return { cam, R };
  }

  window.STD_SCENE = { MATS, M, KITS, LOOKS, BATTER, cellPoint, gridCorners, cameraFor, figuresFor, samplePitch, renderView };
})();
