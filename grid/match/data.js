/* =============================================================================
 * RunTheGrid — authored board bank
 *
 * Each board is 5 categories x 5 tiles (25 total). Every tile carries `fits`:
 * the list of categories it genuinely satisfies. A tile with two fits is a
 * TRAP — it truly belongs to two lanes, but only one global arrangement solves
 * the board (enforced by generator.solve, verified in verify.js). `solution`
 * records that one valid assignment.
 *
 * fame: 1 (deep cut) .. 5 (household name) — drives difficulty scoring (§6).
 *
 * SPORT WEIGHTING (product direction): football (NFL) and basketball (NBA) are
 * the co-leads, baseball (MLB) a close third. Golf/tennis/hockey/Olympics/
 * wrestling/boxing/UFC appear only rarely and only as the very biggest stars —
 * none of them lead a board. The launch bank below stays inside NFL/NBA/MLB.
 *
 * These boards are hand-authored and solver-verified for the prototype. The
 * full spec generates them from a ~600-entity tagged database via an inverted
 * index (§5); see README for the path from one to the other. Facts are chosen
 * to be unambiguous so the "you can be right and be told you're wrong" failure
 * mode never occurs.
 * ========================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.GRID_BANK = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function t(id, name, sport, fame, fits) {
    return { id: id, name: name, sport: sport, fame: fame, fits: fits };
  }

  /* ---------- Board 1 — "Sunday & Center" (NFL + NBA co-lead) ---------------
   * Traps: Emmitt Smith is a Cowboy AND an NFL MVP; Jordan & Derrick Rose are
   * Bulls AND NBA MVPs. Each points into a lane of single-fit tiles, so no
   * alternate assignment exists. */
  var board1 = {
    id: 'nfl-nba-sunday',
    categories: [
      { id: 'cowboys', name: 'Dallas Cowboys', short: 'Cowboys', family: 'career', sport: 'NFL' },
      { id: 'nflmvp', name: 'NFL MVP Winners', short: 'NFL MVP', family: 'achievement', sport: 'NFL' },
      { id: 'bulls', name: 'Chicago Bulls', short: 'Bulls', family: 'career', sport: 'NBA' },
      { id: 'nbamvp', name: 'NBA MVP Winners', short: 'NBA MVP', family: 'achievement', sport: 'NBA' },
      { id: 'hr500', name: '500 Home Run Club', short: '500 HR', family: 'statistical', sport: 'MLB' }
    ],
    tiles: [
      t('emmitt', 'Emmitt Smith', 'NFL', 5, ['cowboys', 'nflmvp']),   // MVP 1993
      t('aikman', 'Troy Aikman', 'NFL', 4, ['cowboys']),
      t('irvin', 'Michael Irvin', 'NFL', 4, ['cowboys']),
      t('staubach', 'Roger Staubach', 'NFL', 4, ['cowboys']),
      t('ware', 'DeMarcus Ware', 'NFL', 3, ['cowboys']),
      t('mahomes', 'Patrick Mahomes', 'NFL', 5, ['nflmvp']),
      t('pmanning', 'Peyton Manning', 'NFL', 5, ['nflmvp']),
      t('brady', 'Tom Brady', 'NFL', 5, ['nflmvp']),
      t('arodgers', 'Aaron Rodgers', 'NFL', 5, ['nflmvp']),
      t('lamar', 'Lamar Jackson', 'NFL', 4, ['nflmvp']),
      t('jordan', 'Michael Jordan', 'NBA', 5, ['bulls', 'nbamvp']),   // MVP x5
      t('drose', 'Derrick Rose', 'NBA', 4, ['bulls', 'nbamvp']),      // MVP 2011
      t('pippen', 'Scottie Pippen', 'NBA', 4, ['bulls']),
      t('rodman', 'Dennis Rodman', 'NBA', 4, ['bulls']),
      t('noah', 'Joakim Noah', 'NBA', 3, ['bulls']),
      t('magic', 'Magic Johnson', 'NBA', 5, ['nbamvp']),
      t('bird', 'Larry Bird', 'NBA', 5, ['nbamvp']),
      t('shaq', "Shaquille O'Neal", 'NBA', 5, ['nbamvp']),
      t('iverson', 'Allen Iverson', 'NBA', 4, ['nbamvp']),
      t('curry', 'Stephen Curry', 'NBA', 5, ['nbamvp']),
      t('bonds', 'Barry Bonds', 'MLB', 5, ['hr500']),
      t('aaron', 'Hank Aaron', 'MLB', 5, ['hr500']),
      t('ruth', 'Babe Ruth', 'MLB', 5, ['hr500']),
      t('griffey', 'Ken Griffey Jr.', 'MLB', 4, ['hr500']),
      t('arod', 'Alex Rodriguez', 'MLB', 4, ['hr500'])
    ],
    solution: {
      cowboys: ['emmitt', 'aikman', 'irvin', 'staubach', 'ware'],
      nflmvp: ['mahomes', 'pmanning', 'brady', 'arodgers', 'lamar'],
      bulls: ['jordan', 'drose', 'pippen', 'rodman', 'noah'],
      nbamvp: ['magic', 'bird', 'shaq', 'iverson', 'curry'],
      hr500: ['bonds', 'aaron', 'ruth', 'griffey', 'arod']
    }
  };

  /* ---------- Board 2 — "Hardwood Legends" (NBA-forward) --------------------
   * Traps: four Lakers/Celtics were also NBA MVPs (Kobe, Magic, Bird, Russell);
   * Magic is also a Johnson. All bridge into full, single-fit lanes. */
  var board2 = {
    id: 'nba-hardwood',
    categories: [
      { id: 'lakers', name: 'Los Angeles Lakers', short: 'Lakers', family: 'career', sport: 'NBA' },
      { id: 'celtics', name: 'Boston Celtics', short: 'Celtics', family: 'career', sport: 'NBA' },
      { id: 'nbamvp2', name: 'NBA MVP Winners', short: 'NBA MVP', family: 'achievement', sport: 'NBA' },
      { id: 'rush2k', name: '2,000-Yard Rushers', short: '2K Rushers', family: 'statistical', sport: 'NFL' },
      { id: 'johnson', name: 'Surname: Johnson', short: '"Johnson"', family: 'wordplay', sport: 'multi' }
    ],
    tiles: [
      t('kobe', 'Kobe Bryant', 'NBA', 5, ['lakers', 'nbamvp2']),               // MVP 2008
      t('lmagic', 'Magic Johnson', 'NBA', 5, ['lakers', 'nbamvp2', 'johnson']), // MVP x3 + Johnson
      t('jwest', 'Jerry West', 'NBA', 4, ['lakers']),
      t('worthy', 'James Worthy', 'NBA', 3, ['lakers']),
      t('gasol', 'Pau Gasol', 'NBA', 3, ['lakers']),
      t('lbird', 'Larry Bird', 'NBA', 5, ['celtics', 'nbamvp2']),              // MVP x3
      t('russell', 'Bill Russell', 'NBA', 5, ['celtics', 'nbamvp2']),          // MVP x5
      t('pierce', 'Paul Pierce', 'NBA', 4, ['celtics']),
      t('mchale', 'Kevin McHale', 'NBA', 3, ['celtics']),
      t('havlicek', 'John Havlicek', 'NBA', 3, ['celtics']),
      t('bjordan', 'Michael Jordan', 'NBA', 5, ['nbamvp2']),
      t('biverson', 'Allen Iverson', 'NBA', 4, ['nbamvp2']),
      t('bcurry', 'Stephen Curry', 'NBA', 5, ['nbamvp2']),
      t('jokic', 'Nikola Jokic', 'NBA', 4, ['nbamvp2']),
      t('giannis', 'Giannis Antetokounmpo', 'NBA', 5, ['nbamvp2']),
      t('bsanders', 'Barry Sanders', 'NFL', 5, ['rush2k']),
      t('ap', 'Adrian Peterson', 'NFL', 4, ['rush2k']),
      t('tdavis', 'Terrell Davis', 'NFL', 3, ['rush2k']),
      t('henry', 'Derrick Henry', 'NFL', 4, ['rush2k']),
      t('dickerson', 'Eric Dickerson', 'NFL', 3, ['rush2k']),
      t('caljohnson', 'Calvin Johnson', 'NFL', 4, ['johnson']),
      t('randyj', 'Randy Johnson', 'MLB', 4, ['johnson']),
      t('chadj', 'Chad Johnson', 'NFL', 3, ['johnson']),
      t('keyj', 'Keyshawn Johnson', 'NFL', 3, ['johnson']),
      t('larryj', 'Larry Johnson', 'NBA', 3, ['johnson'])
    ],
    solution: {
      lakers: ['kobe', 'lmagic', 'jwest', 'worthy', 'gasol'],
      celtics: ['lbird', 'russell', 'pierce', 'mchale', 'havlicek'],
      nbamvp2: ['bjordan', 'biverson', 'bcurry', 'jokic', 'giannis'],
      rush2k: ['bsanders', 'ap', 'tdavis', 'henry', 'dickerson'],
      johnson: ['caljohnson', 'randyj', 'chadj', 'keyj', 'larryj']
    }
  };

  /* ---------- Board 3 — "Around the Horn" (MLB-forward) ---------------------
   * Traps: Ruth & Mantle are Yankees AND 500-HR men; Reggie Jackson is a
   * Jackson AND a 500-HR man. All bridge into the full 500-HR lane. */
  var board3 = {
    id: 'mlb-aroundthehorn',
    categories: [
      { id: 'yankees', name: 'New York Yankees', short: 'Yankees', family: 'career', sport: 'MLB' },
      { id: 'hr500c', name: '500 Home Run Club', short: '500 HR', family: 'statistical', sport: 'MLB' },
      { id: 'cowboys3', name: 'Dallas Cowboys', short: 'Cowboys', family: 'career', sport: 'NFL' },
      { id: 'nbamvp3', name: 'NBA MVP Winners', short: 'NBA MVP', family: 'achievement', sport: 'NBA' },
      { id: 'jackson', name: 'Surname: Jackson', short: '"Jackson"', family: 'wordplay', sport: 'multi' }
    ],
    tiles: [
      t('jeter', 'Derek Jeter', 'MLB', 5, ['yankees']),
      t('cruth', 'Babe Ruth', 'MLB', 5, ['yankees', 'hr500c']),
      t('cmantle', 'Mickey Mantle', 'MLB', 5, ['yankees', 'hr500c']),
      t('rivera', 'Mariano Rivera', 'MLB', 4, ['yankees']),
      t('berra', 'Yogi Berra', 'MLB', 4, ['yankees']),
      t('caaron', 'Hank Aaron', 'MLB', 5, ['hr500c']),
      t('cbonds', 'Barry Bonds', 'MLB', 5, ['hr500c']),
      t('cmays', 'Willie Mays', 'MLB', 5, ['hr500c']),
      t('cgriffey', 'Ken Griffey Jr.', 'MLB', 4, ['hr500c']),
      t('csosa', 'Sammy Sosa', 'MLB', 4, ['hr500c']),
      t('cemmitt', 'Emmitt Smith', 'NFL', 5, ['cowboys3']),
      t('caikman', 'Troy Aikman', 'NFL', 4, ['cowboys3']),
      t('cirvin', 'Michael Irvin', 'NFL', 4, ['cowboys3']),
      t('cstaubach', 'Roger Staubach', 'NFL', 4, ['cowboys3']),
      t('cdez', 'Dez Bryant', 'NFL', 3, ['cowboys3']),
      t('cjordan', 'Michael Jordan', 'NBA', 5, ['nbamvp3']),
      t('clebron', 'LeBron James', 'NBA', 5, ['nbamvp3']),
      t('cmagic', 'Magic Johnson', 'NBA', 5, ['nbamvp3']),
      t('cbird', 'Larry Bird', 'NBA', 5, ['nbamvp3']),
      t('ccurry', 'Stephen Curry', 'NBA', 5, ['nbamvp3']),
      t('reggiej', 'Reggie Jackson', 'MLB', 4, ['jackson', 'hr500c']),  // 563 HR
      t('boj', 'Bo Jackson', 'NFL', 4, ['jackson']),
      t('lamarj', 'Lamar Jackson', 'NFL', 4, ['jackson']),
      t('deseanj', 'DeSean Jackson', 'NFL', 3, ['jackson']),
      t('markj', 'Mark Jackson', 'NBA', 3, ['jackson'])
    ],
    solution: {
      yankees: ['jeter', 'cruth', 'cmantle', 'rivera', 'berra'],
      hr500c: ['caaron', 'cbonds', 'cmays', 'cgriffey', 'csosa'],
      cowboys3: ['cemmitt', 'caikman', 'cirvin', 'cstaubach', 'cdez'],
      nbamvp3: ['cjordan', 'clebron', 'cmagic', 'cbird', 'ccurry'],
      jackson: ['reggiej', 'boj', 'lamarj', 'deseanj', 'markj']
    }
  };

  return [board1, board2, board3];
});
