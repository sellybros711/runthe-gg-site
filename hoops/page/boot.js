var E = window.RTF_ENGINE, R = window.RTF_RUN;
var DATA = null, run = null, board = [];

var $ = function(id){ return document.getElementById(id); };
/* A WHOLE NUMBER OF MILLIONS IS WRITTEN WHOLE. "$120.0M" is how a spreadsheet
   writes a salary cap and "$120M" is how a basketball fan does, so the decimal
   only appears when there is something in it. */
var money = function(v){
  var r = Math.round(v * 10) / 10;
  return '$' + (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)) + 'M';
};

/* A ROSTER COUNT, AS AN ENGLISH WORD, IN ONE PLACE.
 *
 * This page prints how many men a roster holds in ordinary sentences, and a
 * sentence cannot interpolate a digit without reading like a spec: "sign 5
 * players" is not how anybody says it. So it was written out as "Six" and
 * "six" wherever it came up, and the day the roster went from six men to five
 * every one of those became a page describing a game it was not running.
 *
 * That is this repo's oldest rule (when a number is in copy, either
 * interpolate it or write the sentence without it) meeting the one case where
 * interpolating a digit is worse than the problem. The answer is to
 * interpolate the WORD. `cap` capitalises it for the start of a sentence.
 *
 * It answers a digit past twelve rather than throwing, because a wrong-looking
 * "13" in a sentence is a smaller failure than a page that will not boot. */
var NUMWORD = function(n, cap){
  var words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  var w = (n >= 0 && n < words.length) ? words[n] : String(n);
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
};
var bold = function(text){
  var b = document.createElement('b');
  b.textContent = text;
  return b;
};

/* ── THE PAGE AND ITS SCRIPTS HAVE TO BE THE SAME AGE ──────────────────────
 *
 * index.html revalidates on every visit and engine.js and run.js do not, which
 * is the whole reason those two carry a hand-written ?v= and why CI checks it.
 * The version is the FIX; this is the net underneath it.
 *
 * A returning visitor can hold a cached engine.js against a current page, and
 * the two do not have to be compatible. That has already shipped once on this
 * site, in the football game, as a draft screen that threw with no players on
 * it and nothing on screen to say why. It is invisible on a development machine
 * because a developer's browser has never seen the old file.
 *
 * So: reload ONCE with a fresh query to shake the cache, and if the copy that
 * comes back still disagrees, say so in words instead of dying quietly. One
 * retry, so this can never become a reload loop.
 */
var NEED_VERSION = 9;
(function bootCheck(){
  if (E && R && E.API_VERSION === NEED_VERSION && R.API_VERSION === NEED_VERSION) return;
  if (!/[?&]fresh=/.test(location.search)) {
    location.replace(location.pathname + '?fresh=' + Date.now());
    throw new Error('reloading for a fresh copy');
  }
  document.body.innerHTML = '<div class="wrap"><div class="card" style="margin-top:40px">'
    + '<h2>Out of date</h2><p class="dim" style="font-size:14px;margin:8px 0 0">This page is '
    + 'running an old copy of the game that your browser saved. Close the tab and open it '
    + 'again to pick up the current version.</p></div></div>';
  throw new Error('version mismatch: page needs ' + NEED_VERSION
    + ', engine ' + (E && E.API_VERSION) + ', run ' + (R && R.API_VERSION));
})();

/* THE TWO PHRASES PRINTED FROM MORE THAN ONE PLACE, once each.
 *
 * "Your five" names the player's own side on the bracket and again in the box
 * score, and the daily's dare is the same sentence in `shareText` and in
 * `shareDaily`. Both were written out twice, and both survived the roster
 * going from six men to five twice, for the reason anything written twice
 * survives an edit.
 *
 * BELOW THE BOOT CHECK AND NOT BESIDE NUMWORD, which is where they were
 * written first. They read `E.SLOTS`, and the whole point of the check above
 * is that a blocked or stale engine.js is met with a reload rather than a
 * crash: evaluated before it, a missing engine is a TypeError on line one and
 * the page is blank instead of self-healing. */
