# RunThePitch World Cup Edition
# Step 2 — Game Logic Engine
# File to create: gameLogic.js

We are building RunThePitch World Cup Edition — a browser-based World Cup squad-builder game at RunThe.gg.

Create a file called gameLogic.js in the current directory with everything below fully implemented, tested, and passing before you finish.

---

GAME RULES

6-round draft. Each round follows this sequence:
1. Spin country wheel — random country from dataset
2. Spin year wheel — random year, filtered to only years that country appeared in a World Cup
3. User picks one player from that squad to fill any open positional slot

Positional slots to fill: GK, DEF, DEF, MID, FWD, FLEX
FLEX accepts MID or FWD players only.
Slots can be filled in any order the user chooses.

Re-spins per game:
- 1x country re-spin: re-randomises both country AND year
- 1x year re-spin: keeps current country, re-randomises year only
- No full re-spins of any other kind

Player overalls are hidden during the entire draft.
User sees stats and height only while picking.
All overalls reveal simultaneously on the end screen.

Squad Identity is implicit — never shown or labelled to the user.
It is determined by the FLEX pick at the end:
- FLEX filled with MID = Balanced identity
- FLEX filled with FWD = Attacking identity
Identity is only used in the scoring engine backend.

Result tiers by final team score:
- 0 to 49:  Group Stage Exit
- 50 to 64: Round of 16
- 65 to 74: Quarter-finals
- 75 to 84: Semi-finals
- 85 to 94: Runner-up
- 95 to 100: World Cup Winners

Tiebreaker stack for contest modes (applied in order):
1. Time to complete — faster is better
2. Coherence score — how well squad construction matches identity
3. Spin difficulty rating — never shown to the player

Daily Challenge mode uses date-seeded deterministic spins.
Same date = same country/year sequence for every player worldwide.
Uses mulberry32 algorithm for the seeded RNG.

Share card is spoiler-free:
- Green circle = strong pick (overall 80 or above)
- Yellow circle = average pick (overall 65 to 79)
- Red circle = weak pick (overall below 65)
- Format: game name, result label, score, emoji grid, RunThe.gg/pitch

---

PLAYER OBJECT SHAPE

Every player in the dataset uses this exact structure:

{
  "player_id": "fra_2022_mbappe",
  "name": "Kylian Mbappe",
  "country": "France",
  "year": 2022,
  "position": "GK or DEF or MID or FWD",
  "height": 178,
  "appearances": 7,
  "goals": 8,
  "assists": 2,
  "minutes": 630,
  "clean_sheets": null,
  "goals_conceded": null,
  "saves": null,
  "save_pct": null,
  "tackles": null,
  "interceptions": null,
  "clearances": null,
  "pass_completion": null,
  "key_passes": null,
  "chances_created": null,
  "dribbles": null,
  "shots_per90": null,
  "shots_on_target_pct": null,
  "yellow_cards": null,
  "red_cards": null,
  "is_2026": false,
  "club_league_tier": null
}

GK fields: clean_sheets, goals_conceded, saves, save_pct
DEF fields: tackles, interceptions, clearances, pass_completion
MID fields: key_passes, chances_created, pass_completion, dribbles
FWD fields: shots_per90, shots_on_target_pct, dribbles, key_passes
All other position fields should be null.

---

OVERALL CALCULATION

All stats are per-90 normalized before calculation.
Formula varies by position.

GK formula:
- Save rate: 40 percent weight
  Calculated as: saves divided by (saves plus goals conceded) times 100
- Clean sheet rate: 35 percent weight
  Calculated as: clean sheets divided by appearances times 100
- Goals conceded per 90: 25 percent weight
  Inverse metric — lower is better
  Score: 100 minus (goals conceded per 90 times 50), clamped 0 to 100

DEF formula:
- Defensive contribution: 45 percent weight
  Modern era: tackles plus interceptions per 90, scaled to 0-100
  Classic era (no tackles/interceptions data): proxy from appearances
- Goal contributions: 30 percent weight
  Goals plus assists per 90, scaled to 0-100
- Availability: 25 percent weight
  Appearances divided by 7 times 100, clamped to 100

MID formula:
- Goal contributions: 45 percent weight
  Goals plus assists per 90, scaled to 0-100
- Creativity: 30 percent weight
  Modern era: key passes per 90, scaled to 0-100
  Classic era: assist rate proxy
- Availability: 25 percent weight
  Same as DEF

FWD formula:
- Goal rate: 55 percent weight
  Goals per 90, scaled to 0-100
- Total contributions: 30 percent weight
  Goals plus assists per 90, scaled to 0-100
- Availability: 15 percent weight
  Same as DEF

