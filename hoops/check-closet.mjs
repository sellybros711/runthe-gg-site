/* The closet: the player's half of the wardrobe, and the screen that wears it.
 *
 *   node hoops/check-closet.mjs            the record, the merge, then the page on a phone
 *   node hoops/check-closet.mjs --quick    without the browser
 *
 * What it holds:
 *   1. the starters are his without a grant, and an item becomes his only
 *      through grant()
 *   2. nothing he does not own is ever saved or drawn: equip() refuses it,
 *      an outfit drops it, resolve() falls back from it
 *   3. a loadout only takes pieces for its own look and its own slot
 *   4. two devices merge without losing anything: owned is a union, a look is
 *      the later choice, and a deleted outfit stays deleted
 *   5. the merge is order free and idempotent, and the progress the shelf
 *      compares never goes backwards across one
 *   6. the shelf has the two slots, and hands their merges to the record
 *   7. the page: the Look sheet has the closet, a press on an owned piece
 *      wears it and keeps it, a press on another tries it on and keeps
 *      nothing, an outfit saves, the career's figure wears what was chosen,
 *      and nothing on a phone runs off the side
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pageSource } from './build/page-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const QUICK = process.argv.includes('--quick');

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* a localStorage for node, and a fresh module for each device */
const store = () => ({ _: {}, getItem(k){ return k in this._ ? this._[k] : null; }, setItem(k, v){ this._[k] = String(v); }, removeItem(k){ delete this._[k]; } });
global.localStorage = store();
const W = require('./wardrobe.js'), CAT = require('./catalog.js');
const device = () => { global.localStorage = store(); W._reset(); return W; };

/* 1. owning */
{
  device();
  ok(W.owns('st_tee_white') && W.owns('st_sneaker_black') && W.owns('st_band_white'), '1 the starter wardrobe is his with no grant');
  ok(!W.owns('hoodie_black'), '1 nothing else is his until it is granted');
  ok(W.grant('hoodie_black') && W.owns('hoodie_black'), '1 a grant makes it his');
  ok(!W.grant('hoodie_black'), '1 a second grant of the same piece is nothing');
  ok(!W.grant('no_such_item'), '1 a piece the catalogue does not have cannot be granted');
  W._reset();
  ok(W.owns('hoodie_black'), '1 what he owns is kept on the device (rtf.ward.v1)');
}

/* 2 and 3. wearing */
{
  device();
  ok(!W.equip('street', 'top', 'hoodie_gilded') && !W.equip('street', 'outer', 'varsity_navy'), '2 a piece he does not own cannot be put on');
  ok(W.equip('street', 'top', 'st_hoodie_navy'), '2 a starter can be put on');
  ok(W.loadout('street').top === 'st_hoodie_navy', '2 and it is what he is wearing');
  W.grant('jeans_raw');
  ok(!W.equip('street', 'top', 'jeans_raw'), '3 a piece cannot go in the wrong slot');
  ok(!W.equip('court', 'goggles', 'shades_night'), '3 a street piece cannot go on court');
  W.grant('goggles_specs');
  ok(!W.equip('street', 'goggles', 'goggles_specs') && W.equip('court', 'goggles', 'goggles_specs'), '3 court gear goes on court and not on the street');
  ok(W.equip('court', 'shoes', 'st_sneaker_black') && W.equip('street', 'shoes', 'st_sneaker_black'), '3 a floor shoe is worn in both looks');
  const lo = W.wearSet('street', { top: 'varsity_navy', bottom: 'jeans_raw', hat: 'cap_navy' });
  ok(!lo.top && !lo.hat && lo.bottom === 'jeans_raw', '2 an outfit keeps only the pieces he owns');
  /* a forged loadout on the device is never drawn */
  const raw = JSON.parse(localStorage.getItem(W.KEY));
  raw.w.street.top = 'hoodie_gilded';
  localStorage.setItem(W.KEY, JSON.stringify(raw)); W._reset();
  ok(W.resolved('street').top.k === 'tee', '2 a loadout naming a piece he does not own draws the starter instead');
  ok(W.resolved('street', null, true).top.k === 'hoodie', '2 a try-on draws it, and only a try-on');
  const d = W.dress({ c1: '#000' }, 'street');
  ok(d.ctx === 'street' && d.wear && !d.cwear, '2 dress() puts him in the street look');
  ok(W.dress({}, 'court').cwear && W.dress({}, 'court').cwear.goggles, '2 dress() puts his court gear on him');
  ok(W.equip('court', 'goggles', null) && !W.loadout('court').goggles, '2 a slot can be taken off');
}

