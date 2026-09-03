/* dayroll.js — pick up the new day without being told to reload.
 *
 * Every game captures its puzzle date exactly once, at parse:
 *
 *     var DATE = (window.RTGArchive ? RTGArchive.date() : todayStr());
 *
 * and never looks again. That is fine for a session that starts and ends the
 * same day, and wrong for the way people actually use a phone: the tab is
 * never closed. Lock the phone at night, open it in the morning, and iOS
 * restores the page from memory with yesterday's DATE still in it — same
 * board, same "played today" lock, same result screen. Every day. The end
 * modal even counts down "New boards in 00:00:00" and then does nothing when
 * it reaches zero, which is how this stayed invisible: the page looks like it
 * knows about tomorrow.
 *
 * So: when the page comes back to the foreground and the calendar day has
 * turned over since it loaded, reload it.
 *
 * Deliberately only on returning-to-foreground, never on a timer. Someone
 * playing straight through midnight is mid-puzzle, and yanking the board out
 * from under them to hand over a new one would be a worse bug than the one
 * this fixes. They finish the board they started; the next time they come
 * back to the tab, they get the new day.
 *
 * Archive mode is exempt — ?date= is a deliberate past date, not a stale one.
 */
(function () {
  'use strict';

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  var BOOT = today();
  var reloading = false;

  function inArchive() {
    try { return !!(window.RTGArchive && RTGArchive.active && RTGArchive.active()); }
    catch (e) { return false; }
  }

  function check() {
    if (reloading || document.hidden || inArchive()) return;
    if (today() === BOOT) return;
    reloading = true;
    try { location.reload(); } catch (e) { reloading = false; }
  }

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  // bfcache restore (iOS's usual path back into a backgrounded tab) doesn't
  // always fire visibilitychange, so catch pageshow too.
  window.addEventListener('pageshow', check);

  window.RTGDayRoll = { bootDate: function () { return BOOT; }, check: check };
})();
