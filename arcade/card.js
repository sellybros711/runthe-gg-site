/*
 * card.js - the Arcade Card surface for Run The Arcade.
 *
 * One shared, self-mounting module (like auth-ui.js) that every arcade page can
 * use for the consumer monetization UI:
 *   RTGCard.paywall(opts)   - "Out of plays" → Arcade Card upsell (monthly/annual,
 *                             + tax, and a friendly "Come back tomorrow")
 *   RTGCard.guestConvert()  - after a guest spends their 1 free play: "create a free
 *                             account for 3 plays a day" conversion
 *   RTGCard.checkout(plan)  - start Arcade Card checkout ($5.99/mo or $49.99/yr). If
 *                             the visitor isn't signed in, we open sign-in first and
 *                             resume checkout after, preserving the chosen plan.
 *   RTGCard.portal()        - open the Stripe Customer Portal (manage/cancel)
 *
 * Entitlement + token truth are elsewhere (tokens.js / board.js / the server RPCs);
 * this file is presentation + the checkout/portal calls. Fails soft: with the
 * network or supabase blocked the modals still render and explain what's up.
 */
(function () {
  'use strict';

  var MONTHLY = { plan: 'monthly', price: '$5.99', per: 'month', bill: '$5.99/month' };
  var ANNUAL  = { plan: 'annual',  price: '$49.99', per: 'year', bill: '$49.99/year', permo: '$4.17/mo',
                  save: 'SAVE 30%', anchor: '$71.88' };

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function $(id){ return document.getElementById(id); }
  function userId(){
    try{
      if(window.RTG_AUTH && RTG_AUTH.state().userId) return RTG_AUTH.state().userId;
      if(window.RTG_BOARD && RTG_BOARD.state().userId) return RTG_BOARD.state().userId;
    }catch(e){}
    return null;
  }
  // The Supabase session access token. The billing endpoints verify it and
  // derive the user id from it (they no longer trust a body user_id), so a
  // request without it is rejected 401.
  function authToken(){ try{ return (window.RTG_AUTH && RTG_AUTH.token && RTG_AUTH.token()) || null; }catch(e){ return null; } }
  function authHeaders(){ var h={'Content-Type':'application/json'}; var t=authToken(); if(t) h.Authorization='Bearer '+t; return h; }
  function signedIn(){ return !!(window.RTGTokens && RTGTokens.signedIn && RTGTokens.signedIn()) || !!userId(); }
  function hasCard(){ return !!(window.RTGTokens && RTGTokens.hasCard && RTGTokens.hasCard()); }
  function returnPath(){ try{ return location.pathname + location.search; }catch(e){ return '/arcade/'; } }

  // ---------- styles ----------
  function injectStyles(){
    if($('rtgcard-style')) return;
    var s=document.createElement('style'); s.id='rtgcard-style';
    s.textContent=[
      '.rtgc-scrim{position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:max(20px,env(safe-area-inset-top)) 15px 24px;background:rgba(3,9,18,.7);backdrop-filter:blur(5px);overflow:auto;}',
      '.rtgc-scrim[hidden]{display:none;}',
      '.rtgc-sheet{width:100%;max-width:400px;margin:auto 0;background:var(--card,#0f1a2b);color:var(--ink,#eaf0f7);border:1px solid var(--line2,#22304a);border-radius:18px;padding:22px 20px 20px;position:relative;box-shadow:0 30px 90px -20px rgba(0,0,0,.75);text-align:center;}',
      '.rtgc-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1px solid var(--line2,#22304a);background:var(--card2,#16233a);color:var(--ink,#eaf0f7);font-size:14px;cursor:pointer;}',
      '.rtgc-kick{font-family:var(--hero,inherit);font-weight:800;letter-spacing:.02em;text-transform:uppercase;font-size:12px;color:var(--gold,#F2B632);margin-bottom:6px;}',
      '.rtgc-h{font-family:var(--hero,inherit);font-weight:800;font-size:23px;line-height:1.05;margin:0 0 8px;}',
      '.rtgc-sub{font-size:13px;color:var(--mut,#93a4bd);line-height:1.45;margin:0 auto 16px;max-width:320px;}',
      '.rtgc-card{background:color-mix(in srgb, var(--gold,#F2B632) 8%, var(--card2,#16233a));border:1px solid color-mix(in srgb, var(--gold,#F2B632) 45%, var(--line2,#22304a));border-radius:14px;padding:15px 15px 16px;margin:0 0 15px;text-align:left;}',
      '.rtgc-card .name{font-family:var(--hero,inherit);font-weight:800;letter-spacing:.03em;text-transform:uppercase;font-size:15px;color:var(--gold,#F2B632);display:flex;align-items:center;gap:8px;margin-bottom:10px;}',
      '.rtgc-perks{list-style:none;margin:0;padding:0;display:grid;gap:7px;}',
      '.rtgc-perks li{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600;color:var(--ink,#eaf0f7);}',
      '.rtgc-perks li span{flex:0 0 20px;text-align:center;}',
      // plan toggle
      '.rtgc-plans{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 0 6px;}',
      '.rtgc-plan{position:relative;border:2px solid var(--line2,#22304a);background:var(--card2,#16233a);border-radius:12px;padding:13px 10px 11px;cursor:pointer;text-align:center;transition:border-color .12s, background .12s;}',
      '.rtgc-plan.on{border-color:var(--gold,#F2B632);background:color-mix(in srgb, var(--gold,#F2B632) 12%, var(--card2,#16233a));}',
      '.rtgc-plan .pt{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--mut,#93a4bd);}',
      '.rtgc-plan .pp{font-family:var(--hero,inherit);font-weight:800;font-size:22px;line-height:1.1;margin-top:3px;}',
      '.rtgc-plan .pm{font-size:11px;color:var(--mut,#93a4bd);margin-top:2px;}',
      '.rtgc-plan .badge{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--gold,#F2B632);color:#20160a;font-size:8.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;white-space:nowrap;}',
      '.rtgc-plan .save{display:inline-block;margin-top:4px;font-size:10px;font-weight:800;color:var(--greenT,#48D17A);}',
      '.rtgc-go{width:100%;box-sizing:border-box;appearance:none;border:0;border-radius:12px;padding:15px;min-height:52px;font-family:var(--hero,inherit);font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:16px;background:var(--gold,#F2B632);color:#20160a;cursor:pointer;margin-top:10px;}',
      '.rtgc-go:hover{filter:brightness(1.05);} .rtgc-go:disabled{opacity:.6;cursor:default;}',
      '.rtgc-terms{font-size:11.5px;color:var(--mut,#93a4bd);margin-top:9px;font-weight:600;}',
      '.rtgc-ghost{width:100%;box-sizing:border-box;appearance:none;border:1px solid var(--line2,#22304a);background:transparent;color:var(--ink,#eaf0f7);border-radius:12px;padding:12px;min-height:46px;font-weight:800;font-size:13px;cursor:pointer;margin-top:10px;}',
      '.rtgc-ghost:hover{border-color:var(--mut,#93a4bd);}',
      '.rtgc-err{background:color-mix(in srgb,var(--red,#F0653A) 15%,transparent);color:var(--redT,#ff8a72);border-radius:8px;padding:9px 11px;font-size:12.5px;font-weight:600;margin:10px 0 0;}',
      '.rtgc-fine{font-size:11px;color:var(--dim,#6b7d97);margin-top:11px;line-height:1.4;}'
    ].join('');
    (document.head||document.documentElement).appendChild(s);
  }

  function ensureScrim(){
    injectStyles();
    var el=$('rtgcardScrim');
    if(el) return el;
    el=document.createElement('div'); el.className='rtgc-scrim'; el.id='rtgcardScrim'; el.hidden=true;
    el.innerHTML='<div class="rtgc-sheet"><button class="rtgc-x" id="rtgcardX" type="button" aria-label="Close">✕</button><div id="rtgcardBody"></div></div>';
    document.body.appendChild(el);
    $('rtgcardX').onclick=close;
    el.addEventListener('click',function(e){ if(e.target===el) close(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape' && !el.hidden) close(); });
    return el;
  }
  function open(){ ensureScrim().hidden=false; }
  function close(){ var el=$('rtgcardScrim'); if(el) el.hidden=true; }

  var CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  // Days of archive available, and the puzzle count that implies (9 games a
  // day). The number is the whole argument: "past days" is abstract, "171
  // puzzles" is not.
  function vaultDays(){
    try {
      var launch = (window.RTGArchive && RTGArchive.LAUNCH) || '2026-07-22';
      return Math.max(0, Math.floor((Date.now() - Date.parse(launch)) / 864e5));
    } catch (e) { return 0; }
  }
  function benefitsHTML(){
    var d = vaultDays(), pz = d * 9;
    return '<ul class="rtgc-perks">' +
      // Lead with the most differentiated perk: four editions of nine games is
      // a bigger idea than "unlimited", and nothing else on the market has it.
      '<li><span>🏀</span> <b>36 daily puzzles, not 9</b> - NBA-only, NFL-only and MLB-only editions of every game, each with its own streak</li>' +
      '<li><span>♾️</span> Unlimited plays, every day</li>' +
      (d > 0
        ? '<li><span>🗂️</span> The full Archive: <b>' + d + ' past days</b>, ' + pz + ' puzzles you can still play</li>'
        : '<li><span>🗂️</span> Full Arcade Archive: play past days</li>') +
      '<li><span>🆕</span> New games &amp; challenges as they drop</li>' +
      '<li><span>📊</span> Your full history &amp; stats</li>' +
    '</ul>';
  }

  // The Arcade Card upsell. reason: 'out' (out of daily plays) | 'archive' | undefined.
  function paywall(opts){
    opts=opts||{}; var reason=opts.reason||'out';
    ensureScrim();
    if(hasCard()){ renderMember(); open(); return; }   // already a member: manage, never sell a second card
    var chosen = 'annual';   // steer to best value by default
    var kicker, head, sub;
    if(reason==='archive'){
      var vd = vaultDays();
      kicker='Arcade Archive';
      head = vd > 0 ? ('Unlock ' + vd + ' days you missed') : 'Unlock the full Archive';
      sub = vd > 0
        ? ('That’s ' + (vd*9) + ' puzzles waiting, across all nine games. Play any of them, any time.')
        : 'Play any past day’s puzzles across every game with an Arcade Card.';
    } else if(reason==='upsell'){
      kicker='Arcade Card'; head='Go unlimited';
      sub='Unlimited plays across every game, every day, plus the full archive.';
    } else {
      kicker='Out of plays'; head='You’re out of plays today';
      sub = signedIn()
        ? 'You’ve used today’s 3 free Arcade plays. Come back tomorrow for 3 more, or unlock the entire Arcade now.'
        : 'Come back tomorrow for another free play, or unlock the entire Arcade now.';
    }
    function render(){
      var b=$('rtgcardBody');
      b.innerHTML =
        '<div class="rtgc-kick">'+esc(kicker)+'</div>'+
        '<h2 class="rtgc-h">'+esc(head)+'</h2>'+
        '<p class="rtgc-sub">'+esc(sub)+'</p>'+
        '<div class="rtgc-card"><div class="name">🎟️ Arcade Card</div>'+benefitsHTML()+'</div>'+
        '<div class="rtgc-plans">'+
          planHTML('monthly', chosen==='monthly')+
          planHTML('annual', chosen==='annual')+
        '</div>'+
        '<button class="rtgc-go" id="rtgcardGo" type="button">Get Arcade Card</button>'+
        '<div class="rtgc-terms" id="rtgcardTerms"></div>'+
        '<div id="rtgcardErr"></div>'+
        '<button class="rtgc-ghost" id="rtgcardLater" type="button">Come back tomorrow</button>'+
        '<div class="rtgc-fine">Cancel anytime in two taps &middot; Your streaks stay yours if you cancel &middot; Instant access</div>';
      [].forEach.call(b.querySelectorAll('.rtgc-plan'),function(p){ p.onclick=function(){ chosen=p.dataset.plan; render(); }; });
      $('rtgcardGo').onclick=function(){ startCheckout(chosen); };
      $('rtgcardLater').onclick=close;
      updTerms();
    }
    function updTerms(){
      var t=$('rtgcardTerms'); if(!t) return;
      var p = chosen==='annual'?ANNUAL:MONTHLY;
      t.textContent = p.bill;
    }
    render(); open();
  }
  // Already a member - manage/cancel instead of buying a second card (mirrors
  // how the golf Tour Pass won't sell you a pass you already own).
  function renderMember(){
    var b=$('rtgcardBody');
    b.innerHTML =
      '<div class="rtgc-kick">Arcade Card</div>'+
      '<h2 class="rtgc-h">You’re a member</h2>'+
      '<p class="rtgc-sub">You’ve got unlimited plays and the full archive. Thanks for supporting Run The Arcade.</p>'+
      '<div class="rtgc-card"><div class="name">🎟️ Arcade Card</div>'+benefitsHTML()+'</div>'+
      '<button class="rtgc-go" id="rtgcardManage" type="button">Manage subscription</button>'+
      '<div id="rtgcardErr"></div>'+
      '<button class="rtgc-ghost" id="rtgcardLater" type="button">Close</button>';
    $('rtgcardLater').onclick=close;
    $('rtgcardManage').onclick=function(){
      var go=$('rtgcardManage'); if(go){ go.disabled=true; go.textContent='Opening…'; }
      Promise.resolve(portal()).then(function(d){
        if(d && d.url) return;                          // redirecting to Stripe portal
        if(go){ go.disabled=false; go.textContent='Manage subscription'; }
        showErr((d && d.error==='no_customer')
          ? 'This membership is complimentary. There’s nothing to bill or manage.'
          : 'Could not open the billing portal. Please try again.');
      });
    };
  }
  function planHTML(plan, on){
    var p = plan==='annual'?ANNUAL:MONTHLY;
    return '<div class="rtgc-plan'+(on?' on':'')+'" data-plan="'+plan+'">'+
      (plan==='annual'?'<span class="badge">Best value</span>':'')+
      '<div class="pt">'+(plan==='annual'?'Annual':'Monthly')+'</div>'+
      '<div class="pp">'+p.price+'</div>'+
      '<div class="pm">'+(plan==='annual'?('<s style="opacity:.55">'+p.anchor+'</s> /year · '+p.permo):'/month')+'</div>'+
      (plan==='annual'?'<span class="save">'+p.save+'</span>':'')+
    '</div>';
  }

  // Guest used their one free play → convert to a free account (3/day).
  function guestConvert(){
    ensureScrim();
    var b=$('rtgcardBody');
    b.innerHTML =
      '<div class="rtgc-kick">Keep playing</div>'+
      '<h2 class="rtgc-h">Create a free account</h2>'+
      '<p class="rtgc-sub">A free RunThe.GG account gets you <b>3 Arcade plays every day</b>, and saves your streaks, stats and leaderboard rank across every game. Or get an Arcade Card for unlimited play.</p>'+
      '<button class="rtgc-go" id="rtgcardCreate" type="button">Create free account</button>'+
      '<button class="rtgc-ghost" id="rtgcardCard" type="button">Get an Arcade Card for unlimited play</button>'+
      '<button class="rtgc-ghost" id="rtgcardSignin" type="button">I already have an account</button>'+
      '<div class="rtgc-fine">No card required for account.</div>';
    $('rtgcardCreate').onclick=function(){ close(); if(window.RTGAuthUI) RTGAuthUI.open('signup'); };
    $('rtgcardCard').onclick=function(){ paywall({ reason:'upsell' }); };
    $('rtgcardSignin').onclick=function(){ close(); if(window.RTGAuthUI) RTGAuthUI.open('signin'); };
    open();
  }

  // Begin checkout. If not signed in, open sign-in first and resume after auth.
  function startCheckout(plan){
    plan = plan==='annual'?'annual':'monthly';
    if(hasCard()){ renderMember(); return; }   // already a member: never start a second checkout
    if(!signedIn()){
      // preserve intent, ask them to sign in / create an account, then resume.
      // Persisted (not just in memory): Google sign-up leaves the page and
      // comes back, and the chosen plan must survive that round trip.
      pending = plan;
      try{ localStorage.setItem('rtg:pendingplan', JSON.stringify({ p: plan, t: Date.now() })); }catch(e){}
      close();
      if(window.RTGAuthUI){ RTGAuthUI.open('signup'); }
      return;
    }
    var go=$('rtgcardGo'); if(go){ go.disabled=true; go.textContent='Starting…'; }
    var uid=userId();
    if(!uid){ showErr('Please sign in and try again.'); return; }
    fetch('/api/stripe/checkout', {
      method:'POST', headers:authHeaders(),
      body: JSON.stringify({ user_id: uid, plan: plan, return_path: returnPath() })
    }).then(function(r){ return r.json().catch(function(){ return {}; }); })
      .then(function(d){
        if(d && d.url){ location.href=d.url; return; }
        if(d && d.error==='already_active'){ renderMember(); return; }   // server says: you already have a card
        var msg = (d && d.detail) ? ('Checkout error: '+d.detail)
          : (d && d.error==='stripe_not_configured') ? 'Checkout isn’t configured yet (missing keys/prices).'
          : (d && (d.error==='missing_user_id'||d.error==='unauthorized')) ? 'Please sign in, then try again.'
          : (d && d.error) ? ('Checkout error: '+d.error)
          : 'Could not start checkout. Please try again.';
        showErr(msg);
      })
      .catch(function(){ showErr('Could not start checkout. Please try again.'); });
  }
  function showErr(msg){
    var e=$('rtgcardErr'); if(e) e.innerHTML='<div class="rtgc-err">'+esc(msg)+'</div>';
    var go=$('rtgcardGo'); if(go){ go.disabled=false; go.textContent='Get Arcade Card'; }
  }

  // Manage / cancel via Stripe Customer Portal.
  function portal(){
    var uid=userId(); if(!uid){ if(window.RTGAuthUI) RTGAuthUI.open('signin'); return; }
    return fetch('/api/stripe/portal', {
      method:'POST', headers:authHeaders(),
      body: JSON.stringify({ user_id: uid, return_path: returnPath() })
    }).then(function(r){ return r.json().catch(function(){ return {}; }); })
      .then(function(d){ if(d && d.url) location.href=d.url; return d; })
      .catch(function(){});
  }

  // Resume a checkout the visitor started before signing in. The plan also
  // lives in localStorage so an OAuth redirect (full page reload) can't lose
  // it; whichever copy exists wins, then both are cleared.
  var pending = null;
  function takePending(){
    var p = pending; pending = null;
    try{
      if(!p){
        var raw = localStorage.getItem('rtg:pendingplan');
        if(raw){
          var o = JSON.parse(raw);
          // 15-minute window: fresh enough to be the same purchase intent,
          // stale enough that a later unrelated sign-in isn't yanked to Stripe.
          if(o && o.p && (Date.now() - (o.t||0)) < 15*60*1000) p = o.p;
        }
      }
      localStorage.removeItem('rtg:pendingplan');
    }catch(e){}
    return (p==='annual'||p==='monthly') ? p : null;
  }
  function watchAuth(){
    if(!window.RTG_AUTH) return;
    RTG_AUTH.onChange(function(st){
      if(!(st && st.signedIn)) return;
      var plan = takePending();
      if(plan){
        // small delay so the session/token settle before we POST
        setTimeout(function(){ paywall({ reason:'out' }); startCheckout(plan); }, 150);
      }
    });
  }

  // The right "you can't play" surface for the current tier: a guest gets the
  // create-account conversion; a signed-in free user gets the Arcade Card paywall.
  function wall(){ if(signedIn()) paywall({ reason:'out' }); else guestConvert(); }

  // Turn a game's out-of-plays "Play again" button into an inviting upsell (the
  // button's existing click handler already calls wall(), which shows the right
  // offer: guests -> create account / Arcade Card, free users -> Arcade Card).
  function wallButton(btn){
    if(!btn) return false;
    btn.disabled=false; btn.classList.remove('spent');
    btn.textContent = signedIn() ? 'Get an Arcade Card' : 'Get more plays';
    return true;
  }

  // Server-side authorization for a ranked play (anti-bypass). For a signed-in
  // free user it spends one server token (the source of truth); resolves
  // {ok:false} only when the server says they're genuinely out (e.g. localStorage
  // was cleared to fake more plays). Guests, Arcade Card members, offline, and
  // testing all resolve {ok:true} (the client wallet / entitlement governs those).
  // NB: this no longer spends a token of its own. RTGTokens.startAttempt already
  // fires the spend RPC for every ranked play, so calling the RPC again here
  // would charge a signed-in player twice for one puzzle. It now just reports
  // the verdict tokens.js recorded for the attempt in progress.
  function authorizePlay(){
    try{
      if(window.RTGTokens && RTGTokens.rankAuthorized) return Promise.resolve({ ok: RTGTokens.rankAuthorized() });
    }catch(e){}
    return Promise.resolve({ok:true});
  }
  // A refusal means the local wallet was out of step with the server - usually
  // storage cleared to mint extra plays. Say so once, and show the tier's offer
  // rather than letting the play run on toward a score that will not post.
  var deniedShown=false;
  document.addEventListener('rtg:denied', function(){
    if(deniedShown) return; deniedShown=true;      // once per page, not once per game
    try{ setTimeout(wall, 400); }catch(e){}
  });

  // Reconcile the client wallet against the server on load: a signed-in user who
  // cleared localStorage (or is on a new device) gets their real used-count from
  // the server, so they can't reset their way past the daily cap. Card members
  // get the entitlement flag set. Runs when the session becomes available.
  function reconcile(){
    if(!(window.RTG_BOARD && RTG_BOARD.tokenStatus)) return;
    RTG_BOARD.tokenStatus().then(function(s){
      if(!s || !s.signed_in) return;
      if(s.unlimited){ try{ localStorage.setItem('runthegrid_pro','1'); }catch(e){} }
      else if(typeof s.used==='number' && window.RTGTokens && RTGTokens.setServerUsed){
        RTGTokens.setServerUsed(s.used);
        try{ document.dispatchEvent(new Event('rtg:tokens')); }catch(e){}
      }
    }).catch(function(){});
  }
  function watchTokens(){
    if(!window.RTG_BOARD) return;
    var done=false;
    RTG_BOARD.onChange(function(st){ if(st && st.signedIn && !done){ done=true; reconcile(); } });
    try{ RTG_BOARD.boot(); }catch(e){}
  }

  // Post-checkout return: Stripe bounces back with ?checkout=success|cancelled.
  // Success gets a real welcome moment - optimistic Pro flag (the webhook is
  // the durable truth and lands within seconds), a celebration modal, and a
  // clean URL so refresh/share doesn't re-trigger it. Silence here was the #1
  // conversion-audit finding: people who just paid saw... nothing.
  function checkoutReturn(){
    var q; try{ q=new URLSearchParams(location.search); }catch(e){ return; }
    var st=q.get('checkout'); if(!st) return;
    try{
      q.delete('checkout');
      var clean=location.pathname+(q.toString()?'?'+q.toString():'')+location.hash;
      history.replaceState(null,'',clean);
    }catch(e){}
    if(st!=='success') return;   // cancelled: no guilt trip, just back to the game
    try{ localStorage.setItem('runthegrid_pro','1'); }catch(e){}
    ensureScrim();
    var b=$('rtgcardBody');
    b.innerHTML =
      '<div class="rtgc-kick">Welcome aboard</div>'+
      '<h2 class="rtgc-h">🎟️ You’ve got the Arcade Card</h2>'+
      '<p class="rtgc-sub">Unlimited plays are live right now. Every past day is open in the Archive, and the NBA, NFL and MLB versions of every game are yours.</p>'+
      '<div class="rtgc-card"><div class="name">🎟️ Arcade Card</div>'+benefitsHTML()+'</div>'+
      '<button class="rtgc-go" id="rtgcardStart" type="button">Start playing</button>'+
      '<div class="rtgc-fine">Manage or cancel anytime from this menu.</div>';
    $('rtgcardStart').onclick=close;
    open();
    try{ document.dispatchEvent(new Event('rtg:tokens')); }catch(e){}
  }
  function init(){ injectStyles(); watchAuth(); watchTokens(); checkoutReturn();
    window.RTGCard = { paywall: paywall, guestConvert: guestConvert, wall: wall, wallButton: wallButton, checkout: startCheckout, portal: portal, authorizePlay: authorizePlay, MONTHLY: MONTHLY, ANNUAL: ANNUAL };
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
