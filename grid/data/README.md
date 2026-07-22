# RunTheGrid — shared content corpus

**This folder is the single source of truth for both games.** Daily Match and the
Daily Crossword both read from the `*.json` files here. Add data here, rebuild,
and both games get richer. Nothing else needs to change.

`matching/entities.js` is **generated** from these files — never hand-edit it.

## The loop (do this to add content)

1. **Generate JSON in a regular claude.ai chat** (browser — not this code session).
   Paste the prompt in [PROMPT.md](./PROMPT.md), one chunk at a time.
2. **Save each result** as a file here, named `<type>-<chunk>.json`, e.g.
   `athletes-nba-tier5.json`, `teams-nfl.json`, `terms-golf.json`.
   Each file is a JSON array of objects in the schema below.
3. **Build + validate:**
   ```
   node grid/build-corpus.js            # validates, dedupes, writes entities.js
   node grid/matching/verify-generator.js   # confirms boards still generate + report
   ```
   The build FAILS on malformed JSON or duplicate ids, and warns (then drops)
   off-vocabulary awards. Well-formed but factually wrong tags still need a human
   eye — see "Accuracy" below.

`athletes.seed.json` is the working example — copy its shape.

## Schema

```jsonc
// ATHLETE / COACH  (the tagged core Daily Match builds categories from)
{
  "id": "nba_lebron_james",        // lowercase sport_first_last — UNIQUE, the join key
  "name": "LeBron James",
  "type": "athlete",               // athlete | coach
  "sport": "NBA",                  // NFL NBA MLB NHL Golf Tennis Soccer Boxing UFC Olympics
  "fame": 5,                       // 5 household · 4 serious-fan · 3 solid pro · 2 deep · 1 obscure
  "teams": ["Cleveland Cavaliers","Miami Heat","Los Angeles Lakers"],
  "jersey": [23, 6],               // well-known numbers only; omit if unsure
  "draftYear": 2003,               // omit if unknown/NA
  "draftPick": 1,                  // overall pick; omit if unknown
  "college": "Duke",               // omit if none/unknown
  "birthPlace": "Ohio",            // US state, or country if foreign; omit if unsure
  "position": "Forward",
  "awards": ["NBA MVP","Finals MVP","Rookie of the Year","Scoring Champion"],
  "championships": 4,
  "milestones": ["30,000 Point Club","40,000 Point Club"],
  "nicknames": ["King James"],
  "crosswordClue": "Four-time NBA MVP nicknamed 'King'"
}

// TEAM  (crossword fill + Match roster/city/mascot categories)
{ "id":"team_nfl_cowboys", "type":"team", "sport":"NFL", "name":"Dallas Cowboys",
  "city":"Dallas", "state":"Texas", "mascot":"Cowboys", "nickname":"America's Team", "fame":5 }

// TERM  (crossword fill + Match "name is also a sports term" wordplay)
{ "id":"term_golf_birdie", "type":"term", "sport":"Golf", "term":"Birdie",
  "definition":"One stroke under par", "fame":4 }
```

## Controlled vocabulary

Categories only group on **exact string matches**, so `awards` and `milestones`
must use these strings verbatim. The builder drops anything not on the list.

- **NBA awards:** NBA MVP · Finals MVP · Defensive Player of the Year · Rookie of the Year · Sixth Man of the Year · Scoring Champion · All-Star · All-NBA · Hall of Fame
  **milestones:** 40,000 Point Club · 30,000 Point Club · 20,000 Point Club
- **NFL awards:** NFL MVP · Super Bowl MVP · Offensive Player of the Year · Defensive Player of the Year · Offensive Rookie of the Year · Defensive Rookie of the Year · Pro Bowl · First-Team All-Pro · Hall of Fame
  **milestones:** 2,000-Yard Season · 10,000 Rushing Yards · 50,000 Passing Yards · 100 Career TDs
- **MLB awards:** MLB MVP · Cy Young · World Series Champion · Rookie of the Year · Gold Glove · Silver Slugger · All-Star · Batting Title · Hall of Fame
  **milestones:** 500 Home Run Club · 3,000 Hit Club · 300 Win Club · 3,000 Strikeout Club

To add a new award/milestone type, add the string to `AWARDS`/`MILES` in
`grid/build-corpus.js` first, then use it in the data.

## Accuracy

The uniqueness solver guarantees every board is fair **given the tags** — it
cannot tell a factually wrong tag from a right one. A chat-generated athlete file
will be ~10–20% wrong on structured facts (draft year, jersey, awards). Two
defenses:
- The prompt tells the model to **omit any field it isn't sure of** (omitting is
  free; a wrong value is a bug).
- Prefer authoritative sources for the risky fields — Lahman DB (MLB), nflverse
  (NFL), basketball-reference (NBA) — and use the chat mainly for low-risk
  enumerables (teams, cities, colleges, terms, coaches).

## Two games, no overlap

The dataset does **not** prevent the two games from colliding — the engine does,
at runtime: one daily seed builds both games, and a shared usage ledger (keyed on
these `id`s) excludes any name/team/term featured in one game from the other that
day, and honors cooldowns. That's why every entry needs a **stable, unique id**.
