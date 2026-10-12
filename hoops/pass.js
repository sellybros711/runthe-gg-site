/* Run The Floor: the Floor Pass, a sixty day season of sixty tiers.
 *
 * window.RTF_PASS, and node can require it (hoops/check-pass.mjs). The plan is
 * hoops/design/ECONOMY.md section 8. The curve, the season length and the two
 * reward lanes are Run The Tour's Tour Pass; the XP rate and the daily cap are
 * the Floor's own, measured against what a typical day pays here.
 *
 * THE FLOOR PASS IS NOT RUN THE FLOOR PRO. Pro (rtf_premium) is the endless
 * puzzles. The pass is a season's cosmetics and buys nothing in the economy.
 *
 * TWO MORE KEYED LOGS ON THE WARDROBE RECORD, beside the pack and daily logs,
 * so two devices merge by union and nothing derivable is stored:
 *
 *   fx  { key: [t, xp, season] }   XP earned, keyed on what earned it
 *   fc  { 'n:tier:lane': [t] }      a tier claimed (or settled after the season)
 *   fq  { n: [t] }                  the paid lane was open to this account in season n
 *
 * XP IS CAPPED PER EASTERN DAY WHEN IT IS READ, never when it is written. Two
 * devices that each earned a full day offline merge to the union of their
 * entries, and the read still credits one day's cap. So the cap holds whatever
 * order anything arrives in.
 *
 * A REWARD IS PAID UNDER A KEY ('fp:n:tier:lane'), coins into the wallet's
 * ledger, shards and free packs into the pack logs, a spin into the daily
 * loop's dg, a piece into own. Claiming twice pays once.
 */
