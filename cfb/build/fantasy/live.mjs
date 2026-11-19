/* THE COLLEGE BOARD WHILE THE GAMES ARE ON, AND THE WEEK SETTLED WHEN THEY ARE OVER.
 *
 *   node cfb/build/fantasy/live.mjs --why                  what it would do, and why
 *   node cfb/build/fantasy/live.mjs --status FILE | psql "$SUPABASE_DB_URL"
 *
 * One tick: read ESPN's scoreboard for the days the slate is played on, write the twenty
 * games, read the box score of every game that has started, and write each man's points.
 * `cfb-fantasy-live.yml` loops it.
 *
 * ─── ESPN'S BOX SCORE IS WHAT PAYS, and that is the difference from the NFL mode ────
 *
 * The NFL mode scores live off ESPN and SETTLES off nflverse, which lands hours later. There
 * is no second source for college football that this mode can reach without a key, so the
 * box score is the result. What it cannot see is a two point conversion, the same gap the
 * NFL live score has, and it is said here rather than papered over.
 *
 * A WEEK IS FINAL when every slate game is finished and the last of them kicked off more
 * than four and a half hours ago, so a box score has had time to settle after the whistle.
 * Marking final settles the top three and pays first place (128's trigger), so it is written
 * once and `cfb_fantasy_mark_results` refuses to un-say it.
 *
 * THE WEEK BEFORE IS FINISHED TOO. The Monday build moves the pointer to the next week, and
 * a late Saturday game's box can still be settling then, so each tick also finishes the
 * previous week if it is not final yet. Writing a final week twice is writing it once.
 *
 * `--status FILE` gets one line: `watch <seconds>` or `sleep`. The exit code already means
 * "failed", which is why the loop's decision is a file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scoreboardDay, gamesOf, summary, boxRows } from './espn.mjs';
import { DATA } from './season.mjs';
import { resultsSQL, kickoffsSQL } from './publish.mjs';

const say = (...a) => process.stderr.write(a.join(' ') + '\n');
const H = 3600e3;
export const FINAL_AFTER_H = 4.5;
/* A Playoff game is watched this long after its kickoff: a long game, then its box settling. */
export const PLAYOFF_WATCH_H = 8;

const ET = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});
export const easternDay = (iso) => ET.format(new Date(iso)).replace(/-/g, '');

