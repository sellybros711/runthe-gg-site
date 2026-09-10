/* Are the numbers in the trivia games true?
 *
 * Rank It and High Low state career totals as fact, and the Number Game states
 * jersey numbers. A wrong number in a trivia game is the credibility killer:
 * the player who knows the real one concludes the GAME is wrong, and they are
 * right. So a fixed panel of famous, retired, settled facts is asserted here
 * against the shipped data files.
 *
 * This exists because the audit that produced it found the OPPOSITE failure:
 * nothing wrong, but Brady, Brees, Fitzgerald, Pujols and the rest of the
 * 2021-2023 retirement class absent from stats.js entirely, because the file
 * predates their retirements. The panel pins them in so a regeneration or an
 * over-eager cleanup cannot silently drop them again.
 *
 * Retired players only: an active player's total is stale the week after it is
 * written, which is why stats.js excludes them by policy.
 *
 * Run: node scripts/check-facts.mjs      (no network)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const box = { console };
box.self = box; box.window = box; box.globalThis = box;
createContext(box);
runInContext(readFileSync('arcade/stats.js', 'utf8'), box);
runInContext(readFileSync('arcade/jerseys.js', 'utf8'), box);
const S = box.RTG_STATS, J = box.RTG_JERSEYS.stints;

let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };

/* ---- career totals, settled and famous ---------------------------------- */
const TOTALS = [
  ['nba_points', 'nba_kareem-abdul-jabbar', 38387], ['nba_points', 'nba_karl-malone', 36928],
  ['nba_points', 'nba_kobe-bryant', 33643], ['nba_points', 'nba_michael-jordan', 32292],
  ['nba_points', 'nba_dirk-nowitzki', 31560], ['nba_points', 'nba_wilt-chamberlain', 31419],
  ['nba_points', 'nba_carmelo-anthony', 28289],
  ['nba_rebounds', 'nba_wilt-chamberlain', 23924], ['nba_rebounds', 'nba_bill-russell', 21620],
  ['nba_assists', 'nba_john-stockton', 15806], ['nba_assists', 'nba_jason-kidd', 12091],
  ['nfl_passyds', 'nfl_tom-brady', 89214], ['nfl_passyds', 'nfl_drew-brees', 80358],
  ['nfl_passyds', 'nfl_peyton-manning', 71940], ['nfl_passyds', 'nfl_brett-favre', 71838],
  ['nfl_passtd', 'nfl_tom-brady', 649], ['nfl_passtd', 'nfl_drew-brees', 571],
  ['nfl_passtd', 'nfl_peyton-manning', 539],
  ['nfl_rushyds', 'nfl_emmitt-smith', 18355], ['nfl_rushyds', 'nfl_walter-payton', 16726],
  ['nfl_rushyds', 'nfl_frank-gore', 16000], ['nfl_rushyds', 'nfl_barry-sanders', 15269],
  ['nfl_recyds', 'nfl_jerry-rice', 22895], ['nfl_recyds', 'nfl_larry-fitzgerald', 17492],
  ['nfl_receptions', 'nfl_jerry-rice', 1549], ['nfl_receptions', 'nfl_larry-fitzgerald', 1432],
  ['nfl_sacks', 'nfl_bruce-smith', 200], ['nfl_sacks', 'nfl_reggie-white', 198],
  ['mlb_hr', 'mlb_barry-bonds', 762], ['mlb_hr', 'mlb_hank-aaron', 755],
  ['mlb_hr', 'mlb_babe-ruth', 714], ['mlb_hr', 'mlb_albert-pujols', 703],
  ['mlb_hits', 'mlb_pete-rose', 4256], ['mlb_hits', 'mlb_hank-aaron', 3771],
  ['mlb_hits', 'mlb_albert-pujols', 3384],
  ['mlb_sb', 'mlb_rickey-henderson', 1406],
  ['mlb_strikeouts', 'mlb_nolan-ryan', 5714],
  ['mlb_saves', 'mlb_mariano-rivera', 652], ['mlb_saves', 'mlb_trevor-hoffman', 601],
];
console.log('1) famous career totals match the record');
for (const [cat, id, want] of TOTALS) {
  const got = S[cat] && S[cat].vals[id];
  if (got !== want) fail(cat + ' ' + id + ': file says ' + got + ', the record says ' + want);
}
if (!bad) console.log('  ok, ' + TOTALS.length + ' totals');

/* ---- jersey numbers everyone knows --------------------------------------- */
const before = bad;
const SHIRTS = [
  ['Michael Jordan', 'Bulls', 23], ['Michael Jordan', 'Bulls', 45],
  ['Tom Brady', 'Patriots', 12], ['Tom Brady', 'Buccaneers', 12],
  ['Derek Jeter', 'Yankees', 2], ['Ken Griffey Jr.', 'Mariners', 24],
  ['Aaron Rodgers', 'Packers', 12], ['LeBron James', 'Cavaliers', 23],
  ['Mariano Rivera', 'Yankees', 42], ['Jerry Rice', '49ers', 80],
  ['Cal Ripken Jr.', 'Orioles', 8], ['Kobe Bryant', 'Lakers', 8],
  ['Kobe Bryant', 'Lakers', 24], ['Peyton Manning', 'Colts', 18],
  ['Peyton Manning', 'Broncos', 18], ["Shaquille O'Neal", 'Lakers', 34],
];
console.log('\n2) jersey numbers everyone knows are on file');
for (const [name, team, num] of SHIRTS) {
  const rows = J.filter((s) => s.name === name && s.team.includes(team));
  if (!rows.length) { fail('no stints at all for ' + name + ' @ ' + team); continue; }
  if (!rows.some((s) => s.num === num)) {
    fail(name + ' @ ' + team + ': file has [' + rows.map((s) => s.num).join(',') + '], the record includes ' + num);
  }
}
if (bad === before) console.log('  ok, ' + SHIRTS.length + ' shirts');

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\nfacts ok');
