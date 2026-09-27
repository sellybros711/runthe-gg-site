/* ONE COLLEGE WEEK'S BOARD: the twenty games, the men on them, what each is projected to
 * score and what each costs.
 *
 *   node cfb/build/fantasy/pool.mjs                      the next week to be played
 *   node cfb/build/fantasy/pool.mjs --season 2026 --week 5
 *   node cfb/build/fantasy/pool.mjs --week 5 --write     and write the files the page reads
 *
 * Writes cfb/data/fantasy/pool_<season>_w<week>.json, the season store beside it, and
 * cfb/data/fantasy/now.json, which is how the page knows which week is live.
 *
 * ─── THE SLATE IS THE TWENTY BEST GAMES, CHOSEN BY RULE ──────────────────────────────
 *
 * Asked for by the owner: the top twenty games or so, rather than all sixty. FBS is about
 * 130 teams, and a wheel drawn from all of them deals mostly backups from schools nobody on
 * this site follows. The rule is written down so a reader can check a week's pick:
 *
 *   each ranked team        26 minus its rank (a No. 1 is worth 25, a No. 25 is worth 1)
 *   each power team         8   (the SEC, the Big Ten, the ACC, the Big 12, Notre Dame)
 *   a close game            up to 7, off the spread (a pick'em is 7, a 14 point line is 0)
 *   a high total            up to 6, off the over/under above 44
 *
 * Both sides have to be FBS, and the game must not have kicked off.
 *
 * ─── THE PROJECTION: WHAT HE HAS DONE, WHAT HE DID LAST YEAR, AND THIS MATCHUP ──────
 *
 * Asked for in as many words: projections and season performance so far. So:
 *
 *   rate      his points a game this season, shrunk toward a PRIOR as though he had
 *             also played K games at the prior. The prior is his own 2025 average when
 *             this repo has one (cfb/data/cfb_player_seasons.json, the college game's own
 *             data, keyed on the same ESPN id), and otherwise 80% of what the draftable
 *             men at his position are averaging (the NFL mode's rule, `PROJ_LEVEL`).
 *   plays     the share of his team's games he has played in. A man who has missed games
 *             is priced as a man who misses games.
 *   matchup   what the betting market expects his team to score this week, against what
 *             his team has averaged, to the power 0.6, held between 0.80 and 1.25.
 *
 * THESE THREE CONSTANTS ARE NOT FITTED YET, AND THAT IS SAID RATHER THAN IMPLIED. The NFL
 * mode fitted every constant it has against three seasons of nflverse. College football has
 * no such archive this mode can reach, so the season store beside this file IS the archive:
 * it keeps every box score of 2026 as it is played, and the first thing to do once it holds
 * a half season is to refit K, the matchup exponent and the level against it.
 *
 * ─── THE PRICE IS THE PROJECTION ─────────────────────────────────────────────────────
 *
 * The NFL mode's price curve, unchanged: value over a baseline at the same share of the
 * board, onto $3M to $48M along a convex curve anchored on the best man on the board.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  scoreboardWeek, roster, gamesOf, implied, rosterOf, calendarOf, playLine, STAT_KEYS,
} from './espn.mjs';
import { DATA, loadStore, saveStore, fillBefore, seasonToDate } from './season.mjs';
import { sweepCap } from './cap.mjs';

const say = (...a) => process.stderr.write(a.join(' ') + '\n');
const round = (v, dp = 2) => Number(Number(v).toFixed(dp));

/* The NFL mode's own price curve. Imported by value rather than by module, because the NFL
   file that holds them (football/build/01-players.mjs) runs a build on import. */
export const BASE_PRICE = 3.0;
export const MAX_PRICE = 48.0;
export const PRICE_K = 1.8;
export const BASELINE_FRACTION = 150 / 380;

export const SLATE_SIZE = 20;
export const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const POS_OF = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE' };

/* ESPN's conference ids for FBS. A team in none of these is FCS, and its players have no
   season this mode can price. The Pac-12 id is kept for the conference it is rebuilding. */
export const FBS_CONF = new Set(['1', '4', '5', '8', '9', '12', '15', '17', '18', '37', '151']);
export const POWER_CONF = new Set(['1', '4', '5', '8']);
const NOTRE_DAME = '87';
const isPower = (t) => POWER_CONF.has(t.conf) || t.id === NOTRE_DAME;

