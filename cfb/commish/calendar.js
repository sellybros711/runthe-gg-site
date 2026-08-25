/*
 * calendar.js - the sport's year as actual dates.
 *
 * The mode has always run on nine beats, which is the right unit for a docket and the wrong
 * unit for a player: "Portal and signing day" is a category, not a time, and pressing a
 * button to jump from one category to the next makes a five year term feel like a menu.
 * A commissioner does not move through categories. They move through a February.
 *
 * So the nine beats get real windows, the fourteen weeks of the season get real Saturdays,
 * and the page can walk a term one day at a time.
 *
 * ANCHORED TO THE REAL CALENDAR, because everybody who plays this knows where these things
 * sit. Week one is the Saturday on or after the twenty-eighth of August, which is what it
 * actually is; championship weekend is the Saturday after the last week of the regular
 * season; signing day is in February; media days are in July and everybody complains about
 * the heat. Getting those wrong is the same class of error as putting a school in the wrong
 * state, and it is just as visible to the people this is for.
 *
 * DERIVED, NEVER STORED. Everything here is a pure function of the year, so nothing has to
 * be serialised into a save and no two screens can disagree about what day it is. Dates are
 * built with explicit year, month and day arguments so the result does not depend on when
 * the code runs or where the reader is sitting.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_CALENDAR. Node: require('./calendar.js').
 */
