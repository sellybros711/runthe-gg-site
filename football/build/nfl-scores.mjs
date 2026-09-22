/* THE WEEK'S SLATE, AND WHAT IS KNOWN ABOUT IT RIGHT NOW.
 *
 *   node football/build/nfl-scores.mjs                     the live week, as SQL
 *   node football/build/nfl-scores.mjs --why               say what it found, write nothing
 *   node football/build/nfl-scores.mjs --espn <file.json>  a saved payload instead of the feed
 *
 * It is normally not run on its own: `live-results.mjs` calls it on the same cron tick that
 * scores the week, so the scoreboard and the standings are written from one snapshot. The
 * CLI exists so the thing can be looked at by hand, which on a source nobody here can reach
 * is most of what there is to go on.
 *
 * ─── TWO SOURCES, AND WHICH ONE ANSWERS IS DECIDED PER GAME ─────────────────────────
 *
 *   the schedule   `games.csv`: who is playing, when it kicks off, and a final score some
 *                  hours after the whistle. It is the one that names a club.
 *   the feed       ESPN: the state, the quarter, the clock and a score DURING a game.
 *
 * The schedule half of every row is always ours. The live half is the feed's when the feed
 * has an answer for that game, the schedule's when the game is over and nflverse has caught
 * up, and otherwise nothing but the kickoff time.
 *
 * ─── A ROW IS EMITTED EVEN WHEN NOTHING IS KNOWN, AND THAT IS ON PURPOSE ────────────
 *
 * A game nobody can say anything about goes out as `pre` with its kickoff. Two reasons, and
 * the second is the one that matters:
 *
 *   The slate is then COMPLETE in the table from the first tick, so the live screen draws
 *     sixteen games rather than the four that happen to have started.
 *   And it cannot lie, because the server refuses a state that knows less than the row it
 *     already holds. A `pre` arriving over a game in its fourth quarter is dropped by
 *     `nfl_put_games`, which is exactly the situation a feed outage produces, twice an hour,
 *     all afternoon. See 111_nfl_scores.sql.
 *
 * That split is deliberate: this file is allowed to be naive because the rule that stops it
 * mattering is written once, in the database, where every writer meets it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, cachedCSV, parseCSVObjects, GAMES_URL } from './lib.mjs';
import { easternInstant } from './weekly-pool.mjs';
import { fetchLive, readScoreboard } from './espn.mjs';

const num = (v) => (v == null || v === '' ? null : Number(v));

/**
 * Every REG game of one week, off the schedule alone.
 *
 * ONE ROW A GAME, unlike `weekGames`, which answers one entry a CLUB because it is asked
 * "who does this man play". A scoreboard is a list of games, and a club-keyed map has each
 * of them in it twice.
 */
export function weekSlate(games, season, week) {
  const out = [];
  for (const g of games) {
    if (num(g.season) !== season || num(g.week) !== week) continue;
    if (g.game_type && g.game_type !== 'REG') continue;
    if (!g.home_team || !g.away_team || !g.game_id) continue;
    out.push({
      game_id: g.game_id,
      away: g.away_team,
      home: g.home_team,
      kick: easternInstant(g.gameday, g.gametime),
      gameday: g.gameday || null,
      /* THE JOIN KEY. Blank for a game the schedule has no ESPN id for, which takes that
         game off the feed and onto the fallback rather than onto somebody else's id. */
      espn: g.espn ? String(g.espn) : null,
      away_score: num(g.away_score),
      home_score: num(g.home_score),
      overtime: g.overtime === '1' || g.overtime === 1 || g.overtime === true,
    });
  }
  out.sort((a, b) => String(a.kick).localeCompare(String(b.kick))
    || a.game_id.localeCompare(b.game_id));
  return out;
}

/** The distinct days a week is played, as ESPN addresses a day: YYYYMMDD. */
export function slateDays(slate) {
  const days = new Set();
  for (const g of slate) if (g.gameday) days.add(g.gameday.replace(/-/g, ''));
  return [...days].sort();
}

/**
 * What to write, one row a game.
 *
 * @param {object[]} slate  from `weekSlate`
 * @param {Map}      live   from `fetchLive`, keyed on ESPN event id. Empty is fine.
 * @param {number}   at     the instant this is being asked, so a test can pick one
 */
