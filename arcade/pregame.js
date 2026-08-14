/* pregame.js - the intro screen shown when you open a Run The Arcade game.
 *
 * Self-mounting (like auth-ui.js / card.js / calendar.js). On a game page it
 * shows a full-screen overlay BEFORE the board is touched:
 *   FREE, plays left     → how to play + "N plays left today" → Start
 *   FREE, out of plays   → "You're out of plays" → Get Arcade Card
 *   CARDHOLDER           → your high score + all-time leaderboard → Continue
 *
 * Why this is safe: every game charges its token only on the FIRST interaction
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
  var KNOWN = { table:1, match:1, career:1, oddone:1, rankit:1, almamater:1, guess:1, crossword:1 };
  if (!GAME || !KNOWN[GAME]) return;
  if (window.RTGArchive && RTGArchive.active && RTGArchive.active()) return;   // archive practice: no gate

  // How-to-play (2-3 short lines each).
  var RULES = {
    table:      ['Tap the bigger number.', 'One wrong pick ends the run. How far can you go?'],
    match:      ['Sort 20 names into 5 hidden groups of four.', 'Find them all before six mistakes.'],
    career:     ['Name the athlete from their team-by-team path.', 'One miss ends your run.'],
    oddone:     ['Four names share a connection, one doesn’t.', 'Pick the odd one out to keep the run alive.'],
    rankit:     ['Drag the five into the right order.', 'Two tries per set; clear it and get another.'],
    almamater:  ['Pick the college each player attended.', 'One miss ends your run.'],
    guess:      ['Guess the mystery player.', 'Eight tries, with a new clue each round.'],
    crossword:  ['Fill the sports mini crossword.', 'Beat the clock; no mistakes for a flawless.'],
  };
  // Personal-best source per game (localStorage). t:true = time in seconds.
  var BEST = {
    table:      { k:'rtg:table:v1',     f:'bestRun',    cap:'best run' },
    match:      { k:'grid_match_stats', f:'best',       cap:'best streak' },
    career:     { k:'rtg:career:v1',    f:'bestRun',    cap:'best run' },
    oddone:     { k:'rtg:oddone:v1',    f:'bestRun',    cap:'best run' },
    rankit:     { k:'rtg:rankit:v2',    f:'bestRun',    cap:'sets cleared' },
    almamater:  { k:'rtg:almamater:v1', f:'bestRun',    cap:'best run' },
    guess:      { k:'rtg:guess:v1',     f:'bestStreak', cap:'win streak' },
    crossword:  { k:'rtg:cw:v1',        f:'best',       cap:'best time', t:true },
  };

  var T = window.RTGTokens;
  function hasCard(){ return !!(T && T.hasCard && T.hasCard()); }
  function canPlay(){ return T && T.canPlay ? T.canPlay() : true; }
  function remaining(){ return T && T.remaining ? T.remaining() : Infinity; }
  function signedIn(){ return !!(T && T.signedIn && T.signedIn()); }
  function openSignin(){ if(window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open('signin'); }
  function openCard(){ if(window.RTGCard && RTGCard.paywall) RTGCard.paywall({ reason:'upsell' }); }
  function meta(){ return (window.RTGCalendar && RTGCalendar.get) ? RTGCalendar.get(GAME) : null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
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
      '.rtgpg-ghost:hover{color:var(--ink,#F4F7FB);}'
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
    // One click to play: if the player can play right now (cardholder, or has
    // plays left), don't gate at all — land them straight on a ready board.
    // The token is still charged on first interaction, and each game shows the
    // paywall itself if the server later says they're out. The overlay now only
    // appears when they're already out of plays.
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
      var note = unlimited ? 'Unlimited plays' : (left+' play'+(left===1?'':'s')+' left today');
      var upsell = unlimited ? '' :
        (signedIn()
          ? '<div class="rtgpg-note2">Want more? <a class="rtgpg-link" id="rtgpgCard">Get an Arcade Card</a> for unlimited plays.</div>'
          : '<div class="rtgpg-note2"><a class="rtgpg-link" id="rtgpgSignin">Sign in</a> for 3 a day, or <a class="rtgpg-link" id="rtgpgCard">get an Arcade Card</a> for unlimited.</div>');
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
      if($('rtgpgCard')) $('rtgpgCard').onclick=openCard;
      return;
    }

    // FREE out of plays: upsell (or, for a signed-out guest, sign in for 3/day)
    b.innerHTML=
      '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
      '<div class="rtgpg-tag">Out of plays</div>'+
      '<div class="rtgpg-note">'+(signedIn()
        ? 'You’ve used today’s free plays. Come back tomorrow, or get an Arcade Card for unlimited plays across every game.'
        : 'You’ve used today’s free play. Sign in for 3 free plays a day, or get an Arcade Card for unlimited plays.')+'</div>'+
      '<button class="rtgpg-go" id="rtgpgGo" type="button">'+(signedIn()?'Get Arcade Card':'Create free account')+'</button>'+
      '<div>'+
        (signedIn()?'':'<button class="rtgpg-ghost" id="rtgpgSignin" type="button">Have an account? Sign in</button> · ')+
        '<button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button>'+
      '</div>';
    $('rtgpgGo').onclick=function(){ if(window.RTGCard && RTGCard.wall) RTGCard.wall(); else if(window.RTGCard && RTGCard.paywall) RTGCard.paywall({reason:'out'}); };
    $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
    if($('rtgpgSignin')) $('rtgpgSignin').onclick=openSignin;
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
