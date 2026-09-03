/* The fetcher's parsers, against saved markup.
 *
 *   node hoops/build/check-fetch.mjs
 *
 * WHY FIXTURES AND NOT A LIVE FETCH. Basketball-Reference is blocked from the
 * development sandbox and open from GitHub's runners, so the only place
 * fetch-nba.mjs can run is the one place nobody is watching it. That is exactly
 * how the player register shipped a job that fetched 56,335 players and loaded
 * none of them: the failure was invisible until a workflow run, and then it was
 * invisible again because an empty result and a broken parser look the same.
 *
 * So the parsing is tested here instead, against real BBRef row markup in both
 * the shapes the site serves: the pre-2024 columns (team_id) and the current
 * ones (team_name_abbr). A redesign that moves a column fails here, in the
 * sandbox, in a second, instead of six weeks later in a dataset nobody diffed.
 */

import { bbrRows, cell, positions, seasonTables } from './fetch-nba.mjs';
import { parseSolo, parseTeams, parseAllStars, seasonIn, slugsIn, AWARDS, AWARD_RANK }
  from './fetch-awards.mjs';

let pass = 0;
const bad = [];
function is(actual, expect, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expect);
  if (a === e) { pass++; return; }
  bad.push(`${what}\n      expected ${e}\n      got      ${a}`);
}
function ok(cond, what) {
  if (cond) { pass++; return; }
  bad.push(what);
}

/* ---------- the per-game table, current column shape ----------
 * A header row is in here on purpose: it carries no player slug and must never
 * become a player. */
const PER_GAME_NEW = `
<table id="per_game_stats"><thead>
<tr><th data-stat="ranker">Rk</th><th data-stat="name_display">Player</th></tr>
</thead><tbody>
<tr><th scope="row" data-stat="ranker">1</th>
<td data-stat="name_display" data-append-csv="jokicni01"><a href="/players/j/jokicni01.html">Nikola Jokic</a></td>
<td data-stat="age">27</td><td data-stat="team_name_abbr"><a href="/teams/DEN/2023.html">DEN</a></td>
<td data-stat="pos">C</td><td data-stat="games">69</td>
<td data-stat="fga_per_g">14.8</td><td data-stat="fg3a_per_g">2.4</td>
<td data-stat="pts_per_g">24.5</td><td data-stat="trb_per_g">11.8</td><td data-stat="ast_per_g">9.8</td>
<td data-stat="stl_per_g">1.3</td><td data-stat="blk_per_g">0.7</td></tr>
<tr><th scope="row" data-stat="ranker">2</th>
<td data-stat="name_display" data-append-csv="jamesle01"><a href="/players/j/jamesle01.html">LeBron James</a></td>
<td data-stat="age">38</td><td data-stat="team_name_abbr"><a href="/teams/LAL/2023.html">LAL</a></td>
<td data-stat="pos">PF-SF</td><td data-stat="games">55</td>
<td data-stat="pts_per_g">28.9</td><td data-stat="trb_per_g">8.3</td><td data-stat="ast_per_g">6.8</td></tr>
<tr><th scope="row" data-stat="ranker">3</th>
<td data-stat="name_display" data-append-csv="smithja01"><a href="/players/s/smithja01.html">Jae Crowder</a></td>
<td data-stat="age">30</td><td data-stat="team_name_abbr">2TM</td>
<td data-stat="pos">SF</td><td data-stat="games">40</td>
<td data-stat="pts_per_g">9.0</td><td data-stat="trb_per_g">4.0</td><td data-stat="ast_per_g">1.5</td></tr>
</tbody></table>`;

/* ---------- the same table in the pre-2024 column shape ---------- */
const PER_GAME_OLD = `
<table id="per_game_stats"><tbody>
<tr><th scope="row" data-stat="ranker">1</th>
<td data-stat="player" data-append-csv="jordami01"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="age">32</td><td data-stat="team_id"><a href="/teams/CHI/1996.html">CHI</a></td>
<td data-stat="pos">SG</td><td data-stat="g">82</td>
<td data-stat="pts_per_g">30.4</td><td data-stat="trb_per_g">6.6</td><td data-stat="ast_per_g">4.3</td></tr>
</tbody></table>`;

