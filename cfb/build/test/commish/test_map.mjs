/* THE MAP IS A CLAIM ABOUT WHERE PLACES ARE, SO IT GETS CHECKED.
 *
 *   node cfb/build/test/commish/test_map.mjs
 *
 * Two files have to agree and neither knows about the other: cfb_places.json says where a
 * campus is, us_states.json says where a state is, and both were projected by a formula
 * that also lives in the page. If any of those three drift, the dots slide off the country
 * and the only symptom is a map that looks slightly wrong to somebody who knows the shape.
 *
 * So this puts real campuses inside real states by point-in-polygon and names the ones that
 * miss. It is the check that a projection change on either side cannot survive.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
const places = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_places.json', 'utf8'));
const us = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/us_states.json', 'utf8'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* The page's projection, repeated here on purpose: if this copy and the page's copy ever
   disagree the assertions below stop passing, which is the entire point of writing it out
   rather than importing it. */
const M = us.map;
const X = (lon) => ((lon - M.lon0) / (M.lon1 - M.lon0)) * M.w;
const Y = (lat) => M.h - ((lat - M.lat0) / (M.lat1 - M.lat0)) * M.h;

/* Every subpath of a state, as rings of points. */
function ringsOf(d) {
  return d.split('M').filter(Boolean).map((sp) =>
    sp.replace(/Z$/, '').split('L').map((pt) => pt.trim().split(/\s+/).map(Number)));
}
const STATES = us.states.map((s) => ({ code: s.code, name: s.name, rings: ringsOf(s.d) }));

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
const stateAt = (x, y) => {
  for (const s of STATES) for (const r of s.rings) if (inRing(x, y, r)) return s;
  return null;
};

console.log('\n=== the outline itself ===');
{
  ok('the lower forty-eight are all here', STATES.length >= 48, STATES.length + ' shapes');
  ok('  every one has a postal code', STATES.every((s) => /^[A-Z]{2}$/.test(s.code)),
    STATES.map((s) => s.code).join(' '));
  /* A STATE THAT SIMPLIFIED TO NOTHING is the failure that shipped once: a bug in the ring
     handling turned every state into two vertices and the file came out empty of shapes. */
  ok('  and enough vertices to be a shape',
    STATES.every((s) => s.rings.every((r) => r.length >= 3)),
    Math.min(...STATES.flatMap((s) => s.rings.map((r) => r.length))) + ' points in the smallest ring');
  const xs = STATES.flatMap((s) => s.rings.flatMap((r) => r.map((p) => p[0])));
  const ys = STATES.flatMap((s) => s.rings.flatMap((r) => r.map((p) => p[1])));
  ok('  and it fills the window it was drawn for',
    Math.min(...xs) > -6 && Math.max(...xs) < M.w + 6
    && Math.min(...ys) > -6 && Math.max(...ys) < M.h + 6,
    'x ' + Math.min(...xs).toFixed(0) + '..' + Math.max(...xs).toFixed(0)
    + '  y ' + Math.min(...ys).toFixed(0) + '..' + Math.max(...ys).toFixed(0));
}

console.log('\n=== campuses land in the right states ===');
{
  /* Schools whose state nobody could argue about, spread far enough apart that a projection
     that is flipped, offset or scaled cannot satisfy all of them at once. */
  const KNOWN = {
    'Alabama': 'AL', 'Oregon': 'OR', 'Miami': 'FL', 'Texas': 'TX', 'Michigan': 'MI',
    'Washington': 'WA', 'Maine': 'ME', 'Arizona': 'AZ', 'Nebraska': 'NE', 'Georgia': 'GA',
    'Ohio State': 'OH', 'Boston College': 'MA', 'Utah': 'UT', 'LSU': 'LA', 'Kansas': 'KS',
  };
  const wrong = [];
  for (const school in KNOWN) {
    const p = places[school];
    if (!p) continue;
    const hit = stateAt(X(p.lon), Y(p.lat));
    if (!hit || hit.code !== KNOWN[school]) {
      wrong.push(school + ' landed in ' + (hit ? hit.code : 'no state') + ', expected ' + KNOWN[school]);
    }
  }
  ok('the ones nobody could argue about are in the right state', !wrong.length,
    wrong.length ? wrong.join('; ') : Object.keys(KNOWN).filter((k) => places[k]).length + ' checked');

  /* AND THE WHOLE BOARD IS ON DRY LAND. A handful of coastal campuses can legitimately fall
     just outside a simplified coastline, so this is a rate rather than an absolute: what it
     is really catching is a projection that has moved, which puts everybody in the sea. */
  const all = Object.keys(places);
  const missed = all.filter((s) => !stateAt(X(places[s].lon), Y(places[s].lat)));
  ok('  and almost every campus is inside some state',
    missed.length <= Math.ceil(all.length * 0.06),
    (all.length - missed.length) + ' of ' + all.length + ' inside'
    + (missed.length ? '   outside: ' + missed.join(', ') : ''));
}

console.log('\n=== the file is small enough to ship ===');
{
  const kb = fs.statSync(ROOT + '/cfb/data/us_states.json').size / 1024;
  ok('the outline is under 40KB', kb < 40, kb.toFixed(1) + 'KB');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
