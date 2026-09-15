/*
 * Full Team, on the draft screen, in a real browser.
 *
 *   node football/check-fullteam.mjs
 *
 * WHY THIS EXISTS. Full Team is the only mode on this page with no checker of its own, and
 * it is the one whose screen has to say the most: twelve slots instead of six, and the side
 * of the ball alternating underneath the player pick by pick. Everything this file asserts
 * is something that goes wrong SILENTLY, which is the shape of bug this repo keeps finding:
 * the draft renders, the wheels turn, the game is playable, and the picture is describing a
 * different pick from the one the board is offering.
 *
 * ---------------------------------------------------------------------------
 * THE BUG IT WAS WRITTEN FOR
 * ---------------------------------------------------------------------------
 * The field lit the half the pick came from off `run.roster.length`, and the BOARD chose
 * its pool off `nextOpenSlot()`. Those are not the same number. A man goes into whatever
 * open slot fits him rather than the next one along, so the two readings come apart the
 * first time somebody signs anyone other than the slot order expects.
 *
 * Measured rather than reasoned about: of the roster shapes reachable inside six men, 1,190
 * have the two readings naming DIFFERENT sides. The cheapest one is the second pick of the
 * game. Take a running back first instead of the quarterback and he lands in slot 2, so
 * roster.length is 1 (slot 1 is a DL, defensive) while the first open slot is 0 (the QB,
 * offensive). The board then served quarterbacks and receivers while the field glowed blue
 * over the defense. Nothing threw.
 *
 * So the assertion is not "the glow is on". It is that the glow and the pool agree, checked
 * against a first pick chosen to break them apart.
 *
 * ---------------------------------------------------------------------------
 * AND THE THING THAT MUST NOT CHANGE
 * ---------------------------------------------------------------------------
 * Full Team is unannounced. fullteam-access.js ships FULLTEAM_LIVE = false and the door is
 * BUILT by ensureFullButton() rather than revealed, so an account off the list has no such
 * node in its document (see the long note over the markup in index.html). check-premium
 * asserts the door is absent; this asserts the same thing from the other end, that the page
 * a non-tester is served carries the mode's name nowhere a reader would find it.
 *
 * Needs no network and no server: every request is served from disk by the route handler,
 * the same way check-premium does it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pw from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

let bad = 0;
const ok = (n, p, x) => {
  if (!p) bad++;
  console.log((p ? '  ok    ' : ' FAIL   ') + n + (x !== undefined ? '   ' + x : ''));
};

/* The handles the page does not otherwise expose. Same injection point check-premium uses,
   and the same reason: these are internals of one enormous script, and driving them is the
   only way to ask the page a question about a mode three taps in. */
const INJECT = 'beginFullDraft,fullSlotIsDefensive,nextOpenSlot,canPlayFull,'
  + 'getRun:()=>run,'
  + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='tester';}";

