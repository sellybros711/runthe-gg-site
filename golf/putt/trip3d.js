/* golf/putt/trip3d.js: THE TRIP TO SPACE (RTT_PUTT_TRIP), played in 3D between two worlds (the owner, 2026-11-02: "The rocket
   traveling scenes needs to be built with the same depth and detail as the worlds ... travel through space with a go pro
   camera angle or like a third person angle", and "The rocket needs to be a 3d pixel model").

   A small renderer of its own, drawn at a low resolution and scaled up with no smoothing, so it is the same chunky pixel 3D
   as the courses: the rocket, its launch tower, the pad, the fuel tanks and the trees are VOXEL models (a grid of cubes,
   walked one cell at a time along each ray, every cube face lit flat), the Earth and the Moon are spheres with their land,
   clouds and craters painted on, and every surface is lit from the same light as hole3d.js (LIGHT, upper left) and stepped
   into a few tones, with a dark outline round each silhouette. Smoke, flame and moon dust are particles drawn into the same
   depth buffer.

   RTT_PUTT_TRIP.play(host, { from:'earth', to:'moon', vehicle:'rocket', label, name }, cb). A tap skips it. putt.js's
   spaceTrip() hands the trip here and keeps its own flat version for when this file is missing or throws. PLANETS holds every
   world it flies between: the Earth, the Moon, Mars, Saturn, Crystara and Jellara. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;

// ---------------------------------------------------------------- small maths
function V(x, y, z){ return [x, y, z]; }
function add(a, b){ return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b){ return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul(a, s){ return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b){ return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b){ return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len(a){ return Math.sqrt(dot(a, a)); }
function norm(a){ var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function lerpV(a, b, t){ return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function smooth(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function hash(a, b, c){ var h = (2166136261 ^ (a | 0)) >>> 0; h = Math.imul(h ^ (b | 0), 16777619) >>> 0; h = Math.imul(h ^ ((c | 0) + 0x9e37), 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
function noise3(x, y, z){ var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  var a = lerp(hash(X, Y, Z), hash(X + 1, Y, Z), fx), b = lerp(hash(X, Y + 1, Z), hash(X + 1, Y + 1, Z), fx), c = lerp(hash(X, Y, Z + 1), hash(X + 1, Y, Z + 1), fx), d = lerp(hash(X, Y + 1, Z + 1), hash(X + 1, Y + 1, Z + 1), fx);
  return lerp(lerp(a, b, fy), lerp(c, d, fy), fz); }
function fbm(p, oct){ var s = 0, a = 0.5, f = 1; for (var i = 0; i < oct; i++){ s += a * noise3(p[0] * f, p[1] * f, p[2] * f); f *= 2.03; a *= 0.5; } return s; }
// Crystara seen from afar: a domain warped swirl for the body of the planet and ridged noise for its glowing veins
function crysFar(n){ var w = fbm([n[0] * 1.6 + 3.1, n[1] * 1.6, n[2] * 1.6 - 2.3], 3), q = [n[0] * 2.4 + w * 2.6, n[1] * 2.4 - w * 1.8, n[2] * 2.4 + w * 2.2];
  var sw = fbm(q, 4), v = fbm([q[0] * 2.2 + sw * 1.5, q[1] * 2.2, q[2] * 2.2 - sw * 1.5], 3), vein = 1 - Math.abs(v * 2 - 1);
  var c = sw < 0.42 ? lerpV([34, 20, 78], [92, 52, 168], smooth((sw - 0.22) / 0.2)) : sw < 0.6 ? lerpV([92, 52, 168], [176, 92, 220], smooth((sw - 0.42) / 0.18)) : lerpV([176, 92, 220], [236, 140, 226], smooth((sw - 0.6) / 0.15));
  c = lerpV(c, [120, 236, 255], smooth((vein - 0.82) / 0.12) * 0.8);
  return lerpV(c, [236, 252, 255], smooth((vein - 0.93) / 0.05)); }
/* Jellara from afar: a teal goo sea stirred into flowing swirls, lime jelly drifting through it like continents of slime,
   blushes of pink jelly folded into the lime and soft bright streaks where the goo catches the light (warped noise, never a grid) */
function jelFar(n){ var w = fbm([n[0] * 1.4 - 1.7, n[1] * 1.4 + 2.2, n[2] * 1.4], 3), q = [n[0] * 2.1 - w * 2.4, n[1] * 2.1 + w * 2.0, n[2] * 2.1 - w * 2.6];
  var sw = fbm(q, 4), pk = fbm([q[0] * 1.8 + sw * 2.2, q[1] * 1.8 - 3.1, q[2] * 1.8 + sw * 1.4], 3), st = 1 - Math.abs(fbm([q[0] * 3.1 + pk, q[1] * 3.1, q[2] * 3.1 - pk], 2) * 2 - 1);
  var c = lerpV([28, 120, 112], [63, 208, 176], smooth((sw - 0.3) / 0.16));
  c = lerpV(c, lerpV([110, 196, 70], [170, 240, 118], smooth((sw - 0.5) / 0.12)), smooth((sw - 0.43) / 0.07));
  c = lerpV(c, [255, 128, 204], smooth((pk - 0.5) / 0.1) * smooth((sw - 0.4) / 0.1) * 0.9);
  return lerpV(c, [236, 255, 246], smooth((st - 0.9) / 0.08) * 0.6); }
/* Oz from afar: a green world of soft warped meadow in many greens, rivers of red poppy fields winding through it, golden
   fields of corn here and there, and the white of clouds drifting over (warped noise, never a facet or a grid) */
function ozFar(n){ var w = fbm([n[0] * 1.5 + 4.1, n[1] * 1.5 - 1.3, n[2] * 1.5], 3), q = [n[0] * 2.2 + w * 2.2, n[1] * 2.2 - w * 1.9, n[2] * 2.2 + w * 2.4];
  var sw = fbm(q, 4), pp = 1 - Math.abs(fbm([q[0] * 1.7 - sw, q[1] * 1.7 + 2.2, q[2] * 1.7 + sw], 3) * 2 - 1), gd = fbm([q[0] * 2.6 + 9, q[1] * 2.6, q[2] * 2.6 - 4], 2);
  var c = lerpV([46, 120, 48], [118, 196, 84], smooth((sw - 0.32) / 0.3));
  c = lerpV(c, [222, 196, 92], smooth((gd - 0.66) / 0.08) * 0.6);
  c = lerpV(c, [204, 48, 48], smooth((pp - 0.93) / 0.05) * 0.8);
  var cl = fbm([n[0] * 3.2 + 7, n[1] * 4.6, n[2] * 3.2], 3); return lerpV(c, [246, 248, 252], smooth((cl - 0.6) / 0.1) * 0.85); }
function hex(c){ return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function rotX(a){ var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function rotY(a){ var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function mm(A, B){ var C = []; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; }
function mv(M, v){ return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
function mtv(M, v){ return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; }
var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// ---------------------------------------------------------------- voxel models
/* a model is a grid of cubes, each a colour or empty, built once by sampling fn at every cell's middle. Its local frame:
   x right, y up, z toward the viewer; o is where cell (0,0,0)'s corner sits; vs the size of a cube. */
function voxels(nx, ny, nz, vs, o, fn){ var c = new Int32Array(nx * ny * nz);
  for (var k = 0; k < nz; k++) for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++){ var col = fn(o[0] + (i + 0.5) * vs, o[1] + (j + 0.5) * vs, o[2] + (k + 0.5) * vs, i, j, k);
    if (col) { var h = hex(col); c[(k * ny + j) * nx + i] = (h[0] << 16 | h[1] << 8 | h[2]) + 1; } }
  return { nx:nx, ny:ny, nz:nz, vs:vs, o:o, c:c }; }

/* THE ROCKET: a round white body with panel seams and rivets, a gold band, two lit portholes (the pilot in the top one), a red
   nose, three swept red fins, three landing legs and a dark nozzle. In rocket units: radius 1, the body 0 to 4.6 high, the nose
   to 6.8, the nozzle and the legs reach down to -0.75. The portholes look along +z. */
var ROCKET = (function(){ var vs = 0.125, R = 1;
  return voxels(34, 64, 34, vs, [-2.125, -0.875, -2.125], function(x, y, z){
    var r = Math.hypot(x, z), a = Math.atan2(x, z);
    if (y >= 0 && y <= 4.6 && r <= R){
      if (r < R - 0.2) return null;                                                     // a hollow shell: only the skin is drawn
      // the portholes on the +z face
      var ph = [[3.75, 0.32], [2.25, 0.27]];
      for (var p = 0; p < 2; p++){ var dy = y - ph[p][0], dd = Math.hypot(x, dy); if (z > 0.5 && dd < ph[p][1] + 0.08){
        if (dd > ph[p][1] - 0.02) return '#c99a2e';
        if (p === 0){ if (Math.hypot(x, dy - 0.04) < 0.16) return dy > 0.08 ? '#f2f4f8' : '#c98a5a'; }                // the pilot's helmet and face
        return dy > 0.1 && x < 0 ? '#bfe9ff' : '#3a7fd8'; } }
      if (y > 3.05 && y < 3.35) return '#e2b23b';                                       // the gold band
      if (Math.abs(((y + 0.45) % 0.9) - 0.45) < 0.05 || Math.abs(((a + 6.283) % 0.785) - 0.39) < 0.04) return '#c8ccd8';   // panel seams
      if (Math.abs(((y + 0.12) % 0.45) - 0.22) < 0.05 && Math.abs(((a + 6.283 + 0.2) % 0.39) - 0.19) < 0.05) return '#9aa0ae';   // rivets
      return y > 4.3 ? '#e5383b' : '#f2f4f8'; }
    if (y > 4.6 && y <= 6.8){ var nr = R * (1 - (y - 4.6) / 2.2); if (r <= nr && r > nr - 0.25) return y > 6.3 ? '#ffffff' : '#e5383b'; if (r <= nr) return null; }
    if (y >= -0.75 && y < 0){ var zr = 0.75 - (y + 0.75) / 0.75 * 0.3; if (r <= zr && r > zr - 0.18) return y < -0.55 ? '#2a2c34' : '#5a5e6a'; }
    // three swept fins and, between them, three landing legs
    for (var f = 0; f < 3; f++){ var fa = f * 2.0944 + 0.5236, u = x * Math.sin(fa) + z * Math.cos(fa), w = x * Math.cos(fa) - z * Math.sin(fa);
      if (Math.abs(w) < 0.13 && u > 0.8 && u < 1.95 && y > -0.75 + (u - 0.8) * 0.15 && y < 1.7 - (u - 1) * 0.9) return u > 1.8 || y < -0.5 ? '#9a1e22' : '#e5383b';
      var la = fa + 1.0472, lu = x * Math.sin(la) + z * Math.cos(la), lw = x * Math.cos(la) - z * Math.sin(la), lx = 1.0 + (0.6 - y) * 0.55;
      if (y > -0.75 && y < 0.6 && Math.abs(lw) < 0.09 && Math.abs(lu - lx) < 0.11) return '#8a8e9a';
      if (y >= -0.75 && y < -0.62 && Math.abs(lw) < 0.2 && Math.abs(lu - 1.75) < 0.22) return '#5a5e6a'; }
    return null; }); })();

/* THE SHIP: the colony ship that runs between the worlds (the owner, 2026-11-02: "fly on a ship to a bunch of planets").
   Wider than the rocket and built for the long haul: a white hull with an orange livery stripe, a wrap round cockpit window
   near the top with the pilot in it, a blunt heat shield nose, two engine pods on its flanks with their own nozzles, four
   delta fins and four landing legs. The same units and frame as the rocket (it stands on its legs, the window looks along +z). */
var SHIP = (function(){ var vs = 0.125, R = 1.15;
  return voxels(40, 66, 40, vs, [-2.5, -0.875, -2.5], function(x, y, z){
    var r = Math.hypot(x, z), a = Math.atan2(x, z);
    if (y >= 0 && y <= 4.9 && r <= R){
      if (r < R - 0.2) return null;
      if (y > 3.55 && y < 4.15 && Math.abs(a) < 1.15){                                 // the cockpit window, wrapped round the front
        if (y < 3.62 || y > 4.08 || Math.abs(a) > 1.07) return '#4a4e5a';
        if (Math.abs(a) < 0.24 && y < 3.98){ var hy = y - 3.8; return Math.abs(hy) < 0.12 && Math.abs(a) < 0.12 ? '#c98a5a' : '#f2f4f8'; }   // the pilot
        return (a < -0.4 && y > 3.85) ? '#bfe9ff' : '#2f5fb8'; }
      if (y > 1.9 && y < 2.35) return Math.abs(((a + 6.283) % 1.047) - 0.52) < 0.05 ? '#c8ccd8' : '#ff7a2a';   // the livery stripe
      if (y > 2.4 && y < 2.52) return '#c8562a';
      if (z > 0.6 && Math.abs(x) < 0.5 && y > 0.6 && y < 1.6) return Math.abs(x) < 0.42 && y > 0.68 && y < 1.52 ? '#d8dce6' : '#8a8e9a';   // the hatch
      if (Math.abs(((y + 0.45) % 0.9) - 0.45) < 0.045 || Math.abs(((a + 6.283) % 0.785) - 0.39) < 0.035) return '#c8ccd8';
      return '#f2f4f8'; }
    if (y > 4.9 && y <= 6.3){ var t = (y - 4.9) / 1.4, nr = R * Math.sqrt(Math.max(0, 1 - t * t)); if (r <= nr && r > nr - 0.25) return t > 0.7 ? '#3a3e48' : '#f2f4f8'; if (r <= nr) return null; }
    if (y >= -0.75 && y < 0){ var zr = 0.85 - (y + 0.75) / 0.75 * 0.3; if (r <= zr && r > zr - 0.18) return y < -0.55 ? '#2a2c34' : '#5a5e6a'; }
    // the two engine pods on its flanks, each with its nozzle and an orange cap
    for (var side = -1; side <= 1; side += 2){ var pr = Math.hypot(x - side * 1.55, z);
      if (y > -0.2 && y < 2.6 && pr < 0.45) return y > 2.3 ? '#ff7a2a' : (Math.abs(y - 1.2) < 0.08 ? '#c8ccd8' : '#e4e6ec');
      if (y >= -0.6 && y <= -0.2 && pr < 0.38 && pr > 0.22) return '#3a3e48';
      if (y > 0.4 && y < 1.9 && Math.abs(z) < 0.1 && Math.abs(x) > 1.05 && Math.abs(x) < 1.2) return '#c8ccd8'; }   // their struts
    // four delta fins and, between them, four landing legs
    for (var f = 0; f < 4; f++){ var fa = f * 1.5708 + 0.7854, u = x * Math.sin(fa) + z * Math.cos(fa), w = x * Math.cos(fa) - z * Math.sin(fa);
      if (Math.abs(w) < 0.12 && u > 0.9 && u < 2.0 && y > -0.6 + (u - 0.9) * 0.2 && y < 1.5 - (u - 1) * 1.1) return u > 1.85 ? '#a83a14' : '#ff7a2a';
      var la = fa + 0.7854, lu = x * Math.sin(la) + z * Math.cos(la), lw = x * Math.cos(la) - z * Math.sin(la), lx = 1.1 + (0.6 - y) * 0.55;
      if (y > -0.75 && y < 0.6 && Math.abs(lw) < 0.09 && Math.abs(lu - lx) < 0.11) return '#8a8e9a';
      if (y >= -0.75 && y < -0.62 && Math.abs(lw) < 0.2 && Math.abs(lu - 1.85) < 0.22) return '#5a5e6a'; }
    return null; }); })();

// THE LAUNCH TOWER: an open red lattice you can see through, a gantry arm to the rocket's hatch, a ladder up its back
var TOWER = voxels(12, 58, 12, 0.2, [-1.2, 0, -1.2], function(x, y, z){
  var ax = Math.abs(x), az = Math.abs(z), edge = (ax > 0.75 && az > 0.75);
  if (ax > 1.0 || az > 1.0 || y > 11.4) return null;
  if (y > 11) return '#7a2a20';
  if (edge) return '#c0392b';
  var face = ax > 0.85 || az > 0.85, s = ax > 0.85 ? z : x;
  if (face && (Math.abs(((y + s) % 1.6 + 1.6) % 1.6 - 0.8) < 0.16 || Math.abs(((y - s) % 1.6 + 1.6) % 1.6 - 0.8) < 0.16 || ((y % 1.6) < 0.2))) return '#d84a3a';
  return null; });
var ARM = voxels(12, 3, 4, 0.2, [0, 0, -0.4], function(x, y, z){ return y > 0.4 || Math.abs(z) > 0.3 ? (Math.abs(z) > 0.3 && y < 0.4 ? null : '#c0392b') : '#9a2a20'; });
var PAD = voxels(48, 3, 48, 0.25, [-6, 0, -6], function(x, y, z){ var e = Math.max(Math.abs(x), Math.abs(z));
  if (y > 0.5) return Math.hypot(x, z) < 1.6 ? '#3a3e48' : null;                         // the flame pit's rim
  if (Math.hypot(x, z) < 1.3) return '#1e2026';
  return e > 5.6 ? '#8a8e9a' : ((Math.floor(x / 1.5) + Math.floor(z / 1.5)) & 1) ? '#b8bcc6' : '#a8acb6'; });
var TANK = voxels(14, 22, 14, 0.18, [-1.26, 0, -1.26], function(x, y, z){ var r = Math.hypot(x, z);
  if (y < 0.4) return Math.abs(x) < 1.0 && Math.abs(z) < 1.0 && (Math.abs(x) > 0.8 || Math.abs(z) > 0.8) ? '#5a5e6a' : null;
  var top = 3.4 - Math.max(0, r - 0.4) * 0; if (r > 1.15) return null; if (y > 3.0 && Math.hypot(r, y - 3.0) > 1.15) return null; if (r < 0.95 && y < 3.0) return null;
  return Math.abs(y - 1.8) < 0.18 ? '#3a7fd8' : '#eef0f4'; });
var TREE = voxels(14, 26, 14, 0.2, [-1.4, 0, -1.4], function(x, y, z){ var r = Math.hypot(x, z);
  if (y < 1.6) return r < 0.28 ? '#6a4628' : null;
  // a snowy pine, Ice Age's: three tiers of dark needles narrowing upward, snow on each tier's top
  var tier = Math.floor((y - 1.6) / 1.4); if (tier > 2) return y < 6.4 && r < 0.35 ? '#ffffff' : null; var ty = (y - 1.6) - tier * 1.4, tr = (1.35 - tier * 0.32) * (1 - ty / 1.9);
  if (r < tr) return (ty > 0.9 || r > tr - 0.25 && ty > 0.6) ? '#f4f8ff' : (hash(Math.round(x * 5), Math.round(y * 5), Math.round(z * 5)) < 0.25 ? '#2f6e4a' : '#1f4e3a');
  return null; });

// ---------------------------------------------------------------- planets
/* each world the trip can leave from or land on: how it is painted (fn of a point on the unit sphere), its radius, and the
   ground near the landing spot. Mars and Saturn join this table. */
var PLANETS = {
  earth:{ R:600, paint:function(n, near){ if (near > 0) return near > 1 ? '#4a9a3a' : '#5aa848';
      var c = fbm([n[0] * 2.6 + 3, n[1] * 2.6, n[2] * 2.6], 4), land = c > 0.52 || n[1] > 0.97, cl = fbm([n[0] * 4 + 9, n[1] * 6, n[2] * 4], 3);
      if (cl > 0.6) return '#f4f6fa';
      if (!land) return c > 0.48 ? '#2f7fd8' : '#1f5fb8';
      return fbm([n[0] * 7, n[1] * 7, n[2] * 7], 2) > 0.55 ? '#c8a86a' : (c > 0.62 ? '#3f8a3a' : '#5aa848'); }, air:'#7fc8ff' },
  moon:{ R:220, paint:null, air:null },
  // Mars: rust plains, the dark lowlands, white caps at its poles, and the great canyon across its middle. It has air, thin and
  // butterscotch by day, so the sky turns that colour as the ship comes down.
  mars:{ R:300, paint:function(n){ if (Math.abs(n[2]) > 0.9) return Math.abs(n[2]) > 0.93 ? '#f6f2ee' : '#e8d8cc';
      var c = fbm([n[0] * 2.4 + 5, n[1] * 2.4, n[2] * 2.4], 4), v = fbm([n[0] * 8, n[1] * 8, n[2] * 8], 2), cy = Math.abs(n[2] + 0.12 + 0.08 * Math.sin(n[0] * 5));
      if (cy < 0.025 && n[1] > -0.6) return '#5a1e0e';
      if (c < 0.42) return v > 0.5 ? '#6e2e1a' : '#7a3420'; return c > 0.6 ? (v > 0.55 ? '#d8784a' : '#c8643a') : (v > 0.55 ? '#b4502a' : '#c25a30'); }, air:'#d89a72' },
  // Saturn: the ship comes down on a great deck of ring ice (this body), with Saturn itself and its rings hanging in the sky
  saturn:{ R:240, paint:null, air:null, giant:{ R:900, off:[-1500, 900, -2600], band:['#e8d2a0', '#d8b878', '#f0dfb4', '#c8a060', '#e2c88c', '#b8905a'] } },
  // Crystara: a planet of living crystal, faceted in violet and cyan from afar; the ship comes down on a field of clear crystal
  crystara:{ R:260, paint:null, air:null },
  // Jellara: a wobbling jelly planet, lime and pink jelly over a teal goo sea; the ship comes down on a bank of lime jelly
  jellara:{ R:250, paint:null, air:null },
  // Oz: green meadows with poppy fields winding through them; the ship comes down in the poppies by the yellow brick road,
  // under a blue sky (the trip there is the one that goes wrong: CRASH below)
  oz:{ R:270, paint:null, air:'#9fd4ff' }
};
// the Moon's craters: a few big ones seen from afar, and a field of smaller ones round the landing spot (its underside, -y)
var CRATERS = []; for (var ci = 0; ci < 46; ci++){ var th = hash(ci, 1, 7) * 6.283, ph = Math.acos(1 - 2 * hash(ci, 2, 7)); CRATERS.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), 0.05 + hash(ci, 3, 7) * 0.2]); }
/* PAINTED ONCE. The Earth's land and clouds and the Moon's craters are baked into maps the first time a trip plays, so a frame
   only looks them up. Both maps are wrapped round the sphere with their poles on the z axis, so the Moon's landing spot (its
   underside, -y) sits on the equator where the map is even. */
