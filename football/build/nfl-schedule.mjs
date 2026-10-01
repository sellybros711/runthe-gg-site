/* THE REAL NFL SCHEDULE, FOR THE GAME DAY BADGES.
 *
 *   node football/build/nfl-schedule.mjs            build football/data/nfl_schedule.json
 *   node football/build/nfl-schedule.mjs --why      say what it found, write nothing
 *
 * The Game Day shelf in achievements.js asks whether a real NFL game was being played at the
 * moment a season was filed, and whether a club on the roster was in it. The moment is the
 * row's created_at, which the SERVER writes, so a phone clock cannot fake it. This file is
 * the other half: every game's kickoff, who played, and the few facts a badge asks about.
 *
 * WHY A FILE AND NOT A TABLE. It needs no migration, it is RETROACTIVE (a season filed on a
 * Sunday before this shipped is judged against the same kickoffs), and it cannot drift from
 * the badges, which read it in the browser the same way they read everything else.
 *
 * NO CLOCK IN THE OUTPUT. The workflow commits only when the bytes move, and a build time in
 * the file would move them on every run: that is the injury file's lesson, where a `built`
 * field nothing read made a job commit twice a day for ever.
 *
 * WHAT A GAME CARRIES:
 *   id    nflverse's game_id
 *   k     kickoff, as a UTC instant (the schedule is Eastern wall clock; easternInstant turns
 *         it into an instant across the November clock change)
 *   s w   season and week
 *   a h   away and home, in THIS site's club codes (nflverse's LA is our LAR)
 *   t     REG, WC, DIV, CON or SB
 *   tags  the facts a badge reads, worked out here in Eastern time so the page never has to
 *         know what a time zone is:
 *           div      a division game
 *           intl     played abroad (a neutral site in the regular season)
 *           tnf snf mnf   a night kickoff on a Thursday, Sunday or Monday
 *           early late    the Sunday 1pm and 4pm windows
 *           thanks xmas   Thanksgiving Day and Christmas Day
 *           post sb       the playoffs, and the Super Bowl
 *   fav   the closing favourite, or null for a pick'em or a game with no line
 *   sc    [away, home] once the game is final, else null
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cachedCSV, parseCSVObjects, GAMES_URL } from './lib.mjs';
import { easternInstant } from './weekly-pool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data', 'nfl_schedule.json');

/* The first season a board row can have been filed in. Earlier seasons have no rows to judge,
   so shipping their games would be bytes every visitor downloads for nothing. */
export const FIRST_SEASON = 2025;
const CODE = { LA: 'LAR', STL: 'LAR', OAK: 'LV', SD: 'LAC', WSH: 'WAS' };
const code = (c) => CODE[c] || c;
const num = (v) => (v == null || v === '' ? null : Number(v));

/* The fourth Thursday of November, off the date alone. */
function isThanksgiving(day) {
  const [y, m, d] = day.split('-').map(Number);
  if (m !== 11) return false;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 4 && d >= 22 && d <= 28;
}

export function buildSchedule(rows) {
  const games = [];
  for (const g of rows) {
    const season = num(g.season);
    if (!season || season < FIRST_SEASON) continue;
    if (!g.away_team || !g.home_team || !g.gameday || !g.gametime) continue;
    const k = easternInstant(g.gameday, g.gametime);
    if (!k) continue;
    const t = g.game_type || 'REG';
    const hour = Number(String(g.gametime).split(':')[0]);
    const wd = String(g.weekday || '');
    const tags = [];
    if (String(g.div_game) === '1') tags.push('div');
    if (t === 'REG' && g.location === 'Neutral') tags.push('intl');
    if (hour >= 19 && wd === 'Thursday') tags.push('tnf');
    if (hour >= 19 && wd === 'Sunday') tags.push('snf');
    if (hour >= 19 && wd === 'Monday') tags.push('mnf');
    if (t === 'REG' && wd === 'Sunday' && hour === 13) tags.push('early');
    if (t === 'REG' && wd === 'Sunday' && hour === 16) tags.push('late');
    if (isThanksgiving(g.gameday)) tags.push('thanks');
    if (g.gameday.slice(5) === '12-25') tags.push('xmas');
    if (t !== 'REG') tags.push('post');
    if (t === 'SB') tags.push('sb');
    /* nflverse's spread_line is positive when the HOME side is favoured. */
    const sp = num(g.spread_line);
    const fav = sp == null || sp === 0 ? null : code(sp > 0 ? g.home_team : g.away_team);
    const as = num(g.away_score), hs = num(g.home_score);
    games.push({ id: g.game_id, k, s: season, w: num(g.week), a: code(g.away_team),
      h: code(g.home_team), t, tags, fav, sc: as == null || hs == null ? null : [as, hs] });
  }
  games.sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : x.id < y.id ? -1 : 1));
  return { first: FIRST_SEASON, games };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const why = process.argv.includes('--why');
  /* Fresh every time: the schedule is flexed through the season and playoff games only appear
     once the bracket is set, so a cached copy is the wrong week's schedule. */
  const text = await cachedCSV(GAMES_URL, 'games.csv', { maxAgeMs: 0 });
  const out = buildSchedule(parseCSVObjects(text));
  const bySeason = {};
  for (const g of out.games) bySeason[g.s] = (bySeason[g.s] || 0) + 1;
  const clubs = new Set(out.games.flatMap((g) => [g.a, g.h]));
  console.log(`${out.games.length} games ${JSON.stringify(bySeason)}, ${clubs.size} clubs, `
    + `${out.games.filter((g) => g.sc).length} final`);
  /* Thirty-two clubs or the file is wrong, and a badge reading it would quietly miss a club. */
  if (clubs.size !== 32) { console.error('expected 32 clubs, found ' + [...clubs].sort().join(' ')); process.exit(1); }
  if (!why) {
    fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
    console.log('wrote ' + path.relative(process.cwd(), OUT));
  }
}
