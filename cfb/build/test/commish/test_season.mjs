/* THE FOOTBALL, CHECKED AGAINST THE RULES IT WAS SUPPOSED TO BE PLAYED UNDER.
 *
 *   node cfb/build/test/commish/test_season.mjs
 *
 * The claim this module exists to make is that a ruling is not an opinion: change the
 * playoff and the bracket really changes, move a school and it really plays somewhere else,
 * starve a conference and its teams really get worse. Each of those is asserted here by
 * playing seasons under two different ledgers and comparing, because that is the only way
 * to tell a consequence from a coincidence.
 *
 * It also checks the things that are easy to get wrong and impossible to see: that a
 * scoreline is one football can produce, that everybody plays the same number of games,
 * that a seed replays identically, and that nobody is in the field twice.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
import { leagueTeams } from './league.mjs';
const L = require(ROOT + '/cfb/commish/ledger.js');
const S = require(ROOT + '/cfb/commish/season.js');
const RV = require(ROOT + '/cfb/commish/rivals.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = leagueTeams(ROOT);

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const world = (over) => {
  const w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 5 });
  if (over) for (const k in over) Object.assign(w[k], over[k]);
  return w;
};
const rngFor = (s) => E.createSeededRNG(E.hashSeed('season|' + s));
const run = (w, s) => S.play(w, teams, rngFor(s == null ? 1 : s));

console.log('\n=== a season happens at all ===');
{
  const w = world();
  const sim = run(w);
  ok('a season plays', !!sim, sim ? sim.teams.length + ' teams' : 'nothing came back');
  /* TWELVE FOR EVERYBODY, AND THIRTEEN FOR WHOEVER PLAYED ON CHAMPIONSHIP WEEKEND, which is
     what a real season looks like. It used to be twelve flat, and the reason it is worth
     asserting at all is the version in between: the schedule was colored into weeks, the
     coloring overflowed past the last week, and the overflow was quietly dropped. Teams
     finished 8-0 and 13-0 in the same league and nothing failed. */
  const inTitle = {};
  (sim.titles || []).forEach((t) => {
    if (t.game) { inTitle[t.game.a.school] = 1; inTitle[t.game.b.school] = 1; }
  });
  const odd = sim.teams.filter((t) => (t.wins + t.losses) !== (inTitle[t.school] ? S.GAMES + 1 : S.GAMES));
  ok('  everybody plays a full schedule', !odd.length,
    odd.length ? odd.slice(0, 4).map((t) => t.school + ' ' + (t.wins + t.losses)).join(', ')
      : S.GAMES + ' each, ' + Object.keys(inTitle).length + ' of them ' + (S.GAMES + 1)
        + ' after championship weekend');
  /* AND NOTHING FELL OFF THE END OF THE CALENDAR. */
  ok('  played in ' + sim.lastWeek + ' weeks, with nothing left unplayed',
    sim.games.every((g) => g.week <= sim.through) && sim.lastWeek >= S.GAMES,
    sim.games.length + ' games, last week ' + Math.max(...sim.games.map((g) => g.week)));
  /* THE SCORELINE BUG THE MAIN GAME SHIPPED FOR ITS WHOLE LIFE. One and four are not
     football scores and an arithmetic generator emits both. */
  const scores = sim.games.flatMap((g) => g.score);
  ok('  no impossible scoreline', !scores.some((s) => s === 1 || s === 4),
    scores.length + ' team scores, low ' + Math.min(...scores) + ', high ' + Math.max(...scores));
  const avg = scores.reduce((t, s) => t + s, 0) / scores.length;
  ok('  and the scoring looks like college football', avg > 18 && avg < 38,
    avg.toFixed(1) + ' points a team a game');
  ok('  the champion is somebody who was in the field',
    !!sim.bracket.champion && sim.field.seats.indexOf(sim.bracket.champion) >= 0,
    sim.bracket.champion ? sim.bracket.champion.team.school : 'nobody');
  /* A team in the field twice is a bracket that pays somebody two seats. */
  const names = sim.field.seats.map((s) => s.team.school);
  ok('  and nobody is in the field twice', new Set(names).size === names.length,
    names.length + ' seats');
}

console.log('\n=== the same seed plays the same season ===');
{
  const a = run(world(), 7), b = run(world(), 7);
  ok('a seed replays exactly',
    a.bracket.champion.team.school === b.bracket.champion.team.school
    && JSON.stringify(a.teams.map((t) => [t.school, t.wins])) === JSON.stringify(b.teams.map((t) => [t.school, t.wins])));
  const c = run(world(), 8);
  ok('  and a different seed does not', JSON.stringify(a.teams.map((t) => t.wins)) !== JSON.stringify(c.teams.map((t) => t.wins)),
    a.bracket.champion.team.school + ' vs ' + c.bracket.champion.team.school);
}

