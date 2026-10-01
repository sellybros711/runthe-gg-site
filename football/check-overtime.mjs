/*
 * check-overtime.mjs - a live game tied at the end of regulation goes to overtime.
 *
 *   node football/check-overtime.mjs
 *
 * Reported by a player: a 19-0 Full Team season went to the Super Bowl, the last extra point
 * TIED it 24-24, and the screen said YOU LOSE. bossSimAdvance ended every game at the 60
 * minute mark and handed a tie to whichever side the pregame projection liked, so the weaker
 * side on paper lost every tie it ever reached and nothing on screen said why.
 *
 * This drives the real engine (the sim the boss battle and the Full Team playoff games both
 * run on) and asks the rules of overtime as properties rather than as one game:
 *
 *   a tie at the end of regulation starts overtime and does not end the game
 *   no game ever ends level
 *   both sides get the ball in overtime before it can end
 *   after that the next score wins, and a winning touchdown takes no extra point
 *   the side the projection DISLIKES can win a tie, which the old rule never allowed
 *   a side behind in overtime never punts, player or coach
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(here, 'engine.js'));

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
  if (!pass) bad++;
};

/* A sim in the shape bossSimCreate and fullSimCreate both hand back. The two expectations are
   the only thing the old tiebreak read, so they are set far apart on purpose. */
const simOf = (over = {}) => Object.assign({
  you: 0, them: 0, youExp: 10, themExp: 30, muYou: 4.4, muThem: 4.4,
  read: null, readRight: false, readTrap: false,
  clock: 0, drives: [], pos: null, cur: null, pending: null, over: false, won: null,
  firstReceiver: null,
}, over);

/* Play a sim to the whistle, answering every call the way `pick` says. */
function play(sim, rng, pick) {
  let ev = E.bossSimAdvance(sim, rng);
  for (let guard = 0; guard < 5000; guard++) {
    if (ev.type === 'over') return ev;
    if (ev.type === 'decision') {
      let res = E.bossSimResolve(sim, pick(ev.decision, rng), rng);
      /* A fourth down that goes to the house can hand back a two point try: answer it. */
      while (res && res.end && res.end.type === 'decision') {
        res = E.bossSimResolve(sim, pick(res.end.decision, rng), rng);
      }
    }
    ev = E.bossSimAdvance(sim, rng);
  }
  throw new Error('a game did not end');
}
const anyCall = (d, rng) => d.kind === 'two' ? (rng() < 0.5 ? 'two' : 'kick')
  : ['go', d.inFgRange ? 'fg' : 'punt'][rng() < 0.5 ? 0 : 1];

console.log('A TIE AT THE END OF REGULATION');
{
  const sim = simOf({ you: 24, them: 24, clock: 3600, pos: 'you' });
  const ev = E.bossSimAdvance(sim, E.createSeededRNG(E.hashSeed('ot-start')));
  ok('does not end the game', ev.type !== 'over' && !sim.over, ev.type);
  ok('starts overtime', !!sim.ot);
  ok('the clock names overtime', E.bossClock({ clock: 3700 }).quarter === 5,
    'quarter ' + E.bossClock({ clock: 3700 }).quarter);
}
{
  /* The reported game: tied, and the projection on the other side. The old rule lost every
     one of these; overtime has to be winnable by either side. */
  let youWon = 0, themWon = 0;
  for (let i = 0; i < 600; i++) {
    const sim = simOf({ you: 24, them: 24, clock: 3600, pos: 'them' });
    const ev = play(sim, E.createSeededRNG(E.hashSeed('ot-tie|' + i)), anyCall);
    if (ev.won) youWon++; else themWon++;
  }
  ok('the side the projection dislikes can win it', youWon > 60, youWon + ' of 600');
  ok('  and so can the other side', themWon > 60, themWon + ' of 600');
}
{
  const sim = simOf({ you: 24, them: 20, clock: 3600, pos: 'you' });
  const ev = E.bossSimAdvance(sim, E.createSeededRNG(E.hashSeed('ot-none')));
  ok('a game not level at the end of regulation ends there', ev.type === 'over' && ev.won && !sim.ot);
}

console.log('\nWHOLE GAMES, ANSWERED EVERY WAY');
let games = 0, ots = 0, level = 0, oneTouch = 0, sudden = 0, suddenTdMargin = 0, wrongWinner = 0;
for (let i = 0; i < 20000; i++) {
  const rng = E.createSeededRNG(E.hashSeed('ot-sweep|' + i));
  const mu = 3.2 + (i % 7) * 0.4;
  const sim = simOf({ muYou: mu, muThem: 3.2 + ((i * 3) % 7) * 0.4 });
  const ev = play(sim, rng, anyCall);
  games++;
  if (sim.you === sim.them) level++;
  if (ev.won !== (sim.you > sim.them)) wrongWinner++;
  if (!sim.ot) continue;
  ots++;
  const otDrives = sim.drives.filter((d) => d.tStart >= 3600);
  if (otDrives.length < 2) oneTouch++;
  const last = otDrives[otDrives.length - 1];
  if (otDrives.length >= 3 && last && last.result === 'td') {
    sudden++;
    if (Math.abs(sim.you - sim.them) !== 6) suddenTdMargin++;
  }
}
ok(games + ' games reach overtime sometimes', ots > 100, ots + ' went to overtime');
ok('no game ever ends level', level === 0, level + ' ended level');
ok('the side with more points is always the winner', wrongWinner === 0, wrongWinner + ' disagree');
ok('overtime never ends before both sides have had the ball', oneTouch === 0, oneTouch + ' ended early');
ok('a sudden death touchdown wins by six, with no extra point', sudden > 0 && suddenTdMargin === 0,
  sudden + ' sudden death touchdowns, ' + suddenTdMargin + ' with a kick after');

console.log('\nBEHIND IN OVERTIME, NOBODY PUNTS');
const otFourth = { kind: 'fourth', ot: true, quarter: 5, secs: 600, down: 4 };
for (const plan of [{ fourth: -1 }, { fourth: 0 }, { fourth: 1 }]) {
  const deep = E.fullCoachCall({ ...otFourth, you: 24, them: 27, toGo: 9, inFgRange: false }, plan);
  const three = E.fullCoachCall({ ...otFourth, you: 24, them: 27, toGo: 9, inFgRange: true }, plan);
  const seven = E.fullCoachCall({ ...otFourth, you: 24, them: 31, toGo: 9, inFgRange: true }, plan);
  ok('coach with fourth ' + plan.fourth + ': goes when out of range, kicks to tie, goes down seven',
    deep === 'go' && three === 'fg' && seven === 'go', deep + ' / ' + three + ' / ' + seven);
}
{
  /* The player is asked every fourth down behind in overtime, wherever the ball is. */
  const sim = simOf({ you: 24, them: 27, clock: 3900, ot: { poss: 2, receiver: 'them' },
    cur: { team: 'you', y: 20, down: 4, toGo: 9, startAbs: 20, tStart: 3800, plays: 3 } });
  const ev = E.bossSimAdvance(sim, () => 0.99);
  ok('the player is asked on fourth down at his own 20', ev.type === 'decision'
    && ev.decision.kind === 'fourth' && ev.decision.ot === true, ev.type);
}

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
