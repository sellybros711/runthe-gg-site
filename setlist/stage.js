/* THE STAGE.
 *
 * A pixel picture of the night, drawn over the playback while the feed under it
 * writes the setlist. It is a RENDERER and nothing else: every cue it is handed
 * comes out of showBeats(), which comes out of the result that was already
 * scored, so the picture can never disagree with the scorecard. Nothing in here
 * reads a song, a score or a rule. The page decides what happened and tells the
 * stage how it should LOOK.
 *
 * THE BAND IS DRAWN FROM ITS GEAR, NOT ITS FACES. A head here is three pixels
 * across, which is a deliberate floor rather than a limit: the yellow kit, the
 * keys rig, the rug and the hanging pods are what a fan recognises from the back
 * of a shed, and none of them is anybody's likeness. A face is not drawn at all.
 *
 * ONE RESOLUTION. The scene is drawn at 160x90 into a buffer and blitted at a
 * WHOLE number of device pixels a cell, with smoothing off. A fractional scale
 * gives some cells two pixels and some one, which reads as a broken picture
 * rather than as pixel art (mythiball's field camera learned that at length).
 *
 * VENUES are a table so the next one is a row. Only the theater exists today.
 * A venue changes how the room looks and how many people fit in it. It never
 * changes a score, because the board compares nights and a better room would
 * make the board a list of who unlocked the most.
 */

const W = 160, H = 90;

/* Each palette is the pair of colours the rig runs in for one song. Keyed by the
   same chip the feed colours a song with, so a jam reads violet in both places.
   NO AMBER OR GOLD: that colour belongs to the mid rating and the song tags on
   this page, and a stage washed in it would spend the one accent that means
   something. The kit is yellow because the kit IS yellow; it is gear, not light. */
const PALETTES = {
  jam:     [[150, 92, 255], [64, 214, 230]],
  peak:    [[255, 70, 170], [235, 235, 255]],
  cover:   [[255, 104, 92], [70, 220, 200]],
  encore:  [[240, 240, 255], [255, 96, 120]],
  ballad:  [[70, 120, 255], [160, 110, 255]],
  opener:  [[80, 230, 130], [235, 235, 255]],
  closer:  [[60, 210, 220], [255, 80, 180]],
  house:   [[120, 110, 160], [80, 160, 200]],
};
const ROTATION = ['jam', 'closer', 'ballad', 'cover', 'opener', 'peak'];

export const VENUES = {
  theater: {
    name: 'The Theater',
    capacity: 1,         // a share of the crowd rows the room holds
    wall: [14, 10, 30],
    floor: [20, 15, 34],
  },
};

const SKINS = [[236, 196, 160], [214, 166, 124], [176, 122, 84], [130, 86, 58], [92, 60, 42]];
const HAIRS = [[40, 28, 22], [92, 62, 34], [150, 110, 60], [20, 18, 24], [180, 150, 110], [120, 40, 30]];
const SHIRTS = [[220, 80, 90], [70, 140, 220], [240, 240, 240], [90, 190, 120], [170, 100, 210],
  [40, 40, 50], [230, 140, 60], [60, 180, 190], [200, 200, 120]];

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

