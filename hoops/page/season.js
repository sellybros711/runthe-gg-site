// ── the season ─────────────────────────────────────────────────────────────

function toSeason(){
  /* THE RESET COMES BEFORE show(), not after it. Re-entering this screen, which
     a second run and a restored run both do, must not show the last run's strip
     or a play button that has already been pressed. show() also asks the dock
     what this screen's action is, and the dock answers by reading exactly these
     two things: Play enabled, and the sim card that holds Skip hidden. Doing the
     reset afterwards left the dock holding a Skip from the previous season. */
  stopSim();
  $('simcard').style.display = 'none';
  $('b-play').disabled = false;
  $('b-play').style.display = '';
  $('b-play').textContent = 'Play all 82';
  show('s-season');
  paintSeasonCard();

  /* THE FIVE MEN, so the roster is on screen for the season it is playing.
     R.capOf rather than the constant, which is the one that stays true if a
     mode is ever given a cap of its own, and R.remaining already nets off the
     re-spin fees, so this is the money that actually left the budget rather
     than the money that went on players. */
  renderRoster($('p-slots'));
  $('p-spend').textContent = money(R.capOf(run) - R.remaining(run))
    + ' of ' + money(R.capOf(run)) + ' spent';
}

/* The card above the Play button: the ratings, the plan, and Vegas. Its own
   function because choosing a plan redraws exactly this and nothing else. */
function paintSeasonCard(){
  var proj = R.projectSeason(run, 120);
  var tagged = R.taggedRoster(run);
  /* E.rosterRatings, the one sum, with the plan in it: the numbers on this
     card are the numbers the season plays. */
  var rr = E.rosterRatings(tagged, { plan: run.plan });
  var st = rr.structure, ortg = rr.ortg, drtg = rr.drtg;

  $('p-ortg').textContent = ortg.toFixed(1);
  $('p-drtg').textContent = drtg.toFixed(1);
  $('p-rating').textContent = rr.rating.toFixed(0);
  renderPlans(tagged, rr);
  /* "PROJECTED 41-41" OVER A LIVE 45-29 READS AS A BROKEN NUMBER, and this
     card stays on screen through the whole season. It is a projection made
     BEFORE tip-off, which is honest and useful, and the only thing wrong was
     the tense: the reader was being handed two records with nothing saying
     one of them had already been overtaken. */
  /* "a 0% title" is not a phrase anybody says. Odds under one percent are
     said as that, rather than printed as a zero that reads like a verdict. */
  /* SAID THE WAY A PRESEASON SHOW SAYS IT: a win total and a word for the
     odds. The percentage stays beside the word, because "dark horse" is an
     opinion and the number is what it is an opinion about. */
  $('p-proj').textContent = st.archetype.name + ' · Vegas: '
    + proj.typical + ' wins · ' + oddsWord(proj.titlePct) + ', '
    + (proj.titlePct < 1 ? 'under 1%' : proj.titlePct + '%');
  paintSysLine($('p-sys'), st.system);
}

/* THE THREE PLANS, each read off these five men.
 *
 * What a plan is worth is said in WINS for the season, because a rating point
 * is a number nobody feels, and in a word for May, because the playoff edge is
 * what the run plan gives back and the half court plan saves up. A plan nobody
 * has chosen is the coach's pick, marked as such; pressing one makes it yours
 * and it is saved with the run. */
