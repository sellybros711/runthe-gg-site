#!/usr/bin/env node
/* A run in progress survives leaving the page.
 *
 *   node baseball/check-resume.mjs
 *
 * The banner's two links leave the page, and during a run they ask first and save.
 * The save is the draft as it stood, board and all, so resuming shows the same
 * board: a save that re-rolled it would turn leaving into a free re-spin. Walked
 * as a guest through the real page, with every request out of it refused. */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import http from 'http';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EXE = process.env.CHROMIUM
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const PORT = 8143;

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json' };
const server = await new Promise((res) => {
  const s = http.createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      rep.writeHead(404).end('no'); return;
    }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
      .end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});

const FAKE_AUTH = (pro) => `window.RTD_AUTH=(function(){const L=[];
  const st=()=>({ready:true,waiting:false,signedIn:true,userId:'lineup-1',name:'lineup'});
  return {API_VERSION:1,boot(){setTimeout(()=>L.forEach(f=>f(st())),30);return true;},
  state:st,onChange(f){L.push(f);return()=>{};},token:()=>null,signOut:()=>Promise.resolve(),
  premiumProducts:async()=>${pro ? "['rtd_premium']" : '[]'},
  modeState:async()=>null,modeSpend:async(m)=>({ok:true,pro:${pro},mode:m})};})();`;


const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  return u.startsWith('http://localhost:' + PORT) ? route.continue() : route.abort();
});
await ctx.route('**/baseball/auth.js*', (route) => route.fulfill({
  contentType: 'application/javascript', body: FAKE_AUTH(false) }));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('rtd_seen_intro_v1', '1'); } catch (_) {} });
/* The game asks in its own sheet, never the browser's confirm(): a native dialog
   here is a failure, and is recorded so the claims below can say so. */
const natives = [];
p.on('dialog', async (d) => { natives.push(d.message()); await d.dismiss(); });
/* Waits for the game's own question and answers it. Returns its title, or '' when
   nothing was asked. */
async function answer(yes) {
  const up = await p.waitForSelector('#sheet-ask.on', { timeout: 3000 }).then(() => true, () => false);
  if (!up) return '';
  const t = await p.evaluate(() => document.getElementById('ask-title').textContent
    + ' | ' + document.getElementById('ask-body').textContent);
  await p.click(yes ? '#ask-yes' : '#ask-no');
  return t;
}

const home = async () => {
  await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  await p.waitForTimeout(400);
};
const board = () => p.waitForFunction(() => document.querySelectorAll('#opts .tile').length > 0, null, { timeout: 25000 });
const boardNames = () => p.evaluate(() => [...document.querySelectorAll('#opts .tile .nm')].map((t) => t.textContent.trim()).join('|'));
/* Read off the draft's own counter: the field draws one pitcher disc at a time, so
   counting filled discs undercounts. */
const filled = () => p.evaluate(() => { const m = /Spin (\d+)/.exec(document.getElementById('d-count').textContent); return m ? +m[1] - 1 : -1; });
async function pick() {
  await board();
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('#opts .tile')].filter((x) => !x.classList.contains('off') && !x.disabled)[0];
    if (t) t.click(); else document.getElementById('b-respin').click();
  });
  await p.waitForTimeout(80);
  await p.evaluate(() => {
    if (!document.querySelector('#s-draft.picking')) return;
    const t = document.querySelector('#field .target.natural') || document.querySelector('#field .target');
    if (t) t.click();
  });
  await p.waitForTimeout(350);
}

head('1. LEAVING BY THE BANNER ASKS FIRST, AND SAVES');
await home();
claim(await p.evaluate(() => document.getElementById('resume-card').hidden), 'a fresh visitor is offered nothing to resume');
await p.click('#b-start');
await p.waitForSelector('#s-draft.on', { timeout: 20000 });
for (let i = 0; i < 3; i++) await pick();
await board();
const namesBefore = await boardNames();
const filledBefore = await filled();
claim(filledBefore === 3, 'three players signed', `${filledBefore}`);
await p.click('header .lockup');
const asked = await answer(false);
claim(/Leave your draft/.test(asked), 'the banner asks before leaving a draft, in the game\'s own sheet', asked || '(nothing asked)');
await p.waitForTimeout(300);
claim(await p.$('#s-draft.on') !== null && !(await p.$('#sheet-ask.on')), 'and saying no keeps you on the draft');
await p.click('header .lockup');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), answer(true)]);
await p.waitForSelector('#s-intro.on', { timeout: 20000 });
await p.waitForTimeout(500);
const card = await p.evaluate(() => { const c = document.getElementById('resume-card'); return c.hidden ? '' : c.textContent; });
claim(/saved/i.test(card) && /Spin 4 of 12/.test(card), 'the front page offers the draft back, at spin 4 of 12', card || '(no card)');

head('2. RESUMING IS THE SAME DRAFT ON THE SAME BOARD');
await p.click('#b-resume');
await p.waitForSelector('#s-draft.on', { timeout: 20000 });
await board();
claim(await filled() === 3, 'the three signed players are still on the field', `${await filled()}`);
const namesAfter = await boardNames();
claim(namesAfter === namesBefore, 'and the board is the one it was saved on, so leaving cannot re-roll it',
  namesAfter === namesBefore ? '' : `${namesBefore}\n        -> ${namesAfter}`);

head('3. A RELOAD ON THE SQUAD SCREEN COMES BACK TO THE SQUAD');
for (let i = 0; i < 20 && !(await p.$('#s-squad.on')); i++) await pick();
await p.waitForSelector('#s-squad.on', { timeout: 30000 });
await home();
const card2 = await p.evaluate(() => { const c = document.getElementById('resume-card'); return c.hidden ? '' : c.textContent; });
claim(/Squad set/.test(card2), 'the card says the squad is set', card2 || '(no card)');
await p.click('#b-resume');
await p.waitForSelector('#s-squad.on', { timeout: 20000 });
claim(true, 'resume lands on the squad screen');

head('4. A NEW DRAFT OVER A SAVED ONE ASKS FIRST');
await home();
await p.click('#b-start');
const asked2 = await answer(false);
claim(/new draft/i.test(asked2) && /discarded/.test(asked2), 'starting over asks', asked2 || '(nothing asked)');
await p.waitForTimeout(300);
claim(await p.$('#s-intro.on') !== null, 'and saying no stays on the front page');
await p.click('#b-resume-x');
const asked3 = await answer(true);
claim(/Discard/.test(asked3), 'discarding asks too', asked3 || '(nothing asked)');
await p.waitForTimeout(300);
claim(await p.evaluate(() => document.getElementById('resume-card').hidden && !localStorage.getItem('rtd_run_v1')),
  'discarding removes the save');

claim(natives.length === 0, 'no browser confirm() anywhere, only the game\'s own sheet', natives.join(' / '));
claim(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await ctx.close();
await browser.close();
server.close();
console.log(fails ? `\n${fails} of ${checks} checks FAILED.` : `\nAll ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
