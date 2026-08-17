/* tourdata.js: what the walkthrough actually says (window.RTGTourData).
 *
 * Separate from tour.js so the engine stays a mechanism and this stays copy.
 *
 * ORDER MATTERS. A newcomer needs the answers in the order the questions
 * arrive: what is this place, what am I looking at, what do I do right now,
 * and what am I chasing. Rules come last, because "score 5 points for calling
 * it off one club" means nothing until you know what a club is doing on the
 * screen.
 *
 * Every step names a real element. A step whose element is missing is dropped
 * by the engine, which is what lets one game definition cover pages that do
 * not all have a league switcher or a leaderboard.
 */
(function () {
  'use strict';

  var HUB = [
    { sel: '.zone-head .kicker',
      title: 'Welcome to the arcade',
      html: 'Ten small sports puzzles, about a minute each. They are built from real NBA, NFL and MLB careers, ' +
            'and <b>every one of them resets at midnight</b>.',
      cta: 'Show me' },
    { sel: '.tsec.daily',
      title: 'Daily puzzles',
      html: 'The games under this heading are <b>one solve a day</b>. You get the same puzzle everyone else gets, ' +
            'you play it once, and that is your day.' },
    { sel: '.tsec.run',
      title: 'Streak games',
      html: 'These ones keep going until you miss. <b>How far you get is the score</b>, and it starts over tomorrow.' },
    { sel: '#cardMatch',
      title: 'Start here',
      html: 'Daily Match is the easiest way in: sixteen names hide four groups of four. ' +
            '<b>No sports trivia needed to see the idea</b>, and it takes about three minutes.' },
    { sel: '#dprog',
      title: 'Your day, at a glance',
      html: 'One pip per game. They fill in as you play, so you can see what is left without scrolling the whole page.' },
    { sel: '#cardMatch',
      title: 'What you are chasing',
      html: 'Each game keeps <b>its own daily streak</b>: play it, and the streak grows. Miss a day and it goes back to zero. ' +
            'That is the whole game behind the games.',
      cta: 'Play Daily Match',
      href: '/arcade/match/' }
  ];

  /* Per game. `sel` values are the real ids and classes on those pages.
     The first step is always the league switcher where there is one, because
     it is the control people ask about first and the one that silently
     changes which board they are competing on. */
  var LEAGUES = {
    sel: '#modesw',
    title: 'Pick a league',
    html: 'All Sports mixes NBA, NFL and MLB. Tap a single league and you get a different puzzle, ' +
          '<b>its own leaderboard and its own streak</b>. They do not share.'
  };
  /* Every page has a leaderboard and no two of them agree on the class name:
     .lb on most, #lb on Daily Match, and the collapsed .rtglb-open pill where
     the panel itself is behind a tap. First match wins. */
  var BOARD = {
    sel: '.lb, #lb, .rtglb-open',
    title: 'Where you finished',
    html: 'Today’s leaderboard. Everyone is playing the same puzzle, so it is a fair fight.'
  };

  var GAMES = {
    career: [
      LEAGUES,
      { sel: '.pathcard',
        title: 'A career, one club at a time',
        html: 'The scouting file at the top is free: position, college, era. Then you get the <b>first club only</b>, ' +
              'and the rest of the career is hidden.' },
      { sel: '#revealBtn',
        title: 'The decision',
        html: 'Ask for another club whenever you like. It always helps, and it always <b>costs you points</b>: ' +
              'five off the first club, three off two or three, less after that.' },
      { sel: '#answerbar',
        title: 'Name them',
        html: 'Type the player and hit Call it. Spelling we do not recognise costs nothing, so guess freely, ' +
              'but <b>naming the wrong real player ends your run</b>.' },
      { sel: '#bailBtn',
        title: 'If you are stuck',
        html: 'This swaps the typing for four names and drops the round to one point. It is there so a career ' +
              'you cannot place is a bad round, not the end of your day.' },
      BOARD
    ],
    almamater: [
      LEAGUES,
      { sel: '.pcard',
        title: 'One player at a time',
        html: 'Where did they go to college? That is the whole question.' },
      { sel: '#answerbar',
        title: 'Type the school',
        html: '<b>Two points for typing it.</b> UNC, North Carolina and University of North Carolina all count, ' +
              'so use whichever name you know it by.' },
      { sel: '#bailBtn',
        title: 'Or take the four',
        html: 'Four schools instead, worth one point. One wrong school ends the run either way.' },
      BOARD
    ],
    table: [
      { sel: '.pcard',
        title: 'One player, one club',
        html: 'A single spell at a single team, with the years. <b>What number did they wear there?</b>' },
      { sel: '#answerbar',
        title: 'Type the number',
        html: 'Exact is a bullseye. <b>Within two still counts</b>, because being a digit out is remembering, not guessing.' },
      { sel: '#shieldPill',
        title: 'One save',
        html: 'Your first real miss is absorbed and puts you back to zero without ending the run. The second one ends it.' },
      BOARD
    ],
    match: [
      LEAGUES,
      { sel: '#pool',
        title: 'Sixteen names, four groups',
        html: 'Every name belongs to exactly one group of four. The link might be a team, a jersey number, ' +
              'a surname, anything.' },
      { sel: '.submitbar',
        title: 'Lock in four',
        html: 'Tap four names, then Submit. <b>"One away" means three of your four belong together</b>, which is the ' +
              'most useful thing the game will ever tell you.' },
      { sel: '.mstatus .dots, .statusCard .dots',
        title: 'Four mistakes',
        html: 'These are your wrong guesses. Use all four and the day is over.' },
      BOARD
    ],
    oddone: [
      { sel: '#choices',
        title: 'Four belong, one does not',
        html: 'Four of these five share something: a team, a position, a decade, the Hall of Fame. Tap the one that does not.' },
      { sel: '.prompt',
        title: 'Then say why',
        html: 'Spotting it is worth a point. <b>Naming the connection is worth another</b>, because pointing at the odd ' +
              'one is one-in-five luck and saying why is knowing.' },
      BOARD
    ],
    rankit: [
      LEAGUES,
      { sel: '.axis',
        title: 'Most at the top',
        html: 'Always most at the top. The stat changes daily; the direction never does.' },
      { sel: '#rows',
        title: 'Put them in order',
        html: '<b>Tap two names to swap them</b>, or drag by the number. The arrows work too.' },
      { sel: '#checkBtn',
        title: 'Five tries',
        html: 'Check tells you <b>how many are in the right spot, never which ones</b>. Working that out is the puzzle. ' +
              'Fewest tries wins the day.' },
      BOARD
    ],
    guess: [
      LEAGUES,
      { sel: '.board',
        title: 'Five career columns',
        html: 'Position, franchises, debut decade, college and honours. <b>Green is a match, yellow is close</b>, ' +
              'and the arrows point higher or lower.' },
      { sel: '#q',
        title: 'Guess any player',
        html: 'Type any player from that sport, from any era. A guess is never wasted: every row narrows it down.' },
      { sel: '#guessesLeft',
        title: 'Eight guesses',
        html: 'That is the whole budget. Stuck? There is a clue button that spends one.' },
      BOARD
    ],
    crossword: [
      { sel: '.board-wrap, #board',
        title: 'A sports mini',
        html: 'Tap a square and type. Tapping the same square again switches between across and down.' },
      { sel: '.cluebar',
        title: 'Your clue',
        html: 'The clue for wherever you are sits here and follows you around the grid.' },
      BOARD
    ],
    sportegories: [
      { sel: '#letterTile',
        title: 'One letter',
        html: 'Every answer today has to start with this letter, on <b>either the first name or the last</b>.' },
      { sel: '#rows',
        title: 'Eight categories, two minutes',
        html: 'Type a full name into each. Start typing and the list underneath does most of the work.' },
      { sel: '#doneBtn',
        title: 'Rarer is worth more',
        html: 'An obvious answer scores. <b>An answer nobody else thinks of scores more.</b> Names starting with the ' +
              'letter twice score double.' },
      BOARD
    ]
  };

  window.RTGTourData = { HUB: HUB, GAMES: GAMES };
})();