export const SHRINK_K = 2;
export const PROJ_LEVEL = 0.80;
export const MATCHUP_EXP = 0.6;
export const MATCHUP_LO = 0.80;
export const MATCHUP_HI = 1.25;

/* The swap band the week carries (128's `swap_pct` and `swap_floor_musd`): a man can be
   swapped for one who costs the same or up to this much less. */
export const SWAP_PCT = 0.25;
export const SWAP_FLOOR_MUSD = 5;

/* ─── the slate ───────────────────────────────────────────────────────────────────── */

export function gameScore(g) {
  let s = 0;
  for (const t of [g.home, g.away]) {
    if (t.rank) s += 26 - t.rank;
    if (isPower(t)) s += 8;
  }
  s += g.spread == null ? 2 : Math.max(0, 7 - Math.abs(g.spread) / 2);
  s += g.total == null ? 2 : Math.min(6, Math.max(0, (g.total - 44) / 3));
  return Math.round(s * 10) / 10;
}

export function pickSlate(games, now = Date.now(), size = SLATE_SIZE) {
  const fbs = (t) => FBS_CONF.has(t.conf) || t.id === NOTRE_DAME;
  const ok = games.filter((g) => g.state === 'pre' && fbs(g.home) && fbs(g.away)
    && g.kick && Date.parse(g.kick) > now);
  return ok.map((g) => ({ ...g, score: gameScore(g) }))
    .sort((a, b) => b.score - a.score || String(a.kick).localeCompare(String(b.kick)))
    .slice(0, size)
    .sort((a, b) => String(a.kick).localeCompare(String(b.kick)) || a.id.localeCompare(b.id));
}

/* ─── the prior ───────────────────────────────────────────────────────────────────── */

/* Last season's half PPR a game, off the college game's own data, which is full PPR. Half a
   point a catch comes back off, read from the stat line because the file carries receiving
   points but not the catch count. */
export function priorsFrom(rows, season) {
  const out = new Map();
  for (const r of rows) {
    if (Number(r.season) !== season - 1 || !(r.games_played > 0)) continue;
    const m = String(r.stat_line || '').match(/([\d,]+) rec\b/);
    const rec = m ? Number(m[1].replace(/,/g, '')) : 0;
    const half = Number(r.ppr_ppg_mean) - 0.5 * rec / r.games_played;
    if (Number.isFinite(half)) out.set(String(r.player_id), round(Math.max(0, half), 2));
  }
  return out;
}

/* ─── the projection ──────────────────────────────────────────────────────────────── */

export function positionLevels(men) {
  const out = new Map();
  for (const pos of POSITIONS) {
    const top = men.filter((p) => p.position === pos)
      .sort((a, b) => b.half_ppg - a.half_ppg).slice(0, 40);
    out.set(pos, top.length ? top.reduce((t, p) => t + p.half_ppg, 0) / top.length : 0);
  }
  return out;
}

export function projectMan(p, levels) {
  const prior = p.prior != null ? p.prior : PROJ_LEVEL * (levels.get(p.position) || 0);
  const rate = (p.games * p.half_ppg + SHRINK_K * prior) / (p.games + SHRINK_K);
  const plays = p.played_of > 0 ? Math.min(1, Math.max(0, p.games / p.played_of)) : 1;
  let matchup = 1;
  if (p.implied != null && p.team_avg > 0) {
    matchup = Math.min(MATCHUP_HI, Math.max(MATCHUP_LO,
      Math.pow(p.implied / p.team_avg, MATCHUP_EXP)));
  }
  return { proj: round(Math.max(0, rate * plays * matchup), 1), matchup: round(matchup, 3) };
}

/* ─── the price ───────────────────────────────────────────────────────────────────── */

export function pricePool(men) {
  const desc = men.map((p) => p.proj).sort((a, b) => b - a);
  const rank = Math.max(1, Math.round(desc.length * BASELINE_FRACTION));
  const baseline = desc[Math.min(desc.length - 1, rank - 1)] ?? 0;
  for (const p of men) p.vor = p.proj - baseline;
  const asc = men.map((p) => p.vor).sort((a, b) => a - b);
  const lo = asc[Math.floor(0.01 * (asc.length - 1))] ?? 0;
  const ref = asc[asc.length - 1] ?? 0;
  const span = ref - lo;
  for (const p of men) {
    const t = span > 0 ? (p.vor - lo) / span : 0;
    p.price_musd = round(BASE_PRICE + (MAX_PRICE - BASE_PRICE)
      * Math.pow(Math.min(1, Math.max(0, t)), PRICE_K), 1);
    delete p.vor;
  }
  return { baseline: round(baseline, 2), rank };
}

