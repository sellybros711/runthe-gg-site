/*
 * media.js - the questions you take standing up.
 *
 * THE DESK IS NOT THE JOB. Nine beats a year, one item each, and every one of them arrives
 * as a folder with three prepared answers in it and a forecast button beside them. That is
 * what governing looks like from the inside and it is about half of what a commissioner
 * actually does. The other half is standing at a lectern in a hotel ballroom in July with a
 * room full of people whose job is to make you say something you did not plan to say.
 *
 * SO THIS IS THE DESK'S OPPOSITE, ON PURPOSE, and every difference is deliberate:
 *
 *   the desk                          the podium
 *   one item, chosen for you          three questions, and they are about YOU
 *   a forecast button                 nothing. You answer on your feet
 *   a ruling that edits the ledger    words, which edit nobody's schedule
 *   the room reacts to the change     the room reacts to what you said about it
 *
 * WORDS MOVE THE ROOM AND NOTHING ELSE. A press conference does not change the revenue the
 * sport makes or the health of the game, so this never touches the meters and never lights a
 * fuse. It moves the blocs, standing follows from the blocs, and that is the whole of it.
 * The rule is worth stating because the alternative is tempting and wrong: routing an answer
 * through applyOutcome would let a commissioner talk the sport into more money, which is the
 * one thing a lectern has never done for anybody.
 *
 * EXCEPT THAT A PROMISE IS NOT NOTHING. Some answers plant a thread, which is the mode's
 * existing machinery for a thing that comes back: say out loud that you will look at it and
 * an item lands on your desk a year later with your own sentence quoted at the top of it.
 * That is the one way a press conference reaches the ledger, and it reaches it the long way
 * round, through a decision you still have to make. See the `promise` field, and the four
 * `pay-said` items in docket.js that collect on them.
 *
 * EVERY QUESTION IS GATED ON THE SPORT YOU HAVE MADE. `when` reads the ledger exactly the
 * way a docket item's does, so nobody asks about the revenue share until there is one, and
 * the year after you cut a conference's money somebody from that conference's own market is
 * at a microphone asking why. A question that could be asked of any commissioner in any year
 * is a question worth cutting, and the two general ones that survive are weighted last.
 *
 * NO NAMED PEOPLE, the same rule the docket runs under. A reporter is a desk and a beat, not
 * a byline, and a player is a position and a number of years. Schools are named, because a
 * school is a fact this repo already holds.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_MEDIA. Node: require('./media.js').
 */
