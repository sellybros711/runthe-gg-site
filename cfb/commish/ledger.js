/*
 * ledger.js - the world Commish Simulator governs.
 *
 * THE LEDGER IS THE SPORT, NOT A SCORE. Every other game in this repo keeps a run and adds
 * numbers to it. This one keeps a description of college football and lets the player edit
 * it: who is in which conference, how many teams play for the title, how the money splits,
 * what a player is owed. A ruling does not award points, it changes one of those, and every
 * later beat reads the change.
 *
 * WHICH IS THE ONLY REASON THE MODE IS NOT A QUIZ. A decision that moves a meter is a
 * quiz question with a nicer costume: nothing downstream can tell what you chose. A
 * decision that edits the ledger is different in kind, because the next docket, the bloc
 * reactions and eventually the season simulation all read the same fields.
 *
 * SO AN UNKNOWN FIELD IS AN ERROR, LOUDLY. applyEdit throws on a path the world does not
 * have. That is the whole guard against the failure this design is most likely to die of:
 * a ruling that says it moves the revenue share, quietly writes to money.shair, and leaves
 * a player making decisions that do nothing at all. Nothing downstream would notice, and
 * neither would a test that only checked the meters moved.
 *
 * PURE, AND PLAIN DATA THROUGHOUT. applyEdit returns a new world rather than mutating one,
 * so a beat can be previewed without being committed (which is what Football President's
 * "test a policy against the Council" is, and it is their best idea). And a world is JSON
 * with no functions and no dates in it, so it serialises the way a run does and the save
 * file is the world itself.
 *
 * Headless and dependency-free, so a whole term can be simulated in node with no UI.
 * Browser: window.PS_CFB_LEDGER. Node: require('./ledger.js').
 */
