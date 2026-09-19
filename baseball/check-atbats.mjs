/*
 * The at-bat simulator, checked against the only thing it is allowed to do.
 *
 * It dramatizes a score that resolveGame() already produced, so the one contract
 * that matters is that the dramatization is faithful: the line score adds up to
 * the score it was handed, every half inning is legal baseball, and the game ends
 * the way baseball ends. If any of that slips, a player watches a nine-inning game
 * whose final differs from the bracket beside it.
 *
 * It also checks the shape of what it produces (plate appearances per game, hits,
 * how often an inning is scoreless) against real baseball, because a legal game
 * that takes forty batters an inning is still the wrong game.
 *
 *   node baseball/check-atbats.mjs [runs]
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');

const N = parseInt(process.argv[2], 10) || 20000;

let fails = 0;
function check(label, ok, detail) {
  if (!ok) { fails++; console.log('  FAIL  ' + label + (detail ? '  ' + detail : '')); }
  return ok;
}
function band(label, got, lo, hi, fmt) {
  const f = fmt || (v => v.toFixed(2));
  const ok = got >= lo && got <= hi;
  if (!ok) fails++;
  console.log('  ' + (ok ? ' ok  ' : 'FAIL ') + label.padEnd(38) + f(got).padStart(8) +
    '   want ' + f(lo) + ' to ' + f(hi));
}

const NAMES = ['Ruth', 'Gehrig', 'Mays', 'Aaron', 'Bonds', 'Musial', 'Williams', 'Cobb', 'Mantle'];
const lineup = NAMES.map((n, i) => ({ name: n, slot: E.SLOTS[i], w: 8 - i * 0.4 }));
const other = NAMES.map((n, i) => ({ name: n + ' II', slot: E.SLOTS[i], w: 7 - i * 0.3 }));
const staff = {
  starter: { name: 'Johnson', slot: 'SP1' },
  reliever: { name: 'Eckersley', slot: 'RP1' },
  closer: { name: 'Rivera', slot: 'CL' },
};

console.log('\nRUN THE DIAMOND: at-bat simulator, ' + N.toLocaleString() + ' games\n');

// ─── faithfulness: the line score is the score it was handed ─────────────────

let pa = 0, hits = 0, halves = 0, scoreless = 0, walkoffs = 0, unplayedNinths = 0;
let maxPaHalf = 0, longestGame = 0, stranded = 0;
const runDist = {};

for (let g = 0; g < N; g++) {
  const rng = E.createSeededRNG(E.hashSeed('atbat-' + g));
  /* The scores are not invented here. They come out of resolveGame() at the run
   * rates a real playoff team carries, which is the only distribution the at-bat
   * engine will ever be handed. */
  const off = 4.2 + rng() * 1.6;
  const def = 3.6 + rng() * 1.4;
  const res = E.resolveGame(off, def, 0.85, rng, 1.08);
  const youHome = rng() < 0.5;
  const yourRuns = res.yourRuns, oppRuns = res.oppRuns;

  const s = E.simGameScript({
    yourRuns, oppRuns, won: res.won, youHome,
    yourName: 'You', oppName: '1927 NYY',
    yourLineup: lineup, oppLineup: other,
    yourStaff: staff, oppStaff: staff,
    rng,
  });

  check('final matches the score handed in (game ' + g + ')',
    s.final.yourRuns === yourRuns && s.final.oppRuns === oppRuns,
    s.final.yourRuns + '-' + s.final.oppRuns + ' want ' + yourRuns + '-' + oppRuns);

  let lineAway = 0, lineHome = 0;
  for (const row of s.line) {
    lineAway += row.top;
    if (row.bot != null) lineHome += row.bot;
  }
  check('line score adds to the final (game ' + g + ')',
    lineAway === s.final.away && lineHome === s.final.home,
    lineAway + '/' + lineHome + ' vs ' + s.final.away + '/' + s.final.home);

  check('nine innings (game ' + g + ')', s.line.length === 9);

  const homeWins = s.final.home > s.final.away;
  const lastBot = s.line[8].bot;
  if (lastBot == null) {
    unplayedNinths++;
    check('an unplayed ninth means the home club led (game ' + g + ')', homeWins);
  }
  if (s.walkoff) {
    walkoffs++;
    check('a walk-off is a home win (game ' + g + ')', homeWins);
    const last = s.halves[s.halves.length - 1];
    check('a walk-off ends on the last play (game ' + g + ')',
      last.half === 'bot' && last.inning === 9 && last.plays.length > 0 &&
      last.plays[last.plays.length - 1].rbi > 0);
  }

  let gamePa = 0;
  for (const h of s.halves) {
    halves++;
    if (h.runs === 0) scoreless++;
    runDist[h.runs] = (runDist[h.runs] || 0) + 1;

    /* EVERY BATTER IN A HALF COMES FROM THAT HALF'S LINEUP, and every runner who
     * scores was a batter in it. The way this breaks is that one club bats for
     * both, which on screen reads as your own left fielder scoring for the 1998
     * Braves, and nothing else about the game looks wrong. */
    const own = {};
    const lineup = (h.half === 'top') ? s.away.lineup : s.home.lineup;
    for (const b of lineup) own[b.name] = 1;
    for (const p of h.plays) {
      if (!own[p.batter.name])
        check('the batter is in the batting side\'s order (game ' + g + ' ' +
          h.half + h.inning + ')', false, p.batter.name + ' for ' + h.team);
      for (const n of p.scored)
        if (!own[n]) check('a runner who scores batted in this half (game ' + g + ')',
          false, n + ' for ' + h.team);
    }

    let outs = 0, runs = 0, hs = 0;
    for (const p of h.plays) {
      check('outs never run backwards (game ' + g + ')', p.outs >= p.outsBefore);
      outs = p.outs;
      runs += p.rbi;
      if (p.hit) hs++;
    }
    check('a half inning is worth what it says (game ' + g + ' ' + h.half + h.inning + ')',
      runs === h.runs, runs + ' vs ' + h.runs);
    check('hits counted (game ' + g + ')', hs === h.hits);
    check('three outs, or the game ended on the play (game ' + g + ' ' + h.half + h.inning + ')',
      outs === 3 || (h.walkoff && h.inning === 9));
    check('no inning runs past three outs (game ' + g + ')', outs <= 3);
    check('every play says something (game ' + g + ')',
      h.plays.every(p => typeof p.text === 'string' && p.text.length > 4));

    pa += h.plays.length;
    gamePa += h.plays.length;
    if (h.plays.length > maxPaHalf) maxPaHalf = h.plays.length;
    hits += h.hits;
    const lastPlay = h.plays[h.plays.length - 1];
    if (lastPlay) stranded += lastPlay.bases.filter(Boolean).length;
  }
  if (gamePa > longestGame) longestGame = gamePa;
}

