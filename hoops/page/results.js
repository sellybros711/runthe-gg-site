// ── results ────────────────────────────────────────────────────────────────

/* Where the season actually ended, in the words a fan would use. */
function headline(out){
  if (out.titleWon) return 'Champions';
  if (!run.playoffs || !run.playoffs.rounds.length) return 'Missed the playoffs';
  var last = run.playoffs.rounds[run.playoffs.rounds.length - 1];
  if (last.round === 'Play-In') return 'Lost the play-in';
  if (last.round === 'NBA Finals') return 'Lost the Finals';
  return 'Bounced in ' + roundPhrase(last.round);
}

/* A round as it is said inside a sentence. "Out in the Conference
   Semifinals" is the bracket's label read aloud; nobody watching says it. */
function roundPhrase(name){
  return ({ 'Play-In': 'the play-in', 'First Round': 'round one',
    'Conference Semifinals': 'round two', 'Conference Finals': 'the conference finals',
    'NBA Finals': 'the Finals' })[name] || name;
}

/* A net rating, said as the number of games that club would win over 82. Uses
   the engine's own Pythagorean, so this cannot drift from the number the season
   was actually played against. */
function oppWins(net){
  var L = E.CONSTANTS.LEAGUE_RTG;
  var pct = E.teamWinPct(L + net / 2, L - net / 2);
  return Math.round(pct * E.CONSTANTS.REGULAR_SEASON_GAMES);
}

function getOrdinal(n){
  var mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}

function renderOver(out){
  /* THE HEADLINE IS WHAT HAPPENED, NOT WHAT THE ROSTER RATED. Those are two
     different questions and printing the second as the headline produced a
     results screen reading "Play-in team" over the words "Lottery", because the
     coach's verdict comes off the rating and the seeding comes off the actual
     record. The rating still gets said, underneath, where it cannot contradict
     the scoreboard. */
  var v = $('o-verdict');
  v.textContent = headline(out);
  v.className = 'verdict ' + (out.titleWon ? 'good' : 'bad');

  $('o-record').textContent = out.wins + '-' + out.losses;
  say(headline(out) + '. ' + out.wins + ' wins, ' + out.losses + ' losses.');
  var story = seasonStory(out);
  $('o-story').textContent = story;
  $('o-story').style.display = story ? '' : 'none';
  /* The coach's verdict is deliberately NOT here. It is a read on the roster
     and the seed label is a read on the season, and side by side they collided
     into "Play-in · Play-in team". The rating says the same thing in a number,
     and the coach earns his place in the tags underneath. */
  /* WHICH GAME THIS RECORD WAS SET IN, first, because it is the thing that
     makes the rest of the line comparable to anything. A 52-30 off the whole
     league and a 52-30 off one franchise are two different achievements, and
     a results screen that does not say which is a receipt with the shop name
     torn off. An ordinary run says nothing, for the reason modeLabel does. */
  var mode = modeLabel(run);
  $('o-seed').textContent = (mode ? mode + ' · ' : '')
    + out.seedLabel
    + ' · Rating ' + out.rating.toFixed(0)
    + ' · ORtg ' + out.ortg.toFixed(1) + ' · DRtg ' + out.drtg.toFixed(1)
    /* THE DENOMINATOR COUNTS YOUR TEAM, because the rank does. nationalRank
       inserts this roster into the table of real team-seasons and reports
       where it landed, so a roster worse than all 1,403 of them is 1,404th,
       and the page was printing "1404th of 1403 all time". Seen on a
       deliberately terrible 2-80 draft, which is the only place it shows: the
       top end reads "1st of 1403" and is wrong by the same one without
       looking like anything. */
    + (out.allTimeRank
      ? ' · ' + out.allTimeRank + getOrdinal(out.allTimeRank) + ' of '
        + (DATA.ratingTable.length + 1).toLocaleString('en-US') + ' all time'
      : '');

  /* The identity, said in this roster's names, under the tags. */
  paintSysLine($('o-sys'), out.structure && out.structure.system);

  var tags = $('o-tags');
  tags.textContent = '';
  function tag(text, kind){
    var el = document.createElement('span');
    el.className = 'tag' + (kind ? ' ' + kind : '');
    el.textContent = text;
    tags.appendChild(el);
  }
  if (out.beatRecord) tag('Beat 72 wins', 'good');
  if (out.isGOAT) tag('74 wins', 'good');
  /* The shape always gets said, even when it earned no bonus. A roster that is
     neither a strength nor a weakness anywhere still has an identity, and an
     empty tag row reads as something failing to render. A shape that DID earn a
     bonus is already in the strengths below, so it is not said twice. */
  var shape = out.structure && out.structure.archetype ? out.structure.archetype.name : null;
  if (shape && out.coach.strengths.indexOf(shape) === -1) tag(shape);
  /* HOW IT PLAYED: the plan it ran, and the three words for its shape. The
     plan is a tag of its own colour when it paid and a bad one when it cost,
     read off the same net the season used. */
  if (out.tempo && out.tempo.plan && out.tempo.plan !== 'balanced')
    tag(out.tempo.name + ' · ' + out.tempo.pace, out.tempo.net > 0.1 ? 'good' : out.tempo.net < -0.1 ? 'bad' : '');
  if (out.style) ['size', 'speed', 'range'].forEach(function(k){
    if (out.style[k] && out.style[k] !== 'Balanced') tag(out.style[k]);
  });
  for (var i = 0; i < out.coach.strengths.length; i++) tag(out.coach.strengths[i], 'good');
  for (var j = 0; j < out.coach.weaknesses.length; j++) tag(out.coach.weaknesses[j], 'bad');

  // playoffs
  var po = $('o-playoffs');
  po.textContent = '';
  if (!run.playoffs) {
    $('o-porounds').textContent = '';
    var none = document.createElement('p');
    none.className = 'dim';
    none.style.cssText = 'margin:0;font-size:13.5px';
    none.textContent = 'Missed them. ' + E.CONSTANTS.PLAY_IN_WINS
      + ' wins gets you to the play-in. ' + E.CONSTANTS.TOP_SIX_WINS + ' gets you a seed.';
    po.appendChild(none);
  } else {
    $('o-porounds').textContent = run.playoffs.rounds.length
      + (run.playoffs.rounds.length === 1 ? ' round' : ' rounds');

    /* ONE BLOCK PER SERIES, AND IT USED TO BE TWO.
     *
     * A summary table sat above these lists carrying the round, WON or LOST
     * and the series score, and then every game of the series was listed
     * underneath with its own result. "LOST 2-4" over a list of two wins and
     * four losses is the same fact told twice, four inches apart, which is
     * the defect the results gauge and the story line were just untangled
     * for. The strength line was the only thing the table said that the list
     * does not, so it moved onto the header and the table went.
     *
     * EVERY GAME OF EVERY SERIES, and they were in the run object the whole
     * time. playoffSeries has always returned its games and nothing has ever
     * drawn one, so a run that ended 3-4 in the Finals told you the series
     * score and not one thing that happened in it. These are the big games
     * in the most literal sense available.
     */
    for (var s = 0; s < run.playoffs.rounds.length; s++) {
      (function(rd, ri){
        var wrap = document.createElement('div');
        wrap.className = 'poseries';

        var head = document.createElement('div');
        head.className = 'pohead';
        var nm = document.createElement('span');
        nm.className = 'ph-n';
        nm.textContent = rd.round;
        var res = document.createElement('span');
        res.className = 'ph-r ' + (rd.won ? 'w' : 'l');
        res.textContent = (rd.won ? 'Won ' : 'Lost ') + rd.yourWins + '-' + rd.oppWins;
        head.appendChild(nm); head.appendChild(res);
        wrap.appendChild(head);

        var lvl = document.createElement('div');
        lvl.className = 'ph-opp';
        var ro = brkOppLabel(rd.round);
        lvl.textContent = (ro ? 'vs ' + ro + ' · ' : '') + 'played like a ' + oppWins(rd.oppNet) + ' win team';
        wrap.appendChild(lvl);

        (rd.games || []).forEach(function(g, gi){
          var b = document.createElement('button');
          b.className = 'pogame';
          var n = document.createElement('span');
          n.className = 'pg-n';
          n.textContent = rd.games.length > 1 ? 'Game ' + (gi + 1) : 'One game';
          var w = document.createElement('span');
          w.className = 'pg-r ' + (g.won ? 'w' : 'l');
          w.textContent = g.won ? 'W' : 'L';
          var h = document.createElement('span');
          h.textContent = g.home ? 'home' : 'away';
          var sc = document.createElement('span');
          sc.className = 'pg-s';
          sc.textContent = g.yourPoints + '-' + g.oppPoints + (g.ot ? ' OT' : '');
          b.appendChild(n); b.appendChild(w); b.appendChild(h); b.appendChild(sc);
          b.onclick = function(){ openGame({ kind: 'playoff', round: ri, game: gi }); };
          wrap.appendChild(b);
        });
        po.appendChild(wrap);
      })(run.playoffs.rounds[s], s);
    }
  }

  /* RUN IT BACK MEANS THE SAME GAME, and today's run is the one game that
     cannot be run back: once a day is what makes two records comparable. The
     handler already falls through to a league run, because a daily carries
     neither lock, so what was left was a button whose words promised the one
     thing it does not do. */
  $('b-again').textContent = run.daily ? 'Play a league run' : 'Run it back';

  renderBestNight();
  renderEarned();
  renderNewArenas();
  renderOverDoors();
  /* THE BOARD IS ASKED HERE AND NEVER AWAITED. renderOver is also what a
     restored finished run calls, so this runs again on a reopened season,
     which is right: the placing is a live number and a receipt of it would go
     stale the moment somebody else played. submitRun is the half that must not
     repeat, and its own flag rides in the saved run. */
  submitRun(out);
  renderStanding(out);
  renderRoster($('o-slots'));
  renderCourt(null, $('o-court'));

  renderDraftGrid();
  var squad = R.bestPossibleSquad(run, DATA);
  if (squad) {
    $('o-grade').textContent = 'draft efficiency ' + squad.efficiency.toFixed(0) + '%';
    $('o-best').textContent = YOUR_LOT + ': ' + squad.actualWs.toFixed(1)
      + ' win shares. The best ' + NUMWORD(E.SLOTS.length)
      + ' you could have built off your spins: '
      + squad.bestWs.toFixed(1) + ', for ' + money(squad.spend) + '.';
  } else {
    $('o-grade').textContent = '';
    $('o-best').textContent = '';
  }

  renderGauge(out);
  renderMonths();

  /* The flat table stays in the markup and stays hidden: it is the fallback if
     the fold ever fails to build, and it costs nothing. */
  var games = $('o-games');
  games.textContent = '';
}