console.log('\n=== the ruling is the format ===');
{
  /* THE CLAIM THE WHOLE MODE RESTS ON. The ledger says how many seats; the bracket has
     that many. Not approximately, exactly. */
  for (const n of [4, 8, 12, 16, 24]) {
    const w = world({ playoff: { teams: n, autobids: 2, byes: 0 } });
    const sim = run(w, 3);
    ok('a ' + n + '-team playoff seats ' + n, sim.field.seats.length === n,
      sim.field.seats.length + ' seats, ' + sim.bracket.rounds.length + ' rounds');
  }
  const wide = run(world({ playoff: { teams: 16, autobids: 2, byes: 0 } }), 3);
  const narrow = run(world({ playoff: { teams: 4, autobids: 2, byes: 0 } }), 3);
  ok('  and a wider field really lets more teams in',
    wide.field.seats.length > narrow.field.seats.length,
    narrow.field.seats.length + ' then ' + wide.field.seats.length);
  /* The worst team in a 16 field should be worse than the worst in a 4 field, or the
     expansion is not doing the thing everybody argues about. */
  const wLast = wide.field.seats[wide.field.seats.length - 1].team;
  const nLast = narrow.field.seats[narrow.field.seats.length - 1].team;
  ok('  and the extra seats go to worse teams', S.resume(wLast) < S.resume(nLast),
    wLast.school + ' (' + wLast.wins + '-' + wLast.losses + ') vs '
    + nLast.school + ' (' + nLast.wins + '-' + nLast.losses + ')');
}

console.log('\n=== automatic bids are a promise the bracket keeps ===');
{
  const none = run(world({ playoff: { teams: 12, autobids: 0, byes: 0 } }), 4);
  const many = run(world({ playoff: { teams: 12, autobids: 6, byes: 0 } }), 4);
  ok('with no automatic bids nobody has one',
    none.field.seats.every((s) => s.how === 'at large'));
  /* A PROMISE CANNOT EXCEED THE NUMBER OF CONFERENCES THERE ARE TO WIN, which is the whole
     point and was the assertion that was wrong first time round: this asked for six
     automatic bids out of a 2025 map that has four conferences big enough to have a
     champion, got four, and called it a bug. It is the opposite of a bug. Consolidation
     devalues the guarantee, and the seats it cannot fill become at-large. */
  const chs = many.field.champions.length;
  ok('  with six asked for, every conference that has a champion gets one',
    many.field.seats.filter((s) => s.how === 'auto').length === Math.min(6, chs),
    chs + ' conferences can crown one, ' + many.field.seats.filter((s) => s.how === 'auto').length + ' automatic');
  ok('    and the shortfall is reported rather than swallowed',
    many.field.autobidsUnmet === Math.max(0, 6 - chs),
    many.field.autobidsUnmet + ' promised seats had nobody to give them to');
  /* AND THEY ARE CHAMPIONS, not just anybody. */
  const champs = new Set(many.field.champions.map((c) => c.team.school));
  ok('  and every one of them won their conference',
    many.field.seats.filter((s) => s.how === 'auto').every((s) => champs.has(s.team.school)));
  /* PROMISING SEATS HAS TO COST SOMEBODY, and in a twelve-team field with four champions it
     costs nobody, because those four were going to be in anyway. It bites when the field is
     tight, which is the case worth asserting. */
  const tightNone = run(world({ playoff: { teams: 4, autobids: 0, byes: 0 } }), 4);
  const tightAll = run(world({ playoff: { teams: 4, autobids: 4, byes: 0 } }), 4);
  const wasIn = new Set(tightNone.field.seats.map((s) => s.team.school));
  const pushedOut = tightAll.field.seats.filter((s) => !wasIn.has(s.team.school));
  ok('  and in a four-team field the guarantee really displaces somebody', pushedOut.length > 0,
    pushedOut.length ? pushedOut.map((s) => s.team.school).join(', ') + ' are in only because of it'
      : 'the same four either way');
}

