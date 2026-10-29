/* Run The Floor: where coins are earned, and the one rule over all of it.
 *
 * economy.js says what each thing pays and how a day's play is counted.
 * wardrobe.js keeps the wallet. This file is the POLICY between the game and
 * the wallet, and it is short on purpose:
 *
 *   - Only a signed in account earns. A guest plays everything and keeps
 *     nothing in coins, because a wallet nobody owns cannot follow anybody to a
 *     second device (ECONOMY.md, recommendation 7).
 *   - Every award is KEYED, so asking twice pays once. A results screen redrawn,
 *     a reload, a second device: none of them pays again.
 *   - What was earned before the account had a wallet pays nothing. The badges
 *     held at the first sign in after launch, and the seasons a career had
 *     already played, are marked at nought the first time they are seen
 *     (economy.js baseline), never paid in a lump.
 *
 * Every function here fails soft. A missing wallet, a missing badge module or
 * a thrown error costs coins, never a screen.
 *
 * Exposes window.RTF_EARN, and module.exports for check-earn.mjs.
 */
(function(){
'use strict';

var API_VERSION = 1;

/* node: the checker hands these in through _use; the page reads the globals */
var env = { econ: null, wallet: null, badges: null, signedIn: null, notify: null, ward: null, packs: null };
function X(){ return env.econ || (typeof window !== 'undefined' ? window.RTF_ECON : null); }
function W(){ return env.wallet || (typeof window !== 'undefined' ? window.RTF_WALLET : null); }
function WD(){ return env.ward || (typeof window !== 'undefined' ? window.RTF_WARD : null); }
function PK(){ return env.packs || (typeof window !== 'undefined' ? window.RTF_PACKS : null); }
function BD(){ return env.badges || (typeof window !== 'undefined' ? window.RTF_BADGES : null); }
/* the daily loop's door (wardrobe.js RTF_WARD.daily). A missing one costs the
   streak and the quests, never a coin. */
function DLY(){ var w = WD(); return w && w.daily ? w.daily : null; }
function day1(f){ try { var d = DLY(); if (d && signedIn()) return f(d); } catch (e) {} return null; }
var PLAY_SRC = { run: 1, dd: 1, fx: 1, ps: 1, cq: 1, cqclear: 1, career: 1, endless: 1 };
function signedIn(){
  if (env.signedIn) return !!env.signedIn();
  try { var A = window.RTF_AUTH; return !!(A && A.state && A.state().signedIn); } catch (e) { return false; }
}

/* ─── saying so ─────────────────────────────────────────────────────────────
   Several awards can land on one press (a run and the badges it lit), so they
   are gathered for a moment and said once: "+1,240 coins". */
var said = 0, sayT = null, lastSaid = 0;
function fmt(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function tell(n){
  if (!n) return;
  said += n;
  clearTimeout(sayT);
  sayT = setTimeout(function(){
    var t = said; said = 0; lastSaid = t;
    var msg = '+' + fmt(t) + ' coins';
    try { if (env.notify) env.notify(msg, t); else pop(t); } catch (e) {}
  }, 60);
}
/* ITS OWN PILL, NOT THE PAGE'S TOAST. A mode says something about the moment
   in the same tick (a boss beaten, a deal made) and the toast is one element,
   so a coin line there would write over it. The pill sits under the top bar,
   takes no pointer and goes by itself. */
var popEl = null, popT = null;
function pop(n){
  if (typeof document === 'undefined') return;
  if (!popEl) {
    var css = document.createElement('style');
    css.textContent = '#rtf-coinpop{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 62px);z-index:90;'
      + 'transform:translate(-50%,-8px);opacity:0;pointer-events:none;display:flex;align-items:center;gap:7px;'
      + 'padding:8px 14px 8px 9px;background:linear-gradient(180deg,#2a2210,#15110a);color:#ffe28a;'
      + 'font:400 11px/1 var(--k-f-pixel,system-ui),system-ui;letter-spacing:.02em;font-variant-numeric:tabular-nums;'
      + 'box-shadow:inset 0 0 0 2px #c9a227,inset 0 2px 0 2px rgba(255,226,138,.14),0 3px 0 0 #05070d,0 10px 24px rgba(0,0,0,.5);transition:opacity .2s,transform .2s}'
      + '#rtf-coinpop.on{opacity:1;transform:translate(-50%,0)}'
      + '#rtf-coinpop i{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b0,#e8b923 55%,#9a6f0c);'
      + 'box-shadow:inset 0 0 0 1.5px #7a560a;flex:none}'
      + '@media (prefers-reduced-motion:reduce){#rtf-coinpop{transition:none}}';
    document.head.appendChild(css);
    popEl = document.createElement('div');
    popEl.id = 'rtf-coinpop';
    popEl.setAttribute('role', 'status');
    popEl.setAttribute('aria-live', 'polite');
  }
  if (!popEl.isConnected || popEl.parentNode === document.body) (window.RTF_KIT && RTF_KIT.lane ? RTF_KIT.lane() : document.body).appendChild(popEl);
  popEl.innerHTML = '<i aria-hidden="true"></i><span>+' + fmt(n) + ' coins</span>';
  popEl.classList.add('on');
  clearTimeout(popT);
  popT = setTimeout(function(){ popEl.classList.remove('on'); }, 2400);
}

/* The one door. Answers the economy's result, or { paid: false, why } when
   nothing could be asked. */
function pay(key, amount, src, opts){
  try {
    if (!signedIn()) return { paid: false, amount: 0, why: 'guest' };
    var w = W(); if (!w || !w.award) return { paid: false, amount: 0, why: 'nowallet' };
    /* A COIN RUSH (won on the wheel) doubles what play pays while it runs.
       The award is still keyed, so a reload during the rush pays nothing more. */
    var m = 1;
    if (PLAY_SRC[src] && !w.has(key)) { var d = DLY(); m = d && d.rushMult ? d.rushMult() : 1; if (m > 1) amount = Math.round(amount * m); }
    var r = w.award(key, amount, src, opts);
    if (r && r.paid) { tell(r.amount); if (PLAY_SRC[src] || src === 'badge') passXp(key, r.amount / m); }
    return r;
  } catch (e) { return { paid: false, amount: 0, why: 'error' }; }
}

/* THE FLOOR PASS takes XP off what play and badges paid, before a Coin Rush
   doubled it, keyed on the same key so a replay moves nothing. The daily loop's
   own rewards (the streak, the login track, the wheel, the quests' coins) pay
   no coin XP: a quest is XP of its own (pass.js QUEST_XP). */
function PSD(){ var w = WD(); return w && w.pass ? w.pass : null; }
function passXp(key, base){ try { var p = PSD(); if (p && p.xp) p.xp(key, base); } catch (e) {} }

/* ─── the welcome, and the badges ──────────────────────────────────────────
   Both wait for the shelf. settle() is called once a pull for this account has
   come back, so the wallet already holds whatever another device paid or
   marked, and the career holds every badge the account has. Marking before
   that would mark a badge this device had not heard of yet as new. */
var settled = false;
function earnedIds(career){
  var B = BD(); if (!B || !B.earned) return [];
  try { return B.earned(career || {}); } catch (e) { return []; }
}
function settle(career){
  if (!signedIn()) return null;
  var x = X(), w = W(); if (!x || !w) return null;
  settled = true;
  pay('welcome', x.WELCOME, 'welcome');
  welcomePack();
  day1(function(d){ return d.login(); });
  try { var ps = PSD(); if (ps && ps.settle) ps.settle(); } catch (e) {}
  /* Phase 6, both dark until sold: a bought Floor Pass (the rtf_pass row) opens
     the premium lane, and bought coins are read off the server (141). */
  try { if (ps && ps.refreshOwned) ps.refreshOwned().then(function(o){ if (o) ps.settle(); }); } catch (e) {}
  try { if (w.paidRefresh) w.paidRefresh(); } catch (e) {}
  var got = earnedIds(career);
  if (w.baseline('bg:base', got.map(function(b){ return 'bg:' + b.id; }))) return { baseline: got.length };
  return { paid: badges(career) };
}
/* THE WELCOME STREETBALL PACK, once an account: a free pack credit on the
   wardrobe record, keyed 'welcome', so it is one pack however many devices
   settle. The shop opens it and says the badges already held were counted. */
function welcomePack(){
  try {
    var wd = WD(), pk = PK(); if (!wd || !pk || !wd.load) return false;
    var st = wd.clean(wd.load());
    if (!pk.grantCredit(st, 'welcome', 'street')) return false;
    wd.save(st);
    return true;
  } catch (e) { return false; }
}
/* Every badge the career has and the wallet has not paid. Nothing before the
   baseline exists, so a session that has not settled pays no badges at all:
   the next settle() marks or pays them, whichever is right. */
function badges(career){
  if (!signedIn()) return 0;
  var x = X(), w = W(); if (!x || !w || !w.has || !w.has('bg:base')) return 0;
  var n = 0;
  earnedIds(career).forEach(function(b){
    var r = pay('bg:' + b.id, x.badgeCoins(b.tier), 'badge');
    if (r && r.paid) n += r.amount;
  });
  return n;
}

/* ─── the draft ───────────────────────────────────────────────────────────
   A run is keyed on its seed. The Daily Draft is keyed on its day instead, so
   the day pays once however many devices it is finished on. */
function run(out, rn){
  var x = X(); if (!x || !out || !rn) return null;
  var o = { madePlayoffs: !!out.madePlayoffs, seriesWon: +out.seriesWon || 0, champion: !!out.champion };
  if (rn.daily) { var dr = pay('dd:' + rn.daily, x.dailyDraftCoins(o), 'dd'); day1(function(d){ return d.played('dd', rn.daily); }); return dr; }
  if (rn.seed == null) return null;
  var rr = pay('run:' + rn.seed, x.runCoins(o), 'run');
  day1(function(d){ d.note('run', rn.seed); if (o.champion) d.note('title', rn.seed); return 1; });
  return rr;
}

/* ─── the puzzles and Conquest ────────────────────────────────────────────
   A day's puzzle pays once a day. An endless one pays the small endless rate,
   keyed on its own (negative) number, and counts toward the endless day rule. */
function fix(day, odds, endless){
  var x = X(); if (!x || day == null) return null;
  if (endless) return pay('fxe:' + day, x.RATE.endless, 'endless');
  var r = pay('fx:' + day, x.fixCoins(odds), 'fx');
  day1(function(d){ return d.played('fx', day); });
  return r;
}
function passes(day, atPar, easy, endless){
  var x = X(); if (!x || day == null) return null;
  if (endless) return pay('pse:' + day, x.RATE.endless, 'endless');
  var r = pay('ps:' + day, x.passesCoins(!!atPar, !!easy), 'ps');
  day1(function(d){ if (atPar) d.note('pspar', day); return d.played('ps', day); });
  return r;
}
/* A Conquest win pays on the rung it was won on, so a reload of the same win
   is the same key. The clear is its own source: the day cap is for the wins. */
function conquest(seed, wins, cleared){
  var x = X(); if (!x || seed == null) return 0;
  var n = 0;
  for (var i = 1; i <= wins; i++) { var r = pay('cq:' + seed + ':' + i, x.RATE.cqWin, 'cq'); if (r && r.paid) n += r.amount; }
  day1(function(d){ for (var j = 1; j <= wins; j++) d.note('cq', seed + ':' + j); return 1; });
  if (cleared) { var c = pay('cqc:' + seed, x.RATE.cqClear, 'cqclear'); if (c && c.paid) n += c.amount; }
  return n;
}

/* ─── Career ──────────────────────────────────────────────────────────────
   A season pays when it is filed. A career the account was already playing
   when it first signed in (or that was started as a guest) is baselined: the
   seasons already played are marked, and only the seasons after pay. */
function seasonKey(L, h){ return 'cs:' + L.seed + ':' + h.y; }
function career(L){
  if (!signedIn() || !L || L.seed == null) return 0;
  var x = X(), w = W(); if (!x || !w) return 0;
  var hist = L.history || [];
  if (w.baseline('cb:' + L.seed, hist.map(function(h){ return seasonKey(L, h); }))) return 0;
  var easy = !!(L.opt && L.opt.diff === 'easy'), n = 0;
  hist.forEach(function(h){
    var r = pay(seasonKey(L, h), x.seasonCoins(h), 'career', { easy: easy });
    if (r && r.paid) { n += r.amount; day1(function(d){ return d.note('cs', seasonKey(L, h)); }); }
  });
  return n;
}
/* The finish, off the Hall tier the ending gave. A career that never reached
   the league has no seasons and no finish. */
function finish(L, tier){
  if (!signedIn() || !L || L.seed == null || !(L.history || []).length) return null;
  var x = X(); if (!x) return null;
  career(L);
  day1(function(d){ return d.note('cf', L.seed); });
  return pay('cf:' + L.seed, x.finishCoins(tier || ''), 'career', { easy: !!(L.opt && L.opt.diff === 'easy') });
}

var API = {
  API_VERSION: API_VERSION,
  signedIn: signedIn, pay: pay, settle: settle, badges: badges,
  run: run, fix: fix, passes: passes, conquest: conquest, career: career, finish: finish,
  get settled(){ return settled; },
  get lastSaid(){ return lastSaid; },
  _use: function(o){ for (var k in o) env[k] = o[k]; settled = false; said = 0; clearTimeout(sayT); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_EARN = API;
})();
