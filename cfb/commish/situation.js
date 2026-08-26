/*
 * situation.js - what is going on right now, in one object.
 *
 * THE DOCKET WAS WRITING TO NOBODY IN PARTICULAR. Twenty-four items, four of them with a
 * cast, and the rest addressed to a sport with no date on it: an October item about a
 * rivalry read exactly the same in a year when three teams were unbeaten as in a year when
 * the whole country had two losses by the first of the month. The beat told you which
 * category of argument it was and nothing at all about the argument.
 *
 * So this reads the moment. The real date off the calendar, the week of the season, who is
 * still unbeaten and who just lost to whom, what drew and what did not, which conference is
 * a conference and which one is four schools and a lawyer. An item can then be GATED on it
 * ("only when somebody is 8-0 and nobody is watching") and can READ it in its own prose
 * ("Texas Tech is 8-0 and the Saturday they played drew 41 million").
 *
 * ONE OBJECT, BUILT ONCE PER BEAT. Every `when`, every `cast` and every brief sees the same
 * one, so two of them cannot disagree about what week it is. Everything on it is either a
 * plain value or null: an item asking about the unbeaten in February gets an empty list
 * rather than a thrown error, because February has no football in it and the item still has
 * to render.
 *
 * NULL IS A REAL ANSWER HERE. Half the beats have no season behind them and year one has no
 * ratings history, so `week`, `leader` and `trend` are legitimately unknown. Anything that
 * reads them has to handle that: a brief which says "the leader is 8-0" in January is worse
 * than one that never mentions it.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_SITUATION. Node: require('./situation.js').
 */
