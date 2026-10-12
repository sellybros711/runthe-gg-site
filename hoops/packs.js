/* Run The Floor: packs, shards and the exchange.
 *
 * window.RTF_PACKS, and node can require it (hoops/check-packs.mjs). The plan
 * is hoops/design/ECONOMY.md section 7; the prices and odds are economy.js's
 * PACKS, which are Run The Tour's exactly.
 *
 * EVERYTHING HERE IS A KEYED LOG ON THE WARDROBE RECORD (rtf.ward.v1), so two
 * devices merge as a union and nothing is counted twice or lost:
 *   po  opens      id  -> [t, pack, rarity, item, dup, paid, credit]
 *   pc  credits    key -> [t, pack]           a free pack, used by an open
 *   sg  shards     key -> [t, rarity, n]      shards given by a reward
 *   sx  exchanges  id  -> [t, from, n, item, offer, chosen, dup]
 * Pity, the shard balance and the unused credits are DERIVED from those logs,
 * so they are never stored and can never disagree with them.
 *
 * Golf's rules, kept as they are:
 *   - pity is shared across the packs: so many opens without an epic or
 *     better, or a legendary, and the next is one
 *   - a duplicate always gives a shard of its rarity, and gives coins back
 *     (economy.js DUPE_REFUND) only when the pack was bought with coins, so a
 *     free pack can never mint coins
 *   - ten shards of a rarity spin for an item of the next rarity up (one he
 *     does not own if there is one); ten legendary shards are 25,000 coins, a
 *     Hall of Fame Pack and a choice of one of three legendaries
 *   - five packs for the price of four, same pack
 *
 * The coins go through the wallet's spend() and award(), keyed on the open,
 * so the same open on two devices is one charge. An item becomes his through
 * the record's own `own` map, the same door the shop uses.
 */
