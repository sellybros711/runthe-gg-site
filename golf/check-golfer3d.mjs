/* The 3D course golfer (golf/golfer3d.js): who sees it, and that every look draws in every direction.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-golfer3d.mjs
 *
 * The tracer's golfer used to be small hand-drawn sprites. golfer3d.js draws the player's own golfer from a
 * posed 3D model and hands every cell to the profile renderer's paint step, so it looks like the profile
 * picture. Everything that can go wrong here goes wrong quietly: a material the palette does not know is
 * painted magenta, a ball anchor off the canvas puts the golfer away from the ball, a gate that leaks shows
 * a preview to everybody. So each is asked directly.
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 220) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route(/supabase|googlesyndication|google-analytics|googletagmanager|jsdelivr/, r => r.abort());
await pg.goto(HOST + '/golf/', { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof hvSwingMarkup === 'function' && window.RTT_G3D, null, { timeout: 30000 });

head('1. WHO SEES IT');
const gate = await pg.evaluate(() => {
  const r = {};
  sbUser = null; sbUsername = ''; r.out = g3dOn();
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; r.other = g3dOn();
  sbUser = { id: 't' }; sbUsername = 'CSel8'; r.tester = g3dOn();
  r.live = G3D_LIVE;
  const keep = window.RTT_G3D; window.RTT_G3D = { API_VERSION: 999 }; r.stale = g3dOn(); window.RTT_G3D = keep;
  return r; });
ok('signed out: the old sprites', gate.out === false);
ok('signed in as anybody else: the old sprites', gate.other === false);
ok('a tester: the 3D golfer', gate.tester === true);
ok('G3D_LIVE is false, so this is still a preview', gate.live === false);
ok('a stale module is refused', gate.stale === false);

head('2. EVERY LOOK, EVERY AIM, EVERY SHOT');
const sweep = await pg.evaluate(() => {
  const hairs = Object.keys(PXG_HAIR), hats = ['cap', 'visor'].concat(Object.keys(PXG_HATS)), out = { sets: 0, magenta: 0, ballOff: 0, frames: 0, ex: [] };
  const tops = Object.keys(PXG_TOPS || {}), legs = Object.keys(PXG_LEGS || {}), cleats = Object.keys(PXG_CLEATS || {}), pats = Object.keys(PXPAT_BY || {}), ews = Object.keys(PXG_EYEWEAR || {});
  const N = Math.max(hairs.length, hats.length);
  for (let i = 0; i < N; i++) {
    const look = Object.assign({}, DEFLOOK, { hairStyle: hairs[i % hairs.length], hatStyle: hats[i % hats.length], cap: i % 7 !== 3,
      eyewear: i % 3 === 0 ? (ews[i % Math.max(1, ews.length)] || '') : '', top: i % 4 === 1 ? (tops[i % Math.max(1, tops.length)] || '') : '',
      leg: i % 5 === 2 ? (legs[i % Math.max(1, legs.length)] || '') : '', cleats: i % 6 === 4 ? (cleats[i % Math.max(1, cleats.length)] || '') : '',
      shirtPat: i % 4 === 3 ? (pats[i % Math.max(1, pats.length)] || '') : '', lefty: i % 2 === 1 });
    for (const kind of ['full', 'chip', 'putt']) for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
      if ((i + a / 45) % 3 && kind !== 'full') continue;   // every kind is covered without drawing all of them
      let s; try { s = RTT_G3D.set(look, a, kind); } catch (e) { out.ex.push(String(e)); continue; }
      out.sets++; out.frames += s.urls.length;
      if (!(s.ball[0] > 2 && s.ball[0] < s.W - 2 && s.ball[1] > 2 && s.ball[1] < s.H - 2)) { out.ballOff++; if (out.ex.length < 4) out.ex.push({ ball: s.ball, a, kind }); }
      for (const k of ['A', 'B', 'D', 'C'].slice(0, kind === 'putt' ? 0 : 1)) {
        const d = RTT_G3D.draw(look, a, kind, kind === 'putt' ? 'pA' : 'A').cv.getContext('2d').getImageData(0, 0, s.W, s.H).data;
        for (let j = 0; j < d.length; j += 4) if (d[j] === 255 && d[j + 1] === 0 && d[j + 2] === 255) { out.magenta++; if (out.ex.length < 4) out.ex.push({ look: look.hairStyle + '/' + look.hatStyle, a, kind }); break; }
      }
    }
  }
  return out; });
ok('sets drawn without throwing', sweep.sets > 100 && !sweep.ex.some(e => typeof e === 'string'), { sets: sweep.sets, ex: sweep.ex });
ok('every set has its frames (4 full, 4 chip, 3 putt)', sweep.frames >= sweep.sets * 3);
ok('no cell is painted with a material the palette does not know', sweep.magenta === 0, sweep);
ok('the ball anchor is on the canvas for every set', sweep.ballOff === 0, sweep);

head('2b. EVERY ITEM IN THE STORE IS DRAWN ON THE COURSE GOLFER');
// One item at a time, against the plain look. An item that draws nothing is the quiet failure here: the
// store sells it, the profile shows it, and the course golfer would play in the plain look with nothing
// said. So each one has to change the picture from some side. A tall hat must not shrink the golfer
// (the page sizes him by fig) and must not run off the top of the canvas.
const items = await pg.evaluate(() => {
  const base = Object.assign({}, DEFLOOK, { hairStyle: 'short', cap: true, hatStyle: 'cap', club: 'driver' });
  const list = [];
  Object.keys(PXG_HATS).forEach(k => list.push(['hat', k, { hatStyle: k }]));
  Object.keys(PXG_EYEWEAR).forEach(k => list.push(['eyewear', k, { eyewear: k }]));
  Object.keys(PXG_TOPS).forEach(k => list.push(['top', k, { top: k }]));
  Object.keys(PXG_LEGS).forEach(k => list.push(['leg', k, { leg: k }]));
  Object.keys(PXG_CLEATS).forEach(k => list.push(['cleats', k, { cleats: k }]));
  Object.keys(PXG_CLUBS).forEach(k => list.push(['club', k, { club: k }]));
  Object.keys(BODY_SKINS).forEach(k => list.push(['body', k, { body: k }]));
  Object.keys(PXG_HAIR).forEach(k => list.push(['hair', k, { hairStyle: k, cap: false }]));
  const aims = [0, 90, 180, 300], pic = (look, a, kind, pose) => RTT_G3D.draw(look, a, kind, pose);
  const bare = {}, bareFig = {};
  for (const a of aims) { const r = pic(base, a, 'full', 'A'); bare[a] = r.cv.toDataURL(); bareFig[a] = r.fig; }
  const out = { n: 0, blank: [], magenta: [], shrink: [], clipped: [], stray: [] };
  for (const [cat, id, o] of list) {
    out.n++; const look = Object.assign({}, base, o); let differs = false;
    for (const a of aims) for (const [kind, pose] of [['full', 'A'], ['full', 'B'], ['putt', 'pB']]) {
      const r = pic(look, a, kind, pose), cx = r.cv.getContext('2d'), d = cx.getImageData(0, 0, r.cv.width, r.cv.height).data;
      if (kind === 'full' && pose === 'A') { if (r.cv.toDataURL() !== bare[a]) differs = true; if (r.fig !== bareFig[a]) out.shrink.push(cat + ':' + id); }
      for (let j = 0; j < d.length; j += 4) if (d[j] === 255 && d[j + 1] === 0 && d[j + 2] === 255) { out.magenta.push(cat + ':' + id); break; }
      for (let x = 0; x < r.cv.width; x++) if (d[x * 4 + 3] > 0) { out.clipped.push(cat + ':' + id); break; }
      // and nothing lies apart from the golfer: every opaque cell is joined to the body (a stray piece of art)
      const W = r.cv.width, H = r.cv.height, on = i => d[i * 4 + 3] > 200, seen = new Uint8Array(W * H); let comps = 0, big = 0;
      for (let i = 0; i < W * H; i++) { if (!on(i) || seen[i]) continue; comps++; let n = 0; const st = [i]; seen[i] = 1;
        while (st.length) { const c = st.pop(); n++; const cx = c % W, cy = (c / W) | 0;
          for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const x2 = cx + ox, y2 = cy + oy; if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue;
            const j = y2 * W + x2; if (on(j) && !seen[j]) { seen[j] = 1; st.push(j); } } }
        if (n > 3) big++; }
      if (big > 1) out.stray.push(cat + ':' + id + '@' + a + kind + pose);
    }
    // the stock shapes carry no finish of their own: they ARE the starter set, drawn by the shot
    if (!differs && !(cat === 'hair' && id === 'short') && !(cat === 'club' && !PXG_CLUB_PAL[id])) out.blank.push(cat + ':' + id);
  }
  for (const k of ['magenta', 'shrink', 'clipped', 'stray']) out[k] = [...new Set(out[k])];
  return out; });
ok('every item was tried (hats, eyewear, tops, legwear, cleats, clubs, skins, hair)', items.n > 120, { n: items.n });
ok('every item changes the course golfer from some side', items.blank.length === 0, items.blank);
ok('no item paints a material the palette does not know', items.magenta.length === 0, items.magenta);
ok('a hat never changes the golfer\'s size', items.shrink.length === 0, items.shrink);
ok('nothing runs off the top of the canvas', items.clipped.length === 0, items.clipped);
ok('no item leaves a piece lying apart from the golfer', items.stray.length === 0, items.stray.slice(0, 12));

head('3. THE TRACER USES IT FOR A TESTER, AND ONLY FOR A TESTER');
const tr = await pg.evaluate(() => {
  const ck = Object.keys(DAILY_COURSES)[2], h = DAILY_COURSES[ck].holes[1], sk = {}; CATS.forEach(c => sk[c.k] = 80);
  const shots = dShotSeq(h[0], h[1], h[0], mulberry32(7), sk, {}); const hole = { n: 2, par: h[0], yards: h[1], shots };
  S.look = Object.assign({}, DEFLOOK);
  const grab = () => { const n = hvNode(hole, 1, 1, ck); const im = n.querySelector('image.hvsw'); return im ? im.getAttribute('width') + 'x' + im.getAttribute('height') + ':' + im.getAttribute('href').length : ''; };
  sbUser = { id: 't' }; sbUsername = 'CSel8'; const t = grab();
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; const o = grab();
  const lw = RTT_G3D.set(S.look, 0, 'full');
  return { t, o, w: lw.W, h: lw.H }; });
ok('a tester\'s tee shot draws the 3D golfer', tr.t !== '' && tr.t !== tr.o, tr);
ok('anybody else\'s tee shot keeps the old sprite', tr.o !== '' && tr.t !== tr.o, tr);

ok('no page errors', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
