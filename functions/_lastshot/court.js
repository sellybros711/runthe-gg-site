/* THE LIVE COURT. Plays back the sim's frames on a top-down pixel half court
 * in Run The Floor's house style: hardwood in a five step ramp (cool
 * shadows, warm lights, light from the upper left), cream lines, an orange
 * rim. The floor is painted once at low resolution (PX pixels per foot) and
 * scaled up with smoothing off, so every pixel is crisp.
 *
 * THE PLAYERS ARE RUN THE FLOOR'S OWN RIG (hoops/baller.js, window.RTF_BALLER,
 * API_VERSION 2), loaded by a classic script tag in web/play.html: 3D bodies
 * traced to a 44 by 64 grid, seen from the 3/4 camera. Tracing is slow
 * (about 25 ms a frame), so warm() traces a fixed set of frames in the rig's
 * own worker while the coach is still drawing: per team, a handful of poses
 * at five yaws (front, three quarter, side, back three quarter, back), and the
 * other three yaws are those drawn mirrored. Nothing is ever traced per frame.
 * The jersey number is left off the trace (one set per team, not per man),
 * so ours carry a number tag over the head: the result screen names O1 to O5.
 *
 * If the rig is missing, is another API_VERSION, or a frame is not traced
 * yet, that body is drawn as the pixel disc token it always was.
 *
 * Nothing here decides anything; it only draws a frame. */
import { fitView, sizeCanvas, courtLines } from './view.js';
import { COURT } from './court-geo.js';
import { IDS } from './playbook.js';

const PX = 4;   // pixels per foot on the low resolution floor
export const HOME = { c1: '#1f4e79', c2: '#ffd23f' };
export const AWAY = { c1: '#E0533D', c2: '#f4efe4' };

/* hoops/baller.js ramp(): dark cool, dark, base, light, light warm. Copied
   (not imported) so Last Shot never depends on a hoops file loading. */
export function ramp(hex) {
  const c = hexRgb(hex), cool = hexRgb('#2a2a68'), warm = hexRgb('#fff7dc');
  const mix = (a, b, t) => rgbHex(a.map((v, i) => Math.round(v + (b[i] - v) * t)));
  const dark = c.map(v => v * 0.72);
  return [mix(dark, cool, 0.35), rgbHex(dark.map(Math.round)), hex, mix(c, warm, 0.22), mix(c, warm, 0.45)];
}
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = a => '#' + a.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

/* ---------- the rig ---------- */
const RIG_VERSION = 2;
function rig() {
  const B = typeof window !== 'undefined' ? window.RTF_BALLER : null;
  return B && B.API_VERSION === RIG_VERSION && typeof B.paintAsync === 'function' && typeof B.gridCanvas === 'function' ? B : null;
}

/* Arm angles for the frames the rig has no name for, in its own fr format
   (hoops/baller.js frOf): shoulder and elbow per arm, a knee dip, a foot lift. */
const arms = (r, l, more) => Object.assign({ a: { '1': r, '-1': l } }, more || {});
const STANCE = [70, 90];
const FR = {
  set: arms([28, 96, 1, 0.55], [28, 96, 1, 0.55], { dip: 2 }),          // screen: braced, arms in
  ready: arms([62, 78, 1, 0.8], [62, 78, 1, 0.8], { dip: 1 }),          // hands up for the ball
  pass: arms([84, 88], [84, 88]),                                       // arms out after the throw
  hold: arms([36, 100, 1, 0.62], [36, 100, 1, 0.62], { dip: 1 }),       // the catch, ball at the chest
  stance: arms(STANCE, STANCE, { dip: 3 }),
  slideA: arms(STANCE, STANCE, { dip: 3, lift: { '1': 2 } }),
  slideB: arms(STANCE, STANCE, { dip: 3, lift: { '-1': 2 } }),
  contest: arms([156, 178], [62, 80, 1, 0.7], { lift: { '1': 1, '-1': 1 } }),
  stuck: arms([30, 64], [30, 64], { dip: 2 })                            // bumped on the screen
};
/* What each team needs traced, most needed first. */
const NEEDS = {
  home: ['stand', 'walk0', 'walk2', 'dribble0', 'dribble2', 'walk1', 'walk3', 'dribble1', 'dribble3', 'shot2', 'shot3', 'shot1', 'set', 'ready', 'hold', 'pass'],
  away: ['stance', 'slideA', 'slideB', 'walk0', 'walk2', 'walk1', 'walk3', 'contest', 'stuck']
};
const YAWS = [0, 45, 90, 135, 180];
/* Two invented men, one per team, from the rig's own look generator. */
const LOOK_SEED = { home: 11, away: 29 };
const SPR = { home: {}, away: {} };
let warmed = false, traced = 0;

