/* THE FANTASY CHALLENGE DRAFT, in one file, because a page and a checker both play it.
 *
 * Six slots in a fixed order, a cap, and a wheel. Every spin offers a handful of men at the
 * slot being filled and you sign one of them. You get five whole lineups and submit one.
 *
 * NO SECOND COPY OF ANY OF THIS. The page draws the screen and this decides the football,
 * so a checker can play a real draft without a browser and the two can never come apart.
 * That is the rule the send curve in the baseball game had to be moved to module scope to
 * obey, after its sweep spent months measuring a hand-written duplicate of itself.
 *
 * ─── THE BOARDS ARE PER PLAYER AND THAT IS A DECISION WITH A COST ───────────────────
 *
 * Two entrants meet two different wheels. Recorded once here rather than argued again: with
 * a prize attached, part of the gap between first and fourth is who was offered whom. What
 * carries most of the weight against that is the FIVE, which is the whole reason the mode
 * has five chances rather than one: a bad wheel on chance two is a lineup you do not
 * submit, and five draws of the same distribution are far closer together than one.
 *
 * ─── WHY THE WHEEL ONLY REACHES SO FAR DOWN ─────────────────────────────────────────
 *
 * A uniform draw over a 400 man pool offers four men nobody has heard of and one starter,
 * every spin, and the decision is "take the only real player". DEPTH is how many men deep
 * the wheel reaches at the slot being filled, counted among the men this roster can still
 * AFFORD, so it tightens as the cap is spent and the last slot is drawn from whoever is
 * left in range rather than from the same forty names.
 *
 * ─── THE RESERVE FLOOR IS NOT OPTIONAL ──────────────────────────────────────────────
 *
 * A draft that spends so much on a quarterback that no tight end is affordable is a draft
 * that strands, and the way it strands is silent: the board comes up empty and the player
 * is looking at a screen with nothing on it and no way on. The hoops game has this written
 * up at length under a different name. So an offer is only made for a man this roster can
 * sign AND still fill every remaining slot after, which is what reserveAfter() is.
 */
