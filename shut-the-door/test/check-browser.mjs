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
 *   5. throw a whole outing to a result: every pitch animates, a tap skips it
 *      and none is needed. Between the first pitch and the last nothing is
 *      graded or tipped: no grade card, no strip square, no band word, no
 *      banner, flash or sheet, and nothing over the field (the owner,
 *      2026-10-17). One quiet play by play line under the scoreboard.
 *   6. the end reveal: outcome, strip, percentile, pitched like and the real
 *      pitcher's night, on screen together; share
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
 *  13. the brand: the outlined lockup in the header for the theme, the
 *      manifest and its icons, the favicons and the apple touch icon
 *  12. the pitching coach: never open by itself, opens from its button, says
 *      one line on the outing, then the lesson (your call against the best on
 *      the mirrored mini grid, the why, next time, the numbers, how the pros
 *      do it when there is a pro), then the pattern, then the whole outing
 *      pitch by pitch with band and reason. On the real engine and on the
 *      mock: a pro, no pro (?mockPro=none) and no lesson (?mockLesson=none)
 *
 * Steps 1 to 10 play the real engine (no mock switch). Step 11 forces each
 * ending through mock-api.js.
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

const TYPES = { '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
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


/* ---- shared steps ------------------------------------------------------- */

/* The owner's rule while pitching: nothing graded, nothing tipped, nothing
   over the field. Returns what broke it, or an empty list. */
async function quietProblems(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
    };
    const mound = document.getElementById('s-mound'), out = [];
    if ([...mound.querySelectorAll('.sq, .pill, .strip')].some(vis)) out.push('a grade square');
    const text = mound.innerText;
    if (/\b(green|yellow|orange|red)\b/i.test(text)) out.push('a band word');
    if (/\b(best call|pts|hold \d|next time)\b/i.test(text)) out.push('grade copy');
    if ([...document.querySelectorAll('.gcard, .callout, .flash, #toast.on')].some(vis)) out.push('a banner or card');
    if ([...document.querySelectorAll('.sheet')].some((s) => !s.hidden)) out.push('a sheet');
    const sc = document.getElementById('m-scene').getBoundingClientRect();
    const fine = (el) => el && (el.tagName === 'CANVAS' || el.closest('.grid') || el.id === 'm-proxy' || el.id === 'm-dbg');
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
      const el = document.elementFromPoint(sc.left + sc.width * i / 6, sc.top + sc.height * j / 6);
      if (!fine(el)) { out.push('over the field: ' + (el ? el.id || el.className || el.tagName : 'nothing')); return out; }
    }
    return out;
  });
}

/* Throw a whole outing. The first pitch gets no tap at all, to show the game
   goes on by itself; later ones are skipped with a tap. The quiet rule is
   checked through each flight and after it. */
async function playOuting(page, o) {
  const CELLS = o.cells || [23, 12, 7, 21, 18, 3, 16, 13, 22, 8, 11, 24];
  const r = { pitches: 0, problems: [], sawMove: false, sawOut: false, pbp: [] };
  const done = () => page.evaluate(() => document.getElementById('s-result').classList.contains('on'));
  for (let i = 0; i < 80; i++) {
    if (await done()) break;
    const nTypes = await page.$$eval('#m-arsenal .pitch', (b) => b.length);
    await page.click(`#m-arsenal .pitch >> nth=${o.type0 ? 0 : i % nTypes}`);
    await page.click(`#m-scene .grid .cell[data-cell="${o.cell != null ? o.cell : CELLS[i % CELLS.length]}"]`);
    if (i === 0 && o.shot) await o.shot('ready');
    const label = await page.textContent('#m-throw');
    if (!/throw|shut it/.test(label)) { r.problems.push('the throw button was not ready: ' + label); break; }
    await page.click('#m-throw');
    r.pitches++;
    const tapless = i === 0 || !!o.noSkip;
    let shotTaken = false;
    for (let t = 0; t < 80; t++) {
      await page.waitForTimeout(tapless ? 90 : 60);
      if (!tapless && t === 2) await page.mouse.click(o.w / 2, Math.round(o.h * 0.5));
      const s = await page.evaluate(() => ({ dots: document.querySelectorAll('#m-runners circle').length, outs: document.querySelectorAll('#m-runners circle.out').length,
        busy: /pitching/.test(document.getElementById('m-throw').textContent), over: document.getElementById('s-result').classList.contains('on') }));
      if (s.dots) r.sawMove = true;
      if (s.outs) r.sawOut = true;
      if (s.over) break;
      const q = await quietProblems(page);
      if (q.length) r.problems.push('pitch ' + r.pitches + ': ' + q.join(', '));
      if (i === 0 && t === 8 && o.shot && !shotTaken && !o.runnerShots) { shotTaken = true; await o.shot('pitch-flight'); }
      if (o.runnerShots && s.dots && !shotTaken && t > 6) { shotTaken = true; await o.shot('runners-p' + r.pitches); }
      if (!s.busy) break;
    }
    if (await done()) break;
    const after = await quietProblems(page);
    if (after.length) r.problems.push('after pitch ' + r.pitches + ': ' + after.join(', '));
    r.pbp.push(await page.textContent('#m-pbp'));
    if (i === 0 && o.shot) await o.shot('after-pitch');
  }
  await page.waitForSelector('#s-result.on', { timeout: 6000 });
  return r;
}

