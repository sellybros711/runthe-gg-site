#!/usr/bin/env node
/* What the OTHER dugout does with a swing, at a sample that can answer.

   `calibrate.mjs` plays real innings through the real buttons, which is what
   makes it a good tripwire and a bad micrometer: it gets about 85 swings out
   of a 150 pitch run, so one standard error on a rate near 22% is 4.5 points
   and a band floor of 15 is inside the noise. This drives the page's own
   `throwPitch` and `scheduleCpuSwing` with the timers stubbed into a queue,
   so a thousand swings an arm costs seconds.

   NOTHING ABOUT THE JITTER MODEL IS COPIED. A second implementation of the
   arithmetic would measure itself. Every swing here goes through the page.

     node whiff.mjs [swings] [tier]
     MYTHIBALL_PAGE=/path/to/other.html node whiff.mjs 3000 medium
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
import path from 'node:path';

const WANT = Number(process.argv[2]) || 1500;
const TIERS = process.argv[3] ? [process.argv[3]] : ['easy', 'medium', 'hard'];
const PAGE = process.env.MYTHIBALL_PAGE
  ? path.resolve(process.env.MYTHIBALL_PAGE)
  : path.resolve('mythiball/index.html');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + PAGE);
await pg.evaluate(() => localStorage.clear());
await pg.goto('file://' + PAGE);

console.log(`  ${path.basename(path.dirname(path.dirname(PAGE)))}/${path.basename(PAGE)}`
  + `   ${WANT} swings a tier\n`);
console.log('  tier      swings   whiff%   foul%   in play%      takes');

for (const tier of TIERS) {
  const r = await pg.evaluate(async ({ tier, want }) => {
    /* A FIXED OPPONENT, because a random club moves this by twenty points:
       that is calibrate's own note, and it is the reason its arm is pinned. */
    Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
    State.difficulty = tier;
    State.gameSpeed = 'fast'; applyGameSpeed();
    State.team = ROSTER.slice(0, 9).map(c => c.k);
    State.teamName = 'Testers';
    State.opponent = OPPONENTS[0];
    State.innings = 9; State.mode = 'exhibition';
    startGame({ mode: 'exhibition', youHome: true });   /* you field: they bat */
    const g = State.game;

    /* The timers, into a queue that is drained by hand. The page schedules a
       CPU swing with setTimeout, so this is what makes a thousand pitches
       cost nothing, and it is the only thing stubbed. */
    const realTO = window.setTimeout, realCT = window.clearTimeout;
    let q = [], id = 1, cancelled = new Set();
    window.setTimeout = (fn, ms) => { const k = id++; q.push({ k, fn, ms }); return k; };
    window.clearTimeout = (k) => { cancelled.add(k); };
    const drain = () => {
      let guard = 0;
      while (q.length && guard++ < 400) {
        const job = q.shift();
        if (cancelled.has(job.k)) continue;
        try { job.fn(); } catch (e) { void e; }
      }
      q = [];
    };

    const out = { swings: 0, whiff: 0, foul: 0, play: 0, takes: 0 };
    const pts = pitcherRepertoire(currentPitcher());
    for (let i = 0; i < want * 3 && out.swings < want; i++) {
      /* A fresh at bat every few pitches, so the batter varies the way he
         does in a game and one man's CON cannot be the whole reading. */
      if (i % 4 === 0) { endAtBatCleanup(); g.balls = 0; g.strikes = 0; g.outs = 0;
        g.bases = [null, null, null]; startAtBat(); drain(); }
      g.play = null;
      endAtBatCleanup();
      throwPitch(pts[i % pts.length], 4 + (i % 9));
      drain();
      const p = g.pitch;
      if (!p) continue;
      const sw = g.lastSwing;
      if (p.swung && sw) {
        out.swings++;
        if (sw.res === 'whiff') out.whiff++;
        else if (sw.res === 'foul') out.foul++;
        else out.play++;
      } else {
        /* A COUNT IS NOT MEASURED HERE, only the swing. The fixture resets
           balls and strikes every fourth pitch to keep the batter turning
           over, so a called strike rate off this loop would be a reading
           of the reset. `calibrate.mjs` is where that number lives. */
        out.takes++;
      }
    }
    window.setTimeout = realTO; window.clearTimeout = realCT;
    return out;
  }, { tier, want: WANT });

  const pct = (a, b) => b ? (a * 100 / b).toFixed(1).padStart(6) : '     .';
  console.log(`  ${tier.padEnd(9)} ${String(r.swings).padStart(6)}   ${pct(r.whiff, r.swings)}`
    + `  ${pct(r.foul, r.swings)}     ${pct(r.play, r.swings)}     ${String(r.takes).padStart(6)}`);
}
if (errs.length) console.log('\n  page errors: ' + [...new Set(errs)].join(' | '));
await browser.close();
