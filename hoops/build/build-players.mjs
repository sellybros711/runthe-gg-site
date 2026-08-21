/* Pricing, and the file the game actually loads.
 *
 *   node hoops/build/build-players.mjs            price the hand-entered seed
 *   node hoops/build/build-players.mjs --from raw/nba_player_seasons.json
 *
 * Reads one row per player-season, puts a price on every one of them, and
 * writes hoops/data/players.json. The seed and the real fetch both land here,
 * so pricing is decided in exactly one place no matter where the rows came
 * from, and a pipeline run cannot quietly reprice the league by accident.
 *
 * ── PRICE IS WHAT THE MARKET PAYS, NOT WHAT THE PLAYER IS WORTH ────────────
 *
 * This priced off win shares, which are also what the player is WORTH to the
 * team. Both at once is the one thing pricing must never be, and it quietly
 * removed the game from the game.
 *
 * If price is a monotone function of value then every player on the board is
 * exactly the same deal. There is no bargain to find and no trap to avoid, so
 * "take the best man available" is close to the optimal strategy, and it was:
 * measured across the whole cap range, a thoughtless draft and a perfect one
 * never separated by more than about six wins. The draft was a sequence of
 * clicks on the biggest number, which is what the cap comment claims to
 * prevent and did not.
 *
 * REAL BASKETBALL MARKETS PAY FOR THE BOX SCORE. They pay for POINTS above all,
 * then for the other things a fan sees in a highlight, and they systematically
 * underpay for efficiency, for defense and for rebounding. That is not a flaw
 * to model around, it is the single most familiar fact about NBA contracts, and
 * it is exactly the knowledge a basketball fan brings to a draft.
 *
 * So price comes off a MARKET SCORE built from the counting stats, and value
 * stays win shares. The two correlate at 0.755 rather than 1.000, and the
 * residual is the game. What falls out of the real data, without anybody
 * choosing it:
 *
 *   BARGAINS  Dennis Rodman 1990, Tyson Chandler 2012, Horace Grant 1992,
 *             Tristan Thompson 2016, Kevon Looney 2023. Every one of them a
 *             glue man who won something and never scored.
 *   TRAPS     Adam Morrison 2007, Emmanuel Mudiay 2016, Michael Beasley 2013,
 *             Scoot Henderson 2024. High usage, low efficiency, bad team.
 *
 * A fan who knows why the 1990 Pistons wanted Rodman can now beat somebody
 * clicking the biggest number, which is the entire point of the thing.
 *
 * ── WHY THE CURVE LOOKS LIKE THIS ──────────────────────────────────────────
 *
 * price = BASE + (MAX - BASE) * t^K, where t is how far a player's MARKET SCORE
 * sits between a bench player and the most famous season anyone has had.
 *
 * BOTH ENDS ARE PINNED whatever K is: the last man on the bench costs BASE and
 * the biggest name in the data costs MAX. So K only moves what the MIDDLE
 * costs, and the middle is where six slots on the cap actually shop.
 *
 * K IS ABOVE 1 ON PURPOSE, so a star costs more per unit than a role player.
 * That squeeze is now the SECOND decision in the draft rather than the only
 * one: on top of it sits the question of whether this particular name is being
 * paid for what he does or for what he scores.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { seedPlayerSeasons } from './seed-rosters.mjs';
import { AWARDS, AWARD_RANK } from './fetch-awards.mjs';

/* The engine owns the era-to-modern pace translation and there must not be a
   second copy of it. Required rather than imported because engine.js is the
   browser's script and stays CommonJS. */
const require = createRequire(import.meta.url);
const E = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'engine.js'));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', 'data');

export const PRICING = {
  BASE_MUSD: 2,
  MAX_MUSD: 60,
  K: 1.45,
  /* WHAT THE MARKET NOTICES, and roughly in what proportion. Points first and
     by a distance, then the rest of the line a fan can recite. These are not
     fitted to anything, because there is nothing honest to fit them to: no
     public number says "what an NBA front office overpays for". They are a
     stated opinion about how basketball is watched, and the test of them is the
     one in the header, that the bargains come out as glue men and the traps as
     volume scorers on bad teams. */
  WEIGHTS: { pts: 1.0, reb: 0.6, ast: 0.8, blk: 0.8, stl: 0.8 },
  /* Market score at each end of the scale. A real league runs from about 3 to
     50, so the floor is a genuine bench player and the ceiling is set at the
     99th percentile rather than the maximum: the handful of seasons above it
     all cost the max, which is right, because in a game with one price ceiling
     they are all simply "the most expensive man you can sign". */
  FLOOR_SCORE: 6,
  TOP_SCORE: 40,
};

