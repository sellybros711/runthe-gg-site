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
     franchise years      a club runs year on year, carrying its record book
     long unlocks         no good afternoon reaches the top of the ladder, and a career reaches all of it
     the ladder           every rung has a metric and a goal, and the tail is a long one
     harder is better     the better the character, the harder the rung, and the arms are earned by pitching
     locked last          a card you cannot draft sorts behind every card you can
     the hover card       says the requirement and how far along, and goes away after
     the squad photo      the room is the home page, and everyone stands in one frame
     the room fills up    the dugout takes the window and still fits above the fold
     fewer words          settings is headings and choices, and a rule sits behind a dot
     nothing cropped      the close shot still shows both foul lines, every fielder and the stands
     the play moves       the plan's physics agree with the scorer: outs beaten, hits not
     the dive             a liner draws a lunge that lands short and breaks no duty
     the snow             the cold parks play under falling snow
     the plate camera     the at bat is seen from behind the catcher and cut away from on contact
     the bat has a place  a pitch lands somewhere; the swing has to be there as well as on time
     the arm has a spot   aim plus a release is where a pitch goes; a strike is where it landed
     the frames           the swing is three drawings and the delivery has a leg kick
     the mound            anyone can pitch, a change is a swap, and rest pays it back
     every character      all 55 carry an arm, and the big bats are the worst of them
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
        /* the plaque shows at half the beat and the next batter takes it
           back at the full beat: read in between, whatever the speed */
        await new Promise(r => setTimeout(r, Math.round(BEAT.betweenHalfInnings * 0.8)));
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
        const strip = { grid: !!document.querySelector('#pitch-select .zone-grid'),
                        throwBtn: !!document.getElementById('throw-btn'),
                        aiming: !!g.aiming };
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
        return { strip, weak: rep[0], weakLabel, plaque1, known1, left, plaque2, known2, before, card, marked,
                 said: g.log.some(l => /cannot handle/.test(l.text)), windup: BEAT.windup };
      });
      ok(!r.strip.grid && r.strip.throwBtn && r.strip.aiming, 'the strip is pitch and Throw; the spot is aimed on the field', JSON.stringify(r.strip));
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

    /* ---- a franchise runs year after year ---- */
    {
      console.log('franchise years');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Dynasty';
        State.innings = 5; State.difficulty = 'medium'; State.mode = 'season';
        State.franchise = randomFranchise();
        startSeason();
        const y1 = State.season, club = y1.franchise.nickname;
        y1.results = y1.schedule.map((o, i) => ({ opponent: o, win: i < 5, you: i < 5 ? 6 : 2, them: i < 5 ? 2 : 6 }));
        y1.leagueDone = 7; y1.playoffs = seedPlayoffs(y1);
        const out = { y1Year: y1.year, y1Book: y1.history.length };
        startSeason(y1);                       /* the way Play Year N does it */
        const y2 = State.season;
        out.y2Year = y2.year; out.y2Book = y2.history.length;
        out.sameClub = y2.franchise.nickname === club && y2.teamName === 'Dynasty';
        out.freshSched = y2.results.length === 0 && y2.schedule.length === 7;
        out.book1 = y2.history[0];
        y2.results = y2.schedule.map(o => ({ opponent: o, win: true, you: 4, them: 3 }));
        y2.leagueDone = 7;
        startSeason(y2);
        out.y3Year = State.season.year; out.y3Book = State.season.history.length;
        out.reached = PROGRESS.franchiseYears;
        out.signs = dugoutThings().map(t => t.sign);
        return out;
      });
      ok(JSON.stringify(r.signs) === JSON.stringify(['EXHIBITION','FRANCHISE','PLAYOFFS','HOW TO PLAY']),
         'the room says EXHIBITION, FRANCHISE and PLAYOFFS', JSON.stringify(r.signs));
      ok(r.y1Year === 1 && r.y1Book === 0, 'year one starts with an empty book', JSON.stringify(r));
      ok(r.y2Year === 2 && r.y2Book === 1 && r.sameClub, 'year two is the same club with year one on the books', JSON.stringify(r));
      ok(r.freshSched, 'and a fresh seven game schedule');
      ok(r.book1 && r.book1.w === 5 && r.book1.l === 2, 'the book keeps the record it actually was', JSON.stringify(r.book1));
      ok(r.y3Year === 3 && r.y3Book === 2, 'and it keeps going year on year', JSON.stringify(r));
      ok(r.reached >= 3, 'the furthest year reached is kept for the long unlocks', 'reached=' + r.reached);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the tail is a tail: the top rungs cannot fall out early ---- */
    {
      console.log('long unlocks');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const top = Object.entries(UNLOCKS)
          .sort((a, b) => b[1].rank - a[1].rank).slice(0, 5).map(x => x[0]);
        const before = top.map(k => isUnlocked(k));
        /* A very good first evening: a nine inning win, a blowout, a
           comeback, a playoff win, a big strikeout game, a title. None of
           it may touch the top of the ladder. */
        Object.assign(PROGRESS, {
          nineInningGames: 3, blowouts: 3, comebacks: 5, playoffWins: 3,
          gameK: 20, seasonHR: 12, shutouts: 1, wins: 9, games: 12, titles: 1,
        });
        const early = refreshUnlocks();
        /* Then a career. */
        Object.assign(PROGRESS, {
          careerSB: 900, careerHR: 400, careerK: 2000, shutouts: 40,
          wins: 400, games: 700, titles: 9, franchiseYears: 20,
        });
        const late = refreshUnlocks();
        return { top, before, early, late, after: top.map(k => isUnlocked(k)),
                 stillDark: Object.keys(UNLOCKS).filter(k => !isUnlocked(k)) };
      });
      ok(r.before.every(x => !x), 'the five hardest start locked', JSON.stringify(r.before));
      ok(r.top.every(k => !r.early.includes(k)),
         'a very good first evening earns none of them', JSON.stringify(r.early));
      ok(r.early.length > 0, 'though it does earn something', JSON.stringify(r.early));
      ok(r.top.every(k => r.late.includes(k)),
         'and a career earns all five', JSON.stringify(r.late));
      ok(r.stillDark.length === 0, 'with nothing left unreachable', JSON.stringify(r.stillDark));
      ok(r.after.every(x => x), 'and they stay unlocked', JSON.stringify(r.after));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
    }

    /* ---- the ladder: declared, not hand written, and paced ---- */
    {
      console.log('the ladder');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const rows = Object.entries(UNLOCKS).map(([k, u]) => ({
          k, band: u.band, goal: u.goal, how: u.how, unit: u.unit,
          fn: typeof u.have === 'function', real: !!ROSTER_BY_KEY[k],
        }));
        /* Every rung agrees with the one function that decides it. */
        const p = { wins: 25, titles: 1 };
        const agrees = rows.every(x => unlockMet(x.k, Object.assign({}, PROGRESS, p))
          === (UNLOCKS[x.k].have(Object.assign({}, PROGRESS, p)) >= UNLOCKS[x.k].goal));
        return { rows, agrees, roster: ROSTER.length,
                 bands: Object.keys(UNLOCK_BANDS) };
      });
      const bad = r.rows.filter(x => !(x.fn && x.real && x.goal > 0 && x.how && x.unit && x.band));
      ok(bad.length === 0, 'every rung names a real character and declares metric, goal, band',
         JSON.stringify(bad));
      ok(r.agrees, 'the sentence and the test cannot drift: one function decides both');
      ok(r.rows.every(x => r.bands.indexOf(x.band) !== -1), 'every band is a declared one',
         JSON.stringify(r.rows.map(x => x.band)));
      const short = r.rows.filter(x => x.band === 'short');
      const legend = r.rows.filter(x => x.band === 'legend');
      ok(r.rows.length >= 18, 'the ladder is long enough to be a ladder', 'rungs=' + r.rows.length);
      ok(r.roster - r.rows.length >= 30,
         'and still leaves a full cabinet open on day one', 'open=' + (r.roster - r.rows.length));
      ok(short.length >= 6, 'a new player can earn several in a sitting', 'short=' + short.length);
      ok(legend.length >= 3, 'and three or more are the long tail', 'legend=' + legend.length);
      /* THE POINT OF THE TAIL. Nothing at the top of the ladder may be
         reachable in an evening, or the cabinet empties in two days and
         a franchise has nothing left to run toward. */
      ok(legend.every(x => x.goal >= 5), 'no legend rung falls inside one session',
         JSON.stringify(legend.map(x => x.k + ' ' + x.goal)));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- a card you cannot draft sorts behind every card you can ---- */
    {
      console.log('locked last');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const out = {};
        for (const S of ROSTER_SORTS) {
          const list = sortedRoster(S.k);
          const lock = [], open = [];
          list.forEach((c, i) => (isUnlocked(c.k) ? open : lock).push(i));
          out[S.k] = {
            last: Math.min.apply(null, lock) > Math.max.apply(null, open),
            ordered: open.every((idx, j) => j === 0 || (S.dir === 1
              ? S.val(list[open[j - 1]]) <= S.val(list[idx])
              : S.val(list[open[j - 1]]) >= S.val(list[idx]))),
            n: list.length, roster: ROSTER.length,
          };
        }
        State.mode = 'exhibition'; State.screen = 'roster'; render();
        out.buttons = [...document.querySelectorAll('.sortbar .sb')].map(b => b.textContent);
        /* Clicking one reorders the grid in place rather than rebuilding it. */
        const before = document.querySelectorAll('.roster .charcard').length;
        [...document.querySelectorAll('.sortbar .sb')].find(b => b.textContent === 'Pitching').click();
        out.after = document.querySelectorAll('.roster .charcard').length;
        out.same = before === out.after;
        out.firstByPit = document.querySelector('.roster .charcard .name').textContent;
        out.gridLastLocked = [...document.querySelectorAll('.roster .charcard')]
          .slice(-1)[0].classList.contains('locked');
        return out;
      });
      for (const S of ['name', 'pow', 'spd', 'con', 'def', 'pit']) {
        ok(r[S].last, `sort by ${S}: every locked card is behind every open one`);
        ok(r[S].ordered, `sort by ${S}: the open ones are in order`);
        ok(r[S].n === r[S].roster, `sort by ${S}: nobody is dropped or duplicated`,
           `${r[S].n} of ${r[S].roster}`);
      }
      ok(JSON.stringify(r.buttons) === JSON.stringify(
           ['A to Z','Power','Speed','Contact','Fielding','Pitching']),
         'the six ways to read the cabinet are on the screen', JSON.stringify(r.buttons));
      ok(r.same, 'sorting moves the cards it already made rather than making new ones');
      ok(r.gridLastLocked, 'and the last card in the grid is a locked one');
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the hover card ---- */
    {
      console.log('the hover card');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        PROGRESS.careerSB = 30;
        State.mode = 'exhibition'; State.screen = 'roster'; render();
        const out = {};
        const cat = [...document.querySelectorAll('.charcard')]
          .find(c => c.querySelector('.name').textContent === 'Acrobat');
        cat.dispatchEvent(new MouseEvent('mouseenter'));
        const pop = document.querySelector('.lockpop');
        out.text = pop.textContent;
        out.vis = getComputedStyle(pop).visibility;
        const box = pop.getBoundingClientRect();
        out.onScreen = box.left >= 0 && box.top >= 0
          && box.right <= window.innerWidth && box.bottom <= window.innerHeight;
        out.bar = pop.querySelector('.pop-bar i').style.width;
        cat.dispatchEvent(new MouseEvent('mouseleave'));
        out.gone = getComputedStyle(pop).visibility;
        /* One popup, reused, not one per card. */
        out.count = document.querySelectorAll('.lockpop').length;
        /* A card you can already draft raises nothing: the popup answers
           "how do I get this one", and that card has no answer to give. */
        const open = [...document.querySelectorAll('.charcard:not(.locked)')][0];
        open.dispatchEvent(new MouseEvent('mouseenter'));
        out.openVis = getComputedStyle(document.querySelector('.lockpop')).visibility;
        /* Earning it stops the popup entirely, because there is no longer
           a question to answer. */
        PROGRESS.careerSB = 50; refreshUnlocks();
        State.screen = 'roster'; render();
        const cat2 = [...document.querySelectorAll('.charcard')]
          .find(c => c.querySelector('.name').textContent === 'Acrobat');
        cat2.dispatchEvent(new MouseEvent('mouseenter'));
        out.earnedVis = getComputedStyle(document.querySelector('.lockpop')).visibility;
        out.stillLocked = cat2.classList.contains('locked');
        return out;
      });
      ok(r.vis === 'visible', 'hovering a locked card raises the popup', r.vis);
      ok(/Locked/.test(r.text) && /To unlock: Steal 50 bases\./.test(r.text),
         'it states the requirement in full', r.text);
      ok(/30 of 50 stolen bases/.test(r.text),
         'and how far along you are, which the card itself cannot say', r.text);
      ok(r.bar === '60%', 'the bar matches the count', r.bar);
      ok(/Early/.test(r.text), 'and it says roughly how long this one takes', r.text);
      ok(r.onScreen, 'the popup is placed inside the window rather than off its edge');
      ok(r.gone === 'hidden', 'it goes away when the pointer leaves', r.gone);
      ok(r.count === 1, 'there is one popup, reused, not fifty five', 'n=' + r.count);
      ok(r.openVis === 'hidden', 'a character you can already draft raises nothing', r.openVis);
      ok(!r.stillLocked && r.earnedVis === 'hidden',
         'and once earned, that card stops raising it too', r.earnedVis);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the squad photo ---- */
    {
      console.log('the squad photo');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const out = {};
        State.screen = 'menu'; render();
        /* The home page is the room. The roster used to print underneath
           it, which made the first thing anybody saw a wall of numbers. */
        out.menuCards = document.querySelectorAll('#app .charcard').length;
        out.tab = (document.querySelector('.dugtabs .tab') || {}).textContent;
        document.querySelector('.dugtabs .tab').click();
        out.screen = State.screen;

        const hots = [...document.querySelectorAll('.photo .hot')];
        out.faces = hots.length;
        out.named = new Set(hots.map(h => h.textContent)).size;
        /* Not the draft screen wearing a different hat: no stat block and
           no pick counter anywhere on the picture. */
        out.statBlocks = document.querySelectorAll('.photo .statgrid, .photo .charcard').length;

        const spots = photoSpots();
        out.rows = spots.length && Math.max.apply(null, spots.map(s => s.row)) + 1;
        out.everyone = spots.length;
        out.roster = ROSTER.length;
        /* nobody may share a slot with anybody else, which is how the
           fixed 11 by 5 grid quietly lost thirteen people */
        out.slots = new Set(spots.map(s => s.row + ':' + s.col)).size;
        /* Still to earn stands at the back, same rule as the draft grid. */
        const lockRows = spots.filter(s => !isUnlocked(s.c.k)).map(s => s.row);
        const openRows = spots.filter(s => isUnlocked(s.c.k)).map(s => s.row);
        out.lockedBehind = Math.min.apply(null, lockRows) >= Math.max.apply(null, openRows);
        /* A hot zone covers only the visible band, so pointing at a back
           row lands on that person rather than on whoever stands in front. */
        out.hitsSelf = hots.every(h => {
          const b = h.getBoundingClientRect();
          if (b.bottom < 0 || b.top > window.innerHeight) return true;   /* off screen */
          const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return el === h;
        });

        /* The panel is the only place a number appears. */
        const show = (name) => {
          const h = hots.find(x => x.textContent === name);
          h.dispatchEvent(new MouseEvent('mouseenter'));
          return document.querySelector('.meetbar').textContent;
        };
        out.idle = document.querySelector('.meetbar').textContent;
        out.open = show('Popeye');
        const lockedName = spots.filter(s => !isUnlocked(s.c.k))[0].c.n;
        out.lockedName = lockedName;
        out.locked = show(lockedName);
        /* One panel, refilled, and it does not grow a line and shove the
           picture up the page when a bio runs long. */
        out.panels = document.querySelectorAll('.meetbar').length;
        const box = document.querySelector('.photo').getBoundingClientRect();
        show('Dracula');
        out.photoStill = Math.abs(document.querySelector('.photo').getBoundingClientRect().top - box.top) < 1;
        return out;
      });
      ok(r.menuCards === 0, 'the dugout is the home page, with no roster printed under it',
         'cards=' + r.menuCards);
      ok(/Meet the players/i.test(r.tab || ''), 'and a tab that opens the squad', r.tab);
      ok(r.screen === 'meet', 'the tab goes to the photo', r.screen);
      ok(r.faces === r.roster && r.named === r.roster,
         `all ${r.roster} are in the frame, once each`,
         `faces=${r.faces} named=${r.named} roster=${r.roster}`);
      ok(r.rows === 5 && r.everyone === r.roster && r.slots === r.roster,
         'five rows on the risers, one slot each',
         JSON.stringify({ rows: r.rows, n: r.everyone, slots: r.slots }));
      ok(r.statBlocks === 0, 'the picture carries no stat blocks: it is not the draft screen');
      ok(r.lockedBehind, 'the ones still to earn stand at the back');
      ok(r.hitsSelf, 'pointing at a face lands on that face, not on the row in front');
      ok(/\d+ players/.test(r.idle), 'the idle panel carries the counts and nothing else', r.idle);
      ok(/Popeye/.test(r.open) && /POW 88/.test(r.open) && /SPD 55/.test(r.open)
         && /CON 60/.test(r.open) && /DEF 65/.test(r.open) && /PIT 62/.test(r.open),
         'hovering fills the panel with the name and all five numbers', r.open);
      ok(/forearm day/.test(r.open), 'and the bio', r.open);
      ok(new RegExp(r.lockedName).test(r.locked) && /Locked:/.test(r.locked)
         && /\d+ of \d+/.test(r.locked),
         'a locked face reads out how to earn them and how far along', r.locked);
      ok(r.panels === 1, 'one panel, refilled', 'n=' + r.panels);
      ok(r.photoStill, 'and a longer bio does not walk the picture up the page');
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the room takes the window ---- */
    {
      console.log('the room fills up');
      /* The room used to be capped at 900 CSS pixels inside a 920 page, so
         on any real monitor it was a small picture over two thirds of a
         blank window. It is sized off the height budget through its own
         ratio now, which is easy to undo by accident: one stray max-width
         anywhere up the tree puts it back in its box, and nothing else
         would fail. */
      for (const [w, h] of [[1440, 900], [1280, 800], [1680, 1050], [390, 844]]) {
        const pg = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(URL);
        await pg.evaluate(() => localStorage.clear());
        await pg.goto(URL);
        const r = await pg.evaluate(() => {
          const el = document.querySelector('.dugout canvas');
          const cv = el.getBoundingClientRect();
          const tabs = document.querySelector('.dugtabs').getBoundingClientRect();
          const hots = [...document.querySelectorAll('.dugout .hot')]
            .map(b => b.getBoundingClientRect());
          /* No two things in the room may claim the same pixel. */
          let overlap = false;
          for (let i = 0; i < hots.length; i++) {
            for (let j = i + 1; j < hots.length; j++) {
              if (hots[i].right > hots[j].left && hots[j].right > hots[i].left
                  && hots[i].bottom > hots[j].top && hots[j].bottom > hots[i].top) overlap = true;
            }
          }
          return {
            /* the CONTENT box: the rect carries the 3px border, which is a
               tenth of a phone-sized room's height and none of a desk one's,
               so comparing rects makes the shape look wrong only on a phone */
            cw: el.clientWidth, ch: el.clientHeight,
            room: document.body.classList.contains('inroom'),
            hots: hots.length, overlap,
            inFrame: hots.every(b => b.left >= cv.left - 1 && b.right <= cv.right + 1
                                  && b.top >= cv.top - 1 && b.bottom <= cv.bottom + 1),
            bottom: tabs.bottom, vh: window.innerHeight,
            docW: document.documentElement.scrollWidth, winW: window.innerWidth,
            ratio: DUGOUT_W / DUGOUT_H,
          };
        });
        const tag = `${w}x${h}`;
        ok(r.room, `${tag}: the menu puts the page in room mode`);
        ok(Math.abs(r.cw / r.ch - r.ratio) < 0.02,
           `${tag}: the room keeps its shape rather than stretching`,
           `drawn ${Math.round(r.cw)}x${Math.round(r.ch)} ratio ${(r.cw / r.ch).toFixed(2)} want ${r.ratio.toFixed(2)}`);
        ok(r.bottom <= r.vh, `${tag}: the whole room and its tab are above the fold`,
           `bottom=${Math.round(r.bottom)} vh=${r.vh}`);
        ok(r.docW <= r.winW + 1, `${tag}: and the page does not scroll sideways`,
           `doc=${r.docW} win=${r.winW}`);
        ok(r.hots === 4 && !r.overlap && r.inFrame,
           `${tag}: four things, none overlapping, all inside the frame`,
           JSON.stringify({ n: r.hots, overlap: r.overlap, inFrame: r.inFrame }));
        if (w >= 1280) {
          ok(r.cw >= w * 0.82, `${tag}: it actually fills the window`,
             `drawn ${Math.round(r.cw)} of ${w}`);
        }
        ok(errors.length === 0, `${tag}: no page errors`, errors.join(' | '));
        await pg.close();
      }
      /* And it gives the page back on the way out. */
      const { pg, errors } = await fresh(browser);
      const off = await pg.evaluate(() => {
        State.screen = 'howto'; render();
        return document.body.classList.contains('inroom');
      });
      ok(!off, 'leaving the room hands the page layout back');
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the better the character, the harder the rung ---- */
    {
      console.log('harder is better');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const rows = Object.entries(UNLOCKS).map(([k, u]) => {
          const c = ROSTER_BY_KEY[k];
          return { k, n: c.n, rank: u.rank, cost: u.cost, kind: u.kind, goal: u.goal,
                   metric: u.unit, v: charValue(c), pit: c.pit, spd: c.spd, pow: c.pow };
        }).sort((a, b) => a.rank - b.rank);
        const free = ROSTER.filter(c => !UNLOCKS[c.k]);
        return {
          rows,
          ranks: rows.map(x => x.rank),
          freeBest: Math.max.apply(null, free.map(charValue)),
          freeN: free.length,
          lockWorst: Math.min.apply(null, rows.map(x => x.v)),
          bestArm: Math.max.apply(null, ROSTER.map(c => c.pit)),
          bestLegs: Math.max.apply(null, ROSTER.map(c => c.spd)),
        };
      });
      const rise = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
      ok(JSON.stringify(r.ranks) === JSON.stringify(r.rows.map((_, i) => i + 1)),
         'the rungs are numbered 1 to ' + r.rows.length + ' with no gaps and no repeats',
         JSON.stringify(r.ranks));

      /* THE RULE. Value is the game's own teamRating read for one of the
         nine, so this cannot be argued with by adjusting an opinion. */
      ok(rise(r.rows.map(x => x.v)),
         'a higher rung always pays a better character',
         r.rows.map(x => `${x.rank}:${x.n} ${x.v.toFixed(1)}`).join(' | '));
      ok(rise(r.rows.map(x => x.cost)),
         'and always costs more to reach',
         r.rows.map(x => x.rank + ':' + x.cost).join(' '));
      /* And the rule only means something if the best players are behind
         it: with them free, the hardest rung is not the best character. */
      ok(r.lockWorst > r.freeBest,
         'every locked character outranks every free one, so the top of the ladder is the top of the roster',
         `worst locked ${r.lockWorst.toFixed(2)} vs best free ${r.freeBest.toFixed(2)}`);
      ok(r.freeN >= 30, 'and a full cabinet is still open on day one', 'free=' + r.freeN);

      /* Two rungs on the same counter must not invert: an "easier" rung
         you can only clear after a harder one is a lie about the order. */
      const byMetric = {};
      for (const x of r.rows) (byMetric[x.metric] || (byMetric[x.metric] = [])).push(x);
      const inverted = Object.entries(byMetric)
        .filter(([, list]) => !rise(list.map(x => x.goal)))
        .map(([m, list]) => m + ': ' + list.map(x => x.rank + ':' + x.goal).join(','));
      ok(inverted.length === 0,
         'where two rungs count the same thing, the higher one asks for more',
         inverted.join(' | '));

      /* THE ARMS. The point of the pitching rungs: the better the arm, the
         harder the pitching feat, and the game's best arm sits at the top. */
      const arms = r.rows.filter(x => x.kind === 'pitch');
      ok(arms.length >= 4, 'there are several pitching rungs', 'n=' + arms.length);
      ok(rise(arms.map(x => x.pit)),
         'each pitching rung pays a better arm than the one below it',
         arms.map(x => `${x.rank}:${x.n} PIT ${x.pit}`).join(' | '));
      const topArm = arms[arms.length - 1];
      ok(topArm.pit >= r.bestArm,
         'and the hardest pitching feat pays the best arm in the game',
         `${topArm.n} PIT ${topArm.pit} vs best ${r.bestArm}`);
      ok(topArm.rank === r.rows.length,
         'which is the top of the whole ladder', 'rank ' + topArm.rank);

      /* The same shape for the other two stats that have a rung of their own. */
      const legs = r.rows.filter(x => x.kind === 'speed');
      ok(rise(legs.map(x => x.spd)), 'each running rung pays a faster character',
         legs.map(x => `${x.rank}:${x.n} SPD ${x.spd}`).join(' | '));
      ok(legs[legs.length - 1].spd >= r.bestLegs,
         'and the hardest one pays the fastest in the game',
         `${legs[legs.length - 1].n} ${legs[legs.length - 1].spd} vs ${r.bestLegs}`);
      const bats = r.rows.filter(x => x.kind === 'power');
      ok(rise(bats.map(x => x.pow)), 'each hitting rung pays a bigger bat',
         bats.map(x => `${x.rank}:${x.n} POW ${x.pow}`).join(' | '));

      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- fewer words ---- */
    {
      console.log('fewer words');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const out = {};
        /* SETTINGS. Every group carried a paragraph explaining what its own
           words already said. A settings screen that has to be read is a
           settings screen nobody reads. */
        State.team = ROSTER.filter(c => isUnlocked(c.k)).slice(0, 9).map(c => c.k);
        State.mode = 'season'; State.franchise = randomFranchise();
        State.screen = 'settings'; render();
        out.heads = [...document.querySelectorAll('#app h3')].map(h => h.textContent);
        out.prose = [...document.querySelectorAll('#app p')].map(p => p.textContent);
        out.toggles = [...document.querySelectorAll('#app .toggle')].map(t => t.textContent);
        out.btns = [...document.querySelectorAll('#app .btn')].map(t => t.textContent);
        /* and they still do what they say */
        const pick = (label) => [...document.querySelectorAll('#app .toggle')]
          .find(t => t.textContent === label);
        pick('9').click();
        out.innings = State.innings;
        State.screen = 'settings'; render();
        out.nineOn = pick('9').classList.contains('on');

        /* THE INFO DOT. The standings rule was three lines of small print
           under the table on every visit. */
        startSeason();
        State.screen = 'season-hub'; render();
        const dot = document.querySelector('.infodot');
        const box = document.querySelector('.infobox');
        out.startsShut = box.hidden;
        out.aria = dot.getAttribute('aria-expanded');
        dot.click();
        out.opens = !box.hidden;
        out.ariaOpen = dot.getAttribute('aria-expanded');
        out.rule = box.textContent;
        dot.click();
        out.shutsAgain = box.hidden;
        out.hubProse = [...document.querySelectorAll('#app .card > p')].map(p => p.textContent);
        return out;
      });
      ok(JSON.stringify(r.heads) === JSON.stringify(
           ['Innings','Difficulty','Game speed','Cutscenes','Coaching tips']),
         'settings is five headings', JSON.stringify(r.heads));
      ok(r.prose.length === 0, 'and not one line of prose', JSON.stringify(r.prose));
      ok(JSON.stringify(r.toggles) === JSON.stringify(
           ['5','9','easy','medium','hard','Relaxed','Normal','Fast','On','Off','On','Off']),
         'the choices are the words themselves', JSON.stringify(r.toggles));
      ok(r.btns.length === 2, 'two buttons and no more', JSON.stringify(r.btns));
      ok(r.innings === 9 && r.nineOn, 'and the switches still switch', 'innings=' + r.innings);
      ok(r.startsShut && r.aria === 'false', 'the standings rule starts folded away');
      ok(r.opens && r.ariaOpen === 'true' && /head to head/.test(r.rule),
         'the dot opens it for anyone who wants it', r.rule.slice(0, 60));
      ok(r.shutsAgain, 'and folds it back');
      ok(!r.hubProse.some(p => /head to head|Top four make/.test(p)),
         'so the rule is not printed under the table any more', JSON.stringify(r.hubProse));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the close shot shows the whole field ---- */
    {
      console.log('nothing cropped');
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(() => {
        const g = fieldGeom();
        /* What the camera can see at the plate, in field coordinates. */
        const c = { ...CAM_BAT };
        const z = Math.max(1, c.zoom);
        const halfW = g.w / (2 * z), halfH = g.h / (2 * z);
        const cx = Math.min(Math.max(c.fx * g.w, halfW), g.w - halfW);
        const cy = Math.min(Math.max(c.fy * g.h, halfH), g.h - halfH);
        const view = { l: cx - halfW, r: cx + halfW, t: cy - halfH, b: cy + halfH };
        const pts = [];
        pts.push(['home plate', g.cx, g.plateY]);
        pts.push(['first base', g.cx + g.rx, g.midY]);
        pts.push(['third base', g.cx - g.rx, g.midY]);
        pts.push(['second base', g.cx, g.topY]);
        for (const [i, f] of (typeof FIELDER_SPOTS !== 'undefined' ? FIELDER_SPOTS : []).entries()) {
          const p = typeof f === 'function' ? f(g) : f;
          if (p && isFinite(p.x)) pts.push(['fielder ' + i, p.x, p.y]);
        }
        return {
          view, pts,
          /* the batter stands a little below the plate and must fit too */
          batterFoot: g.plateY + 34,
          /* the stands, which are the top of the frame */
          standsBottom: g.h * 0.175,
          zoom: CAM_BAT.zoom,
        };
      });
      const out = r.pts.filter(([, x, y]) =>
        x < r.view.l || x > r.view.r || y < r.view.t || y > r.view.b);
      ok(out.length === 0, 'every base and every fielder is inside the close shot',
         JSON.stringify(out));
      ok(r.batterFoot <= r.view.b, 'and the batter is not cut off at the bottom',
         `foot ${Math.round(r.batterFoot)} vs ${Math.round(r.view.b)}`);
      ok(r.view.t < r.standsBottom, 'the stands are in frame rather than above it',
         `view top ${Math.round(r.view.t)} vs stands to ${Math.round(r.standsBottom)}`);
      ok(r.zoom <= 1.10, 'the close shot is a push in, not a crop', 'zoom=' + r.zoom);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the play's plan agrees with the scorer ---- */
    {
      console.log('the play moves');
      /* Every play is PLANNED before it is drawn: ball flight with bounce
         and roll, runner kinematics, a fielder who intercepts, a throw.
         The plan must agree with the outcome the rules already decided,
         because the picture is a rendering of the book, not a second
         opinion about it. These are the promises:

           an OUT is a throw that beats the runner to the bag
           a HIT is a throw that arrives after him
           a DOUBLE PLAY is two throws that each beat their man
           the ball moves continuously and dies inside the wall
           the batter's run to first takes seconds, not the ball's clock

         Each play is built with its timers stubbed and its dice loaded,
         so the plan can be read as data without the game advancing. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(() => {
        const g = State.game;
        const out = {};
        const mk = (kind, withRunner, info) => {
          g.play = null; g.tail = null; g.outs = 0;
          /* the plain play path is the batter's; in the fielding half a
             ground ball routes to the throw minigame instead */
          g.half = g.away.isYou ? 'top' : 'bottom';
          g.pitch = null;
          g.bases = [withRunner ? g.away.batters[5] : null, null, null];
          const realTimeout = window.setTimeout;
          window.setTimeout = () => 0;
          let i = 0; const dice = [0.9, 0.5, 0.3, 0.01];
          const realRandom = Math.random;
          Math.random = () => dice[i++ % dice.length];
          scheduleContactPlay(kind, currentBatter(), info);
          window.setTimeout = realTimeout;
          Math.random = realRandom;
          const sim = g.play.sim;
          const play = g.play;
          g.play = null; g.tail = null;
          return { sim, play };
        };
        const ballStats = (sim) => {
          let step = 0, low = 0;
          for (let k = 1; k < sim.ball.length; k++) {
            const a = sim.ball[k - 1], b = sim.ball[k];
            step = Math.max(step, Math.hypot(b[0] - a[0], b[1] - a[1]));
            low = Math.min(low, b[2]);
          }
          const last = sim.ball[sim.ball.length - 1];
          return { step: +step.toFixed(3), low, sum: +(last[0] + last[1]).toFixed(2) };
        };

        { /* the ground out */
          const { sim, play } = mk('ground out', false);
          const th = sim.throws.find(t => t.base === 0);
          const bat = sim.runners.find(r => r.isBatter);
          /* his own legs' time to first, for the same man */
          const nat = simRunPath(simRunnerPoints(-1, 0), simRunnerSpeed(play.batter), 0.12,
                                 { runThrough: true, delay: 0.18 }).reached;
          out.go = { th: !!th, arrive: th && +th.arrive.toFixed(2),
                     reach: +bat.run.reached.toFixed(2), nat: +nat.toFixed(2),
                     beats: !!th && th.arrive < bat.run.reached,
                     ball: ballStats(sim) };
        }
        { /* the single, with a man on */
          const { sim } = mk('single', true);
          const late = sim.throws.filter(t => t.base >= 0).every(t =>
            sim.runners.filter(r => r.toIdx === t.base)
                       .every(r => t.arrive > r.run.reached));
          const bat = sim.runners.find(r => r.isBatter);
          out.hit = { throws: sim.throws.length, late,
                      batToFirst: +bat.run.reached.toFixed(2),
                      ball: ballStats(sim),
                      roles: Object.values(sim.fielders).map(f => f.role) };
        }
        { /* the double play */
          const { sim, play } = mk('ground out', true);
          const th1 = sim.throws[0], th2 = sim.throws[1];
          const lead = sim.runners.find(r => !r.isBatter);
          const bat = sim.runners.find(r => r.isBatter);
          out.dp = { was: play.doublePlay, throws: sim.throws.length,
                     firstBeatsLead: th1 && lead && th1.arrive < lead.run.reached,
                     secondBeatsBatter: th2 && th2.arrive < bat.run.reached };
        }
        { /* the fly out: met in the air, where it lands, when it lands */
          const { sim } = mk('fly out', false);
          out.fly = { met: Math.abs(sim.meetAt - sim.landAt) < 0.001,
                      fielderRole: sim.fielders[sim.fielderPost].role };
        }
        { /* spray: the swing's timing owns the direction */
          const early = mk('single', false, { off: -0.085, q: 0.6 }).play.ball.dx;
          const late  = mk('single', false, { off:  0.085, q: 0.6 }).play.ball.dx;
          const crush = mk('single', false, { off: 0, q: 0.95 }).play.ball;
          const bloop = mk('single', false, { off: 0, q: 0.2 }).play.ball;
          out.spray = { early: +early.toFixed(2), late: +late.toFixed(2),
                        linerArc: Math.round(crush.arcH), bloopArc: Math.round(bloop.arcH) };
        }
        { /* the steal: the race is real both ways */
          const realTimeout = window.setTimeout; window.setTimeout = () => 0;
          const realRandom = Math.random;
          g.bases = [g.away.batters[5], null, null];
          g.pitch = { swung: false };
          Math.random = () => 0.01;      /* safe */
          attemptSteal();
          const safe = State.game.steal.sim;
          g.steal = null; g.bases = [g.away.batters[5], null, null];
          g.pitch = { swung: false };
          Math.random = () => 0.99;      /* caught */
          attemptSteal();
          const caught = State.game.steal.sim;
          g.steal = null; g.pitch = null; g.bases = [null, null, null];
          window.setTimeout = realTimeout; Math.random = realRandom;
          out.steal = { safeWins: safe.th.arrive > safe.run.reached,
                        caughtLoses: caught.th.arrive < caught.run.reached };
        }
        return out;
      });
      ok(r.go.th && r.go.beats, 'a ground out is a throw that beats the batter to first',
         JSON.stringify(r.go));
      ok(r.go.reach >= 1.4 && r.go.reach <= r.go.nat + 0.5,
         'and his run to first is close to his own legs\' time',
         `reach=${r.go.reach} natural=${r.go.nat}`);
      ok(r.hit.late, 'a hit is a throw that arrives after the runner it chases',
         JSON.stringify(r.hit));
      ok(r.hit.throws >= 1, 'and the ball does come back in', 'throws=' + r.hit.throws);
      ok(r.dp.was && r.dp.throws === 2 && r.dp.firstBeatsLead && r.dp.secondBeatsBatter,
         'a double play is two throws that each beat their man', JSON.stringify(r.dp));
      ok(r.fly.met && r.fly.fielderRole === 'field',
         'a fly out is met in the air by the man who ran under it', JSON.stringify(r.fly));
      for (const tag of ['go', 'hit']) {
        ok(r[tag].ball.step < 0.09, `${tag}: the ball moves continuously, no teleports`,
           'max step ' + r[tag].ball.step);
        ok(r[tag].ball.low >= 0, `${tag}: and never goes underground`, 'low=' + r[tag].ball.low);
        ok(r[tag].ball.sum <= 2.85, `${tag}: and dies inside the wall`, 'rest u+v=' + r[tag].ball.sum);
      }
      ok(r.spray.early < -0.3 && r.spray.late > 0.3,
         'an early swing pulls the ball, a late one goes the other way',
         JSON.stringify(r.spray));
      ok(r.spray.bloopArc > r.spray.linerArc + 40,
         'square contact is a low liner, weak contact a blooper that hangs',
         JSON.stringify(r.spray));
      ok(r.steal.safeWins && r.steal.caughtLoses,
         'a steal is a race: safe means the runner won it, caught means the throw did',
         JSON.stringify(r.steal));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the dive: spectacle that never contradicts the book ---- */
    {
      console.log('the dive');
      /* A liner single is allowed to pull an infielder into a dive, and
         the dive is pure decoration: the rules already scored the play a
         hit, so the glove must land SHORT of the ball, the diver must
         not be the man fielding it or the cutoff, and no base a throw is
         coming to may lose its cover man to the dirt. The feature also
         has to actually HAPPEN somewhere in the spray, or it is dead
         code wearing a comment (the badge catalog taught that one). */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(() => {
        const g = State.game;
        g.half = g.away.isYou ? 'top' : 'bottom';
        const out = { tries: 0, liners: 0, dives: 0, bad: [] };
        const realTimeout = window.setTimeout;
        const realRandom = Math.random;
        for (const off of [-0.06, -0.03, 0, 0.03, 0.06]) {
          g.play = null; g.tail = null; g.outs = 0; g.bases = [null, null, null];
          window.setTimeout = () => 0;
          let i = 0; const dice = [0.9, 0.5, 0.3, 0.01];
          Math.random = () => dice[i++ % dice.length];
          scheduleContactPlay('single', currentBatter(), { off, q: 0.9 });
          window.setTimeout = realTimeout; Math.random = realRandom;
          const play = g.play, sim = play.sim;
          g.play = null; g.tail = null;
          out.tries++;
          if (play.ball.liner) out.liners++;
          if (!sim.dive) continue;
          out.dives++;
          const F = sim.fielders[sim.dive.post];
          const rest = simSample(F.run, 99).uv;
          let minD = 1e9;
          for (const bk of sim.ball) minD = Math.min(minD, simDist(rest, bk));
          const thrown = new Set(sim.throws.filter(q2 => q2.base >= 0).map(q2 => q2.base));
          if (sim.dive.post === sim.fielderPost) out.bad.push(off + ': dove at his own ball');
          if (sim.dive.post === sim.cutoff) out.bad.push(off + ': the cutoff dove');
          if (F.base != null && thrown.has(F.base) && !F.run2)
            out.bad.push(off + ': a thrown-to base lost its cover');
          if (minD < 0.02) out.bad.push(off + ': the glove reached the ball, dist ' + minD.toFixed(3));
          if (sim.dive.at > 1.1) out.bad.push(off + ': dove at ' + sim.dive.at.toFixed(2) + 's, after the moment');
        }
        return out;
      });
      ok(r.liners === r.tries, 'q 0.9 is a liner every time', JSON.stringify(r));
      ok(r.dives >= 1, 'and somewhere in the spray somebody actually dives',
         `dives=${r.dives} of ${r.tries}`);
      ok(r.bad.length === 0, 'every dive lands short, on the right man, breaking no duty',
         r.bad.join(' | '));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the snow: the cold parks and only the cold parks ---- */
    {
      console.log('the snow');
      /* Flag on the two winter grounds, off everywhere else, and the
         flakes visibly MOVE between frames while nothing else in the
         sky does. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(async () => {
        const out = { icebox: !!(PARKS.icebox.theme && PARKS.icebox.theme.snow),
                      pole: !!(STADIUM_THEMES['The Holiday Nine'] && STADIUM_THEMES['The Holiday Nine'].snow),
                      sandlot: !!(PARKS.sandlot.theme && PARKS.sandlot.theme.snow) };
        const base = currentTheme();
        const forced = Object.assign({}, base, { snow: true });
        const real = currentTheme;
        currentTheme = () => forced;
        const cv = document.getElementById('field');
        const strip = () => cv.getContext('2d').getImageData(0, 0, cv.width, 24).data;
        await new Promise(rz => requestAnimationFrame(() => requestAnimationFrame(rz)));
        const a = strip();
        await new Promise(rz => setTimeout(rz, 220));
        await new Promise(rz => requestAnimationFrame(() => requestAnimationFrame(rz)));
        const b = strip();
        currentTheme = real;
        let moved = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) moved++;
        out.moved = moved;
        return out;
      });
      ok(r.icebox && r.pole, 'The Icebox and North Pole Yard carry the flag',
         JSON.stringify(r));
      ok(!r.sandlot, 'and the sandlot does not', JSON.stringify(r));
      ok(r.moved > 4, 'flakes move between frames', 'moved=' + r.moved);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the plate camera: when it is up and when it cuts ---- */
    {
      console.log('the plate camera');
      /* Every real baseball game plays the at bat from behind the catcher.
         The picture is the plate whenever a pitch is live or has just been
         called, and the wide field the instant anything leaves the plate:
         a ball in play, a steal, the walk after ball four. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(() => {
        const g = State.game;
        g.half = 'top'; g.inning = 1;
        const out = {};
        const _st = window.setTimeout; window.setTimeout = () => 0;
        startAtBat(); endAtBatCleanup();
        out.beforePitch = plateViewActive(g);
        throwPitch('fastball', 4);
        out.windup = plateViewActive(g);
        const p = g.pitch;
        p.windupUntil = performance.now() - 1; p.start = performance.now() - 1;
        out.flight = plateViewActive(g);
        out.loc = p.loc; out.aim = p.aim; out.strikeIsPlace = p.isStrike === (Math.abs(p.loc.x) <= 1 && Math.abs(p.loc.y) <= 1);
        /* a called pitch holds the picture for the beat */
        p.resolved = true; resolveCalledPitch();
        out.afterCall = plateViewActive(g);
        out.holdMs = g.plateHold - performance.now();
        /* contact cuts away */
        g.balls = 0; g.strikes = 0;
        endAtBatCleanup();
        throwPitch('fastball', 4);
        g.pitch.loc = { x: 0, y: 0 }; g.pci = { x: 0, y: 0 };
        Math.random = () => 0.5;
        scheduleContactPlay('single', currentBatter(), { off: 0, q: 0.9 });
        out.onContact = plateViewActive(g);
        out.pitchClosed = !!g.pitch.closed;
        g.play = null; g.tail = null;
        out.afterPlay = plateViewActive(g);
        window.setTimeout = _st;
        return out;
      });
      ok(!r.beforePitch && r.windup && r.flight, 'the plate comes up with the pitch', JSON.stringify(r));
      ok(r.loc && typeof r.loc.x === 'number' && r.aim, 'the pitch has an aim and a landing spot', JSON.stringify(r.loc));
      ok(r.strikeIsPlace, 'a strike is a fact about where it landed', JSON.stringify(r));
      ok(r.afterCall && r.holdMs > 0, 'a called pitch holds the picture for the beat', JSON.stringify(r));
      ok(!r.onContact && r.pitchClosed && !r.afterPlay, 'contact cuts to the field and the pitch is closed', JSON.stringify(r));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the bat has a place ---- */
    {
      console.log('the bat has a place');
      /* The swing is timing AND place. Same timing: a bat on the ball beats
         a bat a width away, a miss along the barrel costs less than a miss
         over it, a bat far under it finds nothing at all, and swinging
         under the ball lifts it. CON widens the reach and a power swing
         narrows it. All pure geometry, no dice. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(() => {
        State.difficulty = 'medium';
        const pitch = { ideal: 0.5, loc: { x: 0.2, y: -0.3 } };
        const ctx = { con: 70 };
        const q = (aim, mode, t) => swingGeometry(t == null ? 0.5 : t, aim, pitch, ctx, mode || 'normal');
        const on = q({ x: 0.2, y: -0.3 });
        const along = q({ x: 0.5, y: -0.3 });
        const over = q({ x: 0.2, y: 0.0 });
        const under = q({ x: 0.2, y: -0.6 });
        const far = q({ x: 0.2, y: 0.9 });
        const late = q({ x: 0.2, y: -0.3 }, 'normal', 0.62);
        return {
          on: on.contact, along: along.contact, over: over.contact, far: far.contact,
          farThrough: far.through, onThrough: on.through,
          underLift: under.lift, overLift: over.lift,
          reach: { c40: swingReach(40, 'normal'), c90: swingReach(90, 'normal'),
                   contact: swingReach(70, 'contact'), power: swingReach(70, 'power') },
          late: late.contact,
        };
      });
      ok(r.on > 0.9 && r.on > r.along && r.along > r.over,
         'on the ball beats along the barrel beats over it', JSON.stringify(r));
      ok(r.farThrough && r.far === 0 && !r.onThrough, 'a bat far under it finds nothing', JSON.stringify(r));
      ok(r.underLift > 0 && r.overLift < 0, 'under the ball lifts it, over it beats it down', JSON.stringify(r));
      ok(r.reach.c90 > r.reach.c40 && r.reach.contact > r.reach.power,
         'CON widens the reach, a power swing narrows it', JSON.stringify(r.reach));
      ok(r.late < r.on, 'and timing still counts', JSON.stringify({ on: r.on, late: r.late }));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the arm has a spot ---- */
    {
      console.log('the arm has a spot');
      /* Aim plus release is where a pitch goes. A better arm scatters
         less, a bad release scatters more, a tired arm more again, and a
         thrown pitch lands within the scatter of its aim: over many
         throws at the corner, an ace with a clean release throws strikes
         and a tired scrub letting it go late throws balls. The player's
         meter is a real meter: released in the band it reads clean,
         released off the end it reads wild. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(() => {
        const g = State.game;
        g.half = 'top'; g.inning = 1;
        const out = { scatter: { ace: pitchScatter(95, 1, 0), scrub: pitchScatter(20, 1, 0),
                                 aceLate: pitchScatter(95, 0.1, 0), aceTired: pitchScatter(95, 1, 3) } };
        const _st = window.setTimeout; window.setTimeout = () => 0;
        startAtBat(); endAtBatCleanup();
        const pit = currentPitcher();
        const realPit = pit.pit;
        const trial = (pitv, release, nTries) => {
          pit.pit = pitv;
          let strikes = 0, drift = 0;
          for (let i = 0; i < nTries; i++) {
            endAtBatCleanup();
            throwPitch('fastball', null, { aim: { x: 0.55, y: 0.55 }, release });
            const p = g.pitch;
            if (p.isStrike) strikes++;
            drift += Math.hypot(p.loc.x - 0.55, p.loc.y - 0.55);
          }
          return { strikeRate: strikes / nTries, drift: drift / nTries };
        };
        out.ace = trial(95, 1, 200);
        out.wild = trial(20, 0.1, 200);
        pit.pit = realPit;
        /* the meter itself */
        endAtBatCleanup();
        g.aimPt = { x: -0.4, y: 0.2 };
        startReleaseMeter('fastball');
        const m = g.meter;
        out.meterUp = !!m && plateViewActive(g);
        m.t0 = performance.now() - m.sweet * m.dur;      /* cursor dead in the band */
        g.releaseNow();
        out.clean = { q: g.meter.q, aim: g.pitch.aim, strip: !!document.getElementById('pitch-select') };
        endAtBatCleanup();
        startReleaseMeter('fastball');
        g.meter.t0 = performance.now() - 0.02 * g.meter.dur;   /* let go at the very top */
        g.releaseNow();
        out.early = { q: g.meter.q };
        window.setTimeout = _st;
        return out;
      });
      const sc = r.scatter;
      ok(sc.ace < sc.scrub && sc.ace < sc.aceLate && sc.ace < sc.aceTired,
         'a better arm, a clean release and a fresh arm all scatter less', JSON.stringify(sc));
      ok(r.ace.strikeRate > 0.8 && r.wild.strikeRate < 0.6 && r.ace.drift < r.wild.drift,
         'an ace at the corner throws strikes; a scrub letting it go late does not', JSON.stringify({ ace: r.ace, wild: r.wild }));
      ok(r.meterUp && r.clean.q > 0.9 && r.clean.aim.x === -0.4,
         'released in the band the pitch is clean and goes where it was aimed', JSON.stringify(r.clean));
      ok(r.early.q < 0.2, 'released at the top it is wild', JSON.stringify(r.early));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the frames ---- */
    {
      console.log('the frames');
      /* Every character carries the three part swing (load, swing,
         follow), the leg kick and the ready stance, and each is a
         different drawing from the idle it grew out of. The table is
         run length encoded and decodes to the declared size. */
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const keys = Object.keys(V2_SPRITES);
        const missing = [], same = [], bad = [];
        for (const k of keys) {
          for (const fr of ['load', 'follow', 'kick', 'ready']) {
            if (!V2_SPRITES[k].f[fr]) { missing.push(k + '/' + fr); continue; }
            const rows = v2Frame(k, fr);
            if (rows.length !== V2_H || rows.some(r => r.length !== V2_W)) bad.push(k + '/' + fr);
            if (V2_SPRITES[k].f[fr] === V2_SPRITES[k].f.idle || V2_SPRITES[k].f[fr] === V2_SPRITES[k].f.back) same.push(k + '/' + fr);
          }
        }
        return { n: keys.length, missing, same, bad, encoded: typeof V2_SPRITES[keys[0]].f.idle === 'string' };
      });
      ok(r.missing.length === 0, 'every character carries load, follow, kick and ready', r.missing.slice(0, 6).join(', '));
      ok(r.bad.length === 0, 'and each decodes to the declared size', r.bad.slice(0, 6).join(', '));
      ok(r.same.length === 0, 'and each is its own drawing', r.same.slice(0, 6).join(', '));
      ok(r.encoded, 'the table is run length encoded', 'encoded=' + r.encoded);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the mound: anyone can take it, and it is a swap ---- */
    {
      console.log('the mound');
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
        const starterMan = fielderAt(t, 0);
        /* An arm is free for three innings of WORK, then goes a level an
           inning. The same curve it has always had, counted per man. */
        const curve = [];
        for (let i = 0; i < 9; i++) { curve.push(armState(t, fielderAt(t, 0)).level); bookTheInning(t); }
        const tired = armState(t, starterMan).worked;
        const orderBefore = t.batters.map(b => b.k);
        /* Give the mound to the man playing post 5, third base. */
        const inIdx = t.field[5];
        const inMan = t.batters[inIdx];
        const moved = swapToMound(t, inIdx);
        const orderAfter = t.batters.map(b => b.k);
        const nowPitching = fielderAt(t, 0).k;
        const starterNowAt = postOfBatter(t, t.batters.indexOf(starterMan));
        /* Rest the starter: eight innings in the field, at half rate. */
        for (let i = 0; i < 8; i++) bookTheInning(t);
        const rested = armState(t, starterMan).worked;
        /* And he can come straight back, because nothing was spent. */
        const back = swapToMound(t, t.batters.indexOf(starterMan));
        /* The offer stands whenever you field between pitches. */
        g.play = null; refreshStealButton();
        const btn = document.getElementById('pen-btn');
        const shownFielding = btn.style.display !== 'none';
        g.half = 'bottom'; refreshStealButton();
        const shownBatting = btn.style.display !== 'none';
        g.half = 'top'; g.play = { kind: 'single' }; refreshStealButton();
        const shownMidPlay = btn.style.display !== 'none';
        g.play = null;
        const opts = moundOptions(t);
        return { curve, tired, rested, moved, back, nowPitching, inKey: inMan.k,
                 starterNowAt, optCount: opts.length,
                 optPits: opts.map(x => x.b.pit), optPosts: opts.map(x => x.post),
                 orderSame: JSON.stringify(orderBefore) === JSON.stringify(orderAfter),
                 shownFielding, shownBatting, shownMidPlay };
      });
      ok(JSON.stringify(r.curve) === JSON.stringify([0,0,0,1,2,3,4,5,6]),
         'an arm is free for three innings of work, then tires a level an inning', JSON.stringify(r.curve));
      ok(r.tired === 9, 'nine innings of work is nine on the arm', 'worked=' + r.tired);
      ok(r.moved && r.nowPitching === r.inKey, 'anyone in the field can be given the mound', JSON.stringify({ now: r.nowPitching, want: r.inKey }));
      ok(r.starterNowAt === 5, 'and the man he replaced takes his position', 'post=' + r.starterNowAt);
      ok(r.orderSame, 'the batting order never moves');
      ok(r.rested === 5, 'rest pays the arm back at half rate (9 less 8 halves)', 'worked=' + r.rested);
      ok(r.back === true, 'and a rested man can come straight back: nothing is spent');
      ok(r.optCount === 8, 'eight men to choose from, never the one pitching', 'n=' + r.optCount);
      ok(JSON.stringify(r.optPits) === JSON.stringify([...r.optPits].sort((a, b) => b - a)), 'ranked by PIT', JSON.stringify(r.optPits));
      ok(!r.optPosts.includes(0), 'and none of them is already on the mound', JSON.stringify(r.optPosts));
      ok(r.shownFielding && !r.shownBatting && !r.shownMidPlay, 'offered whenever you field between pitches', JSON.stringify({ f: r.shownFielding, b: r.shownBatting, p: r.shownMidPlay }));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- every character carries an arm, and it is not their bat ---- */
    {
      console.log('every character pitches');
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const miss = ROSTER.filter(c => typeof c.pit !== 'number' || c.pit < 1 || c.pit > 100);
        const pits = ROSTER.map(c => c.pit);
        const corr = (a, b) => {
          const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
          let num = 0, da = 0, db = 0;
          for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
          return num / Math.sqrt(da * db);
        };
        const sluggers = ROSTER.filter(c => c.pow >= 88).map(c => c.pit);
        /* A club is worth less without arms, or drafting one means nothing
           to the simulation that plays every game you do not. */
        const mash = ['kong','franky','humpty','golem','liberty','paulbunyan','sasquatch','cyclops','krampus'];
        const bal = ['robin','medusa','sherlock','ichabod','alice','peter','tom','popeye','dracula'];
        const clubs = OPPONENTS.map(o => teamRating(o.roster));
        return { missing: miss.map(c => c.k), vsPow: corr(pits, ROSTER.map(c => c.pow)),
                 vsCon: corr(pits, ROSTER.map(c => c.con)),
                 slugAvg: sluggers.reduce((a, b) => a + b, 0) / sluggers.length,
                 rosterAvg: pits.reduce((a, b) => a + b, 0) / pits.length,
                 liberty: (ROSTER.find(c => c.k === 'liberty') || {}).pit,
                 mashRating: teamRating(mash), balRating: teamRating(bal),
                 clubLo: Math.min(...clubs), clubHi: Math.max(...clubs) };
      });
      ok(r.missing.length === 0, 'every character on the roster carries an arm', r.missing.join(','));
      ok(r.vsPow < 0, 'the arm runs AGAINST power: the big bats cannot pitch', 'r=' + r.vsPow.toFixed(2));
      ok(r.vsCon < 0.8, 'and it is not CON wearing a different hat', 'r=' + r.vsCon.toFixed(2));
      ok(r.slugAvg < r.rosterAvg - 10, 'sluggers are materially worse arms than the roster', JSON.stringify({ slug: r.slugAvg.toFixed(1), all: r.rosterAvg.toFixed(1) }));
      ok(r.liberty <= 10, 'and the statue pitches like a statue', 'liberty=' + r.liberty);
      ok(r.balRating > r.mashRating + 8, 'a nine with arms rates well above a nine of sluggers',
         JSON.stringify({ balanced: r.balRating.toFixed(1), sluggers: r.mashRating.toFixed(1) }));
      ok(r.clubLo > 45 && r.clubHi < 90, 'and the real clubs keep the scale the sim constants expect',
         JSON.stringify({ lo: r.clubLo.toFixed(1), hi: r.clubHi.toFixed(1) }));
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
        /* The Phoenix turns her first strikeout of a game into a walk, and
           a random opponent may well have her, which would silently eat one
           of the seven this counts. Spend the rebirth up front so what is
           under test is the CREDIT, not her quirk. */
        g.phoenixUsed = true;
        const you = g.home;
        const starter = you.batters[0], relief = you.batters[6];
        /* Three strikeouts from the starter. */
        g.inning = 2;
        for (let i = 0; i < 3; i++) { g.outs = 0; recordOut('swinging strikeout', true); }
        /* Then a change, and four from the reliever. */
        g.inning = 6;
        swapToMound(you, 6);
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
        /* Your side goes to the mound once for real, through the same call
           the button uses, so the starter has to have been recorded at the
           top of the game rather than assumed by the box score. The CPU
           rides one arm. */
        swapToMound(g.home, g.home.field[4]);
        finishGame();
        await new Promise(r => setTimeout(r, 400));
        const lines = [...document.querySelectorAll('#app .card p')].map(p => p.textContent).filter(t => /pitch/.test(t));
        return { lines, starter: g.home.batters[0].n,
                 relief: g.home.batters[g.home.field[0]].n, theirs: g.away.batters[0].n,
                 pitched: g.home.pitched };
      });
      const two = r.lines.find(l => /between them/.test(l)) || '';
      const one = r.lines.find(l => !/between them/.test(l)) || '';
      ok(r.lines.length === 2, 'a pitching line per side', JSON.stringify(r.lines));
      ok(r.pitched.length === 2, 'a real in-game change records both arms, starter first', JSON.stringify(r.pitched));
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
        cpu.batters[0] = Object.assign({}, cpu.batters[0], { pit: 40, n: 'Tired Sam' });
        cpu.batters[5] = Object.assign({}, cpu.batters[5], { pit: 99, n: 'The Closer' });
        cpu.arm = {};
        cpuMoundCheck(cpu);
        const early = fielderAt(cpu, 0).n;
        /* Five innings of work on the starter; the rest of the field rested. */
        cpu.arm[cpu.batters[0].k] = 5;
        cpuMoundCheck(cpu);
        const lateName = fielderAt(cpu, 0).n;
        /* Nobody better in the field: it stays put even with a tired arm. */
        const mine = g.home;
        mine.batters = mine.batters.map((b, i) => Object.assign({}, b, { pit: i === 0 ? 95 : 40 }));
        mine.arm = {}; mine.arm[mine.batters[0].k] = 5;
        cpuMoundCheck(mine);
        return { early, lateName, stayed: fielderAt(mine, 0).n, starter: mine.batters[0].n };
      });
      ok(r.early === 'Tired Sam', 'the CPU leaves a fresh arm alone', r.early);
      ok(r.lateName === 'The Closer', 'and goes to its best rested arm once its man tires', JSON.stringify(r));
      ok(r.stayed === r.starter, 'and stays put when nobody in the field is better', JSON.stringify(r));
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
        const wet = { pit: 55 }, ace = { pit: 85 };
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
