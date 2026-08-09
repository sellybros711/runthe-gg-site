/* Run The Arcade — daily play economy (shared wallet)
 *
 * A token = one game play (any game). The daily wallet is SHARED across all
 * games, and its size is the player's tier:
 *   GUEST (no account)      → 1 token/day
 *   FREE ACCOUNT (signed in)→ 3 tokens/day
 *   ARCADE CARD (paid)      → unlimited
 * Tokens refill at local midnight (the same boundary the daily puzzles use) and
 * do NOT bank — each day simply starts at the cap.
 *
 * Guest→account carry-over falls out for free: the wallet is one per-device
 * counter, so a guest who spent their 1 token then signs in has cap jump 1→3
 * while spent stays 1 → 2 left. No reset, no migration.
 *
 * ENTITLEMENT: Arcade Card is the paid membership. Server truth lives in the
 * Supabase `subscriptions` row; board.js mirrors an active/trialing sub into
 * localStorage 'runthegrid_pro', which hasCard() reads. (Key name kept for
 * back-compat; the consumer-facing name is "Arcade Card".)
 *
 * Client-side is UX + the guest gate. For SIGNED-IN users the server RPC
 * (arcade_spend_token) is the real cap — this module never blocks a bypass on
 * its own, it just drives the UI and the guest limit.
 *
 * Fail-safe: pure localStorage, no network, synchronous. window.RTGTokens.
 */
(function(){
  'use strict';
  var LS = window.localStorage;
  var KEY = 'runthegrid_tokens_v3';
  var GAMES = ['table','match','career','oddone','rankit','guess','almamater','crossword','wordsearch'];

  // Tier caps.
  var GUEST_DAILY = 1;
  var USER_DAILY  = 3;

  // Supabase session key (mirrors auth.js). Presence of a session blob = signed in.
  var SB_SESSION_KEY = 'sb-jcrrxqfpdelrmvjuihnm-auth-token';

  // TESTING: unlimited plays for everyone while we run through the games.
  // FLIP TO false before public launch to enforce the guest/account/card tiers.
  // Nothing else references this.
  var TESTING = true;

  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  function hasCard(){ try{ return LS.getItem('runthegrid_pro')==='1'; }catch(e){ return false; } }

  // Synchronous "is there a signed-in session?" — read the Supabase token blob
  // straight from localStorage (no client boot, no network), scanning any
  // sb-*-auth-token key so a lib default-key change can't silently break it.
  function signedIn(){
    try{
      var b=LS.getItem(SB_SESSION_KEY);
      if(b && b.indexOf('access_token')>=0) return true;
      for(var i=0;i<LS.length;i++){
        var k=LS.key(i);
        if(k && k.indexOf('sb-')===0 && /auth-token$/.test(k)){
          var v=LS.getItem(k);
          if(v && v.indexOf('access_token')>=0) return true;
        }
      }
    }catch(e){}
    return false;
  }

  function unlimited(){ return TESTING || hasCard(); }       // no daily cap
  function tier(){ return hasCard() ? 'card' : (signedIn() ? 'account' : 'guest'); }
  function cap(){ if(unlimited()) return Infinity; return signedIn() ? USER_DAILY : GUEST_DAILY; }

  function fresh(){ return { date:todayStr(), plays:{}, sf:0 }; }
  function read(){
    var s;
    try{ s=JSON.parse(LS.getItem(KEY)); }catch(e){ s=null; }
    if(!s || typeof s!=='object') s=fresh();
    if(s.date!==todayStr()) s=fresh();           // new day → refill (local midnight)
    if(!s.plays || typeof s.plays!=='object') s.plays={};
    if(typeof s.sf!=='number') s.sf=0;           // server-synced used floor (anti-bypass)
    return s;
  }
  function write(s){ try{ LS.setItem(KEY, JSON.stringify(s)); }catch(e){} return s; }

  function totalPlays(s){ var n=0; for(var k in s.plays){ if(s.plays.hasOwnProperty(k)) n+=s.plays[k]||0; } return n; }
  // Plays consumed today = the greater of what this device recorded and what the
  // server says (card.js reconciles the floor on load), so clearing localStorage
  // can't hand a signed-in user extra plays.
  function used(){ var s=read(); return Math.max(totalPlays(s), s.sf||0); }
  function playsOf(game){ return read().plays[game]||0; }
  function remaining(){ var c=cap(); return c===Infinity?Infinity:Math.max(0, c - used()); }
  // Raise the server-used floor (never lowers it within a day).
  function setServerUsed(n){ var s=read(); var v=Math.max(0, n|0); if(v>(s.sf||0)){ s.sf=v; write(s); } }
  function triesLeft(){ return remaining(); }                // wallet-wide now (arg ignored)
  function canPlay(){ return remaining()>0; }                // any token left (arg ignored)

  // Spend one token from the shared wallet for `game`.
  // { ok, tryNo, first, bonus, left } — first=true marks the ranked daily attempt
  // (the day's first play of THIS game); replays are practice.
  // Spend on the server too (signed-in, non-card): keeps the server's per-day
  // count authoritative so the client wallet can be reconciled against it. Fire-
  // and-forget; the client stays the fast path, the server is the source of truth.
  function serverSpend(){
    try{
      if(TESTING || hasCard() || !signedIn()) return;
      if(!(window.RTG_BOARD && RTG_BOARD.spendToken)) return;
      RTG_BOARD.spendToken().then(function(res){
        if(!res) return;
        if(res.ok===false) setServerUsed(USER_DAILY);                         // server says out → lock
        else if(typeof res.remaining==='number') setServerUsed(USER_DAILY - res.remaining);
      }).catch(function(){});
    }catch(e){}
  }

  function startAttempt(game){
    var s=read(), before=s.plays[game]||0;
    if(unlimited()){
      s.plays[game]=before+1; write(s);
      return { ok:true, tryNo:before+1, first:(before===0), bonus:(before>0), left:Infinity };
    }
    if(used() >= cap()) return { ok:false, tryNo:before, first:false, bonus:false, left:0 };
    s.plays[game]=before+1; write(s);
    serverSpend();
    return { ok:true, tryNo:before+1, first:(before===0), bonus:false, left:remaining() };
  }

  window.RTGTokens = {
    GAMES: GAMES.slice(),
    GUEST_DAILY: GUEST_DAILY, USER_DAILY: USER_DAILY,
    DAILY: USER_DAILY,                          // back-compat; prefer cap()
    today: todayStr,
    // entitlement + tier
    isPro: hasCard, hasCard: hasCard,           // isPro kept for existing callers
    signedIn: signedIn,
    tier: tier,
    testing: function(){ return TESTING; },
    // wallet
    cap: cap,
    used: used,
    remaining: remaining,
    setServerUsed: setServerUsed,
    playsOf: playsOf,
    triesLeft: triesLeft,
    canPlay: canPlay,
    startAttempt: startAttempt,
    // a compact, tier-aware status string for hints/tiles
    label: function(){
      if(hasCard()) return 'Arcade Card · unlimited';
      if(TESTING)   return 'Testing · unlimited';
      var left=remaining(), c=cap();
      if(left<=0) return signedIn() ? 'No plays left today' : 'No free play left today';
      if(!signedIn()) return left+' free play today';
      return left+' of '+c+' plays left';
    }
  };
})();
