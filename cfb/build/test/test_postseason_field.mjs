/* ONE STANDARD FOR EVERYBODY IN THE POSTSEASON.
 *
 *   node cfb/build/test/test_postseason_field.mjs
 *
 * A player wrote in with both ends of the same bug:
 *
 *   "I am seeing some 9-3 teams make the playoff but not when I am with a hard schedule.
 *    Also facing playoff teams in a bowl game as a 3/4 loss team."
 *
 * They were right twice. The bracket's bottom seats were drawn from any nine or ten win
 * team in the data, so a 9-3 was in the field about four times in ten while the player's
 * own 9-3 ranked twentieth and missed in 556 seasons out of 556. And a New Year's Six
 * opponent was drawn from any eleven-win team with no ceiling on it, so a quarter of them
 * were undefeated: a three-loss team being sent out against the national champion, who
 * cannot be in a bowl at all, because a team that good is playing in the bracket.
 *
 * What is under test is that the country is now judged by the same two functions the
 * player is. nationalRank says where a season finished and seedFromRanking says what that
 * earns, and every postseason opponent is drawn from the teams that earned that thing.
 *
 * Nothing here is about difficulty. That is tune_bracket.mjs's job, and it holds: playoff
 * 15.40% against 15.45% before, title 0.192% against 0.199%.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_' + f, 'utf8'));
const teams = rd('team_seasons.json');
const data = R.indexData(rd('player_seasons.json'), teams);
const P = data.prepared;
const C = E.CONSTANTS;

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const winsOf = (t) => Number(String(t.record).split('-')[0]) || 0;

/* Every real season's own place, worked out the way the player's is. The resume is
   already in prepareData; this is the same arithmetic run back over the country. */
const confSum = {}, confCount = {};
for (const t of teams) {
  const k = t.season + '|' + t.conference;
  confSum[k] = (confSum[k] || 0) + t.strength_z;
  confCount[k] = (confCount[k] || 0) + 1;
}
const rankOf = (t) => {
  const [w, l] = String(t.record).split('-').map(Number);
  const k = t.season + '|' + t.conference;
  return E.nationalRank(E.resumeScore(w || 0, l || 0, t.strength_z,
    confCount[k] ? confSum[k] / confCount[k] : 0), P);
};

console.log('=== the field is selected, not dealt ===');
{
  const rng = E.createSeededRNG(E.hashSeed('field'));
  const seats = [];
  for (let i = 0; i < 400; i++) {
    const br = E.buildBracket(P, rng, 1 + Math.floor(rng() * C.PLAYOFF_TEAMS));
    for (const k of Object.keys(br.field)) {
      const s = br.field[k];
      if (s && s.team) seats.push({ seed: Number(k), team: s.team, rank: rankOf(s.team) });
    }
  }
  const missed = seats.filter((s) => s.rank > C.PLAYOFF_TEAMS);
  ok('every seat in the bracket would have been selected for it',
    missed.length === 0,
    missed.length ? missed.length + ' of ' + seats.length + ', worst ' +
      missed.map((m) => m.team.display + ' ' + m.team.record + ' ranked ' + m.rank)[0]
      : seats.length + ' seats');
  /* THE COMPLAINT, IN ONE LINE. A three-loss team can still be in there, because a few
     of them really do rank inside twelve on their own resume, and if that ever stops
     being rare it is this line that says so. The old field was 60% three-loss teams in
     the bottom five seats. */
  const bottom = seats.filter((s) => s.seed > C.BRACKET_GREAT_SEEDS);
  const three = bottom.filter((s) => Number(String(s.team.record).split('-')[1]) >= 3);
  ok('and a three-loss team in it is the exception rather than the rule',
    three.length * 100 / bottom.length < 30,
    (three.length * 100 / bottom.length).toFixed(0) + '% of the bottom seats');
  const top = seats.filter((s) => s.seed <= C.BRACKET_ELITE_SEEDS);
  ok('a one seed is still one of the best seasons in the data',
    top.every((s) => winsOf(s.team) >= 11),
    Math.min(...top.map((s) => winsOf(s.team))) + ' wins at worst');
}

