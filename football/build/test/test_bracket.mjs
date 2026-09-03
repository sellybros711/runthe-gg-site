/* The playoff bracket, in a browser.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node football/build/test/test_bracket.mjs
 *
 * The postseason used to be four opponents and a scoreboard: you were told you were the
 * five seed and then handed a team, with no field around either of you and no way to see
 * where the run sat. This draws the real thing, fourteen teams in the NFL's shape, and
 * walks it forward a round at a time.
 *
 * Two claims, and they need two different rigs, which is why this file has two halves.
 *
 *   THE DRAWING has to hold for every seeding and every round: the bye entry, the
 *   reseeding, and the way a column fills in only once the round feeding it has been
 *   played. Getting there by drafting means being seeded (five seasons in eight) and then
 *   winning four games on top, which is a test that fails for no reason about one run in
 *   seven. So the first half builds an instrumented copy of the page, the same one-anchor
 *   insertion the scratch harness uses, parks a run at a chosen record, and walks it to
 *   the final. Deterministic, both entries, every run.
 *
 *   THE HAND-OFF has to hold on the page as it ships, because the bracket sits between
 *   advanceWeek and the broadcast and that seam is not visible from the numbers. So the
 *   second half drafts and plays a real season with nothing injected and checks that the
 *   bracket stood in front of exactly the playoff games the run went on to record. It
 *   depends on being seeded and on nothing else.
 *
 * The instrumented copy is written into football/ because the page loads engine.js and
 * run.js beside itself, and removed in a finally. If a crash ever leaves one behind it is
 * called __test_bracket.html and is safe to delete.
 *
 * The bug this was written for, found by this file before it shipped: nbrkPlay simulated
 * every seat it was given, the player's included, so a run still alive in the conference
 * championship was drawn knocked out in the divisional round. The player's line is drawn
 * forward and left uncached now, and nbrkSettleMine writes the real result over it.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8081';
const PROBE = ROOT + '/football/__test_bracket.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 150) : '')); };

/* Neither the first run guide nor the arcade panel is wanted in front of a draft. Both are
   turned off through the shipped code's own opt-outs rather than by editing the page, so
   this cannot accidentally pass against a build where they were removed. */
const QUIET = () => { try {
  localStorage.setItem('ps_seen_guide', '1');
  localStorage.setItem('rtg_arcade_ad_off', '1');
} catch (e) {} };

/* ── the instrumented copy ──────────────────────────────────────────────────
   One anchor, the same one every harness for this page uses. The hook reaches into the
   page's own scope, which a second <script> tag cannot do: everything in this game is
   nested one level down inside the main script. */
