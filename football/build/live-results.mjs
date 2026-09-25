/* THE LIVE WRITER. One command, run on a cron while the games are on.
 *
 *   node football/build/live-results.mjs | psql "$SUPABASE_DB_URL"
 *   node football/build/live-results.mjs --why          say what it decided and write nothing
 *   node football/build/live-results.mjs --force        write even outside a game window
 *   node football/build/live-results.mjs --espn f.json  a saved payload instead of the feed
 *
 * IT WRITES TWO THINGS: what the week's six-man lineups have scored, and what the real games
 * are doing. They are on one tick on purpose, because the live screen shows both and a board
 * that has already paid for a touchdown the scoreboard beside it has not shown reads as one
 * of the two being broken. The scoreboard half is `nfl-scores.mjs` and is allowed to fail
 * without taking the scoring with it.
 *
 * It prints SQL on stdout and nothing else, so the pipe above is the whole of it. When
 * there is nothing to do it prints NOTHING, and psql handed an empty script is a no-op:
 * that is why the decision lives here rather than in the workflow, where it would have to
 * be a shell condition nobody can run locally.
 *
 * ─── WHAT IT DOES NOT DO ────────────────────────────────────────────────────────────
 *
 * IT NEVER COMMITS. The live board is a Supabase read, so a score that moves costs one
 * write and no deploy. `results_<season>_w<week>.json` is still written once, on the
 * Tuesday, by the ordinary `weekly-results.mjs --write` path: committing it every ten
 * minutes would be a hundred commits and a hundred Cloudflare deploys a weekend, to publish
 * a file the live screen does not read.
 *
 * IT NEVER BUILDS A POOL. The board for the week was priced on the Tuesday and must not
 * move once anybody has drafted against it.
 *
 * ─── THE WINDOW IS ASKED OF THE SCHEDULE, NEVER OF THE CLOCK ────────────────────────
 *
 * The cron has to fire in UTC and the games are in Eastern, and the season crosses a clock
 * change in early November. `setlist-data.yml` carries a long note about the same trap and
 * `fantasy-pool.yml` asks which schedule fired rather than what time it is. Here the answer
 * is better than either: the job casts a wide net in UTC and THIS decides, off `games.csv`,
 * which is in Eastern and already the one source for when a game starts. A clock change
 * moves nothing, because nothing here reads a wall clock.
 *
 * A game is worth looking at from a little before kickoff until well after the whistle, and
 * then the week stays worth looking at for as long as a club that has played is still
 * missing its stats. That second clause is the one that matters: the stats land AFTER the
 * game, so a window that closed at the final whistle would stop watching at exactly the
 * moment the last game's points were about to arrive.
 */

import fs from 'fs';
import path from 'path';
import { DATA_DIR, cachedCSV, nflverseCSV, parseCSVObjects, GAMES_URL } from './lib.mjs';
import { buildWeeklyResults } from './weekly-results.mjs';
import { weekGames } from './weekly-pool.mjs';
import { resultsSQL } from './publish-week.mjs';
import { buildScores, scoresSQL } from './nfl-scores.mjs';
import { fetchBoxes, boxScores, crosswalk } from './espn-box.mjs';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WHY = process.argv.includes('--why');
const FORCE = process.argv.includes('--force');
/* A saved payload instead of the feed, which is the only way the scoreboard half of this
   can be driven from a machine that cannot reach ESPN. See espn.mjs. */
const ESPN_FILE = arg('--espn', null);
/* Where to tell the workflow's loop whether to keep watching. One line: `watch 120`, `watch
   600` or `sleep`. A file rather than an exit code, because an exit code is how this script
   says it FAILED and the loop has to be able to tell the two apart. */
const STATUS_FILE = arg('--status', null);
const status = (v) => { if (STATUS_FILE) fs.writeFileSync(STATUS_FILE, v + '\n'); };
status('sleep');

/* Everything explanatory goes to stderr, so `| psql` only ever receives SQL. A workflow log
   still shows all of it, which is where the cadence question gets answered. */
const say = (...a) => process.stderr.write(a.join(' ') + '\n');

/* A game is watched from ten minutes before kickoff until six hours after. Six rather than
   four: the tail is not about the football, it is about how long nflverse takes to write
   the rows, and that is the number this whole design is trying to measure. Too generous
   costs a few cheap no-op runs; too tight stops watching before the points arrive. */
