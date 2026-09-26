#!/usr/bin/env node
// Builds globe/data/city-<id>.json: the real streets, river and parks of one
// city centre, from OpenStreetMap, for the Street Hunt mode.
//
// THIS CANNOT RUN IN THE DEV SANDBOX. Overpass is refused there, the same split
// hoops/build documents for Basketball-Reference. It runs on a GitHub runner
// (.github/workflows/globe-city.yml) and commits the file back.
//
//   node globe/build/osm-city.mjs paris
//   node globe/build/osm-city.mjs paris --from saved-overpass.json   (offline)
//
// WHAT IS KEPT, AND WHY
//   streets   every walkable road class a tourist would use. Footways and
//             service roads are left out: they triple the file and turn every
//             courtyard into a maze.
//   junctions a street node shared by two ways is a junction and is NEVER
//             simplified away. The game walks a graph, and a simplifier that
//             drops the shared node disconnects two streets that meet.
//   water     natural=water and riverbank polygons, stitched from their member
//             ways and clipped to the box.
//   parks     leisure=park / garden, the same way.
//   notable   buildings carrying a wikidata tag: the landmarks themselves.
//
// COORDINATES are metres from the box centre, x east and y SOUTH (screen
// order), rounded to whole metres. `origin` is kept so the game can project a
// lat/lon (a landmark) into the same space.
//
// OSM data is (c) OpenStreetMap contributors, ODbL. The game shows that line.

import fs from 'node:fs';
import path from 'node:path';

const CITIES = {
  paris: { name: 'Paris', country: 'FR', bbox: [48.8470, 2.2830, 48.8775, 2.3600] }, // S W N E
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const HW = {
  motorway: 0, trunk: 0, primary: 0, motorway_link: 0, trunk_link: 0, primary_link: 0,
  secondary: 1, secondary_link: 1,
  tertiary: 2, tertiary_link: 2,
  unclassified: 3, residential: 3, living_street: 3,
  pedestrian: 4,
};

const args = process.argv.slice(2);
const id = args[0];
if (!id || !CITIES[id]) { console.error('usage: osm-city.mjs <' + Object.keys(CITIES).join('|') + '> [--from file]'); process.exit(2); }
const C = CITIES[id];
const fromIdx = args.indexOf('--from');
const [S, W, N, E] = C.bbox;
const bb = `${S},${W},${N},${E}`;

const Q_ROADS = `[out:json][timeout:180];
way["highway"~"^(${Object.keys(HW).join('|')})$"](${bb});
out body;
>;
out skel qt;`;
// A SEPARATE REQUEST. Asked in the same query as the roads, this half came
// back empty on the first runner build: 4,600 streets and no river at all.
const Q_AREAS = `[out:json][timeout:180];
(
  way["natural"="water"](${bb});
  relation["natural"="water"](${bb});
  way["waterway"="riverbank"](${bb});
  relation["waterway"="riverbank"](${bb});
  way["leisure"~"^(park|garden)$"](${bb});
  relation["leisure"~"^(park|garden)$"](${bb});
  way["building"]["wikidata"](${bb});
  relation["building"]["wikidata"](${bb});
);
out geom;`;

async function fetchOverpass(QUERY) {
  let last;
  for (const ep of ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`Overpass: ${ep} (try ${attempt + 1})`);
        const r = await fetch(ep, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'runthe.gg globe street hunt builder' },
          body: 'data=' + encodeURIComponent(QUERY),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (!j.elements || !j.elements.length) throw new Error('no elements');
        return j;
      } catch (e) {
        last = e; console.log('  failed: ' + e.message);
        await new Promise(res => setTimeout(res, 8000));
      }
    }
  }
  throw last;
}

let raw;
if (fromIdx >= 0) raw = JSON.parse(fs.readFileSync(args[fromIdx + 1], 'utf8'));
else {
  const a = await fetchOverpass(Q_ROADS);
  const b = await fetchOverpass(Q_AREAS);
  raw = { elements: a.elements.concat(b.elements) };
  const dir = path.join('globe', 'build', 'raw');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `overpass-${id}.json`), JSON.stringify(raw));
}
const tally = {};
for (const el of raw.elements) { const t = el.type + (el.tags ? ':' + (el.tags.highway ? 'road' : el.tags.natural || el.tags.waterway || el.tags.leisure || (el.tags.building ? 'building' : 'other')) : ''); tally[t] = (tally[t] || 0) + 1; }
console.log('elements:', JSON.stringify(tally));

