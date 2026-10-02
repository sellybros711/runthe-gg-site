/* Run The Arcade - shared "How to play" helper.
   Usage: <script src="/arcade/howto.js"></script> then RTGHowto.init('table').
   Injects a "?" topbar button + a small modal with per-game bullets.
   It never opens by itself: the board's one line of instruction does that
   job, and the ? is there for anything more. */
(function(){
  'use strict';

  var CONTENT = {
    match: [
      'Sixteen names. Four hidden groups of four.',
      'Pick four that share something. "One away" means 3 of 4 fit.',
      'Four misses ends your day.'
    ],
    table: [
      'What number did he wear for that team?',
      'Exact is a bullseye. Within 2 still counts.',
      'One save. A second miss ends the run.'
    ],
    career: [
      'Every answer played for 3 or more teams.',
      'Teams show one at a time. Call it off one team for 5.',
      'Take 4 names for 1. One miss ends the run.'
    ],
    oddone: [
      'Five names. Tap the one that doesn’t belong for 1.',
      'Name what the other four share for 1 more.',
      'A wrong tap ends the run.'
    ],
    rankit: [
      'Five players, one career stat. Most goes on top.',
      'Tap two to swap, then Check. You see the real numbers.',
      'Five tries. Fewest tries wins.'
    ],
    guess: [
      'One player. We tell you the sport.',
      'Green is a match. Yellow is close. Arrows point the way.',
      'Eight guesses. A clue costs no guess.'
    ],
    almamater: [
      'Where did he go to college? Type the school for 2.',
      'Spelling is forgiven. Take 4 choices for 1.',
      'A wrong school ends the run.'
    ],
    crossword: [
      'A sports mini. Tap a square and type.',
      'Tap again to switch across and down.',
      'Fastest clean solve tops the board.'
    ],
    sportegories: [
      'One letter, eight categories, two minutes.',
      'First or last name can start with the letter.',
      'Fill all eight for a perfect day.'
    ],
    rollcall: [
      'One team, one season, 90 seconds.',
      'Type the players who wore that uniform.',
      'Wrong names only cost time.'
    ],
    chain: [
      'Two players. Name two teammates that link them.',
      'Each name played with the one above, same years.',
      'Four wrong names breaks the chain.'
    ],
    highlow: [
      'Pick a stat. Is the next player higher or lower?',
      'Every right call keeps the run going.',
      'One miss ends it.'
    ]
  };


  var booted = false;

  function injectStyle(){
    if(document.getElementById('rtgHowtoStyle')) return;
    var css = '' +
      '.rtgHowto-btn{font-weight:900;font-size:15px;line-height:1;}' +
      '.rtgHowto-scrim{position:fixed;inset:0;background:rgba(3,9,18,.66);backdrop-filter:blur(4px);z-index:66;display:none;align-items:flex-start;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 16px 24px;overflow:auto;}' +
      '.rtgHowto-scrim.on{display:flex;}' +
      '.rtgHowto-card{width:100%;max-width:360px;background:var(--card);border:1px solid var(--line2);border-radius:16px;padding:22px 20px 20px;position:relative;box-shadow:var(--shadow,0 30px 80px -20px rgba(0,0,0,.7));margin:auto 0;font-family:var(--f,inherit);}' +
      '.rtgHowto-x{position:absolute;top:8px;right:8px;width:44px;height:44px;border-radius:50%;border:1px solid var(--line2);background:transparent;color:var(--ink);font-size:14px;line-height:1;cursor:pointer;padding:0;}' +
      '.rtgHowto-title{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.02em;text-transform:uppercase;font-size:20px;margin:0 44px 12px 0;color:var(--ink);}' +
      '.rtgHowto-sub{margin:-6px 0 14px;color:var(--mut);font-size:16px;line-height:1.45;}' +
      '.rtgHowto-demo{margin:0 0 14px;}' +
      '.rtgHowto-rules{margin:0 0 16px;border-top:1px solid var(--line2);padding-top:2px;}' +
      '.rtgHowto-rules summary{list-style:none;cursor:pointer;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);display:flex;align-items:center;gap:6px;min-height:44px;}' +
      '.rtgHowto-rules summary::-webkit-details-marker{display:none;}' +
      '.rtgHowto-rules summary::after{content:"+";margin-left:auto;font-size:15px;line-height:1;}' +
      '.rtgHowto-rules[open] summary::after{content:"\\2212";}' +
      '.rtgHowto-rules[open] summary{margin-bottom:6px;}' +
      '.rtgHowto-list{margin:0;padding:0 0 0 18px;text-align:left;color:var(--mut);font-size:16px;line-height:1.45;}' +
      '.rtgHowto-list li{margin:0 0 8px;}' +
      '.rtgHowto-list li:last-child{margin-bottom:0;}' +
      '.rtgHowto-set{display:flex;gap:8px;margin:0 0 14px;}' +
      '.rtgHowto-set button{flex:1 1 0;min-height:44px;appearance:none;border-radius:11px;border:1px solid var(--line2);background:var(--card2,var(--card));color:var(--ink);font-family:var(--f,inherit);font-weight:800;font-size:15px;cursor:pointer;}' +
      '.rtgHowto-ok{display:block;width:100%;appearance:none;border:0;border-radius:11px;padding:13px;min-height:46px;background:var(--brand,#FF8A3D);color:var(--onAccent,#160B02);font-family:var(--f,inherit);font-weight:800;font-size:16px;cursor:pointer;}';
    // Pages without a --hero display font (e.g. the crossword) fall back to the
    // body font - bump the title weight there so it still reads as a heading.
    var hero = '';
    try{ hero = (getComputedStyle(document.documentElement).getPropertyValue('--hero') || '').trim(); }catch(e){}
    if(!hero) css += '.rtgHowto-title{font-weight:800;}';
    var st = document.createElement('style');
    st.id = 'rtgHowtoStyle';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function init(key){
    if(booted) return;
    var bullets = CONTENT[key];
    if(!bullets) return;
    booted = true;

    injectStyle();

    // ---- modal ----------------------------------------------------------
    var scrim = document.createElement('div');
    scrim.className = 'rtgHowto-scrim';
    scrim.id = 'rtgHowtoScrim';
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-label', 'How to play');

    var card = document.createElement('div');
    card.className = 'rtgHowto-card';

    var x = document.createElement('button');
    x.className = 'rtgHowto-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '✕';

    /* THE HEADER INTRODUCES THE GAME, it does not label the dialog. "How to
       play" is true of every one of these modals and tells you nothing about
       the one you opened; the game's own name and its one-line pitch are what
       orient somebody who tapped in from a tile. Falls back to the old label
       if gamemarks is absent. */
    var marks = window.RTGGameMarks || null;
    var gname = (marks && marks.name) ? marks.name(key) : '';
    var gdesc = (marks && marks.desc) ? marks.desc(key) : '';
    var h = document.createElement('h2');
    h.className = 'rtgHowto-title';
    h.textContent = gname || 'How to play';
    var sub = null;
    if (gdesc) {
      sub = document.createElement('p');
      sub.className = 'rtgHowto-sub';
      sub.textContent = gdesc;
    }

    /* THE DEMO IS THE TUTORIAL; the bullets are the reference. Shown together
       they compete, and the wordier one wins by sheer area: four lines of grey
       text under a four-second clip is the wordy tutorial with an animation on
       top of it. So the list folds away.
       It is not deleted, because it says the things a clip cannot: what a
       wrong answer costs, what each answer is worth, when the run ends. Those
       matter, just not before you have seen the game move. */
    var ul = document.createElement('ul');
    ul.className = 'rtgHowto-list';
    for(var i = 0; i < bullets.length; i++){
      var li = document.createElement('li');
      li.textContent = bullets[i];
      ul.appendChild(li);
    }
    var rules = document.createElement('details');
    rules.className = 'rtgHowto-rules';
    var sum = document.createElement('summary');
    sum.textContent = 'Scoring and rules';
    rules.appendChild(sum);
    rules.appendChild(ul);

    var ok = document.createElement('button');
    ok.className = 'rtgHowto-ok';
    ok.type = 'button';
    ok.textContent = 'Got it';

    card.appendChild(x);
    card.appendChild(h);
    if (sub) card.appendChild(sub);
    /* THE DEMO GOES ABOVE THE RULES, because it answers the question the
       rules cannot: what does this look like when it is working. Four seconds
       of the game playing itself beats four bullets, and the bullets stay
       underneath for the scoring detail an animation has no way to say.
       Optional throughout: a page without demo.js still gets exactly what it
       had before. */
    var demo = null;
    if (window.RTGDemo && RTGDemo.has(key)) {
      var stagewrap = document.createElement('div');
      stagewrap.className = 'rtgHowto-demo';
      card.appendChild(stagewrap);
      demo = { host: stagewrap, handle: null };
    }
    card.appendChild(rules);
    /* Sound and theme live here as well as in the header, because on a phone
       the header is one row (gamehead.js) and they are the two controls that
       left it. Each button presses the page's own control, so there is one
       place that owns the setting. */
    var set = document.createElement('div');
    set.className = 'rtgHowto-set';
    var sndOrig = document.querySelector('[data-sound-toggle]');
    var thmOrig = document.getElementById('themeBtn');
    var sndB = null, thmB = null;
    function paintSet(){
      if (sndB) sndB.textContent = 'Sound: ' + (sndOrig.classList.contains('snd-off') ? 'off' : 'on');
      if (thmB) thmB.textContent = 'Theme: ' + (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    }
    if (sndOrig) { sndB = document.createElement('button'); sndB.type = 'button'; sndB.addEventListener('click', function(){ sndOrig.click(); setTimeout(paintSet, 0); }); set.appendChild(sndB); }
    if (thmOrig) { thmB = document.createElement('button'); thmB.type = 'button'; thmB.addEventListener('click', function(){ thmOrig.click(); setTimeout(paintSet, 0); }); set.appendChild(thmB); }
    if (sndB || thmB) card.appendChild(set);
    card.appendChild(ok);
    scrim.appendChild(card);
    document.body.appendChild(scrim);

    // ---- open/close + first-visit flag ----------------------------------
    /* howto2, not howto: the demos replaced a wordy modal that used the old
       key, so every existing player's flag was already set and nobody who knew
       the games ever saw a single animation. The owner wants the animated
       intro to be the thing that comes up, once, for everyone; the wordy rules
       are inside it behind "Scoring and rules". One key bump = one showing. */
    var FLAG = 'rtg:howto2:' + key;
    function seen(){ try{ return !!localStorage.getItem(FLAG); }catch(e){ return true; } }
    function markSeen(){ try{ localStorage.setItem(FLAG, '1'); }catch(e){} }
    function isOpen(){ return scrim.classList.contains('on'); }
    /* The demo runs on timers, so it starts when the modal opens and is torn
       down when it closes. A loop still ticking behind a dismissed modal costs
       battery and shows up in no test. */
    function accent(){
      try {
        var m = (window.RTGCalendar && RTGCalendar.get) ? RTGCalendar.get(key) : null;
        return m && m.accent;
      } catch (e) { return null; }
    }
    function open(){
      if (typeof paintSet === 'function') paintSet();
      scrim.classList.add('on');
      if (demo && !demo.handle) demo.handle = RTGDemo.mount(demo.host, key, accent());
    }
    function close(){
      scrim.classList.remove('on'); markSeen();
      if (demo && demo.handle) { try { demo.handle.stop(); } catch (e) {} demo.handle = null; demo.host.innerHTML = ''; }
    }

    x.addEventListener('click', close);
    ok.addEventListener('click', close);
    scrim.addEventListener('click', function(ev){ if(ev.target === scrim) close(); });
    document.addEventListener('keydown', function(ev){
      if(isOpen() && (ev.key === 'Escape' || ev.keyCode === 27)) close();
    });

    // ---- "?" topbar button ----------------------------------------------
    var topbar = document.querySelector('.topbar');
    if(topbar){
      var btn = document.createElement('button');
      btn.className = 'themeBtn rtgHowto-btn';
      btn.type = 'button';
      btn.id = 'rtgHowtoBtn';
      btn.setAttribute('aria-label', 'How to play');
      btn.title = 'How to play';
      btn.textContent = '?';
      btn.addEventListener('click', open);
      var snd = topbar.querySelector('[data-sound-toggle]');
      if(snd) topbar.insertBefore(btn, snd);
      else topbar.appendChild(btn);
    }

    /* NO AUTO-OPEN. A first visit goes straight into a playable game: the
       board carries one line of instruction and the ? holds the rest (the
       demo, the scoring and the rules). The sheet used to open on its own the
       first time, in front of the board somebody had just tapped into. */
  }

  window.RTGHowto = { init: init };
})();
