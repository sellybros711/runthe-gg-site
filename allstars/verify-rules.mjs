#!/usr/bin/env node
/* Run The All-Stars: the rules, replayed.

   The game is one file that touches the DOM everywhere, so unlike hoops there
   is no engine to import. Instead a headless Chromium loads the page and each
   check puts the game into a situation by hand, fires the one event that
   should decide it, and reads what the game did. Every scenario here is one
   the audit found the game getting wrong, or one a fix to it could break:

     walk-off walk        a forced-in winning run ends the game
     walk-off hit         a hit that scores the winning run ends the game
     mercy rule           a fifteen run lead from the second last inning ends it, and says so
     extra innings        a tie plays on and the board grows a column
     one standings order  the hub, the seeding and a second call all agree
     head to head         beating a club ranks you above it on equal wins
     abandoned game       End Game in a season files a loss and moves the league
     finish once          finishGame twice records one result

   Needs Playwright with Chromium. Locally:
     node allstars/verify-rules.mjs
   The sandbox's copy lives at /opt/node22/lib/node_modules/playwright; CI
   installs its own. No network, no deploy. */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + path.join(here, 'index.html');

let failures = 0;
const ok = (cond, what, detail) => {
  if (cond) { console.log('  ok   ' + what); return; }
  failures++;
  console.log('  FAIL ' + what + (detail ? '\n       ' + detail : ''));
};

/* A page with a clean profile, sound off, confirms accepted, no cutscenes. */
async function fresh(browser) {
  const pg = await browser.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.clear());
  await pg.goto(URL);
  await pg.evaluate(() => {
    Sound.muted = true;
    PREFS.cutscenes = false;
    window.confirm = () => true;
    State.gameSpeed = 'fast'; applyGameSpeed();
  });
  return { pg, errors };
}

/* An exhibition game, you at home, first at bat cleared so the scenario can
   set the situation without a live pitch underneath it. */
async function exhibition(pg, youHome = true) {
  await pg.evaluate((youHome) => {
    State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
    State.opponent = randomOpponent(null); State.innings = 5; State.mode = 'exhibition';
    startGame({ mode: 'exhibition', youHome });
  }, youHome);
  await pg.waitForTimeout(700);
  await pg.evaluate(() => { endAtBatCleanup(); State.game.pitch = null; });
}

const wait = (pg, ms) => pg.waitForTimeout(ms);

