/* Run The Pitch: the club side (Club Draft and The Cup of Champions).
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
 * NAMES (the owner's call, 2026-11-26): "Use club names, but not brands if there are brands
 * involved." Clubs show by name in plain text, never a crest. Where the name carries a
 * company's brand, NAMES gives the city or the unbranded common name. NAMES also folds the
 * data's spelling pairs (Internazionale and Inter Milan) until the Rosters Agent cleans the
 * file. A new club in the data that carries a brand needs a line here: check-club lists
 * every name it has not seen.
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
    'Pohang Steelers': 'Pohang',
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
    /* one club, two spellings in the data */
    'Internazionale': 'Inter Milan',
    'AC Milan': 'Milan',
    'PSV': 'PSV Eindhoven',
    'Rapid Wien': 'Rapid Vienna',
    '1899 Hoffenheim': 'Hoffenheim',
    'TSG Hoffenheim': 'Hoffenheim',
    'Kaiserslautern': '1. FC Kaiserslautern',
    'Levski-Spartak Sofia': 'Levski Sofia',
    'CSKA SZ Sofia': 'CSKA Sofia',
    'Croatia Zagreb': 'Dinamo Zagreb',
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
    'Chicago Fire FC': 'Chicago Fire',
    'Houston Dynamo FC': 'Houston Dynamo',
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
      var club = clubName(p.club_at_tournament);
      if (!club || p.year == null) return;
      var era = eraOf(p.year), key = club + '|' + era;
      var u = map[key] || (map[key] = { club: club, era: era, decade: Math.floor(p.year / 10) * 10, key: key, people: {} });
      var pk = personKey(p), cur = u.people[pk];
      if (!cur) cur = u.people[pk] = { best: p, wcs: [] };
      if (cur.wcs.indexOf(p.year) < 0) cur.wcs.push(p.year);
      // his best World Cup in that shirt; the later one on a tie
      if (ovOf(p) > ovOf(cur.best) || (ovOf(p) === ovOf(cur.best) && p.year > cur.best.year)) cur.best = p;
    });
    var units = [];
    Object.keys(map).sort().forEach(function (key) {
      var u = map[key];
      var squad = Object.keys(u.people).sort().map(function (pk) {
        var e = u.people[pk], copy = {};
        for (var k in e.best) copy[k] = e.best[k];
        copy.overall = ovOf(e.best);
        copy.club_side = { club: u.club, era: u.era, wcs: e.wcs.slice().sort(function (a, b) { return a - b; }) };
        return copy;
      });
      if (squad.length >= MIN_SPIN) units.push({ club: u.club, era: u.era, decade: u.decade, key: key, squad: squad });
    });
    return units;
  }

  /* How good a unit's best eleven is, before it is placed on the World Cup scale. */
  function strength(squad) {
    var ovs = squad.map(ovOf).sort(function (a, b) { return b - a; }).slice(0, 11);
    while (ovs.length < 11) ovs.push(PAD);
    return ovs.reduce(function (a, b) { return a + b; }, 0) / 11;
  }

  /* The sides met in The Cup of Champions.
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
    return s.replace(/FIFA WORLD CUP/g, 'THE CUP OF CHAMPIONS')
      .replace(/WORLD CUP/g, 'CUP OF CHAMPIONS')
      .replace(/Champions of the world/g, 'Champions of champions')
      .replace(/World Cup winners/g, 'Cup of Champions winners')
      .replace(/World Cup Winners/g, 'Cup of Champions Winners')
      .replace(/World Cup/g, 'Cup of Champions');
  }

  /* Three plain letters for a club's chip. Text only: no crest, no colours of its own. */
  function chip(club) {
    var w = String(club || '').replace(/\(.*?\)/g, '').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).filter(function (x) { return x && !/^\d+$/.test(x) && x.length > 1 || /^[A-Z]{2,}$/.test(x); });
    if (!w.length) return '?';
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    if (w.length === 2) return (w[0].slice(0, 2) + w[1].slice(0, 1)).toUpperCase();
    return (w[0][0] + w[1][0] + w[2][0]).toUpperCase();
  }

  var api = { CUP: 'The Cup of Champions', MIN_SPIN: MIN_SPIN, MIN_OPP: MIN_OPP, NAMES: NAMES, SKIP: SKIP, BRAND_WORDS: BRAND_WORDS,
    clubName: clubName, eraOf: eraOf, personKey: personKey, build: build, strength: strength, opponents: opponents, spin: spin,
    cupWords: cupWords, chip: chip };
  root.RTPClub = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
