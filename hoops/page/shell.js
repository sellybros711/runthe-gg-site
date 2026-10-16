// ── the two bars ───────────────────────────────────────────────────────────

/* THE DOCK MOVES THE REAL BUTTON, it does not make a copy of it.
 *
 * A copied button is two elements that have to agree about a label, an enabled
 * state and a handler, and they stop agreeing the first time one path forgets to
 * update the other. Moving the element keeps its id, its onclick and its
 * disabled flag, so every existing line that reaches for $('b-play') still
 * reaches the button the player can actually see.
 *
 * Each screen names its primary action and, where there is one, a secondary.
 * A screen with neither gets an empty dock, which CSS hides.
 */
var WIDE = window.matchMedia ? window.matchMedia('(min-width:920px)') : { matches: false };
if (WIDE.addEventListener) WIDE.addEventListener('change', function(){
  var on = document.querySelector('.screen.active');
  if (on && on.id === 's-home') renderDock('s-home');
});
var DOCK_FOR = {
  /* CLASSIC, because it is the unlimited mode and the front page leads with
     it. A run in progress is the one thing ahead of it: the thumb lands on
     Resume rather than on a button that starts over. */
  's-home':   function(){
    if (run && run.phase !== R.PHASES.OVER) return [$('b-resume')];
    /* CAREER IS THE HERO, so a phone docks its button where the thumb is.
       Classic's Start stays in the Classic card, under the words it answers.
       A DESKTOP DOCKS NOTHING: a bar pinned to the foot of a 900px window
       floats over the daily card and the tiles. */
    return WIDE.matches ? [] : [$('b-career')];
  },
  's-draft':  function(){
    /* Between draws the action is the spin. During one it is picking a player
       off the board, which is not a button, so the dock carries the way OUT of
       a board you do not like instead. */
    return run && run.currentDraw ? [$('b-respin')] : [$('b-spin')];
  },
  's-season': function(){
    /* Before tip-off the action is Play. Once the season is running Play is
       spent, and the only thing left to do is stop watching, so Skip takes the
       bar on its own. */
    var play = $('b-play');
    return play && !play.disabled ? [play] : [$('b-skip')];
  },
  's-brk':    function(){
    /* NOTHING WHILE THE DOOR IS UP. The door is a card with two buttons that
       are one decision, and docking half of a pair is how a reader ends up
       answering a question with the other half off screen. Skip is also
       meaningless there: the walk is already stopped and waiting on them. */
    if (!$('lvdoor').hidden) return [];
    return [$('b-brk-fast')];
  },
  's-live':   function(){
    /* Once the game is over the only thing left is to carry on, and Sim the
       rest is spent. */
    return $('lv-verdict').hidden ? [$('b-lv-fast')] : [$('b-lv-next')];
  },
  's-over':   function(){ return [$('b-again')]; }
};

/* Where each button lives when it is not in the dock, so it can be put back
   rather than lost. Captured once, at boot, before anything has moved. */
var HOME_OF = {};

function rememberHomes(){
  var ids = ['b-resume', 'b-start', 'b-career', 'b-spin', 'b-respin', 'b-play', 'b-skip', 'b-again',
    'b-lv-fast', 'b-lv-next', 'b-brk-fast'];
  for (var i = 0; i < ids.length; i++) {
    var el = $(ids[i]);
    if (el && el.parentNode) HOME_OF[ids[i]] = el.parentNode;
  }
}

function renderDock(screen){
  var dock = $('dock');
  if (!dock) return;

  /* Put back whatever is currently in the dock first, or a button that is no
     longer wanted here would simply vanish from the document. */
  while (dock.firstChild) {
    var el = dock.firstChild;
    var home = el.id && HOME_OF[el.id];
    if (home) home.appendChild(el); else dock.removeChild(el);
  }

  var pick = DOCK_FOR[screen];
  var want = pick ? pick().filter(Boolean) : [];
  /* A BUTTON ITS OWN SCREEN IS NOT SHOWING IS NOT THE ACTION RIGHT NOW, and it
     is the button's CONTAINER that usually hides it: Skip lives inside the sim
     card, which does not exist until the season is running. Reading the
     button's own display would have docked a Skip with no handler on it yet.
     offsetParent is null for anything with a hidden ancestor, and this runs
     after the screen has been made active and before anything is moved, so the
     buttons are all sitting at home where that answer is the true one. */
  want = want.filter(function(b){ return b.offsetParent !== null; });
  for (var i = 0; i < want.length; i++) dock.appendChild(want[i]);

  document.body.classList.toggle('hasdock', want.length > 0);
  /* Measure rather than assume. The dock is one row on most screens and two
     buttons tall on none of them, but its height still moves with the button
     padding and with the reader's font size, and the body padding that keeps
     the footer clear of it is only right if it matches. */
  document.documentElement.style.setProperty('--dock',
    (want.length ? dock.offsetHeight : 0) + 'px');
}

