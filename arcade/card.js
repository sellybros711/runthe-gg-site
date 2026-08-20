/*
 * card.js - the Arcade Card surface for Run The Arcade.
 *
 * One shared, self-mounting module (like auth-ui.js) that every arcade page can
 * use for the consumer monetization UI:
 *   RTGCard.paywall(opts)   - "Out of plays" → Arcade Card upsell (monthly/annual,
 *                             + tax, and a friendly "Come back tomorrow")
 *   RTGCard.guestConvert()  - a signed-out visitor hit a game: "create a free
 *                             account for four games a day" conversion
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
  function authToken(){
    try{ var t=(window.RTG_AUTH && RTG_AUTH.token && RTG_AUTH.token()); if(t) return t; }catch(e){}
    // Fallback: read the raw Supabase session straight from localStorage (the
    // same blob tokens.js scans for signedIn). Otherwise a signed-in member is
    // blocked from billing whenever RTG_AUTH/supabase-js hasn't parsed the
    // session on this page yet - which is exactly when the member modal still
    // shows (it's gated on that raw check), so the two must agree.
    try{
      var LS=window.localStorage;
      for(var i=0;i<LS.length;i++){
        var k=LS.key(i);
        if(k && k.indexOf('sb-')===0 && /auth-token$/.test(k)){
          var v=LS.getItem(k); if(!v || v.indexOf('access_token')<0) continue;
          var o=JSON.parse(v);
          var at=o && (o.access_token || (o.currentSession && o.currentSession.access_token));
          if(typeof at==='string' && at) return at;
        }
      }
    }catch(e){}
    return null;
  }
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
      '.rtgc-kick{font-family:var(--f,inherit);font-weight:900;letter-spacing:.06em;text-transform:uppercase;font-size:14px;color:var(--gold,#F2B632);margin-bottom:6px;}',
      '.rtgc-h{font-family:var(--f,inherit);font-weight:900;font-size:27px;line-height:1.08;margin:0 0 8px;}',
      '.rtgc-sub{font-size:13px;color:var(--mut,#93a4bd);line-height:1.45;margin:0 auto 16px;max-width:320px;}',
      '.rtgc-card{background:color-mix(in srgb, var(--gold,#F2B632) 8%, var(--card2,#16233a));border:1px solid color-mix(in srgb, var(--gold,#F2B632) 45%, var(--line2,#22304a));border-radius:14px;padding:15px 15px 16px;margin:0 0 15px;text-align:left;}',
      '.rtgc-card .name{font-family:var(--hero,inherit);font-weight:800;letter-spacing:.03em;text-transform:uppercase;font-size:15px;color:var(--gold,#F2B632);display:flex;align-items:center;gap:8px;margin-bottom:10px;}',
      '.rtgc-perks{list-style:none;margin:0;padding:0;display:grid;gap:7px;}',
      '.rtgc-perks li{display:flex;align-items:flex-start;gap:9px;font-size:13px;font-weight:600;color:var(--ink,#eaf0f7);}',
      '.rtgc-perks li small{display:block;font-weight:600;font-size:11.5px;color:var(--mut,#93a4bd);margin-top:3px;line-height:1.35;}',
      '.rtgc-perks li s{color:var(--mut,#93a4bd);text-decoration-thickness:1px;text-decoration-color:var(--mut,#93a4bd);font-size:1.18em;margin-right:5px;}',
      '.rtgc-perks li span{flex:0 0 20px;height:20px;text-align:center;color:var(--gold,#F2B632);}',
      '.rtgc-perks li span svg{width:20px;height:20px;display:block;margin:0 auto;}',
      '.rtgc-card .name svg{width:18px;height:18px;flex:0 0 auto;}',
      '.rtgc-h svg{width:20px;height:20px;vertical-align:-4px;margin-right:5px;}',
      // plan toggle
      '.rtgc-plans{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 0 6px;}',
      '.rtgc-plan{position:relative;border:2px solid var(--line2,#22304a);background:var(--card2,#16233a);border-radius:12px;padding:13px 10px 11px;cursor:pointer;text-align:center;transition:border-color .12s, background .12s;}',
      '.rtgc-plan.on{border-color:var(--gold,#F2B632);background:color-mix(in srgb, var(--gold,#F2B632) 12%, var(--card2,#16233a));}',
      '.rtgc-plan .pt{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--mut,#93a4bd);}',
      '.rtgc-plan .pp{font-family:var(--hero,inherit);font-weight:800;font-size:22px;line-height:1.1;margin-top:3px;}',
      '.rtgc-plan .pm{font-size:11px;color:var(--mut,#93a4bd);margin-top:2px;}',
      '.rtgc-plan .badge{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--brand,#FF8A3D);color:var(--onAccent,#160B02);font-size:8.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;white-space:nowrap;}',
      '.rtgc-plan .save{display:inline-block;margin-top:4px;font-size:10px;font-weight:800;color:var(--greenT,#48D17A);}',
      '.rtgc-go{width:100%;box-sizing:border-box;appearance:none;border:0;border-radius:12px;padding:15px;min-height:52px;font-family:var(--hero,inherit);font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:16px;background:var(--brand,#FF8A3D);color:var(--onAccent,#160B02);cursor:pointer;margin-top:10px;}',
      '.rtgc-go:hover{filter:brightness(1.05);} .rtgc-go:disabled{opacity:.6;cursor:default;}',
      '.rtgc-terms{font-size:11.5px;color:var(--mut,#93a4bd);margin-top:9px;font-weight:600;}',
      '.rtgc-terms a{color:inherit;text-decoration:underline;}',
      '.rtgc-ghost{width:100%;box-sizing:border-box;appearance:none;border:1px solid var(--line2,#22304a);background:transparent;color:var(--ink,#eaf0f7);border-radius:12px;padding:12px;min-height:46px;font-weight:800;font-size:13px;cursor:pointer;margin-top:10px;}',
      '.rtgc-ghost:hover{border-color:var(--mut,#93a4bd);}',
      '.rtgc-err{background:color-mix(in srgb,var(--red,#F0653A) 15%,transparent);color:var(--redT,#ff8a72);border-radius:8px;padding:9px 11px;font-size:12.5px;font-weight:600;margin:10px 0 0;}',
      '.rtgc-fine{font-size:11px;color:var(--dim,#6b7d97);margin-top:11px;line-height:1.4;}',
      // Arcade-cabinet banner (ported from the old hub CTA): the primary "get a
      // card" button. Its own orange->red identity, independent of any game color.
      '.arcade-buy{display:block;width:100%;border:0;padding:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
      '.arcade-buy .ab-card{display:flex;align-items:stretch;overflow:hidden;border-radius:16px;min-height:104px;background:linear-gradient(105deg,#FF9A2E 0%,#FF6A3D 48%,#F0384E 100%);box-shadow:0 12px 28px -12px rgba(240,56,78,.65);transition:transform .12s ease,box-shadow .12s ease;}',
      '.arcade-buy:hover .ab-card{transform:translateY(-2px);box-shadow:0 18px 36px -12px rgba(240,56,78,.85);}',
      '.arcade-buy:active .ab-card{transform:translateY(0);}',
      '.arcade-buy .ab-cab{flex:0 0 96px;position:relative;padding:8px;display:grid;place-items:center;background:linear-gradient(180deg,#141d33,#080d18);clip-path:polygon(0 0,100% 0,82% 50%,100% 100%,0 100%);}',
      '.arcade-buy .ac-icon{position:relative;width:74px;height:66px;}',
      '.arcade-buy .ac-card{position:absolute;left:50%;top:50%;width:42px;height:52px;transform:translate(-50%,-50%) rotate(-7deg);border-radius:9px;border:2px solid transparent;background:linear-gradient(#0e1832,#0a1226) padding-box,linear-gradient(155deg,#FF8A3D,#F0384E) border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;box-shadow:0 6px 14px -6px rgba(240,56,78,.55);}',
      '.arcade-buy .ac-crown{width:23px;height:16px;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45));}',
      '.arcade-buy .ac-bar{border-radius:2px;height:3px;}',
      '.arcade-buy .ac-bar.b1{width:21px;background:#F0384E;}',
      '.arcade-buy .ac-bar.b2{width:14px;background:#2ee6cf;}',
      '.arcade-buy .ac-spark{position:absolute;display:block;}',
      '.arcade-buy .ac-spark.s1{width:11px;height:11px;top:2px;right:6px;}',
      '.arcade-buy .ac-spark.s2{width:8px;height:8px;bottom:4px;left:4px;opacity:.9;}',
      '.arcade-buy .ac-line{position:absolute;height:3px;border-radius:2px;}',
      '.arcade-buy .ac-line.l1{width:13px;top:30%;left:-2px;background:#F0384E;}',
      '.arcade-buy .ac-line.l2{width:9px;top:46%;left:-4px;background:#2ee6cf;}',
      '.arcade-buy .ac-line.l3{width:12px;top:64%;right:-2px;background:#3a4a66;}',
      '.arcade-buy .ab-body{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:12px 14px 12px 6px;}',
      '.arcade-buy .ab-txt{flex:1;min-width:0;text-align:left;}',
      '.arcade-buy .ab-txt b{display:block;font-family:var(--f,inherit);font-weight:900;font-style:italic;font-size:22px;line-height:1;color:#1a1206;white-space:nowrap;}',
      '.arcade-buy .ab-txt small{display:block;font-size:11.5px;font-weight:800;color:rgba(26,18,6,.82);margin-top:5px;line-height:1.3;}',
      '.arcade-buy .ab-arrow{flex:0 0 auto;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:20px;color:#fff;background:#12161f;box-shadow:0 3px 8px rgba(0,0,0,.4);transition:background .12s;}',
      '.arcade-buy:hover .ab-arrow{background:#0a0d14;}',
      // secondary "create a free account" - two-line, theme-neutral
      '.rtgc-create{width:100%;box-sizing:border-box;text-align:center;appearance:none;border:1px solid var(--line2,#22304a);background:var(--card2,#16233a);color:var(--ink,#eaf0f7);border-radius:12px;padding:13px 14px;min-height:56px;cursor:pointer;margin-top:12px;font-family:inherit;}',
      '.rtgc-create:hover{border-color:var(--gold,#F2B632);}',
      '.rtgc-create b{display:block;font-weight:900;font-size:14px;}',
      '.rtgc-create small{display:block;font-size:11px;font-weight:700;color:var(--mut,#93a4bd);margin-top:4px;line-height:1.35;}'
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
  // Days of archive available, and the puzzle count that implies (25 puzzles a
  // day: twelve games, five of them in NBA, NFL and MLB editions too). The number
  // is the whole argument: "past days" is abstract, "475 puzzles" is not.
  function vaultDays(){
    try {
      var launch = (window.RTGArchive && RTGArchive.LAUNCH) || '2026-07-22';
      return Math.max(0, Math.floor((Date.now() - Date.parse(launch)) / 864e5));
    } catch (e) { return 0; }
  }
  // Our own icon set (no stock emoji): monochrome, square-cut, currentColor.
  var ICN = {
    ball: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6c3 2.6 3 10.2 0 12.8M18.4 5.6c-3 2.6-3 10.2 0 12.8"/></svg>',
    infinity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 12C9.5 8 6.9 7 5 7a5 5 0 0 0 0 10C6.9 17 9.5 16 12 12C14.5 8 17.1 7 19 7a5 5 0 0 1 0 10C17.1 17 14.5 16 12 12Z"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l1.6-3h6.8L13 7h7a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4v16h16"/><rect x="7" y="12" width="2.6" height="5" fill="currentColor" stroke="none"/><rect x="11.7" y="8" width="2.6" height="9" fill="currentColor" stroke="none"/><rect x="16.4" y="14" width="2.6" height="3" fill="currentColor" stroke="none"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><path d="M15 6v12" stroke-dasharray="2 2"/></svg>',
    hilo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4v16M8 4l-4 5M8 4l4 5"/><path d="M16 20V4M16 20l-4-5M16 20l4-5"/></svg>'
  };
  function benefitsHTML(){
    return '<ul class="rtgc-perks">' +
      // Lead with the most differentiated perk: 27 daily puzzles vs the free 4.
      '<li><span>' + ICN.ball + '</span><div><b><s>4</s> 25 new daily games</b>' +
        '<small>All twelve games instead of four, plus NFL, NBA and MLB specific editions of five of them.</small></div></li>' +
      '<li><span>' + ICN.hilo + '</span> Six members-only games, Higher or Lower included</li>' +
      '<li><span>' + ICN.infinity + '</span> Unlimited plays, every day</li>' +
      '<li><span>' + ICN.archive + '</span> The full Archive of all past games</li>' +
      '<li><span>' + ICN.spark + '</span> New games &amp; challenges as they drop</li>' +
      '<li><span>' + ICN.chart + '</span> Your full history &amp; stats</li>' +
    '</ul>';
  }

  // Display name for a game key, from the shared calendar so the wall and the
  // tile can never disagree about what a game is called.
  function gameName(key){
    if(!key) return null;
    try{ var m=(window.RTGCalendar && RTGCalendar.get) ? RTGCalendar.get(key) : null; return (m&&m.name)||null; }catch(e){ return null; }
  }
  // The Arcade Card upsell.
  // reason: 'locked' (a members-only game) | 'out' (today's go used) |
  //         'archive' | 'upsell' | undefined. opts.game / opts.name name it.
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
        ? ('That’s ' + (vd*27) + ' puzzles waiting, across all twelve games. Play any of them, any time.')
        : 'Play any past day’s puzzles across every game with an Arcade Card.';
    } else if(reason==='locked'){
      // Name the game they just tapped. "You need the card to play THIS" is a
      // far more specific ask than a generic tier pitch, and it is the sentence
      // they came here for.
      var gn = opts.name || gameName(opts.game);
      kicker='Members only'; head='You need the Arcade Card';
      sub = (gn ? (gn + ' is one of six members-only games. ') : 'This is one of six members-only games. ')
        + 'The card opens all twelve, unlimited, plus NBA, NFL and MLB editions of five of them and the full Archive.';
    } else if(reason==='upsell'){
      kicker='Arcade Card'; head='4 → 27 daily games';
      sub='All twelve games instead of four, NBA, NFL and MLB editions of five of them, unlimited plays and the full archive.';
    } else {
      kicker='Arcade Card'; head='Keep playing, unlimited';
      sub = signedIn()
        ? 'A free account gets one go a day at four games. Members play all twelve as much as they like, every day, across 27 daily puzzles.'
        : 'Members play all twelve games as much as they like, every day, across 27 daily puzzles.';
    }
    function render(){
      var b=$('rtgcardBody');
      b.innerHTML =
        '<div class="rtgc-kick">'+esc(kicker)+'</div>'+
        '<h2 class="rtgc-h">'+esc(head)+'</h2>'+
        '<p class="rtgc-sub">'+esc(sub)+'</p>'+
        '<div class="rtgc-card"><div class="name">' + ICN.ticket + 'Arcade Card</div>'+benefitsHTML()+'</div>'+
        '<div class="rtgc-plans">'+
          planHTML('monthly', chosen==='monthly')+
          planHTML('annual', chosen==='annual')+
        '</div>'+
        '<button class="rtgc-go" id="rtgcardGo" type="button">Get Arcade Card</button>'+
        '<div class="rtgc-terms" id="rtgcardTerms"></div>'+
        '<div id="rtgcardErr"></div>'+
        '<button class="rtgc-ghost" id="rtgcardLater" type="button">Maybe later</button>'+
        '<div class="rtgc-fine">Cancel anytime in two taps &middot; Your streaks stay yours if you cancel &middot; Instant access</div>';
      [].forEach.call(b.querySelectorAll('.rtgc-plan'),function(p){ p.onclick=function(){ chosen=p.dataset.plan; render(); }; });
      $('rtgcardGo').onclick=function(){ startCheckout(chosen); };
      $('rtgcardLater').onclick=close;
      updTerms();
    }
    function updTerms(){
      var t=$('rtgcardTerms'); if(!t) return;
      var p = chosen==='annual'?ANNUAL:MONTHLY;
      // Billing terms + the legal links card networks expect at the point of sale.
      t.innerHTML = esc(p.bill) +
        ' &middot; <a href="/terms.html" target="_blank" rel="noopener">Terms</a>' +
        ' &middot; <a href="/privacy.html" target="_blank" rel="noopener">Privacy</a>';
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
      '<div class="rtgc-card"><div class="name">' + ICN.ticket + 'Arcade Card</div>'+benefitsHTML()+'</div>'+
      '<button class="rtgc-go" id="rtgcardManage" type="button">Manage subscription</button>'+
      '<div id="rtgcardErr"></div>'+
      '<button class="rtgc-ghost" id="rtgcardLater" type="button">Close</button>';
    $('rtgcardLater').onclick=close;
    $('rtgcardManage').onclick=function(){
      var go=$('rtgcardManage'); if(go){ go.disabled=true; go.textContent='Opening…'; }
      Promise.resolve(portal()).then(function(d){
        if(d && d.url) return;                          // redirecting to Stripe portal
        if(go){ go.disabled=false; go.textContent='Manage subscription'; }
        var err = d && d.error, msg;
        if(err==='no_customer') msg='This membership is complimentary. There’s nothing to bill or manage.';
        else if(err==='signin') msg='Please sign in to manage your membership.';
        else if(err==='unauthorized'){ msg='Your session expired. Please sign in again.'; if(window.RTGAuthUI) RTGAuthUI.open('signin'); }
        else if(err==='stripe_not_configured') msg='Billing isn’t fully connected yet. Please contact support.';
        else if(err==='stripe_error') msg='Stripe couldn’t open the portal'+((d&&d.detail)?(': '+d.detail):'.');
        else if(err==='network') msg='Could not reach the billing service. Check your connection and try again.';
        else msg='Could not open the billing portal'+((d&&d.status)?(' (HTTP '+d.status+')'):'')+((d&&d.detail)?(': '+d.detail):'.');
        showErr(msg);
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

  // The arcade-cabinet "get a card" banner (ported from the old hub CTA). Its
  // own orange->red identity, so it reads the same on every game (not tied to
  // the game's accent color).
  function arcadeBanner(id, sub){
    return '<button class="arcade-buy" type="button" id="'+id+'" aria-label="Get an Arcade Card: unlimited plays, every past day unlocked">'+
      '<span class="ab-card">'+
        '<span class="ab-cab" aria-hidden="true"><span class="ac-icon">'+
          '<i class="ac-line l1"></i><i class="ac-line l2"></i><i class="ac-line l3"></i>'+
          '<span class="ac-card">'+
            '<svg class="ac-crown" viewBox="0 0 24 18"><defs><linearGradient id="acCrownG2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF9A3D"/><stop offset="1" stop-color="#F0384E"/></linearGradient></defs><path d="M2 15V6l5 3.6L12 3l5 6.6L22 6v9z" fill="url(#acCrownG2)"/></svg>'+
            '<i class="ac-bar b1"></i><i class="ac-bar b2"></i>'+
          '</span>'+
          '<svg class="ac-spark s1" viewBox="0 0 24 24"><path d="M12 0c1.2 6.4 5.4 10.6 12 12-6.6 1.4-10.8 5.6-12 12-1.2-6.4-5.4-10.6-12-12 6.6-1.4 10.8-5.6 12-12z" fill="#2ee6cf"/></svg>'+
          '<svg class="ac-spark s2" viewBox="0 0 24 24"><path d="M12 0c1.2 6.4 5.4 10.6 12 12-6.6 1.4-10.8 5.6-12 12-1.2-6.4-5.4-10.6-12-12 6.6-1.4 10.8-5.6 12-12z" fill="#2ee6cf"/></svg>'+
        '</span></span>'+
        '<span class="ab-body"><span class="ab-txt"><b>Arcade Card</b>'+
          '<small>'+esc(sub)+'</small></span>'+
          '<span class="ab-arrow" aria-hidden="true">→</span></span>'+
      '</span>'+
    '</button>';
  }

  // Signed-out visitor hit a game → convert. A free account is now the thing
  // that actually unblocks them, so it leads; the Arcade Card is the upgrade
  // sitting above it for anyone who already knows they want everything.
  function guestConvert(){
    ensureScrim();
    var b=$('rtgcardBody');
    b.innerHTML =
      '<h2 style="font-family:var(--f,inherit);font-weight:900;font-size:26px;line-height:1.1;color:var(--ink,#eaf0f7);margin:0 0 14px;">Ready to play?</h2>'+
      arcadeBanner('rtgcardCard','All twelve games, unlimited. Every past day unlocked.')+
      '<button class="rtgc-create" id="rtgcardCreate" type="button"><b>Or Create a Free Account</b>'+
        '<small>One go a day at four games, and the leaderboard. Account stays with you on all RunThe.GG content.</small></button>'+
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
    // The portal is per-customer, so the server needs a verified session token.
    // Being a "member" can come from this browser's saved flag alone (no live
    // session) - in that case authenticate first rather than failing silently.
    var t=authToken();
    if(!t){ if(window.RTGAuthUI) RTGAuthUI.open('signin'); return Promise.resolve({ error:'signin' }); }
    var ctrl=('AbortController' in window)?new AbortController():null;
    var to=ctrl?setTimeout(function(){ try{ ctrl.abort(); }catch(e){} },12000):0;
    return fetch('/api/stripe/portal', {
      method:'POST', headers:authHeaders(),
      body: JSON.stringify({ return_path: returnPath() }),
      signal: ctrl?ctrl.signal:undefined
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(d){ d=d||{}; d.status=r.status; return d; });
    })
      .then(function(d){
        if(d && d.url){ location.href=d.url; return d; }
        // Surface the real cause in the console so billing issues are diagnosable.
        try{ console.warn('[Arcade Card] portal failed', d && d.status, d && d.error, d && d.detail); }catch(e){}
        return d;
      })
      .catch(function(e){ try{ console.warn('[Arcade Card] portal request error', e); }catch(_){} return { error:'network' }; })
      .then(function(d){ if(to) clearTimeout(to); return d; });
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
  // The right wall for why this player is blocked. The game is read off the URL
  // so the ~20 existing wall() call sites need no argument: a card-only game
  // gets the "this one is on the card" pitch, a spent free game gets the
  // "keep playing" one, and a signed-out visitor gets the account offer.
  function pageGame(){ var m=(location.pathname||'').match(/\/arcade\/([a-z]+)\//); return m?m[1]:null; }
  function wall(game){
    if(!signedIn()) return guestConvert();
    var g = game || pageGame();
    var locked=false;
    try{ locked = !!(g && window.RTGTokens && RTGTokens.cardOnly && RTGTokens.cardOnly(g)); }catch(e){}
    paywall({ reason: locked ? 'locked' : 'out', game: g });
  }

  // Turn a game's out-of-plays "Play again" button into an inviting upsell (the
  // button's existing click handler already calls wall(), which shows the right
  // offer: guests -> create account / Arcade Card, free users -> Arcade Card).
  function wallButton(btn){
    if(!btn) return false;
    btn.disabled=false; btn.classList.remove('spent');
    btn.textContent = signedIn() ? 'Get an Arcade Card' : 'Create a free account';
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
      else if(window.RTGTokens){
        if(s.plays && RTGTokens.setServerPlays) RTGTokens.setServerPlays(s.plays);
        // today's referral bonus travels on the same status read, so the wallet
        // learns about a reward the moment any page reconciles.
        if(RTGTokens.setServerBonus) RTGTokens.setServerBonus(s.bonus||0);
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
      '<h2 class="rtgc-h">' + ICN.ticket + 'You’ve got the Arcade Card</h2>'+
      '<p class="rtgc-sub">Unlimited plays are live right now. Every past day is open in the Archive, and the NBA, NFL and MLB versions of every game are yours.</p>'+
      '<div class="rtgc-card"><div class="name">' + ICN.ticket + 'Arcade Card</div>'+benefitsHTML()+'</div>'+
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
