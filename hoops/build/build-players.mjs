/* Pricing, and the file the game actually loads.
 *
 *   node hoops/build/build-players.mjs            price the hand-entered seed
 *   node hoops/build/build-players.mjs --from raw/nba_player_seasons.json
 *
 * Reads one row per player-season, puts a price on every one of them, and
 * writes hoops/data/players.json. The seed and the real fetch both land here,
 * so pricing is decided in exactly one place no matter where the rows came
 * from, and a pipeline run cannot quietly reprice the league by accident.
 *
 * ── WHY THE CURVE LOOKS LIKE THIS ──────────────────────────────────────────
 *
 * price = BASE + (MAX - BASE) * t^K, where t is how far a player's win shares
 * sit between a replacement player and the best season anyone has had.
 *
 * BOTH ENDS ARE PINNED whatever K is: the last man on the bench costs BASE and
 * the best player in the data costs MAX. So K only moves what the MIDDLE costs,
 * and the middle is where six slots on a $145M cap actually shop.
 *
 * K IS ABOVE 1 ON PURPOSE, which makes a star cost MORE than his win shares are
 * worth per dollar. That is the entire decision in the draft. At K = 1 the
 * price is linear in value, every player is the same deal, and the right play is
 * always "take the best one on the board", which is not a game. At 1.45 a
 * superstar is a luxury you pay a premium for and then have to fill four slots
 * out of what is left.
 *
 * THE CAP HAS TO SAY NO. $145M is roughly the real NBA cap, and against this
 * curve it bites where it should: best-available on every spin runs to about
 * $300M and busts by game one, one superstar plus a very good second plus four
 * solid role players lands at about $140M and just fits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedPlayerSeasons } from './seed-rosters.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', 'data');

export const PRICING = {
  BASE_MUSD: 2,
  MAX_MUSD: 60,
  K: 1.45,
  /* Win shares at each end of the scale. REPLACEMENT is what a end-of-bench
     player is worth over a season, and TOP is where the curve tops out: a
     handful of seasons in history clear 18 and they all cost the max, which is
     correct, because in a game with one price ceiling they are all "the most
     expensive player you can sign". */
  REPLACEMENT_WS: 0.5,
  TOP_WS: 18,
};

export function priceOf(winShares) {
  const P = PRICING;
  const span = P.TOP_WS - P.REPLACEMENT_WS;
  const t = Math.max(0, Math.min(1, (winShares - P.REPLACEMENT_WS) / span));
  const price = P.BASE_MUSD + (P.MAX_MUSD - P.BASE_MUSD) * Math.pow(t, P.K);
  return Math.round(price * 10) / 10;
}

/* A curated family whose ids are not in the data never fires, and a TYPO in one
   of those ids is exactly the same thing: silent. So every build says which
   families are live and which are waiting on players the data does not hold
   yet. Not an error, because most of them are waiting on a fuller dataset by
   design, but never invisible either. */
function reportCuratedChemistry(priced) {
  const file = path.join(DATA_DIR, 'chemistry.json');
  if (!fs.existsSync(file)) return;
  const have = new Set(priced.map((p) => p.i));
  const { families = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));

  const live = [];
  const waiting = [];
  for (const fam of families) {
    const present = (fam.ids || []).filter((id) => have.has(id));
    // A family needs two of its members present before any link can fire.
    if (present.length >= 2) live.push(`${fam.label} (${present.length})`);
    else waiting.push(fam.label);
  }

  console.log(`  chemistry: ${live.length} of ${families.length} curated families live`);
  if (live.length) console.log(`    live: ${live.join(', ')}`);
  if (waiting.length) console.log(`    waiting on data: ${waiting.length} more`);
}