/* The top bar says what the wordmark cannot: where the run is up to. Its one
   button is Career on every screen, so the record is reachable mid-run rather
   than only from home, and the WORDMARK is the way back out. That split is the
   ordinary phone convention (mark home-left, account right), and it means the
   bar never carries two buttons the home screen already has below it. */
/* THE COIN PILL, Run The Tour's: the balance, one tap from the shop. Only
   where the bar has room and nothing else is counting money: the front page,
   the career and the boards. The draft's cap HUD is money of a different kind,
   and a second figure beside it would read as the same thing. */
var abShown = 0;
function renderCoins(screen){
  var cp = $('ab-coins'), W = window.RTF_WARD;
  if (!cp) return;
  if (screen) cp.dataset.scr = screen;
  var on = !!(W && W.wallet && window.RTF_CAREER_UI && window.RTF_CAREER_UI.openLocker) && /^(s-home|s-car|s-board)$/.test(cp.dataset.scr || '');
  cp.hidden = !on;
  if (!on) return;
  var n = 0; try { n = W.wallet.balance(); } catch (e) {}
  $('ab-cn').textContent = n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n.toLocaleString('en-US');
  if (n > abShown && abShown) { cp.classList.remove('bump'); void cp.offsetWidth; cp.classList.add('bump'); }
  abShown = n;
  if (!cp.onclick) cp.onclick = function(){ window.RTF_CAREER_UI.openLocker('shop'); };
  if (!cp.dataset.wired && W.wallet.onChange) { cp.dataset.wired = '1'; W.wallet.onChange(function(){ renderCoins(); }); }
}
function renderAppBar(screen){
  var state = $('ab-state'), action = $('ab-action');
  if (!state || !action) return;
  renderCoins(screen);
  action.hidden = false;
  action.textContent = 'Career';
  action.onclick = openProfile;

  /* NOT ON THE DRAFT SCREEN. The cap HUD sticks directly under this bar and
     says the slot and the money bigger and in more detail, so a chip repeating
     it is a second copy of the same two numbers, and at 360px it is the copy
     that pushes the wordmark into an ellipsis. */
  state.hidden = true;
  if (!run || screen === 's-home') return;
  /* THE MODE, ON THE DRAFT SCREEN AND NOWHERE ELSE IT WOULD BE A DUPLICATE.
     A locked run looks exactly like an ordinary one apart from a reel that
     does not move, and "the reel is not moving" is a weak way to learn which
     game you are playing. The nickname alone: the chip has room for one word
     beside the wordmark at 360px, and the club is the half that answers it. */
  var chip = screen === 's-draft' ? modeChip(run) : null;
  if (chip) {
    state.hidden = false;
    state.textContent = chip;
    state.className = 'state lock';
    return;
  }
  state.className = 'state';
  if (screen === 's-season' || screen === 's-brk' || screen === 's-over') {
    /* Mid-sim this is the live record, which is the one number worth carrying
       above a screen you are watching rather than reading. */
    var w = simWins, l = simLosses;
    if (screen === 's-over' && run.outcome) { w = run.outcome.wins; l = run.outcome.losses; }
    if (w + l > 0) { state.hidden = false; state.textContent = w + '-' + l; }
  }
}

// ── loading ────────────────────────────────────────────────────────────────