async function open(browser, { tester }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 180)));
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    /* Stripe is live and has no test mode. Nothing here should reach it, and if anything
       ever does it must not come back with a session url. Same guard as check-premium. */
    if (u.pathname === '/api/stripe/checkout-bundle') {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ error: 'intercepted_by_check' }) });
    }
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (tester && /(dynasty|fullteam)-access\.js$/.test(rel)) {
      body = Buffer.from(body.toString('utf8').replace(/LIVE = false/, 'LIVE = true'), 'utf8');
    }
    if (rel === '/football/index.html') {
      body = Buffer.from(body.toString('utf8')
        .replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
    }
    await r.fulfill({ status: 200,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__t.signIn());
  /* The first-run card sits over the whole page until it is answered. */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => /NO THANKS|I WILL TRY IT/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(1500);
  return { page, boom };
}

const browser = await pw.chromium.launch({ executablePath: CHROME });

/* ================================================================
   THE MODE IS STILL UNANNOUNCED
   ================================================================ */
console.log('\nAN ACCOUNT OFF THE TESTER LIST IS SERVED NOTHING');
{
  const { page, boom } = await open(browser, { tester: false });
  const r = await page.evaluate(() => ({
    door: !!document.getElementById('b-start-full'),
    can: window.__t.canPlayFull(),
    named: /full team/i.test(document.body.innerText),
  }));
  ok('canPlayFull() is false', r.can === false);
  ok('  no door is built', !r.door);
  ok('  and the words are nowhere on the page', !r.named);
  ok('  the page still starts clean', !boom.length, boom.join(' | ') || 'no errors');
  await page.close();
}
/* Read off disk rather than off the page, because the page under test is served through a
   handler that rewrites this very line for the tester view. */
{
  const src = fs.readFileSync(path.join(ROOT, 'football/fullteam-access.js'), 'utf8');
  ok('fullteam-access.js still ships FULLTEAM_LIVE = false', /FULLTEAM_LIVE = false/.test(src));
}

/* ================================================================
   THE DRAFT SCREEN SAYS WHICH PICK THIS IS
   ================================================================ */
console.log('\nTHE FIELD AND THE BOARD AGREE ABOUT WHICH SIDE IS PICKING');
{
  const { page, boom } = await open(browser, { tester: true });
  ok('the door is built for a tester', await page.evaluate(() =>
    !!document.getElementById('b-start-full')));
  /* THE FILL IS PART OF THE DOOR, not decoration to be dropped in a refactor. Without
     hp-ft this card is the neutral grey shared with the Trade Machine, which on a phone
     between a saturated pair and a gold card reads as a control you cannot press. */
  ok('  and carries its own fill', await page.evaluate(() =>
    (document.getElementById('b-start-full') || {}).classList.contains('hp-ft')));

  await page.evaluate(() => window.__t.beginFullDraft());
  await page.waitForTimeout(6000);
  ok('the draft opens', await page.evaluate(() =>
    [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(',') === 's-draft'));

  /* THE FIRST PICK IS DELIBERATELY NOT THE QUARTERBACK. That is the whole test: taking the
     QB keeps roster.length and the first open slot in step, and the bug hides. */
  const first = await page.evaluate(() => {
    const t = [...document.querySelectorAll('#opts .tile:not(.off)')]
      .find((x) => /^\s*RB\b/.test(x.textContent));
    if (!t) return null;
    t.click();
    return true;
  });
  ok('  a running back can be taken first', !!first);
  await page.waitForTimeout(3000);

  const agree = [];
  for (let pick = 0; pick < 6; pick++) {
    const r = await page.evaluate(() => {
      const run = window.__t.getRun();
      if (!run || run.roster.length >= run.slots.length) return null;
      const open = window.__t.nextOpenSlot();
      return {
        n: run.roster.length,
        byOpen: window.__t.fullSlotIsDefensive(open) ? 'def' : 'off',
        byCount: window.__t.fullSlotIsDefensive(run.roster.length) ? 'def' : 'off',
        field: document.getElementById('field').dataset.live,
        /* What the board is actually offering, read off the tiles rather than inferred. */
        boardDef: [...document.querySelectorAll('#opts .tile:not(.off)')]
          .every((t) => /^\s*(DL|LB|DB)\b/.test(t.textContent)),
        tiles: document.querySelectorAll('#opts .tile:not(.off)').length,
      };
    });
    if (!r) break;
    agree.push(r);
    const did = await page.evaluate(() => {
      const t = document.querySelector('#opts .tile:not(.off)');
      if (!t) return false;
      t.click(); return true;
    });
    if (!did) break;
    await page.waitForTimeout(2600);
  }

  ok('  six picks were driven', agree.length >= 5, agree.length + ' measured');
  const wrongHalf = agree.filter((r) => r.field !== r.byOpen);
  ok('  the lit half is always the half the pool comes from', !wrongHalf.length,
    wrongHalf.map((r) => 'pick ' + (r.n + 1) + ' lit ' + r.field + ' pool ' + r.byOpen).join(', ')
      || agree.map((r) => r.field).join(' '));
  /* The board is read as a third opinion: if the tiles are all defenders the pool is the
     defensive one, whatever either variable says. */
  const boardWrong = agree.filter((r) => r.tiles > 0 && r.boardDef !== (r.byOpen === 'def'));
  ok('  and the tiles on the board are that side', !boardWrong.length,
    boardWrong.map((r) => 'pick ' + (r.n + 1)).join(', ') || agree.length + ' picks');
  /* THE PROOF THE TEST IS TESTING SOMETHING. If roster.length never disagreed with the
     open slot on this run, the run did not exercise the bug and a green result means
     nothing. This is the same trap as a badge nothing can light. */
  const diverged = agree.filter((r) => r.byCount !== r.byOpen);
  ok('  and the old reading disagreed at least once, so this run exercises it',
    diverged.length > 0,
    diverged.map((r) => 'pick ' + (r.n + 1) + ': count says ' + r.byCount
      + ', open slot says ' + r.byOpen).join(' | ') || 'never diverged');

  /* ---- what the screen shows for it ---- */
  const look = await page.evaluate(() => {
    const f = document.getElementById('field');
    const side = f.dataset.live;
    const dim = (sel) => [...f.querySelectorAll(sel)]
      .map((c) => parseFloat(getComputedStyle(c.querySelector('.disc')).opacity));
    const offside = side === 'def' ? '.chip.empty.soff' : '.chip.empty.sdef';
    const live = side === 'def' ? '.chip.empty.sdef' : '.chip.empty.soff';
    const lab = side === 'def' ? '.unitlab.up' : '.unitlab.down';
    const other = side === 'def' ? '.unitlab.down' : '.unitlab.up';
    return { side, offside: dim(offside), live: dim(live),
      labOn: getComputedStyle(f.querySelector(lab)).color,
      labOff: getComputedStyle(f.querySelector(other)).color };
  });
  ok('the open spots this pick cannot reach are dimmed', look.side
    && look.offside.length > 0 && look.offside.every((o) => o < 0.7),
    look.side + ': ' + look.offside.join(', '));
  /* DIMMED, NOT HIDDEN. They are still spots on the team and the field is a picture of the
     team. A first attempt at .26 emptied half the field on a phone. */
  ok('  and still visible', look.offside.every((o) => o >= 0.35),
    'min ' + Math.min(...look.offside));
  ok('  while the ones it can reach are not', look.live.every((o) => o > 0.9),
    look.live.join(', ') || 'none open on this side');
  ok('the unit label for the picking side is lit', look.labOn !== look.labOff,
    look.labOn + ' against ' + look.labOff);

  ok('nothing threw', !boom.length, boom.join(' | ') || 'no errors');
  await page.close();
}

/* ================================================================
   THE BREAKDOWN IS THE RATING'S OWN WORKING

   This is checked in the ENGINE rather than through a played season, because what can go
   wrong is arithmetic and a browser adds nothing to it. The screen reads
   fullSideRatings().parts and multiplies nothing itself, so the only way the table can lie
   is if the parts stop being the terms the rating was built from.

   THEY DID LIE, WHICH IS WHY THIS EXISTS. The page used to compose its own sentence and it
   was wrong three ways at once: rosterStructure over all TWELVE men (the reading overallOf
   warns about, printing "-44% for how the six fit together" on a team whose halves were at
   -12% and +3%), the flattened chemistry rather than the two the units are rated with, and
   "which is a 57.5 team overall" on a product that was not the overall. Nothing threw.
   ================================================================ */
console.log('\nTHE OVERALL IS THE PARTS, MULTIPLIED OUT');
{
  const { createRequire } = await import('module');
  const req = createRequire(import.meta.url);
  const E = req(path.join(ROOT, 'football/engine.js'));
  /* TWO FILES, AND THAT IS THE POINT OF THE MODE. The offensive pool ships in the boot
     bundle and the defenders are a second download, which is why every path into Full Team
     calls loadDefensePool first. A fixture built from player_seasons alone finds no
     defenders at all, falls into fullSideRatings' empty-roster branch, and every assertion
     below then passes against a row of zeros. It did, on the first run of this section. */
  const players = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'football/data/player_seasons.json'), 'utf8'));
  const defenders = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'football/data/defender_seasons.json'), 'utf8'));
  /* AND A DEFENDER'S POINTS ARE CALLED SOMETHING ELSE ON DISK. The file carries
     idp_ppg_mean; the engine samples ppr_ppg_mean, and loadDefensePool() in the page copies
     one onto the other as the pool arrives. A fixture that skips that step hands the engine
     twelve men with undefined production, which reduces to NaN and then to the empty branch.
     Normalised here exactly as the page does it, so this is checking the arithmetic the
     game runs rather than a shape only this file produces. */
  defenders.forEach((p) => { p.ppr_ppg_mean = p.idp_ppg_mean; p.ppr_ppg_sd = p.idp_ppg_sd; });
  const isDef = (p) => E.DEFENSE_POSITIONS.indexOf(p.position) >= 0;
  const off = players.filter((p) => !isDef(p) && p.ppr_ppg_mean > 5).slice(0, 6);
  const def = defenders.filter(isDef).filter((p) => p.ppr_ppg_mean > 2).slice(0, 6);
  ok('a twelve man roster can be built to check against', off.length === 6 && def.length === 6,
    off.length + ' offense, ' + def.length + ' defense');
  const roster = off.concat(def);
  const chem = { multiplier: 1.03, offMultiplier: 1.05, defMultiplier: 1.01 };
  const s = E.fullSideRatings(roster, chem, null);
  const p = s.parts;
  ok('the parts come back with the answer', !!p && typeof p.offPts === 'number');
  /* NOT THE EMPTY BRANCH. Every identity below holds trivially at zero, so the fixture has
     to be shown to have produced a real team before any of them means anything. */
  ok('  and the fixture is a real team rather than the zero case',
    s.off > 1 && s.def > 1 && p.offPts > 1 && p.defPts > 1,
    'off ' + s.off.toFixed(1) + ', def ' + s.def.toFixed(1));
  const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-6);
  /* EACH SIDE, REBUILT FROM ITS OWN PARTS. If the engine ever changes what a unit is made
     of and forgets to say so here, this is what goes red. */
  ok('  offense = points x talent x chemistry x fit',
    near(p.offPts * p.talent * p.offChem * p.offFit, s.off, 1e-9),
    s.off.toFixed(4));
  ok('  the defense raw product is the same shape',
    near(p.defPts * p.talent * p.defChem * p.defFit, p.defRaw, 1e-9),
    p.defRaw.toFixed(4));
  ok('  and the defense rating is that product put on the offense ladder',
    near(E.defenseOverall(p.defRaw), s.def, 1e-9), s.def.toFixed(4));
  ok('  the overall is the two averaged, times the coach',
    near(Math.max(0, Math.min(100, (s.off + s.def) / 2 * s.coachBoost)), s.overall, 1e-9),
    s.overall.toFixed(4));
  /* THE TWO CHEMISTRY FIGURES ARE THE ONES THE UNITS WERE RATED WITH, not the flattened
     one. This is the exact substitution the old sentence made. */
  ok('  and each side used its OWN chemistry, not the average',
    near(p.offChem, chem.offMultiplier) && near(p.defChem, chem.defMultiplier),
    p.offChem + ' / ' + p.defChem + ' against a flattened ' + chem.multiplier);
  /* AND THE FIT IS PER SIDE. Running the whole twelve through the offensive reading is the
     bug this replaced, so assert the parts are NOT that number. */
  const wholeTwelve = E.rosterStructure(roster).multiplier;
  ok('  and the fit is per side rather than over all twelve',
    !near(p.offFit, wholeTwelve) || !near(p.defFit, wholeTwelve),
    'sides ' + p.offFit.toFixed(3) + ' / ' + p.defFit.toFixed(3)
      + ', all twelve would be ' + wholeTwelve.toFixed(3));
}

await browser.close();
/* NO TRAILING NEWLINE ON THE VERDICT. Every other checker here is run in a loop that reports
   `tail -1`, and a final blank line makes a passing suite read as one that printed nothing. */
console.log(bad ? '\n' + bad + ' FAILED' : '\nall full team checks passed');
process.exit(bad ? 1 : 0);
