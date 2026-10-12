/* Run The Floor: the coin economy.
 *
 * window.RTF_ECON, and node can require it, because the numbers here are the
 * whole design and they are tested headless (hoops/check-economy.mjs). The
 * plan, and the reasoning behind every number, is hoops/design/ECONOMY.md.
 * Read that before moving a constant: a number nobody can find the reasoning
 * for gets "adjusted" by the next person who looks at it.
 *
 * THE PRICES ARE RUN THE TOUR'S, EXACTLY (the owner's call, 2026-10-11), so a
 * coin means the same thing in both games. They are still two wallets.
 *
 * A COIN IS A KEYED ENTRY. Golf derives earned coins from career stats and
 * merges two devices by taking the larger total, which loses whatever one
 * device earned while the other was offline. Here every award and every spend
 * is written under a key that names what it was for (`dd:2026-10-11` is that
 * day's Daily Draft, `buy:tee_hoodie` is buying that hoodie), and two devices
 * merge as a UNION of keys:
 *   the same daily filed on two phones is one key, paid once;
 *   nothing earned anywhere is lost;
 *   the same purchase on two offline devices is one charge for one item.
 * Old entries are folded into a per device total so the record stays small.
 *
 * ONE WAY IN AND ONE WAY OUT. Every coin enters through award() and every
 * spend goes through spend(). The pass, the multipliers and the daily rule
 * hook in there and nowhere else.
 *
 * Earned coins only. Paid coins (Phase 6) live on the server and are handed
 * to balance() as a number; this file never grants one.
 */
