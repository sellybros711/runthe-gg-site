// ── the home page ──────────────────────────────────────────────────────────

/* WHAT A RETURNING PLAYER WANTS FIRST: the run they left, and the record they
 * are trying to beat. Both are rendered here rather than behind a button, and
 * both are allowed to be absent, because a first visit has neither and an empty
 * stat block is worse than no stat block.
 */
/* The One Franchise door, wearing the last club played. A door that offers the
   club by name is one tap; a door that always says "pick a club" is two, every
   time, for somebody who only ever plays one. The colours are clubSkin's, the
   same call the reels make. */
function renderModeDoor(){
  var door = $('b-franchise'), main = $('b-franchise-go');
  var name = $('md-name'), sub = $('md-sub'), tag = $('md-tag'), pick = $('b-franchise-pick');
  if (!door || !main || !sub) return;
  /* DATA is what makes clubSeasons answerable, so the tile stays in its plain
     state through the boot rather than printing a club with no season count
     beside it. */
  var last = DATA ? lastClub() : null;
  if (!last) {
    door.className = 'mtile';
    door.style.removeProperty('--md-accent');
    door.style.setProperty('--c', '#f0782d');
    tag.textContent = 'Classic';
    name.textContent = 'One Franchise';
    name.style.removeProperty('color');
    sub.textContent = 'Pick a team. Only the year spins.';
    pick.hidden = true;
    main.onclick = openClubs;
    return;
  }
  /* The tile wears the club: its name in the club's accent, the mode name as
     the tag over it, so a returning Bulls player reads Bulls first. */
  var skin = E.clubSkin(last), seasons = R.clubSeasons(last).length;
  door.className = 'mtile clubbed';
  door.style.setProperty('--md-accent', skin.accent);
  door.style.setProperty('--c', skin.accent);
  tag.textContent = 'One Franchise';
  name.textContent = E.teamName(last);
  name.style.color = skin.accent;
  sub.textContent = E.team(last).full + '. ' + seasons + ' seasons on the wheel.';
  pick.hidden = false;
  main.onclick = function(){ startRun(last); };
}

/* TODAY'S RUN, in three states, and the middle one is the one worth getting
   right. Unplayed, it is the day number and the offer. Played, it is the
   record and a way to send it to somebody, because a result nobody can show
   anybody is a result that happened to one person. In progress, it says so
   and resumes, which is the same rule the other two doors follow: a door that
   says Resume resumes. */
function renderDailyDoor(){
  var card = $('b-daily-go');
  var eye = $('dl-name'), day = $('dl-day'), title = $('dl-title'), sub = $('dl-sub'),
    go = $('dl-go'), streak = $('dl-streak');
  if (!card) return;
  var n = todayNumber(), s = dailyState();
  var live = run && run.daily === n && run.phase !== R.PHASES.OVER;
  var done = dailyDone();

  card.className = 'dailycard' + (done && !live ? ' played' : '');
  eye.textContent = 'Daily Draft';
  day.textContent = 'Day ' + n;
  if (live) {
    title.textContent = run.phase === R.PHASES.DRAFT
      ? run.roster.length + ' of ' + E.SLOTS.length + ' signed'
      : NUMWORD(E.SLOTS.length, true) + ' signed';
    sub.textContent = run.phase === R.PHASES.DRAFT
      ? 'Your draft is waiting. Same board as everyone.'
      : '82 to play. Same board as everyone.';
    go.textContent = 'Pick it back up';
    card.onclick = function(){ show('s-draft'); renderDraft(); };
  } else if (done) {
    title.textContent = s.label;
    sub.textContent = s.headline + '. Send it. New board tomorrow.';
    go.textContent = 'Share it';
    card.onclick = shareDaily;
  } else {
    title.textContent = 'Same ' + NUMWORD(E.SLOTS.length) + ' spins for everyone';
    sub.textContent = 'One shot today. Beat your friends on the same board.';
    go.textContent = 'Play today';
    card.onclick = function(){ startRun(null, null, true); };
  }

  /* THE STREAK IS SHOWN ONLY WHILE IT IS STILL ALIVE. A count of days that
     ended last March is not a streak, it is a fact about March, and printing
     it beside today's card reads as a claim about right now. It survives
     today being unplayed, because a streak is not broken until a day is
     MISSED: yesterday's run is what it stands on.

     AND ONE DAY IS NOT A STREAK. Every first-time player finishes the daily
     and is handed a "1 DAY" for having played once, which says nothing and
     devalues the number on the day it starts meaning something. Two is where
     a run of days begins. */
  var slots = $('dl-slots');
  if (slots) {
    var filled = live ? run.roster.length : done ? E.SLOTS.length : 0;
    slots.innerHTML = E.SLOTS.map(function(sl, i){
      return '<i' + (i < filled ? ' class="on"' : '') + '>' + sl + '</i>'; }).join('');
  }
  var alive = s && s.streak > 1 && (s.lastDone === n || s.lastDone === n - 1);
  streak.hidden = !alive;
  if (alive) {
    streak.textContent = s.streak + ' days';
    streak.setAttribute('aria-label', s.streak + ' days in a row');
  }
}

/* The daily's own share, which is the point of the mode. It is built from
   STORED FIELDS rather than from the run, because the run it describes is
   usually gone by the time somebody presses this: they finished the daily,
   started something else, and came back to the front page. */