/* ── THE BOARD ─────────────────────────────────────────────────────────────
 *
 * Which competition the sheet is showing. Held here rather than read off the
 * two selects, because the sheet is opened FROM a finished run and has to land
 * on that run's own board: opening on the league after a Bulls season would
 * show somebody a list their run is not in, and the first thing they would do
 * is decide the board is broken.
 */
var lbMode = { door: 'league', key: null, day: null };
var lbAxis = 'run';
/* The row this browser just put on the board, so it can be marked in the list.
   The id and not the whole run: a row comes back from the server and the local
   run is not it. */
var lbMine = null;
/* Guards a paint against a slower one that started earlier. Two selects a
   half second apart is two requests in flight, and without this the first to
   be asked for can be the last to land and paint over the answer somebody is
   actually looking at. */
var lbSeq = 0;

/* WHICH BOARD A RUN BELONGS ON, read off the run and never off the page's
   current selection. One function, because the submit and the standing and the
   sheet all have to agree about it, and three copies of a four-branch answer
   is three chances to file a run on one board and look for it on another. */
function modeOfRun(r){
  if (!r) return { door: 'league', key: null, day: null };
  if (r.daily) return { door: 'daily', key: null, day: r.daily };
  if (r.club) return { door: 'club', key: r.club, day: null };
  if (r.era) return { door: 'era', key: r.era, day: null };
  return { door: 'league', key: null, day: null };
}

/* HOW MANY SERIES THE RUN WON, counted off the bracket rather than stored,
   because run.playoffs is the record of what happened and a second count
   beside it would be the thing that drifts. The submit and the standing both
   read it, so the place the results screen shows is counted against the
   number the row will actually hold. */
function seriesWon(r){
  return r && r.playoffs
    ? r.playoffs.rounds.filter(function(x){ return x.won; }).length : 0;
}
function runDepth(r, out){
  return B.depthOf(out.wins, seriesWon(r),
    E.CONSTANTS.TOP_SIX_WINS, E.CONSTANTS.PLAY_IN_WINS);
}

/* HOW FAR A BOARD ROW WENT, in the words a fan uses. The server stores it as a
   number from 0 to 6 and the list is ordered on it, so the line under a name
   leads with it: the row above yours is above you for a reason you can read. */
var DEPTH_WORDS = ['Missed the playoffs', 'Lost the play-in', 'Bounced in round one',
  'Bounced in round two', 'Lost in the conference finals', 'Lost the Finals', 'Champions'];

/* The mode's name as it reads inside a sentence, where "on The league" is a
   capital letter in the middle of a line. */
function boardPhrase(m){
  return modeName(m).replace(/^The /, 'the ');
}

function modeName(m){
  if (!m) return 'The league';
  if (m.door === 'daily') return 'Daily · Day ' + m.day;
  if (m.door === 'club') return 'One Franchise · ' + E.teamName(m.key);
  if (m.door === 'era') return ERA_NAMES[m.key] || m.key;
  return 'The league';
}

/* THE RUN, SENT ONCE, AND NEVER AWAITED BY ANYTHING THE PLAYER IS WAITING ON.
   The results screen is painted before this is called and stays painted
   whatever comes back. A null is the ordinary answer on a project that has not
   run supabase/108_hoops_leaderboard.sql, and it must cost a line on one card
   rather than a screen.

   ONCE PER RUN, and the flag rides in the saved run for the same reason
   `recorded` does: renderOver is also what a restored finished run calls, so
   submitting there would put the same season on the board every time somebody
   reopened the tab. rtf_submit_run() swallows a same-minute duplicate as well,
   which covers a retry rather than this. */
/* The submit in flight, so the standing can count the field AFTER this run's
   row is in it rather than racing it. Raced, a signed in run was counted
   against a field that did not hold it yet and printed one short. */
var submitP = null;
function submitRun(out){
  if (!run || run.submitted) return Promise.resolve(null);
  run.submitted = true;
  var m = modeOfRun(run);
  var tagged = R.taggedRoster(run);
  var payload = {
    wins: out.wins,
    /* HOW MANY SERIES WERE WON, counted off the bracket rather than stored,
       because run.playoffs is the record of what happened and a second count
       beside it would be the thing that drifts. */
    playoffWins: seriesWon(run),
    /* PER GAME, which is what a basketball differential means everywhere else
       and what the column holds. The season total is 82 times bigger and would
       be refused by the range check, loudly, which is the right direction for
       this to be wrong in. */
    pointDiff: (out.totalPF - out.totalPA) / E.CONSTANTS.REGULAR_SEASON_GAMES,
    club: m.door === 'club' ? m.key : null,
    era: m.door === 'era' ? m.key : null,
    dailyDay: m.door === 'daily' ? m.day : null,
    rating: out.rating,
    ortg: out.ortg,
    drtg: out.drtg,
    chemistry: out.chemistry ? out.chemistry.bonus : null,
    structureMult: out.structure ? out.structure.multiplier : null,
    archetype: out.structure && out.structure.archetype
      ? out.structure.archetype.name : null,
    spendMusd: E.CONSTANTS.CAP_MUSD - R.remaining(run),
    respins: run.respinsUsed || 0,
    allTimeRank: out.allTimeRank,
    /* E.pkey's own format, which is what DATA.allPlayers is keyed by, so a row
       coming back off the board is looked up with no translation at either
       end. The club is in it because 755 of 16,057 rows are a player traded
       mid-season: id and season alone name two different half-seasons. */
    picks: tagged.map(function(p){ return E.pkey(p); }),
    slots: tagged.map(function(p){ return p._slot; }),
    seed: String(run.seed),
    rngCalls: run.rngCalls,
  };
  return submitP = B.submit(payload).then(function(id){
    if (id) {
      lbMine = id;
      run.boardId = id;
      save();
      /* THE RUN YOU FINISHED BEFORE YOU SIGNED IN. Fired here as well as on
         sign-in, because somebody already signed in when the run ended has
         nothing to claim and somebody who signs in afterwards does. Never
         awaited and never reported: a claim that fails costs a name on a row. */
      var st = A.state();
      if (st && st.signedIn) A.claim(id);
    }
    return id;
  });
}

