/* RunTheGrid — daily play economy (shared)
 * FREE tier: 10 plays/day = 1 play per game (8 games) + 2 shared bonus plays.
 *   - Each game's first play is its ranked daily attempt.
 *   - Extra plays on any game draw from a shared pool of 2 bonus plays.
 *   - Resets at local midnight.
 * PRO tier (future, paid): unlimited plays + past-day challenges.
 *   - Toggled by localStorage 'runthegrid_pro' === '1' (hook reserved; billing later).
 * Fail-safe: pure localStorage, no network. window.RTGTokens.
 */
(function(){
  'use strict';
  var LS = window.localStorage;
  var KEY = 'runthegrid_tokens_v2';
  var GAMES = ['table','match','career','oddone','rankit','guess','crossword','wordsearch'];
  var PER_GAME = 1;     // ranked play per game
  var BONUS = 2;        // shared wildcard plays
  var DAILY = GAMES.length*PER_GAME + BONUS;   // = 10

  function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function isPro(){ try{ return LS.getItem('runthegrid_pro')==='1'; }catch(e){ return false; } }

  function fresh(){ return { date:todayStr(), plays:{} }; }
  function read(){
    var s;
    try{ s=JSON.parse(LS.getItem(KEY)); }catch(e){ s=null; }
    if(!s || typeof s!=='object') s=fresh();
    if(s.date!==todayStr()) s=fresh();           // new day → full refill
    if(!s.plays || typeof s.plays!=='object') s.plays={};
    return s;
  }
  function write(s){ try{ LS.setItem(KEY, JSON.stringify(s)); }catch(e){} return s; }

  function totalPlays(s){ var n=0; for(var k in s.plays){ if(s.plays.hasOwnProperty(k)) n+=s.plays[k]||0; } return n; }
  function bonusUsed(s){ var n=0; for(var k in s.plays){ if(s.plays.hasOwnProperty(k)) n+=Math.max(0,(s.plays[k]||0)-PER_GAME); } return n; }
  function bonusLeft(s){ return Math.max(0, BONUS - bonusUsed(s)); }
  function playsOf(game){ return read().plays[game]||0; }

  function remaining(){ if(isPro()) return Infinity; var s=read(); return Math.max(0, DAILY - totalPlays(s)); }
  function bonusRemaining(){ if(isPro()) return Infinity; return bonusLeft(read()); }

  function triesLeft(game){
    if(isPro()) return Infinity;
    var s=read();
    var reg = (s.plays[game]?0:PER_GAME);        // own ranked play, if unused
    return reg + bonusLeft(s);
  }
  function canPlay(game){ return triesLeft(game)>0; }

  // Spend one play for `game`. Returns
  // { ok, tryNo, first, bonus, left } — first=true on the ranked attempt.
  function startAttempt(game){
    if(isPro()){ var sp=read(); sp.plays[game]=(sp.plays[game]||0)+1; write(sp);
      return { ok:true, tryNo:sp.plays[game], first:(sp.plays[game]===1), bonus:(sp.plays[game]>PER_GAME), left:Infinity }; }
    if(triesLeft(game)<=0) return { ok:false, tryNo:0, first:false, bonus:false, left:0 };
    var s=read(), before=s.plays[game]||0;
    var bonus = (before>=PER_GAME);
    s.plays[game]=before+1; write(s);
    return { ok:true, tryNo:s.plays[game], first:(before===0), bonus:bonus, left:triesLeft(game) };
  }

  window.RTGTokens = {
    DAILY:DAILY, PER_GAME:PER_GAME, BONUS:BONUS, GAMES:GAMES.slice(),
    today:todayStr,
    isPro:isPro,
    remaining:remaining,
    bonusRemaining:bonusRemaining,
    playsOf:playsOf,
    triesLeft:triesLeft,
    canPlay:canPlay,
    startAttempt:startAttempt,
    /* short label for buttons/tiles */
    label:function(game){
      if(isPro()) return 'Unlimited';
      var n=triesLeft(game);
      if(n<=0) return 'No plays left';
      var played=playsOf(game)>0;
      if(played) return bonusRemaining()+' bonus left';
      return bonusRemaining()>0 ? ('1 play + '+bonusRemaining()+' bonus') : '1 play';
    }
  };
})();
