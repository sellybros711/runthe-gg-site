/* Stage 3: what a player actually won.
 *
 *   node hoops/build/fetch-awards.mjs --from 1974 --to 2025
 *
 * Writes hoops/build/raw/nba_awards.json: a flat map of
 * `${basketball-reference slug}|${season}` to a list of award codes.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The board used to describe each player with badges derived from his own box
 * score: RIM PROTECTOR, CREATOR, NO RANGE. Two things were wrong with that.
 *
 * It read the game's homework out loud. The fit model charges a roster for
 * having no rim protection and no creation, and printing the answer on every
 * tile turned a basketball decision into a matching exercise: collect one of
 * each colour. The knowledge a fan brings is supposed to be the edge.
 *
 * And a badge derived from one season's rate stats states things that are not
 * true about the player. Karl-Anthony Towns took 1.1 threes a game in 2016 and
 * came back labelled NO RANGE, which is a defensible reading of that column and
 * an absurd claim about one of the best shooting big men who ever played.
 *
 * Hardware has neither problem. It is a fact rather than an inference, it is
 * the thing a fan already knows, and knowing that the 1990 Celtics tile in
 * front of you is a five-time All-Star is exactly the kind of recall the game
 * should be rewarding.
 *
 * ── WHY THESE PAGES AND NOT THE PLAYER PAGES ───────────────────────────────
 *
 * Same arithmetic as fetch-draft.mjs. Every award is listed on the player's own
 * page and there are about five thousand players. One award index page carries
 * every winner in history, so eight pages plus one per All-Star game covers the
 * league: about sixty requests instead of five thousand.
 *
 * ── HOW THE PARSING IS WRITTEN, AND WHY ────────────────────────────────────
 *
 * NEVER DEMAND A PARTICULAR WAY OF WRITING A LINK. The draft fetch returned
 * zero picks for sixty-six years across four separate runs because its parser
 * wanted `href="/players/...`, which assumes a relative origin, a double quote
 * and nothing after `.html`. That lesson is why nothing below names a table id,
 * a column, or a link format. A row is asked two questions:
 *
 *   which season is this        a /leagues/NBA_YYYY link, or a "1995-96" string
 *   which players are on it     every /players/x/slug.html path in the row
 *
 * Both are properties of what the row MEANS rather than of how BBRef chose to
 * mark it up this year, so a redesign that renames a column does not silently
 * return nothing. check-fetch.mjs runs every parser here against saved markup.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uncomment, rowChunks } from './fetch-nba.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(HERE, 'raw');

const BBR = 'https://www.basketball-reference.com';
const UA = 'RunTheGG/1.0 (+https://runthe.gg)';
const BBR_WAIT = Number(process.env.BBR_WAIT || 3200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/* ── THE AWARDS, AND WHAT EACH ONE IS WORTH ────────────────────────────────
 *
 * The order is the order they are shown in: a tile has room for one plate and
 * shows the best thing on the list. Codes are short because they ship to every
 * visitor 16,000 times.
 *
 * A ring is above every individual honour except the two MVPs and a first team
 * because it is the thing the game is about: the run ends with a bracket, and
 * a player who has actually done it is the one you want. It sits below All-NBA
 * First Team because a twelfth man on a champion gets it too.
 */
export const AWARDS = [
  { code: 'mvp', label: 'MVP', major: true },
  { code: 'fmvp', label: 'Finals MVP', major: true },
  { code: 'an1', label: 'All-NBA 1st', major: true },
  { code: 'dpoy', label: 'Defensive POY', major: true },
  { code: 'ring', label: 'Champion', major: true },
  { code: 'an2', label: 'All-NBA 2nd', major: false },
  { code: 'an3', label: 'All-NBA 3rd', major: false },
  { code: 'roy', label: 'Rookie of the Year', major: false },
  { code: 'smoy', label: 'Sixth Man', major: false },
  { code: 'mip', label: 'Most Improved', major: false },
  { code: 'ad1', label: 'All-Defensive 1st', major: false },
  { code: 'ad2', label: 'All-Defensive 2nd', major: false },
  { code: 'star', label: 'All-Star', major: false },
];
export const AWARD_RANK = Object.fromEntries(AWARDS.map((a, i) => [a.code, i]));

