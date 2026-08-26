/*
 * rivals.js - the games that were on the calendar before anybody drew a conference.
 *
 * WHY THIS EXISTS. Commish schedules a season by conference and then buys whatever is left
 * from the rest of the league at random, which is a defensible way to fill twelve dates and
 * produces a sport with no history in it. Ohio State played Michigan in one year of five, and
 * when they did it was a Tuesday in September worth the same as anything else.
 *
 * That is not a detail. Realignment is the mode's central lever and rivalries are what it
 * actually costs: the Big 12 lost Bedlam, the Big Ten lost nothing because it took the whole
 * Pac-12, Texas and Texas A&M did not play for twelve years, and Kansas and Missouri did not
 * play for thirteen. A player moving schools around a map with no rivalry on it is moving
 * logos. The point of protecting one is that it costs something to protect.
 *
 * PROTECTED MEANS PLACED FIRST. These games go on the schedule before conference play and
 * before anything is bought, so they survive being in different leagues: the game is played,
 * and it comes out of the pair's non-conference budget, which is the real price. A rivalry
 * that crosses conferences is a game both schools give up something for, every year.
 *
 * REAL RIVALRIES AND REAL NAMES. Every school name here is checked against the team data and
 * every trophy is the one the two schools actually play for. Three different pairs play for a
 * Victory Bell and two of them are named for something else here, on purpose, because a list
 * with the same name on it three times reads as a bug.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_RIVALS. Node: require('./rivals.js').
 */