async function main() {
  const browser = await chromium.launch();
  try {
    /* ---- walk-off walk ---- */
    {
      console.log('walk-off walk');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        g.half = 'bottom'; g.inning = 5; g.outs = 2; g.away.score = 3; g.home.score = 3;
        const b = g.home.batters; g.bases = [b[1], b[2], b[3]]; g.home.idx = 4;
        recordWalk();
        await new Promise(r => setTimeout(r, 2600));
        return { over: g.over, winner: g.winner, screen: State.screen, home: g.home.score, away: g.away.score };
      });
      ok(r.home === 4 && r.away === 3, 'the run scored', JSON.stringify(r));
      ok(r.over === true && r.winner === 'home', 'the game is over, home wins', JSON.stringify(r));
      ok(r.screen === 'result', 'the result screen is up', 'screen=' + r.screen);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- walk-off hit ---- */
    {
      console.log('walk-off hit');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        g.half = 'bottom'; g.inning = 5; g.outs = 1; g.away.score = 2; g.home.score = 2;
        const b = g.home.batters; g.bases = [null, null, b[1]]; g.home.idx = 4;
        scheduleContactPlay('single', currentBatter());
        await new Promise(r => setTimeout(r, 4200));
        return { over: g.over, winner: g.winner, screen: State.screen, home: g.home.score, walkoff: g.walkoff };
      });
      ok(r.home === 3 && r.walkoff === true, 'the winning run scored on the hit', JSON.stringify(r));
      ok(r.over === true && r.winner === 'home' && r.screen === 'result', 'game over, result screen', JSON.stringify(r));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- mercy rule ---- */
    {
      console.log('mercy rule');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        g.half = 'top'; g.inning = 4; g.outs = 2; g.away.score = 15; g.home.score = 0;
        const logBefore = g.log.length;
        recordOut('fly out', false);
        const plaque = document.getElementById('callout');
        const text = plaque ? plaque.textContent : '';
        await new Promise(r => setTimeout(r, 2400));
        return { over: g.over, mercy: g.mercy, winner: g.winner, screen: State.screen, text,
                 said: g.log.slice(logBefore).some(l => /mercy/i.test(l.text)),
                 note: [...document.querySelectorAll('#app .card p')].map(p => p.textContent).join(' ') };
      });
      ok(r.over && r.mercy === true && r.winner === 'away', 'a 15 run lead in the 4th of 5 ends it', JSON.stringify(r));
      ok(r.text === 'MERCY RULE', 'the plaque says MERCY RULE', 'plaque=' + r.text);
      ok(r.said, 'the log says mercy rule');
      ok(r.screen === 'result' && /mercy/i.test(r.note), 'the result screen names the rule', r.note);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- extra innings ---- */
    {
      console.log('extra innings');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        g.half = 'bottom'; g.inning = 5; g.outs = 2; g.away.score = 2; g.home.score = 2;
        g.lineScore.away = [1, 0, 1, 0, 0]; g.lineScore.home = [0, 2, 0, 0, 0];
        recordOut('ground out', false);
        await new Promise(r => setTimeout(r, 1500));
        const ths = document.querySelectorAll('#linescore thead th').length;
        const plaque = document.getElementById('callout');
        return { over: g.over, inning: g.inning, half: g.half, screen: State.screen,
                 columns: ths - 2, plaque: plaque ? plaque.textContent : '' };
      });
      ok(!r.over && r.inning === 6 && r.half === 'top' && r.screen === 'game', 'a tie plays on into the 6th', JSON.stringify(r));
      ok(r.columns === 6, 'the board grew a sixth column', 'columns=' + r.columns);
      ok(r.plaque === 'EXTRA INNINGS', 'the plaque says EXTRA INNINGS', 'plaque=' + r.plaque);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- one standings order, head to head ---- */
    {
      console.log('standings order');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.innings = 5; State.difficulty = 'medium'; State.mode = 'season';
        State.franchise = randomFranchise();
        startSeason();
        const S = State.season;
        /* Seven games, four wins by three, three losses by three: 4-3, +3. */
        const foeX = S.schedule[0];
        S.results = S.schedule.map((o, i) => ({ opponent: o, win: i < 4, you: i < 4 ? 5 : 2, them: i < 4 ? 2 : 5 }));
        /* Clubs we never played, so head to head cannot touch them. */
        const others = OPPONENTS.map(o => o.name).filter(n => !S.schedule.includes(n));
        const reset = () => { for (const n of Object.keys(S.league)) S.league[n] = { w: 2, l: 5, rd: -6 }; };
        /* A: a five way tie at 4-3. Head to head does not apply; run
           differential does, so the club we beat still ranks above us. */
        reset();
        S.league[foeX] = { w: 4, l: 3, rd: 10 };
        S.league[others[0]] = { w: 4, l: 3, rd: 10 };
        S.league[others[1]] = { w: 6, l: 1, rd: 20 };
        S.league[others[2]] = { w: 5, l: 2, rd: 12 };
        S.league[others[3]] = { w: 4, l: 3, rd: 0 };
        S.league[others[4]] = { w: 4, l: 3, rd: 0 };
        const a = standingsOrder(S).map(r => r.name);
        const b = standingsOrder(S).map(r => r.name);
        const seeds = seedPlayoffs(S).seeds.map(r => r.name);
        State.screen = 'season-hub'; render();
        const hub = [...document.querySelectorAll('#app table.table tbody tr td:first-child')]
          .slice(0, 18).map(td => td.textContent.replace(/^\d+\.\s*/, ''));
        /* B: a TWO way tie at 4-3 with the club we beat, who out-scored us. */
        reset();
        S.league[foeX] = { w: 4, l: 3, rd: 10 };
        S.league[others[1]] = { w: 6, l: 1, rd: 20 };
        S.league[others[2]] = { w: 5, l: 2, rd: 12 };
        const two = standingsOrder(S).map(r => r.name);
        return { a, b, seeds, hub, two, me: 'Testers', foeX, y: others[0] };
      });
      ok(JSON.stringify(r.a) === JSON.stringify(r.b), 'two calls give the same order (stored coin)');
      ok(JSON.stringify(r.seeds) === JSON.stringify(r.a.slice(0, 4)), 'the bracket is the top four of the same order',
         'seeds=' + r.seeds.join(',') + ' top4=' + r.a.slice(0, 4).join(','));
      ok(JSON.stringify(r.hub.slice(0, 4)) === JSON.stringify(r.a.slice(0, 4)), 'the hub table shows the same top four',
         'hub=' + r.hub.slice(0, 4).join(','));
      const iMe = r.a.indexOf(r.me), iX = r.a.indexOf(r.foeX), iY = r.a.indexOf(r.y);
      ok(iY < iMe && iX < iMe, 'five way tie: run differential ranks ' + r.y + ' and ' + r.foeX + ' above us', 'me=' + iMe + ' x=' + iX + ' y=' + iY);
      ok(r.two.indexOf(r.me) < r.two.indexOf(r.foeX), 'two way tie: we beat ' + r.foeX + ' so we rank above them', r.two.slice(0, 5).join(','));
      ok(r.two.indexOf(r.me) === 2, 'and that puts us third, in the bracket', r.two.slice(0, 5).join(','));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- abandoned season game, and finishGame runs once ---- */
    {
      console.log('abandoned game');
      const { pg, errors } = await fresh(browser);
      await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.innings = 5; State.difficulty = 'medium'; State.mode = 'season';
        State.franchise = randomFranchise();
        startSeason();
      });
      /* Hub. Play the next game. */
      for (const b of await pg.$$('#app button')) {
        if (/Play Next Game/i.test(await b.textContent())) { await b.click(); break; }
      }
      await wait(pg, 900);
      const before = await pg.evaluate(() => ({ screen: State.screen, live: State.game && State.game.live }));
      ok(before.screen === 'game' && before.live, 'a season game is live', JSON.stringify(before));
      await pg.evaluate(() => { const g = State.game; g.inning = 3; g.away.score = 1; g.home.score = 4; });
      for (const b of await pg.$$('#app button')) {
        if (/End Game/i.test(await b.textContent())) { await b.click(); break; }
      }
      await wait(pg, 400);
      const r = await pg.evaluate(() => {
        const S = State.season;
        const h2 = document.querySelector('#app h2');
        const res = S.results[0] || null;
        /* A second finishGame must not file a second result. */
        finishGame();
        return { screen: State.screen, heading: h2 ? h2.textContent : '', res, n: S.results.length,
                 leagueDone: S.leagueDone, played: Object.values(S.league).reduce((a, t) => a + t.w + t.l, 0) };
      });
      ok(r.screen === 'result' && /abandoned/i.test(r.heading), 'lands on the result screen, headed Game abandoned', JSON.stringify({ screen: r.screen, heading: r.heading }));
      ok(r.res && r.res.win === false && r.res.forfeit === true, 'filed as a forfeit loss', JSON.stringify(r.res));
      ok(r.leagueDone === 1 && r.played === 17, 'the league played its round (17 clubs got a decision)', 'done=' + r.leagueDone + ' played=' + r.played);
      ok(r.n === 1, 'finishGame twice records one result', 'results=' + r.n);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }
  } finally {
    await browser.close();
  }
  if (failures) {
    console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
    process.exit(1);
  }
  console.log('\nAll rules hold.');
}

main().catch(e => { console.error(e); process.exit(1); });
