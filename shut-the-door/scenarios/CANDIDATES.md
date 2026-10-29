# Shut The Door: candidate scenarios, verified from data

Status: for the owner's approval. No pack is built until the list is approved.
Built by Agent A on 2026-10-17 from `shut-the-door/data/verify/*.json`. The pipeline in
`shut-the-door/pipeline/` (`verify_scenarios.py`, `closers.py`) writes those files, and
`shut-the-door-data.yml` rebuilds them. Every fact below is read from the data named in that
spot's sources. Anything the data could not settle is marked **unverified**.

Outcomes use the contract's end rules (CONTRACT.md section 8). A run that ties ends the outing
door's open. A go-ahead run is a walk-off only when the home team is batting in the 9th or later.
One swing that ties and goes ahead is decided by the go-ahead rule. So a real outcome here can
differ from how the game is remembered (see flag 1).

**The end rules changed on 2026-10-20 (the owner's call).** A run that ties no longer ends the
outing: three outs with the game still tied is a held tie (`tie_held`), and a later go-ahead run is
a walk-off or door's open as before. This list is the record of the 2026-10-17 approval and keeps
the old results. Under the new rules, from the same play by play in `data/verify`, three of the ten
change: #4 Chapman is a held tie (Crisp singled, Gomes struck out: 21 pitches, 3 runs, faced 4),
#6 Feliz is a held tie (Molina lined out: 22 pitches, 2 runs, faced 6), and #10 Rivera is a
walk-off (Counsell hit by a pitch, Gonzalez singled: 14 pitches, 2 runs, faced 6). The packs'
reveals and the verify files carry the new results.

## The list

| # | spot | pitcher | hand | start | faced | real result (end rules) | pitches | verified |
|---|---|---|---|---|---|---|---|---|
| 1 | 2025 WS G7, LAD at TOR | Yoshinobu Yamamoto | R | bottom 11, 0 out, empty, up 5-4 | 4 | door shut, 0 runs | 14 | yes |
| 2 | 2024 WS G5, LAD at NYY | Walker Buehler | R | bottom 9, 0 out, empty, up 7-6 | 3 | door shut, 0 runs | 16 | yes |
| 3 | 2016 WS G7, CHC at CLE | Mike Montgomery | L | bottom 10, 2 out, man on 1st, up 8-7 | 1 | door shut, 0 runs | 2 | yes |
| 4 | 2016 WS G7, CHC at CLE | Aroldis Chapman | L | bottom 8, 2 out, man on 1st, up 6-3 | 2 | door's open, 3 runs | 14 | yes |
| 5 | 2019 NL WC, MIL at WSH | Josh Hader | L | bottom 8, 0 out, empty, up 3-1 | 6 | door's open, 3 runs | 30 | yes |
| 6 | 2011 WS G6, TEX at STL | Neftalí Feliz | R | bottom 9, 0 out, empty, up 7-5 | 5 | door's open, 2 runs | 20 | yes |
| 7 | 2025-09-05, NYM at CIN | Edwin Díaz (proposed) | R | bottom 9, 0 out, empty, up 5-4 | 6 | door shut, 0 runs | 30 | yes |
| 7 alt | 2023-04-16, MIL at SD | Devin Williams (proposed) | R | bottom 9, 0 out, empty, up 1-0 | 6 | door shut, 0 runs | 33 | yes |
| 8 | 2025-06-27, LAD at KC | Tanner Scott (proposed) | L | bottom 9, 0 out, empty, up 5-4 | 5 | door shut, 0 runs | 16 | yes |
| 8 alt | 2024-08-10, HOU at BOS | Josh Hader (proposed) | L | bottom 9, 0 out, empty, up 5-4 | 4 | door shut, 0 runs | 16 | yes |
| 9 | 1988 WS G1, OAK at LAD | Dennis Eckersley | R | bottom 9, 0 out, empty, up 4-3 | 4 | walk-off, 2 runs | **unverified** (13 known) | proxy: yes, pitch count partly |
| 10 | 2001 WS G7, NYY at ARI | Mariano Rivera | R | bottom 9, 0 out, empty, up 2-1 | 4 | **door's open**, 1 run | 10 | proxy: yes |

Alternates, also verified: Jansen 2017 WS G2 (top 9, door's open on the first batter, 3 pitches),
Pressly 2022 WS G6 (top 9, up 4-1, door shut in 7 pitches), Mitch Williams 1993 WS G6 (proxy, LHP,
walk-off, 21 pitches), Lidge 2005 NLCS G5 (proxy, top 9, door's open, 20 pitches).

Hands: every pitcher's throwing hand is Savant's `p_throws` (real) or the Retrosheet roster (proxy).
Every batter's side is the side he hit from against this pitcher: Savant's `stand` (real), or the
roster's bat hand with a switch hitter put on the side opposite the pitcher (proxy).

## What the data contradicts or adds (flags)

1. **#10 Rivera is not a walk-off under the end rules.** Womack's one-out double tied it 2-2, and
   the contract ends the outing there, door's open. Gonzalez's walk-off single came two batters
   later (after Counsell was hit by a pitch). The PLAN says walk-off. Either the reveal says door's
   open, or the lead changes the end rules for this spot. Rivera also entered in the bottom of the
   8th (struck out three that inning). The spot is his second inning.
2. **#9 Eckersley's pitch count is unverified.** Retrosheet has no pitch sequence for Scioscia's
   pop-up or Hamilton's strikeout (count `??`). Davis (5 pitches, walk) and Gibson (8 pitches,
   home run) are known: 13 known pitches. The reveal's `pitches` needs a source or must be left out.
   The result itself is right: Gibson's two-run homer ties and goes ahead in one swing, so the
   go-ahead rule makes it a walk-off.
3. **#3 Montgomery is one batter and two pitches.** The facts match the PLAN. As a daily it is
   very short, and the band spread risk in the PLAN applies most here. Worth weighing before
   approval.
4. **The PLAN's alternate, Jansen 2017 WS G2, is one batter in the 9th.** Jansen entered in the top
   of the 8th (0 out, man on 2nd, up 3-1) and allowed a run there. In the 9th Marwin González
   homered on his third pitch to tie it 3-3. Door's open, not a walk-off (the Dodgers were home).
5. **#1 Yamamoto entered in the 9th, tied.** He came in in the bottom of the 9th at 4-4 with one
   out and men on 1st and 2nd, then pitched the 10th, also tied. Neither was a save spot. The
   11th, up 5-4 after Will Smith's homer, is the spot, as the PLAN says. It holds a sacrifice bunt
   (Kiner-Falefa), and v1 has no bunts. Rivera's 9th (#10) holds two bunts. The reveal tells the
   real story. The engine plays them as normal plate appearances.
6. **Yamamoto (2025) and Buehler (2024) were starters that season.** Their regular-season usage is
   a starter's mix (Yamamoto threw 7 pitch types). Both tables are given below. Usage from the
   postseason, or from his relief outings, would fit the spot better. The contract says "that
   season". The lead decides which.
7. **Savant calls Hader's fastball a sinker (SI)** in 2019 (84%), 2023 and 2024. Through `SHAPE_OF`
   that draws as `run`. If the UI should show it riding, that is a contract question, not a data
   one.
8. **Pitch codes outside the contract** turned up in arsenals: `IN` (intentional ball) and `FA`.
   They are dropped from usage and counted in each spot's `dropped` field (Feliz 2011, Montgomery
   2016).
9. **Emmanuel Clase leads 2023-2025 in saves by this count (111), and the search ranked his
   2025-06-17 outing third among right-handers.** He is not proposed. Public reporting in 2025 (not
   verified here) put him on leave in a betting investigation. That is the owner's call, flagged so
   the omission is visible.
10. **#5 Hader 2019 and #4 Chapman 2016 end in the 8th, so neither can be a walk-off.** Both are
    door's open, as the PLAN says. Hader faced six: Robles struck out, Taylor was hit by a pitch,
    Turner struck out, Zimmerman singled, Rendon walked, Soto singled, Grisham misplayed it in right, and three
    scored (Soto was then thrown out at third). Chapman faced two: Guyer doubled in a run, Davis homered to tie it 6-6.

## How the regular-season slots were chosen (#7, #8)

Source: the ninth inning of every 2023-2025 regular-season game on Savant (184,993 pitches,
library slices `ninth-2023` to `ninth-2025`). Method, in `closers.py`:

- A save-rule entry: the pitcher who finished the 9th for the team ahead, who came in that half
  with a lead of three or fewer (or the tying run on base, at bat or on deck). 3,791 such entries,
  3,382 held.
- A top closer: 40 or more of those saves over the three seasons (28 pitchers, 3 of them
  left-handed: Hader 96, Scott 54, Chapman 52).
- The spot the game plays best: he starts the 9th, nobody on, up one, and faces at least four. All
  of these share one entry state, so leverage at entry cannot rank them (LI9 2.99 for the bottom of
  the 9th; MLB's own `leverageIndex` for his first plate appearance, from the Stats
  API, is 3.47 on every bottom-of-the-9th one checked).
  They are ranked by the outing's total win-expectancy swing (the sum of Savant's
  `delta_home_win_exp`, absolute, over his pitches): how much each pitch mattered.

