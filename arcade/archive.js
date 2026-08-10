/* Run The Arcade - archive / past-day mode (shared)
 * A game page with ?date=YYYY-MM-DD runs THAT day's deterministic puzzle
 * instead of today's - a PRO-only "play any past day" feature.
 *
 * Rules enforced here:
 *  - Only a valid past date (>= LAUNCH, < today) activates archive mode.
 *  - Archive mode requires PRO (window.RTGTokens.isPro()). Non-pro requests
 *    fall through to today's puzzle (the archive page is the real gate).
 *  - Archive plays are PRACTICE: games must not submit to the board, touch
 *    streaks, or write their daily save (they check RTGArchive.active()).
 *  - Injects a slim "Archive · <date> · practice" banner when active.
 *
 * Load AFTER tokens.js (needs RTGTokens.isPro). window.RTGArchive.
 */
(function(){
  'use strict';
  var LAUNCH='2026-07-22';   // the day RunTheGrid launched - earliest archive day
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function isPro(){ return !!(window.RTGTokens && window.RTGTokens.isPro && window.RTGTokens.isPro()); }
  function param(){ try{ return new URLSearchParams(location.search).get('date'); }catch(e){ return null; } }
  function validPast(s){ return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && s>=LAUNCH && s<today(); }

  var raw = param();
  var wantsPast = validPast(raw);
  var active = wantsPast && isPro();

  function pretty(s){
    try{ var d=new Date(s+'T00:00:00'); return d.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric', year:'numeric'}); }
    catch(e){ return s; }
  }

  // Per-date personal best. Every archive attempt is untracked by streak /
  // leaderboard for integrity, but the paying member's own high score on a
  // given day is worth persisting - this is the "chase your personal best"
  // hook the banner is promising. Games call recordBest(game, score) on
  // finish (archive only); the banner reads it back on the next visit.
  function pbKey(game){ return 'rtg:'+game+':pb:'+raw; }
  function readBest(game){
    if(!active) return null;
    try{ var v=localStorage.getItem(pbKey(game)); return v===null?null:Number(v); }catch(e){ return null; }
  }
  function recordBest(game, score, opts){
    if(!active) return null;
    opts=opts||{};
    var higher=opts.higherIsBetter!==false;
    try{
      var cur=readBest(game), curN=cur===null?null:cur;
      var isNew=curN===null || (higher?score>curN:score<curN);
      if(isNew) localStorage.setItem(pbKey(game), String(score));
      // when a new PB is set mid-play, refresh the banner without a reload
      if(isNew) updateBannerBest(game, score, opts.label);
      return { pb:isNew?score:curN, isNew:isNew };
    }catch(e){ return null; }
  }
  // Best-known score across all archive game keys for THIS date; the banner
  // shows the most recently touched one so a fresh session sees any prior PB.
  function bestForBanner(){
    var out=null;
    try{
      for(var i=0;i<localStorage.length;i++){
        var k=localStorage.key(i); if(!k) continue;
        var m=k.match(/^rtg:([a-z]+):pb:(.+)$/);
        if(!m || m[2]!==raw) continue;
        var v=Number(localStorage.getItem(k)); if(isNaN(v)) continue;
        if(!out || v>out.v) out={ game:m[1], v:v };
      }
    }catch(e){}
    return out;
  }
  function updateBannerBest(game, score, label){
    var b=document.getElementById('rtgArchiveBar'); if(!b) return;
    var slot=b.querySelector('[data-rtga-best]'); if(!slot) return;
    slot.innerHTML=' · <b>your best today: '+score+(label?(' '+label):'')+'</b>';
  }

  function injectBanner(){
    if(!active) return;
    if(document.getElementById('rtgArchiveBar')) return;
    var bar=document.createElement('div');
    bar.id='rtgArchiveBar';
    bar.setAttribute('role','note');
    bar.style.cssText='position:sticky; top:0; z-index:40; display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; '
      +'padding:7px 14px; font-family:var(--f,system-ui); font-weight:800; font-size:12px; letter-spacing:.01em; '
      +'color:#20140a; background:linear-gradient(90deg,var(--gold,#F2B632),color-mix(in srgb,var(--gold,#F2B632) 78%, #fff)); '
      +'box-shadow:0 2px 10px -4px rgba(0,0,0,.5);';
    var seen=bestForBanner();
    var bestSlot = seen
      ? ' · <b data-rtga-best>your best today: '+seen.v+'</b>'
      : '<span data-rtga-best></span>';
    bar.innerHTML='<span>Archive · '+pretty(raw)+' · <b>chase your personal best</b>'+bestSlot+'</span>'
      +'<a href="/arcade/archive/" style="color:#20140a; text-decoration:underline; font-weight:900;">Back to archive</a>';
    var host=document.body;
    if(host){ host.insertBefore(bar, host.firstChild); }
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', injectBanner); }
  else { injectBanner(); }

  window.RTGArchive = {
    LAUNCH:LAUNCH,
    today:today,
    active:function(){ return active; },                 // past-day practice mode is ON
    date:function(){ return active ? raw : today(); },    // the date a game should seed with
    requested:function(){ return raw; },                  // the raw ?date= param (may be null/invalid)
    wantsPast:function(){ return wantsPast; },            // a valid past date was requested (pro or not)
    isPro:isPro,
    pretty:pretty,
    // per-date personal-best helpers - safe no-ops when not in archive mode
    recordBest:recordBest,
    readBest:readBest
  };
})();
