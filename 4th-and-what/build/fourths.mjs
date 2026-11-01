#!/usr/bin/env node
/* The daily's plays: every crucial 4th down go-for-it in the NFL since 1999.
 *
 *   node 4th-and-what/build/fourths.mjs [cache dir] [--from 1999] [--to 2025]
 *
 * Reads nflverse play-by-play (github.com/nflverse/nflverse-data, the pbp
 * release, CC-BY 4.0; The Perfect Season already credits it), one season a
 * file, cached in the given directory. Keeps a 4th down a team went for:
 *   a run or a pass, no penalty, no kneel or spike, not aborted, not a two
 *   point try;
 *   crucial: the 4th quarter or overtime with the game within one score
 *   (8 points either way), or any playoff 4th down in the second half within
 *   one score.
 * Ranks them by how much the play swung the game (nflverse's win probability
 * added, either way), times 1.5 for a playoff game and 2 for a Super Bowl,
 * and writes the top ones, at most two from one game, to
 * 4th-and-what/data/fourths.json.
 *
 * Every fact on a daily card (the teams, the date, the score, the clock, the
 * spot, what really happened) is a field of that row. Nothing is typed by
 * hand. Re-run it after a season and bump fourths.json's ?v= in the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const CACHE = args[0] && !args[0].startsWith('--') ? args[0] : '/tmp/nflverse-pbp';
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const FROM = arg('--from', 1999), TO = arg('--to', 2025), KEEP = arg('--keep', 600);
fs.mkdirSync(CACHE, { recursive: true });

function parseCSV(text, onRow) {
  let i = 0, field = '', row = [], q = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; onRow(row); row = []; i++; continue;
    }
    field += c; i++;
  }
  if (field || row.length) { row.push(field); onRow(row); }
}

function season(y) {
  const f = path.join(CACHE, 'play_by_play_' + y + '.csv.gz');
  if (!fs.existsSync(f)) {
    execFileSync('curl', ['-sSL', '--retry', '4', '-o', f, 'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_' + y + '.csv.gz']);
  }
  return zlib.gunzipSync(fs.readFileSync(f)).toString('utf8');
}

/* the conference title games' week: the last two playoff weeks (17 game
   seasons from 2021 add a week). Week numbers in nflverse run on from the
   regular season: 1999 to 2020 regular seasons are 17 weeks, then 18. */
const champWeek = (y) => (y >= 2021 ? 18 : 17) + 3;
const rows = [];
for (let y = FROM; y <= TO; y++) {
  let head = null, ix = {}, n = 0, postWeeks = [];
  const keep = [];
  parseCSV(season(y), (r) => {
    if (!head) { head = r; head.forEach((h, k) => { ix[h] = k; }); return; }
    const g = (k) => r[ix[k]];
    if (g('season_type') === 'POST') postWeeks.push(+g('week'));
    if (g('down') !== '4') return;
    const pt = g('play_type');
    if (pt !== 'pass' && pt !== 'run') return;
    if (g('penalty') === '1' || g('qb_kneel') === '1' || g('qb_spike') === '1' || g('play_deleted') === '1' || g('aborted_play') === '1' || g('two_point_attempt') === '1') return;
    const qtr = +g('qtr'), sd = +g('score_differential'), post = g('season_type') === 'POST';
    /* a Super Bowl or a conference title game: any 4th down they went for */
    const big = post && +g('week') >= champWeek(y);
    if (!big) {
      if (!isFinite(sd) || Math.abs(sd) > 8) return;
      if (!(qtr >= 4 || (post && qtr >= 3))) return;
    }
    /* the last seconds of the first half, outside the 10: a heave, not a 4th down call */
    if (qtr === 2 && +g('quarter_seconds_remaining') < 15 && +g('yardline_100') > 10) return;
    const wpa = +g('wpa'), wp = +g('wp');
    if (!isFinite(wpa)) return;
    /* a play a flag or a review undid reads one way and counts another: leave it out */
    const dsc = g('desc');
    if (/PENALTY|REVERSED|NULLIFIED|No Play|overturned/i.test(dsc)) return;
    const cv = g('fourth_down_converted') === '1' || g('touchdown') === '1';
    if ((cv && wpa < -0.02) || (!cv && wpa > 0.02)) return;
    n++;
    keep.push({
      id: g('game_id') + '-' + g('play_id'), game: g('game_id'), season: +g('season'), week: +g('week'), type: g('season_type'), date: g('game_date'),
      off: g('posteam'), def: g('defteam'), home: g('home_team'), away: g('away_team'),
      offScore: +g('posteam_score'), defScore: +g('defteam_score'), qtr, clock: g('time'), left: +g('game_seconds_remaining'),
      ballOn: +g('yardline_100'), togo: +g('ydstogo'), goal: g('goal_to_go') === '1', side: g('side_of_field'),
      kind: pt, desc: g('desc').replace(/\s+/g, ' ').trim(),
      conv: g('fourth_down_converted') === '1' || g('touchdown') === '1', td: g('touchdown') === '1', yards: +g('yards_gained'),
      big, wp: Math.round(wp * 1000) / 1000, wpa: Math.round(wpa * 1000) / 1000, stadium: g('stadium') || ''
    });
  });
  const sbWeek = postWeeks.length ? Math.max.apply(null, postWeeks) : -1, minPost = postWeeks.length ? Math.min.apply(null, postWeeks) : -1;
  keep.forEach((p) => {
    p.round = p.type !== 'POST' ? null : p.week === sbWeek ? 'Super Bowl' : p.week === sbWeek - 1 ? 'Conference Championship' : p.week === minPost ? 'Wild Card' : 'Divisional';
    p.score = Math.abs(p.wpa) * (p.round === 'Super Bowl' ? 2 : p.type === 'POST' ? 1.5 : 1);
    rows.push(p);
  });
  console.log(y, 'kept', n);
}

rows.sort((a, b) => b.score - a.score);
/* every title game and Super Bowl 4th down is in, whatever its swing; then the rest by rank */
const perGame = {}, out = rows.filter((r) => r.big);
for (const r of out) perGame[r.game] = -99;
for (const r of rows) {
  if (r.big) continue;
  if ((perGame[r.game] = (perGame[r.game] || 0) + 1) > 2) continue;
  out.push(r);
  if (out.length >= KEEP) break;
}
out.sort((a, b) => b.score - a.score);
out.forEach((r) => { delete r.score; delete r.big; });
const file = path.join(HERE, '..', 'data', 'fourths.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ source: 'nflverse play-by-play (github.com/nflverse/nflverse-data), CC-BY 4.0', from: FROM, to: TO, built: 'fourths.mjs', plays: out }) + '\n');
console.log('wrote', out.length, 'plays to', path.relative(process.cwd(), file), (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
