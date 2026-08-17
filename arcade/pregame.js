/* pregame.js - the gate shown when you open a Run The Arcade game.
 *
 * Self-mounting (like auth-ui.js / card.js / calendar.js). If the player can
 * play this game right now it stays out of the way entirely: one click to play,
 * straight onto a ready board. It only appears when they cannot, and then it
 * says which of the three reasons it is:
 *   SIGNED OUT           → how to play + "Create a free account"
 *   FREE, card-only game → "This one is on the Arcade Card"
 *   FREE, play used      → "Back tomorrow", plus the four other free games
 *   CARDHOLDER           → never (they can always play)
 *
 * Why this is safe: every game charges its play only on the FIRST interaction
 * (startAttempt via startIfNeeded), never on load. This overlay sits in front
 * of the board, so nothing is spent until the player dismisses it and plays -
 * no game code changes, no double spend. Skipped entirely in archive practice.
 *
 * Reads tier from RTGTokens, name/icon/accent from RTGCalendar, the all-time
 * board from RTG_BOARD.allTimeBoard, and the paywall from RTGCard. All optional:
 * with any of them missing the overlay degrades gracefully (and never blocks).
 */
(function () {
  'use strict';

  function gameKey(){ var m=(location.pathname||'').match(/\/arcade\/([a-z]+)\//); return m?m[1]:null; }
  var GAME = gameKey();
  var KNOWN = { table:1, match:1, career:1, oddone:1, rankit:1, almamater:1, guess:1, crossword:1, sportegories:1 };
  if (!GAME || !KNOWN[GAME]) return;
  if (window.RTGArchive && RTGArchive.active && RTGArchive.active()) return;   // archive practice: no gate

  // How-to-play (2-3 short lines each).
  var RULES = {
    table:      ['What number did they wear for that club?', 'Type it. Within two counts. One save, then the run ends.'],
    match:      ['Sixteen names hide four secret groups of four.', 'Tap four that belong together. Four wrong guesses ends the day.'],
    career:     ['A well-travelled career, revealed one club at a time.', 'Type the name. Off the first club it is worth 5. One miss ends your run.'],
    oddone:     ['Four names share a connection, one doesn’t.', 'Spot it for a point, then name the link for another.'],
    rankit:     ['Five players, one career stat, most at the top.', 'Tap two names to swap them. Five tries.'],
    almamater:  ['Name the college each player attended.', 'Type it for 2 points, take four choices for 1.'],
    guess:      ['Guess the mystery player, from any era.', 'Eight tries. Tiles compare careers, not this season.'],
    crossword:  ['Fill the sports mini crossword.', 'Beat the clock; no mistakes for a flawless.'],
    sportegories: ['One letter, eight categories, two minutes.', 'Every answer has to start with that letter. Rarer names score more.'],
  };
  // Personal-best source per game (localStorage). t:true = time in seconds.
  var BEST = {
    table:      { k:'rtg:table:v1',     f:'bestRun',    cap:'best run' },
    match:      { k:'grid_match_stats', f:'best',       cap:'best streak' },
    career:     { k:'rtg:career:v1',    f:'bestRun',    cap:'best score' },
    oddone:     { k:'rtg:oddone:v1',    f:'bestRun',    cap:'best run' },
    rankit:     { k:'rtg:rankit:v2',    f:'bestRun',    cap:'sets cleared' },
    almamater:  { k:'rtg:almamater:v1', f:'bestRun',    cap:'best run' },
    guess:      { k:'rtg:guess:v1',     f:'bestStreak', cap:'win streak' },
    crossword:  { k:'rtg:cw:v1',        f:'best',       cap:'best time', t:true },
    sportegories:{k:'rtg_sportegories_v1', f:'best',    cap:'best score' },
  };

  var T = window.RTGTokens;
  function hasCard(){ return !!(T && T.hasCard && T.hasCard()); }
  function canPlay(){ return T && T.canPlay ? T.canPlay(GAME) : true; }
  function remaining(){ return T && T.remaining ? T.remaining(GAME) : Infinity; }
  function signedIn(){ return !!(T && T.signedIn && T.signedIn()); }
  function unlocked(){ return T && T.unlocked ? T.unlocked(GAME) : true; }
  // The four free games, minus this one, as a readable list for the "come back
  // tomorrow" screen: the whole point of a per-game cap is that there is always
  // something else to go and play right now.
  function otherFree(){
    var list=(T && T.FREE_GAMES) ? T.FREE_GAMES : [];
    var out=[];
    for(var i=0;i<list.length;i++){
      if(list[i]===GAME) continue;
      var m=(window.RTGCalendar && RTGCalendar.get) ? RTGCalendar.get(list[i]) : null;
      out.push({ key:list[i], name:(m&&m.name)||list[i] });
    }
    return out;
  }
  function freeLinks(){
    var o=otherFree(); if(!o.length) return '';
    return '<div class="rtgpg-alt">'+o.map(function(g){
      return '<a class="rtgpg-alt-a" href="/arcade/'+esc(g.key)+'/">'+esc(g.name)+'</a>';
    }).join('')+'</div>';
  }
  function openSignin(){ if(window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open('signin'); }
  function openCard(reason){ if(window.RTGCard && RTGCard.paywall) RTGCard.paywall({ reason: reason || 'upsell' }); }
  function meta(){ return (window.RTGCalendar && RTGCalendar.get) ? RTGCalendar.get(GAME) : null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  var LOCK='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  function $(id){ return document.getElementById(id); }

  function bestText(){
    var b=BEST[GAME]; if(!b) return null;
    var v; try{ v=(JSON.parse(localStorage.getItem(b.k))||{})[b.f]; }catch(e){ v=null; }
    if(b.t){ if(v==null || v>=1e9) return null; v=Math.round(v); return { n: Math.floor(v/60)+':'+String(v%60).padStart(2,'0'), cap:b.cap }; }
    return { n: String(v||0), cap:b.cap };
  }

  function injectStyles(){
    if($('rtgpg-style')) return;
    var s=document.createElement('style'); s.id='rtgpg-style';
    s.textContent=[
      '.rtgpg-scrim{position:fixed;inset:0;z-index:9600;display:flex;align-items:flex-start;justify-content:center;padding:max(20px,env(safe-area-inset-top)) 15px 24px;background:rgba(3,9,18,.72);backdrop-filter:blur(6px);overflow:auto;}',
      '.rtgpg-scrim[hidden]{display:none;}',
      '.rtgpg{width:100%;max-width:420px;margin:auto 0;background:var(--card,#10233A);color:var(--ink,#F4F7FB);border:1px solid var(--line2,rgba(244,247,251,.15));border-radius:18px;box-shadow:0 30px 90px -20px rgba(0,0,0,.75);overflow:hidden;text-align:center;}',
      '.rtgpg-cap{position:relative;height:96px;display:grid;place-items:center;background:color-mix(in srgb, var(--c,var(--blue,#2F6BFF)) 15%, var(--card,#10233A));border-bottom:1px solid color-mix(in srgb, var(--c,var(--blue,#2F6BFF)) 24%, transparent);}',
      '.rtgpg-cap svg{width:52px;height:52px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.18));}',
      '.rtgpg-body{padding:18px 18px 18px;}',
      '.rtgpg-nm{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.02em;text-transform:uppercase;font-size:24px;line-height:1;margin:0 0 3px;color:var(--ink,#F4F7FB);}',
      '.rtgpg-tag{font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--c,var(--blue,#2F6BFF));margin-bottom:14px;}',
      '.rtgpg-rules{list-style:none;margin:0 0 16px;padding:0;text-align:left;display:grid;gap:8px;}',
      '.rtgpg-rules li{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;font-weight:600;color:var(--ink,#F4F7FB);line-height:1.4;}',
      '.rtgpg-rules li b{color:var(--c,var(--blue,#2F6BFF));font-weight:900;flex:0 0 auto;}',
      '.rtgpg-hs{display:flex;gap:12px;justify-content:center;margin:0 0 16px;}',
      '.rtgpg-stat{flex:1;max-width:150px;background:var(--card2,#162B44);border:1px solid var(--line2,rgba(244,247,251,.15));border-radius:12px;padding:11px 8px;}',
      '.rtgpg-stat .v{font-family:var(--hero,inherit);font-weight:400;font-size:26px;line-height:1;color:var(--ink,#F4F7FB);}',
      '.rtgpg-stat .l{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut,#A9B8CB);margin-top:4px;}',
      '.rtgpg-lb{text-align:left;margin:0 0 16px;}',
      '.rtgpg-lb .h{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--mut,#A9B8CB);margin:0 2px 7px;}',
      '.rtgpg-lb ol{list-style:none;margin:0;padding:0;display:grid;gap:4px;}',
      '.rtgpg-lb li{display:flex;align-items:center;gap:9px;font-size:13px;background:var(--card2,#162B44);border:1px solid var(--line,rgba(244,247,251,.08));border-radius:9px;padding:7px 11px;}',
      '.rtgpg-lb li .r{font-weight:900;color:var(--mut,#A9B8CB);width:18px;flex:0 0 auto;}',
      '.rtgpg-lb li .n{flex:1;min-width:0;font-weight:700;color:var(--ink,#F4F7FB);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtgpg-lb li .d{font-size:11px;font-weight:700;color:var(--dim,#7C8DA3);flex:0 0 auto;white-space:nowrap;}',
      '.rtgpg-lb li .s{font-weight:900;color:var(--c,var(--blue,#2F6BFF));flex:0 0 auto;min-width:34px;text-align:right;}',
      '.rtgpg-lb .empty{font-size:12px;color:var(--dim,#7C8DA3);padding:8px 2px;font-weight:600;}',
      '.rtgpg-go{appearance:none;border:0;cursor:pointer;font-family:var(--f,inherit);font-weight:900;font-style:italic;font-size:16px;letter-spacing:.02em;border-radius:13px;padding:15px 20px;min-height:52px;width:100%;color:#fff;background:var(--c,var(--blue,#2F6BFF));box-shadow:var(--shadow,0 6px 18px -10px rgba(0,0,0,.55));text-shadow:0 1px 2px rgba(0,0,0,.28);}',
      '.rtgpg-go:hover{filter:brightness(1.07);}',
      '.rtgpg-note{font-size:12px;color:var(--mut,#A9B8CB);font-weight:700;margin:0 0 6px;}',
      '.rtgpg-note2{font-size:12px;color:var(--mut,#A9B8CB);font-weight:600;line-height:1.5;margin:0 0 14px;}',
      '.rtgpg-link{color:var(--c,var(--blue,#2F6BFF));font-weight:800;cursor:pointer;text-decoration:underline;}',
      '.rtgpg-ghost{appearance:none;border:0;background:none;cursor:pointer;font-family:var(--f,inherit);font-weight:800;font-size:12.5px;color:var(--mut,#A9B8CB);margin-top:12px;padding:6px;text-decoration:underline;}',
      '.rtgpg-ghost:hover{color:var(--ink,#F4F7FB);}',
      '.rtgpg-lock{display:inline-flex;align-items:center;gap:6px;}',
      // A purchase button is the Arcade Card's gold, not the game's accent.
      // Two of the ten accents are near-white, which put white-on-white text on
      // the single most important button on this screen.
      '.rtgpg-go.buy{background:var(--brand,#FF8A3D);color:var(--onAccent,#160B02);text-shadow:none;}',
      '.rtgpg-alt{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:2px 0 14px;}',
      '.rtgpg-alt-a{display:inline-block;font-size:12px;font-weight:800;text-decoration:none;color:var(--ink,#F4F7FB);background:var(--card2,#162B44);border:1px solid var(--line2,rgba(244,247,251,.15));border-radius:999px;padding:7px 12px;}',
      '.rtgpg-alt-a:hover{border-color:var(--c,var(--blue,#2F6BFF));color:var(--c,var(--blue,#2F6BFF));}',
      '.rtgpg-perks{list-style:none;margin:0 0 15px;padding:0;display:grid;gap:6px;text-align:left;}',
      '.rtgpg-perks li{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;font-weight:700;color:var(--mut,#A9B8CB);line-height:1.4;}',
      '.rtgpg-perks li b{color:var(--c,var(--blue,#2F6BFF));font-weight:900;flex:0 0 auto;}'
    ].join('');
    document.head.appendChild(s);
  }

  var scrim=null, dismissed=false;
  // First-visit check happens ONCE at boot: render() re-runs on auth changes,
  // and re-reading the flag (set by the first render) would flip the intro to
  // "Welcome back" mid-display.
  var INTRO_SEEN=false;
  try{ INTRO_SEEN=!!localStorage.getItem('rtg:howto:'+GAME); }catch(e){}
  function build(){
    // One click to play: if the player can play this game right now, don't gate
    // at all - land them straight on a ready board. The play is still charged on
    // first interaction, and each game shows the paywall itself if the server
    // later disagrees. The overlay only appears when they cannot play.
    if (hasCard() || canPlay()) { dismissed = true; return; }
    injectStyles();
    scrim=document.createElement('div'); scrim.className='rtgpg-scrim';
    var m=meta();
    scrim.innerHTML=
      '<div class="rtgpg" role="dialog" aria-modal="true"'+(m?' style="--c:'+m.accent+'"':'')+'>'+
        '<div class="rtgpg-cap" aria-hidden="true">'+((m&&m.icon)?m.icon:'')+'</div>'+
        '<div class="rtgpg-body" id="rtgpgBody"></div>'+
      '</div>';
    document.body.appendChild(scrim);
    render();
  }
  function done(){ dismissed=true; if(scrim){ scrim.remove(); scrim=null; } try{ document.body.style.overflow=''; }catch(e){} }

  function render(){
    if(dismissed || !scrim) return;
    try{ document.body.style.overflow='hidden'; }catch(e){}
    var m=meta(), name=(m&&m.name)||'This game';
    var b=$('rtgpgBody'); if(!b) return;

    if(hasCard()){
      // CARDHOLDER: high score + all-time leaderboard + Continue
      var hs=bestText();
      b.innerHTML=
        '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
        '<div class="rtgpg-tag">Arcade Card · unlimited</div>'+
        (hs?('<div class="rtgpg-hs"><div class="rtgpg-stat"><div class="v">'+esc(hs.n)+'</div><div class="l">Your '+esc(hs.cap)+'</div></div></div>'):'')+
        '<div class="rtgpg-lb"><div class="h">All-time leaderboard</div><ol id="rtgpgLb"><li class="empty">Loading…</li></ol></div>'+
        '<button class="rtgpg-go" id="rtgpgGo" type="button">Continue</button>';
      $('rtgpgGo').onclick=done;
      fillBoard();
      return;
    }

    if(canPlay()){
      // FREE with plays left. Rules show on the FIRST visit to a game only;
      // after that the player knows how to play and gets their personal best
      // instead (the ? button in the topbar keeps the rules one tap away).
      // Setting the same 'rtg:howto:<game>' flag howto.js reads also stops
      // its modal from re-onboarding right after this gate.
      var left=remaining();
      var unlimited = left===Infinity;
      var note = unlimited ? 'Unlimited plays' : 'Your free go at this one today';
      var upsell = unlimited ? '' :
        '<div class="rtgpg-note2">Want to play it more than once? <a class="rtgpg-link" id="rtgpgCard">Get an Arcade Card</a> for all ten games, unlimited.</div>';
      var mid;
      if(!INTRO_SEEN){
        mid='<div class="rtgpg-tag">How to play</div>'+
          '<ul class="rtgpg-rules">'+(RULES[GAME]||[]).map(function(r){ return '<li><b>›</b><span>'+esc(r)+'</span></li>'; }).join('')+'</ul>';
        try{ localStorage.setItem('rtg:howto:'+GAME,'1'); }catch(e){}
      } else {
        var hs=bestText();
        mid='<div class="rtgpg-tag">Welcome back</div>'+
          ((hs && hs.n!=='0')?('<div class="rtgpg-hs"><div class="rtgpg-stat"><div class="v">'+esc(hs.n)+'</div><div class="l">Your '+esc(hs.cap)+'</div></div></div>'):'')+
          '<div class="rtgpg-note2">Rules are under the ? button up top.</div>';
      }
      b.innerHTML=
        '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
        mid+
        '<div class="rtgpg-note">'+esc(note)+'</div>'+
        upsell+
        '<button class="rtgpg-go" id="rtgpgGo" type="button">Start</button>'+
        '<div><button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button></div>';
      $('rtgpgGo').onclick=done;
      $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
      if($('rtgpgSignin')) $('rtgpgSignin').onclick=openSignin;
      if($('rtgpgCard')) $('rtgpgCard').onclick=function(){ openCard('upsell'); };
      return;
    }

    // ---- blocked. Three different reasons, three different asks. ----
    var rules='<ul class="rtgpg-rules">'+(RULES[GAME]||[]).map(function(r){ return '<li><b>›</b><span>'+esc(r)+'</span></li>'; }).join('')+'</ul>';

    if(!signedIn()){
      // SIGNED OUT. Show what the game is before asking for anything: the rules
      // are the pitch, and a free account is the only thing standing between
      // them and playing it (if it is one of the free four).
      var isFree = T && T.isFreeGame ? T.isFreeGame(GAME) : false;
      b.innerHTML=
        '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
        '<div class="rtgpg-tag">How to play</div>'+
        rules+
        '<div class="rtgpg-note">'+(isFree
          ? 'Free to play with a free account. One go a day, on this and three other games.'
          : 'This one is part of the Arcade Card. Start with a free account and play the four free games today.')+'</div>'+
        '<button class="rtgpg-go" id="rtgpgGo" type="button">Create a free account</button>'+
        '<div><button class="rtgpg-ghost" id="rtgpgSignin" type="button">Already have one? Sign in</button></div>'+
        '<div><button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button></div>';
      $('rtgpgGo').onclick=function(){ if(window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open('signup'); else openSignin(); };
      $('rtgpgSignin').onclick=openSignin;
      $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
      return;
    }

    if(!unlocked()){
      // FREE ACCOUNT, CARD-ONLY GAME. Not "you ran out" - they never had it.
      // Say what it is, say what the card opens, point at what they can play now.
      b.innerHTML=
        '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
        '<div class="rtgpg-tag"><span class="rtgpg-lock">'+LOCK+'Arcade Card game</span></div>'+
        rules+
        '<ul class="rtgpg-perks">'+
          '<li><b>›</b><span>All ten games, as often as you like</span></li>'+
          '<li><b>›</b><span>NBA, NFL and MLB versions of every one</span></li>'+
          '<li><b>›</b><span>The Archive: every past day, still playable</span></li>'+
        '</ul>'+
        '<button class="rtgpg-go buy" id="rtgpgGo" type="button">Get the Arcade Card</button>'+
        '<div class="rtgpg-note2" style="margin-top:12px">Free today:</div>'+
        freeLinks()+
        '<div><button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button></div>';
      $('rtgpgGo').onclick=function(){ openCard('locked'); };
      $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
      return;
    }

    // FREE ACCOUNT, PLAY USED. The cap is per game, so there is always somewhere
    // else to send them: that is the whole reason the four exist.
    b.innerHTML=
      '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
      '<div class="rtgpg-tag">Back tomorrow</div>'+
      '<div class="rtgpg-note">That’s today’s go at '+esc(name)+'. A fresh one lands at midnight.</div>'+
      '<div class="rtgpg-note2">Still free today:</div>'+
      freeLinks()+
      '<button class="rtgpg-go buy" id="rtgpgGo" type="button">Play it again with the Arcade Card</button>'+
      '<div><button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button></div>';
    $('rtgpgGo').onclick=function(){ openCard('out'); };
    $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
  }

  // Games whose all-time record is a TIME (lower = better); everything else is a
  // RUN length (higher = better). These are exactly the games that submit with no
  // run_len (grid_runs scores them by time): match, guess, crossword.
  var TIMED = { match:1, guess:1, crossword:1 };
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(s){
    if(!s) return '';
    var m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return '';
    return MON[(+m[2])-1]+' '+(+m[3]);       // e.g. "Aug 10"
  }
  function fmtTime(s){ s=Math.max(0,Math.round(+s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

  function fillBoard(){
    var ol=$('rtgpgLb'); if(!ol) return;
    if(!(window.RTG_BOARD && RTG_BOARD.allTimeBoard)){ ol.innerHTML='<li class="empty">Leaderboard unavailable.</li>'; return; }
    var timed=!!TIMED[GAME];
    RTG_BOARD.allTimeBoard(GAME, 5).then(function(rows){
      if(!ol) return;
      if(!rows || !rows.length){ ol.innerHTML='<li class="empty">Be the first on the board!</li>'; return; }
      ol.innerHTML=rows.map(function(r,i){
        var amt = timed ? fmtTime(r.base_seconds) : String(r.run_len||0);
        var dt  = fmtDate(r.played_on);
        return '<li><span class="r">'+(i+1)+'</span>'+
          '<span class="n">'+esc(r.display_name||'Player')+'</span>'+
          (dt?'<span class="d">'+esc(dt)+'</span>':'')+
          '<span class="s">'+esc(amt)+'</span></li>';
      }).join('');
    }).catch(function(){ if(ol) ol.innerHTML='<li class="empty">Leaderboard unavailable.</li>'; });
  }

  build();
  // Entitlement is mirrored asynchronously (board.js → runthegrid_pro). If the
  // card flag arrives after first paint, re-render so a cardholder gets the card
  // view instead of the free view. No-op once the player has dismissed.
  if(window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(function(){ render(); });
})();