/* 4 and 5. two devices */
{
  const A0 = device(); A0.grant('hoodie_black'); A0.equip('street', 'top', 'hoodie_black');
  const fitA = A0.saveFit('Game day', 'street');
  const a = JSON.parse(localStorage.getItem(W.KEY));
  device(); W.grant('cap_navy');
  /* B changes its look a moment later */
  const t0 = Date.now(); while (Date.now() === t0) {}
  W.equip('street', 'hat', 'cap_navy');
  const b = JSON.parse(localStorage.getItem(W.KEY));
  const m = W.merge(a, b), n = W.merge(b, a);
  ok(m.own.hoodie_black && m.own.cap_navy, '4 a piece owned on either device is owned after the merge');
  ok(m.w.street.hat === 'cap_navy' && !m.w.street.top, '4 a look is the later choice, whole');
  ok(m.fits[fitA] && !m.fits[fitA].del, '4 an outfit made on one device survives the merge');
  ok(same(m, n), '5 the merge is order free');
  ok(same(W.merge(m, m), m) && same(W.merge(m, a), m), '5 the merge is idempotent');
  ok(W.progress(m) >= Math.max(W.progress(a), W.progress(b)), '5 the progress never goes backwards across a merge');
  /* delete the outfit on a copy of the merge: a stale device must not bring it back */
  global.localStorage = store(); localStorage.setItem(W.KEY, JSON.stringify(m)); W._reset();
  while (Date.now() === t0) {}
  W.delFit(fitA);
  const del = JSON.parse(localStorage.getItem(W.KEY));
  ok(!W.merge(del, a).fits[fitA] || W.merge(del, a).fits[fitA].del, '4 a deleted outfit stays deleted against a stale copy');
  ok(W.fits(W.merge(a, del)).every((f) => f.id !== fitA), '4 in either order');
  ok(W.progress(del) >= W.progress(m), '5 deleting an outfit does not move the progress back');
  /* a merge of junk is a clean record */
  ok(same(W.clean({ own: { nope: 1 }, w: { street: { top: 'nope' } }, fits: { x: { ctx: 'moon' } } }), W.fresh()), '4 anything the catalogue does not know is dropped on the way in');
}

/* 6. the shelf */
{
  const cloud = fs.readFileSync(new URL('./cloud.js', import.meta.url), 'utf8');
  global.window = { RTF_WARD: W, RTF_ECON: require('./economy.js') };
  delete require.cache[require.resolve('./cloud.js')];
  const CL = require('./cloud.js');
  const CLm = CL.MODE_KEYS ? CL : global.window.RTF_CLOUD;
  ok(CLm && CLm.MODE_KEYS['rtf.ward.v1'] === 'ward' && CLm.MODE_KEYS['rtf.wallet.v1'] === 'wallet', '6 the closet and the coins are slots on the account');
  ok(CLm.modeKind('ward') === 'merge' && CLm.modeKind('wallet') === 'merge', '6 both are merged, never last-write-wins');
  const a = { v: 1, own: { hoodie_black: 5 }, w: { street: {}, court: {}, ts: 0, tc: 0 }, fits: {} }, b = { v: 1, own: { cap_navy: 6 }, w: { street: {}, court: {}, ts: 0, tc: 0 }, fits: {} };
  const mm = CLm.modeMerge('ward', a, b);
  ok(mm && mm.own.hoodie_black && mm.own.cap_navy, '6 the shelf merges the closet with the record\'s own merge');
  const X = require('./economy.js'), wa = X.fresh(), wb = X.fresh();
  X.award(wa, 'k1', 100, 'x', { t: 1 }); X.award(wb, 'k2', 50, 'x', { t: 2 });
  ok(X.balance(CLm.modeMerge('wallet', wa, wb)) === 150, '6 the shelf merges the coins with the ledger\'s own merge');
  ok(CLm.modeProgress('wallet', { v: CLm.modeMerge('wallet', wa, wb) }) >= CLm.modeProgress('wallet', { v: wa }), '6 the coins\' progress only grows');
  ok(CLm.API_VERSION === 6 && /NEED_CLOUD = 6/.test(pageSource()), '6 the page pins the shelf it knows the slots of');
  ok(/RTF_WARD\.reload\(\)/.test(fs.readFileSync(new URL('./modes-ui.js', import.meta.url), 'utf8')), '6 a copy pulled from the shelf is read again by the closet');
  delete global.window;
}

