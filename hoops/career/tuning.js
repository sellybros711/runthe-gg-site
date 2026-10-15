// ─── tuning: every balance number, in one place ─────────────────────────────

/* THE NUMBERS A DESIGNER TURNS. Each one is read where its rule lives (the
   comment says which part), and each was measured, not picked: change one and
   run sim-career.mjs and check-career.mjs, whose bands are the owner's calls.
   Never move a band to meet a number; move the number to meet the band. */

// ── awards and the Hall (season, story) ──

/* A STORY CAREER IS TUNED TO NARRATIVE.md section 10, measured by
   sim-career.mjs over a thousand careers. The traits, arcs and the build all
   lean a career upward, so the bar is set where the whole of it lands in the
   bands. star is the All-Star cut, which went 5 to 4 on 2026-10-15; the
   owner's band is 20 to 25% of careers, free and Pro counted equally (22.4%
   in check-career, 22.6% in sim-career). */
const BAL = { star: 4, dec: 1.4, poTax: 3.5, maxAge: 38, tired: 31 };
/* First ballot is 85, the score VERDICTS and the cr-ballot badge already call
   First ballot. At 95 a career between them read "First ballot" on its Hall
   card and "Hall of Famer, in time" as its ending, and first ballot ran 4.7%
   of sim-career's thousand against a band of 5 to 10. At 85 it is 6.6%. */
const HOF_AT = [85, 60, 44];
const GOAT_AT = 158;

// ── growth, decline and the summer (season, events) ──

/* How a year changes the body. Growth closes a share of the gap to potential,
   most of it at nineteen and none of it by twenty-eight. Decline starts at
   twenty-nine in the legs and reaches the jumper last. */
const GROW = { 19: 0.24, 20: 0.22, 21: 0.2, 22: 0.18, 23: 0.15, 24: 0.11, 25: 0.08, 26: 0.05, 27: 0.02 };
const DECLINE = { 29: 0.9, 30: 1.5, 31: 2.1, 32: 2.7, 33: 3.3, 34: 3.9, 35: 4.5, 36: 5.1, 37: 5.7 };
/* No summer moves a man more than this many points (see developStory). */
const SUMMER_CAP = 9;

// ── difficulty (life) ──

/* DIFFICULTY (Phase E). Normal is every career before this, to the bit: each
   term is a multiply by one or an add of nought. Easy and Hard move how fast
   a player grows, how fast he declines, how often he is hurt and what he is
   worth to a team, and are measured by sim-career.mjs against Normal. An Easy
   career is for the story: it is not filed to the Career board and earns no
   badges (career-ui.js). */
const DIFFS = {
  easy: { name: 'Easy', blurb: 'More growth, fewer injuries. For the story. Not on the board.', grow: 1.3, dec: 0.8, inj: 0.65, edge: 1 },
  normal: { name: 'Normal', blurb: 'The game as it is balanced.', grow: 1, dec: 1, inj: 1, edge: 0 },
  hard: { name: 'Hard', blurb: 'Slower growth, harder knocks. Every ring is earned.', grow: 0.85, dec: 1.15, inj: 1.25, edge: -0.6 },
};
const DIFF_KEYS = Object.keys(DIFFS);

// ── minutes and the rotation (season) ──

/* A TEAMMATE CLEARLY BETTER THAN YOU PLAYS MORE THAN YOU. Reported by a
   player: an 85 was first in the rotation at 35.9 minutes over a 95 point
   guard, because trust, a coach's promotions and the cards each add minutes
   on top of the rank and nothing held them under the men ranked above. Trust
   can carry you past a man a point or two better; it cannot carry you past a
   star. CLEAR_GAP is on the model's scale (about three on the one shown). */
const CLEAR_GAP = 2;
/* A two-way player's NBA minutes: the rest of his nights are in the G League. */
const TW_MIN = 7;

// ── the league around you: aging, ceilings, retirement, the lottery (league) ──

