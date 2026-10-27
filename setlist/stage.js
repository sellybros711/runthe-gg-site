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
import { ROOMS, RIGS } from './rooms.js?v=3';
/* The camera, the solids, the people, the band and the venue's painted layers live in world.js, which
   the room builder in world-worker.js and the menus share. This file lights and moves them. */
import {
  ART, WPX, sx, sy, depth, rgb, mixc, clamp01, hash, mulberry32,
  canvas, SKINS, HAIRS, face, personSprite, CROWD_POSES, signPose, crowdVariant, DECK, FIX,
  podCorners, CE, HPX, PAX, PAY, bandPose, buildWorld, rigFor, PLAYERS, CROWD_KINDS,
} from './world.js?v=1';

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
      ? new Worker(new URL('./world-worker.js?v=1', import.meta.url), { type: 'module' }) : false;
  } catch (err) { worker = false; }
  if (worker){
    worker.onmessage = e => { const cb = waiting.get(e.data.id); if (cb){ waiting.delete(e.data.id); cb(e.data); } };
    worker.onerror = () => { for (const cb of waiting.values()) cb(null); waiting.clear(); worker = false; };
  }
  return worker;
}
function buildOffThread(vid, seed){
  return new Promise(res => {
    const w = worldWorker();
    if (!w) return res(null);
    const id = ++jobs;
    const timer = setTimeout(() => { waiting.delete(id); res(null); }, 8000);
    waiting.set(id, d => { clearTimeout(timer); res(d && !d.error ? d : null); });
    w.postMessage({ id, vid, seed });
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
  const wkey = vid + ':' + seed;
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
  else if (!known && opts.sync){ take(keep(buildWorld(R, RIG, seed))); ready = Promise.resolve(); }
  else {
    const job = known || buildOffThread(vid, seed).then(w => keep(w || buildWorld(R, RIG, seed)));
    if (!known) WORLDS.set(wkey, job);
    ready = job.then(w => { if (!dead){ take(w); draw(); } });
  }

  // The crowd: twenty eight kinds of person, several hundred people, back to front.
  const variants = Array.from({ length: CROWD_KINDS }, () => crowdVariant(rand));
  spriteCache = new Map(preCrowd ? Object.entries(preCrowd) : []);
  const spriteOf = (vi, pose) => {
    const key = vi + ':' + pose;
    let s = spriteCache.get(key);
    if (!s){
      const v = variants[vi];
      s = personSprite(v, pose === 'sign' ? signPose(v) : CROWD_POSES[pose], true);
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
    signsUntil: 0, flashUntil: 0, jumpUntil: 0, segueUntil: 0, strobeUntil: 0, mode: 0, rot: 0,
  };
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
    if (tr === shook) return;
    shook = tr;
    for (const el of [view, dof, glow]) el.style.translate = tr;
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

  function drawBand(t){
    if (!st.band) return;
    // How each player moves is world.js's bandPose, the one the menus use too.
    for (let i = 0; i < PLAYERS.length; i++){
      const { img, at, bob } = bandPose(frames, i, t, st);
      const [px, py] = P2(at.x, at.y, at.z);
      g.drawImage(img, px - PAX, py - PAY - bob);
    }
  }

  function drawCrowd(t){
    const e = st.energy, lit = st.house > .5;
    const jumping = now < st.jumpUntil, signs = now < st.signsUntil;
    const top = camY - 20, bot = camY + visH + 50, lft = camX - 20, rgt = camX + visW + 20;
    for (const c of crowd){
      c.px = null;
      if (c.t > st.density * (FL.capacity || 1)) continue;
      const [px, py] = P2(c.x, c.y, 0);
      if (py < top || py > bot || px < lft || px > rgt) continue;
      // A pose is held for a while and then reconsidered, so the lawn never moves in lockstep.
      if (c.you) c.pose = 'up';
      else if (now > c.until){
        const r = Math.random();
        let pose = 'down';
        if (st.band && !lit){
          if (signs && c.sign) pose = 'sign';
          else if (st.encore && c.phone && r < .55) pose = 'phone';
          else if (st.bow || jumping) pose = r < .7 ? 'up' : 'clap';
          else if (r < e * .55) pose = r < e * .3 ? 'up' : r < e * .42 ? 'one' : 'clap';
        }
        c.pose = pose;
        c.until = now + 1500 + Math.random() * 3500;
      }
      const hop = st.band && !lit && (jumping || e > .7)
        ? Math.round(Math.max(0, Math.sin(t * (5 + e * 3) + c.phase)) * 2 * c.jumpy) : 0;
      const sway = st.band && !lit && e > .35 ? Math.round(Math.sin(t * 1.5 + c.phase)) : 0;
      const wander = lit ? Math.round(Math.sin(t * .4 + c.phase) * 2) : 0;
      c.px = px + sway + wander; c.py = py - hop;
      if (!lite) g.drawImage(shade, px + sway + wander - 6, py - 2);
      g.drawImage(spriteOf(c.v, c.pose), c.px - PAX, c.py - PAY);
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
    const L = st.light, H = st.house, e = st.energy;
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
    g.translate(-camX, -camY);
    if (st.band){
      g.fillStyle = 'rgba(30,20,40,.35)';
      for (const [, m] of PLAYERS){ const [px, py] = P2(m.x, m.y, m.z); g.beginPath(); g.ellipse(px, py, 5, 2, 0, 0, 7); g.fill(); }
    }
    drawBand(t);
    g.drawImage(front, camX, camY, visW, visH, camX, camY, visW, visH);
    drawCrowd(t);

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
      for (const [, m] of PLAYERS){
        const [px, py] = P2(m.x, m.y, m.z);
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
    drawSky(t, night, p, show, L);
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
    if (ev.kind === 'set'){
      st.band = true; st.bow = false; st.encore = !!ev.encore;
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
      if (ev.bustout){ burst(150); shakeUntil = ts + 320; shakeAmp = 3; st.signsUntil = ts + 3400; st.jumpUntil = ts + 2000; st.flashUntil = ts + 260; st.strobeUntil = ts + 1600; }
      if (ev.grade) st.densityWant = DENSITY[ev.grade] || .8;
    } else if (ev.kind === 'time'){
      if (!ev.last){ st.band = false; st.houseWant = .85; st.lightWant = 0; st.energyWant = .15; }
    } else if (ev.kind === 'final'){
      st.band = true; st.bow = true; st.skyWant = 1;
      st.houseWant = 0; st.lightWant = 1; st.energyWant = ev.grade === 'cold' ? .4 : 1;
      st.densityWant = DENSITY[ev.grade] || .8;
      st.flashUntil = ts + 260;
      if (ev.grade !== 'cold'){ st.jumpUntil = ts + 3000; st.strobeUntil = ts + 1400; burst(240); sparkUntil = ts + 2600; shakeUntil = ts + 320; shakeAmp = 4; }
    }
    // The lawn only rethinks its poses all at once when something big happens. Reset on every song,
    // a night of one second songs had the whole crowd changing pose every second.
    if (ev.kind !== 'song' || ev.bustout) for (const c of crowd) c.until = 0;
    if (reduce || ev.instant){
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
