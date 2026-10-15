#!/usr/bin/env node
/* Is the live site working? Opens every game's real page in a browser and says what broke.

   node scripts/qa/live.mjs                          https://runthe.gg
   BASE=http://127.0.0.1:8080 node scripts/qa/live.mjs   a local copy (python3 -m http.server 8080)
   node scripts/qa/live.mjs --out live.md            the report to a file as well

   A page FAILS when:
     - it does not answer 200,
     - a file the site serves itself (a script, a stylesheet, a data file) fails to load, or
     - the page's own code throws (an uncaught error whose stack points at this site).
   Third-party failures (ads, analytics, fonts) are listed but never fail a page: they are not the
   site's to fix, and they come and go, so failing on them would make this a check people learn to
   ignore.

   It tests what a visitor gets, which no other check here does: the code checks run against the
   repo, and the deploy, the CDN, a stale cache version or a missing file only show up here. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.env.BASE || 'https://runthe.gg').replace(/\/$/, '');
const outIdx = process.argv.indexOf('--out'), OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;

// Every game a visitor can reach, served and unlisted ones included. A new game goes here.
const PAGES = [
  '/', '/football/', '/cfb/', '/cfb/commish/', '/hoops/', '/baseball/', '/golf/', '/mythiball/',
  '/wrestling/', '/setlist/', '/soccer/', '/arcade/',
  '/arcade/almamater/', '/arcade/career/', '/arcade/chain/', '/arcade/crossword/', '/arcade/guess/',
  '/arcade/highlow/', '/arcade/match/', '/arcade/oddone/', '/arcade/rankit/', '/arcade/rollcall/',
  '/arcade/sportegories/', '/arcade/table/',
];

let chromium;
try { ({ chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright')); }
catch { console.error('needs Playwright: npm install --no-save playwright'); process.exit(2); }

const host = new URL(BASE).host;
const ours = (u) => { try { return new URL(u, BASE).host === host; } catch { return false; } };
const browser = await chromium.launch();
const rows = [];
for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [], missing = [], thirdParty = [];
  page.on('pageerror', (e) => {
    const where = (e.stack || '').split('\n').find(l => /https?:\/\//.test(l)) || '';
    (where && !ours((where.match(/https?:\/\/[^\s)]+/) || [''])[0]) ? thirdParty : errors).push(String(e.message || e).slice(0, 200));
  });
  page.on('response', (r) => { if (r.status() >= 400) (ours(r.url()) ? missing : thirdParty).push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  page.on('requestfailed', (r) => { const t = r.failure()?.errorText || 'failed'; if (/ERR_ABORTED/.test(t)) return; (ours(r.url()) ? missing : thirdParty).push(`${t} ${r.url().replace(BASE, '')}`); });
  let status = 0, t0 = Date.now();
  try {
    const res = await page.goto(BASE + p, { waitUntil: 'load', timeout: 45000 });
    status = res ? res.status() : 0;
    await page.waitForTimeout(4000); // let the game boot and fetch its data
  } catch (e) { errors.push(`did not load: ${String(e.message).split('\n')[0]}`); }
  const ok = status === 200 && !errors.length && !missing.length;
  rows.push({ p, ok, status, secs: ((Date.now() - t0) / 1000).toFixed(1), errors, missing, thirdParty });
  console.error(`${ok ? 'ok  ' : 'FAIL'} ${String(status).padEnd(4)} ${p}`);
  await ctx.close();
}
await browser.close();

const bad = rows.filter(r => !r.ok);
const L = [`# Live site check: ${BASE}`, '', `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, ${rows.length} pages, ${bad.length} failing.`, ''];
L.push('| page | status | result | load secs |', '|---|---|---|---|');
for (const r of rows) L.push(`| \`${r.p}\` | ${r.status} | ${r.ok ? 'ok' : '**FAIL**'} | ${r.secs} |`);
for (const r of bad) {
  L.push('', `## ${r.p}`, '');
  if (r.status !== 200) L.push(`- answered ${r.status}`);
  for (const e of r.errors) L.push(`- error: ${e}`);
  for (const m of r.missing) L.push(`- missing: ${m}`);
}
const tp = rows.filter(r => r.thirdParty.length);
if (tp.length) { L.push('', '## Third-party problems (listed, never failing)', ''); for (const r of tp) L.push(`- \`${r.p}\`: ${[...new Set(r.thirdParty)].slice(0, 5).join('; ')}`); }
const report = L.join('\n') + '\n';
if (OUT) fs.writeFileSync(OUT, report);
process.stdout.write(report);
process.exit(bad.length ? 1 : 0);
