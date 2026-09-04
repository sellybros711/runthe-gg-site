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

     Returns a map of date key to { text, kind, icon }.

     THE ICON IS THE POINT OF THE GRID. A square with a number in it says a day went past; a
     square with a football in it says what the day was. The player is watching a month go by
     at a glance, so the shape has to carry the meaning before the ticker line is read, and
     the icons have to be things anybody would name: a ball, a trophy, a microphone, a pen.
     Every entry below carries one, and `eventsFor` never returns an event without one. */
  /* ---- the eight months nobody plays a game in ----
     THE OFFSEASON WAS FOUR FIXED SENTENCES A BEAT, the same four every year of every term,
     with not one real school in any of them. A player watched a month walk past and said the
     mode "just skips through the fun parts of a real season", and wanted what actually happens
     between January and August: quarterbacks moving somewhere better, signing day, camp.

     So a line may be a function of the league instead of a string. It is handed the schools
     that exist THIS year, split into the ones with money and everybody else, plus a `pick`
     that draws a school deterministically from the year and the slot. The same beat in the
     same year reads the same way; the next year reads differently; and every name in it is a
     school actually in the sport at that moment, so a line cannot name a conference that has
     been dissolved by a ruling three years ago.

     PLACES ARE REAL AND PEOPLE ARE NOT, which is the rule the whole mode already runs on. A
     quarterback here is "the starting quarterback at Kansas", never a name: inventing a
     transfer for somebody who exists and is twenty is the one thing this file must not do. */
  function offHash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  /* A DRAW THAT DOES NOT REPEAT ITSELF INSIDE ONE LINE. `pick(pool, n)` returns the nth
     distinct school out of that pool for this slot, so "X to Y" is never "X to X". */
  function drawer(seed) {
    return function (pool, n) {
      if (!pool || !pool.length) return '';
      var k = offHash(seed + '|' + (n || 0)) % pool.length;
      return pool[(k + (n || 0) * 7) % pool.length];
    };
  }

  var OFFSEASON = {
    0: [[0, 8, 'The room gathers. Nobody has said anything on the record yet.', 'gavel'],
      [0, 11, 'Budget subcommittee. Four hours, one decision, and it was the wrong one.', 'gavel'],
      /* THE TWO THAT CAN END YOU, so it draws from the leagues with votes rather than from
         every conference in the sport. The first run of this offered "the Conference USA and
         the Big 12 hold their own meetings first, which is the whole problem", which is not a
         problem anybody has. */
      [0, 13, function (c, p) {
        return 'The ' + (p(c.powers, 0) || 'SEC') + ' and the ' + (p(c.powers, 1) || 'Big Ten')
          + ' hold their own meetings first, which is the whole problem.';
      }, 'gavel'],
      [0, 16, 'The last of the committee reports land.', 'note']],
    1: [[0, 18, 'The portal window opens.', 'portal'],
      /* THE ONE EVERYBODY ACTUALLY WATCHES FOR. A starting quarterback leaving somewhere for
         somewhere richer is the defining event of this month in the real sport, and the mode
         described it without naming either end. */
      [0, 20, function (c, p) {
        return 'The starting quarterback at ' + (p(c.small, 0) || 'a Group of Five school')
          + ' enters at eleven at night. He is at ' + (p(c.elite, 1) || 'a power school')
          + ' by breakfast.';
      }, 'portal'],
      [0, 22, function (c, p) {
        return (p(c.big, 2) || 'A power school') + ' loses three starters in a morning and '
          + 'signs four by dinner.';
      }, 'portal'],
      [0, 24, 'Three hundred names in a week. Two of them matter.', 'portal'],
      [0, 26, function (c, p) {
        return 'A receiver leaves ' + (p(c.big, 3) || 'one power school') + ' for '
          + (p(c.big, 4) || 'another') + ' and both fanbases claim they won it.';
      }, 'portal'],
      [0, 30, 'The portal window shuts. Everybody counts what is left.', 'portal'],
      [1, 4, function (c, p) {
        return 'Signing day. The best class in the country belongs to '
          + (p(c.elite, 5) || 'the usual place') + ', and nobody is surprised.';
      }, 'pen']],
    2: [[2, 14, 'Spring practice opens across the country.', 'whistle'],
      [2, 20, function (c, p) {
        return 'The coach at ' + (p(c.big, 0) || 'a power school')
          + ' is already calling this the best camp he has had.';
      }, 'whistle'],
      [2, 28, function (c, p) {
        return (p(c.small, 1) || 'A Group of Five school')
          + ' hires away a coordinator and gets a raise out of it for everybody else.';
      }, 'whistle'],
      [3, 3, function (c, p) {
        return 'Spring games. Eighty thousand people watch a scrimmage at '
          + (p(c.elite, 2) || 'Alabama') + '.';
      }, 'whistle'],
      [3, 18, 'The last spring meetings before the summer.', 'gavel']],
    3: [[6, 14, 'Media days begin. Everybody is undefeated and everybody is uncomfortable.', 'mic'],
      [6, 16, function (c, p) {
        return 'The coach at ' + (p(c.big, 0) || 'a power school')
          + ' is asked about the playoff eleven times and answers a twelfth.';
      }, 'mic'],
      [6, 19, function (c, p) {
        return 'The preseason poll lands with ' + (p(c.elite, 1) || 'somebody') + ' first and '
          + 'three athletic directors ring this office about it.';
      }, 'note'],
      [6, 21, function (c, p) {
        /* NO INDEFINITE ARTICLE IN FRONT OF A CONFERENCE NAME. "A SEC coach" and "A ACC
           coach" are both wrong and which one is wrong depends on the draw, so the sentence
           is built to not need one. */
        return 'A coach in the ' + (p(c.powers, 2) || 'Big 12') + ' says the quiet part into a '
          + 'live microphone and spends the afternoon explaining it.';
      }, 'mic'],
      [6, 24, 'Camps open next week. The talking is nearly over.', 'whistle']],
  };

  /* `league` IS OPTIONAL AND EVERY LINE HAS A FALLBACK. The page passes it; the guards call
     eventsFor with two arguments in half a dozen places, and a calendar that throws because
     nobody handed it a membership would take the whole office down over a ticker line. */
  function eventsFor(year, beat, sim, league) {
    var out = {};
    var lg = league || {};
    var ctx = {
      big: lg.big || [], small: lg.small || [],
      confs: lg.confs || [], schools: lg.schools || [],
      /* The schools people show up for, and the leagues that hold votes. See leagueNow(). */
      elite: (lg.elite && lg.elite.length) ? lg.elite : (lg.big || []),
      powers: (lg.powers && lg.powers.length) ? lg.powers : (lg.confs || []),
    };
    var fixed = OFFSEASON[beat] || [];
    fixed.forEach(function (f, i) {
      var pick = drawer(year + '|' + beat + '|' + i);
      var text = typeof f[2] === 'function' ? f[2](ctx, pick) : f[2];
      out[key(d(year, f[0], f[1]))] = { text: text, kind: 'note', icon: f[3] || 'note' };
    });

    if (!sim) return out;
    /* THE FOOTBALL, ON THE SATURDAY IT WAS PLAYED.
       ONE GAME A WEEK WAS TOO FEW. The Saturday tick showed the biggest game by audience and
       nothing else, so a whole week of a sixty game slate arrived as a single line and the
       season read as a thing being skipped past rather than played: "maybe instead of 1 game
       it should give you the ranked games that were played in a list."

       So it is the RANKED slate, up to five, which is exactly what a Saturday in this sport
       is: the games between teams somebody had an opinion about on Friday. Ordered by whether
       both sides were ranked and then by the better of the two rankings, because two ranked
       teams playing each other is the game of the day whatever the audience says, and audience
       is a consequence of that rather than a reason for it.

       THE POLL USED IS THE ONE PEOPLE HAD GOING IN, `polls[week - 1]`, not the one written
       afterwards. Ranking a game by where the loser ended up on Sunday is hindsight, and the
       whole appeal of a ranked matchup is that it was ranked before anybody played. */
    var RANKED_MAX = 5;
    (sim.weeks || []).forEach(function (wk) {
      if (!wk.games.length) return;
      var date = saturday(year, wk.week);
      var poll = (sim.polls || [])[wk.week - 1];
      var rankOf = {};
      if (poll && poll.top) {
        poll.top.forEach(function (r) { rankOf[r.school] = r.rank; });
      }
      var scored = wk.games.map(function (g) {
        var rw = rankOf[g.winner.school] || 0, rl = rankOf[g.loser.school] || 0;
        return { g: g, rw: rw, rl: rl, both: !!(rw && rl), best: Math.min(rw || 99, rl || 99) };
      }).filter(function (x) { return x.best < 99; });
      scored.sort(function (x, y) {
        return (y.both ? 1 : 0) - (x.both ? 1 : 0) || x.best - y.best || y.g.viewers - x.g.viewers;
      });
      var pick = scored.slice(0, RANKED_MAX);
      /* NOTHING RANKED PLAYED, which happens in a week one built out of guarantee games. The
         biggest audience is then the only honest headline, and saying so is better than an
         empty list under a heading that promises one. */
      var fallback = !pick.length;
      if (fallback) pick = [{ g: wk.games[0], rw: 0, rl: 0 }];
      var line = function (x) {
        var g = x.g;
        var hi = Math.max(g.score[0], g.score[1]), lo = Math.min(g.score[0], g.score[1]);
        var tag = function (r, s) { return (r ? '#' + r + ' ' : '') + s; };
        return {
          name: g.rivalryName || '',
          say: tag(x.rw, g.winner.school) + ' ' + hi + ', ' + tag(x.rl, g.loser.school) + ' ' + lo,
        };
      };
      out[key(date)] = {
        text: 'Week ' + wk.week,
        lines: pick.map(line),
        sub: fallback
          ? wk.viewers.toFixed(1) + 'M watched the slate, nobody ranked played'
          : pick.length + (pick.length === 1 ? ' ranked game' : ' ranked games')
            + ' · ' + wk.viewers.toFixed(1) + 'M watched the slate',
        kind: 'game', icon: 'ball',
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
          kind: 'game', icon: 'trophy', viewers: t.game.viewers,
        };
      }
    });
    if (sim.bracket && sim.bracket.rounds && beat === 8) {
      var champ = saturday(year, 15);
      sim.bracket.rounds.forEach(function (round, ri) {
        var date = plus(champ, 13 + ri * 10);
        var g = round.slice().sort(function (a, b) { return (b.viewers || 0) - (a.viewers || 0); })[0];
        if (!g) return;
        var last = ri === sim.bracket.rounds.length - 1;
        out[key(date)] = {
          text: (last ? 'The final: ' : 'Round ' + (ri + 1) + ': ')
            + g.winner.team.school + ' ' + Math.max(g.score[0], g.score[1]) + ', '
            + g.loser.team.school + ' ' + Math.min(g.score[0], g.score[1]),
          sub: (g.viewers || 0).toFixed(1) + 'M watched',
          kind: 'game', icon: last ? 'trophy' : 'bracket',
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
  /* MONTH BEFORE DAY. This read "Mon 13 January 2025" on the desk, which is the order the
     rest of the world writes a date in and not the order the sport this mode is about writes
     it in. Every other string in the mode is American English and the date at the top of a
     case was the loudest thing on the screen that was not. */
  function longLabel(date) {
    return DOW[date.getDay()] + ' ' + MONTHS[date.getMonth()] + ' ' + date.getDate();
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