/* Trace every frame the court needs, in the background, one at a time
   through the rig's queue. Safe to call more than once. */
export function warm() {
  const B = rig();
  if (!B || warmed) return;
  warmed = true;
  const jobs = [];
  const add = (team, pose) => YAWS.forEach((yaw, yi) => jobs.push({ team, pose, yaw, yi }));
  // stand first for both, so a quick Run It already has bodies
  add('home', NEEDS.home[0]); add('away', NEEDS.away[0]);
  for (let i = 1; i < Math.max(NEEDS.home.length, NEEDS.away.length); i++) {
    if (NEEDS.home[i]) add('home', NEEDS.home[i]);
    if (NEEDS.away[i]) add('away', NEEDS.away[i]);
  }
  const look = { home: B.lookFor(LOOK_SEED.home), away: B.lookFor(LOOK_SEED.away) };
  for (const j of jobs) {
    const kit = j.team === 'home' ? HOME : AWAY;
    const o = { c1: kit.c1, c2: kit.c2, num: '', yaw: j.yaw, res: 1 };
    if (FR[j.pose]) o.fr = FR[j.pose]; else o.pose = j.pose;
    try {
      B.paintAsync(look[j.team], o, img => {
        if (!img) return;
        const cv = B.gridCanvas(img);
        (SPR[j.team][j.pose] || (SPR[j.team][j.pose] = []))[j.yi] = cv;
        traced++;
      });
    } catch (e) { /* a rig that throws leaves the discs in place */ }
  }
}
export const spritesReady = () => traced;

/* Facing (degrees, court frame: 0 is +x, 90 is toward half court) to the
   rig's yaw. Yaw 0 faces the camera (down the screen), 90 faces left, 180
   faces the rim. Returns the traced yaw index and whether to mirror it. */
function yawOf(deg) {
  const a = deg * Math.PI / 180, fx = Math.cos(a), fy = Math.sin(a);
  const yaw = Math.atan2(-fx, fy) * 180 / Math.PI;
  const i8 = ((Math.round(yaw / 45) % 8) + 8) % 8;
  return i8 <= 4 ? { yi: i8, flip: false } : { yi: 8 - i8, flip: true };
}

/* ---------- the floor ---------- */
let FLOOR = null;
function floor() {
  if (FLOOR) return FLOOR;
  const W = COURT.W * PX, H = COURT.H * PX;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const wood = ramp('#c48a52');
  // boards run across the floor, a seam every 3 pixels, joints staggered
  for (let y = 0; y < H; y++) {
    const band = Math.floor(y / 3);
    g.fillStyle = wood[1 + ((band * 7) % 3)];
    g.fillRect(0, y, W, 1);
    if (y % 3 === 2) { g.fillStyle = wood[0]; g.globalAlpha = 0.35; g.fillRect(0, y, W, 1); g.globalAlpha = 1; }
    const j = ((band * 37) % 23) * 4;
    for (let x = j; x < W; x += 92) { g.fillStyle = wood[0]; g.fillRect(x, y, 1, 1); }
  }
  // the lane, painted
  const lane = ramp('#9a4a24');
  g.fillStyle = lane[2]; g.globalAlpha = 0.55;
  g.fillRect((COURT.RIM.x - COURT.LANE / 2) * PX, 0, COURT.LANE * PX, COURT.FT * PX);
  g.globalAlpha = 1;
  // lines, one pixel at a time so nothing is anti aliased
  g.fillStyle = '#f2ead6';
  for (const line of courtLines()) for (let i = 1; i < line.length; i++) pixLine(g, line[i - 1].x * PX, line[i - 1].y * PX, line[i].x * PX, line[i].y * PX);
  // backboard (the rim is drawn live, over the players' shadows)
  g.fillStyle = '#eef2f6'; g.fillRect((COURT.RIM.x - 3) * PX, 4 * PX - 1, 6 * PX, 2);
  FLOOR = cv;
  return cv;
}

