/* THE CLUB COLOURS, MADE READABLE ON THIS PAGE'S PANEL.
 *
 * The board names a man's club and his opponent on every row, and until this file existed
 * both were printed in the same grey as the rest of the line. Asked for by a player: colour
 * code the teams.
 *
 * ─── A PUBLISHED HEX IS NOT USABLE AS TEXT HERE, AND THAT IS MEASURED ──────────────
 *
 * This is the hoops wheel's finding arriving at a second game. The row sits on `--panel`,
 * `#131a2b`, and against it THIRTY of the thirty two published primaries are under 4.5:1:
 *
 *      Las Vegas       #000000    1.21:1
 *      Pittsburgh      #101820    1.03:1
 *      New England     #002244    1.08:1
 *      ...
 *      Cincinnati      #FB4F14    5.15:1   the only pair that clears, with Denver
 *
 * So dropping the table in would have given a board where almost every club tag was
 * invisible: no error, nothing to report, and the feature simply not there.
 *
 * ─── THE PRIMARY IS LIFTED, AND THE SECONDARY IS NOT USED ──────────────────────────
 *
 * Picking whichever of a club's two published colours reads better was tried first and is
 * worse, which is only obvious once it is printed. Most NFL secondaries are gold, so it put
 * FOURTEEN clubs in one yellow bucket and, more to the point, it stopped naming the club:
 * Washington came out gold rather than burgundy, Dallas silver rather than navy, New England
 * red rather than navy. The primary IS the identity, so the primary is what is lifted.
 *
 * WHAT THAT COSTS is that the blues converge, because the league converges: fourteen clubs
 * land in the same family and four PAIRS are identical in the published data before anything
 * is done to them (New England and Seattle are both #002244, Dallas and the Rams both
 * #003594, New Orleans and Pittsburgh both #101820, Cincinnati and Denver both #FB4F14).
 * Identical inputs giving identical outputs is correct rather than a defect, and nothing
 * here tries to force them apart: the tag carries the three letter CODE, so the colour is
 * reinforcement and never the thing a reader identifies the club by.
 *
 * ─── THE LIFT ─────────────────────────────────────────────────────────────────────
 *
 * Hue is kept, lightness is raised until the contrast clears, and saturation is FLOORED on
 * the way up or a dark navy arrives at the top as a pale grey. A colour with almost no
 * saturation to begin with is left neutral, which is right for the one club it applies to:
 * Las Vegas is black over silver, and silver is what comes out.
 *
 * Measured after: every one of the thirty two clears, worst 4.48:1, and the hues are still
 * the clubs (Baltimore purple, Green Bay green, Cleveland brown, the Jets green).
 */
