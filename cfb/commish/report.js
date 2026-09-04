/*
 * report.js - what the five years were worth, graded.
 *
 * WHY THIS EXISTS. The mode ended on a sentence: so many rulings, so many champions crowned,
 * so many of the four numbers moved. That is a receipt. It tells a player what they pressed
 * and nothing at all about whether it worked, which is the only question a term is actually
 * about and the one every screen before it has been building toward.
 *
 * SIX THINGS, GRADED SEPARATELY, because a commissioner is not one number. A term can pay for
 * itself and hollow out the sport, or leave the football wonderful and every president in the
 * country wanting you gone, and a single score would average those into a shrug. The whole
 * argument of this mode is that these pull against each other.
 *
 * EVERY GRADE IS READ OFF SOMETHING THE PLAYER DID. Nothing here is a die roll and nothing is
 * scored on effort: the books are the books, the audience is what the sport drew, the room is
 * who is still speaking to you. Where a grade needs a number the season recorded, it uses the
 * one already stored on the world rather than replaying anything, so opening the ending screen
 * twice cannot produce two different verdicts.
 *
 * A MISSING NUMBER IS NOT A ZERO. A term saved before a field existed, or one cut short after
 * two years, has to grade on what it has: a card with nothing behind it says so and drops out
 * of the average rather than quietly marking the player down for a save format.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_REPORT. Node: require('./report.js').
 */
