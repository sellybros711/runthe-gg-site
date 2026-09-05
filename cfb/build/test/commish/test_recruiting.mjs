/* THE SPORT'S SECOND SEASON, AND WHETHER IT IS ATTACHED TO ANYTHING.
 *
 *   node cfb/build/test/commish/test_recruiting.mjs
 *
 * A recruiting board is the easiest thing in this mode to fake and the hardest to notice
 * being faked. It is a ranked list of a hundred and thirty-six real schools, and ANY ranked
 * list of them looks plausible: put the blue bloods near the top, shuffle a little, and a
 * reader will nod at it for five terms without ever asking what it is made of. So the
 * assertions here are not about whether it looks right. They are about whether it is wired
 * to anything:
 *
 *   it has to agree with the sport. The top of the board and the top of the league are
 *     mostly the same names, or it is a random number generator with school names on it
 *   it has to DISAGREE with the sport, some. A board that is exactly the power ranking is
 *     the power ranking, printed twice, on two different screens
 *   the money has to move it, because that is the whole claim: a ruling in November shows
 *     up in February and in the football two Septembers later
 *   the two labour levers have to change its SHAPE and not its order, which is what makes
 *     them redistributions rather than a thumb on one league
 *   and it has to replay identically, because the mode's one promise is that a term does
 *
 * The determinism check is the load-bearing one. The obvious way to write this file's
 * subject was to read last season's results out of the page's own `lastSeason`, which does
 * not survive a refresh: the board would have reordered itself when somebody reopened the
 * tab, and nothing anywhere would have failed.
 */
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
import { leagueTeams } from './league.mjs';
const L = require(ROOT + '/cfb/commish/ledger.js');
const S = require(ROOT + '/cfb/commish/season.js');
const R = require(ROOT + '/cfb/commish/recruiting.js');
const teams = leagueTeams(ROOT);

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const world = (year) => L.createWorld({
  year: year || 2025, membership: L.membershipFrom(teams, 2025), seed: 5 });
const boardFor = (w) => R.board(w, S.league(w, teams), teams);
/* Where a league's classes sit, as one number, so two boards can be compared. */
const medianRank = (bd, confs) => {
  const rs = bd.rows.filter((r) => confs.indexOf(r.conference) >= 0).map((r) => r.rank).sort((a, b) => a - b);
  return rs.length ? rs[Math.floor(rs.length / 2)] : null;
};
const G5 = ['Sun Belt', 'Mountain West', 'Mid-American', 'Conference USA', 'American Athletic'];

console.log('\n=== a board is a board ===');
{
  const bd = boardFor(world());
  ok('every school in the sport signed somebody', bd.rows.length > 120, bd.rows.length + ' classes');
  ok('  ranked one to the end with no gaps',
    bd.rows.every((r, i) => r.rank === i + 1));
  ok('  and rated on a scale a person has seen before',
    bd.rows.every((r) => r.rating >= 1 && r.rating <= 99), bd.rows[0].rating + ' to '
      + bd.rows[bd.rows.length - 1].rating);
  ok('  the rating falls as the rank does',
    bd.rows.every((r, i) => i === 0 || r.rating <= bd.rows[i - 1].rating));
  /* NOBODY IN THIS FILE IS A PERSON, which is the same rule the docket and the cutscenes
     hold and the one most likely to erode here, because every real recruiting board is a
     list of seventeen year olds. */
  const names = Object.keys(bd.rows[0]);
  ok('and a class is a school rather than a list of children',
    names.indexOf('recruits') < 0 && names.indexOf('players') < 0 && names.indexOf('names') < 0,
    names.join(' '));
}

console.log('\n=== it is attached to the sport ===');
{
  const w = world();
  const bd = boardFor(w);
  const lg = S.league(w, teams).slice().sort((a, b) => b.z - a.z);
  const top25 = {}; lg.slice(0, 25).forEach((t) => { top25[t.school] = 1; });
  const overlap = bd.rows.slice(0, 25).filter((r) => top25[r.school]).length;
  /* AGREES, MOSTLY. Alabama signs well after a bad year and Toledo does not sign well after
     a good one, so this is not meant to be a perfect match. It is meant to rule out a
     shuffled list of school names, which would land near six. */
  ok('the top of the board and the top of the sport are mostly the same names',
    overlap >= 12, overlap + ' of the top 25');
  /* AND DISAGREES, SOME. A board that IS the power ranking is the power ranking printed on
     a second screen, and the column that says who signed above their weight would be a
     column of zeroes. */
  const moved = bd.rows.slice(0, 40).filter((r) => Math.abs(r.over) >= 3).length;
  ok('  and enough of them are signing away from what they are to be worth a column',
    moved >= 8, moved + ' of the top 40 are three places or more from their program');
  ok('  without the whole thing coming loose',
    bd.rows.slice(0, 40).filter((r) => Math.abs(r.over) >= 40).length <= 6,
    bd.rows.slice(0, 40).filter((r) => Math.abs(r.over) >= 40).length + ' wild ones');
}

