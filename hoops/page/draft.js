// ── the draft ──────────────────────────────────────────────────────────────

function startRun(club, era, daily){
  /* An onclick handler is called with an Event, so a bare `$('b-again').onclick
     = startRun` would pass a MouseEvent where the club goes and lock the wheel
     to a franchise called [object MouseEvent]. createRun would throw and the
     button would do nothing, which is the quietest possible failure. Every
     call site passes a string or nothing, and this is the guard that makes
     that true whatever anybody wires up next. */
  var lock = typeof club === 'string' ? club : null;
  var span = (typeof era === 'string' && E.ERAS[era]) ? era : null;
  var opts = {};
  if (lock) opts.club = lock;
  if (span) opts.era = span;
  /* The daily is the whole league with its seed pinned, so it is the one door
     that sets no lock. It is refused rather than reseeded once the day is in
     the book: a second attempt at the same puzzle is a different game from the
     one everybody else played, and the record would not be comparable. */
  if (daily && !dailyDone()) {
    var n = todayNumber();
    opts.daily = n;
    opts.seed = dailySeed(n);
    opts.club = null;
    opts.era = null;
  }
  /* STARTING A RUN IS THE WAY OUT OF THE GUIDE, which is why the scrim never
     covered the button. Marked seen whichever door was used. */
  if (!$('frg').hidden) frgClose();
  /* THE OLD RUN IS DELETED BEFORE THE NEW ONE IS SAVED, and the order is the
     whole of it. A fresh run is progress zero, so a put would be REFUSED by a
     shelf holding a bracket, and the refusal is silent: this device would go on
     drafting while the next boot on any device resumed the run that was just
     abandoned. Dropping also discards whatever write of the old run was still
     pending, because it goes through the same per-slot queue. */
  cloudDropRun();
  run = R.createRun(opts);
  /* Read off opts and not off the arguments, because the daily branch above
     clears both locks and a remember taken from the argument would file a
     club the run is not actually playing. */
  if (opts.club) rememberClub(opts.club);
  if (opts.era) rememberEra(opts.era);
  activeTab = 'ALL';
  save();
  show('s-draft');
  renderDraft();
  spin();
}

/* ── ONE FRANCHISE ─────────────────────────────────────────────────────────
 *
 * The last club played, so the door on the front page offers it by name and a
 * fan taps once instead of going back through thirty tiles. It is a
 * preference and not a save: losing it costs one tap, so it never throws and
 * never blocks anything.
 */
var CLUBKEY = 'rtf.club.v1';

function lastClub(){
  try {
    var c = localStorage.getItem(CLUBKEY);
    /* hasTeam, not team().name: team() answers with the code itself when it
       knows nothing, so a junk value in storage would come back as a club. */
    return (c && E.hasTeam(c)) ? c : null;
  } catch (e) { return null; }
}
function rememberClub(code){
  try { localStorage.setItem(CLUBKEY, code); } catch (e) {}
  profileSend({ lastClub: code });
}

function openClubs(){
  renderClubs();
  sheetReturn = document.activeElement;
  $('clubsheet').classList.add('open');
  var first = $('clubgrid').querySelector('.clubchip');
  (first || $('b-club-x')).focus();
}

function closeClubs(){
  if (!$('clubsheet').classList.contains('open')) return;
  $('clubsheet').classList.remove('open');
  if (sheetReturn && sheetReturn.focus) { try { sheetReturn.focus(); } catch (e) {} }
  sheetReturn = null;
}

/* THE SEASON COUNT COMES OFF THE WHEEL'S OWN ANSWER, never off the franchise
   table. A club row says founded 1946 and the player data starts at 1974, so
   a chip printing the club's age would promise twenty-eight seasons that
   cannot be drawn. R.clubSeasons reads the same list drawable() filters. */