var TEX = null;
function sphUV(n){ return [(Math.atan2(n[1], n[0]) / 6.2832 + 1) % 1, Math.asin(clamp(n[2], -1, 1)) / 3.1416 + 0.5]; }
function bake(){ if (TEX) return TEX; var EW = 256, EH = 128, earth = new Uint8Array(EW * EH * 3), MW = 512, MH = 256, mh = new Float32Array(MW * MH), ma = new Float32Array(MW * MH);
  for (var j = 0; j < EH; j++) for (var i = 0; i < EW; i++){ var lo = (i + 0.5) / EW * 6.2832, la = ((j + 0.5) / EH - 0.5) * 3.1416, n = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)], c = hex(PLANETS.earth.paint(n, 0)), k = (j * EW + i) * 3;
    earth[k] = c[0]; earth[k + 1] = c[1]; earth[k + 2] = c[2]; }
  for (var j2 = 0; j2 < MH; j2++) for (var i2 = 0; i2 < MW; i2++){ var lo2 = (i2 + 0.5) / MW * 6.2832, la2 = ((j2 + 0.5) / MH - 0.5) * 3.1416, m = [Math.cos(la2) * Math.cos(lo2), Math.cos(la2) * Math.sin(lo2), Math.sin(la2)], h = (fbm([m[0] * 9, m[1] * 9, m[2] * 9], 3) - 0.5) * 0.02, al = 1;
    for (var c2 = 0; c2 < CRATERS.length; c2++){ var C = CRATERS[c2], d = Math.acos(clamp(m[0] * C[0] + m[1] * C[1] + m[2] * C[2], -1, 1)) / C[3];
      if (d < 1){ h -= C[3] * 0.35 * (1 - d * d); if (d < 0.5) al = 0.82; } else if (d < 1.3) h += C[3] * 0.12 * (1 - (d - 1) / 0.3); }
    mh[j2 * MW + i2] = h; ma[j2 * MW + i2] = al * (0.94 + noise3(m[0] * 40, m[1] * 40, m[2] * 40) * 0.12); }
  var mars = new Uint8Array(EW * EH * 3);
  for (var j3 = 0; j3 < EH; j3++) for (var i3 = 0; i3 < EW; i3++){ var lo3 = (i3 + 0.5) / EW * 6.2832, la3 = ((j3 + 0.5) / EH - 0.5) * 3.1416, n3 = [Math.cos(la3) * Math.cos(lo3), Math.cos(la3) * Math.sin(lo3), Math.sin(la3)], c3 = hex(PLANETS.mars.paint(n3)), k3 = (j3 * EW + i3) * 3;
    mars[k3] = c3[0]; mars[k3 + 1] = c3[1]; mars[k3 + 2] = c3[2]; }
  return TEX = { EW:EW, EH:EH, earth:earth, mars:mars, MW:MW, MH:MH, mh:mh, ma:ma }; }

// ---------------------------------------------------------------- rays: a sphere, a voxel model, a lit face (every trip's)
function hitSphere(ro, rd, c, r){ var oc = sub(ro, c), b = dot(oc, rd), q = dot(oc, oc) - r * r, h = b * b - q; if (h < 0) return -1; h = Math.sqrt(h); var t1 = -b - h; return t1 > 0 ? t1 : (-b + h > 0 ? -b + h : -1); }
/* one voxel model at (pos, M): walk the ray through its grid a cell at a time (Amanatides and Woo) and return the first solid
   cube, its colour and the face it was entered by, as a normal in the world */
// a ray through a voxel grid (Amanatides and Woo). lo is the camera in the model's own frame, worked out once a frame.
function hitVox(m, lo, M, rd, tmax){
  var ldx = M[0] * rd[0] + M[3] * rd[1] + M[6] * rd[2], ldy = M[1] * rd[0] + M[4] * rd[1] + M[7] * rd[2], ldz = M[2] * rd[0] + M[5] * rd[1] + M[8] * rd[2];
  var vs = m.vs, ox = (lo[0] - m.o[0]) / vs, oy = (lo[1] - m.o[1]) / vs, oz = (lo[2] - m.o[2]) / vs, dx = ldx / vs, dy = ldy / vs, dz = ldz / vs, nx = m.nx, ny = m.ny, nz = m.nz;
  var t0b = 0, t1b = tmax, ax = -1, ta, tb, tt;
  if (Math.abs(dx) < 1e-12){ if (ox < 0 || ox > nx) return null; } else { ta = -ox / dx; tb = (nx - ox) / dx; if (ta > tb){ tt = ta; ta = tb; tb = tt; } if (ta > t0b){ t0b = ta; ax = 0; } if (tb < t1b) t1b = tb; if (t0b > t1b) return null; }
  if (Math.abs(dy) < 1e-12){ if (oy < 0 || oy > ny) return null; } else { ta = -oy / dy; tb = (ny - oy) / dy; if (ta > tb){ tt = ta; ta = tb; tb = tt; } if (ta > t0b){ t0b = ta; ax = 1; } if (tb < t1b) t1b = tb; if (t0b > t1b) return null; }
  if (Math.abs(dz) < 1e-12){ if (oz < 0 || oz > nz) return null; } else { ta = -oz / dz; tb = (nz - oz) / dz; if (ta > tb){ tt = ta; ta = tb; tb = tt; } if (ta > t0b){ t0b = ta; ax = 2; } if (tb < t1b) t1b = tb; if (t0b > t1b) return null; }
  var px = ox + dx * (t0b + 1e-6), py = oy + dy * (t0b + 1e-6), pz = oz + dz * (t0b + 1e-6), i = clamp(Math.floor(px), 0, nx - 1), j = clamp(Math.floor(py), 0, ny - 1), k = clamp(Math.floor(pz), 0, nz - 1);
  var sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1, tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  var tmx = t0b + ((sx > 0 ? i + 1 - px : px - i) * tdx), tmy = t0b + ((sy > 0 ? j + 1 - py : py - j) * tdy), tmz = t0b + ((sz > 0 ? k + 1 - pz : pz - k) * tdz), tcur = t0b, cc = m.c, nxy = nx * ny;
  for (var n = 0; n < 220; n++){ var c = cc[k * nxy + j * nx + i];
    if (c){ var nl = ax === 0 ? V(-sx, 0, 0) : ax === 1 ? V(0, -sy, 0) : ax === 2 ? V(0, 0, -sz) : V(0, 1, 0); return { t:tcur, col:c - 1, n:mv(M, nl) }; }
    if (tmx < tmy && tmx < tmz){ i += sx; tcur = tmx; tmx += tdx; ax = 0; if (i < 0 || i >= nx) return null; }
    else if (tmy < tmz){ j += sy; tcur = tmy; tmy += tdy; ax = 1; if (j < 0 || j >= ny) return null; }
    else { k += sz; tcur = tmz; tmz += tdz; ax = 2; if (k < 0 || k >= nz) return null; }
    if (tcur > t1b) return null; }
  return null; }

// a cube face lit the way the courses are: a few steps of tone from the light, never pure black
function shade(rgb, n, sun, amb){ var l = dot(n, sun), k = l > 0.55 ? 1.12 : l > 0.15 ? 0.95 : l > -0.2 ? 0.74 : 0.56; k = k * (1 - amb) + amb;
  return [Math.min(255, rgb[0] * k), Math.min(255, rgb[1] * k), Math.min(255, rgb[2] * k)]; }

