/* THE STAGE.
 *
 * The night, drawn in Run The Tour's putt putt style: a small 3D world seen from above at 42 degrees,
 * painted by the same renderer (PXHD, lifted out of golf by scripts/setlist/extract_pxhd.mjs), so the
 * light from the top left, the five step hue shifted ramps, the contact shadows and the soft outline
 * inside each shape are exactly the golf world's. Chunky pixels, chibi people, a lawn you could putt on.
 *
 * The venue is a lawn in front of an outdoor stage, the way the Bend photos look, and the show runs from
 * daylight into night: Set I in the sun, the set break at dusk, Set II and the encore under the rig.
 *
 * IT IS A RENDERER AND NOTHING ELSE. Every cue it is handed comes out of showBeats(), which comes out of
 * the result that was already scored, so the picture can never disagree with the scorecard. Nothing in
 * here reads a song, a score or a rule. scripts/setlist/check_data.mjs holds that line.
 *
 * HOW IT IS DRAWN (the solids and the people are in world.js). Everything is solids in feet (x east, y toward you, z up), splatted into a grid of
 * cells, each with a material and the way its surface faces. PXHD paints that grid. The world is drawn
 * once into two layers (what stands behind the band, and the gear in front of it); the band and the
 * crowd are small worlds of their own, drawn once per pose and stood in place every frame. Light that
 * moves (the rig and the dusk) is laid over the top. There is no video wall: the band plays in front
 * of its own light rig, six flown diamond pods of truss, which is what a Goose show looks like.
 *
 * THE BAND IS DRAWN FROM ITS GEAR. A face is two dots. What a fan knows is the yellow kit on its riser,
 * the keys stage left, the rug, the hats and where each player stands. No likeness, and no copy of
 * anybody's artwork: the kick drum head is an abstract swirl.
 *
 * SHOT LIKE AN HD-2D GAME. The pixels stay pixels; what is around them is a console's: a real sky over
 * the treeline (noon blue, a dusk, a night with stars, a moon and the rig glowing up behind the trees),
 * tilt shift depth of field so the stage is the one sharp thing, a vignette and a grade, backlights
 * firing over the band into the crowd, smoke on the deck, dust in the beams, fireflies, confetti on a
 * bustout and the final, spark fountains for a night that went off, and a camera that kicks on both.
 * A device that cannot keep up drops the decoration first (`lite`), never the light or the people.
 *
 * VENUES are a table so the next one is a row. A venue changes the room and how many people it holds.
 * It never changes a score.
 */
import PXHD from './pxhd.js?v=2';
import { ROOMS, RIGS } from './rooms.js?v=4';
/* The camera, the solids, the people, the band and the venue's painted layers live in world.js, which
   the room builder in world-worker.js and the menus share. This file lights and moves them. */
import {
  ART, WPX, sx, sy, depth, rgb, mixc, clamp01, hash, mulberry32,
  canvas, SKINS, HAIRS, face, personSprite, DECK, FIX,
  podCorners, CE, HPX, PAX, PAY, bandPose, buildWorld, rigFor, PLAYERS, KEY_SEQ, crowdVariants, crowdPose, GLOWS,
} from './world.js?v=5';

/* The rooms a night can be played in, by id. setlist/venues.js says how each is earned and
   setlist/rooms.js what each looks like; this file only draws whichever it is handed. */
export { ROOMS };

// ── the stage ──────────────────────────────────────────────────────────────
const PALETTES = {
  jam:    [[160, 100, 255], [70, 220, 235]],
  peak:   [[255, 80, 180], [240, 240, 255]],
  cover:  [[255, 112, 96], [80, 225, 205]],
  encore: [[245, 245, 255], [255, 100, 130]],
  ballad: [[80, 130, 255], [170, 120, 255]],
  // A Space song: a slow wash of deep blue and violet, no white.
  space:  [[40, 70, 170], [120, 70, 210]],
  opener: [[90, 235, 140], [240, 240, 255]],
  closer: [[70, 215, 225], [255, 90, 190]],
  house:  [[170, 160, 220], [120, 180, 230]],
};
const ROTATION = ['jam', 'closer', 'ballad', 'cover', 'opener', 'peak'];

/* The sky does the lighting. A multiply over the whole world: white at noon, warm through the
   afternoon, rose at dusk and blue at night, keyed to how far through the show the night is. */
const SKY = [
  [0, [255, 255, 255]], [.35, [255, 238, 216]], [.5, [236, 176, 166]], [.62, [112, 104, 160]], [1, [58, 62, 112]],
];
function skyAt(p){
  for (let i = 1; i < SKY.length; i++){
    if (p <= SKY[i][0]){
      const [a, ca] = SKY[i - 1], [b, cb] = SKY[i];
      return mixc(ca, cb, (p - a) / (b - a));
    }
  }
  return SKY[SKY.length - 1][1];
}

/* Indoors the room is lit by the house and then by the rig, never by the sky. */
const INDOOR = [118, 106, 138];

const WORLDS = new Map();

/* ONE WORKER FOR EVERY ROOM, started the first time a room is asked for. It answers each job with the
   room's layers and the band's frames as ImageBitmaps, or null, and null means build it here. A worker
   that fails or takes longer than eight seconds is the same as none. */
let worker = null, jobs = 0;
const waiting = new Map();
function worldWorker(){
  if (worker !== null) return worker;
  try {
    worker = typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
      ? new Worker(new URL('./world-worker.js?v=7', import.meta.url), { type: 'module' }) : false;
  } catch (err) { worker = false; }
  if (worker){
    worker.onmessage = e => { const cb = waiting.get(e.data.id); if (cb){ waiting.delete(e.data.id); cb(e.data); } };
    worker.onerror = () => { for (const cb of waiting.values()) cb(null); waiting.clear(); worker = false; };
  }
  return worker;
}
function buildOffThread(vid, seed, dress){
  return new Promise(res => {
    const w = worldWorker();
    if (!w) return res(null);
    const id = ++jobs;
    const timer = setTimeout(() => { waiting.delete(id); res(null); }, 8000);
    waiting.set(id, d => { clearTimeout(timer); res(d && !d.error ? d : null); });
    w.postMessage({ id, vid, seed, dress });
  });
}

