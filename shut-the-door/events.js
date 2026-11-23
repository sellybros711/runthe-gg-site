/* Shut The Door: the game events (the Advisor's review of 2026-11-16, section 9: the game sent
   none, so its players could not be counted).

     outing_start   the mound is up for an outing: {mode, day, resumed}
     pitch          a pitch has resolved (the engine answered): {mode, day, pitch_no, result}
     outing_end     an outing started on this page view is over: {mode, day, result, pitches, score_band}
     daily_done     the day's daily is over, the same moment as its outing_end: {day, result, pitches, score_band}
     share          a share went out from the result's share sheet: {mode, day, method}
     promo_click    the result's Run The Diamond card was tapped: {target, mode, day}
     voice_open     the voice of the ump's record sheet opened from a button: {source}
     voice_sent     a call went to the owner's review from that sheet: {line, method}

   mode is daily, survivor, archive or practice. day is the daily number (#N): today's for a daily,
   practice or Survivor, the past day's for the archive. result on a pitch is the engine's call
   result (ball, called_strike, in_play and the rest), on an outing its outcome (door_shut,
   tie_held, doors_open, walk_off). score_band is the percentile in tens (0, 10 ... 90). method is
   image (the phone's share sheet), save (the image downloaded) or text (the text copied or shared).
   target is the game the card leads to (baseball). source is where the sheet was opened from (home,
   result or settings). line is the script's line id (strike, ball4 and the rest, voices.js LINES),
   never the audio. method is record (the mic) or upload (a file).
   Nothing about the player: no id, no name, no email, no free text.

   The names follow the site's GA4 style (snake_case, as football's game_started and the arcade's
   arcade_share; share is GA4's own recommended event, with its method). Every event carries
   game_name, as the page's gtag set already does.

   It sends through the page's own gtag and nothing else: the site's one GA property, loaded under
   the Consent Mode defaults at the top of index.html, so consent is whatever the site's consent
   mode already does. No new tracker and no new script from another host. With no gtag on the page
   (offline, a test) it does nothing.

   Never in the way of play: each send is deferred off the game's own call (setTimeout 0) and
   swallowed on any error, nothing waits on it, and nothing here reads or changes the game's state.
   The one exception is promo_click: its link leaves the page, so it goes at once, as a beacon (the
   arcade's metrics.js does the same for a page going away), and a deferred send would be lost. */
(function () {
  'use strict';
  var GAME = 'Shut The Door';
  var started = {}, ended = {}, pitched = {}, dailies = {};

  function send(ev, p, now) {
    try {
      if (typeof window.gtag !== 'function') return;
      var o = { game_name: GAME };
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k) && p[k] != null) o[k] = p[k];
      if (now) { o.transport_type = 'beacon'; window.gtag('event', ev, o); return; }
      setTimeout(function () { try { if (typeof window.gtag === 'function') window.gtag('event', ev, o); } catch (e) {} }, 0);
    } catch (e) {}
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  /* the percentile in tens: 0..9 is 0, 90..100 is 90 */
  function band(p) { p = num(p); return p == null ? null : Math.max(0, Math.min(90, Math.floor(p / 10) * 10)); }

  /* the mound is up for this outing. Once per outing on a page view: a resumed daily says resumed */
  function outingStart(id, mode, day, pitchNo) {
    if (id == null || started[id]) return;
    started[id] = true;
    send('outing_start', { mode: mode, day: num(day), resumed: (num(pitchNo) || 0) > 0 });
  }
  /* the engine answered a pitch. Once per pitch of an outing started here */
  function pitch(id, mode, day, pr) {
    if (id == null || !started[id] || !pr) return;
    var key = id + ':' + pr.n;
    if (pitched[key]) return;
    pitched[key] = true;
    send('pitch', { mode: mode, day: num(day), pitch_no: num(pr.n), result: pr.result || null });
  }
  /* the outing is over, with its result. Only an outing started on this page view (a finished one
     reopened from the home is not a new end), once; a daily also sends daily_done, once a day */
  function outingEnd(id, mode, day, r) {
    if (id == null || !started[id] || ended[id] || !r) return;
    ended[id] = true;
    var f = { result: r.outcome || null, pitches: num(r.pitches), score_band: band(r.percentile) };
    send('outing_end', { mode: mode, day: num(day), result: f.result, pitches: f.pitches, score_band: f.score_band });
    if (mode === 'daily' && !dailies[day]) {
      dailies[day] = true;
      send('daily_done', { day: num(day), result: f.result, pitches: f.pitches, score_band: f.score_band });
    }
  }
  function share(mode, day, method) { send('share', { mode: mode, day: num(day), method: method }); }
  function promo(target, mode, day) { send('promo_click', { target: target, mode: mode, day: num(day) }, true); }
  function voiceOpen(source) { send('voice_open', { source: source }); }
  function voiceSent(line, method) { send('voice_sent', { line: line, method: method }); }

  window.STD_EVENTS = { outingStart: outingStart, pitch: pitch, outingEnd: outingEnd, share: share, promo: promo, voiceOpen: voiceOpen, voiceSent: voiceSent, band: band };
})();
