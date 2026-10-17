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
 *
 * RE-RECORDED A SIXTH TIME, ON PURPOSE, because the owner found the shoulders
 * too bulbous. The deltoid is smaller and sits lower, the bicep swells less and
 * half way down rather than a third, the upper arm is thinner where it meets
 * the shoulder, and the shoulders and chest are a little narrower.
 *
 * RE-RECORDED A SEVENTH TIME, ON PURPOSE, because the owner found the neck too
 * long and tubular and the shoulders still bulging at the top. The head sits
 * lower, the neck is short, narrow under the jaw and flares into a slope of
 * trapezius at its base, and the deltoid cap is smaller and lower with the arm
 * starting just under the shoulder point, so nothing rises above the shoulder
 * line.
 *
 * RE-RECORDED AN EIGHTH TIME, ON PURPOSE, for the camera the owner asked for:
 * 3/4 top down from a corner (30 degrees down, the man turned 35), with the
 * anatomy to carry it. The torso has depth (pecs, lats, shoulder blades), the
 * figure is about six and a half heads tall, and the face is placed on the
 * skull in 3D. Every one of the 960 moved, which is the whole drawing seen
 * from a new place rather than a pixel drifting.
 *
 * RE-RECORDED A NINTH TIME, ON PURPOSE: the owner found the chest too big for
 * the hips, the neck disconnected with too wide a base, and the shoes ovals.
 * The chest and pecs are smaller and the hips fuller, the neck is narrower at
 * the base and drawn as the same piece as the torso so no seam shows, and the
 * shoes are basketball sneakers: a flat cupsole, a toe box, a heel counter, a
 * high-top collar, a midsole, laces, a side stripe and a heel tab.
 *
 * RE-RECORDED A TENTH TIME, ON PURPOSE: the owner found the necks too long.
 * The head sits lower and the shoulders a little higher. With it the head got
 * a profile (a jaw and chin, a brow ridge, cheekbones and a modelled nose) so
 * a face from the corner reads as looking somewhere, and every hairline climbs
 * at the front so the forehead and the eyes show.
 *
 * RE-RECORDED AN ELEVENTH TIME, ON PURPOSE: the owner found the jersey cut too
 * low and asked for team designs and a number that fits the chest. The tank
 * is an NBA crew neck now, with wider straps and shallower armholes; each club
 * wears a design keyed by its two colours (KITS: double trim, side panels,
 * pinstripes, a sash, chest bands, a fade); and at a fine trace the number is
 * printed on the cloth in the body's own units, smaller, turning with the
 * chest. These hashes are a single resolution trace, where the number is
 * still stamped on the screen.
 *
 * RE-RECORDED A TWELFTH TIME, ON PURPOSE: the owner found the arms too short
 * and the waist too thin against the hips. A hanging arm now reaches the
 * middle of the thigh, with the wrist at the seat of the shorts. The limit
 * that keeps an arm straight up under the top of the canvas had been applied
 * to every pose, and it bound at the default height; it now applies only as
 * the hand rises above the shoulder. The waist is wider, so the torso falls
 * into the hips instead of pinching above them.
 *
 * RE-RECORDED A THIRTEENTH TIME, ON PURPOSE: with the cutscenes redrawn as 3D
 * rooms the owner asked for the characters to be cleaned up. Stubble was a
 * checkerboard on the jaw and read as noise at the size a face is drawn; it is
 * a shadow with a few darker flecks now. A standing arm hung dead straight; it
 * carries a slight bend at the elbow, the forearm a little toward the camera.
 * The shoulder cap is a touch smaller and lower so it does not knob above the
 * arm. The neck and the head did not move: the owner has asked twice for a
 * short neck.
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
let failed = false;
if (moved.length) { console.log('  FAIL: these moved: ' + moved.slice(0, 12).join(', ')); failed = true; }

/* THE FINE TRACES AND THE MOVING FRAMES ARE HELD TOO (2026-10-17). The 960
   above are a single resolution trace of the still poses, and a court, a
   portrait and a cutscene draw a fine trace (2 to 4 pixels a cell) of a
   moving frame, turned to the court. The speed pass (B22) made the tracer
   faster without moving a pixel, and these 72 are how that stays true: four
   looks (his own face, a faceless real man, court wear greying at 36, the
   street look) in six poses at each fine size, hashed from baller.js as it
   was before that pass (claude/rtf-art-rooms, baller.js?v=28). Like the 960,
   they move only for a redraw the owner has said yes to. */