console.log('\n=== the scoreboard agrees with the bracket ===');
{
  /* THE BUG A SCREENSHOT FOUND AND NO ASSERTION WOULD HAVE. The winner advanced correctly
     and the two scores were both real numbers from the real game, but they were swapped
     whenever the lower seed won: the bracket showed the top seed with the upset winner's
     points, and then showed the team that had just lost playing the next round. Every
     number on the screen was plausible and the story it told was impossible. */
  let checked = 0, wrong = [], ghosts = [];
  for (let s = 40; s < 46; s++) {
    const sim = run(world({ playoff: { teams: 16, autobids: 3, byes: 0 } }), s);
    for (const round of sim.bracket.rounds) {
      for (const g of round) {
        checked++;
        const topWon = g.winner === g.top;
        if (topWon !== (g.score[0] > g.score[1])) {
          wrong.push(g.top.team.school + ' ' + g.score[0] + ', ' + g.bottom.team.school
            + ' ' + g.score[1] + ', winner ' + g.winner.team.school);
        }
      }
    }
    /* AND NOBODY PLAYS AFTER LOSING, which is the symptom the swap actually produced. */
    const out = new Set();
    for (const round of sim.bracket.rounds) {
      for (const g of round) {
        if (out.has(g.top.team.school)) ghosts.push(g.top.team.school + ' in seed ' + g.top.seed);
        if (out.has(g.bottom.team.school)) ghosts.push(g.bottom.team.school);
      }
      round.forEach((g) => out.add(g.loser.team.school));
    }
  }
  ok('the team with more points is the team that advances', !wrong.length,
    wrong.length ? wrong[0] : checked + ' games over six brackets');
  ok('  and nobody plays a round after losing one', !ghosts.length,
    ghosts.length ? ghosts.slice(0, 3).join('; ') : 'no ghosts');
}

console.log('\n=== byes are worth something ===');
{
  const w = world({ playoff: { teams: 16, autobids: 4, byes: 4 } });
  const sim = run(w, 9);
  const first = sim.bracket.rounds[0];
  const playedFirst = new Set();
  first.forEach((g) => { playedFirst.add(g.top.seed); playedFirst.add(g.bottom.seed); });
  ok('the top four seeds sit out the first round',
    ![1, 2, 3, 4].some((s) => playedFirst.has(s)),
    'first round seeds: ' + Array.from(playedFirst).sort((a, b) => a - b).join(', '));
}

console.log('\n=== the map is the league ===');
{
  /* MOVING A SCHOOL REALLY MOVES IT. This is realignment's whole promise: the raid on the
     docket is not flavour text, the school plays its conference games somewhere else. */
  const w = world();
  const school = Object.keys(w.membership).find((s) => w.membership[s] === 'SEC');
  const before = run(w, 11);
  const moved = L.applyEdit(w, { id: 'x', label: 'x', set: {}, move: { [school]: 'Big Ten' }, effects: {}, aimed: {} });
  const after = run(moved, 11);
  const inBefore = before.field.champions.find((c) => c.standings.some((t) => t.school === school));
  const inAfter = after.field.champions.find((c) => c.standings.some((t) => t.school === school));
  ok(school + ' plays in the SEC', inBefore && inBefore.conference === 'SEC',
    inBefore ? inBefore.conference : 'nowhere');
  ok('  and after the move, plays in the Big Ten', inAfter && inAfter.conference === 'Big Ten',
    inAfter ? inAfter.conference : 'nowhere');
}

console.log('\n=== money reaches the field, slowly ===');
{
  /* THE LONGEST FUSE IN THE MODE. A conference starved in year one should be measurably
     worse by year four, and the same conference in year one should barely have moved,
     because a consequence you cannot see coming is a die roll. */
  const w = world();
  const g5 = 'Group of Five';
  const opening = L.OPENING_SHARE[g5];
  const starved = L.applyEdit(w, {
    id: 'cut', label: 'cut', set: { ['money.share.' + g5]: opening * 0.4 },
    move: {}, effects: {}, aimed: {},
  });
  const early = S.moneyDrift(starved, g5);
  const late = S.moneyDrift(Object.assign({}, starved, { year: starved.startYear + 5 }), g5);
  ok('cutting a share does almost nothing the same year', Math.abs(early) < 0.05,
    early.toFixed(3) + ' points of strength');
  ok('  and bites five years later', late < -0.2, late.toFixed(3) + ' points of strength');
  ok('  and it is bounded, because no formula makes a bad team good',
    Math.abs(S.moneyDrift(Object.assign({}, starved, { year: starved.startYear + 50 }), g5)) <= 0.55);
}

console.log('\n=== the season answers back ===');
{
  const sim = run(world(), 2);
  ok('a season produces a ledger edit', !!sim.edit && typeof sim.edit.effects === 'object',
    Object.keys(sim.edit.effects).join(', '));
  ok('  that applyEdit accepts', typeof L.applyEdit(world(), sim.edit) === 'object');
  ok('  under a readable name', /^The \d{4} season/.test(sim.edit.label), sim.edit.label);
  ok('  and every axis it pushes is a real axis',
    Object.keys(sim.edit.effects).every((a) => L.AXES.indexOf(a) >= 0));
  ok('  it says what happened in words', Array.isArray(sim.notes), (sim.notes || []).length + ' notes');
}