/* The end: everything at once, the coach still closed. */
async function revealCheck(page, label, pitches) {
  const rv = await page.evaluate(() => {
    const vis = (id) => { const el = document.getElementById(id); const b = el && el.getBoundingClientRect(); return !!(b && b.width > 0 && b.height > 0); };
    return { outcome: vis('r-outcome') && document.getElementById('r-outcome').textContent, strip: document.querySelectorAll('#r-strip .sq').length,
      pct: vis('r-pct') && document.getElementById('r-pct').textContent, like: vis('r-like'), real: vis('r-reveal'), coachBtn: vis('r-coach'),
      sheetOpen: [...document.querySelectorAll('.sheet')].some((s) => !s.hidden), labels: Object.values(window.STD_CONTRACT.OUTCOME_LABEL) };
  });
  ok(rv.labels.includes(rv.outcome) && rv.strip === pitches && /^\d+(st|nd|rd|th)$/.test(rv.pct) && rv.like && rv.real,
    label + ': the end reveals the outcome (' + rv.outcome + '), the strip (' + rv.strip + '), the percentile (' + rv.pct + '), pitched like and the real one together');
  ok(rv.coachBtn && !rv.sheetOpen, label + ': "talk to pitching coach" is there and nothing opened by itself');
}

/* The coach: only from its button; the lesson; the pro or not; every pitch. */
async function coachCheck(page, label, pitches, expect, shot) {
  await page.waitForTimeout(1200);
  ok(await page.isHidden('#sheet-coach'), label + ': the coach does not open by itself');
  await page.click('#r-coach');
  await page.waitForSelector('#sheet-coach.on', { timeout: 3000 });
  await page.waitForSelector('#coach-chips [data-chip="rest"]', { timeout: 20000 });
  const c = await page.evaluate(() => {
    const L = window.STD_UI.state.result.lesson, log = document.getElementById('coach-log');
    const lc = log.querySelector('.cc.lesson'), pc = log.querySelector('.cc.pro');
    return { L: L ? { why: (L.why || []).length, pro: !!L.pro, pattern: !!L.pattern } : null, text: log.innerText,
      opener: (log.querySelector('.cm.coach') || {}).textContent || '',
      lesson: !!lc, you: !!(lc && lc.querySelector('.cell.m-target')), best: !!(lc && lc.querySelector('.cell.m-best')),
      why: lc ? lc.querySelectorAll('.cc-why li').length : 0, next: !!(lc && lc.querySelector('.cc-next')), num: !!(lc && lc.querySelector('.cc-num')),
      pro: !!pc, proCell: !!(pc && pc.querySelector('.cell.m-actual')), pattern: !!log.querySelector('.cm.pattern') };
  });
  ok(/\d+ pitch/.test(c.opener), label + ': the coach opens with one line on the outing');
  if (expect && 'lesson' in expect) ok(!!c.L === expect.lesson, label + ': the result ' + (expect.lesson ? 'has' : 'has no') + ' lesson, as forced');
  if (!c.L) {
    ok(/nothing to fix\. every pitch was the right idea\./.test(c.text) && !c.lesson, label + ': no lesson, the coach says the contract\'s line');
  } else {
    ok(c.lesson && c.you && c.best, label + ': the lesson shows your pitch against the best on the mirrored mini grid');
    ok(c.why === c.L.why && c.why >= 2 && c.next && c.num, label + ': with ' + c.why + ' why lines, next time and the numbers');
    ok(c.pro === c.L.pro && (!c.pro || c.proCell), label + ': ' + (c.L.pro ? 'how the pros do it, with the pro\'s pitch on a grid' : 'no pro example, no pro block'));
    if (expect && 'pro' in expect) ok(c.L.pro === expect.pro, label + ': the pro is ' + (expect.pro ? 'there' : 'null') + ', as forced');
    ok(c.pattern === c.L.pattern, label + ': the pattern line ' + (c.L.pattern ? 'shows' : 'is absent, as in the lesson'));
  }
  if (shot) await shot(c.L ? (c.L.pro ? 'coach-lesson' : 'coach-lesson-no-pro') : 'coach-no-lesson');
  await page.click('#coach-chips [data-chip="rest"]');
  await page.waitForSelector('#coach-chips [data-chip="done"]', { timeout: 20000 });
  const rv = await page.evaluate(() => [...document.querySelectorAll('#coach-log .review li')].map((li) => ({ band: li.dataset.band, why: (li.querySelector('.rv-why') || {}).textContent || '' })));
  ok(rv.length === pitches && rv.every((x) => /^(green|yellow|orange|red)$/.test(x.band) && x.why.length > 5), label + ': going through the rest lists all ' + rv.length + ' pitches with band and reason');
  if (shot) await shot('coach-review');
  await page.click('#coach-chips [data-chip="done"]');
  await page.waitForSelector('#sheet-coach', { state: 'hidden', timeout: 3000 });
}