/* The single-winner pages. One row per season, one player on it.
 *
 * `first` is the season the award was FIRST GIVEN, and it is what the guard at
 * the bottom counts against. An award invented in 1983 has 43 winners in a
 * 1974-2025 window and not 52, so a floor written as "about one a year across
 * the whole range" fails three of these six on perfectly good data. That is the
 * mistake this file already made once. */
const SOLO_PAGES = [
  { code: 'mvp', url: '/awards/mvp.html', first: 1956 },
  { code: 'fmvp', url: '/awards/finals_mvp.html', first: 1969 },
  { code: 'dpoy', url: '/awards/dpoy.html', first: 1983 },
  { code: 'roy', url: '/awards/roy.html', first: 1953 },
  { code: 'smoy', url: '/awards/smoy.html', first: 1983 },
  { code: 'mip', url: '/awards/mip.html', first: 1986 },
];

/* The team pages. One row per season PER TIER, five players on it, and a cell
   somewhere on the row saying which tier. */
const TEAM_PAGES = [
  { url: '/awards/all_league.html', tiers: { '1st': 'an1', '2nd': 'an2', '3rd': 'an3' } },
  { url: '/awards/all_defense.html', tiers: { '1st': 'ad1', '2nd': 'ad2' } },
];

// ── the two questions a row is asked ────────────────────────────────────────