console.log('\n=== a five season term ===');
{
  /* The thing a player actually does: play the term out and check the sport is still
     coherent at the end of it rather than only on the first screen. */
  let w = world();
  const champs = [];
  for (let y = 0; y < 5; y++) {
    const sim = run(w, 20 + y);
    if (!sim) break;
    champs.push(sim.bracket.champion.team.school);
    w = L.applyEdit(w, sim.edit);
    w = Object.assign({}, w, { year: w.year + 1 });
  }
  ok('five seasons play', champs.length === 5, champs.join(', '));
  ok('  and they are not all the same team', new Set(champs).size > 1,
    new Set(champs).size + ' different champions');
  ok('  only the first is played by teams the data actually had',
    run(world(), 1).fromRealData === true);
}

console.log('\n=== the pool is a promise the football has to pay for ===');
{
  /* THIS IS THE TEST FOR THE THING NOTHING WOULD HAVE CAUGHT. `money.pool` was written by the
     distribution dial and read by NOTHING: not the season, not the meters, not the blocs, not
     the ending. Every test passed, every screen rendered, and the biggest number in the sport
     did nothing at all. A tester found it by dragging the dial and watching the page fail to
     react, which is not a way to find bugs.

     So the assertion is the causal claim itself, made against played seasons rather than
     against the arithmetic: move the pool and the sport has to come out somewhere different. */
  const play = (pool, seed) => {
    const w = world();
    w.money.pool = pool;
    return S.play(w, teams, rngFor(seed), { through: S.WEEKS, titles: true, bracket: true });
  };
  const mid = play(1.3, 71);
  ok('a season settles its books', !!(mid.books && mid.books.known),
    mid.books ? '$' + mid.books.pool.toFixed(2) + 'B promised, $' + mid.books.worth.toFixed(2) + 'B earned' : 'no books');
  /* THE OPENING SPORT BREAKS EVEN. The rate is fitted to make that true, so if the football
     is ever retuned this is the check that says the money needs refitting with it. */
  ok('  and the sport as handed over is roughly level', Math.abs(mid.books.gap) < 0.12,
    'gap ' + mid.books.gap.toFixed(2) + 'B');

  const low = play(1.0, 71), high = play(2.2, 71);
  ok('promising more than the football earns is a shortfall',
    high.books.gap > 0.5 && high.tags.indexOf('overcommitted') >= 0,
    'gap ' + high.books.gap.toFixed(2) + 'B, tags ' + high.tags.join('/'));
  ok('  and promising less is money held back',
    low.books.gap < -0.2 && low.tags.indexOf('underpaid') >= 0,
    'gap ' + low.books.gap.toFixed(2) + 'B, tags ' + low.tags.join('/'));
  /* THE SAME FOOTBALL, so any difference below is the pool and only the pool. */
  ok('  with the football itself untouched by any of it',
    high.bracket.champion.team.school === low.bracket.champion.team.school
    && high.perGame === low.perGame,
    low.bracket.champion.team.school + ', ' + low.perGame.toFixed(2) + 'M a game either way');

  /* AND IT REACHES THE LEDGER, which is the half that was missing. */
  const after = (sim) => {
    const w = L.applyOutcome(L.applyEdit(world(), sim.edit), sim.edit, {});
    return w.meters.revenue;
  };
  ok('overspending costs the sport revenue against breaking even',
    after(high) < after(mid) - 3,
    'revenue ' + after(high).toFixed(1) + ' vs ' + after(mid).toFixed(1));
  ok('  and it is worse the more you promise',
    after(play(2.2, 71)) < after(play(1.6, 71)),
    '$2.2B ' + after(play(2.2, 71)).toFixed(1) + ' vs $1.6B ' + after(play(1.6, 71)).toFixed(1));
  /* THE ROOM ANSWERS THE UNDERPAY, which is the whole cost of that side: the books are fine
     and the conferences are not. */
  ok('  while underpaying is aimed at the conferences rather than at the sport',
    Object.keys(low.edit.aimed).length >= 4 && !Object.keys(mid.edit.aimed).length,
    'underpaid hits ' + Object.keys(low.edit.aimed).join(', ') + '; level hits nobody');

  /* GROWING THE AUDIENCE IS THE OTHER LEVER, or the dial is the only thing that matters and
     none of the football decisions feed back into the money. */
  const wide = world();
  wide.money.pool = 1.6; wide.playoff.teams = 24; wide.rules.confGames = 12;
  const grown = S.play(wide, teams, rngFor(71), { through: S.WEEKS, titles: true, bracket: true });
  const flat = play(1.6, 71);
  ok('a bigger audience closes the gap at the same pool', grown.books.gap < flat.books.gap - 0.05,
    'grown ' + grown.books.gap.toFixed(2) + 'B vs ' + flat.books.gap.toFixed(2) + 'B, at '
    + grown.perGame.toFixed(2) + 'M a game vs ' + flat.perGame.toFixed(2) + 'M');
}

