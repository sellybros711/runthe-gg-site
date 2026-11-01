/* GENERATED numbers and builds by pipeline/fetch_looks.mjs (MLB Stats API); tone and beard set by hand.
 * Re-run the script to refresh the fetched fields: it keeps every hand-set field. See looks.js for how
 * each field is used, and the vault decision 2026-10-31 for why.
 *
 * players: by pack batter id. tone 0 the light skin map .. 1 the dark one, toneSrc where it was set
 *   from; heightIn and weightLb as MLB lists him (people/<mlbam>). null: not known, the hash stands in.
 * games: by pack, then batter id. number the jersey number he wore in that game (boxscore, or the
 *   roster on that date), beard none, stubble or full as he wore it that season, beardSrc its source.
 */
export const LOOKS = {
 "fetched": "2026-10-31",
 "source": "MLB Stats API, statsapi.mlb.com",
 "players": {
  "110029": {
   "name": "Bobby Abreu",
   "mlbam": 110029,
   "heightIn": 72,
   "weightLb": 220,
   "tone": 0.37,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "111867": {
   "name": "Miguel Cairo",
   "mlbam": 111867,
   "heightIn": 73,
   "weightLb": 225,
   "tone": null,
   "toneSrc": null
  },
  "115223": {
   "name": "Vladimir Guerrero",
   "mlbam": 115223,
   "heightIn": 75,
   "weightLb": 235,
   "tone": 1,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "116338": {
   "name": "Torii Hunter",
   "mlbam": 116338,
   "heightIn": 74,
   "weightLb": 220,
   "tone": 0.92,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "116380": {
   "name": "Raul Ibanez",
   "mlbam": 116380,
   "heightIn": 74,
   "weightLb": 225,
   "tone": 0.23,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "117276": {
   "name": "Mark Kotsay",
   "mlbam": 117276,
   "heightIn": 72,
   "weightLb": 220,
   "tone": null,
   "toneSrc": null
  },
  "120074": {
   "name": "David Ortiz",
   "mlbam": 120074,
   "heightIn": 75,
   "weightLb": 230,
   "tone": 0.979,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "123660": {
   "name": "Jason Varitek",
   "mlbam": 123660,
   "heightIn": 74,
   "weightLb": 230,
   "tone": 0.289,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "133160": {
   "name": "Randy Winn",
   "mlbam": 133160,
   "heightIn": 74,
   "weightLb": 190,
   "tone": 0.574,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "134181": {
   "name": "Adrian Beltré",
   "mlbam": 134181,
   "heightIn": 71,
   "weightLb": 220,
   "tone": 0.675,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "134260": {
   "name": "Bengie Molina",
   "mlbam": 134260,
   "heightIn": 71,
   "weightLb": 225,
   "tone": null,
   "toneSrc": null
  },
  "136770": {
   "name": "J.D. Drew",
   "mlbam": 136770,
   "heightIn": 73,
   "weightLb": 200,
   "tone": 0.193,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "136860": {
   "name": "Carlos Beltrán",
   "mlbam": 136860,
   "heightIn": 73,
   "weightLb": 215,
   "tone": 0.629,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "150212": {
   "name": "Michael Cuddyer",
   "mlbam": 150212,
   "heightIn": 74,
   "weightLb": 220,
   "tone": 0.065,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "150289": {
   "name": "Carlos Pena",
   "mlbam": 150289,
   "heightIn": 74,
   "weightLb": 225,
   "tone": 0.553,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "150439": {
   "name": "Gary Matthews Jr.",
   "mlbam": 150439,
   "heightIn": 75,
   "weightLb": 225,
   "tone": 0.988,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "150479": {
   "name": "Felipe López",
   "mlbam": 150479,
   "heightIn": 72,
   "weightLb": 205,
   "tone": 0.275,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "204020": {
   "name": "Lance Berkman",
   "mlbam": 204020,
   "heightIn": 73,
   "weightLb": 220,
   "tone": 0.692,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "276545": {
   "name": "Michael Young",
   "mlbam": 276545,
   "heightIn": 73,
   "weightLb": 200,
   "tone": 0.63,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "285078": {
   "name": "Josh Hamilton",
   "mlbam": 285078,
   "heightIn": 76,
   "weightLb": 240,
   "tone": 0.341,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "346798": {
   "name": "Kyle Lohse",
   "mlbam": 346798,
   "heightIn": 74,
   "weightLb": 215,
   "tone": 0.479,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "400085": {
   "name": "Ichiro Suzuki",
   "mlbam": 400085,
   "heightIn": 71,
   "weightLb": 175,
   "tone": 0.055,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "400121": {
   "name": "Victor Martinez",
   "mlbam": 400121,
   "heightIn": 74,
   "weightLb": 235,
   "tone": 0.203,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "400134": {
   "name": "Eric Hinske",
   "mlbam": 400134,
   "heightIn": 74,
   "weightLb": 235,
   "tone": null,
   "toneSrc": null
  },
  "405395": {
   "name": "Albert Pujols",
   "mlbam": 405395,
   "heightIn": 75,
   "weightLb": 235,
   "tone": 0.367,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "407487": {
   "name": "Juan Rivera",
   "mlbam": 407487,
   "heightIn": 74,
   "weightLb": 220,
   "tone": null,
   "toneSrc": null
  },
  "407812": {
   "name": "Matt Holliday",
   "mlbam": 407812,
   "heightIn": 76,
   "weightLb": 240,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "408042": {
   "name": "Gerald Laird",
   "mlbam": 408042,
   "heightIn": 73,
   "weightLb": 230,
   "tone": 0.479,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "408210": {
   "name": "Chone Figgins",
   "mlbam": 408210,
   "heightIn": 68,
   "weightLb": 180,
   "tone": 0.605,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "408234": {
   "name": "Miguel Cabrera",
   "mlbam": 408234,
   "heightIn": 76,
   "weightLb": 267,
   "tone": 0.229,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "408299": {
   "name": "Omar Infante",
   "mlbam": 408299,
   "heightIn": 71,
   "weightLb": 195,
   "tone": 0.146,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "408307": {
   "name": "Carl Crawford",
   "mlbam": 408307,
   "heightIn": 74,
   "weightLb": 230,
   "tone": 0.569,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "424726": {
   "name": "Jason Bay",
   "mlbam": 424726,
   "heightIn": 74,
   "weightLb": 210,
   "tone": 0.908,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "424825": {
   "name": "Coco Crisp",
   "mlbam": 424825,
   "heightIn": 70,
   "weightLb": 185,
   "tone": 0.294,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "425446": {
   "name": "Aaron Miles",
   "mlbam": 425446,
   "heightIn": 68,
   "weightLb": 180,
   "tone": null,
   "toneSrc": null
  },
  "425509": {
   "name": "Jhonny Peralta",
   "mlbam": 425509,
   "heightIn": 74,
   "weightLb": 225,
   "tone": 0.473,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "425834": {
   "name": "B.J. Upton",
   "mlbam": 425834,
   "heightIn": 75,
   "weightLb": 185,
   "tone": 0.694,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "425877": {
   "name": "Yadier Molina",
   "mlbam": 425877,
   "heightIn": 71,
   "weightLb": 225,
   "tone": 0.204,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "425900": {
   "name": "Dioner Navarro",
   "mlbam": 425900,
   "heightIn": 69,
   "weightLb": 215,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "425902": {
   "name": "Prince Fielder",
   "mlbam": 425902,
   "heightIn": 71,
   "weightLb": 275,
   "tone": 0.773,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "425903": {
   "name": "Kevin Youkilis",
   "mlbam": 425903,
   "heightIn": 73,
   "weightLb": 220,
   "tone": 0.142,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "429665": {
   "name": "Edwin Encarnación",
   "mlbam": 429665,
   "heightIn": 73,
   "weightLb": 230,
   "tone": 0.637,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "430321": {
   "name": "Delmon Young",
   "mlbam": 430321,
   "heightIn": 75,
   "weightLb": 240,
   "tone": 0.867,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "430603": {
   "name": "Don Kelly",
   "mlbam": 430603,
   "heightIn": 76,
   "weightLb": 215,
   "tone": 0.52,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "430832": {
   "name": "José Bautista",
   "mlbam": 430832,
   "heightIn": 72,
   "weightLb": 205,
   "tone": 0.624,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "430946": {
   "name": "Jose Lopez",
   "mlbam": 430946,
   "heightIn": 72,
   "weightLb": 205,
   "tone": 0.447,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "430947": {
   "name": "Erick Aybar",
   "mlbam": 430947,
   "heightIn": 70,
   "weightLb": 195,
   "tone": 0.505,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "431145": {
   "name": "Russell Martin",
   "mlbam": 431145,
   "heightIn": 70,
   "weightLb": 215,
   "tone": 0.245,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "434442": {
   "name": "J.P. Howell",
   "mlbam": 434442,
   "heightIn": 72,
   "weightLb": 180,
   "tone": 0.474,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "434605": {
   "name": "Wladimir Balentien",
   "mlbam": 434605,
   "heightIn": 74,
   "weightLb": 220,
   "tone": null,
   "toneSrc": null
  },
  "434658": {
   "name": "Rajai Davis",
   "mlbam": 434658,
   "heightIn": 70,
   "weightLb": 195,
   "tone": 0.73,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "434778": {
   "name": "Kendrys Morales",
   "mlbam": 434778,
   "heightIn": 73,
   "weightLb": 242,
   "tone": 0.426,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "435062": {
   "name": "Howie Kendrick",
   "mlbam": 435062,
   "heightIn": 71,
   "weightLb": 225,
   "tone": 0.743,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "435063": {
   "name": "Mike Napoli",
   "mlbam": 435063,
   "heightIn": 73,
   "weightLb": 225,
   "tone": 0.221,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "435065": {
   "name": "Reggie Willits",
   "mlbam": 435065,
   "heightIn": 71,
   "weightLb": 185,
   "tone": null,
   "toneSrc": null
  },
  "435079": {
   "name": "Ian Kinsler",
   "mlbam": 435079,
   "heightIn": 72,
   "weightLb": 200,
   "tone": 0.215,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "435263": {
   "name": "Brian McCann",
   "mlbam": 435263,
   "heightIn": 75,
   "weightLb": 225,
   "tone": 0.026,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "435358": {
   "name": "Yuniesky Betancourt",
   "mlbam": 435358,
   "heightIn": 70,
   "weightLb": 205,
   "tone": null,
   "toneSrc": null
  },
  "435559": {
   "name": "Kurt Suzuki",
   "mlbam": 435559,
   "heightIn": 71,
   "weightLb": 210,
   "tone": 0.418,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "443558": {
   "name": "Nelson Cruz",
   "mlbam": 443558,
   "heightIn": 74,
   "weightLb": 230,
   "tone": 0.421,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "444135": {
   "name": "Ryan Theriot",
   "mlbam": 444135,
   "heightIn": 71,
   "weightLb": 185,
   "tone": null,
   "toneSrc": null
  },
  "444876": {
   "name": "Alcides Escobar",
   "mlbam": 444876,
   "heightIn": 73,
   "weightLb": 205,
   "tone": 0.678,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "445055": {
   "name": "Jon Jay",
   "mlbam": 445055,
   "heightIn": 71,
   "weightLb": 200,
   "tone": 0.218,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "446334": {
   "name": "Evan Longoria",
   "mlbam": 446334,
   "heightIn": 73,
   "weightLb": 213,
   "tone": 0.224,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "446386": {
   "name": "Brandon Guyer",
   "mlbam": 446386,
   "heightIn": 74,
   "weightLb": 210,
   "tone": 0.036,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "450314": {
   "name": "Ben Zobrist",
   "mlbam": 450314,
   "heightIn": 75,
   "weightLb": 210,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "452678": {
   "name": "Asdrúbal Cabrera",
   "mlbam": 452678,
   "heightIn": 72,
   "weightLb": 235,
   "tone": 0.144,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "453064": {
   "name": "Troy Tulowitzki",
   "mlbam": 453064,
   "heightIn": 75,
   "weightLb": 205,
   "tone": 0.22,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "456030": {
   "name": "Dustin Pedroia",
   "mlbam": 456030,
   "heightIn": 69,
   "weightLb": 170,
   "tone": 0.277,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "456714": {
   "name": "Billy Butler",
   "mlbam": 456714,
   "heightIn": 72,
   "weightLb": 260,
   "tone": 0.159,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "456715": {
   "name": "Lorenzo Cain",
   "mlbam": 456715,
   "heightIn": 74,
   "weightLb": 214,
   "tone": 0.458,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "457706": {
   "name": "Austin Jackson",
   "mlbam": 457706,
   "heightIn": 73,
   "weightLb": 198,
   "tone": 0.499,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "458036": {
   "name": "Nick Stavinoha",
   "mlbam": 458036,
   "heightIn": 74,
   "weightLb": 240,
   "tone": null,
   "toneSrc": null
  },
  "458675": {
   "name": "Colby Rasmus",
   "mlbam": 458675,
   "heightIn": 74,
   "weightLb": 195,
   "tone": 0.228,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "459434": {
   "name": "Rene Tosoni",
   "mlbam": 459434,
   "heightIn": 72,
   "weightLb": 195,
   "tone": null,
   "toneSrc": null
  },
  "460086": {
   "name": "Alex Gordon",
   "mlbam": 460086,
   "heightIn": 73,
   "weightLb": 220,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "461815": {
   "name": "David Murphy",
   "mlbam": 461815,
   "heightIn": 75,
   "weightLb": 210,
   "tone": 0.24,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "461834": {
   "name": "Tug Hulett",
   "mlbam": 461834,
   "heightIn": 70,
   "weightLb": 185,
   "tone": null,
   "toneSrc": null
  },
  "461858": {
   "name": "Trevor Plouffe",
   "mlbam": 461858,
   "heightIn": 74,
   "weightLb": 215,
   "tone": 0.171,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "462101": {
   "name": "Elvis Andrus",
   "mlbam": 462101,
   "heightIn": 72,
   "weightLb": 210,
   "tone": 0.5,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "467793": {
   "name": "Carlos Santana",
   "mlbam": 467793,
   "heightIn": 70,
   "weightLb": 210,
   "tone": 0.667,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "471863": {
   "name": "Luke Hughes",
   "mlbam": 471863,
   "heightIn": 71,
   "weightLb": 205,
   "tone": null,
   "toneSrc": null
  },
  "472528": {
   "name": "Luis Valbuena",
   "mlbam": 472528,
   "heightIn": 70,
   "weightLb": 215,
   "tone": 0.611,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "475582": {
   "name": "Ryan Zimmerman",
   "mlbam": 475582,
   "heightIn": 75,
   "weightLb": 215,
   "tone": 0.023,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "476633": {
   "name": "Chris Parmelee",
   "mlbam": 476633,
   "heightIn": 73,
   "weightLb": 220,
   "tone": 0.332,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "476704": {
   "name": "Jed Lowrie",
   "mlbam": 476704,
   "heightIn": 72,
   "weightLb": 180,
   "tone": 0.07,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "488671": {
   "name": "Alex Avila",
   "mlbam": 488671,
   "heightIn": 71,
   "weightLb": 228,
   "tone": 0.089,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "492841": {
   "name": "Michael Martinez",
   "mlbam": 492841,
   "heightIn": 69,
   "weightLb": 180,
   "tone": 0.743,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "493114": {
   "name": "Norichika Aoki",
   "mlbam": 493114,
   "heightIn": 69,
   "weightLb": 180,
   "tone": 0.384,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "493127": {
   "name": "Akinori Iwamura",
   "mlbam": 493127,
   "heightIn": 69,
   "weightLb": 200,
   "tone": null,
   "toneSrc": null
  },
  "493329": {
   "name": "Yuli Gurriel",
   "mlbam": 493329,
   "heightIn": 72,
   "weightLb": 215,
   "tone": 0.53,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "499624": {
   "name": "Chris Colabello",
   "mlbam": 499624,
   "heightIn": 76,
   "weightLb": 210,
   "tone": 0.574,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "501800": {
   "name": "Allen Craig",
   "mlbam": 501800,
   "heightIn": 74,
   "weightLb": 215,
   "tone": 0.109,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "501896": {
   "name": "David Freese",
   "mlbam": 501896,
   "heightIn": 74,
   "weightLb": 213,
   "tone": 0.261,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "501920": {
   "name": "Brian Dinkelman",
   "mlbam": 501920,
   "heightIn": 71,
   "weightLb": 195,
   "tone": null,
   "toneSrc": null
  },
  "501994": {
   "name": "Joe Benson",
   "mlbam": 501994,
   "heightIn": 73,
   "weightLb": 205,
   "tone": 0.189,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "502143": {
   "name": "Danny Valencia",
   "mlbam": 502143,
   "heightIn": 74,
   "weightLb": 210,
   "tone": 0.116,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "502210": {
   "name": "Josh Reddick",
   "mlbam": 502210,
   "heightIn": 74,
   "weightLb": 197,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "502671": {
   "name": "Paul Goldschmidt",
   "mlbam": 502671,
   "heightIn": 74,
   "weightLb": 225,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "503556": {
   "name": "Marwin Gonzalez",
   "mlbam": 503556,
   "heightIn": 73,
   "weightLb": 205,
   "tone": 0.17,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "514888": {
   "name": "Jose Altuve",
   "mlbam": 514888,
   "heightIn": 66,
   "weightLb": 167,
   "tone": 0.243,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "516416": {
   "name": "Jean Segura",
   "mlbam": 516416,
   "heightIn": 70,
   "weightLb": 220,
   "tone": 0.743,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "518614": {
   "name": "Daniel Descalso",
   "mlbam": 518614,
   "heightIn": 70,
   "weightLb": 190,
   "tone": 0.158,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "518626": {
   "name": "Josh Donaldson",
   "mlbam": 518626,
   "heightIn": 73,
   "weightLb": 210,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "519048": {
   "name": "Mitch Moreland",
   "mlbam": 519048,
   "heightIn": 75,
   "weightLb": 245,
   "tone": 0.084,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "519058": {
   "name": "Mike Moustakas",
   "mlbam": 519058,
   "heightIn": 72,
   "weightLb": 230,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "519184": {
   "name": "Ben Revere",
   "mlbam": 519184,
   "heightIn": 69,
   "weightLb": 175,
   "tone": 0.547,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "519203": {
   "name": "Anthony Rizzo",
   "mlbam": 519203,
   "heightIn": 75,
   "weightLb": 240,
   "tone": 0.079,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "519306": {
   "name": "Steven Souza Jr.",
   "mlbam": 519306,
   "heightIn": 76,
   "weightLb": 225,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "519317": {
   "name": "Giancarlo Stanton",
   "mlbam": 519317,
   "heightIn": 77,
   "weightLb": 245,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "521692": {
   "name": "Salvador Perez",
   "mlbam": 521692,
   "heightIn": 74,
   "weightLb": 255,
   "tone": 0.308,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543108": {
   "name": "Andy Dirks",
   "mlbam": 543108,
   "heightIn": 72,
   "weightLb": 195,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543228": {
   "name": "Yan Gomes",
   "mlbam": 543228,
   "heightIn": 74,
   "weightLb": 212,
   "tone": 0.256,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543333": {
   "name": "Eric Hosmer",
   "mlbam": 543333,
   "heightIn": 76,
   "weightLb": 226,
   "tone": 0.021,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543401": {
   "name": "Jason Kipnis",
   "mlbam": 543401,
   "heightIn": 71,
   "weightLb": 200,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543592": {
   "name": "Austin Nola",
   "mlbam": 543592,
   "heightIn": 72,
   "weightLb": 197,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543685": {
   "name": "Anthony Rendon",
   "mlbam": 543685,
   "heightIn": 73,
   "weightLb": 200,
   "tone": 0.381,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543760": {
   "name": "Marcus Semien",
   "mlbam": 543760,
   "heightIn": 72,
   "weightLb": 195,
   "tone": 0.476,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "543807": {
   "name": "George Springer",
   "mlbam": 543807,
   "heightIn": 73,
   "weightLb": 220,
   "tone": 0.225,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "547180": {
   "name": "Bryce Harper",
   "mlbam": 547180,
   "heightIn": 73,
   "weightLb": 210,
   "tone": 0.032,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "571448": {
   "name": "Nolan Arenado",
   "mlbam": 571448,
   "heightIn": 74,
   "weightLb": 215,
   "tone": 0.378,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "572041": {
   "name": "AJ Pollock",
   "mlbam": 572041,
   "heightIn": 73,
   "weightLb": 210,
   "tone": 0.186,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "572191": {
   "name": "Michael A. Taylor",
   "mlbam": 572191,
   "heightIn": 76,
   "weightLb": 215,
   "tone": 0.767,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "572761": {
   "name": "Matt Carpenter",
   "mlbam": 572761,
   "heightIn": 76,
   "weightLb": 224,
   "tone": 0.188,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "575929": {
   "name": "Willson Contreras",
   "mlbam": 575929,
   "heightIn": 72,
   "weightLb": 240,
   "tone": 0.34,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "578428": {
   "name": "Jose Iglesias",
   "mlbam": 578428,
   "heightIn": 71,
   "weightLb": 195,
   "tone": 0.235,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "592192": {
   "name": "Mark Canha",
   "mlbam": 592192,
   "heightIn": 73,
   "weightLb": 200,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "592206": {
   "name": "Nick Castellanos",
   "mlbam": 592206,
   "heightIn": 75,
   "weightLb": 203,
   "tone": 0.447,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "592450": {
   "name": "Aaron Judge",
   "mlbam": 592450,
   "heightIn": 79,
   "weightLb": 282,
   "tone": 0.084,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "592518": {
   "name": "Manny Machado",
   "mlbam": 592518,
   "heightIn": 74,
   "weightLb": 218,
   "tone": 0.285,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "592663": {
   "name": "J.T. Realmuto",
   "mlbam": 592663,
   "heightIn": 72,
   "weightLb": 212,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "593428": {
   "name": "Xander Bogaerts",
   "mlbam": 593428,
   "heightIn": 74,
   "weightLb": 218,
   "tone": 0.626,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "595978": {
   "name": "Austin Hedges",
   "mlbam": 595978,
   "heightIn": 72,
   "weightLb": 220,
   "tone": 0.14,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "596019": {
   "name": "Francisco Lindor",
   "mlbam": 596019,
   "heightIn": 70,
   "weightLb": 190,
   "tone": 0.515,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "600301": {
   "name": "Taylor Motter",
   "mlbam": 600301,
   "heightIn": 73,
   "weightLb": 195,
   "tone": 0.231,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "605141": {
   "name": "Mookie Betts",
   "mlbam": 605141,
   "heightIn": 69,
   "weightLb": 180,
   "tone": 0.363,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "607208": {
   "name": "Trea Turner",
   "mlbam": 607208,
   "heightIn": 73,
   "weightLb": 185,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "607680": {
   "name": "Kevin Pillar",
   "mlbam": 607680,
   "heightIn": 72,
   "weightLb": 210,
   "tone": 0.119,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "608070": {
   "name": "José Ramírez",
   "mlbam": 608070,
   "heightIn": 68,
   "weightLb": 190,
   "tone": 0.371,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "608324": {
   "name": "Alex Bregman",
   "mlbam": 608324,
   "heightIn": 70,
   "weightLb": 190,
   "tone": 0.064,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "608369": {
   "name": "Corey Seager",
   "mlbam": 608369,
   "heightIn": 76,
   "weightLb": 215,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "621035": {
   "name": "Chris Taylor",
   "mlbam": 621035,
   "heightIn": 72,
   "weightLb": 196,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "621043": {
   "name": "Carlos Correa",
   "mlbam": 621043,
   "heightIn": 75,
   "weightLb": 220,
   "tone": 0.445,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "630105": {
   "name": "Jake Cronenworth",
   "mlbam": 630105,
   "heightIn": 71,
   "weightLb": 187,
   "tone": 0.097,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "641355": {
   "name": "Cody Bellinger",
   "mlbam": 641355,
   "heightIn": 75,
   "weightLb": 204,
   "tone": 0.121,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "641598": {
   "name": "Mitch Garver",
   "mlbam": 641598,
   "heightIn": 73,
   "weightLb": 220,
   "tone": 0.189,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "643393": {
   "name": "Tony Kemp",
   "mlbam": 643393,
   "heightIn": 66,
   "weightLb": 160,
   "tone": 0.454,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "643396": {
   "name": "Isiah Kiner-Falefa",
   "mlbam": 643396,
   "heightIn": 70,
   "weightLb": 195,
   "tone": 0.092,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "645302": {
   "name": "Victor Robles",
   "mlbam": 645302,
   "heightIn": 72,
   "weightLb": 193,
   "tone": 0.419,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "650402": {
   "name": "Gleyber Torres",
   "mlbam": 650402,
   "heightIn": 70,
   "weightLb": 205,
   "tone": 0.142,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "656555": {
   "name": "Rhys Hoskins",
   "mlbam": 656555,
   "heightIn": 75,
   "weightLb": 241,
   "tone": 0.34,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "656941": {
   "name": "Kyle Schwarber",
   "mlbam": 656941,
   "heightIn": 71,
   "weightLb": 229,
   "tone": 0.084,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "657077": {
   "name": "Alex Verdugo",
   "mlbam": 657077,
   "heightIn": 72,
   "weightLb": 209,
   "tone": 0.048,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "662139": {
   "name": "Daulton Varsho",
   "mlbam": 662139,
   "heightIn": 68,
   "weightLb": 207,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "663609": {
   "name": "Luken Baker",
   "mlbam": 663609,
   "heightIn": 76,
   "weightLb": 285,
   "tone": 0.349,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "663647": {
   "name": "Ke'Bryan Hayes",
   "mlbam": 663647,
   "heightIn": 71,
   "weightLb": 215,
   "tone": 0.602,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "663697": {
   "name": "Jonathan India",
   "mlbam": 663697,
   "heightIn": 70,
   "weightLb": 200,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "663757": {
   "name": "Trent Grisham",
   "mlbam": 663757,
   "heightIn": 70,
   "weightLb": 221,
   "tone": 0.171,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "663993": {
   "name": "Nathaniel Lowe",
   "mlbam": 663993,
   "heightIn": 76,
   "weightLb": 220,
   "tone": 0.176,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "664702": {
   "name": "Myles Straw",
   "mlbam": 664702,
   "heightIn": 69,
   "weightLb": 178,
   "tone": 0.169,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "664761": {
   "name": "Alec Bohm",
   "mlbam": 664761,
   "heightIn": 76,
   "weightLb": 218,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "664770": {
   "name": "Nathan Lukes",
   "mlbam": 664770,
   "heightIn": 71,
   "weightLb": 180,
   "tone": 0.157,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "665489": {
   "name": "Vladimir Guerrero Jr.",
   "mlbam": 665489,
   "heightIn": 72,
   "weightLb": 245,
   "tone": 0.734,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "665742": {
   "name": "Juan Soto",
   "mlbam": 665742,
   "heightIn": 73,
   "weightLb": 224,
   "tone": 0.501,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "665750": {
   "name": "Leody Taveras",
   "mlbam": 665750,
   "heightIn": 74,
   "weightLb": 210,
   "tone": 0.362,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "665862": {
   "name": "Jazz Chisholm Jr.",
   "mlbam": 665862,
   "heightIn": 71,
   "weightLb": 184,
   "tone": 0.886,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "665926": {
   "name": "Andrés Giménez",
   "mlbam": 665926,
   "heightIn": 71,
   "weightLb": 161,
   "tone": 0.393,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "666158": {
   "name": "Gavin Lux",
   "mlbam": 666158,
   "heightIn": 71,
   "weightLb": 190,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "666181": {
   "name": "Will Benson",
   "mlbam": 666181,
   "heightIn": 76,
   "weightLb": 230,
   "tone": 0.451,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "666182": {
   "name": "Bo Bichette",
   "mlbam": 666182,
   "heightIn": 71,
   "weightLb": 190,
   "tone": 0.142,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "666969": {
   "name": "Adolis García",
   "mlbam": 666969,
   "heightIn": 72,
   "weightLb": 205,
   "tone": 0.804,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "668715": {
   "name": "Spencer Steer",
   "mlbam": 668715,
   "heightIn": 69,
   "weightLb": 185,
   "tone": 0.003,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "668800": {
   "name": "Andrew Knizner",
   "mlbam": 668800,
   "heightIn": 72,
   "weightLb": 225,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "669016": {
   "name": "Brandon Marsh",
   "mlbam": 669016,
   "heightIn": 74,
   "weightLb": 215,
   "tone": 0.005,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "669224": {
   "name": "Austin Wells",
   "mlbam": 669224,
   "heightIn": 73,
   "weightLb": 220,
   "tone": 0.191,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "669242": {
   "name": "Tommy Edman",
   "mlbam": 669242,
   "heightIn": 70,
   "weightLb": 193,
   "tone": 0.059,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "669257": {
   "name": "Will Smith",
   "mlbam": 669257,
   "heightIn": 70,
   "weightLb": 195,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "669720": {
   "name": "Austin Hays",
   "mlbam": 669720,
   "heightIn": 70,
   "weightLb": 200,
   "tone": 0.177,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "670770": {
   "name": "TJ Friedl",
   "mlbam": 670770,
   "heightIn": 68,
   "weightLb": 180,
   "tone": 0.071,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "672386": {
   "name": "Alejandro Kirk",
   "mlbam": 672386,
   "heightIn": 68,
   "weightLb": 245,
   "tone": 0.073,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "672580": {
   "name": "Maikel Garcia",
   "mlbam": 672580,
   "heightIn": 73,
   "weightLb": 180,
   "tone": 0.464,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "673490": {
   "name": "Ha-Seong Kim",
   "mlbam": 673490,
   "heightIn": 70,
   "weightLb": 200,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "673962": {
   "name": "Josh Jung",
   "mlbam": 673962,
   "heightIn": 73,
   "weightLb": 214,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "676391": {
   "name": "Ernie Clement",
   "mlbam": 676391,
   "heightIn": 72,
   "weightLb": 170,
   "tone": 0.185,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "677951": {
   "name": "Bobby Witt Jr.",
   "mlbam": 677951,
   "heightIn": 73,
   "weightLb": 200,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "679845": {
   "name": "Nick Loftin",
   "mlbam": 679845,
   "heightIn": 71,
   "weightLb": 180,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "680574": {
   "name": "Matt McLain",
   "mlbam": 680574,
   "heightIn": 68,
   "weightLb": 180,
   "tone": 0.015,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "680718": {
   "name": "Addison Barger",
   "mlbam": 680718,
   "heightIn": 71,
   "weightLb": 210,
   "tone": 0.092,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "681082": {
   "name": "Bryson Stott",
   "mlbam": 681082,
   "heightIn": 72,
   "weightLb": 200,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "682622": {
   "name": "Noelvi Marte",
   "mlbam": 682622,
   "heightIn": 74,
   "weightLb": 216,
   "tone": 0.419,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "682829": {
   "name": "Elly De La Cruz",
   "mlbam": 682829,
   "heightIn": 78,
   "weightLb": 200,
   "tone": 0.942,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "683011": {
   "name": "Anthony Volpe",
   "mlbam": 683011,
   "heightIn": 70,
   "weightLb": 197,
   "tone": 0.074,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "686469": {
   "name": "Vinnie Pasquantino",
   "mlbam": 686469,
   "heightIn": 75,
   "weightLb": 245,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "686475": {
   "name": "Tyler Tolbert",
   "mlbam": 686475,
   "heightIn": 70,
   "weightLb": 185,
   "tone": 0.737,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "691023": {
   "name": "Jordan Walker",
   "mlbam": 691023,
   "heightIn": 78,
   "weightLb": 250,
   "tone": 0.784,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "691026": {
   "name": "Masyn Winn",
   "mlbam": 691026,
   "heightIn": 69,
   "weightLb": 185,
   "tone": 0.242,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "694497": {
   "name": "Evan Carter",
   "mlbam": 694497,
   "heightIn": 74,
   "weightLb": 190,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "695506": {
   "name": "Jac Caglianone",
   "mlbam": 695506,
   "heightIn": 76,
   "weightLb": 250,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:sciom001": {
   "name": "Mike Scioscia",
   "mlbam": 121919,
   "heightIn": 74,
   "weightLb": 220,
   "tone": 0.376,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:hamij001": {
   "name": "Jeff Hamilton",
   "mlbam": 115382,
   "heightIn": 75,
   "weightLb": 205,
   "tone": null,
   "toneSrc": null
  },
  "retro:davim002": {
   "name": "Mike Davis",
   "mlbam": 113127,
   "heightIn": 75,
   "weightLb": 185,
   "tone": null,
   "toneSrc": null
  },
  "retro:gibsk001": {
   "name": "Kirk Gibson",
   "mlbam": 114752,
   "heightIn": 75,
   "weightLb": 215,
   "tone": null,
   "toneSrc": null
  },
  "retro:sax-s001": {
   "name": "Steve Sax",
   "mlbam": 121732,
   "heightIn": 71,
   "weightLb": 185,
   "tone": 0.75,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:stubf001": {
   "name": "Franklin Stubbs",
   "mlbam": 122899,
   "heightIn": 74,
   "weightLb": 215,
   "tone": null,
   "toneSrc": null
  },
  "retro:hatcm001": {
   "name": "Mickey Hatcher",
   "mlbam": 115601,
   "heightIn": 74,
   "weightLb": 200,
   "tone": null,
   "toneSrc": null
  },
  "retro:marsm001": {
   "name": "Mike Marshall",
   "mlbam": 118319,
   "heightIn": 77,
   "weightLb": 220,
   "tone": null,
   "toneSrc": null
  },
  "retro:shelj001": {
   "name": "John Shelby",
   "mlbam": 122112,
   "heightIn": 73,
   "weightLb": 175,
   "tone": null,
   "toneSrc": null
  },
  "retro:gracm001": {
   "name": "Mark Grace",
   "mlbam": 115007,
   "heightIn": 74,
   "weightLb": 200,
   "tone": 0.813,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:milld002": {
   "name": "Damian Miller",
   "mlbam": 119064,
   "heightIn": 75,
   "weightLb": 220,
   "tone": 0.269,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:bellj001": {
   "name": "Jay Bell",
   "mlbam": 110826,
   "heightIn": 72,
   "weightLb": 185,
   "tone": 0.688,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:womat001": {
   "name": "Tony Womack",
   "mlbam": 124523,
   "heightIn": 69,
   "weightLb": 170,
   "tone": 0.569,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:counc001": {
   "name": "Craig Counsell",
   "mlbam": 112736,
   "heightIn": 72,
   "weightLb": 180,
   "tone": null,
   "toneSrc": null
  },
  "retro:gonzl001": {
   "name": "Luis Gonzalez",
   "mlbam": 114935,
   "heightIn": 74,
   "weightLb": 210,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:willm003": {
   "name": "Matt Williams",
   "mlbam": 124326,
   "heightIn": 74,
   "weightLb": 225,
   "tone": 0.675,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:finls001": {
   "name": "Steve Finley",
   "mlbam": 114135,
   "heightIn": 74,
   "weightLb": 195,
   "tone": 0.771,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:bautd001": {
   "name": "Danny Bautista",
   "mlbam": 110712,
   "heightIn": 71,
   "weightLb": 225,
   "tone": null,
   "toneSrc": null
  },
  "retro:rodrj002": {
   "name": "John Rodriguez",
   "mlbam": 431138,
   "heightIn": 72,
   "weightLb": 205,
   "tone": null,
   "toneSrc": null
  },
  "retro:mabrj001": {
   "name": "John Mabry",
   "mlbam": 118065,
   "heightIn": 76,
   "weightLb": 210,
   "tone": null,
   "toneSrc": null
  },
  "retro:ecksd001": {
   "name": "David Eckstein",
   "mlbam": 275930,
   "heightIn": 67,
   "weightLb": 175,
   "tone": 0.295,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:edmoj001": {
   "name": "Jim Edmonds",
   "mlbam": 113744,
   "heightIn": 73,
   "weightLb": 210,
   "tone": 0.341,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:pujoa001": {
   "name": "Albert Pujols",
   "mlbam": 405395,
   "heightIn": 75,
   "weightLb": 235,
   "tone": 0.367,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:sandr002": {
   "name": "Reggie Sanders",
   "mlbam": 121673,
   "heightIn": 73,
   "weightLb": 200,
   "tone": 0.971,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:walkl001": {
   "name": "Larry Walker",
   "mlbam": 123833,
   "heightIn": 75,
   "weightLb": 235,
   "tone": 0.611,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:grudm001": {
   "name": "Mark Grudzielanek",
   "mlbam": 115210,
   "heightIn": 73,
   "weightLb": 195,
   "tone": 1,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:moliy001": {
   "name": "Yadier Molina",
   "mlbam": 425877,
   "heightIn": 71,
   "weightLb": 225,
   "tone": 0.204,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:spilr001": {
   "name": "Ryan Spilborghs",
   "mlbam": 448676,
   "heightIn": 73,
   "weightLb": 200,
   "tone": null,
   "toneSrc": null
  },
  "retro:hawpb001": {
   "name": "Brad Hawpe",
   "mlbam": 425547,
   "heightIn": 74,
   "weightLb": 190,
   "tone": 0.455,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:torry001": {
   "name": "Yorvit Torrealba",
   "mlbam": 150275,
   "heightIn": 71,
   "weightLb": 200,
   "tone": 0.581,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:carrj001": {
   "name": "Jamey Carroll",
   "mlbam": 425206,
   "heightIn": 70,
   "weightLb": 175,
   "tone": null,
   "toneSrc": null
  },
  "retro:smits002": {
   "name": "Seth Smith",
   "mlbam": 452234,
   "heightIn": 75,
   "weightLb": 210,
   "tone": 0.121,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:tulot001": {
   "name": "Troy Tulowitzki",
   "mlbam": 453064,
   "heightIn": 75,
   "weightLb": 205,
   "tone": 0.22,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:hollm001": {
   "name": "Matt Holliday",
   "mlbam": 407812,
   "heightIn": 76,
   "weightLb": 240,
   "tone": 0,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:heltt001": {
   "name": "Todd Helton",
   "mlbam": 115732,
   "heightIn": 74,
   "weightLb": 220,
   "tone": 0.464,
   "toneSrc": "MLB headshot (img.mlbstatic.com), sampled 2026-11-01"
  },
  "retro:atkig001": {
   "name": "Garrett Atkins",
   "mlbam": 425548,
   "heightIn": 75,
   "weightLb": 215,
   "tone": null,
   "toneSrc": null
  }
 },
 "games": {
  "std-1988-ws1-eckersley": {
   "gamePk": 67910,
   "date": "1988-10-15",
   "src": "https://statsapi.mlb.com/api/v1/game/67910/boxscore (jerseyNumber); roster 1988-10-15 where the box has none",
   "hitters": {
    "retro:sciom001": {
     "name": "Mike Scioscia",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:hamij001": {
     "name": "Jeff Hamilton",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:davim002": {
     "name": "Mike Davis",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:gibsk001": {
     "name": "Kirk Gibson",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:sax-s001": {
     "name": "Steve Sax",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:stubf001": {
     "name": "Franklin Stubbs",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:hatcm001": {
     "name": "Mickey Hatcher",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:marsm001": {
     "name": "Mike Marshall",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    },
    "retro:shelj001": {
     "name": "John Shelby",
     "number": null,
     "numberSrc": null,
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2001-ws7-rivera": {
   "gamePk": 9101,
   "date": "2001-11-04",
   "src": "https://statsapi.mlb.com/api/v1/game/9101/boxscore (jerseyNumber); roster 2001-11-04 where the box has none",
   "hitters": {
    "retro:gracm001": {
     "name": "Mark Grace",
     "number": "17",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:milld002": {
     "name": "Damian Miller",
     "number": "26",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:bellj001": {
     "name": "Jay Bell",
     "number": "33",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:womat001": {
     "name": "Tony Womack",
     "number": "5",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:counc001": {
     "name": "Craig Counsell",
     "number": "4",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:gonzl001": {
     "name": "Luis Gonzalez",
     "number": "20",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:willm003": {
     "name": "Matt Williams",
     "number": "9",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:finls001": {
     "name": "Steve Finley",
     "number": "12",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:bautd001": {
     "name": "Danny Bautista",
     "number": "29",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2005-nlcs5-lidge": {
   "gamePk": 39809,
   "date": "2005-10-17",
   "src": "https://statsapi.mlb.com/api/v1/game/39809/boxscore (jerseyNumber); roster 2005-10-17 where the box has none",
   "hitters": {
    "retro:rodrj002": {
     "name": "John Rodriguez",
     "number": "53",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:mabrj001": {
     "name": "John Mabry",
     "number": "47",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:ecksd001": {
     "name": "David Eckstein",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:edmoj001": {
     "name": "Jim Edmonds",
     "number": "15",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:pujoa001": {
     "name": "Albert Pujols",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:sandr002": {
     "name": "Reggie Sanders",
     "number": "16",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:walkl001": {
     "name": "Larry Walker",
     "number": "33",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:grudm001": {
     "name": "Mark Grudzielanek",
     "number": "12",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:moliy001": {
     "name": "Yadier Molina",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2007-ws4-papelbon": {
   "gamePk": 224026,
   "date": "2007-10-28",
   "src": "https://statsapi.mlb.com/api/v1/game/224026/boxscore (jerseyNumber); roster 2007-10-28 where the box has none",
   "hitters": {
    "retro:spilr001": {
     "name": "Ryan Spilborghs",
     "number": "19",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:hawpb001": {
     "name": "Brad Hawpe",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:torry001": {
     "name": "Yorvit Torrealba",
     "number": "8",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:carrj001": {
     "name": "Jamey Carroll",
     "number": "1",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "retro:smits002": {
     "name": "Seth Smith",
     "number": "25",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:tulot001": {
     "name": "Troy Tulowitzki",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:hollm001": {
     "name": "Matt Holliday",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:heltt001": {
     "name": "Todd Helton",
     "number": "17",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "retro:atkig001": {
     "name": "Garrett Atkins",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2008-alcs7-price": {
   "gamePk": 243842,
   "date": "2008-10-19",
   "src": "https://statsapi.mlb.com/api/v1/game/243842/boxscore (jerseyNumber); roster 2008-10-19 where the box has none",
   "hitters": {
    "117276": {
     "name": "Mark Kotsay",
     "number": "11",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "120074": {
     "name": "David Ortiz",
     "number": "34",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "123660": {
     "name": "Jason Varitek",
     "number": "33",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "136770": {
     "name": "J.D. Drew",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "424726": {
     "name": "Jason Bay",
     "number": "44",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "424825": {
     "name": "Coco Crisp",
     "number": "10",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "425903": {
     "name": "Kevin Youkilis",
     "number": "20",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "456030": {
     "name": "Dustin Pedroia",
     "number": "15",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "476704": {
     "name": "Jed Lowrie",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2008-krod-sea": {
   "gamePk": 235975,
   "date": "2008-09-13",
   "src": "https://statsapi.mlb.com/api/v1/game/235975/boxscore (jerseyNumber); roster 2008-09-13 where the box has none",
   "hitters": {
    "111867": {
     "name": "Miguel Cairo",
     "number": "13",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "116380": {
     "name": "Raul Ibanez",
     "number": "28",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "134181": {
     "name": "Adrian Beltré",
     "number": "29",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "400085": {
     "name": "Ichiro Suzuki",
     "number": "51",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "430946": {
     "name": "Jose Lopez",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "434605": {
     "name": "Wladimir Balentien",
     "number": "25",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "435358": {
     "name": "Yuniesky Betancourt",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "461834": {
     "name": "Tug Hulett",
     "number": "23",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "472528": {
     "name": "Luis Valbuena",
     "number": "61",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2008-ws5-lidge": {
   "gamePk": 243847,
   "date": "2008-10-27",
   "src": "https://statsapi.mlb.com/api/v1/game/243847/boxscore (jerseyNumber); roster 2008-10-27 where the box has none",
   "hitters": {
    "150289": {
     "name": "Carlos Pena",
     "number": "23",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "400134": {
     "name": "Eric Hinske",
     "number": "32",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "408307": {
     "name": "Carl Crawford",
     "number": "13",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425834": {
     "name": "B.J. Upton",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425900": {
     "name": "Dioner Navarro",
     "number": "30",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "434442": {
     "name": "J.P. Howell",
     "number": "39",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "446334": {
     "name": "Evan Longoria",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "450314": {
     "name": "Ben Zobrist",
     "number": "18",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "493127": {
     "name": "Akinori Iwamura",
     "number": "1",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2009-alcs6-rivera": {
   "gamePk": 263172,
   "date": "2009-10-24",
   "src": "https://statsapi.mlb.com/api/v1/game/263172/boxscore (jerseyNumber); roster 2009-10-24 where the box has none",
   "hitters": {
    "110029": {
     "name": "Bobby Abreu",
     "number": "53",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "115223": {
     "name": "Vladimir Guerrero",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "116338": {
     "name": "Torii Hunter",
     "number": "48",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "150439": {
     "name": "Gary Matthews Jr.",
     "number": "24",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "407487": {
     "name": "Juan Rivera",
     "number": "20",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "408210": {
     "name": "Chone Figgins",
     "number": "9",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "430947": {
     "name": "Erick Aybar",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "434778": {
     "name": "Kendrys Morales",
     "number": "8",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "435062": {
     "name": "Howie Kendrick",
     "number": "47",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "435065": {
     "name": "Reggie Willits",
     "number": "77",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2010-hoffman-stl": {
   "gamePk": 265883,
   "date": "2010-09-07",
   "src": "https://statsapi.mlb.com/api/v1/game/265883/boxscore (jerseyNumber); roster 2010-09-07 where the box has none",
   "hitters": {
    "133160": {
     "name": "Randy Winn",
     "number": "44",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "150479": {
     "name": "Felipe López",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "405395": {
     "name": "Albert Pujols",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "407812": {
     "name": "Matt Holliday",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425446": {
     "name": "Aaron Miles",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425877": {
     "name": "Yadier Molina",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "445055": {
     "name": "Jon Jay",
     "number": "19",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "458036": {
     "name": "Nick Stavinoha",
     "number": "34",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "458675": {
     "name": "Colby Rasmus",
     "number": "28",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2010-ws5-wilson": {
   "gamePk": 286351,
   "date": "2010-11-01",
   "src": "https://statsapi.mlb.com/api/v1/game/286351/boxscore (jerseyNumber); roster 2010-11-01 where the box has none",
   "hitters": {
    "115223": {
     "name": "Vladimir Guerrero",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "134260": {
     "name": "Bengie Molina",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "276545": {
     "name": "Michael Young",
     "number": "10",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "285078": {
     "name": "Josh Hamilton",
     "number": "32",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "435079": {
     "name": "Ian Kinsler",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "443558": {
     "name": "Nelson Cruz",
     "number": "17",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "461815": {
     "name": "David Murphy",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "462101": {
     "name": "Elvis Andrus",
     "number": "1",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "519048": {
     "name": "Mitch Moreland",
     "number": "18",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2011-rivera-min": {
   "gamePk": 286969,
   "date": "2011-04-06",
   "src": "https://statsapi.mlb.com/api/v1/game/286969/boxscore (jerseyNumber); roster 2011-04-06 where the box has none",
   "hitters": {
    "150212": {
     "name": "Michael Cuddyer",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "459434": {
     "name": "Rene Tosoni",
     "number": "23",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "461858": {
     "name": "Trevor Plouffe",
     "number": "24",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "471863": {
     "name": "Luke Hughes",
     "number": "38",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "476633": {
     "name": "Chris Parmelee",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "501920": {
     "name": "Brian Dinkelman",
     "number": "26",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "501994": {
     "name": "Joe Benson",
     "number": "63",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "502143": {
     "name": "Danny Valencia",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "519184": {
     "name": "Ben Revere",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2011-ws6-feliz": {
   "gamePk": 317072,
   "date": "2011-10-26",
   "src": "https://statsapi.mlb.com/api/v1/game/317072/boxscore (jerseyNumber); roster 2011-10-26 where the box has none",
   "hitters": {
    "204020": {
     "name": "Lance Berkman",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "346798": {
     "name": "Kyle Lohse",
     "number": "26",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "405395": {
     "name": "Albert Pujols",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425877": {
     "name": "Yadier Molina",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "444135": {
     "name": "Ryan Theriot",
     "number": "3",
     "numberSrc": "roster",
     "beard": null,
     "beardSrc": null
    },
    "445055": {
     "name": "Jon Jay",
     "number": "19",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "501800": {
     "name": "Allen Craig",
     "number": "21",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "501896": {
     "name": "David Freese",
     "number": "23",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "518614": {
     "name": "Daniel Descalso",
     "number": "33",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2012-ws4-romo": {
   "gamePk": 345633,
   "date": "2012-10-28",
   "src": "https://statsapi.mlb.com/api/v1/game/345633/boxscore (jerseyNumber); roster 2012-10-28 where the box has none",
   "hitters": {
    "408042": {
     "name": "Gerald Laird",
     "number": "9",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "408234": {
     "name": "Miguel Cabrera",
     "number": "24",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "408299": {
     "name": "Omar Infante",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425509": {
     "name": "Jhonny Peralta",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425902": {
     "name": "Prince Fielder",
     "number": "28",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "430321": {
     "name": "Delmon Young",
     "number": "21",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "430603": {
     "name": "Don Kelly",
     "number": "32",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "457706": {
     "name": "Austin Jackson",
     "number": "14",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543108": {
     "name": "Andy Dirks",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2013-alcs6-uehara": {
   "gamePk": 379727,
   "date": "2013-10-19",
   "src": "https://statsapi.mlb.com/api/v1/game/379727/boxscore (jerseyNumber); roster 2013-10-19 where the box has none",
   "hitters": {
    "116338": {
     "name": "Torii Hunter",
     "number": "48",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "400121": {
     "name": "Victor Martinez",
     "number": "41",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "408234": {
     "name": "Miguel Cabrera",
     "number": "24",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "408299": {
     "name": "Omar Infante",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "425902": {
     "name": "Prince Fielder",
     "number": "28",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "430603": {
     "name": "Don Kelly",
     "number": "32",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "457706": {
     "name": "Austin Jackson",
     "number": "14",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "488671": {
     "name": "Alex Avila",
     "number": "13",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "578428": {
     "name": "Jose Iglesias",
     "number": "1",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2014-ws7-bumgarner": {
   "gamePk": 416387,
   "date": "2014-10-29",
   "src": "https://statsapi.mlb.com/api/v1/game/416387/boxscore (jerseyNumber); roster 2014-10-29 where the box has none",
   "hitters": {
    "408299": {
     "name": "Omar Infante",
     "number": "14",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "444876": {
     "name": "Alcides Escobar",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "456714": {
     "name": "Billy Butler",
     "number": "16",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "456715": {
     "name": "Lorenzo Cain",
     "number": "6",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "460086": {
     "name": "Alex Gordon",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "493114": {
     "name": "Norichika Aoki",
     "number": "23",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "519058": {
     "name": "Mike Moustakas",
     "number": "8",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "521692": {
     "name": "Salvador Perez",
     "number": "13",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543333": {
     "name": "Eric Hosmer",
     "number": "35",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2015-alcs6-davis": {
   "gamePk": 446269,
   "date": "2015-10-23",
   "src": "https://statsapi.mlb.com/api/v1/game/446269/boxscore (jerseyNumber); roster 2015-10-23 where the box has none",
   "hitters": {
    "425900": {
     "name": "Dioner Navarro",
     "number": "30",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "429665": {
     "name": "Edwin Encarnación",
     "number": "10",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "430832": {
     "name": "José Bautista",
     "number": "19",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "431145": {
     "name": "Russell Martin",
     "number": "55",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "453064": {
     "name": "Troy Tulowitzki",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "499624": {
     "name": "Chris Colabello",
     "number": "15",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "518626": {
     "name": "Josh Donaldson",
     "number": "20",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "519184": {
     "name": "Ben Revere",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "607680": {
     "name": "Kevin Pillar",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2016-ws7-chapman": {
   "gamePk": 487637,
   "date": "2016-11-02",
   "src": "https://statsapi.mlb.com/api/v1/game/487637/boxscore (jerseyNumber); roster 2016-11-02 where the box has none",
   "hitters": {
    "424825": {
     "name": "Coco Crisp",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "434658": {
     "name": "Rajai Davis",
     "number": "20",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "435063": {
     "name": "Mike Napoli",
     "number": "26",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "446386": {
     "name": "Brandon Guyer",
     "number": "6",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "467793": {
     "name": "Carlos Santana",
     "number": "41",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "492841": {
     "name": "Michael Martinez",
     "number": "1",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543228": {
     "name": "Yan Gomes",
     "number": "10",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543401": {
     "name": "Jason Kipnis",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "596019": {
     "name": "Francisco Lindor",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "608070": {
     "name": "José Ramírez",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2017-ws2-jansen": {
   "gamePk": 526512,
   "date": "2017-10-25",
   "src": "https://statsapi.mlb.com/api/v1/game/526512/boxscore (jerseyNumber); roster 2017-10-25 where the box has none",
   "hitters": {
    "136860": {
     "name": "Carlos Beltrán",
     "number": "15",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "435263": {
     "name": "Brian McCann",
     "number": "16",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "493329": {
     "name": "Yuli Gurriel",
     "number": "10",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "502210": {
     "name": "Josh Reddick",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "503556": {
     "name": "Marwin Gonzalez",
     "number": "9",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "514888": {
     "name": "Jose Altuve",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543807": {
     "name": "George Springer",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "608324": {
     "name": "Alex Bregman",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "621043": {
     "name": "Carlos Correa",
     "number": "1",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2018-alcs4-kimbrel": {
   "gamePk": 563396,
   "date": "2018-10-17",
   "src": "https://statsapi.mlb.com/api/v1/game/563396/boxscore (jerseyNumber); roster 2018-10-17 where the box has none",
   "hitters": {
    "435263": {
     "name": "Brian McCann",
     "number": "16",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "493329": {
     "name": "Yuli Gurriel",
     "number": "10",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "502210": {
     "name": "Josh Reddick",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "503556": {
     "name": "Marwin Gonzalez",
     "number": "9",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "514888": {
     "name": "Jose Altuve",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543807": {
     "name": "George Springer",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "608324": {
     "name": "Alex Bregman",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "621043": {
     "name": "Carlos Correa",
     "number": "1",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "643393": {
     "name": "Tony Kemp",
     "number": "18",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2019-nlwc-hader": {
   "gamePk": 599336,
   "date": "2019-10-01",
   "src": "https://statsapi.mlb.com/api/v1/game/599336/boxscore (jerseyNumber); roster 2019-10-01 where the box has none",
   "hitters": {
    "435062": {
     "name": "Howie Kendrick",
     "number": "47",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "435559": {
     "name": "Kurt Suzuki",
     "number": "28",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "452678": {
     "name": "Asdrúbal Cabrera",
     "number": "13",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "475582": {
     "name": "Ryan Zimmerman",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543685": {
     "name": "Anthony Rendon",
     "number": "6",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "572191": {
     "name": "Michael A. Taylor",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "607208": {
     "name": "Trea Turner",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "645302": {
     "name": "Victor Robles",
     "number": "16",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665742": {
     "name": "Juan Soto",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2021-nlcs6-smith": {
   "gamePk": 660921,
   "date": "2021-10-23",
   "src": "https://statsapi.mlb.com/api/v1/game/660921/boxscore (jerseyNumber); roster 2021-10-23 where the box has none",
   "hitters": {
    "405395": {
     "name": "Albert Pujols",
     "number": "55",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "519306": {
     "name": "Steven Souza Jr.",
     "number": "18",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "572041": {
     "name": "AJ Pollock",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "605141": {
     "name": "Mookie Betts",
     "number": "50",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "607208": {
     "name": "Trea Turner",
     "number": "6",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "608369": {
     "name": "Corey Seager",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "621035": {
     "name": "Chris Taylor",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "641355": {
     "name": "Cody Bellinger",
     "number": "35",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "669257": {
     "name": "Will Smith",
     "number": "16",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2022-ws6-pressly": {
   "gamePk": 715719,
   "date": "2022-11-05",
   "src": "https://statsapi.mlb.com/api/v1/game/715719/boxscore (jerseyNumber); roster 2022-11-05 where the box has none",
   "hitters": {
    "516416": {
     "name": "Jean Segura",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "547180": {
     "name": "Bryce Harper",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "592206": {
     "name": "Nick Castellanos",
     "number": "8",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "592663": {
     "name": "J.T. Realmuto",
     "number": "10",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "656555": {
     "name": "Rhys Hoskins",
     "number": "17",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "656941": {
     "name": "Kyle Schwarber",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "664761": {
     "name": "Alec Bohm",
     "number": "28",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "669016": {
     "name": "Brandon Marsh",
     "number": "16",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "681082": {
     "name": "Bryson Stott",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2023-hader-stl": {
   "gamePk": 716782,
   "date": "2023-08-30",
   "src": "https://statsapi.mlb.com/api/v1/game/716782/boxscore (jerseyNumber); roster 2023-08-30 where the box has none",
   "hitters": {
    "502671": {
     "name": "Paul Goldschmidt",
     "number": "46",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "571448": {
     "name": "Nolan Arenado",
     "number": "28",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "575929": {
     "name": "Willson Contreras",
     "number": "40",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "600301": {
     "name": "Taylor Motter",
     "number": "55",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "663609": {
     "name": "Luken Baker",
     "number": "26",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "668800": {
     "name": "Andrew Knizner",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "669242": {
     "name": "Tommy Edman",
     "number": "19",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "691023": {
     "name": "Jordan Walker",
     "number": "18",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "691026": {
     "name": "Masyn Winn",
     "number": "0",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2023-williams-sd": {
   "gamePk": 718549,
   "date": "2023-04-16",
   "src": "https://statsapi.mlb.com/api/v1/game/718549/boxscore (jerseyNumber); roster 2023-04-16 where the box has none",
   "hitters": {
    "443558": {
     "name": "Nelson Cruz",
     "number": "32",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "543592": {
     "name": "Austin Nola",
     "number": "26",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "572761": {
     "name": "Matt Carpenter",
     "number": "14",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "592518": {
     "name": "Manny Machado",
     "number": "13",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "593428": {
     "name": "Xander Bogaerts",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "630105": {
     "name": "Jake Cronenworth",
     "number": "9",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "663757": {
     "name": "Trent Grisham",
     "number": "1",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665742": {
     "name": "Juan Soto",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "673490": {
     "name": "Ha-Seong Kim",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2023-ws1-sewald": {
   "gamePk": 748542,
   "date": "2023-10-27",
   "src": "https://statsapi.mlb.com/api/v1/game/748542/boxscore (jerseyNumber); roster 2023-10-27 where the box has none",
   "hitters": {
    "543760": {
     "name": "Marcus Semien",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "595978": {
     "name": "Austin Hedges",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "608369": {
     "name": "Corey Seager",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "641598": {
     "name": "Mitch Garver",
     "number": "18",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "663993": {
     "name": "Nathaniel Lowe",
     "number": "30",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665750": {
     "name": "Leody Taveras",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "666969": {
     "name": "Adolis García",
     "number": "53",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "673962": {
     "name": "Josh Jung",
     "number": "6",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "694497": {
     "name": "Evan Carter",
     "number": "32",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2024-ws5-buehler": {
   "gamePk": 775296,
   "date": "2024-10-30",
   "src": "https://statsapi.mlb.com/api/v1/game/775296/boxscore (jerseyNumber); roster 2024-10-30 where the box has none",
   "hitters": {
    "519203": {
     "name": "Anthony Rizzo",
     "number": "48",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "519317": {
     "name": "Giancarlo Stanton",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "592450": {
     "name": "Aaron Judge",
     "number": "99",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "650402": {
     "name": "Gleyber Torres",
     "number": "25",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "657077": {
     "name": "Alex Verdugo",
     "number": "24",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665742": {
     "name": "Juan Soto",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665862": {
     "name": "Jazz Chisholm Jr.",
     "number": "13",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "669224": {
     "name": "Austin Wells",
     "number": "28",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "683011": {
     "name": "Anthony Volpe",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2025-diaz-cin": {
   "gamePk": 776450,
   "date": "2025-09-05",
   "src": "https://statsapi.mlb.com/api/v1/game/776450/boxscore (jerseyNumber); roster 2025-09-05 where the box has none",
   "hitters": {
    "663647": {
     "name": "Ke'Bryan Hayes",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "666158": {
     "name": "Gavin Lux",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "666181": {
     "name": "Will Benson",
     "number": "30",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "668715": {
     "name": "Spencer Steer",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "669720": {
     "name": "Austin Hays",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "670770": {
     "name": "TJ Friedl",
     "number": "29",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "680574": {
     "name": "Matt McLain",
     "number": "9",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "682622": {
     "name": "Noelvi Marte",
     "number": "16",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "682829": {
     "name": "Elly De La Cruz",
     "number": "44",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2025-scott-kc": {
   "gamePk": 777335,
   "date": "2025-06-27",
   "src": "https://statsapi.mlb.com/api/v1/game/777335/boxscore (jerseyNumber); roster 2025-06-27 where the box has none",
   "hitters": {
    "521692": {
     "name": "Salvador Perez",
     "number": "13",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "592192": {
     "name": "Mark Canha",
     "number": "21",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "663697": {
     "name": "Jonathan India",
     "number": "6",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "672580": {
     "name": "Maikel Garcia",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "677951": {
     "name": "Bobby Witt Jr.",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "679845": {
     "name": "Nick Loftin",
     "number": "12",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "686469": {
     "name": "Vinnie Pasquantino",
     "number": "9",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "686475": {
     "name": "Tyler Tolbert",
     "number": "2",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "695506": {
     "name": "Jac Caglianone",
     "number": "14",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2025-ws6-glasnow": {
   "gamePk": 813025,
   "date": "2025-10-31",
   "src": "https://statsapi.mlb.com/api/v1/game/813025/boxscore (jerseyNumber); roster 2025-10-31 where the box has none",
   "hitters": {
    "543807": {
     "name": "George Springer",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "662139": {
     "name": "Daulton Varsho",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "664770": {
     "name": "Nathan Lukes",
     "number": "38",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665489": {
     "name": "Vladimir Guerrero Jr.",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665926": {
     "name": "Andrés Giménez",
     "number": "0",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "666182": {
     "name": "Bo Bichette",
     "number": "11",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "672386": {
     "name": "Alejandro Kirk",
     "number": "30",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "676391": {
     "name": "Ernie Clement",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "680718": {
     "name": "Addison Barger",
     "number": "47",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  },
  "std-2025-ws7-yamamoto": {
   "gamePk": 813024,
   "date": "2025-11-01",
   "src": "https://statsapi.mlb.com/api/v1/game/813024/boxscore (jerseyNumber); roster 2025-11-01 where the box has none",
   "hitters": {
    "543807": {
     "name": "George Springer",
     "number": "4",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "643396": {
     "name": "Isiah Kiner-Falefa",
     "number": "7",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "662139": {
     "name": "Daulton Varsho",
     "number": "5",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "664702": {
     "name": "Myles Straw",
     "number": "3",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665489": {
     "name": "Vladimir Guerrero Jr.",
     "number": "27",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "665926": {
     "name": "Andrés Giménez",
     "number": "0",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "672386": {
     "name": "Alejandro Kirk",
     "number": "30",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "676391": {
     "name": "Ernie Clement",
     "number": "22",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    },
    "680718": {
     "name": "Addison Barger",
     "number": "47",
     "numberSrc": "box",
     "beard": null,
     "beardSrc": null
    }
   }
  }
 }
};
