/* Whack the Right Player: every feel-tuning number in ONE place.
 * Time is fixed-step frames of 1/60 s. The day's three prompts and their
 * cards come from the published slate (see functions/_arcadelab/content/),
 * never from the dataset at play time, so a result can never move after
 * publish. Everything here is pace, odds and points. */
export const CONFIG = Object.freeze({
  GAME_ID: 'whack',
  DT: 1 / 60,
  ROUNDS: 3,
  ROUND_FRAMES: 20 * 60,         // each round is 20 seconds
  INTRO_FRAMES: 150,             // the prompt alone on screen before a round
  HOLES: 9,                      // a 3x3 grid

  /* Pace, eased from the start of round 1 to the end of round 3. */
  UP_START: 100, UP_END: 52,     // frames a card stays up
  GAP_START: 52, GAP_END: 26,    // frames between spawns
  GAP_JITTER: 0.35,              // share of the gap drawn at random
  RISE: 8,                       // frames a card takes to pop up (it can be hit while rising)
  GRACE: 5,                      // and it still counts this many frames after it starts to drop

  /* How many of the cards are right, per round. */
  CORRECT_SHARE: Object.freeze([0.55, 0.48, 0.40]),
  /* The share of decoys, per round, drawn from a position group that wins
     the prompt (a pitcher for the Cy Young, a QB for the NFL MVP). The rest
     are famous players from elsewhere on the field. Round 1 gives a few
     free reads; round 3 is almost all real questions. */
  PLAUSIBLE_SHARE: Object.freeze([0.4, 0.65, 0.85]),
  PLAUSIBLE_GROUP_MIN: 0.15,     // a position group is plausible when this share of the winners play it

  /* Points. A correct hit is BASE times the combo multiplier. */
  BASE: 10,
  COMBO_STEP: 3,                 // the multiplier rises by one every this many hits in a row
  MULT_MAX: 5,
  STRIKES: 3,                    // across the whole game

  /* Gems by total score. A flawless game scores about 1600; 1000 needs long combos. */
  GEM_BANDS: Object.freeze([{ min: 0, bonus: 0 }, { min: 250, bonus: 3 }, { min: 600, bonus: 6 }, { min: 1000, bonus: 10 }]),

  /* What the validator asks of a prompt before an editor may approve it. */
  MIN_CORRECT: 10,
  MIN_DECOYS: 14,
  MIN_PLAUSIBLE: 5,
  NEAR_MISS: 0.15,               // a decoy within 15% of a numeric threshold is borderline
  FAME_MIN: 2,                   // dataset fame (f, 0..5) a correct card's athlete needs to be fair to ask about
  DECOY_FAME_MIN: 4,             // and a decoy's: tier 3 is mostly college names nobody would know as a pro

  MAX_INPUTS: 400
});