const PLAYER_PATH = /\/players\/[a-z]\/([a-z0-9.'-]+)\.html/gi;

/** Every player slug in this chunk of markup, in the order they appear, once
 *  each. A row that lists the same man twice is one man. */
export function slugsIn(html) {
  const out = [];
  const seen = new Set();
  PLAYER_PATH.lastIndex = 0;
  let m;
  while ((m = PLAYER_PATH.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
}

/**
 * Which season a row is about, as the ending year: 1996 for 1995-96.
 *
 * A /leagues/NBA_1996.html link is asked for first because it is unambiguous
 * and it is what BBRef actually puts in the season cell. The "1995-96" text is
 * the fallback, and it is the reason this cannot just read a four digit number:
 * the row for 1999-00 ends in the year 2000 and the row for 1995-96 does not
 * end in 1995. Getting that backwards attaches every award to the wrong season
 * and nothing about the output looks broken.
 */
export function seasonIn(html) {
  const link = /\/leagues\/[A-Z]{3}_(\d{4})\.html/.exec(html);
  if (link) return Number(link[1]);
  const span = /\b(\d{4})-(\d{2})\b/.exec(html);
  if (span) {
    const start = Number(span[1]);
    const end = Number(span[2]);
    // 1999-00 rolls the century; 1995-96 does not.
    const century = Math.floor(start / 100) * 100;
    const full = century + end;
    return full > start ? full : full + 100;
  }
  const bare = /\b(19|20)\d{2}\b/.exec(html);
  return bare ? Number(bare[0]) : null;
}

/** A single-winner page: (season, slug) for every row that has both. */
export function parseSolo(html) {
  const out = [];
  for (const tr of rowChunks(uncomment(html))) {
    const season = seasonIn(tr);
    const slugs = slugsIn(tr);
    if (!season || !slugs.length) continue;
    /* THE FIRST PLAYER LINK ON THE ROW IS THE WINNER. These pages carry the
       voting share columns, not the whole ballot, so a row is the winner plus
       his club. Any further player link on the row would be a surprise and is
       ignored rather than counted as a co-winner. */
    out.push({ season, slug: slugs[0] });
  }
  return out;
}

/* "1st", and also "1st Team", because which of those BBRef writes is a
   presentation choice and the tier is the same tier either way. */
const TIER_TEXT = />\s*(1st|2nd|3rd)(?:\s+Team)?\s*</i;

/** An All-NBA or All-Defensive page: (season, tier, slugs) per row. */
export function parseTeams(html, tiers) {
  const out = [];
  for (const tr of rowChunks(uncomment(html))) {
    const season = seasonIn(tr);
    if (!season) continue;
    const tierM = TIER_TEXT.exec(tr);
    if (!tierM) continue;
    const code = tiers[tierM[1].toLowerCase()];
    if (!code) continue;
    const slugs = slugsIn(tr);
    if (!slugs.length) continue;
    out.push({ season, code, slugs });
  }
  return out;
}

/**
 * An All-Star game page: every player who was on a roster.
 *
 * SCOPED TO THE ROSTER TABLES, not the page. An All-Star page also carries the
 * box score's own links, the coaches, and a navigation strip, and a scan of
 * every player path on it would sweep in whoever the sidebar happens to be
 * promoting. A roster row is a table row with a player path in it, which is the
 * same test the rest of this file uses.
 */
export function parseAllStars(html) {
  const seen = new Set();
  for (const tr of rowChunks(uncomment(html))) {
    for (const slug of slugsIn(tr)) seen.add(slug);
  }
  return [...seen];
}

// ── the fetch ───────────────────────────────────────────────────────────────

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

function add(byKey, slug, season, code) {
  const key = `${slug}|${season}`;
  const list = byKey[key] || (byKey[key] = []);
  if (!list.includes(code)) list.push(code);
}

async function main() {
  const from = Number(arg('from', 1974));
  const to = Number(arg('to', new Date().getUTCFullYear()));
  const out = path.resolve(arg('out', path.join(RAW_DIR, 'nba_awards.json')));
  const inRange = (y) => y >= from && y <= to;

  const pages = SOLO_PAGES.length + TEAM_PAGES.length + (to - from + 1);
  console.log(`Fetching NBA awards ${from} to ${to}.`);
  console.log(`${pages} pages at ${BBR_WAIT}ms apart: about ${Math.ceil(pages * BBR_WAIT / 60000)} minutes.\n`);

  const byKey = Object.create(null);
  const counts = Object.create(null);
  const empty = [];

  for (const page of SOLO_PAGES) {
    const html = await get(BBR + page.url);
    await sleep(BBR_WAIT);
    if (!html) { empty.push(`${page.url} (no page)`); console.log(`  ${page.code.padEnd(5)} no page`); continue; }
    let n = 0;
    for (const row of parseSolo(html)) {
      if (!inRange(row.season)) continue;
      add(byKey, row.slug, row.season, page.code);
      n++;
    }
    counts[page.code] = n;
    if (!n) empty.push(page.url);
    console.log(`  ${page.code.padEnd(5)} ${String(n).padStart(3)} winners`);
  }

  for (const page of TEAM_PAGES) {
    const html = await get(BBR + page.url);
    await sleep(BBR_WAIT);
    if (!html) { empty.push(`${page.url} (no page)`); console.log(`  ${page.url} no page`); continue; }
    let n = 0;
    for (const row of parseTeams(html, page.tiers)) {
      if (!inRange(row.season)) continue;
      for (const slug of row.slugs) { add(byKey, slug, row.season, row.code); n++; }
      counts[row.code] = (counts[row.code] || 0) + row.slugs.length;
    }
    if (!n) empty.push(page.url);
    /* PER TIER, not just per page. When this failed the first time the log said
       "735 selections" and nothing about how they split, so working out whether
       the first team had come back right meant inferring it from a total. */
    const split = Object.values(page.tiers)
      .map((c) => `${c} ${counts[c] || 0}`).join(' · ');
    console.log(`  ${page.url.padEnd(28)} ${String(n).padStart(4)} selections  (${split})`);
  }

  let starYears = 0;
  for (let year = from; year <= to; year++) {
    const html = await get(`${BBR}/allstar/NBA_${year}.html`);
    await sleep(BBR_WAIT);
    /* 1999 had no All-Star game, so a missing page is a real answer here and
       not a failure. The guard below is on the TOTAL, which is what a broken
       parser would flatten. */
    if (!html) { console.log(`  all-star ${year}  no game`); continue; }
    const slugs = parseAllStars(html);
    for (const slug of slugs) add(byKey, slug, year, 'star');
    counts.star = (counts.star || 0) + slugs.length;
    if (slugs.length) starYears++;
    console.log(`  all-star ${year}  ${String(slugs.length).padStart(3)} selections`);
  }

  const keys = Object.keys(byKey).length;
  const years = to - from + 1;

  /* ── THE TALLY PRINTS BEFORE THE GUARD, ALWAYS ────────────────────────────
   * The first version printed it after, so the one run that failed threw away
   * the only evidence that would have said WHICH award came back wrong, and the
   * per-tier split had to be inferred from a page total. A failure should carry
   * its evidence: fetch-draft.mjs learned this the same expensive way. */
  console.log(`\n  ${keys} player-seasons carry at least one award.`);
  for (const a of AWARDS) {
    if (a.code === 'ring') continue;   // added at build time from teams.json
    console.log(`    ${a.label.padEnd(20)} ${String(counts[a.code] || 0).padStart(5)}`);
  }
  console.log('');

  /* ── THE SILENT ZERO GUARD ────────────────────────────────────────────────
   *
   * The whole reason fetch-draft.mjs has one: a broken parser and an award
   * nobody won produce the same empty list, and this runs where nobody is
   * watching it.
   *
   * EVERY BOUND BELOW IS ANCHORED TO A FACT ABOUT THE AWARD rather than to an
   * estimate, because the first version of this guard was an estimate and it
   * failed a perfectly good fetch. It asked for "player-seasons carrying any
   * award" to clear 40 a season; the real answer is 32, because the awards
   * OVERLAP heavily (an MVP is also an All-NBA first teamer and an All-Star,
   * and all three land on one player-season). Nothing about that number was
   * knowable in advance, so it should never have been the test.
   *
   * What IS knowable: when each award started, and how many go out a year.
   */
  const problems = [];
  if (empty.length) problems.push(`${empty.length} page(s) yielded nothing: ${empty.join(', ')}`);

  /* Seasons in the fetched window during which this award existed at all. */
  const eligible = (first) => Math.max(0, Math.min(to, 2100) - Math.max(from, first) + 1);

  for (const page of SOLO_PAGES) {
    const n = counts[page.code] || 0;
    const want = eligible(page.first);
    if (!want) continue;
    /* Under one a season means winners are being missed. Well over one means
       the WRONG TABLE was read, which is the silent failure: if one of these
       pages ever carries the full ballot, every player who took a third-place
       vote comes back a winner and the file is bigger rather than smaller.
       The 1.4 ceiling covers the ABA, which gave its own awards alongside the
       NBA's until 1976, and a shared award. Nothing beyond that. */
    if (n < want * 0.9) {
      problems.push(`${page.code}: ${n} winners across ${want} seasons of the award `
        + `(first given ${page.first}), expected about one a year`);
    }
    if (n > want * 1.4) {
      problems.push(`${page.code}: ${n} winners across ${want} seasons of the award, `
        + 'far more than one a year. This reads as a ballot table rather than a winners table.');
    }
  }

  /* Five men make a team, every season, in both awards. */
  for (const [code, label] of [['an1', 'All-NBA 1st'], ['ad1', 'All-Defensive 1st']]) {
    const n = counts[code] || 0;
    if (n < years * 4.5) problems.push(`${label}: ${n} across ${years} seasons, expected five a season`);
    if (n > years * 7) problems.push(`${label}: ${n} across ${years} seasons, which is more than a team a year`);
  }

  if (starYears < years * 0.85) problems.push(`only ${starYears} of ${years} seasons produced an All-Star roster`);
  /* DERIVED, NOT GUESSED. Every All-Star is a player-season with an award on
     it, so the total can never be below the number of distinct All-Stars, and a
     total that is not comfortably above it means the other nine awards joined
     to nobody. */
  if (keys < (counts.star || 0) * 0.9) {
    problems.push(`${keys} player-seasons carry an award but ${counts.star} All-Star selections were read, `
      + 'so selections are being lost between the fetch and the file');
  }

  if (problems.length) {
    console.error('\nTHIS FETCH DID NOT WORK, and nothing has been written.\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nA broken parser and an award nobody won produce the same empty list, so');
    console.error('these floors exist to tell them apart. The player data is unaffected: with');
    console.error('no awards file the tiles simply show no hardware, which is what they did');
    console.error('before this pass existed.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(byKey) + '\n');

  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
  console.log('\n  Championships are NOT fetched: teams.json already knows every title year,');
  console.log('  and build-players.mjs attaches the ring to everyone on that roster.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
