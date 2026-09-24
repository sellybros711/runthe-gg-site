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
 * ─── THE PRIMARY IS LIFTED, EXCEPT WHERE THE PRIMARY IS BLACK ──────────────────────
 *
 * Picking whichever of a club's two published colours reads better was tried first and is
 * worse, which is only obvious once it is printed. Most NFL secondaries are gold, so it put
 * FOURTEEN clubs in one yellow bucket and, more to the point, it stopped naming the club:
 * Washington came out gold rather than burgundy, Dallas silver rather than navy, New England
 * red rather than navy. The primary IS the identity, so the primary is what is lifted.
 *
 * THREE CLUBS ARE THE EXCEPTION AND THEY SHIPPED WRONG, reported by a player. A primary that
 * is BLACK carries no colour to lift, so the answer was never going to name the club:
 *
 *      Las Vegas       #000000    lifted to #828282, a mid grey
 *      Pittsburgh      #101820    lifted to #4f86bc, A BLUE
 *      New Orleans     #101820    lifted to #4f86bc, the same blue
 *
 * Two of those are a hue the club does not have at all. The Steelers and the Saints are black
 * and gold, and the board was drawing them in the blue of a division rival. `SECOND` names the
 * three, and what they get is their own second published colour: silver, gold and gold.
 *
 * This is NOT the blanket rule rejected above arriving by the back door. It fires on three
 * clubs rather than on the league, and the test for it is the one thing the first version got
 * wrong (below). Washington is still burgundy and Dallas is still navy.
 *
 * WHAT THE PRIMARY RULE COSTS is that the blues converge, because the league converges:
 * fourteen clubs land in the same family and three PAIRS are identical in the published data
 * before anything is done to them (New England and Seattle are both #002244, Dallas and the
 * Rams both #003594, Cincinnati and Denver both #FB4F14). Identical inputs giving identical
 * outputs is correct rather than a defect, and nothing here tries to force them apart: the tag
 * carries the three letter CODE, so the colour is reinforcement and never the thing a reader
 * identifies the club by.
 *
 * ─── THE LIFT, AND THE MEASURE THAT WAS WRONG ─────────────────────────────────────
 *
 * Hue is kept, lightness is raised until the contrast clears, and saturation is FLOORED on the
 * way up or a dark navy arrives at the top as a pale grey. A source with almost no colour in it
 * is left NEUTRAL instead, because there is no hue in it to keep.
 *
 * HOW MUCH COLOUR A HEX HAS IS ITS CHROMA AND NOT ITS HSL SATURATION, and reading the wrong one
 * is what made Pittsburgh blue. HSL saturation is divided by how dark the colour is, so it
 * EXPLODES near black: #101820 has 6% chroma and reads 0.33 saturation, which sailed over a
 * floor of 0.12 and was then raised to 0.45 on the way up. A hue that is six percent of a black
 * pixel is noise, and the lift was amplifying the noise into a colour. Measured on chroma
 * instead, the same hex is neutral and lifts to a grey.
 *
 * `CHROMA_MIN` is 0.08 and the band around it is thin, which is worth knowing before moving it.
 * Sorted, the primaries run 0.0 (Las Vegas), 6.3 (the two blacks), 9.0 (GREEN BAY) and 12.2.
 * So there is about one point of room on each side, and Green Bay is what the top of that gap
 * is defending: its #203731 is a genuine dark green with very little chroma in it, and a floor
 * at 0.10 would turn the Packers grey.
 *
 * THE FLOOR CHANGES NO COLOUR ON THE BOARD TODAY, because all three clubs it fires on are named
 * in `SECOND` and sourced from a colour that needs no lift at all. It is the backstop: without
 * it, the next club to publish a black primary goes quietly blue and nothing anywhere says so.
 *
 * Measured after: every one of the thirty two clears, worst 4.50:1, and the hues are still the
 * clubs (Baltimore purple, Green Bay green, Cleveland brown, the Jets green).
 */
(function () {
  'use strict';

  /* COPIED FROM `football/engine.js`, WHICH IS THE SITE'S TABLE, and copied rather than
     imported because this page deliberately loads none of that engine: it shares accounts,
     the palette and the tester pattern with the football game and nothing else. A second
     copy of an answer is what drifts, so `check-fantasy.mjs` asserts the two agree on all
     thirty two clubs and both hexes rather than trusting anybody to remember. */
  var PUBLISHED = {
    ARI: ['#97233F', '#000000'], ATL: ['#A71930', '#000000'], BAL: ['#241773', '#9E7C0C'],
    BUF: ['#00338D', '#C60C30'], CAR: ['#0085CA', '#101820'], CHI: ['#0B162A', '#C83803'],
    CIN: ['#FB4F14', '#000000'], CLE: ['#311D00', '#FF3C00'], DAL: ['#003594', '#869397'],
    DEN: ['#FB4F14', '#002244'], DET: ['#0076B6', '#B0B7BC'], GB: ['#203731', '#FFB612'],
    HOU: ['#03202F', '#A71930'], IND: ['#002C5F', '#A2AAAD'], JAX: ['#006778', '#D7A22A'],
    KC: ['#E31837', '#FFB81C'], LAC: ['#0080C6', '#FFC20E'], LAR: ['#003594', '#FFA300'],
    LV: ['#000000', '#A5ACAF'], MIA: ['#008E97', '#FC4C02'], MIN: ['#4F2683', '#FFC62F'],
    NE: ['#002244', '#C60C30'], NO: ['#101820', '#D3BC8D'], NYG: ['#0B2265', '#A71930'],
    NYJ: ['#125740', '#000000'], PHI: ['#004C54', '#A5ACAF'], PIT: ['#101820', '#FFB612'],
    SEA: ['#002244', '#69BE28'], SF: ['#AA0000', '#B3995D'], TB: ['#D50A0A', '#34302B'],
    TEN: ['#0C2340', '#4B92DB'], WAS: ['#5A1414', '#FFB612']
  };

  /*
   * THE CLUBS WHOSE IDENTITY IS THEIR SECOND COLOUR, written out by hand.
   *
   * Reported by a player: Vegas should be white and Pittsburgh should be yellow. They are
   * right, and Pittsburgh was the worse of the two, because a near-black primary lifted into a
   * blue the club does not have. New Orleans is on the list for the same reason and was not
   * reported: it publishes the identical #101820, so it came out the identical blue, and
   * fixing one of that pair and not the other leaves the same complaint on the board.
   *
   *      LV   black over SILVER
   *      PIT  black over GOLD
   *      NO   black over GOLD
   *
   * NOTHING IN A PAIR OF HEXES SAYS WHICH ONE A FAN WOULD NAME, so this is observed rather
   * than derived. `CHROMA_MIN` catches a colourless PRIMARY, which is the geometry, and it
   * cannot answer the other half: Cleveland's #311D00 is brown, low and dark and perfectly
   * usable, while Carolina publishes a black SECOND colour that would be worse than either.
   * That is this repo's own rule about the sprite pack's two thrown-away matchers, arriving at
   * a colour table. The guard asks for membership of a list, and the list is short on purpose.
   *
   * All three of these need no lift at all: silver reads 7.54:1 on the panel, the two golds
   * 9.87 and 9.38, so what ships is the published hex untouched.
   */
  var SECOND = { LV: 1, NO: 1, PIT: 1 };

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

  /* How much actual colour a source has to carry before its HUE is worth keeping. See the
     header: measured in CHROMA, because HSL saturation near black is noise. */
  var CHROMA_MIN = 0.08;

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

  /** How much colour a hex carries, on its own terms: the spread of its channels. */
  function chroma(rgb) {
    return (Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2])) / 255;
  }

  /** Raise a published hex until it reads on the panel, keeping the hue it arrived with. */
  function lift(hexStr) {
    var rgb = hex2rgb(hexStr);
    if (contrast(rgb, bg) >= TARGET) return hexStr;
    var hsl = rgb2hsl(rgb);
    /* SATURATION IS FLOORED ON THE WAY UP, or a navy at #002244 arrives as a pale grey and
       stops being the club. A source carrying almost no colour keeps none, because there is
       no hue in it to keep: floored anyway, a black lifts into whichever hue its last few
       bits happened to lean, which is how Pittsburgh shipped blue. */
    var s = chroma(rgb) < CHROMA_MIN ? 0 : Math.max(hsl[1], 0.45);
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

  /** Which of a club's two published colours the tag is built from. */
  function source(code) { return PUBLISHED[code][SECOND[code] ? 1 : 0]; }

  /* Resolved once at load. Thirty two entries, so it costs nothing and no row has to do
     colour arithmetic while a board is being dealt. */
  var READY = {};
  Object.keys(PUBLISHED).forEach(function (k) { READY[k] = lift(source(k)); });
  Object.keys(ALIAS).forEach(function (k) { READY[k] = READY[ALIAS[k]]; });

  window.RTF_CLUBS = {
    PUBLISHED: PUBLISHED,
    SECOND: SECOND,
    PANEL: PANEL,
    TARGET: TARGET,
    CHROMA_MIN: CHROMA_MIN,
    chroma: function (h) { return chroma(hex2rgb(h)); },
    source: source,
    /* Exposed for the guard, which holds the lift to a property over every hex in the table
       rather than only over the ones a board happens to draw from. */
    lift: lift,
    contrast: function (a, b) { return contrast(hex2rgb(a), hex2rgb(b)); },
    /* A CLUB THIS TABLE DOES NOT KNOW FALLS BACK TO THE LINE'S OWN COLOUR rather than to a
       made up one. The board is built from nflverse club codes and a relocation or an
       expansion side would arrive here before anybody edited this file, and a tag in the
       ordinary dim grey is a tag that simply is not coloured. Inventing a colour for it
       would be the page saying something about a club it knows nothing about. */
    color: function (code) { return READY[code] || null; }
  };
}());
