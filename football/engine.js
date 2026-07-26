/* The Perfect Season, game engine.
 *
 * Headless and dependency-free. Browser: window.PS_ENGINE. Node:
 * require('./engine.js'). Validated by simulator.js; nothing here touches the
 * DOM, so the harness can run millions of games before any UI exists.
 *
 * The seeded RNG is intentionally a COPY of the mulberry32 used by
 * /gameLogic.js rather than an import. gameLogic.js is loaded live by
 * RunThePitch (/soccer/) and is not a shared library; generalizing it for a
 * second game would ship into a running one. A few duplicated lines are the
 * correct trade.
 */

'use strict';

// ─── tuning constants ────────────────────────────────────────────────────────

/*
 * SCALE converts an opponent's real points into roster-fantasy-point space and
 * is the primary difficulty dial. Solve it with simulator.js; do not guess.
 *
 * The GDD called SCALE and league_avg_pts_allowed "the two dials". They are not
 * independent: in the per-game formula one multiplies your score and the other
 * divides the opponent's, so they are a single degree of freedom. League average
 * points allowed is therefore treated as a measured per-season constant (see
 * data/league_context.json) rather than a knob.
 */
const CONSTANTS = {
  /*
   * Solved against REAL PLAY POLICIES through the actual wheel
   * (`node football/simulator.js --policies`), not against synthetic rosters.
   *
   * That distinction is the whole reason this needs re-solving. The archetypes in
   * §9 build rosters out of the entire 9,411-player pool, which stopped describing
   * the game once a spin started offering a whole team to choose from.
   *
   * THE CAP MOVED FROM $100M TO $140M, and SCALE from 1.90 to 2.50 with it.
   *
   * At $100M a single $40M player ate a tier off everyone else, so a roster was
   * one star and five bodies. $140M buys two, measured: careless play now lands
   * 2.0 players at or above the $27.4M p90 price, against 1.2 before.
   *
   * The cap could NOT be raised on its own. Measured at $140M with the old
   * structure model, the gap between tapping the top row and perfect play fell
   * from 3 wins and 46 points of playoff odds to 1 win and 1 point: once
   * everything is affordable there is nothing to decide. What restores it is
   * STRUCTURE.IDEAL_FLOOR_SHARE, so the extra money has to buy a whole offense
   * rather than stars and empty jerseys. See the note there.
   *
   * At $140M and SCALE 2.65, measured over 150 runs per policy:
   *
   *   policy                 spend  FPPG shape  record  playoffs title  20-0
   *   cheapest every time     $42M    22  0.51    0-17       0%     0%    0%
   *   best points per dollar  $61M    44  0.92    5-12       1%     0%    0%
   *   random tap              $81M    51  0.73    4-13       5%     0%    0%
   *   taps the top row       $136M    79  0.86    12-5      54%     7%  0.3%
   *   perfect play (DP)      $137M    84  1.02    14-3      89%    16%  0.9%
   *
   * Two wins and 35 points of playoff odds between careless and perfect, which is
   * the room skill had at the old cap. USE 150 RUNS, not 40, to judge any of this:
   * the spread across drawn team-sets is wide enough that two 40-run samples of the
   * same settings disagreed by 18 points of playoff odds, which is how a bad
   * calibration gets locked in.
   *
   * Two things worth reading twice. Random tapping fell from 10-7 to 4-13, because
   * random picks build broken offenses and the model finally says so. And perfect
   * play buys FEWER expensive players than careless play (1.4 against 2.1 at or
   * above the p90 price), because the balanced roster is the better one. That is
   * the decision the bigger budget was supposed to create.
   *
   * This deliberately does not chase §9's 3-6% perfect-season target. The owner
   * played it there and found it too easy; 20-0 reads better as near-mythical with
   * the title as the reachable goal.
   *
   * Re-solve before trusting any change to pricing, the cap, chemistry, or the
   * structure model. All four move these numbers.
   */
  SCALE: 2.65,
  CAP_MUSD: 140,
  /*
   * Re-spins are two separate levers now, one per wheel, and they get dearer as
   * you lean on them: $5M, then $10M, then $15M, whichever wheel you spin.
   *
   * It used to be one flat $15M for the whole team-season, twice. At that price
   * the first re-spin already cost a tier of player, so nobody touched it and the
   * ladder never came into play. Starting at $5M makes the first one an easy call
   * and the third one something you have to want, and the ceiling is unchanged at
   * $30M if you take all three.
   */
  RESPIN_LADDER_MUSD: [5, 10, 15],
  MAX_RESPINS: 3,
  MIN_RESERVE_PER_SLOT_MUSD: 3,
  REGULAR_SEASON_GAMES: 17,

  /*
   * You always play all 17 regular-season games. An earlier build ended the run
   * on your second loss, which meant most players never saw a final record and
   * never reached the playoffs at all. Going undefeated is still the goal, but a
   * season you finish gives you a number to compare and a reason to keep going
   * after one bad week.
   *
   * Where you finish decides what happens next, on wins alone. No tiebreakers,
   * no standings to read:
   *
   *   15 wins or more   top seed, first round off, 3 games to the title
   *   12 to 14 wins     wild card, 4 games to the title
   *   11 wins or fewer  season over
   *
   * In the playoffs one loss ends it, the way real football works. So a perfect
   * run is 17-0 plus 3 wins, which is 20-0.
   *
   * The thresholds are set from the measured win distribution (`--record`), not
   * from NFL precedent. Every player in the pool is an all-time season, so win
   * totals run high: at the realistic 10-win cutoff even a random roster reached
   * the playoffs 59% of the time and a good one got the bye 94% of the time,
   * which made both tiers meaningless. At 12 and 15 the ladder actually
   * separates: a random roster makes the playoffs 32% of the time and a
   * cap-optimal one earns the bye 78% of the time. Both are still records a real
   * team would post.
   */
  BYE_SEED_WINS: 15,
  PLAYOFF_WINS: 12,
  PLAYOFF_ROUNDS_WITH_BYE: 3,
  PLAYOFF_ROUNDS_WILD_CARD: 4,
};

/**
 * What the NEXT re-spin costs, given how many have already been used.
 *
 * Priced by how many you have taken, not by which wheel you spin, so the choice
 * of wheel stays about what you want to change rather than what is cheaper.
 */
function respinCost(used) {
  const L = CONSTANTS.RESPIN_LADDER_MUSD;
  return L[Math.min(used, L.length - 1)];
}

/** Everything `used` re-spins have taken out of the cap so far. */
function respinFees(used) {
  let total = 0;
  for (let i = 0; i < used; i++) total += respinCost(i);
  return total;
}

/* ─── how a final score got that way ────────────────────────────────────────── */

/*
 * A broadcast needs a story, but the result is already decided: resolveGame settles
 * who won and toFootballScore turns that into a real-looking scoreline. So the job
 * here is the reverse of a simulation. Given 24-20, invent a legal and watchable
 * way to arrive at exactly 24-20, and never at 24-21.
 *
 * Increments are the ones football actually produces. 1 is the famous impossible
 * score, so a decomposition may never leave a remainder of 1.
 */
