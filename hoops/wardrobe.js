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

function obj(x){ return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function now(){ return Date.now(); }

function fresh(){ return { v: 1, own: {}, w: { street: {}, court: {}, ts: 0, tc: 0 }, fits: {} }; }
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
    var r = A.setProfile(body);
    if (r && r.then) r.then(function(row){ if (!row) pubLast = ''; });
  }, 1200);
}
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
  return out;
}
/* What only grows: items owned, then outfits ever made (a tombstone counts). */
function progress(s){ s = clean(s); return Object.keys(s.own).length * 1000 + Math.min(999, Object.keys(s.fits).length); }

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
var WALLET = {
  KEY: WKEY,
  load: wLoad,
  reload: function(){ wmem = null; wLoad(); wsubs.forEach(function(fn){ try { fn(wmem); } catch (e) {} }); },
  onChange: function(fn){ wsubs.push(fn); },
  balance: function(paid){ return X.balance(wLoad(), paid); },
  /* one award, keyed: replaying it pays nothing */
  award: function(key, amount, src, opts){ var w = X.clean(wLoad()); var r = X.award(w, key, amount, src, opts); if (r.paid) wSave(w); return r; },
  spend: function(key, amount, what, paid){ var w = X.clean(wLoad()); var r = X.spend(w, key, amount, what, paid); if (r.ok) wSave(w); return r; },
  history: function(n){ return X.history(wLoad(), n); },
  _reset: function(){ wmem = null; wsubs = []; },
};
if (typeof window !== 'undefined') window.RTF_WALLET = WALLET;

var API = {
  API_VERSION: API_VERSION, KEY: KEY, MAX_FITS: MAX_FITS,
  fresh: fresh, clean: clean, load: load, save: save, reload: reload, onChange: onChange,
  ownedMap: ownedMap, owns: owns, grant: grant,
  slotsOf: slotsOf, loadout: loadout, equip: equip, wearSet: wearSet, resolved: resolved, dress: dress,
  fits: fits, saveFit: saveFit, applyFit: applyFit, delFit: delFit,
  merge: merge, progress: progress,
  wallet: WALLET,
  _reset: function(){ mem = null; subs = []; pubLast = ''; WALLET._reset(); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_WARD = API;
})();
