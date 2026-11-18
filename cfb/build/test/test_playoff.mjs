/*
 * THE PLAYOFF FANTASY'S BUILDERS, with no network (playoff.mjs).
 *
 *   node cfb/build/test/test_playoff.mjs
 *
 * The fixtures are in ESPN's own shape, and the headlines are the ones ESPN sent for the
 * 2025 Playoff (read off cfb-fantasy-probe.yml on 2026-11-16): "College Football Playoff
 * First Round Game", "College Football Playoff Quarterfinal at the Rose Bowl Presented by
 * Prudential", and so on. The FCS playoff and the other bowls sit in the same feed, and must
 * never be read as ours.
 */
import { gamesOf } from '../fantasy/espn.mjs';
import { kickoffsSQL } from '../fantasy/publish.mjs';
import {
  isPlayoffGame, roundOf, isRealTeam, winProb, expectedGames, bracketOf, refreshGames,
  PLAYOFF_TEAMS, BYE_P, LATER_P,
} from '../fantasy/playoff.mjs';

let passes = 0, fails = 0;
const ok = (label, cond, extra) => {
  if (cond) passes++; else fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

const team = (id, abbr) => (id
  ? { id: String(id), abbreviation: abbr, location: abbr, name: abbr, conferenceId: '8' }
  : { id: '-2', abbreviation: 'TBD', location: 'TBD', name: 'TBD' });
let n = 9000;
function ev(note, kick, home, away, spread = null, state = 'pre') {
  const side = (t, ha) => ({ homeAway: ha, team: t, score: '0', curatedRank: { current: 99 } });
  return {
    id: String(n++), date: kick, name: `${away.abbreviation} at ${home.abbreviation}`,
    competitions: [{
      status: { period: 0, displayClock: '0:00', type: { state } },
      competitors: [side(home, 'home'), side(away, 'away')],
      notes: note ? [{ headline: note }] : [],
      odds: spread == null ? undefined : [{ details: 'x', spread, overUnder: 50 }],
    }],
  };
}

const R1 = 'College Football Playoff First Round Game';
const QF = (bowl) => `College Football Playoff Quarterfinal at the ${bowl}`;
const SF = (bowl) => `College Football Playoff Semifinal at the ${bowl}`;
const TITLE = 'College Football Playoff National Championship Presented by AT&T';
const TBD = team(null);
const T = Array.from({ length: 12 }, (_, i) => team(100 + i, `T${i + 1}`));

/* Seeds 1-4 (T1-T4) have byes; 5 v 12, 6 v 11, 7 v 10, 8 v 9 in the first round. */
const bracket = () => [
  ev('Cricket Celebration Bowl', '2026-12-12T17:00Z', team(900, 'PV'), team(901, 'SCST')),
  ev('FCS Championship - Quarterfinals', '2026-12-12T20:00Z', team(902, 'MONT'), team(903, 'SDAK')),
  ev(R1, '2026-12-19T01:00Z', T[4], T[11], -10),
  ev(R1, '2026-12-19T17:00Z', T[5], T[10], -6),
  ev(R1, '2026-12-19T20:30Z', T[6], T[9], -2.5),
  ev(R1, '2026-12-20T00:30Z', T[7], T[8]),
  ev(QF('Rose Bowl Presented by Prudential'), '2027-01-01T21:00Z', T[0], TBD),
  ev(QF('Allstate Sugar Bowl'), '2027-01-02T01:00Z', T[1], TBD),
  ev(QF('Capital One Orange Bowl'), '2027-01-01T17:00Z', T[2], TBD),
  ev(QF('Goodyear Cotton Bowl Classic'), '2026-12-31T00:30Z', T[3], TBD),
  ev(SF('Vrbo Fiesta Bowl'), '2027-01-15T00:30Z', TBD, TBD),
  ev(SF('Chick-fil-A Peach Bowl'), '2027-01-16T00:30Z', TBD, TBD),
  ev(TITLE, '2027-01-26T00:30Z', TBD, TBD),
  ev('TaxSlayer Gator Bowl', '2026-12-28T00:30Z', team(904, 'MIZ'), team(905, 'UVA')),
];

console.log('\n1. which games are the Playoff, and which round');
{
  const games = gamesOf({ events: bracket() });
  const ours = games.filter(isPlayoffGame);
  ok('eleven Playoff games out of a feed with bowls and the FCS playoff', ours.length === 11, String(ours.length));
  ok('no bowl and no FCS game is read as ours',
    !ours.some((g) => /Celebration|FCS|Gator/.test(g.note)));
  const rounds = ours.map(roundOf);
  ok('four first round, four quarterfinals, two semifinals, one title game',
    JSON.stringify([1, 2, 3, 4].map((r) => rounds.filter((x) => x === r).length)) === '[4,4,2,1]',
    rounds.join(','));
  ok('a slot for a winner still to come is not a team', !isRealTeam(games.find((g) => roundOf(g) === 4).home));
  ok('the 2025 headlines, word for word, read right',
    roundOf({ note: 'College Football Playoff Quarterfinal at the Goodyear Cotton Bowl Classic' }) === 2
    && roundOf({ note: 'College Football Playoff Semifinal at the Vrbo Fiesta Bowl' }) === 3
    && roundOf({ note: TITLE }) === 4 && roundOf({ note: R1 }) === 1);
}

console.log('\n2. a line into a chance, and a chance into games');
{
  const g = { spread: -7 };
  const ph = winProb(g, true), pa = winProb(g, false);
  ok('the favourite (home, -7) is better than even', ph > 0.65 && ph < 0.75, ph.toFixed(3));
  ok('the two sides add to one', near(ph + pa, 1));
  ok('no line is no opinion', winProb({ spread: null }, true) === null);
  ok('a pick em is even', near(winProb({ spread: 0 }, true), 0.5));
  /* First round team: 1 game, then QF, SF, title at p0, p0*0.5, p0*0.25. */
  ok('a first round team at even money expects 1.875 games', near(expectedGames(1, 0.5), 1 + 0.5 + 0.25 + 0.125));
  ok('a bye team at the bye default expects 1.9 games', near(expectedGames(2, BYE_P), 1 + BYE_P + BYE_P * LATER_P));
  ok('a sure first round winner expects more than a sure loser',
    expectedGames(1, 0.9) > expectedGames(1, 0.1) && near(expectedGames(1, 0), 1));
}

console.log('\n3. the twelve teams and each one\'s first game');
{
  const { teams } = bracketOf(gamesOf({ events: bracket() }));
  ok(`twelve teams`, teams.size === PLAYOFF_TEAMS, String(teams.size));
  const t1 = teams.get('100'), t5 = teams.get('104'), t12 = teams.get('111'), t8 = teams.get('107');
  ok('a top four seed starts in the quarterfinal, with the bye default',
    t1.round === 2 && near(t1.p, BYE_P) && !t1.lined, JSON.stringify({ r: t1.round, p: t1.p }));
  ok('  and his first kick is his quarterfinal', t1.game.kick === '2027-01-01T21:00Z');
  ok('a first round favourite is priced off his line', t5.round === 1 && t5.lined && t5.p > 0.7, String(t5.p));
  ok('  and his opponent is the other side of it', near(t5.p + t12.p, 1));
  ok('a game with no line is even', near(t8.p, 0.5) && !t8.lined);
  ok('the favourite expects more games than the underdog', t5.expected > t12.expected);
  let threw = '';
  const unset = bracket().map((e) => {
    const c = e.competitions[0];
    if (/First Round/.test((c.notes[0] || {}).headline || '')) c.competitors.forEach((x) => { x.team = TBD; });
    return e;
  });
  try { bracketOf(gamesOf({ events: unset })); } catch (e) { threw = e.message; }
  ok('before the bracket is set it says so, and builds nothing', /bracket is not set/.test(threw), threw);
}

console.log('\n4. the slate grows, and a man\'s kick never moves after his first game');
{
  const pool = { games: [], pool: [{ player_id: 'p1', team: 'T5', kick: null }, { player_id: 'p2', team: 'T1', kick: null }],
    season: 2026, week: 100 };
  const first = gamesOf({ events: bracket() });
  const added = refreshGames(pool, first);
  ok('the first refresh adds all eleven games', added === 11 && pool.games.length === 11, String(added));
  ok('  and the title game sets when it ends', pool.ends_at === '2027-01-26T00:30Z');
  ok('a second refresh with nothing new changes nothing', refreshGames(pool, first) === 0);
  /* T5 wins round one and plays T4 in the Cotton Bowl. */
  const later = bracket().map((e) => {
    if (/Cotton/.test(e.competitions[0].notes[0].headline)) {
      e.competitions[0].competitors[1].team = T[4];
      e.id = String(pool.games.find((g) => /Cotton/.test(g.note)).id);
    }
    return e;
  });
  const ids = new Map(pool.games.map((g) => [g.note + g.kick, g.id]));
  later.forEach((e) => { const k = e.competitions[0].notes[0] ? e.competitions[0].notes[0].headline + e.date : ''; if (ids.has(k)) e.id = ids.get(k); });
  ok('a slot filled by the winner is a change', refreshGames(pool, gamesOf({ events: later })) === 1);
  ok('  and no game was added twice', pool.games.length === 11);
  const sql = kickoffsSQL(pool, pool.games);
  ok('T5\'s kick is his first round game, not the quarterfinal he reached',
    /\('p1', '2026-12-19T01:00Z'::timestamptz\)/.test(sql), sql.split('\n')[1]);
  ok('a bye team\'s kick is his quarterfinal', /\('p2', '2027-01-01T21:00Z'::timestamptz\)/.test(sql));
}

console.log('\n5. the live job watches each Playoff game, not the five weeks between them');
{
  const { plan, PLAYOFF_WATCH_H } = await import('../fantasy/live.mjs');
  const H = 3600e3, t0 = Date.parse('2026-12-19T01:00Z');
  const pool = { kind: 'playoff', expect_games: 11, games: [
    { kick: '2026-12-19T01:00Z' }, { kick: '2026-12-19T17:00Z' },
    { kick: '2027-01-01T21:00Z' } ] };
  ok('during a first round game: watching', plan(pool, t0 + 2 * H).watch);
  ok('settling after it: still watching', plan(pool, t0 + (PLAYOFF_WATCH_H - 1) * H + 16 * H).watch);
  ok('the days between rounds: asleep', !plan(pool, t0 + 5 * 24 * H).watch, plan(pool, t0 + 5 * 24 * H).why);
  ok('  and not called done, with rounds still to come', !plan(pool, Date.parse('2027-01-03T12:00Z')).done);
  ok('three hours before a kickoff: soon', plan(pool, Date.parse('2027-01-01T19:00Z')).soon);
  ok('a regular week is unchanged: watched from its first kickoff to 30 hours after its last',
    plan({ games: pool.games }, t0 + 5 * 24 * H).watch);
}

console.log(fails ? `\n${fails} FAILED, ${passes} ok` : `\nall ${passes} ok`);
process.exit(fails ? 1 : 0);
