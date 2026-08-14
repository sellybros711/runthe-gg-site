#!/usr/bin/env node
/* check-register.mjs — the register's parsers, against saved source markup.
 *
 * The first run of .github/workflows/player-register.yml fetched 56,335 players
 * and then loaded none of them: NBA came back empty because stats.nba.com
 * blocks GitHub's runners, and the CSV failed to COPY because an empty teams
 * cell reads as NULL. Both were invisible until a workflow run, because neither
 * Basketball-Reference nor Supabase is reachable from the dev sandbox.
 *
 * So the parsing is tested against fixtures instead: real BBRef row markup in
 * both the pre-2024 and current column shapes, and the CSV writer against the
 * cell that broke the load. A scrape that silently returns nothing fails here.
 *
 *   node scripts/check-register.mjs
 */
process.env.REGISTER_SELFTEST = '1';       // import the parsers, don't run the job
process.env.BBR_WAIT = '0';                // and don't throttle a stubbed fetch
const { _test } = await import('../scripts/build-register.mjs');
const { bbrRows, cell, links, posNBA, nameKey, csvCell, buildNBA, REG } = _test;

let pass = 0, fail = 0;
const bad = [];
function is(actual, expect, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expect);
  if (a === e) { pass++; return; }
  fail++; bad.push(`${what}\n      expected ${e}, got ${a}`);
}

/* ---------- the A-Z player index: who ever played ----------
 * Three rows as BBRef serves them: a retired swingman, a player still active
 * (bolded, which is the page's only "still playing" signal), and a transfer
 * with two colleges. The header row is in here too — it carries no player slug
 * and must not become a player. */
const INDEX = `
<table class="sortable stats_table" id="players">
<thead><tr><th data-stat="player">Player</th><th data-stat="year_min">From</th></tr></thead>
<tbody>
<tr><th scope="row" class="left" data-append-csv="abdelal01" data-stat="player"><a href="/players/a/abdelal01.html">Alaa Abdelnaby</a></th><td class="right" data-stat="year_min">1991</td><td class="right" data-stat="year_max">1995</td><td class="center" data-stat="pos">F-C</td><td class="right" data-stat="height">6-10</td><td class="left" data-stat="colleges"><a href="/friv/colleges.cgi?college=duke">Duke</a></td></tr>
<tr><th scope="row" class="left" data-append-csv="achiupr01" data-stat="player"><strong><a href="/players/a/achiupr01.html">Precious Achiuwa</a></strong></th><td class="right" data-stat="year_min">2021</td><td class="right" data-stat="year_max">2026</td><td class="center" data-stat="pos">F</td><td class="right" data-stat="height">6-8</td><td class="left" data-stat="colleges"><a href="/friv/colleges.cgi?college=memphis">Memphis</a></td></tr>
<tr><th scope="row" class="left" data-append-csv="adamsst01" data-stat="player"><a href="/players/a/adamsst01.html">Steven Adams</a></th><td class="right" data-stat="year_min">2014</td><td class="right" data-stat="year_max">2025</td><td class="center" data-stat="pos">C</td><td class="right" data-stat="height">6-11</td><td class="left" data-stat="colleges"><a href="/friv/colleges.cgi?college=pitt">Pittsburgh</a>, <a href="/friv/colleges.cgi?college=notredame">Notre Dame</a></td></tr>
</tbody></table>`;

const idx = bbrRows(INDEX);
is(idx.length, 3, 'index: three players, and the header row is not one of them');
is(idx.map((r) => r.slug), ['abdelal01', 'achiupr01', 'adamsst01'], 'index: slugs read off data-append-csv');
is(cell(idx[0], 'player'), 'Alaa Abdelnaby', 'index: the name comes out without its link markup');
is(cell(idx[0], 'year_min'), '1991', 'index: career start');
is(cell(idx[0], 'year_max'), '1995', 'index: career end');
is(/<strong>/i.test(idx[0].cells.player), false, 'index: a retired player is not bolded');
is(/<strong>/i.test(idx[1].cells.player), true, 'index: a current player is bolded — that is the active signal');
// Stored '|'-joined, the same way teams is: arcade/livecheck.js splits on it, so
// a comma-joined string would be one school named "Pittsburgh, Notre Dame" and
// would match neither. Reading the link texts also keeps a school whose own
// name has a comma in it ("Miami, FL") in one piece.
is(links(idx[2], 'colleges'), ['Pittsburgh', 'Notre Dame'], 'index: a transfer keeps both schools, separately');
is(links(idx[0], 'colleges').join('|'), 'Duke', 'index: one school stays one school');

