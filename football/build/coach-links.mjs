/*
 * Where a coach was a head coach in COLLEGE, for Full Team's coach chemistry.
 *
 *   node football/build/coach-links.mjs
 *
 * Writes football/data/coach_colleges.json. Reads only files already in this repo, so it
 * needs no network and can be re-run any time the coach or roster data is rebuilt.
 *
 * FULL TEAM GIVES A COACH TWO WAYS TO KNOW A PLAYER, and only one of them needs a file:
 *
 *   coached him   the player's team-season was coached by this man. That is a join between
 *                 two things the PAGE ALREADY HAS: coaches.json names the head coach of all
 *                 861 NFL team-seasons, and every player row carries its team_season_id. So
 *                 it costs nothing to ship and this file must not contain it. The first
 *                 version did, as 26,397 "player|season" strings, and weighed 471 KB to say
 *                 something the browser could work out from 37 KB it had already downloaded.
 *
 *   his college   the man was a head coach at the school the player attended. This is the
 *                 half nothing on the page knows: it comes out of the COLLEGE game's data,
 *                 cfb_coaches.json joined to cfb_team_seasons.json, which is the only place
 *                 in this repo that records anybody coaching in college at all.
 *
 * So the file is the second link and nothing else, and it is a couple of kilobytes.
 *
 * WHAT IS NOT HERE, deliberately: assistant and coordinator jobs, and any college post that
 * predates the college data. A link this file cannot prove is a link it does not claim,
 * because the failure mode is telling somebody a false thing about a real person.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const nflCoaches = rd('football/data/coaches.json');
const cfbCoaches = rd('cfb/data/cfb_coaches.json');
const cfbSeasons = rd('cfb/data/cfb_team_seasons.json');

/* ---- where he was a head coach in college ---- */
const schoolOf = {};
for (const t of cfbSeasons) schoolOf[t.team_season_id] = t.school;
const colleges = {};                        // coach -> Set of school names
for (const id in cfbCoaches) {
  const hc = cfbCoaches[id] && cfbCoaches[id].hc;
  const school = schoolOf[id];
  if (!hc || !school) continue;
  (colleges[hc] ??= new Set()).add(school);
}

/* Only coaches the football game can actually hire are worth carrying. */
const hireable = new Set();
for (const id in nflCoaches) if (nflCoaches[id] && nflCoaches[id].hc) hireable.add(nflCoaches[id].hc);

const out = {};
for (const name of [...hireable].sort()) {
  if (!colleges[name]) continue;
  out[name] = [...colleges[name]].sort();
}

const dest = path.join(root, 'football/data/coach_colleges.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 0));
const posts = Object.values(out).reduce((t, v) => t + v.length, 0);
console.log(`coach_colleges.json: ${Object.keys(out).length} coaches, ${posts} college postings`);
console.log(`  ${(fs.statSync(dest).size / 1024).toFixed(1)} KB`);
