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
const L = require(ROOT + '/cfb/commish/ledger.js');
const S = require(ROOT + '/cfb/commish/season.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_team_seasons.json', 'utf8'));

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
  ok('  everybody plays a full schedule',
    sim.teams.every((t) => t.wins + t.losses === S.GAMES),
    'games per team: ' + Array.from(new Set(sim.teams.map((t) => t.wins + t.losses))).join(', '));
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

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