/*
 * Real per-team, per-game rates for each way of scoring, which is what the old model was
 * missing. It had fixed weights and a rule that a decomposition may never leave a remainder
 * of 1, and those two together produced the safety problem: at a remainder of 2 the safety
 * is the ONLY legal kind, and at 4 it is the only legal kind twice in a row. Measured on the
 * shipped build that came to 1.61 safeties a game with 52% of games showing two or more.
 * The real NFL rate is about 0.09 a game, so it was roughly eighteen times too many.
 *
 * Kept as rates rather than weights so a composition can be scored by how likely it actually
 * is. Touchdowns and field goals are per team per game; the extra-point miss rate is about
 * 6% of touchdowns, two-point tries about 4% end up as 8, and a safety is 0.045 per team.
 */
const SCORE_KINDS = [
  { points: 7, kind: 'TOUCHDOWN', lambda: 2.25 },
  { points: 3, kind: 'FIELD GOAL', lambda: 1.70 },
  { points: 6, kind: 'TOUCHDOWN', lambda: 0.14, note: 'missed the kick' },
  { points: 8, kind: 'TOUCHDOWN', lambda: 0.10, note: 'two-point try' },
  { points: 2, kind: 'SAFETY', lambda: 0.045 },
];

/*
 * Every way to reach `total`, with how likely each one is.
 *
 * Counts of each scoring type are treated as independent Poissons at the rates above, so a
 * composition's likelihood is the product of lambda^k / k!. That makes the arithmetic and the
 * realism the same calculation: a safety appears only when the real rate says it should, and
 * two safeties only when the number genuinely cannot be built any other way.
 *
 * Enumeration is cached per total. There are only a few dozen distinct totals, and the naive
 * version cost about 14,000 combinations per call, which is fine for one broadcast and far
 * too slow for a 50,000-game measurement run.
 */
const compositionCache = new Map();

function compositionsFor(total) {
  if (compositionCache.has(total)) return compositionCache.get(total);
  const [K7, K3, K6, K8, K2] = SCORE_KINDS;
  const out = [];
  const logFact = (n) => { let f = 0; for (let i = 2; i <= n; i++) f += Math.log(i); return f; };
  const lw = (k, n) => n * Math.log(k.lambda) - logFact(n);
  for (let n7 = 0; n7 * 7 <= total; n7++) {
    for (let n8 = 0; n7 * 7 + n8 * 8 <= total; n8++) {
      for (let n6 = 0; n7 * 7 + n8 * 8 + n6 * 6 <= total; n6++) {
        for (let n3 = 0; n7 * 7 + n8 * 8 + n6 * 6 + n3 * 3 <= total; n3++) {
          const rest = total - n7 * 7 - n8 * 8 - n6 * 6 - n3 * 3;
          if (rest % 2 !== 0) continue;              // only the safety is worth 2
          const n2 = rest / 2;
          const counts = [[K7, n7], [K3, n3], [K6, n6], [K8, n8], [K2, n2]];
          let ll = 0;
          for (const [k, n] of counts) if (n > 0) ll += lw(k, n);
          out.push({ counts, ll });
        }
      }
    }
  }
  // shift before exponentiating so a long score does not underflow to all zeros
  const best = out.reduce((m, c) => Math.max(m, c.ll), -Infinity);
  for (const c of out) c.w = Math.exp(c.ll - best);
  compositionCache.set(total, out);
  return out;
}

/** Split a final total into the scores that made it up. */
function scoreParts(total, rng) {
  let left = Math.max(0, Math.round(total));
  // 1 cannot be scored. Real score pairs never ask for it; this is the second lock.
  if (left === 1) left = 2;
  if (left === 0) return [];
  const comps = compositionsFor(left);
  if (!comps.length) return [{ points: left, kind: 'TOUCHDOWN' }];

  const sum = comps.reduce((t, c) => t + c.w, 0);
  let r = rng() * sum;
  let pick = comps[comps.length - 1];
  for (const c of comps) { r -= c.w; if (r <= 0) { pick = c; break; } }

  const out = [];
  for (const [kind, n] of pick.counts) {
    for (let i = 0; i < n; i++) out.push({ ...kind });
  }
  return out;
}

/**
 * A quarter-by-quarter scoring script that ends on exactly `you` to `them`.
 *
 * The drama is placed, not simulated. A game decided by a single score puts the
 * winner's last points inside the closing minutes, because that is the game a
 * broadcast would have shown you, and a blowout spreads its scores earlier.
 */
function scoringScript(you, them, rng) {
  const QUARTERS = 4, QUARTER_SECONDS = 15 * 60;
  const mine = scoreParts(you, rng).map((k) => ({ ...k, team: 'you' }));
  const theirs = scoreParts(them, rng).map((k) => ({ ...k, team: 'them' }));
  const all = mine.concat(theirs);

  const margin = Math.abs(you - them);
  const winner = you >= them ? 'you' : 'them';
  // The score that settled a close game belongs at the end of it.
  const clincher = margin > 0 && margin <= 8
    ? all.filter((e) => e.team === winner).pop() : null;

  const rest = all.filter((e) => e !== clincher);
  /*
   * Spread the rest over the four quarters. Slightly back-loaded, because a game
   * with all its points in the first half is not one anybody would sit through.
   */
  const WEIGHT = [0.22, 0.26, 0.24, 0.28];
  const placed = rest.map((e) => {
    let r = rng(), q = 0;
    for (let i = 0; i < QUARTERS; i++) { r -= WEIGHT[i]; if (r <= 0) { q = i; break; } q = i; }
    return { ...e, q, sec: Math.floor(rng() * QUARTER_SECONDS) };
  });
  if (clincher) {
    // Inside the last eight minutes, and never at 0:00, which reads as a typo.
    placed.push({ ...clincher, q: 3, sec: 15 + Math.floor(rng() * (8 * 60 - 15)) });
  }

  // Clock counts down, so later in a quarter means FEWER seconds left.
  placed.sort((a, b) => a.q - b.q || b.sec - a.sec);

  let ry = 0, rt = 0;
  return placed.map((e) => {
    if (e.team === 'you') ry += e.points; else rt += e.points;
    return {
      q: e.q + 1,
      sec: e.sec,
      clock: Math.floor(e.sec / 60) + ':' + String(e.sec % 60).padStart(2, '0'),
      team: e.team, kind: e.kind, note: e.note || null, points: e.points,
      you: ry, them: rt,
    };
  });
}

/** Round names, counting back from the final. */
const PLAYOFF_ROUND_NAMES = ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'];

/** Where a regular-season record leaves you. Wins only, deliberately. */
function seedFromRecord(wins) {
  if (wins >= CONSTANTS.BYE_SEED_WINS) {
    return { made: true, bye: true, rounds: CONSTANTS.PLAYOFF_ROUNDS_WITH_BYE, label: 'Top seed' };
  }
  if (wins >= CONSTANTS.PLAYOFF_WINS) {
    return { made: true, bye: false, rounds: CONSTANTS.PLAYOFF_ROUNDS_WILD_CARD, label: 'Wild card' };
  }
  return { made: false, bye: false, rounds: 0, label: 'Missed the playoffs' };
}

/** Names for a playoff run of `rounds` games, ending at the Super Bowl. */
function playoffRoundNames(rounds) {
  return PLAYOFF_ROUND_NAMES.slice(PLAYOFF_ROUND_NAMES.length - rounds);
}

