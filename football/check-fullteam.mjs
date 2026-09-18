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
 * Full Team is LAUNCHED. fullteam-access.js ships FULLTEAM_LIVE = true, so the door is
 * built for everybody and the assertions below say so. They used to say the opposite, and
 * the inversion is the point: while the mode was unannounced the thing worth guarding was
 * that a stranger saw no sign of it, and now it is that a stranger gets in.
 *
 * WHAT REPLACED IT AS THE INVARIANT. The door is free and the METER is what is sold, so
 * the fault this section now watches for is the door quietly becoming a wall again: a
 * signed out visitor who cannot see it, or a free account that finds the mode behind a
 * purchase instead of behind a day's wait.
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
  + 'getRun:()=>run,setRun:(v)=>{run=v;},R:R,E:E,paintCoach,coachList,paintPlan,paintSeed,'
  /* THE POSTSEASON SECTION drives a real season to the seeding screen and then presses the
     buttons a player presses. Same four handles check-premium takes for the same walk. */
  /* dataNow() IS THE ONE THAT MATTERS. A Full Team draft alternates between two pools and
     dataNow() is what picks, off the module's own `run`, so a harness that reaches for DATA
     directly signs six offensive men and stalls with six empty slots. */
  + 'dataNow,LEAGUE:()=>LEAGUE,CAL:()=>CAL,CTX:()=>CTX,D:()=>DATA,'
  /* THE ONE THING A FINISHED GAME MUST NOT BE, which is mid-decision. See the section on a
     call that hands back another call. */
  + 'bossPending:()=>!!(bossSim&&bossSim.pending),'
  + "signIn:()=>{authState.signedIn=true;authState.ready=true;authState.name='tester';}";

/* NO TESTER VIEW ANY MORE. This used to take { tester } and rewrite LIVE = false to true
   in the two access files, which is what the tester lists did. Both files ship true now, so
   the rewrite matched nothing and the parameter described a world that no longer exists. */