// ---------------------------------------------------------------- the player
function play(host, o, cb){
  if (o && o.vehicle === 'sea') return sail(host, o, cb);   // the Odyssey's islands are reached by sea (sail, below)
  if (o && o.vehicle === 'fall') return fall(host, o, cb);   // Wonderland is reached down the rabbit hole (fall, below)
  if (o && o.vehicle === 'glass') return glassLeg(host, o, cb);   // the Looking-Glass is reached through the glass (glassLeg, below)
  if (o && o.vehicle === 'beanstalk') return beanLeg(host, o, cb);   // the Beanstalk is reached up the beanstalk (beanLeg, below)
  o = o || {}; if (!PLANETS[o.from || 'earth'] || !PLANETS[o.to || 'moon'] || (o.vehicle && o.vehicle !== 'rocket' && o.vehicle !== 'ship')) throw new Error('trip3d: no such trip');
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var wrap = document.createElement('div'); wrap.className = 'pp-trip';
  wrap.innerHTML = '<canvas></canvas><div class="pp-tripcap"><i></i><b></b></div><small>Tap to skip</small>';
  wrap.querySelector('i').textContent = o.label || ''; wrap.querySelector('b').textContent = o.name || '';
  host.appendChild(wrap);
  var cv = wrap.querySelector('canvas'), cw = host.clientWidth || 390, ch = host.clientHeight || 844, dpr = Math.min(2, root.devicePixelRatio || 1);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  /* the picture is ray traced at a low size and blown up with no smoothing, the chunky pixels of the courses. It starts 150
     across, and a phone that cannot keep up drops it a step at a time (to no fewer than 104) rather than drop frames. */
  var W, H, buf = document.createElement('canvas'), bx, img, D, Z, ID, slow = 0, slowN = 0;
  function setRes(w){ W = w; H = Math.round(W * ch / cw); buf.width = W; buf.height = H; bx = buf.getContext('2d'); img = bx.createImageData(W, H); D = img.data; Z = new Float32Array(W * H); ID = new Int8Array(W * H); }
  setRes(150);
  var done = false, t0 = 0, DUR = reduce ? 1.8 : 10.8, frames = 0, ftime = 0;
  var FROMK = o.from || 'earth', TOK = o.to || 'moon', VEH = o.vehicle === 'ship' ? SHIP : ROCKET;
  /* THE TRIP THAT GOES WRONG (Oz, the owner's brief: "a normal seeming ship flight malfunctions and crash lands in a poppy
     field by the yellow brick road"). It leaves as every leg does. Past the climb the engines sputter (the flame cuts in and
     out), smoke pours from a pod and the ship spins; it comes down leaning and turning, bumps down on its side in the poppies
     beside the road with a puff of petals, and a thread of smoke rises from it. Never a fireball: a bumpy landing. */
  var CRASH = TOK === 'oz';
  bake(); var Re = PLANETS[o.from || 'earth'].R, Rm = PLANETS[o.to || 'moon'].R, CE = V(0, -Re, 0), HM = 2700, CM = V(0, HM + Rm, 0);
  var stars = []; for (var s = 0; s < 260; s++){ var a = hash(s, 1, 3) * 6.283, b = Math.acos(1 - 2 * hash(s, 2, 3)); stars.push([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), hash(s, 4, 3)]); }
  var trees = []; for (var tq = 0; tq < 14; tq++){ var ta = hash(tq, 5, 9) * 6.283, tr = 9 + hash(tq, 6, 9) * 14; trees.push(V(Math.cos(ta) * tr, 0, Math.sin(ta) * tr)); }
  var parts = [];
  function finish(){ if (done) return; done = true; wrap.classList.add('out'); setTimeout(function(){ if (wrap.isConnected) wrap.remove(); cb && cb(); }, 350); }
  wrap.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); finish(); });

  // ---- where everything is at time t
  function rocketAt(t){ var y, flip = 0, tilt = 0;
    if (t < 2.4) y = 0; else if (t < 4.2) y = 6 * (t - 2.4) * (t - 2.4); else if (t < 6.6) y = 19.4 * Math.exp(1.85 * (t - 4.2)); else y = 0;
    if (t >= 6.6){ var u = smooth((t - 6.6) / 2.4), y0 = 19.4 * Math.exp(1.85 * 2.4); y = lerp(y0, HM, 1 - Math.pow(1 - u, 2.2)); }
    flip = smooth((t - 7.7) / 0.9) * Math.PI; if (t > 9.0) y = HM;
    tilt = t > 4.2 && t < 7.6 ? Math.sin(t * 3.1) * 0.03 : 0;
    var spin = 0, lean = 0, sput = false, bump = 0;
    if (CRASH){ var tr = smooth((t - 5.6) / 0.6);
      spin = t > 5.6 ? Math.min(t - 5.6, 3.4) * 2.6 * tr : 0;                                          // the spin, slowing to a stop as it lands
      if (t > 9.0) spin = 3.4 * 2.6;
      tilt += t > 5.6 && t < 9.0 ? Math.sin(t * 4.3) * 0.16 * tr : 0;                                  // the wobble
      lean = smooth((t - 8.2) / 1.0) * 0.42;                                                           // it comes down leaning, and stays leaning
      sput = t > 5.6 && t < 9.0 && Math.sin(t * 23) + Math.sin(t * 9.7) > 0.4;                         // the engines cut in and out
      if (t > 9.0 && t < 9.5) bump = Math.abs(Math.sin((t - 9.0) / 0.5 * Math.PI)) * 0.9; }          // one bump as it hits
    var M = mm(rotX(flip), rotY(t * 0.25 + (t > 4.2 ? (t - 4.2) * 0.6 : 0) + spin));
    if (tilt) M = mm([1, 0, 0, 0, Math.cos(tilt), -Math.sin(tilt), 0, Math.sin(tilt), Math.cos(tilt)], M);
    if (lean) M = mm([Math.cos(lean), -Math.sin(lean), 0, Math.sin(lean), Math.cos(lean), 0, 0, 0, 1], M);
    var base = flip > 1.6 ? V(0, y - 0.75 - bump + lean * 0.9, 0) : V(0, y + 1.05, 0);              // the nozzle or (flipped) the legs sit on the ground
    return { p:base, y:y, M:M, flip:flip, burn:t > 2.35 && !(t > 6.9 && t < 7.7) && t < 9.05 && !sput, retro:t > 8.0, trouble:CRASH && t > 5.6 && t < 9.0, crashed:CRASH && t >= 9.0 }; }
  function camAt(t, rk){ var P = rk.p, shake = 0;
    if (t < 4.2){ var lift = clamp((t - 2.4) / 1.8, 0, 1); shake = t > 2.3 ? 0.08 * (1 - lift * 0.4) : 0;
      var pos = lerpV(V(7.5, 1.4, 9.5), V(9, 3, 12), lift), tg = V(0, Math.min(3.4 + P[1] * 0.9, P[1] + 3.4), 0);
      return { pos:add(pos, V(Math.sin(t * 41) * shake, Math.sin(t * 37) * shake, 0)), tg:tg, up:V(0, 1, 0), fov:62 }; }
    if (t < 7.6){ // the chase: above and behind, looking down past the rocket at the Earth falling away, then round in front to the Moon
      var s2 = smooth((t - 5.6) / 1.6), off = lerpV(V(4.5, 8, 11), V(5, -13, 7.5), s2), roll = Math.sin(t * 2.3) * 0.06;
      var pos2 = add(P, off), tg2 = add(P, lerpV(V(0, 1.5, 0), V(0, 26, 0), s2 * s2)), up2 = norm(lerpV(V(Math.sin(roll), 1, 0), V(Math.sin(roll), 0.15, 1), s2));
      var sk = CRASH && t > 5.6 ? 0.22 : 0.05;
      return { pos:add(pos2, V(Math.sin(t * 29) * sk, Math.sin(t * 31) * sk, 0)), tg:tg2, up:up2, fov:lerp(58, 64, s2) }; }
    // the landing: the Moon's underside is the ground now, so the camera's up is -y
    var s3 = smooth((t - 7.6) / 1.6), dist = lerp(16, 13, s3), pos3 = V(dist * 0.6, rk.y + lerp(-14, -3.2, s3), dist * 0.85), tg3 = V(0, rk.y - 3.4, 0);
    if (t < 9) tg3 = lerpV(add(P, V(0, -3, 0)), tg3, s3);
    return { pos:pos3, tg:tg3, up:V(0, -1, 0), fov:60 }; }
  function sunAt(t){ var s4 = smooth((t - 6.4) / 2); return norm(lerpV(V(-0.55, 0.72, 0.72), V(-0.55, -0.72, 0.72), s4)); }

  // ---- rays
  /* WHAT A PLANET LOOKS LIKE where a ray meets it: its colour and its normal. The Earth: grass by the pad, its land and clouds
     from afar. The Moon: grey, its craters bent into the light, and a field of small ones near the ground. Mars: its rust and
     dark lowlands from afar, and near the ground the dust, scattered dark rocks and the odd crater. */
  function surf(kind, ro, rd, tt, C, near){ var pe = add(ro, mul(rd, tt)), ne = norm(sub(pe, C)), col;
    if (kind === 'earth'){ var nr = Math.hypot(pe[0], pe[2]);
      // the pad stands in Ice Age's snow, the last world on Earth before the rocket: drifts of white with blue shadows
      if (nr < 80 && near){ var gh = hash(Math.floor(pe[0] * 3.5), Math.floor(pe[2] * 3.5), 1); col = gh < 0.18 ? [196, 214, 236] : gh > 0.9 ? [255, 255, 255] : [232, 240, 250]; }
      else { var uv = sphUV(ne), ti = (Math.floor(uv[1] * TEX.EH) * TEX.EW + Math.floor(uv[0] * TEX.EW)) * 3; col = [TEX.earth[ti], TEX.earth[ti + 1], TEX.earth[ti + 2]]; }
      return [col, ne]; }
    var nn = ne, gx = pe[0], gz = pe[2], lv, di, dj;
    if (kind === 'saturn'){ var nz = noise3(gx * 0.15, 5, gz * 0.15), fz = clamp((tt - 25) / 80, 0, 1); col = lerpV([214, 220, 240], [190 + nz * 40, 196 + nz * 40, 226 + nz * 20], fz);
      if (near && tt < 140){ var cr3 = Math.abs(noise3(gx * 0.6, 1, gz * 0.6) - 0.5) < 0.02; if (cr3) col = [150, 160, 196];
        var icx = Math.floor(gx / 1.9), icz = Math.floor(gz / 1.9);
        for (var ii = -1; ii <= 1; ii++) for (var ij = -1; ij <= 1; ij++){ var bx2 = icx + ii, bz2 = icz + ij; if (hash(bx2, bz2, 51) > 0.14) continue;
          var ex = (bx2 + hash(bx2, bz2, 52)) * 1.9, ez = (bz2 + hash(bx2, bz2, 53)) * 1.9, er = 0.15 + hash(bx2, bz2, 54) * 0.45, ed = Math.hypot(gx - ex, (gz - ez) * 1.15) / er;
          if (ed < 1){ col = ed < 0.5 && (gx - ex) + (gz - ez) < 0 ? [255, 255, 255] : [168, 196, 232]; nn = norm(add(nn, mul(norm(V(gx - ex, 0.01, gz - ez)), 0.6 * ed))); } } }
      return [col, nn]; }
    /* Crystara: from afar a living world, swirls of deep indigo, violet and magenta stirred like a nebula, laced with glowing
       cyan veins of crystal and a few bright seams; near the ground clear pale crystal, cyan drifting into lilac with bright veins, with
       points of crystal standing out of it */
    if (kind === 'crystara'){ var fc = clamp((tt - 25) / 80, 0, 1), far = crysFar(ne);
      var gw = fbm([gx * 0.07 + 5.3, 1.7, gz * 0.07], 3), gs = fbm([gx * 0.11 + gw * 2.4, 4.1, gz * 0.11 - gw * 2.4], 3), gv = 1 - Math.abs(fbm([gx * 0.24 + gs * 1.6, 8.2, gz * 0.24], 3) * 2 - 1);
      var nearC = lerpV(lerpV([150, 210, 236], [196, 176, 242], smooth((gs - 0.38) / 0.24)), [232, 252, 255], smooth((gv - 0.84) / 0.12) * 0.9);
      col = lerpV(nearC, far, fc);
      if (near && tt < 140){ var pcx = Math.floor(gx / 2.1), pcz = Math.floor(gz / 2.1);
        for (var pi2 = -1; pi2 <= 1; pi2++) for (var pj = -1; pj <= 1; pj++){ var qx = pcx + pi2, qz = pcz + pj; if (hash(qx, qz, 62) > 0.12) continue;
          var px2 = (qx + hash(qx, qz, 63)) * 2.1, pz2 = (qz + hash(qx, qz, 64)) * 2.1, pr2 = 0.18 + hash(qx, qz, 65) * 0.4, pd = (Math.abs(gx - px2) + Math.abs(gz - pz2) * 1.15) / pr2;
          if (pd < 1){ col = (gx - px2) + (gz - pz2) < 0 ? [255, 255, 255] : hash(qx, qz, 66) < 0.5 ? [184, 148, 240] : [138, 224, 255]; nn = norm(add(nn, mul(norm(V(gx - px2, 0.01, gz - pz2)), 0.7 * pd))); } } }
      return [col, nn]; }
    /* Jellara: from afar the swirling goo and jelly of jelFar; near the ground lime jelly with a slow, warped wobble of light
       and shade through it and blobs of pink jelly sitting on it */
    if (kind === 'jellara'){ var fj = clamp((tt - 25) / 80, 0, 1), farJ = jelFar(ne);
      var jw = fbm([gx * 0.08 - 2.1, 3.3, gz * 0.08], 3), js = fbm([gx * 0.13 + jw * 2.6, 6.7, gz * 0.13 - jw * 2.2], 3), jg = 1 - Math.abs(fbm([gx * 0.3 + js * 1.4, 9.1, gz * 0.3], 2) * 2 - 1);
      var nearJ = lerpV(lerpV([128, 210, 84], [176, 242, 124], smooth((js - 0.38) / 0.24)), [226, 255, 200], smooth((jg - 0.86) / 0.1) * 0.7);
      col = lerpV(nearJ, farJ, fj);
      if (near && tt < 140){ var jcx = Math.floor(gx / 2.3), jcz = Math.floor(gz / 2.3);
        for (var ji = -1; ji <= 1; ji++) for (var jj = -1; jj <= 1; jj++){ var qx2 = jcx + ji, qz2 = jcz + jj; if (hash(qx2, qz2, 72) > 0.1) continue;
          var bx3 = (qx2 + hash(qx2, qz2, 73)) * 2.3, bz3 = (qz2 + hash(qx2, qz2, 74)) * 2.3, br3 = 0.2 + hash(qx2, qz2, 75) * 0.4, bd3 = Math.hypot(gx - bx3, (gz - bz3) * 1.15) / br3;
          if (bd3 < 1){ col = bd3 < 0.45 && (gx - bx3) + (gz - bz3) < 0 ? [255, 255, 255] : [255, 138, 208]; nn = norm(add(nn, mul(norm(V(gx - bx3, 0.01, gz - bz3)), 0.7 * bd3))); } } }
      return [col, nn]; }
    /* Oz: from afar the green world of ozFar; near the ground a red poppy field, thick with flowers, a meadow showing
       through in warped soft patches, and the yellow brick road curving past beside the landing spot */
    if (kind === 'oz'){ var fo = clamp((tt - 25) / 80, 0, 1), farO = ozFar(ne);
      var mw = fbm([gx * 0.08 + 1.3, 2.1, gz * 0.08], 3), ms = fbm([gx * 0.12 + mw * 2.4, 5.3, gz * 0.12 - mw * 2], 3);
      var nearO = lerpV([62, 140, 52], [104, 180, 72], smooth((ms - 0.35) / 0.3));
      if (near && tt < 160){ var pf = smooth((fbm([gx * 0.05 - 3, 7.7, gz * 0.05], 3) - 0.38) / 0.12), pcx = Math.floor(gx / 1.1), pcz = Math.floor(gz / 1.1);
        for (var oi = -1; oi <= 1; oi++) for (var oj = -1; oj <= 1; oj++){ var ox = pcx + oi, oz2 = pcz + oj; if (hash(ox, oz2, 81) > 0.15 + pf * 0.5) continue;
          var opx = (ox + hash(ox, oz2, 82)) * 1.1, opz = (oz2 + hash(ox, oz2, 83)) * 1.1, opr = 0.22 + hash(ox, oz2, 84) * 0.22, od = Math.hypot(gx - opx, (gz - opz) * 1.1) / opr;
          if (od < 1){ nearO = od < 0.3 ? [40, 24, 16] : (gx - opx) + (gz - opz) < 0 ? [255, 92, 70] : [214, 34, 40]; nn = norm(add(nn, mul(norm(V(gx - opx, 0.01, gz - opz)), 0.5 * od))); } }
        // the yellow brick road, curving past at a safe distance from where the ship comes down
        var rc = 7.5 + Math.sin(gx * 0.06) * 3, rdd = Math.abs(gz - rc);
        if (rdd < 1.7){ var bj = Math.floor((gz - rc + 1.7) / 0.55), bi = Math.floor((gx + (bj & 1) * 0.45) / 0.9), mo = (((gz - rc + 1.7) / 0.55) % 1) < 0.12 || (((gx + (bj & 1) * 0.45) / 0.9) % 1 + 1) % 1 < 0.1;
          nearO = rdd > 1.5 ? [184, 132, 30] : mo ? [196, 148, 40] : hash(bi, bj, 85) < 0.3 ? [230, 182, 40] : [240, 194, 50]; nn = ne; } }
      col = lerpV(nearO, farO, fo); return [col, nn]; }
    if (kind === 'mars'){ var uvr = sphUV(ne), tr = (Math.floor(uvr[1] * TEX.EH) * TEX.EW + Math.floor(uvr[0] * TEX.EW)) * 3, fr = clamp((tt - 25) / 80, 0, 1);
      col = lerpV([200, 104, 58], [TEX.mars[tr], TEX.mars[tr + 1], TEX.mars[tr + 2]], fr);
      if (near && tt < 140){ var rip = Math.sin(gx * 1.3 + gz * 0.4 + noise3(gx * 0.2, 0, gz * 0.2) * 4), mott = noise3(gx * 0.35, 3, gz * 0.35);
        col = mul(col, 0.9 + rip * 0.05 + mott * 0.12);
        // scattered rocks: one maybe in each cell, placed anywhere in it and of its own size, so they never line up
        var rcx = Math.floor(gx / 1.7), rcz = Math.floor(gz / 1.7);
        for (var ri = -1; ri <= 1; ri++) for (var rj = -1; rj <= 1; rj++){ var ax2 = rcx + ri, az2 = rcz + rj; if (hash(ax2, az2, 31) > 0.16) continue;
          var rx = (ax2 + hash(ax2, az2, 32)) * 1.7, rz = (az2 + hash(ax2, az2, 33)) * 1.7, rr = 0.12 + hash(ax2, az2, 34) * 0.4, rd2 = Math.hypot(gx - rx, (gz - rz) * 1.2) / rr;
          if (rd2 < 1){ col = rd2 < 0.55 && (gx - rx) + (gz - rz) < 0 ? [150, 70, 40] : [92, 36, 20]; nn = norm(add(nn, mul(norm(V(gx - rx, 0.01, gz - rz)), 0.6 * rd2))); } }
        nn = norm(add(nn, mul(V(1.3, 0, 0.4), Math.cos(gx * 1.3 + gz * 0.4) * 0.12 * (1 - fr))));
        var cs2 = 11, cx2 = Math.floor(gx / cs2), cz2 = Math.floor(gz / cs2);
        for (di = -1; di <= 1; di++) for (dj = -1; dj <= 1; dj++){ var hx2 = cx2 + di, hz2 = cz2 + dj; if (hash(hx2, hz2, 41) > 0.3) continue;
          var ccx2 = (hx2 + 0.2 + hash(hx2, hz2, 42) * 0.6) * cs2, ccz2 = (hz2 + 0.2 + hash(hx2, hz2, 43) * 0.6) * cs2, cr2 = cs2 * (0.2 + hash(hx2, hz2, 44) * 0.18), dd2 = Math.hypot(gx - ccx2, gz - ccz2) / cr2;
          if (dd2 < 1.25){ var tv3 = norm(V(gx - ccx2, 0, gz - ccz2)); if (dd2 < 1){ nn = norm(add(nn, mul(tv3, -0.7 * dd2))); if (dd2 < 0.45) col = [168, 78, 42]; } else nn = norm(add(nn, mul(tv3, 0.5 * (1.25 - dd2) * 4))); } } }
      return [col, nn]; }
    // the Moon
    var uvm = sphUV(ne), mi2 = Math.floor(uvm[0] * TEX.MW) % TEX.MW, mj = clamp(Math.floor(uvm[1] * TEX.MH), 1, TEX.MH - 2), mk = mj * TEX.MW + mi2, fade = clamp((tt - 25) / 60, 0, 1), al = lerp(1, TEX.ma[mk], fade), base = [200 * al, 197 * al, 190 * al];
    var dhx = TEX.mh[mj * TEX.MW + (mi2 + 1) % TEX.MW] - TEX.mh[mj * TEX.MW + (mi2 + TEX.MW - 1) % TEX.MW], dhy = TEX.mh[mk + TEX.MW] - TEX.mh[mk - TEX.MW];
    var east = norm(cross(V(0, 0, 1), ne)), north = cross(ne, east); nn = norm(sub(nn, add(mul(east, dhx * 60 * fade), mul(north, dhy * 60 * fade))));
    if (near){ for (lv = 0; lv < (tt < 70 ? 2 : 1); lv++){ var cs = lv ? 3.2 : 9, cx = Math.floor(gx / cs), cz = Math.floor(gz / cs);
        for (di = -1; di <= 1; di++) for (dj = -1; dj <= 1; dj++){ var hx = cx + di, hz = cz + dj; if (hash(hx, hz, 11 + lv) > 0.55) continue;
          var ccx = (hx + 0.2 + hash(hx, hz, 12 + lv) * 0.6) * cs, ccz = (hz + 0.2 + hash(hx, hz, 13 + lv) * 0.6) * cs, cr = cs * (0.25 + hash(hx, hz, 14 + lv) * 0.2), dd = Math.hypot(gx - ccx, gz - ccz) / cr;
          if (dd < 1.25){ var tv2 = norm(V(gx - ccx, 0, gz - ccz)); if (dd < 1){ nn = norm(add(nn, mul(tv2, -0.8 * dd))); if (dd < 0.4) base = [158, 155, 162]; } else nn = norm(add(nn, mul(tv2, 0.55 * (1.25 - dd) * 4))); } } } }
    if (tt > 30 && hash(Math.floor(pe[0] * 3), Math.floor(pe[2] * 3), 21) < 0.08) base = [176, 173, 168];
    return [base, nn]; }

  function render(t){
    var rk = rocketAt(t), cam = camAt(t, rk), sun = sunAt(t), f = norm(sub(cam.tg, cam.pos)), r = norm(cross(f, cam.up)), u = cross(r, f), foc = (W / 2) / Math.tan(cam.fov * Math.PI / 360);
    var GIF = !PLANETS[TOK].giant && !!PLANETS[FROMK].giant, GI = PLANETS[TOK].giant || PLANETS[FROMK].giant, GC = GI ? add(GIF ? CE : CM, GI.off) : null, GN = GI ? norm(V(0.25, 0.94, 0.22)) : null;
    var alt = len(sub(cam.pos, CE)) - Re, sky = FROMK === 'earth' ? smooth(alt / 260) : 1, padOn = alt < 120, altM = len(sub(cam.pos, CM)) - Rm, nearMoon = altM < 260,
      air = TOK === 'mars' || TOK === 'oz' ? 1 - smooth(altM / 90) : 0, upM = norm(sub(cam.pos, CM)), airF = FROMK === 'mars' ? 1 - smooth(alt / 90) : 0, upE = norm(sub(cam.pos, CE));
    var models = [];
    if (padOn){ models.push([PAD, V(0, 0, 0), I3, 2], [TOWER, V(-3.6, 0, 0), I3, 3], [ARM, V(-2.4, 6.6, 0), I3, 3], [TANK, V(4.2, 0, -3.4), I3, 4], [TANK, V(5.6, 0, -0.8), I3, 4]);
      if (FROMK === 'earth') trees.forEach(function(p){ models.push([TREE, p, I3, 5]); }); }
    models.push([VEH, rk.p, rk.M, 1]);
    // where each model can be on the screen: its box's eight corners, projected; a corner behind the camera means anywhere
    models.forEach(function(Mo){ var m = Mo[0], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
      for (var c = 0; c < 8; c++){ var lc = V(m.o[0] + (c & 1 ? m.nx * m.vs : 0), m.o[1] + (c & 2 ? m.ny * m.vs : 0), m.o[2] + (c & 4 ? m.nz * m.vs : 0)), wc = add(Mo[1], mv(Mo[2], lc)), rel = sub(wc, cam.pos), z = dot(rel, f);
        if (z < 0.05){ behind = true; break; } var sx = W / 2 + dot(rel, r) * foc / z, sy = H / 2 - dot(rel, u) * foc / z; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
      Mo[5] = mtv(Mo[2], sub(cam.pos, Mo[1])); Mo[4] = behind ? [0, 0, W, H] : [Math.floor(x0) - 1, Math.floor(y0) - 1, Math.ceil(x1) + 1, Math.ceil(y1) + 1]; });
    models = models.filter(function(Mo){ var b = Mo[4]; return b[2] >= 0 && b[3] >= 0 && b[0] < W && b[1] < H; });
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++){
      var px2 = (x + 0.5 - W / 2) / foc, py2 = (H / 2 - y - 0.5) / foc, rd = norm(add(f, add(mul(r, px2), mul(u, py2)))), best = 1e12, col = null, n = null, id = 0, o2 = (y * W + x) * 4;
      // the planets
      var te = hitSphere(cam.pos, rd, CE, Re); if (te > 0 && te < best){ best = te; id = 6; var se = surf(FROMK, cam.pos, rd, te, CE, alt < 120); col = se[0]; n = se[1];
        if (FROMK === 'earth' && alt > 60 && dot(n, sun) < -0.1) col = mul(col, 0.35); }
      var tm = hitSphere(cam.pos, rd, CM, Rm); if (tm > 0 && tm < best){ best = tm; id = 7; var sm2 = surf(TOK, cam.pos, rd, tm, CM, nearMoon); col = sm2[0]; n = sm2[1]; }
      // a giant in the sky (Saturn): its cloud bands, and its rings, a flat band of ice round it with the Cassini gap in it
      if (GI && (GIF ? altM > 900 : alt > 160)){ var tg = hitSphere(cam.pos, rd, GC, GI.R); if (tg > 0 && tg < best){ best = tg; id = 8; var pg = add(cam.pos, mul(rd, tg)), ng = norm(sub(pg, GC)), lat = dot(ng, GN);
          var bi = Math.floor((lat + 1) * 9 + noise3(ng[0] * 3, ng[1] * 3, ng[2] * 3) * 1.4) % GI.band.length; col = hex(GI.band[(bi + GI.band.length) % GI.band.length]); n = ng; }
        var dn = dot(rd, GN); if (Math.abs(dn) > 1e-4){ var tr = dot(sub(GC, cam.pos), GN) / dn; if (tr > 0 && tr < best){ var pr = add(cam.pos, mul(rd, tr)), rr = len(sub(pr, GC)) / GI.R;
            if (rr > 1.3 && rr < 2.3 && !(rr > 1.92 && rr < 1.99)){ best = tr; id = 8; var rk2 = noise3(rr * 30, 0, 0); col = rr < 1.55 ? [160, 140, 120] : rr < 1.92 ? (rk2 > 0.5 ? [236, 222, 196] : [214, 196, 166]) : [200, 186, 168]; n = dot(GN, sun) > 0 ? GN : mul(GN, -1); } } } }
      // the voxel models
      for (var mi = 0; mi < models.length; mi++){ var Mo = models[mi], bx4 = Mo[4]; if (x < bx4[0] || x > bx4[2] || y < bx4[1] || y > bx4[3]) continue; var hv = hitVox(Mo[0], Mo[5], Mo[2], rd, best); if (hv && hv.t < best){ best = hv.t; id = Mo[3]; col = [hv.col >> 16 & 255, hv.col >> 8 & 255, hv.col & 255]; n = hv.n; } }
      var out;
      if (col){ out = shade(col, n, sun, id === 6 && alt > 60 ? 0.15 : 0.08);
        if (id === 6 && FROMK === 'earth' && alt > 30){ var rim = 1 - Math.abs(dot(n, mul(rd, -1))); if (rim > 0.75) out = lerpV(out, [127, 200, 255], (rim - 0.75) * 2.4); } }
      else { // the sky: blue low down, black above the air, the stars coming out as it darkens, and the Earth's thin blue rim
        var g = clamp(dot(rd, norm(sub(cam.pos, CE))) * 0.5 + 0.5, 0, 1); out = lerpV([150 + 40 * (1 - g), 200 + 20 * (1 - g), 255], [5, 7, 18], sky);
        if (sky > 0.25){ for (var si = 0; si < 0; si++); }
        if (air > 0){ var gm = clamp(dot(rd, upM), 0, 1); out = lerpV(out, TOK === 'oz' ? lerpV([196, 230, 255], [70, 150, 236], Math.sqrt(gm)) : lerpV([236, 182, 140], [176, 108, 80], Math.sqrt(gm)), air); }
        if (airF > 0){ var gf = clamp(dot(rd, upE), 0, 1); out = lerpV(out, lerpV([236, 182, 140], [176, 108, 80], Math.sqrt(gf)), airF); }
        var oc = sub(cam.pos, CE), bb = dot(oc, rd), dmin = Math.sqrt(Math.max(0, dot(oc, oc) - bb * bb)); if (FROMK === 'earth' && bb < 0 && dmin < Re * 1.05 && alt > 60){ var gl = 1 - (dmin - Re) / (Re * 0.05); out = lerpV(out, [110, 190, 255], clamp(gl, 0, 1) * 0.8); }
        best = 1e12; id = 0; }
      D[o2] = out[0]; D[o2 + 1] = out[1]; D[o2 + 2] = out[2]; D[o2 + 3] = 255; Z[y * W + x] = best; ID[y * W + x] = id; }
    // the stars, at infinity behind everything
    if (sky > 0.2 && air < 0.95) stars.forEach(function(s3){ var rel = s3, z = dot(rel, f); if (z <= 0) return; var sx = Math.round(W / 2 + dot(rel, r) * foc / z), sy = Math.round(H / 2 - dot(rel, u) * foc / z);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H || ID[sy * W + sx]) return; var b2 = (sky - 0.2) * (1 - air) * (1 - airF) * (0.5 + s3[3] * 0.6) * 255, oo = (sy * W + sx) * 4; D[oo] = Math.max(D[oo], b2); D[oo + 1] = Math.max(D[oo + 1], b2); D[oo + 2] = Math.max(D[oo + 2], b2 * (s3[3] > 0.85 ? 0.8 : 1)); });
    // the outline: one dark pixel round every model in front of whatever is behind it, as the courses are inked
    for (var y2 = 1; y2 < H - 1; y2++) for (var x2 = 1; x2 < W - 1; x2++){ var k2 = y2 * W + x2, idc = ID[k2]; if (idc === 0 || idc === 6 || idc === 7 || idc === 8) continue;
      var zc = Z[k2], edge = false, nb = [k2 - 1, k2 + 1, k2 - W, k2 + W];
      for (var q = 0; q < 4; q++){ var kk = nb[q]; if (ID[kk] !== idc && Z[kk] > zc * 1.04){ edge = true; break; } }
      if (edge){ var o3 = k2 * 4; D[o3] *= 0.32; D[o3 + 1] *= 0.3; D[o3 + 2] *= 0.36; } }
    // particles: smoke and vapour, the flame, moon dust, into the same depth
    parts.forEach(function(p){ var wp = p.lp ? add(rk.p, mv(rk.M, p.lp)) : p.p, rel = sub(wp, cam.pos), z = dot(rel, f); if (z < (p.kind === 'dust' ? 3 : 0.3)) return; var sx = W / 2 + dot(rel, r) * foc / z, sy = H / 2 - dot(rel, u) * foc / z, pr = p.r * foc / z;
      if (pr < 0.4 || sx < -pr || sy < -pr || sx > W + pr || sy > H + pr) return; var a = p.a;
      var ya = Math.max(0, Math.floor(sy - pr)), yb = Math.min(H - 1, sy + pr), xa = Math.max(0, Math.floor(sx - pr)), xb = Math.min(W - 1, sx + pr), pr2 = pr * pr;
      for (var yy = ya; yy <= yb; yy++) for (var xx = xa; xx <= xb; xx++){
        var ex = xx + 0.5 - sx, ey = yy + 0.5 - sy, dd2 = (ex * ex + ey * ey) / pr2; if (dd2 > 1 || Z[yy * W + xx] < z - p.r * 0.7) continue; var kk2 = (yy * W + xx) * 4, sh = dd2 < 0.3 ? 1 : 0.82;
        D[kk2] = lerp(D[kk2], p.c[0] * sh, a); D[kk2 + 1] = lerp(D[kk2 + 1], p.c[1] * sh, a); D[kk2 + 2] = lerp(D[kk2 + 2], p.c[2] * sh, a); } });
    bx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    return rk; }

  // ---- particles: the flame from the nozzle, smoke and vapour on the pad, dust on the Moon
  function emit(t, dt, rk){
    var down = mv(rk.M, V(0, -1, 0)), noz = add(rk.p, mv(rk.M, V(0, -0.75, 0)));
    function many(rate){ return Math.floor(rate * dt + Math.random()); }
    if (rk.burn){ for (var e = 0, ne2 = many(rk.retro ? 260 : 420); e < ne2; e++){ var j = V((hash(e, t * 1e3, 1) - 0.5) * 0.5, 0, (hash(e, t * 1e3, 2) - 0.5) * 0.5), sp = 6 + hash(e, t * 1e3, 3) * 8;
      parts.push({ lp:V(j[0], -0.8, j[2]), lv:V(j[0] * 2, -sp, j[2] * 2), r:0.42, life:0.32, age:0, kind:'fire', c:[255, 255, 230], a:1 }); } }
    if (FROMK === 'earth' && t < 2.35 && Math.floor(t * 12) !== Math.floor((t - dt) * 12)) parts.push({ p:V(-2.4 + hash(t, 1, 1), 6.2, (hash(t, 2, 1) - 0.5)), v:V(1.2, 0.6, 0.4), r:0.3, life:1.2, age:0, kind:'vapour', c:[245, 248, 252], a:0.8 });
    if (t > 2.3 && t < 4.6){ for (var s = 0, ns = many(90); s < ns; s++){ var an = hash(s, t * 1e3, 7) * 6.283, spd = 4 + hash(s, t * 1e3, 8) * 6;
      parts.push({ p:V(Math.cos(an) * 1.2, 0.6, Math.sin(an) * 1.2), v:V(Math.cos(an) * spd, 0.4 + hash(s, t, 9) * 1.2, Math.sin(an) * spd), r:0.9, life:3, age:0, kind:'smoke', c:FROMK === 'moon' ? [190, 188, 184] : FROMK === 'mars' ? [214, 150, 112] : FROMK === 'saturn' ? [220, 222, 240] : FROMK === 'crystara' ? [210, 240, 255] : [232, 232, 238], a:0.85 }); } }
    if (rk.trouble || (rk.crashed && t < DUR)){ var pod = add(rk.p, mv(rk.M, V(1.55, rk.crashed ? 1.8 : 0.2, 0))), nsm = many(rk.crashed ? 4 : 26);
      for (var sm2 = 0; sm2 < nsm; sm2++){ var sj = V((hash(sm2, t * 1e3, 41) - 0.5) * 0.6, (hash(sm2, t * 1e3, 42) - 0.5) * 0.6, (hash(sm2, t * 1e3, 43) - 0.5) * 0.6);
        parts.push({ p:add(pod, sj), v:rk.crashed ? V(sj[0], -1.2, sj[2]) : mul(sj, 3), r:0.3, life:rk.crashed ? 2.0 : 1.4, age:0, kind:'puff', c:rk.crashed ? [206, 208, 216] : [168, 170, 182], a:0.75 }); } }
    if (CRASH && t > 9.0 && t < 9.5){ for (var pe2 = 0, npe = many(60); pe2 < npe; pe2++){ var pa = hash(pe2, t * 1e3, 47) * 6.283, ps = 2 + hash(pe2, t * 1e3, 48) * 6;
      parts.push({ p:V(Math.cos(pa) * 1.2, HM - 0.2, Math.sin(pa) * 1.2), v:V(Math.cos(pa) * ps, -1.5 - hash(pe2, t, 49) * 2.5, Math.sin(pa) * ps), r:0.16, life:1.4, age:0, kind:'petal', c:hash(pe2, t, 50) < 0.7 ? [232, 38, 42] : [90, 160, 60], a:0.9 }); } }
    if (t > 8.7 && t < 9.4 && !CRASH){ for (var d = 0, nd = many(70); d < nd; d++){ var a2 = hash(d, t * 1e3, 17) * 6.283, s2 = 3 + hash(d, t * 1e3, 18) * 5;
      parts.push({ p:V(Math.cos(a2) * 0.8, HM - 0.15, Math.sin(a2) * 0.8), v:V(Math.cos(a2) * s2, -0.6 - hash(d, t, 19), Math.sin(a2) * s2), r:0.35, life:1.5, age:0, kind:'dust', c:TOK === 'mars' ? [206, 122, 80] : TOK === 'saturn' ? [230, 236, 250] : TOK === 'crystara' ? [200, 240, 255] : TOK === 'jellara' ? [255, 190, 230] : [196, 192, 184], a:0.7 }); } }
    parts.forEach(function(p){ p.age += dt; if (p.lp) p.lp = add(p.lp, mul(p.lv, dt)); else p.p = add(p.p, mul(p.v, dt)); var k = p.age / p.life;
      if (p.kind === 'fire'){ p.c = k < 0.25 ? [255, 255, 220] : k < 0.5 ? [255, 214, 80] : k < 0.75 ? [255, 140, 40] : [200, 70, 30]; p.r = 0.4 + k * 0.5; }
      else if (p.kind === 'smoke'){ p.v = mul(p.v, 1 - dt * 0.9); p.r = 0.9 + k * 3.2; p.a = 0.85 * (1 - k); }
      else if (p.kind === 'puff'){ p.v = mul(p.v, 1 - dt * 0.8); p.r = 0.3 + k * 1.6; p.a = 0.75 * (1 - k); }
      else if (p.kind === 'petal'){ p.v = mul(p.v, 1 - dt * 2); p.a = 0.9 * (1 - k); }
      else if (p.kind === 'dust'){ p.v = mul(p.v, 1 - dt * 1.4); p.r = 0.35 + k * 1.1; p.a = 0.7 * (1 - k); }
      else { p.r = 0.3 + k * 0.8; p.a = 0.8 * (1 - k); } });
    parts = parts.filter(function(p){ return p.age < p.life; }); if (parts.length > 700) parts.splice(0, parts.length - 700); }

  // the countdown, painted big over the picture
  function overlay(t){ if (CRASH && t > 6.0 && t < 7.3){ var s9 = cv.width / 390; ctx.font = 'bold ' + Math.round(54 * s9) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center';
      var wob = Math.sin(t * 18) * 4 * s9; ctx.lineWidth = 6 * s9; ctx.strokeStyle = '#1a1018'; ctx.strokeText('UH OH!', cv.width / 2 + wob, cv.height * 0.22); ctx.fillStyle = '#ffd84a'; ctx.fillText('UH OH!', cv.width / 2 + wob, cv.height * 0.22); }
    if (t >= 2.6) return; var s = cv.width / 390; ctx.font = 'bold ' + Math.round(64 * s) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center';
    var txt = t < 0.8 ? '3' : t < 1.6 ? '2' : t < 2.3 ? '1' : 'LIFTOFF'; ctx.lineWidth = 6 * s; ctx.strokeStyle = '#1a1018'; ctx.strokeText(txt, cv.width / 2, cv.height * 0.24); ctx.fillStyle = '#ffffff'; ctx.fillText(txt, cv.width / 2, cv.height * 0.24); }

  if (o.still) return { at:function(t){ parts = []; for (var e = Math.max(0, t - 2.5); e < t; e += 1 / 30){ emit(e, 1 / 30, rocketAt(e)); } var rk = render(t); overlay(t); if (t > 9.4) wrap.classList.add('cap'); return rk; }, close:finish, cam:function(t){ var rk = rocketAt(t); return { rk:rk, cam:camAt(t, rk) }; } };
  if (reduce){ render(10.2); wrap.classList.add('cap'); setTimeout(finish, 1600); return; }
  var last = 0;
  // a bad frame ends the trip early: it never strands the player on a black screen
  function frame(now){ if (done) return; try{ step(now); }catch(e){ return finish(); } if (!done) requestAnimationFrame(frame); }
  function step(now){ if (!t0) t0 = now; var t = (now - t0) / 1000, dt = Math.min(0.05, t - last); last = t;
    var a = performance.now(), rk = render(t); emit(t, dt, rk); overlay(t); var fe = performance.now() - a; ftime += fe; frames++;
    if (frames > 4){ slow += fe; slowN++; if (slowN >= 15){ if (slow / slowN > 22 && W > 104) setRes(Math.max(104, Math.round(W * 0.86))); slow = 0; slowN = 0; } }
    var bk = Math.floor(t); hist[bk] = (hist[bk] || 0) + fe; histn[bk] = (histn[bk] || 0) + 1;
    if (t > 9.4) wrap.classList.add('cap'); if (t > DUR) finish(); }
  requestAnimationFrame(frame);
  var hist = [], histn = [];
  return { stats:function(){ return { frames:frames, ms:frames ? ftime / frames : 0, W:W, per:hist.map(function(v, i){ return Math.round(v / histn[i]); }) }; }, at:function(t){ var rk = render(t); overlay(t); return rk; } };
}

