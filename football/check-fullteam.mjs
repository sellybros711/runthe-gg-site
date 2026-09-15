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
 * AND THE BUG THAT AGREEMENT HID
 * ---------------------------------------------------------------------------
 * Making them agree was right and was not enough: they were made to agree on the LOWEST
 * OPEN SLOT, and that is not the side the mode is supposed to be picking. The slot list is
 * interleaved so that reading the side off it would alternate for free, and the premise is
 * false for exactly the reason above. The lowest open slot only moves when somebody happens
 * to fit it, so taking a tight end first leaves the QB spot open and the next pick is
 * offensive again.
 *
 * A player reported three defenders in a row. Measured over 360 completed drafts across
 * three ways of drafting, NOT ONE alternated, every one had a run of three or more, and the
 * usual shape was the whole offense and then the whole defense. The side is counted now
 * (`fullPickIsDefensive`), so this file asserts the alternation itself rather than only
 * asserting that everything on screen agrees about it.
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
const INJECT = 'beginFullDraft,fullSlotIsDefensive,nextOpenSlot,fullPickIsDefensive,canPlayFull,'
  /* The meter section drives the door, the save and the allowance. */
  + 'fullDoor,fullRead,fullClear,dailyShut,ensureFullButton,setPremium:(v)=>{premiumSet=v;},'
  /* A ONE-A-DAY SERVER standing in for ps_attempt_spend and ps_attempts_state, with a counter
     on it, because what matters is how often the PAGE asks rather than what comes back.
     IT HAS TO BE BUILT IN HERE rather than eval'd from the test: B is a binding inside the
     page's own script and is not on window, so a stub assembled outside cannot see it. */
  + 'meter:(used)=>{const n={spend:0};let u=used||0;'
  + "const row=()=>({used:u,allowance:1,unit:'run',ended:false,"
  + 'resetsAt:new Date(Date.now()+864e5).toISOString()});'
  + 'B.attemptsState=async()=>row();'
  + 'B.attemptSpend=async()=>{n.spend++;const ok=u<1;if(ok)u++;'
  + 'return Object.assign({ok:ok},row());};'
  + 'dailyForget();return n;},'
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
        /* The page's own answer, which is what the pool and the glow are both drawn from. */
        side: window.__t.fullPickIsDefensive() ? 'def' : 'off',
        /* The reading this replaced, kept only to prove the run exercises the difference. */
        byOpen: window.__t.fullSlotIsDefensive(open) ? 'def' : 'off',
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
  const wrongHalf = agree.filter((r) => r.field !== r.side);
  ok('  the lit half is always the half the pool comes from', !wrongHalf.length,
    wrongHalf.map((r) => 'pick ' + (r.n + 1) + ' lit ' + r.field + ' pool ' + r.side).join(', ')
      || agree.map((r) => r.field).join(' '));
  /* The board is read as a third opinion: if the tiles are all defenders the pool is the
     defensive one, whatever either variable says. */
  const boardWrong = agree.filter((r) => r.tiles > 0 && r.boardDef !== (r.side === 'def'));
  ok('  and the tiles on the board are that side', !boardWrong.length,
    boardWrong.map((r) => 'pick ' + (r.n + 1)).join(', ') || agree.length + ' picks');

  /* ---- AND IT ACTUALLY ALTERNATES, which is the thing a player can see ----
     This is the assertion the file was missing. Every pick agreed with every other reading
     of itself and the mode still served three defenders in a row, because all of them were
     reading the LOWEST OPEN SLOT and a man goes into whatever slot fits him. Measured over
     360 completed drafts, not one alternated and the longest run of one side was six. */
  const flips = agree.slice(1).filter((r, i) => r.side === agree[i].side);
  ok('  and the side flips on every pick', !flips.length,
    agree.map((r) => (r.side === 'def' ? 'D' : 'O')).join('')
      + (flips.length ? '   repeated at pick ' + flips.map((r) => r.n + 1).join(', ') : ''));

  /* THE PROOF THE TEST IS TESTING SOMETHING. If the lowest open slot had named the same
     side as the pick count on every pick of this run, the run never met the case and a
     green result means nothing. This is the same trap as a badge nothing can light, and it
     is why the first pick above is deliberately a running back. */
  const diverged = agree.filter((r) => r.byOpen !== r.side);
  ok('  and the reading this replaced disagreed at least once, so this run exercises it',
    diverged.length > 0,
    diverged.map((r) => 'pick ' + (r.n + 1) + ': the count says ' + r.side
      + ', the lowest open slot says ' + r.byOpen).join(' | ') || 'never diverged');

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

