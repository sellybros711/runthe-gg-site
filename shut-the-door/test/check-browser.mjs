/* Shut The Door: the page, played in Chromium.
 *
 *   node shut-the-door/test/check-browser.mjs
 *   SHOTS=/some/dir node shut-the-door/test/check-browser.mjs   and a screenshot of every screen
 *
 * Serves the repo root with a tiny static server, then at 390x844 and at
 * 1440x900:
 *   1. home loads, with the pitcher's card and the situation, and no tutorial
 *      opens by itself
 *   2. every sheet opens from its button and closes: menu, how to play,
 *      stats, past dailies, settings, account
 *   3. the grid is the pitcher's view: cell 0 (catcher's left) is drawn on the
 *      right, through screenCol()
 *   4. take the mound, scout the batter (the heat map lands on the same grid)
 *   5. throw a whole outing to a result: every pitch animates, a tap skips it,
 *      a grade card follows and a tap dismisses it
 *   6. the result: outcome, strip, percentile, pitched like, the reveal, share
 *   7. run it back is practice; a reload shows today as done
 *   8. ?debug=1 shows the seed
 *   9. no page error and no console error anywhere
 *  10. the framing: the whole batter, catcher and umpire are in frame for a
 *      left and a right handed hitter
 *  11. all three endings, forced through the mock (?mockEnd=): door shut,
 *      door's open (a runner put out on a double play, then the tying run)
 *      and walk-off (runners moving up, then scoring), with the runners on
 *      the field and on the scorebar's diamond; the proxy note and a reveal
 *      with no pitch count; the stats sheet from the account and from the
 *      device
 *  12. the lesson card on every result: with a pro example, without one
 *      (?mockPro=none), and with no lesson (?mockLesson=none); never a modal
 *
 * Runs on the mock (mock-api.js) until api.js lands; the steps only use the
 * page, so they hold for the real engine too.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  const tries = ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const t of tries) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

let passes = 0, fails = 0;
function ok(c, m) { if (c) { passes++; console.log('  ok ' + m); } else { fails++; console.log('  FAIL ' + m); } }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/shut-the-door/';

const pw = loadPlaywright();
/* one running number per screen size, across the main run and the endings */
const SHOT_N = {};
const nextN = (tag) => { SHOT_N[tag] = (SHOT_N[tag] || 0) + 1; return String(SHOT_N[tag]).padStart(2, '0'); };
const browser = await pw.chromium.launch(CHROME ? { executablePath: CHROME } : {});

