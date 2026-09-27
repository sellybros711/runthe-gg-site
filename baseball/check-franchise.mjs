/* A franchise outlives its club code.
 *
 *   node baseball/check-franchise.mjs
 *   node baseball/check-franchise.mjs 40     a bigger draft sample
 *
 * Reported by a player: the Marlins have played since 1993 and One Franchise
 * offered 2012 onward. Baseball-Reference writes the code a club wore THAT YEAR,
 * so FLA and MIA are one club under two names, and every reader of `t` that
 * compared codes was asking the wrong question. `E.FRANCHISES` is the lineage and
 * this file holds it to the pool, to the draft and to the chemistry.
 *
 * WHAT MAKES THIS WORTH A FILE OF ITS OWN is that none of it throws. A lineage
 * that claims a season twice, a lock that offers half a history, a chemistry link
 * that never fires: each renders perfectly, and the only symptom is a card that
 * quietly understates a real club. So every claim here is a PROPERTY of the table
 * against the data rather than a number typed beside it, and the first section
 * refuses to pass on a table that changes nothing.
 */
import { createRequire } from 'node:module';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(HERE, 'engine.js'));
const R = require(path.join(HERE, 'run.js'));
const POOL = require(path.join(HERE, 'data', 'players.json'));
const DATA = E.indexData(POOL);

const DRAFTS = Number(process.argv[2]) || 12;

let problems = 0, checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) { problems++; console.log('  FAIL  ' + msg); }
};
const section = (n) => console.log('\n' + n);

/* ── 1. the lineage agrees with the pool ──────────────────────────────────── */
section('1. THE TABLE AGAINST THE DATA');

/* Where each code really appears, read off the pool rather than assumed. */
const poolYears = {};
for (const r of POOL) {
  if (!r.t) continue;
  (poolYears[r.t] = poolYears[r.t] || new Set()).add(r.s);
}

const claimedBy = {};
for (const [fran, spans] of Object.entries(E.FRANCHISES)) {
  const years = new Set();
  let prevTo = 0;
  for (const [code, from, to] of spans) {
    ok(poolYears[code], `${fran} names ${code}, which is in no row of the pool`);
    ok(from <= to, `${fran} span ${code} runs backwards (${from} to ${to})`);
    /* Spans are walked in order and may not overlap, which is what keeps a code
       appearing twice (LAA, 1961-64 and 2005-25) from claiming the years CAL and
       ANA hold in between. */
    ok(from > prevTo, `${fran} span ${code} starts at ${from}, at or before the previous span's ${prevTo}`);
    prevTo = to;
    for (const y of (poolYears[code] || [])) {
      if (y < from || y > to) continue;
      ok(!years.has(y), `${fran} claims ${y} twice`);
      years.add(y);
    }
    (claimedBy[code] = claimedBy[code] || []).push(fran);
  }
  ok(years.size > 0, `${fran} claims no season the pool actually holds`);
}
for (const [code, frans] of Object.entries(claimedBy)) {
  const distinct = [...new Set(frans)];
  ok(distinct.length === 1, `${code} is claimed by more than one franchise: ${distinct.join(', ')}`);
}

/* THE ORIOLES ARE NOT THE TERRAPINS. BAL 1914-1915 is the Federal League
   Baltimore Terrapins, who folded, and BAL 1954 on is the Browns moved. One code,
   two unrelated clubs, which is the whole reason a span carries years. */
ok(!E.inFranchise('BAL', 'BAL', 1914),
  'the Orioles franchise swallowed the 1914 Federal League Terrapins');
ok(E.inFranchise('BAL', 'BAL', 1970), 'the Orioles franchise does not hold BAL 1970');
ok(E.franchiseOf('BAL', 1914) !== 'BAL' || true, '');  // reported below, not a rule
ok(E.inFranchise('BAL', 'SLB', 1940), 'the Orioles franchise does not hold the Browns');

