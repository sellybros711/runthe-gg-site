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

   It also asks the Supabase project every game signs in through whether it answers: sign-in
   (/auth/v1/health) and the database (/rest/v1/). On 2026-11-12 the project stopped answering
   (Cloudflare 522) and every page here still loaded, because each game falls back to playing
   without an account, so this check stayed green while nobody could sign in anywhere. The project's
   address and public anon key are read from arcade/auth.js, the same values the browser uses.

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

const AD_HOSTS = /^https?:\/\/([^/]*\.)?(googlesyndication\.com|doubleclick\.net|googleadservices\.com|googletagservices\.com|adtrafficquality\.google|fundingchoicesmessages\.google\.com|google-analytics\.com|googletagmanager\.com)\//;
const host = new URL(BASE).host;
const ours = (u) => { try { return new URL(u, BASE).host === host; } catch { return false; } };
const browser = await chromium.launch();
const rows = [];
for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  /* NEVER ASK GOOGLE FOR AN AD (Ads Agent, 2026-10-31). This runs every hour from a data centre, so
     every ad it loaded was a robot's ad request and impression on the owner's AdSense account (576
     page loads a day), and analytics counted it as a visitor. AdSense limited the account for
     traffic quality on 2026-10-30. The ad and analytics hosts are refused here, so the check still
     sees the site's own files and errors and never touches the ad account. */
  await ctx.route(AD_HOSTS, (r) => r.abort('aborted'));
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

/* SIGN-IN AND THE DATABASE. Two tries ten seconds apart, so one dropped request never opens an
   issue; two in a row is the project really not answering. */
const authSrc = fs.readFileSync(path.join(ROOT, 'arcade/auth.js'), 'utf8');
const SB_URL = (authSrc.match(/SB_URL\s*=\s*'([^']+)'/) || [])[1];
const SB_ANON = (authSrc.match(/SB_ANON\s*=\s*'([^']+)'/) || [])[1];
async function ask(u) {
  let last = '';
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise((r) => setTimeout(r, 10000));
    const t0 = Date.now();
    try {
      const r = await fetch(u, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }, signal: AbortSignal.timeout(20000) });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      // Up means it answered at all. A 401 or 404 is the project replying (the database root can
      // refuse an anon key), and only a 5xx or no answer is it being down.
      if (r.status < 500) return { ok: true, status: r.status, secs };
      last = { ok: false, status: r.status, secs, why: `answered ${r.status}${r.status === 522 ? ' (Cloudflare could not reach the project)' : ''}` };
    } catch (e) { last = { ok: false, status: 0, secs: ((Date.now() - t0) / 1000).toFixed(1), why: `no answer: ${String(e.message || e).slice(0, 120)}` }; }
  }
  return last;
}
if (!SB_URL || !SB_ANON) rows.push({ p: 'Supabase', ok: false, status: 0, secs: '0', errors: ['could not read SB_URL and SB_ANON from arcade/auth.js'], missing: [], thirdParty: [] });
else for (const [name, u] of [['Supabase: sign-in', `${SB_URL}/auth/v1/health`], ['Supabase: database', `${SB_URL}/rest/v1/`]]) {
  const r = await ask(u);
  rows.push({ p: name, ok: r.ok, status: r.status, secs: r.secs, errors: r.ok ? [] : [`${r.why}. Every game's accounts, boards and saves are down. Check status.supabase.com, then the project in the Supabase dashboard.`], missing: [], thirdParty: [] });
  console.error(`${r.ok ? 'ok  ' : 'FAIL'} ${String(r.status).padEnd(4)} ${name}`);
}

const bad = rows.filter(r => !r.ok);
const L = [`# Live site check: ${BASE}`, '', `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, ${rows.length} checks, ${bad.length} failing.`, ''];
L.push('| check | status | result | secs |', '|---|---|---|---|');
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
