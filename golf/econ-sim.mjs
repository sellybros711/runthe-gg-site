/* Run The Tour economy simulation: three players through one 60 day Tour Pass season.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/econ-sim.mjs                     today's game
 *   node golf/econ-sim.mjs --framework FILE    a proposed boost table (JSON, see below) laid over today's
 *   node golf/econ-sim.mjs --runs 300 --json OUT
 *
 * Every item, the pack pool, the odds, pity, duplicate refunds, the shard exchange, the boost caps and the
 * overall formula are read off the live page (econ-audit.mjs). What a player EARNS per day is the model's
 * assumption, written out in PROFILES below with where each number comes from. A player spends on packs,
 * cashes shards at the exchange, and wears the closet that gives the highest overall rating under the real
 * caps. At the end the page itself plays a season of the real schedule against the real living world field
 * (simRound, eventOverall), with and without the closet, so power creep is measured in wins, not points.
 *
 * A framework file is { "boost": { "hw:knight": {"clu":3}, ... }, "slots": ["hw","ew","pat","putter","club","ball"],
 * "skillCap": 5, "totalCap": 20 }. Boosts listed there are ADDED to today's (the boost rule: nothing is lowered).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { readEconomy, openPage } from './econ-audit.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('--runs', 200), DAYS = +arg('--days', 60);

/* What each player earns. Numbers from the source audit of 2026-10-16 (the Run The Tour economy note in the
 * vault has the table): Daily round EV ~160 coins, a played career season ~3,000, the wheel 449 to ~650 a spin,
 * login 375 a 7 day loop, the streak week 1,500, weekly coin challenges 750 each, Putt Putt ~4,000 a world in
 * holes plus ~13,000 in trail chests. Free packs: login days 4 and 7 (base), streak day 4 (base) and day 7
 * (tour), the first two weekly challenges (base), the Tour Pass lanes by tier. */
