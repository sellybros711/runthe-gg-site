/* HOW MANY RUNS A GAME, AND THE DEFENCE HAS TO TURN UP.

   node mythiball/check-runs.mjs                  4 games an arm
   node mythiball/check-runs.mjs 20 fast --jobs=4 twenty, which is what a
                                                 tuning move needs

   THE ANSWER IS ABOUT 5.5 RUNS A TEAM OVER NINE against the real game's
   4.5, so the run environment is NOT broken and never was. Six games, all
   going the distance: 3, 3, 5, 1, 6 and 4 in six innings each.

   QUOTE THE POOL, NOT A RUN. The first four games came out at exactly 4.5
   and that got written down as the answer, because a sample landing on the
   real world's own number reads as confirmation rather than as a
   coincidence. The next two came out at 7.5 on identical code. Per game the
   spread is 1.5 to 9.0 a nine, so four games cannot call a tenth of a run
   and a tuning move worth half a run is invisible under about twenty. What
   this sample IS enough for is the only question being asked: whether
   scoring is broken. It is not.

   It took five attempts to get that number and the first four were all
   instrument faults, so this file exists to stop anybody spending a sixth.

   THE FAULT THAT HID IT: a fielding window nobody answers does not
   resolve as a neutral out. The grounder window's timeout is
   `setTimeout(() => finish(-1), duration + 20)`, and t = -1 is further
   from ideal than yellowHalf, so it lands in the ERROR branch: the batter
   reaches and every runner moves up. The fly window expires as a MISS the
   same way. A harness that presses nothing therefore boots every routine
   ground ball and drops every catchable fly, all game, every game.

   Measured here, that single omission was worth 27 to 32 runs a nine
   against 5.5. It is the whole of the difference: the samples that read
   0-18, 2-19 and 0-20 were not a bad bat or a broken run environment,
   which are the two answers this was stuck between. They were a defence
   with its hands tied, which is a third thing neither of those names.

   THOSE TWO FIGURES ARE THE OLD GAME AND ARE KEPT AS HISTORY. Once an
   ignored window stopped being scored as the WORST outcome it had (an
   error on a grounder, a triple on a fly) and became a single, the
   nobody-fields arm fell to 15.8 a nine. So ignoring the defence still
   costs about three times what playing it costs, which is the shape it
   should have: a real price, not a catastrophe. Re-measure this arm after
   anything that touches an expiry, because it is measuring that.

   TWO HARNESSES AGREEING IS NOT EVIDENCE. A tracker of its own counting
   and the game's own line score both said the same wrong thing, because
   they shared this defect rather than because it was true.

   So this plays the two windows that can only DOWNGRADE an out, at their
   own ideal moment, which is what a person paying attention does. It
   leaves the robbery alone on purpose: a miss there costs nothing by
   design, so answering it would flatter the defence instead.

   ONLY THE CPU'S RUNS COUNT. The player's side never swings in this
   harness, so it scores zero by construction, and averaging a real team
   with a non-participant halves the answer. The first draft of the report
   did exactly that and printed 1.5 for a defence that had conceded 3.6.
   The CPU is the AWAY side, because startGame runs with youHome true.

   Both arms are reported, because the size of the confound is the point
   and asserting it is not the same as showing it.

   WHAT IT MEANS FOR THE SEND GATE. A runner scores from second on a
   single 24% of the time here against about 60% in the real game, and two
   thirds of that gap is the `spd >= 75` gate deciding who even tries.
   That looked like a number waiting to be loosened. It is not: scoring is
   already ON the real game's figure, so sending more runners moves a
   correct run environment off it. Anything done there has to be paid for
   somewhere else, and this file is how you would find out.
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';
const GAMES = Number(process.argv[2] || 2);
const SPEED = process.argv[3] || 'fast';
/* HOW MANY GAMES RUN AT ONCE. A five inning game at Fast takes about
   eight minutes of WALL CLOCK, and almost none of it is work: the cost is
   the game's own beats, which are setTimeout waits. So the honest way to
   get more games is to run more of them at the same time rather than to
   hurry any one of them.

   A HARNESS ONLY SPEED BELOW FAST WAS THE OTHER OPTION AND IS REFUSED.
   It would change the very timings the measurement runs through, which is
   how four of the five earlier attempts at this number went wrong. Four
   pages waiting on their own timers are four identical games.

   The thing to watch is the rAF watcher that plays the fielding windows:
   it fires on a setTimeout at an exact millisecond, so a starved page
   could miss windows and quietly take the defence's hands away again.
   That is measured rather than assumed, and `windows played` is printed
   on every run so a starved run is visible in the report itself. */
const JOBS = Math.max(1, Number((process.argv.find(a => a.startsWith('--jobs=')) || '--jobs=4').slice(7)));
const URL = pathToFileURL('mythiball/index.html').href;

const browser = await chromium.launch();

