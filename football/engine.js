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
   * At $140M, SCALE 2.65, CONSISTENCY 0.20, HOME_FIELD 0.35, measured over
   * 150 runs per policy:
   *
   *   policy                 spend  FPPG shape  record  playoffs title  20-0
   *   cheapest every time     $43M    21  0.51    0-17       0%     0%    0%
   *   best points per dollar  $61M    44  0.92    5-12       0%     0%    0%
   *   random tap              $81M    51  0.73    4-13       4%     0%    0%
   *   taps the top row       $137M    79  0.82    11-6      43%     1%    0%
   *   perfect play (DP)      $138M    85  1.02    14-3      90%     4%  0.3%
   *
   * CONSISTENCY and PLAYOFF_HOME_FIELD together widen the gap between
   * careless and perfect play. A 17-0 team now loses the Divisional round
   * about 19% of the time (was 66% without either dial). 20-0 is still
   * near-mythical at 0.2-0.3% of runs. USE 150 RUNS, not 40, to judge
   * any of this.
   *
   * Random tapping at 4-13 is still correct: random picks build broken
   * offenses and the model says so. Perfect play buys FEWER expensive
   * players than careless play because the balanced roster is the better
   * one. That is the decision the bigger budget creates.
   *
   * Re-solve before trusting any change to pricing, the cap, chemistry, or the
   * structure model. All four move these numbers.
   */
  /* RAISED 2.65 -> 2.90 TO MAKE 20-0 RARE AGAIN, ESPECIALLY BELOW A 95 RATING.
   * Opponents score a little more in every game, which shrinks the win margin a
   * good roster carries. The margin is what a 20-game unbeaten run compounds, so
   * the tail is far more sensitive to this than a typical record is: measured over
   * thousands of seasons per rating, going 20-0 fell from 0.35% to about 0.05% at
   * a 93 rating and from 1.4% to about 0.3% at 100, while the top team's usual
   * record barely moved (about 14-3). The reason it stays hard even at the very top
   * is that the reachable rating ceiling is only ~101, so a 20-game run is a coin
   * that has to land right twenty times for everyone. Variance was the wrong dial:
   * dropping CONSISTENCY to zero moved a 93's 20-0 rate by under a tenth of a point,
   * because the gap between a strong roster and its opponents, not the noise around
   * it, is what lets it win out. The policy table above was solved at 2.65 and is
   * kept as the pre-change baseline; only the opponent strength moved.
   *
   * Nudged 2.90 -> 3.05 to make everything slightly harder across the board: opponents
   * score ~5% more, so a near-optimal roster's title odds roughly halve and 20-0 drops to
   * a negligible tail. SCALE never touches team rating (fppg x chem x structure), so this
   * changes future game outcomes only; recorded runs and their ratings are untouched. */
  SCALE: 3.05,
  CAP_MUSD: 140,

  /*
   * ─── CASH CONSIDERATION ────────────────────────────────────────────────────
   *
   * GM mode only. Nobody hands over a better player for a worse one out of
   * goodwill: when a deal is a straight upgrade in talent, the other club wants
   * money on top, and that money comes off YOUR CAP for the rest of the season.
   *
   * The salary difference is already a cost -- taking Brady for Tua costs $10.3M
   * of room because Brady is paid more. Cash is a separate and permanent one: the
   * ceiling itself drops, so every upgrade narrows what you can afford later. It
   * makes climbing a resource you spend rather than a thing you simply do, and it
   * gives the value mark on the GM rating something real to measure.
   *
   * Priced on PRODUCTION GAINED, not on salary, because production is what the
   * other GM is selling. TRADE_CASH_MIN_GAIN is a GATE, not a deductible: under it
   * the deal is close enough to even that nobody asks, and over it the whole gain
   * is billed. So the schedule has a step in it -- any real upgrade starts around
   * $2M -- which is how a person would quote a price rather than how a formula
   * would ramp one. The ceiling stops one blockbuster wrecking a season's cap.
   *
   * Measured, the price barely moves the outcome: sweeping it across a range that
   * changed a season's total cash from $9M to $11.5M left a careful GM's playoff
   * odds at 49%, 48% and 52% and the GM rating mean at 70.5, 70.3 and 70.6. The
   * cost lands as FEWER BIG DEALS ON THE BOARD rather than as a worse team, because
   * the market already refuses to offer a deal you could not afford after paying
   * for it. So this is set for how the demand reads, not to hit a difficulty
   * target: a 3.7-point upgrade -- Tua for Brady -- costs $5M.
   *
   * Rounded to the nearest half million, because a demand of $4.37M reads as
   * arithmetic and $4.5M reads as a number a person said out loud.
   */
  /*
   * ─── WHAT A PLAYER IS WORTH IN A TRADE ─────────────────────────────────────
   *
   * Not his production. His production ABOVE WHAT YOU CAN GET FOR FREE.
   *
   * The market used to price deals on raw fantasy points, summed. Two things
   * followed, and both were reported as broken by the first person to play it:
   * a 3.0 and a 2.9 could be packaged for a 7.7, and every consolidation threw
   * in a free agent whose production nobody paid for. Both are the same error --
   * treating a man who is worse than the waiver wire as though he were an asset.
   *
   * TRADE_REPLACEMENT_FPPG is the waiver wire, measured rather than guessed: over
   * 5,760 free agents actually offered across 120 seasons the median is 3.96.
   * A player at or under it is worth nothing in a deal, because the other club
   * can have that for nothing. This is value over replacement, which is how real
   * football has valued players since Football Outsiders, and it is also why the
   * free agent a two-for-one hands you is now correctly worth zero: replacement
   * level is the definition of what he is.
   *
   * TRADE_VALUE_CURVE is scarcity. Value charts in the real sport are steeply
   * convex -- the Jimmy Johnson chart prices the first pick at 3000 and the
   * thirty-second at 590, so two late firsts do not buy a top one. Stars are
   * scarce and roster spots are finite, so quality costs more than the linear
   * sum of the same production spread thin. At 1.25 a pair of 8-point players
   * comes to 8.6 against 11.6 for a single 12, so the pair cannot buy him.
   */
  TRADE_REPLACEMENT_FPPG: 4,
  TRADE_VALUE_CURVE: 1.25,

  TRADE_CASH_MIN_GAIN: 1.5,     // FPPG of net gain before anyone asks at all
  TRADE_CASH_PER_FPPG: 1.35,    // $M per FPPG gained, on the whole gain once asked
  TRADE_CASH_MAX_MUSD: 9,       // most any single deal can cost you off the cap
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
   *
   * THE BYE MOVED TO 16 WHEN CLASS_* ARRIVED, and for the same reason the tiers were set
   * from the distribution in the first place. Fifteen wins was scarce when a 97 overall
   * averaged 13.3 of them. Once the weekly edge lifted that average to 14.65, fifteen
   * became routine and the bye rate at the top of the game went from 22% to 57%, which
   * dragged Super Bowl odds up with it: a bye is a round skipped and a home-field floor,
   * so it is the single biggest multiplier on a title. At 16 the top of the game is back
   * to earning the week off 27% of the time, on records that are genuinely better than the
   * ones that used to earn it at 15.
   */
  BYE_SEED_WINS: 16,
  PLAYOFF_WINS: 12,
  PLAYOFF_ROUNDS_WITH_BYE: 3,
  PLAYOFF_ROUNDS_WILD_CARD: 4,

  /*
   * How much each side's score is pulled toward its expected value.
   *
   * At 0 every point is sampled, so variance is king and a stacked roster
   * can lose to anyone on a bad draw. At 1 every game is deterministic and
   * the better team always wins. 0.10 is a light touch: it narrows the
   * tails just enough that team quality shows through more often without
   * making outcomes feel scripted.
   *
   * Applied symmetrically to both sides, so it is HARDER to upset a strong
   * opponent (their mean is high, and pulling toward it keeps it there) and
   * EASIER to beat a weak one. Net effect: more 17-0 regular seasons, fewer
   * first-round exits, and a harder path through the legends at the end.
   */
  CONSISTENCY: 0.20,
  /* THE DEFENSE DRAFT, calibrated against the offense season-win distribution rather than by
     eye: a drafted defense should have the same shot at a good season and a title as a
     drafted offense. DEF_REF sets where a defense is neutral (the median drafted defense at
     raw ~34 allows about league average, keeping the scorelines realistic); DEF_POWER is the
     steepness that lets an elite defense separate from a poor one; the cap keeps the worst
     defense bad rather than winless. See the block above resolveGameDefense and the
     defenseOverall map. */
  DEF_REF: 36.1,
  DEF_POWER: 1.8,
  DEF_SUPPRESS_MAX: 1.6,   // worst defense lets the opponent run up ~1.6x, no more
  /* The spread on the offense you are given. Real team scoring runs a standard deviation
     around 40% of the mean (league_context's own pts_scored_sd against pts_scored_mean
     sits near this across the era), and your borrowed offense should be as streaky as
     anybody's or a defensive run would be decided entirely by your own roster. */
  DEF_OFFENSE_SD: 0.40,
  DEF_OFFENSE_SCALE: 0.90,  // your undrafted offense is a shade below average

  /*
   * Playoff home-field advantage, scaling linearly from PLAYOFF_WINS (no
   * advantage) to a 17-0 record (full advantage). Applied as a divisor to
   * the opponent's score: a 17-0 team's opponents score about 10% less.
   *
   * In the real NFL the top seed plays every round at home and the crowd
   * matters. Here it rewards the regular season: if your team earned a
   * dominant record, the playoffs respect it.
   */
  PLAYOFF_HOME_FIELD: 0.35,

  /*
   * ─── WHAT AN ELITE ROSTER IS OWED IN JANUARY ────────────────────────────────────
   *
   * Seeding and home field read the RECORD, and for the very best teams in the game that
   * produced a strange result. Measured over 3,000 seasons a side: a 103-overall roster
   * averaged 13.9 wins, earned a bye only 32% of the time, and won the title 2.8% of the
   * time. It was being asked to win four straight elimination games with a 7% edge in
   * three of them and none in the final. A juggernaut that dropped four coin-flips in
   * September is still the most dangerous team in the field, and the game said otherwise.
   *
   * So strength gets a vote alongside the record. ELITE_FLOOR is where that vote starts and
   * ELITE_FULL is where it is worth as much as a 17-0 record; ELITE_BYE_RATING with
   * ELITE_BYE_WINS is the door to a bye for a team the record alone would have sent down
   * the four-game gauntlet.
   *
   * THE PERFECT SEASON IS UNTOUCHED, BY CONSTRUCTION RATHER THAN BY TUNING. Both levers
   * only ever fire for a team the record UNDERSOLD: the bye is already owned outright at
   * 15 wins, and the home-field share takes whichever of record and strength is HIGHER,
   * which at 17-0 is always the record. A 17-0 roster therefore plays a byte-identical
   * postseason before and after, so the odds of a perfect season cannot move. Verified at
   * 3,000 seasons a band: the perfect-season COUNT is identical either way (9 and 9 at
   * rating 103, 16 and 16 at 110) while titles went 2.8% -> 5.3% and 5.8% -> 10.8%.
   */
  ELITE_FLOOR: 95,
  ELITE_FULL: 105,
  /*
   * ─── THE ORDINARY SUNDAY, READ THE SAME WAY AS THE LAST GAME ────────────────
   *
   * The weekly edge used to be bonus-only: flat 1.000 everywhere under CLASS_FLOOR, so a
   * weak roster was never punished from week to week, merely unhelped, and it stopped
   * climbing at CLASS_FULL even though rosters run fifteen points past it. That put it at
   * odds with the final, which had opinions in both directions. These give it the same
   * shape: under CLASS_PIVOT it drops below 1.000 to 1 - CLASS_DROP at CLASS_DROP_FLOOR,
   * the common band from CLASS_PIVOT to CLASS_MID gets less than it used to, and past
   * CLASS_FULL it keeps paying to CLASS_TOP, which is the same natural cap the final uses.
   *
   *     <= 86   0.940      90   1.020      95   1.131 (unchanged)
   *       100   1.190 (unchanged)      115   1.250
   *
   * 95 THROUGH 100 IS DELIBERATELY UNTOUCHED. SCALE is solved against a cap-optimal roster
   * winning 88-90% of its regular-season games, and that roster sits in this stretch, so
   * moving it would mean re-sweeping SCALE. Measured after the change the anchor reads
   * 89.6%, inside the band, and every archetype and wheel policy in simulator.js still
   * passes -- so this is a change to the two tails, not a rebalance of the middle.
   */
  CLASS_PIVOT: 90,
  CLASS_DROP_FLOOR: 86,
  CLASS_DROP: 0.06,
  CLASS_BREAK_EDGE: 1.020,
  CLASS_MID: 95,
  CLASS_TOP: 115,
  CLASS_TOP_EDGE: 0.06,
  ELITE_BYE_RATING: 100,
  ELITE_BYE_WINS: 13,

  /*
   * ─── THE LAST TWO PERCENT, FOR THE ROSTERS THAT EARNED IT ───────────────────
   *
   * A small multiplier on the weekly edge for anything above ELITE_FLOOR, worth nothing at
   * 95 and all of it by ELITE_POLISH_FULL. It is deliberately tiny: at the top the game is
   * already decided mostly by the roster, and the point of this is not to hand a 100 a
   * different season, it is that going 17-0 and then winning four more should be a shade
   * less punishing for a team that genuinely is the best in the league.
   *
   * IT RIDES ON weeklyEdge AND SO INHERITS ITS DAMPER: weeklyEdgeVs fades the whole edge
   * out against a strong opponent, which means this pays on the sixteen ordinary Sundays
   * and pays almost nothing in the games against the contenders. That is the right shape
   * for a perfect season, where it is the trap games that end runs.
   *
   * 95 rather than any other number because it is already the line the game draws twice:
   * ELITE_FLOOR, where roster strength starts voting on the seed, and FINAL_EDGE_PIVOT,
   * where the title game stops being uphill.
   */
  ELITE_POLISH: 0.02,
  ELITE_POLISH_FULL: 105,

  /*
   * ─── WHAT THE LAST GAME ASKS OF YOUR ROSTER ─────────────────────────────────
   *
   * Every other playoff round can be tilted by the record: win enough and the opponent's
   * score is divided by as much as 1.35. The final was left deliberately neutral, on the
   * reasoning that a Super Bowl is played on neutral ground, and that had a consequence
   * nobody chose. Against the 1972 Dolphins the break-even overall is 148, so EVERY roster
   * in this game is an underdog in that game and the winner is decided out in the tails.
   * Tails are not fussy about how good you are. Measured over 3,360 seasons a band, a
   * roster rated 84 that reached the final won it 8% of the time and a roster rated 96 won
   * it 16%: twelve points of overall bought a factor of two, and teams the game itself
   * grades a C were lifting the trophy.
   *
   * So the final reads the ROSTER where the other rounds read the record, as four straight
   * segments through one neutral point:
   *
   *     <= 86   0.550   FLOOR, the full PENALTY: the opponent scores 82% more
   *        90   0.860   BREAK, the bottom of the band most people actually reach
   *        95   1.000   PIVOT, and the ONLY even final in the game
   *       100   1.100   KNEE
   *    115.08   1.250   CEIL, the best team that can legally be built
   *
   * THE PIVOT IS 95, NOT 90, because 90 is where everybody is. Driven through the real
   * wheel, a player taking the optimal squad from the draws he was actually dealt has a
   * median overall of 88.8, and 33.5% of those runs land in 90-95 -- by far the biggest
   * band above 90. That band used to sit at exactly 1.000 across all five points, so four
   * points of roster quality bought literally nothing in the game that ends the season.
   * Now every one of them is a real deficit and only a 95 gets an even final.
   *
   * CEIL IS THE NATURAL CAP, not a round number. A search over the whole player pool under
   * the real draft rules -- six slots, one man per team-season, $140M -- puts the single
   * best legal roster at 115.08: Lamar Jackson 2019 and Marshall Faulk 2000 at $48M each,
   * then four cheap Ravens out of four different seasons, which stacks ten franchise links
   * on the quarterback hub for a 1.138 chemistry. Putting CEIL there means the maximum edge
   * is earned by exactly one combination and every point below it still buys something,
   * rather than the curve flattening out over a range where better teams still exist. The
   * top is a chemistry puzzle, not a spending contest: the cap makes stars exclusive.
   *
   * WHAT IT DOES. Measured paired -- same rosters, same schedules, same brackets, same
   * seeds under both curves, 60,000 seasons per overall -- as a share of the Super Bowls
   * each band reaches:
   *
   *     band      84-88  88-90  90-92  92-94  94-96  96-100  100-105  105-111
   *     before      6.8   11.0   13.3   14.7   16.6    20.4     26.5     31.0
   *     after       1.5    4.3    8.5   12.0   16.3    21.9     29.5     38.1
   *
   * AND IT MAKES THE GAME HARDER, which is the honest headline and not a side effect. 93%
   * of runs land below the pivot, so weighting those bands by where players actually finish
   * gives 0.57% of seasons ending in a title before and 0.40% after for a skilled player,
   * and 0.072% to 0.034% for somebody signing the best man on each draw. Perfect seasons
   * fall with them, 0.037% to 0.029% and 0.0029% to 0.0015%. Fewer people win, and the ones
   * who do are the ones who built something.
   *
   * GETTING THERE IS NOW READ THE SAME WAY. This used to leave seeding and the earlier
   * rounds alone, which meant the ordinary Sunday said one thing about a roster and the
   * last game said another: weeklyEdge started at 84 and stopped at 100, the playoff
   * strength term did nothing until 95 and stopped at 105, and the final stopped at 102.
   * Three floors and three ceilings for one question. They now share this one's shape --
   * see CLASS_PIVOT and playoffShare.
   *
   * GM mode keeps its own arrangement. Its final already carries a home-field term
   * (GM_FINAL_HOME_FIELD) sized against a different bracket, and there the roster you
   * finish with is a thing you built out of one you were handed.
   */
  FINAL_EDGE_FLOOR: 86,
  FINAL_EDGE_BREAK: 90,
  FINAL_EDGE_PIVOT: 95,
  FINAL_EDGE_KNEE: 100,
  FINAL_EDGE_CEIL: 115,
  FINAL_EDGE_PENALTY: 0.45,
  FINAL_EDGE_BREAK_EDGE: 0.86,
  /*
   * WHAT THE PIVOT ITSELF IS WORTH. It was exactly 1: a 95 walked into the Super Bowl in an
   * even game and everything above it climbed from there. It is 1.03 now, the smallest lift
   * that is not noise, and everything at or above the pivot moves up by exactly that amount:
   * the shape of the climb from 95 to 115 is untouched.
   *
   * THE APPROACH RIDES UP WITH IT, and that is deliberate rather than overlooked. The band
   * from FLOOR to PIVOT is defined by where it lands, so lifting only the top of the curve
   * would put a step in the middle of a function whose whole claim is that it is monotone: a
   * 94.9 would play an even final and a 95.0 a favoured one, on a tenth of a rating point.
   * The ramp instead pays nothing at 90 and the full three points at 95, which measured over
   * six thousand seasons is worth three hundredths of a percentage point on a 93's title
   * rate and nothing at all on a 90's.
   */
  FINAL_EDGE_PIVOT_EDGE: 1.03,
  FINAL_EDGE_KNEE_BONUS: 0.10,
  /*
   * Raised from 0.09, and it buys less per point than that sounds: the old bonus was fully
   * paid by 102 while this one is spread all the way to 115.08, so a 105 gets 1.15 where a
   * naive reading of "0.09 to 0.25" would suggest far more. That is the intended trade for
   * putting CEIL at the natural cap -- a longer runway makes each point worth less, and in
   * exchange the best possible team is the only thing that collects the whole of it.
   */
  FINAL_EDGE_BONUS: 0.25,

  /* THE FINAL, ONCE THE PERFECT SEASON HAS ALREADY GONE. Nothing while the run is still
     unbeaten; past that the ring comes nearer, fastest for the rosters that should have
     been winning it anyway. See finalRecordEase(). */
  NOT_PERFECT_EASE_PER_LOSS: 0.035,
  NOT_PERFECT_EASE_CAP: 0.09,
  NOT_PERFECT_EASE_ELITE_AT: 95,
  NOT_PERFECT_EASE_ELITE_FULL: 100,
  NOT_PERFECT_EASE_ELITE_MULT: 1.8,

  /*
   * ─── CLASS, OVER SEVENTEEN WEEKS ────────────────────────────────────────────
   *
   * A regular-season game had no notion of who the better team was beyond the two score
   * distributions, and over seventeen of them that read wrong at the top. Measured on
   * rosters drafted off the real wheel, a 91 overall averaged 12.6 wins and finished with
   * FIVE OR MORE LOSSES in 48% of its seasons. A 94 did it 39% of the time. These are the
   * best teams anybody can build under the cap and half of them were finishing 12-5, because
   * the sim samples every week from scratch, so a great roster is only ever a favorite by
   * its mean and never by its class.
   *
   * So above CLASS_FLOOR the opponent's score is divided down, climbing linearly to
   * CLASS_EDGE at CLASS_FULL. That is the whole rule. It is worth reading the history of
   * what it is NOT, because two earlier versions of this constant were both wrong in ways
   * that are easy to talk yourself into.
   *
   * IT IS NOT A THRESHOLD AT 90. The first shipped version gave a flat 10% the moment a
   * roster cleared 90 and scaled from there, on the reasoning that a ramp anchored at 90
   * hands a 91 one twelfth of the effect and therefore does nothing. Measured, that step
   * bought two points of overall (88.9 to 90.9) A FULL WIN AND A SIXTEENTH, while the next
   * SEVEN points bought 0.99 between them. An 89.8 roster and a 90.2 roster are the same
   * football team and the game was treating them as different species. The defense for it
   * was that reaching 90 is rare, which is an argument about how hard the DRAFT is, not
   * about how good the TEAM is, and outcomes here answer to the second.
   *
   * IT IS NOT SIZED SO THAT EVERY BAND GAINS. Starting the ramp at 84 means an 87 gains a
   * little too. That is the honest price of a curve with no cliff in it, and it is the right
   * price: an 87 sitting between an 85 and an 89 is the shape being bought.
   *
   *     overall            85     87     89     91     93     94.5     98
   *     wins, before    11.6   12.0   12.3   12.6   12.9    13.0    13.3
   *     wins, after     11.9   12.4   12.9   13.3   13.6    14.0    14.5
   *     5+ losses before  68%    60%    54%    48%    42%     39%     29%
   *     5+ losses after   64%    52%    40%    31%    23%     15%      8%
   *
   * Every two points of overall is now worth about four tenths of a win, the whole way up.
   *
   * WHAT IT COSTS. Winning more regular-season games makes 17-0 more reachable, and 17-0 is
   * the gate on a perfect season, so this cannot be free. An undefeated regular season runs
   * 1.10% at a 91 and 5.16% at a 98, against 0.39% and 1.28% before any of this. That is
   * priced rather than dodged, and weeklyEdgeVs below is what keeps it from being worse.
   * CLASS_EDGE is the dial if it ever reads too cheap.
   */
  CLASS_FLOOR: 84,
  CLASS_FULL: 100,
  CLASS_EDGE: 0.19,
  /* Where the edge fades out against a strong opponent. See weeklyEdgeVs. */
  CLASS_FOE_LOW: 1.0,
  CLASS_FOE_HIGH: 1.9,

  /*
   * ─── THE GM MODE POSTSEASON ────────────────────────────────────────────────
   *
   * Trade Machine only. The other modes keep the ladder above untouched.
   *
   * Everywhere else the goal is a perfect record, so the last two rounds are the
   * 2007 Patriots and the 1972 Dolphins and beating them is the whole point. In
   * GM mode the goal is different: you inherit a bad roster and try to turn the
   * season around. Measured against the shipped ladder, a GM who did exactly that
   * — finishing at a 94 rating, up thirty points — won the title 1.5% of the time,
   * because a title still meant beating both legends. The story the mode tells and
   * the ending it allows did not match.
   *
   * Two things change, and only for this mode.
   *
   * The bracket (generateContenderPlayoffs) is real playoff teams instead of two of
   * them plus the two myths: the weakest team in, then the ordinary playoff field,
   * then a top-decile season in the final. Still a gauntlet — the team you meet for
   * the title is one of the best seasons since 1999 — but a bracket a contender can
   * come through.
   *
   * LATE_BYE_*: the bye is also reachable. On record alone it never was — the
   * first six weeks are played with the roster you were handed, so 15 wins is out
   * of reach no matter how well you trade, and over 200 measured seasons a
   * deliberate GM earned it 14 times. So GM mode adds a second route: win
   * LATE_BYE_WINS of your last LATE_BYE_GAMES and you are the hottest team going
   * in, and you get the week off. It rewards precisely what the mode is about, it
   * gives the eight weeks after the deadline something to play for, and it
   * discriminates hard — a team winning 70% of its games clears it about a
   * quarter of the time, a .500 team about one time in thirty.
   *
   * GM_FINAL_HOME_FIELD: how much of that seeding edge survives into the final,
   * GM mode only. Everywhere else the answer is none, and measured on the new
   * bracket that made the Super Bowl unwinnable by construction: a top seed rated
   * 100 was still a 7.7-point underdog in it, because the two hardest things about
   * the game — a top-decile opponent and no home-field — landed on the same night.
   * Home-field here is not a crowd, it is the stated reward for the regular season,
   * so on neutral ground it is halved rather than erased. At 0.5 a juggernaut plays
   * the final about even (+0.8 at a 100 rating) and a merely good team is still a
   * clear underdog (-11.7 at 85), which is the shape the mode wants: the last game
   * is the hardest thing in it, and being high overall is what makes it winnable.
   *
   * Measured title odds for a top seed, at 0.5: 7.2% at an 80 rating, 10.6% at 85,
   * 15.1% at 90, 20.9% at 95, 27.1% at 100. From a wild card, 1.1% to 7.6%.
   */
  GM_FINAL_HOME_FIELD: 0.5,
  LATE_BYE_GAMES: 8,
  LATE_BYE_WINS: 7,
};