(function (root) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var DAY = 86400000;
  function d(y, m, day) { return new Date(y, m, day); }
  function plus(date, n) { return new Date(date.getTime() + n * DAY); }
  function key(date) {
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
  }
  function sameDay(a, b) { return key(a) === key(b); }
  /* Whole days between two dates, ignoring the clock. Built off local midnight on both
     sides so a daylight saving boundary cannot produce a half day. */
  function between(a, b) {
    var x = d(a.getFullYear(), a.getMonth(), a.getDate());
    var y = d(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((y - x) / DAY);
  }

  /* WEEK ONE IS THE SATURDAY ON OR AFTER THE TWENTY-EIGHTH OF AUGUST, which is where it
     really falls: some years that is the thirtieth, some years the second of September. */
  function weekOne(year) {
    var x = d(year, 7, 28);
    while (x.getDay() !== 6) x = plus(x, 1);
    return x;
  }
  /* Week n of the regular season, then championship weekend as week fifteen. */
  function saturday(year, week) { return plus(weekOne(year), (week - 1) * 7); }

  /* WHERE EACH BEAT SITS. The four offseason beats are fixed dates in the calendar year; the
     five football beats are pinned to the Saturdays above so the window and the games inside
     it can never drift apart. `from` and `to` are both inclusive. */
  function windows(year) {
    var w1 = weekOne(year);
    var w5 = saturday(year, 5), w9 = saturday(year, 9), w14 = saturday(year, 14);
    var champ = saturday(year, 15);
    return [
      { beat: 0, name: 'Winter meetings', from: d(year, 0, 8), to: d(year, 0, 17) },
      { beat: 1, name: 'Portal and signing day', from: d(year, 0, 18), to: d(year, 1, 6) },
      { beat: 2, name: 'Spring', from: d(year, 2, 14), to: d(year, 3, 20) },
      { beat: 3, name: 'Media days', from: d(year, 6, 14), to: d(year, 6, 26) },
      { beat: 4, name: 'September', from: plus(w1, -4), to: w5 },
      { beat: 5, name: 'October', from: plus(w5, 1), to: w9 },
      { beat: 6, name: 'November', from: plus(w9, 1), to: w14 },
      { beat: 7, name: 'Championship weekend', from: plus(w14, 1), to: champ },
      /* The bracket runs from the week before Christmas into the middle of January, which is
         the one window that crosses a new year. */
      { beat: 8, name: 'The playoff', from: plus(champ, 6), to: plus(champ, 44) },
    ];
  }
  function windowFor(year, beat) {
    var all = windows(year);
    return all[Math.max(0, Math.min(all.length - 1, beat))];
  }

  /* Every day in a beat, as dates. Capped so a window nobody expected cannot hand the page
     a thousand element array to animate. */
  var MAX_DAYS = 60;
  function daysOf(year, beat) {
    var w = windowFor(year, beat);
    var out = [], x = w.from;
    while (out.length < MAX_DAYS && between(x, w.to) >= 0) { out.push(x); x = plus(x, 1); }
    return out;
  }

  /* WHAT HAPPENS ON A GIVEN DAY, as a line the ticker can read out. The football comes from
     the season the page has already simulated, so the day a game is shown on is the day its
     week actually falls on, and the offseason days are the ones anybody would name.

     Returns a map of date key to { text, kind }. */
  var OFFSEASON = {
    0: [[0, 8, 'The room gathers. Nobody has said anything on the record yet.'],
      [0, 13, 'Two conferences hold their own meetings first, which is the whole problem.'],
      [0, 16, 'The last of the committee reports land.']],
    1: [[0, 18, 'The portal window opens.'],
      [0, 24, 'Three hundred names in a week. Two of them matter.'],
      [1, 4, 'Signing day. Fax machines, hats on tables, and a lot of very tired assistants.']],
    2: [[2, 14, 'Spring practice opens across the country.'],
      [3, 3, 'Spring games. Eighty thousand people watch a scrimmage in Tuscaloosa.'],
      [3, 18, 'The last spring meetings before the summer.']],
    3: [[6, 14, 'Media days begin. Everybody is undefeated and everybody is uncomfortable.'],
      [6, 19, 'The preseason poll lands and three athletic directors ring this office.'],
      [6, 24, 'Camps open next week. The talking is nearly over.']],
  };

  function eventsFor(year, beat, sim) {
    var out = {};
    var fixed = OFFSEASON[beat] || [];
    fixed.forEach(function (f) { out[key(d(year, f[0], f[1]))] = { text: f[2], kind: 'note' }; });

    if (!sim) return out;
    /* THE FOOTBALL, ON THE SATURDAY IT WAS PLAYED. The biggest game of each week by audience,
       because a ticker that lists sixty scores is not a ticker. */
    (sim.weeks || []).forEach(function (wk) {
      if (!wk.games.length) return;
      var date = saturday(year, wk.week);
      var g = wk.games[0];
      out[key(date)] = {
        text: 'Week ' + wk.week + ': ' + g.winner.school + ' ' + Math.max(g.score[0], g.score[1])
          + ', ' + g.loser.school + ' ' + Math.min(g.score[0], g.score[1]),
        sub: wk.viewers.toFixed(1) + 'M watched the slate',
        kind: 'game',
      };
    });
    (sim.titles || []).forEach(function (t, i) {
      if (!t.game) return;
      var date = saturday(year, 15);
      var prev = out[key(date)];
      /* Six title games on one Saturday, so the biggest by audience wins the line. */
      if (!prev || (prev.viewers || 0) < t.game.viewers) {
        out[key(date)] = {
          text: t.conference + ' title: ' + t.team.school + ' win it',
          sub: t.game.viewers.toFixed(1) + 'M watched',
          kind: 'game', viewers: t.game.viewers,
        };
      }
    });
    if (sim.bracket && sim.bracket.rounds && beat === 8) {
      var champ = saturday(year, 15);
      sim.bracket.rounds.forEach(function (round, ri) {
        var date = plus(champ, 13 + ri * 10);
        var g = round.slice().sort(function (a, b) { return (b.viewers || 0) - (a.viewers || 0); })[0];
        if (!g) return;
        out[key(date)] = {
          text: (ri === sim.bracket.rounds.length - 1 ? 'The final: ' : 'Round ' + (ri + 1) + ': ')
            + g.winner.team.school + ' ' + Math.max(g.score[0], g.score[1]) + ', '
            + g.loser.team.school + ' ' + Math.min(g.score[0], g.score[1]),
          sub: (g.viewers || 0).toFixed(1) + 'M watched',
          kind: 'game',
        };
      });
    }
    return out;
  }

  /* WHICH DAY THE DECISION LANDS ON. Deterministic from the item and the year, so a beat
     replays to the same date, and never the first day of the window: something arriving on
     your desk the morning the window opens reads as scripted rather than as a thing that
     happened while you were working. */
  function decisionDay(year, beat, itemId) {
    var days = daysOf(year, beat);
    if (!days.length) return null;
    var h = 2166136261;
    var s = String(itemId || '') + '|' + year + '|' + beat;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    var first = Math.min(1, days.length - 1);
    var span = days.length - first;
    return days[first + (h % span)];
  }

  function label(date) { return SHORT[date.getMonth()] + ' ' + date.getDate(); }
  function longLabel(date) {
    return DOW[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()];
  }

  var api = {
    MONTHS: MONTHS, SHORT: SHORT, DOW: DOW,
    weekOne: weekOne, saturday: saturday,
    windows: windows, windowFor: windowFor, daysOf: daysOf,
    eventsFor: eventsFor, decisionDay: decisionDay,
    key: key, plus: plus, between: between, sameDay: sameDay,
    label: label, longLabel: longLabel,
  };
  root.PS_CFB_CALENDAR = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
