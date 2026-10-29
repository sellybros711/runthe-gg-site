/* The 3D ring's own guard.

     node wrestling/ring3d/check.mjs

   Everything that goes wrong in a 3D ring goes wrong silently. A pose name the
   engine asks for and this folder does not have resolves to the ready stance,
   so a pin is two men standing up. A clip that puts a body under the canvas
   renders perfectly. A stage that throws on boot leaves the classic ring, which
   also renders perfectly. So every claim here is read off the running scene. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const section = (s) => console.log('\n== ' + s);

/* ---------- 1. every pose the engine asks for exists ---------- */
section('every pose the match engine names has a 3D pose');
{
  const { POSES } = await import('./poses.js');
  const ALIAS = { idle: 1, bump: 1, flat: 1 };
  const page = fs.readFileSync(path.join(ROOT, 'wrestling', 'index.html'), 'utf8');
  const names = new Set();
  for (const m of page.matchAll(/pose:'([a-zA-Z]+)'/g)) names.add(m[1]);
  for (const m of page.matchAll(/poseSet\([^,]+,'([a-zA-Z]+)'/g)) names.add(m[1]);
  /* coverage: a reader that finds nothing passes everything */
  if (names.size < 20) bad(`only ${names.size} pose names were read out of index.html; the reader is broken`);
  const miss = [...names].filter((n) => !POSES[n] && !ALIAS[n]);
  if (miss.length) bad('no 3D pose for: ' + miss.join(', ')); else ok(`all ${names.size} pose names resolve`);
}

/* ---------- 2. every family the engine plays has clips ---------- */
section('every move family the engine plays has a clip');
{
  const { FAMILIES } = await import('./moves.js');
  const page = fs.readFileSync(path.join(ROOT, 'wrestling', 'index.html'), 'utf8');
  const ch = page.match(/const CHOREO=\{([\s\S]*?)\};/);
  const fams = ch ? [...ch[1].matchAll(/([a-z]+):ch/g)].map((m) => m[1]) : [];
  for (const m of page.matchAll(/spot\('([a-z]+)'/g)) fams.push(m[1]);
  if (fams.length < 9) bad(`only ${fams.length} families read out of CHOREO; the reader is broken`);
  const miss = [...new Set(fams)].filter((f) => !FAMILIES[f] || !Object.keys(FAMILIES[f]).length);
  if (miss.length) bad('no clip for family: ' + miss.join(', ')); else ok(`${new Set(fams).size} families, each with clips`);
}

/* ---------- the browser half ---------- */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { bad('playwright is not installed; the browser checks did not run'); process.exit(1); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}`;
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const NOT_OURS = /ERR_CONNECTION|ERR_CERT|ERR_PROXY|ERR_NAME_NOT_RESOLVED|favicon|fonts\.g/;
async function open(url, opts = {}) {
  const page = await browser.newPage({ viewport: opts.viewport || { width: 900, height: 700 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  /* a failed load is read by its URL, because the console line for it names none */
  page.on('console', (m) => { if (m.type() === 'error' && !NOT_OURS.test(m.text()) && !/^Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !(opts.block && /ring3d/.test(r.url()))) errs.push(r.status() + ' ' + r.url()); });
  if (opts.block) await page.route(opts.block, (r) => r.abort());
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, errs };
}

/* ---------- 3. every clip, played frame by frame ---------- */
section('every clip plays to the end and keeps both bodies in the ring');
{
  const { page, errs } = await open(URL_ + '/wrestling/ring3d/lab.html?manual=1');
  await page.waitForFunction(() => window.LAB_READY, null, { timeout: 60000 });
  const out = await page.evaluate(async () => {
    const { allClips } = await import('./moves.js?v=1');
    const st = STAGE, res = [];
    const low = (f) => Math.min(...['lF', 'rF', 'pelvis', 'head'].map((n) => f.w.point(n).y));
    for (const [fam, v] of allClips()) {
      const A = st.figs.me, D = st.figs.opp;
      A.snap(new A.pos.constructor(-2.4, 0, 0), Math.PI / 2); D.snap(new D.pos.constructor(2.4, 0, 0), -Math.PI / 2);
      A.go('ready', null, 1); D.go('ready', null, 1);
      for (let i = 0; i < 6; i++) st.frame(1 / 30);
      let done = false, hits = 0, minY = 1e9, maxR = 0, nan = false;
      st.play(fam, v, 'me', 'opp', { hit() { hits++; } }).then(() => { done = true; });
      let t = 0;
      while (!done && t < 12) {
        st.frame(1 / 30); t += 1 / 30;
        for (const f of [A, D]) {
          const y = low(f), p = f.pos;
          if (!Number.isFinite(y) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) nan = true;
          minY = Math.min(minY, y); maxR = Math.max(maxR, Math.abs(p.x), Math.abs(p.z));
        }
        await 0;
      }
      res.push({ c: fam + ':' + v, done, t: +t.toFixed(2), hits, minY: +minY.toFixed(2), maxR: +maxR.toFixed(2), nan });
    }
    return res;
  });
  if (out.length < 25) bad(`only ${out.length} clips were played`);
  for (const r of out) {
    const why = [];
    if (!r.done) why.push('never finished');
    if (r.nan) why.push('a position went NaN');
    if (!r.hits) why.push('never called hit, so the engine applies no damage on time');
    /* A body may lie on the canvas. Its lowest joint going through it is a clip
       error, with one allowance: the frame or two a body falls off a lift (a
       piledriver's release, a suplex's flip) blends two keys and dips about
       two thirds of a foot. Past three quarters is a key in the wrong place. */
    if (r.minY < -0.75) why.push(`a body went ${(-r.minY).toFixed(2)} ft under the canvas`);
    /* the apron edge: nothing a clip does throws a body out of the building */
    if (r.maxR > 12.5) why.push(`a body reached ${r.maxR} ft from centre`);
    if (why.length) bad(`${r.c}: ${why.join('; ')}`);
  }
  if (!out.some((r) => !r.done || r.nan || !r.hits || r.minY < -0.75 || r.maxR > 12.5)) ok(`${out.length} clips, every one finishes, hits, and stays on the canvas`);
  if (errs.length) bad('lab errors: ' + errs.slice(0, 3).join(' | '));

  /* ---------- 4. the rig, every build ---------- */
  section('every build and figure builds clean');
  const rig = await page.evaluate(() => {
    const st = STAGE, res = [];
    for (const build of ['cruiser', 'athletic', 'heavy', 'super', 'giant']) for (const figure of ['m', 'f']) {
      st.look('extra', { v: 2, build, figure, skin: 3, hair: 'short', bottom: 'trunks', boots: 'tall', gear: '#2f6fd8', trim: '#f2d27a' });
      st.show('extra', true);
      const f = st.figs.extra; f.go('ready', null, 1); st.frame(1 / 30);
      const h = f.w.point('head').y - Math.min(f.w.point('lF').y, f.w.point('rF').y);
      res.push({ build, figure, h: +h.toFixed(2) });
    }
    st.show('extra', false);
    return res;
  });
  let prev = 0;
  for (const r of rig.filter((r) => r.figure === 'm')) {
    if (!(r.h > 3 && r.h < 9)) bad(`${r.build}: head ${r.h} ft above the feet`);
    if (r.h + 0.05 < prev && r.build !== 'heavy') bad(`${r.build} stands shorter than the build before it`);
    prev = r.h;
  }
  if (rig.some((r) => !Number.isFinite(r.h))) bad('a build came out NaN');
  else ok('builds: ' + rig.filter((r) => r.figure === 'm').map((r) => r.build + ' ' + r.h).join(', '));
  await page.close();
}

/* ---------- 5. a real match, in 3D, to its result ---------- */
async function match(opts) {
  const { page, errs } = await open(URL_ + '/wrestling/', opts);
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  if (opts.off) await page.evaluate(() => localStorage.setItem('rtr_ring3d', '0'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => quickStart());
  await page.waitForTimeout(600);
  const r = await page.evaluate(async () => {
    try { endTour(); closeModal(); } catch (_) {}
    FIGHT_SPEED = 30; G.car.seenFight = true; G.car.decSeen = true; G.car.tourDone = true;
    window.RTR_AUTO = { tap: true, decide: 0 };
    const opp = houseRoster(myPromoId())[0];
    const o = { oppId: opp.id, oppName: opp.name, oppOvr: ovr(G.w), stip: 'singles', stipLabel: 'Singles', mult: 1, purse: 100, stakes: 'standard', card: 'Opener' };
    G.car.booking = { type: 'match', o }; startFight(o);
    const r3dAtBell = !!ST.r3d;
    const t = performance.now();
    while (!(LAST_RESULT && LAST_RESULT.o === o) && performance.now() - t < 90000) {
      const mb = document.querySelector('#modalBack.open #modalBtns button'); if (mb) mb.click();
      try { const mo = document.getElementById('momentBack'); if (mo && mo.classList.contains('open')) nextMoment(); } catch (_) {}
      await new Promise((res) => setTimeout(res, 150));
    }
    return { r3d: r3dAtBell, done: !!(LAST_RESULT && LAST_RESULT.o === o), calls: window.R3D ? R3D.r.info.render.calls : (typeof R3D !== 'undefined' && R3D ? R3D.r.info.render.calls : null), canvas: !!document.querySelector('#arena canvas'), cls: document.getElementById('arena').classList.contains('r3d') };
  });
  await page.close();
  return { r, errs };
}
section('a match in the 3D ring plays to its result');
{
  const { r, errs } = await match({});
  if (!r.r3d || !r.canvas || !r.cls) bad(`the match did not run in 3D (r3d ${r.r3d}, canvas ${r.canvas})`);
  else if (!r.done) bad('the 3D match never reached a result');
  else ok('3D match finished');
  if (r.calls != null && r.calls > 45) bad(`${r.calls} draw calls in the match; the budget is 45`);
  else if (r.calls != null) ok(`${r.calls} draw calls`);
  if (errs.length) bad('errors: ' + errs.slice(0, 3).join(' | '));
}
section('with the 3D files blocked, the classic ring plays');
{
  const { r, errs } = await match({ block: '**/ring3d/**' });
  if (r.r3d || r.cls) bad('the arena still thinks it is 3D with the module blocked');
  else if (!r.done) bad('the classic match never reached a result');
  else ok('classic ring finished with ring3d blocked');
  const own = errs.filter((e) => !/ring3d|Failed to load resource/.test(e));
  if (own.length) bad('errors: ' + own.slice(0, 3).join(' | '));
}
section('the Help switch puts the classic ring back');
{
  const { r, errs } = await match({ off: true });
  if (r.r3d || r.cls) bad('rtr_ring3d=0 and the match was still 3D');
  else if (!r.done) bad('the classic match never reached a result');
  else ok('switched off, the classic ring plays');
  if (errs.length) bad('errors: ' + errs.slice(0, 3).join(' | '));
}

await browser.close(); server.close();
console.log(fails ? `\n${fails} problem(s)` : '\nall clear');
process.exit(fails ? 1 : 0);
