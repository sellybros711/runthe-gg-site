#!/usr/bin/env node
/* MythiBall: the rules, replayed.

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
     the room fills up    the clubhouse takes the window and still fits above the fold
     fewer words          settings is headings and choices, and a rule sits behind a dot
     nothing cropped      the close shot still shows both foul lines, every fielder and the stands
     the play moves       the plan's physics agree with the scorer: outs beaten, hits not
     the dive             a liner draws a lunge that lands short and breaks no duty
     the snow             the cold parks play under falling snow
     the books balance     runs, walks and outs agree across the batting and pitching lines
     putting him on       the intentional walk fires late and close, and never anywhere else
     the tag              a caught fly moves a runner, and never on the third out
     the dugout learns    a harder tier chases less and reads a one pitch caller
     the robbery          a catchable hit can be taken away, and missing it costs nothing
     the club remembers   a franchise carries its players' records, not only its win column
     the friendly button  Randomize hands you a mound, and a hand draft is told who is on it
     the picture agrees   no throw beats a safe runner to the bag, and no run outlasts the sim
     the walk back        a strikeout has a frame, and it belongs to the man it happened to
     the coach tells the truth  the first notes a player reads name the controls that exist
     the phone menu       a phone gets four real buttons, and a desktop the room
     the doors open       and pressing one arrives where it says
     turning it sideways  which of the two a window gets follows the window
     the game sideways    a phone held sideways gets a bigger field, not a smaller one
     the plate camera     the at bat is seen from behind the catcher and cut away from on contact
     the bat has a place  a pitch lands somewhere; the swing has to be there as well as on time
     the arm has a spot   aim plus a release is where a pitch goes; a strike is where it landed
     the frames           the swing is three drawings and the delivery has a leg kick
     the ball is the clock  swings and calls land when the ball does, and no hit comes from a taken pitch
     the late break       a held direction bends the pitch, and the umpire calls it where it lands
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
     node mythiball/verify-rules.mjs
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
        out.signs = clubhouseThings().map(t => t.sign);
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
        out.tab = (document.querySelector('.clubtabs .tab') || {}).textContent;
        document.querySelector('.clubtabs .tab').click();
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
      ok(r.menuCards === 0, 'the clubhouse is the home page, with no roster printed under it',
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
         would fail.

         DESKTOP WINDOWS ONLY. A phone gets the button menu instead of the
         room, so a 390 wide case here would be asserting the shape of a
         canvas that is deliberately not on the page. The phone menu has its
         own scenario further down. */
      for (const [w, h] of [[1440, 900], [1280, 800], [1680, 1050], [1024, 768]]) {
        const pg = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(URL);
        await pg.evaluate(() => localStorage.clear());
        await pg.goto(URL);
        const r = await pg.evaluate(() => {
          const el = document.querySelector('.clubhouse canvas');
          const cv = el.getBoundingClientRect();
          const tabs = document.querySelector('.clubtabs').getBoundingClientRect();
          const hots = [...document.querySelectorAll('.clubhouse .hot')]
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
            /* The scene is composed to the shape of the window now, so the
               ratio to keep is the one the layout chose for THIS window. */
            ratio: ROOM.w / ROOM.h,
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
        { /* spray: the swing's timing owns the direction, read against
             the HITTER'S OWN HAND. A lefty pulls the other way, which
             is the point of him, and each mk() advances the lineup, so
             the hand is captured before every sample. */
          const handNow = () => batsLeft(currentBatter().k) ? -1 : 1;
          let h = handNow();
          const early = mk('single', false, { off: -0.085, q: 0.6 }).play.ball.dx * h;
          h = handNow();
          const late  = mk('single', false, { off:  0.085, q: 0.6 }).play.ball.dx * h;
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
      /* THE ZONE IS PRICED OFF THE BATTER, because the two share the frame.
         At 72x98 half-extents the drawn box was taller than the entire
         batter sprite with its top edge a head above his head, and a
         tester called it double his size. Properties, not pixels: the box
         is shorter than the batter, starts below his head, and ends above
         the catcher's crown. Sprites are 40 rows tall at their scale. */
      const z = await pg.evaluate(() => {
        const P = plateGeom();
        /* Sprite boxes at their scales (32 wide, 40 tall, feet-anchored),
           the plate pentagon the ground pass draws at cx, and the rule
           every reference game keeps: nothing opaque between the player
           and the plate. The catcher covered it once, dead-center. */
        const cat = { x0: P.catX - 16 * P.catSc, x1: P.catX + 16 * P.catSc,
                      y0: P.catY - 40 * P.catSc, y1: P.catY };
        const plate = { x0: P.cx - 14, x1: P.cx + 14, y0: 604, y1: 617 };
        const zone = { x0: P.zx - P.zw, x1: P.zx + P.zw, y0: P.zy - P.zh, y1: P.zy + P.zh };
        const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        /* Handedness: a steady share of the roster bats left, decided
           by a hash so it never flips between visits, and the mirrored
           box stays clear of the zone the way the home box does. */
        const L = ROSTER.filter(c => batsLeft(c.k)).length;
        const L2 = ROSTER.filter(c => batsLeft(c.k)).length;
        return { boxH: P.zh * 2, boxTop: P.zy - P.zh, boxBot: P.zy + P.zh,
                 batH: 40 * P.batSc, batTop: P.batY - 40 * P.batSc,
                 catTop: P.catY - 40 * P.catSc,
                 catOnPlate: hits(cat, plate), catOnZone: hits(cat, zone),
                 lefties: L, steady: L === L2, roster: ROSTER.length,
                 leftBoxGap: (2 * P.cx - P.batX - 16 * P.batSc) - (P.zx + P.zw) };
      });
      ok(z.boxH < z.batH, 'the zone is shorter than the batter',
         `zone ${z.boxH} vs batter ${z.batH}`);
      ok(z.boxTop > z.batTop, 'and starts below the top of his head',
         `zone top ${z.boxTop}, batter top ${z.batTop}`);
      ok(z.boxBot < z.catTop, 'and ends above the catcher\'s crown',
         `zone bottom ${z.boxBot}, catcher top ${z.catTop}`);
      ok(!z.catOnPlate, 'the catcher does not cover home plate', JSON.stringify(z));
      ok(!z.catOnZone, 'or any part of the zone', JSON.stringify(z));
      ok(z.steady && z.lefties / z.roster >= 0.15 && z.lefties / z.roster <= 0.45,
         'a steady share of the roster bats left',
         `${z.lefties} of ${z.roster}`);
      ok(z.leftBoxGap > 0, 'and the mirrored box stays clear of the zone',
         `gap ${z.leftBoxGap}`);
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

    /* ---- the ball is the clock ---- */
    {
      console.log('the ball is the clock');
      /* A TESTER WATCHED A BATTER TAKE A PITCH AND LINE A SINGLE. What had
         actually happened: the drawn ball lands at the meter's sweet spot
         and the CPU's swing used to fire at its sampled timing error, up
         to 0.4 of a meter later, so the ball sat visibly in the mitt for
         the best part of a second and then a hit materialised out of
         nothing. The umpire had the same disease: a taken pitch was not
         called until the METER ran out, half a meter after the ball had
         stopped.

         The pitch carries `arrive` now and everything keys off it. What is
         asserted: every CPU swing RESOLVES by shortly after the ball lands
         (early is fine: a whiff out front reads as early), every call
         comes in a fixed beat after it, and across a stack of pitches no
         hit is ever logged without a swing resolving first, which is the
         tester's report stated as an invariant. */
      const { pg, errors } = await fresh(browser);
      const rows = await pg.evaluate(async () => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.opponent = randomOpponent(null); State.innings = 5; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: true });   /* CPU bats */
        await new Promise(r => setTimeout(r, 500));
        const out = [];
        const landMs = (p) => p.windupUntil + p.arrive * p.speed * 1000;
        const _swing = resolveSwing;
        window.resolveSwing = (t, aim) => {
          const p = State.game.pitch;
          if (p) out.push({ ev: 'swing', late: Math.round(performance.now() - landMs(p)),
                            dur: Math.round(p.speed * 1000) });
          return _swing(t, aim);
        };
        const _called = resolveCalledPitch;
        window.resolveCalledPitch = () => {
          const p = State.game.pitch;
          if (p) out.push({ ev: 'call', late: Math.round(performance.now() - landMs(p)),
                            dur: Math.round(p.speed * 1000) });
          return _called();
        };
        const _log = addLog;
        window.addLog = (m, k) => {
          const t = String(m);
          if (/single|double|triple|homer|home run|lines|bloops|drops over/i.test(t)) {
            out.push({ ev: 'hit', m: t.slice(0, 40) });
          }
          return _log(m, k);
        };
        for (let i = 0; i < 16 && State.game && !State.game.over; i++) {
          if (playerIsBatting()) break;
          try { endAtBatCleanup(); State.game.pitch = null; throwPitch(); } catch (e) {}
          await new Promise(r => setTimeout(r, 1900));
        }
        return out;
      });
      const swings = rows.filter(r => r.ev === 'swing');
      const calls = rows.filter(r => r.ev === 'call');
      ok(swings.length >= 3 && calls.length >= 2,
         'enough pitches were seen to say anything',
         `${swings.length} swings, ${calls.length} calls`);
      /* A beat of grace for the timer itself; the disease this catches was
         hundreds of milliseconds wide. */
      ok(swings.every(r => r.late <= 260),
         'every swing resolves by the time the ball is barely down',
         'worst ' + Math.max(...swings.map(r => r.late)) + 'ms after landing');
      ok(calls.every(r => r.late >= 60 && r.late <= 0.30 * r.dur + 220),
         'every call comes a beat after the mitt, not at the meter\'s end',
         JSON.stringify(calls.map(r => r.late)));
      /* The report itself: a hit with no swing in front of it. */
      let lastSwingIdx = -99;
      let orphan = null;
      rows.forEach((r, i) => {
        if (r.ev === 'swing') lastSwingIdx = i;
        if (r.ev === 'hit' && i - lastSwingIdx > 3) orphan = r;
      });
      ok(!orphan, 'no hit ever arrives without a swing resolving first',
         orphan ? JSON.stringify(orphan) : '');
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the late break ---- */
    {
      console.log('the late break');
      /* R.B.I. Baseball's pitching verb, ported: after the release, a held
         direction leans the pitch, as far as the arm's budget allows. Two
         claims are load bearing enough to pin. The steer has to actually
         move the ball, because a budget of zero or a loop that never
         applies it is the mechanic silently gone, with the buttons still
         wired and nothing thrown. And the umpire has to call the pitch
         where it LANDED: isStrike is stamped at release, so a strike
         steered off the plate that still came up STRIKE would make the
         verb a lie in the one case a player reaches for it. The CPU swing
         is stubbed out so every pitch is taken. */
      const { pg, errors } = await fresh(browser);
      const out = await pg.evaluate(async () => {
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
        State.opponent = randomOpponent(null); State.innings = 5; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: true });   /* CPU bats, you pitch */
        await new Promise(r => setTimeout(r, 500));
        window.scheduleCpuSwing = () => {};                 /* every pitch is taken */
        const res = {};
        /* Pitch one: hold right, read what the flight did with it. */
        endAtBatCleanup(); State.game.pitch = null; throwPitch();
        State.game.steerHeld = 1;
        await new Promise(r => setTimeout(r, 2600));
        {
          const p = State.game.pitch;
          res.steer = p ? p.steer : null;
          res.steerMax = p ? p.steerMax : null;
          res.moved = p ? p.loc.x - p.baseLocX : null;
        }
        /* Pitch two: a release-time strike, steered off the plate. */
        endAtBatCleanup(); State.game.pitch = null; throwPitch();
        {
          const p = State.game.pitch;
          p.isStrike = true;
          p.baseLocX = 0.92; p.loc.x = 0.92; p.loc.y = 0;
          State.game.steerHeld = 1;
          res.balls0 = State.game.balls; res.strikes0 = State.game.strikes;
          await new Promise(r => setTimeout(r, 2600));
          res.finX = p.loc.x;
          res.balls1 = State.game.balls; res.strikes1 = State.game.strikes;
        }
        return res;
      });
      ok(out.steerMax > 0.05, 'the arm has a real budget', 'steerMax ' + out.steerMax);
      ok(out.steer > 0.05, 'holding a direction bends the pitch', 'steer ' + out.steer);
      ok(out.moved > 0.05, 'and the drawn ball moves with it', 'moved ' + out.moved);
      ok(out.finX > 1, 'the steered pitch finished off the plate', 'finX ' + out.finX);
      ok(out.balls1 === out.balls0 + 1 && out.strikes1 === out.strikes0,
         'a strike at release, steered out, is called a BALL where it landed',
         `balls ${out.balls0}->${out.balls1}, strikes ${out.strikes0}->${out.strikes1}`);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the books balance ---- */
    {
      console.log('the books balance');
      /* THE BOX SCORE HELD FIVE COUNTERS and so could not answer the
         first question anybody asks a baseball game, which is what a
         man is hitting. Every column here is produced by play the game
         already simulated and was being dropped at the end of the at
         bat. What makes a box score trustworthy is not any single
         number, it is that the numbers AGREE: runs credited to batters
         must equal the scoreboard, runs charged to pitchers must equal
         it too, and a walk drawn by one side is a walk issued by the
         other. A column that only ever grows on its own can drift for a
         season without anybody noticing.

         Driven through the real mutation functions, which is where every
         play path on the page ends up. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(() => {
        const g = State.game;
        const realTimeout = window.setTimeout;
        window.setTimeout = () => 0;
        const bat = () => currentBatter();
        const put = (i, c) => { g.bases[i] = c; };
        const before = g.away.score + g.home.score;
        try {
          applyHitMutation('home run', bat());
          applyHitMutation('single', bat());
          applyHitMutation('double', bat());
          put(0, ROSTER[20]); put(1, ROSTER[21]); put(2, ROSTER[22]); recordWalk();
          g.bases = [null, null, null]; recordWalk();
          recordOut('swinging strikeout', true);
          applyOutMutation('fly out', bat());
          applyOutMutation('ground out', bat());
          g.outs = 0; applyHitMutation('triple', bat());
          g.bases = [null, null, ROSTER[23]]; applyOutMutation('bunt out', bat());
        } catch (e) { window.setTimeout = realTimeout; return { threw: String(e) }; }
        window.setTimeout = realTimeout;
        const sum = (o) => Object.values(o || {}).reduce((a, c) => a + c, 0);
        return {
          delta: (g.away.score + g.home.score) - before,
          runs: sum(g.stats.r), rbi: sum(g.stats.rbi), ab: sum(g.stats.ab),
          h: sum(g.stats.hits), bb: sum(g.stats.bb), hr: sum(g.stats.hr),
          d: sum(g.stats.d), t: sum(g.stats.t),
          pOuts: sum(g.pit.outs), pRuns: sum(g.pit.runs), pBB: sum(g.pit.bb),
        };
      });
      ok(!r.threw, 'the whole inning plays without throwing', r.threw || '');
      ok(r.runs === r.delta, 'runs credited to batters equal the scoreboard',
         `${r.runs} credited, ${r.delta} on the board`);
      ok(r.pRuns === r.delta, 'runs charged to pitchers equal the scoreboard',
         `${r.pRuns} charged, ${r.delta} on the board`);
      ok(r.bb === r.pBB, 'a walk drawn is a walk issued', `${r.bb} drawn, ${r.pBB} issued`);
      ok(r.rbi > 0 && r.rbi <= r.runs, 'runs batted in are real and never exceed runs',
         `${r.rbi} rbi against ${r.runs} runs`);
      ok(r.pOuts >= 4, 'an out reaches the man who recorded it', 'outs ' + r.pOuts);
      ok(r.h >= r.hr + r.d + r.t, 'extra base hits are a subset of hits',
         `${r.h} hits against ${r.hr}+${r.d}+${r.t}`);
      /* The walk is the one plate appearance that must NOT be an at bat,
         which is the whole reason an average and an on base are two
         different numbers. Two walks were drawn above. */
      ok(r.ab === 8, 'a walk is a plate appearance and not an at bat', 'ab ' + r.ab);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- putting him on ---- */
    {
      console.log('putting him on');
      /* The oldest strategic move in the sport, and neither dugout could
         express it: with first base open and the tying run at second,
         every manager alive walks the slugger, and both sides here were
         forced to pitch to him.

         What is asserted is the RULE, across the situations that decide
         it, because a free baserunner handed out at the wrong moment is
         worse than never handing one out at all. One book for both
         dugouts: the CPU and the player's own button ask the same
         function, so they can never drift into managing differently. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(() => {
        const g = State.game;
        const slug = ROSTER.find(c => c.pow >= 90);
        const weak = ROSTER.slice().sort((a, b) => a.pow - b.pow)[0];
        /* bases: which bags are occupied; scores from the FIELDING side */
        const at = (inn, bases, fieldScore, batScore, batter) => {
          g.inning = inn; g.innings = 9; g.half = 'top';
          g.bases = bases.map(x => x ? ROSTER[20] : null);
          g.home.score = fieldScore; g.away.score = batScore;
          return walkWorthIt(g, batter);
        };
        const out = {
          classic:    at(9, [0,1,0], 3, 3, slug),
          firstTaken: at(9, [1,1,0], 3, 3, slug),
          nobodyOn:   at(9, [0,0,0], 3, 3, slug),
          early:      at(2, [0,1,0], 3, 3, slug),
          blowout:    at(9, [0,1,0], 12, 3, slug),
          wayBehind:  at(9, [0,1,0], 1, 8, slug),
          weakBat:    at(9, [0,1,0], 3, 3, weak),
        };
        /* And the act itself, through the real path: the man reaches
           first, the walk is on the books, and it is charged to the arm. */
        const realTimeout = window.setTimeout; window.setTimeout = () => 0;
        g.inning = 9; g.half = 'top';
        g.bases = [null, ROSTER[20], null];
        g.home.score = 3; g.away.score = 3;
        const who = currentBatter();
        const bbBefore = (g.stats.bb[who.k] | 0);
        issueIntentionalWalk();
        window.setTimeout = realTimeout;
        out.reached = !!(g.bases[0] && g.bases[0].k === who.k);
        out.onTheBooks = (g.stats.bb[who.k] | 0) === bbBefore + 1;
        out.chargedToArm = Object.values(g.pit.bb).reduce((a, c) => a + c, 0) > 0;
        out.notAnAtBat = !(g.stats.ab[who.k] | 0);
        return out;
      });
      ok(r.classic, 'ninth, tied, tying run on second, slugger up: put him on', String(r.classic));
      ok(!r.firstTaken, 'never with first base occupied', String(r.firstTaken));
      ok(!r.nobodyOn, 'never with nobody in scoring position', String(r.nobodyOn));
      ok(!r.early, 'never in the second inning', String(r.early));
      ok(!r.blowout, 'never with a big lead', String(r.blowout));
      ok(!r.wayBehind, 'never when well behind', String(r.wayBehind));
      ok(!r.weakBat, 'never for a hitter with no power', String(r.weakBat));
      ok(r.reached, 'the walk puts him on first', String(r.reached));
      ok(r.onTheBooks && r.chargedToArm, 'and it lands on both sides of the books',
         `drawn ${r.onTheBooks}, charged ${r.chargedToArm}`);
      ok(r.notAnAtBat, 'an intentional walk is still not an at bat', String(r.notAnAtBat));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the tag ---- */
    {
      console.log('the tag');
      /* THE SACRIFICE FLY DID NOT EXIST. A fly ball caught with a man on
         third and one out simply ended the at bat, so the one play in
         baseball where making an out scores a run, and a real share of
         how runs actually score, was missing.

         The rule everything here protects is the last one: a tag that
         becomes the third out scores NOTHING. Get that wrong and the
         scoreboard gains runs the inning never earned, which no other
         check would catch because the run is perfectly well formed.

         It reuses the send and hold toggle rather than adding a control,
         so what is asserted is that all three settings mean something
         different on the same play. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, false);
      const r = await pg.evaluate(() => {
        const g = State.game;
        const realTimeout = window.setTimeout; window.setTimeout = () => 0;
        const realRandom = Math.random;
        const fast = ROSTER.slice().sort((a, b) => b.spd - a.spd)[0];
        const slow = ROSTER.slice().sort((a, b) => a.spd - b.spd)[0];
        const run = (outsBefore, bases, rule, roll) => {
          g.outs = outsBefore; g.bases = bases.slice();
          g.sendRule = rule; g.away.score = 0; g.home.score = 0;
          Math.random = () => roll;
          applyOutMutation('fly out', currentBatter());
          return { outs: g.outs, scored: g.away.score + g.home.score,
                   onThird: !!g.bases[2] };
        };
        const out = {
          sacFly:      run(1, [null, null, fast], 'auto', 0.01),
          thrownOut:   run(1, [null, null, fast], 'auto', 0.99),
          inningOver:  run(2, [null, null, fast], 'auto', 0.01),
          held:        run(1, [null, null, fast], 'hold', 0.01),
          slowStays:   run(1, [null, null, slow], 'auto', 0.01),
          slowSent:    run(1, [null, null, slow], 'send', 0.01),
          secondUp:    run(1, [null, fast, null], 'auto', 0.01),
          stacked:     run(0, [null, fast, fast], 'auto', 0.01),
        };
        window.setTimeout = realTimeout; Math.random = realRandom;
        return out;
      });
      ok(r.sacFly.scored === 1 && r.sacFly.outs === 2,
         'a fly with one out and a fast man on third is a sacrifice fly', JSON.stringify(r.sacFly));
      ok(r.thrownOut.scored === 0 && r.thrownOut.outs === 3,
         'and a tag beaten by the throw is an out, not a run', JSON.stringify(r.thrownOut));
      ok(r.inningOver.scored === 0 && r.inningOver.onThird,
         'NOBODY TAGS ON THE THIRD OUT: the inning is over, the run does not count',
         JSON.stringify(r.inningOver));
      ok(r.held.scored === 0 && r.held.onThird, 'HOLD keeps him at third', JSON.stringify(r.held));
      ok(r.slowStays.scored === 0 && r.slowStays.onThird,
         'AUTO does not send a man who cannot make it', JSON.stringify(r.slowStays));
      ok(r.slowSent.scored === 1, 'SEND sends him anyway', JSON.stringify(r.slowSent));
      ok(r.secondUp.onThird && r.secondUp.scored === 0,
         'a man on second tags to third rather than home', JSON.stringify(r.secondUp));
      ok(r.stacked.scored === 1 && r.stacked.onThird,
         'with two aboard the lead man scores and the other takes third',
         JSON.stringify(r.stacked));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the dugout learns ---- */
    {
      console.log('the dugout learns');
      /* DIFFICULTY ONLY EVER CHANGED THE PLAYER'S HALF. Speed, sweet spot
         width and pitcher skill are all about swinging a bat, so somebody
         who picked hard and went out to pitch met exactly the same dugout
         they met on easy. The tier now also decides what that dugout
         KNOWS: whether it chases, and whether it remembers.

         Both are invisible by construction, which is why they are
         measured rather than read. A dugout that stopped chasing
         altogether, or one that read a pattern nobody was throwing,
         renders perfectly and breaks nothing.

         The two properties that matter are opposites of each other:
         discipline must touch ONLY pitches out of the zone (a harder
         dugout is not a quieter one, it is a pickier one), and the
         pattern read must fire only on pitches somebody CHOSE. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);           /* the CPU bats, the player pitches */
      const r = await pg.evaluate(() => {
        const g = State.game;
        const realTimeout = window.setTimeout;
        const realResolve = window.resolveSwing;
        const realPlan = window.cpuBatPlan;
        let last = null;
        window.setTimeout = (fn) => { fn(); return 0; };
        window.resolveSwing = (t, aim) => { last = { t, aim }; };
        window.cpuBatPlan = () => 'normal';   /* a bunt is a decision already made */

        const even = ['fastball', 'curveball', 'changeup', 'heat',
                      'fastball', 'curveball', 'changeup', 'heat',
                      'fastball', 'curveball', 'changeup', 'heat'];
        const oneNote = new Array(20).fill('fastball');

        /* One cell: N pitches at one spot, one tier, one book. */
        const sweep = (tier, x, y, inZone, mix, N) => {
          State.difficulty = tier;
          g.mix = mix ? mix.slice() : null;
          let swings = 0, offBy = 0, wide = 0;
          for (let i = 0; i < N; i++) {
            g.outs = 0; g.balls = 0; g.strikes = 0;
            g.batterCtx.weakPitch = 'nothing';
            g.batterCtx.readSaid = true;      /* the line is asserted on its own below */
            const p = { pt: 'fastball', speed: 1.4, ideal: 0.5, arrive: 0.5,
                        isStrike: inZone, loc: { x, y }, zoneAim: null,
                        windupUntil: performance.now() - 1400,
                        swung: false, resolved: false };
            g.pitch = p; last = null;
            scheduleCpuSwing();
            if (last) {
              swings++;
              offBy += Math.abs(last.t - p.ideal);
              wide += Math.hypot(last.aim.x - x, last.aim.y - y);
            }
          }
          return { swing: 100 * swings / N,
                   offBy: swings ? offBy / swings : 0,
                   wide: swings ? wide / swings : 0 };
        };

        const N = 500;
        const out = {
          /* discipline: a ball well off the plate */
          chaseEasy:   sweep('easy',   1.9, 0, false, even, N).swing,
          chaseMed:    sweep('medium', 1.9, 0, false, even, N).swing,
          chaseHard:   sweep('hard',   1.9, 0, false, even, N).swing,
          /* and a strike down the middle, which no tier may duck */
          zoneEasy:    sweep('easy',   0, 0, true, even, N).swing,
          zoneHard:    sweep('hard',   0, 0, true, even, N).swing,
          /* memory: the same pitch, an honest book against a one note one */
          mixed:       sweep('hard', 0, 0, true, even, N),
          patterned:   sweep('hard', 0, 0, true, oneNote, N),
          easyPattern: sweep('easy', 0, 0, true, oneNote, N),
        };

        window.setTimeout = realTimeout;
        window.resolveSwing = realResolve;
        window.cpuBatPlan = realPlan;

        /* The reader itself, on books it can be handed. */
        out.readEven = patternRead({ mix: even }, 'fastball');
        out.readShort = patternRead({ mix: ['fastball', 'fastball', 'fastball'] }, 'fastball');
        out.readAll = patternRead({ mix: oneNote }, 'fastball');
        out.readOther = patternRead({ mix: oneNote }, 'curveball');

        /* And what goes in the book: an arm nobody steers writes nothing. */
        g.mix = null;
        endAtBatCleanup(); g.pitch = null; throwPitch();
        out.unsteeredWrote = (g.mix || []).length;
        endAtBatCleanup(); g.pitch = null; throwPitch('curveball');
        out.chosenWrote = (g.mix || []).length;
        /* The window is a window, not a season. */
        for (let i = 0; i < 60; i++) { endAtBatCleanup(); g.pitch = null; throwPitch('heat'); }
        out.windowCap = (g.mix || []).length;

        /* And the player is told, once for this hitter. THE LINE IS TIED
           TO A SWING, on purpose: it sits below the take branch, because
           what the read buys is how he squares the ball up and a hitter
           who let the pitch go has not shown you anything. So the roll
           is pinned here rather than left to chance, or this assertion
           is a coin flip on whether he offered at it. */
        g.mix = oneNote.slice();
        State.difficulty = 'hard';
        g.batterCtx.readSaid = false;
        const realRandom = Math.random;
        Math.random = () => 0.01;             /* he swings */
        const before = g.log.length;
        window.setTimeout = () => 0;
        g.pitch = { pt: 'fastball', speed: 1.4, ideal: 0.5, arrive: 0.5, isStrike: true,
                    loc: { x: 0, y: 0 }, zoneAim: null,
                    windupUntil: performance.now(), swung: false, resolved: false };
        scheduleCpuSwing();
        const lines = (from) => g.log.slice(from).map(e => e.text).join(' ');
        const said = lines(before);
        const beforeAgain = g.log.length;
        g.pitch.swung = false;
        scheduleCpuSwing();
        const saidAgain = lines(beforeAgain);
        Math.random = realRandom;
        window.setTimeout = realTimeout;
        out.said = /sitting on/i.test(said);
        out.saidTwice = /sitting on/i.test(saidAgain);
        return out;
      });
      ok(r.chaseEasy > r.chaseMed && r.chaseMed > r.chaseHard,
         'a harder dugout chases less',
         `easy ${r.chaseEasy.toFixed(1)}, medium ${r.chaseMed.toFixed(1)}, hard ${r.chaseHard.toFixed(1)}`);
      ok(r.chaseEasy - r.chaseHard > 8,
         'and the gap is one a player would feel, not a rounding error',
         `${(r.chaseEasy - r.chaseHard).toFixed(1)} points`);
      ok(r.chaseHard > 3,
         'a hard dugout is still a dugout: it does not stop swinging at balls entirely',
         r.chaseHard.toFixed(1));
      ok(Math.abs(r.zoneEasy - r.zoneHard) < 8,
         'DISCIPLINE IS NOT SILENCE: a strike draws the same swings on every tier',
         `easy ${r.zoneEasy.toFixed(1)}, hard ${r.zoneHard.toFixed(1)}`);
      ok(r.readEven === 0, 'an honest mix reads as no pattern at all', String(r.readEven));
      ok(r.readShort === 0, 'and three pitches is not yet a pattern', String(r.readShort));
      ok(r.readAll > 0.9 && r.readOther === 0,
         'a book of nothing but fastballs reads as a fastball pattern and no other',
         `${r.readAll} / ${r.readOther}`);
      ok(r.patterned.offBy < r.mixed.offBy * 0.9,
         'a pitch the dugout is sitting on is timed closer',
         `${r.patterned.offBy.toFixed(3)} against ${r.mixed.offBy.toFixed(3)}`);
      ok(r.patterned.wide < r.mixed.wide * 0.97,
         'and the barrel starts nearer it, which is what sitting on a pitch buys',
         `${r.patterned.wide.toFixed(3)} against ${r.mixed.wide.toFixed(3)}`);
      ok(r.easyPattern.offBy > r.patterned.offBy,
         'an easy dugout barely notices the same pattern',
         `${r.easyPattern.offBy.toFixed(3)} against ${r.patterned.offBy.toFixed(3)}`);
      ok(r.unsteeredWrote === 0,
         'AN ARM NOBODY STEERS WRITES NOTHING: there is no pattern in a random draw',
         String(r.unsteeredWrote));
      ok(r.chosenWrote === 1, 'a pitch somebody called goes in the book', String(r.chosenWrote));
      ok(r.windowCap === 20, 'and the book is a rolling window, not a season', String(r.windowCap));
      ok(r.said && !r.saidTwice,
         'the hitter says he is sitting on it, once, so the caller knows to mix',
         `${r.said} / ${r.saidTwice}`);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the robbery ---- */
    {
      console.log('the robbery');
      /* THE DEFENCE HAD NO PLAY TO MAKE. Both fielding windows this game
         had fire only on a ball ALREADY labelled an out, so the only
         thing either could do was lose it. A hit was automatic and the
         fielding side watched it land. That is backwards from the sport
         and from every baseball game there is: the thrill of fielding is
         taking a hit away from somebody.

         What made it fixable is that the sim already knew. Measured over
         900 balls in play, 96 of 219 hits land where a fielder could
         already be standing. The hit rate itself is about right, so that
         is not the game playing wrong: it is the GEOMETRY and the
         OUTCOME disagreeing, because the trajectory decides the result
         at contact and the fielders are animated on afterwards.

         Two properties carry the whole design and they pull opposite
         ways, so both are asserted here. The gate is PHYSICS, never a
         roll: you cannot rob what nobody could reach. And a miss costs
         NOTHING: the hit stands exactly as it was, which is what makes
         this a chance rather than a tax, and the opposite of what the
         other two windows do. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);           /* the player is in the field */

      /* One ball, aimed by hand. The trajectory is stubbed so the ball
         goes where the test wants it rather than where a random spray
         puts it; everything downstream of it is the real machinery. */
      const setup = async (opts) => pg.evaluate((o) => {
        const g = State.game;
        g.outs = 0; g.bases = [null, null, null];
        g.away.score = 0; g.home.score = 0;
        window.__robOpened = 0;
        const G = fieldGeom();
        /* aim it at a real fielder's post, converted back through the
           same projection the sim uses */
        const post = fielderPosts(G, G.w).find(q => q.i === o.post);
        const dx = (post.x - (G.cx - 14)) / G.r;
        const dy = (post.y - G.cy) / G.r;
        window.__realTraj = window.__realTraj || ballTrajectory;
        window.ballTrajectory = () => ({ dx, dy, duration: 2200, arcH: o.arcH, rollK: 1 });
        const _open = window.startRobWindow;
        window.__realOpen = window.__realOpen || _open;
        window.startRobWindow = (...a) => { window.__robOpened++; return window.__realOpen(...a); };
        scheduleContactPlay(o.kind, currentBatter(), { q: 0.7 });
      }, opts);

      const restore = async () => pg.evaluate(() => {
        if (window.__realTraj) window.ballTrajectory = window.__realTraj;
        if (window.__realOpen) window.startRobWindow = window.__realOpen;
      });

      /* Wait for the window, then press it dead centre. */
      const pressIt = async () => pg.evaluate(() => new Promise((done) => {
        const t0 = Date.now();
        const tick = () => {
          const g = State.game;
          if (g && g.play && g.play.catchActive && g.play.catchWindow) {
            const w = g.play.catchWindow;
            const at = w.startedAt + w.duration * 0.5;
            const wait = Math.max(0, at - performance.now());
            setTimeout(() => { document.body.click(); done(true); }, wait);
            return;
          }
          if (Date.now() - t0 > 4000) return done(false);
          setTimeout(tick, 20);
        };
        tick();
      }));

      const readOut = async () => pg.evaluate(() => {
        const g = State.game;
        return { outs: g.outs, onFirst: !!g.bases[0], onSecond: !!g.bases[1],
                 onThird: !!g.bases[2], opened: window.__robOpened,
                 kind: g.play ? g.play.kind : null,
                 robbed: g.play ? g.play.robbed || null : null };
      });

      /* 1. a deep fly straight at the centre fielder, pressed */
      await setup({ kind: 'double', post: 7, arcH: 200 });
      const pressed = await pressIt();
      await wait(pg, 900);
      const robbed = await readOut();
      /* EACH CASE WAITS OUT THE LAST ONE. A play keeps a finish timer
         that nulls g.play and moves the batter along, so a second ball
         hit 700ms later is torn down by the first one's own clock and
         reports a window that never opened. That cost a round. */
      await wait(pg, 2600);

      /* 2. the same ball, left alone */
      await setup({ kind: 'double', post: 7, arcH: 200 });
      await wait(pg, 3000);
      const ignored = await readOut();
      await wait(pg, 1200);

      /* 3. the same spot, no hang time: there is nothing to rob */
      await setup({ kind: 'single', post: 7, arcH: 20 });
      await wait(pg, 1400);
      const grounder = await readOut();
      await wait(pg, 1800);

      /* 4. a ball hit well over the centre fielder's head. The first
         draft of this case aimed into the gap with a two second hang
         time and the gate correctly said YES, because a fielder can jog
         to a ball that stays up that long. Out of reach is about time,
         not about distance: same hang time, more than twice as deep. */
      const nobody = await pg.evaluate(() => {
        const G = fieldGeom();
        const post = fielderPosts(G, G.w).find(q => q.i === 7);
        const traj = { dx: (post.x - (G.cx - 14)) / G.r * 2.4,
                       dy: (post.y - G.cy) / G.r * 2.4,
                       duration: 2200, arcH: 200, rollK: 1 };
        const p = { kind: 'triple', batter: currentBatter(), isOut: false, ball: traj,
                    startedAt: performance.now(), preBases: [null, null, null],
                    batterPath: batterPathIndices('triple'), runnerPaths: [null,null,null],
                    applied: false };
        const sim = buildPlaySim(p);
        return { on: robberyOn(sim, traj, 'triple'), slack: sim.robSlack };
      });

      /* 5. and it never fires on the half the player is batting */
      await restore();
      await exhibition(pg, false);
      await setup({ kind: 'double', post: 7, arcH: 200 });
      await wait(pg, 3200);
      const batting = await readOut();
      await restore();

      ok(pressed, 'the window opened and could be pressed', String(pressed));
      ok(robbed.opened === 1, 'a catchable hit opens exactly one window', String(robbed.opened));
      ok(robbed.outs === 1 && !robbed.onFirst && !robbed.onSecond,
         'pressing it turns the hit into an out, and nobody is on base',
         JSON.stringify(robbed));
      ok(ignored.opened === 1 && ignored.outs === 0 && ignored.onSecond,
         'MISSING IT COSTS NOTHING: the double is still a double',
         JSON.stringify(ignored));
      ok(grounder.opened === 0,
         'a ball with no hang time offers no window: you cannot rob a grounder',
         JSON.stringify(grounder));
      ok(nobody.on === false,
         'THE GATE IS PHYSICS: a ball into the gap nobody could reach offers nothing',
         JSON.stringify(nobody));
      ok(batting.opened === 0,
         'and the side at bat is never offered its own robbery',
         JSON.stringify(batting));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the club remembers ---- */
    {
      console.log('the club remembers');
      /* A CLUB HERE REMEMBERED ONLY ITS WIN COLUMN. It has a city, a
         nickname, a park with an effect, a record book and a Retire the
         club button, and all of that promises continuity; what actually
         carried between years was W-L, because perPlayer is per season
         and seasonLine keeps year, record, rank and the title. So you
         could draft somebody in year one, watch him hit twelve, re-draft
         him in year two, and the game had no memory that he had ever
         played for you. That is what made a redraft read as a reset.

         IDEMPOTENCE IS THE LOAD-BEARING PROPERTY and it is not obvious
         why. The draft for year N+1 happens BEFORE startSeason folds
         anything, so the numbers a player reads while picking would
         otherwise be a year out of date. foldCareers is pure over
         (careers, perPlayer, team, year) and never touches its argument,
         so drawing a screen with it and starting a year with it give the
         same answer. Get that wrong and every re-signed player's record
         doubles, silently, on a screen nobody would think to check. */
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const team = ROSTER.slice(0, 9).map(c => c.k);
        const bench = team[8];          /* on the club, never at the plate */
        const star = team[0], arm = team[1];
        const yearOne = {
          year: 1, team: team.slice(), careers: {},
          perPlayer: {
            [star]: { hr: 7, hits: 20, ab: 60, sb: 3, rbi: 14 },
            [arm]:  { hr: 0, hits: 4, ab: 20, pOuts: 39, pRuns: 8 },
          },
        };
        const c1 = foldCareers(yearOne);
        const c1again = foldCareers(yearOne);
        /* year two keeps the star and lets the arm go */
        const yearTwo = {
          year: 2, team: [star, ROSTER[9].k].concat(team.slice(2, 9)), careers: c1,
          perPlayer: { [star]: { hr: 5, hits: 18, ab: 55, sb: 1, rbi: 11 } },
        };
        const c2 = foldCareers(yearTwo);
        return {
          starY1: c1[star], benchY1: c1[bench],
          idempotent: JSON.stringify(c1) === JSON.stringify(c1again),
          untouched: JSON.stringify(yearOne.careers) === '{}',
          starY2: c2[star], armY2: c2[arm],
          line: careerLine(c2[star]),
          armLine: careerLine(c1[arm]),
          benchLine: careerLine(c1[bench]),
        };
      });
      /* and what a drafter actually sees */
      const draft = await pg.evaluate(() => {
        const team = ROSTER.slice(0, 9).map(c => c.k);
        State.pendingFranchise = {
          year: 1, team: team.slice(), careers: {},
          perPlayer: { [team[0]]: { hr: 7, hits: 20, ab: 60, sb: 3, rbi: 14 } },
        };
        State.mode = 'season'; State.screen = 'roster'; render();
        const cards = [...document.querySelectorAll('.charcard')];
        const first = cards.find(c => (c.querySelector('.name') || {}).textContent
                                      === (ROSTER_BY_KEY[team[0]] || {}).n);
        return { cards: cards.length,
                 yours: cards.filter(c => c.querySelector('.quirk.yours')).length,
                 firstHasLine: !!(first && first.querySelector('.quirk.yours')) };
      });
      const brandNew = await pg.evaluate(() => {
        State.pendingFranchise = null; State.season = null;
        State.mode = 'season'; State.screen = 'roster'; render();
        return document.querySelectorAll('.quirk.yours').length;
      });
      ok(r.starY1 && r.starY1.years === 1 && r.starY1.hr === 7,
         'a finished year folds into the club book', JSON.stringify(r.starY1));
      ok(r.benchY1 && r.benchY1.years === 1 && !r.benchY1.ab,
         'A YEAR IS COUNTED OFF THE ROSTER: a man who never batted still spent the season here',
         JSON.stringify(r.benchY1));
      ok(r.idempotent, 'FOLDING TWICE GIVES THE SAME ANSWER, which is what lets the draft screen read it',
         String(r.idempotent));
      ok(r.untouched, 'and it never mutates what it was handed', String(r.untouched));
      ok(r.starY2 && r.starY2.years === 2 && r.starY2.hr === 12,
         'a second year adds to the first', JSON.stringify(r.starY2));
      ok(r.armY2 && r.armY2.years === 1,
         'and a man you let go keeps his record and stops adding to it', JSON.stringify(r.armY2));
      ok(/2 years here/.test(r.line) && /12 HR/.test(r.line),
         'the line on his card reads as a career', r.line);
      ok(/IP/.test(r.armLine), 'an arm is described in innings, not in at bats', r.armLine);
      ok(r.benchLine === '1 year here',
         'and a man with nothing to show gets no row of zeros pretending to be a record',
         r.benchLine);
      ok(draft.yours === 9 && draft.firstHasLine,
         'the draft screen marks every man who wore the shirt', JSON.stringify(draft));
      ok(draft.cards > 9 && draft.yours < draft.cards,
         'and leaves the rest of the board alone', JSON.stringify(draft));
      ok(brandNew === 0, 'a brand new franchise is unmarked, exactly as it always was',
         String(brandNew));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the friendly button ---- */
    {
      console.log('the friendly button');
      /* THE SAFE PATH WAS THE WORST PATH. Randomize is what somebody
         presses who does not want to read sixty-eight cards, which makes
         it the first thing a new player touches. It shuffled the ORDER
         as well as the nine, and the first pick starts on the mound, so
         the man it put there was a coin toss.

         Measured over 4000 draws before the fix: 52% opened with an arm
         under 55 PIT while the same nine held a median best of 74.
         Ordering alone threw away 27 points, and the only symptom was a
         bad first game with nothing on screen to explain it. Nothing
         could have caught that, because a random draft is a valid
         draft.

         The nine are still random. Only the order changes. */
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(async () => {
        const out = { runs: 0, mismatch: 0, weak: 0, starters: [] };
        for (let i = 0; i < 40; i++) {
          State.mode = 'exhibition'; State.screen = 'roster'; State.team = []; render();
          const rand = [...document.querySelectorAll('button')]
            .find(b => b.textContent === 'Randomize');
          if (!rand) return { err: 'no Randomize button' };
          rand.click();
          await new Promise(r => setTimeout(r, 340));
          const team = State.team.map(k => ROSTER_BY_KEY[k]);
          if (team.length !== 9 || team.some(c => !c)) return { err: 'team was ' + team.length };
          out.runs++;
          const best = Math.max(...team.map(c => c.pit | 0));
          out.starters.push(team[0].pit | 0);
          if ((team[0].pit | 0) !== best) out.mismatch++;
          if ((team[0].pit | 0) < 55) out.weak++;
          /* and every man it picked has to be one you are allowed */
          if (team.some(c => !isUnlocked(c.k))) return { err: 'drafted a locked character' };
        }
        return out;
      });
      /* And a HAND draft is left alone, but told what it is doing. The
         rule lives behind the info dot, which is the right place for a
         rule and the wrong place for a fact about this draft. */
      const hand = await pg.evaluate(() => {
        State.mode = 'exhibition'; State.screen = 'roster'; State.team = []; render();
        const cards = [...document.querySelectorAll('.charcard')];
        const open = ROSTER.filter(c => isUnlocked(c.k)).slice().sort((a, b) => a.pit - b.pit);
        const worst = open[0], best = open[open.length - 1];
        const find = (c) => cards.find(x => (x.querySelector('.name') || {}).textContent === c.n);
        const read = () => [...document.querySelectorAll('div')].map(d => d.innerHTML)
          .filter(t => /of 9 selected/.test(t)).pop() || '';
        find(worst).click();
        const one = read();
        find(best).click();
        const two = read();
        return { one, two, worst: worst.n, best: best.n, bestPit: best.pit,
                 order: State.team.slice() };
      });
      ok(!r.err, 'forty presses of the real button', r.err || '');
      ok(r.runs === 40 && r.mismatch === 0,
         'RANDOMIZE PUTS THE BEST ARM ON THE MOUND, every time',
         `${r.mismatch} of ${r.runs} started somebody else`);
      ok(r.weak === 0, 'so it never opens with an arm a player would have to lose with',
         `${r.weak} under 55 PIT`);
      ok(Math.min(...(r.starters || [99])) > 40,
         'and the worst mound it can hand out is still a mound',
         String(Math.min(...(r.starters || []))));
      ok(/starting/.test(hand.one) && new RegExp(hand.worst).test(hand.one),
         'a hand draft is told who its first pick puts on the mound', hand.one);
      ok(new RegExp(hand.best).test(hand.two) && /gold/.test(hand.two),
         'and is shown the better arm it already has, without being overruled',
         hand.two);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the picture agrees with the book ---- */
    {
      console.log('the picture agrees');
      /* buildPlaySim's own comment says a hit's throw "gets there just
         after he does: that is what a hit looks like, and it is the
         whole difference between this and an out". Nothing checked it,
         and it was false on 66 of 420 plays.

         TWO FAULTS, and finding the first made the second worse before
         it got better, which is why this asserts a property and not a
         number.

         THE HORIZON. simRunPath reports `reached` as the moment a runner
         touches his bag, and when the loop runs out first it reports the
         END OF THE SIM instead. Home to third is 3.33 diamond units and
         the slowest man runs 0.342 a second, so he needed about 9.9 and
         a nine second horizon reported 9.12 every time. Everything
         downstream trusts that number: the throw is timed against it,
         the close play is read off it, deadAt comes from it.

         THE ONE SIDED GUARD. lateThrow asked only that the fielder not
         HOLD the ball too long and never that the throw not LAND too
         early, so when the runner was further off than the hold allowed,
         the launch clamped and the ball beat him to the bag by whatever
         was left. There were THREE untimed throws in that branch and
         each fix uncovered the next; the last one put the ball on third
         five seconds before the runner, who was called safe standing
         beside it.

         What a player sees when this is wrong is a fielder holding the
         ball on the bag while the runner jogs up and is safe. Nothing
         throws. */
      const { pg, errors } = await fresh(browser);
      await exhibition(pg, true);
      const r = await pg.evaluate(() => {
        const g = State.game;
        const out = { plays: 0, raced: 0, early: [], timedOut: 0, worst: 0 };
        const realTimeout = window.setTimeout; window.setTimeout = () => 0;
        const realLog = window.addLog; window.addLog = () => {};
        const realSchedule = window.scheduleContactPlay;
        window.scheduleContactPlay = (kind, batter, info) => {
          try {
            const inf = Object.assign({}, info, { lefty: batsLeft(batter.k) });
            const traj = ballTrajectory(kind, inf);
            const isOut = kind === 'ground out' || kind === 'fly out' || kind === 'bunt out';
            const p = { kind, batter, isOut, ball: traj, startedAt: performance.now(),
                        preBases: [null, null, null], batterPath: batterPathIndices(kind),
                        runnerPaths: [null, null, null], applied: false };
            const sim = buildPlaySim(p);
            out.plays++;
            /* nobody's run may outlast the horizon */
            for (const rr of sim.runners) {
              if (rr.run.reached >= 0.12 + SIM_MAX_S - 0.05) out.timedOut++;
            }
            const bat = sim.runners.find(rr => rr.isBatter);
            if (!bat) return;
            for (const th of (sim.throws || [])) {
              if (th.base !== bat.toIdx) continue;
              out.raced++;
              /* a SAFE runner must not be beaten to his own bag */
              if (!isOut && th.arrive < bat.run.reached - 0.45) {
                const by = bat.run.reached - th.arrive;
                out.worst = Math.max(out.worst, by);
                if (out.early.length < 5) out.early.push({ kind, by: +by.toFixed(2) });
              }
            }
          } catch (e) { /* a play that cannot build is not a measurement */ }
        };
        for (let i = 0; i < 2400 && out.plays < 400; i++) {
          try {
            g.balls = 0; g.strikes = 0; g.outs = 0; g.bases = [null, null, null];
            if (!g.batterCtx) g.batterCtx = { flags: {} };
            g.batterCtx.weakPitch = 'nothing';
            const loc = { x: (Math.random()*2-1)*0.9, y: (Math.random()*2-1)*0.9 };
            g.pitch = { pt: ['fastball','curveball','changeup','heat'][i%4], speed: 1.4,
                        ideal: 0.5, arrive: 0.5, isStrike: true, loc, zoneAim: null,
                        windupUntil: performance.now()-1400, swung: false, resolved: false };
            resolveSwing(0.5 + (Math.random()*2-1)*0.16,
                         { x: loc.x + (Math.random()*2-1)*0.5, y: loc.y + (Math.random()*2-1)*0.5 });
            if (i % 9 === 0) nextBatter();
          } catch (e) { /* not a measurement */ }
        }
        window.scheduleContactPlay = realSchedule;
        window.setTimeout = realTimeout; window.addLog = realLog;
        /* and the longest leg anybody runs has to fit, stated directly */
        const slow = ROSTER.slice().sort((a, b) => a.spd - b.spd)[0];
        const longest = simRunPath(simRunnerPoints(0, 3), simRunnerSpeed(slow), 0.12, { delay: 0.18 });
        out.longestLeg = +longest.reached.toFixed(2);
        out.horizon = SIM_MAX_S;
        return out;
      });
      ok(r.plays > 200, 'four hundred plays built', String(r.plays));
      ok(r.raced > 50, 'and a good share of them put a throw at the batter\'s bag', String(r.raced));
      ok(r.early.length === 0,
         'NO THROW BEATS A SAFE RUNNER TO HIS OWN BAG',
         `${r.early.length} did, worst by ${r.worst.toFixed(2)}s: ${JSON.stringify(r.early)}`);
      ok(r.timedOut === 0,
         'AND NO RUN OUTLASTS THE SIM: a reached time is an arrival, never a horizon',
         `${r.timedOut} runs ran out of clock`);
      ok(r.longestLeg < r.horizon,
         'the slowest man on the roster gets from first to home inside it',
         `${r.longestLeg}s against a ${r.horizon}s horizon`);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the walk back ---- */
    {
      console.log('the walk back');
      /* A STRIKEOUT IS THE MOST FREQUENT THING THAT HAPPENS TO A HITTER
         and the picture never acknowledged it. The batter reverted to
         his neutral stance and stood in it for the whole afterOut beat,
         so the screen looked the same whether he had just been rung up
         or was waiting on the next pitch.

         The generator is parametric, so a pose is one authored offset
         that all sixty eight inherit rather than sixty eight drawings.
         It costs about 61KB of sprite table, which is what one pose
         across this roster weighs.

         TWO THINGS HERE WERE ONLY FINDABLE BY LOOKING, and a count of
         distinct frames was happy through both. At an eight pixel drop
         the arms hang PAST the shoes and cover them, so a slumping Zeus
         reads as a man with no feet. And a one pixel leg sink, tried to
         give the quadrupeds something, clipped every biped's shoes off
         the bottom of the 50px box while moving exactly one of the seven.
         The arms carry it at five, and a dragon taking a called third
         strike is a dragon standing there. */
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const ks = Object.keys(V2_SPRITES);
        const f = (k) => V2_SPRITES[k].f || {};
        return {
          chars: ks.length,
          have: ks.filter(k => f(k).slump).length,
          /* every batter frame is seen from behind, and this is one */
          rows: ks.filter(k => f(k).slump &&
                  f(k).slump.split('/').length === (f(k).back || '').split('/').length).length,
          /* the ones with arms have to differ from the pose they came from */
          distinct: ks.filter(k => f(k).slump && f(k).slump !== f(k).back).length,
        };
      });
      const moment = await pg.evaluate(async () => {
        Sound.muted = true; PREFS.coach = false; PREFS.cutscenes = false;
        State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'T';
        State.opponent = OPPONENTS[0]; State.innings = 5; State.mode = 'exhibition';
        startGame({ mode: 'exhibition', youHome: false });
        await new Promise(r => setTimeout(r, 700));
        endAtBatCleanup(); State.game.pitch = null;
        const g = State.game;
        g.strikes = 2; g.balls = 0;
        recordOut('called strikeout', true);
        const set = g.slumpUntil > performance.now();
        endAtBatCleanup();
        const cleared = !g.slumpUntil;
        /* a ground out is not a strikeout and gets no slump */
        g.slumpUntil = 0;
        recordOut('ground out', false);
        const onlyK = !g.slumpUntil;
        /* and the phoenix walks rather than slumping: she was not struck out */
        g.batterCtx = { flags: { rebirth: true } }; g.phoenixUsed = false;
        g.strikes = 2; recordOut('swinging strikeout', true);
        const phoenix = !g.slumpUntil;
        return { set, cleared, onlyK, phoenix };
      });
      ok(r.have === r.chars, 'every character has a walk back frame',
         `${r.have} of ${r.chars}`);
      ok(r.rows === r.chars, 'and it is drawn from behind, like every other batter frame',
         `${r.rows} of ${r.chars}`);
      ok(r.distinct >= 60,
         'the ones with arms to drop actually drop them',
         `${r.distinct} of ${r.chars} differ from their own back frame`);
      ok(moment.set, 'a strikeout sets the beat it is shown for', String(moment.set));
      ok(moment.onlyK, 'a ground out does not: he did not strike out', String(moment.onlyK));
      ok(moment.cleared,
         'IT BELONGS TO THE MAN IT HAPPENED TO: the next hitter does not inherit his shoulders',
         String(moment.cleared));
      ok(moment.phoenix, 'and a rebirth walks to first rather than slumping', String(moment.phoenix));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the coach tells the truth ---- */
    {
      console.log('the coach tells the truth');
      /* THE FIRST THING A NEW PLAYER READS SHIPPED WRONG for as long as
         the plate camera has existed. The notes were written for the old
         wide camera, where a ring closed on a fixed target and WHERE you
         clicked meant nothing, and they still said "swing when the
         closing ring meets the green circle: click anywhere". There is
         no closing ring in the batting camera, and where you put the bat
         is the single thing that decides whether you make contact:
         measured through the real SWING button, perfect timing with the
         bat left alone made contact 6 of 10, and the same timing with
         the bat ON the pitch made contact 8 of 8. So the note taught the
         opposite of the mechanic, and a player who followed it exactly
         would whiff and conclude the game was broken.

         No checker could have caught it, because every sentence was
         valid English about a real feature, just the wrong one. What is
         assertable is AGREEMENT: the auto-opening notes and the long How
         To Play page describe one game, and neither teaches a control
         the batting camera does not draw. */
      const { pg, errors } = await fresh(browser);
      const r = await pg.evaluate(() => {
        const bat = COACH.bat.join(' ');
        const pitch = COACH.pitch.join(' ');
        /* what the batting camera actually draws for the player */
        const drawsRing = /drawTimingRing/.test(drawPlateView.toString());
        return {
          bat, pitch, drawsRing,
          /* the control that decides contact has to be named */
          namesTheBat: /oval/i.test(bat) && /(mouse|finger|pointer|arrow)/i.test(bat),
          /* and the thing that does not exist must not be taught */
          teachesRing: /\bring\b/i.test(bat),
          teachesClickAnywhere: /click anywhere/i.test(bat),
          /* the pitching notes name buttons the strip really has */
          throwLabel: !!document.querySelector('#throw-btn'),
          teachesGrid: /on the grid/i.test(pitch),
          /* THE FIELDING HALF. Three windows can open once the ball is
             hit and the notes named none of them for as long as they
             existed. The ring is a real thing HERE, unlike in the
             batting camera above, so naming it is the truth rather than
             the old mistake: drawCatchRing is what draws it. */
          namesFielding: /\bwindow\b/i.test(pitch) && /\bring\b/i.test(pitch),
          saysRobIsFree: /nothing is lost|costs nothing/i.test(pitch),
          drawsCatchRing: typeof drawCatchRing === 'function',
        };
      });
      ok(!r.drawsRing, 'the batting camera draws no closing ring', String(r.drawsRing));
      ok(!r.teachesRing, 'so the notes do not tell a player to watch one', r.bat.slice(0, 120));
      ok(r.namesTheBat, 'they name the oval and what moves it', r.bat.slice(0, 120));
      ok(!r.teachesClickAnywhere, 'and never say place does not matter',
         'the notes still say "click anywhere"');
      ok(!r.teachesGrid, 'the pitching notes do not name a grid that was removed',
         r.pitch.slice(0, 120));
      ok(r.namesFielding, 'they tell the player the ball is theirs once it is hit',
         r.pitch.slice(-160));
      ok(r.drawsCatchRing, 'and the ring they name is one the game really draws',
         String(r.drawsCatchRing));
      ok(r.saysRobIsFree, 'and that missing a robbery costs nothing, or nobody presses it',
         r.pitch.slice(-160));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close();
    }

    /* ---- the phone gets a MENU, not a room ---- */
    {
      console.log('the phone menu');
      /* FIVE GOES AT MAKING A DEPICTED ROOM WORK ON A PHONE IS ENOUGH.

         The room hangs four objects on a wall and floats a sign over each,
         and a rail underneath says what the thing under the pointer does.
         A phone has no pointer, so the rail cannot exist, and what arrived
         was a picture with four labels on it. Every attempt to fix that by
         SIZE failed, because size was never the fault:

           fill the window   the room became a strip over dead card stock
           draw it closer    legible, and still a picture, not a menu
           make them lockers four frames holding a bat rack, a clipboard, a
                             framed photo and a chalkboard, four objects of
                             wildly different real size, above two people as
                             tall as one frame. It stopped depicting anything.

         Four modes need four labels a thumb apart and readable at arm's
         length, and four lockers side by side in 358 CSS pixels are 89 each,
         which does not hold the word EXHIBITION. The room cannot carry this
         screen at phone width and no drawing of it will.

         So a phone gets real buttons with real text, and the clubhouse is a
         strip of floor with the team on it rather than a space the page is
         pretending to be inside. What is asserted here is that it IS a menu:
         one button per mode, each a real target, each named in real type,
         each carrying one line, and the desktop still getting the room. */
      const look = async (w, h, touch) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h },
                                               deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
        const pg = await ctx.newPage();
        const errors = [];
        pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(URL);
        await pg.evaluate(() => localStorage.clear());
        await pg.goto(URL);
        await wait(pg, 700);
        const r = await pg.evaluate(() => {
          const doors = [...document.querySelectorAll('.ph-door')];
          const rect = doors.map(d => d.getBoundingClientRect());
          const nameFs = doors.map(d =>
            parseFloat(getComputedStyle(d.querySelector('b')).fontSize));
          return {
            doors: doors.length,
            room: !!document.querySelector('.clubhouse canvas'),
            strip: !!document.querySelector('.ph-strip'),
            names: doors.map(d => (d.querySelector('b').textContent || '').trim()),
            lines: doors.map(d => (d.querySelector('span').textContent || '').trim().length),
            icons: doors.filter(d => d.querySelector('canvas')).length,
            minTouch: rect.length ? Math.min(...rect.map(b => Math.min(b.width, b.height))) : 0,
            /* even weight: the tallest button against the shortest */
            spread: rect.length ? Math.max(...rect.map(b => b.height)) / Math.min(...rect.map(b => b.height)) : 99,
            width: rect.length ? Math.min(...rect.map(b => b.width)) / innerWidth : 0,
            nameFs: nameFs.length ? Math.min(...nameFs) : 0,
            sideways: document.documentElement.scrollWidth > innerWidth + 1,
            vw: innerWidth,
          };
        });
        r.errors = errors;
        await pg.close(); await ctx.close();
        return r;
      };
      const sizes = [{ w: 390, h: 664, what: 'a phone' },
                     { w: 360, h: 640, what: 'a small phone' },
                     { w: 844, h: 390, what: 'a phone sideways' },
                     { w: 320, h: 1100, what: 'a narrow panel' },
                     { w: 768, h: 1024, what: 'a portrait tablet' }];
      for (const sz of sizes) {
        const r = await look(sz.w, sz.h, true);
        ok(r.doors === 4 && !r.room,
           `${sz.what}: the menu is four buttons, not a drawn room`,
           `${r.doors} buttons, room canvas ${r.room}`);
        ok(r.names.every(v => v.length > 0) && r.icons === 4,
           `${sz.what}: each is named and carries its own art`,
           JSON.stringify(r.names));
        ok(r.lines.every(v => v > 0),
           `${sz.what}: and says in one line what it is`, JSON.stringify(r.lines));
        /* A caption long enough to wrap makes one button twice its
           neighbour's height, which is what the note did before the blurb
           replaced it. */
        ok(r.spread <= 1.25,
           `${sz.what}: and no button towers over the others`,
           'tallest is ' + r.spread.toFixed(2) + 'x the shortest');
        ok(r.minTouch >= 44,
           `${sz.what}: every one is a real touch target`,
           'smallest side ' + Math.round(r.minTouch) + 'px');
        ok(r.width >= 0.8,
           `${sz.what}: and runs the width of the screen`,
           Math.round(r.width * 100) + '% of ' + r.vw);
        /* Real text at a real size, which a canvas could never promise:
           the room's signs came out at six CSS pixels once and nothing in
           the code said so. */
        ok(r.nameFs >= 16,
           `${sz.what}: the names are set in real type`,
           r.nameFs + 'px');
        ok(r.strip, `${sz.what}: the clubhouse is there as a strip`, JSON.stringify(r));
        ok(!r.sideways, `${sz.what}: no sideways scroll`, JSON.stringify(r));
        ok(r.errors.length === 0, `${sz.what}: no page errors`, r.errors.join(' | '));
      }
      /* The desktop keeps the room, which is the screen the rail and the
         wall of objects were designed for. */
      const desk = await look(1280, 860, false);
      ok(desk.doors === 0 && desk.room,
         'a desktop: still gets the clubhouse room', JSON.stringify(desk));
      ok(desk.errors.length === 0, 'a desktop: no page errors', desk.errors.join(' | '));
    }

    /* ---- the buttons go somewhere ---- */
    {
      console.log('the doors open');
      const ctx = await browser.newContext({ viewport: { width: 390, height: 664 },
                                             deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(URL);
      await pg.evaluate(() => localStorage.clear());
      await pg.goto(URL);
      await wait(pg, 700);
      /* HOW TO PLAY is the one door that goes somewhere without asking for
         a roster first, so it is the one to press. */
      const went = await pg.evaluate(async () => {
        const doors = [...document.querySelectorAll('.ph-door')];
        const howto = doors.find(d => /HOW TO PLAY/i.test(d.textContent));
        if (!howto) return { found: false };
        howto.click();
        return { found: true, screen: State.screen };
      });
      ok(went.found, 'the how to play button is there to press', JSON.stringify(went));
      ok(went.screen === 'howto', 'and pressing it arrives at how to play',
         'screen=' + went.screen);
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
      await pg.close(); await ctx.close();
    }

    /* ---- turning the phone sideways ---- */
    {
      console.log('turning it sideways');
      /* WHICH MENU A WINDOW GETS IS DECIDED ONCE PER RENDER, and a rotation
         is not a render. The room used to be what went stale that way, a
         760x1202 scene left in an 844x390 window; now it is the choice
         between the two menus. Same listener, same failure if it goes. */
      const ctx = await browser.newContext({ viewport: { width: 390, height: 664 },
                                             deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(URL);
      await pg.evaluate(() => localStorage.clear());
      await pg.goto(URL);
      await wait(pg, 700);
      const look = () => pg.evaluate(() => ({
        doors: document.querySelectorAll('.ph-door').length,
        room: !!document.querySelector('.clubhouse canvas'),
        over: document.documentElement.scrollWidth - innerWidth,
      }));
      const up = await look();
      await pg.setViewportSize({ width: 844, height: 390 });
      await wait(pg, 700);
      const flat = await look();
      /* and out to a desktop, where the room takes over */
      await pg.setViewportSize({ width: 1280, height: 860 });
      await wait(pg, 700);
      const desk = await look();
      await pg.setViewportSize({ width: 390, height: 664 });
      await wait(pg, 700);
      const again = await look();
      await pg.close(); await ctx.close();

      ok(up.doors === 4, 'held upright, a phone gets the menu', JSON.stringify(up));
      ok(flat.doors === 4 && flat.over <= 1,
         'turned sideways it is still the menu, and still fits',
         JSON.stringify(flat));
      ok(desk.room && desk.doors === 0,
         'stretched to a desktop, the room takes over', JSON.stringify(desk));
      ok(again.doors === 4 && !again.room,
         'and back to a phone gets the menu again', JSON.stringify(again));
      ok(errors.length === 0, 'no page errors', errors.join(' | '));
    }

    /* ---- the game, on a phone held sideways ---- */
    {
      console.log('the game sideways');
      /* The game screen is a stack: park, line score, field, count, buttons,
         play by play. A 390 tall window cannot hold that stack, and the
         FIELD was the thing that paid, because its width is derived from a
         height budget written for an upright phone: 100vh less 265 pixels
         of furniture. Sideways that left 125 pixels, so an 844 wide window
         drew a 182 wide field, the placards positioned on its corners grew
         into each other, and the page scrolled anyway.

         Sideways is not short of width, it is short of height. The
         furniture goes beside the field there. What is asserted is the
         outcome rather than the mechanism: the field is bigger sideways
         than upright, both it and the button you press are on the screen
         without scrolling, and nothing on the field has grown into
         anything else. */
      const shot = async (w, h) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h },
                                               deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        const pg = await ctx.newPage();
        const errors = [];
        pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(URL);
        await pg.evaluate(() => localStorage.clear());
        await pg.goto(URL);
        await wait(pg, 500);
        await pg.evaluate(() => {
          Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
          State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Testers';
          State.opponent = randomOpponent(null); State.innings = 5; State.mode = 'exhibition';
          startGame({ mode: 'exhibition', youHome: false });
        });
        await wait(pg, 900);
        const r = await pg.evaluate(() => {
          const R = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
          const f = R('#field');
          const bl = R('.arena .corner.bl'), br = R('.arena .corner.br');
          const tl = R('.arena .corner.tl'), tr = R('.arena .corner.tr');
          const over = (a, b) => !!(a && b && a.right > b.left && b.right > a.left
                                          && a.bottom > b.top && b.bottom > a.top);
          /* The one button the at-bat is waiting on, whichever it is. Both
             are built and one is hidden, so a hidden one measures zero and
             would pass a test about the fold without being on the screen at
             all: only a button that is actually laid out counts. */
          const act = [...document.querySelectorAll('.controls button, .btn')]
            .filter(b => /swing|throw/i.test(b.textContent || '') && b.offsetParent)
            .map(b => b.getBoundingClientRect())
            .filter(r => r.height > 0)[0];
          /* Nothing in the right hand column may hang off its own panel. */
          const card = R('.swing-modes') ? R('.swing-modes').right : 0;
          const panel = (() => { const e = document.querySelector('.swing-modes');
            return e && e.parentElement ? e.parentElement.getBoundingClientRect().right : 0; })();
          return {
            field: [Math.round(f.width), Math.round(f.height)],
            fieldBottom: Math.round(f.bottom),
            act: act ? Math.round(act.bottom) : -1,
            placards: over(bl, br) || over(tl, tr),
            spill: Math.max(0, Math.round(card - panel)),
            vw: innerWidth, vh: innerHeight,
            sideways: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        r.errors = errors;
        await pg.close(); await ctx.close();
        return r;
      };
      const up = await shot(390, 664);
      const flat = await shot(844, 390);

      ok(flat.field[0] > up.field[0],
         'sideways draws a BIGGER field than upright, not a smaller one',
         `${flat.field.join('x')} sideways against ${up.field.join('x')} upright`);
      ok(flat.fieldBottom <= flat.vh,
         'and the whole field is on the screen without scrolling',
         `field ends at ${flat.fieldBottom} of ${flat.vh}`);
      ok(flat.act > 0 && flat.act <= flat.vh,
         'and so is the button the at-bat is waiting on',
         `button ends at ${flat.act} of ${flat.vh}`);
      ok(!flat.sideways, 'and the page does not scroll sideways', JSON.stringify(flat));
      /* The placards are positioned on the field's own corners at a fixed
         type size, so a small field is what makes them collide. */
      ok(!flat.placards, 'the placards on the field do not grow into each other',
         JSON.stringify(flat));
      ok(!up.placards, 'and they do not upright either', JSON.stringify(up));
      ok(flat.spill === 0, 'nothing in the side column hangs off its panel',
         flat.spill + 'px past the edge');
      ok(flat.errors.length === 0 && up.errors.length === 0, 'no page errors',
         flat.errors.concat(up.errors).join(' | '));
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
        /* The shared sentence became a table with a row per arm, because
           runs and outs are kept per pitcher now and it no longer has to
           say "between them". Read the rows. */
        const tables = [...document.querySelectorAll('#app .card table')];
        const pitchTables = tables.filter(t => /IP/.test(t.querySelector('thead').textContent));
        const rows = pitchTables.map(t => [...t.querySelectorAll('tbody tr')]
          .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())));
        return { rows, starter: g.home.batters[0].n,
                 relief: g.home.batters[g.home.field[0]].n, theirs: g.away.batters[0].n,
                 pitched: g.home.pitched };
      });
      /* Keyed on the TABLE, not on a sentence. The old assertions read
         the phrase "between them", which existed only because the line
         could not split runs between two arms; now each arm owns a row,
         so what is asserted is the row itself. */
      const flat = r.rows.flat();
      const names = flat.map(cells => cells[0]);
      ok(r.rows.length === 2, 'a pitching table per side', JSON.stringify(r.rows));
      ok(r.pitched.length === 2, 'a real in-game change records both arms, starter first', JSON.stringify(r.pitched));
      ok(names.includes(r.starter) && names.includes(r.relief),
         'the side that used two arms gives each his own row', JSON.stringify(names));
      ok(names.includes(r.theirs), 'and the side that used one names him', JSON.stringify(names));
      /* Every row carries an innings figure written in thirds, which is
         the column that could not exist before outs were credited. */
      ok(flat.every(c => /^\d+\.[012]$/.test(c[1])),
         'every arm has an innings pitched in thirds', JSON.stringify(flat.map(c => c[1])));
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