const ERAS = {
  '2000s': [1999, 2009],
  '2010s': [2010, 2019],
  '2020s': [2020, 2025],
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
/**
 * WHEN POINTS ACTUALLY GET SCORED, as each quarter's share of a game's scoring.
 *
 * Real football is not flat and it is not front-loaded: the second quarter and the fourth
 * carry the game because both end in a drive played against the clock, while the first is
 * two teams feeling each other out and the third is the one after the interval.
 *
 * This game had it close to backwards. Measured over 18,000 scripts, the fourth quarter was
 * the QUIETEST at 17% of the points and the first was the loudest at 32%, so a game opened
 * with a bang and trailed off -- the one shape football never has. Two things caused it and
 * neither was a decision: the spreader below handed every score an even slice of the hour
 * (25/25/25/25 on its own, confirmed in isolation), and the late-field-goal guard further
 * down only ever moves a kick EARLIER, so points drained forwards on every pass and nothing
 * ever moved back.
 *
 * Shares rather than a formula because that is what the thing being copied is.
 *
 * THESE ARE NOT THE TARGET SHARES THEMSELVES, they are what the placer has to be fed to
 * produce them. It places SCORES and the thing being matched is POINTS, and the two differ
 * because the kinds are not spread evenly: field goals cluster where the guard below moves
 * them, so a quarter given a share of the scores comes out with a different share of the
 * points. Feeding it the real shares directly gave 26.1/31.3/18.8/23.8 against a real
 * 21/29/22/28. Solved back through that error, these land the points within a point.
 */
const QUARTER_SCORING_SHARE = [0.21, 0.29, 0.22, 0.28];

/* The cumulative version, and a map from a 0..1 position to an elapsed second. Piecewise
   linear: find the quarter the position lands in, then place it proportionally inside that
   quarter. Feeding it a uniform position gives back the shares above. */
const QUARTER_SCORING_CDF = (() => {
  const c = [0];
  for (const s of QUARTER_SCORING_SHARE) c.push(c[c.length - 1] + s);
  return c;                                   // [0, .21, .50, .72, 1]
})();
function scoreTimeAt(u, QSEC) {
  const p = Math.max(0, Math.min(0.999999, u));
  let q = 0;
  while (q < 3 && p >= QUARTER_SCORING_CDF[q + 1]) q++;
  const lo = QUARTER_SCORING_CDF[q], span = QUARTER_SCORING_CDF[q + 1] - lo;
  const within = span > 0 ? (p - lo) / span : 0;
  return (q + within) * QSEC;
}

function scoringScript(you, them, rng) {
  const QUARTERS = 4, QSEC = 15 * 60, GAME = QUARTERS * QSEC;
  /* MIX EACH SIDE'S OWN SCORES BEFORE ANYTHING ELSE TOUCHES THEM. scoreParts walks a
     composition and emits the kinds in groups -- every touchdown, then every field goal --
     so 24 always came out as four sevens before its field goal, never a field goal between
     two of them. Two teams whose scoring is each sorted by value, alternated against each
     other, produce a running score that barely wobbles: it is the second reason the lead
     stopped changing, and the less obvious one. The composition still decides WHAT was
     scored; this only decides the order they arrive in, which the composition never had a
     view on. */
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const s = a[i]; a[i] = a[j]; a[j] = s;
    }
    return a;
  };
  const yParts = shuffle(scoreParts(you, rng).map((k) => ({ ...k, team: 'you' })));
  const tParts = shuffle(scoreParts(them, rng).map((k) => ({ ...k, team: 'them' })));
  if (!yParts.length && !tParts.length) return [];

  const margin = you - them;
  const winner = margin >= 0 ? 'you' : 'them';
  /* The score that settled a one-possession game is the winner's last one, held back to
     land in the closing minutes where a broadcast would have shown it. */
  /* ---- OVERTIME ----
   * A game goes to overtime when regulation ends level, so the only finals that can have
   * come out of one are those the winner reached with a single score after the tie: a
   * field goal, a touchdown with or without its kick, or the very occasional safety. That
   * is exactly the set of points SCORE_KINDS can produce, so an overtime game is one where
   * the winner holds a score worth precisely the final margin and everything else adds up
   * level.
   *
   * PLAYOFF RULES, EVERYWHERE. Both sides get a possession and it is sudden death after
   * that, so an overtime here never ends level. That is not only what was asked for, it is
   * the only version this game can represent: a run's record is wins and losses with
   * nowhere to put a tie, so a regular-season overtime that ended 24-24 would have no way
   * of being written down.
   *
   * The rate is set on the finals that COULD have gone to overtime rather than on all of
   * them, and tuned so the whole population lands near the real one -- about one game in
   * eighteen. */
  const OT_MARGINS = [2, 3, 6, 7, 8];
  const OT_CHANCE = 0.23;
  let otScore = null;
  const absMargin = Math.abs(margin);
  if (absMargin !== 0 && OT_MARGINS.indexOf(absMargin) >= 0 && rng() < OT_CHANCE) {
    const pool = winner === 'you' ? yParts : tParts;
    const at = pool.findIndex((s) => s.points === absMargin);
    if (at >= 0) otScore = pool.splice(at, 1)[0];
  }

  /* NOT EVERY ONE-SCORE GAME IS DECIDED LATE. Holding the winner's last score back in all
     of them meant the winner had almost always been behind just before it, so 70.6% of
     games featured a comeback against something nearer 55% in real football. Plenty of
     three-point wins are led wire to wire and the loser simply never answers.
     An overtime game never takes one: regulation ended level, so there is nothing to hold
     back and the score that settled it is already waiting in the extra period. */
  const CLINCHER_CHANCE = 0.6;
  let clincher = null;
  if (!otScore && margin !== 0 && Math.abs(margin) <= 8 && rng() < CLINCHER_CHANCE) {
    clincher = (winner === 'you' ? yParts : tParts).pop();
  }

  /* INTERLEAVE THE POSSESSIONS. A real game trades the ball back and forth, so the same
     team rarely scores three times running: between two scores the other side has had it.
     But it was doing that job far too well. Handing the next score to whoever had more
     left, and forcing a change after two, produced a strict alternation whenever the two
     sides had the same number of scores -- and a strict alternation means the side that
     scores first is very often ahead from the first whistle to the last. Measured over
     18,000 games the lead changed 0.54 times a game, against something nearer 2.4 in real
     football. Nobody came back, because the shape of the script never let them.
     So: still weighted by who has scores left, and still leaning against a third in a row,
     but drawn rather than decided. A run of two is common, three happens, and the trailing
     side can string enough together to go ahead. */
  const RUN_DAMP = 0.3;
  /* AND THE TRAILING SIDE IS LIKELIER TO SCORE NEXT, which is the part a shuffle cannot
     reach. Weighting only by scores remaining gives a uniformly random interleaving, and a
     uniformly random interleaving tracks the final score proportionally: a team that ends
     up winning 27-24 spends most of an evenly-dealt game in front. Real football does not
     deal evenly, because the two sides react to the scoreboard -- the side behind opens up
     and goes for it, the side ahead runs the clock and takes the field goal. That feedback
     is most of why real leads change hands about 2.4 times a game and a proportional deal
     manages 1.5. Scaled by how big the lead is and capped, so a two-score deficit pulls
     harder than a field goal without ever becoming a rule. */
  const TRAIL_PULL = 0.16, TRAIL_CAP = 0.3;
  /* AND IT ONLY APPLIES WHERE IT IS TRUE. Feeding every game the same feedback bought lead
     changes and paid for them in comebacks: 1.8 a game, but the eventual winner had trailed
     in 69% of them against about 55% in real football. The two are the same dial as long as
     every game oscillates equally, and real football does not -- a three-score win is
     usually led wire to wire and a three-point win is a seesaw. Real scoreboards put nearly
     all their lead changes in the close games and almost none in the rest, so the pull is
     scaled by how close this one finishes. Blowouts settle early and stay settled. */
  const closeness = Math.max(0, 1 - Math.abs(margin) / 20);
  const y = yParts.slice(), t = tParts.slice(), order = [];
  let ordY = 0, ordT = 0;
  while (y.length || t.length) {
    let takeYou;
    if (!t.length) takeYou = true;
    else if (!y.length) takeYou = false;
    else {
      const a = order.length;
      const run = a >= 2 && order[a - 1].team === order[a - 2].team ? order[a - 1].team : null;
      let p = y.length / (y.length + t.length);
      if (run === 'you') p *= RUN_DAMP;
      else if (run === 'them') p = 1 - (1 - p) * RUN_DAMP;
      const lead = ordY - ordT;
      if (lead !== 0) {
        const pull = Math.min(TRAIL_CAP, Math.abs(lead) * TRAIL_PULL) * closeness;
        p = lead > 0 ? p * (1 - pull) : p + (1 - p) * pull;
      }
      takeYou = rng() < p;
    }
    const next = (takeYou ? y : t).shift();
    if (next.team === 'you') ordY += next.points; else ordT += next.points;
    order.push(next);
  }
  if (clincher) order.push(clincher);

  /* ONE TIMESTAMP PER SCORE, and they are the thing the old version got most wrong: it drew
     a random second in a random quarter for each, so two scores could share a clock (the
     7:17 and 7:17 that gave this away) and whole quarters could sit empty. Here each score
     takes its own even slice of the hour with a little jitter, so times are always distinct
     and the game fills out. Elapsed seconds, 0 at kickoff; the clincher lands in the last
     five minutes, never at 0:00. A touch back-loaded by giving later slots to later scores. */
  const n = order.length;
  const el = [];
  /* THE OTHER SCORES FILL THE SHARE THE CLINCHER DOES NOT. Slicing all n slots evenly and
     then lifting the last one out to the closing minutes left the rest spread over about
     85% of the scoring mass, so the top of the fourth quarter was reachable only by the
     clincher -- and only the 55% of games close enough to have one. Spreading the others
     across everything up to where the clincher sits fills it in every game. */
  const spread = clincher ? n - 1 : n;
  const top = clincher ? 0.93 : 1;
  for (let i = 0; i < n; i++) {
    if (clincher && i === n - 1) { el.push(GAME - (25 + Math.floor(rng() * (5 * 60)))); continue; }
    /* Each score still takes its own slice, so two never share a clock and no quarter sits
       empty; the slice is now measured in SCORING SHARE rather than in seconds, so the
       quarters fill the way real ones do instead of evenly. */
    el.push(scoreTimeAt(top * (i + 0.15 + rng() * 0.7) / spread, QSEC));
  }

  /* Same honesty rule as before, now on the timeline: a team down by more than a field goal
     does not kick one in the fourth quarter, because three points still leaves it losing.
     Move any such kick to an earlier point in the game and settle. Only ever moves a kick
     earlier, so the count of offenders falls each pass. */
  const quarterOf = (t0) => Math.min(QUARTERS - 1, Math.floor(t0 / QSEC));
  /* Three minutes left: past here a field goal that still leaves you behind has spent the
     possession you needed. Before it, the same kick is ordinary game management. */
  const LATE_FG_CUTOFF = GAME - 180;
  /* Where that cutoff falls in scoring-share terms, so a relocated kick can be redrawn
     through the same shape as everything else instead of flat across the early game. */
  const LATE_FG_SHARE = QUARTER_SCORING_CDF[3] +
    ((LATE_FG_CUTOFF - 3 * QSEC) / QSEC) * QUARTER_SCORING_SHARE[3];
  const badLateFG = () => {
    const idx = order.map((e, i) => i).sort((a, b) => el[a] - el[b]);
    let ry = 0, rt = 0;
    for (const i of idx) {
      const e = order[i];
      const behind = e.team === 'you' ? rt - ry : ry - rt;
      /* THE CLOSING MINUTES, NOT THE WHOLE QUARTER. The rule used to cover all fifteen,
         which is not how the game is coached: a team down six or nine with ten minutes
         left kicks the field goal and makes it a one-score game, and that is a normal
         Sunday. What no side does is kick with the clock nearly gone and still need
         another possession afterwards. Banning the whole quarter also cost realism twice
         over, because every kick it caught was moved earlier and the fourth quarter was
         already the emptiest one. */
      if (e.kind === 'FIELD GOAL' && el[i] >= LATE_FG_CUTOFF && behind > 3) return i;
      if (e.team === 'you') ry += e.points; else rt += e.points;
    }
    return -1;
  };
  for (let guard = 0; guard < n + 4; guard++) {
    const bad = badLateFG();
    if (bad < 0) break;
    /* Anywhere before the cutoff, drawn through the same scoring shape rather than flat.
       Flat across the opening 45 minutes was the second half of the front-loading: every
       relocated kick landed uniformly early, so each pass pushed more points towards the
       start of the game and none of them ever came back. */
    el[bad] = Math.floor(scoreTimeAt(rng() * LATE_FG_SHARE, QSEC));
  }

  /* Sort into time order and force the clocks a whole second apart, on the ROUNDED seconds
     rather than the raw ones, so two scores a fraction of a second apart never floor onto
     the same displayed clock. */
  const idx = order.map((e, i) => i).sort((a, b) => el[a] - el[b]);
  const secs = idx.map((i) => Math.max(1, Math.min(GAME - 1, Math.floor(el[i]))));
  for (let i = 0; i < secs.length; i++) {
    if (i > 0 && secs[i] <= secs[i - 1]) secs[i] = secs[i - 1] + 1;
    /* AN EXACT QUARTER BOUNDARY DISPLAYS AS THE SECOND AFTER IT. The clock below is
       time REMAINING, clamped to QSEC-1, so an elapsed time of exactly 45:00 and one of
       45:01 both come out as "14:59 in the fourth" -- two scores on one clock, which the
       distinct-seconds rule above was written to prevent and could not see, because the
       collision happens after the clamp rather than before it. Rare while scores were
       spread evenly; no longer rare now they cluster where real scoring does. */
    if (secs[i] % QSEC === 0) secs[i] += 1;
    secs[i] = Math.min(GAME - 1, secs[i]);
  }

  let ry = 0, rt = 0;
  const out = idx.map((i, k) => {
    const e = order[i];
    const t0 = secs[k];
    const q = quarterOf(t0);
    const sec = Math.max(1, Math.min(QSEC - 1, QSEC - (t0 - q * QSEC)));
    if (e.team === 'you') ry += e.points; else rt += e.points;
    return {
      q: q + 1,
      sec,
      clock: Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'),
      team: e.team, kind: e.kind, note: e.note || null, points: e.points,
      you: ry, them: rt,
    };
  });

  /* THE EXTRA PERIOD, appended after regulation has been laid out and totalled, so the
     running score it carries is the one the fourth quarter actually ended on -- level, by
     construction. Fifteen minutes, which is the playoff length; both sides get a
     possession before it can end, so the score that settles it is never on the opening
     drive of the period and lands a couple of minutes in at the earliest. */
  if (otScore) {
    const OT_SEC = 15 * 60;
    const elapsed = 120 + Math.floor(rng() * (OT_SEC - 240));
    const sec = Math.max(1, OT_SEC - elapsed);
    if (otScore.team === 'you') ry += otScore.points; else rt += otScore.points;
    out.push({
      q: QUARTERS + 1,
      ot: true,
      sec,
      clock: Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'),
      team: otScore.team, kind: otScore.kind, note: otScore.note || null, points: otScore.points,
      you: ry, them: rt,
    });
  }
  return out;
}

/* ─── WHOSE TOUCHDOWN IT WAS ──────────────────────────────────────────────────
 *
 * The broadcast knew a touchdown had happened and never knew whose, so a drafted roster
 * could play a whole season without one of its six names being said out loud. Every score
 * on screen belonged to the team. This puts a man on each of them.
 *
 * CREDIT IS DRAWN, NOT SIMULATED, which is the bargain scoringScript already makes one
 * level up: the game was settled in fantasy space long before this runs, and the only
 * question left is which legal, watchable version of it to show. A touchdown goes to one of
 * the six on a weight that is what he produced in THIS game (the box score's own column)
 * times how much of his season is the kind of work that ends in an end zone. The man having
 * the big day scores most of them, the decoy tight end scores few, and neither is ever
 * impossible.
 *
 * IT MUST HAVE ITS OWN RNG, AND THAT IS NOT A STYLE NOTE. `rng` is one sequential stream
 * shared by every game in a season, so drawing a scorer from it would consume values the
 * next week depends on and silently rewrite every later result. That is precisely the
 * failure build/test/README.md documents against toFootballScore, and it would invalidate
 * every run recorded before the change rather than throw. Callers seed a separate stream
 * off the game; nothing in here is reachable from the stream that plays seasons.
 */

/* The name a commentator would use on second reference. Suffixes ride along on purpose:
   "Beckham Jr." is how that man is said out loud, and cutting to "Beckham" to satisfy a
   rule about the last token reads as a different player. */
function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '');
}

function pickWeighted(items, weights, rng) {
  let sum = 0;
  for (const w of weights) sum += Math.max(0, w) || 0;
  if (!(sum > 0)) return items.length ? items[Math.floor(rng() * items.length)] : null;
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]) || 0;
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/* HOW LONG THE SCORING PLAY WAS. Most touchdowns are short and a few are the highlight of
   somebody's season, so this is a tight base with a long tail rather than anything even.
   Runs sit closer to the goal line than catches do, which is the shape the real thing has. */
function touchdownYards(play, rng) {
  const r = rng();
  if (play === 'run') {
    if (r < 0.72) return 1 + Math.floor(rng() * 5);
    if (r < 0.95) return 6 + Math.floor(rng() * 15);
    return 21 + Math.floor(rng() * 50);
  }
  if (r < 0.45) return 2 + Math.floor(rng() * 8);
  if (r < 0.85) return 10 + Math.floor(rng() * 16);
  return 26 + Math.floor(rng() * 50);
}

/*
 * How long the kick was.
 *
 * BANDS RATHER THAN A FORMULA, taken from where NFL field goals actually come from. The chip
 * shot exists but is not the common case, the bulk of them sit between thirty and fifty, and
 * the fifty-plus kick is ordinary now rather than remarkable. Drawing evenly across the legal
 * range would land the median in roughly the right place and still be wrong in both tails: far
 * too many twenty yard kicks, far too few long ones, which is the half a broadcast notices.
 *
 * BOTH TEAMS, unlike the touchdown credits above. A distance is a fact about the kick and
 * needs no drafted player behind it, so the opponent's kicks get one too and the log reads the
 * same on either side of the ball. It is also why this is separate from the credits: it has to
 * work on a defense draft, where there are no offensive credits at all.
 */
const FIELD_GOAL_BANDS = [
  [18, 29, 0.22],
  [30, 39, 0.26],
  [40, 49, 0.30],
  [50, 56, 0.19],
  [57, 63, 0.03],
];
function fieldGoalYards(rng) {
  let r = rng();
  for (const [lo, hi, w] of FIELD_GOAL_BANDS) {
    if (r < w) return lo + Math.floor(rng() * (hi - lo + 1));
    r -= w;
  }
  const last = FIELD_GOAL_BANDS[FIELD_GOAL_BANDS.length - 1];
  return last[0] + Math.floor(rng() * (last[1] - last[0] + 1));
}

/*
 * Every kick in a script, keyed by its place in it.
 *
 * Keyed by index rather than handed back in order because the call banner and the play log
 * ask at different moments: the banner as the clock stops on one score, the log when the whole
 * game is replayed at the end. Both look the kick up by the same index, so a game cannot show
 * 48 yards live and 31 in the log afterwards.
 */
function fieldGoalDistances(script, rng) {
  const out = new Map();
  if (!Array.isArray(script)) return out;
  script.forEach((e, i) => { if (e.kind === 'FIELD GOAL') out.set(i, fieldGoalYards(rng)); });
  return out;
}

/* One line of commentary per touchdown. Several shapes each, drawn on the same stream, so a
   roster that scores four in a game does not read the same sentence four times.
   THE PHRASING IS BANDED BY DISTANCE, which is not decoration: "punches it in" is a
   goal-line verb and reads as a mistake on a 40-yard run, and "breaks away" reads as one on
   a sneak. Each band only holds verbs that are true at that distance. */
function touchdownBlurb(scorer, passer, yards, play, rng) {
  const who = scorer.name, yd = yards;
  const pick = (forms) => forms[Math.floor(rng() * forms.length)];
  if (play === 'run') {
    if (yd <= 5) return pick([
      who + ' punches it in from the ' + yd,
      who + ' powers in from ' + yd + ' yards out',
      who + ' gets in behind his line from the ' + yd,
    ]);
    if (yd <= 20) return pick([
      who + ' finds the corner from ' + yd + ' yards',
      who + ' cuts back for a ' + yd + '-yard touchdown',
      who + ' carries it in from ' + yd + ' out',
    ]);
    return pick([
      who + ' breaks away for ' + yd + ' yards',
      who + ' takes it ' + yd + ' yards to the house',
      who + ' is gone, ' + yd + ' yards untouched',
    ]);
  }
  if (passer) {
    if (yd <= 9) return pick([
      passer.name + ' finds ' + who + ' from ' + yd + ' yards',
      who + ' comes down with it in the corner, ' + yd + ' yards from ' + passer.name,
      passer.name + ' to ' + who + ' for the score from the ' + yd,
    ]);
    if (yd <= 25) return pick([
      who + ' hauls in a ' + yd + '-yard score from ' + passer.name,
      passer.name + ' to ' + who + ', ' + yd + ' yards, touchdown',
      who + ' finds the soft spot, ' + yd + ' yards from ' + passer.name,
    ]);
    return pick([
      who + ' gets behind the secondary, ' + yd + ' yards from ' + passer.name,
      passer.name + ' goes deep and ' + who + ' runs under it, ' + yd + ' yards',
      who + ' takes the top off it, ' + yd + ' yards from ' + passer.name,
    ]);
  }
  return pick([
    who + ' scores on a ' + yd + '-yard catch',
    who + ' comes down with it from ' + yd + ' yards',
  ]);
}

/*
 * Credit every touchdown in `script` that belongs to `you` to one of the drafted six.
 *
 * `men` is the box score's own column: { name, pos, slot, pts, pass, rush, rec }. Returns
 * an array of credits, one per touchdown, each carrying the index of the event in `script`
 * so a caller can hang it on the play it belongs to without matching on anything fuzzy.
 *
 * A roster with nobody who can reach an end zone (which is every defensive roster, whose
 * offense is the league's rather than drafted) returns an empty list, and the caller shows
 * what it always showed. That is the honest answer here: there is no drafted man to name.
 *
 * `opts.team` picks which side of the script to credit, and defaults to yours. It exists for
 * the Challenge Bowl, where BOTH teams were drafted by a person and the opponent's scores
 * deserve a name every bit as much as yours do. A season's opponent is a historic team
 * modelled as a team rather than as players, so there it stays on the default.
 */
function touchdownCredits(script, men, rng, opts = {}) {
  const out = [];
  const side = opts.team || 'you';
  if (!Array.isArray(script) || !Array.isArray(men) || !men.length) return out;
  /* The end-zone share of a man's game. A quarterback's passing does not make HIM the
     scorer, it makes him the passer, so only what he does with the ball in his hands
     counts towards being credited with the score. */
  const reach = men.map((m) => Math.max(0, (m.rush || 0) + (m.rec || 0)));
  if (!reach.some((v) => v > 0)) return out;
  /* Form is this game against his own average, floored so a bad day still scores
     occasionally and capped so one enormous week does not take every touchdown. */
  const weights = men.map((m, i) => {
    const form = m.avg > 0 ? Math.max(0.35, Math.min(2.2, (m.pts || 0) / m.avg)) : 1;
    return reach[i] * form;
  });
  /* The man who throws it, if the roster has one: the biggest passing game on it. A
     defensive or quarterback-less roster simply has no passer and the catches say so. */
  let passer = null;
  for (const m of men) if ((m.pass || 0) > (passer ? passer.pass : 0)) passer = m;

  script.forEach((e, i) => {
    if (e.team !== side || e.kind !== 'TOUCHDOWN') return;
    const scorer = pickWeighted(men, weights, rng);
    if (!scorer) return;
    /* How he got there, from what he is. A quarterback credited with a touchdown ran it in
       himself by definition, and everybody else splits on his own rushing and receiving. */
    const isQB = String(scorer.pos || '').toUpperCase() === 'QB';
    const rushW = Math.max(0, scorer.rush || 0), recW = Math.max(0, scorer.rec || 0);
    const play = isQB || (rushW + recW > 0 && rng() < rushW / (rushW + recW)) ? 'run' : 'catch';
    const yards = touchdownYards(play, rng);
    const withPasser = play === 'catch' && passer && passer !== scorer ? passer : null;
    out.push({
      at: i, kind: 'TOUCHDOWN', team: side,
      scorer: scorer.name, slot: scorer.slot || scorer.pos, play, yards,
      passer: withPasser ? withPasser.name : null,
      short: lastName(scorer.name) + ' ' + yards + '-yard TD ' + (play === 'run' ? 'run' : 'catch'),
      blurb: touchdownBlurb(scorer, withPasser, yards, play, rng),
    });
  });
  return out;
}

/* ─── THE TAKEAWAYS, WHICH ARE THE DEFENSE DRAFT'S TOUCHDOWNS ────────────────
 *
 * On a defense draft you did not draft the offense, so naming the man who scored your points would
 * be naming nobody you picked: that offense is the league's. The six you did pick show up in
 * the other direction, and the play that says so out loud is the one that takes the ball
 * away. So the mode gets its own script, of interceptions and forced fumbles, credited to
 * the six defenders exactly the way a touchdown is credited to the six skill players.
 *
 * HOW MANY is the defense's own game rather than a constant. A real defense averages about
 * 1.3 takeaways a game; one playing out of its mind gets more and one being run over gets
 * none. The rate scales on how the six actually played against their own averages, so the
 * week the roster goes off is the week the ball is on the ground, and a quiet game stays
 * quiet rather than being padded to look busy.
 *
 * WHICH MAN AND WHICH PLAY comes from what he is. A cover man picks it off, a pass rusher
 * knocks it loose, and a linebacker does either, because the three columns 01-defenders.mjs
 * ships per man (the rush, the coverage, the tackling) already say which he is. Drawing the
 * PLAY FROM THE MAN rather than the man from the play is the thing that keeps a nose tackle
 * from leading the team in interceptions.
 *
 * Same RNG rule as the touchdowns above, for the same reason: its own stream, never the
 * season's.
 */
const TAKEAWAY_BASE = 1.3;

/*
 * How often a takeaway by this KIND of player is an interception rather than a strip.
 *
 * The position is the prior and the man's own columns adjust it, in that order, and the
 * order is the whole point. Reading the columns alone looked right and was not: the cheap
 * end of the pool is tackle-led, so most drafted defenders carry roughly zero in both the
 * coverage and the pass rush columns, and every one of them fell through to the same
 * tackle-derived fraction. Measured on a real roster that came out as a nose tackle and two
 * defensive ends leading the team in interceptions, at the identical 58% as the safeties,
 * which is the exact failure the comment above this claims to prevent.
 *
 * So a defensive lineman mostly knocks the ball loose and a defensive back mostly picks it
 * off no matter how thin his line is, and the columns move him off that only when he
 * actually has something in them: a J.J. Watt (10.1 rush, 1.6 cover) lands near 5%
 * interceptions, an Ed Reed near 94%.
 *
 * THE PRIORS ARE FIRMER THAN THEY WERE, at 0.78/0.50/0.22 measured over 400 seasons as
 * 80/49/21. That was the right shape and too soft at both ends: one takeaway in five by a
 * defensive tackle came out an interception, which is several times what a real one manages,
 * and one in five by a cornerback came out a strip. A lineman's takeaways are almost all
 * forced fumbles and a defensive back's are almost all picks; the linebackers are the only
 * group that genuinely splits down the middle, and they are left alone.
 */
const POS_INTERCEPTION_SHARE = { DB: 0.88, LB: 0.50, DL: 0.10 };

/*
 * HOW FAR IT COMES BACK.
 *
 * Most takeaways die roughly where they are made: an interception is caught standing still
 * as often as not, and a loose ball is fallen on rather than picked up. So the distribution
 * is front-loaded and has a tail, rather than being a flat draw that would give every
 * takeaway in the game a twenty yard return.
 */
function takeawayReturnYards(rng) {
  const r = rng();
  if (r < 0.46) return Math.floor(rng() * 5);
  if (r < 0.86) return 5 + Math.floor(rng() * 15);
  return 20 + Math.floor(rng() * 26);
}

/*
 * HOW OFTEN IT GOES ALL THE WAY BACK. A pick six is the loudest thing a defense can do and
 * the reason to watch one play, so it is deliberately not rare enough to be a curiosity; a
 * scoop and score is rarer than a pick six in the real game and is rarer here too. These are
 * per takeaway, and a takeaway only becomes a touchdown if the game actually scored one for
 * you at about that moment, so the rate that reaches the screen is lower than both.
 */
const TAKEAWAY_TD = { INTERCEPTION: 0.30, FUMBLE: 0.17 };
/* How far either side of a takeaway the game will look for a touchdown to pin it on.
   The takeaway's clock is then moved ONTO that touchdown, so this is not a claim about when
   the return happened: it is a limit on how far the game is willing to move a takeaway from
   where the stream put it. Five minutes keeps it inside its own stretch of the game and is
   wide enough that a defense forcing three or four turnovers in a scoring game actually
   cashes one, which at two minutes it did not: one return touchdown every thirty nine games
   is not an event, it is a rumour. */
const TAKEAWAY_TD_WINDOW = 300;

function takeawayBlurb(man, kind, spot, ret, rng) {
  const who = man.name;
  /* A RETURN IS ITS OWN SENTENCE, and the yard line is not repeated in it. The takeaway
     copy says where the ball was won ("at the 22"); a return says how far it came back.
     Saying both would need the two numbers to agree about which end of the field they are
     measured from, and they would be checked by the one reader who cares. */
  if (kind === 'INTERCEPTION') {
    if (ret >= 10) {
      const runs = [
        who + ' picks it off and brings it back ' + ret,
        who + ' steps in front of it and returns it ' + ret,
        who + ' reads it all the way, ' + ret + ' yards the other way',
      ];
      return runs[Math.floor(rng() * runs.length)];
    }
    const forms = [
      who + ' jumps the route and picks it off at the ' + spot,
      who + ' reads it all the way, intercepted at the ' + spot,
      who + ' undercuts the throw, picked at the ' + spot,
      who + ' takes it away at the ' + spot,
    ];
    return forms[Math.floor(rng() * forms.length)];
  }
  /* A strip sack is a pass rusher's play and reads as a mistake next to a cornerback's
     name, so the front seven get the quarterback and the secondary get the ball carrier. */
  const pos = String(man.pos || '').toUpperCase();
  if (ret >= 10) {
    const runs = pos === 'DB' ? [
      who + ' rips it free and takes it back ' + ret,
      who + ' knocks it loose, scooped and returned ' + ret,
    ] : [
      who + ' strips it and takes off, ' + ret + ' yards back',
      who + ' punches it out, scooped and returned ' + ret,
    ];
    return runs[Math.floor(rng() * runs.length)];
  }
  const forms = pos === 'DB' ? [
    who + ' punches it out of the receiver, yours at the ' + spot,
    who + ' rips it free after the catch, recovered at the ' + spot,
    who + ' knocks the ball loose at the ' + spot,
  ] : [
    who + ' strip-sacks the quarterback and you fall on it at the ' + spot,
    who + ' punches the ball out, yours at the ' + spot,
    who + ' blows up the handoff, loose ball recovered at the ' + spot,
  ];
  return forms[Math.floor(rng() * forms.length)];
}

/* The same play, taken to the house. */
function takeawayTdBlurb(man, kind, ret, rng) {
  const who = man.name;
  const forms = kind === 'INTERCEPTION' ? [
    who + ' jumps the route and takes it ' + ret + ' yards the other way for six',
    who + ' picks it clean and nobody catches him, ' + ret + ' yards',
    who + ' steps in front of it and goes ' + ret + ' yards untouched',
  ] : [
    who + ' scoops it and goes ' + ret + ' yards with it',
    who + ' rips it loose, picks it up and takes it ' + ret + ' yards to the house',
    who + ' comes up with the loose ball and runs ' + ret + ' yards for the score',
  ];
  return forms[Math.floor(rng() * forms.length)];
}

/*
 * The interceptions and forced fumbles your defense produced this game.
 *
 * `men` is the defensive box score column: { name, pos, slot, pts, avg, rush, cover,
 * tackle }. Returns events shaped like the scoring script's, so the broadcast can drop them
 * into the same log and the same call banner without a second code path.
 */
function takeawayScript(men, rng, opts = {}) {
  const out = [];
  if (!Array.isArray(men) || !men.length) return out;
  const QSEC = 15 * 60;
  const pts = men.reduce((t, m) => t + (m.pts || 0), 0);
  const avg = men.reduce((t, m) => t + (m.avg || 0), 0);
  const form = avg > 0 ? Math.max(0.3, Math.min(2.4, pts / avg)) : 1;
  /* Knuth, which is exact and cheap at this lambda, with a hard stop so a pathological
     stream cannot spin. Four in a game is already a rout. */
  const lambda = Math.max(0, TAKEAWAY_BASE * form * (opts.rate || 1));
  const L = Math.exp(-lambda);
  let n = 0, p = 1;
  do { n++; p *= rng(); } while (p > L && n < 12);
  n = Math.max(0, Math.min(4, n - 1));
  if (!n) return out;

  const weights = men.map((m) => {
    const f = m.avg > 0 ? Math.max(0.35, Math.min(2.2, (m.pts || 0) / m.avg)) : 1;
    return Math.max(0.01, m.pts || 0) * f;
  });
  const secs = [];
  for (let i = 0; i < n; i++) secs.push(Math.floor(scoreTimeAt(rng(), QSEC)));
  secs.sort((a, b) => a - b);
  for (let i = 0; i < secs.length; i++) {
    if (i > 0 && secs[i] <= secs[i - 1]) secs[i] = secs[i - 1] + 1;
    if (secs[i] % QSEC === 0) secs[i] += 1;
    secs[i] = Math.min(4 * QSEC - 1, secs[i]);
  }

  for (const t0 of secs) {
    const man = pickWeighted(men, weights, rng);
    if (!man) continue;
    /* The position first, then his own coverage against his own pass rush, and only when
       there is enough in those two columns to be evidence rather than rounding. */
    const base = POS_INTERCEPTION_SHARE[String(man.pos || '').toUpperCase()] ?? 0.5;
    const cov = Math.max(0, man.cover || 0), rsh = Math.max(0, man.rush || 0);
    const pInt = (cov + rsh) >= 0.4 ? base * 0.45 + (cov / (cov + rsh)) * 0.55 : base;
    const kind = rng() < pInt ? 'INTERCEPTION' : 'FUMBLE';
    const spot = 5 + Math.floor(rng() * 45);
    const ret = takeawayReturnYards(rng);
    const q = Math.floor(t0 / QSEC);
    const sec = Math.max(1, Math.min(QSEC - 1, QSEC - (t0 - q * QSEC)));
    out.push({
      q: q + 1, sec,
      clock: Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'),
      team: 'you', kind, takeaway: true,
      by: man.name, slot: man.slot || man.pos, spot, ret, man,
      short: lastName(man.name)
        + (ret >= 10 ? ' ' + ret + '-yard ' : ' ')
        + (kind === 'INTERCEPTION' ? 'interception' : 'forced fumble')
        + (ret >= 10 ? ' return' : ''),
      blurb: takeawayBlurb(man, kind, spot, ret, rng),
    });
  }

  /*
   * AND SOME OF THEM GO BACK FOR SIX.
   *
   * A defensive touchdown cannot be invented here: the score is already settled, and the
   * broadcast draws it from a scoring script built out of that score. So a return touchdown
   * is not an extra seven points, it is an EXPLANATION of seven that were already on the
   * board. In the defense draft your offense is the league's and every touchdown of yours
   * says nothing but "You"; this takes one of them and gives it to the man who actually
   * produced it, which is the only way a drafted defender can appear on the scoreboard.
   *
   * The takeaway's clock moves onto the touchdown's, because a pick six is one play and not
   * two, and it stops being a separate flash on screen: the score call carries it.
   *
   * Without a script (the box score builds credits with nothing to pin them to) none of this
   * runs and every takeaway stays a takeaway, which is why `td` is checked and never assumed.
   */
  const script = Array.isArray(opts.script) ? opts.script : null;
  if (script && script.length) {
    const at = (q, sec) => (q - 1) * QSEC + (QSEC - sec);
    const claimed = new Set();
    for (const t of out) {
      if (rng() >= (TAKEAWAY_TD[t.kind] || 0)) continue;
      const when = at(t.q, t.sec);
      let best = -1, bestGap = Infinity;
      for (let i = 0; i < script.length; i++) {
        const e = script[i];
        if (e.team !== 'you' || e.kind !== 'TOUCHDOWN' || claimed.has(i)) continue;
        const gap = Math.abs(at(e.q, e.sec) - when);
        if (gap <= TAKEAWAY_TD_WINDOW && gap < bestGap) { best = i; bestGap = gap; }
      }
      if (best < 0) continue;
      claimed.add(best);
      const e = script[best];
      t.td = true; t.at = best;
      t.q = e.q; t.sec = e.sec; t.clock = e.clock;
      t.ret = 20 + Math.floor(rng() * 56);
      t.head = t.kind === 'INTERCEPTION' ? 'PICK SIX' : 'FUMBLE RETURN';
      t.short = lastName(t.by) + ' ' + t.ret + '-yard '
        + (t.kind === 'INTERCEPTION' ? 'pick six' : 'fumble return');
      t.blurb = takeawayTdBlurb(t.man, t.kind, t.ret, rng);
    }
    /* Moving a clock can move a takeaway past its neighbour, and the broadcast walks this
       list in order against a running clock. */
    out.sort((a, b) => at(a.q, a.sec) - at(b.q, b.sec));
  }
  for (const t of out) delete t.man;
  return out;
}