function planWins(tagged, key){
  var base = E.rosterRatings(tagged, { plan: 'balanced' });
  var with_ = E.rosterRatings(tagged, { plan: key });
  var w = function(r){ return 82 * E.teamWinPct(r.ortg, r.drtg); };
  return Math.round(w(with_) - w(base));
}
function renderPlans(tagged, rr){
  var box = $('p-plans');
  if (!box) return;
  var fits = rr.tempo ? rr.tempo.fits : E.paceFits(tagged);
  var chosen = rr.tempo ? rr.tempo.plan : 'balanced';
  var auto = !run.plan;
  box.innerHTML = '';
  E.PLAN_KEYS.forEach(function(key){
    var pl = E.PLANS[key], eff = E.planEffect(key, fits);
    var b = document.createElement('button');
    b.className = 'plan ' + key + (key === chosen ? ' on' : '');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', key === chosen ? 'true' : 'false');
    var fit = key === 'run' ? fits.run : key === 'grind' ? fits.grind : null;
    var dw = planWins(tagged, key);
    var may = eff.poNet >= 0.4 ? 'Built for May' : eff.poNet <= -0.2 ? 'Hurts in May' : 'Same in May';
    b.innerHTML = '<b class="pl-name">' + pl.name + '</b>'
      + '<span class="pl-pace">' + (pl.pace || E.CONSTANTS.LEAGUE_PACE) + ' a night</span>'
      + (fit == null ? '<span class="pl-fit none"></span>'
        : '<span class="pl-fit"><i style="width:' + Math.round(fit * 100) + '%"></i></span>')
      + '<span class="pl-eff">' + (key === 'balanced' ? 'No change'
        : (dw > 0 ? '+' : dw < 0 ? '-' : '') + Math.abs(dw) + (Math.abs(dw) === 1 ? ' win' : ' wins')) + '</span>'
      + '<span class="pl-may">' + (key === 'balanced' ? 'Talent decides' : may) + '</span>'
      + (key === chosen && auto ? '<span class="pl-pick">Coach\'s pick</span>' : '');
    b.onclick = function(){
      run.plan = key;
      save();
      paintSeasonCard();
    };
    box.appendChild(b);
  });
  var why = $('p-plan-why');
  if (why) why.textContent = planWhy(fits, chosen);
}
/* ONE SENTENCE ON WHY, read off the parts that make each fit. A fit is five
   numbers under one bar, and the bar alone cannot tell a player which man to
   draft next time. */
function planWhy(fits, chosen){
  var p = fits.parts || {};
  if (chosen === 'run') {
    var weak = [['pusher', 'a guard who pushes it'], ['hawks', 'hands in the passing lanes'],
      ['glass', 'rebounders to start the break']].sort(function(a, b){ return p[a[0]] - p[b[0]]; })[0];
    return 'Running. ' + (p[weak[0]] < 0.5 ? 'It would run better with ' + weak[1] + '.' : 'This five can really go.');
  }
  if (chosen === 'grind') {
    var gw = [['anchor', 'a rim protector'], ['post', 'a big to play through'],
      ['defense', 'more defense']].sort(function(a, b){ return p[a[0]] - p[b[0]]; })[0];
    return 'Walking it up. ' + (p[gw[0]] < 0.5 ? 'It would grind better with ' + gw[1] + '.' : 'This five can lock you down.');
  }
  return 'Balanced. No pace bonus and no pace cost. The talent decides it.';
}

/* THE SEASON IS ALREADY PLAYED BEFORE THE FIRST CELL LIGHTS.
 *
 * R.playSeason is deterministic off the run's seed and returns the whole thing
 * at once, so what follows is a REVEAL rather than a simulation. That is the
 * property that makes it safe to skip: pressing the button at game nine gives
 * exactly the same 82 games as watching all of them, because they were decided
 * before the animation started. It also means a backgrounded tab, a dropped
 * frame or a reduced-motion setting cannot produce a different record.
 */
var simTimer = null;
/* Mirrors of the running tally, so the top bar can carry the record without
   reaching into playSeason's closure. Zero means there is nothing to show. */
var simWins = 0, simLosses = 0;

function stopSim(){
  if (simTimer) { clearInterval(simTimer); simTimer = null; }
}