export function createStage(view, opts = {}){
  const vid = ROOMS[opts.venue] ? opts.venue : 'lawn';
  const R = ROOMS[vid], RIG = rigFor(R, RIGS), FL = R.floor;
  const indoor = R.sky === 'indoor';
  const reduce = !!opts.reduce;
  const seed = (opts.seed | 0) || 7;
  const rand = mulberry32(seed ^ 0x5bd1e995);

  /* The venue and the band are a second of work on a phone, so a night is built once and shared: the
     crowd shot on the scorecard is the same world the show was just played in.
     THE BUILD IS OFF THE MAIN THREAD. Measured on a phone-class profile (4x CPU) it froze the page for
     2.4 s as the lights went down, 1.7 s of it the room. world-worker.js builds it with the same code
     and hands back pictures; until they land the house is dark, and `ready` says when they have. A
     browser with no module worker or OffscreenCanvas builds it here, as before. `sync` asks for the
     old way outright. */
  // What the band wears (outfits.js); a night in other clothes is another night to build.
  const dress = opts.dress || null;
  const wkey = vid + ':' + seed + ':' + JSON.stringify(dress);
  let back = null, front = null, frames = null, ready;
  let preCrowd = null, spriteCache = null;
  const take = w => {
    back = w.back; front = w.front; frames = w.frames; preCrowd = w.crowd || null;
    if (spriteCache && preCrowd) for (const k in preCrowd) if (!spriteCache.has(k)) spriteCache.set(k, preCrowd[k]);
  };
  const keep = w => {
    WORLDS.set(wkey, w);
    if (WORLDS.size > 2) WORLDS.delete(WORLDS.keys().next().value);
    return w;
  };
  const known = WORLDS.get(wkey);
  if (known && !known.then){ take(known); ready = Promise.resolve(); }
  else if (!known && opts.sync){ take(keep(buildWorld(R, RIG, seed, false, dress))); ready = Promise.resolve(); }
  else {
    const job = known || buildOffThread(vid, seed, dress).then(w => keep(w || buildWorld(R, RIG, seed, false, dress)));
    if (!known) WORLDS.set(wkey, job);
    ready = job.then(w => { if (!dead){ take(w); draw(); } });
  }

  // The crowd: forty kinds of person, several hundred people, back to front.
  const variants = crowdVariants(rand, seed);
  spriteCache = new Map(preCrowd ? Object.entries(preCrowd) : []);
  const spriteOf = (vi, pose) => {
    const key = vi + ':' + pose;
    let s = spriteCache.get(key);
    if (!s){
      s = personSprite(variants[vi], crowdPose(variants[vi], pose), true);
      spriteCache.set(key, s);
    }
    return s;
  };
  const crowd = [];
  /* Room to see the lawn between people, the way the putt putt world shows its ground: packed at the
     rail and thinning toward the blankets at the back. */
  for (let y = FL.y0; y < FL.y1; y += 2.3 + (y - 5) * .02){
    const half = FL.half(y), gap = FL.gap(y);
    for (let x = -half; x < half; x += gap + rand() * 1.2){
      const c = { x: x + (rand() - .5) * .5, y: y + (rand() - .5) * .5,
        v: (rand() * variants.length) | 0, t: Math.min(1, (y - 5) / 40 * .6 + rand() * .45),
        phase: rand() * Math.PI * 2, jumpy: .4 + rand() * .6,
        phone: rand() < .55, sign: rand() < .035, pose: 'down', until: 0 };
      if (!FL.skip || !FL.skip(c.x, c.y)) crowd.push(c);
    }
  }
  /* What a person does on top of that comes off a stream of its own, so adding it moved nobody. A few
     knots of dancers who move as one, and a glow stick for the encore in about a third of hands. */
  const more = mulberry32(seed ^ 0x6a09e667);
  const knots = Array.from({ length: 5 }, () => ({ x: (more() * 2 - 1) * 14, y: FL.y0 + 4 + more() * Math.max(4, (FL.deep - FL.y0) * .6), ph: more() * 7 }));
  for (const c of crowd){
    c.glow = more() < .32;
    const k = knots.find(K => (c.x - K.x) ** 2 + ((c.y - K.y) * 1.6) ** 2 < 7);
    c.knot = k ? k.ph : null;
  }
  /* The taper's stand: two mics on a tall pole in the middle of the lawn, up all night, a little to
     one side of dead centre the way a taper section is. */
  {
    const ty = FL.y0 + (FL.deep - FL.y0) * .5;
    let tx = 2.2;
    if (FL.skip && FL.skip(tx, ty)) tx = -2.2;
    if (!FL.skip || !FL.skip(tx, ty)) crowd.push({ x: tx, y: ty, taper: true, t: 0 });
  }
  crowd.sort((a, b) => a.y - b.y);
  /* THE CROWD SHOT. The same night, after the last song, framed on the lawn instead of the stage: the
     rail is the best night anybody drafted and the merch tent is the worst, and one fan in the middle
     of it all is you, in the follow spot. Where you stand is the rank. Nothing here reads a score: the
     page hands over a depth between 0 (the rail) and 1 (the tent). */
  const shot = opts.shot === 'crowd' && opts.you ? opts.you : null;
  const LAWN_Y0 = FL.y0, LAWN_Y1 = FL.deep;
  const lawnY = d => LAWN_Y0 + clamp01(d) * (LAWN_Y1 - LAWN_Y0);
  let you = null;
  if (shot){
    const ty = lawnY(shot.d), r2 = mulberry32((shot.seed | 0) || 11);
    const half = FL.half(ty), tx = (r2() * 2 - 1) * half * .45;
    let bestD = 1e9;
    for (const c of crowd){
      if (c.taper) continue;
      const dd = (c.y - ty) ** 2 * 6 + (c.x - tx) ** 2 * .08;
      if (dd < bestD){ bestD = dd; you = c; }
    }
    variants.push({ skin: SKINS[1], hair: HAIRS[0], style: 'short', hat: 'capback', hatC: '#f6f1e4',
      shirt: '#37c5d5', dye: 0, stripe: null, pants: '#2e2e38', shoes: '#f0ece2', sign: ['#37c5d5', '#f6f1e4'] });
    you.v = variants.length - 1; you.t = 0; you.you = true; you.pose = 'up'; you.jumpy = 1;
  }
  // Everybody's first pose up front, so the first frame is not a stall. A room from the worker brings
  // every pose already painted, so this is free then; while it is still coming, it waits for it.
  const warm = () => { for (let vi = 0; vi < variants.length; vi++) spriteOf(vi, 'down'); };
  if (back) warm(); else ready.then(() => { if (!dead) warm(); });

  /* The pixel battens along every pod's truss: a dot every few inches round the diamond, each knowing
     its pod and how far round it sits, so a chase can run round one pod or across all of them. */
  const PODS = RIG.pods.map(([cx, cz], pi) => ({ cx, cz, pi, C: podCorners(cx, cz, RIG.podR) }));
  const PODPX = [];
  for (const P of PODS){
    const n = Math.max(6, Math.round(RIG.podR * 2.4));
    for (let k = 0; k < 4; k++){
      const [ax, az] = P.C[k], [bx, bz] = P.C[(k + 1) % 4];
      for (let i = 0; i < n; i++){
        const u = (i + .5) / n;
        PODPX.push({ x: ax + (bx - ax) * u, z: az + (bz - az) * u, pi: P.pi, side: k, a: (k + u) / 4 });
      }
    }
  }

  const out = view.getContext('2d');
  /* Five buffers, all the size of what the camera sees. `g` is the world as it is painted; `lg` the
     light falling on it, multiplied in, so a beam's pool turns the rug and the people under it its own
     colour; `eg` what glows of its own accord (the pods, lenses, bulbs, phones and the beams in the
     haze), added on top; and two small ones the glow is blurred through for the bloom. */
  let buf = canvas(4, 4), g = buf.getContext('2d');
  let lmap = canvas(4, 4), lg = lmap.getContext('2d');
  let emit = canvas(4, 4), eg = emit.getContext('2d');
  let beams = canvas(4, 4), bg = beams.getContext('2d');
  let bloomA = canvas(2, 2), bloomB = canvas(1, 1);
  /* THE BLOOM IS ITS OWN SMALL CANVAS, stretched over the picture by the browser and blended in with
     `screen`. Drawn at full screen resolution every frame it cost five times the rest of the frame put
     together (measured: 83ms against 17), because scaling three million pixels twice a frame is work a
     canvas does on the CPU. Scaled by CSS it is the compositor's job, which is what a GPU is for. */
  const glow = document.createElement('canvas');
  glow.setAttribute('aria-hidden', 'true');
  glow.style.cssText = view.style.cssText;
  Object.assign(glow.style, { pointerEvents: 'none', imageRendering: 'auto', mixBlendMode: 'screen' });
  if (view.parentElement) view.parentElement.insertBefore(glow, view.nextSibling);
  const gg = glow.getContext('2d');
  /* DEPTH OF FIELD, the tilt shift every HD-2D game is shot with: the treeline behind the stage and the
     back of the lawn go soft, and the stage between them is pin sharp. It is the picture downsampled and
     stretched back up by the browser, laid over the sharp one through a CSS mask, so it costs the page one
     small drawImage a frame and the compositor the rest. */
  const dof = document.createElement('canvas');
  dof.setAttribute('aria-hidden', 'true');
  let dofA = canvas(2, 2);
  /* The grade: a vignette that pulls the eye to the stage, and a cool wash in the corners at night. A
     div over the picture rather than pixels in it, so it is free. */
  const vig = document.createElement('div');
  vig.setAttribute('aria-hidden', 'true');
  vig.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  if (view.parentElement){
    view.parentElement.insertBefore(dof, view.nextSibling);
    view.parentElement.insertBefore(vig, glow.nextSibling);
  }
  const dc = dof.getContext('2d');
  let k = 1, visW = 4, visH = 4, camX = 0, camY = 0;
  /* Haze: soft blobs of smoke the beams are seen through, so a beam is never a flat triangle. */
  const haze = canvas(64, 64);
  {
    const hg = haze.getContext('2d'), im = hg.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++){
      let v = 0, a = 1, f = 1 / 16;
      for (let o = 0; o < 3; o++){
        const X = x * f, Y = y * f, xi = Math.floor(X), yi = Math.floor(Y), u = X - xi, w = Y - yi;
        const r = (i, j) => hash(((i % (64 * f)) + 64 * f) % (64 * f), ((j % (64 * f)) + 64 * f) % (64 * f), o + 40);
        const su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w);
        v += a * (r(xi, yi) * (1 - su) * (1 - sw) + r(xi + 1, yi) * su * (1 - sw) + r(xi, yi + 1) * (1 - su) * sw + r(xi + 1, yi + 1) * su * sw);
        a *= .5; f *= 2;
      }
      im.data[(y * 64 + x) * 4 + 3] = Math.round(255 * clamp01(.25 + (v / 1.75) * .95));
    }
    hg.putImageData(im, 0, 0);
  }
  let hazePat = null;

  const st = {
    pal: PALETTES.house, palFrom: PALETTES.house, palT: 1,
    light: 0, lightWant: 0, house: 1, houseWant: 1,
    energy: .2, energyWant: .2, density: .8, densityWant: .8,
    sky: 0, skyWant: 0,
    band: false, encore: false, bow: false,
    signsUntil: 0, flashUntil: 0, jumpUntil: 0, armsUntil: 0, slow: false, feel: null, segueUntil: 0, strobeUntil: 0, mode: 0, rot: 0,
    jam: false, soloist: null, fillUntil: 0,
    arc: null, push: 0, dipUntil: 0, ribbonAt: 0, bannerAt: 0, flameUntil: 0,
  };
  /* THE BLOCKING: where each player is standing and where he is headed. The band walks on from the
     wings when a set starts and off at the break, the soloist steps down to the lip on a jam's peak and
     back, and everyone comes down to the front for the bow. Nothing here reads a song: it follows the
     same cues the lights do. */
  const SOLO = { guitar: { x: -5.6, y: -2.5, z: DECK.z }, keys: { x: -9.6, y: -2.8, z: DECK.z } };
  const BOW = [{ x: -7.5, y: -2.6 }, { x: -2.6, y: -2.4 }, { x: 2.6, y: -2.4 }, { x: 7.5, y: -2.6 }];
  const WING = [-16.5, -16.5, 16.5, 16.5];
  const blk = PLAYERS.map(([, m], i) => ({ x: WING[i], y: m.y, z: m.z, walking: false }));
  let snapBand = true;
  function markOf(i, pose){
    const [role, m] = PLAYERS[i];
    if (st.bow) return { x: BOW[i].x, y: BOW[i].y, z: DECK.z };
    if (!st.band) return { x: WING[i], y: m.y, z: m.z };
    if (st.soloist === role) return SOLO[role];
    return pose.at;
  }
  let raf = 0, dead = false, last = 0, now = performance.now(), pdt = 0;
  /* A phone that cannot draw all of this at thirty frames a second drops the decoration first: the
     dust, the fireflies and the shadows under the crowd. The light, the band and the crowd stay. */
  let costMs = 0, lite = false;

  /* The sky over the treeline: stars, a moon and the day's clouds, fixed by the seed so a replay of the
     same night has the same sky. Rows are world rows, everything above the trees. */
  // The horizon is the bottom of the canopy; the sky runs from the top of the shot down to it.
  const SKY_ROWS = sy(-30, 11);
  const stars = Array.from({ length: 150 }, () => ({ x: rand() * WPX, y: rand(),
    b: .35 + rand() * .65, tw: rand() * 6.3, big: rand() < .08 }));
  const clouds = Array.from({ length: 7 }, () => ({ x: rand() * WPX, y: rand(), w: 22 + rand() * 34, v: .6 + rand() * 1.2 }));

  /* Particles, in feet. Confetti falls lit by whatever is lighting the room; sparks and the dust in the
     beams glow on their own. Nothing here is spawned when motion is reduced. */
  const confetti = [], sparks = [], motes = [];
  for (let i = 0; i < 46; i++) motes.push({ x: -14 + rand() * 28, y: -13 + rand() * 16, z: 5 + rand() * 15,
    ph: rand() * 6.3, s: .2 + rand() * .5 });
  const flies = Array.from({ length: 22 }, () => ({ x: (rand() < .5 ? -1 : 1) * (22 + rand() * 22),
    y: -14 + rand() * 60, z: 1 + rand() * 4, ph: rand() * 6.3 }));
  let sparkUntil = 0, shakeUntil = 0, shakeAmp = 0, shook = '';
  /* A camera that kicks on the big moments, the way a game sells a hit: a few screen pixels for a
     quarter of a second, applied to the picture's layers together so the bloom and the blur stay on it. */
  function shake(){
    let tr = '0px 0px';
    if (!reduce && now < shakeUntil){
      const f = (shakeUntil - now) / 320, a = shakeAmp * f * f;
      tr = `${(Math.sin(now * .09) * a).toFixed(1)}px ${(Math.cos(now * .113) * a).toFixed(1)}px`;
    }
    /* THE PUSH-IN: at a jam's peak the camera leans in on the stage, seven percent, and eases back out
       on the release. Applied to every layer of the picture together, like the kick. Never with
       reduced motion. */
    const sc = reduce ? '1' : (1 + .07 * st.push).toFixed(3);
    if (tr + sc === shook) return;
    shook = tr + sc;
    for (const el of [view, dof, glow, vig]){ el.style.translate = tr; el.style.scale = sc; el.style.transformOrigin = '50% 40%'; }
  }
  const FETTI = ['#ff4f7a', '#ffd23f', '#3fd0ff', '#8a5bff', '#5be08a', '#ffffff', '#ff8a3c'];
  /* Every colour a piece can show, worked out once: its face and its back, at eight levels of the
     room's light. A colour string built per piece per frame was the most expensive line in the frame. */
  const FETTI_SH = FETTI.map(c => [0, .35].map(b => Array.from({ length: 8 }, (_, l) =>
    PXHD.mix(PXHD.mix(c, '#000000', b), '#000000', 1 - (.45 + .55 * l / 7)))));
  function burst(n){
    if (reduce) return;
    if (lite) n = n >> 1;
    for (let i = 0; i < n; i++){
      confetti.push({ x: -15 + Math.random() * 30, y: -3 + Math.random() * 6, z: RIG.trussZ - .5,
        vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 6, vz: 3 + Math.random() * 6,
        c: (Math.random() * FETTI.length) | 0, ph: Math.random() * 6.3, f: 3 + Math.random() * 5 });
    }
    if (confetti.length > 600) confetti.splice(0, confetti.length - 600);
  }
  // A shadow under everybody on the lawn, so a crowd stands on the grass instead of floating over it.
  const shade = canvas(12, 5);
  {
    const sg = shade.getContext('2d'), gr = sg.createRadialGradient(6, 2.5, 0, 6, 2.5, 6);
    gr.addColorStop(0, 'rgba(10,6,20,.42)'); gr.addColorStop(.7, 'rgba(10,6,20,.2)'); gr.addColorStop(1, 'rgba(10,6,20,0)');
    sg.setTransform(1, 0, 0, .42, 0, 1.45); sg.fillStyle = gr; sg.beginPath(); sg.arc(6, 2.5, 6, 0, 7); sg.fill();
  }

  function fit(){
    const dpr = window.devicePixelRatio || 1;
    const host = view.parentElement || document.body;
    const cw = host.clientWidth || window.innerWidth, ch = host.clientHeight || window.innerHeight;
    const devW = Math.round(cw * dpr), devH = Math.round(ch * dpr);
    /* Chunky, the way the putt putt world is: about 115 pixels across a phone, so a person is twenty
       pixels tall and three or four screen pixels make one of theirs. Never so small a scale that the
       screen would see past the edge of the world. */
    k = shot ? Math.max(1, Math.round(devW / 340))
      : Math.max(1, Math.min(Math.floor(devW / 140), Math.floor(devH / 260)));
    k = Math.max(k, Math.ceil(devW / WPX), Math.ceil(devH / HPX));
    visW = Math.ceil(devW / k); visH = Math.ceil(devH / k);
    view.width = visW * k; view.height = visH * k;
    view.style.width = (visW * k / dpr) + 'px';
    view.style.height = (visH * k / dpr) + 'px';
    buf = canvas(visW, visH); g = buf.getContext('2d');
    lmap = canvas(visW, visH); lg = lmap.getContext('2d');
    emit = canvas(visW, visH); eg = emit.getContext('2d');
    beams = canvas(visW, visH); bg = beams.getContext('2d');
    bloomA = canvas(Math.ceil(visW / 3), Math.ceil(visH / 3));
    bloomB = canvas(Math.ceil(visW / 9), Math.ceil(visH / 9));
    glow.width = Math.ceil(visW / 2); glow.height = Math.ceil(visH / 2);
    /* The grade is on the picture and on its soft copy, never on the bloom, which is light added
       on top and would only be pushed into white. */
    view.style.filter = 'saturate(1.14) contrast(1.06)';
    glow.style.cssText = view.style.cssText;
    Object.assign(glow.style, { pointerEvents: 'none', imageRendering: 'auto', mixBlendMode: 'screen',
      width: view.style.width, height: view.style.height, filter: 'none' });
    hazePat = bg.createPattern(haze, 'repeat');
    camX = Math.round(sx(0) - visW / 2);
    /* THE SHOT. The front of the deck sits a little under halfway down a phone and a little lower on
       a wide screen, so there is always sky over the trees and lawn under the rail. */
    const tall = visH / visW > 1.4;
    camY = Math.round(Math.min(Math.max(0, DECK_FRONT - (tall ? .47 : .56) * visH), HPX - visH));
    // The crowd shot sits the back of the lawn on the bottom of the frame and lets the stage fill the top.
    if (shot) camY = Math.round(Math.min(Math.max(0, sy(FL.back + .5, 0) + 5 - visH), HPX - visH));
    dofA = canvas(Math.max(1, Math.ceil(visW / 3)), Math.max(1, Math.ceil(visH / 3)));
    dof.width = Math.ceil(visW / 4); dof.height = Math.ceil(visH / 4);
    dof.style.cssText = view.style.cssText;
    // Sharp from just above the back wall to a few rows into the crowd; soft beyond, either side.
    const pc = r => (100 * (r - camY) / visH).toFixed(1) + '%';
    const a0 = pc(BACK_TOP - 10), a1 = pc(BACK_TOP + 6), b0 = pc(sy(22, 0)), b1 = pc(sy(44, 0));
    // The crowd shot is about the lawn, so all of it stays sharp; only the trees behind the stage go soft.
    const mask = shot ? `linear-gradient(to bottom, #000 0%, #000 ${a0}, transparent ${a1}, transparent 100%)`
      : `linear-gradient(to bottom, #000 0%, #000 ${a0}, transparent ${a1}, transparent ${b0}, rgba(0,0,0,.7) ${b1}, rgba(0,0,0,.7) 100%)`;
    Object.assign(dof.style, { pointerEvents: 'none', imageRendering: 'auto', maskImage: mask, webkitMaskImage: mask,
      width: view.style.width, height: view.style.height });
    draw();
    if (shot && opts.onFit) opts.onFit(marks());
  }
  /* Where the page should hang its labels, as fractions of the picture: over your head, and the row a
     random draft would stand in. */
  function marks(){
    if (!shot || !you) return null;
    const [px, py] = P2(you.x, you.y, 0);
    return { you: [(px - camX) / visW, (py - 24 - camY) / visH],
      rnd: shot.rnd == null ? null : (P2(0, lawnY(shot.rnd), 0)[1] - camY) / visH };
  }
  // A room whose back wall is the picture keeps it sharp higher up (`dofZ`).
  const DECK_FRONT = sy(0, DECK.z), BACK_TOP = sy(-16, Math.max(RIG.wallZ, R.dofZ || 0));

  function palette(){
    const t = clamp01(st.palT);
    return [mixc(st.palFrom[0], st.pal[0], t), mixc(st.palFrom[1], st.pal[1], t)];
  }

  /* The pods' pixels. Four looks, the same four the night cycles through: a chase round each diamond,
     the pods trading on the beat, a wave across the stage, and a sparkle. Each pod is one colour of the
     song's pair and its neighbour the other. */
  function podPixels(c2, p, t, pulse, beatN, strobe){
    const e = st.energy, L = st.light, mode = Math.floor(st.mode / 3) % 4, Y = RIG.podY;
    const base = (.3 + .7 * Math.max(L, .2)) * (1 - st.house * .5) * (.8 + .2 * pulse);
    for (const q of PODPX){
      let s;
      if (strobe) s = 1;
      else if (mode === 0) s = .15 + .85 * Math.max(0, Math.cos((q.a - t * (.25 + e * .5) + q.pi * .17) * Math.PI * 2)) ** 3;
      else if (mode === 1) s = (q.pi + beatN) % 2 ? .95 : .18;
      else if (mode === 2) s = .2 + .8 * (.5 + .5 * Math.sin(q.x * .45 - t * (1.5 + e * 2)));
      else s = ((Math.floor(q.x * 7 + q.z * 13) + ((t * 8) | 0)) % 9 === 0) ? 1 : .2;
      const col = strobe ? [255, 255, 255] : p[(q.pi + (q.side > 1 ? 1 : 0)) % 2];
      const [px, py] = P2(q.x, Y + .3, q.z);
      c2.fillStyle = rgb(col, Math.min(1, s * base)); c2.fillRect(px, py, 1, 1);
    }
  }

  const P2 = (x, y, z) => [Math.round(sx(x)), Math.round(sy(y, z))];
  const GLOW_RGB = GLOWS.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));

  /* A cone of light from a lens to where it lands: brightest at the lens and thinning as it spreads,
     the way a beam in haze looks. Drawn into the beam layer, which the haze then breaks up. */
  function cone(c2, a, b, r, c, al){
    const grad = c2.createLinearGradient(a[0], a[1], b[0], b[1]);
    grad.addColorStop(0, rgb(c, Math.min(1, al * 1.6)));
    grad.addColorStop(.6, rgb(c, al * .6));
    grad.addColorStop(1, rgb(c, al * .25));
    c2.fillStyle = grad;
    c2.beginPath(); c2.moveTo(a[0] - 1, a[1]); c2.lineTo(a[0] + 1, a[1]); c2.lineTo(b[0] + r, b[1]); c2.lineTo(b[0] - r, b[1]); c2.closePath(); c2.fill();
  }
  /* A soft pool of light, squashed by the camera's angle when it lies on the ground. */
  function pool(c2, x, y, r, c, al, flat = .6){
    if (al <= .003) return;
    const grad = c2.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgb(c, Math.min(1, al))); grad.addColorStop(.45, rgb(c, Math.min(1, al) * .45)); grad.addColorStop(1, rgb(c, 0));
    c2.save(); c2.translate(x, y); c2.scale(1, flat); c2.translate(-x, -y);
    c2.fillStyle = grad; c2.beginPath(); c2.arc(x, y, r, 0, Math.PI * 2); c2.fill(); c2.restore();
  }
  // A four point glint on a lens that is pointed at you, the way a mover reads in a photo.
  function glint(c2, x, y, c, a, len){
    c2.fillStyle = rgb([255, 255, 255], Math.min(1, a));
    c2.fillRect(x, y, 1, 1);
    for (let i = 1; i <= len; i++){
      const f = a * (1 - i / (len + 1));
      c2.fillStyle = rgb(mixc(c, [255, 255, 255], .5), f);
      c2.fillRect(x - i, y, 1, 1); c2.fillRect(x + i, y, 1, 1); c2.fillRect(x, y - i, 1, 1); c2.fillRect(x, y + i, 1, 1);
    }
  }

  /* The pods in order across the stage, for the ribbon. */
  const PODRANK = {};
  [...PODS].sort((a, b) => a.cx - b.cx).forEach((P, i) => { PODRANK[P.pi] = i; });

  /* THE BUSTOUT BANNER: a cloth that drops from the truss in front of the back wall, hangs for the
     signs to go up, and rolls back up. No words on it, the room knows what a bustout is: the night's
     colours in bands with a row of stars. Painted once, lit by the stage like everything else. */
  const banner = canvas(48, 20);
  {
    const bc = banner.getContext('2d');
    const cols = ['#e8505f', '#f4cc2c', '#37c5d5', '#8a5bff'];
    for (let y = 0; y < 20; y++){ bc.fillStyle = cols[Math.floor(y / 5) % cols.length]; bc.fillRect(0, y, 48, 1); }
    bc.fillStyle = '#fff8e0';
    for (let x = 3; x < 48; x += 7){ bc.fillRect(x, 9, 1, 1); bc.fillRect(x - 1, 10, 3, 1); bc.fillRect(x, 11, 1, 1); }
    bc.fillStyle = '#1b1726'; bc.fillRect(0, 19, 48, 1);
  }
  function drawBanner(t){
    const age = now - st.bannerAt;
    if (!st.bannerAt || age > 4200) return;
    const u = age < 600 ? age / 600 : age > 3600 ? 1 - (age - 3600) / 600 : 1;
    // It hangs from the top of the back wall, above the middle pods, and drops to just over them.
    const mid = Math.max(...PODS.filter(P => Math.abs(P.cx) < 5).map(P => P.cz + RIG.podR), 0);
    const top = RIG.wallZ - .4, len = Math.max(1.6, Math.min(4.2, top - mid - .3));
    const [x0, y0] = P2(-5, RIG.podY - .4, top), [x1, y1] = P2(5, RIG.podY - .4, top - len);
    const h = Math.max(1, Math.round((y1 - y0) * u));
    g.drawImage(banner, 0, 0, 48, Math.max(1, Math.round(20 * u)), x0, y0, x1 - x0, h);
  }
  /* FLAME JETS at the lip on a bustout: short columns of fire, yellow at the nozzle going red. */
  const flames = [];
  function drawFlames(t){
    if (!reduce && now < st.flameUntil){
      for (const x of [-12.5, -6.5, 6.5, 12.5]) for (let n = 0; n < (lite ? 1 : 3); n++)
        flames.push({ x: x + (Math.random() - .5) * .5, y: .1, z: DECK.z + .3, vz: 16 + Math.random() * 8, life: .35 + Math.random() * .2, max: .55 });
    }
    for (let i = flames.length - 1; i >= 0; i--){
      const q = flames[i];
      q.z += q.vz * pdt; q.vz *= 1 - 2.2 * pdt; q.life -= pdt;
      if (q.life <= 0){ flames.splice(i, 1); continue; }
      const k = q.life / q.max, [px, py] = P2(q.x, q.y, q.z);
      eg.fillStyle = k > .7 ? '#fff4c0' : k > .45 ? '#ffc040' : k > .2 ? '#ff7a28' : '#c8301e';
      eg.globalAlpha = Math.min(1, k * 1.6); eg.fillRect(px - 1, py, 2, 2);
    }
    eg.globalAlpha = 1;
  }

  function drawBand(t){
    /* Each player walks toward his mark at about nine feet a second, which crosses the deck in the time
       a set's opening caption is on screen. A cue marked instant, or reduced motion, puts him there. */
    const order = [];
    for (let i = 0; i < PLAYERS.length; i++){
      const pose = bandPose(frames, i, t, st), want = markOf(i, pose), B = blk[i];
      const dx = want.x - B.x, dy = want.y - B.y, d = Math.hypot(dx, dy);
      if (snapBand || reduce || d < .05){ B.x = want.x; B.y = want.y; B.z = want.z; B.walking = false; }
      else {
        const k = Math.min(1, 9 * pdt / d);
        B.x += dx * k; B.y += dy * k; B.z += (want.z - B.z) * k; B.walking = d > .3;
      }
      order.push([i, pose]);
    }
    snapBand = false;
    order.sort((p1, p2) => blk[p1[0]].y - blk[p2[0]].y);
    const fill = now < st.fillUntil;
    for (const [i, pose] of order){
      const B = blk[i], role = PLAYERS[i][0];
      if (Math.abs(B.x) > 15.2) continue;
      let img = pose.img, bob = pose.bob;
      if (B.walking) img = frames.walk[role][Math.floor(t * 7 + i) % 2];
      else if (st.bow && frames.cheer[role] && !pose.onGuitar) img = frames.cheer[role];
      else if (role === 'drums' && fill) img = frames.drums[Math.floor(t * 14) % 4];
      else if (st.jam && st.energy > .6 && !st.bow && (role === 'guitar' || role === 'bass') && st.soloist !== role)
        img = frames.face[role][pose.f % 4];
      if (st.soloist === role && !B.walking) bob = Math.sin(t * 9) > .2 ? 1 : 0;
      const [px, py] = P2(B.x, B.y, B.z);
      g.drawImage(img, px - PAX, py - PAY - bob);
    }
  }

  /* A fill hits the cymbals: one at a time, a white glint on its rim, round the kit. */
  const CYMBALS = [[5.6, -8.8, DECK.z + 4.6], [11.6, -9.6, DECK.z + 5.1], [4.6, -7.8, DECK.z + 3.2], [12.6, -8.2, DECK.z + 4.2]];
  function drawFill(t){
    if (Math.abs(blk[3].x) > 15.2) return;
    if (now < st.fillUntil){
      const k = Math.floor(t * 14), c = CYMBALS[(k >> 1) % CYMBALS.length];
      if (k % 2) return;
      const [px, py] = P2(c[0], c[1], c[2]);
      glint(eg, px, py, [255, 236, 190], .95, 3);
      return;
    }
    /* Between fills a hard song keeps the cymbals alive: on each beat one catches the light, faintly,
       and lets it go. Live only, like the weather. */
    if (!wxLive || lite || !st.band || st.energy < .6) return;
    const ph = t * (86 + st.energy * 46) / 60, b = Math.floor(ph), pl = Math.exp(-(ph - b) * 6);
    if (pl < .35) return;
    const c = CYMBALS[b % CYMBALS.length], [px, py] = P2(c[0], c[1], c[2]);
    glint(eg, px, py, [255, 236, 190], .5 * pl, 2);
  }

  /* A ROADIE at the set break: wing to wing across the deck while the house lights are up, in the two
     frames the world painted with the band (world.js). Live only. */
  let roadie = null;
  function drawRoadie(t){
    if (!roadie || !frames || !frames.roadie) return;
    const x = roadie.dir * (-16.5 + (now - roadie.t0) / 1000 * 6.5);
    if (Math.abs(x) > 16.6 && now - roadie.t0 > 500){ roadie = null; return; }
    if (Math.abs(x) > 15.2) return;
    const [px, py] = P2(x, -5.4, DECK.z);
    g.drawImage(frames.roadie[Math.floor(t * 7) % 2], px - PAX, py - PAY);
  }

  function drawCrowd(t){
    const e = st.energy, lit = st.house > .5;
    const jumping = now < st.jumpUntil, signs = now < st.signsUntil, arms = now < st.armsUntil;
    const top = camY - 20, bot = camY + visH + 50, lft = camX - 20, rgt = camX + visW + 20;
    /* The wave: at the top of a jam it runs across the lawn, rail to rail, one stretch of arms at a time. */
    const wave = !lite && st.arc && st.push > .6 ? ((now - st.arc.t0) / 1000 * 12) % 36 - 18 : null;
    for (const c of crowd){
      c.px = null;
      if (c.t > st.density * (FL.capacity || 1)) continue;
      const [px, py] = P2(c.x, c.y, 0);
      if (py < top || py > bot || px < lft || px > rgt) continue;
      if (c.taper){ drawTaper(px, py); continue; }
      // A pose is held for a while and then reconsidered, so the lawn never moves in lockstep.
      if (c.you) c.pose = 'up';
      else if (now > c.until){
        const r = Math.random();
        let pose = 'down';
        if (st.band && !lit){
          if (signs && c.sign) pose = 'sign';
          else if (arms) pose = r < .75 ? 'up' : 'clap';
          else if (st.encore && c.glow && r < .85) pose = 'glow';
          else if (st.encore && c.phone && r < .55) pose = 'phone';
          else if (st.bow || jumping) pose = r < .7 ? 'up' : 'clap';
          // A ballad sits the back half of the lawn down; the rail stays on its feet.
          else if (st.slow && c.t > .3 && r < .8) pose = 'sit';
          /* The song's feel: an Anthem is sung back with an arm in the air, a Bit gets phones out
             and a laugh, and a Space song brings the glow sticks out. */
          else if (st.feel === 'Anthem' && r < .6) pose = r < .35 ? 'one' : 'up';
          else if (st.feel === 'Bit' && c.phone && r < .6) pose = 'phone';
          else if (st.feel === 'Bit' && r < .35) pose = 'clap';
          else if (st.feel === 'Space' && c.glow && r < .7) pose = 'glow';
          else if (r < e * .55) pose = r < e * .3 ? 'up' : r < e * .42 ? 'one' : 'clap';
        } else if (lit && c.t > .4 && r < .6) pose = 'sit';
        c.pose = pose;
        c.until = now + 1500 + Math.random() * 3500;
      }
      let pose = c.pose;
      const sat = pose === 'sit', live = st.band && !lit && !sat;
      // A knot of dancers moves as one: the same phase, a wider step.
      const ph = c.knot != null ? c.knot : c.phase;
      let hop = live && (jumping || e > .7)
        ? Math.round(Math.max(0, Math.sin(t * (5 + e * 3) + ph)) * 2 * (c.knot != null ? 1 : c.jumpy)) : 0;
      // A Groove song moves the whole lawn the way a knot of dancers moves: a wider, quicker step.
      const groove = st.feel === 'Groove', wide = c.knot != null || groove;
      const sway = live && (e > .35 || groove) ? Math.round(Math.sin(t * (wide ? 2.2 : pose === 'glow' ? 1.1 : 1.5) + ph) * (wide || pose === 'glow' ? 2 : 1)) : 0;
      const wander = lit && !sat ? Math.round(Math.sin(t * .4 + c.phase) * 2) : 0;
      // Inside the wave, arms up and off the ground; either side of it, arms down, waiting for it.
      if (wave != null && live){
        if (Math.abs(c.x - wave) < 3){ pose = 'up'; hop = 3; }
        else if (pose === 'up' || pose === 'one' || pose === 'clap'){ pose = 'down'; hop = 0; }
      }
      c.px = px + sway + wander; c.py = py - hop; c.drawn = pose;
      if (!lite) g.drawImage(shade, px + sway + wander - 6, py - 2);
      g.drawImage(spriteOf(c.v, pose), c.px - PAX, c.py - PAY);
    }
  }

  /* The taper's stand, in pixels: a tripod, a pole, a bar with a mic at each end, a recorder at its foot. */
  function drawTaper(px, py){
    if (!lite) g.drawImage(shade, px - 6, py - 2);
    g.fillStyle = '#2a2a32';
    g.fillRect(px - 2, py, 5, 1); g.fillRect(px - 1, py - 1, 3, 1);
    g.fillRect(px, py - 20, 1, 20);
    g.fillRect(px - 4, py - 21, 9, 1);
    g.fillStyle = '#c8ccd6'; g.fillRect(px - 4, py - 23, 1, 2); g.fillRect(px + 4, py - 23, 1, 2);
    g.fillStyle = '#1c1c22'; g.fillRect(px + 2, py - 2, 3, 2);
  }

  /* THE BEACH BALL. Outdoors, on a big song, one goes up off the lawn and the crowd keeps it in the air
     until the set break. Real time only: no still frame ever has one. */
  let ball = null;

  /* THE WEATHER. The room says what its sky can do (rooms.js `weather`) and the night's seed rolls it,
     once, so a night is rainy or it is not; nothing about the show touches it. It only moves once the
     show is running: a thumbnail, a replay jump and a reduced-motion still are all clear skies. It is
     the first thing a struggling phone drops (`lite`). */
  const WX = opts.weather || (() => {
    const W = R.weather || {}, wr = mulberry32(seed ^ 0x9e3779b9);
    const rain = wr() < (W.rain || 0), snow = wr() < (W.snow || 0), fog = wr() < (W.fog || 0);
    const storm = wr() < (W.storm || 0) && (rain || !W.rain);
    return { rain, snow, fog, storm, shimmer: !!W.shimmer, wind: W.wind || null };
  })();
  let wxLive = false, bolt = null, boltNext = 0, fogTex = null;
  const drops = [];
  function wxParticles(){
    const r = mulberry32(seed ^ 0x51ed270b), n = WX.rain ? 230 : WX.snow ? 110 : 0;
    for (let i = 0; i < n; i++) drops.push({ x: r(), y: r(), v: .7 + r() * .6, ph: r() * 7, big: r() < .25 });
    const m = WX.wind === 'sand' ? 40 : WX.wind === 'leaf' ? 22 : 0;
    for (let i = 0; i < m; i++) drops.push({ x: r(), y: .45 + r() * .55, v: .6 + r() * .8, ph: r() * 7, wind: true, c: (r() * 4) | 0 });
  }
  wxParticles();
  const LEAF = ['#c8642a', '#d89a32', '#9a4a22', '#b8b040'];
  // The far edge of the ground, on screen: where the sky starts, the horizon shimmers and bolts land.
  const horizon = () => P2(0, R.far, 0)[1] - camY;

  /* A bolt, far off, behind everything: drawn under what is already there, so it only shows in the sky. */
  function drawBolt(night){
    if (!WX.storm || indoor || night < .4) return;
    if (!bolt && now > boltNext){
      if (boltNext){
        const r = Math.random, hy = horizon(), pts = [[r() * visW, -2]];
        while (pts[pts.length - 1][1] < hy) pts.push([pts[pts.length - 1][0] + (r() - .5) * 10, pts[pts.length - 1][1] + 3 + r() * 6]);
        bolt = { pts, until: now + 160 };
      }
      boltNext = now + 6000 + Math.random() * 10000;
    }
    if (!bolt) return;
    if (now > bolt.until){ bolt = null; return; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#f4f2ff';
    for (let i = 1; i < bolt.pts.length; i++){
      const [x0, y0] = bolt.pts[i - 1], [x1, y1] = bolt.pts[i];
      for (let k = 0; k <= 4; k++) g.fillRect(Math.round(x0 + (x1 - x0) * k / 4), Math.round(y0 + (y1 - y0) * k / 4), 1, 1);
    }
    g.globalCompositeOperation = 'source-over';
  }

  /* Fog, laid on the painted room before the band, the stage front and the crowd stand in it, so it
     sits behind them and the rig's light falls on it like on everything else. Densest at the back. */
  function drawFog(t){
    if (!fogTex){
      fogTex = canvas(256, 64);
      const fx = fogTex.getContext('2d'), r = mulberry32(seed ^ 0x3c6ef372);
      for (let i = 0; i < 70; i++){
        const x = r() * 256, y = 8 + r() * 48, w = 18 + r() * 40, h = 4 + r() * 8;
        for (const dx of [-256, 0, 256]){
          fx.fillStyle = 'rgba(255,255,255,.08)';
          fx.beginPath(); fx.ellipse(x + dx, y, w, h, 0, 0, 7); fx.fill();
        }
      }
    }
    const deck = P2(0, -4, 0)[1] - camY, off = (t * 4) % 256;
    if (deck <= 0) return;
    g.globalAlpha = .75;
    for (let x = -off; x < visW; x += 256) g.drawImage(fogTex, Math.round(x), 0, 256, deck + 12);
    g.globalAlpha = 1;
  }

  /* Rain, snow, heat and wind, over the finished picture, in screen pixels. */
  function drawWeather(t, night, p, L){
    const dt = pdt, hy = horizon();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    // Heat off the sand in daylight: the rows over the horizon wobble a pixel either way.
    if (WX.shimmer && night < .35){
      const c = g.canvas;
      for (let y = Math.max(0, hy - 10); y < Math.min(visH, hy + 2); y++){
        const off = Math.round(Math.sin(t * 3.2 + y * .9));
        if (off) g.drawImage(c, 0, y, visW, 1, off, y, visW, 1);
      }
    }
    if (!drops.length) return;
    const wind = WX.wind === 'sand' ? 1 : .35;
    for (const q of drops){
      if (q.wind){
        q.x += q.v * .16 * dt * wind * 2; if (q.x > 1.02) q.x -= 1.04;
        const x = Math.round(q.x * visW), y = Math.round(q.y * visH + Math.sin(t * 2 + q.ph) * 3);
        // Sand blows in pale streaks low over the beach by day; leaves tumble, two pixels then one.
        if (WX.wind === 'sand'){ if (night > .6) continue; g.fillStyle = 'rgba(255,248,228,.75)'; g.fillRect(x, y, 3, 1); }
        else { g.fillStyle = LEAF[q.c]; g.fillRect(x, y, 2, Math.sin(t * 5 + q.ph) > 0 ? 2 : 1); }
        continue;
      }
      if (WX.rain){
        q.y += q.v * 1.6 * dt; q.x += .05 * dt;
        if (q.y > 1){ q.y -= 1; q.x = (q.x + .37) % 1; }
        const x = Math.round((q.x % 1) * visW), y = Math.round(q.y * visH);
        // Slanted a little with the wind: two pixels down, one across, then two more.
        g.fillStyle = night > .5 ? 'rgba(210,220,255,.42)' : 'rgba(225,232,245,.6)';
        g.fillRect(x, y, 1, 2); g.fillRect(x - 1, y + 2, 1, q.big ? 3 : 2);
      } else {
        q.y += q.v * .09 * dt; if (q.y > 1) q.y -= 1;
        const x = Math.round(((q.x + Math.sin(t * .8 + q.ph) * .012) % 1) * visW), y = Math.round(q.y * visH);
        g.fillStyle = 'rgba(244,246,255,.9)';
        g.fillRect(x, y, q.big ? 2 : 1, q.big ? 2 : 1);
      }
    }
  }
  function drawBall(){
    if (!ball) return;
    const dt = pdt;
    if (dt){
      ball.vz -= 32 * dt;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt; ball.spin += ball.vx * dt * .6;
      if (ball.y < FL.y0 + 1) ball.vy = Math.abs(ball.vy);
      if (ball.y > FL.deep) ball.vy = -Math.abs(ball.vy);
      const half = FL.half(Math.max(FL.y0, Math.min(FL.y1 - .01, ball.y))) - 1;
      if (Math.abs(ball.x) > half) ball.vx = -Math.sign(ball.x) * Math.abs(ball.vx);
      if (ball.z < 6 && ball.vz < 0){
        // Somebody under it knocks it back up, and puts their arms up doing it.
        ball.vz = 18 + Math.random() * 8;
        ball.vx = (Math.random() - .5) * 7 - ball.x * .06;
        ball.vy = (Math.random() - .5) * 5 + ((FL.y0 + FL.deep) / 2 - ball.y) * .05;
        for (const c of crowd) if (!c.taper && Math.abs(c.x - ball.x) < 1.6 && Math.abs(c.y - ball.y) < 1.6){ c.pose = 'up'; c.until = now + 700; }
      }
    }
    const [sx0, sy0] = P2(ball.x, ball.y, 0), [bx, by] = P2(ball.x, ball.y, ball.z);
    if (!lite){ g.fillStyle = 'rgba(20,14,30,.25)'; g.fillRect(sx0 - 3, sy0 - 1, 7, 2); }
    // Seven pixels across, panels turning as it flies, a dark rim so it reads against the heads.
    const cols = ['#f6f1e4', '#e0443a', '#f6f1e4', '#3a7ad8', '#f6f1e4', '#f4cc2c'];
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++){
      const d2 = i * i + j * j;
      if (d2 > 11) continue;
      const k = ((Math.floor((Math.atan2(j, i) + ball.spin) / (Math.PI / 3)) % 6) + 6) % 6;
      g.fillStyle = d2 > 7 ? '#2a1e30' : d2 < 1 ? '#f6f1e4' : cols[k];
      g.fillRect(bx + i, by + j - 3, 1, 1);
    }
  }

  const tallShot = () => visH / visW > 1.4;

  /* THE SKY, drawn behind the world with destination-over, so it only shows where the treeline leaves
     the picture empty and through the haze of anything light that is already there. Noon blue, a pink
     and orange dusk, and a deep night with the rig's glow coming up behind the trees. */
  function drawSky(t, night, p, show, L){
    // Indoors there is no sky: whatever the room leaves uncovered is the dark of the hall.
    if (indoor){
      g.setTransform(1, 0, 0, 1, -camX, -camY);
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = R.ceiling || '#0c0a14'; g.fillRect(camX, camY, visW, visH);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    const dusk = clamp01(1 - Math.abs(st.sky - .52) / .2);
    const span = Math.max(8, SKY_ROWS - camY), MOON = { x: camX + Math.round(visW * .78), y: camY + 9 };
    g.setTransform(1, 0, 0, 1, -camX, -camY);
    g.globalCompositeOperation = 'destination-over';
    // Stars first: destination-over puts each later layer further back.
    if (night > .05){
      // One colour and an alpha per star: building a colour string for each one every frame is most
      // of what the sky would cost.
      g.fillStyle = '#ebf0ff';
      for (const s2 of stars){
        if (s2.x < camX - 2 || s2.x > camX + visW + 2) continue;
        const a = night * s2.b * (.6 + .4 * Math.sin(t * 1.7 + s2.tw));
        const sy2 = (camY + s2.y * span) | 0;
        g.globalAlpha = a; g.fillRect(s2.x | 0, sy2, 1, 1);
        if (s2.big && a > .4){ g.globalAlpha = a * .4; g.fillRect((s2.x | 0) - 1, sy2, 3, 1); g.fillRect(s2.x | 0, sy2 - 1, 1, 3); }
      }
      g.globalAlpha = 1;
      // The moon, with its own halo, and a couple of darker seas so it reads as the moon at this size.
      const mA = clamp01(night * 1.3);
      g.fillStyle = rgb([140, 150, 190], .5 * mA); g.fillRect(MOON.x + 2, MOON.y + 2, 2, 2); g.fillRect(MOON.x - 2, MOON.y - 1, 2, 1);
      g.fillStyle = rgb([248, 244, 226], mA);
      g.beginPath(); g.arc(MOON.x, MOON.y, 5, 0, 7); g.fill();
      const mh = g.createRadialGradient(MOON.x, MOON.y, 3, MOON.x, MOON.y, 26);
      mh.addColorStop(0, rgb([200, 210, 255], .35 * mA)); mh.addColorStop(1, rgb([200, 210, 255], 0));
      g.fillStyle = mh; g.fillRect(MOON.x - 26, MOON.y - 26, 52, 52);
    }
    // Clouds by day, going pink at dusk.
    if (night < .9){
      const cc = mixc([255, 255, 255], [255, 170, 160], dusk);
      for (const c of clouds){
        const x = ((c.x + t * c.v) % (WPX + 80)) - 40, cy = camY + 5 + c.y * Math.max(2, span - 14);
        g.fillStyle = rgb(cc, .85 * (1 - night));
        g.fillRect(x | 0, cy | 0, c.w | 0, 4);
        g.fillRect((x + c.w * .15) | 0, (cy - 3) | 0, (c.w * .45) | 0, 3);
        g.fillRect((x + c.w * .5) | 0, (cy - 5) | 0, (c.w * .3) | 0, 5);
        g.fillStyle = rgb(mixc(cc, [150, 160, 200], .35), .7 * (1 - night));
        g.fillRect((x + 2) | 0, (cy + 4) | 0, (c.w - 4) | 0, 1);
      }
    }
    // The rig lights the bottom of the sky over the stage once it is dark.
    if (show && night > .1){
      const [gx] = P2(0, -16, 0);
      const rg = g.createRadialGradient(gx, SKY_ROWS, 4, gx, SKY_ROWS, 150);
      rg.addColorStop(0, rgb(p[0], .4 * night * (.4 + .6 * L))); rg.addColorStop(1, rgb(p[0], 0));
      g.fillStyle = rg; g.fillRect(gx - 150, SKY_ROWS - 150, 300, 160);
    }
    const top = mixc(mixc([92, 160, 232], [74, 66, 140], dusk), [6, 8, 26], night);
    const hor = mixc(mixc([196, 228, 246], [250, 158, 112], dusk), [30, 30, 74], night);
    const sk = g.createLinearGradient(0, camY, 0, SKY_ROWS);
    sk.addColorStop(0, rgb(top)); sk.addColorStop(1, rgb(hor));
    g.fillStyle = sk; g.fillRect(camX, camY, visW, Math.max(1, SKY_ROWS - camY + 40));
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function draw(){
    // The room is still being built: the house is dark.
    if (!back){ out.fillStyle = '#0b0718'; out.fillRect(0, 0, view.width, view.height); return; }
    const t = now / 1000, p = palette();
    const L = st.light * (now < st.dipUntil ? .3 : 1), H = st.house, e = st.energy;
    // Indoors it is always night: the house lights stand in for the sun.
    const night = indoor ? 1 : clamp01((st.sky - .45) / .4);
    // The beat. Everything that pulses pulses on it, and it quickens with the song.
    const bpm = 86 + e * 46, ph = t * bpm / 60, beatN = Math.floor(ph), pulse = Math.exp(-(ph - beatN) * 4.5);
    const show = st.band && H < .5;
    // How much the rig can be seen: hardly in the sun, fully once it is dark.
    const dark = .22 + night * .78;

    // 1. THE WORLD as it is painted.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, visW, visH);
    g.drawImage(back, camX, camY, visW, visH, 0, 0, visW, visH);
    if (wxLive && !lite && WX.fog) drawFog(t);
    g.translate(-camX, -camY);
    g.fillStyle = 'rgba(30,20,40,.35)';
    for (const B of blk){
      if (Math.abs(B.x) > 15.2) continue;
      const [px, py] = P2(B.x, B.y, B.z); g.beginPath(); g.ellipse(px, py, 5, 2, 0, 0, 7); g.fill();
    }
    drawBanner(t);
    drawBand(t);
    drawRoadie(t);
    g.drawImage(front, camX, camY, visW, visH, camX, camY, visW, visH);
    drawCrowd(t);
    drawBall();

    // 2. THE LIGHT falling on it. The sky is the floor of it; the rig adds to it.
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-over';
    const sky = indoor ? (R.indoor || INDOOR) : skyAt(st.sky);
    lg.fillStyle = rgb(H > .5 ? mixc(sky, [246, 232, 210], H * night * .6) : sky);
    lg.fillRect(0, 0, visW, visH);
    lg.translate(-camX, -camY);
    lg.globalCompositeOperation = 'lighter';
    const beamA = (.05 + e * .1) * L * (1 - H) * dark;
    const spot = mixc([255, 240, 222], p[1], .3);
    if (show){
      // A wash across the deck in the song's colour, breathing on the beat.
      const [wx, wy] = P2(0, -7, DECK.z);
      pool(lg, wx, wy, 95, mixc(p[0], [255, 255, 255], .35), (.18 + .32 * L) * dark * (.75 + .25 * pulse), .55);
      // The pods throw their colour onto the back wall behind them and the deck under them.
      for (const P of PODS){
        const [wx2, wy2] = P2(P.cx, -14.7, P.cz);
        pool(lg, wx2, wy2, 26 * RIG.podR / 2.2, p[P.pi % 2], .32 * L * dark * (.7 + .3 * pulse), .8);
      }
      const [sx2, sy2] = P2(0, -12, DECK.z);
      pool(lg, sx2, sy2, 70, mixc(p[0], p[1], .5), .22 * L * dark, .4);
      // A key light on every player, so the band is the brightest thing in the room.
      for (const B of blk){
        const [px, py] = P2(B.x, B.y, B.z);
        pool(lg, px, py - 8, 15, spot, (.45 + .35 * L) * dark, 1.2);
      }
      // Spill off the stage onto the front of the lawn.
      const [fx, fy] = P2(0, 6, 0);
      pool(lg, fx, fy, 150, mixc(p[0], [255, 255, 255], .5), .3 * L * dark, .4);
    }
    // The room's own lamps, coming on with the dusk.
    const F = { t, night, e, L, H, p, pulse, beatN, show, dark, skyP: st.sky,
      pool: (x, y, z, r, c, a, flat) => { const [px, py] = P2(x, y, z); pool(lg, px, py, r, c, a, flat); } };
    if (R.light) R.light(F);
    if (you){
      // The follow spot: you, lit like you are in the band.
      const [px, py] = P2(you.x, you.y, 0);
      pool(lg, px, py - 6, 22, [235, 250, 255], 1, .9);
      pool(lg, px, py, 34, [120, 220, 235], .45, .5);
    }

    // 3. THE BEAMS, worked out once and used twice: where each lands lights the ground under it, and
    //    the cone itself glows in the haze.
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    bg.clearRect(0, 0, visW, visH);
    bg.translate(-camX, -camY);
    bg.globalCompositeOperation = 'lighter';
    const strobe = now < st.strobeUntil && (Math.floor(ph * 2) % 2 === 0);
    if (beamA > .008){
      const sp = .25 + e * .6;
      FIX.forEach((fx, i) => {
        const [px, py] = P2(fx, RIG.fixY, RIG.fixZ);
        const col = p[(i + beatN) % 2];
        const tx = fx + Math.sin(t * sp + i * .8) * (3 + e * 6) * (i % 2 ? 1 : -1);
        const deep = e > .6 && i % 3 === 0;
        const ty = deep ? 8 + Math.sin(t * sp * .7 + i) * 6 : -9 + (i * 13) % 8;
        const b = P2(tx, ty, deep ? 0 : DECK.z);
        const a = beamA * (.7 + .5 * pulse);
        cone(bg, [px, py + 1], b, 5 + e * 4, col, a);
        pool(lg, b[0], b[1], 12 + e * 4, col, a * 4.5);
      });
      // Uplights at the lip of the deck, fanning into the sky when the song has earned them.
      if (e > .45){
        for (let i = 0; i < 6; i++){
          const base = P2(-12 + i * 4.8, -.4, DECK.z);
          const ang = Math.sin(t * (.25 + e * .4) + i * 1.3) * .5 + (i - 2.5) * .12;
          cone(bg, base, [base[0] + Math.sin(ang) * 90, base[1] - Math.cos(ang) * 120], 8, p[(i + beatN + 1) % 2], beamA * (e - .3) * 1.8);
        }
      }
      /* The pods' movers: out of the bottom corner of each diamond down onto the band, and out of the
         side corners in a fan that opens wider as the song builds and reaches the crowd at the top. */
      for (const P of PODS){
        const sw = Math.sin(t * sp * .8 + P.pi * 1.3), out = P.cx >= 0 ? 1 : -1;
        const fanned = [[P.C[2], P.cx + sw * (2 + e * 4), -6 + P.pi % 3 * 1.5, DECK.z],
          [P.C[1], P.C[1][0] + (3 + e * 9) * (.6 + .4 * Math.sin(t * sp + P.pi)), e > .55 ? 6 + sw * 8 : -3, e > .55 ? 0 : DECK.z],
          [P.C[3], P.C[3][0] - (3 + e * 9) * (.6 + .4 * Math.sin(t * sp + P.pi + 2)), e > .55 ? 6 - sw * 8 : -3, e > .55 ? 0 : DECK.z]];
        fanned.forEach(([[ax, az], tx, ty, tz], k) => {
          if (k > 0 && e < .25) return;
          const col = p[(P.pi + k + beatN) % 2], a = beamA * (k ? .9 : .75) * (.7 + .5 * pulse) * (out === (k === 1 ? 1 : -1) ? 1.1 : 1);
          const b = P2(tx, ty, tz);
          cone(bg, P2(ax, RIG.podY + .2, az - .55), b, 4 + e * 4, col, a);
          pool(lg, b[0], b[1], 10 + e * 4, col, a * 4);
        });
      }
      // The soloist's spot: a warm cone off the truss onto him while the jam peaks.
      if (st.soloist && st.push > .05){
        const B = blk[PLAYERS.findIndex(pl => pl[0] === st.soloist)];
        const [px, py] = P2(B.x, B.y, B.z);
        cone(bg, P2(B.x, -9, RIG.trussZ), [px, py - 2], 11, [255, 236, 196], .26 * st.push * dark);
        pool(lg, px, py - 9, 30, [255, 240, 210], .9 * st.push * dark, 1.1);
      }
      if (now < st.segueUntil){
        const f = 1 - (st.segueUntil - now) / 1500;
        const b2 = P2(-14 + f * 28, -2, DECK.z);
        cone(bg, P2(0, RIG.fixY, RIG.fixZ + 1.2), b2, 12, [255, 255, 255], .3 * Math.sin(f * Math.PI) * dark);
        pool(lg, b2[0], b2[1], 26, [255, 255, 255], .5 * Math.sin(f * Math.PI) * dark);
      }
    }
    if (you){
      const [px, py] = P2(you.x, you.y, 0);
      cone(bg, P2(you.x > 0 ? 15.6 : -15.6, RIG.fixY, RIG.fixZ + 1.2), [px, py], 13, [210, 245, 255], .32 * (.85 + .15 * pulse));
    }
    /* BACKLIGHTS on the roof of the stage house, firing over the band and out across the lawn: the
       shot every concert film is made of. Where they land they sweep the crowd. */
    if (show && e > .3){
      const bk = beamA * (e - .2) * 1.6;
      for (let i = 0; i < 6; i++){
        const x0 = -12.5 + i * 5;
        const a = P2(x0, -15.2, RIG.wallZ + .3);
        const tx = x0 * .6 + Math.sin(t * (.35 + e * .5) + i * 1.9) * (8 + e * 8);
        const ty = 14 + Math.sin(t * (.27 + e * .3) + i * 1.1) * 10;
        const b = P2(tx, ty, 0);
        const col = p[(i + beatN + 1) % 2];
        cone(bg, a, b, 9 + e * 7, col, bk);
        pool(lg, b[0], b[1], 16 + e * 6, col, bk * 3.2, .5);
      }
    }
    /* Smoke on the deck and rolling off the lip, lit in the song's colour. Laid into the beam layer, so
       the haze below breaks it into the same drifting smoke the beams are seen through. */
    if (show){
      const sc = mixc(p[0], [255, 255, 255], .45), sa = .2 * dark * (.6 + .4 * L);
      const [sx0, sy0] = P2(0, -.5, DECK.z), [, sy1] = P2(0, -7, DECK.z);
      pool(bg, sx0, sy0, 90, sc, sa, .32);
      pool(bg, sx0, sy1, 70, sc, sa * .6, .3);
    }
    if (R.beam) R.beam(Object.assign(F, { cone: (a, b, r, c, al) => cone(bg, P2(...a), P2(...b), r, c, al),
      pool: (x, y, z, r, c, a, flat) => { const [px, py] = P2(x, y, z); pool(bg, px, py, r, c, a, flat); } }));
    // The haze: the beams are only seen where there is smoke to see them in.
    if (hazePat){
      bg.globalCompositeOperation = 'destination-in';
      bg.save();
      bg.translate(Math.round(t * 3) % 64, Math.round(t * -1.5) % 64);
      bg.fillStyle = hazePat; bg.fillRect(camX - 64, camY - 64, visW + 128, visH + 128);
      bg.restore();
    }

    // 4. LIGHT THE WORLD: what is painted, times the light on it.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lmap, 0, 0);
    // The light only lands on the world. Over the treeline there is nothing for it to land on.
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(back, camX, camY, visW, visH, 0, 0, visW, visH);

    // Confetti, lit by the room it falls through.
    if (confetti.length){
      g.globalCompositeOperation = 'source-over';
      g.translate(-camX, -camY);
      const lvl = Math.round(7 * clamp01((.55 + .45 * Math.max(L * (1 - H), 1 - night) - .45) / .55));
      for (let i = confetti.length - 1; i >= 0; i--){
        const q = confetti[i];
        q.vz = Math.max(-4.2, q.vz - 9 * pdt);
        q.x += (q.vx + Math.sin(t * q.f + q.ph) * 1.6) * pdt; q.y += q.vy * pdt; q.z += q.vz * pdt;
        q.vx *= 1 - .6 * pdt; q.vy *= 1 - .4 * pdt;
        if (q.z <= 0){ confetti.splice(i, 1); continue; }
        const [cx, cy] = P2(q.x, q.y, q.z);
        const flip = Math.sin(t * q.f * 1.7 + q.ph) > 0;
        g.fillStyle = FETTI_SH[q.c][flip ? 0 : 1][lvl]; g.fillRect(cx, cy, flip ? 2 : 1, 1);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }

    // 5. WHAT GLOWS: the pods, lenses, bulbs, phones, and the beams in their haze.
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.globalCompositeOperation = 'source-over';
    eg.clearRect(0, 0, visW, visH);
    eg.translate(-camX, -camY);
    eg.globalCompositeOperation = 'lighter';
    podPixels(eg, p, t, pulse, beatN, strobe);
    drawFill(t);
    /* THE HAND-OFF: a segue runs a ribbon of white across the pods, left to right, so the room sees
       one song hand the night to the next. */
    if (now > st.ribbonAt && now < st.ribbonAt + 1100){
      const head = (now - st.ribbonAt) / 1100 * (PODS.length + 1.5);
      for (const q of PODPX){
        const d = head - PODRANK[q.pi];
        if (d < 0 || d > 1.5) continue;
        const [px, py] = P2(q.x, RIG.podY + .3, q.z);
        eg.fillStyle = rgb([255, 255, 255], (1 - d / 1.5) * .95); eg.fillRect(px, py, 1, 1);
      }
    }
    drawFlames(t);
    // The pods' lenses: the movers under each diamond, lit in the colour of their beam.
    for (const P of PODS){
      [P.C[2], P.C[1], P.C[3], [P.cx, P.cz + .55]].forEach(([x, z], k) => {
        const [px, py] = P2(x, RIG.podY + .2, z - .55);
        const col = strobe ? [255, 255, 255] : p[(P.pi + k + beatN) % 2];
        const on = (strobe ? 1 : (.3 + .7 * L) * (.6 + .4 * pulse)) * (show || L > .1 ? 1 : .3);
        eg.fillStyle = rgb(col, on); eg.fillRect(px, py, 1, 1);
        if (k < 3 && on > .55 && night > .3 && (P.pi + k + beatN) % 3 === 0) glint(eg, px, py, col, on * night * .8, 2);
      });
    }
    FIX.forEach((fx, i) => {
      const [px, py] = P2(fx, RIG.fixY, RIG.fixZ);
      const col = strobe ? [255, 255, 255] : p[(i + beatN) % 2];
      const on = (strobe ? 1 : (.35 + .65 * L) * (.65 + .35 * pulse)) * (show || L > .1 ? 1 : .3);
      eg.fillStyle = rgb(col, on); eg.fillRect(px - 1, py, 2, 1);
      if (on > .5 && night > .3 && (i + beatN) % 3 === 0) glint(eg, px, py, col, on * night, 2 + (pulse > .6 ? 1 : 0));
    });
    // Par cans along the lip of the deck, chasing.
    for (let i = 0; i < 9; i++){
      const [px, py] = P2(-12 + i * 3, .1, DECK.z + .3);
      const ch = .5 + .5 * Math.sin(ph * Math.PI + i * .9);
      eg.fillStyle = rgb(p[i % 2], (.25 + .75 * ch) * L * (show ? 1 : .2));
      eg.fillRect(px, py, 1, 1);
    }
    if (R.glow){
      F.dot = (x, y, z, c, a, w = 1, h = 1, ox = 0, oy = 0) => {
        if (a <= .003) return;
        const [px, py] = P2(x, y, z); eg.fillStyle = rgb(c, Math.min(1, a)); eg.fillRect(px + ox, py + oy, w, h);
      };
      F.halo = (x, y, z, r, c, a, flat) => { const [px, py] = P2(x, y, z); pool(eg, px, py, r, c, a, flat); };
      F.light = (x, y, z, r, c, a, flat) => { const [px, py] = P2(x, y, z); pool(lg, px, py, r, c, a, flat); };
      R.glow(F);
    }
    // Where a random draft would be standing: a row of glow stakes across the lawn.
    if (shot && shot.rnd != null){
      const yr = lawnY(shot.rnd), half = FL.half(yr);
      for (let x = -half; x <= half; x += 1.4){
        const [px, py] = P2(x, yr, .3);
        eg.fillStyle = rgb([200, 236, 255], .3 + .15 * Math.sin(t * 2 + x)); eg.fillRect(px, py, 1, 1);
      }
    }
    // A ring of light on the grass at your feet, breathing, so you are found before you are read.
    if (you && you.px != null){
      const br = .55 + .45 * Math.sin(t * 3);
      eg.save(); eg.translate(you.px, you.py); eg.scale(1, .45);
      eg.strokeStyle = rgb([90, 225, 240], .55 + .35 * br); eg.lineWidth = 1.4;
      eg.beginPath(); eg.arc(0, 0, 7 + br * 1.5, 0, Math.PI * 2); eg.stroke(); eg.restore();
    }
    if (st.encore && H < .5){
      for (const c of crowd){
        if (c.drawn === 'glow' && c.px != null){
          // The stick's own light, at the top of the stick, in its colour.
          const col = GLOW_RGB[variants[c.v].glow | 0];
          const qx = c.px + Math.round(1.04 / ART), qy = c.py - Math.round(6.9 * CE / ART);
          glint(eg, qx, qy, col, .85, 1);
          pool(lg, qx, qy + 4, 7, col, .3);
          continue;
        }
        if (c.pose !== 'phone' || c.px == null) continue;
        const fl = .8 + .2 * Math.sin(t * 4 + c.phase);
        const qx = c.px - Math.round(.85 / ART), qy = c.py - Math.round(6.05 * CE / ART);
        eg.fillStyle = rgb([230, 242, 255], fl); eg.fillRect(qx, qy, 1, 2);
        pool(lg, qx, qy + 6, 8, [190, 215, 255], .25 * fl);
      }
    }
    // The backlights' lenses on the roof, pointed straight at you.
    if (show && e > .3){
      for (let i = 0; i < 6; i++){
        const [px, py] = P2(-12.5 + i * 5, -15.2, RIG.wallZ + .3);
        const col = strobe ? [255, 255, 255] : p[(i + beatN + 1) % 2];
        const on = (e - .2) * L * (.6 + .4 * pulse);
        eg.fillStyle = rgb(col, Math.min(1, on * 1.3)); eg.fillRect(px - 1, py, 3, 1);
        if (night > .3 && on > .35) glint(eg, px, py, col, on * night, 3);
      }
    }
    // Dust drifting in the light over the deck.
    if (show && L > .2 && !lite){
      eg.fillStyle = rgb(mixc(p[0], [255, 255, 255], .6));
      for (const m of motes){
        const mx = m.x + Math.sin(t * m.s + m.ph) * 1.5, mz = m.z + Math.sin(t * m.s * .7 + m.ph * 2) * 1.2;
        const [px, py] = P2(mx, m.y, mz);
        eg.globalAlpha = .18 * L * dark * (.5 + .5 * Math.sin(t * 2 + m.ph));
        eg.fillRect(px, py, 1, 1);
      }
      eg.globalAlpha = 1;
    }
    // Fireflies out at the edges of the lawn once it is dark.
    if (night > .25 && !lite){
      for (const f of flies){
        const fx = f.x + Math.sin(t * .3 + f.ph) * 3, fy = f.y + Math.cos(t * .23 + f.ph) * 3, fz = f.z + Math.sin(t * .9 + f.ph) * .8;
        const bl = Math.max(0, Math.sin(t * 1.3 + f.ph * 3)) ** 3;
        if (bl < .05) continue;
        const [px, py] = P2(fx, fy, fz);
        eg.fillStyle = '#d2ff78'; eg.globalAlpha = bl * night * .9; eg.fillRect(px, py, 1, 1);
      }
      eg.globalAlpha = 1;
    }
    // Sparks: fountains at the lip of the deck for the last song of a night that went off.
    if (!reduce && now < sparkUntil){
      for (const x of [-11, -4, 4, 11]) for (let n = 0; n < 3; n++){
        sparks.push({ x: x + (Math.random() - .5) * .4, y: .2, z: DECK.z + .4, vx: (Math.random() - .5) * 3,
          vy: (Math.random() - .3) * 2, vz: 13 + Math.random() * 9, life: .7 + Math.random() * .6 });
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--){
      const q = sparks[i];
      q.vz -= 30 * pdt; q.x += q.vx * pdt; q.y += q.vy * pdt; q.z += q.vz * pdt; q.life -= pdt;
      if (q.life <= 0 || q.z < 0){ sparks.splice(i, 1); continue; }
      const [px, py] = P2(q.x, q.y, q.z);
      eg.fillStyle = q.life > .45 ? '#fff6d8' : q.life > .2 ? '#ffc060' : '#ff8a28';
      eg.globalAlpha = Math.min(1, q.life * 1.8);
      eg.fillRect(px, py, 1, 1);
    }
    eg.globalAlpha = 1;
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.drawImage(beams, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(emit, 0, 0);
    eg.globalCompositeOperation = 'source-over';
    if (wxLive && !lite) drawBolt(night);
    drawSky(t, night, p, show, L);
    if (wxLive && !lite) drawWeather(t, night, p, L);
    // Lightning far off lights the whole night for a moment, twice: a flicker, a gap, a flash.
    if (bolt){
      const u = 1 - (bolt.until - now) / 160;
      if (u < .25 || u > .5){ g.fillStyle = 'rgba(170,175,230,.16)'; g.globalCompositeOperation = 'lighter'; g.fillRect(0, 0, visW, visH); g.globalCompositeOperation = 'source-over'; }
    }
    g.globalCompositeOperation = 'source-over';
    if (now < st.flashUntil){
      g.fillStyle = rgb([255, 255, 255], .4 * (st.flashUntil - now) / 260);
      g.fillRect(0, 0, visW, visH);
    }

    // 6. ON TO THE SCREEN: the pixels whole, then the bloom over them at the screen's own resolution,
    //    which is what makes a lens or a beam read as light rather than as a coloured shape.
    out.globalCompositeOperation = 'source-over';
    out.imageSmoothingEnabled = false;
    out.drawImage(buf, 0, 0, visW * k, visH * k);
    // The soft copy for the depth of field: a third, then a quarter, so it is round rather than blocky.
    const da = dofA.getContext('2d');
    da.globalCompositeOperation = 'copy'; da.imageSmoothingEnabled = true; da.imageSmoothingQuality = 'high';
    da.drawImage(buf, 0, 0, dofA.width, dofA.height);
    dc.globalCompositeOperation = 'copy'; dc.imageSmoothingEnabled = true; dc.imageSmoothingQuality = 'high';
    dc.drawImage(dofA, 0, 0, dof.width, dof.height);
    const vc = mixc([18, 8, 34], mixc(p[0], [10, 6, 24], .75), night * (1 - H));
    const va = (.32 + .3 * night).toFixed(2);
    vig.style.background = `radial-gradient(ellipse 85% 75% at 50% ${tallShot() ? 38 : 42}%, transparent 52%, ${rgb(vc, va)} 100%)`;
    const ba = bloomA.getContext('2d'), bb = bloomB.getContext('2d');
    ba.globalCompositeOperation = 'copy'; ba.imageSmoothingEnabled = true;
    ba.drawImage(emit, 0, 0, bloomA.width, bloomA.height);
    bb.globalCompositeOperation = 'copy'; bb.imageSmoothingEnabled = true;
    bb.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
    gg.globalCompositeOperation = 'copy'; gg.imageSmoothingEnabled = true; gg.imageSmoothingQuality = 'high';
    gg.globalAlpha = .55 + .25 * night;
    gg.drawImage(bloomA, 0, 0, glow.width, glow.height);
    gg.globalCompositeOperation = 'lighter';
    gg.globalAlpha = .5 + .35 * night;
    gg.drawImage(bloomB, 0, 0, glow.width, glow.height);
    gg.globalAlpha = 1;
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
    shake();
  }

  function ease(dt){
    /* THE JAM'S ARC, across the time the song holds the screen: it builds for the first two fifths
       (the rig climbs), peaks to four fifths (the push-in, the soloist's spot) and comes back down. */
    let pushWant = 0;
    if (st.arc){
      const u = (now - st.arc.t0) / st.arc.dur;
      if (u >= 1) st.arc = null;
      else {
        if (u < .4) st.lightWant = Math.max(st.lightWant, .55 + .45 * u / .4);
        else if (u < .82){ pushWant = 1; st.lightWant = 1; st.energyWant = Math.max(st.energyWant, .95); }
      }
    }
    st.push += (pushWant - st.push) * Math.min(1, dt * (pushWant ? 1.1 : 1.8));
    const f = 1 - Math.pow(.03, dt);
    st.light += (st.lightWant - st.light) * f;
    st.house += (st.houseWant - st.house) * f;
    st.energy += (st.energyWant - st.energy) * f;
    st.density += (st.densityWant - st.density) * f * .5;
    st.sky += (st.skyWant - st.sky) * f * .35;
    if (st.palT < 1) st.palT = Math.min(1, st.palT + dt / 1.2);
  }

  function frame(ts){
    if (dead) return;
    if (!view.isConnected){ destroy(); return; }
    raf = requestAnimationFrame(frame);
    // Thirty frames a second: people move on the beat, not per frame.
    if (ts - last < 32 || !seen) return;
    const dt = Math.min(.1, (ts - (last || ts)) / 1000);
    last = ts; now = ts;
    ease(dt);
    wxLive = true;
    pdt = dt;
    const t0 = performance.now();
    draw();
    pdt = 0;
    costMs = costMs * .92 + (performance.now() - t0) * .08;
    if (!lite && costMs > 24) lite = true;
  }

  function setPalette(name){
    const next = PALETTES[name] || PALETTES.jam;
    if (next === st.pal) return;
    st.palFrom = palette(); st.pal = next; st.palT = 0;
  }

  const DENSITY = { hot: 1, warm: .8, cold: .52 };

  /* The whole interface. The page hands over what happened; the stage decides only how it looks.
     `progress` is how far through the night the show is, and it is what sets the sun. */
  function cue(ev){
    const ts = performance.now();
    if (ev.progress != null) st.skyWant = clamp01(R.skyMap ? R.skyMap(ev.progress) : ev.progress);
    if (ev.kind !== 'song'){ st.slow = false; st.feel = null; if (ev.kind !== 'final') ball = null; }
    if (ev.kind === 'set') roadie = null;
    if (ev.kind === 'set'){
      st.band = true; st.bow = false; st.encore = !!ev.encore; st.soloist = null; st.jam = false;
      st.houseWant = 0; st.lightWant = .5; st.energyWant = .3;
      setPalette(ev.encore ? 'encore' : 'house');
      st.jumpUntil = ts + 1200;
    } else if (ev.kind === 'song'){
      st.band = true; st.houseWant = 0;
      st.lightWant = .55 + ev.energy * .45;
      st.energyWant = clamp01(ev.energy + (ev.jam ? .25 : 0));
      setPalette(ev.palette || ROTATION[st.rot++ % ROTATION.length]);
      st.mode++;
      if (ev.segue) st.segueUntil = ts + 1500;
      /* A fill into every song, a longer one into a segue. A jam that peaks gets a soloist at the
         lip: the keys player when he has the red guitar on, the guitarist otherwise. */
      if (!ev.instant && !reduce){
        st.fillUntil = ts + (ev.segue ? 1400 : 650);
        // A jam long enough to have a shape gets one: build, peak, release.
        st.arc = ev.jam && ev.hold > 2500 ? { t0: ts, dur: ev.hold } : null;
        if (ev.segue){ st.dipUntil = ts + 220; st.ribbonAt = ts + 220; }
        if (ev.bustout){ st.bannerAt = ts; st.flameUntil = ts + 900; }
        // Arms up for a segue and for a set's closer.
        if (ev.segue || ev.closer) st.armsUntil = ts + 2200;
        // A big song outdoors, past the first few, sometimes sends a beach ball up.
        if (!indoor && !lite && !ball && ev.energy > .75 && ev.progress > .25 && Math.random() < .45)
          ball = { x: (Math.random() - .5) * 8, y: FL.y0 + (FL.deep - FL.y0) * (.3 + Math.random() * .4), z: 7, vx: 0, vy: 0, vz: 12, spin: 0 };
      }
      /* What the song feels like (goose_feels.json). A Space song dims to a slow wash; a Rocker
         jumps the lawn and an Anthem throws its arms up as it starts. The rest is in drawCrowd. */
      st.feel = ev.feel || null;
      if (st.feel === 'Space'){ setPalette('space'); st.lightWant = Math.min(st.lightWant, .5); }
      if (!ev.instant && !reduce){
        if (st.feel === 'Rocker') st.jumpUntil = Math.max(st.jumpUntil, ts + 1800);
        if (st.feel === 'Anthem') st.armsUntil = Math.max(st.armsUntil, ts + 3200);
      }
      const wasSlow = st.slow;
      st.slow = !!ev.slow;
      if (st.slow !== wasSlow || ev.segue || ev.closer) for (const c of crowd) c.until = 0;
      st.jam = !!ev.jam;
      st.soloist = ev.jam && ev.energy >= .6
        ? (KEY_SEQ[Math.floor(st.mode / 3) % KEY_SEQ.length] === 'guitar' ? 'keys' : 'guitar') : null;
      if (ev.bustout){ burst(150); shakeUntil = ts + 320; shakeAmp = 3; st.signsUntil = ts + 3400; st.jumpUntil = ts + 2000; st.flashUntil = ts + 260; st.strobeUntil = ts + 1600; }
      if (ev.grade) st.densityWant = DENSITY[ev.grade] || .8;
    } else if (ev.kind === 'time'){
      if (!ev.last && !ev.instant && !reduce) roadie = { t0: ts, dir: Math.random() < .5 ? 1 : -1 };
      if (!ev.last){ st.band = false; st.soloist = null; st.jam = false; st.houseWant = .85; st.lightWant = 0; st.energyWant = .15; }
    } else if (ev.kind === 'final'){
      st.band = true; st.bow = true; st.skyWant = 1; st.soloist = null; st.jam = false;
      st.houseWant = 0; st.lightWant = 1; st.energyWant = ev.grade === 'cold' ? .4 : 1;
      st.densityWant = DENSITY[ev.grade] || .8;
      st.flashUntil = ts + 260;
      if (ev.grade !== 'cold'){ st.jumpUntil = ts + 3000; st.strobeUntil = ts + 1400; burst(240); sparkUntil = ts + 2600; shakeUntil = ts + 320; shakeAmp = 4; }
    }
    // The lawn only rethinks its poses all at once when something big happens. Reset on every song,
    // a night of one second songs had the whole crowd changing pose every second.
    if (ev.kind !== 'song' || ev.bustout) for (const c of crowd) c.until = 0;
    if (reduce || ev.instant){
      snapBand = true;
      st.light = st.lightWant; st.house = st.houseWant; st.energy = st.energyWant;
      st.density = st.densityWant; st.sky = st.skyWant; st.palT = 1; st.flashUntil = 0;
      now = ts; draw();
    }
  }

  function destroy(){
    dead = true;
    if (glow.parentElement) glow.remove();
    if (dof.parentElement) dof.remove();
    if (vig.parentElement) vig.remove();
    cancelAnimationFrame(raf);
    if (io) io.disconnect();
    window.removeEventListener('resize', fit);
  }

  // The crowd shot is the end of the night: dark, the band taking a bow, the lawn on its feet.
  if (shot){
    Object.assign(st, { sky: 1, skyWant: 1, band: true, bow: true, house: 0, houseWant: 0,
      light: .8, lightWant: .8, energy: .7, energyWant: .7, density: 1, densityWant: 1 });
    setPalette('closer'); st.palT = 1;
  }
  /* Off screen, a picture nobody is looking at is not drawn: the crowd shot sits in a scrolling page. */
  let seen = true, io = null;
  if (shot && typeof IntersectionObserver === 'function'){
    io = new IntersectionObserver(es => { seen = es.some(e => e.isIntersecting); });
    io.observe(view);
  }
  window.addEventListener('resize', fit);
  fit();
  if (!reduce) raf = requestAnimationFrame(frame);
  return { cue, destroy, fit, marks, ready, get sprites(){ return frames; } };
}