(function () {
  'use strict';

  /* ---------------- the axes ----------------
     WHAT A RULING IS MADE OF, and the reason nine blocs do not need nine hand-written
     reactions per docket item. A ruling emits a push along these eight axes; a bloc holds
     a weight on each; what it thinks is the two multiplied together. Add a docket item and
     every bloc has an opinion about it for free, in character, without anybody writing one.

     Positive is always the direction the name implies: +money is more money moving, +access
     is an easier path to the playoff, +labour is better for the players. */
  /* THE LAST ONE IS NAMED FOR WHAT IT DOES, after the first name fooled the person who
     wrote it. It was `risk`, which reads as "how risky is this" and therefore as a thing a
     careful ruling has less of. But the blocs weight it as a quantity that GOES UP, so
     `risk: -3` meant a safer sport, and the first test written against it asked for a
     reckless ruling and got a cautious one with the fuses at zero. `exposure` cannot be
     read the other way: more of it is more trouble, and almost every weight on it is
     negative because almost nobody in the room wants any. */
  const AXES = ['money', 'access', 'autonomy', 'cost', 'tradition', 'inventory', 'labour', 'exposure'];

  /* ---------------- the starting world ---------------- */

  /* The four that vote, plus the one that does not get a vote and is most of the sport. The
     order is the order they are shown in, and it is deliberate: the two that can remove you
     are first, so a player reads the room from the top. */
  const POWERS = ['SEC', 'Big Ten', 'ACC', 'Big 12'];

  /* An even split is not what college football does, and starting from one would make the
     first revenue decision look like a fall from grace rather than a choice. These are the
     shares as a fraction of the pool, and they add to 1 with the Group of Five last. */
  const OPENING_SHARE = { SEC: 0.27, 'Big Ten': 0.27, ACC: 0.16, 'Big 12': 0.16, 'Group of Five': 0.14 };

  function createWorld(opts) {
    const o = opts || {};
    const year = o.year || 2025;
    return {
      version: 1,
      seed: o.seed || 0,
      startYear: year,
      year,
      /* 0..8, the nine beats of the calendar. See the plan doc. */
      beat: 0,
      /* school -> conference, for the year in play. The caller supplies it from the game's
         own team data, so the world starts as the sport really was rather than as a table
         somebody typed twice. */
      membership: Object.assign({}, o.membership || {}),

      playoff: {
        teams: 12,
        byes: 4,
        /* How many of the seats are guaranteed to a conference champion rather than
           selected. The number the whole access argument is about. */
        autobids: 5,
        /* 'committee' | 'ranking' | 'formula' */
        selection: 'committee',
        /* 'campus' | 'neutral' | 'mixed' */
        sites: 'mixed',
      },

      money: {
        /* Billions a year, which is the unit the real arguments are conducted in. */
        pool: 1.3,
        share: Object.assign({}, OPENING_SHARE),
        /* Years left on the deal. It running out is a beat, not a surprise. */
        dealYears: 6,
      },

      labour: {
        /* 'none' | 'collectives' | 'school-paid' */
        nil: 'collectives',
        /* Fraction of the pool that reaches the players. */
        revShare: 0,
        /* 'amateur' | 'contracted' | 'employee' */
        employment: 'amateur',
        portalWindows: 2,
        eligibility: 4,
      },

      rules: {
        confGames: 9,
        clock: 'running',
        replay: 'full',
        overtime: 'twopoint',
        targeting: 'strict',
      },

      posture: {
        /* 'banned' | 'permitted' | 'partnered' */
        gambling: 'permitted',
        tvWindows: 5,
        bowlTieIns: true,
        nonRevGuarantee: true,
      },

      /* NOT METERS. These do not tick down, they go off. Washington and the courts are the
         actor with no satisfaction number: you cannot please them, only avoid them. */
      pressure: { legal: 0, congress: 0, union: 0 },
      /* HOW MANY TIMES EACH HAS ALREADY GONE OFF. A fuse that fires once is an event; one
         that fires every beat once it is lit is a broken screen, so firing resets the
         pressure and this counts the scars. It is also what a second lawsuit is worse than
         a first one because of. */
      fired: { legal: 0, congress: 0, union: 0 },

      /* 0..100, all three. Revenue is what the sport makes, health is whether it is still
         worth watching, standing is whether the room still wants you. */
      meters: { revenue: 55, health: 62, standing: 60 },

      /* 0..100 satisfaction. Everybody starts wary rather than happy: a commissioner
         arrives owing favours, not holding them. */
      blocs: {
        SEC: 52, 'Big Ten': 52, ACC: 48, 'Big 12': 46, 'Group of Five': 40,
        Networks: 55, Players: 38, Presidents: 55, Fans: 50,
      },

      /* Every ruling, in order, so a term can be read back and a legacy card written from
         something other than the final numbers. */
      history: [],
      /* Set when the term ends, with why. Null while it is still running. */
      outcome: null,
    };
  }

  /* Real membership for a year, off the game's own team data. Kept here rather than in a
     second data file so there is one source for what conference a school was in, and it is
     the one the draft game already plays from. */
  function membershipFrom(teamSeasons, year) {
    const out = {};
    for (const t of teamSeasons || []) {
      if (Number(t.season) === Number(year)) out[t.school] = t.conference;
    }
    return out;
  }

  /* ---------------- reading the world ---------------- */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function getPath(world, path) {
    let cur = world;
    for (const key of String(path).split('.')) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[key];
    }
    return cur;
  }

  function membersOf(world, conference) {
    return Object.keys(world.membership).filter((s) => world.membership[s] === conference).sort();
  }
  function conferencesIn(world) {
    const seen = {};
    for (const s in world.membership) seen[world.membership[s]] = (seen[world.membership[s]] || 0) + 1;
    return seen;
  }
  /* A conference that cannot fill its own schedule is gone, and the sport has to notice: it
     is what "the Pac-12 collapsed" means as a fact rather than as a headline.
     FOUR IS THE BAR, and it is not a feeling. The real Pac-12 was down to two members in
     2024 and everybody called it dead; the data in this repo says two. Below four there is
     no round robin and no championship game, so there is nothing left that behaves like a
     conference whatever the name on the door still says. */
  const MIN_CONFERENCE = 4;
  function isDefunct(world, conference) {
    return membersOf(world, conference).length < MIN_CONFERENCE;
  }

  /* ---------------- editing the world ---------------- */

  /* THE ONE WAY THE WORLD CHANGES. An edit is data:
       { id, set:{path:value}, move:{school:conference}, effects:{axis:n}, aimed:{bloc:{axis:n}} }
     `set` writes fields, `move` writes membership, `effects` is what the room feels, and
     `aimed` is the part one bloc feels that the others do not.

     Returns a NEW world. A caller previewing a ruling and a caller committing one run the
     same code, which is the only way a preview can be trusted to be true. */
  function applyEdit(world, edit) {
    const next = JSON.parse(JSON.stringify(world));
    const e = edit || {};

    for (const path in e.set || {}) {
      /* THE GUARD. A path the world does not have is a ruling that does nothing, and a
         ruling that does nothing is indistinguishable from a working one until somebody
         plays forty beats and wonders why the sport never changed. */
      if (getPath(next, path) === undefined) {
        throw new Error('ledger: no such field "' + path + '"');
      }
      const parts = String(path).split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = e.set[path];
    }

    for (const school in e.move || {}) {
      if (!(school in next.membership)) {
        throw new Error('ledger: no such school "' + school + '"');
      }
      next.membership[school] = e.move[school];
    }

    /* The shares have to keep adding to one, whatever a ruling did to them, or the pool
       quietly grows or shrinks and nobody notices until the money stops meaning anything. */
    if (e.set && Object.keys(e.set).some((k) => k.indexOf('money.share.') === 0)) {
      normaliseShare(next.money.share);
    }

    next.history.push({
      year: next.year, beat: next.beat,
      id: e.id || null, label: e.label || null,
      effects: Object.assign({}, e.effects || {}),
    });
    return next;
  }

  function normaliseShare(share) {
    let total = 0;
    for (const k in share) { share[k] = Math.max(0, Number(share[k]) || 0); total += share[k]; }
    if (total <= 0) return;
    for (const k in share) share[k] = Math.round(share[k] / total * 1000) / 1000;
  }

  /* ---------------- what an edit does to the numbers ----------------
     The blocs' own reaction lives in blocs.js, because who feels what is a question about
     the blocs. What is here is the part that belongs to the world: the three meters and the
     three fuses.

     THE METERS ARE NOT A BLOC. Revenue is not anybody's opinion, it is what the sport makes,
     so it reads the effect vector directly rather than averaging what the room said. Health
     is the one that erodes quietly: tradition and competitive access feed it, and neither
     is anybody's first concern in the room, which is exactly why a sport run by the room
     loses it. */
  const METER_WEIGHT = {
    revenue: { money: 2.2, inventory: 1.8, cost: -1.4, tradition: -0.2, access: 0.3 },
    health: { tradition: 1.6, access: 1.4, labour: 0.8, inventory: 0.4, money: -0.5, exposure: -0.6 },
  };

  function applyOutcome(world, edit, blocDeltas) {
    const next = JSON.parse(JSON.stringify(world));
    const fx = (edit && edit.effects) || {};
    const dot = (w) => AXES.reduce((t, a) => t + (w[a] || 0) * (fx[a] || 0), 0);

    next.meters.revenue = clamp(next.meters.revenue + dot(METER_WEIGHT.revenue), 0, 100);
    next.meters.health = clamp(next.meters.health + dot(METER_WEIGHT.health), 0, 100);

    for (const bloc in blocDeltas || {}) {
      if (next.blocs[bloc] == null) continue;
      next.blocs[bloc] = clamp(next.blocs[bloc] + blocDeltas[bloc], 0, 100);
    }

    /* STANDING IS NOT A METER YOU SPEND, IT IS THE ROOM'S OPINION OF YOU. It is derived
       from the blocs that hold a vote rather than set directly, so there is no way to buy
       it except by keeping somebody happy. The two that can remove you count double, which
       is the same fact the coalition rule states from the other end. */
    next.meters.standing = clamp(standingFrom(next.blocs), 0, 100);

    /* The fuses. Risk is the axis nobody in the room is paid to care about, so it is the
       one a commissioner walks into. */
    /* THE GAINS WERE TOO SMALL TO REACH ANYTHING. Measured across a hundred and twenty terms
       of random rulings, the highest any pressure ever got was 44 out of 100 and the average
       at the end of a term was thirteen. There was no threshold a fuse could have had that
       would ever have fired, so the three of them sat on the office screen for a whole term
       being decorative. Set so that a commissioner who keeps taking the risky option lights
       one inside a term and a careful one does not. */
    next.pressure.legal = clamp(next.pressure.legal + (fx.exposure || 0) * 3.4, 0, 100);
    next.pressure.congress = clamp(next.pressure.congress
      + (fx.exposure || 0) * 1.8 + Math.max(0, -(fx.access || 0)) * 1.5, 0, 100);
    next.pressure.union = clamp(next.pressure.union
      + Math.max(0, -(fx.labour || 0)) * 3.2, 0, 100);
    return next;
  }

  const VOTE_WEIGHT = { SEC: 2, 'Big Ten': 2, ACC: 1, 'Big 12': 1, 'Group of Five': 0.5, Presidents: 1.5 };
  function standingFrom(blocs) {
    let num = 0, den = 0;
    for (const b in VOTE_WEIGHT) {
      if (blocs[b] == null) continue;
      num += blocs[b] * VOTE_WEIGHT[b];
      den += VOTE_WEIGHT[b];
    }
    return den ? num / den : 50;
  }

  /* ---------------- losing the job ----------------
     TWO WAYS, AND NEITHER IS A BAR REACHING ZERO. Football President's rule is the good one
     and this is it: lose the two that hold the inventory and you are gone whatever the
     other numbers say, because they can leave and take the sport with them. The vote is the
     slower one, and it can be survived if the blocs you kept are the ones that turn up. */
  const HOSTILE = 25;

  function coalition(world) {
    return POWERS.concat(['Presidents']).filter((b) => (world.blocs[b] || 0) < HOSTILE);
  }
  /* THE VOTE IS COUNTED, NOT AVERAGED. It read `standing < 20` first, which is a derived
     number and therefore a second rule that had to be kept in step with this one by hand:
     a room where every single member was hostile came out at 20.5 and kept the
     commissioner in the job. Counting the weight that has actually turned says the thing
     the design says out loud everywhere else, which is that this mode is about votes rather
     than points. */
  function hostileWeight(world) {
    let t = 0;
    for (const b in VOTE_WEIGHT) if ((world.blocs[b] || 0) < HOSTILE) t += VOTE_WEIGHT[b];
    return t;
  }
  function totalWeight() {
    let t = 0;
    for (const b in VOTE_WEIGHT) t += VOTE_WEIGHT[b];
    return t;
  }
  function removal(world) {
    const angry = coalition(world);
    const bigTwo = angry.indexOf('SEC') >= 0 && angry.indexOf('Big Ten') >= 0;
    if (bigTwo) {
      return { removed: true, reason: 'coalition',
        say: 'The SEC and the Big Ten moved together, and once those two are in a room without '
          + 'you the rest of the board is decoration. It took one phone call and a Tuesday.' };
    }
    if (hostileWeight(world) > totalWeight() / 2) {
      return { removed: true, reason: 'vote',
        say: 'The presidents called a vote. It was not close, and two of them had the statement '
          + 'written before the meeting started.' };
    }
    return { removed: false, angry };
  }

  /* WHERE A FUSE GOES OFF. Not a hundred, because a fuse is not a meter being filled: the
     point at which a lawsuit is filed or a hearing is scheduled is a point somebody else
     chooses, and it is well short of the sport being completely on fire. */
  const FUSE_LIMIT = 46;
  const FUSES = ['legal', 'congress', 'union'];
  /* Which ones have gone off and are waiting to be dealt with. */
  function lit(world) {
    return FUSES.filter((k) => (world.pressure[k] || 0) >= FUSE_LIMIT);
  }
  /* FIRING RESETS IT, AND NOT TO ZERO. A lawsuit that has been filed stops being a threat
     and starts being a fact, but the conditions that produced it are still there. */
  function defuse(world, key) {
    const next = JSON.parse(JSON.stringify(world));
    next.pressure[key] = Math.min(next.pressure[key], 26);
    next.fired = next.fired || { legal: 0, congress: 0, union: 0 };
    next.fired[key] = (next.fired[key] || 0) + 1;
    return next;
  }

  const BEATS = ['Winter meetings', 'Portal and signing day', 'Spring', 'Media days',
    'September', 'October', 'November', 'Championship weekend', 'The playoff'];

  /* Move the clock on. The season rolls at the end of the ninth beat, which is the point
     the year in review lands and the consequences of the whole year come due. */
  function advance(world) {
    const next = JSON.parse(JSON.stringify(world));
    next.beat++;
    if (next.beat >= BEATS.length) { next.beat = 0; next.year++; next.money.dealYears--; }
    return next;
  }

  const publicAPI = {
    AXES, POWERS, BEATS, HOSTILE, OPENING_SHARE, VOTE_WEIGHT,
    FUSE_LIMIT, FUSES, lit, defuse,
    createWorld, membershipFrom,
    getPath, membersOf, conferencesIn, isDefunct,
    applyEdit, applyOutcome, normaliseShare, standingFrom,
    coalition, removal, advance, hostileWeight, totalWeight, MIN_CONFERENCE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.PS_CFB_LEDGER = publicAPI;
})();
