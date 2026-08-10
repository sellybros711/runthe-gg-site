/* Run The Arcade - hand-curated career stat totals for Rank It stat categories.
 * RETIRED players ONLY (totals are settled - never add a player whose numbers
 * still move). Keys are grid/match/entities.js entity ids; every id here has
 * been verified to exist in the corpus with act !== 1.
 * Values are official career regular-season totals. NBA totals are NBA-only
 * (no ABA); pitching/sacks/steals-blocks use the eras they were tracked.
 *   NBA: nba_points nba_rebounds nba_assists nba_blocks nba_steals nba_threes
 *   NFL: nfl_passtd nfl_passyds nfl_rushyds nfl_recyds nfl_receptions nfl_sacks
 *   MLB: mlb_hr mlb_hits mlb_rbi mlb_sb mlb_wins mlb_strikeouts mlb_saves
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
    },
    nba_rebounds: {
      label: 'career NBA rebounds', unit: 'reb',
      vals: {
        'nba_wilt-chamberlain': 23924, 'nba_bill-russell': 21620, 'nba_kareem-abdul-jabbar': 17440,
        'nba_elvin-hayes': 16279, 'nba_tim-duncan': 15091, 'nba_karl-malone': 14968,
        'nba_robert-parish': 14715, 'nba_kevin-garnett': 14662, 'nba_wes-unseld': 13769,
        'nba_hakeem-olajuwon': 13748, 'nba_shaquille-oneal': 13099, 'nba_charles-barkley': 12546,
        'nba_dikembe-mutombo': 12359, 'nba_dennis-rodman': 11954, 'nba_patrick-ewing': 11607,
        'nba_dirk-nowitzki': 11489, 'nba_pau-gasol': 11305, 'nba_david-robinson': 10497
      }
    },
    nba_assists: {
      label: 'career NBA assists', unit: 'ast',
      vals: {
        'nba_john-stockton': 15806, 'nba_jason-kidd': 12091, 'nba_steve-nash': 10335,
        'nba_magic-johnson': 10141, 'nba_oscar-robertson': 9887, 'nba_isiah-thomas': 9061,
        'nba_gary-payton': 8966, 'nba_tim-hardaway': 7095, 'nba_tony-parker': 7036,
        'nba_bob-cousy': 6955, 'nba_kevin-johnson': 6711, 'nba_dave-bing': 5397,
        'nba_walt-frazier': 5040
      }
    },
    nba_blocks: {
      label: 'career NBA blocks', unit: 'blk',
      vals: {
        'nba_hakeem-olajuwon': 3830, 'nba_dikembe-mutombo': 3289, 'nba_kareem-abdul-jabbar': 3189,
        'nba_tim-duncan': 3020, 'nba_david-robinson': 2954, 'nba_patrick-ewing': 2894,
        'nba_shaquille-oneal': 2732, 'nba_robert-parish': 2361, 'nba_alonzo-mourning': 2356,
        'nba_ben-wallace': 2137, 'nba_kevin-garnett': 2037
      }
    },
    nba_steals: {
      label: 'career NBA steals', unit: 'stl',
      vals: {
        'nba_john-stockton': 3265, 'nba_jason-kidd': 2684, 'nba_michael-jordan': 2514,
        'nba_gary-payton': 2445, 'nba_scottie-pippen': 2307, 'nba_clyde-drexler': 2207,
        'nba_hakeem-olajuwon': 2162, 'nba_karl-malone': 2085, 'nba_allen-iverson': 1983,
        'nba_isiah-thomas': 1861, 'nba_magic-johnson': 1724, 'nba_larry-bird': 1556
      }
    },
    nba_threes: {
      label: 'career 3-pointers made', unit: '3PM',
      vals: {
        'nba_ray-allen': 2973, 'nba_reggie-miller': 2560, 'nba_kyle-korver': 2450,
        'nba_vince-carter': 2290, 'nba_jason-terry': 2282, 'nba_paul-pierce': 2143,
        'nba_jason-kidd': 1988, 'nba_dirk-nowitzki': 1982, 'nba_joe-johnson': 1978,
        'nba_chauncey-billups': 1830, 'nba_steve-nash': 1685, 'nba_glen-rice': 1559
      }
    },
    nfl_passyds: {
      label: 'career passing yards', unit: 'pass yds',
      vals: {
        'nfl_peyton-manning': 71940, 'nfl_brett-favre': 71838, 'nfl_dan-marino': 61361,
        'nfl_eli-manning': 57023, 'nfl_john-elway': 51475, 'nfl_warren-moon': 49325,
        'nfl_fran-tarkenton': 47003, 'nfl_carson-palmer': 46247, 'nfl_drew-bledsoe': 44611,
        'nfl_joe-montana': 40551, 'nfl_johnny-unitas': 40239, 'nfl_donovan-mcnabb': 37276,
        'nfl_jay-cutler': 35133, 'nfl_tony-romo': 34183, 'nfl_steve-young': 33124,
        'nfl_troy-aikman': 32942, 'nfl_kurt-warner': 32344, 'nfl_terry-bradshaw': 27989
      }
    },
    nfl_rushyds: {
      label: 'career rushing yards', unit: 'rush yds',
      vals: {
        'nfl_emmitt-smith': 18355, 'nfl_walter-payton': 16726, 'nfl_barry-sanders': 15269,
        'nfl_curtis-martin': 14101, 'nfl_ladainian-tomlinson': 13684, 'nfl_jerome-bettis': 13662,
        'nfl_eric-dickerson': 13259, 'nfl_tony-dorsett': 12739, 'nfl_jim-brown': 12312,
        'nfl_marshall-faulk': 12279, 'nfl_edgerrin-james': 12246, 'nfl_franco-harris': 12120,
        'nfl_thurman-thomas': 12074, 'nfl_fred-taylor': 11695, 'nfl_steven-jackson': 11438,
        'nfl_corey-dillon': 11241, 'nfl_marshawn-lynch': 10413, 'nfl_ricky-williams': 10009
      }
    },
    nfl_recyds: {
      label: 'career receiving yards', unit: 'rec yds',
      vals: {
        'nfl_jerry-rice': 22895, 'nfl_terrell-owens': 15934, 'nfl_randy-moss': 15292,
        'nfl_isaac-bruce': 15208, 'nfl_tony-gonzalez': 15127, 'nfl_tim-brown': 14934,
        'nfl_steve-smith-sr': 14731, 'nfl_marvin-harrison': 14580, 'nfl_reggie-wayne': 14345,
        'nfl_andre-johnson': 14185, 'nfl_cris-carter': 13899, 'nfl_anquan-boldin': 13779,
        'nfl_torry-holt': 13382, 'nfl_steve-largent': 13089, 'nfl_brandon-marshall': 12351,
        'nfl_hines-ward': 12083, 'nfl_calvin-johnson': 11619, 'nfl_chad-johnson': 11059
      }
    },
    nfl_receptions: {
      label: 'career receptions', unit: 'rec',
      vals: {
        'nfl_jerry-rice': 1549, 'nfl_tony-gonzalez': 1325, 'nfl_jason-witten': 1228,
        'nfl_marvin-harrison': 1102, 'nfl_cris-carter': 1101, 'nfl_tim-brown': 1094,
        'nfl_terrell-owens': 1078, 'nfl_anquan-boldin': 1076, 'nfl_reggie-wayne': 1070,
        'nfl_andre-johnson': 1062, 'nfl_steve-smith-sr': 1031, 'nfl_hines-ward': 1000,
        'nfl_antonio-gates': 955
      }
    },
    nfl_sacks: {
      label: 'career sacks', unit: 'sacks',
      vals: {
        'nfl_bruce-smith': 200, 'nfl_reggie-white': 198, 'nfl_julius-peppers': 159.5,
        'nfl_michael-strahan': 141.5, 'nfl_terrell-suggs': 139, 'nfl_demarcus-ware': 138.5,
        'nfl_john-randle': 137.5, 'nfl_jared-allen': 136, 'nfl_lawrence-taylor': 132.5,
        'nfl_dwight-freeney': 125.5, 'nfl_robert-mathis': 123, 'nfl_warren-sapp': 96.5
      }
    },
    mlb_hits: {
      label: 'career hits', unit: 'hits',
      vals: {
        'mlb_pete-rose': 4256, 'mlb_ty-cobb': 4189, 'mlb_hank-aaron': 3771,
        'mlb_stan-musial': 3630, 'mlb_derek-jeter': 3465, 'mlb_honus-wagner': 3420,
        'mlb_carl-yastrzemski': 3419, 'mlb_willie-mays': 3293, 'mlb_eddie-murray': 3255,
        'mlb_cal-ripken-jr': 3184, 'mlb_adrian-beltre': 3166, 'mlb_george-brett': 3154,
        'mlb_tony-gwynn': 3141, 'mlb_alex-rodriguez': 3115, 'mlb_dave-winfield': 3110,
        'mlb_ichiro-suzuki': 3089, 'mlb_craig-biggio': 3060, 'mlb_rickey-henderson': 3055,
        'mlb_wade-boggs': 3010, 'mlb_roberto-clemente': 3000
      }
    },
    mlb_rbi: {
      label: 'career RBIs', unit: 'RBI',
      vals: {
        'mlb_hank-aaron': 2297, 'mlb_babe-ruth': 2214, 'mlb_alex-rodriguez': 2086,
        'mlb_barry-bonds': 1996, 'mlb_lou-gehrig': 1995, 'mlb_stan-musial': 1951,
        'mlb_ty-cobb': 1944, 'mlb_eddie-murray': 1917, 'mlb_willie-mays': 1909,
        'mlb_ken-griffey-jr': 1836, 'mlb_manny-ramirez': 1831, 'mlb_frank-robinson': 1812,
        'mlb_david-ortiz': 1768, 'mlb_reggie-jackson': 1702, 'mlb_cal-ripken-jr': 1695,
        'mlb_chipper-jones': 1623, 'mlb_mike-schmidt': 1595, 'mlb_harmon-killebrew': 1584
      }
    },
    mlb_sb: {
      label: 'career stolen bases', unit: 'SB',
      vals: {
        'mlb_rickey-henderson': 1406, 'mlb_lou-brock': 938, 'mlb_ty-cobb': 897,
        'mlb_honus-wagner': 723, 'mlb_joe-morgan': 689, 'mlb_ozzie-smith': 580,
        'mlb_jose-reyes': 517, 'mlb_barry-bonds': 514, 'mlb_ichiro-suzuki': 509,
        'mlb_jimmy-rollins': 470, 'mlb_johnny-damon': 408, 'mlb_bobby-abreu': 400,
        'mlb_carlos-beltran': 312
      }
    },
    mlb_wins: {
      label: 'career pitcher wins', unit: 'wins',
      vals: {
        'mlb_cy-young': 511, 'mlb_walter-johnson': 417, 'mlb_warren-spahn': 363,
        'mlb_greg-maddux': 355, 'mlb_roger-clemens': 354, 'mlb_steve-carlton': 329,
        'mlb_nolan-ryan': 324, 'mlb_tom-seaver': 311, 'mlb_tom-glavine': 305,
        'mlb_randy-johnson': 303, 'mlb_mike-mussina': 270, 'mlb_jim-palmer': 268,
        'mlb_andy-pettitte': 256, 'mlb_jack-morris': 254, 'mlb_bob-gibson': 251,
        'mlb_cc-sabathia': 251, 'mlb_bartolo-colon': 247, 'mlb_whitey-ford': 236,
        'mlb_catfish-hunter': 224, 'mlb_john-smoltz': 213
      }
    },
    mlb_strikeouts: {
      label: 'career pitcher strikeouts', unit: 'K',
      vals: {
        'mlb_nolan-ryan': 5714, 'mlb_randy-johnson': 4875, 'mlb_roger-clemens': 4672,
        'mlb_steve-carlton': 4136, 'mlb_tom-seaver': 3640, 'mlb_walter-johnson': 3509,
        'mlb_greg-maddux': 3371, 'mlb_pedro-martinez': 3154, 'mlb_bob-gibson': 3117,
        'mlb_curt-schilling': 3116, 'mlb_cc-sabathia': 3093, 'mlb_john-smoltz': 3084,
        'mlb_mike-mussina': 2813, 'mlb_cy-young': 2803, 'mlb_david-cone': 2668,
        'mlb_tom-glavine': 2607, 'mlb_felix-hernandez': 2524
      }
    },
    mlb_saves: {
      label: 'career saves', unit: 'saves',
      vals: {
        'mlb_mariano-rivera': 652, 'mlb_trevor-hoffman': 601, 'mlb_francisco-rodriguez': 437,
        'mlb_billy-wagner': 422, 'mlb_dennis-eckersley': 390, 'mlb_jonathan-papelbon': 368,
        'mlb_rollie-fingers': 341, 'mlb_goose-gossage': 310
      }
    }
  };
})(typeof self !== 'undefined' ? self : this);