/* ─── the men ─────────────────────────────────────────────────────────────────────── */

/**
 * The board, out of the slate, the rosters and the season to date. Pure, so a test can
 * drive it without a network.
 *
 * @param slate    pickSlate()'s answer
 * @param rosters  Map teamId -> rosterOf()'s answer
 * @param todate   seasonToDate()'s answer
 * @param priors   priorsFrom()'s answer
 */
export function buildMen(slate, rosters, todate, priors) {
  const men = [];
  const dropped = { off: 0, noGames: 0, noPos: 0 };
  for (const g of slate) {
    const imp = implied(g);
    for (const [side, other, home] of [[g.home, g.away, true], [g.away, g.home, false]]) {
      const ros = rosters.get(side.id);
      if (!ros) continue;
      const team = todate.teams.get(side.id) || { games: 0, scored: 0, last: null };
      for (const [id, r] of ros) {
        const pos = POS_OF[r.pos];
        if (!pos) { dropped.noPos++; continue; }
        if (r.off) { dropped.off++; continue; }
        const s = todate.men.get(id);
        if (!s || !s.games) { dropped.noGames++; continue; }
        const lastPlayed = team.last && s.gids.has(team.last);
        men.push({
          player_id: id,
          name: r.name || s.name,
          position: pos,
          team: side.abbr, team_id: side.id,
          opp: other.abbr, opp_id: other.id, home,
          kick: g.kick, game_id: g.id,
          games: s.games, played_of: team.games || s.games,
          half_ppg: round(s.pts / s.games, 2),
          half_total: round(s.pts, 1),
          stat_line: playLine(s.stats),
          prior: priors.has(id) ? priors.get(id) : null,
          implied: imp ? round(home ? imp.home : imp.away, 1) : null,
          team_avg: team.games ? round(team.scored / team.games, 1) : null,
          year: r.year || null,
          /* WHO MISSED HIS TEAM'S LAST GAME. Not a ruling and not a guess about why: the
             box score of the last game his team played has no line for him, while he has
             played earlier in the season. The page says exactly that. */
          missed_last: team.last && !lastPlayed ? true : undefined,
          inj: r.inj || undefined,
        });
      }
    }
  }
  return { men, dropped };
}

/* ─── the build ───────────────────────────────────────────────────────────────────── */

/** The week about to be played: the first calendar week whose end has not passed. */
export async function nextWeek(season, now = Date.now()) {
  const sb = await scoreboardWeek(season, 1);
  const cal = calendarOf(sb);
  const w = cal.find((c) => Date.parse(c.end) > now);
  if (!w) throw new Error(`the ${season} calendar has no week left in it`);
  return w.week;
}

