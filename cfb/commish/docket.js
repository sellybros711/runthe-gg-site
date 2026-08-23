/*
 * docket.js - what lands on the desk.
 *
 * An item is DATA, and the whole point of the shape below is that it stays data. A ruling
 * comes out of it as one ledger edit, which is the same thing a written ruling produces
 * once a model has read it, so nothing downstream can tell which tier the player is on.
 * That is the seam the whole design hangs off: see the plan doc.
 *
 * AN ITEM IS GATED ON THE WORLD, NOT ON A COUNTER. `when` reads the ledger, so the playoff
 * does not get expanded to sixteen twice and nobody is asked to sign a media deal that has
 * four years to run. Which also means the docket thins out as a term goes on unless the
 * sport keeps producing new arguments, and it does: undoing something is an item, and so is
 * what the last ruling caused.
 *
 * THE DIALS ARE WHERE THE TIERS SPLIT, and it is in the data rather than in the page.
 * `free` is the two or three settings anybody gets and `pro` is the range. A free player
 * expanding the playoff picks twelve, fourteen or sixteen; a paying one sets the autobids to
 * seven and the byes to none and finds out what that does. The page reads the same field
 * either way and the ledger cannot tell the difference.
 *
 * NO NAMED PEOPLE. A bloc speaks, an institution pushes. See the plan doc: the difference
 * between "2005 Alabama went 9-2", which is a fact this game already uses, and a quote
 * nobody said.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_DOCKET. Node: require('./docket.js').
 */
