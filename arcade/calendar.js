/* calendar.js - the shared Arcade Archive calendar for Run The Arcade.
 *
 * One self-mounting module (like auth-ui.js / card.js). Any arcade page can open
 * a per-game calendar of past playable days:
 *   RTGCalendar.open('rankit')     - opens the Rank It archive calendar
 *   RTGCalendar.GAMES              - the game registry (key, path, name, accent, icon)
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

  // Game registry - icons/accents mirror the hub tiles so the archive reads as
  // the same product. `cls` matches the hub's .tile.<cls> accent rules.
  var GAMES = [
    { key:'table',      path:'table',      cls:'table',  name:'Number Game',    accent:'var(--gold)',
      desc:'Higher or lower? Tap the bigger number and run as many as you can.',
      icon:'<svg viewBox="0 0 56 56"><rect x="9" y="28" width="13" height="20" rx="3" fill="#F2B632" opacity=".5"/><rect x="27" y="16" width="13" height="32" rx="3" fill="#F2B632"/><g fill="none" stroke="#F2B632" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M43 15h8M47 11v8"/><path d="M43 21l4-4 4 4"/></g></svg>' },
    { key:'match',      path:'match',      cls:'match',  name:'Daily Match',      accent:'var(--blue)',
      desc:'Tap four names that belong together. Find all four groups before four mistakes.',
      icon:'<svg viewBox="0 0 56 56"><g><rect x="2" y="2" width="15" height="15" rx="3" fill="#2F6BFF"/><rect x="20.5" y="2" width="15" height="15" rx="3" fill="#F2B632"/><rect x="39" y="2" width="15" height="15" rx="3" fill="#F06A5F"/><rect x="2" y="20.5" width="15" height="15" rx="3" fill="#F06A5F"/><rect x="20.5" y="20.5" width="15" height="15" rx="3" fill="#A982F3"/><rect x="39" y="20.5" width="15" height="15" rx="3" fill="#2F6BFF"/><rect x="2" y="39" width="15" height="15" rx="3" fill="#F2B632"/><rect x="20.5" y="39" width="15" height="15" rx="3" fill="#F65C9C"/><rect x="39" y="39" width="15" height="15" rx="3" fill="#F06A5F"/></g></svg>' },
    { key:'career',     path:'career',     cls:'career', name:'Career Path',      accent:'var(--green)',
      desc:'A career, one team at a time. Type the name early for more points.',
      icon:'<svg viewBox="0 0 56 56"><g fill="none" stroke="#48D17A" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 44 L22 24 L34 34 L46 12"/></g><g fill="#48D17A"><circle cx="12" cy="44" r="4.2"/><circle cx="22" cy="24" r="4.2"/><circle cx="34" cy="34" r="4.2"/><circle cx="46" cy="12" r="4.2"/></g></svg>' },
    { key:'oddone',     path:'oddone',     cls:'oddone', name:'Odd One Out',      accent:'var(--violet)',
      desc:'Four names share a connection, one doesn’t. Spot it.',
      icon:'<svg viewBox="0 0 56 56"><circle cx="16" cy="16" r="7.5" fill="#A982F3"/><circle cx="40" cy="16" r="7.5" fill="#A982F3"/><circle cx="16" cy="40" r="7.5" fill="#A982F3"/><rect x="32.5" y="32.5" width="15" height="15" rx="3.5" fill="#F06A5F"/></svg>' },
    { key:'rankit',     path:'rankit',     cls:'rankit', name:'Rank It',          accent:'var(--pink)',
      desc:'Put five athletes in order by a career stat, most at the top.',
      icon:'<svg viewBox="0 0 56 56"><rect x="10" y="13" width="20" height="8" rx="3" fill="#F65C9C" opacity=".5"/><rect x="10" y="25" width="30" height="8" rx="3" fill="#F65C9C" opacity=".78"/><rect x="10" y="37" width="40" height="8" rx="3" fill="#F65C9C"/></svg>' },
    { key:'almamater',  path:'almamater',  cls:'alma',   name:'Alma Mater',       accent:'var(--gold)',
      desc:'Name the college each player came from. Four choices, one right.',
      icon:'<svg viewBox="0 0 56 56"><path d="M28 12 L52 22 L28 32 L4 22 Z" fill="#F2B632"/><path d="M16 27 v9 c0 3.3 5.4 6 12 6 s12 -2.7 12 -6 v-9 L28 32 Z" fill="#F2B632" opacity=".55"/><path d="M52 22 v11" fill="none" stroke="#F2B632" stroke-width="2.4" stroke-linecap="round"/><circle cx="52" cy="35" r="2.6" fill="#F2B632"/></svg>' },
    { key:'guess',      path:'guess',      cls:'guess',  name:'Guess the Player', accent:'var(--coral)',
      desc:'One mystery athlete from any era. Crack it in eight guesses.',
      icon:'<svg viewBox="0 0 56 56"><g><rect x="4.4" y="10.6" width="10" height="10" rx="2.4" fill="#0E2438"/><rect x="16.8" y="10.6" width="10" height="10" rx="2.4" fill="#F2B632"/><rect x="29.2" y="10.6" width="10" height="10" rx="2.4" fill="#0E2438"/><rect x="41.6" y="10.6" width="10" height="10" rx="2.4" fill="#2FA968"/><rect x="4.4" y="23" width="10" height="10" rx="2.4" fill="#F2B632"/><rect x="16.8" y="23" width="10" height="10" rx="2.4" fill="#2FA968"/><rect x="29.2" y="23" width="10" height="10" rx="2.4" fill="#0E2438"/><rect x="41.6" y="23" width="10" height="10" rx="2.4" fill="#0E2438"/><rect x="4.4" y="35.4" width="10" height="10" rx="2.4" fill="#2FA968"/><rect x="16.8" y="35.4" width="10" height="10" rx="2.4" fill="#2FA968"/><rect x="29.2" y="35.4" width="10" height="10" rx="2.4" fill="#F2B632"/><rect x="41.6" y="35.4" width="10" height="10" rx="2.4" fill="#2FA968"/></g></svg>' },
    { key:'crossword',  path:'crossword',  cls:'cross',  name:'Daily Crossword',  accent:'var(--news,#64748B)',
      desc:'A sports mini crossword. Beat the clock for a flawless solve.',
      icon:'<svg viewBox="0 0 56 56"><defs><clipPath id="cwico"><rect x="4" y="4" width="48" height="48" rx="6"/></clipPath></defs><g clip-path="url(#cwico)"><rect x="4" y="4" width="48" height="48" fill="#F4F7FB"/><rect x="40" y="4" width="12" height="12" fill="#12202F"/><rect x="4" y="40" width="12" height="12" fill="#12202F"/><g stroke="#CBD5E1" stroke-width="1"><path d="M16 4v48M28 4v48M40 4v48M4 16h48M4 28h48M4 40h48"/></g><g font-family="Archivo, sans-serif" font-size="9" font-weight="900" fill="#16273B" text-anchor="middle"><text x="10" y="13.2">R</text><text x="22" y="13.2">U</text><text x="34" y="13.2">N</text><text x="46" y="25.2">T</text><text x="46" y="37.2">H</text><text x="46" y="49.2">E</text></g></g><rect x="4" y="4" width="48" height="48" rx="6" fill="none" stroke="#93A1B2" stroke-width="2"/></svg>' },
    { key:'sportegories', path:'sportegories', cls:'spg', name:'Sportegories', accent:'var(--spg,#DA6BE6)',
      desc:'One letter, eight categories, two minutes.',
      icon:'<svg viewBox="0 0 56 56"><rect x="4" y="4" width="48" height="48" rx="8" fill="#F7E9FB"/><rect x="4" y="4" width="48" height="48" rx="8" fill="none" stroke="#DA6BE6" stroke-width="2"/><g font-family="Anton, Impact, sans-serif" font-size="26" text-anchor="middle"><text x="28" y="37" fill="#DA6BE6">S</text></g><g fill="#DA6BE6" opacity=".55"><rect x="10" y="44" width="9" height="3" rx="1.5"/><rect x="23.5" y="44" width="9" height="3" rx="1.5"/><rect x="37" y="44" width="9" height="3" rx="1.5"/></g></svg>' }
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
    // unique-ify any clipPath ids so the modal icon can’t collide with a same
    // icon already on the page (crossword uses an id-based clipPath)
    $('rtgcalIco').innerHTML = g.icon.replace(/(cwico|wsico)/g, '$1M');
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
