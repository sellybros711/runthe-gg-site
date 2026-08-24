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

     Greedy colouring, lowest free week first, which is enough: a team plays twelve games in
     twelve weeks and every game only needs a week where neither side is already busy. */
  /* FOURTEEN WEEKS FOR TWELVE GAMES, which is what a real season is: everybody gets a bye or
     two. It is also what makes the colouring possible. A team plays twelve games, so twelve
     weeks is the theoretical floor and no greedy assignment reaches it; the first version
     used twelve, quietly pushed the overflow into weeks thirteen and fourteen, and then
     dropped those games on the floor because the season only played through week twelve.
     Teams finished 8-0 and 13-0 in the same league and nothing failed. */
  var WEEKS = 14;

  function weekify(games, rng) {
    /* Restarts, because greedy edge colouring is order dependent: one shuffle overflows and
       the next one does not. Cheap enough to simply try again. */
    var best = null;
    for (var attempt = 0; attempt < 40; attempt++) {
      var busy = {}, max = 0;
      var order = shuffled(games, rng);
      order.forEach(function (g) {
        var w = 1;
        while (busy[w + '|' + g.a.school] || busy[w + '|' + g.b.school]) w++;
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

  /* A RESUME, not a power rating. Wins matter most, who you played matters, and being good
     matters, which is roughly the order a selection committee says it uses. */
  function resume(t) {
    var sos = t.opp.length ? t.opp.reduce(function (s, z) { return s + z; }, 0) / t.opp.length : 0;
    return t.wins * 3.2 - t.losses * 3.0 + t.z * 3.4 + sos * 1.6;
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
      notes.push('The first round was a chore. ' + blowouts + ' of ' + first.length
        + ' games were over by the third quarter and the studio spent the night cutting away '
        + 'to a game that was not on your bracket.');
      effects.inventory = -1.2;
      effects.tradition = -0.8;
    }
    if (autoOut.length >= 2) {
      notes.push(autoOut.length + ' conference champions got three scored in their opener. '
        + 'Everybody who has ever argued the field is too wide spent the week holding that up.');
      effects.access = -1.4;
    }
    if (sim.field.autobidsUnmet > 0) {
      notes.push('You promised ' + (world.playoff.autobids) + ' automatic bids and there are '
        + sim.field.champions.length + ' conferences left to win one. '
        + sim.field.autobidsUnmet + ' of those guaranteed seats went to a team that finished '
        + 'second in its own league.');
      effects.access = (effects.access || 0) - 1.6;
    }
    if (sim.field.snub) {
      var s = sim.field.snub;
      notes.push(s.school + ' finished ' + s.wins + '-' + s.losses + ' and stayed home. '
        + 'That is the angriest fanbase in the country and they have your name.');
    }
    var champ = sim.bracket.champion;
    if (champ && champ.how === 'auto' && champ.seed > Math.ceil(sim.field.seats.length / 2)) {
      notes.push(champ.team.school + ' won the whole thing from the ' + champ.seed
        + ' seed. Every argument that the regular season stopped mattering just lost its '
        + 'best line.');
      effects.access = (effects.access || 0) + 2.2;
      effects.tradition = (effects.tradition || 0) + 0.6;
    }
    /* CHALK IS ITS OWN VERDICT AND IT WAS NOT BEING SAID. A one seed running the table is
       the format's best defence and the reason nobody buys a ticket for the first round,
       and a recap that only ever remarks on upsets is a recap that has an opinion. */
    if (champ && champ.seed === 1) {
      notes.push('The top seed was the best team in August and the best team in January. '
        + 'The bracket agreed with the preseason and half the sport feels slightly cheated '
        + 'by that.');
      effects.inventory = (effects.inventory || 0) - 0.4;
    }
    /* AN UNBEATEN CHAMPION is the rarest thing this sport produces and it deserves a line. */
    if (champ && champ.team && champ.team.losses === 0) {
      notes.push(champ.team.school + ' finished it unbeaten. Nobody is going to have to '
        + 'explain that one at a banquet.');
      effects.tradition = (effects.tradition || 0) + 0.5;
    }
    /* A FINAL NOBODY WATCHED PAST HALF TIME undoes a whole postseason of goodwill, and the
       game that decides it is the one people remember the format by. */
    var last = sim.bracket.rounds[sim.bracket.rounds.length - 1] || [];
    if (last[0] && last[0].margin >= 21) {
      notes.push('The final was over at half time. That is the game the sport shows its '
        + 'children and this year it showed them a scrimmage.');
      effects.inventory = (effects.inventory || 0) - 0.7;
    } else if (last[0] && last[0].margin <= 3) {
      notes.push('The final came down to one score. Whatever else this format is, it '
        + 'produced a night people are going to talk about for twenty years.');
      effects.inventory = (effects.inventory || 0) + 0.9;
      effects.tradition = (effects.tradition || 0) + 0.5;
    }
    /* A LONG SEASON IS A TIRED ONE, and the players notice before anybody else does. */
    var rounds = sim.bracket.rounds.length;
    if (rounds >= 4) {
      notes.push('The champion played ' + rounds + ' extra games on top of a full season. '
        + 'The people who played them have started saying so out loud.');
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
  /* How much football has been played by the time a beat OPENS, which is what the office
     needs: standing on October, September is done and October is not. */
  function throughAtBeat(beat) {
    var last = 0;
    for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i].beat < beat) last = SEGMENTS[i].through;
    return last;
  }

  /* PLAY THE SEASON UP TO A POINT, and it is the same call whether that point is week four
     or the whole thing. Deterministic from the seed, so the page can throw the result away
     and replay it after a reload rather than serialising a hundred and thirty teams and eight
     hundred games into local storage. That is why nothing here reads the clock or the world
     beyond the ledger it was handed. */
  function play(world, teamSeasons, rng, opts) {
    var o = opts || {};
    var through = o.through == null ? GAMES : o.through;
    var wantTitles = o.titles !== false;
    var wantBracket = o.bracket !== false && wantTitles;

    var teams = league(world, teamSeasons);
    if (teams.length < 8) return null;
    var wk = weekify(schedule(teams, world, rng), rng);
    var games = wk.games;
    games.sort(function (x, y) { return x.week - y.week; });
    /* The regular season is however many weeks the schedule actually needed. `through` is
       given in weeks, and a full season means all of them. */
    var lastWeek = wk.weeks;
    if (o.through == null) through = lastWeek;

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
          round: ri }, world);
      });
    });
    sim.field = f;
    sim.bracket = br;
    sim.viewers = Math.round((sim.viewers + br.rounds.reduce(function (t, r) {
      return t + r.reduce(function (u, g) { return u + (g.viewers || 0); }, 0);
    }, 0)) * 10) / 10;
    var v = verdict(sim, o.fieldWorld || world);
    sim.notes = v.notes;
    sim.edit = v.edit;
    return sim;
  }

  var api = {
    play: play, league: league, schedule: schedule, field: field,
    bracket: bracket, champions: champions, resume: resume, titleGames: titleGames,
    playGame: playGame, plausible: plausible, moneyDrift: moneyDrift,
    weekify: weekify, viewers: viewers,
    SEGMENTS: SEGMENTS, segmentFor: segmentFor, throughAtBeat: throughAtBeat,
    GAMES: GAMES, WEEKS: WEEKS, Z_TO_POINTS: Z_TO_POINTS, HOME: HOME, NOISE: NOISE,
  };
  root.PS_CFB_SEASON = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