async function open(browser) {
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

/* ================================================================
   A CALL CAN HAND BACK ANOTHER CALL

   The only section here that needs no browser, because its subject is the shape of what
   bossSimResolve returns rather than anything on a screen.

   THE BUG IT WAS WRITTEN FOR. A fourth down conversion that reaches the end zone finishes
   the drive through bossEndDrive, which is the same function that pauses a touchdown for
   the two point try. So in the second half of a close game it hands back a DECISION instead
   of a finished drive, and returns before the automatic extra point is added. The page's
   loop ignored that, went back to bossSimAdvance, started the next drive and never came
   back: six points, no kick, no two point question, and nothing anywhere to say so.

   WHY check-boss.mjs CANNOT SEE IT. That file asks whether the drive log agrees with the
   score bug, and both of them read sim.you, so a score that is uniformly one point short
   agrees with itself perfectly.

   SO THE ASSERTION IS THE SHAPE, and the cost is measured beside it by running the same
   games through both loops. A driver that ignores a returned decision and one that honours
   it are the page before and after.
   ================================================================ */
{
  console.log('\nA CALL CAN HAND BACK ANOTHER CALL');
  const E = (await import('./engine.js')).default || (await import('./engine.js'));
  const sim = (await import('./simulator.js')).default || (await import('./simulator.js'));
  const GAMES = 300;
  /* THE FIXTURE IS BUILT ONCE AND BOTH LOOPS PLAY IT. Drafting is the expensive half of this
     section by a long way, and two arms that drafted their own rosters would also be two
     different samples, which is the one thing a before and after must not be. */
  const fixture = (() => {
    const rng = E.createSeededRNG(E.hashSeed('handback|rosters'));
    const out = [];
    for (let g = 0; g < GAMES; g++) {
      const roster = sim.buildFullToBudget(rng, E.FULL_CAP_MUSD, 0.90);
      const opp = sim.ctx.teamSeasons[Math.floor(rng() * sim.ctx.teamSeasons.length)];
      out.push({ roster, opp,
        la: sim.leagueContext[opp.season] ?? 21.5,
        chem: E.resolveChemistry(roster, sim.ctx, { full: true }) });
    }
    return out;
  })();
  /* Bold on purpose: the case needs a fourth down that is GONE FOR and scores, so a driver
     that punts never reaches it and would pass having exercised nothing. */
  const play = (honour) => {
    const rng = E.createSeededRNG(E.hashSeed('handback'));
    let hits = 0, stranded = 0, sixOnly = 0, settled = 0;
    for (const f of fixture) {
      const s = E.fullSimCreate(f.roster, f.chem, f.opp, f.la, 1, E.CONSTANTS, null, null);
      let ev = E.bossSimAdvance(s, rng);
      for (let i = 0; i < 4000 && ev.type !== 'over'; i++) {
        if (ev.type === 'decision') {
          const was = s.you;
          const res = E.bossSimResolve(s, ev.decision.kind === 'two' ? 'two' : 'go', rng);
          if (res && res.end && res.end.type === 'decision') {
            hits++;
            if (honour) {
              /* The handback IS the two point question. Answering it is what banks the point
                 or the two, so the touchdown finishes worth seven or eight. */
              ev = res.end;
              E.bossSimResolve(s, 'kick', rng);
              if (s.you - was === 7) settled++;
              ev = E.bossSimAdvance(s, rng);
              continue;
            }
            /* THE DEFECT, STATED AS ARITHMETIC. Dropped, the touchdown is worth exactly six:
               the automatic extra point is on the far side of the return that was ignored. */
            if (s.you - was === 6) sixOnly++;
          }
        }
        ev = E.bossSimAdvance(s, rng);
      }
      if (s.pending) stranded++;
    }
    return { hits, stranded, sixOnly, settled };
  };
  const before = play(false), after = play(true);
  ok('a fourth down that scores hands back a decision', before.hits > 0,
    before.hits + ' of ' + GAMES + ' games');
  /*
   * AND THE COST IS ARITHMETIC RATHER THAN A WIN RATE.
   *
   * The first draft of this compared points a game between the two loops and FAILED, showing
   * the broken arm scoring MORE. It was measuring nothing: honouring the handback takes an
   * extra draw from the stream, so the two games diverge at the first hit and everything
   * after it is a different game. A per-game aggregate cannot see a one point defect through
   * that, and the 0.4 it reported was noise pointing the wrong way.
   *
   * A touchdown is worth six plus whatever is decided after it, so the defect is that the
   * dropped ones finish at exactly six. That is deterministic, it is read at the event, and
   * no divergence downstream can touch it.
   */
  ok('  and dropping it leaves the touchdown worth six', before.sixOnly === before.hits,
    before.sixOnly + ' of ' + before.hits + ' finished at six');
  ok('  where answering it kicks the point', after.settled > 0,
    after.settled + ' of ' + after.hits + ' finished at seven');
  /* AND IT LEAVES THE SIM MID-DECISION, which is the state the page must never end in. */
  ok('  and strands the sim on a pending call', before.stranded > 0 && after.stranded === 0,
    before.stranded + ' games before, ' + after.stranded + ' after');
}

const browser = await pw.chromium.launch({ executablePath: CHROME });

/* ================================================================
   THE MODE IS LAUNCHED
   ================================================================ */
console.log('\nAN ACCOUNT THAT IS NOBODY IN PARTICULAR IS LET IN');
{
  const { page, boom } = await open(browser);
  const r = await page.evaluate(() => ({
    door: !!document.getElementById('b-start-full'),
    can: window.__t.canPlayFull(),
    named: /full team/i.test(document.body.innerText),
  }));
  ok('canPlayFull() is true', r.can === true);
  ok('  the door is built', r.door);
  ok('  and the mode is named on the page', r.named);
  ok('  the page still starts clean', !boom.length, boom.join(' | ') || 'no errors');
  await page.close();
}
/* Read off disk rather than off the page, because the flag is a property of the file. */
{
  const src = fs.readFileSync(path.join(ROOT, 'football/fullteam-access.js'), 'utf8');
  /* THE LAUNCH LINE, ASSERTED RATHER THAN ASSUMED, the same way it was asserted while it
     said false. It is one word and it opens the mode to the whole public, so it is worth a
     line here in either position. Reverting it should be a decision, not a merge. */
  ok('fullteam-access.js ships FULLTEAM_LIVE = true', /FULLTEAM_LIVE = true/.test(src));

  /* AND THE TWO LISTS NAME THE SAME PEOPLE.
   *
   * THEY NO LONGER DECIDE WHO SEES EITHER MODE, because both flags are true and allowed()
   * answers yes to everybody. They are kept because canPlayClubDynasty() still reads the
   * Dynasty one directly, to comp One Franchise to a tester holding no row, and because a
   * list rebuilt from memory on the day a mode is closed again would be the wrong list.
   * The assertion survives on the second reason: two lists that are meant to match and
   * quietly stop matching is still the fault below, whatever they are being read for.
   *
   * Two unannounced modes ship on one page and each keeps its own tester list. They drifted:
   * csel8 and jordantest were added to dynasty-access.js and not to fullteam-access.js, so a
   * tester was served a front page offering Dynasty with no Full Team on it, and reasonably
   * concluded their Pro account was the problem. It is not: Pro stops the mode COUNTING runs,
   * these lists decide whether the door is BUILT.
   *
   * NOTHING FAILS WHEN THIS DRIFTS. A door that is never built throws nothing, renders
   * nothing and is reported by nobody, which is the shape of every bug this file exists for.
   *
   * A DIFFERENCE IS ALLOWED, AND HAS TO BE ANNOUNCED. If one mode should preview to somebody
   * the other should not, say so in both files and this assertion is the thing that makes
   * you. It compares the sets rather than the order, because the order carries nothing. */
  const dyn = fs.readFileSync(path.join(ROOT, 'football/dynasty-access.js'), 'utf8');
  const names = (s, k) => {
    const m = s.match(new RegExp(k + '\\s*=\\s*\\[([^\\]]*)\\]'));
    if (!m) return null;
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].toLowerCase()).sort();
  };
  const ft = names(src, 'FULLTEAM_TESTERS'), dy = names(dyn, 'DYNASTY_TESTERS');
  ok('  both lists were readable', !!ft && !!dy, ft && dy ? ft.length + ' / ' + dy.length : 'parse failed');
  const only = (a, b) => (a || []).filter((x) => (b || []).indexOf(x) < 0);
  const missFt = only(dy, ft), missDy = only(ft, dy);
  ok('  and the two lists name the same testers',
    !!ft && !!dy && !missFt.length && !missDy.length,
    (missFt.length ? 'not on Full Team: ' + missFt.join(', ') + '  ' : '')
    + (missDy.length ? 'not on Dynasty: ' + missDy.join(', ') : '')
    || ft.join(', '));
}

