/* THE OUTLINE OF THE COUNTRY, AS PATHS, FROM A PUBLIC DOMAIN SOURCE.
 *
 *   NODE_USE_ENV_PROXY=1 node cfb/build/fetch-usmap.mjs
 *
 * Commish Simulator draws a map, and the map wants a country under the dots. A PNG would
 * have done it, and there were two reasons not to.
 *
 * The first is licensing. The obvious PNGs of a US outline come from stock sites whose terms
 * are personal use only, and runthe.gg carries advertising. Natural Earth is explicitly
 * public domain, with no permission needed and no attribution required, so nothing about
 * this can come back later.
 *
 * The second is that a picture cannot do the job. The map has to fill a state in a
 * conference's colour, draw itself in when the screen arrives, and flash the one state that
 * just changed hands. That is per-state geometry or it is nothing, and a flat image is one
 * shape with no states in it.
 *
 * PROJECTED HERE, IN THE PAGE'S OWN COORDINATES, so the outline and the school dots cannot
 * drift apart. The constants below are the same ones cfb/commish/index.html uses for MAP,
 * and cfb/build/test/commish/test_map.mjs asserts that real campuses land inside the right
 * real states, which is the check that catches a projection change on either side.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  console.error('Node will not use the configured proxy, so this would 403.\n'
    + 'Re-run as:  NODE_USE_ENV_PROXY=1 node cfb/build/fetch-usmap.mjs\n');
  process.exit(2);
}

const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/'
  + 'geojson/ne_110m_admin_1_states_provinces.geojson';

/* THE SAME WINDOW THE PAGE DRAWS IN. Equirectangular, which is wrong for a globe and right
   for one country at this size: the eye is not being asked to measure anything, and the two
   things that must agree (a state's shape and a campus inside it) agree because both go
   through this. */
const MAP = { lat0: 24.4, lat1: 49.4, lon0: -125.0, lon1: -66.9, w: 340, h: 190 };
const X = (lon) => ((lon - MAP.lon0) / (MAP.lon1 - MAP.lon0)) * MAP.w;
const Y = (lat) => MAP.h - ((lat - MAP.lat0) / (MAP.lat1 - MAP.lat0)) * MAP.h;

/* ALASKA AND HAWAII ARE NOT DRAWN. No school in this game's data plays in either, and
   including them would either stretch the window until the lower forty-eight were a smudge
   or leave two shapes floating outside it. Left out on purpose rather than by accident. */
const SKIP = new Set(['Alaska', 'Hawaii']);

/* Douglas-Peucker. The map renders about 340 points wide, so tenths of a pixel of coastline
   are bytes nobody can see. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    /* Distance to the SEGMENT, and to the endpoint when the segment has no length. The
       version that always divided by the segment length read every point of a closed ring
       as zero away from it, because a ring's first and last point are the same point: the
       baseline had no direction, the numerator was zero, and every state simplified to two
       vertices and was then dropped for being too small. Every state. */
    const d = len < 1e-9
      ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
      : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, idx + 1), tol).slice(0, -1)
    .concat(simplify(pts.slice(idx), tol));
}

/* A RING IS NOT A LINE. Cut it at the vertex furthest from the start, simplify the two arcs
   separately, and rejoin: that gives Douglas-Peucker two well-formed open polylines instead
   of one closed loop it cannot measure. */
function simplifyRing(ring, tol) {
  const pts = ring.slice();
  const first = pts[0], last = pts[pts.length - 1];
  if (pts.length > 1 && first[0] === last[0] && first[1] === last[1]) pts.pop();
  if (pts.length < 4) return pts;
  let fi = 1, fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) { fd = d; fi = i; }
  }
  const a = simplify(pts.slice(0, fi + 1), tol);
  const b = simplify(pts.slice(fi).concat([pts[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

const r = await fetch(SRC, { headers: { 'User-Agent': 'runthe.gg-cfb-build/1.0' } });
if (!r.ok) throw new Error('natural earth ' + r.status);
const geo = await r.json();

const TOL = 0.35;
const out = [];
let rawPts = 0, keptPts = 0;

for (const f of geo.features) {
  const p = f.properties || {};
  if (p.admin !== 'United States of America') continue;
  const name = p.name;
  if (!name || SKIP.has(name)) continue;
  const g = f.geometry;
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  const subpaths = [];
  for (const poly of polys) {
    /* Outer ring only. The holes in these shapes are lakes, and a lake at this size is a
       speck that costs bytes and reads as a rendering fault. */
    const ring = poly[0];
    rawPts += ring.length;
    const proj = ring.map(([lon, lat]) => [X(lon), Y(lat)]);
    const small = simplifyRing(proj, TOL);
    if (small.length < 3) continue;
    keptPts += small.length;
    subpaths.push('M' + small.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + 'Z');
  }
  if (!subpaths.length) continue;
  out.push({
    code: p.postal || (p.iso_3166_2 || '').replace('US-', '') || name.slice(0, 2).toUpperCase(),
    name,
    d: subpaths.join(''),
  });
}

out.sort((a, b) => (a.code < b.code ? -1 : 1));
const payload = { viewBox: [0, 0, MAP.w, MAP.h], map: MAP, states: out };
fs.writeFileSync(ROOT + '/cfb/data/us_states.json', JSON.stringify(payload) + '\n');

/* WHICH STATE EACH CAMPUS IS IN, worked out here because this is the only place that has
   both the polygons and the coordinates. The map tints a state by the conference that holds
   most of it, and doing the point-in-polygon in the browser would mean shipping the whole
   outline twice over: once to draw and once to ask. */
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
const RINGS = out.map((s) => ({
  code: s.code,
  rings: s.d.split('M').filter(Boolean).map((sp) =>
    sp.replace(/Z$/, '').split('L').map((pt) => pt.trim().split(/\s+/).map(Number))),
}));
try {
  const pfile = ROOT + '/cfb/data/cfb_places.json';
  const places = JSON.parse(fs.readFileSync(pfile, 'utf8'));
  let tagged = 0, orphan = [];
  for (const school in places) {
    const p = places[school];
    const x = X(p.lon), y = Y(p.lat);
    let hit = null;
    for (const s of RINGS) { for (const r of s.rings) if (inRing(x, y, r)) { hit = s.code; break; } if (hit) break; }
    if (hit) { p.state = hit; tagged++; } else { delete p.state; orphan.push(school); }
  }
  fs.writeFileSync(pfile, JSON.stringify(places) + '\n');
  console.log('tagged ' + tagged + ' campuses with a state'
    + (orphan.length ? ', outside the outline: ' + orphan.join(', ') : ''));
} catch (e) {
  console.log('cfb_places.json not tagged: ' + e.message);
}

const bytes = fs.statSync(ROOT + '/cfb/data/us_states.json').size;
console.log('states: ' + out.length);
console.log('points: ' + rawPts + ' in, ' + keptPts + ' kept (tolerance ' + TOL + 'px)');
console.log('wrote cfb/data/us_states.json, ' + (bytes / 1024).toFixed(1) + 'KB');
console.log('source: Natural Earth 110m admin-1, public domain');