/** Round names, counting back from the final. */
const PLAYOFF_ROUND_NAMES = ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'];

/*
 * HOW MUCH THE POSTSEASON RESPECTS YOU, from 0 to 1.
 *
 * The record's claim is where it always was: nothing at PLAYOFF_WINS, everything at 17-0.
 * An elite roster gets a second claim on the same scale and the HIGHER of the two wins.
 * That ordering is the whole guarantee that a perfect season gets no easier: at 17-0 the
 * record already scores 1, so strength can never add to it.
 *
 * `rating` is optional, and without it this is exactly the old record-only arithmetic —
 * which is what keeps callers with no rating to hand honest rather than quietly generous.
 */
function playoffShare(wins, rating) {
  const byRecord = Math.max(0, wins - CONSTANTS.PLAYOFF_WINS)
    / (CONSTANTS.REGULAR_SEASON_GAMES - CONSTANTS.PLAYOFF_WINS);
  if (!(rating > 0)) return Math.min(1, byRecord);
  const span = CONSTANTS.ELITE_FULL - CONSTANTS.ELITE_FLOOR;
  const byStrength = span > 0
    ? Math.max(0, Math.min(1, (rating - CONSTANTS.ELITE_FLOOR) / span)) : 0;
  /* Only the STRENGTH path may pass the old cap: a hot 17-win team keeps the old top share,
     so the extra reach at the top is bought with roster quality rather than a lucky season. */
  return Math.max(Math.min(1, byRecord), byStrength);
}

/*
 * WHAT AN ELITE ROSTER IS WORTH ON AN ORDINARY SUNDAY, as a divisor on the opponent's
 * score. 1 up to CLASS_FLOOR, then a linear climb to 1 + CLASS_EDGE at CLASS_FULL.
 * See CONSTANTS.CLASS_*.
 */
/*
 * The elite polish, as a multiplier of its own so it can be read, tested and removed without
 * touching the four returns of the band function below. Nothing under ELITE_FLOOR sees it.
 */
function elitePolish(rating, constants = CONSTANTS) {
  const C = constants;
  const p = C.ELITE_POLISH || 0;
  if (!(p > 0) || !(rating > C.ELITE_FLOOR)) return 1;
  const span = (C.ELITE_POLISH_FULL || C.ELITE_FULL) - C.ELITE_FLOOR;
  const t = span > 0 ? Math.min(1, (rating - C.ELITE_FLOOR) / span) : 1;
  return 1 + p * t;
}

function weeklyEdge(rating, constants = CONSTANTS) {
  return weeklyEdgeBand(rating, constants) * elitePolish(rating, constants);
}

function weeklyEdgeBand(rating, constants = CONSTANTS) {
  const C = constants;
  if (!(C.CLASS_EDGE > 0)) return 1;
  const span = C.CLASS_FULL - C.CLASS_FLOOR;
  const at = (r) => 1 + C.CLASS_EDGE * (span > 0 ? Math.min(1, (r - C.CLASS_FLOOR) / span) : 1);
  /* The ordinary Sunday now agrees with the final about the two tails: it turns against a
     roster under CLASS_PIVOT instead of merely going neutral, gives the common band less
     than it used to, and keeps paying past CLASS_FULL where it used to stop. */
  if (rating < C.CLASS_PIVOT) {
    const dspan = C.CLASS_PIVOT - C.CLASS_DROP_FLOOR;
    const t = dspan > 0 ? Math.max(0, Math.min(1, (rating - C.CLASS_DROP_FLOOR) / dspan)) : 1;
    return (1 - C.CLASS_DROP) + (C.CLASS_BREAK_EDGE - (1 - C.CLASS_DROP)) * t;
  }
  if (rating < C.CLASS_MID) {
    const mspan = C.CLASS_MID - C.CLASS_PIVOT;
    const t = mspan > 0 ? (rating - C.CLASS_PIVOT) / mspan : 1;
    return C.CLASS_BREAK_EDGE + (at(C.CLASS_MID) - C.CLASS_BREAK_EDGE) * t;
  }
  if (rating > C.CLASS_FULL) {
    const uspan = C.CLASS_TOP - C.CLASS_FULL;
    const t = uspan > 0 ? Math.min(1, (rating - C.CLASS_FULL) / uspan) : 1;
    return at(C.CLASS_FULL) + C.CLASS_TOP_EDGE * t;
  }
  return at(rating);
}

/*
 * THE SAME EDGE, FADED OUT AGAINST THE BEST TEAMS ON YOUR SCHEDULE.
 *
 * The weekly edge made an elite roster win the games it should, which is what it was for,
 * but it did it against everybody equally and that is not how a season works. It also made
 * 17-0 five times more likely, because going undefeated is the one thing that needs you to
 * beat the toughest team on the schedule too, and class was helping you do exactly that.
 *
 * So the edge is what shows up on an ordinary Sunday. It is at full strength against a team
 * at or below CLASS_FOE_LOW in schedule strength, fades linearly, and is gone entirely
 * against a team at CLASS_FOE_HIGH or above.
 *
 * A schedule carries about 2.9 opponents past CLASS_FOE_LOW, keeping roughly 60% of the edge
 * between them, and about a quarter of a game past CLASS_FOE_HIGH with none of it. That is a
 * deliberately light touch on fourteen games and a heavy one on the three that decide whether
 * a season is unbeaten, which is exactly the asymmetry wanted: an average is set by the games
 * you should win, and 17-0 is set by the ones you might not.
 *
 * Measured at a 98 overall: the average record gives back a fifth of a win (14.65 to 14.46)
 * while an undefeated regular season falls by a quarter (6.92% to 5.14%) and the count of
 * perfect seasons falls by 28%. At a 91: 13.65 wins to 13.53, and 17-0 from 1.91% to 1.59%.
 *
 * A missing strength_z means an ordinary opponent, so callers with partial data get the
 * plain edge rather than a silent zero.
 */
function weeklyEdgeVs(rating, opponent, constants = CONSTANTS) {
  const edge = weeklyEdge(rating, constants);
  if (edge === 1) return 1;
  const C = constants;
  const z = opponent && typeof opponent.strength_z === 'number' ? opponent.strength_z : 0;
  const lo = C.CLASS_FOE_LOW, hi = C.CLASS_FOE_HIGH;
  if (!(hi > lo)) return edge;
  if (z <= lo) return edge;
  if (z >= hi) return 1;
  return 1 + (edge - 1) * (hi - z) / (hi - lo);
}

/*
 * THE TITLE GAME'S OPINION OF YOUR ROSTER, as a divisor on the opponent's score.
 *
 * Monotone across the whole range with exactly one neutral overall, FINAL_EDGE_PIVOT. It
 * falls steeply from there to 1 - PENALTY at FINAL_EDGE_FLOOR by way of FINAL_EDGE_BREAK,
 * and climbs from there to 1 + BONUS at FINAL_EDGE_CEIL by way of FINAL_EDGE_KNEE, which is
 * what makes each point above the pivot worth more than the last. Every segment is linear
 * because the reason for it is legible and a curve would only make the same argument less
 * clearly. See CONSTANTS.FINAL_EDGE_*.
 *
 * No rating means no opinion: callers with nothing to hand get the old neutral game.
 */
function finalEdge(rating, constants = CONSTANTS) {
  if (!(rating > 0)) return 1;
  const C = constants;
  const floorEdge = 1 - C.FINAL_EDGE_PENALTY;
  /* THE CLIFF. Everything at or under FLOOR takes the full penalty, and from there to BREAK
     the climb is steep: this is the stretch that has to read as hopeless. */
  if (rating < C.FINAL_EDGE_BREAK) {
    const span = C.FINAL_EDGE_BREAK - C.FINAL_EDGE_FLOOR;
    const t = span > 0 ? Math.max(0, Math.min(1, (rating - C.FINAL_EDGE_FLOOR) / span)) : 1;
    return floorEdge + (C.FINAL_EDGE_BREAK_EDGE - floorEdge) * t;
  }
  /* THE COMMON BAND. Most rosters land here, so it is no longer the even game it used to be:
     a 90 is behind in the final and only a 95 is level. */
  /* THE PIVOT IS NO LONGER EXACTLY EVEN, so it is read from a constant everywhere rather
     than written as a literal 1 in three places: a lift that reached one branch and not the
     others would put a step in the middle of a function whose whole claim is that it is
     monotone. */
  const pv = C.FINAL_EDGE_PIVOT_EDGE || 1;
  if (rating < C.FINAL_EDGE_PIVOT) {
    const span = C.FINAL_EDGE_PIVOT - C.FINAL_EDGE_BREAK;
    const t = span > 0 ? (rating - C.FINAL_EDGE_BREAK) / span : 1;
    return C.FINAL_EDGE_BREAK_EDGE + (pv - C.FINAL_EDGE_BREAK_EDGE) * t;
  }
  /* ABOVE THE PIVOT IT PAYS, AND THE RATE GROWS. Gentle to KNEE, then steeper to CEIL. */
  if (rating <= C.FINAL_EDGE_KNEE) {
    const span = C.FINAL_EDGE_KNEE - C.FINAL_EDGE_PIVOT;
    const t = span > 0 ? (rating - C.FINAL_EDGE_PIVOT) / span : 1;
    return pv + C.FINAL_EDGE_KNEE_BONUS * t;
  }
  const span = C.FINAL_EDGE_CEIL - C.FINAL_EDGE_KNEE;
  const t = span > 0 ? Math.min(1, (rating - C.FINAL_EDGE_KNEE) / span) : 1;
  return pv + C.FINAL_EDGE_KNEE_BONUS
    + (C.FINAL_EDGE_BONUS - C.FINAL_EDGE_KNEE_BONUS) * t;
}

/**
 * HOW MUCH THE FINAL EASES ONCE THE PERFECT SEASON IS ALREADY GONE.
 *
 * finalEdge() above reads the roster and nothing else, so a 17-0 team and a 13-4 team walked
 * into the same Super Bowl. That is defensible for a game about the perfect season -- and it
 * is also why a run that loses in week two has nothing left to play for, because the one
 * prize still available is exactly as far away as it was before.
 *
 * So: no change at all while the run is still perfect. The hardest thing in the game stays
 * the hardest thing in the game, and nobody buys an easier final by losing on purpose --
 * a loss costs the perfect season, which is worth more than this is. Past the first loss the
 * ring gets nearer, and it gets nearer fastest for the rosters that should already have been
 * winning it: a 95 that dropped two coin-flips in October is the team this is for.
 *
 * The elite half ramps from ELITE_AT to ELITE_FULL rather than switching on at 95, because a
 * cliff there would make a 94.9 and a 95.1 play visibly different finals for no reason a
 * player could see.
 *
 * Added to the edge rather than multiplied into it, so the help is the same size whether the
 * roster is being flattered or punished by finalEdge.
 */
function finalRecordEase(losses, rating, constants = CONSTANTS) {
  const C = constants;
  const n = Math.max(0, Math.floor(losses || 0));
  if (n <= 0) return 0;
  const base = Math.min(C.NOT_PERFECT_EASE_CAP, n * C.NOT_PERFECT_EASE_PER_LOSS);
  if (!(rating > 0)) return base;
  const span = C.NOT_PERFECT_EASE_ELITE_FULL - C.NOT_PERFECT_EASE_ELITE_AT;
  const t = span > 0
    ? Math.max(0, Math.min(1, (rating - C.NOT_PERFECT_EASE_ELITE_AT) / span))
    : (rating >= C.NOT_PERFECT_EASE_ELITE_AT ? 1 : 0);
  return base * (1 + (C.NOT_PERFECT_EASE_ELITE_MULT - 1) * t);
}

/**
 * Where a regular-season record leaves you.
 *
 * `opts.lateWins` is how many of the last LATE_BYE_GAMES games were won, and it is
 * only ever passed in GM mode. Given it, a hot finish earns the bye even without
 * the 15-win record — see CONSTANTS.LATE_BYE_*. The three labels are unchanged in
 * every mode, because badges and the leaderboard read them.
 *
 * `opts.rating` is the team overall, and given it an elite roster (ELITE_BYE_RATING) that
 * cleared ELITE_BYE_WINS is seeded on top too. The 15-win route is checked FIRST so a team
 * that earned the bye outright still reports byeRoute 'record'.
 */
function seedFromRecord(wins, opts = {}) {
  const byRecord = wins >= CONSTANTS.BYE_SEED_WINS;
  const byFinish = opts.lateWins != null && opts.lateWins >= CONSTANTS.LATE_BYE_WINS
    && wins >= CONSTANTS.PLAYOFF_WINS;
  const byStrength = opts.rating > 0 && opts.rating >= CONSTANTS.ELITE_BYE_RATING
    && wins >= CONSTANTS.ELITE_BYE_WINS;
  if (byRecord || byFinish || byStrength) {
    return {
      made: true, bye: true, rounds: CONSTANTS.PLAYOFF_ROUNDS_WITH_BYE, label: 'Top seed',
      /* Which route got you here, so the seeding screen can say so. */
      byeRoute: byRecord ? 'record' : (byFinish ? 'finish' : 'strength'),
    };
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
  /*
   * The hub bonus, worth about what the battery link itself is worth. See qbHubBonus.
   * One bonus per roster however many of the shapes hold.
   */
  QB_HUB: { VALUE: 0.08 },
  /*
   * THE COACH IS THE THIRTEENTH MAN ON THE CHEMISTRY BOARD. See coachLinks. Two links, both
   * provable from data already in the repo, and both worth more than the player-to-player
   * link they resemble, because a head coach is not a locker-room acquaintance:
   *
   *   coached   he was this man's head coach, that very season. Sits between teammates
   *             (0.05) and battery (0.10): stronger than having shared a room, weaker than
   *             having thrown a thousand passes to each other.
   *   college   he was the head coach at this man's school. Above the player-to-player
   *             college link (0.02) for the same reason: one of them recruited the other.
   *
   * They enter the same saturation curve as everything else, so a coach who knows four of
   * your men is worth more than one who knows two and less than twice as much.
   */
  COACH: { coached: 0.06, college: 0.03 },
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
 * CITY NAMES, and the only names that go out on a share.
 *
 * A share card and a share tweet leave this site and land somewhere we do not
 * control, so they carry the city and the club's colors and never the mascot.
 * Inside the game the nickname is still used, because the game is where a player
 * is choosing between thirty-two of them and "Miami" and "Los Angeles" do not
 * tell you which.
 *
 * PRESENT-DAY CITIES, not the city of the season drawn. A One Franchise run spans
 * 1999 to 2025 and the franchise is one thing across all of it; labeling a run
 * "Oakland" because one of the six seasons happened to be 2005 would be a claim
 * about a roster rather than about a club.
 *
 * Four franchises share a city with another, so cityLabel() adds the three-letter
 * code to exactly those and to nothing else. A code is not a mascot, and "Los
 * Angeles" alone on a share card is a real ambiguity: two clubs play there.
 */
const CITIES = {
  ARI: 'Arizona', ATL: 'Atlanta', BAL: 'Baltimore', BUF: 'Buffalo', CAR: 'Carolina',
  CHI: 'Chicago', CIN: 'Cincinnati', CLE: 'Cleveland', DAL: 'Dallas', DEN: 'Denver',
  DET: 'Detroit', GB: 'Green Bay', HOU: 'Houston', IND: 'Indianapolis', JAX: 'Jacksonville',
  KC: 'Kansas City', LAC: 'Los Angeles', LAR: 'Los Angeles', LV: 'Las Vegas', MIA: 'Miami',
  MIN: 'Minnesota', NE: 'New England', NO: 'New Orleans', NYG: 'New York', NYJ: 'New York',
  PHI: 'Philadelphia', PIT: 'Pittsburgh', SEA: 'Seattle', SF: 'San Francisco',
  TB: 'Tampa Bay', TEN: 'Tennessee', WAS: 'Washington',
};
const city = (id) => CITIES[id] || id;
/* Computed, not listed, so adding a franchise cannot leave a stale ambiguity behind. */
const SHARED_CITIES = new Set(Object.entries(
  Object.values(CITIES).reduce((m, c) => { m[c] = (m[c] || 0) + 1; return m; }, {}),
).filter(([, n]) => n > 1).map(([c]) => c));
const cityLabel = (id) => {
  const c = city(id);
  return SHARED_CITIES.has(c) ? `${c} (${id})` : c;
};

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
 * A CLUB COLOR THAT CAN CARRY TEXT ON THE DARK PAGE.
 *
 * washColor() floors a color into a range that shows as a WASH, which is a fill at
 * low opacity and a much easier job than a letterform. Its floor is lightness 0.46,
 * and measured against the page's #0b1220 that leaves several clubs under 4.5:1,
 * which is the ratio a label has to clear to be read at 10px.
 *
 * So this starts from the wash color and lifts lightness in 0.02 steps until the
 * ratio passes, hue untouched, and stops at 0.86 so nothing turns into white. Every
 * one of the thirty-two clears 4.5:1 and no hue moves.
 */
/*
 * A GRADIENT FOR A BUTTON, which is a harder problem than either of the above.
 *
 * The first attempt gradiented the two wash colors and put white or near-black on
 * top, whichever held up better. Measured, that fails: both washes are mid-tone by
 * construction, so Baltimore's purple-to-gold carried its label at 2.14:1 and there
 * was no third choice. A gradient across two mid-tones cannot hold text at all.
 *
 * So the gradient runs across ONE hue instead, dark enough that white always wins.
 * Lightness descends from the wash's own until white clears 4.5:1, and that becomes
 * the light end; the dark end is 0.12 below it, which is easier still. Hue and
 * saturation never move, so the button is unmistakably the club's color, and the
 * label is white for all thirty-two rather than picked per club.
 */
function teamButton(id) {
  const c = TEAM_COLORS[id] || ['#334155', '#64748b'];
  const { h, s, l } = hexToHsl(washColor(c[0]));
  let top = l;
  while (top > 0.14 && contrast(hslToHex(h, s, top), '#ffffff') < 4.5) top -= 0.02;
  return { a: hslToHex(h, s, top), b: hslToHex(h, s, Math.max(0.08, top - 0.12)) };
}

const INK_BG = '#0b1220';
function teamInk(id) {
  const c = TEAM_COLORS[id] || ['#334155', '#64748b'];
  let best = washColor(c[0]);
  const { h, s } = hexToHsl(best);
  for (let l = hexToHsl(best).l; l <= 0.86; l += 0.02) {
    best = hslToHex(h, s, l);
    if (contrast(best, INK_BG) >= 4.5) break;
  }
  return best;
}

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
  /* How hard team shape swings the multiplier. The shape terms are centerd on 1.0; this
     scales their combined distance from 1.0. 1.0 is the original full-strength swing; 0.5
     halves it, so a build worth +12% becomes +6% and its penalties soften to match, with
     the scheme bonus riding on top rather than under it. */
  SHAPE_STRENGTH: 0.5,
  MIN: 0.50,
  MAX: 1.18,
};

/*
 * Each detect returns a FIT in 0..1 when the roster qualifies, or -1 when it does not.
 * The fit is how far the scheme's key numbers clear their thresholds: 0 for a roster that
 * only just qualifies, 1 for one that blows past every requirement. rosterStructure turns
 * that into the bonus, 1% at fit 0 up to 3% at fit 1, so a stronger fit is worth more.
 *
 * `over(v, min, span)` is the building block: 0 at the threshold, 1 once v is `span` above
 * it. `fitAvg` averages the requirements, so a scheme is only strongly itself when all of
 * its parts are, not when one number is huge and the rest scrape by.
 */
const SCHEMES = [
  {
    key: 'greatest_show',
    name: 'Greatest Show on Turf',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 15) return -1;
      const wr = roster.filter(p => p.position === 'WR').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!wr || (wr.rec_ppg || 0) < 9) return -1;
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!rb || (rb.rec_ppg || 0) < 4) return -1;
      return fitAvg(over(qb.pass_ppg, 15, 7), over(wr.rec_ppg, 9, 6), over(rb.rec_ppg, 4, 4));
    },
    strength: 'Greatest Show on Turf. Warner, Faulk, Bruce and Holt reborn.',
  },
  {
    key: 'triplets',
    name: 'The Triplets',
    detect(roster) {
      const byPos = {};
      for (const p of roster) {
        if (p.ppr_ppg_mean >= 14) byPos[p.position] = Math.max(byPos[p.position] || 0, p.ppr_ppg_mean);
      }
      const stars = Object.values(byPos).sort((a, b) => b - a);
      if (stars.length < 3) return -1;
      return fitAvg(...stars.slice(0, 3).map(v => over(v, 14, 12)));
    },
    strength: 'The Triplets. Three stars at three positions, like the Cowboys.',
  },
  {
    key: 'wildcat',
    name: 'Wildcat',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.rush_ppg || 0) < 3.5) return -1;
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 10) return -1;
      return fitAvg(over(qb.rush_ppg, 3.5, 4), over(rb.rush_ppg, 10, 6));
    },
    strength: 'Wildcat. Two runners the defense cannot account for.',
  },
  {
    key: 'air_coryell',
    name: 'Air Coryell',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 14) return -1;
      const te = roster.filter(p => p.position === 'TE').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!te || (te.rec_ppg || 0) < 6) return -1;
      const wr = roster.filter(p => p.position === 'WR').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!wr || (wr.rec_ppg || 0) < 8) return -1;
      return fitAvg(over(qb.pass_ppg, 14, 7), over(te.rec_ppg, 6, 5), over(wr.rec_ppg, 8, 6));
    },
    strength: 'Air Coryell. The vertical game with a tight end who can beat you.',
  },
  {
    key: 'air_raid',
    name: 'Air Raid',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 13) return -1;
      const wrs = roster.filter(p => p.position === 'WR' && (p.rec_ppg || 0) >= 7)
        .sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0));
      if (wrs.length < 2) return -1;
      return fitAvg(over(qb.pass_ppg, 13, 7), over(wrs[0].rec_ppg, 7, 7), over(wrs[1].rec_ppg, 7, 7));
    },
    strength: 'Air Raid. The passing game can carry this team.',
  },
  {
    key: 'run_and_shoot',
    name: 'Run and Shoot',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 12) return -1;
      const wrs = roster.filter(p => p.position === 'WR').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0));
      if (wrs.length < 3) return -1;
      const wrFit = fitAvg(...wrs.slice(0, 3).map(w => over(w.rec_ppg, 5, 7)));
      return fitAvg(over(qb.pass_ppg, 12, 8), wrFit);
    },
    strength: 'Run and Shoot. Three wideouts and a quarterback who can find them.',
  },
  {
    key: 'west_coast',
    name: 'West Coast',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 11) return -1;
      const te = roster.filter(p => p.position === 'TE').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!te || (te.rec_ppg || 0) < 5) return -1;
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!rb || (rb.rec_ppg || 0) < 3) return -1;
      const wr = roster.filter(p => p.position === 'WR').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!wr || (wr.rec_ppg || 0) < 6) return -1;
      return fitAvg(over(qb.pass_ppg, 11, 8), over(te.rec_ppg, 5, 5), over(rb.rec_ppg, 3, 4), over(wr.rec_ppg, 6, 6));
    },
    strength: 'West Coast. Short passes, every position catches, nobody is open by accident.',
  },
  {
    key: 'ground_and_pound',
    name: 'Ground and Pound',
    detect(roster) {
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 9) return -1;
      const te = roster.filter(p => p.position === 'TE').sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      if (!te || te.ppr_ppg_mean < 7) return -1;
      return fitAvg(over(rb.rush_ppg, 9, 7), over(te.ppr_ppg_mean, 7, 8));
    },
    strength: 'Ground and Pound. The run game controls the clock.',
  },
  {
    key: 'dual_threat',
    name: 'Dual Threat',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.rush_ppg || 0) < 3.5) return -1;
      return over(qb.rush_ppg, 3.5, 6);
    },
    strength: 'Dual Threat quarterback. Defenses cannot key on one thing.',
  },
  {
    key: 'two_te',
    name: 'Two TE Set',
    detect(roster) {
      const tes = roster.filter(p => p.position === 'TE' && p.ppr_ppg_mean >= 6)
        .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean);
      if (tes.length < 2) return -1;
      return fitAvg(over(tes[0].ppr_ppg_mean, 6, 8), over(tes[1].ppr_ppg_mean, 6, 8));
    },
    strength: 'Two TE Set. Heavy personnel that can run or catch.',
  },
];

/* The scheme bonus is a range, not a flat number: 1% for a roster that only just fits its
   scheme, scaling to 3% for one that fits it strongly, with the detect's fit (0..1) sliding
   between the two. Shared by both sides of the ball so a defensive scheme is worth what an
   offensive one is worth before the mode's own arithmetic gets to it. */
const SCHEME_MIN_BONUS = 0.01, SCHEME_MAX_BONUS = 0.03;

/*
 * ─── DEFENSIVE SCHEMES ───────────────────────────────────────────────────────────────
 *
 * The same idea as the offensive schemes above and read the same way: hardest and most
 * specific first, each detect returning a fit in 0..1 or -1, the first match winning.
 *
 * WHAT THEY READ. 01-defenders.mjs splits every man's production three ways, and those
 * three columns are what tells one defense from another:
 *   rush_ppg    sacks, quarterback hits, tackles for loss    the pass rush
 *   cover_ppg   interceptions and passes defended            the coverage
 *   tackle_ppg  solos and assists                            the volume
 * A defense that gets to 50 points on sacks and a defense that gets there on tackles are
 * different teams, and until now the engine could not tell them apart.
 *
 * THE THRESHOLDS ARE PERCENTILES OF THE REAL POOL, not round numbers. Measured over
 * 16,973 player-seasons:
 *              med    p75    p90    p97
 *   DL rush    1.2    2.3    3.6    5.0
 *   LB rush    0.6    1.5    2.8    4.4
 *   LB cover   0.2    0.7    1.2    1.9
 *   LB tackle  4.3    6.7    8.6   10.3
 *   DB cover   1.1    2.0    2.8    3.9
 *   DB tackle  4.6    5.9    7.0    8.2
 * A scheme qualifies around p75 to p90 of its key column and reaches full fit near p97,
 * so signing one of the best in the league at a thing is what completes it.
 */
const DEFENSE_SCHEMES = [
  {
    key: 'steel_curtain',
    name: 'Steel Curtain',
    detect(roster) {
      const dl = roster.filter(p => p.position === 'DL')
        .sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0));
      if (dl.length < 2) return -1;
      if ((dl[0].rush_ppg || 0) < 5.0 || (dl[1].rush_ppg || 0) < 3.6) return -1;
      return fitAvg(over(dl[0].rush_ppg, 5.0, 3.0), over(dl[1].rush_ppg, 3.6, 2.0));
    },
    strength: 'Steel Curtain. Two linemen wreck the pocket and nothing else has to work.',
  },
  {
    key: 'legion_of_boom',
    name: 'Legion of Boom',
    detect(roster) {
      const db = roster.filter(p => p.position === 'DB')
        .sort((a, b) => (b.cover_ppg || 0) - (a.cover_ppg || 0));
      if (db.length < 2) return -1;
      if ((db[0].cover_ppg || 0) < 3.9 || (db[1].cover_ppg || 0) < 2.8) return -1;
      return fitAvg(over(db[0].cover_ppg, 3.9, 2.0), over(db[1].cover_ppg, 2.8, 1.5));
    },
    strength: 'Legion of Boom. A secondary that takes half the field away before the snap.',
  },
  {
    key: 'blitzburgh',
    name: 'Blitzburgh',
    detect(roster) {
      const lb = roster.filter(p => p.position === 'LB')
        .sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!lb || (lb.rush_ppg || 0) < 4.4) return -1;
      const dl = roster.filter(p => p.position === 'DL')
        .sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!dl || (dl.rush_ppg || 0) < 2.3) return -1;
      return fitAvg(over(lb.rush_ppg, 4.4, 2.5), over(dl.rush_ppg, 2.3, 2.0));
    },
    strength: 'Blitzburgh. The pressure comes from the second level and nobody blocks it.',
  },
  {
    key: 'tampa_2',
    name: 'Tampa 2',
    detect(roster) {
      const lb = roster.filter(p => p.position === 'LB')
        .sort((a, b) => (b.cover_ppg || 0) - (a.cover_ppg || 0))[0];
      if (!lb || (lb.cover_ppg || 0) < 1.9 || (lb.tackle_ppg || 0) < 6.7) return -1;
      return fitAvg(over(lb.cover_ppg, 1.9, 1.2), over(lb.tackle_ppg, 6.7, 3.6));
    },
    strength: 'Tampa 2. A linebacker who can run the seam is the whole coverage.',
  },
  {
    key: 'forty_six',
    name: 'The 46',
    detect(roster) {
      /* Pressure from everywhere rather than from one place: three men who all get
         after it, whatever level they line up at. */
      const rushers = roster.filter(p => (p.rush_ppg || 0) >= 2.0)
        .sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0));
      if (rushers.length < 3) return -1;
      return fitAvg(...rushers.slice(0, 3).map(r => over(r.rush_ppg, 2.0, 2.5)));
    },
    strength: 'The 46. Eight in the box and pressure from places nobody accounts for.',
  },
  {
    key: 'no_fly_zone',
    name: 'No-Fly Zone',
    detect(roster) {
      const db = roster.filter(p => p.position === 'DB')
        .sort((a, b) => (b.cover_ppg || 0) - (a.cover_ppg || 0));
      if (db.length < 2) return -1;
      const both = (db[0].cover_ppg || 0) + (db[1].cover_ppg || 0);
      if (both < 4.8) return -1;
      return over(both, 4.8, 3.0);
    },
    strength: 'No-Fly Zone. Throwing on this secondary is a decision you regret.',
  },
  {
    key: 'monsters',
    name: 'Monsters of the Midway',
    detect(roster) {
      const lb = roster.filter(p => p.position === 'LB')
        .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      if (!lb || lb.ppr_ppg_mean < 12.9 || (lb.tackle_ppg || 0) < 10.3) return -1;
      return fitAvg(over(lb.ppr_ppg_mean, 12.9, 3.5), over(lb.tackle_ppg, 10.3, 3.0));
    },
    strength: 'Monsters of the Midway. The best player on the field plays linebacker.',
  },
  {
    key: 'orange_crush',
    name: 'Orange Crush',
    detect(roster) {
      /* Every level above the line. Nothing spectacular anywhere and nowhere to attack. */
      const best = (pos) => roster.filter(p => p.position === pos)
        .sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      const dl = best('DL'), lb = best('LB'), db = best('DB');
      if (!dl || !lb || !db) return -1;
      if (dl.ppr_ppg_mean < 5.7 || lb.ppr_ppg_mean < 8.8 || db.ppr_ppg_mean < 8.0) return -1;
      return fitAvg(over(dl.ppr_ppg_mean, 5.7, 4.0), over(lb.ppr_ppg_mean, 8.8, 4.1),
        over(db.ppr_ppg_mean, 8.0, 2.9));
    },
    strength: 'Orange Crush. Three levels, no weak one, nowhere to attack.',
  },
  {
    key: 'sack_exchange',
    name: 'Sack Exchange',
    detect(roster) {
      const front = roster.filter(p => p.position === 'DL')
        .reduce((t, p) => t + (p.rush_ppg || 0), 0);
      if (front < 6.0) return -1;
      return over(front, 6.0, 4.0);
    },
    strength: 'Sack Exchange. The front four are the entire game plan.',
  },
  {
    key: 'bend_dont_break',
    name: 'Bend but Do Not Break',
    detect(roster) {
      /* Volume tacklers and few splash plays: everything is in front of you, and it
         stays there. Requires the tackling to be real AND the rush to be quiet, so it
         is a shape rather than a consolation prize for a roster with nothing else. */
      const tackle = roster.reduce((t, p) => t + (p.tackle_ppg || 0), 0);
      const rush = roster.reduce((t, p) => t + (p.rush_ppg || 0), 0);
      if (tackle < 30 || rush > 4) return -1;
      return fitAvg(over(tackle, 30, 12), over(4 - rush, 0, 3));
    },
    strength: 'Bend but Do Not Break. Everything is in front of you and it stays there.',
  },
];

