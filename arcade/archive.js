/* Run The Arcade — archive / past-day mode (shared)
 * A game page with ?date=YYYY-MM-DD runs THAT day's deterministic puzzle
 * instead of today's — a PRO-only "play any past day" feature.
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
  var LAUNCH='2026-07-22';   // the day RunTheGrid launched — earliest archive day
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
    bar.innerHTML='<span>Archive · '+pretty(raw)+' · <b>practice run, not ranked</b></span>'
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
    pretty:pretty
  };
})();
