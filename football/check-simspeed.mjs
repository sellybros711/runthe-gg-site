/*
 * check-simspeed.mjs : Slow and Slower are paced by the drive, and Normal is untouched.
 *
 *   node football/check-simspeed.mjs
 *
 * The owner's call (2026-10-22): the slower settings still went too fast to follow a drive.
 * A multiplier on the game clock could not fix that, because a three minute drive is a third of
 * a second at Normal. So below Normal every drive gets its own time on the field and a stop
 * after it with one line saying what happened (SLOW_DRIVE in index.html). Normal keeps exactly
 * the pace and the detail it had, for somebody who only wants the result.
 *
 * Read off the timeline the broadcast plays, built from a real game's script and drives, so a
 * whole game never has to be watched. Measured end to end when it shipped: one Wild Card took
 * 17.5s at Normal (17.3 before), 1:49 at Slow and 3:24 at Slower.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';

let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('Playwright is not available here, so this check cannot run.');
  process.exit(0);
}

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const INJECT = 'E:E,buildTimeline,generateDrives,PACE,SLOW_DRIVE,speedLevel';

const browser = await pw.chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const boom = [];
page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
await page.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (u.hostname !== 'local.test') return r.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return r.abort();
  let body = fs.readFileSync(f);
  if (rel === '/football/index.html') {
    const s = body.toString('utf8');
    if (s.indexOf('\nboot();') < 0) throw new Error('no boot() anchor to inject at');
    body = Buffer.from(s.replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
  }
  await r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
});
await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const r = await page.evaluate(() => {
  const T = window.__t, E = T.E;
  const out = { games: 0 };
  const sum = (segs) => segs.reduce((t, s) => t + s.ms, 0);
  let normalOff = 0, minDrive = Infinity, holdsOk = true, slowLess = true, playsOk = true;
  for (let g = 0; g < 12; g++) {
    const seed = 'speed|' + g;
    const script = E.scoringScript(17 + g, 20 + (g % 5) * 3, E.createSeededRNG(E.hashSeed(seed)));
    const drives = T.generateDrives(script, E.createSeededRNG(E.hashSeed(seed + '|d')), {});
    const pace = T.PACE['Wild Card'];
    RTG_SPEED.set('normal');
    const plain = sum(T.buildTimeline(script, pace));
    const withDrives = sum(T.buildTimeline(script, pace, drives));
    normalOff = Math.max(normalOff, Math.abs(plain - withDrives));
    RTG_SPEED.set('slow');
    const slowSegs = T.buildTimeline(script, pace, drives);
    const slow = sum(slowSegs);
    RTG_SPEED.set('slower');
    const slowerSegs = T.buildTimeline(script, pace, drives);
    const slower = sum(slowerSegs);
    if (!(plain < slow && slow < slower)) slowLess = false;
    /* Every drive that did not score has a stop of its own, and every drive on the field takes
       at least its share of the drive time. */
    /* REGULATION ONLY. The broadcast timeline runs four quarters at every speed, so an
       overtime drive gets no stop because it gets no time at all (a known gap, reported). */
    const quiet = drives.filter((d) => d.tEnd <= 3600 && d.at == null
      && !['safety', 'touchdown', 'field goal'].includes(d.result));
    const holds = slowerSegs.filter((s) => s.kind === 'drive');
    if (holds.length !== quiet.length || holds.some((s) => s.ms !== T.SLOW_DRIVE.slower.hold)) holdsOk = false;
    for (const d of drives) {
      const ms = slowerSegs.filter((s) => s.kind === 'run').reduce((t, s) => {
        const a = (s.q - 1) * 900 + (900 - s.from), b = (s.q - 1) * 900 + (900 - s.to);
        const mid = (a + b) / 2;
        return t + (d.tStart <= mid && mid < d.tEnd ? s.ms : 0);
      }, 0);
      if (d.tEnd - d.tStart > 20 && d.tEnd <= 3600) minDrive = Math.min(minDrive, ms);
    }
    out.games++;
    out.last = { plain: Math.round(plain), slow: Math.round(slow), slower: Math.round(slower) };
  }
  /* A change of setting lands on the NEXT segment: a length, once read, never moves. */
  RTG_SPEED.set('normal');
  const segs = T.buildTimeline(E.scoringScript(21, 17, E.createSeededRNG(E.hashSeed('x'))), T.PACE['Wild Card']);
  const first = segs[0].ms;
  RTG_SPEED.set('slower');
  const kept = segs[0].ms === first;
  RTG_SPEED.set('normal');
  return Object.assign(out, { normalOff, minDrive: Math.round(minDrive), holdsOk, slowLess, kept,
    floor: Math.round(T.SLOW_DRIVE.slower.drive * 0.6) });
});

console.log('THE SPEED SETTINGS, OFF THE TIMELINE');
ok('Normal is exactly the pace it was', r.normalOff < 1, r.normalOff.toFixed(3) + 'ms apart over ' + r.games + ' games');
ok('Slow is slower than Normal, and Slower slower than Slow', r.slowLess, JSON.stringify(r.last));
ok('at Slower every drive gets real time on the field', r.minDrive >= r.floor - 1,
  'shortest ' + r.minDrive + 'ms, floor ' + r.floor + 'ms');
ok('and every drive that did not score stops for its call', r.holdsOk);
ok('a change of setting never moves a segment already started', r.kept);
ok('no page errors', !boom.length, boom.join(' | '));

await browser.close();
console.log('\n' + (fails ? fails + ' FAILED' : 'all speed checks passed'));
process.exit(fails ? 1 : 0);
