# Run The Floor, the NBA game

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

## Run The Floor, the NBA game

`hoops/`, at `/hoops/`. The football and college football skeleton reskinned for
basketball, and the direct sibling of `baseball/`, which is the previous reskin
of the same thing. Unlike the two one-file games above, it is split the way the
football and college games are: `engine.js` and `run.js` load beside the page and
carry cache versions, so **read the cache-busting section above before editing
either**.

It is an **unlaunched preview**, on the same footing as the wrestling game:

| | wrestling | hoops | setlist |
|---|---|---|---|
| in `sitemap.xml` | no | no | **yes** |
| indexable | no, noindexed | no, noindexed | **yes** |
| carries the AdSense tag | no | no | yes |
| linked from the homepage or nav | no | no | no |

That noindex is doing more work than it looks like. `scripts/check-adsense.mjs`
audits every INDEXABLE page and skips noindexed ones, so the robots tag is the
only thing keeping an unfinished game out of the surface AdSense reviews. Remove
it and nothing fails: hoops silently becomes the 32nd indexable page, and the
checker then starts demanding an ad tag on it. `hoops/check-posture.mjs` asserts
all four rows of that column, so launching the game means editing a guard on
purpose.

### It answers at `/basketball` as well, and that is a door rather than a move

The game stays at `/hoops/`. That is the canonical link, it is what the share
card pastes into a chat, and every script beside the page loads relative to it.
`/basketball` is a URL somebody can be handed, in the family `/baseball/`,
`/football/` and `/soccer/` already belong to, and it is two rules in
`_redirects`.

**It is a 302 where `/grid` is a 301, which is the difference between a rename
and an alias.** `/grid` became `/arcade` and is never coming back, so a browser
is welcome to remember it for ever. This game is an unlaunched preview and
where it finally lives is a decision nobody has made. A browser that cached a
permanent redirect goes on answering `/basketball` out of its own cache, and
nothing pushed to this site can change its mind.

**It redirects rather than serving the game in place.** A 200 rewrite would
keep `/basketball` in the address bar and would need the trailing slash right
first: without it the page loads and every `engine.js?v=` beside it resolves
against `/` instead, so the scripts 404 and the screen goes blank with nothing
thrown. **A redirect that does not fire is a 404 somebody reports. A rewrite
that half fires is a white page.**

**A file beats a redirect on Cloudflare Pages**, so a `basketball/index.html`
added later would take the path over carrying whatever robots tag it happened
to have, which is the hole the noindex holds shut arriving by a door nobody is
watching. `check-posture.mjs` asserts there is no such directory, that the rule
exists, that its target is a page that is really on disk (`/hoop/` reads
perfectly in a redirects file and lands in nothing), that it is not a 301, and
that the alias is in no sitemap and on no page that carries navigation. All
five were proved by reintroducing them one at a time.

**`/baseball/` is a real directory holding a different game.** Nothing here may
ever be written in a way that catches it.

The regression suite, none of which needs a network:

```
node hoops/check-posture.mjs      discoverability, per the table above
node hoops/check-arenas.mjs       arenas, the three-quarter camera and the Locker
node hoops/build/check-fetch.mjs  the scraper's parsers, against saved markup
node hoops/verify.mjs             draft legality, seed replay, and calibration
node hoops/check-badges.mjs       every badge is reachable, against real runs
node hoops/check-board.mjs        the leaderboard, in a browser, in every state
node hoops/check-live.mjs         the game you play yourself, and its fit
node hoops/check-bracket.mjs      the playoff bracket, and the field it draws
node hoops/check-draft.mjs        the draft screen's shape, desktop and phone
node hoops/check-home.mjs         how far the front page scrolls, and the fold
node hoops/check-cloudsave.mjs    the run, the career and the daily, on two devices
node hoops/check-modes.mjs        Conquest, Fix History and Six Passes (--quick: no browser)
```

`check-badges.mjs` takes about two minutes, because proving a badge is reachable
means playing 900 seasons six different ways. It earns that: the first badge
catalog asked for three things this game cannot produce (six decorated players
on one roster, a chemistry bonus of +2, missing the playoffs at a rating of 80),
and **nothing failed**. The cabinet rendered, the squares stayed dark, and the
only symptom was three achievements nobody would ever earn. Two more looked
unreachable and were not: no strategy in the check was chasing chemistry or
building under the cap, which is a gap in the CHECK. The fix there was adding
the strategies a player would use, never loosening a threshold to suit a bot.

`verify.mjs` prints a **TARGETS** block. Read it after any change to the data or
the constants: it states what the balance is supposed to look like and flags what
is outside its band.

### Career is the main game: one invented player, a whole NBA life

```
node hoops/check-career.mjs            nine hundred careers, six hundred from draft night and three
                                       hundred from high school, then one through the page
node hoops/check-career.mjs --quick    the engine only
```

Asked for by the owner as the main game mode: a BitLife or Run The Tour career sim for
basketball, a choose your own adventure from high school to the Hall of Fame. The NBA half
shipped first; high school and college are played out now, and draft night with a
background card is the skip-ahead. `hoops/career.js` is the rules (window.RTF_CAREER, node
require) and `hoops/career-ui.js` draws `#s-car` and paints the front page's `#career` card.

**THE PLAYER IS INVENTED AND THE LEAGUE IS REAL, AND EVERYBODY HAS A NAME.** Asked for by the
owner: no "your coach". This reverses the first version's rule, which wrote every person in a
story as a role. Now:

| who | named how |
|---|---|
| teammates, opponents | real players, off the club's real roster in the data's last season |
| NBA head coaches | real, `COACHES_NOW` in career.js, moved by a carousel |
| everybody else | generated off the career's seed (`personName`, `kinName`): HS and college coaches, agents, GMs, owners, refs, doctors, family, boosters, the commissioner |

**An event is written with a `{token}`, never with a job.** `say(L, s)` fills `{coach}`,
`{gm}`, `{agent}`, `{mom}`, `{vet}`, `{star}`, `{mate}`, `{opp}` and the rest from `peopleKey`,
with `:last` and `:first`. `sayAll` names the card ON TOP plus every beat at the end of
`step`, `choose` and `act`, and only the top card: one waiting behind it is named when it gets
there, so a coach fired by the card in front is not the coach the next card talks about.
`logIt` names its own line. A token nobody knows is left as it is, so check-career can see it.

**THE COACHES TABLE IS THE ONE PLACE A REAL NAME IS TYPED.** It is the staff at the end of the
data's last season (with Portland's and New Orleans' interims), plus `COACH_POOL`: real coaches
out of a chair and real assistants, the third field saying who has run a bench. Change a chair
there and nowhere else. **Teammates are never typed**: `seedLeague` writes `roster` (the
club's top twelve, name, position, an estimated birth year off the draft year, win shares)
onto the life, and `matesOf` ages them a year at a time and retires them at an age seeded per
man. Each draft class after that adds one generated rookie a club for about ten years. An old
save with no roster gets the page's when it opens on the same season of data, and otherwise
reads year one's stars and ages them.

**ON A STORY CAREER THE ROSTERS MOVE** (`rostOf`, `rosterSummer` from `driftLeague`). They start
as the data's last season (2025-26) and live in `L.league.rost`. Every summer: the old retire,
five to nine like-for-like trades, ten to seventeen free agents (mostly toward a thin roster), and
about one summer in three a star moves. Every club carries thirteen to fifteen.

**ONE MOVE A MAN A SUMMER.** A player reported Jaylon Tyson traded to the Pelicans and signed by
the Hornets two lines later: a man moved by a trade was still eligible for free agency and the
roster cut. `moved` in `rosterSummer` holds everybody who changed clubs, and none of them is
traded, signed or let go again until next summer. check-career 12b reads the feed for it.

**REAL MEN BEFORE INVENTED ONES.** Every club used to draft an invented rookie every summer,
whether it needed one or not, which pushed real men off the end of the roster and out of the
league. Now a club over fifteen lets an invented man go before a real one of about the same worth,
a real man let go joins `L.league.pool`, and a club under fourteen signs from that pool first. A
rookie is drafted only when the pool is empty, a journeyman only below thirteen. The pool starts
as `league.fa` (`seedToday`): the men past a club's fifteen in the roster file and last season's
players on no roster today, up to 60. Invented men were 10% of the league two summers in and 22%
four in; now under 1% and 9%. Past that the share is real men retiring, which nothing can avoid.
A club that gained talent gains a
little net rating (a share of the change, the league kept centred). Moves go to the feed, and
anything touching your club to the beats and the log. A reader that jumps years plays the
missed summers quietly (`rostNow`). The rosters and the league office are not kept on a Hall card (`trimLeague` drops
them, with `lines`): a son's league rebuilds them, which is right, because the 2026 men have
aged out by then.

**THE TEAM TAB** (story careers, NBA only) is `rotationOf`: the starting five, then the bench
in minutes order, you placed by your real minutes (the season's average once a game is played,
the coach's plan before), the rest of 240 shared off a real rotation's shape. **The five always
covers PG, SG, SF, PF and C**: `bestFive` is exact over every way of seating five, a man counts
at full value at his own position, 0.85 next to it (or at a second position the data lists),
0.15 two away and 0.03 further, so a center only plays the point when nobody else can. You are
forced into it when your minutes make you a starter. check-career 11d holds it to brute force. It is display only: the season
sim reads minutes from `roleOf` and never from this. A teammate's points are last season's
rate (`lines`, off the data) at this season's minutes.

**THE SATURDAY CONTESTS ARE REAL PLAYERS** (`contestField`). A dunk contest or a three-point
contest is basketball, so the field comes off the league's rosters (young wings and guards for
the dunk, the men who take the most threes for the other), then the invented stars, then
generated names. The result is drawn first and the field is written around it on its own
stream; check-career 11b holds the field to the headline.

**THE ROAD ENDS IN TODAY'S LEAGUE.** Reported by a player: drafted into a 2032 league, the
Thunder had no Shai Gilgeous-Alexander and picked 10th. A high school career started in the
data's newest season, so the usual draft came four summers later, after four summers of
drift: club strength regresses toward the middle, stars are traded, benches turn over. The
real league was gone before the player arrived. A story career that starts in high school is
now dated `ROAD_LEAD` (4) seasons back and flagged `L.opt.cal`, and `driftLeague` does nothing
for it until the season after the data's newest.

**AND THEN EVERY ROAD WAS MADE TO END ON THE 2026 DRAFT**, asked for by the owner: the year
you are drafted is 2026-27, whatever road got you there. A road is three to seven years long
and the player decides how long, so no start date can promise where it ends (dated four years
back, only 42% of drafts landed in 2027). The road plays on a floating calendar: `driftLeague`
and `rosterSummer` do nothing for a `cal` career until it reaches the NBA, and at the combine
`landOnToday` moves every year the career wrote (the log, the feed, memory, arcs, the people
ledger, the event log, `amHist`, traits, the invented stars) so the rookie season is `lg.rs`.
The rosters, the pool and the coaches the league opened with are rebuilt fresh; a college
coach who took an NBA job on the road keeps it, re-dated. check-career 12c holds all 240
test roads to the 2026-27 season, nothing dated after it, and today's rosters. An old save
has no flag and keeps its calendar; a son keeps his father's.

**THE COMBINE IS A WEEK AND THE SLOT IS THE BOARD'S** (story careers). It used to be one
card and then a workout card offering three clubs with their pick ("They pick 1st") and a 45%
promise, which is choosing where you are drafted and put about one career in ten at first
overall. Now: testing day (test everything, shoot and drill, scrimmage, or sit out, each read
off the ratings it shows), two interviews with clubs that pick near where the board has you
(a generated GM asks about you, and a question the road gave a reason for comes first:
the injury, the transfer, the rec league, skipping college), then one private workout with the
club you impressed most. Every answer moves that club's interest (`L.flags.intr`, read
against the club's seeded style: culture, swagger or grit) and a little of the board. On the
night: a club that loved you takes you up to four picks early, a projected undrafted player
the workout club liked goes in its late second round, and `classTop` seeds the class's own
best prospects, so you go first only when you beat all of them. First overall went about 10%
to about 3%. A rec league player is no longer drafted off a promise; he goes undrafted and
overseas until he is good enough to be noticed, which can make him an older rookie. The old
cards stay for a career from before the story engine, so the replay is identical.

**The two draft bands pull against each other**, which is NARRATIVE's warning arriving here:
the late second round rescue lowers undrafted and raises reaching the league. It only rescues
a player just off the board (`draftStock >= 71`), who would mostly make a roster through
Summer League anyway, and a story career grows less overseas past 25, so a rec league player
does not play his way back at 29. check-career counts undrafted roads apart in its rookie age
claim and caps them at 31. sim-career now plays Easy, Normal and Hard on one seed each: seeded
apart, two samples of 200 carried about four points of noise against a band of two.

**NO TWO CAREERS START IN ONE PLACE.** A story career rolls a signature off its own stream: two
ratings ahead of the position and build, one behind, a small overall shift, and how much the
town is talking (starting fame), said in the first log line. check-career 12c asks thirty
shooting guards built the same way for at least fifteen different strength and weakness pairs.

**A TWO-WAY DEAL IS G LEAGUE NIGHTS, and the first NBA night follows the depth chart.**
Reported: undrafted, signed out of Summer League, and opening night had him checking in. A story
career's Summer League signing sets `L.contract.tw`. `roleOf` caps it at `TW_MIN` (7) NBA minutes
and labels it Two-way, and `roleReview` converts it to a standard deal once he belongs in the
rotation (`diff >= -4`) or outplays the minutes. The 1-year contract lapses at season end. The
debut is four scenes, picked by `debutScene` off the role: `debut_start` (introduced),
`debut_bench` (checks in off the bench), `debut_dnp` (a towel on opening night, garbage time a
few games later) and `debut_gl` (the G League, then the call-up). check-career 12f holds it.

**AWARDS AND BADGES ARE ICONS.** The Trophies shelf and the player card's traits, signature
move and skill badges are pixel icons on tiles (`AW_ICON`, `TRAIT_ICON`, `BADGE_ICON` in
career-ui.js; new kit icons crown, shield, sprout, flame, globe, six, net), with a count in
the corner. Tapping one names it under the shelf. A wall of pills was too much reading.

**NO FRAME ROUND AN ICON, AND THE TROPHY ICONS ARE ELEVEN CELLS.** Reported: hard to tell what
any of them was. Two causes. A 2px border round a 7 by 7 icon was a second outline round the
icon's own, and the seven cell drawings were too small to be anything: a medal was an outline
ring and a dot, a crown and a trophy were one blob in two colours. The tile is a soft tint of
the icon's own colour (`--ic`) with the level as a short bar under it (`--lv`). `ICONS_L` in
career-kit.js redraws twelve of them on an 11 cell grid, drawn at 4x by `K.badgeHtml`, which
falls back to the 7 cell icon at 6x so both are about 44px. The icon palette gained fixed `r`
and `q` (a red and blue ribbon): a ribbon in the medal's own dark shade vanished into the tile.
Look at a screenshot before changing one: a white cross on a medal read as a first aid kit.

**A TRADE IS YOUR TRADE ONLY WHEN YOU MOVED.** Reported: "traded to the Pacers while on the
Pacers", and LaMelo gone from the roster. The roster was right: your club's own deadline deal
had sold him. `deadlineClub` pushed that deal as a `trade` beat, and `scenes.js` reads `trade`
as you, so it played "Breaking. You have been traded to" your own club. Club deals are
`club_trade` now. `joinTeam` and `tradeTo` refuse a move to the club you are on. The move you
make is recorded in `TRADED` (module state, never saved) and turned into one `trade` beat by
`tradeBeat` at the end of `choose` and `step`, carrying where from, where to, who went back,
when (deadline, summer, season), how (the card), and the people who tell you
(`tradePeople`: both general managers, your agent, whoever is home with you, the oldest head in
the locker room you leave, all invented). `tradePeople` reads `L.life` without creating it,
because a story off career has no `life` key and `--story off` must stay byte identical.

**AND IT IS A CUTSCENE, NOT A STUDIO GRAPHIC.** `tradeScene` in scenes.js picks how it reaches
you off when and how, seeded on the career and the year: a call from your agent at home at
11:42 at night (`trade_home`), pulled out of shootaround into the general manager's office
(`trade_practice`), a knock at a hotel door on a road trip (`trade_road`), your name on the
timeline before your phone rings (`trade_leak`), or the call you asked for (`trade_ask`). Every
one ends on `trade_arrive`, the new general manager and first practice in the new colours.
Until then every beat is `club: 'from'`, so the room and your jersey are the club you are
leaving, and the header reads "Hornets to Pacers". Three kit rooms were added for it: `home`,
`office` and `hotel`. check-career 12e: every trade beat is a real move with people to tell it,
club deals are club news, nobody is traded to his own club, and every scene the picker can
choose is written.

**EVERY PLAYER HAS AN OVERALL, AND MINUTES ARE A PLACE ON YOUR CLUB** (story careers). A
player reported a 77 in his second year leading a club with three better players in minutes:
teammates were rated in win shares, you in an overall, and `youW` turned a 77 into an
All-Star's eight win shares. Now:

- **A man's worth is half win shares and half production** (`worthOf`: points, rebounds,
  assists, steals and blocks a game, twelve a night is replacement), because win shares alone
  rated Luka Doncic under Kon Knueppel. Measured off his real seasons and aged as before.
- **`mateOvr` reads worth onto your scale** (`W_OVR`), fitted so a club's best man is about a
  79, its fifth about a 67, its ninth about a 61, and a star in the high 80s; a career's own
  overall runs about 62 as a rookie and 75 at a typical peak. Every `matesOf` row carries
  `ovr`, and the Team tab shows it.
- **Minutes come from rank** (`roleRank`, `RANK_MIN`): the best man plays about 34, the fifth
  about 26, the ninth about 12, with a little for trust and a close gap. `diff` is your overall
  against the club's fifth best, so nought is the edge of the starting five, and `bestFive`
  compares overalls. Shots go down the same order (`usageOf` reads `role.rank`).
- **A club is as good as its players**: each summer `rosterNets` rates every club off its
  rotation's overalls, weighted like the minutes, plus a little for coaching and luck. Your
  own club is rated without you; you are your impact on the floor.

check-career 12d holds it: every man has an overall, the best man and the club ranks land
where the table says, a player with three better teammates never plans the most minutes,
and the better half of the league by overall is the better half by net. The usage slope was
tuned once against Hall of Fame (32 with the first slope, 26.6 now).

**A ROSTER POSITION TRUSTS THE DATA WITHIN ONE SPOT.** The roster file's coarse F against the
stats' C used to fall back to SF, so true centers were listed as small forwards. `posFromData`
keeps the data's position when it is in the file's family or one step from it.

**Moving the dates reseeds every high school career**, because the draws are keyed on the
year, and that exposed a band sitting on its edge: reaching the NBA from high school was
94.9% over 3,000 careers against a ceiling of 95, identical before and after the change, so
CI's 1,000 flapped to 95.6. The fix is a real tune, not a band: an undrafted player's
Summer League tryout floor went 10% to 5% (every one of those tryouts in the sample sat on
the floor), which puts it at 94.4 on CI's sample and 94.3 on 1,500 roads. Two other levers
were tried and measured to do nothing: the tryout's base, and the overall a player needs to
be noticed from overseas.

**A CAREER JOINS TODAY'S ROSTERS, NOT LAST SEASON'S.** Reported by the owner: Curry, LeBron,
Durant and Harden are under contract for 2026-27, and the game could retire them before it,
because the league was seeded off the season that had ENDED (2025-26) and then aged a year by
its own rules. It also had none of the summer's trades, signings or rookies.

```
node hoops/build/fetch-rosters.mjs --season 2027   (on a runner: .github/workflows/hoops-rosters.yml)
node hoops/check-rosters.mjs                       the file, the season, the handover
```

`hoops/data/rosters.json` is every club for the season about to be played: each man's
Basketball-Reference id, name, position and birth year, two-way contracts marked, and the head
coach. **Basketball-Reference is blocked from the sandbox**, so the file is only ever written
by the workflow, weekly (Mondays) and on dispatch, committed only when it moved, with no clock
in it. The page fetches it no-cache with no `?v=` (`loadRosters` in career-ui.js), the NFL
schedule file's arrangement, and does not keep a league seeded before it has answered.

`seedLeague(rows, rosters)` uses it only when its season is the one after the data's newest
(`seedToday`): a man carries what he did last season (all his clubs added), a club's net comes
off the rows of the men it now has, and the league is stamped `rs`. On `rs`:

- **Nobody leaves before that season is played** (`rostGone`): no retirement, no trade, no
  invented rookie (they start with the next draft). A draft night career and a high school
  road that lands in `rs` both meet exactly the file.
- **After it the simulation decides**, and a veteran past the usual age gets the season after
  `rs` plus up to one more, so the old guard is not emptied in one summer.
- **The file's coach replaces `COACHES_NOW`** for a club where they differ (`L.league.cn`),
  and the carousel takes over from there.

No file, or a file for another season, is the old behaviour exactly, and a league seeded
without one carries no `rs` or `cn` key: `replay-careers --story off` is byte identical over
1,000 careers. An old save keeps its own roster. check-story, check-career and sim-career all
seed from the file when the repo has it, so the bands are measured on the league that ships.

#### Ratings and salaries are the real ones, and the scale a player reads is 2K's

```
node hoops/build/fetch-ratings.mjs     writes hoops/data/ratings.json (runs here and on the runner)
```

Reported by the owner off the Team tab: Wembanyama read 82, the scale stopped in the low 90s,
and nobody had a salary. Our own model reads a man off his box scores and squeezes the stars
together. So two published files are joined to `rosters.json` by name and ride on it
(`C.withRatings`):

| | source |
|---|---|
| NBA 2K27 overalls, every current player rated 75 or better | 2KRatings, via a public GitHub CSV |
| every 2026-27 salary | a public GitHub CSV |

Both are on raw.githubusercontent.com, the one host the sandbox and a runner can both reach;
2KRatings, nba.com and Spotrac are refused here. The roster workflow refreshes it after the
rosters, keeps the old file if a source is down, and commits both. A name that matches nobody
is printed, never guessed (`ALIASES` takes the few spelled two ways).

**TWO SCALES, ONE BRANCH.** Every overall inside career.js is still the model's (a rookie 62,
a typical peak 75, an MVP 92) and every rule and band is written on it. What a player READS is
`show(o)`, the 2K scale, fitted by putting today's league in order both ways: a rookie reads
about 75, a good starter the mid 80s, the best men 96 and 97, and 99 is the top. It is
monotone, so no comparison changes. A rated man's internal overall is `showInv(his 2K)` and his
worth is read back off it (`wFromOvr`), so minutes, the five and club strength all follow the
real order. A man the file leaves out is held under 75. Every rated man is rated for the
season about to be played, so nobody is aged into it.

**The UI shows `C.show` everywhere**, the ratings bars included. **Copy that prints a number
goes through `ovT(L, o)`**, which is `show` on a story career and the old number on a save from
before, because the story-off replay fingerprints every log line and must stay byte identical.

**A LATE SIGNING IS A HAND ROW, `SIGNINGS` in `fetch-rosters.mjs`.** A restricted
free agent who signs after the club pages and the salary file were written is on no
roster: Jalen Duren re-signed with Detroit (five years, $200M) and was in no club.
Each row puts a man on his club (and off any other) and carries the salary he signed
for. It is applied on every refresh (the roster fetch and `fetch-ratings.mjs`), so the
weekly workflow cannot drop him, and `node hoops/build/fetch-rosters.mjs --signings`
applies it to the committed file with no network. check-rosters holds every row to
its club and its pay. Delete a row once both sources have him.

**Pay** is the real figure for the season it is for (`payOf`); after that a market figure off
the 2K overall (`PAY_AT`, the median real salary at each rating, scaled with the cap). Nobody
here knows a man's next contract, so a later year is an estimate by design.

**`inFive`'s cache key carries the exact overall and the club's names**: rounded, a cached
answer outlived a change a reload would have seen, which check-career's reload test caught the
moment ratings went to one decimal.

**A CLUB ON A CARD OPENS ITS ROSTER.** Any answer carrying `club` (free agency, a
two-way, Summer League, the deadline) gets a Roster button beside it. It opens
`clubView(L, c)`: that club's players off `matesOf` (the Team tab's roster, so the
sheet and the season agree), the tier, the coach, and where your overall would rank
you. The sheet's own button is the same answer as the card's. `clubView` draws from
no random stream. check-career's page walk opens one on a stand-in offer and signs
from the first real one.

**THE CAROUSEL** (`coachCarousel`, run from `driftLeague` every summer, the road years too):
a club fires on how it played (your club on the record you actually played, and never after a
title), a coach past 71 may retire, an interim is likely replaced, and the hire is weighted
from fired coaches who have sat a year, unhired real names from the pool, and a generated
first-time coach whose weight grows as the real names run out. A fired coach out four years,
or past 72, leaves the list. `midseasonFirings` at the All-Star break hands a collapsing club
to an interim assistant. **Your own club's mid-season firing is the `coach_fired` card**, whose
`queue` hook really fires him, seats an interim, and puts two real candidates on the buttons.
College `coach_leaves` really takes the worst club's job. Measured over 90 careers: about five
changes a summer plus the February ones (the real league runs six or seven), benches all real
in year one, about 94% real at year ten, then turning over.

`check-career` section 5 holds it: the source types no real player outside the coaches table,
no pairing the generated lists can make is a real player or coach (it found `Isaac Okoro`
among the invented rivals, now `Obiora`), nothing a career prints shows an unfilled token or
names a person by job alone (`the coach`, `a teammate`, `the commissioner` and the rest), every
club has one coach after every step and no coach sits on two benches, a card about your coach
names your club's coach, and year one's Celtics are the real Celtics while thirty years on they
are all generated. Generated coaches skip any name already on a bench, which is what the two
benches claim caught.

#### The front office, the bench and the summer (story careers)

```
node hoops/check-career.mjs --quick   section 12: positions, the deadline, the coach, development
node hoops/check-rosters.mjs          the roster file's positions and worth
```

Asked for by the owner: trade deadlines, real coach conversations with options, players at the
right positions, and believable progression and regression. All of it is behind `storyOn`, so
`replay-careers --story off` stays byte identical and check-saves is untouched.

**POSITIONS ARE THE DATA'S.** `rosters.json` writes Basketball-Reference's coarse G, F or C,
and read as SG and SF it put the league's best shooting point guard at shooting guard and left
his club with no point guard. `seedToday` takes the position `players.json` lists for a man's
most recent season when it agrees with the file's letter (`posFromData`), and the coarse map is
only for a man the data has never seen. check-career asserts Curry PG, Jokic C, Green PF, and a
point guard on nearly every club.

**WORTH IS A RATE, AND A REAL MAN IS AGED FROM WHERE IT WAS MEASURED.** A season's win shares
are a count, so a season lost to injury read as a worse player. `worthOf` is the last three
seasons as a rate per game, weighted to the newest and to games played, times the games a man
like him plays. The roster tuple carries a fifth field, the season it was measured in, and
`realCurW` ages him from there with `REAL_CURVE` and a per-man arc seeded off his name. The old
rule discounted every year past thirty from scratch and left a 39 year old at a quarter of
himself before he played. Only file-seeded leagues carry the fifth field; anything else keeps
the old formula.

**NO TWO MEN IN THE LEAGUE SHARE A NAME** (`uniqueNames`). Generated rookies came off two short
lists and the deadline printed one name traded for itself.

**THE DEADLINE IS A REAL DAY** (`tradeDeadline`, at the All-Star break after game 55):

- The league's sellers send a veteran to a buyer for youth (`deadlineLeague`). `forSale` is the
  market: not a club's best man, worth 2 to 7, 27 or older. The first cut moved two of the
  league's best young stars in five Februaries.
- Your club buys, sells or holds by its record (`deadlineClub`). A buy lands a named man where
  the club is thin; one at your position costs you minutes, a sale at your position hands you
  his. A buyer is no likelier than the other contenders and gains no more than the man is
  worth: at 60% and a flat win bonus it pushed rings from 25% to 37% of careers.
- If you are on the phone, `deadlineCard` asks: push for a contender with a hole at your spot
  (ranked 4th to 14th, because the top three have no room), push for a club you would start for,
  ask to stay, or let your agent pick. Why you are on the phone is a seller shopping a veteran,
  a request you made, or minutes that dried up. A trade sends a named man back (`swapBack`).
- The result names the GM who made the call, read before the trade (`{gm}` is the new club's
  after it). The old `trade_rumor` card is about the summer on a story career, because the day
  it talked about has passed when it is dealt.

**THE COACH IS A PERSON WITH A WAY OF DOING THINGS.** `coachStyle` is seeded off his name
(players' coach, defense first, trusts veterans, plays the kids, system coach) and moves what he
will hear and what earns minutes. Talk to the coach opens `coachTalkCard`, whose options are the
ones your situation has: more minutes, to start, to play the spot next door where the club is
thin (`otherSpot`), the ball late, to come off the bench for a losing team, or what to work on.
Each hint says roughly the odds. **A real coach is never quoted**: his answers are told, not put
in quotation marks, which is the real-people rule and is what check-career 5c reads.

**THE ROLE IS EARNED IN SEASON** (`roleReview`, after game 27 and at the break). `perfOf` is
what you have done against what a man of your ratings should do in your minutes, centred on what
the sim actually hands out (it runs four percent over its own means). Outplay it and you move up;
play under it and you lose minutes, and he may tell you why (`coach_review`). Measured: as many
promotions as cuts.

**YOUR SPOT IS A POSITION** (`depthCheck`, `inFive`). Two men cannot both start at point guard:
if the five is better with you in it you start, and if a better man has your spot you come off
the bench whatever your overall says. `inFive` is cached per career in a WeakMap, off the save,
because `roleOf` is asked on every card now (the receipt shows a Minutes line).

**DEVELOPMENT HAS A CLOCK PER SKILL** (`developStory`). The bounce comes first and goes first,
the jumper and the feel last into the thirties. Minutes speed a young player up, a summer can be
a breakout or a stall, a coach's project (`L.focus`) gets extra work, and no summer moves the
overall more than nine or one skill more than seven. **The clocks move growth and decline between
skills and never in total**: for every position and age the weighted sum is the old curve's. The
first cut let the jumper and the brain age slower without taking it back from the legs, which
added two points to every man at 32 and doubled the MVPs. What the cap holds back carries to the
next summer (`devCarry`).

**A story career's MVP needs a 92, not a 91**: a real deadline puts good players on good clubs,
and MVPs ran 3.5 in a hundred against a band of 1 to 3. Cutting the vote's odds instead barely
moved it (3.3 at 0.42), because a man good enough to win one wins it in a year the odds are high.

**NOT A SECOND MODEL OF A ROSTER.** Year one's club nets come off the real rosters through
`teamStrength`, scaled to a spread of 4.6, and every year after drifts on a mean-reverting
walk, because projecting a real person's future is the line above. One man's impact on his
club is `(effective overall - 68) * 0.32 * minutes / 48` points of net rating.

**A YEAR IS A STEP MACHINE**: `pre` (training card, a summer card, a camp injury), `early`,
`mid`, `late` (three stretches of games, a card or two after each, the All-Star break after
`mid`), `po` (a round a step), `off` (development, contracts, free agency, retiring). `step()`
never runs under a pending card and `choose()` answers the card on top. **Every draw is seeded
off (seed, year, tag)**, so a reload lands on the same card with the same outcome behind it;
section 4 round trips the whole career through JSON before every press and requires the same
history.

**Injuries are rolled for the NEXT stretch**, at the end of the step before, so a decision card
(surgery, rush back, specialist) is answered before the games it costs. Rolled inside the
stretch, the games were already played and the card decided nothing.

**Game 7 is yours.** A series at 3-3 stops on a `clutch` card: four shots, each read off the
rating it asks for, and the screen shows the rating rather than the odds. The rest of the
bracket is simulated off club nets so the round you are in is against the club that came through.

**The balance, measured over 600 careers three ways**, and held as bands rather than numbers:
MVP in 1 to 3% of careers, an All-Star in about a quarter to a third, the Hall (`score >= 55`)
in about a quarter, a median career of 15 to 16 seasons, a median best season near 18 a night.
Three dials did most of the work: potential is skewed low (`pow(r, 1.7)`), the MVP is at most
62% even in a perfect year because the league always has other candidates, and **a game's odds
are clamped at 0.84**, because the first cut handed out an 81-1 season and the best real team
lost nine.

**A summer card has to ask about the season, not the meter.** `rehab_summer` asked for health
under 60, and `develop()` gives the summer's health back before the off-season cards are dealt,
so it was never dealt once in 600 careers. Section 3 fails on any event the sweep never deals.

**THE CAREER IS ON THE ACCOUNT**: `rtf.life.v1` holds `{ cur, hof, last }` and is the `life`
clock slot in `hoops/cloud.js` (API 5, so a cached page cannot run the old list). It is
written through `RTF_MODES_UI.write`, which is modes-ui's own `syncWrite`, and adopted by its
`cloudAdopt`, which tells `RTF_CAREER_UI.reload()`. `MODE_SCREEN` holds `life: 's-car'`, so a
pull never swaps a career out from under somebody playing it.

**The front page leads with it.** The `#career` card is static markup above the puzzle strip
so the dock can carry `#b-career` from boot on a phone; Classic's Start stays in the Classic
card. The first-visit guide names five modes with Career first and points at the docked
button. `check-home`'s budget went 2.5 to 2.9 screens for it (2.40, 2.79 and 1.95 measured).

**The card is a stage, and the player is the picture** (asked for by the owner: Career, the
player you build and the graphics are what the game sells). `#ch-stage` holds three drawn
players in the kit's arena (`heroCast` in career-ui.js): in the middle yours, dribbling through
baller.js's live loop (the career in progress, or the look a new career starts from, which
`freshForm` then reuses so the builder opens on the man the page showed), and either side an
invented player in another club's colours and size, swapped every 3.4s. A side figure is two
still frames on baller.js's breath timer, never a second live loop, and the next look is
painted in an idle moment and only while the front page is on screen. Reduced motion swaps
nothing. Figure heights are whole multiples of the 64 cell grid (160, 192, 256, 320), and a
live canvas needs its CSS width set as well as its height. **Classic's court and reels are
hidden, not deleted**: the court is one of the three `check-arenas` holds to the lines and the
reel code still runs against it. Classic is a compact card under the puzzles.

**The front page cast is traced fine** (`heroRes` in career-ui.js). A figure is 64 cells
tall and drawn 160 to 320 CSS pixels high, and a scale of 5 falls back to one fine pixel a
cell in `resFor`, which a phone blew up into a blurry mosaic. Each figure is traced at the
finest resolution (up to 4 a cell) that lands every fine pixel on whole device pixels at
its box's size. A res 3 first frame is about 150ms of main thread, so the page draws the
coarse figure at once and swaps the fine one in at the next idle moment (`cast.fine`).
check-polish section 8 holds it.

#### The league office: everybody ages, retires, signs, gets drafted and gets traded

```
node hoops/check-career.mjs           section 12g holds the league's shape over a dozen careers
```

Reported by the owner: players did not progress or regress at a natural rate, role players
lasted to 37 doing nothing, trades were one man for one man with no picks, and a headline read
"X to the Pacers". Measured first, over careers played to the end: 15% of the league was 35 or
older, a 2K 70 still on a roster at 37, invented players peaking at 23. The league now runs the
way NBA 2K's franchise mode does, in miniature, on every story career (`officeSummer`,
`officeDeadline` in career.js).

**A MAN IS HIS OVERALL, AND IT MOVES A YEAR AT A TIME.** Each man carries `c` (this season's
overall on the model's scale), `cp` (last season's), `cy`, and `pot`, a ceiling of his own.
`devMan` grows a young man a share of the gap to his ceiling each year (`LG_GROW`, a quarter of
it at 19 to 21, tapering to almost nothing at 29), with a stall now and then and a breakout that
raises the ceiling. From 30 he declines (`LG_DECLINE`), under a point a year at first and three
to four by 35, a star a little slower, each man on his own arc, and any year can cost a few points
to an injury. Seeded per man and season, so a reload sees the same league. **Worth is read off
the overall** (`wFromOvr`), so minutes, the five and club strength did not change shape.

**A CAREER PEAKS AT 27 TO 29, AND THAT IS MEASURED, NOT SET.** Reported by the owner: today's
young stars never reached what they were projected to, and five to ten years in invented players
ran the league. The ceiling was the cause. `potFor` gave every young man the same headroom
whatever he already was, so a 21 year old already rated a star was handed the room a role player
gets, and he stopped short. The ceiling is now read against his peers: `LG_ROOM` is how much a
man of that age still grows, `LG_PEER` is a typical man of that age, and a man above his peers
gets more room (`0.2 * (c - peer)`), with a spread (`LG_SPREAD`) so two careers never grow him the
same. **He does not always reach it**: growth is a share of the gap with noise, a stall year
costs most of a summer, and the cap of nine points a year holds. Measured over a dozen careers in
12g: the median career peaks at 28, a young real player graded A gains a median of 9 points over
his start, and the best twenty in the league are 90% real at year five and 65% at year eight.
**`potGrade`** turns the ceiling into a scout's grade on the 2K scale (A+ is a 96 ceiling, D under
72), and the Team tab prints it beside any man 25 or younger, you included.

**RETIREMENT IS A DECISION, NOT AN AGE** (`retireP`): it rises with age and falls with how good
he still is. A 90 at 37 plays on, a 72 at 32 is done, nobody under 30 walks away, and a man
past 34 who has fallen off a rotation is out. A man nobody signs waits in the pool and retires
from it. Measured: about 1.5 to 3% of the league is 35 or older (the real league runs about 3),
and the median career ends at 34.

**CONTRACTS.** Every man has `k` (the last season of his deal) and `sal`. A real man's 2026-27
salary is the real one and runs on until his seeded end year. When a deal ends his club keeps
him or lets him go (`resignings`: a star nearly always, a fading veteran rarely, a club over
the tax less often). **Free agency** (`freeAgency`) signs the best man first, where a spot he
would start at, money under the apron, a contender for a veteran and his old club add up. A
signed salary never passes the max, 35 percent of the cap.