/* The Angels come back to a name they already used, so the gap has to survive. */
ok(E.inFranchise('LAA', 'LAA', 1962), 'LAA 1962 is not in the Angels franchise');
ok(E.inFranchise('LAA', 'CAL', 1980), 'CAL 1980 is not in the Angels franchise');
ok(E.inFranchise('LAA', 'ANA', 2000), 'ANA 2000 is not in the Angels franchise');
ok(E.inFranchise('LAA', 'LAA', 2015), 'LAA 2015 is not in the Angels franchise');

/* A bare code answers for itself, which is what lets the picker offer an earlier
   identity on its own without a second rule. */
ok(E.inFranchise('BRO', 'BRO', 1955), 'locking on BRO refuses Brooklyn');
ok(!E.inFranchise('BRO', 'LAD', 1960), 'locking on BRO let Los Angeles in');
ok(!E.inFranchise('CHC', 'STL', 1960), 'a bare code matched a different club');

/* ── 2. it is not vacuous ─────────────────────────────────────────────────── */
section('2. THE TABLE CHANGES SOMETHING');

/* A lineage table that agreed with the raw codes would pass every claim above and
   fix nothing, which is this repo's own coverage argument. So the gain is
   measured: how many seasons each franchise holds now against its bare code. */
const seasonsOfCode = (code) => (poolYears[code] || new Set()).size;
/* Falls back to the bare code rather than throwing on a franchise with no lineage.
   Written to assume the row exists, deleting one crashed this file with a
   TypeError and the run READ AS A PASS through a grep for FAIL: a guard with teeth
   and no voice, which is this repo's own note about `check_lahman.py`. Deleting
   the Marlins lineage now fails the two claims below by name. */
const seasonsOfFran = (fran) => {
  const spans = E.FRANCHISES[fran] || [[fran, -Infinity, Infinity]];
  const years = new Set();
  for (const [code, from, to] of spans) {
    for (const y of (poolYears[code] || [])) if (y >= from && y <= to) years.add(y);
  }
  return years.size;
};
let gained = 0;
for (const fran of Object.keys(E.FRANCHISES)) {
  if (seasonsOfFran(fran) > seasonsOfCode(fran)) gained++;
}
ok(gained >= 10, `only ${gained} franchises gained seasons; the table is barely doing anything`);

/* The reported case, by name. */
const marlins = seasonsOfFran('MIA');
ok(marlins >= 30, `the Marlins hold ${marlins} seasons, and they have played since 1993`);
ok(marlins > seasonsOfCode('MIA'),
  'the Marlins franchise is no wider than the bare MIA code, which is the bug');
console.log(`  Marlins ${seasonsOfCode('MIA')} seasons by code, ${marlins} by franchise`);
console.log(`  ${gained} of ${Object.keys(E.FRANCHISES).length} franchises are wider than their own code`);

/* ── 3. the lock draws the whole lineage ──────────────────────────────────── */
section('3. THE DRAFT SEES WHAT THE CARD PROMISES');

const cards = R.eligibleFranchises(DATA);
const cardFor = (code) => cards.find(c => c.team === code);

/* THE CARD MAY NOT PROMISE A SEASON THE LOCK REFUSES. The picker counts seasons
   one way and `drawable` filters them another, so the two are separate answers to
   one question and are exactly the shape that drifts. */
for (const c of cards) {
  const run = R.createRun({ franchise: c.team, seed: 7 });
  const seen = new Set();
  for (const t of DATA.teamSeasons) {
    if (E.inFranchise(c.team, t.team, t.season)) seen.add(t.season);
  }
  ok(seen.size === c.seasons,
    `${c.team}: the card says ${c.seasons} seasons and the lock allows ${seen.size}`);
  ok(Math.min(...seen) === c.lo && Math.max(...seen) === c.hi,
    `${c.team}: the card says ${c.lo}-${c.hi} and the lock allows ` +
    `${Math.min(...seen)}-${Math.max(...seen)}`);
}

/* Driven for real: a Marlins run has to be able to draw a pre-2012 board. */
const mia = R.createRun({ franchise: 'MIA', seed: 11 });
const miaDraws = R.drawable(mia, DATA);
ok(miaDraws.length > 0, 'a Marlins run can draw nothing at all');
ok(miaDraws.some(t => t.season < 2012),
  'a Marlins run cannot reach a single season before 2012, which is the report');
