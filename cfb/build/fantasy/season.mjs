/* THE SEASON TO DATE, KEPT IN THE REPO SO A BUILD ONLY READS WHAT IS NEW.
 *
 *   cfb/data/fantasy/season_<season>.json
 *
 * The NFL mode reads nflverse's weekly file, which already holds every man's every game.
 * College football has no such file anywhere this mode can reach without a key, so the
 * season is assembled here out of ESPN's box scores: every finished FBS game of every week
 * already played, one row a man who touched the ball. About seventy games a week.
 *
 * A WEEK IS STORED ONLY WHEN EVERY GAME IN IT IS FINISHED, and once stored it is never read
 * again from the network. So the first build of a season asks for a few hundred box scores
 * and every build after asks for one week's worth, and the file is also the record the
 * projection can be refitted against later, since it is a season of real college games in a
 * shape this repo can read.
 *
 * WHAT IT HOLDS, compactly, because it grows all season:
 *   names   { athleteId: name }
 *   weeks   { "4": { games: [[id, homeId, awayId, homeScore, awayScore, kick]],
 *                    rows:  [[athleteId, teamId, gameId, pts, line, stats...]] } }
 * `stats` is espn.mjs STAT_KEYS in order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreboardWeek, summary, gamesOf, boxRows } from './espn.mjs';

export const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'fantasy');
const say = (...a) => process.stderr.write(a.join(' ') + '\n');

export function storePath(season) {
  return path.join(DATA, `season_${season}.json`);
}

export function loadStore(season) {
  const f = storePath(season);
  if (!fs.existsSync(f)) return { season, names: {}, weeks: {} };
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function saveStore(store) {
  fs.mkdirSync(DATA, { recursive: true });
  /* One week to a line, so a diff of a new week is one line and a person can read it. */
  const weeks = Object.keys(store.weeks).sort((a, b) => a - b)
    .map((w) => `    ${JSON.stringify(w)}: ${JSON.stringify(store.weeks[w])}`);
  const text = '{\n'
    + `  "season": ${store.season},\n`
    + `  "names": ${JSON.stringify(store.names)},\n`
    + `  "weeks": {\n${weeks.join(',\n')}\n  }\n}\n`;
  fs.writeFileSync(storePath(store.season), text);
}

/**
 * Read every finished game of one week into the store. Answers how many games it read, or
 * null when the week is not finished (and so is left unstored, to be asked again).
 */
export async function fillWeek(store, week) {
  const sb = await scoreboardWeek(store.season, week);
  if (!sb) throw new Error(`the week ${week} scoreboard could not be read`);
  const games = gamesOf(sb);
  if (!games.length) throw new Error(`the week ${week} scoreboard has no games`);
  const open = games.filter((g) => g.state !== 'post');
  if (open.length) {
    say(`  week ${week}: ${open.length} of ${games.length} games not finished, so not stored`);
    return null;
  }
  const out = { games: [], rows: [] };
  let missing = 0;
  for (const g of games) {
    const j = await summary(g.id);
    const rows = j ? boxRows(j) : [];
    /* A FINISHED GAME WITH NO BOX IS A GAP, NOT A ZERO. Stored as a game nobody played in,
       it would read as every man on both teams having missed it, which the availability
       term would then price as absence. So a week with one is not stored at all, and is
       asked for again next build. */
    if (!rows.length) { missing++; continue; }
    out.games.push([g.id, g.home.id, g.away.id, g.home_score, g.away_score, g.kick]);
    for (const r of rows) {
      store.names[r.id] = r.name;
      out.rows.push([r.id, r.team, g.id, r.pts, r.line, ...r.s]);
    }
  }
  if (missing) {
    say(`  week ${week}: ${missing} finished games had no box score, so the week is not stored`);
    return null;
  }
  store.weeks[String(week)] = out;
  say(`  week ${week}: ${out.games.length} games, ${out.rows.length} rows stored`);
  return out.games.length;
}

/** Make sure every week before `week` is in the store. Answers the weeks that are. */
export async function fillBefore(store, week) {
  const have = [];
  for (let w = 1; w < week; w++) {
    if (!store.weeks[String(w)]) await fillWeek(store, w);
    if (store.weeks[String(w)]) have.push(w);
  }
  return have;
}

/*
 * EVERY MAN'S SEASON SO FAR, AND EVERY TEAM'S, off the stored weeks before `week`.
 *
 *   men    Map id -> { team, games, pts, stats{}, lastGame, name }
 *   teams  Map id -> { games, scored, allowed, last }   (last = its most recent game id)
 *
 * `team` is the team he played his LAST game for, which is the one that matters for a man
 * who transferred mid season or was listed twice.
 */
export function seasonToDate(store, week, statKeys) {
  const men = new Map();
  const teams = new Map();
  const weeks = Object.keys(store.weeks).map(Number).filter((w) => w < week).sort((a, b) => a - b);
  for (const w of weeks) {
    const wk = store.weeks[String(w)];
    for (const [gid, hid, aid, hs, as, kick] of wk.games) {
      for (const [tid, s, a] of [[hid, hs, as], [aid, as, hs]]) {
        const t = teams.get(tid) || { games: 0, scored: 0, allowed: 0, last: null, lastKick: null };
        t.games++; t.scored += Number(s) || 0; t.allowed += Number(a) || 0;
        if (!t.lastKick || String(kick) > t.lastKick) { t.last = gid; t.lastKick = String(kick); }
        teams.set(tid, t);
      }
    }
    for (const row of wk.rows) {
      const [id, tid, gid, pts] = row;
      const m = men.get(id) || { team: tid, games: 0, pts: 0, stats: {}, gids: new Set(),
        lastKick: null, name: store.names[id] || '' };
      if (m.gids.has(gid)) continue;
      m.gids.add(gid);
      m.games++;
      m.pts += Number(pts) || 0;
      statKeys.forEach((k, i) => { m.stats[k] = (m.stats[k] || 0) + (Number(row[5 + i]) || 0); });
      const kick = (wk.games.find((g) => g[0] === gid) || [])[5];
      if (!m.lastKick || String(kick) > m.lastKick) { m.lastKick = String(kick); m.team = tid; }
      men.set(id, m);
    }
  }
  return { men, teams, weeks };
}
