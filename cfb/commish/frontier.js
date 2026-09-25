/* THE SPORT CAN GROW A NEW PART.
 *
 * WHY THIS FILE EXISTS, measured rather than argued. probe_longrun.mjs plays thirty runs of
 * fifty seasons and reports what a commissioner actually meets:
 *
 *     by year   distinct items   paths moved (of 63)
 *     5         34.0             28.3
 *     10        47.7             33.6
 *     25        57.7             38.0
 *     50        61.4             38.6
 *
 * Read the right hand column first, because it is the one that cannot be fixed by writing
 * more items. The sport stops moving at year 25. Every number in the ledger that a ruling can
 * push has been pushed by then, and the next twenty-five years push them back and forth
 * inside the same sixty-three fields. Year 50 is not a stale docket. It is a sport that
 * cannot become anything it was not on the day you took the job.
 *
 * A thread does not fix that and is not meant to. `plant` puts a consequence in the future,
 * the payoff item rules on it, `cut` files it, and the world returns to the same shape it had
 * before. That is right for a lawsuit. It is wrong for the question this file answers, which
 * is what a governing body is FOR over a lifetime: not settling arguments, but changing what
 * the institution is allowed to argue about.
 *
 * SO A FRONTIER IS A PERMANENT ENLARGEMENT. Crossing one does three things at once:
 *
 *   it SEATS a bloc      somebody new is in the room from now on and answers every ruling
 *   it ADDS ledger paths the sport gains numbers it did not have, which rulings can move
 *   it OPENS a shelf     docket items gated on it, which could not have existed before
 *
 * None of that unwinds. A frontier is stamped with the year it was crossed and it stays
 * crossed, which is what makes a fifty year term a history rather than a long shuffle.
 *
 * THEY CHAIN, AND THE CHAIN IS THE WHOLE DESIGN. `needs` names the frontiers that must
 * already be crossed, so the absurd end of the ladder is not a random event that fires in
 * year 40. Nobody plays a game on the moon until the sport plays outside the United States,
 * and nothing plays outside the United States until somebody rewrote what a member school
 * legally is. A player who reaches the last rung got there by forty years of rulings that
 * each made the next one thinkable, and a player who governed conservatively never sees it,
 * which is the point rather than a shortfall.
 *
 * WHAT STOPS IT BEING A TECH TREE. Nothing here is bought and nothing is chosen off a menu.
 * A frontier is crossed only as the consequence of ONE OPTION on one docket item, the same
 * way every other thing in this mode happens: the item arrives because the sport is in a
 * state that produced it, and the option is one of the ways out of that argument. The
 * frontier is what that way out turns out to have meant, years later.
 *
 * THE ERA IS DERIVED, NEVER STORED. It is the highest era any crossed frontier belongs to,
 * so it cannot disagree with the frontiers themselves. A stored era is a second copy of an
 * answer, and the two drift the first time somebody adds a frontier and forgets it.
 */