/* ================================================================
   THE DRAFT SCREEN SAYS WHICH PICK THIS IS
   ================================================================ */
console.log('\nTHE FIELD AND THE BOARD AGREE ABOUT WHICH SIDE IS PICKING');
{
  const { page, boom } = await open(browser);
  ok('the door is built', await page.evaluate(() =>
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
  ok('  the mean is the two averaged, times the coach',
    near((s.off + s.def) / 2 * s.coachBoost, p.mean, 1e-9), p.mean.toFixed(4));
  /* AND THE MEAN IS NOT THE OVERALL, which is the step this assertion used to say did not
     exist. fullTeamScale puts the mean on the ladder the edges are cut for, because a
     twelve man team splits one cap and a six man offence spends a whole one, so the raw
     mean reports every Full Team roster weaker than a quick draft of the same care. Before
     it, a roster that spent the whole cap cleared CLASS_FLOOR 8% of the time against the
     quick draft's 46%, reached ELITE_FLOOR never, and took the full title game penalty
     every time: three mechanics switched off in one mode with nothing reporting it. */
  ok('  and the overall is that mean put on the game\'s own ladder',
    near(Math.max(0, Math.min(100, E.fullTeamScale(p.mean))), s.overall, 1e-9),
    s.overall.toFixed(4));
  /* THE MAP IS MONOTONE AND ANCHORED. A scale that could report a better roster as worse
     would be worse than no scale, and the anchors are what make 84 and 100 mean the same
     thing here as everywhere else. */
  ok('  the ladder never reports a better team as worse', (() => {
    let last = -1;
    for (let r = 0; r <= 140; r += 0.5) {
      const v = E.fullTeamScale(r);
      if (v < last - 1e-9) return false;
      last = v;
    }
    return true;
  })());
  ok('  a cap-spending roster reaches the class edge, and the best one reads 100',
    E.fullTeamScale(76.3) >= 83.9 && E.fullTeamScale(76.3) <= 84.1
    && E.fullTeamScale(96.4) >= 99.9,
    E.fullTeamScale(76.3).toFixed(1) + ' / ' + E.fullTeamScale(96.4).toFixed(1));
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

  const m = await open(browser);
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

  /*
   * THE WAY OUT SHUTS ONCE SOMEBODY IS HIRED, and it is asserted on the COMPUTED style.
   *
   * Nothing hid it, so after a hire the screen carried "No coach, I will call it myself"
   * under the man just paid for: an offer to undo the decision the confirmation sheet had
   * asked for. Hiding it is two edits, and the first one alone does nothing, which is why
   * this reads getComputedStyle rather than the attribute. `.btn` sets display:block and
   * the UA rule for [hidden] is display:none at class specificity, so the later class wins
   * and `hidden = true` leaves the button on screen. That trap is now on its seventh
   * element in this file's CSS, three of them on this very screen.
   */
  /* HIRED THROUGH run.js AND THEN REPAINTED, which is exactly what the confirmation sheet's
     own handler does. Clicking a grid cell would have been more end to end and is not
     available: this walk spends the cap, and on about a third of cap-spending drafts not one
     affordable coach improves the roster, so the grid is legitimately empty. The painter is
     the shared path and the painter is where the bug was. */
  {
    const st = await m.page.evaluate(() => {
      const T = window.__t, r = T.getRun();
      const mkt = T.R.coachMarket(r, T.coachList());
      const c = mkt && mkt.find((x) => x.price_musd <= T.R.remaining(r));
      if (!c) return { none: true };
      T.R.hireCoach(r, c);
      T.paintCoach();
      const b = document.getElementById('b-coach-none');
      return { hired: !!r.coach, name: c.name, attr: !!(b && b.hidden),
        shown: b ? getComputedStyle(b).display : 'gone' };
    });
    if (st.none) {
      ok('  a coach was affordable', false, 'nothing in the market fit the money left');
    } else {
      ok('  a coach was hired', st.hired, st.name);
      ok('  the no-coach button carries the attribute', st.attr);
      ok('  AND IS ACTUALLY OFF THE SCREEN', st.shown === 'none', st.shown);
      /* Put it back, because the rest of this walk is the uncoached path. */
      const back = await m.page.evaluate(() => {
        const T = window.__t;
        T.R.hireCoach(T.getRun(), null);
        T.paintCoach();
        return getComputedStyle(document.getElementById('b-coach-none')).display;
      });
      ok('  and it comes back when nobody is hired', back !== 'none', back);
    }
  }

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

/* ================================================================
   NO COACH MEANS YOU CALL THE PLAYOFFS

   The trade this mode ends its draft on. Declining a coach used to buy three dials set
   before kickoff, one of which (tempo) was measured doing nothing at all; it buys the real
   fourth downs and the real two point tries now, played forward on the boss battle's board.

   DRIVEN, NOT INSPECTED, for the reason check-premium's postseason section gives: nbrkShow
   and the live board both need a built bracket and a real opponent, and neither can be
   handed a fixture. A greedy draft does not reach January every year, so the seed is
   SEARCHED for rather than assumed.

   WHAT WOULD PASS WITHOUT BEING WORTH HAVING: asserting only that the board comes up. The
   claims that matter are that it STOPS and asks, that the score it produced is the score
   that gets filed, and that a coached run still takes the resolved broadcast. All three are
   separate assertions, because the first two were right and the third wrong in the first
   draft of the branch.
   ================================================================ */
{
  console.log('\nNO COACH MEANS YOU CALL THE PLAYOFFS');
  const s = await open(browser);
  /* THE DEFENDERS ARE A SECOND DOWNLOAD and every path into this mode calls loadDefensePool
     first. Without it every roster built below would be six offensive men and six empty
     slots, which is the zero case this file already learned to refuse: the draft loop would
     never fill and the whole section would report a broken harness as a broken page. */
  await s.page.evaluate(() => window.__t.beginFullDraft());
  await s.page.waitForTimeout(6000);

  /* ONE DRAFTER FOR ALL THREE WALKS BELOW, on the page so it can reach dataNow(). It sets the
     run FIRST, because dataNow() reads the module's own `run` to decide which pool this pick
     draws from: built the other way round every pick comes off the offensive pool and the
     roster stalls at six with six empty slots. */
  await s.page.evaluate(() => {
    window.__draft = (seed) => {
      const T = window.__t, RR = T.R;
      const run = RR.createRun({ full: true, seed });
      T.setRun(run);
      let g = 0;
      while (run.roster.length < run.slots.length && g++ < 600) {
        const D = T.dataNow();
        let d; try { d = RR.spin(run, D); } catch (e) { continue; }
        const men = RR.affordableFrom(run, d.team_season_id, D.playersByTeamSeason);
        if (!men.length) continue;
        const w = men.slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
        try { RR.sign(run, w, RR.slotChoices(run, w)[0]); } catch (e) {}
      }
      return run.roster.length === run.slots.length ? run : null;
    };
  });

  /* THE SCREEN FIRST. The dials are gone and the promise is in their place. */
  const plan = await s.page.evaluate(() => {
    const T = window.__t, RR = T.R;
    const run = window.__draft(7);
    if (!run) return { men: 0, slots: 12 };
    T.paintCoach();
    document.getElementById('b-coach-none').click();
    const wrap = document.getElementById('co-planwrap');
    return {
      men: run.roster.length, slots: RR.PHASES && run.slots ? run.slots.length : -1,
      decided: !!run.coachDecided,
      shown: !!wrap && !wrap.hidden,
      dials: document.querySelectorAll('#co-plan .pl-b').length,
      text: (document.getElementById('co-planwrap').innerText || '').replace(/\s+/g, ' '),
      plan: run.plan,
    };
  });
  ok('a twelve man roster declines the coach', plan.men === plan.slots && plan.decided,
    plan.men + ' of ' + plan.slots + ', decided ' + plan.decided);
  ok('  and the screen offers no dials', plan.shown && plan.dials === 0, plan.dials + ' dials');
  ok('  and says when the calls come', /playoff game stops for you/i.test(plan.text),
    plan.text.slice(0, 100));
  /* THE PLAN IS NEUTRAL AND NOTHING CAN MOVE IT. hireCoach writes planFromCoach(null), which
     is every axis at zero, and there is no longer a control that could write anything else.
     Asserted as the VALUES rather than as null, because null is not what the run carries. */
  ok('  on a plan nothing can move', !!plan.plan
    && plan.plan.tempo === 0 && plan.plan.fourth === 0 && plan.plan.pressure === 0,
    JSON.stringify(plan.plan));

  /* THE GAME. One full season on whichever seed reaches the postseason, then the wild card
     played forward through the real buttons. */
  const live = await s.page.evaluate(async () => {
    const T = window.__t, RR = T.R;
    const toSeeding = (seed, coach) => {
      const run = window.__draft(seed);
      if (!run) return null;
      try { RR.hireCoach(run, coach); RR.finishHiring(run); } catch (e) { return null; }
      try { RR.startSeason(run, T.dataNow(), T.CTX()); } catch (e) { return null; }
      let n = 0;
      while (run.phase === RR.PHASES.SEASON && n++ < 40) {
        try { RR.advanceWeek(run, T.dataNow(), T.LEAGUE(), T.CAL()); } catch (e) { break; }
      }
      return run.phase === RR.PHASES.SEEDING ? run : null;
    };
    window.__toSeeding = toSeeding;
    /* TWENTY SEEDS, NOT FORTY. A greedy twelve man draft reaches January about 45% of the
       time, so twenty is a one in a hundred thousand miss and each miss costs a whole
       simulated season. The seed it found is reported, because a failure here is far easier
       to read as "none of twenty" than as a blank. */
    let run = null, found = null;
    for (let seed = 1; seed <= 20 && !run; seed++) { run = toSeeding(seed, null); if (run) found = seed; }
    if (!run) return { found: null };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    T.paintSeed();
    document.getElementById('b-po').click();
    /* Past the bracket animation. */
    for (let i = 0; i < 40; i++) {
      if (document.getElementById('s-bgame').classList.contains('on')) break;
      const b = document.getElementById('b-nbrk-fast');
      if (b && b.offsetParent) b.click();
      await wait(200);
    }
    const board = document.getElementById('s-bgame').classList.contains('on');
    const eye = (document.getElementById('bg-eye').textContent || '').trim();
    /* Sim the rest, which hurries the football and must NOT take the calls. */
    const fast = document.getElementById('b-boss-fast');
    if (fast) fast.click();
    let calls = 0;
    for (let i = 0; i < 600; i++) {
      const box = document.getElementById('bg-calls');
      if (box && !box.hidden) {
        const b = box.querySelector('.bcall');
        if (b) { calls++; b.click(); }
      }
      if (!document.getElementById('bg-done').hidden) break;
      await wait(40);
    }
    const you = +document.getElementById('bg-syou').textContent;
    const them = +document.getElementById('bg-sthem').textContent;
    const filed = run.season.results.filter((r) => r.playoff).slice(-1)[0] || null;
    /* THE TEXT COLUMN, not the row. A row opens with its clock, so a name test against the
       whole thing asks whether "4TH 3:12 You" starts with "You". */
    const callRows = [...document.querySelectorAll('#bg-log .pl.call .w')]
      .map((r) => (r.innerText || '').replace(/\s+/g, ' ').trim());
    return { found, board, eye, calls, you, them, filed, callRows,
      pending: T.bossPending(),
      done: !document.getElementById('bg-done').hidden,
      state: (document.getElementById('bg-state').textContent || '').trim(),
      drives: document.querySelectorAll('#bg-log .pl').length };
  });
  if (!live.found) {
    ok('a seed reached the playoffs', false, 'none of 20 did');
  } else {
    ok('the wild card is played forward, not resolved', live.board && live.done,
      'seed ' + live.found + ', board ' + live.board + ', final ' + live.done);
    ok('  on the round, not on a boss', /wild card|divisional/i.test(live.eye), live.eye);
    /* THE POINT OF THE WHOLE FEATURE. Sim the rest was pressed on the first frame, so every
       stop after it is a stop the page refused to hurry past. Zero calls means the game
       played itself. */
    ok('  and it stopped for the calls', live.calls > 0, live.calls + ' calls');
    /* EVERY CALL LEAVES A ROW, on this side too. The narration over the field is painted over
       by the next drive, so the log is the only record either reader keeps, and a log whose
       shape depended on who was looking would be the one screen on this page that did. */
    ok('    each of which is in the log', live.callRows.length === live.calls,
      live.callRows.length + ' rows against ' + live.calls + ' calls');
    ok('    in the second person', live.callRows.length > 0
      && live.callRows.every((r) => /^You /.test(r) && !/ goes | takes | kicks | punts /.test(r)),
      live.callRows[0] || 'no rows');
    ok('  having actually played a game', live.drives > 4, live.drives + ' drives logged');
    /* AND IT DID NOT FINISH MID-DECISION. A call that hands back another call and is dropped
       leaves the sim pending, which is the page half of the node section above. */
    /* A NET RATHER THAN A PROOF, and worth saying so. The case fires on about 4% of games,
       so one wild card will usually not meet it and this will usually pass either way. The
       section above is where that defect is actually held; this is the end to end reading
       that would catch it if the page ever stopped honouring the handback for a whole run. */
    ok('  and finished with nothing left to answer', live.pending === false,
      'pending ' + live.pending);
    /* THE SCORE ON SCREEN IS THE SCORE THAT IS FILED. This is what the `pre` path of
       advanceWeek exists for, and getting it wrong is silent: a resolved result under a live
       scoreboard reads as a scoreboard that lied. */
    ok('  and the filed result is the one on the bug', !!live.filed
      && live.filed.shownYou === live.you && live.filed.shownThem === live.them,
      live.filed ? live.filed.shownYou + '-' + live.filed.shownThem
        + ' against ' + live.you + '-' + live.them : 'nothing filed');
    ok('    which won when the screen said it won', !!live.filed
      && live.filed.won === (live.you > live.them), String(live.filed && live.filed.won));
    ok('    and is marked as played forward', !!live.filed && live.filed.live === true);
    /* NO BOX SCORE, DELIBERATELY. A forward sim scores on drives rather than by sampling each
       man, so a per-player column here would be invented. Every reader guards on it. */
    ok('    with no invented box score', !!live.filed && live.filed.lines === null);
  }

  /*
   * AND THE COACH MAKES THE CALLS, WHICH THIS USED TO ASSERT THE OPPOSITE OF.
   *
   * It said "a coached team still gets the broadcast", because when the live board arrived
   * only an uncoached team played forward. That was the wrong half of the idea to keep. A
   * coach who cost real money and whose philosophy the hire sheet describes at length never
   * appeared to DO anything: he moved two multipliers and no screen ever showed him deciding
   * a game. Reported as wanting to be told when he goes for two and fails, which can only be
   * true if he is really deciding it.
   *
   * So every Full Team playoff game plays forward now and the hire decides WHO ANSWERS. The
   * three claims below are what replaced the reversed one, and they are separate because the
   * first two were right and the third wrong in the first draft of this:
   *
   *   the board comes up for a coached run too
   *   it never asks the reader anything
   *   and what he decided is in the log, by name, with how it turned out
   */
  const coached = live.found == null ? null : await s.page.evaluate(async (seed) => {
    const T = window.__t, RR = T.R;
    /* THE SEED IS SEARCHED AGAIN RATHER THAN REUSED, and that is not laziness. A coach moves
       the rating, which moves seventeen games, so the seed that reached January uncoached is
       not guaranteed to reach it with a man in charge. The claim being tested is about the
       branch, and any seed that reaches a playoff round proves it. The one it found without a
       coach is tried first. */
    const seeds = [seed]; for (let i = 1; i <= 20; i++) if (i !== seed) seeds.push(i);
    let run = null, hired = false;
    for (const sd of seeds) {
      /* The cheapest man in the market, because who he is does not matter here. What matters
         is that run.coach is not null when runPlayoffs asks. */
      const probe = window.__draft(sd);
      if (!probe) continue;
      const market = RR.coachMarket(probe, T.coachList()) || [];
      const man = market.slice().sort((a, b) => a.price_musd - b.price_musd)[0] || null;
      if (!man) continue;
      hired = true;
      run = window.__toSeeding(sd, man);
      if (run && run.coach) break;
      run = null;
    }
    if (!run) return { hired, seeded: false };
    const name = run.coach.name;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    T.paintSeed();
    document.getElementById('b-po').click();
    for (let i = 0; i < 40; i++) {
      if (document.getElementById('s-po').classList.contains('on')
        || document.getElementById('s-bgame').classList.contains('on')) break;
      const b = document.getElementById('b-nbrk-fast');
      if (b && b.offsetParent) b.click();
      await wait(200);
    }
    const board = document.getElementById('s-bgame').classList.contains('on');
    const broadcast = document.getElementById('s-po').classList.contains('on');
    const fast = document.getElementById('b-boss-fast');
    if (fast) fast.click();
    /* THE READER IS NEVER ASKED, watched rather than checked once at the end. A call button
       that appeared and was answered by a stray click would leave nothing behind, so the poll
       counts every frame one is on screen. */
    let asked = 0, rounds = 0, calls = 0;
    for (let i = 0; i < 1500; i++) {
      if (document.querySelectorAll('#bg-calls .bcall').length) asked++;
      calls = Math.max(calls, document.querySelectorAll('#bg-log .pl.call').length);
      if (!document.getElementById('bg-done').hidden) {
        rounds++;
        /* On through the postseason, because one wild card need not produce a call and the
           claim is about the mode rather than about one game. */
        if (rounds >= 4 || !document.getElementById('b-boss-continue')) break;
        document.getElementById('b-boss-continue').click();
        await wait(400);
        if (!document.getElementById('s-bgame').classList.contains('on')) break;
        const f2 = document.getElementById('b-boss-fast');
        if (f2 && f2.offsetParent) f2.click();
      }
      await wait(40);
    }
    const rows = [...document.querySelectorAll('#bg-log .pl.call .w')]
      .map((r) => (r.innerText || '').replace(/\s+/g, ' ').trim());
    return { hired: true, seeded: true, board, broadcast, asked, calls, rows, name,
      pending: T.bossPending() };
  }, live.found);
  if (coached && coached.hired && coached.seeded) {
    ok('a coached team plays forward too', coached.board && !coached.broadcast,
      'board ' + coached.board + ', broadcast ' + coached.broadcast);
    ok('  and is never asked to call it', coached.asked === 0,
      coached.asked + ' frames with a call button up');
    /* A GAME NEED NOT PRODUCE A CALL, so this walks the postseason and only then insists. A
       run that reached January and never met a genuine fourth down or a live two point try
       across every round it played would mean the sim stopped asking. */
    ok('  and he actually made calls', coached.calls > 0, coached.calls + ' logged');
    ok('    which the log names him for', coached.rows.length > 0
      && coached.rows.every((r) => r.indexOf(coached.name) === 0),
      coached.rows[0] || 'no rows');
    /* THE WHOLE POINT OF THE REQUEST. A row naming the man and the decision and stopping
       there is the half that was already true; how it turned out is the half that was asked
       for. */
    ok('    and says how it turned out', coached.rows.length > 0
      && coached.rows.every((r) => /Good|No good|Converted|Stuffed|Touchdown|Gave it back/.test(r)),
      coached.rows.slice(0, 2).join(' | '));
    ok('  and finished with nothing left to answer', coached.pending === false,
      'pending ' + coached.pending);
  } else {
    ok('a coached team plays forward too', false,
      coached ? 'hired ' + coached.hired + ', seeded ' + coached.seeded : 'no seed to replay');
  }
  ok('  nothing threw', !s.boom.length, s.boom.join(' | ') || 'no errors');
  await s.page.close();
}

await browser.close();
/* NO TRAILING NEWLINE ON THE VERDICT. Every other checker here is run in a loop that reports
   `tail -1`, and a final blank line makes a passing suite read as one that printed nothing. */
console.log(bad ? '\n' + bad + ' FAILED' : '\nall full team checks passed');
process.exit(bad ? 1 : 0);