/* ---------- the advanced table, which is where win shares live.
 * BBRef buries secondary tables inside HTML comments, so this one is wrapped in
 * exactly that way: a parser that does not un-comment first sees nothing. */
const ADVANCED = `
<div class="placeholder"></div>
<!--
<table id="advanced"><tbody>
<tr><th scope="row" data-stat="ranker">1</th>
<td data-stat="name_display" data-append-csv="jokicni01">Nikola Jokic</td>
<td data-stat="team_name_abbr">DEN</td><td data-stat="mp">2323</td>
<td data-stat="ws">14.9</td><td data-stat="ws_off">10.7</td><td data-stat="ws_def">4.2</td></tr>
</tbody></table>
-->`;

// ─── rows are found by slug, never by table id or column position ───────────

const perGameNew = bbrRows(PER_GAME_NEW);
is(perGameNew.length, 3, 'three player rows, and the header row is not one of them');
is(perGameNew.map(r => r.slug), ['jokicni01', 'jamesle01', 'smithja01'], 'every row carries its slug');

is(cell(perGameNew[0], 'name_display', 'player'), 'Nikola Jokic', 'the name comes out of the link');
is(cell(perGameNew[0], 'team_name_abbr', 'team_id'), 'DEN', 'the current team column is read');
is(cell(perGameNew[0], 'pts_per_g'), '24.5', 'points per game');

/* THE FOUR THE FIT MODEL RUNS ON. Each one is a whole component of the roster
   model, and losing one to a column rename does not break anything loudly: it
   reads as zero, and zero shot attempts or zero three-point attempts is a
   perfectly plausible number for a real player, so the model just quietly
   starts scoring every roster the same way. */
is(cell(perGameNew[0], 'fga_per_g'), '14.8', 'field goal attempts, which is the usage model');
is(cell(perGameNew[0], 'fg3a_per_g'), '2.4', 'three-point attempts, which is the spacing model');
is(cell(perGameNew[0], 'blk_per_g'), '0.7', 'blocks, which is rim protection');
is(cell(perGameNew[0], 'stl_per_g'), '1.3', 'steals, which is perimeter defense');

/* THE COLUMN RENAME IS THE WHOLE POINT OF THE FALLBACK LIST. team_id became
   team_name_abbr in 2024 and player became name_display, and a scrape that
   knows only one of each silently loses half of history. */
const perGameOld = bbrRows(PER_GAME_OLD);
is(perGameOld.length, 1, 'the pre-2024 shape still parses');
is(cell(perGameOld[0], 'name_display', 'player'), 'Michael Jordan', 'the old name column is read');
is(cell(perGameOld[0], 'team_name_abbr', 'team_id'), 'CHI', 'the old team column is read');
is(cell(perGameOld[0], 'games', 'g'), '82', 'the old games column is read');

// ─── the advanced table survives being inside an HTML comment ───────────────

const adv = bbrRows(ADVANCED);
is(adv.length, 1, 'a commented-out table is still parsed');
is(cell(adv[0], 'ws_off', 'ows'), '10.7', 'offensive win shares');
is(cell(adv[0], 'ws_def', 'dws'), '4.2', 'defensive win shares');

// ─── the postseason table is on the same page, and is not a season ──────────

/* THIS FIXTURE IS A REPRODUCTION OF A BUG THAT SHIPPED. The first real fetch
   returned 531 doubled rows and every club they belonged to was an NBA
   finalist, because a season page carries the playoff table too and the parser
   read every <tr> on the page. Jordan's 1998 arrived twice: 28.7 points in
   38.8 minutes, and 32.4 in 41.5.

   The second row is not merely redundant. Win shares join on player and club,
   so the playoff box score inherited the REGULAR SEASON value and became a
   season that never happened. */