// ================================================================ THE SEA ROUTE (the Odyssey, Worlds 18 on)
/* BY SEA (the owner's brief for Cyclops Isle: "from Oz, a Greek ship (a single square sail and oars) sails out and Poseidon
   sends a storm (waves, rain, lightning). It reaches the Cyclops' island"). The Odyssey's islands are reached by ship, the
   way the space route is reached by rocket: sail(host, o, cb) plays one leg, from the shore o.from to the island o.to. The
   sea, the sky and the land are warped noise, never a facet or a grid. The ship is a voxel model like the rocket: a dark
   hull with an eye painted on its bow (Greek ships carried one), a single square sail on one mast and a bank of oars a side.

   ISLES says what each island looks like and what happens on the way (storm: Poseidon rises and the storm comes and goes).
   A later island adds a row here and nothing else. SHORES is where a leg can leave from that is not an island (Oz). */
var ISLES = {
  // Cyclops Isle: a green island of sheep and olive trees on a ring of pale sand, a grey crag with the Cyclops' cave in it
  cyclops:{ sand:[232, 214, 160], low:[118, 160, 72], high:[92, 128, 58], rock:[150, 144, 132], storm:true, cave:true, sheep:true,
    hills:[[4, -14, -100, 40, 30, 32, 'land'], [-22, -10, -92, 22, 20, 20, 'land'], [16, -6, -80, 12, 18, 11, 'crag']] },
  /* Medusa's Isle: a rocky grey island, dry grass on its slopes, a ruined white temple on its crown and the grey statues of
     earlier visitors along its shore. Its sea is calm: no storm, but a bank of sea mist with tall sea stacks standing in it, and
     Athena's owl flies ahead of the ship to lead it through (mist, stacks, owl). The island shows once the mist thins. */
  medusa:{ sand:[178, 172, 160], low:[150, 150, 112], high:[126, 128, 98], rock:[160, 156, 148], mist:true, owl:true, temple:true, statues:true,
    stacks:[[-11, -5, -24, 2, 11, 1.8, 'crag'], [12, -5, -34, 1.8, 13, 2, 'crag'], [-12.5, -5, -45, 2.2, 10, 1.8, 'crag'], [10.5, -5, -54, 2, 12, 2, 'crag'], [-16, -4, -60, 1.6, 8, 1.6, 'crag']],
    hills:[[2, -14, -102, 40, 30, 30, 'crag'], [-24, -10, -94, 22, 18, 20, 'land'], [20, -8, -86, 14, 16, 12, 'land']] },
  /* The Underworld: Homer's way to the dead (Odyssey 11). The ship runs on to the stream of Ocean, a band of pale swift water across
     the sea, and past it into the land of the Cimmerians, where the sun never comes: the sky goes dark violet and a grey mist rolls
     over the water (dark, ocean, mist). The shore is black shingle under grey meadows and dark rock, pale shades of the dead stand
     along it, a cave mouth opens in the crag, and Charon's small dark skiff waits off the shore, his lantern lit (charon). */
  underworld:{ sand:[44, 42, 52], low:[74, 86, 80], high:[58, 66, 70], rock:[64, 62, 80], dark:true, ocean:true, mist:true, shades:true, cave:true, charon:true,
    hills:[[2, -14, -102, 40, 28, 30, 'crag'], [-24, -10, -94, 22, 18, 20, 'land'], [20, -8, -86, 14, 16, 12, 'land']] },
  /* Olympus: the last leg of the Odyssey rises. The ship sails out of the dark of the dead into the dawn (Homer's rosy-fingered
     Dawn: the sky goes from violet to rose and gold, then to day), and Iris' rainbow comes down to the sea ahead of it. The ship
     rides the rainbow up out of the sea, through a deck of soft cloud, and comes to rest on the top of the gods' mountain, where
     the white halls of the gods stand above the clouds (dawn, rise, halls). The mountain is pale rock in warped noise, its flanks
     ringed with cloud. */
  olympus:{ sand:[226, 220, 206], low:[110, 158, 86], high:[150, 170, 110], rock:[168, 160, 148], dawn:true, rise:true, halls:true,
    hills:[[0, -26, -86, 26, 44, 22, 'crag'], [-28, -22, -110, 20, 48, 16, 'crag'], [27, -18, -106, 16, 42, 14, 'crag'], [-1, 13.2, -93, 8, 6.2, 4.4, 'halls']] }
};
var SHORES = {
  // Oz: the green land of meadows behind, red poppy fields running through it
  oz:{ low:[86, 160, 60], high:[60, 130, 48], dot:[214, 36, 40], sand:[220, 196, 120], hills:[[0, -22, 44, 90, 26, 22, 'land'], [-40, -12, 36, 30, 16, 14, 'land']] }
};
/* THE GREEK SHIP, in its own frame: x across, y up, the bow toward -z. A long low hull of dark wood, black along the water,
   a red band under the gunwale, a ram at the bow and the stern curling up, an eye painted either side of the bow, one mast
   amidships with its yard and a square sail of cream linen with two red stripes, bellied forward by the wind. */
var GSHIP = (function(){ var vs = 0.125;
  return voxels(44, 54, 84, vs, [-2.75, -0.9, -5.25], function(x, y, z){
    var u = z / 4.6, w = 1.1 * Math.sqrt(Math.max(0, 1 - u * u)), bot = -0.55 + 0.45 * u * u, top = 0.75 + (z > 3 ? (z - 3) * (z - 3) * 0.9 : 0) + (z < -3.3 ? (-3.3 - z) * 0.5 : 0);
    // the mast, its yard and the sail
    if (Math.hypot(x, z + 0.2) < 0.14 && y > 0 && y < 5.7) return '#6a4426';
    if (y > 5.15 && y < 5.4 && Math.abs(z + 0.2) < 0.14 && Math.abs(x) < 2.5) return '#6a4426';
    var sz = -0.5 - 0.45 * (1 - (x / 2.3) * (x / 2.3)) * Math.sin(Math.PI * clamp((5.1 - y) / 2.9, 0, 1));
    if (Math.abs(x) < 2.3 && y > 2.2 && y < 5.1 && Math.abs(z - sz) < 0.11) return Math.abs(Math.abs(x) - 0.75) < 0.18 ? '#c8643a' : y > 4.95 ? '#d8ccaa' : '#f2ead2';
    // the stern post curling up and over
    if (z > 4.1 && z < 5.2 && Math.abs(x) < 0.16){ var cr = Math.hypot(z - 4.2, y - 2.3); if (cr > 0.55 && cr < 0.82 && !(z < 4.2 && y < 2.3)) return '#3a2414'; }
    // the ram at the bow, at the water
    if (z < -4.3 && z > -5.2 && Math.abs(x) < 0.22 && y > -0.45 && y < 0.05) return '#8a6a3a';
    if (z < -4.6 || z > 4.6 || Math.abs(x) > w || y < bot || y > top) return null;
    var shell = Math.abs(x) > w - 0.2 || y < bot + 0.2;
    if (!shell){ if (y > 0.35 && y < 0.5) return '#9a7044'; if (Math.abs(y - 0.95) < 0.12 && Math.abs(((z + 9) % 0.75) - 0.37) < 0.12) return '#6a4426'; return null; }   // the deck and the rowers' benches
    // the eye on the bow, both sides
    var ex = z + 3.55, ey = y - 0.25, er = Math.hypot(ex, ey * 1.3); if (er < 0.42) return er < 0.16 ? '#14100c' : er < 0.3 ? '#3a6ad0' : '#f6f0e0';
    if (y > top - 0.22) return '#b84a2a';
    if (y < 0.05) return '#1e1814';
    return Math.abs(((y + 4) % 0.32) - 0.16) < 0.035 ? '#4a2e1a' : '#5e3c22'; }); })();
// a bank of seven oars, out from the gunwale and down to the water, its blade at the end (one side; the other is it turned)
var OARS = voxels(28, 14, 50, 0.125, [0, -1.25, -3.1], function(x, y, z){
  for (var k = 0; k < 7; k++){ var zc = -2.6 + k * 0.78, t = x / 3.2, oy = 0.2 - t * 1.25, oz = zc;
    if (Math.abs(z - oz) < 0.09 && Math.abs(y - oy) < 0.09 && x < 2.6) return '#8a6234';
    if (x > 2.5 && x < 3.3 && Math.abs(z - oz) < 0.22 && Math.abs(y - (0.2 - t * 1.25)) < 0.07) return '#b8884a'; }
  return null; });
/* POSEIDON, god of the sea, risen to the waist out of it: tanned and broad, a wild mane and a long curling beard of sea green,
   bright eyes under heavy brows, his golden trident held high in his right hand. Stern, never fierce, and he is gone again
   once the storm has blown. From Homer and the vase painters: no fish tail, no crown of shells. */
var POSEIDON = (function(){ var vs = 0.6, K = 1.6;   // built at K times the size it is drawn in below
  return voxels(60, 66, 20, vs * K, [-18 * K, -3 * K, -6 * K], function(x, y, z){ x /= K; y /= K; z /= K;
    var hair = function(){ return hash(Math.round(x * 2), Math.round(y * 2), Math.round(z * 2)) > 0.6 ? '#2a8a78' : (y > 23 ? '#5ad0b4' : '#3ab89a'); };
    // the trident: a golden shaft, a cross bar and three prongs
    if (Math.hypot(x - 12.5, z) < 0.55 && y > 4 && y < 34) return y > 30.5 ? '#f2d060' : '#e2b23b';
    if (y > 30 && y < 31 && Math.abs(x - 12.5) < 2.6 && Math.abs(z) < 0.55) return '#e2b23b';
    for (var pr = -1; pr <= 1; pr++){ var px = 12.5 + pr * 2.2, ty = pr ? 34.2 : 36; if (Math.hypot(x - px, z) < 0.5 && y > 30 && y < ty) return '#f2d060'; if (Math.abs(x - px) < 0.9 - (y - ty + 1) * 0.6 && y > ty - 1 && y < ty + 0.6 && Math.abs(z) < 0.5) return '#fff2a0'; }
    // the raised right arm and its hand round the shaft, the left arm down into the sea
    var ra = function(ax, ay, bx, by, r){ var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1); return Math.hypot(x - ax - dx * t, y - ay - dy * t, z) < r; };
    if (Math.hypot(x - 12.5, y - 22, z) < 1.6) return '#c88a5a';
    if (ra(6.5, 14, 11.5, 21.5, 1.6)) return '#d8a070';
    if (ra(-6.5, 14, -9, 2, 1.7)) return '#d0986a';
    // the head: a face in front, the mane all round it and behind
    var hx = x, hy = y - 20.5, hz = z, hd = Math.hypot(hx / 3.6, hy / 4.2, hz / 3.6);
    if (hd < 1){ if (hz > 1.2 && Math.abs(hx) < 2.9 && hy > -2.6 && hy < 2.6){
        if (Math.abs(hy - 0.6) < 0.5 && Math.abs(Math.abs(hx) - 1.35) < 0.65) return Math.abs(Math.abs(hx) - 1.35) < 0.3 && hy < 0.85 ? '#1a3a5a' : '#ffffff';   // the eyes
        if (hy > 1.3 && hy < 2.0 && Math.abs(hx) > 0.5 && Math.abs(hx) < 2.4) return '#1e6a5a';                                        // the brows
        if (Math.abs(hx) < 0.45 && hy > -1.1 && hy < 0.6) return '#c08050';                                                             // the nose
        if (hy < -1.2) return hair();                                                                                                     // the beard begins
        return '#d8a070'; }
      return hair(); }
    var mane = Math.hypot(hx / 5.2, (hy - 0.6) / 5.4, (hz + 0.8) / 4.6) + (noise3(x * 0.5, y * 0.5, z * 0.5) - 0.5) * 0.35; if (mane < 1 && hz < 2.2) return hair();
    // the beard: long and curling, down over the chest
    var by = y - 14.5, bw = 2.9 - Math.max(0, -by) * 0.18 + Math.sin(y * 1.3) * 0.3; if (by > -7.5 && by < 4.2 && Math.abs(x) < bw && z > 1.4 && z < 3.6) return hair();
    // the shoulders and chest, bare, with a sea green cloth over one shoulder
    var ch = Math.hypot(x / 8.4, (y - 9) / 7.5, z / 3.4); if (ch < 1 && y < 16.5){ if (x < 0 && (x + 9 - (y - 3) * 0.55) > 0 && (x + 9 - (y - 3) * 0.55) < 3) return '#1e8a8a'; return y < 2 ? '#2a7a8a' : '#d8a070'; }
    return null; }); })();

/* ATHENA'S OWL, the little owl of Athens: brown and speckled, a round head with two big yellow eyes, wings spread (two frames,
   up and down). It flies ahead of the ship to lead it through the mist to Medusa's Isle. */
/* CHARON'S SKIFF, the ferryman's boat as Virgil has it: small and dark, low in the water, Charon standing in the stern, an old man
   in a dark hooded cloak with a grey beard, his pole in his hands and a lantern at the bow. Plain and old, never a skeleton. */
var CHARON = voxels(24, 36, 48, 0.125, [-1.5, -0.4, -3], function(x, y, z){
  var u = z / 2.6, w = 0.75 * Math.sqrt(Math.max(0, 1 - u * u)), bot = -0.3 + 0.25 * u * u, top = 0.35 + (Math.abs(z) > 2 ? (Math.abs(z) - 2) * 0.6 : 0);
  if (Math.abs(x) < w && y > bot && y < top && z > -2.6 && z < 2.6){ if (Math.abs(x) < w - 0.12 && y > 0.05) return null; return y > top - 0.1 ? '#4a3428' : '#1a1210'; }
  var cz = 1.7; if (Math.hypot(x, z - cz) < 0.34 - (y - 0.3) * 0.06 && y > 0.1 && y < 2.4) return '#24222e';                       // the cloak
  if (Math.hypot(x, (y - 2.6) * 0.9, z - cz) < 0.28){ if (z < cz - 0.12 && y < 2.62 && y > 2.3 && Math.abs(x) < 0.16) return y < 2.42 ? '#b8b8c4' : '#c8b8a0'; return '#2e2c3c'; }   // the hood, face, beard
  if (Math.abs(x - 0.3) < 0.06 && Math.abs(z - cz + 0.1 + (y - 1.5) * 0.25) < 0.06 && y > 0 && y < 3.6) return '#6a5040';          // the pole
  if (Math.hypot(x, y - 0.9, z + 2.5) < 0.18) return '#ffd890'; if (Math.abs(x) < 0.04 && z > -2.6 && z < -2.4 && y > 0.3 && y < 0.8) return '#2a2830';   // the lantern
  return null; });
var OWL = [0, 1].map(function(fr){ return voxels(30, 14, 12, 0.17, [-2.55, -0.85, -1.02], function(x, y, z){ x /= 1.7; y /= 1.7; z /= 1.7;
  var b = Math.hypot(x / 0.42, (y - 0.2) / 0.5, z / 0.36); if (b < 1) return z < -0.2 && y > 0.25 && y < 0.5 && Math.abs(Math.abs(x) - 0.16) < 0.1 ? (Math.abs(Math.abs(x) - 0.16) < 0.04 ? '#1a1410' : '#ffd860') : z < -0.2 && Math.abs(x) < 0.05 && y > 0.12 && y < 0.25 ? '#d8a040' : (hash(Math.round(x * 12), Math.round(y * 12), 9) > 0.7 ? '#e8d8b8' : y > 0.35 ? '#a8865a' : '#8a6a44');
  var wy = fr ? 0.45 - Math.abs(x) * 0.35 : 0.1 + Math.abs(x) * 0.25; if (Math.abs(x) > 0.35 && Math.abs(x) < 1.45 && Math.abs(y - wy) < 0.07 && Math.abs(z) < 0.32 - Math.abs(x) * 0.12) return Math.sin(x * 14) > 0.4 ? '#c8a878' : '#8a6a44';
  return null; }); });
