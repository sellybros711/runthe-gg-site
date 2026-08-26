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

  /* THE HOST SITES AND THE SPONSORS, for the items whose options are real cities. Optional
     and guarded at every use: a caller without venues.js loaded gets a docket with the venue
     items quietly ineligible rather than a file that will not load. */
  var VEN = (typeof window !== 'undefined' && window.PS_CFB_VENUES)
    || (typeof require === 'function' ? require('./venues.js') : null);

  /* Beat indices, matching ledger.BEATS. Named here so an item reads as a date rather than
     as a number, and so a renumbered calendar breaks loudly in one place. */
  const WINTER = 0, PORTAL = 1, SPRING = 2, MEDIA = 3,
    SEPT = 4, OCT = 5, NOV = 6, CHAMP = 7, PLAYOFF = 8;

  /* MONEY, IN THE UNIT SOMEBODY WOULD SAY IT IN. The ledger keeps the pool in billions
     because that is how the pool is argued about, but a THREE HUNDRED MILLION shortfall
     printed as "$0.30B" reads as a rounding error rather than as a third of a billion
     dollars. Anything under a billion goes to millions. */
  const money = (bnValue) => (Math.abs(bnValue) >= 1
    ? '$' + bnValue.toFixed(2) + 'B'
    : '$' + Math.round(bnValue * 1000) + 'M');

  /* Conferences with enough members left to behave like one. */
  const live = (w, L) => L.POWERS.filter((c) => !L.isDefunct(w, c));
  const moveAll = (c) => {
    const out = {};
    if (c) c.schools.forEach((s) => { out[s] = c.to; });
    return out;
  };

  const ITEMS = [
    /* ================================================================
       WHEN A FUSE GOES OFF.

       The three pressures sat on the office screen for a whole term being decorative: the
       highest any of them ever reached across a hundred and twenty terms was 44 out of 100,
       so no threshold existed that would ever have fired. They are reachable now, and these
       are what they reach.

       A crisis is not weighted, it is FORCED: pick() returns one ahead of everything else,
       because a lawsuit does not wait for a quiet week. Every option is bad, which is the
       point of a fuse, and each one writes the pressure back down because a thing that has
       happened stops being a thing that might.
       ================================================================ */
    {
      id: 'crisis-legal',
      beats: [WINTER, PORTAL, SPRING, MEDIA, SEPT, OCT, NOV, CHAMP, PLAYOFF],
      weight: 100,
      crisis: true,
      /* A COOLDOWN, BECAUSE A LAWSUIT TAKES YEARS. Without one, reckless play fired
         eleven crises in a five year term: the pressure is written back down, the same
         behaviour pushes it straight back over the line, and a thing that happens every
         fourth beat is not a crisis, it is weather. Eighteen beats is two seasons,
         so the sport gets one of these at a time and remembers it. */
      when: (w) => (w.pressure.legal || 0) >= 46 && sinceRuled(w, 'crisis-legal') >= 18,
      eyebrow: 'Filed',
      title: 'The complaint has been filed',
      brief: 'Forty-one pages, a class of every athlete affected, and treble damages. Counsel '
        + 'for three conferences read it before this office did and two of them have already '
        + 'said in writing that the rule was not their idea.',
      voices: [
        { id: 'Presidents', say: 'We told you this exact paragraph would end up in a filing.' },
        { id: 'Players', say: 'It took four years and somebody finally wrote it down properly.' },
        { id: 'SEC', say: 'Whatever this costs, it is not coming out of our distribution.' },
      ],
      options: [
        { id: 'settle', label: 'Settle it',
          body: 'Write the cheque, take the finding, and move on. It is the most expensive '
            + 'afternoon in the history of this office and it ends on a date you choose.',
          edit: { set: { 'pressure.legal': 14 },
            effects: { cost: 3.4, money: -2.4, labour: 2, exposure: -2.6, autonomy: -1.2 },
            aimed: { Presidents: { cost: -3 }, Players: { labour: 2.6 },
              SEC: { money: -2 } } } },
        { id: 'fight', label: 'Fight it all the way',
          body: 'Four years, appellate courts, and a result that binds the whole sport either '
            + 'way. Nobody who has done this has enjoyed the discovery phase.',
          edit: { set: { 'pressure.legal': 24 },
            effects: { cost: 1.6, exposure: 1.4, autonomy: 1.8, labour: -1.6 },
            aimed: { Presidents: { exposure: -2.4 }, Players: { labour: -2.2 },
              SEC: { autonomy: 1.6 } } } },
        { id: 'repeal', label: 'Repeal the rule they are suing over',
          body: 'Concede the point before a judge makes it for you. Cheap, humiliating, and '
            + 'it works.',
          edit: { set: { 'pressure.legal': 8, 'labour.eligibility': 5 },
            effects: { exposure: -3.2, labour: 1.6, autonomy: -2.4, tradition: -1 },
            aimed: { Presidents: { exposure: -2.8 }, Players: { labour: 1.8 },
              SEC: { autonomy: -2.2 }, 'Big Ten': { autonomy: -2 } } } },
      ],
    },
    {
      id: 'crisis-congress',
      beats: [WINTER, PORTAL, SPRING, MEDIA, SEPT, OCT, NOV, CHAMP, PLAYOFF],
      weight: 100,
      crisis: true,
      /* A COOLDOWN, BECAUSE A LAWSUIT TAKES YEARS. Without one, reckless play fired
         eleven crises in a five year term: the pressure is written back down, the same
         behaviour pushes it straight back over the line, and a thing that happens every
         fourth beat is not a crisis, it is weather. Eighteen beats is two seasons,
         so the sport gets one of these at a time and remembers it. */
      when: (w) => (w.pressure.congress || 0) >= 46 && sinceRuled(w, 'crisis-congress') >= 18,
      eyebrow: 'Washington',
      title: 'You have been asked to testify',
      brief: 'A subcommittee wants to know why a hundred and thirty schools playing the same '
        + 'sport under one set of rules is not the thing it obviously looks like. The letter '
        + 'was polite. The second letter had a date on it.',
      voices: [
        { id: 'Presidents', say: 'Whatever is said under oath is said on behalf of every institution here.' },
        { id: 'Group of Five', say: 'We have been asked to come too, and we are going to be honest.' },
        { id: 'Networks', say: 'A hearing is four hours of the sport being described by its enemies.' },
      ],
      options: [
        { id: 'antitrust', label: 'Ask for an antitrust exemption',
          body: 'Everything this office wants, granted by statute, in exchange for whatever '
            + 'Congress decides it wants in return. Nobody has ever known that number in '
            + 'advance.',
          edit: { set: { 'pressure.congress': 15 },
            effects: { exposure: -2.4, autonomy: -2.8, labour: -1.4, cost: 0.8 },
            aimed: { Presidents: { exposure: -2.6 }, Players: { labour: -2.4 },
              SEC: { autonomy: -2 } } } },
        { id: 'concede', label: 'Go and commit to something',
          body: 'Offer the thing they are going to legislate anyway and get credit for '
            + 'offering it. It costs money and it buys two years of quiet.',
          edit: { set: { 'pressure.congress': 12 },
            effects: { labour: 2.2, cost: 2, exposure: -1.6, money: -1.2 },
            aimed: { Players: { labour: 2.6 }, Presidents: { cost: -1.8 },
              SEC: { cost: -1.6 } } } },
        { id: 'stonewall', label: 'Go and say nothing',
          body: 'Answer every question with the phrase student athlete. It will be clipped, '
            + 'it will be played on television for a week, and nothing will be conceded.',
          edit: { set: { 'pressure.congress': 28 },
            effects: { exposure: 2, autonomy: 2.2, labour: -1.2, tradition: -1.4 },
            aimed: { SEC: { autonomy: 2 }, Players: { labour: -2 },
              Presidents: { exposure: 2.4 } } } },
      ],
    },
    {
      id: 'crisis-union',
      beats: [WINTER, PORTAL, SPRING, MEDIA, SEPT, OCT, NOV, CHAMP, PLAYOFF],
      weight: 100,
      crisis: true,
      /* A COOLDOWN, BECAUSE A LAWSUIT TAKES YEARS. Without one, reckless play fired
         eleven crises in a five year term: the pressure is written back down, the same
         behaviour pushes it straight back over the line, and a thing that happens every
         fourth beat is not a crisis, it is weather. Eighteen beats is two seasons,
         so the sport gets one of these at a time and remembers it. */
      when: (w) => (w.pressure.union || 0) >= 46 && sinceRuled(w, 'crisis-union') >= 18,
      eyebrow: 'The players',
      title: 'They have voted to organise',
      brief: 'Two rosters filed, then eleven, then a number nobody in this office wants to '
        + 'read out. The vote was not close and the week it was announced was the week before '
        + 'championship weekend, which was not an accident.',
      voices: [
        { id: 'Players', say: 'We asked for four years. This is what asking became.' },
        { id: 'Presidents', say: 'Recognition makes them employees. Everything follows from that word.' },
        { id: 'Networks', say: 'If there is no championship weekend there is no contract to talk about.' },
      ],
      options: [
        { id: 'recognise', label: 'Recognise them and bargain',
          body: 'The end of a hundred years of pretending. Every cost in this sport becomes '
            + 'negotiable and every rule becomes a term of employment.',
          edit: { set: { 'pressure.union': 10, 'labour.employment': 'employee' },
            effects: { labour: 3.4, cost: 3, exposure: -2, autonomy: -2, money: -1 },
            aimed: { Players: { labour: 3.6 }, Presidents: { cost: -3.2 },
              SEC: { cost: -2.4 }, 'Group of Five': { cost: -2.6 } } } },
        { id: 'bargain-lite', label: 'Bargain without recognising anybody',
          body: 'A council, a seat at a table, and a set of commitments that are not a '
            + 'contract. It holds for as long as everybody wants it to.',
          edit: { set: { 'pressure.union': 30 },
            effects: { labour: 1.6, cost: 1.2, exposure: 0.8 },
            aimed: { Players: { labour: 1.4 }, Presidents: { exposure: -0.8 } } } },
        { id: 'resist', label: 'Contest every filing',
          body: 'Board hearings, appeals, and a public argument about whether the people '
            + 'playing the games work here. Somewhere in it, a Saturday does not happen.',
          edit: { set: { 'pressure.union': 30 },
            effects: { labour: -2.8, exposure: 2.6, cost: 1, inventory: -1.6 },
            aimed: { Players: { labour: -3.4 }, Networks: { inventory: -2 },
              Presidents: { exposure: 2.2 } } } },
      ],
    },
    /* THE THIN BEATS. Measured across two hundred terms with the in-season items in: the
       portal item still came up 5.0 times in a five year term, every year without exception,
       because it was the only thing eligible on its beat. A recency penalty cannot help when
       there is nothing to lose to, so the fix is candidates rather than weights. */
    {
      id: 'collectives',
      beats: [PORTAL, SPRING],
      weight: 5,
      when: (w) => w.labour.nil !== 'school-paid',
      eyebrow: 'The money',
      title: 'Nobody knows who is paying whom',
      brief: 'Signing day came and went and the biggest numbers in it were paid by entities '
        + 'that do not appear on any athletic department budget. Everybody in the sport knows '
        + 'roughly what happened and nobody can produce a document.',
      voices: [
        { id: 'Presidents', say: 'We are certifying compliance with a system we cannot see.' },
        { id: 'Players', say: 'It is the first honest market this sport has ever had.' },
        { id: 'SEC', say: 'Every school does this. The ones complaining do it hardest.' },
      ],
      options: [
        { id: 'onto-books', label: 'Put it on the athletic department books',
          body: 'One employer, one number, one place to audit. It ends the pretence and it '
            + 'starts an argument with every labour lawyer in the country.',
          edit: { set: { 'labour.nil': 'school-paid' },
            effects: { labour: 2, exposure: 1.8, cost: 2.2, autonomy: -1.4 },
            aimed: { Players: { labour: 2.4 }, Presidents: { cost: -2, exposure: -2.4 } } } },
        { id: 'register', label: 'Register the collectives and publish the totals',
          body: 'They keep operating, they file, and the numbers are public. Sunlight, and '
            + 'about forty new ways to be non-compliant.',
          edit: { effects: { exposure: -1, cost: 0.8, labour: -0.4, tradition: 0.6 },
            aimed: { Presidents: { exposure: -1.6 }, Players: { labour: -0.8 },
              SEC: { autonomy: -1.2 } } } },
        { id: 'hands-off', label: 'It is not this office\'s business',
          body: 'Third parties paying third parties. Every time this office has touched it, '
            + 'it has lost in court.',
          edit: { effects: { exposure: 2.2, autonomy: 1.6, labour: 0.8 },
            aimed: { Presidents: { exposure: 2.6 }, Players: { labour: 1 } } } },
      ],
    },
    {
      id: 'roster-limits',
      beats: [PORTAL],
      weight: 5,
      when: () => true,
      eyebrow: 'The roster',
      title: 'How big a roster is',
      brief: 'The number has never been written down properly. Some programmes carry a '
        + 'hundred and twenty and some carry eighty five, the difference is mostly walk-ons, '
        + 'and every version of a cap ends somebody\'s career on a Tuesday in February.',
      voices: [
        { id: 'Players', say: 'A cap is a cut list. Say that part out loud.' },
        { id: 'Presidents', say: 'A hard number is the only way any of this gets budgeted.' },
        { id: 'Fans', say: 'The walk-on who makes the team is the best story this sport has.' },
      ],
      options: [
        { id: 'hard-cap', label: 'A hard cap, fully funded',
          body: 'Everybody on the roster is on scholarship and the roster is smaller. Cleaner, '
            + 'fairer to the ones who stay, and a lot of people do not stay.',
          edit: { effects: { cost: 1.8, labour: 0.6, tradition: -2, exposure: 0.8 },
            aimed: { Players: { labour: -0.8 }, Fans: { tradition: -2.2 },
              Presidents: { cost: -1.4 } } } },
        { id: 'soft', label: 'A cap on scholarships, not on bodies',
          body: 'The walk-on survives. So does the hundred and thirty man roster and the '
            + 'argument about what those players are owed.',
          edit: { effects: { tradition: 1.6, cost: -0.6, exposure: 1 },
            aimed: { Fans: { tradition: 2 }, Players: { labour: -0.6 } } } },
        { id: 'conference', label: 'Let each conference set its own',
          body: 'Four different numbers, four different recruiting pitches, and one very '
            + 'predictable outcome.',
          edit: { effects: { autonomy: 2.4, access: -1.4, exposure: 0.6 },
            aimed: { SEC: { autonomy: 2 }, 'Group of Five': { access: -1.8 } } } },
      ],
    },
    {
      id: 'preseason-poll',
      beats: [MEDIA],
      weight: 5,
      when: () => true,
      eyebrow: 'Media days',
      title: 'The preseason poll is doing damage',
      brief: 'A list written in July by people who have watched nobody play decides who gets '
        + 'the benefit of the doubt in November. Two athletic directors have asked this office '
        + 'to make it go away and one of them is ranked fourth.',
      voices: [
        { id: 'Group of Five', say: 'We start outside it and there is no result that moves us in.' },
        { id: 'Networks', say: 'The poll is how we sell September. Take it and we are selling nothing.' },
        { id: 'Big Ten', say: 'It is a magazine cover that somehow became evidence.' },
      ],
      options: [
        { id: 'ban-early', label: 'No rankings until October',
          body: 'Six weeks of football decides who is good, instead of six weeks of football '
            + 'being graded against a guess.',
          edit: { effects: { access: 1.8, inventory: -1.2, tradition: -1 },
            aimed: { 'Group of Five': { access: 2.4 }, Networks: { inventory: -1.8 },
              SEC: { access: -1.2 } } } },
        { id: 'keep', label: 'Leave it. It sells September',
          body: 'It is unfair, it is fun, and it is the only reason anybody watches week two.',
          edit: { effects: { inventory: 1.4, tradition: 1, access: -1.2 },
            aimed: { Networks: { inventory: 1.6 }, 'Group of Five': { access: -1.6 } } } },
        { id: 'publish', label: 'Make the voters show their work',
          body: 'Every ballot public, every week, with a name on it. The poll survives and '
            + 'the people writing it start behaving like it matters.',
          edit: { effects: { exposure: -0.8, tradition: 0.6, access: 0.8, autonomy: -0.6 },
            aimed: { 'Group of Five': { access: 1.2 }, Presidents: { exposure: 0.8 } } } },
      ],
    },
    {
      id: 'injury-report',
      beats: [MEDIA, SEPT],
      weight: 4,
      when: (w) => w.posture.gambling !== 'banned',
      eyebrow: 'The integrity',
      title: 'Everybody wants the injury report',
      brief: 'Legal books are taking money on these games and they are pricing them off '
        + 'information that reaches the public through a message board on a Thursday. There '
        + 'is a version of this that ends with a twenty year old being followed to class.',
      voices: [
        { id: 'Presidents', say: 'These are student medical records. Somebody needs to say that.' },
        { id: 'Networks', say: 'The wagering audience is the reason weeknight ratings hold up.' },
        { id: 'Players', say: 'People find our accounts now. It is not abstract.' },
      ],
      options: [
        { id: 'mandate', label: 'Mandate a public availability report',
          body: 'Same as every professional league. The information is public, the leaks stop, '
            + 'and a medical privacy argument gets had in front of a judge sooner or later.',
          edit: { effects: { exposure: 1.6, inventory: 1.4, labour: -1.2, money: 0.8 },
            aimed: { Networks: { inventory: 1.8 }, Players: { labour: -1.8 },
              Presidents: { exposure: 1.6 } } } },
        { id: 'status-only', label: 'Availability only, no diagnosis',
          body: 'In or out, nothing else. It closes most of the market for leaks without '
            + 'publishing anybody\'s knee.',
          edit: { effects: { inventory: 0.8, exposure: 0.4, labour: -0.4 },
            aimed: { Networks: { inventory: 0.9 }, Players: { labour: -0.5 } } } },
        { id: 'refuse', label: 'Refuse. These are students',
          body: 'The sport does not publish medical information about people it insists are '
            + 'not employees. The leaks continue and so does the pretence.',
          edit: { effects: { labour: 1.4, exposure: 1.2, inventory: -1 },
            aimed: { Players: { labour: 2 }, Networks: { inventory: -1.2 },
              Presidents: { exposure: -0.8 } } } },
      ],
    },
    {
      id: 'bowl-season',
      beats: [CHAMP, PLAYOFF],
      weight: 5,
      when: (w) => w.posture.bowlTieIns,
      eyebrow: 'The postseason',
      title: 'Nobody is playing in the bowls',
      brief: 'Thirty-odd games between teams who finished 6-6, most of their best players '
        + 'already gone, in stadiums a third full, against a bracket that is on at the same '
        + 'time. The contracts run another four years.',
      voices: [
        { id: 'Fans', say: 'That trip used to be the reward for the season. Now it is a reason to opt out.' },
        { id: 'Group of Five', say: 'Those payouts are real money to us. They are a rounding error to them.' },
        { id: 'Networks', say: 'We bought a month of programming and half of it is unwatchable.' },
      ],
      options: [
        { id: 'cut', label: 'Cut the field in half',
          body: 'A bowl becomes something you earn again. Fifteen cities lose a game and '
            + 'about forty schools lose a week of December practice.',
          edit: { set: { 'posture.bowlTieIns': false },
            effects: { tradition: 1.4, inventory: -1.4, money: -1.2, access: -1 },
            aimed: { 'Group of Five': { money: -2.2 }, Fans: { tradition: 1.8 },
              Networks: { inventory: -1.6 } } } },
        { id: 'fold-in', label: 'Fold them into the bracket as early rounds',
          body: 'Everything in December is one tournament. The bowls keep their names, their '
            + 'cities and their sponsors, and stop being an exhibition.',
          edit: { set: { 'playoff.teams': 16 },
            effects: { access: 2.4, inventory: 2.2, tradition: -1.2, labour: -1.2 },
            aimed: { 'Group of Five': { access: 2.6 }, Networks: { inventory: 2.4 },
              Players: { labour: -1.6 } } } },
        { id: 'keep-bowls', label: 'Leave them alone',
          body: 'They are somebody\'s only postseason and the contracts are signed. It is a '
            + 'bad month of television and a good week for sixty athletic departments.',
          edit: { effects: { tradition: 0.8, money: 0.6, inventory: -0.9 },
            aimed: { 'Group of Five': { money: 1.6 }, Networks: { inventory: -1 } } } },
      ],
    },
    /* ================================================================
       THE FOOTBALL SEASON, WHICH USED TO HAVE NOTHING IN IT.

       Measured across two hundred terms, championship weekend and the playoff had something
       on the desk exactly zero percent of the time, September thirty-two percent and October
       twenty-two. The four offseason beats had something every single time. A commissioner
       sim where the job stops the moment the sport starts is the wrong way round, and it made
       a third of the calendar a button that said nothing was happening.

       Every item below is a real argument that happens between September and January, and
       each one is gated on the football that has actually been played where it can be.
       ================================================================ */
    {
      id: 'guarantee-games',
      beats: [SEPT],
      weight: 5,
      when: (w) => w.posture.nonRevGuarantee,
      eyebrow: 'The schedule',
      title: 'Nobody watched the first Saturday',
      brief: 'Half the sport opened against an opponent it paid to be there. The scores were '
        + 'what they always are, the stadiums emptied at half time, and everybody who sells '
        + 'advertising has spent the week asking whose idea it was.',
      voices: [
        { id: 'Networks', say: 'We are paying premium money for a scrimmage in a warm stadium.' },
        { id: 'Group of Five', say: 'That cheque is a third of our football budget. Ask before you take it.' },
        { id: 'SEC', say: 'Twelve games, and some of them are supposed to be easy. That is the deal.' },
      ],
      options: [
        { id: 'ban', label: 'Ban the guarantee game',
          body: 'Everybody plays somebody real. The best Saturdays in years, and about sixty '
            + 'athletic departments lose a line they were counting on.',
          edit: { set: { 'posture.nonRevGuarantee': false },
            effects: { inventory: 2.6, tradition: -1, cost: 1.8, money: 0.6 },
            aimed: { 'Group of Five': { money: -3, cost: 2 }, Networks: { inventory: 2 },
              SEC: { autonomy: -1.6 } } } },
        { id: 'cap', label: 'Cap it at one a year',
          body: 'One is a tune-up and three is a con. Nobody gets everything and nobody has '
            + 'to close a programme over it.',
          edit: { effects: { inventory: 1.4, cost: 0.5, autonomy: -1 },
            aimed: { 'Group of Five': { money: -1 }, Networks: { inventory: 1.2 } } } },
        { id: 'leave', label: 'Leave it alone',
          body: 'It funds the schools that need it and it costs the sport four bad Saturdays. '
            + 'That trade has been made every year for forty years.',
          edit: { effects: { inventory: -1.2, autonomy: 1.2, tradition: 0.6 },
            aimed: { 'Group of Five': { money: 1.5 }, Networks: { inventory: -1.4 } } } },
      ],
    },
    {
      id: 'officiating',
      beats: [SEPT, OCT],
      weight: 4,
      when: () => true,
      eyebrow: 'The officials',
      title: 'The call everybody saw',
      brief: 'A game between two teams who will both be in the argument in December turned on '
        + 'a call the replay booth had ninety seconds to fix and did not. It has been watched '
        + 'about forty million times since Saturday night.',
      voices: [
        { id: 'Fans', say: 'We all saw it. Just say it was wrong.' },
        { id: 'Presidents', say: 'Whatever this office says on Monday gets read out in a lawsuit one day.' },
        { id: 'Networks', say: 'We ran it fourteen times. We are not the problem here.' },
      ],
      options: [
        { id: 'admit', label: 'Say it was wrong, publicly',
          body: 'Name the error, name the crew, and take the week of coverage. Nobody has '
            + 'ever regretted telling the truth about a call. Several people have regretted '
            + 'the alternative.',
          edit: { effects: { tradition: 1.4, exposure: 0.8, autonomy: -0.6 },
            aimed: { Fans: { tradition: 2.4 }, Presidents: { exposure: 1.2 } } } },
        { id: 'quiet', label: 'Handle it internally',
          body: 'The crew is downgraded and nobody is told. It is what has always been done '
            + 'and it is why nobody believes anything this office says about officiating.',
          edit: { effects: { tradition: -1.6, autonomy: 1.2, exposure: -0.4 },
            aimed: { Fans: { tradition: -2.6 }, Networks: { inventory: -0.5 } } } },
        { id: 'centralise', label: 'Take replay off the conferences',
          body: 'One command centre, one standard, one place to point when it goes wrong '
            + 'again. Every conference loses something it has always controlled.',
          edit: { set: { 'rules.replay': 'central' },
            effects: { autonomy: -2.6, tradition: 0.8, exposure: -1.2, cost: 1.2 },
            aimed: { SEC: { autonomy: -2 }, 'Big Ten': { autonomy: -2 },
              Fans: { tradition: 1.4 } } } },
      ],
    },
    {
      id: 'flex-window',
      beats: [OCT],
      weight: 5,
      when: () => true,
      /* WHO IS ABOUT TO GET MOVED, off the real map rather than written down, so the item is
         about a rivalry that exists in the sport as the player has left it. */
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        if (!live.length) return null;
        const conf = live[Math.floor(rng() * live.length) % live.length];
        const members = L.membersOf(w, conf);
        if (members.length < 2) return null;
        const i = Math.floor(rng() * members.length) % members.length;
        let j = (i + 1 + Math.floor(rng() * (members.length - 1))) % members.length;
        if (j === i) j = (i + 1) % members.length;
        return { conf: conf, a: members[i], b: members[j] };
      },
      eyebrow: 'The windows',
      title: (c) => (c ? c.a + ' and ' + c.b + ' want their kickoff back'
        : 'A network wants to move a rivalry'),
      brief: (c) => (c
        ? 'A rights holder wants ' + c.a + ' and ' + c.b + ' at nine o clock eastern, in '
          + 'November, because it is the only thing on. Both athletic directors have written '
          + 'to this office. So have about eleven thousand season ticket holders.'
        : 'A rights holder wants the biggest game left on the board moved into a late window '
          + 'because it is the only thing on that night.'),
      voices: [
        { id: 'Networks', say: 'That window is worth more than the rest of the night put together.' },
        { id: 'Fans', say: 'People drive four hours to that game. With children.' },
        { id: 'Players', say: 'Kickoff at nine, off the bus at three, class on Monday.' },
      ],
      options: [
        { id: 'flex', label: 'Give them the window',
          body: 'The biggest audience the game has ever had, and the smallest crowd.',
          edit: { effects: { money: 1.8, inventory: 2.2, tradition: -2.4, labour: -0.8 },
            aimed: { Networks: { inventory: 2.4 }, Fans: { tradition: -2.6 } } } },
        { id: 'protect', label: 'Protect the kickoff',
          body: 'Some games are not inventory. Say so once, in writing, and be ready to say '
            + 'it again at the next negotiation.',
          edit: { effects: { tradition: 2.4, inventory: -1.4, money: -1.2 },
            aimed: { Fans: { tradition: 3 }, Networks: { inventory: -2.2, money: -1 } } } },
        { id: 'split', label: 'Sell the window, protect the date',
          body: 'They get a late kickoff. They do not get to move it off the Saturday it has '
            + 'been on since before anybody in the room was born.',
          edit: { effects: { money: 0.9, inventory: 1, tradition: -0.8 },
            aimed: { Networks: { inventory: 1 }, Fans: { tradition: -0.9 } } } },
      ],
    },
    {
      id: 'rankings-row',
      beats: [OCT, NOV],
      weight: 5,
      when: (w) => w.playoff.selection === 'committee',
      eyebrow: 'The rankings',
      title: 'The first rankings landed badly',
      brief: 'Twelve people in a hotel conference room published a list on Tuesday night and '
        + 'by Wednesday morning three athletic directors, two governors and a congressman had '
        + 'opinions about it.',
      voices: [
        { id: 'Group of Five', say: 'Undefeated, and behind two teams with a loss. Explain the method.' },
        { id: 'Presidents', say: 'A committee with no published criteria is a defendant waiting to happen.' },
        { id: 'SEC', say: 'The eye test exists for a reason. Some leagues are harder.' },
      ],
      options: [
        { id: 'publish', label: 'Publish the ballots',
          body: 'Every vote, every week, with a name on it. The arguments do not stop, they '
            + 'just become arguments about people instead of about a black box.',
          edit: { effects: { tradition: 1, exposure: -1.4, autonomy: -0.8 },
            aimed: { Fans: { tradition: 1.6 }, Presidents: { exposure: 1.6 },
              'Group of Five': { access: 1.2 } } } },
        { id: 'formula', label: 'Replace the committee with a formula',
          body: 'A number nobody can lobby. It will produce a result somebody hates in year '
            + 'one and it will produce the same result for everybody who hates it.',
          edit: { set: { 'playoff.selection': 'formula' },
            effects: { access: 1.6, exposure: -2, tradition: -1.4, autonomy: -1 },
            aimed: { 'Group of Five': { access: 2.4 }, SEC: { access: -1.8 },
              Presidents: { exposure: 2 } } } },
        { id: 'defend', label: 'Defend the committee',
          body: 'They watched the games, they are in the room, and this office is not going '
            + 'to referee the referees in public.',
          edit: { effects: { autonomy: 1.4, exposure: 0.8, access: -0.8 },
            aimed: { 'Group of Five': { access: -1.8 }, SEC: { autonomy: 1.2 } } } },
      ],
    },
    {
      id: 'dead-october',
      beats: [NOV],
      weight: 5,
      when: (w) => w.playoff.teams <= 12,
      eyebrow: 'The stakes',
      title: 'Most of the country is already out',
      brief: 'It is the second week of November and the number of teams with a live path to '
        + 'the field is smaller than the number of conferences. The rest are playing for a '
        + 'bowl in a city nobody wants to fly to.',
      voices: [
        { id: 'Networks', say: 'Six weeks of the season with nothing riding on it is six weeks we cannot sell.' },
        { id: 'Big 12', say: 'Our best team is out and it is the ninth of November.' },
        { id: 'SEC', say: 'A regular season that eliminates people is the entire product.' },
      ],
      options: [
        { id: 'expand', label: 'Widen the field again',
          body: 'More teams alive in November, and a first round that will be pointed at '
            + 'every time it is not competitive.',
          edit: { set: { 'playoff.teams': 16 },
            effects: { access: 2.6, inventory: 2, tradition: -1.6, labour: -0.8 },
            aimed: { 'Group of Five': { access: 2.4 }, SEC: { access: -2 },
              Networks: { inventory: 2.2 } } } },
        { id: 'playin', label: 'Add a play-in weekend',
          body: 'The teams on the bubble settle it on the field in December instead of in a '
            + 'hotel conference room. Two more games and one fewer argument.',
          edit: { set: { 'playoff.byes': 0 },
            effects: { access: 1.6, inventory: 1.8, labour: -1, tradition: -0.4 },
            aimed: { Networks: { inventory: 2 }, Players: { labour: -1.4 },
              'Big 12': { access: 1.6 } } } },
        { id: 'accept', label: 'That is what a regular season is',
          body: 'The games matter because losing them costs you. Making every November game '
            + 'survivable is how you end up with a sport nobody watches in September.',
          edit: { effects: { tradition: 1.8, access: -1.2, inventory: -0.8 },
            aimed: { SEC: { tradition: 1.6 }, 'Group of Five': { access: -2 },
              Networks: { inventory: -1.4 } } } },
      ],
    },
    {
      id: 'title-game-risk',
      beats: [CHAMP],
      weight: 5,
      when: (w) => w.playoff.teams >= 12,
      eyebrow: 'Championship weekend',
      title: 'Two conferences want to skip their title game',
      brief: 'Both their finalists are already in the field whatever happens on Saturday. '
        + 'What is left to play for is an injury and a seed, and two commissioners have '
        + 'written to ask whether the game is required.',
      voices: [
        { id: 'Big Ten', say: 'We are risking our best team in a game that decides nothing.' },
        { id: 'Networks', say: 'That Saturday is six games and we have already sold every one.' },
        { id: 'Fans', say: 'You cannot sell a championship and then tell us it does not count.' },
      ],
      options: [
        { id: 'required', label: 'The game is required',
          body: 'A conference championship is a championship. If it does not decide anything '
            + 'that is a problem with the bracket, not with the Saturday.',
          edit: { effects: { tradition: 2, inventory: 1.8, labour: -1, autonomy: -1.8 },
            aimed: { Networks: { inventory: 2.2 }, 'Big Ten': { autonomy: -2 },
              Fans: { tradition: 2 } } } },
        { id: 'optional', label: 'Let them decide',
          body: 'Their conference, their Saturday. Half of them will keep it and the two who '
            + 'do not will be the two everybody wanted to watch.',
          edit: { effects: { autonomy: 2.6, inventory: -2.2, tradition: -1.8, money: -1 },
            aimed: { 'Big Ten': { autonomy: 2.4 }, SEC: { autonomy: 2.4 },
              Networks: { inventory: -2.6 } } } },
        { id: 'seed-it', label: 'Make it worth something',
          body: 'Winning it is worth a bye and losing it is worth a seed. Nobody has to be '
            + 'told to take it seriously if it decides where they play in January.',
          edit: { set: { 'playoff.byes': 4 },
            effects: { inventory: 1.4, access: 0.8, tradition: 1.2 },
            aimed: { Networks: { inventory: 1.6 }, 'Group of Five': { access: -0.8 } } } },
      ],
    },
    {
      id: 'portal-timing',
      beats: [CHAMP, PLAYOFF],
      weight: 4,
      when: (w) => w.labour.portalWindows >= 1,
      eyebrow: 'The portal',
      title: 'The window opens during the playoff',
      brief: 'Four teams are still playing and their rosters are legally allowed to start '
        + 'looking for a new one. Two starters have already entered and one of them is '
        + 'expected to play on Saturday.',
      voices: [
        { id: 'Players', say: 'Every other worker in the country can look for a job in December.' },
        { id: 'SEC', say: 'We are being asked to prepare for a semi-final with a roster that is legally leaving.' },
        { id: 'Presidents', say: 'Whatever the rule is, it needs to survive somebody suing over it.' },
      ],
      options: [
        { id: 'move', label: 'Move the window to January',
          body: 'Nobody enters until the last game is played. Cleaner football, and a month '
            + 'of a player being told to wait while everybody else recruits.',
          edit: { effects: { labour: -1.8, tradition: 1.2, exposure: 1.4, inventory: 0.8 },
            aimed: { Players: { labour: -2.6 }, SEC: { autonomy: 1 } } } },
        { id: 'keep', label: 'Leave it where it is',
          body: 'It is inconvenient for four teams and it is the only leverage the other '
            + 'hundred and thirty rosters have.',
          edit: { effects: { labour: 1.4, tradition: -0.8, exposure: -0.8 },
            aimed: { Players: { labour: 2 }, SEC: { autonomy: -1 } } } },
        { id: 'protect', label: 'Freeze it for teams still playing',
          body: 'Your window opens when your season ends. Defensible, fiddly, and it will be '
            + 'litigated by somebody within two years.',
          edit: { effects: { labour: -0.6, tradition: 0.8, exposure: 0.9, cost: 0.4 },
            aimed: { Players: { labour: -1 }, Presidents: { exposure: -1.2 } } } },
      ],
    },
    {
      id: 'playoff-sites',
      beats: [PLAYOFF],
      weight: 5,
      when: (w) => w.playoff.sites !== 'campus' || w.playoff.teams > 4,
      eyebrow: 'The venues',
      title: 'Where the bracket is played',
      brief: 'The first round on a campus in December is the best television this sport has '
        + 'produced in twenty years. It is also the hardest ticket to sell in a neutral city '
        + 'and there are four of those with contracts.',
      voices: [
        { id: 'Fans', say: 'Snow, a full student section, and nobody flew anywhere. Keep it.' },
        { id: 'Networks', say: 'Campus games rate. We would like more of them and fewer half-empty domes.' },
        { id: 'Presidents', say: 'Those neutral site contracts were signed by people who are still in post.' },
      ],
      options: [
        { id: 'campus', label: 'Everything on campus until the final',
          body: 'The atmosphere the sport is famous for, and four cities with a bowl game and '
            + 'nothing to put in it.',
          edit: { set: { 'playoff.sites': 'campus', 'posture.bowlTieIns': false },
            effects: { tradition: 2.6, inventory: 1.8, money: -1, exposure: 0.8 },
            aimed: { Fans: { tradition: 3 }, Networks: { inventory: 2 },
              Presidents: { exposure: 1.2 } } } },
        { id: 'mixed', label: 'Campus early, neutral late',
          body: 'What is happening now, written down. Everybody gets something and the bowls '
            + 'keep the games they can still fill.',
          edit: { set: { 'playoff.sites': 'mixed' },
            effects: { tradition: 0.8, inventory: 0.6, money: 0.4 },
            aimed: { Fans: { tradition: 0.8 } } } },
        { id: 'neutral', label: 'Sell the whole bracket to cities',
          body: 'The most money, the least atmosphere, and a January the sport has been '
            + 'trying to get away from since the committee was invented.',
          edit: { set: { 'playoff.sites': 'neutral', 'posture.bowlTieIns': true },
            effects: { money: 2.4, tradition: -2.8, inventory: -1.4 },
            aimed: { Fans: { tradition: -3 }, Networks: { inventory: -1.6 },
              Presidents: { cost: 1 } } } },
      ],
    },
    /* ---------------------------------------------------------------- */
    {
      id: 'playoff-format',
      beats: [WINTER],
      weight: 9,
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
      /* SAY THE NUMBER. This brief opened "The pool is set", and a tester asked, reasonably,
         why it would not just print the figure: the pool is the largest number in the sport
         and the item is about how it splits, so naming it is the whole premise rather than a
         detail. It is a live figure now, so it also moves when the player moves it. */
      cast: (w) => ({ pool: (w.money && w.money.pool) || 1.3 }),
      brief: (c) => '$' + ((c && c.pool) || 1.3).toFixed(1) + 'B a year is on the table. How '
        + 'it splits is not, and it is the only number in the sport that everybody can recite '
        + 'from memory.',
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
        /* `unit` because a dial cannot be read off its step. This one steps by 0.3 and is
           billions of dollars; the players' share steps by 0.05 and is a percentage. The
           page inferred percent from any step under one and printed the media pool as
           "130%", which is a number about the right sport and the wrong thing entirely. */
        { id: 'pool', label: 'The pool', path: 'money.pool', unit: 'bn',
          base: 1.3, free: [1.3], pro: [1.0, 1.3, 1.6, 1.9, 2.2], step: 0.3,
          per: { money: 1.2, exposure: 0.3 },
          /* WHAT THIS SETTING ACTUALLY MEANS, priced against what the football earns. A
             tester dragged this dial across its whole range, watched nothing on the screen
             react, and asked why they could change it without it impacting anything. Half of
             that was a real hole in the engine, now settled every season. The other half was
             this: even once it bites, a number with no consequence written beside it is a
             number you cannot make a decision about. */
          reads: (v, ctx) => {
            const b = ctx.settle(v, ctx.perGame);
            if (!b.known) {
              return 'Nothing has been played yet. The first season is what prices this, and '
                + 'the sport currently expects to earn about what it pays out.';
            }
            const w = money(b.worth);
            if (b.gap >= 0.12) {
              return 'The football earns ' + w + '. You would be promising ' + money(b.gap)
                + ' a year the sport does not make, every year, until you stop.';
            }
            if (b.gap <= -0.12) {
              return 'The football earns ' + w + '. You would be holding ' + money(-b.gap)
                + ' of it back, and every athletic director in the country can do that '
                + 'subtraction.';
            }
            return 'The football earns ' + w + '. This is about what the sport can actually pay.';
          } },
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
        { id: 'revShare', label: 'The players\' share', path: 'labour.revShare', unit: 'pct',
          base: 0.2, free: [0.15, 0.2], pro: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35],
          step: 0.05, per: { labour: 1.4, cost: 1.2, money: -0.6 },
          /* A PERCENTAGE OF A NUMBER NOBODY NAMED. "20%" is not a decision until it is
             twenty per cent of something, and the something is on the same screen. */
          reads: (v, ctx) => {
            const pool = (ctx.world.money && ctx.world.money.pool) || 1.3;
            return Math.round(v * 100) + '% of a ' + money(pool) + ' pool is ' + money(pool * v)
              + ' a year to the players, and the same ' + money(pool * v)
              + ' a year that stops reaching the schools.';
          } },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'raid',
      beats: [NOV, WINTER],
      weight: 2,
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
      weight: 6,
      when: (w) => w.money.dealYears <= 2,
      /* WHAT THE SPORT ACTUALLY DREW, off the ratings the season screen has been recording
         all term. Until there was a viewership number this item was a guess dressed as a
         negotiation: the offer was the same whether the player had protected every rivalry
         or moved all of them to a Friday night stream. Now the number in the brief is the
         number the mode has been showing them since September. */
      cast: (w) => {
        const r = w.ratings || {};
        const years = Object.keys(r);
        if (!years.length) return { known: false };
        const per = years.reduce((t, y) => t + r[y].perGame, 0) / years.length;
        const title = years.reduce((t, y) => t + (r[y].title || 0), 0) / years.length;
        /* Against the sport as it was handed over. A commissioner who grew the audience is
           negotiating from somewhere different than one who did not, and the item should
           say which one they are before they choose. */
        const base = 1.7;
        return {
          known: true, years: years.length,
          per: Math.round(per * 100) / 100,
          title: Math.round(title * 10) / 10,
          up: per >= base * 1.06, down: per <= base * 0.94,
        };
      },
      eyebrow: 'The deal',
      title: 'The media rights are up',
      brief: (c) => {
        if (!c || !c.known) {
          return 'Everything you have done is about to be priced. The number that comes back '
            + 'is the number the next seven years of arguments are conducted in.';
        }
        const shape = c.up
          ? 'You are walking in with an audience that has grown, which is the only argument '
            + 'in this room that has ever worked.'
          : c.down
            ? 'You are walking in with an audience that has shrunk, and everybody on the '
              + 'other side of the table has the same spreadsheet you do.'
            : 'The audience is roughly where you found it, which buys you a fair hearing and '
              + 'nothing more.';
        return 'An average game drew ' + c.per.toFixed(2) + ' million across '
          + (c.years === 1 ? 'your first season' : c.years + ' seasons')
          + (c.title ? ', and the title game drew ' + c.title.toFixed(1) + ' million' : '')
          + '. ' + shape;
      },
      voices: [
        { id: 'Networks', say: 'One negotiation, clean windows, and we can be generous.' },
        { id: 'Big Ten', say: 'We are entitled to negotiate our own inventory and we both know what it is worth.' },
        { id: 'Fans', say: 'Not every game at eleven in the morning on a channel we have to buy twice.' },
      ],
      options: [
        { id: 'one-deal', label: 'Sell it as one package',
          body: 'The sport negotiates together. The most money, the least autonomy, and one '
            + 'phone number for every argument about a kickoff time for seven years.',
          edit: (c) => ({ set: { 'money.dealYears': 7 },
            effects: { money: c && c.up ? 4 : c && c.down ? 1.8 : 3, inventory: 2, autonomy: -3 },
            aimed: { Networks: { inventory: 2 }, SEC: { autonomy: -2 }, 'Big Ten': { autonomy: -2 } } }) },
        { id: 'per-conf', label: 'Let each conference sell its own',
          body: 'What is already happening, made official. The two biggest do very well and '
            + 'everybody else finds out what they are worth on their own.',
          edit: (c) => ({ set: { 'money.dealYears': 7 },
            effects: { money: c && c.up ? 1.8 : 1, autonomy: 3, access: -2, inventory: -1 },
            aimed: { SEC: { money: 3 }, 'Big Ten': { money: 3 }, 'Group of Five': { money: -2 } } }) },
        { id: 'streaming', label: 'Take the streaming money',
          body: 'More money now, a smaller audience, and a generation that finds the sport '
            + 'somewhere else or does not find it at all.',
          edit: (c) => ({ set: { 'money.dealYears': 7, 'posture.tvWindows': 8 },
            effects: { money: c && c.down ? 3.4 : 3, inventory: 1, tradition: -3 },
            aimed: { Fans: { tradition: -2 }, Networks: { inventory: -1 } } }) },
      ],
      dials: [
        { id: 'windows', label: 'Broadcast windows', path: 'posture.tvWindows',
          base: 5, free: [4, 5, 6], pro: [3, 4, 5, 6, 7, 8, 9],
          per: { inventory: 0.8, money: 0.5, tradition: -0.7 } },
      ],
    },
    {
      id: 'portal',
      beats: [PORTAL],
      weight: 3,
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
      weight: 1,
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

    /* ================================================================================
       THE SECOND DOCKET.
       Everything below reads `sit`, which is what situation.js says is going on right now:
       the week, who is unbeaten, what just got upset, how the audience is moving, which
       conference is two schools and a lawyer. The originals above are arguments the sport
       has every year; these are arguments the sport has when something in particular has
       happened, which is most of what a commissioner's year actually consists of.

       ABSURD IS NOT THE SAME AS UNGROUNDED. Every one of these has happened, nearly happened,
       or is one bad Tuesday from happening, because a sport where a mascot has been ejected
       from a game and a coach has been fined for a helicopter does not need inventing. The
       joke is the sport, and it lands only if the item plays it straight.
       ================================================================================ */

    /* ---------------- winter meetings ---------------- */
    {
      id: 'mascot-incident',
      beats: [WINTER],
      weight: 4,
      when: () => true,
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = live[Math.floor(rng() * live.length) % live.length] || 'the SEC';
        const m = L.membersOf(w, conf);
        const a = m[Math.floor(rng() * m.length) % m.length] || 'a member school';
        return { conf: conf, a: a };
      },
      eyebrow: 'The room',
      title: 'Two mascots have to be separated',
      brief: (c) => 'It is on the agenda in writing, under "conduct", because at a bowl game '
        + 'in December two costumed adults had a fight at midfield that required four state '
        + 'troopers. One of them was ' + ((c && c.a) || 'a member school') + '\'s. There is '
        + 'nine minutes of broadcast footage and it has been watched forty million times.',
      voices: [
        { id: 'Fans', say: 'It is the best thing that happened all bowl season and you know it.' },
        { id: 'Presidents', say: 'A person was injured. Inside a foam head, but injured.' },
        { id: 'Networks', say: 'We would like to be clear that we did not cut away.' },
      ],
      options: [
        { id: 'ban', label: 'Mascots stay off the field',
          body: 'Sidelines only, everywhere, from now on. Safe, sensible, and the single most '
            + 'unpopular thing this office will do all year.',
          edit: { effects: { tradition: -2.6, exposure: 1.4, cost: -0.4 },
            aimed: { Fans: { tradition: -3 }, Presidents: { exposure: 1.6 } } } },
        { id: 'fine', label: 'Fine both schools and move on',
          body: 'A number nobody will feel, a paragraph nobody will read, and the whole thing '
            + 'forgotten by March.',
          edit: { effects: { exposure: 0.4, tradition: -0.2 },
            aimed: { Presidents: { exposure: 0.6 } } } },
        { id: 'lean', label: 'Put them on the schedule again',
          body: 'Same bowl, same two mascots, and a camera on them for the whole game. You '
            + 'are either running a sport or you are running a sport.',
          edit: { effects: { inventory: 2.6, exposure: -2.2, tradition: 1.4, money: 1.2 },
            aimed: { Networks: { inventory: 3 }, Fans: { tradition: 2.4 },
              Presidents: { exposure: -2.6 } } } },
      ],
    },
    {
      id: 'trophy-redesign',
      beats: [WINTER],
      weight: 3,
      when: (w, L, sit) => !sit.firstYear,
      eyebrow: 'The hardware',
      title: 'The trophy is the wrong shape',
      brief: (c, it, sit) => 'The national championship trophy weighs thirty-five pounds, has '
        + 'a base that will not fit through a locker room door, and '
        + ((sit.previous && sit.previous.champion)
          ? sit.previous.champion + ' dropped it. On camera. Twice.'
          : 'the last team to win it dropped it. On camera. Twice.')
        + ' A design firm has sent this office four options and an invoice.',
      voices: [
        { id: 'Fans', say: 'It has looked like that my whole life. Leave it alone.' },
        { id: 'Networks', say: 'The current one photographs like a lamp.' },
        { id: 'Presidents', say: 'Whatever we pick will be on a hundred thousand t-shirts.' },
      ],
      options: [
        { id: 'keep', label: 'Keep the trophy',
          body: 'It is ugly and it is ours. Buy a wider door.',
          edit: { effects: { tradition: 2.2, cost: -0.6, inventory: -0.4 },
            aimed: { Fans: { tradition: 2.4 } } } },
        { id: 'new', label: 'Take the new one',
          body: 'Lighter, taller, and designed by people who have thought about how it looks '
            + 'held over a head at one in the morning.',
          edit: { effects: { inventory: 1.4, tradition: -2, cost: 1 },
            aimed: { Networks: { inventory: 1.6 }, Fans: { tradition: -2.4 } } } },
        { id: 'sponsor', label: 'Sell the naming rights to it',
          body: 'Somebody will pay a great deal of money to have their logo on the thing '
            + 'eighteen year olds cry on. That sentence is the entire argument, both ways.',
          edit: { effects: { money: 3, tradition: -3.4, exposure: 1.2 },
            aimed: { Fans: { tradition: -3.6 }, Networks: { money: 1.4 },
              Presidents: { exposure: -1.4 } } } },
      ],
    },
    {
      id: 'buyout-cap',
      beats: [WINTER],
      weight: 5,
      when: () => true,
      eyebrow: 'The coaches',
      title: 'Three schools are paying four coaches',
      brief: 'Two hundred and forty million dollars is currently being paid to men who do not '
        + 'work here any more. One athletic department is paying three head coaches at once and '
        + 'has a fourth on an airplane. Every president in the room voted for every one of '
        + 'those contracts and every one of them wants you to stop them doing it again.',
      voices: [
        { id: 'Presidents', say: 'We cannot govern ourselves on this. Say it out loud so we can blame you.' },
        { id: 'SEC', say: 'A cap on what we can pay is a cap on what we can be.' },
        { id: 'Players', say: 'Nobody has ever held a press conference about our buyouts.' },
      ],
      options: [
        { id: 'cap', label: 'Cap the buyouts',
          body: 'A ceiling on what a school can owe a coach it has fired. Everybody wanted '
            + 'this and nobody wanted to be the one who said it.',
          edit: { set: { 'posture.nonRevGuarantee': true },
            effects: { cost: -3, autonomy: -2.4, tradition: 0.6 },
            aimed: { Presidents: { cost: 3 }, SEC: { autonomy: -2.4 }, 'Big Ten': { autonomy: -2 } } } },
        { id: 'publish', label: 'Publish every contract',
          body: 'No cap. Just sunlight, every dollar of it, in a searchable table on a public '
            + 'website. Let the state legislatures do the rest.',
          edit: { effects: { exposure: -1.4, cost: -1.2, autonomy: -0.8, tradition: 0.4 },
            aimed: { Presidents: { exposure: -1.8 }, Fans: { tradition: 1.2 } } } },
        { id: 'nothing', label: 'It is their money',
          body: 'A school that wants to set fire to forty million dollars is exercising a '
            + 'freedom this office was not given to take away.',
          edit: { effects: { autonomy: 2.6, cost: 2.2, exposure: 1.4 },
            aimed: { SEC: { autonomy: 2.4 }, 'Big Ten': { autonomy: 2.2 },
              Presidents: { cost: -2.4 } } } },
      ],
    },
    {
      id: 'time-zones',
      beats: [WINTER, SPRING],
      weight: 4,
      when: (w, L, sit) => sit.endangered.length > 0 || sit.gone.length > 0,
      cast: (w, L, rng, sit) => {
        const c = sit.endangered[0] || sit.gone[0] || null;
        if (!c) return null;
        const m = L.membersOf(w, c);
        return { conf: c, school: m[Math.floor(rng() * m.length) % m.length] || null,
          size: m.length };
      },
      eyebrow: 'The map',
      title: (c) => (c ? c.conf + ' is down to ' + c.size : 'A conference is running out of members'),
      brief: (c) => (c
        ? c.conf + ' has ' + c.size + ' member' + (c.size === 1 ? '' : 's') + ' left and a '
          + 'television contract that assumes rather more. Their answer is to add four schools '
          + 'from three time zones, none of whom have played each other since the Ford '
          + 'administration. A volleyball team would fly eleven thousand miles in October.'
        : 'A conference down to nothing wants to add four schools from three time zones. A '
          + 'volleyball team would fly eleven thousand miles in October.'),
      voices: [
        { id: 'Group of Five', say: 'Every school in that plan is one of ours. Ask us how we feel about it.' },
        { id: 'Players', say: 'A Tuesday night game two thousand miles away is a Wednesday nobody goes to class.' },
        { id: 'Presidents', say: 'It is that or the conference stops existing, and then what happens to them?' },
      ],
      options: [
        { id: 'allow', label: 'Approve it',
          body: 'A conference is whatever a television contract says it is. That has been true '
            + 'for a decade and this is only the sentence that admits it.',
          edit: { effects: { money: 1.2, tradition: -3, labour: -2, access: 1.4 },
            aimed: { 'Group of Five': { access: 2 }, Players: { labour: -2.4 },
              Fans: { tradition: -2.6 } } } },
        { id: 'block', label: 'Block it',
          body: 'Geography is the last rule this sport has left. Hold it, and hold it knowing '
            + 'a conference may die of it.',
          edit: { effects: { tradition: 3, access: -2.4, autonomy: -2.6, money: -1 },
            aimed: { Fans: { tradition: 3 }, 'Group of Five': { access: -2.6 },
              Presidents: { autonomy: -1.6 } } } },
        { id: 'travel', label: 'Approve it, and make them pay for it',
          body: 'Charter flights, academic support and a travel fund for every sport that is '
            + 'not football, written into the approval. Expensive. Correct.',
          edit: { effects: { money: 0.4, cost: 3, labour: 2, tradition: -1.6, access: 1 },
            aimed: { Players: { labour: 2.6 }, Presidents: { cost: -2.4 },
              'Group of Five': { access: 1.4 } } } },
      ],
    },

    /* ---------------- portal and signing day ---------------- */
    {
      id: 'hat-ceremony',
      beats: [PORTAL],
      weight: 5,
      when: () => true,
      eyebrow: 'Signing day',
      title: 'The five star did the hats',
      brief: 'Three caps on a table, live on national television, at a high school in Georgia '
        + 'at eleven in the morning. He picked up two of them, put both down, reached under the '
        + 'table and produced a fourth hat from a school nobody in the room had on the list. '
        + 'His mother had not been told either. The clip is the most watched thing this sport '
        + 'has produced since January.',
      voices: [
        { id: 'Networks', say: 'Forty minutes of live television for the cost of a satellite truck.' },
        { id: 'Players', say: 'It is his day. He gets to have it however he wants it.' },
        { id: 'Presidents', say: 'A seventeen year old just held a press conference and we sent a camera.' },
      ],
      options: [
        { id: 'embrace', label: 'Make it an event',
          body: 'One broadcast, one afternoon, every commitment in the country. If this sport '
            + 'is going to televise children choosing hats it should at least do it properly.',
          edit: { effects: { inventory: 2.8, money: 1.6, exposure: -1.6, tradition: -1 },
            aimed: { Networks: { inventory: 3 }, Presidents: { exposure: -2 } } } },
        { id: 'quiet', label: 'Take the cameras out of the gyms',
          body: 'No broadcast, no live windows, no crews at schools. He can sign a piece of '
            + 'paper like his father did.',
          edit: { effects: { tradition: 2, inventory: -2.2, exposure: 1.8, money: -1.2 },
            aimed: { Networks: { inventory: -2.6 }, Presidents: { exposure: 2 },
              Players: { labour: -1.2 } } } },
        { id: 'agent', label: 'Let them have representation',
          body: 'If a seventeen year old is going to be on television negotiating a seven '
            + 'figure deal, he should be allowed somebody in the room whose job is him.',
          edit: { set: { 'labour.nil': 'school-paid' },
            effects: { labour: 3, exposure: -2.4, cost: 1.4, autonomy: -1 },
            aimed: { Players: { labour: 3.4 }, Presidents: { exposure: -2.2 } } } },
      ],
    },
    {
      id: 'portal-return',
      beats: [PORTAL],
      weight: 4,
      when: (w) => w.labour.portalWindows > 0,
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = live[Math.floor(rng() * live.length) % live.length];
        const m = L.membersOf(w, conf);
        return { school: m[Math.floor(rng() * m.length) % m.length] || null };
      },
      eyebrow: 'The portal',
      title: 'He entered the portal and came back',
      brief: (c) => 'A starting quarterback at ' + ((c && c.school) || 'a member school')
        + ' entered the portal on a Tuesday, was welcomed by four fanbases on Wednesday, and '
        + 'withdrew on Thursday to return to the same building he had been in on Monday. Two '
        + 'of those four schools had already announced him. One had printed a graphic.',
      voices: [
        { id: 'Players', say: 'He looked at his options and stayed. That is the system working.' },
        { id: 'ACC', say: 'We pulled an offer to a different player to hold that spot for him.' },
        { id: 'Fans', say: 'Our coordinator retired over this.' },
      ],
      options: [
        { id: 'oneway', label: 'The portal is one way',
          body: 'Enter it and you have left. Clean, brutal, and it will end somebody\'s career '
            + 'on a bad Tuesday.',
          edit: { effects: { labour: -3, cost: -1, exposure: 2.4, tradition: 1 },
            aimed: { Players: { labour: -3.4 }, Presidents: { exposure: -1.6 } } } },
        { id: 'window', label: 'Give it a shorter window and let him back',
          body: 'A week to decide, and a door that shuts behind everybody at the same time '
            + 'instead of staying open all February.',
          edit: { set: { 'labour.portalWindows': 1 },
            effects: { labour: -0.8, cost: -1.4, tradition: 1.2, inventory: -0.4 },
            aimed: { Players: { labour: -1 }, ACC: { cost: 1 }, 'Big 12': { cost: 1 } } } },
        { id: 'free', label: 'Leave it alone',
          body: 'He changed his mind. People do. Nothing in this is a problem except that it '
            + 'was on television.',
          edit: { effects: { labour: 1.6, exposure: -0.6, autonomy: 0.8 },
            aimed: { Players: { labour: 2 }, Fans: { tradition: -1 } } } },
      ],
    },
    {
      id: 'collective-waffle',
      beats: [PORTAL],
      weight: 4,
      when: (w) => w.labour.nil === 'collectives',
      eyebrow: 'The money',
      title: 'A collective offered him a restaurant',
      brief: 'Not a sponsorship. A franchise. A booster collective has offered a defensive '
        + 'tackle from Alabama the operating rights to a Waffle House on a road he has driven '
        + 'his whole life. It is, as far as anybody in this office can determine, entirely '
        + 'legal, and the projected revenue is better than the third best offer he has.',
      voices: [
        { id: 'Players', say: 'It is an actual business. It is there when the football stops.' },
        { id: 'Presidents', say: 'Our compliance office asked me what a franchise disclosure document is.' },
        { id: 'SEC', say: 'Every collective in the country is now looking at commercial property.' },
      ],
      options: [
        { id: 'allow', label: 'It is legal, so it is allowed',
          body: 'A deal is a deal. If the sport wanted a rule about this it had thirty years '
            + 'to write one.',
          edit: { effects: { labour: 2.4, autonomy: 2, exposure: -1.8, tradition: -1.4 },
            aimed: { Players: { labour: 3 }, Presidents: { exposure: -2 } } } },
        { id: 'cash', label: 'Cash and services only',
          body: 'Money, endorsements, appearances. Not equity, not property, not a business '
            + 'a nineteen year old now has to run in the spring.',
          edit: { effects: { labour: -1.6, exposure: 1.6, cost: -0.6, tradition: 0.8 },
            aimed: { Players: { labour: -2 }, Presidents: { exposure: 1.8 } } } },
        { id: 'school', label: 'Take it in house',
          body: 'If schools are paying players, schools should be paying players. End the '
            + 'collectives and put it on the athletic department\'s books where somebody can '
            + 'be held to it.',
          edit: { set: { 'labour.nil': 'school-paid' },
            effects: { labour: 2, cost: 3, exposure: -2.6, autonomy: -1.4 },
            aimed: { Players: { labour: 2.2 }, Presidents: { cost: -2.8, exposure: -1.6 } } } },
      ],
    },

    /* ---------------- spring ---------------- */
    {
      id: 'spring-flag',
      beats: [SPRING],
      weight: 4,
      when: () => true,
      eyebrow: 'The spring',
      title: 'Four schools want to play flag football',
      brief: 'Not as a joke. Four programmes have told this office that their spring game will '
        + 'be non-contact, in shorts, because they have twelve scholarship offensive linemen '
        + 'and a portal window in three weeks. One of them sold sixty thousand tickets to it '
        + 'before announcing that part.',
      voices: [
        { id: 'Fans', say: 'I paid for a football game in April. I would like a football game in April.' },
        { id: 'Players', say: 'Nobody has ever won anything in a spring game and people get hurt in them.' },
        { id: 'Networks', say: 'We have a window. We do not especially care what is in it.' },
      ],
      options: [
        { id: 'allow', label: 'Let them play whatever they want',
          body: 'It is April. Nothing that happens in it counts. Schools can run a scrimmage, '
            + 'a practice, or a seven on seven and sell tickets to any of them.',
          edit: { effects: { labour: 2, autonomy: 2.2, tradition: -2.4, inventory: -1.2 },
            aimed: { Players: { labour: 2.4 }, Fans: { tradition: -2.6 } } } },
        { id: 'refund', label: 'Allow it, and refund the tickets',
          body: 'Play whatever you like. If you sold it as football and it is not football, '
            + 'the money goes back.',
          edit: { effects: { labour: 1.6, cost: 1.4, tradition: 1, autonomy: -0.8 },
            aimed: { Players: { labour: 1.8 }, Fans: { tradition: 1.6 },
              Presidents: { cost: -1.4 } } } },
        { id: 'require', label: 'A spring game is a football game',
          body: 'If you are selling tickets to it, it has pads in it. Otherwise do not sell '
            + 'tickets to it.',
          edit: { effects: { tradition: 2.4, labour: -2.6, inventory: 1.2, autonomy: -1.8 },
            aimed: { Fans: { tradition: 2.6 }, Players: { labour: -3 } } } },
      ],
    },
    {
      id: 'drone',
      beats: [SPRING, MEDIA],
      weight: 4,
      when: () => true,
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = live[Math.floor(rng() * live.length) % live.length];
        const m = L.membersOf(w, conf);
        const i = Math.floor(rng() * m.length) % m.length;
        let j = (i + 1) % m.length;
        return { a: m[i] || null, b: m[j] || null, conf: conf };
      },
      eyebrow: 'The rules',
      title: 'There was a drone over the practice',
      brief: (c) => 'A camera drone spent forty minutes above a closed practice at '
        + ((c && c.a) || 'a member school') + ' before somebody on the staff hit it with a '
        + 'football. It came down in the end zone. The memory card was still in it, the '
        + 'footage is of installation periods, and the registration traces to a company owned '
        + 'by a booster at ' + ((c && c.b) || 'a conference rival') + '.',
      voices: [
        { id: 'Big Ten', say: 'We have a rule about filming practices. We do not have one about the sky.' },
        { id: 'Fans', say: 'Whoever threw that football deserves a scholarship.' },
        { id: 'Presidents', say: 'Two of our institutions are about to sue each other over a toy helicopter.' },
      ],
      options: [
        { id: 'punish', label: 'Vacate their opener and take a pick',
          body: 'Make an example while the sport is still finding it funny, because in three '
            + 'years everybody will have one of these.',
          edit: { effects: { tradition: 2, autonomy: -2.4, exposure: 1.2, access: -0.6 },
            aimed: { Presidents: { exposure: 1.4 }, SEC: { autonomy: -1.6 },
              'Big Ten': { autonomy: -1.6 } } } },
        { id: 'rule', label: 'Write an airspace rule and move on',
          body: 'No aircraft over a practice facility. Nobody is punished for breaking a rule '
            + 'that did not exist on the day.',
          edit: { effects: { cost: 0.6, tradition: 0.8, autonomy: -0.6 },
            aimed: { Presidents: { exposure: 0.6 } } } },
        { id: 'open', label: 'Open every practice instead',
          body: 'If the secrets are worth flying a drone for, the secrets are the problem. '
            + 'Media at every practice, cameras welcome, nothing to steal.',
          edit: { effects: { inventory: 2.6, tradition: -2, autonomy: -2.2, exposure: 1.6 },
            aimed: { Networks: { inventory: 3 }, SEC: { autonomy: -2.6 },
              'Big Ten': { autonomy: -2.4 }, Fans: { inventory: 1.4 } } } },
      ],
    },

    /* ---------------- media days ---------------- */
    {
      id: 'powerpoint',
      beats: [MEDIA],
      weight: 5,
      when: (w) => w.playoff.selection === 'committee',
      cast: (w, L, rng, sit) => {
        const c = sit.previous && sit.previous.champion ? sit.previous.champion : null;
        const live = L.POWERS.filter((x) => !L.isDefunct(w, x));
        return { champ: c, conf: live[Math.floor(rng() * live.length) % live.length] || 'the SEC' };
      },
      eyebrow: 'Media days',
      title: 'A coach brought slides',
      brief: (c) => 'He walked to the podium at media days with a clicker and a forty-one page '
        + 'deck titled "The Committee: A Pattern". Slide nineteen is a scatter plot. Slide '
        + 'thirty-three is a photograph of a committee member at a booster event. He went '
        + 'eleven minutes over and the room applauded.',
      voices: [
        { id: 'Networks', say: 'It is the highest rated thing we have ever aired in July.' },
        { id: 'Presidents', say: 'An employee accused a volunteer committee of corruption with a clicker.' },
        { id: 'Fans', say: 'Slide nineteen was right and everybody knows slide nineteen was right.' },
      ],
      options: [
        { id: 'fine', label: 'Fine him and defend the committee',
          body: 'The room has to be able to work. Say so, take his money, and accept that you '
            + 'have now made him the most popular man in the sport.',
          edit: { effects: { autonomy: -2, exposure: 1.6, tradition: 0.8, inventory: -0.6 },
            aimed: { Presidents: { exposure: 1.8 }, Fans: { tradition: -2 } } } },
        { id: 'publish', label: 'Publish the committee\'s ballots',
          body: 'Every vote, every week, with names on it. He wanted a pattern. Give the whole '
            + 'country the data and let them find one.',
          edit: { effects: { access: 2.4, exposure: -1.8, autonomy: -1, tradition: -0.8 },
            aimed: { Fans: { access: 2.6 }, 'Group of Five': { access: 2 },
              Presidents: { exposure: -2.2 } } } },
        { id: 'formula', label: 'Replace the committee with a formula',
          body: 'No room, no ballots, no slides. A published set of rules that produces the '
            + 'field, and nobody to be angry at except arithmetic.',
          edit: { set: { 'playoff.selection': 'formula' },
            effects: { access: 3, autonomy: -1.4, tradition: -2.6, exposure: 2.2 },
            aimed: { 'Group of Five': { access: 3 }, Fans: { access: 1.6, tradition: -2 },
              SEC: { access: -2 } } } },
      ],
    },
    {
      id: 'poll-error',
      beats: [MEDIA],
      weight: 3,
      when: () => true,
      eyebrow: 'The poll',
      title: 'The preseason poll has a mistake in it',
      brief: (c, it, sit) => 'The preseason poll went out at ten this morning with a school '
        + 'ranked twenty-second that does not field a football team. It fields a very good '
        + 'lacrosse team. Somebody merged two spreadsheets. It has been up for four hours, it '
        + 'has been screenshotted approximately everywhere, and the school in question has '
        + 'already sold out of shirts that say TWENTY SECOND.',
      voices: [
        { id: 'Networks', say: 'Leave it up. Leave it up. Leave it up.' },
        { id: 'Presidents', say: 'The poll is supposed to be the serious part.' },
        { id: 'Fans', say: 'They are the best story in the sport and they have not played a down.' },
      ],
      options: [
        { id: 'correct', label: 'Correct it and apologise',
          body: 'A quiet note, a fixed table, and a sport that behaves like a governing body '
            + 'for one afternoon.',
          edit: { effects: { tradition: 1, exposure: 0.8, inventory: -1.6 },
            aimed: { Presidents: { exposure: 1 }, Networks: { inventory: -2 } } } },
        { id: 'leave', label: 'Leave it up until the first Saturday',
          body: 'It is a preseason poll. It is wrong every year. This is the first time it has '
            + 'been wrong in a way anybody enjoyed.',
          edit: { effects: { inventory: 2.4, tradition: -1.4, exposure: -1.2, money: 0.8 },
            aimed: { Networks: { inventory: 2.8 }, Fans: { tradition: 1.6 },
              Presidents: { exposure: -1.8 } } } },
        { id: 'scrap', label: 'Scrap the preseason poll entirely',
          body: 'It has never once been right and it decides how the whole season gets argued '
            + 'about. Start ranking teams when teams have played.',
          edit: { effects: { access: 2.6, tradition: -2.2, inventory: -1.8, exposure: 1 },
            aimed: { 'Group of Five': { access: 2.8 }, Networks: { inventory: -2.2 },
              Fans: { tradition: -1.8 } } } },
      ],
    },

    /* ---------------- september ---------------- */
    {
      id: 'lightning',
      beats: [SEPT, OCT],
      weight: 5,
      when: (w, L, sit) => sit.played,
      cast: (w, L, rng, sit) => {
        const g = sit.biggest || null;
        return g ? { a: g.winner, b: g.loser, week: g.week } : null;
      },
      eyebrow: 'The weather',
      title: 'The game finished at two in the morning',
      brief: (c) => 'Six hours and forty minutes of lightning delays, four separate stadium '
        + 'evacuations, and a fourth quarter played in front of nine hundred people'
        + (c ? ' after ' + c.a + ' and ' + c.b + ' kicked off at noon' : '')
        + '. The band went home. The broadcast crew went home. Somebody\'s father drove eleven '
        + 'hours and watched two and a half quarters.',
      voices: [
        { id: 'Fans', say: 'Nine hundred of us stayed and I will be talking about it for thirty years.' },
        { id: 'Players', say: 'We warmed up four times. Four.' },
        { id: 'Networks', say: 'We were in a rain delay on a national window for six hours.' },
      ],
      options: [
        { id: 'curfew', label: 'A curfew: no kickoff after eleven',
          body: 'Past eleven the game is suspended and finished the next day. Sensible, and it '
            + 'will one day suspend a classic at the worst possible moment.',
          edit: { effects: { labour: 2.4, tradition: -1.6, inventory: -1.4, cost: 0.8 },
            aimed: { Players: { labour: 2.8 }, Networks: { inventory: -1.8 } } } },
        { id: 'finish', label: 'Games get finished',
          body: 'Whatever it takes, however long it takes. This sport has been doing it that '
            + 'way since before it had lights.',
          edit: { effects: { tradition: 2.2, labour: -2.4, inventory: 1.2 },
            aimed: { Fans: { tradition: 2.4 }, Players: { labour: -2.6 } } } },
        { id: 'domes', label: 'Neutral site domes for September',
          body: 'Move the biggest early games indoors. No weather, no delays, no atmosphere, '
            + 'and a September that looks like a television studio.',
          edit: { effects: { money: 2.4, inventory: 1.8, tradition: -3.2, access: -0.8 },
            aimed: { Networks: { inventory: 2.4 }, Fans: { tradition: -3.4 } } } },
      ],
    },
    {
      id: 'fcs-upset',
      beats: [SEPT, OCT],
      weight: 6,
      when: (w, L, sit) => !!sit.upset && sit.upset.gap >= 0.9,
      cast: (w, L, rng, sit) => sit.upset,
      eyebrow: 'The schedule',
      title: (c) => (c ? c.winner + ' were not supposed to win that'
        : 'Somebody won a game they were paid to lose'),
      brief: (c) => (c
        ? c.winner + ' beat ' + c.loser + ' ' + c.score[0] + '-' + c.score[1] + ' in week '
          + c.week + ', on the road, having been brought in to lose by four touchdowns for a '
          + 'cheque. ' + c.loser + '\'s athletic director has spent two days explaining a '
          + 'scheduling decision he made in 2019. The game drew '
          + ((c.viewers || 0).toFixed(1)) + ' million people, most of whom tuned in at half time.'
        : 'A team brought in to lose by four touchdowns for a cheque did not lose. The '
          + 'scheduling decision was made in 2019 by somebody who now has to explain it.'),
      voices: [
        { id: 'Group of Five', say: 'We have been telling you the gap is not what the money says it is.' },
        { id: 'Networks', say: 'Nobody watches those games until one of them turns into that.' },
        { id: 'Presidents', say: 'The guarantee game pays for our entire non revenue programme.' },
      ],
      options: [
        { id: 'ban', label: 'Ban the guarantee game',
          body: 'No more buying a win. Everybody plays somebody who can beat them, which is '
            + 'better football and about eleven million dollars a year out of the smaller '
            + 'athletic departments.',
          edit: { set: { 'posture.nonRevGuarantee': false },
            effects: { inventory: 2.6, access: -2.6, money: -1.8, tradition: -1 },
            aimed: { 'Group of Five': { money: -3, access: -2 }, Networks: { inventory: 2.4 },
              Presidents: { cost: -1.6 } } } },
        { id: 'reward', label: 'Pay them properly instead',
          body: 'Raise the guarantee, put a floor under it, and write into the contract that a '
            + 'win pays double. If the sport is going to sell these games it can price them '
            + 'honestly.',
          edit: { effects: { access: 2.8, cost: 2, money: -0.8, inventory: 1 },
            aimed: { 'Group of Five': { access: 3, money: 2.6 },
              Presidents: { cost: -2 }, SEC: { cost: -1.4 } } } },
        { id: 'nothing', label: 'Say nothing at all',
          body: 'One of the best days this sport has had in a decade happened because nobody '
            + 'was governing it. Do not govern it.',
          edit: { effects: { tradition: 1.6, autonomy: 1.4, inventory: 0.8 },
            aimed: { Fans: { tradition: 2 }, 'Group of Five': { access: 1 } } } },
      ],
    },
    {
      id: 'charter',
      beats: [SEPT, OCT],
      weight: 4,
      when: () => true,
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = live[Math.floor(rng() * live.length) % live.length];
        const m = L.membersOf(w, conf);
        return { school: m[Math.floor(rng() * m.length) % m.length] || null, conf: conf };
      },
      eyebrow: 'The travel',
      title: 'They arrived forty minutes before kickoff',
      brief: (c) => ((c && c.school) || 'A member school') + '\'s charter went technical on a '
        + 'runway in the dark, sat there for five hours, and put a hundred and twenty people '
        + 'on two commercial flights and a bus. They walked into the stadium at ten past one '
        + 'for a two o clock kickoff, in the clothes they had slept in, and lost by thirty-one. '
        + 'Nobody stopped the game because there is no rule that says you can.',
      voices: [
        { id: 'Players', say: 'We ate at a gas station and played a conference game.' },
        { id: 'Networks', say: 'The window is the window. We had it sold in March.' },
        { id: 'Fans', say: 'Ninety thousand people were already in the building.' },
      ],
      options: [
        { id: 'postpone', label: 'Write a postponement rule',
          body: 'A team that cannot get there can move the game. It will be abused within two '
            + 'seasons by somebody with a quarterback injury and a plausible fog.',
          edit: { effects: { labour: 2.6, inventory: -2, money: -1.4, cost: 1 },
            aimed: { Players: { labour: 3 }, Networks: { inventory: -2.4 } } } },
        { id: 'travel', label: 'Fund the travel centrally',
          body: 'The sport charters the sport. Expensive, boring, and it makes this somebody\'s '
            + 'actual job instead of a group chat at four in the morning.',
          edit: { effects: { cost: 3, labour: 2, autonomy: -1.6, money: -0.8 },
            aimed: { Players: { labour: 2.2 }, Presidents: { cost: -3 },
              'Group of Five': { cost: 2 } } } },
        { id: 'play', label: 'The game gets played',
          body: 'They got there. The ball was kicked off. This sport has played through worse '
            + 'than an airport.',
          edit: { effects: { tradition: 1.8, labour: -2.6, inventory: 1, autonomy: 1.2 },
            aimed: { Players: { labour: -3 }, Networks: { inventory: 1.4 },
              Fans: { tradition: 1.4 } } } },
      ],
    },
    {
      id: 'down-count',
      beats: [SEPT, OCT],
      weight: 5,
      when: (w, L, sit) => sit.played,
      cast: (w, L, rng, sit) => (sit.upset || sit.biggest || null),
      eyebrow: 'The officials',
      title: 'The crew lost count of the downs',
      brief: (c) => 'A fifth down. On a game winning drive'
        + (c ? ', in ' + c.winner + ' against ' + c.loser : '')
        + '. The chain crew knew, the sideline knew, forty thousand people in the stadium '
        + 'knew, and seven officials in the middle of the field did not. The play stood '
        + 'because there is no mechanism to review a down count, which everybody in this '
        + 'office has now read the rule book to confirm four separate times.',
      voices: [
        { id: 'Fans', say: 'Fifth down. FIFTH DOWN. In this century.' },
        { id: 'Networks', say: 'We had the graphic up. The graphic was right.' },
        { id: 'Presidents', say: 'The result of a game is now a question for lawyers.' },
      ],
      options: [
        { id: 'reverse', label: 'Reverse the result',
          body: 'The rule book is the rule book and the game was decided on a down that did '
            + 'not exist. Nobody has ever done this and everybody will find out what it costs.',
          edit: { effects: { tradition: -3, access: 2, exposure: -2.4, inventory: -1.6 },
            aimed: { Fans: { access: 1.4, tradition: -2.6 }, Presidents: { exposure: -2.8 } } } },
        { id: 'review', label: 'Make the down count reviewable',
          body: 'A booth official whose entire job is counting to four. It is the least '
            + 'glamorous rule change this sport will ever make and it will never happen again.',
          edit: { set: { 'rules.replay': 'full' },
            effects: { cost: 1.4, tradition: 0.6, inventory: -0.8, access: 1 },
            aimed: { Fans: { access: 1.6 }, Networks: { inventory: -1 } } } },
        { id: 'stand', label: 'The result stands',
          body: 'Officials are human, the game is over, and a sport that reopens results has '
            + 'no results. Say it plainly and take the week you are about to have.',
          edit: { effects: { tradition: 2.4, exposure: 1.8, access: -2 },
            aimed: { Fans: { tradition: -2.4, access: -2 }, Presidents: { exposure: 1.6 } } } },
      ],
    },

    /* ---------------- october ---------------- */
    {
      id: 'outsider-snub',
      beats: [OCT, NOV],
      weight: 7,
      when: (w, L, sit) => !!sit.outsider && sit.outsider.wins >= 6,
      cast: (w, L, rng, sit) => sit.outsider,
      eyebrow: 'The rankings',
      title: (c) => (c ? c.school + ' are ' + c.wins + '-0 and ranked fourteenth'
        : 'An unbeaten team is ranked below three teams with losses'),
      brief: (c) => (c
        ? c.school + ' have won ' + c.wins + ' games and lost none, and this week they are '
          + 'behind three teams with a loss each and one with two. The stated reason is '
          + 'strength of schedule. The schedule is the one nobody in a bigger conference would '
          + 'agree to play them.'
        : 'An unbeaten team is behind three teams with losses. The stated reason is strength of '
          + 'schedule, which is the schedule nobody would agree to play them.'),
      voices: [
        { id: 'Group of Five', say: 'Tell us what a win is worth and we will go and get that many.' },
        { id: 'SEC', say: 'Nine of our teams would beat them by three scores and everybody here knows it.' },
        { id: 'Fans', say: 'Then play them. It is a very short argument to settle.' },
      ],
      options: [
        { id: 'floor', label: 'Guarantee the highest ranked champion a seat',
          body: 'However the committee feels about it. One line in the format, and the '
            + 'argument is over forever.',
          edit: { set: { 'playoff.autobids': 6 },
            effects: { access: 3.2, autonomy: -1.4, exposure: 1.6, tradition: -1 },
            aimed: { 'Group of Five': { access: 3.4 }, SEC: { access: -2 },
              'Big Ten': { access: -1.6 } } } },
        { id: 'mandate', label: 'Mandate the games instead',
          body: 'Every power school plays one of them a year, home and home, no cheques. If '
            + 'the schedule is the objection, remove the objection.',
          edit: { effects: { access: 2.4, inventory: 1.8, autonomy: -2.6, money: -0.8 },
            aimed: { 'Group of Five': { access: 3 }, SEC: { autonomy: -2.6 },
              'Big Ten': { autonomy: -2.4 }, Networks: { inventory: 1.6 } } } },
        { id: 'defend', label: 'Back the committee',
          body: 'They watched the games. Twelve people in a room is a worse system than every '
            + 'alternative except all of them.',
          edit: { effects: { access: -2.4, tradition: 1.4, autonomy: 0.8 },
            aimed: { 'Group of Five': { access: -3 }, SEC: { access: 1.4 },
              Fans: { access: -1.6 } } } },
      ],
    },
    {
      id: 'ninety-eight',
      beats: [OCT, NOV],
      weight: 5,
      when: (w, L, sit) => !!sit.blowout && sit.blowout.margin >= 45,
      cast: (w, L, rng, sit) => sit.blowout,
      eyebrow: 'The scoreline',
      title: (c) => (c ? c.winner + ' ' + c.score[0] + ', ' + c.loser + ' ' + c.score[1]
        : 'Somebody scored ninety-eight points'),
      brief: (c) => (c
        ? c.winner + ' beat ' + c.loser + ' ' + c.score[0] + '-' + c.score[1] + ' and threw a '
          + 'touchdown pass with fifty seconds left. The losing coach did not shake hands. The '
          + 'winning coach said his backups have to play too, which is true, and said it in a '
          + 'way that made it worse.'
        : 'A team scored ninety-eight points and threw a touchdown with fifty seconds left. '
          + 'The losing coach did not shake hands.'),
      voices: [
        { id: 'Fans', say: 'A running clock is for high school. They are professionals now, apparently.' },
        { id: 'Players', say: 'The people getting run over out there are on scholarship too.' },
        { id: 'Networks', say: 'Twelve million people were still watching in the fourth quarter of that.' },
      ],
      options: [
        { id: 'clock', label: 'A running clock at forty points',
          body: 'Past a certain margin the clock does not stop. It ends the spectacle and it '
            + 'ends the humiliation, in that order.',
          edit: { set: { 'rules.clock': 'running' },
            effects: { labour: 2.2, tradition: -2, inventory: -2.4 },
            aimed: { Players: { labour: 2.6 }, Networks: { inventory: -2.6 },
              Fans: { tradition: -1.8 } } } },
        { id: 'sportsmanship', label: 'Write a sportsmanship rule with teeth',
          body: 'A committee reviews it, a coach can be suspended for it, and this office now '
            + 'has an opinion about when a touchdown is rude.',
          edit: { effects: { autonomy: -2.4, tradition: 1, exposure: 0.8, cost: 0.6 },
            aimed: { SEC: { autonomy: -2 }, 'Big Ten': { autonomy: -1.8 },
              Presidents: { exposure: 1 } } } },
        { id: 'nothing', label: 'Score as many as you like',
          body: 'It is the other team\'s job to stop them. This sport has never once been '
            + 'improved by telling people to try less.',
          edit: { effects: { tradition: 2, autonomy: 2.2, labour: -1.6, inventory: 1.4 },
            aimed: { Fans: { tradition: 1.8 }, Players: { labour: -2 },
              SEC: { autonomy: 1.8 } } } },
      ],
    },
    {
      id: 'gameday-sign',
      beats: [OCT, NOV],
      weight: 4,
      when: () => true,
      eyebrow: 'The broadcast',
      title: 'The sign got on television',
      brief: 'A student held up a sign behind the pregame set on Saturday morning that referred '
        + 'to this office by name, an amount of money, and a verb. It was on air for eleven '
        + 'seconds. It has since been printed on shirts, painted on a barn in Kentucky, and '
        + 'read aloud in a state senate. Two athletic directors have apologised to you '
        + 'personally and both of them were laughing.',
      voices: [
        { id: 'Networks', say: 'We have a seven second delay for audio. Signs are not audio.' },
        { id: 'Fans', say: 'It has been the same joke behind that set for forty years and it is the best part.' },
        { id: 'Presidents', say: 'The student is enrolled at one of our institutions and is now nationally famous.' },
      ],
      options: [
        { id: 'ignore', label: 'Say nothing',
          body: 'The fastest way to make a sign about you immortal is to have an opinion about '
            + 'a sign about you.',
          edit: { effects: { tradition: 1.4, exposure: 0.6 },
            aimed: { Fans: { tradition: 2 } } } },
        { id: 'buy', label: 'Buy the shirt and wear it',
          body: 'On camera, at the next event, without explaining the joke. High risk. Very '
            + 'high ceiling.',
          edit: { effects: { tradition: 2.6, exposure: -1, inventory: 1.6, autonomy: 0.8 },
            aimed: { Fans: { tradition: 3.2 }, Networks: { inventory: 1.8 },
              Presidents: { exposure: -1.4 } } } },
        { id: 'policy', label: 'A sign policy at every set',
          body: 'Approved signs only, in a designated area, reviewed before kickoff. Nobody has '
            + 'ever won this fight and you will not be the first.',
          edit: { effects: { tradition: -3.2, autonomy: -1.6, exposure: 1.2 },
            aimed: { Fans: { tradition: -3.6 }, Networks: { inventory: -1.4 },
              Presidents: { exposure: 1.2 } } } },
      ],
    },
    {
      id: 'fake-injuries',
      beats: [OCT],
      weight: 5,
      when: () => true,
      eyebrow: 'The rules',
      title: 'Six players cramped on the same drive',
      brief: 'All six on the same defence, all six against a tempo offence, all six back in on '
        + 'the next series. One of them looked at the sideline first. The broadcast noticed at '
        + 'the third one and spent the rest of the half on it. Nobody has been able to write a '
        + 'rule against this in thirty years because the rule would have to distinguish a lie '
        + 'from a hamstring.',
      voices: [
        { id: 'Networks', say: 'It turns a two hour game into a three hour game and it is not close.' },
        { id: 'Players', say: 'Somebody is going to hide a real injury to avoid being accused of this.' },
        { id: 'Big 12', say: 'It is coaching. Unpleasant coaching. Still coaching.' },
      ],
      options: [
        { id: 'sit', label: 'Injured means a full series out',
          body: 'Go down, sit down. Simple, enforceable, and it will keep a genuinely hurt kid '
            + 'on the field one play too long.',
          edit: { effects: { inventory: 2, labour: -2.4, tradition: -0.8, cost: -0.4 },
            aimed: { Networks: { inventory: 2.4 }, Players: { labour: -2.8 } } } },
        { id: 'review', label: 'Review them centrally and fine the staff',
          body: 'Every stoppage goes to a panel on Monday. A pattern gets a fine, then a '
            + 'suspension. Slow, awkward, and it puts the punishment on the adults.',
          edit: { effects: { autonomy: -2.2, cost: 1.4, labour: 1.6, inventory: 0.8 },
            aimed: { Players: { labour: 2 }, 'Big 12': { autonomy: -1.8 },
              SEC: { autonomy: -1.8 } } } },
        { id: 'nothing', label: 'Leave it to the tape',
          body: 'Coaches police this themselves in the only way that has ever worked, which is '
            + 'by doing it back to each other in November.',
          edit: { effects: { autonomy: 2, inventory: -1.8, tradition: 0.8 },
            aimed: { SEC: { autonomy: 1.8 }, Networks: { inventory: -2 } } } },
      ],
    },

    /* ---------------- november ---------------- */
    {
      id: 'two-unbeaten',
      beats: [NOV],
      weight: 7,
      when: (w, L, sit) => !!sit.sameConfUnbeaten,
      cast: (w, L, rng, sit) => sit.sameConfUnbeaten,
      eyebrow: 'The format',
      title: (c) => (c ? c.a.school + ' and ' + c.b.school + ' are both unbeaten'
        : 'Two unbeaten teams, one conference'),
      brief: (c) => (c
        ? c.a.school + ' are ' + c.a.wins + '-0. ' + c.b.school + ' are ' + c.b.wins + '-0. '
          + 'They are in the same conference, they do not play each other, and in two weeks '
          + 'one of them is going to lose a championship game and be sitting at home with one '
          + 'defeat. Every television executive in America has called this office to make sure '
          + 'that game happens.'
        : 'Two unbeaten teams are in the same conference, do not play each other, and one of '
          + 'them is about to lose a championship game and go home at 12-1.'),
      voices: [
        { id: 'Networks', say: 'That title game is the most valuable broadcast of the year. Do not touch it.' },
        { id: 'Big Ten', say: 'Punishing our best team for playing our second is a format problem.' },
        { id: 'Fans', say: 'Just let them both in. It is not complicated.' },
      ],
      options: [
        { id: 'protect', label: 'An unbeaten conference champion runner up is in',
          body: 'Lose the title game at 12-1 and you are still in the field. It removes the '
            + 'punishment and it removes a little of what the title game was for.',
          edit: { set: { 'playoff.teams': 14 },
            effects: { access: 2.6, inventory: -1.4, tradition: -1.6, money: 1 },
            aimed: { 'Big Ten': { access: 2.4 }, SEC: { access: 2 },
              Networks: { inventory: -1.6 }, 'Group of Five': { access: -1.6 } } } },
        { id: 'schedule', label: 'Make them play each other',
          body: 'Protected crossovers, every year, so the best two teams in a league meet '
            + 'before December decides it for them.',
          edit: { set: { 'rules.confGames': 10 },
            effects: { inventory: 2.8, tradition: 1.6, autonomy: -2.2, access: -0.8 },
            aimed: { Networks: { inventory: 3 }, Fans: { tradition: 2 },
              'Big Ten': { autonomy: -2 }, SEC: { autonomy: -2 } } } },
        { id: 'nothing', label: 'Somebody has to lose',
          body: 'That is what a championship game is. It has teeth or it is an exhibition, and '
            + 'this year the teeth are going to be on television.',
          edit: { effects: { inventory: 2.2, tradition: 2, access: -2.2 },
            aimed: { Networks: { inventory: 2.4 }, Fans: { tradition: 1.6 },
              'Big Ten': { access: -2.4 } } } },
      ],
    },
    {
      id: 'nobody-watching',
      beats: [NOV],
      weight: 6,
      when: (w, L, sit) => sit.hasUnbeaten && sit.audienceDown,
      cast: (w, L, rng, sit) => ({ team: sit.unbeaten[0] || null, trend: sit.trend,
        perGame: sit.perGame }),
      eyebrow: 'The audience',
      title: (c) => (c && c.team ? c.team.school + ' are ' + c.team.wins + '-0 and nobody is watching'
        : 'The best team in the sport is drawing nothing'),
      brief: (c) => (c && c.team
        ? c.team.school + ' have not lost a game and their last four have averaged less than a '
          + 'Tuesday night basketball game. The sport is down '
          + (c.trend != null ? Math.abs(c.trend).toFixed(2) + ' million a game' : 'across the board')
          + ' on the term. Somebody in a meeting used the phrase "compelling matchups" nine times.'
        : 'The best team in the sport is unbeaten and the audience is falling anyway.'),
      voices: [
        { id: 'Networks', say: 'An unbeaten team nobody watches is worth less than a good rivalry with two losses.' },
        { id: 'Fans', say: 'We know how it ends in September. That is the whole problem.' },
        { id: 'Presidents', say: 'Our distribution is calculated off these numbers.' },
      ],
      options: [
        { id: 'flex', label: 'Flex the November windows',
          body: 'Move the best remaining games into the biggest slots at two weeks notice. '
            + 'Better television, and every ticket holder in the country plans a trip around '
            + 'a kickoff that does not exist yet.',
          edit: { set: { 'posture.tvWindows': 7 },
            effects: { inventory: 2.6, money: 1.8, tradition: -2.4, labour: -0.8 },
            aimed: { Networks: { inventory: 3 }, Fans: { tradition: -2.6 } } } },
        { id: 'expand', label: 'Give more teams something to play for',
          body: 'A wider field in November is more games that matter in November. It is also '
            + 'more teams at 8-4 with a live argument.',
          edit: { set: { 'playoff.teams': 16 },
            effects: { access: 2.6, inventory: 1.8, tradition: -2, money: 1.4 },
            aimed: { 'Group of Five': { access: 2.4 }, Networks: { inventory: 2 },
              Fans: { tradition: -1.8 } } } },
        { id: 'hold', label: 'Hold the line and let it be a bad year',
          body: 'Audiences move. Formats are forever. A sport that redesigns itself every '
            + 'November it has a quiet one ends up with nothing anybody recognises.',
          edit: { effects: { tradition: 2.8, money: -2, inventory: -1.6, autonomy: 1 },
            aimed: { Fans: { tradition: 2.6 }, Networks: { money: -2.4, inventory: -2 },
              Presidents: { money: -1.6 } } } },
      ],
    },
    {
      id: 'trophy-stolen',
      beats: [NOV],
      weight: 4,
      when: () => true,
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = live[Math.floor(rng() * live.length) % live.length];
        const m = L.membersOf(w, conf);
        const i = Math.floor(rng() * m.length) % m.length;
        return { a: m[i] || null, b: m[(i + 1) % m.length] || null };
      },
      eyebrow: 'Rivalry week',
      title: 'The rivalry trophy is missing',
      brief: (c) => 'The ' + ((c && c.a) || 'one school') + ' and ' + ((c && c.b) || 'the other')
        + ' trophy has been in a display case since 1934 and it is not in the display case. It '
        + 'was there on Tuesday. There is a photograph on a fraternity account of what is '
        + 'either the trophy or a very similar object in a bathtub. Both athletic directors '
        + 'have called. Neither of them sounded that upset.',
      voices: [
        { id: 'Fans', say: 'This has happened four times. It has come back four times. It is part of it.' },
        { id: 'Presidents', say: 'It is a hundred year old object and a felony.' },
        { id: 'Networks', say: 'We would like to do a documentary about it either way.' },
      ],
      options: [
        { id: 'police', label: 'Refer it and let the police work',
          body: 'It is a theft. Treat it like one, and be the commissioner who pressed charges '
            + 'over a rivalry prank in the week of the rivalry.',
          edit: { effects: { tradition: -2.8, exposure: 1.6, autonomy: -0.8 },
            aimed: { Fans: { tradition: -3 }, Presidents: { exposure: 1.8 } } } },
        { id: 'amnesty', label: 'Amnesty until kickoff',
          body: 'Back in the case by Saturday morning and nobody asks a single question. It '
            + 'has worked every previous time.',
          edit: { effects: { tradition: 2.6, exposure: -0.8, inventory: 1.2 },
            aimed: { Fans: { tradition: 3 }, Presidents: { exposure: -1 } } } },
        { id: 'replica', label: 'Have a replica made and say nothing',
          body: 'The real one is somewhere. The new one is on television Saturday. Nobody has '
            + 'to know for eighty years, and then it is somebody else\'s problem.',
          edit: { effects: { tradition: -1.4, inventory: 1, cost: 0.8, exposure: -1.6 },
            aimed: { Networks: { inventory: 1.2 }, Presidents: { exposure: -1.8 } } } },
      ],
    },
    {
      id: 'nfl-departure',
      beats: [NOV, CHAMP],
      weight: 5,
      when: () => true,
      cast: (w, L, rng, sit) => {
        const t = (sit.unbeaten && sit.unbeaten[0]) || sit.leader || null;
        return t ? { school: t.school, conference: t.conference } : null;
      },
      eyebrow: 'The coaches',
      title: (c) => (c ? c.school + '\'s coach has taken an NFL job' : 'A coach is leaving mid run'),
      brief: (c) => ((c && c.school) || 'The best team in the sport')
        + ' plays a rivalry game on Saturday and a championship game after that, and their '
        + 'head coach signed a professional contract on Thursday night. He says he will coach '
        + 'them through the postseason. His new employer says he starts on the fifteenth. Both '
        + 'statements went out within an hour of each other and they cannot both be true.',
      voices: [
        { id: 'Players', say: 'We signed to play for him. Nobody asked us about the fifteenth.' },
        { id: 'Fans', say: 'He can go. He does not get to hold the trophy on his way out.' },
        { id: 'Networks', say: 'It is the story of the season and it is entirely free.' },
      ],
      options: [
        { id: 'bar', label: 'A coach under contract elsewhere cannot coach here',
          body: 'Sign the deal and you are done for the year. It protects the players and it '
            + 'costs somebody a national title they built.',
          edit: { effects: { labour: 2.4, tradition: 1.6, autonomy: -2.6, inventory: -1.4 },
            aimed: { Players: { labour: 2.8 }, Fans: { tradition: 2 },
              SEC: { autonomy: -2.2 } } } },
        { id: 'release', label: 'Let the players out with him',
          body: 'If the coach can leave, the roster he recruited can leave too, immediately, '
            + 'without penalty. That is either fair or the end of the sport and nobody is sure '
            + 'which.',
          edit: { set: { 'labour.portalWindows': 3 },
            effects: { labour: 3.2, tradition: -2.6, cost: 1.6, exposure: -1 },
            aimed: { Players: { labour: 3.6 }, ACC: { cost: -2 }, 'Big 12': { cost: -2 } } } },
        { id: 'nothing', label: 'It is a job and he took it',
          body: 'Men have been leaving this sport for that one since it existed. Sort out the '
            + 'sideline yourselves.',
          edit: { effects: { autonomy: 2.4, labour: -2, tradition: -1.2 },
            aimed: { Players: { labour: -2.4 }, SEC: { autonomy: 2 },
              Fans: { tradition: -1.6 } } } },
      ],
    },

    /* ---------------- championship weekend ---------------- */
    {
      id: 'tiebreaker',
      beats: [CHAMP],
      weight: 6,
      when: () => true,
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        return { conf: live[Math.floor(rng() * live.length) % live.length] || null };
      },
      eyebrow: 'The format',
      title: (c) => ((c && c.conf) || 'A conference') + ' needed the eighth tiebreaker',
      brief: (c) => 'Four teams finished level. The first six tiebreakers did not separate '
        + 'them. The seventh is head to head against common opponents in games decided by '
        + 'seven or fewer, which produced a two way tie, and the eighth is a random draw '
        + 'conducted by a deputy commissioner with a bingo machine on a video call. That '
        + 'video call is now the most watched thing on the internet.',
      voices: [
        { id: 'Fans', say: 'A season decided by a bingo machine. Genuinely perfect. No notes.' },
        { id: 'Presidents', say: 'Somebody\'s bowl revenue was just decided by a plastic ball.' },
        { id: 'Networks', say: 'We would broadcast the draw. Live. Every year. Name your price.' },
      ],
      options: [
        { id: 'publish', label: 'Rewrite the tiebreakers properly',
          body: 'A short, published, comprehensible order that resolves every case. It is a '
            + 'winter of work for a lawyer and it removes the single funniest thing this sport '
            + 'has produced in a decade.',
          edit: { effects: { access: 2, tradition: -0.8, cost: 1, inventory: -1.6 },
            aimed: { Presidents: { exposure: 1.4 }, Fans: { access: 1.6 },
              Networks: { inventory: -1.8 } } } },
        { id: 'televise', label: 'Televise the draw',
          body: 'If a season is going to come down to a bingo machine, put the bingo machine '
            + 'in a studio with a host. Lean all the way in.',
          edit: { effects: { inventory: 3, money: 1.6, tradition: -2.4, exposure: -1.6 },
            aimed: { Networks: { inventory: 3.4 }, Fans: { tradition: 1 },
              Presidents: { exposure: -2.4 } } } },
        { id: 'expand', label: 'Play it off instead',
          body: 'A four team conference playoff the week before. More football, more travel, '
            + 'and nobody is ever eliminated by a plastic ball again.',
          edit: { set: { 'rules.confGames': 10 },
            effects: { inventory: 2.4, labour: -2.2, access: 1.4, cost: 1.2 },
            aimed: { Networks: { inventory: 2.2 }, Players: { labour: -2.6 },
              'Group of Five': { access: 1 } } } },
      ],
    },
    {
      id: 'rematch',
      beats: [CHAMP],
      weight: 5,
      when: () => true,
      cast: (w, L, rng, sit) => {
        const t = sit.unbeaten.length >= 2 ? sit.unbeaten : sit.teams.slice(0, 2);
        return t.length >= 2 ? { a: t[0].school, b: t[1].school } : null;
      },
      eyebrow: 'The weekend',
      title: (c) => (c ? c.a + ' and ' + c.b + ', again' : 'Nobody wants this rematch'),
      brief: (c) => (c
        ? c.a + ' beat ' + c.b + ' by twenty-eight in October and they meet again on Saturday '
          + 'for the conference title. Both are already in the field whatever happens. The '
          + 'winner gains a trophy and the loser loses nothing, and the injury risk is real '
          + 'for both of them a fortnight before the playoff.'
        : 'A championship game between two teams already in the field, three weeks after one '
          + 'beat the other by twenty-eight.'),
      voices: [
        { id: 'Networks', say: 'It is a championship game. It has a trophy in it. People will watch.' },
        { id: 'Players', say: 'A meaningless game with a real ACL in it is not meaningless to us.' },
        { id: 'SEC', say: 'If it does not count, stop making us play it.' },
      ],
      options: [
        { id: 'keep', label: 'Play the championship game',
          body: 'A conference title is a thing worth winning even when it costs nothing to '
            + 'lose. That has been true for a hundred years.',
          edit: { effects: { tradition: 2.2, inventory: 1.8, labour: -2 },
            aimed: { Networks: { inventory: 2 }, Fans: { tradition: 2 },
              Players: { labour: -2.4 } } } },
        { id: 'seed', label: 'Make it worth something',
          body: 'Winner takes a bye, loser does not. Now it is a real game and now the loser '
            + 'has been punished for a season they already won.',
          edit: { set: { 'playoff.byes': 4 },
            effects: { inventory: 2.6, access: -1.4, tradition: 0.8, labour: -1.4 },
            aimed: { Networks: { inventory: 2.6 }, SEC: { access: 1.4 },
              'Group of Five': { access: -2 } } } },
        { id: 'scrap', label: 'Scrap championship games in a wide field',
          body: 'A twelve team playoff already answers the question these games were invented '
            + 'to answer. Give everybody a week off and one fewer chance to lose a quarterback.',
          edit: { effects: { labour: 2.8, inventory: -3, money: -2.2, tradition: -2 },
            aimed: { Players: { labour: 3 }, Networks: { inventory: -3.2, money: -2 },
              Fans: { tradition: -2.2 } } } },
      ],
    },

    /* ---------------- the playoff ---------------- */
    {
      id: 'minus-fifteen',
      beats: [PLAYOFF],
      weight: 6,
      when: (w) => w.playoff.sites !== 'neutral',
      cast: (w, L, rng, sit) => {
        const t = (sit.bigUnbeaten && sit.bigUnbeaten[0]) || sit.leader || null;
        return t ? { school: t.school } : null;
      },
      eyebrow: 'The bracket',
      title: 'The first round is at minus fifteen',
      brief: (c) => 'The forecast for the campus site is minus fifteen with wind, and the '
        + 'visiting team has come from a place where it is currently seventy-eight degrees. '
        + 'Somebody has already sold out of hand warmers in three counties. The visiting '
        + 'athletic director has asked, in writing, whether this is what the sport intends.',
      voices: [
        { id: 'Fans', say: 'It is the single best thing about the campus round. Do not touch it.' },
        { id: 'Players', say: 'There is a difference between cold and a medical event.' },
        { id: 'Networks', say: 'A frozen night game on a campus outdraws a neutral site by a third.' },
      ],
      options: [
        { id: 'campus', label: 'Play it on campus',
          body: 'You earned the seed, you earn the weather. It is the most distinctive thing '
            + 'this postseason has and the visiting team knew the map in August.',
          edit: { effects: { tradition: 3, inventory: 2.2, labour: -2.2, access: 0.8 },
            aimed: { Fans: { tradition: 3.2 }, Networks: { inventory: 2 },
              Players: { labour: -2.4 } } } },
        { id: 'neutral', label: 'Move the round to neutral sites',
          body: 'Warm, indoors, safe, and sold to a city eighteen months in advance. Also the '
            + 'end of the only part of this format anybody has fallen in love with.',
          edit: { set: { 'playoff.sites': 'neutral' },
            effects: { money: 2.6, labour: 2, tradition: -3.4, access: -1.4 },
            aimed: { Players: { labour: 2.4 }, Fans: { tradition: -3.6 },
              Presidents: { money: 1.6 } } } },
        { id: 'threshold', label: 'A weather threshold, published now',
          body: 'Below a stated temperature the game moves indoors. It will be argued about at '
            + 'one degree either side of the line every year for the rest of time.',
          edit: { effects: { labour: 1.6, cost: 1, tradition: -1, autonomy: -1.2 },
            aimed: { Players: { labour: 1.8 }, Fans: { tradition: -1.4 } } } },
      ],
    },
    {
      id: 'opt-out',
      beats: [PLAYOFF],
      weight: 6,
      when: (w) => w.labour.revShare < 0.25,
      cast: (w, L, rng, sit) => {
        const t = (sit.unbeaten && sit.unbeaten[0]) || sit.leader || null;
        return t ? { school: t.school } : null;
      },
      eyebrow: 'The players',
      title: (c) => (c ? c.school + '\'s quarterback has opted out' : 'A quarterback has opted out'),
      brief: (c) => 'Two days before a semifinal, to protect a professional future that is '
        + 'worth more than everything this sport has ever paid him. His teammates have said '
        + 'nothing publicly and quite a lot privately. He is nineteen, he is right, and every '
        + 'commentator in the country has spent the day explaining what he owes people.',
      voices: [
        { id: 'Players', say: 'He is protecting his only asset. You built the system that made it the only one.' },
        { id: 'Fans', say: 'A hundred thousand people bought tickets to watch him play.' },
        { id: 'Networks', say: 'The number on that broadcast just moved and it did not move up.' },
      ],
      options: [
        { id: 'insure', label: 'Insure every playoff starter centrally',
          body: 'The sport buys the policy, the sport pays the premium, and nobody has to '
            + 'choose between a semifinal and a mortgage again.',
          edit: { effects: { labour: 3.2, cost: 3, money: -1.2, inventory: 1.4 },
            aimed: { Players: { labour: 3.6 }, Presidents: { cost: -2.6 },
              Networks: { inventory: 1.4 } } } },
        { id: 'share', label: 'Pay them for the postseason',
          body: 'A share of the bracket revenue, paid to the people generating it, in the '
            + 'window they are generating it. It is the answer and it opens six other doors.',
          edit: { set: { 'labour.revShare': 0.25 },
            effects: { labour: 3.4, cost: 2.6, money: -1.6, exposure: -2 },
            aimed: { Players: { labour: 3.8 }, Presidents: { cost: -2.4 },
              SEC: { money: -1.6 } } } },
        { id: 'nothing', label: 'It is his decision to make',
          body: 'Say that, in one sentence, and refuse every follow up. It is true and it will '
            + 'satisfy nobody.',
          edit: { effects: { labour: 1, exposure: 0.8, inventory: -1.6, tradition: -0.8 },
            aimed: { Players: { labour: 1.4 }, Fans: { tradition: -1.6 },
              Networks: { inventory: -1.8 } } } },
      ],
    },
    {
      id: 'seven-overtimes',
      beats: [PLAYOFF],
      weight: 5,
      when: () => true,
      eyebrow: 'The rules',
      title: 'Seven overtimes',
      brief: 'Four hours and fifty-one minutes. Two teams alternating two point conversions '
        + 'from the three yard line until one of them could not stand up. Eleven players '
        + 'cramped. A punter played linebacker. The winning score was a defensive lineman '
        + 'catching a ball that hit three people. It finished at ten past one in the morning '
        + 'and it is the best football game anybody watching had ever seen.',
      voices: [
        { id: 'Networks', say: 'The last hour of that did a bigger number than the kickoff did.' },
        { id: 'Players', say: 'Two of them left in an ambulance. It was magnificent and it was too much.' },
        { id: 'Fans', say: 'Do not change a single thing. Not one thing.' },
      ],
      options: [
        { id: 'keep', label: 'Leave overtime exactly as it is',
          body: 'The sport just produced the thing everybody will remember it by. That is not '
            + 'a problem to be solved.',
          edit: { set: { 'rules.overtime': 'twopoint' },
            effects: { tradition: 2.8, inventory: 2.6, labour: -2.6 },
            aimed: { Fans: { tradition: 3.2 }, Networks: { inventory: 2.8 },
              Players: { labour: -3 } } } },
        { id: 'cap', label: 'Cap it at four and go to a kick off',
          body: 'Past four overtimes it is decided by something short. Safer, sillier, and it '
            + 'will decide a national title one day in a way nobody accepts.',
          edit: { set: { 'rules.overtime': 'kick' },
            effects: { labour: 2.6, tradition: -2.4, inventory: -1.4 },
            aimed: { Players: { labour: 3 }, Fans: { tradition: -2.8 } } } },
        { id: 'ties', label: 'Bring back the tie',
          body: 'In the regular season only. Nobody has suggested this seriously in twenty '
            + 'years and everybody in the room just went very quiet.',
          edit: { set: { 'rules.overtime': 'none' },
            effects: { labour: 3, tradition: -3.4, inventory: -3, exposure: 1 },
            aimed: { Players: { labour: 3.2 }, Fans: { tradition: -3.8 },
              Networks: { inventory: -3.2 } } } },
      ],
    },
    {
      id: 'celebration',
      beats: [PLAYOFF],
      weight: 4,
      when: () => true,
      eyebrow: 'The officials',
      title: 'The celebration cost them the game',
      brief: 'Ninety-four yards, untouched, and he pointed at the bench from the eight yard '
        + 'line. Fifteen yards on the extra point, the kick was blocked, and the other team '
        + 'went eighty yards in forty seconds to win a playoff game. He is nineteen and he has '
        + 'apologised four times, twice in tears, to a country that has watched it nine million '
        + 'times.',
      voices: [
        { id: 'Fans', say: 'He was happy. He ran ninety-four yards and he was happy.' },
        { id: 'Players', say: 'You cannot legislate joy out of the one moment it belongs in.' },
        { id: 'Presidents', say: 'The rule exists because of things considerably worse than pointing.' },
      ],
      options: [
        { id: 'dead', label: 'Make it a dead ball foul',
          body: 'Penalise the kickoff, not the touchdown. The score stands, the celebration '
            + 'costs field position, and no nineteen year old ever loses a playoff game for '
            + 'being pleased again.',
          edit: { effects: { labour: 2, tradition: -1.2, inventory: 1.4, access: 1 },
            aimed: { Players: { labour: 2.4 }, Fans: { tradition: 1.6 } } } },
        { id: 'strict', label: 'Keep it strict',
          body: 'The line has to be somewhere and everybody knew where it was in August. It is '
            + 'the coldest correct answer available.',
          edit: { set: { 'rules.targeting': 'strict' },
            effects: { tradition: 1.4, autonomy: -0.8, labour: -2 },
            aimed: { Players: { labour: -2.4 }, Fans: { tradition: -2 } } } },
        { id: 'review', label: 'Review every one of them centrally',
          body: 'Nothing on the field. A panel on Monday, a fine to the programme, and the '
            + 'game decided by the football that was played.',
          edit: { effects: { access: 1.6, cost: 1.2, autonomy: -1.6, labour: 1.4 },
            aimed: { Players: { labour: 1.8 }, SEC: { autonomy: -1.4 } } } },
      ],
    },
    {
      id: 'fog',
      beats: [PLAYOFF],
      weight: 4,
      when: () => true,
      eyebrow: 'The bracket',
      title: 'One of the teams cannot land',
      brief: 'Fog closed the airport at four in the afternoon and it is not lifting until '
        + 'tomorrow. One semifinalist is on the ground three hundred miles away with a bus '
        + 'company on the phone and a kickoff in nineteen hours. The other team has been in the '
        + 'city since Tuesday and has slept in its own beds. Every option in front of this '
        + 'office is unfair to somebody.',
      voices: [
        { id: 'Networks', say: 'The window is contracted, sold, and immovable. That is the honest position.' },
        { id: 'Players', say: 'Six hours on a bus and a semifinal is not a semifinal.' },
        { id: 'Presidents', say: 'A hundred thousand people have hotel rooms tonight.' },
      ],
      options: [
        { id: 'delay', label: 'Move it twenty-four hours',
          body: 'The football is what this is for. Every hotel, flight and broadcast in three '
            + 'states rearranges itself around that sentence.',
          edit: { effects: { labour: 2.6, access: 1.4, money: -2.4, inventory: -1.6, cost: 1.6 },
            aimed: { Players: { labour: 3 }, Networks: { money: -2.6, inventory: -2 },
              Presidents: { cost: -1.6 } } } },
        { id: 'bus', label: 'Put them on the bus',
          body: 'Kickoff is kickoff. They will arrive at four in the morning and play a '
            + 'semifinal, and everybody will watch to see what that does to a football team.',
          edit: { effects: { inventory: 1.8, tradition: 1.4, labour: -3, access: -1.6 },
            aimed: { Networks: { inventory: 2 }, Players: { labour: -3.4 },
              Fans: { tradition: 1 } } } },
        { id: 'charter', label: 'Charter the whole bracket from now on',
          body: 'The sport flies its own postseason, arrives two days early, and never has '
            + 'this conversation again. It costs a great deal and it is obviously right.',
          edit: { effects: { cost: 3.2, labour: 2.4, money: -1.4, autonomy: -1 },
            aimed: { Players: { labour: 2.6 }, Presidents: { cost: -3 },
              'Group of Five': { cost: 1.6 } } } },
      ],
    },
    {
      id: 'chairman-interview',
      beats: [PLAYOFF, CHAMP],
      weight: 5,
      when: (w) => w.playoff.selection === 'committee',
      eyebrow: 'The committee',
      title: 'The chairman said the quiet part',
      brief: 'Live, on a Tuesday night selection show, asked why a team was left out, the '
        + 'committee chairman said "honestly, nobody wanted to watch them" and then heard '
        + 'himself say it. There is a four second pause on the tape. The head of the network '
        + 'has apologised. The chairman has not, because the chairman has stopped answering '
        + 'his telephone.',
      voices: [
        { id: 'Group of Five', say: 'He said out loud what the ballots have said for ten years.' },
        { id: 'Networks', say: 'It was the most honest sentence ever spoken on that broadcast.' },
        { id: 'Presidents', say: 'A volunteer just told the country the field is picked on ratings.' },
      ],
      options: [
        { id: 'remove', label: 'Remove him',
          body: 'Somebody has to go and he has already offered. It solves the news cycle and '
            + 'not one thing he described.',
          edit: { effects: { exposure: 2, access: -0.8, tradition: 0.6, autonomy: -1 },
            aimed: { Presidents: { exposure: 2.2 }, 'Group of Five': { access: -1.4 } } } },
        { id: 'criteria', label: 'Publish the criteria and forbid the rest',
          body: 'A written list of what the committee may consider, audience nowhere on it, '
            + 'and a ballot record anybody can read.',
          edit: { effects: { access: 3, exposure: -1.2, autonomy: -1.6, inventory: -1.4 },
            aimed: { 'Group of Five': { access: 3.2 }, Fans: { access: 2 },
              Networks: { inventory: -2 } } } },
        { id: 'honest', label: 'Put audience in the criteria officially',
          body: 'He was describing the system accurately. Write it down, admit the sport picks '
            + 'its field on who people will watch, and let everybody argue with the real rule '
            + 'instead of the pretend one.',
          edit: { effects: { money: 2.4, inventory: 2.2, access: -3.2, tradition: -2.4,
            exposure: -1.6 },
            aimed: { Networks: { inventory: 2.8, money: 2 }, 'Group of Five': { access: -3.4 },
              SEC: { money: 2 }, Fans: { tradition: -2 } } } },
      ],
    },

    /* ================================================================================
       THE ONE WAY DOOR.
       Declare for the draft, go undrafted or get cut in August, and come back to a college
       roster in September. It is the live argument in the sport, it is the one a conference
       went and legislated on its own rather than waiting for anybody, and until now this mode
       had no field for it at all.

       Everything below reads `labour.reentry`, `labour.rulesBy` and `labour.confReentry`, and
       the football reads them back through reentryDrift(): an open door stretches the league
       away from its middle, because the men coming back go to the twenty programmes that can
       pay them and start them. Measured across seventy played seasons, that is the difference
       between 21.8 per cent of games decided by four touchdowns and 26.6 per cent.

       THE GOVERNANCE HALF IS THE INTERESTING HALF. Whether you decide this at all, or a
       conference decides it for you, is a different question from what the answer is, and it
       is the one the sport actually got wrong: by the time this office has an opinion there
       is already a rule in one league and not in the others, and a player barred in one is a
       transfer with a legal team attached.
       ================================================================================ */

    {
      id: 'reentry-first',
      beats: [WINTER, SPRING],
      weight: 8,
      /* THE ARGUMENT ONLY EXISTS WHILE THE DOOR IS OPEN AND NOBODY HAS WRITTEN A RULE. */
      when: (w, L, sit) => sit.reentry === 'open' && sit.rulesBy === 'national',
      cast: (w, L, rng, sit) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = live[Math.floor(rng() * live.length) % live.length] || 'the Big Ten';
        const m = L.membersOf(w, conf);
        return { conf, school: m[Math.floor(rng() * m.length) % m.length] || null };
      },
      eyebrow: 'Eligibility',
      title: (c) => (c ? c.conf + ' has written its own rule' : 'A conference has written its own rule'),
      brief: (c) => 'They passed it this morning, in a room this office was not in, and told '
        + 'a reporter before they told you. Declare for the draft and do not withdraw, appear '
        + 'on a professional roster, sign anywhere: you cannot be on a '
        + ((c && c.conf) || 'conference') + ' roster again. Everybody else\'s door is still '
        + 'open, which means the rule they have written is really a rule about where a man '
        + 'who gets cut in August goes in September.',
      voices: [
        { id: 'Big Ten', say: 'Somebody had to. We waited two years for this office to and you did not.' },
        { id: 'Players', say: 'You are taking a year of a man\'s life away for finding out he was not ready.' },
        { id: 'Presidents', say: 'We now have four different eligibility rules and one sport.' },
      ],
      options: [
        { id: 'national-open', label: 'One rule, and the door stays open',
          body: 'Overrule them. A man who tries and fails comes back, everywhere, and this '
            + 'office decides eligibility because that is what this office is for.',
          edit: { set: { 'labour.reentry': 'open', 'labour.rulesBy': 'national' },
            effects: { labour: 3, autonomy: -3, access: -1.4, tradition: -1.6 },
            aimed: { Players: { labour: 3.4 }, 'Big Ten': { autonomy: -3 }, SEC: { autonomy: -2.4 },
              Presidents: { autonomy: 1.4 } } } },
        { id: 'national-closed', label: 'One rule, and it is theirs',
          body: 'Adopt what they wrote, nationally, today. It ends the divergence in an '
            + 'afternoon and it ends it by letting the conference that went first write the '
            + 'sport\'s law.',
          edit: { set: { 'labour.reentry': 'closed', 'labour.rulesBy': 'national' },
            effects: { labour: -3.4, tradition: 2.4, exposure: -2, access: 1.2 },
            aimed: { Players: { labour: -3.8 }, 'Big Ten': { autonomy: 2.4 },
              Fans: { tradition: 1.6 }, Presidents: { exposure: -1.6 } } } },
        { id: 'devolve', label: 'Let every conference write its own',
          body: 'If they are going to do it anyway, stop pretending. Each league sets its own '
            + 'eligibility and this office keeps the calendar. Nobody has thought through what '
            + 'that does to a transfer.',
          /* AND THE ONE THAT WENT FIRST KEEPS ITS RULE, the same afternoon, which is the whole
             point of devolving to them. Setting `rulesBy` alone left every conference falling
             back to the national rule, so the leagues could never actually diverge, and the
             three items and the tail about what happens when they do were unreachable from
             any playthrough. Devolution that changes nothing is not devolution. */
          edit: (c) => {
            const set = { 'labour.rulesBy': 'conference' };
            set['labour.confReentry.' + ((c && c.conf) || 'Big Ten')] = 'closed';
            return { set,
              effects: { autonomy: 3.4, access: -2.6, exposure: -2.4, labour: -1.4 },
              aimed: { SEC: { autonomy: 3 }, 'Big Ten': { autonomy: 3 },
                'Group of Five': { access: -2.6 }, Presidents: { exposure: -2.4 },
                Players: { labour: -2 } } };
          } },
      ],
      dials: [
        { id: 'proYears', label: 'Years away you may have', path: 'labour.proYears',
          base: 1, free: [0, 1], pro: [0, 1, 2, 3],
          per: { labour: 0.9, tradition: -0.5, access: -0.3 },
          aim: { Players: { labour: 1 }, Fans: { tradition: -0.6 } },
          reads: (v, ctx) => (v === 0
            ? 'Nobody comes back. The dial is set where the rule is a ban whatever the '
              + 'sentence above it says.'
            : 'A man who has been a professional for ' + v + ' year' + (v === 1 ? '' : 's')
              + ' can come back and play. At ' + v + ' that is somebody who would be '
              + (21 + v + 3) + ' in his last college season.') },
      ],
    },
    {
      id: 'undrafted',
      beats: [PORTAL, SPRING],
      weight: 7,
      when: (w, L, sit) => sit.reentry !== 'closed',
      cast: (w, L, rng, sit) => {
        const t = (sit.unbeaten && sit.unbeaten[0]) || sit.leader
          || { school: null, conference: null };
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = t.conference || live[0] || 'the SEC';
        const m = L.membersOf(w, conf);
        return { school: t.school || m[0] || null, conf };
      },
      eyebrow: 'The draft',
      title: 'He went undrafted and wants to come back',
      brief: (c) => 'Two hundred and fifty-seven names went off the board over three days and '
        + 'his was not one of them. He is twenty-two, he was a second round grade in November, '
        + 'and he did not withdraw by the deadline because four people told him not to. '
        + ((c && c.school) ? c.school : 'His school')
        + ' would take him back this afternoon. The rule as written says he stopped being a '
        + 'college player the moment he did not withdraw, and the rule as written was not '
        + 'written with this in it.',
      voices: [
        { id: 'Players', say: 'He got bad advice from adults and you want him to pay for it with a year.' },
        { id: 'Fans', say: 'He said goodbye. There was a graphic. There was a video.' },
        { id: 'Networks', say: 'He is the best player who will be on a field this autumn if you let him be.' },
      ],
      options: [
        { id: 'let-back', label: 'Let him back',
          body: 'And everybody in his position, this year and every year. It is the humane '
            + 'answer and it makes the draft declaration meaningless, which is the point '
            + 'everybody who objects will make.',
          edit: { set: { 'labour.reentry': 'open' },
            effects: { labour: 3, tradition: -2, exposure: -1, access: -1.2 },
            aimed: { Players: { labour: 3.4 }, Fans: { tradition: -1.6 } } } },
        { id: 'window', label: 'One return, inside a window',
          body: 'A stated date, a single use, and it shuts behind him. Everybody knows the '
            + 'rule in September and nobody finds out what it is in May.',
          edit: { set: { 'labour.reentry': 'window', 'labour.proYears': 1 },
            effects: { labour: 1.4, tradition: 0.6, cost: 0.4, access: -0.4 },
            aimed: { Players: { labour: 1.6 }, Presidents: { exposure: 0.8 } } } },
        { id: 'no', label: 'The deadline was the deadline',
          body: 'It was published, it was explained, and a rule that bends for the best player '
            + 'available is not a rule. Say it once and do not say it again.',
          edit: { set: { 'labour.reentry': 'closed' },
            effects: { labour: -3, tradition: 2.6, exposure: 1.2, access: 1 },
            aimed: { Players: { labour: -3.4 }, Fans: { tradition: 2 },
              Presidents: { exposure: 1.4 } } } },
      ],
    },
    {
      id: 'reentry-transfer',
      beats: [PORTAL, SPRING, MEDIA],
      weight: 8,
      /* THE MESS THE DIVERGENCE MAKES, and it only exists once the leagues disagree. */
      when: (w, L, sit) => sit.splitRules && sit.doorShut.length > 0 && sit.doorOpen.length > 0,
      cast: (w, L, rng, sit) => ({
        shut: sit.doorShut[0] || 'one conference',
        open: sit.doorOpen[0] || 'another',
      }),
      eyebrow: 'Eligibility',
      title: (c) => (c ? 'Barred in ' + c.shut + ', eligible in ' + c.open
        : 'Barred in one league and eligible in the next'),
      brief: (c) => 'He was a professional for eleven weeks. '
        + ((c && c.shut) || 'One conference') + ' says that ends him. '
        + ((c && c.open) || 'The one next door') + ' says it does not. So he has entered the '
        + 'portal, and the only schools that can take him are the ones in the leagues that '
        + 'kept their door open, which means the rule one conference wrote to protect itself '
        + 'is now a recruiting service for its rivals. There are nine of him this month.',
      voices: [
        { id: 'ACC', say: 'We did not ask for this and we are not going to unilaterally disarm.' },
        { id: 'Big Ten', say: 'We wrote a rule for our institutions. We are not obliged to write one for yours.' },
        { id: 'Players', say: 'Which league you are in decides whether your career is over. Read that back.' },
      ],
      options: [
        { id: 'unify-open', label: 'Take it back nationally, door open',
          body: 'One rule, everybody, and the leagues that shut their doors reopen them '
            + 'whether they like it or not. It ends the arbitrage and it ends the pretence '
            + 'that they were ever allowed to do this.',
          edit: { set: { 'labour.rulesBy': 'national', 'labour.reentry': 'open' },
            effects: { labour: 3, autonomy: -3.4, access: 1.6, exposure: 1 },
            aimed: { Players: { labour: 3.2 }, 'Big Ten': { autonomy: -3 },
              SEC: { autonomy: -2.6 }, Presidents: { autonomy: 1.2 } } } },
        { id: 'unify-closed', label: 'Take it back nationally, door shut',
          body: 'One rule, everybody, and it is the strict one. The arbitrage ends because '
            + 'there is nowhere left to arbitrage to.',
          edit: { set: { 'labour.rulesBy': 'national', 'labour.reentry': 'closed' },
            effects: { labour: -3.4, autonomy: -2.4, tradition: 2.2, exposure: -1.6 },
            aimed: { Players: { labour: -3.6 }, Fans: { tradition: 1.8 },
              SEC: { autonomy: -2 }, Presidents: { exposure: -1.4 } } } },
        { id: 'leave', label: 'Leave them to it',
          body: 'They wanted the authority. They have it. Every consequence of it is now '
            + 'theirs, including the ones arriving in a filing on Thursday.',
          edit: { effects: { autonomy: 2.6, access: -3, exposure: -3, labour: -2.4 },
            aimed: { 'Big Ten': { autonomy: 2 }, SEC: { autonomy: 2 },
              Players: { labour: -3 }, Presidents: { exposure: -3 },
              'Group of Five': { access: -2.4 } } } },
      ],
    },
    {
      id: 'roster-spot',
      beats: [SPRING, MEDIA],
      weight: 6,
      when: (w, L, sit) => sit.reentry !== 'closed',
      cast: (w, L, rng) => {
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const conf = live[Math.floor(rng() * live.length) % live.length];
        const m = L.membersOf(w, conf);
        return { school: m[Math.floor(rng() * m.length) % m.length] || null };
      },
      eyebrow: 'The roster',
      title: 'Somebody has to lose the spot',
      brief: (c) => 'When he left for the draft they gave his scholarship to a nineteen year '
        + 'old who has been in the building for eight months, learned the offence, and told '
        + 'his family. Now he is coming back and the roster is capped. '
        + ((c && c.school) || 'The school') + ' has asked this office, in writing and slightly '
        + 'desperately, which of the two of them they are supposed to tell.',
      voices: [
        { id: 'Players', say: 'Whichever one you pick, you are ending it for the other one by memo.' },
        { id: 'Presidents', say: 'The cap is the cap. We asked for the cap.' },
        { id: 'Big 12', say: 'Give us one exemption per roster and this stops being a crisis.' },
      ],
      options: [
        { id: 'exempt', label: 'A returner does not count against the cap',
          body: 'One exemption per roster per year. It solves it today and every roster in the '
            + 'country is two men bigger by 2029.',
          edit: { set: { 'labour.reentry': 'open' },
            effects: { labour: 2.4, cost: 2, access: -1.4, tradition: -0.8 },
            aimed: { Players: { labour: 2.6 }, Presidents: { cost: -2 },
              'Big 12': { cost: 1.4 } } } },
        { id: 'protect', label: 'The scholarship belongs to whoever has it',
          body: 'He can come back, and he comes back to a roster with no room on it unless '
            + 'somebody leaves. The kid who was already there is not the one who moves.',
          edit: { effects: { labour: 0.8, tradition: 1.6, access: 1.2, cost: -0.6 },
            aimed: { Players: { labour: 1.2 }, Fans: { tradition: 1.4 } } } },
        { id: 'shut', label: 'This is why the door has to shut',
          body: 'Every returner is a nineteen year old being told to find another school in '
            + 'August. Close it, and the roster a school builds in February is the roster it '
            + 'has in September.',
          edit: { set: { 'labour.reentry': 'closed' },
            effects: { labour: -2.6, tradition: 2, cost: -1.4, access: 1.4 },
            aimed: { Players: { labour: -3 }, Presidents: { cost: 1.6 },
              Fans: { tradition: 1.4 } } } },
      ],
    },
    {
      id: 'the-agent',
      beats: [PORTAL, SPRING],
      weight: 6,
      when: (w, L, sit) => sit.reentry !== 'closed' && w.labour.employment !== 'employee',
      eyebrow: 'The players',
      title: 'He has an agent and a locker',
      brief: 'He signed with an agency in December, went through the process, did not get '
        + 'drafted, and is back in a college weight room in February with the same agent, who '
        + 'is now negotiating his collective money. Under the old rules signing with an agent '
        + 'ended you. Under the current rules nothing ends you. Under both of them somebody '
        + 'in this office is supposed to have an opinion and nobody does.',
      voices: [
        { id: 'Players', say: 'Every one of us should have had one from the day we were sixteen.' },
        { id: 'Presidents', say: 'If they have agents and salaries, tell me what word is left that is not employee.' },
        { id: 'Networks', say: 'Nobody watching has ever cared about this and nobody watching ever will.' },
      ],
      options: [
        { id: 'certify', label: 'Certify agents and register every deal',
          body: 'A licence, a register, a standard contract and a complaints process. It is '
            + 'dull, it is expensive, and it is the only version of this that protects anybody.',
          edit: { set: { 'labour.nil': 'school-paid' },
            effects: { labour: 2.6, cost: 2.4, exposure: 2, autonomy: -1.4 },
            aimed: { Players: { labour: 3 }, Presidents: { cost: -2, exposure: 2.2 } } } },
        { id: 'ignore', label: 'It is not this office\'s business',
          body: 'A man\'s representation is a matter between him and the person he pays. Say '
            + 'that, and hear it read back to you in a deposition in about two years.',
          edit: { effects: { autonomy: 1.8, exposure: -2.4, labour: 1 },
            aimed: { Players: { labour: 1.2 }, Presidents: { exposure: -2.6 } } } },
        { id: 'employee', label: 'Say the word',
          body: 'Agents, salaries, contracts, a return from a professional league. Stop '
            + 'looking for a word that is not employee and write the one that is.',
          edit: { set: { 'labour.employment': 'employee', 'labour.revShare': 0.25 },
            effects: { labour: 4, cost: 4, tradition: -3.4, exposure: 2.4 },
            aimed: { Players: { labour: 4 }, Presidents: { cost: -3.4, exposure: 2 },
              Fans: { tradition: -3 } } } },
      ],
    },
    {
      id: 'age',
      beats: [MEDIA, SEPT],
      weight: 5,
      when: (w, L, sit) => sit.reentry === 'open' && sit.proYears >= 1,
      cast: (w, L, rng, sit) => {
        const t = (sit.unbeaten && sit.unbeaten[0]) || sit.leader || null;
        return { school: t ? t.school : null, age: 22 + 2 + (sit.proYears || 1) };
      },
      eyebrow: 'The rules',
      title: (c) => (c ? 'There is a ' + c.age + ' year old at media days'
        : 'There is a twenty-five year old at media days'),
      brief: (c) => 'He is ' + ((c && c.age) || 25) + '. He has a professional season, a wife, '
        + 'a mortgage and a very good year of college football ahead of him, and he was asked '
        + 'about all four of those things in the same eleven minutes. He answered them well. '
        + 'The photograph of him beside a genuine eighteen year old freshman has been on every '
        + 'screen in the country since Tuesday and nobody can decide whether it is heartwarming '
        + 'or an indictment.',
      voices: [
        { id: 'Fans', say: 'A grown man is playing against children and we are pretending that is college.' },
        { id: 'Players', say: 'He is enrolled, he goes to class, he is eligible. What exactly is the objection?' },
        { id: 'Networks', say: 'He is the single most interesting person in this sport right now.' },
      ],
      options: [
        { id: 'cap', label: 'Put an age on it',
          body: 'A ceiling, published, no exceptions. It is arbitrary, it will be litigated, '
            + 'and it is the only line anybody can actually see.',
          edit: { set: { 'labour.proYears': 0 },
            effects: { labour: -2.6, tradition: 2.4, exposure: -2, access: 0.8 },
            aimed: { Players: { labour: -3 }, Fans: { tradition: 2.4 },
              Presidents: { exposure: -1.8 } } } },
        { id: 'clock', label: 'A five year clock from enrolment',
          body: 'Not an age, a clock. It starts when you first enrol and it does not stop for '
            + 'anything, including a year in a professional camp. Same effect, defensible '
            + 'shape.',
          edit: { set: { 'labour.eligibility': 5, 'labour.reentry': 'window' },
            effects: { labour: 0.8, tradition: 1.2, cost: 0.4, exposure: 1 },
            aimed: { Players: { labour: 1 }, Presidents: { exposure: 1.2 },
              Fans: { tradition: 1 } } } },
        { id: 'nothing', label: 'Let him play',
          body: 'He is a student at that university and he is eligible under the rules this '
            + 'sport wrote down. Everything else is a feeling about a photograph.',
          edit: { effects: { labour: 2, tradition: -2.2, inventory: 1.4, autonomy: 1 },
            aimed: { Players: { labour: 2.4 }, Fans: { tradition: -2.4 },
              Networks: { inventory: 1.6 } } } },
      ],
    },
    {
      id: 'withdrawal-deadline',
      beats: [WINTER, PORTAL],
      weight: 6,
      when: (w, L, sit) => sit.reentry !== 'open' || sit.proYears < 2,
      eyebrow: 'The calendar',
      title: 'The deadline is in the wrong place',
      brief: 'A player has to decide whether to withdraw from the draft eleven weeks before '
        + 'the draft tells him anything, and four weeks before the portal window he would need '
        + 'if he withdrew. So the decision every one of them makes is a guess made in the wrong '
        + 'order, and the professional league that sets the first of those dates has never once '
        + 'been in a room with this office about it.',
      voices: [
        { id: 'Players', say: 'Move it two months and half of this argument stops existing.' },
        { id: 'Presidents', say: 'We do not control that calendar. We have asked. They were polite.' },
        { id: 'Networks', say: 'Their draft is a bigger broadcast than anything we own. They will not move.' },
      ],
      options: [
        { id: 'align', label: 'Move our calendar to fit theirs',
          body: 'Portal after the draft, signing after that, everything four weeks later. It '
            + 'fixes the order and it puts every roster in the country together in July.',
          edit: { set: { 'labour.portalWindows': 1, 'labour.reentry': 'window' },
            effects: { labour: 2.6, cost: 1, tradition: -1.4, inventory: -0.6 },
            aimed: { Players: { labour: 2.8 }, Presidents: { cost: -1 } } } },
        { id: 'negotiate', label: 'Go and negotiate with them',
          body: 'Formally, publicly, with a position paper. They may say no. They have never '
            + 'been asked in a way that made saying no cost anything.',
          edit: { effects: { autonomy: 2, exposure: -1.2, labour: 1.4, cost: 0.6 },
            aimed: { Players: { labour: 1.6 }, Presidents: { autonomy: 1.6 } } } },
        { id: 'hold', label: 'Leave the dates alone',
          body: 'Every school in the country has built a February around these dates. Move '
            + 'them and the next two recruiting cycles are chaos for a problem that affects '
            + 'about ninety men a year.',
          edit: { effects: { tradition: 1.6, labour: -2, cost: -0.8 },
            aimed: { Players: { labour: -2.4 }, Presidents: { cost: 1 } } } },
      ],
    },
    {
      id: 'practice-squad',
      beats: [SEPT, OCT],
      weight: 6,
      when: (w, L, sit) => sit.reentry === 'open',
      cast: (w, L, rng, sit) => {
        const t = (sit.unbeaten && sit.unbeaten[0]) || sit.leader || null;
        return t ? { school: t.school, wins: t.wins } : null;
      },
      eyebrow: 'Eligibility',
      title: 'He was on a practice squad in September',
      brief: (c) => 'Three weeks, one paycheque, one release, and now it is October and '
        + ((c && c.school) || 'a member school') + ' would like to add him for the second half '
        + 'of the season. He has not played a college snap this year. There is nothing in the '
        + 'rules that says he cannot and nothing in the rules that contemplated him, and if '
        + 'this office says yes on a Tuesday there will be four more of him by the following '
        + 'Monday.',
      voices: [
        { id: 'Networks', say: 'A ready made storyline arriving in week seven. We would build a week around it.' },
        { id: 'Fans', say: 'You cannot sign a professional in October. That is not a season.' },
        { id: 'Players', say: 'He was cut. He is allowed to work.' },
      ],
      options: [
        { id: 'allow', label: 'Let him sign',
          body: 'And write it down properly so the next four know the rule before they need '
            + 'it. College football now has a mid-season signing window, which is a sentence '
            + 'nobody in this building expected to write.',
          edit: { set: { 'labour.reentry': 'open', 'labour.portalWindows': 3 },
            effects: { labour: 2.6, inventory: 2, tradition: -3, access: -1.6 },
            aimed: { Players: { labour: 2.8 }, Networks: { inventory: 2.4 },
              Fans: { tradition: -3 } } } },
        { id: 'next-year', label: 'Not in season',
          body: 'He can come back in January like everybody else. A roster is a roster from '
            + 'the first Saturday, and that is worth more than one very good half of football.',
          edit: { set: { 'labour.reentry': 'window' },
            effects: { tradition: 2.4, labour: -1.4, inventory: -1, access: 1 },
            aimed: { Fans: { tradition: 2.6 }, Players: { labour: -1.6 } } } },
        { id: 'shut', label: 'He took the cheque',
          body: 'A man who has been paid to play football professionally is a professional '
            + 'football player. The distinction is the last one this sport has and it is worth '
            + 'more than he is.',
          edit: { set: { 'labour.reentry': 'closed' },
            effects: { labour: -3.2, tradition: 3, access: 1.2, exposure: -1 },
            aimed: { Players: { labour: -3.6 }, Fans: { tradition: 2.6 } } } },
      ],
    },
    {
      id: 'reentry-heisman',
      beats: [CHAMP, PLAYOFF],
      weight: 6,
      when: (w, L, sit) => sit.reentry === 'open' && !sit.firstYear,
      cast: (w, L, rng, sit) => {
        const t = (sit.unbeaten && sit.unbeaten[0]) || sit.leader || null;
        return t ? { school: t.school, conference: t.conference } : null;
      },
      eyebrow: 'The season',
      title: (c) => (c ? 'The best player in the sport was cut in August'
        : 'The best player in the sport is a returner'),
      brief: (c) => 'He was released by a professional team on the twenty-eighth of August, '
        + 'was on a college campus by the second of September, and has been the best player in '
        + 'this sport since the fourth. '
        + ((c && c.school) || 'His team') + ' are playing for a national title because of it. '
        + 'Every argument for the open door is standing on a field in December wearing his '
        + 'number, and so is every argument against it.',
      voices: [
        { id: 'Networks', say: 'He is the story of the year and the year is not close.' },
        { id: 'Group of Five', say: 'Nobody cut in August has ever turned up at one of our schools. Not one.' },
        { id: 'Fans', say: 'He is twenty-four, throwing at teenagers. Yes it is great. That is the problem.' },
      ],
      options: [
        { id: 'celebrate', label: 'Put him on the trophy stage',
          body: 'This is the sport working: a man got told no, came back, and was magnificent. '
            + 'Stand behind it out loud and take what comes in the spring.',
          edit: { effects: { labour: 2.4, inventory: 2.6, tradition: -2, access: -1.8 },
            aimed: { Players: { labour: 2.6 }, Networks: { inventory: 2.8 },
              'Group of Five': { access: -2.2 }, Fans: { tradition: -1.6 } } } },
        { id: 'floor', label: 'Let him play and fund the other end',
          body: 'The door stays open and a fund goes to the schools he was never going to '
            + 'return to. It does not solve the concentration and it admits it exists.',
          edit: { effects: { access: 2.4, cost: 2.2, labour: 1.6, money: -1 },
            aimed: { 'Group of Five': { access: 3, money: 2 }, Players: { labour: 1.6 },
              Presidents: { cost: -2 } } } },
        { id: 'window', label: 'This is the last year of it',
          body: 'He finishes the season. Then the door becomes a window, because a rule that '
            + 'produces this every year produces the other thing every year too.',
          edit: { set: { 'labour.reentry': 'window' },
            effects: { access: 2, tradition: 1.6, labour: -2, inventory: -1.4 },
            aimed: { Players: { labour: -2.4 }, 'Group of Five': { access: 2.2 },
              Networks: { inventory: -1.6 } } } },
      ],
    },
    {
      id: 'reentry-suit',
      beats: [WINTER, SPRING, MEDIA],
      weight: 7,
      when: (w, L, sit) => sit.reentry === 'closed' || sit.splitRules,
      eyebrow: 'The courts',
      title: 'Three of them have sued',
      brief: (c, it, sit) => 'A class action, filed in a district that has not been kind to '
        + 'this sport, on behalf of every player barred from returning after a professional '
        + 'stint. The claim is restraint of trade and the exhibits are the minutes of the '
        + 'meeting where '
        + ((sit.doorShut && sit.doorShut[0]) ? sit.doorShut[0] + ' passed its own rule'
          : 'this rule was passed')
        + '. Counsel has told this office privately that they do not expect to win. They have '
        + 'also told this office that they do not need to.',
      voices: [
        { id: 'Presidents', say: 'Settle it. Whatever it costs, settle it before discovery.' },
        { id: 'Players', say: 'Nobody would be in a courtroom if there had been anybody to talk to.' },
        { id: 'SEC', say: 'If we settle every one of these, the rule book is written by plaintiffs.' },
      ],
      options: [
        { id: 'fight', label: 'Fight it',
          body: 'All the way, on the principle that a sport that folds once folds forever. '
            + 'Discovery will produce four emails this office would rather nobody read.',
          edit: { effects: { exposure: -3.4, cost: 2, autonomy: 2, tradition: 1.2 },
            aimed: { Presidents: { exposure: -3, cost: -1.6 }, SEC: { autonomy: 1.8 },
              Players: { labour: -1.6 } } } },
        { id: 'settle', label: 'Settle and reopen the door',
          body: 'Pay it, change the rule, and be the office that did the sensible thing four '
            + 'months and one filing later than it could have.',
          edit: { set: { 'labour.reentry': 'open', 'labour.rulesBy': 'national' },
            effects: { labour: 2.6, cost: 2.6, exposure: 2.4, autonomy: -2 },
            aimed: { Players: { labour: 3 }, Presidents: { cost: -2.2, exposure: 2.4 },
              'Big Ten': { autonomy: -2 } } } },
        { id: 'congress', label: 'Go to Washington for an exemption',
          body: 'Ask for the thing this sport has been asking for since 2021: a statutory '
            + 'shield that makes the rule stick. It has never worked and the asking is now the '
            + 'strategy.',
          edit: { effects: { exposure: -2.4, autonomy: 1.6, cost: 1.4, labour: -2 },
            aimed: { Presidents: { exposure: -2 }, Players: { labour: -2.4 },
              SEC: { autonomy: 1.4 } } } },
      ],
    },
    {
      id: 'pro-league-response',
      beats: [SPRING, MEDIA],
      weight: 5,
      when: (w, L, sit) => sit.reentry !== 'closed',
      eyebrow: 'The professionals',
      title: 'The other league has noticed',
      brief: 'A professional league has quietly changed its own rules in response to yours. '
        + 'Camp invitations are down, one club has stopped signing undrafted college players '
        + 'entirely on the grounds that they will simply go back, and a general manager said '
        + 'on a podcast that college football is now "a very well funded developmental league '
        + 'that we do not pay for". He meant it as a compliment to somebody.',
      voices: [
        { id: 'Networks', say: 'A developmental league that outdraws them on eleven Saturdays a year.' },
        { id: 'Players', say: 'Fewer camp invitations is fewer men who ever get a look. That is the actual cost.' },
        { id: 'Presidents', say: 'We are subsidising the talent identification of a trillion dollar industry.' },
      ],
      options: [
        { id: 'bill', label: 'Send them a bill',
          body: 'A development fee, per player drafted, paid to the sport that made him. It '
            + 'has never been done, they will refuse, and the refusal is a useful thing to '
            + 'have in public.',
          edit: { effects: { money: 1.6, exposure: -1.6, autonomy: 2.2, cost: 0.6 },
            aimed: { Presidents: { money: 1.4, autonomy: 1.6 }, Networks: { inventory: 0.8 } } } },
        { id: 'partner', label: 'Sit down with them',
          body: 'A shared calendar, a shared medical file, a joint statement about the '
            + 'withdrawal deadline. Quiet, useful, and everybody in this room will call it '
            + 'capitulation.',
          edit: { effects: { labour: 2.4, cost: 0.8, autonomy: -1.6, exposure: 1.6 },
            aimed: { Players: { labour: 2.6 }, Presidents: { exposure: 1.4 },
              SEC: { autonomy: -1.4 } } } },
        { id: 'nothing', label: 'Their rules are their business',
          body: 'This office governs one sport. What another league does about its own camp '
            + 'invitations is a matter for the people who run it.',
          edit: { effects: { autonomy: 1, labour: -1.6, exposure: 0.6 },
            aimed: { Players: { labour: -2 }, Presidents: { autonomy: 0.8 } } } },
      ],
    },
    {
      id: 'reentry-review',
      beats: [WINTER],
      weight: 5,
      /* THE LOOK BACK, once there has been a year of whatever was decided to look back at. */
      when: (w, L, sit) => !sit.firstYear && sit.reentry !== 'open',
      cast: (w, L, rng, sit) => ({ rule: sit.reentry, years: sit.seasonOfTerm - 1 }),
      eyebrow: 'The room',
      title: (c) => (c && c.rule === 'closed' ? 'A year of the closed door'
        : 'A year of the window'),
      brief: (c) => 'The review is on the agenda and everybody has brought their own numbers. '
        + 'Ninety-one men declared and did not withdraw. Eleven were drafted. The other eighty '
        + 'are not in this sport any more and four of them are in this building today, in '
        + 'suits, waiting to be heard by the committee that wrote the rule. Two of the '
        + 'conferences that voted for it have submitted a paper asking for it to be relaxed.',
      voices: [
        { id: 'Players', say: 'Eighty. Say the number out loud in front of them and then vote again.' },
        { id: 'Presidents', say: 'Rosters are stable for the first time in six years and we all know why.' },
        { id: 'Fans', say: 'The football has been better. That is not nothing and it is not everything.' },
      ],
      options: [
        { id: 'keep', label: 'Keep it',
          body: 'It is doing what it was written to do. The eighty are the cost and the room '
            + 'voted for the cost with its eyes open.',
          edit: { effects: { tradition: 2, labour: -2.4, access: 1, exposure: -1.4 },
            aimed: { Players: { labour: -2.8 }, Presidents: { cost: 1.4 },
              Fans: { tradition: 1.6 } } } },
        { id: 'relax', label: 'Relax it to a single window',
          body: 'One return, one time, published dates. It is the compromise everybody could '
            + 'have had two years ago before any of this.',
          edit: { set: { 'labour.reentry': 'window', 'labour.proYears': 1 },
            effects: { labour: 2.2, tradition: -0.8, cost: 0.6, access: -0.6 },
            aimed: { Players: { labour: 2.4 }, Presidents: { exposure: 1 } } } },
        { id: 'reopen', label: 'Open it and say you were wrong',
          body: 'Out loud, on the record, with the four of them in the room. It costs this '
            + 'office something that does not come back and it is the right answer.',
          edit: { set: { 'labour.reentry': 'open' },
            effects: { labour: 3.2, exposure: 2.6, autonomy: -1.6, tradition: -1.6 },
            aimed: { Players: { labour: 3.6 }, Presidents: { exposure: 2.2 },
              Fans: { tradition: -1.4 } } } },
      ],
    },

    /* ================================================================================
       WHERE THE GAMES ARE PLAYED, AND WHOSE NAME IS ON THEM.
       The mode could move a kickoff and not a game. It had a setting for whether the playoff
       was on campus or at neutral sites and no idea what a neutral site IS: no cities, no
       stadiums, no roof, no January in Detroit, no bid from a tourism board with a number on
       it. The biggest single thing a commissioner places in an ordinary year is the title
       game and this office had no way to place it.

       THE OPTIONS ON THESE ITEMS ARE REAL PLACES, drawn from venues.js by the cast, which is
       why an option's label and body are resolved through text() the same way a title is.
       Which four cities are bidding is a question about the world, not a thing that can be
       written down in this file.

       AND THE SPONSORS HAVE NO NAMES, on purpose. A stadium is a fact; a sponsor in this
       game goes wrong, and writing that about a real company would be writing something
       false about somebody who could sue. See the note at the top of venues.js.
       ================================================================================ */

    {
      id: 'title-site',
      beats: [WINTER, SPRING],
      weight: 8,
      when: () => true,
      /* THE BIDS ON THE TABLE. Never the site that had it last, because the one thing every
         bid cycle has in common is that the incumbent is not automatically back. */
      cast: (w, L, rng) => {
        if (!VEN) return null;
        const held = [w.venues && w.venues.lastTitle, w.venues && w.venues.title]
          .filter(Boolean);
        const bids = VEN.shortlist(rng, 3, { avoid: held, usOnly: true, minCap: 60000 });
        return bids.length === 3 ? { bids } : null;
      },
      eyebrow: 'The venues',
      title: 'Three cities want the title game',
      brief: (c) => (c
        ? 'The bids are in, they are sealed, and all three of them have flown somebody here '
          + 'to sit outside this office all week. ' + VEN.label(c.bids[0]) + ', '
          + VEN.label(c.bids[1]) + ' and ' + VEN.label(c.bids[2]) + '. Each one is a different '
          + 'answer to what this game is supposed to be, and every athletic director in the '
          + 'sport has a hotel preference they have told you about unprompted.'
        : 'Three cities have bid for the title game and all three of them are waiting outside.'),
      voices: [
        { id: 'Networks', say: 'A dome and a good market. Everything else on this list is a risk we are carrying.' },
        { id: 'Fans', say: 'Somewhere we can afford to get to and sleep in. It is a week off work for us.' },
        { id: 'Presidents', say: 'Whoever pays the most. That money is the postseason distribution.' },
      ],
      options: [
        { id: 'bid-a',
          label: (c) => (c ? VEN.label(c.bids[0]) : 'The first bid'),
          body: (c) => (c ? c.bids[0].name + '. ' + c.bids[0].note : ''),
          edit: (c) => (c ? {
            set: { 'venues.title': c.bids[0].id, 'venues.lastTitle': c.bids[0].id },
            effects: VEN.effectsOf(c.bids[0], 1),
          } : {}) },
        { id: 'bid-b',
          label: (c) => (c ? VEN.label(c.bids[1]) : 'The second bid'),
          body: (c) => (c ? c.bids[1].name + '. ' + c.bids[1].note : ''),
          edit: (c) => (c ? {
            set: { 'venues.title': c.bids[1].id, 'venues.lastTitle': c.bids[1].id },
            effects: VEN.effectsOf(c.bids[1], 1),
          } : {}) },
        { id: 'bid-c',
          label: (c) => (c ? VEN.label(c.bids[2]) : 'The third bid'),
          body: (c) => (c ? c.bids[2].name + '. ' + c.bids[2].note : ''),
          edit: (c) => (c ? {
            set: { 'venues.title': c.bids[2].id, 'venues.lastTitle': c.bids[2].id },
            effects: VEN.effectsOf(c.bids[2], 1),
          } : {}) },
      ],
    },
    {
      id: 'title-rota',
      beats: [WINTER],
      weight: 5,
      when: (w) => !!(w.venues && w.venues.title),
      cast: (w, L, rng) => {
        const cur = VEN ? VEN.venue(w.venues.title) : null;
        return cur ? { cur } : null;
      },
      eyebrow: 'The venues',
      title: (c) => (c ? 'A standing rota, or a bid every year'
        : 'How the title game gets placed'),
      brief: (c) => 'Four cities have written jointly proposing a fixed rotation: same four '
        + 'sites, in order, for a decade, no bidding. It is less money than an auction and it '
        + 'is a decade of nobody in this office being lobbied at a funeral. '
        + ((c && c.cur) ? 'It would start the year after ' + VEN.label(c.cur) + '.' : ''),
      voices: [
        { id: 'Presidents', say: 'An auction is more money and four cities a year wasting eleven of them.' },
        { id: 'Fans', say: 'A rotation means you can plan. Some of us save for two years to go.' },
        { id: 'Networks', say: 'We would rather know where it is in 2032 than find out what it fetches.' },
      ],
      options: [
        { id: 'rota', label: 'Take the rotation',
          body: 'Four sites, ten years, published tomorrow. Less money, no lobbying, and one '
            + 'less thing on this desk every January.',
          edit: { effects: { money: -1.8, tradition: 2.4, exposure: 1.6, inventory: -0.6 },
            aimed: { Fans: { tradition: 2.4 }, Presidents: { money: -1.6, exposure: 1.4 } } } },
        { id: 'auction', label: 'Keep the auction',
          body: 'Every year, sealed bids, highest number wins. It is the most money this '
            + 'sport can extract and everybody in the room has to pretend they do not know '
            + 'that is what it is.',
          edit: { effects: { money: 2.6, tradition: -1.6, exposure: -1.2, access: -0.6 },
            aimed: { Presidents: { money: 2.2 }, Fans: { tradition: -1.8 } } } },
        { id: 'spread', label: 'A rota, but write in a cold weather slot',
          body: 'Three warm sites and one that has never had it. It costs money and it puts '
            + 'the biggest night of the year somewhere that has waited eighty years for it.',
          edit: { effects: { access: 2.6, tradition: 1, money: -2.2, exposure: -1.4 },
            aimed: { Fans: { access: 2, tradition: 1.4 }, 'Big Ten': { access: 2 },
              Networks: { inventory: -1.4 } } } },
      ],
    },
    {
      id: 'kickoff-game',
      beats: [SPRING, MEDIA],
      weight: 7,
      when: () => true,
      cast: (w, L, rng) => {
        if (!VEN) return null;
        const bids = VEN.shortlist(rng, 3, { avoid: (w.venues && w.venues.openers) || [] });
        const live = L.POWERS.filter((c) => !L.isDefunct(w, c));
        const ca = live[Math.floor(rng() * live.length) % live.length];
        const cb = live[(live.indexOf(ca) + 1) % live.length];
        const ma = L.membersOf(w, ca), mb = L.membersOf(w, cb);
        return bids.length === 3 ? {
          bids,
          a: ma[Math.floor(rng() * ma.length) % ma.length] || 'one of them',
          b: mb[Math.floor(rng() * mb.length) % mb.length] || 'the other',
        } : null;
      },
      eyebrow: 'Week one',
      title: (c) => (c ? c.a + ' and ' + c.b + ', somewhere neutral'
        : 'The opening weekend needs a venue'),
      brief: (c) => (c
        ? 'Two programmes who would never schedule each other have agreed to, on the first '
          + 'Saturday, at a neutral site, for a cheque. Three cities want it. It is the only '
          + 'game on that night and it will set the tone of the entire season, which is a lot '
          + 'to hang on a decision about a car park.'
        : 'Two programmes have agreed to open the season at a neutral site and three cities '
          + 'want it.'),
      voices: [
        { id: 'Networks', say: 'The first Saturday with one game on it is the best inventory of the year.' },
        { id: 'Fans', say: 'Week one used to be at somebody\'s stadium with their students in it.' },
        { id: 'Players', say: 'It is a road game for both of us in the last week of August.' },
      ],
      options: [
        { id: 'k-a',
          label: (c) => (c ? VEN.label(c.bids[0]) : 'The first bid'),
          body: (c) => (c ? c.bids[0].name + '. ' + c.bids[0].note : ''),
          edit: (c) => (c ? { effects: VEN.effectsOf(c.bids[0], 0.55) } : {}) },
        { id: 'k-b',
          label: (c) => (c ? VEN.label(c.bids[1]) : 'The second bid'),
          body: (c) => (c ? c.bids[1].name + '. ' + c.bids[1].note : ''),
          edit: (c) => (c ? { effects: VEN.effectsOf(c.bids[1], 0.55) } : {}) },
        { id: 'campus',
          label: 'Neither. Play it on a campus',
          body: 'Home and home, students in the building, and a fraction of the money. The '
            + 'sport did it this way for a century and stopped for a reason nobody can defend '
            + 'out loud.',
          edit: { effects: { tradition: 2.8, money: -2.2, inventory: -1, access: 0.6 },
            aimed: { Fans: { tradition: 3 }, Networks: { inventory: -1.6 },
              Presidents: { money: -1.8 } } } },
      ],
    },
    {
      id: 'playoff-naming',
      beats: [WINTER, SPRING],
      weight: 7,
      when: (w) => !(w.brand && w.brand.playoff),
      cast: (w, L, rng) => {
        if (!VEN) return null;
        const offers = VEN.sponsorList(rng, 3);
        return offers.length === 3 ? { offers } : null;
      },
      eyebrow: 'The money',
      title: 'Somebody wants their name on the playoff',
      brief: (c) => (c
        ? 'Three offers, all of them for the same thing: the words in front of the words '
          + '"College Football Playoff", on every broadcast, every ticket and every piece of '
          + 'confetti, for a decade. ' + c.offers[0].name + '. ' + c.offers[1].name + '. '
          + c.offers[2].name + '. The lowest of the three is more money than this sport made '
          + 'in total in 1998.'
        : 'Three companies want their name in front of the words College Football Playoff.'),
      voices: [
        { id: 'Presidents', say: 'The largest cheque available to us, and not from television.' },
        { id: 'Fans', say: 'It has a name. It is called the playoff.' },
        { id: 'Networks', say: 'We say their name eleven times a broadcast. Choose somebody sayable.' },
      ],
      options: [
        { id: 's-a',
          label: (c) => (c ? c.offers[0].name : 'The first offer'),
          body: (c) => (c ? c.offers[0].pitch : ''),
          edit: (c) => (c ? { set: { 'brand.playoff': c.offers[0].id },
            effects: VEN.sponsorEffects(c.offers[0], 1) } : {}) },
        { id: 's-b',
          label: (c) => (c ? c.offers[1].name : 'The second offer'),
          body: (c) => (c ? c.offers[1].pitch : ''),
          edit: (c) => (c ? { set: { 'brand.playoff': c.offers[1].id },
            effects: VEN.sponsorEffects(c.offers[1], 1) } : {}) },
        { id: 'none', label: 'It is called the playoff',
          body: 'Turn all three down, in writing, and be the office that left three hundred '
            + 'million dollars on a table because of a name.',
          edit: { effects: { tradition: 3.2, money: -3, exposure: 1.6 },
            aimed: { Fans: { tradition: 3.4 }, Presidents: { money: -2.6 } } } },
      ],
    },
    {
      id: 'bowl-sponsor-gone',
      beats: [MEDIA, SEPT],
      weight: 6,
      when: () => true,
      cast: (w, L, rng) => {
        if (!VEN) return null;
        const majors = VEN.BOWLS.filter((b) => b.tier === 3);
        const bowl = majors[Math.floor(rng() * majors.length) % majors.length];
        const offers = VEN.sponsorList(rng, 2);
        return bowl && offers.length === 2 ? { bowl, offers, venue: VEN.venue(bowl.venue) } : null;
      },
      eyebrow: 'The postseason',
      title: (c) => (c ? 'The ' + c.bowl.name + ' has lost its sponsor'
        : 'A bowl has lost its sponsor'),
      brief: (c) => (c
        ? 'Twelve weeks before kickoff, by email, citing a restructuring. The '
          + c.bowl.name + ' has a stadium in ' + (c.venue ? c.venue.city : 'its city')
          + ', a television window, a parade committee and no title sponsor, and every piece '
          + 'of signage in the building has last year\'s name on it. Two replacements have '
          + 'already called, which tells you what the first one was paying.'
        : 'A major bowl has lost its title sponsor twelve weeks before kickoff.'),
      voices: [
        { id: 'Presidents', say: 'That bowl funds four athletic departments. It plays with a name on it.' },
        { id: 'Fans', say: 'It had a name for ninety years before anybody bought one.' },
        { id: 'Networks', say: 'We sold the window with a sponsor in the title. That is a contract.' },
      ],
      options: [
        { id: 'b-a',
          label: (c) => (c ? c.offers[0].name : 'The first replacement'),
          body: (c) => (c ? c.offers[0].pitch : ''),
          edit: (c) => (c ? { set: { ['brand.bowls.' + c.bowl.id]: c.offers[0].id },
            effects: VEN.sponsorEffects(c.offers[0], 0.6) } : {}) },
        { id: 'b-b',
          label: (c) => (c ? c.offers[1].name : 'The second replacement'),
          body: (c) => (c ? c.offers[1].pitch : ''),
          edit: (c) => (c ? { set: { ['brand.bowls.' + c.bowl.id]: c.offers[1].id },
            effects: VEN.sponsorEffects(c.offers[1], 0.6) } : {}) },
        { id: 'bare', label: (c) => (c ? 'Play it as the ' + c.bowl.name : 'Play it under its own name'),
          body: 'No sponsor, no signage, one year, and see whether anybody misses it. They '
            + 'will not, which is either reassuring or the most expensive thing you learn '
            + 'this year.',
          edit: { effects: { tradition: 2.6, money: -2, exposure: 0.8 },
            aimed: { Fans: { tradition: 3 }, Presidents: { money: -2 } } } },
      ],
    },
    {
      id: 'bowl-moves',
      beats: [WINTER, SPRING],
      weight: 5,
      when: () => true,
      cast: (w, L, rng) => {
        if (!VEN) return null;
        const mid = VEN.BOWLS.filter((b) => b.tier <= 2);
        const bowl = mid[Math.floor(rng() * mid.length) % mid.length];
        const to = VEN.shortlist(rng, 1, { avoid: [bowl.venue], usOnly: true })[0];
        return bowl && to ? { bowl, from: VEN.venue(bowl.venue), to } : null;
      },
      eyebrow: 'The postseason',
      title: (c) => (c ? 'The ' + c.bowl.name + ' wants to move'
        : 'A bowl wants to move cities'),
      brief: (c) => (c
        ? 'The ' + c.bowl.name + ' has played in '
          + (c.from ? c.from.city : 'the same city') + ' since it was invented and it would '
          + 'now like to play in ' + c.to.city + ', which has offered it a great deal of money '
          + 'and a stadium that is not falling down. The bowl keeps the name. The city keeps '
          + 'the name too, apparently, which is a sentence four lawyers are currently arguing '
          + 'about.'
        : 'A bowl would like to move to a city that has offered it money and a better '
          + 'stadium, and keep its name.'),
      voices: [
        { id: 'Fans', say: 'It is named after the place. That is what the name is.' },
        { id: 'Presidents', say: 'The payout doubles. The payout is the entire reason the bowl exists.' },
        { id: 'Group of Five', say: 'Half the teams in that game every year are ours and none of us were asked.' },
      ],
      options: [
        { id: 'move', label: (c) => (c ? 'Let it go to ' + c.to.city : 'Let it move'),
          body: (c) => (c ? c.to.name + '. ' + c.to.note : 'A better stadium and more money.'),
          edit: (c) => (c ? {
            effects: Object.assign(VEN.effectsOf(c.to, 0.4), { tradition: -2.4 }),
            aimed: { Fans: { tradition: -2.6 }, Presidents: { money: 1.6 } },
          } : {}) },
        { id: 'rename', label: 'It can move. It cannot keep the name',
          body: 'A bowl named after a place is named after the place. Move and you are a new '
            + 'bowl with a new name and none of the history, which is most of what the city '
            + 'was buying.',
          edit: { effects: { tradition: 2, money: -0.8, exposure: 0.6, inventory: -0.4 },
            aimed: { Fans: { tradition: 2.4 }, Presidents: { money: -0.8 } } } },
        { id: 'stay', label: 'It stays',
          body: 'Block it, fund the stadium repairs out of the postseason pool, and take the '
            + 'phone call from a mayor who was promised something.',
          edit: { effects: { tradition: 2.6, cost: 1.8, autonomy: -1.6, money: -1 },
            aimed: { Fans: { tradition: 2.6 }, Presidents: { cost: -1.6 } } } },
      ],
    },
    {
      id: 'jersey-patch',
      beats: [SPRING, MEDIA],
      weight: 6,
      when: (w) => !(w.brand && w.brand.patch),
      cast: (w, L, rng) => {
        if (!VEN) return null;
        const offers = VEN.sponsorList(rng, 2);
        return offers.length === 2 ? { offers } : null;
      },
      eyebrow: 'The money',
      title: 'A patch on the jersey',
      brief: 'Four inches square, left shoulder, every team in the sport, and the number '
        + 'attached to it is larger than the entire postseason distribution. The professional '
        + 'leagues did this five years ago and nobody remembers the week they announced it. '
        + 'The mock-ups are on the table and everybody in the room has looked at them and '
        + 'then looked away.',
      voices: [
        { id: 'Presidents', say: 'It pays for every non revenue sport in this sport. Every single one.' },
        { id: 'Fans', say: 'That is the jersey. That is the actual jersey.' },
        { id: 'Players', say: 'We are wearing an advertisement. We would like to know what our share of it is.' },
      ],
      options: [
        { id: 'p-a',
          label: (c) => (c ? c.offers[0].name : 'The first offer'),
          body: (c) => (c ? c.offers[0].pitch : ''),
          edit: (c) => (c ? { set: { 'brand.patch': c.offers[0].id },
            effects: Object.assign(VEN.sponsorEffects(c.offers[0], 0.8), { labour: -0.8 }),
            aimed: { Players: { labour: -1.2 } } } : {}) },
        { id: 'p-share',
          label: (c) => (c ? c.offers[1].name + ', with a cut to the players'
            : 'Take an offer, and share it'),
          body: (c) => (c ? c.offers[1].pitch + ' A fixed share of it goes into the revenue '
            + 'pool, written into the contract.' : ''),
          edit: (c) => (c ? { set: { 'brand.patch': c.offers[1].id },
            effects: Object.assign(VEN.sponsorEffects(c.offers[1], 0.6), { labour: 2.4, cost: 1.2 }),
            aimed: { Players: { labour: 2.8 }, Presidents: { cost: -1.4 } } } : {}) },
        { id: 'no', label: 'Not on the jersey',
          body: 'There is a line and this office has decided it is on the shoulder of an '
            + 'unpaid nineteen year old. Say so, and know it moves the year after you leave.',
          edit: { effects: { tradition: 3, money: -3.2, labour: 0.8 },
            aimed: { Fans: { tradition: 3.4 }, Presidents: { money: -2.8 } } } },
      ],
    },
    {
      id: 'bid-collapse',
      beats: [MEDIA, SEPT, OCT],
      weight: 5,
      when: (w) => !!(w.venues && w.venues.title),
      cast: (w, L, rng) => {
        const cur = VEN ? VEN.venue(w.venues.title) : null;
        if (!cur) return null;
        const alt = VEN.shortlist(rng, 2, { avoid: [cur.id], domeOnly: true, usOnly: true });
        return alt.length === 2 ? { cur, alt } : null;
      },
      eyebrow: 'The venues',
      title: (c) => (c ? VEN.label(c.cur) + ' cannot deliver' : 'The host city cannot deliver'),
      brief: (c) => (c
        ? 'The hotel block is forty per cent of what was in the bid, the transit project that '
          + 'was going to be finished is not going to be finished, and the local organising '
          + 'committee has lost its executive director and its chief financial officer in the '
          + 'same fortnight. ' + (c.cur ? c.cur.name : 'The stadium') + ' is fine. Everything '
          + 'around it is not, and the game is in four months.'
        : 'The host city cannot deliver what was in its bid and the game is in four months.'),
      voices: [
        { id: 'Networks', say: 'We can broadcast from anywhere. Forty thousand people cannot sleep anywhere.' },
        { id: 'Fans', say: 'Some of us booked flights in February. Non refundable ones.' },
        { id: 'Presidents', say: 'Moving it means giving back the fee and eating the difference.' },
      ],
      options: [
        { id: 'move-a',
          label: (c) => (c ? 'Move it to ' + VEN.label(c.alt[0]) : 'Move it'),
          body: (c) => (c ? c.alt[0].name + ' can take it at four months notice. '
            + c.alt[0].note : ''),
          edit: (c) => (c ? {
            set: { 'venues.title': c.alt[0].id },
            effects: Object.assign(VEN.effectsOf(c.alt[0], 0.7),
              { cost: 2.2, exposure: -1.4, money: -1.6 }),
            aimed: { Presidents: { cost: -2 }, Fans: { tradition: -1.2 } },
          } : {}) },
        { id: 'prop', label: 'Prop the city up',
          body: 'The sport funds the shortfall: hotels, buses, a temporary staff. It is '
            + 'expensive and it is the only version where nobody\'s flight is wasted.',
          edit: { effects: { cost: 3, exposure: 1.4, tradition: 1.2, money: -1.4 },
            aimed: { Fans: { tradition: 1.8 }, Presidents: { cost: -2.6 } } } },
        { id: 'hold', label: 'They signed a contract',
          body: 'It is their problem, it is in the agreement, and the sport will find out in '
            + 'January whether a contract can produce a hotel room.',
          edit: { effects: { money: 1, exposure: -3, autonomy: 1.4, tradition: -1.6 },
            aimed: { Presidents: { exposure: -2.6 }, Fans: { tradition: -2.2 } } } },
      ],
    },
  ];

  const BY_ID = {};
  ITEMS.forEach((it) => { BY_ID[it.id] = it; });

  /* THE SHAPE AN ITEM MAY RELY ON WHEN NOBODY HANDED US A SITUATION. situation.js builds the
     real one and this file cannot require it without giving up being dependency-free, so the
     empty shape lives here as the contract between the two: anything an item's `when` or
     `cast` reads has to be a field on this, and it has to be safe to read in February with no
     football behind it.

     WITHOUT IT AN ITEM SILENTLY VANISHES. `eligible` catches whatever `when` throws and
     answers false, which is right for a genuinely broken gate and indistinguishable from an
     item that reads `sit.unbeaten.length` on a call that passed no situation. That failure
     mode is an argument the sport never has, in a mode that is nothing but arguments. */
  const NOSIT = {
    year: 0, beat: 0, beatName: '', seasonOfTerm: 1, seasonsLeft: 4,
    firstYear: true, lastYear: false, date: null, dateLabel: null, month: null,
    inSeason: false, played: false, week: null, teams: [],
    unbeaten: [], unbeatenCount: 0, hasUnbeaten: false, outsider: null, bigUnbeaten: [],
    sameConfUnbeaten: null, leader: null, upset: null, blowout: null, biggest: null,
    viewers: null, perGame: null, trend: null, audienceUp: false, audienceDown: false,
    confs: {}, endangered: [], gone: [], previous: null,
    titleSite: null, titleVenue: null, lastTitleSite: null, openers: [],
    playoffSponsor: null, patchSponsor: null, bowlSponsors: {}, sold: [], soldCount: 0,
    reentry: 'open', rulesBy: 'national', proYears: 1, confReentry: {},
    splitRules: false, doorShut: [], doorOpen: [],
    meters: null, pressure: null, standing: null, shaky: false, secure: false,
    ruled: 0, lit: [],
  };

  /* WHAT COULD LAND ON THIS DESK, THIS BEAT. Gated on the world rather than on a counter, so
     a sport that has already expanded to sixteen is not asked to do it again and a deal with
     four years left is not on the table. `L` is the ledger module, passed in rather than
     required, so this file stays dependency-free and testable on a fake world.

     `sit` is what is going on right now, from situation.js, which is how an item gets to be
     about THIS October rather than about October. */
  function eligible(world, L, sit) {
    const s = sit || NOSIT;
    return ITEMS.filter((it) => {
      if (it.beats.indexOf(world.beat) < 0) return false;
      try { return it.when(world, L, s); } catch (e) { return false; }
    });
  }

  /* The item for a beat, picked from what is eligible, weighted, and deterministic on the
     world's own seed and clock. Two players with the same seed get the same term, which is
     what makes a term replayable and therefore testable. */
  /* HOW LONG AGO THIS ARGUMENT WAS LAST HAD, in beats, off the ledger's own record. Infinity
     if it has never come up, which is what makes a fresh item the most likely one. */
  function sinceRuled(world, id) {
    const h = world.history || [];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].id && String(h[i].id).split(':')[0] === id) {
        return (world.year - h[i].year) * 9 + (world.beat - h[i].beat);
      }
    }
    return Infinity;
  }

  /* A RECENCY PENALTY, because weight alone cannot fix a thin beat. Measured across two
     hundred terms: the portal item came up 5.0 times in a five year term, which is every
     year without exception, for the simple reason that it was the only thing eligible on
     its beat. Dropping its weight changes nothing when there is nothing to lose to.

     So an argument the sport had recently is unlikely rather than impossible, and it is
     scaled rather than banned: if everything eligible is stale the weights are all scaled
     together and the pick still happens, which is the behaviour a hard block would break.

     A season is nine beats. Inside one, an item is worth a fifth of itself; inside two, half.
     After that the sport is entitled to have the argument again, because in life it does. */
  function recency(world, it) {
    const gap = sinceRuled(world, it.id);
    if (gap >= 18) return 1;
    if (gap >= 9) return 0.5;
    return 0.2;
  }

  /* WHAT THE LAST RULING WAS HEADED, so the next one can avoid saying it again.
     The eyebrow is the first thing read on the desk and there are seventy-five items sharing
     forty-four headings, so two of the four "The rules" items landing back to back reads as
     the mode repeating itself even when the two decisions have nothing to do with each other.
     A player notices the word before they notice the item. */
  function lastEyebrow(world) {
    const h = (world && world.history) || [];
    for (let i = h.length - 1; i >= 0; i--) {
      const id = h[i] && h[i].id;
      if (!id || String(id).indexOf('season:') === 0) continue;
      const it = BY_ID[id];
      return it ? it.eyebrow : null;
    }
    return null;
  }

  function pick(world, L, rng, sit) {
    const pool = eligible(world, L, sit);
    if (!pool.length) return null;
    /* A CRISIS DOES NOT WAIT FOR A QUIET WEEK. A lit fuse outranks the whole docket, and if
       two are lit the older one goes first, because that is the order the letters arrived
       in. Weights are not consulted at all: a hundred against a five would still leave a one
       in twenty chance of the sport ignoring a lawsuit for a beat. */
    const urgent = pool.filter((it) => it.crisis);
    if (urgent.length) {
      if (urgent.length === 1) return urgent[0];
      const worst = urgent.slice().sort((a, b) =>
        (world.pressure[b.id.replace('crisis-', '')] || 0)
        - (world.pressure[a.id.replace('crisis-', '')] || 0));
      return worst[0];
    }
    /* HEAVILY AGAINST, RATHER THAN FORBIDDEN. Sometimes the sport really is arguing about the
       rules two weeks running, and a hard ban would become its own pattern: every heading
       would be guaranteed to alternate, which is as visible as repeating. */
    const last = lastEyebrow(world);
    const w = pool.map((it) => Math.max(0.01, (it.weight || 1) * recency(world, it)
      * (last && it.eyebrow === last ? 0.1 : 1)));
    const total = w.reduce((t, x) => t + x, 0);
    let r = (rng ? rng() : 0.5) * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  /* WHAT A DIAL IS ALLOWED TO BE, which is the whole of the tier split and it lives here
     rather than in the page so nothing on screen has to remember the rule. */
  function settings(dial, pro) {
    return (pro ? dial.pro : dial.free) || dial.free || [];
  }

  /* HOW A SETTING READS, beside the data that decides it rather than guessed at from the
     step size. See the note on the pool dial: guessing printed a media rights deal as a
     percentage. */
  function format(dial, v) {
    if (dial.unit === 'pct') return Math.round(v * 100) + '%';
    if (dial.unit === 'bn') return '$' + (Math.round(v * 10) / 10).toFixed(1) + 'B';
    return String(v);
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
      /* THE TITLE MAY BE A FUNCTION OF THE CAST, and this is the one place that was still
         concatenating it raw. The record of a ruling is shown to the player, so a title
         left unresolved put the source of an arrow function on the ledger and nothing
         failed: it is a string either way. Resolve it here, where the cast is in hand. */
      /* AND SO MAY THE OPTION'S OWN LABEL. An item that offers four real cities cannot have
         them written down here: which four is a question about the world. Same treatment the
         title has had, for the same reason, and the ruling on the record reads "Where the
         title game goes, New Orleans" rather than the source of a function. */
      /* A WRITTEN LABEL LOWERCASES AND A COMPUTED ONE DOES NOT. The static ones are sentence
         fragments ("Leave the formula alone") and read correctly folded into the title. The
         dynamic ones are proper nouns: a city, a stadium, a company. The record of a ruling
         said "Three cities want the title game, pasadena, ca", which is the sort of thing a
         player screenshots. */
      label: text(item.title, cast, item) + ', '
        + (typeof option.label === 'function'
          ? String(text(option.label, cast, item))
          : String(option.label).toLowerCase()),
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
  /* THE CAST IS COMPUTED ONCE PER BEAT and both the prose and the ruling read it, so the two
     schools named in the brief are the two schools the map moves. It now also sees what is
     going on, which is how an item gets to name the team that is 8-0 rather than describe a
     team that might be. */
  const castOf = (item, world, L, rng, sit) =>
    (item.cast ? item.cast(world, L, rng, sit || NOSIT) : null);
  const text = (v, cast, item, sit) =>
    (typeof v === 'function' ? v(cast, item, sit || NOSIT) : v);

  const publicAPI = { ITEMS, BY_ID, BEATS: { WINTER, PORTAL, SPRING, MEDIA, SEPT, OCT, NOV, CHAMP, PLAYOFF },
    eligible, pick, resolve, settings, format, castOf, text, recency, sinceRuled, NOSIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.PS_CFB_DOCKET = publicAPI;
})();