const FINE_LOOKS = [
  [{ skin: 4, hair: 'afro', hc: 6, beard: 'full' }, { c1: '#1d428a', c2: '#ffc72c', num: 83, age: 24, yaw: 60 }],
  [{ skin: 3, hair: 'fade', build: 'lean' }, { c1: '#ce1141', c2: '#000000', num: '', age: 26, faceless: true, yaw: 60 }],
  [{ skin: 0, hair: 'braids', hc: 3, build: 'strong', shoes: 'club', beard: 'goatee' }, { c1: '#00471B', c2: '#EEE1C6', num: 34, age: 36, cwear: { band: { k: 'wide', c: ['#ff0000'] }, sleeveL: { k: 'arm', c: ['#111111'] } } }],
  [{ skin: 7, hair: 'long', hc: 1, build: 'lean' }, { c1: '#552583', c2: '#FDB927', num: 0, ctx: 'street', wear: { top: { k: 'hoodie', c: ['#333333'] }, hat: { k: 'cap', c: ['#aa0000'] } } }],
];
const FINE_POSES = ['stand', 'cheer0', 'shot2', 'dunk3', 'bounce5', 'suit'];
const FINE_WANT = {
  '0:stand:2': 'f9f8ccba979f668e', '0:cheer0:2': '9c3d4072d2f6b70c', '0:shot2:2': '26fc14bfb14dfeef', '0:dunk3:2': '572d5e16178f14d8',
  '0:bounce5:2': 'd6cb20ba6113d40e', '0:suit:2': 'c7c0ad2c35ef735d', '0:stand:3': '2a93278950931096', '0:cheer0:3': '1e0dda658e74c841',
  '0:shot2:3': '73d97c144fe62b35', '0:dunk3:3': '35f50eb2d80f5152', '0:bounce5:3': 'e5153e6fde1a4a30', '0:suit:3': 'e3bec8efba2b37af',
  '0:stand:4': 'a3742ad1e79bfdb7', '0:cheer0:4': 'ba4f49caba7927d8', '0:shot2:4': '6f6e5d67a020581d', '0:dunk3:4': 'be5b8285dd8a7394',
  '0:bounce5:4': 'b36e64ca7e6e6c8e', '0:suit:4': '55e691905242fc7c', '1:stand:2': '2627cf0caece85c3', '1:cheer0:2': 'c6933a258cbf91ac',
  '1:shot2:2': 'a7d3c612ff4800a0', '1:dunk3:2': 'b8fdc3c22aa911e9', '1:bounce5:2': '1e7e427cb8c5b638', '1:suit:2': '807e1f3a5e6f82ee',
  '1:stand:3': 'c4926da88aaef3be', '1:cheer0:3': '6c7905575afce620', '1:shot2:3': '607d8e7e88cdd84a', '1:dunk3:3': '8807e7a709044692',
  '1:bounce5:3': '0c32b746463758d2', '1:suit:3': '50d2b5b8c1475d98', '1:stand:4': 'e17341f026f09f0e', '1:cheer0:4': '77089e9c0b61ed5a',
  '1:shot2:4': 'ee828e785d95a471', '1:dunk3:4': 'e01d5dd641945828', '1:bounce5:4': 'e70810381dc1a024', '1:suit:4': 'a7e518efa4c91c8d',
  '2:stand:2': '175999e1708344f4', '2:cheer0:2': '2f7a9d434c61a3c1', '2:shot2:2': '9216897ab33c0e94', '2:dunk3:2': '0f644df5e2fb8cb2',
  '2:bounce5:2': '2253464bfccb93af', '2:suit:2': 'a51a895d4784fd5c', '2:stand:3': '3c67e4f11e3427b3', '2:cheer0:3': '3d4329a0aa225cbb',
  '2:shot2:3': '4deb793cee7d5a20', '2:dunk3:3': 'd08015da5e06e771', '2:bounce5:3': 'a542b6dc2c4b6d4d', '2:suit:3': 'f2f633e8192dfad3',
  '2:stand:4': 'fde42c26f28f1348', '2:cheer0:4': 'ceeb52c53cb26cf9', '2:shot2:4': '1b5f9dabd1de32e6', '2:dunk3:4': '82c3ab3fa612ba65',
  '2:bounce5:4': 'b03296af7b55e90e', '2:suit:4': 'cf91c0273d038d21', '3:stand:2': '02ac80ce68f6d2b8', '3:cheer0:2': '7c5885a78234193b',
  '3:shot2:2': '9b36cf13aa1a5310', '3:dunk3:2': 'f7042880883d844f', '3:bounce5:2': 'dc6937cc9e5df65f', '3:suit:2': '49f68b6af18ec8dd',
  '3:stand:3': '68a86771f1952767', '3:cheer0:3': 'bc136c94db14b53e', '3:shot2:3': '4a59bf0725a12ff2', '3:dunk3:3': '430a965868b261f5',
  '3:bounce5:3': '1d08c3202b8c8535', '3:suit:3': 'dfbf9fad8774dca9', '3:stand:4': '7d6057808a6bc72d', '3:cheer0:4': 'c43b05675212699b',
  '3:shot2:4': '37e8d8f560af23b0', '3:dunk3:4': '91a77db5bdcc119a', '3:bounce5:4': 'ea98bf43e9cb9f3b', '3:suit:4': 'a6fac538a8437b06',
};
const fineNow = {};
FINE_LOOKS.forEach(([look, o], i) => { for (const res of [2, 3, 4]) for (const pose of FINE_POSES) {
  fineNow[[i, pose, res].join(':')] = crypto.createHash('sha1').update(JSON.stringify(B.paint(look, Object.assign({}, o, { pose, res })))).digest('hex').slice(0, 16);
} });
const fineMoved = Object.keys(FINE_WANT).filter((k) => FINE_WANT[k] !== fineNow[k]);
console.log(`${Object.keys(FINE_WANT).length} fine traces compared, ${fineMoved.length} changed`);
if (Object.keys(FINE_WANT).length !== 72 || Object.keys(fineNow).length !== 72) { console.log('  FAIL: the fine sample is not the 72 it was recorded as'); failed = true; }
if (fineMoved.length) { console.log('  FAIL: these moved: ' + fineMoved.slice(0, 12).join(', ')); failed = true; }

