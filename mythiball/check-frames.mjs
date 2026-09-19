/* IS IT SMOOTH? The pitch duel has calibrate.mjs; this is the same idea
   for the frame.

   node mythiball/check-frames.mjs                  desktop, 70 seconds
   node mythiball/check-frames.mjs 70 normal --phone --cpu=4   the run that matters

   A MEAN FRAME RATE HIDES THE THING PEOPLE FEEL. What they feel is the
   one frame in a hundred that takes 90ms, and it lands on the moment
   something interesting happens, because that is when the work is done.
   So this reports the TAIL and names what ran in the long frames.

   A HEADLESS DESKTOP IS THE EASIEST CASE THERE IS and it will tell you
   everything is fine: 60fps mean, one frame over 33ms in four thousand.
   The honest run is a phone viewport with the CPU throttled to a mid
   range handset, which is what `--phone --cpu=4` does.

   Measured there, and these are the bands below:

     mean          ~20ms, about 50fps
     p95           ~28ms
     over 33ms     ~1.3% of frames
     over 50ms     ~0.1%

   THE BANDS ARE GENEROUS ON PURPOSE. Frame timing is noisy: the same
   build measured 1.01%, 1.25% and 1.71% over 33ms in three consecutive
   runs. A band tight enough to catch a 10% regression would flap on
   nothing, and a check people learn to ignore is worse than no check.
   What this catches is something going badly wrong: the render doubling,
   a hitch appearing, a leak.

   WHAT IT ALREADY SETTLED, so nobody re-measures it:

   - Input is not the problem. Press to the game ACTING is 0.20ms, and
     press to the next frame is 21.3ms against a 20ms floor: the swing
     paints on the very next frame, which is the best there is.
   - There is no hitch to hunt. The cost is spread across the render.
     drawField is 2.48ms mean, which is about ten of a sixteen
     millisecond budget once throttled, and that is the honest capability.
   - The static stadium (sky, stands, towers, wall, mowing, speckle) is
     25% of drawField, but the stadium path only runs on 20% of frames
     because an at bat uses the plate camera instead. Caching it into a
     world space bitmap is worth about 10% of frame time and carries real
     risk, since it is drawn under a moving camera transform.
   - Sprite builds were cut from 305 a minute to 118 with zero repeats,
     and an A/B over three runs each way showed it moved the frame times
     NOT AT ALL. Correlation is not cost: a build lands in a long frame
     because both cluster on the same event.
   - The BACKING STORE size is not worth chasing either, and this is the
     same null result a second time. The bitmap was a fixed 1440 wide on
     every screen, where a 390px phone at a device ratio of 3 can show
     1074, so the game wrote 81% more pixels than the screen had. Sizing
     it down is worth 0.3ms a frame against 3.4ms of spread inside one
     arm. It was changed anyway, for the GRID rather than the frame rate
     (see fieldBitmapWidth), and it is never more pixels than before.

   HOW THAT ONE WENT WRONG, because the trap is in this file's own
   instrument. An A B A pass read the same change as 9.5ms a frame. The
   three runs were 35.6, 6.2 and 16.3 percent over 33ms, which is a page
   still warming up, so the middle arm was flattered by its POSITION.
   Interleave the arms and repeat them, which is what --reps does in
   scratchpad/dprprobe.mjs, and the gap disappears.

   AND THE THROTTLE ONLY SLOWS THE MAIN THREAD. Emulation.setCPUThrottling
   Rate throttles script, not rasterizing and not compositing. So a change
   that moves pixel COUNT rather than javascript is close to invisible
   here however many times it is run, and a null result from this file is
   only ever a null result about the main thread. Do not read one as
   proof that a real phone would not care. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';
const SECS = Number(process.argv[2] || 70);
const SPEED = process.argv[3] || 'normal';
/* A HEADLESS DESKTOP IS THE EASIEST CASE THERE IS. This game is played
   on a phone, so the run that matters is a phone viewport with the CPU
   throttled to something a mid range handset would give you. */
const PHONE = process.argv.includes('--phone');
const THROTTLE = Number((process.argv.find(a => a.startsWith('--cpu=')) || '--cpu=1').slice(6));

const browser = await chromium.launch();
const pg = await browser.newPage(PHONE
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1280, height: 900 } });
if (THROTTLE > 1) {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}
const errors = []; pg.on('pageerror', e => errors.push(e.message));
await pg.goto(pathToFileURL('mythiball/index.html').href);
await pg.evaluate(() => localStorage.clear());
await pg.goto(pathToFileURL('mythiball/index.html').href);