(function(){
'use strict';

var API_VERSION = 1;

/* ─── prices: Run The Tour's ─────────────────────────────────────────── */

var RARITIES = ['common', 'rare', 'epic', 'legendary'];
var PRICE = { common: 15000, rare: 45000, epic: 110000, legendary: 275000 };
/* an idle is the most visible thing a player owns, so it prices one step up */
var IDLE_STEP = { common: 'rare', rare: 'epic', epic: 'legendary', legendary: 'legendary' };
var DUPE_REFUND = { common: 2000, rare: 5000, epic: 12000, legendary: 25000 };
var EXCHANGE_COST = 10, LEG_EXCHANGE_COINS = 25000;
/* ─── REAL MONEY, SHIPPED DARK (ECONOMY.md section 9) ──────────────────────
   The page's copy of the coin buckets functions/api/stripe/_bundles.js sells,
   for drawing them. The server's copy is the one that charges and delivers,
   and scripts/stripe/check-floor-money.mjs holds the two together. Off, the
   page draws no bucket and asks the server for nothing. Paid coins are never
   in this ledger until spent: wardrobe.js cover() moves exactly what a press
   needs out of the server's balance (141) and files it here under its key. */
var BUCKETS_ENABLED = false;
var BUCKETS = {
  'floor-coins-1': { name: 'Handful of Coins', cents: 199, coins: 15000, packs: [] },
  'floor-coins-2': { name: 'Bag of Coins', cents: 499, coins: 45000, packs: [] },
  'floor-coins-3': { name: 'Bucket of Coins', cents: 999, coins: 102000, packs: ['league'] },
  'floor-coins-4': { name: 'Crate of Coins', cents: 1999, coins: 285000, packs: ['hof'] },
  'floor-coins-5': { name: 'Vault of Coins', cents: 4999, coins: 750000, packs: ['hof', 'hof', 'hof'] },
};

var PACKS = {
  street: { name: 'Streetball Pack', price: 8000, odds: [0.55, 0.30, 0.12, 0.03], pity: [10, 40] },
  league: { name: 'League Pack', price: 22000, odds: [0.30, 0.40, 0.22, 0.08], pity: [6, 24] },
  hof: { name: 'Hall of Fame Pack', price: 45000, odds: [0.10, 0.35, 0.38, 0.17], pity: [4, 12] },
  season: { name: 'Seasonal Pack', price: 30000, odds: [0.30, 0.40, 0.22, 0.08], pity: [6, 24], dropBias: 0.4 },
};
var BUNDLE_N = 5, BUNDLE_PAY = 4;
var WELCOME = 2400;

/* ─── the faucet ──────────────────────────────────────────────────────────
   Measured, not guessed (ECONOMY.md section 2): a career is about 11 seasons
   and a typical player plays one to three a day. So the anchor is the DAY: two
   careers and the dailies earn about 15,000, the $1.99 bucket, as in golf. */
var RATE = {
  dd: { base: 480, playoffs: 320, series: 480, title: 1200 },
  fx: { base: 400, odds: 640 },
  ps: { base: 400, par: 400, noEasy: 240 },
  endless: 80,
  run: { base: 240, october: 160, series: 120, title: 800 },
  cqWin: 40, cqClear: 480,
  season: { base: 240, round: 60, allstar: 120, award: 160, title: 600 },
  finish: 1600, hallMax: 1600,
  badge: { bronze: 120, silver: 240, gold: 480, ring: 1200 },
  quest: 320, questAll: 480, weekly: 3200,
};
/* Daily play pays more than grinding. Each repeatable source pays full for its
   first few a day (Eastern), then a quarter. Careers are counted as CAREERS,
   not seasons: careers are the main loop, and cutting a season count would
   have cut a typical player's second career to nothing. */
var FULL_A_DAY = { run: 3, career: 3, endless: 5 };
var CQ_DAY_CAP = 1200, TAIL = 0.25, EASY = 0.5;

/* ─── time ──────────────────────────────────────────────────────────────── */

var ETF = null;
try { ETF = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (x) { ETF = null; }
/* The Eastern calendar day, the clock every daily on this site rolls on. A
   browser with no time zone data answers its own date rather than throwing. */
function dayOf(t){
  var d = new Date(t == null ? Date.now() : t);
  if (ETF) { try { return ETF.format(d); } catch (x) {} }
  var p = function(n){ return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ─── the wallet ────────────────────────────────────────────────────────── */

/* e: earned, key -> [amount, time, src, day]
   s: spent,  key -> [amount, time, what]
   z: folded, device -> [earned, spent]   (old entries, compacted) */
function fresh(){ return { v: 1, e: {}, s: {}, z: {} }; }
function clean(w){
  if (!w || typeof w !== 'object') return fresh();
  var out = { v: 1, e: w.e && typeof w.e === 'object' ? w.e : {}, s: w.s && typeof w.s === 'object' ? w.s : {}, z: w.z && typeof w.z === 'object' ? w.z : {} };
  /* the keys this wallet has folded into z: dropping them would let an
     unsynced device list them again and count them twice */
  if (Array.isArray(w.f)) out.f = w.f;
  return out;
}
/* the write paths change the wallet they are handed, in place, so a caller
   holding it sees the change (clean() above is for reading) */
function own(w){
  if (!w || typeof w !== 'object') return fresh();
  if (!w.e || typeof w.e !== 'object') w.e = {};
  if (!w.s || typeof w.s !== 'object') w.s = {};
  if (!w.z || typeof w.z !== 'object') w.z = {};
  return w;
}
function sum(map, i){ var n = 0; for (var k in map) { var v = map[k]; n += +(Array.isArray(v) ? v[i || 0] : 0) || 0; } return n; }
function earned(w){ w = clean(w); var n = sum(w.e); for (var d in w.z) n += +w.z[d][0] || 0; return n; }
function spent(w){ w = clean(w); var n = sum(w.s); for (var d in w.z) n += +w.z[d][1] || 0; return n; }
/* paid is the server's number (Phase 6); absent it is nought */
function balance(w, paid){ return earned(w) - spent(w) + (+paid || 0); }

/* How many of this source have been paid today, before this one. A career's
   seasons and its finish share one count, keyed by the career's seed. */
function careerSlot(w, seed, day){
  var seen = [], list = [];
  for (var k in w.e) { var v = w.e[k]; if (v[3] !== day || (v[2] !== 'career')) continue; list.push([v[1], k.split(':')[1]]); }
  list.sort(function(a, b){ return a[0] - b[0]; });
  list.forEach(function(x){ if (seen.indexOf(x[1]) < 0) seen.push(x[1]); });
  var i = seen.indexOf(String(seed));
  return i >= 0 ? i : seen.length;
}
function countToday(w, src, day){ var n = 0; for (var k in w.e) { var v = w.e[k]; if (v[2] === src && v[3] === day) n++; } return n; }
function sumToday(w, src, day){ var n = 0; for (var k in w.e) { var v = w.e[k]; if (v[2] === src && v[3] === day) n += v[0]; } return n; }

/* award(w, key, amount, src, opts) -> { paid, amount, why }
   key is what makes it idempotent: a key already paid pays nothing.
   src names the daily rule: 'run', 'career' (key 'cs:<seed>:<year>' or
   'cf:<seed>'), 'endless', 'cq', or anything else (no rule).
   opts.t is the time (tests pass it), opts.easy halves it. */
function award(w, key, amount, src, opts){
  w = own(w); opts = opts || {};
  key = String(key); amount = Math.round(+amount || 0);
  if (!key || amount <= 0) return { paid: false, amount: 0, why: 'nothing' };
  if (w.e[key]) return { paid: false, amount: 0, why: 'already' };
  var t = opts.t == null ? Date.now() : +opts.t, day = dayOf(t), f = 1;
  if (src === 'career') { var seed = key.split(':')[1]; if (careerSlot(w, seed, day) >= FULL_A_DAY.career) f = TAIL; }
  else if (FULL_A_DAY[src] && countToday(w, src, day) >= FULL_A_DAY[src]) f = TAIL;
  if (opts.easy) f *= EASY;
  var n = Math.round(amount * f);
  if (src === 'cq') n = Math.max(0, Math.min(n, CQ_DAY_CAP - sumToday(w, 'cq', day)));
  if (n <= 0) return { paid: false, amount: 0, why: 'capped' };
  w.e[key] = [n, t, src || '', day];
  return { paid: true, amount: n, why: f < 1 ? 'tail' : 'full', w: w };
}

/* mark(w, key): the key is held at nought. It is how a badge earned before
   the account had a wallet, or a season played before this career was being
   paid, is settled once and for ever without paying: award() then refuses it
   as already paid, and a merge keeps the earlier of two entries, so a mark can
   only ever make a device pay LESS. */
function mark(w, key, t){
  w = own(w); key = String(key);
  if (!key || w.e[key]) return false;
  t = t == null ? Date.now() : +t;
  w.e[key] = [0, t, 'mark', dayOf(t)];
  return true;
}
/* baseline(w, base, keys): the first time `base` is seen, every key in `keys`
   is marked and `base` with them. Answers whether it did that now. */
function baseline(w, base, keys, t){
  w = own(w);
  if (w.e[base]) return false;
  (keys || []).forEach(function(k){ mark(w, k, t); });
  mark(w, base, t);
  return true;
}
/* Keys that stand for ever (a badge, the welcome, a baseline) are re-asked on
   every check, so they are never folded away: folded, award() would no longer
   see them and would pay them a second time. */
function lasting(k){ return /^(welcome$|bg:|cb:)/.test(k); }

/* spend(w, key, amount, what, paid) -> { ok, why }
   A key already spent is not charged again (the same purchase on two devices
   is one purchase). A balance under the price refuses, which after a merge of
   two devices that both spent offline can mean a negative balance: the shop
   then refuses until it is back above nought, and nothing owned is taken. */
function spend(w, key, amount, what, paid){
  w = own(w); key = String(key); amount = Math.round(+amount || 0);
  if (w.s[key]) return { ok: true, why: 'already' };
  if (amount <= 0) return { ok: false, why: 'nothing' };
  if (balance(w, paid) < amount) return { ok: false, why: 'short' };
  w.s[key] = [amount, Date.now(), what || ''];
  return { ok: true, why: 'spent' };
}

/* Two devices' wallets become one. A union of keys, so it is exact,
   idempotent and order free. Where both hold one key (they should agree) the
   earlier entry stands, so every device settles on the same bytes. */
function merge(a, b){
  a = clean(a); b = clean(b);
  var out = fresh();
  ['e', 's'].forEach(function(m){
    var k, all = {};
    for (k in a[m]) all[k] = a[m][k];
    for (k in b[m]) if (!all[k] || +b[m][k][1] < +all[k][1]) all[k] = b[m][k];
    /* written in key order, so both devices settle on the same bytes */
    Object.keys(all).sort().forEach(function(k2){ out[m][k2] = all[k2]; });
  });
  var dz = {}, d;
  for (d in a.z) dz[d] = 1; for (d in b.z) dz[d] = 1;
  Object.keys(dz).sort().forEach(function(d){ var x = a.z[d] || [0, 0], y = b.z[d] || [0, 0]; out.z[d] = [Math.max(+x[0] || 0, +y[0] || 0), Math.max(+x[1] || 0, +y[1] || 0)]; });
  /* a key folded on one device and still listed on the other would count twice */
  var folded = (a.f || []).concat(b.f || []);
  if (folded.length) { var fs = {}; folded.forEach(function(k){ fs[k] = 1; delete out.e[k]; delete out.s[k]; }); out.f = Object.keys(fs).sort(); }
  return out;
}

/* Fold entries older than AGE into this device's row once there are more than
   MAX, so the slot stays small. The folded keys are remembered (f) for one
   more AGE so a device that has not synced cannot list them a second time. */
var COMPACT_MAX = 2000, COMPACT_AGE = 60 * 864e5;
function compact(w, device, now){
  w = own(w); now = now == null ? Date.now() : now;
  var n = Object.keys(w.e).length + Object.keys(w.s).length;
  if (n <= COMPACT_MAX) return w;
  var z = w.z[device] || [0, 0], f = (w.f || []).slice();
  ['e', 's'].forEach(function(m, i){
    for (var k in w[m]) { var v = w[m][k]; if (!lasting(k) && now - (+v[1] || 0) > COMPACT_AGE) { z[i] += +v[0] || 0; f.push(k); delete w[m][k]; } }
  });
  w.z[device] = z; w.f = f.slice(-4000);
  return w;
}

/* The coin history: the ledger, newest first. */
function history(w, n){
  w = clean(w);
  var rows = [], k;
  /* a mark paid nothing, so it is not a line in anybody's history */
  for (k in w.e) if (+w.e[k][0] > 0) rows.push({ k: k, a: w.e[k][0], t: w.e[k][1], src: w.e[k][2] });
  for (k in w.s) rows.push({ k: k, a: -w.s[k][0], t: w.s[k][1], src: w.s[k][2] });
  rows.sort(function(a, b){ return b.t - a.t; });
  return rows.slice(0, n || 150);
}

/* ─── what each thing pays (base amounts; award() applies the day's rule) ── */

/* career.js's Hall tier ids (HOF_TIERS), so a finish pays off the ending the
   career really got. A snub or no Hall pays the finish and nothing more. */
var HALL_TIER = { hof_first: 1, hof_eventual: 0.75, hof_debate: 0.5, hof_committee: 0.5 };
function seasonCoins(row){
  /* row is a career.js history row: po is how far it went, aw its awards */
  var R = RATE.season, n = R.base, po = row && row.po;
  var rounds = { R2: 1, CF: 2, Finals: 3, Champion: 4 }[po] || 0;
  n += rounds * R.round;
  (row && row.aw || []).forEach(function(a){ if (a === 'star') n += R.allstar; else if (a === 'champ') n += R.title; else n += R.award; });
  return n;
}
function finishCoins(hallTier){ return RATE.finish + Math.round(RATE.hallMax * (HALL_TIER[hallTier] || 0)); }
function runCoins(out){
  var R = RATE.run, n = R.base;
  if (out && out.madePlayoffs) n += R.october;
  n += (out && out.seriesWon || 0) * R.series;
  if (out && out.champion) n += R.title;
  return n;
}
function dailyDraftCoins(out){
  var R = RATE.dd, n = R.base;
  if (out && out.madePlayoffs) n += R.playoffs;
  n += (out && out.seriesWon || 0) * R.series;
  if (out && out.champion) n += R.title;
  return n;
}
function fixCoins(odds){ return RATE.fx.base + Math.round(RATE.fx.odds * Math.max(0, Math.min(1, +odds || 0))); }
function passesCoins(atPar, easy){ return RATE.ps.base + (atPar ? RATE.ps.par : 0) + (easy ? 0 : RATE.ps.noEasy); }
function badgeCoins(tier){ return RATE.badge[tier] || 0; }

/* A piece's WORTH by rarity. Nothing is sold at it any more: every piece is
   pack only (wardrobe.js SHOP.buy refuses). Kept as the scale a rarity is
   valued on, which the idle step and the checks still read. */
function priceOf(item){
  if (!item || item.earn) return 0;
  var r = item.slot === 'idle' ? IDLE_STEP[item.rarity] : item.rarity;
  return PRICE[r] || 0;
}

var API = {
  API_VERSION: API_VERSION,
  RARITIES: RARITIES, PRICE: PRICE, DUPE_REFUND: DUPE_REFUND, EXCHANGE_COST: EXCHANGE_COST, LEG_EXCHANGE_COINS: LEG_EXCHANGE_COINS,
  BUCKETS_ENABLED: BUCKETS_ENABLED, BUCKETS: BUCKETS,
  PACKS: PACKS, BUNDLE_N: BUNDLE_N, BUNDLE_PAY: BUNDLE_PAY, WELCOME: WELCOME, RATE: RATE, FULL_A_DAY: FULL_A_DAY, CQ_DAY_CAP: CQ_DAY_CAP, TAIL: TAIL,
  dayOf: dayOf, fresh: fresh, clean: clean, earned: earned, spent: spent, balance: balance,
  award: award, spend: spend, mark: mark, baseline: baseline, lasting: lasting, HALL_TIER: HALL_TIER, merge: merge, compact: compact, history: history,
  seasonCoins: seasonCoins, finishCoins: finishCoins, runCoins: runCoins, dailyDraftCoins: dailyDraftCoins,
  fixCoins: fixCoins, passesCoins: passesCoins, badgeCoins: badgeCoins, priceOf: priceOf,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_ECON = API;
})();
