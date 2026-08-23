/*
 * blocs.js - who is in the room, and what they think of what you just did.
 *
 * NINE, AND NINE IS A DECISION. Football President reacts with four blocs and Fantasy
 * President with thirty-two. Four is too few for college football, where the whole story is
 * that the SEC and the Big Ten want different things from the ACC and the Big 12 and all
 * four want something different from everybody who is not in them. Thirty-two is a spreadsheet
 * on a phone. Nine is the number where a coalition is a real count you can hold in your head.
 *
 * NOBODY WRITES NINE REACTIONS PER DOCKET ITEM. A ruling emits a push along the eight axes
 * in ledger.js; a bloc holds a weight on each; what it thinks is those multiplied. So a new
 * item on the docket arrives with nine opinions already formed, in character, and the
 * hundredth item costs the same to write as the first. The alternative is authoring 9 x 120
 * reactions by hand, which is how a mode like this quietly stops having new content.
 *
 * A WEIGHT IS A CHARACTER. The SEC's is not "likes money" in the abstract, it is: money
 * matters three times what tradition does, being told what to do costs more than either,
 * and paying players is a cost before it is anything else. Read down a column and it should
 * be recognisably that bloc arguing at a real meeting.
 *
 * MEMORY, WHICH IS THE PART THAT MAKES IT A ROOM RATHER THAN A CALCULATOR. A bloc that has
 * been on the losing end of the last three rulings reacts harder to the fourth, in both
 * directions: it is angrier at another loss and more relieved by a win. Without it every
 * beat is independent and a player can take the same bloc apart forever at the same price.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_BLOCS. Node: require('./blocs.js').
 */
