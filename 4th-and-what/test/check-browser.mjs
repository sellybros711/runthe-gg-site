#!/usr/bin/env node
/* 4th and What in Chromium, end to end, the way a thumb plays it.
 *
 *   node 4th-and-what/test/check-browser.mjs [outdir]
 *
 * On a phone (390x844 at 3x) and a desktop (1440x900), every view of the
 * 2026-10-31 redesign: Play (any down and spot, the result, the timeline,
 * the breakdown, 3D), the Studio (concepts, the route list and depth, Move
 * and only Move moves a player, Read sets the 1st, 2nd and 3rd read, motion,
 * play action, flip, the defense view), Test vs Defense, then signed in:
 * Save Play, the library, a copy flipped, the card back, situations, Learn's
 * quiz, every Print preset, and the playbook file out and back in. Fails on
 * any console error or uncaught exception. The site is served from the repo;
 * the CDN and fonts are blocked, which the page must survive. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = process.argv[2] || process.env.SHOTS || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;

let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

async function run(name, viewport, scale) {
  console.log('\n' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, acceptDownloads: true });
  /* THE CLOUD, IN MEMORY. assets/cloudsave.js steps aside when RTG_SAVE is
     already there, so no check ever writes a row on a real account. */
  await ctx.addInitScript(() => {
    const mem = {}; window.__mem = mem;
    window.RTG_SAVE = { API_VERSION: 1, idle: () => true, signedIn: () => true,
      all: g => Promise.resolve(Object.keys(mem).filter(k => k.startsWith(g + '/')).map(k => ({ slot: k.split('/')[1], progress: mem[k].progress, payload: JSON.parse(JSON.stringify(mem[k].payload)) }))),
      queue: (g, sl, fn) => { const m = fn(); const k = g + '/' + sl; if (!m) return Promise.resolve(null); if (m.drop) { delete mem[k]; return Promise.resolve(null); }
        if (mem[k] && mem[k].progress > m.progress) return Promise.resolve({ ok: false, payload: mem[k].payload, progress: mem[k].progress });
        mem[k] = { progress: m.progress, payload: JSON.parse(JSON.stringify(m.payload)) }; return Promise.resolve({ ok: true }); },
      drop: (g, sl) => { delete mem[g + '/' + sl]; return Promise.resolve(null); } };
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  const shot = async (f) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '-' + f + '.png') }); };
  const yd = (p) => page.evaluate(q => { const c = document.getElementById('sField'), r = c.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) c.scrollIntoView({ block: 'center' }); return window.FAW_STUDIO.toScreen(q); }, p);
  const play = () => page.evaluate(() => window.FAW_STUDIO.play());
  async function dragYd(from, ...to) {
    const a = await yd(from), bs = []; for (const q of to) bs.push(await yd(q));
    await page.mouse.move(a[0], a[1]); await page.mouse.down();
    for (const b of bs) await page.mouse.move(b[0], b[1], { steps: 8 });
    await page.mouse.up();
  }
  async function tapYd(p) { const a = await yd(p); await page.mouse.click(a[0], a[1]); }
  const tab = async (v) => { await page.click('.tab[data-view="' + v + '"]'); await page.waitForTimeout(150); };
  const books = () => page.evaluate(() => window.FAW_APP.store.books());

  /* ---------- Play ---------- */
  await page.goto(BASE + '/4th-and-what/?seed=11');
  await page.waitForFunction(() => !!window.FAW_APP && !!window.FAW_GAME && !!window.FAW_STUDIO);
  ok(await page.isVisible('#vPlay') && (await page.getAttribute('.tab[data-view="play"]', 'aria-current')) === 'page', 'opens on Play');
  ok((await page.textContent('#gSit')) === '4th & 5' && (await page.textContent('#gSpot')) === 'Opp 40', 'the default: 4th and 5 on the opponent 40');
  await shot('0-play');
  await page.click('#gRun');
  await page.waitForFunction(() => { const r = window.FAW_GAME.last(); return r && document.getElementById('gTime').value === '1000'; }, null, { timeout: 30000 });
  const r1 = await page.evaluate(() => ({ big: document.getElementById('gResBig').textContent, why: document.getElementById('gWhy').textContent, rows: document.getElementById('gStats').children.length, off: +document.getElementById('gOff').textContent, def: +document.getElementById('gDefScore').textContent }));
  ok(r1.big !== 'Run a play' && r1.why.length > 10 && r1.rows === 12, 'Run Play plays it to a result: ' + r1.big);
  ok(r1.off + r1.def === 1, 'the scoreboard counts it');
  await page.click('#gBreakBtn');
  ok(await page.isVisible('#gBreak'), 'the defensive breakdown opens');
  await page.fill('#gTime', '300'); await page.dispatchEvent('#gTime', 'input');
  ok(/^0:0\d \/ 0:0\d$/.test(await page.textContent('#gClock')), 'the timeline scrubs');
  await shot('1-result');
  await page.click('#g3d');
  ok(await page.isVisible('#watch'), 'Watch in 3D opens the stadium');
  await page.waitForTimeout(400); await page.click('#bSkip'); await page.click('#bClose3d');
  ok(!(await page.isVisible('#watch')), 'and closes');
  /* any down and spot */
  await page.selectOption('#gDown', '3'); await page.selectOption('#gDist', '7'); await page.selectOption('#gSide', 'own'); await page.selectOption('#gYard', '28');
  ok((await page.textContent('#gSit')) === '3rd & 7' && (await page.textContent('#gSpot')) === 'Own 28', 'set to 3rd and 7 on the own 28');
  await page.selectOption('#gDef', 'cover2');
  await page.click('#gRun');
  await page.waitForFunction(() => document.getElementById('gTime').value === '1000', null, { timeout: 30000 });
  const r2 = await page.evaluate(() => { const r = window.FAW_GAME.last(); return { call: r.callKey, Y0: r.Y0, res: document.getElementById('gStats').textContent }; });
  ok(r2.call === 'cover2' && r2.Y0 === 28 && !/Turnover on downs/.test(r2.res), 'a 3rd down snap from the own 28 against Cover 2 (' + r2.res.slice(6, 40) + ')');

  /* ---------- the Studio ---------- */
  await tab('studio');
  ok(await page.isVisible('#vStudio'), 'the Studio');
  await page.click('[data-lib="concepts"]');
  await page.click('[data-concept="Mesh"]');
  let p = await play();
  ok(p.routes.length >= 4 && p.targets.length >= 2, 'a concept puts a whole play on the formation: ' + p.routes.length + ' routes, reads ' + p.targets.join(' '));
  ok(/Drag/.test(await page.inputValue('#sName')), 'and names it from the terminology: ' + await page.inputValue('#sName'));
  await page.selectOption('.prow[data-who="WR2"] select', 'post');
  p = await play();
  let z = p.routes.find(r => r.who === 'WR2');
  ok(z && z.type === 'post' && z.depth === 10, 'the route list gives the Z a post at 10');
  await page.click('.prow[data-who="WR2"] .depth button[aria-label="Deeper"]');
  z = (await play()).routes.find(r => r.who === 'WR2');
  ok(z.depth === 11, 'and the depth steps to 11');
  await shot('2-studio');
  /* Move, and only Move, moves a player */
  await page.click('[data-concept="Four Verts"]');
  await page.click('.tool[data-tool="route"]');
  const zs = await yd([13.5, -0.9]); let z2 = await yd([11, 6]);
  await page.mouse.move(zs[0], zs[1]); await page.mouse.down(); await page.waitForTimeout(420);
  await page.mouse.move(z2[0], z2[1], { steps: 6 }); await page.mouse.up();
  p = await play();
  ok(!p.moved.WR2, 'a slow drag with Route never moves the Z');
  await page.click('.tool[data-tool="move"]');
  await dragYd([13.5, -0.9], [11, -1.5]);
  p = await play();
  ok(p.moved.WR2 && Math.abs(p.moved.WR2[0] - 11) < 0.7, 'Move lines the Z up at ' + (p.moved.WR2 || []).map(v => v.toFixed(1)).join(','));
  await page.click('.tool[data-tool="block"]');
  const te = await yd([-6.2, -1.4]); z2 = await yd([-5, -2.4]);
  await page.mouse.move(te[0], te[1]); await page.mouse.down(); await page.waitForTimeout(420);
  await page.mouse.move(z2[0], z2[1], { steps: 6 }); await page.mouse.up();
  p = await play();
  ok(!p.moved.TE && p.blocks.some(b => b.who === 'TE'), 'a long press with Block draws the block and never moves the Y');
  /* Read: the 1st, 2nd and 3rd read, in the order tapped */
  await page.click('[data-concept="Four Verts"]');
  await page.click('.tool[data-tool="read"]');
  await page.evaluate(() => { window.FAW_APP.draft.play.targets = []; });
  const spots = await page.evaluate(() => { const q = window.FAW_STUDIO.play(), O = window.FAW_FORMATIONS.place(q.formation, q.moved); return { X: O.WR1, Z: O.WR2, H: O.SLOT }; });
  await tapYd(spots.Z); await tapYd(spots.H); await tapYd(spots.X);
  p = await play();
  ok(p.targets.join(',') === 'WR2,SLOT,WR1', 'Read sets the 1st, 2nd and 3rd read in the order tapped: ' + p.targets.join(','));
  await tapYd(spots.H);
  p = await play();
  ok(p.targets.join(',') === 'WR2,WR1', 'tapping a read takes it away, and the rest move up');
  await page.click('.prow[data-who="SLOT"] .readc button:nth-child(1)');
  p = await play();
  ok(p.targets[0] === 'SLOT', 'the Players panel sets the H as the 1st read');
  /* motion, play action, the defense, flip */
  await page.click('label:has(#sMotion)');
  p = await play();
  ok(p.motion && p.motion.pts.length > 0, 'Motion puts a man in motion: the ' + (p.motion && p.motion.who));
  await page.click('label:has(#sPA)');
  ok((await play()).playAction === true, 'Play Action is on');
  await page.click('#sView button[data-v="both"]');
  ok(await page.isVisible('#sCall'), 'the defense view offers the call to draw');
  await shot('3-studio-defense');
  const before = await play(), nameBefore = await page.inputValue('#sName');
  await page.click('#sFlip');
  const after = await play(), nameAfter = await page.inputValue('#sName');
  ok(after.routes.length === before.routes.length && Math.sign(after.moved.WR1[0]) === -Math.sign(before.moved.WR1 ? before.moved.WR1[0] : -13.5), 'Flip mirrors the play');
  ok(/Left/.test(nameBefore) !== /Left/.test(nameAfter) || nameBefore === nameAfter, 'and the name follows the side: ' + nameAfter);
  await page.click('#sFlip');

  /* ---------- Test vs Defense ---------- */
  await page.click('#sTest');
  ok(await page.isVisible('#vTest'), 'Test vs Defense from the Studio');
  await page.selectOption('#tN', '40');
  await page.click('#tRun');
  await page.waitForSelector('.testt', { timeout: 60000 });
  ok(await page.$$eval('.testt tr', r => r.length) === 9, 'a row for each of the seven defenses, and every defense');
  await shot('4-test');

  /* ---------- signed out ---------- */
  await tab('books');
  ok(await page.isVisible('#bSignin') && !(await page.isVisible('#bMain')), 'signed out, Playbooks asks you to sign in');
  await tab('studio');
  await page.click('#sSave');
  ok(await page.isVisible('#saveDlg') && /Sign in/.test(await page.textContent('#saveOut')), 'signed out, Save Play asks you to sign in');
  await page.click('#bSaveCancel');

  /* ---------- signed in ---------- */
  await page.evaluate(() => { window.RTG_AUTH.state = () => ({ ready: true, resolved: true, signedIn: true, userId: 'check-user', name: 'Coach' }); window.RTG_AUTH.token = () => 'check'; });
  await page.click('#sSave');
  await page.waitForSelector('#bSaveOk:not([hidden])');
  ok(await page.$('#saveOut .savecard canvas') !== null, 'the save box shows the play');
  await page.click('#bSaveOk');
  await page.waitForTimeout(300);
  let bs = await books();
  ok(bs.length === 1 && bs[0].plays.length === 1 && bs[0].plays[0].num != null, 'saved to a new playbook, with its own play number');
  ok((await page.textContent('#sSave')) === 'Saved', 'the Studio now edits the playbook play');
  await page.click('[data-side="card"]');
  ok(await page.$$eval('#sCard .cardback li', l => l.length) >= 5, 'the card back has a line for each player');
  await page.click('#sCard .chips button:nth-child(5)');
  await page.waitForTimeout(900);
  bs = await books();
  ok((bs[0].plays[0].situations || []).indexOf('short') >= 0, 'a situation tag saves with the play');

  await tab('books');
  ok(await page.isVisible('#bMain') && await page.$$eval('#bCards .pcard', c => c.length) === 1, 'the library shows the play as a card');
  await page.click('#bCards .pcard .more');
  await page.click('#bCards .menu button:has-text("Copy, flipped")');
  bs = await books();
  ok(bs[0].plays.length === 2 && bs[0].plays[1].num !== bs[0].plays[0].num, 'a flipped copy, with a new number');
  await page.fill('#bSearch', 'zzz');
  ok(await page.$$eval('#bCards .pcard', c => c.length) === 0, 'search filters the cards');
  await page.fill('#bSearch', '');
  await shot('5-library');

  /* terminology renames plays never named by hand */
  await page.click('#bTabs button[data-bt="terms"]');
  ok(await page.isVisible('#bTerms .example'), 'the terminology tab');
  await page.evaluate(() => { const t = window.FAW_APP.terms(); t.formations.gun3x1 = 'Rex'; window.FAW_APP.store.setTerms(t); });
  ok(/^Rex/.test(await page.evaluate(() => window.FAW_APP.nameFor({ formation: 'gun3x1', moved: {}, routes: [], blocks: [], handoff: null, targets: [] }))), 'a formation word names the play');
  await page.evaluate(() => { const t = window.FAW_APP.terms(); delete t.formations.gun3x1; window.FAW_APP.store.setTerms(t); });

  /* ---------- Learn ---------- */
  await tab('learn');
  await page.selectOption('#lBook', 'concepts');
  await page.click('#lTree button[data-key="c:Snag"]');
  await page.selectOption('#lWho', 'TE');
  ok(/Snag/.test(await page.textContent('#lTitle')) && await page.isVisible('#lQuiz .q h4'), 'Learn: the play and your job');
  await page.click('#lQuiz .btn.gold');
  ok(/Question 1 of/.test(await page.textContent('#lQuiz')), 'Practice asks the questions');
  const ans = await page.evaluate(() => { const q = window.FAW_LEARN.questions(window.FAW_ROUTES.apply(window.FAW_APP.emptyPlay('gun3x1'), 'Snag'), 'TE', []); return q[0].answer; });
  await page.click('#lQuiz .opt:has-text("' + ans + '")');
  ok(/Correct/.test(await page.textContent('#lQuiz .fb')), 'the right answer is marked correct');
  await page.click('#lAnim');
  await page.waitForTimeout(300);
  await shot('6-learn');

  /* ---------- Print ---------- */
  await tab('print');
  await page.waitForSelector('#pPresets button');
  for (const name of await page.$$eval('#pPresets button', b => b.map(x => x.textContent))) {
    await page.click('#pPresets button:has-text("' + name + '")');
    await page.waitForFunction(() => document.querySelectorAll('#pPreview img').length > 0 || /could not/.test(document.getElementById('pPreview').textContent), null, { timeout: 8000 });
    const pv = await page.textContent('#pPreview');
    ok(!/could not/.test(pv) && await page.$$eval('#pPreview img', i => i.length) > 0, 'Print: ' + name + ' previews');
  }
  await shot('7-print');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pFile')]);
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  ok(/4th-and-what-playbook/.test(txt), 'the playbook downloads as a file');
  await tab('books');
  await page.setInputFiles('#importFile', { name: 'book.json', mimeType: 'application/json', buffer: Buffer.from(txt) });
  await page.waitForTimeout(400);
  bs = await books();
  ok(bs.length === 2, 'and imports back as a second copy');

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* The real shared cloud saves (no stand-in): signed in through the arcade's
   RTG_AUTH, assets/cloudsave.js has the token, so a playbook can reach the account. */
{
  console.log('\ncloud saves');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  await page.goto(BASE + '/4th-and-what/');
  await page.waitForFunction(() => !!window.RTG_SAVE && !!window.RTG_AUTH);
  ok(await page.evaluate(() => window.RTG_SAVE.signedIn() === false), 'signed out, the cloud saves have no token');
  ok(await page.evaluate(() => { window.RTG_AUTH.token = () => 'arcade-token'; return window.RTG_SAVE.signedIn(); }), 'signed in through RTG_AUTH, the cloud saves have the token');
  await ctx.close();
}

await run('phone', { width: 390, height: 844 }, 3);
await run('desktop', { width: 1440, height: 900 }, 1);
await browser.close();
server.close();
console.log(fails ? '\n' + fails + ' failed' : '\nall good');
process.exit(fails ? 1 : 0);