const SEASON_PAGE = `
<table id="per_game_stats"><tbody>
<tr><th data-stat="ranker">1</th>
<td data-stat="name_display" data-append-csv="jordami01"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="team_name_abbr">CHI</td><td data-stat="pos">SG</td>
<td data-stat="pts_per_g">28.7</td><td data-stat="mp_per_g">38.8</td></tr>
</tbody></table>
<table id="playoffs_per_game"><tbody>
<tr><th data-stat="ranker">1</th>
<td data-stat="name_display" data-append-csv="jordami01"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="team_name_abbr">CHI</td><td data-stat="pos">SG</td>
<td data-stat="pts_per_g">32.4</td><td data-stat="mp_per_g">41.5</td></tr>
</tbody></table>`;

const whole = bbrRows(SEASON_PAGE);
is(whole.length, 2, 'a whole-page scan really does see both Jordans');

const scoped = seasonTables(SEASON_PAGE);
is(scoped.rows.length, 1, 'the season scrape takes one row per player');
is(cell(scoped.rows[0], 'pts_per_g'), '28.7', 'and it is the regular season, not the playoffs');
is(scoped.skipped, 1, 'the playoff row is counted rather than silently dropped');

/* EITHER SIGNAL ALONE HAS TO WORK, because relying on both means a single
   rename or a single reorder puts the postseason back in the data. */
const noId = SEASON_PAGE.replace('id="playoffs_per_game"', 'id="pg_2"');
is(cell(seasonTables(noId).rows[0], 'pts_per_g'), '28.7',
  'order alone is enough when the playoff table is renamed');

const reordered = `<table id="playoffs_per_game"><tbody>
<tr><td data-stat="name_display" data-append-csv="jordami01"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="team_name_abbr">CHI</td><td data-stat="pts_per_g">32.4</td></tr>
</tbody></table>` + SEASON_PAGE.split('<table id="playoffs_per_game">')[0];
is(cell(seasonTables(reordered).rows[0], 'pts_per_g'), '28.7',
  'the id alone is enough when the playoff table comes first');

/* A page with no <table> at all is a shape change, not an empty league. Losing
   every row to it would be the silent zero the row guards exist to catch. */
const noTables = `<div><tr><td data-stat="name_display" data-append-csv="jordami01"><a href="/players/j/jordami01.html">MJ</a></td><td data-stat="pts_per_g">28.7</td></tr></div>`;
is(seasonTables(noTables).rows.length, 1, 'a page with no table falls back to the whole page');

/* ---------- a draft page, which does NOT carry data-append-csv ----------
 * This fixture exists because its absence cost a whole CI run: the draft fetch
 * returned zero picks for all sixty-five years, because the parser demanded an
 * attribute that only the STATS tables carry. On a draft page the only copy of
 * the slug is in the player link's href. The high-school pick is in here on
 * purpose too: his college cell is empty, and empty has to stay empty rather
 * than becoming a college nobody attended. */
const DRAFT = `
<table id="stats"><thead>
<tr><th data-stat="pick_overall">Pk</th><th data-stat="player">Player</th></tr>
</thead><tbody>
<tr><th scope="row" data-stat="pick_overall">1</th>
<td data-stat="team_id"><a href="/teams/CLE/2004.html">CLE</a></td>
<td data-stat="player"><a href="/players/j/jamesle01.html">LeBron James</a></td>
<td data-stat="college_name"></td></tr>
<tr><th scope="row" data-stat="pick_overall">3</th>
<td data-stat="team_id"><a href="/teams/DEN/2004.html">DEN</a></td>
<td data-stat="player"><a href="/players/a/anthoca01.html">Carmelo Anthony</a></td>
<td data-stat="college_name"><a href="/friv/colleges.cgi?college=syracuse">Syracuse</a></td></tr>
</tbody></table>`;

