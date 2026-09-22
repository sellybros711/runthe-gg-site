/* WHO CANNOT PLAY THIS WEEK, AND WHO MIGHT NOT.
 *
 *   node football/build/injuries.mjs                    the live week, as a report
 *   node football/build/injuries.mjs --write            and write the file the page reads
 *   node football/build/injuries.mjs --season 2026 --week 3
 *
 * Writes `football/data/injuries_<season>_w<week>.json`.
 *
 * ─── IT IS ITS OWN FILE BECAUSE IT MOVES AND THE PRICES MUST NOT ────────────────────
 *
 * The board is built on the Tuesday and a price may never move once anybody has drafted
 * against it. An injury is the opposite: the game status report for a Sunday game lands on
 * the WEDNESDAY, firms up on the Thursday and is final on the Friday, and a man goes on
 * injured reserve whenever his club files it. So the two cannot live in one file. This one
 * is rebuilt as often as it is worth rebuilding and carries no prices at all; the page
 * merges it over the pool it already has.
 *
 * ─── TWO SOURCES, AND THEY ANSWER TWO DIFFERENT QUESTIONS ───────────────────────────
 *
 *   the roster   `players.csv`. Is he on an active roster at all? A man on injured
 *                reserve, on the physically unable to perform list, suspended, retired or
 *                cut is not a player this week in the way a man with a bad hamstring is:
 *                there is no decision to make about him and no news to read. He comes OFF
 *                THE BOARD ENTIRELY, the same way a man on a bye is not on it.
 *
 *   the report   `injuries.csv`, which is the official NFL game status report. Out,
 *                Doubtful or Questionable, the body part, and whether he practised. This
 *                is THIS WEEK'S NEWS and it is what a drafter is actually deciding on, so
 *                none of it is hidden: it goes on the board, on the row, in red.
 *
 * Measured on the live week 3 board: 13 of the 408 priced men are not on an active roster
 * (A.J. Brown and Jordan Mason both on reserve), and 10 more carry an Out or Doubtful
 * designation. Nico Collins was ruled out in week 2 with a hamstring and the wheel was
 * offering him at $8.5M, which is what a player reported.
 *
 * ─── THE WEEK'S REPORT DOES NOT EXIST ON THE TUESDAY, AND THAT IS NOT AN ERROR ──────
 *
 * The file carries `report_week`, which is the latest week the report actually covers, and
 * it is allowed to be behind the week being played. On the Tuesday it always is. What the
 * page does with a designation from last week is show it and SAY which week it is from: a
 * man ruled out on Sunday is the best available answer about next Sunday until Wednesday,
 * and pretending otherwise would be inventing a clean sheet nobody has.
 *
 * ─── AND IT IS NOT A NEWS FEED ──────────────────────────────────────────────────────
 *
 * What a tap on the red chip opens is the injury REPORT: the designation, the body part
 * and the practice participation, which is the thing clubs are obliged to publish and the
 * thing every fantasy site is reading when it tells you a man is questionable. It is not a
 * beat writer's paragraph. Writing one of those would need a news feed, and the two that
 * would serve (ESPN and the wire services) are refused by this machine's egress proxy, so
 * nothing here could have been verified against them. Said plainly rather than shipped as
 * a sentence that looks like reporting.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, nflverseCSV, parseCSVObjects } from './lib.mjs';

/* ─── who counts as being on a roster ──────────────────────────────────────────────── */

/*
 * ACT is the active roster and DEV is the practice squad, whose men really do play: every
 * one of them in this pool has already scored fantasy points this season, which can only
 * have happened on a gameday elevation. So DEV is a bad pick rather than an impossible one
 * and the board leaves that to the reader.
 *
 * EVERYTHING ELSE MEANS HE CANNOT BE SELECTED. RES is injured reserve, PUP is physically
 * unable to perform, NFI is non-football injury, SUS is suspended, CUT is not on a team at
 * all, RET has retired. None of those is a decision and none of them has news to read.
 */
export const ROSTER_OK = new Set(['ACT', 'DEV']);

/** Out, Doubtful, Questionable, or on the report with no designation. */
const DESIGNATION = { out: 'out', doubtful: 'doubtful', questionable: 'questionable' };
const designationOf = (s) => {
  const t = String(s || '').trim().toLowerCase();
  return DESIGNATION[t] || (t ? null : null);
};

/* A practice line is one of three phrases and the short form is what fits on a sheet. */
const PRACTICE = [
  [/did not participate/i, 'Did not practise'],
  [/limited/i, 'Limited in practice'],
  [/full/i, 'Full practice'],
];
const practiceOf = (s) => {
  for (const [re, short] of PRACTICE) if (re.test(String(s || ''))) return short;
  return null;
};

/**
 * The latest report row for each player, and the latest week the report covers at all.
 *
 * KEYED ON `gsis_id`, WHICH IS THE POOL'S OWN `player_id`. No name matching anywhere: two
 * people share a name often enough that this repo keeps a checker about it, and a wrong
 * join here would put somebody else's hamstring on a fit man's row.
 */
export function latestReports(rows, season, week) {
  const last = new Map();
  let reportWeek = 0;
  for (const r of rows) {
    if (Number(r.season) !== season) continue;
    const w = Number(r.week);
    if (!Number.isFinite(w) || w > week) continue;      /* never read ahead */
    if (!r.gsis_id) continue;
    if (w > reportWeek) reportWeek = w;
    const prev = last.get(r.gsis_id);
    if (!prev || w > Number(prev.week)) last.set(r.gsis_id, r);
  }
  return { last, reportWeek };
}

