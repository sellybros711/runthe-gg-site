/*
 * THE BOSS BATTLE SCREEN, PLAYED FOR REAL.
 *
 *   node football/check-boss.mjs          six seeds, taking the field goal
 *   node football/check-boss.mjs go       the same, going for it on fourth down
 *
 * WHY THIS IS ITS OWN FILE. check-dynasty.mjs drives run.js in node and never opens a page,
 * and the boss battle's whole subject is a page: a sim that plays forward down by down while
 * a screen animates it, pauses for a call, and writes a drive log beside it. The engine was
 * right the entire time the screen was wrong, which is the shape of everything below.
 *
 * WHAT IT IS FOR, in one sentence: this screen is the only place on the site that prints a
 * RUNNING SCORE next to a list of drives, so it is the only place a reader can check the
 * game against itself, and it is the only place where getting it wrong is visible without
 * anything throwing.
 *
 * THE BUG IT WAS WRITTEN FOR. bossRescoreLast() stamps the current score onto the TOP row of
 * the log. It exists because a touchdown that pauses for a two point try is logged when the
 * drive ends, which is before the conversion is taken, so that row needed updating after.
 * It ran on EVERY decision, and a fourth down is the other way round: there the drive has not
 * ended when the call is made, bossSimResolve ends it, and the flush logs it a moment later.
 * So the top row at that moment belonged to somebody else. Kick a 29 yard field goal to go
 * 14-55 up to 17-55 and the three landed on Seattle's field goal above it, so the row for
 * your own kick repeated 17-55 and the kick read as though it had scored nothing.
 *
 * Reported by a player. Every suite was green, because the bug and the score were never
 * wrong together: the bug above the field was right the whole time.
 *
 * SO THE ASSERTION IS A PROPERTY OF THE COLUMN, not a number. Read bottom to top, only the
 * team that scored on a drive may move, a drive that scored nothing may move neither, and
 * the last row has to be the final on the bug. A pinned final score would pass on a log whose
 * middle is nonsense, which is exactly the log that was shipping.
 *
 * AND IT SAMPLES SEEDS, because the fault needs a fourth down call to land next to somebody
 * else's drive. Measured with the bug reintroduced: it shows on most seeds and not all, and a
 * one-seed check would have been a coin flip on whether this file was worth having.
 */
import fs from 'fs';
import path from 'path';
import * as pw from 'playwright';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

/* Season 6 is a boss season: milestones run every DYNASTY_MILESTONE_EVERY and the even ones
   are bosses, so the second milestone is the first boss. Asserted rather than assumed, since
   moving the cadence would silently make every run below a non-boss season. */
const BOSS_SEASON = 6;
const SEEDS = [3, 7, 11, 19, 23, 29];
const PREF = process.argv[2] || 'fg';

