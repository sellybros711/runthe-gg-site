/* Stumpire: every tunable number in ONE place.
 *
 * Nothing else in the engine, the API or the client may restate one of these.
 * The client never reads this file at all: every rule it shows (the clock,
 * the called count, the tiers) comes back from the server in a response.
 */

export const CONFIG = Object.freeze({
  /* The game. */
  AT_BATS: 5,
  OUTS_TO_END: 3,
  STRIKES_TO_OUT: 3,
  MAX_BASES: 4,                 // a home run
  CLOCK_MS: 30000,              // every device, every at-bat
  CLOCK_TOLERANCE_MS: 2000,     // network slack before an answer counts as late
  ARGUABLE_CAP: 1,              // benefit of the doubt caps the hit at a single

  /* The slate turns over at midnight in this zone. */
  TIME_ZONE: 'America/New_York',
  /* Slate #1 is this Eastern date. Used only for the number on the share line. */
  EPOCH: '2026-10-01',

  /* Hit bands by DEPTH: the share of a prompt's expected answers held by
     answers more popular than this one. Upper bounds, inclusive. */
  BANDS: Object.freeze([
    { tier: 1, upTo: 0.75 },
    { tier: 2, upTo: 0.90 },
    { tier: 3, upTo: 0.97 },
    { tier: 4, upTo: 1.00 }
  ]),

  /* Blended expected share = (k * prior + observed) / (k + n). */
  BLEND_K: 200,

  /* Called list size by at-bat (index 0 is at-bat 1). */
  CALLED_BY_AT_BAT: Object.freeze([3, 4, 5, 6, 7]),
  /* A called list holding less than LOW or more than HIGH of the expected
     share is flagged for the editor. */
  CALLED_COVERAGE_LOW: 0.35,
  CALLED_COVERAGE_HIGH: 0.65,

  /* The authoring ramp: how many valid answers each at-bat's prompt may have. */
  RAMP: Object.freeze([
    { min: 100, max: Infinity },
    { min: 80, max: 150 },
    { min: 60, max: 100 },
    { min: 50, max: 80 },
    { min: 40, max: 60 }
  ]),
  ATHLETE_MIN_VALID: 40,
  ATHLETE_MIN_HOMERS: 5,
  TEAM_MIN_VALID: 12,
  TEAM_MIN_HOMERS: 1,
  TEAM_MAX_PER_SLATE: 1,
  LEAGUES: Object.freeze(['NFL', 'NBA', 'MLB']),
  LEAGUE_MAX_PER_SLATE: 2,

  /* The matcher. A fuzzy candidate needs this similarity (0 to 1) to count,
     and any second candidate within PICKER_GAP of the best one sends the
     player to the picker instead of guessing. */
  FUZZY_MIN: 0.84,
  PICKER_GAP: 0.04,
  PICKER_MAX: 6,
  TYPEAHEAD_MAX: 12,
  TYPEAHEAD_MIN_CHARS: 2,
  RAW_INPUT_MAX: 60,

  /* The launch target for the Sportegories replay. */
  RESOLUTION_TARGET: 0.99,

  /* Which dataset fields can be trusted, and from which season on. A prompt
     may only filter on a field that is complete for every year it covers.
     null means never complete enough to author against. Editor maintained:
     tighten a row the day a hole is found, never loosen one to publish. */
  FIELD_COVERAGE: Object.freeze({
    sport:  { from: 1900 },
    team:   { from: 1920 },
    pos:    { from: 1950 },
    decade: { from: 1900 },
    award:  { from: 1956 },
    stat:   null,               // career stats ride on notable players only, so a filter on them would reject real answers
    draft1: { from: 1967 },
    act:    { from: 2024 },
    teams:  { from: 1920 },
    col:    null,
    titles: { from: 1900 },
    conf:   { from: 1900 },
    division: { from: 1900 },
    founded: { from: 1900 }
  }),

  /* Per award, where the field-wide row above is too generous. An award
     listed here overrides `award`. MLB All-Star is missing for 106 of the 266
     MVPs, Cy Young winners and Hall of Famers since 1940 (Jeter, A-Rod, Judge),
     so a prompt on it would strike right answers. Measured with
     build/audit-fields.mjs. */
  AWARD_COVERAGE: Object.freeze({
    'MLB All-Star': null
  })
});

/* The tier a depth earns. */
export function tierForDepth(depth) {
  for (const b of CONFIG.BANDS) if (depth <= b.upTo + 1e-12) return b.tier;
  return CONFIG.MAX_BASES;
}