/* THE FAST LENGTH IS Math.hypot, BIT FOR BIT. Every shape in the tracer is a
   distance, and baller.js measures it with hyp2 and hyp3 rather than
   Math.hypot (six times faster). They are only allowed because they return
   exactly what Math.hypot does: a last-bit difference can tip a pixel over a
   threshold somewhere no sample above happens to look. */
{
  let n = 0, bad = 0, seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const SPECIAL = [0, -0, NaN, Infinity, -Infinity, 1e-300, -1e-300, 1e300, 5e-324, 1, -1, 0.5];
  const val = () => { const k = rnd(); return k < 0.03 ? SPECIAL[Math.floor(rnd() * SPECIAL.length)] : (rnd() - 0.5) * Math.pow(10, rnd() * 8 - 4); };
  const same = (a, b) => Object.is(a, b);
  for (let i = 0; i < 400000; i++) {
    const a = val(), b2 = val(), c = val();
    n += 2;
    if (!same(B._hyp3(a, b2, c), Math.hypot(a, b2, c))) bad++;
    if (!same(B._hyp2(a, b2), Math.hypot(a, b2))) bad++;
  }
  /* and the grid a trace walks: steps of a fine pixel, near-equal sides */
  for (let i = 0; i < 200000; i++) {
    const a = (i % 977) / 16 - 30, b2 = ((i * 7) % 641) / 8 - 40, c = (i % 13) * 0.07;
    n += 2;
    if (!same(B._hyp3(a, b2, c), Math.hypot(a, b2, c))) bad++;
    if (!same(B._hyp2(a, c), Math.hypot(a, c))) bad++;
  }
  console.log(`${n} lengths compared with Math.hypot, ${bad} differ`);
  if (bad) { console.log('  FAIL: hyp2 or hyp3 is not Math.hypot to the last bit'); failed = true; }
}
if (failed) process.exit(1);
