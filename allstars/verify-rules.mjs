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
     inning board         the board fills the beat between halves, then goes
     weak pitch           the found weak pitch is announced, marked and logged
     batting windup       the full windup when you bat, a short one when you pitch
     cup sim              one click runs the CPU matches to yours, or to the end
     clinch, elimination  in and out are marked only once the games left make it certain
     season awards        a fixed season hands out the same hardware, archived once
     field frames         every biped carries a distinct catch and throw frame
     bullpen              fatigue counts per arm, a change is one way, the order holds
     strikeouts per arm   a K is credited to the man who threw it, not to the starter
     box score pitchers   every arm that took the mound is named on the result screen
     cpu bullpen          the CPU goes to its best rested arm, and only when it helps
     out at home draws    the play carries a plate-out marker for the draw loop
     cup identity         the seed is drawn, the card says who hosts, an upset is called one
     agency               the CPU bunts, swings for it and runs on cue; SEND and HOLD do what they say
     phone                at 390 wide the placards stand apart, the ball keeps a size

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
    PREFS.coach = false;          /* the first-timer notes are not what is under test */
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

    /* ---- the board between halves ---- */
    {
      console.log('inning board');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        g.half = 'top'; g.inning = 2; g.outs = 2;
        recordOut('ground out', false);
        /* The plaque has 30% of the beat first, then the board. */
        await new Promise(r => setTimeout(r, BEAT.betweenHalfInnings * 0.5));
        const b = document.getElementById('inning-board');
        const during = b ? { text: b.textContent, sprites: b.querySelectorAll('canvas').length } : null;
        await new Promise(r => setTimeout(r, BEAT.betweenHalfInnings * 0.7));
        return { during, after: !!document.getElementById('inning-board'), pitch: !!g.pitch };
      });
      ok(r.during && /Bottom 2/.test(r.during.text) && /You pitch/.test(r.during.text), 'the board names the coming half and your side', JSON.stringify(r));
      ok(r.during && /Due up/.test(r.during.text) && r.during.sprites === 3, 'three batters due, drawn', JSON.stringify(r));
      ok(r.during && /arm fresh/i.test(r.during.text), 'the arm is named', JSON.stringify(r));
      ok(!r.after && r.pitch, 'gone once the next at bat starts', JSON.stringify(r));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the weak pitch, told ---- */
    {
      console.log('weak pitch');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        g.half = 'top'; g.inning = 1; g.outs = 0;   /* you at home, so you pitch */
        startAtBat();
        await new Promise(r => setTimeout(r, BEAT.intoAtBat + 600));
        const labels = [...document.querySelectorAll('#pitch-select .zl')].map(z => z.textContent);
        const rep = pitcherRepertoire(currentPitcher());
        /* The weak pitch is drawn on the first throw; fix it so the check knows. */
        g.batterCtx.weakPitch = rep[0];
        const weakLabel = PITCHES[rep[0]].label;
        const before = document.getElementById('atbat').textContent;
        endAtBatCleanup();
        throwPitch(rep[1], 4);
        const plaque1 = document.getElementById('callout').textContent;
        const known1 = !!g.batterCtx.weakKnown;
        const left = g.pitch.windupUntil - performance.now();
        endAtBatCleanup();
        throwPitch(rep[0], 4);
        const plaque2 = document.getElementById('callout').textContent;
        const known2 = !!g.batterCtx.weakKnown;
        refreshHud();
        const card = document.getElementById('atbat').textContent;
        offerPitchSelection();
        const marked = [...document.querySelectorAll('#pitch-select button.weak')].map(b => b.dataset.pt);
        return { labels, weak: rep[0], weakLabel, plaque1, known1, left, plaque2, known2, before, card, marked,
                 said: g.log.some(l => /cannot handle/.test(l.text)), windup: BEAT.windup };
      });
      ok(r.labels.join(',') === 'High,In,Out,Low', 'the zone grid reads High, In, Out, Low', JSON.stringify(r.labels));
      ok(!r.known1 && !/WEAK/.test(r.plaque1), 'an ordinary pitch says nothing', JSON.stringify({ k: r.known1, p: r.plaque1 }));
      ok(r.left > 0 && r.left <= r.windup * 0.5, 'the windup is short when you pitch', `left ${Math.round(r.left)} of ${r.windup}`);
      ok(r.known2 && r.plaque2 === 'WEAK PITCH · ' + r.weakLabel && r.said, 'the weak pitch is announced and logged', JSON.stringify({ p: r.plaque2, w: r.weakLabel }));
      ok(!/weak vs/i.test(r.before) && /weak vs/i.test(r.card), 'the at bat card marks it, only after', JSON.stringify({ before: r.before, card: r.card }));
      ok(r.marked.length === 1 && r.marked[0] === r.weak, 'the button is marked', JSON.stringify(r.marked));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- batting keeps the full windup ---- */
    {
      console.log('batting windup');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(() => {
        const g = State.game; g.half = 'top'; g.inning = 1;
        throwPitch();
        return { left: g.pitch.windupUntil - performance.now(), windup: BEAT.windup };
      });
      ok(r.left > r.windup * 0.9, 'the full beat when you bat', JSON.stringify(r));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the cup plays itself up to your match, or out ---- */
    {
      console.log('cup sim');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.innings = 5; State.difficulty = 'medium'; State.mode = 'cup';
        startCup();
        const C = State.cup;
        /* You in the last quarterfinal, so three CPU matches sit ahead of yours. */
        const q = C.rounds[0];
        const youIdx = C.entrants.findIndex(e => e.you);
        const mine = q.findIndex(m => m.a === youIdx || m.b === youIdx);
        [q[mine], q[3]] = [q[3], q[mine]];
        State.screen = 'cup'; render();
        const find = () => [...document.querySelectorAll('#app .btn')].find(b => /Simulate/.test(b.textContent));
        const label1 = find().textContent;
        find().click();
        const nm = nextCupMatch(C);
        const played = q.filter(m => m.result).length;
        const offered = [...document.querySelectorAll('#app .btn')].some(b => b.textContent === 'Play Your Match');
        /* Now lose it, and one click should finish the cup. */
        const m = nm.match; const foe = m.a === youIdx ? m.b : m.a;
        m.result = { aScore: m.a === foe ? 5 : 1, bScore: m.b === foe ? 5 : 1, winner: foe };
        render();
        const label2 = find().textContent;
        find().click();
        return { label1, played, mine: nm.playerInvolved && nm.r === 0, offered, label2, done: C.done,
                 banner: document.querySelector('#app .banner').textContent };
      });
      ok(r.label1 === 'Simulate to Your Match' && r.played === 3 && r.mine && r.offered, 'one click reaches your quarterfinal', JSON.stringify(r));
      ok(r.label2 === 'Simulate the Cup' && r.done && /wins the Cup/.test(r.banner), 'out of it, one click finishes the cup', JSON.stringify(r));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- clinched and eliminated, only when certain ---- */
    {
      console.log('clinch and elimination');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.innings = 5; State.difficulty = 'medium'; State.mode = 'season';
        State.franchise = randomFranchise();
        startSeason();
        const S = State.season;
        /* Five played, five won, two to go; the league has played five rounds. */
        S.results = S.schedule.slice(0, 5).map(o => ({ opponent: o, win: true, you: 4, them: 1 }));
        S.leagueDone = 5;
        const names = OPPONENTS.map(o => o.name);
        for (const n of names) S.league[n] = { w: 2, l: 3, rd: -4 };
        /* Case A: everyone else 2-3 with at most two left: nobody can reach 5. */
        const a = clubOutlook(S);
        const meA = a['Testers'];
        const anyOutA = names.some(n => a[n].eliminated);
        /* Case B: four clubs at 5-0. Now a 2-3 club with two left cannot catch
           four of them, and nobody has clinched: five clubs can all reach 5. */
        for (const n of names.slice(0, 4)) S.league[n] = { w: 5, l: 0, rd: 12 };
        const b = clubOutlook(S);
        const meB = b['Testers'];
        const outB = names.slice(4).filter(n => b[n].eliminated).length;
        const inB = names.slice(0, 4).filter(n => b[n].clinched).length;
        /* Case C: a club that can only tie its way in is marked neither. */
        S.league[names[4]] = { w: 3, l: 2, rd: 0 };   /* two left, can reach 5 */
        const lookC = clubOutlook(S);
        const c = lookC[names[4]];
        const outC = names.filter(n => lookC[n].eliminated).length;
        /* The hub draws the marks and the line. */
        State.screen = 'season-hub'; render();
        const marks = { x: document.querySelectorAll('#app .mark.x').length, e: document.querySelectorAll('#app .mark.e').length };
        const cut = document.querySelectorAll('#app tr.cut').length;
        const banner = document.querySelector('#app .banner').textContent;
        const sched = [...document.querySelectorAll('#app table.sched tbody tr')];
        const nextRow = sched.findIndex(tr => tr.classList.contains('next'));
        return { meA, anyOutA, meB, outB, inB, c, outC, marks, cut, banner, schedRows: sched.length, nextRow,
                 leftHeader: !!document.querySelector('#app th[title="Games left to play"]') };
      });
      ok(r.meA.clinched && r.meA.left === 2 && !r.anyOutA, '5-0 with two left, everyone else 2-3: clinched, nobody out yet', JSON.stringify({ meA: r.meA, anyOutA: r.anyOutA }));
      ok(!r.meB.clinched && !r.meB.eliminated && r.inB === 0, 'five clubs at 5-0: nobody has clinched', JSON.stringify({ meB: r.meB, inB: r.inB }));
      ok(r.outB > 0, 'a 2-3 club with two left is out behind four 5-0 clubs', 'out=' + r.outB);
      ok(!r.c.clinched && !r.c.eliminated, 'a club that can only tie its way in is neither', JSON.stringify(r.c));
      ok(r.marks.x === 0 && r.marks.e === r.outC && r.cut === 1, 'the hub draws the marks and one line', JSON.stringify({ marks: r.marks, cut: r.cut, outC: r.outC }));
      ok(/level with the line|clear of the line|off the line/.test(r.banner), 'the banner says where you stand', r.banner);
      ok(r.schedRows === 7 && r.nextRow === 5 && r.leftHeader, 'the schedule lists seven games with the sixth lit', JSON.stringify({ rows: r.schedRows, next: r.nextRow }));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- awards are deterministic, and the case fills once ---- */
    {
      console.log('season awards');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.innings = 5; State.difficulty = 'medium'; State.mode = 'season';
        State.franchise = randomFranchise();
        startSeason();
        const S = State.season;
        S.results = S.schedule.map((o, i) => ({ opponent: o, win: i < 4, you: i < 4 ? 5 : 2, them: i < 4 ? 2 : 5 }));
        S.leagueDone = 7;
        const k = State.team;
        S.perPlayer = {
          [k[0]]: { hr: 1, hits: 9, ab: 20, so: 3, sb: 0, kp: 14 },
          [k[1]]: { hr: 4, hits: 7, ab: 22, so: 6, sb: 1 },
          [k[2]]: { hr: 0, hits: 5, ab: 21, so: 4, sb: 3 },
          [k[3]]: { hr: 1, hits: 2, ab: 4, so: 1, sb: 1 },    /* .500 but too few at bats */
          [k[4]]: { hr: 0, hits: 0, ab: 18, so: 9, sb: 0 },
        };
        S.playerStats.hr = 6;
        const a1 = seasonAwards(S), a2 = seasonAwards(S);
        S.playoffs = seedPlayoffs(S);
        State.screen = 'season-end'; render();
        const cards = document.querySelectorAll('#app .award').length;
        const n1 = (PROGRESS.seasons || []).length;
        render();
        const n2 = (PROGRESS.seasons || []).length;
        const last = PROGRESS.seasons[PROGRESS.seasons.length - 1];
        State.screen = 'menu'; render();
        const caseText = [...document.querySelectorAll('#app .card h3')].map(h => h.textContent);
        return { a1: a1.map(a => a.title + ':' + a.key), same: JSON.stringify(a1) === JSON.stringify(a2),
                 k, cards, n1, n2, last, caseText };
      });
      const want = ['Most Valuable:' + r.k[1], 'Home Run King:' + r.k[1], 'Best Bat:' + r.k[0], 'Speed Demon:' + r.k[2], 'Golden Arm:' + r.k[0]];
      ok(JSON.stringify(r.a1) === JSON.stringify(want), 'five awards to the right players', JSON.stringify(r.a1) + ' wanted ' + JSON.stringify(want));
      ok(r.same, 'the same season hands out the same awards twice');
      ok(r.cards === 5, 'the end screen draws five plaques', 'cards=' + r.cards);
      ok(r.n1 === 1 && r.n2 === 1, 'the season is archived once, not per render', JSON.stringify({ n1: r.n1, n2: r.n2 }));
      ok(r.last && r.last.w === 4 && r.last.l === 3 && r.last.awards.length === 5, 'the archive carries the record and the awards', JSON.stringify(r.last));
      ok(r.caseText.includes('Trophy case'), 'the menu opens the trophy case', JSON.stringify(r.caseText));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- catch, throw and slide sprites ---- */
    {
      console.log('field frames');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        /* Every biped carries a distinct catch frame. Quadrupeds have no
           arms to raise, so they are excluded. */
        const bipeds = ['kong','franky','popeye','peter','tom','huck','sherlock','lupin','alice','dorothy','robin','sammy','wonderland'].filter(k => V2_SPRITES[k]);
        const stagnant = bipeds.filter(k =>
          JSON.stringify(V2_SPRITES[k].f.catch) === JSON.stringify(V2_SPRITES[k].f.idle)
          || JSON.stringify(V2_SPRITES[k].f.throw) === JSON.stringify(V2_SPRITES[k].f.idle));
        const missing = Object.keys(V2_SPRITES).filter(k => !V2_SPRITES[k].f.catch || !V2_SPRITES[k].f.throw);
        return { missing, stagnant };
      });
      ok(r.missing.length === 0, 'every character carries catch and throw frames', r.missing.join(','));
      ok(r.stagnant.length === 0, 'the catch and throw frames differ from idle on every biped', r.stagnant.join(','));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- runner thrown out at the plate is drawn ---- */
    {
      console.log('out at home draws');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        endAtBatCleanup(); g.pitch = null;
        g.bases = [null, Object.assign({}, g.home.batters[3], { n: 'The Runner', spd: 90 }), null];
        g.sendRule = 'send';
        const realRandom = Math.random;
        Math.random = () => 0.9;
        g.play = { kind: 'single', preBases: g.bases.slice(), runnerPaths: [null, [1, 2, 3], null], applied: false };
        applyHitMutation('single', currentBatter());
        Math.random = realRandom;
        return { plateOut: !!(g.play && g.play.plateOut),
                 runner: g.play && g.play.plateOut && g.play.plateOut.runner.n,
                 outs: g.outs };
      });
      ok(r.plateOut, 'the play carries a plate-out marker for the draw loop', JSON.stringify(r));
      ok(r.runner === 'The Runner', 'and names the runner', r.runner);
      ok(r.outs === 1, 'and the out is recorded', 'outs=' + r.outs);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the bullpen ---- */
    {
      console.log('bullpen');
      const { pg, errors } = await fresh(browser);
      await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.opponent = randomOpponent(null); State.innings = 9; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: true });
      });
      await wait(pg, 700);
      const r = await pg.evaluate(() => {
        const g = State.game;
        endAtBatCleanup(); g.pitch = null;
        g.half = 'top';                    /* you are home, so you field */
        const t = currentFieldingTeam();
        /* A starter's curve must be exactly what it was before the pen
           existed: flat through the third, then one level an inning. */
        const starter = [];
        for (let i = 1; i <= 9; i++) { g.inning = i; starter.push(pitcherFatigue(t).level); }
        g.inning = 6;
        const orderBefore = t.batters.map(b => b.k);
        const penBefore = bullpenFor(t).map(x => x.i);
        const cons = bullpenFor(t).map(x => x.b.con);
        const changed = goToPen(t, 4);
        const reliever = [];
        for (let i = 6; i <= 9; i++) { g.inning = i; reliever.push(pitcherFatigue(t).level); }
        const backAgain = goToPen(t, 0);   /* a spent arm cannot return */
        const orderAfter = t.batters.map(b => b.k);
        /* The offer is gated: fielding, between pitches, arm going. The
           man out there came in in the SIXTH, so he is still fresh in the
           eighth and only starts to go in the tenth. */
        g.inning = 2; g.play = null; refreshStealButton();
        const btn = document.getElementById('pen-btn');
        const shownFresh = btn.style.display !== 'none';
        g.inning = 10; refreshStealButton();
        const shownTired = btn.style.display !== 'none';
        g.half = 'bottom'; refreshStealButton();
        const shownBatting = btn.style.display !== 'none';
        return { starter, changed, reliever, backAgain, penBefore, cons,
                 idx: t.pitcherIdx, from: t.pitcherFrom,
                 orderSame: JSON.stringify(orderBefore) === JSON.stringify(orderAfter),
                 shownFresh, shownTired, shownBatting };
      });
      ok(JSON.stringify(r.starter) === JSON.stringify([0,0,0,1,2,3,4,5,6]),
         'a starter tires exactly as he did before the pen existed', JSON.stringify(r.starter));
      ok(r.changed && r.idx === 4 && r.from === 6, 'a change takes and records the inning', JSON.stringify(r));
      ok(JSON.stringify(r.reliever) === JSON.stringify([0,0,0,1]),
         'a reliever brought in the sixth is fresh until the ninth', JSON.stringify(r.reliever));
      ok(r.backAgain === false, 'a spent arm cannot come back');
      ok(r.orderSame, 'the batting order is untouched by a change');
      ok(r.penBefore.length === 8 && !r.penBefore.includes(0), 'eight arms on the bench, not the man pitching', JSON.stringify(r.penBefore));
      ok(JSON.stringify(r.cons) === JSON.stringify([...r.cons].sort((a, b) => b - a)), 'the pen ranks by CON', JSON.stringify(r.cons));
      ok(!r.shownFresh && r.shownTired && !r.shownBatting, 'offered only while fielding a tiring arm', JSON.stringify({ fresh: r.shownFresh, tired: r.shownTired, batting: r.shownBatting }));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- strikeouts are credited to the arm that threw them ---- */
    {
      console.log('strikeouts per arm');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(async () => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.innings = 9; State.difficulty = 'medium'; State.mode = 'season';
        State.franchise = randomFranchise();
        startSeason();
        const S = State.season;
        State.opponent = opponentByName(S.schedule[0]);
        startGame({ mode: 'season', youHome: true });
        await new Promise(r => setTimeout(r, 600));
        const g = State.game;
        endAtBatCleanup(); g.pitch = null;
        g.half = 'top';                     /* you are home, so you pitch */
        const you = g.home;
        const starter = you.batters[0], relief = you.batters[6];
        /* Three strikeouts from the starter. */
        g.inning = 2;
        for (let i = 0; i < 3; i++) { g.outs = 0; recordOut('swinging strikeout', true); }
        /* Then a change, and four from the reliever. */
        g.inning = 6;
        goToPen(you, 6);
        for (let i = 0; i < 4; i++) { g.outs = 0; recordOut('swinging strikeout', true); }
        const kBy = Object.assign({}, g.kBy);
        g.inning = 9; g.half = 'bottom'; g.home.score = 9; g.away.score = 1;
        finishGame();
        await new Promise(r => setTimeout(r, 400));
        const per = State.season.perPlayer || {};
        return { kBy, starter: starter.k, relief: relief.k,
                 starterKp: (per[starter.k] || {}).kp | 0, reliefKp: (per[relief.k] || {}).kp | 0,
                 total: g.yourK };
      });
      ok(r.kBy[r.starter] === 3 && r.kBy[r.relief] === 4, 'the game splits strikeouts between the two arms', JSON.stringify(r.kBy));
      ok(r.total === 7, 'and the running count is still the game total', 'yourK=' + r.total);
      ok(r.starterKp === 3 && r.reliefKp === 4, 'the season credits each arm its own, not all to the starter',
         JSON.stringify({ starter: r.starterKp, relief: r.reliefKp }));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the box score names everyone who pitched ---- */
    {
      console.log('box score pitchers');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(async () => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.opponent = randomOpponent(null); State.innings = 9; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: true });
        await new Promise(r => setTimeout(r, 600));
        const g = State.game;
        endAtBatCleanup(); g.pitch = null;
        g.inning = 9; g.half = 'bottom'; g.home.score = 5; g.away.score = 2;
        for (const b of g.home.batters.concat(g.away.batters)) { g.stats.ab[b.k] = 4; g.stats.hits[b.k] = 1; }
        /* Your side went to the pen once; the CPU rode one arm. */
        g.home.used = [0, 4]; g.home.pitcherIdx = 4;
        g.away.used = [0];
        finishGame();
        await new Promise(r => setTimeout(r, 400));
        const lines = [...document.querySelectorAll('#app .card p')].map(p => p.textContent).filter(t => /pitch/.test(t));
        return { lines, starter: g.home.batters[0].n, relief: g.home.batters[4].n, theirs: g.away.batters[0].n };
      });
      const two = r.lines.find(l => /between them/.test(l)) || '';
      const one = r.lines.find(l => !/between them/.test(l)) || '';
      ok(r.lines.length === 2, 'a pitching line per side', JSON.stringify(r.lines));
      ok(two.includes(r.starter) && two.includes(r.relief) && /pitched:/.test(two),
         'the side that used two arms names both and shares the line', two);
      ok(one.includes(r.theirs) && /pitching:/.test(one) && !/ and /.test(one),
         'the side that used one arm names one', one);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the CPU manages its own staff ---- */
    {
      console.log('cpu bullpen');
      const { pg, errors } = await fresh(browser);
      await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.opponent = randomOpponent(null); State.innings = 9; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: true });
      });
      await wait(pg, 700);
      const r = await pg.evaluate(() => {
        const g = State.game;
        const cpu = g.away;
        cpu.batters[0] = Object.assign({}, cpu.batters[0], { con: 40, n: 'Tired Sam' });
        cpu.batters[5] = Object.assign({}, cpu.batters[5], { con: 90, n: 'The Closer' });
        g.inning = 2; cpuPenCheck(cpu);
        const early = cpu.pitcherIdx;
        g.inning = 5; cpuPenCheck(cpu);
        const late = cpu.pitcherIdx, lateName = cpu.batters[cpu.pitcherIdx].n;
        /* Nobody better on the bench: it stays put. */
        const mine = g.home;
        mine.batters = mine.batters.map((b, i) => Object.assign({}, b, { con: i === 0 ? 95 : 50 }));
        g.inning = 8; cpuPenCheck(mine);
        return { early, late, lateName, stayed: mine.pitcherIdx };
      });
      ok(r.early === 0, 'the CPU leaves a fresh arm alone', 'idx=' + r.early);
      ok(r.late === 5 && r.lateName === 'The Closer', 'and goes to its best rested arm once its man tires', JSON.stringify(r));
      ok(r.stayed === 0, 'and stays put when nobody on the bench is better', 'idx=' + r.stayed);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the cup: a drawn seed, a host, an upset ---- */
    {
      console.log('cup identity');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.innings = 5; State.difficulty = 'medium'; State.mode = 'cup';
        /* Forty draws: the seed must move. */
        const seeds = new Set();
        for (let i = 0; i < 40; i++) { startCup(); seeds.add(State.cup.entrants.findIndex(e => e.you)); }
        /* Now a fixed draw: you as the 6th seed, so you travel in the first round. */
        startCup();
        const C = State.cup;
        const youAt = C.entrants.findIndex(e => e.you);
        const you = C.entrants.splice(youAt, 1)[0];
        C.entrants.splice(5, 0, you);
        State.screen = 'cup'; render();
        const banner = document.querySelector('#app .banner').textContent;
        const card = [...document.querySelectorAll('#app .card')].map(c => c.textContent).find(t => /seed against/.test(t)) || '';
        /* Let the 8th seed beat the 1st: an upset on the bracket. */
        const m = C.rounds[0][0];
        m.result = { aScore: 1, bScore: 4, winner: m.b };
        render();
        const upsets = document.querySelectorAll('#app .cupbracket .mark.u').length;
        const upsetRow = document.querySelector('#app .cupbracket .mark.u').closest('.row').textContent;
        /* And the opposite is not one. */
        const m2 = C.rounds[0][1];
        m2.result = { aScore: 4, bScore: 1, winner: m2.a };
        render();
        const upsets2 = document.querySelectorAll('#app .cupbracket .mark.u').length;
        return { seeds: [...seeds].sort(), banner, card, upsets, upsetRow, upsets2, foeSeed: 8 - 5 };
      });
      ok(r.seeds.length >= 4, 'the seed is drawn, not always first', 'seeds seen: ' + r.seeds.join(','));
      ok(/6th seed of 8/.test(r.banner) && /higher seed hosts/.test(r.banner), 'the banner names your seed and who hosts', r.banner);
      ok(/6th seed against the 3rd/.test(r.card) && /You travel to/.test(r.card), 'the match card says you travel as the lower seed', r.card);
      ok(r.upsets === 1 && /8\./.test(r.upsetRow), 'the 8th seed over the 1st is called an upset', JSON.stringify({ upsets: r.upsets, row: r.upsetRow }));
      ok(r.upsets2 === 1, 'the favourite winning is not one', 'upsets=' + r.upsets2);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the CPU has a plan, and you send or hold ---- */
    {
      console.log('agency');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(async () => {
        const g = State.game;
        const fast = { k: 'x', n: 'Fast Light', spd: 90, pow: 50, con: 60 };
        const slug = { k: 'y', n: 'Slugger', spd: 30, pow: 92, con: 50 };
        const wet = { con: 55 }, ace = { con: 85 };
        /* The plan, pinned by the roll. */
        g.bases = [fast, null, null]; g.outs = 0; g.strikes = 0;
        const bunt = cpuBatPlan(g, fast, 0.1);
        const noBunt2 = (g.outs = 2, cpuBatPlan(g, fast, 0.1));
        g.outs = 0; g.strikes = 2;
        const noBuntK = cpuBatPlan(g, fast, 0.1);
        g.bases = [null, null, null]; g.outs = 2; g.strikes = 0;
        const power = cpuBatPlan(g, slug, 0.1);
        const noPowerOn = (g.bases = [fast, null, null], cpuBatPlan(g, slug, 0.1));
        const highRoll = (g.bases = [null, null, null], cpuBatPlan(g, slug, 0.9));
        /* The steal. */
        g.bases = [fast, null, null];
        const goes = cpuStealWants(g, fast, wet, 0.1);
        const stays = cpuStealWants(g, fast, ace, 0.1);
        const slow = cpuStealWants(g, slug, wet, 0.1);
        const blocked = (g.bases = [fast, slug, null], cpuStealWants(g, fast, wet, 0.1));
        /* Send or hold, on a single with a runner on second. You bat: bottom. */
        g.half = 'bottom'; g.outs = 0; g.home.score = 0;
        const batter = g.home.batters[0];
        const runner = Object.assign({}, g.home.batters[1], { spd: 95 });
        const realRandom = Math.random;
        const run = (rule, roll) => {
          g.bases = [null, runner, null]; g.outs = 0; g.home.score = 0; g.sendRule = rule;
          Math.random = () => roll;
          applyHitMutation('single', batter);
          Math.random = realRandom;
          return { third: g.bases[2] === runner, score: g.home.score, outs: g.outs };
        };
        const hold = run('hold', 0.0);
        const sendIn = run('send', 0.0);
        const sendOut = run('send', 0.999);
        const slowSend = (() => { runner.spd = 30; const x = run('send', 0.0); runner.spd = 95; return x; })();
        /* The button shows while you bat with a runner on, and cycles. */
        g.bases = [null, runner, null]; g.sendRule = 'auto'; g.play = null;
        refreshStealButton();
        const btn = document.getElementById('send-btn');
        const shown = btn && btn.style.display !== 'none';
        btn.click(); const label1 = btn.textContent; btn.click(); const label2 = btn.textContent;
        g.bases = [null, null, null]; refreshStealButton();
        const hidden = btn.style.display === 'none';
        return { bunt, noBunt2, noBuntK, power, noPowerOn, highRoll, goes, stays, slow, blocked,
                 hold, sendIn, sendOut, slowSend, shown, label1, label2, hidden };
      });
      ok(r.bunt === 'bunt' && r.noBunt2 === 'normal' && r.noBuntK === 'normal', 'a fast light bat bunts with a man on, not with two out or two strikes', JSON.stringify({ bunt: r.bunt, two: r.noBunt2, k: r.noBuntK }));
      ok(r.power === 'power' && r.noPowerOn === 'normal' && r.highRoll === 'normal', 'a slugger swings for it with two out and nobody on', JSON.stringify({ power: r.power, on: r.noPowerOn, roll: r.highRoll }));
      ok(r.goes && !r.stays && !r.slow && !r.blocked, 'a fast runner goes on a weak arm, not on an ace, not slow, not into a runner', JSON.stringify({ goes: r.goes, stays: r.stays, slow: r.slow, blocked: r.blocked }));
      ok(r.hold.third && r.hold.score === 0 && r.hold.outs === 0, 'HOLD stops the runner at third', JSON.stringify(r.hold));
      ok(r.sendIn.score === 1 && !r.sendIn.third, 'SEND scores him on a good roll', JSON.stringify(r.sendIn));
      ok(r.sendOut.outs === 1 && r.sendOut.score === 0 && !r.sendOut.third, 'SEND gets him thrown out on a bad one', JSON.stringify(r.sendOut));
      ok(r.slowSend.score === 1, 'a slow runner can still be sent', JSON.stringify(r.slowSend));
      ok(r.shown && /SEND/.test(r.label1) && /HOLD/.test(r.label2) && r.hidden, 'the button shows with a runner on, cycles, and hides', JSON.stringify({ shown: r.shown, l1: r.label1, l2: r.label2, hidden: r.hidden }));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the phone: placards apart, the ball a size, the ring pointed at ---- */
    {
      console.log('phone');
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(URL);
      await pg.evaluate(() => localStorage.clear());
      await pg.goto(URL);
      await pg.evaluate(() => {
        Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false; window.confirm = () => true;
        State.gameSpeed = 'fast'; applyGameSpeed();
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.opponent = randomOpponent(null); State.innings = 5; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: true });
      });
      await wait(pg, 900);
      const r = await pg.evaluate(async () => {
        const boxes = [...document.querySelectorAll('.arena .corner')]
          .filter(c => getComputedStyle(c).display !== 'none')
          .map(c => { const b = c.getBoundingClientRect(); return { cls: c.className, x: b.x, y: b.y, r: b.right, b: b.bottom }; });
        let overlap = null;
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b) overlap = [a.cls, c.cls];
        }
        const strip = document.querySelector('.park-strip');
        const field = document.getElementById('field').getBoundingClientRect();
        /* A fly ball with you in the field: the ring and its line. */
        endAtBatCleanup(); State.game.pitch = null;
        scheduleFlyCatchMinigame('fly out', currentBatter());
        await new Promise(r => setTimeout(r, 1400));
        const p = State.game.play;
        return { n: boxes.length, overlap, strip: strip && getComputedStyle(strip).display, stripText: strip && strip.textContent,
                 park: currentTheme().park, view: FIELD_VIEW, ballCss: ballRadiusMin() * FIELD_VIEW,
                 fieldW: field.width, noWide: document.documentElement.scrollWidth <= innerWidth,
                 ring: !!(p && p.catchActive), chaseAt: !!(p && p.chaseAt) };
      });
      ok(r.n === 2 && !r.overlap, 'two placards on the field and they do not touch', JSON.stringify({ n: r.n, overlap: r.overlap }));
      ok(r.strip === 'block' && r.stripText === r.park, 'the park name is a strip above the board', JSON.stringify({ strip: r.strip, text: r.stripText, park: r.park }));
      ok(r.view < 0.5 && Math.abs(r.ballCss - 4) < 0.01, 'the ball is four CSS pixels on a phone', JSON.stringify({ view: r.view, ballCss: r.ballCss }));
      ok(r.noWide, 'the page does not scroll sideways');
      ok(r.ring && r.chaseAt, 'the catch ring has a fielder to point from', JSON.stringify({ ring: r.ring, chaseAt: r.chaseAt }));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await ctx.close();
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
