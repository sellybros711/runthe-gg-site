/* Auras: every one is drawn, drawn the same everywhere, and never flashes on a re-render.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-auras.mjs
 *
 * The old aura pulsed a filter ON the golfer img. render() rebuilds #app, so every refresh (a board loading,
 * a name lookup, a record cycling) made a new img and restarted the pulse from frame zero: the brightness
 * snapped, which is the quick flash players reported. This holds the rebuild to the rules:
 *   CATALOG    every aura has a style, real particle shapes, and a ring when it is legendary
 *   LAYERS     the halo, ring and particles are their own layers; the sprite itself never animates
 *   PHASE      a rebuilt aura is at the same moment as one that was never rebuilt
 *   VISIBLE    the halo reaches past the golfer in a box he fills (the closet), not just a square one
 *   ROWS       a leaderboard row's head chip wears the aura, still
 *   THUMBS     an aura's thumbnail keeps its picture in a holder that strips backgrounds
 *   CALM       reduced motion stops every aura layer
 */
import { chromium } from 'playwright';

const HOST = process.env.HOST || 'http://localhost:8099';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 240) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const browser = await chromium.launch();
async function open(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 430, height: 900 } }, opts));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/'); await page.waitForTimeout(1200);
  return { page, errs, ctx };
}
const BOARD = (fx) => {
  const rows = fx.map((f, i) => ({ rank: i + 1, display_name: 'P ' + f, golfer_name: 'G ' + f, user_id: 'u' + i, earnings: 5e6 - i * 1e5,
    look: Object.assign({}, DEFLOOK, { fx: f }) }));
  lbCache['season:earnings'] = { rows, ok: true, t: Date.now() };
  S.overlay = 'leaderboard'; S.lbTab = 'season'; S.lbSort = 'earnings'; render();
};

const { page, errs } = await open();

head('CATALOG');
const cat = await page.evaluate(() => PXFX.map(f => { const a = PXFX_PARTS[f.id];
  return { id: f.id, styled: !!a, shape: !a || !a.p || !!AURA_SHAPE[a.p.s], legend: f.price >= 30000 || f.id === 'wisp' || f.id === 'passcrown' /* the two pass capstones */, ring: !!(a && a.ring), parts: !!(a && a.p), rare: f.price > 0 && f.price <= 12000 }; }));
ok('every aura has a style', cat.every(c => c.styled), cat.filter(c => !c.styled).map(c => c.id));
ok('every particle is a drawn shape', cat.every(c => c.shape), cat.filter(c => !c.shape).map(c => c.id));
ok('every legendary has a ground ring', cat.every(c => !c.legend || c.ring), cat.filter(c => c.legend && !c.ring).map(c => c.id));
ok('every aura above the entry tier has particles', cat.every(c => c.rare || c.parts), cat.filter(c => !c.rare && !c.parts).map(c => c.id));

head('LAYERS');
const lay = await page.evaluate(() => PXFX.map(f => { const d = document.createElement('div'); d.innerHTML = pxFigureHTML(Object.assign({}, DEFLOOK, { fx: f.id }), 90);
  document.body.appendChild(d); const img = d.querySelector('img'), a = PXFX_PARTS[f.id] || {};
  const r = { id: f.id, halo: !!d.querySelector('.au-halo'), ring: !!d.querySelector('.au-ring') === !!a.ring,
    parts: d.querySelectorAll('.aup').length === ((a.p && a.p.n) || 0), svg: [...d.querySelectorAll('.aup')].every(i => i.querySelector('svg') && !i.textContent.trim()),
    still: getComputedStyle(img).animationName === 'none' };
  d.remove(); return r; }));
ok('every aura draws a halo', lay.every(l => l.halo), lay.filter(l => !l.halo).map(l => l.id));
ok('a ring exactly where the style asks for one', lay.every(l => l.ring), lay.filter(l => !l.ring).map(l => l.id));
ok('the particle count is the style\'s', lay.every(l => l.parts), lay.filter(l => !l.parts).map(l => l.id));
ok('particles are SVG shapes, never font glyphs', lay.every(l => l.svg), lay.filter(l => !l.svg).map(l => l.id));
ok('the golfer sprite itself never animates', lay.every(l => l.still), lay.filter(l => !l.still).map(l => l.id));
const plain = await page.evaluate(() => { const h = pxFigureHTML(DEFLOOK, 60); return !/au-halo|aura/.test(h); });
ok('a golfer with no aura gets none of it', plain);

