/* Scoring profiles, and turning a stat line into points.
 *
 * THE BRIEF'S WARNING, RESTATED BECAUSE IT DRIVES THE SHAPE OF THIS FILE:
 * scoring settings change the answer, so every projection is
 * scoring-profile-specific, and you never compute one default projection and
 * adjust it afterwards.
 *
 * That is not a coding-style preference, it is arithmetic. A projection is a
 * DISTRIBUTION, and the distribution of (a*yards + b*catches) is not a
 * function of the distribution of (c*yards + d*catches). Two players can have
 * identical half PPR distributions and different full PPR ones, because the
 * one who catches eight balls for forty yards and the one who catches three
 * for ninety separate the moment a reception is worth a point. Rescaling a
 * finished projection cannot recover that. It has to be scored per draw,
 * inside the simulation, which is why pointsFor() takes a single stat line
 * rather than a summary.
 *
 * fantasy_projections is keyed on (season, week, player, scoring_profile) for
 * the same reason, and has no row that belongs to no profile.
 */

/* ---------------------------------------------------------------------------
 * The profiles
 * ------------------------------------------------------------------------ */

/* Points per unit. Yardage rates are per yard, so 0.1 is the usual "a point
 * every ten yards"; writing it that way rather than as a divisor means the
 * scoring function never divides and never has to think about zero.
 *
 * FUMBLES AND TWO POINT CONVERSIONS ARE IN THE PROFILE AND NOT IN THE MODEL
 * YET. They are scored if a stat line carries them, and nothing in this
 * product currently produces one that does: there is no posted prop market for
 * either. That is deliberate rather than an oversight. A scoring profile
 * describes a league's rules and should be complete; what the projection can
 * actually see is a separate question, and it is answered by which markets
 * exist, not by quietly dropping rules from the rulebook. */
const BASE = {
  passYd: 0.04,
  passTd: 4,
  passInt: -2,
  rushYd: 0.1,
  rushTd: 6,
  recYd: 0.1,
  recTd: 6,
  rec: 0,
  fumbleLost: -2,
  twoPt: 2,
  /* A bonus is a threshold and a payment, applied once when the stat reaches
     it. Empty here; a custom profile fills it. */
  bonuses: [],
  /* TE premium: extra points per reception for a tight end only. Zero in every
     standard profile, and the reason it exists as a field rather than as a
     custom profile is that the brief names it as a thing people get wrong. */
  tePremiumRec: 0,
};

export const PROFILES = {
  standard: { ...BASE, key: 'standard', label: 'Standard', rec: 0 },
  half_ppr: { ...BASE, key: 'half_ppr', label: 'Half PPR', rec: 0.5 },
  ppr: { ...BASE, key: 'ppr', label: 'PPR', rec: 1 },
};

export const PROFILE_KEYS = Object.keys(PROFILES);

export function profile(key) {
  const p = PROFILES[key];
  if (!p) throw new Error(`scoring: unknown profile "${key}". Known: ${PROFILE_KEYS.join(', ')}`);
  return p;
}

/* A custom profile, for a league that is none of the three. Validated rather
 * than merged blindly: an unknown key here is somebody's typo, and a typo in a
 * scoring rule is a whole season of wrong numbers that look right.
 *
 * `position` is carried so the TE premium has something to ask about. */
export function customProfile(key, overrides = {}) {
  const known = new Set(Object.keys(BASE));
  for (const k of Object.keys(overrides)) {
    if (!known.has(k)) {
      throw new Error(`scoring: "${k}" is not a scoring rule. Known: ${[...known].join(', ')}`);
    }
  }
  return { ...BASE, ...overrides, key, label: overrides.label || key };
}

/* ---------------------------------------------------------------------------
 * Scoring one stat line
 * ------------------------------------------------------------------------ */

/* A missing stat is ZERO, and a null stat is also zero, but they are not the
 * same thing anywhere else in this product: a player with no receiving market
 * has no receiving projection, and that gap is handled by there being no row
 * rather than by scoring a zero. By the time a stat line reaches here it is a
 * simulated draw and every field it carries is a real number.
 *
 * So `n()` is a guard against a malformed draw, not a modelling decision. It
 * refuses NaN loudly for the same reason americanToProb refuses 0: a NaN that
 * survives into a sum turns a whole distribution into NaN quantiles, and the
 * screen then shows empty cells that look like missing data rather than a bug. */
const n = (v) => {
  if (v == null) return 0;
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`scoring: stat is not a finite number: ${v}`);
  return x;
};

export function pointsFor(line, prof, position = null) {
  const p = typeof prof === 'string' ? profile(prof) : prof;

  let pts = 0;
  pts += n(line.passYd) * p.passYd;
  pts += n(line.passTd) * p.passTd;
  pts += n(line.passInt) * p.passInt;
  pts += n(line.rushYd) * p.rushYd;
  pts += n(line.rushTd) * p.rushTd;
  pts += n(line.recYd) * p.recYd;
  pts += n(line.recTd) * p.recTd;
  pts += n(line.rec) * p.rec;
  pts += n(line.fumbleLost) * p.fumbleLost;
  pts += n(line.twoPt) * p.twoPt;

  /* TE premium rides on the POSITION passed in, never on anything in the stat
     line. A stat line is a draw and knows nothing about who produced it, and
     threading the position through the draw would be one more thing to get
     wrong per simulation. */
  if (p.tePremiumRec && position === 'TE') pts += n(line.rec) * p.tePremiumRec;

  /* Bonuses are thresholds: reach it and the payment lands once, whole. Not
     scaled, not pro-rated. 100 yards is 100 yards. */
  for (const b of p.bonuses || []) {
    if (n(line[b.stat]) >= b.at) pts += b.points;
  }

  return pts;
}

/* Score one draw under SEVERAL profiles at once.
 *
 * This is the function the simulation actually calls, and it exists to make
 * the rule at the top of this file cheap to obey. Given a draw, scoring it
 * three ways costs three multiplications; re-simulating a player per profile
 * costs three simulations. Without this, "compute one projection and adjust
 * it" stops being a mistake somebody makes out of carelessness and starts
 * being a reasonable-looking performance decision. */
export function pointsForEach(line, profs, position = null) {
  const out = {};
  for (const key of profs) out[key] = pointsFor(line, profile(key), position);
  return out;
}