(function () {
  'use strict';

  /* money    is more money moving, and toward the top of the sport unless aimed elsewhere
     access   is an easier path to the playoff for somebody who did not have one
     autonomy is a conference keeping its own decisions
     cost     is what the members have to pay out
     tradition is rivalries, sane kickoff times, the things people already love
     inventory is games worth televising
     labour   is better for the players
     exposure is MORE legal and political trouble, which is why nearly every weight on it
              is negative. The two that are not belong to the people who do the suing.  */
  const BLOCS = [
    {
      id: 'SEC', name: 'SEC', vote: 2,
      about: 'Holds the inventory and knows it. Wants more of everything and to be asked first.',
      w: { money: 3.0, access: -0.8, autonomy: 2.6, cost: -2.0, tradition: 1.0, inventory: 1.4, labour: -1.0, exposure: -0.8 },
    },
    {
      id: 'Big Ten', name: 'Big Ten', vote: 2,
      about: 'The other one that can end you. Wants parity with the SEC and its presidents kept calm.',
      w: { money: 2.8, access: -0.6, autonomy: 2.4, cost: -1.6, tradition: 0.6, inventory: 1.6, labour: -0.4, exposure: -1.4 },
    },
    {
      id: 'ACC', name: 'ACC', vote: 1,
      about: 'Survival. Everything is read as whether it makes leaving easier or staying bearable.',
      w: { money: 2.4, access: 1.2, autonomy: 1.2, cost: -1.8, tradition: 1.2, inventory: 0.8, labour: -0.4, exposure: -0.6 },
    },
    {
      id: 'Big 12', name: 'Big 12', vote: 1,
      about: 'Wants a seat and a bid, and to not be spoken about in the same sentence as the Group of Five.',
      w: { money: 2.2, access: 1.8, autonomy: 1.0, cost: -1.4, tradition: 0.6, inventory: 0.8, labour: -0.2, exposure: -0.4 },
    },
    {
      id: 'Group of Five', name: 'Group of Five', vote: 0.5,
      about: 'Access before money, because money without access never arrives.',
      w: { money: 1.6, access: 3.0, autonomy: 0.4, cost: -1.0, tradition: 0.8, inventory: 0.2, labour: 0.4, exposure: 0.6 },
    },
    {
      id: 'Networks', name: 'The networks', vote: 0,
      about: 'Pays for all of it. Wants windows, inventory and one negotiation.',
      w: { money: 0.6, access: 0.2, autonomy: -1.2, cost: 0.0, tradition: 0.8, inventory: 3.2, labour: 0.0, exposure: -1.0 },
    },
    {
      id: 'Players', name: 'The players', vote: 0,
      about: 'Money, health, and the freedom to leave. Has more leverage every year.',
      w: { money: 0.2, access: 0.8, autonomy: 0.0, cost: 1.2, tradition: -0.4, inventory: -0.6, labour: 3.4, exposure: 0.4 },
    },
    {
      id: 'Presidents', name: 'The presidents', vote: 1.5,
      about: 'Cover and cost control. Anything that ends in a deposition is the whole problem.',
      w: { money: 1.0, access: 0.6, autonomy: 0.8, cost: -2.4, tradition: 0.6, inventory: -0.2, labour: -0.6, exposure: -3.0 },
    },
    {
      id: 'Fans', name: 'The fans', vote: 0,
      about: 'Rivalries, tradition, kickoff at a sane hour. Reads efficiency as an insult.',
      w: { money: -0.8, access: 1.4, autonomy: 0.4, cost: 0.0, tradition: 3.2, inventory: 0.6, labour: 0.6, exposure: -0.2 },
    },
  ];

  const BY_ID = {};
  BLOCS.forEach((b) => { BY_ID[b.id] = b; });

  /* Scale, so a normal ruling moves a bloc a handful of points rather than half the bar.
     Set against the docket: an ordinary item pushes one or two axes by 1 or 2, and a
     sport-changing one pushes four axes by 3. */
  const GAIN = 0.9;
  /* How hard memory bites. A bloc that has lost the last three reacts about 40% harder. */
  const MEMORY = 0.14;
  const MEMORY_MAX = 3;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* How the last few rulings went for one bloc, as a count of losses minus wins, capped.
     Read off the world's own history rather than stored, so it cannot drift out of step
     with what actually happened and there is nothing extra to serialise. */
  function grudge(world, blocId) {
    const rows = (world.history || []).slice(-MEMORY).reverse();
    let n = 0;
    for (const row of rows) {
      const felt = dot(BY_ID[blocId].w, row.effects || {});
      if (felt < -0.5) n++;
      else if (felt > 0.5) n--;
    }
    return clamp(n, -MEMORY_MAX, MEMORY_MAX);
  }

  function dot(weights, effects) {
    let t = 0;
    for (const axis in weights) t += weights[axis] * (effects[axis] || 0);
    return t;
  }

  /* WHAT THE WHOLE ROOM THINKS, in one call, because that is how it is shown: nine answers
     at once rather than a queue of nine cards. Returns a row per bloc with the number, where
     it leaves them, and the one line they say.

     `edit.aimed` is the part that only one bloc feels. Money moving is not money moving in
     general, it is money moving TO somebody, and a rule that guarantees the Group of Five a
     bid is not the same push for the SEC. Without it every ruling reads as weather. */
  function react(world, edit) {
    const fx = (edit && edit.effects) || {};
    const aimed = (edit && edit.aimed) || {};
    return BLOCS.map((b) => {
      const own = Object.assign({}, fx);
      for (const axis in aimed[b.id] || {}) own[axis] = (own[axis] || 0) + aimed[b.id][axis];
      const raw = dot(b.w, own);
      /* Memory amplifies rather than shifts: it never turns a win into a loss, it only
         changes how much the bloc cares that it happened. */
      const g = grudge(world, b.id);
      const delta = raw * GAIN * (1 + Math.abs(g) * MEMORY * (g > 0 === raw < 0 ? 1 : 0.5));
      const was = world.blocs[b.id] == null ? 50 : world.blocs[b.id];
      const now = clamp(was + delta, 0, 100);
      return {
        id: b.id, name: b.name, vote: b.vote,
        delta: Math.round(delta * 10) / 10,
        was: Math.round(was), now: Math.round(now),
        mood: moodOf(now),
        say: line(b, delta, now),
      };
    });
  }

  /* The deltas alone, in the shape ledger.applyOutcome takes. */
  function deltas(world, edit) {
    const out = {};
    react(world, edit).forEach((r) => { out[r.id] = r.delta; });
    return out;
  }

  function moodOf(v) {
    if (v >= 70) return 'with you';
    if (v >= 50) return 'along for now';
    if (v >= 30) return 'unhappy';
    if (v >= 15) return 'hostile';
    return 'gone';
  }

  /* ONE LINE, AND IT IS THE BLOC TALKING, NOT A NARRATOR. Five bands of feeling by five
     voices is twenty-five short strings, which is the cheapest thing in this file and the
     part a player actually reads.
     THIS IS ALSO THE SEAM FOR THE LANGUAGE MODEL, if that fork is taken later: a generated
     line would replace exactly this function and nothing else, and when the model is not
     there these are what shows. See the plan doc. */
  const VOICE = {
    SEC: ['This is what we pay for.', 'Fine. We will take it.', 'We were not consulted.',
      'We have other options and everybody knows it.', 'We are done talking to this office.'],
    'Big Ten': ['Our presidents will be pleased.', 'Workable.', 'That is not parity.',
      'We will be looking at our own arrangements.', 'This office no longer speaks for us.'],
    ACC: ['That buys us time, and time is what we needed.', 'We can live with it.',
      'Our members will read this as a reason to leave.', 'Our lawyers are already reading it.',
      'There may not be an ACC to consult next year.'],
    'Big 12': ['A seat at last.', 'Acceptable.', 'We are being lumped in again.',
      'We will look after ourselves.', 'We are not participating in this.'],
    'Group of Five': ['A real path. Finally.', 'Better than nothing.',
      'The gap just got wider.', 'We are filing.', 'We will see you in front of a judge.'],
    Networks: ['That is a product we can sell.', 'We can work with the windows.',
      'This devalues the inventory.', 'The next deal will reflect this.',
      'We are not bidding on that.'],
    Players: ['Somebody finally listened.', 'It is a start.', 'We are being talked about, not to.',
      'We are organising.', 'We will bargain, or we will sit.'],
    Presidents: ['Defensible. That matters.', 'We can explain this.',
      'This ends up in a courtroom.', 'We have a fiduciary problem.',
      'A vote is being scheduled.'],
    Fans: ['This is the sport we grew up on.', 'We will get used to it.',
      'Nobody asked for this.', 'You are ruining it.', 'We will find something else on.'],
  };

  function line(bloc, delta, now) {
    const voice = VOICE[bloc.id] || VOICE.Fans;
    /* Which line is mostly where they have ENDED UP, nudged by which way they just moved,
       because a bloc at 70 that has just been hurt should not sound delighted. */
    let band = now >= 70 ? 0 : now >= 50 ? 1 : now >= 30 ? 2 : now >= 15 ? 3 : 4;
    if (delta < -1.5) band = Math.min(4, band + 1);
    else if (delta > 1.5) band = Math.max(0, band - 1);
    return voice[band];
  }

  const publicAPI = { BLOCS, BY_ID, GAIN, MEMORY, react, deltas, grudge, dot, moodOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.PS_CFB_BLOCS = publicAPI;
})();
