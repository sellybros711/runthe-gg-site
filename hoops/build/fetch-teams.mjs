/* Franchise data: who these clubs are, where they play, and what they have won.
 *
 *   node hoops/build/fetch-teams.mjs
 *
 * Writes hoops/data/teams.json. Runs from anywhere, including the development
 * sandbox, which makes it the one piece of the pipeline that is not waiting on
 * a CI run.
 *
 * ── THE SOURCE ─────────────────────────────────────────────────────────────
 *
 * The static franchise table shipped inside nba_api, an MIT-licensed Python
 * client for the NBA's own stats endpoints, read from raw.githubusercontent.com.
 * The endpoints themselves are blocked from here AND block GitHub's runners
 * (scripts/fetch-rosterstats.mjs documents that the hard way), but this table is
 * a checked-in file rather than a call, so it is reachable and stable.
 *
 * ── THE PART THAT NEEDS CARE: TWO SETS OF ABBREVIATIONS ────────────────────
 *
 * NBA.com and Basketball-Reference do not agree on team codes. Brooklyn is BKN
 * to one and BRK to the other; Phoenix is PHX and PHO; Charlotte is CHA and CHO.
 * Every player in this game arrives keyed on the BBRef code, because that is
 * where the player data comes from, so the franchise table has to be keyed the
 * same way or the join silently misses three clubs.
 *
 * ── AND THE PART THIS SOURCE CANNOT ANSWER ─────────────────────────────────
 *
 * It lists the THIRTY CLUBS THAT EXIST NOW. A 1995 roster belongs to the
 * Vancouver Grizzlies, a 1985 roster to the Kansas City Kings, and neither is in
 * a table of current franchises. This game draws from 1974 onward, so those
 * codes turn up constantly, and printing a 1995 Seattle roster as "Oklahoma City
 * Thunder" would be wrong in a way basketball fans would notice immediately.
 *
 * So the defunct codes are carried here by hand, marked, and pointed at the
 * franchise they became. They are history rather than data that can be fetched.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', 'data');

const SOURCE = 'https://raw.githubusercontent.com/swar/nba_api/master/src/nba_api/stats/library/data.py';

/* NBA.com code to Basketball-Reference code, for the three that disagree. */
const TO_BBREF = { BKN: 'BRK', PHX: 'PHO', CHA: 'CHO' };

/* Clubs that no longer exist under that name, and what they became. Every one
   of these is drawable in this game, so every one has to print correctly. */