// ---- projection: equirectangular about the box centre, metres ----
const lat0 = (S + N) / 2, lon0 = (W + E) / 2;
const MY = 111320, MX = 111320 * Math.cos(lat0 * Math.PI / 180);
const proj = (lat, lon) => [(lon - lon0) * MX, (lat0 - lat) * MY];
const [bx0, by0] = proj(N, W), [bx1, by1] = proj(S, E);   // x0<x1, y0<y1

// ---- douglas-peucker on an index range, keeping protected points ----
function dp(pts, tol, keep) {
  const n = pts.length; if (n <= 2) return pts.map((_, i) => i);
  const mark = new Uint8Array(n); mark[0] = mark[n - 1] = 1;
  if (keep) for (let i = 0; i < n; i++) if (keep[i]) mark[i] = 1;
  // simplify each run between consecutive marked points
  const anchors = []; for (let i = 0; i < n; i++) if (mark[i]) anchors.push(i);
  for (let a = 0; a < anchors.length - 1; a++) {
    const stack = [[anchors[a], anchors[a + 1]]];
    while (stack.length) {
      const [i0, i1] = stack.pop(); if (i1 - i0 < 2) continue;
      const [ax, ay] = pts[i0], [bx, by] = pts[i1];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
      let best = -1, bd = tol;
      for (let i = i0 + 1; i < i1; i++) {
        const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
        if (d > bd) { bd = d; best = i; }
      }
      if (best >= 0) { mark[best] = 1; stack.push([i0, best], [best, i1]); }
    }
  }
  const out = []; for (let i = 0; i < n; i++) if (mark[i]) out.push(i); return out;
}

// ---- streets: a node table shared by every way ----
const nodeLL = new Map();
for (const el of raw.elements) if (el.type === 'node') nodeLL.set(el.id, [el.lat, el.lon]);
const roads = raw.elements.filter(el => el.type === 'way' && el.tags && HW[el.tags.highway] !== undefined && el.nodes);
const use = new Map();
for (const w of roads) for (const nd of new Set(w.nodes)) use.set(nd, (use.get(nd) || 0) + 1);

const nodeIdx = new Map(); const nodes = [];
const nameIdx = new Map(); const names = [];
function nid(osm) {
  let i = nodeIdx.get(osm); if (i !== undefined) return i;
  const [la, lo] = nodeLL.get(osm); const [x, y] = proj(la, lo);
  i = nodes.length / 2; nodes.push(Math.round(x), Math.round(y)); nodeIdx.set(osm, i); return i;
}
// Names reach the player (the street pill, the map labels), and this repo
// allows no em or en dash anywhere a player reads. OSM writes both. A spaced
// one is a name plus a subtitle ("Promenade des Berges de la Seine, then the
// quay"), so it takes a colon. A bare one joins two words ("Odeon" and
// "Theatre de l'Europe"), so it takes a hyphen. The two characters are built
// from their code points because the dash checker rightly refuses to see
// them written in any form, and scripts/check-dashes.mjs guards the output.
const DASHES = String.fromCharCode(8211, 8212);
const SPACED = new RegExp('\\s+[' + DASHES + ']\\s+', 'g'), BARE = new RegExp('[' + DASHES + ']', 'g');
function undash(s) { return s.replace(SPACED, ': ').replace(BARE, '-'); }
function nm(s) {
  if (!s) return -1;
  s = undash(s);
  let i = nameIdx.get(s); if (i === undefined) { i = names.length; names.push(s); nameIdx.set(s, i); } return i;
}
const ways = [];
let dropped = 0;
for (const w of roads) {
  const ids = w.nodes.filter(n => nodeLL.has(n));
  if (ids.length < 2) { dropped++; continue; }
  const pts = ids.map(n => proj(...nodeLL.get(n)));
  const keep = ids.map(n => (use.get(n) || 0) > 1);
  const kept = dp(pts, 1.5, keep);
  const t = w.tags;
  const flags = (t.bridge && t.bridge !== 'no' ? 1 : 0) | (t.tunnel && t.tunnel !== 'no' ? 2 : 0);
  // [class, nameIndex, flags, node, node, ...]
  ways.push([HW[t.highway], nm(t.name), flags, ...kept.map(k => nid(ids[k]))]);
}

