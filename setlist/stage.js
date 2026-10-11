/* THE STAGE.
 *
 * The night, drawn as a room you are standing in: a 3/4 view looking down the
 * floor at the stage, the band facing you, the crowd's backs in front of you,
 * the rig over all of it. It fills the screen while the show plays, and the
 * setlist rides on top of it as the paper taped to the stage.
 *
 * IT IS A RENDERER AND NOTHING ELSE. Every cue it is handed comes out of
 * showBeats(), which comes out of the result that was already scored, so the
 * picture can never disagree with the scorecard. Nothing in here reads a song,
 * a score or a rule. The page decides what happened; the stage decides how it
 * looks. scripts/setlist/check_data.mjs holds that line.
 *
 * ONE WORLD, ONE SCALE. The room is a fixed 640x720 world in logical pixels,
 * laid out at real proportions: a person is 34 pixels, so a metre is about 19,
 * which makes the deck fifteen metres wide, the screen twelve, a keyboard a
 * metre and a half. Nothing is resized for depth. That is the 3/4 convention
 * this site's golf world uses, and depth comes from occlusion, shadow and
 * light, the way it does in every game drawn this way.
 *
 * WHOLE DEVICE PIXELS A CELL. The camera picks the visible slice of the world
 * for this screen, draws it into a buffer at one logical pixel a cell, and
 * blits that at a whole number of device pixels with smoothing off. A
 * fractional scale gives some cells two pixels and some one, which reads as a
 * broken picture rather than as pixel art.
 *
 * THE BAND IS DRAWN FROM ITS GEAR. A generic face is a pair of eyes; what a fan
 * recognises is the yellow kit on its riser, the keys rig stage left, the rug,
 * the hats, and where each player stands. No likeness, and no copy of any
 * band's own artwork: the kick drum head is an abstract swirl.
 *
 * VENUES are a table so the next one is a row. A venue changes the room and
 * how many people it holds. It never changes a score.
 */

const WW = 640, WH = 720;

const PALETTES = {
  jam:    [[150, 92, 255], [64, 214, 230]],
  peak:   [[255, 70, 170], [235, 235, 255]],
  cover:  [[255, 104, 92], [70, 220, 200]],
  encore: [[240, 240, 255], [255, 96, 120]],
  ballad: [[70, 120, 255], [160, 110, 255]],
  opener: [[80, 230, 130], [235, 235, 255]],
  closer: [[60, 210, 220], [255, 80, 180]],
  house:  [[150, 140, 200], [110, 170, 220]],
};
const ROTATION = ['jam', 'closer', 'ballad', 'cover', 'opener', 'peak'];

export const VENUES = {
  theater: { name: 'The Theater', capacity: 1 },
};

// ── colour ─────────────────────────────────────────────────────────────────
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sh = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const INK = [22, 14, 28];