async function run(w, h) {
  console.log(`\n${w}x${h}`);
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/shut-the-door\/$/, '') });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  /* nothing leaves the machine: the fonts answer empty, anything else is refused */
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  const shot = async (name, full) => {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `${tag}-${nextN(tag)}-${name}.png`), fullPage: !!full });
  };

  /* 1 */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-main:not([hidden])', { timeout: 15000 });
  await page.waitForSelector('#b-take', { state: 'visible' });
  const home = await page.evaluate(() => ({
    title: document.getElementById('h-title').textContent,
    ars: document.querySelectorAll('#h-pitcher .ars li:not(.hd)').length,
    sit: document.getElementById('h-sit').textContent,
    openSheets: [...document.querySelectorAll('.sheet')].filter((s) => !s.hidden).length,
    robots: document.querySelector('meta[name=robots]').content,
  }));
  ok(home.title.length > 0 && home.ars >= 2 && /up/.test(home.sit), '1 home shows the spot, the situation and the arsenal (' + home.ars + ' pitches)');
  ok(home.openSheets === 0, '1 no sheet or tutorial opened by itself');
  ok(/noindex/.test(home.robots), '1 the page is noindexed');
  await shot('home', true);

  /* 2 */
  for (const [btn, id, name] of [['#b-menu', 'sheet-menu', 'menu'], ['[data-open="how"]', 'sheet-how', 'how'], ['[data-open="stats"]', 'sheet-stats', 'stats'],
    ['[data-open="past"]', 'sheet-past', 'past'], ['[data-open="settings"]', 'sheet-settings', 'settings'], ['#b-profile', 'sheet-auth', 'account']]) {
    await page.click('#h-main ' + btn + ', header ' + btn);
    await page.waitForSelector('#' + id + '.on', { timeout: 3000 });
    await page.waitForTimeout(260);
    const filled = await page.evaluate((i) => document.querySelector('#' + i + ' .sh-in').textContent.trim().length, id);
    ok(filled > 20, '2 ' + name + ' opens and has something in it');
    await shot('sheet-' + name);
    await page.click('#' + id + ' .sh-x');
    await page.waitForSelector('#' + id, { state: 'hidden', timeout: 3000 });
  }
  /* pitching 101: from the menu, and from inside how to play */
  await page.click('header #b-menu');
  await page.waitForSelector('#sheet-menu.on');
  await page.click('#sheet-menu [data-open="101"]');
  await page.waitForSelector('#sheet-101.on', { timeout: 3000 });
  const p101 = await page.evaluate(() => ({ n: document.querySelectorAll('#p101-body .p101 li').length, keys: [...document.querySelectorAll('#p101-body .p101 li')].map((l) => l.dataset.principle) }));
  ok(p101.n === 11, '2 pitching 101 opens from the menu with every principle (' + p101.n + ')');
  await page.waitForTimeout(260);
  await shot('sheet-101');
  await page.click('#sheet-101 .sh-x');
  await page.click('#h-main [data-open="how"]');
  await page.waitForSelector('#sheet-how.on');
  await page.click('#how-body [data-open-101]');
  ok(await page.isVisible('#sheet-101'), '2 how to play links to pitching 101');
  await page.click('#sheet-101 .sh-x');
  await page.waitForSelector('#sheet-101', { state: 'hidden' });

  /* the theme flips and the scene repaints in the other palette */
  const t0 = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('#b-theme');
  const t1 = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('runthegrid_theme')]);
  ok(t1[0] !== t0 && t1[1] === t1[0], '2 the theme button flips the site theme key (' + t0 + ' to ' + t1[0] + ')');
  await shot('home-' + t1[0], true);
  await page.click('#b-theme');

  /* 3 and 4 */
  await page.click('#b-take');
  await page.waitForSelector('#s-mound.on .grid .cell', { timeout: 5000 });
  await page.waitForTimeout(200);
  const mirror = await page.evaluate(() => {
    const r = (c) => document.querySelector('#m-scene .grid .cell[data-cell="' + c + '"]').getBoundingClientRect();
    const C = window.STD_CONTRACT;
    return { c0: r(0).left, c4: r(4).left, c20: r(20).top, c0t: r(0).top, sc: C.screenCol(0), w: r(12).width, hgt: r(12).height };
  });
  ok(mirror.c0 > mirror.c4 && mirror.sc === 4, '3 the grid is the pitcher\'s view: cell 0 is drawn right of cell 4');
  ok(mirror.c20 > mirror.c0t, '3 row 0 is high, row 4 is low');
  ok(mirror.w >= 36 && mirror.hgt >= 36, '3 a cell is big enough to tap (' + Math.round(mirror.w) + 'x' + Math.round(mirror.hgt) + ')');
  await shot('mound');
  await page.click('#m-batter');
  await page.waitForSelector('#m-scout:not([hidden])');
  const heat = await page.evaluate(() => [...document.querySelectorAll('#m-scene .grid .cell')].filter((c) => c.style.background).length);
  ok(heat === 25, '4 scouting paints the heat map on the same 25 cells');
  await shot('scout');
  await page.click('#m-scout [data-heat="swing"]');
  await shot('scout-swings');
  await page.click('#m-batter');
  ok(await page.evaluate(() => document.getElementById('m-scout').hidden), '4 scouting closes on a second tap');

  /* 10 */
  for (const hand of ['L', 'R']) {
    const fr = await page.evaluate((hand) => {
      const S = window.STD_UI.state, was = S.scene.bat;
      const b = S.scn.batters.find((x) => x.bats === hand);
      S.scene.setBatter(b); S.grid.place(S.scene.gridRect()); S.scene.draw({});
      const f = S.scene.figureBoxes();
      const c = document.querySelector('#m-scene .grid .cell[data-cell="12"]').getBoundingClientRect();
      return { f, cell: [c.width, c.height], was: S.scn.batters.indexOf(was) };
    }, hand);
    const inside = (bx) => bx.x0 >= 0 && bx.x1 <= fr.f.W && bx.y0 >= 0 && bx.y1 <= fr.f.H;
    ok(inside(fr.f.batter) && inside(fr.f.catcher) && inside(fr.f.umpire),
      '10 a ' + (hand === 'L' ? 'left' : 'right') + ' handed hitter, the catcher and the umpire are all in frame (batter ' + fr.f.batter.x0 + '-' + fr.f.batter.x1 + ' of ' + fr.f.W + ')');
    ok(fr.cell[0] >= 44 && fr.cell[1] >= 44, '10 cells stay tappable with him in frame (' + Math.round(fr.cell[0]) + 'x' + Math.round(fr.cell[1]) + ')');
    await shot('framing-' + hand);
    await page.evaluate((i) => { const S = window.STD_UI.state; S.scene.setBatter(S.scn.batters[i]); S.grid.place(S.scene.gridRect()); S.scene.draw({}); }, fr.was);
  }

  /* 5 */
  const CELLS = [23, 12, 7, 21, 18, 3, 16, 13, 22, 8, 11, 24];
  let pitches = 0, cards = 0, sawBall = false;
  for (let i = 0; i < 80; i++) {
    const done = await page.evaluate(() => document.getElementById('s-result').classList.contains('on'));
    if (done) break;
    const nTypes = await page.$$eval('#m-arsenal .pitch', (b) => b.length);
    await page.click(`#m-arsenal .pitch >> nth=${i % nTypes}`);
    await page.click(`#m-scene .grid .cell[data-cell="${CELLS[i % CELLS.length]}"]`);
    if (i === 0) await shot('ready');
    const label = await page.textContent('#m-throw');
    if (!/throw|shut it/.test(label)) { ok(false, '5 the throw button is ready (' + label + ')'); break; }
    await page.click('#m-throw');
    pitches++;
    if (i === 0) {
      await page.waitForTimeout(640);
      sawBall = true;
      await shot('pitch-flight');
      await page.waitForSelector('#g-card.on', { timeout: 6000 });
      await page.waitForTimeout(350);
      await shot('grade-card');
    } else {
      await page.waitForTimeout(120);
      await page.mouse.click(w / 2, Math.round(h * 0.45));
      await page.waitForSelector('#g-card.on', { timeout: 6000 });
      await page.waitForTimeout(300);
    }
    cards++;
    await page.mouse.click(w / 2, Math.round(h * 0.3));
    await page.waitForSelector('#g-card', { state: 'hidden', timeout: 3000 });
    await page.waitForFunction(() => document.getElementById('s-result').classList.contains('on') || !document.getElementById('m-throw').textContent.includes('pitching'), null, { timeout: 5000 });
  }
  ok(sawBall, '5 the first pitch played its animation');
  ok(pitches > 0 && cards === pitches, '5 every pitch got a grade card (' + pitches + ' pitches)');
  await page.waitForSelector('#s-result.on', { timeout: 5000 });

  /* 6 */
  const res = await page.evaluate(() => ({
    outcome: document.getElementById('r-outcome').textContent,
    squares: document.querySelectorAll('#r-strip .sq').length,
    pct: document.getElementById('r-pct').textContent,
    like: document.getElementById('r-like').textContent,
    reveal: document.getElementById('r-reveal').textContent,
    labels: Object.values(window.STD_CONTRACT.OUTCOME_LABEL),
  }));
  ok(res.labels.includes(res.outcome), '6 the outcome reads ' + res.outcome);
  ok(res.squares === pitches, '6 the strip has a square per pitch');
  ok(/^\d+%$/.test(res.pct) && res.like.length > 1, '6 percentile ' + res.pct + ', pitched like ' + res.like);
  ok(/did/.test(res.reveal), '6 the reveal shows what the real pitcher did');
  await shot('result', true);
  await page.click('#r-share');
  await page.waitForSelector('#toast.on', { timeout: 3000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/Shut The Door #\d+/.test(clip) && /runthe\.gg\/shut-the-door/.test(clip) && ![...clip].some((ch) => ch.charCodeAt(0) === 0x2013 || ch.charCodeAt(0) === 0x2014), '6 share copies the share text');
  await shot('shared');

  /* 7 */
  await page.click('#r-again');
  await page.waitForSelector('#s-mound.on');
  const practice = await page.evaluate(() => window.STD_UI.state.outing.mode);
  ok(practice === 'practice', '7 run it back starts a practice outing');
  await shot('practice');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-done:not([hidden])', { timeout: 8000 });
  ok(await page.isHidden('#b-take'), '7 after a reload today shows as done');
  await shot('home-done', true);

  /* 8 */
  await page.goto(BASE + '?debug=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#h-main:not([hidden])');
  await page.click('#d-again');
  await page.waitForSelector('#s-mound.on');
  const dbg = await page.evaluate(() => { const d = document.getElementById('m-dbg'); return !d.hidden && /seed/.test(d.textContent); });
  ok(dbg, '8 ?debug=1 shows the seed');
  await shot('debug');

  /* 9 */
  ok(errors.length === 0, '9 no page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

/* 11: one forced outing per ending */
async function ending(w, h, end, extra) {
  const tag = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  const shot = async (name, full) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${tag}-${nextN(tag)}-${end}-${name}.png`), fullPage: !!full }); };
  await page.goto(BASE + '?mockEnd=' + end + (extra || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-take', { state: 'visible', timeout: 15000 });
  const proxy = /mockProxy/.test(extra || '');
  if (proxy) {
    ok(await page.isVisible('#h-proxy'), '11 ' + end + ': the proxy note is on the home screen');
    await shot('home-proxy', true);
  }
  await page.click('#b-take');
  await page.waitForSelector('#s-mound.on .grid .cell');
  if (proxy) ok(await page.isVisible('#m-proxy'), '11 ' + end + ': the proxy note is on the mound, small');
  let sawOut = false, sawRun = false, sawMove = false, k = 0;
  for (; k < 30; k++) {
    if (await page.evaluate(() => document.getElementById('s-result').classList.contains('on'))) break;
    await page.click('#m-arsenal .pitch >> nth=0');
    await page.click('#m-scene .grid .cell[data-cell="12"]');
    await page.click('#m-throw');
    /* watch the runners for this play, then let the card come */
    let shotTaken = false;
    for (let t = 0; t < 60; t++) {
      await page.waitForTimeout(50);
      const r = await page.evaluate(() => ({ dots: document.querySelectorAll('#m-runners circle').length, outs: document.querySelectorAll('#m-runners circle.out').length, card: document.getElementById('g-card').classList.contains('on') }));
      if (r.dots) sawMove = true;
      if (r.outs) sawOut = true;
      if (r.dots && !shotTaken && t > 22) { shotTaken = true; await shot('runners-p' + (k + 1)); }
      if (r.card) break;
    }
    await page.waitForSelector('#g-card.on', { timeout: 8000 });
    await page.waitForTimeout(300);
    await page.mouse.click(w / 2, Math.round(h * 0.3));
    await page.waitForSelector('#g-card', { state: 'hidden', timeout: 3000 });
    await page.waitForFunction(() => document.getElementById('s-result').classList.contains('on') || !document.getElementById('m-throw').textContent.includes('pitching'), null, { timeout: 5000 });
  }
  await page.waitForSelector('#s-result.on', { timeout: 5000 });
  const res = await page.evaluate(() => ({ o: document.getElementById('r-outcome').textContent, cls: document.getElementById('r-outcome').className, rv: document.getElementById('r-reveal').textContent, st: document.getElementById('r-streak').textContent, them: window.STD_UI.state.outing.score.them, start: window.STD_UI.state.scn.situation.score.them }));
  sawRun = res.them > res.start;
  ok(res.cls.includes(end), '11 ' + end + ': the outing ends ' + res.o + ' after ' + k + ' pitches');
  if (end !== 'door_shut') {
    ok(sawMove, '11 ' + end + ': runners move on the field and the diamond');
    ok(sawRun, '11 ' + end + ': runs score (' + res.start + ' to ' + res.them + ')');
  }
  if (end === 'doors_open') ok(sawOut, '11 doors_open: the double play shows a runner put out');
  if (/mockNull/.test(extra || '')) ok(/at least 13 pitches/.test(res.rv), '11 ' + end + ': a reveal with no pitch count shows its note');
  const auth = /mockAuth/.test(extra || '');
  if (auth) ok(/#\d+ of \d+ today/.test(res.st), '11 ' + end + ': signed in, the result shows the account\'s rank');
  /* 12: the lesson card */
  const lessonNone = /mockLesson=none/.test(extra || ''), proNone = /mockPro=none/.test(extra || '');
  const ls = await page.evaluate(() => {
    const el = document.getElementById('r-lesson');
    return { text: el.textContent, none: el.classList.contains('none'), head: (el.querySelector('.ls-head') || {}).textContent || '',
      you: !!el.querySelector('#ls-mini .cell.m-target'), best: !!el.querySelector('#ls-mini .cell.m-best'),
      modal: [...document.querySelectorAll('.sheet')].some((s) => !s.hidden) };
  });
  ok(!ls.modal, '12 ' + end + ': the lesson is a card, nothing opened over the result');
  if (lessonNone || ls.none) {
    ok(/nothing to fix\. every pitch was the right idea\./.test(ls.text), '12 ' + end + ': no lesson reads the contract\'s line' + (lessonNone ? '' : ' (every pitch green)'));
    await shot('lesson-none');
  } else {
    ok(ls.head.length > 3 && ls.you && ls.best, '12 ' + end + ': the lesson shows its headline and your pitch against the best on a mini grid');
    await page.click('#ls-more');
    const body = await page.evaluate(() => ({ why: document.querySelectorAll('#ls-body .ls-why li').length, num: (document.querySelector('#ls-body .ls-num') || {}).textContent || '',
      pro: !!document.querySelector('#ls-body .ls-pro'), proCell: !!document.querySelector('#ls-pro-mini .cell.m-actual'), next: document.querySelector('#r-lesson .ls-next').textContent }));
    ok(body.why >= 2 && body.why <= 3 && /hold [\d.]+% with your pitch/.test(body.num) && body.next.length > 5, '12 ' + end + ': opened, it has ' + body.why + ' why lines, the numbers and next time');
    ok(proNone ? !body.pro : body.pro && body.proCell, '12 ' + end + ': ' + (proNone ? 'no pro example, no pro block' : 'how the pros do it shows the pro\'s pitch on a mini grid'));
    await page.evaluate(() => document.getElementById('r-lesson').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(120);
    await shot(proNone ? 'lesson-no-pro' : 'lesson');
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await shot('result', true);
  await page.click('#r-home');
  await page.click('#h-main [data-open="stats"]');
  await page.waitForSelector('#sheet-stats.on');
  await page.waitForFunction(() => !/loading/.test(document.getElementById('stats-body').textContent), null, { timeout: 3000 });
  const src = await page.textContent('#stats-body .src-tag');
  ok(auth ? src === 'your account' : src === 'this device', '11 ' + end + ': the stats sheet reads ' + src);
  await page.waitForTimeout(250);
  await shot('stats-' + (auth ? 'account' : 'device'));
  ok(errors.length === 0, '11 ' + end + ': no page or console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

try {
  await run(390, 844);
  await run(1440, 900);
  console.log('\nthe three endings');
  await ending(390, 844, 'door_shut', '&mockLesson=none');
  await ending(390, 844, 'doors_open', '&mockPro=none');
  await ending(390, 844, 'walk_off', '&mockProxy=1&mockNull=1&mockAuth=1');
  await ending(1440, 900, 'door_shut', '&mockLesson=none');
  await ending(1440, 900, 'doors_open', '&mockAuth=1');
  await ending(1440, 900, 'walk_off', '&mockPro=none');
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e && e.message ? e.message.split('\n')[0] : e));
}
await browser.close();
server.close();
console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
