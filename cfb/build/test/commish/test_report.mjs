/* THE ENDING, CHECKED AGAINST THE TERMS IT IS SUPPOSED TO BE GRADING.
 *
 *   node cfb/build/test/commish/test_report.mjs
 *
 * A report card is only worth drawing if it can come out differently. The claim here is that
 * each of the six grades moves when the thing it grades moves, and that a term nobody would
 * defend does not come back with the same verdict as one nobody could fault.
 *
 * The other half is defensive. This screen is the last thing a player sees, it runs on a saved
 * world rather than on a live season, and the save format has grown fields over time, so it
 * has to survive being handed a term with pieces missing rather than blaming the player for a
 * number that was never recorded.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
import { leagueTeams } from './league.mjs';
const L = require(ROOT + '/cfb/commish/ledger.js');
const S = require(ROOT + '/cfb/commish/season.js');
const R = require(ROOT + '/cfb/commish/report.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = leagueTeams(ROOT);

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* A TERM, PLAYED THE WAY THE PAGE PLAYS ONE, so the world handed to report() is the shape a
   real save is: five seasons recorded, champions written down, ratings filled in. */
function term(over, seed) {
  let w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: seed || 'rep' });
  if (over) for (const k in over) Object.assign(w[k], over[k]);
  const confs = L.conferencesIn(w);
  w.start = { meters: Object.assign({}, w.meters), facts: [],
    conferences: Object.keys(confs).filter((c) => confs[c] >= (L.MIN_CONFERENCE || 4)).length };
  w.ratings = {}; w.champions = {}; w.history = [];
  for (let y = 0; y < 5; y++) {
    const sim = S.play(w, teams, E.createSeededRNG(E.hashSeed('rep|' + (seed || '') + '|' + y)));
    w.ratings[w.year] = {
      total: Math.round(sim.viewers),
      perGame: Math.round(sim.perGame * 100) / 100,
      outsiders: sim.field.seats.filter((s) => L.POWERS.indexOf(s.team.conference) < 0).length,
    };
    const ch = sim.bracket && sim.bracket.champion;
    if (ch) w.champions[w.year] = { school: ch.team.school, color: ch.team.color, conference: ch.team.conference };
    w = JSON.parse(JSON.stringify(w));
    w.year++;
  }
  return w;
}

console.log('\n=== a term comes back graded ===');
{
  const w = term();
  const rep = R.report(w);
  ok('every card is drawn', rep.cards.length === 6,
    rep.cards.map((c) => c.id).join(', '));
  ok('  each with a letter', rep.cards.every((c) => 'ABCDF'.indexOf(c.grade) >= 0),
    rep.cards.map((c) => c.label + ' ' + c.grade).join('   '));
  ok('  a number behind it', rep.cards.every((c) => c.mark && c.mark.length));
  ok('  and a sentence saying what it means',
    rep.cards.every((c) => c.line && c.line.length > 40));
  ok('  there is an overall verdict', !!rep.verdict, rep.verdict && rep.verdict.title);
  ok('  and a score on the same scale as the grades',
    rep.score >= 0 && rep.score <= 100, rep.score + ' / 100, ' + rep.grade);
  ok('  the loudest card is the one furthest from the middle', !!rep.loudest
    && rep.cards.every((c) => Math.abs(c.points - 2) <= Math.abs(rep.loudest.points - 2)),
    rep.loudest && rep.loudest.label + ' (' + rep.loudest.grade + ')');
}

