/*
 * simspeed.js - how fast a playoff game plays out, in both football games.
 *
 * Reported by players: the playoff broadcast goes by too fast to follow. Each round's pace is
 * tuned on the page (the PACE table in football/index.html and cfb/index.html, LIVE_PACE for
 * the Full Team board), and this is one multiplier over all of them. It slows the FOOTBALL:
 * the clock, the holds on a score, the breaks. It never decides anything, because every game
 * shown here is already settled before the broadcast starts.
 *
 * ONE SETTING FOR BOTH GAMES. Both pages are on one origin, so somebody who slows the NFL
 * playoffs finds the college playoffs slow too, which is what a person who asked for it means.
 * It is a device setting, like a volume knob, and is never synced to the account.
 *
 * A page reads it as `window.RTG_SPEED ? RTG_SPEED.mul() : 1`, so a blocked or stale copy of
 * this file is the normal speed rather than a broken broadcast.
 *
 * Every <button data-simspeed> on the page is the control: pressing one steps through the
 * speeds and every other one on the page follows.
 */
(function () {
  var KEY = 'rtg_simspeed_v1';
  var SPEEDS = [
    { id: 'normal', label: 'Normal', mul: 1 },
    { id: 'slow',   label: 'Slow',   mul: 1.6 },
    { id: 'slower', label: 'Slower', mul: 2.4 },
  ];
  var mem = null;

  function idx() {
    var id = mem;
    if (id == null) { try { id = localStorage.getItem(KEY); } catch (e) {} }
    for (var i = 0; i < SPEEDS.length; i++) if (SPEEDS[i].id === id) return i;
    return 0;
  }
  function set(i) {
    var id = SPEEDS[i].id;
    mem = id;
    try { localStorage.setItem(KEY, id); } catch (e) {}
    paint();
  }
  function paint() {
    var s = SPEEDS[idx()];
    var btns = document.querySelectorAll('[data-simspeed]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = 'Speed: ' + s.label;
      btns[i].setAttribute('aria-label', 'Game speed: ' + s.label + '. Press to change.');
      btns[i].setAttribute('data-speed', s.id);
    }
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-simspeed]');
    if (!b) return;
    ev.preventDefault();
    set((idx() + 1) % SPEEDS.length);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();

  window.RTG_SPEED = {
    API_VERSION: 1,
    SPEEDS: SPEEDS,
    mul: function () { return SPEEDS[idx()].mul; },
    id: function () { return SPEEDS[idx()].id; },
    set: function (id) { for (var i = 0; i < SPEEDS.length; i++) if (SPEEDS[i].id === id) set(i); },
    paint: paint,
  };
})();