(function (root) {
  'use strict';

  /* THE ORDER IS THE ORDER THEY ARE FILLED IN, and it is the order a fantasy lineup is
     always written in, so the screen needs no second list to display it. */
  var SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE'];

  /* How many men a spin offers. Five is a decision on a phone. Three is a coin toss with a
     third option and eight is a list you scroll. */
  var DRAW = 5;

  /*
   * How far down the affordable men at a position the wheel reaches.
   *
   * A CEILING, NOT THE NUMBER, and the reason is that the four positions are four different
   * sizes. Week three of 2026 has 42 quarterbacks with a game to their name and 168 wide
   * receivers, so a flat 40 is the whole quarterback position and the top quarter of the
   * receivers. Driven, a quarterback board came up Caleb Williams, Jalen Hurts, Trevor
   * Lawrence, Kenny Pickett and Mason Rudolph: two of the five were men who will not take a
   * snap, and the board reads as junk rather than as a choice.
   *
   * So the depth is the smaller of this and HOW MANY OF THAT POSITION THE LEAGUE STARTS,
   * which is derived from two things the mode already knows: how many clubs are playing
   * this week, and how many of that position this lineup asks for. One quarterback a club
   * is 32; two receivers a club is 64, which this ceiling then cuts back to 40. No table to
   * keep in step, and a bye week narrows the wheel by itself.
   *
   * Measured at week three, rank 32 of the quarterbacks is Matthew Stafford, a starter who
   * missed a week, and rank 40 is a backup who threw four passes. The line lands between
   * them without anybody choosing where.
   */
  var DEPTH = 40;

  /*
   * THE CAP, AND IT IS THE CROSSOVER RATHER THAN A ROUND NUMBER.
   *
   *   node football/build/test/probe_cap.mjs
   *
   * Swept against two real strategies over 600 lineups a cell on a real week's board.
   * GREEDY takes the dearest man offered every time. BUDGET holds back a share of the cap
   * for each remaining slot. Projected points, and the gap between them:
   *
   *      cap    greedy   budget   budget-greedy   greedy spends
   *       70      41.2     46.0           +4.7            100%
   *       80      47.3     49.6           +2.2             99%
   *       90      52.2     52.6           +0.4             97%
   *       93      53.5     53.6           +0.1             96%
   *      100      56.0     55.3           -0.7             94%
   *      125      60.2     59.0           -1.3             81%
   *
   * Above the mid nineties the cap stops binding and spending everything as early as you
   * can is simply right. Below the eighties, holding money back is. They cross at 93 and are
   * inside half a point of each other from 90, which is the only band in the sweep where a
   * drafter has to look at the board rather than apply a rule.
   *
   * IT SHIPS AT THE ROUND NUMBER INSIDE THAT BAND rather than at the crossover itself. 90
   * against 93 is four tenths of a point on a lineup that scores fifty, and "$90M" is a
   * figure a player can hold in their head while they spend it.
   *
   * THE WHEEL IS WORTH 12.8 POINTS BEHIND BOTH OF THEM at that cap, which is the other half
   * of the answer: taking whatever the wheel offers scores 39.5. Drafting matters here.
   *
   * VALUE PER DOLLAR IS NOT A THIRD STRATEGY and the probe keeps a row to say so. The price
   * curve is convex on purpose, so points per million always picks the cheapest man on the
   * board and finishes 22 points behind.
   */
  var CAP_MUSD = 90;

  /*
   * How many whole lineups a player drafts before choosing one to submit.
   *
   * THIS IS THE DAMPER ON THE PER-PLAYER WHEEL, and it is worth more than it looks. Measured
   * at the shipped cap, the standard deviation of one draft against the best of five:
   *
   *      taking whatever is offered    6.76  ->  4.17
   *      drafting greedily             3.33  ->  1.01
   *
   * So two entrants who both draft well submit lineups within about a point of each other on
   * the projection, where a single draft each would have put them three apart. The boards
   * are per player, which means part of any gap between two entrants is who was offered
   * whom, and this is the term that makes that part small.
   */
  var CHANCES = 5;

  /* mulberry32. A named, stable generator rather than Math.random, because a chance has to
     REPLAY: a reload in the middle of a draft must come back to the same five men on the
     board, or the wheel is something a player can re-roll by pressing F5. */
  function rngOf(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* A fresh seed for one chance. This is the one place the per-player randomness enters. */
  function newSeed() {
    if (root.crypto && root.crypto.getRandomValues) {
      var a = new Uint32Array(1); root.crypto.getRandomValues(a); return a[0] >>> 0;
    }
    return (Math.random() * 4294967296) >>> 0;
  }

  var byPos = function (pool, pos) {
    var out = [];
    for (var i = 0; i < pool.length; i++) if (pool[i].position === pos) out.push(pool[i]);
    return out;
  };

  /* The cheapest man at a position, which is what a remaining slot is guaranteed to cost. */
  function cheapestAt(pool, pos) {
    var men = byPos(pool, pos), lo = Infinity;
    for (var i = 0; i < men.length; i++) if (men[i].price_musd < lo) lo = men[i].price_musd;
    return lo === Infinity ? 0 : lo;
  }

  /* What the slots AFTER index i are guaranteed to cost between them.
     COMPUTED OFF THE POOL AND NOT OFF A CONSTANT, because the cheapest tight end in week
     three is not the cheapest tight end in week twelve, and a stale floor either strands a
     draft or hands back money that was never there. */
  function reserveAfter(pool, i) {
    var t = 0;
    for (var k = i + 1; k < SLOTS.length; k++) t += cheapestAt(pool, SLOTS[k]);
    return t;
  }

  /* The dearest a man can be and still leave every remaining slot fillable. */
  function ceilingAt(pool, i, left) {
    return left - reserveAfter(pool, i);
  }

  /* Everybody at slot i who is not already signed, dearest first. */
  function atSlot(pool, i, takenIds) {
    var men = byPos(pool, SLOTS[i]), out = [];
    for (var k = 0; k < men.length; k++) {
      if (takenIds && takenIds.indexOf(men[k].player_id) >= 0) continue;
      out.push(men[k]);
    }
    out.sort(function (a, b) { return b.price_musd - a.price_musd; });
    return out;
  }

  /* Everybody who could legally be signed into slot i with `left` million to spend. */
  function eligible(pool, i, left, takenIds) {
    var ceiling = ceilingAt(pool, i, left);
    var men = atSlot(pool, i, takenIds), out = [];
    for (var k = 0; k < men.length; k++) {
      if (men[k].price_musd > ceiling + 1e-9) continue;
      out.push(men[k]);
    }
    return out;
  }

  /*
   * ONE SPIN. The DEPTH dearest men this roster can still afford at this slot, sampled
   * without replacement down to DRAW of them.
   *
   * DEAREST RATHER THAN A RANDOM SLICE OF THE WHOLE POSITION, and the two are not the same
   * game. Price is monotone in the projection, so the dearest affordable men ARE the best
   * affordable men: what the wheel offers is always a real choice between players worth
   * having, and what the cap does is decide how good that pool of forty is. Spend early and
   * the last spins reach further down, which is the whole tension.
   */
  /* How many clubs are on this board. The pool only holds men whose club is playing, so
     this is the week's own schedule read back out rather than a second copy of it. */
  function clubsIn(pool) {
    var seen = {}, n = 0;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].team && !seen[pool[i].team]) { seen[pool[i].team] = 1; n++; }
    }
    return n || 32;
  }

  function depthFor(pool, pos) {
    var starts = 0;
    for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i] === pos) starts++;
    return Math.min(DEPTH, clubsIn(pool) * starts);
  }

  /*
   * A BOARD SHOWS THE MEN YOU CANNOT AFFORD AS WELL AS THE ONES YOU CAN.
   *
   * It did not, and that is what a player meant by always having enough for the top men.
   * Drawn from the AFFORDABLE men only, every man on every board is one the reader can buy,
   * at every pick, by construction. So the cap decides the whole lineup and never once
   * appears on screen: it binds in the totals and is invisible in the moment, which reads
   * as a draft with no budget in it.
   *
   *   node football/build/test/probe_board.mjs
   *
   * Measured on the live week three board, greedy, 400 drafts: the cap gets through 97% of
   * itself, and the dearest man ever OFFERED at the first press is $24.4M against a $48M
   * ceiling and $90M to spend. Nothing was ever refused, so nothing was ever a decision.
   *
   * Drawn from the DEPTH dearest men at the slot instead, ignoring what is left, a board
   * holds something out of reach on 25.7% of presses and the takeable count runs 5.0, 5.0,
   * 4.9, 4.5, 3.6, 3.0 across the six picks. So there is still a real choice at the last
   * slot, which is the thing that had to be checked before doing this: a board of four grey
   * men and one signable one is the wheel picking the team.
   *
   * THE RESERVE FLOOR STAYS AND MOVES ONTO THE BOARD RATHER THAN OFF IT. Drawn with no
   * guarantee at all, a board can come up with nothing on it a roster can sign, which is
   * the empty screen with no way on that the floor exists to prevent: measured that way it
   * strands every single draft. So one seat is guaranteed signable, filled with the dearest
   * man in range when the draw produced none.
   *
   * NARROWING THE REACH WAS THE OTHER CANDIDATE AND IT IS WORSE. At a depth of 20 the
   * dearest man offered at the first press goes to $29.5M, and the takeable count at the
   * last two picks falls to 1.7 and 1.3. That buys the budget by taking the decision away.
   */
  function spin(pool, i, left, takenIds, rnd) {
    var can = eligible(pool, i, left, takenIds);
    /* Nothing signable at all is the stranded board, and it is still the same answer: the
       page says so rather than showing five men it will refuse. */
    if (!can.length) return [];
    var top = atSlot(pool, i, takenIds).slice(0, depthFor(pool, SLOTS[i]));
    var out = [];
    for (var n = 0; n < DRAW && top.length; n++) {
      out.push(top.splice(Math.floor(rnd() * top.length), 1)[0]);
    }
    /* The board reads in price order, which is the order a reader compares them in, and
       sorting BEFORE the swap is what makes the swap land on the cheapest man rather than
       on whoever the draw happened to pull last. */
    out.sort(function (a, b) { return b.price_musd - a.price_musd; });
    var ceiling = ceilingAt(pool, i, left), any = false;
    for (var k = 0; k < out.length; k++) {
      if (out[k].price_musd <= ceiling + 1e-9) { any = true; break; }
    }
    /* The CHEAPEST drawn man is the one replaced, because he is the one closest to being
       the guarantee already, and the dearest in range is what goes in: a reader who cannot
       reach any of the five should be handed the best thing they CAN have, not the worst. */
    if (!any) out[out.length - 1] = can[0];
    return out;
  }

  /* A chance is a seed and the men signed so far. Everything else is derived, so there is
     nothing to keep in step and a reload rebuilds the boards rather than restoring them. */
  function boardFor(pool, chance, i) {
    var rnd = rngOf(chance.seed + i * 0x9E3779B1);
    var left = CAP_MUSD - spent(chance);
    var taken = chance.men.map(function (m) { return m.player_id; });
    return spin(pool, i, left, taken, rnd);
  }

  function spent(chance) {
    var t = 0;
    for (var i = 0; i < chance.men.length; i++) t += chance.men[i].price_musd;
    return Math.round(t * 10) / 10;
  }

  /* THE ONE NUMBER THIS MODE SHOWS. No overall, no rating, no grade: what the six men are
     projected to score between them in half PPR this week. */
  function projected(chance) {
    var t = 0;
    for (var i = 0; i < chance.men.length; i++) t += chance.men[i].proj;
    return Math.round(t * 10) / 10;
  }

  var full = function (chance) { return chance.men.length >= SLOTS.length; };

  var api = {
    SLOTS: SLOTS, DRAW: DRAW, DEPTH: DEPTH, CAP_MUSD: CAP_MUSD, CHANCES: CHANCES,
    rngOf: rngOf, newSeed: newSeed,
    cheapestAt: cheapestAt, reserveAfter: reserveAfter, eligible: eligible, spin: spin,
    clubsIn: clubsIn, depthFor: depthFor, ceilingAt: ceilingAt, atSlot: atSlot,
    /* WHETHER A MAN ON THE BOARD CAN BE SIGNED, which is now a question with two answers.
       One source for the page's grey rows, the click handler's refusal and every bot, so a
       board that LOOKS unaffordable and a press that is REFUSED can never come apart. That
       is the Full Team glow's lesson: the picture and the rule read one function. */
    canSign: function (pool, i, left, man) {
      return !!man && man.price_musd <= ceilingAt(pool, i, left) + 1e-9;
    },
    boardFor: boardFor, spent: spent, projected: projected, full: full,
  };

  root.PS_FANTASY_DRAFT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