/* one page, playing `count` games one after another */
const playGames = async (field, count) => {
  const pg = await browser.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL);
  await pg.evaluate(() => localStorage.clear());
  await pg.goto(URL);
  await pg.evaluate(({ sp, field }) => {
    Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
    window.confirm = () => true;
    State.gameSpeed = sp; applyGameSpeed();
    State.innings = 5; State.mode = 'exhibition';
    window.__threw = 0; window.__fielded = 0;
    window.__fresh = () => {
      State.team = ROSTER.slice().sort(() => Math.random() - 0.5).slice(0, 9).map(c => c.k);
      State.teamName = 'Books';
      State.opponent = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
      startGame({ mode: 'exhibition', youHome: true });
    };
    window.__fresh();
    if (!field) return;
    /* ARM EACH WINDOW ONCE, at its own ideal moment. A rAF watcher rather
       than the harness's 220ms poll, because a window can be shorter than
       one poll and a missed one is exactly the fault being removed. */
    const tick = () => {
      const g = State.game;
      const p = g && g.play;
      if (p) {
        const w = p.throwActive ? p.throwWindow : p.catchActive ? p.catchWindow : null;
        if (w && !w.resolved && !w.__armed && w.duration) {
          w.__armed = true;
          /* the throw window carries its own ideal; the fly window's is
             the middle of the bar */
          const ideal = p.throwActive && w.ideal != null ? w.ideal : 0.5;
          const at = w.startedAt + ideal * w.duration;
          setTimeout(() => {
            if (w.resolved) return;
            window.__fielded++;
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
          }, Math.max(0, at - performance.now()));
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { sp: SPEED, field });
  await pg.waitForTimeout(900);

  const rows = [];
  for (let gi = 0; gi < count; gi++) {
    if (gi) { await pg.evaluate(() => { window.__threw = 0; window.__fielded = 0; window.__fresh(); }); await pg.waitForTimeout(900); }
    let guard = 0;
    while (guard++ < 6000) {
      const st = await pg.evaluate(() => {
        const g = State.game;
        if (!g) return { gone: true };
        if (g.over) return { over: true };
        if (g.aiming && !g.play && !g.tail) {
          try { const p = cpuCallPitch(); throwPitch(p.pt, p.zone); window.__threw++; } catch (e) {}
        }
        return { ok: true };
      }).catch(() => ({ gone: true }));
      if (st.gone || st.over) break;
      await pg.waitForTimeout(200);
    }
    const box = await pg.evaluate(() => {
      const g = State.game;
      if (!g) return null;
      return { away: g.away.score, home: g.home.score, inning: g.inning,
               over: !!g.over, threw: window.__threw, fielded: window.__fielded };
      /* away is the CPU: startGame runs with youHome true, so the CPU bats
         first and the player's side is home. */
    });
    if (box) rows.push(box);
  }
  await pg.close();
  return { rows, errs };
};

/* GAMES split across JOBS pages, all in flight together. The remainder is
   spread one game at a time rather than piled on the last worker, so no
   single page decides how long the whole arm takes. */
const arm = async (label, field) => {
  const per = Array.from({ length: Math.min(JOBS, GAMES) },
    (_, i) => Math.floor(GAMES / Math.min(JOBS, GAMES))
            + (i < GAMES % Math.min(JOBS, GAMES) ? 1 : 0));
  const done = await Promise.all(per.map(n => playGames(field, n)));
  return { label, rows: done.flatMap(d => d.rows), errs: done.flatMap(d => d.errs) };
};

const out = [];
out.push(await arm('nobody fields (as measured before)', false));
out.push(await arm('the defence turns up', true));
await browser.close();

console.log(`  ${GAMES} games an arm, ${SPEED} speed, five inning games\n`);
/* ONLY THE CPU'S RUNS COUNT, and the first draft of this report did not
   do that. It divided both teams' runs by two, and the player's side
   never swings a bat in this harness, so it scores zero by construction.
   Averaging a real team with a non-participant halves the answer: it
   printed 1.5 for a defence that had actually conceded about 3.6. The
   CPU is the AWAY side here, because startGame runs with youHome true. */
const cpu9 = (rows) => {
  const inn = rows.reduce((x, r) => x + r.inning, 0) || 1;
  return rows.reduce((x, r) => x + r.away, 0) / inn * 9;
};
console.log('  arm                                 CPU line            CPU runs/9   pitches/inn  windows played');
for (const a of out) {
  const inn = a.rows.reduce((x, r) => x + r.inning, 0) || 1;
  const pi = a.rows.reduce((x, r) => x + r.threw, 0) / inn;
  const fw = a.rows.reduce((x, r) => x + (r.fielded || 0), 0);
  console.log(`  ${a.label.padEnd(34)} ${a.rows.map(r => `${r.away} in ${r.inning}`).join(', ').padEnd(19)}`
    + ` ${cpu9(a.rows).toFixed(1).padStart(10)}   ${pi.toFixed(1).padStart(10)}   ${String(fw).padStart(12)}`);
}
console.log(`\n  real baseball is about 4.5 runs a team over nine.`);
const per9 = cpu9(out[1].rows);
/* THE SPREAD IS PRINTED BESIDE THE MEAN, and that is not decoration. Four
   games once read 4.5 and the next two read 7.5 on identical code, and the
   4.5 got written into the docs as the answer because it happened to land
   on the real world's own number. A reader who sees only a mean will quote
   it. */
const each = out[1].rows.map(r => r.away / Math.max(1, r.inning) * 9);
console.log(`  across ${each.length} games: ${each.map(x => x.toFixed(1)).join(', ')}`);
console.log(`\n  with a defence the CPU scores ${per9.toFixed(1)} a nine`
  + `, game by game ${Math.min(...each).toFixed(1)} to ${Math.max(...each).toFixed(1)}.`);
console.log(`  ${per9 > 12 ? 'HIGH: the run environment, not the harness.'
  : per9 < 2 ? 'LOW against the real game.'
  : 'NOT BROKEN. The readings that said otherwise were the harness not fielding.'}`);
if (each.length < 20) console.log(`  ${each.length} games is enough to say that and not enough`
  + ` to call a tenth of a run: a half run move needs about twenty.`);
for (const a of out) if (a.errs.length) console.log(`\n  PAGE ERRORS in ${a.label}: ` + [...new Set(a.errs)].slice(0, 3).join(' | '));
