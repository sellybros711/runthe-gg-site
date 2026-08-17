/* calendar.js - the shared Arcade Archive calendar for Run The Arcade.
 *
 * One self-mounting module (like auth-ui.js / card.js). Any arcade page can open
 * a per-game calendar of past playable days:
 *   RTGCalendar.open('rankit')     - opens the Rank It archive calendar
 *   RTGCalendar.GAMES              - the game registry (key, path, name, accent)
 *   RTGCalendar.get('rankit')      - one game's registry entry
 *
 * A day cell links to /arcade/<path>/?date=YYYY-MM-DD (the same date-override the
 * game pages already understand). Playable range is LAUNCH .. yesterday - today's
 * puzzle lives on the hub, not the archive. Entitlement/gating is the caller's
 * job; this module is pure presentation and fails soft with no network.
 */
(function () {
  'use strict';

  var LAUNCH = (window.RTGArchive && RTGArchive.LAUNCH) || '2026-06-01';

  // Game registry. The drawings live in gamemarks.js so the hub, the Vault and
  // this calendar cannot show three different logos for one game.
  // the same product. `cls` matches the hub's .tile.<cls> accent rules.
  var GAMES = [
    { key:'table',      path:'table',      cls:'table',  name:'Number Game',    accent:'var(--gold)',
      desc:'One player, one club: name the number they wore.' },
    { key:'match',      path:'match',      cls:'match',  name:'Common Ground', accent:'var(--blue)',
      desc:'Tap four names that belong together. Find all four groups before four mistakes.' },
    { key:'career',     path:'career',     cls:'career', name:'Career Path',      accent:'var(--green)',
      desc:'Three clubs or more, revealed one at a time. Type the name early for more points.' },
    { key:'oddone',     path:'oddone',     cls:'oddone', name:'Odd One Out',      accent:'var(--violet)',
      desc:'Four names share a connection, one doesn’t. Spot it, then name it.' },
    { key:'rankit',     path:'rankit',     cls:'rankit', name:'Rank It',          accent:'var(--pink)',
      desc:'Put five athletes in order by a career stat, most at the top.' },
    { key:'almamater',  path:'almamater',  cls:'alma',   name:'Alma Mater',       accent:'var(--gold)',
      desc:'Name the college each player came from. Type it, or take four choices.' },
    { key:'guess',      path:'guess',      cls:'guess',  name:'Guess the Player', accent:'var(--coral)',
      desc:'One mystery athlete from any era. Crack it in eight guesses.' },
    { key:'crossword',  path:'crossword',  cls:'cross',  name:'Daily Crossword',  accent:'var(--news,#64748B)',
      desc:'A sports mini crossword. Beat the clock for a flawless solve.' },
    { key:'sportegories', path:'sportegories', cls:'spg', name:'Sportegories', accent:'var(--spg,#DA6BE6)',
      desc:'One letter, eight categories, two minutes.' }
  ];

  var byKey = {};
  for (var i = 0; i < GAMES.length; i++) byKey[GAMES[i].key] = GAMES[i];

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function $(id){ return document.getElementById(id); }
  function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function monthLabel(y,m){ try{ return new Date(y,m,1).toLocaleDateString(undefined,{month:'long', year:'numeric'}); }catch(e){ return y+'-'+(m+1); } }

  function injectStyles(){
    if($('rtgcal-style')) return;
    var s=document.createElement('style'); s.id='rtgcal-style';
    s.textContent=[
      '.rtgcal-scrim{position:fixed;inset:0;z-index:9500;display:flex;align-items:flex-start;justify-content:center;padding:max(20px,env(safe-area-inset-top)) 14px 24px;background:rgba(3,9,18,.7);backdrop-filter:blur(5px);overflow:auto;}',
      '.rtgcal-scrim[hidden]{display:none;}',
      '.rtgcal{width:100%;max-width:440px;margin:auto 0;background:var(--card,#10233A);color:var(--ink,#F4F7FB);border:1px solid var(--line2,rgba(244,247,251,.15));border-radius:18px;box-shadow:0 30px 90px -20px rgba(0,0,0,.75);overflow:hidden;}',
      '.rtgcal-head{display:flex;align-items:center;gap:12px;padding:15px 15px 13px;border-bottom:1px solid var(--line2,rgba(244,247,251,.15));background:color-mix(in srgb, var(--c,var(--blue,#2F6BFF)) 12%, var(--card,#10233A));}',
      '.rtgcal-ico{width:42px;height:42px;flex:0 0 auto;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb, var(--c,var(--blue,#2F6BFF)) 16%, var(--card,#10233A));border:1px solid color-mix(in srgb, var(--c,var(--blue,#2F6BFF)) 30%, transparent);}',
      '.rtgcal-ico svg{width:27px;height:27px;}',
      '.rtgcal-t{flex:1;min-width:0;}',
      '.rtgcal-t .nm{font-weight:900;font-style:italic;font-size:18px;line-height:1.1;color:var(--ink,#F4F7FB);}',
      '.rtgcal-t .sub{display:block;font-size:11.5px;color:var(--mut,#A9B8CB);font-weight:700;margin-top:2px;}',
      '.rtgcal-x{width:34px;height:34px;flex:0 0 auto;border-radius:50%;border:1px solid var(--line2,rgba(244,247,251,.15));background:var(--card2,#162B44);color:var(--ink,#F4F7FB);font-size:14px;cursor:pointer;}',
      '.rtgcal-body{padding:6px 14px 16px;max-height:min(64vh,560px);overflow:auto;}',
      '.rtgcal-mo{margin-top:15px;}',
      '.rtgcal-mo .mh{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.03em;text-transform:uppercase;font-size:14px;color:var(--mut,#A9B8CB);margin:0 2px 8px;}',
      '.rtgcal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}',
      '.rtgcal-dow{text-align:center;font-size:9.5px;font-weight:900;letter-spacing:.03em;color:var(--dim,#7C8DA3);text-transform:uppercase;padding-bottom:2px;}',
      '.rtgcal-d{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;border-radius:9px;font-size:13px;font-weight:800;}',
      '.rtgcal-d.blank{visibility:hidden;}',
      '.rtgcal-d.off{color:var(--dim,#7C8DA3);opacity:.38;}',
      'a.rtgcal-d.on{position:relative;background:var(--card2,#162B44);border:1px solid var(--line2,rgba(244,247,251,.15));color:var(--ink,#F4F7FB);text-decoration:none;transition:transform .08s,border-color .12s,background .12s;overflow:visible;}',
      'a.rtgcal-d.on:hover{border-color:var(--c,var(--blue,#2F6BFF));background:color-mix(in srgb, var(--c,var(--blue,#2F6BFF)) 16%, var(--card2,#162B44));transform:translateY(-1px);}',
      'a.rtgcal-d.today{border-color:var(--c,var(--blue,#2F6BFF));box-shadow:0 0 0 1px var(--c,var(--blue,#2F6BFF)) inset;}',
      /* A finished day should read as finished from across the grid, so it
         fills solid rather than wearing a faint tint. */
      'a.rtgcal-d.done{border-color:var(--green,#48D17A);background:var(--green,#48D17A);color:#06210f;font-weight:900;}',
      'a.rtgcal-d.done:hover{background:var(--green,#48D17A);border-color:var(--green,#48D17A);transform:translateY(-1px);}',
      'a.rtgcal-d.done.today{box-shadow:0 0 0 2px var(--c,var(--blue,#2F6BFF)) inset;}',
      /* the corner tick inverts so it still reads on the filled cell */
      'a.rtgcal-d.done .rtgcal-ck{background:#06210f;color:var(--green,#48D17A);}',
      '.rtgcal-ck{position:absolute;top:-6px;right:-6px;width:17px;height:17px;border-radius:50%;background:var(--green,#48D17A);color:#06210f;font-size:11px;font-weight:900;line-height:17px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.45);}',
      '.rtgcal-ckdot{display:inline-block;width:15px;height:15px;border-radius:50%;background:var(--green,#48D17A);color:#06210f;font-size:10px;font-weight:900;line-height:15px;text-align:center;vertical-align:-2px;}',
      '.rtgcal-note{text-align:center;color:var(--dim,#7C8DA3);font-size:11px;margin:16px 2px 2px;line-height:1.5;}',
      '.rtgcal-note a{color:var(--c,var(--blue,#2F6BFF));}'
    ].join('');
    document.head.appendChild(s);
  }

  var scrim=null;
  function ensure(){
    if(scrim) return scrim;
    injectStyles();
    scrim=document.createElement('div'); scrim.className='rtgcal-scrim'; scrim.hidden=true;
    scrim.innerHTML=
      '<div class="rtgcal" role="dialog" aria-modal="true" aria-label="Archive calendar">'+
        '<div class="rtgcal-head">'+
          '<span class="rtgcal-ico" id="rtgcalIco" aria-hidden="true"></span>'+
          '<span class="rtgcal-t"><span class="nm" id="rtgcalNm"></span><span class="sub" id="rtgcalSub"></span></span>'+
          '<button class="rtgcal-x" id="rtgcalX" type="button" aria-label="Close">✕</button>'+
        '</div>'+
        '<div class="rtgcal-body" id="rtgcalBody"></div>'+
      '</div>';
    document.body.appendChild(scrim);
    scrim.addEventListener('click', function(e){ if(e.target===scrim) close(); });
    $('rtgcalX').addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && !scrim.hidden) close(); });
    return scrim;
  }
  function close(){ if(scrim){ scrim.hidden=true; try{ document.body.style.overflow=''; }catch(e){} } }

  function calBody(g){
    var today=new Date(iso(new Date())+'T00:00:00');
    var todayIso=iso(today);
    var launch=new Date(LAUNCH+'T00:00:00');
    var startY=launch.getFullYear(), startM=launch.getMonth();
    var dows=['S','M','T','W','T','F','S'];
    var months=[], y=today.getFullYear(), m=today.getMonth();
    while(y>startY || (y===startY && m>=startM)){ months.push([y,m]); m--; if(m<0){ m=11; y--; } }
    // which days this player has completed (archive PBs + the shared done marker)
    var done=(window.RTGArchive && RTGArchive.doneDates) ? RTGArchive.doneDates(g.key) : {};
    var out='', playable=0, doneCount=0;
    for(var i=0;i<months.length;i++){
      var yy=months[i][0], mm=months[i][1];
      var lead=new Date(yy,mm,1).getDay();
      var dim=new Date(yy,mm+1,0).getDate();
      out+='<div class="rtgcal-mo"><div class="mh">'+esc(monthLabel(yy,mm))+'</div><div class="rtgcal-grid">';
      for(var d0=0;d0<7;d0++) out+='<div class="rtgcal-dow">'+dows[d0]+'</div>';
      for(var b=0;b<lead;b++) out+='<div class="rtgcal-d blank"></div>';
      for(var day=1; day<=dim; day++){
        var cd=new Date(yy,mm,day), ds=iso(cd);
        // playable = launch through TODAY (today included); only the future is greyed out
        if(cd>=launch && cd<=today){
          var isDone=!!done[ds]; if(isDone) doneCount++;
          if(ds!==todayIso) playable++;
          // today opens its live game on the hub; past days open in archive mode
          var href = ds===todayIso ? '/arcade/'+g.path+'/' : '/arcade/'+g.path+'/?date='+ds;
          out+='<a class="rtgcal-d on'+(isDone?' done':'')+(ds===todayIso?' today':'')+'" href="'+href+'">'+day+
               (isDone?'<span class="rtgcal-ck" aria-label="completed">✓</span>':'')+'</a>';
        }
        else out+='<div class="rtgcal-d off">'+day+'</div>';
      }
      out+='</div></div>';
    }
    out+='<div class="rtgcal-note">'+playable+' past day'+(playable===1?'':'s')+' to play'+
      (doneCount?(' · <span class="rtgcal-ckdot">✓</span> '+doneCount+' completed'):'')+
      '.<br>Archive runs don’t affect your streak or the daily leaderboard.</div>';
    return out;
  }

  function open(key){
    var g=byKey[key]; if(!g) return;
    ensure();
    scrim.querySelector('.rtgcal').style.setProperty('--c', g.accent);
    /* The mark comes from gamemarks.js, the same drawing the hub and the Vault
       show, animations included. It uniquifies its own ids, so the old manual
       clipPath suffix (two crosswords on one page sharing "cwico", the second
       clipped against the first) is no longer needed here. */
    $('rtgcalIco').innerHTML = (window.RTGGameMarks && RTGGameMarks.svg(g.key)) || '';
    $('rtgcalNm').textContent = g.name;
    $('rtgcalSub').textContent = 'Pick a past day to play';
    $('rtgcalBody').innerHTML = calBody(g);
    $('rtgcalBody').scrollTop = 0;
    scrim.hidden=false;
    try{ document.body.style.overflow='hidden'; }catch(e){}
  }

  window.RTGCalendar = {
    GAMES: GAMES,
    get: function(k){ return byKey[k] || null; },
    open: open,
    close: close,
    LAUNCH: LAUNCH
  };
})();
