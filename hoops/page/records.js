// ── career, on this device ─────────────────────────────────────────────────

/* EVERY ACCESS IS WRAPPED, and not out of habit. A private window throws on the
 * localStorage ACCESSOR rather than returning null, so an unguarded read is not
 * a missing profile, it is a game that does not start. The whole feature is
 * allowed to be absent and every reader below copes with an empty object.
 */
var PKEY = 'runthefloor_career_v1';

function loadCareer(){
  try {
    var raw = localStorage.getItem(PKEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    return (c && c.version === 1) ? c : null;
  } catch (e) { return null; }
}

function blankCareer(){
  return { version: 1, runs: 0, rings: 0, playoffs: 0, bestWins: 0, bestRating: 0,
    bestLabel: '', totalWins: 0, totalLosses: 0, clubs: {}, shapes: {}, beat72: 0,
    seasons: {}, colleges: {}, rows: [], days: {} };
}

/* THE DAYS AN ACCOUNT HAS PLAYED ON, keyed by the Eastern date the daily draft
   already uses. The arena ladder asks how many there are, because dedication is
   coming back rather than one long evening. A run counts one more on its day;
   a mode stamps the day and counts nothing, since Conquest files a feat after
   every steal. A map rather than a list, so cloud.js merges it like the others:
   the union, and the larger count on a day both devices played. */
function stampDay(c, count){
  c.days = (c.days && typeof c.days === 'object') ? c.days : {};
  var k = easternISO();
  c.days[k] = count ? (+c.days[k] || 0) + 1 : Math.max(+c.days[k] || 0, 1);
}

/* Called once, when a run reaches a result. Recording it anywhere earlier would
   count an abandoned draft as a season.
 *
 * IT ANSWERS WITH WHAT THIS RUN CHANGED, which is the half that was missing.
 * badges.js computes a forty-odd badge cabinet off the whole career and the
 * only surface it had was a tab inside a sheet, so a badge was earned in
 * silence and found weeks later by somebody who happened to look. The same is
 * true of a career best: the number quietly moved and the screen said nothing.
 * Both are answered here rather than on the results screen, because both are a
 * DIFFERENCE and the before only exists at this moment.
 *
 * `before` is a second parse rather than a copy of `c`. loadCareer JSON-parses
 * on every call, so the two are independent objects and the mutation below
 * cannot reach into the one being compared against. A structuredClone would
 * do the same job and is not available everywhere this has to run.
 */
/* MADE THE PLAYOFFS MEANS THE BRACKET, NOT THE PLAY-IN. In the NBA a club that
   loses its play-in game did not make the playoffs, and "In the field" lit on
   exactly that season, beside a results screen reading LOST THE PLAY-IN. A
   play-in run is in the field once it has won the play-in, and not before. */
function madePlayoffs(r){
  var rs = r && r.playoffs && r.playoffs.rounds;
  if (!rs || !rs.length) return false;
  return rs[0].round !== 'Play-In' || !!rs[0].won;
}

function recordRun(out){
  var before = loadCareer() || blankCareer();
  var c = loadCareer() || blankCareer();
  c.runs++;
  stampDay(c, true);
  c.totalWins += out.wins;
  c.totalLosses += out.losses;
  if (out.titleWon) c.rings++;
  if (out.beatRecord) c.beat72++;
  if (madePlayoffs(run)) c.playoffs++;
  if (out.wins > c.bestWins) {
    c.bestWins = out.wins;
    c.bestLabel = out.wins + '-' + out.losses;
  }
  if (out.rating > c.bestRating) c.bestRating = out.rating;
  c.last = {
    wins: out.wins, losses: out.losses, label: out.wins + '-' + out.losses,
    headline: headline(out),
    shape: out.structure && out.structure.archetype ? out.structure.archetype.name : '',
    club: run.club || null
  };

  /* A LOCKED RUN IS ITS OWN LADDER. A One Franchise roster shares the club
     link with everybody on it, so measured over 360 runs across all thirty
     clubs its chemistry sits at +2.30 against a maximum of 2.50 whatever gets
     drafted, and best-available finishes 46.8 wins where the same bot playing
     the whole league finishes 42.0. Mixing the two into one bestWins would
     quietly retire the league record to whoever picked the deepest franchise.
     So the club's own best is kept beside it and the two are never compared.
     bestWins above stays what it has always been: every run, all modes, which
     is the number the front page has always shown. */
  var shelf = function(mapKey, key){
    c[mapKey] = c[mapKey] || {};
    var s = c[mapKey][key] || { runs: 0, rings: 0, bestWins: -1, bestLabel: '' };
    s.runs++;
    if (out.titleWon) s.rings++;
    if (out.wins > s.bestWins) {
      s.bestWins = out.wins;
      s.bestLabel = out.wins + '-' + out.losses;
    }
    c[mapKey][key] = s;
  };
  if (run.club) shelf('byClub', run.club);
  /* AND THE DECADES GET ONE TOO, for the same reason and a bigger spread.
     Measured over ten best-available runs an era, the seventies came back at
     49.6 wins and the aughts at 40.7, which is nine wins of difference
     between two modes wearing the same word. What that would do to one
     bestWins is retire the league record to whichever decade had the
     shallowest priced talent. */
  if (run.era) shelf('byEra', run.era);

  var shape = out.structure && out.structure.archetype ? out.structure.archetype.name : null;
  if (shape) c.shapes[shape] = (c.shapes[shape] || 0) + 1;
  for (var i = 0; i < run.roster.length; i++) {
    var nm = E.teamName(run.roster[i].t);
    c.clubs[nm] = (c.clubs[nm] || 0) + 1;
  }

  /* ── WHAT THE CABINET READS ────────────────────────────────────────────
   * Two shapes of memory, and the split is deliberate.
   *
   * The SETS above and below are cumulative counts the career has always kept
   * or can keep cheaply, and they are what the collections read. They are also
   * why somebody who has been playing for weeks opens the cabinet and finds it
   * partly filled rather than empty.
   *
   * The ROWS are one compact line per finished run, and they are what the
   * one-off feats read. Storing them rather than storing "has won a cheap ring"
   * means a badge added next month needs no migration and no change to this
   * function: every run already on the device answers the new question.
   *
   * NO VERSION BUMP. loadCareer only accepts version 1, so raising it would
   * throw away every existing career on every device. New fields are added and
   * every reader in badges.js treats a missing one as "not known".
   */
  c.seasons = c.seasons || {};
  c.colleges = c.colleges || {};
  for (var q = 0; q < run.roster.length; q++) {
    var pl = run.roster[q];
    c.seasons[pl.s] = (c.seasons[pl.s] || 0) + 1;
    if (pl.col) c.colleges[pl.col] = (c.colleges[pl.col] || 0) + 1;
  }

  var lastRd = (run.playoffs && run.playoffs.rounds.length)
    ? run.playoffs.rounds[run.playoffs.rounds.length - 1] : null;
  var awards = {}, decorated = 0, top = 0, pairs = 0;
  for (var a = 0; a < run.roster.length; a++) {
    var pr = run.roster[a];
    if (pr.p > top) top = pr.p;
    var aw = pr.aw || [];
    if (aw.length) decorated++;
    for (var k = 0; k < aw.length; k++) awards[aw[k]] = 1;
    /* Two men off the same club AND the same season, which is the pairing the
       chemistry model rewards most and the one a fan notices. */
    for (var b2 = a + 1; b2 < run.roster.length; b2++) {
      if (run.roster[b2].t === pr.t && run.roster[b2].s === pr.s) pairs++;
    }
  }

  c.rows = Array.isArray(c.rows) ? c.rows : [];
  c.rows.push({
    /* THE RUN'S OWN SEED, so two devices merging their careers can tell one
       finished season from another. Without an identity the union in cloud.js
       is not idempotent and every row on the device doubles on every boot.
       Rows already on a device have none and fall back to a key built from
       their contents, which is why this is a new field rather than a version
       bump: loadCareer accepts version 1 and nothing else, and raising it
       would throw away every career on every device. */
    id: (run && typeof run.seed === 'number') ? run.seed : undefined,
    w: out.wins, l: out.losses,
    ring: !!out.titleWon,
    po: madePlayoffs(run),
    rating: Math.round(out.rating),
    chem: out.chemistry && typeof out.chemistry.bonus === 'number'
      ? Math.round(out.chemistry.bonus * 100) / 100 : 0,
    spend: Math.round((E.CONSTANTS.CAP_MUSD - R.remaining(run)) * 10) / 10,
    left: Math.round(R.remaining(run) * 10) / 10,
    top: Math.round(top * 10) / 10,
    pairs: pairs,
    aw: Object.keys(awards),
    decorated: decorated,
    /* Which mode filed the row, so a badge written next month can ask. Absent
       on every row already on a device, which badges.js reads as "not known"
       the same way it reads every other field added since it shipped. */
    club: run.club || null,
    era: run.era || null,
    swept: !!(lastRd && !lastRd.won && lastRd.oppWins === 4 && lastRd.yourWins === 0),
    lostFinals: !!(lastRd && !lastRd.won && lastRd.round === 'NBA Finals')
  });
  /* CAPPED, because localStorage is finite and a row is worth about 160 bytes.
     250 runs is more than anybody will play and about 40KB, which is under one
     per cent of the budget. The OLDEST go, so a long-running career keeps its
     most recent evidence. Every badge above is a "has ever", so trimming can
     in principle take a feat away: at 250 runs that is a trade worth making
     against a career that stops saving at all. */
  if (c.rows.length > 250) c.rows = c.rows.slice(-250);

  /* THE FEATS, which is where every badge added after the rows lives. The rule
     for what a run proves is badges.js' draftFeats, the same function
     check-badges.mjs plays the game through, so the page and the checker
     cannot disagree about what a Game 7 is. A blocked badges.js costs the
     feats and nothing else. */
  var BG = window.RTF_BADGES;
  if (BG && typeof BG.draftFeats === 'function') {
    try {
      BG.applyFeats(c, BG.draftFeats(run));
      var dStreak = dailyStreakAfter();
      if (dStreak) BG.applyFeats(c, { max: { 'daily.streak': dStreak } });
    } catch (e) {}
  }

  try { localStorage.setItem(PKEY, JSON.stringify(c)); } catch (e) {}
  cloudPushCareer(c);

  /* THE ORDER OF THESE THREE LINES IS LOAD-BEARING and they are statements
     rather than fields of one literal for that reason. bestsSet compares
     today against every previous day, so it has to be asked before
     dailyRecord files today and turns the comparison into a tie with itself.
     Written as one object literal it would still work, off property
     evaluation order, which is a rule nobody should have to know. */
  var fresh = freshBadges(before, c);
  var bests = bestsSet(before, out);
  var day = dailyIsToday() ? dailyRecord(out) : null;
  /* THE DAILY IS PUSHED FROM HERE AND NOT FROM dailyRecord OR dailyPut, and
     both of those were tried. `dailyRecord` is LIFTED OUT OF THIS PAGE by
     verify.mjs and driven in node, so a page-level call inside it is a
     ReferenceError in a suite that has nothing to do with the shelf. `dailyPut`
     is also what the pull writes a merged record through, so hooking the setter
     would queue this write and then queue the pull's own settle behind it: two
     round trips carrying the same bytes. The caller is the one place that is
     neither. */
  if (day) cloudPushDaily(day);
  var arenas = freshArenas(before, c);
  if (arenas.length) arenaChanged();
  /* THE COINS, keyed on the run (or the day), so a redrawn results screen
     pays nothing twice, then the badges this run lit. earn.js decides who
     earns: a guest plays and keeps nothing in coins. */
  var coins = earnRun(out, c);
  return { career: c, fresh: fresh, bests: bests, daily: day, arenas: arenas, coins: coins };
}

/* WHAT JUST LIT. Nothing stores "earned", by design: every badge is derived
   from the career, which is what makes the cabinet retroactive and impossible
   to lose. So the only way to know what this run earned is to ask the same
   question twice, either side of the write.
 *
 * It is allowed to answer nothing at all. badges.js is a separate script and a
 * blocked one must cost a row on a screen rather than the screen. */
function earnRun(out, c){
  var EN = window.RTF_EARN;
  if (!EN || !run) return 0;
  try {
    var r = EN.run({ madePlayoffs: madePlayoffs(run), seriesWon: seriesWon(run), champion: !!out.titleWon }, run);
    return (r && r.paid ? r.amount : 0) + EN.badges(c);
  } catch (e) { return 0; }
}

function freshBadges(before, after){
  var B = window.RTF_BADGES;
  if (!B || typeof B.earned !== 'function') return [];
  try {
    var had = {};
    B.earned(before).forEach(function(b){ had[b.id] = 1; });
    return B.earned(after).filter(function(b){ return !had[b.id]; });
  } catch (e) { return []; }
}

/* THE MARKS A RUN SETS, read off the career as it stood BEFORE the run was
   filed. Read after, every one of them is a tie rather than a beat and the
   screen says nothing on the run that earned it.
 *
 * A FIRST RUN SETS NO RECORD. It is trivially the best of one, and a screen
 * congratulating somebody on beating nobody is the unearnable badge in
 * reverse: a mark that means nothing because it cannot be missed. Same rule
 * for a franchise or a decade: the shelf has to have been stood on. */
function bestsSet(before, out){
  var marks = [];
  var had = function(map, key){
    var s = map && map[key];
    return (s && s.runs > 0) ? s : null;
  };
  if (out.titleWon && !before.rings) marks.push({ kind: 'ring', text: 'Your first ring' });
  if (before.runs > 0 && out.wins > before.bestWins) {
    marks.push({ kind: 'gold', text: 'Career best, past ' + before.bestLabel });
  }
  if (run.club) {
    var cs = had(before.byClub, run.club);
    if (cs && out.wins > cs.bestWins) {
      marks.push({ kind: 'gold',
        text: 'Best ' + E.teamName(run.club) + ' run, past ' + cs.bestLabel });
    }
  }
  if (run.era) {
    var es = had(before.byEra, run.era);
    if (es && out.wins > es.bestWins) {
      marks.push({ kind: 'gold',
        text: 'Best ' + (ERA_NAMES[run.era] || run.era) + ' run, past ' + es.bestLabel });
    }
  }
  if (dailyIsToday()) {
    var d = dailyState();
    /* Read before dailyRecord files today, so the comparison is against every
       PREVIOUS day rather than against the one being set. */
    if (d && d.played > 0 && out.wins > d.best) {
      marks.push({ kind: 'gold', text: 'Best daily yet, past ' + d.best + ' wins' });
    }
    var alive = d && d.streak > 0 && d.lastDone === todayNumber() - 1;
    var n = alive ? d.streak + 1 : 1;
    if (n > 1) marks.push({ kind: 'streak', text: n + ' days in a row' });
  }
  return marks;
}

function topOf(map){
  var best = null, n = 0;
  for (var k in map) if (map[k] > n) { n = map[k]; best = k; }
  return best ? { name: best, n: n } : null;
}

function renderCareer(){
  var c = loadCareer();
  var list = $('pf-list');
  list.textContent = '';
  renderCareerNote();

  if (!c || !c.runs) {
    $('pf-runs').textContent = '0';
    $('pf-rings').textContent = '0';
    $('pf-best').textContent = '-';
    $('prof-sub').textContent = '';
    var li = document.createElement('li');
    li.style.cssText = 'display:block;border:0;color:var(--mut)';
    li.textContent = 'No finished runs yet. Draft '
      + NUMWORD(E.SLOTS.length) + '. Play 82.';
    list.appendChild(li);
    return;
  }

  $('pf-runs').textContent = String(c.runs);
  $('pf-rings').textContent = String(c.rings);
  $('pf-best').textContent = c.bestLabel || '-';
  $('prof-sub').textContent = c.runs + ' run' + (c.runs === 1 ? '' : 's') + ' on this device';

  var row = function(label, value){
    var li = document.createElement('li');
    li.appendChild(document.createTextNode(label));
    var b = document.createElement('b');
    b.textContent = value;
    li.appendChild(b);
    list.appendChild(li);
  };

  var games = c.totalWins + c.totalLosses;
  row('Career record', c.totalWins + '-' + c.totalLosses);
  row('Wins a season', games ? (c.totalWins / c.runs).toFixed(1) : '-');
  row('Playoff seasons', c.playoffs + ' of ' + c.runs);
  row('Best rating', c.bestRating ? c.bestRating.toFixed(0) : '-');
  if (c.beat72) row('Seasons past 72 wins', String(c.beat72));

  var shape = topOf(c.shapes);
  if (shape) row('Most drafted shape', shape.name + ' (' + shape.n + ')');
  var club = topOf(c.clubs);
  if (club) row('Most drafted team', club.name + ' (' + club.n + ')');

  /* THE ONE FRANCHISE SHELF, and it is a separate block for the reason
     recordRun keeps a separate number: these are not runs against the league,
     they are runs against one club's own history, and a fan's answer to "how
     good was my Knicks team" is meaningless next to somebody else's Lakers.
     Best first, because the best is the one being defended. */
  var shelf = function(map, title, nameOf){
    if (!map) return;
    var keys = Object.keys(map).filter(function(k){ return map[k].runs > 0; });
    if (!keys.length) return;
    keys.sort(function(a, b){ return map[b].bestWins - map[a].bestWins; });
    var head = document.createElement('li');
    head.className = 'plisthead';
    head.textContent = title;
    list.appendChild(head);
    for (var i = 0; i < keys.length; i++) {
      var s = map[keys[i]];
      row(nameOf(keys[i]) + ' · ' + s.runs + (s.runs === 1 ? ' run' : ' runs')
        + (s.rings ? ' · ' + s.rings + (s.rings === 1 ? ' ring' : ' rings') : ''),
        s.bestLabel || '-');
    }
  };
  shelf(c.byClub, 'One Franchise', function(k){ return E.teamName(k); });
  shelf(c.byEra, 'Decades', function(k){ return ERA_NAMES[k] || k; });
}

/* FOCUS GOES INTO THE SHEET AND COMES BACK OUT AGAIN.
 *
 * It carries role="dialog" and aria-modal="true", which is a promise: a screen
 * reader stops announcing the page behind it and a keyboard user expects to be
 * inside it. Neither was true. Focus stayed on the Career button in the bar, so
 * the first Tab went to whatever followed it on the page UNDER the sheet, and a
 * keyboard user was reading a page they could not see.
 *
 * Where focus was before is remembered, so closing puts it back where the
 * player left it rather than at the top of the document. */
var sheetReturn = null;

function openProfile(){
  renderIdentity();
  renderCareer();
  renderAccount();
  renderBadges();
  showProfileTab(badgeTab);
  sheetReturn = document.activeElement;
  $('sheet').classList.add('open');
  var first = $('pt-record') || $('b-prof-x');
  if (first) first.focus();
}

function closeProfile(){
  /* THE TWO SHEETS SHARE ONE sheetReturn AND ESCAPE CLOSES BOTH. Without this
     guard, closing a sheet that was never open nulls the OTHER sheet's saved
     focus on the way past, and the close after it puts focus nowhere. */
  if (!$('sheet').classList.contains('open')) return;
  $('sheet').classList.remove('open');
  if (sheetReturn && sheetReturn.focus) {
    try { sheetReturn.focus(); } catch (e) { /* it may have been re-rendered away */ }
  }
  sheetReturn = null;
}

function clearCareer(){
  try { localStorage.removeItem(PKEY); } catch (e) {}
  /* AND OFF THE SHELF, OR THE NEXT BOOT BRINGS IT STRAIGHT BACK. The pull
     merges rather than overwrites, so a career cleared here and left on the
     server is a button that appears to do nothing a moment later. Deleting is
     the same rule the run follows and the same rule 103 argues for: starting
     over deletes, because progress can never be used to write something
     smaller over something bigger. */
  if (cloudReady()) cloudPush(CL.SLOT_CAREER, function(){ return { drop: true }; });
  renderCareer();
  renderHome();
}

/* WHERE THE CAREER IS KEPT, in a sentence that has to be true of the reader
   looking at it. Signed out it is this browser and nothing else, which is what
   it has always been. Signed in it is on the account, which is the whole point
   of the shelf and is also a disclosure: somebody should not have to read the
   source to find out their record left the device. */
function renderCareerNote(){
  var el = $('pf-store');
  if (!el) return;
  el.textContent = cloudReady()
    ? ('Saved on your account. It follows you to any device. '
       + 'Clear career wipes it there too.')
    : ('Saved in this browser only. Clearing site data or a private window wipes it. '
       + 'Sign in to keep it on your account.');
}

/* ── THE ACCOUNT ROW ───────────────────────────────────────────────────────
 *
 * FIVE STATES, and the middle one is the one that is easy to miss. Built
 * rather than written into the markup, because markup for five states is
 * markup for whichever one somebody last looked at.
 *
 *   checking       the library is deferred and may still arrive
 *   unavailable    it is not coming: a blocked CDN, or an extension
 *   signed out     the offer
 *   no name yet    signed in through Google, which makes no username
 *   signed in      the name, and the way out
 *
 * "Checking" and "unavailable" are two states and not one, which is the whole
 * reason auth.js reports `waiting` separately from `ready`: a spinner that
 * never stops and a sentence saying accounts are off are the right answers to
 * two different situations, and showing either one for the other is wrong in
 * a way nothing throws about.
 *
 * NOTHING HERE IS A GATE. Every line of it is about putting a name on a run.
 * A signed out player has a complete game and a complete career; what they do
 * not have is a row anybody else can see.
 */
function renderAccount(){
  var el = $('pf-acct');
  if (!el) return;
  var st = A.state();
  el.textContent = '';

  var say = function(html){
    var p = document.createElement('p');
    p.innerHTML = html;
    el.appendChild(p);
    return p;
  };
  var row = function(){
    var d = document.createElement('div');
    d.className = 'arow';
    el.appendChild(d);
    return d;
  };
  var btn = function(into, label, cls, fn){
    var b = document.createElement('button');
    b.className = cls || '';
    b.textContent = label;
    b.onclick = fn;
    into.appendChild(b);
    return b;
  };
  var err = function(msg, good){
    var p = document.createElement('p');
    p.className = 'err' + (good ? ' ok' : '');
    p.textContent = msg;
    el.appendChild(p);
  };

  if (!st.ready && st.waiting) { say('Checking for your account.'); return; }
  if (!st.ready) {
    say('Accounts are down right now. Runs still count, just without a name. '
      + 'Everything else works.');
    return;
  }

  if (!st.signedIn) {
    say('Sign in to put your name on the leaderboard, collect badges and keep '
      + 'your career on every device. Your runs count either way.');
    var r1 = row();
    var email = document.createElement('input');
    email.type = 'email'; email.placeholder = 'Email'; email.autocomplete = 'email';
    r1.appendChild(email);
    var r2 = row();
    var pass = document.createElement('input');
    pass.type = 'password'; pass.placeholder = 'Password';
    pass.autocomplete = 'current-password';
    r2.appendChild(pass);
    /* The reset happens on the home page, in a new tab so a run in progress stays put. */
    row().innerHTML = '<a href="/#forgot" target="_blank" rel="noopener" style="display:inline-block;margin:4px 0 2px;font-size:12.5px;color:inherit;opacity:.75;text-decoration:underline;text-underline-offset:3px">Forgot your password?</a>';
    var r3 = row();
    var busy = false;
    var go = function(fn){
      return function(){
        if (busy) return;
        busy = true;
        fn().then(function(res){
          busy = false;
          if (res && res.error) err(res.error);
          else renderAccount();
        });
      };
    };
    btn(r3, 'Sign in', '', go(function(){ return A.signIn(email.value, pass.value); }));
    btn(r3, 'Create one', 'ghost', function(){
      /* THE NAME IS ASKED FOR AT SIGN-UP AND NOT AFTER, because the profile
         row is made by a trigger reading the sign-up metadata: asked
         afterwards it is a second round trip and a state where somebody is
         signed in with no name, which is the state Google sign-in already
         produces and the one below exists to answer. */
      var name = prompt('Pick a name for the board. Letters, numbers and '
        + 'underscores only.');
      if (!name) return;
      if (busy) return;
      busy = true;
      A.signUp(email.value, pass.value, name.trim()).then(function(res){
        busy = false;
        if (res && res.error) err(res.error);
        else { err('Check your email to confirm the account.', true); }
      });
    });
    var r4 = row();
    btn(r4, 'Sign in with Google', 'ghost', function(){ A.signInGoogle(); });
    return;
  }

  if (!st.name) {
    say('You are signed in as <b>' + esc(st.email || 'your account')
      + '</b>. Pick a name. It goes on every run you have already played.');
    var rn = row();
    var nm = document.createElement('input');
    nm.placeholder = 'Name on the board';
    rn.appendChild(nm);
    btn(rn, 'Save', '', function(){
      A.setName(nm.value.trim()).then(function(res){
        if (res && res.error) err(res.error); else renderAccount();
      });
    });
    var ro = row();
    btn(ro, 'Sign out', 'ghost', function(){ A.signOut().then(renderAccount); });
    return;
  }

  say('On the board as <b>' + esc(st.name) + '</b>.');
  var rs = row();
  btn(rs, 'Leaderboard', '', function(){ closeProfile(); openBoard(); });
  btn(rs, 'Sign out', 'ghost', function(){ A.signOut().then(renderAccount); });
  /* the release newsletter box, /assets/newsletter.js. Absent script, absent box. */
  if (window.RTG_NEWS) el.appendChild(RTG_NEWS.el({ source: 'hoops' }));
}

/* The account row is the one thing on this page that prints text somebody
   else chose, so it is the one place that needs this. A username is validated
   server side and an email is the player's own, and neither is a reason to
   put an unescaped string into innerHTML. */
function esc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ── THE CABINET ───────────────────────────────────────────────────────────
 *
 * Rendered from badges.js, which computes everything off the career rather
 * than storing a single flag when something is earned. Locked badges are shown
 * dim rather than hidden: a cabinet of empty squares is a list of things to go
 * and do, and one that hides what you have not earned looks finished on day one.
 */
var badgeTab = 'record';

/* ── THE BALL EVERY BADGE IS ───────────────────────────────────────────────
 *
 * The logo's own drawing (build/logo-art.mjs), run here in a metal. The rules
 * are the same few: a one cell outline found as the inside cells touching the
 * outside, an upright and a level seam through the middle, two side seams
 * that step out once near the rim, and the light cut into diagonal bands off
 * the top left. Copied rather than fetched, because the page draws forty of
 * these at once and a round trip per cabinet is a cabinet that pops in.
 *
 * Bronze IS the ball, in the logo's own orange: the first step is a
 * basketball. Silver and gold are the trophy versions of it, and a ring is
 * the gold one with a glow in CSS. Locked is slate, with the seams lighter
 * than the body so the shape still reads on the dark tile.
 */
var BALL_PAL = {
  bronze: { ink: '#2a1206', hl: '#ffc27a', lt: '#ff9e45', base: '#f07a22', mid: '#d25e16', dk: '#a8430e' },
  silver: { ink: '#1b2029', hl: '#ffffff', lt: '#e3e8f0', base: '#bcc5d2', mid: '#949fb0', dk: '#6b7585' },
  gold:   { ink: '#2a1a02', hl: '#fff3bf', lt: '#ffd766', base: '#f0b429', mid: '#cf920f', dk: '#9a6806' },
  ring:   { ink: '#2a1a02', hl: '#fffbe6', lt: '#ffe38a', base: '#f7c23a', mid: '#dca01a', dk: '#a8750a' },
  off:    { ink: '#3a4251', hl: '#2b3342', lt: '#262d3b', base: '#222935', mid: '#1e242f', dk: '#1a1f28' },
};

function badgeBall(tier, N){
  N = N || 15;
  var key = tier + ':' + N;
  if (!badgeBall.cache) badgeBall.cache = {};
  if (badgeBall.cache[key]) return badgeBall.cache[key];
  var P = BALL_PAL[tier] || BALL_PAL.bronze;
  var c = (N - 1) / 2, R = c + 0.35;
  var inside = function(x, y){
    return x >= 0 && y >= 0 && x < N && y < N && Math.hypot(x - c, y - c) <= R;
  };
  var side = Math.round(c / 2), step1 = Math.round(c * 0.62), step2 = Math.round(c * 0.84);
  /* Not `out`: verify.mjs reads every `out.<field>` in this page as a field
     the results screen expects an outcome to carry. */
  var rects = [];
  for (var y = 0; y < N; y++) {
    var row = [];
    for (var x = 0; x < N; x++) {
      if (!inside(x, y)) { row.push(null); continue; }
      var dx = x - c, dy = y - c, ady = Math.abs(dy);
      var edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      var sd = side + (ady >= step2 ? 2 : ady >= step1 ? 1 : 0);
      if (edge || dx === 0 || dy === 0 || Math.abs(dx) === sd) { row.push(P.ink); continue; }
      var k = (dx + dy) / c;
      row.push(k < -0.95 ? P.hl : k < -0.4 ? P.lt : k > 0.95 ? P.dk : k > 0.5 ? P.mid : P.base);
    }
    /* One rect per run of one colour, which is what logo-art's toSvg does. */
    for (var x2 = 0; x2 < N;) {
      var col = row[x2], w = 1;
      while (x2 + w < N && row[x2 + w] === col) w++;
      if (col) rects.push('<rect x="' + x2 + '" y="' + y + '" width="' + w + '" height="1" fill="' + col + '"/>');
      x2 += w;
    }
  }
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + ' ' + N
    + '" shape-rendering="crispEdges" aria-hidden="true">' + rects.join('') + '</svg>';
  badgeBall.cache[key] = svg;
  return svg;
}

/* ── WHO HAS A CABINET ─────────────────────────────────────────────────────
 *
 * AN ACCOUNT, AND NOBODY ELSE. The career is still kept for a guest, in this
 * browser, because it is what the account adopts on the way in: the shelf
 * MERGES a career nobody owns into the account that signs in (cloud.js), and
 * every badge is derived from the career, so the runs a guest plays light
 * their badges the moment they sign in. What a guest does not get is the
 * cabinet itself, and the page says why rather than drawing an empty tab.
 *
 * READ LIVE, never cached. Sign in and out both happen with the sheet open. */
function badgesOn(){
  var st = A.state();
  return !!(st && st.signedIn);
}

/* The sign-in form is the top of the career sheet already, so the way into
   the cabinet is to go there and put the cursor in it. A second form would
   be a second place for the account to be wrong. */
function badgeSignIn(){
  if (!$('sheet').classList.contains('open')) openProfile();
  var inp = $('pf-acct') && $('pf-acct').querySelector('input');
  if (inp) { try { inp.focus(); inp.scrollIntoView({ block: 'center' }); } catch (e) {} }
}

function renderBadges(){
  var grid = $('pf-badges'), note = $('pf-badgenote'), B = window.RTF_BADGES;
  if (!grid || !B) return;
  var c = loadCareer() || {};
  var all = B.evaluate(c);
  var got = all.filter(function(b){ return b.got; }).length;
  grid.textContent = '';

  if (!badgesOn()) {
    if ($('pt-count')) $('pt-count').textContent = '';
    var st = A.state();
    var g = document.createElement('div');
    g.className = 'bdg-guest';
    var balls = document.createElement('div');
    balls.className = 'bbrow';
    ['bronze', 'silver', 'gold', 'ring'].forEach(function(t){
      var sp = document.createElement('span');
      sp.innerHTML = badgeBall(t, 21);
      balls.appendChild(sp);
    });
    g.appendChild(balls);
    var h = document.createElement('b');
    var p = document.createElement('p');
    if (!st.ready && st.waiting) {
      h.textContent = 'Checking for your account';
      p.textContent = 'Your badges show here once it answers.';
      g.appendChild(h); g.appendChild(p);
    } else if (!st.ready) {
      h.textContent = 'Badges need an account';
      p.textContent = 'Accounts are down right now. Your runs still count toward them.';
      g.appendChild(h); g.appendChild(p);
    } else {
      h.textContent = 'Badges are for accounts';
      p.textContent = all.length + ' to collect. Sign in and the runs on this device count toward them.';
      g.appendChild(h); g.appendChild(p);
      var go = document.createElement('button');
      go.id = 'b-badge-signin';
      go.textContent = 'Sign in';
      go.onclick = badgeSignIn;
      g.appendChild(go);
    }
    grid.appendChild(g);
    if (note) note.hidden = true;
    return;
  }
  if ($('pt-count')) $('pt-count').textContent = got + '/' + all.length;

  /* EARNED FIRST, BEST FIRST. Then the ones NOT earned, CLOSEST first.
     Those two halves want opposite orders and the first version used one for
     both, so the locked half opened on "Win five titles" and "Every season
     since 1974" while "Scout 15 clubs, 10 of 15" was three rows further down.
     A cabinet should show somebody the next thing they can get, not the last
     thing they ever will. */
  var rank = { ring: 0, gold: 1, silver: 2, bronze: 3 };
  var near = function(b){ return b.need > 1 ? b.have / b.need : 0; };
  all.sort(function(a, b){
    if (a.got !== b.got) return a.got ? -1 : 1;
    if (a.got) return (rank[a.tier] || 9) - (rank[b.tier] || 9);
    if (near(b) !== near(a)) return near(b) - near(a);
    return (rank[b.tier] || 9) - (rank[a.tier] || 9);
  });

  /* ONE SHELF A GROUP, in badges.js' order, each keeping the sort above. */
  var shelves = {}, order = (B.GROUPS || [['all', 'Badges']]);
  order.forEach(function(gr){
    var mine = all.filter(function(b){ return (b.g || 'all') === gr[0]; });
    if (!mine.length) return;
    var have = mine.filter(function(b){ return b.got; }).length;
    var d = document.createElement('details');
    d.className = 'bshelf';
    d.setAttribute('data-g', gr[0]);
    if (have > 0) d.open = true;
    var sm = document.createElement('summary');
    var t = document.createElement('span');
    t.textContent = gr[1];
    var n = document.createElement('span');
    n.className = 'n' + (have === mine.length ? ' full' : '');
    n.textContent = have + '/' + mine.length;
    sm.appendChild(t); sm.appendChild(n);
    d.appendChild(sm);
    var inner = document.createElement('div');
    inner.className = 'bgrid';
    d.appendChild(inner);
    grid.appendChild(d);
    shelves[gr[0]] = inner;
  });
  /* A shelf nobody has opened yet still opens on the first one, so a new
     account does not meet thirteen closed boxes. */
  if (!grid.querySelector('.bshelf[open]') && grid.firstChild) grid.firstChild.open = true;

  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    var home = shelves[b.g || 'all'];
    if (!home) continue;
    var el = document.createElement('div');
    el.className = 'bdg ' + (b.got ? 'on ' + b.tier : 'off');
    var ball = document.createElement('span');
    ball.className = 'bb';
    ball.innerHTML = badgeBall(b.got ? b.tier : 'off', 21);
    el.appendChild(ball);
    var nm = document.createElement('span');
    nm.className = 'bn';
    nm.textContent = b.name;
    el.appendChild(nm);
    var why = document.createElement('span');
    why.className = 'bw';
    why.textContent = b.why;
    el.appendChild(why);
    /* A PROGRESS BAR ONLY WHERE THERE IS PROGRESS TO SHOW. On a one-off feat
       the bar is either empty or full and says nothing the border has not
       already said. */
    if (b.collection && b.need > 1) {
      var track = document.createElement('span');
      track.className = 'bp';
      var fill = document.createElement('i');
      fill.style.width = Math.round(100 * Math.min(1, b.have / b.need)) + '%';
      track.appendChild(fill);
      el.appendChild(track);
      var n = document.createElement('span');
      n.className = 'bnum';
      n.textContent = b.have + ' of ' + b.need;
      el.appendChild(n);
    }
    home.appendChild(el);
  }

  /* WHAT IS AND IS NOT RETROACTIVE, said out loud. The career has always
     counted clubs and shapes, so those collections fill in for somebody who
     has been playing for weeks. Everything else reads the per-run rows, which
     only exist for runs finished since the cabinet shipped. Somebody with a
     ring and no Champions badge deserves to know why. */
  var runs = num0(c.runs), stored = (c.rows && c.rows.length) || 0;
  if (note) {
    if (runs > stored) {
      note.hidden = false;
      note.textContent = 'Team and system badges count every run. Other badges read the '
        + stored + ' run' + (stored === 1 ? '' : 's') + ' saved in detail since badges launched. '
        + 'Your ' + (runs - stored) + ' earlier run'
        + (runs - stored === 1 ? '' : 's') + ' cannot count toward them.';
    } else {
      note.hidden = false;
      note.textContent = cloudReady() ? 'Saved on your account with your career.'
        : 'Saved in this browser with your career. Clearing site data wipes them.';
    }
  }
}

var num0 = function(v){ return (typeof v === 'number' && isFinite(v)) ? v : 0; };

function showProfileTab(which){
  if (which !== 'badges' && which !== 'locker') which = 'record';
  badgeTab = which;
  var tabs = { record: 'pt-record', badges: 'pt-badges', locker: 'pt-locker' };
  $('pf-list').hidden = which !== 'record';
  $('pf-badges').hidden = which !== 'badges';
  $('pf-badgenote').hidden = which !== 'badges' || !badgesOn();
  if ($('pf-locker')) $('pf-locker').hidden = which !== 'locker';
  for (var k in tabs) {
    var b = $(tabs[k]);
    if (!b) continue;
    b.className = 'ptab' + (k === which ? ' on' : '');
    b.setAttribute('aria-selected', k === which ? 'true' : 'false');
  }
  if (which === 'badges') renderBadges();
  if (which === 'locker') renderLocker();
}
