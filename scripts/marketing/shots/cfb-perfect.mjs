/* Perfect Season: College Football, one whole run as a guest: six spins and six signings, the season,
   the playoff and the result. The run is pinned with the page's own seed hook (PS_CFB_SEED, as
   cfb/build/test/test_bracket.mjs does) and signs a known draft, so the take ends the same way every time.

   Seed 350 with these six signings goes 15-0 (found with the greedy draft of find_seeds.mjs). A seed goes
   stale when the engine changes: if the result is not "Perfect season", find a new one. --arg <seed>
   with --arg picks the seed; the picks below belong to 350. */
export const page = '/cfb/';
export const seconds = 120;
export const hide = [];
const SEED = 350;
const PICKS = ['174154|2008', '4241205|2020', '4808830|2022', '550190|2013', '546621|2014', '4242369|2019'];
export const init = `window.PS_CFB_SEED = ${SEED};`;
// what the trailer's camera frames (record.mjs writes where each is, every frame)
export const track = {
  budget: '#s-draft.on #c-amt', hud: '#s-draft.on #c-bar', count: '#s-draft.on #d-count', field: '#s-draft.on #field',
  reels: '#s-draft.on #reel-t', reely: '#s-draft.on #reel-y', respin: '#s-draft.on #d-respin', opts: '#s-draft.on #opts',
  ...Object.fromEntries(PICKS.filter((k) => !k.startsWith('respin')).map((k, i) => [`p${i}`, `#opts button.tile[data-k="${k}"]`])),
  squad: '#s-squad.on', play: '#b-play',
  bug: '#s-season.on #v-bug', rec: '#s-season.on #v-rec', streak: '#s-season.on #v-streak', gameday: '#s-season.on #v-gameday', cal: '#s-season.on #v-list',
  seedrec: '#s-seed.on #sd-rec', badges: '#s-seed.on #sd-badges', po: '#b-po',
  rail: '#s-brk.on #brk-rail', note: '#s-brk.on #brk-note',
  card: '#s-over.on #o-card', orec: '#s-over.on #o-rec', otitle: '#s-over.on #o-title',
};

const on = (id) => `!!document.querySelector('${id}.on')`;
async function sign(page, t, k) {
  const tile = page.locator(`#opts button.tile[data-k="${k}"]`);
  for (let i = 0; i < 8 && !(await tile.isVisible().catch(() => false)); i++) {
    const tabs = page.locator('#tabs .tab');
    const n = await tabs.count();
    if (!n) { await t.hold(300); continue; }
    await t.tap(tabs.nth(i % n), { before: 150, after: 250 });
  }
  await t.tap(tile, { before: 650, after: 300 });
  if (await page.locator('#sheet.on .slotopt').count()) await t.tap(page.locator('#sheet.on .slotopt').first());
}

export async function setup(page, t) {
  await t.until(new Function(`return ${on('#s-intro')}`), 30000);
  await t.hold(900);
}

export async function play(page, t) {
  await t.hold(700);
  await t.tap('#b-play-intro', { before: 300, after: 200 });
  for (const k of PICKS) {
    // the reels land, the board fills, the pick goes in (or a re-spin, 'respin:team' or 'respin:year')
    await t.until(() => document.querySelectorAll('#opts button.tile').length > 0, 20000);
    await t.hold(1400);
    if (k.startsWith('respin:')) { await t.tap(`#d-respin button.respin[data-kind="${k.slice(7)}"]`, { before: 400, after: 300 }); await t.hold(1200); continue; }
    await sign(page, t, k);
    await t.hold(500);
  }
  await t.until(new Function(`return ${on('#s-squad')}`), 20000);
  await t.hold(1800);
  await t.tap('#b-play', { before: 300, after: 200 });
  await t.until(new Function(`return ${on('#s-seed')}`), 60000);
  await t.hold(2200);
  // the playoff, game by game, on the drive chart
  for (let g = 0; g < 6; g++) {
    if (await page.locator('#s-over.on').count()) break;
    const po = page.locator('#b-po');
    if (await po.isVisible().catch(() => false)) await t.tap(po, { before: 400, after: 200 });
    await t.until(new Function(`return ${on('#s-brk')} || ${on('#s-over')} || ${on('#s-seed')}`), 60000);
    await t.hold(1600);
    const go = page.locator('#s-brk.on button, #s-seed.on #b-po').first();
    if (!(await page.locator('#s-over.on').count()) && await go.isVisible().catch(() => false)) await t.tap(go, { before: 300, after: 200 });
    await t.hold(800);
  }
  await t.until(new Function(`return ${on('#s-over')}`), 90000);
  await t.hold(4000);
}
