/* The shipped data files, checked for the things a player notices before a test does.
 *
 *   node cfb/build/test/test_player_data.mjs
 *
 * Every assertion here exists because somebody looked at their phone and found it,
 * which is the wrong order and the reason this file was written:
 *
 *   a name printed as "Isaih Pacheco", and six surnames as "Mcmillan", and two
 *     suffixes as "Ii";
 *   a chemistry label reading "Sr. threw Robiskie 8 touchdowns in 2008", because a
 *     suffix is not a surname;
 *   a player with a fantasy average and a blank where his season should be, because
 *     every category of his stat line fell under its display threshold;
 *   and a spin that offered two men and asked you to pick one of them.
 *
 * None of those threw. None of them showed up in any other suite. They are all
 * properties of the data as shipped, so they are checked against the data as shipped.
 *
 * No database, no browser, no API key.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/' + f, 'utf8'));

const { fixName, lastName, MIN_GAMES } = await import(ROOT + '/cfb/build/lib.mjs');
const { statLine } = await import(ROOT + '/cfb/build/01-players.mjs');

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const some = (list, n) => list.slice(0, n).join(' | ');

const players = rd('cfb_player_seasons.json');
const teamSeasons = rd('cfb_team_seasons.json');
const battery = rd('cfb_battery.json');

console.log('=== every player says something about his season ===');
/* THE ONE THAT WAS REPORTED. A blank line beside a real fantasy average reads as broken
   data, not as a quiet season, and ninety-three players shipped that way. */
const blank = players.filter((p) => !p.stat_line || !String(p.stat_line).trim());
ok('no player has an empty stat line', blank.length === 0,
  blank.length ? some(blank.map((p) => p.name + ' ' + p.season), 5) : String(players.length) + ' players');
const noFppg = players.filter((p) => p.fppg === null || p.fppg === undefined);
ok('every player has a fantasy average', noFppg.length === 0, String(noFppg.length));

/* And the function itself, on the shape that produced the blanks: a backup quarterback
   who clears none of the display thresholds. */
const quiet = statLine('QB', {
  completions: 25, attempts: 44, passing_yards: 247, passing_tds: 1, passing_interceptions: 2,
  carries: 9, rushing_yards: 31, rushing_tds: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0,
});
ok('a season under every threshold still prints its numbers', /247 pass yds/.test(quiet), quiet);
const nothing = statLine('QB', {
  completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, passing_interceptions: 0,
  carries: 0, rushing_yards: 0, rushing_tds: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0,
});
ok('a season with genuinely nothing in it says so in words', nothing.length > 0 && !/^\s*$/.test(nothing), nothing);
/* And the tidiness the thresholds are there for is still tidy. */
const trick = statLine('RB', {
  completions: 1, attempts: 1, passing_yards: 8, passing_tds: 0, passing_interceptions: 0,
  carries: 210, rushing_yards: 1180, rushing_tds: 12, receptions: 20, receiving_yards: 190, receiving_tds: 1,
});
ok('a running back who threw one pass is not billed as a passer', !/pass yds/.test(trick), trick);

console.log('\n=== names are printed, so they are spelled the way they are printed ===');
const wrong = players.filter((p) => fixName(p.name) !== p.name);
ok('no name the pipeline would correct is still in the file', wrong.length === 0,
  wrong.length ? some([...new Set(wrong.map((p) => p.name + ' -> ' + fixName(p.name)))], 6) : 'all clean');
ok('no name is empty or whitespace', players.every((p) => p.name && p.name.trim().length > 1));

console.log('\n=== a suffix is not a surname ===');
const labels = Object.values(battery).flat();
const suffixed = labels.filter((l) => /(^|\s)(Jr\.|Sr\.|II|III|IV|V) threw |threw (Jr\.|Sr\.|II|III|IV|V) /.test(l.label));
ok('no chemistry label names a suffix instead of a man', suffixed.length === 0,
  suffixed.length ? some(suffixed.map((l) => l.label), 4) : String(labels.length) + ' labels');
/* The build bakes these and the game draws its field chips at run time, so the two have
   to agree on what a man is called. */
const nameOf = new Map(players.map((p) => [p.player_id + '|' + p.season, p.name]));
let mismatched = 0;
const examples = [];
for (const [qbKey, list] of Object.entries(battery)) {
  for (const l of list) {
    const qb = nameOf.get(qbKey), rec = nameOf.get(l.receiver);
    if (!qb || !rec) continue;
    const want = lastName(qb) + ' threw ' + lastName(rec) + ' ';
    if (!l.label.startsWith(want)) { mismatched++; if (examples.length < 4) examples.push(l.label + '  (expected ' + want + '...)'); }
  }
}
ok('every label names the two men the link is between', mismatched === 0, some(examples, 4) || String(labels.length) + ' checked');

console.log('\n=== every board the wheel can land on is a choice ===');
const data = R.indexData(players, teamSeasons);
const run = R.createRun({ seed: 1 });
/* Asked through drawable() rather than by re-implementing its rule, so the floor cannot
   be right here and wrong in the game. */
const pool = R.drawable(run, data);
const sizes = pool.map((t) => (data.playersByTeamSeason[t.team_season_id] ?? []).length).sort((a, b) => a - b);
ok('the wheel can reach a real spread of teams', pool.length > 1300, String(pool.length) + ' team-seasons');
ok('no team the wheel can land on offers fewer than four men', sizes[0] >= 4,
  'smallest ' + sizes[0] + ', median ' + sizes[Math.floor(sizes.length / 2)]);
/* And the ones held back are held back for the stated reason and no other. */
const held = teamSeasons.filter((t) => !pool.some((p) => p.team_season_id === t.team_season_id));
ok('the teams held back are only the ones too thin to draft from',
  held.every((t) => (data.playersByTeamSeason[t.team_season_id] ?? []).length < 4),
  held.map((t) => t.team_season_id + '=' + (data.playersByTeamSeason[t.team_season_id] ?? []).length).join(', ') || 'none');

console.log('\n=== the file is the shape the game reads ===');
const positions = new Set(players.map((p) => p.position));
ok('every position is one the slots know', [...positions].every((p) => ['QB', 'RB', 'WR', 'TE'].includes(p)),
  [...positions].join(', '));
const priced = players.filter((p) => !(p.price_musd > 0 && p.price_musd <= E.CONSTANTS.CAP_MUSD));
ok('every price is a real price inside the cap', priced.length === 0, String(priced.length));
const shortSeason = players.filter((p) => Number(p.games_played) < MIN_GAMES);
ok('nobody is in the file on fewer games than the minimum', shortSeason.length === 0,
  shortSeason.length ? some(shortSeason.map((p) => p.name + ' ' + p.games_played + 'g'), 4) : 'min ' + MIN_GAMES);
const badTs = players.filter((p) => !p.team_season_id || !p.school || !p.season);
ok('every player belongs to a team and a season', badTs.length === 0, String(badTs.length));

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