function sail(host, o, cb){
  o = o || {}; var ISL = ISLES[o.to]; if (!ISL) throw new Error('trip3d: no island ' + o.to);
  var FR = ISLES[o.from] || SHORES[o.from] || SHORES.oz;
  // leaving one island for the next, the island left behind lies astern of the ship (its row is drawn ahead of a ship arriving)
  if (ISLES[o.from]) FR = { low:FR.low, high:FR.high, sand:FR.sand, rock:FR.rock, hills:FR.hills.map(function(h){ return [h[0] * 0.8, h[1], 96 + h[2] * 0.5, h[3], h[4], h[5], h[6]]; }) };
  var MIST = !!ISL.mist, STK = ISL.stacks || [], DARK = !!ISL.dark, DAWN = !!ISL.dawn, RISE = !!ISL.rise;
  /* IRIS' RAINBOW (Olympus): a road of the rainbow's colours on an arc of a great circle (axis across, at x = 0), leaving the sea
     at RB.z0 and rising to its crest on the mountain's top at RB.z1, RB.y1 high. The ship rides it. */
  var RB = null; if (RISE){ var h0 = ISL.hills[0], z1 = h0[2] + 6, y1 = h0[1] + h0[4] * Math.sqrt(Math.max(0, 1 - Math.pow((z1 - h0[2]) / h0[5], 2))) + 0.2, z0 = -22, D0 = z0 - z1;
    RB = { z0:z0, z1:z1, y1:y1, R:(D0 * D0 + y1 * y1) / (2 * y1), w:2.1 }; RB.yc = y1 - RB.R; }
  // the road's height at z (the crest past z1 holds level), and its slope (dy/dz)
  function rbY(z){ if (!RB || z > RB.z0) return 0; var u = Math.max(0, z - RB.z1); return RB.yc + Math.sqrt(Math.max(0, RB.R * RB.R - u * u)); }
  function rbS(z){ if (!RB || z > RB.z0 || z < RB.z1) return 0; var u = z - RB.z1; return -u / Math.sqrt(Math.max(1e-6, RB.R * RB.R - u * u)); }
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var wrap = document.createElement('div'); wrap.className = 'pp-trip';
  wrap.innerHTML = '<canvas></canvas><div class="pp-tripcap"><i></i><b></b></div><small>Tap to skip</small>';
  wrap.querySelector('i').textContent = o.label || ''; wrap.querySelector('b').textContent = o.name || '';
  host.appendChild(wrap);
  var cv = wrap.querySelector('canvas'), cw = host.clientWidth || 390, ch = host.clientHeight || 844, dpr = Math.min(2, root.devicePixelRatio || 1);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  var W, H, buf = document.createElement('canvas'), bx, img, D, Z, ID, slow = 0, slowN = 0;
  function setRes(w){ W = w; H = Math.round(W * ch / cw); buf.width = W; buf.height = H; bx = buf.getContext('2d'); img = bx.createImageData(W, H); D = img.data; Z = new Float32Array(W * H); ID = new Int8Array(W * H); }
  setRes(150);
  var done = false, t0 = 0, DUR = 10.8, frames = 0, ftime = 0, STORM = !!ISL.storm, FLASH = STORM ? [3.55, 4.7, 5.8] : [];
  function finish(){ if (done) return; done = true; wrap.classList.add('out'); setTimeout(function(){ if (wrap.isConnected) wrap.remove(); cb && cb(); }, 350); }
  wrap.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); finish(); });

  // ---- the clock: how stormy it is, how far the ship has come, how it rides the waves
  function stormAt(t){ return STORM ? smooth((t - 2.3) / 1.1) * (1 - smooth((t - 6.2) / 1.2)) : 0; }
  // the sea mist (Medusa's Isle): it rolls in as the stacks come up and thins as the island comes in sight
  function mistAt(t){ return MIST ? smooth((t - 1.6) / 1.4) * (1 - smooth((t - 6.6) / 1.6)) * (DARK ? 0.6 : 1) : 0; }
  // the dark (the Underworld): past the stream of Ocean the sun goes, and it does not come back
  function darkAt(t){ return DARK ? smooth((t - 2.2) / 2.4) : DAWN ? 0.92 * (1 - smooth((t - 0.4) / 3.6)) : 0; }
  // the dawn (Olympus): rose and gold low in the sky as the dark lifts, gone to clear day by the time the ship is up
  function roseAt(t){ return DAWN ? Math.sin(Math.PI * clamp((t - 0.6) / 5.2, 0, 1)) : 0; }
  // the rainbow comes down to the sea ahead as the dawn comes
  function bowAt(t){ return RISE ? smooth((t - 1.4) / 1.6) : 0; }
  // the ship weaves between the stacks, a gentle S
  function swayAt(t){ return MIST && STK.length ? Math.sin(t * 0.9) * 2.6 * smooth(t / 2) * (1 - smooth((t - 7.5) / 1.5)) : 0; }
  function flashAt(t){ var f = 0; FLASH.forEach(function(ft){ var d = t - ft; if (d > 0 && d < 0.32) f = Math.max(f, d < 0.06 ? 1 : d < 0.12 ? 0.35 : d < 0.18 ? 0.8 : 1 - (d - 0.18) / 0.14); }); return f; }
  function zsAt(t){ if (RISE){ var ta = -RB.z0 / 6; if (t < ta) return -6 * t; var u = clamp((t - ta) / (9.6 - ta), 0, 1), m0 = 6 * (9.6 - ta) / (RB.z0 - RB.z1);
      return RB.z0 - (RB.z0 - RB.z1) * ((-2 * u * u * u + 3 * u * u) + m0 * (u * u * u - 2 * u * u + u)); }
    return t < 8 ? -6 * t : -(48 + 6 * (t - 8) - 0.95 * (t - 8) * (t - 8)); }
  function shipAt(t){ var s = stormAt(t), amp = 0.035 + s * 0.16, roll = Math.sin(t * 1.7) * amp, pitch = Math.sin(t * 1.25 + 1) * amp * 0.8, heave = Math.sin(t * 2.1) * (0.08 + s * 0.45);
    var M = mm([1, 0, 0, 0, Math.cos(pitch), -Math.sin(pitch), 0, Math.sin(pitch), Math.cos(pitch)], [Math.cos(roll), -Math.sin(roll), 0, Math.sin(roll), Math.cos(roll), 0, 0, 0, 1]);
    var row = t > 9.6 ? 0 : Math.sin(t * 3.2), zs = zsAt(t), p = V(swayAt(t), heave, zs), yaw = MIST && STK.length ? -Math.cos(t * 0.9) * 0.16 * smooth(t / 2) * (1 - smooth((t - 7.5) / 1.5)) : 0;
    if (yaw) M = mm(rotY(yaw), M);
    // on the rainbow the ship rides its road: lifted to it, its bow pitched up the climb, the waves left behind
    if (RISE && zs < RB.z0 + 0.5){ var on = smooth((RB.z0 + 0.5 - zs) / 1.5); p = V(p[0], lerp(heave, rbY(zs) + 0.25, on), zs); M = mm(rotX(Math.atan(-rbS(zs)) * on), M); }
    return { p:p, M:M, row:row, s:s }; }
  function poseAt(t){ return !STORM ? -80 : -74 + smooth((t - 2.2) / 1.1) * 66 - smooth((t - 6.0) / 1.1) * 70; }
  function camAt(t, sh){ var P = sh.p, a = smooth(t / 2.6), b = smooth((t - 6.8) / 2.4), isl = ISL.hills[0];
    var off = lerpV(lerpV(V(8.5, 3.4, -7), V(-6, 4.4, 11), a), V(3, 3.4, 13.5), b), tg0 = lerpV(add(P, V(0, 1.6, 0)), STORM ? add(P, V(15, 8, -30)) : add(P, V(0, 4.5, -12)), smooth((t - 2.2) / 1.2));
    var tg = lerpV(tg0, RISE ? V(-2, RB.y1 + 1.5, isl[2] - 4) : V(isl[0] * 0.5, 5, isl[2]), b), sk = sh.s * 0.25;
    if (RISE) off = lerpV(lerpV(off, V(2.5, 5.5, 15), smooth((t - 3.4) / 2)), V(8, 6, 10), smooth((t - 7.4) / 2.2));   // up the rainbow from behind, then a step to the side to see the halls
    return { pos:add(add(P, off), V(Math.sin(t * 23) * sk, Math.sin(t * 29) * sk, 0)), tg:tg, up:V(Math.sin(t * 1.3) * sh.s * 0.05, 1, 0), fov:58 }; }
  var sun = norm(V(-0.5, 0.65, 0.55)), CLY = 8;

  // ---- the land: each hill an ellipsoid half sunk in the sea, painted by height and warped noise
  function hitEll(ro, rd, h){ var sx = h[3], sy = h[4], sz = h[5], o2 = V((ro[0] - h[0]) / sx, (ro[1] - h[1]) / sy, (ro[2] - h[2]) / sz), d2 = V(rd[0] / sx, rd[1] / sy, rd[2] / sz);
    var a = dot(d2, d2), b = dot(o2, d2), c = dot(o2, o2) - 1, q = b * b - a * c; if (q < 0) return -1; q = Math.sqrt(q); var t1 = (-b - q) / a; return t1 > 0 ? t1 : -1; }
  function landCol(L, h, p, isle){ var n = norm(V((p[0] - h[0]) / (h[3] * h[3]), (p[1] - h[1]) / (h[4] * h[4]), (p[2] - h[2]) / (h[5] * h[5]))), y = p[1];
    var w = fbm([p[0] * 0.06, y * 0.06, p[2] * 0.06], 3), q = fbm([p[0] * 0.14 + w * 3, y * 0.1, p[2] * 0.14 - w * 3], 2), col;
    n = norm(add(n, V((q - 0.5) * 0.8, 0, (w - 0.5) * 0.8)));
    if (h[6] === 'crag'){ col = lerpV(L.rock || [150, 144, 132], [196, 190, 176], smooth((q - 0.45) / 0.3));
      if (isle && L.cave && n[2] > 0.55 && y < 6.5 && Math.abs(p[0] - h[0] + 1) < 4 - y * 0.35) col = [28, 22, 20];   // the cave's mouth
      else if (q > 0.62) col = lerpV(col, L.high, 0.5); }
    else { var sandy = y < 1.3 + (w - 0.5) * 1.6; col = sandy ? (y < 0.35 ? lerpV(L.sand, [180, 160, 110], 0.5) : L.sand) : lerpV(L.low, L.high, smooth((y - 3 + (q - 0.5) * 8) / 8));
      if (!sandy && q > 0.66) col = lerpV(col, [56, 92, 44], 0.6);                                                       // olive groves
      if (!sandy && L.dot && w > 0.58) col = lerpV(col, L.dot, 0.75);                                                    // Oz's poppies
      if (!sandy && isle && L.sheep && q < 0.6){ var scx = Math.floor(p[0] / 2.4), scz = Math.floor(p[2] / 2.4);   // sheep grazing, a few to a hillside
        if (hash(scx, scz, 71) > 0.8 && Math.hypot(p[0] - (scx + 0.3 + hash(scx, scz, 72) * 0.4) * 2.4, (p[2] - (scz + 0.3 + hash(scx, scz, 73) * 0.4) * 2.4) * 0.7) < 0.6) col = [246, 242, 230]; }
      if (!sandy && y > 6 && q < 0.4) col = lerpV(col, L.rock || [150, 144, 132], 0.6);
      if (isle && L.statues && y < 3.2 && y > 0.8){ var tcx = Math.floor(p[0] / 3), tcz = Math.floor(p[2] / 3);   // grey statues along the shore
        if (hash(tcx, tcz, 74) > 0.78 && Math.hypot(p[0] - (tcx + 0.5) * 3, (p[2] - (tcz + 0.5) * 3) * 0.7) < 0.5) col = [196, 192, 184]; }
      if (isle && L.shades && y < 3.4 && y > 0.6){ var hcx = Math.floor(p[0] / 2.6), hcz = Math.floor(p[2] / 2.6);   // the pale shades of the dead along the shore
        if (hash(hcx, hcz, 75) > 0.8 && Math.hypot(p[0] - (hcx + 0.5) * 2.6, (p[2] - (hcz + 0.5) * 2.6) * 0.7) < 0.45) col = [222, 224, 244]; } }
    if (h[6] === 'halls'){ var hy2 = h[1] + h[4], cx3 = (p[0] - h[0] + 9) / 1.15;   // the halls of the gods: white columns under a gold roof
      return [y > hy2 - 1.6 ? (y > hy2 - 0.5 ? [255, 226, 120] : [236, 196, 90]) : (Math.abs(cx3 - Math.round(cx3)) < 0.24 ? [252, 250, 244] : [168, 164, 160]), n]; }
    if (L.rise && h[6] === 'crag'){ col = lerpV(L.rock, [222, 216, 204], smooth((q - 0.4) / 0.35)); if (y < 7 && w > 0.5) col = lerpV(col, L.low, 0.7); else if (y < 12 && q < 0.42) col = lerpV(col, L.high, 0.55);
      if (y > h[1] + h[4] - 7 && w > 0.56) col = lerpV(col, [248, 250, 255], 0.8); }                                     // pale rock, green low on the flanks, snow in the hollows near the top
    if (isle && L.rise && y > 5 && y < 11){ var cr = fbm([p[0] * 0.08 + 3, y * 0.2, p[2] * 0.08], 3), ck = smooth((cr - 0.42) / 0.18) * (1 - Math.abs(y - 8) / 3);   // a ring of cloud round the flanks
      if (ck > 0) col = lerpV(col, y > 8 ? [252, 252, 255] : [200, 212, 232], clamp(ck * 1.4, 0, 1)); }
    if (isle && L.temple && h === ISL.hills[0] && y > h[1] + h[4] - 4.5 && Math.abs(p[0] - h[0]) < 6.5){   // the ruined temple on the crown: columns and a white floor
      col = (Math.floor((p[0] - h[0] + 7) / 1.3) % 2 && y < h[1] + h[4] - 0.9) ? [236, 232, 224] : [206, 202, 192]; }
    return [col, n]; }
  function render(t){
    var sh = shipAt(t), cam = camAt(t, sh), f = norm(sub(cam.tg, cam.pos)), r = norm(cross(f, cam.up)), u = cross(r, f), foc = (W / 2) / Math.tan(cam.fov * Math.PI / 360);
    var s = sh.s, fl = flashAt(t), mi = mistAt(t), vis = lerp(lerp(520, 42, s), 24, mi), isl = STK.length ? ISL.hills.concat(STK) : ISL.hills, fro = FR.hills.map(function(h){ return h; }), zs = sh.p[2], sp = poseAt(t);
    var skyTop = lerpV([96, 166, 236], [34, 40, 54], s), skyLow = lerpV([196, 226, 250], [86, 94, 106], s), horizon = lerpV([170, 206, 232], [70, 78, 90], s);
    if (mi){ skyTop = lerpV(skyTop, [196, 206, 214], mi * 0.7); skyLow = lerpV(skyLow, [226, 230, 232], mi * 0.8); horizon = lerpV(horizon, [214, 220, 224], mi * 0.85); }
    var dk = darkAt(t); if (dk){ skyTop = lerpV(skyTop, [16, 14, 34], dk); skyLow = lerpV(skyLow, [62, 58, 92], dk * 0.92); horizon = lerpV(horizon, [56, 52, 84], dk * 0.92); }
    var ro = roseAt(t), bw = bowAt(t); if (ro){ skyLow = lerpV(skyLow, [246, 176, 150], ro * 0.75); horizon = lerpV(horizon, [252, 206, 150], ro * 0.8); skyTop = lerpV(skyTop, [120, 110, 170], ro * 0.3); }
    if (fl){ skyTop = lerpV(skyTop, [170, 180, 230], fl * 0.5); skyLow = lerpV(skyLow, [200, 206, 236], fl * 0.5); horizon = lerpV(horizon, [150, 156, 180], fl * 0.4); }
    var shipM = sh.M, oA = sh.row * 0.32, oL = Math.sin(t * 3.2 + 1.57) * 0.14;
    var models = [[GSHIP, sh.p, shipM, 1], [OARS, add(sh.p, mv(shipM, V(1.0, 0.55, 0))), mm(shipM, mm(rotY(oA), [Math.cos(oL), -Math.sin(oL), 0, Math.sin(oL), Math.cos(oL), 0, 0, 0, 1])), 2],
      [OARS, add(sh.p, mv(shipM, V(-1.0, 0.55, 0))), mm(shipM, mm(rotY(Math.PI - oA), [Math.cos(oL), -Math.sin(oL), 0, Math.sin(oL), Math.cos(oL), 0, 0, 0, 1])), 2]];
    if (sp > -60) models.push([POSEIDON, V(40, sp, zs - 56), rotY(-0.62), 3]);
    if (ISL.owl){ var ow = Math.sin(t * 7) > 0 ? 0 : 1, ox = Math.sin(t * 0.9 + 0.8) * 2.6 * smooth(t / 2), oy = 5.6 + Math.sin(t * 2.3) * 0.35, oz = zs - 9 - smooth((t - 7.5) / 2) * 20;
      models.push([OWL[ow], V(ox, oy, oz), rotY(Math.sin(t * 0.9) * 0.3), 3]); }
    if (ISL.charon && t > 5){ var chz = ISL.hills[0][2] + ISL.hills[0][5] * 0.92 + 4, bob = Math.sin(t * 1.4) * 0.06; models.push([CHARON, V(9 - (t - 5) * 0.35, bob, chz), rotY(-0.5), 3]); }
    models.forEach(function(Mo){ var m = Mo[0], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false;
      for (var c = 0; c < 8; c++){ var lc = V(m.o[0] + (c & 1 ? m.nx * m.vs : 0), m.o[1] + (c & 2 ? m.ny * m.vs : 0), m.o[2] + (c & 4 ? m.nz * m.vs : 0)), wc = add(Mo[1], mv(Mo[2], lc)), rel = sub(wc, cam.pos), z = dot(rel, f);
        if (z < 0.05){ behind = true; break; } var sx = W / 2 + dot(rel, r) * foc / z, sy = H / 2 - dot(rel, u) * foc / z; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
      Mo[5] = mtv(Mo[2], sub(cam.pos, Mo[1])); Mo[4] = behind ? [0, 0, W, H] : [Math.floor(x0) - 1, Math.floor(y0) - 1, Math.ceil(x1) + 1, Math.ceil(y1) + 1]; });
    models = models.filter(function(Mo){ var b = Mo[4]; return b[2] >= 0 && b[3] >= 0 && b[0] < W && b[1] < H; });
    var amp = 0.35 + s * 1.4, tw = t * 1.6;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++){
      var px2 = (x + 0.5 - W / 2) / foc, py2 = (H / 2 - y - 0.5) / foc, rd = norm(add(f, add(mul(r, px2), mul(u, py2)))), best = 1e12, col = null, n = null, id = 0, o2 = (y * W + x) * 4, k, out;
      // the land, ahead and behind
      for (k = 0; k < isl.length + fro.length; k++){ var hh = k < isl.length ? isl[k] : fro[k - isl.length], th = hitEll(cam.pos, rd, hh); if (th > 0 && th < best){ var ph = add(cam.pos, mul(rd, th)); if (ph[1] < 0) continue;
          var lc2 = landCol(k < isl.length ? ISL : FR, hh, ph, k < isl.length); best = th; col = lc2[0]; n = lc2[1]; id = k < isl.length ? 6 : 5; } }
      // the sea
      if (rd[1] < -1e-4){ var ts = -cam.pos[1] / rd[1]; if (ts > 0 && ts < best){ var pw = add(cam.pos, mul(rd, ts)), wx = pw[0], wz = pw[2];
          var wp = fbm([wx * 0.035, t * 0.05, wz * 0.035], 2), a1 = wx * 0.7 + wz * 0.45 + wp * 9 - tw * 1.4, a2 = wx * -0.38 + wz * 0.85 + wp * 7 - tw * 1.1;
          var gx = (Math.cos(a1) * 0.7 - Math.cos(a2) * 0.38 * 0.8) * amp * 0.3, gz = (Math.cos(a1) * 0.45 + Math.cos(a2) * 0.85 * 0.8) * amp * 0.3;
          n = norm(V(-gx, 1, -gz)); var crest = Math.sin(a1) + Math.sin(a2) * 0.8 + (noise3(wx * 1.3, t * 0.7, wz * 0.5) - 0.5) * 0.7;
          col = lerpV(lerpV([24, 96, 168], [52, 140, 200], smooth((wp - 0.3) / 0.4)), lerpV([30, 56, 72], [52, 84, 96], wp), s);
          // the shallows and the surf round each island
          for (k = 0; k < isl.length + fro.length; k++){ var hs = k < isl.length ? isl[k] : fro[k - isl.length], cy2 = Math.sqrt(Math.max(0, 1 - (hs[1] / hs[4]) * (hs[1] / hs[4]))), e = Math.hypot((wx - hs[0]) / (hs[3] * cy2), (wz - hs[2]) / (hs[5] * cy2));
            if (e < 1.35){ col = lerpV(col, [72, 196, 200], smooth((1.35 - e) / 0.35) * 0.7 * (1 - s)); if (e < 1.08 + (wp - 0.5) * 0.1) col = lerpV(col, [240, 248, 250], 0.85); } }
          if (ISL.ocean){ var ob = Math.abs(wz + 30 + Math.sin(wx * 0.08) * 3); if (ob < 6){ var os = fbm([wx * 0.09 - t * 0.9, 2.3, wz * 0.3], 2); col = lerpV(col, os > 0.55 ? [196, 204, 236] : [110, 120, 180], 0.75 * (1 - ob / 6)); } }   // the stream of Ocean
          if (crest > 1.75 - s * 0.35) col = lerpV(col, [236, 244, 248], smooth((crest - 1.75 + s * 0.35) / 0.2) * (0.4 + s * 0.4));   // white caps
          best = ts; id = 4; } }
      // the ship, its oars and the god
      for (var mi = 0; mi < models.length; mi++){ var Mo = models[mi], b4 = Mo[4]; if (x < b4[0] || x > b4[2] || y < b4[1] || y > b4[3]) continue; var hv = hitVox(Mo[0], Mo[5], Mo[2], rd, best);
        if (hv && hv.t < best){ var py3 = cam.pos[1] + rd[1] * hv.t; if (py3 < -0.05 && Mo[3] !== 3) continue; if (Mo[3] === 3 && py3 < 0) continue; best = hv.t; id = Mo[3]; col = [hv.col >> 16 & 255, hv.col >> 8 & 255, hv.col & 255]; n = hv.n; } }
      // Iris' rainbow: the road's top, where the ray meets the great circle within the road's width (bands across it, lit of itself)
      if (RB && bw > 0.01){ var oy = cam.pos[1] - RB.yc, oz = cam.pos[2] - RB.z1, qa = rd[1] * rd[1] + rd[2] * rd[2], qb = oy * rd[1] + oz * rd[2], qc = oy * oy + oz * oz - RB.R * RB.R, qd = qb * qb - qa * qc;
        if (qd > 0 && qa > 1e-9){ var tr = (-qb - Math.sqrt(qd)) / qa; if (tr > 0 && tr < best){ var hp = add(cam.pos, mul(rd, tr));
            if (Math.abs(hp[0]) < RB.w && hp[2] < RB.z0 + 1 && hp[2] > RB.z1 - 1 && hp[1] > -0.5){ var bi = clamp(Math.floor((hp[0] + RB.w) / (2 * RB.w) * 6), 0, 5), BC = [[232, 64, 64], [255, 154, 48], [255, 220, 80], [96, 200, 96], [64, 140, 230], [150, 96, 220]][bi];
              var glow = 0.82 + 0.18 * Math.sin(hp[2] * 0.6 - t * 3); col = mul(BC, glow); n = null; best = tr; id = 7; } } } }
      if (col && id === 7){ out = lerpV(lerpV(horizon, skyLow, 0.5), col, bw); }
      else if (col){ out = shade(col, n, sun, id === 4 ? 0.3 : 0.12); if (s) out = mul(out, 1 - s * 0.35); if (dk) out = id === 4 ? lerpV(mul(out, 1 - dk * 0.62), [34, 30, 64], dk * 0.3) : lerpV(mul(out, 1 - dk * 0.42), [44, 40, 76], dk * 0.18); if (fl) out = lerpV(out, [230, 236, 255], fl * 0.18);
        var fv = id === 3 ? vis * 2.6 : id === 5 ? lerp(lerp(520, 18, s), 30, mi) : id === 6 && STORM ? lerp(14, 520, smooth((t - 6.2) / 1.4)) : id === 6 && MIST && best > 40 ? lerp(14, 520, smooth((t - 6.6) / 1.6)) : vis;
        out = lerpV(out, horizon, 1 - Math.exp(-best / fv)); }   // the island is lost in haze until the storm has passed
      else { // the sky: a wash from the horizon up, and clouds drifting, warped, thick and dark in the storm
        var g = clamp(rd[1] * 2.2, 0, 1); out = lerpV(skyLow, skyTop, Math.sqrt(g));
        if (rd[1] > 0.01){ var cp = mul(rd, 90 / rd[1]), cw2 = fbm([cp[0] * 0.006 + t * 0.03, 1.7, cp[2] * 0.006], 3), cl = fbm([cp[0] * 0.011 + cw2 * 2.6 + t * 0.05 * (1 + s * 3), 4.2, cp[2] * 0.011 - cw2 * 2.2], 4);
          var cov = smooth((cl - (0.56 - s * 0.24)) / 0.14), ccol = lerpV([252, 252, 255], lerpV([70, 76, 90], [120, 126, 140], smooth((cl - 0.5) / 0.2)), s);
          if (fl) ccol = lerpV(ccol, [236, 240, 255], fl * 0.6); out = lerpV(out, ccol, cov * clamp(rd[1] * 6, 0, 1)); }
        else out = horizon; best = 1e12; }
      /* the deck of cloud the ship rises through (Olympus): soft warped noise at a height round the mountain, thin over the open sea
         behind, seen from below as grey and from above as white, laid over whatever is beyond it */
      if (RISE && Math.abs(rd[1]) > 1e-4){ var tcl = (CLY - cam.pos[1]) / rd[1]; if (tcl > 0 && tcl < best){ var pc = add(cam.pos, mul(rd, tcl)), cw3 = fbm([pc[0] * 0.03 + t * 0.02, 5.1, pc[2] * 0.03], 3), cl3 = fbm([pc[0] * 0.05 + cw3 * 2.2, 7.3, pc[2] * 0.05 - cw3 * 1.8], 3);
          var ca = smooth((cl3 - 0.46) / 0.16) * smooth((-pc[2] - 26) / 18) * (1 - smooth((Math.hypot(pc[0], pc[2] - ISL.hills[0][2]) - 70) / 30)); if (ca > 0.01){ out = lerpV(out, rd[1] < 0 ? lerpV([226, 234, 246], [255, 255, 255], smooth((cl3 - 0.5) / 0.2)) : [176, 188, 212], ca * 0.92); if (ca > 0.5){ best = tcl; id = 8; } } } }
      D[o2] = out[0]; D[o2 + 1] = out[1]; D[o2 + 2] = out[2]; D[o2 + 3] = 255; Z[y * W + x] = best; ID[y * W + x] = id; }
    // the outline round the ship and the god, as the courses are inked
    for (var y2 = 1; y2 < H - 1; y2++) for (var x2 = 1; x2 < W - 1; x2++){ var k2 = y2 * W + x2, idc = ID[k2]; if (idc < 1 || idc > 3) continue;
      var zc = Z[k2], edge = false, nb = [k2 - 1, k2 + 1, k2 - W, k2 + W]; for (var q2 = 0; q2 < 4; q2++){ var kk = nb[q2]; if (ID[kk] !== idc && Z[kk] > zc * 1.04){ edge = true; break; } }
      if (edge){ var o3 = k2 * 4; D[o3] *= 0.32; D[o3 + 1] *= 0.3; D[o3 + 2] *= 0.36; } }
    bx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    weather(t, s, fl); return sh; }
  /* the rain and the lightning, over the picture: streaks blown across on the wind, and a bolt that forks down to the sea */
  function weather(t, s, fl){ var Wc = cv.width, Hc = cv.height, k = Wc / 390;
    if (s > 0.02){ ctx.strokeStyle = 'rgba(214,226,240,' + (0.5 * s).toFixed(3) + ')'; ctx.lineWidth = Math.max(1, 1.3 * k); ctx.beginPath();
      for (var i = 0; i < Math.round(160 * s); i++){ var rx = (hash(i, 1, 5) * Wc * 1.3 + t * 260 * k) % (Wc * 1.3) - Wc * 0.15, ry = (hash(i, 2, 5) * Hc + t * 1400 * k * (0.8 + hash(i, 3, 5) * 0.4)) % Hc;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 9 * k, ry + 26 * k); } ctx.stroke(); }
    FLASH.forEach(function(ft, fi){ var d = t - ft; if (d < 0 || d > 0.22) return; var bx0 = Wc * (0.2 + hash(fi, 7, 9) * 0.6), by = 0, segs = [[bx0, 0]];
      while (by < Hc * 0.42){ by += Hc * 0.035; bx0 += (hash(fi, Math.round(by), 11) - 0.5) * 30 * k; segs.push([bx0, by]); }
      ctx.lineCap = 'round'; [[7 * k, 'rgba(180,200,255,.35)'], [2.4 * k, '#ffffff']].forEach(function(st){ ctx.strokeStyle = st[1]; ctx.lineWidth = st[0]; ctx.beginPath(); segs.forEach(function(p, j){ j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke(); }); });
    if (DARK && t > 2.6 && t < 4.4){ var d9 = k, dw = Math.sin(t * 4) * 2 * d9; ctx.font = 'bold ' + Math.round(38 * d9) + 'px Anton, Impact, sans-serif'; var dfit = Math.min(1, Wc * 0.9 / Math.max(1, ctx.measureText('THE EDGE OF THE WORLD').width)); ctx.font = 'bold ' + Math.round(38 * d9 * dfit) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6 * d9 * dfit;
      ctx.strokeStyle = '#14121e'; ctx.strokeText('THE EDGE OF THE WORLD', Wc / 2, Hc * 0.2 + dw); ctx.fillStyle = '#d8d0f0'; ctx.fillText('THE EDGE OF THE WORLD', Wc / 2, Hc * 0.2 + dw); }
    else if (RISE && t > 3.4 && t < 5.2){ var r9 = k, rw = Math.sin(t * 4) * 2 * r9; ctx.font = 'bold ' + Math.round(42 * r9) + 'px Anton, Impact, sans-serif'; var rfit = Math.min(1, Wc * 0.9 / Math.max(1, ctx.measureText('RIDE THE RAINBOW!').width)); ctx.font = 'bold ' + Math.round(42 * r9 * rfit) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6 * r9 * rfit;
      ctx.strokeStyle = '#1a2238'; ctx.strokeText('RIDE THE RAINBOW!', Wc / 2, Hc * 0.2 + rw); ctx.fillStyle = '#ffe9a0'; ctx.fillText('RIDE THE RAINBOW!', Wc / 2, Hc * 0.2 + rw); }
    else if (MIST && !DARK && t > 2.6 && t < 4.2){ var m9 = k, mw = Math.sin(t * 5) * 2 * m9; ctx.font = 'bold ' + Math.round(42 * m9) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6 * m9;
      ctx.strokeStyle = '#1e2a24'; ctx.strokeText('FOLLOW THE OWL!', Wc / 2, Hc * 0.2 + mw); ctx.fillStyle = '#ffe9a8'; ctx.fillText('FOLLOW THE OWL!', Wc / 2, Hc * 0.2 + mw); }
    if (STORM && t > 3.0 && t < 4.3){ var s9 = k, wob = Math.sin(t * 16) * 3 * s9; ctx.font = 'bold ' + Math.round(50 * s9) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6 * s9;
      ctx.strokeStyle = '#0e1a24'; ctx.strokeText('HOLD ON!', Wc / 2 + wob, Hc * 0.2); ctx.fillStyle = '#ffe27a'; ctx.fillText('HOLD ON!', Wc / 2 + wob, Hc * 0.2); } }

  if (o.still) return { at:function(t){ var sh = render(t); if (t > 9.4) wrap.classList.add('cap'); return sh; }, close:finish };
  if (reduce){ render(10.4); wrap.classList.add('cap'); setTimeout(finish, 1600); return; }
  var last = 0;
  function frame(now){ if (done) return; try{ step(now); }catch(e){ return finish(); } if (!done) requestAnimationFrame(frame); }
  function step(now){ if (!t0) t0 = now; var t = (now - t0) / 1000; last = t;
    var a = performance.now(); render(t); var fe = performance.now() - a; ftime += fe; frames++;
    if (frames > 4){ slow += fe; slowN++; if (slowN >= 15){ if (slow / slowN > 22 && W > 104) setRes(Math.max(104, Math.round(W * 0.86))); slow = 0; slowN = 0; } }
    if (t > 9.4) wrap.classList.add('cap'); if (t > DUR) finish(); }
  requestAnimationFrame(frame);
  return { stats:function(){ return { frames:frames, ms:frames ? ftime / frames : 0, W:W }; }, at:function(t){ return render(t); } };
}