(function (root) {
  'use strict';

  /* Which beats have football behind them at all. The four offseason beats do not, and an
     item that asks "who is unbeaten" in the spring is asking about last season, which is a
     different question and belongs to `lastYear`. */
  function inSeason(beat) { return beat >= 4 && beat <= 8; }

  function nz(v, d) { return v == null ? d : v; }

  /* WHO IS STILL PERFECT, best first. The single most load-bearing fact in this sport for
     two months of the year: it decides the rankings argument, the television argument and
     most of what anybody says out loud. */
  function unbeatenOf(sim) {
    if (!sim || !sim.teams) return [];
    return sim.teams.filter(function (t) { return t.losses === 0 && (t.wins || 0) > 0; })
      .map(function (t) {
        return { school: t.school, conference: t.conference, abbr: t.abbr, color: t.color,
          wins: t.wins, z: t.z };
      });
  }

  /* THE BIGGEST UPSET SO FAR, by how far the loser was ahead on paper. Not by margin: a
     good team beating a bad one by forty is a Saturday, and a bad team beating a good one
     by one is the reason anybody watches. */
  function upsetOf(sim) {
    if (!sim || !sim.games || !sim.games.length) return null;
    var best = null, bestGap = 0;
    sim.games.forEach(function (g) {
      var gap = (g.loser.z || 0) - (g.winner.z || 0);
      if (gap <= bestGap) return;
      bestGap = gap; best = g;
    });
    if (!best || bestGap < 0.6) return null;
    return {
      winner: best.winner.school, loser: best.loser.school,
      winnerConf: best.winner.conference, loserConf: best.loser.conference,
      week: best.week, gap: Math.round(bestGap * 100) / 100,
      score: [Math.max(best.score[0], best.score[1]), Math.min(best.score[0], best.score[1])],
      viewers: best.viewers,
    };
  }

  /* THE MOST EMBARRASSING SCORELINE SO FAR, which is its own kind of news. */
  function blowoutOf(sim) {
    if (!sim || !sim.games || !sim.games.length) return null;
    var g = sim.games.slice().sort(function (a, b) { return b.margin - a.margin; })[0];
    if (!g || g.margin < 38) return null;
    return { winner: g.winner.school, loser: g.loser.school, margin: g.margin, week: g.week,
      score: [Math.max(g.score[0], g.score[1]), Math.min(g.score[0], g.score[1])] };
  }

  /* THE GAME EVERYBODY WATCHED, which is the one a television argument is about. */
  function biggestOf(sim) {
    if (!sim || !sim.games || !sim.games.length) return null;
    var g = sim.games.slice().sort(function (a, b) { return (b.viewers || 0) - (a.viewers || 0); })[0];
    if (!g) return null;
    return { winner: g.winner.school, loser: g.loser.school, week: g.week,
      viewers: Math.round((g.viewers || 0) * 10) / 10, margin: g.margin,
      score: [Math.max(g.score[0], g.score[1]), Math.min(g.score[0], g.score[1])] };
  }

  /* WHAT EACH CONFERENCE IS, right now. Membership is the ledger's, form is the season's, so
     a raid in January and a bad October show up in the same object. */
  function confsOf(world, L, sim) {
    var out = {};
    var names = {};
    var m = (world && world.membership) || {};
    Object.keys(m).forEach(function (school) { names[m[school]] = 1; });
    Object.keys(names).forEach(function (c) {
      var members = Object.keys(m).filter(function (s) { return m[s] === c; });
      var row = {
        name: c, size: members.length,
        power: L && L.POWERS ? L.POWERS.indexOf(c) >= 0 : false,
        defunct: L && L.isDefunct ? !!L.isDefunct(world, c) : false,
        share: Math.round(((world.money && world.money.share && world.money.share[c]) || 0) * 1000) / 1000,
        unbeaten: 0, best: null, wins: 0, losses: 0,
      };
      if (sim && sim.teams) {
        var mine = sim.teams.filter(function (t) { return t.conference === c; });
        mine.forEach(function (t) {
          row.wins += t.wins || 0; row.losses += t.losses || 0;
          if (t.losses === 0 && t.wins > 0) row.unbeaten++;
        });
        if (mine.length) row.best = { school: mine[0].school, wins: mine[0].wins, losses: mine[0].losses };
      }
      out[c] = row;
    });
    return out;
  }

  /* THE ONE THAT IS ABOUT TO STOP BEING ONE. A conference near the ledger's own floor is
     what every realignment item in the docket is really about, and until now each of them
     worked it out again from scratch.

     A POWER CONFERENCE THAT IS STILL BREATHING. Filtering on `power` alone returns nothing
     in 2025, because the four powers all have sixteen or more and the one league that is
     actually two schools and a lawsuit is the Pac-12, which the ledger already calls defunct.
     So `endangered` is the ones with something left to lose and `gone` is the ones that have
     already lost it, and an item can ask for either. */
  function endangeredOf(confs, L) {
    var floor = (L && L.MIN_CONFERENCE) || 4;
    return Object.keys(confs).filter(function (c) {
      return !confs[c].defunct && confs[c].size > 1 && confs[c].size <= floor + 2;
    }).sort(function (a, b) { return confs[a].size - confs[b].size; });
  }
  function goneOf(confs) {
    return Object.keys(confs).filter(function (c) { return confs[c].defunct; })
      .sort(function (a, b) { return confs[b].size - confs[a].size; });
  }

  /* HOW THE AUDIENCE IS MOVING against the term so far, which is the number every television
     argument in the mode is conducted in. Null in year one, on purpose: there is nothing to
     compare a first season to and inventing a trend would be inventing a fact. */
  function trendOf(world, sim) {
    var r = (world && world.ratings) || {};
    var years = Object.keys(r).filter(function (y) { return Number(y) < world.year; });
    if (!years.length || !sim || !sim.perGame) return null;
    var avg = years.reduce(function (t, y) { return t + r[y].perGame; }, 0) / years.length;
    return Math.round((sim.perGame - avg) * 100) / 100;
  }

  /* LAST SEASON, for the four beats that have no football of their own. An offseason item
     about "the team that went unbeaten and got left out" is asking about the year that just
     finished, and the world carries the champion for exactly this. */
  function lastYearOf(world) {
    var c = (world && world.champs) || {};
    var y = world.year - 1;
    if (!c[y]) return null;
    var r = (world.ratings || {})[y] || null;
    return { year: y, champion: c[y].school || null, color: c[y].color || null,
      perGame: r ? r.perGame : null, title: r ? r.title : null };
  }

  /* ---- the object everything reads ---- */
  function build(world, L, o) {
    o = o || {};
    var sim = o.sim || null;
    var CAL = o.calendar || null;
    var beat = nz(world && world.beat, 0);
    var season = inSeason(beat) ? sim : null;
    var confs = confsOf(world, L, season);
    var unbeaten = unbeatenOf(season);
    var startYear = nz(world && world.startYear, world && world.year);
    var day = o.date || (CAL && world ? CAL.decisionDay(world.year, beat, o.itemId || 'x') : null);

    var sit = {
      /* ---- when ---- */
      year: world ? world.year : null,
      beat: beat,
      beatName: (L && L.BEATS && L.BEATS[beat]) || '',
      /* Which season of the term this is, one-indexed, and how many are left after it. */
      seasonOfTerm: world ? (world.year - startYear) + 1 : 1,
      seasonsLeft: world ? Math.max(0, 5 - ((world.year - startYear) + 1)) : 0,
      firstYear: world ? world.year === startYear : true,
      lastYear: world ? (world.year - startYear) >= 4 : false,
      date: day,
      dateLabel: day && CAL ? CAL.longLabel(day) : null,
      month: day && CAL ? CAL.MONTHS[day.getMonth()] : null,
      inSeason: inSeason(beat),

      /* ---- the football ---- */
      played: !!season,
      /* `through`, NOT `lastWeek`. The second of those is how many weeks the schedule needed
         in total, which is fifteen every year and is not the week anybody is standing in. */
      week: season ? (season.through || null) : null,
      teams: season ? season.teams : [],
      unbeaten: unbeaten,
      /* The best team on the board, which in this sport is not always an unbeaten one. */
      leader: season && season.teams && season.teams.length
        ? { school: season.teams[0].school, conference: season.teams[0].conference,
          wins: season.teams[0].wins, losses: season.teams[0].losses }
        : null,
      upset: upsetOf(season),
      blowout: blowoutOf(season),
      biggest: biggestOf(season),
      viewers: season ? season.viewers : null,
      perGame: season ? season.perGame : null,
      trend: trendOf(world, season),

      /* ---- the shape of the sport ---- */
      confs: confs,
      endangered: endangeredOf(confs, L),
      gone: goneOf(confs),
      previous: lastYearOf(world),

      /* ---- where you stand ---- */
      meters: world ? world.meters : null,
      pressure: world ? world.pressure : null,
      /* HOW MANY RULINGS DEEP, which is the mode's own measure of experience and is already
         what gates the advisory council. */
      ruled: world && world.history
        ? world.history.filter(function (h) {
          return !(h.id && String(h.id).indexOf('season:') === 0);
        }).length
        : 0,
      lit: world && L && L.lit ? L.lit(world) : [],
    };

    /* CONVENIENCES THE ITEMS WOULD OTHERWISE ALL REWRITE, and get subtly different. */
    sit.unbeatenCount = unbeaten.length;
    sit.hasUnbeaten = unbeaten.length > 0;
    /* SOMEBODY FROM OUTSIDE THE FOUR RUNNING THE TABLE is the most reliable argument
       generator this sport has, and it needs to be one field rather than the same filter
       written slightly differently in nine items.

       NOT "the Group of Five", deliberately, and the reason has changed without the code
       needing to. That phrase names a BLOC in this mode and a line in the money table, and it
       used to name nothing on the field at all: the season was played with seventy schools,
       sixty-seven of them power, so an item written about a Group of Five team could not fire.
       The whole division is on the field now and it could. It is still the wrong test. An
       outsider is a team with no power conference behind it, which is what the argument is
       actually about and which correctly catches an independent and whatever the Pac-12 is
       this year, neither of which is in the Group of Five. */
    sit.outsider = unbeaten.filter(function (t) {
      return !(confs[t.conference] && confs[t.conference].power);
    })[0] || null;
    sit.bigUnbeaten = unbeaten.filter(function (t) {
      return confs[t.conference] && confs[t.conference].power;
    });
    /* TWO PERFECT TEAMS IN THE SAME LEAGUE, which is a scheduling problem and a television
       jackpot at the same time. */
    sit.sameConfUnbeaten = (function () {
      var seen = {}, hit = null;
      unbeaten.forEach(function (t) {
        if (seen[t.conference] && !hit) hit = { conference: t.conference, a: seen[t.conference], b: t };
        seen[t.conference] = t;
      });
      return hit;
    })();
    /* ---- THE ONE WAY DOOR ----
       Whether a man who has been a professional can come back, who wrote that rule, and
       whether the leagues have stopped agreeing about it. The last of those is the state the
       whole argument turns into the moment one conference goes first, so it is a field rather
       than something nine items each work out again from a map. */
    var lab = (world && world.labour) || {};
    sit.reentry = lab.reentry || 'open';
    sit.rulesBy = lab.rulesBy || 'national';
    sit.proYears = lab.proYears == null ? 1 : lab.proYears;
    sit.confReentry = Object.assign({}, lab.confReentry || {});
    var rules = Object.keys(sit.confReentry)
      .map(function (c) { return sit.confReentry[c] || sit.reentry; });
    sit.splitRules = sit.rulesBy === 'conference'
      && rules.some(function (r) { return r !== rules[0]; });
    /* The two lists an item needs to name names: who shut their door and who did not. */
    sit.doorShut = Object.keys(sit.confReentry).filter(function (c) {
      return (sit.confReentry[c] || sit.reentry) === 'closed';
    });
    sit.doorOpen = Object.keys(sit.confReentry).filter(function (c) {
      return (sit.confReentry[c] || sit.reentry) === 'open';
    });

    /* ---- WHERE THE BIG GAMES ARE AND WHOSE NAME IS ON THEM ----
       Ids, plus the resolved records when venues.js is loaded, so an item can say "Pasadena"
       rather than "pas" without every one of them looking it up again. */
    var ven = (world && world.venues) || {};
    var brand = (world && world.brand) || {};
    var V = root.PS_CFB_VENUES
      || (typeof require === 'function' ? require('./venues.js') : null);
    sit.titleSite = ven.title || null;
    sit.titleVenue = V && ven.title ? V.venue(ven.title) : null;
    sit.lastTitleSite = ven.lastTitle || null;
    sit.openers = (ven.openers || []).slice();
    sit.playoffSponsor = brand.playoff || null;
    sit.patchSponsor = brand.patch || null;
    sit.bowlSponsors = Object.assign({}, brand.bowls || {});
    sit.sold = [brand.playoff, brand.patch, brand.trophy]
      .concat(Object.keys(brand.bowls || {}).map(function (k) { return brand.bowls[k]; }))
      .filter(Boolean);
    /* HOW MUCH OF THE SPORT HAS SOMEBODY'S NAME ON IT, which is the number the argument is
       really about and which no single field could carry. */
    sit.soldCount = sit.sold.length;

    sit.audienceUp = sit.trend != null && sit.trend >= 0.06;
    sit.audienceDown = sit.trend != null && sit.trend <= -0.06;
    sit.standing = world && world.meters ? world.meters.standing : null;
    sit.shaky = sit.standing != null && sit.standing < 42;
    sit.secure = sit.standing != null && sit.standing >= 68;
    return sit;
  }

  /* A BLANK ONE, for callers with no world yet and for tests that want the shape without a
     season. Everything an item can read is present and empty rather than missing, because
     `sit.unbeaten.length` throwing is how a docket item takes the whole page down. */
  function empty() {
    return build({ year: 2025, beat: 0, startYear: 2025, membership: {}, money: { share: {} },
      meters: null, pressure: null, history: [] }, null, {});
  }

  var api = { build: build, empty: empty, inSeason: inSeason };
  root.PS_CFB_SITUATION = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