(function(){
'use strict';

var API_VERSION = 1;
var isNode = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';
var X = isNode ? require('./economy.js') : (typeof window !== 'undefined' ? window.RTF_ECON : null);
var PK = isNode ? require('./packs.js') : (typeof window !== 'undefined' ? window.RTF_PACKS : null);

/* The paid lane ships dark (ECONOMY.md section 9): nobody can buy it yet.
   A tester is comped it by the page, so the lane can be seen working. */
var PASS_PAID_ENABLED = false;

function obj(x){ return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function today(t){ return X.dayOf(t); }
function dnum(d){ var p = String(d).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
function dstr(n){ var d = new Date(n * 864e5), p = function(x){ return (x < 10 ? '0' : '') + x; }; return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); }

/* ─── the season ──────────────────────────────────────────────────────────
   Sixty Eastern days from a fixed epoch, so every device agrees which season
   it is without asking anybody. */
var LEN = 60, EPOCH = '2026-10-12', TIERS = 60;
function season(t){
  var el = Math.max(0, dnum(today(t)) - dnum(EPOCH)), n = Math.floor(el / LEN) + 1, day = (el % LEN) + 1;
  var start = dnum(EPOCH) + (n - 1) * LEN;
  return { n: n, day: day, len: LEN, daysLeft: LEN - day + 1, start: dstr(start), end: dstr(start + LEN - 1) };
}
/* Midnight Eastern at the start of a day, as an instant. The season ends at
   the END of its last day, so a countdown runs to the midnight after it. */
function etMidnight(dayN){
  var base = dayN * 864e5;
  try { var h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(base + 12 * 36e5)); return base + (12 - h) * 36e5; }
  catch (e) { return base; }
}
function endsAt(n){ return etMidnight(dnum(EPOCH) + n * LEN); }
function countdown(n, now){
  var ms = Math.max(0, endsAt(n) - (now == null ? Date.now() : now)), s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60, ms: ms };
}

/* ─── the curve ───────────────────────────────────────────────────────────
   Run The Tour's v6 curve: tier 1 costs 800, tier 60 costs 2,000, about
   84,000 XP in all. Nearly flat, so a good day is about a tier all season. */
var C0 = 800, C1 = 20.338;
function cost(t){ return C0 + C1 * (t - 1); }
var CUM = [0];
(function(){ var x = 0; for (var i = 1; i <= TIERS; i++) { x += cost(i); CUM.push(Math.round(x)); } })();
function xpFor(t){ return CUM[Math.max(0, Math.min(TIERS, t | 0))]; }
function tierAt(xp){ var t = 0; while (t < TIERS && xp >= CUM[t + 1]) t++; return t; }

/* ─── XP ──────────────────────────────────────────────────────────────────
   0.13 XP a base coin (what play paid before a Coin Rush doubled it), and a
   quest at its own XP. All of it counts toward one cap of 2,100 a day, so a
   perfectly capped player needs forty days and two million coins of farming
   on one day still moves the track 2,100. */
var XP_RATE = 0.13, DAY_CAP = 2100;
var QUEST_XP = { qd: 60, qda: 100, qw: 400, qwa: 800 };
function ensure(st){ ['fx', 'fc', 'fq'].forEach(function(m){ if (!st[m] || typeof st[m] !== 'object') st[m] = {}; }); return st; }

/* the season's XP: each day's entries summed, then capped */
function days(st, n){
  var by = {};
  var fx = obj(st.fx);
  for (var k in fx) { var v = fx[k]; if ((v[2] | 0) !== n) continue; var d = today(v[0]); by[d] = (by[d] || 0) + Math.max(0, +v[1] || 0); }
  return by;
}
function xp(st, n){ var by = days(st, n), s = 0; for (var d in by) s += Math.min(DAY_CAP, by[d]); return Math.round(s); }
function todayXp(st, t){ var s = season(t), by = days(st, s.n), d = today(t); return Math.min(DAY_CAP, Math.round(by[d] || 0)); }

/* addXp(st, key, amount, t) -> the XP the track actually moved (0 at the cap,
   0 for a key already counted). The season is the one the moment fell in. */
function addXp(st, key, amount, t){
  ensure(st);
  key = String(key); amount = Math.round(+amount || 0);
  if (!key || amount <= 0 || st.fx[key]) return 0;
  t = t == null ? Date.now() : +t;
  var n = season(t).n, before = xp(st, n);
  st.fx[key] = [t, amount, n];
  return xp(st, n) - before;
}
function coinXp(base){ return Math.round(Math.max(0, +base || 0) * XP_RATE); }

/* Quests already paid are read off the logs that paid them (the wallet's
   ledger for coins, the pack credits for the weekly League Pack), and each is
   counted once under its own key. */
function questXp(st, w, t){
  ensure(st);
  var moved = 0, e = obj(w && w.e), pc = obj(st.pc), k, m;
  var take = function(key, at){ m = /^(qd|qda|qw|qwa):/.exec(key); if (!m) return; var a = QUEST_XP[m[1]]; moved += addXp(st, 'q:' + key, a, at); };
  for (k in e) if (/^q/.test(k) && +e[k][0] > 0) take(k, +e[k][1]);
  for (k in pc) if (/^qwa:/.test(k)) take(k, +pc[k][0]);
  return moved;
}

/* ─── the rewards ─────────────────────────────────────────────────────────
   Run The Tour's two lanes, its packs in the Floor's names (base is the
   Streetball Pack, tour the League Pack, champ the Hall of Fame Pack). The
   free lane is real: packs at 5, 10, 20, 30, 40 and 50, the season's pieces at
   15 and 35, and an exclusive fit and a League Pack at 60. The paid lane
   doubles the packs and carries the season's exclusives. */
var FREE_MILE = { 5: { pack: 'street' }, 10: { pack: 'street' }, 20: { pack: 'street' }, 30: { pack: 'street' }, 40: { pack: 'street' },
  25: { spin: 1, shard: ['common', 1], coins: 525 }, 45: { spin: 1, shard: ['rare', 1] }, 50: { pack: 'street', coins: 1500 },
  55: { shard: ['rare', 2] }, 60: { pack: 'league', coins: 3000 } };
var PREM_MILE = { 5: { pack: 'league' }, 8: { spin: 1, shard: ['common', 1], coins: 500 }, 10: { pack: 'street' }, 15: { pack: 'league' },
  18: { spin: 1, coins: 1310 }, 20: { coins: 1500 }, 25: { pack: 'hof' }, 28: { spin: 1, shard: ['rare', 1], coins: 1000 },
  30: { pack: 'league' }, 35: { pack: 'hof' }, 38: { spin: 1, coins: 2210 }, 40: { shard: ['legendary', 1], coins: 2500 },
  45: { pack: 'league' }, 48: { spin: 1, pack: 'hof' }, 50: { pack: 'hof', coins: 2500 }, 53: { pack: 'league' },
  56: { shard: ['legendary', 1] }, 58: { spin: 1, pack: 'hof' }, 60: { coins: 5000 } };
function fallback(t, lane){
  if (lane === 'prem') { if (t % 4 === 0) return { shard: [t >= 32 ? 'epic' : t >= 16 ? 'rare' : 'common', 1], coins: 300 + t * 25 }; return { coins: 500 + t * 45 }; }
  if (t % 5 === 0) return { shard: ['common', 1], coins: 150 + t * 15 };
  return { coins: 200 + t * 22 };
}
/* Per season: its name, its colours and its pieces. A piece named here is an
   exclusive (catalog.js excl), never in a pack or the shop. A season with no
   entry pays the base lanes and no pieces, which is safe and empty: author the
   next season before it starts. */
var SEASONS = {
  1: { name: 'Hardwood Classic', accent: '#f2b632', accent2: '#2c4bd6',
    lede: 'Royal and gold, the way the old barns looked.',
    free: { 15: ['ps1_cap'], 35: ['ps1_long'], 60: ['ps1_track', 'ps1_sweats'] },
    prem: { 10: ['ps1_band'], 20: ['ps1_shades'], 25: ['ps1_hitop'], 30: ['ps1_varsity'], 40: ['ps1_sleeve'], 45: ['ps1_chain'], 50: ['ps1_hoodie'], 60: ['id_tipoff', 'ps1_bomber'] },
    capstone: 'id_tipoff' },
};
function def(n){ return SEASONS[n] || { name: 'Floor Pass', accent: '#e8660f', accent2: '#ffb35a', free: {}, prem: {} }; }
function reward(t, lane, n){
  var base = (lane === 'prem' ? PREM_MILE : FREE_MILE)[t] || fallback(t, lane), r = {};
  for (var k in base) r[k] = Array.isArray(base[k]) ? base[k].slice() : base[k];
  var items = (def(n)[lane] || {})[t];
  if (items && items.length) r.items = items.slice();
  if (!r.coins && !r.pack && !r.shard && !r.spin && !r.items) r.coins = fallback(t, lane).coins;
  return r;
}
/* every piece a season gives, and where */
function pieces(n){
  var d = def(n), out = [];
  ['free', 'prem'].forEach(function(lane){ var m = d[lane] || {}; Object.keys(m).forEach(function(t){ m[t].forEach(function(id){ out.push({ id: id, tier: +t, lane: lane }); }); }); });
  return out.sort(function(a, b){ return a.tier - b.tier; });
}

/* pay one tier under one key: each part is keyed, so a replay pays nothing */
function grant(st, w, key, r, t){
  var got = {};
  if (r.coins && w) { var c = X.award(w, key, r.coins, 'pass', { t: t }); if (c.paid) got.coins = c.amount; }
  if (r.shard && PK.grantShards(st, key, r.shard[0], r.shard[1], t)) got.shard = r.shard;
  if (r.pack && PK.grantCredit(st, key, r.pack, t)) got.pack = r.pack;
  if (r.spin) { if (!st.dg || typeof st.dg !== 'object') st.dg = {}; if (!st.dg[key]) { st.dg[key] = [t == null ? Date.now() : t, r.spin]; got.spin = r.spin; } }
  if (r.items) { if (!st.own || typeof st.own !== 'object') st.own = {}; got.items = []; r.items.forEach(function(id){ if (!st.own[id]) { st.own[id] = t == null ? Date.now() : t; got.items.push(id); } }); }
  return got;
}
function claimed(st, n, tier, lane){ return !!obj(st.fc)[n + ':' + tier + ':' + lane]; }

/* paid(st, n): the paid lane was open to this account during season n */
function paid(st, n){ return !!obj(st.fq)[String(n)]; }
function notePaid(st, n, t){ ensure(st); var k = String(n); if (st.fq[k]) return false; st.fq[k] = [t == null ? Date.now() : t]; return true; }

/* claim(st, w, tier, lane, opts) -> { got } or { err } */
function claim(st, w, tier, lane, opts){
  var o = opts || {}, t = o.t == null ? Date.now() : o.t, n = o.season || season(t).n;
  ensure(st);
  tier = tier | 0;
  if (lane !== 'free' && lane !== 'prem') return { err: 'lane' };
  if (tier < 1 || tier > TIERS) return { err: 'tier' };
  if (tierAt(xp(st, n)) < tier) return { err: 'locked' };
  if (lane === 'prem' && !paid(st, n)) return { err: 'paid' };
  var key = n + ':' + tier + ':' + lane;
  if (st.fc[key]) return { err: 'already' };
  st.fc[key] = [t];
  return { tier: tier, lane: lane, got: grant(st, w, 'fp:' + key, reward(tier, lane, n), t) };
}
/* every reached tier not yet claimed, on every lane open to the account */
function claimAll(st, w, opts){
  var o = opts || {}, t = o.t == null ? Date.now() : o.t, n = o.season || season(t).n, out = [];
  var reach = tierAt(xp(st, n));
  ['free', 'prem'].forEach(function(lane){
    if (lane === 'prem' && !paid(st, n)) return;
    for (var i = 1; i <= reach; i++) if (!claimed(st, n, i, lane)) { var r = claim(st, w, i, lane, { t: t, season: n }); if (r.got) out.push(r); }
  });
  return out;
}
/* claimable(st, n): how many reached tiers are waiting, on the open lanes */
function claimable(st, n, t){
  n = n || season(t).n;
  var reach = tierAt(xp(st, n)), c = 0;
  for (var i = 1; i <= reach; i++) { if (!claimed(st, n, i, 'free')) c++; if (paid(st, n) && !claimed(st, n, i, 'prem')) c++; }
  return c;
}

/* SETTLEMENT. A tier reached in a season that has ended and never claimed is
   delivered, not lost: the free lane always, the paid lane if it was open that
   season. The claims are the ledger, so a second device settles nothing
   twice. Seasons two or more back are let go once they are settled. */
function settle(st, w, t){
  ensure(st);
  t = t == null ? Date.now() : t;
  var cur = season(t).n, seen = {}, paidOut = [], k;
  for (k in st.fx) seen[st.fx[k][2] | 0] = 1;
  Object.keys(seen).map(Number).filter(function(n){ return n > 0 && n < cur; }).forEach(function(n){
    claimAll(st, w, { t: t, season: n }).forEach(function(r){ r.season = n; paidOut.push(r); });
  });
  for (k in st.fx) if ((st.fx[k][2] | 0) < cur - 1) delete st.fx[k];
  for (k in st.fc) if ((+k.split(':')[0] || 0) < cur - 1) delete st.fc[k];
  return paidOut;
}

/* what the screen reads */
function state(st, opts){
  var o = opts || {}, t = o.t == null ? Date.now() : o.t, s = season(t), x = xp(st, s.n), tier = tierAt(x);
  return { season: s, def: def(s.n), xp: x, tier: tier, today: todayXp(st, t), cap: DAY_CAP,
    into: tier >= TIERS ? 0 : x - xpFor(tier), need: tier >= TIERS ? 0 : cost(tier + 1),
    paid: paid(st, s.n), claimable: claimable(st, s.n, t) };
}

/* the logs on the record */
var LOGS = ['fx', 'fc', 'fq'];
function cleanLogs(out, s){
  s = obj(s);
  LOGS.forEach(function(m){ var src = obj(s[m]), dst = out[m] = {}; for (var k in src) { var v = src[k]; if (Array.isArray(v) && typeof v[0] === 'number') dst[k] = v.slice(); } });
  return out;
}
function mergeLogs(out, a, b){
  LOGS.forEach(function(m){
    var all = {}, k, x = obj(a[m]), y = obj(b[m]);
    for (k in x) all[k] = x[k];
    for (k in y) { var p = all[k], q = y[k]; if (!p || q[0] < p[0] || (q[0] === p[0] && JSON.stringify(q) < JSON.stringify(p))) all[k] = q; }
    out[m] = {};
    Object.keys(all).sort().forEach(function(k2){ out[m][k2] = all[k2]; });
  });
  return out;
}
function logCount(s){ var n = 0; LOGS.forEach(function(m){ n += Object.keys(obj(s[m])).length; }); return n; }

var API = {
  API_VERSION: API_VERSION, PASS_PAID_ENABLED: PASS_PAID_ENABLED, LEN: LEN, EPOCH: EPOCH, TIERS: TIERS,
  XP_RATE: XP_RATE, DAY_CAP: DAY_CAP, QUEST_XP: QUEST_XP, SEASONS: SEASONS, LOGS: LOGS,
  season: season, endsAt: endsAt, countdown: countdown, cost: cost, xpFor: xpFor, tierAt: tierAt,
  xp: xp, todayXp: todayXp, addXp: addXp, coinXp: coinXp, questXp: questXp,
  def: def, reward: reward, pieces: pieces, claimed: claimed, paid: paid, notePaid: notePaid,
  claim: claim, claimAll: claimAll, claimable: claimable, settle: settle, state: state,
  cleanLogs: cleanLogs, mergeLogs: mergeLogs, logCount: logCount, ensure: ensure,
};
if (isNode) module.exports = API;
else if (typeof window !== 'undefined') window.RTF_PASS = API;
})();
