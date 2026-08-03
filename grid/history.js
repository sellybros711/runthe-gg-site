/* RunTheGrid — per-game results history + "your last 5" bar chart (shared)
 * Records each completed play and renders a compact bar graph in the end modal.
 * Metric per game: runs (streak games), time (timed games), guesses (Guess).
 * Bars are relative to the best value in the shown set; the newest is accented;
 * a loss/DNF shows as a muted red stub. Pure localStorage. window.RTGHistory.
 *
 * Usage in a game:
 *   RTGHistory.push('table', runValue, true)          // on finish (skip in archive)
 *   RTGHistory.render(document.getElementById('rtgHist'), 'table')  // in showEnd
 */
(function(){
  'use strict';
  var LS=window.localStorage, KEY='rtg:hist:v1', CAP=12;
  function fmtTime(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  var idv=function(v){ return v; };
  var CFG={
    table:     { unit:'in a row', fmt:idv,     accent:'var(--goldT,#F2B632)' },
    oddone:    { unit:'in a row', fmt:idv,     accent:'var(--violetT,#A982F3)' },
    career:    { unit:'in a row', fmt:idv,     accent:'var(--greenT,#48D17A)' },
    rankit:    { unit:'sets',     fmt:idv,     accent:'var(--pinkT,#F65C9C)' },
    crossword: { unit:'time',     fmt:fmtTime, accent:'var(--ink,#0D1B2C)' },
    wordsearch:{ unit:'time',     fmt:fmtTime, accent:'var(--tealT,#37C5D5)' },
    match:     { unit:'time',     fmt:fmtTime, accent:'var(--blue,#2F6BFF)' },
    guess:     { unit:'guesses',  fmt:idv,     accent:'var(--blue,#2F6BFF)' }
  };

  function read(){ try{ return JSON.parse(LS.getItem(KEY))||{}; }catch(e){ return {}; } }
  function write(o){ try{ LS.setItem(KEY, JSON.stringify(o)); }catch(e){} }

  // record one completed play. value=null or won===false renders as a DNF stub.
  function push(game, value, won){
    var o=read(), arr=o[game]||[];
    arr.push({ v:(value==null?null:value), w:(won===false?false:true) });
    if(arr.length>CAP) arr=arr.slice(arr.length-CAP);
    o[game]=arr; write(o); return arr;
  }
  function last(game,n){ var arr=read()[game]||[]; return arr.slice(Math.max(0,arr.length-(n||5))); }

  var styled=false;
  function injectCSS(){
    if(styled) return; styled=true;
    var s=document.createElement('style');
    s.textContent=
      '.rtghist{margin:15px 0 2px;text-align:left;}'+
      '.rtghist .hh{font-size:9.5px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);margin:0 2px 9px;display:flex;justify-content:space-between;}'+
      '.rtghist .bars{display:flex;align-items:flex-end;gap:7px;height:64px;}'+
      '.rtghist .bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:5px;min-width:0;}'+
      '.rtghist .bar .v{font-size:10.5px;font-weight:900;color:var(--mut);font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;}'+
      '.rtghist .bar i{display:block;width:100%;max-width:36px;border-radius:6px 6px 3px 3px;background:var(--line2);min-height:5px;}'+
      '.rtghist .bar.cur .v{color:var(--ink);}'+
      '.rtghist .bar.cur i{background:var(--_acc);}'+
      '.rtghist .bar.miss i{background:color-mix(in srgb,var(--red,#e5484d) 55%,transparent);}'+
      '.rtghist .empty{color:var(--dim);font-size:11.5px;text-align:center;padding:16px 0 6px;}';
    (document.head||document.documentElement).appendChild(s);
  }

  function render(el, game){
    if(!el) return; injectCSS();
    var cfg=CFG[game]||{unit:'',fmt:idv,accent:'var(--goldT,#F2B632)'};
    var arr=last(game,5);
    if(!arr.length){
      el.innerHTML='<div class="rtghist"><div class="hh"><span>Your last 5</span></div><div class="empty">Play a few and your trend shows up here.</div></div>';
      return;
    }
    var vals=arr.filter(function(e){ return e.v!=null && e.w!==false; }).map(function(e){ return e.v; });
    var max=vals.length?Math.max.apply(null,vals):1; if(max<=0) max=1;
    var bars=arr.map(function(e,i){
      var cur=(i===arr.length-1);
      if(e.w===false || e.v==null){
        return '<div class="bar miss'+(cur?' cur':'')+'"><span class="v">—</span><i style="height:100%"></i></div>';
      }
      var h=Math.max(8, Math.round(e.v/max*100));
      return '<div class="bar'+(cur?' cur':'')+'"><span class="v">'+cfg.fmt(e.v)+'</span><i style="height:'+h+'%"></i></div>';
    }).join('');
    el.innerHTML='<div class="rtghist" style="--_acc:'+cfg.accent+'"><div class="hh"><span>Your last '+arr.length+'</span><span>'+cfg.unit+'</span></div><div class="bars">'+bars+'</div></div>';
  }

  window.RTGHistory={ push:push, last:last, render:render, CFG:CFG };
})();
