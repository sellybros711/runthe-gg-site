/*
 * check-optout.mjs : the Do Not Sell link is on every page with ads, and the opt-out reaches the ad tag.
 *
 *   node scripts/check-optout.mjs            every page that loads the AdSense tag
 *   node scripts/check-optout.mjs soccer/    only pages under a path
 *
 * The owner's pick (2026-11-26): our own "Do Not Sell or Share My Personal Information" link and
 * opt-out (assets/rtg-privacy.js, privacy-choices.html). For every page with the ad tag it proves:
 *  1. the link is there, says exactly that, leads to /privacy-choices.html, and is not pinned over
 *     the page (no fixed or sticky ancestor);
 *  2. with no opt-out, no ad unit asks for restricted data processing;
 *  3. opted out on the choices page, then a reload of the page: every unit carries
 *     data-restrict-data-processing="1" at the moment it is pushed to Google;
 *  4. the same with only Global Privacy Control on, and no click at all.
 *
 * ADSENSE IS A STAND-IN. It never calls Google (the account-safety rule). When it loads it replaces
 * window.adsbygoogle with its own object, the way adsbygoogle.js does, so the check covers the
 * moment the page's queue hands over to Google. It records, unit by unit, whether the unit carried
 * the attribute when Google would have read it. Every other outside host is refused.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';
let pw;
try { pw = (await import(PW)).default; } catch (e) {
  try { pw = (await import('playwright')).default; } catch (e2) { console.log('Playwright is not available here, so this check cannot run.'); process.exit(0); }
}
const only = process.argv[2] || '';
const pages = execSync("git grep -l 'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js' -- '*.html'", { cwd: ROOT }).toString().trim().split('\n')
  .filter((f) => f && f.startsWith(only)).sort();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const STUB = `(function(){
  var q = window.adsbygoogle || [];
  window.__units = [];
  function fill(){
    document.querySelectorAll('ins.adsbygoogle:not([data-ad-status])').forEach(function(i){
      window.__units.push(i.getAttribute('data-restrict-data-processing') === '1');
      i.setAttribute('data-ad-status', 'filled');
    });
  }
  var google = { loaded: true, push: function(){ fill(); } };
  for (var k = 0; k < q.length; k++) fill();
  window.adsbygoogle = google;
  setInterval(function(){ if (document.querySelector('ins.adsbygoogle:not([data-ad-status])')) window.adsbygoogle.push({}); }, 400);
})();`;

let fails = 0;
const ok = (label, cond, extra) => { if (!cond) fails++; console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : '')); };
const browser = await pw.chromium.launch(process.env.PS_CHROME ? { executablePath: process.env.PS_CHROME } : {});

async function context(gpc) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  if (gpc) await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true }); });
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (/adsbygoogle\.js$/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB });
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  return ctx;
}
const url = (rel) => 'http://local.test/' + rel.replace(/index\.html$/, '');
async function visit(ctx, rel) {
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto(url(rel), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const a = document.getElementById('rtg-dns');
    let pinned = false;
    for (let n = a; n && n !== document.documentElement; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') { pinned = n.className || n.tagName; break; }
    }
    return { link: a ? { text: a.textContent, href: a.getAttribute('href'), pinned } : null, units: window.__units || [] };
  }).catch(() => ({ link: null, units: [] }));
  await p.close();
  return r;
}

console.log('\nTHE LINK, AND NO OPT-OUT');
let ctx = await context(false);
for (const rel of pages) {
  const r = await visit(ctx, rel);
  ok(rel + ': the link is there', !!r.link && r.link.text === 'Do Not Sell or Share My Personal Information' && r.link.href === '/privacy-choices.html', JSON.stringify(r.link));
  if (r.link) ok(rel + ':   and it is not pinned over the page', !r.link.pinned, r.link.pinned ? 'inside ' + r.link.pinned : '');
  ok(rel + ':   no unit asks for restricted processing', r.units.every((x) => !x), r.units.length + ' units');
}

console.log('\nOPTED OUT ON THE CHOICES PAGE, THEN A RELOAD');
{
  const p = await ctx.newPage();
  await p.goto(url('privacy-choices.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  await p.click('#dns-tog');
  const st = await p.textContent('#dns-state');
  ok('the switch says so', /opted out on this browser/.test(st), st);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  ok('  and it survives a reload', (await p.getAttribute('#dns-tog', 'aria-checked')) === 'true');
  await p.close();
}
for (const rel of pages) {
  const r = await visit(ctx, rel);
  ok(rel + ': every unit asks for restricted processing', r.units.length === 0 || r.units.every(Boolean), r.units.length + ' units, ' + r.units.filter(Boolean).length + ' restricted');
}
await ctx.close();

console.log('\nGLOBAL PRIVACY CONTROL ALONE');
ctx = await context(true);
for (const rel of pages) {
  const r = await visit(ctx, rel);
  ok(rel + ': every unit asks for restricted processing', r.units.length === 0 || r.units.every(Boolean), r.units.length + ' units, ' + r.units.filter(Boolean).length + ' restricted');
}
{
  const p = await ctx.newPage();
  await p.goto(url('privacy-choices.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  ok('the choices page says the browser opted out', !(await p.$eval('#dns-gpc', (e) => e.hidden)) && (await p.getAttribute('#dns-tog', 'aria-checked')) === 'true');
  await p.close();
}
await ctx.close();
await browser.close();

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
