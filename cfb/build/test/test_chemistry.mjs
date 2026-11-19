/* The chemistry links between two college players, off the real data. No browser, no network.
 *
 *   node cfb/build/test/test_chemistry.mjs
 *
 * A TRANSFER PLAYED AT EVERY SCHOOL HE PLAYED AT (2026-11-19). A row is one season at one
 * school, so the program link once compared only the two rows' schools, and a transfer's
 * season shared nothing with the school he left. The NFL game had the same miss on its joined
 * college field. This holds the fix, and holds the links it must not change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(path.join(ROOT, 'cfb/engine.js'));
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data', f), 'utf8'));
const pl = rd('cfb_player_seasons.json');
const base = { battery: rd('cfb_battery.json'), coaches: rd('cfb_coaches.json'), curated: rd('cfb_curated.json') };
const ctx = { ...base, schools: E.schoolsByPlayer(pl) };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const row = (name, season, school) => pl.find((p) => p.name === name && p.season === season && (!school || p.school === school));
const links = (a, b, c = ctx) => E.pairLinks(a, b, c);
const has = (ls, type, label) => ls.some((l) => l.type === type && (!label || l.label === label));

// The report: two Oklahoma men, each in his own season.
const dede = row('Dede Westbrook', 2016, 'Oklahoma');
const andrews17 = row('Mark Andrews', 2017, 'Oklahoma');
const andrews16 = row('Mark Andrews', 2016, 'Oklahoma');
ok(dede && andrews17 && andrews16, 'the rows are in the data');
ok(has(links(dede, andrews16), 'teammates', 'Teammates on the 2016 Oklahoma'), 'one season: teammates');
ok(has(links(dede, andrews17), 'program', 'Both played at Oklahoma'), 'two seasons: both played at Oklahoma');
ok(!has(links(dede, andrews16), 'program'), 'teammates are not also a program link');

// A transfer: Jalen Hurts's Oklahoma season and an Alabama man.
const hurtsOU = row('Jalen Hurts', 2019, 'Oklahoma');
const bama = pl.find((p) => p.school === 'Alabama' && p.season === 2017 && p.name !== 'Jalen Hurts');
ok(hurtsOU && bama, 'a transfer and a man from the school he left');
ok(!has(links(hurtsOU, bama, base), 'program'), 'without the schools map: the old one row comparison');
ok(has(links(hurtsOU, bama), 'program', 'Both played at Alabama'), 'with it: both played at Alabama');
ok(has(links(bama, hurtsOU), 'program', 'Both played at Alabama'), 'either way round');

// The label names a school they share, and the row's own school first.
const hurtsBama = row('Jalen Hurts', 2017, 'Alabama') || row('Jalen Hurts', 2018, 'Alabama');
const sooner = pl.find((p) => p.school === 'Oklahoma' && p.season === 2018);
if (hurtsBama && sooner) {
  ok(has(links(hurtsBama, sooner), 'program', 'Both played at Oklahoma'), "his Alabama season and an Oklahoma man: Oklahoma");
}

// A pair with no school in common gets no program link.
const stranger = pl.find((p) => !ctx.schools[p.player_id].includes('Oklahoma') && !ctx.schools[p.player_id].includes('Alabama'));
ok(!has(links(dede, stranger), 'program'), 'no shared school, no program link');

// The map: one entry a player, every school, in season order.
const multi = Object.values(ctx.schools).filter((l) => l.length > 1).length;
ok(multi > 400, `the data has transfers (${multi})`);
ok(JSON.stringify(ctx.schools[hurtsOU.player_id]) === JSON.stringify(['Alabama', 'Oklahoma']), 'Hurts: Alabama, then Oklahoma');

// The average lift barely moves: about one roster in sixteen gains a program link.
const rng = E.createSeededRNG(7);
let before = 0, after = 0; const N = 8000;
for (let i = 0; i < N; i++) {
  const r = []; const used = new Set();
  while (r.length < 6) { const p = pl[Math.floor(rng() * pl.length)]; if (used.has(p.team_season_id)) continue; used.add(p.team_season_id); r.push(p); }
  before += E.resolveChemistry(r, base).multiplier; after += E.resolveChemistry(r, ctx).multiplier;
}
const d = (after - before) / N * 100;
ok(d > 0 && d < 0.2, `average lift up ${d.toFixed(3)} points on random rosters, under 0.2`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
