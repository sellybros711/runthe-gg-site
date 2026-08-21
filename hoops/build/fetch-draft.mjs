/* Stage 2: who was drafted when, and out of where.
 *
 *   node hoops/build/fetch-draft.mjs --from 1960 --to 2026
 *
 * Writes hoops/build/raw/nba_draft.json: a flat map of Basketball-Reference
 * player id to { dr, col }.
 *
 * ── WHY THIS IS A SEPARATE PASS ────────────────────────────────────────────
 *
 * Draft year and college are chemistry inputs. Two men out of the same draft
 * class, or the same college, get a link the position and team formula cannot
 * infer, and NEITHER FACT IS ON A SEASON PAGE. Without this pass both links are
 * dead on real data: not wrong, just permanently silent, which is the sort of
 * gap that survives for a year because nothing fails.
 *
 * ── WHY THE DRAFT PAGES AND NOT THE PLAYER PAGES ───────────────────────────
 *
 * Both facts are on every player's own page, and there are about five thousand
 * players. At the throttle Basketball-Reference needs that is four and a half
 * hours and tens of thousands of requests, for two fields.
 *
 * One draft page carries every pick in that year WITH both fields, so the whole
 * league costs one request per year: about seventy, in four minutes. That is a
 * 70x saving for the same answer, and the reason to reach for it is the same
 * reason build-register.mjs walks index pages rather than player pages.
 *
 * WHAT IT MISSES, on purpose: undrafted players get no row, and correctly so.
 * An undrafted man has no draft class, so a null here is a link that never
 * fires rather than a link that fires wrongly. He also gets no college from
 * this pass even if he went to one, which is a real gap and is reported at the
 * end rather than hidden.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bbrRows, cell } from './fetch-nba.mjs';

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

async function main() {
  const from = Number(arg('from', 1960));
  const to = Number(arg('to', new Date().getUTCFullYear()));
  const out = path.resolve(arg('out', path.join(RAW_DIR, 'nba_draft.json')));

  console.log(`Fetching NBA drafts ${from} to ${to}.`);
  console.log(`One page a year at ${BBR_WAIT}ms apart: about ${Math.ceil((to - from + 1) * BBR_WAIT / 60000)} minutes.\n`);

  const byPlayer = {};
  let empty = 0;

  for (let year = from; year <= to; year++) {
    const html = await get(`${BBR}/draft/NBA_${year}.html`);
    await sleep(BBR_WAIT);
    if (!html) { console.log(`  ${year}  no page`); continue; }

    let n = 0;
    for (const r of bbrRows(html)) {
      /* A draft page lists one row per pick, and the college cell is the one
         thing on it that is not about basketball played in the NBA. */
      const college = cell(r, 'college_name', 'college');
      byPlayer[r.slug] = {
        dr: year,
        col: college && college !== '' ? college : null,
      };
      n++;
    }
    if (!n) empty++;
    console.log(`  ${year}  ${String(n).padStart(3)} picks`);
  }

  const total = Object.keys(byPlayer).length;
  const withCollege = Object.values(byPlayer).filter(v => v.col).length;

  /* A draft year with no picks is a parser failure, not a year nobody drafted
     anybody. One or two can be a genuinely missing page; a run of them is the
     same silent zero the season fetch guards against. */
  if (empty > 3 || total < (to - from) * 20) {
    console.error(`\n${empty} year(s) returned no picks and ${total} players were found in total.`);
    console.error('A real NBA draft year has 30 to 200 picks. This is a broken parser or a');
    console.error('blocked fetch. Nothing was written.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(byPlayer) + '\n');

  console.log(`\nWrote ${path.relative(process.cwd(), out)}`);
  console.log(`  ${total} drafted players, ${withCollege} of them with a college on the page`);
  console.log(`  (undrafted players are absent by design: no draft class is not a draft class of null)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
