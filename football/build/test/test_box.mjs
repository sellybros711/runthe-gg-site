// The live box score: its parser, its scoring rule and its join. No network.
//
//   node football/build/test/test_box.mjs
//
// ESPN cannot be reached from the development sandbox, so the payload below is a saved
// SHAPE rather than a saved game. What it is written to catch is the parser reading a
// column by position, the rule drifting from nflverse's, and a provisional number
// overwriting one nflverse has already written.
import { readBox, halfFromBox, boxScores, crosswalk } from '../espn-box.mjs';

let fails = 0;
const ok = (c, m, d = '') => {
  if (c) console.log('  ok   ' + m);
  else { fails++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); }
};

console.log('\n1. the rule is nflverse\'s, on real rows');
/* Three real 2025 rows, picked for the terms most likely to be dropped: interceptions and a
   lost fumble, two receiving touchdowns, and a return touchdown. None of the three has a
   two point conversion, which the box score cannot see (the first draft of this picked a
   man who threw one and read two points low, correctly). Measured over every 2025 regular
   season row with no two point conversion, the rule matches `fantasy_points` on
   18,443 of 18,443. */
const REAL = [
  { name: 'Daniel Jones', passing_yards: 342, passing_tds: 1, passing_interceptions: 3,
    rushing_yards: 4, rushing_tds: 1, receptions: 0, receiving_yards: 0, receiving_tds: 0,
    fumbles_lost: 2, special_teams_tds: 0, fantasy_points: 14.08 },
  { name: 'Quentin Johnston', passing_yards: 0, passing_tds: 0, passing_interceptions: 0,
    rushing_yards: 0, rushing_tds: 0, receptions: 5, receiving_yards: 79, receiving_tds: 2,
    fumbles_lost: 0, special_teams_tds: 0, fantasy_points: 19.9 },
  { name: 'Antonio Gibson', passing_yards: 0, passing_tds: 0, passing_interceptions: 0,
    rushing_yards: 27, rushing_tds: 0, receptions: 1, receiving_yards: 1, receiving_tds: 0,
    fumbles_lost: 0, special_teams_tds: 1, fantasy_points: 8.8 },
];
for (const r of REAL) {
  const want = r.fantasy_points + 0.5 * r.receptions;
  const got = halfFromBox(r);
  ok(Math.abs(want - got) < 0.011, `${r.name}: ${got.toFixed(2)} against ${want.toFixed(2)}`);
}

console.log('\n2. the parser finds a column by its name, never by where it sits');
const BOX = {
  boxscore: {
    players: [
      {
        team: { abbreviation: 'GB' },
        statistics: [
          /* An EXTRA column ahead of the yards, which is what a position based reader
             pays as the wrong number. */
          { name: 'passing',
            keys: ['completions/passingAttempts', 'newColumn', 'passingYards',
              'yardsPerPassAttempt', 'passingTouchdowns', 'interceptions'],
            athletes: [{ athlete: { id: '3915416', displayName: 'Jordan Love' },
              stats: ['22/31', '9', '1,024', '8.3', '2', '1'] }] },
          { name: 'rushing',
            keys: ['rushingAttempts', 'rushingYards', 'yardsPerRushAttempt',
              'rushingTouchdowns', 'longRushing'],
            athletes: [
              { athlete: { id: '3915416', displayName: 'Jordan Love' },
                stats: ['3', '12', '4.0', '1', '7'] },
              { athlete: { id: '4430807', displayName: 'Josh Jacobs' },
                stats: ['18', '88', '4.9', '0', '21'] },
            ] },
          /* Labels only, no keys: the other shape this payload has been seen in. */
          { name: 'receiving',
            labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'],
            athletes: [
              { athlete: { id: '4430807', displayName: 'Josh Jacobs' },
                stats: ['4', '31', '7.8', '1', '12', '5'] },
              { athlete: { id: '9999999', displayName: 'Nobody Mapped' },
                stats: ['1', '5', '5.0', '0', '5', '1'] },
            ] },
          { name: 'fumbles', keys: ['fumbles', 'fumblesLost', 'fumblesRecovered'],
            athletes: [{ athlete: { id: '4430807', displayName: 'Josh Jacobs' },
              stats: ['1', '1', '0'] }] },
          { name: 'defensive', keys: ['totalTackles'],
            athletes: [{ athlete: { id: '1', displayName: 'A Linebacker' }, stats: ['9'] }] },
        ],
      },
      { team: { abbreviation: 'ATL' },
        statistics: [
          { name: 'kickReturns', keys: ['kickReturns', 'kickReturnYards',
            'yardsPerKickReturn', 'longKickReturn', 'kickReturnTouchdowns'],
            athletes: [{ athlete: { id: '4686472', displayName: 'A Returner' },
              stats: ['2', '140', '70.0', '101', '1'] }] },
        ] },
    ],
  },
};
const box = readBox(BOX);
const love = box.get('3915416');
ok(love && love.passing_yards === 1024, 'yards read past an added column, "1,024" parsed',
  love && String(love.passing_yards));
ok(love && love.passing_tds === 2 && love.passing_interceptions === 1, 'touchdowns and picks');
ok(love && love.rushing_yards === 12 && love.rushing_tds === 1,
  'one man across two blocks is one man');
const jj = box.get('4430807');
ok(jj && jj.receptions === 4 && jj.receiving_yards === 31 && jj.receiving_tds === 1,
  'a block with labels and no keys still reads');
ok(jj && jj.fumbles_lost === 1, 'a lost fumble is counted');
ok(box.get('4686472') && box.get('4686472').special_teams_tds === 1, 'a return touchdown');
ok(!box.has('1'), 'a block this mode does not score is not read');
ok(readBox(null).size === 0 && readBox({}).size === 0 && readBox({ boxscore: {} }).size === 0,
  'an empty or absent box is no men, not a throw');

console.log('\n3. the join, and who wins');
const xw = crosswalk([
  { gsis_id: '00-0036264', espn_id: '3915416' },
  { gsis_id: '00-0035700', espn_id: '4430807.0' },
  { gsis_id: '00-0039000', espn_id: '4686472' },
  { gsis_id: '00-0000001', espn_id: '' },
]);
ok(xw.get('4430807') === '00-0035700', 'an id written as a float is the same athlete');
ok(!xw.has(''), 'a blank espn id joins nobody');
const got = boxScores([box], xw, new Set(['00-0039000']));
ok(got.scores['00-0036264'] && got.scores['00-0036264'][0] === 54.2,
  'Love: 1,024 yards, 2 TD, a pick and a 12 yard rushing TD is 54.2',
  JSON.stringify(got.scores['00-0036264']));
ok(got.scores['00-0035700'] && got.scores['00-0035700'][0] === 17.9,
  'Jacobs: 88 and 31 yards, a catch TD, a lost fumble, four catches is 17.9',
  JSON.stringify(got.scores['00-0035700']));
ok(/88 rush yds/.test(got.scores['00-0035700'][1]), 'the line is the same line nflverse gets');
ok(!('00-0039000' in got.scores), 'a man nflverse already scored is never overwritten');
ok(got.unmapped === 1, 'a man with no crosswalk row is counted, not guessed', String(got.unmapped));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
