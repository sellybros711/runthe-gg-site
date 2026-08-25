/*
 * venues.js - where the big games are played, and whose name is on them.
 *
 * THE MODE COULD MOVE A KICKOFF AND NOT A GAME. It had a setting for whether the playoff was
 * on campus or at neutral sites and no idea what a neutral site IS: no cities, no stadiums,
 * no roof, no January in Detroit, no bid from a tourism board with a number on it. The
 * biggest single decision a commissioner makes in an ordinary year is where the title game
 * goes, and this office had no way to make it.
 *
 * So: real host sites with what each is actually worth. A dome in Atlanta and an open bowl in
 * Pasadena are not the same decision, and the difference is not taste. It is a roof, a
 * hundred thousand seats, a January average of forty-eight degrees, a bid, and a hundred and
 * ten years of somebody's grandfather.
 *
 * WHAT EACH NUMBER MEANS:
 *   draw       multiplier on what the game pulls. A site people want to go to and watch.
 *   fee        what the host pays for it, in hundreds of millions, which is what a bid is.
 *   heritage   how much of the sport's own history is in the building.
 *   risk       the chance the weather or the building embarrasses you. Domes are near zero.
 *   reach      whether putting the game there opens the sport somewhere it is not.
 *
 * REAL PLACES, INVENTED SPONSORS, and the asymmetry is deliberate. A stadium is a stadium and
 * naming one is a fact. A sponsor in this file GOES WRONG: it collapses, it gets indicted, it
 * turns out to have been a fraud. Attaching that to a real company would be writing something
 * false about somebody who could sue, so the sponsors here are archetypes with no names, and
 * they are funnier for it because everybody supplies their own.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_VENUES. Node: require('./venues.js').
 */