const CHEMISTRY = {
  VALUES: {
    battery: 0.10,
    teammates: 0.05,
    franchise: 0.03,
    family: 0.03,
    college: 0.02,
    draft_class: 0.02,
    system: 0.02,
    target_conflict: -0.04,
  },
  /*
   * Positive links saturate smoothly toward MAX instead of being summed and
   * clamped:
   *
   *      effective = MAX * (1 - exp(-raw / MAX))
   *
   * The GDD used "links 1-3 at full value, 4+ at half, then clamp to +15%", and
   * credited the half-value rule with preventing franchise-stacking. It cannot:
   * one battery link is 10% and two teammate links are 10% more, so THREE
   * players from a single team-season already exceed the ceiling and the clamp
   * binds before the half-value rule ever applies. Slots 4-6 then carry no
   * chemistry incentive whatsoever, the opposite of the stated intent that
   * chemistry "should tempt you into a cheaper signing".
   *
   * Saturation fixes it without an arbitrary link-count cutoff: each additional
   * link always adds something, always less than the one before, and the total
   * approaches +15% without reaching it. Small rosters are barely affected (a
   * lone 2% college link still scores ~1.9%), while a full six-man stack lands
   * ~14.3%, worth chasing, never free.
   */
  MIN: -0.10,
  MAX: 0.15,
  /* "Same era" was undefined in the GDD; fixed as within this many seasons. */
  TARGET_CONFLICT_ERA_YEARS: 3,
  TARGET_CONFLICT_PERCENTILE: 0.95,
  /*
   * The GDD calls target conflict "the least defensible rule in §6" and flags it
   * for possible removal. It is also conceptually odd here: two WRs from
   * different team-seasons never actually competed for targets. Off by default;
   * flip to true to evaluate it.
   */
  TARGET_CONFLICT_ENABLED: false,
};

/*
 * Team nicknames, so a chemistry line can say "Both played for the Lions" instead
 * of naming a three-letter code. A franchise link joins two different seasons, so
 * neither player's own era-correct team name is right for the pair; the nickname
 * is the part that never changed.
 */
const NICKNAMES = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers',
  CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos',
  DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars',
  KC: 'Chiefs', LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
  MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets',
  PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers',
  TEN: 'Titans', WAS: 'Commanders',
};
const nickname = (id) => NICKNAMES[id] || id;

/*
 * Team colors, primary then secondary, for the franchise picker and the wheel.
 *
 * Hardcoded rather than fetched. nflverse ships a colors table, but a build step
 * and a shipped data file for 64 hex values that never change is the wrong trade,
 * and these are public facts about each club's identity.
 *
 * `on` is the text color that survives on top of the primary: dark for the four
 * clubs whose primary is bright enough that white text on it is unreadable.
 */
const TEAM_COLORS = {
  ARI: ['#97233F', '#000000'], ATL: ['#A71930', '#000000'], BAL: ['#241773', '#9E7C0C'],
  BUF: ['#00338D', '#C60C30'], CAR: ['#0085CA', '#101820'], CHI: ['#0B162A', '#C83803'],
  CIN: ['#FB4F14', '#000000'], CLE: ['#311D00', '#FF3C00'], DAL: ['#003594', '#869397'],
  DEN: ['#FB4F14', '#002244'], DET: ['#0076B6', '#B0B7BC'], GB:  ['#203731', '#FFB612'],
  HOU: ['#03202F', '#A71930'], IND: ['#002C5F', '#A2AAAD'], JAX: ['#006778', '#D7A22A'],
  KC:  ['#E31837', '#FFB81C'], LAC: ['#0080C6', '#FFC20E'], LAR: ['#003594', '#FFA300'],
  LV:  ['#000000', '#A5ACAF'], MIA: ['#008E97', '#FC4C02'], MIN: ['#4F2683', '#FFC62F'],
  NE:  ['#002244', '#C60C30'], NO:  ['#101820', '#D3BC8D'], NYG: ['#0B2265', '#A71930'],
  NYJ: ['#125740', '#000000'], PHI: ['#004C54', '#A5ACAF'], PIT: ['#101820', '#FFB612'],
  SEA: ['#002244', '#69BE28'], SF:  ['#AA0000', '#B3995D'], TB:  ['#D50A0A', '#34302B'],
  TEN: ['#0C2340', '#4B92DB'], WAS: ['#5A1414', '#FFB612'],
};
/*
 * Which text color to put on a primary, computed rather than listed.
 *
 * The first attempt was a hand-written set of "bright" clubs and it was wrong for
 * six of them: San Francisco's #AA0000 got dark text at 2.42:1, and Kansas City
 * and Tampa Bay were misjudged the same way. Picking whichever of white or near
 * black has the higher contrast ratio is always right and needs no maintenance.
 *
 * Worst case after this is the Chargers' #0080C6 at 4.37:1, which no text color
 * can beat: both options land near 4.37. These labels are large and bold, where
 * 3:1 is the bar, so that passes.
 */
function relativeLuminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const l1 = Math.max(relativeLuminance(a), relativeLuminance(b));
  const l2 = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (l1 + 0.05) / (l2 + 0.05);
}
const teamColors = (id) => {
  const c = TEAM_COLORS[id] || ['#334155', '#64748b'];
  const on = contrast(c[0], '#ffffff') >= contrast(c[0], '#0b1220') ? '#ffffff' : '#0b1220';
  return { primary: c[0], secondary: c[1], on };
};

/*
 * CLUB COLORS THAT CAN ACTUALLY BE SEEN ON A DARK FIELD.
 *
 * The field carries a wash of your club's colors, and measured on the rendered page it
 * did not work for most of the league. Sampling the wash for eight clubs:
 *
 *   KC   #E31837 red      rendered #331f3f  violet
 *   CIN  #FB4F14 orange   rendered #372839  magenta
 *   LV, PIT, CHI, NYJ, SEA                  rendered blue, ie no different from bare
 *
 * Two causes. A club color at 30% opacity over a #0f1830 field is mostly field, so a red
 * lifts the red channel a little and the field's blue still dominates: violet. And nine
 * clubs have a primary or secondary darker than the field itself, where a wash can only
 * ever subtract.
 *
 * So the wash gets its own colors, derived from the club's but floored into a range that
 * can show on a dark ground. Hue is never changed, because hue is the identity. Only
 * lightness and saturation move, and a club whose color has no hue at all (the black of
 * the Raiders, the Steelers, the Saints) becomes its own silver rather than an invented
 * hue, which is both honest and what those clubs' second color usually is anyway.
 *
 * teamColors() is untouched: the team picker, the reel dressing and the score bug all use
 * the true colors on their own backgrounds, where they read correctly already.
 */
function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return '#' + rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
/** One club color, floored so it can show as a wash on a dark field. */
function washColor(hex) {
  const { h, s, l } = hexToHsl(hex);
  /* Silver, rather than an invented hue, in two cases: a color with no hue at all, and
     one so dark that its hue is an artifact rather than an identity. Pittsburgh's
     #101820 is the case that forced the second test: it is black to look at, but it
     carries just enough blue that a plain saturation floor turned the Steelers blue. */
  if (s < 0.18 || (l < 0.13 && s < 0.45)) return hslToHex(h, 0.06, 0.62);
  /* Saturation capped as well as floored, and the lightness floor kept modest, or a very
     dark green like the Jets' or the Packers' comes back as neon mint. */
  return hslToHex(h, Math.min(0.86, Math.max(0.52, s)), Math.min(0.64, Math.max(0.46, l)));
}
const washColors = (id) => {
  const c = TEAM_COLORS[id] || ['#334155', '#64748b'];
  return { a: washColor(c[0]), b: washColor(c[1]) };
};

/*
 * How strong a link feels, used to color and weight the lines drawn between
 * players. Four bands rather than a continuous scale, because the whole point is
 * that you can tell them apart at a glance.
 */