/* WHERE THIS RUN LANDED. Four states and three of them are empty ones, which
   is the whole reason this is a function rather than a line of markup:
   unreachable, nobody on the board yet, and a place. The fourth is a run that
   was never submitted at all, which is what a restored season from before this
   shipped looks like, and it says nothing rather than apologising. */
function renderStanding(out){
  var el = $('o-stand');
  if (!el) return;
  var m = modeOfRun(run);
  var score = B.scoreOf(out.wins, (out.totalPF - out.totalPA)
    / E.CONSTANTS.REGULAR_SEASON_GAMES, runDepth(run, out));

  var draw = function(big, head, sub, open){
    el.textContent = '';
    var p = document.createElement('span');
    p.className = 'lp';
    p.textContent = big;
    var t = document.createElement('span');
    t.className = 'lt';
    var b = document.createElement('b');
    b.textContent = head;
    var s = document.createElement('span');
    s.textContent = sub;
    t.appendChild(b); t.appendChild(s);
    el.appendChild(p); el.appendChild(t);
    if (open) {
      var ch = document.createElement('span');
      ch.className = 'od-chev';
      ch.setAttribute('aria-hidden', 'true');
      el.appendChild(ch);
    }
    el.hidden = false;
    el.onclick = open ? function(){ openBoard(m); } : null;
    el.disabled = !open;
  };

  el.hidden = true;
  (submitP || Promise.resolve(null)).then(function(){
    return B.ranks(m, score);
  }).then(function(r){
    if (!run || run.phase !== R.PHASES.OVER) return;   // they moved on
    if (r.place === null || r.total === null) {
      /* NOT REACHABLE IS NOT NOBODY. A board that cannot be asked and a board
         with nothing on it are two different sentences, and printing the
         second for the first is how a feature teaches somebody it is broken. */
      draw('-', 'Leaderboard not reachable',
        B.needsMigration
          ? 'The board is not set up on this site yet.'
          : 'Your run is saved. The board is offline right now.', false);
      return;
    }
    /* A SUBMIT THAT FAILED IS SAID, not placed. The board answered, so the
       run would get a place and a field and look filed when it is not: that
       is the one lie this card can tell, and it was the hardest thing about
       the board to diagnose. The server's own reason goes under it. */
    if (run.submitted && !run.boardId && submitP) {
      draw('-', 'This run did not reach the board',
        B.lastError && B.lastError.where === 'submit'
          ? 'The board refused it: ' + String(B.lastError.message || '').slice(0, 120)
          : 'The board did not answer. Your run is saved here.', true);
      return;
    }
    /* EVERY RUN IS ON THE BOARD NOW, a guest's as Guest, so the field is the
       board's own count, plus this run for the moment its row has not landed. */
    var st = A.state();
    var named = !!(st && st.signedIn);
    var field = Math.max(r.total + (run.boardId ? 0 : 1), r.place);
    var at = r.place + ordinalOf(r.place);
    if (field === 1) {
      draw('1st', 'First on ' + boardPhrase(m),
        named ? 'First finished run on this board. The top spot is yours.'
          : 'First run on this board. Sign in to put your name on it.', true);
      return;
    }
    draw(at, at + ' of ' + field + ' on ' + boardPhrase(m),
      named ? 'Tap to see the board.' : 'On the board as Guest. Sign in to put your name on it.', true);
  });
}

function ordinalOf(n){ return getOrdinal(n); }

/* ── THE SCREEN ────────────────────────────────────────────────────────────
 *
 * Run The Diamond's leaderboard, and one screen for every mode. The four draft
 * boards are rtf_runs and the three other modes are rtf_plays, so a tab knows
 * which table it reads and modes-ui.js says what one of its rows looks like.
 */
var BOARD_TABS = [
  { k: 'career', label: 'Career', kind: 'career' },
  { k: 'league', label: 'Classic', kind: 'run' },
  { k: 'daily', label: 'Daily Draft', kind: 'run' },
  { k: 'club', label: 'One Franchise', kind: 'run' },
  { k: 'era', label: 'Decades', kind: 'run' },
  { k: 'conquest', label: 'Conquest', kind: 'play' },
  { k: 'fix', label: 'Fix History', kind: 'play' },
  { k: 'passes', label: 'Six Passes', kind: 'play' },
];
var PLAY_DOORS = { conquest: 1, fix: 1, passes: 1 };
/* A DAY BOARD HAS A DAY, and its window is today or yesterday. Everything
   else is a running board, windowed by when a row was filed. */
var DAY_DOORS = { daily: 1, fix: 1, passes: 1 };
var RUN_WINS = [{ k: 'day', label: 'Today' }, { k: 'week', label: 'This week' }, { k: 'all', label: 'All time' }];
var DAY_WINS = [{ k: 'today', label: 'Today' }, { k: 'yesterday', label: 'Yesterday' }];
var BOARD_AXES = [{ k: 'run', label: 'Best run' }, { k: 'record', label: 'Record' }, { k: 'rating', label: 'Rating' }];
/* THE CAREER BOARD is rtf_careers (130) and orders three ways: the legacy
   score the Hall card prints, career points, and rings. Its own axis, so
   moving between it and a draft board keeps each where it was left. */
var CAREER_AXES = [{ k: 'legacy', label: 'Legacy' }, { k: 'pts', label: 'Points' }, { k: 'rings', label: 'Rings' }];
var lbCareerAxis = 'legacy';
var BOARD_PAGE = 100;
var lbWin = 'all', lbAsc = false, lbFrom = 's-home';
var BD_SORT_ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>';
var BD_CARET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
var BD_TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11"/><path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11"/><path d="M12 14v3"/><path d="M8.5 20h7"/></svg>';
var BD_FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1.2 2.5 2.5 2.5-1-2.5-.7-5 0-7.5z"/></svg>';

function isPlayDoor(d){ return !!PLAY_DOORS[d]; }

/* The instant an Eastern calendar day starts, as ISO. Asks the zone for its
   offset at noon that day rather than assuming one, so a clock change is
   right. Run The Diamond's, for the same reason: the day rolls where the
   daily's does. */
function easternStart(iso){
  var noon = Date.parse(iso + 'T12:00:00Z');
  var h = 12;
  try {
    h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
      hour: '2-digit', hourCycle: 'h23' }).format(new Date(noon));
  } catch (e) {}
  return new Date(Date.parse(iso + 'T00:00:00Z') + (12 - h) * 3600e3).toISOString();
}
function boardSince(win){
  if (win !== 'day' && win !== 'week') return null;
  var today = easternISO();
  if (win === 'day') return easternStart(today);
  var d = new Date(Date.parse(today + 'T12:00:00Z'));
  var back = (d.getUTCDay() + 6) % 7;
  return easternStart(new Date(d.getTime() - back * 864e5).toISOString().slice(0, 10));
}

function openBoard(mode, from){
  var m = mode || (run && run.phase === R.PHASES.OVER ? modeOfRun(run) : null)
    || { door: 'league', key: null, day: null };
  if (m.door === 'career' || isPlayDoor(m.door)) lbMode = { door: m.door, key: null, day: null };
  else lbMode = B.modeOf ? B.modeOf(m) : m;
  /* A day board opens on the day asked for (the run's own, from a results
     screen) and otherwise on today. */
  if (DAY_DOORS[lbMode.door]) {
    var t = todayNumber();
    lbWin = (lbMode.door === 'daily' && lbMode.day && lbMode.day === t - 1) ? 'yesterday' : 'today';
  } else lbWin = 'all';
  lbAsc = false;
  var active = document.querySelector('.screen.active');
  lbFrom = from || (active && active.id !== 's-board' ? active.id : 's-home');
  show('s-board');
  paintBoard();
}
function closeBoard(){
  if (lbFrom === 's-home' || !$(lbFrom)) { show('s-home'); renderHome(); return; }
  show(lbFrom);
  if (lbFrom === 's-over') renderAppBar('s-over');
}

