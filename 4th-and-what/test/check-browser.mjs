#!/usr/bin/env node
/* 4th and What in Chromium, end to end, the way a thumb plays it.
 *
 *   node 4th-and-what/test/check-browser.mjs [outdir]
 *
 * On a phone (390x844 at 3x) and a desktop (1440x900): pick a distance, try
 * every formation, draw a route, move a receiver, draw a block, set a
 * target, snap it, watch it to the result, go back to the clipboard with the
 * play kept, replay it, then make it a run with the handoff tool and snap
 * that. Fails on any console error or uncaught exception. The site is
 * served from the repo; the CDN and fonts are blocked, which the page must
 * survive (signing in is optional). */
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
  const yd = (p) => page.evaluate(q => window.FAW_UI.board().toScreen(q), p);
  const play = () => page.evaluate(() => window.FAW_UI.board().play());
  async function dragYd(from, ...to) {
    const a = await yd(from); await page.mouse.move(a[0], a[1]); await page.mouse.down();
    for (const q of to) { const b = await yd(q); await page.mouse.move(b[0], b[1], { steps: 8 }); }
    await page.mouse.up();
  }
  async function tapYd(p) { const a = await yd(p); await page.mouse.click(a[0], a[1]); }
  async function waitResult() {
    await page.waitForSelector('#result:not([hidden])', { timeout: 30000 });
    return page.evaluate(() => ({ title: document.getElementById('rTitle').textContent, why: document.getElementById('rWhy').textContent, call: document.getElementById('rCall').textContent, dbg: document.getElementById('dbgTxt').textContent }));
  }

  await page.goto(BASE + '/4th-and-what/?seed=11');
  await page.waitForFunction(() => !!window.FAW_UI && !!window.FAW_BOOKUI);
  ok(await page.isVisible('#sHome') && await page.isVisible('#goBuild') && await page.isVisible('#goBooks'), 'home: Build a Play and My Playbooks');
  await shot('0-home');
  /* signed out, a playbook asks for an account */
  await page.click('#goBooks');
  ok(await page.isVisible('#booksSignin') && !(await page.isVisible('#bNewBook')), 'signed out, My Playbooks asks you to sign in');
  await page.click('#sBooks [data-go="sHome"]');
  await page.click('#goBuild');
  ok(await page.isVisible('#sPick') && (await page.$$('.dist')).length === 6, 'six distance buttons');
  ok(!(await page.evaluate(() => document.getElementById('guide').open)), 'no guide opens by itself');
  await shot('1-pick');
  await page.click('.dist[data-d="5"]');
  ok(await page.isVisible('#cBoard'), 'the clipboard is up');
  ok((await page.textContent('#downTxt')).trim() === '4th and 5', 'the strip says 4th and 5');
  for (const f of ['gun2x2', 'uc12', 'empty', 'iform', 'gun3x1']) {
    await page.click('.form[data-f="' + f + '"]');
    const box = await page.textContent('#boxTxt');
    ok((await play()).formation === f && /^Box \d$/.test(box), f + ', ' + box);
  }
  ok(await page.isDisabled('#bSnap'), 'Snap It waits for a target or a handoff');

  /* Route: from X up the field and in */
  await dragYd([-13.5, -0.9], [-13.5, 3], [-13.5, 6], [-9, 9]);
  let p = await play();
  ok(p.routes.length === 1 && p.routes[0].who === 'WR1' && p.routes[0].pts.length >= 2, 'a route for X, ' + (p.routes[0] ? p.routes[0].pts.length : 0) + ' points');
  /* extend it from its end */
  const end = p.routes[0].pts[p.routes[0].pts.length - 1];
  await dragYd(end, [end[0] + 3, end[1] + 2], [end[0] + 6, end[1] + 3]);
  p = await play();
  ok(p.routes[0].pts.length > 2, 'the route grows from its end');
  /* the slot's route is number 2 */
  await dragYd([-9.5, -1.6], [-9.5, 2], [-14, 4]);
  p = await play();
  ok(p.routes.length === 2 && p.routes[1].who === 'SLOT', 'routes keep their drawing order');
  /* hold, then drag: move the Z */
  const z = await yd([13.5, -0.9]);
  await page.mouse.move(z[0], z[1]); await page.mouse.down(); await page.waitForTimeout(420);
  const z2 = await yd([11, -1.5]); await page.mouse.move(z2[0], z2[1], { steps: 6 }); await page.mouse.up();
  p = await play();
  ok(p.moved.WR2 && Math.abs(p.moved.WR2[0] - 11) < 0.6, 'held and dragged, Z moves to ' + (p.moved.WR2 || []).map(v => v.toFixed(1)).join(','));
  /* Block: the TE stays in */
  await page.click('.tool[data-tool="block"]');
  await dragYd([-6.2, -1.4], [-5, -2.4]);
  p = await play();
  ok(p.blocks.length === 1 && p.blocks[0].who === 'TE', 'the TE stays in to block');
  /* Target: X first, H the checkdown */
  await page.click('.tool[data-tool="target"]');
  await tapYd([-13.5, -0.9]); await tapYd([-9.5, -1.6]);
  p = await play();
  ok(p.targets.join() === 'WR1,SLOT', 'a star on X and a 2 on H');
  ok(!(await page.isDisabled('#bSnap')), 'Snap It is ready');
  await shot('2-board');
  /* Undo takes the checkdown back, then put it back */
  await page.click('#bUndo'); ok((await play()).targets.join() === 'WR1', 'undo'); await tapYd([-9.5, -1.6]);

  await page.click('#bSnap');
  await page.waitForTimeout(1300);
  await shot('3-live');
  const r1 = await waitResult();
  ok(/^(FIRST DOWN|TOUCHDOWN|TURNOVER ON DOWNS)$/.test(r1.title), 'a result: ' + r1.title);
  ok(r1.why.length > 8 && /^The defense: Cover [0-3] (man|zone), (no )?blitz\./.test(r1.call), 'a reason and the call: ' + r1.why + ' / ' + r1.call);
  ok(/seed 11\b/.test(r1.dbg), 'the debug toggle shows the seed');
  await shot('4-result');
  await page.click('#bShare');
  await page.waitForTimeout(300);
  const shared = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/^4th and What [A-Z ]+[+-]?\d* · 4th and 5\n\S+\nhttps:\/\/runthe\.gg\/4th-and-what$/u.test(shared), 'the share line: ' + shared.split('\n')[0]);
  await page.click('#bBack');
  p = await play();
  ok(await page.isVisible('#cBoard') && p.routes.length === 2 && p.targets.length === 2, 'back to the clipboard with the play kept');
  await page.click('#bSnap');
  await page.click('#bSkip');
  const r2 = await waitResult();
  ok(!!r2.title, 'snapped again and skipped to the end: ' + r2.title);
  await page.click('#bReplay');
  const r3 = await waitResult();
  ok(!!r3.title, 'replay, the defense rolls again: ' + r3.title);

  /* Build a Play keeps what you drew: a download, and save to a playbook */
  await page.click('#bBack');
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#bDownload');
  const file = await dl;
  ok(!!file && /\.png$/.test(file.suggestedFilename()), 'Download gives a PNG: ' + (file ? file.suggestedFilename() : 'none'));
  await page.click('#bSaveTo');
  ok(await page.isVisible('#saveDlg') && /Sign in/.test(await page.textContent('#saveOut')), 'signed out, Save to playbook asks you to sign in');
  await page.click('#bSaveCancel');

  /* a run: Handoff, QB then the back, then his path */
  await page.click('#bClear');
  await page.click('.tool[data-tool="handoff"]');
  await tapYd([0, -5]); await tapYd([1.8, -5.2]);
  await dragYd([1.8, -5.2], [1.5, -2], [0.8, 1], [0.8, 6]);
  p = await play();
  const pe = p.handoff && p.handoff.path[p.handoff.path.length - 1];
  ok(p.handoff && p.handoff.to === 'RB' && pe && Math.abs(pe[0] - 0.8) < 0.8 && Math.abs(pe[1] - 6) < 0.8, 'a handoff to the back, and the path drawn for him');
  ok(await page.isDisabled('.tool[data-tool="target"]'), 'a run has no target');
  ok(!(await page.isDisabled('#bSnap')), 'a run can be snapped');
  await page.click('#bSnap');
  const r4 = await waitResult();
  ok(!!r4.title, 'the run: ' + r4.title + '. ' + r4.why);
  await shot('5-run');

  /* ---------- the playbooks, signed in ---------- */
  await page.evaluate(() => { window.RTG_AUTH.state = () => ({ ready: true, resolved: true, signedIn: true, userId: 'check-user', name: 'Coach' }); window.RTG_AUTH.token = () => 'check'; });
  await page.click('#bResSave');
  ok(await page.isVisible('#saveDlg') && await page.isVisible('#bSaveOk'), 'signed in, Save to playbook on the result offers a book, a section and a name');
  await page.click('#bSaveOk');
  let books = await page.evaluate(() => window.FAW_BOOKUI.store.books());
  ok(books.length === 1 && books[0].plays.length === 1 && /Power|Zone/.test(books[0].plays[0].name), 'the run is saved to a new playbook, named ' + (books[0] && books[0].plays[0] && books[0].plays[0].name));
  ok(await page.evaluate(() => Object.keys(window.__mem).some(k => k.startsWith('fourth_and_what/b-'))), 'and the playbook went up to the account');
  await page.click('#bBack'); await page.click('#bDist'); await page.click('#sPick [data-go="sHome"]');
  await page.click('#goBooks');
  ok((await page.$$('.bookcard')).length === 1, 'My Playbooks lists it');
  await page.click('.bookcard');
  await page.fill('#bookName', 'Varsity 2026'); await page.press('#bookName', 'Tab');
  await page.click('#bNewSection');
  ok((await page.$$('.secname')).length === 2, 'a second section');
  await page.click('#bNewPlay');
  ok(await page.isVisible('#editBar') && await page.isVisible('#bTest'), 'a new play opens on the clipboard with its name, Save and Test it');
  await dragYd([-13.5, -0.9], [-13.5, 2], [-9.5, 6]);
  await dragYd([-9.5, -1.6], [-9.5, 1], [-14, 3]);
  await page.click('.tool[data-tool="target"]'); await tapYd([-13.5, -0.9]);
  ok(/Slant Flat/.test(await page.inputValue('#pName')), 'it names itself from the drawing: ' + await page.inputValue('#pName'));
  await page.click('#bTest');
  await page.waitForSelector('.testt', { timeout: 60000 });
  const rows = await page.$$eval('.testt tr', tr => tr.length);
  ok(rows === 9, 'Test it: a row for each of the seven defenses, and every defense together');
  await page.selectOption('#defSel', 'cover2');
  await page.click('#bSnap'); await page.click('#bSkip');
  const rr = await waitResult();
  ok(/Cover 2 zone/.test(rr.call), 'snapped against the defense picked: ' + rr.call);
  await page.click('#bBack');
  const live = await page.evaluate(() => { const e = window.FAW_BOOKUI.current().entry; return e.stats[e.distance].byCall; });
  ok(live.cover2 && live.cover2.n === 1, 'the snap is counted against Cover 2');
  await shot('6-editor');
  /* My terminology: a slant on the left is Seminole, slant and flat is Snag */
  await page.click('#bToBook'); await page.click('#sBook [data-go="sBooks"]'); await page.click('#bTerms');
  const groups = await page.$$('#termsOut .tgroup');
  await (await groups[2].$('.btn')).click();
  await page.fill('#termsOut .tgroup:nth-of-type(3) .rule .word', 'Seminole');
  await page.waitForTimeout(900);
  books = await page.evaluate(() => window.FAW_BOOKUI.store.books());
  const named = books[0].plays.map(p => p.name);
  ok(named.some(n => /Seminole/.test(n)), 'a route word renames the plays that were never typed by hand: ' + named.join(', '));
  await (await (await page.$$('#termsOut .tgroup'))[3].$('.btn')).click();
  await page.fill('#termsOut .tgroup:nth-of-type(4) .rule .word', 'Snag');
  await page.waitForTimeout(900);
  ok(/Snag/.test(await page.textContent('#termsExample b')), 'a concept word wins over single routes: ' + await page.textContent('#termsExample b'));
  await shot('7-terms');
  /* Print or export: every layout previews */
  await page.click('#sTerms [data-go="sBooks"]'); await page.click('.bookcard'); await page.click('#bExport');
  for (const layout of ['cards', 'callsheet', 'wristband']) {
    await page.selectOption('#exportOut .tgroup:nth-of-type(2) select', layout);
    await page.waitForTimeout(500);
    ok((await page.$$('#exportPreview img.page')).length >= 1, layout + ' previews');
  }
  await shot('8-export');
  const fdl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#sExport [data-go="sBook"]'); await page.click('#bBookFile');
  const f2 = await fdl;
  ok(!!f2 && /\.json$/.test(f2.suggestedFilename()), 'the playbook downloads as a file: ' + (f2 ? f2.suggestedFilename() : 'none'));
  if (f2) {
    const p2 = await f2.path(); const txt = fs.readFileSync(p2, 'utf8');
    await page.click('#sBook [data-go="sBooks"]');
    await page.setInputFiles('#importFile', { name: 'book.json', mimeType: 'application/json', buffer: Buffer.from(txt) });
    await page.waitForTimeout(400);
    books = await page.evaluate(() => window.FAW_BOOKUI.store.books());
    ok(books.length === 2 && books.every(b => b.name === 'Varsity 2026'), 'and imports back as a second copy');
  }

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
