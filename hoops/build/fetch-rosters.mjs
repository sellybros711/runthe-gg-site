/* The rosters a Career joins: every club as it stands today.
 *
 *   node hoops/build/fetch-rosters.mjs --season 2027
 *
 * WHY THIS EXISTS. hoops/data/players.json is finished seasons, and its newest
 * is the season that has ended. A career joins the NEXT one, so seeding it off
 * players.json put every club back where it was in April: no summer trades, no
 * free agents, no rookies, and the game then aged that roster a year by its own
 * rules and retired real veterans who are under contract and playing. Reported
 * by the owner. The league a player joins has to be the real one, and the
 * simulation takes over only after that season.
 *
 * So this reads each club's page for the season about to be played and writes
 * hoops/data/rosters.json: the men on the roster, their position, the year they
 * were born and their Basketball-Reference id, plus the club's head coach.
 * What a man is WORTH comes from players.json, joined on the id, so nothing here
 * invents a rating.
 *
 * Basketball-Reference is blocked from the development sandbox and open from
 * GitHub's runners, so this runs in .github/workflows/hoops-rosters.yml. The
 * parser is tested against saved markup in check-fetch.mjs, which is the only
 * way to know it works from here.
 *
 * NO CLOCK IN THE FILE. The workflow commits only when the file moves, and a
 * timestamp would move it on every run (the injury file's lesson).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bbrRows, cell, positions } from './fetch-nba.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data', 'rosters.json');
const BBR = 'https://www.basketball-reference.com';
const UA = 'RunTheGG/1.0 (+https://runthe.gg)';
const WAIT = Number(process.env.BBR_WAIT || 3200);

/* The thirty clubs, in Basketball-Reference's codes, which are the engine's. */
export const CLUBS = ['ATL', 'BOS', 'BRK', 'CHI', 'CHO', 'CLE', 'DET', 'IND', 'MIA', 'MIL',
  'NYK', 'ORL', 'PHI', 'TOR', 'WAS', 'DAL', 'DEN', 'GSW', 'HOU', 'LAC', 'LAL', 'MEM',
  'MIN', 'NOP', 'OKC', 'PHO', 'POR', 'SAC', 'SAS', 'UTA'];

/* SIGNINGS THE PAGES HAVE NOT CAUGHT UP WITH. A club page lists a man once he
   has signed, and a restricted free agent who signs late is on no page at all
   until somebody updates it, so a career would join a league without him.
   Reported by the owner: Jalen Duren re-signed with Detroit for five years and
   $200M and was in no club. Each row puts a man on his club (and off any
   other) and carries his salary for the season, because the salary file was
   written before he signed. Delete a row once the pages and the salary file
   both have him; until then it is applied to every refresh, here and in
   fetch-ratings.mjs. */
export const SIGNINGS = [
  { i: 'durenja01', n: 'Jalen Duren', pos: 'C', b: 2003, club: 'DET', pay: 40.0 },
];

/* Put every signing on its club, once. Pure, so a saved file can be patched
   with no network. */
export function applySignings(rosters) {
  for (const s of SIGNINGS) {
    if (!rosters.clubs[s.club]) continue;
    for (const c in rosters.clubs) rosters.clubs[c] = rosters.clubs[c].filter((m) => m.i !== s.i);
    rosters.clubs[s.club].push({ i: s.i, n: s.n, pos: s.pos, b: s.b });
  }
  return rosters;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    let throttled = false;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return r.text();
      if (r.status === 404) return null;
      if (r.status === 429) throttled = true;
      else if (r.status < 500) return null;
    } catch { /* retry */ }
    await sleep((throttled ? 8000 : 1500) * (i + 1));
  }
  return null;
}

/* The roster table on a club's season page, and the coach line above it.
   Read by data-stat name, never by column position. A two-way contract is
   kept and marked: those men are on the roster and can play. */
export function parseRoster(html) {
  const page = String(html || '');
  const t = /<table\b[^>]*\bid="roster"[\s\S]*?<\/table>/i.exec(page);
  const men = [];
  if (t) {
    for (const r of bbrRows(t[0])) {
      const raw = r.cells.player || '';
      const name = cell(r, 'player').replace(/\s*\((TW|10)\)\s*$/i, '').trim();
      if (!name) continue;
      const pos = (positions(cell(r, 'pos')) || ['SF'])[0];
      const by = /\b(19|20)\d\d\b/.exec(cell(r, 'birth_date'));
      men.push({ i: r.slug, n: name, pos, b: by ? +by[0] : null, ...(/\(TW\)/i.test(raw) ? { tw: 1 } : {}) });
    }
  }
  const co = /Coach:\s*<\/strong>\s*<a[^>]*>([^<]+)<\/a>/i.exec(page);
  return { men, coach: co ? co[1].trim() : null };
}

async function main() {
  const season = Number(arg('season', 0));
  if (!season) { console.error('Pass --season, the year the season ENDS (2027 is 2026-27).'); process.exit(1); }
  const clubs = {}, coaches = {}, thin = [];
  for (const c of CLUBS) {
    const html = await get(`${BBR}/teams/${c}/${season}.html`);
    await sleep(WAIT);
    const { men, coach } = parseRoster(html);
    console.log(`${c}: ${men.length} on the roster, coach ${coach || 'unknown'}`);
    if (men.length < 12 || men.length > 22) thin.push(`${c} has ${men.length}`);
    clubs[c] = men;
    if (coach) coaches[c] = coach;
  }
  /* A SILENT ZERO IS THE FAILURE THIS GUARD EXISTS FOR. A club page that did
     not parse reads exactly like a club with nobody on it, and a career would
     then join a league with a hole in it. Nothing is written. */
  if (thin.length) {
    console.error('\nRosters out of shape:\n  ' + thin.join('\n  '));
    console.error('A real NBA roster carries 13 to 18. Nothing was written.');
    process.exit(1);
  }
  /* ONE CLUB A MAN. A season page lists everybody who has been on the club
     this season, so a man moved in camp turns up on two pages, and nothing on
     either says which is current. He is kept on the first and the clash is
     recorded, which check-rosters holds to a handful: dozens would mean the
     pages are listing last season's men. */
  const seen = {}, twice = [];
  for (const c of CLUBS) clubs[c] = clubs[c].filter((m) => {
    if (seen[m.i]) { twice.push(m.n + ' (' + seen[m.i] + ', ' + c + ')'); return false; }
    seen[m.i] = c; return true;
  });
  if (twice.length) console.log('\nOn two pages, kept on the first: ' + twice.join('; '));
  const out = applySignings({ season, clubs, coaches, twice: twice.length });
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  const n = Object.values(clubs).reduce((s, l) => s + l.length, 0);
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}: ${n} players on 30 clubs for ${season - 1}-${String(season).slice(2)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--signings')) {
    /* Apply the table to the committed file, with no fetch. */
    const r = applySignings(JSON.parse(fs.readFileSync(OUT, 'utf8')));
    fs.writeFileSync(OUT, JSON.stringify(r) + '\n');
    console.log('Applied ' + SIGNINGS.length + ' signing(s) to ' + path.relative(process.cwd(), OUT));
  } else main();
}