/* DOWN THE RABBIT HOLE (Wonderland, SPACE_TRIP 'fall'): Lewis Carroll's first chapter. The White Rabbit runs to the hole under the
   hedge, looking at his watch ("I'M LATE!"), and pops down it. The camera follows him over the lip and falls, slowly, down a deep well
   whose sides are filled with cupboards and bookshelves, maps and pictures hung on pegs and the odd clock, and a jar of orange
   marmalade drifts by. It lands, thump, on a heap of sticks and dry leaves, in a long low hall lit by a row of lamps hanging from
   the roof, doors all round it. Past the little glass table with the golden key on it, the camera shrinks down (the bottle) to the
   little door behind the low curtain, the door swings open, and out it goes into the loveliest garden. Every surface is warped
   noise or drawn shapes, never a grid; the hall's floor is boards, not a check. A tap skips it; with reduced motion putt.js shows a
   still of the well instead (spaceTrip). */
var RABBIT = voxels(16, 30, 12, 0.06, [-0.48, 0, -0.36], function(x, y, z){ var ax = Math.abs(x), chk = (Math.floor(x * 10 + 20) + Math.floor(y * 10)) & 1;
  if (y < 0.1 && Math.hypot(ax - 0.12, (z - 0.08) / 1.6) < 0.08) return '#f6f4ee';   // long white feet
  if (y < 0.5 && Math.hypot(ax - 0.12, z) < 0.07) return y > 0.36 ? '#7a5a8a' : '#f6f4ee';
  if (Math.hypot(x / 0.22, (y - 0.78) / 0.32, z / 0.2) < 1) return z > 0.12 && ax < 0.08 ? '#e8c050' : chk ? '#a83a2a' : '#8a2a1e';   // jacket, waistcoat
  if (Math.hypot((ax - 0.26) / 0.06, (y - 0.82) / 0.2, (z - 0.06) / 0.06) < 1) return '#a83a2a';   // arms
  if (Math.hypot(x - 0.22, y - 0.66, z - 0.18) < 0.07) return '#ffd84a';   // the watch
  if (Math.hypot(x / 0.18, (y - 1.24) / 0.17, z / 0.16) < 1){ if (z > 0.1 && Math.abs(ax - 0.07) < 0.03 && Math.abs(y - 1.27) < 0.03) return '#d84a6a'; return '#f6f4ee'; }
  if (Math.hypot((ax - 0.07) / 0.05, (y - 1.56) / 0.2, z / 0.04) < 1) return z > 0.02 ? '#f0a8b8' : '#f6f4ee';   // the ears
  return null; });