/* The first defensive scheme that fits, same rule as the offensive list. */
function detectDefenseScheme(roster) {
  for (const s of DEFENSE_SCHEMES) {
    const fit = s.detect(roster);
    if (fit >= 0) return { key: s.key, name: s.name, fit: clamp(fit, 0, 1) };
  }
  return null;
}

/*
 * HOW A DEFENSE IS BUILT, the counterpart to rosterStructure, and deliberately a lighter
 * touch than that one for a measured reason.
 *
 * Real defenses are FLAT. Over 861 real team defenses, taking each club's six biggest
 * contributors, the two weakest average 0.85 of the roster average (offense: 0.64) and the
 * top man takes 0.21 of the unit's production, with the tenth and ninetieth percentiles at
 * 0.19 and 0.24. There is no defensive equivalent of a quarterback, so a defense cannot be
 * built around one man the way an offense can, and a shape term with the offensive one's
 * swing would be inventing a decision the sport does not offer.
 *
 * Level balance is not a term at all, though it looks like the obvious one: the roster is
 * DL, DL, LB, DB, DB and a flex, so the spread across the three levels is forced by the
 * slots before the player makes a single choice. Scoring it would be scoring the rules.
 *
 * WHAT IS LEFT IS THE FLOOR AND THE SCHEME. The floor stops stars-and-scrubs, which the
 * cap otherwise rewards here more than on offense because defensive production is so
 * compressed. The scheme is the real decision, which is why it carries the larger share.
 *
 * WHAT THIS FUNCTION BOUGHT. Before it existed, defensive rosters were so alike that the
 * engine had to raise suppression to the power 2.24 to make the draft matter at all. With
 * the schemes reading the three columns, drafted defenses now vary as much as drafted
 * offenses do (1.220 against 1.225 at the fifth and ninety-fifth percentiles), and that
 * exponent has been retired: see resolveGameDefense. The variety is real now instead of
 * manufactured, which also means a scheme is worth on defense exactly what a scheme is
 * worth on offense, no more.
 */
const DEF_STRUCTURE = {
  IDEAL_FLOOR_SHARE: 0.85,   // measured median of real team defenses
  FLOOR_TOLERANCE: 0.08,     // to p10 (0.77), so no real defense is punished
  FLOOR_WEIGHT: 0.60,
  SHAPE_STRENGTH: 0.5,
  MIN: 0.80,
  MAX: 1.12,
};

function defenseStructure(roster) {
  const S = DEF_STRUCTURE;
  const total = roster.reduce((t, p) => t + (p.ppr_ppg_mean || 0), 0);
  const n = roster.length;
  if (!n || total <= 0) {
    return { multiplier: 1, floorShare: 1, scheme: null, schemeBonus: 0, total: 0 };
  }
  const avg = total / n;
  const weakest = roster.map(p => p.ppr_ppg_mean || 0).sort((a, b) => a - b).slice(0, 2);
  const floorShare = (weakest.reduce((a, b) => a + b, 0) / weakest.length) / avg;
  /* Below the tolerance band it costs; inside it, nothing. A real defense's shape is
     never penalised, which is what the p10 anchor buys. */
  const shortfall = Math.max(0, (S.IDEAL_FLOOR_SHARE - S.FLOOR_TOLERANCE) - floorShare);
  const floor = 1 - shortfall * S.FLOOR_WEIGHT;
  const shaped = 1 + (floor - 1) * S.SHAPE_STRENGTH;

  const scheme = detectDefenseScheme(roster);
  const schemeBonus = scheme
    ? SCHEME_MIN_BONUS + (SCHEME_MAX_BONUS - SCHEME_MIN_BONUS) * scheme.fit : 0;
  const multiplier = clamp(shaped + schemeBonus, S.MIN, S.MAX);
  return {
    multiplier, floorShare, total,
    scheme: scheme ? scheme.key : null,
    schemeName: scheme ? scheme.name : null,
    schemeBonus,
  };
}

/* The first scheme in the list (hardest and most specific first) that the roster fits,
   with the fit strength that sets the size of its bonus. */
function detectScheme(roster) {
  for (const s of SCHEMES) {
    const fit = s.detect(roster);
    if (fit >= 0) return { key: s.key, name: s.name, fit: clamp(fit, 0, 1) };
  }
  return null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const over = (v, min, span) => clamp(((v || 0) - min) / span, 0, 1);
const fitAvg = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/*
 * HOW A PLAYER'S SEASON ACTUALLY ARRIVED, week to week. resolveGame draws every man's
 * game from sampleGamma(mean, sd), so two players with the same average are NOT the same
 * player: the steady one shows up every Sunday, the boom-bust one wins you a shootout and
 * loses you a Tuesday. That difference has always been in the sim; this names it so a GM
 * can trade on it.
 *
 * Cut on the coefficient of variation (sd over mean), because a 15-point man swinging +/-8
 * is wild and a 30-point man swinging +/-8 is a metronome. Thresholds are the measured
 * quartiles of every tradeable season in the pool (mean >= 6 FPPG, n=5,364): the calmest
 * quarter is STEADY, the wildest quarter is BOOM-BUST, and the middle half is just a
 * football player. Under 6 FPPG nobody gets a tag -- the waiver wire swings by nature, and
 * a chip on a 3-point man would be noise dressed as insight.
 */
const VOLATILITY = { MIN_FPPG: 6, STEADY_CV: 0.50, BOOM_CV: 0.74 };
function volatility(p) {
  const m = (p && p.ppr_ppg_mean) || 0;
  if (m < VOLATILITY.MIN_FPPG) return null;
  const cv = ((p.ppr_ppg_sd || 0)) / m;
  if (cv <= VOLATILITY.STEADY_CV) return 'steady';
  if (cv >= VOLATILITY.BOOM_CV) return 'boombust';
  return null;
}

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

  /* WHOEVER IS ACTUALLY PLAYING QUARTERBACK. A listed quarterback first, and failing that a
     two-position man who can play there, because a roster whose QB spot is filled by Taysom
     Hill has a quarterback: a bad one. Reading only p.position found nobody and floored the
     support term as though the position were empty, which is a different and wronger claim
     than "he threw for 928 yards". No roster without a two-position man changes at all. */
  const qb = roster.find((p) => p.position === 'QB')
    || roster.find((p) => positionsOf(p).includes('QB'));
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

  const scheme = detectScheme(roster);

  // Quarterback support applies to catching points only, so it is folded in as a
  // change to the effective total rather than a flat multiplier.
  const effective = sum((p) => p.pass_ppg) + rush + rec * qbSupport;
  /* The scheme bonus is a range, not a flat number: 1% for a roster that only just
     fits the scheme, scaling to 3% for one that fits it strongly. detectScheme's fit
     (0..1) is what slides it between the two. */
  const schemeBonus = scheme
    ? SCHEME_MIN_BONUS + (SCHEME_MAX_BONUS - SCHEME_MIN_BONUS) * scheme.fit : 0;

  /* TEAM SHAPE, HALF STRENGTH. The raw product of the four shape terms is centerd on 1.0
     (a perfectly average build scores 1.0; a strong QB and a clean shape push it up, the
     balance/concentration/floor penalties pull it down). Left alone it swings the rating
     hard — a great build was worth +12% on its own, which dwarfed the offensive scheme.
     SHAPE_STRENGTH scales that swing: at 0.5 the deviation from 1.0 is halved, so the same
     build is worth +6% and a penalty bites half as much, while good and bad rosters still
     separate. The scheme bonus (1–3%) then sits on top as its own signal, not buried under
     a much larger shape term. This multiplier drives both the displayed rating and the game
     sim, so the two stay one number. */
  const shape = (effective / total) * balance * concentration * Math.max(0.3, floor);
  const shapeDamped = 1 + (shape - 1) * S.SHAPE_STRENGTH;
  const multiplier = clamp(shapeDamped + schemeBonus, S.MIN, S.MAX);

  return { multiplier, qbSupport, balance, concentration, floor, floorShare,
    rushShare, topShare, qbPass, total, scheme: scheme ? scheme.key : null, schemeBonus,
    shape, shapeDamped };
}

/**
 * A coach's read on the roster, in plain words.
 *
 * Every line is tied to a number the player can check on the same screen, so this
 * explains the structure multiplier rather than decorating it.
 */
/*
 * THE COACH'S TAKE ON A DEFENSE. Its own function rather than a pile of branches inside the
 * offensive one, because almost every line differs: there is no quarterback to support, no
 * run-pass balance, and the floor sits in a completely different place (real defenses put
 * their quietest two at 0.85 of the roster average against an offense's 0.64), so an
 * offensive threshold applied here would either never fire or always fire.
 *
 * The three notes it can reach for are the three things a defense is: the rush, the
 * coverage, and the tackling underneath them.
 */
function defenseCoachReport(roster, chemistryMultiplier, spend) {
  const st = defenseStructure(roster);
  const strengths = [];
  const weaknesses = [];
  const total = roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);
  const sum = (f) => roster.reduce((t, p) => t + (p[f] || 0), 0);
  const rush = sum('rush_ppg'), cover = sum('cover_ppg'), tackle = sum('tackle_ppg');
  const chem = (chemistryMultiplier - 1) * 100;
  const last = (n) => n.split(' ').slice(-1)[0];
  const best = (f) => roster.slice().sort((a, b) => (b[f] || 0) - (a[f] || 0))[0];

  /* Thresholds are the measured pool summed over six men, not round numbers: a drafted
     front reaches about 12 a game at the very top and coverage about 8. */
  if (rush >= 7) {
    strengths.push(`${last(best('rush_ppg').name)} gets there before the throw does.`);
  } else if (rush < 2.5) {
    weaknesses.push('Nobody rushes the passer. He can wait all day.');
  }
  if (cover >= 5) {
    strengths.push(`${last(best('cover_ppg').name)} takes his half of the field away.`);
  } else if (cover < 2) {
    weaknesses.push('Nothing in coverage. Throws land whether you get home or not.');
  }
  if (tackle >= 36) strengths.push('They tackle. Nothing turns into more than it was.');
  else if (tackle < 26) weaknesses.push('Poor tacklers, so every catch is a long gain.');

  /* The floor, against the measured band for real defenses rather than the offensive one. */
  if (st.floorShare < 0.70) weaknesses.push('Two of your six barely show up in a box score.');
  else if (st.floorShare >= 0.85) strengths.push('Six contributors. Nobody to attack.');

  if (st.scheme) {
    const s = DEFENSE_SCHEMES.find((x) => x.key === st.scheme);
    if (s) strengths.push(s.strength);
  }

  if (chem >= 8) strengths.push('These players know each other, and it shows.');
  else if (chem < 1) weaknesses.push('Six strangers. Nobody has played a down together.');

  const unspent = CONSTANTS.CAP_MUSD - spend;
  if (unspent >= 20) weaknesses.push(`You left $${unspent.toFixed(0)}M unspent. That was a better player.`);
  else if (unspent <= 3) strengths.push('You used the whole budget.');

  const swing = roster.reduce((t, p) => t + p.ppr_ppg_sd, 0) / Math.max(1, total);
  if (swing > 0.52) weaknesses.push('Streaky. Big weeks, and some very quiet ones.');
  else if (swing < 0.38) strengths.push('Steady week to week, and that matters here.');

  /* Judged on what a defense is judged on: whether it holds people under. */
  let verdict;
  if (st.multiplier >= 1.02 && total >= 52) verdict = 'Nobody is scoring on this.';
  else if (st.multiplier >= 0.96 && total >= 47) verdict = 'Good enough to win a lot of games.';
  else if (total >= 42) verdict = 'Middle of the pack. It will need some luck.';
  else verdict = 'This defense will get scored on.';

  return { structure: st, strengths, weaknesses, verdict, totalFppg: total, swing };
}

function coachReport(roster, chemistryMultiplier, spend) {
  /* WHICH SIDE OF THE BALL IS READ OFF THE MEN. Six defenders can only have come from a
     defense draft, so the roster describes itself and this needs no extra argument
     threaded through every caller, including the ones rebuilding somebody else's run from
     stored picks where no mode is available to pass. */
  const isDefense = roster.length > 0
    && roster.every((p) => p.position === 'DL' || p.position === 'LB' || p.position === 'DB');
  if (isDefense) return defenseCoachReport(roster, chemistryMultiplier, spend);
  const st = rosterStructure(roster);
  const strengths = [];
  const weaknesses = [];
  const total = roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);
  const star = roster.slice().sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
  const qb = roster.find((p) => p.position === 'QB');
  const chem = (chemistryMultiplier - 1) * 100;
  const last = (n) => n.split(' ').slice(-1)[0];

  /*
   * ONE LINE EACH, AND THAT IS A LAYOUT RULE, NOT A STYLE PREFERENCE.
   *
   * These print in a panel about 300px wide at 12.5px, which is fifty characters. Every note
   * that ran over became two lines, and three two-line notes were the tallest block on a
   * screen the player had already said was too tall. Nothing below was cut to make room; the
   * sentences just say the same thing without the second clause explaining the first.
   */

  // Quarterback
  if (st.qbSupport >= 1.06) {
    strengths.push(`${qb ? last(qb.name) : 'Your quarterback'} lifts everyone he throws to.`);
  } else if (st.qbSupport <= 0.86) {
    weaknesses.push(`${qb ? last(qb.name) : 'Your quarterback'} cannot get these receivers the ball.`);
  } else if (st.qbSupport <= 0.95) {
    weaknesses.push('An ordinary quarterback holds your receivers back.');
  }

  // Balance
  if (st.rushShare < 0.13) {
    weaknesses.push('No running game, so defenses can sit on the pass.');
  } else if (st.rushShare > 0.45) {
    weaknesses.push('You run it too often to scare anybody deep.');
  } else {
    strengths.push('Run or pass, defenses have to respect both.');
  }

  // Concentration
  if (st.topShare >= 0.36) {
    weaknesses.push(`Take ${last(star.name)} away and this offense stops.`);
  } else if (st.topShare <= 0.26) {
    strengths.push('Scoring is spread around. No one man to stop.');
  }

  /*
   * Depth, which nothing in this list used to mention.
   *
   * The floor term is the largest single penalty the shape can apply, and it is the one a
   * player cannot see: three stars and three passengers keeps the top man's share near
   * ideal, so concentration says nothing and the notes said nothing either. A roster losing
   * a third of its points to the floor read as a healthy one with a bad number attached.
   * 0.36 and 0.64 are the measured figures from 848 real team-seasons, the same two the
   * penalty itself is built from.
   */
  if (st.floorShare < 0.36) {
    weaknesses.push('Two of your six barely score at all.');
  } else if (st.floorShare >= 0.64) {
    strengths.push('All six of them score. Nobody is a passenger.');
  }

  // Scheme
  if (st.scheme) {
    const s = SCHEMES.find(x => x.key === st.scheme);
    if (s) strengths.push(s.strength);
  }

  // Chemistry
  if (chem >= 8) strengths.push('These players know each other, and it shows.');
  else if (chem < 1) weaknesses.push('Six strangers. Nobody has played a down together.');

  // Money
  const unspent = CONSTANTS.CAP_MUSD - spend;
  if (unspent >= 20) weaknesses.push(`You left $${unspent.toFixed(0)}M unspent. That was a better player.`);
  else if (unspent <= 3) strengths.push('You used the whole budget.');

  // Boom or bust
  const swing = roster.reduce((t, p) => t + p.ppr_ppg_sd, 0) / Math.max(1, total);
  if (swing > 0.52) weaknesses.push('Streaky. Big weeks, and some very quiet ones.');
  else if (swing < 0.38) strengths.push('Steady week to week, and that matters here.');

  let verdict;
  if (st.multiplier >= 1.03 && total >= 60) verdict = 'A real contender.';
  else if (st.multiplier >= 0.96 && total >= 50) verdict = 'Good enough to win a lot of games.';
  else if (total >= 40) verdict = 'Middle of the pack. It will need some luck.';
  else verdict = 'This is not a playoff team.';

  return { structure: st, strengths, weaknesses, verdict, totalFppg: total, swing };
}

const SLOTS = ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
/*
 * ONE MAP FOR BOTH SIDES OF THE BALL. The defense draft's slots are DL, LB and DB, and
 * none of those names collide with QB, RB, WR or TE, so they simply live here too and
 * fillsSlot needs no idea which mode it is in.
 *
 * FLEX IS THE UNION, which is the only name that appears in both rosters. It is safe
 * because a board only ever offers one side's players: an offensive run's wheel draws
 * from player_seasons and a defensive run's from defender_seasons, so a FLEX spot can
 * only ever be shown men from its own pool. Splitting it into FLEX and D_FLEX would mean
 * branching on mode at every eligibility question in the game to buy nothing.
 */
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  DL: ['DL'], LB: ['LB'], DB: ['DB'],
  FLEX: ['RB', 'WR', 'TE', 'DL', 'LB', 'DB'],
};

/* The defense draft's roster: two up front, one at linebacker, two in the secondary, one
   free. Six spots, the same as the offense, so every count in the game is unchanged. */
const DEFENSE_SLOTS = ['DL', 'DL', 'LB', 'DB', 'DB', 'FLEX'];
/* The tabs a defensive draft board shows, in the order a defense is listed. */
const DEFENSE_POSITIONS = ['DL', 'LB', 'DB'];

/*
 * ─── MEN WHO PLAYED TWO POSITIONS ───────────────────────────────────────────────────
 *
 * The data gives every player-season exactly one position, because nflverse gives every
 * player one position. For almost everybody that is the truth. For a handful it is not:
 * Taysom Hill is listed at tight end for seasons in which he started games at quarterback,
 * and the game would not let you play him there.
 *
 * So these player-seasons carry a SECOND position, and every eligibility question in the
 * game answers yes to both. The first position stays primary: it is what the card shows
 * first, and crucially it is what the PRICE was computed against, since price is value over
 * that position's replacement level. Nothing about the money moves.
 *
 * That pricing detail is also why this cannot be exploited in the direction you would
 * expect. Hill's 2020 season costs $11.9M because 9.8 points a game is a fine tight end.
 * As a quarterback 9.8 is dreadful, and he is priced as though he were good, so playing him
 * at quarterback is a real decision with a real cost rather than a loophole. The same holds
 * for Deebo Samuel at running back.
 *
 * THE BAR FOR BEING ON THIS LIST is that the player genuinely lined up as a regular at both
 * positions that season. Not a gadget snap, not a trick pass. Plenty of men clear a
 * statistical filter without clearing this one: Antwaan Randle El and Mohamed Sanu threw
 * more career passes than some backups, Tavon Austin and Percy Harvin and Tyreek Hill's
 * rookie year all carried the ball a lot, Brad Smith took Wildcat snaps for the Jets. All of
 * them were a wide receiver who did something else occasionally, which is a different thing
 * from a second job, and none of them are here.
 *
 * Keyed by player_id so a rebuild of player_seasons.json cannot silently drop it.
 */
const DUAL_POSITIONS = [
  {
    /* Taysom Hill, the whole reason this list exists. Listed TE by nflverse throughout,
       started games at QB in 2020 and 2021, threw passes in most of the others, and lined
       up at tight end, quarterback and running back in the same game more than once. */
    player_id: '00-0033357', name: 'Taysom Hill', add: 'QB',
    seasons: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  },
  {
    /* Terrelle Pryor, 2013 only, and this one is a mislabel rather than a hybrid: he was
       Oakland's STARTING QUARTERBACK that season, 1,798 passing yards, and caught nothing.
       nflverse files him at receiver because that is what he became three years later. His
       2016 receiving season is left alone, because by then it was true. */
    player_id: '00-0028825', name: 'Terrelle Pryor', add: 'QB', seasons: [2013],
  },
  {
    /* Deebo Samuel, the wide back. Eight rushing touchdowns in 2021, more than most starting
       running backs had, off real carries out of the backfield rather than end-arounds. */
    player_id: '00-0035719', name: 'Deebo Samuel Sr.', add: 'RB', seasons: [2021, 2022, 2023],
  },
  {
    /* Ty Montgomery, converted from receiver to running back in the middle of 2016 and
       played there. Still listed WR. */
    player_id: '00-0032200', name: 'Ty Montgomery', add: 'RB', seasons: [2016, 2017, 2018],
  },
  {
    /* Cordarrelle Patterson's Atlanta years, where he was the lead back and a receiver in
       the same offense. Listed RB, so the second position is the receiver half. */
    player_id: '00-0030578', name: 'Cordarrelle Patterson', add: 'WR', seasons: [2021, 2022],
  },
];

/* player_id|season -> the second position. Built once; the list above is the source. */
const DUAL_BY_KEY = new Map();
for (const d of DUAL_POSITIONS) {
  for (const season of d.seasons) DUAL_BY_KEY.set(`${d.player_id}|${season}`, d.add);
}

/**
 * Every position a player-season may be played at, primary first.
 *
 * One-element array for almost everybody, so callers can treat this as the general case
 * without paying for it. Tolerates a missing player_id or season, which the archetype
 * builders in the harness rely on.
 */
function positionsOf(player) {
  if (!player || !player.position) return [];
  const second = player.player_id != null && player.season != null
    ? DUAL_BY_KEY.get(`${player.player_id}|${player.season}`) : undefined;
  return second && second !== player.position ? [player.position, second] : [player.position];
}

/** Can this player-season be played in this drafted slot? The one eligibility question. */
function fillsSlot(slot, player) {
  const allowed = SLOT_ELIGIBILITY[slot];
  if (!allowed) return false;
  const positions = positionsOf(player);
  for (const pos of positions) if (allowed.includes(pos)) return true;
  return false;
}

