/* Run The Arcade - shared "How to play" helper.
   Usage: <script src="/arcade/howto.js"></script> then RTGHowto.init('table').
   Injects a "?" topbar button + a small modal with per-game bullets.
   First-ever visit auto-opens the modal once (localStorage 'rtg:howto:<game>'),
   unless the page booted with a result modal already showing (locked state). */
(function(){
  'use strict';

  var CONTENT = {
    match: [
      'Sixteen names hide four secret groups of four.',
      'A group can be a team, a jersey number, a surname, any shared thread.',
      'Build a group of four and lock it in. "One away" means three belong together.',
      'Four wrong guesses ends the day. Solve all four groups to keep your streak.'
    ],
    table: [
      'One player, one club, one question: what number did they wear there?',
      'Type it. Exact is a bullseye; within two still counts, because a digit out is remembering, not guessing.',
      'You get one save; a second real miss ends the run.',
      'It opens on household names and works down into the deep cuts.'
    ],
    career: [
      'Well-travelled careers only: every answer played for at least three franchises.',
      'You get the scouting file free: position, college and era. Then the clubs arrive one at a time, first team first.',
      'No multiple choice: type who it is. Off the first club it is 5 points, off two or three it is 3, and down from there.',
      'Stuck? Take four names instead, for one point. A wrong answer ends your run.'
    ],
    oddone: [
      'Five names. Four share a connection: a team, a position, a decade, or the Hall of Fame.',
      "Tap the one that doesn't belong. That is worth a point.",
      'Then name the connection itself for a second point. Spotting it is luck; saying why is knowing.',
      'One wrong spot ends the run. A wrong link just costs you the bonus.'
    ],
    rankit: [
      'Five retired NBA, NFL or MLB players, one career stat: points, rebounds, home runs, passing yards, sacks, saves and more.',
      'Most at the top, always. Tap two names to swap them, then hit Check.',
      'One puzzle a day, five tries at it. Fewest tries wins the board.',
      'Real values reveal after every check, so each try tells you something.'
    ],
    guess: [
      'One NBA, NFL or MLB player from any era. The sport is given.',
      'Type any player from that sport; tiles compare careers, not this season: position, franchises, debut decade, college and honours.',
      'Green = match, yellow = close, arrows point higher or lower.',
      'Eight guesses. Stuck? Burn a clue for a hint.'
    ],
    almamater: [
      'One NBA, NFL or MLB player at a time. Where did they go to college?',
      'Type the school. UNC, North Carolina and University of North Carolina all count.',
      'Typing it is 2 points. Stuck? Take four choices for 1.',
      'One wrong school ends the run. A spelling we do not recognise costs nothing.'
    ],
    crossword: [
      'A quick sports mini. Type into the grid.',
      'Tap a cell to switch across/down; clues sit below.',
      'Fastest clean solve tops the board.',
      'Free players get one Reveal; Pro gets unlimited.'
    ],
    sportegories: [
      'One letter, eight sports categories, two minutes.',
      'Type a full name. The FIRST or the LAST name can start with the letter: on B, Bosh works and so does Barry Bonds.',
      'Bank the easy ones fast; you can come back to anything that stalls.',
      'The clock ends the round. Fill all eight for a perfect day.'
    ],
    rollcall: [
      'One club, one season, ninety seconds on the clock.',
      'Every blank is a player who wore that uniform that year. Type the names you remember.',
      'A right player in the wrong season is not a miss: the game tells you when he was there.',
      'Wrong names cost nothing but time. The score is how many you get.'
    ],
    chain: [
      'Two players, and two teammates to find in between.',
      'Each name has to have played alongside the one above it, same club, same years.',
      'The last name has to reach the player at the bottom as well.',
      'Four wrong names breaks the chain. The clock is the score, so a clean solve wins the day.'
    ],
    highlow: [
      'Pick a category: NBA, NFL or MLB stat pools.',
      'Players come two at a time. Call whether the next one sits higher or lower on the stat.',
      'Every correct call reveals the real value and extends your run.',
      'One miss ends it. Endless: the only target is your best run.'
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
      '.rtgHowto-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1px solid var(--line2);background:transparent;color:var(--ink);font-size:14px;line-height:1;cursor:pointer;padding:0;}' +
      '.rtgHowto-title{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.02em;text-transform:uppercase;font-size:20px;margin:0 34px 12px 0;color:var(--ink);}' +
      '.rtgHowto-sub{margin:-6px 0 14px;color:var(--mut);font-size:13px;line-height:1.5;}' +
      '.rtgHowto-demo{margin:0 0 14px;}' +
      '.rtgHowto-rules{margin:0 0 16px;border-top:1px solid var(--line2);padding-top:12px;}' +
      '.rtgHowto-rules summary{list-style:none;cursor:pointer;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);display:flex;align-items:center;gap:6px;}' +
      '.rtgHowto-rules summary::-webkit-details-marker{display:none;}' +
      '.rtgHowto-rules summary::after{content:"+";margin-left:auto;font-size:15px;line-height:1;}' +
      '.rtgHowto-rules[open] summary::after{content:"\\2212";}' +
      '.rtgHowto-rules[open] summary{margin-bottom:10px;}' +
      '.rtgHowto-list{margin:0;padding:0 0 0 18px;text-align:left;color:var(--mut);font-size:13px;line-height:1.55;}' +
      '.rtgHowto-list li{margin:0 0 8px;}' +
      '.rtgHowto-list li:last-child{margin-bottom:0;}' +
      '.rtgHowto-ok{display:block;width:100%;appearance:none;border:0;border-radius:11px;padding:13px;min-height:46px;background:var(--brand,#FF8A3D);color:var(--onAccent,#160B02);font-family:var(--f,inherit);font-weight:800;font-size:13px;cursor:pointer;}';
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

    // ---- auto-open on first-ever visit ----------------------------------
    // Wait a beat so the game's boot logic (which may reveal a result modal
    // for a locked/finished day, typically after a ~300ms timeout) has run.
    // If any game scrim is showing we skip the auto-open and leave the flag
    // unset, so the intro still shows on the next fresh visit.
    /* On a first visit, open THIS. It used to hand off to a tour that pointed
       at the league switcher and the score box, which answers "what is this
       control" for somebody who does not yet know what the game is. The demo
       answers the earlier question by playing a round, and once you have seen
       one the controls explain themselves.
       Still waits for the pregame overlay and any result modal to be gone:
       opening onto a screen they cannot see would be worse than saying
       nothing. */
    if(!seen()){
      var tries = 0;
      var wait = setInterval(function(){
        if (++tries > 40) { clearInterval(wait); return; }              // ~12s, then give up
        if (document.querySelector('.scrim:not(.hidden)')) return;      // a result is showing
        if (document.querySelector('.rtgpg-scrim:not([hidden])')) return; // pregame is showing
        clearInterval(wait);
        markSeen();
        open();
      }, 300);
    }
  }

  window.RTGHowto = { init: init };
})();