(function (root) {
  'use strict';

  var L = root.PS_CFB_LEDGER || (typeof require === 'function' ? require('./ledger.js') : null);

  /* Grades are held as points so they can be averaged, and rendered as letters because a
     report card is the one place a letter says more than a number. */
  var LETTERS = ['F', 'D', 'C', 'B', 'A'];
  function gradeOf(points) { return LETTERS[Math.max(0, Math.min(4, Math.round(points)))]; }
  /* Where a value falls in a list of cuts, best first. */
  function bandOf(v, cuts) {
    for (var i = 0; i < cuts.length; i++) if (v >= cuts[i]) return 4 - i;
    return 0;
  }

  function years(world) {
    var out = [];
    for (var y = world.startYear; y < world.year; y++) out.push(y);
    return out;
  }

  /* ---- the books ----
     The pool is a promise made in advance and the audience is what turned up to pay for it.
     A negative gap means the sport earned more than the office had already spent. */
  function books(world) {
    var r = world.ratings || {};
    var ys = years(world).filter(function (y) { return r[y] && r[y].perGame; });
    if (!ys.length) return null;
    var pool = (world.money || {}).pool;
    if (pool == null) return null;
    /* 0.696 is season.js's WORTH_PER_M and is duplicated here on purpose rather than reached
       for: this module has to grade a saved term with no season engine in the room, and one
       number copied with a note beats a dependency that only exists to read a constant. If
       that number is refitted, refit this one. */
    var gap = 0;
    ys.forEach(function (y) { gap += pool - r[y].perGame * 0.696; });
    gap = gap / ys.length;
    return {
      id: 'books', label: 'The books',
      points: bandOf(-gap, [0.20, 0.08, -0.05, -0.20]),
      mark: (gap <= 0 ? '+' : '') + (-gap).toFixed(2) + 'B',
      line: gap <= -0.05
        ? 'The sport earned more than you had already promised it, every year, which is the '
          + 'only way a distribution formula ever stops being an argument.'
        : gap <= 0.05
          ? 'The books came out level. Nobody thanks a commissioner for that and it is harder '
            + 'than it sounds.'
          : 'You wrote checks the football did not cover. Somebody after you has to find '
            + 'that money or take it off somebody.',
    };
  }

  /* ---- the audience ---- */
  function audience(world) {
    var r = world.ratings || {};
    var ys = years(world).filter(function (y) { return r[y] && r[y].perGame; });
    if (ys.length < 2) return null;
    var first = r[ys[0]].perGame, last = r[ys[ys.length - 1]].perGame;
    if (!first) return null;
    var pct = (last - first) / first * 100;
    return {
      id: 'audience', label: 'The audience',
      points: bandOf(pct, [12, 6, -1, -8]),
      mark: (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%',
      line: pct >= 2
        ? 'More people watched college football when you left than when you arrived.'
        : pct >= -2
          ? 'The audience you were handed is roughly the audience you handed on.'
          : 'Fewer people watched at the end than at the beginning, and that is the number '
            + 'every other number in this job is eventually derived from.',
    };
  }

  /* ---- the room ---- */
  function room(world) {
    var b = world.blocs || {};
    var names = Object.keys(b);
    if (!names.length) return null;
    var withYou = names.filter(function (k) { return b[k] >= 50; });
    var bigTwo = (b.SEC >= 50) && (b['Big Ten'] >= 50);
    return {
      id: 'room', label: 'The room',
      points: bandOf(withYou.length, [8, 7, 5, 3]),
      mark: withYou.length + ' of ' + names.length,
      line: withYou.length >= 6
        ? 'You leave with most of the room, which either means you read it well or never '
          + 'asked it for anything difficult.'
        : bigTwo
          ? 'You lost most of the room and kept the two that can remove you, which is the '
            + 'trade this job is actually made of.'
          : 'The two conferences that can end a term were not with you at the end of it.',
    };
  }

  /* ---- who won ----
     FIVE DIFFERENT CHAMPIONS IS A SPORT AND ONE IS A PROCESSION, and it is the single
     clearest read on whether the rules this office wrote left the game open. */
  function competition(world) {
    var c = world.champions || {};
    var ys = years(world).filter(function (y) { return c[y] && c[y].school; });
    if (!ys.length) return null;
    var distinct = {}, leagues = {};
    ys.forEach(function (y) {
      distinct[c[y].school] = 1;
      if (c[y].conference) leagues[c[y].conference] = 1;
    });
    var n = Object.keys(distinct).length;
    /* SCHOOLS AND LEAGUES TOGETHER, because five different SEC champions is a less open sport
       than four champions out of four conferences, and counting schools alone cannot tell
       those apart. Over five seasons the school count is a number from one to five and has no
       resolution on its own; this gives it some. Old saves carry no conference on a champion,
       and then it grades on schools alone rather than marking the term down for it. */
    var span = n + Object.keys(leagues).length;
    var scale = Object.keys(leagues).length ? 2 : 1;
    return {
      id: 'competition', label: 'Who won',
      points: bandOf(span / (ys.length * scale), [0.89, 0.75, 0.62, 0.45]),
      mark: n + ' of ' + ys.length,
      line: n === ys.length && ys.length > 1
        ? 'A different champion every year. Nobody could tell you in August who was going to '
          + 'win it, which is the whole product.'
        : n <= 1
          ? 'One school won everything. A sport where the answer is known in August is a '
            + 'sport with one good weekend in it.'
          : 'A handful of schools shared it out, which is roughly what this sport does when '
            + 'nobody interferes.',
    };
  }

  /* ---- who got in ---- */
  function access(world) {
    var r = world.ratings || {};
    var ys = years(world).filter(function (y) { return r[y] && r[y].outsiders != null; });
    if (!ys.length) return null;
    var tot = 0;
    ys.forEach(function (y) { tot += r[y].outsiders; });
    var per = tot / ys.length;
    return {
      id: 'access', label: 'Who got in',
      points: bandOf(per, [3, 2, 1, 0.4]),
      mark: per.toFixed(1) + ' a year',
      line: per >= 1
        ? 'A school from outside the four made the field most years, so the argument the '
          + 'Group of Five brings to every meeting had an answer.'
        : per > 0
          ? 'Somebody from outside the four got in occasionally, which is better than the '
            + 'sentence they had before you.'
          : 'Nobody from outside the power four reached the field in five years. The group '
            + 'with fourteen percent of the money and half a vote was arguing about a door '
            + 'that was painted on.',
    };
  }

  /* ---- the map ---- */
  function map(world) {
    if (!L || !L.conferencesIn) return null;
    var now = L.conferencesIn(world);
    var alive = Object.keys(now).filter(function (c) {
      return now[c] >= (L.MIN_CONFERENCE || 4);
    }).length;
    var opened = (world.start && world.start.conferences != null)
      ? world.start.conferences : null;
    if (opened == null) return null;
    var d = alive - opened;
    return {
      id: 'map', label: 'The map',
      points: bandOf(d, [1, 0.5, 0, -1]),
      mark: alive + ' of ' + opened,
      line: d >= 0
        ? 'Every conference that was standing when you took the job was standing when you '
          + 'left it.'
        : d === -1
          ? 'One conference did not survive your term. Somewhere there is a school playing in '
            + 'a league it did not choose.'
          : Math.abs(d) + ' conferences went under while you were in the chair, and the sport '
            + 'that is left is a smaller one than the sport you were given.',
    };
  }

  /* ---- the whole thing ---- */
  var VERDICTS = [
    { at: 3.5, title: 'They will name something after you',
      line: 'Whoever takes this desk next inherits a sport in better shape than the one you '
        + 'walked into, which almost nobody manages.' },
    { at: 2.7, title: 'A good commissioner',
      line: 'You got more right than wrong and the things you got wrong were the hard ones.' },
    { at: 2.0, title: 'You held the thing together',
      line: 'Nothing collapsed. In this job that is not nothing, and it is also not much.' },
    { at: 1.2, title: 'A caretaker at best',
      line: 'The sport got through five years with you in the chair and is not obviously '
        + 'better for any of it.' },
    { at: -1, title: 'They will use your name as a warning',
      line: 'Somebody is going to spend a decade undoing this.' },
  ];

  function report(world) {
    var cards = [books(world), audience(world), room(world), competition(world),
      access(world), map(world)].filter(Boolean);
    cards.forEach(function (c) { c.grade = gradeOf(c.points); });
    /* THE AVERAGE IS OVER THE CARDS THAT HAVE SOMETHING BEHIND THEM. A term with no seasons
       recorded should come back ungraded rather than bottom of the class. */
    var avg = cards.length
      ? cards.reduce(function (t, c) { return t + c.points; }, 0) / cards.length : null;
    var v = null;
    if (avg != null) {
      for (var i = 0; i < VERDICTS.length; i++) {
        if (avg >= VERDICTS[i].at) { v = VERDICTS[i]; break; }
      }
    }
    /* AND THE ONE LINE WORTH SAYING OUT LOUD is whichever card was furthest from the middle,
       because a term is remembered for its best or its worst thing and never for its mean. */
    var loudest = null;
    cards.forEach(function (c) {
      if (!loudest || Math.abs(c.points - 2) > Math.abs(loudest.points - 2)) loudest = c;
    });
    return {
      cards: cards,
      score: avg == null ? null : Math.round(avg * 25),
      grade: avg == null ? null : gradeOf(avg),
      verdict: v,
      loudest: loudest,
    };
  }

  var api = { report: report, gradeOf: gradeOf, VERDICTS: VERDICTS };
  root.PS_CFB_REPORT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