const HOOK = `
window.__BRK={
  park(wins,bye,seed){
    run=R.createRun({seed,conference:null});
    run.season={regularWins:wins,playoffRound:0,wins,losses:17-wins,results:[]};
    run.playoffSeed={made:true,bye:!!bye,rounds:bye?3:4,label:bye?'Top seed':'Wild card',
      roundNames:E.playoffRoundNames(bye?3:4)};
    /* AS IDS, the way run.js stores them. The bracket resolves them back through DATA, so
       injecting objects here would test a data shape the shipped page never sees, which is
       exactly how the seats-are-strings bug hid: every pinned opponent rendered as the
       nickname of undefined on the real page and this harness never noticed. */
    run.playoffs=E.generatePlayoffs(DATA.prepared,E.createSeededRNG(5),{count:bye?3:4})
      .map(g=>g.team_season_id);
    nbrk=null;
    const B=nbrkBuild();
    return {mySeed:B.mySeed,myConf:B.myConf,farConf:B.farConf,
      near:B.near.slice(1).map(x=>x?(x.you?'YOU':x.team.team_season_id):null),
      far:B.far.slice(1).map(x=>x?(x.you?'YOU':x.team.team_season_id):null),
      nearConfs:B.near.slice(1).filter(x=>x&&x.team).map(x=>nbrkConf(x.team)),
      farConfs:B.far.slice(1).filter(x=>x&&x.team).map(x=>nbrkConf(x.team)),
      clubs:[...B.near.slice(1),...B.far.slice(1)].filter(x=>x&&x.team).map(x=>x.team.franchise),
      empty:[...B.near.slice(1),...B.far.slice(1)].filter(x=>!x||(!x.team&&!x.you)).length};
  },
  first:()=>nbrkFirstRound(),
  /* Walk one round: draw it, run the reveal to its end without waiting out the animation,
     and read back what is on screen. */
  show:(r)=>new Promise(res=>{ nbrkShow(r,res); if(nbrkSkip) nbrkSkip(); }),
  settle:(r,won)=>nbrkSettleMine(r,won),
  screen:()=>({
    title:document.getElementById('nbrk-round').textContent,
    cols:document.querySelectorAll('#nbrk-rail .nbrk-col').length,
    games:document.querySelectorAll('#nbrk-rail .nbrk-g').length,
    live:document.querySelectorAll('#nbrk-rail .nbrk-g.live').length,
    mine:document.querySelectorAll('#nbrk-rail .nbrk-t.me').length,
    tbd:[...document.querySelectorAll('#nbrk-rail .nbrk-col')]
      .map(c=>c.querySelectorAll('.nbrk-t.tbd').length),
    /* What a settled game looks like: the side that went through, and the player's own
       seat when they are the one that went through. Read as computed colour rather than as
       a class name, because the class surviving a stylesheet edit proves nothing. */
    tint:(()=>{ const n=document.querySelector('#nbrk-rail .nbrk-t.won:not(.me) .nm');
      return n?{name:getComputedStyle(n).color,weight:getComputedStyle(n).fontWeight,
        bg:getComputedStyle(n.closest('.nbrk-t')).backgroundColor}:null; })(),
    mineWon:(()=>{ const n=document.querySelector('#nbrk-rail .nbrk-t.won.me .nm');
      return n?getComputedStyle(n).color:null; })(),
    beaten:document.querySelectorAll('#nbrk-rail .nbrk-t.out').length,
    scroll:Math.round(document.getElementById('nbrk-rail').scrollLeft),
    maxScroll:Math.round(document.getElementById('nbrk-rail').scrollWidth
      -document.getElementById('nbrk-rail').clientWidth),
  }),
  games:(r)=>nbrkRoundGames(r).map(g=>({side:g.side,me:!!g.me,key:g.key,
    pair:g.pair.map(x=>x?(x.you?'YOU':(x.team?x.team.team_season_id:null)):null)})),
  /* THE OPPONENT THE RUN SCHEDULES for a round, straight off the engine helper the season
     screen reads, as an id so it can be held against what the bracket drew in the player's
     game. A round the player is not in has none. */
  oppId:(r)=>{ const o=E.playoffOpponent(run.playoffs,run.playoffSeed.rounds,r-nbrkFirstRound());
    return (o&&o.team_season_id)?o.team_season_id:(o||null); },
  hasData:()=>!!DATA,
  state:()=>({round:run.season&&run.season.playoffRound,
    rounds:(run.playoffSeed&&run.playoffSeed.rounds)||0,
    roundNames:(run.playoffSeed&&run.playoffSeed.roundNames)||[],
    playoffs:((run.season&&run.season.results)||[]).filter(r=>r.playoff).map(r=>({round:r.round,won:!!r.won}))}),
};

boot();`;

const buildProbe = () => {
  const src = fs.readFileSync(ROOT + '/football/index.html', 'utf8');
  if (src.split('\nboot();').length !== 2) throw new Error('the boot() anchor moved; update this file');
  fs.writeFileSync(PROBE, src.replace('\nboot();', HOOK));
};

const on = (p, id) => p.evaluate((i) => {
  const s = document.getElementById(i); return !!s && s.classList.contains('on'); }, id);