(function (root) {
  'use strict';

  /* THE ERAS, WHICH ARE A NAME FOR A SHAPE OF SPORT rather than a stage of a game. The
     player is never told there are five and never sees a progress bar: what they see is that
     the room got bigger and the arguments got stranger. A number here is for the code and
     for the record screen at the end of a term. */
  var ERAS = [
    { n: 1, id: 'inherited', name: 'The sport you inherited',
      blurb: 'Four conferences, a playoff, and a hundred years of habit.' },
    { n: 2, id: 'business', name: 'The sport as a business',
      blurb: 'It stopped pretending the money was incidental.' },
    { n: 3, id: 'institution', name: 'The sport as a public institution',
      blurb: 'It got big enough that the government has opinions.' },
    { n: 4, id: 'borderless', name: 'The sport without borders',
      blurb: 'It stopped being American.' },
    { n: 5, id: 'offworld', name: 'The sport off the planet',
      blurb: 'Somebody asked why not, and this office couldn\'t think of a reason.' },
  ];

  /* EVERY FRONTIER.
     `adds` is the shape grafted onto the ledger, written as a path and the value it opens at.
     `seats` is a bloc id that joins the room. `needs` is the chain.

     ONE FRONTIER, ONE SENTENCE OF CONSEQUENCE. `line` is what the office puts on the record
     the day it is crossed, and it is written in the past tense about a thing that has already
     happened, because by the time a player reads it the ruling is made. */
  var FRONTIERS = [

    /* ---- era 2: the sport admits what it is ---- */
    { id: 'union', era: 2, needs: [], seats: 'Union',
      name: 'The players bargain',
      line: 'The players have a union this office has to answer to.',
      adds: { 'labour.bargaining': 'recognised', 'labour.cba': 0 } },

    { id: 'capital', era: 2, needs: [], seats: 'Capital',
      name: 'Outside money owns a piece',
      line: 'Somebody who isn\'t a university owns part of this sport.',
      adds: { 'money.outside': 0, 'money.valuation': 0 } },

    { id: 'franchise', era: 2, needs: ['capital'],
      name: 'A program is a franchise',
      line: 'A program can be moved, sold or created. It isn\'t a school any more.',
      adds: { 'posture.relocation': 'allowed', 'posture.expansion': 0 } },

    /* ---- era 3: the sport becomes a public question ---- */
    { id: 'congress', era: 3, needs: ['union'], seats: 'Congress',
      name: 'Washington has a committee',
      line: 'There\'s a standing committee on this sport, and it can compel you.',
      adds: { 'pressure.hearings': 0, 'posture.federalCharter': 'none' } },

    { id: 'antitrust', era: 3, needs: ['congress'],
      name: 'The exemption',
      line: 'What this office is allowed to be was decided by a court, not by the members.',
      adds: { 'posture.exemption': 'none' } },

    { id: 'whitehouse', era: 3, needs: ['congress', 'capital'], seats: 'White House',
      name: 'It reaches the President',
      line: 'The President of the United States takes this office\'s calls, and makes them.',
      adds: { 'posture.national': 'none' } },

    /* ---- era 4: the sport stops being American ---- */
    { id: 'abroad', era: 4, needs: ['franchise'], seats: 'Host Nations',
      name: 'Games abroad',
      line: 'The sport plays outside the United States, for money that isn\'t American.',
      adds: { 'posture.abroad': 0, 'venues.foreign': 'none' } },

    /* NEEDS THE EXEMPTION, and that is a real dependency rather than a longer chain for its
       own sake. Redefining what a member school is, is the single most litigable thing this
       office could do, and a sport that never got its antitrust exemption would be sued out
       of it before the first kickoff. */
    { id: 'global', era: 4, needs: ['abroad', 'whitehouse', 'antitrust'],
      name: 'Members who aren\'t American',
      line: 'A member school is whatever this office says a member school is.',
      adds: { 'posture.globalMembers': 0 } },

    /* ---- era 5: the part nobody plans for ---- */
    { id: 'orbital', era: 5, needs: ['global'], seats: 'The Programme',
      name: 'A game off the planet',
      line: 'A football game was played where there is no atmosphere, and it rated.',
      adds: { 'venues.offworld': 'none', 'posture.offworld': 0 } },

    { id: 'colony', era: 5, needs: ['orbital'],
      name: 'A program that isn\'t on Earth',
      line: 'There\'s a team in this league that can\'t come home for the holidays.',
      adds: { 'posture.colony': 0 } },
  ];

  var BY_ID = {};
  FRONTIERS.forEach(function (f) { BY_ID[f.id] = f; });

  /* ---------------- reading the state ---------------- */

  /* CROSSED, as a plain test, and it is deliberately tolerant of a world that has never seen
     this file. Every save written before frontiers existed has no `frontier` key at all, and
     a fifty season dynasty is exactly the save that must not throw on the next load. */
  function has(world, id) {
    return !!(world && world.frontier && world.frontier[id]);
  }

  function crossed(world) {
    if (!world || !world.frontier) return [];
    return FRONTIERS.filter(function (f) { return !!world.frontier[f.id]; });
  }

  /* THE ERA, DERIVED. The highest era with a frontier crossed in it, floor of one. Not
     stored: see the header. */
  function eraOf(world) {
    var n = 1;
    crossed(world).forEach(function (f) { if (f.era > n) n = f.era; });
    return n;
  }
  function era(world) {
    var n = eraOf(world);
    for (var i = 0; i < ERAS.length; i++) if (ERAS[i].n === n) return ERAS[i];
    return ERAS[0];
  }

  /* WHETHER THE SPORT COULD CROSS THIS ONE NEXT. An item that would open a frontier gates on
     this, so the chain is enforced in one place rather than re-written into every item's
     when(). Already crossed is false: there is nothing to offer. */
  function open(world, id) {
    var f = BY_ID[id];
    if (!f || has(world, id)) return false;
    return f.needs.every(function (n) { return has(world, n); });
  }

  /* EVERYTHING THE SPORT COULD REACH FROM HERE, for the record screen and for a probe that
     wants to know whether a run is at a dead end or just has not got there. */
  function reachable(world) {
    return FRONTIERS.filter(function (f) { return open(world, f.id); });
  }

  /* ---------------- crossing one ---------------- */

  /* WHAT A CROSSING DOES TO THE WORLD, applied by ledger.applyEdit when an option carries
     `opens`. Here rather than there because what a frontier IS belongs to this file, and the
     ledger only has to know that something asked to cross one.

     IT IS IDEMPOTENT AND IT NEVER REOPENS A PATH. A frontier crossed twice would reset the
     numbers it added, so a sport forty years into bargaining would go back to zero because a
     late item re-opened the same door. The stamp is the guard: present means done. */
  function cross(world, id) {
    var f = BY_ID[id];
    if (!f) throw new Error('frontier: no such frontier "' + id + '"');
    if (has(world, id)) return world;
    /* AND THE CHAIN IS ENFORCED HERE AS WELL AS AT THE GATE, which is not belt and braces.
       `open()` is what an item's when() asks, and an item is hand-written data: the one thing
       an author can forget is the gate itself. Forget it and `opens: 'colony'` puts a team on
       another planet in a sport that has not yet let a player hire an agent, and nothing
       anywhere complains, because every part of the crossing works perfectly.
       IT THROWS RATHER THAN REFUSING, the same way applyEdit throws on a path the world does
       not have and for the same reason that file states: a ruling that silently does
       something other than what it says is the failure mode this whole design is built to
       avoid. A thrown error is an authoring mistake found by the suite that walks the ladder
       (test_docket) rather than a sport that quietly makes no sense. */
    var short = f.needs.filter(function (n) { return !has(world, n); });
    if (short.length) {
      throw new Error('frontier: can\'t open "' + id + '" before ' + short.join(', '));
    }
    var next = JSON.parse(JSON.stringify(world));
    next.frontier = next.frontier || {};
    next.frontier[id] = { year: next.year, beat: next.beat || 0 };
    for (var path in f.adds || {}) graft(next, path, f.adds[path]);
    /* THE SEAT IS TAKEN HERE, and it has to be. ledger.applyOutcome skips any bloc that is
       not already a key on world.blocs, which is the right guard against a typo in an item's
       `aimed` silently inventing a member. The cost is that somebody who joins the room later
       has to be written in, or they sit at the table with an opinion nobody records: the desk
       would show the President reacting to every ruling and the number would never move.
       Fifty is the neutral opening every founding bloc has. */
    next.blocs = next.blocs || {};
    if (f.seats && next.blocs[f.seats] == null) next.blocs[f.seats] = 50;
    return next;
  }

  /* A PATH THE WORLD DOES NOT HAVE YET, made to exist. applyEdit throws on an unknown path
     on purpose (a ruling that writes nowhere is invisible), so this is the one place allowed
     to create one, and it creates it ONLY if it is absent: grafting over a live value is how
     forty years of bargaining would silently reset. */
  function graft(world, path, value) {
    var parts = String(path).split('.');
    var cur = world;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    var last = parts[parts.length - 1];
    if (cur[last] === undefined) cur[last] = value;
  }

  /* EVERY PATH EVERY FRONTIER WOULD ADD, which is what a guard needs to tell a typo in an
     item's `set` from a path that is legitimately not there yet. */
  function allPaths() {
    var out = [];
    FRONTIERS.forEach(function (f) {
      for (var p in f.adds || {}) if (out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }
  function pathOwner(path) {
    for (var i = 0; i < FRONTIERS.length; i++) {
      if (FRONTIERS[i].adds && FRONTIERS[i].adds[path] !== undefined) return FRONTIERS[i];
    }
    return null;
  }

  /* ---------------- the room ---------------- */

  /* WHO IS SEATED BECAUSE OF A FRONTIER. blocs.js asks this and appends; it does not know
     the era system exists beyond the one call. */
  function seats(world) {
    return crossed(world).filter(function (f) { return !!f.seats; })
      .map(function (f) { return f.seats; });
  }

  var api = {
    ERAS: ERAS, FRONTIERS: FRONTIERS, BY_ID: BY_ID,
    has: has, crossed: crossed, eraOf: eraOf, era: era,
    open: open, reachable: reachable, cross: cross,
    allPaths: allPaths, pathOwner: pathOwner, seats: seats,
  };
  root.PS_CFB_COMMISH_FRONTIER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
