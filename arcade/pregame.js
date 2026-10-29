/* pregame.js - the gate shown when you open a Run The Arcade game.
 *
 * Self-mounting (like auth-ui.js / card.js / calendar.js). If the player can
 * play this game right now it stays out of the way entirely: one click to play,
 * straight onto a ready board. It only appears when they cannot, and then it
 * says which of the three reasons it is:
 *   SIGNED OUT, CARD GAME → "Create a free account"
 *   SIGNED OUT, FREE GAME → nothing: they play, same as an account holder
 *   FREE, card-only game → "This one is on the Arcade Card"
 *   FREE, play used      → "Back tomorrow", plus the four other free games
 *   FREE, free look open → no screen, one line above the board (trialNotice)
 *   CARDHOLDER           → never (they can always play)
 *
 * None of them teaches the game any more: the board has a line of
 * instruction and the ? holds the rest. A wall says why you cannot play.
 *
 * Why this is safe: every game charges its play only on the FIRST interaction
 * (startAttempt via startIfNeeded), never on load. This overlay sits in front
 * of the board, so nothing is spent until the player dismisses it and plays -
 * no game code changes, no double spend. Skipped entirely in archive practice.
 *
 * Reads tier from RTGTokens, name/accent from RTGCalendar and the paywall
 * from RTGCard. All optional:
 * with any of them missing the overlay degrades gracefully (and never blocks).
 */