/* INTO AN OFFENSE DRAFT, whichever control the front page is currently offering it under.
   The front page shows one full-width Start a run while the defense draft is off, and the
   Offense half of a split once it is on; clicking #b-start by name worked until the day that
   flag flipped and then timed out on a button that was still in the DOM and no longer
   rendered. This suite is about the postseason and should not care which. */
const startOffense = async (p) => {
  const split = await p.evaluate(() => {
    const s = document.getElementById('hp-split'); return !!s && !s.hidden; });
  await p.click(split ? '#b-start-off' : '#b-start');
};

/* THE DRAFT, PLAYED BY SOMEBODY WHO IS TRYING. Best points per game it can afford, holding
   a floor back for the spots still to fill, which is the whole puzzle the game is built
   around and takes about 139 of the 140 available.

   This started out taking the first affordable tile, on the grounds that a dumb strategy
   is a fair one. It is not: the first tile is DOM order rather than merit. Measured over
   ten seasons it went 7-10, 15-2, 7-10, 9-8, 12-5, 9-8, 8-9, 8-9, 10-7, 10-7: two of the
   ten seeded, and one run of this suite duly drafted ten in a row that all missed and
   failed five assertions about a bracket that had never been on screen. Playing badly does
   not make the test stricter, it just spends a quarter of an hour on seasons that never
   reach the screen this file exists to check.

   Drafting properly is five of eight over the same measurement: 14-3, 13-4, 12-5, 13-4,
   12-5, then 11-6, 9-8 and 10-7 that missed. Five in eight is what the six attempts below
   are sized against, and it is why nothing here is allowed to depend on WINNING a playoff
   game: that would be another coin toss on top, and the round-to-round seam is checked
   deterministically in the first half instead.

   The cap is a constant here rather than read off the page: it is the only number the
   harness needs and the page does not print a machine-readable one. If the game's cap ever
   moves, this holds a floor back too aggressively and the assertions below still hold,
   they just take more attempts to get there. */
const CAP = 140, FLOOR = 4, SPOTS = 6;
/* Returns how many men it signed, and the caller checks that. An earlier version just broke
   out of the loop when a board failed to arrive in time and let the season play with three
   men on the roster, which comes back as "no run reached the postseason" six times over and
   reads like the bracket is broken. A harness that cannot do its setup has to say so in
   those words. It happens on a loaded machine: run this suite on its own. */