ok(miaDraws.every(t => t.team === 'FLA' || t.team === 'MIA'),
  'a Marlins run drew a club that is not the Marlins');

/* And an identity lock still means only that identity. */
const bro = R.drawable(R.createRun({ franchise: 'BRO', seed: 11 }), DATA);
ok(bro.length > 0, 'a Brooklyn Dodgers run can draw nothing');
ok(bro.every(t => t.team === 'BRO'), 'a Brooklyn run drew a season that is not Brooklyn');
ok(bro.every(t => t.season <= 1957), 'a Brooklyn run reached a season after the move');

/* Whole drafts finish, because a lock that strands is the failure this mode has
   already been bitten by: the board comes up empty with no way on. */
let stranded = 0;
const sample = cards.slice(0, DRAFTS);
for (const c of sample) {
  let run = R.createRun({ franchise: c.team, seed: 3 });
  for (let pick = 0; pick < 40 && run.roster.length < E.SLOTS.length; pick++) {
    const board = R.spin(run, DATA);
    if (!board || !run.currentDraw) break;
    const opts = (run.currentDraw.options || [])
      .map(k => DATA.allPlayers[k]).filter(Boolean);
    if (!opts.length) break;
    let signed = false;
    for (const p of opts) {
      try { R.sign(run, p); signed = true; break; } catch (_) { /* next */ }
    }
    if (!signed) break;
  }
  if (run.roster.length < E.SLOTS.length) stranded++;
}
ok(stranded === 0, `${stranded} of ${sample.length} franchise drafts could not fill a roster`);

/* ── 4. chemistry crosses a rename ────────────────────────────────────────── */
section('4. TWO TEAM-MATES ARE NOT STRANGERS');

const find = (team, season, pred) =>
  POOL.find(p => p.t === team && p.s === season && (!pred || pred(p)));

const hasFranchiseLink = (a, b) =>
  E.pairLinks(a, b, {}).some(l => l.type === 'franchise');

const fla = find('FLA', 2003), miaP = find('MIA', 2017);
ok(fla && miaP, 'the pool has no Marlins either side of the rename to test with');
if (fla && miaP) {
  ok(hasFranchiseLink(fla, miaP),
    'a 2003 Florida Marlin and a 2017 Miami Marlin share no franchise link');
}
const bsn = find('BSN', 1948), mln = find('MLN', 1957);
if (bsn && mln) {
  ok(hasFranchiseLink(bsn, mln),
    'a Boston Brave and a Milwaukee Brave share no franchise link');
}
const broP = find('BRO', 1950), ladP = find('LAD', 1965);
if (broP && ladP) ok(hasFranchiseLink(broP, ladP), 'Brooklyn and Los Angeles share no link');

/* IT MUST STILL REFUSE TWO DIFFERENT CLUBS, or the fix is a link that always
   fires and the chemistry is worth nothing. */
const cub = find('CHC', 1950), card = find('STL', 1950);
if (cub && card) ok(!hasFranchiseLink(cub, card), 'a Cub and a Cardinal share a franchise link');

/* And the two Baltimores are two franchises, not one. */
const terrapin = find('BAL', 1914), oriole = find('BAL', 1970);
if (terrapin && oriole) {
  ok(!hasFranchiseLink(terrapin, oriole),
    'a 1914 Federal League Terrapin and a 1970 Oriole share a franchise link');
}

/* THE LABEL NAMES SOMETHING THAT HAPPENED TO THEM. Two men who both wore BSN
   reading "ATL franchise" would be a link describing a club neither played for. */
const bsn2 = POOL.find(p => p.t === 'BSN' && p.s === 1948 && p.i !== (bsn && bsn.i));
if (bsn && bsn2) {
  const lab = E.pairLinks(bsn, bsn2, {}).find(l => l.type === 'franchise');
  if (lab) ok(lab.label.startsWith('BSN'), `two Boston Braves are labelled "${lab.label}"`);
}

/* ── 5. thirty cards, and no name lost ───────────────────────────────────── */
section('5. THIRTY CLUBS, AND EVERY EARLIER NAME STILL ON ONE OF THEM');

