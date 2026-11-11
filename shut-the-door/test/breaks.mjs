/* Shut The Door: which way the break arrows point (breaks.js), per pitch type and hand.
 *   node shut-the-door/test/breaks.mjs
 *
 * The 3D flight's side and size are held by lab/pipeline/check-pitches.mjs. This holds the 2D side:
 * the chevrons on the aim and the pitch guide's in or away, for a righty and a lefty, against a
 * right and a left handed hitter, on every arsenal pitch in every pack (as thrown, and mirrored to
 * the other hand), on a league shaped arsenal for each hand, and on the page's own wiring.
 *
 * Angles are degrees off straight down, positive to his glove side, on the movement breaks.js draws
 * (a fastball against the average four-seam, any other pitch against his own fastball, with gravity).
 * Before 2026-11-10 the sideways was against no spin: Lidge's slider read 3 degrees, Sewald's sweeper
 * 37, and Devin Williams' cutter pointed arm side. Each of those fails here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const B = require('../breaks.js');
const C = require('../contract.js');

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

/* the pitcher's view, as aim.js SCREEN_U reads it from screenCol() */
const U = C.screenCol(C.cellOf(0, 1)) - C.screenCol(C.cellOf(0, 0)) > 0 ? 1 : -1;
check('the screen is the pitcher\'s view (screenCol mirrors)', U === -1);

const GLOVE = new Set(['FC', 'SL', 'ST', 'SV', 'CU', 'KC']);
const ARM = new Set(['FF', 'SI', 'CH', 'FS', 'FO']);
const DOWN = new Set(['SL', 'ST', 'SV', 'CU', 'KC', 'CH', 'FS', 'FO']);
/* degrees off straight down for each type: [lo, hi] (positive glove side). Loose on purpose: real
   pitchers differ (a gyro slider is mostly down, a sweeper mostly across), but a frame that leaves
   the fastball's run out of the sideways, or flips a hand, falls outside. */
const BAND = {
  SL: [15, 65], ST: [35, 80], SV: [20, 70], CU: [8, 40], KC: [8, 40], FC: [30, 115],
  CH: [-50, 0], FS: [-50, 0], FO: [-50, 0],
};

/* glove side in inches for this hand (a righty's glove side is x > 0, catcher's view) */
const gloveOf = (x, throws) => (throws === 'R' ? x : -x);
/* the screen x of the chevrons, from his glove side: from behind him, a righty's glove side is to the
   left, a lefty's to the right */
const screenGlove = (dx, throws) => (throws === 'R' ? -dx : dx);
const angle = (m, throws) => Math.atan2(gloveOf(m.x, throws), -m.z) * 180 / Math.PI;
const mirror = (ars) => ars.map((a) => Object.assign({}, a, { pfxX: -a.pfxX }));

function holdArsenal(tag, ars, throws, out) {
  for (const a of ars) {
    const name = tag + ' ' + throws + 'HP ' + a.type;
    const m = B.move(a, ars, throws), ar = B.arrows(a, ars, throws, U), raw = B.arrows(a, ars, throws, 1);
    if (!m || !ar) { out.push(name + ': no arrows'); continue; }
    const g = gloveOf(m.x, throws), ang = angle(m, throws), sg = screenGlove(ar.dx, throws);
    if (!(ar.n >= 1 && ar.n <= 3)) out.push(name + ': ' + ar.n + ' chevrons');
    if (Math.abs(ar.dx + raw.dx) > 1e-9 || Math.abs(ar.dy - raw.dy) > 1e-9) out.push(name + ': the screen mirror is not the only flip');
    if (Math.abs(Math.hypot(ar.dx, ar.dy) - 1) > 1e-9) out.push(name + ': not a unit direction');
    /* the screen agrees with the movement: glove side on screen exactly when the movement is */
    if (Math.abs(g) > 0.5 && Math.sign(sg) !== Math.sign(g)) out.push(name + ': screen ' + sg.toFixed(2) + ' against glove ' + g.toFixed(1));
    if (GLOVE.has(a.type) && !(g > 0)) out.push(name + ': glove side ' + g.toFixed(1) + ' in');
    /* an arm side pitch never points across to the glove side (none of the packs' does; under 3
       inches of his own run either way is real) */
    if (ARM.has(a.type) && Math.abs(a.pfxX) >= 3 && g > 0.5) out.push(name + ': arm side pitch to the glove side ' + g.toFixed(1));
    if (DOWN.has(a.type) && !(ar.dy > 0)) out.push(name + ': does not point down');
    const band = BAND[a.type];
    if (band && !(ang >= band[0] && ang <= band[1])) out.push(name + ': ' + ang.toFixed(0) + ' degrees, outside ' + band.join(' to '));
    /* the guide's words: his own pfxX, toward this hitter or away */
    for (const bats of ['R', 'L']) {
      const s = B.side(a.pfxX, bats), want = (bats === 'R') === (a.pfxX < 0) ? 'in' : 'away';
      if (s !== want) out.push(name + ' vs ' + bats + 'HH: ' + s);
    }
  }
}