const draft = async (p) => {
  let spent = 0, taken = 0, signed = 0;
  for (let i = 0; i < 9; i++) {
    if (await on(p, 's-squad') || await on(p, 's-season')) break;
    /* The board is torn down and respun between picks, so each round waits for a live tile
       rather than assuming one is under the cursor. */
    const ready = await p.waitForFunction(() => [...document.querySelectorAll('#opts .tile')]
      .some((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no')),
      null, { timeout: 30000 }).catch(() => null);
    if (!ready) break;
    const got = await p.evaluate(([sp, idx, cap, floor, spots]) => {
      const live = [...document.querySelectorAll('#opts .tile')]
        .filter((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no'));
      if (!live.length) return null;
      /* Price is in the tile's header (`QB$17.8M`) and the rating is the figure beside it
         (`11.9FPPG`). Read off the rendered tile rather than out of the data, because that
         is what a player is choosing between. */
      const rows = live.map((t) => {
        const m = ((t.querySelector('.th') || {}).textContent || '').match(/\$([\d.]+)M/);
        return { t, cost: m ? parseFloat(m[1]) : 999,
          fppg: parseFloat((t.querySelector('.tf') || {}).textContent) || 0 };
      });
      const budget = cap - sp - floor * (spots - 1 - idx);
      const can = rows.filter((r) => r.cost <= budget);
      /* Nothing affordable means the earlier picks were too expensive: take the cheapest
         man on the board and carry on, the way the game forces you to. */
      const from = can.length ? can : rows.slice().sort((a, b) => a.cost - b.cost).slice(0, 1);
      /* CHEAPEST AMONG EQUALS, and the second half of that is not tidiness.
         The board prints one decimal, so ties on the figure are common, and with no
         tie-break the winner was whichever tile the page happened to list first. That
         made this harness depend on the ORDER of a list it does not own: when the ALL
         tab changed from position order to price order the tie-break silently became
         'take the most expensive man with these points', six picks in a row, and the
         drafted team stopped reaching the postseason in eight attempts out of eight.
         Nothing about the game had got worse. Same points for less money is what a
         player would do anyway, so this is both the competent choice and a
         deterministic one. */
      from.sort((a, b) => b.fppg - a.fppg || a.cost - b.cost);
      from[0].t.click();
      return { cost: from[0].cost };
    }, [spent, taken, CAP, FLOOR, SPOTS]);
    if (!got) break;
    spent += got.cost; taken++;
    signed = taken;
    await p.waitForTimeout(500);
    /* Flex-eligible players open a slot chooser; any slot will do. */
    if (await p.evaluate(() => document.getElementById('sheet').classList.contains('on'))) {
      await p.evaluate(() => { const b = document.querySelector('.slotopt'); if (b) b.click(); });
      await p.waitForTimeout(500);
    }
  }
  return signed;
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

try {
  buildProbe();

  /* ── the shape of the field ─────────────────────────────────────────────── */
  console.log('=== the shape of the field ===');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(QUIET);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + String(e.message).split('\n')[0]); });
    await p.goto(HOST + '/football/__test_bracket.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__BRK && window.__BRK.hasData(), null, { timeout: 60000 });

    /* Both entries into the bracket. A bye seed walks in a round late, and that is where
       the college game's bracket went wrong the first time it was built. */
    for (const [tag, wins, bye, seed, want] of [
      ['a wild card at 12-5', 12, false, 11, 5],
      ['a wild card at 9-8', 9, false, 4, 7],
      ['the top seed on a bye', 16, true, 11, 1],
    ]) {
      const r = await p.evaluate(([w, y, s]) => {
        const B = window.__BRK.park(w, y, s);
        return { B, first: window.__BRK.first(),
          games: [0, 1, 2, 3].map((rd) => window.__BRK.games(rd)),
          opps: [0, 1, 2, 3].map((rd) => window.__BRK.oppId(rd)) };
      }, [wins, bye, seed]);
      const { B, first, games, opps } = r;
      const ids = [...B.near, ...B.far].filter((x) => x && x !== 'YOU');

      ok(tag + ': seven seeds a conference', B.near.length === 7 && B.far.length === 7,
        { near: B.near.length, far: B.far.length });
      ok(tag + ': nobody is in the field twice', ids.length === new Set(ids).size, { n: ids.length });
      /* And not the same club in two different years either. Every season of every team is
         its own row in the data, and the strongest rows are a handful of dynasties, so
         picking on strength alone put three Patriots teams in one conference. */
      ok(tag + ': one season per franchise',
        B.clubs.length === new Set(B.clubs).size,
        B.clubs.filter((c, i) => B.clubs.indexOf(c) !== i));
      /* Skipping a repeat club must not run the pool dry and leave a seat with nobody in
         it: an empty seat draws as TBD in a round that has already been played. */
      ok(tag + ': every seat is filled', B.empty === 0, { empty: B.empty });
      ok(tag + ': seeded on the record', B.mySeed === want, { seed: B.mySeed, want });
      ok(tag + ': the player walks in at the right round', first === (bye ? 1 : 0), { first });
      ok(tag + ': six, four, two, one', JSON.stringify(games.map((g) => g.length)) === '[6,4,2,1]',
        games.map((g) => g.length));
      ok(tag + ': the player is in one game a round, and none before',
        games.slice(first).every((g) => g.filter((x) => x.me).length === 1)
        && games.slice(0, first).every((g) => g.every((x) => !x.me)),
        games.map((g) => g.filter((x) => x.me).length));
      /* THE BUG THIS FIX IS FOR. Every round the player is in, the team drawn across from
         them has to be the team the run schedules, not a plausible stranger the bracket's
         own reseed happened to land there. Read the opponent seat out of the player's game
         and hold it against E.playoffOpponent, the one source advanceWeek and the season
         screen both read. Before the fix the wild card and divisional seats were fillers and
         this failed on both; the conference and Super Bowl happened to be pinned already. */
      const drawnOpp = (rd) => { const g = games[rd].find((x) => x.me); if (!g) return null;
        return g.pair.find((x) => x && x !== 'YOU') || null; };
      ok(tag + ': the team drawn across from the player is the one the run schedules',
        games.slice(first).every((g, k) => { const rd = first + k;
          return drawnOpp(rd) === opps[rd] && opps[rd] != null; }),
        games.map((g, rd) => (rd < first ? null : [drawnOpp(rd), opps[rd]])));
      /* A conference is a closed set until the Super Bowl, with exactly one exception, and
         the exception is the point of this assertion rather than a hole in it.

         The last two rungs of the difficulty ladder are the 2007 Patriots and the 1972
         Dolphins, and both were AFC. The player meets the first in the conference
         championship, so that team has to be on the player's side, and the second in the
         Super Bowl, so that team has to be on the far side. One of the two therefore sits
         under a conference heading it never played in, whichever way round it is drawn.
         The game keeps the championship opponent honest and moves the Dolphins, because
         the championship game is the one whose heading is printed twice.

         So: the player's whole side is one conference, no exceptions, and the far side is
         one conference apart from its top seed. If that ever becomes two teams, somebody
         has started filling the field from the wrong pool. */
      ok(tag + ': the player\'s side of the draw is all one conference',
        new Set(B.nearConfs).size === 1 && B.nearConfs[0] === B.myConf,
        { near: [...new Set(B.nearConfs)], want: B.myConf });
      ok(tag + ': the far side is one conference bar the Super Bowl opponent',
        B.farConfs.slice(1).every((c) => c === B.farConf),
        { top: B.farConfs[0], rest: [...new Set(B.farConfs.slice(1))], want: B.farConf });
      /* Reseeding is the whole point of a bracket rather than a ladder: the lowest seed
         left always draws the highest. Round one is fixed at 2-7, 3-6, 4-5. */
      const wc = games[0].filter((g) => g.side === 'near');
      ok(tag + ': the wild card round is 2-7, 3-6, 4-5', wc.length === 3, { n: wc.length });
      /* Nobody meets themselves, in any round, on either side. */
      const selfPlay = games.flat().filter((g) => g.pair[0] && g.pair[0] === g.pair[1]);
      ok(tag + ': nobody plays themselves', selfPlay.length === 0, selfPlay.map((g) => g.key));
    }

    /* ── walked forward, round by round ──────────────────────────────────────
       The seam this file was written for: settle the player's game, draw the next round,
       and the drawing has to move on with them. It is checked here rather than on a played
       season because reaching the Super Bowl by drafting means winning four coin tosses on
       top of the five-in-eight chance of being seeded at all, which is a test that fails
       for no reason about one run in seven. Parked, both entries into the bracket are
       walked all the way to the final on every run. */
    for (const [tag, wins, bye, seed] of [
      ['a wild card walked to the final', 12, false, 11],
      ['a bye seed walked to the final', 16, true, 11],
    ]) {
      const first = bye ? 1 : 0;
      /* A bye run draws one extra box in the first column, under a Byes heading: the two
         top seeds, who are not playing that round but are in the field and would otherwise
         appear from nowhere in the divisional. It is a fourteenth game box, and since the
         player IS one of those top seeds it also shows them a second time. */
      const extra = bye ? 1 : 0;
      const seen = [];
      await p.evaluate(([w, y, s]) => window.__BRK.park(w, y, s), [wins, bye, seed]);
      for (let r = first; r < 4; r++) {
        await p.evaluate((rr) => window.__BRK.show(rr), r);
        seen.push(await p.evaluate(() => window.__BRK.screen()));
        await p.evaluate((rr) => window.__BRK.settle(rr, true), r);   // the player wins it
      }
      const ROUNDS = ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'];

      ok(tag + ': every round names itself', seen.every((x, i) => x.title === ROUNDS[first + i]),
        seen.map((x) => x.title));
      ok(tag + ': the whole field is drawn every time',
        seen.every((x) => x.cols === 4 && x.games === 13 + extra),
        { got: seen.map((x) => [x.cols, x.games]), wantGames: 13 + extra });
      ok(tag + ': exactly one game is ringed, and it is the player\'s',
        seen.every((x) => x.live === 1), seen.map((x) => x.live));
      /* One more appearance a round: the rounds already won, plus the one being played, and
         for a bye the seat in the Byes box on top of that. A bracket that had the player in
         the Super Bowl on the first screen was giving the game away, which is what this
         counts. */
      ok(tag + ': the player appears once more each round',
        seen.every((x, i) => x.mine === i + 1 + extra),
        { got: seen.map((x) => x.mine), want: seen.map((x, i) => i + 1 + extra) });
      /* A column fed by a round nobody has played is all TBD. Column r has 2 seats a game:
         6, 4, 2 and 1 games across the four rounds. */
      const SEATS = [12, 8, 4, 2];
      ok(tag + ': no column is filled in before its round is played',
        seen.every((x, i) => {
          const now = first + i;
          return x.tbd.every((n, c) => n === (c <= now ? 0 : SEATS[c]));
        }), seen.map((x) => [x.title, x.tbd]));
      /* THE WINNER IS TINTED, not merely bolded. Weight alone at 11.5px in a column you
         scan rather than read made a settled game look like two similar rows. Asserted as
         the computed colour: green name, faint green wash, heavier weight, and the beaten
         side dimmed rather than reddened, because red is already the player's own colour
         on this screen. */
      const settled = seen.slice(1);          // the first screen has nothing settled yet
      ok(tag + ': the side that went through is tinted, not just bolded',
        settled.length > 0 && settled.every((x) => x.tint
          && x.tint.name === 'rgb(134, 239, 172)'
          && x.tint.weight === '800'
          && x.tint.bg !== 'rgba(0, 0, 0, 0)'),
        settled.map((x) => x.tint));
      ok(tag + ': and the beaten side is dimmed rather than reddened',
        settled.every((x) => x.beaten > 0), settled.map((x) => x.beaten));
      /* The player wins every game in this walk, so from the second screen on their own
         seat is a settled winner and has to stay red: advanced is the wash, you is the
         colour, and one must not overwrite the other. */
      ok(tag + ': your own seat keeps your colour when you go through',
        settled.every((x) => x.mineWon === 'rgb(252, 165, 165)'),
        settled.map((x) => x.mineWon));
      /* And the round being played is on screen rather than off the right hand edge. */
      ok(tag + ': the rail scrolls to the round being played',
        seen.every((x, i) => x.scroll > 0 || first + i === 0 || x.maxScroll === 0),
        seen.map((x) => [x.scroll, x.maxScroll]));
    }
    await ctx.close();
  }

  /* ── the page as it ships ──────────────────────────────────────────────────
     No hook, no injected run: a season drafted and played, and the bracket read off the
     screen. Seeds are not pinned, because any run that gets there is a run the bracket has
     to draw correctly, and a pinned seed is one board rather than the game.

     WHAT THIS HALF IS FOR is the seam between advanceWeek and the broadcast, which is not
     visible from the numbers: that the bracket comes up at all on a real run, that one tap
     hands off to the game, and that the number of times it stood there matches the number
     of playoff games the run recorded. How the drawing behaves from round to round is
     settled above, deterministically, so nothing here has to depend on winning. */
  console.log('=== the postseason as it ships ===');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(QUIET);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + String(e.message).split('\n')[0]); });

    /* Eight attempts. Five-in-eight seeded puts the odds of missing all eight at about one
       run in two thousand, and the extra attempts cost nothing on a run that gets there
       early: the loop stops the moment a bracket has been seen. Six was the first number
       here, and a clean run promptly used five of them, which is close enough to the edge
       to be worth the headroom. Observed across suite runs: 1 try, then 5. */
    let seeded = null, shots = [], played = 0, tries = 0, short = 0;
    for (; tries < 8 && !shots.length; tries++) {
      await p.goto(HOST + '/football/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForSelector('#s-intro.on', { timeout: 60000 });
      await startOffense(p);
      await p.waitForSelector('#opts .tile', { timeout: 30000 });
      if (await draft(p) < SPOTS) { short++; continue; }
      await p.waitForSelector('#s-squad.on,#s-season.on', { timeout: 30000 });
      if (await on(p, 's-squad')) await p.click('#b-play');
      await p.waitForSelector('#s-season.on', { timeout: 30000 });
      await p.click('#b-sim');
      await p.waitForSelector('#s-seed.on,#s-over.on', { timeout: 90000 });
      if (!(await on(p, 's-seed'))) continue;
      seeded = await p.evaluate(() => document.getElementById('sd-rec').textContent);

      await p.click('#b-po');
      for (let n = 0; n < 5; n++) {
        await p.waitForSelector('#s-nbrk.on,#s-over.on', { timeout: 90000 });
        if (await on(p, 's-over')) break;
        shots.push(await p.evaluate(() => ({
          title: document.getElementById('nbrk-round').textContent,
          cols: document.querySelectorAll('#nbrk-rail .nbrk-col').length,
          games: document.querySelectorAll('#nbrk-rail .nbrk-g').length,
          live: document.querySelectorAll('#nbrk-rail .nbrk-g.live').length,
          mine: document.querySelectorAll('#nbrk-rail .nbrk-t.me').length,
          /* The rail scrolls sideways; the page must not. */
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        })));
        await p.click('#b-nbrk-fast');           // one tap ends the reveal and hands off
        await p.waitForSelector('#s-po.on', { timeout: 40000 });
        await p.click('#b-po-fast');
        await p.waitForTimeout(1500);
      }
      await p.waitForSelector('#s-over.on', { timeout: 90000 });
      /* What the run recorded, read off the calendar rather than out of a variable, because
         the calendar is what the player is shown afterwards. It draws a square for every
         round the seeding entitles you to, played or not, and the unplayed ones carry
         `todo`, so the count that means "games played" is the squares without it. */
      played = await p.evaluate(() =>
        document.querySelectorAll('#v-list .cw.po:not(.todo)').length);
    }

    /* A draft that could not finish is a broken harness, not a broken bracket, and it says
       so in those words rather than as six seasons that missed the postseason. */
    ok('the harness can draft a full squad', short === 0,
      { draftsThatRanShort: short, hint: 'run this suite on its own, it needs the machine' });
    ok('a drafted run reaches the postseason', shots.length > 0, { tries, seeded });
    ok('the whole field is drawn every time',
      shots.length > 0 && shots.every((s) => s.cols === 4 && s.games === 13),
      shots.map((s) => [s.cols, s.games]));
    ok('exactly one game on it is the player\'s',
      shots.length > 0 && shots.every((s) => s.live === 1), shots.map((s) => s.live));
    ok('the player is on the bracket',
      shots.length > 0 && shots.every((s) => s.mine >= 1), shots.map((s) => s.mine));
    ok('the rail scrolls, the page does not',
      shots.every((s) => s.overflow <= 1), shots.map((s) => s.overflow));
    /* The drawing and the record are the same run seen twice. A season that lost in the
       divisional round cannot have been shown a conference championship bracket. */
    ok('the bracket stood in front of every playoff game the run played',
      shots.length > 0 && shots.length === played,
      { bracketsShown: shots.length, playoffGamesPlayed: played, rounds: shots.map((s) => s.title) });
    ok('the postseason still ends on the results screen', await on(p, 's-over'));
    await ctx.close();
  }
} finally {
  await b.close();
  if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
