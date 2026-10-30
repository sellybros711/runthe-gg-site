/* The lab's facts for every pack, read from the real packs so the scene never carries a typed number.
 *
 *   node shut-the-door/lab/pipeline/extract_lab.mjs
 *
 * Writes shut-the-door/3d/assets/packs/<pack>.json (and index.json, the list) with:
 *   pitcher     name, throws, team colours, and his arsenal (velo, pfx, shape: catcher's view)
 *   usHome      whether the closer's side is at home (home whites, road greys)
 *   batters     each hitter's side against this pitcher and his zone (the pack), his height and weight
 *               (assets/bio.json, MLB Stats API), and his look: skin tone, facial hair, jaw guard and
 *               a generic number, all drawn from a hash of his id. None of it is his real look or
 *               number: no likeness.
 *   plays       real outcomes from the pack's own pitch list (a real ball, called strike, swinging
 *               strike, foul, hit by pitch, and balls in play by kind, with their real exit velocity,
 *               launch angle and spray), for the lab to show each motion. The game itself drives the
 *               scene with the engine's PitchResult.
 *   release     a stand in release point (not in the pack): a typical set for his hand, labelled so
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { look } from '../../3d/looks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.join(HERE, '..', '..', 'data', 'packs');
const OUT = path.join(HERE, '..', '..', '3d', 'assets', 'packs');
const bio = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '3d', 'assets', 'bio.json'), 'utf8')).batters;
fs.mkdirSync(OUT, { recursive: true });

const index = [];
for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort()) {
  const pack = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));
  const sc = pack.scenario, p = sc.pitcher;
  const id = f.replace(/\.json$/, '');
  // the pack's pitch list: [id, velo, result, bb, ev, la, spray]
  const pick = (pred) => { const e = pack.pitches.find(pred); return e ? { id: e[0], velo: e[1], result: e[2], bb: e[3], ev: e[4], la: e[5], spray: e[6] } : null; };
  const plays = {
    ball: pick((e) => e[2] === 'ball'),
    called_strike: pick((e) => e[2] === 'called_strike'),
    swinging_strike: pick((e) => e[2] === 'swinging_strike'),
    foul: pick((e) => e[2] === 'foul' && e[5] != null && e[6] != null) || pick((e) => e[2] === 'foul'),
    foul_tip: pick((e) => e[2] === 'foul_tip'),
    hit_by_pitch: pick((e) => e[2] === 'hit_by_pitch'),
    ground: pick((e) => e[2] === 'in_play' && e[3] === 'ground' && e[4] != null),
    line: pick((e) => e[2] === 'in_play' && e[3] === 'line' && e[4] != null),
    fly: pick((e) => e[2] === 'in_play' && e[3] === 'fly' && e[4] != null),
    popup: pick((e) => e[2] === 'in_play' && e[3] === 'popup' && e[4] != null),
  };
  const facts = {
    source: `data/packs/${f}`, scenarioId: sc.id, title: sc.title,
    pitcher: { name: p.name, team: p.team, throws: p.throws, teamColors: p.teamColors,
      arsenal: p.arsenal.map((a) => ({ type: a.type, name: a.name, velo: a.velo, pfxX: a.pfxX, pfxZ: a.pfxZ, shape: a.shape, sigmaFt: a.sigmaFt })) },
    situation: { usHome: !!sc.situation.usHome, inning: sc.situation.inning, half: sc.situation.half },
    release: { x: p.throws === 'L' ? 1.9 : -1.9, y: 54.0, z: 5.6, assumed: 'not in the pack: a stand in release for his hand, feet, catcher view' },
    batters: sc.batters.map((b) => {
      const bi = bio[b.id];
      return { id: b.id, bats: b.bats, szTop: b.szTop, szBot: b.szBot,
        heightIn: bi ? bi.heightIn : null, weightLb: bi ? bi.weightLb : null, ...look(b.id) };
    }),
    plays,
  };
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(facts) + '\n');
  index.push(id);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index) + '\n');
console.log(`wrote ${index.length} packs to ${path.relative(process.cwd(), OUT)}`);