const PROFILES = {
  casual:  { label: 'Casual', draft: 84, coinsDay: 1000, puttWorldsWeek: 0.5,
             packsWeek: { base: 2.5, tour: 0 }, shardsWeek: { common: 4, rare: 1, epic: 0 },
             passTier: 7, pro: false, buy: 'base', note: '1 Daily a day, a login most days, no career seasons, half a Putt Putt world a week' },
  regular: { label: 'Regular', draft: 88, coinsDay: 7800, puttWorldsWeek: 2,
             packsWeek: { base: 5, tour: 1 }, shardsWeek: { common: 9, rare: 4, epic: 2 },
             passTier: 45, pro: false, buy: 'tour', note: '3 Dailies, 2 played career seasons and 3 H2H wins a day, every weekly, free Pass lane' },
  heavy:   { label: 'Heavy', draft: 92, coinsDay: 11100, puttWorldsWeek: 7, bonus: 30000,
             packsWeek: { base: 5, tour: 1 }, shardsWeek: { common: 9, rare: 4, epic: 2 },
             passTier: 60, pro: true, buy: 'champ', note: 'the regular\'s play with the Tour Pass bought (x1.5 play coins, 30,000 coins, 2 seasonal packs, the Pro lane)' },
};
const PUTT_WORLDS = 11, PUTT_WORLD_COINS = 4000 + 13000;
// Tour Pass lane packs over 60 tiers (passTierReward, Season 2): free 6 base + 2 seasonal + 1 tour; Pro 3 tour + 4 champ
const LANE_PACKS = { free: { base: 6, tour: 3 }, prem: { tour: 3, champ: 4 } };

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function makeModel(E, fw) {
  fw = fw || {};
  const slots = fw.slots || E.slots;   // the slots the game counts (econ-audit probes them)
  const skillCap = fw.skillCap != null ? fw.skillCap : E.consts.ACC_SKILL_CAP;
  const totalCap = fw.totalCap != null ? fw.totalCap : E.consts.ACC_TOTAL_CAP;
  const boostOf = {};
  E.items.forEach((r) => { if (r.boost) boostOf[r.key] = Object.assign({}, r.boost); });
  for (const k in (fw.boost || {})) { const add = fw.boost[k]; const b = boostOf[k] = Object.assign({}, boostOf[k] || {});
    for (const s in add) b[s] = (b[s] || 0) + add[s]; }
  const itemByKey = {}; E.items.forEach((r) => { itemByKey[r.key] = r; });
  const W = Object.fromEntries(E.ovr.w), KEYS = E.ovr.w.map((x) => x[0]);
  // collection sets (framework B): a finished collection is +1 on its stat, outside the gear caps, up to setCap
  const sets = fw.sets || (E.sets && E.sets.map) || null, setCap = fw.setCap || (E.sets ? 8 : 0), dropItems = Object.fromEntries((E.drops || []).map((d) => [d.id, d.items || []]));
  function setBonus(owned) { const o = {}; if (!sets) return o; const have = new Set(owned); let n = 0;
    for (const id in sets) { const it = dropItems[id] || []; if (it.length && it.every((k) => have.has(k)) && n < setCap) { o[sets[id]] = (o[sets[id]] || 0) + 1; n++; } }
    return o; }
  // the page's accBoost: clamp each skill to +-cap, then trim the largest positive first past the total cap
  function capped(sum) { const o = {}; for (const k in sum) o[k] = Math.max(-skillCap, Math.min(skillCap, sum[k]));
    let t = Object.values(o).reduce((a, b) => a + b, 0);
    while (t > totalCap) { let mk = null; for (const k in o) if (o[k] > 0 && (mk === null || o[k] > o[mk])) mk = k; if (mk === null) break; o[mk]--; t--; }
    return o; }
  // the page's ovrFromSkills with allowOver (gear on)
  function ovr(sk, over) { const v = KEYS.map((k) => sk[k] != null ? sk[k] : E.ovr.REPLACEMENT);
    const wm = KEYS.reduce((s, k, i) => s + v[i] * W[k], 0), mean = v.reduce((a, b) => a + b, 0) / v.length;
    const below = v.filter((x) => x < mean).map((x) => mean - x);
    const dd = below.length ? Math.sqrt(below.reduce((a, b) => a + b * b, 0) / v.length) : 0;
    return Math.max(40, Math.min(over ? E.ovr.MAX_OVER : 99, wm - E.ovr.K * Math.max(0, dd - E.ovr.DD))); }
  function apply(raw, b, sb) { const s = {}; KEYS.forEach((k) => { s[k] = Math.max(40, Math.min(99 + skillCap, raw[k] + (b[k] || 0))) + ((sb && sb[k]) || 0); }); return s; }
  // best closet: one item per counted slot, coordinate ascent on the overall from the per-slot best net
  function bestCloset(owned, raw) {
    const sb = setBonus(owned);
    const cand = {}; slots.forEach((sl) => { cand[sl] = [null]; });
    owned.forEach((k) => { const it = itemByKey[k]; if (it && boostOf[k] && cand[it.cat]) cand[it.cat].push(k); });
    const net = (k) => { let s = 0; const b = boostOf[k] || {}; for (const x in b) s += b[x]; return s; };
    const pick = {}; slots.forEach((sl) => { pick[sl] = cand[sl].reduce((a, k) => (k && (a === null || net(k) > net(a))) ? k : a, null); });
    const score = (p) => { const sum = {}; for (const sl in p) { const b = p[sl] ? boostOf[p[sl]] : null; if (b) for (const x in b) sum[x] = (sum[x] || 0) + b[x]; }
      const cb = capped(sum); return { o: ovr(apply(raw, cb, sb), true), cb, sum }; };
    let best = score(pick);
    for (let pass = 0; pass < 3; pass++) { let moved = false;
      slots.forEach((sl) => { cand[sl].forEach((k) => { if (k === pick[sl]) return; const t = Object.assign({}, pick, { [sl]: k }); const s = score(t);
        if (s.o > best.o + 1e-9) { pick[sl] = k; best = s; moved = true; } }); });
      if (!moved) break; }
    const rawSum = Object.values(best.sum).reduce((a, b) => a + b, 0), cappedSum = Object.values(best.cb).reduce((a, b) => a + b, 0);
    const st = apply(raw, best.cb, sb), setSum = Object.values(sb).reduce((a, b) => a + b, 0);
    const eff = {}; KEYS.forEach((k) => { if (st[k] !== raw[k]) eff[k] = st[k] - raw[k]; });
    return { pick, boost: eff, rawSum: rawSum + setSum, cappedSum: cappedSum + setSum, sets: setSum, ovr: best.o, stats: st, bestStat: Math.max(...KEYS.map((k) => st[k])) };
  }
  return { slots, skillCap, totalCap, boostOf, itemByKey, capped, ovr, apply, bestCloset, setBonus, KEYS };
}