const draft = bbrRows(DRAFT);
is(draft.length, 2, 'a draft page parses without data-append-csv anywhere on it');
is(draft.map(r => r.slug), ['jamesle01', 'anthoca01'], 'the slug comes out of the player link');
is(cell(draft[1], 'college_name', 'college'), 'Syracuse', 'and the college with it');
is(cell(draft[0], 'college_name', 'college'), '',
  'a player who went straight from high school has no college, and gets none invented');

/* The attribute still wins where both are present, so nothing about the season
   pages changed when the fallback was added. */
const both = bbrRows(`<tr><td data-stat="player" data-append-csv="realslug01">
  <a href="/players/x/wrongslug99.html">Somebody</a></td></tr>`);
is(both[0].slug, 'realslug01', 'data-append-csv still wins over the href');

/* ---------- THE SAME DRAFT TABLE WITH ITS CLOSING TAGS LEFT OUT ----------
 *
 * This is the shape that actually beat the fetch twice. </tr>, </td> and </th>
 * are all OPTIONAL in HTML5, and Basketball-Reference omits them on the draft
 * pages while writing them on the season pages. A parser built against a
 * season page therefore works perfectly and returns zero picks for every draft
 * year, on a page that loaded fine and contained every pick.
 *
 * The fixture above could never have caught it, because it was written by hand
 * with the tags closed. This one is the same table with them removed and
 * nothing else changed, and it must parse identically. */
const DRAFT_UNCLOSED = `
<table id="stats"><thead>
<tr><th data-stat="pick_overall">Pk<th data-stat="player">Player
</thead><tbody>
<tr><th scope="row" data-stat="pick_overall">1
<td data-stat="team_id"><a href="/teams/CLE/2004.html">CLE</a>
<td data-stat="player"><a href="/players/j/jamesle01.html">LeBron James</a>
<td data-stat="college_name">
<tr><th scope="row" data-stat="pick_overall">3
<td data-stat="team_id"><a href="/teams/DEN/2004.html">DEN</a>
<td data-stat="player"><a href="/players/a/anthoca01.html">Carmelo Anthony</a>
<td data-stat="college_name"><a href="/friv/colleges.cgi?college=syracuse">Syracuse</a>
</tbody></table>`;

const unclosed = bbrRows(DRAFT_UNCLOSED);
is(unclosed.length, 2, 'a table with no closing tags still yields both picks');
is(unclosed.map(r => r.slug), ['jamesle01', 'anthoca01'], 'and both slugs');
is(cell(unclosed[1], 'college_name', 'college'), 'Syracuse',
  'and the cells end at the next cell rather than at a tag that is not there');
is(cell(unclosed[0], 'college_name', 'college'), '',
  'and an empty college is still empty rather than swallowing the rest of the row');
is(cell(unclosed[0], 'pick_overall'), '1', 'a th cell closes the same way');

/* A row must not bleed into the next one. If the boundary is wrong, pick 1
   picks up Carmelo's college and every row becomes the whole table. */
is(cell(unclosed[0], 'player'), 'LeBron James', 'a row stops where the next row starts');

/* ---------- EVERY WAY A PLAYER LINK CAN BE WRITTEN ----------
 *
 * The draft fetch has returned zero picks for all sixty-six years on four
 * separate runs, while the diagnostic printed at it insisted the page was the
 * right page with the rows and the links present. Each round trip tested ONE
 * guess about the markup and cost ten minutes.
 *
 * The pattern demanded `href="/players/...`, which quietly asserts three
 * things at once: that the origin is relative, that the quote is a double one,
 * and that .html is the end of the attribute. Any of those being different
 * gives exactly the symptom seen, and none of them changes which player the
 * row is about. So the parser now asks for the path and nothing else, and
 * every variant is pinned here rather than guessed at one run at a time. */