function shareDaily(){
  var s = dailyState();
  if (!s || !s.done) return;
  var text = 'Run The Floor, day ' + s.day + '\n'
    + s.label + '. ' + s.headline + '. Rating ' + s.rating + '.\n'
    + DAILY_DARE + '\n'
    + (s.streak > 1 ? s.streak + ' days in a row.\n' : '')
    + SHARE_URL;
  if (navigator.share) {
    return navigator.share({ text: text }).catch(function(err){
      if (err && err.name === 'AbortError') return;
      copyAndDownload(text, null);
    });
  }
  copyAndDownload(text, null);
}

/* Where a run in the bracket actually is, in the words the round is called
   by. Reads the runner rather than a count, so a play-in and a Finals do not
   both come back as "the playoffs". */
function bracketWhere(){
  if (!run.po) return 'missed the playoffs';
  var done = run.po.results.length;
  var cur = run.po.cur;
  if (cur) return cur.round + ', series ' + cur.yourWins + '-' + cur.oppWins;
  if (done) return 'won ' + roundPhrase(run.po.results[done - 1].round);
  return 'playoffs up next';
}

function renderHome(){
  var rz = $('home-resume'), hero = $('herocard');

  if (run && run.phase !== R.PHASES.OVER) {
    rz.style.display = '';
    if (hero) hero.style.display = '';
    var drafting = run.phase === R.PHASES.DRAFT;
    /* THREE STATES, NOT TWO. "Season not played" was every phase that was not
       the draft, so a run sitting at a Game 7 door read as a roster that had
       never tipped off. The offer is the reason somebody comes back, so it has
       to say what they are coming back to. */
    var inBracket = run.phase === R.PHASES.PLAYOFFS;
    var chip = modeChip(run);
    $('rz-title').textContent = (drafting ? 'Draft in progress'
      : inBracket ? 'In the playoffs' : 'Season up next')
      + (chip ? ' · ' + chip : '');
    $('rz-where').textContent = drafting
      ? run.roster.length + ' of ' + E.SLOTS.length + ' signed'
      : inBracket ? bracketWhere()
      : NUMWORD(E.SLOTS.length) + ' signed, 82 to play';

    /* Who is actually on it, because "3 of 5" is a progress bar and the names
       are the reason to come back. */
    var names = [];
    for (var i = 0; i < run.roster.length; i++) names.push(run.roster[i].n);
    $('rz-who').textContent = '';
    if (names.length) {
      var b = document.createElement('b');
      b.textContent = names.join(', ');
      $('rz-who').appendChild(b);
      /* Its own line, because the separator kept ending up stranded at the end
         of a wrapped list of names with the money on the row below it. */
      $('rz-who').appendChild(document.createElement('br'));
      $('rz-who').appendChild(document.createTextNode(
        money(R.remaining(run)) + ' left. ' + R.slotsLeft(run)
          + (R.slotsLeft(run) === 1 ? ' spot' : ' spots') + ' to fill.'));
    } else {
      $('rz-who').textContent = 'Nobody signed yet.';
    }
    $('b-start').textContent = 'Start a new draft';
  } else {
    rz.style.display = 'none';
    if (hero) hero.style.display = 'none';
    /* RUN IT BACK MEANS THE SAME GAME, and this button does not have one to
       offer: it is wired to startRun with no arguments, so it is the whole
       league whatever was played last. It said "Run it back" after any
       finished run, which was true while the league was the only mode and
       became a promise it cannot keep the day the doors went in. The other
       modes have their own door directly under it, and the results screen's
       own Run it back is the one that really does replay the mode. */
    var league = run && !run.club && !run.era && !run.daily;
    $('b-start').textContent = (run && league) ? 'Draft again' : 'Start a draft';
  }

  renderDailyDoor();
  renderModeDoor();
  renderEraDoor();
  if (window.RTF_MODES_UI) window.RTF_MODES_UI.renderHome();

  var c = loadCareer();
  var box = $('home-career');
  if (!c || !c.runs) { box.style.display = 'none'; return; }

  box.style.display = '';
  $('hc-runs').textContent = String(c.runs);
  $('hc-rings').textContent = String(c.rings);
  $('hc-best').textContent = c.bestLabel || '-';
  $('hc-sub').textContent = c.rings
    ? c.rings + (c.rings === 1 ? ' ring' : ' rings') + ' in ' + c.runs
    : 'still chasing ring number one';

  /* THE LINE THAT GIVES A REASON TO PLAY AGAIN. A personal best is a target,
     and a target is the whole of a single player game's endgame. */
  $('hc-last').textContent = '';
  if (c.last) {
    var lead = document.createElement('b');
    lead.textContent = 'Last run: ' + c.last.label;
    $('hc-last').appendChild(lead);
    $('hc-last').appendChild(document.createTextNode(
      ' · ' + c.last.headline + (c.last.shape ? ' · ' + c.last.shape : '')));
    if (c.bestWins > c.last.wins) {
      $('hc-last').appendChild(document.createElement('br'));
      $('hc-last').appendChild(document.createTextNode(
        'Your best is ' + c.bestLabel + '. Beat it.'));
    }
  }
}