function pixLine(g, x0, y0, x1, y1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1); }
}

/* A top-down pixel player: a shaded disc in the ramp, a trim pip, a number.
   The fallback when the rig is not there. */
const TOKENS = new Map();
function token(c1, c2, label, size) {
  const key = c1 + c2 + label + size;
  if (TOKENS.has(key)) return TOKENS.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), R = ramp(c1), h = size / 2, r = h - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - h, dy = y + 0.5 - h, d = Math.hypot(dx, dy);
    if (d > r) continue;
    const lit = (-dx - dy) / (r * 1.4);
    g.fillStyle = d > r - 1 ? R[0] : lit > 0.45 ? R[4] : lit > 0.1 ? R[3] : lit > -0.35 ? R[2] : R[1];
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = c2; g.font = '700 ' + Math.round(size * 0.5) + 'px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, h, h + 1);
  TOKENS.set(key, cv);
  return cv;
}

/* A number tag in the home kit, drawn once per size. */
const TAGS = new Map();
function tag(label, px, hot) {
  const key = label + px + (hot ? '*' : '');
  if (TAGS.has(key)) return TAGS.get(key);
  const h = Math.round(px * 1.35), w = Math.round(px * 1.25), cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), R = ramp(hot ? '#e2762a' : HOME.c1);
  g.fillStyle = R[0]; g.fillRect(1, 0, w - 2, h); g.fillRect(0, 1, w, h - 2);
  g.fillStyle = R[2]; g.fillRect(1, 1, w - 2, h - 2);
  g.fillStyle = R[3]; g.fillRect(1, 1, w - 2, Math.max(1, Math.round(h * 0.2)));
  g.fillStyle = hot ? '#fff7dc' : HOME.c2; g.font = '700 ' + px + 'px "Russo One", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, w / 2, h / 2 + 1);
  TAGS.set(key, cv);
  return cv;
}

/* ---------- between two frames ---------- */
const lerp = (a, b, u) => a + (b - a) * u;
function lerpAng(a, b, u) { let d = ((b - a + 540) % 360) - 180; return (a + d * u + 360) % 360; }
function lerpWrap(a, b, u) { let d = b - a; if (d < -50) d += 100; if (d > 50) d -= 100; return (a + d * u + 100) % 100; }

/* The sim records 30 frames a second; the screen runs at 60 or more. This is
   the frame between a and b, u of the way (0 to 1). */
export function between(a, b, u) {
  if (!b || u <= 0) return a;
  if (u >= 1) return b;
  const arr = (p, q, fn = lerp) => p && q && p.length === q.length ? p.map((v, i) => fn(v, q[i], u)) : p;
  // a catch or a release is a hand off, not a slide: the ball snaps with its frame
  const ballJump = a.h !== b.h && a.h && b.h;
  return Object.assign({}, a, {
    t: lerp(a.t, b.t, u), o: arr(a.o, b.o), x: arr(a.x, b.x), b: ballJump ? (u < 0.5 ? a.b : b.b) : arr(a.b, b.b),
    f: arr(a.f, b.f, lerpAng), g: arr(a.g, b.g, lerpWrap),
    sk: a.sk != null && b.sk != null ? lerp(a.sk, b.sk, u) : a.sk,
    k: u < 0.5 ? a.k : b.k, h: u < 0.5 ? a.h : b.h, s: u < 0.5 ? a.s : b.s
  });
}