const LINK_TIERS = [
  { min: 0.08, key: 'big', label: 'Big' },
  { min: 0.04, key: 'good', label: 'Good' },
  { min: 0.001, key: 'small', label: 'Small' },
  { min: -Infinity, key: 'bad', label: 'Hurts' },
];
const linkTier = (value) => LINK_TIERS.find((t) => value >= t.min).key;

/*
 * ROSTER STRUCTURE
 *
 * Summing six fantasy totals is not a football team. It made elite receivers with
 * a broken quarterback score exactly as well as a balanced offense, so the shape
 * of a roster was invisible and the only thing that mattered was raw points. That
 * is why a thoughtless draft could still win 13 games.
 *
 * Three things now shape the squad score, each measured from the real numbers
 * rather than invented:
 *
 *   1. Quarterback support. Catching points depend on somebody throwing. The
 *      median starting quarterback in this pool throws for 11.9 points a game, so
 *      that is the reference; a weak arm discounts the whole receiving corps and a
 *      great one lifts it. This is the big one, and it means letting the
 *      quarterback slide until the money is gone has a real cost.
 *   2. Balance. Measured across 27 seasons, a real league earns 25% of its
 *      non-passing fantasy points on the ground. A roster far from that is
 *      one-dimensional and easier to defend.
 *   3. Concentration. Leaning on one man is fragile, because defenses key on him.
 *
 * All three multiply the squad score, never individual output, so they cannot
 * cascade through the sim.
 */
const STRUCTURE = {
  QB_BASELINE_PASS_PPG: 11.9,   // median starting QB, measured
  QB_SUPPORT_FLOOR: 0.62,
  QB_SUPPORT_CEIL: 1.18,
  IDEAL_RUSH_SHARE: 0.25,       // measured league average
  RUSH_SHARE_TOLERANCE: 0.12,
  BALANCE_WEIGHT: 1.05,
  IDEAL_TOP_SHARE: 0.24,        // measured median top-man share
  CONCENTRATION_WEIGHT: 0.70,
  /*
   * THE FLOOR TERM, and why the cap could not simply be raised.
   *
   * Raising the cap to $140M does give you two or three genuinely good players,
   * which is what it was asked to do. Measured, it also collapsed the game: the
   * gap between tapping the top row and perfect play went from 3 wins and 46
   * points of playoff odds down to 1 win and 1 point, because once everything is
   * affordable there is nothing left to decide.
   *
   * Concentration does not catch three stars and three minimum-salary bodies,
   * because spreading the points over three men keeps the TOP man's share near
   * ideal. What gives it away is the floor. Across 848 real team-seasons the two
   * weakest of a team's six skill players average 64% of the roster average
   * (median), and even the top decile for top-heaviness sits at 0.50. Stars plus
   * scrubs comes out at about 0.14.
   *
   * So the floor is what a bigger budget has to buy. You can afford the stars
   * now; you still cannot afford to field nobody alongside them.
   */
  IDEAL_FLOOR_SHARE: 0.64,
  FLOOR_TOLERANCE: 0.14,        // p10 of real teams, so no real shape is punished
  FLOOR_WEIGHT: 1.30,
  MIN: 0.50,
  MAX: 1.18,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Read a roster's shape. Returns the multiplier plus the parts that produced it,
 * so the coach breakdown can explain itself instead of showing a bare number.
 */
function rosterStructure(roster) {
  const S = STRUCTURE;
  const sum = (f) => roster.reduce((t, p) => t + (f(p) || 0), 0);
  const total = sum((p) => p.ppr_ppg_mean);
  if (!total) {
    return { multiplier: 1, qbSupport: 1, balance: 1, concentration: 1, rushShare: 0, topShare: 0, qbPass: 0 };
  }

  const qb = roster.find((p) => p.position === 'QB');
  const qbPass = qb ? (qb.pass_ppg || 0) : 0;
  const qbSupport = clamp(
    0.55 + 0.45 * (qbPass / S.QB_BASELINE_PASS_PPG),
    S.QB_SUPPORT_FLOOR, S.QB_SUPPORT_CEIL,
  );

  const rush = sum((p) => p.rush_ppg);
  const rec = sum((p) => p.rec_ppg);
  const ground = rush + rec;
  const rushShare = ground > 0 ? rush / ground : 0;
  const balance = 1 - S.BALANCE_WEIGHT
    * Math.max(0, Math.abs(rushShare - S.IDEAL_RUSH_SHARE) - S.RUSH_SHARE_TOLERANCE);

  const topShare = Math.max(...roster.map((p) => p.ppr_ppg_mean)) / total;
  const concentration = 1 - S.CONCENTRATION_WEIGHT * Math.max(0, topShare - S.IDEAL_TOP_SHARE);

  /*
   * What the two weakest men carry, against the roster average. This is the term
   * that stops a big budget turning into stars and empty jerseys, and it only
   * bites below what real offenses actually do.
   */
  const ppg = roster.map((p) => p.ppr_ppg_mean).sort((x, y) => x - y);
  const avg = total / roster.length;
  const floorShare = roster.length >= 2 && avg > 0 ? ((ppg[0] + ppg[1]) / 2) / avg : 1;
  const floor = 1 - S.FLOOR_WEIGHT
    * Math.max(0, S.IDEAL_FLOOR_SHARE - floorShare - S.FLOOR_TOLERANCE);

  // Quarterback support applies to catching points only, so it is folded in as a
  // change to the effective total rather than a flat multiplier.
  const effective = sum((p) => p.pass_ppg) + rush + rec * qbSupport;
  const multiplier = clamp(
    (effective / total) * balance * concentration * Math.max(0.3, floor),
    S.MIN, S.MAX,
  );

  return { multiplier, qbSupport, balance, concentration, floor, floorShare,
    rushShare, topShare, qbPass, total };
}

/**
 * A coach's read on the roster, in plain words.
 *
 * Every line is tied to a number the player can check on the same screen, so this
 * explains the structure multiplier rather than decorating it.
 */
function coachReport(roster, chemistryMultiplier, spend) {
  const st = rosterStructure(roster);
  const strengths = [];
  const weaknesses = [];
  const total = roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);
  const star = roster.slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
  const qb = roster.find((p) => p.position === 'QB');
  const chem = (chemistryMultiplier - 1) * 100;
  const last = (n) => n.split(' ').slice(-1)[0];

  // Quarterback
  if (st.qbSupport >= 1.06) {
    strengths.push(`${qb ? last(qb.name) : 'Your quarterback'} throws well enough to lift everyone he targets.`);
  } else if (st.qbSupport <= 0.86) {
    weaknesses.push(`${qb ? last(qb.name) : 'Your quarterback'} cannot get the ball to these receivers. It holds the whole passing game back.`);
  } else if (st.qbSupport <= 0.95) {
    weaknesses.push('Your quarterback is ordinary, so your receivers will not see their best numbers.');
  }

  // Balance
  if (st.rushShare < 0.13) {
    weaknesses.push('There is no running game here. Teams can sit back and defend the pass all day.');
  } else if (st.rushShare > 0.45) {
    weaknesses.push('You run it too often to scare anybody deep.');
  } else {
    strengths.push('You can run it and throw it, so defenses have to respect both.');
  }

  // Concentration
  if (st.topShare >= 0.36) {
    weaknesses.push(`Everything runs through ${last(star.name)}. Take him away and this offense stops.`);
  } else if (st.topShare <= 0.26) {
    strengths.push('The scoring is spread around, so no single defender can take you apart.');
  }

  // Chemistry
  if (chem >= 8) strengths.push('These players know each other, and it shows.');
  else if (chem < 1) weaknesses.push('Six strangers. Nobody here has played a down together.');

  // Money
  const unspent = CONSTANTS.CAP_MUSD - spend;
  if (unspent >= 20) weaknesses.push(`You left $${unspent.toFixed(0)}M on the table. That was a better player you did not sign.`);
  else if (unspent <= 3) strengths.push('You used the whole budget.');

  // Boom or bust
  const swing = roster.reduce((t, p) => t + p.ppr_ppg_sd, 0) / Math.max(1, total);
  if (swing > 0.52) weaknesses.push('This group is streaky. Big weeks, and some very quiet ones.');
  else if (swing < 0.38) strengths.push('Steady week to week, which matters when one loss can end you.');

  let verdict;
  if (st.multiplier >= 1.03 && total >= 60) verdict = 'A real contender.';
  else if (st.multiplier >= 0.96 && total >= 50) verdict = 'Good enough to win a lot of games.';
  else if (total >= 40) verdict = 'Middle of the pack. It will need some luck.';
  else verdict = 'This is not a playoff team.';

  return { structure: st, strengths, weaknesses, verdict, totalFppg: total, swing };
}