/** 'TE' for almost everybody, 'TE/QB' for the two-position men. For labels and badges. */
function positionLabel(player) {
  return positionsOf(player).join('/');
}

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
function pairLinks(a, b, ctx, opts) {
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
  } else if (a.franchise && a.franchise === b.franchise && !(opts && opts.sameClub)) {
    /*
     * TWO LINKS ARE OFF IN ONE FRANCHISE MODE, this one and the coach link below.
     *
     * A link is supposed to be a reason to prefer one signing over another. This
     * one fires on every pair of a One Franchise roster whatever you do, so it rewards
     * nothing and cannot be lost: fifteen pairs at 0.03 is 0.45 raw, and the
     * saturation curve turns that into +14.25%, which is the +15% ceiling for
     * practical purposes. Measured across 796 One Franchise drafts the mean was
     * +14.3% and the largest +14.6%, against +2.2% in free play. Chemistry was
     * not a decision in that mode, it was a constant.
     *
     * WHAT IS LEFT IS EARNED. Two men out of the SAME SEASON of that club are
     * still teammates and a quarterback who really threw to that receiver is
     * still a battery, and both of those cost you: one of your six draws has to
     * go on a second man from one year. College, draft class and family are
     * untouched. Measured with both suppressed, One Franchise chemistry comes out at
     * a mean of +3.1% with a median of +1.9%, against +2.2% and +1.9% in free
     * play, and a third of rosters get none at all in either mode. It is the
     * same game again rather than a bonus for turning up.
     */
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
  /*
   * OFF IN ONE FRANCHISE MODE FOR THE SAME REASON AS THE FRANCHISE LINK, and the
   * measurement is what settled it rather than the argument. Suppressing only the
   * franchise link left the coach link firing 2,433 times across 796 One Franchise
   * drafts, 76% of every link in the mode, because a club with one long-serving
   * head coach connects almost any two of its years: New England came out at
   * +11.8% mean chemistry and Washington at +4.7%, which is not a decision either
   * player made. Twenty years of Belichick is the same team wearing a different
   * date.
   */
  if (ca && cb && ca === cb && !(opts && opts.sameClub)) {
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
/**
 * `opts.sameClub` says every man on this roster plays for the same club because
 * the mode said so, which suppresses the franchise link. See pairLinks.
 */
/*
 * ─── THE QUARTERBACK AS A HUB ────────────────────────────────────────────────────────
 *
 * Everything above is pairwise, and pairwise cannot see the one arrangement football talks
 * about more than any other: a quarterback with a rapport with his receiving corps. Two
 * unrelated links to the same man are worth exactly what two links between anybody are, so
 * the passer's central role scored as nothing special. This pays for the SHAPE.
 *
 * Two shapes, and one bonus however many hold, because a roster does not get paid twice for
 * one idea:
 *
 *   both_wrs  the quarterback is connected to two of your wide receivers
 *   rb_and_te the quarterback is connected to your back and your tight end
 *
 * Read by POSITION, not by roster slot: a receiver in the flex is still a receiver, and the
 * Trade Machine only carries one WR slot, so a slot reading would have made the first shape
 * impossible in that mode.
 *
 * ANY positive link counts, not only battery. A quarterback and receiver who were teammates,
 * came out of the same draft, went to the same school or are brothers all have a reason to be
 * on the same page; restricting this to men who literally threw to each other would have made
 * a rare thing rarer.
 *
 * AND IT IS RARE. Measured over 3,600 drafts before it was built: the first shape lands in
 * 0.7-1.0% of rosters, the second in 0.3-1.0%, and a player deliberately chasing links gets
 * to about 3%. It is deliberately a jackpot rather than a routine bonus -- the draw rules
 * allow at most two men from one team-season, so a passer and two of his targets can never
 * come from a single year and the link has to be assembled across seasons. What makes it
 * worth having anyway is that the draft board already prices every option's chemistry swing,
 * so a GM one link away can see it and go and get it.
 *
 * The bonus runs through the same saturation curve as everything else rather than sitting
 * outside it, which means it is worth most to a roster that has little else going on and
 * least to one already near the ceiling. That is the behavior every other link has here.
 */
function qbHubBonus(roster, links) {
  const V = CHEMISTRY.QB_HUB;
  if (!V || !V.VALUE) return null;
  const qb = roster.find((p) => p.position === 'QB');
  if (!qb) return null;
  /* Who the quarterback is positively connected to, by name, which is how links report. */
  const linked = new Set();
  for (const l of links) {
    if (!l || (l.value || 0) <= 0) continue;
    if (l.a === qb.name) linked.add(l.b);
    else if (l.b === qb.name) linked.add(l.a);
  }
  if (linked.size < 2) return null;
  const at = (pos) => roster.filter((p) => p !== qb && p.position === pos && linked.has(p.name));
  const wrs = at('WR');
  const rb = at('RB');
  const te = at('TE');
  let names = null, label = null, shape = null;
  if (wrs.length >= 2) {
    shape = 'both_wrs';
    names = [wrs[0].name, wrs[1].name];
    label = `${lastWord(qb.name)} has a connection with both receivers`;
  } else if (rb.length >= 1 && te.length >= 1) {
    shape = 'rb_and_te';
    names = [rb[0].name, te[0].name];
    label = `${lastWord(qb.name)} has a connection with the back and the tight end`;
  }
  if (!shape) return null;
  return {
    type: 'qb_hub', shape, value: V.VALUE,
    a: qb.name, b: names.join(' and '),
    label, short: shape === 'both_wrs' ? 'Both his receivers' : 'His back and tight end',
  };
}

/* The last word of a name, for a label that says "Manning" rather than "Peyton Manning"
   inside a sentence that already names two other players. */
const lastWord = (name) => String(name || '').trim().split(/\s+/).pop();

function resolveChemistry(roster, ctx, opts) {
  /* CHEMISTRY DOES NOT CROSS THE LINE OF SCRIMMAGE, and only Full Team has a line for it to
     cross. Every other mode drafts one side of the ball, so every pair in the roster is on
     the same unit and this rule costs nothing to apply.
     Here it is the difference between a link that means something and one that does not.
     Chemistry in this game is "these two have played together and it shows": a battery is a
     quarterback and the receiver he threw to, the hub bonus is a quarterback with men he
     knows. A cornerback and a left tackle who happened to share a locker room never took a
     snap together, and pricing that as though they combine is the same category error as
     rating a defense with rosterStructure. */
  const split = !!(opts && opts.twoSided);
  const sideOf = (p) => DEFENSE_POSITIONS.indexOf(p.position) >= 0;
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      if (split && sideOf(roster[i]) !== sideOf(roster[j])) continue;
      const best = pairLinks(roster[i], roster[j], ctx, opts)[0];
      if (best) links.push({ ...best, a: roster[i].name, b: roster[j].name,
        side: sideOf(roster[i]) ? 'def' : 'off' });
    }
  }
  /* THE QUARTERBACK AS A HUB, on top of the pairs. See CHEMISTRY.QB_HUB. */
  /* The hub counts a quarterback's connections, and it is built from `links`, which is
     already free of cross-side pairs. Passing only his own unit as well, so the count of
     "men he knows" cannot be inflated by a roster that merely has twelve men in it. */
  const hub = qbHubBonus(split ? roster.filter((p) => !sideOf(p)) : roster, links);
  if (hub) links.push({ ...hub, side: 'off' });
  /* THE COACH, on top of both. See coachLinks. Only Full Team hires one, and only Full Team
     splits, so this rides on the same flag rather than inventing a second one. */
  if (split && opts.coach) {
    const byName = {};
    for (const p of roster) byName[p.name] = p;
    for (const l of coachLinks(roster, ctx, opts.coach)) {
      const man = byName[l.b];
      links.push({ ...l, side: man && sideOf(man) ? 'def' : 'off' });
    }
  }

  /* ONE UNIT'S CHEMISTRY IS ITS OWN. Skipping the cross-side PAIRS was only half the rule:
     a single roster-wide multiplier still handed the defence whatever the offence earned,
     so a quarterback and his receiver were quietly making the cornerbacks better. Each side
     now saturates its own links and multiplies its own points, which is what resolveGameFull
     applies and what fullStrength rates. The one-sided modes take the old path untouched. */
  const fold = (ls) => {
    const positives = ls.filter((l) => l.value > 0).sort((a, b) => b.value - a.value);
    const negatives = ls.filter((l) => l.value < 0);
    const raw = positives.reduce((s, l) => s + l.value, 0);
    const saturated = CHEMISTRY.MAX * (1 - Math.exp(-raw / CHEMISTRY.MAX));
    // Penalties never diminish and are applied after saturation, so a negative
    // always costs its full face value.
    const penalties = negatives.reduce((s, l) => s + l.value, 0);
    const net = Math.max(CHEMISTRY.MIN, Math.min(CHEMISTRY.MAX, saturated + penalties));
    return { raw, saturated, net, links: positives.concat(negatives) };
  };

  if (!split) {
    const all = fold(links);
    return { multiplier: 1 + all.net, raw: all.raw, saturated: all.saturated, net: all.net,
      links: all.links };
  }

  const o = fold(links.filter((l) => l.side !== 'def'));
  const d = fold(links.filter((l) => l.side === 'def'));
  return {
    /* The headline number is the average of the two, because that is what the team is
       carrying: quoting the folded whole-roster figure would print a multiplier no side of
       the ball actually plays with. */
    multiplier: 1 + (o.net + d.net) / 2,
    offMultiplier: 1 + o.net,
    defMultiplier: 1 + d.net,
    raw: o.raw + d.raw,
    saturated: (o.saturated + d.saturated) / 2,
    net: (o.net + d.net) / 2,
    offNet: o.net,
    defNet: d.net,
    links: o.links.concat(d.links).sort((a, b) => b.value - a.value),
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

/*
 * Week order.
 *
 * This used to be a constraint solver. The old division formula produced each rival twice as
 * an adjacent pair, so it had to force the two meetings MIN_REMATCH_GAP weeks apart and keep
 * a division game late in the year. None of that has a referent now: opponents are unique and
 * drawn at random, so there are no rematches to space out and no division games to save for
 * the end. A straight shuffle is the honest implementation rather than a gutted solver.
 */
function orderSchedule(games, rng) {
  const out = games.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A 17-game schedule of historic team-seasons.
 *
 * In free play there is no favorite club, so the schedule is drawn from the
 * whole 1999-2025 pool at random: one season per franchise, no repeats.
 *
 * In ONE FRANCHISE MODE (opts.franchise set) the schedule mirrors a real NFL
 * regular season: each of the three divisional rivals appears twice (two
 * different seasons drawn from that rival's history, 6 games total) and the
 * remaining 11 come from the rest of the league. You never play your own
 * franchise. The two meetings with a rival are spaced at least four weeks
 * apart, the way a real schedule keeps division rematches from clustering.
 *
 * Both paths share the same normalization gate: the total strength must land
 * near the league mean, and no more than `maxElite` elite opponents, so one
 * player does not draw four all-time greats while another gets a soft
 * seventeen.
 */
function generateSchedule(data, rng, opts = {}) {
  const tolerance = opts.tolerance ?? 0.05;
  const maxElite = opts.maxElite ?? 4;
  const maxAttempts = opts.maxAttempts ?? 400;
  const count = opts.games ?? 17;

  const era = opts.era ?? null;
  const src = era ? eraSlice(data, era) : data;
  const { byFranchise, divisions, eliteThreshold, meanScheduleStrength } = src;
  const franchise = opts.franchise ?? null;

  if (franchise) {
    return generateFranchiseSchedule(
      byFranchise, divisions, franchise, eliteThreshold, meanScheduleStrength,
      rng, tolerance, maxElite, maxAttempts, count);
  }

  const franchises = Object.keys(byFranchise);

  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const used = new Set();
    const unordered = [];
    let guard = 0;
    while (unordered.length < count && guard++ < 500) {
      const f = franchises[Math.floor(rng() * franchises.length)];
      if (used.has(f)) continue;
      used.add(f);
      const pool = byFranchise[f];
      unordered.push(pool[Math.floor(rng() * pool.length)]);
    }
    const ordered = orderSchedule(unordered, rng);
    const total = ordered.reduce((sum, g) => sum + g.strength_z, 0);
    const elite = ordered.filter((g) => g.strength_z >= eliteThreshold).length;
    const drift = Math.abs(total - meanScheduleStrength);
    const ok = drift <= Math.abs(meanScheduleStrength * tolerance) + tolerance * count
      && elite <= maxElite;
    if (ok) return { games: ordered, total, elite, attempts: attempt + 1 };
    if (!best || drift < best.drift) best = { games: ordered, total, elite, drift, attempts: attempt + 1 };
  }
  return { games: best.games, total: best.total, elite: best.elite, attempts: maxAttempts,
    relaxed: true };
}

/**
 * One Franchise schedule: 6 divisional games (each rival twice) + 11 random.
 *
 * The two draws from each rival are always different seasons, and the eleven
 * non-division opponents each come from a different franchise, none of which
 * is the player's own club.
 */
function generateFranchiseSchedule(
    byFranchise, divisions, franchise, eliteThreshold, meanScheduleStrength,
    rng, tolerance, maxElite, maxAttempts, count) {
  const div = Object.entries(divisions)
    .find(([, members]) => members.includes(franchise));
  const rivals = div ? div[1].filter((f) => f !== franchise) : [];
  const nonDivFranchises = Object.keys(byFranchise)
    .filter((f) => f !== franchise && !rivals.includes(f));
  const nonDivCount = count - rivals.length * 2;

  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const unordered = [];

    for (const r of rivals) {
      const pool = byFranchise[r];
      const a = Math.floor(rng() * pool.length);
      let b = Math.floor(rng() * (pool.length - 1));
      if (b >= a) b++;
      unordered.push(pool[a], pool[b]);
    }

    const used = new Set();
    let guard = 0;
    while (unordered.length < count && guard++ < 500) {
      const f = nonDivFranchises[Math.floor(rng() * nonDivFranchises.length)];
      if (used.has(f)) continue;
      used.add(f);
      const pool = byFranchise[f];
      unordered.push(pool[Math.floor(rng() * pool.length)]);
    }

    const ordered = orderFranchiseSchedule(unordered, rivals, rng);
    const total = ordered.reduce((sum, g) => sum + g.strength_z, 0);
    const elite = ordered.filter((g) => g.strength_z >= eliteThreshold).length;
    const drift = Math.abs(total - meanScheduleStrength);
    const ok = drift <= Math.abs(meanScheduleStrength * tolerance) + tolerance * count
      && elite <= maxElite;
    if (ok) return { games: ordered, total, elite, attempts: attempt + 1 };
    if (!best || drift < best.drift) best = { games: ordered, total, elite, drift, attempts: attempt + 1 };
  }
  return { games: best.games, total: best.total, elite: best.elite, attempts: maxAttempts,
    relaxed: true };
}

/**
 * Shuffle with a rematch gap: divisional opponents who appear twice are kept
 * at least MIN_REMATCH_GAP weeks apart so the schedule reads like a real
 * season rather than back-to-back division games.
 */
function orderFranchiseSchedule(games, rivals, rng) {
  const MIN_REMATCH_GAP = 4;
  for (let attempt = 0; attempt < 200; attempt++) {
    const out = games.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    let ok = true;
    for (const r of rivals) {
      const idxs = [];
      for (let i = 0; i < out.length; i++) {
        if (out[i].franchise === r) idxs.push(i);
      }
      if (idxs.length === 2 && Math.abs(idxs[0] - idxs[1]) < MIN_REMATCH_GAP) {
        ok = false;
        break;
      }
    }
    if (ok) return out;
  }
  return games.slice();
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

function generatePlayoffs(data, rng, opts = {}) {
  const count = opts.count ?? CONSTANTS.PLAYOFF_ROUNDS_WILD_CARD;
  const era = opts.era ?? null;
  if (era) return generateEraPlayoffs(data, rng, era, count);
  if (opts.contenders) return generateContenderPlayoffs(data, rng, count);

  const ladder = [pickFrom(data.goodPool, rng), pickFrom(data.greatPool, rng),
    data.byId(LEGEND_IDS.PATRIOTS_2007), data.byId(LEGEND_IDS.DOLPHINS_1972)];
  return ladder.slice(ladder.length - Math.min(count, ladder.length));
}

/*
 * GM mode's bracket: four real playoff teams, no legends. See CONSTANTS.
 *
 * The last CONTENDER_BRACKET_ELITE_ROUNDS rungs come from the top decile by
 * strength, so the two games that decide a title are against the best seasons in
 * the data rather than the best seasons ever played. The elite filter falls back
 * to the whole great pool if the data were ever sliced thin enough to empty it.
 */
/*
 * GM mode's bracket is built to LENGTH, not sliced from a fixed four.
 *
 * The legends ladder is sliced off the front because a bye must never let you skip
 * the Dolphins. Applied here that was backwards: the last two rungs were both
 * top-decile draws, so slicing the front meant the reward for the #1 seed was
 * skipping the WEAKEST team and then playing both of the strongest — the opposite
 * of a real bracket, where the top seed hosts the lowest remaining seed. Measured,
 * that made the bye worth less than nothing: 1.8% of byes won the title against
 * 3.3% of wild cards.
 *
 * So the rungs are generated for the number of rounds actually being played. The
 * final is always a top-decile season; the opener is the weakest team in; anything
 * between comes from the ordinary playoff field. A bye removes one middle round,
 * which is exactly what a bye does.
 */
function generateContenderPlayoffs(data, rng, count) {
  const elite = data.greatPool.filter((t) => t.strength_z >= data.eliteThreshold);
  const top = elite.length ? elite : data.greatPool;
  const pools = [];
  for (let i = 0; i < count; i++) {
    pools.push(i === count - 1 ? top : (i === 0 ? data.goodPool : data.greatPool));
  }
  return drawLadder(pools, rng, count);
}

function generateEraPlayoffs(data, rng, era, count) {
  const src = eraSlice(data, era);
  return drawLadder([src.goodPool, src.greatPool, src.greatPool, src.greatPool], rng, count);
}

/*
 * One team per rung, NEVER THE SAME TEAM TWICE.
 *
 * The era ladder drew three times from one pool and could hand you the 2013 Broncos
 * in the Divisional round and again in the Conference Championship, which reads as a
 * bug even though the sim plays it happily. Both generated ladders come through here
 * so neither can regrow the problem. The draw falls back to allowing a repeat only if
 * a pool is too thin to avoid one, which no shipped pool is.
 */
function drawLadder(pools, rng, count) {
  const ladder = [];
  const seen = new Set();
  for (const pool of pools) {
    let t = null;
    for (let tries = 0; tries < 40 && !t; tries++) {
      const c = pickFrom(pool, rng);
      if (!seen.has(c.team_season_id)) t = c;
    }
    t ??= pickFrom(pool, rng);
    seen.add(t.team_season_id);
    ladder.push(t);
  }
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
function resolveGame(roster, chemistryMultiplier, opponent, leagueAvgAllowed, rng, constants = CONSTANTS, advantage = 1) {
  /* The per-man samples are kept, not just their sum, so a game can be shown as a box
     score afterwards. Collecting them changes no rng call and no arithmetic, so every
     existing seed plays out exactly as before. */
  const samples = [];
  let raw = 0;
  for (const p of roster) {
    const s = sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);
    samples.push(s);
    raw += s;
  }

  const C = constants.CONSISTENCY || 0;
  if (C > 0) {
    const expected = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
    raw = raw * (1 - C) + expected * C;
  }

  // Structure is read from the roster itself, so no caller can forget to apply it.
  const structure = rosterStructure(roster).multiplier;
  const defenseModifier = opponent.pts_allowed_mean / leagueAvgAllowed;
  const yourScore = raw * chemistryMultiplier * structure * defenseModifier;

  const oppScore = sampleGamma(opponent.pts_scored_mean, opponent.pts_scored_sd, rng) * constants.SCALE / advantage;

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;   // overtime coin flip

  /* WHAT EACH MAN CONTRIBUTED, and it adds up. Every sample takes the same CONSISTENCY
     blend and the same three multipliers the team total takes, so the column sums to
     yourScore exactly rather than approximately: sum(s*(1-C) + mean*C) is raw by
     construction, and raw * teamMul is the score. */
  const teamMul = chemistryMultiplier * structure * defenseModifier;
  const lines = samples.map((v, i) => (v * (1 - C) + roster[i].ppr_ppg_mean * C) * teamMul);

  return { won, yourScore, oppScore, defenseModifier, lines };
}

/*
 * THE DEFENSE DRAFT, the same game from the other side of the ball.
 *
 * resolveGame above is: your six men score, the opponent's defense modifies what they
 * score, and the opponent scores whatever that team really scored. This is the mirror
 * of it, term for term:
 *
 *   yourScore = a LEAGUE AVERAGE offense, still modified by the opponent's defense
 *   oppScore  = what that team really scored, modified by YOUR defense
 *
 * You do not draft an offense in this mode, so you are given the league's, and the only
 * thing your roster touches is how much the other team scores. A perfect season here is
 * twenty-one weeks of holding people under, which is what a defense is for.
 *
 * SUPPRESSION IS A RATIO, AND THE FOUR KNOBS ARE CALIBRATED TO ONE TARGET: a drafted
 * defense should have the same shot at a good season and a title as a drafted offense.
 * That target is measured, not eyeballed, by playing thousands of full seasons a side and
 * comparing the outcomes that matter to a player: how often you reach the playoffs, how
 * often you win a playoff game, how often you win it all.
 *
 * The first version balanced the wrong thing. It matched the SPREAD of team ratings across
 * drafts (defenseStructure and a gentle exponent got the fifth-to-ninety-fifth ratio to
 * 1.220 against the offense's 1.225) and stopped there. But a matched rating spread with a
 * defense's naturally compressed win distribution still produced almost no twelve-win
 * seasons, and its overall could not pass ~88, below every playoff-edge threshold. The
 * result was a mode you could not win a playoff game in: zero titles in 22,000 seasons.
 *
 * The four knobs together fix that:
 *   DEF_POWER (1.8)     the steepness that lets an elite defense pull far enough clear of
 *                       the pack to string playoff wins together, widening the win
 *                       distribution to match the offense's.
 *   DEF_REF (36.1)      set so the MEDIAN drafted defense (raw ~34) allows about league
 *                       average, which keeps the scorelines realistic while the steeper
 *                       curve does the separating.
 *   DEF_SUPPRESS_MAX    a cap so the worst defense is bad, not winless: a pure power law
 *                       explodes for a scrap-heap roster in a way the offense floor never
 *                       does, because a bad offense still steals a couple of games.
 *   DEF_OFFENSE_SCALE   your undrafted offense is a shade below average, so a merely-decent
 *                       defense is a losing team the way a merely-decent offense is. Without
 *                       it a neutral defense plus a free league-average offense is a coin
 *                       flip, and the mode is softer in the middle than the draft it mirrors.
 *
 * The overall map (above defenseOverall) is the fifth knob: it labels a top defense high
 * enough to be handed the elite seeding and title-game edge, which suppression alone, capped
 * below that tier, could never reach.
 *
 * Re-derive against the offense outcome distribution, do not nudge, if the pool, the pricing
 * curve, the schemes or the offense mode ever move. */
function defenseSuppression(defenseTotal, constants = CONSTANTS) {
  const ref = constants.DEF_REF, k = constants.DEF_POWER;
  if (!(defenseTotal > 0)) return 1;
  /* Capped so the worst defense is bad, not hopeless. A pure power law explodes for a low
     total (a scrap-heap defense lets the other team score several times normal and goes
     winless), which offense's bottom never does: a bad offense still steals a couple of
     games. The cap is the most a weak defense lets the opponent run up, and it is what lets
     DEF_POWER be steep enough to separate the good defenses at the top without turning the
     bottom into an automatic zero. */
  return Math.min(constants.DEF_SUPPRESS_MAX || Infinity, Math.pow(ref / defenseTotal, k));
}

/*
 * A DEFENSE'S TEAM OVERALL, ON THE SAME 0 TO 100 SCALE AN OFFENSE'S IS ON.
 *
 * THE PROBLEM. Team overall is points times chemistry times shape. On offense that product
 * runs about 3 to 95, so the number doubles as its own percentage and the bands sit at 75
 * and 50. IDP scoring is a smaller currency, so the identical product on a defense tops out
 * near 55: a perfectly drafted defense could not reach the green band, and worse, it could
 * not reach the tier the rest of the season is decided in. weeklyEdgeVs, seedFromRecord,
 * playoffShare and finalEdge all read the overall against offense thresholds (CLASS_FLOOR
 * 84, ELITE_FLOOR 95, FINAL_EDGE_PIVOT 95). A defense that never passed 88 got no class edge,
 * no bye, and the full title-game penalty, so the mode was unwinnable past the wild card.
 *
 * THE MAP is a curve through three anchors that matter, by raw defense total: the median
 * drafted defense (~34) grades where the median offense does (~48); a well-drafted one (~48)
 * reads ~80, the same green a well-drafted offense reads, so "took the best on every board"
 * means the same thing on both sides; and a near-perfect one (~55) reaches ~95, which is the
 * whole point, because that is where the elite seeding and a winnable Super Bowl live. Below
 * the first pair it runs to the origin; above the last it KEEPS GOING at the same slope.
 *
 * IT USED TO CLAMP AT 100, and that was wrong in a way that only showed on one line. An
 * offense overall is an unbounded product: the best six the pool allows reads about 150. The
 * defense map was the only side with a ceiling, so every defense strong enough to pass the
 * top anchor printed the same 100.0 no matter how much better it was. A drafted defense never
 * gets near it (400 wheel drafts top out around 74), but the BEST POSSIBLE squad on the
 * results screen is not a drafted one, and that comparison line was reading a flat 100.0 for
 * defenses that were not equally good. Extrapolating instead of clamping keeps the two sides
 * on the same footing: neither has a cap, and a better defense reads higher.
 *
 * NOT USED FOR SUPPRESSION. How many points a defense allows is the RAW total against DEF_REF
 * in resolveGameDefense. This is the grade and the seeding input, nothing else. The win
 * parity itself is bought by the suppression curve and DEF_OFFENSE_SCALE, measured against
 * the offense season-win distribution; this map only makes sure a top defense is LABELLED
 * high enough to be handed the edge that suppression alone cannot reach.
 */
const DEF_OVERALL_MAP = [
  [10.0, 11.0], [18.0, 32.0], [34.0, 48.0],
  [48.0, 80.0], [52.0, 89.0], [55.0, 95.0],
];
function defenseOverall(defenseTotal) {
  if (!(defenseTotal > 0)) return 0;
  const m = DEF_OVERALL_MAP;
  if (defenseTotal <= m[0][0]) return Math.max(0, m[0][1] * defenseTotal / m[0][0]);
  for (let i = 1; i < m.length; i++) {
    if (defenseTotal <= m[i][0]) {
      const [x0, y0] = m[i - 1], [x1, y1] = m[i];
      return y0 + (y1 - y0) * (defenseTotal - x0) / (x1 - x0);
    }
  }
  const [x0, y0] = m[m.length - 2], [x1, y1] = m[m.length - 1];
  return y1 + (y1 - y0) * (defenseTotal - x1) / (x1 - x0);
}

/** The overall of a roster as drafted, either side of the ball, in one place. */
/*
 * ─── WHAT A FULL TEAM IS WORTH, ON A SCALE THAT MEANS SOMETHING ────────────────────
 *
 * THE OLD NUMBER WAS TWO DIFFERENT QUANTITIES AVERAGED TOGETHER. The offensive half was
 * points times three multipliers, which is unbounded and ran past 120 on a good roster; the
 * defensive half was defenseOverall, which is mapped into 0 to 100. Averaging them is adding
 * a distance to a percentage: the result had no ceiling, no floor, and no meaning, and a
 * team rated 120 could lose because the rating was mostly saying "your offence is large".
 *
 * A RATING SHOULD ANSWER ONE QUESTION: how close is this to the best team I could have
 * drafted. So it is measured as expected point margin against a league-average opponent,
 * which is the thing that decides seasons, and then placed on the line between the worst
 * legal roster and the best one:
 *
 *   0    the cheapest twelve men in the game, and the coach who makes them worse
 *   100  the best roster the cap can buy, the best coach, and the chemistry to go with it
 *
 * Both ends are MEASURED, by solving for them, and both are stated below so they can be
 * checked. Nothing here is a guess and nothing is a constant somebody liked the look of.
 */
const OPP_PTS_NEUTRAL = 22.08;   // mean pts_scored_mean over every team season

/**
 * The two halves of a full team's week, against a league-average opponent: what it would
 * score and what it would allow. Everything below is built out of these two numbers, so
 * there is one place that knows how a full team is valued rather than three that agree
 * until somebody edits one of them.
 */
function fullParts(roster, chemistryMultiplier, coach, constants = CONSTANTS) {
  const { off, def } = splitSides(roster);
  if (!off.length || !def.length) return { scored: 0, stops: 0, allowed: 0 };
  const eff = coachEffect(coach);
  const t = constants.FULL_TALENT === undefined ? FULL_TALENT : constants.FULL_TALENT;
  const offPts = off.reduce((a, p) => a + p.ppr_ppg_mean, 0) * t * eff.off;
  const defPts = def.reduce((a, p) => a + p.ppr_ppg_mean, 0) * t * eff.def;
  const scored = offPts * chemOff(chemistryMultiplier) * rosterStructure(off).multiplier;
  /* WHAT THE DEFENCE PRODUCES, before it is turned into what the opponent scores. The two
     are not interchangeable and the ratings below need this one: suppression is capped, so
     every defence past a certain badness collapses onto the same `allowed`, and a rating
     built on that reports a quarter of all careless drafts as exactly the same defence. */
  const stops = defPts * chemDef(chemistryMultiplier) * defenseStructure(def).multiplier;
  return {
    scored,
    stops,
    allowed: OPP_PTS_NEUTRAL * constants.SCALE * defenseSuppression(stops, constants),
  };
}

/** Expected margin per game against a league-average opponent. The raw scale. */
function fullStrength(roster, chemistryMultiplier, coach, constants = CONSTANTS) {
  const p = fullParts(roster, chemistryMultiplier, coach, constants);
  return p.scored - p.allowed;
}

/*
 * ─── EACH UNIT ON ITS OWN MODE'S SCALE, AVERAGED, AND THEN THE COACH ────────────────
 *
 * A rating has to answer the question printed above it. "Offense" has to mean how good the
 * offence is, "Defense" how good the defence is, and "Team overall" what those two come to
 * together, because that is what anybody reading three numbers will assume.
 *
 * THIS GAME ALREADY HAS BOTH OF THOSE SCALES and they are the ones players have been reading
 * for two modes. An offence is worth what overallOf scores it in the offence draft: points a
 * game, times chemistry, times how the six fit. A defence is worth what defenseOverall
 * scores it in the defence draft, which puts a unit whose fantasy points sum to a fraction
 * of an offence's onto the offence's own 0 to 100 line, off measured percentiles. That
 * function exists precisely so the two sides of the ball can be compared, so Full Team
 * should use it rather than invent a third scale.
 *
 *   offense  = what these six would rate in the offence draft
 *   defense  = what these six would rate in the defence draft
 *   team     = the average of the two, then the coach's lift on top
 *
 * TWO EARLIER VERSIONS INVENTED THAT THIRD SCALE and both read wrong, in opposite
 * directions, and both are worth writing down because the failure is not obvious either
 * time. Splitting the team's point margin in half made "averaged" an exact identity but
 * forced both units to share one span 50/50, and the two do not have equal reach: over 400
 * realistic drafts the offence ran a median 74 against the defence's 61. Giving each unit
 * its own solved floor and ceiling fixed that gap but left four constants nobody could
 * check, all of which had to be re-solved after any change to the data.
 *
 * THE TALENT DIAL IS IN, and it has to be. Full Team scales both sides' output by
 * FULL_TALENT, so six men here do not produce what the same six produce in their own mode.
 * Rating them without it describes a unit that never takes the field: measured, it put a
 * 9-8 team at 87 and left almost every roster in the game reading as elite, which also
 * walks the seeding and the weekly edge into thresholds meant for a top team. Same formula,
 * same scale, applied to what these men actually produce in this mode.
 *
 * THE COACH IS A LIFT ON THE TEAM, not a term inside each unit. It is the average of his two
 * tilts, so a coach who is +8.2% offense and +6.4% defense is worth +7.3% to the team. His
 * two tilts are shown separately wherever he is, because most coaches pull the two ways at
 * once and one number cannot say which half he is helping. What DOES move the unit ratings
 * when you hire him is his chemistry with your players, which is a fact about the roster and
 * belongs in the roster's numbers.
 *
 * Measured over 400 seasons: correlation with regular-season wins 0.890, against 0.878 for
 * the point margin the engine plays out and 0.875 for the version this replaces. The median
 * gap between the two units is 1.1 points on realistic drafts and 0.6 on careful ones. It is
 * the most legible version and also the most predictive, which does not usually happen.
 */
function fullSideRatings(roster, chemistryMultiplier, coach, constants = CONSTANTS) {
  const { off, def } = splitSides(roster);
  if (!off.length || !def.length) return { off: 0, def: 0, coachBoost: 1, overall: 0 };
  const t = constants.FULL_TALENT === undefined ? FULL_TALENT : constants.FULL_TALENT;
  const o = off.reduce((a, p) => a + p.ppr_ppg_mean, 0) * t
    * chemOff(chemistryMultiplier) * rosterStructure(off).multiplier;
  const d = defenseOverall(def.reduce((a, p) => a + p.ppr_ppg_mean, 0) * t
    * chemDef(chemistryMultiplier) * defenseStructure(def).multiplier);
  const eff = coachEffect(coach);
  const coachBoost = (eff.off + eff.def) / 2;
  /* The units are left alone: a great one passes 100 in its own mode too, and saying so is
     the point. The headline is clamped because it is the number runs are compared by. */
  return { off: o, def: d, coachBoost,
    overall: Math.max(0, Math.min(100, (o + d) / 2 * coachBoost)) };
}

function fullOverall(roster, chemistryMultiplier, coach, constants) {
  return fullSideRatings(roster, chemistryMultiplier, coach, constants).overall;
}

function overallOf(roster, chemistryMultiplier, isDefense, coach) {
  const pts = roster.reduce((t, p) => t + p.ppr_ppg_mean, 0);
  /* Full Team may hand this the two-sided chemistry object; every other mode hands it a
     number. chemSide reads both, so the one-sided branches below stay arithmetic. */
  const chem = chemSide(chemistryMultiplier, 'multiplier');
  /* 'full' rather than true or false, because a full team has two ratings and one number
     has to stand for both. A bare boolean could not say so: passing false scores twelve men
     through the offensive reading and hands a $110M defense to rosterStructure, which is
     the 0.57-for-everybody failure resolveGameDefense documents, and passing true does the
     mirror of it. Anything that is not the string is still read as the old boolean, so every
     existing caller means what it always meant. */
  if (isDefense === 'full') {

    /* ONE NUMBER, ON THE LINE BETWEEN THE WORST AND BEST DRAFTABLE TEAM. See fullOverall
       above for why the old mean of two incompatible halves had to go.
       The coach is in it, which is both correct and what lets the coach screen preview the
       hire: he changes what the team scores and allows, so a rating without him describes a
       team that never takes the field. */
    /* The WHOLE chemistry value, not the flattened one above: the two units are rated with
       their own multipliers, so handing this the average would rate a team nobody built. */
    return fullOverall(roster, chemistryMultiplier, coach);
  }
  return isDefense
    ? defenseOverall(pts * chem * defenseStructure(roster).multiplier)
    : pts * chem * rosterStructure(roster).multiplier;
}

function resolveGameDefense(roster, chemistryMultiplier, opponent, leagueAvgAllowed,
  rng, constants = CONSTANTS, advantage = 1) {
  /* Your defenders' own production, sampled the same way the offense mode samples its
     skill players, so a defender has a good week and a bad week like anyone else. */
  const samples = [];
  let raw = 0;
  for (const p of roster) {
    const s = sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);
    samples.push(s);
    raw += s;
  }
  const C = constants.CONSISTENCY || 0;
  if (C > 0) {
    const expected = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
    raw = raw * (1 - C) + expected * C;
  }
  /* NO STRUCTURE MULTIPLIER HERE, and this is the one place the mirror breaks on purpose.
     rosterStructure is an OFFENSIVE reading of a roster: it scores quarterback support,
     the pass and rush balance, and skill-position archetypes like the triplets. Run it on
     six defenders and it finds no quarterback, no passing share and no receiving share,
     and returns about 0.57 for every defense ever drafted. Measured, that penalty alone
     put the mode at 1.5 wins a season and 50.9 points allowed a game: a flat 43% tax
     dressed up as roster construction.

     defenseStructure IS THAT ANALOGUE, written against the three columns 01-defenders.mjs
     ships per man: the pass rush, the coverage and the tackling. It is a lighter touch than
     the offensive one because real defenses are flatter than real offenses (see its own
     comment for the 861 team-seasons that say so), and most of what it carries is the
     scheme rather than the shape, because the scheme is where the decision is. */
  const structure = defenseStructure(roster).multiplier;
  const defenseTotal = raw * chemistryMultiplier * structure;

  /* THE OPPONENT'S OFFENSE, held down by yours. advantage divides here exactly as it
     divides in resolveGame: home field and the late-season class edge make the other
     team score less, whichever mode you are in. */
  const suppression = defenseSuppression(defenseTotal, constants);
  const oppScore = sampleGamma(opponent.pts_scored_mean, opponent.pts_scored_sd, rng)
    * constants.SCALE * suppression / advantage;

  /* YOUR OFFENSE, WHICH YOU DID NOT DRAFT, AND WHICH IS NOT LEAGUE AVERAGE. An all-defense
     team is not a .500 team with a coin-flip offense: it is a team that wins low-scoring
     games and loses when its defense cracks. DEF_OFFENSE_SCALE holds your offense a notch
     below average so a merely-decent defense has a losing record, the way a merely-decent
     offense does in the main mode. Without it a defense that allows a realistic ~24 points
     still wins about half its games off a free average offense, which makes the mode softer
     in the middle than the draft it is meant to mirror. The scores it produces are the
     13-10, 16-9 games a defense-first team actually plays. */
  const yourScore = sampleGamma(leagueAvgAllowed, leagueAvgAllowed * constants.DEF_OFFENSE_SD,
    rng) * constants.SCALE * (opponent.pts_allowed_mean / leagueAvgAllowed)
    * (constants.DEF_OFFENSE_SCALE || 1);

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;

  /* WHAT EACH MAN CONTRIBUTED. On offense the column sums to the score; here it cannot,
     because the score is not a sum of your men. It sums to the defensive total instead,
     which is the thing they actually built together, and the box score says so. */
  const teamMul = chemistryMultiplier * structure;
  const lines = samples.map((v, i) => (v * (1 - C) + roster[i].ppr_ppg_mean * C) * teamMul);

  return { won, yourScore, oppScore, defenseModifier: suppression, defenseTotal, lines };
}

/*
 * ─── FULL TEAM'S CAP, AND WHY IT IS NOT THE OTHER MODES' ───────────────────────────
 *
 * THE SHARED PRICE LIST DOES NOT SURVIVE BEING SPLIT TWELVE WAYS. Drafting the best
 * affordable man every pick, at the $170M the balance sweep first landed on:
 *
 *                       offense, $140M over 6      full team, $170M over 12
 *   mean percentile             71.5                        37.8
 *   roster in bottom quartile    13%                         56%
 *   men at the price floor      0.5 of 6                   6.2 of 12
 *
 * Only 2% of the pool is priced at the floor, so six floor men on a roster is not the pool
 * being cheap, it is the budget forcing it. Every roster was one star and eleven bodies.
 *
 * A MODE-SPECIFIC PRICE CURVE WAS TRIED AND MEASURED AND IT FAILED. Compressing the range,
 * lifting the floor from $3M to $6M and pulling the ceiling from $48M to $26M, was meant to
 * make stars affordable without adding purchasing power. It made the mode worse: the middle
 * of the field collapsed from a 58.8% win rate to 23.4%, because doubling the floor doubles
 * what the eight ordinary men on a roster cost and only the very best play could absorb it.
 * That is recorded here so it is not tried again.
 *
 * The reason no price curve can work is that affordability and strength are the same lever.
 * A roster is only strong because of who is on it, so anything that lets you buy better men
 * also makes the team better, and the cap sweep had already fitted the strength.
 *
 * SO THEY ARE SPLIT INTO TWO LEVERS. The cap is set where the ROSTER looks like a football
 * team, and FULL_TALENT scales what that roster is worth on the field so the mode still sits
 * beside the other two. At $280M a full team carries 2.3 floor men instead of 6.2 and its
 * mean man is a 66th percentile player instead of a 38th.
 *
 * Both are measured. Re-run simulator.js --fullteam after touching either. Where they stand
 * today, 400 seasons a row, against the offense mode printed beside them:
 *
 *                    win%    med rec   playoffs   title   rating
 *   careless         8.8%      1-16       0.0%    0.0%      37.0
 *   mid             55.8%       9-8      15.0%    1.0%      63.8
 *   optimal         81.3%      14-3      92.3%    6.8%      81.4
 *   (offense mode: careless 25.0%, mid 60.8%, optimal 80.8%)
 *
 * CARELESS PLAY IS PUNISHED HARDER HERE THAN IN THE OTHER TWO MODES, and that is the mode
 * rather than a mis-fit. Offense mode hands you a league-average defense and defense mode
 * hands you an offense; draft both badly and there is nothing left to carry you, so a bad
 * full team allows 1.5x what an average one does AND scores half. The rating says so before
 * the season starts, which is the point of putting it on a scale that means something.
 */
const FULL_CAP_MUSD = 280;

/*
 * ─── THE THREE YEAR DEAL ────────────────────────────────────────────────────────────
 *
 * One roster carried through three real NFL seasons.
 *
 * THE MODE EXISTS BECAUSE OF WHAT THIS GAME'S ATOM IS. Everywhere else a franchise mode
 * has to invent aging: a curve, a random roll, a progression system somebody tuned. Here
 * the atom is a player-SEASON, so ageing is not a model at all. Draft Marshall Faulk's
 * 2000 and the following winter he becomes Marshall Faulk's 2001, whose numbers are
 * whatever they actually were, priced at whatever that year is actually worth. Nothing to
 * tune and nothing to defend, because none of it is invented.
 *
 * WHAT THE DATA ALREADY SAYS, measured over all 26,397 player-seasons, by what a man cost:
 *
 *   tier            gone next year   worse   better   median change   median new price
 *   star $36M+            12%         64%     14%         -2.3            $32M
 *   good $24-36M          13%         55%     20%         -1.4            $23M
 *   solid $12-24M         21%         40%     28%         -0.5            $16M
 *   cheap $3-12M          38%         19%     31%         +0.5            $ 7M
 *
 * That is a dynasty curve: decline at the top, lottery tickets at the bottom, and men
 * disappearing out of both ends. 22.3% of $40M men are gone or under $20M a year later;
 * 1.0% of $3-12M men are worth $30M+. 67.6% of all rows have a next season to age into and
 * 1,924 players have a five-year unbroken stretch, so three years is comfortably inside
 * what the pool can carry.
 *
 * THE CALENDAR IS THE THING THAT MOVES, and that is what changes the wheel. Every other
 * mode spins a year AND a club, and the freedom of the year is the whole point: 2000 Faulk
 * beside 2019 Lamar Jackson. Here the year is the LEAGUE year, fixed, so the wheel spins
 * clubs alone and the offseason is what advances the calendar. A dynasty walks forward
 * through real NFL history, drafting out of the league as it actually was that autumn.
 * There are about 349 skill players and 629 defenders in a season across 32 clubs, so a
 * club-only wheel still offers about eleven men a spin.
 *
 * NOTHING IN THE LIVE GAME REACHES ANY OF THIS YET. It is measured by
 * simulator.js --dynasty and gated to named accounts by dynasty-access.js.
 */
/*
 * ─── THE OWNER, AND HOW LONG HE GIVES YOU ───────────────────────────────────────────
 *
 * A dynasty is not a fixed number of seasons. It is as many as you can keep the job for,
 * and the score is how many that turned out to be: one integer, which ranks itself, and
 * which lets somebody stop after any season with their run already banked. That last part
 * matters more than it sounds. A three-season commitment is twenty-five minutes before you
 * have a score; this is five minutes a season with a number that is already yours.
 *
 * THE BAR CLIMBS AND THE OWNER IS PATIENT ONCE.
 *
 *   season 1   8 wins        season 4   11 wins
 *   season 2   9 wins        season 5+  12 wins, which is the playoffs
 *   season 3  10 wins
 *
 * Miss your bar two seasons RUNNING and you are done. One bad year is a bad year; two in a
 * row is a pattern, which is how football actually treats it. So the mode opens as "have a
 * winning season" and becomes "make the playoffs every year, forever", and nobody is ever
 * fired after their first season.
 *
 * MEASURED, not chosen. Seven rules were played to the firing, 200 dynasties each, against
 * four winter strategies. Seasons survived by the best and worst of those strategies:
 *
 *   rule                       worst    best    fired in year 1   rode to the 25 stop
 *   make the playoffs, always    1.2     1.4          79.0%              0.0%
 *   10 wins, always             1.7     3.4          52.5%              0.0%
 *   9 wins, always              2.5     5.4          36.0%              0.5%
 *   climbing bar, no patience   2.1     3.8          27.5%              0.0%
 *   playoffs, two in a row      2.7     4.5           0.0%              0.5%
 *   9 wins, two in a row        5.7    12.8           0.0%              6.5%
 *   THIS ONE                    4.0     9.5           0.0%              3.0%
 *
 * Demanding the playoffs every year fires four players in five after their FIRST season,
 * which is a mode nobody plays twice. A flat nine-win bar with two strikes goes the other
 * way: the crude bot's median run is thirteen seasons and 6.5% of them ride the safety stop,
 * so there is nothing left for a human to be better at. This rule sits between them, and
 * the bot's best strategy lasts 2.4 times as long as its worst, which is the room a person
 * needs to visibly outplay it.
 */
const DYNASTY_MAX_SEASONS = 25;

/*
 * ─── THE SCORE ─────────────────────────────────────────────────────────────────────
 *
 * Every other mode on this site is ranked on a rating, a number between 0 and 100 that says
 * how good the roster was. The Gauntlet is not that shape. It is a run, it ends when you are
 * fired, and the thing worth bragging about is how far you got and what you did on the way,
 * so it is scored the way an arcade cabinet scores: points, named bonuses, and a multiplier
 * that grows the longer you stay alive.
 *
 * SEASON N PAYS N TIMES. That is the whole multiplier and it is deliberately blunt: your
 * fourth season is worth four times your first, so a run's total is roughly quadratic in
 * seasons survived. The effect is that surviving dominates the score, which is correct,
 * because surviving is the mode. Wins inside a season then break the tie between two people
 * who lasted the same number of years.
 *
 * The parts are named rather than folded into one number, because an arcade score that
 * cannot be read as a list of things you did is just a rating with more digits.
 *
 * REGULAR-SEASON WINS ONLY in the wins line. run.outcome.wins counts playoff games too, and
 * paying 1,000 for a divisional round win and then 2,500 again for the same game is the kind
 * of double count nobody notices until the leaderboard looks wrong.
 */
const GAUNTLET_POINTS = {
  WIN: 1000,          // per regular-season win
  OVER_BAR: 500,      // per win clear of what the owner asked for
  PLAYOFF_WIN: 2500,  // per playoff game won
  TITLE: 10000,
  UNDEFEATED: 10000,  // 17-0 in the regular season, title or not
  PERFECT: 25000,     // undefeated AND the title, on top of both
};

/**
 * Score one season. Takes the plain facts rather than a run, so the page, the checker and
 * the leaderboard all read the same function and nothing has to build a run to ask.
 *
 * `seasonNo` counts from 1 and is the multiplier.
 */
function gauntletSeasonScore(s) {
  const P = GAUNTLET_POINTS;
  const wins = Math.max(0, s.wins || 0);
  const parts = [];
  if (wins) parts.push({ key: 'wins', label: `${wins} win${wins === 1 ? '' : 's'}`, points: wins * P.WIN });
  const over = Math.max(0, wins - (s.bar || 0));
  if (over) {
    parts.push({ key: 'over', label: `${over} clear of the owner`, points: over * P.OVER_BAR });
  }
  const po = Math.max(0, s.playoffWins || 0);
  if (po) {
    parts.push({ key: 'playoffs', label: `${po} playoff win${po === 1 ? '' : 's'}`, points: po * P.PLAYOFF_WIN });
  }
  if (s.titleWon) parts.push({ key: 'title', label: 'Champions', points: P.TITLE });
  if (s.undefeatedRegular) parts.push({ key: 'undefeated', label: 'Undefeated', points: P.UNDEFEATED });
  if (s.perfect) parts.push({ key: 'perfect', label: 'Perfect season', points: P.PERFECT });
  const base = parts.reduce((t, p) => t + p.points, 0);
  const mult = Math.max(1, s.seasonNo || 1);
  return { parts, base, mult, total: base * mult };
}

/** Every season added up, which is what the run is ranked on. */
function gauntletRunScore(history) {
  return (history || []).reduce((t, h) => t + (h.score || 0), 0);
}

/*
 * ─── WHAT THE OWNER WANTS, AND WHY IT SITS STILL FOR A WHILE ────────────────────────
 *
 * The Gauntlet is six careers running at once. Every man ages into his own next real
 * season, a man drafted at his last one is gone in the spring, and the run ends the first
 * time you miss. What it needed was a target that a player could hold in his head, and
 * that means one that does not move every year.
 *
 * So it is flat for a stretch and then goes up a win. The stretch is the mode's rhythm: a
 * run of seasons you can settle into, a step you can see coming, and a milestone every
 * time you clear one.
 */
const DYNASTY_BASE_WINS = 8;

/*
 * HOW OFTEN THE TARGET GOES UP. It was a formality and it is not one any more, and that
 * change is worth the space because the reason is somewhere else in this file.
 *
 * It was 27 when a run walked the calendar and a lap of it was the goal, then 10 when the
 * clock moved to the player and a mode that never ended was the risk. Freezing the cap took
 * that risk away: with the salary ratchet in, nothing in sixty runs reached season
 * twenty-five, and every candidate step landed within half a season of every other
 * (+1 every 27 gave 5.1 seasons, every 6 gave 4.6, and this one 5.0). Ten was kept because
 * it cost nothing and still closed the door.
 *
 * THEN THE CONTRACT WAS LOCKED, and the step became the only thing holding the door at all.
 * See dynastySalary: a man is now on the deal he signed at the draft forever, payroll stops
 * climbing, and a run lasts about twice as long. 80 runs, 30 seasons deep, one life, scored
 * offline against one set of locked seasons so no rule gets a luckier board:
 *
 *   rule                  seasons mean / median    reach 10   reach 25
 *   THIS ONE, 8 +1/10       10.1        10            51%         3%
 *   8, +1 every 6            8.6         8            39%         0%
 *   8, +1 every 5            7.9         7            31%         0%
 *   8, +1 every 4            7.4         7            24%         0%
 *   8, +1 every 3            6.8         6            21%         0%
 *   9, +1 every 10           6.2         5            23%         1%
 *   10, +1 every 10          3.7         3             6%         0%
 *
 * For scale, the ratcheted mode at this same rule measured 6.0 mean, median 5, 23% reaching
 * season ten. So "9 wins, +1 every 10" reproduces the old difficulty almost exactly, and
 * "8 wins, +1 every 3" gets close while keeping eight as the opening number.
 *
 * TEN IS KEPT ON PURPOSE AND NOT BY DEFAULT. Locking the contract was asked for as a game
 * design change, not as a difficulty change, and the mode being twice as long is the
 * mechanic working: a roster that holds its value is supposed to last. Anybody tightening
 * this should move THIS constant rather than DYNASTY_BASE_WINS, because eight is on the
 * front page, on the squad screen, on the season screen and in the rules sheet, and the
 * step is on none of them.
 */
const DYNASTY_STEP_SEASONS = 10;

/*
 * AND THE TARGET ITSELF IS EIGHT, which is where it has been all along and now means
 * something quite different.
 *
 * A growing cap paid for the roster getting older, so a competent manager won 12.7 games a
 * season forever and eight was a formality. With the cap fixed at $140M the ratchet closes:
 * wins run 11.1 in season one and then 9.4, 9.1, 9.3, 9.1, payroll pins at $133M of $140M
 * from season five onward, and the team you field gets worse every year because the room to
 * replace anybody is the room you free by letting somebody go.
 *
 *   target   seasons: mean / median   reach 10   reach 25
 *   flat 7     8.0 / 6                 28%         3%
 *   THIS ONE   5.1 / 4                 10%         0%
 *   flat 9     3.3 / 3                  0%         0%
 *
 * A MEDIAN OF FOUR IS WHERE THIS MODE WAS ALWAYS TRYING TO SIT. The first version of this
 * comment said so in as many words, back when it was aiming at it with a rising bar and a
 * growing cap and hitting eight instead. It gets there now off the mechanic rather than off
 * the number: you lose because your men got old, which is the mode.
 *
 * The bot drafts best-available inside a budget and releases whoever is worth less than half
 * what he is paid. A person who reads the offseason should beat it.
 */
/* Wins needed in a given season, counting from 1. */
function dynastyWinBar(season, stepEvery) {
  const step = Math.floor(Math.max(0, Math.max(1, season) - 1)
    / (stepEvery || DYNASTY_STEP_SEASONS));
  return DYNASTY_BASE_WINS + step;
}

/**
 * Whether the run goes on, given every season so far, newest last. Each entry needs only
 * `wins`.
 *
 * ONE LIFE. Miss the year's target and the run is over, which is the whole of the
 * structure: every season is a door and you either open it or you do not. It used to be
 * two misses in a row, a rule that needed a paragraph to state and a sentence on screen
 * that nobody read the same way twice ("on notice", "miss again and you are out").
 *
 * AGAINST ITS OWN SEASON'S TARGET, which matters now that the target moves: a run that
 * cleared eight in season nine is not retroactively failed when season eleven asks nine.
 */
function dynastySurvives(history, stepEvery) {
  if (!history || !history.length) return true;
  const n = history.length;
  return history[n - 1].wins >= dynastyWinBar(n, stepEvery);
}

/*
 * AND A MAN YOU RELEASE DOES NOT COME BACK. A rule rather than a convenience: a contract is
 * locked at what you paid, so without it every winter holds a free exploit, which is to cut
 * your declining $40M star and re-sign the same man off the wheel at the $32M he is now
 * worth. That is exactly the renegotiation a locked deal exists to forbid. Once he has
 * played for you he is out of your pool for the rest of the dynasty, whatever season he
 * would be drawn from.
 */


/*
 * ─── THE THREE RULES A WINTER RUNS ON ───────────────────────────────────────────────
 *
 * 1. YOU PAY WHAT YOU DRAFTED HIM FOR, FOR AS LONG AS YOU HAVE HIM. It is a contract, and
 *    the contract does not move. He improves and you still pay the old number, which is the
 *    reward. He declines and you still pay the old number, which is the bill. Release him
 *    and the number goes with him; sign somebody new and you pay what that man is worth
 *    today.
 *
 * 2. YOU OPEN MONEY BY RELEASING PEOPLE, AND YOU DO NOT GET ALL OF IT. Three quarters of
 *    his deal comes back. The last quarter stays on your books as dead money you cannot
 *    spend on anybody. A man who leaves on his own costs you nothing: the difference is
 *    that one of those was your decision. See DYNASTY_DEAD_SHARE.
 *
 * 3. THE CAP IS A SIGNING GATE, NOT A CEILING. Go over it and nothing happens: the roster
 *    is legal and it plays. You simply cannot sign anybody until you are back under.
 *
 * RULE 1 HAS HAD THREE ANSWERS AND THIS IS THE THIRD. All three are written down because
 * the two that lost were each losing for a reason worth keeping.
 *
 * THE FIRST WAS NO RULE AT ALL: a salary was re-read off the price list every winter, so it
 * fell when he declined. Price in this pool tracks value, so an ageing roster got CHEAPER
 * every year. Measured at twelve men and $280M, payroll ran $279M, $266M, $261M, the gate
 * never came within $14M of closing, and STANDING PAT WAS THE BEST STRATEGY IN THE GAME:
 * 29.7 three-year wins against 29.6, 29.5 and 29.3 for the three strategies that actually
 * manage a roster. A winter in which doing nothing is optimal has no decision in it.
 *
 * THE SECOND WAS THE RATCHET: max(what you pay, what he is worth now). It fixed that, and
 * at 6% cap growth it measured
 *
 *                        year 1        year 2        year 3     three-year   titles
 *   stand pat          9.8  25% PO   7.3   7% PO   7.4   7% PO      24.6      0.3%
 *   release on value   9.8  25% PO   9.8  31% PO  10.6  37% PO      30.2      1.7%
 *
 * five and a half wins between managing the roster and refusing to. But a ratchet is only
 * half a contract. It charges you for a man getting better, which no real deal does, so the
 * one thing a franchise mode is supposed to reward, finding a cheap young player before
 * anybody else, paid nothing: his price simply followed him up and you were back where you
 * started. Every road led to renting whoever was best this year.
 *
 * THE THIRD IS THE ONE HERE. The number you signed is the number you pay. It keeps
 * everything the ratchet was protecting, because a declining man on his old deal is still
 * an overpaid veteran, and it adds the half the ratchet was throwing away: a 24 year old
 * signed at $9M who becomes a $40M player is $31M of cap you did not have to spend.
 *
 * WHAT IT COSTS, MEASURED. 100 runs, 30 seasons deep, same seeds, same bot, one life at
 * eight wins with a win more every ten seasons:
 *
 *                          seasons survived      wins a season    roster worth
 *                          mean  median  best    s3    s10        s3     s10
 *   ratchet                 6.0     5     19     9.2    9.1      $121M  $118M
 *   locked at draft price   9.9     9     30    10.5   10.9      $130M  $128M
 *
 * A run lasts about twice as long, and the reason is visible in the last column: under the
 * ratchet a roster's VALUE bled away while its cost did not, and under a lock the men who
 * improve hold the line for the men who do not. That is the mode working as intended and
 * it is also a real difficulty cut, so the bar is where any correction belongs. The sweep
 * over (base, step) lives beside DYNASTY_STEP_SEASONS.
 *
 * DOES IT ACTUALLY PAY TO DRAFT YOUNG? That was the point of the change, so it was measured
 * rather than assumed. 80 runs, same seeds, same bar, four drafting bots:
 *
 *   best available on the wheel            10.1 seasons, median 10, drafted at 27.1
 *   younger of two comparable men          10.9              10                26.0
 *   youngest of the top third of the board  7.1               6                24.7
 *   cheapest of the top third               3.3               2                26.9
 *
 * READ THAT SECOND ROW AND THEN THE THIRD. Taking the younger man when two are within a
 * point and a half of each other is worth most of a season, so the incentive is real. Going
 * down in quality to get a younger man costs three seasons, and going down in price costs
 * seven. Under one life you have to survive season one before any of this pays, and a
 * cheaper roster does not.
 *
 * So the lock rewards age as a TIE BREAK and not as a strategy, which is the right shape:
 * it gives the draft a second question without making the first one wrong.
 *
 * WHAT WAS TRIED AND DROPPED. An earlier design had multi-year terms at a discount and dead
 * money on a man who left mid-deal. Measured, the four term strategies landed within noise
 * of each other, so term was not a decision, and the apparatus is gone. A locked price does
 * the same job in one number and nobody has to sign anything.
 *
 * The second argument is what the market says he is worth now. It is no longer part of the
 * answer and is kept because every caller has it and the screen needs it beside the answer:
 * the gap between the two IS the state of your roster.
 */
function dynastySalary(currentSalaryMusd, _marketPriceMusd) {
  return currentSalaryMusd || 0;
}

/*
 * ─── WHAT A RELEASE COSTS ────────────────────────────────────────────────────────────
 *
 * Cutting a man returns three quarters of his deal. The last quarter is dead money: it sits
 * against your cap and buys nothing, for the rest of the run.
 *
 * WHY IT EXISTS. Measured across 120 runs, a winter that took four or five men off you cost
 * a quarter of a win the following season, and one that took all six cost nothing at all.
 * Losing people was free, and so was cutting them, so the winter had one move in it and no
 * price on that move: release whoever looked worst, sign the best man the wheel offered,
 * repeat. Every roster converged on the same roster.
 *
 * A DEPARTURE STILL COSTS YOU NOTHING, AND THAT ASYMMETRY IS THE WHOLE POINT. Retiring,
 * running out of seasons and signing elsewhere are things done to you, and charging for
 * them would be charging for a dice roll. Cutting a man is a decision, and a decision is
 * the only thing a game may charge for.
 *
 * IT ALSO GIVES THE DRAFT ITS TEETH BACK. An expensive man you regret is now expensive
 * twice: once while you keep him and once when you stop. That is what makes a contract a
 * commitment rather than a subscription, and it is the counterweight the mode lost when
 * salaries stopped ratcheting.
 *
 * THE TWO NUMBERS WERE SWEPT RATHER THAN CHOSEN. A dead-money rule changes what a bot can
 * afford mid-draft, so unlike a win bar it cannot be scored offline against one set of
 * seasons: every rule was played, 80 runs each, same seeds, 30 seasons deep, one life.
 *
 *   rule                     seasons mean / median   reach 10   dead at s5 / s10 / s20
 *   nothing dead              10.1        10            51%      $0M  /  $0M  /  $0M
 *   15% dead, forever          8.7         9            46%      $6M  / $13M  / $26M
 *   THIS ONE, 25% forever      7.1         7            25%     $10M  / $20M  / $38M
 *   40% dead, forever          6.1         5            19%     $17M  / $30M  / $52M
 *   25%, expiring after 1 yr   9.0         9            48%      $3M  /  $1M  /  $3M
 *   25%, expiring after 2 yrs  9.2         9            45%      $5M  /  $4M  /  $5M
 *   25%, expiring after 3 yrs  8.6         8            38%      $7M  /  $7M  /  $7M
 *
 * READ THE BOTTOM THREE FIRST, because they are the ones that settle the design. A charge
 * that expires is barely a rule, and the reason is in their last column: it plateaus. One,
 * two or three seasons of life all park at a handful of millions and stay there forever,
 * because what expires each winter is about what the next cut adds. Nothing accumulates, so
 * nothing closes in, and the run lands within a season or two of free cuts. The cost has to
 * persist to be a cost, which is also what "dead money you cannot spend" plainly means to
 * anybody reading it.
 *
 * A QUARTER IS THE NUMBER THAT SPLITS THE DIFFERENCE. Free cuts ran 10.1 seasons and the
 * old ratcheted economy ran 6.0, so a quarter lands at 7.1: the mode keeps the length that
 * locking the contract bought it and gives back most of the pressure that locking it took
 * away. Forty percent lands on the old economy exactly, if that is ever wanted.
 *
 * THE CUT RATE BARELY MOVES: 0.39 cuts a season with nothing dead, 0.33 with a quarter. It
 * is not stopping anybody from cutting. It is charging them for it, and the bill arrives
 * ten seasons later as $20M of cap that buys nobody.
 */
const DYNASTY_DEAD_SHARE = 0.25;

/*
 * HOW LONG A CHARGE SITS ON THE BOOKS, counted in seasons from the one it was made for.
 * Infinity is for the rest of the run, which is what "dead" plainly means and what a player
 * will assume; 1 means it clears at the next offseason. The sweep beside DYNASTY_DEAD_SHARE
 * is what decided between them.
 */
const DYNASTY_DEAD_SEASONS = Infinity;

/*
 * AND A CEILING ON IT, WHICH IS A GUARD RATHER THAN A BALANCE KNOB.
 *
 * Dead money is self-limiting on paper: you can only ever cut what you could afford, and
 * what you can afford is the cap minus what is already dead, so the total converges on the
 * cap without reaching it. Converging on the cap is close enough to be a bug. A winter can
 * take all six men off you, and a run that arrives at an empty roster with no room to sign
 * anybody reaches paintDryWheel offering "take the field with 0", which takeTheField
 * refuses because a team needs somebody in it. That is a stranded run, and it would be
 * stranded by arithmetic rather than by anything the player could have done about it.
 *
 * Half the cap is the ceiling. Measured, an ordinary run carries $10M dead by season five,
 * $20M by season ten and $38M by season twenty, so this never binds in normal play: it is
 * a floor under the failure mode, not a rule anybody meets.
 */
const DYNASTY_DEAD_CEILING = 0.5;

/*
 * WHAT IS DEAD RIGHT NOW. `charges` is every cut the run has ever made, each carrying the
 * season it was made for, so expiry is arithmetic rather than bookkeeping: nothing has to
 * be swept at the turn of a year and a save cannot restore a stale total.
 */
function dynastyDead(charges, seasonNo, lifeSeasons, capMusd) {
  if (!charges || !charges.length) return 0;
  const life = lifeSeasons == null ? DYNASTY_DEAD_SEASONS : lifeSeasons;
  let total = 0;
  for (const c of charges) {
    if (!c || !(c.musd > 0)) continue;
    if (!isFinite(life) || seasonNo < c.season + life) total += c.musd;
  }
  const cap = typeof capMusd === 'number' && capMusd > 0 ? capMusd : CONSTANTS.CAP_MUSD;
  return Math.round(Math.min(total, cap * DYNASTY_DEAD_CEILING) * 10) / 10;
}

/*
 * ─── THE CAP DOES NOT MOVE, AND THAT IS THE MODE ────────────────────────────────────
 *
 * It grew six percent a winter for most of this mode's life, as a counterweight: salaries
 * ratchet and never fall, so payroll only ever climbs, and a rising budget was what stopped
 * that becoming a slide nobody could arrest.
 *
 * It is $140M in season one and $140M in season thirty now, on purpose. The counterweight
 * was the thing standing between the player and the mode's own mechanic. Your men age, they
 * decline, they sign somewhere else and they retire, and the cap closing on you at exactly
 * the rate that happens is what turns each of those into a decision instead of a caption.
 *
 * KEPT AS A RECORD, because the sweep behind it is worth not repeating and because it says
 * what a growing cap actually did. 150 runs an arm, same seeds, one manager who never
 * releases anybody against one who clears out whoever is worth less than half what he is
 * paid, measured on the twelve man shape that preceded this one:
 *
 *   growth   stand pat     manage the roster   the gap   payroll of cap, season 6
 *     0%     4.09 seasons   5.19 seasons        +1.10     $134M of $140M
 *     3%     4.49           7.54                +3.05     $151M of $162M
 *     6%     5.62           9.35                +3.73     $160M of $187M
 *     9%     6.08          10.51                +4.43     $167M of $215M
 *    12%     6.59          10.16                +3.57     $169M of $247M
 *
 * Two things in that table outlived the constant. Managing the roster beats standing pat at
 * every budget, and the gap WIDENS with money rather than closing, because money is only
 * worth what you have a slot to spend it on and releasing a man is what makes a slot. And a
 * budget that outruns six slots stops being a constraint at all: at 12% a managed roster
 * had $78M with nothing to buy.
 *
 * At 0%, the row this mode now sits on, payroll runs $134M of $140M by season six. That is
 * the ceiling doing its job.
 *
 * Nothing reads this. It is here so that the next person to think a rising cap sounds
 * generous can see what it was measured to do.
 */
const DYNASTY_CAP_GROWTH = 1.00;

/**
 * The same man, one league year on.
 *
 * `byKey` is a Map from `player_id|season` to the row, which the page already builds and
 * the harness builds once. Returns null when he has no row for that year, which is the
 * mode's central event rather than an error: 38% of cheap men and 12% of stars do not have
 * one, and the hole they leave is what brings the wheel back out.
 */
function dynastyAge(player, byKey, leagueYear) {
  if (!player || !byKey) return null;
  return byKey.get(`${player.player_id}|${leagueYear}`) || null;
}

/**
 * WHY A MAN IS GONE, and it is now three answers rather than two.
 *
 * This used to refuse to say "retired", and it was right to: a row for a later season means
 * he missed this one, no row at all means only that the POOL has nothing more from him, and
 * a pool with a playing-time floor on it drops plenty of men who were still playing. Calling
 * that retirement is telling somebody a false thing about a real person.
 *
 * The data answers it properly now. `last_season` is the final year he appeared in an NFL
 * game at all, floor or no floor, so:
 *
 *   retired  he never played again. Checkable, and true.
 *   missed   he has a later season on record, so he was absent from this one.
 *   out      he is below the pool's floor from here on but did play again, or the data
 *            simply ends. Not retirement, and not claimed as it.
 *
 * A row written before last_season existed has none, and falls back to the old two answers
 * rather than guessing.
 */
function dynastyGoneFor(player, byKey, leagueYear, lastSeason) {
  /*
   * PAST THE END OF THE POOL, NOTHING IS KNOWN, and this has to be the first question
   * rather than the last. `last_season` is the final year the man appeared in an NFL game
   * as of the day the data was built, so for anybody still playing it is the CURRENT year,
   * and the test below then read "he never played after this" off a career that has not
   * finished. George Kittle's last_season is 2026, the pool ends at 2025, and the screen
   * said GEORGE KITTLE RETIRED about a man who is playing this autumn.
   *
   * He has not retired. He has run out of seasons in this game, which is a fact about the
   * data and not about him, and it is the only honest thing to say here.
   */
  if (typeof lastSeason === 'number' && leagueYear > lastSeason) return 'end';
  const last = player && player.last_season;
  /*
   * STRICTLY BEFORE. At `last === leagueYear` he PLAYED the year being asked for and the
   * pool simply has no row for it, because a season under twelve minutes a game across
   * twenty games does not make the cut. That is a man below the floor, not a man who
   * stopped, and calling it retirement is the same false claim in a quieter place.
   */
  if (typeof last === 'number' && last < leagueYear) return 'retired';
  for (let y = leagueYear + 1; y <= lastSeason; y++) {
    if (byKey.get(`${player.player_id}|${y}`)) return 'missed';
  }
  return 'out';
}

/*
 * WHAT A CORE IS WORTH, on top of what the men are worth.
 *
 * Every other chemistry link in this game is a fact about history: these two were
 * teammates, went to the same school, came out of the same draft. This is the one link that
 * belongs to YOUR run, and the mode needs it: without it a dynasty is just three drafts
 * where some of the players carry over, and the correct play is to cut anybody whose price
 * went up. It is the mechanical reason to keep a declining favourite, which is the feeling
 * the mode is for.
 *
 * It counts SEASONS TOGETHER, averaged across the roster, so a team that keeps four men and
 * replaces two is worth more than one that turns over every winter and less than one that
 * keeps all six. Year one is worth nothing, because nobody has been anywhere yet.
 */
const DYNASTY_CONTINUITY_PER_YEAR = 0.02;

function dynastyContinuity(roster, tenure) {
  if (!roster || roster.length < 2 || !tenure) return null;
  let total = 0;
  for (const p of roster) total += Math.max(1, tenure[p.player_id] || 1);
  const mean = total / roster.length;
  const extra = mean - 1;
  if (!(extra > 0.01)) return null;
  const value = Math.round(DYNASTY_CONTINUITY_PER_YEAR * extra * 1000) / 1000;
  return {
    type: 'continuity', value,
    a: 'This roster', b: `${mean.toFixed(1)} seasons together`,
    label: mean >= 2.5
      ? 'This group has been together three years'
      : 'This group has played together before',
    short: 'Been here before',
  };
}

/* WHAT A FULL TEAM'S PRODUCTION IS WORTH, and the only reason it is not 1.
 *
 * The cap above is set by how a roster should LOOK. This is set by how it should PLAY, and
 * the two had to be separated or one of them is always wrong: $280M of purchasing power
 * buys a roster that wins over 90% of its games, and the cap that wins the right share buys
 * a roster of floor men.
 *
 * It scales each side's raw production by the same factor before anything else touches it,
 * so it changes what a full team is worth WITHOUT changing what any decision inside the mode
 * is worth: a better quarterback is still better by the same proportion, the offence and the
 * defence keep their relative weights, and every structure, scheme and chemistry multiplier
 * still lands on top exactly as it did.
 *
 * Fitted, not chosen. See simulator.js --fullteam. */
const FULL_TALENT = 0.78;

/*
 * ─── THE COACH ─────────────────────────────────────────────────────────────────────
 *
 * Full Team's thirteenth asset, and the one pick in this game that is not a wheel. Twelve
 * spins hand you what they hand you; the coach is chosen from everybody you can still
 * afford, which is what makes the last decision of a draft a decision rather than a draw.
 *
 * WHAT A COACH IS, IS DERIVED, NOT WRITTEN DOWN. There is no scheme column in the data and
 * inventing one would be inventing facts about real people. What there is: coaches.json
 * names the head coach of all 861 team-seasons, and team_seasons.json says what each of
 * those teams scored and allowed. So a coach's tilt is simply what his teams actually did,
 * measured against the league average OF HIS OWN SEASONS, which is what stops a 2000s
 * defensive coach being flattered by a decade when nobody scored:
 *
 *   Mike Martz      +5.6 offense  -1.9 defense   the Greatest Show on Turf, priced as such
 *   Jim Harbaugh    +0.3 offense  +4.9 defense   a defensive coach, and the data says so
 *   Bill Belichick  +4.1 offense  +3.2 defense   good at both, over 24 seasons
 *
 * THREE SEASONS MINIMUM. One good year is a roster, not a coach, and a single-season man
 * would be the cheapest way to buy a big tilt. 115 of the 162 names clear it.
 *
 * A COACH IS NOT A PLAYER AND MUST NOT BE PRICED LIKE ONE. His effect is a multiplier on a
 * whole unit, which is worth far more than any single man, so the price ladder is its own:
 * see coachPrice.
 */
const COACH_MIN_SEASONS = 3;
/* Points per game above his era, converted to a multiplier on a unit. The best offensive
   coach in the data is +5.6 and the worst is -8.2, so at this scale the coaching job is
   worth about +7% to -10% of a unit: enough to be the reason a season turned, never enough
   to be worth more than the six men it stands behind. */
/* MEASURED AGAINST WHAT HE COSTS, and the first value failed that test. At 0.012 the best
   coach in the game returned about 4.4% of a unit for 9.8% of the cap, so the solver
   declined to hire anybody at any budget: a feature whose optimal play is "never use it".
   At 0.020 he is worth about 7.3%, which against a price ceiling pulled down to $22M is a
   trade somebody would actually take. The two moved together because moving either one
   alone would have had to move twice as far. */
const COACH_K = 0.020;

let COACH_TABLE = null;
function coachTable(ctx) {
  if (COACH_TABLE) return COACH_TABLE;
  const coaches = (ctx && ctx.coaches) || {};
  const seasons = (ctx && ctx.teamSeasons) || [];
  if (!seasons.length) return (COACH_TABLE = []);

  /* League average by season, so every coach is measured against the football that was
     being played while he was doing it. */
  const lg = {};
  for (const t of seasons) {
    const a = (lg[t.season] ??= { sc: 0, al: 0, n: 0 });
    a.sc += t.pts_scored_mean; a.al += t.pts_allowed_mean; a.n++;
  }
  for (const k in lg) { lg[k].sc /= lg[k].n; lg[k].al /= lg[k].n; }

  const byId = {};
  for (const t of seasons) byId[t.team_season_id] = t;

  const acc = {};
  for (const id in coaches) {
    const name = coaches[id] && coaches[id].hc;
    const t = byId[id];
    if (!name || !t || !lg[t.season]) continue;
    const a = (acc[name] ??= { n: 0, off: 0, def: 0, w: 0, g: 0, first: 9e9, last: 0 });
    a.n++;
    a.off += t.pts_scored_mean - lg[t.season].sc;
    a.def += lg[t.season].al - t.pts_allowed_mean;
    const m = /^(\d+)-(\d+)/.exec(t.record || '');
    if (m) { a.w += +m[1]; a.g += (+m[1]) + (+m[2]); }
    a.first = Math.min(a.first, t.season);
    a.last = Math.max(a.last, t.season);
  }

  COACH_TABLE = Object.keys(acc).map((name) => {
    const a = acc[name];
    const off = a.off / a.n, def = a.def / a.n;
    return {
      name,
      seasons: a.n,
      years: a.first === a.last ? String(a.first) : `${a.first}-${a.last}`,
      off: Math.round(off * 10) / 10,
      def: Math.round(def * 10) / 10,
      winPct: a.g ? a.w / a.g : 0,
      price_musd: coachPrice(off, def),
    };
  }).filter((c) => c.seasons >= COACH_MIN_SEASONS)
    .sort((a, b) => b.price_musd - a.price_musd || a.name.localeCompare(b.name));
  return COACH_TABLE;
}

/*
 * WHAT A COACH COSTS. Priced off what he is worth rather than off what he did, which are
 * different numbers: a coach who was +4 on offense and -4 on defense had a fine career and
 * is worth nothing to a team that has to play both halves.
 *
 * So the price is driven by the SUM of the two tilts, floored so that a bad coach is cheap
 * rather than free (somebody has to hold the clipboard) and capped so the best one in the
 * game cannot eat a quarter of the roster.
 */
function coachPrice(off, def) {
  const worth = off + def;                       // roughly -12 to +8 across the pool
  const v = Math.max(0, Math.min(1, (worth + 6) / 14));
  return Math.round((3 + 19 * v * v) * 10) / 10;  // $3M to $22M, steep at the top
}

/*
 * ─── WHO THE COACH ALREADY KNOWS ───────────────────────────────────────────────────
 *
 * A coach's tilt above is the same wherever he goes, which makes hiring a lookup: read the
 * two numbers, take the biggest you can afford. That is not a decision, and Full Team is
 * supposed to be a mode of decisions.
 *
 * So a coach also has CHEMISTRY, with the men you actually drafted, and it is different for
 * every roster in the game. Two links, both facts rather than flavour:
 *
 *   coached   he was the head coach of that man's team-season. coaches.json names the head
 *             coach of all 861 seasons and every player row carries its team_season_id, so
 *             this is a join. Marvin Harrison's 2002 was coached by Tony Dungy, and hiring
 *             Dungy to coach him again is a thing that happened.
 *   college   he was a head coach at the school the player attended. That half is not in the
 *             football data at all; it comes out of the COLLEGE game's, through
 *             football/build/coach-links.mjs, and 25 of the hireable names have one.
 *
 * BOTH SIDES OF THE BALL. The links run to whoever is on the roster, so a defensive coach
 * with three of his old defenders is a different hire from the same man on a roster full of
 * strangers, and the offence and the defence each keep what their own men earned.
 *
 * A LINK THIS CANNOT PROVE IS A LINK IT DOES NOT CLAIM. No coordinator jobs, no college post
 * that predates the college data. The failure mode here is telling a player a false thing
 * about a real person, which is worse than a thin feature.
 */
function coachLinks(roster, ctx, coach) {
  const V = CHEMISTRY.COACH;
  if (!coach || !coach.name || !V) return [];
  const seasonCoaches = (ctx && ctx.coaches) || {};
  const schools = ((ctx && ctx.coachColleges) || {})[coach.name] || [];
  const out = [];
  for (const p of roster) {
    const hc = seasonCoaches[p.team_season_id] && seasonCoaches[p.team_season_id].hc;
    if (hc === coach.name) {
      out.push({ type: 'coach_coached', value: V.coached, a: coach.name, b: p.name,
        label: `${lastWord(coach.name)} coached ${p.name} in ${p.season}`,
        short: 'Coached him already' });
      continue;   // one link per man, and the stronger one wins
    }
    if (p.college && schools.indexOf(p.college) >= 0) {
      /* NAMES THE MAN, not just the school. "Belichick was the head coach at North Carolina"
         is true and says nothing about your roster, which is the only reason the line is
         there. */
      out.push({ type: 'coach_college', value: V.college, a: coach.name, b: p.name,
        label: `${lastWord(coach.name)} was a head coach at ${p.college}, where ${p.name} played`,
        short: `Both at ${p.college}` });
    }
  }
  return out;
}

/** The two multipliers a coach hands his team. */
function coachEffect(coach) {
  if (!coach) return { off: 1, def: 1 };
  return { off: 1 + (coach.off || 0) * COACH_K, def: 1 + (coach.def || 0) * COACH_K };
}

/*
 * ─── THE GAME PLAN ─────────────────────────────────────────────────────────────────
 *
 * Three choices made once, before the season, and they are the reason Full Team is not the
 * draft with six more rounds.
 *
 * THEY ARE TRADES, NOT UPGRADES. Every one of them helps and hurts, and which way it lands
 * depends on the roster you just built, so there is no correct answer to memorise:
 *
 *   TEMPO      fast raises BOTH scores, slow lowers both. Fast is right when your offence
 *              is better than theirs and wrong when your defence is what you paid for.
 *   FOURTH     aggressive scores a little more on average and swings a lot harder. A weak
 *              team wants the swing, because it needs the tail. A strong team wants none of
 *              it. Measured: +2.0 points of win rate to an underdog, -1.1 to a favourite.
 *   PRESSURE   blitzing holds the opponent to less on average and gives up more when it
 *              fails, so it is the mirror and the bigger lever: +8.3 to an underdog and
 *              -5.2 to a favourite.
 *
 * EVERY ONE OF THOSE NUMBERS CHANGES SIGN, and that is the test each axis had to pass. The
 * first set of constants made aggression worth +3.3 to an underdog and -0.3 to a favourite,
 * which is not a trade, it is a free upgrade with a rounding error attached. They were swept
 * until declining was genuinely right for somebody.
 *
 * WHY VARIANCE AND NOT JUST AVERAGES. A season is won game by game, so what decides it is
 * how often your number beats theirs, not the gap over seventeen weeks. Two of these three
 * move the spread rather than the middle, which is a real decision with no dominant answer
 * and could not exist in a mode that only had one side of the ball to point them at.
 *
 * The coach picks the default, so a player who never opens this screen still fields a
 * coherent team: see planFromCoach.
 */
const PLAN_AXES = ['tempo', 'fourth', 'pressure'];
const PLAN = {
  /* Both scores move together, so tempo is a bet on which offence is better. */
  TEMPO: 0.085,
  /* What aggression is worth on the scoreboard, and what it costs in consistency. The
     second number is the one that matters: it is applied to the blend that damps a roster
     toward its own expectation, so aggressive play lets a bad week be worse and a good one
     better. */
  /* SWEPT UNTIL THE SIGN FLIPS, which is the only test that matters for a choice. At the
     first values (+3.5% mean, 0.55 swing) going for it was worth +3.3 points of win rate to
     an underdog and cost a favourite 0.3: near enough to free that nobody would ever decline
     it, which makes it an upgrade rather than a decision. At these it is +2.0 and -1.1. */
  FOURTH_MEAN: 0.02,
  FOURTH_SWING: 0.70,
  /* Suppression bought with risk. A blitz that lands is a stop; one that does not is a
     long touchdown, which is variance on THEIR score rather than on yours. */
  /* Same sweep, same reason. At the first values a blitz was +8.0 for an underdog and -0.2
     for a favourite, so everybody blitzes. At these it is +8.3 and -5.2: the biggest lever
     on the screen and the one that most obviously belongs to a team that is behind. */
  PRESSURE_MEAN: 0.015,
  PRESSURE_SWING: 0.75,
};

/** A legal plan, from anything. Every axis is -1, 0 or +1 and nothing else. */
function normalizePlan(plan) {
  const out = {};
  for (const k of PLAN_AXES) {
    const v = plan && plan[k];
    out[k] = v === 1 || v === -1 ? v : 0;
  }
  return out;
}

/*
 * THE DEFAULT COMES OFF THE COACH, because a plan nobody chose still has to be a plan
 * somebody would choose. An offensive coach pushes the tempo and goes for it; a defensive
 * one shortens the game and sends pressure. A coach who is neither leaves all three level,
 * which is the honest answer for a man whose teams were average at both.
 */
/*
 * A COACH'S SCHEME IS HIS, NOT A SUGGESTION. Hiring one takes his philosophy with him,
 * which is the whole shape of the decision: pay for a man who knows what he is doing and
 * play his way, or keep the money and call it yourself. A screen that let you hire
 * Belichick and then overrule him was offering the expertise for free.
 */
function planFromCoach(coach) {
  if (!coach) return normalizePlan(null);
  const off = coach.off || 0, def = coach.def || 0;
  const tilt = off - def;
  return normalizePlan({
    tempo: tilt > 1.5 ? 1 : tilt < -1.5 ? -1 : 0,
    fourth: off > 2 ? 1 : off < -2 ? -1 : 0,
    pressure: def > 2 ? 1 : def < -2 ? -1 : 0,
  });
}

/*
 * ─── FULL TEAM: BOTH SIDES OF THE BALL, TWELVE MEN, ONE CAP ────────────────────────
 *
 * NOT A THIRD ENGINE. The two functions above are exact mirrors of each other and each
 * one already computes half of this:
 *
 *   resolveGame          your drafted offense scores. Opponent scores what it really did.
 *   resolveGameDefense   a free offense scores. Your drafted defense holds the opponent.
 *
 * Full Team is the diagonal: your drafted offense scores AND your drafted defense holds.
 * So this takes the yourScore term from the first and the oppScore term from the second,
 * unchanged, and neither half needed writing.
 *
 * WHICH IS ALSO EXACTLY WHY IT CANNOT SHIP AT THE SAME CAP. Both modes are calibrated
 * around a crutch that this one removes. Offense mode hands you the opponent's real
 * scoring, which is what stops a good offense going 21-0; defense mode hands you an
 * offense held deliberately below average by DEF_OFFENSE_SCALE, which is what stops a
 * good defense doing the same. Draft both and both crutches are gone at once, so twelve
 * men bought at the six-man cap is not a slightly strong team, it is an unbeatable one.
 *
 * THE CAP IS THE BALANCE KNOB, and it is the only one that should move. Twelve men under
 * one shared budget is the whole design: the mode's question is "the $48M edge rusher or
 * the $48M quarterback", and two separate budgets deletes that question. Where the shared
 * number lands is measured, not guessed, by football/simulator.js --fullteam, which plays
 * whole seasons at a range of caps and reads off the one where a careful roster wins about
 * as often as a careful roster does in the other two modes.
 *
 * NOTHING IN THE LIVE GAME CALLS THIS YET. playRun reaches it only through opts.full, and
 * no caller passes opts.full outside the harness.
 */
/*
 * FULL TEAM HANDS THE TWO UNITS TWO DIFFERENT MULTIPLIERS and every other mode one, so the
 * full path takes either: a bare number, meaning both sides carry the same figure, or the
 * object resolveChemistry returns when it split them. Written as a reader rather than a
 * second parameter because `chemistryMultiplier` reaches these functions through playRun,
 * advanceWeek and the harness, and threading one more argument through all three is how a
 * side ends up silently playing at 1.0.
 */
function chemSide(chem, key) {
  if (chem && typeof chem === 'object') {
    if (typeof chem[key] === 'number') return chem[key];
    return typeof chem.multiplier === 'number' ? chem.multiplier : 1;
  }
  return typeof chem === 'number' && chem > 0 ? chem : 1;
}
const chemOff = (c) => chemSide(c, 'offMultiplier');
const chemDef = (c) => chemSide(c, 'defMultiplier');

function splitSides(roster) {
  const off = [], def = [];
  for (const p of roster) {
    (DEFENSE_POSITIONS.indexOf(p.position) >= 0 ? def : off).push(p);
  }
  return { off, def };
}

function resolveGameFull(roster, chemistryMultiplier, opponent, leagueAvgAllowed,
  rng, constants = CONSTANTS, advantage = 1, extra = null) {
  const { off, def } = splitSides(roster);
  const coach = coachEffect(extra && extra.coach);
  const plan = normalizePlan(extra && extra.plan);
  /* CONSISTENCY IS THE FOURTH DOWN DIAL. It is the blend that pulls a week's sampling back
     toward the roster's own expectation, so lowering it is exactly what "we went for it"
     should feel like: the same team, swinging harder in both directions. */
  const C = Math.max(0, Math.min(0.95,
    (constants.CONSISTENCY || 0) * (1 - PLAN.FOURTH_SWING * plan.fourth)));

  /* THE SAMPLES ARE DRAWN OVER THE WHOLE ROSTER IN ROSTER ORDER, one per man, before
     anything is split. Drawing offense first and defense second would work and would make
     the seed mean something different from what the draft screen shows, which is the class
     of bug that only surfaces when somebody replays a shared seed and gets another season.
     Sampling in the order the men are held keeps a seed a seed. */
  const samples = roster.map(p => sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng));
  const blend = (i) => samples[i] * (1 - C) + roster[i].ppr_ppg_mean * C;

  let rawOff = 0, rawDef = 0;
  for (let i = 0; i < roster.length; i++) {
    const isDef = DEFENSE_POSITIONS.indexOf(roster[i].position) >= 0;
    if (isDef) rawDef += blend(i); else rawOff += blend(i);
  }

  /* Each side reads its own structure, because the two functions are not interchangeable:
     rosterStructure looks for a quarterback and a pass/rush balance, defenseStructure looks
     at rush, coverage and tackling. Handing either one the full twelve would score half the
     roster against questions it cannot answer. */
  const offStructure = rosterStructure(off).multiplier;
  const defStructure = defenseStructure(def).multiplier;

  /* THE TALENT DIAL, applied once to each side's raw sum and to nothing else. Overridable
     through constants so the harness can sweep it without editing this file. */
  const talent = constants.FULL_TALENT === undefined ? FULL_TALENT : constants.FULL_TALENT;
  /* The coach lands here, on the unit he coaches, before anything downstream reads it. So
     his offensive tilt is worth the same proportion to a great offence as to a poor one,
     which is what a multiplier should mean and what a flat points bonus would not. */
  rawOff *= talent * coach.off;
  rawDef *= talent * coach.def;

  const defenseModifier = opponent.pts_allowed_mean / leagueAvgAllowed;
  /* TEMPO MOVES BOTH SCORES THE SAME WAY, which is the whole point of it: playing fast is
     not "score more", it is "more football happens", and more football helps whichever
     offence is better. It multiplies the finished scores rather than any one term so the
     two sides cannot drift apart. */
  const tempo = 1 + PLAN.TEMPO * plan.tempo;
  const offMul = chemOff(chemistryMultiplier) * offStructure * defenseModifier;
  /* Aggression is worth a little on the average and a lot on the spread; the spread is in C
     above. Both are wanted by a team that needs the tail and neither by one that does not. */
  const yourScore = rawOff * offMul * tempo * (1 + PLAN.FOURTH_MEAN * plan.fourth);

  const defenseTotal = rawDef * chemDef(chemistryMultiplier) * defStructure;
  const suppression = defenseSuppression(defenseTotal, constants);
  /* Pressure is the mirror of the fourth down call, pointed at their score instead of
     yours: it holds them to less on average and gives up more when it misses. The swing is
     applied to the opponent's own spread, because a blitz that fails is their big play. */
  const oppScore = sampleGamma(opponent.pts_scored_mean,
      opponent.pts_scored_sd * (1 + PLAN.PRESSURE_SWING * plan.pressure), rng)
    * constants.SCALE * suppression * tempo
    * (1 - PLAN.PRESSURE_MEAN * plan.pressure) / advantage;

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;

  /* ONE COLUMN, TWO MEANINGS, and the box score has to say which. An offensive line is
     points on the board and the offensive lines sum to yourScore. A defensive line is a
     share of the suppression effort and sums to defenseTotal, which is not points and must
     never be printed as if it were. Same split the defense mode's box score already makes,
     carried here rather than re-derived by the screen. */
  /* TALENT RIDES ON THE LINES TOO, or the column stops adding up to the score it is under.
     rawOff was scaled above; blend(i) was not, so each man's line has to take the same
     factor for the offensive column to sum to yourScore and the defensive one to the
     defensive total. */
  const defMul = chemistryMultiplier * defStructure * talent * coach.def;
  const offLineMul = offMul * talent * coach.off * tempo * (1 + PLAN.FOURTH_MEAN * plan.fourth);
  const lines = roster.map((p, i) =>
    blend(i) * (DEFENSE_POSITIONS.indexOf(p.position) >= 0 ? defMul : offLineMul));

  return { won, yourScore, oppScore, defenseModifier: suppression, offenseModifier: defenseModifier,
    defenseTotal, lines };
}

/*
 * HEAD-TO-HEAD — the "Challenge Bowl". Two drafted rosters, neither of which has a defense
 * (both are six offensive skill players), so each side is scored as its OFFENSE against a
 * neutral, league-average defense: the same raw x chemistry x structure the season uses,
 * with defenseModifier fixed at 1 and no SCALE (SCALE converts an opponent's real points
 * into fantasy space, and here both sides already live in fantasy space).
 *
 * A single game is naturally a coin flip, which would reward luck over roster-building, so
 * the Bowl damps variance harder than a regular game via a stronger consistency blend
 * (BOWL_CONSISTENCY): the better-built roster wins the large majority of the time, with
 * upsets still possible for drama.
 *
 * Scoring is in a FIXED order (a then b) so the result is identical for everyone who
 * recomputes it from the same seed — the challenger, the friend, and anyone they show it to
 * — regardless of whose screen it is. Callers always pass a = challenger, b = friend; the
 * UI decides which side is labeled "you".
 */
const BOWL_CONSISTENCY = 0.62;

function teamOffense(roster, chemistryMultiplier, rng, consistency) {
  let raw = 0;
  for (const p of roster) raw += sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);
  const C = consistency || 0;
  if (C > 0) {
    const expected = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
    raw = raw * (1 - C) + expected * C;
  }
  return raw * chemistryMultiplier * rosterStructure(roster).multiplier;
}

