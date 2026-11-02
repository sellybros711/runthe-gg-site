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
   spaceTrip() hands the trip here and keeps its own flat version for when this file is missing or throws. PLANETS is where
   Mars and Saturn will join. */
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
  var c = Math.hypot(x, (y - 2.9) * 1.1, z); if (c < 1.35) return c < 1.0 && hash(Math.round(x * 5), Math.round(y * 5), Math.round(z * 5)) < 0.25 ? '#4f9a3a' : (y > 3.3 ? '#3f8a3a' : '#2f6e2e');
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
  saturn:{ R:240, paint:null, air:null, giant:{ R:900, off:[-1500, 900, -2600], band:['#e8d2a0', '#d8b878', '#f0dfb4', '#c8a060', '#e2c88c', '#b8905a'] } }
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

// ---------------------------------------------------------------- the player
function play(host, o, cb){
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
    var M = mm(rotX(flip), rotY(t * 0.25 + (t > 4.2 ? (t - 4.2) * 0.6 : 0)));
    if (tilt) M = mm([1, 0, 0, 0, Math.cos(tilt), -Math.sin(tilt), 0, Math.sin(tilt), Math.cos(tilt)], M);
    var base = flip > 1.6 ? V(0, y - 0.75, 0) : V(0, y + 1.05, 0);              // the nozzle or (flipped) the legs sit on the ground
    return { p:base, y:y, M:M, flip:flip, burn:t > 2.35 && !(t > 6.9 && t < 7.7) && t < 9.05, retro:t > 8.0 }; }
  function camAt(t, rk){ var P = rk.p, shake = 0;
    if (t < 4.2){ var lift = clamp((t - 2.4) / 1.8, 0, 1); shake = t > 2.3 ? 0.08 * (1 - lift * 0.4) : 0;
      var pos = lerpV(V(7.5, 1.4, 9.5), V(9, 3, 12), lift), tg = V(0, Math.min(3.4 + P[1] * 0.9, P[1] + 3.4), 0);
      return { pos:add(pos, V(Math.sin(t * 41) * shake, Math.sin(t * 37) * shake, 0)), tg:tg, up:V(0, 1, 0), fov:62 }; }
    if (t < 7.6){ // the chase: above and behind, looking down past the rocket at the Earth falling away, then round in front to the Moon
      var s2 = smooth((t - 5.6) / 1.6), off = lerpV(V(4.5, 8, 11), V(5, -13, 7.5), s2), roll = Math.sin(t * 2.3) * 0.06;
      var pos2 = add(P, off), tg2 = add(P, lerpV(V(0, 1.5, 0), V(0, 26, 0), s2 * s2)), up2 = norm(lerpV(V(Math.sin(roll), 1, 0), V(Math.sin(roll), 0.15, 1), s2));
      return { pos:add(pos2, V(Math.sin(t * 29) * 0.05, Math.sin(t * 31) * 0.05, 0)), tg:tg2, up:up2, fov:lerp(58, 64, s2) }; }
    // the landing: the Moon's underside is the ground now, so the camera's up is -y
    var s3 = smooth((t - 7.6) / 1.6), dist = lerp(16, 13, s3), pos3 = V(dist * 0.6, rk.y + lerp(-14, -3.2, s3), dist * 0.85), tg3 = V(0, rk.y - 3.4, 0);
    if (t < 9) tg3 = lerpV(add(P, V(0, -3, 0)), tg3, s3);
    return { pos:pos3, tg:tg3, up:V(0, -1, 0), fov:60 }; }
  function sunAt(t){ var s4 = smooth((t - 6.4) / 2); return norm(lerpV(V(-0.55, 0.72, 0.72), V(-0.55, -0.72, 0.72), s4)); }

  // ---- rays
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

  /* WHAT A PLANET LOOKS LIKE where a ray meets it: its colour and its normal. The Earth: grass by the pad, its land and clouds
     from afar. The Moon: grey, its craters bent into the light, and a field of small ones near the ground. Mars: its rust and
     dark lowlands from afar, and near the ground the dust, scattered dark rocks and the odd crater. */
  function surf(kind, ro, rd, tt, C, near){ var pe = add(ro, mul(rd, tt)), ne = norm(sub(pe, C)), col;
    if (kind === 'earth'){ var nr = Math.hypot(pe[0], pe[2]);
      if (nr < 80 && near){ var gh = hash(Math.floor(pe[0] * 3.5), Math.floor(pe[2] * 3.5), 1); col = gh < 0.18 ? [63, 138, 58] : gh > 0.9 ? [118, 186, 92] : [84, 160, 72]; }
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
    var GI = PLANETS[TOK].giant, GC = GI ? add(CM, GI.off) : null, GN = GI ? norm(V(0.25, 0.94, 0.22)) : null;
    var alt = len(sub(cam.pos, CE)) - Re, sky = FROMK === 'earth' ? smooth(alt / 260) : 1, padOn = alt < 120, altM = len(sub(cam.pos, CM)) - Rm, nearMoon = altM < 260,
      air = TOK === 'mars' ? 1 - smooth(altM / 90) : 0, upM = norm(sub(cam.pos, CM)), airF = FROMK === 'mars' ? 1 - smooth(alt / 90) : 0, upE = norm(sub(cam.pos, CE));
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
      if (GI && alt > 160){ var tg = hitSphere(cam.pos, rd, GC, GI.R); if (tg > 0 && tg < best){ best = tg; id = 8; var pg = add(cam.pos, mul(rd, tg)), ng = norm(sub(pg, GC)), lat = dot(ng, GN);
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
        if (air > 0){ var gm = clamp(dot(rd, upM), 0, 1); out = lerpV(out, lerpV([236, 182, 140], [176, 108, 80], Math.sqrt(gm)), air); }
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
      parts.push({ p:V(Math.cos(an) * 1.2, 0.6, Math.sin(an) * 1.2), v:V(Math.cos(an) * spd, 0.4 + hash(s, t, 9) * 1.2, Math.sin(an) * spd), r:0.9, life:3, age:0, kind:'smoke', c:FROMK === 'moon' ? [190, 188, 184] : FROMK === 'mars' ? [214, 150, 112] : [232, 232, 238], a:0.85 }); } }
    if (t > 8.7 && t < 9.4){ for (var d = 0, nd = many(70); d < nd; d++){ var a2 = hash(d, t * 1e3, 17) * 6.283, s2 = 3 + hash(d, t * 1e3, 18) * 5;
      parts.push({ p:V(Math.cos(a2) * 0.8, HM - 0.15, Math.sin(a2) * 0.8), v:V(Math.cos(a2) * s2, -0.6 - hash(d, t, 19), Math.sin(a2) * s2), r:0.35, life:1.5, age:0, kind:'dust', c:TOK === 'mars' ? [206, 122, 80] : TOK === 'saturn' ? [230, 236, 250] : [196, 192, 184], a:0.7 }); } }
    parts.forEach(function(p){ p.age += dt; if (p.lp) p.lp = add(p.lp, mul(p.lv, dt)); else p.p = add(p.p, mul(p.v, dt)); var k = p.age / p.life;
      if (p.kind === 'fire'){ p.c = k < 0.25 ? [255, 255, 220] : k < 0.5 ? [255, 214, 80] : k < 0.75 ? [255, 140, 40] : [200, 70, 30]; p.r = 0.4 + k * 0.5; }
      else if (p.kind === 'smoke'){ p.v = mul(p.v, 1 - dt * 0.9); p.r = 0.9 + k * 3.2; p.a = 0.85 * (1 - k); }
      else if (p.kind === 'dust'){ p.v = mul(p.v, 1 - dt * 1.4); p.r = 0.35 + k * 1.1; p.a = 0.7 * (1 - k); }
      else { p.r = 0.3 + k * 0.8; p.a = 0.8 * (1 - k); } });
    parts = parts.filter(function(p){ return p.age < p.life; }); if (parts.length > 700) parts.splice(0, parts.length - 700); }

  // the countdown, painted big over the picture
  function overlay(t){ if (t >= 2.6) return; var s = cv.width / 390; ctx.font = 'bold ' + Math.round(64 * s) + 'px Anton, Impact, sans-serif'; ctx.textAlign = 'center';
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

root.RTT_PUTT_TRIP = { play:play, PLANETS:PLANETS };
})();
