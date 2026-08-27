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
  /* The host sites, for pricing the one game this office actually places. Optional: a caller
     without it gets a final worth exactly what it was worth before. */
  var V = root.PS_CFB_VENUES || (typeof require === 'function' ? require('./venues.js') : null);
  /* THE SPORT DOES NOT STAND STILL, and it used to: team strength was taken from the season
     the term began and frozen, so the same team won four titles in five. See churn.js. */
  var CH = root.PS_CFB_CHURN || (typeof require === 'function' ? require('./churn.js') : null);
  /* THE GAMES THAT WERE ON THE CALENDAR BEFORE ANYBODY DREW A CONFERENCE. Optional: without
     it the schedule is filled by conference and then at random, which is what it did before
     and which produced a sport where Ohio State played Michigan one year in five. */
  var RV = root.PS_CFB_RIVALS || (typeof require === 'function' ? require('./rivals.js') : null);

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
     year the term began. A school that left the data (a defunct program, or one this
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
    /* THE POT, NOT THE LEAGUE. The money is split five ways and the sport has eleven leagues
       in it, so a Sun Belt school is paid out of the Group of Five share and has to be looked
       up under that name. Reading `share['Sun Belt']` finds nothing and drifts by zero, which
       is how starving a bloc to nothing could leave sixty-seven teams playing exactly as well
       as before. */
    var pot = L.blocOf ? L.blocOf(conference) : conference;
    if (!pot) return 0;
    var now = (world.money.share || {})[pot];
    var was = (L.OPENING_SHARE || {})[pot];
    if (now == null || was == null || !was) return 0;
    var years = Math.max(0, world.year - world.startYear);
    var d = ((now - was) / was) * MONEY_GAIN * Math.min(years, 6) / 6;
    return Math.max(-MONEY_CAP, Math.min(MONEY_CAP, d));
  }

  /* WHAT THE ONE WAY DOOR DID TO THE FOOTBALL, and the reason it is a decision rather than a
     posture. A player who declared for the draft, went undrafted and came back is a
     twenty-four year old who has been coached by professionals for a year, and he does not
     come back to the school that recruited him out of a small town. He comes back to a
     program that can pay him and start him, and those are the same twenty schools every
     time. So an open door concentrates, cumulatively, in the shape moneyDrift already has:
     small per year, and by year four it is the difference between a league and a procession.

     IT HAS TO BE A REDISTRIBUTION, because playGame reads `a.z - b.z` and adding the same
     number to every team cancels out perfectly. That much was obvious. What was not is that a
     level shift does NOT cancel in viewers(), which reads how good the two teams ARE rather
     than how far apart.

     AND THE FIRST VERSION GOT THE AXIS WRONG, which is what made that bite. It moved the four
     power conferences up and everybody else down, which is the sentence everybody says about
     this and was not what the data could express at the time: the season was then played by
     seventy schools of which sixty-seven WERE the four powers, so the Group of Five was a bloc
     and a line in the money table rather than teams. Lifting sixty-seven of seventy is a level
     shift by another name, and it showed: an open door drew 2.50 a game at year five against
     1.29 for a shut one, a ninety per cent swing off one setting, which would have swamped the
     pool settlement the audience is priced through, while the number it was supposed to move,
     who reached the bracket, did not move at all.

     The whole division is on the field now, so the axis the first version reached for finally
     exists. It stays wrong anyway, for the reason below: what an open door does is concentrate
     talent at the top of the sport, and the top of the sport is not a conference.

     SO IT STRETCHES RATHER THAN LIFTS. Each team is scaled by its own strength, which pulls
     the league away from its middle: the top gets further from the pack, the bottom falls off
     it, the mean barely moves so the audience barely moves, and the number that changes is
     how many schools can still win. Which is the argument.

     A CONFERENCE MAY HAVE ITS OWN RULE, and then the split is between the leagues that allow
     it rather than between power and everybody else, which is precisely the mess the Big Ten
     made by going first.

     THE CAP IS A RAIL, NOT THE MECHANIC. Set at 0.16 against a gain of 0.34 it bound for
     every team above z 0.47, which is most of the top of the league, so the proportional
     stretch flattened into a step: everybody good got the same +0.16 and the difference
     between a league that shut its door alone and one that shut it with everybody was clipped
     to nothing. The gain is now small enough to be the whole effect and the cap only catches
     a z the data does not contain. */
  var REENTRY_GAIN = 0.14;
  var REENTRY_CAP = 0.3;
  /* Which rule a given conference is living under, which is the national one unless it has
     written its own and this office let it. */
  function reentryRule(world, conference) {
    var lab = world.labour || {};
    if (lab.rulesBy === 'conference') {
      var own = (lab.confReentry || {})[conference];
      if (own) return own;
    }
    return lab.reentry;
  }
  function reentryDrift(world, conference, z) {
    var lab = world.labour || {};
    var years = Math.max(0, world.year - world.startYear);
    if (!years || z == null) return 0;
    var ramp = REENTRY_GAIN * Math.min(years, 5) / 5;
    var rule = reentryRule(world, conference);
    var k = 0;
    if (rule === 'open') k = ramp;
    else if (rule === 'window') k = ramp * 0.35;
    else if (rule === 'closed') k = -ramp * 0.5;
    /* AND A LEAGUE THAT SHUT ITS OWN DOOR WHILE THE ONES NEXT TO IT DID NOT pays for it
       twice: it loses the men who left and it loses the ones who would have come back to a
       rival instead. This is the whole cost of going first, and it lands on the whole league
       rather than on its best teams, because everybody in it is recruiting against the same
       open door next door. */
    var flat = 0;
    if (lab.rulesBy === 'conference') {
      var mine = rule;
      var openElsewhere = Object.keys(lab.confReentry || {})
        .filter(function (c) { return c !== conference; })
        .map(function (c) { return (lab.confReentry || {})[c] || lab.reentry; })
        .filter(function (r) { return r === 'open'; }).length;
      if (mine !== 'open' && openElsewhere) flat = -ramp * 0.5 * Math.min(3, openElsewhere) / 3;
    }
    var d = k * z + flat;
    return Math.max(-REENTRY_CAP, Math.min(REENTRY_CAP, d));
  }

  function league(world, teamSeasons) {
    var base = baselines(teamSeasons, world.startYear);
    var years = Math.max(0, world.year - world.startYear);

    /* WHERE EVERY PROGRAM IS THIS YEAR, before anything this office did to it. Year one is
       the real season and returns the baseline untouched; every year after regresses toward
       that school's own level, takes a shock the size of its own volatility, and lives with
       whatever the carousel did. */
    var roster = [];
    for (var school in world.membership) {
      var b = base[school];
      if (!b) continue;
      var baseZ = b.strength_z || 0;
      roster.push({ school: school, b: b, baseZ: baseZ,
        nowZ: CH ? CH.strengthOf(school, baseZ, teamSeasons, world.seed, years) : baseZ });
    }

    /* AND THEN RECENTERED, BECAUSE A Z IS A Z. This is not a tidying step, it is the
       definition of the quantity: strength_z is standardised within its season, so the mean
       of a real season is zero by construction and an invented one has to be as well.

       Without it the whole sport quietly got better every year. The carousel only fires on
       programs that are UNDER their own level, and a hire is worth a little more than
       nothing on average, so every December injected a small positive number into the league
       and never a negative one. Regression then fed each year's inflated figure into the
       next. Measured, the league mean ran 0.00, 0.24, 0.49, 0.61, 0.71 across a five year
       term: by year five the average team in the sport rated three quarters of a standard
       deviation above the average team in the sport.

       NOTHING FAILED AND NOTHING LOOKED WRONG, which is the whole problem with it. Every
       scoreline was plausible, every record was plausible, and the only visible symptom was
       that viewership rose every single year no matter what the office did, so the item about
       an unbeaten team nobody is watching became unreachable and the audience meter stopped
       being something a player could damage. */
    if (years && roster.length) {
      var mu = 0;
      for (var i = 0; i < roster.length; i++) mu += roster[i].nowZ;
      mu /= roster.length;
      for (var j = 0; j < roster.length; j++) roster[j].nowZ -= mu;
    }

    var out = [];
    roster.forEach(function (r) {
      var conf = world.membership[r.school];
      out.push({
        school: r.school,
        conference: conf,
        abbr: r.b.abbreviation || r.school,
        color: r.b.color || '#64748b',
        /* What the season the term opened on had them at, kept so the carousel and the year
           in review can talk about how far a program has moved. */
        baseZ: r.baseZ,
        z: r.nowZ + moneyDrift(world, conf)
          + reentryDrift(world, conf, r.nowZ),
        off: r.b.pts_scored_mean || 24,
        offSd: r.b.pts_scored_sd || 10,
        def: r.b.pts_allowed_mean || 24,
        from: r.b.season,
        wins: 0, losses: 0, confWins: 0, confLosses: 0,
        pf: 0, pa: 0, opp: [], beat: [], lostTo: [],
      });
    });
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
    /* WHO YOU BEAT AND WHO BEAT YOU, kept apart rather than averaged together. A mean
       opponent strength cannot tell a 12-1 team that beat the best team it played from a
       12-1 team that lost to the only good one on its schedule, and those are not the same
       season. `resume` reads these two lists. */
    if (mine > theirs) { t.wins++; if (conf) t.confWins++; t.beat.push(o.z); }
    else { t.losses++; if (conf) t.confLosses++; t.lostTo.push(o.z); }
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
  /* NOBODY PLAYS ANYBODY TWICE, which this did not enforce and should have. The pairing walks
     the neediest team and hands it opponents off the top of the list, and nothing stopped it
     handing out the same opponent it had already been given in an earlier phase or an earlier
     pass. About thirteen pairs a season met twice in one regular season, which is not a thing
     that happens and reads as a rendering fault when it turns up in two different weeks.

     It got worse rather than better once the rivalries went on first, because those are
     thirty-six fixed pairings the later phases knew nothing about: The Game could be played
     in September and again in November.

     `seen` is shared across every phase of one schedule, so the rivalries, the conference
     slates, the guarantee games and the leftovers all avoid each other. */
  var pairKey = function (a, b) {
    return a.school < b.school ? a.school + '|' + b.school : b.school + '|' + a.school;
  };
  function pairUp(list, want, rng, seen) {
    var used = seen || {};
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
        var key = pairKey(head.t, alive[k].t);
        if (used[key]) continue;
        used[key] = 1;
        games.push({ a: head.t, b: alive[k].t });
        head.n--; alive[k].n--; made++;
      }
      /* A TEAM WITH NOBODY NEW LEFT TO PLAY IS DONE, and forcing it a game would mean a
         repeat. Dropping it from the pool rather than breaking the whole loop is what keeps
         everybody ELSE on twelve. */
      if (!made) {
        head.n = 0;
        continue;
      }
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
      g.conf = conf; if (g.neutral == null) g.neutral = false;
      count[g.a.school] = (count[g.a.school] || 0) + 1;
      count[g.b.school] = (count[g.b.school] || 0) + 1;
      games.push(g);
    };

    /* ---- the rivalries, first, before anything else is drawn ----
       PROTECTED MEANS PLACED FIRST and that is the whole mechanism. Filling conferences and
       then buying the rest at random gave a sport with no history in it: Ohio State played
       Michigan in about one year of five, and when they did it was worth the same as any
       other Saturday. See rivals.js.

       A rivalry inside a conference is a conference game and comes out of that budget; one
       across conferences is played anyway and comes out of both schools' non-conference
       dates, which is exactly what it costs two real schools to keep one alive after a
       realignment. */
    var byName = {};
    teams.forEach(function (t) { byName[t.school] = t; });
    var confDone = {};
    /* ONE SET OF PAIRINGS FOR THE WHOLE SCHEDULE, shared by every phase below. */
    var seen = {};
    if (RV) {
      RV.playable(byName).forEach(function (r) {
        var A = byName[r.a], B = byName[r.b];
        var sameConf = A.conference === B.conference;
        var g = { a: A, b: B, rivalry: r.id, rivalryName: r.name,
          /* WHERE IT WANTS TO BE PLAYED. weekify honors it when both sides are free. */
          want: r.week, neutral: !!r.neutral };
        seen[pairKey(A, B)] = 1;
        bump(g, sameConf);
        if (sameConf) {
          confDone[A.school] = (confDone[A.school] || 0) + 1;
          confDone[B.school] = (confDone[B.school] || 0) + 1;
        }
      });
    }

    for (var c in byConf) {
      var pool = byConf[c];
      if (pool.length < 2) continue;
      var per = Math.min(want, pool.length - 1);
      /* MINUS WHATEVER A RIVALRY ALREADY BOOKED. Without this a pair inside one conference
         gets its rivalry AND a full conference slate, so two schools play thirteen games and
         each other twice. */
      pairUp(pool, function (t) {
        return Math.max(0, per - (confDone[t.school] || 0));
      }, rng, seen).forEach(function (g) { bump(g, true); });
    }
    /* ---- the guarantee game ----
       A POWER SCHOOL BUYS A HOME GAME AND THE VISITOR CASHES THE CHECK. This is how
       non-conference scheduling actually works and leaving it out was the single biggest
       thing wrong with the league once the whole division was on the field.

       Drawing every non-conference game at random from a hundred and thirty-six teams meant
       a Mountain West team could play its entire schedule without meeting anybody good: San
       Diego State went 13-0 having beaten nobody above z 0.5 and took the seventh seed in the
       playoff. Undefeated outsiders arrived at 1.73 a season, which is two or three times what
       the sport produces, and they arrived because nobody had made them go to Columbus in
       September.

       So each team outside the power four is sent to one power school, on the road, before
       anything else is drawn. That is the trip that puts a loss on the record, and the check
       for it is a third of their football budget, which is a line the Group of Five already
       says on the docket and now has a game behind it. */
    var owes = function (t) { return Math.max(0, GAMES - (count[t.school] || 0)); };
    var pot = function (t) { return L.blocOf ? L.blocOf(t.conference) : t.conference; };
    var hosts = shuffled(teams.filter(function (t) {
      var p = pot(t); return p && p !== 'Group of Five' && owes(t) > 0;
    }), rng);
    var visitors = shuffled(teams.filter(function (t) {
      return pot(t) === 'Group of Five' && owes(t) > 0;
    }), rng);
    /* WHOEVER IS SHORT DECIDES HOW MANY GET PLAYED, and the mode has to survive both
       directions: consolidate the sport down to two conferences and there are barely any
       hosts, break it up and there are barely any visitors. Neither should throw. */
    var trips = Math.min(hosts.length, visitors.length);
    for (var n = 0; n < trips; n++) {
      /* The power school is `a`, which is the side playGame gives the home points to. */
      var key = pairKey(hosts[n], visitors[n]);
      if (seen[key]) continue;
      seen[key] = 1;
      bump({ a: hosts[n], b: visitors[n] }, false);
    }

    /* Everything still owing is non-conference, and it crosses conference lines because the
       pool is the whole league. */
    pairUp(teams, owes, rng, seen).forEach(function (g) { bump(g, false); });
    return games;
  }

  /* ---------------- the weeks ----------------
     A SEASON YOU CANNOT WATCH IS A NUMBER THAT ARRIVES IN DECEMBER. The whole regular season
     used to be played in one loop the instant the ninth beat rolled over, which meant the
     five beats between Media days and the year in review had nothing in them: September,
     October and November existed on the calendar and nowhere else, and Championship weekend
     and the playoff were guaranteed empty desks. A third of the mode was pressing a button
     that said nothing was happening.

     So the schedule gets weeks and the season is played in segments. September is weeks one
     to four, October five to eight, November nine to twelve, and the last two beats are the
     conference title games and the bracket. The office shows the standings while it happens.

     Greedy coloring, lowest free week first, which is enough: a team plays twelve games in
     twelve weeks and every game only needs a week where neither side is already busy. */
  /* FOURTEEN WEEKS FOR TWELVE GAMES, which is what a real season is: everybody gets a bye or
     two. It is also what makes the coloring possible. A team plays twelve games, so twelve
     weeks is the theoretical floor and no greedy assignment reaches it; the first version
     used twelve, quietly pushed the overflow into weeks thirteen and fourteen, and then
     dropped those games on the floor because the season only played through week twelve.
     Teams finished 8-0 and 13-0 in the same league and nothing failed. */
  var WEEKS = 14;

  function weekify(games, rng) {
    /* Restarts, because greedy edge coloring is order dependent: one shuffle overflows and
       the next one does not. Cheap enough to simply try again. */
    var best = null;
    for (var attempt = 0; attempt < 40; attempt++) {
      var busy = {}, max = 0;
      /* A GAME THAT WANTS A DATE GETS ASKED FIRST. The rivalries carry `want`, and the whole
         shape of the sport's November is that those games are on the last Saturday: color
         them into the shuffle with everything else and The Game lands in week three.

         `want` is a preference and never a requirement. If both sides are busy it takes the
         next free week the ordinary way, which is what a conference office does with a date
         two schools both want. */
      var order = shuffled(games, rng).sort(function (x, y) {
        return (y.want ? 1 : 0) - (x.want ? 1 : 0);
      });
      order.forEach(function (g) {
        var w = g.want || 1;
        while (busy[w + '|' + g.a.school] || busy[w + '|' + g.b.school]) w++;
        /* AND IT NEVER RUNS OFF THE END CHASING ONE. A wanted week late in the year with both
           sides busy would otherwise walk past week fourteen and stretch the season for
           everybody, so a game that cannot have its date falls back to the front. */
        if (w > WEEKS) {
          w = 1;
          while (busy[w + '|' + g.a.school] || busy[w + '|' + g.b.school]) w++;
        }
        busy[w + '|' + g.a.school] = 1;
        busy[w + '|' + g.b.school] = 1;
        g.week = w;
        if (w > max) max = w;
      });
      var snap = games.map(function (g) { return g.week; });
      if (!best || max < best.max) best = { max: max, weeks: snap };
      if (max <= WEEKS) break;
    }
    /* WHATEVER IT TOOK, NOTHING IS THROWN AWAY. If forty tries could not fit the schedule
       into fourteen weeks the season simply runs longer, because a game that exists and is
       never played is the failure this whole block is here to prevent. */
    games.forEach(function (g, i) { g.week = best.weeks[i]; });
    return { games: games, weeks: Math.max(WEEKS, best.max) };
  }

  /* ---------------- who watched ----------------
     THE NUMBER THE WHOLE ECONOMY HANGS OFF, and until now the mode had no idea whether
     anybody was watching. Money came out of a formula and inventory was a count of games,
     which meant a commissioner could hollow out every Saturday in the sport and the ledger
     would report the same revenue.

     Viewership is what a television deal is actually bought on, so it is built the way one
     is valued: two good teams beat one, a conference game beats a body-bag game, November
     beats September, and a game between two teams who are still alive is worth more than the
     same two teams in week two. All of that is downstream of rulings the player makes.

     Millions of viewers, on a scale set against the real thing: a nothing game is well under
     a million, a good conference game is three or four, and the two or three biggest games
     of a season clear ten. */
  var VIEW_BASE = 0.55;
  var VIEW_QUALITY = 1.75;
  var VIEW_CONF = 1.28;
  var VIEW_LATE = 0.055;
  /* ONE STAGE MULTIPLIER, NEVER TWO. The first version applied a round multiplier ON TOP of
     the week scaling, and the two compounded: a national championship game came out at 78
     million against a real one that draws about 22, and a conference title game at 27 against
     a real 16. A postseason game is not a regular season game in a later week, it is its own
     thing, so it takes its own number and skips the week curve entirely.

     Set against what these actually draw: a title game around 20 to 25 million, semi-finals
     mid teens, quarters around ten, a first round game closer to a good Saturday than to a
     final, and the two biggest conference championships in the same range as the quarters. */
  var VIEW_TITLE = 2.15;
  var VIEW_ROUND = [1.6, 2.5, 3.1, 3.5, 3.6];
  /* AND A BOWL TAKES ITS OWN NUMBER FOR THE SAME REASON, indexed by the bowl's tier. Set
     against what these really draw: a New Year's Day bowl outside the bracket in the mid
     single millions, a Citrus or an Alamo three or four, and a Pinstripe or a Bahamas Bowl
     around one, which is a weekday afternoon game with nothing on it and is exactly why
     people love them. */
  var VIEW_BOWL = [0.8, 0.9, 1.7, 2.4];

  /* WHAT AN AUDIENCE IS WORTH, in billions a year per million viewers a game. Not a guess:
     the untouched sport draws 1.87 a game, measured across forty seeds, and the ledger opens
     the pool at $1.3B, so this is 1.3 / 1.87 and the sport starts its term exactly breaking
     even. Everything after that is the commissioner's doing. See the settlement in verdict()
     for what the difference then costs.

     REFIT WHEN THE LEAGUE GREW, and it had to be. At seventy schools the untouched sport drew
     1.698 and this was 0.765, which broke even to within a thousandth. The whole division
     draws 1.869, because a hundred and thirty-six teams beating each other up leaves more
     clubs with a loss column worth watching deeper into the year, so the same 0.765 handed
     every commissioner a $130M surplus in year one for doing nothing at all, and the sentence
     above stopped being true.

     ONE CONSTANT CANNOT SERVE BOTH LEAGUES and this one is fitted to the league that ships. A
     term played on the fallback file, which happens only when cfb_fbs.json is missing or
     malformed, opens about $120M in deficit instead of level. That is a broken deploy rather
     than a game state, the console says so when it happens, and pricing for it would mean
     mispricing every real term to be right about a failure. */
  var WORTH_PER_M = 0.696;

  /* THE BOOKS, FOR ANYBODY WHO NEEDS THEM BEFORE A SEASON HAS BEEN PLAYED. The verdict settles
     the pool against the season that just happened; the desk has to price a pool the player is
     STILL DRAGGING, against the audience the sport has been drawing so far. Same arithmetic
     either way, so it lives in one function rather than in two that drift.

     `perGame` is millions of viewers a game. Null when nothing has been played yet, which is a
     real state in year one and has to come back as "not known" rather than as zero: a sport
     that has drawn nothing is worth nothing, and saying so before a ball is kicked would tell
     a first year commissioner they are $1.3B in the hole. */
  function settle(pool, perGame) {
    if (!perGame) return { pool: pool, worth: null, gap: null, known: false };
    var worth = Math.round(perGame * WORTH_PER_M * 1000) / 1000;
    /* `+ 0` because a pool that breaks even to the penny rounds to NEGATIVE ZERO, and the
       screens print this. "-0" beside "the books are level" is the kind of thing a player
       screenshots. */
    return { pool: pool, worth: worth, gap: Math.round((pool - worth) * 100) / 100 + 0, known: true };
  }

  function viewers(g, world) {
    var a = g.a, b = g.b;
    /* Both sides matter and the WORSE one matters more, because a mismatch is not a game.
       The geometric mean does that on its own: a 2.0 against a 0.0 is worth less than two
       1.0s, which is exactly the argument against a nine win team playing a cupcake. */
    var qa = Math.max(0.15, a.z + 1.4), qb = Math.max(0.15, b.z + 1.4);
    var quality = Math.sqrt(qa * qb);
    var v = VIEW_BASE * Math.pow(quality, VIEW_QUALITY);
    if (g.conf) v *= VIEW_CONF;
    /* A LOSS COLUMN KILLS A TELEVISION WINDOW. Two unbeaten teams in November is the game of
       the year; the same two at four and four is a Saturday nobody sets an alarm for. */
    var alive = (a.losses <= 1 ? 1 : a.losses <= 2 ? 0.72 : 0.5)
      * (b.losses <= 1 ? 1 : b.losses <= 2 ? 0.72 : 0.5);
    v *= 0.55 + 0.45 * alive * 2;

    if (g.round != null) {
      v *= VIEW_ROUND[Math.min(g.round, VIEW_ROUND.length - 1)];
      /* WHERE THE FINAL IS PLAYED IS WORTH SOMETHING, and it is the only game in the year
         this office actually places. A dome in a city people want a week in outdraws a
         January night outdoors in a market that has never asked for one. Applied to the last
         round only: the earlier ones are on campus or wherever the bracket put them, which is
         `playoff.sites` and a different argument. */
      if (g.finalRound && world.venues && world.venues.title && V) {
        var host = V.venue(world.venues.title);
        if (host) v *= host.draw;
      }
    } else if (g.bowl && V) {
      /* A BOWL IS ITS OWN THING TOO, and skipping the week curve here matters more than it
         looks: a bowl is played in week sixteen, so left in the regular season branch below
         a Bahamas Bowl between two seven win teams would have outdrawn a top ten game in
         November purely for being late. */
      var bw = V.bowl(g.bowl);
      if (bw) {
        v *= VIEW_BOWL[Math.max(0, Math.min(bw.tier, VIEW_BOWL.length - 1))];
        /* WHERE IT IS PLAYED IS PART OF WHY PEOPLE WATCH, but far less than for the final:
           nobody tunes in to a bowl for the city, and a few do turn it off for one. */
        var bv = V.venue(bw.venue);
        if (bv) v *= 0.85 + 0.15 * bv.draw;
      }
    } else if (g.title) {
      v *= VIEW_TITLE;
    } else {
      /* November is worth more than September and the reason is stakes, so it scales with how
         many teams are still alive, which is a thing the playoff format decides. */
      v *= 1 + VIEW_LATE * (g.week || 1) * (1 + ((world.playoff.teams || 12) - 12) * 0.02);
    }
    return Math.round(v * 100) / 100;
  }

  /* ---------------- conference championship weekend ----------------
     THE BEAT THAT WAS ALWAYS EMPTY. A champion used to be whoever finished top of the table,
     which is tidy and is not what happens: the top two play, and the one that wins goes to
     the playoff whatever the table said in the morning. That is a Saturday with six games on
     it and it was being skipped. */
  function titleGames(teams, world, rng) {
    var byConf = {};
    teams.forEach(function (t) { (byConf[t.conference] = byConf[t.conference] || []).push(t); });
    var out = [];
    for (var c in byConf) {
      if (byConf[c].length < (L.MIN_CONFERENCE || 4)) continue;
      var sorted = byConf[c].slice().sort(function (x, y) {
        return (y.confWins - y.confLosses) - (x.confWins - x.confLosses) || resume(y) - resume(x);
      });
      var a = sorted[0], b = sorted[1];
      if (!b) { out.push({ conference: c, team: a, standings: sorted, walkover: true }); continue; }
      var r = playGame(a, b, true, rng);
      record(a, b, r.a, r.b, true);
      record(b, a, r.b, r.a, true);
      var g = { a: a, b: b, conf: true, neutral: true, title: true, week: WEEKS + 1,
        score: [r.a, r.b], conference: c };
      g.viewers = viewers(g, world);
      out.push({ conference: c, team: r.aWon ? a : b, runnerUp: r.aWon ? b : a,
        standings: sorted, game: g });
    }
    return out.sort(function (x, y) { return resume(y.team) - resume(x.team); });
  }

  /* ---------------- selection ---------------- */

  /* A RESUME, not a power rating: who you beat, who beat you, and how good you look.
     Everything that reaches the bracket is ordered by this, so it is the single number that
     decides who plays for the title.

     IT USED TO COUNT WINS AND THEN ADD THE AVERAGE OPPONENT ON TOP, and that was fine for as
     long as the league was sixty-seven power schools playing each other, because every team
     in it had roughly the same schedule. Put the whole division on the field and it breaks in
     the most visible way there is: a 12-1 Mountain West champion scored 36.8 against a 10-3
     SEC champion's 28.1, so the five automatic bids went to Texas Tech, Indiana, James
     Madison, Florida State and UNLV, and THE SEC WAS NOT IN THE PLAYOFF. Nothing failed and
     nothing looked odd in the code. It is the first thing a college football fan would see.

     The problem is that a flat wins term pays the same for beating Alabama and beating an
     0-12 team, and a mean opponent cannot tell a 12-1 team that beat the best side it played
     from a 12-1 team that lost to the only good one on its schedule.

     SO EVERY GAME IS PRICED BY WHO IT WAS AGAINST. A win is worth more the better they were.
     A loss costs less the better they were, and floors out rather than going free, because a
     loss is a loss. Then the team's own rating goes on top, which is the eye test.

     FITTED, NOT CHOSEN. Against how the real twelve-team format actually fills: five
     conference champions, of whom about one is from outside the power four (2024 gave
     Oregon, Georgia, Boise State, Arizona State, Clemson), and no power conference shut out
     of the field altogether. An undefeated outsider still gets left out sometimes, which is
     a real story in this sport and has a docket item about it. */
  var WIN_BASE = 2.2;    /* what beating anybody is worth */
  var WIN_SLOPE = 1.5;   /* and how much more it is worth per point of them */
  var LOSS_BASE = 3.4;   /* what any loss costs */
  var LOSS_SLOPE = 1.1;  /* and how much of that is forgiven for who beat you */
  var LOSS_FLOOR = 0.9;  /* but never all of it */
  var RATING = 3.4;      /* the eye test */
  function resume(t) {
    var s = t.z * RATING;
    var beat = t.beat || [];
    for (var i = 0; i < beat.length; i++) s += WIN_BASE + beat[i] * WIN_SLOPE;
    var lost = t.lostTo || [];
    for (var j = 0; j < lost.length; j++) {
      s -= Math.max(LOSS_FLOOR, LOSS_BASE - lost[j] * LOSS_SLOPE);
    }
    return s;
  }

  /* WHO WON EACH CONFERENCE. `titles` is the result of championship weekend when it has been
     played, and this falls back to the table when it has not, because the standings screen
     asks the same question in October and there is no title game to read yet. */
  function champions(teams, titles) {
    if (titles && titles.length) return titles;
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
  function field(teams, world, titles) {
    var size = Math.max(2, world.playoff.teams || 12);
    var autos = Math.max(0, Math.min(size, world.playoff.autobids || 0));
    /* THE CHAMPION IS WHO WON THE TITLE GAME, not who topped the table. Championship weekend
       is played before the field is picked, so an automatic bid can and does go to a team
       that lost the regular season standings and won the Saturday, which is the whole reason
       that Saturday exists. */
    var chs = champions(teams, titles);
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

  /* ---------------- the poll ----------------
     COLLEGE FOOTBALL ARGUES ABOUT A LIST OF TWENTY-FIVE NAMES FOR FOUR MONTHS and the mode
     did not have one. Every other sport's regular season is a table; this one's is a weekly
     opinion poll that decides who is talked about, who is on television, and half of what a
     commissioner gets shouted at about. Playing a season without it is playing a different
     sport.

     A POLL IS NOT A RANKING, IT IS LAST WEEK'S RANKING WITH THIS WEEK DONE TO IT. That is the
     whole behavior and it is why fans complain about it: a preseason number follows a team
     into October, a good side climbs three spots a week no matter how well it plays, and a
     loss drops you further than a win lifts you. Sorting by resume every week would produce a
     correct list that nobody would recognize.

     SO IT IS BLENDED IN RANK SPACE, not in score space. A resume is worth about three points
     in week one and forty by December, so blending the numbers themselves would let one
     November Saturday outweigh the entire preseason. A RANK is on the same scale in week one
     as in week fourteen, which is what makes inertia mean the same thing all year. */
  var POLL_INERTIA = 0.45;
  var POLL_SIZE = 25;

  /* AND A PRESEASON POLL IS A GUESS, WHICH IS THE POINT OF IT. Ranking August by each team's
     strength makes the poll an oracle: it is sorted by the exact number that then decides
     every game, so seventy-two per cent of the preseason top ten was still in the top ten in
     December against a real rate near a half. Nobody would ever be wrong about August, and
     being wrong about August is most of why anybody argues about this list at all.

     So August gets an error the size of a real one. Deterministic per school per year, so a
     term replays identically and the team that was overrated in 2027 is overrated in 2027
     every time that save is loaded. Off its own hash rather than off the season's rng, because
     the poll is built after the football is played and pulling draws here would quietly
     reshuffle the bracket.

     FITTED AGAINST HOW WRONG AUGUST REALLY IS: about half a real preseason top ten is still in
     the top ten in December. At 0.6 this gives fifty per cent. At 0.85 it gives forty, which
     is a sport where the preseason poll tells you nothing, and at zero it gives seventy-two,
     which is a sport where it tells you everything. */
  var PRESEASON_ERROR = 0.6;
  function pollHash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function pollGauss(seed, school) {
    var a = (pollHash(seed + '|' + school + '|pa') % 100000) / 100000;
    var b = (pollHash(seed + '|' + school + '|pb') % 100000) / 100000;
    return Math.sqrt(-2 * Math.log(Math.max(1e-6, a))) * Math.cos(2 * Math.PI * b);
  }

  /* WHAT VOTERS SEE, WHICH IS NOT WHAT A COMMITTEE SEES. Same shape as resume() above, and
     deliberately so, with one number changed: the eye test counts for far less.

     A SELECTION COMMITTEE SAYS OUT LOUD THAT IT RATES TEAMS; A POLL RANKS RECORDS. Running the
     poll on the committee's own resume put an 11-1 Texas Tech first ahead of four undefeated
     teams, because its rating was the highest in the sport and the rating term is worth three
     and a half places on its own. That is a defensible bracket seed and it is not a poll
     anybody has ever seen: nothing gets a voter shouted at faster than putting a one loss team
     above an unbeaten one. At 0.9 the record decides it and the eye test breaks ties, which is
     the right way round for this list. */
  var POLL_RATING = 0.9;
  function resumeOf(a) {
    var s = a.z * POLL_RATING;
    for (var i = 0; i < a.beat.length; i++) s += WIN_BASE + a.beat[i] * WIN_SLOPE;
    for (var j = 0; j < a.lostTo.length; j++) {
      s -= Math.max(LOSS_FLOOR, LOSS_BASE - a.lostTo[j] * LOSS_SLOPE);
    }
    return s;
  }

  function pollSeason(teams, played, through, seed) {
    if (!teams.length) return [];
    var acc = {}, order = [], hunch = {};
    teams.forEach(function (t) {
      acc[t.school] = { z: t.z, beat: [], lostTo: [], wins: 0, losses: 0, t: t };
      order.push(t.school);
      /* WHAT AUGUST THINKS THEY ARE, which is what they are plus how wrong everybody is. */
      hunch[t.school] = t.z + pollGauss(String(seed), t.school) * PRESEASON_ERROR;
    });
    /* RANKED BY WHAT THEY ARE EXPECTED TO BE, which is what a preseason poll is: nobody has
       played anybody, so it is last year plus whoever is back plus a hunch. */
    var rank = {};
    order.slice().sort(function (x, y) { return hunch[y] - hunch[x]; })
      .forEach(function (s, i) { rank[s] = i + 1; });

    var out = [];
    var snapshot = function (week, prev) {
      var top = order.slice().sort(function (x, y) { return rank[x] - rank[y]; })
        .slice(0, POLL_SIZE)
        .map(function (s, i) {
          var t = acc[s].t;
          return {
            school: s, conference: t.conference, color: t.color,
            rank: i + 1,
            wins: acc[s].wins, losses: acc[s].losses,
            /* HOW FAR THEY MOVED, which is the only part of a poll anybody reads first.
               Null in the preseason, because there is nothing to have moved from. */
            move: prev && prev[s] != null ? prev[s] - (i + 1) : null,
            /* AND WHETHER THEY WERE IN IT AT ALL LAST WEEK. "New" is a different story from
               "up nine" and the screens need to be able to tell them apart. */
            fresh: !!(prev && prev[s] == null),
          };
        });
      out.push({ week: week, top: top });
      var placed = {};
      top.forEach(function (r) { placed[r.school] = r.rank; });
      return placed;
    };
    var prev = snapshot(0, null);

    for (var n = 1; n <= through; n++) {
      var beaten = {};
      for (var i = 0; i < played.length; i++) {
        var g = played[i];
        if (g.week !== n) continue;
        var w = acc[g.winner.school], l = acc[g.loser.school];
        if (!w || !l) continue;
        w.wins++; w.beat.push(g.loser.z);
        l.losses++; l.lostTo.push(g.winner.z);
        beaten[g.loser.school] = true;
      }
      /* THIS WEEK'S OPINION, then dragged most of the way back toward last week's. */
      var merit = {};
      order.slice().sort(function (x, y) { return resumeOf(acc[y]) - resumeOf(acc[x]); })
        .forEach(function (s, i2) { merit[s] = i2 + 1; });
      var wasRank = {};
      order.forEach(function (s) { wasRank[s] = rank[s]; });
      order.forEach(function (s) {
        rank[s] = POLL_INERTIA * rank[s] + (1 - POLL_INERTIA) * merit[s];
        /* A TEAM THAT LOST ON SATURDAY IS NOT REWARDED FOR IT. Smoothing alone does not
           guarantee this: a side can drift past another that is still falling from a bad
           result two weeks ago, and it produced about four of these a season, always by a
           single place and always looking like a mistake. Texas A&M going from fourth to
           third in a week it lost is the kind of thing that gets a voter's ballot printed in
           a newspaper.

           It can still climb because somebody ABOVE it lost, which is the legitimate way this
           happens and is left alone: it is not being rewarded, everyone in front fell. */
        if (beaten[s] && rank[s] < wasRank[s]) rank[s] = wasRank[s];
      });
      prev = snapshot(n, prev);
    }
    return out;
  }

  /* ---------------- the bowl season ----------------
     FOURTEEN BOWLS SAT IN venues.js AND NONE OF THEM WERE EVER PLAYED. December ran the
     conference title games and the bracket and stopped, so a sport of a hundred and thirty-six
     schools ended its year with fifteen postseason games and nothing at all for the hundred and
     twenty-four teams that were not in the playoff. A nine win season that ends with a shrug is
     not what December is.

     SIX WINS IS THE RULE and it is the real one. It is also why the number matters to a fan in
     week twelve: a five win team playing a sixth is playing for a trip somewhere warm, and the
     mode had no way to say so. */
  var BOWL_MIN_WINS = 6;

  function majorBowls() {
    if (!V || !V.BOWLS) return [];
    return V.BOWLS.filter(function (b) { return b.tier >= 3; })
      .slice().sort(function (a, b) { return b.heritage - a.heritage; });
  }

  /* THE BRACKET IS PLAYED IN THE BOWLS, which is the thing the twelve team format actually
     did to the sport and which the mode was silent about. Named from the latest round
     backwards, so the semi-finals get the Rose and the Sugar and the first round does not get
     one at all, because first round games are played on campus and that is the best part of
     the format. The final is never a bowl: it is its own game.

     Returns the ids it used, so the same bowl cannot also host a game between two eight win
     teams on the same afternoon. */
  function nameBracketBowls(br) {
    var majors = majorBowls();
    var used = [];
    if (!majors.length || !br || !br.rounds.length) return used;
    var slots = [];
    for (var ri = br.rounds.length - 2; ri >= 0; ri--) {
      for (var gi = 0; gi < br.rounds[ri].length; gi++) slots.push(br.rounds[ri][gi]);
    }
    for (var i = 0; i < slots.length && i < majors.length; i++) {
      slots[i].bowl = majors[i].id;
      slots[i].bowlName = majors[i].name;
      used.push(majors[i].id);
    }
    return used;
  }

  /* AND EVERYBODY ELSE WHO EARNED A DECEMBER. Bowls are filled in order of prestige, each
     taking the best team left, because that is what a bowl committee does with the pick it
     paid for. */
  function bowlSeason(teams, world, f, usedIds, rng) {
    if (!V || !V.BOWLS) return [];
    var inField = {};
    ((f && f.seats) || []).forEach(function (s) { inField[s.team.school] = true; });
    var used = {};
    (usedIds || []).forEach(function (id) { used[id] = true; });
    var slate = V.BOWLS.filter(function (b) { return !used[b.id]; })
      .slice().sort(function (a, b) { return (b.tier - a.tier) || (b.heritage - a.heritage); });
    var pool = teams.filter(function (t) {
      return !inField[t.school] && t.wins >= BOWL_MIN_WINS;
    }).sort(function (a, b) { return resume(b) - resume(a); });

    var out = [];
    for (var i = 0; i < slate.length; i++) {
      /* NOT ENOUGH ELIGIBLE TEAMS IS A REAL DECEMBER, not an error. Shorten the season or
         expand the playoff far enough and the bottom bowls simply do not get played, which is
         a consequence worth seeing rather than one to pad around with five win teams. */
      if (pool.length < 2) break;
      var b = slate[i];
      /* WHERE ON THE LADDER THIS BOWL PICKS. See the note on `pick` in venues.js: without it
         the fourteen bowls skim the top of a sixty team pool and the Bahamas Bowl gets a top
         fifteen team. Clamped so the last bowls still have two teams to choose between. */
      var from = Math.max(0, Math.min(pool.length - 2,
        Math.floor((b.pick || 0) * pool.length)));
      /* THE TIE-IN GETS FIRST REFUSAL and falls through when that conference has nobody left,
         which is what happens in life every time the league it is tied to puts three teams in
         the playoff. */
      var ai = from;
      if (b.tie) {
        for (var k = from; k < pool.length; k++) {
          if (pool[k].conference === b.tie) { ai = k; break; }
        }
      }
      var A = pool.splice(ai, 1)[0];
      /* A BOWL IS A MATCH-UP BETWEEN LEAGUES wherever it can be. Two teams from the same
         conference meeting in a bowl is a thing that happens and is nobody's favorite. */
      var bi = Math.min(from, pool.length - 1);
      for (var m = bi; m < pool.length; m++) {
        if (pool[m].conference !== A.conference) { bi = m; break; }
      }
      var B = pool.splice(bi, 1)[0];
      var r = playGame(A, B, true, rng);
      var g = { a: A, b: B, neutral: true, bowl: b.id, week: WEEKS + 2 };
      var vw = viewers(g, world);
      out.push({ bowl: b.id, name: b.name, venue: b.venue, tier: b.tier,
        a: A, b: B, score: [r.a, r.b], winner: r.aWon ? A : B, loser: r.aWon ? B : A,
        margin: Math.abs(r.a - r.b), viewers: vw });
    }
    return out;
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
    var tags = [];
    var effects = {};
    /* AIMED AT A BLOC RATHER THAN AT THE SPORT. The season used to move everybody together,
       which was right while its only verdicts were about the football. The books are not:
       overspending is the presidents' problem and underpaying is the conferences'. */
    var aimed = {};
    var first = sim.bracket.rounds[0] || [];
    var blowouts = first.filter(function (g) { return g.margin >= 21; }).length;
    var autos = sim.field.seats.filter(function (s) { return s.how === 'auto'; });
    var autoOut = first.filter(function (g) {
      return g.loser.how === 'auto' && g.margin >= 21;
    });

    if (first.length && blowouts / first.length >= 0.5) {
      tags.push('blowouts');
      notes.push('The first round was a chore. ' + blowouts + ' of ' + first.length
        + ' games were over by the third quarter and the studio spent the night cutting away '
        + 'to a game that was not on your bracket.');
      effects.inventory = -1.2;
      effects.tradition = -0.8;
    }
    if (autoOut.length >= 2) {
      tags.push('blowouts');
      notes.push(autoOut.length + ' conference champions got three scored in their opener. '
        + 'Everybody who has ever argued the field is too wide spent the week holding that up.');
      effects.access = -1.4;
    }
    if (sim.field.autobidsUnmet > 0) {
      tags.push('autobids');
      notes.push('You promised ' + (world.playoff.autobids) + ' automatic bids and there are '
        + sim.field.champions.length + ' conferences left to win one. '
        + sim.field.autobidsUnmet + ' of those guaranteed seats went to a team that finished '
        + 'second in its own league.');
      effects.access = (effects.access || 0) - 1.6;
    }
    if (sim.field.snub) {
      var s = sim.field.snub;
      tags.push('snub');
      notes.push(s.school + ' finished ' + s.wins + '-' + s.losses + ' and stayed home. '
        + 'That is the angriest fanbase in the country and they have your name.');
    }
    var champ = sim.bracket.champion;
    if (champ && champ.how === 'auto' && champ.seed > Math.ceil(sim.field.seats.length / 2)) {
      tags.push('cinderella');
      notes.push(champ.team.school + ' won the whole thing from the ' + champ.seed
        + ' seed. Every argument that the regular season stopped mattering just lost its '
        + 'best line.');
      effects.access = (effects.access || 0) + 2.2;
      effects.tradition = (effects.tradition || 0) + 0.6;
    }
    /* CHALK IS ITS OWN VERDICT AND IT WAS NOT BEING SAID. A one seed running the table is
       the format's best defense and the reason nobody buys a ticket for the first round,
       and a recap that only ever remarks on upsets is a recap that has an opinion. */
    if (champ && champ.seed === 1) {
      tags.push('chalk');
      notes.push('The top seed was the best team in August and the best team in January. '
        + 'The bracket agreed with the preseason and half the sport feels slightly cheated '
        + 'by that.');
      effects.inventory = (effects.inventory || 0) - 0.4;
    }
    /* AN UNBEATEN CHAMPION is the rarest thing this sport produces and it deserves a line. */
    if (champ && champ.team && champ.team.losses === 0) {
      tags.push('unbeaten');
      notes.push(champ.team.school + ' finished it unbeaten. Nobody is going to have to '
        + 'explain that one at a banquet.');
      effects.tradition = (effects.tradition || 0) + 0.5;
    }
    /* A FINAL NOBODY WATCHED PAST HALF TIME undoes a whole postseason of goodwill, and the
       game that decides it is the one people remember the format by. */
    var last = sim.bracket.rounds[sim.bracket.rounds.length - 1] || [];
    if (last[0] && last[0].margin >= 21) {
      tags.push('blowout-final');
      notes.push('The final was over at half time. That is the game the sport shows its '
        + 'children and this year it showed them a scrimmage.');
      effects.inventory = (effects.inventory || 0) - 0.7;
    } else if (last[0] && last[0].margin <= 3) {
      tags.push('close-final');
      notes.push('The final came down to one score. Whatever else this format is, it '
        + 'produced a night people are going to talk about for twenty years.');
      effects.inventory = (effects.inventory || 0) + 0.9;
      effects.tradition = (effects.tradition || 0) + 0.5;
    }
    /* A LONG SEASON IS A TIRED ONE, and the players notice before anybody else does. */
    var rounds = sim.bracket.rounds.length;
    if (rounds >= 4) {
      tags.push('grind');
      notes.push('The champion played ' + rounds + ' extra games on top of a full season. '
        + 'The people who played them have started saying so out loud.');
      effects.labour = -1.1;
      effects.exposure = 0.8;
    }
    /* Money follows inventory: more games worth watching is more to sell. */
    var played = sim.bracket.rounds.reduce(function (t, r) { return t + r.length; }, 0);
    effects.money = (effects.money || 0) + Math.min(2.4, played * 0.18);
    effects.inventory = (effects.inventory || 0) + Math.min(2.0, played * 0.15);

    /* ---- THE BOOKS ----
       THE POOL WAS A NUMBER THAT WENT NOWHERE. A tester moved the distribution dial from
       $1.0B to $2.2B, watched the whole screen fail to react, and asked why they could change
       it without it impacting anything. They were right: `money.pool` was written by that dial
       and read by NOTHING. Not the season, not the meters, not the blocs, not the ending. The
       dial's own push on money and exposure was real, so it was not literally inert, but the
       figure itself was decoration, and the biggest number in the sport being decoration is
       worse than not having it.

       So the pool is settled every season against what the football actually earned. The pool
       is what you PROMISED the schools; viewership is what the sport EARNED; the difference is
       the sport's books, and it lands here because a season already goes through the ledger as
       a ruling nobody made.

       Both directions cost something, which is what makes the dial a decision:

         PROMISE MORE THAN IT EARNS and every athletic director loves you this year. The
         shortfall comes out of the sport, the revenue meter drains, and it drains again next
         season, because you cannot un-promise it.

         PROMISE LESS and the books are immaculate and every conference in the room can do the
         subtraction. They wanted that money and they know it exists.

       The untouched sport draws 1.70 a game, measured across forty seeds, and a commissioner
       can push it between about 1.54 and 1.90 with the playoff field and the conference
       schedule. So the rate below is set to make the opening pool of $1.3B exactly break even
       at that opening audience: 1.3 / 1.70. That puts the whole dial range in reach of the
       verdict rather than just the top of it, and it means the football decides how much room
       you have while the dial decides how much of it you use. */
    var books = settle((world.money && world.money.pool) || 1.3, sim.perGame);
    var pool = books.pool, worth = books.worth, gap = books.gap;
    /* In the unit somebody would say it in: a three hundred million shortfall printed as
       "$0.30B" reads as a rounding error rather than as a third of a billion dollars. */
    var bn = function (v) {
      return Math.abs(v) >= 1 ? '$' + v.toFixed(2) + 'B' : '$' + Math.round(v * 1000) + 'M';
    };
    sim.books = books;
    /* A tenth of a billion either way is noise, not a policy. */
    if (gap >= 0.12) {
      tags.push('overcommitted');
      notes.push('You promised the schools ' + bn(pool) + ' a year. The football earned '
        + bn(worth) + '. Somebody is going to ask where the other ' + bn(gap)
        + ' comes from, and this year the answer was the reserve.');
      effects.money = (effects.money || 0) - gap * 2.2;
      effects.cost = (effects.cost || 0) + gap * 2.0;
      aimed.Presidents = aimed.Presidents || {};
      aimed.Presidents.cost = (aimed.Presidents.cost || 0) - Math.min(3, gap * 2.4);
    } else if (gap <= -0.12) {
      tags.push('underpaid');
      notes.push('The sport drew ' + bn(worth) + ' and paid out ' + bn(pool)
        + '. Every athletic director in the country can do that subtraction, and several of '
        + 'them did it out loud.');
      /* SCALED LIKE THE OTHER SIDE IS. A flat bonus here made shorting the schools by ten
         million worth exactly as much as shorting them by three hundred. */
      effects.money = (effects.money || 0) + Math.min(1.2, -gap * 1.3);
      ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Group of Five'].forEach(function (b) {
        aimed[b] = aimed[b] || {};
        aimed[b].money = (aimed[b].money || 0) - Math.min(3, -gap * 4.5);
      });
    }

    for (var k in effects) effects[k] = Math.round(effects[k] * 100) / 100;
    for (var b2 in aimed) {
      for (var a2 in aimed[b2]) aimed[b2][a2] = Math.round(aimed[b2][a2] * 100) / 100;
    }
    return {
      notes: notes,
      /* WHICH VERDICTS FIRED, so the feed can talk about something else. */
      tags: tags,
      edit: {
        id: 'season:' + world.year,
        label: 'The ' + world.year + ' season'
          + (champ ? ', won by ' + champ.team.school : ''),
        set: {}, move: {}, aimed: aimed, effects: effects,
      },
      books: sim.books,
    };
  }

  /* ---------------- the season ---------------- */

  /* WHICH WEEKS EACH BEAT OWNS. The four offseason beats play no football; September,
     October and November take four weeks each; then the title games and the bracket. Read by
     the page so the calendar and the football cannot drift apart. */
  var SEGMENTS = [
    { beat: 4, name: 'September', through: 5 },
    { beat: 5, name: 'October', through: 9 },
    { beat: 6, name: 'November', through: WEEKS },
    { beat: 7, name: 'Championship weekend', through: WEEKS, titles: true },
    { beat: 8, name: 'The playoff', through: WEEKS, titles: true, bracket: true },
  ];
  function segmentFor(beat) {
    for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i].beat === beat) return SEGMENTS[i];
    return null;
  }
  /* HOW MUCH FOOTBALL HAS BEEN PLAYED BY THE TIME A BEAT OPENS, which is not the same as the
     beat's own segment and the difference matters now that the days are walked on screen.

     Standing in the office on October, September has happened and October has not: the
     simulation that runs when you press on is what plays October. Using the beat's own
     segment meant the office showed you week five's standings and then the calendar walked
     September in front of you afterwards, which is the football happening twice, backwards. */
  function throughAtBeat(beat) {
    var seg = null;
    for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i].beat < beat) seg = SEGMENTS[i];
    if (!seg) return null;
    return { through: seg.through, titles: !!seg.titles, bracket: !!seg.bracket, name: seg.name };
  }

  /* PLAY THE SEASON UP TO A POINT, and it is the same call whether that point is week four
     or the whole thing. Deterministic from the seed, so the page can throw the result away
     and replay it after a reload rather than serialising a hundred and thirty teams and eight
     hundred games into local storage. That is why nothing here reads the clock or the world
     beyond the ledger it was handed. */
  function play(world, teamSeasons, rng, opts) {
    var o = opts || {};
    var through = o.through == null ? GAMES : o.through;

    var teams = league(world, teamSeasons);
    if (teams.length < 8) return null;
    var wk = weekify(schedule(teams, world, rng), rng);
    var games = wk.games;
    games.sort(function (x, y) { return x.week - y.week; });
    /* The regular season is however many weeks the schedule actually needed. `through` is
       given in weeks, and a full season means all of them. */
    var lastWeek = wk.weeks;
    if (o.through == null) through = lastWeek;

    /* A PARTIAL SEASON DOES NOT GET TO PLAY ITS CHAMPIONSHIP GAMES. `titles` defaulted to
       true whatever `through` was, so asking for nine weeks played nine weeks of football
       AND every conference final, and the title results were recorded onto the same team
       objects the standings are read off. Eight of seventy teams came back a game ahead of
       the games actually in `sim.games`: Texas Tech 10-0 with nine on the board.

       Nothing on screen was wrong, because the page has always passed `titles` explicitly
       for each segment. It was a trap set for the next caller, which turned out to be the
       situation module reading records to decide who is unbeaten in October. */
    var wantTitles = o.titles != null ? o.titles !== false : through >= lastWeek;
    var wantBracket = o.bracket !== false && wantTitles;

    var played = [];
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (g.week > through) continue;
      var r = playGame(g.a, g.b, g.neutral, rng);
      record(g.a, g.b, r.a, r.b, g.conf);
      record(g.b, g.a, r.b, r.a, g.conf);
      g.score = [r.a, r.b];
      g.margin = Math.abs(r.a - r.b);
      g.winner = r.aWon ? g.a : g.b;
      g.loser = r.aWon ? g.b : g.a;
      g.viewers = viewers(g, world);
      played.push(g);
    }

    /* The week by week view the office draws while the season is going on. */
    var weeks = [];
    for (var n = 1; n <= through; n++) {
      var inWeek = played.filter(function (x) { return x.week === n; });
      weeks.push({
        week: n,
        games: inWeek.slice().sort(function (x, y) { return y.viewers - x.viewers; }),
        viewers: Math.round(inWeek.reduce(function (t, x) { return t + x.viewers; }, 0) * 10) / 10,
      });
    }

    var sim = {
      year: world.year,
      through: through,
      lastWeek: lastWeek,
      complete: !!wantBracket,
      teams: teams.slice().sort(function (a, b) { return resume(b) - resume(a); }),
      games: played,
      weeks: weeks,
      /* True only for the first season of a term: after that the schools are real and the
         seasons are not, and the screen has to be able to say so. */
      fromRealData: world.year === world.startYear,
    };
    sim.viewers = Math.round(played.reduce(function (t, x) { return t + x.viewers; }, 0) * 10) / 10;
    sim.perGame = played.length ? Math.round((sim.viewers / played.length) * 100) / 100 : 0;
    /* THE POLL, WEEK BY WEEK, which is what the sport actually argues about. `polls[0]` is the
       preseason list and the last entry is wherever the season has got to, so a screen drawn
       in October gets October's poll rather than a final one that has not happened. */
    sim.polls = pollSeason(teams, played, through, world.seed);
    sim.poll = sim.polls.length ? sim.polls[sim.polls.length - 1].top : [];
    sim.preseason = sim.polls.length ? sim.polls[0].top : [];
    /* WHO CHANGED COACH GOING INTO THIS SEASON. December's carousel is a holiday for the
       people this game is for and the mode had no way of telling them it happened. */
    sim.carousel = CH
      ? CH.carouselFor(teams, teamSeasons, world.seed, Math.max(0, world.year - world.startYear))
      : [];
    /* AND WHO HAS MOVED FURTHEST from the season the term opened on, which is the sentence a
       fan says out loud in October: nobody had these people anywhere in August. */
    sim.risers = teams.slice()
      .map(function (t) { return { school: t.school, conference: t.conference, color: t.color,
        move: Math.round(((t.z - (t.baseZ == null ? t.z : t.baseZ)) * 100)) / 100,
        wins: t.wins, losses: t.losses }; })
      .filter(function (t) { return Math.abs(t.move) >= 0.5; })
      .sort(function (a, b) { return b.move - a.move; });

    if (!wantTitles) return sim;

    sim.titles = titleGames(teams, world, rng);
    sim.viewers = Math.round((sim.viewers
      + sim.titles.reduce(function (t, x) { return t + (x.game ? x.game.viewers : 0); }, 0)) * 10) / 10;
    if (!wantBracket) return sim;

    /* THE SCHEDULE WAS SET IN AUGUST AND THE FIELD IS PICKED IN DECEMBER, so they read two
       different ledgers. `world` here is the sport as it stood when the season kicked off,
       which is what decides who plays whom and how good they are; `o.fieldWorld` is the sport
       as it stands now, which is what decides how many seats there are.

       Without the split, expanding the playoff in October would replay September under the
       new rules and teams would finish with different records than the ones the player
       already watched. With it, a ruling in November changes the bracket and not the
       football, which is what happens in life. */
    var fw = o.fieldWorld || world;
    var f = field(teams, fw, sim.titles);
    var br = bracket(f.seats, fw, rng);
    br.rounds.forEach(function (round, ri) {
      round.forEach(function (g) {
        g.round = ri;
        g.viewers = viewers({ a: g.top.team, b: g.bottom.team, conf: false, week: WEEKS + 2 + ri,
          round: ri, finalRound: ri === br.rounds.length - 1 }, world);
      });
    });
    sim.field = f;
    sim.bracket = br;
    /* THE REST OF DECEMBER. Named first so the bracket's own games claim the bowls that host
       them, then everybody else who won six. */
    var claimed = nameBracketBowls(br);
    sim.bowls = bowlSeason(teams, fw, f, claimed, rng);
    sim.viewers = Math.round((sim.viewers + br.rounds.reduce(function (t, r) {
      return t + r.reduce(function (u, g) { return u + (g.viewers || 0); }, 0);
    }, 0) + sim.bowls.reduce(function (t, x) { return t + (x.viewers || 0); }, 0)) * 10) / 10;
    var v = verdict(sim, o.fieldWorld || world);
    sim.notes = v.notes;
    sim.tags = v.tags || [];
    sim.edit = v.edit;
    return sim;
  }

  var api = {
    play: play, league: league, schedule: schedule, field: field,
    bracket: bracket, champions: champions, resume: resume, titleGames: titleGames,
    bowlSeason: bowlSeason, nameBracketBowls: nameBracketBowls, BOWL_MIN_WINS: BOWL_MIN_WINS,
    pollSeason: pollSeason, POLL_INERTIA: POLL_INERTIA, POLL_SIZE: POLL_SIZE,
    playGame: playGame, plausible: plausible, moneyDrift: moneyDrift,
    reentryDrift: reentryDrift, reentryRule: reentryRule,
    weekify: weekify, viewers: viewers, settle: settle, WORTH_PER_M: WORTH_PER_M,
    SEGMENTS: SEGMENTS, segmentFor: segmentFor, throughAtBeat: throughAtBeat,
    GAMES: GAMES, WEEKS: WEEKS, Z_TO_POINTS: Z_TO_POINTS, HOME: HOME, NOISE: NOISE,
  };
  root.PS_CFB_SEASON = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