console.log('\n=== the one way door bends the football ===');
{
  /* THE CLAIM: whether a man who has been a professional can come back is not a posture, it
     is a rule about who is good. An open door sends him to a program that can pay him and
     start him, so the league stretches away from its middle.

     ASSERTED ON THE SPREAD, NOT ON THE LEVEL. The first version of this drift moved the four
     power conferences up and everybody else down, which in a seventy team league where
     sixty-seven ARE the powers is a level shift wearing a costume: it moved the audience ten
     per cent, which would have swamped the pool settlement, and moved who reached the bracket
     by nothing. So what is checked here is the shape it is supposed to have. */
  const at = (rule, year) => {
    const w = world();
    w.labour.reentry = rule;
    w.year = year;
    return w;
  };
  const spreadOf = (w, seed) => {
    const sim = S.play(w, teams, rngFor(seed), { through: S.WEEKS, titles: true, bracket: true });
    const zs = sim.teams.map((t) => t.z);
    const m = zs.reduce((a, b) => a + b, 0) / zs.length;
    return {
      spread: Math.sqrt(zs.reduce((a, b) => a + (b - m) ** 2, 0) / zs.length),
      perGame: sim.perGame,
      blowouts: sim.games.filter((g) => g.margin >= 28).length / sim.games.length,
    };
  };
  ok('nothing has happened in year one, whatever the rule is',
    S.reentryDrift(at('open', 2025), 'SEC', 1.5) === 0
    && S.reentryDrift(at('closed', 2025), 'SEC', 1.5) === 0);

  const open = spreadOf(at('open', 2029), 31);
  const shut = spreadOf(at('closed', 2029), 31);
  ok('an open door stretches the league by year five', open.spread > shut.spread * 1.15,
    'spread ' + open.spread.toFixed(3) + ' open vs ' + shut.spread.toFixed(3) + ' shut');
  ok('  and the sport is visibly more lopsided for it',
    open.blowouts > shut.blowouts,
    (open.blowouts * 100).toFixed(1) + '% of games won by four scores vs '
    + (shut.blowouts * 100).toFixed(1) + '%');
  /* AND THE AUDIENCE BARELY MOVES, which is the half that has to stay small: viewership is
     what the pool is settled against, so a labour posture that swung it would quietly rewrite
     the money. */
  ok('  while the audience barely notices', Math.abs(open.perGame - shut.perGame) < 0.16,
    open.perGame.toFixed(2) + 'M vs ' + shut.perGame.toFixed(2) + 'M a game');

  /* A CONFERENCE THAT SHUT ITS DOOR ALONE pays for it twice, which is the cost of going
     first and the reason the divergence is a decision rather than a detail. */
  const split = world();
  split.year = 2029;
  split.labour.rulesBy = 'conference';
  split.labour.confReentry = { SEC: 'open', 'Big Ten': 'closed', ACC: 'open', 'Big 12': 'open' };
  ok('a league that shuts its door alone is worse off than one that shuts it with everybody',
    S.reentryDrift(split, 'Big Ten', 1.2) < S.reentryDrift(at('closed', 2029), 'Big Ten', 1.2),
    'alone ' + S.reentryDrift(split, 'Big Ten', 1.2).toFixed(3)
    + ' vs together ' + S.reentryDrift(at('closed', 2029), 'Big Ten', 1.2).toFixed(3));
  ok('  and a league that kept its open while a rival shut is better off',
    S.reentryDrift(split, 'SEC', 1.2) > 0, S.reentryDrift(split, 'SEC', 1.2).toFixed(3));
  /* THE RULE A CONFERENCE IS LIVING UNDER is the national one until it writes its own AND
     this office has let it, which is two conditions and the sort of thing that silently
     becomes one. */
  const notDevolved = world();
  notDevolved.labour.confReentry = { SEC: 'closed', 'Big Ten': '', ACC: '', 'Big 12': '' };
  ok('  a conference rule counts for nothing until the rules are devolved',
    S.reentryRule(notDevolved, 'SEC') === 'open', S.reentryRule(notDevolved, 'SEC'));
}