(function (root) {
  'use strict';

  /* `week` IS WHEN IT WANTS TO BE PLAYED, not when it will be. The scheduler puts it there if
     both sides are free and as near as it can otherwise, which is what a real conference
     office does with a date everybody wants.

     Most of these are the last Saturday and that is the whole shape of the sport's November.
     The exceptions are the ones a fan would notice immediately: the Red River game is played
     in October at the State Fair, Florida and Georgia meet in Jacksonville around Hallowe'en,
     and Army and Navy play alone, in December, after everybody else has finished. */
  var RIVALRIES = [
    /* ---- the ones that end the season ---- */
    { id: 'the-game', a: 'Ohio State', b: 'Michigan', name: 'The Game', week: 12 },
    { id: 'iron-bowl', a: 'Alabama', b: 'Auburn', name: 'the Iron Bowl', week: 12 },
    { id: 'palmetto', a: 'Clemson', b: 'South Carolina', name: 'the Palmetto Bowl', week: 12 },
    { id: 'bunyan', a: 'Michigan State', b: 'Michigan', name: 'the Paul Bunyan Trophy', week: 10 },
    { id: 'axe', a: 'Minnesota', b: 'Wisconsin', name: "Paul Bunyan's Axe", week: 12 },
    { id: 'bucket', a: 'Purdue', b: 'Indiana', name: 'the Old Oaken Bucket', week: 12 },
    { id: 'lincoln', a: 'Illinois', b: 'Northwestern', name: 'the Land of Lincoln Trophy', week: 12 },
    { id: 'heroes', a: 'Nebraska', b: 'Iowa', name: 'the Heroes Trophy', week: 12 },
    { id: 'commonwealth', a: 'Virginia', b: 'Virginia Tech', name: 'the Commonwealth Cup', week: 12 },
    { id: 'brawl', a: 'Pittsburgh', b: 'West Virginia', name: 'the Backyard Brawl', week: 12 },
    { id: 'hate', a: 'Georgia', b: 'Georgia Tech', name: 'Clean, Old Fashioned Hate', week: 12 },
    { id: 'apple-cup', a: 'Washington', b: 'Washington State', name: 'the Apple Cup', week: 12 },
    { id: 'big-game', a: 'California', b: 'Stanford', name: 'the Big Game', week: 12 },
    { id: 'victory-bell', a: 'UCLA', b: 'USC', name: 'the Victory Bell', week: 12 },
    { id: 'platypus', a: 'Oregon', b: 'Oregon State', name: 'the Platypus Trophy', week: 12 },
    { id: 'sunflower', a: 'Kansas', b: 'Kansas State', name: 'the Sunflower Showdown', week: 12 },
    { id: 'egg-bowl', a: 'Ole Miss', b: 'Mississippi State', name: 'the Egg Bowl', week: 12 },
    { id: 'tobacco-road', a: 'North Carolina', b: 'Duke', name: 'the Tobacco Road rivalry', week: 12 },
    { id: 'floridas', a: 'Florida', b: 'Florida State', name: 'the Florida State game', week: 12 },
    { id: 'rocky-mountain', a: 'Colorado', b: 'Colorado State', name: 'the Rocky Mountain Showdown', week: 2 },

    /* ---- the ones realignment broke, which is the whole argument ---- */
    { id: 'bedlam', a: 'Oklahoma', b: 'Oklahoma State', name: 'Bedlam', week: 11 },
    { id: 'lone-star', a: 'Texas', b: 'Texas A&M', name: 'the Lone Star Showdown', week: 12 },
    { id: 'border-war', a: 'Kansas', b: 'Missouri', name: 'the Border War', week: 3 },
    { id: 'holy-war', a: 'Utah', b: 'BYU', name: 'the Holy War', week: 6 },
    { id: 'cy-hawk', a: 'Iowa', b: 'Iowa State', name: 'the Cy-Hawk Trophy', week: 2 },
    { id: 'shillelagh', a: 'Notre Dame', b: 'USC', name: 'the Jeweled Shillelagh', week: 9 },

    /* ---- the ones with their own date ---- */
    { id: 'red-river', a: 'Texas', b: 'Oklahoma', name: 'the Red River Rivalry', week: 6,
      neutral: true },
    { id: 'cocktail-party', a: 'Florida', b: 'Georgia', name: 'the Florida Georgia game', week: 9,
      neutral: true },
    /* THEY PLAY ALONE, IN DECEMBER, and everybody watches. Week fourteen is past the end of
       everybody else's regular season, which is the point of it. */
    { id: 'army-navy', a: 'Army', b: 'Navy', name: 'the Army Navy Game', week: 14,
      neutral: true },

    /* ---- and the ones outside the power four, which now have teams on the field ---- */
    { id: 'milk-can', a: 'Boise State', b: 'Fresno State', name: 'the Milk Can', week: 11 },
    { id: 'fremont', a: 'Nevada', b: 'UNLV', name: 'the Fremont Cannon', week: 12 },
    { id: 'i-75', a: 'Toledo', b: 'Bowling Green', name: 'the Battle of I-75', week: 11 },
    { id: 'i-4', a: 'South Florida', b: 'UCF', name: 'the War on I-4', week: 12 },
    { id: 'bayou-bucket', a: 'Houston', b: 'Rice', name: 'the Bayou Bucket', week: 2 },
    { id: 'iron-skillet', a: 'SMU', b: 'TCU', name: 'the Iron Skillet', week: 3 },
    { id: 'victory-bell-oh', a: 'Cincinnati', b: 'Miami (OH)', name: 'the Battle for the Bell',
      week: 2 },
  ];

  var BY_ID = {};
  RIVALRIES.forEach(function (r) { BY_ID[r.id] = r; });

  /* WHICH OF THESE CAN ACTUALLY BE PLAYED THIS YEAR. A school that is not in the league does
     not have a rivalry, and the mode can be handed a league that does not contain one: a term
     opened in an earlier season, or a fallback team file with seventy schools in it. */
  function playable(inLeague) {
    return RIVALRIES.filter(function (r) {
      return inLeague[r.a] && inLeague[r.b];
    });
  }

  /* AND WHETHER THE TWO OF THEM STILL SHARE A LEAGUE, which is the thing a ruling can break
     and the reason this file is interesting rather than decorative. The game is played either
     way; what changes is whether it costs them a non-conference date. */
  function split(rivalry, membership) {
    var m = membership || {};
    return !!(m[rivalry.a] && m[rivalry.b] && m[rivalry.a] !== m[rivalry.b]);
  }

  var api = {
    RIVALRIES: RIVALRIES, BY_ID: BY_ID,
    playable: playable, split: split,
  };
  root.PS_CFB_RIVALS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