const SLOTS = ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

// ─── randomness ──────────────────────────────────────────────────────────────

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

function createSeededRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller. */
function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape), Marsaglia-Tsang. */
function gammaShape(k, rng) {
  if (k < 1) return gammaShape(1 + k, rng) * Math.pow(rng(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Gamma sample matched to (mean, sd). Right-skewed and non-negative, which is
 * why the GDD chose it over a normal, scoring cannot go below zero.
 *
 * The GDD also said "floored at 0", which is redundant for a Gamma and hints a
 * normal was once intended. Degenerate inputs are handled explicitly here
 * instead: sd <= 0 returns the mean, and mean <= 0 returns 0, because the
 * shape/scale fit divides by the mean.
 */
function sampleGamma(mean, sd, rng) {
  if (!(mean > 0)) return 0;
  if (!(sd > 0)) return mean;
  const shape = (mean / sd) ** 2;
  const scale = (sd * sd) / mean;
  return gammaShape(shape, rng) * scale;
}

// ─── chemistry ───────────────────────────────────────────────────────────────

const key = (p) => `${p.player_id}|${p.season}`;

/**
 * Every link that exists for one pair, strongest first. Only the strongest is
 * ever used (the GDD's "no stacking within a pair").
 */
function pairLinks(a, b, ctx) {
  const out = [];
  const V = CHEMISTRY.VALUES;

  // Battery, precomputed, and directional (QB -> receiver).
  const bat = ctx.battery || {};
  for (const [qb, rec] of [[a, b], [b, a]]) {
    const list = bat[key(qb)];
    if (list) {
      const hit = list.find((l) => l.receiver === key(rec));
      if (hit) out.push({ type: 'battery', value: V.battery, label: hit.label, short: 'Threw to him' });
    }
  }

  /*
   * Labels are written to be read once and understood, so each one names the
   * thing the two players actually share. An earlier version said "Both wore SF
   * [team code] colors", which named a three letter code, used a British
   * spelling, and told you nothing about what the two players shared.
   * `short` is the two or three word version for tight spaces in the draft list.
   */
  if (a.team_season_id && a.team_season_id === b.team_season_id) {
    out.push({
      type: 'teammates', value: V.teammates,
      label: `Teammates on the ${a.season} ${nickname(a.franchise)}`,
      short: 'Teammates',
    });
  } else if (a.franchise && a.franchise === b.franchise) {
    out.push({
      type: 'franchise', value: V.franchise,
      label: `Both played for the ${nickname(a.franchise)}`,
      short: `Both ${nickname(a.franchise)}`,
    });
  }

  const fam = (ctx.curated?.family || []).find(
    (f) => (f.a === a.name && f.b === b.name) || (f.a === b.name && f.b === a.name),
  );
  if (fam) {
    out.push({
      type: 'family', value: V.family,
      label: fam.kind === 'brothers' ? 'Brothers' : fam.label,
      short: 'Family',
    });
  }

  if (a.college && b.college && a.college === b.college) {
    out.push({
      type: 'college', value: V.college,
      label: `Both went to ${a.college}`,
      short: a.college,
    });
  }
  if (a.draft_year && a.draft_year === b.draft_year) {
    out.push({
      type: 'draft_class', value: V.draft_class,
      label: `Both drafted in ${a.draft_year}`,
      short: `${a.draft_year} draft`,
    });
  }

  const coaches = ctx.coaches || {};
  const ca = coaches[a.team_season_id]?.hc;
  const cb = coaches[b.team_season_id]?.hc;
  if (ca && cb && ca === cb) {
    out.push({
      type: 'system', value: V.system,
      label: `Both coached by ${ca}`,
      short: ca.split(' ').slice(-1)[0] + ' coached both',
    });
  }

  /*
   * Rivalry used to subtract 3% for players from opposing sides of a documented
   * rivalry. Cut: it punished you for something that is not a flaw in the roster,
   * two good players from rival teams are not worse at football together, and it
   * was the one link that made a signing feel arbitrarily bad. The curated list
   * stays in the data in case it is ever wanted for flavor text.
   */

  if (CHEMISTRY.TARGET_CONFLICT_ENABLED
      && a.position === 'WR' && b.position === 'WR'
      && a.position_percentile >= CHEMISTRY.TARGET_CONFLICT_PERCENTILE
      && b.position_percentile >= CHEMISTRY.TARGET_CONFLICT_PERCENTILE
      && Math.abs(a.season - b.season) <= CHEMISTRY.TARGET_CONFLICT_ERA_YEARS) {
    out.push({ type: 'target_conflict', value: V.target_conflict,
      label: 'Two number one receivers competing for the ball', short: 'Both want the ball' });
  }

  out.sort((x, y) => y.value - x.value);
  return out;
}

/**
 * Resolve a 6-man roster into a multiplier.
 *
 * Multiplies the squad score, never individual output, so it cannot cascade
 * through the sim.
 */
function resolveChemistry(roster, ctx) {
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const best = pairLinks(roster[i], roster[j], ctx)[0];
      if (best) links.push({ ...best, a: roster[i].name, b: roster[j].name });
    }
  }
  const positives = links.filter((l) => l.value > 0).sort((a, b) => b.value - a.value);
  const negatives = links.filter((l) => l.value < 0);

  const raw = positives.reduce((s, l) => s + l.value, 0);
  const saturated = CHEMISTRY.MAX * (1 - Math.exp(-raw / CHEMISTRY.MAX));
  // Penalties never diminish and are applied after saturation, so a negative
  // always costs its full face value.
  const penalties = negatives.reduce((s, l) => s + l.value, 0);
  const net = Math.max(CHEMISTRY.MIN, Math.min(CHEMISTRY.MAX, saturated + penalties));

  return {
    multiplier: 1 + net,
    raw,
    saturated,
    net,
    links: positives.concat(negatives),
  };
}

// ─── schedule ────────────────────────────────────────────────────────────────

const CONFERENCES = ['AFC', 'NFC'];
const DIVISION_NAMES = ['East', 'North', 'South', 'West'];

function buildDivisionMap(teamSeasons) {
  const map = {};
  for (const t of teamSeasons) (map[t.division] ??= new Set()).add(t.franchise);
  const out = {};
  for (const [d, s] of Object.entries(map)) out[d] = [...s].sort();
  return out;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/**
 * Opponent franchises for one 17-game season, per the real NFL formula.
 *
 * The GDD's formula includes "2 same-place finishers in your conference's other
 * two divisions". There are no standings in this game, opponents are random
 * historical team-seasons and no league is simulated, so that rule has no
 * referent. Replaced with a random team from each of those two divisions, which
 * preserves the shape (one game against each) without inventing a table.
 */
function opponentFranchises(franchise, divisions, rng) {
  const myDiv = Object.keys(divisions).find((d) => divisions[d].includes(franchise));
  const [myConf] = myDiv.split(' ');
  const otherConf = CONFERENCES.find((c) => c !== myConf);

  const out = [];
  for (const rival of divisions[myDiv].filter((f) => f !== franchise)) out.push(rival, rival);

  const intraDivs = DIVISION_NAMES.map((d) => `${myConf} ${d}`).filter((d) => d !== myDiv);
  const intra = pick(intraDivs, rng);
  out.push(...divisions[intra]);

  const interDivs = DIVISION_NAMES.map((d) => `${otherConf} ${d}`);
  const inter = pick(interDivs, rng);
  out.push(...divisions[inter]);

  for (const d of intraDivs.filter((d) => d !== intra)) out.push(pick(divisions[d], rng));

  const seventeenth = pick(interDivs.filter((d) => d !== inter), rng);
  out.push(pick(divisions[seventeenth], rng));

  return out;
}

/**
 * Put the 17 opponents into a week order that looks like a real season.
 *
 * The formula produces division rivals as adjacent pairs, which used to land them
 * in weeks 1 through 6: three teams, home and away, back to back, then nothing but
 * strangers for eleven weeks. Real schedules spread the six division games out and
 * usually save one or two for the end.
 *
 * Shuffle, then require the two meetings with any repeated opponent to sit at
 * least MIN_REMATCH_GAP weeks apart, and require at least one division game in the
 * closing stretch. Falls back to the least bad ordering if the constraints cannot
 * be met, so a schedule is always produced.
 */
const MIN_REMATCH_GAP = 4;

function orderSchedule(games, rng) {
  const n = games.length;
  const spacing = (arr) => {
    const seen = new Map();
    let worst = Infinity;
    arr.forEach((g, i) => {
      if (seen.has(g.team_season_id)) worst = Math.min(worst, i - seen.get(g.team_season_id));
      seen.set(g.team_season_id, i);
    });
    return worst;
  };
  // Repeated opponents are exactly the division rivals.
  const counts = {};
  for (const g of games) counts[g.team_season_id] = (counts[g.team_season_id] || 0) + 1;
  const isDivision = (g) => counts[g.team_season_id] > 1;

  let best = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = games.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const gap = spacing(a);
    const lateDivision = a.slice(n - 4).some(isDivision);
    const earlyDivisionCount = a.slice(0, 4).filter(isDivision).length;
    const ok = gap >= MIN_REMATCH_GAP && lateDivision && earlyDivisionCount <= 2;
    if (ok) return a;
    const score = Math.min(gap, MIN_REMATCH_GAP) + (lateDivision ? 1 : 0) - earlyDivisionCount * 0.1;
    if (!best || score > best.score) best = { a, score };
  }
  return best.a;
}

/**
 * Attach a random season to each opponent franchise, then normalize.
 *
 * Franchise choice must never be a difficulty lever, so a schedule is rejected
 * unless its total opponent strength sits within TOLERANCE of the league-wide
 * mean and it contains no more than MAX_ELITE very strong opponents.
 *
 * Houston has 24 drawable seasons rather than 27; that is handled implicitly by
 * drawing from whatever seasons exist for the franchise.
 */
function generateSchedule(franchise, data, rng, opts = {}) {
  const tolerance = opts.tolerance ?? 0.05;
  const maxElite = opts.maxElite ?? 4;
  const maxAttempts = opts.maxAttempts ?? 400;

  const { divisions, byFranchise, eliteThreshold, meanScheduleStrength } = data;

  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const franchises = opponentFranchises(franchise, divisions, rng);
    /*
     * One season per franchise, reused for both meetings. A division rival is on
     * the schedule twice (home and away) and you face the SAME team-season both
     * times, you get a home and away game against the 2007 Patriots, not the
     * 2007 and 2001 Patriots. Memoizing by franchise also makes any other
     * repeat consistent for free.
     *
     * Consequence for normalization: a rival's strength counts twice, which is
     * correct, a brutal division rival really is two hard games.
     */
    const drawn = new Map();
    const unordered = franchises.map((f) => {
      if (!drawn.has(f)) {
        const pool = byFranchise[f];
        drawn.set(f, pool[Math.floor(rng() * pool.length)]);
      }
      return drawn.get(f);
    });
    const games = orderSchedule(unordered, rng);
    const total = games.reduce((s, g) => s + g.strength_z, 0);
    const elite = games.filter((g) => g.strength_z >= eliteThreshold).length;
    const drift = Math.abs(total - meanScheduleStrength);
    const ok = drift <= Math.abs(meanScheduleStrength * tolerance) + tolerance * 17 && elite <= maxElite;
    if (ok) return { games, total, elite, attempts: attempt + 1 };
    if (!best || drift < best.drift) best = { games, total, elite, drift, attempts: attempt + 1 };
  }
  // Deterministic fallback: never fail to produce a season.
  return { games: best.games, total: best.total, elite: best.elite, attempts: maxAttempts, relaxed: true };
}