/* 1. every pack, as thrown and mirrored */
const DIR = path.join(HERE, '..', 'data', 'packs');
const packs = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const bad = [];
let rows = 0;
const P = {};
for (const f of packs) {
  const pi = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).scenario.pitcher;
  P[f.replace(/\.json$/, '')] = pi;
  rows += pi.arsenal.length;
  holdArsenal(f, pi.arsenal, pi.throws, bad);
  holdArsenal(f + ' mirrored', mirror(pi.arsenal), pi.throws === 'R' ? 'L' : 'R', bad);
}
check(`every arsenal pitch in ${packs.length} packs (${rows} rows), both hands: side, down, band, chevrons, words`, bad.length === 0, bad.slice(0, 8).join(' | '));

/* 2. a league shaped arsenal for each hand (synthetic: round numbers in the shape of Statcast's
   league averages, catcher's view inches, written for a righty and mirrored for a lefty) */
const LEAGUE_R = [
  { type: 'FF', usage: 0.40, velo: 94.5, pfxX: -7.5, pfxZ: 16 },
  { type: 'SI', usage: 0.15, velo: 93.5, pfxX: -15, pfxZ: 8 },
  { type: 'FC', usage: 0.08, velo: 89, pfxX: 2.5, pfxZ: 8 },
  { type: 'SL', usage: 0.15, velo: 85.5, pfxX: 5, pfxZ: 2 },
  { type: 'ST', usage: 0.07, velo: 82, pfxX: 15, pfxZ: 1 },
  { type: 'CU', usage: 0.07, velo: 79.5, pfxX: 9, pfxZ: -10 },
  { type: 'CH', usage: 0.05, velo: 86, pfxX: -14, pfxZ: 6 },
  { type: 'FS', usage: 0.03, velo: 86, pfxX: -10, pfxZ: 1 },
];
const lg = [];
holdArsenal('league', LEAGUE_R, 'R', lg);
holdArsenal('league', mirror(LEAGUE_R), 'L', lg);
check('a league shaped arsenal, righty and lefty: every type its way', lg.length === 0, lg.join(' | '));
const lgAng = (t, throws) => {
  const ars = throws === 'R' ? LEAGUE_R : mirror(LEAGUE_R), a = ars.find((x) => x.type === t);
  return angle(B.move(a, ars, throws), throws);
};
for (const th of ['R', 'L']) {
  /* off a 94.5 mph four-seam an 82 mph sweeper ends about as far down as across (gravity has longer
     on it), so it reads diagonal here; it is mostly across only on Statcast's induced chart */
  check(`league ${th}HP: the sweeper is the most across of his breaking balls (${lgAng('ST', th).toFixed(0)} against the slider's ${lgAng('SL', th).toFixed(0)})`, lgAng('ST', th) > 40 && lgAng('ST', th) > lgAng('SL', th) + 5);
  check(`league ${th}HP: the slider is between, more across than the curve (${lgAng('SL', th).toFixed(0)} against ${lgAng('CU', th).toFixed(0)})`, lgAng('SL', th) > lgAng('CU', th) + 5);
  check(`league ${th}HP: the curve is mostly down (under 35 degrees, ${lgAng('CU', th).toFixed(0)})`, lgAng('CU', th) < 35);
  check(`league ${th}HP: the changeup runs arm side and down (${lgAng('CH', th).toFixed(0)})`, lgAng('CH', th) < -10 && lgAng('CH', th) > -70);
}