/* The lock select, rebuilt from the DATA rather than written into the markup,
   for the reason the club picker already is: a row here can never offer a
   franchise or a decade the wheel cannot actually draw. All of them is the
   first option and the default. */
function renderBoardLock(){
  var wrap = $('bd-lockwrap'), sel = $('bd-lock');
  var locked = lbMode.door === 'club' || lbMode.door === 'era';
  wrap.hidden = !locked;
  if (!locked) return;
  sel.textContent = '';
  var add = function(v, label){
    var o = document.createElement('option');
    o.value = v; o.textContent = label;
    sel.appendChild(o);
  };
  if (lbMode.door === 'club') {
    add('', 'Every team');
    /* E.franchises() answers ROWS and not codes, already sorted by name. */
    (DATA ? E.franchises() : []).forEach(function(f){ add(f.code, f.full); });
  } else {
    add('', 'Every decade');
    Object.keys(E.ERAS).forEach(function(k){
      var sp = R.eraSeasons(k);
      add(k, (ERA_NAMES[k] || k)
        + (sp.length ? ' (' + sp[sp.length - 1] + '-' + sp[0] + ')' : ''));
    });
  }
  sel.value = lbMode.key || '';
}

function segHtml(list, on, attr){
  return list.map(function(w){
    return '<button type="button" role="tab" class="' + (w.k === on ? 'on' : '') + '" aria-selected="'
      + (w.k === on) + '" data-' + attr + '="' + w.k + '">' + esc(w.label) + '</button>';
  }).join('');
}

/* WHICH ROWS ARE THIS PLAYER'S: the run this browser just filed, and, signed
   in, every row the account filed on any device. */
function boardMineOf(door){
  var st = A.state ? A.state() : null;
  var uid = st && st.signedIn ? st.userId : null;
  var ids = {};
  if (door === 'career') {
    var CU = window.RTF_CAREER_UI;
    if (CU && CU.boardIds) ids = CU.boardIds() || {};
  } else if (isPlayDoor(door)) {
    var U = window.RTF_MODES_UI;
    if (U && U.board) ids = U.board.mine(door) || {};
  } else if (lbMine) ids[lbMine] = 1;
  return function(r){ return !!(ids[r.id] || (uid && r.user_id === uid)); };
}

/* THE FIVE, rebuilt from a row's picks against this browser's own copy of the
   league, with no request. A pick the local data cannot name says so rather
   than being skipped, because a roster of four reads as a rendering fault. */
function boardFiveHtml(row){
  var picks = Array.isArray(row.picks) ? row.picks : [];
  if (!picks.length) return '<p class="bd-team-foot">This run has no roster on file.</p>';
  var slots = Array.isArray(row.slots) ? row.slots : [];
  var h = '<ul class="bd-five">' + picks.map(function(k, i){
    var pl = DATA && DATA.allPlayers ? DATA.allPlayers[k] : null;
    return '<li><span class="ps">' + esc(slots[i] || (pl && pl.pp) || '') + '</span><span class="pn">'
      + (pl ? esc(pl.n) + ' <i>' + esc(pl.s + ' ' + E.teamName(pl.t)) + '</i>'
        : 'Season not in this version of the game') + '</span></li>';
  }).join('') + '</ul>';
  var foot = [];
  if (row.spend_musd != null) foot.push('$' + Number(row.spend_musd).toFixed(0) + 'M spent');
  if (row.chemistry) foot.push('Chemistry ' + (row.chemistry > 0 ? '+' : '') + Number(row.chemistry).toFixed(1));
  if (row.point_diff != null) foot.push((row.point_diff > 0 ? '+' : '') + Number(row.point_diff).toFixed(1) + ' a night');
  if (row.all_time_rank) foot.push('#' + row.all_time_rank + ' vs real NBA teams');
  if (foot.length) h += '<p class="bd-team-foot">' + foot.join(' · ') + '</p>';
  return h;
}

/* WHAT A DRAFT ROW SAYS. How far it went first, because that is what Best run
   orders on and the reason the row above yours is above you, then the system,
   then the club or the decade when the board is all of them. */
function boardRunBits(r){
  var bits = [];
  var d = r.depth == null ? null : Number(r.depth);
  if (r.is_goat) bits.push('<span class="bd-tag rec">' + BD_FLAME + 'Record</span>');
  if (r.title_won) bits.push('<span class="bd-tag">' + BD_TROPHY + 'Champions</span>');
  else if (d !== null && DEPTH_WORDS[d]) bits.push(esc(DEPTH_WORDS[d]));
  else if (r.seed_label) bits.push(esc(r.seed_label));
  if (r.lock_key && !lbMode.key) {
    if (r.run_mode === 'club') bits.push(esc(E.teamName(r.lock_key)));
    if (r.run_mode === 'era') bits.push(esc(ERA_NAMES[r.lock_key] || r.lock_key));
  }
  if (r.archetype) bits.push(esc(r.archetype));
  var rating = lbAxis === 'rating';
  return {
    value: rating ? (r.rating == null ? '-' : Number(r.rating).toFixed(0)) : r.wins + '-' + r.losses,
    unit: rating ? 'rating' : 'record',
    meta: bits.join(' · '),
    champ: !!r.title_won, record: !!r.is_goat,
    more: function(){ return boardFiveHtml(r); },
  };
}

/* WHAT A CAREER ROW SAYS: the player, the Hall's verdict on him, and his
   years. The verdict is read off the career engine's own ladder, so the board
   and the Hall card can never call one career two things. A ring makes the
   row gold and the inner circle makes it move. */
function boardCareerBits(r){
  var CE = window.RTF_CAREER;
  var score = Number(r.score) || 0;
  var verdict = CE && CE.verdictOf ? CE.verdictOf(score) : '';
  var bits = [];
  if (r.player) bits.push(esc(r.player));
  if (verdict) bits.push(esc(verdict));
  if (r.first_year && r.last_year) bits.push(r.first_year + '-' + r.last_year);
  var ax = lbCareerAxis, rings = Number(r.rings) || 0;
  return {
    value: ax === 'pts' ? Number(r.pts || 0).toLocaleString('en-US') : ax === 'rings' ? String(rings) : String(score),
    unit: ax === 'pts' ? 'points' : ax === 'rings' ? (rings === 1 ? 'ring' : 'rings') : 'legacy',
    meta: bits.join(' · '),
    champ: rings > 0, record: score >= 120,
    more: function(){ return boardCareerHtml(r); },
  };
}
function boardCareerHtml(r){
  var gp = Math.max(1, Number(r.gp) || 0);
  var per = function(n){ return (Number(n || 0) / gp).toFixed(1); };
  var line = function(k, v){ return '<li><span class="ps">' + k + '</span><span class="pn">' + v + '</span></li>'; };
  var aw = [];
  var add = function(n, one, many){ n = Number(n) || 0; if (n) aw.push(n === 1 ? one : n + 'x ' + many); };
  add(r.mvp, 'MVP', 'MVP'); add(r.fmvp, 'Finals MVP', 'Finals MVP'); add(r.an1, 'All-NBA First Team', 'All-NBA First Team');
  add(r.star, 'All-Star', 'All-Star'); add(r.dpoy, 'Defensive Player of the Year', 'DPOY');
  add(r.roy, 'Rookie of the Year', 'Rookie of the Year'); add(r.olympic, 'Olympic gold', 'Olympic gold');
  add(r.ncaa, 'National champion', 'national champion'); add(r.npoy, 'National Player of the Year', 'National Player of the Year');
  var clubs = (Array.isArray(r.clubs) ? r.clubs : []).map(function(c){ return esc(E.teamName(c)); });
  var h = '<ul class="bd-five">'
    + line('Pos', esc(r.pos || '') + (r.num != null ? ' · #' + esc(String(r.num)) : ''))
    + line('Line', Number(r.pts || 0).toLocaleString('en-US') + ' points · ' + per(r.pts) + ' / ' + per(r.reb) + ' / ' + per(r.ast))
    + line('Years', r.seasons + (Number(r.seasons) === 1 ? ' season' : ' seasons') + (r.peak ? ' · best ' + Number(r.peak).toFixed(1) + ' a night' : ''))
    + (clubs.length ? line('Clubs', clubs.join(', ')) : '')
    + line('Draft', (Number(r.pick) ? 'Pick ' + r.pick : 'Undrafted') + (r.college ? ' out of ' + esc(r.college) : r.road ? ' out of high school' : ''))
    + (aw.length ? line('Hon', aw.join(', ')) : '')
    + '</ul>';
  var foot = [];
  if (Number(r.rings)) foot.push(r.rings + (Number(r.rings) === 1 ? ' ring' : ' rings'));
  if (r.jersey) foot.push('Number retired by the ' + esc(E.teamName(r.jersey)));
  foot.push('Legacy ' + Number(r.score || 0));
  return h + '<p class="bd-team-foot">' + foot.join(' · ') + '</p>';
}

