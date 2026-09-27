/* WHO CANNOT PLAY THIS WEEK, as well as college football lets anybody know.
 *
 *   node cfb/build/fantasy/injuries.mjs            what it would write for the live week
 *   node cfb/build/fantasy/injuries.mjs --write    and write it
 *
 * Writes cfb/data/fantasy/injuries_<season>_w<week>.json, which the page merges over the
 * board. It is a file of its own for the NFL mode's reason: a price may never move once
 * anybody has drafted against it, and who is hurt moves all week.
 *
 * ─── THERE IS NO LEAGUE WIDE REPORT, SO THERE ARE THREE SOURCES ─────────────────────
 *
 *   the roster     ESPN files a college roster in groups, and two of them are
 *                  `injuredReserveOrOut` and `suspended`. A man in either is OUT.
 *   the box score  a man who has played this season and has no line in his team's most
 *                  recent game MISSED it. That is a fact rather than a diagnosis, and the
 *                  page says only that.
 *   the site       cfb/data/fantasy/ruled_out.json, keyed "season-week", for a man the
 *                  owner knows is out before any feed does. Name and id both, and both must
 *                  match the board, or this throws: a transposed digit rules out the wrong
 *                  man in silence.
 *
 * AND THE ENTRANT CAN ALWAYS SWAP HIM THEMSELVES, which is the owner's answer to the gap:
 * any man in a lineup can be swapped until his game kicks off (128's `cfb_fantasy_swap`).
 * This file is what makes the page able to SAY why somebody might want to.
 *
 * THE FILE CARRIES NO CLOCK. A timestamp written on every run makes every run a change, and
 * the job commits only on a change (the NFL injury file's own lesson).
 */
import fs from 'node:fs';
import path from 'node:path';
import { roster, rosterOf } from './espn.mjs';
import { DATA } from './season.mjs';

const say = (...a) => process.stderr.write(a.join(' ') + '\n');

export function readRulings(season, week, pool) {
  const f = path.join(DATA, 'ruled_out.json');
  if (!fs.existsSync(f)) return [];
  const all = JSON.parse(fs.readFileSync(f, 'utf8'));
  const list = all[`${season}-${week}`] || [];
  const byId = new Map(pool.map((m) => [m.player_id, m]));
  for (const r of list) {
    const m = byId.get(String(r.id));
    if (!m) throw new Error(`ruled_out.json names ${r.id} (${r.name}), who is not on the board`);
    if (m.name !== r.name) {
      throw new Error(`ruled_out.json says ${r.id} is ${r.name}, and the board says ${m.name}`);
    }
  }
  return list;
}

/** The report, off the pool and a fresh read of every slate team's roster. */
export function buildReport(pool, rosters, rulings) {
  const men = {};
  for (const m of pool.pool) {
    const r = rosters.get(m.team_id) && rosters.get(m.team_id).get(m.player_id);
    if (r && r.off) {
      men[m.player_id] = { st: r.off, d: r.inj && r.inj.detail || null };
    } else if (r && r.inj && /out/i.test(String(r.inj.status || ''))) {
      men[m.player_id] = { st: 'out', d: r.inj.detail || null };
    } else if (m.missed_last) {
      men[m.player_id] = { st: 'missed' };
    }
  }
  for (const r of rulings) men[String(r.id)] = { st: 'out', by: 'site', d: r.note || null };
  const counts = {};
  for (const v of Object.values(men)) counts[v.st] = (counts[v.st] || 0) + 1;
  return { season: pool.season, week: pool.week, men, counts };
}

if (process.argv[1] && process.argv[1].endsWith('injuries.mjs')) {
  const now = JSON.parse(fs.readFileSync(path.join(DATA, 'now.json'), 'utf8'));
  const pool = JSON.parse(fs.readFileSync(path.join(DATA, now.file), 'utf8'));
  const rosters = new Map();
  for (const tid of new Set(pool.pool.map((m) => m.team_id))) {
    const j = await roster(tid);
    /* A roster that cannot be read keeps last time's answer rather than clearing it. */
    if (j) rosters.set(tid, rosterOf(j));
  }
  const report = buildReport(pool, rosters, readRulings(pool.season, pool.week, pool));
  const out = path.join(DATA, `injuries_${pool.season}_w${pool.week}.json`);
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  if (prev && rosters.size < new Set(pool.pool.map((m) => m.team_id)).size) {
    /* Keep the rulings for teams we could not read. */
    for (const [id, v] of Object.entries(prev.men || {})) {
      const m = pool.pool.find((x) => x.player_id === id);
      if (m && !rosters.has(m.team_id) && !report.men[id]) report.men[id] = v;
    }
  }
  say(`${pool.season} week ${pool.week}: ${rosters.size} rosters read, `
    + `${JSON.stringify(report.counts)}`);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(out, JSON.stringify(report) + '\n');
    say(`wrote ${path.basename(out)}`);
  }
}
