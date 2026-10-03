/* The real ratings and the real pay of every man on today's rosters.
 *
 *   node hoops/build/fetch-ratings.mjs           write hoops/data/ratings.json
 *   node hoops/build/fetch-ratings.mjs --dry     say what would be written
 *
 * WHY THIS EXISTS. A Career is played in the real league, and a teammate's
 * overall used to be read off his box scores by our own model. That model
 * squeezes the stars together: it called Victor Wembanyama an 82 and put
 * Domantas Sabonis above Giannis Antetokounmpo. Reported by the owner, who
 * asked for the ratings fans already know, on a scale that runs to 99, and
 * for every salary to be the real one.
 *
 * Two published files, both on raw.githubusercontent.com, which is the one
 * host the development sandbox and a runner can both reach:
 *
 *   RATINGS   NBA 2K27 overalls, every current player rated 75 or better,
 *             gathered from 2KRatings. A man under 75 is not in it, and the
 *             game reads his overall off his box scores, held under 75.
 *   SALARIES  every 2026-27 salary.
 *
 * Both are joined to rosters.json by NAME, because neither carries a
 * Basketball-Reference id. A name is folded (accents, punctuation and a
 * Jr. or III dropped), then ALIASES catches the few men two sources spell
 * differently. A name that still matches nobody is printed, never guessed.
 *
 * NO CLOCK IN THE FILE, for the injury file's reason: a timestamp would make
 * every run a change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'ratings.json');
const ROSTERS = path.join(HERE, '..', 'data', 'rosters.json');
const RATINGS = 'https://raw.githubusercontent.com/nashwanwahid672-commits/2kdle/main/scripts/source/players.csv';
const SALARIES = 'https://raw.githubusercontent.com/Saltman00/NBA-salary-analysis/main/data/nba_salaries_2026_27.csv';

/* Two spellings of one man. Keyed on the folded source spelling, the value is
   the folded roster spelling. */
const ALIASES = {
  nicolasclaxton: 'nicclaxton',
  alexandresarr: 'alexsarr',
  jakobpoltl: 'jakobpoeltl',
  carltoncarrington: 'bubcarrington',
};

export function fold(name) {
  const s = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
  return ALIASES[s] || s;
}

/* A CSV line with quoted fields. */
export function csvRow(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function table(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = csvRow(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => { const r = csvRow(l), o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
}

/* Join both tables onto the rosters. Pure, so check-career can run it on
   saved text with no network. */
export function joinRatings(rosters, ratingsCsv, salariesCsv) {
  const ids = {};
  for (const c in rosters.clubs) for (const m of rosters.clubs[c]) (ids[fold(m.n)] = ids[fold(m.n)] || []).push(m.i);
  const men = {}, missed = { ovr: [], pay: [] };
  for (const r of table(ratingsCsv)) {
    const o = Number(r.ovr), k = fold(r.name);
    if (!(o >= 40 && o <= 99)) continue;
    const hit = ids[k];
    if (!hit || hit.length !== 1) { missed.ovr.push(r.name); continue; }
    (men[hit[0]] = men[hit[0]] || {}).o = o;
  }
  for (const r of table(salariesCsv)) {
    const pay = Number(r.salary), k = fold(r.player_name);
    if (!(pay > 0)) continue;
    const hit = ids[k];
    if (!hit || hit.length !== 1) { missed.pay.push(r.player_name); continue; }
    (men[hit[0]] = men[hit[0]] || {}).p = Math.round(pay / 1e5) / 10;
  }
  const sorted = {};
  for (const k of Object.keys(men).sort()) sorted[k] = men[k];
  return { season: rosters.season, men: sorted, missed };
}

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' answered ' + r.status);
  return r.text();
}

async function main() {
  const rosters = JSON.parse(fs.readFileSync(ROSTERS, 'utf8'));
  const [rt, sl] = await Promise.all([get(RATINGS), get(SALARIES)]);
  const { season, men, missed } = joinRatings(rosters, rt, sl);
  const n = Object.keys(men).length;
  const rated = Object.values(men).filter((m) => m.o).length, paid = Object.values(men).filter((m) => m.p).length;
  console.log(`season ${season}: ${rated} rated, ${paid} paid, ${n} men`);
  if (missed.ovr.length) console.log('ratings matched nobody: ' + missed.ovr.join(', '));
  if (missed.pay.length) console.log('salaries matched nobody (' + missed.pay.length + '): ' + missed.pay.slice(0, 30).join(', '));
  /* A join that matched nobody is the one way this fails without an error. */
  if (rated < 150 || paid < 250) throw new Error('too few men matched; refusing to write');
  const body = JSON.stringify({ season, sources: { ratings: RATINGS, salaries: SALARIES }, men }) + '\n';
  if (process.argv.includes('--dry')) return;
  fs.writeFileSync(OUT, body);
  console.log('wrote ' + path.relative(process.cwd(), OUT));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
