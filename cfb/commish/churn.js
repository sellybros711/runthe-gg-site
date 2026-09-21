/*
 * churn.js - the sport does not stand still, and it used to.
 *
 * THE SAME TEAM WON FOUR OF FIVE TITLES AND THAT IS THE WHOLE REASON THIS FILE EXISTS.
 * Team strength was taken from the season the term began and then frozen: the top five in
 * 2025 were the top five in 2029, in the same order, and further apart. Across a hundred and
 * fifty simulated seasons only six schools ever won a national title and two of them took
 * seventy-six percent of them.
 *
 * Worse, WHICH two. Texas Tech's program level across twenty-one seasons of real data is
 * 0.57 and its 2025 was 2.32. Indiana's is MINUS 0.03 against a 2025 of 2.13. The two teams
 * winning three quarters of everything are two of the largest one-year outliers in the
 * dataset, held at their outlier forever. A college football fan knows in their bones that
 * Indiana does not win four national titles, and no amount of writing elsewhere survives that.
 *
 * SO A TEAM REGRESSES TOWARD ITS OWN HISTORY, not toward the league. The data carries
 * twenty-one seasons for most schools, which is a real program level and a real volatility
 * per school: Ohio State sits at 1.72 and moves half a point either way, Vanderbilt at -0.10
 * and moves rather more. Regressing everybody to zero would make the sport flat and wrong in
 * the other direction, with Vanderbilt and Alabama meeting in the middle.
 *
 * WHAT MOVES A TEAM, IN ORDER OF HOW MUCH:
 *
 *   Regression. Last year's number decays toward the program's own level. A fluke season
 *   is mostly gone in three years and a genuine rise takes years to be believed.
 *
 *   A shock. Deterministic per school per year off the world's seed, scaled by that
 *   program's own volatility, because a quarterback tearing a knee in August is a thing
 *   that happens to somebody every year and cannot be predicted by anybody.
 *
 *   The carousel. A program far enough below its own level for long enough changes its
 *   coach, and the change is a step rather than a drift. Mostly it helps, because the reason
 *   you fire somebody is that the floor is lower than it should be. Sometimes it does not.
 *
 * YEAR ONE IS UNTOUCHED, on purpose and load-bearing. The mode tells the player that the
 * first season is the real one and every season after it is invented. Churn starts at year
 * two or that sentence stops being true.
 *
 * DETERMINISTIC AND PURE. A term replays identically from its seed, so the 2028 season a
 * player watched is the 2028 season they get back after a reload.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_CHURN. Node: require('./churn.js').
 */