(function(){
'use strict';

var API_VERSION = 1;
var isNode = typeof require === 'function' && typeof window === 'undefined';
var CAT = isNode ? require('./catalog.js') : (typeof window !== 'undefined' ? window.RTF_CATALOG : null);
var X = isNode ? require('./economy.js') : (typeof window !== 'undefined' ? window.RTF_ECON : null);

var RANK = ['common', 'rare', 'epic', 'legendary'];
var NEXT = { common: 'rare', rare: 'epic', epic: 'legendary' };
var IDS = ['street', 'league', 'hof', 'season'];
var LOGS = ['po', 'pc', 'sg', 'sx'];

function obj(x){ return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function rnd(rng){ return (rng || Math.random)(); }
function uid(){ return Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }
function day(t){ return X.dayOf(t); }

/* ─── the logs on the record ─────────────────────────────────────────────── */
/* Read back from storage or the shelf: only well formed rows survive. */
function cleanLogs(out, s){
  s = obj(s);
  LOGS.forEach(function(m){
    var src = obj(s[m]), dst = out[m] = {};
    for (var k in src) { var v = src[k]; if (Array.isArray(v) && typeof v[0] === 'number') dst[k] = v.slice(); }
  });
  out.nb = +s.nb || 0;
  return out;
}
/* Union by key. Where both hold one key the earlier row stands, except an
   exchange whose legendary was CHOSEN on one device: the choice stands. */
function mergeLogs(out, a, b){
  LOGS.forEach(function(m){
    var all = {}, k, x = obj(a[m]), y = obj(b[m]);
    for (k in x) all[k] = x[k];
    for (k in y) {
      var p = all[k], q = y[k];
      if (!p) { all[k] = q; continue; }
      if (m === 'sx' && !p[5] && q[5]) { all[k] = q; continue; }
      if (m === 'sx' && p[5] && !q[5]) continue;
      if (q[0] < p[0] || (q[0] === p[0] && JSON.stringify(q) < JSON.stringify(p))) all[k] = q;
    }
    out[m] = {};
    Object.keys(all).sort().forEach(function(k2){ out[m][k2] = all[k2]; });
  });
  out.nb = Math.max(+a.nb || 0, +b.nb || 0);
  return out;
}
function logCount(s){ var n = 0; LOGS.forEach(function(m){ n += Object.keys(obj(s[m])).length; }); return n; }
function rows(st, m){ var o = obj(st[m]), out = []; for (var k in o) out.push([k].concat(o[k])); return out.sort(function(a, b){ return a[1] - b[1] || (a[0] < b[0] ? -1 : 1); }); }
function ensure(st){ LOGS.forEach(function(m){ if (!st[m] || typeof st[m] !== 'object') st[m] = {}; }); return st; }

/* ─── what is in a pack ──────────────────────────────────────────────────── */
function liveDrop(d){
  d = d || day();
  var live = (CAT.DROPS || []).filter(function(x){ return d >= x.from && d <= x.to; });
  return live[0] || null;
}
/* Sold items, and a drop's pieces only while the drop is live. */
function pool(d){
  var lv = liveDrop(d);
  return CAT.ITEMS.filter(function(it){ return CAT.sold(it) && (!it.drop || (lv && it.drop === lv.id)); });
}
function packOf(id){ return X.PACKS[id] || null; }
/* the seasonal pack is only on the shelf while a drop is */
function available(id, d){ return !!packOf(id) && (id !== 'season' || !!liveDrop(d)); }
function owned(st, id){ return !!(obj(st.own)[id]) || !!(CAT.item(id) && CAT.item(id).free); }

/* How many opens since the last epic or better, and since the last legendary,
   read off the whole log in time order (pity is shared across the packs). */
function pity(st){
  var e = 0, l = 0;
  rows(st, 'po').forEach(function(r){
    var rar = r[3];
    if (rar === 'legendary') { e = 0; l = 0; }
    else if (rar === 'epic') { e = 0; l++; }
    else { e++; l++; }
  });
  return { sinceEpic: e, sinceLeg: l };
}
function rollRarity(pack, st, rng){
  var P = packOf(pack), p = pity(st);
  if (p.sinceLeg + 1 >= P.pity[1]) return 'legendary';
  if (p.sinceEpic + 1 >= P.pity[0]) return 'epic';
  var r = rnd(rng), a = 0;
  for (var i = 0; i < RANK.length; i++) { a += P.odds[i]; if (r < a) return RANK[i]; }
  return 'common';
}
/* One item of a rarity, stepping down when a rarity is empty. The seasonal
   pack picks from the live drop's pieces dropBias of the time. */
function pickItem(rarity, pack, rng, d, preferUnowned, st){
  var P = packOf(pack) || {}, all = pool(d), lv = liveDrop(d);
  for (var ri = RANK.indexOf(rarity); ri >= 0; ri--) {
    var tier = all.filter(function(it){ return it.rarity === RANK[ri]; });
    if (!tier.length) continue;
    if (P.dropBias && lv && rnd(rng) < P.dropBias) {
      var bt = tier.filter(function(it){ return it.drop === lv.id; });
      if (bt.length) tier = bt;
    }
    if (preferUnowned && st) { var un = tier.filter(function(it){ return !owned(st, it.id); }); if (un.length) tier = un; }
    return tier[Math.floor(rnd(rng) * tier.length)];
  }
  return null;
}

/* ─── shards and free packs, derived ─────────────────────────────────────── */
function shards(st){
  var out = { common: 0, rare: 0, epic: 0, legendary: 0 };
  rows(st, 'po').forEach(function(r){ if (r[5] && out[r[3]] != null) out[r[3]]++; });
  rows(st, 'sg').forEach(function(r){ if (out[r[2]] != null) out[r[2]] += Math.max(0, Math.round(+r[3] || 0)); });
  rows(st, 'sx').forEach(function(r){
    if (out[r[2]] != null) out[r[2]] -= +r[3] || 0;
    var it = r[4] && CAT.item(r[4]); if (r[7] && it) out[it.rarity]++;
  });
  return out;
}
/* Unused free packs: a credit no open has used, oldest first. */
function credits(st, pack){
  var used = {};
  rows(st, 'po').forEach(function(r){ if (r[7]) used[r[7]] = 1; });
  return rows(st, 'pc').filter(function(r){ return !used[r[0]] && (!pack || r[2] === pack); }).map(function(r){ return { key: r[0], pack: r[2], t: r[1] }; });
}
/* A free pack, given once for a key (the welcome, a streak day, a reward). */
function grantCredit(st, key, pack, t){
  ensure(st);
  if (!packOf(pack) || st.pc[key]) return false;
  st.pc[key] = [t == null ? Date.now() : t, pack];
  return true;
}
function grantShards(st, key, rarity, n, t){
  ensure(st);
  if (RANK.indexOf(rarity) < 0 || st.sg[key]) return false;
  st.sg[key] = [t == null ? Date.now() : t, rarity, Math.max(1, Math.round(+n || 1))];
  return true;
}

/* ─── opening ────────────────────────────────────────────────────────────── */
/* One roll and its grant, written into st (and the refund into w). */
function roll(st, w, pack, id, paid, credit, o){
  var t = o.t == null ? Date.now() : o.t;
  var rar = rollRarity(pack, st, o.rng);
  var it = pickItem(rar, pack, o.rng, day(t));
  if (!it) return { err: 'empty' };
  var dup = owned(st, it.id), refund = 0;
  st.po[id] = [t, pack, it.rarity, it.id, dup ? 1 : 0, paid ? 1 : 0, credit || ''];
  if (!dup) { st.own = st.own || {}; st.own[it.id] = t; }
  else if (paid && w) { var r = X.award(w, 'dr:' + id, X.DUPE_REFUND[it.rarity], 'refund', { t: t }); refund = r.paid ? r.amount : 0; }
  return { id: id, item: it, rarity: it.rarity, dup: dup, refund: refund, shard: dup ? it.rarity : null, paid: !!paid };
}
/* open(st, w, pack, opts) -> result or { err }.
   opts.credit: use that free pack (or true for any of this pack's).
   opts.paidCoins: coins the server says were bought (Phase 6), for balance.
   st and w are changed in place; the caller saves both. */
function open(st, w, pack, opts){
  var o = opts || {};
  ensure(st);
  if (!available(pack, day(o.t))) return { err: 'pack' };
  var id = o.id || ('p' + uid()), credit = '';
  if (st.po[id]) return { err: 'already' };
  if (o.credit) {
    var c = credits(st, pack).filter(function(x){ return o.credit === true || x.key === o.credit; })[0];
    if (!c) return { err: 'credit' };
    credit = c.key;
  } else {
    var s = X.spend(w, 'pk:' + id, packOf(pack).price, 'pack:' + pack, o.paidCoins);
    if (!s.ok) return { err: s.why === 'short' ? 'coins' : s.why };
  }
  return roll(st, w, pack, id, !credit, credit, o);
}
/* Five of one pack for the price of four, as one charge. */
function openBundle(st, w, pack, opts){
  var o = opts || {};
  ensure(st);
  if (!available(pack, day(o.t))) return { err: 'pack' };
  var id = o.id || ('b' + uid());
  if (st.po[id + ':0']) return { err: 'already' };
  var s = X.spend(w, 'pkb:' + id, packOf(pack).price * X.BUNDLE_PAY, 'bundle:' + pack, o.paidCoins);
  if (!s.ok) return { err: s.why === 'short' ? 'coins' : s.why };
  var out = [];
  for (var i = 0; i < X.BUNDLE_N; i++) {
    var r = roll(st, w, pack, id + ':' + i, true, '', o);
    if (r.err) return r;
    out.push(r);
  }
  return { id: id, results: out };
}

/* ─── the exchange ───────────────────────────────────────────────────────── */
/* exchange(st, w, rarity, opts) -> { item, dup } or, for legendary, { offer }. */
function exchange(st, w, rarity, opts){
  var o = opts || {};
  ensure(st);
  if (RANK.indexOf(rarity) < 0) return { err: 'rarity' };
  if (shards(st)[rarity] < X.EXCHANGE_COST) return { err: 'shards' };
  var id = o.id || ('x' + uid()), t = o.t == null ? Date.now() : o.t;
  if (st.sx[id]) return { err: 'already' };
  if (rarity === 'legendary') {
    /* three legendaries to choose from, unowned first, never the same twice */
    var offer = [], tries = 0;
    while (offer.length < 3 && tries++ < 60) {
      var it = pickItem('legendary', 'hof', o.rng, day(t), true, st);
      if (it && offer.indexOf(it.id) < 0) offer.push(it.id);
    }
    st.sx[id] = [t, 'legendary', X.EXCHANGE_COST, '', offer, '', 0];
    X.award(w, 'lx:' + id, X.LEG_EXCHANGE_COINS, 'exchange', { t: t });
    grantCredit(st, 'lx:' + id, 'hof', t);
    return { id: id, offer: offer.map(function(x){ return CAT.item(x); }), coins: X.LEG_EXCHANGE_COINS, pack: 'hof' };
  }
  var won = pickItem(NEXT[rarity], 'street', o.rng, day(t), true, st);
  if (!won) return { err: 'empty' };
  var dup = owned(st, won.id);
  st.sx[id] = [t, rarity, X.EXCHANGE_COST, won.id, 0, '', dup ? 1 : 0];
  if (!dup) { st.own = st.own || {}; st.own[won.id] = t; }
  return { id: id, item: won, dup: dup };
}
/* The legendary exchange's choice, once. A legendary already owned gives a
   legendary shard back. */
function choose(st, id, itemId){
  ensure(st);
  var r = st.sx[id];
  if (!r || r[1] !== 'legendary' || r[5] || !Array.isArray(r[4]) || r[4].indexOf(itemId) < 0) return { err: 'choice' };
  var dup = owned(st, itemId);
  r[3] = itemId; r[5] = Date.now(); r[6] = dup ? 1 : 0;
  if (!dup) { st.own = st.own || {}; st.own[itemId] = Date.now(); }
  return { item: CAT.item(itemId), dup: dup };
}
/* a legendary exchange waiting on its choice (a reload in the middle of one) */
function pendingChoice(st){
  var p = rows(st, 'sx').filter(function(r){ return r[2] === 'legendary' && !r[6] && Array.isArray(r[5]) && r[5].length; })[0];
  return p ? { id: p[0], offer: p[5].map(function(x){ return CAT.item(x); }).filter(Boolean) } : null;
}

/* The odds as a reader sees them, printed on every pack. */
function oddsText(pack){
  var P = packOf(pack); if (!P) return '';
  return RANK.map(function(r, i){ return Math.round(P.odds[i] * 100) + '% ' + r; }).join(' · ');
}

var API = {
  API_VERSION: API_VERSION, IDS: IDS, RANK: RANK, NEXT: NEXT, LOGS: LOGS,
  cleanLogs: cleanLogs, mergeLogs: mergeLogs, logCount: logCount,
  pool: pool, liveDrop: liveDrop, packOf: packOf, available: available, oddsText: oddsText,
  pity: pity, rollRarity: rollRarity, pickItem: pickItem,
  shards: shards, credits: credits, grantCredit: grantCredit, grantShards: grantShards,
  open: open, openBundle: openBundle, exchange: exchange, choose: choose, pendingChoice: pendingChoice,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_PACKS = API;
})();