async function run(w, h, theme) {
  console.log(`\n${w}x${h}, ${theme}`);
  const tag = w + '-' + theme;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/shut-the-door\/$/, '') });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('runthegrid_theme', t); } catch (e) {} }, theme);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  /* nothing leaves the machine: the fonts answer empty, anything else is refused */
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    // supabase-js from the CDN: an empty script, so auth.js stays signed out with no network
    if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
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
  ok(home.title.length > 0 && home.ars >= 2 && /lead/.test(home.sit) && /out/.test(home.sit), '1 home shows the spot, the situation and the arsenal (' + home.ars + ' pitches)');
  ok(home.openSheets === 0, '1 no sheet or tutorial opened by itself');
  ok(/noindex/.test(home.robots), '1 the page is noindexed');
  await shot('home', true);

  /* 13: the brand. The outlined lockup in the header, the icons, the manifest */
  const brand = await page.evaluate(async () => {
    const bm = async (src) => { const b = await createImageBitmap(await (await fetch(src)).blob()); return [b.width, b.height]; };
    const imgs = [...document.querySelectorAll('.hdr .lockup img')].filter((i) => getComputedStyle(i).display !== 'none');
    const wm = await (await fetch(document.querySelector('.hdr .wm-light').getAttribute('src'))).text();
    const man = JSON.parse(await (await fetch(document.querySelector('link[rel=manifest]').getAttribute('href'))).text());
    const icons = [];
    for (const ic of man.icons) icons.push({ sizes: ic.sizes, purpose: ic.purpose, px: (await bm(ic.src)).join('x') });
    const heads = [];
    for (const l of document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')) heads.push((l.getAttribute('sizes') || 'touch') + '=' + (await bm(l.getAttribute('href'))).join('x'));
    return { shown: imgs.length, loaded: imgs.every((i) => i.complete && i.naturalWidth > 0), wmVisible: imgs.some((i) => i.classList.contains('wm')),
      outlined: /<path/.test(wm) && !/<text/.test(wm), name: man.name, themeColor: man.theme_color, display: man.display, icons, heads,
      theme: document.documentElement.dataset.theme, meta: document.getElementById('themeMeta').content };
  });
  ok(brand.shown === 2 && brand.loaded && brand.wmVisible, '13 the header shows the mark and the ' + brand.theme + ' wordmark, both loaded');
  ok(brand.outlined, '13 the wordmark is outlined paths, with no live font');
  ok(brand.name === 'Shut The Door' && /^#[0-9a-f]{6}$/i.test(brand.themeColor) && brand.display === 'standalone', '13 the manifest names the game, in the palette (' + brand.themeColor + ')');
  const want = ['192x192 any 192x192', '512x512 any 512x512', '512x512 maskable 512x512'];
  ok(want.every((x) => brand.icons.some((i) => i.sizes + ' ' + i.purpose + ' ' + i.px === x)), '13 the manifest icons are 192, 512 and a maskable 512, at their sizes');
  ok(['32x32=32x32', '16x16=16x16', 'touch=180x180'].every((x) => brand.heads.includes(x)), '13 favicon 32 and 16 and the apple touch icon 180 are linked and the right size');

  /* 2 */
  for (const [btn, id, name] of [['#b-menu', 'sheet-menu', 'menu'], ['[data-open="how"]', 'sheet-how', 'how'], ['[data-open="stats"]', 'sheet-stats', 'stats'],
    ['@menu [data-open="past"]', 'sheet-past', 'past'], ['[data-open="settings"]', 'sheet-settings', 'settings'], ['#b-profile', 'sheet-auth', 'account']]) {
    /* past dailies lives in the menu only */
    if (btn.startsWith('@menu')) { await page.click('header #b-menu'); await page.waitForSelector('#sheet-menu.on'); await page.click('#sheet-menu ' + btn.slice(6)); }
    else await page.click('#h-main ' + btn + ', header ' + btn);
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
  const play = await playOuting(page, { w, h, shot });
  ok(play.pitches > 0, '5 a whole outing on the real engine (' + play.pitches + ' pitches)');
  ok(play.problems.length === 0, '5 nothing graded, tipped or over the field from the first pitch to the last' + (play.problems.length ? ': ' + play.problems.slice(0, 3).join(' | ') : ''));
  ok(play.pbp.length && play.pbp.every((x) => x && x.length > 3), '5 one line of play by play after each pitch ("' + (play.pbp[0] || '') + '")');

  /* 6 */
  await revealCheck(page, '6', play.pitches);
  await shot('result', true);
  await page.click('#r-share');
  await page.waitForSelector('#toast.on', { timeout: 3000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/Shut The Door #\d+/.test(clip) && /runthe\.gg\/shut-the-door/.test(clip) && ![...clip].some((ch) => ch.charCodeAt(0) === 0x2013 || ch.charCodeAt(0) === 0x2014), '6 share copies the share text');
  await shot('shared');

  /* 12, on the real engine */
  await coachCheck(page, '12', play.pitches, null, shot);

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
    // supabase-js from the CDN: an empty script, so auth.js stays signed out with no network
    if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
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
  const play = await playOuting(page, { w, h, shot, runnerShots: end !== 'door_shut', type0: true, cell: 12, noSkip: end !== 'door_shut' });
  const k = play.pitches, sawMove = play.sawMove, sawOut = play.sawOut;
  ok(play.problems.length === 0, '11 ' + end + ': nothing graded, tipped or over the field during play' + (play.problems.length ? ': ' + play.problems.slice(0, 3).join(' | ') : ''));
  const res = await page.evaluate(() => ({ o: document.getElementById('r-outcome').textContent, cls: document.getElementById('r-outcome').className, rv: document.getElementById('r-reveal').textContent, st: document.getElementById('r-streak').textContent, them: window.STD_UI.state.outing.score.them, start: window.STD_UI.state.scn.situation.score.them }));
  const sawRun = res.them > res.start;
  ok(res.cls.includes(end), '11 ' + end + ': the outing ends ' + res.o + ' after ' + k + ' pitches');
  if (end !== 'door_shut') {
    ok(sawMove, '11 ' + end + ': runners move on the scorebar diamond');
    ok(sawRun, '11 ' + end + ': runs score (' + res.start + ' to ' + res.them + ')');
  }
  if (end === 'doors_open') ok(sawOut, '11 doors_open: the double play shows a runner put out');
  if (/mockNull/.test(extra || '')) ok(/at least 13 pitches/.test(res.rv), '11 ' + end + ': a reveal with no pitch count shows its note');
  const auth = /mockAuth/.test(extra || '');
  if (auth) ok(/#\d+ of \d+ today/.test(res.st), '11 ' + end + ': signed in, the result shows the account\'s rank');
  await revealCheck(page, '11 ' + end, k);
  await shot('result', true);
  /* 12 */
  await coachCheck(page, '12 ' + end, k, { lesson: !/mockLesson=none/.test(extra || ''), pro: !/mockPro=none/.test(extra || '') && !/mockLesson=none/.test(extra || '') }, shot);
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
  await run(390, 844, 'light');
  await run(1440, 900, 'dark');
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