/* ---------- the court ---------- */
export function createCourt(cv) {
  let V = null;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* opts.after: { t, made, seed } plays the ball out after the last frame,
     t seconds in: through the net, or off the rim. opts.spin is a count of
     ball turns, for the traced ball's four frames. */
  function draw(fr, opts = {}) {
    const { w, h, ctx, dpr } = sizeCanvas(cv);
    V = fitView(w, h, 12);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#3a2a20'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(floor(), V.ox, V.oy, COURT.W * V.s, COURT.H * V.s);
    if (!fr) { rim(ctx, 0); return; }
    const B = rig();
    // One sprite cell is a whole number of device pixels, so the art stays crisp.
    // (to the nearest quarter pixel: a phone at 2x gets 1.25 device pixels a
    // cell rather than a figure too small to read)
    const dk = Math.max(1, Math.round(V.s * dpr * 0.088 * 4) / 4), cell = dk / dpr;
    const ftH = 8.6 * cell;                     // screen pixels per foot of height, on the rig's scale
    const size = Math.max(10, Math.round(V.s * 2.6));
    const after = opts.after || null;

    // set screens: a short braced bar on the floor at the screener's feet
    for (const [, x, y] of fr.s || []) {
      const p = V.px({ x, y });
      ctx.fillStyle = 'rgba(20,20,20,.28)'; ctx.fillRect(Math.round(p.x - size * 0.7), Math.round(p.y + 2), Math.round(size * 1.4), 3);
      ctx.fillStyle = '#f2ead6'; ctx.fillRect(Math.round(p.x - size * 0.7), Math.round(p.y + 2), Math.round(size * 1.4), 1);
    }

    const people = [];
    for (let i = 0; i < 5; i++) people.push({ team: 'away', i: 5 + i, ft: { x: fr.x[i * 2], y: fr.x[i * 2 + 1] } });
    for (let i = 0; i < 5; i++) people.push({ team: 'home', i, id: IDS[i], ft: { x: fr.o[i * 2], y: fr.o[i * 2 + 1] } });
    for (const q of people) q.p = V.px(q.ft);

    // Shadows first, all of them, so no body is drawn under another's shadow.
    ctx.fillStyle = 'rgba(30,18,10,.30)';
    for (const q of people) { ctx.beginPath(); ctx.ellipse(q.p.x + 1.5, q.p.y + 0.5, Math.max(4, V.s * 0.95), Math.max(2, V.s * 0.42), 0, 0, Math.PI * 2); ctx.fill(); }
    // team rings at the feet: ours in the home trim, theirs in the away red
    for (const q of people) {
      ctx.strokeStyle = q.team === 'home' ? HOME.c2 : AWAY.c1; ctx.globalAlpha = 0.75; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(q.p.x, q.p.y, Math.max(4, V.s * 0.9), Math.max(2, V.s * 0.38), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    rim(ctx, after ? after.t : 0, after);

    // the ball, placed and sorted with the bodies
    const ball = ballAt(fr, after);
    const items = people.map(q => ({ y: q.ft.y, q }));
    items.push({ y: ball.y + (fr.h ? 0.05 : 0), ball });
    items.sort((a, b) => a.y - b.y);
    const shadowOfBall = V.px({ x: ball.x, y: ball.y });
    ctx.fillStyle = 'rgba(30,18,10,.28)';
    ctx.beginPath(); ctx.ellipse(shadowOfBall.x + 1, shadowOfBall.y + 0.5, Math.max(1.5, V.s * 0.32), Math.max(1, V.s * 0.16), 0, 0, Math.PI * 2); ctx.fill();

    const tags = [];
    for (const it of items) {
      if (it.ball) { drawBall(ctx, B, it.ball, cell, ftH, dpr, opts.spin || 0); continue; }
      const q = it.q, code = fr.k ? fr.k[q.i] : 0, face = fr.f ? fr.f[q.i] : (q.team === 'home' ? 270 : 90);
      const gait = fr.g ? fr.g[q.i] / 100 : 0;
      const shooting = q.team === 'home' && code === 4;
      const sk = shooting ? (fr.sk || 0) : 0;
      const lift = shooting && !reduce ? jumpOf(sk) * ftH : 0;
      const pose = poseOf(q.team, code, gait, sk, fr.t);
      const img = B ? pick(q.team, pose, face) : null;
      if (img) {
        const dx = Math.round(q.p.x * dpr - 21.5 * dk), dy = Math.round((q.p.y - lift) * dpr - 61.5 * dk);
        ctx.save();
        if (img.flip) { ctx.setTransform(-1, 0, 0, 1, dx + 44 * dk, dy); }
        else ctx.setTransform(1, 0, 0, 1, dx, dy);
        ctx.drawImage(img.cv, 0, 0, 44 * dk, 64 * dk);
        ctx.restore();
      } else {
        const t = q.team === 'home' ? token(HOME.c1, HOME.c2, q.id.slice(1), size) : token(AWAY.c1, AWAY.c2, 'X', size);
        ctx.drawImage(t, Math.round(q.p.x - size / 2), Math.round(q.p.y - size / 2 - lift), size, size);
      }
      if (q.team === 'home' && img) tags.push({ q, lift });
    }
    // number tags last, over every body, so a defender never hides one
    // (a disc token carries its own number)
    for (const { q, lift } of tags) {
      const tg = tag(q.id.slice(1), Math.max(8, Math.round(cell * 15)), fr.h === q.id);
      ctx.drawImage(tg, Math.round(q.p.x - tg.width / 2), Math.round(q.p.y - lift - 58 * cell - tg.height - 1));
    }
    if (opts.debug) debug(ctx, fr);
  }

  /* Where the ball is, in feet, and how high. After the last frame it plays
     out from the rim: a make drops through and bounces under the basket, a
     miss kicks off the rim one way or the other (the seed picks which, so a
     replay looks the same). */
  function ballAt(fr, after) {
    const b = { x: fr.b[0], y: fr.b[1], z: fr.b[2] || 0 };
    if (!after) return b;
    const t = after.t, R = COURT.RIM;
    if (after.made) {
      if (t < 0.22) return { x: R.x, y: R.y, z: 0 };
      const u = t - 0.22;
      return { x: R.x, y: R.y + Math.min(1.6, u * 3.2), z: bounce(u, 3.2) };
    }
    const side = (after.seed % 3) - 1, ang = Math.PI / 2 + side * 0.75 + ((after.seed >> 3) % 7 - 3) * 0.08;
    const reach = Math.min(1, t / 1.1) * 8;
    return { x: R.x + Math.cos(ang) * reach, y: R.y + Math.sin(ang) * reach, z: bounce(t, 4.5) };
  }
  function bounce(t, h0) {
    // a ball dropped from h0 feet, each bounce at about half the height before
    let h = h0, start = 0, dur = Math.sqrt(2 * h / 32) * 2;
    for (let n = 0; n < 5; n++) {
      if (t < start + dur) { const u = (t - start) / dur; return 4 * h * u * (1 - u); }
      start += dur; h *= 0.45; dur = Math.sqrt(2 * h / 32) * 2;
    }
    return 0;
  }
  function jumpOf(sk) {
    const peak = 1.0;
    const u = Math.min(1, (sk + 0.2) / 0.8);
    return Math.sin(Math.PI * u) * peak;
  }

  function drawBall(ctx, B, ball, cell, ftH, dpr, spin) {
    const p = V.px({ x: ball.x, y: ball.y });
    const y = p.y - ball.z * ftH;
    const art = B && B.propCanvas ? ballArt(B, (spin | 0) % 4) : null;
    if (art) {
      const s = cell * 1.15 * (1 + Math.min(0.35, ball.z * 0.025));
      ctx.drawImage(art, Math.round(p.x - art.width * s / 2), Math.round(y - art.height * s / 2), art.width * s, art.height * s);
      return;
    }
    const br = Math.max(2.5, V.s * 0.32);
    const Rr = ramp('#e2762a');
    ctx.fillStyle = Rr[2]; ctx.fillRect(Math.round(p.x - br), Math.round(y - br), Math.round(br * 2), Math.round(br * 2));
    ctx.fillStyle = Rr[4]; ctx.fillRect(Math.round(p.x - br), Math.round(y - br), Math.round(br), Math.round(br));
    ctx.fillStyle = '#3a1606'; ctx.fillRect(Math.round(p.x - br), Math.round(y), Math.round(br * 2), 1);
  }

  /* The rim, drawn live so it can shake on a miss and the net can swish. */
  function rim(ctx, t, after) {
    const r = ramp('#e2551d'), c = V.px(COURT.RIM), rr = 0.75 * V.s;
    const shake = after && !after.made && t < 0.3 && !reduce ? Math.round(Math.sin(t * 60) * 1.5) : 0;
    const swish = after && after.made && t < 0.5;
    // the net: a few cream threads hanging toward the floor (down the screen)
    ctx.fillStyle = swish ? '#ffffff' : 'rgba(242,234,214,.75)';
    const drop = swish && !reduce ? Math.round(V.s * (0.5 + Math.sin(t * 25) * 0.25)) : Math.round(V.s * 0.5);
    for (let i = -2; i <= 2; i++) ctx.fillRect(Math.round(c.x + i * rr * 0.45), Math.round(c.y + rr * 0.6), 1, drop);
    for (let a = 0; a < 48; a++) {
      const th = a / 48 * Math.PI * 2;
      ctx.fillStyle = r[th < Math.PI ? 1 : 3];
      ctx.fillRect(Math.round(c.x + Math.cos(th) * rr) + shake, Math.round(c.y + Math.sin(th) * rr * 0.9), 2, 2);
    }
  }

  function debug(ctx, fr) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const xp = V.px({ x: fr.x[i * 2], y: fr.x[i * 2 + 1] }), m = IDS.indexOf(fr.m[i]);
      const op = V.px({ x: fr.o[m * 2], y: fr.o[m * 2 + 1] });
      ctx.beginPath(); ctx.moveTo(xp.x, xp.y); ctx.lineTo(op.x, op.y); ctx.stroke();
    }
  }
  return { draw, view: () => V };
}

