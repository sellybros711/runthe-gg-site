/*
 * Run The Floor: the player sprite does not change.
 *
 *   node hoops/check-sprite.mjs            compare against the frozen hashes
 *   node hoops/check-sprite.mjs --record   write them (only ever from an
 *                                          unchanged baller.js)
 *
 * The owner redesigned the characters and declared them final. New poses for
 * the animated cutscenes are drawn by the same rig in baller.js, which means
 * that file will be edited, and the way an edit there goes wrong is a pixel
 * moving on a pose nobody meant to touch. Nothing throws and nothing looks
 * broken at a glance: one cell of a shoe is a different shade.
 *
 * So every existing pose is painted for forty looks (every hair, beard, skin,
 * band, sleeve, shoe and build appears), both breath frames, young and greying,
 * and the cell grid is hashed. The hashes in hoops/build/fixtures were recorded
 * from baller.js as of commit 7c75a34, before any cutscene work.
 *
 * RE-RECORDED ONCE, ON PURPOSE, for the hair pass the owner asked for: every
 * style but the afro was redrawn as a silhouette first, and hair got its own
 * ramp so black hair stopped reading grey. That moved 872 of the 960. Every
 * one of the 88 that did not is a bald look, and the only bald ones that did
 * move wear a cap, where bald used to be drawn as a buzz cut. That is the
 * proof the pass touched hair and nothing else.
 *
 * RE-RECORDED A SECOND TIME, ON PURPOSE, for the 3D model the owner asked
 * for: the player is now Run The Tour's style, a posable 3D model put through
 * the golf game's paint step (PXHD), so every one of the 960 moved. That is
 * the whole drawing redone rather than a pixel drifting, and from here on the
 * hashes guard the new drawing exactly as they guarded the old one.
 *
 * RE-RECORDED A THIRD TIME, ON PURPOSE, because the owner found the players
 * too buff and the jersey poor. Lean and Standard got narrower shoulders,
 * smaller delts and thinner arms; only Muscular (the 'strong' id) keeps the
 * broad build. The tank was recut (a round scoop, narrow straps, round
 * armholes, one even trim band) and its number is stamped on the screen so no
 * digit loses a row. The lower body was asked to stay and did not change.
 *
 * RE-RECORDED A FOURTH TIME, ON PURPOSE, because the owner asked for height
 * and weight to show on the figure. The proportions moved off the chibi ones
 * (the head is a smaller share of the body, the legs longer), the body is
 * built from metrics(look) so a taller or heavier player is drawn taller or
 * heavier, the number was cut to a smaller face, and the shorts were narrowed
 * with a thin side trim. That reverses the third pass's lower body rule at the
 * owner's later request. A look with no ht or wt is drawn at the default size,
 * which is what these hashes hold.
 *
 * RE-RECORDED A FIFTH TIME, ON PURPOSE, because the owner said the player did
 * not look human: the eyes read as creepy and the body as a doll. The head is
 * smaller (HEAD_K 0.78 to 0.57), taller than it is wide and sits on a neck;
 * the body is longer to fill the room that freed; the shoulders are square
 * and the torso tapers to a narrow waist instead of a barrel; the shorts no
 * longer flare past the shoulders; an arm has a bicep and a forearm and a
 * smaller hand; a leg has a calf. The face lost its white bars and blush and
 * is a brow, a socket shadow, a small dark eye, a nose shadow and a mouth.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const B = require('./baller.js');
const FILE = path.join(HERE, 'build/fixtures/sprite-hashes.json');
const POSES = ['stand', 'ball', 'up', 'trophy', 'suit', 'cap'];

function looks() {
  const out = [];
  const H = B.HAIRS.map((x) => x[0]), BE = B.BEARDS.map((x) => x[0]), BA = B.BANDS.map((x) => x[0]);
  const SL = B.SLEEVES.map((x) => x[0]), SH = B.SHOES.map((x) => x[0]), BU = B.BUILDS.map((x) => x[0]);
  for (let i = 0; i < 40; i++) {
    out.push({ skin: i % B.SKINS.length, hc: (i * 3) % B.HAIR_COLORS.length, hair: H[i % H.length], beard: BE[(i * 7) % BE.length],
      band: BA[(i * 5) % BA.length], sleeve: SL[(i * 3) % SL.length], shoes: SH[(i * 11) % SH.length], build: BU[i % BU.length] });
  }
  return out;
}
const CLUBS = [['#006BB6', '#F58426'], ['#000000', '#C4CED4'], ['#002D62', '#FDBB30'], ['#CE1141', '#000000'], ['#007A33', '#BA9653']];
function hashAll() {
  const h = {};
  looks().forEach((lk, i) => {
    const cl = CLUBS[i % CLUBS.length];
    for (const pose of POSES) for (const frame of [0, 1]) for (const age of [24, 36]) {
      const g = B.paint(lk, { c1: cl[0], c2: cl[1], num: (i * 7) % 100, pose, frame, age });
      h[[i, pose, frame, age].join(':')] = crypto.createHash('sha1').update(JSON.stringify(g)).digest('hex').slice(0, 16);
    }
  });
  return h;
}
const now = hashAll();
if (process.argv.includes('--record')) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(now));
  console.log('recorded ' + Object.keys(now).length + ' sprite hashes');
  process.exit(0);
}
const want = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const moved = Object.keys(want).filter((k) => want[k] !== now[k]);
console.log(`${Object.keys(want).length} sprites compared, ${moved.length} changed`);
if (moved.length) { console.log('  FAIL: these moved: ' + moved.slice(0, 12).join(', ')); process.exit(1); }
