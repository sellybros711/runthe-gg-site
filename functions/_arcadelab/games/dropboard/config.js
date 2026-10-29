/* Drop Board: every feel-tuning number in ONE place.
 * Units are board units: 100 wide, 150 tall, y grows downward.
 * Time is fixed-step frames of 1/60 s with SUB sub-steps each.
 *
 * HOW MUCH SKILL, measured by build/tune-drop.mjs over 120 boards: a drop
 * aimed at a slot lands in it 38% of the time, one off 28%, two off 18%,
 * further 16%. On a board whose values climb steeply, aiming at the best
 * slot earns 48% of the best possible total against 26% for always dropping
 * in the middle and 26% at random. So reading the board pays, and nothing
 * is certain. A run is about 22 seconds of falling. */
export const CONFIG = Object.freeze({
  GAME_ID: 'drop-board',
  DT: 1 / 60,
  SUB: 6,
  DROPS: 5,
  SLOTS: 7,
  WIDTH: 100, HEIGHT: 150,
  DROP_Y: 6,
  DROP_MIN: 4, DROP_MAX: 96,    // where a drop may start

  GRAVITY: 230,
  PUCK_R: 3.1,
  PEG_R: 1.5,
  PEG_ROWS: 11, PEG_TOP: 20, PEG_DY: 10.4, PEG_DX: 13.2,
  PEG_E: 0.42,                  // restitution off a peg
  PEG_KEEP: 0.94,               // share of the sliding speed kept off a peg
  WALL_E: 0.5,
  BUMPER_E: 1.35,               // the bumper peg kicks harder
  BUMPER_MIN: 70,               // and never sends the puck off slower than this
  DIVIDER_TOP: 134,             // slot dividers stand from here to the floor, clear of the last row so nothing wedges
  DIVIDER_R: 0.8,
  SLOT_Y: 142,                  // a puck past this is in its slot
  MAX_SPEED: 260,
  DROP_JITTER: 0.6,             // seeded sideways nudge at release, board units/s

  /* A puck that stalls is nudged, deterministically, so it never freezes. */
  STALL_SPEED: 6,
  STALL_FRAMES: 90,             // 1.5 seconds
  NUDGE: 40,

  SETTLE_FRAMES: 50,
  GEM_SHARE_BANDS: Object.freeze([{ at: 0, bonus: 0 }, { at: 0.35, bonus: 3 }, { at: 0.6, bonus: 6 }, { at: 0.85, bonus: 10 }]),
  MAX_FRAMES: 60 * 60 * 20
});