League difficulty multiplier for is_2026 players:
- ELITE: 1.00 (Premier League, La Liga, Bundesliga, Serie A, Ligue 1)
- HIGH: 0.92 (Primeira Liga, Eredivisie, Pro League)
- MID: 0.84 (MLS, Liga MX, Brasileirao)
- LOWER: 0.76 (all other leagues)

Final overall curve:
- Raw score 0 to 75 maps linearly to final 40 to 82
- Raw score 75 to 100 maps exponentially to final 82 to 99
- No player can be below 40 or above 99
- The curve makes 95 plus overalls genuinely rare

---

SQUAD IDENTITY WEIGHTS

Applied to player overalls in the scoring engine.
Never exposed to the user.

BALANCED identity (FLEX was MID):
- GK:   multiply by 1.15
- DEF:  multiply by 1.10
- MID:  multiply by 1.05
- FWD:  multiply by 0.90
- FLEX: multiply by 1.05

ATTACKING identity (FLEX was FWD):
- GK:   multiply by 0.90
- DEF:  multiply by 0.90
- MID:  multiply by 1.00
- FWD:  multiply by 1.15
- FLEX: multiply by 1.10

---

REQUIRED FUNCTIONS

Implement every function listed below. All functions must be fully working.

Data and engine:
- initEngine(playerArray)
  Loads player array, computes overall for every player, builds country to year index.
  Call once after loading JSON data.

- getAllCountries()
  Returns sorted array of all countries in the dataset.

- getYearsForCountry(country)
  Returns sorted array of valid World Cup years for a given country.

- getSquad(country, year)
  Returns array of all players for that country and year combination.

Game state:
- createGameState()
  Returns a fresh game session object with:
  picks (empty array), openSlots (GK DEF DEF MID FWD FLEX),
  filledSlots object, respins (country:1, year:1),
  phase (SPINNING), startTime, endTime (null), result (null)

Spin mechanic:
- spinCountry(state)
  Returns a random country string. Does not modify state.
  Frontend animates, then calls confirmSpin.

- spinYear(country)
  Returns a random valid year for that country.
  Only years that country appeared in a World Cup are eligible.

- confirmSpin(state, country, year)
  Loads squad, sets currentSpin on state, transitions phase to SELECTING.
  Returns updated state.

- useCountryRespin(state)
  Consumes the country re-spin budget.
  Re-randomises both country and year.
  Returns updated state plus newCountry and newYear.
  Throws if no country re-spins remain.

- useYearRespin(state)
  Consumes the year re-spin budget.
  Keeps current country, re-randomises year only.
  Returns updated state plus newYear.
  Throws if no year re-spins remain.

Player selection:
- getAvailableSlots(state)
  Returns array of open positional slots.

- selectPlayer(state, playerId, slotPosition)
  Assigns a player from the current squad to a slot.
  Validates: slot must be open, player must be in current squad,
  FLEX slot only accepts MID or FWD players,
  non-FLEX slots must match player position.
  Records the pick, updates filledSlots, removes slot from openSlots,
  clears currentSpin, transitions phase.
  When all 6 slots filled: sets phase to COMPLETE, sets endTime,
  calls computeResult and stores on state.result.
  Otherwise sets phase back to SPINNING.
  Returns updated state.

Identity and scoring:
- getSquadIdentity(state)
  Returns BALANCED if FLEX was filled with MID.
  Returns ATTACKING if FLEX was filled with FWD.
  Returns null if FLEX not yet filled.

- computeResult(state)
  Full scoring pipeline. Returns result object containing:
  teamOverall (0-100), resultLabel, resultEmoji, identity,
  coherenceScore, scoredPicks array, tiebreakers object.

  Scoring steps:
  1. Get identity and weights
  2. For each pick: multiply player overall by position weight, accumulate
  3. Calculate weighted average
  4. Calculate coherence score (0-100): how well boosted positions
     outperform neutral positions for the chosen identity
  5. Apply coherence bonus: (coherenceScore minus 50) times 0.15,
     maximum plus or minus 7.5 points
  6. Apply non-linear team curve to get final teamOverall
  7. Look up result tier from RESULT_TIERS
  8. Calculate tiebreakers: timeSeconds, coherenceScore, spinDifficulty

- generateMatchReport(result)
  Returns a spoiler-free multi-line string.
  Line 1: RunThePitch: World Cup Edition with soccer ball emoji
  Line 2: result label and emoji, score out of 100
  Line 3: emoji grid (green/yellow/red per pick quality)
  Line 4: RunThe.gg/pitch
  Player names and countries are NOT included.

Daily challenge:
- getDailyChallengeSeed(dateString)
  Takes a date string in YYYY-MM-DD format.
  Returns a deterministic numeric seed.
  Same date always returns same seed.