const HREF_FORMS = [
  ['relative, double quoted', '<a href="/players/j/jamesle01.html">LeBron James</a>'],
  ['absolute', '<a href="https://www.basketball-reference.com/players/j/jamesle01.html">LeBron James</a>'],
  ['protocol relative', '<a href="//www.basketball-reference.com/players/j/jamesle01.html">LeBron</a>'],
  ['single quoted', "<a href='/players/j/jamesle01.html'>LeBron James</a>"],
  ['unquoted', '<a href=/players/j/jamesle01.html>LeBron James</a>'],
  ['with a query string', '<a href="/players/j/jamesle01.html?utm=draft">LeBron James</a>'],
  ['with a fragment', '<a href="/players/j/jamesle01.html#totals">LeBron James</a>'],
  ['extra attributes first', '<a class="x" data-foo="1" href="/players/j/jamesle01.html">LeBron</a>'],
];
for (const [what, anchor] of HREF_FORMS) {
  const r = bbrRows(`<tr><td data-stat="player">${anchor}</td></tr>`);
  is(r.length && r[0].slug, 'jamesle01', `the slug is found when the link is ${what}`);
}

/* And data-append-csv still wins, however IT is quoted. */
for (const [what, attr] of [['double quoted', '"realslug01"'], ['single quoted', "'realslug01'"]]) {
  const r = bbrRows(`<tr><td data-stat="player" data-append-csv=${attr}>`
    + '<a href="/players/x/wrongslug99.html">Somebody</a></td></tr>');
  is(r.length && r[0].slug, 'realslug01', `data-append-csv wins when ${what}`);
}

/* A row with no player in it is still not a player. This is the assertion that
   stops the permissive pattern above turning headers and league-average rows
   into people. */
is(bbrRows('<tr><th data-stat="ranker">Rk</th><th data-stat="player">Player</th></tr>').length, 0,
  'a header row still yields nobody');
is(bbrRows('<tr><td data-stat="player">League Average</td><td data-stat="pts_per_g">9.9</td></tr>').length, 0,
  'and a league-average row is not a player either');

// ─── multi-team rows are stat lines, not clubs ──────────────────────────────

const traded = perGameNew.find(r => r.slug === 'smithja01');
ok(/^(TOT|\dTM)$/i.test(cell(traded, 'team_name_abbr', 'team_id')),
  'the combined row for a traded player is recognisable as one');

// ─── positions ──────────────────────────────────────────────────────────────

is(positions('C'), ['C'], 'a centre plays centre');
is(positions('PG'), ['PG'], 'a point guard plays point guard');
is(positions('PF-SF'), ['PF', 'SF'], 'a swingman keeps both, primary first');
is(positions('SG-SF'), ['SG', 'SF'], 'a wing keeps both, and nothing is invented on top');
is(positions('C-PF'), ['C', 'PF'], 'a big keeps both, and does not acquire small forward');
is(positions('G'), ['G'], 'a coarse position from an old season passes straight through');
is(positions(''), null, 'a row with no position is not a player this game can use');
is(positions('XX'), null, 'a position the slot table has never heard of is refused');
ok(positions('PF-SF')[0] === 'PF', 'the FIRST position listed is the primary, which POSITION_MAX counts on');

// ─── the award pages ────────────────────────────────────────────────────────

/* Every fixture below is written in the shape Basketball-Reference actually
 * serves, INCLUDING the parts the parsers deliberately ignore: an absolute
 * origin on one link, single quotes on another, a fragment after .html on a
 * third. The draft fetch returned zero picks for four runs because its parser
 * quietly assumed all three of those, so the fixtures assert that none of them
 * matters rather than assuming it. */

