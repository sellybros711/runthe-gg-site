/* Run The Arcade — daily play economy (shared)
 * FREE tier: ONE ranked play per game per day (8 games = 8 plays), resetting
 *   at local midnight. That first play is the day's leaderboard attempt.
 * PRO tier (subscription): unlimited plays + the full past-day archive.
 *   - Entitlement flag: localStorage 'runthegrid_pro' === '1'. board.js syncs
 *     it from the server for signed-in subscribers; the archive page's
 *     preview unlock can also set it during rollout.
 * Fail-safe: pure localStorage, no network. window.RTGTokens.
 */
(function(){
  'use strict';
  var LS = window.localStorage;
  var KEY = 'runthegrid_tokens_v3';
  var GAMES = ['table','match','career','oddone','rankit','guess','crossword','wordsearch'];
  var PER_GAME = 1;                       // ranked play per game per day
  var DAILY = GAMES.length*PER_GAME;      // = 8

  // TESTING: unlimited plays for everyone while we run through the games.
  // FLIP TO false (or delete) before public launch to restore 1 free play/day
  // + Pro-for-unlimited. Nothing else references this.
  var TESTING = true;

  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function isPro(){ try{ return LS.getItem('runthegrid_pro')==='1'; }catch(e){ return false; } }
  function unlimited(){ return TESTING || isPro(); }   // no daily cap

  function fresh(){ return { date:todayStr(), plays:{} }; }
  function read(){
    var s;
    try{ s=JSON.parse(LS.getItem(KEY)); }catch(e){ s=null; }
    if(!s || typeof s!=='object') s=fresh();
    if(s.date!==todayStr()) s=fresh();           // new day → refill
    if(!s.plays || typeof s.plays!=='object') s.plays={};
    return s;
  }
  function write(s){ try{ LS.setItem(KEY, JSON.stringify(s)); }catch(e){} return s; }

  function totalPlays(s){ var n=0; for(var k in s.plays){ if(s.plays.hasOwnProperty(k)) n+=s.plays[k]||0; } return n; }
  function playsOf(game){ return read().plays[game]||0; }
  function remaining(){ if(unlimited()) return Infinity; return Math.max(0, DAILY - Math.min(DAILY, totalPlays(read()))); }
  function triesLeft(game){ if(unlimited()) return Infinity; return Math.max(0, PER_GAME - playsOf(game)); }
  function canPlay(game){ return triesLeft(game)>0; }

  // Spend the day's play for `game`. { ok, tryNo, first, bonus, left } —
  // first=true marks the ranked attempt (pro replays are practice).
  function startAttempt(game){
    var s=read(), before=s.plays[game]||0;
    if(unlimited()){
      s.plays[game]=before+1; write(s);
      return { ok:true, tryNo:before+1, first:(before===0), bonus:(before>0), left:Infinity };
    }
    if(before>=PER_GAME) return { ok:false, tryNo:before, first:false, bonus:false, left:0 };
    s.plays[game]=before+1; write(s);
    return { ok:true, tryNo:before+1, first:(before===0), bonus:false, left:0 };
  }

  window.RTGTokens = {
    DAILY:DAILY, PER_GAME:PER_GAME, BONUS:0, GAMES:GAMES.slice(),
    today:todayStr,
    isPro:isPro,
    remaining:remaining,
    bonusRemaining:function(){ return unlimited()?Infinity:0; },
    playsOf:playsOf,
    triesLeft:triesLeft,
    canPlay:canPlay,
    startAttempt:startAttempt,
    /* short label for hints/tiles */
    label:function(game){
      if(isPro()) return 'Pro · unlimited';
      if(TESTING) return 'Testing · unlimited';
      return playsOf(game)>0 ? 'No plays left' : '1 free play';
    }
  };
})();