- createSeededRNG(seed)
  Returns a seeded pseudo-random number generator using mulberry32.
  Calling the returned function produces floats between 0 and 1.
  Same seed always produces the same sequence.

- spinCountrySeeded(rng)
  Like spinCountry but uses the seeded RNG instead of Math.random.

- spinYearSeeded(country, rng)
  Like spinYear but uses the seeded RNG instead of Math.random.

Utilities:
- getGameSummary(state)
  Returns a plain text string summarising current game state.
  Useful for debugging. Shows phase, all picks with overalls,
  open slots, re-spins remaining, and result if complete.

Exports:
- Export all public functions via module.exports
- Also attach to window object for browser use:
  if (typeof window !== undefined) window.RunThePitch = exports

---

MOCK DATA AND TESTS

After writing gameLogic.js, do the following in the same file:

1. Create a mock dataset of exactly 24 players:
   Brazil 1970: Pele (FWD), Jairzinho (FWD), Gerson (MID),
   Carlos Alberto (DEF), Brito (DEF), Felix (GK)
   Argentina 1986: Maradona (MID), Valdano (FWD), Burruchaga (MID),
   Ruggeri (DEF), Brown (DEF), Pumpido (GK)
   France 2022: Mbappe (FWD), Griezmann (MID), Tchouameni (MID),
   Varane (DEF), Kounde (DEF), Lloris (GK)
   England 2026: Bellingham (MID, is_2026:true, club_league_tier:ELITE),
   Kane (FWD, is_2026:true, club_league_tier:ELITE),
   Saka (FWD, is_2026:true, club_league_tier:ELITE),
   Rice (MID, is_2026:true, club_league_tier:ELITE),
   Trippier (DEF, is_2026:true, club_league_tier:ELITE),
   Ramsdale (GK, is_2026:true, club_league_tier:ELITE)
   Give each player realistic stats matching their actual performances.
   2026 players get club season stats with appearances around 30 to 35.

2. Write a self-test suite that runs with node gameLogic.js.
   Use console.assert for each check.

   Test 1 - Engine init:
   Confirm getAllCountries returns 4 countries.
   Confirm total player count is 24.

   Test 2 - Year filtering:
   Brazil years contains 1970 but not 1986.
   Argentina years contains 1986 but not 1970.
   England years contains 2026.

   Test 3 - Overall ratings sanity:
   Pele overall is 80 or above.
   Maradona overall is 85 or above.
   All 24 players have overall between 40 and 99.

   Test 4 - Full 6-pick game simulation:
   Create a new game state.
   Round 1: confirmSpin Brazil 1970, selectPlayer Pele to FWD slot.
   Round 2: confirmSpin Argentina 1986, selectPlayer Maradona to MID slot.
   Round 3: confirmSpin France 2022, selectPlayer Lloris to GK slot.
   Round 4: confirmSpin Argentina 1986, selectPlayer Ruggeri to DEF slot.
   Round 5: confirmSpin Brazil 1970, selectPlayer Carlos Alberto to DEF slot.
   Round 6: confirmSpin France 2022, selectPlayer Mbappe to FLEX slot.
   Assert phase is COMPLETE.
   Assert result is not null.
   Assert identity is ATTACKING.
   Assert teamOverall is between 40 and 100.
   Assert resultLabel is one of the valid tier labels.

   Test 5 - Match report:
   Generate match report from completed game.
   Assert it contains RunThePitch.
   Assert it contains the result label.
   Assert it contains RunThe.gg/pitch.
   Print the full match report to console.

   Test 6 - Re-spin mechanic:
   Create new game state and confirmSpin Brazil 1970.
   Assert respins.country equals 1.
   Call useCountryRespin. Assert respins.country equals 0.
   Assert currentSpin has valid country and year.
   Assert calling useCountryRespin again throws an error.
   Create another game state and confirmSpin Argentina 1986.
   Call useYearRespin. Assert respins.year equals 0.
   Assert country is still Argentina.
   Assert calling useYearRespin again throws an error.

   Test 7 - Daily challenge seed:
   Get seed for 2026-06-11 twice. Assert both are equal.
   Get seed for 2026-06-12. Assert it differs from 2026-06-11.
   Create two RNGs with the same seed.
   Assert spinCountrySeeded returns same country from both.

3. Run node gameLogic.js.
   Fix any errors or failing assertions.
   Re-run until every test passes.
   Print final line: ALL TESTS PASSED — gameLogic.js is ready.

---

FINAL CHECKLIST

Before finishing confirm all of the following:
- gameLogic.js exists in the current directory
- All required functions are implemented and exported
- Mock data covers all 4 countries with 6 players each
- All 7 tests pass with zero assertion failures
- Final output line reads: ALL TESTS PASSED — gameLogic.js is ready
- File is clean, well-commented, and production ready