console.log('\n=== nobody in a bowl is somebody the game put in the playoff ===');
{
  const rng = E.createSeededRNG(E.hashSeed('bowls'));
  const band = { ny6: [C.PLAYOFF_TEAMS + 1, C.BOWL_NY6_RANK],
    major: [C.BOWL_NY6_RANK + 1, C.BOWL_MAJOR_RANK],
    other: [C.BOWL_MAJOR_RANK + 1, C.FIELD_SIZE] };
  for (const tier of ['ny6', 'major', 'other']) {
    const drawn = [];
    for (let i = 0; i < 600; i++) drawn.push(E.generateBowlOpponent(P, rng, tier));
    const ranks = drawn.map(rankOf);
    const inField = ranks.filter((r) => r <= C.PLAYOFF_TEAMS).length;
    ok(tier + ': not one opponent would have made the field', inField === 0,
      inField + ' of ' + drawn.length);
    const [lo, hi] = band[tier];
    const outside = ranks.filter((r) => r < lo || r > hi).length;
    ok('  ...and every one of them finished where this bowl is', outside === 0,
      outside + ' outside ' + lo + '-' + hi);
    /* Bowl eligibility is winning half your games, which is the player's six of twelve
       said as a fraction so that 2020's five and six game seasons are judged by the same
       rule rather than ruled out by a number their calendar could not reach. A season
       that would not have been invited cannot be the other team in the room. */
    const short = drawn.filter((t) => {
      const [w, l] = String(t.record).split('-').map(Number);
      return (w || 0) * 2 < (w || 0) + (l || 0);
    });
    ok('  ...and every one of them won half its games, which is the bar',
      short.length === 0,
      short.length ? short[0].display + ' ' + short[0].record : drawn.length + ' checked');
  }
}

console.log('\n=== who you played counts, at the same record ===');
{
  /* Two identical seasons, same record and same margin, different slates. Both slates
     are real ones this generator deals. Nothing else differs, so any gap in the ranking
     is the schedule and only the schedule. */
  const rng = E.createSeededRNG(E.hashSeed('sos'));
  const slates = [];
  for (let i = 0; i < 400; i++) {
    const zs = E.generateSchedule(P, rng).games.map((g) => g.strength_z);
    slates.push({ zs, losses: E.expectedLosses(zs) });
  }
  slates.sort((a, b) => a.losses - b.losses);
  const soft = slates[Math.floor(slates.length * 0.1)];
  const hard = slates[Math.floor(slates.length * 0.9)];
  /* 9-3 rather than 10-2, because 10-2 lands on the same rank either way: the ladder is
     packed at the top and a tie-break sized term cannot move a season through it. Down
     here, where a place is worth less, the same term is visible, and this is also the
     record the player who reported it was on. */
  const rankFor = (slate) => E.rankSeason(9, 3, 5.0, slate.zs, P).rank;
  const softRank = rankFor(soft), hardRank = rankFor(hard);
  ok('a harder slate ranks ahead of a softer one', hardRank < softRank,
    'hard ' + hardRank + ' vs soft ' + softRank
    + '   (' + hard.losses.toFixed(2) + ' losses vs ' + soft.losses.toFixed(2) + ')');
  /* AND NOT BY MUCH, which is the other half of getting this right. Strength of schedule
     is a tie-break between teams with the same record; a term that can overturn a win is
     the same bug pressing the other way. */
  const oneWin = E.rankSeason(10, 2, 5.0, soft.zs, P).rank;
  ok('and a win still outranks a schedule', oneWin < hardRank,
    '10-2 on the soft slate ranks ' + oneWin + ', 9-3 on the hard one ' + hardRank);

  /* The generator's own spread, because the resume can only credit what it is given.
     If this ever widens back out, seasons are being decided by the wheel again. */
  const q = (p) => slates[Math.floor((slates.length - 1) * p)].losses;
  ok('and the slates it deals are close enough that it stays a tie-break',
    q(0.9) - q(0.1) < 0.5,
    'p10 ' + q(0.1).toFixed(2) + '  p90 ' + q(0.9).toFixed(2)
    + '  par ' + P.meanScheduleLosses.toFixed(2));
  /* Par is a measured constant and the data under it can move. probe_schedule.mjs prints
     both; this fails when they have drifted far enough to matter. */
  const dealt = slates.reduce((s, x) => s + x.losses, 0) / slates.length;
  ok('and par is still what the generator actually deals',
    Math.abs(dealt - P.meanScheduleLosses) < 0.1,
    'deals ' + dealt.toFixed(2) + ', par ' + P.meanScheduleLosses.toFixed(2));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