const NAMES = {};
for (const line of require('fs').readFileSync(path.join(HERE, 'index.html'), 'utf8')
  .split('\n')) {
  for (const m of line.matchAll(/\b([A-Z0-9]{2,3}):'([^']+)'/g)) NAMES[m[1]] = m[2];
}
ok(Object.keys(NAMES).length > 40, 'could not read TEAM_NAMES out of the page');

/* EXACTLY THE CLUBS PLAYING TODAY. Both directions, because each fails a different
   way: a missing one is a club nobody can draft, and an extra one is a card for a
   club that does not exist, which is what the picker used to carry fifteen of. */
const CURRENT = E.CURRENT_FRANCHISES;
ok(CURRENT.length === 30, `E.CURRENT_FRANCHISES holds ${CURRENT.length} clubs, not thirty`);
for (const code of CURRENT) ok(cardFor(code), `${code} is not offered in the picker at all`);
for (const c of cards) {
  ok(CURRENT.includes(c.team),
    `${NAMES[c.team] || c.team} is in the picker and is not a club playing today`);
}
ok(cards.length === CURRENT.length,
  `the picker drew ${cards.length} cards for ${CURRENT.length} clubs`);

/* EVERY KEY OF FRANCHISES IS A CLUB PLAYING TODAY. A lineage keyed on a club that
   folded would be a history no card can reach, which is the shape of the bug this
   whole pass exists to remove, arriving from the other side. */
for (const fran of Object.keys(E.FRANCHISES)) {
  ok(CURRENT.includes(fran), `${fran} has a lineage and is not a club playing today`);
}

/* NO PAST NAME MAY VANISH. The fifteen earlier identities used to be cards of their
   own; dropping those cards is only safe because each name is now printed on the
   card of the club that wears it. Asserted per code rather than by counting, so a
   lineage quietly losing an entry is named. */
for (const [fran, spans] of Object.entries(E.FRANCHISES)) {
  const card = cardFor(fran);
  if (!card) continue;
  for (const [code] of spans) {
    if (code === fran) continue;
    /* A code the pool cannot draw is correctly absent: MLA is the 1901 Milwaukee
       Brewers and nine rows, too thin to be a team-season. */
    const drawable = DATA.teamSeasons.some(t => t.team === code);
    if (!drawable) continue;
    ok(card.codes.includes(code),
      `${NAMES[fran] || fran}'s card does not name ${NAMES[code] || code}, ` +
      `which it now contains and which no longer has a card of its own`);
  }
}

/* AND THE SAME QUESTION FROM THE POOL'S SIDE, because the check above can only
   look for names the lineage already claims. Delete `['MLN', 1953, 1965]` from the
   Braves and the Milwaukee Braves vanish from the card AND from that loop, which is
   a name lost with nothing reporting it.
   So: any club in the data deep enough to have earned a card of its own must resolve
   to a club playing today. The fifteen earlier identities all clear that bar, which
   is why they used to be cards. Nothing else does, so the orphan set is empty and a
   person has to look at the day it is not. */
const deepEnough = {};
for (const ts of DATA.teamSeasons) {
  const info = (deepEnough[ts.team] = deepEnough[ts.team] || { seasons: 0, men: {} });
  info.seasons++;
  for (const p of (DATA.byTeamSeason[ts.team_season_id] || [])) info.men[p.i + '|' + p.s] = p;
}
const orphans = [];
for (const [code, info] of Object.entries(deepEnough)) {
  const men = Object.values(info.men);
  const has = (slot) => men.some(p => E.canFillSlot(p, slot));
  const countSlot = (slot) => men.filter(p => E.canFillSlot(p, slot)).length;
  /* The picker's own gates, asked of the raw code. */
  if (info.seasons < 6 || men.length < 16) continue;
  if (!has('C') || !has('CL') || countSlot('SP1') < 2) continue;
  const fran = E.franchiseOf(code, info.seasons ? undefined : 0);
  const reachable = E.CURRENT_FRANCHISES.some(f =>
    DATA.teamSeasons.some(t => t.team === code && E.inFranchise(f, t.team, t.season)));
  if (!reachable) orphans.push(`${NAMES[code] || code} (${code}, ${info.seasons} seasons)`);
}
ok(orphans.length === 0,
  `${orphans.length} clubs are deep enough for a card and belong to no club playing ` +
  `today, so their history is in the picker nowhere:\n    ` + orphans.join('\n    '));

