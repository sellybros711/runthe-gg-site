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
const uncomment = (h) => String(h || '').replace(/<!--/g, '').replace(/-->/g, '');

export function bbrRows(html) {
  return (uncomment(html).match(/<tr[\s\S]*?<\/tr>/gi) || []).map((tr) => {
    const slug = /data-append-csv="([a-z0-9.'-]+)"/i.exec(tr);
    if (!slug) return null;                           // a header row is not a player
    const cells = {};
    const re = /data-stat="([a-z0-9_]+)"[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let m;
    while ((m = re.exec(tr))) cells[m[1]] = m[2];
    return { slug: slug[1], cells };
  }).filter(Boolean);
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
  const ws = {};
  for (const r of bbrRows(advanced)) {
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
  for (const r of bbrRows(perGame)) {
    const team = cell(r, 'team_name_abbr', 'team_id', 'team');
    if (/^(TOT|\dTM)$/i.test(team)) continue;

    const shares = ws[`${r.slug}|${team}`];
    if (!shares) continue;

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
      /* College and draft year are chemistry inputs and neither is on a season
         page. build-colleges.mjs fills them from the player pages; until it has
         run they are null, which is a link that correctly never fires rather
         than a link that fires wrongly. */
      col: null,
      dr: null,
    });
  }

  return { year, rows };
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
  for (let y = from; y <= to; y++) {
    const { rows, reason } = await season(y);
    if (rows.length < MIN_ROWS_PER_SEASON) {
      thin.push(`${y}: ${rows.length} rows${reason ? ` (${reason})` : ''}`);
      console.log(`  ${y}  ${String(rows.length).padStart(4)} rows   THIN`);
    } else {
      console.log(`  ${y}  ${String(rows.length).padStart(4)} rows`);
    }
    all.push(...rows);
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