const INJECT = 'R:R,E:E,bossPlay,setRun:(r)=>{run=r;},'
  + 'someRoster:()=>{const o=[];for(const p of BYKEY.values()){o.push(p);'
  + 'if(o.length>=6)break;}return o;}';

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  if (!cond || process.env.VERBOSE) {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra !== undefined ? '   ' + extra : ''}`);
  }
};

const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
const boom = [];
page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
await page.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  /* Nothing leaves. The store is live and there is no test mode; this screen reaches no
     payment path, and the rule is the rule. */
  if (u.hostname !== 'local.test') return r.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return r.abort();
  let body = fs.readFileSync(f);
  if (rel === '/football/index.html') {
    body = Buffer.from(body.toString('utf8')
      .replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
  }
  await r.fulfill({ status: 200,
    contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
});
await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.click('#frg-x', { timeout: 2000 }).catch(() => {});

console.log('THE BOSS DRIVE LOG, READ DOWN THE SCORE COLUMN  (taking "' + PREF + '")');
let games = 0, calls = 0, skipped = 0;
for (const seed of SEEDS) {
  const started = await page.evaluate(([seed, season]) => {
    const T = window.__t;
    const r = T.R.createRun({ dynasty: true, seed });
    r.roster = T.someRoster(); r.seasonNo = season; r.score = 0;
    if (!T.R.bossFor(r)) return false;
    T.setRun(r);
    T.bossPlay('balanced');
    return true;
  }, [seed, BOSS_SEASON]);
  if (!started) {
    ok('season ' + BOSS_SEASON + ' is a boss season (seed ' + seed + ')', false,
      'bossFor returned nothing, so the milestone cadence moved');
    continue;
  }
  /*
   * SIM THE REST IS HOW THIS IS DRIVEN, so the control is exercised on every run here rather
   * than in one check of its own. If it stopped working the whole file would time out.
   */
  const hadSkip = await page.evaluate(() => {
    const el = document.getElementById('bg-skip');
    return !!el && !el.hidden;
  });
  if (!hadSkip) ok('the Sim the rest control is offered (seed ' + seed + ')', false);
  await page.click('#b-boss-fast', { timeout: 3000 }).catch(() => {});
  const wentAway = await page.evaluate(() => document.getElementById('bg-skip').hidden);
  if (!wentAway) ok('  and pressing it takes it away (seed ' + seed + ')', false);

  let sawCall = false;
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => ({
      done: !document.getElementById('bg-done').hidden,
      call: !document.getElementById('bg-calls').hidden
        && !!document.querySelector('#bg-calls .bcall'),
    }));
    if (st.done) break;
    if (st.call) {
      sawCall = true;
      const took = await page.evaluate((pref) => {
        const bs = [...document.querySelectorAll('#bg-calls .bcall')];
        const b = bs.find((x) => x.dataset.c === pref) || bs[0];
        if (!b) return null;
        b.click();
        return b.dataset.c;
      }, PREF);
      if (took) calls++;
      continue;
    }
    await page.waitForTimeout(60);
  }
  if (!sawCall) skipped++;

  const rows = await page.evaluate(() => [...document.querySelectorAll('#bg-log .pl')].map((el) => ({
    cls: el.className,
    who: (el.querySelector('.w') || {}).textContent || '',
    n: (el.querySelector('.n') || {}).textContent || '',
  })));
  if (!rows.length) { ok('seed ' + seed + ' produced a drive log', false); continue; }
  games++;

  /* Newest first on screen, so a reader checks it from the bottom up and so does this. */
  const fwd = rows.slice().reverse();
  let py = 0, pt = 0;
  const faults = [];
  for (const r of fwd) {
    const m = /(\d+)-(\d+)/.exec(r.n);
    if (!m) { faults.push('unreadable score "' + r.n + '"'); continue; }
    const you = +m[1], them = +m[2];
    const mine = /^You/.test(r.who.trim());
    /* `quiet` is the class the painter puts on a drive that scored nothing, which is the
       painter's own answer to the question rather than this file reparsing the phrase. */
    const scored = !/\bquiet\b/.test(r.cls);
    const at = '"' + r.who.trim().replace(/\s+/g, ' ').slice(0, 34) + '"';
    if (you < py || them < pt) faults.push('went backwards at ' + at + ' ' + r.n);
    /* THE ONE THAT MATTERS, and it is the reported bug stated as a property. */
    if (!mine && you !== py) faults.push('YOUR score moved on THEIR drive: ' + at + ' ' + py + '->' + you);
    if (mine && them !== pt) faults.push('THEIR score moved on YOUR drive: ' + at + ' ' + pt + '->' + them);
    if (!scored && (you !== py || them !== pt)) {
      faults.push('a drive that scored nothing moved the board: ' + at);
    }
    py = you; pt = them;
  }
  const bug = await page.evaluate(() => document.getElementById('bg-syou').textContent
    + '-' + document.getElementById('bg-sthem').textContent);
  ok('seed ' + seed + ': ' + rows.length + ' drives, the column agrees with itself',
    faults.length === 0, faults.slice(0, 2).join(' | ') || bug);
  /* AND IT ENDS WHERE THE BUG DOES. The column can be self-consistent and still drift away
     from the scoreboard, which is the other half of what a reader checks. */
  ok('  and the last row is the final on the bug',
    fwd[fwd.length - 1].n === bug, fwd[fwd.length - 1].n + ' vs ' + bug);
  ok('  and the verdict is up', await page.evaluate(() =>
    !document.getElementById('bg-done').hidden && document.getElementById('bg-skip').hidden));
}

/*
 * THE CONTROL DOES NOT TAKE THE CALLS, which is the reason it is a fast-forward rather than
 * an auto-play. Fourth down and the two point try are the mode; a button that answered them
 * would hand the game the one part the player came for.
 *
 * Asserted across the sample rather than per run, because whether a given seed produces a
 * decision at all is the sim's business.
 */
ok('the calls still had to be made by hand', calls > 0, calls + ' taken across ' + games + ' games');
ok('  and they were not skipped past', skipped < SEEDS.length,
  skipped + ' of ' + SEEDS.length + ' games saw none');
ok('nothing threw', boom.length === 0, boom.join(' | ') || 'no errors');

console.log('');
console.log(fails ? fails + ' FAILED' : 'the boss log agrees with the bug, across '
  + games + ' games and ' + calls + ' calls');
await browser.close();
process.exit(fails ? 1 : 0);
