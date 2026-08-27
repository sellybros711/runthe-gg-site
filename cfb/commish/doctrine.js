/*
 * doctrine.js - what a commissioner turned out to believe.
 *
 * report.js grades a term: six cards, a letter, a score out of a hundred. That answers "was
 * I any good", which is a question with one axis and a leaderboard at the end of it, and
 * everybody who plays lands somewhere on the same line as everybody else.
 *
 * This answers a different question. Not how well you did it, but WHAT YOU DID: which
 * arguments you kept taking the same side of, across forty-five rulings you probably made
 * one at a time without noticing a pattern. That is the thing worth telling somebody, and
 * the thing two people can compare without either of them having a better number.
 *
 * ---------------------------------------------------------------------------
 * IT IS READ OFF WHAT YOU DID, NOT OFF WHERE YOU ENDED
 * ---------------------------------------------------------------------------
 * Every option in the docket resolves to an effect vector on the ledger's eight axes, and
 * every ruling stores its own on world.history. Summing those across a term is a record of
 * choices rather than of outcomes, which is the right basis: the sport also drifts on its
 * own, seasons apply their own edits, and a fallout can move a number you never touched.
 * The final state is where the sport ENDED UP. The sum is what you kept voting for.
 *
 * A handful of final-state facts ride along as evidence, because "you leave the players on
 * 22% of the pool" is a sentence and a bar chart is not.
 *
 * ---------------------------------------------------------------------------
 * FOUR SPECTRA, AND WHY money AND cost ARE NOT AMONG THEM
 * ---------------------------------------------------------------------------
 * Every bloc in the room weights `money` positively and `cost` negatively. Nobody argues for
 * less money. That makes them a competence question rather than a value question, and
 * report.js already grades competence on the books card. A doctrine axis has to be something
 * two reasonable people would take opposite sides of.
 *
 *   purse    labour                              who the money is for
 *   gate     access                              who the sport is for
 *   stage    inventory + exposure - tradition    what the sport is
 *   throne   -autonomy                           who decides
 *
 * `throne` is negated because a ruling with a positive autonomy effect HANDS POWER AWAY: the
 * conferences want autonomy, so giving it to them is the office keeping less.
 *
 * ---------------------------------------------------------------------------
 * THE SCALES WERE MEASURED, AND THE SKEW WAS LEFT IN
 * ---------------------------------------------------------------------------
 * Each axis is divided by what a term that CHASED it actually reaches, measured over twelve
 * seeds of a bot playing eleven different ways. They are not the same: a term chasing
 * `stage` reaches about 88 and one chasing `gate` reaches about 30, so a single shared
 * divisor would tell every open-the-doors commissioner they had barely bothered.
 *
 * The centre is left at zero rather than at the median of played terms, and that is the
 * decision worth defending. A bot playing to keep its job lands at purse -25 and throne -15
 * every time: pleasing the room means taking from the players and giving power to the
 * conferences. Recentring would define that away as "normal" and hand the player a doctrine
 * measured against other players. Left where it is, the axis keeps its meaning, and a term
 * that survived by paying the room out of the players' share is told so. That is the whole
 * point of the card.
 */