console.log('\n=== the rivalries are on the calendar ===');
{
  const w = world();
  const sim = run(w, 51);
  const inLeague = {};
  sim.teams.forEach((t) => { inLeague[t.school] = t; });
  const want = RV.playable(inLeague);
  const played = sim.games.filter((g) => g.rivalry);
  ok('every rivalry both schools are here for gets played',
    played.length === want.length, played.length + ' of ' + want.length);
  ok('  and each one only once',
    new Set(played.map((g) => g.rivalry)).size === played.length);
  ok('  between the two schools it is actually between',
    played.every((g) => {
      const r = RV.BY_ID[g.rivalry];
      return (g.a.school === r.a && g.b.school === r.b) || (g.a.school === r.b && g.b.school === r.a);
    }));
  /* THE DATE IS THE POINT. November is shaped by these games being at the end of it, and a
     Game coloring into week three would be the whole thing failing quietly. */
  const onDate = played.filter((g) => g.week === g.want).length;
  ok('  and almost all of them on the date they want',
    onDate >= played.length - 2, onDate + ' of ' + played.length + ' on their own date');

  /* PROTECTED MEANS PROTECTED. Move one of them into another conference and the game still
     has to happen: that is the difference between a rivalry and a scheduling coincidence. */
  const moved = L.applyEdit(world(), { move: { Michigan: 'SEC' } });
  const movedSim = S.play(moved, teams, rngFor(51));
  const theGame = movedSim.games.filter((g) => g.rivalry === 'the-game');
  ok('a rivalry survives one of them changing conference', theGame.length === 1,
    theGame.length ? 'played in week ' + theGame[0].week
      + (theGame[0].conf ? ' as a conference game' : ' as a non-conference game') : 'not played');
  ok('  and it comes out of their non-conference dates',
    theGame.length === 1 && !theGame[0].conf);

  /* NOBODY PLAYS ANYBODY TWICE, which was true of nothing before the rivalries went on first
     and forced the question: about thirteen pairs a season met twice, and the fixed pairings
     made it worse because the later phases knew nothing about them. */
  const pairs = {}; let twice = 0;
  sim.games.forEach((g) => {
    const k = [g.a.school, g.b.school].sort().join('|');
    if (pairs[k]) twice++;
    pairs[k] = 1;
  });
  ok('  and no two teams meet twice in a regular season', twice === 0, twice + ' repeat meetings');
  /* AND EVERYBODY STILL PLAYS TWELVE, which is the thing all of this could quietly break. */
  const short = sim.teams.filter((t) => t.wins + t.losses < S.GAMES).length;
  ok('  with everybody still playing a full season', short === 0, short + ' teams short of twelve');
}