console.log('  ' + (fails ? fails + ' faithfulness failures' : 'faithful: every line score is the score it was handed') + '\n');

// ─── shape: does it look like baseball? ──────────────────────────────────────

console.log('SHAPE\n');
band('plate appearances per game', pa / N, 66, 82, v => v.toFixed(1));
band('hits per game (both clubs)', hits / N, 12, 22, v => v.toFixed(1));
band('scoreless half innings', 100 * scoreless / halves, 50, 72, v => v.toFixed(1) + '%');
band('runners stranded per half inning', stranded / halves, 0.3, 1.1, v => v.toFixed(2));
band('most batters in one half inning', maxPaHalf, 8, 24, v => String(v));
band('most plate appearances in one game', longestGame, 80, 150, v => String(v));

const woPct = 100 * walkoffs / N;
console.log('  ' + 'walk-off finishes'.padEnd(38) + (woPct.toFixed(1) + '%').padStart(8));
console.log('  ' + 'ninths the home club skipped'.padEnd(38) +
  ((100 * unplayedNinths / N).toFixed(1) + '%').padStart(8));

console.log('\nRUNS PER HALF INNING\n');
const keys = Object.keys(runDist).map(Number).sort((a, b) => a - b);
for (const k of keys.slice(0, 8)) {
  const pct = 100 * runDist[k] / halves;
  console.log('  ' + String(k).padStart(2) + '  ' + (pct.toFixed(1) + '%').padStart(7) + '  ' +
    '█'.repeat(Math.round(pct / 1.5)));
}

// ─── determinism ─────────────────────────────────────────────────────────────

console.log('\nDETERMINISM\n');
function scriptFor(seed) {
  const rng = E.createSeededRNG(E.hashSeed(seed));
  return E.simGameScript({
    yourRuns: 6, oppRuns: 4, won: true, youHome: true,
    yourName: 'You', oppName: 'Them',
    yourLineup: lineup, oppLineup: other, yourStaff: staff, oppStaff: staff, rng,
  });
}
const one = JSON.stringify(scriptFor('replay-me'));
const two = JSON.stringify(scriptFor('replay-me'));
const same = check('the same seed replays the same game', one === two);
const diff = check('a different seed plays a different game',
  one !== JSON.stringify(scriptFor('replay-me-too')));
if (same && diff) console.log('   ok  same seed, same game; different seed, different game');

// ─── against real brackets and real opponents ────────────────────────────────

/*
 * The checks above prove the engine keeps its word. This one proves the wiring:
 * a real drafted roster, a real bracket out of finalizeSeason(), and the actual
 * all-time club it drew in each round batting its own nine. It is the join
 * between players.json and the opponent pool, which is exactly the kind of thing
 * that fails silently and leaves nine nameless hitters on the screen.
 */
console.log('REAL BRACKETS\n');

const R = require('./run.js');
const players = require('./data/players.json');
const DATA = R.indexData(players);