function playSeason(){
  /* THE 82, AND THEN STOP. It used to be one call that settled the whole run
     including the bracket, and then the screen read the answer back a round at
     a time. That cannot stand once a playoff game can be PLAYED: the rest of
     the bracket depends on how it went, so the games after it cannot already
     exist. R.playToPlayoffs plays the regular season exactly as before and
     hands the bracket back a game at a time. */
  var reg = R.playToPlayoffs(run);
  save();
  /* HIDDEN, NOT JUST DISABLED. Disabling it is what tells the dock to swap it
     for Skip, so that stays. But the dock hands it back to its card on the way
     out, and a dead brown slab reading "Season in progress" sitting above a
     live sim card is a caption, not a button. */
  $('b-play').disabled = true;
  $('b-play').style.display = 'none';
  $('b-play').textContent = 'Season in progress';
  $('simcard').style.display = '';
  $('sim-bracket').textContent = '';
  $('lvdoor').hidden = true;
  /* Play has just been spent and the sim card that holds Skip has just
     appeared, so the dock's answer for this screen has changed. */
  renderDock('s-season');

  var strip = $('sim-strip');
  strip.textContent = '';
  var cells = [];
  for (var i = 0; i < run.season.length; i++) {
    var c = document.createElement('span');
    c.className = 'gcell' + (run.schedule[i] && run.schedule[i].marquee ? ' marq' : '');
    strip.appendChild(c);
    cells.push(c);
  }

  var g = 0, w = 0, l = 0, streak = 0, homeW = 0, homeL = 0, marqW = 0, marqL = 0;
  simWins = 0; simLosses = 0;

  var finish = function(){
    stopSim();
    for (var k = g; k < run.season.length; k++) paint(k, true);
    g = run.season.length;
    $('sim-rec').textContent = reg.record.wins + '-' + reg.record.losses;
    $('sim-home').textContent = homeW + '-' + homeL;
    $('sim-marq').textContent = marqW + '-' + marqL;
    for (var c2 = 0; c2 < cells.length; c2++) cells[c2].classList.remove('now');
    toBracket();
  };

  function paint(idx, quiet){
    var gm = run.season[idx], sc = run.schedule[idx] || {};
    cells[idx].className = 'gcell' + (sc.marquee ? ' marq' : '') + (gm.won ? ' w' : ' l');
    if (gm.won) { w++; if (sc.home) homeW++; if (sc.marquee) marqW++; }
    else { l++; if (sc.home) homeL++; if (sc.marquee) marqL++; }
    streak = gm.won ? (streak >= 0 ? streak + 1 : 1) : (streak <= 0 ? streak - 1 : -1);
    simWins = w; simLosses = l;
    if (quiet) return;
    renderAppBar('s-season');
    if (idx > 0) cells[idx - 1].classList.remove('now');
    cells[idx].classList.add('now');
    $('sim-rec').textContent = w + '-' + l;
    var st = $('sim-streak');
    st.textContent = Math.abs(streak) < 2 ? '' : (streak > 0 ? 'won ' : 'lost ') + Math.abs(streak) + ' straight';
    st.className = 'streak' + (streak >= 3 ? ' hot' : streak <= -3 ? ' cold' : '');
    $('sim-last').textContent = '';
    var lead = document.createElement('b');
    lead.textContent = (gm.won ? 'W ' : 'L ') + gm.yourPoints + '-' + gm.oppPoints + (gm.ot ? ' OT' : '');
    $('sim-last').appendChild(lead);
    $('sim-last').appendChild(document.createTextNode(
      '  ' + (sc.home ? 'vs ' : 'at ') + (sc.oppName || 'opponent') + (sc.marquee ? ' (marquee)' : '')));
    $('sim-home').textContent = homeW + '-' + homeL;
    $('sim-marq').textContent = marqW + '-' + marqL;
  }

  stopSim();
  simTimer = setInterval(function(){
    if (g >= run.season.length) { finish(); return; }
    paint(g++, false);
  }, 34);

  $('b-skip').onclick = finish;
}