export function simulate(E, M, prof, seed, days = 60) {
  const R = rng(seed);
  const pool = E.pool.list, byR = {}; pool.forEach((e) => { (byR[e.rarity] = byR[e.rarity] || []).push(e.key); });
  const PT = Object.fromEntries(E.packs.map((p) => [p.id, p]));
  const NEXT = { common: 'rare', rare: 'epic', epic: 'legendary' };
  const owned = new Set(E.items.filter((r) => r.src.includes('free')).map((r) => r.key));
  let coins = 0, earned = 0, spent = 0, opened = 0, sinceEpic = 0, sinceLeg = 0;
  const shards = { common: 0, rare: 0, epic: 0, legendary: 0 }, credits = { base: 0, tour: 0, champ: 0 };
  const raw = {}; M.KEYS.forEach((k) => { raw[k] = prof.draft; });
  const passItems = prof.pro ? E.items.filter((r) => r.src.some((s) => s.startsWith('pass S2'))) : [];
  const ppPutters = E.items.filter((r) => r.src.includes('built in Putt Putt'));
  function rollRarity(t) { const p = PT[t]; let r;
    if (sinceLeg + 1 >= p.pityLeg) r = 'legendary'; else if (sinceEpic + 1 >= p.pityEpic) r = 'epic';
    else { let x = R(); r = p.odds[p.odds.length - 1][0]; for (const [k, w] of p.odds) { if (x < w) { r = k; break; } x -= w; } }
    if (r === 'legendary') { sinceLeg = 0; sinceEpic = 0; } else if (r === 'epic') { sinceEpic = 0; sinceLeg++; } else { sinceEpic++; sinceLeg++; }
    return r; }
  function open(t, paid) { opened++; const r = rollRarity(t); const list = byR[r]; const k = list[Math.floor(R() * list.length)];
    if (owned.has(k)) { shards[r]++; if (paid) { const c = E.consts.PACK_DUPE_REFUND[r]; coins += c; earned += c; } } else owned.add(k); }
  function exchange() {
    for (const r of ['common', 'rare', 'epic']) while (shards[r] >= E.exchange.cost) { shards[r] -= E.exchange.cost;
      const list = byR[NEXT[r]], un = list.filter((k) => !owned.has(k)); const k = (un.length ? un : list)[Math.floor(R() * (un.length ? un : list).length)];
      if (owned.has(k)) shards[NEXT[r]]++; else owned.add(k); }
    while (shards.legendary >= E.exchange.cost) { shards.legendary -= E.exchange.cost; coins += E.exchange.legCoins; earned += E.exchange.legCoins; credits.champ++;
      // pick 1 of 3 legendaries: the player takes the one that raises the overall most
      const un = byR.legendary.filter((k) => !owned.has(k)); const three = []; for (let i = 0; i < 3 && un.length; i++) three.push(un.splice(Math.floor(R() * un.length), 1)[0]);
      let bk = three[0], bo = -1; three.forEach((k) => { const o = M.bestCloset([...owned, k], raw).ovr; if (o > bo) { bo = o; bk = k; } }); if (bk) owned.add(bk); }
  }
  const out = []; let worldsDone = 0;
  const pay = (n) => { coins += n; earned += n; };
  if (prof.bonus) pay(prof.bonus);
  if (prof.pro) credits.tour += 2;   // the pass purchase's 2 seasonal packs (opened at tour odds)
  for (let d = 1; d <= days; d++) {
    pay(prof.coinsDay);
    // Putt Putt worlds, one-time
    const want = Math.min(PUTT_WORLDS, Math.floor(d * prof.puttWorldsWeek / 7));
    while (worldsDone < want) { worldsDone++; pay(PUTT_WORLD_COINS); }
    if (worldsDone >= 3) ppPutters.slice(0, Math.min(3, worldsDone - 2)).forEach((r) => owned.add(r.key));
    // free packs and shards, spread evenly over the week
    for (const t in prof.packsWeek) { const n = prof.packsWeek[t] / 7; credits[t] += n; }
    for (const r in prof.shardsWeek) shards[r] += prof.shardsWeek[r] / 7;
    // Tour Pass lanes: tier reached by today, lane packs pro rata
    const tierToday = prof.passTier * (((d - 1) % 60) + 1) / 60, lane = (L) => { for (const t in LANE_PACKS[L]) credits[t] += LANE_PACKS[L][t] / 60 * prof.passTier / 60; };   // a Tour Pass season is 60 days; each one repeats
    lane('free'); if (prof.pro) { lane('prem'); passItems.forEach((r) => { const m = /t(\d+)$/.exec(r.src.find((s) => s.startsWith('pass S2'))); if (m && +m[1] <= tierToday) owned.add(r.key); }); }
    for (const t of ['base', 'tour', 'champ']) while (credits[t] >= 1) { credits[t]--; open(t, false); }
    // spend: the profile's pack, while affordable
    const price = PT[prof.buy].price; while (coins >= price) { coins -= price; spent += price; open(prof.buy, true); }
    for (const r in shards) shards[r] = Math.round(shards[r] * 1000) / 1000;
    exchange();
    if ([1, 7, 14, 30, 45, 60, 90, 120, 180, 240, 365].includes(d) && d <= days) {
      const c = M.bestCloset([...owned], raw);
      const boosted = [...owned].filter((k) => M.boostOf[k]).length;
      out.push({ d, coins: Math.round(coins), earned: Math.round(earned), spent, opened, owned: owned.size, boosted,
        rawSum: c.rawSum, capped: c.cappedSum, bestStat: c.bestStat, ovr: Math.round(c.ovr * 10) / 10, pick: c.pick, boost: c.boost });
    }
  }
  return out;
}

