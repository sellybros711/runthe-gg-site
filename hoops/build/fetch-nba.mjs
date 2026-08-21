/* Stage 1 of the real pipeline: every NBA player-season, off Basketball-Reference.
 *
 *   node hoops/build/fetch-nba.mjs --from 1974 --to 2026
 *   node hoops/build/fetch-nba.mjs --from 1996 --to 1996 --out raw/one.json
 *
 * Writes raw rows to hoops/build/raw/nba_player_seasons.json. Pricing and the
 * file the game loads are stage 2:
 *
 *   node hoops/build/build-players.mjs --from hoops/build/raw/nba_player_seasons.json
 *
 * ── THIS CANNOT BE RUN FROM THE DEVELOPMENT SANDBOX ────────────────────────
 *
 * Basketball-Reference is blocked from the sandbox and open from GitHub's
 * runners. That is not a guess: it is the same split scripts/build-register.mjs
 * documents, and the reason its parsers are tested against saved fixtures
 * instead of a live fetch. Trying it locally gets a 403 from the proxy on the
 * first request. Run it in CI, or from a machine that can reach the source.
 *
 * That is also why hoops/build/seed-rosters.mjs exists: without a seed, nobody
 * could open the game until a workflow had run.
 *
 * ── WHY BASKETBALL-REFERENCE AND NOT stats.nba.com ─────────────────────────
 *
 * The engine runs on WIN SHARES, split offensive and defensive. Those are a
 * derived statistic that Basketball-Reference computes and publishes and
 * stats.nba.com does not carry at all, so the choice of source is really the
 * choice of currency. Two pages per season, joined on BBRef's own player slug:
 *
 *   /leagues/NBA_YYYY_advanced.html   win shares, offensive and defensive
 *   /leagues/NBA_YYYY_per_game.html   points, rebounds, assists, position, team
 *
 * ── THE PARSING IS DELIBERATELY NOT COLUMN-POSITIONAL ──────────────────────
 *
 * Rows are found by "does this row carry a player slug" and cells are read by
 * their data-stat name, never by index, and the HTML is un-commented first
 * because BBRef buries secondary tables inside HTML comments. All three of
 * those are lessons the register already paid for: BBRef renames table ids and
 * columns between redesigns (team_id became team_name_abbr in 2024), and every
 * one of those changes turns a position-based scrape into a SILENT ZERO rather
 * than an error. See the row count guard at the end, which is the backstop for
 * the same failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(HERE, 'raw');

const BBR = 'https://www.basketball-reference.com';
const UA = 'RunTheGG/1.0 (+https://runthe.gg)';
/* The cadence the register and fetch-jerseys.mjs have run at daily without
   being blocked. BBRef throttles around 20 requests a minute. */
const BBR_WAIT = Number(process.env.BBR_WAIT || 3200);

/* Below this, a season's scrape is treated as broken rather than thin. A real
   NBA season has 400 to 600 player rows; 150 is comfortably under the smallest
   real season (the 1970s league had nine fewer teams) and comfortably over what
   a redesign that breaks the parser returns, which is zero. */
const MIN_ROWS_PER_SEASON = 150;

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
      if (r.status === 404) return null;              // a season that does not exist
      if (r.status === 429) throttled = true;
      else if (r.status < 500) return null;
    } catch { /* network hiccup, retry */ }
    /* Backing off 1.5s from a rate limiter just spends another request. A site
       that throttles by the minute has to be waited out. */
    await sleep((throttled ? 8000 : 1500) * (i + 1));
  }
  return null;
}

async function bbr(url) {
  const html = await get(url);
  await sleep(BBR_WAIT);
  return html;
}

// ─── parsing ────────────────────────────────────────────────────────────────

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const strip = (h) => decode(String(h || '').replace(/<[^>]*>/g, ''));
export const uncomment = (h) => String(h || '').replace(/<!--/g, '').replace(/-->/g, '');

/* ── SPLITTING A PAGE INTO ROWS WITHOUT REQUIRING </tr> ────────────────────
 *
 * This used to be `match(/<tr[\s\S]*?<\/tr>/gi)`, which needs a closing tag on
 * every row. HTML5 does not: </tr>, </td> and </th> are all optional, so a
 * parser that demands them is correct only for the pages that happen to write
 * them. A row here runs from one <tr> to whatever ends it FIRST: a </tr>, the
 * next <tr>, or the end of the table. That is what a browser does, and it is
 * right on both shapes rather than on one of them.
 *
 * HONESTY ABOUT WHY THIS WAS WRITTEN. It was written to fix the draft fetch,
 * which had returned zero picks for all sixty-six years three runs running,
 * and it DID NOT FIX IT. The next run's diagnostic reported 143 <tr> and 143
 * </tr> on the same page: the closing tags were there all along, so the
 * missing-tag theory was wrong and the draft failure is still open.
 *
 * The change stays because it is strictly more correct than what it replaced,
 * and it costs nothing. But it is not the draft's bug, and leaving a
 * confident wrong explanation here would send the next person down the same
 * dead end. The draft page's real shape is what the diagnostic in
 * fetch-draft.mjs now prints.
 */