function resolveHeadToHead(a, b, rng, cal, constants = CONSTANTS) {
  const C = constants.BOWL_CONSISTENCY ?? BOWL_CONSISTENCY;
  const aPts = teamOffense(a.roster, a.chemistry ?? 1, rng, C);
  const bPts = teamOffense(b.roster, b.chemistry ?? 1, rng, C);
  let aWon;
  if (aPts > bPts) aWon = true;
  else if (aPts < bPts) aWon = false;
  else aWon = rng() < 0.5;
  const shown = cal ? toFootballScore(aPts, bPts, aWon, rng, cal) : null;
  return {
    aPts: Math.round(aPts * 10) / 10,
    bPts: Math.round(bPts * 10) / 10,
    aWon,
    shownA: shown ? shown.you : null,
    shownB: shown ? shown.them : null,
  };
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
 * Both are in points. Tight enough that a good offense visibly outscores a bad one, loose
 * enough that the same roster does not report the same scoreline every week: the real
 * corpus is sampled inside these tolerances by its own frequency, so 23-20 comes up often
 * and 41-38 comes up rarely, exactly as often as football produces them.
 */
const SCORELINE_TOLERANCE = { margin: 4.5, points: 5.0 };

/*
 * THE REAL FREQUENCY OF A SCORELINE PULLS AT FULL STRENGTH, and it was measured before it
 * was left alone. The count looks like it double-counts the NFL's own shape, because the
 * margin and points targets below are already drawn through the real CDFs; damping it to
 * n^0.25 does widen the distribution. It is still wrong. Over 18,000 games on cap-legal
 * rosters, against the 6,967 real ones in display_calibration.json:
 *
 *                        n^1.0    n^0.25     real
 *     margin of exactly 3  14.9%     7.8%    14.9%
 *     games inside a score 51.6%    46.5%    50.7%
 *     a team reaching 31   21.3%    25.0%    20.9%
 *
 * At full strength the three-point margin lands exactly, because the lumpiness of real
 * scoring -- the spike at 3, the one at 7 -- lives in how often those finals happened and
 * nowhere else. Damping the count smooths precisely the feature worth keeping.
 *
 * The first pass at this measured 8.79 for a real 10.66 and concluded the tails were a
 * third too thin. That harness built rosters from a uniformly random eligible player per
 * slot with no salary cap, which samples weak, frequently illegal teams nobody fields; on
 * cap-legal rosters the same figure is 9.65. Any future look at this needs rosters built
 * the way build/04-display.mjs builds them, or it will measure a population that does not
 * play the game.
 */

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
 * nothing about whether your offense was any good: across the whole cap-legal band, from a
 * 48-FPPG roster to an 87-FPPG one, reported points moved only 18.3 to 25.2, and in
 * one-score games only 20.9 to 23.1. Real NFL offenses span about 16 to 30 a game, so a
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

  /* internal_offenCe_q, WITH A C, because that is the key build/04-display.mjs
     writes. Both reads below said `internal_offense_q` and no such key has ever
     existed in display_calibration.json, so the guard was true on every call and
     every scoreline this game has ever shown came out of legacyFootballScore
     rather than the pair sampler the comment above describes.

     The comment was not wrong about the design, only about what ran. Measured over
     40,000 games before the fix, against the 7,276 real games the same file is
     built from: 14.35% of finals were scorelines the NFL has never produced, 0.588%
     of teams scored 4 (real: zero, ever) and 1.035% scored 2 (real: 0.014%). The
     4-point score the note below calls impossible by construction was still
     happening, because construction was being skipped.

     Nothing threw and no number looked absurd on its own, which is how a dead good
     path survives: legacyFootballScore returns a plausible-looking score. The fall
     back below is still correct for genuinely old calibration files.

     The college game had the identical typo and was fixed first; this is the same
     one-word change. The calibration file itself was always fine, because
     04-display.mjs measures internal scores straight off resolveGame and never
     went through this function. */
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
function playRun(roster, chemistryMultiplier, schedule, playoffs, leagueContext, rng, constants = CONSTANTS, opts = {}) {
  const results = [];
  let wins = 0, losses = 0;

  /* The same team overall the results screen prints, so the weekly edge, seeding and home
     field are all decided by the number the player is shown rather than by a second
     opinion. Computed up front because the regular season reads it too. */
  /* ON THE SIDE OF THE BALL THIS RUN IS ACTUALLY PLAYING. Both halves of this were wrong
     for a defense and wrong in the same direction. rosterStructure is an offensive reading
     that returns about 0.57 for any six defenders, and the product it lands on is on a
     scale the seeding and edge constants below do not share, so a top defense projected as
     a bottom team. overallOf answers both. */
  const teamRating = overallOf(roster, chemistryMultiplier,
    opts.full ? 'full' : !!opts.defense, opts.coach);
  const play = (opp, meta) => {
    const leagueAvg = leagueContext[opp.season] ?? 21.5;
    /* THE PROJECTION HAS TO PLAY THE GAME THE RUN PLAYED. A One Stop roster resolved
       through resolveGame is a 47-point offense: it loses almost every week, and the
       typical record it came back with was 2-15 for a season that finished 10-7. */
    const resolver = opts.full ? resolveGameFull
      : opts.defense ? resolveGameDefense
        : resolveGame;
    const r = resolver(roster, chemistryMultiplier, opp, leagueAvg, rng, constants,
      weeklyEdgeVs(teamRating, opp, constants), opts.full ? opts : null);
    results.push({ opponent: opp.display, opponent_id: opp.team_season_id, ...meta, ...r });
    if (r.won) wins++; else losses++;
    return r.won;
  };

  for (let i = 0; i < schedule.length; i++) {
    play(schedule[i], { week: i + 1, playoff: false, round: null });
  }

  const regularWins = wins;
  const regularLosses = losses;
  const seed = seedFromRecord(regularWins, { rating: teamRating });
  /* A bye means you were seeded on top, so the share is read at no less than the record
     that route normally takes — the same floor run.js applies in the live game. */
  const byeWins = seed.bye ? Math.max(regularWins, constants.BYE_SEED_WINS) : regularWins;
  const advantage = 1 + (constants.PLAYOFF_HOME_FIELD || 0)
    * playoffShare(byeWins, teamRating);
  /* The final is its own question. Everywhere but GM mode it is decided by the roster
     (finalEdge); in GM mode half the seeding edge follows you onto neutral ground, which
     is what the live game does there and what this has to agree with to be a projection
     of it rather than of a different game. */
  const finalAdvantage = opts.gm
    ? 1 + (constants.PLAYOFF_HOME_FIELD || 0) * (constants.GM_FINAL_HOME_FIELD || 0)
      * playoffShare(byeWins, teamRating)
    : finalEdge(teamRating, constants);

  let titleWon = false;
  let exitRound = null;
  if (seed.made) {
    const names = playoffRoundNames(seed.rounds);
    for (let i = 0; i < seed.rounds; i++) {
      const opp = playoffOpponent(playoffs, seed.rounds, i);
      const leagueAvg = leagueContext[opp.season] ?? 21.5;
      const isFinal = i === seed.rounds - 1;
      const adv = isFinal ? finalAdvantage : advantage;
      const r = opts.defense
        ? resolveGameDefense(roster, chemistryMultiplier, opp, leagueAvg, rng, constants, adv)
        : resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants, adv);
      results.push({ opponent: opp.display, opponent_id: opp.team_season_id,
        week: schedule.length + i + 1, playoff: true, round: names[i], ...r });
      if (r.won) wins++; else { losses++; exitRound = names[i]; break; }
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

function eraSlice(data, era) {
  const range = ERAS[era];
  if (!range) throw new Error('unknown era ' + era);
  const inEra = (t) => t.season >= range[0] && t.season <= range[1];
  const byFranchise = {};
  for (const [f, ts] of Object.entries(data.byFranchise)) {
    const filtered = ts.filter(inEra);
    if (filtered.length) byFranchise[f] = filtered;
  }
  const all = Object.values(byFranchise).flat();
  const zs = all.map((t) => t.strength_z).sort((a, b) => a - b);
  const q = (p) => zs[Math.min(zs.length - 1, Math.max(0, Math.round(p * (zs.length - 1))))];
  const eliteThreshold = q(0.90);
  const winsOf = (t) => Number(String(t.record).split('-')[0]) || 0;
  const playoffField = all.filter((t) => winsOf(t) >= CONSTANTS.PLAYOFF_WINS);
  const goodPool = playoffField.filter((t) => winsOf(t) === CONSTANTS.PLAYOFF_WINS);
  const greatPool = playoffField.filter((t) => winsOf(t) >= CONSTANTS.PLAYOFF_WINS + 2
    || (winsOf(t) === CONSTANTS.PLAYOFF_WINS + 1 && t.strength_z >= q(0.95)));
  const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  return {
    divisions: data.divisions,
    byFranchise,
    eliteThreshold,
    goodPool,
    greatPool,
    meanScheduleStrength: meanZ * 17,
  };
}

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
   *
   * BOTH ARE GATED ON WINS, NOT ON STRENGTH ALONE. They used to be strength-z bands, and
   * 80% of the "good" band had fewer than twelve wins: the game asked you for twelve to
   * get in and then sat an 8-8 team across from you in the Wild Card. A playoff field
   * clears the same bar the player does.
   *
   *   good    exactly 12 wins                        64 team-seasons, 27 franchises
   *   great   14 or more, or 13 with top-5% strength  41 team-seasons, 20 franchises
   *
   * Measured against a roster at the top of what the cap allows, that is 58% and 47%:
   * an eleven-point gap, so the first two rounds still do not feel like the same game
   * twice. Splitting on wins alone left them six points apart. The 13-win teams with an
   * elite point differential are in the great pool rather than out of the ladder, which
   * is what keeps it at twenty franchises instead of fifteen.
   *
   * Ties are ignored on purpose: a 12-3-1 team won twelve, which is the test.
   */
  const winsOf = (t) => Number(String(t.record).split('-')[0]) || 0;
  const playoffField = teamSeasons.filter((t) => winsOf(t) >= CONSTANTS.PLAYOFF_WINS);
  const goodPool = playoffField.filter((t) => winsOf(t) === CONSTANTS.PLAYOFF_WINS);
  const greatPool = playoffField.filter((t) => winsOf(t) >= CONSTANTS.PLAYOFF_WINS + 2
    || (winsOf(t) === CONSTANTS.PLAYOFF_WINS + 1 && t.strength_z >= q(0.95)));

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
const ENGINE_API_VERSION = 45;

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

/*
 * ─── THE GAUNTLET'S BOSS SEASONS ─────────────────────────────────────────────────────
 *
 * Every fifth season the schedule ends with a marquee game against a real great team, and
 * that game is the one place in this mode where the player is not a spectator. Two levers,
 * both genuine reads rather than buttons that always help:
 *
 *   THE SCOUT, before the game. The boss's tell is shown and you pick how to attack it. The
 *   right read against THIS boss is worth BOSS_READ_EDGE on your own score; the wrong read
 *   is worth nothing and the trap read costs you. It is a read because the tell points at the
 *   answer without naming it, and because a boss weak to the pass is death to the run.
 *
 *   THE CALLS, during the game. A fourth down and a two-point try, each a seeded gamble with
 *   a real downside. They widen the outcome, which is exactly what a trailing underdog wants
 *   and exactly what a team in front does not: see the FOURTH axis in the game plan for the
 *   same idea measured on a whole season. Pressing when you are already ahead of the boss is
 *   how you hand it back.
 *
 * WHY OFFENSE-ONLY MAKES THIS WORK RATHER THAN BREAKING IT. The Gauntlet drafts an offense,
 * so a wall-of-defense boss (the 2000 Ravens, the 2002 Buccaneers) throttles your score
 * through the same defenseModifier every Sunday uses, and a juggernaut-offense boss (the
 * 2007 Patriots, the 2013 Broncos) simply puts up a number you have to chase. The scout is
 * the read on which of those two problems you are holding.
 *
 * BEATING ONE PAYS, LOSING ONE STINGS. The reward alternates: the odd bosses (5, 15, 25)
 * wipe your dead cap, the even ones (10, 20, 30) let you freeze a man at his current age and
 * salary for the rest of the run. Lose and the owner wants one more win next season, which
 * is the existing win bar doing the punishing rather than a new way to die. See
 * dynastyBossReward and effectiveWinBar in run.js.
 */
const DYNASTY_BOSS_EVERY = 5;

/*
 * WHAT A RIGHT READ IS WORTH, as a multiplier on your scoring power for the whole boss game.
 * It shifts how far your offense moves the ball rather than adding points at the end, so a
 * good read is felt on every drive. Measured with a headless harness that plays the sim over
 * forty drafted rosters: a right read beats the trap read by five to ten points of win rate
 * on every boss, and the trap comes in at or below not scouting at all. So the tell is worth
 * reading and a confident wrong answer is worse than a shrug. The trap costs half the edge: a
 * wrong guess should sting, not lose the game on its own.
 */
const BOSS_READ_EDGE = 0.06;

/*
 * ─── THE BOSS GAME IS A DRIVE PLAYED FORWARD ─────────────────────────────────────────
 *
 * The playoffs decide the result and then draw a plausible broadcast to it (scoringScript
 * works backwards from a final). The boss game does the opposite: it plays down by down, the
 * score, clock, field position and down-and-distance are the sim's own state, and when a real
 * fourth down or two-point spot arrives it stops and asks. Your call then decides where the
 * ball goes next, because the conversion is resolved here and the drive lives or dies on it.
 *
 * GROUNDED IN THE SAME NUMBERS AS EVERY SUNDAY. Each team's expected points come from the
 * exact resolveGame expectation (your means times chemistry times structure times the boss's
 * defenseModifier; the boss's own scoring rate), pushed through the same internal-to-football
 * calibration toFootballScore uses. So a wall-of-defense boss holds your drives short and a
 * juggernaut scores in bunches, at the rate the data says, and the difficulty matches the
 * band the old resolver was measured at. Only the PATH is now real, and the two calls sit on
 * that path instead of adjusting a final number.
 *
 * mu (yards per play) is fitted per team at kickoff so the auto-play drive model produces the
 * team's expected points per drive; the fit runs on its own fixed-seed rng so it neither
 * perturbs the game seed nor drifts if the drive rules change. See bossFitMu.
 */
const BOSS_SIM = {
  DRIVES_PER_TEAM: 11,     // possessions a side in a 60 minute game, about
  PLAY_SECS: 26,           // seconds a play burns, blended stopped and running clock
  GAIN_SD: 6.4,            // yards per play, spread
  TO_RATE: 0.021,          // per-play chance the drive ends in a giveaway
  FG_MAX_YARD: 38,         // yards from the goal you will still try a field goal from (55 yd kick)
  PUNT_NET: 39,            // net punt, gross minus the return
  START_YARD: 26,          // where a drive starts after a kickoff, about your own 26
};

/* Expected football points for an internal (fantasy) score, deterministic: the same
   internal-to-real mapping toFootballScore samples around, read at its centre. Falls back to
   a plain divisor when a calibration is not supplied (the harness passes one). */
function bossExpectedPoints(internalScore, cal) {
  if (cal && cal.real_team_pts_q && cal.internal_offence_q) {
    return valueAt(cal.real_team_pts_q, percentileIn(cal.internal_offence_q, internalScore));
  }
  return internalScore / 3.4;
}

/* One play's gain, in yards. A gentle floor so a loss is possible but a drive is not made of
   them; the spread is what turns a strong offense into first downs rather than a fixed march. */
function bossPlayGain(mu, rng) {
  const g = mu + BOSS_SIM.GAIN_SD * gaussRand(rng);
  return Math.max(-6, Math.round(g));
}
/* A unit gaussian from the seeded rng, two draws averaged toward the middle. */
function gaussRand(rng) {
  let s = 0; for (let i = 0; i < 3; i++) s += rng();
  return (s - 1.5) / 0.5;   // mean 0, sd ~1
}
/* A field goal make, by kick distance. High and near automatic up close, falling with range,
   floored so a long try is a real gamble rather than a coin flip. */
function bossFgGood(yardsToGoal, rng) {
  const kick = yardsToGoal + 17;
  const p = Math.max(0.32, Math.min(0.99, 1.05 - Math.max(0, kick - 25) * 0.017));
  return rng() < p;
}

/*
 * PLAY ONE DRIVE, AUTO. Used both to fit mu and to run the boss's own possessions. Returns
 * the points scored and the yard the drive ended on. A team-relative frame: y is 0 at your
 * own goal and 100 at the opponent's, so 100 is a touchdown whichever side has the ball.
 */
function bossAutoDrive(mu, startY, rng, opts) {
  let y = startY, down = 1, toGo = 10, plays = 0;
  const desperate = opts && opts.desperate;
  while (plays++ < 30) {
    if (rng() < BOSS_SIM.TO_RATE) return { pts: 0, end: y, how: 'turnover' };
    if (down === 4) {
      const toGoal = 100 - y;
      if (toGoal <= BOSS_SIM.FG_MAX_YARD && !desperate) {
        return bossFgGood(toGoal, rng) ? { pts: 3, end: 100 - toGoal, how: 'fg' }
          : { pts: 0, end: y, how: 'miss' };
      }
      if (toGo > 3 && !desperate) return { pts: 0, end: y, how: 'punt' };
      // go for it
    }
    const gain = bossPlayGain(mu, rng);
    y += gain;
    if (y >= 100) return { pts: 6, end: 100, how: 'td' };
    if (y < 1) y = 1;
    if (gain >= toGo) { down = 1; toGo = 10; }
    else {
      toGo -= gain;
      if (down === 4) return { pts: 0, end: y, how: 'downs' };
      down++;
    }
  }
  return { pts: 0, end: y, how: 'end' };
}

/* Fit mu so the auto drive model scores about `target` points a drive. Monotonic in mu, so a
   short bisection settles it; a private fixed-seed rng keeps it deterministic and off the
   game stream. */
const bossMuCache = new Map();
function bossFitMu(target) {
  const key = Math.round(target * 20) / 20;   // 0.05 pts/drive buckets
  if (bossMuCache.has(key)) return bossMuCache.get(key);
  const avg = (mu) => {
    /* A fresh fixed-seed stream per mu so the fit is deterministic and independent of the
       game rng; the same stream each time keeps the bisection monotone. */
    const rng = createSeededRNG(hashSeed('boss-mu-fit'));
    let s = 0; const N = 1000;
    for (let i = 0; i < N; i++) s += bossAutoDrive(mu, BOSS_SIM.START_YARD, rng, null).pts;
    return s / N;
  };
  let lo = 1.2, hi = 9;
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (avg(mid) < key) lo = mid; else hi = mid; }
  const mu = (lo + hi) / 2;
  bossMuCache.set(key, mu);
  return mu;
}

/*
 * CREATE A BOSS GAME. Computes each team's expected points, applies the scout read to yours,
 * fits the two mus, and hands back the live state the advance/resolve pair drives.
 */
function bossSimCreate(roster, chemistryMultiplier, boss, oppRow, leagueAvgAllowed, read,
  constants = CONSTANTS, cal = null) {
  const rawMean = roster.reduce((s, p) => s + (p.ppr_ppg_mean || 0), 0);
  const structure = rosterStructure(roster).multiplier;
  const defMod = oppRow.pts_allowed_mean / leagueAvgAllowed;
  const yourInternal = rawMean * chemistryMultiplier * structure * defMod;
  const themInternal = oppRow.pts_scored_mean * constants.SCALE;
  const readRight = read != null && read === boss.weakTo;
  const readTrap = read != null && read === boss.trap;
  const readMult = readRight ? 1 + BOSS_READ_EDGE : readTrap ? 1 - BOSS_READ_EDGE / 2 : 1;
  const youExp = bossExpectedPoints(yourInternal, cal) * readMult;
  const themExp = bossExpectedPoints(themInternal, cal);
  const per = BOSS_SIM.DRIVES_PER_TEAM;
  return {
    you: 0, them: 0,
    youExp, themExp,
    muYou: bossFitMu(Math.max(0.3, youExp / per)),
    muThem: bossFitMu(Math.max(0.3, themExp / per)),
    read: read || null, readRight, readTrap,
    clock: 0, drives: [],
    pos: null, cur: null, pending: null, over: false, won: null,
    firstReceiver: null,
  };
}

/*
 * THE BOSSES, IN THE ORDER A RUN MEETS THEM. Every team_season_id here exists in
 * team_seasons.json and was checked against it rather than typed from memory. `tell` is what
 * the scout shows, written to point at the counter without naming it. `weakTo` is the attack
 * that works, `trap` the one this team eats alive; the third attack is neutral. `note` is the
 * one line the reward/relief screen and the scout share.
 *
 * ATTACK KEYS are the same three everywhere so the scout screen is a habit rather than a
 * puzzle re-learned each time: `air` throws it, `ground` runs it, `trick` gets aggressive and
 * gadgety. Which one beats a given boss is a fact about that boss's real weakness, not a
 * dice roll: the 2000 Ravens front was run-proof and beatable over the top, the 2013 Broncos
 * could be outscored but never out-passed.
 *
 * The list is walked by index and then cycled, so a run deep enough to see a seventh boss
 * meets the first one again a season older. Bosses ramp in difficulty across the first lap
 * by the strength of the real team, which is left to the data rather than a knob.
 */
const DYNASTY_BOSSES = [
  { team_season_id: 'SEA-2013', weakTo: 'air', trap: 'ground',
    tell: 'A secondary that swallows the run and dares you to throw deep.',
    note: 'the Legion of Boom' },
  { team_season_id: 'NE-2007', weakTo: 'ground', trap: 'air',
    tell: 'An offense that never punts. Keep it on the sideline and shorten the game.',
    note: 'the 16-0 Patriots' },
  { team_season_id: 'BAL-2000', weakTo: 'air', trap: 'ground',
    tell: 'The best run defense ever assembled. Do not try to run on it.',
    note: 'the 2000 Ravens' },
  { team_season_id: 'DEN-2013', weakTo: 'ground', trap: 'trick',
    tell: 'A record-setting passing attack. Out-score it by keeping it off the field.',
    note: 'the 606-point Broncos' },
  { team_season_id: 'TB-2002', weakTo: 'trick', trap: 'ground',
    tell: 'A Cover 2 that reads everything in front of it. You will need something it has not seen.',
    note: 'the 2002 Buccaneers' },
  { team_season_id: 'SF-2019', weakTo: 'air', trap: 'trick',
    tell: 'A four-man rush that gets home on its own. Get the ball out quick and over the top.',
    note: 'the 2019 49ers front' },
];

/* Which boss, if any, a season faces. Null in an ordinary season. */
function dynastyBossFor(seasonNo, every) {
  const step = every || DYNASTY_BOSS_EVERY;
  if (!seasonNo || seasonNo < step || seasonNo % step !== 0) return null;
  const idx = (seasonNo / step - 1) % DYNASTY_BOSSES.length;
  return { ...DYNASTY_BOSSES[idx], seasonNo, reward: dynastyBossReward(seasonNo, step) };
}

/*
 * WHAT BEATING THIS BOSS PAYS. The two rewards alternate down the ladder, and both are aimed
 * at the mode's one squeeze, the frozen cap closing on an ageing roster:
 *
 *   'deadwipe'  seasons 5, 15, 25 ...  every dead-money charge is cleared.
 *   'freeze'    seasons 10, 20, 30 ...  one man is held at his current age and salary, so a
 *                                       star stops declining for the rest of the run.
 *
 * Odd multiples of five wipe, even ones freeze, which is just the parity of season/5.
 */
function dynastyBossReward(seasonNo, every) {
  const step = every || DYNASTY_BOSS_EVERY;
  return (seasonNo / step) % 2 === 0 ? 'freeze' : 'deadwipe';
}

/* Absolute field yard (0 your goal, 100 theirs) from a team-relative yard (100 = the drive's
   own score). A 'them' drive runs the other way, so its relative yards mirror. */
function bossAbsYard(team, y) {
  const v = team === 'you' ? y : 100 - y;
  return Math.max(0, Math.min(100, v));
}
/* Where the ball sits, as a side of the field and a yard line, for the situation card. */
function bossBallSpot(y) {
  return y <= 50 ? { side: 'own', yard: Math.max(1, Math.round(y)) }
    : { side: 'opp', yard: Math.max(1, Math.round(100 - y)) };
}
/* The clock, split into quarters for display. */
function bossClock(sim) {
  const q = Math.min(4, Math.floor(sim.clock / 900) + 1);
  const rem = 900 - (sim.clock - (q - 1) * 900);
  return { quarter: q, secs: Math.max(0, Math.round(rem)) };
}
/* Two-point conversion odds, a shade under a coin flip and better for a strong offense. */
function bossTwoProb(sim) {
  return Math.max(0.30, Math.min(0.60, 0.40 + (sim.muYou - 4.5) * 0.05));
}
/* Whether a two-point try is a real question here: second half, game within a score or two. */
function bossTwoLive(sim) {
  return sim.clock >= 1800 && Math.abs(sim.you - sim.them) <= 10;
}
/* Whether the player's fourth down is a genuine go-or-not, worth stopping for. Short yardage
   in plus territory always is; late and trailing, any fourth down is. Everything else the sim
   handles itself, so the pauses stay rare and real. */
function bossGenuineFourth(sim, c) {
  const short = c.toGo <= 3 && c.y >= 52;
  const lateTrail = sim.clock >= 2400 && sim.you < sim.them && c.y >= 35;
  return short || lateTrail;
}

function bossStartDrive(sim, team, startY) {
  sim.pos = team;
  sim.cur = { team, y: startY, down: 1, toGo: Math.min(10, 100 - startY),
    startAbs: bossAbsYard(team, startY), tStart: sim.clock, plays: 0 };
}

/* Hand the ball over after a drive ends, and set the next start spot in the new team's own
   relative frame. */
function bossHandoff(sim, how, endY, scorer) {
  const other = scorer === 'you' ? 'them' : 'you';
  if (how === 'td' || how === 'fg') { sim.pos = other; sim.nextStart = BOSS_SIM.START_YARD; }
  else if (how === 'punt') {
    const land = Math.min(96, endY + BOSS_SIM.PUNT_NET);
    sim.pos = other; sim.nextStart = land >= 100 ? 25 : Math.max(1, 100 - land);
  } else { // downs, turnover, miss: other team takes the spot
    sim.pos = other; sim.nextStart = Math.max(1, 100 - endY);
  }
}

/*
 * FINISH A DRIVE. Records it for the field chart, banks the points, and either pauses for a
 * player's two-point try or hands the ball off. Returns the event the driver renders.
 */
function bossEndDrive(sim, how, endY, rng) {
  const c = sim.cur;
  const pts = how === 'td' ? 6 : how === 'fg' ? 3 : 0;
  const endRel = how === 'td' ? 100 : how === 'fg' ? Math.min(97, c.y) : c.y;
  const drive = { team: c.team, startYard: c.startAbs, endYard: bossAbsYard(c.team, endRel),
    result: how, tStart: c.tStart, tEnd: sim.clock, plays: c.plays };
  sim.drives.push(drive);
  sim[c.team] += pts;
  if (how === 'td' && c.team === 'you' && bossTwoLive(sim)) {
    // Pause for the PAT decision; the handoff waits until it is resolved.
    sim.pending = { kind: 'two', team: 'you', pat: { endY } };
    sim.cur = null;
    return { type: 'decision', decision: bossDecisionInfo(sim, drive) };
  }
  if (how === 'td') sim[c.team] += 1;   // automatic extra point otherwise
  bossHandoff(sim, how, endY, c.team);
  sim.cur = null;
  return { type: 'drive', drive, you: sim.you, them: sim.them, clock: bossClock(sim) };
}

/* The situation the card shows: score, clock, and for a fourth down the down, distance, spot
   and which safe option is on offer (a kick in range, a punt out of it). */
function bossDecisionInfo(sim, drive) {
  const p = sim.pending, cl = bossClock(sim);
  if (p.kind === 'two') {
    return { kind: 'two', quarter: cl.quarter, secs: cl.secs, you: sim.you, them: sim.them, drive };
  }
  const c = sim.cur, toGoal = 100 - c.y;
  return { kind: 'fourth', quarter: cl.quarter, secs: cl.secs, you: sim.you, them: sim.them,
    down: 4, toGo: Math.round(c.toGo), ball: bossBallSpot(c.y), toGoal: Math.round(toGoal),
    inFgRange: toGoal <= BOSS_SIM.FG_MAX_YARD };
}

/*
 * PLAY FORWARD until something the driver needs to show: a completed drive, a decision for the
 * player, or the final whistle. Re-entrant, so it is called again after each drive is drawn
 * and after each decision is resolved.
 */
function bossSimAdvance(sim, rng) {
  if (sim.over) return { type: 'over', won: sim.won, you: sim.you, them: sim.them };
  if (!sim.cur) {
    if (sim.clock >= 3600) {
      sim.over = true;
      sim.won = sim.you > sim.them || (sim.you === sim.them && sim.youExp >= sim.themExp);
      return { type: 'over', won: sim.won, you: sim.you, them: sim.them };
    }
    if (sim.pos == null) { sim.firstReceiver = rng() < 0.5 ? 'you' : 'them'; sim.pos = sim.firstReceiver; }
    bossStartDrive(sim, sim.pos, sim.nextStart != null ? sim.nextStart : BOSS_SIM.START_YARD);
    sim.nextStart = null;
  }
  const c = sim.cur;
  const mu = c.team === 'you' ? sim.muYou : sim.muThem;
  while (true) {
    if (rng() < BOSS_SIM.TO_RATE) return bossEndDrive(sim, 'turnover', c.y, rng);
    if (c.down === 4 && !c.forcedGo) {
      const toGoal = 100 - c.y;
      const trailing = sim[c.team] < sim[c.team === 'you' ? 'them' : 'you'];
      const desperate = sim.clock >= 3360 && trailing;
      if (c.team === 'you' && bossGenuineFourth(sim, c)) {
        sim.pending = { kind: 'fourth', team: 'you' };
        return { type: 'decision', decision: bossDecisionInfo(sim) };
      }
      if (toGoal <= BOSS_SIM.FG_MAX_YARD && !desperate) {
        return bossFgGood(toGoal, rng) ? bossEndDrive(sim, 'fg', c.y, rng)
          : bossEndDrive(sim, 'miss', c.y, rng);
      }
      if (toGoal > 5 && !desperate) return bossEndDrive(sim, 'punt', c.y, rng);
      // otherwise go for it
    }
    c.forcedGo = false;
    const gain = bossPlayGain(mu, rng);
    sim.clock += BOSS_SIM.PLAY_SECS;
    c.plays++;
    c.y += gain;
    if (c.y >= 100) return bossEndDrive(sim, 'td', 100, rng);
    if (c.y < 1) c.y = 1;
    if (gain >= c.toGo) { c.down = 1; c.toGo = Math.min(10, 100 - c.y); }
    else {
      c.toGo -= gain;
      if (c.down === 4) return bossEndDrive(sim, 'downs', c.y, rng);
      c.down++;
    }
  }
}

/*
 * RESOLVE A PLAYER DECISION and hand back to the driver, which calls advance again to keep
 * playing. A fourth-down go is a real play against the sticks: convert and the drive lives,
 * come up short and the ball changes hands where you were stopped. A two-point try adds two
 * or nothing; a kick adds the sure one.
 */
function bossSimResolve(sim, choice, rng) {
  const p = sim.pending; sim.pending = null;
  if (!p) return;
  if (p.kind === 'two') {
    const ok = choice === 'two' ? rng() < bossTwoProb(sim) : true;
    if (choice === 'two') sim.you += ok ? 2 : 0; else sim.you += 1;
    bossHandoff(sim, 'td', p.pat.endY, 'you');
    return { converted: choice === 'two' ? ok : null, choice };
  }
  // fourth down
  const c = sim.cur;
  if (choice === 'fg') {
    const toGoal = 100 - c.y;
    return { end: bossFgGood(toGoal, rng) ? bossEndDrive(sim, 'fg', c.y, rng)
      : bossEndDrive(sim, 'miss', c.y, rng), choice };
  }
  if (choice === 'punt') return { end: bossEndDrive(sim, 'punt', c.y, rng), choice };
  // go for it: one play against the sticks
  const gain = bossPlayGain(sim.muYou, rng);
  sim.clock += BOSS_SIM.PLAY_SECS; c.plays++;
  c.y += gain;
  if (c.y >= 100) return { converted: true, td: true, end: bossEndDrive(sim, 'td', 100, rng), choice };
  if (c.y < 1) c.y = 1;
  if (gain >= c.toGo) { c.down = 1; c.toGo = Math.min(10, 100 - c.y); c.forcedGo = false;
    return { converted: true, choice }; }
  return { converted: false, end: bossEndDrive(sim, 'downs', c.y, rng), choice };
}

const publicAPI = {
  API_VERSION: ENGINE_API_VERSION,
  CONSTANTS, ERAS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY,
  DUAL_POSITIONS, positionsOf, fillsSlot, positionLabel,
  hashSeed, createSeededRNG, sampleGamma,
  pairLinks, resolveChemistry,
  buildDivisionMap, generateSchedule, generatePlayoffs,
  DEFENSE_SLOTS, DEFENSE_POSITIONS, defenseStructure, detectDefenseScheme,
  DEFENSE_SCHEME_NAMES: Object.fromEntries(DEFENSE_SCHEMES.map(s => [s.key, s.name])),
  DEFENSE_SCHEME_TAGLINES: Object.fromEntries(DEFENSE_SCHEMES.map(s => {
    const i = s.strength.indexOf('. ');
    return [s.key, i < 0 ? s.strength : s.strength.slice(i + 2)];
  })),
  resolveGame, resolveGameDefense, defenseSuppression, defenseOverall, overallOf,
  /* FULL TEAM'S TWELVE, INTERLEAVED, and the order is the design rather than a listing.
     The draft fills slots in this order, so alternating them is what makes the shared cap
     felt continuously instead of discovered at pick seven: every offensive signing is
     immediately followed by a defensive one out of the same wallet. Six then six would let
     somebody spend $140M on an offense before the game ever mentioned a defense.

     It also makes the pool switch fall out for free. The draft screen asks which data set
     to spin at each pick, and with the sides interleaved that question is answered by the
     slot rather than by counting picks. */
  FULL_SLOTS: ['QB', 'DL', 'RB', 'DL', 'WR', 'LB', 'WR', 'DB', 'TE', 'DB', 'FLEX', 'FLEX'],
  resolveGameFull, splitSides,
  /* FLEX IS AMBIGUOUS IN THIS MODE AND IN NEITHER OF THE OTHER TWO, which is why this
     exists as its own table rather than as SLOT_ELIGIBILITY reused. Offense mode draws
     from the offensive pool and defense mode from the defensive one, so in both of them a
     FLEX open to 'RB','WR','TE','DL','LB','DB' can only ever be filled from the side the
     player is drafting. Full Team puts both pools on the board at once, and the same entry
     would then let somebody field seven defenders and call it a full team.

     Six a side is the mode. So the offensive FLEX takes a skill player and the defensive
     FLEX takes a defender, decided here, once, by INDEX into FULL_SLOTS rather than by
     slot name, because the two FLEX slots share a name and do not share an answer. */
  FULL_SLOT_POS: [
    ['QB'], ['DL'], ['RB'], ['DL'], ['WR'], ['LB'],
    ['WR'], ['DB'], ['TE'], ['DB'],
    /* THE LAST TWO ARE BOTH CALLED FLEX AND THEY ARE NOT THE SAME SLOT. Written out
       rather than derived, because the derivation was three lines of counting that nobody
       could check by eye, and this is a table with twelve rows. Slot 10 completes the
       offense and slot 11 completes the defense. */
    ['RB', 'WR', 'TE'], ['DL', 'LB', 'DB'],
  ],
  /* The Three Year Deal. Nothing in the live game reaches these yet. */
  DYNASTY_MAX_SEASONS, DYNASTY_CAP_GROWTH, DYNASTY_CONTINUITY_PER_YEAR,
  dynastyWinBar, dynastySurvives, DYNASTY_BASE_WINS, DYNASTY_STEP_SEASONS,
  DYNASTY_BOSS_EVERY, DYNASTY_BOSSES, BOSS_READ_EDGE, BOSS_SIM,
  dynastyBossFor, dynastyBossReward,
  bossExpectedPoints, bossSimCreate, bossSimAdvance, bossSimResolve, bossClock,
  GAUNTLET_POINTS, gauntletSeasonScore, gauntletRunScore,
  dynastySalary, dynastyAge, dynastyGoneFor, dynastyContinuity,
  DYNASTY_DEAD_SHARE, DYNASTY_DEAD_SEASONS, DYNASTY_DEAD_CEILING, dynastyDead,
  /* Measured, not chosen. See the sweep in simulator.js --fullteam. */
  FULL_CAP_MUSD: FULL_CAP_MUSD, FULL_TALENT: FULL_TALENT,
  fullStrength, fullOverall, fullParts, fullSideRatings,
  coachTable, coachPrice, coachEffect, coachLinks, COACH_MIN_SEASONS,
  PLAN, PLAN_AXES, normalizePlan, planFromCoach,
  resolveHeadToHead, playRun, prepareData, toFootballScore,
  playoffOpponent, LEGEND_IDS, LEGEND_TEAM_SEASONS,
  seedFromRecord, playoffRoundNames, PLAYOFF_ROUND_NAMES, playoffShare, finalEdge, finalRecordEase,
  weeklyEdge, weeklyEdgeVs,
  respinCost, respinFees, scoringScript, scoreParts, SCORE_KINDS,
  touchdownCredits, takeawayScript, lastName,
  fieldGoalYards, fieldGoalDistances, FIELD_GOAL_BANDS,
  eraCode, ERA_CODES,
  NICKNAMES, nickname, CITIES, city, cityLabel, TEAM_COLORS, teamColors, washColors,
  teamInk, teamButton, contrast, LINK_TIERS, linkTier, rosterStructure, STRUCTURE, coachReport,
  volatility, VOLATILITY,
  SCHEME_NAMES: Object.fromEntries(SCHEMES.map(s => [s.key, s.name])),
  /* The scheme's one-line description, taken from its strength note with the leading
     name stripped off, so the panel can show it as a tagline under the scheme name. */
  SCHEME_TAGLINES: Object.fromEntries(SCHEMES.map(s => {
    const cut = s.strength.indexOf('. ');
    return [s.key, cut >= 0 ? s.strength.slice(cut + 2) : s.strength];
  })),
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_ENGINE = publicAPI;