function mulberry32(a){
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* The band. Positions are where each player's feet land on the deck, read off
   the photos: keys stage left, two strings in the middle on the rug, the kit on
   a riser stage right. */
const BAND = [
  { role: 'keys',   x: 25,  look: { skin: SKINS[1], hair: HAIRS[1], shirt: [80, 150, 90], pants: [50, 50, 64] } },
  { role: 'guitar', x: 62,  look: { skin: SKINS[1], hair: HAIRS[0], cap: [230, 226, 214],
    shirt: [140, 180, 230], pants: [92, 74, 56], axe: [236, 226, 210] } },
  { role: 'bass',   x: 95,  look: { skin: SKINS[0], hair: HAIRS[4], shirt: [190, 190, 200], pants: [40, 44, 58],
    axe: [160, 80, 50] } },
  { role: 'drums',  x: 134, look: { skin: SKINS[1], hair: HAIRS[0], brim: [70, 60, 56], shirt: [60, 80, 110] } },
];

const DECK_Y = 58;

export function createStage(canvas, opts = {}){
  const venue = VENUES[opts.venue] || VENUES.theater;
  const reduce = !!opts.reduce;
  const rand = mulberry32((opts.seed | 0) || 7);
  const buf = document.createElement('canvas');
  buf.width = W; buf.height = H;
  const g = buf.getContext('2d');
  const out = canvas.getContext('2d');

  /* The crowd is laid out once, off the night's own seed, so a replay of the
     same show draws the same room. `t` is how full the room has to be before a
     person turns up, so a bad night thins the back first and the rail last. */
  const crowd = [];
  const ROWS = [
    { y: 69, n: 34, s: 1, dark: .55 },
    { y: 72, n: 28, s: 2, dark: .62 },
    { y: 76, n: 22, s: 2, dark: .7 },
    { y: 81, n: 16, s: 3, dark: .8 },
    { y: 87, n: 11, s: 4, dark: .9 },
  ];
  ROWS.forEach((row, r) => {
    for (let i = 0; i < row.n; i++){
      const x = (i + .5) * (W / row.n) + (rand() - .5) * (W / row.n) * .7;
      crowd.push({
        r, x, home: x, y: row.y + (rand() < .5 ? 0 : 1), s: row.s, dark: row.dark,
        t: r >= 3 ? rand() * .55 : rand(),
        phase: rand() * Math.PI * 2,
        hair: HAIRS[(rand() * HAIRS.length) | 0],
        shirt: SHIRTS[(rand() * SHIRTS.length) | 0],
        hat: rand() < .25 ? SHIRTS[(rand() * SHIRTS.length) | 0] : null,
        phone: rand() < .45,
        drift: (rand() - .5) * 2,
      });
    }
  });

  /* What the night is doing right now. Every value with a `want` eases toward
     it, so a cue never snaps the picture: a segue crossfades the rig while the
     band keeps playing, which is what a segue looks like from the floor. */
  const st = {
    pal: PALETTES.house, palFrom: PALETTES.house, palT: 1,
    light: 0, lightWant: 0,          // stage lights, 0 is a dark stage
    house: 1, houseWant: 1,          // house lights, 1 is the walk-in
    energy: .2, energyWant: .2,
    density: .7, densityWant: .7,
    band: false,                     // is anybody on stage
    encore: false,
    signsUntil: 0, flashUntil: 0, jumpUntil: 0, segueUntil: 0,
    bow: false,
    rot: 0,
  };

  let k = 1, raf = 0, dead = false, last = 0, now = 0;

  function fit(){
    const box = canvas.parentElement;
    if (!box) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = box.clientWidth || 320;
    /* Never more than about a third of a phone's height: the feed under the
       stage is still where the night is written down. */
    const byW = Math.floor(cssW * dpr / W);
    const byH = Math.floor(window.innerHeight * .27 * dpr / H);
    k = Math.max(1, Math.min(byW, byH));
    canvas.width = W * k; canvas.height = H * k;
    canvas.style.width = (W * k / dpr) + 'px';
    canvas.style.height = (H * k / dpr) + 'px';
    draw();
  }

  // ── drawing ──────────────────────────────────────────────────────────────
  const px = (x, y, w, h, c, a = 1) => { g.fillStyle = rgb(c, a); g.fillRect(x | 0, y | 0, w, h); };

  function palette(){
    const t = clamp01(st.palT);
    return [mix(st.palFrom[0], st.pal[0], t), mix(st.palFrom[1], st.pal[1], t)];
  }

  function drawRoom(p){
    const wall = mix(venue.wall, shade(p[0], .25), st.light * .35);
    px(0, 0, W, DECK_Y, mix(wall, [70, 64, 84], st.house * .5));
    // The truss and the fixtures hung on it.
    px(0, 4, W, 2, [52, 48, 70]);
    for (let x = 6; x < W; x += 12){
      px(x, 6, 2, 2, [30, 28, 40]);
      px(x, 7, 2, 1, p[(x / 12 | 0) % 2], .35 + .65 * st.light);
    }
  }

  /* The hanging pods off the Bend rig: six columns of lamps that chase. */
  function drawPods(p, t){
    for (let c = 0; c < 6; c++){
      const x = 47 + c * 13;
      px(x, 8, 3, 28, [24, 20, 36]);
      for (let r = 0; r < 5; r++){
        const v = .5 + .5 * Math.sin(t * (2 + st.energy * 5) + c * .9 + r * .7);
        const on = st.light * (.25 + .75 * v);
        px(x, 10 + r * 5, 3, 3, mix([40, 36, 54], p[(c + r) % 2], on));
        if (on > .7) px(x + 1, 11 + r * 5, 1, 1, [255, 255, 255], (on - .7) * 2.5);
      }
    }
  }

  function drawDeck(){
    px(0, 36, W, DECK_Y - 36, mix([18, 14, 30], [60, 56, 76], st.house * .5));
    // Backline: amps behind the two strings.
    px(54, 47, 8, 9, [34, 30, 40]); px(55, 48, 6, 7, [48, 44, 56]);
    px(88, 47, 9, 9, [34, 30, 40]); px(89, 48, 7, 7, [48, 44, 56]);
    // The deck and its lip.
    px(0, DECK_Y - 2, W, 4, [44, 36, 58]);
    px(0, DECK_Y + 2, W, 5, [12, 9, 18]);
    // The rug, which every one of these stages has.
    for (let x = 42; x < 112; x++){
      for (let y = DECK_Y - 2; y < DECK_Y + 2; y++){
        const pat = ((x + y * 3) % 7 === 0) || ((x - y * 3) % 7 === 0);
        px(x, y, 1, 1, pat ? [214, 150, 70] : (y === DECK_Y - 2 || y === DECK_Y + 1) ? [110, 34, 30] : [160, 54, 40]);
      }
    }
    // Wedges at the front edge.
    px(50, DECK_Y - 1, 5, 2, [20, 18, 26]); px(102, DECK_Y - 1, 5, 2, [20, 18, 26]);
  }

  /* A standing player. `bob` lifts the whole figure on the beat, `arm` swings
     the strumming hand. Three pixels of head, no face: see the header. */
  function figure(x, feet, look, bob, arm){
    const y = feet - 13 - bob;
    const sk = look.skin, sh = look.shirt, pa = look.pants;
    if (look.brim){ px(x - 3, y, 7, 1, look.brim); px(x - 1, y - 1, 3, 1, look.brim); }
    else if (look.cap){ px(x - 1, y, 3, 1, look.cap); px(x - 3, y, 2, 1, look.cap); }
    else px(x - 1, y, 3, 1, look.hair);
    px(x - 1, y + 1, 3, 2, sk);
    if (look.hair && !look.brim && !look.cap) px(x - 2, y + 1, 1, 3, look.hair);
    else px(x + 1, y + 1, 1, 1, look.hair);
    px(x - 2, y + 3, 5, 5, sh);
    px(x - 2, y + 8, 2, 4, pa); px(x + 1, y + 8, 2, 4, pa);
    px(x - 2, y + 12, 2, 1, [24, 20, 26]); px(x + 1, y + 12, 2, 1, [24, 20, 26]);
    if (look.axe){
      const bass = look.axe[0] < 200;
      px(x - 2, y + 6, 4, 3, look.axe);
      px(x - 1, y + 7, 2, 1, shade(look.axe, .55));
      for (let i = 0; i < (bass ? 7 : 5); i++) px(x + 2 + i, y + 6 - (i >> 1), 1, 1, [96, 70, 46]);
      // The strumming hand, and the fretting one up the neck.
      px(x - 3, y + 6 + arm, 1, 2, sk);
      px(x + 4, y + 4, 1, 1, sk);
    } else {
      px(x - 3, y + 4, 1, 3, sk); px(x + 3, y + 4, 1, 3, sk);
    }
    if (st.bow){ px(x - 3, y - 2, 1, 3, sk); px(x + 3, y - 2, 1, 3, sk); }
  }

  function drawKeys(m, t){
    const beat = Math.sin(t * (4 + st.energy * 6));
    const x = m.x;
    // The player sits behind the rig, so only the top of him clears it.
    const y = DECK_Y - 17 - (beat > .6 && st.energy > .4 ? 1 : 0);
    px(x - 1, y, 3, 1, m.look.hair); px(x - 2, y + 1, 1, 3, m.look.hair);
    px(x - 1, y + 1, 3, 2, m.look.skin);
    px(x - 2, y + 3, 5, 6, m.look.shirt);
    // Two tiers of keys, the top one angled, on an X stand.
    px(x - 11, DECK_Y - 12, 22, 2, [30, 28, 36]);
    px(x - 11, DECK_Y - 12, 22, 1, [210, 210, 214]);
    px(x - 10, DECK_Y - 8, 20, 2, [26, 24, 30]);
    px(x - 10, DECK_Y - 8, 20, 1, [230, 230, 230]);
    px(x - 6, DECK_Y - 6, 1, 4, [60, 56, 70]); px(x + 5, DECK_Y - 6, 1, 4, [60, 56, 70]);
    px(x - 4, DECK_Y - 4, 9, 1, [60, 56, 70]);
    // Hands on the keys, moving with the music.
    const h = beat > 0 ? 0 : 1;
    px(x - 4 + h, DECK_Y - 9, 1, 1, m.look.skin); px(x + 3 - h, DECK_Y - 9, 1, 1, m.look.skin);
  }

  function drawDrums(m, t){
    const x = m.x;
    // The riser.
    px(x - 18, DECK_Y - 8, 34, 6, [30, 26, 40]); px(x - 18, DECK_Y - 8, 34, 1, [56, 50, 70]);
    const hit = Math.sin(t * (5 + st.energy * 8));
    const yb = DECK_Y - 23 - (hit > .7 && st.energy > .5 ? 1 : 0);
    // The drummer, behind the kit, under the hat.
    px(x - 3, yb, 7, 1, m.look.brim); px(x - 1, yb - 1, 3, 1, m.look.brim);
    px(x - 1, yb + 1, 3, 2, m.look.skin); px(x + 1, yb + 1, 1, 1, m.look.hair);
    px(x - 2, yb + 3, 5, 6, m.look.shirt);
    const up = hit > 0 ? 2 : 0;
    px(x - 4, yb + 3 - up, 1, 3, m.look.skin); px(x + 4, yb + 1 + up, 1, 3, m.look.skin);
    // Cymbals.
    const cym = [218, 196, 120];
    const ring = st.energy > .5 && hit > .8 ? 1 : 0;
    px(x - 12, yb - 1 - ring, 7, 1, cym); px(x - 9, yb, 1, 6, [90, 90, 96]);
    px(x + 7, yb - 3, 8, 1, cym); px(x + 10, yb - 2, 1, 8, [90, 90, 96]);
    px(x - 16, yb + 4, 5, 1, cym);
    // The yellow shells.
    const yel = [244, 206, 40], yelD = [196, 158, 20];
    px(x - 7, yb + 5, 4, 3, yel); px(x - 7, yb + 7, 4, 1, yelD);
    px(x + 4, yb + 5, 4, 3, yel); px(x + 4, yb + 7, 4, 1, yelD);
    px(x + 9, yb + 9, 5, 5, yel); px(x + 9, yb + 13, 5, 1, yelD);
    px(x - 13, yb + 9, 4, 4, yel);
    // The bass drum, with a painted head. Abstract colour, not anybody's art.
    const cx = x, cy = DECK_Y - 13, r = 5;
    for (let yy = -r; yy <= r; yy++){
      for (let xx = -r; xx <= r; xx++){
        const d = xx * xx + yy * yy;
        if (d > r * r + 1) continue;
        let c;
        if (d >= (r - 1) * (r - 1) + 1) c = yel;
        else {
          const a = Math.atan2(yy, xx) + d * .25 + t * .4 * st.energy;
          const band = ((a / (Math.PI / 3)) % 3 + 3) % 3 | 0;
          c = [[240, 90, 60], [70, 110, 230], [90, 200, 220]][band];
          if (yy < -1 && d < 6) c = [250, 240, 220];
        }
        px(cx + xx, cy + yy, 1, 1, c);
      }
    }
  }

  function drawBand(t){
    if (!st.band) return;
    const tempo = 3 + st.energy * 7;
    BAND.forEach((m, i) => {
      if (m.role === 'keys') return drawKeys(m, t);
      if (m.role === 'drums') return drawDrums(m, t);
      const s = Math.sin(t * tempo + i * 1.7);
      const bob = st.energy > .35 && s > .5 ? 1 : 0;
      const arm = Math.sin(t * tempo * 2 + i) > 0 ? 0 : 1;
      const sway = st.energy > .75 ? Math.round(Math.sin(t * 1.3 + i) * 1) : 0;
      figure(m.x + sway, DECK_Y, m.look, bob, arm);
    });
  }

  /* A cone of light from a fixture. Drawn with 'lighter', so where two beams
     cross the haze gets brighter, which is the look of every photo in the set. */
  function beam(x, y, ang, len, spread, c, a){
    const dx = Math.sin(ang), dy = Math.cos(ang);
    const ex = x + dx * len, ey = y + dy * len;
    const nx = dy * spread, ny = -dx * spread;
    g.fillStyle = rgb(c, a);
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex + nx, ey + ny); g.lineTo(ex - nx, ey - ny); g.closePath(); g.fill();
    g.fillStyle = rgb([255, 255, 255], a * 1.6);
    g.fillRect(x - .5, y - .5, 1.5, 1.5);
  }

  function drawBeams(p, t){
    const L = st.light;
    if (L < .03) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const e = st.energy;
    const sp = .5 + e * 1.8;
    const amp = .25 + e * .5;
    const a = (.06 + e * .1) * L;
    // From the truss, down toward the deck, sweeping.
    for (let i = 0; i < 8; i++){
      const x = 12 + i * 19;
      const ang = Math.sin(t * sp + i * .9) * amp + (i < 4 ? .25 : -.25);
      beam(x, 7, ang, 62, 5 + e * 3, p[i % 2], a);
    }
    // From the deck, fanning up, when the song is big enough to earn them.
    if (e > .45){
      for (let i = 0; i < 6; i++){
        const x = 20 + i * 24;
        const ang = Math.PI + Math.sin(t * sp * .8 + i) * (amp + .2) + (i - 2.5) * .18;
        beam(x, DECK_Y - 3, ang, 58, 4 + e * 3, p[(i + 1) % 2], a * (e - .35) * 1.6);
      }
    }
    // A segue: one white sweep across the rig while the colour changes under it.
    if (now < st.segueUntil){
      const f = 1 - (st.segueUntil - now) / 1400;
      const sx = -10 + f * (W + 20);
      g.fillStyle = rgb([255, 255, 255], .22 * (1 - Math.abs(f - .5) * 2) * L);
      g.fillRect(sx - 6, 0, 12, DECK_Y);
    }
    g.restore();
    // Haze, low over the deck.
    for (let i = 0; i < 3; i++){
      const hy = 38 + i * 6 + Math.sin(t * .3 + i) * 1.5;
      px(0, hy, W, 4, p[i % 2], .035 * L * (.5 + e));
    }
  }

  function drawCrowd(p, t){
    const lit = st.house;
    const e = st.energy;
    const jumping = now < st.jumpUntil;
    const signs = now < st.signsUntil;
    // The floor in front of the deck.
    /* The floor catches the spill off the stage, so it is LIGHTER than the
       people standing on it. Drawn the other way round the crowd vanishes into
       it and all that is left is the rim light, floating. */
    for (let y = DECK_Y + 7; y < H; y++){
      const f = 1 - (y - DECK_Y - 7) / (H - DECK_Y - 7);
      const spill = mix(venue.floor, shade(p[0], .55), .35 * st.light * f);
      px(0, y, W, 1, mix(mix(spill, [36, 30, 52], .3), [92, 84, 110], lit * .6));
    }
    for (const c of crowd){
      if (c.t > st.density * venue.capacity) continue;
      // During the break people wander, and come back when the lights go down.
      const x = c.home + (st.band ? 0 : Math.sin(t * .4 + c.phase) * 3 * c.drift);
      c.x += (x - c.x) * .08;
      const hop = (jumping || e > .7) ? Math.max(0, Math.sin(t * (6 + e * 4) + c.phase)) * (c.s > 1 ? 1.5 : 1) : 0;
      const y = c.y - (hop > .6 ? 1 : 0);
      const s = c.s;
      /* BACKLIT. From the floor the crowd is a row of silhouettes with the
         stage on the tops of their heads and shoulders, which is what every
         photo in the reference set shows. Under the house lights they turn
         back into people in t-shirts. */
      const sil = shade([7, 5, 13], .85 + c.drift * .15);
      const body = mix(sil, shade(c.shirt, .85), lit);
      const head = mix(shade(sil, 1.15), c.hair, lit * .9);
      const rimA = .65 * st.light * (1 - lit) * (.6 + .4 * c.dark);
      const rim = p[(c.x / 20 | 0) % 2];
      const hw = s + 1, sw = s * 2 + 1;
      const hy = y - s - 1;
      // Shoulders, then a rounded head on them.
      // A torso, not a column to the bottom of the frame: the row in front
      // covers the rest, and where nobody stands the floor shows through.
      px(c.x - s, y, sw, s * 3 + 3, body);
      if (s >= 2) px(c.x - s - 1, y + 1, 1, s * 3 + 2, body), px(c.x + s + 1, y + 1, 1, s * 3 + 2, body);
      if (s >= 2){
        px(c.x - (hw >> 1), hy + 1, hw, s, head);
        px(c.x - (hw >> 1) + 1, hy, hw - 2 || 1, 1, head);
      } else px(c.x - (hw >> 1), hy, hw, s + 1, head);
      if (c.hat){
        const hc = mix(shade(c.hat, .3), c.hat, lit);
        px(c.x - (hw >> 1), hy, hw, 1, hc);
        if (s >= 3) px(c.x - (hw >> 1) - 1, hy + 1, hw + 2, 1, hc);
      }
      if (rimA > .02){
        px(c.x - (hw >> 1) + (s >= 2 ? 1 : 0), hy, Math.max(1, hw - (s >= 2 ? 2 : 0)), 1, rim, rimA);
        px(c.x - s, y, sw, 1, rim, rimA * .6);
      }
      // Hands up: on a big song, on a bustout, and for everybody at the bow.
      const up = st.bow || jumping || (e > .55 && Math.sin(t * 1.7 + c.phase) > 1.2 - e);
      if (up && st.band){
        const ay = y - s - 3 - (hop > .3 ? 1 : 0);
        px(c.x - s, ay, 1, s + 2, head);
        px(c.x + s, ay, 1, s + 2, head);
        if (st.encore && c.phone){
          const fl = .6 + .4 * Math.sin(t * 3 + c.phase);
          px(c.x + s, ay - 1, 1, 1, [220, 240, 255], fl);
        }
      } else if (st.encore && c.phone && st.band){
        px(c.x + s, y - s - 2, 1, 1, [220, 240, 255], .5 + .4 * Math.sin(t * 2 + c.phase));
      }
      // A bustout gets signs.
      if (signs && c.r >= 2 && c.phone && (c.phase * 10 | 0) % 3 === 0){
        px(c.x - 3, y - s - 9, 7, 4, [244, 240, 228]);
        px(c.x - 2, y - s - 8, 5, 1, p[0]);
        px(c.x, y - s - 5, 1, 4, [120, 96, 70]);
      }
    }
  }

  function draw(){
    const t = now / 1000;
    const p = palette();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    drawRoom(p);
    drawPods(p, t);
    drawDeck();
    drawBand(t);
    // The stage goes dark with the lights; the band is still there, just unlit.
    const dim = (1 - st.light) * (1 - st.house) * .7;
    if (dim > .01) px(0, 0, W, DECK_Y + 7, [6, 4, 12], dim);
    drawBeams(p, t);
    drawCrowd(p, t);
    if (now < st.flashUntil){
      px(0, 0, W, H, [255, 255, 255], .5 * (st.flashUntil - now) / 260);
    }
    out.imageSmoothingEnabled = false;
    out.drawImage(buf, 0, 0, W * k, H * k);
  }

  function ease(dt){
    const f = 1 - Math.pow(.02, dt);       // about two seconds to settle
    st.light += (st.lightWant - st.light) * f;
    st.house += (st.houseWant - st.house) * f;
    st.energy += (st.energyWant - st.energy) * f;
    st.density += (st.densityWant - st.density) * f * .5;
    if (st.palT < 1) st.palT = Math.min(1, st.palT + dt / 1.1);
  }

  function frame(ts){
    if (dead) return;
    if (!canvas.isConnected){ destroy(); return; }
    raf = requestAnimationFrame(frame);
    // Thirty frames a second is plenty for a 160 pixel room, and half the battery.
    if (ts - last < 32) return;
    const dt = Math.min(.1, (ts - (last || ts)) / 1000);
    last = ts; now = ts;
    ease(dt);
    draw();
  }

  function setPalette(name){
    const next = PALETTES[name] || PALETTES.jam;
    if (next === st.pal) return;
    st.palFrom = palette();
    st.pal = next; st.palT = 0;
  }

  const DENSITY = { hot: 1, warm: .74, cold: .42 };

  /* The whole interface. The page hands over what happened; the stage decides
     only how it looks. See renderShow() for the mapping from a beat. */
  function cue(ev){
    const ts = performance.now();
    if (ev.kind === 'set'){
      st.band = true; st.bow = false;
      st.encore = !!ev.encore;
      st.houseWant = 0; st.lightWant = .55; st.energyWant = .3;
      setPalette(ev.encore ? 'encore' : 'house');
      st.jumpUntil = ts + 900;
    } else if (ev.kind === 'song'){
      st.band = true;
      st.houseWant = 0;
      st.lightWant = .55 + ev.energy * .45;
      st.energyWant = clamp01(ev.energy + (ev.jam ? .25 : 0));
      setPalette(ev.palette || ROTATION[st.rot++ % ROTATION.length]);
      if (ev.segue) st.segueUntil = ts + 1400;
      if (ev.bustout){ st.signsUntil = ts + 3200; st.jumpUntil = ts + 1800; st.flashUntil = ts + 260; }
      if (ev.grade) st.densityWant = DENSITY[ev.grade] || .74;
    } else if (ev.kind === 'time'){
      // A set is over. The band walks off and the house lights come up.
      st.band = !ev.last ? false : st.band;
      if (!ev.last){ st.houseWant = .85; st.lightWant = 0; st.energyWant = .15; }
    } else if (ev.kind === 'final'){
      st.band = true; st.bow = true;
      st.houseWant = 0; st.lightWant = 1; st.energyWant = ev.grade === 'cold' ? .4 : 1;
      st.densityWant = DENSITY[ev.grade] || .74;
      st.flashUntil = ts + 260;
      if (ev.grade !== 'cold') st.jumpUntil = ts + 2400;
    }
    if (reduce || ev.instant){
      // No easing for a reader who asked for no motion, or for a skip.
      st.light = st.lightWant; st.house = st.houseWant; st.energy = st.energyWant;
      st.density = st.densityWant; st.palT = 1;
      st.flashUntil = 0;
      now = ts; draw();
    }
  }

  function destroy(){
    dead = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', fit);
  }

  window.addEventListener('resize', fit);
  fit();
  if (!reduce) raf = requestAnimationFrame(frame);
  return { cue, destroy, fit };
}