export async function buildPool({ season, week, now = Date.now() }) {
  const store = loadStore(season);
  const have = await fillBefore(store, week);
  saveStore(store);
  say(`${season} week ${week}: the season store holds weeks ${have.join(', ') || 'none'}`);

  const sb = await scoreboardWeek(season, week);
  if (!sb) throw new Error(`the week ${week} scoreboard could not be read`);
  const games = gamesOf(sb);
  const slate = pickSlate(games, now);
  if (slate.length < 10) {
    throw new Error(`only ${slate.length} games are left to play in week ${week}, `
      + 'which is not a slate. Build the next week.');
  }
  say(`slate: ${slate.length} of ${games.length} games`);
  for (const g of slate) {
    say(`  ${String(g.score).padStart(5)}  ${g.away.rank ? '#' + g.away.rank + ' ' : ''}`
      + `${g.away.school} at ${g.home.rank ? '#' + g.home.rank + ' ' : ''}${g.home.school}`
      + `  ${g.kick}  ${g.spread == null ? 'no line' : `spread ${g.spread}, total ${g.total}`}`);
  }

  const rosters = new Map();
  for (const g of slate) {
    for (const t of [g.home, g.away]) {
      if (rosters.has(t.id)) continue;
      const j = await roster(t.id);
      if (!j) throw new Error(`the ${t.school} roster could not be read`);
      rosters.set(t.id, rosterOf(j));
    }
  }

  const todate = seasonToDate(store, week, STAT_KEYS);
  const rows = JSON.parse(fs.readFileSync(path.join(DATA, '..', 'cfb_player_seasons.json'), 'utf8'));
  const priors = priorsFrom(rows, season);
  const { men, dropped } = buildMen(slate, rosters, todate, priors);
  say(`men: ${men.length} on the board; dropped ${dropped.off} out or suspended, `
    + `${dropped.noGames} who have not played, ${dropped.noPos} at other positions`);
  for (const pos of POSITIONS) {
    const n = men.filter((m) => m.position === pos).length;
    if (!n) throw new Error(`the board has no ${pos}`);
  }

  const levels = positionLevels(men);
  for (const m of men) Object.assign(m, projectMan(m, levels));
  const priced = pricePool(men);
  men.sort((a, b) => b.price_musd - a.price_musd || b.proj - a.proj);

  const { cap, table } = sweepCap(men);
  say('cap sweep (projected points, 300 lineups a bot):');
  say('   cap   greedy   budget    gap   stranded');
  for (const r of table) {
    say(`  ${String(r.cap).padStart(4)}  ${r.greedy.toFixed(1).padStart(7)}  `
      + `${r.budget.toFixed(1).padStart(7)}  ${r.gap.toFixed(1).padStart(5)}  `
      + `${String(r.stranded).padStart(8)}${r.cap === cap ? '   <- the cap' : ''}`);
  }

  const locks = slate.map((g) => g.kick).sort()[0];
  return {
    season, week,
    built: new Date(now).toISOString(),
    locks_at: new Date(Date.parse(locks)).toISOString(),
    cap_musd: cap,
    swap: { pct: SWAP_PCT, floor_musd: SWAP_FLOOR_MUSD },
    baseline: priced.baseline,
    games: slate.map((g) => ({
      id: g.id, kick: g.kick, neutral: g.neutral, score: g.score,
      spread: g.spread, total: g.total, tv: g.tv,
      home: g.home, away: g.away,
    })),
    pool: men,
  };
}

export function writePool(pool) {
  fs.mkdirSync(DATA, { recursive: true });
  const name = `pool_${pool.season}_w${pool.week}.json`;
  /* One man a line, for a diff somebody can read. */
  const head = { ...pool };
  delete head.pool;
  const text = JSON.stringify(head, null, 1).replace(/\n}$/, ',\n "pool": [\n')
    + pool.pool.map((m) => '  ' + JSON.stringify(m)).join(',\n') + '\n ]\n}\n';
  fs.writeFileSync(path.join(DATA, name), text);
  /* THE POINTER ONLY GOES FORWARD, which is the NFL build's lesson: building an old week to
     look at it must never repoint the live mode backwards. */
  const nowFile = path.join(DATA, 'now.json');
  const cur = fs.existsSync(nowFile) ? JSON.parse(fs.readFileSync(nowFile, 'utf8')) : null;
  const ahead = !cur || pool.season > cur.season
    || (pool.season === cur.season && pool.week >= cur.week);
  if (ahead) {
    fs.writeFileSync(nowFile, JSON.stringify({
      season: pool.season, week: pool.week, file: name, locks_at: pool.locks_at,
    }) + '\n');
  }
  return { name, pointer: ahead };
}

/* ─── cli ─────────────────────────────────────────────────────────────────────────── */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('pool.mjs')) {
  const season = Number(arg('--season', String(new Date().getUTCFullYear())));
  const week = arg('--week', null) ? Number(arg('--week')) : await nextWeek(season);
  const pool = await buildPool({ season, week });
  const top = pool.pool.slice(0, 8).map((m) => `${m.name} ${m.position} $${m.price_musd}M `
    + `proj ${m.proj}`).join('\n  ');
  say(`\n${pool.pool.length} men, cap $${pool.cap_musd}M, locks ${pool.locks_at}\n  ${top}`);
  if (process.argv.includes('--write')) {
    const w = writePool(pool);
    say(`wrote ${w.name}${w.pointer ? ' and moved now.json to it' : ''}`);
  }
}
