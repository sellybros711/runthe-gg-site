/*
 * The playoff bracket, checked against real brackets.
 *
 * The bracket decides nothing: generatePlayoffs() picked the player's opponents and
 * the balance is measured on those. What createBracket() builds is the field around
 * that path, so the things that can go wrong are all about agreement and shape:
 *
 *   the seat across from the player is the club the run really scheduled
 *   twelve clubs, twelve different franchises, no season drawn twice
 *   the reseed never pairs anybody with themselves or with a club already out
 *   a column stays unknown until the one feeding it has been played
 *   the player's line is drawn forward to the World Series until the run says otherwise
 *
 * Every one of those fails silently on screen: a bracket that pairs the 1927 Yankees
 * with the 1927 Yankees still renders, and a bracket showing the wrong opponent still
 * renders, and both look fine in a screenshot.
 *
 *   node baseball/check-bracket.mjs [brackets]
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const R = require('./run.js');
const players = require('./data/players.json');

const WANT = parseInt(process.argv[2], 10) || 120;

let fails = 0;
function bad(label, detail) {
  fails++;
  console.log('  FAIL  ' + label + (detail ? '  ' + detail : ''));
}
function band(label, got, lo, hi, fmt) {
  const f = fmt || (v => v.toFixed(2));
  const ok = got >= lo && got <= hi;
  if (!ok) fails++;
  console.log('  ' + (ok ? ' ok  ' : 'FAIL ') + label.padEnd(40) + f(got).padStart(8) +
    '   want ' + f(lo) + ' to ' + f(hi));
}

console.log('\nRUN THE DIAMOND: the playoff bracket\n');

const DATA = R.indexData(players);

/* A drafted run that reached October, the same way a player gets one. */
function octoberRun(seed) {
  const run = R.createRun({ seed });
  let guard = 0;
  while (run.phase === 'draft' && guard++ < 120) {
    let d;
    try { d = R.spin(run, DATA); } catch (_) { return null; }
    if (!d.options.length) { try { R.respin(run, DATA); } catch (_) { return null; } continue; }
    try { R.sign(run, DATA.allPlayers[d.options[0]]); } catch (_) { return null; }
  }
  if (run.phase !== 'season') return null;
  const o = R.playSeason(run);
  return o.madePlayoffs ? run : null;
}

function bracketFor(run) {
  return E.createBracket({
    seed: run.seed,
    bye: !!run.playoffSeed.bye,
    rounds: run.playoffSeed.rounds,
    wins: run.outcome.wins,
    ladder: (run.playoffs.rounds || []).map(r => r.oppTeam ? {
      code: r.oppTeam, season: r.oppSeason, rating: r.oppRating,
      id: r.oppSeason ? E.teamSeasonId(r.oppTeam, r.oppSeason) : r.oppTeam,
    } : null),
    teamSeasons: DATA.teamSeasons,
  });
}

let built = 0, tried = 0, byes = 0, wilds = 0;
let upsets = 0, favourites = 0, titlesForFillers = 0;
const seedsSeen = {};