/* ---------- a single-winner page: one row a season ---------- */
const MVP_PAGE = `
<table id="mvp_NBA"><thead>
<tr><th data-stat="season">Season</th><th data-stat="player">Player</th></tr>
</thead><tbody>
<tr><th data-stat="season"><a href="/leagues/NBA_1996.html">1995-96</a></th>
<td data-stat="player"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="team_id"><a href="/teams/CHI/1996.html">CHI</a></td>
<td data-stat="pts_won">986.0</td></tr>
<tr><th data-stat="season"><a href="/leagues/NBA_2000.html">1999-00</a></th>
<td data-stat="player"><a href='https://www.basketball-reference.com/players/o/onealsh01.html'>Shaquille O'Neal</a></td>
<td data-stat="team_id"><a href="/teams/LAL/2000.html">LAL</a></td></tr>
<tr><th data-stat="season">2015-16</th>
<td data-stat="player"><a href="/players/c/curryst01.html#all_totals">Stephen Curry</a></td>
<td data-stat="team_id">GSW</td></tr>
</tbody></table>`;

const mvp = parseSolo(MVP_PAGE);
is(mvp.length, 3, 'every winner row on the MVP page is read');
is(mvp[0], { season: 1996, slug: 'jordami01' }, '1995-96 is the 1996 season, and Jordan won it');
is(mvp[1], { season: 2000, slug: 'onealsh01' },
  'an absolute origin on the link changes nothing about who the row is about');
is(mvp[2], { season: 2016, slug: 'curryst01' },
  'and neither does a fragment after .html, with the season read from the text');

/* THE CENTURY ROLL. 1999-00 is the season ending in 2000 and 1995-96 is not the
 * season ending in 1995. A parser that takes the first four-digit number gets
 * one of those wrong, and every award it files lands a year early with nothing
 * about the output looking broken. */
is(seasonIn('<th>1999-00</th>'), 2000, '1999-00 is the 2000 season');
is(seasonIn('<th>1995-96</th>'), 1996, '1995-96 is the 1996 season');
is(seasonIn('<th>2019-20</th>'), 2020, '2019-20 is the 2020 season');
is(seasonIn('<th>1973-74</th>'), 1974, '1973-74 is the 1974 season');
is(seasonIn('<a href="/leagues/NBA_1978.html">1977-78</a>'), 1978,
  'and the league link is preferred over the text when both are there');
is(seasonIn('<td>no season here</td>'), null, 'a row with no season in it says so');

/* A header row carries no player, so it is not a winner. */
is(parseSolo('<tr><th data-stat="season">Season</th><th data-stat="player">Player</th></tr>').length, 0,
  'a header row on an award page wins nothing');
/* Nor is a row with a player and no season: that is the career-totals footer. */
is(parseSolo('<tr><td><a href="/players/j/jordami01.html">Michael Jordan</a></td></tr>').length, 0,
  'a row with a player but no season is not a season');

/* ---------- an All-NBA page: one row a season PER TIER, five men on it ------- */
const ALL_LEAGUE = `
<table id="awards_all_league"><tbody>
<tr><th data-stat="season"><a href="/leagues/NBA_1996.html">1995-96</a></th>
<td data-stat="lg_id">NBA</td><td data-stat="team">1st</td>
<td data-stat="player_1"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="player_2"><a href="/players/p/pippesc01.html">Scottie Pippen</a></td>
<td data-stat="player_3"><a href="/players/m/malonka01.html">Karl Malone</a></td>
<td data-stat="player_4"><a href="/players/o/olajuha01.html">Hakeem Olajuwon</a></td>
<td data-stat="player_5"><a href="/players/p/pentoga01.html">Gary Payton</a></td></tr>
<tr><th data-stat="season"><a href="/leagues/NBA_1996.html">1995-96</a></th>
<td data-stat="lg_id">NBA</td><td data-stat="team">2nd</td>
<td data-stat="player_1"><a href="/players/h/hardaan01.html">Anfernee Hardaway</a></td>
<td data-stat="player_2"><a href="/players/r/robinda01.html">David Robinson</a></td></tr>
<tr><th data-stat="season"><a href="/leagues/NBA_1996.html">1995-96</a></th>
<td data-stat="lg_id">NBA</td><td data-stat="team">3rd</td>
<td data-stat="player_1"><a href="/players/b/barklch01.html">Charles Barkley</a></td></tr>
</tbody></table>`;