let brackets = 0, games = 0, namedOpponents = 0, namedLineups = 0, gameFails = 0, realBats = 0;
for (let a = 0; a < 400 && brackets < 25; a++) {
  const run = R.createRun({ seed: 9000 + a });
  let ok = true, guard = 0;
  while (run.phase === 'draft' && guard++ < 120) {
    let d;
    try { d = R.spin(run, DATA); } catch (_) { ok = false; break; }
    if (!d.options.length) { try { R.respin(run, DATA); } catch (_) { ok = false; break; } continue; }
    try { R.sign(run, DATA.allPlayers[d.options[0]]); } catch (_) { ok = false; break; }
  }
  if (!ok || run.phase !== 'season') continue;
  const o = R.playSeason(run);
  if (!o.madePlayoffs) continue;
  brackets++;

  run.playoffs.rounds.forEach((round, ri) => {
    const homes = E.homeGames(round.bestOf || 7, !!round.homeField);
    const tagged = run.roster.map((p, k) => ({ ...p, _slot: E.SLOTS[run.slotIndex[k]] }));
    const oppRoster = (round.oppTeam && round.oppSeason)
      ? DATA.byTeamSeason[E.teamSeasonId(round.oppTeam, round.oppSeason)] : null;
    const oppLineup = E.lineupFromTeamSeason(oppRoster);
    if (round.oppName) namedOpponents++;
    if (oppLineup) {
      namedLineups++;
      realBats += oppLineup.filter(p => !p.generic).length;
    }

    round.games.forEach((g, gi) => {
      games++;
      const rng = E.createSeededRNG(E.hashSeed(String(run.seed) + '|po|' + ri + '|' + gi));
      const s = E.simGameScript({
        yourRuns: g.yourRuns, oppRuns: g.oppRuns, won: g.won, youHome: !!homes[gi],
        yourName: 'YOU', oppName: round.oppName || 'The field',
        yourLineup: E.lineupFromRoster(tagged),
        oppLineup: oppLineup || E.lineupFromRoster([]),
        yourStaff: E.staffFromRoster(tagged, gi),
        oppStaff: E.staffFromTeamSeason(oppRoster, gi),
        rng,
      });
      if (s.final.yourRuns !== g.yourRuns || s.final.oppRuns !== g.oppRuns) {
        gameFails++;
        console.log('  FAIL  bracket game ' + ri + '/' + gi + ' played ' +
          s.final.yourRuns + '-' + s.final.oppRuns + ' for a ' + g.yourRuns + '-' + g.oppRuns);
      }
      const nine = s.away.lineup.concat(s.home.lineup);
      if (nine.length !== 18) { gameFails++; console.log('  FAIL  eighteen batters expected'); }
      /* The same check the synthetic games get, but against a REAL opponent roster,
       * which is the only place the two orders could ever be handed the same club. */
      for (const h of s.halves) {
        const own = {};
        for (const b of (h.half === 'top' ? s.away.lineup : s.home.lineup)) own[b.name] = 1;
        for (const p of h.plays) {
          if (!own[p.batter.name]) {
            gameFails++;
            console.log('  FAIL  ' + p.batter.name + ' bats for ' + h.team +
              ' (bracket game ' + ri + '/' + gi + ')');
          }
        }
      }
    });
  });
}
fails += gameFails;
console.log('  ' + (gameFails ? gameFails + ' failures' : 'ok') + '   ' + brackets +
  ' brackets, ' + games + ' games, every line score faithful');
console.log('  ' + 'rounds with a named opponent'.padEnd(38) + String(namedOpponents).padStart(8));
console.log('  ' + 'of those batting their own roster'.padEnd(38) + String(namedLineups).padStart(8));
console.log('  ' + 'real names in an opponent order'.padEnd(38) +
  (namedLineups ? (realBats / namedLineups).toFixed(1) : '0').padStart(8) + '  of 9');
check('every named opponent bats its own roster', namedLineups === namedOpponents);
band('real names in an opponent order', namedLineups ? realBats / namedLineups : 0, 7, 9,
  v => v.toFixed(1));

/* One game printed in full, because a check that never shows its work is a check
 * nobody reads. */
{
  const rng = E.createSeededRNG(E.hashSeed('showcase'));
  const nyy = DATA.byTeamSeason[E.teamSeasonId('NYY', 1927)];
  const s = E.simGameScript({
    yourRuns: 4, oppRuns: 3, won: true, youHome: true,
    yourName: 'YOU', oppName: '1927 NYY',
    yourLineup: lineup, oppLineup: E.lineupFromTeamSeason(nyy) || other,
    yourStaff: staff, oppStaff: E.staffFromTeamSeason(nyy, 0), rng,
  });
  console.log('\nA GAME, IN FULL\n');
  for (const h of s.halves) {
    console.log('  ' + (h.half === 'top' ? 'Top ' : 'Bot ') + h.inning + '  ' + h.team +
      '  (' + h.runs + ' run' + (h.runs === 1 ? '' : 's') + ')');
    for (const p of h.plays) console.log('      ' + p.text +
      (p.code !== 'HR' && p.scored.length ? '  ' + p.scored.join(', ') + ' scores.' : ''));
  }
  console.log('\n  FINAL  ' + s.away.name + ' ' + s.final.away + ', ' +
    s.home.name + ' ' + s.final.home + (s.walkoff ? '  (walk-off)' : ''));
}

console.log('\n' + (fails ? fails + ' FAILURES' : 'All checks passed.') + '\n');
process.exit(fails ? 1 : 0);