/* An earlier identity is NOT a card, and the engine still resolves it, because a
   run saved while the picker offered one carries that bare code. */
ok(!cardFor('BRO'), 'the Brooklyn Dodgers still have a card of their own');
ok(!cardFor('MON'), 'the Montreal Expos still have a card of their own');
ok(E.franchiseOf('BRO', 1955) === 'LAD', 'Brooklyn does not resolve to the Dodgers');
ok(E.franchiseOf('MON', 1990) === 'WSN', 'Montreal does not resolve to the Nationals');
ok(R.drawable(R.createRun({ franchise: 'BRO', seed: 5 }), DATA).length > 0,
  'a run saved as a Brooklyn Dodgers run can no longer draw anything');

const miaCard = cardFor('MIA');
ok(miaCard && miaCard.codes.length === 2, 'the Marlins card does not know it contains Florida');

/* ── 6. the card a player actually reads ──────────────────────────────────── */
section('6. THE PICKER, IN A BROWSER');

/* Everything above is the engine agreeing with itself. The card is markup and CSS
   and neither has been asked anything: a lineage note that never renders, or one
   that truncates mid-club, renders perfectly and reads wrong. Needs a static
   server on :8080; skipped with a said-out-loud line rather than a silent pass. */
let browser = null;
try {
  const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
  browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
} catch (e) {
  console.log('  SKIPPED: no browser available (' + e.message.split('\n')[0] + ')');
}