console.log('\n=== the sport has a poll to argue about ===');
{
  const w = world();
  const sim = run(w, 41);
  ok('there is a poll for every week and one before them',
    sim.polls.length === sim.through + 1, sim.polls.length + ' polls, ' + sim.through + ' weeks');
  ok('  and it is twenty-five long', sim.poll.length === S.POLL_SIZE, sim.poll.length + ' teams');
  ok('  ranked one to twenty-five with nothing missing',
    sim.poll.every((r, i) => r.rank === i + 1));
  ok('  and nobody is in it twice',
    new Set(sim.poll.map((r) => r.school)).size === sim.poll.length);
  /* THE PRESEASON HAS NO MOVEMENT BECAUSE THERE IS NOTHING TO HAVE MOVED FROM, which is the
     kind of thing that renders as a green arrow saying "up 0" if nobody checks. */
  ok('  August has no arrows on it', sim.polls[0].top.every((r) => r.move === null && !r.fresh));
  ok('  and every team in August has played nothing',
    sim.polls[0].top.every((r) => r.wins === 0 && r.losses === 0));

  /* A POLL IS LAST WEEK WITH THIS WEEK DONE TO IT. If it moved like a sorted list it would
     not be a poll, and if it never moved it would not be one either. */
  const moves = sim.polls.slice(1).flatMap((p) => p.top.filter((r) => !r.fresh && r.move != null)
    .map((r) => Math.abs(r.move)));
  const mean = moves.reduce((s, x) => s + x, 0) / moves.length;
  ok('  it moves week to week', mean > 0.5 && mean < 6, 'mean move ' + mean.toFixed(2) + ' places');
  ok('  and not by everything at once', moves.filter((m) => m > 15).length < moves.length * 0.02,
    moves.filter((m) => m > 15).length + ' of ' + moves.length + ' moves over fifteen places');

  /* AUGUST IS A GUESS AND HAS TO BE WRONG SOMETIMES. Ranking by strength alone made the
     preseason poll an oracle: it was sorted by the very number that decides the games. */
  const pre = new Set(sim.polls[0].top.slice(0, 10).map((r) => r.school));
  const kept = sim.poll.slice(0, 10).filter((r) => pre.has(r.school)).length;
  ok('  and August was wrong about somebody', kept < 10, kept + ' of the August top ten survived');

  /* AND LOSING DOES NOT MOVE A TEAM UP, which is the one rule of a poll every voter gets
     shouted at for breaking.

     STATED CAREFULLY, BECAUSE THE OBVIOUS VERSION IS FALSE. A team that loses CAN finish the
     week higher, when the teams in front of it lost too: that is not a reward, it is everyone
     ahead falling past it, and it happens in real polls every November. What must not happen
     is climbing while nobody above lost. Smoothing alone allowed about four of those a season
     and pollSeason now clamps them, which leaves roughly one per thirty seasons where a team
     above slid on an unimpressive win rather than a defeat. That one is real poll behavior,
     so this allows it rather than chasing it to zero and making the poll rigid. */
  let climbed = 0, unexplained = 0;
  for (let n = 1; n < sim.polls.length; n++) {
    const before = {}; sim.polls[n - 1].top.forEach((r) => { before[r.school] = r; });
    const now = {}; sim.polls[n].top.forEach((r) => { now[r.school] = r; });
    sim.polls[n].top.forEach((r) => {
      const was = before[r.school];
      if (!(was && r.losses > was.losses && r.rank < was.rank)) return;
      climbed++;
      const aboveLost = sim.polls[n - 1].top.filter((x) => x.rank < was.rank)
        .some((x) => now[x.school] && now[x.school].losses > x.losses);
      if (!aboveLost) unexplained++;
    });
  }
  ok('  and losing only moves a team up when everyone ahead lost too', unexplained <= 1,
    climbed + ' climbed in a week they lost, ' + unexplained + ' with nobody above them losing');
}

console.log('\n=== December is not just the bracket ===');
{
  /* FOURTEEN BOWLS SAT IN venues.js AND NEVER KICKED OFF, so a hundred and twenty-four teams
     finished the year with nothing. Everything here is a rule a fan would state out loud. */
  const w = world();
  const sim = run(w, 31);
  const seats = {};
  sim.field.seats.forEach((s) => { seats[s.team.school] = true; });

  ok('the bowls are played', sim.bowls.length > 0, sim.bowls.length + ' bowls');
  ok('  and six wins is what gets you one',
    sim.bowls.every((b) => b.a.wins >= S.BOWL_MIN_WINS && b.b.wins >= S.BOWL_MIN_WINS),
    'lowest ' + Math.min(...sim.bowls.flatMap((b) => [b.a.wins, b.b.wins])) + ' wins');
  ok('  and nobody in the playoff is also in one',
    !sim.bowls.some((b) => seats[b.a.school] || seats[b.b.school]));
  const seen = {}; let twice = null;
  sim.bowls.forEach((b) => {
    [b.a, b.b].forEach((t) => { if (seen[t.school]) twice = t.school; seen[t.school] = 1; });
  });
  ok('  and nobody plays two of them', !twice, twice || 'each team once');
  ok('  and every scoreline is one football can produce',
    sim.bowls.every((b) => S.plausible(b.score[0], b.score[1])),
    sim.bowls.map((b) => b.score.join('-')).join(' '));

  /* THE LADDER, which is the difference between a bowl slate and a list. The best bowl left
     takes a better team than the worst one does, and the first version of this got it wrong
     in the most visible way: Washington against Tennessee in the Bahamas Bowl. */
  const first = sim.bowls[0], last = sim.bowls[sim.bowls.length - 1];
  ok('  and the better bowl gets the better team',
    first && last && S.resume(first.a) > S.resume(last.a),
    first && last ? first.name + ' took ' + first.a.school + ', ' + last.name + ' took ' + last.a.school : 'not enough bowls');

  /* THE BRACKET IS PLAYED IN THE BOWLS, late rounds only: the first round is on campus, which
     is the part of the twelve team format people actually like. */
  const rounds = sim.bracket.rounds;
  const named = rounds.flatMap((r, i) => r.filter((g) => g.bowlName).map(() => i));
  ok('the bracket is played in the bowls', named.length > 0, named.length + ' games in a bowl');
  ok('  but never the first round, which is on campus', !named.includes(0),
    'rounds with a bowl: ' + Array.from(new Set(named)).join(', '));
  ok('  nor the final, which is its own game',
    !(rounds[rounds.length - 1] || []).some((g) => g.bowlName));
  /* ONE BOWL CANNOT HOST TWO GAMES, which is the way this would break silently: the slate is
     filled from the same catalog the bracket just took six out of. */
  const usedNames = rounds.flatMap((r) => r.filter((g) => g.bowl).map((g) => g.bowl))
    .concat(sim.bowls.map((b) => b.bowl));
  ok('  and no bowl hosts two games', new Set(usedNames).size === usedNames.length,
    usedNames.length + ' games, ' + new Set(usedNames).size + ' distinct bowls');

  /* A BIGGER PLAYOFF EATS THE BOWL POOL, which is a real argument about expansion and is the
     thing this system lets the mode make. Asserted on the POOL rather than on the number of
     bowls, because at these sizes there are still enough teams to fill all eight either way
     and a count would pass without measuring anything. */
  const eligible = (s) => {
    const inField = {};
    s.field.seats.forEach((x) => { inField[x.team.school] = true; });
    return s.teams.filter((t) => t.wins >= S.BOWL_MIN_WINS && !inField[t.school]).length;
  };
  const big = world({ playoff: { teams: 24, byes: 8, autobids: 5 } });
  const bigSim = run(big, 31);
  ok('a bigger playoff eats into the bowl pool', eligible(bigSim) < eligible(sim),
    eligible(sim) + ' teams free for a bowl at 12, ' + eligible(bigSim) + ' at 24');
}

