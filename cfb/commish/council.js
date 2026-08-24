/* YOUR ADVISORY COUNCIL: how much of the room you can read before you rule.
 *
 * Test It On The Room showed all nine reactions, which is not a power, it is the answer key.
 * Press it, read the nine numbers, pick the option with the best ones. There is no decision
 * left in that, and the mode is nothing but decisions.
 *
 * So the preview is a COUNCIL, and a council has seats. You see the blocs you have people
 * inside; the rest you have to reason about from what they said on the desk and what they
 * have done to you before. Three of nine is a read. Nine of nine is a spoiler.
 *
 * THE SEATS FILL IN ONE FIXED ORDER AND THE ORDER IS A RULE, not a list somebody arranged
 * by taste: the more power a bloc holds, the closer it plays its cards. The fans and the
 * networks say it out loud because they have no vote to protect. The presidents are the
 * ones who call the vote, and the SEC and the Big Ten moving together is literally the
 * condition that ends your term, which makes the last seat on this ladder the one worth the
 * whole climb.
 *
 * That order is deliberately NOT randomised. A random three would make the preview a lottery
 * and nothing about it learnable, and the whole point of a council is that you know who your
 * people are.
 *
 * WHAT THIS DOES NOT TOUCH: what happens after you rule. The reaction screen shows the whole
 * room, always, for everybody. Hiding a consequence is not difficulty, it is a bug. This
 * gates the FORECAST and nothing else.
 */
(function (root) {
  'use strict';

  /* Easiest to read first. The ids are blocs.js's own, and a name that does not match one
     there would silently seat nobody, which is what SEAT_IDS_ARE_REAL in the test is for. */
  var SEATS = [
    'Fans',           /* no vote, and they say it at a volume nobody can miss */
    'Networks',       /* no vote, and their position is in the rights negotiation */
    'Players',        /* no vote, organising in public */
    'Group of Five',  /* half a vote, and their grievance is a press release */
    'Big 12',         /* one vote */
    'ACC',            /* one vote */
    'Presidents',     /* one and a half, and everything they say survives a deposition */
    'Big Ten',        /* two, and half of the coalition that removes you */
    'SEC',            /* two, and the other half */
  ];

  /* SEATS YOU START WITH. Three, because a council of one is not a read, it is a rumour, and
     the first three hold no votes at all: at the start of a career you can tell what the
     sport FEELS about a ruling and not what the room will DO about it. That is the right
     shape for the beginning of this job. */
  var OPENING_SEATS = 3;

  /* RULINGS NEEDED FOR THE FOURTH SEAT ONWARDS. One entry per seat above the opening three,
     so this array is the whole difficulty curve and tuning it is one edit.
     A term is five seasons of nine beats with something on the desk about four beats in
     five, so a term is roughly thirty-five rulings: the fourth and fifth seats land inside
     a first term, and the full nine take about a term and a half. */
  var AT = [5, 11, 19, 29, 41, 55];

  function seatsAt(rulings) {
    var n = Math.max(0, Math.floor(Number(rulings) || 0));
    var seats = OPENING_SEATS;
    for (var i = 0; i < AT.length; i++) if (n >= AT[i]) seats++;
    return Math.min(seats, SEATS.length);
  }

  function councilAt(rulings) {
    return SEATS.slice(0, seatsAt(rulings));
  }

  /* WHO YOU CANNOT READ, which is the list the screen actually draws: it has to show that
     there are nine and that six of them are dark, rather than quietly showing three rows and
     letting the player think that is the room. */
  function blindAt(rulings) {
    return SEATS.slice(seatsAt(rulings));
  }

  /* THE NEXT SEAT AND WHAT IT COSTS. Null once the council is full, because "your tenth seat
     opens at Infinity" is not a thing to print on a screen. */
  function nextSeat(rulings) {
    var n = Math.max(0, Math.floor(Number(rulings) || 0));
    var seats = seatsAt(n);
    if (seats >= SEATS.length) return null;
    var at = AT[seats - OPENING_SEATS];
    return { id: SEATS[seats], seat: seats + 1, at: at, need: Math.max(0, at - n) };
  }

  /* Ordinals for "your fourth seat", which is how a person says it. The ladder is nine long
     and stops there, so this table is complete rather than clever. */
  var ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
    'eighth', 'ninth'];

  var api = {
    SEATS: SEATS,
    OPENING_SEATS: OPENING_SEATS,
    AT: AT,
    ORDINAL: ORDINAL,
    seatsAt: seatsAt,
    councilAt: councilAt,
    blindAt: blindAt,
    nextSeat: nextSeat,
  };

  root.PS_CFB_COUNCIL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
