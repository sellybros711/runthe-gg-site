/* Run The Floor: the player card (hoops/card-ui.js, the card rows in
 * catalog.js, supabase/140_hoops_card.sql).
 *
 *   node hoops/check-card.mjs            the rules, then the page
 *   node hoops/check-card.mjs --quick    the rules only, no browser
 *   SHOT=/tmp/c.png node hoops/check-card.mjs   and screenshots
 *
 *  1. The catalogue: every nameplate and backdrop is a street piece in its
 *     own slot, with hex colours, sold or free like any piece.
 *  2. Not clothes: resolve() never hands an idle, a nameplate or a backdrop
 *     to baller.js, so nothing about how the man is drawn moves.
 *  3. The loadout on the profile: what the page sends fits 140's slot lists,
 *     and against a database still on 139 (which refuses a loadout naming an
 *     idle or a card piece) it is sent again with only the clothes.
 *  4. The player on the profile: what the page publishes passes 140's shape
 *     (mirrored here) for every look the builder can make, and a name the
 *     Career board would refuse is never sent.
 *  5. The page: no card door and no card before there is a player; then the
 *     door, the card in his loadout, the flip, the rank frame, and a card that
 *     fits a 360 by 640 phone with its buttons.
 *  6. Every design draws: each backdrop and nameplate is its own picture, a
 *     backdrop fills its grid, and a nameplate's name reads on its face.
 *  7. The closet: picking a nameplate or a backdrop shows the card.
 *  8. The boards: a row filed by an account with a player draws him and opens
 *     his card without opening the row; a guest row and a row with no player
 *     keep the jersey; a database without 139 and 140 still answers the
 *     circles, asked narrower.
 *  9. He publishes: signed in, who he is goes to the profile once, and again
 *     only when it changes.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.argv.includes('--quick');
global.window = undefined;
const CAT = require('./catalog.js');
const B = require('./baller.js');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/140_hoops_card.sql'), 'utf8');

let passes = 0, fails = 0;
function ok(c, m){ if (c) { passes++; console.log('  ok ' + m); } else { fails++; console.log('  FAIL ' + m); } }

const PLATES = CAT.ITEMS.filter((i) => i.slot === 'plate'), BGS = CAT.ITEMS.filter((i) => i.slot === 'bg');

/* 1 */
{
  ok(PLATES.length >= 12 && BGS.length >= 12, '1 at least twelve nameplates and twelve backdrops (' + PLATES.length + ', ' + BGS.length + ')');
  ok(PLATES.concat(BGS).every((i) => i.ctx === 'street' && CAT.STREET_SLOTS.indexOf(i.slot) >= 0), '1 every card piece is a street piece in a street slot');
  ok(PLATES.concat(BGS).every((i) => Array.isArray(i.c) && i.c.length === 3 && i.c.every((x) => /^#[0-9a-f]{6}$/i.test(x))), '1 every card piece carries three hex colours');
  ok(PLATES.filter((i) => i.free).length === 1 && BGS.filter((i) => i.free).length === 1, '1 one house nameplate and one house backdrop are free');
  ok(['common', 'rare', 'epic', 'legendary'].every((r) => PLATES.some((i) => i.rarity === r) && BGS.some((i) => i.rarity === r)), '1 card pieces come at every rarity');
  ok(PLATES.concat(BGS).filter((i) => !i.free).every((i) => CAT.sold(i)), '1 every card piece that is not free is sold');
}

/* 2 */
{
  const lo = { top: 'st_hoodie_navy', idle: 'id_flex', plate: 'pl_gold', bg: 'bg_aurora' };
  const r = CAT.resolve(lo, 'street', true);
  ok(r.top && !r.idle && !r.plate && !r.bg, '2 resolve() hands baller.js the hoodie and nothing that is not clothes (' + Object.keys(r).join(',') + ')');
  const plain = CAT.resolve({ top: 'st_hoodie_navy' }, 'street', true);
  ok(JSON.stringify(r) === JSON.stringify(plain), '2 a nameplate and a backdrop change nothing about how the man is drawn');
  ok(CAT.NOWEAR && CAT.NOWEAR.idle && CAT.NOWEAR.plate && CAT.NOWEAR.bg, '2 the three slots are named once, in catalog.js');
}

/* 3: the server's lists, read out of 140 */
const LISTS = {};
for (const m of SQL.matchAll(/rtf_profiles_wear_(street|court)_ck check \(public\.rtf_wear_ok\(wear_\1,\s*array\[([^\]]+)\]/g)) LISTS[m[1]] = m[2].split(',').map((x) => x.trim().replace(/'/g, ''));
{
  ok(LISTS.street && LISTS.court, '3 140 carries both slot lists');
  ok(LISTS.street && CAT.STREET_SLOTS.every((s) => LISTS.street.indexOf(s) >= 0), '3 every street slot the closet keeps is one 140 takes');
  ok(LISTS.court && CAT.COURT_SLOTS.every((s) => LISTS.court.indexOf(s) >= 0), '3 every court slot the closet keeps is one 140 takes');
  const cap = +(/count\(\*\) from jsonb_object_keys\(j\)\) <= (\d+)/.exec(SQL) || [])[1];
  ok(cap >= CAT.STREET_SLOTS.length, '3 140 lets a full street look through (' + cap + ' against ' + CAT.STREET_SLOTS.length + ')');
}

/* 4: 140's player shape, mirrored */
function playerOk(j){
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  const keys = ['look', 'name', 'num', 'pos', 'c1', 'c2', 'rep'];
  if (Object.keys(j).some((k) => keys.indexOf(k) < 0)) return false;
  if ('look' in j) {
    if (!j.look || typeof j.look !== 'object' || Object.keys(j.look).length > 16) return false;
    for (const [k, v] of Object.entries(j.look)) {
      if (!/^[a-z]{1,8}$/.test(k)) return false;
      if (!((typeof v === 'number' && v >= -1 && v <= 400) || (typeof v === 'string' && /^[a-z0-9_]{0,24}$/.test(v)))) return false;
    }
  }
  if ('name' in j && !(typeof j.name === 'string' && /^\p{L}[\p{L} .'-]{0,27}$/u.test(j.name))) return false;
  if ('num' in j && !(Number.isInteger(j.num) && j.num >= 0 && j.num <= 99)) return false;
  if ('pos' in j && !/^(PG|SG|SF|PF|C)$/.test(j.pos)) return false;
  if ('c1' in j && !/^#[0-9a-fA-F]{6}$/.test(j.c1)) return false;
  if ('c2' in j && !/^#[0-9a-fA-F]{6}$/.test(j.c2)) return false;
  if ('rep' in j && !(Number.isInteger(j.rep) && j.rep >= 0 && j.rep <= 19)) return false;
  return true;
}
{
  ok(/'\^\[\[:alpha:\]\]\[\[:alpha:\] \.''-\]\{0,27\}\$'/.test(SQL), '4 140 holds a name to the Career board\'s own rule (130)');
  let all = true, n = 0;
  for (let i = 0; i < 400; i++) {
    const look = B.normal(Object.assign({}, B.lookFor('card' + i), { ht: 66 + (i % 27), wt: 140 + (i * 7) % 220 }));
    const j = { look, name: 'Dre Okafor', num: i % 100, pos: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], c1: '#e8660f', c2: '#1d1f2b', rep: i % 20 };
    if (!playerOk(j)) { all = false; break; }
    n++;
  }
  ok(all && n === 400, '4 every look the builder can make passes 140\'s shape (' + n + ' of 400)');
  ok(!playerOk({ name: 'Big Mike 23' }) && !playerOk({ rep: 20 }) && !playerOk({ bio: 'x' }) && !playerOk({ look: { hair: '<b>' } }), '4 the mirror refuses what 140 refuses');
}

async function browser(){
  const pw = (() => { try { return require('playwright'); } catch (e) { return createRequire('/opt/node22/lib/node_modules/')('playwright'); } })();
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
  const out = [];
  let narrow = false;
  const PROFILE = { user_id: '11111111-1111-1111-1111-111111111111', jersey_club: 'BOS', jersey_num: '33',
    wear_street: { top: 'st_hoodie_navy', plate: 'pl_neon', bg: 'bg_skyline' },
    player: { look: { skin: 2, hair: 'afro', hc: 0, beard: 'full', ht: 82, wt: 240 }, name: 'Mo Tidwell', num: 21, pos: 'C', c1: '#007a33', c2: '#ba9653', rep: 12 } };
  const PLAIN = { user_id: '22222222-2222-2222-2222-222222222222', jersey_club: 'LAL', jersey_num: '8' };
  const ROWS = [
    { id: 1, user_id: PROFILE.user_id, display_name: 'mo', score: 99, player: 'Mo Tidwell', pos: 'C', seasons: 12, pts: 20000, reb: 9000, ast: 2000, rings: 1, created_at: new Date().toISOString() },
    { id: 2, user_id: PLAIN.user_id, display_name: 'kb', score: 90, player: 'Kay Bee', pos: 'SG', seasons: 10, pts: 15000, reb: 3000, ast: 3000, rings: 0, created_at: new Date().toISOString() },
    { id: 3, user_id: null, display_name: null, score: 80, player: 'Guest Guy', pos: 'PG', seasons: 8, pts: 9000, reb: 2000, ast: 4000, rings: 0, created_at: new Date().toISOString() },
  ];
  async function serve(route){
    const u = new URL(route.request().url());
    if (/stripe|checkout/.test(u.pathname)) { out.push(u.pathname); return route.fulfill({ status: 500, body: '{"error":"blocked"}' }); }
    if (u.hostname !== 'local.test') return route.abort();
    if (u.pathname.startsWith('/sb/')) {
      if (/rtf_profiles/.test(u.pathname)) {
        const wide = /wear_street|player/.test(u.search);
        if (narrow && wide) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"column rtf_profiles.player does not exist"}' });
        const strip = (r) => wide ? r : { user_id: r.user_id, jersey_club: r.jersey_club, jersey_num: r.jersey_num };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([strip(PROFILE), strip(PLAIN)]) });
      }
      if (/rtf_careers/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-2/3' }, body: JSON.stringify(ROWS) });
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.abort();
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  const b = await pw.chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(), boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off'); } catch (e) {} window.RTF_BOARD_URL = 'http://local.test/sb'; });
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(300);

  /* 5: no player, no card */
  const none = await page.evaluate(() => ({ door: document.getElementById('b-pcard').hidden, prof: document.getElementById('pf-pcard').hidden, mine: RTF_CARD.mine() }));
  ok(none.door && none.prof && none.mine === null, '5 before there is a player there is no card door and no card');
  await page.evaluate(() => RTF_CARD.openMine());
  ok(await page.evaluate(() => !!document.querySelector('.pc-ov .pc-empty') && !document.querySelector('.pc-ov .pc-card')), '5 asking for a card before there is a player says how to get one, and draws nobody');
  await page.evaluate(() => RTF_CARD.close());
  await page.waitForTimeout(300);

  /* a finished career, and what he wears */
  await page.evaluate(() => {
    localStorage.setItem('rtf.life.v1', JSON.stringify({ cur: null, hof: [{ name: 'Dre Okafor', num: 7, pos: 'SG', look: { skin: 4, hair: 'twists', hc: 0, beard: 'goatee', ht: 77, wt: 205 }, c1: '#1d428a', c2: '#ffc72c', score: 88, awards: [{ k: 'champ', n: 2 }, { k: 'star', n: 6 }, { k: 'mvp', n: 1 }] }] }));
    RTF_CAREER_UI.reload && RTF_CAREER_UI.reload();
    const st = RTF_WARD.load(); ['pl_gold', 'bg_aurora'].forEach((id) => { st.own[id] = 1; }); st.w.street.plate = 'pl_gold'; st.w.street.bg = 'bg_aurora'; RTF_WARD.save(st);
    RTF_CARD.doors();
  });
  ok(await page.evaluate(() => !document.getElementById('b-pcard').hidden), '5 once there is a player the front page shows his card door');
  await page.click('#b-pcard');
  await page.waitForSelector('.pc-ov .pc-card');
  const front = await page.evaluate(() => {
    const c = document.querySelector('.pc-ov .pc-card');
    return { name: c.querySelector('.pc-name').textContent, sub: c.querySelector('.pc-sub').textContent, fig: !!c.querySelector('.pc-fig img, .pc-fig canvas'),
      bg: c.querySelector('.pc-bg').getAttribute('src'), plate: c.querySelector('.pc-plate img').getAttribute('src'), rank: c.querySelector('.pc-rank').textContent,
      metal: [...c.classList].find((x) => /^pc-m-/.test(x)), foil: !!c.querySelector('.pc-foil'), stats: c.querySelector('.pc-back .pc-stats') ? c.querySelector('.pc-back .pc-stats').textContent : '' };
  });
  ok(front.name === 'Dre Okafor' && /#7/.test(front.sub) && /SG/.test(front.sub) && front.fig, '5 the card is him: his name, number, position and figure (' + JSON.stringify([front.name, front.sub]) + ')');
  ok(await page.evaluate((u) => u === RTF_CARD._bgURL(RTF_CATALOG.item('bg_aurora')), front.bg) && await page.evaluate((u) => u === RTF_CARD._plateURL(RTF_CATALOG.item('pl_gold')), front.plate), '5 it wears his backdrop and his nameplate');
  ok(front.foil, '5 a legendary piece carries the foil');
  ok(/Walk-On/.test(front.rank) && front.metal === 'pc-m-wood', '5 the frame and ribbon are his Floor Rep rank (' + front.rank + ', ' + front.metal + ')');
  ok(/2\s*Rings/.test(front.stats) && /88\s*Best legacy/.test(front.stats) && /6\s*All-Star/.test(front.stats), '5 the back counts what the account has done (' + front.stats.replace(/\s+/g, ' ').slice(0, 80) + ')');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-front.png') });
  await page.click('.pc-ov .pc-card');
  ok(await page.evaluate(() => document.querySelector('.pc-ov .pc-card').classList.contains('flip')), '5 a tap flips the card');
  await page.waitForTimeout(600);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-back.png') });
  ok(await page.evaluate(() => [1, 5, 10, 14, 17, 19].map((i) => RTF_CARD.metal(i).k).join(',')) === 'wood,bronze,silver,gold,icon,goat', '5 the five metals and the G.O.A.T. sit on the rank ladder');
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(200);
  const fit = await page.evaluate(() => {
    const c = document.querySelector('.pc-ov .pc-card').getBoundingClientRect(), bs = [...document.querySelectorAll('.pc-ov .pc-acts button')].map((x) => x.getBoundingClientRect());
    return { card: c.right <= innerWidth && c.left >= 0, btns: bs.every((r) => r.bottom <= innerHeight + 1 || document.querySelector('.pc-sheet').scrollHeight > document.querySelector('.pc-sheet').clientHeight) };
  });
  ok(fit.card && fit.btns, '5 on a 360 by 640 phone the card fits across and its buttons are reachable');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Escape');
  /* the card fades out for 220ms: wait on it leaving, never on a clock */
  ok(await page.waitForFunction(() => !document.querySelector('.pc-ov'), null, { timeout: 4000 }).then(() => true).catch(() => false), '5 Escape puts the card away');

  /* 6: every design */
  const art = await page.evaluate(() => {
    const C = RTF_CATALOG, R = RTF_CARD, res = { bgHoles: [], bgSame: [], plSame: [], inkLow: [], bgKnown: [], plKnown: [] };
    const seen = {};
    C.ITEMS.filter((i) => i.slot === 'bg').forEach((i) => {
      if (R.BG_KEYS.indexOf(i.k) < 0) res.bgKnown.push(i.id);
      const g = R._bgGrid(i); const holes = g.px.filter((x) => !x).length; if (holes) res.bgHoles.push(i.id + ':' + holes);
      const key = g.px.join(''); if (seen[key]) res.bgSame.push(seen[key] + '=' + i.id); seen[key] = i.id;
    });
    const seen2 = {};
    const L = (c) => { c = c.replace('#', ''); const n = parseInt(c, 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
    C.ITEMS.filter((i) => i.slot === 'plate').forEach((i) => {
      if (R.PLATE_KEYS.indexOf(i.k) < 0) res.plKnown.push(i.id);
      const g = R._plateGrid(i); const key = g.px.join(''); if (seen2[key]) res.plSame.push(seen2[key] + '=' + i.id); seen2[key] = i.id;
      /* the face: the plate's commonest colour across its middle rows */
      const cnt = {}; for (let y = 4; y < 10; y++) for (let x = 6; x < 58; x++) { const c = g.px[y * 64 + x]; if (c) cnt[c] = (cnt[c] || 0) + 1; }
      const face = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      const ink = R._plateInk(i);
      if (Math.abs(L(ink) - L(face)) < 0.3) res.inkLow.push(i.id + ' ' + ink + '/' + face);
    });
    return res;
  });
  ok(!art.bgKnown.length && !art.plKnown.length, '6 every card piece names a design card-ui.js draws (' + art.bgKnown.concat(art.plKnown).join(', ') + ')');
  ok(!art.bgHoles.length, '6 every backdrop fills its grid (' + art.bgHoles.join(', ') + ')');
  ok(!art.bgSame.length && !art.plSame.length, '6 no two card pieces draw the same picture (' + art.bgSame.concat(art.plSame).join(', ') + ')');
  ok(!art.inkLow.length, '6 every nameplate\'s name reads on its face (' + art.inkLow.join(', ') + ')');

  /* 7: the closet shows the card */
  await page.evaluate(() => { const h = document.createElement('div'); h.id = 'cc-host'; document.body.appendChild(h); RTF_CLOSET.focus('street', 'bg'); RTF_CLOSET.pane(h, { ctx: 'street', look: { skin: 3 }, c1: '#e8660f', c2: '#1d1f2b', num: 7 }); });
  ok(await page.evaluate(() => !!document.querySelector('#cc-host .cl-figcard .pc-card') && !!document.querySelector('#cc-host .cl-slot[data-slot="bg"][aria-pressed="true"]')), '7 picking a backdrop shows the card in the closet');
  await page.evaluate(() => document.querySelector('#cc-host .cl-slot[data-slot="top"]').click());
  ok(await page.evaluate(() => !document.querySelector('#cc-host .cl-figcard') && !!document.querySelector('#cc-host .cl-fig img')), '7 picking a top shows the man again');
  await page.evaluate(() => document.getElementById('cc-host').remove());

  /* 8: the boards */
  async function openCareerBoard(){
    await page.click('#b-home-boards');
    await page.waitForSelector('#bd-tabs .bd-tab[data-k="career"]', { timeout: 8000 });
    await page.evaluate(() => { const t = document.querySelector('#bd-tabs .bd-tab[data-k="career"]'); if (t.getAttribute('aria-selected') !== 'true') t.click(); });
  }
  await openCareerBoard();
  const hasBoard = await page.waitForSelector('#bd-list .bd-crest', { timeout: 8000 }).then(() => true).catch(() => false);
  ok(hasBoard, '8 the Career board draws its rows');
  if (hasBoard) {
    await page.waitForSelector('#bd-list .bd-crest.has-player', { timeout: 8000 }).catch(() => null);
    const rows = await page.evaluate((ids) => {
      const at = (u) => document.querySelector('#bd-list .bd-crest[data-uid="' + u + '"]');
      return { mo: !!(at(ids[0]) && at(ids[0]).querySelector('.pc-bust img')), plain: !!(at(ids[1]) && !at(ids[1]).querySelector('.pc-bust') && at(ids[1]).querySelector('svg')),
        guest: !!document.querySelector('#bd-list .bd-crest.guest svg') && !document.querySelector('#bd-list .bd-crest.guest .pc-bust') };
    }, [PROFILE.user_id, PLAIN.user_id]);
    ok(rows.mo, '8 a row with a player draws him');
    ok(rows.plain && rows.guest, '8 a row with no player, and a guest row, keep the jersey');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-board.png') });
    const before = await page.evaluate(() => document.querySelectorAll('#bd-list .open, #bd-list .bd-open, #bd-list [aria-expanded="true"]').length);
    await page.click('#bd-list .bd-crest.has-player');
    await page.waitForSelector('.pc-ov .pc-card', { timeout: 3000 }).catch(() => null);
    const opened = await page.evaluate(() => ({ card: !!document.querySelector('.pc-ov .pc-card'), name: document.querySelector('.pc-ov .pc-name') ? document.querySelector('.pc-ov .pc-name').textContent : '', rank: document.querySelector('.pc-ov .pc-rank') ? document.querySelector('.pc-ov .pc-rank').textContent : '',
      plate: document.querySelector('.pc-ov .pc-plate img') ? document.querySelector('.pc-ov .pc-plate img').getAttribute('src') === RTF_CARD._plateURL(RTF_CATALOG.item('pl_neon')) : false,
      rows: document.querySelectorAll('#bd-list .open, #bd-list .bd-open, #bd-list [aria-expanded="true"]').length }));
    ok(opened.card && opened.name === 'Mo Tidwell' && /All-League/.test(opened.rank) && opened.plate, '8 a tap on him opens his card, in his rank and his nameplate (' + JSON.stringify([opened.name, opened.rank]) + ')');
    ok(opened.rows === before, '8 the tap does not open the row under it');
    if (process.env.SHOT) { await page.waitForTimeout(800); await page.screenshot({ path: process.env.SHOT.replace('.png', '-theirs.png') }); }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    /* a database without 139 and 140 */
    narrow = true;
    const ans = await page.evaluate(async (ids) => { const m = await RTF_BOARD.jerseys(ids); return m ? Object.keys(m).length : -1; }, [PROFILE.user_id, PLAIN.user_id]);
    ok(ans === 2, '8 against a database without the card columns the circles are still answered, narrower (' + ans + ')');
    narrow = false;
  }

  /* 3 and 9: what goes to the profile */
  const sent = await page.evaluate(async () => {
    const calls = [];
    const st0 = RTF_AUTH.state;
    RTF_AUTH.state = () => Object.assign({}, st0(), { signedIn: true });
    /* a database on 139: a loadout naming an idle or a card piece is refused */
    RTF_AUTH.setProfile = (body) => { calls.push(JSON.parse(JSON.stringify(body))); const w = body.wearStreet || {}; return Promise.resolve(w.idle || w.plate || w.bg ? null : {}); };
    const st = RTF_WARD.load(); st.own.id_flex = 1; st.w.street.idle = 'id_flex'; st.w.street.top = 'st_hoodie_navy'; RTF_WARD.save(st);
    await new Promise((r) => setTimeout(r, 1700));
    RTF_CARD.publish();
    await new Promise((r) => setTimeout(r, 1800));
    RTF_CARD.publish();
    await new Promise((r) => setTimeout(r, 1800));
    return calls;
  });
  const wear = sent.filter((c) => c.wearStreet), players = sent.filter((c) => c.player);
  ok(wear.length >= 2 && wear[0].wearStreet.idle && wear[0].wearStreet.plate, '3 the loadout goes up whole first, idle and card pieces included');
  const bare = wear[wear.length - 1] && wear[wear.length - 1].wearStreet;
  ok(bare && !bare.idle && !bare.plate && !bare.bg && bare.top === 'st_hoodie_navy', '3 refused by 139, it is sent again with only the clothes (' + JSON.stringify(bare) + ')');
  ok(players.length === 1, '9 who he is goes up once, and not again while nothing changed (' + players.length + ')');
  ok(players[0] && playerOk(players[0].player) && players[0].player.name === 'Dre Okafor' && players[0].player.num === 7, '9 and it passes 140\'s shape');

  ok(!out.length, '9 no request reached a payment endpoint');
  ok(!boom.length, '9 nothing threw (' + boom.join(' | ') + ')');
  await b.close();
}
if (!QUICK) await browser();

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