/* PACE ADJUSTED, or this is an era tax rather than a market. A 1974 game had
   nineteen more possessions in it than a modern one, so the same player scores
   more in it, and pricing raw counting stats would make every player from the
   seventies expensive for reasons that have nothing to do with him. The engine
   already owns that translation and there is no second copy of it here. */
export function marketScore(row) {
  const W = PRICING.WEIGHTS;
  const at = (v) => E.paceAdjust(v || 0, row.s);
  return at(row.pts) * W.pts + at(row.reb) * W.reb + at(row.ast) * W.ast
    + at(row.blk) * W.blk + at(row.stl) * W.stl;
}

export function priceOf(row) {
  const P = PRICING;
  const span = P.TOP_SCORE - P.FLOOR_SCORE;
  const t = Math.max(0, Math.min(1, (marketScore(row) - P.FLOOR_SCORE) / span));
  const price = P.BASE_MUSD + (P.MAX_MUSD - P.BASE_MUSD) * Math.pow(t, P.K);
  return Math.round(price * 10) / 10;
}

/* A curated family whose ids are not in the data never fires, and a TYPO in one
   of those ids is exactly the same thing: silent. So every build says which
   families are live and which are waiting on players the data does not hold
   yet. Not an error, because most of them are waiting on a fuller dataset by
   design, but never invisible either. */
function reportCuratedChemistry(priced) {
  const file = path.join(DATA_DIR, 'chemistry.json');
  if (!fs.existsSync(file)) return;
  const have = new Set(priced.map((p) => p.i));
  const { families = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));

  const live = [];
  const waiting = [];
  for (const fam of families) {
    const present = (fam.ids || []).filter((id) => have.has(id));
    // A family needs two of its members present before any link can fire.
    if (present.length >= 2) live.push(`${fam.label} (${present.length})`);
    else waiting.push(fam.label);
  }

  console.log(`  chemistry: ${live.length} of ${families.length} curated families live`);
  if (live.length) console.log(`    live: ${live.join(', ')}`);
  if (waiting.length) console.log(`    waiting on data: ${waiting.length} more`);
}

