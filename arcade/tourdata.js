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
      html: 'Twelve small sports puzzles, about a minute each. They are built from real NBA, NFL and MLB careers, ' +
            'and <b>every one of them resets at midnight</b>.',
      cta: 'Show me' },
    { sel: '.tsec.daily',
      title: 'Daily puzzles',
      html: 'The games under this heading are <b>one solve a day</b>. You get the same puzzle everyone else gets, ' +
            'you play it once, and that is your day.' },
    { sel: '.tsec.run',
      title: 'Streak games',
      html: 'These ones keep going until you miss. <b>How far you get is the score</b>, and it starts over tomorrow.' },
    /* Start on a game they can actually open. Common Ground is behind the
       Arcade Card now, so pointing a brand new visitor at it walked them into
       a paywall on step four. Sportegories is free, and it is the game people
       come back to. */
    { sel: '#cardSpg',
      title: 'Start here',
      html: 'Sportegories is the one to open first: one letter, eight categories, two minutes. ' +
            '<b>Type any player who fits</b>, and rarer answers score more.' },
    { sel: '#dprog',
      title: 'Your day, at a glance',
      html: 'One pip per game. They fill in as you play, so you can see what is left without scrolling the whole page.' },
    { sel: '#cardSpg',
      title: 'What you are chasing',
      html: 'Each game keeps <b>its own daily streak</b>: play it, and the streak grows. Miss a day and it goes back to zero. ' +
            'That is the whole game behind the games.',
      cta: 'Play Sportegories',
      href: '/arcade/sportegories/' }
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
     .lb on most, #lb on Common Ground, and the collapsed .rtglb-open pill where
     the panel itself is behind a tap. First match wins. */
  var BOARD = {
    sel: '.lb, #lb, .rtglb-open',
    title: 'Where you finished',
    html: 'Today’s leaderboard. Everyone is playing the same puzzle, so it is a fair fight.'
  };


  window.RTGTourData = { HUB: HUB };
})();