function boot(){
  Promise.all([
    fetch('data/players.json?v=5').then(function(r){ return r.json(); })
      .then(function(v){ bootStep('Players loaded.'); return v; }),
    fetch('data/chemistry.json?v=1').then(function(r){ return r.json(); })
      .then(function(v){ bootStep(); return v; }).catch(function(){ bootStep(); return null; }),
    fetch('data/teams.json?v=4').then(function(r){ return r.json(); })
      .then(function(v){ bootStep(); return v; }).catch(function(){ bootStep(); return null; })
  ]).then(function(res){
    if (res[1]) E.setCuratedChemistry(res[1]);
    /* Franchise data BEFORE indexData, because the wheel's club names are built
       during indexing and a 1995 Vancouver roster has to read as Vancouver. */
    if (res[2]) E.setTeams(res[2]);
    DATA = R.indexData(res[0]);
    buildGoingRate(res[0]);
    bootStep('Loading every season.');

    var seasons = {}, franchises = {};
    for (var i = 0; i < DATA.teamSeasons.length; i++) {
      seasons[DATA.teamSeasons[i].season] = 1;
      franchises[DATA.teamSeasons[i].team] = 1;
    }
    var yrs = Object.keys(seasons).map(Number).sort(function(a, b){ return a - b; });
    /* THE COLLECTIONS COUNT WHAT IS ACTUALLY IN THE DATA. badges.js ships with
       52 seasons and 45 clubs written down, which is right today and will be
       wrong the first July a new season lands. Telling it what the file holds
       means "every season since 1974" stays a complete set rather than becoming
       permanently one short. */
    if (window.RTF_BADGES) {
      window.RTF_BADGES.setTotals({
        seasons: yrs.length,
        clubs: Object.keys(franchises).length,
        shapes: (E.SYSTEMS && E.SYSTEMS.length) || 0,
        franchises: E.franchises().length,
        mvps: (function(){
          var m = {};
          DATA.players.forEach(function(p){ if ((p.aw || []).indexOf('mvp') >= 0) m[p.s] = 1; });
          return Object.keys(m).length;
        })()
      });
    }
    $('ls-players').textContent = DATA.players.length.toLocaleString();
    $('ls-clubs').textContent = DATA.teamSeasons.length.toLocaleString();
    $('ls-teams').textContent = String(Object.keys(franchises).length);
    if (yrs.length) $('home-era').textContent = yrs[0] + ' to ' + yrs[yrs.length - 1];
    $('b-start').disabled = false;
    bootStep('Real seasons. Real stats. From Basketball-Reference.');

    /* A SAVED RUN NO LONGER HIJACKS THE LOAD. It used to jump straight to
       whatever screen the run was on, so a returning player never saw this page
       and the only way out of a draft that had gone wrong was a button called
       Reset. Now the run is offered, and the offer says where it got to. */
    restore();
    if (window.RTF_MODES_UI) window.RTF_MODES_UI.onData();
    renderHome();
    /* The dock reads the run: Resume when one was restored, Classic's Start
       when not. And the court and the reels are the front page's picture, so
       they start the moment there is a league to spin. */
    if ($('s-home').classList.contains('active')) { renderDock('s-home'); heroStart(); }
    /* A RELOAD RESTORES THE OLD SCROLL POSITION, and the old position was
       somewhere down a draft board. Landing on the home page already scrolled
       past its own masthead reads as a broken page rather than a restored one. */
    window.scrollTo(0, 0);
    /* ACCOUNTS, BOOTED HERE AND NOT AT PARSE TIME. supabase-js is deferred, so
       at parse time it may not exist yet; boot() polls for it and gives up
       after fifteen seconds rather than waiting for ever. Nothing on this page
       waits for the answer: the callback repaints whichever of the two
       surfaces is open when it lands. */
    A.boot();
    A.onChange(function(){
      /* A change of account is a change of which arenas are yours, and of
         whose profile the page is wearing. */
      arenaChanged();
      profilePull();
      if ($('sheet').classList.contains('open')) {
        renderIdentity();
        renderAccount();
        /* The cabinet opens and shuts with the account, on the sheet the
           player is looking at. */
        showProfileTab(badgeTab);
      }
      /* And the results card, which tells a guest what the run lit and
         turns into the badges themselves the moment they sign in. */
      var ov = $('s-over');
      if (ov && ov.classList.contains('active')) { renderEarned(); renderNewArenas(); }
      /* THE SHELF IS ASKED ON EVERY CHANGE OF ACCOUNT, and the boot is one of
         them: nothing is signed in at parse time, so a pull started beside
         A.boot() would always find no token and answer nothing. Signing IN is
         the moment somebody expects their cabinet to arrive, and cloudPull
         refuses to run twice at once, so a change that fires more than once
         while the first answer is out costs nothing. */
      cloudPull();
      /* A RUN FINISHED BEFORE SIGNING IN IS CLAIMED ON THE WAY IN. The id is
         on the saved run, so this survives the reload that a Google sign-in
         redirect puts in the middle of it, which is the case that would
         otherwise lose every name. */
      var st = A.state();
      if (st.signedIn && run && run.boardId) A.claim(run.boardId);
    });
    /* The first-run guide no longer opens by itself (owner's call: no auto
       tutorial on any game). "Show me around" in How to play opens it. */
  }).catch(function(err){
    bootFailed('The league did not load: ' + err.message);
  });
}