(function () {
  'use strict';

  /* HOW MANY YOU TAKE. Three is the number that makes the room feel like a room: one is an
     exchange, two is a pattern, three is somebody deciding what to ask you next based on how
     you answered the last one. It is also about the weight of one ruling, which is the
     balance this is aiming at. */
  const ASKED = 3;

  /* ---- WHO IS HOLDING THE MICROPHONE ----
     Not a byline. A desk, a beat and a reason for asking, which is the part that changes what
     the question means: the same sentence from the network that pays for the sport and from a
     student paper is two different questions, and the answer that works on one of them is the
     answer that gets you in trouble with the other. */
  const ASKERS = {
    beat: { name: 'A beat writer', tone: 'has covered one school for eleven years and knows the buildings' },
    national: { name: 'A national columnist', tone: 'writes the piece everybody quotes on Monday' },
    radio: { name: 'A morning radio host', tone: 'three hours a day in the biggest market in the sport' },
    student: { name: 'A student paper', tone: 'the only person in the room the same age as the players' },
    tv: { name: 'Your own broadcaster', tone: 'works for the network that pays for all of this' },
    wire: { name: 'A wire reporter', tone: 'no adjectives, and it runs in four hundred papers' },
    legal: { name: 'A reporter who covers the courts', tone: 'has read every filing and does not care about football' },
    local: { name: 'A local television reporter', tone: 'here for a ninety second package that leads the six' },
  };

  /* ---- reading the world, in the ways several questions want ---- */

  const pct = (n) => Math.round(n * 100) + '%';
  const bn = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2) + 'B';

  /* WHOSE MONEY MOVED, against the split this office inherited rather than against an even
     one. A commissioner who has changed nothing has no loser here and the questions that read
     this are gated off, which is correct: nobody asks you about a decision you did not make. */
  function shareMoves(world, L) {
    const open = (L && L.OPENING_SHARE) || {};
    const now = (world.money && world.money.share) || {};
    return Object.keys(open).map((c) => ({ conf: c, from: open[c], to: now[c] || 0,
      by: (now[c] || 0) - open[c] }))
      .sort((a, b) => a.by - b.by);
  }
  function biggestLoser(world, L) {
    const m = shareMoves(world, L)[0];
    return m && m.by <= -0.005 ? m : null;
  }
  function biggestWinner(world, L) {
    const a = shareMoves(world, L);
    const m = a[a.length - 1];
    return m && m.by >= 0.005 ? m : null;
  }

  /* TWO REAL SCHOOLS, from different conferences, off the membership the world is actually
     carrying. Deterministic on the seed and the year, so a press conference replays with the
     same names in it. The portal question needs a pair and a made-up pair would be the one
     thing on this screen that is not true. */
  function pairOf(world, salt) {
    const all = Object.keys(world.membership || {}).sort();
    if (all.length < 2) return null;
    const h = hash(String(world.seed || 0) + '|' + world.year + '|' + (salt || ''));
    const a = all[h % all.length];
    let b = null;
    for (let i = 1; i < all.length; i++) {
      const cand = all[(h + i * 7) % all.length];
      if (cand !== a && world.membership[cand] !== world.membership[a]) { b = cand; break; }
    }
    if (!b) b = all[(h + 1) % all.length];
    return b && b !== a ? { from: a, to: b, fromConf: world.membership[a], toConf: world.membership[b] } : null;
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i); h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* ---- THE QUESTIONS ----
     Three answers each, and they are not a good one and two bad ones. The shapes that recur,
     so a player learns to read a lectern the way they learn to read a docket:

       say the true thing      costs you whoever it indicts, and the room believes you after
       say the office thing    costs nothing, gains nothing, and the fans hear it
       pick the fight          one bloc loves you for a year and one does not forget

     A fourth shape turns up on about a third of them: the answer that PROMISES something. It
     is the best answer in the room and the bill arrives on your desk eighteen months later. */
  const QUESTIONS = [

    /* ================================================================
       THE MONEY YOU MOVED
       ================================================================ */
    {
      id: 'q-share-cut',
      weight: 9,
      who: 'local',
      when: (w, L) => !!biggestLoser(w, L),
      cast: (w, L) => biggestLoser(w, L),
      desk: (c) => 'from the ' + c.conf + ' footprint',
      ask: (c) => 'You took ' + Math.round(Math.abs(c.by) * 1000) / 10 + ' points of the pool off the '
        + c.conf + '. That is real money in towns where the athletic department is the third '
        + 'biggest employer. What do I tell them tonight?',
      answers: [
        { id: 'own', label: 'Own it',
          body: 'Say the quiet part at the microphone: the money went where the audience went, '
            + 'you decided that, and you would decide it again.',
          wrote: 'The commissioner said the money follows the audience and declined to soften it.',
          effects: { money: 1.4, autonomy: 1.2, access: -1.2, tradition: -0.8 },
          aimed: { SEC: { autonomy: 1.4 }, 'Big Ten': { autonomy: 1.2 },
            'Group of Five': { access: -1.6 }, Fans: { tradition: -1.2 } } },
        { id: 'process', label: 'Point at the formula',
          body: 'It was not a decision about anybody, it was a formula, and the formula is '
            + 'published. Nobody has ever been comforted by this answer and nobody has ever '
            + 'been able to argue with it either.',
          wrote: 'Asked about the cut, the commissioner described the process twice and the effect never.',
          effects: { autonomy: 0.4, tradition: -0.4, exposure: -0.6 },
          aimed: { Presidents: { exposure: -0.8 }, Fans: { tradition: -1.4 } } },
        { id: 'floor', label: 'Promise a floor',
          body: 'Say out loud that no league is going below a number, and that you will bring '
            + 'the number to the winter meetings. You have just written yourself an item.',
          wrote: 'The commissioner promised a distribution floor and gave a date for it.',
          effects: { access: 1.6, cost: 1.2, money: -0.6, labour: 0.4 },
          aimed: { 'Group of Five': { access: 2.4 }, ACC: { access: 1.2 },
            SEC: { money: -1.4 }, 'Big Ten': { money: -1.2 } },
          promise: { id: 'said-floor', wait: [7, 14],
            note: 'A distribution floor you promised at a lectern' } },
      ],
    },
    {
      id: 'q-share-gain',
      weight: 6,
      who: 'national',
      when: (w, L) => !!biggestWinner(w, L) && !!biggestLoser(w, L),
      cast: (w, L) => ({ up: biggestWinner(w, L), down: biggestLoser(w, L) }),
      desk: () => 'and has written the same column for three commissioners',
      ask: (c) => 'The ' + c.up.conf + ' is up and the ' + c.down.conf + ' is down, and the '
        + c.up.conf + ' is also the league that can end your term with a phone call. I am not '
        + 'accusing you of anything. I am asking you to hear how it sounds.',
      answers: [
        { id: 'hear', label: 'Say you hear it',
          body: 'Agree that it sounds exactly like that, and say the alternative was a league '
            + 'leaving and taking the sport with it. Honest, and it concedes you were leant on.',
          wrote: 'The commissioner conceded the optics and said the alternative was worse.',
          effects: { autonomy: -1.4, exposure: 0.6, tradition: 0.4 },
          aimed: { SEC: { autonomy: -1.2 }, 'Big Ten': { autonomy: -1.2 },
            Fans: { tradition: 1.4 }, Players: { labour: 0.6 } } },
        { id: 'deny', label: 'Reject the premise',
          body: 'Nobody leans on this office. Say it flatly, in the room, on the record, and '
            + 'let the two leagues who did lean on you hear you say it.',
          wrote: 'The commissioner said no conference has ever pressured the office. The room laughed.',
          effects: { autonomy: 1.8, exposure: 1.2 },
          aimed: { SEC: { autonomy: -1 }, 'Big Ten': { autonomy: -1 },
            Presidents: { exposure: -1.4 }, Fans: { tradition: -0.8 } } },
        { id: 'numbers', label: 'Give them the arithmetic',
          body: 'Windows, ratings, households. It is the true reason and it is also the reason '
            + 'that sounds most like a company. Both of those things are usually the case.',
          wrote: 'The commissioner answered a question about influence with four ratings numbers.',
          effects: { money: 1.2, inventory: 0.8, tradition: -0.6 },
          aimed: { Networks: { inventory: 1.4 }, Fans: { tradition: -1 } } },
      ],
    },

    /* ================================================================
       WHAT THE PLAYERS ARE OWED
       ================================================================ */
    {
      id: 'q-nopay',
      weight: 10,
      who: 'student',
      when: (w) => (w.labour.revShare || 0) <= 0.001,
      desk: () => 'and is the same age as the people this question is about',
      /* THE POOL IS READ AT ASK TIME rather than written down, because it moves. `askOf` is
         the signature that also gets the world, which almost nothing needs. */
      askOf: (c, q, sit, w) => 'The sport made ' + bn(w.money.pool) + ' this year and not one '
        + 'cent of it is shared with the people playing it. I have to write this piece either '
        + 'way. What is the sentence you want in it?',
      answers: [
        { id: 'coming', label: 'Say it is coming',
          body: 'Not a number and not a date, but the direction, said out loud by the person '
            + 'who decides it. Everyone in the room writes it down.',
          wrote: 'The commissioner said revenue sharing is coming and would not say when.',
          effects: { labour: 1.6, cost: 0.8 },
          aimed: { Players: { labour: 2.2 }, Presidents: { cost: -1.2 }, SEC: { cost: -0.8 } },
          promise: { id: 'said-share', wait: [7, 13],
            note: 'A revenue share you said out loud was coming' } },
        { id: 'model', label: 'Defend the model',
          body: 'Scholarships, facilities, coaching, a degree. It is all true and it has never '
            + 'once worked as an answer to this question.',
          wrote: 'The commissioner listed what players already receive. The student asked the follow-up.',
          effects: { labour: -1.4, cost: -1.2, tradition: 1 },
          aimed: { Players: { labour: -2.4 }, Presidents: { cost: 1.6 }, Fans: { tradition: 0.8 } } },
        { id: 'congress', label: 'Blame Washington',
          body: 'You cannot write a share without an antitrust exemption and you have been '
            + 'asking for one for two years. True, and it reads as a man pointing at a door.',
          wrote: 'Asked about paying players, the commissioner talked about an antitrust exemption.',
          effects: { exposure: 1.2, labour: -0.6, autonomy: -0.8 },
          aimed: { Players: { labour: -1 }, Presidents: { exposure: -1.6 } } },
      ],
    },
    {
      id: 'q-pay',
      weight: 9,
      who: 'wire',
      when: (w) => (w.labour.revShare || 0) > 0.001,
      cast: (w) => ({ share: w.labour.revShare, pool: w.money.pool }),
      desk: () => 'and files the version four hundred papers run',
      ask: (c) => 'You are sending ' + pct(c.share) + ' of a ' + bn(c.pool) + ' pool to the '
        + 'players. Two questions and I need both on the record. Is that a floor or a '
        + 'ceiling, and who told you that number?',
      answers: [
        { id: 'floor', label: 'A floor',
          body: 'The number goes up from here. It is the answer the players want and it is a '
            + 'commitment the presidents have not agreed to.',
          wrote: 'The commissioner called the current share a floor, not a ceiling.',
          effects: { labour: 1.8, cost: 1.4, money: -0.8 },
          aimed: { Players: { labour: 2.4 }, Presidents: { cost: -1.8 }, SEC: { cost: -1.2 } } },
        { id: 'ceiling', label: 'A ceiling',
          body: 'This is what the sport can carry. Say it plainly and the athletic directors '
            + 'sleep, and every agent in the country reads it as a starting position.',
          wrote: 'The commissioner said the share is what the sport can carry and not a starting point.',
          effects: { labour: -1.6, cost: -1.4, money: 0.6 },
          aimed: { Players: { labour: -2.2 }, Presidents: { cost: 1.8 }, 'Big Ten': { cost: 1 } } },
        { id: 'room', label: 'Say who was in the room',
          body: 'Name the process: the presidents, the two leagues with the inventory, and no '
            + 'players. It is the honest answer and it is an admission.',
          wrote: 'The commissioner confirmed no player was in the room when the share was set.',
          effects: { labour: 0.8, exposure: 1.4, autonomy: -1 },
          aimed: { Players: { labour: 1.8 }, Presidents: { exposure: -2 },
            SEC: { autonomy: -0.8 } } },
      ],
    },
    {
      id: 'q-employment',
      weight: 8,
      who: 'legal',
      when: (w) => w.labour.employment !== 'amateur',
      cast: (w) => ({ kind: w.labour.employment }),
      desk: () => 'and has read every filing in the sport',
      ask: (c) => 'Under your own rules these are '
        + (c.kind === 'employee' ? 'employees' : 'people under contract')
        + '. Employees have hours. They have workplace safety law. They can organize. Have you '
        + 'read what you signed, or did somebody hand it to you?',
      answers: [
        { id: 'read', label: 'Say you read it',
          body: 'All of it, including the part about organizing, and you did it anyway. It is '
            + 'the answer that makes you look like you meant it.',
          wrote: 'The commissioner said the employment consequences were understood and intended.',
          effects: { labour: 1.6, exposure: 1, autonomy: 0.8 },
          aimed: { Players: { labour: 2 }, Presidents: { exposure: -1.8 }, SEC: { labour: -1 } } },
        { id: 'narrow', label: 'Say it is narrower than that',
          body: 'It is a contract for a specific thing and not a job. Lawyers will decide '
            + 'whether that is true and it will not be you.',
          wrote: 'The commissioner said the arrangement is narrower than employment. The reporter asked who decides.',
          effects: { labour: -1, exposure: -0.8, autonomy: 0.6 },
          aimed: { Players: { labour: -1.4 }, Presidents: { exposure: 1.2 } } },
        { id: 'union', label: 'Say you would sit with a union',
          body: 'Not that there is one. That if there were, this office would sit across from '
            + 'it. Nobody in this job has said that in a ballroom before.',
          wrote: 'The commissioner said the office would negotiate with a players association if one existed.',
          effects: { labour: 2.2, autonomy: -1.4, cost: 1 },
          aimed: { Players: { labour: 3 }, Presidents: { exposure: -2.2 },
            SEC: { autonomy: -1.6 }, 'Big Ten': { autonomy: -1.4 } },
          promise: { id: 'said-union', wait: [8, 16],
            note: 'A players association you said you would sit across from' } },
      ],
    },

    /* ================================================================
       THE ONE WAY DOOR, AND THE PORTAL
       ================================================================ */
    {
      id: 'q-reentry',
      weight: 9,
      who: 'beat',
      when: (w) => (w.labour.reentry || 'open') !== 'closed',
      cast: (w) => ({ years: w.labour.proYears == null ? 1 : w.labour.proYears,
        window: (w.labour.reentry || 'open') === 'window' }),
      desk: () => 'and has covered the same locker room since before any of them were born',
      ask: (c) => 'There is a man on a roster this August who spent last August in a '
        + 'professional camp. He is ' + (c.years >= 2 ? 'twenty-five' : 'twenty-four') + '. He is '
        + 'going to line up opposite an eighteen year old who graduated in May. Is that the sport '
        + 'you wanted?',
      answers: [
        { id: 'yes', label: 'Say yes, plainly',
          body: 'He got cut and he wants to finish his degree and play. Every argument against '
            + 'that ends up being an argument about somebody else losing a job.',
          wrote: 'The commissioner defended the return rule and said nobody should lose a year for trying.',
          effects: { labour: 1.8, tradition: -1.2, access: -0.6 },
          aimed: { Players: { labour: 2.4 }, Fans: { tradition: -1.6 },
            SEC: { labour: -0.6 } } },
        { id: 'age', label: 'Say the age is the problem',
          body: 'Not the door, the calendar. Concede that a twenty-five year old against a '
            + 'freshman is a different sport, and say you will look at the limit.',
          wrote: 'The commissioner said the age gap, not the door, is what needs looking at.',
          effects: { tradition: 1.2, labour: -0.4, cost: 0.4 },
          aimed: { Fans: { tradition: 1.6 }, Players: { labour: -0.8 } } },
        { id: 'roster', label: 'Turn it into a roster question',
          body: 'There are eighty-five places and every one taken by a returning professional '
            + 'is one not offered to a seventeen year old. It is the answer that moves the '
            + 'argument to a room the coaches are in.',
          wrote: 'The commissioner reframed the return rule as a question about roster limits.',
          effects: { access: 1.2, labour: -1, tradition: 0.6 },
          aimed: { 'Group of Five': { access: 1.4 }, Players: { labour: -1.4 },
            Presidents: { cost: 0.8 } } },
      ],
    },
    {
      id: 'q-split-rules',
      weight: 11,
      who: 'legal',
      when: (w, L, sit) => !!(sit && sit.splitRules),
      cast: (w, L, sit) => ({ shut: (sit.doorShut || [])[0] || 'one league',
        open: (sit.doorOpen || [])[0] || 'another' }),
      desk: () => 'and has the two rule books open on the table',
      ask: (c) => 'The same player is eligible in the ' + c.open + ' and ineligible in the '
        + c.shut + '. One transfer form and he changes what the law says about him. Which of '
        + 'those two leagues is following your rule?',
      answers: [
        { id: 'both', label: 'Say both are',
          body: 'You devolved it, they wrote it, that is the system working. It is defensible '
            + 'and it is the sound of a national office admitting it is not one.',
          wrote: 'The commissioner said both conferences are following the rule, because there is no rule.',
          effects: { autonomy: 1.6, access: -1, exposure: 1 },
          aimed: { SEC: { autonomy: 1.8 }, 'Big Ten': { autonomy: 1.6 },
            'Group of Five': { access: -1.4 }, Presidents: { exposure: -1.4 } } },
        { id: 'take', label: 'Take it back',
          body: 'Say at the microphone that eligibility is going to be national again, before '
            + 'you have the votes. Two leagues are going to find out about this from a phone.',
          wrote: 'The commissioner said eligibility will be written nationally again. Two conferences had not been told.',
          effects: { autonomy: -2, access: 1.6, exposure: 0.8 },
          aimed: { SEC: { autonomy: -2.2 }, 'Big Ten': { autonomy: -2 },
            'Group of Five': { access: 2 }, Fans: { tradition: 1 } },
          promise: { id: 'said-national', wait: [5, 11],
            note: 'A national eligibility rule you announced without the votes' } },
        { id: 'courts', label: 'Say the courts will settle it',
          body: 'They will, and it will take four years, and this office will be a defendant '
            + 'rather than an author. Everybody in the room knows what you just said.',
          wrote: 'The commissioner said a court would resolve the eligibility split.',
          effects: { exposure: 2, autonomy: -1.2, labour: -0.6 },
          aimed: { Presidents: { exposure: -2.6 }, Players: { labour: -1.2 } } },
      ],
    },
    {
      id: 'q-portal',
      weight: 8,
      who: 'radio',
      when: (w) => (w.labour.portalWindows || 0) >= 2 && Object.keys(w.membership || {}).length > 8,
      cast: (w) => pairOf(w, 'portal'),
      desk: () => 'and takes forty calls a morning about exactly this',
      ask: (c) => 'A quarterback started nine games for ' + c.from + ' in November. He is on '
        + c.to + '\'s roster in July. Third school in three years. My callers do not want '
        + 'to hear about freedom of movement, they want to know who they are supposed to buy '
        + 'a jersey for.',
      answers: [
        { id: 'free', label: 'Defend the movement',
          body: 'Coaches have always left in December for more money and nobody made them sit '
            + 'a year. Say that, in that order, on the radio.',
          wrote: 'The commissioner compared player movement to coaching contracts and did not blink.',
          effects: { labour: 1.6, tradition: -1.4 },
          aimed: { Players: { labour: 2.2 }, Fans: { tradition: -2 },
            'Group of Five': { access: -0.8 } } },
        { id: 'windows', label: 'Blame the calendar',
          body: 'It is not the movement, it is that the windows sit on top of signing day and '
            + 'the playoff. Fix the calendar and half of this goes away. Mostly true.',
          wrote: 'The commissioner said the transfer calendar, not transfers, is the problem.',
          effects: { inventory: 0.6, tradition: 0.8, labour: -0.4 },
          aimed: { Fans: { tradition: 1.2 }, Networks: { inventory: 0.8 } } },
        { id: 'jersey', label: 'Answer the question he asked',
          body: 'Tell his callers to buy the school\'s jersey, because the school is the '
            + 'thing that is still there in ten years. It is a sentimental answer and it is '
            + 'the one that gets clipped and shared.',
          wrote: 'The commissioner told fans to buy the school on the front, not the name on the back.',
          effects: { tradition: 2, labour: -0.8 },
          aimed: { Fans: { tradition: 2.6 }, Players: { labour: -1.2 },
            ACC: { tradition: 0.8 } } },
      ],
    },

    /* ================================================================
       WHO GETS IN
       ================================================================ */
    {
      id: 'q-field',
      weight: 8,
      who: 'national',
      when: (w) => (w.playoff.teams || 12) >= 14,
      cast: (w, L, sit) => ({ teams: w.playoff.teams,
        champ: (sit && sit.previous && sit.previous.champion) || null }),
      desk: () => 'and has covered every format this sport has had',
      ask: (c) => 'Your champion played ' + ((c.teams >= 16 ? 16 : 15)) + ' or more games to '
        + 'win it' + (c.champ ? ', and ' + c.champ + ' looked like a team on the last night of it' : '')
        + '. At what number does a postseason stop being a postseason and start being a '
        + 'second season?',
      answers: [
        { id: 'more', label: 'Say there is room for more',
          body: 'The professional league plays twenty and nobody calls it a second season. It '
            + 'is the answer the networks came to hear.',
          wrote: 'The commissioner said the field could still grow.',
          effects: { inventory: 2, access: 1.4, tradition: -1.4, labour: -1 },
          aimed: { Networks: { inventory: 2.6 }, 'Group of Five': { access: 1.6 },
            Fans: { tradition: -1.6 }, Players: { labour: -1.6 } } },
        { id: 'here', label: 'Say this is the number',
          body: 'Draw the line at the field you have, in public, so the next expansion has to '
            + 'go through a sentence you said in July.',
          wrote: 'The commissioner said the current field is the last one.',
          effects: { tradition: 1.6, inventory: -1.2, access: -0.6 },
          aimed: { Fans: { tradition: 2 }, Networks: { inventory: -1.8 },
            'Big Ten': { inventory: -0.8 } } },
        { id: 'bodies', label: 'Make it about the bodies',
          body: 'Sixteen games is a professional workload on people who are also taking exams. '
            + 'Say that and the next question is what you intend to do about it.',
          wrote: 'The commissioner raised player workload as the limit on expansion.',
          effects: { labour: 1.8, cost: 1, inventory: -1 },
          aimed: { Players: { labour: 2.4 }, Presidents: { cost: -1.2 },
            Networks: { inventory: -1.2 } } },
      ],
    },
    {
      id: 'q-autobids',
      weight: 7,
      who: 'local',
      when: (w, L, sit) => (w.playoff.autobids || 0) <= 5 && !!(sit && sit.confs),
      cast: (w) => ({ bids: w.playoff.autobids || 0, teams: w.playoff.teams }),
      desk: () => 'from a market with no power conference team in it',
      ask: (c) => 'There are ' + c.bids + ' automatic bids in a field of ' + c.teams + '. Every '
        + 'other one is chosen by a committee in a hotel. What does a team outside the four '
        + 'big leagues actually have to do?',
      answers: [
        { id: 'win', label: 'Tell them to win out',
          body: 'Go unbeaten and beat somebody in September. It is what the committee says and '
            + 'it is not quite what the committee does.',
          wrote: 'The commissioner said an unbeaten season and a September win is the path.',
          effects: { access: -1, tradition: 0.4 },
          aimed: { 'Group of Five': { access: -2 }, SEC: { access: 0.8 },
            'Big 12': { access: -0.6 } } },
        { id: 'admit', label: 'Admit the math',
          body: 'Say the true thing: with this many bids, an unbeaten season outside the four '
            + 'is not enough on its own and everybody in the sport knows it.',
          wrote: 'The commissioner conceded that an unbeaten outsider is not guaranteed a place.',
          effects: { access: 1.2, exposure: 0.8, tradition: 0.6 },
          aimed: { 'Group of Five': { access: 2.2 }, 'Big 12': { access: 1 },
            SEC: { access: -0.8 }, Presidents: { exposure: -1 } },
          promise: { id: 'said-bid', wait: [6, 13],
            note: 'An automatic bid you as good as promised' } },
        { id: 'committee', label: 'Defend the committee',
          body: 'Twelve people in a room for four days, and they get it right more often than '
            + 'a formula would. It is the institutional answer and it is not indefensible.',
          wrote: 'The commissioner defended selection by committee and named no criteria.',
          effects: { autonomy: 1, access: -0.6, tradition: 0.8 },
          aimed: { Presidents: { autonomy: 0.8 }, 'Group of Five': { access: -1.2 },
            Fans: { tradition: 0.6 } } },
      ],
    },

    /* ================================================================
       WHAT YOU SOLD
       ================================================================ */
    {
      id: 'q-sold',
      weight: 8,
      who: 'student',
      when: (w, L, sit) => !!(sit && sit.soldCount >= 3),
      cast: (w, L, sit) => ({ n: sit.soldCount }),
      desk: () => 'and counted them on the walk in',
      ask: (c) => 'I counted ' + c.n + ' company names on the way into this building. On the '
        + 'trophy, on the jersey, on the bowl my grandfather went to. Is there anything in this '
        + 'sport that is not for sale?',
      answers: [
        { id: 'pays', label: 'Say what it pays for',
          body: 'Name the thing the money does: the sports that lose money, the scholarships, '
            + 'the buildings. It is the honest answer and it sounds like a brochure.',
          wrote: 'The commissioner said sponsorship pays for the sports that do not pay for themselves.',
          effects: { money: 1.2, tradition: -0.8, cost: -0.6 },
          aimed: { Presidents: { cost: 1.4 }, Fans: { tradition: -1.2 },
            Networks: { money: 0.8 } } },
        { id: 'line', label: 'Say the trophy is never for sale',
          body: 'One thing, named out loud, that will never carry a company on it: the '
            + 'national championship trophy. It is a small promise and it is the only '
            + 'sentence from this press conference anybody remembers.',
          wrote: 'The commissioner promised the national championship trophy will never carry a sponsor.',
          effects: { tradition: 2.2, money: -1, inventory: -0.8 },
          aimed: { Fans: { tradition: 3 }, Networks: { inventory: -1.2 },
            SEC: { money: -1 } },
          promise: { id: 'said-line', wait: [8, 16],
            note: 'A thing you promised would never carry a sponsor' } },
        { id: 'always', label: 'Say it has always been this way',
          body: 'Bowl games have carried company names since before either of you were born. '
            + 'True, dismissive, and it will be the clip.',
          wrote: 'The commissioner told a student reporter that bowls have always carried sponsors.',
          effects: { tradition: -1.4, money: 0.8, autonomy: 0.6 },
          aimed: { Fans: { tradition: -2 }, Players: { labour: -0.6 },
            Networks: { money: 0.6 } } },
      ],
    },
    {
      id: 'q-gambling',
      weight: 10,
      who: 'legal',
      when: (w) => w.posture.gambling === 'partnered',
      desk: () => 'and has the integrity filings from two other sports on the table',
      ask: () => 'This sport has an official betting partner and its logo is on a field that '
        + 'nineteen year olds play on for no salary. Every league that has done this has had an '
        + 'integrity case within four years. Which one of those two facts is the one you thought '
        + 'about?',
      answers: [
        { id: 'both', label: 'Say you thought about both',
          body: 'And that the money funds the monitoring that catches it. It is circular, it is '
            + 'what every league says, and it happens to be how it actually works.',
          wrote: 'The commissioner said betting revenue funds the integrity monitoring.',
          effects: { money: 1, exposure: 0.8, tradition: -0.6 },
          aimed: { Networks: { money: 0.8 }, Presidents: { exposure: -1.4 },
            Fans: { tradition: -1 } } },
        { id: 'players', label: 'Talk about the players',
          body: 'Say the part nobody in this job says: the abuse a nineteen year old gets from '
            + 'people who lost money on him is now this office\'s problem.',
          wrote: 'The commissioner said player harassment from bettors is the office\'s responsibility.',
          effects: { labour: 1.8, exposure: 1, money: -0.6 },
          aimed: { Players: { labour: 2.6 }, Fans: { tradition: 0.8 },
            Presidents: { exposure: -1.2 } } },
        { id: 'legal', label: 'Point at the states',
          body: 'It is legal in forty of them and it is happening whether this office has a '
            + 'partner or not. Being inside it is the only way to see it.',
          wrote: 'The commissioner said the sport is safer inside the betting market than outside it.',
          effects: { money: 1.2, autonomy: 0.8, exposure: 0.6 },
          aimed: { Networks: { money: 1 }, Presidents: { exposure: -0.8 },
            Players: { labour: -0.8 } } },
      ],
    },

    /* ================================================================
       WHAT YOU BROKE
       ================================================================ */
    {
      id: 'q-defunct',
      weight: 12,
      who: 'beat',
      when: (w, L, sit) => !!(sit && sit.gone && sit.gone.length),
      cast: (w, L, sit) => ({ conf: sit.gone[0] }),
      desk: (c) => 'who covered the ' + c.conf + ' for nineteen years',
      ask: (c) => 'The ' + c.conf + ' does not exist any more. I am not going to ask you '
        + 'whether that is sad. I am going to ask whether this office killed it or watched it '
        + 'happen, because those are different jobs and only one of them is yours.',
      answers: [
        { id: 'watched', label: 'Say you watched',
          body: 'This office does not own the schools and cannot stop one leaving. It is true, '
            + 'it is the whole problem with the job, and saying it out loud is an admission '
            + 'that the office is weaker than the leagues in it.',
          wrote: 'The commissioner said the office could not have stopped it and would not pretend otherwise.',
          effects: { autonomy: -1.6, tradition: 0.8, exposure: 0.4 },
          aimed: { SEC: { autonomy: 1.2 }, 'Big Ten': { autonomy: 1 },
            Fans: { tradition: 1 }, 'Group of Five': { access: -0.8 } } },
        { id: 'killed', label: 'Take the blame',
          body: 'Say that a distribution this office wrote made staying unaffordable and that '
            + 'you knew it at the time. Nobody does this. It would be the story of the summer.',
          wrote: 'The commissioner took personal responsibility for the collapse of a conference.',
          effects: { tradition: 1.8, exposure: 1.6, autonomy: -0.8, access: 1 },
          aimed: { Fans: { tradition: 2.4 }, 'Group of Five': { access: 1.6 },
            Presidents: { exposure: -2.2 }, SEC: { money: -0.8 } } },
        { id: 'forward', label: 'Refuse the frame',
          body: 'Say the sport is bigger than any one league and turn to the next question. It '
            + 'works in the room and it is the answer that runs under his photograph.',
          wrote: 'Asked about a dead conference, the commissioner said the sport is bigger than any one league.',
          effects: { tradition: -1.6, autonomy: 0.8 },
          aimed: { Fans: { tradition: -2 }, 'Group of Five': { access: -1.2 },
            'Big Ten': { autonomy: 0.6 } } },
      ],
    },
    {
      id: 'q-endangered',
      weight: 8,
      who: 'local',
      when: (w, L, sit) => !!(sit && sit.endangered && sit.endangered.length),
      cast: (w, L, sit) => ({ conf: sit.endangered[0],
        size: (sit.confs[sit.endangered[0]] || {}).size || 0 }),
      desk: (c) => 'from a station in the middle of the ' + c.conf,
      ask: (c) => 'The ' + c.conf + ' is down to ' + c.size + '. Everybody in that league has '
        + 'been told by somebody that it is fine. Is it fine?',
      answers: [
        { id: 'no', label: 'Say no',
          body: 'It is not fine, and the schools in it should hear that from this office before '
            + 'they hear it from an agent. Cruel, and it is the useful answer.',
          wrote: 'The commissioner said publicly that a conference is not viable at its current size.',
          effects: { exposure: 1.2, access: 0.8, tradition: -0.6, autonomy: 1 },
          aimed: { Presidents: { exposure: -1.4 }, Fans: { tradition: -0.8 },
            'Group of Five': { access: 1 } } },
        { id: 'yes', label: 'Say it is fine',
          body: 'Steady the market. If you are wrong, this clip runs on the day it folds, with '
            + 'the date in the corner.',
          wrote: 'The commissioner said the conference is stable. The clip has a date in the corner.',
          effects: { tradition: 1, exposure: -0.6, access: 0.4 },
          aimed: { ACC: { tradition: 1.2 }, 'Big 12': { access: 0.8 },
            Presidents: { exposure: 0.8 } } },
        { id: 'help', label: 'Say the office will help',
          body: 'A scheduling agreement, a bid path, something with a shape. You have not '
            + 'cleared it with anybody and you are about to.',
          wrote: 'The commissioner promised the office would intervene to keep a conference alive.',
          effects: { access: 1.6, cost: 1, autonomy: -0.8 },
          aimed: { ACC: { access: 1.8 }, 'Big 12': { access: 1.4 },
            SEC: { autonomy: -1 }, Presidents: { cost: -1 } },
          promise: (c) => ({ id: 'said-rescue', wait: [5, 11], data: { conf: c.conf },
            note: 'A rescue you offered the ' + c.conf + ' from a lectern' }) },
      ],
    },

    /* ================================================================
       THE GAME ITSELF
       ================================================================ */
    {
      id: 'q-rules',
      weight: 6,
      who: 'radio',
      when: (w) => w.rules.overtime !== 'twopoint' || w.rules.clock !== 'running'
        || w.rules.targeting !== 'strict',
      cast: (w) => ({ ot: w.rules.overtime, clock: w.rules.clock, tg: w.rules.targeting }),
      desk: () => 'whose audience has opinions about this and only this',
      ask: () => 'You changed how the game itself is played. Not the money, not the bracket. '
        + 'The game. My audience has watched this sport the same way for forty years and they '
        + 'want to know who asked you to.',
      answers: [
        { id: 'safety', label: 'Say it was the doctors',
          body: 'Fewer plays, fewer collisions, a shorter afternoon. It is the reason and it is '
            + 'the reason nobody wants.',
          wrote: 'The commissioner said the rule changes came from medical advice.',
          effects: { labour: 1.4, tradition: -1, inventory: -0.6 },
          aimed: { Players: { labour: 1.8 }, Fans: { tradition: -1.4 },
            Networks: { inventory: -0.8 } } },
        { id: 'tv', label: 'Say it was the clock',
          body: 'Games were running past midnight on the east coast and the last window was '
            + 'unsellable. True, and admitting it hands his show a week of material.',
          wrote: 'The commissioner admitted television windows drove a rule change.',
          effects: { inventory: 1.4, money: 0.8, tradition: -1.6 },
          aimed: { Networks: { inventory: 2 }, Fans: { tradition: -2.2 } } },
        { id: 'defend', label: 'Say the game is better',
          body: 'No committee, no network, no doctor. You watched it and it is better. It is '
            + 'the answer with no cover behind it.',
          wrote: 'The commissioner said the game is simply better this way and offered no other reason.',
          effects: { autonomy: 1.6, tradition: 0.6 },
          aimed: { Fans: { tradition: 0.8 }, SEC: { autonomy: -0.8 },
            Presidents: { autonomy: 0.6 } } },
      ],
    },
    {
      id: 'q-nonrev',
      weight: 7,
      who: 'wire',
      when: (w) => w.posture.nonRevGuarantee === false,
      desk: () => 'and has the sponsorship numbers from every athletic department',
      ask: () => 'The guarantee for the sports that do not make money is gone. Somewhere this '
        + 'fall a swimming program gets a letter. Does this office count that as a cost of '
        + 'the decision or as somebody else\'s decision entirely?',
      answers: [
        { id: 'ours', label: 'Call it ours',
          body: 'This office took the guarantee away and the letters are a consequence of that. '
            + 'Say it and every athletic director hears an office that will be back.',
          wrote: 'The commissioner said cuts to non-revenue sports are a consequence of this office\'s decision.',
          effects: { cost: 1.2, exposure: 1, tradition: 1 },
          aimed: { Presidents: { cost: -1.6 }, Fans: { tradition: 1.2 },
            Players: { labour: 0.8 } } },
        { id: 'theirs', label: 'Call it theirs',
          body: 'Every school chooses its own sports and always has. Accurate, and it is a man '
            + 'describing a hole he dug as weather.',
          wrote: 'The commissioner said program cuts are decisions made on campus.',
          effects: { cost: -1, autonomy: 0.8, tradition: -1.2 },
          aimed: { Presidents: { cost: 1.4 }, Fans: { tradition: -1.4 },
            Players: { labour: -0.8 } } },
        { id: 'fund', label: 'Say you will fund them centrally',
          body: 'A line in the distribution for the sports that lose money. It is the right '
            + 'answer and it is a bill you have just written for two leagues who are listening.',
          wrote: 'The commissioner floated central funding for non-revenue sports.',
          effects: { cost: 1.8, money: -1, tradition: 1.4, access: 0.6 },
          aimed: { Presidents: { cost: -1.2 }, Fans: { tradition: 1.8 },
            SEC: { money: -1.6 }, 'Big Ten': { money: -1.4 } } },
      ],
    },

    /* ================================================================
       YOU
       ================================================================ */
    {
      id: 'q-shaky',
      weight: 11,
      who: 'national',
      when: (w, L, sit) => !!(sit && sit.shaky) && !(sit && sit.firstYear),
      desk: () => 'who has already been briefed against you by two people in this building',
      ask: () => 'Two presidents have told me on background that you will not finish your term. '
        + 'They are in this hotel. I am giving you the chance to say something to them with a '
        + 'microphone on, which is more than they gave you.',
      answers: [
        { id: 'name', label: 'Dare them to say it out loud',
          body: 'Invite them to put a name on it. It is the most watched forty seconds of the '
            + 'summer and it makes the vote a public thing rather than a private one.',
          wrote: 'The commissioner challenged anonymous critics to speak on the record.',
          effects: { autonomy: 2, exposure: 1.6 },
          aimed: { Presidents: { exposure: -2.4, autonomy: -1.4 },
            Fans: { tradition: 1.4 }, Players: { labour: 0.6 } } },
        { id: 'work', label: 'Refuse to engage',
          body: 'You have a job to do and you are doing it. It is the correct answer and it is '
            + 'the one that lets them keep briefing.',
          wrote: 'The commissioner declined to respond to anonymous criticism.',
          effects: { exposure: -1, autonomy: -0.4 },
          aimed: { Presidents: { exposure: 1.2 }, Fans: { tradition: -0.6 } } },
        { id: 'agree', label: 'Say they may be right',
          body: 'Say that this job is held at the pleasure of the room and that you knew that '
            + 'walking in. Disarming, human, and it reads to the room as a man packing.',
          wrote: 'The commissioner said he serves at the pleasure of the membership and might not finish.',
          effects: { autonomy: -1.8, tradition: 1.2, labour: 0.4 },
          aimed: { SEC: { autonomy: 1.6 }, 'Big Ten': { autonomy: 1.4 },
            Presidents: { autonomy: 1.2 }, Fans: { tradition: 1 } } },
      ],
    },
    {
      id: 'q-first',
      weight: 9,
      who: 'wire',
      when: (w, L, sit) => !!(sit && sit.firstYear),
      desk: () => 'and will file whatever you say in eleven minutes',
      ask: () => 'Nobody in this room voted for you and most of them could not have picked you '
        + 'out of a line-up in March. First question of your first media days, and it is the '
        + 'only one anybody will remember: what are you actually for?',
      answers: [
        { id: 'players', label: 'The people playing it',
          body: 'Lead with the players in the first sentence of your term. Half the room writes '
            + 'that you are serious and half writes that you have never met a president.',
          wrote: 'The new commissioner opened by naming the players as the priority.',
          effects: { labour: 2, cost: 0.8, autonomy: -0.4 },
          aimed: { Players: { labour: 2.8 }, Presidents: { cost: -1.4 },
            SEC: { labour: -1 }, Fans: { tradition: 0.6 } } },
        { id: 'game', label: 'The game',
          body: 'Saturdays, rivalries, the thing that was there before the money. It is the '
            + 'safest answer in this building and it is not empty.',
          wrote: 'The new commissioner said the job is to protect Saturdays.',
          effects: { tradition: 2.2, money: -0.6, inventory: -0.4 },
          aimed: { Fans: { tradition: 3 }, ACC: { tradition: 1 },
            Networks: { inventory: -0.6 } } },
        { id: 'stable', label: 'Holding it together',
          body: 'The sport is one bad year from breaking into two and your job is to stop that. '
            + 'It is the true answer and nobody has ever cheered for it.',
          wrote: 'The new commissioner said the job is to stop the sport splitting in two.',
          effects: { autonomy: 1.2, access: 0.8, exposure: -1 },
          aimed: { Presidents: { exposure: 1.6 }, ACC: { access: 1.2 },
            'Big 12': { access: 1 }, Fans: { tradition: -0.6 } } },
      ],
    },
    {
      id: 'q-last',
      weight: 10,
      who: 'beat',
      when: (w, L, sit) => !!(sit && sit.lastYear),
      desk: () => 'who has been at every one of these you have done',
      ask: () => 'This is the last July you stand up here with the job. I have covered all of '
        + 'them. So: what did you not get done, and who stopped you?',
      answers: [
        { id: 'name', label: 'Name who stopped you',
          body: 'Say the league, in the room, in your last summer. It is the most honest thing '
            + 'anybody has said from this lectern and it costs you the vote you need in December.',
          wrote: 'In his final media days the commissioner named the conference that blocked him.',
          effects: { autonomy: 2.2, exposure: 1.4, access: 1 },
          aimed: { SEC: { autonomy: -2.4 }, 'Big Ten': { autonomy: -2 },
            Fans: { tradition: 1.6 }, Players: { labour: 1.2 },
            'Group of Five': { access: 1.4 } } },
        { id: 'own', label: 'Say it was you',
          body: 'Nobody stopped you. You did not have the votes and you did not go and get '
            + 'them. It is a graceful answer and it is also, usually, accurate.',
          wrote: 'The commissioner said he had not built the coalition and blamed nobody else.',
          effects: { tradition: 1.4, autonomy: -1, exposure: -0.6 },
          aimed: { Presidents: { exposure: 1.4 }, SEC: { autonomy: 1 },
            Fans: { tradition: 1.2 } } },
        { id: 'nothing', label: 'Say you got it done',
          body: 'Claim the term. It is what the office would want and it is the one answer in '
            + 'this room that nobody believes, including the person giving it.',
          wrote: 'The commissioner said the term achieved what it set out to and took no more questions.',
          effects: { autonomy: 0.8, tradition: -1.4 },
          aimed: { Fans: { tradition: -1.8 }, Players: { labour: -0.8 },
            Presidents: { autonomy: 0.6 } } },
      ],
    },

    {
      id: 'q-field-small',
      weight: 7,
      who: 'national',
      when: (w) => (w.playoff.teams || 12) <= 12,
      cast: (w) => ({ teams: w.playoff.teams || 12 }),
      desk: () => 'and votes in the poll that half this argument is about',
      ask: (c) => 'A field of ' + c.teams + '. Four teams were left out with a case and one of '
        + 'them beat the eventual champion in October. Every year this happens and every year '
        + 'this office says the process worked. Did it?',
      answers: [
        { id: 'worked', label: 'Say it worked',
          body: 'A line has to be somewhere and somebody is always just under it. It is the '
            + 'answer every commissioner gives and it has the advantage of being true.',
          wrote: 'The commissioner said the selection process worked and named no team.',
          effects: { tradition: 0.8, access: -1, autonomy: 0.8 },
          aimed: { Fans: { tradition: -0.8 }, 'Group of Five': { access: -1.4 },
            Presidents: { autonomy: 0.8 } } },
        { id: 'bigger', label: 'Say the field is too small',
          body: 'Argue for expansion at a lectern, before the room that would have to vote for '
            + 'it. The networks stop taking notes and start doing arithmetic.',
          wrote: 'The commissioner argued in public for a bigger playoff field.',
          effects: { access: 2, inventory: 1.6, tradition: -1.2, labour: -0.8 },
          aimed: { 'Group of Five': { access: 2.4 }, Networks: { inventory: 2 },
            'Big 12': { access: 1.4 }, Fans: { tradition: -1.4 } } },
        { id: 'october', label: 'Say the regular season decided it',
          body: 'They lost in October and that is what October is for. It is the most '
            + 'traditional answer available and it is the one that defends the sport rather '
            + 'than the committee.',
          wrote: 'The commissioner said the regular season, not the committee, left them out.',
          effects: { tradition: 2, access: -0.8, inventory: -0.6 },
          aimed: { Fans: { tradition: 2.4 }, SEC: { tradition: 1 },
            'Group of Five': { access: -1.2 } } },
      ],
    },
    {
      id: 'q-unsold',
      weight: 6,
      who: 'tv',
      when: (w, L, sit) => !!(sit && sit.soldCount === 0),
      desk: () => 'and knows exactly what the categories are worth',
      ask: () => 'Not one thing in this sport carries a company name. Every league you compete '
        + 'with has sold the ball, the jersey and the halftime. Is that a decision or is it a '
        + 'sales department that has not called anybody?',
      answers: [
        { id: 'decision', label: 'Say it is a decision',
          body: 'The sport looks the way it looks and that is worth something you cannot put '
            + 'in a contract. Say it on the network that would like to sell you the contract.',
          wrote: 'The commissioner said keeping the sport unsponsored is deliberate.',
          effects: { tradition: 2, money: -1.2, inventory: -0.8 },
          aimed: { Fans: { tradition: 2.6 }, Networks: { money: -1.2 },
            Presidents: { cost: -1 } } },
        { id: 'open', label: 'Say you are listening',
          body: 'Open for business, in a room full of people whose job is to report that. Nine '
            + 'category heads will have called the office by Friday.',
          wrote: 'The commissioner said the office is open to title sponsorship.',
          effects: { money: 1.8, inventory: 1, tradition: -1.4 },
          aimed: { Networks: { money: 1.6 }, Presidents: { cost: 1.4 },
            Fans: { tradition: -1.8 }, SEC: { money: 1.2 } } },
        { id: 'players', label: 'Say it depends where the money goes',
          body: 'You will sell anything if the money reaches the players, and nothing if it '
            + 'reaches the buildings. That is a condition, in public, with witnesses.',
          wrote: 'The commissioner said sponsorship money would have to reach players first.',
          effects: { labour: 1.8, money: 0.8, cost: 1 },
          aimed: { Players: { labour: 2.4 }, Presidents: { cost: -1.4 },
            Networks: { money: 0.6 } } },
      ],
    },
    {
      id: 'q-gambling-permitted',
      weight: 7,
      who: 'legal',
      when: (w) => w.posture.gambling === 'permitted',
      desk: () => 'and has the integrity filings from two other sports on the table',
      ask: () => 'This sport permits betting on itself and partners with nobody, which means it '
        + 'takes none of the money and gets none of the data. Two other leagues found their '
        + 'integrity cases through partner monitoring. How are you going to find yours?',
      answers: [
        { id: 'partner', label: 'Say you are going to partner',
          body: 'Take the money and the monitoring together, because the second only comes '
            + 'with the first. It is the practical answer and the clip is you saying yes to a '
            + 'sportsbook.',
          wrote: 'The commissioner said a betting partnership is coming, for the monitoring.',
          effects: { money: 1.6, exposure: 1.2, tradition: -1.4 },
          aimed: { Networks: { money: 1.4 }, Presidents: { exposure: -1.4 },
            Fans: { tradition: -1.6 }, Players: { labour: -0.8 } } },
        { id: 'ban', label: 'Say you would ban it if you could',
          body: 'You cannot, it is legal in forty states, and saying it anyway tells everybody '
            + 'exactly where this office stands. Some of them will be relieved.',
          wrote: 'The commissioner said he would ban betting on the sport if it were his to ban.',
          effects: { tradition: 1.8, money: -1.2, exposure: -1 },
          aimed: { Fans: { tradition: 2.2 }, Players: { labour: 1 },
            Networks: { money: -1.4 }, Presidents: { exposure: 1.2 } } },
        { id: 'quiet', label: 'Say nothing useful',
          body: 'Monitoring is under review and the office takes integrity extremely seriously. '
            + 'Everybody writes it down and nobody prints it.',
          wrote: 'Asked about betting integrity, the commissioner said the matter is under review.',
          effects: { exposure: -0.6, autonomy: 0.4 },
          aimed: { Presidents: { exposure: 0.8 }, Fans: { tradition: -0.8 } } },
      ],
    },
    {
      id: 'q-deal',
      weight: 5,
      who: 'wire',
      when: (w) => (w.money.dealYears || 0) >= 4,
      cast: (w) => ({ years: w.money.dealYears, pool: w.money.pool }),
      desk: () => 'and covered the last three negotiations',
      ask: (c) => 'You have ' + c.years + ' years of certainty and ' + bn(c.pool) + ' a year, '
        + 'which is the most comfortable position anybody in this chair has ever been in. Every '
        + 'commissioner who has been comfortable has been replaced by somebody who was not. '
        + 'What are you doing with the time?',
      answers: [
        { id: 'fix', label: 'Fixing the things nobody will pay for',
          body: 'Eligibility, the calendar, the leagues that are one bad year from folding. '
            + 'None of it shows up in a rights number and all of it comes due after you leave.',
          wrote: 'The commissioner said the stable years will be spent on problems with no revenue attached.',
          effects: { access: 1.4, tradition: 1.2, cost: 0.8, money: -0.6 },
          aimed: { 'Group of Five': { access: 1.6 }, ACC: { access: 1.2 },
            Fans: { tradition: 1.4 }, Presidents: { cost: -0.8 } } },
        { id: 'grow', label: 'Making the next one bigger',
          body: 'Four years of building inventory so the next negotiation starts from a better '
            + 'place. It is what the job is measured on and everybody in the room knows it.',
          wrote: 'The commissioner said the years of certainty will be spent building for the next deal.',
          effects: { money: 1.6, inventory: 1.4, tradition: -1 },
          aimed: { Networks: { inventory: 1.6 }, SEC: { money: 1.4 },
            'Big Ten': { money: 1.2 }, Fans: { tradition: -1.2 } } },
        { id: 'nothing', label: 'Say the job is not to break it',
          body: 'The sport is working. Do not touch it. It is an unfashionable answer and it '
            + 'is the one most of your predecessors would have given.',
          wrote: 'The commissioner said the priority is not breaking a sport that works.',
          effects: { tradition: 1.4, autonomy: -0.8, access: -1 },
          aimed: { Fans: { tradition: 1.6 }, SEC: { autonomy: 1.2 },
            'Group of Five': { access: -1.6 }, Players: { labour: -0.8 } } },
      ],
    },
    {
      id: 'q-champion',
      weight: 7,
      who: 'beat',
      when: (w, L, sit) => !!(sit && sit.previous && sit.previous.champion),
      cast: (w, L, sit) => ({ champ: sit.previous.champion, year: sit.previous.year }),
      desk: (c) => 'who followed ' + c.champ + ' all of last season',
      ask: (c) => c.champ + ' won it. Their roster cost more than eleven athletic departments '
        + 'spend on everything, and every school in this room has now been told by a donor to '
        + 'do what they did. Is ' + c.champ + ' the model or the warning?',
      answers: [
        { id: 'model', label: 'Call it the model',
          body: 'They spent, they built, they won, and pretending otherwise is how this sport '
            + 'lied to itself for fifty years.',
          wrote: 'The commissioner called the champion\'s spending the model rather than a problem.',
          effects: { money: 1.4, labour: 1, access: -1.4, tradition: -1 },
          aimed: { SEC: { money: 1.6 }, 'Big Ten': { money: 1.4 },
            'Group of Five': { access: -2 }, Players: { labour: 1.2 } } },
        { id: 'warning', label: 'Call it the warning',
          body: 'Say out loud that a sport where the title is bought is a sport with eleven '
            + 'teams in it. Two leagues in this building take that personally.',
          wrote: 'The commissioner said a bought championship is a warning about where the sport is going.',
          effects: { access: 2, tradition: 1.6, money: -1.2, cost: -0.8 },
          aimed: { 'Group of Five': { access: 2.4 }, Fans: { tradition: 2 },
            SEC: { money: -1.8 }, 'Big Ten': { money: -1.4 } } },
        { id: 'neither', label: 'Talk about the football',
          body: 'They were the best team, they played the hardest schedule, and they won the '
            + 'last game. Refuse the economics and give the beat writer his quote.',
          wrote: 'The commissioner praised the champion and declined to discuss what the roster cost.',
          effects: { tradition: 1, autonomy: 0.6 },
          aimed: { Fans: { tradition: 1.2 }, SEC: { autonomy: 0.6 },
            Players: { labour: -0.6 } } },
      ],
    },
    {
      id: 'q-coaches',
      weight: 6,
      who: 'student',
      when: () => true,
      desk: () => 'and looked up the salaries before coming in',
      ask: () => 'The highest paid public employee in thirty-nine states is a football coach. '
        + 'Some of them are in this hotel. They are paid by the same institutions that spent a '
        + 'decade arguing the people they coach cannot be paid anything at all. How do you '
        + 'hold both of those?',
      answers: [
        { id: 'cant', label: 'Say you cannot',
          body: 'Admit it does not hold, in front of forty coaches. It is the only honest '
            + 'answer to this question and it is not what anybody in the room expects.',
          wrote: 'The commissioner said the coaching market and the amateurism argument do not hold together.',
          effects: { labour: 2, exposure: 1.2, cost: 0.8, tradition: -0.8 },
          aimed: { Players: { labour: 2.6 }, Presidents: { exposure: -1.6 },
            SEC: { labour: -1.2 }, Fans: { tradition: 0.8 } } },
        { id: 'market', label: 'Call it a market',
          body: 'Forty schools bidding for twelve people produces those numbers, and no rule '
            + 'this office writes changes arithmetic. True, and it is the answer of a man who '
            + 'has read the question and declined it.',
          wrote: 'The commissioner described coaching salaries as a market outcome.',
          effects: { money: 0.8, labour: -1.2, autonomy: 0.8 },
          aimed: { Players: { labour: -1.8 }, Presidents: { cost: 0.8 },
            SEC: { autonomy: 1 } } },
        { id: 'cap', label: 'Float a cap on the staff',
          body: 'A limit on what a program can spend on people who are not playing. It has '
            + 'never survived a court and saying it here starts the argument.',
          wrote: 'The commissioner floated a limit on what programs spend on coaching staff.',
          effects: { cost: -1.6, exposure: 1.8, access: 1.4, labour: 0.6 },
          aimed: { 'Group of Five': { access: 2 }, Presidents: { cost: 1.6, exposure: -1.8 },
            SEC: { autonomy: -1.6 }, Fans: { tradition: 1 } } },
      ],
    },
    {
      id: 'q-schedule',
      weight: 5,
      who: 'radio',
      when: (w) => (w.rules.confGames || 9) !== 0,
      cast: (w) => ({ games: w.rules.confGames || 9 }),
      desk: () => 'whose callers have a list of the games they want back',
      ask: (c) => c.games + ' conference games, and the other three or four are against '
        + 'whoever will take the check. My audience has watched their team play the same four '
        + 'nobody games every September for twenty years. When does somebody fix that?',
      answers: [
        { id: 'more', label: 'Say the answer is more league games',
          body: 'Fewer bought Saturdays, harder schedules, and every small program that lives '
            + 'off those checks finds out in the same press conference.',
          wrote: 'The commissioner said the fix is more conference games and fewer bought ones.',
          effects: { tradition: 1.8, inventory: 1.2, access: -1.4, money: -0.8 },
          aimed: { Fans: { tradition: 2.2 }, Networks: { inventory: 1.4 },
            'Group of Five': { access: -2.2 } } },
        { id: 'checks', label: 'Defend the checks',
          body: 'Those games fund entire athletic departments, and one of them is why a school '
            + 'in his own market still has a team. It is the answer that wins the argument and '
            + 'loses the room.',
          wrote: 'The commissioner defended guarantee games as the funding model for smaller programs.',
          effects: { access: 1.6, money: 0.6, tradition: -1.4 },
          aimed: { 'Group of Five': { access: 2.2 }, Fans: { tradition: -1.6 },
            Networks: { inventory: -0.8 } } },
        { id: 'mandate', label: 'Promise a non-conference standard',
          body: 'Everybody plays one real opponent outside the league or the committee counts '
            + 'it against them. It is a rule and you have just announced it on the radio.',
          wrote: 'The commissioner said a non-conference standard is coming for every program.',
          effects: { tradition: 1.6, access: 0.8, autonomy: -1, inventory: 1 },
          aimed: { Fans: { tradition: 2 }, Networks: { inventory: 1.2 },
            SEC: { autonomy: -1.2 }, 'Group of Five': { access: 0.8 } } },
      ],
    },

    /* ================================================================
       THE TWO THAT COULD BE ASKED OF ANYBODY, weighted last on purpose so
       they turn up when the sport has genuinely not given anybody a better
       question, which in year one is most of the room.
       ================================================================ */
    {
      id: 'q-for',
      weight: 3,
      who: 'student',
      when: () => true,
      desk: () => 'and is asking the question nobody in this room asks any more',
      ask: () => 'Everybody here knows what college football is worth. Nobody has said what it '
        + 'is for. Not what it pays for. What it is for.',
      answers: [
        { id: 'school', label: 'It is the school',
          body: 'Forty thousand people who went to the same place, in one afternoon, once a '
            + 'week. It is the answer that is true and unfashionable.',
          wrote: 'The commissioner said the sport exists to be the front porch of a university.',
          effects: { tradition: 2, money: -0.8 },
          aimed: { Fans: { tradition: 2.6 }, Presidents: { cost: 0.6 },
            Networks: { inventory: -0.6 } } },
        { id: 'players', label: 'It is for the players',
          body: 'Four years, a degree if they want it, and the only stage most of them will '
            + 'ever have. Say that in front of the people who set the share.',
          wrote: 'The commissioner said the sport is for the people playing it.',
          effects: { labour: 1.8, cost: 0.6, tradition: 0.4 },
          aimed: { Players: { labour: 2.4 }, Presidents: { cost: -0.8 },
            Fans: { tradition: 0.6 } } },
        { id: 'honest', label: 'Say it is an industry now',
          body: 'It is a television business with a campus attached and pretending otherwise is '
            + 'how people get lied to. Nobody has ever said this on the first day of July.',
          wrote: 'The commissioner called college football a television business with a campus attached.',
          effects: { money: 1.6, tradition: -2, exposure: 0.8 },
          aimed: { Networks: { money: 1.4 }, Fans: { tradition: -2.6 },
            Players: { labour: 0.8 }, Presidents: { exposure: -1 } } },
      ],
    },
    {
      id: 'q-pool',
      weight: 4,
      who: 'tv',
      when: (w) => (w.money.dealYears || 0) <= 3,
      cast: (w) => ({ years: w.money.dealYears, pool: w.money.pool }),
      desk: () => 'and works for the company on the other side of the next deal',
      ask: (c) => 'The deal has ' + (c.years <= 0 ? 'run out' : c.years === 1 ? 'a year left'
        : c.years + ' years left') + '. Everyone in this room is going to write about the '
        + 'number. Give me something better than the number.',
      answers: [
        { id: 'more', label: 'Talk up the inventory',
          body: 'More windows, more games worth watching, and a postseason that sells itself. '
            + 'It is a negotiation conducted in public and it is what he came for.',
          wrote: 'The commissioner spent the answer describing the inventory. Analysts raised their projections.',
          effects: { inventory: 1.8, money: 1.4, tradition: -0.8 },
          aimed: { Networks: { inventory: 2 }, SEC: { money: 1.2 },
            Fans: { tradition: -1 } } },
        { id: 'less', label: 'Say the number is not the point',
          body: 'A bigger number that costs another Saturday night is a worse deal. Refuse the '
            + 'frame on the network\'s own broadcast.',
          wrote: 'The commissioner told the network\'s own reporter that the rights number is not the measure.',
          effects: { tradition: 1.8, inventory: -1.2, money: -0.8 },
          aimed: { Fans: { tradition: 2.2 }, Networks: { inventory: -1.6 },
            'Big Ten': { money: -0.8 } } },
        { id: 'split', label: 'Say where it is going',
          body: 'Commit publicly that a share of the next deal reaches the players before it '
            + 'reaches anybody else. Two leagues stop listening at that sentence.',
          wrote: 'The commissioner said players are first in line on the next media deal.',
          effects: { labour: 2, money: -0.6, cost: 1.2 },
          aimed: { Players: { labour: 2.8 }, SEC: { money: -1.4 },
            'Big Ten': { money: -1.2 }, Presidents: { cost: -1 } } },
      ],
    },
  ];

  const BY_ID = {};
  QUESTIONS.forEach((q) => { BY_ID[q.id] = q; });

  /* ---- picking a set ----
     THE SET IS FIXED WHEN THE CONFERENCE STARTS, not question by question, and it is stored on
     the world. A player who closes the tab between the second answer and the third comes back
     to the same third question, which is the difference between a press conference and a slot
     machine. */

  function text(v, cast, q, sit, world) {
    return typeof v === 'function' ? v(cast, q, sit, world) : v;
  }

  function castOf(q, world, L, sit) {
    return q && q.cast ? q.cast(world, L, sit || null) : null;
  }

  /* What this question asks, with the cast in it. `askOf` wins when a question needs the world
     as well, which is rare enough not to be the default signature. */
  function askText(q, cast, sit, world) {
    if (q.askOf) return q.askOf(cast, q, sit, world);
    return text(q.ask, cast, q, sit, world);
  }

  /* Every question this world could produce right now. A question whose cast comes back empty
     is dropped rather than rendered with a hole in it: `when` and `cast` can disagree, and the
     way that shows up on screen is "A quarterback started nine games for undefined". */
  function eligible(world, L, sit) {
    return QUESTIONS.filter((q) => {
      try {
        if (q.when && !q.when(world, L, sit || null)) return false;
        if (q.cast && !q.cast(world, L, sit || null)) return false;
      } catch (e) { return false; }
      return true;
    });
  }

  /* Every question ever put to this commissioner, most recent first, across the whole term. */
  function history(world) {
    const p = (world && world.press) || {};
    return Object.keys(p).sort((a, b) => Number(b) - Number(a))
      .reduce((all, y) => all.concat((p[y].qs || []).map((id) => ({ year: Number(y), id }))), []);
  }
  /* HOW MANY YEARS AGO SOMEBODY LAST ASKED THIS. A room that asks the same question in
     consecutive Julys is a room that has stopped paying attention, and the fix is the docket's
     own: heavily against rather than forbidden, because sometimes it really is still the
     story. */
  function since(world, id) {
    const h = history(world).filter((r) => r.id === id);
    if (!h.length) return 99;
    return Math.max(0, ((world && world.year) || 0) - h[0].year);
  }

  function pickSet(world, L, rng, sit, n) {
    const want = n || ASKED;
    const pool = eligible(world, L, sit).slice();
    const out = [];
    while (pool.length && out.length < want) {
      /* HOW HARD A REPEAT IS PUSHED AWAY. Not forbidden, because a pool can be small: a world
         where only four questions are eligible has to be able to ask one of them twice rather
         than hand back a two question press conference. So the weight collapses instead, and
         `Math.max` keeps every question selectable as a last resort.

         AT A QUARTER IT WAS NOT ENOUGH. Measured over sixty terms against a world that never
         changes, a quarter still put the same question two Julys running in most of them and
         left the thinnest term seeing eight different ones out of fifteen. Two hundredths
         reads as never in practice and still degrades rather than throwing. */
      const w = pool.map((q) => {
        const ago = since(world, q.id);
        return Math.max(0.01, (q.weight || 1)
          * (ago === 0 ? 0.005 : ago === 1 ? 0.02 : ago === 2 ? 0.4 : 1));
      });
      const total = w.reduce((t, x) => t + x, 0);
      let r = (rng ? rng() : 0.5) * total;
      let i = 0;
      for (; i < pool.length; i++) { r -= w[i]; if (r <= 0) break; }
      if (i >= pool.length) i = pool.length - 1;
      out.push(pool[i].id);
      pool.splice(i, 1);
    }
    return out;
  }

  /* ---- one answer, as a push ----
     NOT A LEDGER EDIT. There is no `set` and no `move` here and there never will be: the whole
     rule of this screen is that talking does not write the rules. What comes back is the shape
     blocs.react() reads, plus the promise if the answer made one. */
  function answerOf(q, id) {
    return (q.answers || []).find((a) => a.id === id) || null;
  }

  function resolve(q, answerId, cast) {
    const a = answerOf(q, answerId);
    if (!a) throw new Error('media: no answer "' + answerId + '" on "' + q.id + '"');
    return {
      id: q.id + ':' + a.id,
      effects: Object.assign({}, a.effects || {}),
      aimed: JSON.parse(JSON.stringify(a.aimed || {})),
      /* A PROMISE MAY BE ABOUT SOMEBODY IN PARTICULAR, which is a question about the world
         and therefore about the cast. Only the rescue needs it, and one optional function is
         cheaper than a second field the other six would leave empty. */
      promise: typeof a.promise === 'function' ? a.promise(cast, q) : (a.promise || null),
      wrote: a.wrote || null,
    };
  }

  /* THE WHOLE CONFERENCE AS ONE PUSH, which is how the room answers it. Three separate
     reactions would deal the player three sets of nine numbers for one walk to a lectern, and
     the room does not form three opinions of you in twenty minutes, it forms one.

     `press:<year>` as the id, and ledger.isRuling() excludes that prefix: taking questions is
     not a ruling, and counting it as one would move the advisory council's gate and the
     doctrine profile by three every July. */
  /* HOW MUCH OF A RULING A PRESS CONFERENCE IS WORTH. Three answers stacked at full strength
     came out BIGGER than a decision: measured against every option in the docket, one ruling
     moves its most affected bloc 14.5 points at the median and a press conference was moving
     one 16.7. A mode where the fastest way to move the room is to talk has a dominant strategy
     in it and the desk is decoration.

     Six tenths puts the median at about ten, which is two thirds of a ruling: enough that a
     July is worth thinking about, not enough that it is the game. Applied once, at the end, so
     the three answers are still weighed against each other at full size on the screen where
     they are chosen. */
  const VOICE = 0.6;

  function combine(world, answers) {
    const edit = { id: 'press:' + ((world && world.year) || 0),
      label: 'Media days ' + ((world && world.year) || ''), effects: {}, aimed: {} };
    (answers || []).forEach((r) => {
      for (const axis in r.effects || {}) {
        edit.effects[axis] = (edit.effects[axis] || 0) + r.effects[axis];
      }
      for (const b in r.aimed || {}) {
        edit.aimed[b] = edit.aimed[b] || {};
        for (const axis in r.aimed[b]) {
          edit.aimed[b][axis] = (edit.aimed[b][axis] || 0) + r.aimed[b][axis];
        }
      }
    });
    for (const a in edit.effects) edit.effects[a] = Math.round(edit.effects[a] * VOICE * 100) / 100;
    for (const b in edit.aimed) {
      for (const a in edit.aimed[b]) {
        edit.aimed[b][a] = Math.round(edit.aimed[b][a] * VOICE * 100) / 100;
      }
    }
    return edit;
  }

  /* ---- what the guards walk ----
     Every string this file can put on screen, reachable without a world. The width guards in
     the browser suite measure quotes rather than trusting them to be short, and a sentence
     that only exists inside a `cast` function is a sentence nothing measures. Questions whose
     ask is a function are exercised against a synthetic cast instead, so the guard still sees
     something the shape of the real thing. */
  const SAMPLE = {
    conf: 'Big 12', by: -0.04, from: 0.16, to: 0.12,
    up: { conf: 'SEC', by: 0.05 }, down: { conf: 'ACC', by: -0.05 },
    share: 0.22, pool: 1.3, kind: 'employee', years: 2, window: true,
    shut: 'Big Ten', open: 'SEC', teams: 16, bids: 4, n: 5, size: 5,
    champ: 'Ohio State', ot: 'sudden', clock: 'stopped', tg: 'review',
  };
  const SAMPLE_WORLD = { year: 2027, money: { pool: 1.3, dealYears: 2 } };
  function saysOf(q) {
    const c = q.cast ? Object.assign({ school: 'Texas' }, SAMPLE,
      { from: 'Oregon', to: 'Miami' }) : null;
    const out = [];
    try { out.push(String(askText(q, c, null, SAMPLE_WORLD))); } catch (e) { out.push(''); }
    try { out.push(String(text(q.desk, c, q, null, SAMPLE_WORLD) || '')); } catch (e) { out.push(''); }
    (q.answers || []).forEach((a) => {
      out.push(String(a.label)); out.push(String(a.body)); out.push(String(a.wrote || ''));
    });
    return out.filter(Boolean);
  }

  const publicAPI = { QUESTIONS, BY_ID, ASKERS, ASKED, VOICE,
    eligible, pickSet, castOf, askText, text, answerOf, resolve, combine,
    history, since, saysOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.PS_CFB_MEDIA = publicAPI;
})();
