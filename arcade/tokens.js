/* Run The Arcade - play entitlement (per game, per day)
 *
 * THE MODEL
 *   SIGNED OUT           → nothing is playable. The hub browses fine; any PLAY
 *                          asks for a free account first.
 *   FREE ACCOUNT         → the four free games, one play each per day:
 *                          Daily Crossword, Sportegories, Alma Mater, Career Path.
 *                          The other eight are Arcade Card only.
 *   ARCADE CARD (paid)   → all twelve, unlimited, plus the Archive.
 *
 * This replaces the old shared wallet (guest 1/day, account 3/day). The cap is
 * no longer a pool you spend anywhere: it is per game, so a free player always
 * has four distinct things to come back to tomorrow, and the eight premium games
 * are locked rather than rationed. Plays reset at local midnight, the same
 * boundary the daily puzzles use, and do NOT bank.
 *
 * WHY THESE FOUR: every one of them makes you PRODUCE the answer. You type a
 * name, a college, a word into a grid; nothing on screen can be tapped until it
 * turns green. That is what the two most-played games have in common, and it is
 * the habit worth giving away, because a player who can do it comes back.
 * Common Ground was the odd one out here and moved behind the card with the
 * other recognition games - High Low, Odd One Out, Guess the Player, Rank It,
 * the Number Game.
 *
 * ENTITLEMENT: Arcade Card is the paid membership. Server truth lives in the
 * Supabase `subscriptions` row; board.js mirrors an active/trialing sub into
 * localStorage 'runthegrid_pro', which hasCard() reads. (Key name kept for
 * back-compat; the consumer-facing name is "Arcade Card".)
 *
 * Client-side is UX + the lock. For SIGNED-IN users the server RPC
 * (arcade_spend_game) is the real cap - this module never blocks a bypass on
 * its own, it just drives the UI. See supabase/71_arcade_free_games.sql.
 *
 * Fail-safe: pure localStorage, no network, synchronous. window.RTGTokens.
 */