/** Playoff opponents, weighted toward the strongest quartile. */
/*
 * THE TWO NAMED FINALS OPPONENTS.
 *
 * The 2007 Patriots are in the data, and they are the single strongest team-season in it:
 * 36.8 scored and 17.1 allowed a game, strength_z 2.708 against a dataset maximum of 2.71.
 * Nothing needs inventing for them.
 *
 * The 1972 Dolphins are not, because the dataset starts in 1999, so they are carried here as
 * an explicit historical entry. Their season totals are the famous ones: 14-0, 385 points
 * scored and 171 allowed over 14 games, which is 27.50 and 12.21 a game.
 *
 * Two things about that entry are inferred rather than measured, and both are worth stating
 * plainly:
 *
 *   The per-game standard deviations. No game-level 1972 data is available here, so the
 *   ratios come from the 40 elite team-seasons that ARE in the data: a median scored-sd of
 *   0.346 of the mean and allowed-sd of 0.521. Applied to their means, that gives 9.52 and
 *   6.36.
 *
 *   The era adjustment, which is NOT applied. resolveGame divides an opponent's points
 *   allowed by that season's league average, and there is no 1972 league average in
 *   league_context.json, so it falls through to the 21.5 default. 1972 was a lower-scoring
 *   league than that, so their 12.21 allowed was less dominant against their own league than
 *   the default makes it look. The bias therefore runs one way only: it makes them HARDER
 *   than a true era adjustment would. For the team you meet in the Super Bowl of a game
 *   called The Perfect Season, that is the right direction to err, but it is an assumption
 *   and not a measurement.
 */
const LEGEND_IDS = {
  PATRIOTS_2007: 'NE-2007',
  DOLPHINS_1972: 'MIA-1972',
};

