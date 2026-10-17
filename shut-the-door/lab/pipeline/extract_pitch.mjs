/* The lab's pitch facts, read from the real pack so the scene never carries a typed number.
 *
 *   node shut-the-door/lab/pipeline/extract_pitch.mjs
 *
 * Writes shut-the-door/lab/assets/pitch.json: the pitcher, his arsenal (velo and pfx, catcher's
 * view, from the pack) and the batter the scene shows (Daulton Varsho: side and zone). The two
 * sample pitches (which cell is aimed at, where it lands) are SAMPLE and labelled so: the lab
 * shows one pitch, not an engine draw. The release point is not in the pack; RELEASE below is a
 * stand in (a typical right hander's set) and is labelled so in the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = path.join(HERE, '..', '..', 'data', 'packs', 'std-2025-ws7-yamamoto.json');
const OUT = path.join(HERE, '..', 'assets', 'pitch.json');

const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
const sc = pack.scenario;
const p = sc.pitcher;
const batter = sc.batters.find((b) => b.name === 'Daulton Varsho');
const pick = (t) => {
  const a = p.arsenal.find((x) => x.type === t);
  return { type: a.type, name: a.name, velo: a.velo, pfxX: a.pfxX, pfxZ: a.pfxZ, shape: a.shape, sigmaFt: a.sigmaFt };
};

const out = {
  source: 'data/packs/std-2025-ws7-yamamoto.json',
  pitcher: { name: p.name, throws: p.throws, teamColors: p.teamColors },
  batter: { name: batter.name, bats: batter.bats, szTop: batter.szTop, szBot: batter.szBot },
  release: { x: -1.9, y: 54.0, z: 5.6, assumed: 'not in the pack: a stand in right handed release, feet, catcher view' },
  pitches: {
    swing: { ...pick('FS'), aimCell: 22, missFt: { x: 0.08, z: 0.1 }, sample: 'aim and miss are a sample, not an engine draw', batter: 'swing' },
    take: { ...pick('CU'), aimCell: 16, missFt: { x: 0.1, z: 0.14 }, sample: 'aim and miss are a sample, not an engine draw', batter: 'take', call: 'strike' },
  },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log('wrote', path.relative(process.cwd(), OUT));