/* Which traced frame a pose code (sim.js POSE) shows. */
function poseOf(team, code, gait, sk, clock) {
  const step = Math.floor(gait * 4) % 4;
  if (team === 'home') {
    switch (code) {
      case 1: return 'walk' + step;
      case 2: return 'dribble' + step;
      case 3: return 'dribble' + (Math.floor((clock || 0) * 7) % 4);   // a dribble in place, on the game clock
      case 4: return sk < 0.16 ? 'shot2' : sk < 0.55 ? 'shot3' : 'stand';
      case 5: return 'set';
      case 6: return 'ready';
      case 7: return 'pass';
      case 8: return 'hold';
      default: return 'stand';
    }
  }
  switch (code) {
    case 1: return gait % 0.5 < 0.25 ? 'slideA' : 'slideB';
    case 2: return 'walk' + step;
    case 3: return 'stuck';
    case 4: return 'contest';
    default: return 'stance';
  }
}

/* The traced frame, or the nearest one that is ready: the same pose at the
   nearest traced yaw, then the team's standing frame. */
const FALL = { home: 'stand', away: 'stance' };
function pick(team, pose, face) {
  const { yi, flip } = yawOf(face);
  const set = SPR[team][pose] && SPR[team][pose][yi] ? SPR[team][pose] : SPR[team][FALL[team]];
  if (!set || !set[yi]) return null;
  return { cv: set[yi], flip };
}

const BALLS = {};
function ballArt(B, spin) {
  if (BALLS[spin] !== undefined) return BALLS[spin];
  try { BALLS[spin] = B.propCanvas('ball', { spin, r: 3.7, w: 9, h: 9, res: 1 }); } catch (e) { BALLS[spin] = null; }
  return BALLS[spin];
}