function main() {
  const fromArg = process.argv.indexOf('--from');
  let rows, source;

  if (fromArg !== -1 && process.argv[fromArg + 1]) {
    const file = path.resolve(process.argv[fromArg + 1]);
    rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    source = path.relative(process.cwd(), file);
  } else {
    rows = seedPlayerSeasons();
    source = 'the hand-entered seed (hoops/build/seed-rosters.mjs)';
  }

  /* WHO IS WORTH PUTTING ON A BOARD.
   *
   * A real NBA season is about 500 player-seasons and most of them are men who
   * barely played. Fifty seasons of that is 25,000 rows, the large majority of
   * which are a fourth-string centre who appeared in nine games. Ship all of
   * them and two things break at once: the wheel spends most of its time on
   * players nobody has heard of, and the file the browser downloads triples for
   * the privilege.
   *
   * So a row has to clear a floor of real playing time. Twelve minutes a night
   * across twenty games is deliberately LOW: it keeps the last man in a real
   * rotation, who is exactly the sort of cheap useful player the cap needs to be
   * able to buy, and drops the man who was called up in March.
   *
   * The seed has no minutes on it at all and is exempt, which is the correct
   * behaviour rather than an oversight: 171 hand-entered rows are all rotation
   * players by construction.
   */
  const MIN_MPG = 12.0;
  const MIN_GAMES = 20;
  const before = rows.length;
  rows = rows.filter((r) => {
    if (typeof r.mp !== 'number') return true;          // the seed, which has none
    return r.mp >= MIN_MPG && (r.g || 0) >= MIN_GAMES;
  });
  if (rows.length !== before) {
    console.log(`  playing time floor: kept ${rows.length} of ${before} rows `
      + `(${MIN_MPG} mpg across ${MIN_GAMES} games)`);
  }

  /* ── WIN SHARES ARE A COUNTING STAT, AND NOT EVERY SEASON IS 82 GAMES ─────
   *
   * Four of the fifty-two seasons in this data were short. The 1999 lockout cut
   * the schedule to 50 games, the 2012 one to 66, COVID ended 2020 between 63
   * and 75 games depending on the club, and 2021 was 72. Win shares count wins
   * contributed, so a player in those years earns proportionally fewer of them
   * for exactly the same basketball.
   *
   * It shows up in the data as a cliff. The average team's best six is worth 34
   * win shares in a normal year and 21.2 in 1999, 26.3 in 2012, 26.7 in 2020
   * and 26.5 in 2021.
   *
   * Left alone that is not a rounding error, it is a whole category of player
   * the game quietly rates as mediocre. Allen Iverson's 1999 was an MVP-calibre
   * season and would arrive on the board looking like a rotation guard. A fan
   * who drew him would spot it immediately, and would be right.
   *
   * THIS GAME PLAYS 82 GAMES (CONSTANTS.REGULAR_SEASON_GAMES), so the honest
   * question a price and a rating answer is "what is this man worth over a
   * season", and the season in question is 82 games long. Normalizing to that
   * is the same move paceAdjust already makes for per-game stats against era:
   * put every player on the same terms before comparing them.
   *
   * PER CLUB, NOT PER SEASON, because 2020 genuinely differs by club: one team
   * played 63 games and another 75, so a single factor for that year would
   * under-correct one and over-correct the other. A club's schedule is read as
   * the most games any of its players managed, which is what a schedule is.
   *
   * What this deliberately does NOT do is reward missing games. The factor
   * comes from the CLUB's schedule, never the player's own appearances, so a
   * man who played 40 of 82 is still worth half a season and a man who played
   * 40 of 50 is not.
   */
  {
    const teamGames = new Map();
    for (const r of rows) {
      if (typeof r.g !== 'number') continue;
      const k = `${r.s}|${r.t}`;
      teamGames.set(k, Math.max(teamGames.get(k) || 0, r.g));
    }
    const FULL = 82;
    /* THE SHORTEST REAL SCHEDULE IS 50 GAMES, the 1999 lockout, and that is the
       floor rather than a cap on the factor. Capping the factor was the first
       attempt and it was wrong in the most embarrassing possible way: 82/50 is
       1.64, a cap of 1.45 clipped it, and the one season the whole correction
       exists for came out still short. The synthetic 50 game club landed at 5.4
       against the 6.0 it was built to match.

       A club below this floor has not played a short season, it has a broken
       row: BBRef served a partial table, or the games column moved. Scaling
       that by three would invent a superstar out of a parsing error, so it is
       left alone and reported instead. */
    const SHORTEST_REAL_SCHEDULE = 45;
    /* AND A CLUB THAT PLAYED 78 OR MORE HAD A FULL SCHEDULE, whatever its
       attendance sheet says. This started as `played >= FULL`, which assumed
       somebody on every club plays all 82, and in the modern game nobody does:
       the first real run normalized 2022, 2023 and 2025, which are ordinary 82
       game seasons, because their best-attended player rested a few nights.
       That inflated recent players by three or four percent, which is precisely
       the era bias this correction exists to remove, pointed the other way.

       Below 78 no amount of load management explains the gap and a real short
       schedule does: 1999 played 50, 2012 66, 2021 72, and 2020 between 63 and
       75 by club. Over-correcting invents value out of a rest day; under-
       correcting only leaves a player slightly cheap. */
    const FULL_ENOUGH = 78;
    const scaled = new Map();
    const suspect = [];
    for (const r of rows) {
      const played = teamGames.get(`${r.s}|${r.t}`);
      if (!played || played >= FULL_ENOUGH) continue;
      if (played < SHORTEST_REAL_SCHEDULE) {
        suspect.push(`${r.s} ${r.t} (${played} games)`);
        continue;
      }
      const factor = FULL / played;
      r.ow = Math.round(r.ow * factor * 10) / 10;
      r.dw = Math.round(r.dw * factor * 10) / 10;
      r.w = Math.round((r.ow + r.dw) * 10) / 10;
      scaled.set(r.s, (scaled.get(r.s) || 0) + 1);
    }
    if (scaled.size) {
      const worst = [...scaled.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      console.log(`  short seasons normalized to ${FULL} games: `
        + worst.map(([s, n]) => `${s} (${n} rows)`).join(', ')
        + (scaled.size > 6 ? `, and ${scaled.size - 6} more` : ''));
    }
    if (suspect.length) {
      const uniq = [...new Set(suspect)];
      console.log(`  NOT normalized, and worth a look: ${uniq.length} club-season(s) `
        + `claim fewer than ${SHORTEST_REAL_SCHEDULE} games, which no real NBA season has been.`);
      console.log(`    ${uniq.slice(0, 8).join(', ')}${uniq.length > 8 ? ', ...' : ''}`);
    }
  }

  /* Draft year and college, if the draft pass has been run. Neither is on a
     season page, so without this join both chemistry links that depend on them
     are permanently silent on real data. A player the draft pass never saw keeps
     whatever the source row had, which for the fetcher is null and for the seed
     is the hand-entered value. */
  const draftFile = path.join(HERE, 'raw', 'nba_draft.json');
  let draft = null;
  if (fs.existsSync(draftFile)) draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'));

  /* ── HARDWARE ────────────────────────────────────────────────────────────
   * Two sources, joined here rather than in the fetcher, because only one of
   * them is fetched at all.
   *
   * raw/nba_awards.json is the individual honours, keyed slug|season, from
   * fetch-awards.mjs. teams.json already knows every championship year, so the
   * ring is computed rather than downloaded: every man on a title roster gets
   * it, which is both true and the reason a role player on the 1996 Bulls is
   * worth recognising.
   *
   * E.wonTitle resolves the title to the code the club WORE that season. The
   * naive lookup put 1978 under WAS and 1979 under OKC, because a franchise
   * table files honours under the modern row, and those two rings joined to
   * nobody at all. */
  const awardsFile = path.join(HERE, 'raw', 'nba_awards.json');
  let awards = null;
  if (fs.existsSync(awardsFile)) awards = JSON.parse(fs.readFileSync(awardsFile, 'utf8'));
  const teamsFile = path.join(DATA_DIR, 'teams.json');
  if (fs.existsSync(teamsFile)) E.setTeams(JSON.parse(fs.readFileSync(teamsFile, 'utf8')));

  const priced = rows.map((row) => {
    const extra = draft && draft[row.i];
    const won = [...((awards && awards[`${row.i}|${row.s}`]) || [])];
    if (E.wonTitle(row.t, row.s)) won.push('ring');
    const out = {
      ...row,
      dr: row.dr ?? (extra ? extra.dr : null),
      col: row.col ?? (extra ? extra.col : null),
      p: priceOf(row),
    };
    /* SORTED BY PRESTIGE HERE, once, at build time. The page shows the best one
       on a tile and the whole list on a roster row, and doing the ordering in
       the browser would mean shipping the ranking table to every visitor and
       re-sorting 16,000 lists to render six of them. */
    if (won.length) {
      won.sort((a, b) => (AWARD_RANK[a] ?? 99) - (AWARD_RANK[b] ?? 99));
      out.aw = won;
    }
    /* Games played was an input to the playing-time floor above and is not read
       by anything at runtime. Every field in this file is downloaded by every
       visitor, so a field nobody uses is bytes on somebody's phone. Minutes
       stays: a draft board saying 34 a night is telling the reader something. */
    delete out.g;
    return out;
  });

  if (draft) {
    const withDraft = priced.filter(p => p.dr).length;
    const withCollege = priced.filter(p => p.col).length;
    console.log(`  joined the draft pass: ${withDraft} rows have a draft year, ${withCollege} a college`);
  } else {
    console.log('  no raw/nba_draft.json, so draft-class and alma-mater chemistry will be sparse.');
    console.log('  Run: node hoops/build/fetch-draft.mjs');
  }

  const rings = priced.filter(p => p.aw && p.aw.includes('ring')).length;
  if (awards) {
    const decorated = priced.filter(p => p.aw).length;
    const tally = {};
    for (const p of priced) for (const a of p.aw || []) tally[a] = (tally[a] || 0) + 1;
    console.log(`  joined the awards pass: ${decorated} rows carry hardware`);
    console.log('    ' + AWARDS.map(a => `${a.code} ${tally[a.code] || 0}`).join(' · '));
  } else {
    console.log(`  no raw/nba_awards.json, so the only hardware is the ${rings} rings from teams.json.`);
    console.log('  Run: node hoops/build/fetch-awards.mjs');
  }

  /* Sorted by season then team then price, so a diff between two builds reads
     as a list of what changed rather than as the whole file moving. */
  priced.sort((a, b) => a.s - b.s || a.t.localeCompare(b.t) || b.w - a.w);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = path.join(DATA_DIR, 'players.json');
  fs.writeFileSync(out, JSON.stringify(priced) + '\n');

  reportCuratedChemistry(priced);

  const teamSeasons = new Set(priced.map((p) => `${p.t}_${p.s}`));
  const prices = priced.map((p) => p.p).sort((a, b) => a - b);
  const at = (q) => prices[Math.floor((prices.length - 1) * q)];

  console.log(`Built ${path.relative(process.cwd(), out)} from ${source}`);
  console.log(`  ${priced.length} player-seasons across ${teamSeasons.size} team-seasons`);
  console.log(`  seasons ${Math.min(...priced.map(p => p.s))} to ${Math.max(...priced.map(p => p.s))}`);
  console.log(`  price: min $${at(0)}M · median $${at(0.5)}M · p90 $${at(0.9)}M · max $${at(1)}M`);
  console.log(`  a six-man roster of median players costs $${(at(0.5) * 6).toFixed(1)}M against a $145M cap`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