(function (root) {
  'use strict';

  /* ---- the host sites ----
     Sorted by nothing. Read as a catalogue, offered as a shortlist. */
  var VENUES = [
    { id: 'atl', name: 'Mercedes-Benz Stadium', city: 'Atlanta', state: 'GA',
      dome: true, cap: 71000, draw: 1.07, fee: 0.95, heritage: 0.3, risk: 0.02, reach: 0.1,
      note: 'A roof, an airport everybody can get to, and a downtown that has done this a '
        + 'dozen times.' },
    { id: 'dfw', name: 'AT&T Stadium', city: 'Arlington', state: 'TX',
      dome: true, cap: 80000, draw: 1.08, fee: 1.0, heritage: 0.2, risk: 0.02, reach: 0.1,
      note: 'The biggest cheque, the biggest screen, and a car park the size of a town.' },
    { id: 'nola', name: 'Caesars Superdome', city: 'New Orleans', state: 'LA',
      dome: true, cap: 73000, draw: 1.09, fee: 0.8, heritage: 0.85, risk: 0.06, reach: 0.05,
      note: 'The best week anybody has ever had at a football game, and everybody in this '
        + 'sport knows it.' },
    { id: 'pas', name: 'Rose Bowl', city: 'Pasadena', state: 'CA',
      dome: false, cap: 89000, draw: 1.05, fee: 0.5, heritage: 1, risk: 0.1, reach: 0,
      note: 'The mountains, the light at five o clock, and a hundred and ten years of it.' },
    { id: 'mia', name: 'Hard Rock Stadium', city: 'Miami Gardens', state: 'FL',
      dome: false, cap: 65000, draw: 1.04, fee: 0.9, heritage: 0.6, risk: 0.12, reach: 0.05,
      note: 'January in south Florida, which sells itself to everybody except the people who '
        + 'have to sit in the rain.' },
    { id: 'phx', name: 'State Farm Stadium', city: 'Glendale', state: 'AZ',
      dome: true, cap: 63000, draw: 1.03, fee: 0.85, heritage: 0.35, risk: 0.02, reach: 0.05,
      note: 'A retractable roof, a grass field that slides outside, and a market that has to '
        + 'be sold every time.' },
    { id: 'hou', name: 'NRG Stadium', city: 'Houston', state: 'TX',
      dome: true, cap: 72000, draw: 1.02, fee: 0.9, heritage: 0.25, risk: 0.02, reach: 0.05,
      note: 'Enormous, indoors, and about four hours from a third of the sport by road.' },
    { id: 'ind', name: 'Lucas Oil Stadium', city: 'Indianapolis', state: 'IN',
      dome: true, cap: 67000, draw: 1, fee: 0.7, heritage: 0.3, risk: 0.02, reach: 0.1,
      note: 'The one everybody who has actually organised an event votes for. Walkable, '
        + 'indoors, and nobody has to hire a car.' },
    { id: 'lv', name: 'Allegiant Stadium', city: 'Las Vegas', state: 'NV',
      dome: true, cap: 65000, draw: 1.1, fee: 1.05, heritage: 0, risk: 0.03, reach: 0.2,
      note: 'The most money, the biggest week, and a set of headlines about this sport and '
        + 'that city arriving whether you want them or not.' },
    { id: 'cha', name: 'Bank of America Stadium', city: 'Charlotte', state: 'NC',
      dome: false, cap: 75000, draw: 0.99, fee: 0.6, heritage: 0.3, risk: 0.14, reach: 0.05,
      note: 'In the middle of where the sport lives, and outdoors in December.' },
    { id: 'orl', name: 'Camping World Stadium', city: 'Orlando', state: 'FL',
      dome: false, cap: 65000, draw: 0.97, fee: 0.55, heritage: 0.3, risk: 0.12, reach: 0.05,
      note: 'Cheap, warm, and a city that will fill it with people who came for something '
        + 'else.' },
    { id: 'sa', name: 'Alamodome', city: 'San Antonio', state: 'TX',
      dome: true, cap: 64000, draw: 0.96, fee: 0.55, heritage: 0.2, risk: 0.02, reach: 0.1,
      note: 'Indoors, affordable, and the only bid that ever comes in under what it promised.' },
    { id: 'det', name: 'Ford Field', city: 'Detroit', state: 'MI',
      dome: true, cap: 65000, draw: 0.96, fee: 0.6, heritage: 0.15, risk: 0.02, reach: 0.2,
      note: 'A roof in a part of the country that owns this sport and never gets to host it.' },
    { id: 'nsh', name: 'Nissan Stadium', city: 'Nashville', state: 'TN',
      dome: false, cap: 69000, draw: 1.01, fee: 0.7, heritage: 0.2, risk: 0.16, reach: 0.1,
      note: 'The best week a visiting fanbase will ever have, and no roof over any of it.' },
    { id: 'sea', name: 'Lumen Field', city: 'Seattle', state: 'WA',
      dome: false, cap: 69000, draw: 0.94, fee: 0.5, heritage: 0.1, risk: 0.2, reach: 0.3,
      note: 'The corner of the country this sport has spent a decade abandoning, and the '
        + 'loudest building in it.' },
    { id: 'nyc', name: 'MetLife Stadium', city: 'East Rutherford', state: 'NJ',
      dome: false, cap: 82000, draw: 1.02, fee: 1.0, heritage: 0.1, risk: 0.24, reach: 0.35,
      note: 'The biggest media market on earth, in January, outdoors. Two of those three are '
        + 'the reason and the third is the problem.' },
    { id: 'dub', name: 'Aviva Stadium', city: 'Dublin', state: 'IE',
      dome: false, cap: 51000, draw: 0.88, fee: 0.75, heritage: 0.1, risk: 0.18, reach: 0.6,
      note: 'A kickoff at half past eight in the morning eastern, a fanbase that treats it '
        + 'as a holiday, and a genuinely new audience.' },
    { id: 'mex', name: 'Estadio Azteca', city: 'Mexico City', state: 'MX',
      dome: false, cap: 87000, draw: 0.9, fee: 0.7, heritage: 0.05, risk: 0.2, reach: 0.65,
      note: 'Seven thousand feet, ninety thousand people, and a market this sport has never '
        + 'seriously tried.' },
  ];

  /* ---- the bowls ----
     `tier` is roughly what it is worth: 3 is a game that decides something, 1 is a game in
     December with eleven thousand people in it. `slot` is when it is played. */
  var BOWLS = [
    { id: 'rose', name: 'Rose Bowl', venue: 'pas', tier: 3, slot: 'jan1', heritage: 1,
      tie: 'Big Ten' },
    { id: 'sugar', name: 'Sugar Bowl', venue: 'nola', tier: 3, slot: 'jan1', heritage: 0.9,
      tie: 'SEC' },
    { id: 'orange', name: 'Orange Bowl', venue: 'mia', tier: 3, slot: 'jan1', heritage: 0.8,
      tie: 'ACC' },
    { id: 'fiesta', name: 'Fiesta Bowl', venue: 'phx', tier: 3, slot: 'jan1', heritage: 0.6,
      tie: 'Big 12' },
    { id: 'cotton', name: 'Cotton Bowl', venue: 'dfw', tier: 3, slot: 'jan1', heritage: 0.7,
      tie: '' },
    { id: 'peach', name: 'Peach Bowl', venue: 'atl', tier: 3, slot: 'jan1', heritage: 0.5,
      tie: '' },
    { id: 'citrus', name: 'Citrus Bowl', venue: 'orl', tier: 2, slot: 'jan1', heritage: 0.4,
      tie: '' },
    { id: 'alamo', name: 'Alamo Bowl', venue: 'sa', tier: 2, slot: 'late', heritage: 0.3,
      tie: '' },
    { id: 'gator', name: 'Gator Bowl', venue: 'orl', tier: 2, slot: 'late', heritage: 0.35,
      tie: '' },
    { id: 'holiday', name: 'Holiday Bowl', venue: 'sea', tier: 2, slot: 'late', heritage: 0.3,
      tie: '' },
    { id: 'music', name: 'Music City Bowl', venue: 'nsh', tier: 2, slot: 'late', heritage: 0.2,
      tie: '' },
    { id: 'pinstripe', name: 'Pinstripe Bowl', venue: 'nyc', tier: 1, slot: 'late', heritage: 0.15,
      tie: '' },
    { id: 'quickstop', name: 'Motor City Bowl', venue: 'det', tier: 1, slot: 'early', heritage: 0.1,
      tie: '' },
    { id: 'bahamas', name: 'Bahamas Bowl', venue: 'orl', tier: 1, slot: 'early', heritage: 0.05,
      tie: '' },
  ];

  /* ---- the sponsors ----
     NO NAMES, ON PURPOSE. See the note at the top of this file: these go wrong, and writing
     that about a real company is writing something false about somebody who can sue.

     `pay` is what they are worth, `risk` is the chance of what they do to you, and `hate` is
     what putting their category on the sport costs with the people who watch it. */
  var SPONSORS = [
    { id: 'crypto', name: 'A cryptocurrency exchange', pay: 1.9, risk: 0.55, hate: 0.7,
      pitch: 'They have offered more than anybody has ever offered for anything in this '
        + 'sport, in cash, today, and their chief executive is twenty-nine.' },
    { id: 'book', name: 'A sportsbook', pay: 1.6, risk: 0.35, hate: 0.55,
      pitch: 'They are already the biggest advertiser in every broadcast this sport sells. '
        + 'This is only the part where their name is on the trophy.' },
    { id: 'pickup', name: 'A pickup truck maker', pay: 1.2, risk: 0.05, hate: 0.05,
      pitch: 'They have sponsored something in this sport every autumn since 1974 and nobody '
        + 'has ever once complained about it.' },
    { id: 'wings', name: 'A fast food chain', pay: 1.0, risk: 0.12, hate: 0.15,
      pitch: 'Cheap, cheerful, and their last campaign was genuinely funny, which nobody '
        + 'expected.' },
    { id: 'bank', name: 'A regional bank', pay: 0.9, risk: 0.1, hate: 0.1,
      pitch: 'Dull, solvent, and they want a fifteen year deal because their board thinks in '
        + 'fifteen year deals.' },
    { id: 'phone', name: 'A mobile network', pay: 1.4, risk: 0.08, hate: 0.2,
      pitch: 'The safest big cheque available and the least interesting sentence in this '
        + 'file.' },
    { id: 'energy', name: 'An energy drink', pay: 1.1, risk: 0.2, hate: 0.3,
      pitch: 'They want the playoff and they want to put a man on a motorcycle through the '
        + 'trophy presentation.' },
    { id: 'insurer', name: 'An insurance company', pay: 1.0, risk: 0.05, hate: 0.25,
      pitch: 'Reliable, boring, and the mascot in their advertising is more famous than any '
        + 'coach in this sport.' },
    { id: 'airline', name: 'An airline', pay: 0.95, risk: 0.15, hate: 0.15,
      pitch: 'A good name on a postseason and a category with a bad week roughly twice a '
        + 'year.' },
    { id: 'ai', name: 'An artificial intelligence company', pay: 1.7, risk: 0.4, hate: 0.45,
      pitch: 'Founded nineteen months ago, valued at more than every athletic department in '
        + 'this sport put together, and nobody in this office can explain what it sells.' },
  ];

  var V_BY_ID = {}, B_BY_ID = {}, S_BY_ID = {};
  VENUES.forEach(function (v) { V_BY_ID[v.id] = v; });
  BOWLS.forEach(function (b) { B_BY_ID[b.id] = b; });
  SPONSORS.forEach(function (s) { S_BY_ID[s.id] = s; });

  function venue(id) { return V_BY_ID[id] || null; }
  function bowl(id) { return B_BY_ID[id] || null; }
  function sponsor(id) { return S_BY_ID[id] || null; }
  function label(v) { return v ? v.city + ', ' + v.state : ''; }

  /* A SHORTLIST RATHER THAN A CATALOGUE. Eighteen options is a spreadsheet; three or four is
     a decision. Deterministic from the rng the beat already has, and it never offers the site
     that hosted it last year, because the one thing every bid cycle has in common is that
     the incumbent is not automatically back.

     `avoid` is a list of ids to keep out. `pool` narrows to a kind of site. */
  function shortlist(rng, n, opts) {
    var o = opts || {};
    var avoid = o.avoid || [];
    var pool = VENUES.filter(function (v) {
      if (avoid.indexOf(v.id) >= 0) return false;
      if (o.domeOnly && !v.dome) return false;
      if (o.usOnly && (v.state === 'IE' || v.state === 'MX')) return false;
      if (o.minCap && v.cap < o.minCap) return false;
      return true;
    });
    /* A STABLE SHUFFLE off the rng, so the same beat offers the same three. */
    var picked = [];
    var copy = pool.slice();
    var want = Math.min(n || 3, copy.length);
    for (var i = 0; i < want; i++) {
      var k = Math.floor((rng ? rng() : 0.5) * copy.length) % copy.length;
      picked.push(copy.splice(k, 1)[0]);
    }
    return picked;
  }

  function sponsorList(rng, n, avoid) {
    var pool = SPONSORS.filter(function (s) { return (avoid || []).indexOf(s.id) < 0; });
    var out = [], copy = pool.slice();
    var want = Math.min(n || 3, copy.length);
    for (var i = 0; i < want; i++) {
      var k = Math.floor((rng ? rng() : 0.5) * copy.length) % copy.length;
      out.push(copy.splice(k, 1)[0]);
    }
    return out;
  }

  /* WHAT PUTTING A GAME SOMEWHERE IS WORTH, as a ledger edit's effects. One place, so the six
     items that choose a venue cannot each price it slightly differently and leave a player
     unable to learn what any of it means.

     `weight` scales it: a title game is the whole thing, a week one kickoff is a fraction. */
  /* SIZED AGAINST THE REST OF THE DOCKET, which is where the first set of these were wrong.
     They were scaled so that a whole title game bid moved money by 0.16 and inventory by
     0.14, an order of magnitude under an ordinary ruling, and the symptom was not that the
     numbers looked small: it was that the feed had nothing to say. Every reaction in feed.js
     is keyed off how far an effect moved, so three separate bids came back with all three
     posts falling through to generic filler, because as far as the sport could tell nothing
     had happened. Placing the biggest game of the year is not a rounding error. */
  function effectsOf(v, weight) {
    if (!v) return {};
    var w = weight == null ? 1 : weight;
    var e = {};
    e.money = Math.round(((v.fee - 0.75) * 6) * w * 100) / 100;
    e.inventory = Math.round(((v.draw - 1) * 18) * w * 100) / 100;
    e.tradition = Math.round(((v.heritage - 0.35) * 5) * w * 100) / 100;
    e.access = Math.round((v.reach * 4 - 0.35) * w * 100) / 100;
    /* A ROOF IS NOT A DETAIL. An outdoor January game is a real chance of the sport's biggest
       night being played in weather nobody can watch. */
    e.exposure = Math.round((-(v.risk - 0.08) * 10) * w * 100) / 100;
    for (var k in e) { if (!e[k]) delete e[k]; }
    return e;
  }

  /* And what a sponsor is worth, on the same principle. */
  function sponsorEffects(s, weight) {
    if (!s) return {};
    var w = weight == null ? 1 : weight;
    return {
      money: Math.round(((s.pay - 0.6) * 3.4) * w * 100) / 100,
      tradition: Math.round((-s.hate * 3.4) * w * 100) / 100,
      exposure: Math.round((-(s.risk - 0.12) * 4.4) * w * 100) / 100,
    };
  }

  var api = {
    VENUES: VENUES, BOWLS: BOWLS, SPONSORS: SPONSORS,
    venue: venue, bowl: bowl, sponsor: sponsor, label: label,
    shortlist: shortlist, sponsorList: sponsorList,
    effectsOf: effectsOf, sponsorEffects: sponsorEffects,
  };
  root.PS_CFB_VENUES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
