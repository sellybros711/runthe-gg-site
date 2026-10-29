/* THE REAL COLLEGE SCHEDULE, FOR THE COLLEGE GAME DAY BADGES.
 *
 *   node cfb/build/cfb-schedule.mjs            build cfb/data/cfb_schedule.json
 *   node cfb/build/cfb-schedule.mjs --why      say what it found, write nothing
 *
 * The Saturday half of football/build/nfl-schedule.mjs, read its header first: a season's
 * created_at says WHEN it was filed, and this file says which real games were on then.
 *
 * THE SOURCE IS sportsdataverse's cfbfastR-data, one CSV a season, on raw.githubusercontent,
 * which is the one outside host the development sandbox can reach, so this can be run and
 * checked here as well as on a runner. It is refreshed through the season with kickoffs,
 * final scores and the bowls once they are set.
 *
 * ONLY GAMES THIS GAME'S SCHOOLS PLAY. A badge asks whether a man on your roster was playing,
 * and every man on a roster comes from one of the schools in cfb_player_seasons.json, so a
 * Division III game can never answer anything and is left out. The names match the source
 * exactly for all of them, and the build refuses to write if one stops matching.
 *
 * A KICKOFF TIME THAT IS NOT SET YET IS NOT A KICKOFF. Most games later in the season are
 * listed with start_time_tbd until a network picks them, and their start_date is a
 * placeholder, so they are left out until the time is real. The workflow rebuilds this
 * twice a day, so a game appears the day its time is announced.
 *
 * WHAT A GAME CARRIES:
 *   id    the source's game id
 *   k     kickoff, a UTC instant
 *   s w   season, and the week as R1..R16 for the regular season or P1 for the postseason
 *   a h   away and home school, spelled as the game spells them
 *   tags  worked out here in Eastern time:
 *           conf       a conference game
 *           neutral    a regular season game on a neutral site
 *           noon night a Saturday kickoff at noon or earlier, or at 7pm or later
 *           weeknight  a kickoff Monday to Friday
 *           rivalry    Thanksgiving week, Thursday to Saturday
 *           ccg        a conference championship game
 *           bowl cfp natty   a bowl, a College Football Playoff game, the title game
 *   fav   the school with the higher pregame Elo, or null where either is missing
 *   sc    [away, home] once the game is final, else null
 *
 * NO CLOCK IN THE OUTPUT, for the NFL file's reason: the workflow commits only when it moved.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data');
const OUT = path.join(DATA, 'cfb_schedule.json');
export const FIRST_SEASON = 2025;
const URL_OF = (y) => `https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/schedules/csv/cfb_schedules_${y}.csv`;

/* A CSV reader that knows a quoted field can hold a comma: a bowl's name can. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] == null ? '' : r[i]])));
}

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
function eastern(iso) {
  const p = Object.fromEntries(ET.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { wd: p.weekday, hour: Number(p.hour), y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
/* Thanksgiving week's games: the fourth Thursday of November and the two days after it. */
function thanksgivingWeek(e) {
  if (e.m !== 11) return false;
  const first = new Date(Date.UTC(e.y, 10, 1)).getUTCDay();
  const thu = 1 + ((4 - first + 7) % 7) + 21;
  return e.d >= thu && e.d <= thu + 2;
}
const val = (v) => (v == null || v === '' || v === 'NA' ? null : v);
const num = (v) => (val(v) == null ? null : Number(v));

export function buildSchedule(csvRows, schools) {
  const games = [];
  for (const g of csvRows) {
    const season = num(g.season);
    if (!season || season < FIRST_SEASON) continue;
    if (!schools.has(g.home_team) && !schools.has(g.away_team)) continue;
    if (String(g.start_time_tbd).toUpperCase() === 'TRUE') continue;
    const k = val(g.start_date);
    if (!k || isNaN(Date.parse(k))) continue;
    const e = eastern(k);
    const post = g.season_type === 'postseason';
    const notes = val(g.notes) || '';
    const tags = [];
    if (String(g.conference_game).toUpperCase() === 'TRUE') tags.push('conf');
    if (!post && String(g.neutral_site).toUpperCase() === 'TRUE') tags.push('neutral');
    if (e.wd === 'Sat' && e.hour <= 12) tags.push('noon');
    if (e.wd === 'Sat' && e.hour >= 19) tags.push('night');
    if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(e.wd) >= 0) tags.push('weeknight');
    if (!post && thanksgivingWeek(e)) tags.push('rivalry');
    if (!post && /Championship/.test(notes) && !/National/.test(notes)) tags.push('ccg');
    if (post && /College Football Playoff/.test(notes)) tags.push('cfp');
    if (post && /National Championship/.test(notes)) tags.push('natty');
    if (post && tags.indexOf('cfp') < 0) tags.push('bowl');
    const ea = num(g.away_pregame_elo), eh = num(g.home_pregame_elo);
    const fav = ea == null || eh == null || ea === eh ? null : (ea > eh ? g.away_team : g.home_team);
    const ap = num(g.away_points), hp = num(g.home_points);
    const done = String(g.completed).toUpperCase() === 'TRUE' && ap != null && hp != null;
    games.push({ id: String(g.game_id), k: new Date(k).toISOString(), s: season,
      w: (post ? 'P' : 'R') + num(g.week), a: g.away_team, h: g.home_team, tags, fav,
      sc: done ? [ap, hp] : null });
  }
  games.sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : x.id < y.id ? -1 : 1));
  return { first: FIRST_SEASON, games };
}

export function gameSchools() {
  const players = JSON.parse(fs.readFileSync(path.join(DATA, 'cfb_player_seasons.json'), 'utf8'));
  return new Set(players.map((p) => p.school).filter(Boolean));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const why = process.argv.includes('--why');
  const schools = gameSchools();
  const rows = [];
  const thisYear = new Date().getUTCFullYear();
  for (let y = FIRST_SEASON; y <= thisYear; y++) {
    const res = await fetch(URL_OF(y), { redirect: 'follow' });
    /* Next year's file does not exist until its schedule is out, which is not an error. */
    if (res.status === 404 && y > FIRST_SEASON) { console.log(y + ': no file yet'); continue; }
    if (!res.ok) throw new Error(`fetch ${y}: HTTP ${res.status}`);
    const got = parseCSV(await res.text());
    console.log(`${y}: ${got.length} games in the source`);
    rows.push(...got);
  }
  const out = buildSchedule(rows, schools);
  const seen = new Set(out.games.flatMap((g) => [g.a, g.h]));
  const missing = [...schools].filter((s) => !seen.has(s));
  console.log(`${out.games.length} games the game's schools play, ${out.games.filter((g) => g.sc).length} final`);
  /* A school with no games is a name that stopped matching, and every badge about that
     school would go dark with nothing anywhere saying why. */
  if (missing.length) { console.error('no games for: ' + missing.join(', ')); process.exit(1); }
  if (!why) {
    fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
    console.log('wrote ' + path.relative(process.cwd(), OUT));
  }
}
