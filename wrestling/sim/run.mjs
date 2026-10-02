/* The career simulator.

     node wrestling/sim/run.mjs                    300 careers, every difficulty, every policy
     node wrestling/sim/run.mjs --careers 1000     the full sample
     node wrestling/sim/run.mjs --jobs 6           pages at once
     node wrestling/sim/run.mjs --diff pro         one difficulty
     node wrestling/sim/run.mjs --strict           fail on a balance band, not only on a fault

   It plays the REAL page in a headless browser rather than a copy of the
   engine. The engine lives in one inline script, and a second copy of it in
   node would be a second game that agrees with itself. So this is slower per
   career and it is the only version whose answer is about the game people play.

   Every career runs from a quick start to retirement (or a 30 year cap) and is
   played by one of three choice policies:

     first   always the first line of every scene, training the plan's stat
     random  a random line, a random stat
     rotate  the lines in turn, so every line gets said over a run

   What fails the run: a page error, a thrown engine call, a meter out of its
   range, a title held with no open reign, a career that never ends. What it
   REPORTS: the balance table against NARRATIVE.md section 12 and a coverage
   table of every scene, so content nothing reaches is named rather than
   shipped. Bands are a report until the story engine (Phase C) exists to be
   held to them; --strict turns them into failures. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CAREERS = +arg('careers', 300);
const JOBS = +arg('jobs', 4);
const DIFFS = arg('diff', 'rookie,pro,legend').split(',');
const POLICIES = arg('policy', 'first,random,rotate').split(',');
const STRICT = process.argv.includes('--strict');
const YEAR_CAP = 30;

let pw;
try { pw = await import('playwright'); }
catch (_) { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise(ok => server.listen(0, ok));
const URL = `http://localhost:${server.address().port}/wrestling/`;

// one career, played entirely inside the page
function playCareer({ diff, policy, cap }) {
  try { endTour(); closeModal(); } catch (_) {}
  localStorage.removeItem(activeSaveKey());
  doQuickStart();
  try { endTour(); closeModal(); } catch (_) {}
  G.prefs.difficulty = diff;
  const c = G.car, faults = [], scenes = {};
  const F = m => { if (faults.length < 8) faults.push(`Y${c.year}W${c.week} ${m}`); };
  const start = c.year; let guard = 0, n = 0, maxTier = 0, injuredOnce = false, world = false;
  const pickOpt = opts => policy === 'first' ? opts[0] : policy === 'random' ? opts[Math.floor(Math.random() * opts.length)] : opts[n % opts.length];
  while (!c.retired && c.year < start + cap && guard++ < 60 * 40) {
    if (!(c.cond >= 0 && c.cond <= 100)) F('condition out of range');
    if (!(c.pop >= 0 && c.pop <= 100)) F('pop out of range');
    if (!(c.standing >= 0 && c.standing <= 100)) F('standing out of range');
    if (c.rep < 0) F('negative reputation');
    if (c.title && !c.reigns.some(r => r.title === c.title && !r.lostYear)) F('title with no open reign');
    const pr = (PROMOS.find(p => p.id === (c.deal && c.deal.promo)) || {});
    if (c.title && pr.tier === 'global') world = true;   // a top tier promotion's own belt
    const ti = TIERS.findIndex(t => t.id === (tierOfRep(c.rep) || 'indie')); if (ti > maxTier) maxTier = ti;
    while (G.w.tp > 0) {
      const b = G.w.tp;
      const a = policy === 'random' ? ATTRS[Math.floor(Math.random() * ATTRS.length)][0] : ((catById(c.plan.a) || {}).attr || 'po');
      try { spendTP(a); } catch (_) { G.w.tp--; }
      if (G.w.tp >= b) G.w.tp--;
    }
    if (c.freeAgent) { try { signDeal(0); } catch (_) { c.freeAgent = false; } continue; }
    if (c.injWeeks > 0) { if (c.injWeeks >= 8) injuredOnce = true; try { doRest(); } catch (e) { F('doRest threw: ' + e.message); break; } continue; }
    if (c.mentorWeeks > 0) { try { doMentorWeek(); } catch (e) { F('mentor threw: ' + e.message); break; } continue; }
    try { bookWeek(); } catch (e) { F('bookWeek threw: ' + e.message); break; }
    const b = c.booking; if (!b) { try { advanceWeek(); } catch (e) { F('advanceWeek threw: ' + e.message); break; } continue; }
    if (b.type === 'match') {
      try {
        const sc = pickScene('prematch');
        if (sc) {
          const x = sceneCtx(); let cast = null;
          try { cast = sc.cast ? sc.cast(x) : { a: null }; } catch (_) {}
          if (!(sc.cast && (!cast || !cast.a))) {
            Object.assign(x, cast || {});
            c._scenesSeen = (c._scenesSeen || []).concat([sc.id]).slice(-40);
            scenes[sc.id] = (scenes[sc.id] || 0) + 1;
            const st = sc.beats && sc.beats.start;
            if (st) {
              const opts = typeof st.opts === 'function' ? st.opts(x) : (st.opts || []);
              const o = opts.length && pickOpt(opts);
              if (o) { if (o.eff) applySceneEffect(o.eff, x); if (o.mem) sceneRemember(o.mem); }
            }
            if (!sc.noMark) markSegmentPlayed();
          }
        }
      } catch (e) { F('scene threw: ' + e.message); }
      let res; try { res = simMatch(b.o); } catch (e) { F('simMatch threw: ' + e.message); advanceWeek(); continue; }
      try { applyMatch(b.o, res); } catch (e) { F('applyMatch threw: ' + e.message); }
      n++; continue;
    }
    try { advanceWeek(); } catch (e) { F('advanceWeek threw: ' + e.message); break; }
  }
  if (!c.retired) { if (c.year >= start + cap) retire('Simulator year cap.'); else F('career never ended'); }
  const legacy = legacyOf(c, G.w);
  return {
    diff, policy, faults, scenes, years: c.year - start, age: c.age, matches: n, maxTier,
    anyTitle: (c.reigns || []).length > 0, world, legacy, hof: legacy >= 120, headliner: legacy >= 180,
    injuryEnd: /landing too many|doctor/i.test(c.retireReason || ''), injuredOnce,
  };
}

const browser = await pw.chromium.launch();
const jobs = [];
for (let i = 0; i < CAREERS; i++) jobs.push({ diff: DIFFS[i % DIFFS.length], policy: POLICIES[Math.floor(i / DIFFS.length) % POLICIES.length], cap: YEAR_CAP });
const results = [], pageErrors = [];
let next = 0, done = 0;
const t0 = Date.now();
async function worker() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (pageErrors.length < 20) pageErrors.push(e.message); });
  await page.route(u => !u.href.startsWith(URL.replace(/wrestling\/$/, '')), r => r.abort());
  await page.goto(URL); await page.waitForTimeout(600);
  await page.evaluate(src => { window.__playCareer = eval('(' + src + ')'); }, playCareer.toString());
  while (next < jobs.length) {
    const job = jobs[next++];
    try { results.push(await page.evaluate(j => window.__playCareer(j), job)); }
    catch (e) { results.push({ ...job, faults: ['evaluate failed: ' + e.message.split('\n')[0]], scenes: {} }); }
    if (++done % 25 === 0) process.stdout.write(`  ${done}/${jobs.length} careers, ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: JOBS }, worker));
await browser.close(); server.close();

// ---------- report ----------
const pct = (xs, f) => xs.length ? Math.round(100 * xs.filter(f).length / xs.length) : 0;
const med = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const BANDS = {   // NARRATIVE.md section 12
  rookie: { years: [15, 19], tv: [75, 85], title: [90, 98], world: [45, 60], hof: [35, 50], head: [8, 14], injEnd: [6, 12], inj: [45, 60], rel: [15, 25] },
  pro:    { years: [13, 17], tv: [60, 72], title: [80, 90], world: [28, 40], hof: [22, 32], head: [4, 8],  injEnd: [8, 14], inj: [50, 65], rel: [20, 30] },
  legend: { years: [10, 15], tv: [40, 55], title: [60, 75], world: [12, 22], hof: [10, 18], head: [1, 4],  injEnd: [10, 18], inj: [55, 70], rel: [25, 40] },
};
let failures = 0, bandMisses = 0;
const faulty = results.filter(r => r.faults && r.faults.length);
console.log(`\n${results.length} careers in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${JOBS} pages`);
if (pageErrors.length) { failures++; console.log('FAIL page errors:\n  ' + [...new Set(pageErrors)].slice(0, 6).join('\n  ')); }
if (faulty.length) { failures++; console.log(`FAIL ${faulty.length} careers with faults:`); faulty.slice(0, 6).forEach(r => console.log(`  ${r.diff}/${r.policy}: ${r.faults.join(' | ')}`)); }
else console.log('ok   no career hit a fault');

for (const d of DIFFS) {
  const xs = results.filter(r => r.diff === d && r.years != null); if (!xs.length) continue;
  const row = { years: med(xs.map(r => r.years)), tv: pct(xs, r => r.maxTier >= 2), title: pct(xs, r => r.anyTitle), world: pct(xs, r => r.world),
    hof: pct(xs, r => r.hof), head: pct(xs, r => r.headliner), injEnd: pct(xs, r => r.injuryEnd), inj: pct(xs, r => r.injuredOnce) };
  console.log(`\n${d} (${xs.length} careers)`);
  const names = { years: 'median years', tv: 'reach national TV %', title: 'win any title %', world: 'win a world title %', hof: 'Hall of Fame %',
    head: 'headliner %', injEnd: 'ended by injury %', inj: 'a long injury %' };
  for (const k of Object.keys(names)) {
    const [lo, hi] = BANDS[d][k]; const v = row[k]; const inBand = v >= lo && v <= hi;
    if (!inBand) bandMisses++;
    console.log(`  ${inBand ? 'ok  ' : 'off '} ${names[k].padEnd(22)} ${String(v).padStart(4)}   want ${lo} to ${hi}`);
  }
  for (const p of POLICIES) { const ys = xs.filter(r => r.policy === p); if (ys.length) console.log(`       policy ${p.padEnd(7)} median ${med(ys.map(r => r.years))} years, Hall ${pct(ys, r => r.hof)}%, legacy median ${med(ys.map(r => r.legacy))}`); }
}

const seen = {}; results.forEach(r => Object.entries(r.scenes || {}).forEach(([k, v]) => { seen[k] = (seen[k] || 0) + v; }));
const ids = Object.keys(seen).sort((a, b) => seen[b] - seen[a]);
console.log(`\nscenes reached: ${ids.length}. Most common: ${ids.slice(0, 6).map(k => `${k} ${seen[k]}`).join(', ')}`);
console.log(`least common: ${ids.slice(-6).map(k => `${k} ${seen[k]}`).join(', ')}`);
const outFile = path.join(ROOT, 'wrestling', 'sim', 'last-run.json');
fs.writeFileSync(outFile, JSON.stringify({ careers: results.length, at: 'see git log', scenes: seen }, null, 1));
if (STRICT && bandMisses) failures++;
console.log(failures ? `\n${failures} FAILED` : `\nall good${bandMisses ? ` (${bandMisses} balance readings outside their bands, reported only)` : ''}`);
process.exit(failures ? 1 : 0);