export function scoreRows(slate, live, at = Date.now()) {
  return slate.map((g) => {
    const base = {
      game_id: g.game_id, away: g.away, home: g.home, kick: g.kick,
    };
    const f = g.espn && live ? live.get(g.espn) : null;
    if (f) {
      return Object.assign(base, {
        state: f.state, away_score: f.away_score, home_score: f.home_score,
        period: f.period, clock: f.clock,
        /* The feed only has an opinion about overtime once a game is over. Before that it
           answers null and the schedule's own flag, which is also only filled in at the end,
           is the same nothing. */
        overtime: f.overtime == null ? null : f.overtime,
        source: 'espn',
      });
    }
    /* THE SCHEDULE HAS A FINAL SCORE, which means the game is over and nflverse has caught
       up with it. This is the whole of the fallback's live half, and it is why a feed that
       never works at all still ends the week with a correct scoreboard. */
    if (g.away_score != null && g.home_score != null) {
      return Object.assign(base, {
        state: 'post', away_score: g.away_score, home_score: g.home_score,
        period: null, clock: null, overtime: !!g.overtime, source: 'schedule',
      });
    }
    /* And otherwise all we have is a kickoff time. `pre` is what that is, whether the game
       is tomorrow or in its second quarter, and the server is what stops the second case
       mattering. */
    return Object.assign(base, {
      state: 'pre', away_score: null, home_score: null,
      period: null, clock: null, overtime: null,
      source: at != null && g.kick && at >= Date.parse(g.kick) ? 'schedule-late' : 'schedule',
    });
  });
}

/** One statement. See `publish-week.mjs` for why the emitters here print SQL rather than
    talking to a database: the caller pipes it into psql, and a build that cannot reach a
    database can still be read by a person. */
export function scoresSQL(season, week, rows) {
  if (!rows || !rows.length) return '';
  /* Single quotes doubled rather than dollar quoted. Nothing in a club code, a game id or a
     game clock can contain one, which is exactly why it costs nothing to be sure. */
  const j = JSON.stringify(rows).replace(/'/g, "''");
  return `-- ${season} week ${week}: ${rows.length} games\n`
    + `select public.nfl_put_games(${season}, ${week}, '${j}'::jsonb);\n`;
}

/**
 * The whole job: read the schedule, ask the feed, compose.
 *
 * `opts.espnFile` reads a saved payload instead of the feed, which is the only way any of
 * this can be exercised from a machine that cannot reach ESPN.
 */
export async function buildScores({ season, week, games, espnFile, at = Date.now() }) {
  const slate = weekSlate(games, season, week);
  if (!slate.length) return { season, week, slate, rows: [], how: 'none', matched: 0 };

  const ids = slate.map((g) => g.espn).filter(Boolean);
  let live = new Map(), how = 'none';
  if (espnFile) {
    const j = JSON.parse(fs.readFileSync(espnFile, 'utf8'));
    const all = readScoreboard(j);
    const want = new Set(ids);
    for (const [k, v] of all) if (want.has(k)) live.set(k, v);
    how = 'file';
  } else if (ids.length) {
    const got = await fetchLive({ season, week, ids, days: slateDays(slate) });
    live = got.live;
    how = got.how;
  }
  return { season, week, slate, rows: scoreRows(slate, live, at), how, matched: live.size };
}

/* ─── cli ──────────────────────────────────────────────────────────────────────────── */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('nfl-scores.mjs')) {
  const say = (...a) => process.stderr.write(a.join(' ') + '\n');
  const now = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fantasy_now.json'), 'utf8'));
  const season = Number(arg('--season', now.season));
  const week = Number(arg('--week', now.week));
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv', { maxAgeMs: 0 }));
  const got = await buildScores({ season, week, games, espnFile: arg('--espn', null) });
  const by = {};
  for (const r of got.rows) by[r.state] = (by[r.state] || 0) + 1;
  say(`${season} week ${week}: ${got.rows.length} games, feed answered ${got.matched}`
    + ` (${got.how}), ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  if (!process.argv.includes('--why')) process.stdout.write(scoresSQL(season, week, got.rows));
}
