/* referral.js - Run The Arcade "invite a friend" client (RTGReferral).
 *
 * The promotion: share your link, a friend signs up through it, and you BOTH
 * get one extra go at each of today's free games. The server owns the reward
 * (supabase/83_referrals.sql); this module is the three client jobs around it:
 *
 *   1. CAPTURE   Any arcade page opened with ?ref=CODE stashes the code, so it
 *                survives the trip through sign-up (which reloads the page and,
 *                for OAuth, bounces off Google and back).
 *   2. CLAIM     The instant a session exists and a code is waiting, redeem it.
 *                Runs once; a settled or refused code is cleared so it can't
 *                loop. On success the wallet's bonus is refreshed immediately
 *                so the extra play is available without waiting for a reload.
 *   3. LINK      Build the caller's own share URL from their code, and read
 *                their invited-count for a share card.
 *
 * Everything degrades to nothing if board.js / the RPCs are absent: no code, no
 * claim, no error. window.RTGReferral.
 */
(function () {
  'use strict';
  var LS = window.localStorage;
  var PENDING = 'rtg:ref:pending';   // a code captured from a link, awaiting signup
  var CLAIMED = 'rtg:ref:claimed';   // set once we've redeemed (or given up on) a code
  var JOIN_PATH = '/arcade/join/';

  function emit(name, detail){
    try{ document.dispatchEvent(new CustomEvent(name, { detail: detail || null })); }catch(e){}
  }
  function clean(code){ return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); }

  // ---- 1. capture a code from the URL --------------------------------------
  function fromUrl(){
    try{
      var m = (location.search || '').match(/[?&]ref=([^&]+)/i);
      return m ? clean(decodeURIComponent(m[1])) : '';
    }catch(e){ return ''; }
  }
  function pending(){ try{ return clean(LS.getItem(PENDING) || ''); }catch(e){ return ''; } }
  function setPending(code){ try{ if(code) LS.setItem(PENDING, code); }catch(e){} }
  function clearPending(){ try{ LS.removeItem(PENDING); }catch(e){} }

  function capture(){
    var code = fromUrl();
    if(!code) return '';
    // Don't overwrite a code already banked and not yet claimed: the first link
    // that brought someone in is the one that should pay out.
    if(!pending()) setPending(code);
    return code;
  }

  // ---- 2. claim once signed in ---------------------------------------------
  var claiming = false, claimedThisLoad = false;
  function claimPending(){
    if(claiming || claimedThisLoad) return;
    var code = pending();
    if(!code) return;
    if(!(window.RTG_BOARD && RTG_BOARD.referralClaim)) return;
    // signed-in check via the wallet (synchronous, no network)
    if(!(window.RTGTokens && RTGTokens.signedIn && RTGTokens.signedIn())) return;
    claiming = true;
    RTG_BOARD.referralClaim(code).then(function(res){
      claiming = false;
      if(!res) return;                 // offline / RPC missing: leave the code for next load
      claimedThisLoad = true;
      // Whatever the verdict, this code is spent for this account: clear it so a
      // reload can't re-fire. A genuine "already referred" is just as final as a
      // success from the client's point of view.
      clearPending();
      try{ LS.setItem(CLAIMED, code); }catch(e){}
      if(res.ok){
        // reward landed. Pull the fresh bonus into the wallet now so the extra
        // play is live immediately, then tell the page.
        if(window.RTG_BOARD && RTG_BOARD.tokenStatus){
          RTG_BOARD.tokenStatus().then(function(s){
            if(s && !s.unlimited && window.RTGTokens && RTGTokens.setServerBonus) RTGTokens.setServerBonus(s.bonus||0);
            emit('rtg:tokens');
          }).catch(function(){});
        }
        emit('rtg:referral:claimed', res);
      } else {
        emit('rtg:referral:declined', res);
      }
    }).catch(function(){ claiming = false; });
  }

  // ---- 3. the caller's own link + stats ------------------------------------
  function origin(){
    try{
      // canonical host in production, whatever host in dev/preview
      if(/runthe\.gg$/i.test(location.hostname)) return 'https://runthe.gg';
      return location.origin;
    }catch(e){ return 'https://runthe.gg'; }
  }
  function buildLink(code){ return code ? (origin() + JOIN_PATH + '?ref=' + encodeURIComponent(code)) : ''; }

  var codeCache = null;
  function code(cb){
    if(codeCache){ cb(codeCache); return; }
    if(!(window.RTG_BOARD && RTG_BOARD.referralCode)){ cb(null); return; }
    RTG_BOARD.referralCode().then(function(c){ if(c) codeCache = clean(c); cb(codeCache); })
      .catch(function(){ cb(null); });
  }
  function link(cb){ code(function(c){ cb(buildLink(c), c); }); }
  function stats(cb){
    if(!(window.RTG_BOARD && RTG_BOARD.referralStats)){ cb(null); return; }
    RTG_BOARD.referralStats().then(cb).catch(function(){ cb(null); });
  }

  // ---- boot ----------------------------------------------------------------
  capture();
  // Claim as soon as auth is ready, and on any later sign-in (board.js fires
  // onChange with the current state on subscribe, so a page that loads already
  // signed-in claims on the first tick).
  function wire(){
    if(window.RTG_BOARD && RTG_BOARD.onChange){
      RTG_BOARD.onChange(function(st){ if(st && st.signedIn) claimPending(); });
    } else {
      // board.js not up yet: retry briefly, then rely on the tokens/auth events.
      var n=0, t=setInterval(function(){ if(++n>40 || (window.RTG_BOARD && RTG_BOARD.onChange)){ clearInterval(t); if(window.RTG_BOARD && RTG_BOARD.onChange) RTG_BOARD.onChange(function(st){ if(st && st.signedIn) claimPending(); }); } }, 250);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // ---- share: hand the inviter their link ----------------------------------
  // Native share sheet where there is one (phones), clipboard everywhere else,
  // with a toast either way. cb(ok) fires when the link is out the door.
  var SHARE_TEXT = 'Play Run The Arcade with me: ten quick daily sports puzzles. Sign up with my link and we both get an extra go today.';
  function toast(msg){
    try{
      var el=document.getElementById('rtg-ref-toast');
      if(!el){ el=document.createElement('div'); el.id='rtg-ref-toast';
        el.style.cssText='position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483000;'+
          'max-width:min(92vw,420px);padding:11px 16px;border-radius:12px;background:#123;color:#EAF6FF;'+
          'border:1px solid rgba(55,197,213,.5);font:700 13px/1.4 system-ui,sans-serif;text-align:center;'+
          'box-shadow:0 14px 40px -12px rgba(0,0,0,.7);';
        document.body.appendChild(el); }
      el.textContent=msg; clearTimeout(toast.t);
      toast.t=setTimeout(function(){ if(el&&el.parentNode) el.parentNode.removeChild(el); }, 3200);
    }catch(e){}
  }
  function signedIn(){ try{ return !!(window.RTGTokens && RTGTokens.signedIn && RTGTokens.signedIn()); }catch(e){ return false; } }
  function share(cb){
    link(function(url){
      if(!url){
        // A signed-in player with no link did not fail to sign in: the code
        // fetch did (offline, or the RPC/migration is missing). Say the true
        // thing, and leave the real cause in the console (board.js logs it).
        toast(signedIn() ? 'Could not fetch your invite link. Please try again.'
                         : 'Sign in to get your invite link');
        if(cb) cb(false); return;
      }
      if(navigator.share){
        navigator.share({ title:'Run The Arcade', text:SHARE_TEXT, url:url })
          .then(function(){ if(cb) cb(true); })
          .catch(function(){ if(cb) cb(false); });   // user dismissed: no toast
        return;
      }
      var done=function(ok){ toast(ok?'Invite link copied':'Copy this link: '+url); if(cb) cb(ok); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(function(){ done(true); }, function(){ done(false); });
      } else { done(false); }
    });
  }

  // ---- the result-modal invite ad -----------------------------------------
  // Every game ends on a result sheet (#scrim .sheet or #resultModal). This
  // drops one invite row into the foot of it, so the reward is offered at the
  // moment a player just finished and is deciding what to do next. Self-mounting
  // like resultstats.js: same sheet resolver, same observer, idempotent.
  function signedInNow(){ try{ return !!(window.RTGTokens && RTGTokens.signedIn && RTGTokens.signedIn()); }catch(e){ return false; } }
  function findSheet(){
    return document.querySelector('#scrim .sheet') ||
           document.querySelector('#scrim .modal') ||
           document.querySelector('#resultModal .sheet') ||
           document.querySelector('#resultModal .modal');
  }
  function adStyles(){
    if(document.getElementById('rtg-ref-ad-style')) return;
    var s=document.createElement('style'); s.id='rtg-ref-ad-style';
    s.textContent=[
      '.rtgref-ad{margin:14px 0 2px;padding:13px 14px;border-radius:13px;text-align:center;'+
        'background:color-mix(in srgb, var(--green,#48D17A) 12%, transparent);'+
        'border:1px solid color-mix(in srgb, var(--green,#48D17A) 42%, transparent);}',
      '.rtgref-ad .h{font-weight:900;font-size:13.5px;color:var(--ink,#F4F7FB);line-height:1.35;}',
      '.rtgref-ad .h b{color:var(--greenT,#48D17A);}',
      '.rtgref-ad .s{font-size:11.5px;color:var(--mut,#A9B8CB);font-weight:600;margin-top:3px;line-height:1.4;}',
      '.rtgref-ad button{appearance:none;cursor:pointer;font-family:var(--f,inherit);font-weight:800;font-size:13.5px;'+
        'margin-top:10px;width:100%;min-height:44px;border-radius:11px;padding:11px 14px;display:flex;'+
        'align-items:center;justify-content:center;gap:8px;color:#06210f;'+
        'background:var(--green,#48D17A);border:1px solid rgba(0,0,0,.2);}',
      '.rtgref-ad button:hover{filter:brightness(1.05);}'
    ].join('');
    document.head.appendChild(s);
  }
  function decorateResult(){
    var sheet=findSheet(); if(!sheet) return;
    if(!signedInNow()) return;                       // no account = no code to share
    if(!(window.RTG_BOARD && RTG_BOARD.referralCode)) return;
    if(sheet.querySelector('.rtgref-ad')) return;    // already placed on this sheet
    adStyles();
    var ad=document.createElement('div');
    ad.className='rtgref-ad';
    ad.innerHTML='<div class="h">Out of goes? <b>Bring a friend for another.</b></div>'+
      '<div class="s">They sign up with your link, you both get an extra go at today’s games.</div>'+
      '<button type="button"><span aria-hidden="true">🎟️</span> Invite a friend</button>';
    ad.querySelector('button').addEventListener('click', function(){ share(); });
    sheet.appendChild(ad);                            // foot of the modal
  }
  function watchResult(){
    // only game pages have a result modal; the hub/join do not
    var scrim=document.getElementById('scrim');
    var rm=document.getElementById('resultModal');
    if(!scrim && !rm) return;
    var check=function(){
      if(scrim && !scrim.classList.contains('hidden') && !scrim.hasAttribute('hidden')) decorateResult();
      if(rm && !rm.hasAttribute('hidden')) decorateResult();
    };
    if(window.MutationObserver){
      if(scrim) new MutationObserver(check).observe(scrim, { attributes:true, attributeFilter:['class','hidden'] });
      if(rm) new MutationObserver(check).observe(rm, { attributes:true, attributeFilter:['hidden'] });
    }
    check();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', watchResult);
  else watchResult();

  // ---- "you're out of free games today" prompt ----------------------------
  // When a signed-in free player has used every free play for the day, the hub
  // pops one invite prompt: the natural moment to want more, and the reward is
  // exactly more. Once per day (a nagging pop-up is worse than none), never for
  // cardholders (unlimited, never tapped out), and only on the hub so it never
  // stacks over a game's own result modal, which already carries the ad.
  function onHub(){
    var p = location.pathname || '';
    return /\/arcade\/?$/.test(p) || /\/arcade\/index\.html$/.test(p);
  }
  function tier(){ try{ return window.RTGTokens && RTGTokens.tier ? RTGTokens.tier() : (signedIn()?'free':'guest'); }catch(e){ return 'guest'; } }
  function tappedOut(){
    try{ return !!(window.RTGTokens && RTGTokens.remaining && RTGTokens.remaining() === 0); }catch(e){ return false; }
  }
  function exhaustKey(){ return 'rtg:ref:exhausted:' + (window.RTGTokens && RTGTokens.today ? RTGTokens.today() : ''); }
  function exhaustSeen(){ try{ return !!localStorage.getItem(exhaustKey()); }catch(e){ return false; } }
  function markExhaust(){ try{ localStorage.setItem(exhaustKey(), '1'); }catch(e){} }

  function promptStyles(){
    if(document.getElementById('rtg-ref-modal-style')) return;
    var s=document.createElement('style'); s.id='rtg-ref-modal-style';
    s.textContent=[
      '.rtgref-scrim{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;'+
        'padding:20px;background:rgba(3,9,18,.72);backdrop-filter:blur(4px);}',
      '.rtgref-modal{width:100%;max-width:380px;background:var(--card,#10233A);color:var(--ink,#F4F7FB);'+
        'border:1px solid color-mix(in srgb, var(--green,#48D17A) 40%, var(--line2,rgba(244,247,251,.15)));'+
        'border-radius:18px;padding:24px 20px 20px;text-align:center;box-shadow:0 30px 90px -20px rgba(0,0,0,.8);}',
      '.rtgref-modal .cap{width:60px;height:60px;margin:0 auto 12px;border-radius:14px;display:grid;place-items:center;'+
        'font-size:30px;background:color-mix(in srgb, var(--green,#48D17A) 16%, var(--card2,#162B44));'+
        'border:1px solid color-mix(in srgb, var(--green,#48D17A) 40%, transparent);}',
      '.rtgref-modal h2{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.02em;text-transform:uppercase;'+
        'font-size:24px;line-height:1.08;margin:0 0 8px;}',
      '.rtgref-modal p{font-size:13.5px;color:var(--mut,#A9B8CB);line-height:1.5;margin:0 auto 18px;max-width:300px;}',
      '.rtgref-modal .go{appearance:none;border:0;cursor:pointer;font-family:var(--f,inherit);font-weight:900;font-size:15px;'+
        'width:100%;min-height:52px;border-radius:13px;padding:15px;display:flex;align-items:center;justify-content:center;gap:9px;'+
        'color:#06210f;background:var(--green,#48D17A);box-shadow:var(--shadow,0 6px 18px -10px rgba(0,0,0,.55));}',
      '.rtgref-modal .go:hover{filter:brightness(1.05);}',
      '.rtgref-modal .later{appearance:none;border:0;background:none;cursor:pointer;font-family:var(--f,inherit);'+
        'font-weight:800;font-size:12.5px;color:var(--mut,#A9B8CB);margin-top:12px;padding:6px;text-decoration:underline;}'
    ].join('');
    document.head.appendChild(s);
  }
  function showExhaustPrompt(){
    if(document.getElementById('rtg-ref-scrim')) return;
    promptStyles();
    var scrim=document.createElement('div');
    scrim.className='rtgref-scrim'; scrim.id='rtg-ref-scrim';
    scrim.setAttribute('role','dialog'); scrim.setAttribute('aria-modal','true');
    scrim.innerHTML=
      '<div class="rtgref-modal">'+
        '<div class="cap" aria-hidden="true">🎟️</div>'+
        '<h2>That’s all four for today</h2>'+
        '<p>Want more? Invite a friend. When they sign up with your link, you <b>both</b> get another go at today’s games.</p>'+
        '<button class="go" type="button" id="rtgRefGo"><span aria-hidden="true">🎟️</span> Invite a friend</button>'+
        '<div><button class="later" type="button" id="rtgRefLater">Maybe later</button></div>'+
      '</div>';
    function close(){ if(scrim && scrim.parentNode) scrim.parentNode.removeChild(scrim); }
    scrim.addEventListener('click', function(e){ if(e.target===scrim) close(); });
    document.body.appendChild(scrim);
    document.getElementById('rtgRefGo').addEventListener('click', function(){ share(); close(); });
    document.getElementById('rtgRefLater').addEventListener('click', close);
  }
  function maybeExhaustPrompt(){
    if(!onHub()) return;
    if(tier()!=='free') return;                 // guests can't earn; cardholders never run out
    if(!tappedOut()) return;
    if(exhaustSeen()) return;
    if(!(window.RTG_BOARD && RTG_BOARD.referralCode)) return;   // no way to make a link: stay quiet
    markExhaust();                              // once per day, set before showing so it can't double-fire
    showExhaustPrompt();
  }
  // Check on load and whenever plays change (card.js reconciles the server
  // floor after boot, which is often the moment the tapped-out truth arrives).
  function wireExhaust(){
    if(!onHub()) return;
    document.addEventListener('rtg:tokens', maybeExhaustPrompt);
    setTimeout(maybeExhaustPrompt, 1500);      // after reconcile settles
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wireExhaust);
  else wireExhaust();

  window.RTGReferral = {
    capture: capture,
    pending: pending,
    claimPending: claimPending,
    link: link,
    code: code,
    stats: stats,
    share: share,
    buildLink: buildLink,
    decorateResult: decorateResult,
    maybeExhaustPrompt: maybeExhaustPrompt
  };
})();
