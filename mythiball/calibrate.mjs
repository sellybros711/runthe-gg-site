/* The pitch duel, measured.
   ==========================

   node mythiball/calibrate.mjs            150 pitches, about four minutes
   node mythiball/calibrate.mjs --quick    60 pitches, for a fast loop

   Every number that makes an at bat feel like baseball is a RATE, and a
   rate drifts in silence: a CPU that stops swinging, a whiff knob that
   makes every contact mode useless, a scatter that turns the neutral arm
   into a strike machine, all render perfectly and break no test. The
   hoops game answers this with a TARGETS block in verify.mjs and it has
   caught real regressions there; this is the same idea for the plate.

   It drives REAL pitches through the real page: an unsteered arm (bare
   throwPitch, which aims at random the way an arm nobody is calling
   does) against the real CPU swing AI, timers and all. Nothing in the
   resolution path is stubbed, so what is measured is what a player
   meets. The player's own half is not simulated: their rates are their
   skill, and the meter and reticle already carry the difficulty knobs.

   The whiff rate has been retuned once through this meter, which is
   the intended use: it measured 55 per hundred swings (a strikeout
   machine; MLB runs about 25), the swing jitter tiers in
   scheduleCpuSwing came down about a fifth, and it measures in the mid
   forties now with visibly more balls in play. Any further move is the
   same procedure: measure, touch the jitter, measure again, never an
   edit to the band to make a run pass.

   The bands are ARCADE bands, not MLB's. Real baseball runs about 47%
   swings, 25% whiffs per swing and 18% balls in play per pitch; an
   arcade game runs hitter-hot on purpose, so the bands are set around
   the game as tuned today with room to breathe. A number outside its
   band is a question, not a knob to turn until green: read what changed
   before deciding which side is wrong. Refit, do not nudge. */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';

const QUICK = process.argv.includes('--quick');
const N = QUICK ? 60 : 150;
const URL = pathToFileURL('mythiball/index.html').href;

const browser = await chromium.launch();
const pg = await browser.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(e.message));
await pg.goto(URL);
await pg.evaluate(() => localStorage.clear());
await pg.goto(URL);
await pg.evaluate(() => {
  Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
  window.confirm = () => true;
  State.gameSpeed = 'fast'; applyGameSpeed();
  State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Calibration';
  /* The opponent is PINNED, because each club carries its own batting
     style and roster and a random draw moved whiff per swing by twenty
     points between otherwise identical runs. One club, every run, so a
     moved number means the game moved. */
  State.opponent = OPPONENTS[0]; State.innings = 5; State.mode = 'exhibition';
  startGame({ mode: 'exhibition', youHome: true });   /* CPU bats, the robot arm pitches */

  window.__cal = { pitches: 0, zonePitch: 0, swings: 0, zoneSwing: 0, chase: 0,
                   miss: 0, foul: 0, hit: 0, take: 0, calledK: 0, ball: 0,
                   kinds: {}, qs: [] };
  const _rs = resolveSwing;
  window.resolveSwing = (t, aim) => {
    const p = State.game && State.game.pitch;
    const cal = window.__cal;
    cal.swings++;
    if (p && Math.abs(p.loc.x) <= 1 && Math.abs(p.loc.y) <= 1) cal.zoneSwing++;
    else cal.chase++;
    const r = _rs(t, aim);
    const ls = State.game && State.game.lastSwing;
    if (ls) { if (ls.res === 'hit') cal.hit++; else if (ls.res === 'foul') cal.foul++; else cal.miss++; }
    return r;
  };
  const _rc = resolveCalledPitch;
  window.resolveCalledPitch = () => {
    const p = State.game && State.game.pitch;
    const cal = window.__cal;
    cal.take++;
    if (p && Math.abs(p.loc.x) <= 1 && Math.abs(p.loc.y) <= 1) cal.calledK++;
    else cal.ball++;
    return _rc();
  };
  const _sc = scheduleContactPlay;
  window.scheduleContactPlay = (kind, batter, info) => {
    const cal = window.__cal;
    cal.kinds[kind] = (cal.kinds[kind] || 0) + 1;
    if (info && info.q != null) cal.qs.push(info.q);
    return _sc(kind, batter, info);
  };
});
await pg.waitForTimeout(600);