/**
 * One entry a man, for every man the page needs to know something about.
 *
 * @param ids the player ids on this week's board. Everybody else is left out: the file is
 *            fetched by every visitor and there is no reason to ship four thousand rows to
 *            describe four hundred men.
 */
export function buildInjuries({ season, week, ids, injuries, players }) {
  const { last, reportWeek } = latestReports(injuries, season, week);
  const roster = new Map();
  for (const p of players) if (p.gsis_id) roster.set(p.gsis_id, p);

  const men = {};
  let off = 0, flagged = 0;
  for (const id of ids) {
    const p = roster.get(id);
    const status = p && p.status ? String(p.status).trim().toUpperCase() : '';
    /* NOT ON A ROSTER IS THE WHOLE ANSWER, and it outranks any designation: a man on
       injured reserve is not questionable, he is unavailable. */
    if (status && !ROSTER_OK.has(status)) {
      men[id] = { st: 'off', roster: status };
      off++;
      continue;
    }
    const r = last.get(id);
    if (!r) continue;
    const st = designationOf(r.report_status);
    const d = (r.report_primary_injury || r.practice_primary_injury || '').trim();
    const d2 = (r.report_secondary_injury || r.practice_secondary_injury || '').trim();
    const pr = practiceOf(r.practice_status);
    /*
     * ON THE REPORT WITH NO DESIGNATION AND A FULL PRACTICE IS A CLEARED MAN, and he is
     * left out entirely rather than shipped with a quiet chip on him.
     *
     * MEASURED: 55 of the priced men carry a report row with no designation, and 45 of
     * those practised in FULL. That is one man in nine on the board wearing a mark that
     * means "he was on the report and he is fine", which is not a thing a drafter can act
     * on and is eleven percent of every board carrying a warning. The ten who did not
     * practise fully are the ones worth a chip: no designation has been filed yet and he is
     * not training, which on a Tuesday is the most useful thing the report has to say.
     *
     * A row nothing can draw is also a row nothing can open, so dropping it here rather
     * than hiding it in the page is what keeps the file the same size as its own meaning.
     */
    if (!st && (!d || /full/i.test(String(r.practice_status || '')))) continue;
    men[id] = { st: st || 'none', w: Number(r.week) };
    if (d) men[id].d = d;
    if (d2) men[id].d2 = d2;
    if (pr) men[id].p = pr;
    if (st) flagged++;
  }
  return {
    season, week,
    /* The latest week the REPORT covers, which on a Tuesday is the week before. The page
       says so rather than implying a designation is about the coming Sunday. */
    report_week: reportWeek || null,
    built: new Date().toISOString(),
    source: 'nflverse injuries and players',
    men,
    counts: { off, flagged, known: Object.keys(men).length },
  };
}

/* ─── cli ──────────────────────────────────────────────────────────────────────────── */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('injuries.mjs')) {
  const now = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fantasy_now.json'), 'utf8'));
  const season = Number(arg('--season', now.season));
  const week = Number(arg('--week', now.week));
  const poolFile = path.join(DATA_DIR, `weekly_${season}_w${week}.json`);
  if (!fs.existsSync(poolFile)) {
    console.error(`no pool for ${season} week ${week}. Build it first.`);
    process.exit(1);
  }
  const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8')).pool;
  const ids = pool.map((m) => m.player_id);

  /* FRESH, ALWAYS, and this is the file where that matters most. A cached injury report is
     a report from before the thing that put somebody on it, and the whole point of the
     file is that it is newer than the board. */
  const fresh = { maxAgeMs: 0 };
  const injuries = parseCSVObjects(
    await nflverseCSV('injuries', `injuries_${season}.csv`, fresh));
  const players = parseCSVObjects(await nflverseCSV('players', 'players.csv', fresh));

  const out = buildInjuries({ season, week, ids, injuries, players });
  const byId = new Map(pool.map((m) => [m.player_id, m]));
  const line = (id) => {
    const m = byId.get(id), e = out.men[id];
    return `  $${String(m.price_musd).padStart(5)} ${m.position} ${m.name.padEnd(22)}`
      + ` ${e.st === 'off' ? e.roster : e.st + (e.w === week ? '' : ' (week ' + e.w + ')')}`
      + (e.d ? ' · ' + e.d : '');
  };
  const keys = Object.keys(out.men)
    .sort((a, b) => byId.get(b).price_musd - byId.get(a).price_musd);
  console.error(`${season} week ${week}: the report covers week ${out.report_week}`
    + (out.report_week === week ? '' : ' (this week has not been filed yet)'));
  console.error(`  ${out.counts.off} off the board, ${out.counts.flagged} designated,`
    + ` ${out.counts.known} known of ${ids.length}`);
  for (const id of keys.filter((k) => out.men[k].st === 'off')) console.error(line(id));
  for (const id of keys.filter((k) => out.men[k].st === 'out'
    || out.men[k].st === 'doubtful')) console.error(line(id));

  if (process.argv.includes('--write')) {
    const f = path.join(DATA_DIR, `injuries_${season}_w${week}.json`);
    fs.writeFileSync(f, JSON.stringify(out));
    console.error(`  wrote ${path.basename(f)} (${(fs.statSync(f).size / 1024).toFixed(1)}KB)`);
  }
}