/* THE FIELD IS SET A WHOLE BEAT BEFORE THE BRACKET IS PLAYED.
   Standing in the office on the playoff, championship weekend has happened and the twelve are
   known; none of the games have been. That gap is the one week a year the bracket IS the
   sport, and the office had nothing to draw because the field was only computed on the way
   into the bracket. It is on the sim as soon as the titles are, and the office previews it.

   THE PREVIEW MUST NOT DISAGREE WITH THE GAMES IT PREVIEWS, which is the whole risk of
   drawing a fixture list next to a simulation that pairs its own. So the pairing rule lives
   in firstRound() and bracket() opens with it, and this walks every field size the mode can
   produce to check the two say the same thing. */
console.log('\n=== the field, before the bracket is played ===');
{
  const w = world();
  const set = S.play(w, teams, rngFor(9), { through: 20, titles: true, bracket: false });
  ok('the seats are filled without playing a game', !!(set && set.field && set.field.seats),
    set && set.field ? set.field.seats.length + ' seats' : 'no field');
  ok('  and no bracket came with them', !!set && !set.bracket);
  ok('  every seat is seeded in order',
    set.field.seats.every((x, i) => x.seed === i + 1));
  ok('  and somebody is the first team out', !!set.field.snub,
    set.field.snub ? set.field.snub.school : 'nobody');

  /* AND THE FIXTURE LIST IS THE ONE THAT GETS PLAYED, at every size and every bye count. */
  const shapes = [
    { teams: 4, byes: 0, autobids: 0 },
    { teams: 8, byes: 0, autobids: 4 },
    { teams: 12, byes: 4, autobids: 5 },
    { teams: 14, byes: 2, autobids: 5 },
    { teams: 16, byes: 0, autobids: 6 },
    { teams: 24, byes: 8, autobids: 5 },
  ];
  const off = [];
  for (const shape of shapes) {
    const ww = world({ playoff: shape });
    const played = run(ww, 9);
    if (!played || !played.bracket) { off.push(shape.teams + ': nothing played'); continue; }
    const pre = S.firstRound(played.field.seats, ww);
    const real = played.bracket.rounds[0] || [];
    const asPlayed = real.map((g) => g.top.seed + 'v' + g.bottom.seed).join(' ');
    const asDrawn = pre.games.map((g) => g[0].seed + 'v' + g[1].seed).join(' ');
    if (asPlayed !== asDrawn) off.push(shape.teams + ': drew [' + asDrawn + '] played [' + asPlayed + ']');
    /* And a team with a bye is a team the first round does not contain. */
    const playing = {};
    real.forEach((g) => { playing[g.top.seed] = 1; playing[g.bottom.seed] = 1; });
    const wrong = pre.byes.filter((x) => playing[x.seed]).map((x) => x.seed);
    if (wrong.length) off.push(shape.teams + ': seed ' + wrong.join(',') + ' had a bye and a game');
  }
  ok('the fixture list is the bracket that gets played', !off.length,
    off.slice(0, 3).join('   |   ') || shapes.length + ' field sizes agree');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
