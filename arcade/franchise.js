/* franchise.js: one answer to "which club was this, and what was it called
 * then?" (window.RTGFranchise).
 *
 *   RTGFranchise.key(sport, name, year)        -> the franchise, as its current full name
 *   RTGFranchise.nameAt(sport, name, y0, y1)   -> what that club was called over those years
 *   RTGFranchise.label(sport, key, names)      -> one label for a group across eras
 *   RTGFranchise.normalize(entity)             -> era names in e.t, franchises in e.tk,
 *                                                 and e.tkn[i] the franchise of e.t[i]
 *
 * WHY THIS EXISTS
 * Two different mistakes came from one missing table.
 *
 * 1. A club was printed under the name it has TODAY for a career it had
 *    YESTERDAY. The scrapers map every Washington season to "Commanders", so a
 *    2009 lineman was captioned with a name the club took in 2022. The curated
 *    stars carry current names too: Oscar Robertson's Royals read "Sacramento
 *    Kings", the 1960s Bullets read "Washington Wizards".
 * 2. Every game counted and compared clubs by their exact string, so a player
 *    who stayed put through a move had two franchises ("St. Louis Rams" and
 *    "Los Angeles Rams"), and a Common Ground group of Raiders split in two.
 *
 * So each entity keeps two lists. e.t holds the names as they were (what a
 * player reads); e.tk holds one entry per franchise (what a game counts and
 * compares). Display reads e.t, logic reads e.tk.
 *
 * THE YEARS COME FROM e.decade, which is coarse, so the rule is conservative:
 * a name is kept whenever its own era overlaps the player's career at all, and
 * is only replaced when it cannot have been right (a 2009 career and a name
 * first used in 2022). A career that spans a rename keeps the name the source
 * gave it.
 *
 * Seasons that cross two calendar years (NBA, NHL) are filed under the year
 * they end, which is how the leagues number them.
 *
 * Washington's NFL club is filed as the Washington Redskins for 1937 to 2019,
 * because that is what it was called in those seasons. One line below if the
 * site would rather use another label for that era.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTGFranchise = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var N = 9999;

  /* sport -> franchise key -> [[first season, last season, name], ...]
     The key is the club's current (or last) full name. */
  var F = {
    NFL: {
      'Arizona Cardinals': [[1920, 1959, 'Chicago Cardinals'], [1960, 1987, 'St. Louis Cardinals'], [1988, 1993, 'Phoenix Cardinals'], [1994, N, 'Arizona Cardinals']],
      'Indianapolis Colts': [[1953, 1983, 'Baltimore Colts'], [1984, N, 'Indianapolis Colts']],
      'Tennessee Titans': [[1960, 1996, 'Houston Oilers'], [1997, 1998, 'Tennessee Oilers'], [1999, N, 'Tennessee Titans']],
      'Los Angeles Rams': [[1937, 1945, 'Cleveland Rams'], [1946, 1994, 'Los Angeles Rams'], [1995, 2015, 'St. Louis Rams'], [2016, N, 'Los Angeles Rams']],
      'Las Vegas Raiders': [[1960, 1981, 'Oakland Raiders'], [1982, 1994, 'Los Angeles Raiders'], [1995, 2019, 'Oakland Raiders'], [2020, N, 'Las Vegas Raiders']],
      'Los Angeles Chargers': [[1960, 1960, 'Los Angeles Chargers'], [1961, 2016, 'San Diego Chargers'], [2017, N, 'Los Angeles Chargers']],
      'Washington Commanders': [[1932, 1936, 'Boston Redskins'], [1937, 2019, 'Washington Redskins'], [2020, 2021, 'Washington Football Team'], [2022, N, 'Washington Commanders']],
      'Kansas City Chiefs': [[1960, 1962, 'Dallas Texans'], [1963, N, 'Kansas City Chiefs']],
      'New England Patriots': [[1960, 1970, 'Boston Patriots'], [1971, N, 'New England Patriots']],
      'New York Jets': [[1960, 1962, 'New York Titans'], [1963, N, 'New York Jets']]
    },
    NBA: {
      'Atlanta Hawks': [[1950, 1951, 'Tri-Cities Blackhawks'], [1952, 1955, 'Milwaukee Hawks'], [1956, 1968, 'St. Louis Hawks'], [1969, N, 'Atlanta Hawks']],
      'Brooklyn Nets': [[1968, 1968, 'New Jersey Americans'], [1969, 1977, 'New York Nets'], [1978, 2012, 'New Jersey Nets'], [2013, N, 'Brooklyn Nets']],
      'Charlotte Hornets': [[1989, 2002, 'Charlotte Hornets'], [2005, 2014, 'Charlotte Bobcats'], [2015, N, 'Charlotte Hornets']],
      'New Orleans Pelicans': [[2003, 2005, 'New Orleans Hornets'], [2006, 2007, 'New Orleans/Oklahoma City Hornets'], [2008, 2013, 'New Orleans Hornets'], [2014, N, 'New Orleans Pelicans']],
      'Golden State Warriors': [[1947, 1962, 'Philadelphia Warriors'], [1963, 1971, 'San Francisco Warriors'], [1972, N, 'Golden State Warriors']],
      'Houston Rockets': [[1968, 1971, 'San Diego Rockets'], [1972, N, 'Houston Rockets']],
      'Los Angeles Clippers': [[1971, 1978, 'Buffalo Braves'], [1979, 1984, 'San Diego Clippers'], [1985, N, 'Los Angeles Clippers']],
      'Los Angeles Lakers': [[1949, 1960, 'Minneapolis Lakers'], [1961, N, 'Los Angeles Lakers']],
      'Memphis Grizzlies': [[1996, 2001, 'Vancouver Grizzlies'], [2002, N, 'Memphis Grizzlies']],
      'Oklahoma City Thunder': [[1968, 2008, 'Seattle SuperSonics'], [2009, N, 'Oklahoma City Thunder']],
      'Philadelphia 76ers': [[1950, 1963, 'Syracuse Nationals'], [1964, N, 'Philadelphia 76ers']],
      'Sacramento Kings': [[1949, 1957, 'Rochester Royals'], [1958, 1972, 'Cincinnati Royals'], [1973, 1975, 'Kansas City-Omaha Kings'], [1976, 1985, 'Kansas City Kings'], [1986, N, 'Sacramento Kings']],
      'Utah Jazz': [[1975, 1979, 'New Orleans Jazz'], [1980, N, 'Utah Jazz']],
      'Washington Wizards': [[1962, 1962, 'Chicago Packers'], [1963, 1963, 'Chicago Zephyrs'], [1964, 1973, 'Baltimore Bullets'], [1974, 1974, 'Capital Bullets'], [1975, 1997, 'Washington Bullets'], [1998, N, 'Washington Wizards']],
      'Detroit Pistons': [[1949, 1957, 'Fort Wayne Pistons'], [1958, N, 'Detroit Pistons']]
    },
    MLB: {
      'Athletics': [[1901, 1954, 'Philadelphia Athletics'], [1955, 1967, 'Kansas City Athletics'], [1968, 2024, 'Oakland Athletics'], [2025, N, 'Athletics']],
      'Atlanta Braves': [[1912, 1935, 'Boston Braves'], [1936, 1940, 'Boston Bees'], [1941, 1952, 'Boston Braves'], [1953, 1965, 'Milwaukee Braves'], [1966, N, 'Atlanta Braves']],
      'Baltimore Orioles': [[1902, 1953, 'St. Louis Browns'], [1954, N, 'Baltimore Orioles']],
      'Cleveland Guardians': [[1903, 1914, 'Cleveland Naps'], [1915, 2021, 'Cleveland Indians'], [2022, N, 'Cleveland Guardians']],
      'Los Angeles Dodgers': [[1911, 1913, 'Brooklyn Dodgers'], [1914, 1931, 'Brooklyn Robins'], [1932, 1957, 'Brooklyn Dodgers'], [1958, N, 'Los Angeles Dodgers']],
      'San Francisco Giants': [[1883, 1957, 'New York Giants'], [1958, N, 'San Francisco Giants']],
      'Los Angeles Angels': [[1961, 1964, 'Los Angeles Angels'], [1965, 1996, 'California Angels'], [1997, 2004, 'Anaheim Angels'], [2005, N, 'Los Angeles Angels']],
      'Miami Marlins': [[1993, 2011, 'Florida Marlins'], [2012, N, 'Miami Marlins']],
      'Tampa Bay Rays': [[1998, 2007, 'Tampa Bay Devil Rays'], [2008, N, 'Tampa Bay Rays']],
      'Washington Nationals': [[1969, 2004, 'Montreal Expos'], [2005, N, 'Washington Nationals']],
      'Minnesota Twins': [[1901, 1960, 'Washington Senators'], [1905, 1956, 'Washington Nationals'], [1961, N, 'Minnesota Twins']],
      'Texas Rangers': [[1961, 1971, 'Washington Senators'], [1972, N, 'Texas Rangers']],
      'Milwaukee Brewers': [[1969, 1969, 'Seattle Pilots'], [1970, N, 'Milwaukee Brewers']],
      'Houston Astros': [[1962, 1964, "Houston Colt 45's"], [1965, N, 'Houston Astros']],
      'Cincinnati Reds': [[1882, 1953, 'Cincinnati Reds'], [1954, 1958, 'Cincinnati Redlegs'], [1959, N, 'Cincinnati Reds']],
      // Negro leagues: one club under several names
      'Chicago American Giants': [[1920, 1931, 'Chicago American Giants'], [1932, 1935, "Cole's American Giants"], [1936, 1952, 'Chicago American Giants']],
      'Baltimore Elite Giants': [[1920, 1934, 'Nashville Elite Giants'], [1935, 1935, 'Columbus Elite Giants'], [1936, 1937, 'Washington Elite Giants'], [1938, 1951, 'Baltimore Elite Giants']],
      'Newark Eagles': [[1935, 1935, 'Brooklyn Eagles'], [1936, 1948, 'Newark Eagles']],
      'Pittsburgh Crawfords': [[1931, 1938, 'Pittsburgh Crawfords'], [1939, 1940, 'Toledo-Indianapolis Crawfords']],
      'Washington Potomacs': [[1924, 1924, 'Washington Potomacs'], [1925, 1925, 'Wilmington Potomacs']]
    },
    NHL: {
      'Colorado Avalanche': [[1980, 1995, 'Quebec Nordiques'], [1996, N, 'Colorado Avalanche']],
      'Carolina Hurricanes': [[1980, 1997, 'Hartford Whalers'], [1998, N, 'Carolina Hurricanes']],
      'Arizona Coyotes': [[1980, 1996, 'Winnipeg Jets'], [1997, 2014, 'Phoenix Coyotes'], [2015, 2024, 'Arizona Coyotes']],
      'Winnipeg Jets': [[2000, 2011, 'Atlanta Thrashers'], [2012, N, 'Winnipeg Jets']],
      'Dallas Stars': [[1968, 1993, 'Minnesota North Stars'], [1994, N, 'Dallas Stars']],
      'New Jersey Devils': [[1975, 1976, 'Kansas City Scouts'], [1977, 1982, 'Colorado Rockies'], [1983, N, 'New Jersey Devils']],
      'Calgary Flames': [[1973, 1980, 'Atlanta Flames'], [1981, N, 'Calgary Flames']],
      'Anaheim Ducks': [[1994, 2006, 'Mighty Ducks of Anaheim'], [2007, N, 'Anaheim Ducks']]
    },
    WNBA: {
      'Dallas Wings': [[1998, 2009, 'Detroit Shock'], [2010, 2015, 'Tulsa Shock'], [2016, N, 'Dallas Wings']],
      'Las Vegas Aces': [[1997, 2002, 'Utah Starzz'], [2003, 2017, 'San Antonio Stars'], [2018, N, 'Las Vegas Aces']],
      'Connecticut Sun': [[1999, 2002, 'Orlando Miracle'], [2003, N, 'Connecticut Sun']]
    }
  };
  // Short forms the sources also use, mapped to a full name of the same club.
  var ALIAS = {
    NFL: { 'Raiders': 'Las Vegas Raiders', 'Chargers': 'Los Angeles Chargers', 'Rams': 'Los Angeles Rams' },
    NBA: { 'LA Clippers': 'Los Angeles Clippers', 'Nets': 'Brooklyn Nets', 'NO/Oklahoma City Hornets': 'New Orleans/Oklahoma City Hornets' },
    MLB: { 'Angels': 'Los Angeles Angels', 'Marlins': 'Miami Marlins', 'Braves': 'Atlanta Braves', 'Dodgers': 'Los Angeles Dodgers',
           'Los Angeles Angels of Anaheim': 'Los Angeles Angels' }
  };

  // name -> [{key, a, b}] per sport: every era in which a name was in use.
  var BY = {};
  Object.keys(F).forEach(function (sp) {
    var m = BY[sp] = {};
    Object.keys(F[sp]).forEach(function (k) {
      F[sp][k].forEach(function (er) { (m[er[2]] = m[er[2]] || []).push({ key: k, a: er[0], b: er[1] }); });
    });
  });

  function tidy(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function canon(sport, name) {
    var n = tidy(name), al = ALIAS[sport];
    return (al && al[n]) || n;
  }
  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1); }

  /* The franchise a name belongs to. A name two franchises have used (the
     Washington Senators, the Winnipeg Jets) is settled by the year; with no
     year it goes to the later club. */
  function key(sport, name, y0, y1) {
    var n = canon(sport, name), list = (BY[sport] || {})[n];
    if (!list) return n;
    if (list.length === 1 || y0 == null) {
      var keys = {}; list.forEach(function (x) { keys[x.key] = 1; });
      if (Object.keys(keys).length === 1) return list[0].key;
      if (y0 == null) return list[list.length - 1].key;
    }
    if (y1 == null) y1 = y0;
    var best = null, bo = -1;
    list.forEach(function (x) { var o = overlap(y0, y1, x.a, x.b); if (o > bo) { bo = o; best = x; } });
    if (bo > 0) return best.key;
    /* The name was not in use then under either club, so ask which club
       existed at all: a 1969 "Washington Nationals" row is an Expo filed under
       the club's current name, not one of the old Senators. */
    var bk = null, bko = 0;
    list.forEach(function (x) {
      var o = 0; ((F[sport] || {})[x.key] || []).forEach(function (er) { o = Math.max(o, overlap(y0, y1, er[0], er[1])); });
      if (o > bko) { bko = o; bk = x.key; }
    });
    if (bk) return bk;
    // no overlap at all: the nearest era
    var near = null, nd = 1e9;
    list.forEach(function (x) { var d = Math.min(Math.abs(y0 - x.b), Math.abs(y1 - x.a)); if (d < nd) { nd = d; near = x; } });
    return near.key;
  }

  /* The name a club went by over [y0, y1]. Kept as given when the given name
     was in use at any point of that span; otherwise the name with the most
     years inside it. A name outside the table comes back unchanged. */
  function nameAt(sport, name, y0, y1) {
    var n = canon(sport, name);
    if (y0 == null) return n;
    if (y1 == null) y1 = y0;
    var k = key(sport, n, y0, y1), eras = (F[sport] || {})[k];
    if (!eras) return n;
    /* Decades are coarse, so one year of overlap is not evidence: a career
       whose last decade is the 2000s "reaches" 2009, the Thunder's first
       season, and that read Patrick Ewing as a Thunder player. A name needs two
       years inside the span, or one when the span or the name was that short. */
    var mine = eras.filter(function (er) { return er[2] === n; });
    if (mine.some(function (er) { return overlap(y0, y1, er[0], er[1]) >= Math.min(2, y1 - y0 + 1, er[1] - er[0] + 1); })) return n;
    var best = n, bo = 0;
    eras.forEach(function (er) { var o = overlap(y0, y1, er[0], er[1]); if (o > bo) { bo = o; best = er[2]; } });
    return best;
  }

  /* One label for a group that may span eras. Every member under one name:
     that name. Only the city moved (Oakland and Las Vegas Raiders): the
     nickname, "Raiders". Only the nickname changed: the city and both
     nicknames, "Cleveland Indians / Guardians". Both changed: both names,
     "Houston Oilers / Tennessee Titans". Every form reads after "the". */
  function words(n) { return String(n).split(' '); }
  function label(sport, k, names) {
    var u = []; (names || []).forEach(function (n) { if (n && u.indexOf(n) < 0) u.push(n); });
    if (!u.length) return k;
    if (u.length === 1) return u[0];
    // oldest name first; with three or more, the first and the last
    var eras = (F[sport] || {})[k] || [];
    function first(n) { for (var j = 0; j < eras.length; j++) if (eras[j][2] === n) return eras[j][0]; return 1e4; }
    u.sort(function (a, b) { return first(a) - first(b); });
    if (u.length > 2) u = [u[0], u[u.length - 1]];
    var W = u.map(words), i;
    for (i = 0; W.every(function (w) { return w.length > i && w[w.length - 1 - i] === W[0][W[0].length - 1 - i]; }); i++);
    if (i > 0) return W[0].slice(W[0].length - i).join(' ');   // "Athletics" itself counts
    for (i = 0; W.every(function (w) { return w.length > i && w[i] === W[0][i]; }); i++);
    if (i > 0 && W.every(function (w) { return w.length > i; })) {
      var ends = []; W.forEach(function (w) { var x = w.slice(i).join(' '); if (ends.indexOf(x) < 0) ends.push(x); });
      return W[0].slice(0, i).join(' ') + ' ' + ends.slice(0, 3).join(' / ');
    }
    return u.slice(0, 2).join(' / ');
  }

  /* One label for a whole franchise, for a category that accepts every era
     of it ("Played for the Houston Oilers / Tennessee Titans"). Names last
     used before `since` (default 1960) and names held under five seasons
     are left out. */
  function franchiseLabel(sport, k, since) {
    var eras = (F[sport] || {})[k];
    if (!eras) return k;
    var names = [];
    // Interim names (one or two seasons as the Chicago Packers or the
    // Tennessee Oilers) do not anchor a label; the current name always does.
    eras.forEach(function (er, i) {
      var last = i === eras.length - 1, len = Math.min(er[1], new Date().getFullYear()) - er[0] + 1;
      if (er[1] >= (since || 1960) && (last || len >= 5) && names.indexOf(er[2]) < 0) names.push(er[2]);
    });
    return label(sport, k, names.length ? names : [k]);
  }

  /* The years a career can have covered, from its decades: the first year
     of the first decade to the last year of the last. (e.ns is NOTABLE
     seasons, not career length, so it cannot narrow this.) */
  function span(e) {
    var d = (e && e.decade) || [];
    if (!d.length) return null;
    var lo = Math.min.apply(null, d), hi = Math.max.apply(null, d) + 9;
    return [lo, Math.min(hi, new Date().getFullYear())];
  }

  /* e.t -> the names as they were, one each, in their original order;
     e.tk -> one entry per franchise, parallel to the first time each appears.
     e.pt follows e.t. Idempotent. */
  function normalize(e) {
    if (!e || !Array.isArray(e.t) || !e.sport) return e;
    var sp = span(e), out = [], keys = [], per = [], ren = {};
    e.t.forEach(function (raw) {
      var n0 = canon(e.sport, raw);
      if (!n0) return;
      var n = sp ? nameAt(e.sport, n0, sp[0], sp[1]) : n0;
      ren[tidy(raw)] = n;
      var k = sp ? key(e.sport, n, sp[0], sp[1]) : key(e.sport, n);
      if (out.indexOf(n) < 0) { out.push(n); per.push(k); }
      if (keys.indexOf(k) < 0) keys.push(k);
    });
    e.t = out;
    e.tk = keys;
    e.tkn = per;   // per[i] is the franchise of e.t[i]
    if (e.pt) { var p = ren[tidy(e.pt)] || canon(e.sport, e.pt); if (out.indexOf(p) >= 0) e.pt = p; else delete e.pt; }
    return e;
  }

  /* The franchise keys of a list of names, deduplicated (for records built
     before normalize ran, and for roster files). */
  function keysOf(sport, names, y0, y1) {
    var ks = [];
    (names || []).forEach(function (n) { var k = key(sport, n, y0, y1); if (ks.indexOf(k) < 0) ks.push(k); });
    return ks;
  }

  return { key: key, nameAt: nameAt, label: label, franchiseLabel: franchiseLabel, normalize: normalize, keysOf: keysOf, canon: canon, span: span, _F: F };
});