function main() {
  const fromArg = process.argv.indexOf('--from');
  let rows, source;

  if (fromArg !== -1 && process.argv[fromArg + 1]) {
    const file = path.resolve(process.argv[fromArg + 1]);
    rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    source = path.relative(process.cwd(), file);
  } else {
    rows = seedPlayerSeasons();
    source = 'the hand-entered seed (hoops/build/seed-rosters.mjs)';
  }

  /* WHO IS WORTH PUTTING ON A BOARD.
   *
   * A real NBA season is about 500 player-seasons and most of them are men who
   * barely played. Fifty seasons of that is 25,000 rows, the large majority of
   * which are a fourth-string centre who appeared in nine games. Ship all of
   * them and two things break at once: the wheel spends most of its time on
   * players nobody has heard of, and the file the browser downloads triples for
   * the privilege.
   *
   * So a row has to clear a floor of real playing time. Twelve minutes a night
   * across twenty games is deliberately LOW: it keeps the last man in a real
   * rotation, who is exactly the sort of cheap useful player the cap needs to be
   * able to buy, and drops the man who was called up in March.
   *
   * The seed has no minutes on it at all and is exempt, which is the correct
   * behaviour rather than an oversight: 171 hand-entered rows are all rotation
   * players by construction.
   */
  const MIN_MPG = 12.0;
  const MIN_GAMES = 20;
  const before = rows.length;
  rows = rows.filter((r) => {
    if (typeof r.mp !== 'number') return true;          // the seed, which has none
    return r.mp >= MIN_MPG && (r.g || 0) >= MIN_GAMES;
  });
  if (rows.length !== before) {
    console.log(`  playing time floor: kept ${rows.length} of ${before} rows `
      + `(${MIN_MPG} mpg across ${MIN_GAMES} games)`);
  }

  /* Draft year and college, if the draft pass has been run. Neither is on a
     season page, so without this join both chemistry links that depend on them
     are permanently silent on real data. A player the draft pass never saw keeps
     whatever the source row had, which for the fetcher is null and for the seed
     is the hand-entered value. */
  const draftFile = path.join(HERE, 'raw', 'nba_draft.json');
  let draft = null;
  if (fs.existsSync(draftFile)) draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'));

  const priced = rows.map((row) => {
    const extra = draft && draft[row.i];
    const out = {
      ...row,
      dr: row.dr ?? (extra ? extra.dr : null),
      col: row.col ?? (extra ? extra.col : null),
      p: priceOf(row.w),
    };
    /* Games played was an input to the playing-time floor above and is not read
       by anything at runtime. Every field in this file is downloaded by every
       visitor, so a field nobody uses is bytes on somebody's phone. Minutes
       stays: a draft board saying 34 a night is telling the reader something. */
    delete out.g;
    return out;
  });

  if (draft) {
    const withDraft = priced.filter(p => p.dr).length;
    const withCollege = priced.filter(p => p.col).length;
    console.log(`  joined the draft pass: ${withDraft} rows have a draft year, ${withCollege} a college`);
  } else {
    console.log('  no raw/nba_draft.json, so draft-class and alma-mater chemistry will be sparse.');
    console.log('  Run: node hoops/build/fetch-draft.mjs');
  }

  /* Sorted by season then team then price, so a diff between two builds reads
     as a list of what changed rather than as the whole file moving. */
  priced.sort((a, b) => a.s - b.s || a.t.localeCompare(b.t) || b.w - a.w);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = path.join(DATA_DIR, 'players.json');
  fs.writeFileSync(out, JSON.stringify(priced) + '\n');

  reportCuratedChemistry(priced);

  const teamSeasons = new Set(priced.map((p) => `${p.t}_${p.s}`));
  const prices = priced.map((p) => p.p).sort((a, b) => a - b);
  const at = (q) => prices[Math.floor((prices.length - 1) * q)];

  console.log(`Built ${path.relative(process.cwd(), out)} from ${source}`);
  console.log(`  ${priced.length} player-seasons across ${teamSeasons.size} team-seasons`);
  console.log(`  seasons ${Math.min(...priced.map(p => p.s))} to ${Math.max(...priced.map(p => p.s))}`);
  console.log(`  price: min $${at(0)}M · median $${at(0.5)}M · p90 $${at(0.9)}M · max $${at(1)}M`);
  console.log(`  a six-man roster of median players costs $${(at(0.5) * 6).toFixed(1)}M against a $145M cap`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