/* ================================================================
   ONE RUN A DAY, AND THE RUN IN PROGRESS BELONGS TO THE ACCOUNT

   Full Team is metered like the Trade Machine (a run IS one season) and the bundle removes
   the counting rather than unlocking the door, for the reasons argued at the top of
   supabase/105_fullteam_daily.sql.

   THE SAVE IS WHY THIS SECTION EXISTS AT ALL. Before the meter, a Full Team run was kept
   nowhere: no localStorage key and no slot in FB_SLOTS. That was survivable while starting
   again cost nothing. It stops being survivable the moment a run costs a day, because the
   charge lands at KICKOFF, so a closed tab in week three would take the run and the
   allowance together and leave the player looking at a door telling them to come back
   tomorrow for a season they never finished.

   So the four things asserted here are the four that can go wrong silently:
     the draft is free      twelve picks is the longest browse on the site
     the kickoff is charged ONCE, and the run carries the mark that says so
     a spent day still opens a saved run, and changes only the line under the name
     an owner is never metered at all
   ================================================================ */
console.log('\nONE RUN A DAY, AND A RUN IN PROGRESS IS NEVER TAKEN');
{
  const sub = (p) => p.evaluate(() =>
    ((document.querySelector('#b-start-full .hp-full-sub') || {}).textContent || '').trim());

  const m = await open(browser, { tester: true });
  await m.page.evaluate(() => {
    window.__C = window.__t.meter(0);
    window.__t.setPremium([]);
    window.__t.fullClear();
    window.__t.ensureFullButton();
  });
  await m.page.waitForTimeout(600);

  ok('a free day offers the mode', !/next run|resume/i.test(await sub(m.page)), await sub(m.page));

  await m.page.evaluate(() => window.__t.fullDoor());
  await m.page.waitForTimeout(6000);
  for (let i = 0; i < 12; i++) {
    const n = await m.page.evaluate(() => {
      const run = window.__t.getRun();
      if (!run || run.roster.length >= run.slots.length) return 'done';
      const t = document.querySelector('#opts .tile:not(.off)');
      if (!t) return 'stuck';
      t.click();
      return run.roster.length;
    });
    if (n === 'done' || n === 'stuck') break;
    await m.page.waitForTimeout(2600);
  }
  await m.page.waitForTimeout(1500);
  ok('  twelve picks were made',
    await m.page.evaluate(() => { const r = window.__t.getRun(); return !!r && r.roster.length === 12; }));
  ok('  and the draft itself cost nothing',
    await m.page.evaluate(() => window.__C.spend) === 0);
  ok('  while already being saved',
    await m.page.evaluate(() => !!window.__t.fullRead()));

  /* Decline the coach, take the squad screen, then kick off. b-play is the one path through
     the page's own startSeason(), which is where the day is spent; finishHiring only paints
     the squad, and a walk that stopped there would assert nothing about the charge. */
  await m.page.evaluate(() => { const b = document.getElementById('b-coach-none'); if (b) b.click(); });
  await m.page.waitForTimeout(800);
  await m.page.evaluate(() => { const b = document.getElementById('b-coach-go'); if (b) b.click(); });
  await m.page.waitForTimeout(2500);
  await m.page.evaluate(() => { const b = document.getElementById('b-play'); if (b) b.click(); });
  await m.page.waitForTimeout(3500);
  ok('the kickoff charges the day exactly once',
    await m.page.evaluate(() => window.__C.spend) === 1,
    'spends: ' + await m.page.evaluate(() => window.__C.spend));
  ok('  and marks the run paid, so a reload cannot be charged again',
    await m.page.evaluate(() => !!window.__t.getRun().attemptPaid));
  ok('  the season is in the save',
    await m.page.evaluate(() => { const s = window.__t.fullRead(); return !!s && s.run.roster.length === 12; }));
  ok('  nothing threw', !m.boom.length, m.boom.join(' | ') || 'no errors');

  /* A SPENT DAY, WITH THE RUN STILL ON THE SHELF. The door must open it: the wall that
     matters is at the kickoff, and a run the game will not let you look at reads as a run
     the game has taken. Same lesson the dynasty door already carries.

     RELOADED RATHER THAN REOPENED, and that is not a detail. open() calls newPage(), which in
     Playwright is a fresh CONTEXT with its own empty localStorage, so a second page would
     find no save and this whole block would assert against a browser that had never played.
     It has to be the same page coming back, which is also what the thing being tested is. */
  const s = m;
  await s.page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await s.page.waitForTimeout(5000);
  await s.page.evaluate(() => window.__t.signIn());
  await s.page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => /NO THANKS|I WILL TRY IT/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await s.page.waitForTimeout(1200);
  await s.page.evaluate(() => {
    window.__C = window.__t.meter(1);
    window.__t.setPremium([]);
    window.__t.ensureFullButton();
  });
  await s.page.waitForTimeout(600);
  ok('a spent day is shut', await s.page.evaluate(() => window.__t.dailyShut('full')));
  ok('  but the saved run survived', await s.page.evaluate(() => !!window.__t.fullRead()));
  ok('  and the door says Resume, not a countdown', /resume/i.test(await sub(s.page)), await sub(s.page));
  await s.page.evaluate(() => window.__t.fullDoor());
  await s.page.waitForTimeout(6000);
  ok('  pressing it puts the run back',
    await s.page.evaluate(() => { const r = window.__t.getRun(); return !!r && !!r.full && r.roster.length === 12; }),
    await s.page.evaluate(() => { const r = window.__t.getRun(); return r ? r.phase + ' / ' + r.roster.length : 'none'; }));
  ok('  and resuming charged nothing',
    await s.page.evaluate(() => window.__C.spend) === 0);

  /* AND WITH NOTHING ON THE SHELF, the same spent day is the store rather than the mode. */
  await s.page.evaluate(() => {
    window.__t.fullClear();
    window.__C = window.__t.meter(1);
    window.__t.ensureFullButton();
  });
  await s.page.waitForTimeout(400);
  ok('with no save, the door counts down instead', /next run/i.test(await sub(s.page)), await sub(s.page));
  await s.page.evaluate(() => window.__t.fullDoor());
  await s.page.waitForTimeout(1500);
  const sheet = await s.page.evaluate(() => ({
    on: document.getElementById('sheet').classList.contains('on'),
    kind: document.getElementById('sheet-in').dataset.kind,
    text: (document.getElementById('sheet-in').innerText || '').replace(/\s+/g, ' '),
  }));
  ok('  and opens the spent sheet', sheet.on && sheet.kind === 'daily', sheet.kind);
  /* NAMED. This sheet says the mode three times, and an unnamed one reads as the Dynasty's
     sheet on a door that is not the Dynasty. */
  ok('  which names Full Team', /Full Team/.test(sheet.text), sheet.text.slice(0, 90));
  /* AND THE DRAFT NEVER OPENED, which is the claim. Not "there is no run": this page has
     been reloaded rather than reopened, so the run resumed a moment ago is still in memory,
     and asserting its absence would be asserting something the block never did. What a
     refusal means on screen is that the draft screen is not the thing now showing. */
  ok('  and no draft was opened',
    await s.page.evaluate(() =>
      [...document.querySelectorAll('.screen.on')].every((x) => x.id !== 's-draft')),
    await s.page.evaluate(() =>
      [...document.querySelectorAll('.screen.on')].map((x) => x.id).join(',')));
  ok('  and it cost nothing', await s.page.evaluate(() => window.__C.spend) === 0);

  /* THE THING THE BUNDLE ACTUALLY BUYS. dailyOn() stops metering the moment ps_premium is
     owned, so an owner never reaches any of the above. */
  await s.page.evaluate(() => {
    window.__t.setPremium(['ps_premium']);
    window.__t.fullClear();
    window.__t.ensureFullButton();
  });
  await s.page.waitForTimeout(400);
  ok('an owner is not metered at all',
    await s.page.evaluate(() => window.__t.dailyShut('full')) === false);
  ok('  and their door offers the mode', !/next run/i.test(await sub(s.page)), await sub(s.page));
  ok('  nothing threw', !s.boom.length, s.boom.join(' | ') || 'no errors');
  await s.page.close();
}

await browser.close();
/* NO TRAILING NEWLINE ON THE VERDICT. Every other checker here is run in a loop that reports
   `tail -1`, and a final blank line makes a passing suite read as one that printed nothing. */
console.log(bad ? '\n' + bad + ' FAILED' : '\nall full team checks passed');
process.exit(bad ? 1 : 0);