var YOUR_LOT = 'Your ' + NUMWORD(E.SLOTS.length);
var DAILY_DARE = 'Everyone got the same ' + NUMWORD(E.SLOTS.length) + ' spins.';

/* ── THE OTHER PAIR OF HAND-WRITTEN NUMBERS, AND IT IS THE SILENT ONE ──────
 *
 * The check above fails LOUDLY, as a missing function on somebody's phone, and
 * it is allowed to take the page down because a game whose engine disagrees
 * with its page is not a game. The board is the opposite: it is optional by
 * design, so a board.js that is blocked, or a version behind, has to degrade to
 * "not reachable" rather than taking the game with it.
 *
 * WHICH IS WHAT MAKES IT THE DANGEROUS ONE. The football game shipped this
 * exact mismatch for a release: adding two functions moved board.js to
 * API_VERSION 17 while the page still asked for 16, so EVERY visitor ran on the
 * stub, the leaderboard printed the stub's own error and the profile's numbers
 * came back as dashes. Nothing threw, no check went red, and the site looked
 * exactly like a site whose network was having a bad day. Reported by a player.
 *
 * check-cachebust.mjs holds the pair now, by reading this comparison out of the
 * page and resolving RTF_BOARD to whichever script here assigns it. Bump both
 * in one commit.
 *
 * THE STUB ANSWERS null TO EVERYTHING, which is the same thing every real call
 * in board.js answers when it fails, so no caller needs a second shape to
 * handle. It is also what carries the diagnosis: `lastError` says which of the
 * two halves is missing, in words, on the screen that would otherwise just be
 * empty. */
var NEED_BOARD = 7;
var B = (window.RTF_BOARD && window.RTF_BOARD.API_VERSION === NEED_BOARD)
  ? window.RTF_BOARD
  : {
      API_VERSION: NEED_BOARD,
      submit: function(){ return Promise.resolve(null); },
      claim: function(){ return Promise.resolve(false); },
      ranks: function(){ return Promise.resolve({ place: null, total: null, played: null }); },
      top: function(){ return Promise.resolve(null); },
      list: function(){ return Promise.resolve(null); },
      total: function(){ return Promise.resolve(null); },
      jerseys: function(){ return Promise.resolve(null); },
      modeOf: function(m){ return m || { door: 'league', key: null, day: null }; },
      mine: function(){ return Promise.resolve(null); },
      boards: function(){ return Promise.resolve(null); },
      submitFix: function(){ return Promise.resolve(null); },
      submitPasses: function(){ return Promise.resolve(null); },
      submitConquest: function(){ return Promise.resolve(null); },
      claimPlay: function(){ return Promise.resolve(false); },
      playTop: function(){ return Promise.resolve(null); },
      playList: function(){ return Promise.resolve(null); },
      playCount: function(){ return Promise.resolve(null); },
      playPlace: function(){ return Promise.resolve(null); },
      moveCount: function(){ return Promise.resolve(null); },
      submitCareer: function(){ return Promise.resolve(null); },
      claimCareer: function(){ return Promise.resolve(false); },
      careerList: function(){ return Promise.resolve(null); },
      careerCount: function(){ return Promise.resolve(null); },
      careerPlace: function(){ return Promise.resolve(null); },
      scoreOf: function(){ return null; },
      offline: true,
      lastError: { where: 'boot', status: 0, code: 'version',
        message: window.RTF_BOARD
          ? ('board.js is API ' + window.RTF_BOARD.API_VERSION + ', this page needs ' + NEED_BOARD)
          : 'board.js did not load' },
      needsMigration: false,
    };
/* Same shape for accounts, and for the same reason: a blocked CDN must cost a
   name on a row rather than the sheet it sits in. `waiting` false and `ready`
   false is the honest answer when the file itself is not here. */
var A = window.RTF_AUTH || {
  boot: function(){ return false; },
  state: function(){ return { ready: false, waiting: false, signedIn: false }; },
  onChange: function(){ return function(){}; },
  token: function(){ return null; },
  claim: function(){ return Promise.resolve(false); },
};