**THE DRAFT** (`leagueDraft`), every June from the 2027 draft on: last season's standings
(`seasonWins`, your club's real record in them), the lottery on the NBA's odds for the top four,
two rounds, an invented class of 64 drawn so the top pick becomes a star most years and the
second round is long shots, and scouts who draft the ceiling and get it wrong. A first-round
pick signs a four-year rookie deal; a second-rounder makes the roster only if he beats the last
man on it. **The class is tuned so the league keeps its stars**: 12.7% of the league at 85 and
up on day one, about 11% ten years on. Move the class and that check moves with it.

**PICKS ARE ASSETS.** `fo.picks` maps a pick (`draft:round:original club`) to whoever holds it,
four drafts out. `picksOf` answers who holds what, from an index rebuilt when a pick changes
hands (`fo.pv`).

**TRADES ARE PACKAGES** (`leagueTrades`, `buildPackage`). A club is winning, in the middle or
rebuilding (`clubModes`), and values a man (`vMan`) as now against two years from now, weighted
by that, less what he is overpaid for the years left; a pick (`vPick`) by the slot it is likely
to land and how far out it is. Four stories, the ones the real league tells:

| | |
|---|---|
| a contender buys a veteran | from a club selling, for young players and picks |
| a salary dump | a club over the tax pays somebody with picks to take a contract |
| a swap | two clubs trade men who fit the other better |
| a star | once in a while, a star on a club going nowhere, for a haul |

Salaries match the way the rules make them (a club over the cap takes back no more than 125
percent plus a little), a club's best man is never in a package, at most two men go out in an
ordinary deal and three for a star, and the buyer only says yes to a deal it thinks it won.
Measured: about 70% of trades carry picks.

**THE HEADLINE IS THE NEWSROOM'S**: "The Pacers have traded Bennedict Mathurin, Jarace Walker
and a 2029 first-round pick to the Pelicans for Zion Williamson." `pickWords` says a pick the
way a reporter does ("the Kings' 2028 second-round pick", "three first-round picks and a
second-round pick"). Your club at the deadline (`deadlineClubFO`) and your own trade
(`swapBackFO`) go through the same engine, so when you are traded the package that comes back
for you is named, picks and all, and the scene says it.

**Everything goes on the transaction log** (`fo.tx`, the last 160, each with who moved and in
which window), the biggest stories and anything touching your club make the feed, and the News
tab folds in last season's standings and the transactions. The Team tab shows each man's years
left and the club's picks, and which firsts it owes.

**THE MVP RACE IS THE REAL LEAGUE NOW.** The ladder at the break and the MVP when you do not
win it were nine invented stars (`figs`) floating outside the rosters, with moves of their own
that contradicted the transaction log. With the office the race is every man rated 78 or more
on the rosters as they stand (`mvpRace`, with `fo.mvps` for the voters' fatigue), and the
invented stars stand still (`figYear` returns). Your own MVP is decided where it always was.

**A save from before the office upgrades the first time it reads its rosters** (`rostOf`): every
man is put on the new model from what the old one said he was worth that season, so nobody
jumps. `landOnToday` drops the office with the rosters, and a son's league builds its own.

**It is about 1.7 times as slow per career as the league it replaced**, which is the trade
windows. `MEMO` holds payrolls, values and depth for a window and forgets a club the moment its
roster changes; without it a career was 2.5 times as slow.

#### The career answers what your club does

```
node hoops/check-career.mjs           section 12h: every club card is dealt, about one a season
```

Reported by the owner: the world around the player did not react. A teammate could be traded, a
star could arrive at your position and the club could start a rebuild, and the career went on
dealing the same random cards. Now the office writes down what happened to YOUR club
(`teamNote`, into `L.flags.tw`), and the next card slot deals one card about it, ahead of
anything random, the way a due arc is (`teamDue`, called from `queueEvents`).

| what happened | written by | dealt |
|---|---|---|
| a teammate rated 80 or more left, by trade, signing or retirement | `teamSummerWatch` | September |
| a star (83 or more) arrived | `teamSummerWatch` | September |
| your club drafted in the top twelve at your spot or next to it | `teamSummerWatch` | September |
| your club turned to a rebuild (you 25 or older) or went all in | `teamModeWatch`, against last camp | September |
| your club bought or sold at the deadline | `deadlineClubFO` | February |
| a hot or cold December, the top seed or a play-in race at the break | `teamSeasonWatch` | December, February |

The season ones fire at most every other year and about two times in three, so they read as a
moment. **Each situation has two or three cards (`TEAM_KINDS`) and the one dealt is the one this
career has seen least**, so a second rebuild does not read like the first. Answers move the
season (`win`, `usage`, `min`), the meters, and the people (`{gm}`, `{tvet}`, `{beat}`,
`{agent}`); asking out of a rebuild or a sell-off sets `tradeAsk`, which the deadline and the
summer already honour. Measured: about 1.1 club cards a season, each replacing a random card
rather than adding one.

**They move the reputation too** (`EVENT_REP` rows for every `tm_` card), because what you say
when a star arrives or the club sells is said in public. Without them the Villain persona went
dark in check-career: the club cards took the slots of the everyday cards that carried it.

**The names in these cards are the men who moved, which is basketball**: the trade, the signing,
the draft. Everybody who talks is invented. A lottery pick is always an invented man, because
every draft after today's is ours. **Each card plays as a cutscene** when scenes are on: its intro
is in `TEAM_INTROS` in scenes.js (the GM's office, the empty locker, the introduction, the
players-only meeting), registered into `CARD_INTROS`, so the decision is asked inside it.

The cards live in `TEAM_EV`, apart from the random pools, so the sweep that asks every random
event to fire does not ask for them; 12h does, and check-story holds their copy to the same
limits as everything else.

#### The road: high school, college, and the draft it ends at

`newLife({ start: 'hs' })` begins as a fifteen year old sophomore, and it is the builder's
default. Three high school years (`hs_pre`, `hs_reg`, `hs_po`, `hs_off`: a summer card, a
26 game season, a four round state tournament), a national ranking, offers in junior year and
a decision in senior year: a college, or a year overseas or in the G League. College is
`col_pre` to `col_off`: non-conference, conference, the conference tournament and Selection
Sunday, then March a weekend a step, then declare, come back, or enter the portal. Every exit
lands on the same `combine` card a draft-night career starts on (`toDraft`), so **the NBA half
never knew the road existed**.

**THE SCHOOLS ARE REAL AND THE PEOPLE ARE GENERATED.** Fifty-odd real colleges by tier (blue
blood, power, mid-major, small) with their colours, because a college is an institution the
way a club is. Its coach (`colCoachName`, named on every offer), boosters, rivals and your
roommate are generated names off the seed. High schools are invented (`<hometown> <suffix>`).

**THE ROAD ENDS WHERE THE BACKGROUNDS DO, AND THAT IS MEASURED.** It is played on the league's
ratings scale (a sophomore is about a 40), grows by `GROW_AM` toward a ceiling drawn from
`ROAD_POT`, and section 8 holds its NBA outcomes to section 2's bands. The first cut handed
out an MVP in 6% of road careers against 1 to 2% from draft night. Three things were wrong
and none is obvious:
- **Draft stock accumulated across college years.** It decays now (`stock * 0.5 + this year`)
  and is clamped, because the board reads the last season hardest.
- **A four-year senior had no age cost**, so a 22 year old with a high overall went top three.
  `draftStock` has `- (age - 20) * 1.2` now, for every career. Scouts draft the ceiling.
- **The road's ceiling ran higher than a background's**, through `pot` bumps on summer cards.

**The recruiting rank is read against age** (`ovr - (age - 15) * 5.2`), so a junior is ranked
against juniors, and the curve is fitted so about one in five of these players (all future
pros) is a five-star by 17. A class rank that only rises with age is the bug that version had.

**One tie game per tournament is yours**, the first close one you are on the floor for:
`amclutch`, the same four shots as Game 7. It can come in any round, so the tournament has to
be resumable mid-weekend: `runTourney` plays to `upto` and stops at the card, and the card
continues it.

**The third fact on the screen follows the stage**: the class ranking in high school, the mock
draft (and NIL money) in college, the bank after. A sophomore told his bank balance is the
NBA screen leaking down.

**Overseas is the route a blind policy never finds**, because it needs a ranked player who
waited past junior year. Section 8 walks it on purpose rather than hoping the sweep does.

#### The people around you, the moments, and what comes after

**A RIVAL FROM YOUR DRAFT CLASS**, invented like you (`makeRival` at the draft, picked within
three slots of you), whose seasons are drawn off a growth curve in `rivalSeason` rather than
played: he exists to be measured against and nothing in the league runs through him. Two cards
use him, the trophy case draws you against him, and the Hall card says who had the better career.

**A life off the floor** (`L.life`: single, dating, engaged, married, and kids up to four) is
five cards that move morale more than basketball. The person is `{partner}`, keyed on
`life.pn`, which moves on a breakup or a no, so a new relationship is a new person and the
name on the meet card is the name you date. Old saves have no `life` key, so it is read
through `lifeOf()`, never directly.

**Milestones are crossings, read off `totals()` either side of `closeSeason`'s history push**,
so 20,000 points is logged in the season it happened and never again.

**RETIRING IS TWO MOMENTS.** `retire()` is the press conference and leaves an `after` card; the
career is only over once it is answered (`L.retired`), and its sentence is the last line of the
Hall card. The screen's own Retire button goes through `retireNow()` for the same reason. A
career that never reached the league skips it. **A number is retired** for seven seasons with
one club and a legacy score of 36 or more.

**The hometown club calls only on a road career**, because only a road career has a hometown
(`HOME_CLUB` maps the high school towns to clubs), so section 8 asks for that card and
section 3 does not.

#### The Career shelf, and the gold that was never recorded

Thirty three badges on a `Career` shelf in `badges.js`, read off `cr.*` feats like every mode
shelf. `featSummary(L)` in `career.js` is the one place a finished career is summed, and
`careerFeats` turns that into feats: `cr.careers` is a count and everything else a high-water
mark, so a second career that is worse than the first takes nothing away. `career-ui.js` files it
in `finish()`, only for a career that reached the league, through `RTF_PAGE.feats`.

**`check-badges` plays careers as well as drafts**, two starts and three ways of answering cards,
and lights the whole shelf.

**The top two rungs need the prospect, not the blind sweep.** Three MVPs (`cr-mvp3`) and
38,000 points (`cr-38k`) need a ceiling the builder grades A+ (potential 92 or more, `grade()`
in career-ui.js), and a blind life is that about one time in twelve. So the 900 blind lives
lit them by luck of the seed: `cr-mvp3` went dark on main with no engine change to explain
it, and `cr-38k` sat on `EXCUSED` as a coin flip. The prospect bot plays the way a person
chasing them does: a Shot creator, rolled again until the ceiling reads A+, from both of the
builder's doors. Measured over 180 such lives: three MVPs in 10, the record in 4. Never
answer a dark career rung by excusing it or moving its number; ask what a person chasing it
would build.

**High school and college earn nothing unless they were PLAYED**, the owner's call: Career is
about the NBA. A generated road (`L.opt.gen`, the free draft-night start) is backstory, so its
amateur awards are off the trophy shelf (`awardCounts`) and `featSummary` sends no road,
national title, state title or national player of the year. `amPlayed(L)` is the test. A road
played from high school (Pro) keeps both.

**Olympic gold was never recorded, and the badge sweep is what found it.** The olympics card
wrote a `goldYear` that `closeSeason` read a season late, after the history it should have
written to was already pushed, so `cr-gold` was dark in 900 careers. The card writes `olympic`
onto the last season's awards itself now, and about one career in nine wins gold.

#### The player is drawn, and the big moments are scenes: Run The Tour, for basketball

```
node hoops/check-career.mjs   section 10 (press room, persona, look), 7b (the scenes, through the page)
```

Asked for by the owner: model Career on Run The Tour's characters and cutscenes. Three pieces.

**`hoops/baller.js` draws the player** (`window.RTF_BALLER`) on a 44 by 64 grid. He wears the
colours he plays in (`C.colorsOf`) and his own number, greys from 33, and has six poses (stand,
ball, up, trophy, suit, cap). `img()` returns two frames and one page-wide timer swaps them (the
breath); reduced motion gets one frame.

**It is a small 3D model, painted the way Run The Tour paints its golfer.** Asked for by the
owner off the golf game's 3D pixel golfer: use exactly that style, in every animation and on the
profile and Look screens. Two earlier versions came before it (flat rectangles in a black ring,
then a 2D rig of shaded tubes), and both are gone. Now:
- **The body is volumes posed in three dimensions**: a head and ears, a chest and waist blended
  into one torso, limbs as round cones, hands, shoes clipped flat at the floor, and every
  hairstyle as a volume over the head (`build` in baller.js). Every pixel is sphere traced into
  the model to find the part it lands on and the way that surface faces.
- **THE CAMERA IS 3/4 TOP DOWN, FROM A CORNER**, asked for by the owner. It looks down 30 degrees
  and the man is turned (`YAW`, 35 by default) so one shoulder is near and one far, and the depth
  of the chest and the top of the head are in the picture. `rotV` is the one turn every point goes
  through: the tracer, the face, the number, a hand, a held ball and the props. `paint(look,
  { yaw })` and `handAt(pose, s, build, yaw)` take another turn, and must take the same one, or
  the ball leaves the hand. **The face is on the head, not the screen**: each feature is a point on
  the skull projected through the camera, so the far eye sits near the cheek's edge and drops off
  when the head turns away. The body has depth to match (a ribcage two thirds as deep as wide,
  pecs, lats, shoulder blades) and is about six and a half heads tall.
- **The court is laid out under the same camera** (court.js). A man on a court is turned
  `COURT_YAW` (60) to face along it, a mirror image facing away. Clips are still written along a
  play line; `sy()` shears every point by `SLOPE` as it is drawn, so a step toward the rim is a
  step along the court's axis as the camera sees it, for the men, the ball, its shadow, dust and
  props alike. The floor is painted by turning every pixel back into a point on the court
  (`courtAt`), so the lines converge the way the men do. The glass is a pane across the court
  behind the rim, and the rim prop splits into halves by depth to the camera, not by world z.
  A room (a ceremony) keeps the default corner pose and no shear.
- **Then the golf game's paint step, copied rather than imitated** (PXHD in golf/index.html): five
  step ramps that go cool in shadow and warm in the light (skin goes red-violet), one light from the
  top left, a contact shadow under a part with another in front of it, an inner contour on the front
  part where it crosses one behind, a soft outline one pixel INSIDE the silhouette in the part's own
  shadow colour (no dark outer ring), dot eyes, brows and a little blush. `ramp`, `skinRamp` and
  `hairRamp` are PXHD's numbers.
- **A frame is the same model with its joints moved.** The `SETS` angle tables did not change. An
  arm is two angles from straight down, and a foreshortened forearm is turned toward the camera,
  not drawn shorter. **A limb that crosses the body comes forward by how far across it reaches**:
  left flat, the shot's gather went into the chest and the hands on the head went behind the hair,
  and check-moments named both.
- **Materials are functions of where a ray lands**, which is how the tank's straps and armholes, the
  number, the striped crew socks, the laces and the suit's lapels sit on round shapes.
- About 13ms a paint once warm. Every screen caches the result (`url`, court.js's canvases).

check-sprite was re-recorded for it, and its header says why.

**ONLY MUSCULAR IS BROAD.** The owner found the first 3D players too buff. `BODY` in baller.js is
one table read by the skeleton, the model and `handAt`: Lean and Standard are long and narrow (small
delts, thin arms), and Muscular (id `strong`, kept because it is in saves) carries the broad
shoulders.

**The jersey is an NBA crew neck, and every club wears its own design.** The owner found the old
scoop cut too low. `KITS` in baller.js maps a club's two colours (the only thing a caller hands
the painter) to one of seven designs (classic, double trim in a third colour, side panels,
pinstripes, a sash, chest bands, a fade), and an unknown pair picks one off a hash of its colours,
so every screen gets a design without learning a club code. **The number is printed on the cloth
at a fine trace** (`res` 2 and up, the portraits): a 3 by 5 numeral in the body's own units on
the front of the chest, so it turns and foreshortens with it, and no stripe runs through it
(`numClear`). A cell is never under a pixel and a half or the pitch drops a row. **At a single
resolution trace (every court sprite) it is still stamped on the screen**, because a chest there
is twelve pixels and 3 by 5 is the smallest numeral that reads; a slant was tried and broke the
digits.

**HEIGHT AND WEIGHT ARE DRAWN.** Asked for by the owner: every player looked the same whatever his
size. `metrics(look)` in baller.js turns `ht` (inches) and `wt` (pounds) into the body: legs grow
faster than the torso with height (`h^1.35` against `h^0.85`, measured off 6'7" as `BASE_HT`), and
girth is weight against `typicalWt(ht)` (career.js's own `wtFor`), so 250 lb reads heavy at 6'2" and
lean at 7'2". The head is scaled as a unit (`HEAD_K`), so it is about a sixth of a 7 footer. A look
with no `ht` is drawn at the default size, which is what check-sprite's hashes hold.

- **Two readers hand the size over and both are needed**: career-ui's `withSize` puts `L.ht` and
  `L.wt` on the look every Career screen draws, and scenes.js's `ctxOf` does the same for a cutscene.
  court.js passes the whole look to `handAt`, because a taller man's hands are somewhere else.
- **The builder has sliders**, between the minus and plus buttons. Dragging repaints only the
  preview on a frame (`sizeLive`), and a release does the full render. Moving height moves the weight
  slider's range in the same frame, or a 7'4" is briefly held at a 6'9" weight.
- **A big portrait is traced finer** (`resFor`: 2x over 120px), so a face reads at the size it is
  shown. The court sprites stay at 1x, because there are ten of them a frame.
- **check-moments section 5 sweeps 6'0" to 7'4" and both weight extremes**, and asserts no frame
  touches the grid's edge. The tallest man's raised arms are what binds; the arm length is capped
  against the shoulder height for that reason.

The figure is about six heads tall at the default size.

**`paint(look, { parts: true })` hands back part names instead of colours**, and only
check-career asks for it. Section 10 proves four things over forty looks and six poses: no part
touches the grid's edge, every pose has a head, hands and shoes, every pose breathes, and every
figure has at least 24 colours. An edge eats the outline: the afro and the flat top first came
out with their crowns sliced flat. Moving the afro back up fails that claim by name.

**The display heights are mostly multiples of half a cell** (96, 128, 160, 64 and the scene's
320), which is whole device pixels on a 2x screen.
**The look is a few short values on the life** (`L.look`), kept through `cleanLook`'s
whitelist in career.js, and **baller.js is the only file that knows what they mean**:
`normal()` falls back on anything it does not recognise, so an old save or a hand edit is
always drawable. A career from before looks gets `lookFor(seed)`. The rival is drawn off
`lookFor(name)`, so he always looks the same. **Only the invented are drawn**: no real player
gets a face or a hashed look.

**A HAIRSTYLE IS A SILHOUETTE FIRST.** Asked for by the owner, because only the afro read:
every other style hugged the skull, so a fade, a buzz and a flat top were one helmet with
different noise on it. Each style is now a shape (`TOPS` in baller.js gives the volume above
the skull row by row: a flat top is a box, a curly top a scalloped dome, twists and long hair
hang past the ears), and the texture after the shading is a pattern per style rather than a
hash: two by two curl clumps, twisted ropes with a dark seam, plaited cornrows with scalp
between, a fade dithered into the skin. `braids` is labelled Cornrows and keeps its id,
because the id is in saves. **Hair has its own ramp** (`hairRamp`): the general ramp lifts
near black so a black jersey has room for a fold, and on hair that drew black hair as a taupe
helmet. Render a contact sheet of every style in four colours before changing any of it;
check-sprite was re-recorded once for this pass and its header says what moved.

**Facial hair has its own colour** (`bc`, an index into `HAIR_COLORS`). Absent means Match,
the natural colour that goes with the hair, which is what every look had before, so no old
look changes. The row only shows once there is facial hair to colour.

**THE BUILDER IS FOUR STEPS** (Player, Look, Story, Start), because as one form it was four
and a half phone screens with the start button at the bottom. The player, his overall and
all seven ratings stay on top; the Look step draws him twice the size framed on the head,
because hair is what is being chosen there; the start button is pinned to the foot of the
screen on every step. **Every step stays in the page with the others hidden**, so nothing a
step holds is lost moving between them, and a walker has to press `[data-bstep]` before it
clicks anything inside a step. check-career holds each step under 1.75 screens with the
button on screen. **The road to the draft is never shown in the builder**: it is played the
moment a draft-night career starts, and the career's first screen opens on it, line by line
(`stage.reveal`). After the first press it is a fold reading How you got here. A walker that
needs the road before starting asks `RTF_CAREER_UI.previewRoad()`, which is the checker's
alone. On a phone the ratings are a fold too, so the card to answer comes sooner; they open
themselves when a press has just moved one.

**The press room is the engine's** (`TONES`, `PRESSERS`, `presserCard`). After a first-round
pick, an MVP, a title, a Finals loss and a national title, a `presser` card is pushed; every
answer is a TONE and moves `L.rep` (fans, respect). `EVENT_REP` gives twenty everyday event
choices a reputation too, because a career sees two or three press conferences and without
them almost nobody becomes anybody. The reputation drifts 20% back to the middle every season,
so a persona is what you have done lately. **The persona is read, never stored**
(`personaOf`, a three by three off the two axes). Measured, all nine are reachable and the
balance bands do not move: the biggest press conference move is five points of fame.

**`hoops/scenes.js` is the broadcast layer** (`window.RTF_SCENES`): an invented cast and
outlets, rooms drawn in CSS (draft stage, press room, arena, studio, high school gym, locker
room, Hall of Fame), a typewriter, tap to advance. **It decides nothing.** A scene is told
after the engine moved, off the beats it returned (`pickScene`), and a decision in a scene is
the engine's own pending card answered through `C.choose`, so the plain card is always on the
screen underneath and a closed scene loses nothing. **Skip never skips a decision**: it jumps
to the next one, and is hidden while one is up. `chain()` runs a moment straight into the
next decision (a title into its press conference), and `build()` resolves every line against
that moment's own context, or a chained scene would tell the first one's facts. **Scenes are
always on and a player has no switch**, the owner's call. `on()` reads `rtf.scenes.v1 = 'off'`
only under automation (`navigator.webdriver`), so the walks that answer a hundred cards can
skip them; check-career's main walk runs with them off and 7b runs them on. A player who
switched them off before this sees them again.

**The broadcasters are invented, and the coach and the commissioner are the career's.** Their
plates read `C.myCoach` and `C.say(L, '{commish}')` through `ctxOf`, so a scene and a card name
the same man, and 7b fails on a plate that reads a job. check-career reads scenes.js and
baller.js for every real player's name, the same guard career.js has.

Two things only a screenshot found: `.sc-front` (the press table, the studio desk) had no
height, so nothing in it drew; and the drawn player made the identity card taller, which put a
decision below the fold on a phone. `scrollStage` now scrolls to the first answer of a pending
card, not to the top of the stage.

#### The Career board, and a score worked out twice that has to agree

```
psql -d hoops_careers -f supabase/test/hoops_board_base.sql
psql -d hoops_careers -f supabase/130_hoops_careers.sql
psql -d hoops_careers -f supabase/test/hoops_careers_test.sql
```

`supabase/130_hoops_careers.sql` is `rtf_careers`, one row a career, its own table because a
career is neither a season (`rtf_runs`) nor a play (`rtf_plays`). A career that reached the
league is filed once, from `finish()` in `career-ui.js`, through `B.submitCareer(C.boardSummary(L))`.
The career's seed is the key, so a second submit hands back the first row. A career that never
made the league is not filed. **Deploy it by hand**; without it every career plays and retires,
and the Hall card says the board is not set up. Preflight row 42.

**THE SCORE IS DERIVED BY THE SERVER, AND THAT MADE `legacyScore` INTEGER ARITHMETIC.** The page
sends totals and no score (the walk asserts the body has no score key), and `rtf_career_score`
works it out. Written as `pts / 1000 * 1.4` the page computes a float and the server a numeric,
and a total landing exactly on a half rounds one way in each, so the board and the Hall card
would call one career two numbers. Both now count in ten thousandths and round half up. Measured
by filing 600 engine careers through the real function: none refused, 600 of 600 scores equal.

**The board is a tab of the one leaderboard screen**, first in `BOARD_TABS`, with its own axis
(`lbCareerAxis`: Legacy, Points, Rings) so moving between it and a draft board keeps each where
it was. The verdict on a row is `C.verdictOf(score)`, the career engine's own ladder. A ring
makes the row gold and the inner circle (120 and up) makes it move. A row opens into the
career: position, line, years, clubs, draft and honours.

**A row's id rides on the Hall card** (`card.board`), which is in the `life` slot, so it is on
the account. A guest's careers are claimed on sign in (`rtf_claim_career`), and `boardIds()`
marks your rows. The Hall card asks for its place every time it is drawn, because the field
keeps growing after it was filed.

**The name is checked for shape and nothing else.** It is invented, so the server takes letters,
spaces, an apostrophe, a stop and a hyphen, and `boardSummary` sends anything else as no name
rather than losing the career.

**A rename now reaches all three boards.** `rtf_rename_plays` has existed since 116 and nothing
called it, so a renamed account kept its old name on the Conquest, Fix History and Six Passes
boards. `setName` in `auth.js` calls it and `rtf_rename_careers` after `rtf_rename_runs`.

**The SQL test splits every write from the read that checks it.** Three claims failed on the
first run for the snapshot reason recorded under 116: a function that inserts, called in the same
statement as the select checking it, is checked against the table as it was before.

#### The Career rebuild: the design system, the saves and the people

```
node hoops/check-saves.mjs      frozen version 1 saves migrate and play on unchanged
node hoops/check-sprite.mjs     no existing sprite pose moves a cell
node hoops/sim-career.mjs       a thousand careers against the story bible
hoops/design/                   AUDIT, DESIGN, NARRATIVE and PLAN, plus the style guide
```

Career is being rebuilt in phases (`hoops/design/PLAN.md`). The design is **Arena
Arcade**, picked by the owner: `hoops/career-kit.js` is the whole system (tokens,
components, pixel art drawn in code on the sprite's grid), CSS carried in a script
for the cache-busting reason `store.js` gives, every token prefixed `--k-` so it
never reaches into the draft game's variables. `hoops/design/style-guide.html`
renders every part. A screen needing something the kit lacks adds it to the kit
and the guide first. The three fonts are self-hosted in `hoops/fonts/`.

**REAL PEOPLE ARE IN THE STORY TOO, ON A STORY CAREER IN THE LEAGUE.** This
reverses the rule this paragraph used to hold (real players and coaches on the
court only, never in a quote, a feud or a fight). The owner's call (2026-10): a
feud with an invented name was boring and hard to follow. On a story career in
the NBA, `lockerOf` reads the REAL room off today's rosters (`realLocker`):
`{tvet}` is the oldest man on your club, `{trook}` the youngest, `{tco}` the best
of the rest, `{tm}` and `{tm2}` two of those. `{topp}` and a feud's `{foe}` are a
real man in another club's top four (`realOpp`). They are read when the card is
drawn, so a traded or retired man is never named. **Off the league (high school,
college, overseas) and on a career from before the story engine there is no real
room**, so the three invented players a club are still there, and the story-off
replay stays byte identical. A real teammate in a moment is drawn faceless
(`ctx.mateReal`), the same as every real man on the court. The broadcasters, the
agents, GMs, owners and family stay invented, and `CAST` keeps fixed names.
`REAL_TOKENS` and `BASKETBALL_ONLY` still hold the tokens that name the
coaches and the data's stars to basketball cards; check-career 5c asserts the
real room is three different men on the roster and `{topp}` a man elsewhere.

**A SAVE IS VERSIONED AND MIGRATED.** `LIFE_VERSION` is 2. `migrate()` runs on
every load, is idempotent, and never moves a number the sim reads, which is
what `check-saves.mjs` proves: six saves written by the version 1 engine are
frozen in `hoops/build/fixtures/` with what that engine did over the next 120
presses, and the migrated careers must match it exactly. Never regenerate those
fixtures with the current engine.

**The simulator has two kinds of claim.** Invariants (a crash, a career that
never ends, an unfilled token, junk printed as a value, a wrong-year draft line)
fail every run. Balance targets carry the phase they are due by, and only fail
once `--phase` reaches it, so a known gap is printed without being a failure.

**The characters are final.** New cutscene poses are drawn by the existing rig
in `baller.js`; `check-sprite.mjs` holds 960 hashes of every existing pose,
recorded from the untouched file.

**Every Career screen and scene is drawn on the kit (Phase A).** `career-ui.js`
needs `RTF_KIT` and returns without it, like it needs the engine. Three things
in it are easy to undo by accident:

- **A scene room is drawn at the stage's own shape.** `fitPix` in `scenes.js`
  asks `K.room` for a set as many cells as the stage holds, one cell a whole
  number of pixels. Covering a stage with the 132 by 80 set instead blows a
  tall phone up to eighteen pixels a cell and crops it to a wall of heads. It
  refits on a `ResizeObserver`, because the caption grows and shrinks with
  what it says. A press table and a studio desk are the same picture laid
  over the cast and clipped (`FRONT`), so the speaker stands behind them.
- **The answers win the scroll.** After a press, `scrollStage` brings the
  card's first answer on screen even when that takes the stage top above the
  window: a long receipt and the beats above a card used to leave the answers
  below the fold. check-career paints the tallest receipt over a real card
  (`RTF_CAREER_UI.paintPress`, the checker's alone) rather than hoping a random
  career deals one, and checks every card's first answer, not a sample.
- **On a phone the card on top is a tray docked to the bottom of the screen**
  (under 720px). It is the same `#cr-card` element, made `position:fixed` by a
  media query, so every reader of `.cr-choice` is untouched. It is capped at 45%
  of the screen and scrolls inside itself past that, because a tray that covers
  half the screen is a modal again. `fitTray()` pads the column by the tray's
  measured height (`--cr-tray`), a long setup folds behind More, and the moved
  rows of a receipt fold to one line. It rises once when a card arrives and
  fades when one replaces another. The career screen enters on opacity alone,
  because a transformed ancestor would pin a fixed tray to the screen rather
  than the window. check-career's tray arm asserts the dock, the cap, every
  answer reachable without scrolling the page, the padding and no step button,
  at 390x844 and 360x640, and that a desktop keeps the card in the column.
- **Focus goes where the next thing is** after a keyboard press (the card's
  heading or the next button), never on a mouse press, never with a scroll. A
  number key answers the card on top; a sheet or a scene being open stops it.
- **One press answers one card.** The tray draws the next card's first answer
  under the same thumb in the same frame, so a double tap (about 110ms apart)
  answered the next card unseen on a quarter of cards, a double tap on Next
  played two stretches, and a HELD number key answered four cards in a second
  (both combine interviews, the workout and the agent). After a touch or mouse
  press `arm()` disables the fresh answers and Next for `ARM_MS` (320ms) and
  fades them up; a key press is not armed, and `onKey` ignores `e.repeat`.
  Disabled rather than a timestamp, because Playwright's `click` waits on it.
  **A walker that presses with `element.click()` inside `evaluate` does not**,
  and burned its whole press budget on armed buttons the first time: wait out
  a disabled button, never count it.
- **The name is judged while it is typed.** `C.boardName` is the Career board's
  own name rule (130's `p_player` check) and `boardSummary` reads it, so the
  builder and the board cannot disagree. A name the board will drop ("Big Mike
  23", any emoji) is said under the field with a one-tap cleaned name
  (`C.cleanName`); a blank one says it will be picked.
- **The Seasons tab opens on Your arc**: a column a season, oldest left, as
  tall as the overall it ended at on a zero baseline. Before the league is
  `#5b8fe6` and the NBA `#e8660f` (both validated against the panel for colour
  blindness), the peak carries its number, a title season a ring (a shape, so
  nothing rests on colour). Each column is a button and a tap names the season.
  The table stays under it as the readable view of the same numbers.

Four meters, not five: the fifth in PLAN.md waits for the story engine (Phase C)
to have something real to measure. The leaderboard's Career tab keeps the
game's shared board chrome, because restyling one tab of seven is a seam inside
the board rather than one removed at its door.

#### The cards before and after a season are read off the season (story careers)

Reported by the owner: the pre and post season prompts were very repetitive.
Measured over sixty careers, they were. Every September dealt the same training
card with the same five answers and the same goal card in the same voice. Every
April went to the same four cards (the playoff assignment, the exit interview, a
hamstring, a guarantee), because almost nothing else could be dealt between game
82 and the first playoff game.

- **The summer card** (`summerCard`) opens on what last season was (a title, a
  Finals loss, a first round exit, a new city, a contract year, a season of missed
  games) and offers four of sixteen programs (`SUMMER`). Some come only to a career
  they fit: post work for a big, national team camp at 78 and up, Summer League in
  the first three years, rehab after a short season. A program offered last summer
  is less likely to come round. Each is worth what one of the old five was, so
  balance does not move; the same program three summers running pays 0.6 and says
  so. The card id is still `training`, and an old card without `ctx.ks` resolves
  the old way.
- **The goal card** has eighteen goals and six people who ask (`GOAL_ASK`): the GM,
  the agent, the beat writer, the trainer, your mom, or the mirror. Nobody asks two
  Septembers running, the card says whether you hit last year's, and in April the
  person who asked answers (`GOAL_SAID`) and the relationship moves.
- **Thirty five new cards** (`apr_*`, `sep_*`, `jun_*`), each once a career and
  each read off where the season stands: the top seed, an underdog, the play-in,
  your first playoffs, a missed season, a parade, the other team's parade, a
  holdout, a captaincy, a new number in a new city. April went from four cards to
  about twenty sharing it.

**Two things the simulator caught.** The thirty five cards share their slots with
the legend layer, so the share of careers meeting a legend card fell from 34% to
30%, on the floor; `LEGEND_W` went 1 to 1.4 and it reads 37.7%. And the sixth man
route and the "great sixth man" ending asked for a season with the role "Sixth
man", which nothing wrote: the story roles were Franchise player, Starter,
Rotation, End of bench. The first man off the bench (20 minutes or more, sixth or
better on the club) is labelled that now, and three such seasons earn the ending
as they already earned the route. The old sweep had met the ending exactly once
in 1,000 careers, by a Sixth Man award.

**`late` is after game 82.** An April card that talks about the last home game in
the future tense is wrong; three were rewritten for that before shipping.

`replay-careers --story off` is byte identical over 1,000 careers: everything here
is behind `storyOn`.

#### The game narrates, and a card that comes back comes back different (story careers)

```
node hoops/check-story.mjs     section 14
```

Asked for by the owner: the decisions repeat, and the copy should sound like a game
narrating your life. Measured first: a career deals about 124 cards, and the summer
plan, the goal, Game 7, the injury report, retirement and the coach's review fill most
of them. Three changes, all behind `storyOn`, so `replay-careers --story off` is byte
identical (proved over 1,000 careers).

- **The narrator.** `narrate()` gives a card one line in the game's own voice
  (`card.lead`, drawn above the title), read off where the life is when the card
  reaches the top of the stack: the record, your age, minutes, money, family, city,
  rings. About a third of cards get one, a season hears at most twelve, and a line
  comes back no sooner than `NARR_GAP` seasons. It is said in `sayAll`, never at deal
  time, so a card dealt behind two others still knows the month it lands in. Every
  line is a fact the career holds.
- **Second takes.** `TAKES` hangs other versions on thirty recurring cards: the same
  moment in the season, a different situation and different choices. `takeOf()` starts
  each career on a take seeded off the career and steps one on every time the card
  comes back, so a repeat is never the scene it was last time. A take's answer carries
  its own reputation (`rep`) and trait signal (`watch`), because `EVENT_REP`,
  `EVENT_REL` and the spend/hothead tables are indexed by the card as written. A take
  for a card that does not exist throws at load. Without `watch` the spender trait went
  dark in check-story.
- **System cards put more than one way.** `VARY` rewrites the title and text of Game 7,
  the injury report, retirement, the All-Star contests, extensions, the coach's review,
  the high school summer and the draft decision, keeping every fact (games out, age,
  money). The answers never change, because the rules read them by position.
  `VARY_RES` does the same for two endings.

#### Nothing reads the same twice (story careers)

```
node hoops/check-story.mjs     section 15
```

Measured first: a career deals about 124 cards, and **11.5 repeated their exact text, 10.9
their exact set of answers and 18.6 their exact title**. The summer card (one a season) and the
goal card (one a season) did most of it, then Game 7, the All-Star invitation, retirement,
injuries and your club's cards. After this pass: 1.8, 1.9 and 2.9.

- **`fresh(L, key, n, rng)` is the one picker.** It remembers what it dealt for a key
  (`L.vu`) and deals a line this career has not read, starting over only once every line has
  been read, never on the one it just used. Every variation below goes through it.
- **The summer is read off the season it follows** (`summerSay`): the situation
  (`summerSit`, the old frame's rules) picks a pool of openings, one true fact about your year is
  added when it fits (`SUMMER_FACTS`: scoring up or down, the record, the All-Star nod, the box
  line, years with the club, rings), and the body line reads health and age (`BODY_SAY`). Held
  to 22 words.
- **The goal card has voices** (`GOAL_ASK`, several titles and texts per asker) and **names
  last year's goal** (`BACK_SAY`). A goal you hit is not offered again the next September.
- **The same question is not asked in the same words.** `OPT_ALT` rewords the answers of the
  recurring cards, keyed by card and canonical label, because the rules read an answer by its
  place on the card and never by its words. `TITLE_ALT` rewords titles, `MOMENT_SAY` the
  in-game moments, and `VARY` (now fresh) the system cards.
- **`{tm}` in an answer is a real teammate**, so it is only offered in the league.

`varyCard` marks every story card `varied`, so the check that a career from before the story
engine sees no take also asserts it keeps no `L.vu`. The story-off replay is byte identical.

#### The Career menus (hoops/career-ui.js, on the kit)

- **The top bar** is the title, one line under it saying where you are (the season and game,
  or the summer, then the club and record; the builder says which step), and square pixel
  buttons that each wear their word (`k-ib`: Look, Sound, Home; Vault and Back
  elsewhere). The ids did not change.
- **The player card's facts are a spec sheet** (`k-spec`: Age, Role, Coach, Contract,
  Chasing), so the eye finds a contract without reading the coach's name first.
- **The tabs are one row of icon tabs** (`k-itabs`) that scrolls sideways on a phone, brings
  the chosen tab into view and fades the right edge while there is more. Seven text tabs were
  three rows.
- **The Hall card puts Share and New career right under the verdict**, and folds Your story and
  Season by season (`k-fold`). It went from about 4,500px to 1,600 on a 390 phone.
- **The Vault's shelves fold** with a count and a bar each, found endings first, and a shelf
  with nothing on it and more than ten locks starts shut.

All four new parts are in `career-kit.js` and the style guide's Menu parts section.

#### Wild paths, and the one card that can end a career (story careers)

```
node hoops/check-story.mjs     every wild card's copy, and both arcs written to end two ways
```

Asked for by the owner: a bookie asks whether he should bet your under tonight, and a yes can
bring the FBI. Eight cards under `WILD PATHS` in career.js, each once a career and rare: the
bet, a burger chain, a fourth division soccer club, a coin with your face on it, a seat on a
rocket, a rap album, a wrestling show and a burner account. The burger and the soccer club are
two-node arcs (a year later it booms or it doesn't). Everybody in them is invented: the bookie is
`CAST.bookie`, Nicky Two Phones.

**THE BET IS THE ONE CARD THAT CAN END A CAREER.** A yes starts the `bet` arc, and that summer two
men in suits knock (`arc_bet_2`). Lawyering up beats it half the time; telling everything means a
suspension 70% of the time. A loss sets `L.flags.banned`, and `newYear` retires the career before
the next camp: "Banned for life at 27." A banned career keeps its numbers, files no Hall tier
(`H_TIER`), has no retired jersey, reads `Banned for life` as its verdict and as an outcome
(`lo_banned`), and is offered only business, Hollywood, the podcast or home afterward
(`BAN_PATHS`). Everything reads `L.flags.banned`, which only a story card sets, so the story-off
replay is untouched.

#### Phase E: Pro starts in high school, a free career starts from a generated road

```
node hoops/sim-career.mjs --n 1000 --phase E   the second sweep: generated roads, sons, difficulty, challenges
node hoops/check-career.mjs                    section 11 (the engine), section 7 (the gate, the Vault, a son)
```

The owner's calls, 2026-10-02: no daily seeded career; playing the road from high
school and the family tree are **Run The Floor Pro** (`rtf_premium`, the $14.99 a
year Endless already sells). A guest or free account starts on draft night from a
pre-NBA life generated for them, a new one every career.

**THE GENERATED ROAD IS THE REAL ROAD.** `C.generateRoad(opts)` is
`newLife({ start: 'hs' })` played by an automatic policy (each card answered off
`rngAt(L, 'gen:' + steps + ':' + id)`) and stopped at the combine card, with
`L.opt.gen = 1`. Not a new formula: its NBA outcomes sit in the road's own bands,
and the memories, people and routes it made carry on. `C.roadStory(L)` is the road
in short lines, read off `amHist` and the route memories. The four background cards
are gone from the builder for everybody; the engine still takes `bg`, so old saves
and the sweeps are unchanged.

**THE GATE IS THE START BUTTON.** `proOpen()` in `career-ui.js` asks
`RTF_MODES_UI.proOpen()` (owning Pro, or `PRO_LIVE` off). Pressing High school or
Play as your son without it opens the Pro sheet and changes nothing. A career
already started is never taken away. `RTF_CAREER_UI.proChanged` redraws the
builder when Pro arrives.

**THE VAULT** rides in the `rtf.life.v1` slot: `arc` is every finished career as a
short entry (200 kept; the full Hall card is still the newest 20 on `hof`), and
`vault` is every key found (`t:` tier, `o:` outcome, `s:` secret, `r:` road, `g:`
origin, `c:` challenge met). A card stores its ids (`card.ids`); an older card is
read back through the catalog's names, and a slot from before is backfilled once on
load. Tabs: Endings, Careers (each opens into its story), Family.

**THE STORY** is `C.careerStory(L)`, chapters built only from what the career
recorded, kept on the Hall card. Called by the page at the end, so it moves nothing
the season reads.

**A SON IS THE SON OF A FORMER PRO.** `newLife({ parent, parentLeague })` forces the
`pro_son` origin and stores `L.parent` (`cleanParent`): the father's real points are
`origin.father`, `{father}` and `{dad}` are his name, and his seasons are the copy's
count. **He starts in his own year, in the league his father left**:
`legacyLeague` copies the card's `lg` (`C.leagueEnd`, trimmed by the page) and plays
the gap forward a summer at a time with `driftLeague`, so coaches and invented stars
move on. A card without `lg` plays forward from the data's year. Only a father who
reached the league can have a son (`canFather`). Four `leg_*` cards are his.

**DIFFICULTY** is `L.opt.diff`, never written for Normal: `lvl(L)` multiplies growth
and decline and injury odds and adds to a player's impact, and every Normal term is
a multiply by one or an add of nought. **That is proved, not argued**: the story-on
replay of 1,000 careers is byte identical. An **Easy** career files no Career badges
and is not submitted to the board. Measured at 3,000: Hall of Fame on generated
careers is about 31% Easy, 21% Normal, 12% Hard.

**CHALLENGES** (`C.CHALLENGES`, nine) are goals over an ordinary career, with an
optional start (`stock`, applied once at the combine by `chStock`) or a fixed
difficulty. `challengeOf(L)` says where it stands; met or not is kept on the card
and in the Vault. Each one is met in the sweep, played as itself on Easy; a
challenge no player can chase is the unearnable badge, which is why Sixth Man and
Three rings were replaced.

**THE SHARE CARD** is `drawCard` in `career-ui.js` (540 by 756, the kit's colours,
the player at a whole scale), shared through `RTF_PAGE.shareImage`, which is
`shareRun`'s own path for a blob drawn elsewhere.

**Leaderboards by challenge and by Vault completion need a migration** and are
Phase G.

#### Phase D: origins, roads, endings, and a legend layer with an off switch

```
node hoops/sim-career.mjs --n 1000 --phase D   every band and catalog target, what CI runs
node hoops/check-story.mjs                     section 12: origins, routes, endings, the switch
node hoops/build/replay-careers.mjs --story off --against base.json   old saves untouched
```

The content phase. 305 events, 47 arcs met, 27 routes, 34 endings and 26 legend
events, all story careers only. A migrated save replays byte identical, proved
over 1,000 careers against the Phase C engine. **Do that again after touching
anything shared**: the replay is the only thing that can see a moved draw.

**CONTENT IS DATA, written through three registries in `career.js`.**
`story({...})` adds to the random pools (`STORY_NBA`, `STORY_AM`),
`storyArcs({...})` adds arc nodes to `ARC_EVENTS`, and `storyFixed({...})` adds
cards dealt by name (the epilogues, the halftime shot). `O(label, fx, result,
more)` is an answer: `set`, `rel`, `start`, `go`, `end`, `do`, `log`. Every
compiled card carries `authored: true`, which is how a check tells Phase D's
nodes from Phase C's. A node whose result is decided by what happened rather
than by the button still offers two answers (`shoeLaunch`, `curseVerdict`):
check-career fails on any card with one.

**FOUR NEW SLOTS, and each says when it is**: `alt` (the year away, labelled by
`ALT_NAME`), `predraft`, `dn` (draft night) and `post` (years later).

**AN ORIGIN IS CHOSEN OR DRAWN, and it is the one stored thing about where you
are from.** Eight in `ORIGINS`, each a small ratings tilt, a fame nudge and
sometimes a trait. Choosing one on the creation screen passes `origin` to
`newLife`; Surprise me draws it off the seed and the screen says which.

**A ROUTE IS RECOGNIZED, NEVER PICKED FROM A LIST.** The roads to the pros are
remembered as `route.<id>` when they are taken; the roads through the pros are
read off the history by `routeOn`. `routesOf(L)` is the one reader.

**THE LEGEND LAYER IS GATED TWICE.** `L.opt.legend` is the switch, set on the
creation screen and never by `migrate`. Under it, `legendOpen` opens the layer in
about one season in eleven, seeded per career and year. Without that gate the
pools run dry of ordinary cards late in a career and 89% of careers met a legend
card. Arc nodes are not gated: an arc a legend card started finishes.

**ENDINGS ARE A CATALOG, and `endingOf` is the one place a career is judged.**
Six Hall tiers (`HOF_TIERS`, a seeded vote over `HOF_AT`), eighteen outcomes
and ten secret endings. `finishLife` writes the epilogue line, which is also
`final.after`, so the badges and board that read `after` keep working.

**THE BANDS ARE TIGHT AND THEY PULL AGAINST EACH OTHER.** College at most 70%,
the other roads together near a third, and the NBA reached at most 95%. So a
route threshold in `commitCard` cannot move alone: raising the G League share
lowers college and raises reach. Tune at 1,000 careers as well as 3,000, because
CI runs 1,000 and a band met only on the bigger sample flaps.

**Three side effects that were caught, all silent:**

- Damping the old recurring events left a 600 career sweep with eleven
  weddings. The life cycle (`LIFE_CYCLE`) is exempt and dealt a little more.
- A road through a prep year or a reclassification moves ages: a rookie can be
  18 (reclassified) or 23 to 24, and a freshman 17 or 19. check-career allows
  those and still refuses an 18 year old who never reclassified.
- An arc written with one ending passes every sweep. check-story reads the
  source for each arc's endings and fails on one.

#### Phase C: the story engine, and the story has to happen in order

```
node hoops/check-story.mjs                    events, calendar, arcs, traits, people, league, the page
node hoops/build/replay-careers.mjs --out a.json   fingerprint 1,000 careers (then --against a.json)
node hoops/sim-career.mjs --phase C           continuity scan and the Phase C bands
```

Asked for with two conditions: nothing overly wordy, and every storyline has to
make sense with the timeline of what is happening.

**A STORY CAREER IS EVERY CAREER STARTED FROM NOW ON** (`L.opt.story`, set by
`newLife`, never by `migrate`). Everything below is behind `storyOn(L)`, because
check-saves plays frozen saves against the old engine. The port of the events to
data was proved the stronger way: `replay-careers.mjs` fingerprints the whole
save of 1,000 seeded careers, and with the story off they are byte identical
before and after every step of this phase.

**AN EVENT IS DATA.** `defineEvents()` fills in phases, tags, `req` (declarative
prerequisites read by `reqOk`, which throws on an unknown key), rarity, once,
cooldown and cap. `STORY_RECURS` is the list of events allowed to come back,
each with a cooldown and a cap; anything else happens once a career.

**THE CALENDAR.** `L.year` is the year a season ENDS. A card says when it is:
September (camp), December (after game 27), February (the break), April (after
game 82), the summer, or the school year and month. Three timeline rules were
broken and are fixed on a story career:

- Nothing about the regular season is dealt in April, because by then it is over
  (`STORY_PHASES`). April holds `playoff_eve` or `exit_interview`.
- A high school season stops at the halfway mark (`hs_mid`), so January stories
  can still change February. College keeps rivalry week out of March.
- The Olympics come in Olympic years (the old rule was a year early).

**COPY STATES ONLY TRUE FACTS.** A hot streak reads the player's own scoring, a
proposal says how long it has really been, a freshman wall counts the real
games, a repeat card reads its own history (`times()`): a cousin is "short
again", a rebuilt gym is not falling apart. check-story holds every title to ten
words, card text to 22 words and three sentences, answers to seven, results to
sixteen.

**`continuity()` and `continuityLog()`** scan every card and the log: in-game
stories after the season, a partner named while single, NBA cards before the
NBA, a wedding before an engagement, a memory from the future. The simulator
fails on any hit, and check-story proves the scan bites by putting the April
rule back.

**PEOPLE, MEMORY, ARCS.** `L.people` is a ledger of the invented people met,
with a meter and notes. **The names on a card are read BEFORE the answer runs**
(`relNames`), or switching agents holds the grudge against the new one. Real
people never enter it. `remember()` stamps the year and `callback()` says how
long ago in words, never about the season it happened in. An arc
(`ARC_EVENTS`, `arcStart`/`arcGo`/`arcEnd`) is dealt in its named slot ahead of
anything random, happens once a career, and settles one of two or more ways.
Six today: feud, gym, venture, promise, mentor, prep.

**CHARACTER.** Hidden traits act on a story career and are revealed by play with
a reason (`reveal`). Skill badges, a signature move, an archetype that follows
the game you play, and a coach asking for the next position over. The ledger
drives cards: an agent you keep crossing, your mom, the beat writer, the TV
critic, your closest teammate.

**THE LIVING LEAGUE IS INVENTED.** `L.league.figs` are invented stars who age,
move, win the MVP when you do not (voters tire of a repeat winner) and retire.
Every season records a champion and dynasties are named. Real clubs, coaches and
rosters are untouched; a real player's future is not ours to write. **Summer
news is stamped with the summer's calendar year** (`L.year - 1`), because
`driftLeague` runs after the year has turned.

**GOALS, LEGACY, MEDIA.** A goal card each camp, judged in April. `legacyView`
gives the rung, the next one, a Hall chance and a records watch. `L.feed` is
the news (one headline a step at most), with a debate show at the break and a
nickname the broadcast gives you.

**BALANCE.** The story layer leans careers upward, so a story career has its own
bar (`BAL`: All-Star cut, steeper decline, a playoff tax, retirement ages). The
Phase C bands hold over 3,000 careers. The People, Legacy and News tabs only
appear on a story career.

#### Phase B: the games move, and nothing under them did

```
node hoops/check-moments.mjs            the touch, the moments, the frames, every moment and ceremony played
node hoops/check-moments.mjs --quick    no browser
```

The owner's condition for sound was real animated cutscenes, not a player
standing and breathing. Four files:

| file | what it is |
|---|---|
| `baller.js` | nine moving sets (walk, dribble, shot, dunk, block, cheer, sad, shake, wave), drawn by the same rig |
| `court.js` | a pixel court and a timeline player at twelve ticks a second; the playable moments and the ceremonies |
| `ticker.js` | each stretch of the season played on a live board, 1x, 2x, 4x or skip |
| `sound.js` | WebAudio cues synthesized at runtime, off by default (`rtf.sound.v1`), only inside the court player |

**A MOVING FRAME IS A POSE NAME** (`shot2`, `walk0`), so every reader that takes
a pose takes these. An arm is two ANGLES, not two points: a point moved by eye
stretches the arm, an angle keeps its length. The six standing poses go through
code that is byte for byte what it was whenever a frame field is zero, which is
what check-sprite's 960 hashes hold. A frame can be asked for in a suit or a cap
(`dress`), for the walk across a draft stage. `handAt()` says where a hand is,
so the court puts the ball there rather than guessing.

**A FRAME'S ARMS ARE SHORT ON PURPOSE.** The grid is 44 cells wide and a full
horizontal arm is 47, so every reach was pulled in until no part touches the
edge for any build (check-moments section 5). A handshake is a forearm
foreshortened toward the camera, not an arm held out sideways.

**THE PLAYABLE MOMENT IS A TOUCH, AND THE ENGINE STILL ROLLS.** The meter turns a
press into a number from -1 to 1 and `C.choose(L, i, { touch })` moves that
shot's odds by at most `TOUCH` (0.12, or `TOUCH_DUEL` 0.2 on a duel career), with the card's own seeded draw. So a
perfect release can rim out, a better release can only turn a miss into a make
(section 2 answers the same card at -1, 0 and 1 from clones), and a touch of
nought is the card it always was, byte for byte (section 1). Scenes off (a checker only) passes
no touch. The simulator passes none, so balance is untouched by the meter.

**MOMENT CARDS GO TO NEW CAREERS ONLY.** `L.opt.moments` is set by `newLife` and
never by `migrate`, because check-saves plays frozen version 1 saves against
what that engine did, and a new card is a press the old engine never asked
for. A moment changes no record (the stretch is already played); it moves fame,
morale and a count in `L.flags`. A card needs two options, so free throws have
a second (let them ice you).

**ONLY THE INVENTED ARE DRAWN, AND THE COURT KEEPS IT.** You, your rival, the
commissioner and your invented teammates are drawn as people. Anybody on a real
roster (the man you guard, the closeout, the big you dunk on) is the same 3D rig
in his club's kit with `faceless` set in `B.paint`: a bald slate head, no face,
no beard, no band. The rig and the light, nothing that reads as a likeness. The
tale of the tape compares you with your rival, never a real player. The score
bug shows teams and the clock and no score, because the engine settles a game on
odds, not points; on a duel career it ends on `Final · W` or `Final · L`.

#### The court is traced fine, and the console look is light and lens, never new art

```
node hoops/check-moments.mjs     section 11: a canvas pixel is a whole number of device pixels
```

Asked for by the owner: the moments and cutscenes should look like a console game
loading in a browser, in the game's own pixel style. **The blur was resolution, not
style.** Every sprite was traced at one pixel a cell and blown up by seven to nine
device pixels. `fineRes(k)` in court.js picks how many fine pixels a cell gets (up
to 4) so one fine pixel is a whole number of device pixels, and the sprites, the
props (`B.prop` takes `res` now) and the floor are traced at it. Res 1 is byte for
byte what it was (check-sprite: 960 compared, 0 changed).

- **A fine sprite is painted in the worker** (`B.paintAsync`), never on the main
  thread, which costs about 150ms a frame at res 3. Until it lands the coarse one is
  drawn. `st.warm` asks for every pose a clip will use before it plays (urgent), and
  the whole vocabulary for `opts.me` is warmed once in the background.
- **The room behind the play is soft focus** (`softRoom`: blurred, a little darker)
  and the court in front is sharp. That depth of field, two additive light shafts and
  a vignette (`lens`) are most of the console look. A broadcast camera eases in on a
  loud moment and on the replay, as a CSS transform on the canvas so the pixels are
  never resampled. Reduced motion gets no camera move.
- **Shadows are soft ellipses** and a moving ball leaves a short trail. The call is
  a broadcast strip in the club's colour.
- **A scene's room is NOT blurred, and that reverses the first version.** Blurring
  it like the court's stands looked broken in a screenshot: on the court the blur
  sits behind a sharp floor, but in a scene the room IS the shot, and the draft stage
  turned to mush. The room is darkened a little and vignetted, never blurred.
  check-career 7b reads the computed filter on every beat.

#### The cutscene rooms are 3D, traced from the character's own camera

```
node hoops/check-career.mjs      7b: every room is the 3D stage, on the figure's grid, feet on the spot, furniture over a host
```

Asked for by the owner off a screenshot of the studio: the rooms were flat front-on pixel sets
(three panels, a dotted skyline, a band for a desk) behind a 3D pixel man drawn from a corner.
`hoops/stage3d.js` (`window.RTF_STAGE`) builds every room as a small 3D world and traces it with
baller.js's camera (30 degrees down, turned 35, orthographic, one cell a cell) and paints it with
baller.js's ramps, so the floor recedes the way his feet do and the light that shades his cheek
throws the desk's shadow.

- **A room is data**: the floor, the back wall and the right wall as planes, boxes traced exactly
  by slabs, round things sphere traced. Each surface has a material (a colour, a ramp bias, gloss,
  emissive, a floor reflection). Ten rooms: studio, press, draft, arena (by level), gym, locker,
  office, home, hotel, hall. Words on a wall come from a built-in 5 by 7 font (`textTex`), so they
  sit in the room's own pixels and shear with the wall.
- **Three canvases on the figure's fine grid**: `back`, `l1` (furniture in front of the far
  figure: the anchor desk, the podium, the GM's desk) and `l2` (in front of the near figure: the
  press table, a coffee table). Figures are DOM canvases between them (host z 2, main z 4), so a
  breath or a blink never repaints the room. `.scov.s3 .sc-cast` is `z-index:auto` for that, and
  nothing between the stage and the canvases may make a stacking context.
- **Spots, not a row**: a room names where people stand (`spots.main`, `host`, `host2`). The
  speaker stands at his place (commissioner at the podium, GM behind his desk) and the player at
  his, both at once. The studio always has its two invented hosts at the desk and the player's own
  face on the video wall (`portraitTex`, registered with `setTex`).
- **Size and trace are chosen together** (`plan3`): a cell is a whole number of fine pixels and a
  fine pixel a whole number of device pixels, about 80 cells across a phone, the figures traced at
  the same `r`. A res 1 preview is shown first and the fine trace swaps in when it finishes (it
  runs in slices, `draw`). Results are cached by room, size and trace.
- **Back-wall features are sheared left by the turn.** Something on the back wall at depth D shows
  about D times tan(35) cells left of the same x on the floor, so wall content is placed to the
  right of the floor spot it should frame (the video wall, the draft screen, the hall lettering).
- **A blocked or stale stage3d.js falls back to the flat `K.room` sets**, which are untouched.

The characters were cleaned up at the same time (stubble is a shadow, not a checkerboard; a
standing arm has a slight bend; a smaller shoulder cap). The neck did not move: the owner has
asked twice for a short one. check-sprite was re-recorded for it and its header says so.

#### A console cutscene shows the person talking

```
node hoops/check-career.mjs      7b: nothing blurred, every figure crisp, the commissioner on the stage
node hoops/check-moments.mjs     section 12: a tall phone spends its spare rows on floor
```

Found by looking at screenshots, after every check was green. Three faults, each
silent:

- **Most cutscene lines were said by nobody on screen.** A beat with no `pic` drew an
  empty room, so draft night was a dark stage and a line from the commissioner. Now
  `SPEAKER` in scenes.js stands the speaker there in the 3D pixel style: the
  commissioner and the GMs (named off career.js's men's list, `personName`'s
  default), the studio hosts and the play-by-play man in the studio only, a
  teammate in the club's kit, and the coach faceless because he is real. **The rig
  draws men**, so the reporters and the agents (whose names come from both lists)
  are never drawn: their line is a shot of the player (`ASKS_HIM`), because he is
  the one being asked. Family, the narrator and the timeline stay off the stage.
- **The cast was resampled by 3.33 and went soft.** `castPlan` picks the size and the
  trace together: every fine pixel is a whole number of device pixels, at the finest
  trace that fills most of the room. A figure kept across beats keeps its own trace's
  whole pixels when the room changes rather than being stretched. A room with a stage
  (`STAND`, the draft at 0.56) puts the feet on the stage line, not in the seats.
- **Half a tall phone was blurred crowd.** The court picks its cell off the width on a
  portrait phone, so the spare rows went to the stands above a small man. On a tall
  frame (`ch > cw * 0.9`) the floor line moves up to about a third, so the spare rows
  are floor around the play. A landscape screen keeps 0.46: it has spare rows only
  because of the meter, and the first version of this caught it too, which the
  section 12 guard found.

#### The rebuild of the court: the game is the team's, the moment is yours

```
node hoops/check-moments.mjs     section 3b holds the duel rules, 6 plays every moment with repeated presses
```

Asked for by the owner: the animations and cutscenes were repetitive and a little
too easy, the decision decided the game, and everything should be in the 3D
pixel model style.

**A DUEL CAREER** (`L.opt.duel`, set by `newLife` on a story career only, never by
`migrate`, so the story-off replay stays byte identical) separates the two
things a moment used to fuse:

| | decided by | moves |
|---|---|---|
| the game | the team: a regular-season night is a real game from the stretch's box (`ctx.g`, `ctx.won`), a Game 7 or a tournament tie is the clubs' odds moved by `DUEL_SWING` (0.3) on what you did | the record, the series |
| the moment | you: the shot, the read, who you trusted | fame, morale, coach trust, a teammate's relationship, memory |

So a made shot can lose (they answer at the horn) and a miss can win (an
invented teammate, named on the card as `ctx.mate`, tips it in), and the text
(`DUEL_TEXT`, `G7_TEXT`, `AM_TEXT`) and the scenes (`g7_make_lost`,
`g7_miss_won`) say both. **A buzzer shot only counts as a winner** (the flag,
`clutchHit`) when the game was won.

**THE DEFENSE SHOWS A LOOK** on Game 7 and a tournament tie (`LOOKS`: drop,
switch, chase, double). The card's text and the analyst say it, the court draws
it, and one of the four plays beats it (`READ_GOOD` +0.12) while one plays into
it (`READ_BAD` -0.08). Reading it right earns the coach's trust whatever the
result. check-moments asserts reading the look pays.

**THE COURT (court.js API 2) HAS FOUR KINDS OF PRESS**, one a job, because a
dunk is not a jumper and a steal is not a stop. Asked for by the owner: shots
should be held and let go like NBA 2K's meter, and the dunk and the passing lane
should be their own mini games.

| control | used by | what you do |
|---|---|---|
| `hold` | jumpers, free throws, the post, layups | hold, the fill climbs, let go in the green |
| `launch` | dunks and posters | hold to load your legs, let go between the rim line and the help |
| `lanes` | jumping the passing lane | two lane buttons; jump the man who shows his hands |
| `react` | the stop, the chase-down, the pass, the lob | press when he really goes |

- **The hold** (`holdTouch`, `HOLD_C` 0.78). The fill speeds up as it climbs and
  the green sits near the top, as wide as `zoneFor` says (a better shooter has a
  bigger green; a heave or a step-back shrinks it, a catch-and-shoot grows it,
  nerves wobble it). **The shooter rises while you hold**, so letting go at the
  top of the green is letting go at the top of the jump: the moment plays the
  rise itself and skips `CLIPS.rise` after. Held to the end is a brick (-1).
  Two free throws are two holds, each judged on its own (`touches`, `greens`).
- **The launch** (`launchLines`, `launchTouch`). Not a timing window but a
  trade: let go before the rim line and it is a safe layup (0.05 to 0.35, drawn
  as a layup), past it a dunk (0.6 up), and the closer to the help the harder it
  goes (1 in the last 28% of the window). If the help gets there first you are
  met at the rim (-0.9, drawn as a block when it misses). Bounce lowers the rim
  line and widens the window; a big already under the rim takes time away.
- **The lanes** (`laneTouch`, `laneWindow`). His eyes flick between two men and
  the lane button says so ("His eyes"); the man he is really throwing to shows
  his hands a beat before the ball leaves ("Calling for it"), and that window is
  longer for a better defender. Jump him then and it is a pick (1). After the
  throw it is a race (`reactTouch`). Jumping on his eyes alone, or the wrong man,
  leaves your man open (-0.8, -0.9). A guess that happens to be right is 0.15,
  so reading always beats gambling.
- **The read** (`reactTouch`) is unchanged: press when he really goes, a fake
  is a bite, the lamp is 160ms late on purpose.

**A GREEN RELEASE GOES IN.** A hold let go in the gold core, or a launch loaded to
the edge of the help, sends `{ touch: 1, green: true }`, and `touched()` in
career.js returns a make for it (`GREEN`, set per `choose`). That is the 2K rule
and the one place a press decides a shot outright rather than nudging it by
`TOUCH`. It is safe because only the court sets it, only for a touch of exactly
1, only on a shot (never a read), the draw is still made so the stream does not
move, and the simulator sends nothing. Section 2b asserts every green is a make
and that green with a lesser touch moves nothing.

**PRESSING IS A POINTER, NOT A CLICK.** `pointerdown` on the button (or the court)
starts a hold, the release is heard on the window (`pointerup`, `pointercancel`
and `blur`), so a thumb that slides off still lets go and a phone call never
leaves a shot held for ever. Space and Enter hold too, a repeated keydown is not
a press, and 1, 2 and the arrows pick a lane. A bare `click` with no pointerdown
before it (a walker's `element.click()`) is a press and an instant release, so
every checker that clicks `.ct-go` still finishes a moment. **The first
`.ct-go` in the control must be the visible one**: the second lane button lives
after it in the DOM, or a walker's `querySelector('.ct-go')` finds a hidden
button and waits for ever.

Every press shows how it went (Green, Good, Early, Late, Laid it up, Met at the rim, Jumped the lane, Bit on the look).

**VARIETY IS SEEDED** off the card's key and the option (`spec.seed`), so a moment
shown twice is the same picture: jumpers are a pull-up, a catch-and-shoot, a
step-back, a fadeaway or a heave from the logo; a closeout contests late on a
good release; drives are a dunk, a layup or a poster that knocks the big down;
five celebrations and three ways to hurt; a road game is played in the other
building's colours; a made shot under pressure is replayed slower between
letterbox bars; the booth's lines are pools (`CALLS`, `INTRO`).

**THREE MORE MOMENTS, AND MORE WAYS INTO EVERY ONE.** A story career can be dealt a
post-up (`post`: a hook, a turnaround or a drop step, mostly for a PF or C), an
alley-oop (`lob`: a read, go up when the passer lets it fly and not on his pump
fake) and jumping a passing lane (`steal`: a read, he looks you off before he
throws it). Drives add a eurostep and a reverse, and there are eight
celebrations. Before the call, a moment opens one of several ways
(`MOMENT_SETUP` in scenes.js: a timeout huddle, the studio's read, the
sideline), about one in four straight to the call. The huddle is told, never
quoted, because the coach is real. **The new cards are drawn only on a story
career**: everything else draws from `MOMENT_OLD`, the old key list, so the
story-off replay picks the same card off the same number. Appending keys with
a weight of nought is not enough, because `weighted` falls through to the last
key when rounding leaves a sliver over. check-moments plays every kind and
variant to the end, half as makes and half as misses.

**EVERYTHING IS THE 3D STYLE.** `B.prop` sphere traces the ball (four spin frames),
the rim (two halves, so the ball drops between them), a trophy, a podium and a
ring box with the player's ramps and outline. The court floor is painted per
size in court.js (`courtFloor`): boards on the wood ramp, the lane under the
rim in the home colour, the lines in perspective, the back in shadow, a pool of
light where the play is and a faint reflection of whoever stands on it.

**THE TICKER IS THE ENGINE'S GAMES.** `playChunk` writes `L.season.box`, one row
a game (opponent, home, result, your line), drawing nothing from the rng, so
the career plays as it did. Playoff results keep their game list. With scenes
on it plays as an overlay before the step's scene; with scenes off, and after,
a finished strip sits UNDER the card, never above it, because anything above a
card pushes its answers off a phone's screen (check-career section 7).

#### October is a broadcast, and the Finals are gold

```
node hoops/check-story.mjs     section 16: the bracket is the one the engine played
```

Asked for by the owner: the play-in gets a simulation, the playoffs show the full
bracket and animate it, your series feels bigger than the season, and the Finals
bigger than the playoffs, in gold. Four boards in `ticker.js`, in rising order:

| board | when | what it is |
|---|---|---|
| `rs` | a stretch of the season | the plain scoreboard, unchanged |
| `pi` | the press that leaves the season for a 7 to 10 seed | your conference's three play-in games, a beat before each of yours, the other conference beside |
| `po` | a playoff round | your series on a board of its own (team plates, the series score, seven game cells with home and away), a beat before any game that can end it, then the rest of the round filling in on the whole bracket |
| `rest` | the press that files a season you went out of, or missed | the rest of the bracket round by round, the Finals in gold, the champion |

**THE BRACKET IS THE ENGINE'S, read off `bracketOf(L)`.** Your series come off
`po.results` and `po.cur`. Every other series is the one `opponentFor` already played,
with the same seeded key (`srs:cf:r:ab`, `srs:cf:cf`) in the same order, or one it would
have played (`srs:finals`). `playInGames` and `simSeriesScore` hand back the scores with
the same draws `seedField` and `simSeries` always made, which is why the story-off replay
is byte identical.

**A FILED BRACKET IS KEPT, `po.bk`.** The summer moves club strength, so a bracket worked
out again in July crowned somebody else in three seasons of 649. `leagueChamp` stores it
and crowns its champion (story careers only), so the screen and `league.champs` agree.
A story career also keeps its own play-in (`po.pi`) for the same reason.

**A career banned for life is off the Career board** (`boardSummary` answers null). The
board reads a verdict off the score and would call it a Journeyman beside a Hall card
reading Banned for life. Found when the champion change sent check-career's walk down
the bookie's road; the walk now turns the bookie down so it still files a career.

**The class prefix is `tk` on purpose.** `.sb` and `.tk-top` are already the draft
game's (modes-ui.js), and the first draft inherited a rounded border from one of them.

**THREE THINGS THAT BIT, worth not repeating:**

- A ceremony layer and a moment layer share `.sc-court`; a ceremony is also
  `.sc-shot` and takes no pointer, so a tap still advances the scene. A walker
  that waits on any `.sc-court` waits for ever on a ceremony.
- The court's cell size is whichever binds of 124 cells tall and 130 wide. Set
  by the height alone, a phone drew a big man cut off at the edge; by a 160
  width, a tall phone drew a small man under a wall of crowd.
- One more header button wrapped the Career header to two rows on a phone and
  pushed answers below the fold. Sound and Home are icon buttons for that.

### Four ways to play, and the draft is one of them

```
node hoops/check-modes.mjs                 the rules, the copy, the SQL, a browser walk
node hoops/check-modes.mjs --quick         no browser
psql -d hoops_modes -f supabase/test/hoops_board_base.sql
psql -d hoops_modes -f supabase/116_hoops_modes.sql
psql -d hoops_modes -f supabase/test/hoops_modes_test.sql
```

Reported by the owner: a draft that goes 73-9 is the football game with a
basketball on it, and a season is one decision followed by a long wait. So the
front page used to lead with three games that are not drafts. It leads with the
draft again now, as **Classic** (see the front page section), because the dailies
are one play a day and Classic is the mode a player comes back to.

| | what it is | where |
|---|---|---|
| Fix History | the daily: one real team that fell short, one salary-matched trade | `fx*` |
| Six Passes | the daily: one All-Star to another through real teammates | `ps*` |
| Conquest | winners stay on against real teams; take a man off each one you beat | `cq*` |
| Classic | the draft, unlimited, and the front page's lead | `run.js` |

`hoops/modes.js` is the rules and `hoops/modes-ui.js` draws them, through
`window.RTF_PAGE`, which the page publishes before it boots. The UI file injects
its own stylesheet, which is `/assets/store.js`'s arrangement: a stylesheet in
its own file is a second cached thing with a version nothing checks.

**NONE OF THE THREE IS A SECOND MODEL OF BASKETBALL.** Every rating is the
pipeline a drafted five runs through, every game is `resolveGame` and every
season is `playRun`. The modes decide who plays, never how a game goes, so the
calibration the draft is balanced on carries over untouched.

#### Conquest: you draft your five, from the tier the ladder is tuned to

Asked for, and option A of two. Five picks, one a position, **three cards each,
every card from the dealt crew's own tier** (3 to 6 win shares). So choosing
changes who your five are and not how good the start is. The other option was
a draft under a small cap, which would have made the first ten rungs a
formality and meant retuning the ladder.

Measured over 200 runs a strategy, with the best steal after each win:

| how you pick | start rating | median wins | clears |
|---|---|---|---|
| dealt crew | 24.5 | 7 | 5.5% |
| first card every time | 24.3 | 7 | 5.5% |
| most points | 29.1 | 8 | 5.5% |
| most win shares (never shown) | 34.5 | 9 | 8.5% |

So reading past points is worth about two wins and three points of clear rate,
which is skill paying without breaking the ladder. `check-modes` holds the best
possible draft inside the same band; with the tier filter removed it reads a
median of 16 and 25% clears. **Just deal me five** keeps the old start for
anybody who wants to skip the draft. The cards show the stat line and minutes,
never win shares, and a reload shows the same three (`cqDraftCards` draws off
the run's seed and the slot).

#### Conquest: one loss and out could not carry it

The first version was one loss and the run is over, and a single NBA game is too
noisy for that. A team fifteen rating points better wins about three in four, so
over 200 runs a bot the median was ONE win whatever the steals were, and the bot
that took the best man every time finished within a game of the one that never
took anybody. **The steal did not matter, and the steal is the game.**

Three lives fixed it. A loss costs one and the same team stays on for a rematch;
beating a boss (every fifth rung) gives one back. Measured, 200 runs a bot:

| | median | p90 | clears all 25 |
|---|---|---|---|
| the best steal | 6 | 23 | 6.5% |
| never steals | 4 | 9 | 0% |

`check-modes` holds the SHAPE rather than those numbers, because the ladder is
drawn off the pool and a refreshed season moves every figure a little.

**The crew is role players, not scrubs.** Scrubs rated 1 and made the first game
a 28% chance.

**A REMATCH IS A NEW GAME, so the attempt is in the rng tag.** Without it a loss
replays itself identically until the lives run out. Proved by mutation: the
balance band collapses to a median of one.

**The scoreboard reveals a result that already exists, and three things on it
spoiled it.** `cqPlay` decides the game before the quarters start, so the win
counter read "1" in the second quarter, the lost life dimmed at the tip, and an
overtime column appeared before a ball was thrown. The count and the lives are
held back until the final horn (`cqShown`, `cqLivesHeld`) and the fifth column
is added when overtime is reached. The guard reads the counter mid-game.

The win chance printed before tip-off is read off `resolveGame`'s own
arithmetic, and `check-modes` holds it to 20,000 simulated games at three rungs.

#### Conquest: the game plan is the skill, and ten other designs were not

```
node hoops/check-modes.mjs      section 3b holds the ladder of skill
```

Reported by the owner: the gauntlet had no control. You tip off, you watch, and after
a win the steal screen has already worked out who to take. **Before any code, ten
designs were prototyped and measured, 200 to 300 runs a bot**, and all but one failed
the same way:

| tried | what it measured |
|---|---|
| a bench, and men who tire | resting a star bought nothing, and runs got shorter |
| a salary cap that grows with wins | saving money bought nothing |
| hiding win shares on the steal | a strong stat reader got 5.6 wins against 8.8 for perfect |
| three doors, weaker to stronger | the weakest door always won |
| a stronger door worth two steals | a coin flip either way |
| roster continuity | upgrading always won |
| a steal or a life back | the life always won |

**The reason is one fact about the mode.** A single game is close enough to a coin
flip that taking the best man available is nearly optimal, so any rule that pays
later is worth nothing. Skill has to live inside the game on the court.

**A game plan is a read of this matchup.** Five plans (the glass, the rim, the arc,
the passing lanes, the ball movement), each paying by how much better your five is
in that area than theirs, off the engine's own pace-adjusted roster profile, scored
against the spread over every real club's best five. So six extra rebounds beats
eight extra threes, which is the read. Through `cqPlay`, 600 runs a bot:

| | mean wins | clears |
|---|---|---|
| the worst read | 6.8 | 3.2% |
| no plan | 8.3 | 5.2% |
| a random plan | 9.1 | 7.0% |
| the biggest raw gap | 11.8 | 13.0% |
| the best read | 12.4 | 15.2% |

**THE SCREEN SHOWS BOTH FIVES' NUMBERS AND NEVER THE EDGE**, and the odds bar does
not move when a plan is tapped. A chance per plan would let anybody try all five and
keep the best, and the read is the whole decision. The verdict after the game says
how it went and what the better read was, which is how a player learns the scales.

**It is bounded and it is the one thing Conquest adds to a game.** `CQ.PLAN` points
per 100 possessions a half standard deviation, clamped at two, so no plan moves a
night by more than four. `resolveGame` still decides it. No plan is a legal game and
costs nothing, which is what a save from before plans plays as.

**The ordering guard leaves overtime out.** An overtime draws more noise, so a small
shift that turns a tie into a regulation win is a different path through the rng,
not the plan misbehaving. Measured: 49 of 49 non-overtime matchups order correctly.
Proved by mutation: with the plan ignored, three skill claims fail.

**Film room** (`cq.film`, wins on the right read in one run) is the badge for it, at
three and ten. The badge bots read the plan the way a good player does.

#### Fix History: the score is the odds, not the replay

One replayed season is a coin with a ring on one side, so two people who made
the same move would land hundreds of places apart on the dice. **The score is
the share of 1,000 seasons the new five win, on the day's seeds**, so the same
five score the same number on every device and a leaderboard can rank it. One
season is replayed off the day's seed as the story.

`fxOddsStep` is the same count over a slice, so the screen plays the thousand a
frame at a time and the meter settles as they come in. It is the whole of
`fxOdds` rather than a copy: seeds are addressed by index, so any split adds up
to the same answer, and the guard says so.

**The daily team's five are the best five of its top nine who can cover the
positions.** The best five by win shares alone fit PG, SG, SF, PF and C on only
533 of 1,433 team-seasons, because plenty of great teams had three bigs.

#### Fix History is a season of trade windows

```
node hoops/check-modes.mjs            section 4 holds the windows, section 7 walks one
psql -d hoops_season -f supabase/118_hoops_fix_season.sql
psql -d hoops_season -f supabase/test/hoops_fix_season_test.sql
```

Asked for, in two rounds. First a trade finder like The Perfect Season's Trade
Machine, same season only, bench included. Then: one trade was too few, it
should be three or four windows up to the deadline, each club should make one
offer at most for a package, a package can be three players, and the team's
draft picks can move too.

| window | opens after | a trade made here plays |
|---|---|---|
| Preseason | game 0 | all 82 and the playoffs |
| Game 20 | 20 | games 21 to 82 and the playoffs |
| Game 40 | 40 | 41 to 82 |
| Trade deadline | 55 | the last 27 and the playoffs |

One trade or stand pat in each window, then the season plays to the next.

**One offer per club, and it is the club's best FAIR one.** A club counts value
at MARKET PRICE (points), so it sends the dearest package it can that is still
no more than it receives. Salaries also match both ways (125% plus $0.1M), both
rosters must still field a five, and each extra body it sends costs it
`TRADE.BODY` so it prefers to send fewer. `check-modes` rebuilds one club's
offer by brute force and asserts nothing legal beats it.

**Picks are value without salary.** Three firsts at $7M and two seconds at $2M.
Adding one lets you take back more than you send, up to what the salary rule
allows, which is what a pick is for in a real deadline deal. There is no record
of who owned what in 1987, so every club owns its own.

**Who calls is drawn off the day and the window, never the package**, at 70% of
clubs. Reshaping a package cannot reshuffle who is on the phone.

**THE FRANCHISE PLAYER IS NOT FOR SALE.** Market price is points, so without it
a club gave up its star for anything that added up to his salary: the first
probe traded Pierce and Garnett for LeBron's 2009 and Booker for Durant's 2021,
and a perfect-knowledge bot took the 2009 Celtics from 22% to 84%. A club's
dearest man is untouchable.

**The balance**, bots over five days with the star rule in:

| day | as built | trading for points | trading for win shares (never shown) |
|---|---|---|---|
| 2011 Bulls | 8% | 0% | 58% |
| 2021 Suns | 5% | 0% | 31% |
| 2009 Celtics | 21% | 12% | 62% |
| 2019 Bucks | 14% | 1% | 56% |
| 2025 Nuggets | 11% | 0% | 48% |

Chasing points makes every team worse, which is the trap, and reading value is
the puzzle. The full `check-modes` run asserts both halves on three days.

**The season is played in stretches.** `fxPlayStretches` draws from the rng in
exactly playRun's order (the schedule, each game, the playoffs), with each
stretch's games rated off the five who started then. So standing pat all
season is the team as built, season for season (asserted), and **the games
before a window never depend on what is done at it** (asserted), which is what
lets the screen show a record between windows and keep it. The score is still
the title odds over the day's 1,000 seeds; the one replay is the story.

#### And you can negotiate

Asked for next: counter and negotiate with the clubs. An offer is the club's
opening position. **Counter** opens a table: ask for any of their men (never the
franchise player, drawn locked) and reshape your side, then propose.
`fxPropose` answers, deterministically, so two people who make the same
proposal hear the same answer.

| answer | when | what it costs |
|---|---|---|
| yes | you send at least what they give plus the premium | a proposal |
| counter | you are short, and ONE cheapest thing on your side closes it | a proposal; the club names it |
| no | short, and nothing single closes it | a proposal; the second no hangs up |
| illegal | a rule breaks (salaries, a five, too many men) | nothing: the reason is shown |

**Countering costs you.** Proposal k wants `TRADE.PREMIUM * k` (5%, then 10%)
more market value than the club gives. That is what keeps it a decision rather
than a free menu: the offer is cheaper, and the men you actually want cost a
sweetener. Measured with a bot that targets the most valuable players by true
value and pays the premium, the same five days land 26% to 62%, the range the
offer-taking bot reached, so negotiating is a way to get the man you want and
not a way around the balance.

**Two proposals a club a window, then it hangs up** and stops calling until the
next window, which starts a fresh conversation (`st.talks` is keyed by window
and saved with the season). The server never sees any of this: what is filed is
the trade that came out of it, which 118 already checks.

**The hang-up test needed a fixture that is legal, short and cannot be closed**,
and the first attempt was illegal, which (correctly) costs no patience, so the
club never hung up. It searches for three men out (no room for a fourth) short
by more than the dearest pick. Both the hang-up and the cheapest counter were
proved by mutation.

**Who starts after a trade is not shown before it is made.** The lineup is
chosen by win shares, so previewing it per offer would print the answer key.

**A LEGAL TRADE COULD HAVE NO LINEUP, and it shipped for one run of the walk.**
`canCover` (a bipartite match over the whole roster) decides legality, and the
lineup was `fiveOf` over the top NINE. Trade away the only guard in that nine
while a guard sits tenth and the trade is legal with no five, so the page hung
on "Replaying history" for ever. `fxLineup` looks down the whole bench when
nine is not enough. The daily five stays nine deep, because widening it would
move the calendar of teams.

**Offers show the stat line and minutes, never win shares.** Your own roster
shows win shares, because you know your own team.

#### You set the five, and a board row opens into the season

```
node hoops/check-modes.mjs            section 4b the rules, section 7 the drag and the dropdown
```

Asked for: move players around the lineup by dragging and swapping them, and
open a Fix History board entry into its final roster.

**The spot label is the drag handle, and only the label.** It carries
`touch-action:none`, so a thumb anywhere else on a row still scrolls the page
and a tap on the row still puts the man on the block. Drop one man's label on
another row and the two swap: two starters trade spots, a bench man starts and
the starter sits. A tap on a label that does not move picks that man, and the
next label tapped is who he swaps with, which is the same swap without a drag.
**Coach's five** appears once the five differs from the coach's and puts it back.

**Any five, any spot, deliberately.** That was the ask, and the fit model already
charges for a bad shape because it reads what the five do. A man outside his
listed positions wears his spot label in amber.

**`st.lineups[k]` is the five set at window k, in SLOTS order, and it carries
forward.** `fxLineupAt` reads the latest one at or before a stretch. A starter
traded away leaves a hole, filled by the best man left who can play that spot,
and the other four keep the spots they were put in. No lineup is the coach's
five, so a season from before this plays exactly as it did, and setting the
coach's five back deletes the key rather than storing it. The lineup is in
`fxStKey`, or the odds memo would print the odds of the last five. A lineup set
at a window never moves a game before it, which section 4b asserts.

**The lineup is not filed.** 118 has no column for it and a migration for one
line of display was not worth a hand deploy. So the board dropdown rebuilds the
FINAL ROSTER from `fix_ts` and `fix_trades` in this browser's own data, with no
request, lists it by win shares with the men who came in marked New, and makes
no claim about who started. Above it: the title odds, the odds as built, the
replay record, and each trade by its window. The result screen does draw the
five you set, because the finished result keeps `lineups`.

**The walk drags with the real pointer, and it has to put both ends on the
screen first.** Dragged from a bench row to a starter scrolled above the window,
the pointer left the page and the drop found nothing, which read as the handle
being broken. Proved by mutation: with the drag unwired, eight claims fail by
name, and with the hole filler removed the four starters lose their spots.

**THREE SHAPES OF RESULT ARE READ AS ONE** by `fxNorm`: the first version's
one-for-one (`slot, out, inKey`), the second's single trade (`with, outs, ins`)
and this season (`trades`). Each files through the submit it was made for:
116's `rtf_submit_fix`, 117's `rtf_submit_trade`, and 118's
`rtf_submit_fix_season`. A season in progress lives under `rtf.fix.run.v2`, so a
reload lands in the same window with the same trades.

#### Six Passes: the ends are All-Stars, and the gap sets the par

The first version took both ends from the best careers by win shares and served
Derrick McKey and Michael Cage. **Both ends now have three or more All-Star
nods**, which is 162 men, every name a fan expects.

**The gap between the two careers is what sets the par**, measured over every
pair of the 162: under ten years apart is par 2 nine times in ten, twenty to
twenty-nine is mostly 3, thirty or more mostly 4 with real 5s. A twenty year
floor lands a year of days on 3 (209), 4 (138) and 5 (18), none missing.

**The picker is grouped by club STINT, each teammate once.** By season, Reggie
Theus's picker was 9,900 pixels tall, because a ten year career repeats one
locker room ten times. The ten best known show first and the rest are a tap away.

Every pass is final and the shot clock is ten passes. An undo turns it into a
map to be searched at leisure.

**The years are hidden, and easy mode costs a pass.** A teammate tile shows only his name.
The button under the last group ("Too hard? Use a pass to reveal the years each player played
for that team") sets `st.easy`, which adds one to `passesOf()` for the clock, the verdict, the
share and the board, and shows each man's seasons with THAT club (`clubYears`), not his career.
It is not offered when spending it would end the clock. The server counts it too:
`supabase/134_hoops_passes_easy.sql` gives `rtf_submit_passes` a `p_easy` argument, and
`board.js` sends it only when it is true, so a normal chain files against 116 unchanged and an
easy chain is refused there rather than filed a pass short. Deploy 134 by hand; preflight row 44.

**The two ends wear pixel portraits, and they are silhouettes on purpose.** There
is no licensed art, and a face drawn from a hash would put a guess about a real
person's hair, build and skin on him, wrong about most of them. So `portrait()`
draws the true parts: the jersey of the club he earned the most win shares with,
and a broader frame for a center or power forward. The timeline ends at a pixel
hoop, and the mode icon is the same hoop. It used to be a bullseye and a golf
flag, which are two other sports.

#### A missing brace unstyled half the modes, and the desktop is its own shape

Reported as Six Passes looking jumbled on a desktop: names and years run together,
ragged orange pills, the ends stacked down the left edge. **None of it was a layout
choice.** The leaderboard pass deleted the line that closed `.fx-chip` in
`modes-ui.js`'s injected stylesheet, so that rule swallowed every rule after it:
Fix History's filters and offers, all of Six Passes and the board sheet drew as
raw browser defaults. Nothing threw. `check-modes` section 6 now counts the
stylesheet's braces out of the source, and fails on the deleted line.

With the styles back, the screen has two shapes off one grid (`.ps-top`). A phone
sets the ends side by side with the hoop between and the timeline under both. From
920px the page widens to 1040, the timeline sits BETWEEN the two ends (one career
left, one right, the passes joining them), and the picker is two columns of clubs,
each a grid of even tiles with the name over its years and long names cut with an
ellipsis rather than a wider tile.

**A finished chain is a win card, above everything else.** It used to be four lines
of text and a count under the timeline. Now: the verdict in the pixel face
(Bucket!, And one!, Scored, or Shot clock in red), three stars off how far over par,
the count on a scoreboard, and a passing lane of every man who touched the ball, in
order, with the club and season of each pass on the arrow. A solved chain fires the
page's confetti (`RTF_PAGE.confetti`). `check-modes` asserts the card is above the
ends, the lane has par plus one hands, and the desktop row, tile widths, two columns
and two line tiles off the rectangles; each was proved by breaking it.

**On a desktop the two ends and the timeline are pinned under the site bar, and run
the width of the window**, asked for by the owner: the two players are the whole
puzzle, so they stay on screen while the picker scrolls. The bar carries the app bar's
blurred backdrop, bled up over the gap under the bar. **The timeline is drawn WIDER,
never scaled up**: `psTlWidth()` makes the viewBox the box's width over
`PS_TL_SCALE`, because the 340 wide picture stretched across a 1920 window came out
400px tall. A resize redraws the timeline alone when its width bucket moves. A phone
keeps 340 and scrolls the ends away. `check-modes` asserts both, and removing the
sticky fails it.

#### Endless and picked puzzles, and the day they are Pro

```
node hoops/check-modes.mjs            section 5b holds the numbering, section 7 walks every door
```

The dailies stay one a day and free for everybody. On top of them: **endless** (a fresh
Fix History team or Six Passes pair every press), **any team** (a club and a season, champions
included, rebuilt through the same four windows) and **any two players** (a made Six Passes
puzzle, par worked out). A made puzzle or a picked team travels as a link a friend opens free.

**NEITHER DAILY IS A STORED PUZZLE, which is what made this cheap.** `fxDaily(data, day)` and
`psDaily(g, day)` build the puzzle off a number, and every seed under them (the calls, the odds,
the replay) is `'fix:' + day`. **An endless or picked puzzle is numbered BELOW ZERO**, and a
calendar day is 1 and up, so no seed an extra puzzle builds can ever be a day's. `isEndless()`
is that test. Random endless numbers come off `Math.random` and are STORED, so a reload lands
on the same team. A picked one is `customNumber()`, a hash of what was picked, so two people on
one link get the same calls and the same odds: section 5b plays one link twice and compares.

**Endless never writes a daily key**, and that is the whole safety argument. Its state is
`rtf.fix.endless.v1` and `rtf.passes.endless.v1`, never `rtf.fix.v1`, `rtf.fix.run.v2` or
`rtf.passes.v1`, so an endless season cannot overwrite today's saved one and today's result,
streak and place read keys endless never touches. Nothing endless submits to the board. The
front page, the dock and the draft's doors ask `fxToday()` and `psTodayState()` rather than the
screen's current puzzle, because the screen can be on an endless one.

**AN EXTRA PUZZLE COUNTS FOR EVERYTHING BUT THE CALENDAR.** A deal, a gain, a title in the
replay, a chain at par are skill whatever puzzle they came from, so those feats file. Days
finished (`fx.days`) and days running are a claim about coming back each day, and a button that
deals a new team every press would make both worthless, so endless files neither. The walk
checks `fx.days` does not move.

**A link is a hash** (`#fix=CHI_1996`, `#pass=jordami01.jamesle01`). A hash never reaches the
server, and the link is built off the SENDER's own page rather than a written-out domain, for
the www-against-apex reason in the Stripe section. It is read once on boot and on `hashchange`,
then cleared, so a reload after finishing goes to the front page.

**IT IS RUN THE FLOOR PRO**, $14.99 a year and renewing, the `floor-pro` bundle granting `rtf_premium`
(`supabase/123_hoops_pro.sql`, go-live order in `functions/api/stripe/README.md`). Same shape
as Diamond Pro: one checkout, one webhook, and the page asks `premium_products()` through
`hoops/auth.js`. `endlessOpen()` in `modes-ui.js` is the one gate. There is no server meter,
because nothing endless reaches the server: the gate is a convenience rather than a lock, and
nothing competitive depends on it. `PRO_LIVE = false` is the kill switch that opens it to
everybody if the store ever has to come down, since a lock with nothing behind it is a wall.

**A LOCKED DOOR OPENS THE OFFER, it is never hidden and never dead.** The four Endless and
Build chips are drawn for everybody; without Pro they wear a Pro tag and every press lands on
`#pro-sheet`. A door nobody can see is a mode nobody knows exists. **Only `rtf_premium` opens
it**: another game's Pro does not, and the walk asserts that from both ends. A null answer
from the account read is no opinion and changes nothing, so a dropped connection never takes
Pro away mid-puzzle. **Opening a link never asks**: `fxPlayPicked` and `psPlayPicked` are the
doors a link uses, because whoever made the link is the one Pro paid for, and the walk opens
both links on a fresh guest page to prove it.

**Tester accounts are comped Pro** (`PRO_TESTERS` in `modes-ui.js`, the five usernames
the football game's `dynasty-access.js` comps One Franchise to, plus `PRO_TESTER_IDS` for an
account with no name). `proRefresh` asks it before `premium_products()`. It is a comp in the
page and never a `premium_unlocks` row, so nothing is filed and no other game sees it. No email
addresses in that list: the file is public. check-modes holds a tester to every door open and a
name off the list to every door shut.

**The checkout is stood in and never let out**, the same rule as the football store: section 7
answers `/api/stripe/checkout-bundle` itself with `stripe_not_configured`, asserts the body
names `floor-pro` and the token rides in the header, and fails if anything else was asked.

#### The boards, and `supabase/116_hoops_modes.sql`

One table, `rtf_plays`, and not `rtf_runs`: that table is a finished SEASON and
none of these is one. **The score is derived by the server** from the result
each submit function is sent (the odds, the chain, the wins), and higher is
better on all three boards. What cannot be checked in plpgsql is trusted within
bounds, which is 108's own position on a season's record: a thousand seasons of
the engine is not a stored procedure. What can be checked is: the day is today
(Eastern, 108's epoch), a chain fits the shot clock, a solved chain is not under
par, and one account files one of each daily with the first standing.

**Deploy 116 by hand.** Without it all three modes play and keep their results
on the device, and every place line and leaderboard is empty, which looks like a
network that is down. Row 26 of `launch_preflight.sql` asks for it.

**Deploy 118 by hand as well**, row 28 of the preflight. A season of trades
files through `rtf_submit_fix_season` and its `fix_trades` column, so without it
every window plays and nothing reaches the board. The board's read drops a
missing column group and asks again (`PLAY_OPTIONAL` in board.js), so no
migration missing takes the other boards down with it. The server checks every
shape it can (four trades at most, one a window, a man sent out was on the team
or taken back earlier, a pick is one of the five and never sent twice, the
headline was taken back) and cannot check the salary rule, the value rule or
the odds.

**Deploy 117 by hand too.** A trade files through `rtf_submit_trade`, which 116
does not have, so without 117 every trade plays and nothing reaches the board.
It is row 27, its own row, because 116 answering yes is exactly the state it
misses. The board's READ does not need it: `playTop` asks for the three new
columns, and on a 400 naming them asks again without and remembers. Otherwise a
database still on 116 would take every board on the page dark over three columns
that one detail line reads. `rtf_submit_fix` stays for pages cached from before.

**A place never prints past its field.** The two counts are separate requests
and the play being placed can land between them, so "42nd of 41" was a reachable
answer. Found by the stand-in in `check-modes`.

**The SQL test's first two failures were the test.** A submit called inside a
WHERE ran once per row scanned and filed a play each time; a rename checked in
the statement that made it read the snapshot from before it. Both are two
statements now.

#### The front page: the daily puzzles, Classic, the Daily Draft, More ways to play

```
node hoops/check-home.mjs     section 4 holds the order, the strip and the sheet, section 1 the length
```

Asked for by the owner, three times. First: the unlimited mode has to be the
focus, or players play the two dailies once and leave, so **the draft is Classic**
and it is the hero. Then, with Run The Diamond as the model: the other modes go
under a **More ways to play** door, and **the daily challenge gets a spot of its
own**. Then: **Fix History and Six Passes go at the top, as the daily puzzles.**
Then, a fourth time: **Career leads the whole page**, as a stage with the drawn player in it
(see the Career section), and Classic drops its court and reels to a compact card. The table
below is everything under the Career card, in order.

| order | what | where |
|---|---|---|
| 1 | Daily puzzles: Fix History and Six Passes, side by side, with how many are left | `#hp-puzzles`, filled by modes-ui.js |
| 2 | Classic: eyebrow, title, reels and court, the three pace chips, the career line, Start | `#classic` in index.html |
| 3 | the Daily Draft, its own card, gold until today is played | `#b-daily-go`, `renderDailyDoor()` |
| 4 | More ways to play: One Franchise, Decades, Conquest, and Endless for Pro | `#mw-grid`, one grid |
| 5 | three doors: How to play, Leaderboards, Career | `#home-quiet` |

**THE PUZZLES ARE A STRIP, NOT A HERO**, which is how the third ask sits with the
first. One heading and two half-width cards at every width, about 190px on a
phone, so Classic is still the first big thing on the screen and the dock still
carries its Start. Each card says today's state: the mode's colour and a Play chip
while open, plain with a green chip carrying the result once done. The line
beside the heading says how many are open, or when the next two arrive. The cards
keep the ids the tiles had (`#mc-fix`, `#mc-ps`), so every walker still finds
them; `tapMode` in check-modes shuts the sheet first if it is up, because the
puzzles are never in it. The section ships `hidden` and `renderHome()` shows it,
since only modes-ui.js knows whether a puzzle is done.

**ONE GRID, TWO HOMES.** A desktop (920 and up) draws `#mw-grid` in `#hp-tiles`,
beside the daily card, two across, and draws no door. A phone keeps it hidden
and reaches it through `#b-modes`, which opens `#modesheet`: `openModes()`
**moves the grid into the sheet** and `closeModes()` moves it back, which is the
dock's rule (move the real button, never a copy) arriving at a grid. So there is
one set of ids, and a checker presses `#mc-cq` wherever it currently lives. Any
press inside the grid closes the sheet behind it, and `show()` puts the grid home
on every screen change. `check-home` presses a tile from the sheet and asks where
the grid went; with the move back removed it reports the grid stuck in the sheet.

**The page owns two tiles and modes-ui.js owns the rest.** One Franchise and
Decades are static markup painted by `renderModeDoor()` and `renderEraDoor()` (a
remembered club wears its colours and gets a Switch club press under it).
Conquest and the Endless tile are filled into `#mw-cq` and `#mw-pro`, and the two
puzzle cards into `#pz-fix` and `#pz-ps`, by `renderHome()` there.

**A desktop keeps Start in the Classic card.** The card is two columns there,
words left and court right, and `DOCK_FOR['s-home']` returns nothing while
`(min-width:920px)` matches, because a bar pinned to the foot of the window
floated over the daily card and the tiles. A phone docks it. A resize across 920
re-docks through the `WIDE` listener.

**The injected `.ptile` rules are gone, and they were a bug.** modes-ui.js had
styled the old Conquest tile as `.ptile`, which is also the DRAFT BOARD's tile
class, and its sheet is appended after the page's, so `.ptile{display:flex;...}`
had been overriding the board's own grid layout since the tiles pass. Mode tiles
are `.mtile` and puzzle cards `.pz`; neither shares a class with the board.

**`check-home`'s budget is 2.5 screens.** It came down 2.7 to 2.3 when the modes
went under one door, and the puzzle strip put 360x740 at 2.37, so it is 2.5 with
the reason written beside it. A card of prose left open is about 800px and still
fails it at every width. On a 568-tall phone the masthead and the strip fill the
first screen, so Classic is only asked to start on it there. The league's numbers
still live in How to play (`.lgfacts`), and Leaderboards is one sheet with a chip
per mode.

#### The archetype line names this team's players

```
node hoops/verify.mjs     the block headed THE SYSTEM, IN THIS ROSTER'S OWN NAMES
```

Asked for by the owner: the description under the team archetype should be as
team specific as possible, and can name the drafted players and how they fit. A
blurb is the same sentence for every Pick and Roll roster. `E.systemStory(key,
roster)` is the same system in this roster's names: "Stockton runs the pick and
roll. 13.4 assists a night. Malone sets it and dives." `detectSystem` returns it as
`story`, and the draft's fit card, the season card (`#p-sys`) and the results
screen (`#o-sys`) print it, with the blurb as the fallback for a cached engine.

**Every name is found by ROLE off the numbers the detect read**, per game at the
league's pace: the best passer, the best rebounder, the man taking the shots, the
man in the C slot. A surname unless two men share one. A name ending in a stop
(Jaren Jackson Jr.) at the end of a sentence would print two, so the story folds
them.

verify plays 1,500 drafts nine ways and asserts all 22 systems are met, every
story names somebody on the team, none carries a dash or a stray field, and two
rosters in one system are told two different stories. That last claim is what
keeps it from being a second blurb: a `systemStory` that returns one fixed
sentence fails it and the naming claim.

**`check-bracket`'s door walk needs a SEEDED run.** It took any run that
reached the bracket, and a play-in run is one game: it can never open the series
door, and losing it ends the run before the bracket proper. So about one run in
eight failed sections 6 and 7 together and read as a flake. `toPlayoffs(page,
true)` keeps drafting until the run has a bye; section 8 still takes play-in
runs, because the play-in is its subject.

**`check-bracket` had been failing on every run since Game 7 became the only
door**, because a door comes about one run in five and the walk waited for one
that mostly never came. It widens the door inside the page the way `check-live`
already did; the real rule is asserted in `check-live` off the engine.

### The roster is a STARTING FIVE, and six was never this sport's number

```
node hoops/verify.mjs      the refit, the budgets, the cap, and the prose
```

Six was the football and college games' count, landed on here by adding a sixth
man to the five who actually take the floor, and that bench slot was the only
thing on the draft screen that had to be explained. **Every count in the engine
is `SLOTS.length`**, and the change from six to five is what proved which
numbers were derived and which were typed.

**THREE THINGS UNDERNEATH IT WERE TIED TO SIX AND ALL THREE FAIL IN SILENCE.**

**The fitted ratings.** `OWS_TO_ORTG` and `DWS_TO_DRTG` are fitted to
twenty-two real NBA records THROUGH `teamStrength`, which rates a real club by
its best `SLOTS.length` men, so changing that number moves all twenty-two
ratings and breaks the fit by the edit rather than by anything about the data.
The twenty-two are not in this repo, so what was solved instead is **the pair
at five men that best reproduces the rating every real club already had at
six**: least squares through the origin over all 1,403 club-seasons, with
replacement level held fixed because it is a fact about a team of nobodies
rather than about how many nobodies. **0.695 to 0.7503 and 0.605 to 0.6838**,
at a cost of **rms 1.08 wins and a worst case of 3.26**. The 1996 Bulls and the
2012 Bobcats each move by 0.3, so the fit against the twenty-two is about 3.6
wins rms now rather than 3.5.

**The shot budget and the glass, MEASURED rather than scaled.** Over the same
1,403 clubs the five men who play the most minutes take a pace-adjusted **63.7
attempts** a game against a top six's 69.8, and **29.6 rebounds** against 32.9.

| | at six | at five |
|---|---|---|
| `SHOT_BUDGET` | 72 | **66** |
| `SHOT_SHY` | 58 | **53** |
| `REB_TARGET` | 34.0 | **30.5** |
| `TEAM_AST` | 20.0 | **18.4** |

Re-measure rather than re-scale if the roster size moves again: the top man of
a club takes far more than the sixth, so a ratio drawn off the wrong end of
that list would say the wrong thing. The anchors (`RIM_ANCHOR`, `CREATOR`) are
a PERSON rather than a sum and do not move; `SPACING` is a mean and does not
either.

**And a seam nobody had noticed.** `teamStrength` rates a real club's men at
full weight with no `_slot` on any of them, so the reference every rating in
this game is fitted against was summing SIX at 1.0 while a drafted roster
summed five at 1.0 and one at 0.72. The two sides of that comparison were never
the same shape. They are now.

#### The cap went UP per slot, which is not the direction anybody guesses

Six slots at $126M is $21M a slot and five at **$120M is $24M**, which reads
like the draft got easier. It did not: dropping a man was paid for by the
refit, so the cap buys the same team out of fewer, better contracts.

Swept at 98, 102, 105, 108, 112, 116, 118, 120, 123 and 126:

| cap | ceiling wins | ceiling title | beats 72 | greedy wins |
|---|---|---|---|---|
| $98M | 53.6 | 4.1 | 0.1 | 38.0 |
| $105M | 56.3 | 5.8 | 0.3 | 40.0 |
| $112M | 58.2 | 10.2 | 1.3 | 42.0 |
| **$120M** | **60.9** | **13.0** | **2.9** | **44.0** |
| $126M | 62.1 | 15.7 | **5.6** | 46.0 |
| *want* | *58 to 66* | *6 to 18* | *0.5 to 6* | *40 to 50* |

Everything is out of band under about 108, and **at the old 126 "beats 72"
reaches 5.6 against a ceiling of 6**, which is the flip-on-the-seed case that
block already warns about. **$123M puts the four nearest their middles and it
ships at $120M**, which is the weekly fantasy cap's own call: three tenths of a
win against a figure somebody can hold in their head.

**THE GAP BETWEEN GREEDY AND THE CEILING NARROWED AND NO CAP RECOVERS IT.**
About **17 wins** now against 18.6 at six, and measured at 116, 118, 120 and
123 it sits between 16.2 and 16.9 whatever the cap is. What shrank is the
NUMBER OF DECISIONS, not the room in the budget. That is the honest price of a
shorter draft and it is the number CLAUDE.md already says to watch.

#### What the mode gave up, said rather than hidden

- **The 0.72 was the only reason the bench was cheap.** "Buy a great man at a
  discount and play him less" was a real play and is not available.

**THAT IS THE WHOLE LIST, AND THE FIRST VERSION OF IT HAD A SECOND ENTRY THAT
WAS WRONG.** It said the 6TH slot was the flex, so going big or small went with
it, and then in its own next sentence that `SLOT_ELIGIBILITY` keeps a roster's
shape a choice. Both halves cannot be true. Reported by a player, in five
words: you can still go big or small based on your starting 5.

**They are right, and neither half was.** See the next section for what was
actually stopping the game from saying so.

#### Every man in this data had ONE position, so the eligibility table decided nothing

```
node hoops/build/build-players.mjs --eligibility
node hoops/build/check-fetch.mjs                 the derivation's own claims
```

`SLOT_ELIGIBILITY` overlaps on purpose (a G at either guard spot, an FC at the
three, the four or the five) and **none of it could ever fire**: 16,056 of the
16,057 rows the fetch produced carried a single position out of PG, SG, SF, PF
and C. No G, no GF, no FC anywhere, and one row that was not one of the five,
Adam Keefe's 1998, listed F. One position a man, one slot a position. So every
roster the game could draft was one of each, `POSITION_MAX` could never bind,
and `slotForPlayer`'s walk down the open slots had one answer by construction.
Measured over 750 drafts with two bots deliberately stacking one end: **one
centre-eligible man, every time, in all 750**.

**IT IS NOT A SCRAPE BUG.** `positions()` in `fetch-nba.mjs` splits a
hyphenated position and `check-fetch.mjs` proves it on `PF-SF`. Today
Basketball-Reference states one position per season row, so that is what
arrived, and re-running the fetch would not change it.

**WHAT THE SOURCE DOES SAY, OVER MORE THAN ONE ROW**, is the same man at two
positions in two seasons. Kevin Garnett is an SF in 1997 and a PF in 1998, and
that is the source's own statement about Kevin Garnett. So `deriveEligibility`
in `build-players.mjs` reads a season's eligibility off the positions this
player was listed at in **the season before it, the season itself, and the
season after**. **22.0% of rows** play more than one.

**PLUS ONE AND MINUS ONE, AND THE WINDOW IS THE WHOLE OF THE JUDGEMENT.** It is
the tightest claim the data supports: the source put him at both within a year.
The three windows give 22.0%, 31.3% and 37.2%, and what the wider two buy is
mostly a career ARC, which is a different and false claim: over five decades a
guard becomes a forward, and a wide window lets 1974 him play where 1986 him
played.

**ADJACENT ON THE FLOOR, NEVER ACROSS THE COURT.** A point guard listed at
centre two seasons later is an artefact rather than a swingman, and 64 rows
carry one. A position may only pick up its neighbours.

**IT READS THE ROWS THAT SHIP**, which is why it runs after the playing-time
floor. That is deliberate rather than convenient: it is what lets the same
function be applied to a `players.json` built before it existed and give the
identical answer, instead of the build and the backfill quietly disagreeing
about a season only one of them can see. It reads `pp` and never `ep`, so it is
idempotent, which matters because the backfill writes over a file already in
the tree.

**The backfill is a MODE OF THE BUILDER and not a script of its own**, because
Basketball-Reference is blocked from the dev sandbox (the same split the
register build records) so the committed artefact has to be brought forward in
place. A one-off script would be a second copy of the rule, and the way that
fails is the next fetch quietly shipping single positions again.

##### What it bought, measured

**25 distinct roster shapes** over 400 best-available drafts, against exactly
one before. Two centres and no power forward 34 times, two small forwards 31,
two shooting guards 21, two point guards 9. A bot chasing bigs averages 2.50 of
them and reaches 3.

**`POSITION_MAX` binds rather than decorating**: it refused 18 signings across
150 drafts by the bot chasing guards, 7 for the bot chasing bigs, and **no
shape in 400 drafts holds three of anything**. Nothing stranded in 600 drafts.

**The cost is 2.7 wins of the gap, and it is recorded rather than compensated.**

| | before | after |
|---|---|---|
| greedy wins, median | 44.0 | **46.0** |
| greedy playoffs | 61.3% | 66.8% |
| ceiling wins | 60.9 | 60.2 |
| ceiling title | 13.1% | 11.6% |
| **the gap** | **16.9** | **14.2** |

A thoughtless draft got better because the slot list used to punish it: greedy
took the best man and stranded itself, and now it strands less. The ceiling
barely moved, because a knapsack over the whole board already had the good men.
All four TARGETS stay inside their bands and the gap is still more than double
the six wins that was the alarm when price was a function of value. **Do not
tune anything to win those 2.7 back**: the eligibility is truthful and the
bands are what the numbers are held to.

**WHAT VARIES IS ALSO THE MAN.** Your four and your five can be two men who own
the glass, or your five can be a shooter who never rebounds, whatever the
position codes say. That is why the two systems naming those shapes ask what
the five men DO, and why neither went back to a position test when one became
available again.

#### Two of the fourteen systems were dead, and one of them the roster change killed

```
node hoops/check-badges.mjs    the last two sections
```

`detectSystem` names a roster's identity, and two entries tested the position
CODE, which by the section above is the one thing a drafted roster cannot vary:

| | what it asked | at six men | at five |
|---|---|---|---|
| Twin Towers | two men ELIGIBLE AT CENTRE, 8+ rebounds | **175 of 800** | **0 of 800** |
| The Death Lineup | a roster holding no man whose position is C | 0 | 0 |

**Twin Towers is the one the five man change killed**, and measured either side
of it rather than argued: the sixth slot took anybody, so a second centre was
signable, and a starting five has one centre slot. **The Death Lineup had never
once been named**, at either size, because there has always been a centre slot.
Its own comment argues at length that a true centre should be judged by
position and not by rebound count, cites Draymond Green at 9.5 a night, and
then wrote the test that excludes every roster there is.

Both are asked of what the five men DO now. Twin Towers wants **two men
rebounding nine or better** plus somebody protecting the rim, which lands on
18% of best-available drafts, 27% of drafts chasing rebounds and none at all of
a careless one. The Death Lineup wants **a best rebounder under 10.5**, which
is above the man it is named for, plus the spacing, the switching and the
threes it already asked for.

**Twin Towers also moved ABOVE Pick and Roll.** A roster with two men owning
the glass nearly always also holds a guard who passes and a big who scores, so
under the looser rung the more distinctive shape is named on nothing. They
carry the same bonus, so the move costs no rating and changes only the word.

**What the whole block does now**, over the same 1,200 drafts six ways, before
against after: Twin Towers **0 to 159**, the Death Lineup **0 to 9**, Moreyball
4 to 23, Motion 3 to 21, Seven Seconds 7 to 8, Pace and Space 19 to 24, Too
Many Mouths 0 to 2, and rosters with no identity at all **436 to 330**. Pick
and Roll went 202 to 158, which is Twin Towers taking back the rosters it was
being shadowed on and is the whole reason for the move.

**Nothing could report any of this**, which is why it took a player: every
roster was legal, every label was a real label, every rating was right, and a
system that fires on nothing throws nothing. hoops has had a reachability guard
for BADGES since its first catalog asked for three things the game cannot
produce, and had none for systems. It has one now, in `check-badges.mjs`,
sharing the runs the badge sweep already plays.

**And `coachReport` compared a key no system has.** `archetype.key ===
'hero_ball'` is the test for printing "Leans hard on <name>", and the key it
means is `iso`, which is the second most common label a drafted roster gets. So
that weakness had never printed once. An undefined key compares false rather
than throwing, which is the `out.spendLeft` class one level up, and the guard
beside the reachability one now asserts that every key a caller names is a key
a system has.

#### A TEAM TOTAL MOVES WITH THE ROSTER AND A PER-PLAYER NUMBER DOES NOT

`FIT`'s four team totals were re-measured when the roster went to five.
`SYSTEMS` has team totals of its own, written as literals inside the detect
functions, and **not one of them was**. Measured over 960 drafts eight ways at
each roster size, the share of rosters clearing each shipped threshold:

| | at six | at five | now |
|---|---|---|---|
| `MODERN_TPA` 18.0 | 20.0% | **8.6%** | 15.0 |
| Death Lineup steals 5.5 | 57.4% | **34.4%** | `SWITCH_STEALS` 4.7 |
| Twin Towers rebounds 38 | 15.0% | **0.7%** | 32 |
| Bully Ball rebounds 36 | 18.9% | **2.5%** | 31 |
| Motion assists 22 | 26.7% | **5.9%** | 18 |
| Grit and Grind `dws` 13 | 38.6% | **22.1%** | 11 |
| Too Many Mouths, budget + 18 | 0.0% | 0.0% | budget + 8 |
| *the second best rebounder, 8* | *24.8%* | *23.9%* | *unchanged* |

**The last row is the control and it is why this is a rule rather than a list.**
It is a PER-PERSON number, and it did not move. Everything above it is a sum
over the roster, and all of it did. `MODERN_SHOOTER_TPA`, `RIM_ANCHOR`, every
`paceAdjust` on one man and every ratio (`P.ast / P.shots`, Grit's defensive
share, Iso's shot share) are per-person or scale free and were correctly left
alone.

**Each new value is where the old one SAT**, at the same percentile of the five
man distribution, rather than the old one times five sixths. `MODERN_TPA`
measured 14.7 and ships at 15.0.

**Too Many Mouths has never fired at either size**, and that is not a rounding
error: at +18 the gate was 90 shots against a six man maximum of 89.9, and 84
against a five man maximum of 77.4. It is checked FIRST and overrides
everything, so the roster its own comment exists to catch (five men who all had
the ball, coming back labelled Showtime) was never caught. **+8** is the top of
what a five man draft reaches: team shots run p99 72.0 and max 77.4.

##### And the real-club fixtures were still six men long

`verify.mjs` hands `rosterFit` a dozen actual NBA lineups and asserts the model
calls each one what a fan would call it. Each is written as **PG, SG, SF, PF,
C, sixth man**, because the game drafted six when they were written, and every
one of them went on handing six men to a five man model.

**It is a quiet way to be wrong, and it stayed quiet because the per-player
tests do not care.** A system reading one man's assists, one man's points or
one man's spacing gets the same answer from five men as from six, so most of
the fixtures went on passing. Every TEAM TOTAL was a sixth too big.

**It surfaced the moment the totals above were re-anchored**, as the 1987
Lakers, the 1989 Pistons and the 2001 Lakers all coming back **Too Many
Mouths**: six men's shots against a five man budget. The sixth id is sliced off
by `E.SLOTS.length` now rather than deleted, so the fixture follows the roster
instead of having to be remembered.

##### A per-game average answers "is he a centre" with his rotation

The rewritten Death Lineup then claimed the **2016 Warriors**, which is the one
roster it must never claim: the unit it is named after is the one Andrew Bogut
is NOT in, and Bogut is the centre on that starting five.

**He rebounds 7.3 a game and 12.7 per 36**, because he played 20.7 minutes. A
per-game bar read him as no centre at all. So that one test is **per 36
minutes**, and it is the only reading in the file that is: everything else here
is per game because `FIT`'s constants were measured that way and the totals
have to agree with them. This is not a total. It asks whether one MAN is a
centre, and the honest way to ask that is at a rate his minutes cannot move.
**11.5 is the middle of a real gap**: Draymond Green, the man the system is
named for, reads 10.3.

This is the box score's own lesson arriving at a threshold. That column printed
`mp`, a man's minutes in a ten man rotation, on a screen where five men cover
all 240.

#### The prose guard read the markup and not the game

**The five man change shipped with eleven player-facing "six" strings still on
the page** and a brand new guard that did not see one of them: the front page
door ("Six signed, 82 still to play"), the daily's dare in both places it is
written, the share text ("Can you build a better six?"), the empty profile, the
bracket and the box score ("Your six"), the draft screen's no-identity line,
the results screen's best-legal-six, and two hardcoded `of 6 signed`.

**The guard stripped `<script>` whole**, on the correct argument that a code
comment here is prose and is allowed to say what the roster used to be. But
`hoops/index.html` is a one file game: **every sentence the game prints lives
in that block.** So it read the markup and the meta description, found the cap
claims and the one count in the folded card, and passed.

**Its coverage clause did not save it**, because it counted both pages together
and the other page yields claims. It is per page now.

**The fourth wrong extractor in this repo, and the fix is not to write a fifth.**
Telling a comment from a string needs a character walk, and telling a regex
literal from a division needs one too: `/[&<>"']/g` is a real line in this page,
which is the exact literal that desynced `check-copy.mjs` once already, and a
reader lost there is lost for the rest of the file, which is where the share
text and the front page door happen to live. So `scripts/check-copy.mjs` now
**exports** `scriptBlocks`, `stripComments` and `stringLiterals`, and hoops
reads through them. Adding hoops to that script's `GUARDED` list is a different
job and still has to wait until the game has been read against its English
rules.

**And the extractor has to prove it read the script**, because the way it failed
was by reading a page and finding nothing in it. Two probe sentences that exist
only inside the script block, one of them past that regex literal. Reintroduced,
the strip fails both probes and the restored "six spins" fails the count.

**`YOUR_LOT` and `DAILY_DARE` exist because two of those eleven were the same
sentence twice.** They sit BELOW the boot check and not beside `NUMWORD`, which
is where they were written first: they read `E.SLOTS`, and the whole point of
that check is that a blocked or stale `engine.js` is met with a reload rather
than a crash. Evaluated above it, a missing engine is a TypeError on line one
and the page is blank instead of self-healing.

**The minutes column is arithmetic now.** Five men over 240 player minutes is
**48 each**. `MINUTES_SHARE`, `minutesShare`, `BOX.MIN_SD` and `BOX.MIN_FLOOR`
are deleted rather than left computing a result that cannot vary: run through
the old code, five men against a cap of 48 pin every one of them at the cap
anyway, so the dice were being rolled for nothing. `apportionCapped` survives
with no caller, which is the one piece of this worth revisiting.

**A WEAKEST STARTER replaced the sixth man on the coach report**, because it is
the observation five men make that six could not: there is no bench, so the man
at the bottom is on the floor as long as the best one. Measured over 150 drafts
each of three strategies, the weakest man runs median 1.7 / p90 3.6 greedy, 1.4
/ 2.2 value, 0.2 / 0.8 cheapest. `WEAK_LINK` ships at **3.5 and 0.8**; its first
draft carried 4.6 and 1.4, which is a strength a greedy draft reaches on under
one run in twenty and a weakness it collects on half of them, so **two dead
lines rather than two verdicts**.

#### NUMWORD is the one place a roster count becomes an English word

"Sign 5 players" is not how anybody says it, so this page wrote "six" out by
hand wherever it came up, and every one of those became a page describing a
game it was not running. That is this repo's oldest rule (when a number is in
copy, either interpolate it or write the sentence without it) meeting the one
case where **interpolating a digit is worse than the problem**. The answer is to
interpolate the WORD.

**The share card's tail is derived from the roster too.** Every y between the
two rules was a constant written for six rows, which in the football game
printed a seventh row through the closing rule and here leaves **92px of empty
stock** on every card anybody posts. Checked from the other end: the arithmetic
reproduces the six man card byte for byte at n=6.

#### A number a player reads, on two pages that cannot interpolate

**It went wrong DURING this change.** The cap was being swept, a provisional
$105M went into the rules page and the meta description before the sweep had
finished, and **$120M shipped**. Nothing threw: both pages rendered perfectly
and promised a cap the game does not charge, which is the guide that lies,
found by a player.

Hoops is on no guarded list, so `verify.mjs` carries the check itself: every
`$NNNM cap` a reader can see equals `CAP_MUSD`, and every roster count written
as a WORD is the roster's own word. Script, style and comments come out first,
because a code comment here is allowed to say what the cap used to be and the
engine's own note lists every value it has ever had.

**Two nouns are deliberately not on the list and the first draft failed on
both.** "times" and "players" each mean the roster in one sentence and
something else in another: the re-spin ladder is charged "three times" and no
club may give up more than "two players". A reader that claimed those reports
two correct sentences as defects. What is left is `spins`, `men` and
`starters`. Both halves were proved by reintroducing a stale $105M and a stale
"Six spins".

#### FIVE GUARDS WERE READING A NUMBER RATHER THAN A CLAIM

Each would have gone quiet or reported the wrong thing rather than going red:

- **The palette check named all eight custom properties in one regex**, so
  removing one matched nothing and it reported a page with **no position
  colours at all**. It reads `POS_COL` and resolves through every `:root` block
  now. Its own first fix read only the FIRST `:root`, which on this page is the
  fonts block hundreds of lines above the colours.
- **`check-board` and `check-bracket` signed six on a five man game**, so the
  last press landed on a screen that was no longer the draft and the timeout
  reported whatever that screen happened to be.
- **`check-live` built its fixture from a written-out slot list** a slot longer
  than the game drafts.
- **`verify`'s era sweep asserted 36 readings**, which is six eras times a
  roster size.

**AND ONE OF THOSE FIXES BROKE ITSELF IN THE SHAPE THIS FILE KEEPS WARNING
ABOUT.** `check-board`'s wait was left reading `(want)` while its body asked
for `a.want`, so every poll threw a ReferenceError, **the function's own
`catch` answered false**, and the wait timed out reporting a draft that had
stalled. Nothing had stalled: the page had signed the man, drawn the next board
and taken it out of `pending`. The stall dump prints `signed`, `draw` and
`phase` now, which are the three things the wait actually asks for, so the next
time a reader cannot read it says so instead of blaming the page.

### Run the floor: a roster has a pace, and the coach picks a game plan

```
node hoops/verify.mjs          the plan block: walked equals instant, the May asymmetry, tempo off
node hoops/check-badges.mjs    all 22 systems reached, and the Style of play shelf
```

Asked for by the owner: make Classic different from the other draft sites, and
lean on the name. So a roster has a PACE, and the season is played at it.

**THE FIRST VERSION DID NOT MOVE AND IS WORTH NOT REBUILDING.** A tempo averaged
over five men barely varies, because a board is one club-season and the five
slots are one of each position: every roster came out within a couple of
possessions of 99. What varies is what the five DO, so the mechanic is a choice
between three **game plans** (`PLANS` in engine.js), each paying by how well the
roster fits it.

| plan | pays for | costs |
|---|---|---|
| Run | a guard who pushes (assists and steals per 36), hawks, and the glass; a little for the clubs' own pace | a little defense; pays less in May |
| Balanced | nothing | nothing |
| Half court | a rim anchor, a post scorer, defensive win shares, the glass | a little offense; pays MORE in May |

`paceFits(roster)` answers both fits from 0 to 1, off per-man means so they move
from the first signing rather than waiting for a team total to fill up.
`planEffect` turns a fit into points per 100 around a break-even (`RUN_EVEN` 0.60,
`GRIND_EVEN` 0.57), so a roster that does not fit a plan loses by running it.
`bestPlan` is the coach's pick: the best regular season plus half the playoff
edge. `run.plan` overrides it from the season screen (`#p-plans`), which prints
what each plan is worth in wins before the tip.

**MAY IS SLOWER, AND THAT IS THE DECISION.** In the playoffs the run edge is
multiplied by `PO_RUN` 0.45, the half court defense by `PO_GRIND` 1.6, and every
game is 4 possessions slower (`PO_SLOW`). So a run roster wins more games and
fewer rings than its record says, which is the argument fans have had about the
Seven Seconds Suns for twenty years.

**A club's tempo is a proxy and it is wrong about one team.** There is no pace
column in the data, so `buildTempo` reads each club-season's shots less 0.28 of
its rebounds per minute, relative to that season's mean. It is only 10% of the
run fit. **It reads the 1996 Bulls as fast**, because they took and missed a lot
of shots; that is the proxy's known miss and why it carries so little weight.

**`rosterRatings` is the one pipeline and everything reads it**: `playRun`,
`advanceGame`, `playSeason`, `projectSeason`, and the playoff runner through its
`po` ratings and pace. `gameMeans`, `poCreate` and `generatePlayoffs` take a pace
now. **`{tempo:false}` is the old model exactly**, and Fix History passes it,
because that mode's odds are a daily puzzle already filed on a board and a real
team does not choose a plan.

**What it costs, measured at 200 drafts a bot**: taking the best man every time
with the coach's plan wins 45 median; forcing Run on that same roster wins 43;
drafting for the run fit moves it from 0.62 to 0.70 and wins 45 back. Drafting
for the half court fit has the best playoff edge of any bot. All four TARGETS
stay in band: ceiling 61.5 wins, title 15.2%, beats 72 at 5.8%, greedy 46.

**`verify` asks the walked season and the instant one with a plan SET, and the
plan it sets is the one the coach would NOT pick.** The first draft asked for
Run on a roster whose own pick was Run, so removing the plan from `advanceGame`
still passed. Proved by mutation: that removal, `PO_RUN` at 1, and forcing tempo
on for Fix History each fail their own claim.

#### Twenty-two systems, and a style line on top of them

Eight new systems, each named for a real team and held to it in `verify`'s
fixtures: Seven Seconds, Run TMC (1991 Warriors), Sonic Boom (1996 Sonics), Run
and Gun (1991 Nuggets), Lob City (2014 Clippers), Big Three (2008 Celtics), Point
Forward, and Heliocentric (2020 Mavericks, 2017 Rockets). **The ORDER in
`SYSTEMS` is the first match**, so a new one steals rosters from whatever sits
below it: the 1983 Sixers came back Sonic Boom and the 1991 Warriors Heliocentric
until the order and two thresholds moved. Heliocentric allows one other 19 point
scorer, and Sonic Boom's steals are deflated by the clubs' own pace
(`clubPaceFactor`), because a fast era steals more by being fast.

`rosterStyle` names three axes on top: Big or Small (rebounds per man), Fast or
Slow (run fit against half court fit), Shooting or No range (spacing). The fit
card on the draft screen shows them as chips and the results screen as tags, so
big and fast, small and slow, and every mix are nameable whatever the system is.
**The Style of play shelf** (`sty.*`, `pl.*` feats) lights a Run title, a Half
court title, a 55 win season on each plan, and three style combinations.

### The last of five picks was made by the game, on a quarter to a half of runs

```
node hoops/verify.mjs            the fee model, the free re-spin and the margin
node hoops/check-draft.mjs       the warning and the button, in a real browser
```

**THE RESERVE FLOOR PROMISES A LEGAL ROSTER AND NEVER A CHOICE.**
`assignedFloors` earmarks the CHEAPEST legal man for every open slot, so a
drafter who spends down to it reaches the last slot able to afford precisely
that man and nobody else. Measured over 500 drafts a bot, through the real
`run.js`:

| pick | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| signable men, best available | 11.5 | 9.7 | 7.2 | 4.1 | **1.8** |
| forced to one man | 0% | 0% | 0.4% | 10.6% | **47.6%** |
| forced AND no re-spin | 0% | 0% | 0.4% | 7.6% | **24.8%** |
| forced AND no re-spin, spending the cap | 0% | 0% | 0.4% | 10.6% | **43.6%** |
| forced AND no re-spin, hoarding money | 0% | 0% | 0% | 0% | **0%** |

**The shape of that is backwards.** The bot that hoards money and drafts badly
was never trapped once; the one that spends the cap, which is the good way to
draft and what every other number here rewards, was trapped on 43.6% of runs.
One fifth of the decisions in the mode, removed, from the player who played it
best.

**THE RE-SPIN IS THE VALVE AND IT SHUT AT THE SAME MOMENT.** Its fee is charged
against a budget that is by then at the floor, so `canRespin` refused it: at the
last slot a cap-spender could re-spin on 42% of runs. The escape hatch closed
exactly when it was needed.

**It is not a balance bug, and saying so is the point.** Trapped runs rate
**57.7** against 55.9 for free ones, because four stars plus a scrub really does
beat five good players. The trade is coherent. What is wrong is that the forced
man averages **0.98 win shares** against 3.00, and on 96 of 101 trapped boards a
man **+4.77 win shares better** sat greyed out on the same board, costing $18.5M
more. That reads as the game malfunctioning, not as a consequence.

#### The fee is no longer a ladder sum, and that is the trap under the fix

**The last slot's re-spin is free.** `respinFeeNow` waives it at `slotsLeft <= 1`.
After it: trapped goes **24.8% to 0.0%** and **43.6% to 0.0%**, and pick-5
re-spin availability is 100% for every bot. All four TARGETS are byte-identical
(60.6, 13.6, 4.4, 46.0), because removing a constraint hands nobody a better
roster on its own.

**`remaining()` RECOMPUTED THE FEES FROM `respinsUsed` EVERY TIME IT WAS
READ.** So a waived fee is charged back the moment anything looks at the budget:
the money vanishes a frame later, the floor says the roster cannot be filled,
and nothing throws. The total is STORED in `respinFeesPaid` now, and a save
written before that field falls back to the ladder, which is exactly what it did
pay because there was no way to get a free one.

**`verify.mjs` was making the same mistake one line at a time.** Its cap-bust
check rebuilt the spend as `roster + E.respinFees(respinsUsed)`, which would
report a false bust on any run that took a free one. It reads
`CAP - R.remaining(run)` now: one source, the run's own budget.

**IT STILL COUNTS AGAINST `MAX_RESPINS`, which is the whole of what stops it
being an exploit.** Free and unlimited is an infinite reroll on the one board
small enough to fish in. Three, each burning the team-season it rejected.

**And `canRespin` stopped simulating.** It used to increment `respinsUsed`, read
the budget and put it back, which worked only while the fee was a function of
that count. Stored, the increment moves nothing and the probe would have said
yes to every re-spin there is. It subtracts the prospective cost instead.

#### Said before the tap, and the threshold is derived rather than picked

`leavesNoChoice` marks a signing that leaves the last slot tight. Measured at the
second to last signing over 900 drafts across five ways of drafting:

| headroom left for the last slot | mean signable | one man only |
|---|---|---|
| under $2M | 1.2 | **82.5%** |
| $2M to $5M | 1.5 | 62.7% |
| $5M to $10M | 1.6 | 57.1% |
| $10M to $20M | 2.2 | 30.0% |
| $20M to $40M | 2.5 | 17.6% |
| $40M and up | 2.7 | 9.8% |

`LAST_SLOT_ROOM_MUSD` is **10**: the first value with real room rather than the
last one that passes, since the band under it runs 57% to 83% and the one over
it is 30% and falling. **The $5M seam is not a coincidence either**: it is the
first rung of the re-spin ladder, so under it the fee itself was unaffordable,
which is why that column reads 82.5% stuck and the next reads 0.0%.

**ASKED ONLY AT THE SECOND TO LAST PICK**, which is where the table was measured.
With three slots open the same number is headroom shared between two of them,
which is a different quantity, and answering it off this table would be reading
it for a question nobody put to it.

**PER TILE, OR ONCE, AND NEVER BOTH.** Measured over 450 second to last boards:
21.9% of signable tiles carry the mark, **51.1% of boards carry none at all**,
and on **23.3% every signable man leaves it tight**. That last case is the
board's own divider rule arriving one line up: a mark on everything marks
nothing, and what it is really saying is a fact about the board rather than
about any man on it. So it is one line above the board there instead.

**`marginAfter` is one source with the price gate.** `canFinishAfter` is now the
margin's own sign, so the two can never disagree about whether a signing is
legal, which they would the first time either was edited alone.

**Amber and fully pressable.** Spending the cap is the good way to draft, so this
line exists to make the cost of it visible rather than to talk anybody out of it.
And the button says **Re-spin (free)**, because `Re-spin ($0M)` reads as a
rendering fault rather than as the one thing that screen has to offer.

#### What the guards got wrong, and it was the same lesson twice

**A GUARD THAT DIES ON A STACK TRACE HAS NOT REPORTED ANYTHING.** `respin` throws
on a refusal, and the fixture for the free re-spin is a state where it used to be
refused, so reintroducing the charge killed the whole suite on a line number
rather than naming the trap it exists for. It is taken through a guard now, and
reintroduced it reads `and is actually offered there (would leave too little to
fill your roster)`, which is the defect in the reader's own words.

**The browser walk pressed a board that had not landed.** `pending` sits on the
PARENT, so `#opts .ptile:not(.pending)` matches every tile the moment it exists,
mid-spin included, and a scripted click ignores the `pointer-events:none` that is
the only other thing holding it shut. The signing was dropped, and what the walk
then reported was the re-spin button being dead. That selector is written up
under `check-live` as load-bearing; this is the third time it has been.

**And its restart pressed a button that was not there.** The front door says
Resume once a run is saved, so a fresh run needs the run in hand dropped first.
Left alone the retry silently did nothing and the walk reported one attempt.

**It retries up to eight drafts**, because half of second to last boards
correctly carry no warning: one draft is a coin toss on whether the thing exists
to be found, which is this file's own note about a check reporting its own seed.
Reintroduced, it searches all eight and says so.

#### What is still open

**Pick 4 can be forced with no re-spin on 7.6% of best-available runs and 10.6%
of cap-spending ones**, and the waiver deliberately does not reach it: the
warning fires at pick 4 about pick 5, so it says nothing about pick 4 itself.
That is a third of what pick 5 was and it is recorded rather than fixed, because
widening the waiver to two slots gives away a good deal more than it buys.

### Three doors, and one of them was already built

| | the wheel | what it is |
|---|---|---|
| the league | season and club both spin | the game |
| One Franchise | the club is held, the year spins | a history exam about one club |
| Decades | both spin inside one era | six men who could have met on the floor |

**Decades needed no engine work at all, and that is the lesson.** `ERAS` has been
in `engine.js` and the era filter has been in `drawable()` since the day `run.js`
was written, and nothing on the page could ever set one. A whole mode, shipped,
exercised by the fixtures, unreachable. Same shape as the football game's Dynasty
leaderboard that rendered perfectly and had no way in: **look for the door before
building the room.**

**A LOCK OF ANY KIND HAS TO REACH THE RESERVE FLOOR.** `cheapestForSlot` reads the
200 cheapest men per position across all 16,057 rows, and in a restricted run not
one of them may be drawable. Left alone the floor promises a $2.2M centre off a
club this run can never spin, the budget reads bigger than it is, and the draft
strands itself at the last slot with no legal player at any price. **Nothing
throws**: `sign()` refuses and the player is left on a board of greyed names. One
filter answers both locks (`lockedPool`), so neither can be the one somebody
forgets.

What that turned up is worth not re-deriving:

- **The club lock moves the floor and the era lock does not.** 36 of 180 club
  readings differ from the league's; **0 of 36 era readings do**, because a decade
  holds 1,252 to 3,696 rows and 34 to 121 men priced at the minimum, at every
  position, so the six cheapest legal bodies cost the same 6 x $2.0M either way.
  `verify.mjs` asserts the zero rather than a difference that is not there.
- **It stops being defensive the moment the two COMPOSE.** The Lakers in the
  eighties floor at $19.9M against the league's $12.0M.
- The club sweep also asserts the locked floor is never UNDER the league's, and
  that the two pools actually come apart. A sweep that only asserted thirty drafts
  finish would pass on the unlocked floor and report green on the exact defect it
  was written for. Same lesson as `check-fullteam`'s replaced reading.

**One Franchise kills chemistry as a decision and that is accepted, not missed.**
Everybody on a locked roster shares the club, so the franchise link fires on every
pair and the bonus sits at **+2.30 of a possible +2.50** whatever gets drafted,
measured over 360 runs across all thirty clubs. Best-available finishes **46.8
wins against 42.0** off the whole league. Decades does not have this: chemistry
there runs +0.67 to +1.13 and still has to be gone looking for. The how-to says so
on the page rather than leaving somebody to wonder why their Celtics team rates
high.

**So every mode keeps its own best.** `c.byClub` and `c.byEra`, never mixed into
`bestWins`. The spread between decades is bigger than the One Franchise gap:
best-available takes the seventies to 49.6 wins and the aughts to 40.7, which is
nine wins between two modes wearing the same word, and one shared record would
retire the league best to whoever picked the shallowest priced era.

**The span in the constant is not the span in the file.** `ERAS.seventies` is
`[1970, 1979]` and the data starts in 1974. `R.eraSeasons` reads the same list
`drawable()` filters, which is the only honest span; the same rule put
`R.clubSeasons` behind the club picker rather than the founding year, which would
have promised twenty-eight seasons of Celtics that do not exist.

**`E.team()` cannot be an existence check and one was written against it.** Its
last fallback returns `{ name: code }`, so `team('NOPE').name` is the truthy
string `'NOPE'` and the guard passed for every string there is. An unknown club
would have silently emptied the wheel. `hasTeam()` is the gate.

### The draft board lost 1,289px on every spin

Measured at 390x844 and 360x740. `drawInto` emptied `#tabs` and `#opts` before the
reels started, so the page collapsed to the height of a reel and grew back a beat
later: **the court under the board jumped 1,554px up the screen and back down, six
times a run** plus every re-spin. Nothing threw and no check in the repo could see
it. It was most of what "the draft does not feel clean" was.

**The height is a property of the board and the board is already decided.**
`run.js` resolves the draw before a single frame animates, so the real tiles go up
at once and the page settles before anything moves. What is held back is the
READING of them, which is what the reel is for: `visibility:hidden` over a shimmer,
because it is the one that keeps the layout box exactly. A skeleton of fixed-height
placeholders was tried first and **cannot** be exact, since a tile with an award row
is 26px taller than one without. Court movement is 84px now, and what is left is
the honest difference between two boards.

Three things that were repeating the answer rather than adding to it, all found by
reading one screen at 390px:

- **"2011 Spurs" on every tile.** A board is one team-season, so that line said the
  same words as the two reels directly above it, once per player. What is there
  instead is the chemistry a signing would ADD, named rather than counted.
- **The club note under the reels, under a lock.** `teamNote` is the same founding
  year and title list six picks running. In a locked run what changes is the
  SEASON, so what is said is whether they won it.
- **"SIGNABLE" alone over ten signable players.** A divider only earns its line when
  there is something on the other side of it.

### The draft on a desktop is The Perfect Season's draft, deliberately

```
node hoops/check-draft.mjs        the shape, at seven widths
```

The two games are the same skeleton and a player who knows one should not have
to learn the other's shape, so the wide draft screen is football's: **picture
left, wheel right, board full width underneath**, at football's own 920px
threshold. Asked for by a player with the two screens side by side.

**What it replaced was a 298px column on a 1512px monitor.** The page shipped
at the 660px wrap every other screen here uses, with the court taking a fixed
316px rail out of it, so the thing the whole screen is for was drawn NARROWER
than it is on a phone: the position tabs overflowed and scrolled, and the sort
row wrapped onto two lines. That is football's own "phone screenshot pasted
into the middle of a desktop" with a rail taking half of what was left. The
board is three columns of 330px now and the page went **2,280px to 1,221px**.

**What it does NOT copy is football's 1200 to 1259 fallback to one column.**
That exists because the ad rails appear at 1200 and take 200 a side, leaving
800, and this game carries no ad tag at all.

**Nothing is sticky any more, and that is the one thing given up.** The court
was a rail that held its place while the board scrolled, which is genuinely
nice and is what football refuses in as many words, because a sticky block
whose own height changes reshapes the page under the finger. A board a third as
tall keeps the court on screen far longer anyway.

**The court is flatter here (1/0.72) and that is not a style choice.** At
1/0.94 it draws 492x462 across half of 1040, against a wheel block of about 140
beside it: a picture three times the height of the thing it is reference for,
with the hole under the reels to prove it. **It cannot go as flat as football's
field**, which is about 1.84 wide: a half court is roughly square in life, and
squashing it past 1.4 stops depicting the sport.

**THE COURT COMES FIRST ON A PHONE TOO**, asked for by the owner: your lineup is
the top of the screen on every width. It used to come last on a phone, on the
argument that it pushed the board a screen down, and that was the wrong trade:
the court is what you look back at between signings. The wide layout places it
by column and row, so the markup order changes nothing there. **The pips follow
the court**: they hang under the pinned bar only once the court has scrolled up
behind it (`pipsFollowCourt`, off the court's own rectangle), because at the top
they would be the same five slots drawn twice. They are out of the flow rather
than collapsed, since a sticky bar that grows reshapes the page under the
finger. `check-draft.mjs` section 3 asserts both, and each half was proved by
removing it.

**The pinned bar's club tint is a layer over its own opaque gradient.** Written
alone it started at half alpha, so the reels and tiles scrolling under the
sticky bar read straight through the budget.

#### Every way this rots is silent, and two of them already had

**`.active`, NOT `.on`.** The wrap gets its width from
`.wrap:has(#s-draft.active)`, and the rule lifted from football was written
`.on`, which is that game's class and has never been this one's. It matched
nothing: no error, no warning, a draft that stayed 660px wide, which is
indistinguishable from the defect the block exists to fix.

**A MEDIA QUERY ADDS NO SPECIFICITY**, and the wide block sits about eleven
hundred lines above the base rules it argues with, so at equal weight the later
one wins. `.sortbar{margin-top:0}` lost that way and kept a 40px hole between
two controls that belong together.

**And the same trap had killed a whole block for the life of the file.**
`@media(max-width:839px)` has always claimed to draw a shorter court on a
phone, because it is reference and the board is the decision. It never once
applied: `.court` and `.spot` are declared three hundred lines below it, so
every phone that ever loaded this game drew the base 1/0.94 court at
**358x337** against the 358x258 the file promised, with 74px spots rather than
64. Nothing threw and nothing looked broken. Scoping the rules to `.dside`
raises them over the base and is also the honest reach, since the sentence is
about the court you draft next to; the home hero and the results screen keep
1/0.94, which is what they have always had.

**The wrapper is the one markup change and it is guarded from the other side.**
`.dtop` groups the wheel and its notes so the top row is two columns rather
than six grid placements, two of which are empty most of the draft and would
each still cost a row gap. A wrapper is exactly the kind of change that quietly
costs a margin, so section 4 measures ONE page twice, with `.dtop` flat and
not: `display:contents` is exactly "as if the wrapper were not there", which is
a controlled comparison with no seed in it. Two random drafts are two different
boards, so comparing screenshots across runs measures the players.

All three cascade defects were reintroduced one at a time, and each breaks
exactly one assertion.

### It did not say what it was

Driven beside The Perfect Season at 390px, the difference on a first visit is not a
feature: the NFL game opens with a card headed FIRST TIME HERE, three numbered
steps, a stated goal and an arrow reading START HERE. This one opened with a wheel.
It has the same guide now, once per browser, on the front page only.

**It points at the button and leaves it live.** The scrim stops at the top of the
dock, so the way out of the guide is the thing the guide is telling you to do.
Anchored to the dock rather than measured against the page, because `--dock` is
already measured on every render and the target is pinned.

Two defects the harness caught that looking would not have:

- `inset:0` covers the dock whatever the scrim does, so with pointer events on the
  wrapper **the Start button was not the element at its own centre**. A screenshot
  shows an arrow over a button and nothing wrong; `elementFromPoint` says otherwise.
- Centred at `62vh`, the panel's own text scrolled inside itself at both widths. **A
  guide whose explanation is below its own fold is worse than a terser one.**

**Every number in it is read out of the constants and the data.** The cap has been
swept twice in this game's short life. The first draft of step two said a star costs
half the cap, which is false: the top price in 16,057 rows is Bob McAdoo's 1975 at
**$60.0M against $126M**, and nobody is over half. It prints the real dearest man.

### A box score is a DECOMPOSITION of the scoreline, never a second model

You draft Jordan's 1996 and until this shipped nothing anywhere told you what
he did in any of the 82. The playoff games were the worst of it: `playoffSeries`
has always returned its individual games and nothing ever drew one, so a run
that ended 3-4 in the Finals gave you the series score and not one thing that
happened in it.

Every game opens now: quarters for both sides, and a box score for your six.

**The load-bearing decision is that `resolveGame` still settles the score and
these lines are apportioned to hit it exactly.** A possession sim that DECIDED
the score would replace the win-share model fitted to twenty-two real NBA
records, and every TARGETS band would need re-solving. And two models of one
game disagree: verify already caught the animated season and the instant season
producing different records off one seed. So nothing downstream reads any of
this, and **the one property it must have is that it adds up**. Six identities
are asserted over a real season: the points column IS the scoreline, a man's
field goals and free throws produce his points, nobody makes more than he takes,
the minutes fill the game, the quarters are the scoreline, and a game that went
to overtime was level at the end of regulation.

Three things the measurement found that reasoning did not:

- **The league shot 59%.** Two scale-ups were folded into one term. Six men
  covering 240 minutes absorb a whole bench's shots, which is real extra WORK
  and passes into attempts in full; a hot night is mostly efficiency and only
  partly volume. Separated, the league shoots 46.3% against a real 46%.
- **The minutes column added to 153 of 240**, because it printed `mp`, which is
  his minutes in a ten man rotation. A box score saying six men played two
  thirds of the game and scored all of the points is arguing with itself.
- **`PTS_SD_K` is not what makes this concentrated.** Swept 1.45 to 0.55, the
  leading scorer's share moved 34.9% to 32.2% and the median game high moved 41
  to 38. **The concentration is the premise and no constant fixes it**: the dial
  is the roster size, and that is the game. It is set for the TAIL alone.

**`apportionCapped` was wrong on 73% of inputs** and the minutes needed it. It
pinned the over-cap men and the under-floor men in the same pass, which throws
away the redistribution between them: weights `[1,1,1,32,27,26]` over 240 pinned
three at the floor and three at the ceiling, arrived at 198, and had nothing
unpinned left to give the other 42 to. **One side per pass.**

**No box score for the opponent, deliberately.** The schedule knows which real
club you played and the sim never used their players: an opponent here is a net
rating. Five invented lines for five real men, printed as this game's own
record, is the one thing on that screen that would not be true.

**Each game draws off the run's seed and its own address**, never a shared
stream, so opening game 41 twice shows the same 41 points, a reload does not
rewrite history, and drawing a SCREEN never moves the season somebody comes back
to.

**A box score nobody opens is a box score nobody has**, so the run names its own
best night on the results screen and links to it. Asserted against a brute force
sweep rather than against itself, because an off-by-one would name the second
best game and nothing would look wrong.

### A field the page reads off an outcome has to be a field outcomes have

`out.spendLeft` was read on the results screen and `outcomeOf` has never set it.
`undefined > 15` is false, so on **every run this game has ever played** the branch
behind it was dead and the cap advice, which is the central lesson of the whole
game, never once appeared: a draft that finished $88M under was told its roster had
no shape instead. Nothing threw, nothing rendered wrong, and no check could see it.

So `verify.mjs` builds a real outcome and asserts **every `out.<field>` in the page
is one of its keys**. The whole class, not the one name, and proved by mutation.
Two things about writing it:

- **Its first draft failed on the COMMENT explaining the fix.** Block comments come
  out before the scan now. Third time an extractor in this repo has read a comment
  as code.
- **The scan asserts it found something.** A regex that matches nothing passes,
  which is `check-numbers`' coverage argument in one line.

Two more on that screen, both found only by looking at it:

- **One fact, three times.** "3 wins short of the play-in" was the gauge's big
  number, the gauge's sentence, and the story line under the record. The gauge is
  how it ENDED; `seasonStory` is the season's SHAPE. They cannot collide now
  because they are never about the same thing.
- **"1404th of 1403 all time".** `nationalRank` INSERTS your roster into the table
  of real team-seasons, so the denominator has to count it. Visible only on a
  deliberately terrible draft; the top end read "1st of 1403" and was wrong by the
  same one without looking like anything.

**Two targets are out of band today and no constant will fix them.** The four
numbers that turn win shares into a record are now FITTED to twenty-two real NBA
records (rms 3.5 wins), so a roster is worth what it was worth in life: rating
all 1403 team-seasons puts the 2012 Bobcats last at 10.5 wins and the 1996 Bulls
first at 73.8. The TARGETS block says all of this at the point of failure, so
read it there rather than trusting this paragraph to stay current.

**Refit, do not nudge.** If the data changes shape, re-run the solve rather than
moving one constant: they trade off against each other, and the reason the
previous set was uniformly 15 wins low is that no single number showed it.

#### Price is what the market pays. Win shares are what the man is worth.

**This paragraph used to say the opposite and was three sentences of stale.** It
recorded that `build-players.mjs` prices off `p.w` alone, that price is
therefore a monotone function of value, that the board holds no bargains, and
that fixing it would be a design change nobody had made. **Every one of those
was true when it was written and the fix has since shipped**, in that file's own
header, which is the dangerous direction for a document to be wrong in: the next
person explains a board they are looking at with a rule the game stopped
playing. Reported by a player asking why sorting by best player is not the same
as sorting by price.

Price comes off a MARKET SCORE built from the counting stats. Value stays win
shares. Real markets pay for POINTS above all and systematically underpay for
efficiency, for rebounding and for defence, which is not a flaw to model around:
it is the most familiar fact about NBA contracts and it is exactly what a fan
brings to a draft.

**So the two disagree on purpose, and the residual IS the game.** Measured over
the shipped 16,057 rows, price and win shares correlate at **0.833**, and on
**18.8%** of random pairs the CHEAPER man is worth more. The 1989 Kings board
is the whole idea in two rows:

| | price | win shares | what the market saw |
|---|---|---|---|
| Kenny Smith | $30.4M | 4.1 | 17.3 points |
| Harold Pressley | $17.6M | **4.8** | 12.3 points, 6.1 rebounds |

What falls out of the real data with nobody choosing it: Rodman 1990, Tyson
Chandler 2012, Horace Grant 1992 and Kevon Looney 2023 are bargains, and Adam
Morrison 2007, Michael Beasley 2013 and Scoot Henderson 2024 are traps.

**The tile says which it is**, and that is the half a reader needs: `BARGAIN`,
`GOING RATE` and `PAYING FOR POINTS` are the deal chip, so the board never asks
somebody to do the arithmetic in their head to find the thing it was built
around. Sort by Best player and the column is ordered by win shares with the
prices deliberately out of order beside it.

### Today's run, and the one mode that gives two people the same question

The other three doors are the same game with the wheel constrained. This one is
the same game with its SEED pinned to the date, so everybody who plays on a
given day gets the same six spins and two records are comparable for the first
time in this game. `run.daily` is the day number and it rides in the run, not in
a page variable beside it: a draft resumed tomorrow and filed against today
would overwrite a result somebody set for a different puzzle.

**The day rolls at Eastern midnight**, which is what every other calendar-day
clock on this site already uses. UTC rolls at 7 or 8pm Eastern, which takes the
puzzle away in the middle of the evening somebody is playing it, and the
visitor's own midnight gives two people in one group chat different puzzles on
the same night, which is the whole thing this mode is for. `easternISO()` asks
`Intl` and **falls back to the local date rather than throwing**: a browser with
no time zone database answers the wrong puzzle, and a browser with no game
answers nothing.

**`dayNumberOf` does its arithmetic in UTC on purpose.** Two local midnights are
23 or 25 hours apart across a clock change, which floors to the wrong day twice
a year and hands two players different puzzles with nothing anywhere throwing.

**The epoch was written as the UTC date and was a day out.** Day 1 read as day 0
for most of its own evening, and only `Math.max(1, ...)` made it look right. A
clamp is a guard against a wrong clock, not a place to keep an off-by-one.

**One a day, and the guard is on the DAY rather than on the count.** Replaying
today is refused by `dailyRecord`, because a second attempt at the same puzzle
is a different game from the one everybody else played. **There is no anti-cheat
beyond that and there should not be**: abandoning a draft mid-run leaves the day
open, so somebody who wants to see the board twice can, and with no server and
no leaderboard the only person they are beating is themselves.

**One day is not a streak.** Every first-time player finished the daily and was
handed a gold "1 DAY" for having played once, which says nothing and devalues
the number on the day it starts meaning something. The door shows it from two,
and only while it is still alive: a count that ended last March is a fact about
March, and printing it beside today's door reads as a claim about right now. It
survives today being UNPLAYED, because a streak breaks on a day missed rather
than on a day not yet played, so yesterday's run is what it stands on.

**The streak mark on the results screen is read off YESTERDAY.** `bestsSet` runs
before `dailyRecord` files today, deliberately and as three separate statements
rather than as fields of one object literal, because otherwise the whole thing
depends on property evaluation order, which is a rule nobody should have to
know. Read after, every mark in that function is a tie rather than a beat.

#### A shared result has to say which game it was

`drawShareCard`'s tagline was the literal `Six NBA seasons, one cap, 82 games.`,
which is false for One Franchise, false for Decades and false for the daily.
**That is the football card's fallthrough arriving a fourth time**: its own
section above records "Classic Mode. Six spins, one roster" surviving three
modes, because a literal has no branch to forget.

`cardTag(r)` derives it, `shareText` puts the mode in the FIRST line (which is
the line a chat app shows as a preview), and `shareDare` gives the daily its own
question, because every other dare asks somebody to go and play a game and this
one asks them to play the SAME six spins, which is the only dare here with one
answer.

**The defence is not a fourth branch, it is that no two modes may share a
tagline.** `verify.mjs` asserts all four are different and that no locked mode
falls through to the league's, so a fifth door cannot inherit the fourth's
words either.

#### The share carries the draft, as squares

A shared result said how the season went and nothing about how it was built,
and the build is the half this game is about. So the text carries a row of
five squares in slot order, one a man, coloured by the verdict his tile wore
on the board: green for a bargain, white for the going rate, red for paying
for points, black for a man under three win shares. Under it is the playoff
path a series at a time (`R1 4-3 · R2 2-4`), with a trophy only for a
champion.

**The squares are the one place emoji are allowed in this game's copy**, and
the reason is the medium: a chat app shows text and nothing else, so a row of
colours is the only picture a shared result can carry. They are data rather
than prose. The card draws the same two things with no emoji at all: the path
under the verdict, and each man's verdict under his price in the chip's own
colours, because an emoji in a canvas is whatever the machine's emoji font is.

**`draftCells()` is the one walk** the share text, the card and the results
screen all read, and every verdict is `dealOf`'s. A second walk would be a
screen and a share that disagree about a man. `verify.mjs` lifts `gridLine`
and `pathLine` out of the page and asserts four different squares, one square
a man, a square for every key `dealOf` can answer (read out of its source, so
a verdict renamed there cannot fall through to black), and a short name for
every round the engine plays. Merging two squares fails it.

**A signing is stamped.** The verdict used to be answered only on the tile
BEFORE the press, so the one decision the draft is built around got no answer
after it. `stampDeal()` puts the verdict over the court for about a second,
off the same `dealOf`, restarted rather than queued so two quick signings show
the second one. It takes no pointer, so a thumb heading for the reels goes
straight through it.

**The results screen shows the row too**, with what it counted, and each count
is one unbreakable piece. Without that a 390px phone left "role player" alone
on a line under a "1".

#### A badge earned in silence is a badge nobody has

`badges.js` computes forty-odd badges off the whole career and the only surface
it had was a tab inside a sheet, so a badge was earned invisibly and found weeks
later by somebody who happened to look. `recordRun` answers with what the run
CHANGED now, and the results screen draws it second, above the playoffs.

**Nothing stores "earned", by design.** Every badge is derived, which is what
makes the cabinet retroactive and impossible to lose, so the only way to know
what a run earned is to ask the same question either side of the write. `before`
is a second `loadCareer()` rather than a copy, because that function JSON-parses
on every call and the two objects are therefore independent.

**It is kept on the run rather than shown once.** It is a receipt and not a
notification: somebody reopening a finished season should still see which badges
that season lit, the same way they still see its record. Recomputed on the
results screen it would answer "nothing new" every time, correctly, because the
career already holds all of them.

**A first run sets no record**, and neither does a first run on a club or in a
decade. It is trivially the best of one, and a screen congratulating somebody
for beating nobody is the unearnable badge in reverse.

#### Every badge is a basketball, and the cabinet is an account's

```
node hoops/check-board.mjs     section 6b, both sides on one page
```

**The ball is the logo's own drawing.** `badgeBall(tier, N)` in the page runs
`build/logo-art.mjs`'s grid rules in a metal: bronze is the logo's orange, silver and
gold are the trophy versions, a ring is the gold one with a glow, and a locked badge is
slate. It is copied into the page rather than fetched, because forty of them draw at
once. **21 cells at 42px, two pixels a cell**, which is whole on every screen. 15 cells
at 45px was tried first and read as a waffle: at that size the four seams are most of
the ball. The results card uses 15 at 30px, and the career bests keep their round marks
so a ball on that card always means a badge.

**A guest keeps a career and does not get a cabinet.** `badgesOn()` reads
`A.state().signedIn` live. Signed out, the Badges tab is a teaser with a Sign in button
and the results card says how many badges the run lit and offers the sign in instead of
listing them. **The count is true and so is the promise**: every badge is derived from
the career, and the shelf merges a career nobody owns into the account that signs in, so
those runs light their badges the moment somebody signs in. The career bests stay for
everybody, because they are the record and not the cabinet.

**The guard asks one page both questions.** It plays a run signed out, checks the teaser
and the offer, fakes the account after `auth.js` has run, and checks the same tab is now a
cabinet of balls. Proved by mutation: `badgesOn()` always true fails five claims, and a
tile with no ball fails two.

**A local array here cannot be called `out`.** `verify.mjs` reads every `out.<field>` in
the page as a field the results screen expects an outcome to carry, and `out.join` failed
it.

#### A cabinet for somebody who knows the sport, and every square is proved

```
node hoops/check-badges.mjs            every badge reached by a bot, or excused with a proof
node hoops/check-badges.mjs --reunions how many One Franchise drafts each reunion took
```

Asked for as "a ton of badges that are exciting and niche goals that would make
basketball fans appreciate the dedication behind this game". The cabinet went from
37 to **171 on thirteen shelves**, and the ones worth reading about are the ones a
fan recognises: Bird, McHale and Parish on one roster; Stockton to Malone; a man
who averaged 35 (four seasons since 1974 qualify); a triple-double season; "Fo',
fo', fo'" for a title that lost one playoff game; Down 3-1; the 2007 Mavericks as a
heartbreak badge; every MVP since 1974; the Dream Team; the classes of '84, '96 and
'03. Conquest, Fix History and Six Passes each got a shelf of their own.

**THE REUNIONS ARE THE DEDICATION, AND THEY ARE ONE CLUB EACH ON PURPOSE.** Off
the whole league the wheel lands on one team-season about once in fourteen hundred
spins, so three named men on one roster is a lottery ticket. Locked to their club
in One Franchise it is a hunt: which seasons overlap, which fit under the cap
together, and when to spend a re-spin. Measured with a bot that signs a target
when one is on the board and re-spins when none is, over 100 drafts each: 57 in
100 for Stockton and Malone, 2 for Webber, Bibby and Divac and for LeBron, Wade
and Bosh. The tier is that measurement: 30 or more silver, 7 to 29 gold, under 7 a
ring. The badge text never says to use One Franchise. Working that out is the
point.

**THE FEATS MAP IS THE ONE PLACE A MODE WRITES.** Every badge is still derived, but
three modes file no row (a row is a finished season) and the rows are capped at
250, so a badge about one roster read off the rows could be lit on run 12 and gone
again by run 263. `career.feats` is a count per thing that happened, and the badge
reads the count. What writes it is four pure functions in `badges.js`
(`draftFeats`, `conquestFeats`, `fixFeats`, `passesFeats`), called by the page,
by `modes-ui.js` through `RTF_PAGE.feats`, and by the checker, so a rule is never
restated. `applyFeats` is the one writer: `add` sums, `max` keeps the high-water
mark.

**`feats` IS ON `CAREER_COUNTS` IN cloud.js, AND THAT IS THE LOAD-BEARING LINE.**
The career merge is an allowlist, so a key on none of its three lists is DROPPED on
merge, silently: the badge lights on the device that earned it and goes dark the
first time another device syncs. Every feat value is a count or a high-water mark,
so a maximum per key is right for both and never takes a badge away (it can
under-count across devices, which only delays one). `cloud.js` moved to API 2 with
it, so a cached page cannot run the old merge. `check-cloudsave`'s fuzz draws real
feat keys off the catalog's own source; with `feats` taken off the list it fails on
the first seed.

**Conquest's feats are maximums of the run as it stands**, so `cqRecordBest` asks
after every steal and again at the end without counting anything twice. The one
count, runs finished, rides on `final`, which is passed once and marked on the run
(`featsFiled`) so a reload cannot pass it again. **A negotiated deal is the one feat
only a screen knows**, so `fxAcceptAndMeasure` writes `fx.talk` after the deal is
made and legal, never on the press.

**The daily streak is read BEFORE today is filed.** `recordRun` writes the career
and then `dailyRecord` files the day, in that order for a reason written there, so
the streak badge reads `dailyStreakAfter()`, which is `dailyRecord`'s arithmetic
asked a step early.

**Mode badges toast 2.3 seconds late**, because the mode fires a toast of its own
in the same tick ("Boss beaten: a life back") and a badge said at once is written
over before anybody reads it. check-board asserts the order, and fails when the
delay is removed.

**The cabinet folds into shelves, one a group, open exactly when something on it
is earned.** A shelf that opened empty is a wall of grey; one that stayed shut over
a badge somebody just earned hides the thing they came to see. With nothing earned
anywhere, the first shelf opens so a new account does not meet thirteen closed
boxes.

##### What the measurement cut, before it could ship as content

Six ideas were written, measured over 1,500 runs, and changed, because a badge
nobody can earn throws nothing:

| asked for | measured | became |
|---|---|---|
| win a double overtime game | overtime is only ever one period (`ot` is 0 or 1) | cut |
| go unbeaten at home | never fewer than four home losses | 36 home wins |
| win 34 straight | best seen 21 | 20 straight |
| sixteen and oh in the playoffs | never; the fewest losses on a title run was 1 | cut, "Fo', fo', fo'" kept |
| five 20-point scorers | never more than three; the cap cannot hold five | three |
| plus 15 a night | best seen 13.1 | plus 10 |

##### Every badge lit, or excused WITH A PROOF

`check-badges` plays the league six ways as before, then plays the way a person
chasing each shelf would: a reunion hunter per trio in One Franchise, a stat hunter
per line, a hunter per named man, locked and daily title runs, three Conquest bots,
five Fix History bots and two Six Passes solvers. **The Fix History bot that
matters is the negotiator**, which asks other clubs for their best non-franchise
men and pays the sweetener: the one-for-one value bot tops out near 35% title odds,
and the negotiator took the 2025 Nuggets from 11% to 56%.

What is still dark must be on `EXCUSED` with one of three reasons, and each carries
a proof that runs: **grind** (a bigger count of something the sweep did produce, so
the count must have moved), **page** (the page writes the key, asserted off its
source), **skill** (a hand-built run lights it through the real rule, so it is not
dead code). Three more guards hold the list honest: an excuse for a badge that lit
anyway fails, so it cannot rot into a blanket; every feat a badge reads must be
written somewhere; and every named man is a real id who played for his reunion's
club. **The full sweep is the strict one and it is what CI runs**; a short
`--runs` sweep prints what it did not reach instead of failing, because the list is
a record of one sweep and can only be tuned to that one.

#### Run it back means the same game, and two buttons could not keep that promise

The results screen's Run it back really does replay the mode. **The daily is the
one game that cannot be run back**, so after one it says what it actually does.
And the front page's Start button is wired to `startRun` with no arguments, so
it has always been the whole league whatever was played last: it said "Run it
back" after any finished run, which was true while the league was the only mode
and became a promise it cannot keep the day the doors went in.

**The other doors are on the results screen now**, which is the screen a player
is on at the moment they will take another one, and was the one screen with none
on it. Whichever mode the run WAS is left out, because Run it back is already
that button directly above and offering it twice makes two controls out of one
decision.

#### The guards lift the real functions out of the page

`verify.mjs` brace-matches `cardTag`, `dayNumberOf`, `dailySeed`, `dailyRecord`,
`freshBadges`, `bestsSet` and `shareDare` out of `index.html` and drives them.
**Never a copy of the arithmetic**: a second implementation agrees with itself,
which is exactly what mythiball's send curve did for as long as its sweep
carried a hand-written duplicate of the curve it was sweeping. The list of names
is itself asserted, because a reader that finds nothing lets every assertion
below it pass green, which is how an extractor in this repo has been silently
wrong three times.

**The day walk runs in a child process under `TZ=America/New_York`.** It has to:
the claim is that the arithmetic is immune to a clock change, and on a CI
machine running UTC the broken version passes. Proved by reintroducing it.

### The leaderboard, and why there are several of them

```
node hoops/check-board.mjs                        the page, in a browser, in every state
createdb hoops_board && psql -d hoops_board -c 'create role authenticated; create role anon;'
psql -d hoops_board -f supabase/test/hoops_board_base.sql
psql -d hoops_board -f supabase/108_hoops_leaderboard.sql
psql -d hoops_board -f supabase/test/hoops_board_test.sql
```

`supabase/108_hoops_leaderboard.sql` is 50_football_perfect_season.sql's SHAPE
and not its copy. The two games agree on what a leaderboard is (a table only a
security-definer function may write, every derived field owned by the server,
RLS read for everybody, one index per query the client actually makes) and
disagree on every number in it, because one plays 17 games and the other plays
82. Read that file's header for the argument this one inherits.

**FOUR COMPETITIONS, NOT ONE BOARD WITH A FILTER, and the two locked ones are
scoped again by key.** That is measured rather than tidy, and the measurements
are already in this file: One Franchise pins chemistry at +2.30 of a possible
+2.50 whatever gets drafted, so best-available finishes 46.8 wins there against
the league's 42.0, and the decades are nine wins apart for the same drafting.
One board would retire the record to whoever picked the deepest franchise or
the shallowest era, and every number on it would still look reasonable.

**`lock_key` is one column and not two.** A club and a decade are mutually
exclusive: every door sets one or neither, and a run carrying both is refused
rather than stored. Two nullable columns would need two more indexes to answer
the same two questions, and would allow a row whose mode says club while its
era column is populated, which is a state no reader would know what to do with.

**The losses are the regular season's alone, which is where this differs from
the football table.** A round here is a SERIES, so a bracket loss is four wins
and three losses for somebody and the games it took are in nothing the client
sends. 58-24 is the record a basketball fan means, and putting playoff series
into the win column would make every number on the board unreadable against a
real team's.

**A pick is the engine's own `pkey`, `<id>|<season>|<CLUB>`, and the club has
to be in it.** The football table stores `<id>:<season>` because a player has
one row a year there. Here **755 of 16,057 rows are a player traded
mid-season**, who has a row per club, so id and season together name two
different half-seasons at two different prices. Dropping the club would have
made those rosters unrenderable and the two halves indistinguishable, on 5% of
players, with nothing on screen to say which one it picked. It is `E.pkey()`'s
format exactly and not a wire format translated at each end, because the client
looks a row up in the map it already keys by that string.

#### The board is a screen on Run The Diamond's model, and it lists every run

Reported by a player with a screenshot: the league board read "No names on this
board yet" over a career with runs in it, and an empty select sat beside the one
that picked the board. Asked for: model it on Run The Diamond's and The Perfect
Season's.

**It listed named runs only, and that is what made it look broken.** A run
finished signed out was filed, counted and never shown. Driven against a real
Postgres 16 with 108, 300 payloads built by the real engine (Classic with all
three plans, One Franchise, Decades) were all accepted, so the submit was never
the fault: the filter was. Diamond lists every season and draws a guest as
Anonymous; this lists every run and draws a guest as Guest. `ranks()` counts the
same rows, so the results card's place is a place on the list it opens.

**The empty select was `.lbmode{display:block}` beating `hidden`**, which is
this repo's `[hidden]` pair arriving at the board. `check-board` reads the lock
picker's COMPUTED display now, never the attribute.

`s-board` is one screen for all seven boards, and it replaced two sheets (the
draft's, and a second one modes-ui.js drew for Conquest, Fix History and Six
Passes):

| | |
|---|---|
| tabs | Classic, Daily Draft, One Franchise, Decades, Conquest, Fix History, Six Passes |
| lock | One Franchise and Decades open on every team or decade, and narrow from a select |
| axes | Best run, Record, Rating (the draft boards only) |
| window | Today, This week, All time; the three day boards are Today or Yesterday |
| sort | High to low or low to high, and a row keeps its real place either way |
| paging | a hundred rows at a time, off the count |
| rows | open into the five (or the season, the chain, the Conquest roster); a champion is gold, a 74 win run moves |
| circles | the jersey each account chose, off `rtf_profiles` (129), asked after the list is drawn |

**A locked door with no key is every key, not the league.** `modeOf` used to
send a key-less club board to the league, which is a different competition
listed under the wrong name. modes-ui.js only says what one of its rows looks
like (`RTF_MODES_UI.board.bits`) and which rows are this browser's.

**A submit that fails is said on the results card**, with the server's reason,
instead of a place. The board answered, so the run would otherwise get a place
in a field it is not in, which is the one lie that card can tell.

**Back returns to the screen the board was opened from**, the results, a mode's
result, or the front page.

#### The migration hardcodes the engine, and the drift is silent

Eight constants are literals in the SQL, on purpose, so the file can be read on
its own and pasted into an editor with no dependency. The comment over them
said "MUST MATCH hoops/engine.js CONSTANTS" and nothing made that true.

**It fails in the worst direction.** Move `TOP_SIX_WINS` in the engine and the
game starts producing seasons the server labels with the other seed, or refuses
outright for a bracket that is now the wrong length. The page fails soft, so a
refused run resolves to null and the screen says the board is not reachable: a
live, correct game whose leaderboard quietly stopped accepting anything,
reported by nobody, because that is exactly what a board looks like before the
migration has been run. `verify.mjs` holds all eight, the slot list, the four
modes, and the daily epoch, which lives in two files because one is deployed by
hand and the other by a push.

**The score is computed twice and has to agree twice.** `board.js` recomputes
the stored generated column locally, because the results screen counts the runs
ahead of you before the insert has come back: a client that shifts a
differential differently from the column counts against a number that is in
nobody's row. Swept over every (wins, differential) pair rather than spot
checked, along with the property the shift and the clamp exist for, which is
that one more win always outranks any differential.

**Postgres rounds a half AWAY FROM ZERO and `Math.round` rounds it toward
positive infinity**, so `round(-7.55, 1)` is -7.6 and `Math.round(-75.5)/10` is
-7.5: one whole step of the score column, on any season with a negative
differential landing on a half. `roundTo` is lifted from `cfb/board.js`, where
it was found.

#### A board has four states and three of them ship broken

Unreachable, nobody has finished a run, and you have not finished one. Each
needs its own sentence, because a blank box is how a feature teaches somebody
it is broken and a spinner that never resolves is worse. On a game this new
"nobody yet" is the COMMON case, so it says being first is the prize rather
than apologising. That is the commissioner standings' lesson arriving here, and
`check-board.mjs` asserts the four sentences are four different sentences.

**A missing migration is told apart from a bad network**, because the remedy is
different and only one of them is worth waiting out.

**THE GAME OUTLIVES THE BOARD**, which is the point of every soft failure in
`board.js`. A run finished against a database that has never seen the migration
still plays, still records in the career and still lights its badges, and the
only thing missing is a row on a list. The last section of `check-board.mjs` is
that assertion, and it is the one that would catch somebody making the board a
dependency.

#### The version pair, again, and this is the silent one

`NEED_BOARD` in the page against `BOARD_API_VERSION` in `board.js`. A stale
`?v=` fails loudly. This one falls through to a stub that answers null to
everything, so a `board.js` a version behind degrades to "not reachable" and
looks exactly like a bad network day. **The football game shipped exactly that
for a release**, and the section above on `BOARD_VERSION` tells the whole
story. `check-cachebust.mjs` found this pin on its own, by who SETS the global,
and there are eight pins across the site now.

#### A ring outranks a record, because the game says the ring is the goal

**The board ranked on the regular season alone, and a champion sat 98th.** `score`
was wins then point differential, so over 1,800 simulated league runs the median
champion was 98th on the board, under a pile of 60 win teams that went out in the
first round. The guide says "your goal: win the ring" and hands the player the
playoff games to call themselves, and the one list that ranks them filed the title
as decoration. Nothing failed: every row was right and the order was a different
game's.

`depth` is how far a run went, 0 to 6, derived by `rtf_submit_run()` and never
sent: missed, lost the play-in, out in each of the four rounds, champions. A
seeded run starts at 2 and a play-in run at 1, so a ring is 6 from either door.
**`score` leads with it** (`depth * 1000000` over the old key), so a 45 win
champion outranks a 68 win Finals loser and a Finals loss outranks a second round
one. **The record is a board of its own**, `record_score`, because chasing 72 is
its own sport. Three tabs: Best run, Best record, Team rating.

**It shipped undeployed, which is what made it cheap.** A generated column cannot
be altered, so a table created by the first version gets `score` dropped and
re-added in an idempotent block that also backfills `depth` from columns that
version already derived. Dropping the column drops its two indexes and the
`create index if not exists` below puts them back. Applied twice over rows from
the old file, verified on Postgres 16. The preflight row asks for `record_score`,
so a database still on the first cut reads NO.

**Made the playoffs means the bracket.** A play-in loss is not the playoffs in the
NBA, and `made_playoffs`, the career's playoff count and the "In the field" badge
all counted one. `madePlayoffs()` in the page is the rule, and `check-badges`
restates it in `rowOf` beside the page's.

**One daily per account per day, and the first stands.** The page refuses a
replay, but a browser is not a wall: a cleared jar or a second device before the
cloud save lands filed the day again with the board in hand. The function hands
back the first entry, a unique partial index holds it, and `rtf_claim_run` will
not turn a signed out daily into a second entry for a day already filed.

**A board row opens to its five.** The picks rode on every row from day one and
nothing drew them, so the board said who won and never what they built. They are
drawn against this browser's own `DATA.allPlayers`, with no request.

**A signed out run is placed in a field that counts it.** Its row is not on a named
list, so the standing read "313th of 312" at the bottom. It says "Would be 41st of
313" now, and a signed in standing waits for its own submit before it counts.

**The SQL test had been dead since the roster went to five.** Its fixture sent six
picks, the function has refused six since that change, and the file died at its
first submit. Nothing ran it. It is five now and asserts both four and six are
refused.

#### Accounts are the site's, and nothing here is a gate

`hoops/auth.js` adds NO new account system: `profiles` from
`supabase/10_accounts.sql`, the same providers, the same default supabase-js
storage key, so signing in here signs you in on the football and college games.
It deliberately has no premium anything, because this game has no paid tier,
and the four purchase functions in `cfb/auth.js` are not stubbed here either: a
function answering "you own nothing" is a door one line from being opened.

**The display name is never sent.** `rtf_submit_run()` reads it out of
`profiles` for `auth.uid()`, and the test asserts structurally that the
function has no argument that could carry one.

**A run finished signed out is claimed on the way in**, from two places: the
submit itself, for somebody already signed in, and the auth callback, for
somebody who signs in afterwards. The id rides in the saved run, so it survives
the reload a Google redirect puts in the middle of it, which is the case that
would otherwise lose every name.

#### Three things about the harness, and two of them cost an hour

**`content-range` is not a CORS-safelisted response header.** PostgREST returns
the exact count there, and a cross-origin stand-in that does not name it in
`Access-Control-Expose-Headers` hands the page a response whose header
JavaScript cannot read. `countOf()` then answers null, every count comes back
as "no opinion", and the standing reports the board unreachable while the LIST
beside it renders perfectly: a harness fault that looks exactly like the defect
the file is written to catch.

**Waiting on the roster to grow is a race, and waiting a fixed 700ms is the
same race.** The roster grows INSIDE `sign()`, which spins the next board a
beat later (`setTimeout(spin, 240)`), so a wait that fires on the roster
returns while the board on screen is still the one just signed from. The next
pass clicks a tile off a board about to be replaced, two signings land against
one draw, and the draft stalls with an empty board and no way on but the Spin
button. The wait is for the next board to be up and readable: the roster has
grown, there is a fresh draw, and the tiles are out of `pending`. A slower loop
never hits it, which is why it took three drafts of the file.

**An assertion that could only pass.** "The sheet opens on the run's own board"
was checked against a LEAGUE run, and `lbMode` defaults to the league, so
deleting the line that reads the run passed green. It plays a Decades run now.
The same trap caught the second path a second time: opened once from the
standing, `lbMode` is already the run's board, so the front page would land
there whether or not it looks at the run at all. That check reloads first.

### The bracket, and the field it draws around you

```
node hoops/check-bracket.mjs            the arithmetic and the screen
node hoops/check-bracket.mjs --quick    the arithmetic only, no browser
```

The postseason used to be a list of rows: one line a round, the round's name,
what the opponent played like, and WON or LOST. Correct, and it is a receipt
rather than a bracket. `s-brk` is the football game's `s-nbrk` in this sport:
sixteen seats in the NBA's shape, a **fixed** tree (1/8 meets 4/5, 2/7 meets
3/6, no reseeding, which is the real rule and is simpler than the NFL's),
walked forward a round at a time with the other games flipping to their
winners one after another and the player's held back.

**IT DECIDES NOTHING.** The opponent each round is a net rating drawn by
`poBeginRound`, and the whole postseason is fitted against the title rate of
every team-season in the data. A bracket that picked the opponent instead
would quietly rebuild the difficulty curve. What is drawn here is the field
AROUND that path, and the fourteen games the player is not in are simulated
for the reveal alone.

#### A conference is twenty wins wide, and the walk made it fourteen

Every seat was the player's record stepped one to three wins a seed, and the far
conference stepped down from a 62 to 68 win top seed the same way. So an East 8
seed won 56 and every club in it was better than every club in the player's West,
which a fan reads in one glance. `brkLadder()` holds each seed within two wins of
where it usually lands, off `BRK_OVER` and the play-in line, and the player's own
record is still never moved. `check-bracket` asserts the far conference runs at
least fourteen wins top to bottom and that no 8 seed has a top six record.

#### Every seat is a club and a seed, and never a season

Asked for by the owner: the bracket says who you are playing, a team and a
seed, and not a record. **This reverses a rule this section used to hold**,
which was that the bracket names nobody and every seat is a seed and a record.
The argument behind that rule was about a SEASON and it still holds: printing
"the 1996 Bulls" over a number the model rolled tells somebody they beat a team
that was never in the room. So a seat carries a **club of today's league and no
year** (`BRK_CLUBS`, fifteen a conference, each club in its own). That is how a
bracket for a season nobody has played yet reads, and it is a label rather than
a claim about anybody who ever played.

**The clubs come off a stream of their own** (`run.seed` + `|nbaclubs`), so a
reload or a replay shows the same field and naming it moves no number in it. A
**One Franchise run plays in its own club's conference and never meets its own
club.** The play-in opponent is a club too, from the same conference and on no
other seat. The seed chip wears the club's colors off `E.clubSkin`, the same
skin the reels use, so the digit is measured to read on its own fill.

**Two nicknames are cut** (`BRK_NICK`: Wolves, Blazers). The rail's seat fits
"Timberwolves" and the series card does not: at 320 the card's name has about
71px and "Timberwolves" needs 98. The guard measures all thirty clubs in a real
seat and on the real card at 320 with a Range, through the page's own
`brkClubName` lifted out, so the probe cannot pass on names the page stopped
printing.

**One club everywhere a round is named.** The rail, the series card, the note
under the rail, a playoff game's box score and the results screen's series
blocks all ask `brkThem` or `brkOppLabel`, which read the bracket's own seat.

**EACH DECORATION GAME ROLLS ON A STREAM OF ITS OWN**, keyed on its place in the
tree. Off one shared stream the result depended on the ORDER the games were
first asked for: the live walk asks a render at a time, where games waiting on
the player's series resolve late, and a reload asks a column at a time, so a
bracket rebuilt after a reload could crown a different club from the one that
was on screen before it. With names on the seats that would be visible, so the
guard asks the field forwards and backwards and requires the same winners.

**THE STRENGTH STAYS IN THE NOTE.** The seed is the FIELD's shape. The strength
the engine drew is what you are playing, and the draw is deliberately wide
(`TITLE.SERIES_SD`), so the two disagree and should: **"Next up: the Nuggets,
the 3 seed. They play like a 58 win team."** That note is read off
`run.po.cur.oppNet` and never off the pending game, which answers with the
points and the home court, meaning the rating already converted for this
matchup. The seat's wins are still built (they order the seeds) and are no
longer printed anywhere.

#### A column is empty until the round that feeds it has been played

**This shipped in the first draft and it is the whole reason the file has a
spoiler section.** Every decoration game is decided the first time its pairing
is asked for, and a first round's pairings are SEEDS, so they exist before a
ball is thrown: the conference final column named the 5 seed while the first
round was still being revealed, which tells a reader who wins their own
semifinal before their first round is over. A perfectly rendered bracket,
reading ahead.

The seats know their teams either way. `brkKnown()` only governs whether they
are DRAWN, and TBD is what an unfed seat says.

**THE FIRST ROUND IS ALWAYS KNOWN, and gating it behind the play-in was the
second version of the same mistake.** A play-in run arrived at a bracket of
sixteen TBDs with one game in front of it. The play-in feeds exactly one SEAT,
so that is handled a seat at a time (`brkSeatIn`) rather than by hiding seven
games whose pairings are seeds.

#### The column is built around the player's own record

A worse seed showing more wins than a better one is a bracket arguing with its
own seeding. Per-seed bands cannot promise that, because the player's record
is the one number in the column that is not ours to choose: the engine lets a
43 win run into the play-in, which sits under any band written for an 8 seed.

So `brkColumnWins` **anchors on the player's seat** and spreads everybody else
away from it, upward for the better seeds and downward for the worse.
Monotone by construction, swept over every anchor a run can arrive with, and
asserted again off the rendered page because the two halves of that claim (the
arithmetic and what is printed) are different questions.

**A play-in run is the 7 seed**, and both halves of that come from one place:
`seedFromRecord` is what decided there would be a play-in round at all, so
reading `bye` rather than the win total again means the seed and the schedule
cannot come apart.

**THE SEAT THE PLAY-IN FEEDS HAS THREE ANSWERS AND ALL THREE ARE NEEDED.**
`brkEntrant` is asked once, in the field, and everything above the first
round is fed from it: a substitution made in the painter instead would seat
the right club in the first round and carry the wrong one into the semis.

| the play-in is | the seat holds |
|---|---|
| not decided | nobody, because the first round drew the player into a seat while the game deciding whether they are in it was still on the screen above |
| won | the player |
| LOST | whoever beat them |

That last row is what lets the field finish. Without it a play-in loss left
the seat empty, so every round after it stayed permanently TBD and **the
postseason the player had just been knocked out of never happened at all**.
It is also what the real bracket does.

**The play-in is ONE box, because the engine's play-in is one game.** The real
thing is four games over two nights and drawing that would be a picture of a
tournament the run never plays. Its opponent carries a record and **no seed**:
the winner is the 7 seed, so neither side is one yet, and a chip reading 8
beside a first round column that also has an 8 would be two different clubs
wearing one number.

#### What moves, and what it costs

The whole field is redrawn on every step, which is what the football bracket
does and is fine here for the same reason: it is sixteen seats of text. **So
the animation cannot live on the seats.** A keyframe on `.brk-t.won` would
replay for every settled seat on every step, because innerHTML builds a new
node and a new node starts its animations over. Exactly one key is marked
`just` at a time and only `.just` carries the flip, so the game that has this
moment is the only thing moving.

The live ring is a pseudo-element on transform and opacity rather than an
animated `box-shadow`, so the one thing looping on this screen costs the
compositor and not a repaint.

**The reveal is the same length whatever the round is.** A first round is
eight games and a conference final is two, so a fixed step makes the first
round four times the wait for the same beat: the step is `2400 / games`.

**Nil apiece prints nothing.** A series that has not tipped off showed a 0 on
both seats, which is two numbers saying the same nothing on the one box the
reader is watching. A 0 beside a 4 is a sweep and stays.

**The bracket finishes without you**, and that is worth the beat. A run that
goes out in the first round has watched a field it is now not in, and walking
the rest of it out says what the postseason did rather than stopping the
screen the moment the reader stops mattering to it. `check-bracket` drives
that over 320 runs, out at every round including the play-in, and asserts
somebody is holding the trophy and that it is never the player who went out.

#### Two things about its guard, and both were the check rather than the page

Both showed up only on a PLAY-IN run, which is the shape the first browser
pass happened not to draw, so both passed green once before failing.

**A pairing with an empty chip is the rule working.** One first round seat is
correctly TBD while the play-in that feeds it is still on the screen above,
and the first draft read `''` as 0 and reported a 7 seed paired with nobody
as a bracket that does not add up.

**"Nothing past the round being played" is the wrong line.** The first round
is always drawn, so on a play-in run the correct first round read as fifteen
seats reading ahead. What must be hidden is everything past the LATER of the
round being played and the first round, which on a bye run is the same column
and on a play-in run is one along.

#### The door moved onto it

A game the series can end in is offered here now, **above the rail**. The rail
is the tallest thing on this screen and it scrolls, so a control the game is
waiting on underneath it is one the player has to go looking for. That is the
live board's own call-box rule, and the guard measures it against a phone
rather than against its own window.

`show()` stops the bracket walk when the screen is left, the same way it stops
the live game and the season reveal, and for the same reason: a bracket
deciding rounds behind another screen is a series that moved without anybody
watching it.

**A reload lands on the bracket**, not on the season screen. `run.po` carries
the whole thing and holds no rng and no player objects, so it survives JSON;
the 82 game strip behind it is a season already played and rebuilding it is a
reveal of something the reader has seen. Rounds already played are drawn
settled, because a bracket that came back as a page of TBD reads as a run that
had not started.

#### Your series is a card, and every number on it is read rather than decided

```
node hoops/check-bracket.mjs --quick   section 3b: the odds, the upset rule, the box score
```

Asked for as making the playoff sim feel like an enhanced version of itself. The
postseason used to be a box in the rail whose number changed every half second.
`#brk-srs` sits between the door and the rail and shows YOUR series the way a
broadcast does: the two sides, the series score, a **series odds** bar that
swings after every game, a tile per game (W or L and the margin, lit for the
next one, Home or Away on the rest), the newest result with whose night it was,
and a stamp when it is over (Sweep, Won in 6, Out in 7).

**NOTHING ON IT DECIDES ANYTHING**, which is the rule this screen has always
had. The odds are `E.seriesChance(po.cur)`: resolveGame's own arithmetic
(`gameChance`) walked over the real 2-2-1-1-1 home pattern, with no rng and no
state touched, so asking it on every paint moves nothing. modes.js carries the
same one-game formula as `winChance` for Conquest, so section 3b holds the two
equal over a grid of matchups, and holds the series odds to 20,000 simulated
series from six states. Breaking the home court or CONSISTENCY in the formula
fails it.

**A game opens from the bracket, and it is the same box score as later.**
`R.playoffRounds(run)` is `run.playoffs.rounds` once the run is over and
`po.results` plus the series in progress before that. The box score's seed is
the game's address either way, so section 3b opens every game the moment it is
played and again after `finishRun` and requires the two to match exactly.
**The walk holds while the box score is open**: every beat is scheduled through
`brkLater`, which waits while `#gamesheet` is open.

**The pacing is per game now, and it is slower on purpose.** A game is about
0.9s (0.24 to the tip, 0.7 on the result), a game that can end the series gets
0.7s on its lit tag first, and a finished series holds 1.3s for the stamp. A
seven game series is about 7s where it was 4s. **Skip ahead now hurries your
own series too, and never through a Game 7**: `brkRushSeries` plays the same
games in the same order off the same stream, so only the waiting goes.

**What the tiles do not show is the score.** Two three digit scores do not fit a
seventh of a phone and read as `122-1...`, so a tile shows the margin, and the
score is on the line under the strip and one tap away.

**An upset is three seeds or more** (`brkUpset`, lifted and tested): the box
gets a gold Upset tag once it is settled on screen, and the reveal calls it in
the note as it lands. A 5 over a 4 is not tagged, or the word would sit on half
of every first round.

**The title is won on the bracket, so it is celebrated there first**: the hero
turns gold and reads Champions, confetti falls, and the results screen follows
2.8s later. `fireConfetti` refuses a second shower while one is falling, so the
results screen does not double it.

**The round title was left-aligned and nobody had noticed.** `h2` is a
space-between flex row site wide, so a lone title sat on the left under a
centred eyebrow. `.brk-title` centres itself now.

**Two layout faults were found only by looking**, and both are the rules above
arriving again: `.srs-sd` sets `display:grid`, so its `hidden` needed its own
`[hidden]` rule, and a stamp laid over the card sat on the other side's name,
so it lives in the heading row where the tag was.

### The court is a hardwood floor, and the club goes ON it

The court on all three screens (the home hero, the draft, the results) was a
flat brown radial gradient with four white outlines over it, which reads as a
DIAGRAM of a court. A floor is what the sport is played on and it is the one
surface in this game a fan already has a picture of.

**Seven background layers, and the top one is a custom property.** The tint is
`--floor-tint` and the six under it are the wood: a varnish sheen, light across
the boards, board to board tone, the seams, the grain, and the maple. The club
rule swaps the TINT and nothing else.

**That is the whole point of the restructure, because the flat version was one
`background` and `body.clubbed .court` replaced it outright.** Do that now and
every plank goes the moment a club reel lands, which is a court that looks
perfect in the state a developer opens the page in and flat for the whole
draft. Nothing throws. `verify.mjs` asserts the club rule sets `--floor-tint`
and never `background`, and both defects were proved by reintroducing them.

**FOUR PERIODS THAT DO NOT DIVIDE INTO EACH OTHER, or it is a barcode.** One
repeating gradient at one period is found by the eye in about a second. The
planks are 6.1%, the board tone is 21.7% and the grain is 1.63%, so no two ever
line up and nothing has to be random.

**The seams were at .30 and the floor was corduroy.** Two sets of vertical
stripes at high contrast stop reading as boards and start reading as cloth.
They are a hairline at .17 now, and the TONE is what separates one board from
the next. The grain is .022 for the same reason: it is a third set of vertical
stripes and is the layer most able to ruin this.

**The boards run away from the reader**, because this camera looks at a half
court from centre with the basket at the top, and a real floor is laid baseline
to baseline. Laid the other way they read as decking.

**Three parts were added as markup and every court needs all of them**: the
apron (`.oob`, the same boards under a darker stain rather than a different
surface), the backboard (`.bb`, three pixels that turn a hoop floating on a
floor into a basket) and the two corner threes (`.c3`, which the arc alone
cannot draw). The guard counts them against the number of courts rather than
naming them, so the next part is covered without anybody remembering.

**The club wash is .42 and was .62, and the difference is measured by looking.**
At .62 a club painted the top third of the floor a solid colour and the planks
disappeared into it, which is the flat court arriving by a different door. At
.42 it is a floor lit in the club's colours. **The layer count and the layer
types are identical in both states**, so the .35s fade between clubs still
interpolates.

### The game talks like a broadcast, not like its own source

Reported by the owner: most of the text did not read like basketball. It read
like the comments above it, which are allowed to argue at length. A sentence a
player reads is a TV graphic or a play-by-play call, and it is written that way
now across every screen.

| was | is |
|---|---|
| The bracket got stiffer than the roster. | Ran into a better team. |
| Unspent cap is production you never fielded. | You left $14M on the table. |
| projected 56-26 · title odds 5% | Vegas: 56 wins · Dark horse, 5% |
| 4.2 off / 4.7 def win shares | 18.1 pts · 4.1 reb · 7.3 ast |
| Out in the First Round | Bounced in round one |
| Nobody on this board can play there. | No centers on this roster. |
| Spacing 0.73x | Spacing: Cramped |

**American spelling and American words.** Center, color, parking lot, team
rather than club, guys as well as men. `Point Centre` is `Point Center`; its key
stays `point_centre` because a key can be stored and a name cannot.

**A round is said the way a fan says it.** `roundPhrase()` turns the bracket's
labels into "round one", "round two" and "the conference finals", and the
headline, the bracket note, the resume chip and the board rows all read it.
The gauge line under the headline no longer repeats the round.

**Two sentences were false and are fixed rather than reworded.** The sign-in
line said the career stays in this browser "whatever you do", and the badge
note said the cabinet is "kept in this browser". Both have been on the account
since the cloud save shipped. They ask `cloudReady()` now.

**Win shares stay on the draft tile and leave the roster row.** The tile is a
price decision and win shares are what the game rates on. The roster row is
the man, and a man is his points, rebounds and assists.

### The 1988 to 2002 Hornets are Charlotte's

`CHH` pointed at the Pelicans, which is the legal entity that moved. The NBA handed
that history back to Charlotte in 2014, and it is the history a Hornets fan means:
Mourning, Larry Johnson and Muggsy. A Charlotte run in One Franchise had none of
them and the draft note said "later the New Orleans Pelicans". It is `became:
'CHO'` in `fetch-teams.mjs` and in `teams.json`, and `verify.mjs` asserts both
directions.

### Playing all four modes, which is a different question from checking them

```
node hoops/check-draft.mjs       sections 7, 8 and 9
node hoops/verify.mjs            the name sweep and the club window
```

Every guard here asks whether a screen is CORRECT. Four modes played end to end
at a phone, looking at each screen, found four things that are each correct in
that sense and wrong on the glass. None of them threw, and the suite was green
through all of them.

**A MAN WAS CALLED "JR.".** `lastNameOf` took the final whitespace token, so
Jaren Jackson Jr. was drawn as **Jr.** on the live floor chips, in every play by
play row, in the box score, in the endgame call ("Give it to Jr.") and in the
coach report. **43 men and 196 player-seasons, 1.19% of the pool**, among them
Tim Hardaway Jr., Gary Trent Jr. and a Defensive Player of the Year.

**It was the two readings side by side that made it obvious.** The page carried
its own `lastName`, everything-after-the-first-token, which is right about a
suffix and wrong about a middle name, so the verdict card read **"Jaren Jackson
Jr. had 32."** directly above a chip reading **"Jr."**. One man, one screen, two
formatters. There is one now and the page delegates to it, which also fixed
`Nick Van Exel` reading as "Exel" and `Vinny Del Negro` as "Negro".

The rule is the last token, plus the one before it when that token is a SUFFIX
or when the token before THAT is a PARTICLE. **A particle is only a particle
when a first name is left over**, or Del Beshore and Von Wafer lose theirs.
**Three names in the pool it still gets wrong**, recorded rather than fixed:
Metta World Peace, Luc Mbah a Moute and Jan van Breda Kolff each carry a
multi-word surname no rule reaches. A list of three inside a formatter is the
allowlist this repo keeps finding in the middle of a rule.

**THE SCREEN BETWEEN THE DRAFT AND THE RESULT DID NOT KNOW THE TEAM.** It held
one card of three numbers. Measured through the real page, its content ended at
**237px of an 844px phone** before tip-off and 464px with the season running,
against 780 to 3400 on every other screen, so the five men were absent from the
last press of the draft until the results screen. It carries the roster now, and
the same phone reads 690 and 918.

**It is the roster and deliberately NOT the court.** There is a court on the
draft screen, whose last state is these same five men, and another on the
results screen. A third is 300px of a picture the reader just watched fill up,
on the screen that also holds the game strip, and at 320x568 it is the
difference between one scroll and two. It is drawn by the results screen's own
painter rather than a copy, because two lists of one roster are two things that
can disagree about a man.

**A CLUB CHIP PROMISED RINGS THE WHEEL CANNOT REACH.** The One Franchise picker
prints a season count off `R.clubSeasons`, which is the wheel's own answer, and
its own comment argues at length for that: a chip printing the club's age would
promise twenty-eight seasons that cannot be drawn. One line later the ring count
was the franchise's ALL TIME total. Joined by a middot they read as one claim,
so Boston said **"53 seasons · 18 rings"** with eleven of the eighteen outside
the pool. **Eight clubs of thirty overstated it, and two promised a ring that is
entirely unreachable**: Atlanta's is St Louis in 1958 and Sacramento's is
Rochester in 1951, so a chip said "1 ring" about a wheel holding no championship
season at all. The lineage is untouched, which is why this is a filter rather
than a smaller number: Oklahoma City still counts Seattle's 1979, because that
season IS on the wheel.

**The guard's expectation comes off a different table from the painter's.** The
chip filters `f.titles`, which is `LINEAGE_TITLES`; the check asks `E.wonTitle`
over every season the wheel offers, which is `TITLE_AT`. Restating the painter's
own filter would be two implementations of one answer. And the pure half in
`verify.mjs` asserts only that the two counts still DISAGREE for some clubs,
because "every ring inside the window is inside the window" is a sentence about
its own filter and can only pass.

#### And a reel landed into a run that had been thrown away

Found by the club-picker guard, which only wanted to reach the picker and had to
abandon a run to get there.

A spin is about a second long, so pressing the wordmark mid-spin and then
Abandon leaves two timers pointed at a run that is now null. The landing
callback ran anyway, walked into `R.remaining(run)` and threw **"Cannot read
properties of null (reading 'roster')"** out of an animation, on the home
screen, with nothing on screen to say so.

**THE THROW IS THE LOUD HALF AND NOT THE WORST HALF.** `dressPage` fires first,
so the abandoned club painted the FRONT PAGE in its colours on the way out: a
home screen wearing a team the player had just thrown away, which renders
perfectly and reports nothing. `body.clubbed` is the whole of it, so that is
what the guard reads rather than the exception.

This is the identity check every other timer on this page already carries, which
`show()` writes out for the live game and the bracket walk, arriving at the one
animation that never had it. **The run OBJECT is compared rather than a flag**,
so it catches a second run as well as no run: `startRun` builds a new one, and a
spin from the old one landing into it would draw the wrong club on the right
board. **`reelBusy` is cleared on the way out**, because it is the flag
`drawInto` refuses on and a stale spin that simply returned would leave the NEXT
draft unable to deal a board at all.

#### THE SELECTOR AGAIN, AND THIS TIME IT WAS THE GUARD

`check-draft.mjs`'s own section 6 writes down that `pending` sits on the PARENT,
and its `draftPage` helper then waited on `#opts .ptile:not(.pending)`, which
returns the moment the tiles EXIST. So section 5, which re-spins looking for a
two-position man, read a board that had not landed, found `#b-respin` still
disabled by `reelBusy`, broke out after ONE board and failed.

**Measured rather than re-run until green**: 9.8% of single boards hold no
two-position man and **0.03% of four-board searches do**, over 3000 real drafts.
That is the whole difference between a guard that flakes about one run in ten
and one that does not. Four selectors in that file, fixed in one commit.

#### The two the first pass left, and one figure in it that was wrong

Both were written up as judgement calls and both are done. One of the two
descriptions was also wrong, which is worth reading before trusting a number
measured the same way.

**THE GUIDE SAID THE SEASON PLAYS ITSELF AND STOPPED.** It is the one screen a
stranger cannot skip, three numbered steps over the front page, and the most
distinctive thing this game does was in none of them: a first-timer was told
the opposite in as many words. Step 3 names it now, in one clause on the step
that is already about the season. It is a rule rather than a number, so there
is nothing to interpolate; the claim describes `big` in `engine.js`, which is a
game either side can go out in, a game that wins the series, and every Finals
game.

**A FOURTH STEP IS WHAT WOULD NOT FIT, and the room is measured.** The panel is
content sized under a max-height and 360x640 is the tight one: 515 of 538 with
this sentence in, against 495 before it. 320x568 scrolled inside itself BEFORE
this and scrolls 41px more now, which is a cost rather than a regression, and
the way out there is the Start button the guide points at rather than the Got
it inside the panel. `check-home.mjs` asserts the words, the room and that
Start is still the element at its own centre, because no measurement of the
glass can say whether a guide is telling the truth about the mode.

**THE PLAY-IN FLOATED CLEAR OF THE SEAT IT FILLS.** Every column of the bracket
is a centred list, which is right for a whole round and wrong for the play-in:
it is ONE game feeding ONE named seat. Measured at 390x844, the box sat at 306
against the pairing it fills at 259, with the TBD it is about on the line
above. It is level with it now.

**THE OFFSET IS MEASURED AND NOT DERIVED**, because a box is 62px today and the
conference labels between the groups are not. It runs on a frame AFTER the
screen is shown, since `brkRender` is called ahead of `show('s-brk')` and at
that instant every rectangle in the rail is zero, which is `showFact`'s own
lesson about a `scrollTop` written to a hidden element arriving at a
measurement. A stale frame measuring zero writes nothing rather than
un-centring the column on the way back.

**And the CSS rule written to make room for it did nothing.** `.brk-col.pin >
:nth-child(2){margin-top:0}` was added to turn off the auto centring, and the
guard passed with it deleted: an INLINE style beats a stylesheet rule whatever
its specificity, so the measured margin was already winning. The rule is gone
and `pin` stays as the marker that says which column anchors, which is what the
guard reads.

**ONE FIGURE IN THE FIRST WRITE-UP WAS WRONG, and the way it was wrong is the
lesson.** The play-in column was reported as "one box under about 1,100px of
empty space, because it is aligned to the seat it feeds". Both halves were
false: it was **306px**, and it was CENTRED rather than aligned. The 1,100 came
off a full-page screenshot, and **a full-page screenshot resizes the viewport**,
so every length in it is about a window nobody has. Read the rectangles, not
the picture, whenever the claim is a number.

**The guard's own first draft found the wrong game.** It looked for the pairing
holding the play-in seed, and the winner is the 7 seed: until the play-in
resolves the near side draws that seat as TBD while the FAR conference has a
real 7 in its own 2/7 pairing. It reported 378 against 680 and blamed a page
that was correct. Exactly one first-round pairing is WAITING on somebody, and
that is the honest way to name it.

#### And a third guard was measuring the race rather than the page

`check-live.mjs` asserted that answering a call "puts the question away" by
reading `#lv-call.hidden` **250ms after the click**. The comment eight lines
below it already says a game can genuinely ask TWICE, which is exactly what
that sample races: the box is put away and shown again for the next call, so a
late reading reports a question that was never left up. **It failed about one
run in three**, on a page doing the right thing, and the burst after an answer
is wide enough to make it likely: one run played **22 possessions inside that
250ms**.

A MutationObserver on the `hidden` attribute, installed before the click,
records the TRANSITION instead, and the failure message carries the sequence
the box actually went through. Same rule as the football board's move marks,
and the same rule this repo states for the late meter answer: **a timing
property cannot be checked by hoping to win the race.**

### A straight column of digits is a FEATURE, not a typeface

This game was set in a code face. `--mono` was `ui-monospace` and **39 rules
reached for it, which is more than the display face was used**, and every one of
the 39 was a NUMBER: a price, a record, a scoreline, a win share total, a
streak. The Perfect Season, which this game is a reskin of, uses a monospace
exactly ZERO times and sets the same figures in its own faces. Reported by a
player asking for a more appealing font, and the monospace is what they were
looking at.

**What all 39 actually wanted is `font-variant-numeric: tabular-nums`, which
lines digits up in ANY face.** Reaching for a typewriter to get a straight line
buys a whole voice nobody asked for: a scoreboard set in a code face reads as a
terminal, and this is a game about basketball.

**Two number faces, and the split is SIZE rather than meaning.** The hero
figures (the money left, a record, a scoreline, the streak) take `--display`,
which is what football's own `.num` does. Everything inline stays on the body
face, because the display face is a single heavy weight and at the 9.5px a badge
count is set in it is a smudge.

**`--num` POINTS AT `--body` rather than repeating its stack**, because the two
are one answer and a copy of a font stack is what drifts the day somebody
changes the body face and cannot work out why half the numbers did not follow.
What the name carries is the ROLE.

**The guard is a pair and not one rule.** `--num` exists only to carry figures,
so a rule that names it and no `tabular-nums` has forgotten what it is for, and
that renders a perfectly good number in a slightly wrong column with nothing
anywhere reporting it. `verify.mjs` asserts both halves plus the absence of any
code face, over `index.html` and `how-to-play.html`, whose own unused `--mono`
went in the same commit: an unused variable is the next person's invitation.
The `.mono` utility class is `.num` now, because a name pointing at a face that
is not a monospace lies to whoever reads the markup. Three of the four defects
were proved by reintroducing them one at a time.

**Tabular on `.tab .n` is not about a column.** The position tab's count falls
as you sign, so a 9 narrower than a 2 moves every tab to the right of it.

**WHAT CANNOT BE JUDGED HERE IS THE WEBFONT.** Google Fonts does not resolve in
the dev sandbox, so every screenshot in this repo shows the FALLBACK face and
Anton and Archivo are invisible to it. That is written up at length under the
football premium check. The monospace finding is the half that renders the same
either way, because `ui-monospace` is a system face.

### How to play is one folded card, and it was half the front page

"How a run goes" and "Why six stars lose" were two open cards at the bottom of
the home screen. Measured: **1,682px of a 3,082px page at 390 and 1,846 of 3,236
at 360**, which is more than half the front page, on every visit, for as long as
somebody keeps playing. Reported by a player as too much to scroll.

| | before | after |
|---|---|---|
| 390x844 | 3.65 screens | **1.72** |
| 360x740 | 4.37 screens | **1.94** |
| 1512x950 | 2.62 screens | 1.56 |

They are one subject and they are reference, so they are one `<details>` headed
How to play, shut, with the second half under its own turn.

**FOLDED IS NOT HIDDEN, which is the arcade's own note and is why the comment
over the second card still holds.** That comment argues a game page whose every
word arrives after a click reads as empty to a crawler and to a reviewer, and
that survives a details element: the prose ships in the HTML either way. It
would NOT survive the obvious alternative, which is moving the text to the rules
page and linking it. So `check-home.mjs` counts the words in the DOM **while the
card is shut**, which is the property that alternative breaks.

**The summary holds the other cards' own `h2`.** This is one more card on a page
of cards and the only thing different about it is that it opens, so the heading
has to be the same element or it is a second copy of that rule waiting to drift.
What it costs is one line: an `h2` is `display:flex` and a block, and a summary
lays its marker out beside its content, so the heading has to be told to share
the row or it sits across the marker and eats the press. The guard clicks the
heading rather than setting `open`, for exactly that reason.

**The card's bottom padding is on `[open]` alone.** Shut, the card IS the
summary, so its own padding is a strip of empty card under the heading.

**`check-home.mjs` measures in SCREENS of the viewport, not pixels**, because
1.7 screens is the complaint answered and 1,450px is a number. 360 is the worst
case rather than 320: what costs screens here is prose reflowing into more lines
against a viewport with fewer pixels to spend on them. Shipping the card `open`
reproduces the reported defect exactly (3.63, 4.31 and 2.63 screens) and breaks
seven assertions.

### A game seven is not a scoreline

```
node hoops/check-live.mjs            the engine and the page
node hoops/check-live.mjs --quick    the engine half, no browser
```

`resolveGame` samples two totals and `gameBox` decomposes one of them into six
lines. That is the right shape for 82 games and the wrong shape for the game a
whole run comes down to, because there is nothing in it to decide: the score
exists before the first possession and every screen after it reads a number
that was already there.

So an elimination game or a Finals game can be **played**. Possession by
possession, a real clock, a running score, a live box score, and it stops at
the two calls a coach actually makes. **Playing decides it**, which is the
whole point and is also the thing that makes the rest of this section
necessary.

#### It is not a second model, and that is the whole engineering problem

`gameBox`'s header argues at length that a possession sim which DECIDED the
score would replace the win-share model fitted to twenty-two real NBA records,
and that two models of one game disagree. Both are still true. What changed is
that this sim does not get to be a different model: it is **fitted to
`resolveGame`**, so a neutral caller playing a game forward and the resolver
settling the same game are two samplers of one distribution rather than two
opinions about basketball.

The mean is arithmetic: the per-possession scoring rate is solved from the same
`pointsFor` and `pointsAgainst` the resolver is handed. **Matching the spread
is not**, and it is the reason `LIVE.PULL` exists. A possession is worth 0, 2
or 3 points, so ninety-nine independent ones give a game total SD near 11.5
against the resolver's effective 9.02. Left alone, every series played live
would be wider than every series simmed, a seven game bracket would swing more,
and the title rate would move: the one number this game's calibration is
anchored to. So each possession's rate is pulled back toward the pro-rata
expectation by how far the running total has drifted from it, which is
`CONSISTENCY`'s own idea applied inside a game rather than to its total.

**Fitted over four matchups and 10,000 games each**, not one:

| | residual against `resolveGame` |
|---|---|
| mean | +0.2 points, both sides, every matchup |
| spread | within 0.15 of the resolver's 8.9 to 9.1 |
| win rate, calls suppressed | within 0.6 points |
| win rate, the auto caller answering | within 1.3 points |

So **playing is worth about seven tenths of a point of win rate** before the
player makes a single call of their own, and that is the auto caller: two late
decisions the resolver never asks. Recorded rather than compensated, which is
the football forward sim's own note, and it is the right sign. A mode that
asked somebody to play four games and then handed them a worse result than
skipping is a mode nobody should play.

**The win error tracks the spread exactly, in both directions.** A live game
wider than the resolver pushes every matchup toward a coin flip and a tighter
one pushes it away, so one dial lands both, and a fit that got the spread right
and the win rate wrong would mean something else was broken.

#### Two ways it was silently wrong, and neither is visible in an even game

**THE CLOCK MUST NOT DECIDE WHEN THE GAME IS OVER.** The first version ticked a
fixed number of seconds off a clock and ended the game when the clock ran out.
Regulation divides into 198 possessions exactly, so after 198 ticks the clock
sits a hair above zero rather than on it, and the 199th possession belongs to
whoever went first. **That is a whole extra possession for your side in every
simmed game**: +1.3 points and +4.1 of win rate against the resolver, with the
other side landing exact, which is what an asymmetry that size looks like. It
also ran 198 usually and up to 206 sometimes once the clock jittered, so a game
a player WATCHED and the same game simmed were not the same game. `liveTick`
divides what is left by what is left to play, which cannot drift, and the
period ends on the possession count.

**AND THERE IS NO FAST CLOCK.** An earlier draft took a `fast` flag that
dropped the jitter, used by `liveFinish` so a simmed game did not bother
rolling for it. That is a second game: both call windows are measured against
this clock, so an evenly ticking one asks a different set of questions at a
different set of scores. Sim the rest hurries the screen and never the
basketball, which is the football boss battle's rule, and one clock is the
cheapest way to keep it.

**THE PULL IS MEASURED AGAINST A FIXED REFERENCE, NOT AGAINST THE TEAM'S OWN
RATE.** Written `k0 * (1 - pull)` the correction is worth a fixed FRACTION of a
make, so it moves more points for a team scoring 118 than for one scoring 101.
Over four matchups that put a favourite's spread at 8.57 against an underdog's
9.02 on the same dial, mirrored on the other side, where `resolveGame` allows
every team the same 9.02 whatever it scores. **A one matchup fit cannot see
it**, which is why the sweep and the guard both walk four.

#### Which games are offered

**A Game 7, and nothing else.** `big` in `poNext` is `bestOf > 1 && facing
&& closing`, which is the same test as `decider`.

**It used to be every game a series could END in, plus every Finals game**,
measured at a mean of 2.6 stops a run and up to thirteen. Reported by a player
as too many pauses in the quick draft, and timed through the real page it was:
a first round exit met FIVE doors, and the bracket walk that is meant to take
twelve to nineteen seconds became a sequence of the same question. A stop that
comes every series is a pause; one that comes one run in five is an event.
Measured after, over 200 runs: **mean 0.2, max 1**.

**The play-in is NOT a Game 7**, although both `elimination` and `closeout` are
true there by arithmetic, so it plays through with everything else.

**The browser half of `check-live` widens the door on purpose.** Waiting for a
one-in-five event makes every screen behind the door a coin toss on whether the
walk gets to see it, which is the badge nothing can light. So `widenDoor()`
wraps `RTF_ENGINE.poNext` inside the page to flag any SERIES game that can end
it, and has to be applied again after a reload. Section 4 is where the real rule
is asserted, exactly, off the engine, and section 5 plays every series-ending
game forward rather than only the Game 7s, because what it asserts is the
record and not the door.

#### The bracket is one loop, and it is the loop that already existed

`generatePlayoffs` used to play every round and hand back a finished bracket.
A game the player is going to play cannot be settled before they see it, and
the rest of the bracket after it depends on how it went, so the loop had to
become turnable one game at a time: `poCreate`, `poNext`, `poRecord`,
`poAdvance`, `poFinal`. **`generatePlayoffs` is now four lines over that
runner**, so there is no bracket that only one path can produce. Two of them
would drift the first time a round was added, and the symptom would be a simmed
season and a played one giving one seed two different brackets.

**Proved byte for byte rather than argued.** The rng is drawn in the old order
(the round's opponent, then its games one at a time), and the two
implementations were run over 4,000 seeds: a `live: false` on every row was the
entire difference, so the flag is written only when it is true. `check-live`
asserts the same thing from the page's side, by simming every game through the
new walk and comparing against `playSeason`.

**`run.po` has no underscore**, which is the opposite of everything else
mid-run on this page. A bracket is the one thing a player can be halfway
through for as long as they leave the tab open, because the door waits for
them. Under an underscore, a reload in the middle of a Finals comes back to a
run with a season, no bracket and no way to finish it. So the runner holds
plain data only: no rng, no player objects. **What `outcomeOf` needs is
recomputed and never stored**, because chemistry, fit and the two ratings are
pure functions of the roster and the totals are a walk over a season already on
the run. A second copy of an answer is how a reload comes back disagreeing with
itself.

**A LIVE GAME DRAWS FROM ITS OWN STREAM**, off the run's seed and the game's
address, exactly as `gameDetail` does and for one of the same reasons: the
run's stream is what every game AFTER this one is drawn from, and playing a
Game 7 for four minutes and then finding the Finals drew a different opponent
would look like nothing at all. So simming every game and playing every game
give the same bracket around them, and only the games actually played differ.
A live game in progress is deliberately NOT resumed after a reload: its sim is
a board mid-possession, and rebuilding one from storage would be a second way
to build a game. The bracket comes back to the door and offers the same game
again.

#### The board, and what makes it smooth

Everything that moves is a transform or an opacity. The score is a scale pop,
the lead bar is one `scaleX` on a full width block, the play rows and the
verdict are keyframes, and the only thing javascript touches every frame is the
text of two numbers and a clock. No width animation, nothing that asks for a
layout on a frame the page is also simulating a possession in. The one layout
read in the loop is the `offsetWidth` that restarts a transition already on an
element.

**The pace is per quarter and the last two minutes are their own thing.** A
game is 198 possessions, so one flat pace is either a twenty second blur or a
four minute sit, and what anybody came for is the fourth quarter. That is the
resolved broadcast's escalation arriving at a live board.

**A CONTROL THE GAME IS WAITING ON GOES ABOVE THE RECORD OF IT.** The call box
and the verdict sit above the play by play, which is capped at 40vh and fills
up all game. That is the football boss battle's own lesson, and the guard
measures the deepest option and the Continue button against a **740px phone**
rather than against its own window.

**The six men's live points are the half a resolved game cannot show at all**:
whose night it is, while it is his. They are asserted to add to the team score
ON THE SCREEN and not only in the engine, and that assertion caught the bug it
was written for on its first run: `livePlay` built the record the page reads
and **dropped `who`**, so the page's `p.who != null` guard was never true, the
six chips sat at zero for a whole game, and the play by play beside them named
the scorer every time. Nothing threw, because undefined is not null.

**A GAME THAT WAS PLAYED KEEPS ITS OWN SHEET.** `gameDetail`'s default is a
decomposition drawn off the game's address, which is the honest answer for 82
games and the wrong one for the two or three somebody sat through: they would
open their own Game 7 from the results table and find a third quarter that did
not happen. So a live row carries its real lines and its real quarters, and
the sheet prints DIFFERENT COLUMNS for it. No minutes, no rebounds, no
assists: nothing in a forward sim counts them, and a column added to match the
other sheet's shape would be the invented-opponent mistake in miniature.

**Three things on this screen were only findable by looking at it**, which is
this repo's oldest lesson arriving at a new page. All three render, read and
sell perfectly well:

- **A one game round is not a series.** The play-in door read `PLAY-IN` over
  `GAME 7`. `need` is 1 there, so both sides are at need minus one before a
  ball is thrown and `elimination` and `closeout` are true by arithmetic. It
  is `Win or go home`, asked FIRST, because either of the other two labels is
  a sentence about a series that does not exist.
- **A double full stop**, because the series line ended in one and the caller
  joined it to the reason with another: "the run is over.. Nothing left".
  `seriesLine` returns null rather than a sentence when there is no series,
  and never ends in punctuation.
- **The play by play read as though it ran backwards.** It is newest first, so
  a row at 0:12 of the first quarter sits directly under one at 11:53 of the
  second, and there was nothing on either to say they were different quarters.
  The quarter is part of the time now.

**`show()` stops the live loop and the bracket walk**, the same way it already
stops the season reveal and for a worse failure. Left running, a live game
plays itself to the horn and RECORDS the result: somebody who pressed the
wordmark in the middle of a Game 7 would come back to a series that had moved
without them. Stopped rather than ended, so the bracket is still at that game
and coming back offers the same door.

**Sim the rest still stops for your calls.** A run lost to a decision the page
made for you is the worst thing this screen could do.

**`window.RTF_LIVE` is published and nothing on the page reads it.** A call
happens in about one game in five and a played game is most of a minute, so a
guard that waited for one would be dark on most runs, which is the unearnable
badge in a different coat. The handle lets `check-live.mjs` put the board into
a genuine last shot and then press the page's own loop: the real sim, the real
tick, nothing about the decision faked. It carries a `resume` rather than
exporting the tick because a caller that has just rewritten the state has a
timer pending on the old one, and every version of this that forgot to clear it
ran two loops at once.

#### Four things about the harness, and each cost a round

**`.opts:not(.pending)` is load-bearing in every walk that drafts.**
`.opts.pending` hides the tile's CHILDREN and sets `pointer-events:none` on the
tile, so the tile itself is a visible box with a size and `waitForSelector`'s
own visibility test passes on a board still mid-spin. A scripted `.click()`
ignores pointer events, so the walk signed off a board nobody could have read,
and `reelBusy` was still true when `sign()`'s own `setTimeout(spin, 240)` fired:
`drawInto` returns at its first line while a reel is moving, so no draw was ever
made and the draft sat on an empty board for ever. `check-board.mjs` had the
same latent race and carries the same fix.

**Wait on the attribute, not on Playwright's idea of visible.** While Sim the
rest is running the page turns a hundred and forty possessions over on
zero-delay timers, and the visibility poller can sit behind that for a whole
thirty second timeout on an element whose `hidden` came off seconds earlier.
Instrumenting it with a polling loop made it pass, which is the tell.

**A driven fixture has to be internally consistent.** Setting twenty seconds on
the clock with a hundred and fifty possessions still to play makes EVERY
remaining possession a last shot, so the board correctly stopped and asked
about all of them and the next section waited for a verdict that could never
arrive. The clock and the possession count are locked together in a real game,
so the fixture locks them too.

**Driving a call consumes the endgame**, so the call cannot be tested in the
same game a pacing section already simmed to the horn. The browser half opens
two runs, and the second one earns its cost twice: it is also the reload test.
For the same reason ONE driven call answers both call questions rather than
two answering one each: Sim the rest is pressed in the same evaluate that sets
the fixture, so the question coming up with the flag already on IS the claim
that a pacing control never takes a decision away. Written as a second
fixture after an earlier call, the game was already over by the time it ran
and the board had nothing left to stop for.

**A walk that waits on the verdict is measuring whether the game happened to
have a decision in it.** Sim the rest stops for a call, which is the design,
so the pacing section timed out on about one run in five and finished in a
second on the rest. It answers them now. The first reading of that failure was
spent on Playwright's visibility heuristic, which was not the fault.

**Starting the next run is a click, not a context.** The first draft of
`findRunWithDoor` opened a fresh browser context per attempt, which reloads and
re-indexes sixteen thousand rows every go, so six attempts was all the file
could afford and six was not enough: the page's own walk takes the first
affordable tile rather than best-available, which misses the bracket often.
Going home and pressing Start again is the same fresh run at a fraction of the
cost, so it can afford to try until it gets one.

#### What the guard asserts, and what was proved by breaking it

The bands in section 2 are **derived from the sample and not typed**: one
standard error on a spread near 9 is `9/sqrt(2N)`, and on the difference of two
independent arms it is `sqrt(2)` of that. `--quick` deliberately does NOT cut
that section, because forty thousand forward games take under two seconds and
cutting the sample bought a second and cost the band its teeth. The seeds are
fixed, so it is deterministic rather than flaky.

Three defects were reintroduced one at a time to prove the file has teeth:
removing the pull blows the spread past the band, the old fixed tick fails the
fit, and **the possession parity assertion has to say EXACTLY equal**. Written
as "within one" it passes on the defect it exists for, because one is not a
rounding allowance there, it is the whole bug.

### The data pipeline

Basketball-Reference is **blocked from the dev sandbox and open from GitHub's
runners**, the same split `scripts/build-register.mjs` documents. So the fetch
cannot be run here, and `.github/workflows/hoops-data.yml` exists to run it.
That workflow file is also on `main`, on its own, because GitHub will not
dispatch a `workflow_dispatch` workflow unless it exists on the default branch.

```
node hoops/build/fetch-nba.mjs --from 1974 --to 2025    box scores, win shares, position, team
node hoops/build/fetch-draft.mjs --from 1960            draft year and college
node hoops/build/fetch-awards.mjs --from 1974           MVP, All-NBA, All-Star and the rest
node hoops/build/fetch-teams.mjs                        franchises (this one DOES run locally)
node hoops/build/build-players.mjs --from hoops/build/raw/nba_player_seasons.json
```

Championships are **not** fetched. `teams.json` already carries every title year,
so `build-players.mjs` hands the ring to everyone on that roster.

Things worth knowing before you change it:

- **A season page carries the PLAYOFF table too.** The scrape must stay scoped to
  the regular-season table, which `seasonTables()` does by table id and document
  order, either of which alone is a silent failure. This shipped once: win shares
  join on player and club, so a finalist's playoff row simply overwrote his
  season, Jordan's 1996 arrived at 4.7 win shares instead of 20.4, and nothing
  failed. `verify.mjs` now asserts the shape of the win-share distribution plus
  six great seasons by name.
- **Never demand a particular way of writing a link.** The draft fetch returned
  zero picks for sixty-six years on four separate runs because the parser wanted
  `href="/players/...`, which assumes a relative origin, a double quote, and
  nothing after `.html`. Six of seven plausible forms fail that. Ask for the
  path.
- **Not every season is 82 games.** 1999 played 50, 2012 66, 2021 72, and 2020
  between 63 and 75 by club. Win shares are a counting stat, so `build-players`
  normalizes each club to an 82 game schedule, or Iverson's 1999 MVP season
  arrives looking like a rotation guard. A club that played 78 or more counts as
  full: in the modern game nobody plays all 82, and treating rest days as a short
  season inflates recent players.
- **Draft year and college are on no season page.** They are chemistry inputs,
  so without `fetch-draft.mjs` the `alma_mater` and `draft_class` links are
  permanently silent rather than wrong. It reads the per-year draft pages (about
  seventy requests) rather than five thousand player pages.
- **A playing-time floor of 12 mpg across 20 games** is applied at build time.
  Without it the wheel spends most of its time on players who appeared in nine
  games, and every visitor downloads three times the file.
- **A title is filed under the club's MODERN code, and a roster is not.** A
  franchise table writes one row of honours per club as it exists today, so
  `WAS` carries 1978 and the 1978 roster is `WSB`; `OKC` carries 1979 and the
  1979 roster is Seattle. Both of those rings joined to nobody and nothing
  failed. `titlesByCode()` in the engine walks each franchise's aliases and
  hands every title year to the record whose own lifetime contains it.
  `verify.mjs` asserts that every season in the data has a champion in it, which
  is what catches this class of miss. 2024 was simply absent from the table.
- **A club's published hex is not usable on the page.** The reels take the
  drawn club's colors, and San Antonio's black, Brooklyn's black and every navy
  are within a hair of `#0d1117`. `wheelColors()` floors each color into a range
  that shows, then lifts the band by MEASUREMENT until it clears the fill,
  because HSL lightness is not brightness: the original Hornets' purple at
  lightness 55 is darker than their teal at 26 and came back at 1.16:1. All 45
  franchises are asserted in `verify.mjs`, because the way this breaks is that
  somebody corrects one club's hex and three others go dim without either being
  the club they were looking at.
- **Hardware is decoration and that is why it needs asserting.** The engine
  never reads `aw` and no rating moves for it, so a wrong award can sit there for
  a year without a single number looking odd, and the failure mode is telling a
  visitor something false about a real person. `verify.mjs` checks the codes, the
  prestige ordering (the page shows the first entry as the best and ranks
  nothing itself) and every ring against `teams.json`.
- **`hoops/data/teams.json` is a second source** (the static franchise table in
  `nba_api`) joined on the team code. NBA.com and BBRef disagree on three codes,
  and BBRef's `CHA` is the **Bobcats** while `CHO` is the Hornets, which is a
  different club rather than an alias. `check-posture.mjs` asserts every team
  code in the player data has a franchise row, because that join fails silently.

The fetch has now run. `hoops/data/players.json` holds **16,057 player-seasons
from 1974 to 2025**, 14,612 of them with a draft year and 13,109 with a college.
If it ever holds 171 rows again, the game has fallen back to
`hoops/build/seed-rosters.mjs`: values entered from memory and rounded, which
must never be shown to a player as a fact about a real season. The dev banner
said so and has come off, because saying it now would be false in the other
direction.

### TWO NUMBERS ABOUT TIME, AND BETWEEN THEM A GAME THAT STAYS A SEASON BEHIND

A season is named for the calendar year it ENDS in, so 2026 is 2025-26. Both
places that number is decided were stale in the same direction.

**The workflow's `to_season` was the literal 2025, three times.** A SCHEDULED
run passes no inputs, so the annual July refresh would have asked for 2025
every year: it fires, re-fetches the fifty-two seasons it already has, reports
"data unchanged", and never adds the new one. A green run, a correct-looking
log, and a game a year behind the sport. It is computed now, in its own step,
from the rule that the Finals are over by the end of June.

**And `fetch-teams.mjs` demanded champions only up to LAST year**, which is
right in March and wrong from July onwards. Read in September 2026 it reported
every season from 1974 to 2025 complete while 2026 had no champion at all and
the upstream table had not caught up: six months of every year in which a
missing title was invisible to the one check written to find it. Same July
cutoff now, which is also why the cron fires on the 5th of it.

**`SUPPLEMENT` is where the answer goes and it is not a workaround.**
nba_api's static table is generated upstream on somebody else's schedule and
lags a season; it lagged for 2024 and it lags for 2026. New York over San
Antonio, and it is the Knicks' first title since 1973, so every other year on
their card is out of this game's range and 2026 is the only one a player will
ever see.

**A refresh now bumps what it invalidates.** A pool caches exactly like a
script, and this workflow is the one writer that cannot do the bump by hand:
everywhere else the edit and the bump are one commit by a person, here a bot
rewrites 3.6MB once a year and nobody is watching. It moves the `?v=` of
whatever `git diff --quiet` says actually changed, so a refresh that finds no
new basketball moves no number, and it commits `index.html` and
`scripts/cachebust.json` alongside the data.

### The link block, and the one number that goes stale without an edit

```
(nohup python3 -m http.server 8080 &) ; node hoops/build/og.mjs
```

**A link to this game was a bare grey rectangle.** No `og:image`, no
`og:title`, no card, while the daily's whole loop is a share. `og-source.html`
renders to `og.png` at 1200x630 in the game's own language, and the build is
`cfb/build/06-og.mjs`'s whole lesson inherited: fonts curled and inlined as
data URIs because Chromium here reaches the network only through a CONNECT
proxy and the page's own `<link>` arrives empty, and a refusal to write if a
display face is missing, read off the loaded FontFace set rather than
`document.fonts.check()`.

**The ball on the card is `hoops/logo.png` at exactly half size**, so each of its
22 pixel cells lands on 11 and the pixel art stays crisp. The build waits for the
image and refuses to write a card without it. **The tags go in while the page
is still noindexed**, deliberately: a robots tag tells a crawler not to index
and does nothing to a chat app unfurling a link somebody was handed, which is
how an unlaunched game reaches its testers.

**And the card is COPY.** It is a PNG: rendered once, never interpolated, so a
cap that moves leaves a picture promising the old one with no page to fix it
and no reader who can tell. `og-source.html` is on verify's prose guard, which
is the same argument that put cfb's og build script on `check-copy`'s list.

**`#home-era` is the one claim on these pages that goes wrong without anybody
editing anything.** It is interpolated from the pool on load, so "1974 to 2025"
in the markup is what a reader sees for the moment before the data arrives, and
for as long as it does not. The annual refresh adds a season and leaves it a
year out, while the number that replaced it at runtime is right.

**It reads the ELEMENT and not the prose**, and the first draft did the other
thing. A bare "NNNN to NNNN" means several things here: `how-to-play.html`
lists the seven era bands, and 1980 to 1986 is a correct sentence about the
eighties. Scanning for the shape reported all seven as defects, which is the
trap that kept "times" and "players" off the roster-count noun list.

### The logo is an 8-bit ball, and every size is a whole multiple of one grid

```
node hoops/build/logo.mjs     the favicons, the icons, the mark, the wordmark and the lockup
node hoops/build/og.mjs       the share card, which uses logo.png (needs :8080)
```

`hoops/build/logo-art.mjs` is the drawing, as a grid of cells built from a few rules:
a one cell outline, an upright seam and a level seam through the middle, two side seams
that step out once near the rim, and light cut into diagonal bands off the top left.
`logo.mjs` lays it out at every size, under the football game's file names.

**THE GRID IS ODD.** The first draft was 20 cells, which has no middle column, so the
upright seam sat a cell right of centre and the ball leaned. 21 for the mark and 15 for
the favicon are symmetric.

**EVERY SIZE IS A WHOLE MULTIPLE OF THE GRID, AND THE SHADOW IS ONE CELL.** A pixel ball
scaled by 1.3 has cells one and two pixels wide at random, which reads as a rendering
fault. So `favicon-16` is fifteen cells and a one pixel shadow, 32 and 48 are that at 2x
and 3x, and `mark.png` is the 21 cell ball at 1x (22px with its shadow), drawn at 22 CSS
pixels in the top bar with `image-rendering:pixelated` so a phone scales it by 2 or 3.

**THE NAME IS SET IN PRESS START 2P, and only the name.** The top bar, the home title,
the rules page's title and the share card. It is drawn on an 8 pixel grid, so it is set
at multiples of 8 (the top bar's 10px is the one exception, measured to fit a 360px bar
beside the Career button). `--pixel` falls back to the display face and **never to a
monospace**, because `verify.mjs` keeps a code face off these pages and a fallback stack
ending in `monospace` fails it. Paragraphs stay in Archivo: a sentence in the pixel face
is hard to read on a phone.

**Google Fonts does not load in the sandbox**, so a screenshot of the page shows the
fallback. Inline the face with `addStyleTag`, the way `og.mjs` does, before judging the
title by eye.

### Arenas, the three-quarter camera and the Locker

```
node hoops/check-arenas.mjs          the catalogue, the art, the rules, the page
node hoops/check-arenas.mjs --quick  no browser
```

Asked for: profiles like the NFL and MLB games, courts you unlock like baseball's
ballparks, a three-quarter view of the court, and arenas with scenery.
`hoops/courts.js` is `baseball/parks.js`' shape. Thirteen arenas, each a nod to a
kind of place (a parquet floor, a chain-link blacktop, a beach court, a gym with
pull-out bleachers) and **none named for a real arena or carrying a real logo**.

**Unlocks are derived, never stored.** The one stored thing is the choice, on the
account's profile row (below). `currentArena()` is the one answer and
`arenaChanged()` forgets it on every event that can move an unlock: a run filed, a
feat, a cloud pull, a change of account, Pro.

#### Everybody starts on the Blacktop and climbs to the league

Asked for by the owner: all users start on the blacktop and work their way to the
professional arenas by completing achievements and being a dedicated player for a
long period of time. `ARENAS` in `courts.js` is that ladder, in order:

| tier | arenas | a rung asks for |
|---|---|---|
| Streetball | Blacktop (free), Boardwalk, Rooftop | 5 runs and 5 badges, then 15, 10 and 3 days |
| Rec league | Rec Center | 30 runs, 18 badges, 5 days |
| College | Fieldhouse, Altitude | 50 / 25 / 8, then 75 / 32 / 12 |
| The League | Hardwood, Parquet, Sunset Hall | 100 / 40 / 15, 150 / 50 / 20, then 200 / 60 / 30 and a ring |
| Hall of Fame | Cathedral, Banner Hall | 300 / 75 / 45 and 3 rings, then 500 / 90 / 60 and 5 rings |
| Pro | Neon Court, The Glass | Run The Floor Pro, off the ladder |

**Every rung asks for three kinds of thing at once**: runs played, badges earned
and DIFFERENT DAYS played on. The badges are the achievements; the runs and the
days are the dedication, and the days are the half that cannot be done in one
long evening. The top three rungs want rings as well. The rule is written as data
(`reqs`) and turned into the card's sentence by `ruleText`, so the words cannot
drift from the numbers, and a locked card lists each part and how far along it is.

**`career.days` is new and it is a map**, `{ 'YYYY-MM-DD': n }` on the Eastern date
the daily already uses. `stampDay` in the page counts a run on its day and stamps
the day (counting nothing) when a mode files a feat, since Conquest files one after
every steal. **It is on `CAREER_COUNTS` in `cloud.js`**, which moved to API 4, or a
second device would drop every day played on merge. Careers from before this have
no days, so the count starts from the day this shipped. That is the one rule on the
ladder that is not retroactive, and it is the one that measures time.

**A guest, a fresh account and a choice the account cannot back all land on the
highest rung reached** (`CT.best(info)`), which is the Blacktop on day one. With no
choice made an account plays on its highest rung, so climbing shows up on the
court without a trip to the Locker. The old ladder handed out the Hardwood free and
most arenas off one feat; an account that had climbed that ladder keeps nothing it
has not earned on this one, which is fine on an unlaunched preview and would need
a legacy rule (baseball's `LEGACY_UNTIL`) the day the game launches.

`check-arenas` holds the ladder to itself: every rung asks at least as much of
everything as the one below and more runs, the league rungs want 100 runs, 40
badges and 15 days or more, and one run, badge or day short of a rung keeps it
shut. Section 10 plays a Conquest game on a third day and waits for the Rooftop's
toast.

**The floor is its own layer now.** `.court` is the building (`--wall`) and
`.court .floor` holds the seven layers, with the boards' three repeating layers
as custom properties (`--tone`, `--seams`, `--grain`) so a surface (`parquet`,
`asphalt`, `court`, `glass`) swaps those three and nothing else. Every colour is a
property with the home arena's value as its fallback, handed to the court inline
by `floorVars()`. The club wash still sets `--floor-tint` on `.court` and it
inherits down. verify.mjs reads the floor rule at `.court .floor{` for that reason.

**THE TILT IS ONE ANSWER IN TWO PLACES.** The floor is tilted by CSS
(`perspective()` in `cqw`, `rotateX`) written from `CT.TQ`, and the five spots are
placed by `CT.project()`, the same perspective as arithmetic. The spots are NOT
inside the tilted layer on purpose: text in a rotated plane is foreshortened and
soft, and a name is the thing on a court that has to be read. check-arenas drops a
marker onto the tilted floor under each spot and holds the two to 1.5px, the hoop
to the rim's point, and the scene's foot to the far baseline. Breaking the
projection's scale puts every spot 25 to 27px off.

**A scene is fitted by its HEIGHT** (`xMidYMax meet`, overflow visible) and every
backdrop runs from x -200 to 300 of a 100-wide box, brick and block as patterns so the width costs no elements. Cropped from the bottom
instead, a phone's thin strip above the floor showed only crowd and the banners,
windows and skyline that say which arena it is were off the top.

**The surround is a box-shadow on the tilted floor**, offset down by its own
spread, so it covers the wedges beside the far end without rising into the
building.

#### The lines are a regulation half court, drawn in feet

Asked for with a court diagram poster as the reference. The lines used to be seven
CSS boxes placed by eye, and three of them were wrong in the way a fan sees at once:
the three point arc was one ellipse that ran through the half court line, the free
throw circle hung under the lane as a whole ring, and there were no sidelines, hash
marks or center circle.

`courts.js` draws them now (`COURT`, `SHAPES`, `lines()`), in feet: the rim 5.25 ft
out, the corner three 3 ft in and straight for 14.2 ft to where the 23.75 ft arc
meets it, a 16 ft lane to the line at 19, the free throw circle solid toward half
court and dashed in the lane, the 4 ft restricted area, the block and three marks
up each side of the lane, the 28 ft marks across both sidelines, and the half court
line with its 6 ft and 2 ft circles. `FRAME` is how those feet sit in the floor box:
2 ft of apron each side, 1 ft behind the baseline, and half court 80% of the way
down, where the five spots were always laid out. The lane takes `--paint1`, the
center circle `--paint2`, the apron `--apron1` and `--apron2`, and a club takes the
lane and the circle.

- **One SVG, stretched with `preserveAspectRatio="none"`, and the stroke does not
  stretch** (`vector-effect: non-scaling-stroke`), so a line is the same weight on
  the square home court and the flat draft court. A circle is round only where the
  box is the right shape, and the three-quarter camera foreshortens it anyway.
- **The same `SHAPES` draw the shelf's thumbnails**, through a trapezoid map, so the
  floor and the Locker cannot disagree about a line.
- **Each court's apron gradient carries that court's id.** A gradient defined in a
  court on a hidden screen does not paint for a court on a showing one.
- **The rim moved with it**, to 5.25 ft (`CT.RIM_PCT`), and the standing hoop and
  check-arenas' marker both read that rather than a written 7%.
- **A blocked `courts.js` now means a floor with no lines.** The page keeps no second
  copy of the geometry, because two copies of a court drift.

check-arenas section 1c asks the geometry as properties (the corner meets the arc,
the arc is round about the rim and tops out at 29 ft, the circle is split the right
way, both 28 ft marks exist) and section 6 that all three courts carry the lines at
a weight that does not stretch. Reintroducing an arc that reaches half court fails
two claims.

**The camera is on the profile too**, three-quarter by default,
Overhead in the Locker. Overhead is the old flat court exactly: no tilt, no scene,
spots at their flat points.

**The Locker** is the Career sheet's third tab: your jersey, the camera, and the
arena shelf. The jersey is a club colorway and a number, stored on
the account's profile row. **A club's colors are earned by playing One Franchise
with that club** (`career.byClub`), the football crest's rule; the house colors
are everybody's and Pro wears every club. The identity row at the top of the sheet
wears it. A results screen names an arena the run opened (`o-arenacard`), and a
mode that opens one says so in a toast after its badge.

### Everything a signed in player chooses or plays is on the account

```
psql ... -f supabase/129_hoops_profiles.sql                the profile row, deploy by hand
psql -d rtf_prof -f supabase/test/hoops_profile_test.sql   (its header lists the chain)
node hoops/check-arenas.mjs      section 11: read on sign in, written on every choice
node hoops/check-cloudsave.mjs   the mode slots, two real devices
```

The owner's rule, in as many words: attached to the profile and the server, not
the device. Two stores, for the two kinds of thing.

**What the player CHOSE is `rtf_profiles`** (129): the jersey club and number, the
arena, the camera, the last One Franchise club and decade, and whether the guide
has been seen. One row an account, **public to read** so a board can draw
somebody's jersey, written only through `rtf_set_profile`, where null means leave
it alone and the empty string clears. `hoops/auth.js` has `getProfile` (null is no
opinion, `{}` is no row yet) and `setProfile`. The page writes on every choice
(`profileSend`) and reads on every change of account (`profilePull`), where **the
server's answer wins**, and a choice the server has never heard of goes up on the
way in. The per-device keys (`rtf.cam.v1`, `rtf.club.v1`, `rtf.era.v1`,
`rtf.guide.v1`) are claimed only when the browser is this account's, by the cloud
save's owner rule. The server checks SHAPE and not whether an arena or a club is
earned, the same trade 127 and the NFL crest make: the page falls back for
anything the account cannot back, so a forged choice changes only its own screen.
**Without 129 it fails soft**: every choice still works, cached in the browser,
and goes up the first sign in after the migration is run. Preflight row 40.

**What the player PLAYED is the shelf** (`ps_saves`, 103, game `rtf`): the career,
the run and the daily as before, plus **every mode's record as a slot of its own**
(`MODE_KEYS` in `hoops/cloud.js`): `cq`, `cqbest`, `fix`, `fixrun`, `fixend`,
`passes`, `psend`. No migration: slots are free-form. Two kinds:

| kind | slots | two copies become |
|---|---|---|
| merge | `fix`, `passes`, `cqbest` | the union of days (a finished Fix day keeps the shelf's; a Six Passes day prefers finished, then the longer chain), the larger of each best |
| clock | `cq`, `fixrun`, `fixend`, `psend` | whichever was written more times |

**The clock is a counter of writes**, kept per slot in `rtf.rev.v1` and taken from
the shelf on every pull, so it is shared across the account and never a device's
wall clock. A tie goes to the shelf, so two devices that never wrote after this
shipped agree on one copy. A clearing is a write (`{ rev, v: null }`), or a stale
device puts the old run back. Every payload is `{ rev, v }` with `v` exactly what
the browser keeps. **modes-ui's `lsSet` and `lsDel` are the one hook**: any key on
`MODE_KEYS` goes up on write, a refused write adopts what the shelf holds, and a
record is never swapped out from under the screen playing it. cloud.js moved to
API 3 with this, so a cached page cannot run a shelf it does not know the slots of.

**A guest's records stay in the browser** because there is no account to put them
on, and they go up with the first sign in. That is the one thing left on a device.

**`RTF_PAGE.arena.force(id)` is the checker's alone**, like `window.RTF_LIVE`:
nothing on the page calls it.

### The board is in the preflight now, and the helper under it could only say NO

Run The Floor's leaderboard was in no preflight. Its board fails soft the way
every board here does, so an undeployed migration is **indistinguishable from a
network that is down**: every call in `board.js` resolves to null, the screen
says not reachable, and it says that for ever while the game plays perfectly,
the run records in the career and the badges light. There is no state a player
can tell the two apart from.

**Writing the row found the trap under it.** `has_table` in
`launch_preflight.sql` reads like a general helper and is an ALLOWLIST of
eleven names, so a row naming a table missing from it finds nothing and reads
false against a database where the table is sitting right there. The first run
said NO with `rtf_runs` and all four functions loaded. **A preflight row that
can only ever say NO is worse than no row**, because it tells a correct
database it is broken and teaches everybody to ignore the column.

**108 twice is not a typo.** `108_hoops_leaderboard` and `108_dynasty_slot`
were written for two different games in the same week and touch nothing in
common.

### The career belongs to the account, and a career MERGES where a run does not

```
node hoops/check-cloudsave.mjs           the merges, then a real second device
node hoops/check-cloudsave.mjs --quick   the merges only, no browser
```

The run, the career and the daily were all in localStorage and nowhere else,
which `supabase/103_cloud_saves.sql`'s own header already lists five ways of
losing. What makes it worse here than in the football game is that **every
badge in `badges.js` is DERIVED from the career**, so a second device or a
cleared jar is not a missing number, it is an empty cabinet somebody spent
weeks filling, with nothing on screen to explain it.

**IT NEEDED NO MIGRATION.** `ps_saves` is keyed on (user, game, slot) with
`game` a free-form text column, so `rtf` is a value rather than a schema
change. 103 is already deployed, so there is nothing new in the preflight and
nothing to deploy by hand: the one shape of failure this whole section usually
warns about does not exist here.

`/assets/cloudsave.js` is the TRANSPORT and is shared with the football and
college games; `hoops/cloud.js` is this game's POLICY. Only the game knows what
further along means, which is 103's own argument, and only the game knows what
a career is.

**THREE SLOTS, one `ps_save_all` on boot.** The run, the career and the daily.
**The preferences stay local** (the last club, the last era, whether the guide
has been seen): each is worth one tap, none is worth a round trip, and a
remembered club following somebody to a second device would be slightly wrong
anyway, because it is a fact about the browser they drafted in.

#### A football dynasty is one run at two points. A career is not.

Progress-wins is the whole answer for a dynasty: two devices are at different
points of ONE run, and more play is never the wrong thing to keep. **Two
devices can each hold runs the other has never seen.** A laptop plays five, a
phone plays three, and neither is behind the other. Run the progress rule over
that and the phone's three are deleted by the laptop's next save, which is the
exact failure this exists to stop, arriving by the door built to prevent it.

So the career and the daily MERGE, and the merge has one property everything
else is built to protect:

> **A MERGE MAY NEVER TAKE A BADGE AWAY.**

Every badge is a `>=` over a counter, a count of distinct keys in a map, or a
question about the rows. So scalars take the MAXIMUM, maps take the union with
the maximum per key, and rows take the union. All three only grow. That is
**checked as a property over the real catalog** rather than trusted: 220 pairs
of random careers, and the merged cabinet has to be a superset of both. **The
sweep asserts it is not vacuous**, because a fuzz that lit nothing would prove
the empty set is a superset of the empty set.

**A COUNTER UNDER-COUNTS, AND THAT IS CHOSEN.** Five runs on a laptop and three
on a phone merge to `runs: 5`, not 8, because a maximum is not a sum and a sum
would double every time the same two careers met again. Exactness would mean
deriving the count from the rows, and the rows are capped at 250 while the
count is not. **Under-counting is the safe direction**: it can delay a badge
and can never hand one out that was not earned. Anybody swapping the maximum
for a sum should read that sentence and then the idempotence assertion.

#### A row had no identity, and without one the merge doubles it every boot

A career row is a compact line of numbers about a finished season and carried
nothing to tell it from another one. Merged without an identity, **every row on
the device doubles on every single boot**.

New rows carry `id`, the run's own seed. Rows already on a device have none and
fall back to a key built from their CONTENTS, so two genuinely identical runs
collapse into one row: one line of evidence lost on a coincidence, which is the
same safe direction as the paragraph above. **No version bump**, because
`loadCareer` accepts version 1 and nothing else and raising it would throw away
every career on every device. That is `recordRun`'s own rule about new fields.

**`id: undefined` IS A SEAM AND IT IS NOT OBVIOUS.** The literal writes the key
whether or not there is a seed, and `JSON.stringify` drops it, so a row keyed
one way in memory and another way on the wire would be held twice by a union
that is supposed to be idempotent. `rowKey` skips undefined values, and the
guard asserts the key is the same either side of JSON.

#### Two accounts on one browser is a DISCLOSURE, not a lost save

Merging turns 103's fifth failure into its opposite: sign in as somebody else
and their cabinet quietly adopts the runs, the rings and the streak of whoever
used this browser last. Neither record is true afterwards and nothing says so.

So the browser records whose copy it is holding, in `rtf.owner.v1`, which never
leaves the device. Nobody's is MERGED, which is claiming a signed-out career
the way the leaderboard already claims a finished run on the way in. The same
account is MERGED. **Somebody else's is REPLACED**, with the account's own copy
or with nothing.

**IT DOES NOT APPLY TO THE RUN, deliberately.** A draft in progress makes no
claim about who did what, is on no board, and nothing is derived from it.
Signing in part way through one means that draft is now yours on this account.
Clearing somebody's half-finished draft because they changed accounts would be
this file destroying a run rather than keeping one.

#### The copy said the career was private, and it had been true for a year

The profile sheet read **"Stored in this browser only"** and **"nothing here is
sent anywhere"**. A page telling a reader their record is private while it is
on a server is the worst kind of stale copy, and it is the exact class this
repo already has a checker for: a sentence that goes wrong without anybody
editing it. `renderCareerNote()` writes it off whether there is an account, and
**`clearCareer` deletes the shelf row too**, or the next pull merges it
straight back and the button appears to do nothing a moment later.

#### Three rules the page runs on, and each has a failure that renders perfectly

- **Local first, never awaited.** `save()` is called on every signing, every
  re-spin and every round of the bracket. The upload rides behind through the
  transport's per-slot queue, so a draft signing five men in a minute sends the
  state as it stands when the wire is free.
- **`startRun` DROPS BEFORE IT BUILDS.** A fresh run is progress zero, so a put
  over a stored bracket is refused, and the refusal is silent: this device goes
  on drafting while every boot anywhere resumes the run just abandoned. The
  guard reads the source for the ORDER and drives it as well, and the stand-in
  keeps 103's refusal so removing the drop actually fails.
- **A run is adopted only on the front page.** Replacing `run` under somebody
  who is drafting swaps the game out from under a decision they are making. The
  answer lands after boot has finished, so the test is what is on screen at that
  moment rather than what was on screen when the request went out.

**THE SEASON HAS NO WITHIN-PHASE PROGRESS AND THAT IS NOT AN OVERSIGHT.** The
reveal lives in `run._simState`, which holds the rng as a function and does not
survive JSON, so a restored season restarts its own reveal. There is nothing
stored to measure. **Every phase the game has needs a rank**, though: one
missing from the ladder silently ranks zero, so a bracket would compare equal to
an empty draft, and the way that arrives is somebody adding a phase to `run.js`.
The guard reads `R.PHASES` rather than a list of its own.

#### The push moved out of `dailyRecord`, because verify.mjs LIFTS that function

`verify.mjs` brace-matches `dailyRecord`, `bestsSet`, `freshBadges` and four
others out of `index.html` and drives them in node, never a copy of the
arithmetic. So a page-level call inside one of them is a ReferenceError in a
suite that has nothing to do with the shelf, and it shipped that way for one
run. `dailyPut` is the other tempting hook and is worse: the pull writes a
merged record through it, so hooking the setter queues that write and then
queues the pull's own settle behind it, two round trips carrying the same
bytes. `recordRun` is the one caller that is neither, and the guard asserts the
push is NOT inside the lifted function.

#### What the harness got wrong, twice, and both were the harness

- **The draft helper always pressed Start.** So the walk meant to carry an
  ADOPTED run further quietly began a fresh one: the shelf then held a two man
  draft where the assertion above it had just asked for a full one, and the
  failure landed two steps later as a device that would not adopt. Pressing
  Start is a parameter now, never a default.
- **A wait that times out names a line number.** Waiting for an adopt that never
  comes is indistinguishable from every other way this feature fails, so both
  waits are allowed to lapse and the assertion under them reports what the page
  was actually holding, plus the progress the shelf held. Reintroducing the
  ownership defect went from a stack trace to `expected null, got 11`.

**`window.RTF_SYNC` is published and nothing on the page reads it**, which is
`window.RTF_LIVE`'s own argument: the pull is fired by a change of account,
that needs a live supabase client, and a save test has no business loading one.
**Nothing else goes on that object.** Starting a run, abandoning one and opening
the cabinet are all buttons, and a guard that presses the button is testing the
thing a player does.

**The transport honours `RTF_BOARD_URL` as well as `PS_BOARD_URL`, and that is
a safety rule rather than a convenience.** Each game stubs its own board under
its own name, and a page whose board is pointed at a stand-in while its SAVES
still go to the live project is a checker writing real rows on somebody's
account. Redirecting the board redirects the shelf with it.

### The wardrobe, the closet and the coins (the economy port, Phase 1)

```
node hoops/check-economy.mjs     the ledger: keyed, merged, the day rule, what a career pays
node hoops/check-wardrobe.mjs    every item drawn on every build and pose, and never on a real man
node hoops/check-closet.mjs      what he owns and wears, two devices, the closet on a phone
node hoops/check-earn.mjs        who earns coins, from what, and only once
node hoops/check-idles.mjs       every idle frame inside the grid, every loop closes, the page plays it
node hoops/check-packs.mjs       odds, pity, shards, the exchange, two devices, the shop on a phone, the show
node hoops/check-shopart.mjs     every item, pack, coin and shard in pixels, nothing clipped
node hoops/check-daily.mjs       the streak, the login track, the wheel, the quests, Floor Rep
node hoops/check-pass.mjs        the Floor Pass: the clock, the curve, the cap, claims, settlement
node hoops/check-card.mjs        the player card: its pieces, the 140 shapes, the boards
psql ... -f supabase/139_hoops_wardrobe.sql   deploy by hand (preflight row 53)
psql ... -f supabase/140_hoops_card.sql       after 139 (preflight row 54; its test is hoops_card_test.sql)
node scripts/stripe/check-floor-money.mjs    real money, shipped dark: the switches, checkout, webhook, cover()
psql ... -f supabase/141_hoops_wallet.sql     paid coins (row 55), and 142_hoops_pass.sql the pass (row 56)
```

`hoops/design/ECONOMY.md` is the plan and the record. What bites:

- **The garments are drawn in `baller.js`**, not a file beside it, because the figure is
  painted in a worker that loads `baller.js` alone. A new colourway is a row in
  `catalog.js`; only a new shape needs art. Only the invented player is dressed:
  baller.js drops `wear` and `cwear` for a faceless figure, and under a suit or the cap.
- **Two looks.** Off court (`ctx: 'street'`, `wear`) in the rooms `STREET_ROOMS` in
  scenes.js names; on court (`cwear`) over the uniform everywhere else.
- **The account owns the wardrobe** (`rtf.ward.v1`, the shelf's `ward` slot) and the coins
  (`rtf.wallet.v1`, slot `wallet`), both merge slots in `cloud.js` API 6. Owned is a union,
  a look is the later choice. 139 puts the two looks on `rtf_profiles` so a board can draw
  them; re-running 129 after it leaves two writers, which is why 129 drops the wider one.
- **A coin is a keyed ledger entry**, so every caller may ask often and each key pays once.
  Only a signed in account earns (`earn.js`). Badges held at the first settle after a pull,
  and seasons a career had already played, are MARKED at nought (`economy.js mark`,
  `baseline`), never paid in a lump. A mark merged against a payment keeps the earlier
  entry, so a device can only ever pay less. Marks are never folded away by `compact`,
  because a folded key would be paid a second time.
- **Coins are said in their own pill**, not the page's toast: a mode toasts in the same tick
  and the toast is one element.
- **An idle is keyframes on the rig, handed to the worker as data** (`hoops/idles.js`,
  paint's `fr` option, read by `frOf`, which draws the standing figure for anything that is
  not a frame). It is worn in an `idle` slot in both looks and is never wear: `resolve()`
  skips it, and `wardrobe.js idle()` turns it into paint options, the look's default (the
  old breath or dribble) when he does not own the one equipped. A straight blend between a
  hanging and a raised arm holds it out level and the hand leaves the grid on a big man, so
  the in-betweens bend at the elbow; check-idles paints every frame on four bodies and fails
  on any part at the edge. A loop is at most 12 painted frames.
- **Packs, shards and the exchange are keyed logs on the wardrobe record** (`po` opens,
  `pc` free packs, `sg` shard grants, `sx` exchanges; `hoops/packs.js`). Pity, the shard
  balance and the unused free packs are derived from them, never stored. A coin pack is
  spent under `pk:<open>` (a bundle `pkb:`), a free pack is opened under `c:<credit>`, so
  two devices file one open. A duplicate gives a shard always and coins back only when it
  was bought. `RTF_WARD.shop` is the one door that touches both records; the shop screen
  (`shop-ui.js`, the Look sheet's Shop tab) only presses it. **Every piece is pack only**
  (the owner's call, 2026-10-12): `shop.buy` answers `packonly` for everything, and a
  tried on piece names the best pack and the odds of one open (`packs.js chance`, the
  arithmetic `open()` rolls), with a button to the packs. The Locker's banner, its
  front page key and the closet stage are drawn in the pack art's light. settle()
  gives the welcome Streetball Pack (credit `welcome`) once an account.
- **An open is decided before it is shown.** The press spends and rolls; then the show
  plays over the whole screen (`.sh-ov`, appended to `body`): the pack on its stand, the
  tear, a reel that slows onto the item already won, the reveal. The reel's winning cell
  carries `data-win` and IS the granted item; check-packs reads it against the newest `po`
  row and against the cell under the pointer. Reduced motion lands on the reveal.
- **Every icon is drawn from the catalogue row** (`hoops/itemart.js`, `RTF_ART`): the
  item's shape key picks a 16 cell mask, painted in the row's own colours with PXHD's
  light and an outline in the shape's own dark. A new colourway has an icon the day it is
  written; a new shape key falls back to its slot's mask. The packs are Run The Tour's
  foil pillow redrawn with a ball, a hoop, a trophy and a star. A mask must fit 14 cells
  or the light and the outline clip it (check-shopart counts the cells placed).
- **The player card is `card-ui.js`** (`RTF_CARD`): his backdrop, his number, the man in his street
  look and idle, his nameplate, and a frame in his Floor Rep metal; a tap flips it. Nameplates and
  backdrops are catalogue rows in the street loadout (slots `plate` and `bg`), drawn in code from a
  design key, and `CAT.NOWEAR` keeps them and the idle out of `resolve()`. Who he is is the career in
  progress or the newest finished one; an account with no career has no card.
- **139 refused every loadout with an idle in it**, so a player went undrawn on every board from
  the day he picked one. 140 widens the slot lists and adds `player`; against 139 the page sends the
  loadout again with only the clothes (`wardrobe.js wearOnly`). Re-running 139 after 140 stops on a
  stored idle: re-run 140 instead.
- **A board row filed by an account draws his player** off `player` and `wear_street`, a few a
  frame, and a tap opens his card without opening the row. A guest row and a row with no player keep
  the jersey. The read asks for the two columns and asks again without them on a 400.
- **Real money is built and OFF** (`hoops/design/ECONOMY.md` section 9, the runbook is
  `functions/api/stripe/README.md`). Each switch is written twice, `_bundles.js` for the
  server and `economy.js BUCKETS_ENABLED` / `pass.js PASS_PAID_ENABLED` for the page, and
  check-floor-money fails if they disagree. A bought coin is never in the page's ledger
  until spent: `RTF_WARD.shop.covered` tries a press, moves exactly the shortfall off the
  server (`rtf_wallet_spend`, keyed) when it is short, and tries once more. **On sale is not
  owned**: `PASS_PAID_ENABLED` draws a buy button, and only the `rtf_pass` row (or a
  tester) opens the premium lane.
- **The daily loop is six more keyed logs on the wardrobe record** (`hoops/daily.js`:
  `dp` days played, `dl` days opened, `dw` spins, `dg` banked spins, `de` quest events,
  `db` Coin Rushes), merged with it. The streak, its freezes (earned at 7, 30 and 100,
  three at most), the spins left, the quests done and the rush are read off them. A
  reward is paid under its key (`sw:<day>`, `lg:<day>`, `wh:<spin>`, `qd:`, `qw:`), so
  two devices pay once. earn.js files the events: a Daily Draft, Fix History or Six
  Passes finished is the streak's day; settle() is the login day. `RTF_WARD.daily` is
  the door and every call through it (and every shop call) settles the quests.
- **A Coin Rush doubles what PLAY pays** (`PLAY_SRC` in earn.js), never a badge or a
  quest. It stands in for Run The Tour's XP boost; the Floor Pass reads base coins, so
  a rush never speeds the track.
- **A wheel spin is decided before it turns.** `daily-ui.js` sets `spinning` BEFORE it
  calls `D.spin`: the spin's own update redraws the hub, and set after, the wheel turned
  on a detached copy (check-daily caught it). The wedge under the pointer, the `dw` row
  and the prize card are one prize, and check-daily reads all three.
- **The Floor Pass is three more keyed logs** (`hoops/pass.js`: `fx` XP keyed on what
  earned it, `fc` claims, `fq` seasons the premium lane was open). Sixty Eastern days
  from `EPOCH`, sixty tiers on Run The Tour's curve (800 to 2,000, about 84,000 XP).
  Play and badges give 0.13 XP a coin off the BASE coins (a Coin Rush doubles coins,
  never XP); a quest gives its own XP (`QUEST_XP`), read off the ledger key that paid it.
  **The 2,100 a day cap is applied when XP is READ**, per Eastern day, so two devices
  that each earned a full day offline still count one day. A tier is paid under
  `fp:<season>:<tier>:<lane>`. When a season ends, what was reached and not claimed is
  paid (the premium lane only if `fq` says it was open), and logs two seasons back go.
- **Season pieces are exclusives** (catalog.js `pass: n`, `earn: 'pass:n'`), so they are
  never sold or packed. A season is a `SEASONS` row naming its pieces by tier and lane;
  a season with no row pays the base lanes and nothing to wear, so author the next one
  before it starts. The premium lane ships dark (`PASS_PAID_ENABLED` false); a tester on
  `PRO_TESTERS` is comped it so it can be seen working. The Floor Pass is not Pro.
- **`pass-ui.js` draws it**: a banner under the daily strip, the track over the whole
  screen (his own player tried on in the tier 60 pieces, sixty tiers across, the free
  lane over the rail and premium under it), and an XP pill and one tier card however
  many tiers a press crossed. No pop fires over the open track.

### One material, one lane, and the shop from anywhere

```
node hoops/check-polish.mjs     the lane, the coin pill, the Locker, the close keys, one material
```

Asked for by the owner: bring the game up to Run The Tour's UI, simple in layout and
expensive in feel, in the pixel art's own language.

- **Every pop goes in one lane** (`RTF_KIT.lane()`). Coins, a streak day, Pass XP and a
  tier each used to place itself at its own fixed height, so two at once sat on each
  other and on the open sheet's title. The lane stacks them under the top bar and moves
  to the foot of the screen while a full screen sheet is up (`SHEETS` in career-kit.js,
  watched by a MutationObserver). A new pop is appended to the lane, never to the body.
- **The top bar carries the coin pill** (`#ab-coins`, `renderCoins` in the page): the
  wallet's balance, bumped when it grows, and a tap opens the Locker on the Shop. It is
  drawn on the front page, the career and the boards, and not on the draft, whose cap
  HUD is money of another kind.
- **The Locker is the shop and the closet without a career** (`RTF_CAREER_UI.openLocker`,
  `#rtf-locker`, a body-level kit sheet). The Look sheet lives in the career screen and
  dresses the career on screen, so between careers there was no way to the shop. The
  Locker dresses the career in progress, else the newest Hall card, else a stock look,
  and has no Body tab. The front page row has a Locker key beside streak, wheel and quests.
- **One material on the front page.** Career and the economy were kit (square cards on a
  stepped 3px frame) and the draft game's cards under them were soft and rounded. A layer
  scoped to `#s-home` puts every card on the kit frame in its own colour (`--fr`), and the
  boards go square. Radius, border and shadow only, so nothing re-flows past the frame's
  3px. Kit keys are square wherever they are drawn (`button.k-btn` and friends).
- **A sheet closes on the kit's pixel X** (`RTF_KIT.closeX`), never a letter.