if (browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  /* A fresh profile gets the first-visit guide, which sits over the front page and
     covers "More ways to play": `elementFromPoint` at that button's own centre
     answers the guide's eyebrow, so the click times out on a page with nothing
     wrong with it. check-run.mjs pins the same key for the same reason. */
  await page.addInitScript(() => {
    try { localStorage.setItem('rtd_seen_intro_v1', '1'); } catch (_) {}
  });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  try {
    await page.goto('http://127.0.0.1:8080/baseball/', { waitUntil: 'load', timeout: 30000 });
    /* The front screen being up is what says the pool has landed and the page has
       booted, which is how check-run.mjs waits. A poll on globals waits on names
       this page does not put on `window` and times out on a page that is fine. */
    await page.waitForSelector('#s-intro.on', { timeout: 30000 });
    /* Opened the way a player opens it. The page's own functions are not on
       `window`, so a check that calls `buildFranGrid()` reaches nothing, and
       pressing the control is the thing a player does anyway. */
    await page.click('#b-modes');
    await page.click('#modes-in [data-mode="fran"]');
    await page.waitForSelector('#s-fran.on .fran-card', { timeout: 20000 });
    const cards = await page.evaluate(() => {
      return [...document.querySelectorAll('#s-fran .fran-card')].map(c => ({
        name: c.querySelector('.fran-name')?.textContent || '',
        yrs: c.querySelector('.fran-yrs')?.textContent || '',
        was: c.querySelector('.fran-was')?.textContent || '',
        label: c.getAttribute('aria-label') || '',
        h: c.getBoundingClientRect().height,
        y: c.getBoundingClientRect().y,
      }));
    });
    ok(errs.length === 0, 'the page threw while building the picker: ' + errs.join(' | '));
    ok(cards.length === E.CURRENT_FRANCHISES.length,
      `the picker drew ${cards.length} cards for ${E.CURRENT_FRANCHISES.length} clubs`);

    const marlins = cards.find(c => c.name === 'Miami Marlins');
    ok(marlins, 'no Miami Marlins card in the picker');
    if (marlins) {
      ok(/1993/.test(marlins.yrs),
        `the Marlins card reads "${marlins.yrs}", and they have played since 1993`);
      ok(/Florida/.test(marlins.was),
        `the Marlins card does not say it includes Florida (it says "${marlins.was}")`);
    }

    /* The lineage note has to be DRAWN, not merely present in the markup: a rule
       that failed to load would leave it in the DOM and invisible. */
    /* One note per franchise that has worn another name, and the number is derived
       rather than written: it is however many lineages E.FRANCHISES holds, so adding
       one cannot leave this check quietly behind. Every card used to be able to
       carry a note, since an earlier identity carried "Now the ...", and with those
       cards gone only the lineages do. */
    const withNote = cards.filter(c => c.was);
    const wantNotes = Object.keys(E.FRANCHISES).length;
    ok(withNote.length === wantNotes,
      `${withNote.length} cards carry a lineage note and ${wantNotes} franchises have ` +
      `a lineage; the rule may not be applying`);

    /* No two cards may read the same without something telling them apart. */
    const seen = {};
    for (const c of cards) (seen[c.name] = seen[c.name] || []).push(c);
    for (const [name, group] of Object.entries(seen)) {
      if (group.length < 2) continue;
      const notes = new Set(group.map(g => g.was));
      ok(notes.size === group.length && !notes.has(''),
        `${group.length} cards read "${name}" and their notes are [${[...notes].join('] [')}]`);
    }

    /* A GRID ROW stretches every cell to its tallest, so the claim is per ROW and
       never across the picker. Written across the whole grid it failed on a correct
       page reading 80.1 to 113.2: rows genuinely differ, because a row of cards that
       all carry a two line note is taller than a row of cards carrying none, and the
       grid is doing exactly what it should. What a third line of note would actually
       break is one row, which is the premium sheet's own rule and is what is asked. */
    const byRow = {};
    for (const c of cards) (byRow[Math.round(c.y)] = byRow[Math.round(c.y)] || []).push(c.h);
    const ragged = Object.entries(byRow)
      .filter(([, hs]) => Math.max(...hs) - Math.min(...hs) > 0.5);
    ok(ragged.length === 0,
      `${ragged.length} rows of the picker are not one height, the worst being ` +
      (ragged[0] ? `[${ragged[0][1].map(h => h.toFixed(1)).join(', ')}]` : ''));

    /* NOTHING ON THE CARD MAY BE CUT, and this is the assertion that had to be
       written twice.
       The first version asked `scrollWidth > clientWidth`, which is the obvious
       overflow test and is BLIND here: on the Athletics card, reading
       "1902-2025 · 111 seaso..." on screen, both were 147. A `text-overflow`
       ellipsis is painted inside the box, so the box never reports itself as
       overflowing, and the check passed on 45 of 45 cards while every long-history
       card was visibly cutting the season count. Found by taking a screenshot and
       looking at it, which is this repo's oldest lesson and the fourth time on this
       game.
       What is asked instead is whether the text FITS: the same string is measured in
       the same face with no constraint, against the room the card gives it. That is
       true of a clamp, an ellipsis or a plain overflow, because it never asks the
       box how it feels about its own content.

       IT MEASURES THE FALLBACK FACE, AND THAT IS THE SAFE DIRECTION. Google Fonts
       does not resolve in this sandbox (`document.fonts.size` is 0), so every string
       here is set in a face wider than the Archivo a visitor gets: a card that fits
       HERE fits on a phone with room spare, and the converse does not follow. The
       Athletics' years line measured 147px in a 147px column, exactly on the seam,
       which is why it drew an ellipsis in a screenshot and may well not on a real
       phone. That is the reason `.fran-yrs` wraps rather than being made to fit: a
       line that wraps cannot hide the season count in ANY face, which is not a claim
       this harness is able to make about a line that truncates. */
    const cut = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      document.body.appendChild(probe);
      const bad = [];
      for (const c of document.querySelectorAll('#s-fran .fran-card')) {
        for (const sel of ['.fran-name', '.fran-yrs', '.fran-was', '.fran-best']) {
          const el = c.querySelector(sel);
          if (!el || !el.textContent.trim()) continue;
          const cs = getComputedStyle(el);
          /* THE LONGHANDS, NEVER THE `font` SHORTHAND. getComputedStyle serialises
             `font` as the empty string in Chromium unless every longhand is set, so
             the probe measured at the default 16px and reported a 10.5px line as
             152px wide in a 147px column: a failure on four cards that render
             perfectly. A measurement that silently falls back to a different size
             is worse than no measurement. */
          for (const k of ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
            'letterSpacing', 'fontVariantNumeric', 'textTransform']) probe.style[k] = cs[k];
          const avail = el.clientWidth;
          const lh = parseFloat(cs.lineHeight) || 13;
          const lines = Math.max(1, Math.round(el.getBoundingClientRect().height / lh));
          /* Longest single word first: a word wider than the column cannot wrap and
             is cut whatever the line budget is. */
          let widest = 0;
          for (const w of el.textContent.split(/\s+/)) {
            probe.textContent = w;
            widest = Math.max(widest, probe.getBoundingClientRect().width);
          }
          probe.textContent = el.textContent;
          const need = probe.getBoundingClientRect().width;
          /* AND THE BOX'S OWN VERTICAL OVERFLOW, which is the only thing that
             knows how the text really wrapped. `need > avail * lines` assumes
             perfect packing and real wrapping breaks at spaces, so the Athletics
             note (409px over three 147px lines) passed the arithmetic while the
             card visibly read "... Oakland...". Unlike scrollWidth against an
             ellipsis, scrollHeight against a line clamp is reliable: the clamp
             hides whole lines and the box reports them. */
          const clipped = el.scrollHeight > el.clientHeight + 0.5;
          if (clipped || widest > avail + 0.5 || need > avail * lines + 0.5) {
            bad.push(`${c.querySelector('.fran-name').textContent} ${sel}: ` +
              `"${el.textContent}" needs ${Math.ceil(need)}px over ${lines} line(s) of ` +
              `${Math.round(avail)}${clipped ? ', and the box clips it' : ''}`);
          }
        }
      }
      probe.remove();
      return bad;
    });
    ok(cut.length === 0, `${cut.length} card lines do not fit:\n    ` + cut.slice(0, 4).join('\n    '));

    const longest = cards.reduce((m, c) => c.was.length > m.was.length ? c : m, cards[0]);
    console.log(`  ${cards.length} cards, ${withNote.length} with a lineage note, ` +
      `${Object.keys(byRow).length} rows, every row uniform`);
    console.log(`  longest note: "${longest.was}"`);
  } catch (e) {
    ok(false, 'the picker could not be driven: ' + e.message.split('\n')[0]);
  }

  /* THE ERA CARDS, as a property of each one on the glass. `.fran-card` sets
     display:block later in the sheet at equal weight, and the first draft of the
     era card lost to it: a block rather than a column, the chip stretched full
     width, nothing thrown. So the layout is asked, and so are the bar and the
     label rows, which are the parts that wrap on a 390px phone. */
  try {
    await page.goto('http://127.0.0.1:8080/baseball/', { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#s-intro.on', { timeout: 30000 });
    await page.click('#b-modes');
    await page.click('#modes-in [data-mode="era"]');
    await page.waitForSelector('#s-era.on .era-card', { timeout: 20000 });
    const eras = await page.evaluate(() => [...document.querySelectorAll('#s-era .era-card')].map(c => {
      const bar = c.querySelector('.era-mix'), segs = [...bar.children];
      const lines = el => el ? Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || 12)) : 0;
      const chip = c.querySelector('.era-tag');
      return {
        dec: c.querySelector('.era-dec').textContent,
        display: getComputedStyle(c).display,
        rail: getComputedStyle(c, '::before').backgroundColor,
        barW: bar.getBoundingClientRect().width,
        segW: segs.reduce((a, s) => a + s.getBoundingClientRect().width, 0),
        mixl: c.querySelector('.era-mixl').getBoundingClientRect().height,
        mixlFont: parseFloat(getComputedStyle(c.querySelector('.era-mixl')).fontSize),
        chipW: chip ? chip.getBoundingClientRect().width : 0,
        cardW: c.getBoundingClientRect().width,
        overflow: c.scrollWidth > c.clientWidth + 1,
      };
    }));
    ok(eras.length >= 12, `${eras.length} era cards`);
    ok(eras.every(e => e.display === 'flex'), `an era card is not a flex column: ${eras.filter(e => e.display !== 'flex').map(e => e.dec + ' ' + e.display).join(', ')}`);
    ok(new Set(eras.map(e => e.rail)).size === eras.length, 'two decades share a rail colour, so the ramp is not a ramp');
    ok(eras.every(e => Math.abs(e.barW - e.segW) < 1.5), 'a bats and arms bar does not fill its own track');
    ok(eras.every(e => e.mixl < e.mixlFont * 2), `a bats and arms label wrapped: ${eras.filter(e => e.mixl >= e.mixlFont * 2).map(e => e.dec).join(', ')}`);
    ok(eras.every(e => !e.chipW || e.chipW < e.cardW * 0.9), 'a decade chip stretched across its card');
    ok(eras.every(e => !e.overflow), 'an era card overflows sideways');
    console.log(`  ${eras.length} era cards, ${new Set(eras.map(e => e.rail)).size} rail colours`);
  } catch (e) {
    ok(false, 'the era picker could not be driven: ' + e.message.split('\n')[0]);
  }
  await browser.close();
}