/* AND THE SHELF, PINNED THE SAME WAY THE BOARD IS. cloud.js decides what a merge
 * keeps, and a page running one version of that rule against a script holding
 * another is the quietest failure on this page: nothing throws, every screen
 * renders, and the only symptom is a cabinet that comes back slightly wrong.
 * `null` is the honest answer when either half is missing, and every caller
 * below is written to do nothing at all when it is. */
var NEED_CLOUD = 6;
var CL = (window.RTF_CLOUD && window.RTF_CLOUD.API_VERSION === NEED_CLOUD)
  ? window.RTF_CLOUD : null;
var SV = window.RTG_SAVE || null;

/* AN UNHANDLED ERROR IN OUR CODE SAYS SO ON SCREEN. A silent throw mid-draft
 * looks exactly like the game being broken with no explanation, which is how
 * the cache problem above went unreported for as long as it did.
 *
 * IT HAS TO BE OUR CODE. The same banner in the football game fired over a
 * perfectly good results screen reading "Something broke: Script error.", which
 * is the browser's sanitized report of an error inside a CROSS-ORIGIN script: a
 * content blocker, an extension, or the code an in-app browser injects when a
 * link is opened from a messaging app. The spec strips the message, the file
 * and the line from those deliberately, so there is nothing to act on and
 * nothing worth telling anybody. Alarming a player because their messaging app
 * ran its own script is worse than saying nothing at all.
 *
 * Three things are filtered and everything else still shows:
 *   a resource that would not load, which arrives on this same event with an
 *     element as the target and no message
 *   an opaque cross-origin script error, recognizable by having no filename
 *   an error whose filename is not on this origin
 */
window.addEventListener('error', function(ev){
  if (ev.target && ev.target !== window) return;
  var msg = ev.message || '';
  if (!msg) return;
  if (/^script error/i.test(msg) && !ev.filename) return;
  if (ev.filename && ev.filename.indexOf(location.origin) !== 0) return;
  var el = $('crash');
  if (!el || el.style.display === 'block') return;
  el.style.display = 'block';
  el.textContent = 'Something broke: ' + msg + '. Tap to dismiss, or reload to start again.';
});

/* THE TITLE BELONGS ON THE TITLE SCREEN. It is 230px of masthead above every
   screen in the game, which on a phone is most of the space between the top of
   the draft and the first player on the board. Home keeps it; the screens you
   are playing on do not. */
function show(id){
  document.body.classList.toggle('inplay', id !== 's-home');
  /* The modes sheet opens over the front page and every tile in it leaves it,
     so a screen change always puts the grid back where it lives. */
  closeModes(true);
  /* A running reveal belongs to the screen it started on. Leaving without
     stopping it leaves an interval painting cells nobody can see, and on the
     way back it would race the fresh one. The front page's animation is the
     same problem in the other direction: it spins reels behind the draft,
     forever, on a phone. */
  stopSim();
  /* A LIVE GAME AND A BRACKET WALK BELONG TO THEIR OWN SCREENS, for the same
     reason the season reveal above does and with a worse failure. Left
     running, the bracket goes on deciding rounds nobody is watching, and a
     live game plays itself to the horn and RECORDS the result: somebody who
     pressed the wordmark in the middle of a Game 7 would come back to a
     series that had moved without them. Stopped rather than ended: the
     bracket is still at that game, so coming back offers the same door. */
  if (id !== 's-live' && LV && LV.timer) { clearTimeout(LV.timer); LV.timer = null; }
  if (id !== 's-brk') stopBracket();
  /* The reels spin on the front page and only while it is showing: a loop
     left running behind the draft spins reels nobody can see, on a phone. */
  heroStop();
  if (window.RTF_MODES_UI) window.RTF_MODES_UI.leave(id);
  /* The club belongs to the draft. The season, the results and the home screen
     have no club, and a results screen still wearing the last team you spun is
     claiming that team played the season. */
  if (id !== 's-draft') undressPage();
  var all = document.querySelectorAll('.screen');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
  $(id).classList.add('active');
  renderDock(id);
  renderAppBar(id);
  if (id === 's-home') heroStart();
  window.scrollTo(0, 0);
  pipsFollowCourt();
}