console.log('\n=== the grades answer to what the term did ===');
{
  /* WHO GOT IN, which is the one a commissioner controls most directly: guarantee nobody a
     seat and shrink the field, against a wide field with bids promised to champions. */
  const shut = R.report(term({ playoff: { teams: 4, byes: 0, autobids: 0 } }, 'shut'));
  const open = R.report(term({ playoff: { teams: 24, byes: 8, autobids: 8 } }, 'open'));
  const a = shut.cards.find((c) => c.id === 'access');
  const b = open.cards.find((c) => c.id === 'access');
  ok('a wider field with bids lets more outsiders in', b.points > a.points,
    'four teams and no bids: ' + a.mark + ' (' + a.grade + '), twenty-four with eight: '
    + b.mark + ' (' + b.grade + ')');

  /* WHO WON. A four team field with the same handful of schools in it every year should share
     the title around less than a twenty-four team one. */
  const ca = shut.cards.find((c) => c.id === 'competition');
  const cb = open.cards.find((c) => c.id === 'competition');
  ok('  and a wider field spreads the titles', cb.points >= ca.points,
    'four teams: ' + ca.mark + ', twenty-four: ' + cb.mark);

  /* THE BOOKS. Promise the schools far more than the sport can earn and the grade has to say
     so, because that is the whole point of the settlement. */
  const rich = R.report(term({ money: { pool: 1.3 } }, 'books'));
  const broke = R.report(term({ money: { pool: 2.6 } }, 'books'));
  const ba = rich.cards.find((c) => c.id === 'books');
  const bb = broke.cards.find((c) => c.id === 'books');
  ok('  and a pool the football cannot pay for is marked down', bb.points < ba.points,
    '$1.3B pool: ' + ba.mark + ' (' + ba.grade + '), $2.6B pool: ' + bb.mark + ' (' + bb.grade + ')');

  /* THE ROOM. Nothing to do with the football at all. */
  const w = term();
  const loved = JSON.parse(JSON.stringify(w));
  Object.keys(loved.blocs).forEach((k) => { loved.blocs[k] = 80; });
  const hated = JSON.parse(JSON.stringify(w));
  Object.keys(hated.blocs).forEach((k) => { hated.blocs[k] = 12; });
  ok('  and the room is graded on the room',
    R.report(loved).cards.find((c) => c.id === 'room').points
      > R.report(hated).cards.find((c) => c.id === 'room').points,
    R.report(loved).cards.find((c) => c.id === 'room').grade + ' against '
    + R.report(hated).cards.find((c) => c.id === 'room').grade);

  /* AND THE VERDICT MOVES WITH THEM, or the six grades are decoration. */
  ok('  a good term and a bad one do not get the same verdict',
    R.report(loved).verdict.title !== R.report(hated).verdict.title
    || R.report(loved).score !== R.report(hated).score,
    R.report(loved).score + ' vs ' + R.report(hated).score);
}

console.log('\n=== a term with pieces missing still ends ===');
{
  /* THE SAVE FORMAT HAS GROWN FIELDS AND OLD TERMS ARE STILL OPENABLE. A card with nothing
     behind it has to drop out rather than mark the player down for a number that was never
     written, which is the difference between an honest ending and an insulting one. */
  const w = term();
  const bare = JSON.parse(JSON.stringify(w));
  delete bare.ratings; delete bare.champions; delete bare.start;
  const rep = R.report(bare);
  ok('a term saved before any of this was recorded does not throw', !!rep);
  ok('  and grades only what it can', rep.cards.every((c) => c.id === 'room'),
    rep.cards.map((c) => c.id).join(', ') || 'nothing');
  ok('  rather than marking everything F',
    !rep.cards.some((c) => c.grade === 'F' && c.id !== 'room'));

  const empty = R.report({ startYear: 2025, year: 2025, money: {}, blocs: {} });
  ok('a term with nothing in it comes back ungraded rather than bottom of the class',
    empty.score === null && !empty.verdict, JSON.stringify(empty.cards));

  /* ONE YEAR IS NOT A TREND. The audience card compares the end against the start, so a term
     cut short after a single season has nothing to compare. */
  const oneYear = JSON.parse(JSON.stringify(w));
  oneYear.year = oneYear.startYear + 1;
  ok('  and one season is not enough to grade an audience trend',
    !R.report(oneYear).cards.some((c) => c.id === 'audience'),
    R.report(oneYear).cards.map((c) => c.id).join(', '));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