/* 3. the pitchers the frame was fixed on, with their numbers */
const at = (id, t) => { const pi = P[id], a = pi.arsenal.find((x) => x.type === t); return { pi, a, m: B.move(a, pi.arsenal, pi.throws), ar: B.arrows(a, pi.arsenal, pi.throws, U) }; };
{
  const { pi, a, m, ar } = at('std-2005-nlcs5-lidge', 'SL'), ang = angle(m, pi.throws);
  check(`Lidge's slider (pfx ${a.pfxX}, ${a.pfxZ}): a down breaker off his fastball, glove side ${gloveOf(m.x, 'R').toFixed(1)} in, down ${(-m.z).toFixed(1)} in, ${ang.toFixed(0)} degrees, 3 chevrons`,
    ang >= 15 && ang <= 30 && gloveOf(m.x, 'R') > 6 && -m.z > 18 && ar.n === 3);
  check('Lidge\'s slider points left on screen (a righty\'s glove side, from behind him)', ar.dx < -0.2 && ar.dy > 0.8);
  check('Lidge\'s slider is in on a lefty (John Rodriguez) and away from a righty', B.side(a.pfxX, 'L') === 'in' && B.side(a.pfxX, 'R') === 'away');
}
{
  const { pi, m } = at('std-2023-ws1-sewald', 'ST'), ang = angle(m, pi.throws);
  check(`Sewald's sweeper is mostly across (${ang.toFixed(0)} degrees)`, ang > 50);
}
{
  const { pi, a, m } = at('std-2023-williams-sd', 'FC');
  check(`Devin Williams' cutter (pfxX ${a.pfxX}) cuts glove side off his four-seam (${gloveOf(m.x, pi.throws).toFixed(1)} in)`, gloveOf(m.x, pi.throws) > 5);
}
{
  const { pi, ar } = at('std-2025-scott-kc', 'SL');
  check('Tanner Scott\'s slider points right on screen (a lefty\'s glove side) and down', pi.throws === 'L' && ar.dx > 0.2 && ar.dy > 0.5);
}
{
  const { pi, a, ar } = at('std-2010-hoffman-stl', 'CH');
  check(`Hoffman's changeup (pfxX ${a.pfxX}) stays arm side of straight down`, screenGlove(ar.dx, pi.throws) <= 0 && ar.dy > 0.9);
}

/* 4. no fastball in the arsenal: the league's average four-seam stands in, both ways */
{
  const ars = [{ type: 'SL', usage: 1, velo: 85, pfxX: 3, pfxZ: 1 }], m = B.move(ars[0], ars, 'R');
  check('with no fastball, a slider is measured off the average four-seam (its run back in)', Math.abs(m.x - (3 + B.BRK_REF_X)) < 1e-9);
}

/* 5. the page draws this and nothing else: ui.js asks breaks.js, index.html loads it before ui.js */
{
  const ui = fs.readFileSync(path.join(HERE, '..', 'ui.js'), 'utf8'), html = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
  check('ui.js draws the arrows from breaks.js, with no frame of its own', /STD_BREAK\.arrows\(/.test(ui) && !/gravityDrop|BRK_REF/.test(ui));
  const ib = html.indexOf('src="breaks.js'), iu = html.indexOf('src="ui.js');
  check('index.html loads breaks.js before ui.js', ib > 0 && iu > ib);
}

console.log(fails ? `\n${fails} failing` : '\nbreaks: ok');
process.exit(fails ? 1 : 0);