const LEGEND_TEAM_SEASONS = [{
  team_season_id: LEGEND_IDS.DOLPHINS_1972,
  franchise: 'MIA',
  season: 1972,
  display: '1972 Miami Dolphins',
  division: 'AFC East',
  games: 14,
  record: '14-0',
  pts_scored_mean: 27.50,
  pts_scored_sd: 9.52,
  pts_allowed_mean: 12.21,
  pts_allowed_sd: 6.36,
  point_diff_pg: 15.29,
  strength_z: 3.2,
  legend: true,
}];

function generatePlayoffs(data, rng, count = CONSTANTS.PLAYOFF_ROUNDS_WILD_CARD) {
  /*
   * The playoffs escalate. They used to be four random top-quartile teams, so the Super
   * Bowl was no harder than the Wild Card and the run just stopped when a coin came up
   * wrong. The ladder now climbs to the two teams that define the thing the game is named
   * after:
   *
   *   Wild Card    a good team
   *   Divisional   a great team
   *   Conference   the 2007 Patriots, who went 16-0 and then lost the one that counted
   *   Super Bowl   the 1972 Dolphins, the only team to finish a season unbeaten
   *
   * Built full length and ALWAYS ending at the Dolphins. The round names count back from
   * the final, so a top seed with a bye plays three rounds and must still finish against
   * Miami; see playoffOpponent, which is the only thing allowed to index this list.
   */
  const ladder = [pickFrom(data.goodPool, rng), pickFrom(data.greatPool, rng),
    data.byId(LEGEND_IDS.PATRIOTS_2007), data.byId(LEGEND_IDS.DOLPHINS_1972)];
  return ladder.slice(ladder.length - Math.min(count, ladder.length));
}

/** One team from a pool, uniformly. */
function pickFrom(pool, rng) {
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Which opponent a given playoff round faces.
 *
 * The ladder is aligned to the FINAL, not to the first round, because the number of rounds
 * depends on your seed: 12 wins gets you four rounds, 15 gets a bye and three. Indexing from
 * the front would mean a bye let you skip the Dolphins, which is exactly backwards. Every
 * call site goes through here so the alignment cannot drift between them.
 */
function playoffOpponent(playoffs, rounds, roundIndex) {
  const i = playoffs.length - rounds + roundIndex;
  return playoffs[Math.max(0, Math.min(playoffs.length - 1, i))];
}

// ─── per-game resolution ─────────────────────────────────────────────────────

/**
 * One game. Returns both scores and the winner.
 *
 * The GDD's defense modifier was league_avg / opponent_allowed, which is
 * inverted: against the 2000 Ravens (10.3 allowed, league ~21) that multiplies
 * your score by ~2.0, so the best defense in modern history would be the easiest
 * matchup. It is opponent_allowed / league_avg here, so a stingy defense
 * suppresses you and a leaky one inflates you.
 *
 * league_avg_pts_allowed is per season, not one global number, because league
 * scoring drifts (20.8 in 1999 to 23.0 in 2025) and a single constant would
 * systematically mis-rate one era against the other.
 */
function resolveGame(roster, chemistryMultiplier, opponent, leagueAvgAllowed, rng, constants = CONSTANTS) {
  let raw = 0;
  for (const p of roster) raw += sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);

  // Structure is read from the roster itself, so no caller can forget to apply it.
  const structure = rosterStructure(roster).multiplier;
  const defenseModifier = opponent.pts_allowed_mean / leagueAvgAllowed;
  const yourScore = raw * chemistryMultiplier * structure * defenseModifier;

  const oppScore = sampleGamma(opponent.pts_scored_mean, opponent.pts_scored_sd, rng) * constants.SCALE;

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;   // overtime coin flip

  return { won, yourScore, oppScore, defenseModifier };
}

// ─── display scores ──────────────────────────────────────────────────────────

/** Fractional percentile of `v` within an ascending quantile table. */
function percentileIn(table, v) {
  let lo = 0, hi = table.length - 1;
  if (v <= table[0]) return 0;
  if (v >= table[hi]) return 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= v) lo = mid; else hi = mid;
  }
  const span = table[hi] - table[lo];
  const frac = span > 0 ? (v - table[lo]) / span : 0;
  return (lo + frac) / (table.length - 1);
}

/** Value at fractional percentile `p` in an ascending quantile table. */
function valueAt(table, p) {
  const x = Math.min(1, Math.max(0, p)) * (table.length - 1);
  const i = Math.floor(x);
  const j = Math.min(table.length - 1, i + 1);
  return table[i] + (table[j] - table[i]) * (x - i);
}

/*
 * How hard the scoreline is pulled toward the two targets.
 *
 * Both are in points. Tight enough that a good offence visibly outscores a bad one, loose
 * enough that the same roster does not report the same scoreline every week: the real
 * corpus is sampled inside these tolerances by its own frequency, so 23-20 comes up often
 * and 41-38 comes up rarely, exactly as often as football produces them.
 */
const SCORELINE_TOLERANCE = { margin: 4.5, points: 5.0 };

/**
 * Turn an internal fantasy-space result into a football-looking scoreline.
 *
 * The sim decides the winner; this only decides how the game is *reported*. It picks a
 * scoreline that REALLY HAPPENED in the NFL between 1999 and 2025, matched on two things:
 *
 *   1. the margin, mapped from the internal margin through both empirical CDFs, and
 *   2. YOUR points, mapped from your internal score the same way.
 *
 * The second one is new and it is the point of the exercise. The old version conditioned
 * the total on the margin alone, so the scoreline knew whether the game was close but knew
 * nothing about whether your offence was any good: across the whole cap-legal band, from a
 * 48-FPPG roster to an 87-FPPG one, reported points moved only 18.3 to 25.2, and in
 * one-score games only 20.9 to 23.1. Real NFL offences span about 16 to 30 a game, so a
 * stacked roster and a thin one were being reported almost identically. Win rate reacted
 * properly the whole time; the scoreboard did not, which is what made it feel flat.
 *
 * Sampling real pairs also removes a whole class of impossible-looking results. The old
 * arithmetic (draw a total, force its parity, split it) could land on a team score of 4,
 * which it did 0.43% of the time and which has happened ZERO times in 7,276 real games.
 *
 * Deliberately not a divisor: your internal mean (~73) sits far above an opponent's (~43)
 * because that gap is what carries win probability, so scaling both sides down renders
 * every week as a blowout.
 */
function toFootballScore(yourScore, oppScore, won, rng, cal) {
  const internalMargin = Math.abs(yourScore - oppScore);
  const marginTarget = Math.max(1, valueAt(cal.real_margin_q,
    percentileIn(cal.internal_margin_q, internalMargin)));

  // Older calibration files carry no pair table. Fall back rather than throw.
  if (!cal.real_pairs || !cal.internal_offence_q) {
    return legacyFootballScore(yourScore, oppScore, won, rng, cal);
  }

  const pointsTarget = valueAt(cal.real_team_pts_q,
    percentileIn(cal.internal_offence_q, yourScore));

  /*
   * Weight every real scoreline by how well it matches both targets and by how often it
   * really happened. Gaussian in both terms so the fit degrades smoothly: if nothing sits
   * near the targets the nearest real scorelines still carry all the weight.
   */
  const TM = SCORELINE_TOLERANCE.margin, TP = SCORELINE_TOLERANCE.points;
  const pairs = cal.real_pairs;
  let sum = 0;
  const w = new Array(pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    const hi = pairs[i][0], lo = pairs[i][1], n = pairs[i][2];
    const mine = won ? hi : lo;
    const dm = (hi - lo - marginTarget) / TM;
    const dp = (mine - pointsTarget) / TP;
    const v = n * Math.exp(-0.5 * (dm * dm + dp * dp));
    w[i] = v;
    sum += v;
  }
  if (!(sum > 0)) return legacyFootballScore(yourScore, oppScore, won, rng, cal);

  let r = rng() * sum;
  let k = pairs.length - 1;
  for (let i = 0; i < pairs.length; i++) { r -= w[i]; if (r <= 0) { k = i; break; } }
  const hi = pairs[k][0], lo = pairs[k][1];
  return won ? { you: hi, them: lo } : { you: lo, them: hi };
}

