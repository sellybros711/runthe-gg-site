/* Run The Pitch: the club side (Club Draft and The Club Cup).
 *
 * Pure functions over the player data the game already loads. No DOM, no network, so
 * soccer/check-club.mjs runs it in node. The page (soccer/index.html) owns the screens.
 *
 * WHAT THE DATA IS. Every row in data/players_all.json is a World Cup player, tagged with
 * the club he was at during that World Cup (club_at_tournament). A club and a single year is
 * too thin to spin (88 hold ten men), so the unit is A CLUB AND A DECADE: "Barcelona, 2010s".
 * A man who went to three World Cups from one club in one decade is one man in that unit,
 * at his best rating, and the unit remembers which World Cups he went to.
 *
 * NAMES (the owner's calls, 2026-11-26). "Use club names, but not brands if there are brands
 * involved": clubs show by their plain common name in text, never a crest, and where the name
 * carries a company's brand, NAMES gives the city or the unbranded name. This is the one place
 * a shown name is decided, so a later change (a lawyer's answer, say) is a line here.
 *
 * ONE CLUB ACROSS ITS ERAS, UNDER THE NAME OF ITS TIME. "If a name changed from the 80s to the
 * 10s, it would show as the old name if it landed in the 80s and the new name with the 10s."
 * The data's club_id (the Rosters Agent's, one per club across every name it has had) is the
 * club; the name shown for a decade is the name most of its men carry in that decade. Rows
 * with no club_id yet fall back to the name, with the spelling pairs below folded.
 */