/* Pitches go out in chunks so a hung page fails a chunk, not the run. */
const CHUNK = 25;
let thrown = 0;
while (thrown < N) {
  const batch = Math.min(CHUNK, N - thrown);
  await pg.evaluate(async (batch) => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < batch; i++) {
      if (!State.game || State.game.over || playerIsBatting()) {
        startGame({ mode: 'exhibition', youHome: true });
        await sleep(500);
      }
      /* throwPitch is only ever reached through startAtBat in real play,
         and startAtBat is what builds batterCtx. Wait for it rather than
         throwing into a game that has not seated its first batter. */
      for (let w = 0; w < 8 && State.game && !State.game.batterCtx; w++) await sleep(250);
      if (!State.game || !State.game.batterCtx) continue;
      try { endAtBatCleanup(); State.game.pitch = null; throwPitch(); } catch (e) { continue; }
      const p = State.game.pitch;
      if (p) { window.__cal.pitches++; if (p.isStrike) window.__cal.zonePitch++; }
      await sleep(1650);
    }
  }, batch);
  thrown += batch;
  process.stdout.write(`  ${thrown}/${N} pitches\r`);
}
const cal = await pg.evaluate(() => window.__cal);
await browser.close();
console.log(`  ${thrown}/${N} pitches thrown\n`);

/* ---- the report ---- */
const pct = (a, b) => b ? (100 * a / b) : 0;
const kinds = cal.kinds || {};
const bip = Object.values(kinds).reduce((a, c) => a + c, 0);
const xbh = (kinds.double || 0) + (kinds.triple || 0) + (kinds.homer || 0) + (kinds['home run'] || 0);
const meanQ = cal.qs.length ? cal.qs.reduce((a, c) => a + c, 0) / cal.qs.length : 0;
const outOfZone = cal.pitches - cal.zonePitch;

/* Only rates a run this length can actually support carry a band. A
   band a small sample can flap is noise people learn to ignore, which
   is the lesson every checker in this repo keeps relearning. The small
   samples (balls in play, contact quality, hit mix) are PRINTED below
   as information: read them across runs, never off one. */
const rows = [
  /* The zone band runs to 82 because the metric's own noise demands
     it: at 150 pitches and a true rate near 70, one run in twenty
     lands past 75 with nothing changed. Measured across five clean
     runs: 66.7 to 75.3. */
  ['zone rate, neutral arm', pct(cal.zonePitch, cal.pitches), cal.pitches, 40, 82,
   'an unsteered arm still finds the zone more often than not'],
  ['swing rate', pct(cal.swings, cal.pitches), cal.pitches, 35, 70,
   'the CPU is neither a statue nor a hacker'],
  ['chase rate', pct(cal.chase, outOfZone), outOfZone, 5, 50,
   'balls out of the zone draw some swings, not all of them'],
  ['whiff per swing', pct(cal.miss, cal.swings), cal.swings, 35, 65,
   'swinging carries real risk and real reward'],
  ['foul per swing', pct(cal.foul, cal.swings), cal.swings, 10, 55,
   'fouls extend at bats without owning them'],
  ['ball in play per swing', pct(cal.hit, cal.swings), cal.swings, 15, 65,
   'most swings are not empty'],
  ['called strike per take', pct(cal.calledK, cal.take), cal.take, 10, 60,
   'taking is a gamble, not a free ball'],
];

console.log('TARGETS   (arcade bands: see the header before moving one)');
let bad = 0;
for (const [name, v, n, lo, hi, why] of rows) {
  const ok = v >= lo && v <= hi;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'OUT '} ${name.padEnd(26)} ${v.toFixed(1).padStart(6)}   n ${String(n).padStart(4)}   band ${lo}-${hi}`
    + (ok ? '' : `   <- ${why}`));
}
console.log('\nINFORMATION   (samples too small to band at this length)');
console.log(`  balls in play ${bip}: ${Object.entries(kinds).map(([k, c]) => `${k} ${c}`).join(', ') || 'none'}`);
console.log(`  extra bases per ball in play ${pct(xbh, bip).toFixed(1)}   mean contact quality ${(meanQ * 100).toFixed(1)}`);
if (errors.length) { console.log('\nPAGE ERRORS:\n  ' + errors.join('\n  ')); bad++; }
if (cal.pitches < N * 0.8) { console.log(`\nOnly ${cal.pitches} of ${N} pitches resolved: the harness is the suspect.`); bad++; }
console.log(bad ? `\n${bad} target(s) out of band.` : '\nAll targets in band.');
process.exit(bad ? 1 : 0);