/* Positions are the coarse family on BBRef. Split rather than collapse: an F-C
   really is both, and both halves are categories the game asks about. */
is(posNBA('F-C'), 'Forward|Center', 'pos: a swingman is both, not one');
is(posNBA('G'), 'Guard', 'pos: a guard is a Guard');
is(posNBA('C'), 'Center', 'pos: a centre is a Center');
is(posNBA('G-F'), 'Guard|Forward', 'pos: order follows the listing');
is(posNBA(''), null, 'pos: nothing in, nothing out');
is(posNBA('DH'), null, 'pos: an unrecognised code is dropped, not passed through raw');

/* ---------- per-season totals: and for whom ----------
 * BBRef renamed the team column from team_id to team_name_abbr in its 2024
 * redesign, and older season pages still serve the old name, so both shapes
 * appear in one register build. A traded player gets a combined 2TM row on top
 * of his real ones; the league-average footer row carries no player slug. */
const TOTALS = `
<table class="stats_table" id="totals_stats"><tbody>
<tr><th scope="row" data-append-csv="bogdabo01" data-stat="player"><a href="/players/b/bogdabo01.html">Bogdan Bogdanovic</a></th><td data-stat="team_name_abbr">2TM</td><td data-stat="pts">700</td></tr>
<tr><th scope="row" data-append-csv="bogdabo01" data-stat="player"><a href="/players/b/bogdabo01.html">Bogdan Bogdanovic</a></th><td data-stat="team_name_abbr">ATL</td><td data-stat="pts">400</td></tr>
<tr><th scope="row" data-append-csv="bogdabo01" data-stat="player"><a href="/players/b/bogdabo01.html">Bogdan Bogdanovic</a></th><td data-stat="team_name_abbr">LAC</td><td data-stat="pts">300</td></tr>
<tr><th scope="row" data-append-csv="abdelal01" data-stat="player"><a href="/players/a/abdelal01.html">Alaa Abdelnaby</a></th><td data-stat="team_id">POR</td><td data-stat="pts">200</td></tr>
<tr><td data-stat="player">League Average</td><td data-stat="team_id"></td><td data-stat="pts">100</td></tr>
</tbody></table>`;

const tot = bbrRows(TOTALS);
is(tot.length, 4, 'totals: four player rows; the League Average footer is not a player');
is(cell(tot[1], 'team_name_abbr', 'team_id'), 'ATL', 'totals: current column name is read');
is(cell(tot[3], 'team_name_abbr', 'team_id'), 'POR', 'totals: the pre-2024 column name still works');

/* The season index is what turns an abbreviation into the name that franchise
   actually had that year, so Seattle stays Seattle and Oklahoma City stays
   Oklahoma City instead of one overwriting the other. */
const SEASON_INDEX = `
<a href="/teams/ATL/2024.html">Atlanta Hawks</a>
<a href="/teams/LAC/2024.html">Los Angeles Clippers</a>
<a href="/teams/POR/2024.html">Portland Trail Blazers</a>
<a href="/teams/ATL/2024.html">Atlanta Hawks</a>`;
const teamName = {};
const re = /href="\/teams\/([A-Z]{3})\/2024\.html"[^>]*>([^<]+)<\/a>/g;
let m; while ((m = re.exec(SEASON_INDEX))) if (!teamName[m[1]]) teamName[m[1]] = m[2].trim();
is(teamName, { ATL: 'Atlanta Hawks', LAC: 'Los Angeles Clippers', POR: 'Portland Trail Blazers' },
  'season: abbr → the name it had that year, listed once');