// the page plays a season of the real schedule against the real living-world field
export async function winRates(page, builds, seasons = 40) {
  return page.evaluate(([builds, seasons]) => {
    S.career = {}; S.year = 1; S.careerSeed = 20261016; RNG = mulberry32(20261016);
    const sched = seasonSchedule(1, 20261016), roster = worldField(FIELDSIZE - 1);
    const one = (sk) => { let wins = 0, top10 = 0, majors = 0;
      sched.forEach((evt) => { const ew = eventWeights(evt), ca = gauss() * (evt.major ? SIM.maj.csd : SIM.reg.csd);
        const ps = roster.map((g) => ({ eo: eventOverall(g, ew), clu: g.clu, t: 0 })); const me = { eo: eventOverall(sk, ew), clu: sk.clu, t: 0 }; ps.push(me);
        for (let r = 0; r < 4; r++) ps.forEach((o) => { const s = simRound(o.eo, o.clu, { major: evt.major, big: evt.big, finalRd: r === 3, courseAdj: ca }); o.t += s; if (!isFinite(s)) o.bad = 1; });
        if (me.bad) throw new Error('NaN round');
        ps.sort((a, b) => a.t - b.t); const pos = ps.indexOf(me); if (pos === 0) { wins++; if (evt.major) majors++; } if (pos < 10) top10++; });
      return { wins, top10, majors }; };
    const res = {};
    // common random numbers: season i draws the same luck for every build, so only the golfer differs
    for (const name in builds) { let w = 0, t = 0, m = 0; for (let i = 0; i < seasons; i++) { RNG = mulberry32(7919 * (i + 1)); const s = one(builds[name]); w += s.wins; t += s.top10; m += s.majors; }
      res[name] = { wins: w / seasons, top10: t / seasons, majors: m / seasons, events: sched.length }; }
    return res;
  }, [builds, seasons]);
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

if (import.meta.url === 'file://' + process.argv[1]) {
  const fwFile = arg('--framework', null), jsonOut = arg('--json', null);
  const fw = fwFile ? JSON.parse(fs.readFileSync(fwFile, 'utf8')) : null;
  const b = await chromium.launch();
  try {
    const page = await openPage(b);
    const E = await readEconomy(page);
    const M = makeModel(E, fw);
    const report = { framework: fwFile || 'today', slots: M.slots, caps: [M.skillCap, M.totalCap], profiles: {} };
    for (const pk in PROFILES) {
      const prof = PROFILES[pk]; const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(simulate(E, M, prof, 1000 + i, DAYS));
      const rows = runs[0].map((_, j) => { const col = (f) => med(runs.map((r) => r[j][f]));
        return { d: runs[0][j].d, coins: col('coins'), earned: col('earned'), opened: col('opened'), owned: col('owned'), boosted: col('boosted'), rawSum: col('rawSum'), capped: col('capped'), bestStat: col('bestStat'), ovr: col('ovr') }; });
      const last = runs.map((r) => r[r.length - 1]); const typ = last.find((x) => x.ovr === med(last.map((y) => y.ovr))) || last[0];
      report.profiles[pk] = { prof, rows, typical: { pick: typ.pick, boost: typ.boost } };
    }
    // the strongest closet anyone can wear: every item owned, on the strongest draft (all 99)
    const all = E.items.map((r) => r.key), maxRaw = Object.fromEntries(M.KEYS.map((k) => [k, 99]));
    const top = M.bestCloset(all, maxRaw);
    report.max = { pick: top.pick, boost: top.boost, rawSum: top.rawSum, capped: top.cappedSum, bestStat: top.bestStat, ovr: Math.round(top.ovr * 10) / 10, stats: top.stats };
    // a single stat pushed as far as the caps allow
    report.maxStat = 99 + M.skillCap;
    // wins, raw against geared, at the season's end closet
    const builds = { max_raw: maxRaw, max_geared: top.stats };
    for (const pk in PROFILES) { const p = PROFILES[pk], raw = Object.fromEntries(M.KEYS.map((k) => [k, p.draft]));
      builds[pk + '_raw'] = raw; builds[pk + '_geared'] = Object.fromEntries(M.KEYS.map((k) => [k, raw[k] + (report.profiles[pk].typical.boost[k] || 0)])); }
    report.wins = await winRates(page, builds, +arg('--seasons', 40));
    if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
    console.log('framework', report.framework, '· slots', M.slots.join(','), '· caps +' + M.skillCap + ' a stat, +' + M.totalCap + ' total', '· runs', RUNS);
    for (const pk in report.profiles) { const P = report.profiles[pk];
      console.log('\n' + P.prof.label + ' (draft ' + P.prof.draft + '): ' + P.prof.note);
      console.log('  day   coins   earned  packs  owned  boosted  raw+  capped+  best  OVR');
      P.rows.forEach((r) => console.log('  ' + [r.d, r.coins, r.earned, r.opened, r.owned, r.boosted, r.rawSum, r.capped, r.bestStat, r.ovr].map((x, i) => String(x).padStart([3, 8, 8, 6, 6, 8, 5, 8, 5, 6][i])).join(' ')));
      const w = report.wins; console.log('  wins a season (of ' + w[pk + '_raw'].events + '): raw ' + w[pk + '_raw'].wins.toFixed(2) + ' -> geared ' + w[pk + '_geared'].wins.toFixed(2) + ' · top 10 ' + w[pk + '_raw'].top10.toFixed(1) + ' -> ' + w[pk + '_geared'].top10.toFixed(1));
    }
    console.log('\nStrongest closet on an all-99 draft: +' + report.max.capped + ' (raw +' + report.max.rawSum + '), best stat ' + report.max.bestStat + ', OVR ' + report.max.ovr);
    console.log('  ' + JSON.stringify(report.max.pick));
    console.log('  wins a season: all 99 ' + report.wins.max_raw.wins.toFixed(2) + ' -> geared ' + report.wins.max_geared.wins.toFixed(2) + ' (majors ' + report.wins.max_raw.majors.toFixed(2) + ' -> ' + report.wins.max_geared.majors.toFixed(2) + ')');
    if (page._errs.length) { console.log('page errors', page._errs); process.exitCode = 1; }
  } finally { await b.close(); }
}
