/* THE FOOTBALL, PLAYED UNDER THE RULES YOU WROTE.
 *
 * This is the thing the plan calls the mode's only real advantage over the games it takes
 * after. Fantasy President and Football President answer a decision with opinions: people
 * react, meters move, a headline runs. There is no country under one and no football under
 * the other. Here there is. Expand the playoff and the bracket really is that size; move a
 * school and it really plays in its new conference; starve a conference and its teams
 * really get worse, on the field, over years you have to keep governing.
 *
 * Headless and dependency-free, like ledger.js and blocs.js beside it. It takes a world and
 * a seeded rng and returns a season. It reads the ledger and never writes to it: what the
 * football does back to the sport comes out as an `edit`, the same shape a ruling produces,
 * so it flows through applyEdit and the room answers it exactly like anything else.
 *
 * WHAT IS REAL AND WHAT IS NOT, because a game that shows real schools owes an answer.
 * Every team's baseline is its real season in cfb_team_seasons.json: real scoring means,
 * real standard deviations, a real strength. The FIRST season of a term is therefore played
 * by teams that were that good. Everything after it is invented, because the data stops at
 * 2025 and a term runs five years, and because the whole point is that your rulings change
 * who is good. Nothing here should ever be presented as a real result.
 */
(function (root) {
  'use strict';

  var L = root.PS_CFB_LEDGER || (typeof require === 'function' ? require('./ledger.js') : null);

  /* Twelve games, which is what a regular season is. The ledger decides how many of them
     are inside the conference; the rest are bought. */
  var GAMES = 12;

  /* HOW FAR APART TWO TEAMS ARE, IN POINTS. strength_z is roughly a standard normal across
     the league, so a two-z gap is about as far apart as college football gets, and this
     turns that into the twenty-eight-ish point spread it looks like in life. */
  var Z_TO_POINTS = 13.5;
  /* Home field, worth about what it is worth. */
  var HOME = 2.2;
  /* How much of a game is not the teams. Football is noisy and an upset has to be possible. */
  var NOISE = 13.0;

  /* ---------------- the league ---------------- */

  /* A school's baseline, taken from the most recent real season it has at or before the
     year the term began. A school that left the data (a defunct programme, or one this
     dataset never carried) is simply not in the league, which is honest: the alternative is
     inventing a team. */
  function baselines(teamSeasons, upToYear) {
    var best = {};
    for (var i = 0; i < teamSeasons.length; i++) {
      var t = teamSeasons[i];
      if (t.season > upToYear) continue;
      var cur = best[t.school];
      if (!cur || t.season > cur.season) best[t.school] = t;
    }
    return best;
  }

  /* WHAT YOUR MONEY DID TO THE FOOTBALL, which is the slowest and most important loop in
     the mode. A conference's share of the pool, against the share it opened with, moves the
     teams in it. It is deliberately small per year and cumulative: starve the Group of Five
     in year one and they are meaningfully worse by year four, which is a consequence you
     caused rather than a die roll.

     Bounded, because no distribution formula turns Vanderbilt into Georgia. */
  var MONEY_GAIN = 1.6;
  var MONEY_CAP = 0.55;
  function moneyDrift(world, conference) {
    var now = (world.money.share || {})[conference];
    var was = (L.OPENING_SHARE || {})[conference];
    if (now == null || was == null || !was) return 0;
    var years = Math.max(0, world.year - world.startYear);
    var d = ((now - was) / was) * MONEY_GAIN * Math.min(years, 6) / 6;
    return Math.max(-MONEY_CAP, Math.min(MONEY_CAP, d));
  }

  function league(world, teamSeasons) {
    var base = baselines(teamSeasons, world.startYear);
    var out = [];
    for (var school in world.membership) {
      var b = base[school];
      if (!b) continue;
      var conf = world.membership[school];
      out.push({
        school: school,
        conference: conf,
        abbr: b.abbreviation || school,
        color: b.color || '#64748b',
        z: (b.strength_z || 0) + moneyDrift(world, conf),
        off: b.pts_scored_mean || 24,
        offSd: b.pts_scored_sd || 10,
        def: b.pts_allowed_mean || 24,
        from: b.season,
        wins: 0, losses: 0, confWins: 0, confLosses: 0,
        pf: 0, pa: 0, opp: [],
      });
    }
    return out;
  }

  /* ---------------- one game ---------------- */

  function gauss(rng) {
    /* Box-Muller, so the noise is normal rather than flat. A flat roll makes blowouts and
       one-point games equally likely, which is not what football looks like. */
    var u = Math.max(1e-9, rng()), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* A SCORE THAT FOOTBALL CAN ACTUALLY PRODUCE. Every whole number is reachable with
     touchdowns, field goals and safeties except one and four, and those two are exactly
     what an arithmetic scoreline generator emits: the main game shipped 1s and 4s for its
     whole life for this reason and it is written up in engine.js. Do not let them out. */
  function plausible(n) {
    var v = Math.max(0, Math.round(n));
    if (v === 1) return 0;
    if (v === 4) return 3;
    return v;
  }

  function playGame(a, b, neutral, rng) {
    var edge = (a.z - b.z) * Z_TO_POINTS + (neutral ? 0 : HOME);
    var margin = edge + gauss(rng) * NOISE;
    /* The two sides' own scoring profiles decide the level of the game, and the margin
       decides who wins it. A defensive team against a defensive team stays in the twenties
       whoever wins, which is what makes these read like real scores. */
    var lvl = (a.off + b.def) / 2, lvlB = (b.off + a.def) / 2;
    var total = Math.max(17, lvl + lvlB + gauss(rng) * 7);
    var m = Math.abs(margin);
    var hi = plausible((total + m) / 2), lo = plausible((total - m) / 2);
    if (hi === lo) hi = plausible(hi + 3);
    var aWon = margin > 0;
    return { a: aWon ? hi : lo, b: aWon ? lo : hi, aWon: aWon };
  }

  function record(t, o, mine, theirs, conf) {
    t.pf += mine; t.pa += theirs;
    if (mine > theirs) { t.wins++; if (conf) t.confWins++; }
    else { t.losses++; if (conf) t.confLosses++; }
    t.opp.push(o.z);
  }

  /* ---------------- the schedule ---------------- */

  function shuffled(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* PAIRING BY WHO STILL NEEDS THE MOST GAMES. The first version walked each conference in
     a ring and worked out opponents with index arithmetic, which produced the wrong number
     of games for most teams: some played twelve and some played ten, and a ten-game team is
     a team with an easier road to the same record.

     This is the standard way to build a graph from a list of degrees. Take whoever still
     needs the most, give them opponents from the next-neediest, repeat. It cannot get stuck
     while no single team needs more games than everybody else has slots left, which is
     always true here because a conference game count is capped at the conference size. */
  function pairUp(list, want, rng) {
    var rem = [];
    for (var i = 0; i < list.length; i++) rem.push({ t: list[i], n: want(list[i]) });
    var games = [], guard = 0;
    while (guard++ < 20000) {
      var alive = rem.filter(function (r) { return r.n > 0; });
      if (alive.length < 2) break;
      /* Ties broken by a seeded shuffle rather than by name, so a term's five seasons are
         not five copies of one schedule. */
      alive = shuffled(alive, rng).sort(function (a, b) { return b.n - a.n; });
      var head = alive[0], made = 0;
      for (var k = 1; k < alive.length && head.n > 0; k++) {
        games.push({ a: head.t, b: alive[k].t });
        head.n--; alive[k].n--; made++;
      }
      if (!made) break;
    }
    return games;
  }

  /* Conference games first, then whatever is left is bought from outside. A conference too
     small to fill the ledger's conference-game count simply plays fewer of them, which is
     the real consequence of letting a league shrink and is why isDefunct exists. */
  function schedule(teams, world, rng) {
    var want = world.rules.confGames || 9;
    var byConf = {};
    teams.forEach(function (t) { (byConf[t.conference] = byConf[t.conference] || []).push(t); });

    var games = [], count = {};
    var bump = function (g, conf) {
      g.conf = conf; g.neutral = false;
      count[g.a.school] = (count[g.a.school] || 0) + 1;
      count[g.b.school] = (count[g.b.school] || 0) + 1;
      games.push(g);
    };
    for (var c in byConf) {
      var pool = byConf[c];
      if (pool.length < 2) continue;
      var per = Math.min(want, pool.length - 1);
      pairUp(pool, function () { return per; }, rng).forEach(function (g) { bump(g, true); });
    }
    /* Everything still owing is non-conference, and it crosses conference lines because the
       pool is the whole league. */
    pairUp(teams, function (t) {
      return Math.max(0, GAMES - (count[t.school] || 0));
    }, rng).forEach(function (g) { bump(g, false); });
    return games;
  }

  /* ---------------- selection ---------------- */

  /* A RESUME, not a power rating. Wins matter most, who you played matters, and being good
     matters, which is roughly the order a selection committee says it uses. */
  function resume(t) {
    var sos = t.opp.length ? t.opp.reduce(function (s, z) { return s + z; }, 0) / t.opp.length : 0;
    return t.wins * 3.2 - t.losses * 3.0 + t.z * 3.4 + sos * 1.6;
  }

  function champions(teams) {
    var byConf = {};
    teams.forEach(function (t) { (byConf[t.conference] = byConf[t.conference] || []).push(t); });
    var out = [];
    for (var c in byConf) {
      if (byConf[c].length < (L.MIN_CONFERENCE || 4)) continue;
      var sorted = byConf[c].slice().sort(function (x, y) {
        return (y.confWins - y.confLosses) - (x.confWins - x.confLosses) || resume(y) - resume(x);
      });
      out.push({ conference: c, team: sorted[0], standings: sorted });
    }
    return out.sort(function (a, b) { return resume(b.team) - resume(a.team); });
  }

  /* THE FIELD IS THE RULING, MADE OF TEAMS. Every number here is read off the ledger: how
     many seats, how many of them are promised to champions, how many byes. */
  function field(teams, world) {
    var size = Math.max(2, world.playoff.teams || 12);
    var autos = Math.max(0, Math.min(size, world.playoff.autobids || 0));
    var chs = champions(teams);
    var picked = [], seen = {};
    for (var i = 0; i < chs.length && picked.length < autos; i++) {
      picked.push({ team: chs[i].team, how: 'auto', conference: chs[i].conference });
      seen[chs[i].team.school] = true;
    }
    var rest = teams.slice().filter(function (t) { return !seen[t.school]; })
      .sort(function (a, b) { return resume(b) - resume(a); });
    var atLargeFrom = 0;
    while (picked.length < size && atLargeFrom < rest.length) {
      picked.push({ team: rest[atLargeFrom], how: 'at large' });
      seen[rest[atLargeFrom].school] = true;
      atLargeFrom++;
    }
    /* Seeded by resume regardless of how they got in, which is the ordinary way of it. */
    picked.sort(function (a, b) { return resume(b.team) - resume(a.team); });
    picked.forEach(function (p, i) { p.seed = i + 1; });
    /* THE BEST TEAM LEFT OUT is the story every expansion argument is really about. */
    var snub = rest[atLargeFrom] || null;
    /* A PROMISE CAN OUTRUN THE THING IT WAS MADE ABOUT. Guaranteeing eight automatic bids
       when consolidation has left five conferences standing does not create three more
       champions: the seats quietly become at-large, and the guarantee the Group of Five
       fought for turns out to be worth less every time somebody is absorbed. That is a real
       consequence of the map and it should be visible rather than silently absorbed. */
    var unmet = Math.max(0, autos - chs.length);
    return { seats: picked, snub: snub, champions: chs, autobidsUnmet: unmet };
  }

  /* ---------------- the bracket ---------------- */

  function bracket(seats, world, rng) {
    var byes = Math.max(0, Math.min(seats.length - 1, world.playoff.byes || 0));
    var alive = seats.slice();
    var rounds = [];
    /* The byes sit out the first round, which is the whole reason a one seed is worth
       anything. Everybody else pairs best against worst. */
    var waiting = alive.slice(0, byes);
    var playing = alive.slice(byes);
    var guard = 0;
    while ((playing.length + waiting.length) > 1 && guard++ < 12) {
      var ties = [];
      var lo = 0, hi = playing.length - 1;
      while (lo < hi) { ties.push([playing[lo], playing[hi]]); lo++; hi--; }
      var odd = lo === hi ? playing[lo] : null;
      var winners = [];
      var games = [];
      for (var i = 0; i < ties.length; i++) {
        var A = ties[i][0], B = ties[i][1];
        var r = playGame(A.team, B.team, true, rng);
        var w = r.aWon ? A : B, l = r.aWon ? B : A;
        games.push({
          top: A, bottom: B, winner: w, loser: l,
          /* `r.a` IS ALWAYS THE TOP SEED'S POINTS, whoever won. This used to swap the pair
             when the lower seed won, which left the winner correct and the SCOREBOARD
             wrong: the bracket showed the top seed with the upset winner's points, and then
             showed the team it had just beaten playing the next round. Nothing failed,
             because both numbers were real numbers from the same game. */
          /* `r.a` IS ALWAYS THE TOP SEED'S POINTS, whoever won. This used to swap the pair
             when the lower seed won, which left the winner correct and the SCOREBOARD
             wrong: the bracket showed the top seed with the upset winner's points, and then
             showed the team it had just beaten playing the next round. Nothing failed,
             because both numbers were real numbers from the same game, and it took a
             screenshot to see. test_season.mjs now checks every game in six brackets. */
          score: [r.a, r.b],
          margin: Math.abs(r.a - r.b),
        });
        winners.push(w);
      }
      if (odd) winners.push(odd);
      rounds.push(games);
      playing = waiting.concat(winners)
        .sort(function (a, b) { return a.seed - b.seed; });
      waiting = [];
    }
    return { rounds: rounds, champion: playing[0] || alive[0] || null };
  }

  /* ---------------- what the football does back ---------------- */

  /* THE SEASON IS A RULING NOBODY MADE, and it is entitled to an answer from the room. It
     comes back as a ledger edit so it travels the one path everything else travels: the
     blocs read the axes, the meters move, the record carries a line. Nothing in here is a
     new mechanism.

     Each of these is a real argument somebody makes in life about a playoff format, and
     each is measured off the bracket that was just played rather than asserted. */
  function verdict(sim, world) {
    var notes = [];
    var effects = {};
    var first = sim.bracket.rounds[0] || [];
    var blowouts = first.filter(function (g) { return g.margin >= 21; }).length;
    var autos = sim.field.seats.filter(function (s) { return s.how === 'auto'; });
    var autoOut = first.filter(function (g) {
      return g.loser.how === 'auto' && g.margin >= 21;
    });

    if (first.length && blowouts / first.length >= 0.5) {
      notes.push('The first round was not competitive: ' + blowouts + ' of ' + first.length
        + ' games were decided by three scores.');
      effects.inventory = -1.2;
      effects.tradition = -0.8;
    }
    if (autoOut.length >= 2) {
      notes.push(autoOut.length + ' automatic qualifiers lost by three scores or more. '
        + 'The argument that the field is too wide just got its evidence.');
      effects.access = -1.4;
    }
    if (sim.field.autobidsUnmet > 0) {
      notes.push('You have promised ' + (world.playoff.autobids) + ' automatic bids and there '
        + 'are only ' + sim.field.champions.length + ' conferences left to win one. '
        + sim.field.autobidsUnmet + ' of those seats went to at-large teams instead.');
      effects.access = (effects.access || 0) - 1.6;
    }
    if (sim.field.snub) {
      var s = sim.field.snub;
      notes.push(s.school + ' finished ' + s.wins + '-' + s.losses
        + ' and did not make the field, which is the loudest team in the country right now.');
    }
    var champ = sim.bracket.champion;
    if (champ && champ.how === 'auto' && champ.seed > Math.ceil(sim.field.seats.length / 2)) {
      notes.push(champ.team.school + ' won it from the ' + champ.seed
        + ' seed. Nobody is going to argue the field is too big this winter.');
      effects.access = (effects.access || 0) + 2.2;
      effects.tradition = (effects.tradition || 0) + 0.6;
    }
    /* A LONG SEASON IS A TIRED ONE, and the players notice before anybody else does. */
    var rounds = sim.bracket.rounds.length;
    if (rounds >= 4) {
      notes.push('The champion played ' + rounds + ' extra games. The players noticed.');
      effects.labour = -1.1;
      effects.exposure = 0.8;
    }
    /* Money follows inventory: more games worth watching is more to sell. */
    var played = sim.bracket.rounds.reduce(function (t, r) { return t + r.length; }, 0);
    effects.money = (effects.money || 0) + Math.min(2.4, played * 0.18);
    effects.inventory = (effects.inventory || 0) + Math.min(2.0, played * 0.15);

    for (var k in effects) effects[k] = Math.round(effects[k] * 100) / 100;
    return {
      notes: notes,
      edit: {
        id: 'season:' + world.year,
        label: 'The ' + world.year + ' season'
          + (champ ? ', won by ' + champ.team.school : ''),
        set: {}, move: {}, aimed: {}, effects: effects,
      },
    };
  }

  /* ---------------- the season ---------------- */

  function play(world, teamSeasons, rng) {
    var teams = league(world, teamSeasons);
    if (teams.length < 8) return null;
    var games = schedule(teams, world, rng);
    games = shuffled(games, rng);
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      var r = playGame(g.a, g.b, g.neutral, rng);
      record(g.a, g.b, r.a, r.b, g.conf);
      record(g.b, g.a, r.b, r.a, g.conf);
      g.score = [r.a, r.b];
    }
    var f = field(teams, world);
    var br = bracket(f.seats, world, rng);
    var sim = {
      year: world.year,
      teams: teams.slice().sort(function (a, b) { return resume(b) - resume(a); }),
      field: f,
      bracket: br,
      games: games,
      /* True only for the first season of a term: after that the schools are real and the
         seasons are not, and the screen has to be able to say so. */
      fromRealData: world.year === world.startYear,
    };
    var v = verdict(sim, world);
    sim.notes = v.notes;
    sim.edit = v.edit;
    return sim;
  }

  var api = {
    play: play, league: league, schedule: schedule, field: field,
    bracket: bracket, champions: champions, resume: resume,
    playGame: playGame, plausible: plausible, moneyDrift: moneyDrift,
    GAMES: GAMES, Z_TO_POINTS: Z_TO_POINTS, HOME: HOME, NOISE: NOISE,
  };
  root.PS_CFB_SEASON = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