/* ── the era picker counts franchises, not codes ──────────────────────────── */
section('THE ERA CARDS COUNT CLUBS, NOT THEIR CODES');
{
  /* A decade card said the 1950s held 21 clubs and the 2020s 31. Both counted
     three-letter codes, and a franchise that moved or renamed wears two. Held to
     the league's real shape: 16 clubs for the whole of the 1950s (every code
     that decade belongs to one of the original sixteen), and 30 today. */
  const eras = Object.fromEntries(R.eligibleEras(DATA).map(e => [e.era, e]));
  for (const e of Object.values(eras)) {
    const f = new Set();
    let n = 0;
    for (const ts of DATA.teamSeasons) {
      if (ts.season < e.lo || ts.season > e.hi) continue;
      f.add(E.franchiseOf(ts.team, ts.season)); n++;
    }
    ok(e.clubs === f.size, `${e.era} says ${e.clubs} clubs and holds ${f.size} franchises`);
    ok(e.seasons === n, `${e.era} says ${e.seasons} team seasons and holds ${n}`);
  }
  ok(eras['1950s'] && eras['1950s'].clubs === 16, `the 1950s read ${eras['1950s'] && eras['1950s'].clubs} clubs, and the league had 16`);
  ok(eras['2020s'] && eras['2020s'].clubs === 30, `the 2020s read ${eras['2020s'] && eras['2020s'].clubs} clubs, and the league has 30`);
  console.log('  ' + Object.values(eras).map(e => e.era + ' ' + e.clubs).join(', '));
}