head('PHASE');
// an untouched reference aura beside a board that is rebuilt again and again: at every rebuild the board's
// halos must read what the reference reads, which is the whole of "it does not flash"
const ph = await page.evaluate(async (BOARDsrc) => {
  eval('(' + BOARDsrc + ')')(['gold', 'inferno', 'electric']);
  await new Promise(r => setTimeout(r, 900));
  const ref = document.createElement('div'); ref.style.cssText = 'position:fixed;left:0;top:0;opacity:.01;pointer-events:none';
  ref.innerHTML = ['gold', 'inferno', 'electric'].map(f => pxFigureHTML(Object.assign({}, DEFLOOK, { fx: f }), 60)).join('');
  document.body.appendChild(ref);
  const worst = []; let rebuilt = 0;
  for (let k = 0; k < 12; k++) {
    await new Promise(r => setTimeout(r, 70 + k * 53));
    const before = document.querySelector('.lbpod .au-halo');
    render(); await new Promise(r => requestAnimationFrame(r));
    if (document.querySelector('.lbpod .au-halo') !== before) rebuilt++;
    const rh = ref.querySelectorAll('.au-halo');
    const d = ['gold', 'inferno', 'electric'].map((f, i) => { const h = document.querySelector('.lbpod .au-' + f + ' .au-halo');
      return h ? Math.abs(+getComputedStyle(h).opacity - +getComputedStyle(rh[i]).opacity) : 9; });
    worst.push(Math.max(...d)); }
  ref.remove();
  return { rebuilt, worst: Math.max(...worst).toFixed(3) };
}, BOARD.toString());
ok('the board really was rebuilt each time (not a vacuous pass)', ph.rebuilt === 12, ph);
ok('a rebuilt halo is at the same moment as an untouched one', +ph.worst < 0.02, ph);

head('VISIBLE');
const vis = await page.evaluate(async () => { const s = coinState(); s.owned['fx:inferno'] = 1; coinSave(s);
  S.overlay = null; S.look.fx = 'inferno'; S.screen = 'setup'; S.setupCat = 'fx'; render(); await new Promise(r => setTimeout(r, 700));
  const fig = document.querySelector('.shop-preview .avatarfig'); if (!fig) return { none: true };
  const img = fig.querySelector('img'), h = fig.querySelector('.au-halo');
  const box = img.getBoundingClientRect(), nat = img.naturalWidth / img.naturalHeight;
  const drawnW = Math.min(box.width, box.height * nat), hw = h.getBoundingClientRect().width;
  return { drawnW: Math.round(drawnW), halo: Math.round(hw) }; });
ok('in the closet the halo is wider than the golfer it surrounds', !vis.none && vis.halo > vis.drawnW * 1.15, vis);

head('ROWS');
const rows = await page.evaluate(async (BOARDsrc) => { eval('(' + BOARDsrc + ')')(['gold', 'inferno', 'electric', 'prism', 'wisp']);
  await new Promise(r => setTimeout(r, 500));
  const ch = [...document.querySelectorAll('.ov .lb .pxchip')];
  return { chips: ch.length, aura: ch.filter(c => c.classList.contains('au-chip')).length, still: ch.every(c => getComputedStyle(c).animationName === 'none') }; }, BOARD.toString());
ok('every listed golfer with an aura wears it on the head chip', rows.chips >= 2 && rows.aura === rows.chips, rows);
ok('and the chip does not animate', rows.still, rows);

head('THUMBS');
const th = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'spk-items';
  d.innerHTML = PXFX.map(f => `<div class="it">${cosThumbHTML('fx', { id: f.id, col: f.col })}</div>`).join(''); document.body.appendChild(d);
  const r = [...d.querySelectorAll('.aurathumb')].map((t, i) => ({ id: PXFX[i].id, halo: getComputedStyle(t.querySelector('.at-halo')).backgroundImage !== 'none',
    marks: t.querySelectorAll('i svg').length, big: [...t.querySelectorAll('i')].every(i => i.getBoundingClientRect().width <= t.getBoundingClientRect().width * 0.3) }));
  d.remove(); return r; });
ok('every aura has a thumbnail', th.length === cat.length, th.length);
ok('the halo survives a holder that strips backgrounds', th.every(t => t.halo), th.filter(t => !t.halo).map(t => t.id));
ok('a particle aura shows three of its particles, at particle size', th.every(t => (PXFX_PARTS_HAS(t.id) ? t.marks === 3 : t.marks === 0) && t.big), th);
function PXFX_PARTS_HAS(id) { const c = cat.find(x => x.id === id); return c && c.parts; }

ok('no page errors', errs.length === 0, errs);

head('CALM');
const calm = await open({ reducedMotion: 'reduce' });
const rm = await calm.page.evaluate(async () => { const d = document.createElement('div');
  d.innerHTML = pxFigureHTML(Object.assign({}, DEFLOOK, { fx: 'inferno' }), 90); document.body.appendChild(d); await new Promise(r => setTimeout(r, 300));
  return { running: d.getAnimations({ subtree: true }).length, parts: getComputedStyle(d.querySelector('.au-parts')).display,
    halo: +getComputedStyle(d.querySelector('.au-halo')).opacity }; });
ok('reduced motion: no aura layer animates', rm.running === 0, rm);
ok('reduced motion: the particles are hidden and the halo stays lit', rm.parts === 'none' && rm.halo > 0.5, rm);

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall aura checks pass');
process.exit(bad ? 1 : 0);
