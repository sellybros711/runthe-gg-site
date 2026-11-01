/* The drawn strike zone for a hitter the packs have no Statcast zone for: from his listed height.
 *
 *   node shut-the-door/pipeline/height_zones.mjs           write the packs
 *   node shut-the-door/pipeline/height_zones.mjs --check   fail if a pack is not what this writes
 *
 * Every Statcast hitter's pack zone (szTop, szBot) is his own: the mean sz_top and sz_bot of the
 * pitches he saw from that hand in the pack's window (build_packs.py). The four Retrosheet packs
 * (1988, 2001, 2005, 2007) have no Statcast, so build_packs.py gives their hitters the league mean,
 * the same zone for all nine. This gives each of them a zone in proportion to his own listed height
 * (MLB Stats API, 3d/looks-data.js): the mean of szTop / height and of szBot / height over every
 * Statcast hitter in the packs, each counted once, times his height. So the zone is the rulebook
 * zone as the Statcast operators marked it on the real hitters here, scaled to him.
 *
 * Only the picture moves. The engine and the grade play the zone in normalised height (zn 0..1 is
 * the zone, whatever its feet) and scale the miss and the call's edge distance by the pack's
 * kernelZoneFt, never by a hitter's szTop or szBot (engine.js, grade.js, contract.js zoneDist). So
 * every call and grade stays as it is, and the zone drawn is the one the engine plays.
 * Then build_schedule.mjs to move the pack's v, and SCHEDULE_V in api.js.
 *
 * Run on the packs 2026-11-01. Held back a day before: written, it made one case of the 3D contact
 * check fail (lab/pipeline/check-contact.mjs, std-2007-ws4-papelbon, Matt Holliday, 6 ft 4, zone
 * 3.56/1.66: a low and away line drive at x -0.75, zn -0.35 met 0.032 m into the wood, past the
 * 0.03 limit). The swing's aim had stalled 0.028 m off the ball (people.js aimAt: a damped step was
 * taken from no aim, not from where the solve was); with that fixed the case ends 0.001 m off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOKS } from '../3d/looks-data.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.join(HERE, '..', 'data', 'packs');
const CHECK = process.argv.includes('--check');
export const SOURCE = 'strike zone (Retrosheet hitters): his listed height (MLB Stats API people) times the mean szTop and szBot per foot of height of the Statcast hitters in the packs (pipeline/height_zones.mjs)';

const files = fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort();
const packs = files.map((f) => [f, JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'))]);

export function ratios(list = packs.map(([, p]) => p)) {
  const seen = new Set();
  let top = 0, bot = 0, n = 0;
  for (const p of list) for (const b of p.scenario.batters) {
    if (!/^\d+$/.test(b.id) || seen.has(b.id)) continue;
    const h = LOOKS.players[b.id] && LOOKS.players[b.id].heightIn;
    if (!h) continue;
    seen.add(b.id); top += b.szTop / (h / 12); bot += b.szBot / (h / 12); n++;
  }
  return { top: top / n, bot: bot / n, n };
}

const r = ratios();
const r2 = (x) => Math.round(x * 100) / 100;
let changed = 0, wrong = [];
for (const [f, pack] of packs) {
  const sc = pack.scenario;
  if (!sc.batters.some((b) => b.id.startsWith('retro:'))) continue;
  let touched = false;
  for (const b of sc.batters) {
    if (!b.id.startsWith('retro:')) continue;
    const h = LOOKS.players[b.id] && LOOKS.players[b.id].heightIn;
    if (!h) { wrong.push(`${sc.id} ${b.name}: no listed height`); continue; }
    const top = r2(h / 12 * r.top), bot = r2(h / 12 * r.bot);
    if (b.szTop !== top || b.szBot !== bot) {
      if (CHECK) wrong.push(`${sc.id} ${b.name}: ${b.szTop}/${b.szBot}, height gives ${top}/${bot}`);
      b.szTop = top; b.szBot = bot; touched = true;
    }
  }
  if (!sc.sources.includes(SOURCE)) { if (CHECK) wrong.push(`${sc.id}: no zone source`); sc.sources.push(SOURCE); touched = true; }
  if (touched && !CHECK) { fs.writeFileSync(path.join(PACKS, f), JSON.stringify(pack)); changed++; }
}
console.log(`zones per foot of height from ${r.n} Statcast hitters: top ${r.top.toFixed(4)}, bottom ${r.bot.toFixed(4)}`);
if (wrong.length) { console.error(wrong.join('\n')); process.exit(1); }
console.log(CHECK ? 'height zones ok' : `wrote ${changed} packs`);