(function (root) {
  'use strict';

  /* Each spectrum, as a blend of the ledger's own effect axes. */
  var SPECTRA = [
    { id: 'purse', axis: 'Who the money is for',
      lo: 'The schools', hi: 'The players',
      of: function (e) { return (e.labour || 0); }, scale: 50 },
    { id: 'gate', axis: 'Who the sport is for',
      lo: 'The few', hi: 'Everybody',
      of: function (e) { return (e.access || 0); }, scale: 30 },
    { id: 'stage', axis: 'What the sport is',
      lo: 'A game', hi: 'A product',
      of: function (e) {
        return (e.inventory || 0) + (e.exposure || 0) - (e.tradition || 0);
      }, scale: 88 },
    { id: 'throne', axis: 'Who decides',
      lo: 'The conferences', hi: 'This office',
      of: function (e) { return -(e.autonomy || 0); }, scale: 36 },
  ];
  var BY_ID = {};
  SPECTRA.forEach(function (s) { BY_ID[s.id] = s; });

  /* HOW FAR FROM THE MIDDLE COUNTS AS BELIEVING SOMETHING. Under this on every axis and the
     term had no doctrine, which is a real result and gets its own name rather than being
     rounded up to the nearest opinion. Thirty is a third of the way to a term that chased
     one axis and nothing else, which is about where a pattern stops being noise. */
  var COMMITTED = 30;

  /* THE ARCHETYPES. Named off the STRONGEST axis rather than off a quadrant, because
     quadrants need sixteen names for four axes and most of them would never be seen. The
     second-strongest axis writes the second sentence instead, which is where the nuance
     goes and where two commissioners with the same name still read differently. */
  var NAMES = {
    'purse+': { name: 'The Reformer',
      line: 'You kept voting the money toward the people playing.' },
    'purse-': { name: 'The Landlord',
      line: 'You kept the money where you found it, with the institutions.' },
    'gate+': { name: 'The Populist',
      line: 'You kept opening doors that had been shut for a long time.' },
    'gate-': { name: 'The Gatekeeper',
      line: 'You kept the sport small at the top and did not apologise for it.' },
    'stage+': { name: 'The Showman',
      line: 'You treated college football as inventory and sold it well.' },
    'stage-': { name: 'The Keeper',
      line: 'You protected the old game from the thing it is turning into.' },
    'throne+': { name: 'The Sovereign',
      line: 'You pulled the decisions back into this office and made them here.' },
    'throne-': { name: 'The Federalist',
      line: 'You handed the hard questions to the conferences and let them answer.' },
    none: { name: 'The Caretaker',
      line: 'You took each thing as it came and left the sport roughly as you found it.' },
  };

  /* The second sentence: what the runner-up axis says about the same term. */
  var ASIDES = {
    'purse+': 'while moving money toward the players.',
    'purse-': 'while keeping the players\' share where it was.',
    'gate+': 'while widening who gets in.',
    'gate-': 'while narrowing who gets in.',
    'stage+': 'while selling more of it than you were handed.',
    'stage-': 'while defending what the sport used to be.',
    'throne+': 'while taking more of the decisions yourself.',
    'throne-': 'while giving the conferences their head.',
  };

  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var poleOf = function (id, v) { return id + (v > 0 ? '+' : '-'); };

  /* A SEASON IS NOT A RULING. The engine writes its own edit through the same door a
     commissioner does, so the history carries entries nobody chose, and counting those would
     read the sport's own drift back as the player's beliefs. */
  function rulingsOf(world) {
    return (world && world.history ? world.history : []).filter(function (h) {
      return h && !(h.id && String(h.id).indexOf('season:') === 0);
    });
  }

  /* ── the profile ─────────────────────────────────────────────────────────────
     Comes back with every axis at -100..100, plus which one is loudest and how loud, so a
     caller can draw four bars, name the term, or do both. Null when there is nothing to
     read: a term with no rulings in it has no doctrine, and inventing one for it would put a
     label on somebody who has not done anything yet. */
  function profile(world) {
    var rulings = rulingsOf(world);
    if (!rulings.length) return null;

    var raw = {}, axes = {};
    SPECTRA.forEach(function (s) { raw[s.id] = 0; });
    var counted = 0;
    rulings.forEach(function (h) {
      var e = h.effects || {};
      var any = false;
      SPECTRA.forEach(function (s) {
        var v = s.of(e);
        if (v) any = true;
        raw[s.id] += v;
      });
      if (any) counted++;
    });
    if (!counted) return null;

    SPECTRA.forEach(function (s) {
      axes[s.id] = Math.round(clamp((raw[s.id] / s.scale) * 100, -100, 100));
    });

    /* Loudest first, and a tie goes to the order the spectra are declared in so the same
       term never gets two different names on two different machines. */
    var order = SPECTRA.map(function (s) { return s.id; }).sort(function (a, b) {
      var d = Math.abs(axes[b]) - Math.abs(axes[a]);
      return d !== 0 ? d
        : SPECTRA.findIndex(function (s) { return s.id === a; })
          - SPECTRA.findIndex(function (s) { return s.id === b; });
    });
    var top = order[0], second = order[1];
    var committed = Math.abs(axes[top]) >= COMMITTED;

    var key = committed ? poleOf(top, axes[top]) : 'none';
    var card = NAMES[key];
    var aside = (committed && Math.abs(axes[second]) >= COMMITTED)
      ? ASIDES[poleOf(second, axes[second])] : null;

    return {
      axes: axes, raw: raw,
      rulings: rulings.length,
      /* The id is what a database stores and a board groups on, so it is a slug and not the
         display name: renaming "The Landlord" must not orphan every term recorded under it. */
      id: key,
      name: card.name,
      line: card.line + (aside ? ' Mostly ' + aside : ''),
      top: top, second: second,
      strength: Math.abs(axes[top]),
      committed: committed,
    };
  }

  /* ── the evidence ────────────────────────────────────────────────────────────
     WHAT THE SPORT ACTUALLY LOOKS LIKE NOW, in four short facts, one per spectrum. The bars
     say how hard you pushed; these say where it left the sport, which is the half a reader
     can argue with. Read off the final state rather than off the sums on purpose: they are a
     different kind of claim and the card is better for having both.

     Every one returns null rather than guessing when the world has no such field, because a
     term saved before a field existed must not produce a confident sentence about it. */
  function evidence(world) {
    if (!world) return [];
    var out = [];
    var lb = world.labour || {}, pl = world.playoff || {}, po = world.posture || {};
    if (lb.revShare != null) {
      /* The three employment states are stored as single words and read as single words:
         "as employee" is not a sentence, so each one gets its own clause. */
      var EMPLOY = { contracted: ', under contract', employee: ', as employees' };
      out.push({ id: 'purse', say: 'The players end on '
        + Math.round(lb.revShare * 100) + '% of the pool'
        + (EMPLOY[lb.employment] || '') + '.' });
    }
    if (pl.teams != null) {
      out.push({ id: 'gate', say: 'A ' + pl.teams + ' team playoff'
        + (pl.autobids != null ? ' with ' + pl.autobids + ' guaranteed bid'
          + (pl.autobids === 1 ? '' : 's') : '') + '.' });
    }
    if (po.bowlTieIns != null || po.tvWindows != null) {
      out.push({ id: 'stage', say: (po.tvWindows != null ? po.tvWindows + ' television windows' : '')
        + (po.tvWindows != null && po.bowlTieIns != null ? ', and the bowl tie-ins ' : '')
        + (po.bowlTieIns != null ? (po.bowlTieIns ? 'still standing.' : 'gone.') : '.') });
    }
    if (lb.rulesBy) {
      out.push({ id: 'throne', say: lb.rulesBy === 'national'
        ? 'Eligibility is written here, for everybody.'
        : 'Eligibility is whatever each conference says it is.' });
    }
    return out;
  }

  /* ── comparing two terms ─────────────────────────────────────────────────────
     The distance between two doctrines, 0 to 100, so a board can say "the nearest
     commissioner to you" rather than only "somebody else who was also a Reformer". Mean
     absolute difference across the four axes, halved because each axis spans 200. */
  function distance(a, b) {
    if (!a || !b) return null;
    var t = 0;
    SPECTRA.forEach(function (s) {
      t += Math.abs((a.axes ? a.axes[s.id] : a[s.id]) - (b.axes ? b.axes[s.id] : b[s.id]));
    });
    return Math.round((t / SPECTRA.length) / 2);
  }

  /* The four numbers a database column wants, in a fixed order, and back again. Written
     down here rather than at the call site so the writer and the reader cannot drift. */
  function pack(p) {
    if (!p) return null;
    return SPECTRA.map(function (s) { return p.axes[s.id]; });
  }
  function unpack(arr) {
    if (!arr || arr.length !== SPECTRA.length) return null;
    var axes = {};
    SPECTRA.forEach(function (s, i) { axes[s.id] = Number(arr[i]) || 0; });
    return { axes: axes };
  }

  var api = {
    API_VERSION: 1,
    SPECTRA: SPECTRA, BY_ID: BY_ID, NAMES: NAMES, COMMITTED: COMMITTED,
    profile: profile, evidence: evidence, distance: distance,
    pack: pack, unpack: unpack, rulingsOf: rulingsOf,
  };
  root.PS_CFB_DOCTRINE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