/* THE JERSEYS, asked for after the list is drawn, so a slow answer never
   holds the board up. A row filed by an account wears the house jersey until
   its own arrives; a guest's is the same jersey, greyed. */
function paintBoardJerseys(list, rows){
  var uids = {};
  rows.forEach(function(r){ if (r.user_id) uids[r.user_id] = 1; });
  if (!B.jerseys || !Object.keys(uids).length) return;
  B.jerseys(Object.keys(uids)).then(function(map){
    if (!map || !list.isConnected) return;
    /* THE PLAYER, WHERE THERE IS ONE (140): his head and shoulders in his
       street look, in a ring the colour of his Floor Rep, and a tap opens his
       card. A row with no player keeps the jersey. Painted a few a frame, so
       a long board never holds the page up while a hundred men are traced. */
    var q = [];
    list.querySelectorAll('.bd-crest[data-uid]').forEach(function(el){
      var p = map[el.getAttribute('data-uid')];
      if (!p) return;
      var num = /^\d{1,2}$/.test(String(p.jersey_num || '')) ? p.jersey_num : '';
      el.innerHTML = jerseySvg(p.jersey_club || 'house', num);
      if (p.player && window.RTF_CARD) q.push([el, p]);
    });
    (function next(){
      if (!q.length || !list.isConnected) return;
      q.splice(0, 3).forEach(function(x){
        var el = x[0], p = x[1], h = '';
        try { h = window.RTF_CARD.bust(p); } catch (e) { h = ''; }
        if (!h) return;
        el.innerHTML = h;
        el.classList.add('has-player');
        el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', 'Open this player card');
        var go = function(e){ e.stopPropagation(); e.preventDefault(); window.RTF_CARD.openFor(p, el.getAttribute('data-name') || ''); };
        el.addEventListener('click', go);
        el.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') go(e); });
      });
      (window.requestAnimationFrame || setTimeout)(next);
    })();
  });
}

/* THE FOUR STATES, and each gets its own sentence. A blank box is how a
   feature teaches somebody it is broken, and a spinner that never resolves is
   worse. On a game this new "nobody yet" is the COMMON case, so it says being
   first is the prize rather than apologising for an empty list. */
function paintBoard(){
  var list = $('bd-list');
  if (!list) return;
  var seq = ++lbSeq;
  var door = lbMode.door, play = isPlayDoor(door), dayDoor = !!DAY_DOORS[door], career = door === 'career';

  var tabs = $('bd-tabs');
  tabs.innerHTML = BOARD_TABS.map(function(t){
    return '<button type="button" role="tab" class="bd-tab' + (t.k === door ? ' on' : '') + '" aria-selected="'
      + (t.k === door) + '" data-k="' + t.k + '">' + esc(t.label) + '</button>';
  }).join('');
  tabs.querySelectorAll('.bd-tab').forEach(function(b){
    b.onclick = function(){
      var k = b.getAttribute('data-k');
      openBoard(isPlayDoor(k) || k === 'career' ? { door: k } : k === 'daily'
        ? { door: 'daily', day: todayNumber() } : { door: k, key: null }, lbFrom);
    };
  });
  var onTab = tabs.querySelector('.bd-tab.on');
  if (onTab && onTab.scrollIntoView) onTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  renderBoardLock();
  var axes = $('bd-axes');
  axes.hidden = play;
  axes.innerHTML = career ? segHtml(CAREER_AXES, lbCareerAxis, 'ax') : segHtml(BOARD_AXES, lbAxis, 'ax');
  axes.querySelectorAll('button').forEach(function(b){
    b.onclick = function(){
      if (career) lbCareerAxis = b.getAttribute('data-ax'); else lbAxis = b.getAttribute('data-ax');
      paintBoard();
    };
  });
  var wins = $('bd-wins');
  wins.innerHTML = segHtml(dayDoor ? DAY_WINS : RUN_WINS, lbWin, 'w');
  wins.querySelectorAll('button').forEach(function(b){
    b.onclick = function(){
      lbWin = b.getAttribute('data-w');
      if (door === 'daily') lbMode.day = todayNumber() - (lbWin === 'yesterday' ? 1 : 0);
      paintBoard();
    };
  });
  var sortB = $('bd-sort');
  sortB.classList.toggle('asc', lbAsc);
  sortB.innerHTML = BD_SORT_ICO + (lbAsc ? 'Low to high' : 'High to low');
  sortB.onclick = function(){ lbAsc = !lbAsc; paintBoard(); };

  var U = window.RTF_MODES_UI;
  var day = dayDoor ? todayNumber() - (lbWin === 'yesterday' ? 1 : 0) : null;
  if (door === 'daily') lbMode.day = day;
  $('bd-h').textContent = 'Who is on top';
  var more = $('bd-more'), count = $('bd-count'), foot = $('bd-foot');
  list.innerHTML = '<div class="bd-empty">Loading...</div>';
  more.hidden = true; count.textContent = ''; foot.textContent = '';

  var since = dayDoor ? null : boardSince(lbWin);
  var mode = play || career ? null : { door: door, key: lbMode.key, day: lbMode.day };
  var mine = boardMineOf(door);
  var rows = [], total = null;
  var page = function(){
    if (career) return B.careerList ? B.careerList({ sort: lbCareerAxis, asc: lbAsc, since: since, offset: rows.length, limit: BOARD_PAGE }) : Promise.resolve(null);
    return play
      ? (B.playList ? B.playList({ mode: door, day: day, since: since, asc: lbAsc, offset: rows.length, limit: BOARD_PAGE }) : Promise.resolve(null))
      : (B.list ? B.list({ mode: mode, sort: lbAxis, asc: lbAsc, since: since, offset: rows.length, limit: BOARD_PAGE }) : Promise.resolve(null));
  };
  var counted = career ? (B.careerCount ? B.careerCount(since) : Promise.resolve(null)) : play
    ? (B.playCount ? B.playCount(door, day, '', since) : Promise.resolve(null))
    : B.total(mode, false, since, lbAxis);
  var stale = function(){ return seq !== lbSeq; };
  var noun = career ? ['career', 'careers'] : play ? (door === 'conquest' ? ['run', 'runs'] : ['entry', 'entries']) : ['run', 'runs'];

  var rowHtml = function(r, i){
    var rank = lbAsc ? (total != null ? total - i : null) : i + 1;
    var b = career ? boardCareerBits(r) : play ? (U && U.board ? U.board.bits(r) : { value: String(r.score), unit: '', meta: '' }) : boardRunBits(r);
    var meta = b.meta || '';
    if (play && b.champ && b.tag) meta = '<span class="bd-tag">' + BD_TROPHY + esc(b.tag) + '</span>' + (meta ? ' · ' + meta : '');
    var cls = 'bd-ent' + (rank != null && rank <= 3 ? ' top3' : '') + (b.champ ? ' champ' : '') + (b.record ? ' record' : '');
    var crest = r.user_id
      ? '<span class="bd-crest" data-uid="' + esc(r.user_id) + '" data-name="' + esc(r.display_name || '') + '">' + jerseySvg('house', '') + '</span>'
      : '<span class="bd-crest guest">' + jerseySvg('house', '') + '</span>';
    return '<div class="' + cls + '" data-i="' + i + '">'
      + '<button type="button" class="bd-row' + (mine(r) ? ' me' : '') + '" aria-expanded="false">'
      + '<span class="bd-pos">' + (rank == null ? '' : rank.toLocaleString()) + '</span>' + crest
      + '<span class="bd-who"><span class="bd-name">' + esc(r.display_name || 'Guest') + '</span>'
      + '<span class="bd-meta">' + meta + '</span></span>'
      + '<span class="bd-rec"><b>' + esc(b.value) + '</b><span>' + esc(b.unit || '') + '</span></span>'
      + '<span class="bd-caret">' + BD_CARET + '</span></button>'
      + '<div class="bd-team" hidden></div></div>';
  };
  var wire = function(ents){
    ents.forEach(function(ent){
      var btn = ent.querySelector('.bd-row'), team = ent.querySelector('.bd-team');
      btn.onclick = function(){
        var open = !ent.classList.contains('open');
        if (open && !team.getAttribute('data-built')) {
          var r = rows[+ent.getAttribute('data-i')];
          var bits = career ? boardCareerBits(r) : play ? (U && U.board ? U.board.bits(r) : null) : boardRunBits(r);
          team.innerHTML = bits && bits.more ? bits.more() : '';
          team.setAttribute('data-built', '1');
        }
        ent.classList.toggle('open', open);
        team.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      };
    });
  };
  var paintMore = function(){
    var left = total != null ? total - rows.length : null;
    var full = rows.length > 0 && rows.length % BOARD_PAGE === 0;
    more.hidden = !(left != null ? left > 0 : full);
    more.textContent = left != null ? 'Show ' + Math.min(BOARD_PAGE, left) + ' more' : 'Show more';
  };

  Promise.all([page(), counted]).then(function(res){
    /* A SLOWER REQUEST MUST NOT PAINT OVER A FASTER ONE. Two taps a half
       second apart is two lists in flight, and the first asked for can be the
       last to land. */
    if (stale()) return;
    var got = res[0];
    total = res[1];
    if (got === null) {
      list.innerHTML = '<div class="bd-empty bad">' + (B.needsMigration
        ? 'The leaderboard is not set up on this site yet.'
        : career ? 'Leaderboard not reachable right now. Your careers still count here.'
        : 'Leaderboard not reachable right now. Your runs still count here.') + '</div>';
      foot.textContent = B.lastError ? B.lastError.where + ': ' + B.lastError.message : '';
      return;
    }
    if (!got.length) {
      list.innerHTML = '<div class="bd-empty first">' + (career
        ? (lbWin === 'day' ? 'Nobody has finished a career today. Be first.'
          : lbWin === 'week' ? 'Nobody has finished a career this week. Be first.'
          : 'No careers on this board yet. Retire one and you are first.')
        : dayDoor
        ? (lbWin === 'yesterday' ? 'Nobody finished yesterday\'s board.' : 'Nobody has finished today\'s board yet. Be first.')
        : lbWin === 'day' ? 'Nobody has finished a run here today. Be first.'
        : lbWin === 'week' ? 'Nobody has finished a run here this week. Be first.'
        : 'No runs on this board yet. Finish one and you are first.') + '</div>';
      return;
    }
    if (total != null) count.textContent = total.toLocaleString() + ' ' + (total === 1 ? noun[0] : noun[1])
      + (dayDoor ? ' · Day ' + day : '');
    rows.push.apply(rows, got);
    list.innerHTML = got.map(function(r, i){ return rowHtml(r, i); }).join('');
    wire([].slice.call(list.querySelectorAll('.bd-ent')));
    paintMore();
    paintBoardJerseys(list, rows);
    foot.textContent = career
      ? 'Sign in and your name goes on every career you finish. A career finished signed out shows as Guest.'
      : 'Sign in and your name goes on every run you finish. A run finished signed out shows as Guest.';
    var me = list.querySelector('.bd-row.me');
    if (me && lbFrom === 's-over') requestAnimationFrame(function(){ me.scrollIntoView({ block: 'center' }); });
  });
  more.onclick = function(){
    more.disabled = true; more.textContent = 'Loading...';
    page().then(function(got){
      more.disabled = false;
      if (stale()) return;
      if (got == null) { paintMore(); more.textContent = 'Could not load more. Try again'; return; }
      if (!got.length) { more.hidden = true; return; }
      var from = rows.length;
      rows.push.apply(rows, got);
      var holder = document.createElement('div');
      holder.innerHTML = got.map(function(r, j){ return rowHtml(r, from + j); }).join('');
      var ents = [].slice.call(holder.children);
      ents.forEach(function(e){ list.appendChild(e); });
      wire(ents);
      paintMore();
      paintBoardJerseys(list, rows);
    });
  };
}

