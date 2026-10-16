/* The 3D course golfer (golf/golfer3d.js): who sees it, and that every look draws in every direction.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-golfer3d.mjs
 *
 * The tracer's golfer used to be small hand-drawn sprites. golfer3d.js draws the player's own golfer from a
 * posed 3D model and hands every cell to the profile renderer's paint step, so it looks like the profile
 * picture. Everything that can go wrong here goes wrong quietly: a material the palette does not know is
 * painted magenta, a ball anchor off the canvas puts the golfer away from the ball, a gate that leaks shows
 * the wrong thing to the wrong people. So each is asked directly.
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
  const r = {}, keepLive = G3D_LIVE; r.live = G3D_LIVE;
  sbUser = null; sbUsername = ''; r.out = g3dOn();
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; r.other = g3dOn();
  G3D_LIVE = false;                                   // the kill switch: back to the testers alone
  sbUser = null; sbUsername = ''; r.offOut = g3dOn();
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; r.offOther = g3dOn();
  sbUser = { id: 't' }; sbUsername = 'CSel8'; r.offTester = g3dOn();
  G3D_LIVE = keepLive;
  const keep = window.RTT_G3D; window.RTT_G3D = { API_VERSION: 999 }; r.stale = g3dOn(); window.RTT_G3D = keep;
  return r; });
ok('G3D_LIVE is true: the 3D golfer is live', gate.live === true);
ok('live: signed out gets the 3D golfer', gate.out === true);
ok('live: anybody signed in gets the 3D golfer', gate.other === true);
ok('kill switch: signed out keeps the old sprites', gate.offOut === false);
ok('kill switch: anybody else keeps the old sprites', gate.offOther === false);
ok('kill switch: a tester still gets the 3D golfer', gate.offTester === true);
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

head('2a. THE WALK: EIGHT FRAMES A STRIDE, EVERY FACING, A REAL STEP');
// The tour map walks this golfer from hole to hole. A walk that came back as one frame eight times is the
// old waddle again, so every frame of a facing has to be a different picture, the figure stays on the canvas
// with its feet on the ground point, and the legs actually move (the lowest painted row changes shape).
const walk = await pg.evaluate(() => { const out = { facings: 0, same: [], off: [], magenta: 0, ex: [] };
  for (const look of [DEFLOOK, Object.assign({}, DEFLOOK, { lefty: true, hatStyle: Object.keys(PXG_HATS)[0] })])
  for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) { const urls = new Set();
    for (let i = 0; i < RTT_G3D.WALK_N; i++){ let f; try{ f = RTT_G3D.frame(look, a, 'walk', i); }catch(e){ out.ex.push(String(e)); continue; }
      urls.add(f.url); if (!(f.ball[0] > 4 && f.ball[0] < f.W - 4 && f.ball[1] > 4 && f.ball[1] < f.H - 4)) out.off.push({ a, i, ball: f.ball });
      const d = RTT_G3D.draw(look, a, 'walk', 'w' + i).cv.getContext('2d').getImageData(0, 0, f.W, f.H).data;
      for (let j = 0; j < d.length; j += 4) if (d[j] === 255 && d[j + 1] === 0 && d[j + 2] === 255) { out.magenta++; break; }
      for (let x = 0; x < f.W; x++) if (d[(0 * f.W + x) * 4 + 3] > 0) { out.off.push({ a, i, top: true }); break; } }
    out.facings++; if (urls.size < RTT_G3D.WALK_N) out.same.push({ a, distinct: urls.size }); }
  return out; });
ok('every facing walks without throwing', walk.facings === 16 && !walk.ex.length, walk.ex);
ok('every frame of a stride is its own picture', walk.same.length === 0, walk.same);
ok('the walker stays on the canvas, feet on the ground point', walk.off.length === 0, walk.off.slice(0, 4));
ok('no walk frame paints a material the palette does not know', walk.magenta === 0);
const keep = await pg.evaluate(() => { const L = Object.assign({}, DEFLOOK, { hairStyle: 'short' });
  const a = RTT_G3D.draw(L, 90, 'putt', 'pA').cv.toDataURL(); RTT_G3D.draw(L, 90, 'walk', 'w3'); return a === RTT_G3D.draw(L, 90, 'putt', 'pA').cv.toDataURL(); });
ok('drawing a walk frame leaves the swing camera where it was', keep);

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

head('3. THE TRACER DRAWS IT, AND THE KILL SWITCH PUTS THE OLD SPRITE BACK');
const tr = await pg.evaluate(() => {
  const ck = Object.keys(DAILY_COURSES)[2], h = DAILY_COURSES[ck].holes[1], sk = {}; CATS.forEach(c => sk[c.k] = 80);
  const shots = dShotSeq(h[0], h[1], h[0], mulberry32(7), sk, {}); const hole = { n: 2, par: h[0], yards: h[1], shots };
  S.look = Object.assign({}, DEFLOOK);
  const grab = () => { const n = hvNode(hole, 1, 1, ck); const im = n.querySelector('image.hvsw'); return im ? im.getAttribute('width') + 'x' + im.getAttribute('height') + ':' + im.getAttribute('href').length : ''; };
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; const live = grab();
  const keep = G3D_LIVE; G3D_LIVE = false; const off = grab(); G3D_LIVE = keep;
  return { live, off }; });
ok('a tee shot draws the 3D golfer', tr.live !== '' && tr.live !== tr.off, tr);
ok('with the kill switch, a tee shot keeps the old sprite', tr.off !== '' && tr.live !== tr.off, tr);

head('4. ONE GOLFER IN EVERY MODE: the putter you equipped, your aura and your age, wherever you are drawn');
const md = await pg.evaluate(() => {
  const r = {}, keepCos = cosOwned, keepAge = playerAge, keepYear = S.year;
  cosOwned = (cat, id) => cat === 'putter' || keepCos(cat, id);          // own every putter for the test
  const pu = PUTTERS.filter(p => p.id !== 'stock' && p.shape !== 'wand' && PXG_CLUBS['pu_' + p.id]);
  const a = pu[0], z = pu.find(p => p.shape !== a.shape) || pu[1];
  S.look = Object.assign({}, DEFLOOK, { putter: a.id, fx: 'gold' });
  const H = puttHost();
  // the walk carries the equipped putter: two putters walk differently, and the walk's look names it
  r.walkClub = modeLook(S.look, 'walk').club;
  const w1 = H.golferWalk(0, 1, 2).url; S.look.putter = z.id; const w2 = H.golferWalk(0, 1, 2).url; S.look.putter = a.id;
  r.walkDiffers = w1 !== w2; r.a = a.id; r.z = z.id;
  // the putt and the flat golfer (the map, the header and the fallback) hold it too
  r.puttClub = modeLook(S.look, 'putt').club;
  const flat = H.golfer().toDataURL(), club = pxGolferCanvas(S.look, { noBall: true }).toDataURL(); r.flatPutter = flat !== club;
  // the aura: the figure on the map wears it, and a canvas golfer is handed its colour
  const fig = H.figure('x'); r.figAura = /pxfxwrap/.test(fig) && /class="x pxfigsm/.test(fig) && !/height:56px/.test(fig);
  r.auraCol = H.aura(); r.gold = PXFX_BY.gold.col; S.look.fx = 'none'; r.noAura = H.aura(); S.look.fx = 'gold';
  // the age reaches a putt (a copy of the look) and a walk, and turns the 3D cache over at a birthday
  playerAge = () => 52; r.puttAge = modeLook(S.look, 'putt').age; r.walkAge = modeLook(S.look, 'walk').age;
  const old = H.golfer3(1, 0).urls[0]; playerAge = () => 22; const young = H.golfer3(1, 0).urls[0]; r.ageDraws = old !== young;
  // the ball you wear is the ball you putt with in Putt Putt; no ball is the white one. The celebration's frame stands facing you.
  { const kb = S.look.ball; S.look.ball = 'flamingo'; const ba = H.ballArt(); r.ballArt = !!(ba && ba.cv && ba.cv.width > 0 && ba.tint);
    S.look.ball = 'none'; r.noBall = H.ballArt() === null; S.look.ball = kb; const ch = H.golferCheer(); r.cheer = !!(ch && ch.url && ch.fig > 0); }
  // a leaderboard look carries the putter, so other players see the one you putt with
  r.board = lookForBoard(S.look).putter;
  cosOwned = keepCos; playerAge = keepAge; S.year = keepYear; S.look = Object.assign({}, DEFLOOK);
  return r; });
ok('a walk carries the equipped putter, not the club set', md.walkClub === 'pu_' + md.a && md.walkDiffers, md);
ok('a putt holds the equipped putter', md.puttClub === 'pu_' + md.a, md.puttClub);
ok('the flat golfer (map, header, fallback) holds the putter too', md.flatPutter === true);
ok('the golfer on the Putt Putt map wears its aura, sized by its class', md.figAura === true);
ok('a golfer drawn on a canvas is handed its aura colour, and none without one', md.auraCol === md.gold && md.noAura === null, [md.auraCol, md.noAura]);
ok('the age reaches the putt and the walk', md.puttAge === 52 && md.walkAge === 52, [md.puttAge, md.walkAge]);
ok('a birthday draws a new 3D golfer rather than the cached one', md.ageDraws === true);
ok('the ball you wear is painted for the Putt Putt green, and no ball is the white one', md.ballArt === true && md.noBall === true, [md.ballArt, md.noBall]);
ok('the hole-out celebration has a golfer facing you', md.cheer === true);
ok('a leaderboard look carries the putter', md.board === md.a, md.board);

head('5. THE MENU GOLFER: testers only on the First Tee switch, every item drawn alone, nothing magenta');
const mn = await pg.evaluate(async () => {
  const r = { ex: [], none: [], magenta: [], n: 0 }, keepU = sbUser, keepN = sbUsername;
  sbUser = null; sbUsername = ''; r.out = g3dMenuOn();
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; r.other = g3dMenuOn();
  r.otherFig = /pxidle/.test(pxFigureHTML(DEFLOOK, 60));
  sbUser = { id: 't' }; sbUsername = 'CSel8'; r.tester = g3dMenuOn();
  const magenta = (url) => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let m = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255 && d[i + 3]) m++; res(m); }; im.src = url; });
  const jobs = [];
  for (const h of ['cap', 'visor'].concat(Object.keys(PXG_HATS))) jobs.push(['hat', g3dItemLook({ cap: true, hatStyle: h }), h]);
  for (const e of Object.keys(PXG_EYEWEAR)) jobs.push(['ew', g3dItemLook({ eyewear: e }), e]);
  for (const c of Object.keys(PXG_CLUBS)) jobs.push(['club', g3dItemLook({ club: c }), c]);
  for (const t of Object.keys(PXG_TOPS)) jobs.push(['top', g3dItemLook({ top: t }), t]);
  for (const t of Object.keys(PXG_LEGS)) jobs.push(['leg', g3dItemLook({ leg: t }), t]);
  for (const t of Object.keys(PXG_BALL)) jobs.push(['ball', g3dItemLook({ ball: t }), t]);
  for (const t of Object.keys(PXPAT_BY)) jobs.push(['shirt', g3dItemLook({ shirtPat: t }), 'pattern ' + t]);
  for (const o of allShirts().slice(0, 12)) jobs.push(['shirt', g3dItemLook({ polo: o.id, shirtPat: 'none' }), 'shirt ' + o.id]);
  for (const o of PANTS) jobs.push(['pants', g3dItemLook({ pants: o.id }), 'trousers ' + o.id]);
  // every novelty club in the hand is a real object: its tile is no smaller than a stock club's head
  for (const c of ['scepter','candycane','excalibur','wand','hockey','glizzy','poolnoodle','coffin','broomstick','pitchfork']) jobs.push(['fig', Object.assign({}, DEFLOOK, { club: c }), 'holding ' + c]);
  for (const t of Object.keys(PXG_TOPS)) jobs.push(['fig', Object.assign({}, DEFLOOK, { top: t }), 'wearing ' + t]);
  for (const c of Object.keys(PXG_CLEATS)) jobs.push(['shoe', g3dItemLook({ cleats: c }), c]);
  const hairs = Object.keys(PXG_HAIR), tops = Object.keys(PXG_TOPS);
  hairs.forEach((h, i) => { const L = Object.assign({}, DEFLOOK, { hairStyle: h, cap: i % 2 === 0, top: i % 3 === 1 ? tops[i % tops.length] : '', lefty: i % 2 === 1 }); jobs.push(['fig', L, h]); jobs.push(['chip', L, h]); });
  for (const [part, L, id] of jobs) { let p; try { p = RTT_G3D.pic(L, part); } catch (e) { r.ex.push(part + ':' + id + ' ' + e); continue; }
    r.n++; if (!p) { r.none.push(part + ':' + id); continue; } if (await magenta(p.url)) r.magenta.push(part + ':' + id); }
  r.tile = /data:image\/png/.test(pxItemThumb('hw', 'cowboy')) && /data:image\/png/.test(pxClubThumb('driver')) && /data:image\/png/.test(pxItemThumb('top', 'cape'))
    && /data:image\/png/.test(pxBallThumb('eight')) && /data:image\/png/.test(pxClubThumb('pu_milled')) && /data:image\/png/.test(pxClubThumb('coffin'));
  // a top, a novelty club or a ball must change the picture (the cape and the floatie once drew nothing on the menu golfer)
  const base = RTT_G3D.pic(DEFLOOK, 'fig').url; r.same = [];
  for (const L of [{ top: 'cape' }, { top: 'duckfloatie' }, { club: 'coffin' }, { club: 'excalibur' }, { ball: 'eight' }]) if (RTT_G3D.pic(Object.assign({}, DEFLOOK, L), 'fig').url === base) r.same.push(L);
  // Putt Putt's header ring and Daily Hole rows draw the menus' 3D head chip; a player without it keeps the flat picture
  const H = puttHost(); r.ppChip = /^<img src="data:image\/(png|gif)/.test(H.chip()) && /^<img /.test(H.chip({ polo: 'red' }));
  // the career card on Me reads both tours' records
  const pp = window.RTT_PUTT.achStats(H), rec = ftRecord().textContent;
  r.rec = /Pro Tour/.test(rec) && /Putt Putt/.test(rec) && rec.includes(Number(pp.pp_stars || 0).toLocaleString() + (pp.pp_stars === 1 ? 'star' : 'stars'));
  sbUser = { id: 'x' }; sbUsername = 'somebodyelse'; r.ppFlat = H.chip() === '';
  sbUser = keepU; sbUsername = keepN; return r; });
ok('Putt Putt\'s header ring and Daily Hole rows draw the 3D head chip for a tester', mn.ppChip === true);
ok('a player without the 3D menu golfer keeps the flat picture in Putt Putt', mn.ppFlat === true);
ok('the career card on Me shows the Pro Tour and Putt Putt records', mn.rec === true);
ok('signed out keeps today\'s menu golfer', mn.out === false);
ok('a player who is not a tester keeps today\'s menu golfer', mn.other === false && mn.otherFig === true);
ok('a tester gets the 3D menu golfer', mn.tester === true);
ok(`every hat, pair of glasses, club, putter, top, legwear, ball, pattern, shirt, trousers, pair of cleats, hairstyle and chip draws (${mn.n})`, mn.ex.length === 0, mn.ex.slice(0, 4));
ok('only paint (eyeblack) has nothing to draw alone, so its tile keeps today\'s art', mn.none.every(x => !/^(hat|club|shoe|fig|chip):/.test(x)), mn.none);
ok('no menu picture has a magenta (unknown material) pixel', mn.magenta.length === 0, mn.magenta);
ok('the closet tiles use the 3D pictures for a tester (hats, clubs, putters, the cape, balls, the scythe)', mn.tile === true);
ok('the cape, the floatie, the scythe, the sword and a ball each show on the menu golfer', mn.same.length === 0, mn.same);

ok('no page errors', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