function fall(host, o, cb){
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var wrap = document.createElement('div'); wrap.className = 'pp-trip';
  wrap.innerHTML = '<canvas></canvas><div class="pp-tripcap"><i></i><b></b></div><small>Tap to skip</small>';
  wrap.querySelector('i').textContent = o.label || ''; wrap.querySelector('b').textContent = o.name || '';
  host.appendChild(wrap);
  var cv = wrap.querySelector('canvas'), cw = host.clientWidth || 390, ch = host.clientHeight || 844, dpr = Math.min(2, root.devicePixelRatio || 1);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  var W, H, buf = document.createElement('canvas'), bx, img, D, slow = 0, slowN = 0;
  function setRes(w){ W = w; H = Math.round(W * ch / cw); buf.width = W; buf.height = H; bx = buf.getContext('2d'); img = bx.createImageData(W, H); D = img.data; }
  setRes(150);
  var done = false, t0 = 0, DUR = 10.8, frames = 0, ftime = 0, RS = 3.2, HALL = -34;
  function finish(){ if (done) return; done = true; wrap.classList.add('out'); setTimeout(function(){ if (wrap.isConnected) wrap.remove(); cb && cb(); }, 350); }
  wrap.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); finish(); });
  function vnz(x, y, z){ return noise3(x, y, z); }
  // where the camera is and where it looks, phase by phase
  function camAt(t){
    if (t < 2.4){ var a = smooth((t - 1.2) / 1.2); return { pos:lerpV(V(0, 3.2, 7.5), V(0, 0.6, 0.4), a), tg:lerpV(V(0, 0.4, 0), V(0.4, -6, 0.2), a), up:V(0, 1, 0), fov:62, ph:0 }; }
    if (t < 6.9){ var u = t - 2.4, y = 0.6 - u * 5.2 - u * u * 0.25, sp = u * 0.55, k = smooth(u / 1.2);
      return { pos:V(0, y, 0), tg:V(Math.cos(sp) * (0.4 + k * 2.2), y - 4 + k * 1.4, Math.sin(sp) * (0.4 + k * 2.2)), up:norm(V(-Math.sin(sp), 0.2, Math.cos(sp))), fov:66, ph:1 }; }
    // the hall: along it toward the little door, Alice shrinking (the camera sinking) as she goes, and out through it
    var w = t - 6.9, z = 2 - smooth(w / 2.9) * 34.5 - Math.max(0, w - 2.9) * 4, hy = lerp(1.6, 0.42, smooth((w - 1.2) / 1.6)) + Math.sin(w * 7) * 0.025; hy = lerp(hy, 2.2, smooth((HALL - z) / 3));
    return { pos:V(lerp(0, 0.85, smooth((w - 1.6) / 1.4)), hy, z), tg:V(lerp(0, 0.9, smooth((w - 1.6) / 1.4)), hy - 0.06 - smooth((HALL - z) / 3) * 0.9, z - 6), up:V(0, 1, 0), fov:64, ph:2 }; }
  // the well's wall at angle th and height h: earth near the top, then wood, and on it cupboards, shelves, maps, pictures and clocks
  function wallCol(th, h, t){ if (h > -2.2) return lerpV([92, 64, 40], [122, 88, 56], vnz(th * 3, h * 2, 1));
    var cs = 2.7, iy = Math.floor(h / cs), cu = th / 6.2832 * 9 + iy * 0.37, ic = Math.floor(cu), fu = cu - ic, fv = h / cs - iy, kind = hash(ic, iy, 11);
    var plank = Math.abs(Math.sin(th * 30 + vnz(th * 4, h * 0.3, 2) * 2)) < 0.08, wood = lerpV([110, 74, 44], [138, 96, 58], vnz(th * 8, h * 0.6, 3)); if (plank) wood = mul(wood, 0.75);
    if (fu < 0.14 || fu > 0.86 || fv < 0.12 || fv > 0.88 || kind < 0.12) return wood;
    var u = (fu - 0.14) / 0.72, v = (fv - 0.12) / 0.76;
    if (kind < 0.36){ if (u < 0.07 || u > 0.93 || v < 0.07 || v > 0.93) return [70, 44, 24]; if (Math.abs(u - 0.5) < 0.02) return [60, 38, 20];   // a cupboard, its two doors
      if (Math.abs(u - 0.42) < 0.03 && Math.abs(v - 0.5) < 0.04 || Math.abs(u - 0.58) < 0.03 && Math.abs(v - 0.5) < 0.04) return [230, 190, 80]; return lerpV([120, 70, 36], [146, 90, 48], vnz(u * 3, v * 8, 4)); }
    if (kind < 0.6){ var row = Math.floor(v * 3), rv = v * 3 - row; if (rv > 0.86) return [80, 52, 30];   // a bookshelf, three rows of spines
      var sp = Math.floor(u * 14 + row * 3), hs = hash(sp, row, ic + iy * 7); if (rv < 0.12 + hs * 0.25) return [40, 26, 16];
      var BK = [[140, 40, 40], [40, 70, 130], [60, 110, 60], [180, 150, 70], [110, 60, 110], [200, 190, 160]]; return mul(BK[Math.floor(hs * 6)], (u * 14 + row * 3) % 1 < 0.12 ? 0.7 : 1); }
    if (kind < 0.76){ if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return [120, 90, 50];   // a map hung on a peg: parchment, a coast and its sea
      var land = vnz(u * 4 + ic, v * 4, 5) + vnz(u * 9, v * 9 + iy, 6) * 0.4; return land > 0.85 ? [150, 170, 110] : land > 0.78 ? [110, 90, 60] : land > 0.6 ? [236, 222, 186] : [170, 196, 210]; }
    if (kind < 0.9){ if (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) return [200, 160, 60];   // a picture in a gold frame: a little landscape
      return v < 0.45 ? lerpV([150, 190, 230], [210, 225, 240], v / 0.45) : vnz(u * 6, v * 5, 7) > 0.55 ? [70, 120, 60] : [100, 150, 70]; }
    var dx = u - 0.5, dy = v - 0.5, rr = Math.hypot(dx, dy); if (rr > 0.46) return wood; if (rr > 0.4) return [70, 44, 24];   // a clock, its hands going round
    var ang = Math.atan2(dx, dy), ha = t * 0.4 + ic, ma = t * 4 + iy, near = function(a, L, w){ var da = Math.abs(((ang - a) % 6.2832 + 9.4248) % 6.2832 - 3.1416); return da < w && rr < L; };
    if (near(ha, 0.22, 0.18) || near(ma, 0.34, 0.1)) return [30, 24, 20]; if (rr < 0.36 && Math.abs(((ang * 6 / 3.1416) % 1 + 1) % 1 - 0.5) > 0.45) return [60, 50, 40]; return [244, 238, 222]; }
  // the jar of ORANGE MARMALADE, drifting by: an orange glass jar, a paper label round it and a white paper top
  function jarAt(t){ var u = t - 3.2; return V(Math.cos(u * 0.6 + 1) * 1.6, camAt(t).pos[1] - 2.4 + u * 1.2, Math.sin(u * 0.6 + 1) * 1.6); }
  function hitJar(ro, rd, c){ var ox = ro[0] - c[0], oz = ro[2] - c[2], a = rd[0] * rd[0] + rd[2] * rd[2], b = ox * rd[0] + oz * rd[2], cc = ox * ox + oz * oz - 0.3 * 0.3, h = b * b - a * cc;
    if (h < 0 || a < 1e-9) return null; var tt = (-b - Math.sqrt(h)) / a; if (tt < 0) return null; var py = ro[1] + rd[1] * tt - c[1]; if (py < -0.3 || py > 0.32) return null;
    var p = add(ro, mul(rd, tt)); return { t:tt, y:py, n:norm(V(p[0] - c[0], 0, p[2] - c[2])) }; }
  function garden(ro, rd, t){   // the loveliest garden: lawn and beds of bright flowers in warped noise, a hedge, the sky
    if (rd[1] < -1e-3){ var tg = -ro[1] / rd[1], p = add(ro, mul(rd, tg)), d = tg, bed = vnz(p[0] * 0.25, 3, p[2] * 0.25), fl = hash(Math.floor(p[0] * 6), Math.floor(p[2] * 6), 13);
      var c = bed > 0.66 ? (fl > 0.6 ? (fl > 0.86 ? [250, 250, 245] : [220, 40, 56]) : [50, 110, 50]) : lerpV([80, 160, 70], [110, 196, 90], vnz(p[0] * 0.6, 1, p[2] * 0.6));
      return lerpV(c, [200, 228, 246], 1 - Math.exp(-d / 60)); }
    var g = clamp(rd[1] * 3, 0, 1), sky = lerpV([210, 232, 248], [90, 150, 225], Math.sqrt(g)); var hd = vnz(Math.atan2(rd[0], -rd[2]) * 4, 2, 0); if (rd[1] < 0.05 + hd * 0.08) return lerpV([40, 100, 46], [60, 130, 60], hd); return sky; }
  function render(t){ var cam = camAt(t), f = norm(sub(cam.tg, cam.pos)), r = norm(cross(f, cam.up)), u = cross(r, f), foc = (W / 2) / Math.tan(cam.fov * Math.PI / 360), ro = cam.pos;
    var jar = t > 3.0 && t < 6.6 ? jarAt(t) : null, rb = null, rbM = null, rbLo = null;
    if (t < 1.9){ var hop = clamp((t - 0.7) / 1.1, 0, 1), rp = V(lerp(-1.6, 0, hop), hop < 0.6 ? Math.abs(Math.sin(hop * 9)) * 0.35 : -(hop - 0.6) * 4, lerp(1.2, 0, hop)); rbM = rotY(-0.5 - hop * 0.8); rb = rp; rbLo = mtv(rbM, sub(ro, rp)); }
    var fade = t > 6.3 && t < 7.4 ? Math.max(0, 1 - Math.abs(t - 6.85) / 0.55) : 0, open = smooth((t - 8.8) / 0.9);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++){ var px2 = (x + 0.5 - W / 2) / foc, py2 = (H / 2 - y - 0.5) / foc, rd = norm(add(f, add(mul(r, px2), mul(u, py2)))), col, o2 = (y * W + x) * 4;
      if (cam.ph < 2){ var start = ro, tAdd = 0, sky = null;
        if (ro[1] > 0){ if (rd[1] >= -1e-3) sky = lerpV([170, 210, 245], [80, 140, 220], clamp(rd[1] * 2, 0, 1)); else { var tp = -ro[1] / rd[1], gp = add(ro, mul(rd, tp)), gr = Math.hypot(gp[0], gp[2]);
            if (gr > RS + 0.25 * vnz(Math.atan2(gp[2], gp[0]) * 3, 0, 1)) sky = lerpV(lerpV([80, 150, 70], [110, 180, 90], vnz(gp[0] * 0.8, 0, gp[2] * 0.8)), [190, 220, 240], 1 - Math.exp(-tp / 50)); else if (gr > RS - 0.2) sky = [60, 40, 24]; else { start = gp; tAdd = tp; } } }
        if (sky) col = sky; else { var a = rd[0] * rd[0] + rd[2] * rd[2], b = start[0] * rd[0] + start[2] * rd[2], c = start[0] * start[0] + start[2] * start[2] - RS * RS, tw = a > 1e-9 ? (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a : 1e9, hp = add(start, mul(rd, tw)), dist = tw + tAdd;
          var th = Math.atan2(hp[2], hp[0]); col = wallCol(th < 0 ? th + 6.2832 : th, hp[1], t); var nrm = V(-hp[0] / RS, 0, -hp[2] / RS); col = mul(col, 0.55 + 0.45 * Math.max(0, -dot(nrm, rd)));
          col = lerpV(col, [24, 16, 10], 1 - Math.exp(-dist / 16)); }
        if (jar){ var hj = hitJar(ro, rd, jar); if (hj){ var lab = Math.abs(hj.y) < 0.12, top = hj.y > 0.24; col = mul(top ? [244, 240, 230] : lab ? [244, 236, 210] : [236, 130, 30], 0.6 + 0.4 * Math.max(0, -dot(hj.n, rd)));
            if (lab && Math.abs(Math.sin(Math.atan2(hj.n[2], hj.n[0]) * 14)) < 0.25 && Math.abs(hj.y) < 0.05) col = [90, 40, 20]; } }
        if (rb){ var hv = hitVox(RABBIT, rbLo, rbM, rd, 1e9); if (hv){ var cc = [hv.col >> 16 & 255, hv.col >> 8 & 255, hv.col & 255]; col = shade(cc, hv.n, norm(V(-0.5, 0.8, 0.6)), 0.15); } } }
      else { // the hall: boards underfoot, panelled walls with doors all round, lamps from the roof, and the little door at the end
        var bestT = 1e9, hit = null, k;
        var cand = [[(-3 - ro[0]) / rd[0], 'wl'], [(3 - ro[0]) / rd[0], 'wr'], [(0 - ro[1]) / rd[1], 'fl'], [(4.2 - ro[1]) / rd[1], 'ce'], [(HALL - ro[2]) / rd[2], 'end']];
        for (k = 0; k < cand.length; k++){ var tc = cand[k][0]; if (tc > 1e-4 && tc < bestT && isFinite(tc)){ var pc = add(ro, mul(rd, tc)); if (pc[0] >= -3.01 && pc[0] <= 3.01 && pc[1] >= -0.01 && pc[1] <= 4.21 && pc[2] >= HALL - 0.01){ bestT = tc; hit = [cand[k][1], pc]; } } }
        // the little glass table with the golden key on it, and the DRINK ME bottle
        var tt2 = (2.0 - ro[1]) / rd[1]; if (tt2 > 0 && tt2 < bestT){ var pt = add(ro, mul(rd, tt2)); if (Math.abs(pt[0]) < 0.9 && Math.abs(pt[2] + 12) < 0.6) { bestT = tt2; hit = ['glass', pt]; } }
        if (ro[2] < HALL + 0.05){ col = garden(ro, rd, t); }
        else if (!hit) col = [30, 20, 14];
        else { var p = hit[1], kd = hit[0], dd = bestT;
          if (kd === 'fl'){ var bd = Math.floor(p[0] * 2.2 + 10), gr2 = vnz(p[0] * 2, 9, p[2] * 0.3); col = lerpV([120, 80, 46], [150, 104, 62], gr2); if (Math.abs((p[0] * 2.2 + 10) % 1) < 0.06) col = mul(col, 0.7); if (hash(bd, Math.floor(p[2] / 3), 4) > 0.5) col = mul(col, 0.92);
            if (Math.abs(p[0]) < 0.9 && Math.abs(p[2] + 12) < 0.6) col = mul(col, 0.75);
            if (p[2] > -1.5 && p[2] < 2.4 && Math.abs(p[0]) < 2.2 && vnz(p[0] * 3, 1, p[2] * 3) > 0.42) col = vnz(p[0] * 5, 2, p[2] * 5) > 0.55 ? [150, 100, 40] : [110, 70, 30]; }   // the heap of sticks and dry leaves
          else if (kd === 'ce'){ col = [70, 50, 36]; var lz = ((p[2] % 5) + 5) % 5 - 2.5, lr = Math.hypot(p[0], lz); if (lr < 0.3) col = [255, 236, 170]; else if (lr < 1.2) col = lerpV([255, 210, 140], col, (lr - 0.3) / 0.9); }
          else if (kd === 'wl' || kd === 'wr'){ var dz = ((p[2] % 4.4) + 4.4) % 4.4; col = lerpV([130, 92, 60], [150, 108, 70], vnz(p[2] * 0.6, p[1] * 0.6, 3));
            if (dz > 1.2 && dz < 3.2 && p[1] < 2.8){ col = dz < 1.32 || dz > 3.08 || p[1] > 2.66 ? [200, 160, 80] : lerpV([96, 58, 30], [120, 74, 40], vnz(p[2] * 3, p[1], 5)); if (Math.abs(dz - 2.9) < 0.07 && Math.abs(p[1] - 1.3) < 0.07) col = [240, 200, 80]; }
            else if (p[1] > 3.8) col = [90, 62, 40]; }
          else if (kd === 'glass'){ col = [196, 228, 240]; if (Math.abs(p[0] - 0.3) < 0.18 && Math.abs(p[2] + 12) < 0.06) col = [250, 214, 70];   // the golden key
            if (Math.hypot(p[0] + 0.35, p[2] + 12) < 0.14) col = [120, 170, 220]; }   // the bottle, seen from above
          else { // the end of the hall: a low curtain, and behind it the little door, about fifteen inches high
            col = lerpV([130, 92, 60], [150, 108, 70], vnz(p[0] * 0.6, p[1] * 0.6, 3));
            if (p[0] < 0.3 && p[0] > -2.4 && p[1] < 1.9){ col = (Math.abs(Math.sin(p[0] * 9)) < 0.3 ? [150, 30, 40] : [184, 40, 52]); if (p[0] > 0.1) col = [120, 24, 32]; }   // the curtain, drawn aside
            if (p[0] > 0.4 && p[0] < 1.4 && p[1] < 1.25){ if (p[0] < 0.48 || p[0] > 1.32 || p[1] > 1.17) col = [200, 160, 80];
              else if ((p[0] - 0.48) / 0.84 < open * 0.95) col = garden(ro, rd, t);   // the door swung open on the garden
              else { col = [120, 74, 40]; if (Math.hypot(p[0] - 1.22, p[1] - 0.6) < 0.05) col = [240, 200, 80]; } } }
          if (kd !== 'ce' || hit[1][1] < 4) col = mul(col, 0.62 + 0.38 * Math.max(0, 1 - Math.abs(((p[2] % 5) + 5) % 5 - 2.5) / 3.2));
          col = lerpV(col, [30, 20, 14], 1 - Math.exp(-dd / 30)); } }
      if (fade) col = lerpV(col, [12, 8, 6], fade);
      D[o2] = col[0]; D[o2 + 1] = col[1]; D[o2 + 2] = col[2]; D[o2 + 3] = 255; }
    bx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    var Wc = cv.width, Hc = cv.height, k9 = Wc / 390;
    var say = function(txt, c1, c2, wob){ ctx.font = 'bold ' + Math.round(44 * k9) + 'px Anton, Impact, sans-serif'; var fit = Math.min(1, Wc * 0.9 / Math.max(1, ctx.measureText(txt).width)); ctx.font = 'bold ' + Math.round(44 * k9 * fit) + 'px Anton, Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.lineWidth = 6 * k9; ctx.strokeStyle = c1; ctx.strokeText(txt, Wc / 2 + wob, Hc * 0.2); ctx.fillStyle = c2; ctx.fillText(txt, Wc / 2 + wob, Hc * 0.2); };
    if (t > 0.4 && t < 1.9) say('I’M LATE!', '#1a1410', '#ffffff', Math.sin(t * 14) * 3 * k9);
    else if (t > 3.2 && t < 5.0) say('DOWN, DOWN, DOWN!', '#1a1410', '#ffd84a', Math.sin(t * 4) * 2 * k9);
    return cam; }
  if (o.still) return { at:function(t){ var c = render(t); if (t > 9.4) wrap.classList.add('cap'); return c; }, close:finish };
  if (reduce){ render(10.4); wrap.classList.add('cap'); setTimeout(finish, 1600); return; }
  function frame(now){ if (done) return; try{ step(now); }catch(e){ return finish(); } if (!done) requestAnimationFrame(frame); }
  function step(now){ if (!t0) t0 = now; var t = (now - t0) / 1000;
    var a = performance.now(); render(t); var fe = performance.now() - a; ftime += fe; frames++;
    if (frames > 4){ slow += fe; slowN++; if (slowN >= 15){ if (slow / slowN > 22 && W > 104) setRes(Math.max(104, Math.round(W * 0.86))); slow = 0; slowN = 0; } }
    if (t > 9.4) wrap.classList.add('cap'); if (t > DUR) finish(); }
  requestAnimationFrame(frame);
  return { stats:function(){ return { frames:frames, ms:frames ? ftime / frames : 0, W:W }; }, at:function(t){ return render(t); } };
}
/* THROUGH THE LOOKING-GLASS (SPACE_TRIP 'glass'): Lewis Carroll's first chapter of 1871. At the end of Wonderland's croquet ground
   a drawing-room chimney-piece stands on the lawn, the fire in its grate, and over it the great looking-glass. The camera climbs up
   to it, and the glass begins to melt away, just like a bright silvery mist ("LET'S PRETEND!"). Through it is the Looking-glass
   room: the same room the other way about, the fire blazing in the grate behind, the chessmen walking about in the hearth, a
   picture on the wall that seems to be alive. Down from the chimney-piece, across the room, out at the open window and up over
   the country beyond: a great chessboard, its fields divided by little brooks and green hedges, every edge wandering and never
   a straight line, a hill in the middle ("A GREAT GAME OF CHESS!"). Every surface is warped noise or drawn shapes, never a grid.
   A tap skips it; with reduced motion putt.js shows a still of the glass instead (spaceTrip). */
function glassLeg(host, o, cb){
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var wrap = document.createElement('div'); wrap.className = 'pp-trip';
  wrap.innerHTML = '<canvas></canvas><div class="pp-tripcap"><i></i><b></b></div><small>Tap to skip</small>';
  wrap.querySelector('i').textContent = o.label || ''; wrap.querySelector('b').textContent = o.name || '';
  host.appendChild(wrap);
  var cv = wrap.querySelector('canvas'), cw = host.clientWidth || 390, ch = host.clientHeight || 844, dpr = Math.min(2, root.devicePixelRatio || 1);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  var W, H, buf = document.createElement('canvas'), bx, img, D, slow = 0, slowN = 0;
  function setRes(w){ W = w; H = Math.round(W * ch / cw); buf.width = W; buf.height = H; bx = buf.getContext('2d'); img = bx.createImageData(W, H); D = img.data; }
  setRes(150);
  var done = false, t0 = 0, DUR = 10.8, frames = 0, ftime = 0, MZ = -0.3, MY0 = 2.45, MY1 = 4.85, MX = 1.75;
  function finish(){ if (done) return; done = true; wrap.classList.add('out'); setTimeout(function(){ if (wrap.isConnected) wrap.remove(); cb && cb(); }, 350); }
  wrap.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); finish(); });
  function vnz(x, y, z){ return noise3(x, y, z); }
  // where the camera is and where it looks, phase by phase (ph 0 the lawn, 1 the Looking-glass room, 2 the country)
  function camAt(t){
    if (t < 4.1){ var a = smooth(t / 3.9); return { pos:lerpV(V(0.4, 2.4, 9.5), V(0, 3.65, MZ + 0.35 - smooth((t - 3.3) / 0.8) * 0.9), a), tg:lerpV(V(0, 2.2, 0), V(0, 3.65, -3), smooth(t / 2.6)), up:V(0, 1, 0), fov:60, ph:0 }; }
    if (t < 7.7){ var u = t - 4.1, k = smooth(u / 3.6), turn = smooth((u - 0.4) / 1.4);
      var pos = V(lerp(0, 0.6, k), lerp(3.65, 1.7, smooth(u / 1.6)), lerp(MZ - 0.6, -10.6, k));
      var look = V(lerp(0, -1.2, turn * (1 - k)), lerp(1.4, 1.9, k), pos[2] - 4); if (u < 1.2) look = lerpV(V(0, 0.4, -2.2), look, smooth(u / 1.2)); return { pos:pos, tg:look, up:V(0, 1, 0), fov:64, ph:1 }; }
    var w = t - 7.7, s2 = smooth(w / 3.1); return { pos:V(0.6, 1.7 + s2 * 9.5, -10.6 - w * 7), tg:V(0.6, 1.2 + s2 * 2, -22 - w * 7), up:V(0, 1, 0), fov:62, ph:2 }; }
  function sky(rd){ var g = clamp(rd[1] * 2.4, 0, 1), c = lerpV([214, 232, 250], [86, 150, 226], Math.sqrt(g)); var cl = vnz(rd[0] * 3 / (rd[1] + 0.3), 4, rd[2] * 3 / (rd[1] + 0.3)); return cl > 0.66 && rd[1] > 0.05 ? lerpV(c, [255, 255, 255], 0.75) : c; }
  // the croquet lawn of Wonderland, mown in waving stripes
  function lawn(p){ var wv = Math.sin(p[0] * 0.4) * 0.8 + vnz(p[0] * 0.3, 1, p[2] * 0.3) * 1.5, k = Math.floor((p[2] + wv) / 1.6) & 1, b = vnz(p[0] * 0.9, 2, p[2] * 0.9);
    return k ? lerpV([96, 176, 86], [120, 200, 104], b) : lerpV([78, 150, 70], [96, 168, 84], b); }
  /* the chessboard country: two greens of field whose edges are warped noise, a dark hedgerow along each edge, the little brooks
     wandering across, and a gentle hill */
  function country(p, d){ var x = p[0] * 0.09, z = p[2] * 0.09, w = vnz(x * 0.5, 5, z * 0.5) - 0.5, f = vnz(x + w * 1.6, 7, z - w * 1.2), f2 = vnz(x * 1.3 - w, 8, z * 1.3 + w), bw = vnz(x * 0.4, 9, z * 0.4) - 0.5, br = Math.abs(vnz(x * 0.35 + bw, 11, z * 0.2) - 0.5), c;
    var tone = (f > 0.5 ? 2 : 0) + (f2 > 0.5 ? 1 : 0), T4 = [[96, 168, 78], [128, 196, 96], [150, 206, 104], [176, 200, 98]];
    if (br < 0.022) c = br < 0.012 ? [64, 124, 190] : [130, 176, 216]; else if (Math.abs(f - 0.5) < 0.026 || Math.abs(f2 - 0.5) < 0.022) c = [36, 84, 42];
    else c = mul(T4[tone], 0.92 + 0.12 * vnz(p[0] * 0.4, 3, p[2] * 0.4));
    if (hash(Math.floor(p[0] * 1.5), Math.floor(p[2] * 1.5), 17) > 0.994) c = [30, 70, 36];   // a tree in a hedgerow
    return lerpV(c, [206, 228, 246], 1 - Math.exp(-d / 220)); }
  function hill(x, z){ return 3.2 * Math.exp(-((x - 4) * (x - 4) + (z + 60) * (z + 60)) / 260); }
  // the chimney-piece on the lawn (outside) or in the room: a white box with its shelf and its grate; the fire in it
  function hitBox(ro, rd, b){ var tmin = -1e9, tmax = 1e9, n = null; for (var a = 0; a < 3; a++){ if (Math.abs(rd[a]) < 1e-9){ if (ro[a] < b[0][a] || ro[a] > b[1][a]) return null; continue; }
      var t1 = (b[0][a] - ro[a]) / rd[a], t2 = (b[1][a] - ro[a]) / rd[a], s = -1; if (t1 > t2){ var q = t1; t1 = t2; t2 = q; s = 1; } if (t1 > tmin){ tmin = t1; n = [0, 0, 0]; n[a] = rd[a] > 0 ? -1 : 1; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return null; }
    return tmin > 1e-4 ? { t:tmin, n:n } : null; }
  var MANTEL = [[-2.1, 0, -0.9], [2.1, 2.25, MZ]];
  function mantelCol(p, n, t, fire){ if (p[1] > 2.05) return [244, 238, 226]; if (n[2] > 0.5 && Math.abs(p[0]) < 1.1 && p[1] < 1.5){ var fl = vnz(p[0] * 6, p[1] * 5 - t * 6, 3);   // the grate and its fire
        if (p[1] < 0.25 + fl * (fire ? 0.9 : 0.5)) return fl > 0.55 ? [255, 214, 80] : [255, 130, 40]; return [26, 18, 14]; }
    return lerpV([226, 220, 206], [240, 236, 226], vnz(p[0] * 2, p[1] * 2, 5)); }
  // the chessmen walking about in the hearth of the Looking-glass room: a red King and Queen, white pawns, each two spheres
  var MEN = [[-1.3, -1.8, 1, 1.3], [-0.6, -2.4, 1, 1.15], [0.5, -1.6, 0, 0.8], [1.1, -2.2, 0, 0.8], [1.6, -1.5, 0, 0.8], [0.1, -2.9, 1, 0.8]];
  function hitSph(ro, rd, c, r){ var ox = ro[0] - c[0], oy = ro[1] - c[1], oz = ro[2] - c[2], b = ox * rd[0] + oy * rd[1] + oz * rd[2], cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc; if (h < 0) return -1; var tt = -b - Math.sqrt(h); return tt > 1e-4 ? tt : -1; }
  function men(ro, rd, t, best){ var hit = null; for (var i = 0; i < MEN.length; i++){ var m = MEN[i], bob = Math.abs(Math.sin(t * 5 + i)) * 0.08, sc = m[3] * 0.5;
      var parts = [[V(m[0], 0.32 * sc + bob, m[1]), 0.3 * sc], [V(m[0], 0.78 * sc + bob, m[1]), 0.18 * sc]];
      for (var k = 0; k < 2; k++){ var tt = hitSph(ro, rd, parts[k][0], parts[k][1]); if (tt > 0 && tt < best){ best = tt; var p = add(ro, mul(rd, tt)); hit = { t:tt, n:norm(sub(p, parts[k][0])), col:m[2] ? [200, 40, 58] : [244, 240, 228] }; } } }
    return hit; }
  // the scene on the lawn side of the glass (and, reflected, in it)
  function outside(ro, rd, t, refl){ var bh = hitBox(ro, rd, MANTEL), tg = rd[1] < -1e-3 ? -ro[1] / rd[1] : 1e9;
    if (!refl && bh && bh.t < tg){ var p = add(ro, mul(rd, bh.t)); return mul(mantelCol(p, bh.n, t, false), 0.7 + 0.3 * Math.max(0, dot(bh.n, norm(V(0.4, 0.8, 0.6))))); }
    if (tg < 1e9){ var g = add(ro, mul(rd, tg)); return lerpV(lawn(g), [200, 228, 246], 1 - Math.exp(-tg / 60)); } return sky(rd); }
  // the Looking-glass room: a carpet in soft flowers, papered walls, the open window at the far end on the country
  function room(ro, rd, t){ var bestT = 1e9, hit = null, k, RX = 5, RY = 4.6, RZ0 = -11, RZ1 = 0.5;
    var cand = [[(-RX - ro[0]) / rd[0], 'w'], [(RX - ro[0]) / rd[0], 'w'], [(0 - ro[1]) / rd[1], 'f'], [(RY - ro[1]) / rd[1], 'c'], [(RZ0 - ro[2]) / rd[2], 'e'], [(RZ1 - ro[2]) / rd[2], 'b']];
    for (k = 0; k < cand.length; k++){ var tc = cand[k][0]; if (tc > 1e-4 && tc < bestT && isFinite(tc)){ var pc = add(ro, mul(rd, tc)); if (pc[0] >= -RX - 0.01 && pc[0] <= RX + 0.01 && pc[1] >= -0.01 && pc[1] <= RY + 0.01 && pc[2] >= RZ0 - 0.01 && pc[2] <= RZ1 + 0.01){ bestT = tc; hit = [cand[k][1], pc]; } } }
    var mn = men(ro, rd, t, bestT); if (mn) return mul(mn.col, 0.6 + 0.4 * Math.max(0, dot(mn.n, norm(V(0.3, 0.8, 0.5)))));
    var bm = hitBox(ro, rd, [[-2.1, 0, -0.4], [2.1, 2.25, 0.5]]); if (bm && bm.t < bestT){ var pm = add(ro, mul(rd, bm.t)); return mantelCol(pm, [0, 0, -bm.n[2] || -1], t, true); }
    if (!hit) return [40, 30, 24]; var p = hit[1], kd = hit[0], col;
    if (kd === 'f'){ var fl = vnz(p[0] * 1.2, 1, p[2] * 1.2), ro2 = vnz(p[0] * 3.5, 2, p[2] * 3.5); col = ro2 > 0.8 ? (fl > 0.5 ? [214, 96, 90] : [226, 186, 100]) : lerpV([118, 36, 44], [138, 48, 54], fl);
      var fire = Math.exp(-Math.hypot(p[0], p[2]) / 2.2); col = lerpV(col, [255, 190, 110], fire * 0.35); }
    else if (kd === 'c') col = [236, 228, 212];
    else if (kd === 'e'){ col = lerpV([214, 200, 170], [226, 214, 186], vnz(p[0], p[1], 6));
      if (Math.abs(p[0] - 0.6) < 1.6 && p[1] > 0.6 && p[1] < 3.6){ if (Math.abs(p[0] - 0.6) > 1.45 || p[1] < 0.75 || p[1] > 3.45 || Math.abs(p[0] - 0.6) < 0.05) col = [244, 240, 230];   // the window, open on the country
        else { col = rd[1] > -0.02 ? sky(rd) : country(add(ro, mul(rd, Math.max(1, (-0.5 - ro[1]) / rd[1]))), 40); } } }
    else { col = lerpV([214, 200, 170], [226, 214, 186], vnz(p[2] * 0.8, p[1] * 0.8, 7)); if (Math.abs(Math.sin(p[2] * 3)) < 0.06) col = mul(col, 0.92);
      if (p[1] > 1.4 && p[1] < 3 && Math.abs(p[2] + 5) < 1.2){ if (Math.abs(p[2] + 5) > 1.08 || p[1] < 1.52 || p[1] > 2.88) col = [200, 160, 64];   // a picture by the window
        else { col = lerpV([150, 190, 230], [90, 150, 80], clamp((2.3 - p[1]) * 2, 0, 1)); if (Math.hypot(p[2] + 5 - Math.sin(t * 2) * 0.2, p[1] - 2.1) < 0.18) col = [240, 220, 180]; } } }   // its little figure moves
    var lit = 0.68 + 0.32 * Math.exp(-Math.hypot(p[0], p[2]) / 6); return lerpV(mul(col, lit), [40, 30, 24], 1 - Math.exp(-bestT / 40)); }
  function render(t){ var cam = camAt(t), f = norm(sub(cam.tg, cam.pos)), r = norm(cross(f, cam.up)), u = cross(r, f), foc = (W / 2) / Math.tan(cam.fov * Math.PI / 360), ro = cam.pos;
    var mist = clamp((t - 2.4) / 1.4, 0, 1), white = t > 3.7 && t < 4.6 ? Math.max(0, 1 - Math.abs(t - 4.1) / 0.5) : 0, fade = t > 7.3 && t < 8.1 ? Math.max(0, 1 - Math.abs(t - 7.7) / 0.4) * 0.5 : 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++){ var px2 = (x + 0.5 - W / 2) / foc, py2 = (H / 2 - y - 0.5) / foc, rd = norm(add(f, add(mul(r, px2), mul(u, py2)))), col, o2 = (y * W + x) * 4;
      if (cam.ph === 0){ col = outside(ro, rd, t, false);
        var tm = (MZ - ro[2]) / rd[2]; if (tm > 1e-4 && isFinite(tm)){ var pm = add(ro, mul(rd, tm)), bh = hitBox(ro, rd, MANTEL);
          if (Math.abs(pm[0]) < MX + 0.18 && pm[1] > MY0 - 0.18 && pm[1] < MY1 + 0.18 && (!bh || bh.t > tm)){
            if (Math.abs(pm[0]) > MX || pm[1] < MY0 || pm[1] > MY1) col = lerpV([200, 160, 64], [255, 220, 120], vnz(pm[0] * 6, pm[1] * 6, 8));   // the gilt frame
            else { var rr = V(rd[0], rd[1], -rd[2]), rc = outside(pm, rr, t, true), sm2 = vnz(pm[0] * 2.2, pm[1] * 2.2 + t * 0.6, 9);
              col = lerpV(lerpV(rc, [214, 224, 240], 0.25), sm2 > 0.5 ? [255, 255, 255] : [222, 230, 244], mist * (0.5 + 0.5 * sm2)); } } } }
      else if (cam.ph === 1) col = room(ro, rd, t);
      else { var tg2 = -1; if (rd[1] < -1e-3){ var tl = -ro[1] / rd[1]; for (var it = 0; it < 3; it++){ var gp = add(ro, mul(rd, tl)); tl = (hill(gp[0], gp[2]) - ro[1]) / rd[1]; } if (tl > 0) tg2 = tl; }
        col = tg2 > 0 ? country(add(ro, mul(rd, tg2)), tg2) : sky(rd); }
      if (white) col = lerpV(col, [246, 248, 255], white);
      if (fade) col = lerpV(col, [246, 248, 255], fade);
      D[o2] = col[0]; D[o2 + 1] = col[1]; D[o2 + 2] = col[2]; D[o2 + 3] = 255; }
    bx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    var Wc = cv.width, Hc = cv.height, k9 = Wc / 390;
    var say = function(txt, c1, c2, wob){ ctx.font = 'bold ' + Math.round(44 * k9) + 'px Anton, Impact, sans-serif'; var fit = Math.min(1, Wc * 0.9 / Math.max(1, ctx.measureText(txt).width)); ctx.font = 'bold ' + Math.round(44 * k9 * fit) + 'px Anton, Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.lineWidth = 6 * k9; ctx.strokeStyle = c1; ctx.strokeText(txt, Wc / 2 + wob, Hc * 0.2); ctx.fillStyle = c2; ctx.fillText(txt, Wc / 2 + wob, Hc * 0.2); };
    if (t > 1.6 && t < 3.6) say('LET’S PRETEND!', '#1a1a22', '#ffffff', Math.sin(t * 6) * 2 * k9);
    else if (t > 8.2 && t < 10.2) say('A GREAT GAME OF CHESS!', '#1a1a22', '#ffd84a', Math.sin(t * 4) * 2 * k9);
    return cam; }
  if (o.still) return { at:function(t){ var c = render(t); if (t > 9.4) wrap.classList.add('cap'); return c; }, close:finish };
  if (reduce){ render(3.4); wrap.classList.add('cap'); setTimeout(finish, 1600); return; }
  function frame(now){ if (done) return; try{ step(now); }catch(e){ return finish(); } if (!done) requestAnimationFrame(frame); }
  function step(now){ if (!t0) t0 = now; var t = (now - t0) / 1000;
    var a = performance.now(); render(t); var fe = performance.now() - a; ftime += fe; frames++;
    if (frames > 4){ slow += fe; slowN++; if (slowN >= 15){ if (slow / slowN > 22 && W > 104) setRes(Math.max(104, Math.round(W * 0.86))); slow = 0; slowN = 0; } }
    if (t > 9.4) wrap.classList.add('cap'); if (t > DUR) finish(); }
  requestAnimationFrame(frame);
  return { stats:function(){ return { frames:frames, ms:frames ? ftime / frames : 0, W:W }; }, at:function(t){ return render(t); } };
}
/* UP THE BEANSTALK (SPACE_TRIP 'beanstalk'): "Jack and the Beanstalk", Joseph Jacobs' telling of 1890. At the end of the
   Looking-Glass country a beanstalk has grown up out of the turf overnight, as Jack's did from the beans his mother threw out of
   the window, and it goes up and up until it reaches the sky. The camera walks up to its foot across the fields of the chessboard
   country (their edges warped noise, the hedgerows wandering, never a check), then climbs: round and round the great twisting stalk
   as it goes up past its leaves, the fields falling away below ("HE CLIMBED AND HE CLIMBED!"), into the cloud deck and out on top
   of it, where the giant's land lies on the clouds and a long broad road runs off as straight as a dart to his great tall house
   ("FEE-FI-FO-FUM!"). Every surface is noise or drawn shapes, never a grid. A tap skips it; with reduced motion putt.js shows a
   still of the stalk instead (spaceTrip). */