/* WHAT THIS RUN EARNED, off run.earned, which recordRun worked out at the
   moment the run was filed. Nothing is recomputed here on purpose: asked now
   the answer is always "nothing new", because the career already holds every
   one of them. See the note over recordRun.
 *
 * A run that earned nothing hides the card outright. Most runs earn nothing
 * once a career is a few weeks old, and a heading over an empty box is worse
 * than no heading. */
function renderEarned(){
  var card = $('o-earnedcard'), list = $('o-earned'), sub = $('o-earnedsub');
  if (!card || !list) return;
  var got = (run && run.earned) || { fresh: [], bests: [] };
  var bests = got.bests || [];
  /* A GUEST IS TOLD WHAT THE RUN WOULD HAVE LIT, NOT HANDED IT. The badges
     are real (they are derived from the career, which the account adopts on
     sign in), so the count is true, and the row is the one way to collect
     them. The career bests are the record and stay for everybody. */
  var member = badgesOn();
  var fresh = member ? (got.fresh || []) : [];
  var waiting = member ? 0 : (got.fresh || []).length;
  list.textContent = '';
  if (!fresh.length && !bests.length && !waiting) { card.hidden = true; return; }
  card.hidden = false;
  sub.textContent = fresh.length
    ? fresh.length + (fresh.length === 1 ? ' new badge' : ' new badges')
    : '';

  var row = function(metal, mark, title, why){
    var el = document.createElement('div');
    el.className = 'ern ' + metal;
    var m = document.createElement('span');
    m.className = 'em';
    if (mark === 'ball') {
      m.className = 'em ball';
      m.innerHTML = badgeBall(metal, 15);
    } else {
      m.textContent = mark;
    }
    /* The mark is decoration on top of the words beside it, so it is taken
       out of the accessibility tree rather than read out as a stray letter
       before every row. */
    m.setAttribute('aria-hidden', 'true');
    var t = document.createElement('span');
    t.className = 'et';
    var b = document.createElement('b');
    b.textContent = title;
    t.appendChild(b);
    if (why) {
      var s = document.createElement('span');
      s.textContent = why;
      t.appendChild(s);
    }
    el.appendChild(m);
    el.appendChild(t);
    list.appendChild(el);
    return t;
  };

  /* THE MARKS COME FIRST. A career best is about the run on the screen; a
     badge is about the career the run went into, and the run is what somebody
     is reading. */
  for (var i = 0; i < bests.length; i++) {
    var mk = bests[i];
    row(mk.kind === 'ring' ? 'ring' : (mk.kind === 'streak' ? 'streak' : 'gold'),
      mk.kind === 'ring' ? '●' : (mk.kind === 'streak' ? '▲' : '★'),
      mk.text, '');
  }
  for (var j = 0; j < fresh.length; j++) {
    row(fresh[j].tier || 'bronze', 'ball', fresh[j].name, fresh[j].why);
  }
  if (waiting) {
    var gt = row('bronze', 'ball', 'Sign in to collect badges',
      'This run lit ' + waiting + (waiting === 1 ? ' badge' : ' badges')
      + '. Sign in and ' + (waiting === 1 ? "it's" : "they're") + ' yours.');
    gt.parentNode.className += ' ern-guest';
    var gb = document.createElement('button');
    gb.id = 'b-earned-signin';
    gb.textContent = 'Sign in';
    gb.onclick = badgeSignIn;
    gt.appendChild(gb);
  }

  /* SAID OUT LOUD, ONCE, and only for the badges. The record and the verdict
     are already announced by renderOver, and a live region that reads four
     things in a row is one somebody turns off. */
  if (fresh.length) {
    say(fresh.length === 1
      ? 'New badge: ' + fresh[0].name
      : fresh.length + ' new badges, including ' + fresh[0].name);
  }
}