console.log('\n=== the money moves it, which is the whole point ===');
{
  const before = boardFor(world());
  /* FOUR YEARS IN, because moneyDrift ramps: a share changed in November is worth a fraction
     of itself that February and its whole self by the end of a term. */
  const w = world(2029);
  w.startYear = 2025;
  w.money.share = Object.assign({}, w.money.share);
  w.money.share.SEC = w.money.share.SEC * 0.5;
  w.money.share['Group of Five'] = w.money.share['Group of Five'] * 3;
  const after = boardFor(w);

  const secBefore = medianRank(before, ['SEC']), secAfter = medianRank(after, ['SEC']);
  const g5Before = medianRank(before, G5), g5After = medianRank(after, G5);
  ok('cutting a league\'s share sends its classes down the board',
    secAfter > secBefore + 5, 'SEC median ' + secBefore + ' to ' + secAfter);
  ok('  and the league you gave it to comes up',
    g5After < g5Before - 5, 'Group of Five median ' + g5Before + ' to ' + g5After);
  /* AND IT IS THE MONEY RATHER THAN THE YEAR. The same four years with the pot untouched
     must not do this on its own, or the assertion above is measuring churn. Stated as the
     ratio rather than as a ceiling on the quiet drift, because the first version demanded
     the drift stay under twelve places and churn happened to drift eleven: an assertion one
     place from failing on the day it was written, and it failed the day the carousel stopped
     counting the baseline season. What is actually claimed is that the money is the cause,
     and the cause has to dwarf the background. */
  const quiet = world(2029); quiet.startYear = 2025;
  const same = boardFor(quiet);
  const quietDrift = Math.abs(medianRank(same, ['SEC']) - secBefore);
  const moneyMove = Math.abs(secAfter - secBefore);
  ok('  and four quiet years do not do it by themselves',
    moneyMove >= quietDrift * 2.5,
    'the money moved the SEC median ' + moneyMove + ' places, quiet churn ' + quietDrift);
}

console.log('\n=== and the two levers bend the shape rather than the order ===');
{
  const flat = boardFor(world());
  const gap = (bd) => bd.rows[0].rating - bd.rows[Math.floor(bd.rows.length / 2)].rating;

  const paid = world(); paid.labour.revShare = 0.4;
  const school = world(); school.labour.nil = 'school-paid';

  ok('an untouched sport signs the classes it would have signed anyway',
    R.spreadOf(world()) === 1, String(R.spreadOf(world())));
  ok('paying players out of the pool narrows the board',
    gap(boardFor(paid)) < gap(flat), gap(flat) + ' points down to ' + gap(boardFor(paid)));
  ok('  and so does making the schools pay rather than the collectives',
    gap(boardFor(school)) < gap(flat), gap(flat) + ' down to ' + gap(boardFor(school)));
  /* A REDISTRIBUTION CHANGES HOW FAR APART THEY ARE AND NOT WHO IS AHEAD OF WHOM. If a
     lever reordered the board on its own it would be a thumb on one league rather than a
     change to the shape of the sport, which is a different and much bigger claim. */
  const order = (bd) => bd.rows.map((r) => r.school).join('|');
  ok('  and neither of them moves anybody past anybody',
    order(boardFor(paid)) === order(flat) && order(boardFor(school)) === order(flat));
}

console.log('\n=== it says something only when this office has done something ===');
{
  ok('an untouched February has nothing to add', boardFor(world()).note === '',
    JSON.stringify(boardFor(world()).note));
  const paid = world(); paid.labour.revShare = 0.4;
  ok('  and a paid one says why the board looks like that',
    /spreading|closer to the middle/i.test(boardFor(paid).note), boardFor(paid).note.slice(0, 60));
  const shut = world(); shut.labour.portalWindows = 0;
  ok('  and closing the portal says what that means for a class',
    /class is a class again/i.test(boardFor(shut).note), boardFor(shut).note.slice(0, 60));
}

console.log('\n=== and it replays ===');
{
  /* THE MODE'S ONE PROMISE. Same world, same board, however many times it is asked, and
     nothing in it may read a page variable that a refresh throws away. */
  const a = boardFor(world());
  const b = boardFor(world());
  ok('the same world gives the same board',
    JSON.stringify(a.rows) === JSON.stringify(b.rows));
  /* And a different seed gives a different one, or the noise term is not doing anything. */
  const other = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 9 });
  const c = R.board(other, S.league(other, teams), teams);
  ok('  and a different term is a different February',
    c.rows.map((r) => r.school).join('|') !== a.rows.map((r) => r.school).join('|'));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