for (let s = 0; s < 4000 && built < WANT; s++) {
  tried++;
  const run = octoberRun(20000 + s);
  if (!run) continue;
  built++;
  const B = bracketFor(run);
  const rounds = run.playoffs.rounds;
  const tag = 'seed ' + run.seed;

  if (B.bye) byes++; else wilds++;
  seedsSeen[B.mySeed] = (seedsSeen[B.mySeed] || 0) + 1;

  // ---- the field ----------------------------------------------------------
  const seats = [];
  for (const side of ['near', 'far']) for (let n = 1; n <= 6; n++) seats.push(B[side][n]);
  if (seats.length !== 12) bad('twelve seats', tag + ' got ' + seats.length);
  if (seats.some(x => !x)) bad('every seat is filled', tag);
  const mine = seats.filter(x => x && x.you);
  if (mine.length !== 1) bad('exactly one seat is the player', tag + ' got ' + mine.length);
  if (mine[0] && mine[0].seed !== B.mySeed) bad('the player sits in their own seed', tag);
  if (B.near[B.mySeed] !== mine[0]) bad('the player is on the near side', tag);
  if (B.bye !== (B.mySeed <= 2)) bad('a bye is a top-two seed and nothing else', tag);
  if (B.firstCol !== 4 - run.playoffSeed.rounds) bad('the walk-in column matches the bracket', tag);

  /* One season per franchise among the FILLERS. The ladder is allowed to send the
     same club twice in different years, because the run really did play the 1951
     Giants and then the 1908 Giants, and a bracket that hid one of them would
     disagree with the series the player sat through. */
  const rung = {};
  for (const r of rounds) if (r.oppTeam) rung[E.teamSeasonId(r.oppTeam, r.oppSeason)] = 1;
  const clubs = {}, ids = {};
  for (const e of seats) {
    if (!e || !e.team) continue;
    if (clubs[e.team.code] && !rung[e.team.id])
      bad('one season per franchise among the fillers', tag + ' ' + e.team.code + ' twice');
    if (ids[e.team.id]) bad('no team-season drawn twice', tag + ' ' + e.team.id);
    clubs[e.team.code] = 1; ids[e.team.id] = 1;
  }
  if (Object.keys(ids).length !== 11) bad('eleven real clubs beside the player', tag +
    ' got ' + Object.keys(ids).length);

  // ---- agreement with the run --------------------------------------------
  rounds.forEach((r, i) => {
    const col = B.colOf(i);
    const games = B.colGames(col);
    const g = games.find(x => x.me);
    if (!g) { bad('the player is in every round they played', tag + ' round ' + i); return; }
    const seat = g.pair[0] && g.pair[0].you ? g.pair[1] : g.pair[0];
    if (!r.oppTeam) return;
    if (!seat || !seat.team || seat.team.code !== r.oppTeam || seat.team.season !== r.oppSeason)
      bad('the seat across from the player is the run\'s own opponent',
        tag + ' round ' + i + ' shows ' +
        (seat && seat.team ? seat.team.code + ' ' + seat.team.season : 'nobody') +
        ' for ' + r.oppTeam + ' ' + r.oppSeason);
    /* The round name the engine gave has to be the column the bracket puts it in. */
    if (r.round !== E.BRACKET.ROUNDS[col])
      bad('the round lands in its own column', tag + ' ' + r.round + ' at ' + E.BRACKET.ROUNDS[col]);
  });

  // ---- the walk forward ---------------------------------------------------
  if (B.knownAt(1) || B.knownAt(2) || B.knownAt(3))
    bad('nothing past the first column is known before anything is played', tag);

  for (let c = 0; c < 4; c++) {
    const games = B.colGames(c);
    const want = c === 3 ? 1 : (c === 2 ? 2 : 4);
    if (games.length !== want) bad('column ' + c + ' holds ' + want + ' series', tag +
      ' got ' + games.length);
    for (const g of games) {
      const [a, b] = g.pair;
      if (a && b && a === b) bad('nobody plays themselves', tag + ' ' + g.key);
      if (a && b && a.team && b.team && a.team.id === b.team.id)
        bad('nobody plays their own club', tag + ' ' + g.key + ' ' + a.team.id);
      /* Compared by club, not by identity: the seat across from the player is
         replaced with a fresh object carrying the run's own opponent, so it is
         never the same object the field was built with. */
      if (c < 3 && a && b && g.side !== 'ws') {
        const own = {};
        for (let n = 1; n <= 6; n++) { const e = B[g.side][n]; if (e && e.team) own[e.team.id] = 1; }
        for (const r2 of rounds) if (r2.oppTeam)
          own[E.teamSeasonId(r2.oppTeam, r2.oppSeason)] = 1;
        const inSide = (x) => !x || x.you || !x.team || !!own[x.team.id];
        if (!inSide(a) || !inSide(b))
          bad('a side only plays itself until the World Series', tag + ' ' + g.key);
      }
    }
    /* Walk it: settle this column, which unlocks the next. */
    games.forEach(g => { if (!g.me) B.revealed[g.key] = 1; });
    const r = rounds[c - B.firstCol];
    if (r) B.settleMine(c - B.firstCol, r.won, '4-0');
    else games.forEach(g => { B.revealed[g.key] = 1; });
    if (c < 3 && !B.knownAt(c + 1))
      bad('a played column unlocks the next one', tag + ' at column ' + c);
  }

  /* The player's own line: alive until the run says otherwise, and out afterwards. */
  let aliveTo = -1;
  rounds.forEach((r, i) => { if (r.won) aliveTo = i; });
  const lastWon = rounds.length && rounds[rounds.length - 1].won;
  for (let i = 0; i < rounds.length; i++) {
    const g = B.colGames(B.colOf(i)).find(x => x.me);
    if (!g) continue;
    const w = B.results[g.key];
    const wonIt = !!(w && w.you);
    if (wonIt !== !!rounds[i].won)
      bad('the bracket agrees with the run about who advanced', tag + ' round ' + i);
  }
  if (lastWon && rounds[rounds.length - 1].round !== 'World Series')
    bad('a run that keeps winning keeps playing', tag);

  /* Flavour worth watching: a bracket where the top seed always wins is not a
     bracket, and one where they never do is not baseball. */
  for (const c of [0, 1, 2]) for (const g of B.colGames(c)) {
    const [a, b] = g.pair;
    if (!a || !b || g.me) continue;
    const w = B.results[g.key];
    if (!w) continue;
    const hi = a.seed <= b.seed ? a : b;
    if (w === hi) favourites++; else upsets++;
  }
  const ws = B.colGames(3)[0];
  if (ws && B.results[ws.key] && !B.results[ws.key].you) titlesForFillers++;
}

