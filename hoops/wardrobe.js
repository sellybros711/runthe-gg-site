/* Run The Floor: what the player owns and what he is wearing.
 *
 * window.RTF_WARD, and node can require it (hoops/check-closet.mjs). The
 * catalogue is hoops/catalog.js (what exists); this is the player's half
 * (what is his). The plan is hoops/design/ECONOMY.md section 5.
 *
 * THE ACCOUNT OWNS THE WARDROBE, the owner's call (decision 4): every career
 * on the account wears from one closet. A career keeps its own body and face
 * (the Look sheet), and nothing here touches either.
 *
 * ONE RECORD, ON THE SHELF. It is localStorage first (rtf.ward.v1) and a merge
 * slot on the account's shelf (hoops/cloud.js, slot `ward`), written through
 * modes-ui.js like every other record. Two devices merge without losing
 * anything:
 *   owned     a union: an item owned on either device is owned
 *   wearing   per look, the later change wins (a timestamp, not a counter:
 *             a loadout is a choice, not progress)
 *   outfits   a union by id, the later edit wins, and a deleted outfit is a
 *             tombstone so a stale device cannot bring it back
 * The progress the shelf compares is what only grows: how many items are
 * owned and how many outfits have ever been made.
 *
 * NOBODY IS EVER DRAWN IN SOMETHING THEY DO NOT OWN. resolve() in catalog.js
 * is the last word on that, so a forged or stale loadout falls back to the
 * starter piece, never to an item the record does not hold.
 *
 * A guest browses and tries anything on, and saves nothing he does not own,
 * which is everything but the starters until he signs in and earns coins
 * (decision 6).
 */
