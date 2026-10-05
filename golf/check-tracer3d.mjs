/* The 3D course (golf/tracer3d.js): who sees it, that every course draws, that nothing the ball can rest on
 * moves, that it stays fast, and that the ball keeps one scale against the golfer on every camera.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-tracer3d.mjs            every course, a few holes each, plus the close-up
 *   node golf/check-tracer3d.mjs --quick    six courses
 *
 * Everything here fails quietly. A ground pixel the 3D pass forgets shows as a black hole in the course; a
 * play surface given height puts the ball beside the spot it is drawn on; a slow tile is a stutter between
 * holes on a phone. None of them throws, so each is measured.
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099', QUICK = process.argv.includes('--quick');
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 260) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route(/supabase|googlesyndication|google-analytics|googletagmanager|jsdelivr/, r => r.abort());
await pg.goto(HOST + '/golf/', { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof pxTerrainURL === 'function' && window.RTT_T3D && window.PXHD, null, { timeout: 30000 });

head('1. WHO SEES IT');
const gate = await pg.evaluate(() => {
  const r = { live: T3D_LIVE }, keep = T3D_LIVE;
  T3D_LIVE = false;
  sbUser = null; sbUsername = ''; r.out = t3dOn();
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; r.other = t3dOn();
  sbUser = { id: 't' }; sbUsername = 'CSel8'; r.tester = t3dOn();
  const m = window.RTT_T3D; window.RTT_T3D = { API_VERSION: 999 }; r.stale = t3dOn(); window.RTT_T3D = m;
  T3D_LIVE = true; sbUser = null; sbUsername = ''; r.liveOut = t3dOn();
  T3D_LIVE = keep; return r; });
ok('T3D_LIVE ships false: a tester preview', gate.live === false);
ok('signed out sees the flat course', gate.out === false);
ok('another account sees the flat course', gate.other === false);
ok('a tester sees the 3D course (any capitalisation)', gate.tester === true);
ok('a stale tracer3d.js is refused', gate.stale === false);
ok('T3D_LIVE=true gives it to everybody', gate.liveOut === true);

head('2. EVERY COURSE DRAWS, AND THE BALL\'S GROUND STAYS FLAT');
const draw = await pg.evaluate(async (quick) => {
  T3D_LIVE = true;
  const keys = Object.keys(DAILY_COURSES), pick = quick ? keys.filter((k, i) => i % Math.ceil(keys.length / 6) === 0) : keys;
  const out = { courses: 0, tiles: 0, holes: [], moved: [], tiny: [], ms3: [], msF: [], details: 0, noScenery: [] };
  const img = (url) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = url; });
  for (const ck of pick){
    const C = DAILY_COURSES[ck], B = hvBiome(ck), idxs = quick ? [0, 7] : [0, 4, 11];
    out.courses++;
    for (const hi of idxs){
      const h = C.holes[hi]; if (!h) continue;
      const seedN = (dHash(ck) ^ Math.imul(hi + 1, 0x9e3779b1)) >>> 0; HV_EXL = HV_EX; HV_CAML = HV_CAM;
      const g = hvGeom(seedN, h[0], h[1], ck, hi);
      const tiles = [{}];
      if (hi === idxs[0]){ const dc = hvGreenCam(g, g.pin || [g.gcx, g.L - 4]); const dens = HV_PX_DETAIL * 1.14, gh = Math.max(120, Math.min(420, Math.round(dens))), gw = Math.max(120, Math.min(900, Math.round(dens * dc[2] / dc[3])));
        tiles.push({ cam: dc, gw, gh, os: (gh / dc[3]) / (HV_PX_BASEH / HV_H) }); }
      for (const opt of tiles){
        _pxCache.clear(); T3D_LIVE = false; let t0 = performance.now(); pxTerrainURL(g, seedN, B, opt); out.msF.push(performance.now() - t0);
        _pxCache.clear(); T3D_LIVE = true; window.__T3D_PROBE = []; t0 = performance.now(); const url = pxTerrainURL(g, seedN, B, opt); out.ms3.push(performance.now() - t0);
        const pr = window.__T3D_PROBE[0]; window.__T3D_PROBE = null; out.tiles++; if (opt.cam) out.details++;
        const tag = ck + ' #' + (hi + 1) + (opt.cam ? ' close-up' : '');
        if (!pr){ out.holes.push(tag + ': the 3D pass did not run'); continue; }
        if (pr.REC === 0 && !opt.cam) out.noScenery.push(tag);
        // nothing the ball can rest on, and no rough within LIFT_FROM of play, is lifted
        const { RO, DE, OC } = pr.ID; let moved = 0;
        for (let i = 0; i < pr.GW * pr.GH; i++){ const t = pr.T[i];
          if (t === OC) continue;
          if ((t !== RO && t !== DE) || pr.DIST[i] < 6 * pr.os){ if (Math.abs(pr.LF[i]) > 1e-6) moved++; } }
        if (moved) out.moved.push(tag + ': ' + moved + ' px');
        // no hole: every pixel opaque, none pure black
        const im = await img(url), c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data; let holes = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 255 || (d[i] < 6 && d[i + 1] < 6 && d[i + 2] < 6)) holes++;
        if (holes) out.holes.push(tag + ': ' + holes + ' px');
      }
    }
  }
  const med = a => { const s = a.slice().sort((p, q) => p - q); return Math.round(s[s.length >> 1]); };
  const p90 = a => { const s = a.slice().sort((p, q) => p - q); return Math.round(s[Math.floor(s.length * 0.9)]); };
  out.extra = out.ms3.map((v, i) => v - out.msF[i]); out.medExtra = med(out.extra); out.p90Extra = p90(out.extra); out.med3 = med(out.ms3);
  delete out.ms3; delete out.msF; delete out.extra;
  return out; }, QUICK);
ok('every course was drawn, with its close-up', draw.courses >= (QUICK ? 5 : 40) && draw.details === draw.courses, { courses: draw.courses, tiles: draw.tiles, details: draw.details });
ok('no tile has a hole in it (transparent or black pixels)', draw.holes.length === 0, draw.holes.slice(0, 8));
ok('nothing the ball can rest on is lifted (green, fringe, fairway, cut, tee, sand, water, near rough)', draw.moved.length === 0, draw.moved.slice(0, 8));
ok('scenery is stood up on every full-hole tile', draw.noScenery.length === 0, draw.noScenery.slice(0, 8));
ok('the 3D pass adds under 300ms at the median (this machine)', draw.medExtra < 300, { medExtra: draw.medExtra, p90Extra: draw.p90Extra, median3d: draw.med3 });

head('3. A FAILED 3D PASS STILL DRAWS THE COURSE');
const fb = await pg.evaluate(() => {
  T3D_LIVE = true; const ck = Object.keys(DAILY_COURSES)[0], h = DAILY_COURSES[ck].holes[2], seedN = (dHash(ck) ^ Math.imul(3, 0x9e3779b1)) >>> 0;
  const g = hvGeom(seedN, h[0], h[1], ck, 2), B = hvBiome(ck);
  const keep = window.RTT_T3D.render; window.RTT_T3D.render = () => { throw new Error('probe'); };
  const warn = console.warn; console.warn = () => {}; _pxCache.clear(); const url = pxTerrainURL(g, seedN, B); console.warn = warn;
  window.RTT_T3D.render = keep; T3D_LIVE = false; _pxCache.clear(); const flat = pxTerrainURL(g, seedN, B);
  return { len: (url || '').length, flatLen: flat.length }; });
ok('a throwing 3D pass falls back to a full flat tile', fb.len > fb.flatLen * 0.6, fb);

head('4. THE BALL KEEPS ONE SCALE AGAINST THE GOLFER');
const sc = await pg.evaluate(() => {
  T3D_LIVE = false; const rows = [];
  S.look = Object.assign({}, DEFLOOK); sbUser = { id: 'x' }; sbUsername = 'somebodyelse';
  for (const ck of Object.keys(DAILY_COURSES).slice(0, 6)){
    for (let hi = 0; hi < 18; hi += 5){
      const h = DAILY_COURSES[ck].holes[hi], sk = {}; CATS.forEach(c => sk[c.k] = 70);
      const shots = dShotSeq(h[0], h[1], h[0], mulberry32(hi + 3), sk, {}); const hole = { n: hi + 1, par: h[0], yards: h[1], shots };
      for (let r = 1; r <= shots.length; r++){
        const n = hvNode(hole, r, hi, ck); if (!n) continue;
        const ball = n.querySelector('#hv-ball'), im = n.querySelector('image.hvsw'); if (!ball || !im) continue;
        const k = shots[r - 1].k, rr = +ball.getAttribute('r'), H = +im.getAttribute('data-fig');
        if (rr > 0 && H > 0) rows.push({ k, ratio: rr / H, r: rr, H }); } } }
  return rows; });
const ratios = sc.map(x => x.ratio), lo = Math.min(...ratios), hi = Math.max(...ratios);
const kinds = [...new Set(sc.map(x => x.k))];
ok('shots of every kind were measured (tee, approach, chip, putt)', sc.length > 30 && kinds.includes('putt') && kinds.length >= 3, { n: sc.length, kinds });
ok('the ball is the same share of the golfer on every camera (within 3%)', hi / lo < 1.03, { lo: +lo.toFixed(4), hi: +hi.toFixed(4) });

ok('no page errors', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