const DEFUNCT = {
  SEA: { city: 'Seattle', name: 'SuperSonics', from: 1967, to: 2008, became: 'OKC' },
  VAN: { city: 'Vancouver', name: 'Grizzlies', from: 1995, to: 2001, became: 'MEM' },
  NJN: { city: 'New Jersey', name: 'Nets', from: 1977, to: 2012, became: 'BRK' },
  NYN: { city: 'New York', name: 'Nets', from: 1968, to: 1977, became: 'BRK' },
  WSB: { city: 'Washington', name: 'Bullets', from: 1974, to: 1997, became: 'WAS' },
  CAP: { city: 'Capital', name: 'Bullets', from: 1973, to: 1974, became: 'WAS' },
  BAL: { city: 'Baltimore', name: 'Bullets', from: 1963, to: 1973, became: 'WAS' },
  KCK: { city: 'Kansas City', name: 'Kings', from: 1975, to: 1985, became: 'SAC' },
  KCO: { city: 'Kansas City-Omaha', name: 'Kings', from: 1972, to: 1975, became: 'SAC' },
  CIN: { city: 'Cincinnati', name: 'Royals', from: 1957, to: 1972, became: 'SAC' },
  SDC: { city: 'San Diego', name: 'Clippers', from: 1978, to: 1984, became: 'LAC' },
  BUF: { city: 'Buffalo', name: 'Braves', from: 1970, to: 1978, became: 'LAC' },
  NOH: { city: 'New Orleans', name: 'Hornets', from: 2002, to: 2013, became: 'NOP' },
  NOK: { city: 'New Orleans/Oklahoma City', name: 'Hornets', from: 2005, to: 2007, became: 'NOP' },
  CHH: { city: 'Charlotte', name: 'Hornets', from: 1988, to: 2002, became: 'NOP' },
  SFW: { city: 'San Francisco', name: 'Warriors', from: 1962, to: 1971, became: 'GSW' },
  STL: { city: 'St. Louis', name: 'Hawks', from: 1955, to: 1968, became: 'ATL' },
  SDR: { city: 'San Diego', name: 'Rockets', from: 1967, to: 1971, became: 'HOU' },
  NOJ: { city: 'New Orleans', name: 'Jazz', from: 1974, to: 1979, became: 'UTA' },
};

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) {
    console.error(`Could not read the franchise table: HTTP ${res.status}`);
    console.error(SOURCE);
    process.exit(1);
  }
  const src = await res.text();

  const m = /^teams\s*=\s*(\[[\s\S]*?\n\])\s*$/m.exec(src);
  if (!m) {
    console.error('The teams array is not where it was in nba_api/stats/library/data.py.');
    console.error('That file is generated upstream, so its shape can move. Read it and fix');
    console.error('this parser rather than guessing: the fields are documented as');
    console.error('team_index_id, _abbreviation, _nickname, _year_founded, _city, _full_name,');
    console.error('_state, _championship_year at the top of the same file.');
    process.exit(1);
  }

  /* A Python list of lists of numbers, strings and nested lists, which is JSON
     except for one thing: it is formatted by a Python formatter, so it carries
     TRAILING COMMAS before every closing bracket. JSON.parse refuses those.
     Stripping them is the whole conversion, and it is done with a regex rather
     than an interpreter because the alternative is evaluating a remote file. */
  const json = m[1].replace(/,(\s*[\]}])/g, '$1');
  let rows;
  try {
    rows = JSON.parse(json);
  } catch (err) {
    console.error(`The teams array did not parse: ${err.message}`);
    console.error('It is a Python literal from a generated file, so its formatting can move.');
    process.exit(1);
  }

  const teams = {};
  for (const [id, abbr, nickname, founded, city, fullName, state, titles] of rows) {
    const code = TO_BBREF[abbr] || abbr;
    teams[code] = {
      code,
      nbaCode: abbr,
      city,
      name: nickname,
      full: fullName,
      state,
      founded,
      titles: Array.isArray(titles) ? titles : [],
      current: true,
    };
  }

  for (const [code, d] of Object.entries(DEFUNCT)) {
    if (teams[code]) continue;                 // a current club already owns it
    teams[code] = {
      code,
      city: d.city,
      name: d.name,
      full: `${d.city} ${d.name}`,
      founded: d.from,
      folded: d.to,
      became: d.became,
      titles: [],
      current: false,
    };
  }

  if (Object.keys(teams).length < 30) {
    console.error(`Only ${Object.keys(teams).length} franchises came back. Expected at least 30.`);
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = path.join(DATA_DIR, 'teams.json');
  fs.writeFileSync(out, JSON.stringify({
    _source: 'Franchise table from nba_api (MIT), keyed to Basketball-Reference codes. '
      + 'Defunct franchises are carried by hand: a table of current clubs cannot name the '
      + '1995 Vancouver Grizzlies.',
    teams,
  }, null, 1) + '\n');

  const current = Object.values(teams).filter(t => t.current).length;
  const titled = Object.values(teams).filter(t => t.titles.length).length;
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
  console.log(`  ${current} current franchises, ${Object.keys(teams).length - current} historical`);
  console.log(`  ${titled} of them have won a title`);
  const most = Object.values(teams).sort((a, b) => b.titles.length - a.titles.length)[0];
  console.log(`  most decorated: ${most.full}, ${most.titles.length}`);
}

main();
