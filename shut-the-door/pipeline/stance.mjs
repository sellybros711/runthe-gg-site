/* Each hitter's real batting stance (rules 12): how far off the plate he stands, from Statcast.
 *
 *   node shut-the-door/pipeline/stance.mjs           write the packs (fetches the seasons it has not cached)
 *   node shut-the-door/pipeline/stance.mjs --check   fail if a pack is not what this writes (needs the cache)
 *
 * Baseball Savant's batting stance (MLB glossary, Batting Stance) measures, for every hitter and
 * side, his average distance off the plate: the midpoint of his hips from the plate's inside edge
 * (inches), one second before the release, over his swings of a season. Savant has it from 2023.
 * The leaderboard's CSV (visuals/batting-stance, avg_batter_x_position, one row per hitter and side)
 * is read for 2023 to 2026, hitters with MIN_SWINGS swings or more that season.
 *
 * Each pack hitter (scenario.batters, every half's) gets:
 *   stanceIn    his distance off the plate, inches, one decimal, from the side he bats in the pack
 *   stanceYear  the season it was measured in
 *   stanceSrc   'season': the pack's own season. 'near': Savant has no row for him that season, and
 *               this is his nearest season within NEAR seasons (the later one on a tie), a proxy the
 *               data says it is.
 * A hitter Savant does not have (every pack before 2021, and anyone short of MIN_SWINGS) gets none of
 * the three, and the game stands him where it stands the league's average hitter (contract.js
 * HBP.STANCE_IN, 28 in; 3d/inplay-plan.js STANCE_X). Nothing is filled in for him.
 *
 * Only rules 12 reads it (contract.js hbpReachAt): the reach moves with where he stands. The 3D stands
 * him there (people.js setupBatter). Then build_schedule.mjs moves the pack's v, and SCHEDULE_V in api.js.
 *
 * Run 2026-11-06 on the 30 packs: 272 hitters, 70 at their own season's stance, 17 at a near one (the
 * 2021 and 2022 packs, from 2023), 185 at the league average. The 2024 league (691 hitter sides,
 * MIN_SWINGS 1) averages 27.6 in, the hitters with a 2024 hit by pitch 27.6 in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.join(HERE, '..', 'data', 'packs');
const CACHE = path.join(HERE, 'cache', 'http');
const CHECK = process.argv.includes('--check');
const SEASONS = [2023, 2024, 2025, 2026];
const MIN_SWINGS = 50, NEAR = 2;
const url = (y) => `https://baseballsavant.mlb.com/visuals/batting-stance?seasonStart=${y}&seasonEnd=${y}&minSwings=${MIN_SWINGS}&csv=true`;
export const SOURCE = (y) => `batting stance (distance off the plate): Baseball Savant ${y} ${url(y)} (pipeline/stance.mjs)`;

function parseCsv(t) {
  t = t.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows.shift();
  return rows.filter((r) => r.length === h.length).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

function season(y) {
  const file = path.join(CACHE, `batting-stance-${y}-min${MIN_SWINGS}.csv`);
  if (!fs.existsSync(file)) {
    if (CHECK) throw new Error(`no cached ${file}: run without --check first`);
    fs.mkdirSync(CACHE, { recursive: true });
    execFileSync('curl', ['-sS', '-m', '120', '--retry', '3', '--fail', '-o', file + '.part', url(y)]);
    if (!fs.readFileSync(file + '.part', 'utf8').includes('avg_batter_x_position')) throw new Error(`${url(y)}: not the stance CSV`);
    fs.renameSync(file + '.part', file);
  }
  const out = new Map();
  for (const r of parseCsv(fs.readFileSync(file, 'utf8'))) {
    const x = +r.avg_batter_x_position;
    if (r.id && (r.side === 'L' || r.side === 'R') && Number.isFinite(x)) out.set(`${r.id}|${r.side}`, x);
  }
  if (out.size < 300) throw new Error(`${y}: only ${out.size} hitter sides`);
  return out;
}

const S = new Map();
for (const y of SEASONS) S.set(y, season(y));

/** His stance for a pack of season y, batting from side: { in, year, src } or null. */
export function stanceOf(id, side, y) {
  if (S.get(y) && S.get(y).has(`${id}|${side}`)) return { in: S.get(y).get(`${id}|${side}`), year: y, src: 'season' };
  for (let d = 1; d <= NEAR; d++) for (const z of [y + d, y - d]) {
    if (S.get(z) && S.get(z).has(`${id}|${side}`)) return { in: S.get(z).get(`${id}|${side}`), year: z, src: 'near' };
  }
  return null;
}

const files = fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort();
const r1 = (x) => Math.round(x * 10) / 10;
let changed = 0, n = 0, own = 0, near = 0;
const wrong = [];
for (const f of files) {
  const pack = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8'));
  const sc = pack.scenario, y = +String(sc.id).match(/^std-(\d{4})-/)[1];
  let touched = false;
  const years = new Set();
  for (const b of sc.batters) {
    n++;
    const s = /^\d+$/.test(b.id) ? stanceOf(b.id, b.bats, y) : null;
    const want = s ? { stanceIn: r1(s.in), stanceYear: s.year, stanceSrc: s.src } : { stanceIn: undefined, stanceYear: undefined, stanceSrc: undefined };
    if (s) { years.add(s.year); if (s.src === 'season') own++; else near++; }
    for (const [k, v] of Object.entries(want)) {
      if (b[k] === v) continue;
      if (CHECK) wrong.push(`${sc.id} ${b.name}: ${k} ${b[k]}, Savant gives ${v}`);
      if (v === undefined) delete b[k]; else b[k] = v;
      touched = true;
    }
  }
  // the sources: one line a season this pack's stances came from, and no other stance line
  const keep = sc.sources.filter((s) => !s.startsWith('batting stance (distance off the plate)'));
  const lines = [...years].sort().map(SOURCE);
  if (JSON.stringify([...keep, ...lines]) !== JSON.stringify(sc.sources)) {
    if (CHECK) wrong.push(`${sc.id}: the stance sources`);
    sc.sources = [...keep, ...lines]; touched = true;
  }
  if (touched && !CHECK) { fs.writeFileSync(path.join(PACKS, f), JSON.stringify(pack)); changed++; }
}
console.log(`${n} hitters: ${own} at his own season's stance, ${near} at a near season's, ${n - own - near} at the league average`);
if (wrong.length) { console.error(wrong.join('\n')); process.exit(1); }
console.log(CHECK ? 'stances ok' : `wrote ${changed} packs`);