function readPool(season, week) {
  const f = path.join(DATA, `pool_${season}_w${week}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

/** What a tick should do about one week, off the clock and the kickoffs alone. */
export function plan(pool, now) {
  const kicks = pool.games.map((g) => Date.parse(g.kick)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!kicks.length) return { watch: false, why: 'no kickoffs' };
  const first = kicks[0], last = kicks[kicks.length - 1];
  /* THE PLAYOFF IS WATCHED GAME BY GAME. Its first kickoff and its last are five weeks apart,
     and "between the first and the last" would keep the loop awake, and dispatching itself, for
     all of them. So each game is watched from just before it until its box score has settled,
     and the weeks between are asleep. A round not yet on the board is a game still to come. */
  if (pool.kind === 'playoff') {
    if (kicks.some((k) => now >= k - 10 * 60e3 && now <= k + PLAYOFF_WATCH_H * H)) {
      return { watch: true, why: 'a Playoff game on or settling' };
    }
    const next = kicks.find((k) => k > now);
    const whole = !pool.expect_games || pool.games.length >= pool.expect_games;
    if (next == null && whole && now > last + 30 * H) return { watch: false, done: true, why: 'long over' };
    return { watch: false, soon: next != null && next - now < 3 * H,
      why: next != null ? 'between Playoff games' : 'waiting for the next round to be set' };
  }
  if (now < first - 10 * 60e3) {
    return { watch: false, soon: first - now < 3 * H, why: 'before the first kickoff' };
  }
  if (now > last + 30 * H) return { watch: false, done: true, why: 'long over' };
  return { watch: true, why: 'games on or settling' };
}

/** One week's tick: its scoreboard, its box scores, and whether it is final. */
export async function tick(pool, now) {
  const days = [...new Set(pool.games.map((g) => easternDay(g.kick)))];
  const live = new Map();
  for (const d of days) {
    const j = await scoreboardDay(d);
    for (const g of gamesOf(j)) live.set(g.id, g);
  }
  const ours = pool.games.map((g) => ({ ...g, live: live.get(g.id) || null }));
  const matched = ours.filter((g) => g.live).length;
  say(`  scoreboard: ${matched} of ${ours.length} slate games in the feed`);

  const board = ours.map((g) => ({
    game_id: g.id, away: g.away.abbr, home: g.home.abbr,
    kick: (g.live && g.live.kick) || g.kick,
    state: g.live ? g.live.state : 'pre',
    away_score: g.live ? g.live.away_score : null,
    home_score: g.live ? g.live.home_score : null,
    period: g.live ? g.live.period : null,
    clock: g.live ? g.live.clock : null,
    overtime: g.live ? g.live.overtime : null,
    source: g.live ? 'espn' : 'schedule',
  }));

  const onBoard = new Set(pool.pool.map((m) => m.player_id));
  const scores = {};
  let read = 0;
  const started = ours.filter((g) => g.live && g.live.state !== 'pre');
  for (const g of started) {
    const j = await summary(g.id);
    if (!j) continue;
    read++;
    /* ADDED ACROSS GAMES, never overwritten. A week has one game a man, so this is that
       game. In the Playoff a man plays every round his team is alive in, and his total is
       all of them, each game's line kept beside the others. */
    for (const r of boxRows(j)) {
      if (!onBoard.has(r.id)) continue;
      const had = scores[r.id];
      scores[r.id] = had
        ? [Math.round((had[0] + r.pts) * 10) / 10, [had[1], r.line].filter(Boolean).join(' · ')]
        : [r.pts, r.line];
    }
  }
  const post = ours.filter((g) => g.live && g.live.state === 'post').length;
  const lastKick = Math.max(...ours.map((g) => Date.parse((g.live && g.live.kick) || g.kick)));
  /* THE PLAYOFF IS NOT FINAL UNTIL ITS LAST GAME IS ON THE BOARD. Its later rounds are added
     as they are set (playoff.mjs --refresh), so "every game on the board is over" is true
     between rounds too. `expect_games` is how many the week has when it is whole. */
  const whole = !pool.expect_games || ours.length >= pool.expect_games;
  const final = whole && post === ours.length && read === ours.length
    && now > lastKick + FINAL_AFTER_H * H;
  say(`  box: ${read} of ${started.length} started games read, `
    + `${Object.keys(scores).length} men scored; ${post} of ${ours.length} final`
    + (final ? ', THE WEEK IS FINAL' : ''));
  return {
    sql: kickoffsSQL(pool, ours.map((g) => ({ ...g, kick: (g.live && g.live.kick) || g.kick })))
      + resultsSQL({ season: pool.season, week: pool.week, scores, board,
        played: post, games: ours.length, final }),
    inPlay: ours.some((g) => g.live && g.live.state === 'in'),
    final,
  };
}

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('live.mjs')) {
  const now = Date.now();
  const ptr = JSON.parse(fs.readFileSync(path.join(DATA, 'now.json'), 'utf8'));
  /* The week before is the pointer's `prev` (writePool), not week minus one: the Playoff
     follows the last regular week but is not numbered after it. */
  const prevWeek = ptr.prev != null ? ptr.prev : ptr.week - 1;
  const weeks = [readPool(ptr.season, prevWeek), readPool(ptr.season, ptr.week)]
    .filter(Boolean);
  let watch = false, soon = false, sql = '';
  for (const pool of weeks) {
    const p = plan(pool, now);
    say(`${pool.season} week ${pool.week}: ${p.why}`);
    if (p.soon) soon = true;
    if (!p.watch && !process.argv.includes('--force')) continue;
    if (process.argv.includes('--why')) { watch = watch || p.watch; continue; }
    const t = await tick(pool, now);
    sql += t.sql;
    if (!t.final) watch = true;
    if (t.inPlay) soon = false;
  }
  const status = arg('--status', null);
  if (status) {
    fs.writeFileSync(status, watch ? (soon ? 'watch 600\n' : 'watch 120\n')
      : (soon ? 'watch 900\n' : 'sleep\n'));
  }
  process.stdout.write(sql);
}