const BEFORE_MS = 10 * 60 * 1000;
const AFTER_MS = 6 * 60 * 60 * 1000;

/* HOW EARLY THE LOOP STAYS AWAKE FOR A KICKOFF. GitHub's cron is a wide net and it is
   best effort: on the first Thursday of this mode not one of the six scheduled firings in
   the game window ran at all. So any firing that does land inside three hours of a kickoff
   keeps the job alive until the games are over, rather than trusting another firing to
   turn up at the right minute. */
const LEAD_MS = 3 * 60 * 60 * 1000;

const main = async () => {
  const nowFile = path.join(DATA_DIR, 'fantasy_now.json');
  if (!fs.existsSync(nowFile)) {
    say('no fantasy_now.json: no week is live. Nothing to do.');
    return;
  }
  const now = JSON.parse(fs.readFileSync(nowFile, 'utf8'));
  const season = Number(arg('--season', now.season));
  const week = Number(arg('--week', now.week));
  const at = Date.now();

  /* FRESH, ALWAYS. The cache never expires, so a run that accepted a cached schedule or a
     cached stats file would poll the same bytes for ever and the board would never move
     again. In a GitHub runner the cache is empty anyway, which is what makes this a
     load-bearing line rather than a redundant one: it is what keeps this correct the day
     somebody adds a cache step to make the workflow faster. */
  const fresh = { maxAgeMs: 0 };
  const games = parseCSVObjects(await cachedCSV(GAMES_URL, 'games.csv', fresh));
  const sched = weekGames(games, season, week);
  if (!sched.size) {
    say(`the schedule has no week ${week} of ${season}. Nothing to do.`);
    return;
  }

  /* `weekGames` answers one entry a CLUB, and a dozen clubs share the Sunday one o'clock,
     so this is DISTINCT KICKOFF TIMES and not games. That is the right set for a window
     (two games starting together are one window) and the wrong word for the log, which
     said "6 games" about a sixteen game week until it was read. */
  const kicks = [...new Set([...sched.values()].map((g) => g.kick).filter(Boolean))]
    .map((k) => Date.parse(k)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!kicks.length) {
    say(`week ${week} has no kickoff times. Nothing to do.`);
    return;
  }

  const inGame = kicks.filter((k) => at >= k - BEFORE_MS && at <= k + AFTER_MS).length;
  const before = at < kicks[0] - BEFORE_MS;
  const next = kicks.find((k) => k > at);
  const soon = next != null && next - at <= LEAD_MS;
  if (soon || inGame) status('watch 600');
  const et = (ms) => new Date(ms).toLocaleString('en-US',
    { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });

  say(`${season} week ${week}: ${kicks.length} kickoff times across ${sched.size / 2} games, `
    + `first ${et(kicks[0])} ET, last ${et(kicks[kicks.length - 1])} ET`);

  if (before && !FORCE) {
    say(`nothing has kicked off yet. Nothing to do.`);
    return;
  }

  const built = await buildWeeklyResults({ season, week, partial: true, ...fresh });
  const rows = Object.keys(built.scores).length;

  /* THE SECOND HALF OF THE WINDOW. Past the last kickoff plus its tail, the only reason to
     keep writing is a club whose game is over and whose stats have not landed. Once every
     one of them is in and the week is final, there is nothing left to watch and the
     Tuesday build takes over. */
  const waiting = built.awaiting_stats.length;
  const worth = inGame > 0 || waiting > 0 || !built.final;
  if (waiting && !built.final) status('watch 600');

  say(`  ${built.played} of ${built.games} games played, ${rows} men with a row`
    + (waiting ? `, waiting on ${built.awaiting_stats.join(', ')}` : '')
    + (built.final ? ', FINAL' : ''));
  say(`  ${inGame} kickoff${inGame === 1 ? '' : 's'} inside a watch window`);

  if (!worth && !FORCE) {
    say('  the week is finished and every club is in. Nothing to do.');
    return;
  }

  /* ─── THE PICTURE BESIDE THE NUMBER ───────────────────────────────────────────────
   *
   * The same tick writes the scoreboard, so what the live screen shows about the games and
   * what it shows about the standings are one snapshot. Asked on two schedules they would
   * be two, about twenty seconds apart, and a board that had already paid for a touchdown
   * the scoreboard beside it had not shown reads as one of the two being broken.
   *
   * IT MAY NOT TAKE THIS JOB RED. Scoring the week is the thing that matters and a picture
   * is a picture: `buildScores` already swallows everything the feed can do, and this
   * catches the rest so that a scoreboard which cannot be built still leaves a week that
   * can be scored. The log is loud about it, because a feed nobody here can reach is a feed
   * whose first verification is a run of this workflow.
   */
  let scores = null;
  try {
    scores = await buildScores({ season, week, games, espnFile: ESPN_FILE, at });
    const by = {};
    for (const r of scores.rows) by[r.state] = (by[r.state] || 0) + 1;
    say(`  scoreboard: ${scores.rows.length} games, the feed answered ${scores.matched}`
      + ` (${scores.how}), ` + Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', '));
    /* THE NUMBER TO READ IN A WORKFLOW LOG. A run that fetched a payload and matched none
       of our sixteen games is the feed's week numbering disagreeing with ours, and it looks
       exactly like a quiet afternoon from every other angle. */
    if (!scores.matched && inGame > 0) {
      say('  scoreboard: THE FEED ANSWERED NOTHING WHILE A GAME IS ON. '
        + 'Every game falls back to the schedule, so the board will show kickoff times.');
    }
  } catch (e) {
    say('  scoreboard: could not be built (' + (e && e.message ? e.message : e)
      + '). The week is still scored.');
  }

  /* ─── THE POINTS WHILE THE GAME IS ON ─────────────────────────────────────────────
   *
   * nflverse writes a game's rows hours after the whistle, so without this every lineup
   * read 0.0 through the whole of the first Thursday. ESPN's box score is read for every
   * game that has started and whose clubs nflverse has not written yet, and it only ever
   * fills men nflverse has no row for. See espn-box.mjs for why it never pays.
   *
   * Like the scoreboard, it may not take the job red.
   */
  let provisional = 0;
  if (scores && !built.final && !ESPN_FILE) {
    try {
      const done = new Set(built.scored_clubs || []);
      const espnOf = new Map((scores.slate || []).map((g) => [g.game_id, g.espn]));
      const ids = scores.rows
        .filter((r) => (r.state === 'in' || r.state === 'post')
          && !(done.has(r.home) && done.has(r.away)))
        .map((r) => espnOf.get(r.game_id)).filter(Boolean);
      if (ids.length) {
        const xwalk = crosswalk(parseCSVObjects(
          await nflverseCSV('players', 'players.csv', { maxAgeMs: 12 * 60 * 60 * 1000 })));
        const boxes = await fetchBoxes(ids);
        const got = boxScores(boxes, xwalk, new Set(Object.keys(built.scores)));
        provisional = Object.keys(got.scores).length;
        Object.assign(built.scores, got.scores);
        say(`  box: ${boxes.length} of ${ids.length} games read, ${provisional} men scored`
          + ` off ESPN until nflverse lands`
          + (got.unmapped ? `, ${got.unmapped} with no crosswalk row` : ''));
      }
      /* The count the board prints is games FINISHED, and ESPN knows a game is over hours
         before games.csv does. This is display only: `final` is still nflverse's alone. */
      const post = scores.rows.filter((r) => r.state === 'post').length;
      if (post > built.played) built.played = post;
    } catch (e) {
      say('  box: could not be read (' + (e && e.message ? e.message : e)
        + '). The week is still scored off nflverse.');
    }
  }
  /* A game on the field is polled every two minutes. Everything else the loop waits for
     (a kickoff inside three hours, a club whose stats have not landed) is ten. */
  if (scores && scores.rows.some((r) => r.state === 'in')) status('watch 120');

  if (WHY) {
    say('  --why, so no SQL was written.');
    return;
  }

  /* SCORES FIRST, and the order is not arbitrary: they are two statements and psql applies
     them as it reads them, so a failure between the two leaves the scoreboard written and
     the week unscored rather than the other way round. The week is what the Tuesday build
     settles anyway; nothing settles a scoreboard. */
  if (scores && scores.rows.length) process.stdout.write(scoresSQL(season, week, scores.rows));
  process.stdout.write(resultsSQL(built));
  say(`  wrote SQL for ${Object.keys(built.scores).length} men`
    + (built.final ? ' and marked the week final.' : '.'));
};

main().catch((e) => {
  /* A LIVE RUN THAT FAILS MUST FAIL LOUDLY. Everything else in this mode fails open, and
     this is the one path where a quiet exit 0 means the board silently stops moving for a
     whole afternoon with a green tick beside it. */
  say('live-results FAILED: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