function renderClubs(){
  var grid = $('clubgrid');
  grid.textContent = '';
  var list = E.franchises();
  for (var i = 0; i < list.length; i++) {
    (function(f){
      var seasons = R.clubSeasons(f.code);
      /* A franchise with nothing in the data cannot be offered. None are today
         and none should ever be, but a chip that starts a run the wheel cannot
         spin is a dead end with no message on it. */
      if (seasons.length < 3) return;
      var inSeasons = {};
      for (var s = 0; s < seasons.length; s++) inSeasons[seasons[s]] = true;
      var skin = E.clubSkin(f.code);
      var b = document.createElement('button');
      b.className = 'clubchip';
      b.style.setProperty('--cc-accent', skin.accent);
      var nm = document.createElement('span');
      nm.className = 'cc-name';
      nm.textContent = f.name;
      var city = document.createElement('span');
      city.className = 'cc-city';
      /* THE NAME THE CLUB IS CALLED, not the city it plays in, and they are
         not the same for four of the thirty. teams.json has Golden State
         filed under San Francisco, which is where Chase Center is and is not
         what anybody calls them; Utah and Indiana are states and Minnesota is
         too. Taking the nickname off the front of the full name answers all
         four at once and needs no second table to go stale. */
      city.textContent = (f.full || '').replace(
        new RegExp('\\s*' + f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '')
        || f.city || '';
      var meta = document.createElement('span');
      meta.className = 'cc-meta';
      meta.appendChild(document.createTextNode(seasons.length + ' seasons'));
      /* AND THE RINGS ARE COUNTED OVER THOSE SAME SEASONS, which is the rule
         directly above arriving one line later. The season count was already
         the wheel's own answer and the ring count was the franchise's all
         time total, joined by a middot, so Boston read "53 seasons · 18
         rings" and eleven of those eighteen are Russell era and undraftable.
         Eight clubs of thirty overstated it. TWO OF THEM PROMISED A RING THAT
         CANNOT BE REACHED AT ALL: Atlanta's is St Louis in 1958 and
         Sacramento's is Rochester in 1951, so a chip said "1 ring" about a
         wheel holding no championship season whatsoever.

         The lineage is untouched and is the reason this is a filter rather
         than a smaller number: Oklahoma City still counts Seattle's 1979,
         because that season IS on the wheel. */
      var rings = f.titles.filter(function(y){ return inSeasons[y] === true; }).length;
      if (rings) {
        meta.appendChild(document.createTextNode(' · '));
        var t = document.createElement('span');
        t.className = 'cc-rings';
        t.textContent = rings + (rings === 1 ? ' ring' : ' rings');
        meta.appendChild(t);
      }
      b.appendChild(nm); b.appendChild(city); b.appendChild(meta);
      b.onclick = function(){ closeClubs(); startRun(f.code); };
      grid.appendChild(b);
    })(list[i]);
  }
}

/* ── ONE GAME, IN FULL ─────────────────────────────────────────────────────
 *
 * The scoreline was always on the results screen and the game behind it never
 * was. R.gameDetail builds the box score off the run's seed and the game's own
 * address, so opening game 41 twice shows the same 41 points and a reload does
 * not rewrite history.
 *
 * WHICH GAMES ARE WALKABLE is what `gsList` holds: the playoff rounds and the
 * marquee nights, newest first, which is what "the big games" means here. The
 * Previous and Next buttons walk that list, so somebody who opens a Finals
 * game can read the whole series without going back to the table each time.
 * A game opened from the months fold is not on the list, and the buttons hide
 * rather than jumping somewhere unrelated.
 */
var gsList = [], gsAt = -1;

function sameRef(a, b){
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'playoff'
    ? (a.round === b.round && a.game === b.game)
    : a.index === b.index;
}

function openGame(ref){
  var d = R.gameDetail(run, ref);
  if (!d) return;
  gsList = R.bigGames(run);
  gsAt = -1;
  for (var i = 0; i < gsList.length; i++) if (sameRef(gsList[i], ref)) { gsAt = i; break; }
  renderGame(d);
  sheetReturn = document.activeElement;
  $('gamesheet').classList.add('open');
  $('b-gs-x').focus();
}

function closeGame(){
  if (!$('gamesheet').classList.contains('open')) return;
  $('gamesheet').classList.remove('open');
  if (sheetReturn && sheetReturn.focus) { try { sheetReturn.focus(); } catch (e) {} }
  sheetReturn = null;
}

function stepGame(by){
  if (gsAt < 0) return;
  var at = gsAt + by;
  if (at < 0 || at >= gsList.length) return;
  gsAt = at;
  var d = R.gameDetail(run, gsList[at]);
  if (d) renderGame(d);
  /* The panel scrolls, and a walk that leaves you halfway down the previous
     game's box score is a walk that looks like nothing happened. */
  var panel = $('gamesheet').querySelector('.panel');
  if (panel) panel.scrollTop = 0;
}

/* "A. Mourning". Falls back to whatever it was given rather than to an empty
   cell: a one word name (there are a few) has no initial to take. */
function boxName(n){
  var parts = String(n || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  return parts[0].charAt(0) + '. ' + E.lastNameOf(n);
}

function renderGame(d){
  $('gs-eyebrow').textContent = d.label
    + (d.live ? ' · You played it' : '')
    + (d.marquee && !d.round ? ' · Marquee night' : '');
  var res = $('gs-res');
  res.textContent = d.won ? 'Won' : 'Lost';
  res.className = 'gs-res ' + (d.won ? 'w' : 'l');
  $('gs-score').textContent = d.yourPoints + '-' + d.oppPoints
    + (d.ot ? (d.ot > 1 ? ' ' + d.ot + 'OT' : ' OT') : '');

  /* WHO IT WAS AGAINST, and the two kinds of answer are different. A regular
     season opponent is a real club out of the same data. A playoff opponent
     is a strength the bracket drew, so it is described rather than named:
     naming one would invent a club that never played. */
  var poOpp = !d.oppName && d.round ? brkOppLabel(d.round) : '';
  $('gs-opp').textContent = d.oppName
    ? (d.home ? 'vs ' : 'at ') + d.oppName
    : (poOpp ? (d.home ? 'vs ' : 'at ') + poOpp : (d.home ? 'Home' : 'Away'))
      + ' · played like a ' + oppWins(d.oppNet) + ' win team';

  /* The quarters. */
  var q = $('gs-qtr');
  q.textContent = '';
  var hr = document.createElement('tr');
  hr.appendChild(document.createElement('th'));
  for (var n = 0; n < d.quarters.names.length; n++) {
    var th = document.createElement('th');
    th.textContent = d.quarters.names[n];
    hr.appendChild(th);
  }
  var tt = document.createElement('th');
  tt.textContent = 'T';
  hr.appendChild(tt);
  q.appendChild(hr);

  var line = function(name, nums, total, mine){
    var tr = document.createElement('tr');
    if (mine) tr.className = 'you';
    var c0 = document.createElement('td');
    c0.textContent = name;
    tr.appendChild(c0);
    for (var k = 0; k < nums.length; k++) {
      var td = document.createElement('td');
      td.textContent = String(nums[k]);
      tr.appendChild(td);
    }
    var tdT = document.createElement('td');
    tdT.className = 'tot';
    tdT.textContent = String(total);
    tr.appendChild(tdT);
    q.appendChild(tr);
  };
  line('Them', d.quarters.theirs, d.oppPoints, false);
  line('You', d.quarters.yours, d.yourPoints, true);

  /* The box score, best night first. A box score in slot order is a roster;
     in scoring order it is a report on the game. */
  var bx = $('gs-box');
  bx.textContent = '';
  /* A GAME THAT WAS PLAYED HAS DIFFERENT COLUMNS, and that is honesty rather
     than an omission. A resolved game's sheet is a decomposition, so it can
     carry minutes, rebounds and assists because the decomposition invents
     them from the same total. A live game counted what happened, and nothing
     in the forward sim models a rebound or an assist: printing a column to
     match the other sheet's shape would be the invented-opponent mistake in
     miniature. What it can say instead is the line from the floor. */
  var head = document.createElement('tr');
  (d.live ? ['', 'Pts', 'FG', '3P', 'FT'] : ['', 'Min', 'Pts', 'Reb', 'Ast', 'FG', '3P'])
    .forEach(function(h){
      var th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    });
  bx.appendChild(head);

  var rows = d.box.slice().sort(function(a, b){ return b.pts - a.pts; });
  for (var r = 0; r < rows.length; r++) {
    var l = rows[r];
    var tr = document.createElement('tr');
    if (r === 0) tr.className = 'top';
    var c = document.createElement('td');
    var nm = document.createElement('span');
    nm.className = 'bn';
    /* THE WAY A BOX SCORE WRITES A NAME, which is also the way it fits. The
       figures take about 246px of a 358px row, so the name column is 104 and
       "Alonzo Mourning" came out as "Alonzo Mour...". An initial and a
       surname is both what every real box score prints and short enough that
       nobody is truncated. The full name is on the title, for anybody who
       wants it and for a screen reader. */
    nm.textContent = boxName(l.n);
    nm.title = l.n;
    var sl = document.createElement('span');
    sl.className = 'bs';
    sl.textContent = l.slot || '';
    c.appendChild(nm); c.appendChild(sl);
    tr.appendChild(c);
    var cells = d.live
      ? [String(l.pts), l.fgm + '-' + l.fga, l.tpm + '-' + l.tpa, l.ftm + '-' + l.fta]
      : [String(l.min), String(l.pts), String(l.reb), String(l.ast),
        l.fgm + '-' + l.fga, l.tpm + '-' + l.tpa];
    var ptsAt = d.live ? 0 : 1;
    for (var z = 0; z < cells.length; z++) {
      var td = document.createElement('td');
      if (z === ptsAt) td.className = 'pts';
      td.textContent = cells[z];
      tr.appendChild(td);
    }
    bx.appendChild(tr);
  }

  /* Two short sentences. The first answers "why is everyone playing 48
     minutes", which is the thing a reader notices first and would otherwise
     read as a bug. The second answers "where is their box score". */
  $('gs-note').textContent = d.live
    ? 'You played this one. Every number is what happened. '
      + 'No rebounds or assists: the live game does not count them. '
      + 'The other side is a team rating, not a roster, so it has no box score.'
    /* THE MINUTES ARE DERIVED, and at five men they are arithmetic: five on
       the floor for the whole game is 240 player minutes and 48 each. */
    : NUMWORD(E.SLOTS.length, true) + ' men, ' + (240 + d.ot * 25)
      + ' minutes, every point. The other side is a team rating, not a '
      + 'roster, so it has no box score.';

  var prev = $('b-gs-prev'), next = $('b-gs-next');
  var walk = gsAt >= 0;
  prev.hidden = !walk; next.hidden = !walk;
  prev.disabled = !walk || gsAt <= 0;
  next.disabled = !walk || gsAt >= gsList.length - 1;
}

/* ── THE FIRST RUN GUIDE ───────────────────────────────────────────────────
 *
 * Once per browser. The only thing in this game that interrupts somebody
 * before they have done anything, and it earns that by being the only thing
 * that explains the game at all.
 *
 * EVERY NUMBER IS READ OUT OF THE CONSTANTS. A guide is copy, and copy with a
 * typed number in it is a guide that lies the first time somebody sweeps the
 * cap. The cap has already been swept twice in this game's short life ($134M
 * to $120M), and a first-time player told the wrong one has no way to know.
 *
 * WHAT IT DOES NOT DO is walk anybody through a practice draft. The football
 * game has one and it is worth having; it is also a second copy of the draft
 * loop, and the thing missing here was not a tutorial, it was any statement
 * at all of what the game is.
 */
var FRG_KEY = 'rtf.guide.v1';

function frgSeen(){
  try { return localStorage.getItem(FRG_KEY) === '1'; } catch (e) { return true; }
}
function frgMark(){ try { localStorage.setItem(FRG_KEY, '1'); } catch (e) {} profileSend({ guide: true }); }

function frgFill(){
  var C = E.CONSTANTS;
  /* FIVE MODES, ONE LINE EACH, in the order the front page shows them, which
     is Career first since the owner made it the main game, then Classic. This
     guide used to be the draft's rules in three steps, which was right while
     the draft was the game. It is one of five ways in now, and a first-timer
     told only how to draft would never find the other four.

     THE GAME 7 CLAUSE STAYS, on the draft's own line. It is the most
     distinctive thing that mode does and check-home holds the guide to saying
     it. Every number is read off the constants, never typed. */
  var steps = [
    '<b>Career.</b> One basketball life, from high school to the Hall of Fame.',
    '<b>Classic.</b> ' + NUMWORD(E.SLOTS.length, true) + ' picks under a '
      + money(C.CAP_MUSD) + ' cap. Pick how fast you play. Play ' + C.REGULAR_SEASON_GAMES
      + ', and <b>every Game 7 is yours to play</b>.',
    '<b>Conquest.</b> Winners stay on. Beat real teams and take their best guys.',
    '<b>Fix History</b>, every day. One real team that fell short. '
      + 'Work the phones through four trade windows.',
    '<b>Six Passes</b>, every day. Get the ball from one legend to another '
      + 'through real teammates.'
  ];
  var ol = $('frg-steps');
  ol.textContent = '';
  for (var i = 0; i < steps.length; i++) {
    var li = document.createElement('li');
    li.innerHTML = steps[i];
    ol.appendChild(li);
  }
  $('frg-goal').innerHTML = 'Start with <b>your career</b>. The button is at the bottom.';
}

/* Shown on the FRONT PAGE only, and only once the data has landed, because
   the button it points at is disabled until then and an arrow at a dead
   control is worse than no arrow. */
/* The guide on demand, from How to play. Whatever the seen flag says. */
function frgOpen(){
  if (!DATA) return;
  var ht = $('home-howto'); if (ht) ht.open = false;
  window.scrollTo(0, 0);
  frgFill();
  $('frg').hidden = false;
}

function frgClose(){
  frgMark();
  $('frg').hidden = true;
}

/* ── DECADES ───────────────────────────────────────────────────────────────
 *
 * Names for the six eras, because "aughts" is a key and not a thing anybody
 * says. The SPANS are not here: they come off the data through R.eraSeasons,
 * so a picker can never promise a season the file does not hold.
 */
var ERA_NAMES = {
  seventies: 'The Seventies', eighties: 'The Eighties', nineties: 'The Nineties',
  aughts: 'The 2000s', tens: 'The 2010s', twenties: 'The 2020s'
};
var ERAKEY = 'rtf.era.v1';

function lastEra(){
  try {
    var e = localStorage.getItem(ERAKEY);
    return (e && E.ERAS[e]) ? e : null;
  } catch (e) { return null; }
}
function rememberEra(key){ try { localStorage.setItem(ERAKEY, key); } catch (e) {} profileSend({ lastEra: key }); }

function openEras(){
  renderEras();
  sheetReturn = document.activeElement;
  $('erasheet').classList.add('open');
  var first = $('eragrid').querySelector('.clubchip');
  (first || $('b-era-x')).focus();
}

function closeEras(){
  if (!$('erasheet').classList.contains('open')) return;
  $('erasheet').classList.remove('open');
  if (sheetReturn && sheetReturn.focus) { try { sheetReturn.focus(); } catch (e) {} }
  sheetReturn = null;
}

function renderEras(){
  var grid = $('eragrid');
  grid.textContent = '';
  var keys = Object.keys(E.ERAS);
  for (var i = 0; i < keys.length; i++) {
    (function(key){
      var yrs = R.eraSeasons(key);
      /* A decade the data barely reaches is not a mode. Six seasons is the
         seventies today and is plenty; below that a run would spend most of
         its draws on the same three clubs. */
      if (yrs.length < 4) return;
      var b = document.createElement('button');
      b.className = 'clubchip';
      /* No club colour to take, so the accent is the page's own. A decade is
         not a club and dressing it in one would be a lie about whose it is. */
      b.style.setProperty('--cc-accent', 'var(--orange)');
      var nm = document.createElement('span');
      nm.className = 'cc-name';
      nm.textContent = ERA_NAMES[key] || key;
      var span = document.createElement('span');
      span.className = 'cc-city';
      span.textContent = yrs[0] + ' to ' + yrs[yrs.length - 1];
      var meta = document.createElement('span');
      meta.className = 'cc-meta';
      meta.textContent = yrs.length + (yrs.length === 1 ? ' season' : ' seasons');
      b.appendChild(nm); b.appendChild(span); b.appendChild(meta);
      b.onclick = function(){ closeEras(); startRun(null, key); };
      grid.appendChild(b);
    })(keys[i]);
  }
}

/* MORE WAYS TO PLAY, the phone's sheet. It owns no tiles: the one grid is
   MOVED in when it opens and back to the front page when it shuts, which is
   the dock's rule (move the real button, never a copy). One set of tiles means
   one set of ids and one place each tile's state is painted. */
function openModes(){
  var g = $('mw-grid');
  if (!g) return;
  $('mw-slot').appendChild(g);
  sheetReturn = document.activeElement;
  $('modesheet').classList.add('open');
  var first = g.querySelector('button');
  (first || $('b-mw-x')).focus();
}
function closeModes(quiet){
  var g = $('mw-grid'), home = $('hp-tiles');
  if (g && home && g.parentNode !== home) home.appendChild(g);
  if (!$('modesheet').classList.contains('open')) return;
  $('modesheet').classList.remove('open');
  if (!quiet && sheetReturn && sheetReturn.focus) { try { sheetReturn.focus(); } catch (e) {} }
  sheetReturn = null;
}

function renderEraDoor(){
  var door = $('b-decade'), main = $('b-decade-go');
  var name = $('dc-name'), sub = $('dc-sub'), tag = $('dc-tag'), pick = $('b-decade-pick');
  if (!door || !main || !sub) return;
  var last = DATA ? lastEra() : null;
  if (!last) {
    door.className = 'mtile';
    tag.textContent = 'Classic';
    name.textContent = 'Decades';
    name.style.removeProperty('color');
    sub.textContent = 'One decade. Every team. '
      + NUMWORD(E.SLOTS.length, true) + ' from one era.';
    pick.hidden = true;
    main.onclick = openEras;
    return;
  }
  /* The same "this one is remembered" treatment the club tile gets, in the
     page's own accent. A decade has no colours of its own and borrowing a
     club's would say something false about whose era it was. */
  var yrs = R.eraSeasons(last);
  door.className = 'mtile clubbed';
  door.style.setProperty('--md-accent', 'rgba(240,120,45,.55)');
  tag.textContent = 'Decades';
  name.textContent = ERA_NAMES[last] || last;
  name.style.color = 'var(--orange)';
  sub.textContent = yrs.length
    ? yrs[0] + ' to ' + yrs[yrs.length - 1] + '. Every team.'
    : 'One decade. Every team.';
  pick.hidden = false;
  main.onclick = function(){ startRun(null, last); };
}

/* The name a run wears everywhere: the app bar, the results, the career row.
   Returns null for an ordinary run, because "The League" is not a mode, it is
   the game, and labelling it would put a badge on every screen. */
function modeLabel(r){
  if (!r) return null;
  if (r.daily) return 'Daily · Day ' + r.daily;
  if (r.club) return 'One Franchise · ' + E.teamName(r.club);
  if (r.era) return ERA_NAMES[r.era] || r.era;
  return null;
}

/* The short form, for the app bar chip, which has room for one word beside
   the wordmark at 360px. */
function modeChip(r){
  if (!r) return null;
  if (r.daily) return 'Day ' + r.daily;
  if (r.club) return E.teamName(r.club);
  if (r.era) return (ERA_NAMES[r.era] || r.era).replace(/^The /, '');
  return null;
}

/* ── TODAY'S RUN ───────────────────────────────────────────────────────────
 *
 * The seed is the date, so every player gets the same spins and two
 * records are comparable for the first time in this game. Everything else
 * here is an ordinary league run.
 *
 * THE DAY ROLLS AT EASTERN MIDNIGHT, not UTC and not the visitor's own
 * midnight. UTC rolls at 7 or 8pm Eastern, which takes the puzzle away in the
 * middle of the evening somebody is playing it. The visitor's own midnight
 * would give two people in one group chat different puzzles on the same
 * night, which is the whole thing this mode is for. Eastern is what every
 * other calendar-day clock on this site already uses.
 *
 * IT FALLS BACK TO THE LOCAL DATE AND NEVER THROWS. A browser with no time
 * zone database answers the wrong puzzle, which costs comparability for that
 * one visitor; a browser with no game at all costs everything.
 */
/* Day 1 is the day this shipped, read in Eastern like every day after it. It
   was written as the UTC date first, which is a day ahead of Eastern for most
   of the evening, so the first player's "day 1" was day 0 and only the clamp
   below made it read right. A clamp is a guard against a wrong clock, not a
   place to keep an off-by-one. */
var DAILY_EPOCH = '2026-09-18';          // day 1
var DAILYKEY = 'rtf.daily.v1';

/* The Eastern calendar day is economy.js's dayOf, the one clock every daily on
   this site rolls on. Without it (the file failed to load) the page answers
   the local date, which is what dayOf answers with no time zone data. */
function easternISO(now){
  var X = window.RTF_ECON, d = now || new Date();
  if (X) return X.dayOf(d);
  var p = function(n){ return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* Whole days between two calendar dates, counted in UTC so no daylight saving
   change can make a day 23 or 25 hours long and round the difference wrong. */
function dayNumberOf(iso){
  var a = String(iso).split('-'), b = DAILY_EPOCH.split('-');
  var ms = Date.UTC(+a[0], +a[1] - 1, +a[2]) - Date.UTC(+b[0], +b[1] - 1, +b[2]);
  return Math.floor(ms / 86400000) + 1;
}

function todayNumber(){ return Math.max(1, dayNumberOf(easternISO())); }

/* The seed. A plain hash of the day number, so it is reproducible from the
   date alone and nothing has to be shipped alongside it. */
function dailySeed(n){ return E.hashSeed('run-the-floor-daily-' + n); }

function dailyState(){
  try {
    var raw = localStorage.getItem(DAILYKEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    return (s && s.v === 1) ? s : null;
  } catch (e) { return null; }
}
function dailyPut(s){
  try { localStorage.setItem(DAILYKEY, JSON.stringify(s)); } catch (e) {}
}

/* Whether today's is already in the book. A day that has not been played
   answers false, and so does a stored day from any other date, which is what
   makes the door open again at midnight with nothing to reset. */
function dailyDone(){
  var s = dailyState();
  return !!(s && s.done && s.day === todayNumber());
}

/* WHETHER THE RUN ON SCREEN IS ACTUALLY TODAY'S, which is not the same
   question as whether it is a daily. A draft can sit saved overnight: started
   on day 4, finished on day 5, and filed against day 5 it would put
   yesterday's puzzle into today's slot, shut today's door, and hand somebody a
   streak day for a board nobody else was playing. Filed against day 4 instead
   it would walk lastDone backwards and break a streak that was still alive.
   Neither is worth a branch. A stale daily finished later is an ordinary run:
   it still counts in the career and it still earns badges, it just does not
   fill a day, and today's door is still there. This is the one thing the day
   number riding in the run exists to answer. */
function dailyIsToday(){
  return !!(run && run.daily && run.daily === todayNumber());
}

/* CONSECUTIVE DAYS, and a gap resets it rather than pausing it. Counted off
   the day number alone, so it cannot drift with a clock: yesterday's day plus
   one continues, anything else starts again at one. A day replayed is not a
   second day, which is why the guard is on the day and not on the count. */
/* What the daily streak WILL be once today is filed, asked before it is. The
   career is written first and the daily record after it, on purpose (see the
   note in recordRun), so the badge for a streak reads this rather than the
   record. Same arithmetic as dailyRecord, and a day already filed answers the
   streak it already has. */
function dailyStreakAfter(){
  if (!dailyIsToday()) return 0;
  var n = todayNumber(), s = dailyState();
  if (s && s.done && s.day === n) return s.streak || 0;
  return (s && s.lastDone === n - 1) ? (s.streak || 0) + 1 : 1;
}

function dailyRecord(out){
  var n = todayNumber();
  var s = dailyState() || { v: 1, played: 0, streak: 0, bestStreak: 0, lastDone: 0, best: -1 };
  if (s.done && s.day === n) return s;       // already filed, never twice
  s.v = 1;
  s.day = n;
  s.iso = easternISO();
  s.done = true;
  s.played = (s.played || 0) + 1;
  s.streak = (s.lastDone === n - 1) ? (s.streak || 0) + 1 : 1;
  s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
  s.lastDone = n;
  s.wins = out.wins; s.losses = out.losses;
  s.label = out.wins + '-' + out.losses;
  s.headline = headline(out);
  s.rating = Math.round(out.rating);
  s.ring = !!out.titleWon;
  if (out.wins > (s.best == null ? -1 : s.best)) s.best = out.wins;
  dailyPut(s);
  return s;
}

/* THE DRAW HAPPENS FIRST AND THE REELS CATCH UP. run.js picks the club, then
   the strips are built to land on it. The board is held back until they settle
   so the answer is not readable underneath before the reel says it, but every
   path that can leave a reel mid-flight also calls finish, so the draft can
   never be left waiting on an animation that did not arrive. */
function drawInto(fn){
  if (reelBusy) return;
  try {
    fn();
  } catch (err) {
    $('d-note').textContent = err.message;
    return;
  }
  save();
  var draw = run.currentDraw;
  if (!draw) { renderDraft(); return; }

  reelBusy = true;
  /* Out of the last club's colours before the reels start moving, so the page
     and the wheel are never claiming different clubs mid-spin. UNDER A LOCK
     there is no last club: it is the same club, so stripping the colours and
     putting them straight back is a flash of grey on every pick with nothing
     being said by it. */
  if (!run.club) undressPage();
  /* The board is BUILT here and read a beat later. renderDraft puts the real
     tiles up at their real height and marks them pending, which is what stops
     the page collapsing under the reels. See the .opts.pending rules. */
  renderDraft();

  /* A LOCKED CLUB DOES NOT SPIN, and that is the mode on screen rather than
     in a label. Nothing is being drawn there: the reel would ripple through
     twenty nicknames and land on the only one it was ever going to land on,
     which reads as a wheel that is lying to you. It is set once and dressed,
     and only the year moves. The club CODE can still change under a lock
     (Seattle to Oklahoma City), so the box is written on every draw rather
     than only on the first. */
  var locked = !!run.club;
  var pools = reelPools(), pending = locked ? 1 : 2;

  /* ── A REEL LANDS INTO ITS OWN DRAW, OR NOT AT ALL ──────────────────────
   *
   * A spin is about a second long and every one of these callbacks is a timer
   * pointed at a run that may be gone by the time it fires. Pressing the
   * wordmark mid-spin and then Abandon sets `run` to null, and the landing
   * callback then ran anyway: `renderDraft` walked into `R.remaining(run)`
   * and threw "Cannot read properties of null (reading 'roster')" out of an
   * animation, on the home screen, with nothing on screen to say so.
   *
   * THE THROW IS THE LOUD HALF AND IT IS NOT THE WORST HALF. `dressPage`
   * fires first, so an abandoned club painted the FRONT PAGE in its colours
   * on the way out: a home screen wearing a team the player had just thrown
   * away, which renders perfectly and reports nothing.
   *
   * This is the identity check every other timer on this page already
   * carries, which `show()` writes out for the live game and the bracket
   * walk, arriving at the one animation that never had it. The run OBJECT is
   * compared rather than a flag, so it catches a second run as well as no
   * run: `startRun` builds a new one, and a spin from the old one landing
   * into it would draw the wrong club on the right board.
   *
   * reelBusy is cleared on the way out. It is the flag `drawInto` refuses on,
   * so a stale spin that simply returned would leave the NEXT draft unable to
   * deal a board at all, which is a worse failure than the one being fixed.
   */
  var forRun = run, forDraw = draw;
  var mine = function(){
    if (run === forRun && run && run.currentDraw === forDraw) return true;
    reelBusy = false;
    return false;
  };

  var settled = function(){
    if (!mine()) return;
    if (--pending > 0) return;
    reelBusy = false;
    renderDraft();
  };
  if (locked) {
    lockClubReel(draw);
    spinReel($('box-s'), $('reel-s'), pools.seasons, String(draw.season), function(){
      if (!mine()) return;
      dressReel($('box-s'), draw.team);
      dressPage(draw.team);
      say('The ' + draw.season + ' season. Open: ' + draw.openSlots.join(', ') + '.');
      settled();
    });
    return;
  }
  spinReel($('box-s'), $('reel-s'), pools.seasons, String(draw.season), settled);
  /* The club lands a beat after the season, which is the order the question is
     asked in: which year, and then whose team. */
  setTimeout(function(){
    if (!mine()) return;
    spinReel($('box-c'), $('reel-c'), pools.clubs, E.teamName(draw.team), function(){
      if (!mine()) return;
      /* BOTH boxes, and only once the CLUB has landed. Dressing the season box
         at the same moment its own reel stops would give the answer away a beat
         early: the color says Bulls before the second reel has said Bulls. */
      dressReel($('box-s'), draw.team);
      dressReel($('box-c'), draw.team);
      dressPage(draw.team);
      say('The ' + draw.season + ' ' + E.teamName(draw.team)
        + '. Open: ' + draw.openSlots.join(', ') + '.');
      settled();
    });
  }, 130);
}

/* The club box under a lock: written, centred, dressed, and never animated.
   It shares showDraw's arithmetic for where a settled strip sits, because two
   ways of writing "the middle of the box" is two answers the first time
   somebody changes ROW_H. */
function lockClubReel(draw){
  var box = $('box-c'), strip = $('reel-c');
  reelFill(strip, [E.teamName(draw.team)], 0);
  strip.style.transition = 'none';
  strip.style.transform = 'translateY(' + ((box.clientHeight - ROW_H) / 2) + 'px)';
  box.classList.remove('waiting', 'spin', 'hit');
  box.classList.add('done', 'locked');
  dressReel(box, draw.team);
}

/* WHAT YOU DREW, WITHOUT THE ANIMATION. A run restored mid-draft has a club and
   a season already drawn and no spin coming, and the reels used to sit empty
   and grey through it: the board underneath said which men were on offer
   and nothing on the page said whose team they were. */
function showDraw(draw){
  if (!draw) return;
  var name = E.teamName(draw.team);
  reelFill($('reel-s'), [String(draw.season)], 0);
  reelFill($('reel-c'), [name], 0);
  var mid = ($('box-s').clientHeight - ROW_H) / 2;
  [['box-s', 'reel-s'], ['box-c', 'reel-c']].forEach(function(pair){
    var box = $(pair[0]), strip = $(pair[1]);
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(' + mid + 'px)';
    box.classList.remove('waiting', 'spin', 'hit');
    box.classList.add('done');
    dressReel(box, draw.team);
  });
  dressPage(draw.team);
}

function spin(){ drawInto(function(){ R.spin(run, DATA); }); }
/* The re-spin button lives in the dock, so it is pressed from anywhere on the
   board. Same reason as the one in sign(): the thing it starts is at the top. */
function respin(){ backToWheel(); drawInto(function(){ R.respin(run, DATA); }); }