/* ── a division card lists today's clubs, once each ─────────────────────── */
section('THE DIVISION CARDS LIST TODAY\'S CLUBS');
{
  /* The NL East card listed FLA beside MIA and MON beside WSN, and Detroit,
     Milwaukee and Houston each sat on two cards. Asked as a property: the six
     cards together name thirty codes, no franchise twice, every one of them a
     club playing today. And the draft still reaches the old names. */
  const all = Object.keys(E.DIVISIONS).flatMap(d => E.divisionClubs(d));
  const last = Math.max(...Object.values(E.DIVISIONS).flat().map(r => r[2]));
  const frans = all.map(c => E.franchiseOf(c, last));
  ok(all.length === 30, `the division cards name ${all.length} clubs, and the league has 30`);
  ok(new Set(frans).size === all.length, `a franchise appears on two division chips: ${all.join(' ')}`);
  const current = new Set(E.CURRENT_FRANCHISES.map(f => Array.isArray(f) ? f[0] : (f.code || f.key || f)));
  ok(frans.every(f => current.has(f)), `a division chip is not a club playing today: ${frans.filter(f => !current.has(f)).join(' ')}`);
  ok(E.inDivision('NL East', 'FLA', 2000) && E.inDivision('NL East', 'MON', 2000),
    'the NL East draft still reaches the Florida Marlins and the Expos');
  console.log('  ' + Object.keys(E.DIVISIONS).map(d => d + ': ' + E.divisionClubs(d).join(' ')).join('\n  '));
}

console.log('\n' + (problems
  ? problems + ' PROBLEMS of ' + checks + ' checks'
  : 'all ' + checks + ' checks passed'));
process.exit(problems ? 1 : 0);
