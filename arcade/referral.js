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
  function share(cb){
    link(function(url){
      if(!url){ toast('Sign in to get your invite link'); if(cb) cb(false); return; }
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

  window.RTGReferral = {
    capture: capture,
    pending: pending,
    claimPending: claimPending,
    link: link,
    code: code,
    stats: stats,
    share: share,
    buildLink: buildLink
  };
})();
