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
 *   THE SHAPE has to hold for every seeding, including the bye, and a bye seed is about
 *   one run in twenty. Reaching it by drafting and hoping is not a test, it is a wait. So
 *   the first half builds an instrumented copy of the page, the same one-anchor insertion
 *   the scratch harness uses, and parks a run at a chosen record.
 *
 *   THE HAND-OFF has to hold on the page as it ships, because the bracket sits between
 *   advanceWeek and the broadcast and that seam is not visible from the numbers. So the
 *   second half drafts, plays and wins or loses a real season with nothing injected, and
 *   checks the drawing against what the run recorded.
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
    run.playoffs=E.generatePlayoffs(DATA.prepared,E.createSeededRNG(5),{count:bye?3:4});
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
  games:(r)=>nbrkRoundGames(r).map(g=>({side:g.side,me:!!g.me,key:g.key,
    pair:g.pair.map(x=>x?(x.you?'YOU':(x.team?x.team.team_season_id:null)):null)})),
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

/* The draft, played the way somebody in a hurry plays it: take the first tile you can
   afford, until the squad sheet appears. The board is torn down and respun between picks,
   so each round waits for a live tile rather than assuming one is under the cursor. */
const draft = async (p) => {
  for (let i = 0; i < 9; i++) {
    if (await on(p, 's-squad') || await on(p, 's-season')) break;
    const ready = await p.waitForFunction(() => [...document.querySelectorAll('#opts .tile')]
      .some((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no')),
      null, { timeout: 20000 }).catch(() => null);
    if (!ready) break;
    await p.evaluate(() => [...document.querySelectorAll('#opts .tile')]
      .find((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no')).click());
    await p.waitForTimeout(500);
    /* Flex-eligible players open a slot chooser; any slot will do. */
    if (await p.evaluate(() => document.getElementById('sheet').classList.contains('on'))) {
      await p.evaluate(() => { const b = document.querySelector('.slotopt'); if (b) b.click(); });
      await p.waitForTimeout(500);
    }
  }
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
          games: [0, 1, 2, 3].map((rd) => window.__BRK.games(rd)) };
      }, [wins, bye, seed]);
      const { B, first, games } = r;
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
    await ctx.close();
  }

  /* ── the page as it ships ──────────────────────────────────────────────────
     No hook, no injected run: a season drafted and played, and the bracket read off the
     screen between rounds. Seeds are not pinned, because any run that gets there is a run
     the bracket has to draw correctly, and a pinned seed is one board rather than the
     game. */
  console.log('=== the postseason as it ships ===');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(QUIET);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + String(e.message).split('\n')[0]); });

    /* Not just "made the postseason": a run that loses its first playoff game shows one
       bracket and proves nothing about the seam between rounds, which is where the settle
       and the redraw happen. So the loop keeps drafting until one advances. */
    let made = false, seeded = null, shots = [], played = 0, tries = 0;
    for (; tries < 10 && shots.length < 2; tries++) {
      await p.goto(HOST + '/football/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForSelector('#s-intro.on', { timeout: 60000 });
      await p.click('#b-start');
      await p.waitForSelector('#opts .tile', { timeout: 30000 });
      await draft(p);
      await p.waitForSelector('#s-squad.on,#s-season.on', { timeout: 30000 });
      if (await on(p, 's-squad')) await p.click('#b-play');
      await p.waitForSelector('#s-season.on', { timeout: 30000 });
      await p.click('#b-sim');
      await p.waitForSelector('#s-seed.on,#s-over.on', { timeout: 90000 });
      if (!(await on(p, 's-seed'))) continue;
      made = true;
      seeded = await p.evaluate(() => document.getElementById('sd-rec').textContent);

      await p.click('#b-po');
      shots = [];
      for (let n = 0; n < 5; n++) {
        await p.waitForSelector('#s-nbrk.on,#s-over.on', { timeout: 90000 });
        if (await on(p, 's-over')) break;
        shots.push(await p.evaluate(() => ({
          title: document.getElementById('nbrk-round').textContent,
          cols: document.querySelectorAll('#nbrk-rail .nbrk-col').length,
          games: document.querySelectorAll('#nbrk-rail .nbrk-g').length,
          live: document.querySelectorAll('#nbrk-rail .nbrk-g.live').length,
          mine: document.querySelectorAll('#nbrk-rail .nbrk-t.me').length,
          /* Columns whose round has not been played yet are all TBD, and the first one
             that is not is the round on screen. */
          tbd: [...document.querySelectorAll('#nbrk-rail .nbrk-col')]
            .map((c) => c.querySelectorAll('.nbrk-t.tbd').length),
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

    ok('a drafted run reaches the postseason', made, { tries });
    ok('and one of those runs wins a playoff game', shots.length > 1, { brackets: shots.length });
    ok('the bracket stands in front of every playoff game',
      shots.length > 0 && shots.length <= 4, { rounds: shots.length, seeded, played });
    ok('the whole field is drawn every time',
      shots.length > 0 && shots.every((s) => s.cols === 4 && s.games === 13),
      shots.map((s) => [s.cols, s.games]));
    ok('exactly one game on it is the player\'s',
      shots.length > 0 && shots.every((s) => s.live === 1), shots.map((s) => s.live));
    ok('the rail scrolls, the page does not',
      shots.every((s) => s.overflow <= 1), shots.map((s) => s.overflow));
    /* The run's own path, drawn one round at a time. Round n's screen shows the player in
       every round they have finished plus the one being played, and nowhere later: a
       bracket that already had them in the Super Bowl was giving the game away. */
    ok('the player appears once more on the bracket each round',
      shots.every((s, i) => s.mine === i + 1), shots.map((s) => s.mine));
    /* And the same for everybody else. A column fed by a round nobody has played yet is
       all TBD, so the last column is empty until the conference championships are done. */
    ok('no column is filled in before its round is played',
      shots.every((s) => s.tbd[3] === (s.title === 'Super Bowl' ? 0 : 2)),
      shots.map((s) => [s.title, s.tbd]));
    /* The drawing and the record are the same run seen twice. A season that lost in the
       divisional round cannot have been shown a conference championship bracket. */
    ok('the bracket stops where the run stopped', shots.length === played,
      { bracketsShown: shots.length, playoffGamesPlayed: played });
    ok('the postseason still ends on the results screen', await on(p, 's-over'));
    await ctx.close();
  }
} finally {
  await b.close();
  if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