/* THE OTHER DOORS, under the results. Whichever mode this run was is left
   out, because Run it back is already that button. A door is built rather
   than shown-and-hidden for the same reason the rest of this page does it:
   the list depends on what was just played, so there is no fixed markup that
   would be right for every run. */
function renderOverDoors(){
  var card = $('o-doorscard'), list = $('o-doors');
  if (!card || !list) return;
  list.textContent = '';

  var door = function(title, why, gold, go){
    var b = document.createElement('button');
    b.className = 'odoor' + (gold ? ' gold' : '');
    var t = document.createElement('span');
    t.className = 'od-t';
    var n = document.createElement('b');
    n.textContent = title;
    var s = document.createElement('span');
    s.textContent = why;
    t.appendChild(n); t.appendChild(s);
    var ch = document.createElement('span');
    ch.className = 'od-chev';
    ch.setAttribute('aria-hidden', 'true');
    b.appendChild(t); b.appendChild(ch);
    b.onclick = go;
    list.appendChild(b);
  };

  /* TODAY'S RUN IS OFFERED ONLY WHILE IT IS STILL THERE. A door that starts
     a run and is then refused by startRun's own guard is the wall the rest of
     this file keeps taking down. Once it is played, the row says so and
     shares it, which is where that tap was going anyway. */
  /* THE OTHER THREE GAMES FIRST, because a finished draft is the moment
     somebody is choosing what to play next, and a list of more drafts is the
     one answer that never shows them there is anything else. Asked of
     modes-ui.js, which knows whether today's two dailies are done. */
  var MU = window.RTF_MODES_UI;
  if (MU && MU.doors) {
    MU.doors().forEach(function(d){ door(d.title, d.why, d.gold, d.go); });
  }
  if (dailyDone()) {
    var d = dailyState();
    if (!run.daily) {
      door('Day ' + d.day + ' is done · ' + d.label, 'Send it to a friend.', true, shareDaily);
    }
  } else {
    door('Daily Draft', 'Same ' + NUMWORD(E.SLOTS.length)
      + ' spins for everyone today.', false,
      function(){ startRun(null, null, true); });
  }

  if (run.club || run.era || run.daily) {
    door('The league', 'Every season. Every team. ' + NUMWORD(E.SLOTS.length, true)
      + ' spins.', false,
      function(){ startRun(); });
  }
  if (!run.club) {
    var last = lastClub();
    door(last ? 'One Franchise · ' + E.teamName(last) : 'One Franchise',
      last ? E.team(last).full + '. Only the year spins.'
           : 'Pick a team. Only the year spins.',
      false, last ? function(){ startRun(last); } : openClubs);
  }
  if (!run.era) {
    var le = lastEra();
    door(le ? (ERA_NAMES[le] || le) : 'Decades',
      le ? NUMWORD(E.SLOTS.length, true) + ' from one decade.'
         : 'One decade. Every team. ' + NUMWORD(E.SLOTS.length, true)
           + ' from one era.',
      false, le ? function(){ startRun(null, le); } : openEras);
  }
}

/* The run's best individual night, and the way into every box score behind
   it. Hidden rather than empty when there is nothing to name, which for a
   finished run there always is: it is the one card on this screen that could
   legitimately have no content, and an empty bordered box reads as something
   that failed to load. */
function renderBestNight(){
  var el = $('o-night');
  if (!el) return;
  var b = null;
  try { b = R.bestNight(run); } catch (e) { b = null; }
  if (!b) { el.hidden = true; return; }

  el.textContent = '';
  var p = document.createElement('span');
  p.className = 'bn-p';
  p.textContent = String(b.pts);
  var t = document.createElement('span');
  t.className = 'bn-t';
  var w = document.createElement('span');
  w.className = 'bn-w';
  w.textContent = 'Best night';
  var m = document.createElement('span');
  m.className = 'bn-m';
  /* The full name here, not the box score's initial: this is a sentence
     rather than a row of figures, and it has the room. */
  m.textContent = b.n + ', ' + b.pts + ' points';
  var sub = document.createElement('span');
  sub.className = 'bn-s';
  sub.textContent = b.reb + ' reb · ' + b.ast + ' ast · ' + b.where;
  t.appendChild(w); t.appendChild(m); t.appendChild(sub);
  var go = document.createElement('span');
  go.className = 'bn-go';
  el.appendChild(p); el.appendChild(t); el.appendChild(go);
  el.hidden = false;
  el.onclick = function(){ openGame(b.ref); };
}

/* ── HOW CLOSE IT WAS ──────────────────────────────────────────────────────
 *
 * A season that missed by two games and one that missed by twenty read the same
 * on a scoreboard, and this game gives out a lot of near misses on purpose. "You
 * were three wins short" is the sentence that makes somebody press the button
 * again; "Missed the playoffs" is the sentence that makes them close the tab.
 */
function renderGauge(out){
  var box = $('o-gauge');
  if (!box) return;
  box.hidden = false;
  var wins = out.wins;
  var playIn = E.CONSTANTS.PLAY_IN_WINS, seed = E.CONSTANTS.TOP_SIX_WINS;
  var big, cls, pct, line, unit = '';

  if (out.titleWon) {
    big = 'RING'; cls = 'pgood'; pct = 100;
    line = wins + '-' + out.losses + ' and a ring. Only the record is left to chase.';
  } else if (run.playoffs && run.playoffs.rounds.length) {
    var last = run.playoffs.rounds[run.playoffs.rounds.length - 1];
    big = String(last.yourWins) + '-' + last.oppWins; cls = 'pmid';
    unit = 'last series';
    pct = Math.round(100 * last.yourWins / Math.max(1, last.yourWins + last.oppWins));
    /* The round is the headline right above this, so the line is the verdict
       on the series and never the round's name a second time. */
    line = last.yourWins >= 3 ? 'One more win and you were still playing.'
      : 'Ran into a better team.';
  } else {
    var short = playIn - wins;
    big = short <= 0 ? '0' : String(short);
    cls = wins >= playIn - 6 ? 'pmid' : 'pbad';
    unit = short === 1 ? 'win short' : 'wins short';
    pct = Math.round(100 * wins / playIn);
    /* `out.spendLeft` IS NOT A FIELD AND NEVER WAS. outcomeOf does not set it,
       so `undefined > 15` was false on every run this game has ever played and
       the cap advice, which is the central lesson of the whole thing, has
       never once appeared: a draft that finished $88M under was told its
       roster had no shape. Nothing threw. R.remaining(run) is the real number
       and the run is still in scope here.
       $15M is measured rather than chosen, and the separation is total.
       Over 120 drafts a side: a bot that spends the cap leaves a median
       $0.8M and a p90 of $5.1M, and a bot drafting on value alone leaves a
       median $88.9M. 0% of the first group clears $15M and 100% of the
       second does. It also names the size of the mistake, because "cap left
       over" and "$88.5M left over" are different sentences. */
    var spare = R.remaining(run);
    line = short <= 0 ? 'Enough wins. Lost the tiebreak.'
      : spare > 15
        ? 'You left ' + money(spare) + ' on the table. Unused cap never plays.'
        : wins >= playIn - 6
          ? "Talent was there. The fit wasn't."
          : 'Never came together. Draft a fit, not a highlight reel.';
  }
  $('o-gv').textContent = big;
  $('o-gv').className = 'pv ' + cls;
  $('o-gu').textContent = unit;
  $('o-gl').textContent = line + (wins >= seed ? '' : '');
  var bar = $('o-gbar');
  bar.style.width = '0%';
  bar.style.background = cls === 'pgood' ? 'var(--green)'
    : cls === 'pmid' ? 'var(--gold)' : 'var(--red)';
  /* Next frame, so the width transition has something to animate from. */
  requestAnimationFrame(function(){ bar.style.width = Math.max(3, Math.min(100, pct)) + '%'; });
}