(function () {
  'use strict';

  function gameKey(){ var m=(location.pathname||'').match(/\/arcade\/([a-z]+)\//); return m?m[1]:null; }
  var GAME = gameKey();
  // High Low was the one game missing from this list, and it is an Arcade Card
  // game, so it was the one that could spend a player's single free look with
  // no screen in front of it at all.
  var KNOWN = { table:1, match:1, career:1, oddone:1, rankit:1, almamater:1, guess:1, crossword:1, sportegories:1, rollcall:1, chain:1, highlow:1 };
  if (!GAME || !KNOWN[GAME]) return;
  if (window.RTGArchive && RTGArchive.active && RTGArchive.active()) return;   // archive practice: no gate


  var T = window.RTGTokens;
  function hasCard(){ return !!(T && T.hasCard && T.hasCard()); }
  function canPlay(){ return T && T.canPlay ? T.canPlay(GAME) : true; }
  function remaining(){ return T && T.remaining ? T.remaining(GAME) : Infinity; }
  function signedIn(){ return !!(T && T.signedIn && T.signedIn()); }
  function unlocked(){ return T && T.unlocked ? T.unlocked(GAME) : true; }
  // The one free look at an Arcade Card game. Open = they have it and have not
  // taken it; used = they have played this game once and that was that.
  function trialOpen(){ return !!(T && T.trialOpen && T.trialOpen(GAME)); }
  function trialUsed(){ return !!(T && T.trialUsed && !hasCard() && T.trialUsed(GAME)
                                  && T.isFreeGame && !T.isFreeGame(GAME)); }
  // Inviting needs a signed-in account (that is where the code comes from) and
  // the referral module present. Cardholders are unlimited, so they never see
  // the out-of-plays screen this sits on.
  function canInvite(){ return signedIn() && !!(window.RTGReferral && RTGReferral.share); }
  // The four free games, minus this one, as a readable list for the "come back
  // tomorrow" screen: the whole point of a per-game cap is that there is always
  // something else to go and play right now.
  function otherFree(){
    var list=(T && T.FREE_GAMES) ? T.FREE_GAMES : [];
    var out=[];
    for(var i=0;i<list.length;i++){
      if(list[i]===GAME) continue;
      /* "Still free today" means a game they can still open. It used to list
         all four whatever had been played, so a player who had done every one
         was sent round in a circle of walls. An unfinished game still counts:
         it is waiting for them. */
      var open = !T || !T.remainingOf || T.remainingOf(list[i])>0 || (T.inProgress && T.inProgress(list[i]));
      if(!open) continue;
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
  // The label and the links together, or one plain sentence when there is
  // nothing left to send them to.
  function freeBlock(label, style){
    var links=freeLinks();
    if(!links) return '<div class="rtgpg-note2"'+(style||'')+'>You’ve played all four free games today. New ones drop at midnight.</div>';
    return '<div class="rtgpg-note2"'+(style||'')+'>'+label+'</div>'+links;
  }
  function openSignin(){ if(window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open('signin'); }
  function openCard(reason){ if(window.RTGCard && RTGCard.paywall) RTGCard.paywall({ reason: reason || 'upsell' }); }
  function meta(){ return (window.RTGCalendar && RTGCalendar.get) ? RTGCalendar.get(GAME) : null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  var LOCK='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  /* Our own marks, never stock emoji. RTGIcons loads ahead of this file on every
     arcade page. A miss returns an empty string rather than throwing, because
     this is the screen a player meets when their go is spent and it must render
     with or without its decoration. */
  function icon(name, opts){
    try{ return (window.RTGIcons && RTGIcons.get(name, opts)) || ''; }catch(e){ return ''; }
  }
  function $(id){ return document.getElementById(id); }


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
      '.rtgpg-go{appearance:none;border:0;cursor:pointer;font-family:var(--f,inherit);font-weight:900;font-style:italic;font-size:16px;letter-spacing:.02em;border-radius:13px;padding:15px 20px;min-height:52px;width:100%;color:#fff;background:var(--c,var(--blue,#2F6BFF));box-shadow:var(--shadow,0 6px 18px -10px rgba(0,0,0,.55));text-shadow:0 1px 2px rgba(0,0,0,.28);}',
      '.rtgpg-go:hover{filter:brightness(1.07);}',
      '.rtgpg-note{font-size:12px;color:var(--mut,#A9B8CB);font-weight:700;margin:0 0 6px;}',
      '.rtgpg-note2{font-size:12px;color:var(--mut,#A9B8CB);font-weight:600;line-height:1.5;margin:0 0 14px;}',
      '.rtgpg-link{color:var(--c,var(--blue,#2F6BFF));font-weight:800;cursor:pointer;text-decoration:underline;}',
      '.rtgpg-ghost{appearance:none;border:0;background:none;cursor:pointer;font-family:var(--f,inherit);font-weight:800;font-size:12.5px;color:var(--mut,#A9B8CB);margin-top:12px;padding:6px;text-decoration:underline;}',
      '.rtgpg-ghost:hover{color:var(--ink,#F4F7FB);}',
      '.rtgpg-lock{display:inline-flex;align-items:center;gap:6px;}',
      // Invite affordance: a full-width secondary action, green (a bonus, not a
      // purchase), sitting above the Arcade Card upsell when a free player is
      // out of plays. This is the moment the referral pays off, so it leads.
      //
      // The label is ONE flex item, not three. Loose text and a <b> beside the
      // icon each become their own anonymous flex item, so the sentence broke
      // into stacked fragments ("Invite a friend," on its own line, the rest in
      // a block next to it) instead of wrapping like a sentence.
      '.rtgpg-invite{appearance:none;cursor:pointer;font-family:var(--f,inherit);font-weight:800;font-size:14px;'+
        'width:100%;min-height:50px;border-radius:13px;padding:13px 16px;margin:0 0 10px;'+
        'color:var(--greenT,#48D17A);background:color-mix(in srgb, var(--green,#48D17A) 14%, transparent);'+
        'border:1px solid color-mix(in srgb, var(--green,#48D17A) 45%, transparent);'+
        'display:flex;align-items:center;justify-content:center;gap:9px;text-align:left;line-height:1.35;}',
      '.rtgpg-invite:hover{background:color-mix(in srgb, var(--green,#48D17A) 22%, transparent);}',
      '.rtgpg-invite .ic{flex:0 0 auto;font-size:16px;line-height:1;}',
      '.rtgpg-invite .tx{flex:0 1 auto;}',
      '.rtgpg-invite b{color:var(--ink,#F4F7FB);font-weight:900;}',
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

  function trialNotice(){
    // the words live in gamehead.js, which draws this line before first paint
    var html=(window.RTGGameHead && RTGGameHead.TRIAL) ||
      ('Your one free play. It’s spent once you start. '+
       '<button type="button" id="rtgpgCardLine">See the Arcade Card</button>');
    function put(){
      var el=document.getElementById('rtgpgTrial');
      // already drawn by gamehead.js during parse: only wire its button
      if(el){ var b0=document.getElementById('rtgpgCardLine'); if(b0) b0.onclick=function(){ openCard('trial'); }; return; }
      if(window.RTGGameHead && RTGGameHead.notice) el=RTGGameHead.notice(html, { id:'rtgpgTrial' });
      else {
        var tb=document.querySelector('.topbar'); if(!tb||!tb.parentNode) return;
        el=document.createElement('div'); el.id='rtgpgTrial'; el.className='rtggh-notice'; el.innerHTML=html;
        tb.parentNode.insertBefore(el, tb.nextSibling);
      }
      var b=document.getElementById('rtgpgCardLine'); if(b) b.onclick=function(){ openCard('trial'); };
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', put); else put();
  }
  function build(){
    // One click to play: if the player can play this game right now, don't gate
    // at all - land them straight on a ready board. The play is still charged on
    // first interaction, and each game shows the paywall itself if the server
    // later disagrees. The overlay only appears when they cannot play.
    //
    // The free look at a card game is the exception, and it is the one screen
    // this file exists for. That play is spent on the first tap and never comes
    // back, so it is the one time the player has to be TOLD before they start.
    // Landing them silently on the board would burn it on a mis-tap.
    if (hasCard() || (canPlay() && !trialOpen())) { dismissed = true; return; }
    /* THE FREE LOOK IS ONE LINE NOW, not a screen. It still has to be said
       before the first tap, because that tap spends a play that never comes
       back, so it sits above the board where the eye lands first. */
    if (canPlay() && trialOpen()) { dismissed = true; trialNotice(); return; }
    // A game started today and not finished is not a spent play: the page
    // restores it, so there is nothing to gate. See RTGTokens.inProgress.
    if (T && T.inProgress && T.inProgress(GAME)) { dismissed = true; return; }
    injectStyles();
    scrim=document.createElement('div'); scrim.className='rtgpg-scrim';
    var m=meta();
    scrim.innerHTML=
      '<div class="rtgpg" role="dialog" aria-modal="true"'+(m?' style="--c:'+m.accent+'"':'')+'>'+
        /* The cap wants the game's own mark. It used to read m.icon off the
           calendar entry, which has never carried one, so this was a 96px band
           of flat colour on every gate on every game. gamemarks.js is where the
           drawings live, and data-mark is how every other surface asks for one. */
        '<div class="rtgpg-cap" data-mark="'+esc(GAME)+'" aria-hidden="true"></div>'+
        '<div class="rtgpg-body" id="rtgpgBody"></div>'+
      '</div>';
    document.body.appendChild(scrim);
    // fill() ran at DOMContentLoaded, long before this node existed
    try{ if(window.RTGGameMarks) RTGGameMarks.fill(scrim); }catch(e){}
    render();
  }
  function done(){
    dismissed=true;
    if(scrim){ scrim.remove(); scrim=null; }
    try{ document.body.style.overflow=''; }catch(e){}
  }

  function render(){ renderBody(); }
  function renderBody(){
    if(dismissed || !scrim) return;
    try{ document.body.style.overflow='hidden'; }catch(e){}
    /* High Low has no archive, so the calendar has no entry for it and this
       used to print "This game" on its gate. The share module names all twelve. */
    var m=meta(), name=(m&&m.name)||(window.RTGShare&&RTGShare.NAMES&&RTGShare.NAMES[GAME])||(GAME==='highlow'?'High Low':'This game');
    var b=$('rtgpgBody'); if(!b) return;

    /* Playable now (the entitlement can land after this wall went up): no
       screen at all, straight onto the board, with the free-play line if
       this is a free look at a card game. */
    if(hasCard() || canPlay()){
      done();
      if(!hasCard() && trialOpen()) trialNotice();
      return;
    }

    // ---- blocked. Three different reasons, three different asks. ----

    /* SIGNED OUT ON A CARD GAME. Not on a free one: those need no account at
       all now, so a signed-out visitor who reaches the blocked section on one
       of the four has simply had today's go, and that is the last screen in
       this function, not this one. Sending them to a sign-up box instead
       answered a question they had not asked and charged them an account for a
       play that does not exist yet. */
    if(!signedIn() && !(T && T.isFreeGame && T.isFreeGame(GAME))){
      // Show what the game is before asking for anything: the rules are the
      // pitch, and the account is what hands them a play of it.
      b.innerHTML=
        '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
        '<div class="rtgpg-note">This one’s on the Arcade Card. A free account gets you one play of it, plus one play of every other card game. Four games are free every day, no account needed.</div>'+
        '<button class="rtgpg-go" id="rtgpgGo" type="button">Create a free account</button>'+
        '<div><button class="rtgpg-ghost" id="rtgpgSignin" type="button">Already have one? Sign in</button></div>'+
        '<div><button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button></div>';
      $('rtgpgGo').onclick=function(){ if(window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open('signup', { src:'pregame_cardgame' }); else openSignin(); };
      $('rtgpgSignin').onclick=openSignin;
      $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
      return;
    }

    if(!unlocked()){
      /* FREE ACCOUNT, CARD-ONLY GAME. Two players land here and they are not
         the same person. One has never seen this game, so the rules ARE the
         pitch. The other just played it on their free look, so repeating the
         rules at them is noise: they know what it is, they liked it enough to
         come back, and the only honest line is that this is the door and the
         card is the key. */
      var tried = trialUsed();
      b.innerHTML=
        '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
        (tried
          ? '<div class="rtgpg-tag"><span class="rtgpg-lock">'+LOCK+'Free play used</span></div>'+
            '<div class="rtgpg-note">You’ve used your free play of '+esc(name)+'. The Arcade Card opens it back up, as often as you want.</div>'
          : '<div class="rtgpg-tag"><span class="rtgpg-lock">'+LOCK+'Arcade Card game</span></div>')+
        '<ul class="rtgpg-perks">'+
          '<li><b>›</b><span>All twelve games, as often as you want</span></li>'+
          '<li><b>›</b><span>NBA, NFL and MLB editions of five of them</span></li>'+
          '<li><b>›</b><span>The Archive: every past day, still playable</span></li>'+
        '</ul>'+
        '<button class="rtgpg-go buy" id="rtgpgGo" type="button">Get the Arcade Card</button>'+
        freeBlock('Free today:', ' style="margin-top:12px"')+
        '<div><button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button></div>';
      $('rtgpgGo').onclick=function(){ openCard('locked'); };
      $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
      return;
    }

    // PLAY USED, account or not. The cap is per game, so there is always
    // somewhere else to send them: that is the whole reason the four exist.
    // A GUEST lands here too now, and they are the one person on this screen
    // with something to gain by signing up, because the run they just finished
    // is sitting in this browser and nowhere else: board.js posts nothing
    // without a session. So the ask is the result they already have, not a
    // play they have not had.
    b.innerHTML=
      '<h2 class="rtgpg-nm">'+esc(name)+'</h2>'+
      '<div class="rtgpg-tag">Back tomorrow</div>'+
      '<div class="rtgpg-note">That’s your go at '+esc(name)+' for today. A new one drops at midnight.</div>'+
      freeBlock('Still free today:')+
      /* Both wore a ticket, and neither is one. Signing up and inviting are
         both "add a person", which is what the mark draws. */
      (!signedIn()
        ? '<button class="rtgpg-invite" id="rtgpgAcct" type="button">'+
            '<span class="ic">'+icon('invite')+'</span>'+
            '<span class="tx">Free account: <b>keep your streak, get on the leaderboard</b>, and play every Card game once</span>'+
          '</button>'
        : '')+
      (canInvite()
        ? '<button class="rtgpg-invite" id="rtgpgInvite" type="button">'+
            '<span class="ic">'+icon('invite')+'</span>'+
            '<span class="tx">Invite a friend. <b>You both get another go today!</b></span>'+
          '</button>'
        : '')+
      '<button class="rtgpg-go buy" id="rtgpgGo" type="button">Play it again with the Arcade Card</button>'+
      /* This wall covers the whole page, the board's rail included, so without
         a way through it the only answer to "how did I do against everyone
         else" is to come back tomorrow. */
      (window.RTG_LB ? '<div><button class="rtgpg-ghost" id="rtgpgLb" type="button">Today’s leaderboard</button></div>' : '')+
      '<div><button class="rtgpg-ghost" id="rtgpgBack" type="button">Back to the arcade</button></div>';
    $('rtgpgGo').onclick=function(){ openCard('out'); };
    $('rtgpgBack').onclick=function(){ location.href='/arcade/'; };
    if($('rtgpgLb')) $('rtgpgLb').onclick=function(){ try{ RTG_LB.open(); }catch(e){} };
    if($('rtgpgInvite')) $('rtgpgInvite').onclick=function(){ if(window.RTGReferral) RTGReferral.share(); };
    if($('rtgpgAcct')) $('rtgpgAcct').onclick=function(){ if(window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open('signup', { src:'pregame_spent' }); else openSignin(); };
  }

  build();
  // Entitlement is mirrored asynchronously (board.js → runthegrid_pro). If the
  // card flag arrives after first paint, re-render so a cardholder gets the card
  // view instead of the free view. No-op once the player has dismissed.
  if(window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(function(){
    render();
    // the entitlement can land after boot: a cardholder loses the free-play
    // line, and a free account whose look is still open gains it
    var line=document.getElementById('rtgpgTrial');
    if(hasCard() && line && window.RTGGameHead) RTGGameHead.clearNotice();
    else if(!scrim && !line && !hasCard() && canPlay() && trialOpen()) trialNotice();
  });
})();
