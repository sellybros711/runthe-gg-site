/* Run The Arcade: the five numbers the product is judged on.

   Three of them were already sent and are left where they are:
     arcade_game_started    tokens.js, when a play is spent (the first move)
     arcade_game_completed  board.js, when a finished run is scored
     arcade_share           share.js, when Share is pressed (text or image)

   Except that board.js only sends arcade_game_completed for a run a game
   submits, and most games submit only a win or a score above zero. So a lost
   run finished with no completion at all, and a report would read a hard day
   as a game nobody finishes. This file sends it for those, with
   submitted:false (board.js's own carry submitted:true), when the result
   sheet opens on a game played on this page view.

   This file adds the three that were missing:
     arcade_first_move      how long the page was open before the first move,
                            and whether it was the first try of the day
     arcade_abandon         a game in progress was left (the tab hidden or the
                            page closed), with how far in it was: seconds since
                            the first move and how many taps and keys went in
     arcade_return          the first arcade page of a day, with how many days
                            since the last one (next_day is true for exactly 1)

   Every event carries game_name, tier (guest, free or card) and, on a game
   page, arcade_game in the same words the other three use. Nothing is stored
   but one date (rtg:visit:v1), and nothing is sent without gtag, which the
   page only loads under its consent defaults. Inert offline and in tests. */
(function(){
  'use strict';
  var T = window.RTGTokens || null;
  var m = /^\/arcade\/([a-z]+)\//.exec(location.pathname || '');
  var GAME = (m && T && T.GAMES && T.GAMES.indexOf(m[1]) >= 0) ? m[1] : '';

  function send(ev, p, beacon){
    try{
      if (typeof window.gtag !== 'function') return;
      var o = { game_name: 'Run The Arcade' };
      try { o.tier = T && T.tier ? T.tier() : 'guest'; } catch (e) { o.tier = 'guest'; }
      if (GAME) o.arcade_game = (T && T.gaName) ? T.gaName(GAME) : GAME;
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
      // a page that is going away only gets its event out as a beacon
      if (beacon) o.transport_type = 'beacon';
      window.gtag('event', ev, o);
    }catch(e){}
  }
  var now = function(){ return (window.performance && performance.now) ? performance.now() : Date.now(); };

  /* ---- next-day return -------------------------------------------------- */
  function dayNum(s){ var p = String(s || '').split('-'); return p.length === 3 ? Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5 : NaN; }
  /* On the hub this file loads in the head and the consent defaults and gtag
     come later in the body, so the day is checked once the page is parsed.
     Sent early, the event would be dropped and the day stored anyway, and that
     return would never be counted. */
  function checkReturn(){
    try{
      var today = T && T.today ? T.today() : '';
      if (!today) return;
      var KEY = 'rtg:visit:v1', last = '';
      try { last = (JSON.parse(localStorage.getItem(KEY) || '{}') || {}).last || ''; } catch (e) {}
      if (last === today) return;
      var gap = Math.round(dayNum(today) - dayNum(last));
      if (last && gap > 0) send('arcade_return', { gap_days: gap, next_day: gap === 1 });
      try { localStorage.setItem(KEY, JSON.stringify({ last: today })); } catch (e) {}
    }catch(e){}
  }
  if (typeof window.gtag === 'function' || document.readyState !== 'loading') checkReturn();
  else document.addEventListener('DOMContentLoaded', checkReturn);

  if (!GAME) return;

  /* ---- first move, and where a game was left ----------------------------- */
  // A page reloaded mid-game resumes it: its first move happened on another
  // page view, so it counts from the moment the page opened.
  var resumed = false;
  try { resumed = !!(T && T.inProgress && T.inProgress(GAME)); } catch (e) {}
  var startedAt = resumed ? 0 : -1, inputs = 0, gone = false;
  var sentAtStart = 0, doneSent = false;
  var boardSent = function(){ return window.RTGCompletedSent || 0; };

  document.addEventListener('rtg:firstmove', function(e){
    var d = (e && e.detail) || {};
    if (d.game && d.game !== GAME) return;
    startedAt = now(); inputs = 1; gone = false;
    sentAtStart = boardSent(); doneSent = false;
    send('arcade_first_move', { ms_to_first_move: Math.round(startedAt), try_no: d.tryNo || 1, first_try: (d.tryNo || 1) === 1 });
  });

  // Taps and keys on the game itself. The site's own chrome (the banner, the
  // header, the strip, the bottom nav) is not playing.
  var CHROME = '.rtg-topbanner, .topbar, .rtggh-strip, .rtgnav, .rtgHowto-scrim';
  function count(e){
    if (startedAt < 0) return;
    var t = e.target;
    if (t && t.closest && t.closest(CHROME)) return;
    if (e.type === 'keydown' && (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.repeat)) return;
    inputs++;
  }
  document.addEventListener('pointerdown', count, true);
  document.addEventListener('keydown', count, true);

  function left(){
    if (gone || startedAt < 0) return;
    var going = false;
    try { going = !!(T && T.inProgress && T.inProgress(GAME)); } catch (e) {}
    if (!going) return;                       // finished or given up: not abandoned
    gone = true;
    send('arcade_abandon', { seconds_in: Math.round((now() - startedAt) / 1000), inputs: inputs, resumed: resumed }, true);
  }
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') left(); });

  /* ---- a finish board.js did not count ------------------------------------ */
  // The result sheet is the end of a run in every game (result.js watches the
  // same two elements). Give the game a moment to submit first: if board.js
  // counted it, nothing more is sent.
  function sheetOpen(){
    var sc = document.getElementById('scrim'), rm = document.getElementById('resultModal');
    var on = (sc && !sc.classList.contains('hidden') && !sc.hasAttribute('hidden')) || (rm && !rm.hasAttribute('hidden'));
    return !!(on && window.RTGResultSpec);
  }
  function onSheet(){
    if (doneSent || startedAt < 0 || !sheetOpen()) return;
    doneSent = true;
    var at = now();
    setTimeout(function(){
      if (boardSent() > sentAtStart) return;
      send('arcade_game_completed', { posted: false, submitted: false, seconds: Math.max(0, Math.round((at - startedAt) / 1000)) });
    }, 1500);
  }
  function watchSheet(){
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(onSheet);
    ['scrim', 'resultModal'].forEach(function(id){
      var e = document.getElementById(id);
      if (e) mo.observe(e, { attributes: true, attributeFilter: ['class', 'hidden'] });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchSheet); else watchSheet();
  window.addEventListener('pagehide', left);
})();