// The combined 2TM row names no team, so it drops out on its own.
const resolved = tot.map((r) => teamName[cell(r, 'team_name_abbr', 'team_id')]).filter(Boolean);
is(resolved, ['Atlanta Hawks', 'Los Angeles Clippers', 'Portland Trail Blazers'],
  'season: a 2TM line resolves to nothing and is skipped');

/* ---------- name keys must match keyOf() in arcade/sportegories.js ---------- */
is(nameKey('Alaa Abdelnaby'), 'alaa|abdelnaby', 'key: the ordinary case');
is(nameKey('Bogdan Bogdanović'), 'bogdan|bogdanovic', 'key: accents are folded, or the lookup misses');
is(nameKey('Ken Griffey Jr.'), 'ken|griffey', 'key: a suffix is not a surname');
is(nameKey("De'Aaron Fox"), 'deaaron|fox', 'key: punctuation inside a name is dropped');
is(nameKey('Nene'), 'nene|nene', 'key: a one-name player still gets two halves');

/* ---------- the CSV cell that failed the load ----------
 * COPY reads an empty unquoted field as NULL and teams is NOT NULL, so the row
 * below aborted the whole 56k-row import. The writer is correct — the fix is
 * FORCE_NOT_NULL(teams) in the workflow — so this asserts the workflow keeps it. */
is(csvCell(''), '', 'csv: an empty cell is written empty, per COPY convention');
is(csvCell('Miami, FL'), '"Miami, FL"', 'csv: a comma inside a value is quoted');
is(csvCell('He said "hi"'), '"He said ""hi"""', 'csv: quotes are doubled');
is(csvCell(null), '', 'csv: null is empty, not the string "null"');

const { readFileSync } = await import('node:fs');
const wf = readFileSync(new URL('../.github/workflows/player-register.yml', import.meta.url), 'utf8');
is(/FORCE_NOT_NULL\(teams\)/.test(wf), true,
  'workflow: \\copy declares FORCE_NOT_NULL(teams), or a teamless player aborts the load');

/* ---------- the two passes, joined ----------
 * Drives the real buildNBA() over a stubbed Basketball-Reference: the index
 * establishes who exists, the season pages say who they played for, and the two
 * are joined on BBRef's slug. This is what the first workflow run got wrong —
 * it fetched cleanly and produced nothing — so the assertion that matters is
 * that a player comes out with teams attached, not merely that it ran. */
globalThis.fetch = async (url) => {
  const body = /\/players\/a\//.test(url) ? INDEX
    : /NBA_2024\.html/.test(url) ? SEASON_INDEX
    : /NBA_2024_totals\.html/.test(url) ? TOTALS
    : null;
  return body
    ? { ok: true, status: 200, text: async () => body }
    : { ok: false, status: 404 };
};
const players = await buildNBA();
is(players, 3, 'walk: the index is the register — three players from one letter');

const alaa = REG.get('nba:abdelal01');
is(alaa && alaa.name, 'Alaa Abdelnaby', 'walk: the player survives the walk');
is(alaa && alaa.name_key, 'alaa|abdelnaby', 'walk: keyed the way the client will ask');
is(alaa && alaa.pos, 'Forward|Center', 'walk: both halves of F-C are kept');
is(alaa && alaa.college, 'Duke', 'walk: college carried through');
is(alaa && alaa.teams, ['Portland Trail Blazers'], 'walk: pass 2 attached the team, via the pre-2024 column');
is(alaa && alaa.first, 1991, 'walk: the index career span is not overwritten by the one season we stubbed');
is(alaa && alaa.last, 1995, 'walk: nor is the end');
is(alaa && alaa.active, false, 'walk: unbolded and long finished — retired');

const bogdan = REG.get('nba:bogdabo01');
is(bogdan, undefined, 'walk: a totals row for someone the index never listed is ignored, not invented');

const precious = REG.get('nba:achiupr01');
is(precious && precious.active, true, 'walk: the bolded player reads as active');
is(precious && precious.teams, [], 'walk: no season page for him, so no team is guessed');

console.log(bad.length ? bad.map((b) => '  FAIL ' + b).join('\n') : '');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