(function(){
  'use strict';
  var LS = window.localStorage;
  var KEY = 'runthegrid_tokens_v3';
  var GAMES = ['match','crossword','highlow','oddone','sportegories','career','guess','rankit','almamater','table','rollcall','chain'];

  // The four free games, in the order the hub lists them (daily pair first,
  // then the streak pair). Everything not in here is Arcade Card only.
  // The REAL gate is public.arcade_free_games() in the database; this copy only
  // paints the locks. Nothing reconciles one against the other at runtime, so a
  // difference between them shows FREE on a game the spend RPC then refuses.
  // scripts/check-freegames.mjs fails the build if they drift.
  // See supabase/84_free_games_crossword.sql.
  var FREE_LIST = ['crossword','sportegories','almamater','career'];
  var FREE = {};
  for (var fi=0; fi<FREE_LIST.length; fi++) FREE[FREE_LIST[fi]] = 1;

  // One play per free game per day. Not a pool: four games, four separate ones.
  var PER_GAME_DAILY = 1;

  // Supabase session key (mirrors auth.js). Presence of a session blob = signed in.
  var SB_SESSION_KEY = 'sb-jcrrxqfpdelrmvjuihnm-auth-token';

  // TESTING: unlimited plays for everyone while we run through the games.
  // LAUNCH: false - the signed-out / free-four / card tiers are enforced.
  // Flip back to true only to demo without limits. Nothing else references this.
  var TESTING = false;

  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  // An Arcade Card is tied to an account, so it only counts when signed in. This
  // also means a stale 'runthegrid_pro' flag (e.g. a browser that was once a
  // cardholder, now browsing signed-out) can't masquerade as a member. board.js
  // reconciles the flag against the server once signed in.
  function hasCard(){ try{ return signedIn() && LS.getItem('runthegrid_pro')==='1'; }catch(e){ return false; } }

  // Synchronous "is there a signed-in session?" - read the Supabase token blob
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

  function unlimited(){ return TESTING || hasCard(); }       // no cap, no lock
  function tier(){ return hasCard() ? 'card' : (signedIn() ? 'free' : 'guest'); }
  function isFreeGame(game){ return !!FREE[game]; }

  // Is this game open to this player at all (ignoring today's plays)? A locked
  // game wants the Arcade Card offer; an unlocked one that is merely used up
  // wants "come back tomorrow". Two different screens, so two different checks.
  function unlocked(game){
    if(unlimited()) return true;
    if(!signedIn()) return false;
    return isFreeGame(game);
  }
  function locked(game){ return !unlocked(game); }
  // "Is this game behind the card for this player?" - unlike locked(), a signed
  // OUT visitor is not locked out of the free four, they just need an account.
  // The hub shows locks with this, so a visitor sees four games on offer and eight
  // to buy, rather than twelve closed doors.
  function cardOnly(game){ return !unlimited() && !isFreeGame(game); }

  // Lifetime totals (never reset at midnight) - powers the Arcade Card's
  // achievements + "most played", and the recency order on the hub for members.
  // Separate key from the daily wallet.
  var LKEY='rtg:lifetime:v1';
  function readLife(){
    var s; try{ s=JSON.parse(LS.getItem(LKEY)); }catch(e){ s=null; }
    if(!s || typeof s!=='object') s={ plays:{}, perfect:0, since:todayStr() };
    if(!s.plays || typeof s.plays!=='object') s.plays={};
    if(!s.last  || typeof s.last !=='object') s.last={};      // game → last-played ms
    if(typeof s.perfect!=='number') s.perfect=0;
    if(!s.since) s.since=todayStr();
    return s;
  }
  function writeLife(s){ try{ LS.setItem(LKEY, JSON.stringify(s)); }catch(e){} return s; }
  function bumpLife(game){
    var s=readLife();
    s.plays[game]=(s.plays[game]||0)+1;
    s.last[game]=Date.now();
    writeLife(s);
  }
  // Count a perfect day (all nine cleared) once, keyed on the date so repeat
  // hub visits the same day don't double-count. Called by the hub.
  function recordPerfect(){ var s=readLife(); var t=todayStr(); if(s.lastPerfect===t) return; s.lastPerfect=t; s.perfect=(s.perfect||0)+1; writeLife(s); }

  // game → ms of the last play ever (0 = never). Members' hub sorts on this so
  // the game you opened last sits at the front of the line next time.
  function lastPlayed(){
    var s=readLife(), out={};
    for(var i=0;i<GAMES.length;i++) out[GAMES[i]] = s.last[GAMES[i]] || 0;
    return out;
  }
  // Sort a list of game keys for display. Members: most recently played first,
  // never-played after (holding their given order). Everyone else: the free four
  // first, in FREE_LIST order, then the rest as given.
  function order(list){
    var keys = (list && list.length) ? list.slice() : GAMES.slice();
    var pos = {}; for(var i=0;i<keys.length;i++) pos[keys[i]]=i;
    if(hasCard()){
      var last = lastPlayed();
      return keys.sort(function(a,b){
        var la=last[a]||0, lb=last[b]||0;
        if(la!==lb) return lb-la;                      // newest first
        return pos[a]-pos[b];                          // never played: keep order
      });
    }
    return keys.sort(function(a,b){
      var fa=FREE[a]?FREE_LIST.indexOf(a):99, fb=FREE[b]?FREE_LIST.indexOf(b):99;
      if(fa!==fb) return fa-fb;
      return pos[a]-pos[b];
    });
  }

  function fresh(){ return { date:todayStr(), plays:{}, sf:{}, bonus:0 }; }
  function read(){
    var s;
    try{ s=JSON.parse(LS.getItem(KEY)); }catch(e){ s=null; }
    if(!s || typeof s!=='object') s=fresh();
    if(s.date!==todayStr()) s=fresh();           // new day → refill (local midnight)
    if(!s.plays || typeof s.plays!=='object') s.plays={};
    // sf = server-synced used floor, per game (anti-bypass). The v3 wallet stored
    // a single number here; coerce so an upgrading device doesn't throw.
    if(!s.sf || typeof s.sf!=='object') s.sf={};
    // bonus = extra attempts on EACH free game today, earned by referrals.
    // Set from the server's arcade_game_status (card.js reconcile); resets with
    // the day like everything else in this blob.
    if(typeof s.bonus!=='number' || s.bonus<0) s.bonus=0;
    return s;
  }
  // Today's referral bonus: how many extra goes each free game gets. Read from
  // the local wallet, which card.js keeps in step with the server.
  function bonusToday(){ return read().bonus||0; }
  // Server truth for today's bonus (from arcade_game_status). card.js only
  // calls this with a real status object, so a flaky network read is a no-call,
  // not a 0; following the server exactly (0 included) is therefore safe and
  // also self-heals a local/NY date skew.
  function setServerBonus(n){
    var v=Math.max(0, n|0), s=read();
    if(v!==(s.bonus||0)){ s.bonus=v; write(s); emit('rtg:tokens'); }
  }
  function write(s){ try{ LS.setItem(KEY, JSON.stringify(s)); }catch(e){} return s; }

  // Plays consumed today for one game = the greater of what this device recorded
  // and what the server says (card.js reconciles the floor on load), so clearing
  // localStorage can't hand a signed-in user extra plays.
  function playsOf(game){ var s=read(); return Math.max(s.plays[game]||0, s.sf[game]||0); }
  function used(){
    var s=read(), seen={}, n=0, k;
    for(k in s.plays){ if(s.plays.hasOwnProperty(k) && !seen[k]){ seen[k]=1; n+=Math.max(s.plays[k]||0, s.sf[k]||0); } }
    for(k in s.sf){    if(s.sf.hasOwnProperty(k)    && !seen[k]){ seen[k]=1; n+=Math.max(s.plays[k]||0, s.sf[k]||0); } }
    return n;
  }

  function capOf(game){
    if(unlimited()) return Infinity;
    if(!unlocked(game)) return 0;
    // A free game gets its one daily play plus any referral bonus earned today.
    // The bonus lifts every free game, matching the server (arcade_spend_game
    // computes the same 1 + bonus), so the client never offers a play the
    // server will refuse.
    return PER_GAME_DAILY + bonusToday();
  }
  function remainingOf(game){ var c=capOf(game); return c===Infinity?Infinity:Math.max(0, c-playsOf(game)); }
  // Wallet-wide view, kept for the odd caller that wants "anything left at all".
  function cap(){ if(unlimited()) return Infinity; return signedIn() ? FREE_LIST.length*(PER_GAME_DAILY+bonusToday()) : 0; }
  function remaining(game){
    if(game) return remainingOf(game);
    if(unlimited()) return Infinity;
    var n=0; for(var i=0;i<FREE_LIST.length;i++) n+=remainingOf(FREE_LIST[i]);
    return n;
  }
  // Raise the server-used floor for one game (never lowers it within a day).
  function setServerUsed(game, n){
    if(typeof game!=='string'){ return; }          // old (total-only) signature: ignore
    var s=read(), v=Math.max(0, n|0);
    if(v>(s.sf[game]||0)){ s.sf[game]=v; write(s); emit('rtg:tokens'); }
  }
  // Apply a whole {game: plays} map from arcade_game_status().
  function setServerPlays(map){
    if(!map || typeof map!=='object') return;
    var s=read(), touched=false;
    for(var g in map){
      if(!map.hasOwnProperty(g)) continue;
      var v=Math.max(0, map[g]|0);
      if(v>(s.sf[g]||0)){ s.sf[g]=v; touched=true; }
    }
    if(touched){ write(s); emit('rtg:tokens'); }
  }
  function triesLeft(game){ return remainingOf(game); }
  function canPlay(game){
    if(unlimited()) return true;
    if(!signedIn()) return false;
    if(!game) return remaining()>0;                // no game named: anything left?
    if(!isFreeGame(game)) return false;
    return playsOf(game) < capOf(game);            // capOf folds in today's bonus
  }

  // Spend this game's play for today.
  // { ok, tryNo, first, bonus, left, reason } - first=true marks the ranked daily
  // attempt (the day's first play of THIS game); replays are practice.
  // reason ('signin' | 'card' | 'spent') tells the caller which wall to show.
  // Spend on the server too (signed-in, non-card): keeps the server's per-day,
  // per-game count authoritative so the client wallet can be reconciled against
  // it. Fire-and-forget; the client stays the fast path, the server is truth.
  // The server's verdict on the attempt currently in progress. Both flags are
  // cleared at the top of every startAttempt.
  //
  // There are two very different reasons arcade_spend_game says no, and treating
  // them the same threw away honest wins:
  //
  //   DENIED  - the wallet was wrong. 'card_only' or 'not_signed_in' means the
  //             client thought this game was open when it was not, so the run it
  //             covers must not reach a leaderboard at all.
  //   REPLAY  - 'spent'. The player is genuinely entitled to this game, they have
  //             simply already had today's go. That happens without any cheating:
  //             a cleared cache, a second device, a sign-out (which now wipes the
  //             local wallet) all resurrect the client counter while the server's
  //             stands. Refusing to submit meant they finished the puzzle, won,
  //             and watched an empty board with nothing said. Now the run posts
  //             flagged as a replay: grid_submit_run keeps the day's first row
  //             and will not let a repeat of a board you have already seen
  //             improve it, so the honest case lands and the exploit does not.
  var DENIED=false, REPLAY=false;
  function emit(name){ try{ document.dispatchEvent(new Event(name)); }catch(e){} }
  function serverSpend(game){
    try{
      if(TESTING || hasCard() || !signedIn()) return;
      if(!(window.RTG_BOARD && RTG_BOARD.spendToken)) return;
      RTG_BOARD.spendToken(game).then(function(res){
        if(!res) return;                                                      // offline → client wallet governs
        if(res.ok===false){
          setServerUsed(game, PER_GAME_DAILY);
          if(res.reason==='spent') REPLAY=true; else DENIED=true;
          emit('rtg:tokens'); emit('rtg:denied');
        }
        else if(typeof res.used==='number') setServerUsed(game, res.used);
      }).catch(function(){});
    }catch(e){}
  }

  function why(game){
    if(!signedIn()) return 'signin';
    if(!unlocked(game)) return 'card';
    return 'spent';
  }


  /* GA4: one event when a play actually starts, tagged with the specific arcade
     game so each game can be reported on its own. Inert if gtag is absent. */
  var GA_LABEL = {'match':'Common Ground','crossword':'Daily Crossword','guess':'Guess the Player','table':'Number Game','oddone':'Odd One Out','career':'Career Path','rankit':'Rank It','almamater':'Alma Mater','sportegories':'Sportegories','highlow':'High Low'};
  function gaGame(ev, game, extra){
    try{
      if (typeof window.gtag !== 'function') return;
      var p = { arcade_game: GA_LABEL[game] || game, game_name: 'Run The Arcade' };
      if (extra) for (var k in extra) p[k] = extra[k];
      window.gtag('event', ev, p);
    }catch(e){}
  }
  function startAttempt(game){
    var s=read(), before=s.plays[game]||0;
    DENIED=false; REPLAY=false;
    if(unlimited()){
      s.plays[game]=before+1; write(s); bumpLife(game); emit('rtg:tokens');
      gaGame('arcade_game_started', game, { tier:'card', try_no:before+1 });
      return { ok:true, tryNo:before+1, first:(before===0), bonus:(before>0), left:Infinity };
    }
    if(!canPlay(game)){ gaGame('arcade_play_blocked', game, { reason:String(why(game)||'') });
      return { ok:false, tryNo:before, first:false, bonus:false, left:0, reason:why(game) }; }
    s.plays[game]=before+1; write(s); bumpLife(game); emit('rtg:tokens');
    gaGame('arcade_game_started', game, { tier:'free', try_no:before+1 });
    serverSpend(game);
    return { ok:true, tryNo:before+1, first:(before===0), bonus:false, left:remainingOf(game) };
  }
  // May this attempt's result reach a board at all? False only when the server
  // refused a play the client had no right to. Offline, card and replay plays
  // all stay true.
  function rankAuthorized(){ return !DENIED; }
  // Is this attempt a repeat of a game already spent on the server today? The
  // run still posts; it just cannot overwrite a row that is already there.
  function replaying(){ return REPLAY; }

  // A compact, tier-aware status chunk for hints/tiles. No trailing "today":
  // hint() adds it where it belongs, so nothing reads "Sign in to play today".
  function label(game){
    if(hasCard()) return 'Arcade Card · unlimited';
    if(TESTING)   return 'Testing · unlimited';
    if(!signedIn()) return 'Free account to play';
    if(!isFreeGame(game)) return 'Arcade Card game';
    return remainingOf(game)>0 ? 'Your free play' : 'Free play used';
  }
  // Short "why you can't play" text for a toast or a disabled button. There are
  // three refusals now, not one, and "No plays left today" was only ever right
  // for the third: a signed-out visitor never had a play, and a card-only game
  // is not something you ran out of.
  function blockMsg(game){
    var r=why(game);
    if(r==='signin') return 'Free account to play';
    if(r==='card')   return 'Arcade Card game';
    return 'That was today’s go';
  }

  // The full sentence a locked board prints where the hint line usually goes.
  function lockLine(game){
    var r=why(game);
    if(r==='signin') return 'Create a free account to play.';
    if(r==='card')   return 'This one is on the Arcade Card.';
    return 'That was today’s go. Back tomorrow.';
  }

  // The full phrase games print after " · ". Only the counted states take "today".
  function hint(game){
    var l=label(game);
    if(hasCard() || TESTING) return l;
    if(!signedIn() || !isFreeGame(game)) return l;
    return l+' today';
  }

  window.RTGTokens = {
    GAMES: GAMES.slice(),
    FREE_GAMES: FREE_LIST.slice(),
    PER_GAME_DAILY: PER_GAME_DAILY,
    DAILY: PER_GAME_DAILY,                      // back-compat; prefer capOf()
    today: todayStr,
    // entitlement + tier
    isPro: hasCard, hasCard: hasCard,           // isPro kept for existing callers
    signedIn: signedIn,
    tier: tier,
    testing: function(){ return TESTING; },
    isFreeGame: isFreeGame,
    unlocked: unlocked,
    locked: locked,
    cardOnly: cardOnly,
    why: why,
    // plays
    cap: cap,
    capOf: capOf,
    used: used,
    remaining: remaining,
    remainingOf: remainingOf,
    setServerUsed: setServerUsed,
    setServerPlays: setServerPlays,
    bonusToday: bonusToday,
    setServerBonus: setServerBonus,
    playsOf: playsOf,
    triesLeft: triesLeft,
    canPlay: canPlay,
    startAttempt: startAttempt,
    rankAuthorized: rankAuthorized,
    replaying: replaying,
    // ordering (hub)
    lastPlayed: lastPlayed,
    order: order,
    // lifetime totals (Arcade Card)
    lifetime: readLife,
    recordPerfect: recordPerfect,
    label: label,
    hint: hint,
    blockMsg: blockMsg,
    lockLine: lockLine
  };
})();