await pg.evaluate((sp) => {
  Sound.muted = true; PREFS.cutscenes = false; PREFS.coach = false;
  window.confirm = () => true;
  State.gameSpeed = sp; applyGameSpeed();
  State.team = ROSTER.slice(0, 9).map(c => c.k); State.teamName = 'Frames';
  State.opponent = OPPONENTS[0]; State.innings = 9; State.mode = 'exhibition';
  startGame({ mode: 'exhibition', youHome: true });

  /* what the game was doing, so a long frame can be blamed */
  window.__mark = null;
  const tag = (label, fn) => {
    const real = window[fn];
    if (typeof real !== 'function') return;
    window[fn] = function (...a) {
      const t0 = performance.now();
      window.__mark = label;
      try { return real.apply(this, a); }
      finally { window.__cost = window.__cost || {};
                const d = performance.now() - t0;
                const c = window.__cost[label] = window.__cost[label] || { n: 0, tot: 0, max: 0 };
                c.n++; c.tot += d; c.max = Math.max(c.max, d); }
    };
  };
  for (const [l, f] of [['drawField','drawField'], ['drawPlateView','drawPlateView'],
                        ['drawRunnerAt','drawRunnerAt'], ['renderLineScore','renderLineScore'],
                        ['refreshAtBatCard','refreshAtBatCard'],
                        ['buildPlaySim','buildPlaySim'], ['contact','scheduleContactPlay'],
                        ['throwPitch','throwPitch'], ['resolveSwing','resolveSwing'],
                        ['startAtBat','startAtBat'], ['endHalfInning','endHalfInning'],
                        ['refreshHud','refreshHud']]) tag(l, f);

  /* the frame log */
  window.__f = [];
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    window.__f.push([now - last, window.__mark]);
    window.__mark = null;
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, SPEED);

/* play it: supply a pitch whenever the game asks, let everything else run */
const until = Date.now() + SECS * 1000;
while (Date.now() < until) {
  await pg.evaluate(() => {
    const g = State.game;
    if (!g || g.over) {
      State.team = ROSTER.slice().sort(() => Math.random()-0.5).slice(0,9).map(c => c.k);
      State.opponent = OPPONENTS[Math.floor(Math.random()*OPPONENTS.length)];
      startGame({ mode: 'exhibition', youHome: true });
      return;
    }
    if (g.aiming) { try { const p = cpuCallPitch(); throwPitch(p.pt, p.zone); } catch (e) {} }
  }).catch(() => {});
  await pg.waitForTimeout(250);
}
const { f, cost } = await pg.evaluate(() => ({ f: window.__f, cost: window.__cost || {} }));
await browser.close();

const d = f.map(x => x[0]).slice(5);           /* drop the first few */
const q = (a, p) => { const s = a.slice().sort((x,y)=>x-y); return s[Math.floor(p*s.length)]; };
const mean = (a) => a.reduce((x,y)=>x+y,0)/a.length;
console.log(`  ${d.length} frames over ${SECS}s at speed ${SPEED}`
  + `, ${PHONE ? '390x844 phone' : 'desktop'}${THROTTLE > 1 ? `, CPU throttled ${THROTTLE}x` : ''}\n`);
console.log(`  frame time ms   mean ${mean(d).toFixed(1)}   p50 ${q(d,.5).toFixed(1)}   p95 ${q(d,.95).toFixed(1)}   p99 ${q(d,.99).toFixed(1)}   max ${Math.max(...d).toFixed(1)}`);
console.log(`  implied fps     ${(1000/mean(d)).toFixed(0)} mean, ${(1000/q(d,.95)).toFixed(0)} at p95`);
const hitch = d.filter(x => x > 50).length, jank = d.filter(x => x > 33).length;
console.log(`  frames over 33ms (under 30fps)  ${jank} (${(100*jank/d.length).toFixed(2)}%)`);
console.log(`  frames over 50ms (a visible hitch) ${hitch} (${(100*hitch/d.length).toFixed(2)}%)`);

/* who was responsible for the long ones */
const blame = {};
for (const [ms, mark] of f) if (ms > 33) { const k = mark || '(nothing tagged)'; blame[k] = (blame[k]||0)+1; }
console.log(`\n  long frames, by what ran in them:`);
for (const [k,v] of Object.entries(blame).sort((a,b)=>b[1]-a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);

console.log(`\n  synchronous cost of the tagged calls:`);
console.log(`    what              calls    mean ms    worst ms`);
for (const [k,c] of Object.entries(cost).sort((a,b)=>b[1].max-a[1].max)) {
  console.log(`    ${k.padEnd(16)} ${String(c.n).padStart(5)}    ${(c.tot/c.n).toFixed(2).padStart(7)}    ${c.max.toFixed(1).padStart(8)}`);
}
/* ---- the bands ---- */
console.log('\nTARGETS   (generous: see the header before tightening one)');
const rows = [
  ['mean frame ms', mean(d), 0, PHONE ? 28 : 22, 'the render fits in a frame'],
  ['p95 frame ms', q(d,.95), 0, PHONE ? 42 : 30, 'the tail stays near the mean'],
  ['% over 33ms', 100*jank/d.length, 0, PHONE ? 5 : 1.5, 'stutter is rare'],
  ['% over 50ms', 100*hitch/d.length, 0, PHONE ? 1.2 : 0.4, 'a visible hitch is rarer'],
];
let bad = 0;
for (const [name, v, lo, hi, why] of rows) {
  const ok = v >= lo && v <= hi;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'OUT '} ${name.padEnd(16)} ${v.toFixed(2).padStart(7)}   band ${lo}-${hi}`
    + (ok ? '' : `   <- ${why}`));
}
if (errors.length) { console.log('\nPAGE ERRORS:\n ' + [...new Set(errors)].slice(0,3).join('\n ')); bad++; }
console.log(bad ? `\n${bad} target(s) out of band.` : '\nAll targets in band.');
process.exit(bad ? 1 : 0);