/**
 * The original margin-and-total arithmetic, kept only as a fallback for a calibration file
 * built before the pair table existed. It can produce scorelines football does not produce,
 * so nothing should reach it in a normal build.
 */
function legacyFootballScore(yourScore, oppScore, won, rng, cal) {
  const internalMargin = Math.abs(yourScore - oppScore);
  const pct = percentileIn(cal.internal_margin_q, internalMargin);
  let margin = Math.round(valueAt(cal.real_margin_q, pct));
  if (margin < 1) margin = 1;

  const buckets = cal.margin_buckets;
  let bi = 0;
  for (let i = 0; i < buckets.length - 1; i++) {
    if (margin >= buckets[i] && margin < buckets[i + 1]) { bi = i; break; }
    if (i === buckets.length - 2) bi = i;
  }
  let total = Math.round(valueAt(cal.totals_by_bucket_q[bi], rng()));
  if ((total - margin) % 2 !== 0) total += 1;
  let high = (total + margin) / 2;
  let low = high - margin;
  if (low < 0) { low = 0; high = margin; }
  if (low === 1) low = 2;
  if (high === 1) high = 2;
  return won ? { you: high, them: low } : { you: low, them: high };
}

/**
 * Play a whole run: all 17 regular-season games, then the playoffs if the record
 * earned them. One playoff loss ends the run.
 */
function playRun(roster, chemistryMultiplier, schedule, playoffs, leagueContext, rng, constants = CONSTANTS) {
  const results = [];
  let wins = 0, losses = 0;

  const play = (opp, meta) => {
    const leagueAvg = leagueContext[opp.season] ?? 21.5;
    const r = resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants);
    results.push({ opponent: opp.display, opponent_id: opp.team_season_id, ...meta, ...r });
    if (r.won) wins++; else losses++;
    return r.won;
  };

  for (let i = 0; i < schedule.length; i++) {
    play(schedule[i], { week: i + 1, playoff: false, round: null });
  }

  const regularWins = wins;
  const regularLosses = losses;
  const seed = seedFromRecord(regularWins);

  let titleWon = false;
  let exitRound = null;
  if (seed.made) {
    const names = playoffRoundNames(seed.rounds);
    for (let i = 0; i < seed.rounds; i++) {
      const opp = playoffOpponent(playoffs, seed.rounds, i);
      const won = play(opp, { week: schedule.length + i + 1, playoff: true, round: names[i] });
      if (!won) { exitRound = names[i]; break; }
      if (i === seed.rounds - 1) titleWon = true;
    }
  }

  return {
    results,
    wins,
    losses,
    regularWins,
    regularLosses,
    regularRecord: `${regularWins}-${regularLosses}`,
    record: `${wins}-${losses}`,
    seed,
    titleWon,
    exitRound,
    perfect: losses === 0 && titleWon,
    undefeatedRegular: regularLosses === 0,
  };
}

// ─── data prep ───────────────────────────────────────────────────────────────

/** Precompute the derived structures the schedule generator needs. */
function prepareData(teamSeasons) {
  const divisions = buildDivisionMap(teamSeasons);
  const byFranchise = {};
  for (const t of teamSeasons) (byFranchise[t.franchise] ??= []).push(t);

  const zs = teamSeasons.map((t) => t.strength_z).sort((a, b) => a - b);
  const q = (p) => zs[Math.min(zs.length - 1, Math.max(0, Math.round(p * (zs.length - 1))))];
  const eliteThreshold = q(0.90);
  const topQuartile = teamSeasons.filter((t) => t.strength_z >= q(0.75));

  /*
   * The two rungs below the named teams. "Good" is a solid playoff side and "great" is a
   * genuine contender, kept apart so the Wild Card and the Divisional round do not feel
   * like the same game twice.
   */
  const goodPool = teamSeasons.filter((t) => t.strength_z >= q(0.65) && t.strength_z < q(0.85));
  const greatPool = teamSeasons.filter((t) => t.strength_z >= q(0.93));

  const index = {};
  for (const t of teamSeasons) index[t.team_season_id] = t;
  for (const t of LEGEND_TEAM_SEASONS) index[t.team_season_id] ??= t;

  // A schedule of 17 average opponents sums to ~17 * mean(z) ~ 0.
  const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  return {
    divisions, byFranchise, eliteThreshold, topQuartile, goodPool, greatPool,
    legends: LEGEND_TEAM_SEASONS,
    byId: (id) => index[id],
    meanScheduleStrength: meanZ * 17,
  };
}

/* Bumped alongside run.js. See the note there.
 * Name-spaced because engine.js and run.js are plain scripts sharing one global
 * scope in the browser: two top-level `const API_VERSION` declarations collide
 * and the second file fails to parse at all. Which is what happened, and the boot
 * check below reported it correctly. */
const ENGINE_API_VERSION = 14;

/*
 * The three-letter code a team actually wore in a given season.
 *
 * The data stores the CURRENT franchise code, so a 2014 Oakland Raider is filed under LV.
 * That is right for grouping a franchise's history and wrong for a label: the rest of the
 * game calls that team-season "2014 Oakland Raiders", so a chip reading LV 2014 would
 * contradict it.
 *
 * These four are the only franchises whose display name moves between 1999 and 2025, read
 * off team_seasons.json rather than from memory. Washington is in the list only to record
 * that it does NOT need an entry: the name changed twice, Redskins to Football Team in 2020
 * to Commanders in 2022, but the code stayed WAS throughout.
 */
const ERA_CODES = {
  LAC: [[2017, 'LAC'], [0, 'SD']],       // San Diego through 2016
  LAR: [[2016, 'LAR'], [0, 'STL']],      // St. Louis through 2015
  LV: [[2020, 'LV'], [0, 'OAK']],        // Oakland through 2019
};

/** The code that team wore that year. Falls through to the current code. */
function eraCode(franchise, season) {
  const rules = ERA_CODES[franchise];
  if (!rules) return franchise;
  for (const [from, code] of rules) if (season >= from) return code;
  return franchise;
}

const publicAPI = {
  API_VERSION: ENGINE_API_VERSION,
  CONSTANTS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY,
  hashSeed, createSeededRNG, sampleGamma,
  pairLinks, resolveChemistry,
  buildDivisionMap, opponentFranchises, generateSchedule, generatePlayoffs,
  resolveGame, playRun, prepareData, toFootballScore,
  playoffOpponent, LEGEND_IDS, LEGEND_TEAM_SEASONS,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES,
  respinCost, respinFees, scoringScript, scoreParts, SCORE_KINDS,
  eraCode, ERA_CODES,
  NICKNAMES, nickname, TEAM_COLORS, teamColors, washColors, contrast, LINK_TIERS, linkTier, rosterStructure, STRUCTURE, coachReport,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_ENGINE = publicAPI;
