/* Run The Arcade — shared "How to play" helper.
   Usage: <script src="/arcade/howto.js"></script> then RTGHowto.init('table').
   Injects a "?" topbar button + a small modal with per-game bullets.
   First-ever visit auto-opens the modal once (localStorage 'rtg:howto:<game>'),
   unless the page booted with a result modal already showing (locked state). */
(function(){
  'use strict';

  var CONTENT = {
    table: [
      'Two athletes, one question: who wore the higher jersey number?',
      'Tap your pick and the numbers reveal instantly.',
      'Every correct pick extends your run. You get one 🛡 save; a second miss ends it.',
      'The run gets tougher: later pairs wear closer numbers.'
    ],
    career: [
      "We show a career's team stops, in order, first to last.",
      'Four names. Tap the athlete who took that exact path.',
      'Each correct answer extends your run; one wrong ends it.',
      'Decoys get sneakier the deeper you go.'
    ],
    oddone: [
      'Five names. Four share a connection: a team, a position, a decade, or the Hall of Fame.',
      "Tap the one that doesn't belong.",
      'Right: the four light green and your run grows. Wrong: run over.',
      'The connection is revealed either way.'
    ],
    rankit: [
      'Five athletes, one category: era, career points, home runs, or passing TDs.',
      'Drag (or arrow) them into order, then hit Check.',
      'All five right clears the set and deals a new one. Any wrong ends the run.',
      'Real values reveal after every check.'
    ],
    guess: [
      'One mystery player from the NBA, NFL, or MLB. The sport is given.',
      'Type any player from that sport; tiles show how close you are on team, position, era and number.',
      'Green = match, yellow = close, arrows point higher or lower.',
      'Eight guesses. Stuck? Burn a 🎭 clue.'
    ],
    crossword: [
      'A quick sports mini. Type into the grid.',
      'Tap a cell to switch across/down; clues sit below.',
      'Fastest clean solve tops the board.',
      'Free players get one Reveal; Pro gets unlimited.'
    ],
    wordsearch: [
      "Find the hidden names. Today's theme tells you who they are.",
      'Drag across letters in any direction, including diagonals and backwards.',
      'Names only reveal as you find them.',
      'One Hint highlights a first letter (Pro: unlimited).'
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
      '.rtgHowto-list{margin:0 0 18px;padding:0 0 0 18px;text-align:left;color:var(--mut);font-size:13px;line-height:1.55;}' +
      '.rtgHowto-list li{margin:0 0 8px;}' +
      '.rtgHowto-list li:last-child{margin-bottom:0;}' +
      '.rtgHowto-ok{display:block;width:100%;appearance:none;border:0;border-radius:11px;padding:13px;min-height:46px;background:var(--coral,#F06A5F);color:#fff;font-family:var(--f,inherit);font-weight:800;font-size:13px;cursor:pointer;}';
    // Pages without a --hero display font (e.g. the crossword) fall back to the
    // body font — bump the title weight there so it still reads as a heading.
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

    var h = document.createElement('h2');
    h.className = 'rtgHowto-title';
    h.textContent = 'How to play';

    var ul = document.createElement('ul');
    ul.className = 'rtgHowto-list';
    for(var i = 0; i < bullets.length; i++){
      var li = document.createElement('li');
      li.textContent = bullets[i];
      ul.appendChild(li);
    }

    var ok = document.createElement('button');
    ok.className = 'rtgHowto-ok';
    ok.type = 'button';
    ok.textContent = 'Got it';

    card.appendChild(x);
    card.appendChild(h);
    card.appendChild(ul);
    card.appendChild(ok);
    scrim.appendChild(card);
    document.body.appendChild(scrim);

    // ---- open/close + first-visit flag ----------------------------------
    var FLAG = 'rtg:howto:' + key;
    function seen(){ try{ return !!localStorage.getItem(FLAG); }catch(e){ return true; } }
    function markSeen(){ try{ localStorage.setItem(FLAG, '1'); }catch(e){} }
    function isOpen(){ return scrim.classList.contains('on'); }
    function open(){ scrim.classList.add('on'); }
    function close(){ scrim.classList.remove('on'); markSeen(); }

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
    if(!seen()){
      setTimeout(function(){
        if(document.querySelector('.scrim:not(.hidden)')) return;
        open();
      }, 700);
    }
  }

  window.RTGHowto = { init: init };
})();