**RHP, door shut:** Edwin Díaz at Cincinnati, 2025-09-05, is first by a distance (swing 1.94). He
loaded the bases with nobody out (single, two walks), then struck out Marte and De La Cruz and got
Lux on a grounder. Six batters, 30 pitches, two pitches (four-seam, slider). Devin Williams at San
Diego, 2023-04-16, is second (1.53): a 1-0 game, Soto walked, then a full house with two out before
Grisham was called out on strikes. Six batters, 33 pitches, his changeup 58% of his pitches.

**LHP, either result:** Tanner Scott at Kansas City, 2025-06-27, is the top held one (1.27): Witt
called out, then single, walk, single to load them, and Caglianone grounded into a double play.
Hader at Boston, 2024-08-10, is the next distinct pitcher (0.85): Devers led off with a double, and
three outs followed. Hader is already #5, so Scott is the first choice. Two blown ones are verified
below in case the owner wants an open door here instead: Hader at St. Louis 2023-08-30 (Edman's
walk-off two-run homer) and Scott against Atlanta 2024-04-14 (Ozuna's three-run homer in the top
of the 9th, door's open).

Win expectancy, leverage and the ranking are Savant's and the Stats API's numbers, not a
re-derivation. LI9 is the pipeline's own: the mean absolute swing of ninth-inning plate
appearances from a state, over the mean of all ninth-inning plate appearances.

## Sources, in general

- Baseball Savant Statcast search (CSV), by `game_pk` for each game, and by pitcher and season for
  each arsenal. PITCHf/x for 2011 and 2016 is served by the same search.
- MLB Stats API: the schedule (to find the game), the live feed (play descriptions, box score
  batting order), people with season stats (names, listed bat side, season lines), win probability.
- Retrosheet event files, rosters and game logs, read from the Chadwick Bureau's mirror on GitHub.
  The information used here was obtained free of charge from and is copyrighted by Retrosheet.
  Interested parties may contact Retrosheet at www.retrosheet.org.
- The Chadwick Bureau register, for Retrosheet to MLBAM ids on the proxy spots.

A proxy spot's results are Retrosheet event codes: `S8` single to center, `D9` double to right,
`HR` home run, `W` walk, `HP` hit by pitch, `K` strikeout, `FC1` fielder's choice to the pitcher,
`6/P` pop-up to short, `E1` an error by the pitcher, and `.2-H` the runner on 2nd scores.

Each spot's own sources are listed with it. Velocities are Savant's `release_speed`, averaged.
Usage is the share of his pitches of that type that season. The `pfx` movement is in each
`data/verify/<id>.json`. The proxy spots have no tracked arsenal: it comes from public reporting at
pack build and is unverified here.

## The spots in detail

### 1. Yamamoto, 2025 World Series Game 7 (real)

- **Game:** 2025-11-01 · World Series Game 7: Los Angeles Dodgers at Toronto Blue Jays · game_pk 813024
- **Pitcher:** Yoshinobu Yamamoto (RHP), Los Angeles Dodgers. Season: 2.49 ERA, 0 SV, 173.2 IP
- **Spot:** bottom 11, 0 out, bases empty, us 5 them 4, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Vladimir Guerrero Jr. | R | .292/.381/.467, 23 HR | 6 | Vladimir Guerrero Jr. doubles (5) on a line drive to left fielder Enrique Hernández. |
| 2 | Isiah Kiner-Falefa | R | .262/.297/.334, 2 HR | 1 | Isiah Kiner-Falefa out on a sacrifice bunt, pitcher Yoshinobu Yamamoto to second baseman Hyeseong Kim. Vladimir Guerrero Jr. to 3rd. |
| 3 | Addison Barger | L | .243/.301/.454, 21 HR | 4 | Addison Barger walks. |
| 4 | Alejandro Kirk | R | .282/.348/.421, 15 HR | 3 | Alejandro Kirk grounds into a double play, shortstop Mookie Betts to first baseman Freddie Freeman. Addison Barger out at 2nd. Alejandro Kirk out at 1st. |

- **Real result under the contract's end rules:** door shut, 14 pitches, 0 runs, faced 4.
- **Arsenal 2025 regular season** (2789 pitches): FF 35% 95.4 mph, FS 25% 90.9 mph, CU 18% 76.8 mph, FC 11% 91.1 mph, SI 8% 94.8 mph, SL 3% 86.3 mph
- **Arsenal 2025 postseason** (526 pitches): FS 28% 91.7 mph, FF 28% 96.2 mph, CU 22% 77.9 mph, FC 12% 91.5 mph, SI 7% 95.3 mph, SL 3% 87.1 mph
- **Lineup continuing** (final box score order after the last batter faced): Daulton Varsho, Ernie Clement, Andrés Giménez, George Springer, Myles Straw, Vladimir Guerrero Jr., Isiah Kiner-Falefa, Addison Barger, Alejandro Kirk
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 813024: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=813024; MLB Stats API schedule 2025-11-01 and live feed /api/v1.1/game/813024/feed/live; MLB Stats API people with 2025 season stats; Baseball Savant 808967 2025 season search (regular season and postseason) for the arsenal

### 2. Buehler, 2024 World Series Game 5 (real)

- **Game:** 2024-10-30 · World Series Game 5: Los Angeles Dodgers at New York Yankees · game_pk 775296
- **Pitcher:** Walker Buehler (RHP), Los Angeles Dodgers. Season: 5.38 ERA, 0 SV, 75.1 IP
- **Spot:** bottom 9, 0 out, bases empty, us 7 them 6, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Anthony Volpe | R | .243/.293/.364, 12 HR | 5 | Anthony Volpe grounds out, third baseman Max Muncy to first baseman Freddie Freeman. |
| 2 | Austin Wells | L | .229/.322/.395, 13 HR | 7 | Austin Wells strikes out swinging. |
| 3 | Alex Verdugo | L | .233/.291/.356, 13 HR | 4 | Alex Verdugo strikes out swinging. |

- **Real result under the contract's end rules:** door shut, 16 pitches, 0 runs, faced 3.
- **Arsenal 2024 regular season** (1336 pitches): FF 29% 95.0 mph, FC 21% 91.2 mph, KC 19% 78.0 mph, SI 16% 94.8 mph, ST 9% 82.6 mph, CH 5% 90.0 mph
- **Arsenal 2024 postseason** (259 pitches): FF 37% 94.6 mph, KC 21% 77.7 mph, FC 16% 91.4 mph, ST 14% 81.0 mph, SI 8% 94.2 mph, CH 2% 90.4 mph, SL 2% 87.3 mph
- **Lineup continuing** (final box score order after the last batter faced): Gleyber Torres, Juan Soto, Aaron Judge, Jazz Chisholm Jr., Giancarlo Stanton, Anthony Rizzo, Anthony Volpe, Austin Wells, Alex Verdugo
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 775296: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=775296; MLB Stats API schedule 2024-10-30 and live feed /api/v1.1/game/775296/feed/live; MLB Stats API people with 2024 season stats; Baseball Savant 621111 2024 season search (regular season and postseason) for the arsenal

### 3. Montgomery, 2016 World Series Game 7 (real)

- **Game:** 2016-11-02 · World Series Game 7: Chicago Cubs at Cleveland Indians · game_pk 487637
- **Pitcher:** Mike Montgomery (LHP), Chicago Cubs. Season: 2.52 ERA, 0 SV, 100.0 IP
- **Spot:** bottom 10, 2 out, man on 1st, us 8 them 7, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Michael Martinez | R | .238/.267/.307, 1 HR | 2 | Michael Martinez grounds out softly, third baseman Kris Bryant to first baseman Anthony Rizzo. |

- **Real result under the contract's end rules:** door shut, 2 pitches, 0 runs, faced 1.
- **Arsenal 2016 regular season** (1500 pitches): FF 53% 94.3 mph, CU 24% 77.5 mph, FC 13% 89.8 mph, CH 10% 84.4 mph
- **Arsenal 2016 postseason** (228 pitches): FF 39% 93.5 mph, CU 36% 77.6 mph, FC 17% 88.9 mph, CH 7% 84.0 mph
- Dropped from the arsenal as not a chosen pitch type: {'IN': 7}
- **Lineup continuing** (final box score order after the last batter faced): Yan Gomes, Carlos Santana, Jason Kipnis, Francisco Lindor, Mike Napoli, José Ramírez, Brandon Guyer, Rajai Davis, Michael Martinez
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 487637: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=487637; MLB Stats API schedule 2016-11-02 and live feed /api/v1.1/game/487637/feed/live; MLB Stats API people with 2016 season stats; Baseball Savant 543557 2016 season search (regular season and postseason) for the arsenal

### 4. Chapman, 2016 World Series Game 7 (real)

- **Game:** 2016-11-02 · World Series Game 7: Chicago Cubs at Cleveland Indians · game_pk 487637
- **Pitcher:** Aroldis Chapman (LHP), Chicago Cubs. Season: 1.55 ERA, 36 SV, 58.0 IP
- **Spot:** bottom 8, 2 out, man on 1st, us 6 them 3, us away, walkOffLive false
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Brandon Guyer | R | .266/.372/.423, 9 HR | 7 | Brandon Guyer doubles (1) on a line drive to center fielder Dexter Fowler. Jose Ramirez scores., 1 run |
| 2 | Rajai Davis | R | .249/.306/.388, 12 HR | 7 | Rajai Davis homers (1) on a line drive to left field. Brandon Guyer scores., 2 runs |
| 3 | Coco Crisp | R | .231/.302/.397, 13 HR | 2 | Coco Crisp singles on a ground ball to left fielder Ben Zobrist. (after the spot ended) |
| 4 | Yan Gomes | R | .167/.201/.327, 9 HR | 5 | Yan Gomes strikes out swinging. (after the spot ended) |

- **Real result under the contract's end rules:** door's open, 14 pitches, 3 runs, faced 2.
- **Arsenal 2016 regular season** (976 pitches): FF 81% 101.1 mph, SL 16% 88.8 mph, CH 3% 89.6 mph
- **Arsenal 2016 postseason** (273 pitches): FF 84% 100.5 mph, SL 15% 87.4 mph, CH 1% 89.6 mph
- **Lineup continuing** (final box score order after the last batter faced): Michael Martinez, Yan Gomes, Carlos Santana, Jason Kipnis, Francisco Lindor, Mike Napoli, José Ramírez, Brandon Guyer, Rajai Davis
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 487637: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=487637; MLB Stats API schedule 2016-11-02 and live feed /api/v1.1/game/487637/feed/live; MLB Stats API people with 2016 season stats; Baseball Savant 547973 2016 season search (regular season and postseason) for the arsenal

### 5. Hader, 2019 NL Wild Card Game (real)

- **Game:** 2019-10-01 · NL Wild Card Game: Milwaukee Brewers at Washington Nationals · game_pk 599336
- **Pitcher:** Josh Hader (LHP), Milwaukee Brewers. Season: 2.62 ERA, 37 SV, 75.2 IP
- **Spot:** bottom 8, 0 out, bases empty, us 3 them 1, us away, walkOffLive false
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Victor Robles | R | .255/.326/.419, 17 HR | 6 | Victor Robles strikes out swinging. |
| 2 | Michael A. Taylor | R | .250/.305/.364, 1 HR | 6 | Brewers challenged (hit by pitch), call on the field was upheld: Michael A. Taylor hit by pitch. |
| 3 | Trea Turner | R | .298/.353/.497, 19 HR | 5 | Trea Turner strikes out swinging. |
| 4 | Ryan Zimmerman | R | .257/.321/.415, 6 HR | 4 | Ryan Zimmerman singles on a fly ball to center fielder Lorenzo Cain. Michael A. Taylor to 3rd. |
| 5 | Anthony Rendon | R | .319/.412/.598, 34 HR | 6 | Anthony Rendon walks. Andrew Stevenson to 2nd. |
| 6 | Juan Soto | L | .282/.401/.548, 34 HR | 3 | Juan Soto singles on a line drive to right fielder Trent Grisham. Michael A. Taylor scores. Andrew Stevenson scores. Anthony Rendon scores. Fielding error by right fielder Trent Grisham. Juan Soto out at 3rd on the throw, right fielder Trent Grisham to shortstop Orlando Arcia to third baseman Mike Moustakas., 3 runs |

- **Real result under the contract's end rules:** door's open, 30 pitches, 3 runs, faced 6.
- **Arsenal 2019 regular season** (1139 pitches): SI 84% 95.5 mph, SL 15% 81.9 mph
- **Arsenal 2019 postseason** (30 pitches): SI 80% 97.0 mph, SL 20% 80.1 mph
- **Lineup continuing** (final box score order after the last batter faced): Howie Kendrick, Asdrúbal Cabrera, Kurt Suzuki, Victor Robles, Michael A. Taylor, Trea Turner, Daniel Hudson, Anthony Rendon, Juan Soto
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 599336: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=599336; MLB Stats API schedule 2019-10-01 and live feed /api/v1.1/game/599336/feed/live; MLB Stats API people with 2019 season stats; Baseball Savant 623352 2019 season search (regular season and postseason) for the arsenal

### 6. Feliz, 2011 World Series Game 6 (real, PITCHf/x)

- **Game:** 2011-10-27 · World Series Game 6: Texas Rangers at St. Louis Cardinals · game_pk 317072
- **Pitcher:** Neftalí Feliz (RHP), Texas Rangers. Season: 2.74 ERA, 32 SV, 62.1 IP
- **Spot:** bottom 9, 0 out, bases empty, us 7 them 5, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Ryan Theriot | R | .271/.321/.342, 1 HR | 5 | Ryan Theriot strikes out swinging. |
| 2 | Albert Pujols | R | .299/.366/.541, 37 HR | 1 | Albert Pujols doubles (1) on a line drive to center fielder Josh Hamilton. |
| 3 | Lance Berkman | L | .301/.412/.547, 31 HR | 4 | Lance Berkman walks. |
| 4 | Allen Craig | R | .315/.362/.555, 11 HR | 6 | Allen Craig called out on strikes. |
| 5 | David Freese | R | .297/.350/.441, 10 HR | 4 | David Freese triples (1) on a fly ball to right fielder Nelson Cruz.   Albert Pujols scores.    Lance Berkman scores., 2 runs |
| 6 | Yadier Molina | R | .305/.349/.465, 14 HR | 2 | Yadier Molina lines out to right fielder Nelson Cruz. (after the spot ended) |

- **Real result under the contract's end rules:** door's open, 20 pitches, 2 runs, faced 5.
- **Arsenal 2011 regular season** (1051 pitches): FF 75% 97.0 mph, SL 12% 79.5 mph, SI 5% 96.3 mph, FC 4% 86.7 mph, CH 4% 89.3 mph
- **Arsenal 2011 postseason** (203 pitches): FF 74% 98.3 mph, SL 15% 81.3 mph, FC 5% 86.1 mph, SI 4% 98.2 mph, CH 2% 88.2 mph
- Dropped from the arsenal as not a chosen pitch type: {'IN': 4, 'FA': 1}
- **Lineup continuing** (final box score order after the last batter faced): Yadier Molina, Daniel Descalso, Jon Jay, Jake Westbrook, Ryan Theriot, Albert Pujols, Lance Berkman, Allen Craig, David Freese
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 317072: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=317072; MLB Stats API schedule 2011-10-27 and live feed /api/v1.1/game/317072/feed/live; MLB Stats API people with 2011 season stats; Baseball Savant 491703 2011 season search (regular season and postseason) for the arsenal

### 7. RHP regular season, proposed: Edwin Díaz, 2025-09-05 at Cincinnati

- **Game:** 2025-09-05 · regular season: New York Mets at Cincinnati Reds · game_pk 776450
- **Pitcher:** Edwin Díaz (RHP), New York Mets. Season: 1.63 ERA, 28 SV, 66.1 IP
- **Spot:** bottom 9, 0 out, bases empty, us 5 them 4, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Ke'Bryan Hayes | R | .235/.290/.306, 5 HR | 3 | Ke'Bryan Hayes singles on a line drive to center fielder Cedric Mullins. |
| 2 | Matt McLain | R | .220/.300/.343, 15 HR | 8 | Matt McLain walks. Ke'Bryan Hayes to 2nd. |
| 3 | TJ Friedl | L | .261/.364/.378, 14 HR | 4 | TJ Friedl walks. Ke'Bryan Hayes to 3rd. Matt McLain to 2nd. |
| 4 | Noelvi Marte | R | .263/.300/.448, 14 HR | 6 | Noelvi Marte strikes out swinging. |
| 5 | Elly De La Cruz | L | .264/.336/.440, 22 HR | 5 | Elly De La Cruz called out on strikes. |
| 6 | Gavin Lux | L | .269/.350/.374, 5 HR | 4 | Gavin Lux grounds out, second baseman Luisangel Acuña to pitcher Edwin Díaz. |

- **Real result under the contract's end rules:** door shut, 30 pitches, 0 runs, faced 6.
- **Arsenal 2025 regular season** (1067 pitches): FF 53% 97.2 mph, SL 47% 89.1 mph
- **Arsenal 2025 postseason** (0 pitches): none tracked
- **Lineup continuing** (final box score order after the last batter faced): Austin Hays, Spencer Steer, Jose Trevino, Ke'Bryan Hayes, Matt McLain, TJ Friedl, Noelvi Marte, Elly De La Cruz, Gavin Lux
- **Search:** LI9 2.99 at entry (from 702 ninth-inning PAs in that state), outing win-expectancy swing 1.938. MLB leverageIndex of his first plate appearance: 3.47
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 776450: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=776450; MLB Stats API schedule 2025-09-05 and live feed /api/v1.1/game/776450/feed/live; MLB Stats API people with 2025 season stats; Baseball Savant 621242 2025 season search (regular season and postseason) for the arsenal

### 7 alt. RHP regular season, proposed: Devin Williams, 2023-04-16 at San Diego

- **Game:** 2023-04-16 · regular season: Milwaukee Brewers at San Diego Padres · game_pk 718549
- **Pitcher:** Devin Williams (RHP), Milwaukee Brewers. Season: 1.53 ERA, 36 SV, 58.2 IP
- **Spot:** bottom 9, 0 out, bases empty, us 1 them 0, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Juan Soto | L | .275/.410/.519, 35 HR | 6 | Juan Soto walks. |
| 2 | Nelson Cruz | R | .245/.283/.399, 5 HR | 7 | Nelson Cruz called out on strikes. |
| 3 | Jake Cronenworth | L | .229/.312/.378, 10 HR | 4 | Jake Cronenworth strikes out swinging. |
| 4 | Ha-Seong Kim | R | .260/.351/.398, 17 HR | 4 | Ha-Seong Kim singles on a line drive to left fielder Christian Yelich. Juan Soto to 2nd. |
| 5 | Austin Nola | R | .146/.260/.192, 1 HR | 6 | Austin Nola walks. Juan Soto to 3rd. Ha-Seong Kim to 2nd. |
| 6 | Trent Grisham | L | .198/.315/.352, 13 HR | 6 | Trent Grisham called out on strikes. |

- **Real result under the contract's end rules:** door shut, 33 pitches, 0 runs, faced 6.
- **Arsenal 2023 regular season** (948 pitches): CH 58% 83.8 mph, FF 39% 94.2 mph, FC 3% 90.7 mph
- **Arsenal 2023 postseason** (31 pitches): FF 61% 94.9 mph, CH 39% 83.7 mph
- **Lineup continuing** (final box score order after the last batter faced): Rougned Odor, Xander Bogaerts, Manny Machado, Juan Soto, Nelson Cruz, Jake Cronenworth, Ha-Seong Kim, Austin Nola, Trent Grisham
- **Search:** LI9 2.99 at entry (from 702 ninth-inning PAs in that state), outing win-expectancy swing 1.532. MLB leverageIndex of his first plate appearance: 3.47
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 718549: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=718549; MLB Stats API schedule 2023-04-16 and live feed /api/v1.1/game/718549/feed/live; MLB Stats API people with 2023 season stats; Baseball Savant 642207 2023 season search (regular season and postseason) for the arsenal

### 8. LHP regular season, proposed: Tanner Scott, 2025-06-27 at Kansas City

- **Game:** 2025-06-27 · regular season: Los Angeles Dodgers at Kansas City Royals · game_pk 777335
- **Pitcher:** Tanner Scott (LHP), Los Angeles Dodgers. Season: 4.74 ERA, 23 SV, 57.0 IP
- **Spot:** bottom 9, 0 out, bases empty, us 5 them 4, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Bobby Witt Jr. | R | .295/.351/.501, 23 HR | 6 | Bobby Witt Jr. called out on strikes. |
| 2 | Maikel Garcia | R | .286/.351/.449, 16 HR | 2 | Maikel Garcia singles on a ground ball to right fielder Teoscar Hernández. |
| 3 | Vinnie Pasquantino | L | .264/.323/.475, 32 HR | 4 | Vinnie Pasquantino walks. Maikel Garcia to 2nd. |
| 4 | Salvador Perez | R | .236/.284/.446, 30 HR | 3 | Salvador Perez singles on a fly ball to right fielder Teoscar Hernández. Maikel Garcia to 3rd. Drew Waters to 2nd. |
| 5 | Jac Caglianone | L | .157/.237/.295, 7 HR | 1 | Jac Caglianone grounds into a double play, second baseman Tommy Edman to shortstop Mookie Betts to first baseman Freddie Freeman. Salvador Perez out at 2nd. Jac Caglianone out at 1st. |

- **Real result under the contract's end rules:** door shut, 16 pitches, 0 runs, faced 5.
- **Arsenal 2025 regular season** (911 pitches): FF 53% 96.5 mph, SL 47% 88.9 mph
- **Arsenal 2025 postseason** (0 pitches): none tracked
- **Lineup continuing** (final box score order after the last batter faced): Mark Canha, Tyler Tolbert, Nick Loftin, Jonathan India, Bobby Witt Jr., Maikel Garcia, Drew Waters, Salvador Perez, Jac Caglianone
- **Search:** LI9 2.99 at entry (from 702 ninth-inning PAs in that state), outing win-expectancy swing 1.272. MLB leverageIndex of his first plate appearance: 3.47
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 777335: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=777335; MLB Stats API schedule 2025-06-27 and live feed /api/v1.1/game/777335/feed/live; MLB Stats API people with 2025 season stats; Baseball Savant 656945 2025 season search (regular season and postseason) for the arsenal

### 8 alt. LHP regular season, proposed: Josh Hader, 2024-08-10 at Boston

- **Game:** 2024-08-10 · regular season: Houston Astros at Boston Red Sox · game_pk 746922
- **Pitcher:** Josh Hader (LHP), Houston Astros. Season: 3.80 ERA, 34 SV, 71.0 IP
- **Spot:** bottom 9, 0 out, bases empty, us 5 them 4, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Rafael Devers | L | .272/.354/.516, 28 HR | 3 | Rafael Devers doubles (30) on a sharp fly ball to center fielder Jake Meyers. |
| 2 | Danny Jansen | R | .205/.309/.349, 9 HR | 5 | Danny Jansen pops out to catcher Victor Caratini in foul territory. |
| 3 | Rob Refsnyder | R | .283/.359/.471, 11 HR | 2 | Rob Refsnyder flies out to center fielder Jake Meyers. |
| 4 | Romy Gonzalez | R | .266/.306/.417, 6 HR | 6 | Romy Gonzalez strikes out swinging. |

- **Real result under the contract's end rules:** door shut, 16 pitches, 0 runs, faced 4.
- **Arsenal 2024 regular season** (1166 pitches): SI 71% 96.1 mph, SL 27% 85.5 mph, CH 1% 89.3 mph
- **Arsenal 2024 postseason** (50 pitches): SI 76% 96.1 mph, SL 22% 84.9 mph, CH 2% 89.2 mph
- **Lineup continuing** (final box score order after the last batter faced): Ceddanne Rafaela, David Hamilton, Jarren Duran, Wilyer Abreu, Masataka Yoshida, Rafael Devers, Danny Jansen, Rob Refsnyder, Romy Gonzalez
- **Search:** LI9 2.99 at entry (from 702 ninth-inning PAs in that state), outing win-expectancy swing 0.848. MLB leverageIndex of his first plate appearance: 3.47
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 746922: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=746922; MLB Stats API schedule 2024-08-10 and live feed /api/v1.1/game/746922/feed/live; MLB Stats API people with 2024 season stats; Baseball Savant 623352 2024 season search (regular season and postseason) for the arsenal

### 9. Eckersley, 1988 World Series Game 1 (proxy)

- **Game:** 1988-10-15 · OAK at LAN · Retrosheet LAN198810150
- **Pitcher:** Dennis Eckersley (RHP). Season: 2.35 ERA, 45 SV, 72.2 IP
- **Spot:** bottom 9, 0 out, bases empty, us 4 them 3, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Mike Scioscia | L | .257/.318/.324, 3 HR | unknown | 6/P |
| 2 | Jeff Hamilton | R | .236/.268/.353, 6 HR | unknown | K/C |
| 3 | Mike Davis | L | .196/.260/.270, 2 HR | 5 | W |
| 4 | Kirk Gibson | L | .290/.377/.483, 25 HR | 8 | HR/L9D.2-H, 2 runs |

- **Real result under the contract's end rules:** walk-off, unknown (13 known, 2 PAs without a pitch record) pitches, 2 runs, faced 4.
- **Arsenal:** no pitch tracking. Proxy path: from public reporting at pack build. Unverified here.
- **Replay check:** the event-file replay ends 4-5, the Retrosheet game log says 4-5: agrees.
- **Sources:** Retrosheet event file 1988WS.EVE, game LAN198810150 (via github.com/chadwickbureau/retrosheet); Retrosheet rosters OAK1988.ROS and LAN1988.ROS for bat and throw hands; Retrosheet game log gamelog/GLWS.TXT for the line score check; Chadwick Bureau register (github.com/chadwickbureau/register) for Retrosheet to MLBAM ids; MLB Stats API people with 1988 season stats for names and season lines; The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.

### 10. Rivera, 2001 World Series Game 7 (proxy)

- **Game:** 2001-11-04 · NYA at ARI · Retrosheet ARI200111040
- **Pitcher:** Mariano Rivera (RHP). Season: 2.34 ERA, 50 SV, 80.2 IP
- **Spot:** bottom 9, 0 out, bases empty, us 2 them 1, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Mark Grace | L | .298/.386/.466, 15 HR | 2 | S8 |
| 2 | Damian Miller | R | .271/.337/.424, 13 HR | 2 | FC1/BG1.1-2(E1/TH2);B-1 |
| 3 | Jay Bell | R | .248/.349/.400, 13 HR | 1 | 15(2)/FO/BG15S.1-2 |
| 4 | Tony Womack | L | .266/.307/.345, 3 HR | 5 | D9/L9L.2-H(UR);1-3, 1 run |
| 5 | Craig Counsell | L | .275/.359/.362, 4 HR | 2 | HP (after the spot ended) |
| 6 | Luis Gonzalez | L | .325/.429/.688, 57 HR | 2 | S8/F6MD.3-H;2-3;1-2, 1 run (after the spot ended) |

- **Real result under the contract's end rules:** door's open, 10 pitches, 1 run, faced 4.
- **Arsenal:** no pitch tracking. Proxy path: from public reporting at pack build. Unverified here.
- **Replay check:** the event-file replay ends 2-3, the Retrosheet game log says 2-3: agrees.
- **Sources:** Retrosheet event file 2001WS.EVE, game ARI200111040 (via github.com/chadwickbureau/retrosheet); Retrosheet rosters NYA2001.ROS and ARI2001.ROS for bat and throw hands; Retrosheet game log gamelog/GLWS.TXT for the line score check; Chadwick Bureau register (github.com/chadwickbureau/register) for Retrosheet to MLBAM ids; MLB Stats API people with 2001 season stats for names and season lines; The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.

### Alternate: Jansen, 2017 World Series Game 2 (real)

- **Game:** 2017-10-25 · World Series Game 2: Houston Astros at Los Angeles Dodgers · game_pk 526512
- **Pitcher:** Kenley Jansen (RHP), Los Angeles Dodgers. Season: 1.32 ERA, 41 SV, 68.1 IP
- **Spot:** top 9, 0 out, bases empty, us 3 them 2, us home, walkOffLive false
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Marwin Gonzalez | L | .303/.377/.530, 23 HR | 3 | Marwin Gonzalez homers (1) on a line drive to center field., 1 run |
| 2 | Josh Reddick | L | .314/.363/.484, 13 HR | 2 | Josh Reddick pops out to second baseman Logan Forsythe. (after the spot ended) |
| 3 | Carlos Beltrán | L | .231/.283/.383, 14 HR | 2 | Carlos Beltran flies out to center fielder Chris Taylor. (after the spot ended) |
| 4 | George Springer | R | .283/.367/.522, 34 HR | 7 | George Springer doubles (1) on a sharp ground ball to left fielder Enrique Hernandez. (after the spot ended) |
| 5 | Alex Bregman | R | .284/.352/.475, 19 HR | 2 | Alex Bregman grounds out sharply, shortstop Corey Seager to first baseman Cody Bellinger. (after the spot ended) |

- **Real result under the contract's end rules:** door's open, 3 pitches, 1 run, faced 1.
- **Arsenal 2017 regular season** (996 pitches): FC 85% 93.2 mph, SL 8% 83.3 mph, SI 7% 94.8 mph
- **Arsenal 2017 postseason** (229 pitches): FC 86% 93.1 mph, SL 10% 83.3 mph, SI 4% 95.0 mph
- **Lineup continuing** (final box score order after the last batter faced): Chris Devenski, Cameron Maybin, George Springer, Alex Bregman, Jose Altuve, Carlos Correa, Yuli Gurriel, Brian McCann, Marwin Gonzalez
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 526512: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=526512; MLB Stats API schedule 2017-10-25 and live feed /api/v1.1/game/526512/feed/live; MLB Stats API people with 2017 season stats; Baseball Savant 445276 2017 season search (regular season and postseason) for the arsenal

### Alternate: Pressly, 2022 World Series Game 6 (real)

- **Game:** 2022-11-05 · World Series Game 6: Philadelphia Phillies at Houston Astros · game_pk 715719
- **Pitcher:** Ryan Pressly (RHP), Houston Astros. Season: 2.98 ERA, 33 SV, 48.1 IP
- **Spot:** top 9, 0 out, bases empty, us 4 them 1, us home, walkOffLive false
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Rhys Hoskins | R | .246/.332/.462, 30 HR | 4 | Rhys Hoskins flies out to right fielder Kyle Tucker. |
| 2 | J.T. Realmuto | R | .276/.342/.478, 22 HR | 1 | J.T. Realmuto singles on a sharp line drive to center fielder Chas McCormick. |
| 3 | Bryce Harper | L | .286/.364/.514, 18 HR | 1 | Bryce Harper flies out to left fielder Yordan Alvarez. |
| 4 | Nick Castellanos | R | .263/.305/.389, 13 HR | 1 | Nick Castellanos flies out to right fielder Kyle Tucker in foul territory. |

- **Real result under the contract's end rules:** door shut, 7 pitches, 0 runs, faced 4.
- **Arsenal 2022 regular season** (711 pitches): SL 37% 89.7 mph, FF 32% 94.5 mph, CU 27% 81.0 mph, CH 4% 89.1 mph
- **Arsenal 2022 postseason** (170 pitches): SL 51% 89.1 mph, CU 28% 81.0 mph, FF 13% 93.9 mph, CH 8% 89.0 mph
- **Lineup continuing** (final box score order after the last batter faced): Alec Bohm, Jean Segura, Bryson Stott, Brandon Marsh, Kyle Schwarber, Rhys Hoskins, J.T. Realmuto, Bryce Harper, Nick Castellanos
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 715719: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=715719; MLB Stats API schedule 2022-11-05 and live feed /api/v1.1/game/715719/feed/live; MLB Stats API people with 2022 season stats; Baseball Savant 519151 2022 season search (regular season and postseason) for the arsenal

### Alternate: Mitch Williams, 1993 World Series Game 6 (proxy, LHP)

- **Game:** 1993-10-23 · PHI at TOR · Retrosheet TOR199310230
- **Pitcher:** Mitch Williams (LHP). Season: 3.34 ERA, 43 SV, 62.0 IP
- **Spot:** bottom 9, 0 out, bases empty, us 6 them 5, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Rickey Henderson | R | .289/.432/.474, 21 HR | 4 | W |
| 2 | Devon White | R | .273/.341/.438, 15 HR | 9 | 7/F78D |
| 3 | Paul Molitor | R | .332/.402/.509, 22 HR | 3 | S8/L8LM.1-2 |
| 4 | Joe Carter | R | .254/.312/.489, 33 HR | 5 | HR/7LD.2-H;1-H, 3 runs |

- **Real result under the contract's end rules:** walk-off, 21 pitches, 3 runs, faced 4.
- **Arsenal:** no pitch tracking. Proxy path: from public reporting at pack build. Unverified here.
- **Replay check:** the event-file replay ends 6-8, the Retrosheet game log says 6-8: agrees.
- **Sources:** Retrosheet event file 1993WS.EVE, game TOR199310230 (via github.com/chadwickbureau/retrosheet); Retrosheet rosters PHI1993.ROS and TOR1993.ROS for bat and throw hands; Retrosheet game log gamelog/GLWS.TXT for the line score check; Chadwick Bureau register (github.com/chadwickbureau/register) for Retrosheet to MLBAM ids; MLB Stats API people with 1993 season stats for names and season lines; The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.

### Alternate: Lidge, 2005 NLCS Game 5 (proxy)

- **Game:** 2005-10-17 · SLN at HOU · Retrosheet HOU200510170
- **Pitcher:** Brad Lidge (RHP). Season: 2.29 ERA, 42 SV, 70.2 IP
- **Spot:** top 9, 0 out, bases empty, us 4 them 2, us home, walkOffLive false
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | John Rodriguez | L | .295/.382/.436, 5 HR | 4 | K23 |
| 2 | John Mabry | L | .240/.295/.407, 8 HR | 5 | K |
| 3 | David Eckstein | R | .294/.363/.395, 8 HR | 4 | S7/G |
| 4 | Jim Edmonds | L | .263/.385/.533, 29 HR | 5 | W |
| 5 | Albert Pujols | R | .330/.430/.609, 41 HR | 2 | HR/7D.2-H;1-H, 3 runs |
| 6 | Reggie Sanders | R | .271/.340/.546, 21 HR | 5 | K (after the spot ended) |

- **Real result under the contract's end rules:** door's open, 20 pitches, 3 runs, faced 5.
- **Arsenal:** no pitch tracking. Proxy path: from public reporting at pack build. Unverified here.
- **Replay check:** the event-file replay ends 5-4, the Retrosheet game log says 5-4: agrees.
- **Sources:** Retrosheet event file 2005NLCS.EVE, game HOU200510170 (via github.com/chadwickbureau/retrosheet); Retrosheet rosters SLN2005.ROS and HOU2005.ROS for bat and throw hands; Retrosheet game log gamelog/GLLC.TXT for the line score check; Chadwick Bureau register (github.com/chadwickbureau/register) for Retrosheet to MLBAM ids; MLB Stats API people with 2005 season stats for names and season lines; The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.

### LHP regular season, a blown one: Josh Hader, 2023-08-30 at St. Louis

- **Game:** 2023-08-30 · regular season: San Diego Padres at St. Louis Cardinals · game_pk 716782
- **Pitcher:** Josh Hader (LHP), San Diego Padres. Season: 1.28 ERA, 33 SV, 56.1 IP
- **Spot:** bottom 9, 0 out, bases empty, us 4 them 3, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Taylor Motter | R | .171/.232/.211, 0 HR | 6 | Taylor Motter called out on strikes. |
| 2 | Luken Baker | R | .209/.313/.314, 2 HR | 6 | Luken Baker flies out to center fielder Trent Grisham. |
| 3 | Masyn Winn | R | .172/.230/.238, 2 HR | 3 | Masyn Winn doubles (2) on a line drive to left fielder Juan Soto. |
| 4 | Tommy Edman | R | .248/.307/.399, 13 HR | 3 | Tommy Edman homers (12) on a fly ball to right center field. Masyn Winn scores., 2 runs |

- **Real result under the contract's end rules:** walk-off, 18 pitches, 2 runs, faced 4.
- **Arsenal 2023 regular season** (1042 pitches): SI 73% 96.1 mph, SL 23% 85.7 mph, CH 3% 88.5 mph
- **Arsenal 2023 postseason** (0 pitches): none tracked
- **Lineup continuing** (final box score order after the last batter faced): Paul Goldschmidt, Willson Contreras, Nolan Arenado, Jordan Walker, Andrew Knizner, Taylor Motter, Luken Baker, Masyn Winn, Tommy Edman
- **Search:** LI9 2.99 at entry (from 702 ninth-inning PAs in that state), outing win-expectancy swing 1.314. MLB leverageIndex of his first plate appearance: 3.47
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 716782: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=716782; MLB Stats API schedule 2023-08-30 and live feed /api/v1.1/game/716782/feed/live; MLB Stats API people with 2023 season stats; Baseball Savant 623352 2023 season search (regular season and postseason) for the arsenal

### LHP regular season, a blown one: Tanner Scott, 2024-04-14 vs Atlanta

- **Game:** 2024-04-14 · regular season: Atlanta Braves at Miami Marlins · game_pk 746079
- **Pitcher:** Tanner Scott (LHP), Miami Marlins. Season: 1.75 ERA, 22 SV, 72.0 IP
- **Spot:** top 9, 0 out, bases empty, us 7 them 6, us home, walkOffLive false
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Ronald Acuña Jr. | R | .250/.351/.365, 4 HR | 4 | Ronald Acuña Jr. singles on a ground ball to left fielder Nick Gordon. |
| 2 | Ozzie Albies | R | .251/.303/.404, 10 HR | 4 | Ozzie Albies strikes out swinging. |
| 3 | Austin Riley | R | .256/.322/.461, 19 HR | 8 | Austin Riley lines out sharply to center fielder Jazz Chisholm Jr. |
| 4 | Matt Olson | L | .247/.333/.457, 29 HR | 4 | Matt Olson walks. Ronald Acuña Jr. to 2nd. |
| 5 | Marcell Ozuna | R | .302/.378/.546, 39 HR | 3 | Marcell Ozuna homers (7) on a fly ball to center field. Ronald Acuña Jr. scores. Matt Olson scores., 3 runs |
| 6 | Adam Duvall | R | .182/.245/.323, 11 HR | 3 | Adam Duvall pops out softly to catcher Nick Fortes in foul territory. (after the spot ended) |

- **Real result under the contract's end rules:** door's open, 23 pitches, 3 runs, faced 5.
- **Arsenal 2024 regular season** (1163 pitches): FF 59% 97.0 mph, SL 41% 88.5 mph
- **Arsenal 2024 postseason** (62 pitches): FF 66% 98.0 mph, SL 34% 88.6 mph
- **Lineup continuing** (final box score order after the last batter faced): Adam Duvall, Orlando Arcia, Michael Harris II, Travis d'Arnaud, Ronald Acuña Jr., Ozzie Albies, Austin Riley, Matt Olson, Marcell Ozuna
- **Search:** LI9 2.39 at entry (from 758 ninth-inning PAs in that state), outing win-expectancy swing 1.422. MLB leverageIndex of his first plate appearance: 2.87
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 746079: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=746079; MLB Stats API schedule 2024-04-14 and live feed /api/v1.1/game/746079/feed/live; MLB Stats API people with 2024 season stats; Baseball Savant 656945 2024 season search (regular season and postseason) for the arsenal

### Not proposed: Emmanuel Clase, 2025-06-17 at San Francisco (see flag 9)

- **Game:** 2025-06-17 · regular season: Cleveland Guardians at San Francisco Giants · game_pk 777472
- **Pitcher:** Emmanuel Clase (RHP), Cleveland Guardians. Season: 3.23 ERA, 24 SV, 47.1 IP
- **Spot:** bottom 9, 0 out, bases empty, us 3 them 2, us away, walkOffLive true
- **Batters faced, in order:**

| # | batter | bats | season | pitches | result |
|---|---|---|---|---|---|
| 1 | Jung Hoo Lee | L | .266/.327/.407, 8 HR | 5 | Jung Hoo Lee singles on a line drive to left fielder Steven Kwan. |
| 2 | Willy Adames | R | .225/.318/.421, 30 HR | 1 | Willy Adames flies out sharply to left fielder Steven Kwan. |
| 3 | Rafael Devers | L | .252/.372/.479, 35 HR | 1 | Rafael Devers singles on a line drive to left fielder Steven Kwan. Jung Hoo Lee to 2nd. |
| 4 | Heliot Ramos | R | .256/.328/.400, 21 HR | 6 | Heliot Ramos walks. Jung Hoo Lee to 3rd. Rafael Devers to 2nd. |
| 5 | Dominic Smith | L | .284/.333/.417, 5 HR | 3 | Dominic Smith flies out to left fielder Steven Kwan. |
| 6 | Casey Schmitt | R | .237/.305/.401, 12 HR | 4 | Casey Schmitt strikes out swinging. |

- **Real result under the contract's end rules:** door shut, 20 pitches, 0 runs, faced 6.
- **Arsenal 2025 regular season** (746 pitches): FC 69% 98.9 mph, SL 30% 88.5 mph
- **Arsenal 2025 postseason** (0 pitches): none tracked
- **Lineup continuing** (final box score order after the last batter faced): Mike Yastrzemski, Christian Koss, Logan Porter, Jung Hoo Lee, Willy Adames, Rafael Devers, Heliot Ramos, Dominic Smith, Casey Schmitt
- **Search:** LI9 2.99 at entry (from 702 ninth-inning PAs in that state), outing win-expectancy swing 1.43. MLB leverageIndex of his first plate appearance: 3.47
- **Sources:** Baseball Savant pitch-by-pitch, game_pk 777472: https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&game_pk=777472; MLB Stats API schedule 2025-06-17 and live feed /api/v1.1/game/777472/feed/live; MLB Stats API people with 2025 season stats; Baseball Savant 661403 2025 season search (regular season and postseason) for the arsenal

