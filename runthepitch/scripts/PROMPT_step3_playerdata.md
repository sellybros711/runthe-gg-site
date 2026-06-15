# RunThePitch World Cup Edition
# Step 3 — Player Data JSON (2022 World Cup)
# File to create: data/players_2022.json

We are building RunThePitch World Cup Edition at RunThe.gg.
The game engine is already built in gameLogic.js.

Your task: Create data/players_2022.json containing every player
from all 32 nations that participated in the 2022 FIFA World Cup
in Qatar.

---

PLAYER OBJECT SHAPE

Every player must use this exact structure. Do not add or remove fields.

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

---

POSITION RULES

Use exactly one of these four values for position: GK, DEF, MID, FWD
Assign each player their primary position only.
A player who played both DEF and MID gets whichever was their main role.

---

PLAYER ID FORMAT

Format: [3-letter country code]_2022_[lastname_lowercase]
Examples: fra_2022_mbappe, bra_2022_richarlison, arg_2022_messi
For duplicate surnames on the same squad add _2 or _3:
Example: two players named Silva on Brazil = bra_2022_silva and bra_2022_silva_2
Use FIFA 3-letter country codes throughout.

---

STATS RULES

Only use real verified stats from the 2022 World Cup.
If a stat is unknown or unverified, use null — never estimate or fabricate.
All stats reflect that player's performance in Qatar 2022 only.

GK players: populate clean_sheets, goals_conceded, saves, save_pct
Set all other GK fields to null for non-GK players.

DEF players: populate tackles, interceptions, clearances, pass_completion
where FBref data is available. Use null for unknown values.

MID players: populate key_passes, chances_created, pass_completion, dribbles
where FBref data is available. Use null for unknown values.

FWD players: populate shots_per90, shots_on_target_pct, dribbles, key_passes
where FBref data is available. Use null for unknown values.

appearances = number of matches played (not started, played)
minutes = actual minutes played in the tournament
goals and assists = tournament total
yellow_cards and red_cards = tournament total
is_2026 = false for all players in this file
club_league_tier = null for all players in this file

---

32 NATIONS TO INCLUDE

Work through these groups in order. Complete one group fully before moving to the next.

Group A: Qatar, Ecuador, Senegal, Netherlands
Group B: England, Iran, USA, Wales
Group C: Argentina, Saudi Arabia, Mexico, Poland
Group D: France, Australia, Denmark, Tunisia
Group E: Spain, Costa Rica, Germany, Japan
Group F: Belgium, Canada, Morocco, Croatia
Group G: Brazil, Serbia, Switzerland, Cameroon
Group H: Portugal, Ghana, Uruguay, South Korea

Include all squad members who appeared in at least one match.
For players who did not play a single minute, you may omit them.
Each squad should have between 15 and 23 players.

---

QUALITY CHECKS

After generating all 32 squads, run these checks:

1. Count total players — should be between 500 and 750
2. Confirm every object has all required fields
3. Confirm no position value other than GK, DEF, MID, FWD exists
4. Confirm all player_id values are unique
5. Confirm year is 2022 for every player
6. Confirm is_2026 is false for every player
7. Confirm no player has null for name, country, position, height, appearances, goals, assists, minutes

Write a validation script called validate_2022.js that runs these
checks and prints PASS or FAIL for each one.
Run it with node validate_2022.js and fix any failures before finishing.

---

OUTPUT FORMAT

Write the output as a valid JSON array to data/players_2022.json.
No markdown, no backticks, no comments inside the JSON — pure valid JSON only.
The file must be loadable with:
const players = JSON.parse(fs.readFileSync('data/players_2022.json', 'utf8'))
without any errors.

---

WORK IN BATCHES

Do not try to generate all 32 squads at once.
Work one group at a time (4 squads per batch).
After each group, pause and confirm the JSON is valid before continuing.
When all 8 groups are complete, merge into one array in players_2022.json.

---

FINAL CHECKLIST

Before finishing confirm all of the following:
- data/players_2022.json exists and contains all 32 squads
- validate_2022.js runs and all checks pass
- Total player count is between 500 and 750
- All player_id values are unique
- File loads without errors
- Print final line: ALL CHECKS PASSED — players_2022.json is ready