/*
 * recruiting.js - where the next generation signs, and what this office did to that.
 *
 * THE SPORT'S SECOND SEASON HAPPENS IN FEBRUARY and this mode did not have it. A term ran
 * September to January and then jumped to a winter meeting: the six weeks that decide the
 * next four years of every program in the country were a beat called "Portal and signing
 * day" with a docket item on it and nothing to look at.
 *
 * A BOARD THAT IS ONLY A LIST OF NAMES IS DECORATION, which is the reason this file is not
 * a list of names. Everything on it is derived from numbers that are ALREADY LOAD BEARING:
 *
 *   the program's own level, out of churn.js, which is what regresses a team every year
 *   what it just did on the field, which is the season the player watched
 *   moneyDrift(), which season.js already adds to a team's strength for every year the
 *     conference's share of the pool has been different from the one it started with
 *
 * So a class is not a forecast bolted onto the side of the simulation. It is the same three
 * forces the simulation is about to apply, ranked and named, one beat before they show up in
 * the football. Move the money in November and the board moves in February and the results
 * move in the September after that, which is the order it happens in life and the reason the
 * mode has a memory at all.
 *
 * AND TWO LEVERS BEND THE SHAPE OF IT rather than any one school's place in it. Paying
 * players a share of a pool that is split between leagues spreads the talent, because the
 * money arrives through the split. Letting anybody pay concentrates it, because the money
 * arrives through whoever has the most of it. Those are the two arguments this sport is
 * actually having and the board is where they become visible.
 *
 * NOBODY IN HERE IS A PERSON. No recruit is named, ranked or invented, for the same reason
 * nothing else in this mode names one: they are seventeen years old and they are real. A
 * class has a school, a rating and a rank, and that is the whole of it.
 *
 * DETERMINISTIC AND PURE. Same world, same seed, same board, so a term replays identically
 * after a reload.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_RECRUITING. Node: require('./recruiting.js').
 */