console.log('  ' + built + ' brackets off ' + tried + ' drafted runs  (' +
  byes + ' byes, ' + wilds + ' wild cards)');
console.log('  ' + (fails ? fails + ' failures above' : 'every check passed'));

console.log('\nSHAPE\n');
band('upsets among the simulated series', 100 * upsets / Math.max(1, upsets + favourites),
  12, 45, v => v.toFixed(1) + '%');
const seedList = Object.keys(seedsSeen).map(Number).sort((a, b) => a - b);
console.log('  ' + 'seeds the player took'.padEnd(40) +
  seedList.map(s => s + ':' + seedsSeen[s]).join(' ').padStart(8));
if (seedList.length < 3) bad('the seeding spreads across the field', 'only ' + seedList.length);

/* Determinism: the same run always draws the same field. */
console.log('\nDETERMINISM\n');
{
  /* SEARCHED, NEVER PINNED, and this file had three magic seeds until the pool
     moved under them. The claim here is a property of `createBracket` (the same
     run always draws the same field) and it needs ANY run that reached October,
     so which seed supplies it is not part of the claim. `octoberRun` drafts by
     taking the first man on every board, which is a careless draft: measured
     against the shipped pool only about 30% of seeds reach the playoffs at all,
     so three pins had roughly a one in three chance of ALL failing on any change
     to the data, and that is what happened. Splitting traded stints back out
     took the pool 44,344 rows to 45,379, every seeded draw reshuffled, all three
     stopped qualifying, and the section reported a page defect when what it had
     was no fixture. Same lesson as the commissioner term fixture, which samples
     twelve seeds for the same reason.

     The search is bounded and the failure still means something: no run in two
     hundred seeds reaching October would be a real finding about the mode. */
  let run = null;
  for (let s = 20000; s < 20200 && !run; s++) run = octoberRun(s);
  if (!run) bad('a run to check determinism against', 'no seed in 20000-20199 reached October');
  else {
    const a = JSON.stringify(bracketFor(run).near.map(x => x && (x.you ? 'me' : x.team && x.team.id)));
    const b = JSON.stringify(bracketFor(run).near.map(x => x && (x.you ? 'me' : x.team && x.team.id)));
    if (a !== b) bad('the same run draws the same field');
    else console.log('   ok  the same run draws the same field');
  }
}

console.log('\n' + (fails ? fails + ' FAILURES' : 'All checks passed.') + '\n');
process.exit(fails ? 1 : 0);
