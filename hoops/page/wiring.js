// ── wiring ─────────────────────────────────────────────────────────────────

$('b-start').disabled = true;
$('b-start').onclick = startRun;
$('b-resume').onclick = resumeRun;
$('b-abandon').onclick = abandonRun;
$('b-mark').onclick = function(){ renderHome(); show('s-home'); };
$('b-home').onclick = function(){ renderHome(); show('s-home'); };
$('b-share').onclick = shareRun;
$('b-spin').onclick = spin;
$('b-respin').onclick = respin;
$('b-play').onclick = playSeason;
$('b-lv-play').onclick = startLive;
$('b-lv-sim').onclick = doorSim;
/* A played game in the series card opens its box score. Delegated, because
   the strip is rebuilt after every game. The walk holds while it is open. */
$('srs-strip').addEventListener('click', function(ev){
  var b = ev.target && ev.target.closest ? ev.target.closest('button.srs-pip') : null;
  var src = srsSource();
  if (!b || !src) return;
  openGame({ kind: 'playoff', round: src.round, game: +b.getAttribute('data-g') });
});
$('b-lv-fast').onclick = lvFast;
$('b-lv-next').onclick = lvContinue;
$('b-brk-fast').onclick = function(){ if (brkFast) brkFast(); };
/* RUN IT BACK MEANS THE SAME GAME. Pressed on the results of a Bulls run it
   has to start another Bulls run: a button that silently drops you back into
   the whole league is the same defect as a Back that goes somewhere else. */
$('b-again').onclick = function(){
  startRun(run && run.club ? run.club : null, run && run.era ? run.era : null); };
$('b-prof-x').onclick = closeProfile;
$('pt-record').onclick = function(){ showProfileTab('record'); };
$('pt-badges').onclick = function(){ showProfileTab('badges'); };
$('pt-locker').onclick = function(){ showProfileTab('locker'); };
$('pf-id').onclick = function(){ showProfileTab('locker'); };
$('b-prof-clear').onclick = clearCareer;
$('b-franchise-pick').onclick = openClubs;
$('b-club-x').onclick = closeClubs;
$('b-decade-pick').onclick = openEras;
$('frg-x').onclick = frgClose;
$('b-era-x').onclick = closeEras;
$('b-gs-x').onclick = closeGame;
$('b-gs-prev').onclick = function(){ stepGame(-1); };
$('b-gs-next').onclick = function(){ stepGame(1); };
$('b-board-back').onclick = closeBoard;
$('b-prof-board').onclick = function(){ closeProfile(); openBoard(); };
$('b-home-board').onclick = function(){ openBoard(); };
$('o-stand').onclick = function(){ openBoard(modeOfRun(run), 's-over'); };
/* ONE TEAM OR ONE DECADE, or all of them. The empty value is all of them. */
$('bd-lock').onchange = function(){
  lbMode = { door: lbMode.door, key: this.value || null, day: null };
  paintBoard();
};
/* Tapping the scrim closes it, which is what a sheet is expected to do, but a
   tap INSIDE the panel must not, or every button press dismisses the thing. */
$('sheet').addEventListener('click', function(ev){ if (ev.target === $('sheet')) closeProfile(); });
$('clubsheet').addEventListener('click', function(ev){
  if (ev.target === $('clubsheet')) closeClubs(); });
$('erasheet').addEventListener('click', function(ev){
  if (ev.target === $('erasheet')) closeEras(); });
$('modesheet').addEventListener('click', function(ev){
  if (ev.target === $('modesheet')) closeModes(); });
$('b-modes').onclick = openModes;
$('b-mw-x').onclick = function(){ closeModes(); };
/* ANY PRESS INSIDE THE GRID LEAVES THE SHEET. Every tile goes somewhere (a
   screen, a picker, the offer), so the sheet shuts behind it. Bubble phase, so
   the tile's own handler has already run, and quietly, so focus is not pulled
   back to the door over whatever the tile just opened. */
$('mw-grid').addEventListener('click', function(ev){
  if (ev.target.closest && ev.target.closest('button')) closeModes(true); });
$('gamesheet').addEventListener('click', function(ev){
  if (ev.target === $('gamesheet')) closeGame(); });
/* ONE KEY, TWO SHEETS, and the club picker is the one that can be open over
   the profile is not: they are opened from different screens and never both.
   Escape closes whichever is up, and closing a shut sheet is a no-op, so the
   order does not matter. */
document.addEventListener('keydown', function(ev){
  if (ev.key !== 'Escape') return;
  closeProfile(); closeClubs(); closeEras(); closeGame(); closeModes();
  if (!$('frg').hidden) frgClose();
});

/* ── THE BRIDGE TO modes-ui.js ─────────────────────────────────────────────
 *
 * Conquest, Fix History and Six Passes are drawn by modes-ui.js, which loads
 * after this script and cannot see inside it. This is everything it is allowed
 * to reach, and it is deliberately a list of verbs rather than the page's
 * state: the modes have their own saves and never touch `run`, so a Conquest
 * run and a draft in progress can both be alive without either knowing. */