(function (root) {
  'use strict';

  var CH = root.PS_CFB_CHURN || (typeof require === 'function' ? require('./churn.js') : null);
  var SEA = root.PS_CFB_SEASON || (typeof require === 'function' ? require('./season.js') : null);

  /* ---- WHAT DECIDES A CLASS ----
     Weighted so the board reads like a recruiting board rather than like a power ranking.
     History outranks last season, because Alabama signs well after a bad year and a MAC team
     does not sign well after a good one, and both of those are things a fan knows. */
  var W_HISTORY = 1.00;
  var W_FORM = 0.50;
  /* MONEY IS THE LOUDEST THING ON THE BOARD, and the number is not free. moneyDrift() is a z
     delta that season.js adds straight to a team's strength, and every term here is in the
     same units, so W_MONEY is literally "how hard does the board react compared to the
     field". MEASURED RATHER THAN CHOSEN: halve a league's share of the pot and leave it
     halved for a full term, against the same four years with the pot untouched, and at 0.80
     that league's median class falls from thirtieth in the country to sixty-second while its
     best program stays first, and the best class outside the four biggest leagues climbs from
     thirty-third to fourteenth. Money does not stop Alabama being Alabama and it does decide
     who is in the room with them, which is the argument the sport is actually having.

     At 1.8 the same ruling put the SEC's median class a hundred and seventh of a hundred and
     thirty-six, which is not a slide, it is a different sport. */
  var W_MONEY = 0.80;
  /* A CLASS IS NOT A PROJECTION. Every February somebody signs three places above where they
     have any business signing, and a board with no noise in it is a table of program levels
     with a different heading. */
  var NOISE = 0.42;

  /* ---- AND WHAT BENDS THE WHOLE SHAPE ----
     Both of these are redistributions rather than gains: they change how far apart the top
     and the bottom of the board are, and change nobody's rank on their own.

     A SHARE PAID OUT OF THE POOL SPREADS, because the pool is split between leagues before
     anybody is paid out of it, so the further it goes the less it matters which building you
     walk into. A market where anybody may pay CONCENTRATES, because the people with the most
     money are the same twenty schools every year. */
  /* THE LEDGER'S OWN THREE VALUES, and the opening one is zero because an untouched sport
     has to sign the classes it would have signed anyway: everything here is measured from
     the February the player walked into rather than from an abstract middle. `none` and
     `open` are here because the field can hold them; today the docket only ever moves
     between collectives and school-paid, which is the argument the sport is having. */
  var SHARE_SPREAD = 0.55;
  var NIL_PULL = { none: -0.10, collectives: 0, 'school-paid': -0.18, open: 0.30 };

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function unit(seed, school, year, tag) {
    return (hash(String(seed) + '|' + school + '|' + year + '|' + tag) % 100000) / 100000;
  }
  /* Box-Muller, so a class three places above its program is uncommon and one ten places
     above it is a story rather than a Tuesday. */
  function gauss(seed, school, year, tag) {
    var u = Math.max(1e-6, unit(seed, school, year, tag + 'a'));
    var v = unit(seed, school, year, tag + 'b');
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* HOW FAR APART THE BOARD IS ALLOWED TO BE, given what this office has done to how players
     are paid. One at the settings the sport starts on, so an untouched world signs the
     classes it would have signed anyway. */
  function spreadOf(world) {
    var lab = (world && world.labour) || {};
    var share = Math.max(0, Math.min(1, lab.revShare || 0));
    var pull = NIL_PULL[lab.nil] != null ? NIL_PULL[lab.nil] : 0;
    return Math.max(0.45, Math.min(1.6, 1 - SHARE_SPREAD * share + pull));
  }

  /* ---- THE BOARD ----
     `teams` is season.league()'s output for the year being signed into. It carries the
     school, its conference, its color, `baseZ` (what the program was worth on the season the
     term opened on) and `z` (what it is worth now, after churn, the money and the door).

     EVERYTHING IT READS COMES OFF THE WORLD, and that is a requirement rather than a tidiness
     preference. The mode's promise is that a term replays identically after a reload, and the
     obvious way to write this was to read last season's results out of the page's own
     `lastSeason`, which is a variable that does not survive a refresh. A board that reorders
     itself when somebody reopens the tab in February is the mode breaking its one guarantee
     over a decoration. `z` already carries how the program has been trending, so the form
     term reads that.

     Returns every school, ranked, plus what the levers did to the shape. */
  function board(world, teams, teamSeasons) {
    if (!world || !teams || !teams.length) return { rows: [], spread: 1, note: '' };
    var levels = CH && CH.programLevels ? CH.programLevels(teamSeasons || []) : {};
    var seed = world.seed;
    var year = world.year;

    var raw = teams.map(function (t) {
      var prog = levels[t.school];
      var level = prog ? prog.level : (t.baseZ || 0);
      /* WHERE THE PROGRAM IS NOW, which in year one is the season that really happened and
         in year four is four years of everything this office has done to it. */
      var did = t.z != null ? t.z : level;
      var money = SEA && SEA.moneyDrift ? SEA.moneyDrift(world, t.conference) : 0;
      return {
        school: t.school, conference: t.conference, color: t.color,
        abbr: t.abbr || t.school,
        /* Kept so the page can say who signed above their weight without recomputing it. */
        level: Math.round(level * 100) / 100,
        money: Math.round(money * 1000) / 1000,
        score: W_HISTORY * level + W_FORM * did + W_MONEY * money
          + NOISE * gauss(seed, t.school, year, 'class'),
      };
    });

    /* AND WHERE THEY WOULD HAVE RANKED ON THE PROGRAM ALONE, which is the only column on
       this board that says anything a power ranking does not: who is out-recruiting what
       they are. */
    var byLevel = raw.slice().sort(function (a, b) { return b.level - a.level; });
    var levelRank = {};
    byLevel.forEach(function (r, i) { levelRank[r.school] = i + 1; });

    var rows = raw.slice().sort(function (a, b) { return b.score - a.score; });
    var mu = rows.reduce(function (t, x) { return t + x.score; }, 0) / rows.length;
    var sd = 0;
    rows.forEach(function (r) { sd += (r.score - mu) * (r.score - mu); });
    sd = Math.sqrt(sd / Math.max(1, rows.length)) || 1;

    /* THE SHAPE, APPLIED TO THE STANDARDIZED NUMBER AND NOT TO THE RAW ONE.
       Compressing the scores first was the obvious way and it did exactly nothing: the
       rating is a z of the board against itself, and multiplying every score by the same
       factor leaves every z where it was. The lever was in the file, in the tests, and
       cancelled out three lines later. It has to be applied AFTER the standardization or it
       is not applied at all. Order is untouched either way, which is what keeps this a
       redistribution rather than a thumb on one league. */
    var spread = spreadOf(world);
    rows.forEach(function (r, i) {
      r.rank = i + 1;
      /* A RATING OUT OF A HUNDRED, because a raw z means nothing on a screen and every board
         a fan has ever read is scored out of something. Median lands near fifty and the top
         of the country in the nineties, which is the scale people expect. */
      r.rating = Math.max(1, Math.min(99,
        Math.round(50 + 16 * ((r.score - mu) / sd) * spread)));
      r.was = levelRank[r.school];
      r.over = r.was - r.rank;
    });
    return { rows: rows, spread: Math.round(spread * 100) / 100, note: noteFor(world, spread) };
  }

  /* WHAT THE OFFICE DID TO THE SHAPE, in one sentence, and only when it did something. A
     board that prints a paragraph about nothing every February is a paragraph nobody reads
     the sixth time. */
  /* IT ONLY SPEAKS WHEN THIS OFFICE HAS DONE SOMETHING. The first version said "two portal
     windows, so a signed class is a first draft" every February of every term, because two is
     what the sport starts with: a paragraph about nothing, printed five times, which is a
     paragraph nobody reads the second time. */
  function noteFor(world, spread) {
    var lab = (world && world.labour) || {};
    if (spread >= 1.10) {
      return 'Anybody may pay, so the money finds the same twenty buildings it always did. '
        + 'The top of this board sits further from the middle than it did.';
    }
    if (spread <= 0.90 && (lab.revShare || 0) > 0) {
      return 'The share you pay out of the pool is spreading these classes. The top of this '
        + 'board sits closer to the middle of it than the sport is used to.';
    }
    if (spread <= 0.90) {
      return 'Schools pay their own players now, so a collective cannot outbid a budget. The '
        + 'top of this board sits closer to the middle of it than it did.';
    }
    if ((lab.portalWindows || 0) >= 3) {
      return lab.portalWindows + ' portal windows, so a signed class is a first draft. A good '
        + 'number of these names will be somewhere else inside eighteen months.';
    }
    if (lab.portalWindows === 0) {
      return 'There is no portal window, so a class is a class again. What a school signs in '
        + 'February is what it has.';
    }
    return '';
  }

  /* The top of it, which is all any board is ever read for. */
  function top(bd, n) { return (bd && bd.rows ? bd.rows : []).slice(0, n || 10); }

  var api = {
    board: board, top: top, spreadOf: spreadOf, noteFor: noteFor,
    W_HISTORY: W_HISTORY, W_FORM: W_FORM, W_MONEY: W_MONEY, NOISE: NOISE,
    SHARE_SPREAD: SHARE_SPREAD, NIL_PULL: NIL_PULL,
  };
  root.PS_CFB_RECRUITING = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