(function () {
  'use strict';

  /* Beat indices, matching ledger.BEATS. Named here so an item reads as a date rather than
     as a number, and so a renumbered calendar breaks loudly in one place. */
  const WINTER = 0, PORTAL = 1, SPRING = 2, MEDIA = 3,
    SEPT = 4, OCT = 5, NOV = 6, CHAMP = 7, PLAYOFF = 8;

  /* Conferences with enough members left to behave like one. */
  const live = (w, L) => L.POWERS.filter((c) => !L.isDefunct(w, c));
  const moveAll = (c) => {
    const out = {};
    if (c) c.schools.forEach((s) => { out[s] = c.to; });
    return out;
  };

  const ITEMS = [
    /* ---------------------------------------------------------------- */
    {
      id: 'playoff-format',
      beats: [WINTER],
      weight: 5,
      when: (w) => w.playoff.teams < 16,
      eyebrow: 'The format',
      title: 'The playoff is up for renewal',
      brief: 'The twelve-team field has been through one cycle and every part of it is '
        + 'open again. Everybody in the room has a number in mind and none of them is the '
        + 'same number.',
      voices: [
        { id: 'SEC', say: 'Whatever it is, our byes survive it.' },
        { id: 'Group of Five', say: 'One guaranteed bid. That is the whole ask.' },
        { id: 'Networks', say: 'More January inventory. We will pay for it.' },
      ],
      options: [
        { id: 'hold', label: 'Leave it at twelve',
          body: 'It works. Nobody is happy, which is usually the sign of a settlement.',
          edit: { effects: { tradition: 1, autonomy: 1 } } },
        { id: 'to14', label: 'Fourteen',
          body: 'Two more seats. The smallest change that can be called a change.',
          edit: { set: { 'playoff.teams': 14 }, effects: { access: 1, inventory: 1, money: 1, tradition: -1 } } },
        { id: 'to16', label: 'Sixteen',
          body: 'A fourth of the country in the bracket. The regular season becomes '
            + 'something else, and nobody agrees what.',
          edit: { set: { 'playoff.teams': 16 },
            effects: { access: 2, inventory: 3, money: 2, tradition: -3 },
            aimed: { 'Group of Five': { access: 2 }, Fans: { tradition: -1 } } } },
      ],
      dials: [
        { id: 'autobids', label: 'Automatic bids', path: 'playoff.autobids',
          base: 5, free: [4, 5, 6], pro: [0, 1, 2, 3, 4, 5, 6, 7, 8],
          per: { access: 0.9, autonomy: -0.4 },
          aim: { 'Group of Five': { access: 0.8 }, SEC: { access: -0.5 } } },
        { id: 'byes', label: 'First-round byes', path: 'playoff.byes',
          base: 4, free: [0, 4], pro: [0, 2, 4, 6, 8],
          per: { access: -0.3 }, aim: { SEC: { autonomy: 0.4 }, 'Big Ten': { autonomy: 0.4 } } },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'revenue-split',
      beats: [WINTER, SPRING],
      weight: 5,
      when: () => true,
      eyebrow: 'The money',
      title: 'The distribution formula',
      brief: 'The pool is set. How it splits is not, and it is the only number in the sport '
        + 'that everybody can recite from memory.',
      voices: [
        { id: 'SEC', say: 'We generate it. That should be the end of the conversation.' },
        { id: 'ACC', say: 'Our members are being told there is more elsewhere. There is.' },
        { id: 'Group of Five', say: 'We play the same sport under the same rules.' },
      ],
      options: [
        { id: 'as-is', label: 'Leave the formula alone',
          body: 'The share stays where it is. So does everybody\'s opinion of you.',
          edit: { effects: { autonomy: 1 } } },
        { id: 'flatten', label: 'Flatten it',
          body: 'Move a share of the pool down the table. The two at the top pay for it.',
          edit: { set: { 'money.share.Group of Five': 0.22, 'money.share.Big 12': 0.18 },
            effects: { money: -1, access: 2, exposure: -1 },
            aimed: { SEC: { money: -3 }, 'Big Ten': { money: -3 },
              'Group of Five': { money: 3 }, 'Big 12': { money: 2 } } } },
        { id: 'concentrate', label: 'Follow the value',
          body: 'Pay out on what draws. It is defensible, it is what the networks are '
            + 'already doing, and it ends somewhere.',
          edit: { set: { 'money.share.SEC': 0.32, 'money.share.Big Ten': 0.32,
            'money.share.Group of Five': 0.06 },
            effects: { money: 2, access: -3, exposure: 2 },
            aimed: { SEC: { money: 3 }, 'Big Ten': { money: 3 },
              'Group of Five': { money: -3, access: -2 }, ACC: { money: -2 } } } },
      ],
      dials: [
        { id: 'pool', label: 'The pool, in billions', path: 'money.pool',
          base: 1.3, free: [1.3], pro: [1.0, 1.3, 1.6, 1.9, 2.2], step: 0.3,
          per: { money: 1.2, exposure: 0.3 } },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'revenue-share',
      beats: [WINTER, SPRING],
      weight: 5,
      when: (w) => w.labour.revShare < 0.3,
      eyebrow: 'The players',
      title: 'A cut for the players',
      brief: 'The question is no longer whether. Two courts and one bill have seen to that. '
        + 'What is left is how much, and whether you are the one who chose it or the one it '
        + 'was done to.',
      voices: [
        { id: 'Players', say: 'We are the product. Everyone in this room knows it.' },
        { id: 'Presidents', say: 'Whatever we agree, it has to survive a deposition.' },
        { id: 'SEC', say: 'It comes out of somebody\'s budget. Say whose.' },
      ],
      options: [
        { id: 'wait', label: 'Wait for the courts',
          body: 'Somebody else decides, later, and worse.',
          edit: { effects: { cost: 1, labour: -2, exposure: 3 },
            aimed: { Presidents: { exposure: -1 } } } },
        { id: 'share', label: 'Write a share into the formula',
          body: 'A fixed cut of the pool, paid out of the top. It ends the argument and '
            + 'starts a different one.',
          edit: { set: { 'labour.revShare': 0.2, 'labour.employment': 'contracted' },
            effects: { labour: 3, cost: 3, exposure: -3, money: -1 },
            aimed: { Players: { labour: 2 }, Presidents: { cost: -1 } } } },
        { id: 'employ', label: 'Make them employees',
          body: 'Say the quiet part. It is cleaner, it is more expensive, and it cannot be '
            + 'walked back.',
          edit: { set: { 'labour.employment': 'employee', 'labour.revShare': 0.25 },
            effects: { labour: 4, cost: 4, exposure: -2, tradition: -2 },
            aimed: { Presidents: { cost: -3, exposure: 1 }, Players: { labour: 3 } } } },
      ],
      dials: [
        { id: 'revShare', label: 'The players\' share', path: 'labour.revShare',
          base: 0.2, free: [0.15, 0.2], pro: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35],
          step: 0.05, per: { labour: 1.4, cost: 1.2, money: -0.6 } },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'raid',
      beats: [NOV, WINTER],
      weight: 4,
      /* THE GATE WAS WRONG AND THE TEST CAUGHT IT. It asked for a conference of fourteen or
         fewer to be the victim, which was true of the sport in 2014 and is true of nothing
         now: the smallest power conference in 2025 has sixteen. The item was unreachable in
         the world the mode actually opens in. What it really needs is two live conferences
         and somebody with enough members to lose two. */
      when: (w, L) => live(w, L).length >= 2 && live(w, L).some((c) => L.membersOf(w, c).length >= 6),
      /* WHO. Picked from the world rather than written down, because a raid on nobody in
         particular is a mood and not a ruling. The smallest live conference loses two to the
         largest, which is what actually happens and needs no author. Deterministic on the
         rng the beat was picked with, so the cast replays with the term. */
      cast: (w, L, rng) => {
        const order = live(w, L).slice().sort((a, b) => L.membersOf(w, a).length - L.membersOf(w, b).length);
        const from = order[0], to = order[order.length - 1];
        const roster = L.membersOf(w, from);
        const pick2 = [];
        const r = rng ? rng() : 0.5;
        pick2.push(roster[Math.floor(r * roster.length) % roster.length]);
        pick2.push(roster[(Math.floor(r * roster.length) + 1) % roster.length]);
        return { from, to, schools: pick2.filter((v, i, a) => a.indexOf(v) === i) };
      },
      eyebrow: 'Realignment',
      title: (c) => c ? c.schools.join(' and ') + ' have been approached' : 'Two schools have been approached',
      brief: (c) => 'It is November, so of course they have. ' + (c ? c.to : 'The conference taking them')
        + ' has made an offer and ' + (c ? c.from : 'the one losing them')
        + ' wants this office to stop it. Nobody has asked the schools.',
      voices: [
        { id: 'Big Ten', say: 'This office has no standing to block a school from leaving.' },
        { id: 'ACC', say: 'If you let this go there will not be a fourth conference.' },
        { id: 'Fans', say: 'They have played each other for a hundred years.' },
      ],
      options: [
        { id: 'allow', label: 'Stay out of it',
          body: 'Schools move. They always have. It is not this office\'s business and '
            + 'saying so is the whole job some days.',
          /* AND IT REALLY MOVES THEM. The first version of this had effects and no `move`,
             so the whole item was a mood: a player could allow a raid every November and the
             map never changed. Which is exactly the decoration the docket test is there to
             catch, in the one item most obviously about the map. */
          edit: (c) => ({ move: moveAll(c),
            effects: { autonomy: 2, tradition: -3, money: 1, exposure: -1 },
            aimed: { ACC: { autonomy: -2 }, Fans: { tradition: -2 } } }) },
        { id: 'block', label: 'Block it',
          body: 'Use the office. It works once.',
          edit: () => ({ effects: { autonomy: -3, tradition: 2, exposure: 3 },
            aimed: { ACC: { autonomy: 3 }, SEC: { autonomy: -2 }, 'Big Ten': { autonomy: -2 } } }) },
        { id: 'toll', label: 'Let them go, at a price',
          body: 'An exit fee that funds the conference losing them. Everybody leaves the '
            + 'room having lost something, which is what a settlement looks like.',
          edit: (c) => ({ move: moveAll(c),
            effects: { autonomy: -1, tradition: -1, money: 1, cost: -1 },
            aimed: { ACC: { money: 2 }, SEC: { cost: -1 }, 'Big Ten': { cost: -1 } } }) },
      ],
      dials: [],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'media-deal',
      beats: [SPRING, MEDIA],
      weight: 5,
      when: (w) => w.money.dealYears <= 2,
      eyebrow: 'The deal',
      title: 'The media rights are up',
      brief: 'Everything else you have done is about to be priced. The number that comes '
        + 'back is the number the next four years of arguments are conducted in.',
      voices: [
        { id: 'Networks', say: 'One negotiation, clean windows, and we can be generous.' },
        { id: 'Big Ten', say: 'We are entitled to negotiate our own inventory.' },
        { id: 'Fans', say: 'Not every game at eleven in the morning.' },
      ],
      options: [
        { id: 'one-deal', label: 'Sell it as one package',
          body: 'The sport negotiates together. The most money, and the least autonomy.',
          edit: { set: { 'money.dealYears': 7 },
            effects: { money: 3, inventory: 2, autonomy: -3 },
            aimed: { Networks: { inventory: 2 }, SEC: { autonomy: -2 }, 'Big Ten': { autonomy: -2 } } } },
        { id: 'per-conf', label: 'Let each conference sell its own',
          body: 'What is already happening, made official. The top two do very well.',
          edit: { set: { 'money.dealYears': 7 },
            effects: { money: 1, autonomy: 3, access: -2, inventory: -1 },
            aimed: { SEC: { money: 3 }, 'Big Ten': { money: 3 }, 'Group of Five': { money: -2 } } } },
        { id: 'streaming', label: 'Take the streaming money',
          body: 'More money now, a smaller audience, and a generation that finds the sport '
            + 'somewhere else or does not find it.',
          edit: { set: { 'money.dealYears': 7, 'posture.tvWindows': 8 },
            effects: { money: 3, inventory: 1, tradition: -3 },
            aimed: { Fans: { tradition: -2 }, Networks: { inventory: -1 } } } },
      ],
      dials: [
        { id: 'windows', label: 'Broadcast windows', path: 'posture.tvWindows',
          base: 5, free: [4, 5, 6], pro: [3, 4, 5, 6, 7, 8, 9],
          per: { inventory: 0.8, money: 0.5, tradition: -0.7 } },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'portal',
      beats: [PORTAL],
      weight: 4,
      when: () => true,
      eyebrow: 'The roster',
      title: 'The transfer window',
      brief: 'Coaches say they cannot build a team. Players say they are the only people in '
        + 'the sport who are told where to work. Both are describing the same window.',
      voices: [
        { id: 'Players', say: 'Everybody else in this building can leave for a better job.' },
        { id: 'Presidents', say: 'Our compliance offices cannot keep up with this.' },
        { id: 'Fans', say: 'We do not know who is on our own team.' },
      ],
      options: [
        { id: 'one-window', label: 'One window, and shut it early',
          body: 'Coaches get a roster. Players get less of a choice.',
          edit: { set: { 'labour.portalWindows': 1 },
            effects: { labour: -2, tradition: 2, cost: -1 },
            aimed: { Players: { labour: -2 }, Fans: { tradition: 1 } } } },
        { id: 'keep', label: 'Leave the windows as they are',
          body: 'Nobody is happy and nobody is furious.',
          edit: { effects: {} } },
        { id: 'open', label: 'Open it up',
          body: 'Move when you like, sign where you like. It is a labour market and it '
            + 'will behave like one.',
          edit: { set: { 'labour.portalWindows': 4 },
            effects: { labour: 3, tradition: -2, exposure: -2, cost: 1 },
            aimed: { Players: { labour: 2 }, Fans: { tradition: -1 } } } },
      ],
      dials: [
        { id: 'windows', label: 'Windows a year', path: 'labour.portalWindows',
          base: 2, free: [1, 2, 3], pro: [0, 1, 2, 3, 4, 6],
          per: { labour: 0.9, tradition: -0.5 } },
        { id: 'eligibility', label: 'Years of eligibility', path: 'labour.eligibility',
          base: 4, free: [4], pro: [3, 4, 5, 6],
          per: { labour: 0.7, inventory: 0.4, cost: 0.5 } },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'conf-games',
      beats: [WINTER, MEDIA],
      weight: 3,
      when: () => true,
      eyebrow: 'The schedule',
      title: 'How many conference games',
      brief: 'Nine is harder and worth more. Eight is safer and sells a cupcake in '
        + 'September. The two biggest conferences do not do the same thing and both '
        + 'think theirs is the standard.',
      voices: [
        { id: 'Networks', say: 'Nine. Every time. The extra one is worth more than the other.' },
        { id: 'SEC', say: 'We are not adding a loss to help somebody else\'s ranking.' },
        { id: 'Group of Five', say: 'Those non-conference games are our whole budget.' },
      ],
      options: [
        { id: 'eight', label: 'Eight, everywhere',
          body: 'Softer schedules, more bought games, more nine-win teams.',
          edit: { set: { 'rules.confGames': 8 },
            effects: { inventory: -2, access: 1, money: -1 },
            aimed: { 'Group of Five': { money: 2 }, Networks: { inventory: -2 } } } },
        { id: 'nine', label: 'Nine, everywhere',
          body: 'One more real game a year for everybody, and one fewer payday for the '
            + 'schools that need it.',
          edit: { set: { 'rules.confGames': 9 },
            effects: { inventory: 2, tradition: 1, money: 1 },
            aimed: { 'Group of Five': { money: -2 }, Networks: { inventory: 2 }, SEC: { access: -1 } } } },
        { id: 'leave', label: 'Let each conference decide',
          body: 'The status quo, which is that they already do.',
          edit: { effects: { autonomy: 2, exposure: 1 } } },
      ],
      dials: [],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'gambling',
      beats: [SEPT, OCT],
      weight: 3,
      when: (w) => w.posture.gambling !== 'banned',
      eyebrow: 'The betting',
      title: 'A game is under review',
      brief: 'Three second-half line moves and a player who has stopped answering his '
        + 'phone. The sport takes money from the same companies whose data flagged it.',
      voices: [
        { id: 'Presidents', say: 'We cannot be taking their money and investigating them.' },
        { id: 'Networks', say: 'The integrity story is worse for us than the betting is.' },
        { id: 'Players', say: 'Our names and numbers are on those apps. We saw none of it.' },
      ],
      options: [
        { id: 'partner', label: 'Deepen the partnership',
          body: 'Their data catches more than yours does. Take the money and the monitoring '
            + 'together.',
          edit: { set: { 'posture.gambling': 'partnered' },
            effects: { money: 2, exposure: 2, tradition: -2 },
            aimed: { Presidents: { exposure: -2 }, Players: { labour: -1 } } } },
        { id: 'wall', label: 'Wall it off',
          body: 'Keep the money, end the marketing, hand the monitoring to somebody with '
            + 'no stake in the outcome.',
          edit: { effects: { exposure: -1, tradition: 1, money: -1 } } },
        { id: 'ban', label: 'Cut it off entirely',
          body: 'No sponsorship, no data deals, no odds on the broadcast. The money goes '
            + 'and the problem does not, because it never lived here.',
          edit: { set: { 'posture.gambling': 'banned' },
            effects: { money: -3, exposure: -3, tradition: 3 },
            aimed: { Fans: { tradition: 2 }, Presidents: { exposure: 2 }, Networks: { money: -2 } } } },
      ],
      dials: [],
    },
  ];

  const BY_ID = {};
  ITEMS.forEach((it) => { BY_ID[it.id] = it; });

  /* WHAT COULD LAND ON THIS DESK, THIS BEAT. Gated on the world rather than on a counter, so
     a sport that has already expanded to sixteen is not asked to do it again and a deal with
     four years left is not on the table. `L` is the ledger module, passed in rather than
     required, so this file stays dependency-free and testable on a fake world. */
  function eligible(world, L) {
    return ITEMS.filter((it) => {
      if (it.beats.indexOf(world.beat) < 0) return false;
      try { return it.when(world, L); } catch (e) { return false; }
    });
  }

  /* The item for a beat, picked from what is eligible, weighted, and deterministic on the
     world's own seed and clock. Two players with the same seed get the same term, which is
     what makes a term replayable and therefore testable. */
  function pick(world, L, rng) {
    const pool = eligible(world, L);
    if (!pool.length) return null;
    const total = pool.reduce((t, it) => t + (it.weight || 1), 0);
    let r = (rng ? rng() : 0.5) * total;
    for (const it of pool) { r -= (it.weight || 1); if (r <= 0) return it; }
    return pool[pool.length - 1];
  }

  /* WHAT A DIAL IS ALLOWED TO BE, which is the whole of the tier split and it lives here
     rather than in the page so nothing on screen has to remember the rule. */
  function settings(dial, pro) {
    return (pro ? dial.pro : dial.free) || dial.free || [];
  }

  /* ONE RULING, AS ONE LEDGER EDIT. The option supplies the shape and the dials move it,
     which is why a dial is not decoration: turning the autobids from five to seven really
     is a different ruling with a different push, and the room feels the difference.

     `dialValues` is {dialId: value}. Anything missing takes the dial's base, so a caller
     that has not built a dial UI yet still produces a legal ruling. */
  function resolve(item, optionId, dialValues, cast) {
    const option = (item.options || []).find((o) => o.id === optionId);
    if (!option) throw new Error('docket: no option "' + optionId + '" on "' + item.id + '"');
    /* AN EDIT MAY BE A FUNCTION OF THE CAST, because some rulings are about somebody in
       particular and who that is comes out of the world rather than out of this file. The
       cast is computed once per beat and the prose and the ruling both read it, so the two
       schools named in the brief are the two schools the map moves. */
    const base = (typeof option.edit === 'function' ? option.edit(cast, item) : option.edit) || {};
    const edit = {
      id: item.id + ':' + option.id,
      label: item.title + ', ' + option.label.toLowerCase(),
      set: Object.assign({}, base.set || {}),
      move: Object.assign({}, base.move || {}),
      effects: Object.assign({}, base.effects || {}),
      aimed: {},
    };
    for (const b in base.aimed || {}) edit.aimed[b] = Object.assign({}, base.aimed[b]);

    for (const dial of item.dials || []) {
      const v = (dialValues || {})[dial.id];
      if (v == null) continue;
      edit.set[dial.path] = v;
      /* How far the dial was moved, in steps, so the push is proportional rather than a
         flat bonus for having touched it. */
      const steps = (v - dial.base) / (dial.step || 1);
      if (!steps) continue;
      for (const axis in dial.per || {}) {
        edit.effects[axis] = (edit.effects[axis] || 0) + dial.per[axis] * steps;
      }
      for (const bloc in dial.aim || {}) {
        edit.aimed[bloc] = edit.aimed[bloc] || {};
        for (const axis in dial.aim[bloc]) {
          edit.aimed[bloc][axis] = (edit.aimed[bloc][axis] || 0) + dial.aim[bloc][axis] * steps;
        }
      }
    }
    /* Rounded, because a dial can produce a long tail and the numbers are shown. */
    for (const a in edit.effects) edit.effects[a] = Math.round(edit.effects[a] * 100) / 100;
    for (const b in edit.aimed) {
      for (const a in edit.aimed[b]) edit.aimed[b][a] = Math.round(edit.aimed[b][a] * 100) / 100;
    }
    return edit;
  }

  /* The prose, which may also need the cast. Static strings pass straight through, so most
     items never think about this. */
  const castOf = (item, world, L, rng) => (item.cast ? item.cast(world, L, rng) : null);
  const text = (v, cast, item) => (typeof v === 'function' ? v(cast, item) : v);

  const publicAPI = { ITEMS, BY_ID, BEATS: { WINTER, PORTAL, SPRING, MEDIA, SEPT, OCT, NOV, CHAMP, PLAYOFF },
    eligible, pick, resolve, settings, castOf, text };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.PS_CFB_DOCKET = publicAPI;
})();