(function (root) {
  'use strict';

  /* Not clubs. Men listed here are left off the club side. */
  var SKIP = { 'Free agent': 1, 'Free agent [ a ]': 1, 'Unattached': 1, 'United States Soccer Federation': 1 };

  var NAMES = {
    /* a company's brand in the name: show the city or the unbranded common name */
    'Bayer Leverkusen': 'Leverkusen',
    'Bayer Uerdingen': 'Uerdingen',
    'RB Leipzig': 'Leipzig',
    'Red Bull Salzburg': 'Salzburg',
    'Red Bull Bragantino': 'Bragantino',
    'New York Red Bulls': 'New York (Harrison)',
    'FC Carl Zeiss Jena': 'Jena',
    'Evian': 'Thonon Gaillard',
    'Swarovski Tirol': 'Tirol Innsbruck',
    'TJ Slovan CHZJD': 'Slovan Bratislava',
    'Cruz Azul': 'La Máquina (Mexico City)',
    'Supersport United': 'Pretoria United',
    'Petro Atlético': 'Atlético Luanda',
    'Daewoo Royals': 'Busan',
    'Busan Daewoo Royals': 'Busan',
    'Hyundai Horangi': 'Ulsan',
    'Ulsan Hyundai': 'Ulsan',
    'Ulsan Hyundai Horangi': 'Ulsan',
    'Jeonbuk Hyundai Motors': 'Jeonbuk',
    'POSCO Atoms': 'Pohang',
    'Suwon Samsung Bluewings': 'Suwon Bluewings',
    'Lucky-Goldstar Hwangso': 'Seoul',
    'LG Cheetahs': 'Anyang',
    'Anyang LG Cheetahs': 'Anyang',
    'Yukong Elephants': 'Bucheon',
    'Bucheon SK': 'Bucheon',
    'Ilhwa Chunma': 'Seongnam',
    'Cheonan Ilhwa Chunma': 'Seongnam',
    'Seongnam Ilhwa Chunma': 'Seongnam',
    'Daejeon Hana Citizen': 'Daejeon',
    'JEF United': 'Ichihara',
    'JEF United Ichihara': 'Ichihara',
    'Guangzhou Evergrande': 'Guangzhou',
    'Guangzhou R&F': 'Guangzhou City',
    'Hebei China Fortune': 'Hebei',
    'Beijing Guoan': 'Beijing',
    'Beijing Sinobo Guoan': 'Beijing',
    'Shandong Luneng': 'Shandong Taishan',
    'Shandong Luneng Taishan': 'Shandong Taishan',
    'Tianjin Quanjian': 'Tianjin Tianhai',
    'Tianjin TEDA': 'Tianjin Jinmen Tiger',
    'Tianjin Teda': 'Tianjin Jinmen Tiger',
    /* one club, two spellings in the data (not renames: a rename keeps the name of its time) */
    'Internazionale': 'Inter Milan',
    'AC Milan': 'Milan',
    'PSV': 'PSV Eindhoven',
    'Rapid Wien': 'Rapid Vienna',
    '1899 Hoffenheim': 'Hoffenheim',
    'TSG Hoffenheim': 'Hoffenheim',
    'Kaiserslautern': '1. FC Kaiserslautern',
    'Admira/Wacker': 'Admira Wacker',
    'Al Ahli': 'Al-Ahli',
    'Al Hilal': 'Al-Hilal',
    'Al Shabab': 'Al-Shabab',
    'Al Ettifaq': 'Al-Ettifaq',
    'Al Fateh': 'Al-Fateh',
    'Al Nasr': 'Al-Nasr',
    'Al Nassr': 'Al-Nassr',
    'Al Qadsiah': 'Al-Qadsiah',
    'Al Sadd': 'Al-Sadd',
    'FC Hansa Rostock': 'Hansa Rostock',
    'FC Utrecht': 'Utrecht',
    'Cotonsport Garoua': 'Coton Sport',
    'Étoile Sportive du Sahel': 'Étoile du Sahel',
    'Dinamo Minsk': 'Dynamo Minsk'
  };

  /* Words that would put a company's brand on screen. check-club fails if a shown name holds one. */
  var BRAND_WORDS = /\b(red bull|rb|bayer|carl zeiss|evian|swarovski|chzjd|cruz azul|supersport|daewoo|hyundai|posco|samsung|goldstar|lg|yukong|sk|ilhwa|hana|jef|evergrande|r&f|china fortune|guoan|sinobo|luneng|quanjian|teda|philips)\b/i;

  var MIN_SPIN = 6;   // a club and decade must hold this many men to be spun
  var MIN_OPP = 8;    // and this many to be met in the cup
  var PAD = 60;       // a missing man in an eleven counts as this (the data's floor)

  function clubName(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s || SKIP[s]) return null;
    return NAMES[s] || s;
  }
  function eraOf(year) { return (Math.floor(year / 10) * 10) + 's'; }
  function personKey(p) { return p.name + '|' + p.country; }
  function ovOf(p) { return p.overall != null ? p.overall : (p.wc_overall != null ? p.wc_overall : (p.skill_rating != null ? p.skill_rating : PAD)); }

  /* Every club and decade worth spinning. `players` are the engine's rows (each with overall). */
  function build(players) {
    var map = {};
    (players || []).forEach(function (p) {
      var shown = clubName(p.club_at_tournament);
      if (!shown || p.year == null) return;
      var id = p.club_id || ('name:' + shown);          // the club, whatever it was called then
      var era = eraOf(p.year), key = id + '|' + era;
      var u = map[key] || (map[key] = { id: id, era: era, decade: Math.floor(p.year / 10) * 10, key: key, people: {}, names: {} });
      var nm = u.names[shown] || (u.names[shown] = { n: 0, last: 0 });
      nm.n++; if (p.year > nm.last) nm.last = p.year;
      var pk = personKey(p), cur = u.people[pk];
      if (!cur) cur = u.people[pk] = { best: p, wcs: [] };
      if (cur.wcs.indexOf(p.year) < 0) cur.wcs.push(p.year);
      // his best World Cup in that shirt; the later one on a tie
      if (ovOf(p) > ovOf(cur.best) || (ovOf(p) === ovOf(cur.best) && p.year > cur.best.year)) cur.best = p;
    });
    var units = [], taken = {};
    Object.keys(map).sort().forEach(function (key) {
      var u = map[key];
      // the name of its time: what most of its men carry that decade, the later name on a tie
      var club = Object.keys(u.names).sort(function (a, b) { return u.names[b].n - u.names[a].n || u.names[b].last - u.names[a].last || (a < b ? -1 : 1); })[0];
      var squad = Object.keys(u.people).sort().map(function (pk) {
        var e = u.people[pk], copy = {};
        for (var k in e.best) copy[k] = e.best[k];
        copy.overall = ovOf(e.best);
        copy.club_side = { club: club, id: u.id, era: u.era, wcs: e.wcs.slice().sort(function (a, b) { return a - b; }) };
        return copy;
      });
      if (squad.length < MIN_SPIN) return;
      // The page finds a squad by the name and decade the wheel showed, so the pair is unique.
      // Two clubs with one shown name in one decade (it has not happened) keep the bigger squad.
      var shownKey = club + '|' + u.era, prev = taken[shownKey];
      if (prev != null) { if (units[prev].squad.length >= squad.length) return; units[prev] = null; }
      taken[shownKey] = units.length;
      units.push({ id: u.id, club: club, era: u.era, decade: u.decade, key: key, squad: squad });
    });
    return units.filter(Boolean);
  }

  /* How good a unit's best eleven is, before it is placed on the World Cup scale. */
  function strength(squad) {
    var ovs = squad.map(ovOf).sort(function (a, b) { return b - a; }).slice(0, 11);
    while (ovs.length < 11) ovs.push(PAD);
    return ovs.reduce(function (a, b) { return a + b; }, 0) / 11;
  }

  /* The sides met in The Club Cup.
   *
   * The sim's tuning (the trophy odds How to play publishes) was calibrated against the spread
   * of the World Cup opponent pool's team_overall, round by round. Club units bunch high, so a
   * raw rating would starve the early rounds and the Final of opponents. Each club side is
   * therefore RANKED by its best eleven and given the World Cup pool's rating at the same rank
   * (`wcOveralls`, every national squad's team_overall). Same spread, so the same odds. */
  function opponents(units, wcOveralls) {
    var pool = units.filter(function (u) { return u.squad.length >= MIN_OPP; })
      .map(function (u) { return { u: u, s: strength(u.squad) }; })
      .sort(function (a, b) { return a.s - b.s || (a.u.key < b.u.key ? -1 : 1); });
    var scale = (wcOveralls || []).slice().sort(function (a, b) { return a - b; });
    var n = pool.length, m = scale.length;
    return pool.map(function (x, i) {
      var q = n > 1 ? i / (n - 1) : 1;
      var teamOverall = m ? scale[Math.round(q * (m - 1))] : Math.round(x.s);
      return { country: x.u.club, year: x.u.era, squad: x.u.squad, teamOverall: teamOverall, tournamentResult: null, club: true };
    });
  }

  /* One spin: any unit `ok` accepts (the page passes "holds a man I can still draft").
   *
   * WEIGHTED BY SQUAD SIZE, ON PURPOSE. A World Cup spin always offers 22 or more men. A club
   * and decade offers 6 to 40, and most are small. An even spin made a club draft about 4 OVR
   * weaker than a World Cup draft (a greedy drafter reached 86 in 20% of club drafts against
   * 57%), which would have made the cup close to unwinnable under the published odds. Weighting
   * each unit by how many men it holds brings the two level (50% against 57%, the same median)
   * and still lets every club come up. check-club measures both sides and holds them together. */
  function spin(units, ok, rnd) {
    var able = ok ? units.filter(ok) : units;
    if (!able.length) return null;
    var total = 0, i;
    for (i = 0; i < able.length; i++) total += able[i].squad.length;
    var r = (rnd || Math.random)() * total;
    for (i = 0; i < able.length; i++) { r -= able[i].squad.length; if (r < 0) return able[i]; }
    return able[able.length - 1];
  }

  /* The cup's words in place of the World Cup's, for copy the two sides share. */
  function cupWords(s) {
    if (typeof s !== 'string' || s.indexOf('orld') < 0 && s.indexOf('ORLD') < 0) return s;
    return s.replace(/FIFA WORLD CUP/g, 'THE CLUB CUP')
      .replace(/WORLD CUP/g, 'CLUB CUP')
      .replace(/Champions of the world/g, 'Champions of champions')
      .replace(/World Cup winners/g, 'Club Cup winners')
      .replace(/World Cup Winners/g, 'Club Cup Winners')
      .replace(/World Cup/g, 'Club Cup');
  }

  /* Three plain letters for a club's chip. Text only: no crest, no colours of its own. */
  function chip(club) {
    var w = String(club || '').replace(/\(.*?\)/g, '').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).filter(function (x) { return x && !/^\d+$/.test(x) && x.length > 1 || /^[A-Z]{2,}$/.test(x); });
    if (!w.length) return '?';
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    if (w.length === 2) return (w[0].slice(0, 2) + w[1].slice(0, 1)).toUpperCase();
    return (w[0][0] + w[1][0] + w[2][0]).toUpperCase();
  }

  /* ====================================================================================
   * CLUB SEASON (the owner's call, 2026-11-26: the club side plays "more of a season mode").
   *
   * A ten club league: your XI and nine club sides. Nine matches, one against each, played in
   * three blocks of three, with a transfer window after the first and second block. The table
   * decides the title. The top four go to The Club Cup: a semi-final and a final.
   *
   * Everything here is pure and takes its random numbers as `rnd`, so check-club can play
   * thousands of seasons on a fixed seed and hold the title odds.
   *
   * THE MATCH MODEL IS THE LEAGUE'S OWN. The World Cup side's simulateMatch is tuned for a
   * knockout (a penalty below 86, a boost above 90, compounding by round), which is wrong for a
   * league where a draw is a result. Here each side's goals are Poisson, with a mean that leans
   * on the rating gap. Draws, goal difference and the odd upset fall out of that on their own.
   * ==================================================================================== */
  var SEASON = {
    clubs: 10, matches: 9, blocks: [3, 3, 3], cupSpots: 4,
    // Nine opponents, drawn by rating band so every league has favourites, a middle and strugglers.
    bands: [[92, 99, 1], [87, 91, 2], [81, 86, 2], [74, 80, 2], [60, 73, 2]],
    goals: 1.3,     // a side's mean goals against an equal
    lean: 0.07     // how hard a rating point leans the means
  };

  function poisson(mean, rnd) {
    var l = Math.exp(-mean), k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > l && k < 12);
    return k - 1;
  }
  /* One league match between ratings a and b: [goals for a, goals for b]. */
  function matchGoals(a, b, rnd) {
    var d = (a - b) * SEASON.lean;
    return [Math.min(7, poisson(SEASON.goals * Math.exp(d / 2), rnd)), Math.min(7, poisson(SEASON.goals * Math.exp(-d / 2), rnd))];
  }

  /* Nine opponents from the cup's pool, by band. A thin band borrows its nearest neighbours. */
  function seasonOpponents(pool, rnd) {
    var left = pool.slice(), out = [];
    SEASON.bands.forEach(function (b) {
      for (var n = 0; n < b[2]; n++) {
        var idx = [];
        left.forEach(function (o, i) { if (o.teamOverall >= b[0] && o.teamOverall <= b[1]) idx.push(i); });
        if (!idx.length) {   // nobody left in the band: the closest rating to its middle
          var mid = (b[0] + b[1]) / 2, best = -1, gap = 1e9;
          left.forEach(function (o, i) { var g = Math.abs(o.teamOverall - mid); if (g < gap) { gap = g; best = i; } });
          if (best < 0) return;
          idx = [best];
        }
        out.push(left.splice(idx[Math.floor(rnd() * idx.length)], 1)[0]);
      }
    });
    return out;
  }

  /* A new season. Team 0 is the player. The fixture list is the circle method: nine rounds,
     every side plays once a round and meets every other side once. */
  function seasonStart(pool, rnd) {
    var opps = seasonOpponents(pool, rnd);
    var teams = [{ you: true, name: 'YOUR XI', era: '', ovr: 0, squad: null }].concat(opps.map(function (o) {
      return { you: false, name: o.country, era: o.year, ovr: o.teamOverall, squad: o.squad };
    }));
    var n = teams.length, order = [];
    for (var i = 1; i < n; i++) order.push(i);
    for (var j = order.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)), t = order[j]; order[j] = order[k]; order[k] = t; }
    var rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var ring = [0].concat(order), pairs = [];
      for (var x = 0; x < n / 2; x++) pairs.push([ring[x], ring[n - 1 - x]]);
      rounds.push(pairs);
      order.unshift(order.pop());
    }
    return { teams: teams, rounds: rounds, md: 0, mine: [],
      rows: teams.map(function () { return { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; }) };
  }

  /* The player's opponent on matchday `md` (0 based), as a team. */
  function seasonOpponentAt(season, md) {
    var pair = season.rounds[md].filter(function (p) { return p[0] === 0 || p[1] === 0; })[0];
    return season.teams[pair[0] === 0 ? pair[1] : pair[0]];
  }

  /* Play the next `count` matchdays at the player's current rating. Returns the player's results. */
  function seasonPlay(season, userOvr, count, rnd) {
    var played = [];
    for (var c = 0; c < count && season.md < season.rounds.length; c++) {
      season.rounds[season.md].forEach(function (pair) {
        var a = pair[0], b = pair[1];
        var ra = a === 0 ? userOvr : season.teams[a].ovr, rb = b === 0 ? userOvr : season.teams[b].ovr;
        var g = matchGoals(ra, rb, rnd), A = season.rows[a], B = season.rows[b];
        A.p++; B.p++; A.gf += g[0]; A.ga += g[1]; B.gf += g[1]; B.ga += g[0];
        if (g[0] > g[1]) { A.w++; B.l++; A.pts += 3; } else if (g[0] < g[1]) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
        if (a === 0 || b === 0) {
          var mine = a === 0 ? g[0] : g[1], theirs = a === 0 ? g[1] : g[0], opp = season.teams[a === 0 ? b : a];
          var res = { md: season.md + 1, opp: opp, gf: mine, ga: theirs, res: mine > theirs ? 'W' : (mine < theirs ? 'L' : 'D') };
          season.mine.push(res); played.push(res);
        }
      });
      season.md++;
    }
    season.teams[0].ovr = userOvr;
    return played;
  }

  /* The table: points, goal difference, goals for, then the name (a full tie is rare and neutral). */
  function seasonTable(season) {
    return season.teams.map(function (t, i) {
      var r = season.rows[i];
      return { i: i, you: t.you, name: t.name, era: t.era, ovr: t.ovr, p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, gd: r.gf - r.ga, pts: r.pts };
    }).sort(function (a, b) { return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (a.name < b.name ? -1 : 1); })
      .map(function (row, k) { row.pos = k + 1; return row; });
  }

  /* The Club Cup: the top four. 1 v 4 and 2 v 3, then a final. A level cup tie goes to
     penalties, a coin that leans a little on the rating. Returns the player's cup, or
     { qualified: false }. `result` is 'winner', 'finalist' or 'semi'. */
  function seasonCup(season, userOvr, rnd) {
    var table = seasonTable(season), top = table.slice(0, SEASON.cupSpots);
    var me = top.filter(function (r) { return r.you; })[0];
    if (!me) return { qualified: false, table: table };
    var rate = function (row) { return row.you ? userOvr : row.ovr; };
    var tie = function (a, b) {
      var g = matchGoals(rate(a), rate(b), rnd), pens = false, aWins;
      if (g[0] === g[1]) { pens = true; aWins = rnd() < 0.5 + Math.max(-0.2, Math.min(0.2, (rate(a) - rate(b)) * 0.01)); }
      else aWins = g[0] > g[1];
      return { a: a, b: b, ga: g[0], gb: g[1], pens: pens, winner: aWins ? a : b };
    };
    var semis = [tie(top[0], top[3]), tie(top[1], top[2])];
    var mine = semis[0].a.you || semis[0].b.you ? semis[0] : semis[1], other = mine === semis[0] ? semis[1] : semis[0];
    var view = function (t) {
      var youA = t.a.you;
      return { opp: youA ? t.b : t.a, gf: youA ? t.ga : t.gb, ga: youA ? t.gb : t.ga, pens: t.pens, won: t.winner.you === true };
    };
    var out = { qualified: true, table: table, seed: me.pos, semi: view(mine), final: null, result: 'semi' };
    if (out.semi.won) {
      var f = tie(mine.winner, other.winner);
      out.final = view(f);
      out.result = out.final.won ? 'winner' : 'finalist';
    }
    return out;
  }

  /* A transfer window signing: the man replaces the weakest player in his own position.
     Returns that pick's index, or -1 when the squad has nobody in his position. */
  function swapTarget(picks, man) {
    var idx = -1, low = 1e9;
    picks.forEach(function (pk, i) {
      if (pk.player.position !== man.position) return;
      var o = ovOf(pk.player);
      if (o < low) { low = o; idx = i; }
    });
    return idx;
  }

  var api = { CUP: 'The Club Cup', SEASON: SEASON, matchGoals: matchGoals, seasonOpponents: seasonOpponents, seasonStart: seasonStart,
    seasonOpponentAt: seasonOpponentAt, seasonPlay: seasonPlay, seasonTable: seasonTable, seasonCup: seasonCup, swapTarget: swapTarget, MIN_SPIN: MIN_SPIN, MIN_OPP: MIN_OPP, NAMES: NAMES, SKIP: SKIP, BRAND_WORDS: BRAND_WORDS,
    clubName: clubName, eraOf: eraOf, personKey: personKey, build: build, strength: strength, opponents: opponents, spin: spin,
    cupWords: cupWords, chip: chip };
  root.RTPClub = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