// ---- polygons: stitch member ways into rings, then clip to the box ----
function stitch(segs) {
  const rings = []; const open = segs.map(s => s.slice()).filter(s => s.length > 1);
  const key = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
  while (open.length) {
    let ring = open.shift();
    let guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 5000) {
      const tail = key(ring[ring.length - 1]);
      let j = open.findIndex(s => key(s[0]) === tail);
      if (j >= 0) { ring = ring.concat(open.splice(j, 1)[0].slice(1)); continue; }
      j = open.findIndex(s => key(s[s.length - 1]) === tail);
      if (j >= 0) { ring = ring.concat(open.splice(j, 1)[0].reverse().slice(1)); continue; }
      break;   // cannot close: keep it anyway, the clipper closes it
    }
    rings.push(ring);
  }
  return rings;
}
function clipRect(poly, x0, y0, x1, y1) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const inter = [
    (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])],
    (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1],
  ];
  let out = poly;
  for (let e = 0; e < 4 && out.length; e++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = edges[e](cur), pi = edges[e](prev);
      if (ci) { if (!pi) out.push(inter[e](prev, cur)); out.push(cur); }
      else if (pi) out.push(inter[e](prev, cur));
    }
  }
  return out;
}
const PAD = 300;
function polysOf(el) {
  if (el.type === 'way' && el.geometry) return [{ role: 'outer', ring: el.geometry.map(g => proj(g.lat, g.lon)) }];
  if (el.type === 'relation' && el.members) {
    const outer = [], inner = [];
    for (const m of el.members) {
      if (m.type !== 'way' || !m.geometry) continue;
      (m.role === 'inner' ? inner : outer).push(m.geometry.map(g => [g.lat, g.lon]));
    }
    const res = [];
    for (const r of stitch(outer)) res.push({ role: 'outer', ring: r.map(([a, b]) => proj(a, b)) });
    for (const r of stitch(inner)) res.push({ role: 'inner', ring: r.map(([a, b]) => proj(a, b)) });
    return res;
  }
  return [];
}
function packRing(ring, tol) {
  const c = clipRect(ring, bx0 - PAD, by0 - PAD, bx1 + PAD, by1 + PAD);
  if (c.length < 3) return null;
  // A CLOSED RING HAS THE SAME POINT AT BOTH ENDS, so the first segment
  // Douglas-Peucker measures against has no length and every vertex reads as
  // on it. The first build collapsed all 400 parks and all the river to a
  // single point that way. Pin the vertex farthest from the start as well.
  let far = 0, fd = -1;
  for (let i = 1; i < c.length; i++) { const d = Math.hypot(c[i][0] - c[0][0], c[i][1] - c[0][1]); if (d > fd) { fd = d; far = i; } }
  const keep = []; keep[far] = true;
  const idx = dp(c.concat([c[0]]), tol, keep).slice(0, -1);
  if (idx.length < 3) return null;
  const flat = []; for (const i of idx) flat.push(Math.round(c[i][0]), Math.round(c[i][1]));
  return flat;
}
const water = [], parks = [], notable = [];
const seen = new Set();
for (const el of raw.elements) {
  if (el.type === 'node' || !el.tags) continue;
  const t = el.tags; const k = el.type + el.id; if (seen.has(k)) continue; seen.add(k);
  const isWater = t.natural === 'water' || t.waterway === 'riverbank';
  const isPark = t.leisure === 'park' || t.leisure === 'garden';
  const isNotable = t.building && t.wikidata;
  if (!isWater && !isPark && !isNotable) continue;
  for (const p of polysOf(el)) {
    const flat = packRing(p.ring, isNotable ? 1 : 2.5); if (!flat) continue;
    // [inner?1:0, x,y,...]; inner rings are drawn with evenodd inside the same fill
    const rec = [p.role === 'inner' ? 1 : 0, ...flat];
    if (isWater) water.push(rec);
    else if (isPark) parks.push(rec);
    else notable.push([nm(t['name:en'] || t.name || ''), ...rec]);
  }
}

const out = {
  id, name: C.name, country: C.country,
  origin: [lat0, lon0], bbox: C.bbox,
  box: [Math.round(bx0), Math.round(by0), Math.round(bx1), Math.round(by1)],
  attribution: '(c) OpenStreetMap contributors, ODbL',
  built: undefined,
  names, nodes, ways, water, parks, notable,
};
delete out.built;   // no clock in the file: a rebuild that changed nothing changes no bytes
const file = path.join('globe', 'data', `city-${id}.json`);
fs.writeFileSync(file, JSON.stringify(out));
const kb = (fs.statSync(file).size / 1024).toFixed(0);
console.log(`${file}: ${ways.length} streets (${dropped} dropped), ${nodes.length / 2} nodes, ${names.length} names, ${water.length} water, ${parks.length} parks, ${notable.length} notable, ${kb} KB`);
if (ways.length < 500 || !water.length) { console.error('Too little came back. Refusing to call this a city.'); process.exit(1); }
