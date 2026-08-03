/* Run The Arcade — hand-curated career stat totals for Rank It stat categories.
 * RETIRED players ONLY (totals are settled — never add a player whose numbers
 * still move). Keys are grid/match/entities.js entity ids; every id here has
 * been verified to exist in the corpus with act !== 1.
 * Values are official career regular-season totals:
 *   nba_points  — career NBA regular-season points (NBA only, no ABA)
 *   mlb_hr      — career MLB regular-season home runs
 *   nfl_passtd  — career NFL regular-season passing touchdowns
 */
(function(root){
  'use strict';
  root.RTG_STATS = {
    nba_points: {
      label: 'career NBA points',
      unit: 'pts',
      vals: {
        'nba_kareem-abdul-jabbar': 38387,
        'nba_karl-malone':         36928,
        'nba_kobe-bryant':         33643,
        'nba_michael-jordan':      32292,
        'nba_dirk-nowitzki':       31560,
        'nba_wilt-chamberlain':    31419,
        'nba_shaquille-oneal':     28596,
        'nba_moses-malone':        27409,
        'nba_elvin-hayes':         27313,
        'nba_hakeem-olajuwon':     26946,
        'nba_oscar-robertson':     26710,
        'nba_dominique-wilkins':   26668,
        'nba_tim-duncan':          26496,
        'nba_paul-pierce':         26397,
        'nba_john-havlicek':       26395,
        'nba_kevin-garnett':       26071,
        'nba_vince-carter':        25728,
        'nba_alex-english':        25613,
        'nba_reggie-miller':       25279,
        'nba_jerry-west':          25192,
        'nba_patrick-ewing':       24815,
        'nba_ray-allen':           24505,
        'nba_allen-iverson':       24368,
        'nba_charles-barkley':     23757,
        'nba_robert-parish':       23334,
        'nba_dwyane-wade':         23165,
        'nba_elgin-baylor':        23149,
        'nba_clyde-drexler':       22195,
        'nba_gary-payton':         21813,
        'nba_larry-bird':          21791,
        'nba_pau-gasol':           20894,
        'nba_david-robinson':      20790,
        'nba_mitch-richmond':      20497,
        'nba_john-stockton':       19711,
        'nba_scottie-pippen':      18940,
        'nba_isiah-thomas':        18822,
        'nba_tracy-mcgrady':       18381,
        'nba_magic-johnson':       17707,
        'nba_steve-nash':          17387,
        'nba_bill-russell':        14522
      }
    },
    mlb_hr: {
      label: 'career home runs',
      unit: 'HR',
      vals: {
        'mlb_barry-bonds':      762,
        'mlb_hank-aaron':       755,
        'mlb_babe-ruth':        714,
        'mlb_alex-rodriguez':   696,
        'mlb_willie-mays':      660,
        'mlb_ken-griffey-jr':   630,
        'mlb_jim-thome':        612,
        'mlb_sammy-sosa':       609,
        'mlb_frank-robinson':   586,
        'mlb_mark-mcgwire':     583,
        'mlb_harmon-killebrew': 573,
        'mlb_rafael-palmeiro':  569,
        'mlb_reggie-jackson':   563,
        'mlb_manny-ramirez':    555,
        'mlb_mike-schmidt':     548,
        'mlb_david-ortiz':      541,
        'mlb_mickey-mantle':    536,
        'mlb_ted-williams':     521,
        'mlb_frank-thomas':     521,
        'mlb_gary-sheffield':   509,
        'mlb_eddie-murray':     504,
        'mlb_lou-gehrig':       493,
        'mlb_fred-mcgriff':     493,
        'mlb_adrian-beltre':    477,
        'mlb_stan-musial':      475,
        'mlb_willie-stargell':  475,
        'mlb_carlos-delgado':   473,
        'mlb_chipper-jones':    468,
        'mlb_dave-winfield':    465,
        'mlb_jose-canseco':     462,
        'mlb_carl-yastrzemski': 452,
        'mlb_jeff-bagwell':     449,
        'mlb_vladimir-guerrero':449,
        'mlb_andruw-jones':     434,
        'mlb_cal-ripken-jr':    431,
        'mlb_mike-piazza':      427,
        'mlb_johnny-bench':     389,
        'mlb_ryan-howard':      382,
        'mlb_joe-dimaggio':     361,
        'mlb_yogi-berra':       358
      }
    },
    nfl_passtd: {
      label: 'career passing touchdowns',
      unit: 'pass TD',
      vals: {
        'nfl_peyton-manning':    539,
        'nfl_brett-favre':       508,
        'nfl_dan-marino':        420,
        'nfl_eli-manning':       366,
        'nfl_fran-tarkenton':    342,
        'nfl_john-elway':        300,
        'nfl_carson-palmer':     294,
        'nfl_warren-moon':       291,
        'nfl_johnny-unitas':     290,
        'nfl_joe-montana':       273,
        'nfl_drew-bledsoe':      251,
        'nfl_tony-romo':         248,
        'nfl_donovan-mcnabb':    234,
        'nfl_steve-young':       232,
        'nfl_jay-cutler':        227,
        'nfl_terry-bradshaw':    212,
        'nfl_kurt-warner':       208,
        'nfl_sammy-baugh':       187,
        'nfl_steve-mcnair':      174,
        'nfl_troy-aikman':       165,
        'nfl_roger-staubach':    153,
        'nfl_bart-starr':        152,
        'nfl_michael-vick':      133,
        'nfl_colin-kaepernick':   72
      }
    }
  };
})(typeof self !== 'undefined' ? self : this);