/* THE NBA AGE CURVE. Players improve into their mid twenties, peak from 27
   to 29, hold about a season past that, and decline from 30, faster every
   year after 33 (the aging studies on box plus-minus and win shares all land
   there: the peak is 27 and the plateau runs to 29 or 30). LG_GROW is the
   share of the gap to his ceiling a man closes in a year; LG_DECLINE is what
   a season costs once he is past it, in overall points. */
const LG_GROW = { 19: 0.26, 20: 0.26, 21: 0.25, 22: 0.24, 23: 0.22, 24: 0.2, 25: 0.18, 26: 0.16, 27: 0.12, 28: 0.07, 29: 0.03 };
const LG_DECLINE = { 29: 0, 30: 0.4, 31: 0.9, 32: 1.5, 33: 2.1, 34: 2.7, 35: 3.2, 36: 3.7, 37: 4.1 };
/* POTENTIAL. What a man of this age and this rating usually becomes: the
   younger he is the more room he has, and a player who is already good for
   his age grows more than one who is not (the stars at 21 are the stars at
   27). Each career draws its own version of every ceiling, so the same
   twenty-year-old becomes an All-NBA player in one career and a starter in
   the next. LG_ROOM is the mean room left at each age, LG_PEER the overall a
   typical rotation player has at that age, both on the model's scale. */
const LG_ROOM = { 18: 15, 19: 14, 20: 12.5, 21: 11, 22: 9.5, 23: 8, 24: 6.5, 25: 4.5, 26: 3, 27: 1.5 };
const LG_PEER = { 18: 62, 19: 63, 20: 64, 21: 65, 22: 66.5, 23: 68, 24: 69, 25: 70, 26: 71, 27: 71.5 };
const LG_SPREAD = { 18: 4.5, 19: 4.2, 20: 3.8, 21: 3.4, 22: 3, 23: 2.6, 24: 2.1, 25: 1.6, 26: 1.2, 27: 0.8 };
/* The chance a league man of this age retires in a summer (younger: almost
   never; older than the table: 0.85). */
const LG_RETIRE = { 31: 0.01, 32: 0.02, 33: 0.04, 34: 0.07, 35: 0.11, 36: 0.17, 37: 0.25, 38: 0.35, 39: 0.47, 40: 0.6 };
/* The draft lottery's weights, worst record first, as the NBA's (per 1,000). */
const LOTTO = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];

// ── the road from high school (amateur) ──

/* How many seasons before the data's newest one a high school career starts:
   sophomore, junior, senior and a college freshman year, then the draft. */
const ROAD_LEAD = 4;
/* A sophomore's ratings sit around this, and his ceiling is drawn from this
   range, skewed low by the exponent. Fitted so the road arrives at draft night
   where the backgrounds do. See check-career section 8. */
const ROAD_BASE = 38;
const ROAD_POT = [66, 95, 1.6];

// ── how often things happen: moments, the legend layer, the narrator (season, story, story-engine) ──

/* The share of a season's stretches that end on a playable moment. */
const MOMENT_P = 0.16;
/* How far a duel's shot moves the night: a make adds this to the club's
   odds of winning and a miss takes it away (see duelGame). */
const DUEL_SWING = 0.3;
/* How often the legend layer comes up, tuned so about a third of careers meet
   it at least once (NARRATIVE.md section 10). A legend card can only be dealt
   in a year the gate is open, seeded off the career and the year, so the
   layer arrives as a rare season rather than as a slow drip. */
/* 1.4 since the September, April and summer cards: thirty five more cards in
   the same slots took the share from 34% to 30%, and this puts it back. */
const LEGEND_W = 1.4;
const LEGEND_P = 0.09;
/* A narrator line comes back no sooner than this many seasons later. */
const NARR_GAP = 3;
/* extra.touch is the playable moment's release, from -1 to 1 (see
   hoops/court.js). It moves a shot's odds by at most TOUCH and nothing else,
   and the shot is still the engine's own seeded draw. A career played with the
   scenes off passes no touch, which is a touch of nought: the odds the card
   always had. */
const TOUCH = 0.12, TOUCH_DUEL = 0.2;
