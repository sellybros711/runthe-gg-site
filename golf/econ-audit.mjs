/* The Run The Tour economy, read off the live page as data.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/econ-audit.mjs                 prints a summary
 *   node golf/econ-audit.mjs --json FILE     writes every item, pack and price as JSON
 *
 * Nothing here is a copy of a number: every row is asked of the page's own functions (cosmeticItems,
 * cosmeticPriceBase, cosmeticPrice, cosPackOnly, cosRewardOnly, passItemOf, packPool, cosBoost), so the
 * audit and the simulation (econ-sim.mjs) read the game as it is on the day they run.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const HOST = process.env.HOST || 'http://localhost:8099';
const jsonAt = process.argv.indexOf('--json');

export async function readEconomy(page) {
  return page.evaluate(() => {
    const ctry = (f, d) => { try { return f(); } catch (e) { return d; } };
    const pool = ctry(() => packPool(), []);
    const inPool = {}; pool.forEach((e) => { inPool[e.key] = e.rarity; });
    // every drop an item belongs to, and when it sells
    const dropOf = {}; DROPS.forEach((d) => d.items.forEach((ci) => { dropOf[ci[0] + '|' + ci[1]] = d; }));
    const rows = [];
    COS_CATS.forEach((c) => {
      (cosmeticItems(c.k) || []).forEach((o) => {
        if (o.id === 'none') return;
        const key = cosKey(c.k, o.id);
        const base = cosmeticPriceBase(c.k, o.id);
        const pass = passItemOf(c.k, o.id);
        const reward = cosRewardOnly(c.k, o.id) ? rewardDrop(c.k, o.id).id : null;
        const free = !!FREE_COSMETICS[key];
        const earn = (typeof CARD_EARN !== 'undefined' && CARD_EARN[key]) ? CARD_EARN[key].hint : null;
        const shirtEarn = (c.k === 'shirt' || c.k === 'hat') ? (COSMETIC_SHIRTS.find((s) => s.id === o.id && s.earn) || null) : null;
        const club = c.k === 'club' ? CLUBS_BY[o.id] : null, putter = c.k === 'putter' ? PUTTERS_BY[o.id] : null;
        const d = dropOf[c.k + '|' + o.id] || null;
        const price = base > 0 ? cosmeticPrice(c.k, o.id) : 0;
        const packOnly = base > 0 ? cosPackOnly(c.k, o.id) : false;
        // rarity: what the pack would roll it as, else the item's own tag, else the source
        let rarity = base > 0 ? packRarityOf(base) : (club ? club.rar : putter ? putter.rar : null);
        if (pass) rarity = 'pass';
        const src = [];
        if (free || (club && club.kind === 'free') || (putter && putter.kind === 'free')) src.push('free');
        if (base > 0 && !packOnly) src.push('buy');
        if (inPool[key] || (d && d.window && base > 0)) src.push('pack');
        if (base > 0 && packOnly) src.push('shard');
        if (pass) src.push('pass S' + pass.season + ' ' + pass.lane + ' t' + pass.tier);
        if (reward) src.push('collection ' + reward);
        if (earn) src.push('earned: ' + earn);
        if (shirtEarn) src.push('earned: ' + (shirtEarn.earn.hint || shirtEarn.earn.label || 'achievement'));
        if (putter && putter.kind === 'pp') src.push('built in Putt Putt');
        const boost = cosBoost(c.k, o.id);
        rows.push({ cat: c.k, slot: c.name, id: o.id, key, name: o.name || o.id, rarity, base, price,
          drop: d ? d.id : null, window: d && d.window ? d.window : null, src,
          boost: boost ? Object.assign({}, boost) : null });
      });
    });
    const legacy = {
      accessories: ACCESSORIES.map((a) => ({ id: a.id, slot: a.slot, name: a.name, rarity: a.rarity, price: a.price, boost: a.boost })),
      milestone: MILESTONE_ITEMS.map((a) => ({ id: a.id, slot: a.slot, name: a.name, boost: a.boost, note: a.note })),
      bag: BAG_CLUBS.map((c) => ({ k: c.k, tiers: c.tiers.map((t, i) => ({ n: t.n, b: t.b, price: bagPrice(i + 1) })) })),
      caddies: CADDIES.map((c) => ({ id: c.id, tier: c.tier, base: (c.power && c.power.base) || null, major: (c.power && c.power.major) || null, venue: (c.power && c.power.venue) ? c.power.venue.d : null, fee: (c.power && c.power.fee) || null })),
    };
    const packs = Object.keys(PACK_TYPES).map((k) => { const p = PACK_TYPES[k];
      return { id: k, name: p.name, price: p.price, odds: p.odds, pityEpic: p.pityEpic, pityLeg: p.pityLeg, seasonal: !!p.seasonal }; });
    const poolByRar = {}; pool.forEach((e) => { poolByRar[e.rarity] = (poolByRar[e.rarity] || 0) + 1; });
    return {
      consts: { RARITY_PRICE, COLOR_PRICE, BOOST_PREMIUM, ACC_SKILL_CAP, ACC_TOTAL_CAP, PACK_PRICE, PACK_HIKE,
        priceHike: priceHike(), PACK_DUPE_REFUND, SHARD_COST, EXCHANGE_COST, CLUB_SEL, COIN_RATE, COIN_START,
        CLUB_REPS_PER_LEVEL, CLUB_LEVEL_CAP },
      cats: COS_CATS.map((c) => ({ k: c.k, name: c.name })),
      items: rows, packs, pool: { size: pool.length, byRarity: poolByRar, list: pool.map((e) => ({ key: e.key, cat: e.cat, id: e.id, rarity: e.rarity })) }, legacy,
      ovr: { w: CATS.map((c) => [c.k, c.w]), K: OVR_IMBALANCE_K, DD: OVR_DEADBAND, REPLACEMENT, MAX_OVER: 112 },
      // which closet slots the game counts, found by wearing one boosted item of each on a bare golfer
      slots: (function () { const keep = { u: sbUser, n: sbUsername, look: S.look, d: S.daily }; const out = [];
        try { sbUser = sbUser || { id: 'econ-probe' }; S.daily = false;
          const bare = CLUBS.find((c) => !cosBoost('club', c.id));
          COS_CATS.forEach((c) => { const it = (cosmeticItems(c.k) || []).find((o) => o.id !== 'none' && cosBoost(c.k, o.id)); if (!it) return;
            const st = coinState(); st.owned[cosKey(c.k, it.id)] = 1; if (bare) st.owned['cl:' + bare.id] = 1; LS.set(acctKey('bag_coins'), st);
            S.look = Object.assign({}, DEFLOOK, { cap: false, eyewear: 'none', shirtPat: 'none', putter: 'stock', ball: 'none', cleats: 'none', club: bare ? bare.id : 'driver' });
            const before = JSON.stringify(accBoost()); cosEquip(c.k, it.id); if (c.k === 'hw') { S.look.cap = true; S.look.hatStyle = it.id; }
            if (JSON.stringify(accBoost()) !== before) out.push(c.k); });
        } catch (e) {} sbUser = keep.u; sbUsername = keep.n; S.look = keep.look; S.daily = keep.d; return out; })(),
      sets: (typeof COLLECTION_SETS !== 'undefined') ? { map: COLLECTION_SETS, max: SET_STAT_MAX } : null,
      exchange: { cost: EXCHANGE_COST, legCoins: LEG_EXCHANGE_COINS },
      drops: DROPS.map((d) => ({ id: d.id, name: d.name, window: d.window || null, n: d.items.length, items: d.items.map((ci) => cosKey(ci[0], ci[1])), reward: DROP_REWARDS[d.id] || null })),
    };
  });
}

export async function openPage(b, viewport) {
  const page = await b.newPage({ viewport: viewport || { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.route(/supabase|googlesyndication|google-analytics|googletagmanager|jsdelivr/, (r) => r.abort());
  await page.goto(HOST + '/golf/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof buildPlayer === 'function' && typeof packPool === 'function', null, { timeout: 30000 });
  page._errs = errs;
  return page;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const b = await chromium.launch();
  try {
    const page = await openPage(b);
    const E = await readEconomy(page);
    if (jsonAt > 0) { fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(E, null, 1)); console.log('wrote', process.argv[jsonAt + 1]); }
    const by = {};
    E.items.forEach((r) => { const k = r.cat; by[k] = by[k] || { n: 0, boosted: 0, pts: 0 }; by[k].n++; if (r.boost) { by[k].boosted++; for (const s in r.boost) by[k].pts += r.boost[s]; } });
    console.log('items', E.items.length, 'pack pool', E.pool.size, JSON.stringify(E.pool.byRarity));
    for (const k in by) console.log(k.padEnd(8), String(by[k].n).padStart(4), 'items,', String(by[k].boosted).padStart(3), 'boosted, net', by[k].pts);
    if (page._errs.length) console.log('page errors', page._errs);
  } finally { await b.close(); }
}