function beanLeg(host, o, cb){
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var wrap = document.createElement('div'); wrap.className = 'pp-trip';
  wrap.innerHTML = '<canvas></canvas><div class="pp-tripcap"><i></i><b></b></div><small>Tap to skip</small>';
  wrap.querySelector('i').textContent = o.label || ''; wrap.querySelector('b').textContent = o.name || '';
  host.appendChild(wrap);
  var cv = wrap.querySelector('canvas'), cw = host.clientWidth || 390, ch = host.clientHeight || 844, dpr = Math.min(2, root.devicePixelRatio || 1);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  var W, H, buf = document.createElement('canvas'), bx, img, D, slow = 0, slowN = 0;
  function setRes(w){ W = w; H = Math.round(W * ch / cw); buf.width = W; buf.height = H; bx = buf.getContext('2d'); img = bx.createImageData(W, H); D = img.data; }
  setRes(150);
  var done = false, t0 = 0, DUR = 11.4, frames = 0, ftime = 0, CL0 = 62, CL1 = 68, TOP = 3.4;
  function finish(){ if (done) return; done = true; wrap.classList.add('out'); setTimeout(function(){ if (wrap.isConnected) wrap.remove(); cb && cb(); }, 350); }
  wrap.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); finish(); });
  function vnz(x, y, z){ return noise3(x, y, z); }
  // the stalk's middle at height y: it twists as it climbs, and thins a little
  function axis(y){ return [Math.sin(y * 0.11) * 0.9, Math.cos(y * 0.09) * 0.7]; }
  function rad(y){ return Math.max(0.55, 1.25 - y * 0.006); }
  // where the camera is and where it looks: the walk to the foot, the climb round the stalk, and out over the clouds
  function camAt(t){
    if (t < 3){ var a = smooth(t / 3); return { pos:V(lerp(3, 1.2, a), 1.7, lerp(16, 5.2, a)), tg:V(0, lerp(4, 9, a), 0), fov:62 }; }
    if (t < 8.6){ var u = (t - 3) / 5.6, th = 0.25 + u * 6.6, y = 1.9 + Math.pow(u, 1.35) * (CL1 + 6), ax = axis(y), r = 4.4;
      return { pos:V(ax[0] + Math.sin(th) * r, y, ax[1] + Math.cos(th) * r), tg:V(ax[0] + Math.sin(th + 0.5) * 1.2, y + 3.4 + u * 2, ax[1] + Math.cos(th + 0.5) * 1.2), fov:66 }; }
    var w = t - 8.6, s2 = smooth(w / 2.6), y2 = CL1 + 6 + s2 * 3; return { pos:V(lerp(Math.sin(6.85) * 4.4, 1.5, s2), y2, lerp(Math.cos(6.85) * 4.4, -6 - w * 3, s2)), tg:V(1.5, CL1 + 2.4, -48 - w * 3), fov:62 }; }
  function sky(rd){ var g = clamp(rd[1] * 2.2 + 0.1, 0, 1); return lerpV([214, 232, 250], [70, 132, 210], Math.sqrt(g)); }
  /* the Looking-Glass country below: fields of two greens whose edges are warped noise, a hedgerow along each edge, little brooks */
  function country(p, d){ var x = p[0] * 0.08, z = p[2] * 0.08, w = vnz(x * 0.5, 5, z * 0.5) - 0.5, f = vnz(x + w * 1.6, 7, z - w * 1.2), f2 = vnz(x * 1.3 - w, 8, z * 1.3 + w), br = Math.abs(vnz(x * 0.35 + w, 11, z * 0.2) - 0.5), c;
    var T4 = [[96, 168, 78], [128, 196, 96], [150, 206, 104], [116, 182, 88]];
    if (br < 0.02) c = [70, 130, 196]; else if (Math.abs(f - 0.5) < 0.025 || Math.abs(f2 - 0.5) < 0.02) c = [36, 84, 42]; else c = mul(T4[(f > 0.5 ? 2 : 0) + (f2 > 0.5 ? 1 : 0)], 0.92 + 0.12 * vnz(p[0] * 0.4, 3, p[2] * 0.4));
    var hd = Math.hypot(p[0], p[2]); if (hd < 2.6 + vnz(p[0], 2, p[2])) c = lerpV(c, [110, 76, 40], 0.7);   // the earth heaved up round the stalk's foot
    return lerpV(c, [206, 228, 246], 1 - Math.exp(-d / 260)); }
  /* the giant's land on top of the clouds: meadow, the long broad road, and far off his great tall house; elsewhere cloud tops */
  function landTop(p, d){ var x = p[0], z = p[2], isl = Math.hypot(x * 0.8, (z + 46) * 0.55) + (vnz(x * 0.05, 13, z * 0.05) - 0.5) * 20, c;
    if (isl > 34){ var b = vnz(x * 0.08, 15, z * 0.08); c = b > 0.62 ? [255, 255, 255] : b < 0.32 ? [206, 218, 234] : [236, 242, 250]; return lerpV(c, [214, 232, 250], 1 - Math.exp(-d / 300)); }
    var a = vnz(x * 0.12, 17, z * 0.12); c = a > 0.62 ? [120, 184, 86] : a < 0.32 ? [82, 138, 56] : [100, 164, 70];
    if (Math.abs(x - 1.5 + (vnz(z * 0.03, 19, 1) - 0.5) * 4) < 1.6 && z < -4) c = [216, 200, 160];   // the road, as straight as a dart
    if (isl > 31) c = lerpV(c, [236, 242, 250], (isl - 31) / 3);
    return lerpV(c, [214, 232, 250], 1 - Math.exp(-d / 300)); }
  // the giant's great tall house at the end of the road: a grey stone box and a dark roof
  var HOUSE = [[-5, CL1, -86], [9, CL1 + 11, -74]];
  function hitBox(ro, rd, b){ var tmin = -1e9, tmax = 1e9, n = null; for (var a = 0; a < 3; a++){ if (Math.abs(rd[a]) < 1e-9){ if (ro[a] < b[0][a] || ro[a] > b[1][a]) return null; continue; }
      var t1 = (b[0][a] - ro[a]) / rd[a], t2 = (b[1][a] - ro[a]) / rd[a]; if (t1 > t2){ var q = t1; t1 = t2; t2 = q; } if (t1 > tmin){ tmin = t1; n = [0, 0, 0]; n[a] = rd[a] > 0 ? -1 : 1; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return null; }
    return tmin > 1e-4 ? { t:tmin, n:n } : null; }
  // the stalk: marched a few steps against its twisting axis (a cylinder each step), and its leaves, flat hearts standing out from it
  function stalkHit(ro, rd, tmax){ var best = null;
    for (var k = 0; k < 2; k++){ var yy = k === 0 ? ro[1] : ro[1] + rd[1] * 6; var ax = axis(yy), r = rad(yy), ox = ro[0] - ax[0], oz = ro[2] - ax[1], a = rd[0] * rd[0] + rd[2] * rd[2], b = ox * rd[0] + oz * rd[2], c = ox * ox + oz * oz - r * r, h = b * b - a * c;
      if (a < 1e-9 || h < 0) continue; var tt = (-b - Math.sqrt(h)) / a; if (tt > 1e-3 && tt < tmax && (!best || tt < best.t)){ var p = add(ro, mul(rd, tt)), ax2 = axis(p[1]); if (Math.abs(Math.hypot(p[0] - ax2[0], p[2] - ax2[1]) - rad(p[1])) < 0.5) best = { t:tt, p:p, k:'s', n:norm(V(p[0] - ax2[0], 0, p[2] - ax2[1])) }; } }
    var lo = Math.floor(Math.min(ro[1], ro[1] + rd[1] * 30) / 3.2) - 1, hi = Math.ceil(Math.max(ro[1], ro[1] + rd[1] * 30) / 3.2) + 1;
    for (var i = Math.max(0, lo); i <= Math.min(hi, 24); i++){ var ly = i * 3.2 + 1.4, la = i * 2.4, axl = axis(ly), cx = axl[0] + Math.cos(la) * 2.0, cz = axl[1] + Math.sin(la) * 2.0, ny = 0.9, nx = Math.cos(la) * 0.42, nz = Math.sin(la) * 0.42;
      var den = rd[0] * nx + rd[1] * ny + rd[2] * nz; if (Math.abs(den) < 1e-6) continue; var tl = ((cx - ro[0]) * nx + (ly - ro[1]) * ny + (cz - ro[2]) * nz) / den; if (tl < 1e-3 || tl > tmax || (best && tl > best.t)) continue;
      var q = add(ro, mul(rd, tl)), lx = q[0] - cx, lz = q[2] - cz, al = lx * Math.cos(la) + lz * Math.sin(la), ac = -lx * Math.sin(la) + lz * Math.cos(la), sh = 1.6 * (1 - Math.pow(al / 1.9, 2));
      if (Math.abs(al) < 1.9 && Math.abs(ac) < sh * 0.6 + 0.05) best = { t:tl, p:q, k:'l', v:ac, i:i }; }
    return best; }
  function render(t){ var cam = camAt(t), f = norm(sub(cam.tg, cam.pos)), r = norm(cross(f, V(0, 1, 0))), u = cross(r, f), foc = (W / 2) / Math.tan(cam.fov * Math.PI / 360), ro = cam.pos, sun = norm(V(0.4, 0.8, 0.45));
    var inCloud = ro[1] > CL0 && ro[1] < CL1 ? 1 - Math.abs((ro[1] - (CL0 + CL1) / 2) / ((CL1 - CL0) / 2)) : 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++){ var px2 = (x + 0.5 - W / 2) / foc, py2 = (H / 2 - y - 0.5) / foc, rd = norm(add(f, add(mul(r, px2), mul(u, py2)))), col, o2 = (y * W + x) * 4;
      // what the ray meets: the ground below or the cloud deck (its underside or its top), the house, the stalk and its leaves
      var tg = 1e9, kind = 'sky';
      if (ro[1] < CL0){ if (rd[1] < -1e-4){ tg = -ro[1] / rd[1]; kind = 'ground'; } else if (rd[1] > 1e-4){ tg = (CL0 - ro[1]) / rd[1]; kind = 'under'; } }
      else if (ro[1] > CL1){ if (rd[1] < -1e-4){ tg = (CL1 - ro[1]) / rd[1]; kind = 'top'; } }
      var hb = ro[1] > CL1 - 2 ? hitBox(ro, rd, HOUSE) : null; if (hb && hb.t < tg){ tg = hb.t; kind = 'house'; }
      var sh = stalkHit(ro, rd, Math.min(tg, 120));
      if (sh){ if (sh.k === 's'){ var tw = Math.sin(Math.atan2(sh.p[2] - axis(sh.p[1])[1], sh.p[0] - axis(sh.p[1])[0]) * 3 + sh.p[1] * 0.8); col = tw > 0.55 ? [138, 208, 106] : tw > -0.2 ? [78, 160, 64] : [52, 122, 44]; col = mul(col, 0.7 + 0.3 * Math.max(0, dot(sh.n, sun))); }
        else { var vein = Math.abs(sh.v) < 0.06; col = vein ? [46, 104, 34] : (sh.i % 2 ? [90, 174, 70] : [74, 152, 58]); }
        col = lerpV(col, [214, 232, 250], 1 - Math.exp(-sh.t / 200)); }
      else if (kind === 'ground') col = country(add(ro, mul(rd, tg)), tg);
      else if (kind === 'under'){ var pu = add(ro, mul(rd, tg)), nb = vnz(pu[0] * 0.06, 21, pu[2] * 0.06); col = lerpV(nb > 0.55 ? [236, 240, 248] : [196, 206, 222], [214, 232, 250], 1 - Math.exp(-tg / 160)); }
      else if (kind === 'top') col = landTop(add(ro, mul(rd, tg)), tg);
      else if (kind === 'house'){ var ph = add(ro, mul(rd, tg)); col = ph[1] > CL1 + 7.5 ? [52, 52, 64] : (Math.abs(ph[0] - 2) < 1.6 && ph[1] < CL1 + 4 && hb.n[2] > 0.5 ? [74, 46, 22] : lerpV([150, 146, 134], [180, 174, 158], vnz(ph[0], ph[1], 23)));
        col = mul(col, 0.72 + 0.28 * Math.max(0, dot(hb.n, sun))); col = lerpV(col, [214, 232, 250], 1 - Math.exp(-tg / 300)); }
      else col = sky(rd);
      // the cloud deck between: a ray that crosses it on its way is whited out by how much cloud it went through
      if (!sh || sh.t > 1){ var c0 = (CL0 - ro[1]) / (rd[1] || 1e-9), c1 = (CL1 - ro[1]) / (rd[1] || 1e-9), ta = Math.max(0, Math.min(c0, c1)), tb = Math.min(sh ? sh.t : tg, Math.max(c0, c1));
        if (tb > ta && (kind !== 'under' && kind !== 'top')){ var thick = clamp((tb - ta) / 14, 0, 1); col = lerpV(col, [244, 247, 252], thick * 0.95); } }
      if (inCloud) col = lerpV(col, [244, 247, 252], Math.min(0.92, inCloud * 1.4));
      D[o2] = col[0]; D[o2 + 1] = col[1]; D[o2 + 2] = col[2]; D[o2 + 3] = 255; }
    bx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    var Wc = cv.width, Hc = cv.height, k9 = Wc / 390;
    var say = function(txt, c1, c2, wob){ ctx.font = 'bold ' + Math.round(44 * k9) + 'px Anton, Impact, sans-serif'; var fit = Math.min(1, Wc * 0.9 / Math.max(1, ctx.measureText(txt).width)); ctx.font = 'bold ' + Math.round(44 * k9 * fit) + 'px Anton, Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.lineWidth = 6 * k9; ctx.strokeStyle = c1; ctx.strokeText(txt, Wc / 2 + wob, Hc * 0.2); ctx.fillStyle = c2; ctx.fillText(txt, Wc / 2 + wob, Hc * 0.2); };
    if (t > 4 && t < 6.6) say('HE CLIMBED AND HE CLIMBED!', '#1e1a14', '#ffffff', Math.sin(t * 6) * 2 * k9);
    else if (t > 9 && t < 11) say('FEE-FI-FO-FUM!', '#1e1a14', '#ffe08a', Math.sin(t * 9) * 3 * k9);
    return cam; }
  if (o.still) return { at:function(t){ var c = render(t); if (t > 10) wrap.classList.add('cap'); return c; }, close:finish };
  if (reduce){ render(5.4); wrap.classList.add('cap'); setTimeout(finish, 1600); return; }
  function frame(now){ if (done) return; try{ step(now); }catch(e){ return finish(); } if (!done) requestAnimationFrame(frame); }
  function step(now){ if (!t0) t0 = now; var t = (now - t0) / 1000;
    var a = performance.now(); render(t); var fe = performance.now() - a; ftime += fe; frames++;
    if (frames > 4){ slow += fe; slowN++; if (slowN >= 15){ if (slow / slowN > 22 && W > 104) setRes(Math.max(104, Math.round(W * 0.86))); slow = 0; slowN = 0; } }
    if (t > 10) wrap.classList.add('cap'); if (t > DUR) finish(); }
  requestAnimationFrame(frame);
  return { stats:function(){ return { frames:frames, ms:frames ? ftime / frames : 0, W:W }; }, at:function(t){ return render(t); } };
}
root.RTT_PUTT_TRIP = { play:play, sail:sail, fall:fall, glass:glassLeg, beanstalk:beanLeg, PLANETS:PLANETS, ISLES:ISLES };
})();
