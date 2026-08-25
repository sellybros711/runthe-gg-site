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

  function pick(world, L, rng) {
    const pool = eligible(world, L);
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
    const w = pool.map((it) => Math.max(0.01, (it.weight || 1) * recency(world, it)));
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
      label: text(item.title, cast, item) + ', ' + option.label.toLowerCase(),
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
    eligible, pick, resolve, settings, format, castOf, text, recency, sinceRuled };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.PS_CFB_DOCKET = publicAPI;
})();