function mulberry32(a){
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function canvas(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* A brush over one 2D context: rectangles in a colour, and a one pixel line.
   Everything in the room is built out of these two. */
function brush(g){
  const r = (x, y, w, h, c, a = 1) => {
    if (w <= 0 || h <= 0) return;
    g.fillStyle = rgb(c, a); g.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const line = (x0, y0, x1, y1, c, w = 1, a = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (let i = 0; i <= n; i++){
      const t = n ? i / n : 0;
      r(x0 + (x1 - x0) * t - (w >> 1), y0 + (y1 - y0) * t - (w >> 1), w, w, c, a);
    }
  };
  return { r, line, g };
}

/* A sprite with a one pixel ink outline, which is what makes a figure read as
   drawn rather than as a pile of rectangles. Drawn into a scratch canvas, then
   its silhouette is stamped four times in ink underneath. */
function outlined(w, h, draw, ink = INK){
  const t = canvas(w, h);
  draw(brush(t.getContext('2d')));
  const s = canvas(w, h);
  const sg = s.getContext('2d');
  sg.drawImage(t, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = rgb(ink); sg.fillRect(0, 0, w, h);
  const c = canvas(w + 2, h + 2);
  const cg = c.getContext('2d');
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) cg.drawImage(s, dx, dy);
  cg.drawImage(t, 1, 1);
  return c;
}

// ── people ─────────────────────────────────────────────────────────────────
/* One figure, drawn about a centre column `cx` with the feet on row `fy`. The
   proportions are a 34 pixel person: an eight wide head, a ten wide body. */
const SKINS = [[241, 204, 170], [222, 176, 134], [192, 136, 96], [150, 100, 68], [104, 68, 46]];
const HAIRS = [[44, 30, 24], [96, 64, 36], [150, 108, 60], [26, 22, 28], [196, 160, 112], [130, 52, 34], [170, 170, 176]];
const SHIRTS = [[218, 72, 88], [68, 132, 218], [236, 236, 230], [86, 176, 112], [160, 96, 206],
  [44, 44, 56], [226, 136, 58], [56, 172, 184], [196, 196, 112], [120, 84, 64], [230, 120, 160]];

function shirtFill(b, x, y, w, h, o){
  const c = o.shirt;
  b.r(x, y, w, h, c);
  if (o.dye){
    // Tie dye: the shirt every lot sells, in rings.
    const cols = [[236, 80, 120], [250, 200, 70], [70, 190, 220], [140, 90, 230], [90, 210, 120]];
    for (let yy = 0; yy < h; yy++){
      for (let xx = 0; xx < w; xx++){
        const d = Math.hypot(xx - w / 2 + .5, (yy - h / 2) * 1.3) + o.dye;
        b.r(x + xx, y + yy, 1, 1, cols[(d | 0) % cols.length]);
      }
    }
  } else if (o.check){
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++)
      if ((xx % 3 === 0) || (yy % 3 === 0)) b.r(x + xx, y + yy, 1, 1, sh(c, .72));
  } else if (o.stripe){
    for (let yy = 1; yy < h; yy += 3) b.r(x, y + yy, w, 1, sh(c, .7));
  }
  // Light from the stage side, shadow away from it.
  b.r(x, y, 1, h, sh(c, 1.15), .55);
  b.r(x + w - 2, y, 2, h, sh(c, .7), .6);
}

function headFront(b, cx, top, o){
  const sk = o.skin, hr = o.hair;
  const L = cx - 4;
  // Long hair falls behind the shoulders, so it is drawn first.
  if (o.style === 'long' || o.style === 'shaggy'){
    b.r(L - 1, top + 2, 10, o.style === 'long' ? 15 : 11, sh(hr, .8));
  }
  b.r(L, top + 2, 8, 7, sk);
  b.r(L + 1, top + 9, 6, 1, sk);
  b.r(L + 6, top + 2, 2, 7, sh(sk, .82));
  b.r(L + 1, top + 9, 6, 1, sh(sk, .9));
  // A generic face: two eyes and a shadow for a nose. Nobody in particular.
  b.r(L + 2, top + 5, 1, 1, [36, 26, 30]);
  b.r(L + 5, top + 5, 1, 1, [36, 26, 30]);
  b.r(L + 4, top + 6, 1, 1, sh(sk, .8));
  if (o.beard){
    b.r(L, top + 6, 8, 4, sh(hr, .95));
    b.r(L + 1, top + 10, 6, 1, sh(hr, .8));
    b.r(L + 3, top + 7, 2, 1, sh(sk, .55));
  } else b.r(L + 3, top + 8, 2, 1, sh(sk, .7));
  if (o.glasses){ b.r(L + 1, top + 5, 3, 1, [30, 26, 34]); b.r(L + 4, top + 5, 3, 1, [30, 26, 34]); }
  // Hair on top, then whatever is on it.
  if (o.style !== 'bald'){
    b.r(L, top, 8, 3, hr);
    b.r(L + 1, top - 1, 6, 1, hr);
    b.r(L + 1, top, 3, 1, sh(hr, 1.3));
    b.r(L - 1, top + 1, 1, o.style === 'short' ? 4 : 8, hr);
    b.r(L + 8, top + 1, 1, o.style === 'short' ? 4 : 8, sh(hr, .8));
    if (o.style === 'shaggy') b.r(L, top + 3, 2, 1, hr), b.r(L + 6, top + 3, 2, 1, hr);
  }
  if (o.hat === 'brim'){
    const c = o.hatC;
    b.r(L - 4, top + 1, 16, 2, c);
    b.r(L - 4, top + 3, 16, 1, sh(c, .6));
    b.r(L, top - 4, 8, 5, c);
    b.r(L, top - 1, 8, 1, sh(c, .55));
    b.r(L + 1, top - 4, 2, 4, sh(c, 1.25));
  } else if (o.hat === 'capback'){
    const c = o.hatC;
    b.r(L, top - 2, 8, 4, c);
    b.r(L + 1, top - 2, 3, 1, sh(c, 1.2));
    b.r(L + 2, top + 1, 4, 1, sh(c, .6));
  } else if (o.hat === 'cap'){
    const c = o.hatC;
    b.r(L, top - 2, 8, 4, c);
    b.r(L - 1, top + 2, 10, 1, sh(c, .7));
  }
}

function bodyFront(b, cx, fy, o, armL, armR){
  const top = fy - 34;
  const sk = o.skin;
  headFront(b, cx, top, o);
  // Neck, shirt, belt, legs, shoes.
  b.r(cx - 1, top + 10, 3, 2, sh(sk, .8));
  shirtFill(b, cx - 5, top + 12, 10, 10, o);
  if (o.vest){ b.r(cx - 5, top + 12, 3, 10, o.vest); b.r(cx + 2, top + 12, 3, 10, sh(o.vest, .8)); }
  b.r(cx - 1, top + 12, 2, 1, sh(sk, .85));
  b.r(cx - 5, top + 22, 10, 1, [40, 30, 28]);
  const pa = o.pants;
  b.r(cx - 5, top + 23, 4, 9, pa);
  b.r(cx + 1, top + 23, 4, 9, sh(pa, .85));
  b.r(cx - 2, top + 23, 1, 9, sh(pa, .7));
  b.r(cx + 4, top + 23, 1, 9, sh(pa, .65));
  b.r(cx - 6, top + 32, 5, 2, o.shoes);
  b.r(cx + 1, top + 32, 5, 2, sh(o.shoes, .85));
  b.r(cx - 6, top + 32, 5, 1, sh(o.shoes, 1.4));
  // Arms: each is a list of [x, y] joints from the shoulder to the hand.
  const sleeve = o.sleeveless ? sk : o.shirt;
  const arm = (pts, side) => {
    for (let i = 0; i < pts.length - 1; i++){
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      b.line(x0, y0, x1, y1, i === 0 ? sleeve : sk, 2);
    }
    const [hx, hy] = pts[pts.length - 1];
    b.r(hx - 1, hy - 1, 2, 2, side ? sh(sk, .85) : sk);
  };
  if (armL) arm(armL.map(([x, y]) => [cx + x, top + y]), 0);
  if (armR) arm(armR.map(([x, y]) => [cx + x, top + y]), 1);
}

function guitar(b, cx, top, o, bass){
  const c = o.axe, d = sh(c, .62), l = sh(c, 1.18);
  const bx = cx - 7, by = top + 20;
  // The body, a rounded double cutaway, then the neck rising to the right.
  const rows = [5, 8, 9, 10, 10, 10, 9, 7];
  rows.forEach((w, i) => {
    const x = bx + ((10 - w) >> 1);
    b.r(x, by + i, w, 1, i < 2 ? l : i > 5 ? d : c);
  });
  if (o.guard) b.r(bx + 2, by + 3, 4, 3, o.guard);
  b.r(bx + 5, by + 2, 1, 5, [30, 26, 28]);
  b.r(bx + 3, by + 6, 4, 1, [200, 200, 210]);
  const len = bass ? 18 : 14;
  b.line(bx + 8, by + 3, bx + 8 + len, by + 3 - (len >> 1) - 1, [96, 64, 40], 2);
  b.line(bx + 9, by + 2, bx + 8 + len, by + 2 - (len >> 1) - 1, [70, 44, 28], 1);
  const hx = bx + 8 + len, hy = by + 1 - (len >> 1) - 1;
  b.r(hx, hy - 1, 3, 3, bass ? d : [230, 226, 214]);
  // The strap over the shoulder.
  b.line(bx + 1, by + 1, cx - 3, top + 12, [120, 40, 36], 1);
}

const BAND = {
  keys:   { x: 236, fy: 262, look: { skin: SKINS[1], hair: HAIRS[1], style: 'shaggy', beard: false,
    glasses: true, shirt: [92, 150, 98], pants: [56, 52, 66], shoes: [60, 46, 38] } },
  guitar: { x: 294, fy: 272, look: { skin: SKINS[1], hair: HAIRS[0], style: 'short', beard: true,
    hat: 'capback', hatC: [228, 222, 206], shirt: [150, 184, 228], dye: 3, pants: [104, 82, 60],
    shoes: [72, 60, 52], axe: [238, 228, 210], guard: [250, 248, 240] } },
  bass:   { x: 350, fy: 266, look: { skin: SKINS[0], hair: HAIRS[4], style: 'long', beard: false,
    shirt: [196, 196, 204], pants: [44, 48, 62], shoes: [40, 36, 40], axe: [170, 70, 46], guard: [36, 30, 30] } },
  drums:  { x: 424, fy: 230, look: { skin: SKINS[1], hair: HAIRS[0], style: 'short', beard: true,
    hat: 'brim', hatC: [86, 72, 62], shirt: [60, 84, 112], vest: [70, 96, 128], sleeveless: true,
    pants: [48, 48, 56], shoes: [40, 36, 40] } },
};

/* The players, as frames. A frame is a whole drawn figure, so animating is
   choosing one, which costs a drawImage rather than a redraw. */
function guitarFrames(m, bass){
  const o = m.look;
  const frames = [];
  for (let f = 0; f < 4; f++){
    const bob = f === 1 ? 1 : 0;
    const strum = [[-9, 24], [-8, 27], [-9, 25], [-8, 22]][f];
    frames.push(outlined(40, 46, b => {
      const cx = 16, fy = 44 + bob;
      bodyFront(b, cx, fy, o, [[-5, 13], [-8, 18], strum], null);
      guitar(b, cx, fy - 34, o, bass);
      // The fretting hand reaches up the neck, over the body.
      const nx = bass ? 9 : 7, ny = bass ? 15 : 17;
      b.line(cx + 5, fy - 34 + 13, cx + nx - 2, fy - 34 + ny + 3, o.shirt, 2);
      b.line(cx + nx - 2, fy - 34 + ny + 3, cx + nx, fy - 34 + ny, o.skin, 2);
    }));
  }
  return frames;
}

function keysFrames(m){
  const o = m.look;
  return [0, 1, 2, 3].map(f => outlined(28, 40, b => {
    const cx = 12, fy = 38 + (f === 2 ? 1 : 0);
    const h = [[-6, 22], [-4, 23], [-5, 22], [-6, 23]][f];
    const h2 = [[6, 23], [5, 22], [7, 22], [6, 23]][f];
    bodyFront(b, cx, fy, o, [[-5, 13], [-7, 18], h], [[5, 13], [7, 18], h2]);
  }));
}

function drummerFrames(m){
  const o = m.look;
  const stick = [214, 180, 120];
  // L down R up, both mid, L up R down, both up for the crash.
  const poses = [
    [[-7, 9], [-4, 19]], [[-8, 13], [5, 15]], [[-6, 15], [7, 8]], [[-9, 6], [9, 6]],
  ];
  return poses.map(([l, r], f) => outlined(36, 40, b => {
    const cx = 17, fy = 52;
    bodyFront(b, cx, fy, o, [[-5, 13], [-8, 17], [l[0], l[1] + 9]], [[5, 13], [8, 17], [r[0], r[1] + 9]]);
    const top = fy - 34;
    b.line(cx + l[0], top + l[1] + 9, cx + l[0] + 6, top + l[1] + 6 - (f === 3 ? 4 : 0), stick, 1);
    b.line(cx + r[0], top + r[1] + 9, cx + r[0] - 6 + (f === 3 ? 10 : 0), top + r[1] + 6 - (f === 3 ? 4 : 0), stick, 1);
  }));
}

// ── the crowd ──────────────────────────────────────────────────────────────
/* Seen from behind. A variant is a person: hair, hat, shirt, height. A pose is
   what their arms are doing. Every person in the room is one variant in one
   pose, drawn at a place, so the room costs a drawImage a head. */
function crowdVariant(rand){
  const pick = a => a[(rand() * a.length) | 0];
  const style = pick(['short', 'short', 'long', 'pony', 'bun', 'curly', 'bald', 'dreads']);
  const hat = rand() < .3 ? pick(['cap', 'capback', 'bucket', 'beanie', 'brim']) : null;
  const top = pick(['tee', 'tee', 'tee', 'dye', 'dye', 'check', 'hoodie', 'stripe']);
  return {
    skin: pick(SKINS), hair: pick(HAIRS), style, hat, hatC: pick(SHIRTS),
    shirt: pick(SHIRTS), top, dye: (rand() * 5) | 0, short: (rand() * 4) | 0,
    print: rand() < .35 ? pick(SHIRTS) : null,
    sign: [pick(SHIRTS), pick(SHIRTS)],
  };
}

function crowdSprite(v, pose){
  return outlined(26, 50, b => {
    const cx = 13, fy = 49, top = fy - 34 + v.short;
    const sk = v.skin, hr = v.hair;
    // Legs and shoes, mostly hidden by the row behind but there for the gaps.
    b.r(cx - 5, top + 23, 4, 11 - v.short, [52, 56, 76]);
    b.r(cx + 1, top + 23, 4, 11 - v.short, [44, 48, 66]);
    // The back of a shirt, with the band tee print some of them wear.
    const o = { shirt: v.shirt, dye: v.top === 'dye' ? v.dye + 1 : 0, check: v.top === 'check', stripe: v.top === 'stripe' };
    shirtFill(b, cx - 5, top + 11, 10, 12, o);
    if (v.top === 'hoodie') b.r(cx - 4, top + 10, 8, 3, sh(v.shirt, .8));
    if (v.print && v.top === 'tee'){ b.r(cx - 2, top + 14, 4, 4, v.print); b.r(cx - 1, top + 15, 2, 2, sh(v.print, .6)); }
    // Neck and the back of the head.
    b.r(cx - 1, top + 9, 3, 2, sh(sk, .78));
    b.r(cx - 4, top + 1, 8, 8, sh(sk, .92));
    b.r(cx - 5, top + 4, 1, 2, sk); b.r(cx + 4, top + 4, 1, 2, sh(sk, .8));
    if (v.style !== 'bald'){
      const hl = sh(hr, 1.3);
      b.r(cx - 4, top, 8, v.style === 'short' ? 6 : 9, hr);
      b.r(cx - 3, top - 1, 6, 1, hr);
      b.r(cx - 3, top, 3, 1, hl);
      if (v.style === 'long') b.r(cx - 4, top + 8, 8, 6, hr), b.r(cx - 4, top + 13, 8, 1, sh(hr, .75));
      if (v.style === 'pony') b.r(cx - 1, top + 8, 2, 6, hr);
      if (v.style === 'bun') b.r(cx - 2, top - 3, 4, 3, hr), b.r(cx - 1, top - 3, 2, 1, hl);
      if (v.style === 'curly') b.r(cx - 5, top - 1, 10, 8, hr), b.r(cx - 4, top - 2, 8, 1, hr);
      if (v.style === 'dreads') for (let i = 0; i < 4; i++) b.r(cx - 4 + i * 2, top + 6, 1, 8, sh(hr, .9));
    }
    if (v.hat){
      const c = v.hatC;
      if (v.hat === 'brim'){ b.r(cx - 7, top + 2, 14, 2, c); b.r(cx - 4, top - 3, 8, 5, sh(c, .9)); }
      else if (v.hat === 'bucket'){ b.r(cx - 5, top + 2, 10, 2, sh(c, .85)); b.r(cx - 4, top - 2, 8, 5, c); }
      else if (v.hat === 'beanie'){ b.r(cx - 4, top - 2, 8, 5, c); b.r(cx - 4, top + 2, 8, 1, sh(c, .7)); }
      else if (v.hat === 'capback'){ b.r(cx - 4, top - 1, 8, 4, c); b.r(cx - 3, top + 3, 6, 2, sh(c, .7)); }
      else { b.r(cx - 4, top - 1, 8, 4, c); b.r(cx - 2, top + 3, 4, 1, sh(c, .6)); }
    }
    // Arms.
    const sleeve = v.top === 'hoodie' || v.top === 'check' ? v.shirt : sk;
    const arm = (pts) => {
      for (let i = 0; i < pts.length - 1; i++)
        b.line(cx + pts[i][0], top + pts[i][1], cx + pts[i + 1][0], top + pts[i + 1][1], i === 0 ? v.shirt : sleeve, 2);
      const [hx, hy] = pts[pts.length - 1];
      b.r(cx + hx - 1, top + hy - 1, 2, 2, sk);
    };
    if (pose === 'down'){ arm([[-6, 12], [-7, 18], [-7, 22]]); arm([[6, 12], [7, 18], [7, 22]]); }
    else if (pose === 'up'){ arm([[-5, 12], [-8, 4], [-9, -4]]); arm([[5, 12], [8, 4], [9, -4]]); }
    else if (pose === 'one'){ arm([[-6, 12], [-7, 18], [-7, 22]]); arm([[5, 12], [7, 3], [8, -6]]); }
    else if (pose === 'clap'){ arm([[-5, 12], [-5, 4], [-1, -4]]); arm([[5, 12], [5, 4], [1, -4]]); }
    else if (pose === 'phone'){
      arm([[-6, 12], [-7, 18], [-7, 22]]); arm([[5, 12], [6, 4], [6, -2]]);
      b.r(cx + 5, top - 6, 3, 5, [30, 30, 40]);
    } else if (pose === 'sign'){
      arm([[-5, 12], [-7, 4], [-7, -5]]); arm([[5, 12], [7, 4], [7, -5]]);
      b.r(cx - 10, top - 13, 20, 9, [244, 240, 228]);
      b.r(cx - 10, top - 5, 20, 1, [200, 196, 184]);
      b.r(cx - 8, top - 11, 9, 2, v.sign[0]); b.r(cx + 2, top - 11, 6, 2, v.sign[1]);
      b.r(cx - 7, top - 8, 13, 2, v.sign[0]);
    }
  });
}

// ── the room ───────────────────────────────────────────────────────────────
/* Where everything stands, in world pixels. The deck is the stage floor seen
   from above at an angle; its face is the black skirt below its front edge. */
const DECK = { x0: 168, x1: 472, top: 206, front: 286, face: 302 };
const WALL = { x0: 150, x1: 490, top: 30 };
const SCREEN = { x: 186, y: 62, w: 268, h: 108 };
const TRUSS_Y = 42;
const PODS = [0, 1, 2, 3, 4, 5].map(i => 236 + i * 34);
const FIXTURES = Array.from({ length: 14 }, (_, i) => 170 + i * 23);
const BARRIER = 316;
const CROWD_TOP = 338;

function buildRoom(rand){
  const c = canvas(WW, WH);
  const b = brush(c.getContext('2d'));
  // Ceiling and the dark the rig hangs in.
  b.r(0, 0, WW, WH, [16, 12, 24]);
  for (let y = 4; y < 34; y += 10) b.r(0, y, WW, 2, [26, 20, 36]);
  // Side walls, with acoustic panels.
  for (const [x0, x1] of [[0, 104], [536, WW]]){
    b.r(x0, 20, x1 - x0, 300, [30, 22, 40]);
    for (let y = 40; y < 280; y += 34){
      for (let x = x0 + 8; x < x1 - 8; x += 24){
        b.r(x, y, 18, 28, [40, 30, 52]);
        b.r(x, y, 18, 1, [56, 44, 70]);
        b.r(x + 17, y, 1, 28, [24, 18, 32]);
      }
    }
    b.r(x0, 316, x1 - x0, 4, [12, 10, 18]);
  }
  // The back wall behind the stage.
  b.r(WALL.x0, WALL.top, WALL.x1 - WALL.x0, DECK.top - WALL.top, [20, 16, 30]);
  for (let x = WALL.x0; x < WALL.x1; x += 8) b.r(x, WALL.top, 1, DECK.top - WALL.top, [26, 20, 38]);
  // The screen's frame. What is ON the screen is drawn live, it is a light.
  b.r(SCREEN.x - 4, SCREEN.y - 4, SCREEN.w + 8, SCREEN.h + 8, [10, 10, 14]);
  b.r(SCREEN.x - 4, SCREEN.y - 4, SCREEN.w + 8, 1, [50, 48, 60]);
  b.r(SCREEN.x - 4, SCREEN.y + SCREEN.h + 3, SCREEN.w + 8, 1, [6, 6, 8]);
  // PA hangs, stage left and right of the wall.
  for (const x of [112, 500]){
    for (let i = 0; i < 7; i++){
      const y = 52 + i * 15;
      b.r(x, y, 28, 13, [34, 32, 40]);
      b.r(x, y, 28, 1, [64, 62, 72]);
      b.r(x + 2, y + 3, 24, 8, [22, 20, 26]);
      for (let gx = x + 3; gx < x + 26; gx += 2) b.r(gx, y + 4, 1, 6, [30, 28, 34]);
    }
    b.line(x + 14, 30, x + 14, 52, [60, 60, 70]);
  }
  // Floor of the room, poured concrete under years of shows.
  for (let y = DECK.face; y < WH; y++){
    const k = .9 + .1 * Math.sin(y * .7);
    b.r(0, y, WW, 1, sh([40, 34, 46], k));
  }
  for (let i = 0; i < 900; i++){
    const x = rand() * WW, y = DECK.face + rand() * (WH - DECK.face);
    b.r(x, y, 1, 1, rand() < .5 ? [52, 46, 58] : [30, 26, 36]);
  }
  // Truss towers either side of the deck.
  for (const x of [148, 482]){
    b.r(x, TRUSS_Y, 10, DECK.face - TRUSS_Y, [70, 70, 80]);
    b.r(x + 2, TRUSS_Y, 6, DECK.face - TRUSS_Y, [24, 22, 30]);
    for (let y = TRUSS_Y; y < DECK.face; y += 8) b.line(x + 2, y, x + 7, y + 7, [100, 100, 112]);
  }
  // The deck: planks going away from you, then the rug, gaff tape and cable.
  for (let y = DECK.top; y < DECK.front; y++){
    const k = .82 + .18 * ((y - DECK.top) / (DECK.front - DECK.top));
    b.r(DECK.x0, y, DECK.x1 - DECK.x0, 1, sh([62, 48, 44], k));
  }
  for (let x = DECK.x0 + 6; x < DECK.x1; x += 12) b.r(x, DECK.top, 1, DECK.front - DECK.top, [44, 34, 32]);
  b.r(DECK.x0, DECK.front - 1, DECK.x1 - DECK.x0, 2, [92, 74, 64]);
  rug(b, 252, 232, 140, 50);
  for (const [x, y] of [[214, 278], [400, 272], [300, 250], [338, 212]]) b.r(x, y, 7, 2, [210, 200, 120]);
  b.line(206, 268, 290, 280, [18, 16, 22]); b.line(330, 276, 452, 252, [18, 16, 22]);
  // The skirt across the front of the deck.
  b.r(DECK.x0 - 2, DECK.front + 1, DECK.x1 - DECK.x0 + 4, DECK.face - DECK.front - 1, [14, 12, 18]);
  for (let x = DECK.x0; x < DECK.x1; x += 5) b.r(x, DECK.front + 2, 2, DECK.face - DECK.front - 2, [22, 18, 28]);
  // Amps and the backline against the wall.
  amp(b, 266, 176); amp(b, 286, 176, true); amp(b, 362, 180);
  b.r(374, 190, 24, 16, [36, 32, 40]); b.r(376, 192, 20, 12, [28, 26, 30]);
  // The drum riser.
  b.r(384, 214, 82, 22, [54, 46, 60]);
  b.r(384, 214, 82, 2, [88, 78, 96]);
  b.r(384, 236, 82, 9, [20, 18, 26]);
  rug(b, 396, 220, 58, 14, true);
  // The barricade between the pit and the floor.
  b.r(110, BARRIER - 8, WW - 220, 3, [130, 132, 140]);
  for (let x = 112; x < WW - 110; x += 6) b.r(x, BARRIER - 5, 1, 12, [90, 92, 100]);
  b.r(110, BARRIER + 6, WW - 220, 2, [60, 62, 70]);
  return c;
}

function rug(b, x, y, w, h, small){
  const base = [150, 46, 38], dark = [96, 28, 26], gold = [214, 150, 70], blue = [44, 60, 120];
  b.r(x, y, w, h, base);
  b.r(x, y, w, 2, dark); b.r(x, y + h - 2, w, 2, dark);
  b.r(x, y, 2, h, dark); b.r(x + w - 2, y, 2, h, dark);
  for (let yy = 3; yy < h - 3; yy++){
    for (let xx = 3; xx < w - 3; xx++){
      const cx = Math.abs(xx - w / 2), cy = Math.abs(yy - h / 2) * (w / h) * .5;
      const d = cx + cy;
      if (((d | 0) % 9) === 0) b.r(x + xx, y + yy, 1, 1, gold);
      else if (!small && ((d | 0) % 9) === 4) b.r(x + xx, y + yy, 1, 1, blue);
      else if (((xx + yy) % 6) === 0) b.r(x + xx, y + yy, 1, 1, sh(base, .8));
    }
  }
  for (let xx = 0; xx < w; xx += 2){ b.r(x + xx, y - 1, 1, 1, [230, 220, 200]); b.r(x + xx, y + h, 1, 1, [230, 220, 200]); }
}

function amp(b, x, y, head){
  b.r(x, y, 18, 28, [32, 28, 30]);
  b.r(x, y, 18, 1, [70, 64, 66]);
  b.r(x + 2, y + (head ? 8 : 3), 14, head ? 18 : 22, [56, 50, 46]);
  for (let gy = y + (head ? 9 : 4); gy < y + 26; gy += 2) b.r(x + 2, gy, 14, 1, [44, 40, 38]);
  if (head){ b.r(x, y - 7, 18, 7, [40, 36, 40]); for (let k = 0; k < 4; k++) b.r(x + 3 + k * 4, y - 4, 2, 2, [200, 196, 180]); }
}

/* Gear that stands IN FRONT of a player, so it is drawn after the band. */
function buildFront(){
  const c = canvas(WW, WH);
  const b = brush(c.getContext('2d'));
  // The keys rig: two boards on an X stand, a third angled at the side.
  const kx = 218, ky = 256;
  keyboard(b, kx, ky - 10, 36, [180, 44, 40]);
  keyboard(b, kx + 2, ky - 2, 34, [36, 34, 40]);
  b.line(kx + 6, ky + 4, kx + 30, ky + 14, [70, 70, 80], 2); b.line(kx + 30, ky + 4, kx + 6, ky + 14, [70, 70, 80], 2);
  keyboard(b, kx - 14, ky + 2, 14, [60, 58, 66]);
  // Mic stands in front of the two strings, and wedges at the lip.
  for (const [x, top] of [[300, 236], [356, 230], [244, 238]]){
    b.line(x, top, x, top + 34, [150, 150, 160]);
    b.line(x - 4, top + 34, x + 4, top + 34, [150, 150, 160]);
    b.r(x - 1, top - 2, 3, 3, [50, 50, 56]);
  }
  for (const x of [282, 340, 228]){
    b.r(x, 278, 20, 7, [26, 24, 30]);
    b.r(x, 278, 20, 2, [52, 50, 58]);
    b.r(x + 3, 281, 14, 3, [18, 16, 20]);
  }
  // Pedalboards at the guitarists' feet.
  for (const x of [284, 342]){
    b.r(x, 272, 22, 5, [24, 22, 26]);
    for (let k = 0; k < 4; k++) b.r(x + 2 + k * 5, 273, 3, 3, [[220, 70, 70], [70, 200, 120], [240, 240, 240], [80, 120, 230]][k]);
  }
  kit(b);
  return c;
}

function keyboard(b, x, y, w, body){
  b.r(x, y, w, 6, body);
  b.r(x, y, w, 1, sh(body, 1.35));
  b.r(x + 2, y + 2, w - 4, 3, [236, 234, 228]);
  for (let k = x + 3; k < x + w - 3; k += 2) if ((k - x) % 7 !== 0) b.r(k, y + 2, 1, 2, [24, 22, 26]);
  b.r(x, y + 6, w, 1, sh(body, .5));
}

function kit(b){
  const yel = [244, 204, 40], yelD = [188, 146, 18], yelL = [255, 236, 120];
  const head = [232, 228, 214], hoop = [190, 190, 200];
  const drum = (x, y, w, h, deep) => {
    b.r(x, y + 2, w, deep, yel);
    b.r(x, y + 2, 1, deep, yelL);
    b.r(x + w - 2, y + 2, 2, deep, yelD);
    b.r(x, y + 2 + deep - 1, w, 1, hoop);
    b.r(x, y, w, h, head);
    b.r(x, y, w, 1, hoop); b.r(x, y + h - 1, w, 1, hoop);
  };
  const cymbal = (x, y, w) => {
    b.line(x + (w >> 1), y + 2, x + (w >> 1), 250, [120, 120, 130]);
    b.r(x, y, w, 2, [214, 172, 92]);
    b.r(x + 2, y, w - 4, 1, [250, 220, 140]);
    b.r(x + (w >> 1) - 1, y - 1, 2, 1, [180, 140, 70]);
  };
  cymbal(398, 202, 16); cymbal(440, 198, 18); cymbal(388, 218, 12); cymbal(452, 214, 14);
  drum(408, 222, 10, 4, 5); drum(426, 222, 10, 4, 5);
  drum(442, 232, 13, 5, 10);
  drum(398, 234, 11, 4, 4);
  // The kick, facing you, with a painted head of no one's art in particular.
  const cx = 424, cy = 246, r = 11;
  for (let yy = -r; yy <= r; yy++){
    for (let xx = -r; xx <= r; xx++){
      const d2 = xx * xx + yy * yy;
      if (d2 > r * r) continue;
      let c;
      if (d2 > (r - 2) * (r - 2)) c = yy < 0 ? yelL : yel;
      else {
        const a = Math.atan2(yy, xx) + Math.sqrt(d2) * .45;
        c = [[236, 84, 64], [64, 104, 220], [92, 200, 216], [248, 236, 210]][((a / 1.1 | 0) % 4 + 4) % 4];
      }
      b.r(cx + xx, cy + yy, 1, 1, c);
    }
  }
  b.r(cx - r, cy + r - 1, 2 * r, 2, yelD);
}

// ── the stage ──────────────────────────────────────────────────────────────
export function createStage(view, opts = {}){
  const venue = VENUES[opts.venue] || VENUES.theater;
  const reduce = !!opts.reduce;
  const rand = mulberry32((opts.seed | 0) || 7);

  const room = buildRoom(rand);
  const front = buildFront();
  const frames = {
    keys: keysFrames(BAND.keys),
    guitar: guitarFrames(BAND.guitar, false),
    bass: guitarFrames(BAND.bass, true),
    drums: drummerFrames(BAND.drums),
  };

  /* The crowd: thirty people, drawn as several hundred. Laid out once off the
     night's seed so a replay draws the same room, sorted back to front so the
     row nearer you covers the row behind. `t` is how full the room has to be
     before a person turns up, so a bad night empties the back first. */
  const variants = Array.from({ length: 30 }, () => crowdVariant(rand));
  const spriteCache = new Map();
  const spriteOf = (vi, pose) => {
    const key = vi + ':' + pose;
    let s = spriteCache.get(key);
    if (!s){ s = crowdSprite(variants[vi], pose); spriteCache.set(key, s); }
    return s;
  };
  const crowd = [];
  for (let y = CROWD_TOP; y < WH + 40; y += 8){
    const depth = (y - CROWD_TOP) / (WH - CROWD_TOP);
    // The floor is wall to wall, and so is the crowd: only the pit in front
    // of the barricade is narrower than the room.
    const x0 = depth < .05 ? 112 : 14, x1 = depth < .05 ? WW - 112 : WW - 14;
    for (let x = x0; x < x1; x += 9 + rand() * 4){
      crowd.push({
        x: x + (rand() - .5) * 4, y: y + (rand() - .5) * 3,
        v: (rand() * variants.length) | 0,
        t: Math.min(1, depth * .55 + rand() * .5),
        phase: rand() * Math.PI * 2,
        jumpy: .4 + rand() * .6,
        phone: rand() < .5, sign: rand() < .035,
        drift: (rand() - .5) * 2, pose: 'down', until: 0,
      });
    }
  }
  crowd.sort((a, b) => a.y - b.y);

  // The screen is a light, drawn per frame into a grid of LED cells.
  const LED = { w: SCREEN.w / 4 | 0, h: SCREEN.h / 4 | 0 };
  const led = canvas(LED.w, LED.h);
  const ledG = led.getContext('2d');
  const ledImg = ledG.createImageData(LED.w, LED.h);

  const out = view.getContext('2d');
  let buf = canvas(4, 4), g = buf.getContext('2d');
  let k = 1, visW = 4, visH = 4, camX = 0, camY = 0;

  const st = {
    pal: PALETTES.house, palFrom: PALETTES.house, palT: 1,
    light: 0, lightWant: 0,
    house: 1, houseWant: 1,
    energy: .2, energyWant: .2,
    density: .78, densityWant: .78,
    band: false, encore: false, bow: false,
    signsUntil: 0, flashUntil: 0, jumpUntil: 0, segueUntil: 0,
    mode: 0, rot: 0,
  };
  let raf = 0, dead = false, last = 0, now = performance.now();

  function fit(){
    const dpr = window.devicePixelRatio || 1;
    const box = view.parentElement || document.body;
    const cw = box.clientWidth || window.innerWidth, ch = box.clientHeight || window.innerHeight;
    const devW = Math.round(cw * dpr), devH = Math.round(ch * dpr);
    /* About a pixel and a half of screen to a cell, so a phone shows a slice
       of the room near 290 pixels across with real detail in it. Never so small
       a scale that the screen would see past the edge of the world. */
    k = Math.max(1, Math.round(1.4 * dpr), Math.ceil(devW / WW), Math.ceil(devH / WH));
    visW = Math.ceil(devW / k); visH = Math.ceil(devH / k);
    view.width = visW * k; view.height = visH * k;
    view.style.width = (visW * k / dpr) + 'px';
    view.style.height = (visH * k / dpr) + 'px';
    buf = canvas(visW, visH); g = buf.getContext('2d');
    // The band at the centre and the rig over it in the frame.
    camX = Math.round(Math.min(Math.max(0, 326 - visW / 2), WW - visW));
    camY = Math.round(Math.min(Math.max(0, Math.min(240 - visH * .4, 34)), WH - visH));
    draw();
  }

  function palette(){
    const t = clamp01(st.palT);
    return [mix(st.palFrom[0], st.pal[0], t), mix(st.palFrom[1], st.pal[1], t)];
  }

  // ── drawing, per frame ───────────────────────────────────────────────────
  function screen(p, t){
    const d = ledImg.data, e = st.energy, L = st.light;
    const mode = st.mode % 4;
    for (let y = 0; y < LED.h; y++){
      for (let x = 0; x < LED.w; x++){
        const u = x / LED.w - .5, v = y / LED.h - .5;
        let s;
        if (mode === 0) s = .5 + .5 * Math.sin(Math.hypot(u * 2.5, v) * 18 - t * (2 + e * 4));
        else if (mode === 1){
          const bar = Math.abs(Math.sin((x >> 2) * 1.7 + t * (1 + e * 3)));
          s = (1 - (y / LED.h)) < bar ? 1 : .08;
        } else if (mode === 2) s = .5 + .5 * Math.sin(u * 9 + t * 1.3) * Math.cos(v * 7 - t * 1.1 + Math.sin(u * 4 + t));
        else s = ((x * 7 + y * 13 + ((t * 6) | 0)) % 23 === 0) ? 1 : .05 + .05 * Math.sin(u * 3 + t);
        const c = mix(p[0], p[1], .5 + .5 * Math.sin(u * 3 + t * .5));
        const lit = (.06 + .94 * s) * (.12 + .88 * L) * (1 - st.house * .7);
        const i = (y * LED.w + x) * 4;
        d[i] = c[0] * lit; d[i + 1] = c[1] * lit; d[i + 2] = c[2] * lit; d[i + 3] = 255;
      }
    }
    ledG.putImageData(ledImg, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(led, SCREEN.x, SCREEN.y, LED.w * 4, LED.h * 4);
    // The gaps between LED tiles.
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let x = SCREEN.x; x < SCREEN.x + SCREEN.w; x += 4) g.fillRect(x, SCREEN.y, 1, SCREEN.h);
    for (let y = SCREEN.y; y < SCREEN.y + SCREEN.h; y += 4) g.fillRect(SCREEN.x, y, SCREEN.w, 1);
  }

  function rig(p, t, b){
    // The truss, a box of tubes with its lattice.
    b.r(140, TRUSS_Y, 360, 9, [74, 74, 86]);
    b.r(140, TRUSS_Y + 2, 360, 5, [26, 24, 34]);
    for (let x = 140; x < 500; x += 6) b.line(x, TRUSS_Y + 2, x + 5, TRUSS_Y + 6, [110, 110, 124]);
    b.r(140, TRUSS_Y, 360, 1, [140, 140, 156]);
    // The pods, hung in front of the screen, chasing.
    PODS.forEach((x, c) => {
      b.line(x + 3, TRUSS_Y + 9, x + 3, TRUSS_Y + 12, [90, 90, 100]);
      b.r(x, TRUSS_Y + 12, 7, 88, [28, 26, 36]);
      b.r(x, TRUSS_Y + 12, 1, 88, [60, 58, 70]);
      for (let r = 0; r < 6; r++){
        const v = .5 + .5 * Math.sin(t * (2 + st.energy * 5) + c * .9 + r * .7);
        const on = st.light * (.2 + .8 * v);
        const y = TRUSS_Y + 15 + r * 14;
        b.r(x + 1, y, 5, 5, [16, 14, 20]);
        b.r(x + 2, y + 1, 3, 3, mix([46, 42, 56], p[(c + r) % 2], on));
        if (on > .6) b.r(x + 3, y + 2, 1, 1, [255, 255, 255], (on - .6) * 2.5);
      }
    });
    // The movers on the truss.
    FIXTURES.forEach((x, i) => {
      b.r(x - 3, TRUSS_Y + 9, 7, 3, [40, 38, 48]);
      b.r(x - 2, TRUSS_Y + 12, 5, 4, [24, 22, 30]);
      b.r(x - 1, TRUSS_Y + 13, 3, 2, p[i % 2], .3 + .7 * st.light);
    });
  }

  /* One cone of light from a lens to a pool on the floor. In 3/4 a light
     pointed down lands lower on the screen, so a beam is a tall triangle and
     its pool an ellipse squashed by the angle. Drawn with 'lighter': where two
     cross, the haze gets brighter, as in every photo in the reference set. */
  function cone(x0, y0, x1, y1, r, c, a){
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, rgb(c, Math.min(1, a * 1.4)));
    grad.addColorStop(1, rgb(c, a * .35));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x0 - 1, y0); g.lineTo(x0 + 1, y0);
    g.lineTo(x1 + r, y1); g.lineTo(x1 - r, y1);
    g.closePath(); g.fill();
  }
  function pool(x, y, r, c, a){
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgb(c, Math.min(1, a))); grad.addColorStop(1, rgb(c, 0));
    g.save(); g.translate(x, y); g.scale(1, .42); g.translate(-x, -y);
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  const players = [
    ['keys', BAND.keys], ['guitar', BAND.guitar], ['bass', BAND.bass], ['drums', BAND.drums],
  ];

  function drawBand(t){
    if (!st.band) return;
    const beat = t * (1.6 + st.energy * 1.4);
    players.forEach(([role, m], i) => {
      const fr = frames[role];
      let f = ((beat * 2 + i * .7) | 0) % fr.length;
      if (st.energy < .3 && role !== 'drums') f = (beat | 0) % 2 ? 0 : 2;
      if (st.bow) f = role === 'drums' ? 3 : 1;
      const s = fr[f];
      const sway = role === 'guitar' || role === 'bass'
        ? Math.round(Math.sin(t * .9 + i) * (st.energy > .6 ? 2 : 1)) : 0;
      // Anchor is the feet: bottom centre of the sprite, less its outline.
      const ax = role === 'drums' ? 18 : role === 'keys' ? 13 : 17;
      const ay = role === 'drums' ? 41 : role === 'keys' ? 39 : 45;
      g.drawImage(s, m.x - ax + sway, m.fy - ay);
    });
  }

  function drawCrowd(t){
    const e = st.energy, lit = st.house > .5;
    const jumping = now < st.jumpUntil;
    const signs = now < st.signsUntil;
    const yMax = camY + visH + 50, yMin = camY - 10;
    const xMin = camX - 20, xMax = camX + visW + 20;
    for (const c of crowd){
      if (c.y < yMin || c.y > yMax || c.x < xMin || c.x > xMax) continue;
      if (c.t > st.density * venue.capacity) continue;
      // A pose is held for a while, then reconsidered, so the room never moves
      // in lockstep. What they reach for depends on how the night is going.
      if (now > c.until){
        const r = Math.random();
        let pose = 'down';
        if (st.band && !lit){
          if (signs && c.sign) pose = 'sign';
          else if (st.encore && c.phone && r < .55) pose = 'phone';
          else if (st.bow || jumping) pose = r < .7 ? 'up' : 'clap';
          else if (r < e * .55) pose = r < e * .3 ? 'up' : r < e * .42 ? 'one' : 'clap';
        }
        c.pose = pose;
        c.until = now + 500 + Math.random() * 1600;
      }
      const hop = st.band && !lit && (jumping || e > .7)
        ? Math.round(Math.max(0, Math.sin(t * (5 + e * 3) + c.phase)) * 3 * c.jumpy) : 0;
      const sway = st.band && !lit ? Math.round(Math.sin(t * 1.4 + c.phase)) : 0;
      const wander = lit ? Math.round(Math.sin(t * .35 + c.phase) * 4 * c.drift) : 0;
      c.dx = sway + wander; c.hop = hop;
      g.drawImage(spriteOf(c.v, c.pose), Math.round(c.x + c.dx - 14), Math.round(c.y - 50 - hop));
    }
  }

  function rims(p){
    // The stage light on the tops of heads, in the rig's colour.
    if (st.light < .05 || st.house > .5) return;
    const a = .7 * st.light;
    for (const c of crowd){
      if (c.t > st.density * venue.capacity) continue;
      if (c.y > CROWD_TOP + 200) break;
      if (c.y < camY - 10) continue;
      const fade = 1 - (c.y - CROWD_TOP) / 220;
      g.fillStyle = rgb(p[(c.x / 40 | 0) % 2], a * fade);
      const top = c.y - 50 + 1 + 15 + variants[c.v].short - (c.hop || 0);
      g.fillRect(c.x + (c.dx || 0) - 4, top - 1, 8, 1);
      g.fillStyle = rgb(p[(c.x / 40 | 0) % 2], a * fade * .4);
      g.fillRect(c.x + (c.dx || 0) - 5, top + 10, 10, 1);
    }
  }

  function phones(t){
    if (!st.encore || st.house > .5) return;
    for (const c of crowd){
      if (c.pose !== 'phone' || c.t > st.density) continue;
      if (c.y < camY - 10 || c.y > camY + visH + 50) continue;
      const v = variants[c.v];
      const x = c.x + (c.dx || 0) - 14 + 1 + 13 + 5;
      const y = c.y - 50 - (c.hop || 0) + 1 + 15 + v.short - 6;
      const fl = .75 + .25 * Math.sin(t * 4 + c.phase);
      g.fillStyle = rgb([220, 236, 255], fl); g.fillRect(x + 1, y + 1, 1, 3);
      pool(x + 1, y + 2, 9, [190, 215, 255], .35 * fl);
    }
  }

  function draw(){
    const t = now / 1000;
    const p = palette();
    const L = st.light, H = st.house, e = st.energy;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = false;
    g.drawImage(room, camX, camY, visW, visH, 0, 0, visW, visH);
    g.translate(-camX, -camY);
    const b = brush(g);

    // The room in its light: dark for the show, warm when the house is up.
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rgb(mix([66, 56, 96], [236, 228, 218], H));
    g.fillRect(0, 0, WW, DECK.face);
    g.globalCompositeOperation = 'source-over';

    screen(p, t);
    rig(p, t, b);

    // Light pools on the deck: a wash, then one on each player.
    g.globalCompositeOperation = 'lighter';
    pool(320, 250, 170, p[0], (.10 + .25 * L) * (1 - H) * .6);
    if (st.band){
      for (const [, m] of players) pool(m.x, m.fy - 2, 26 + e * 8, mix([255, 240, 230], p[1], .35), (.2 + .3 * L) * (1 - H * .6));
    }
    g.globalCompositeOperation = 'source-over';
    // Shadows under the players, then the players, then what stands in front.
    if (st.band){
      g.fillStyle = 'rgba(8,4,14,.45)';
      for (const [, m] of players){ g.beginPath(); g.ellipse(m.x, m.fy, 9, 3, 0, 0, Math.PI * 2); g.fill(); }
    }
    drawBand(t);
    g.drawImage(front, camX, camY, visW, visH, camX, camY, visW, visH);
    // The stage is lit by the rig, so it takes the rig's colour a little.
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rgb(mix([255, 255, 255], mix(p[0], [255, 255, 255], .55), L * (1 - H)));
    g.fillRect(DECK.x0 - 20, 150, DECK.x1 - DECK.x0 + 40, DECK.face - 150);

    // Beams from the truss. A sweep in every song, a fan when it is big.
    g.globalCompositeOperation = 'lighter';
    if (L > .03 && H < .9){
      const sp = .4 + e * 1.4, amp = 50 + e * 90;
      const a = (.05 + e * .09) * L * (1 - H);
      FIXTURES.forEach((fx, i) => {
        const tx = fx + Math.sin(t * sp + i * .8) * amp * (i % 2 ? 1 : -1) * .6;
        const deep = e > .6 && i % 3 === 0;
        const ty = deep ? CROWD_TOP + 40 + Math.sin(t * sp * .7 + i) * 60 : DECK.top + 20 + (i * 13) % 60;
        cone(fx, TRUSS_Y + 15, tx, ty, 12 + e * 10, p[i % 2], a);
        pool(tx, ty, 22 + e * 10, p[i % 2], a * 2.2);
      });
      // Up from the lip of the deck, fanning into the dark, when it is earned.
      if (e > .45){
        const ua = a * (e - .3) * 1.8;
        for (let i = 0; i < 8; i++){
          const fx = DECK.x0 + 14 + i * 40;
          const ang = Math.sin(t * sp * .8 + i * 1.3) * .5 + (i - 3.5) * .09;
          cone(fx, DECK.front, fx + Math.sin(ang) * 260, DECK.front - Math.cos(ang) * 300, 16, p[(i + 1) % 2], ua);
        }
      }
      // A segue: one white sweep across the whole rig while the colour turns.
      if (now < st.segueUntil){
        const f = 1 - (st.segueUntil - now) / 1500;
        cone(320, TRUSS_Y + 10, 120 + f * 400, DECK.front, 30, [255, 255, 255], .2 * Math.sin(f * Math.PI) * L);
      }
    }
    g.globalCompositeOperation = 'source-over';

    // The crowd, back to front, then the dark they stand in.
    drawCrowd(t);
    g.globalCompositeOperation = 'multiply';
    const near = mix([150, 128, 180], [236, 228, 218], H);
    const far = mix([44, 38, 66], [214, 206, 198], H);
    const grad = g.createLinearGradient(0, DECK.face, 0, WH);
    grad.addColorStop(0, rgb(mix(near, sh(p[0], .9), .25 * L * (1 - H))));
    grad.addColorStop(1, rgb(far));
    g.fillStyle = grad; g.fillRect(0, DECK.face - 40, WW, WH - DECK.face + 40);
    g.globalCompositeOperation = 'lighter';
    rims(p);
    // Where a deep beam lands on the floor, it lights the people standing there.
    if (L > .03 && e > .6 && H < .5){
      const sp = .4 + e * 1.4, amp = 50 + e * 90, a = (.05 + e * .09) * L;
      FIXTURES.forEach((fx, i) => {
        if (i % 3) return;
        const tx = fx + Math.sin(t * sp + i * .8) * amp * (i % 2 ? 1 : -1) * .6;
        const ty = CROWD_TOP + 40 + Math.sin(t * sp * .7 + i) * 60;
        pool(tx, ty - 10, 34, p[i % 2], a * 3);
      });
    }
    phones(t);
    // Haze over the stage, drifting.
    for (let i = 0; i < 3; i++){
      pool(240 + i * 80 + Math.sin(t * .2 + i) * 30, 190 + i * 10, 120, p[i % 2], .05 * L * (.4 + e) * (1 - H));
    }
    g.globalCompositeOperation = 'source-over';
    if (now < st.flashUntil){
      g.fillStyle = rgb([255, 255, 255], .45 * (st.flashUntil - now) / 260);
      g.fillRect(camX, camY, visW, visH);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    out.imageSmoothingEnabled = false;
    out.drawImage(buf, 0, 0, visW * k, visH * k);
  }

  function ease(dt){
    const f = 1 - Math.pow(.03, dt);
    st.light += (st.lightWant - st.light) * f;
    st.house += (st.houseWant - st.house) * f;
    st.energy += (st.energyWant - st.energy) * f;
    st.density += (st.densityWant - st.density) * f * .5;
    if (st.palT < 1) st.palT = Math.min(1, st.palT + dt / 1.2);
  }

  function frame(ts){
    if (dead) return;
    if (!view.isConnected){ destroy(); return; }
    raf = requestAnimationFrame(frame);
    // Thirty frames a second. The figures move on the beat, not per frame,
    // and the other thirty would cost a phone's battery for nothing.
    if (ts - last < 32) return;
    const dt = Math.min(.1, (ts - (last || ts)) / 1000);
    last = ts; now = ts;
    ease(dt);
    draw();
  }

  function setPalette(name){
    const next = PALETTES[name] || PALETTES.jam;
    if (next === st.pal) return;
    st.palFrom = palette(); st.pal = next; st.palT = 0;
  }

  const DENSITY = { hot: 1, warm: .78, cold: .5 };

  /* The whole interface. The page hands over what happened; the stage decides
     only how it looks. See renderShow() for the mapping from a beat. */
  function cue(ev){
    const ts = performance.now();
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
      if (ev.bustout){ st.signsUntil = ts + 3400; st.jumpUntil = ts + 2000; st.flashUntil = ts + 260; }
      if (ev.grade) st.densityWant = DENSITY[ev.grade] || .78;
    } else if (ev.kind === 'time'){
      if (!ev.last){ st.band = false; st.houseWant = .85; st.lightWant = 0; st.energyWant = .15; }
    } else if (ev.kind === 'final'){
      st.band = true; st.bow = true;
      st.houseWant = 0; st.lightWant = 1; st.energyWant = ev.grade === 'cold' ? .4 : 1;
      st.densityWant = DENSITY[ev.grade] || .78;
      st.flashUntil = ts + 260;
      if (ev.grade !== 'cold') st.jumpUntil = ts + 3000;
    }
    for (const c of crowd) c.until = 0;
    if (reduce || ev.instant){
      st.light = st.lightWant; st.house = st.houseWant; st.energy = st.energyWant;
      st.density = st.densityWant; st.palT = 1; st.flashUntil = 0;
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