(function (root) {
  'use strict';

  /* HOW MUCH OF LAST YEAR SURVIVES INTO THIS ONE. Real college football's year over year
     correlation in points per game sits around 0.6 to 0.7: a good team is usually still good
     and almost never as good as its best year.

     FITTED AGAINST FOUR THINGS, not chosen. The spread of an invented season has to look
     like the spread of a real one (real z is normalized per season, so that is sd 1.00 by
     construction). The titles have to land the way they land in life: a real five year window
     produces about four different champions, and 2019 to 2023 gave LSU, Alabama, Georgia,
     Georgia, Michigan. The bottom of the league has to keep existing. And a December has to
     have a carousel in it.

     Frozen strength gave 2.87 distinct champions in five and six schools in a hundred and
     fifty seasons, and the six were the wrong six. These give 4.20 and thirty-one, at an
     invented season's sd of 1.02, with the worst team at -2.58 against a real -2.28. The
     schools holding the most titles over a hundred and fifty invented seasons are Ohio State,
     Alabama, LSU and Oregon, which is a list a fan would recognize.

     REFIT WHEN THE DATA CHANGED SHAPE, which is the rule rather than a courtesy. The first
     set of these was solved against the draft game's file: seventy power schools, strength
     from raw point differential. The league is now the whole division, a hundred and
     thirty-six schools rated by a schedule-adjusted solve. Every one of these numbers was
     re-solved against that. FIRE_GAP moved the furthest and the reason is worth knowing: see
     the carousel below. */
  var PERSIST = 0.6;
  /* AND HOW MUCH IS NEW, as a fraction of that program's own volatility. Somebody has to
     come out of nowhere every year or the sport has no stories in it. */
  var SHOCK = 0.68;

  /* THE CAROUSEL. A program this far under its own level, for this many years running, is
     making a change in December.

     ONE BAD YEAR IS ENOUGH IN THIS SPORT and the numbers say so: at two years running and a
     gap of 0.85 the mode produced 1.5 coaching changes a year across seventy schools, and a
     third of Decembers had none at all. A December with no carousel in it is not a December.
     Real FBS turns over about a fifth of its jobs a year, which is the number to hit.

     AND IT IS THE ONE THAT DID NOT SURVIVE THE NEW DATA. At 0.75 against the draft game's
     seventy power schools this gave 7.8 changes a year with a floor of two, which was right.
     The same 0.75 against the whole division gives 4.8 of 136 with a floor of ZERO: a third
     of a real carousel, and Decembers with nothing in them again. The gap is measured in
     units of a program's own volatility, and a schedule-adjusted rating is a tighter, truer
     number than raw differential, so a school sits closer to its own level and far fewer fall
     a long way under it. At 0.30 it is 23.5 of 136 with a floor of six, which is a sixth of
     the jobs and a December that always has one. */
  var FIRE_GAP = 0.30;
  var FIRE_YEARS = 1;
  /* WHAT A NEW COACH IS WORTH, WHICH IS ALMOST NOTHING ON AVERAGE. The first version had this
     at 0.42 on the theory that you fire somebody because the floor is too low, and the effect
     was that the bottom of the league quietly stopped existing: every bad program got a
     reliable lift and the worst team in an invented season was a full point better than the
     worst team in a real one. Most hires do not work. The spread is the story, not the mean.

     THE SPREAD IS ALSO WHAT KEEPS THE BOTTOM HONEST, so it is fitted against that directly
     rather than by taste. Five times as many hires now land every year as did against the old
     data, and each one adds variance, so the same 0.55 that used to be right pushed an
     invented season out past sd 1.10. Below 0.45 the hires stop being able to fail and the
     floor of the league starts lifting off the ground, which is the failure this number
     exists to prevent. */
  var HIRE_MEAN = 0.1;
  var HIRE_SPREAD = 0.45;

  /* ---- deterministic noise ----
     One hash per (seed, school, year, tag), so a term replays exactly and two different
     questions about the same school in the same year do not get the same answer. */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function unit(seed, school, year, tag) {
    return (hash(String(seed) + '|' + school + '|' + year + '|' + tag) % 100000) / 100000;
  }
  /* Box-Muller off two hashes, because a flat roll makes a quiet year and a catastrophe
     equally likely and football does not look like that. */
  function gauss(seed, school, year, tag) {
    var u = Math.max(1e-6, unit(seed, school, year, tag + 'a'));
    var v = unit(seed, school, year, tag + 'b');
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---- what a program is ----
     Its own mean and its own spread across every season the data has for it. Cached on the
     array it was built from, because league() calls this once per season per beat and the
     answer never changes. */
  var _cache = null, _cacheFor = null;
  function programLevels(teamSeasons) {
    if (_cache && _cacheFor === teamSeasons) return _cache;
    var by = {};
    for (var i = 0; i < teamSeasons.length; i++) {
      var r = teamSeasons[i];
      if (typeof r.strength_z !== 'number') continue;
      (by[r.school] = by[r.school] || []).push(r.strength_z);
    }
    var out = {};
    Object.keys(by).forEach(function (school) {
      var zs = by[school];
      var m = zs.reduce(function (t, x) { return t + x; }, 0) / zs.length;
      var v = zs.length > 1
        ? Math.sqrt(zs.reduce(function (t, x) { return t + (x - m) * (x - m); }, 0) / zs.length)
        : 0.7;
      out[school] = {
        /* A SCHOOL WITH ONE SEASON IN THE DATA HAS NO PROGRAM LEVEL, and pretending its one
           year is its identity is how a team that had a fluke gets frozen at the fluke, which
           is the bug this file exists to fix. Pull those most of the way to the middle. */
        level: zs.length >= 5 ? m : m * 0.45,
        vol: Math.max(0.35, Math.min(1.3, v || 0.7)),
        seasons: zs.length,
      };
    });
    _cache = out; _cacheFor = teamSeasons;
    return out;
  }

  /* ---- a program's five years ----
     Walked year by year rather than solved, because the carousel depends on how the previous
     years actually went and a closed form cannot see that.

     Returns { z: [...], events: [...] } where z[0] is the season the term began on. */
  function trajectory(school, baseZ, prog, seed, years) {
    var level = prog ? prog.level : 0;
    var vol = prog ? prog.vol : 0.7;
    var z = [baseZ];
    var events = [];
    var coach = 0;
    var under = 0;
    for (var n = 1; n <= years; n++) {
      var prev = z[n - 1];
      var was = coach;
      /* REGRESSION TOWARD ITS OWN LEVEL, plus whatever the coach on the sideline is worth,
         plus a shock the size of what this program normally does. */
      var next = level + (prev - level) * PERSIST
        + was
        + gauss(seed, school, n, 'z') * vol * SHOCK;

      /* THE CAROUSEL, decided on how the season that just finished went. A program under
         its own level makes a change, and the change lands on the season after it.

         THE BASELINE SEASON IS NOT EVIDENCE. z[0] is the real 2025, and every carousel that
         season earned already happened in the world the data was scraped from: the coaches
         who survived to be IN that data are the ones their schools kept. Counting it fired
         the exact same forty-one coaches in the first December of every term ever played,
         on every seed, because the condition read only the data: a purge, identical every
         time, on programs whose only offense was a 21-year mean above their 2025. Year one
         is the real season everywhere else in this mode, and now it is here too: the first
         December is quiet, and the carousel begins with the first season played on this
         office's watch. movedBlock() in the page promised exactly that ("NOT IN YEAR ONE")
         and the code did not keep the promise until now.

         Re-measured after the change with the same harness as before it: distinct champions
         per five years went 3.97 to 4.20, which is the direction the fit wanted (a real five
         year window gives about four); schools ever winning went 32 to 28 in 150 seasons;
         invented-season sd went 1.02 to 0.99; the worst team went -3.60 to -3.48. The
         carousel runs 0, then about 29, then settles in the teens, which is the size of a
         real cycle. Everything stayed in band, so the other constants stand. */
      if (n > 1) { if (prev < level - FIRE_GAP) under++; else under = 0; }
      if (under >= FIRE_YEARS) {
        var delta = HIRE_MEAN + gauss(seed, school, n, 'hire') * HIRE_SPREAD;
        coach = was * 0.4 + delta;
        /* THE NEW MAN REPLACES THE OLD ONE, he is not added to him. `next` already carries
           `was`, so a hire swaps one contribution for the other. Adding the new delta on top
           of a number that already contained a coach paid every hire twice in its first
           season, which is how a program reached a strength the real data has never
           produced in twenty-one years. */
        next = next - was + coach;
        events.push({ year: n, school: school, kind: 'coach', delta: Math.round(delta * 100) / 100 });
        under = 0;
      } else {
        /* A COACH'S EFFECT IS NOT FOREVER. Two good years and it is the program's level
           rather than the hire, which is how program levels move in life. */
        coach = was * 0.55;
      }
      z.push(Math.round(next * 1000) / 1000);
    }
    return { z: z, events: events };
  }

  /* WHAT A SCHOOL IS WORTH THIS YEAR. `years` is how many seasons into the term, so zero is
     the season the term opened on and returns the baseline untouched. */
  function strengthOf(school, baseZ, teamSeasons, seed, years) {
    if (!years) return baseZ;
    var prog = programLevels(teamSeasons)[school] || null;
    return trajectory(school, baseZ, prog, seed, years).z[years];
  }

  /* AND WHO CHANGED COACH THIS YEAR, which is a December a fan actually looks forward to and
     which the mode had no way of telling them about. */
  function carouselFor(teams, teamSeasons, seed, years) {
    if (!years) return [];
    var levels = programLevels(teamSeasons);
    var out = [];
    teams.forEach(function (t) {
      var prog = levels[t.school] || null;
      var tr = trajectory(t.school, t.baseZ == null ? t.z : t.baseZ, prog, seed, years);
      tr.events.forEach(function (e) {
        if (e.year !== years) return;
        out.push({ school: t.school, conference: t.conference, color: t.color,
          delta: e.delta, better: e.delta > 0 });
      });
    });
    return out;
  }

  var api = {
    programLevels: programLevels, trajectory: trajectory,
    strengthOf: strengthOf, carouselFor: carouselFor,
    PERSIST: PERSIST, SHOCK: SHOCK, FIRE_GAP: FIRE_GAP,
  };
  root.PS_CFB_CHURN = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