/* ── THE SEASON, FOLDED INTO MONTHS ───────────────────────────────────────
 *
 * Eighty-two rows in a scroll box is a data dump. Folded, it is a season: the
 * March you went 12-3 is visible without reading a row, and the row is still
 * there for anybody who wants it. Twelve games a block, which is about a month.
 */
function renderMonths(){
  var box = $('o-months');
  if (!box) return;
  box.textContent = '';
  var PER = 12, blocks = [];
  for (var i = 0; i < run.season.length; i += PER) {
    blocks.push({ from: i, to: Math.min(i + PER, run.season.length) });
  }
  var best = null;
  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b], w = 0, l = 0;
    for (var g = blk.from; g < blk.to; g++) run.season[g].won ? w++ : l++;
    blk.w = w; blk.l = l;
    if (!best || w - l > best.w - best.l) best = blk;

    var d = document.createElement('details');
    d.className = 'month';
    var sum = document.createElement('summary');
    var nm = document.createElement('span');
    nm.className = 'mn';
    nm.textContent = 'Games ' + (blk.from + 1) + ' to ' + blk.to;
    var bar = document.createElement('span');
    bar.className = 'mbar';
    for (var q = blk.from; q < blk.to; q++) {
      var tick = document.createElement('i');
      if (run.season[q].won) tick.className = 'w';
      bar.appendChild(tick);
    }
    var rec = document.createElement('span');
    rec.className = 'mrec';
    rec.textContent = w + '-' + l;
    sum.appendChild(nm); sum.appendChild(bar); sum.appendChild(rec);
    d.appendChild(sum);

    var tbl = document.createElement('table');
    tbl.className = 'season';
    var tb = document.createElement('tbody');
    for (var k = blk.from; k < blk.to; k++) {
      var gm = run.season[k], sc = run.schedule[k] || {};
      var tr = document.createElement('tr');
      var c1 = document.createElement('td');
      c1.textContent = String(gm.game);
      var c2 = document.createElement('td');
      c2.textContent = (sc.home ? 'vs ' : 'at ') + (sc.oppName || 'opponent') + (sc.marquee ? ' *' : '');
      var c3 = document.createElement('td');
      c3.className = gm.won ? 'w' : 'l';
      c3.textContent = gm.won ? 'W' : 'L';
      var c4 = document.createElement('td');
      c4.className = 'sc';
      c4.textContent = gm.yourPoints + '-' + gm.oppPoints + (gm.ot ? ' OT' : '');
      tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4);
      /* EVERY ROW OPENS ITS GAME. The fold already lists all 82 with a score
         on each, so the box score is one tap from where a reader already is
         rather than behind a second screen listing the same games again. */
      tr.className = 'gamerow';
      (function(idx){ tr.onclick = function(){ openGame({ kind: 'season', index: idx }); }; })(k);
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    d.appendChild(tbl);
    box.appendChild(d);
  }
  if (best) {
    /* NAMED BY ITS LENGTH. The story line above counts the best TEN games and
       this counts the best block of twelve, so both called "best stretch" put
       8-2 and 9-3 on one screen as two answers to one question. */
    $('o-monthsub').textContent = 'best block ' + best.w + '-' + best.l
      + ', games ' + (best.from + 1) + ' to ' + best.to;
  }
}

/* ── ONE TRUE SENTENCE ABOUT THE SEASON ────────────────────────────────────
 *
 * A results screen made of numbers is a box score. The football game ends its
 * seasons on words, and this is that: a line under the record that names the
 * most interesting thing that actually happened, chosen from facts the season
 * already knows about itself.
 *
 * EVERY BRANCH BELOW IS A FACT AND NOT A FLOURISH. It says "won 11 straight in
 * the new year" only if there is an eleven game streak in run.season, and the
 * dates come off the schedule. Writing a season a player did not have is worse
 * than printing nothing, so the last branch is deliberately plain.
 */
function seasonStory(out){
  var games = run.season || [];
  if (!games.length) return '';

  // The longest winning and losing runs, and where they started.
  var bestW = { n: 0, at: 0 }, worstL = { n: 0, at: 0 }, w = 0, l = 0;
  for (var i = 0; i < games.length; i++) {
    if (games[i].won) { l = 0; w++; if (w > bestW.n) bestW = { n: w, at: i - w + 1 }; }
    else { w = 0; l++; if (l > worstL.n) worstL = { n: l, at: i - l + 1 }; }
  }

  var marqW = 0, marqL = 0;
  for (var m = 0; m < games.length; m++) {
    var sc = (run.schedule && run.schedule[m]) || {};
    if (!sc.marquee) continue;
    if (games[m].won) marqW++; else marqL++;
  }

  /* Where in the season a run of games sat, in words. 82 games is roughly
     October to April, so a sixth of the way in is November. */
  var when = function(idx){
    var f = idx / games.length;
    return f < 0.17 ? 'out of the gate' : f < 0.34 ? 'before Christmas'
      : f < 0.5 ? 'in the new year' : f < 0.67 ? 'through the trade deadline'
      : f < 0.84 ? 'in March' : 'down the stretch';
  };

  var bits = [];
  if (bestW.n >= 8) bits.push('Won ' + bestW.n + ' straight ' + when(bestW.at) + '.');
  if (worstL.n >= 8) bits.push('Lost ' + worstL.n + ' in a row ' + when(worstL.at) + '.');
  /* MARQUEE NIGHTS ARE HARD ON PURPOSE, so the comparison cannot be .500.
     The marquee slate is drawn at net +5, and measured across 600 seasons the
     whole league wins 37.8% of those games. Comparing against half meant
     "Feasted on the weak" fired on seven runs out of twelve, including 5-13,
     which is a perfectly ordinary marquee record. A line that fires on
     everybody is not characterisation, it is the game calling most of its
     players frauds for finishing where the schedule put them.
     So both branches are measured against the norm, and the middle says
     nothing at all. */
  var marqN = marqW + marqL;
  if (marqN >= 8) {
    var rate = marqW / marqN;
    if (rate >= 0.58) bits.push('Handled the contenders: ' + marqW + '-' + marqL + ' on marquee nights.');
    else if (rate <= 0.20) bits.push("Couldn't beat the contenders: " + marqW + '-' + marqL + ' on marquee nights.');
  }

  /* HOW IT ENDED USED TO BE SAID HERE TOO, AND THE GAUGE OWNS IT NOW.
   *
   * Driven to a real results screen, "3 wins short of the play-in" appeared
   * three times in the top four inches: as the gauge's big number, as the
   * gauge's own sentence, and again here as "Missed the play-in by 3 games".
   * Every playoff exit read the same way, and so did a ring. Two functions
   * written at different times, both reaching for the sentence somebody came
   * to this screen for, with nothing to stop them both getting it.
   *
   * So the split is by SUBJECT rather than by which one ran first. The gauge
   * is how it ENDED, in a number and a line. This is the season's SHAPE: the
   * streaks, the marquee nights, the best run of form. The two never collide
   * because they are never about the same thing.
   */

  /* SOMETHING TRUE IS ALWAYS AVAILABLE. Two runs in twelve came back with an
     empty line: a 36-46 season with no long streak, no marquee extreme and not
     close enough to the play-in to mention it. Nothing was wrong, there was
     just nothing on the list to say. A team's best run of form is a fact every
     season has, so it is the floor rather than a blank. */
  if (!bits.length) {
    var run10 = bestStretch(games, 10);
    if (run10) {
      bits.push('Hottest ten games: ' + run10.w + '-' + run10.l + ' ' + when(run10.at) + '.');
    }
  }

  /* At most two, because three is a paragraph and this is a caption. */
  if (bits.length > 2) bits = bits.slice(0, 2);
  return bits.join(' ');
}

/* The best window of N games in the season, as a record and where it started.
   Every season has one, which is what makes it a safe last resort. */
function bestStretch(games, n){
  if (!games || games.length < n) return null;
  var best = null, won = 0;
  for (var i = 0; i < games.length; i++) {
    if (games[i].won) won++;
    if (i >= n && games[i - n].won) won--;
    if (i >= n - 1 && (!best || won > best.w)) best = { w: won, l: n - won, at: i - n + 1 };
  }
  return best;
}