/* 7. the page */
async function browser(){
  const pw = (() => { try { return require('playwright'); } catch (e) { return createRequire('/opt/node22/lib/node_modules/')('playwright'); } })();
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.woff2': 'font/woff2' };
  async function serve(route){
    const u = new URL(route.request().url());
    if (u.hostname !== 'local.test') return route.abort();
    if (u.pathname.startsWith('/sb/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"not stood in"}' });
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.abort();
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  const b = await pw.chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
  ok(await page.evaluate(() => !!(window.RTF_WARD && window.RTF_CATALOG && window.RTF_CLOSET && window.RTF_WALLET)), '7 the closet\'s modules load on the page');
  /* a career, the quickest way in */
  await page.locator('#ch-title').click();
  await page.waitForSelector('#cr-go', { timeout: 10000 });
  await page.click('[data-bstep="start"]').catch(() => {});
  await page.click('#cr-go');
  await page.waitForSelector('#cr-lookbtn', { timeout: 20000 });
  const figBefore = await page.evaluate(() => { const i = document.querySelector('#s-car img.rtf-baller, #s-car canvas'); return i ? (i.src || i.toDataURL()) : ''; });
  await page.click('#cr-lookbtn');
  await page.waitForSelector('[data-ltab="street"]', { timeout: 10000 });
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-ltab]')].map((b) => b.textContent).join('|')) === 'Body|Off court|On court|Shop', '7 the Look sheet has Body, Off court, On court and the Shop');
  await page.click('[data-ltab="street"]');
  await page.waitForSelector('#cr-closet .cl-tile');
  const m = await page.evaluate(() => {
    const sheet = document.querySelector('#cr-sheet'), tiles = [...document.querySelectorAll('#cr-closet .cl-tile')];
    const wide = [...sheet.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !el.closest('.cl-slots'); });
    return { tiles: tiles.length, lowest: Math.min(...tiles.map((t) => t.getBoundingClientRect().height)), wide: wide.map((e) => e.className).slice(0, 3), slots: document.querySelectorAll('#cr-closet .cl-slot').length };
  });
  ok(m.slots === 15, '7 off court lists the twelve street slots, the idle, the nameplate and the card backdrop (' + m.slots + ')');
  ok(m.tiles > 10, '7 the Top slot lists its pieces (' + m.tiles + ')');
  ok(m.lowest >= 44, '7 every tile is a thumb tall (' + m.lowest + 'px)');
  ok(!m.wide.length, '7 nothing in the closet runs off a 375px phone (' + m.wide.join(', ') + ')');
  /* an owned piece: the starter hoodie */
  const fig0 = await page.evaluate(() => document.querySelector('#cr-closet .cl-fig img').src);
  await page.click('#cr-closet .cl-tile[data-id="st_hoodie_navy"]');
  const worn = await page.evaluate(() => ({ lo: JSON.parse(localStorage.getItem('rtf.ward.v1') || '{}'), fig: document.querySelector('#cr-closet .cl-fig img').src, on: !!document.querySelector('#cr-closet .cl-tile[data-id="st_hoodie_navy"].is-on') }));
  ok(worn.lo.w && worn.lo.w.street.top === 'st_hoodie_navy', '7 a press on a piece he owns wears it and keeps it');
  ok(worn.fig !== fig0 && worn.on, '7 and the figure and the tile show it');
  /* a piece he does not own: tried on, kept nowhere */
  await page.click('#cr-closet .cl-tile[data-id="varsity_navy"]').catch(() => {});
  await page.click('#cr-closet [data-slot="outer"]');
  await page.click('#cr-closet .cl-tile[data-id="varsity_navy"]');
  const tr = await page.evaluate(() => ({ lo: JSON.parse(localStorage.getItem('rtf.ward.v1')), trying: !!document.querySelector('#cr-closet .cl-try'), price: document.querySelector('#cr-closet .cl-tile[data-id="varsity_navy"] .cl-p').textContent }));
  ok(tr.trying && !tr.lo.w.street.outer, '7 a press on a piece he does not own tries it on and keeps nothing');
  ok(/In packs/.test(tr.price) && !/\dK|\d,\d/.test(tr.price), '7 and its tile says it comes from a pack, never a price (' + tr.price + ')');
  ok(await page.evaluate(() => { const p = document.querySelector('#cr-closet .cl-try .cl-pk'); return !!p && /1 in \d/.test(p.textContent) && !document.querySelector('#cr-closet .cl-buy'); }), '7 the try-on names a pack and its odds, and offers no Buy');
  ok(await page.evaluate(() => /Go 1st overall/.test(document.querySelector('#cr-closet .cl-tile[data-id="ex_draft_blazer"] .cl-p').textContent)), '7 an exclusive says how it is earned, never a price');
  await page.click('#cr-closet .cl-back');
  ok(await page.evaluate(() => !document.querySelector('#cr-closet .cl-try')), '7 Back to my fit takes it off');
  /* the coin history: nothing for a guest, then what a signed in award paid */
  ok(await page.evaluate(() => !document.querySelector('#cr-closet .cl-hist')), '7 a wallet with no coins shows no history');
  await page.evaluate(() => { const st = RTF_AUTH.state; RTF_AUTH.state = () => Object.assign({}, st(), { signedIn: true }); RTF_EARN.run({ madePlayoffs: true, seriesWon: 1, champion: false }, { seed: 4242 }); });
  await page.waitForSelector('#cr-closet .cl-hist');
  const hist = await page.evaluate(() => ({ lines: [...document.querySelectorAll('#cr-closet .cl-hist li')].map((l) => l.textContent), coins: document.querySelector('#cr-closet .cl-coins b').textContent, want: String(RTF_ECON.runCoins({ madePlayoffs: true, seriesWon: 1 })) }));
  /* The run is not the only thing that pays on this press: the daily loop's
     coin quest settles in the same tick and pays its own line. So the run's
     line carries the run's award, and the balance is every line it shows. */
  const runLine = hist.lines.find((l) => /^Draft run/.test(l)) || '';
  const shown = hist.lines.reduce((s, l) => s + (+((l.match(/\+(\d+)$/) || [])[1] || 0)), 0);
  ok(runLine.endsWith('+' + hist.want) && +hist.coins.replace(/,/g, '') === shown, '7 an award lands in the coin history and the balance at once (' + hist.lines.join(' | ') + ', ' + hist.coins + ')');
  /* Every coin source has a name in the history. The sources are read off
     every award and daily grant in the game's files, so a new one is caught
     the day it is added; a line that says only "Coins" is one nobody named. */
  const SRCS = new Set();
  for (const f of fs.readdirSync(HERE).filter((x) => /\.js$/.test(x))) {
    const t = fs.readFileSync(path.join(HERE, f), 'utf8');
    for (const re of [/X\.award\([^;]*?'([a-z]+)'\s*,\s*\{\s*t:/g, /X\.award\([^;]*?,\s*'([a-z]+)'\)/g, /grant\(st, w, [^;]*?'([a-z]+)', t\)/g])
      for (const m of t.matchAll(re)) SRCS.add(m[1]);
  }
  ok(SRCS.size >= 8, '7 the coin sources are found in the game files (' + [...SRCS].join(', ') + ')');
  const unnamed = await page.evaluate((srcs) => {
    srcs.forEach((s, i) => RTF_WALLET.award((s === 'quest' ? 'qd:' : 'lbl:') + s + ':' + i, 1, s));
    return [...document.querySelectorAll('#cr-closet .cl-hist li span')].map((x) => x.textContent).filter((x) => x === 'Coins');
  }, [...SRCS]);
  ok(!unnamed.length, '7 every coin source has a name in the history (' + unnamed.length + ' read "Coins")');
  await page.click('#cr-closet .cl-savefit');
  ok(await page.evaluate(() => document.querySelectorAll('#cr-closet [data-fit]').length === 1), '7 an outfit saves');
  /* on court */
  await page.click('[data-ltab="court"]');
  await page.waitForSelector('#cr-closet [data-slot="band"]');
  ok(await page.evaluate(() => document.querySelectorAll('#cr-closet .cl-slot').length === 14), '7 on court lists the thirteen court slots and the idle');
  await page.click('#cr-closet .cl-tile[data-id="st_band_white"]');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rtf.ward.v1')).w.court.band === 'st_band_white'), '7 a court piece goes on and stays');
  await page.click('#cr-sheet-x');
  await page.waitForTimeout(300);
  const figAfter = await page.evaluate(() => { const i = document.querySelector('#s-car img.rtf-baller, #s-car canvas'); return i ? (i.src || i.toDataURL()) : ''; });
  ok(figAfter && figAfter !== figBefore, '7 the career\'s figure wears what was chosen');
  ok(!boom.length, '7 nothing threw (' + boom.join(' | ') + ')');
  await b.close();
}

/* scenes: the rule for where he is in his own clothes is the scene file's */
{
  const sc = fs.readFileSync(new URL('./scenes.js', import.meta.url), 'utf8');
  ok(/STREET_ROOMS = \{ home: 1, hotel: 1, office: 1, press: 1 \}/.test(sc), '8 off the floor (home, hotel, front office, podium) he is in his own clothes');
  ok(/pose === 'suit' \|\| pose === 'cap' \? 'suit'/.test(sc), '8 a suit or the draft cap is the scene\'s call and stays');
  const ct = fs.readFileSync(new URL('./court.js', import.meta.url), 'utf8');
  ok(/cwear: who\.faceless \? null : who\.cwear/.test(ct) && /who\.faceless \? null : who\.cwear \|\| null\]\)/.test(ct), '8 the court player draws his gear, keys it, and never on a real man');
}

if (!QUICK) await browser();
console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
