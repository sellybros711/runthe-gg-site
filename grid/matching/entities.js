/* =============================================================================
 * RunTheGrid / Daily Match — tagged entity database (seed core)
 *
 * This is the source the data-driven generator builds boards from. Every board
 * is discovered from these tags via an inverted index (generator.buildFromDB),
 * NOT hand-authored — so the more richly each name is tagged, the more different
 * categories it can anchor, and the longer boards go without repeating.
 *
 * Compact tags (expanded + wordplay-derived in generator.normalizeEntity):
 *   t   teams (full names)          aw  awards / honors (readable strings)
 *   j   jersey numbers (iconic)     ch  championships (count)
 *   dy  draft year                  ml  statistical milestones
 *   dp  draft pick (overall)        b   birth US state (or country)
 *   col college                     pos position group
 *   f   fame_tier 1..5 (5 = household name) — the one hand-tuned knob
 *
 * Only facts tagged with confidence are included; an omitted tag just means one
 * fewer category, never a wrong one. Weighted NFL + NBA (co-leads) and MLB
 * (close third). This is a SEED — the real build bulk-fills it from nflverse /
 * basketball-reference / the Lahman DB (see README), with fame_tier overlaid.
 * ========================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.GRID_ENTITIES = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function e(id, name, sport, f, a) { a = a || {}; a.id = id; a.name = name; a.sport = sport; a.f = f; return a; }

  return [
    /* ---------------- NBA ---------------- */
    e('lebron', 'LeBron James', 'NBA', 5, { t: ['Cleveland Cavaliers', 'Miami Heat', 'Los Angeles Lakers'], j: [23, 6], dy: 2003, dp: 1, b: 'Ohio', pos: 'Forward', aw: ['NBA MVP', 'Finals MVP', 'Rookie of the Year', 'Scoring Champion', 'Hall of Fame Lock'], ch: 4, ml: ['30,000 Point Club', '40,000 Point Club'] }),
    e('jordan', 'Michael Jordan', 'NBA', 5, { t: ['Chicago Bulls', 'Washington Wizards'], j: [23, 45], dy: 1984, dp: 3, col: 'North Carolina', b: 'New York', pos: 'Guard', aw: ['NBA MVP', 'Finals MVP', 'Defensive Player of the Year', 'Rookie of the Year', 'Scoring Champion', 'Hall of Fame'], ch: 6, ml: ['30,000 Point Club'] }),
    e('kobe', 'Kobe Bryant', 'NBA', 5, { t: ['Los Angeles Lakers'], j: [8, 24], dy: 1996, dp: 13, b: 'Pennsylvania', pos: 'Guard', aw: ['NBA MVP', 'Finals MVP', 'Scoring Champion', 'Hall of Fame'], ch: 5, ml: ['30,000 Point Club'] }),
    e('shaq', "Shaquille O'Neal", 'NBA', 5, { t: ['Orlando Magic', 'Los Angeles Lakers', 'Miami Heat', 'Phoenix Suns', 'Cleveland Cavaliers'], j: [32, 34], dy: 1992, dp: 1, col: 'LSU', b: 'New Jersey', pos: 'Center', aw: ['NBA MVP', 'Finals MVP', 'Rookie of the Year', 'Scoring Champion', 'Hall of Fame'], ch: 4 }),
    e('magic', 'Magic Johnson', 'NBA', 5, { t: ['Los Angeles Lakers'], j: [32], dy: 1979, dp: 1, col: 'Michigan State', b: 'Michigan', pos: 'Guard', aw: ['NBA MVP', 'Finals MVP', 'Hall of Fame'], ch: 5 }),
    e('kareem', 'Kareem Abdul-Jabbar', 'NBA', 5, { t: ['Milwaukee Bucks', 'Los Angeles Lakers'], j: [33], dy: 1969, dp: 1, col: 'UCLA', b: 'New York', pos: 'Center', aw: ['NBA MVP', 'Finals MVP', 'Rookie of the Year', 'Scoring Champion', 'Hall of Fame'], ch: 6, ml: ['30,000 Point Club'] }),
    e('bird', 'Larry Bird', 'NBA', 5, { t: ['Boston Celtics'], j: [33], dy: 1978, dp: 6, col: 'Indiana State', b: 'Indiana', pos: 'Forward', aw: ['NBA MVP', 'Finals MVP', 'Rookie of the Year', 'Hall of Fame'], ch: 3 }),
    e('duncan', 'Tim Duncan', 'NBA', 5, { t: ['San Antonio Spurs'], j: [21], dy: 1997, dp: 1, col: 'Wake Forest', pos: 'Forward', aw: ['NBA MVP', 'Finals MVP', 'Rookie of the Year', 'Hall of Fame'], ch: 5 }),
    e('curry', 'Stephen Curry', 'NBA', 5, { t: ['Golden State Warriors'], j: [30], dy: 2009, dp: 7, col: 'Davidson', b: 'Ohio', pos: 'Guard', aw: ['NBA MVP', 'Finals MVP', 'Scoring Champion'], ch: 4 }),
    e('durant', 'Kevin Durant', 'NBA', 5, { t: ['Oklahoma City Thunder', 'Golden State Warriors', 'Brooklyn Nets', 'Phoenix Suns'], j: [35, 7], dy: 2007, dp: 2, col: 'Texas', b: 'Washington DC', pos: 'Forward', aw: ['NBA MVP', 'Finals MVP', 'Rookie of the Year', 'Scoring Champion'], ch: 2 }),
    e('iverson', 'Allen Iverson', 'NBA', 4, { t: ['Philadelphia 76ers'], j: [3], dy: 1996, dp: 1, col: 'Georgetown', b: 'Virginia', pos: 'Guard', aw: ['NBA MVP', 'Rookie of the Year', 'Scoring Champion', 'Hall of Fame'] }),
    e('wade', 'Dwyane Wade', 'NBA', 4, { t: ['Miami Heat', 'Chicago Bulls'], j: [3], dy: 2003, dp: 5, col: 'Marquette', b: 'Illinois', pos: 'Guard', aw: ['Finals MVP', 'Scoring Champion', 'Hall of Fame'], ch: 3 }),
    e('dirk', 'Dirk Nowitzki', 'NBA', 4, { t: ['Dallas Mavericks'], j: [41], dy: 1998, dp: 9, b: 'Germany', pos: 'Forward', aw: ['NBA MVP', 'Finals MVP', 'Hall of Fame'], ch: 1, ml: ['30,000 Point Club'] }),
    e('barkley', 'Charles Barkley', 'NBA', 4, { t: ['Philadelphia 76ers', 'Phoenix Suns', 'Houston Rockets'], j: [34], dy: 1984, dp: 5, col: 'Auburn', b: 'Alabama', pos: 'Forward', aw: ['NBA MVP', 'Hall of Fame'] }),
    e('pippen', 'Scottie Pippen', 'NBA', 4, { t: ['Chicago Bulls'], j: [33], dy: 1987, dp: 5, col: 'Central Arkansas', b: 'Arkansas', pos: 'Forward', aw: ['Hall of Fame'], ch: 6 }),
    e('malone', 'Karl Malone', 'NBA', 4, { t: ['Utah Jazz', 'Los Angeles Lakers'], j: [32], dy: 1985, dp: 13, col: 'Louisiana Tech', b: 'Louisiana', pos: 'Forward', aw: ['NBA MVP', 'Hall of Fame'], ml: ['30,000 Point Club'] }),
    e('giannis', 'Giannis Antetokounmpo', 'NBA', 5, { t: ['Milwaukee Bucks'], j: [34], dy: 2013, dp: 15, b: 'Greece', pos: 'Forward', aw: ['NBA MVP', 'Finals MVP', 'Defensive Player of the Year'], ch: 1 }),
    e('jokic', 'Nikola Jokic', 'NBA', 4, { t: ['Denver Nuggets'], j: [15], dy: 2014, dp: 41, b: 'Serbia', pos: 'Center', aw: ['NBA MVP', 'Finals MVP'], ch: 1 }),
    e('drose', 'Derrick Rose', 'NBA', 4, { t: ['Chicago Bulls', 'New York Knicks'], j: [1], dy: 2008, dp: 1, col: 'Memphis', b: 'Illinois', pos: 'Guard', aw: ['NBA MVP', 'Rookie of the Year'] }),
    e('russell', 'Bill Russell', 'NBA', 4, { t: ['Boston Celtics'], j: [6], dy: 1956, col: 'San Francisco', b: 'Louisiana', pos: 'Center', aw: ['NBA MVP', 'Hall of Fame'], ch: 11 }),
    e('carmelo', 'Carmelo Anthony', 'NBA', 4, { t: ['Denver Nuggets', 'New York Knicks'], j: [7, 15], dy: 2003, dp: 3, col: 'Syracuse', b: 'New York', pos: 'Forward', aw: ['Scoring Champion'] }),
    e('bosh', 'Chris Bosh', 'NBA', 3, { t: ['Toronto Raptors', 'Miami Heat'], j: [1], dy: 2003, dp: 4, col: 'Georgia Tech', b: 'Texas', pos: 'Forward', aw: ['Hall of Fame'], ch: 2 }),
    e('rodman', 'Dennis Rodman', 'NBA', 4, { t: ['Detroit Pistons', 'Chicago Bulls', 'San Antonio Spurs'], j: [91, 10], dy: 1986, dp: 27, b: 'New Jersey', pos: 'Forward', aw: ['Defensive Player of the Year', 'Hall of Fame'], ch: 5 }),
    e('rallen', 'Ray Allen', 'NBA', 3, { t: ['Milwaukee Bucks', 'Boston Celtics', 'Miami Heat'], j: [34, 20], dy: 1996, dp: 5, col: 'Connecticut', pos: 'Guard', aw: ['Hall of Fame'], ch: 2 }),
    e('nash', 'Steve Nash', 'NBA', 4, { t: ['Phoenix Suns', 'Dallas Mavericks', 'Los Angeles Lakers'], j: [13], dy: 1996, dp: 15, col: 'Santa Clara', b: 'South Africa', pos: 'Guard', aw: ['NBA MVP', 'Hall of Fame'] }),
    e('pierce', 'Paul Pierce', 'NBA', 3, { t: ['Boston Celtics'], j: [34], dy: 1998, dp: 10, col: 'Kansas', b: 'California', pos: 'Forward', aw: ['Finals MVP', 'Hall of Fame'], ch: 1 }),
    e('worthy', 'James Worthy', 'NBA', 3, { t: ['Los Angeles Lakers'], j: [42], dy: 1982, dp: 1, col: 'North Carolina', b: 'North Carolina', pos: 'Forward', aw: ['Hall of Fame'], ch: 3 }),
    e('garnett', 'Kevin Garnett', 'NBA', 4, { t: ['Minnesota Timberwolves', 'Boston Celtics'], j: [21, 5], dy: 1995, dp: 5, b: 'South Carolina', pos: 'Forward', aw: ['NBA MVP', 'Defensive Player of the Year', 'Hall of Fame'], ch: 1 }),
    e('havlicek', 'John Havlicek', 'NBA', 3, { t: ['Boston Celtics'], j: [17], dy: 1962, dp: 7, col: 'Ohio State', b: 'Ohio', pos: 'Forward', aw: ['Hall of Fame'], ch: 8 }),
    e('mchale', 'Kevin McHale', 'NBA', 3, { t: ['Boston Celtics'], j: [32], dy: 1980, dp: 3, col: 'Minnesota', b: 'Minnesota', pos: 'Forward', aw: ['Hall of Fame'], ch: 3 }),

    /* ---------------- NFL ---------------- */
    e('brady', 'Tom Brady', 'NFL', 5, { t: ['New England Patriots', 'Tampa Bay Buccaneers'], j: [12], dy: 2000, dp: 199, col: 'Michigan', b: 'California', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP'], ch: 7 }),
    e('pmanning', 'Peyton Manning', 'NFL', 5, { t: ['Indianapolis Colts', 'Denver Broncos'], j: [18], dy: 1998, dp: 1, col: 'Tennessee', b: 'Louisiana', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP', 'Hall of Fame'], ch: 2 }),
    e('rodgers', 'Aaron Rodgers', 'NFL', 5, { t: ['Green Bay Packers', 'New York Jets'], j: [12], dy: 2005, dp: 24, col: 'California', b: 'California', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP'], ch: 1 }),
    e('mahomes', 'Patrick Mahomes', 'NFL', 5, { t: ['Kansas City Chiefs'], j: [15], dy: 2017, dp: 10, col: 'Texas Tech', b: 'Texas', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP'], ch: 3 }),
    e('montana', 'Joe Montana', 'NFL', 5, { t: ['San Francisco 49ers', 'Kansas City Chiefs'], j: [16], dy: 1979, dp: 82, col: 'Notre Dame', b: 'Pennsylvania', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP', 'Hall of Fame'], ch: 4 }),
    e('favre', 'Brett Favre', 'NFL', 4, { t: ['Green Bay Packers', 'New York Jets', 'Minnesota Vikings'], j: [4], dy: 1991, dp: 33, col: 'Southern Miss', b: 'Mississippi', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP', 'Hall of Fame'], ch: 1 }),
    e('lamar', 'Lamar Jackson', 'NFL', 4, { t: ['Baltimore Ravens'], j: [8], dy: 2018, dp: 32, col: 'Louisville', b: 'Florida', pos: 'Quarterback', aw: ['NFL MVP'] }),
    e('allen', 'Josh Allen', 'NFL', 4, { t: ['Buffalo Bills'], j: [17], dy: 2018, dp: 7, col: 'Wyoming', b: 'California', pos: 'Quarterback', aw: ['NFL MVP'] }),
    e('emmitt', 'Emmitt Smith', 'NFL', 5, { t: ['Dallas Cowboys'], j: [22], dy: 1990, dp: 17, col: 'Florida', b: 'Florida', pos: 'Running Back', aw: ['NFL MVP', 'Super Bowl MVP', 'Hall of Fame'], ch: 3, ml: ['NFL Rushing King'] }),
    e('bsanders', 'Barry Sanders', 'NFL', 5, { t: ['Detroit Lions'], j: [20], dy: 1989, dp: 3, col: 'Oklahoma State', b: 'Kansas', pos: 'Running Back', aw: ['NFL MVP', 'Hall of Fame'], ml: ['2,000-Yard Season'] }),
    e('ap', 'Adrian Peterson', 'NFL', 4, { t: ['Minnesota Vikings'], j: [28], dy: 2007, dp: 7, col: 'Oklahoma', b: 'Texas', pos: 'Running Back', aw: ['NFL MVP'], ml: ['2,000-Yard Season'] }),
    e('aikman', 'Troy Aikman', 'NFL', 4, { t: ['Dallas Cowboys'], j: [8], dy: 1989, dp: 1, col: 'UCLA', b: 'California', pos: 'Quarterback', aw: ['Super Bowl MVP', 'Hall of Fame'], ch: 3 }),
    e('irvin', 'Michael Irvin', 'NFL', 3, { t: ['Dallas Cowboys'], j: [88], dy: 1988, dp: 11, col: 'Miami', b: 'Florida', pos: 'Wide Receiver', aw: ['Hall of Fame'], ch: 3 }),
    e('staubach', 'Roger Staubach', 'NFL', 4, { t: ['Dallas Cowboys'], j: [12], dy: 1964, dp: 129, col: 'Navy', b: 'Ohio', pos: 'Quarterback', aw: ['Super Bowl MVP', 'Hall of Fame'], ch: 2 }),
    e('prescott', 'Dak Prescott', 'NFL', 3, { t: ['Dallas Cowboys'], j: [4], dy: 2016, dp: 135, col: 'Mississippi State', b: 'Louisiana', pos: 'Quarterback', aw: ['Offensive Rookie of the Year'] }),
    e('rice', 'Jerry Rice', 'NFL', 5, { t: ['San Francisco 49ers', 'Oakland Raiders'], j: [80], dy: 1985, dp: 16, col: 'Mississippi Valley State', b: 'Mississippi', pos: 'Wide Receiver', aw: ['Super Bowl MVP', 'Hall of Fame'], ch: 3 }),
    e('young', 'Steve Young', 'NFL', 4, { t: ['San Francisco 49ers', 'Tampa Bay Buccaneers'], j: [8], dy: 1984, col: 'BYU', b: 'Utah', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP', 'Hall of Fame'], ch: 3 }),
    e('lott', 'Ronnie Lott', 'NFL', 3, { t: ['San Francisco 49ers'], j: [42], dy: 1981, dp: 8, col: 'USC', b: 'New Mexico', pos: 'Defensive Back', aw: ['Hall of Fame'], ch: 4 }),
    e('gronk', 'Rob Gronkowski', 'NFL', 4, { t: ['New England Patriots', 'Tampa Bay Buccaneers'], j: [87], dy: 2010, dp: 42, col: 'Arizona', b: 'New York', pos: 'Tight End', ch: 4 }),
    e('moss', 'Randy Moss', 'NFL', 4, { t: ['Minnesota Vikings', 'New England Patriots', 'Oakland Raiders'], j: [84, 81], dy: 1998, dp: 21, col: 'Marshall', b: 'West Virginia', pos: 'Wide Receiver', aw: ['Hall of Fame'] }),
    e('edelman', 'Julian Edelman', 'NFL', 3, { t: ['New England Patriots'], j: [11], dy: 2009, dp: 232, col: 'Kent State', b: 'California', pos: 'Wide Receiver', aw: ['Super Bowl MVP'], ch: 3 }),
    e('reggiewhite', 'Reggie White', 'NFL', 4, { t: ['Philadelphia Eagles', 'Green Bay Packers'], j: [92], dy: 1984, col: 'Tennessee', b: 'Tennessee', pos: 'Defensive Line', aw: ['Defensive Player of the Year', 'Hall of Fame'], ch: 1 }),
    e('marino', 'Dan Marino', 'NFL', 4, { t: ['Miami Dolphins'], j: [13], dy: 1983, dp: 27, col: 'Pittsburgh', b: 'Pennsylvania', pos: 'Quarterback', aw: ['NFL MVP', 'Hall of Fame'] }),
    e('elway', 'John Elway', 'NFL', 4, { t: ['Denver Broncos'], j: [7], dy: 1983, dp: 1, col: 'Stanford', b: 'Washington', pos: 'Quarterback', aw: ['NFL MVP', 'Super Bowl MVP', 'Hall of Fame'], ch: 2 }),
    e('brees', 'Drew Brees', 'NFL', 4, { t: ['New Orleans Saints', 'San Diego Chargers'], j: [9], dy: 2001, dp: 32, col: 'Purdue', b: 'Texas', pos: 'Quarterback', aw: ['Super Bowl MVP'], ch: 1 }),

    /* ---------------- MLB ---------------- */
    e('ruth', 'Babe Ruth', 'MLB', 5, { t: ['New York Yankees', 'Boston Red Sox'], j: [3], b: 'Maryland', pos: 'Outfield', aw: ['MLB MVP', 'World Series Champion', 'Hall of Fame'], ch: 7, ml: ['500 Home Run Club'] }),
    e('aaron', 'Hank Aaron', 'MLB', 5, { t: ['Milwaukee Braves', 'Atlanta Braves'], j: [44], b: 'Alabama', pos: 'Outfield', aw: ['MLB MVP', 'World Series Champion', 'Hall of Fame'], ch: 1, ml: ['500 Home Run Club', '3,000 Hit Club'] }),
    e('bonds', 'Barry Bonds', 'MLB', 5, { t: ['Pittsburgh Pirates', 'San Francisco Giants'], j: [25], dy: 1985, dp: 6, col: 'Arizona State', b: 'California', pos: 'Outfield', aw: ['MLB MVP'], ml: ['500 Home Run Club'] }),
    e('mays', 'Willie Mays', 'MLB', 5, { t: ['New York Giants', 'San Francisco Giants'], j: [24], b: 'Alabama', pos: 'Outfield', aw: ['MLB MVP', 'World Series Champion', 'Hall of Fame'], ch: 1, ml: ['500 Home Run Club', '3,000 Hit Club'] }),
    e('jeter', 'Derek Jeter', 'MLB', 5, { t: ['New York Yankees'], j: [2], dy: 1992, dp: 6, b: 'New Jersey', pos: 'Shortstop', aw: ['Rookie of the Year', 'World Series Champion', 'Hall of Fame'], ch: 5, ml: ['3,000 Hit Club'] }),
    e('arod', 'Alex Rodriguez', 'MLB', 4, { t: ['Seattle Mariners', 'Texas Rangers', 'New York Yankees'], j: [13], dy: 1993, dp: 1, b: 'New York', pos: 'Shortstop', aw: ['MLB MVP', 'World Series Champion'], ch: 1, ml: ['500 Home Run Club', '3,000 Hit Club'] }),
    e('griffey', 'Ken Griffey Jr.', 'MLB', 5, { t: ['Seattle Mariners', 'Cincinnati Reds'], j: [24, 30], dy: 1987, dp: 1, b: 'Pennsylvania', pos: 'Outfield', aw: ['MLB MVP', 'Hall of Fame'], ml: ['500 Home Run Club'] }),
    e('pujols', 'Albert Pujols', 'MLB', 5, { t: ['St. Louis Cardinals', 'Los Angeles Angels'], j: [5], dy: 1999, dp: 402, b: 'Dominican Republic', pos: 'First Base', aw: ['MLB MVP', 'World Series Champion', 'Rookie of the Year'], ch: 2, ml: ['500 Home Run Club', '3,000 Hit Club'] }),
    e('mantle', 'Mickey Mantle', 'MLB', 5, { t: ['New York Yankees'], j: [7], b: 'Oklahoma', pos: 'Outfield', aw: ['MLB MVP', 'World Series Champion', 'Hall of Fame'], ch: 7, ml: ['500 Home Run Club'] }),
    e('gehrig', 'Lou Gehrig', 'MLB', 5, { t: ['New York Yankees'], j: [4], col: 'Columbia', b: 'New York', pos: 'First Base', aw: ['MLB MVP', 'World Series Champion', 'Hall of Fame'], ch: 6 }),
    e('dimaggio', 'Joe DiMaggio', 'MLB', 5, { t: ['New York Yankees'], j: [5], b: 'California', pos: 'Outfield', aw: ['MLB MVP', 'World Series Champion', 'Hall of Fame'], ch: 9 }),
    e('rivera', 'Mariano Rivera', 'MLB', 4, { t: ['New York Yankees'], j: [42], b: 'Panama', pos: 'Pitcher', aw: ['World Series Champion', 'Hall of Fame'], ch: 5 }),
    e('berra', 'Yogi Berra', 'MLB', 4, { t: ['New York Yankees'], j: [8], b: 'Missouri', pos: 'Catcher', aw: ['MLB MVP', 'World Series Champion', 'Hall of Fame'], ch: 10 }),
    e('judge', 'Aaron Judge', 'MLB', 4, { t: ['New York Yankees'], j: [99], dy: 2013, dp: 32, col: 'Fresno State', b: 'California', pos: 'Outfield', aw: ['MLB MVP', 'Rookie of the Year'] }),
    e('trout', 'Mike Trout', 'MLB', 4, { t: ['Los Angeles Angels'], j: [27], dy: 2009, dp: 25, b: 'New Jersey', pos: 'Outfield', aw: ['MLB MVP', 'Rookie of the Year'] }),
    e('ohtani', 'Shohei Ohtani', 'MLB', 5, { t: ['Los Angeles Angels', 'Los Angeles Dodgers'], j: [17], b: 'Japan', pos: 'Pitcher', aw: ['MLB MVP', 'World Series Champion', 'Rookie of the Year'], ch: 1 }),
    e('sosa', 'Sammy Sosa', 'MLB', 4, { t: ['Chicago Cubs', 'Texas Rangers'], j: [21], b: 'Dominican Republic', pos: 'Outfield', aw: ['MLB MVP'], ml: ['500 Home Run Club'] }),
    e('thome', 'Jim Thome', 'MLB', 3, { t: ['Cleveland Indians', 'Philadelphia Phillies'], j: [25], dy: 1989, b: 'Illinois', pos: 'First Base', aw: ['Hall of Fame'], ml: ['500 Home Run Club'] }),
    e('ortiz', 'David Ortiz', 'MLB', 4, { t: ['Boston Red Sox', 'Minnesota Twins'], j: [34], b: 'Dominican Republic', pos: 'Designated Hitter', aw: ['World Series Champion', 'Hall of Fame'], ch: 3, ml: ['500 Home Run Club'] }),
    e('rjohnson', 'Randy Johnson', 'MLB', 4, { t: ['Seattle Mariners', 'Arizona Diamondbacks'], j: [51], dy: 1985, col: 'USC', b: 'California', pos: 'Pitcher', aw: ['Cy Young', 'World Series Champion', 'Hall of Fame'], ch: 1 }),
    e('clemens', 'Roger Clemens', 'MLB', 4, { t: ['Boston Red Sox', 'New York Yankees', 'Houston Astros'], j: [21, 22], dy: 1983, dp: 19, col: 'Texas', b: 'Ohio', pos: 'Pitcher', aw: ['MLB MVP', 'Cy Young', 'World Series Champion'], ch: 2 }),
    e('maddux', 'Greg Maddux', 'MLB', 3, { t: ['Chicago Cubs', 'Atlanta Braves'], j: [31], dy: 1984, b: 'Texas', pos: 'Pitcher', aw: ['Cy Young', 'World Series Champion', 'Hall of Fame'], ch: 1 }),
    e('kershaw', 'Clayton Kershaw', 'MLB', 4, { t: ['Los Angeles Dodgers'], j: [22], dy: 2006, dp: 7, b: 'Texas', pos: 'Pitcher', aw: ['MLB MVP', 'Cy Young', 'World Series Champion'], ch: 1 }),
    e('verlander', 'Justin Verlander', 'MLB', 3, { t: ['Detroit Tigers', 'Houston Astros'], j: [35], dy: 2004, dp: 2, col: 'Old Dominion', b: 'Virginia', pos: 'Pitcher', aw: ['MLB MVP', 'Cy Young', 'World Series Champion', 'Rookie of the Year'], ch: 2 })
  ];
});