/* ── the front page's links ─────────────────────────────────────────────── */
(function wireHomeLinks(){
  $('b-home-career').onclick = function(){ openProfile(); };
  /* The rules card is folded at the foot of this page, so the link opens it
     rather than leaving for a second page that says the same thing. */
  $('b-home-howto').onclick = function(){
    var ht = $('home-howto');
    if (!ht) return;
    ht.open = true;
    ht.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  $('b-home-boards').onclick = function(){ openBoard(); };
  $('b-home-tour').onclick = function(){ frgOpen(); };
})();

/* THE OTHER MODES' FEATS. Conquest, Fix History and Six Passes file no row,
   so what they prove lands here instead: modes-ui.js asks badges.js for the
   feats and hands them over, and this writes them onto the career the same
   way recordRun does. What lit is said once, as a toast, and only to an
   account, because the cabinet is an account's. */
function recordFeats(f){
  var BG = window.RTF_BADGES;
  if (!BG || !f) return [];
  var before = loadCareer() || blankCareer();
  var c = loadCareer() || blankCareer();
  BG.applyFeats(c, f);
  stampDay(c, false);
  try { localStorage.setItem(PKEY, JSON.stringify(c)); } catch (e) {}
  cloudPushCareer(c);
  if (window.RTF_EARN) { try { window.RTF_EARN.badges(c); } catch (e) {} }
  var fresh = freshBadges(before, c);
  /* AFTER whatever the mode says about the moment itself, which is usually a
     toast of its own fired in the same tick. Said at once, the badge would be
     written over before anybody read it. */
  if (fresh.length && badgesOn()) {
    var line = fresh.length === 1 ? 'Badge: ' + fresh[0].name
      : fresh.length + ' badges: ' + fresh.map(function(b){ return b.name; }).join(', ');
    setTimeout(function(){ toast(line); }, 2300);
  }
  /* AN ARENA A MODE OPENED, said after the badge rather than over it. */
  var opened = badgesOn() ? freshArenas(before, c) : [];
  if (opened.length) {
    arenaChanged();
    setTimeout(function(){ toast('Arena unlocked: ' + opened[0].name + (opened.length > 1 ? ' and ' + (opened.length - 1) + ' more' : '')); }, fresh.length ? 5200 : 2300);
  }
  return fresh;
}

window.RTF_PAGE = {
  coins: function(){ renderCoins(); },
  get data(){ return DATA; },
  /* the career the badges are read off: Floor Rep and the daily loop read it */
  career: function(){ return loadCareer() || blankCareer(); },
  feats: recordFeats,
  confetti: fireConfetti,
  arenaChanged: arenaChanged,
  /* The shelf, for modes-ui.js: whether it can be written, the queue that
     writes it, and the policy that says what a slot means. */
  cloudMode: {
    ready: function(){ return !!CL && cloudReady(); },
    push: function(slot, build){ return cloudPush(slot, build); },
    CL: function(){ return CL; },
  },
  /* THE ARENAS, for the profile shelf in this file and for check-arenas.mjs.
     `force` is the checker's alone: it draws an arena whatever the account
     owns, so every floor and every scene can be looked at without playing to
     it. Nothing on the page calls it, which is window.RTF_LIVE's arrangement. */
  arena: {
    current: function(){ return currentArena(); },
    set: function(id){ setArena(id); },
    camera: function(){ return camera(); },
    setCamera: function(c){ setCamera(c); },
    info: function(){ return arenaInfo(); },
    force: function(id){ arenaForced = id || null; redressCourts(); },
    redress: function(){ redressCourts(); },
  },
  show: show,
  money: money,
  esc: esc,
  toast: toast,
  easternISO: easternISO,
  dayNumberOf: dayNumberOf,
  SHARE_URL: SHARE_URL,
  board: function(){ return B; },
  auth: function(){ return A; },
  openProfile: openProfile,
  openBoard: function(m){ openBoard(m); },
  goHome: function(){ show('s-home'); renderHome(); },
  /* The chip in the top bar, for a screen that is not the draft's. */
  bar: function(text){
    var st = $('ab-state');
    if (!st) return;
    st.hidden = !text;
    st.className = 'state';
    st.textContent = text || '';
  },
  shareText: function(text){
    if (navigator.share) {
      navigator.share({ text: text }).catch(function(err){
        if (err && err.name === 'AbortError') return;
        copyAndDownload(text, null);
      });
      return;
    }
    copyAndDownload(text, null);
  },
  /* A picture and its words, for Career's share card: the share sheet when it
     takes files, the text alone when it does not, and the clipboard and a
     download on a laptop. shareRun's own rules, for a blob drawn elsewhere. */
  shareImage: function(text, blob){
    var file = null;
    try { if (blob) file = new File([blob], 'run-the-floor.png', { type: 'image/png' }); } catch (e) { file = null; }
    var sheet;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) sheet = navigator.share({ text: text, files: [file] });
    else if (navigator.share) sheet = navigator.share({ text: text });
    else sheet = Promise.reject(new Error('no share sheet'));
    return sheet.catch(function(err){
      if (err && err.name === 'AbortError') return;
      copyAndDownload(text, blob);
    });
  }
};

rememberHomes();
/* READ OFF THE ENGINE, NEVER TYPED. Regulation over four quarters is the
   engine's own constant, and a 720 written here would be a second copy of it
   that goes stale the day anybody models a different league. */
LV_QUARTER = E.LIVE.REG_SECONDS / 4;
renderDock('s-home');
renderAppBar('s-home');
boot();