function rowChunks(html) {
  const out = [];
  const re = /<tr\b[^>]*>([\s\S]*?)(?=<\/tr>|<tr\b|<\/tbody\b|<\/table\b|$)/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push(m[0]);
    if (re.lastIndex === m.index) re.lastIndex++;   // never spin on an empty match
  }
  return out;
}

export function bbrRows(html) {
  return rowChunks(uncomment(html)).map((tr) => {
    /* THE SLUG, FROM EITHER PLACE BBREF PUTS IT.
     *
     * The stats tables tag every player row with data-append-csv. The DRAFT
     * tables do not: there the only copy of the slug is inside the player
     * link's href. Requiring the attribute made the draft fetch return zero
     * picks for all sixty-five years, which is precisely the silent zero the
     * row-count guards exist to catch, and they did catch it.
     *
     * The attribute still wins where it exists, so nothing about the season
     * pages changes. The href is the fallback.
     */
    let slug = (/data-append-csv=["']?([a-z0-9.-]+)["']?/i.exec(tr) || [])[1];
    /* THE HREF FORM ASKS FOR THE PATH AND NOTHING ELSE, deliberately. It used
       to require `href="/players/...` exactly, which is one guess about how the
       link is written, and the draft fetch has now returned zero picks four
       runs running while every count printed at it said the page was fine.

       A player path is unambiguous wherever it appears in a row, so this stops
       asserting things it cannot see: the origin may be absolute, the quotes
       may be single or absent, and there may be a query string or a fragment
       after .html. Any of those broke the old pattern and none of them changes
       which player the row is about. */
    if (!slug) slug = (/\/players\/[a-z]\/([a-z0-9.'-]+)\.html/i.exec(tr) || [])[1];
    if (!slug) return null;                           // a header row is not a player

    /* AND THE CELLS END THE SAME WAY. </td> and </th> are optional in HTML5
       too, so a parser that demands them fails on exactly the pages that omit
       </tr>. A cell runs until it is closed, until the next cell starts, or
       until the row ends, whichever comes first. */
    const cells = {};
    const re = /data-stat="([a-z0-9_]+)"[^>]*>([\s\S]*?)(?=<\/t[dh]>|<t[dh]\b|<\/tr>|$)/gi;
    let m;
    while ((m = re.exec(tr))) {
      if (cells[m[1]] == null) cells[m[1]] = m[2];
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return { slug, cells };
  }).filter(Boolean);
}

/* ── THE REGULAR SEASON TABLE, AND ONLY THAT ONE ───────────────────────────
 *
 * bbrRows above scans the WHOLE page, which is right for a draft page (one
 * table) and wrong for a season page. A Basketball-Reference season page
 * carries the regular season table AND the playoff table, so a scan of every
 * <tr> on it returns a finalist's players TWICE: once with their season, once
 * with their postseason.
 *
 * That shipped. The first real fetch produced 531 doubled rows, and the list
 * of clubs they belonged to was a roll call of NBA finalists: 1978 Seattle and
 * Washington, 1984 Boston and the Lakers, 2016 Cleveland and Golden State,
 * 2025 Indiana and Oklahoma City. Michael Jordan's 1998 came back twice, at
 * 28.7 points in 38.8 minutes and again at 32.4 in 41.5, which are his regular
 * season and his playoff lines.
 *
 * It is worse than a duplicate. The win share join is keyed on player and club
 * alone, so BOTH rows got the REGULAR SEASON win shares. The second row is a
 * hybrid that never happened: a postseason box score priced off a regular
 * season value, presented to a player as a fact about a real season. This game
 * is not allowed to do that.
 *
 * TWO INDEPENDENT SIGNALS, because either one alone is a way to lose silently:
 *
 *   the id     BBRef ids its playoff tables playoffs_per_game and
 *              playoffs_advanced. Skipping any table whose id says playoff is
 *              exact, and it is also the thing most likely to be renamed.
 *   the order  The regular season table comes first. That survives a rename
 *              and cannot survive a reorder.
 *
 * They agree today. Requiring both to fail before a playoff row is admitted is
 * what makes this quiet rather than fragile, and the caller reports what it
 * skipped so a page that stops matching says so in the log.
 */
const TABLE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;

export function seasonTables(html) {
  const page = uncomment(html);
  const tables = page.match(TABLE) || [];
  /* No <table> at all means the page shape moved, not that it holds no
     players. Falling back to the whole page keeps such a run producing data
     instead of a silent zero, and the count it returns makes it visible. */
  if (!tables.length) return { rows: bbrRows(page), skipped: 0, tables: 0 };

  let rows = null;
  let skipped = 0;
  for (const t of tables) {
    const id = (/<table\b[^>]*\bid="([^"]*)"/i.exec(t) || [])[1] || '';
    const these = bbrRows(t);
    if (!these.length) continue;
    if (/playoff|post_?season/i.test(id)) { skipped += these.length; continue; }
    if (rows) { skipped += these.length; continue; }   // first player table wins
    rows = these;
  }
  return { rows: rows || [], skipped, tables: tables.length };
}

export const cell = (r, ...names) => {
  for (const n of names) if (r.cells[n] != null) return strip(r.cells[n]);
  return '';
};

const num = (r, ...names) => {
  const v = cell(r, ...names);
  const n = Number(v);
  return v === '' || Number.isNaN(n) ? 0 : n;
};

/* BBRef states a season position as PG, SG, SF, PF, C, or a hyphenated pair for
   a swingman. The engine's slot table reads the same vocabulary plus the coarse
   families, so a pair is split rather than collapsed: an F-C genuinely is both.
   The FIRST one listed is the primary, which is what POSITION_MAX counts on. */
const POS_OK = new Set(['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'GF', 'FC']);

/* TAKE WHAT THE SOURCE SAYS AND INVENT NOTHING. An earlier version synthesised
   a combined family for swingmen (SG plus SF became SG;SF;GF), which turned out
   to buy exactly nothing: GF appears in the eligibility lists for shooting
   forward and small forward, and a player already listed at both fills both
   slots without it. The one thing it did change was letting a PF-C play small
   forward, which is a claim about basketball the source never made.

   The engine's SLOT_ELIGIBILITY already understands the coarse families, so if
   BBRef ever serves a bare G or F it is passed straight through. */
export function positions(raw) {
  const parts = String(raw || '').toUpperCase().split(/[-/,]/)
    .map(s => s.trim()).filter(s => POS_OK.has(s));
  return parts.length ? [...new Set(parts)] : null;
}

// ─── the fetch ──────────────────────────────────────────────────────────────

async function season(year) {
  const [advanced, perGame] = [
    await bbr(`${BBR}/leagues/NBA_${year}_advanced.html`),
    await bbr(`${BBR}/leagues/NBA_${year}_per_game.html`),
  ];
  if (!advanced || !perGame) return { year, rows: [], reason: 'page did not load' };

  /* Win shares first, because a player with no win share row is a player this
     game has no way to price. */
  const advTable = seasonTables(advanced);
  const pgTable = seasonTables(perGame);

  const ws = {};
  for (const r of advTable.rows) {
    const team = cell(r, 'team_name_abbr', 'team_id', 'team');
    /* TOT / 2TM / 3TM are Basketball-Reference's combined line for a player who
       was traded. It is a stat line and not a club, so it can never be a thing
       the wheel lands on. The per-team rows for the same player are kept. */
    if (/^(TOT|\dTM)$/i.test(team)) continue;
    ws[`${r.slug}|${team}`] = {
      ow: num(r, 'ws_off', 'ows'),
      dw: num(r, 'ws_def', 'dws'),
      w: num(r, 'ws'),
      mp: num(r, 'mp'),
    };
  }

  const rows = [];
  /* ONE ROW PER PLAYER PER CLUB PER SEASON, asserted here rather than assumed.
     The table scoping above is what stops the postseason getting in; this is
     the check that says so out loud if it ever stops working. */
  const seen = new Set();
  let doubled = 0;

  for (const r of pgTable.rows) {
    const team = cell(r, 'team_name_abbr', 'team_id', 'team');
    if (/^(TOT|\dTM)$/i.test(team)) continue;

    const shares = ws[`${r.slug}|${team}`];
    if (!shares) continue;

    const key = `${r.slug}|${team}`;
    if (seen.has(key)) { doubled++; continue; }
    seen.add(key);

    const pos = positions(cell(r, 'pos'));
    if (!pos) continue;

    rows.push({
      i: r.slug,
      n: cell(r, 'name_display', 'player'),
      s: year,
      t: team,
      pp: pos[0],
      ep: pos.join(';'),
      ow: round1(shares.ow),
      dw: round1(shares.dw),
      w: round1(shares.ow + shares.dw),
      pts: num(r, 'pts_per_g'),
      reb: num(r, 'trb_per_g'),
      ast: num(r, 'ast_per_g'),
      /* THE FOUR THE FIT MODEL RUNS ON, and every one of them is already on this
         same page, so they cost nothing extra to take. Shot attempts are how the
         engine knows six men cannot all have the ball; three-point attempts are
         spacing, read against what the player's OWN era shot; blocks are rim
         protection; steals are perimeter defense. Drop any of them and the
         corresponding half of the fit model goes quiet rather than loud. */
      fga: num(r, 'fga_per_g'),
      tpa: num(r, 'fg3a_per_g'),
      blk: num(r, 'blk_per_g'),
      stl: num(r, 'stl_per_g'),
      g: num(r, 'games', 'g'),
      /* MINUTES, and they are not decoration. A real league is mostly players
         who barely played: without a floor, a draft board is a list of men who
         logged forty minutes across a whole season, and the wheel spends most of
         its time on them. build-players.mjs uses this to decide who is drawable
         at all. */
      mp: num(r, 'mp_per_g'),
      /* College and draft year are chemistry inputs and neither is on a season
         page. build-colleges.mjs fills them from the player pages; until it has
         run they are null, which is a link that correctly never fires rather
         than a link that fires wrongly. */
      col: null,
      dr: null,
    });
  }

  return { year, rows, postseason: pgTable.skipped + advTable.skipped, doubled };
}

const round1 = (v) => Math.round(v * 10) / 10;

async function main() {
  const from = Number(arg('from', 1974));
  const to = Number(arg('to', new Date().getUTCFullYear()));
  const out = path.resolve(arg('out', path.join(RAW_DIR, 'nba_player_seasons.json')));

  console.log(`Fetching NBA ${from} to ${to} from Basketball-Reference.`);
  console.log(`Two pages a season at ${BBR_WAIT}ms apart: about ${Math.ceil((to - from + 1) * 2 * BBR_WAIT / 60000)} minutes.\n`);

  const all = [];
  const thin = [];
  let postseason = 0, doubled = 0;
  for (let y = from; y <= to; y++) {
    const r = await season(y);
    const { rows, reason } = r;
    postseason += r.postseason || 0;
    doubled += r.doubled || 0;
    /* The postseason count is printed rather than hidden because it is the
       number that says the table scoping is still working. A season that skips
       zero playoff rows in a year somebody won a title means the playoff table
       stopped being recognisable, and the next thing that happens is finalists
       getting drafted with their playoff numbers. */
    const note = r.doubled ? `   ${r.doubled} DOUBLED` : '';
    if (rows.length < MIN_ROWS_PER_SEASON) {
      thin.push(`${y}: ${rows.length} rows${reason ? ` (${reason})` : ''}`);
      console.log(`  ${y}  ${String(rows.length).padStart(4)} rows   THIN`);
    } else {
      console.log(`  ${y}  ${String(rows.length).padStart(4)} rows  ${String(r.postseason || 0).padStart(4)} postseason skipped${note}`);
    }
    all.push(...rows);
  }
  console.log(`\n${postseason} postseason rows were skipped across the run.`);
  if (!postseason) {
    console.log('NONE AT ALL, which is suspicious: every season here had a playoff.');
    console.log('Check that the playoff table is still being recognised, because if it');
    console.log('is not, a finalist is about to be priced off his postseason.');
  }
  if (doubled) {
    console.log(`${doubled} row(s) repeated a player at the same club and were dropped.`);
  }

  /* A SILENT ZERO IS THE FAILURE MODE THIS GUARD EXISTS FOR. The register's
     first run fetched 56,335 players and loaded none of them, and nothing
     complained, because "the parser returned nothing" and "there was nothing to
     return" look identical from the outside. A run that comes back thin fails
     loudly and writes no file, rather than quietly replacing a working dataset
     with an empty one. */
  if (thin.length) {
    console.error(`\n${thin.length} season(s) came back under ${MIN_ROWS_PER_SEASON} rows:`);
    for (const t of thin) console.error('  ' + t);
    console.error('\nA real NBA season has 400 to 600 player rows. This is a broken parser or a');
    console.error('blocked fetch, not a thin league. Nothing was written. See the header of this');
    console.error('file for why the parsing is by data-stat name and never by column position.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(all) + '\n');

  const teamSeasons = new Set(all.map(r => `${r.t}_${r.s}`));
  console.log(`\nWrote ${path.relative(process.cwd(), out)}`);
  console.log(`  ${all.length} player-seasons across ${teamSeasons.size} team-seasons`);
  console.log('\nNext: node hoops/build/build-players.mjs --from ' + path.relative(process.cwd(), out));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