const league = parseTeams(ALL_LEAGUE, { '1st': 'an1', '2nd': 'an2', '3rd': 'an3' });
is(league.length, 3, 'all three All-NBA tiers are read from one season');
is(league[0].code, 'an1', 'the 1st team row is the first team');
is(league[0].season, 1996, 'and it knows which season it is');
is(league[0].slugs.length, 5, 'a first team is five men, not one');
is(league[0].slugs[0], 'jordami01', 'and the first of them is the first player cell');
is(league[1].code, 'an2', 'the second team row is the second team');
is(league[2].code, 'an3', 'the third team row is the third team');

/* "1st Team" is the same tier as "1st". Which of the two BBRef prints is a
   presentation choice, and a parser that only accepts one of them returns an
   empty All-NBA list the day they change it. */
const TEAM_SUFFIXED = ALL_LEAGUE
  .replace('>1st<', '>1st Team<').replace('>2nd<', '>2nd Team<').replace('>3rd<', '>3rd Team<');
const suffixed = parseTeams(TEAM_SUFFIXED, { '1st': 'an1', '2nd': 'an2', '3rd': 'an3' });
is(suffixed.length, 3, 'the tier is read whether it says "1st" or "1st Team"');
is(suffixed[0].code, 'an1', 'and it is still the first team');

/* A page whose tier map has no 3rd team must not invent one. All-Defensive has
   two teams and has never had three. */
const defense = parseTeams(ALL_LEAGUE, { '1st': 'ad1', '2nd': 'ad2' });
is(defense.length, 2, 'a two-tier award does not acquire a third team from a three-tier page');

/* ---------- an All-Star page ---------- */
const ALL_STAR = `
<div class="nav"><a href="/players/j/jamesle01.html">LeBron James career</a></div>
<table id="EAST"><tbody>
<tr><td data-stat="player"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="pts">20</td></tr>
<tr><td data-stat="player"><a href="/players/p/pippesc01.html">Scottie Pippen</a></td>
<td data-stat="pts">4</td></tr>
<tr><td data-stat="player"><a href="/players/j/jordami01.html">Michael Jordan</a></td>
<td data-stat="pts">20</td></tr>
</tbody></table>`;

const stars = parseAllStars(ALL_STAR);
is(stars.length, 2, 'a man listed on two rows of the box score is one All-Star');
ok(stars.includes('jordami01') && stars.includes('pippesc01'), 'and both of them are read');
ok(!stars.includes('jamesle01'),
  'a player link in the page navigation is not an All-Star selection');

/* ---------- slugsIn ---------- */
is(slugsIn('<td><a href="/players/j/jordami01.html">MJ</a></td>'), ['jordami01'],
  'a plain relative link yields its slug');
/* The apostrophe is in the NAME, never in the slug: BBRef ids are letters and
   digits. What this asserts is that the text of the link cannot confuse the
   path, which is the only part being read. */
is(slugsIn("<td><a href='/players/o/onealsh01.html'>Shaquille O'Neal</a></td>"), ['onealsh01'],
  'an apostrophe in the name does not disturb the slug in the path');
is(slugsIn('<td><a href="/players/v/vanhoke01.html">Keith Van Horn</a></td>'), ['vanhoke01'],
  'and a two-word surname is one slug like any other');
is(slugsIn('<td>no links at all</td>'), [], 'a row with no player links yields none');

// ─── report ─────────────────────────────────────────────────────────────────

if (bad.length) {
  console.error(`fetch parsers: ${bad.length} FAILED, ${pass} passed\n`);
  for (const b of bad) console.error('  FAIL: ' + b);
  console.error('\nSee the header of hoops/build/fetch-nba.mjs for why this is parsed by');
  console.error('data-stat name rather than by column position.');
  process.exit(1);
}
console.log(`fetch parsers: ${pass} assertions passed.`);
