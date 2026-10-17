/* Shut The Door design mockups: the sample content. MOCKUP DATA, never loaded by the game.

   Every fact is from the real Yamamoto pack (data/packs/std-2025-ws7-yamamoto.json) or from the
   real engine run on it:
     the spot, the arsenal, the batters' lines and zones, Varsho's heat map    the pack
     the outing (door shut, 12 pitches, score 764, 75th percentile, pitched like Corey Knebel)
                                                                              engine.js, practice seed 115
     the coach's lesson (Varsho 0-2, nobody on, nobody out, up one: splitter middle 87.5%
       against cutter up and away 93.2%, pro example Chapman to Pence)          grade.js + lesson.js
   Two things are SAMPLE and labelled so on the pages: the game state shown at the mound (Varsho
   up, 0-1) and the curveball drawn in the pitch frames. Daily #1 is the schedule's epoch day. */
(function () {
  'use strict';
  window.STD_SAMPLE = {
    daily: { number: 1, day: 'mon oct 26', dayLong: 'Monday, October 26' },
    title: 'Game 7, 2025 World Series',
    setup: 'game 7, 2025 world series. bottom of the 11th. the dodgers lead 5-4. nobody out, nobody on. Vladimir Guerrero Jr. is up. three outs and the door is shut. two runs and it is over.',
    situation: { inning: 11, half: 'bottom', outs: 0, bases: 0, us: 5, them: 4, usAbbr: 'LAD', themAbbr: 'TOR', walkOffLive: true },
    pitcher: {
      name: 'Yoshinobu Yamamoto', first: 'Yoshinobu', last: 'Yamamoto', team: 'Los Angeles Dodgers', year: 2025, throws: 'R', color: '#005a9c',
      arsenal: [
        { type: 'FS', name: 'splitter', usage: 0.291, velo: 91.7, pfxX: -11, pfxZ: 0.9, shape: 'split' },
        { type: 'FF', name: 'four-seam', usage: 0.2852, velo: 96.2, pfxX: -7.2, pfxZ: 16.2, shape: 'ride' },
        { type: 'CU', name: 'curveball', usage: 0.2285, velo: 77.9, pfxX: 12.9, pfxZ: -16.1, shape: 'drop' },
        { type: 'FC', name: 'cutter', usage: 0.1231, velo: 91.5, pfxX: 4.6, pfxZ: 6.6, shape: 'cut' },
        { type: 'SI', name: 'sinker', usage: 0.0722, velo: 95.3, pfxX: -14, pfxZ: 13.1, shape: 'run' },
      ],
    },
    dueUp: [
      { name: 'Vladimir Guerrero Jr.', short: 'Guerrero Jr.', bats: 'R', line: '.292/.381/.467, 23 HR' },
      { name: 'Isiah Kiner-Falefa', short: 'Kiner-Falefa', bats: 'R', line: '.262/.297/.334, 2 HR' },
      { name: 'Addison Barger', short: 'Barger', bats: 'L', line: '.243/.301/.454, 21 HR' },
    ],
    batter: {
      name: 'Daulton Varsho', short: 'Varsho', bats: 'L', line: '.238/.284/.548, 20 HR', szTop: 3.29, szBot: 1.5,
      heat: [0.299, 0.308, 0.253, 0.2, 0.176, 0.377, 0.396, 0.305, 0.209, 0.22, 0.296, 0.431, 0.412, 0.345, 0.25, 0.202, 0.484, 0.428, 0.4, 0.251, 0.192, 0.205, 0.433, 0.398, 0.3],
      note: 'chases splitters in the dirt 64% with two strikes',
    },
    // SAMPLE: the state the mound mockup shows
    moundState: { count: { b: 0, s: 1 }, outs: 0, bases: 0, pitchNo: 8, selected: 'CU', cell: 21 },
    outing: {
      outcome: 'door_shut', pitches: 12, score: 764, percentile: 75, vsReal: 'matched', runs: 0,
      strip: ['green', 'yellow', 'green', 'yellow', 'green', 'yellow', 'green', 'orange', 'green', 'red', 'green', 'red'],
      pitchedLike: { name: 'Corey Knebel', reason: 'breaking balls on 33% of your pitches in even counts. he throws 35%.' },
      reveal: { outcome: 'door_shut', pitches: 14, runs: 0, summary: 'Guerrero doubled, Kiner-Falefa bunted, walked Barger, then Kirk grounded into a double play' },
    },
    lesson: {
      batter: 'Daulton Varsho', count: { b: 0, s: 2 }, outs: 0, bases: 0,
      call: { type: 'FS', name: 'splitter', cell: 12, where: 'middle' },
      best: { type: 'FC', name: 'cutter', cell: 1, where: 'up and away, out of the zone' },
      principle: 'avoid_his_damage', headline: 'stay out of his damage.',
      why: [
        'middle is where Varsho hits: .412 xwoba on contact.',
        'your splitter there gives up a hit 12% of the time. the cutter up and away, out of the zone: 1%.',
        'your call held 87.5%. the best held 93.2%.',
      ],
      nextTime: 'next time ahead 0-2, keep it up and away, out of the zone.',
      numbers: { lostPts: 5.7, callValue: 87.5, bestValue: 93.2 },
      pro: { pitcher: 'Aroldis Chapman', batter: 'Hunter Pence', bats: 'R', date: '2016-10-10', game: 'division series at sf', count: { b: 2, s: 2 }, outs: 0, bases: 3, type: 'FF', name: 'four-seam', cell: 3, where: 'up and away', result: 'swinging strike three' },
    },
  };
})();