(function () {
  'use strict';

  /* COPIED FROM `football/engine.js`, WHICH IS THE SITE'S TABLE, and copied rather than
     imported because this page deliberately loads none of that engine: it shares accounts,
     the palette and the tester pattern with the football game and nothing else. A second
     copy of an answer is what drifts, so `check-fantasy.mjs` asserts the two agree on all
     thirty two clubs and both hexes rather than trusting anybody to remember. */
  var PUBLISHED = {
    ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D',
    CAR: '#0085CA', CHI: '#0B162A', CIN: '#FB4F14', CLE: '#311D00',
    DAL: '#003594', DEN: '#FB4F14', DET: '#0076B6', GB: '#203731',
    HOU: '#03202F', IND: '#002C5F', JAX: '#006778', KC: '#E31837',
    LAC: '#0080C6', LAR: '#003594', LV: '#000000', MIA: '#008E97',
    MIN: '#4F2683', NE: '#002244', NO: '#101820', NYG: '#0B2265',
    NYJ: '#125740', PHI: '#004C54', PIT: '#101820', SEA: '#002244',
    SF: '#AA0000', TB: '#D50A0A', TEN: '#0C2340', WAS: '#5A1414'
  };

  /*
   * NFLVERSE SPELLS THE RAMS `LA` AND THE TABLE ABOVE SPELLS THEM `LAR`, so without this the
   * Rams were the one club on the board with no colour at all: not an error, not a wrong
   * colour, just a grey tag nobody would think to question. Found by the guard asking every
   * code the POOL can produce rather than the five a board happened to deal.
   *
   * It is an alias rather than a second entry in `PUBLISHED`, because that table is the
   * site's and `check-fantasy.mjs` asserts it matches `engine.js` hex for hex. A club added
   * there to suit this page's data source would break that comparison, and the comparison is
   * what stops the two copies drifting.
   *
   * This is `espn.mjs`'s own note arriving at a colour: the feed's codes and ours are two
   * vocabularies, and the join between them is written down rather than assumed.
   */
  var ALIAS = { LA: 'LAR' };

  /* The surface the tag is drawn on. `.man.poor` clears its background to the page, which is
     DARKER, so a colour that clears here clears there too: the only direction this can be
     wrong in is the safe one. */
  var PANEL = '#131a2b';
  var TARGET = 4.5;

  var hex2rgb = function (h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  };
  var rgb2hex = function (c) {
    return '#' + c.map(function (v) {
      var s = Math.round(Math.min(255, Math.max(0, v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  };
  var lin = function (c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  var lum = function (c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); };
  var contrast = function (a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  var rgb2hsl = function (c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var l = (mx + mn) / 2, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2)
        : 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return [h, s, l];
  };
  var hsl2rgb = function (v) {
    var h = v[0], s = v[1], l = v[2];
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return t.map(function (n) { return (n + m) * 255; });
  };

  var bg = hex2rgb(PANEL);

  /** Raise a published hex until it reads on the panel, keeping the hue it arrived with. */
  function lift(hexStr) {
    var rgb = hex2rgb(hexStr);
    if (contrast(rgb, bg) >= TARGET) return hexStr;
    var hsl = rgb2hsl(rgb);
    /* SATURATION IS FLOORED ON THE WAY UP, or a navy at #002244 arrives as a pale grey and
       stops being the club. Anything that had almost none to start with keeps none, which
       is Las Vegas: black over silver, and silver is the right answer. */
    var s = hsl[1] < 0.12 ? 0 : Math.max(hsl[1], 0.45);
    for (var i = 1; i <= 100; i++) {
      /* ROUNDED BEFORE IT IS JUDGED, which is the difference between 4.48 and 4.50. The
         candidate is a float triple and what a browser paints is eight bits a channel, so
         testing the float and returning the rounding of it accepted two clubs that then did
         not clear: Green Bay at 4.48 and the Giants at 4.49. Decide on the value that
         ships, which is this repo's own rule arriving at a colour. */
      var out = rgb2hex(hsl2rgb([hsl[0], s, Math.min(1, hsl[2] + i / 100)]));
      if (contrast(hex2rgb(out), bg) >= TARGET) return out;
    }
    return '#ffffff';
  }

  /* Resolved once at load. Thirty two entries, so it costs nothing and no row has to do
     colour arithmetic while a board is being dealt. */
  var READY = {};
  Object.keys(PUBLISHED).forEach(function (k) { READY[k] = lift(PUBLISHED[k]); });
  Object.keys(ALIAS).forEach(function (k) { READY[k] = READY[ALIAS[k]]; });

  window.RTF_CLUBS = {
    PUBLISHED: PUBLISHED,
    PANEL: PANEL,
    TARGET: TARGET,
    contrast: function (a, b) { return contrast(hex2rgb(a), hex2rgb(b)); },
    /* A CLUB THIS TABLE DOES NOT KNOW FALLS BACK TO THE LINE'S OWN COLOUR rather than to a
       made up one. The board is built from nflverse club codes and a relocation or an
       expansion side would arrive here before anybody edited this file, and a tag in the
       ordinary dim grey is a tag that simply is not coloured. Inventing a colour for it
       would be the page saying something about a club it knows nothing about. */
    color: function (code) { return READY[code] || null; }
  };
}());
