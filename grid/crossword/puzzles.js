/* RunTheGrid — Daily Crossword puzzle data.
 *
 * In production these rows are emitted by the fill engine (scripts/fill.mjs, the
 * proof-of-concept) fed by the sports data pipeline (see GDD §5-6): a cleaned
 * answer word-list with category + fame metadata, run through template-fill to
 * generate the clue for each entry. The grid below is a real machine-verified
 * fill from that engine — every across and down run is a genuine word — with
 * sports-flavored clues written over the generated answers for the demo.
 *
 * Grid model: `rows` is one string per row, '#' = black square. `entries`
 * carries the numbered clues. The daily size is randomized 5x5 / 7x7 / 8x8
 * (GDD §1); this sample is a 5x5 "mini".
 */
window.RTG_PUZZLES = {
  version: 1,
  daily: {
    id: "2026-07-22",
    date: "2026-07-22",
    size: 5,
    // '#' marks a black square. 3 of the 10 entries are sports terms; the rest
    // are ordinary crossword fill, clued with a sports lean.
    rows: [
      "SIR##",
      "ODES#",
      "DEALS",
      "#SLAP",
      "##MMA",
    ],
    entries: [
      { num: 1, dir: "A", r: 0, c: 0, answer: "SIR",   clue: "Title for a knighted gaffer like Alex Ferguson" },
      { num: 4, dir: "A", r: 1, c: 0, answer: "ODES",  clue: "Poems of praise, as to a champion" },
      { num: 6, dir: "A", r: 2, c: 0, answer: "DEALS", clue: "Deadline-day GM moves" },
      { num: 8, dir: "A", r: 3, c: 1, answer: "SLAP",  clue: "___ shot: a hockey blast from the point" },
      { num: 9, dir: "A", r: 4, c: 2, answer: "MMA",   clue: "The UFC's sport, for short" },
      { num: 1, dir: "D", r: 0, c: 0, answer: "SOD",   clue: "Turf, to a groundskeeper" },
      { num: 2, dir: "D", r: 0, c: 1, answer: "IDES",  clue: "“Beware the ___ of March”" },
      { num: 3, dir: "D", r: 0, c: 2, answer: "REALM", clue: "A dynasty's domain" },
      { num: 5, dir: "D", r: 1, c: 3, answer: "SLAM",  clue: "Grand ___ : a sweep in tennis or golf" },
      { num: 7, dir: "D", r: 2, c: 4, answer: "SPA",   clue: "Where sore athletes recover" },
    ],
  },
};