(function(){
'use strict';

var API_VERSION = 1;
var KEY = 'rtf.ward.v1';
var MAX_FITS = 12;
var CAT = typeof require === 'function' && typeof window === 'undefined' ? require('./catalog.js') : (typeof window !== 'undefined' ? window.RTF_CATALOG : null);
/* the pack logs ride on this record (hoops/packs.js says what they are) */
var PK = typeof require === 'function' && typeof window === 'undefined' ? require('./packs.js') : (typeof window !== 'undefined' ? window.RTF_PACKS : null);
/* and the daily loop's logs (hoops/daily.js): the streak, the wheel, the quests */
var DY = typeof require === 'function' && typeof window === 'undefined' ? require('./daily.js') : (typeof window !== 'undefined' ? window.RTF_DAILY : null);
/* and the Floor Pass logs (hoops/pass.js): XP, claims, the paid lane */
var PS = typeof require === 'function' && typeof window === 'undefined' ? require('./pass.js') : (typeof window !== 'undefined' ? window.RTF_PASS : null);

function obj(x){ return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function now(){ return Date.now(); }

/* po, pc, sg, sx: the pack logs (hoops/packs.js); nb: the shop's welcome was read */
function fresh(){ return { v: 1, own: {}, w: { street: {}, court: {}, ts: 0, tc: 0 }, fits: {}, po: {}, pc: {}, sg: {}, sx: {}, nb: 0, dp: {}, dl: {}, dw: {}, dg: {}, de: {}, db: {}, fx: {}, fc: {}, fq: {} }; }
/* Anything read back from storage or the shelf: unknown shapes become empty. */
function clean(s){
  s = obj(s);
  var out = fresh(), k;
  var own = obj(s.own);
  for (k in own) if (CAT && CAT.item(k)) out.own[k] = +own[k] || 1;
  var w = obj(s.w);
  out.w.ts = +w.ts || 0; out.w.tc = +w.tc || 0;
  ['street', 'court'].forEach(function(ctx){
    var lo = obj(w[ctx]);
    for (var slot in lo) if (typeof lo[slot] === 'string' && CAT && CAT.item(lo[slot])) out.w[ctx][slot] = lo[slot];
  });
  var f = obj(s.fits);
  for (k in f) {
    var x = obj(f[k]);
    if (x.del) { out.fits[k] = { del: 1, t: +x.t || 0 }; continue; }
    if (x.ctx !== 'street' && x.ctx !== 'court') continue;
    out.fits[k] = { n: String(x.n || 'Outfit').slice(0, 24), ctx: x.ctx, set: Object.assign({}, obj(x.set)), t: +x.t || 0 };
  }
  if (PK) PK.cleanLogs(out, s);
  if (DY) DY.cleanLogs(out, s);
  if (PS) PS.cleanLogs(out, s);
  return out;
}

/* ─── the record on this device ─────────────────────────────────────────── */
var mem = null, subs = [];
function lsGet(){ try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function load(){ if (!mem) mem = clean(lsGet()); return mem; }
function save(st){
  mem = clean(st);
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {}
  /* modes-ui.js sends it to the shelf: the same door every record uses */
  if (typeof window !== 'undefined' && window.RTF_MODES_UI && window.RTF_MODES_UI.write) window.RTF_MODES_UI.write(KEY);
  subs.forEach(function(fn){ try { fn(mem); } catch (e) {} });
  publish();
  return mem;
}
/* WHAT HE WEARS IS PUBLIC (139): the two loadouts go on the profile row other
   players read, so a board row can draw him dressed. What he OWNS stays in the
   private record. Debounced, because a closet is a run of presses, and sent
   alone, because a database without 139 refuses the call (fails soft). */
var pubT = null, pubLast = '';
function publish(){
  if (typeof window === 'undefined' || !window.RTF_AUTH || !window.RTF_AUTH.setProfile) return;
  clearTimeout(pubT);
  pubT = setTimeout(function(){
    var A = window.RTF_AUTH, st = A.state ? A.state() : null;
    if (!st || !st.signedIn || !mem) return;
    var body = { wearStreet: mem.w.street, wearCourt: mem.w.court }, key = JSON.stringify(body);
    if (key === pubLast) return;
    pubLast = key;
    /* 139 knew the twelve wearable slots and nothing else, so a loadout
       carrying an idle, a nameplate or a backdrop was refused WHOLE there,
       and he went undrawn on every board from the day he picked an idle.
       140 takes them. Against 139 the same loadout is sent again without
       them, so the clothes still go up. */
    var r = A.setProfile(body);
    if (r && r.then) r.then(function(row){
      if (row) return;
      var bare = { wearStreet: wearOnly(body.wearStreet), wearCourt: wearOnly(body.wearCourt) };
      if (JSON.stringify(bare) === key) { pubLast = ''; return; }
      var r2 = A.setProfile(bare);
      if (r2 && r2.then) r2.then(function(row2){ if (!row2) pubLast = ''; });
    });
  }, 1200);
}
function wearOnly(lo){ var out = {}, nw = (CAT && CAT.NOWEAR) || { idle: 1 }; for (var k in lo || {}) if (!nw[k]) out[k] = lo[k]; return out; }
/* The shelf brought a new copy down (modes-ui.js cloudAdopt): read it again. */
function reload(){ mem = null; load(); subs.forEach(function(fn){ try { fn(mem); } catch (e) {} }); }
function onChange(fn){ subs.push(fn); }

/* ─── owning ─────────────────────────────────────────────────────────────── */
/* Owned is the record's items plus everything free, so the starter wardrobe
   needs no grant and cannot be lost. */
function ownedMap(st){
  st = st || load();
  var m = {};
  for (var k in st.own) m[k] = true;
  if (CAT) CAT.ITEMS.forEach(function(it){ if (it.free) m[it.id] = true; });
  return m;
}
function owns(id, st){ return !!ownedMap(st)[id]; }
/* The only way an item becomes his. The shop, a pack, a drop and an earned
   exclusive all come through here. Answers false for one he already has. */
function grant(id, st){
  var save0 = !st;
  st = st || clean(load());
  if (!CAT || !CAT.item(id) || st.own[id]) return false;
  st.own[id] = now();
  if (save0) save(st);
  return true;
}

/* ─── wearing ────────────────────────────────────────────────────────────── */
function slotsOf(ctx){ return ctx === 'court' ? CAT.COURT_SLOTS : CAT.STREET_SLOTS; }
function loadout(ctx, st){ st = st || load(); return Object.assign({}, st.w[ctx === 'court' ? 'court' : 'street']); }
/* Put an item on, or take a slot off (id null). An item not owned, or not
   for this look, is refused: the closet never stores a loadout it would have
   to fall back from. */
function equip(ctx, slot, id){
  var st = clean(load()), lo = st.w[ctx === 'court' ? 'court' : 'street'];
  if (slotsOf(ctx).indexOf(slot) < 0) return false;
  if (id == null) delete lo[slot];
  else {
    var it = CAT.item(id);
    if (!it || it.slot !== slot || !CAT.fits(it, ctx) || !owns(id, st)) return false;
    lo[slot] = id;
  }
  st.w[ctx === 'court' ? 'tc' : 'ts'] = now();
  /* changing the look is a daily quest; a guest's change counts for nothing */
  if (DY && authFn()) { try { DY.note(st, 'look', DY.today()); } catch (e) {} }
  save(st);
  return true;
}
/* Replace a whole look at once (an outfit). Pieces he does not own are dropped. */
function wearSet(ctx, set){
  var st = clean(load()), om = ownedMap(st), lo = {};
  for (var slot in obj(set)) {
    var it = CAT.item(set[slot]);
    if (it && it.slot === slot && CAT.fits(it, ctx) && om[it.id] && slotsOf(ctx).indexOf(slot) >= 0) lo[slot] = it.id;
  }
  st.w[ctx === 'court' ? 'court' : 'street'] = lo;
  st.w[ctx === 'court' ? 'tc' : 'ts'] = now();
  save(st);
  return lo;
}
/* What baller.js draws for a look: slot -> { k, c }. A preview may pass a
   loadout that is not saved, and `tryOn` lets it hold what he does not own. */
function resolved(ctx, lo, tryOn){
  var st = load();
  return CAT.resolve(lo || st.w[ctx === 'court' ? 'court' : 'street'], ctx === 'court' ? 'court' : 'street', tryOn ? true : ownedMap(st));
}
/* Paint options for the invented player, in a look. Never call this for a
   real man: baller.js drops it for a faceless figure anyway. */
function dress(o, ctx, lo, tryOn){
  var out = Object.assign({}, o || {});
  if (!CAT) return out;
  if (ctx === 'street') { out.ctx = 'street'; out.wear = resolved('street', lo, tryOn); }
  else { var cw = resolved('court', lo, tryOn); if (Object.keys(cw).length) out.cwear = cw; }
  return out;
}

/* ─── the idle ──────────────────────────────────────────────────────────────
   One slot in each look, worn like any piece and drawn as motion: the id is a
   hoops/idles.js entry. An idle he does not own (or no idles.js at all) is the
   look's default, which is the old figure: standing off court and the
   standing dribble on court. */
var I = typeof require === 'function' && typeof window === 'undefined' ? require('./idles.js') : (typeof window !== 'undefined' ? window.RTF_IDLES : null);
function idleOf(ctx, lo, tryOn){
  ctx = ctx === 'court' ? 'court' : 'street';
  var dflt = I ? I.DEFAULT[ctx] : (ctx === 'court' ? 'id_dribble' : 'id_stand');
  var id = (lo || loadout(ctx)).idle, it = id && CAT ? CAT.item(id) : null;
  if (!it || it.slot !== 'idle' || !I || !I.isIdle(id) || !(tryOn || owns(id))) return dflt;
  return id;
}
/* paint options for the idle, merged over the caller's: a keyframe idle stands
   ({ pose: 'stand', idle }) and the dribble is pose 'ball', as it always was */
function idle(o, ctx, lo, tryOn){
  var out = Object.assign({}, o || {}), id = idleOf(ctx, lo, tryOn);
  if (!I) { if (id === 'id_dribble') out.pose = 'ball'; return out; }
  var x = I.opts(id);
  if (x.idle) { out.pose = 'stand'; out.idle = x.idle; } else if (x.pose) out.pose = x.pose; else if (out.pose === 'ball') out.pose = 'stand';
  return out;
}

/* ─── outfits ────────────────────────────────────────────────────────────── */
function fits(st){
  st = st || load();
  var out = [];
  for (var id in st.fits) if (!st.fits[id].del) out.push(Object.assign({ id: id }, st.fits[id]));
  return out.sort(function(a, b){ return a.t - b.t; });
}
function saveFit(name, ctx){
  var st = clean(load());
  if (fits(st).length >= MAX_FITS) return null;
  var id = 'o' + now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  st.fits[id] = { n: String(name || 'Outfit').slice(0, 24) || 'Outfit', ctx: ctx === 'court' ? 'court' : 'street', set: loadout(ctx, st), t: now() };
  save(st);
  return id;
}
function applyFit(id){ var f = load().fits[id]; if (!f || f.del) return null; return wearSet(f.ctx, f.set); }
function delFit(id){ var st = clean(load()); if (!st.fits[id]) return false; st.fits[id] = { del: 1, t: now() }; save(st); return true; }

/* ─── two devices ───────────────────────────────────────────────────────── */
function merge(a, b){
  a = clean(a); b = clean(b);
  var out = fresh(), k, own = {}, fts = {};
  for (k in a.own) own[k] = a.own[k];
  for (k in b.own) own[k] = own[k] ? Math.min(own[k], b.own[k]) : b.own[k];
  /* a look is one choice: the later one, whole. Two at the same instant are
     settled on their contents, so the merge is the same in either order. */
  var later = function(x, y, t){ return y.w[t] > x.w[t] || (y.w[t] === x.w[t] && JSON.stringify(y.w[t === 'ts' ? 'street' : 'court']) > JSON.stringify(x.w[t === 'ts' ? 'street' : 'court'])) ? y : x; };
  var ws = later(a, b, 'ts').w, wc = later(a, b, 'tc').w;
  out.w.street = Object.assign({}, ws.street); out.w.ts = ws.ts;
  out.w.court = Object.assign({}, wc.court); out.w.tc = wc.tc;
  for (k in a.fits) fts[k] = a.fits[k];
  for (k in b.fits) { var x = fts[k], y = b.fits[k];
    if (!x || y.t > x.t || (y.t === x.t && (y.del ? 1 : 0) > (x.del ? 1 : 0)) || (y.t === x.t && !!y.del === !!x.del && JSON.stringify(y) > JSON.stringify(x))) fts[k] = y; }
  /* keys in one order, so two merged copies are the same bytes */
  Object.keys(own).sort().forEach(function(k){ out.own[k] = own[k]; });
  Object.keys(fts).sort().forEach(function(k){ out.fits[k] = fts[k]; });
  if (PK) PK.mergeLogs(out, a, b);
  if (DY) DY.mergeLogs(out, a, b);
  if (PS) PS.mergeLogs(out, a, b);
  return out;
}
/* What only grows: items owned, then pack log rows, then outfits ever made (a
   tombstone counts). */
function progress(s){ s = clean(s); return Object.keys(s.own).length * 1e9 + ((PK ? PK.logCount(s) : 0) + (DY ? DY.logCount(s) : 0) + (PS ? PS.logCount(s) : 0)) * 1000 + Math.min(999, Object.keys(s.fits).length); }

/* ─── the coins, on this device ───────────────────────────────────────────
   The ledger and every rule about it is hoops/economy.js; this is only where
   it is kept (rtf.wallet.v1, the shelf's `wallet` slot) and the one door the
   page earns and spends through. */
var WKEY = 'rtf.wallet.v1', wmem = null, wsubs = [];
var X = typeof require === 'function' && typeof window === 'undefined' ? require('./economy.js') : (typeof window !== 'undefined' ? window.RTF_ECON : null);
function wLoad(){ if (!wmem) { var v = null; try { v = JSON.parse(localStorage.getItem(WKEY) || 'null'); } catch (e) {} wmem = X.clean(v || X.fresh()); } return wmem; }
function wSave(w){
  wmem = w;
  try { localStorage.setItem(WKEY, JSON.stringify(w)); } catch (e) {}
  if (typeof window !== 'undefined' && window.RTF_MODES_UI && window.RTF_MODES_UI.write) window.RTF_MODES_UI.write(WKEY);
  wsubs.forEach(function(fn){ try { fn(w); } catch (e) {} });
}
/* ─── paid coins (141), shipped dark ──────────────────────────────────────
   Bought coins live on the server and never in the ledger above until they
   are spent. The balance shown is the ledger plus the server's paid balance;
   a press the ledger cannot cover asks cover(), which spends exactly the
   shortfall on the server under a key and files the same amount in the ledger
   under the same key, so a press sent twice is charged once on both sides.
   With economy.js BUCKETS_ENABLED off, the paid balance is nought and nothing
   is asked. A bucket's packs are free pack credits, keyed on the session. */
var paidBal = 0, paidAsk = 0;
function paidOn(){ return !!(X && X.BUCKETS_ENABLED); }
function paidRefresh(){
  if (!paidOn() || !authFn() || typeof window === 'undefined' || !window.RTF_AUTH || !window.RTF_AUTH.walletState) return Promise.resolve(null);
  var ask = ++paidAsk;
  return window.RTF_AUTH.walletState().then(function(s){
    if (!s || ask !== paidAsk) return null;
    paidBal = Math.max(0, Math.round(+s.balance || 0));
    fileBuys(s.buys || []);
    wsubs.forEach(function(fn){ try { fn(wmem); } catch (e) {} });
    return s;
  }).catch(function(){ return null; });
}
function fileBuys(buys){
  if (!PK || !buys.length) return;
  var st = clean(JSON.parse(JSON.stringify(load()))), did = false;
  buys.forEach(function(b){
    if (!b || b.refunded || !/^[A-Za-z0-9_]{6,200}$/.test(b.session || '')) return;
    (b.packs || []).forEach(function(pk, i){ if (PK.grantCredit(st, 'buy:' + b.session + ':' + i, pk)) did = true; });
  });
  if (did) save(st);
}
function cover(price){
  var need = Math.round(+price || 0) - X.balance(wLoad());
  if (need <= 0) return Promise.resolve({ ok: true, moved: 0 });
  if (!paidOn() || paidBal < need) return Promise.resolve({ ok: false, why: 'coins' });
  var A = typeof window !== 'undefined' ? window.RTF_AUTH : null;
  if (!A || !A.walletSpend) return Promise.resolve({ ok: false, why: 'off' });
  var key = 'top:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return A.walletSpend(key, need).then(function(r){
    if (!r || !r.ok) return { ok: false, why: (r && r.why) || 'error' };
    paidBal = Math.max(0, Math.round(+r.balance || 0));
    var w = X.clean(wLoad()); X.award(w, 'paid:' + key, need, 'paid'); wSave(w);
    return { ok: true, moved: need };
  });
}
var WALLET = {
  KEY: WKEY,
  /* paid coins: the server's balance, and the two doors that move it */
  paid: function(){ return paidOn() ? paidBal : 0; },
  paidRefresh: paidRefresh, cover: cover,
  load: wLoad,
  reload: function(){ wmem = null; wLoad(); wsubs.forEach(function(fn){ try { fn(wmem); } catch (e) {} }); },
  onChange: function(fn){ wsubs.push(fn); },
  balance: function(paid){ return X.balance(wLoad(), paid == null ? WALLET.paid() : paid); },
  /* one award, keyed: replaying it pays nothing */
  award: function(key, amount, src, opts){ var w = X.clean(wLoad()); var r = X.award(w, key, amount, src, opts); if (r.paid) wSave(w); return r; },
  spend: function(key, amount, what, paid){ var w = X.clean(wLoad()); var r = X.spend(w, key, amount, what, paid); if (r.ok) wSave(w); return r; },
  history: function(n){ return X.history(wLoad(), n); },
  has: function(key){ return !!wLoad().e[key]; },
  /* hold keys at nought (see economy.js mark and baseline) */
  baseline: function(base, keys){ var w = X.clean(wLoad()); var did = X.baseline(w, base, keys); if (did) wSave(w); return did; },
  _reset: function(){ wmem = null; wsubs = []; },
};
if (typeof window !== 'undefined') window.RTF_WALLET = WALLET;

/* ─── the shop: buying, packs and the exchange ─────────────────────────────
   The one door that touches BOTH records, so the UI never does. Each call
   works on copies of the wardrobe and the wallet and saves both only when it
   went through. A guest browses and is refused here (decision 6). */
var authFn = function(){ return typeof window !== 'undefined' && !!(window.RTF_AUTH && window.RTF_AUTH.state && window.RTF_AUTH.state().signedIn); };
function both(fn){
  if (!authFn()) return { err: 'signin' };
  if (!PK || !X || !CAT) return { err: 'off' };
  var st = clean(JSON.parse(JSON.stringify(load()))), w = X.clean(JSON.parse(JSON.stringify(wLoad())));
  var r = fn(st, w);
  /* a pack opened or a spin spun can finish a quest, so every call settles them */
  if (r && !r.err && DY) { try { DY.settleQuests(st, w); } catch (e) {} }
  /* and a quest paid is XP on the pass, counted once under its own key */
  if (r && !r.err && PS) { try { PS.questXp(st, w); } catch (e) {} }
  if (r && !r.err) { wSave(w); save(st); }
  return r;
}
var SHOP = {
  /* a piece at its price, keyed so the same purchase on two devices is one */
  buy: function(id){
    return both(function(st, w){
      var it = CAT.item(id);
      if (!it || !CAT.sold(it)) return { err: 'notsold' };
      if (owns(id, st)) return { err: 'owned' };
      var r = X.spend(w, 'buy:' + id, X.priceOf(it), id);
      if (!r.ok) return { err: r.why === 'short' ? 'coins' : r.why };
      st.own[id] = Date.now();
      return { item: it };
    });
  },
  /* opts.credit: open a free pack. A free pack's open is keyed on its credit,
     so two devices opening the same free pack file one open. */
  open: function(pack, opts){
    opts = Object.assign({}, opts || {});
    return both(function(st, w){
      if (opts.credit) { var c = PK.credits(st, pack).filter(function(x){ return opts.credit === true || x.key === opts.credit; })[0]; if (!c) return { err: 'credit' }; opts.credit = c.key; opts.id = 'c:' + c.key; }
      return PK.open(st, w, pack, opts);
    });
  },
  bundle: function(pack, opts){ return both(function(st, w){ return PK.openBundle(st, w, pack, opts); }); },
  exchange: function(rarity, opts){ return both(function(st, w){ return PK.exchange(st, w, rarity, opts); }); },
  /* A press the ledger cannot cover: try it, and if it is short of coins and
     the server holds bought ones, move exactly the shortfall (cover) and try
     once more. Always answers a promise. Off (BUCKETS_ENABLED false) it is the
     press and nothing else. */
  covered: function(price, go){
    var r = go();
    if (!r || r.err !== 'coins' || !(WALLET.paid() > 0)) return Promise.resolve(r);
    return cover(price).then(function(c){ return c && c.ok ? go() : r; }, function(){ return r; });
  },
  choose: function(id, itemId){ return both(function(st){ return PK.choose(st, id, itemId); }); },
  /* the welcome panel was read (merge keeps the later) */
  seenWelcome: function(){ var st = clean(load()); st.nb = Date.now(); save(st); },
  /* reads, for the screen */
  shards: function(){ return PK ? PK.shards(load()) : {}; },
  credits: function(pack){ return PK ? PK.credits(load(), pack) : []; },
  pity: function(){ return PK ? PK.pity(load()) : { sinceEpic: 0, sinceLeg: 0 }; },
  pending: function(){ return PK ? PK.pendingChoice(load()) : null; },
  welcomeSeen: function(){ return !!load().nb; },
  signedIn: function(){ return authFn(); },
  _auth: function(fn){ authFn = fn; },
};

/* ─── the daily loop ─────────────────────────────────────────────────────
   The streak, the login track, the wheel and the quests (hoops/daily.js), on
   the same copies-then-save door as the shop. Every call settles the quests,
   so a quest finished by anything is paid by the next call. */
var dsubs = [];
function dailyDo(fn, kind){
  if (!DY || !PK || !X) return { err: 'off' };
  var r = both(function(st, w){ var x = fn(st, w) || {}; x.quests = DY.settleQuests(st, w); return x; });
  /* the screen says what was just won: a login slot, a streak day, a quest */
  if (r && !r.err) { r.kind = kind; dsubs.forEach(function(f){ try { f(r); } catch (e) {} }); }
  return r;
}
var DAILY = {
  login: function(){ return dailyDo(function(st, w){ return DY.noteLogin(st, w); }, 'login'); },
  /* a daily puzzle or the Daily Draft was finished: the streak's day */
  played: function(ev, key){ return dailyDo(function(st, w){ DY.note(st, ev, key); return DY.notePlayed(st, w); }, 'streak'); },
  note: function(ev, key){ return dailyDo(function(st){ return { fresh: DY.note(st, ev, key) }; }, 'note'); },
  settle: function(){ return dailyDo(function(){ return {}; }, 'note'); },
  spin: function(rankIdx, opts){ return dailyDo(function(st, w){ return DY.spin(st, w, rankIdx, opts); }, 'spin'); },
  on: function(fn){ dsubs.push(fn); },
  streak: function(){ return DY ? DY.streak(load()) : { cur: 0, best: 0, freezes: 0, pos: {}, next: 1 }; },
  spins: function(){ return DY ? DY.spins(load()) : { free: false, banked: 0, total: 0 }; },
  quests: function(){ return DY ? DY.quests(load()) : null; },
  loginPos: function(){ return DY ? DY.loginPos(load(), DY.today()) : 1; },
  logged: function(){ return !!(DY && load().dl[DY.today()]); },
  rushUntil: function(){ return DY ? DY.rushUntil(load()) : 0; },
  rushMult: function(){ return DY && authFn() ? DY.rushMult(load()) : 1; },
  signedIn: function(){ return authFn(); },
};

/* ─── the Floor Pass ─────────────────────────────────────────────────────
   XP, claims and the season's settlement (hoops/pass.js), on the same door.
   The premium lane is open to an account holding the rtf_pass row (bought,
   one a season, expiring at the season's end: 142 and the webhook) or a
   tester the page comps. PASS_PAID_ENABLED says whether it is ON SALE, which
   draws a buy button; it never opens the lane by itself, or turning sales on
   would hand premium to everybody. */
var psubs = [];
var passOwned = false, passAsk = 0;
function passRefresh(force){
  var A = typeof window !== 'undefined' ? window.RTF_AUTH : null;
  if (!authFn() || !A || !A.premiumProducts) { passOwned = false; return Promise.resolve(false); }
  var ask = ++passAsk;
  return A.premiumProducts(force).then(function(prods){
    if (ask !== passAsk || !Array.isArray(prods)) return passOwned;   /* null: no opinion */
    var was = passOwned; passOwned = prods.indexOf('rtf_pass') >= 0;
    if (was !== passOwned) psubs.forEach(function(f){ try { f({ kind: 'owned' }); } catch (e) {} });
    return passOwned;
  }).catch(function(){ return passOwned; });
}
var paidFn = function(){
  if (passOwned && authFn()) return true;
  try { var M = window.RTF_MODES_UI, A = window.RTF_AUTH; return !!(M && M._tester && A && A.state && M._tester(A.state())); } catch (e) { return false; }
};
function passDo(fn, kind){
  if (!PS || !PK || !X) return { err: 'off' };
  var r = both(function(st, w){
    var s = PS.season();
    if (paidFn()) PS.notePaid(st, s.n);
    PS.questXp(st, w);
    var x = fn(st, w) || {};
    x.settled = PS.settle(st, w);
    return x;
  });
  if (r && !r.err) { r.kind = kind; psubs.forEach(function(f){ try { f(r); } catch (e) {} }); }
  return r;
}
var PASS = {
  /* play paid coins: base is what it paid before a Coin Rush doubled it */
  xp: function(key, base){ return passDo(function(st){ return { moved: PS.addXp(st, 'x:' + key, PS.coinXp(base)) }; }, 'xp'); },
  settle: function(){ return passDo(function(){ return {}; }, 'settle'); },
  claim: function(tier, lane){ return passDo(function(st, w){ return PS.claim(st, w, tier, lane); }, 'claim'); },
  claimAll: function(){ return passDo(function(st, w){ return { all: PS.claimAll(st, w) }; }, 'claim'); },
  state: function(){ return PS ? PS.state(load()) : null; },
  claimed: function(tier, lane){ return !!(PS && PS.claimed(load(), PS.season().n, tier, lane)); },
  paidOpen: function(){ return !!(PS && paidFn()); },
  onSale: function(){ return !!(PS && PS.PASS_PAID_ENABLED); },
  owned: function(){ return passOwned; },
  refreshOwned: passRefresh,
  on: function(fn){ psubs.push(fn); },
  signedIn: function(){ return authFn(); },
  _paid: function(fn){ paidFn = fn; },
};

var API = {
  API_VERSION: API_VERSION, KEY: KEY, MAX_FITS: MAX_FITS,
  fresh: fresh, clean: clean, load: load, save: save, reload: reload, onChange: onChange,
  ownedMap: ownedMap, owns: owns, grant: grant,
  slotsOf: slotsOf, loadout: loadout, equip: equip, wearSet: wearSet, resolved: resolved, dress: dress, idleOf: idleOf, idle: idle,
  fits: fits, saveFit: saveFit, applyFit: applyFit, delFit: delFit,
  merge: merge, progress: progress,
  wallet: WALLET, shop: SHOP, daily: DAILY, pass: PASS,
  _reset: function(){ mem = null; subs = []; pubLast = ''; WALLET._reset(); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_WARD = API;
})();
