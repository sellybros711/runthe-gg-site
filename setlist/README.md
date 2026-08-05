# Run The Setlist — draft a setlist from real shows

A jam-band setlist-drafting game at `runthe.gg/setlist`. Pick a band; each round
spins up one real concert; you pull one song off it and spend its running time
against your set. Two sets and an encore, a curfew on each, and every pick is
final. When the encore closes, the fans give you a verdict.

**In open testing.** Indexable and listed in `sitemap.xml`, but deliberately
**not linked from the homepage** yet — the URL is the only way in, so it can be
shared and found without being presented as a finished game.

```
/setlist/
  index.html          the whole game UI, self-contained
  scoring.js          v4 scoring — the ONLY place a scoring constant lives
  dataLoader.js       band CSV → { shows, segues }
  verify-scoring.mjs  QA harness: 98 assertions against the v4 spec
  data/
    DATA_CONTRACT.md  the CSV columns, and how tags are derived
    goose.csv         7504 performances · 655 shows · 366 songs · 2014–2026
    sample.csv        invented data, kept as an offline/regression fixture
/scripts/setlist/
  ingest_band.mjs     elgoose.net → goose.csv
  make_sample.mjs     regenerates sample.csv
  check_data.mjs      data + discoverability regression net
```

No build step, no bundler, no backend. The game is an ES module loaded directly
by the browser. Everything persists to `localStorage`.

## Getting the data

`goose.csv` is committed. Regenerate it from elgoose.net when you want fresher
shows:

```bash
node scripts/setlist/ingest_band.mjs --probe   # ALWAYS run this first
node scripts/setlist/ingest_band.mjs           # → setlist/data/goose.csv
```

**Bump `DATA_VERSION` in `index.html` after regenerating** — the CSV is fetched
as `goose.csv?v=<DATA_VERSION>`, so without a bump returning players keep the
cached copy.

A full run should land near **7504 performances across 655 shows** (2014–2026).
Anything far below that is a bad run, not a smaller band — the ingester prints
a per-year row count, and the two failure modes it guards are described in
`data/DATA_CONTRACT.md`: elgoose serves ~100 bands from one API and mixes them
into every response, and it truncates any single response at 4000 rows without
saying so. If a year reports `0 rows after retries`, that is throttling; re-run.

`--probe` prints the field names elgoose actually returns plus the artist
breakdown of one year. Run it before trusting a run; if a field was renamed,
update the `pick()` calls to match.

This needs outbound access to `elgoose.net`. Sessions whose network policy
blocks it will fail with a 403 on CONNECT — that is the egress policy, not a
bug in the script.

Goose is already live in the picker; a regenerated CSV needs no code change.

## Running it

Any static server from the repo root:

```bash
python3 -m http.server 8765     # → http://localhost:8765/setlist/
```

Paths are absolute (`/setlist/data/…`, `/assets/…`), so it must be served from
the repo root, not from inside `setlist/`.

## Checking it

```bash
node setlist/verify-scoring.mjs      # expect "98 passed, 0 failed"
node scripts/setlist/check_data.mjs  # expect "all checks passed"
```

`.github/workflows/setlist-checks.yml` runs both on any PR touching the game,
plus an XML parse of `sitemap.xml`. It is the only CI in this repo — nothing
else here runs on pull requests.

`check_data.mjs` is a regression net, not a general validator: every assertion
is there because that mistake was shipped or nearly shipped. It guards the CSV
header against `DATA_CONTRACT.md`, holds performance and show counts inside a
band wide enough for a routine refresh but tight enough to catch both ingest
bugs (a 4000-row truncation trips the floor, a lost `artist_id` filter trips the
ceiling), fails on HTML entities reaching the data, and asserts the
discoverability choices below.

## Layout

Measured at 390x844 before and after the UI pass — the draft screen is the one a
player sits on eight times a game, so its chrome is the expensive part:

| Screen | Before | After |
|---|---|---|
| Home | 1.3 screens | **1.0** |
| Draft | 1.8 screens | ~1.4 |
| Result | 3.7 screens | **2.0** |

Three patterns are borrowed from The Perfect Season (`football/index.html`):

- **Bottom sheet.** Under 860px the setlist panel is not a column you scroll
  past — it is a sheet that rises when you pick a song, so the slots always come
  to you. Above 860px the exact same markup is a sticky sidebar; only one media
  query decides which, so there is one draft interaction to reason about.
- **Sticky, short header.** `body.playing` shrinks it further mid-game.
- **Detail on demand.** The result screen used to print the full arithmetic for
  all eight slots inline. Now each slot is a tap target and the working opens in
  a sheet — same depth, a third of the page.

The draft screen still scrolls, and mostly should: its chrome is about 170px and
the rest is the show's songs, which is the thing the player came to read.

## Discoverability

Three things are deliberate and checked in CI, because "temporarily" hidden
things drift:

- **Not linked from anywhere.** No link on the homepage or any other page.
- **Listed in `sitemap.xml`** so the URL can still be found and shared.
- **No `noindex`** on the page.

The effect is a game you reach by knowing `runthe.gg/setlist`, not by browsing
the site. Putting it on the homepage is a one-line change plus deleting the
`homepage does not link the game` check.

## How a show works

You are not given eight slots. You are given a stage and a curfew.

```
Set I    75:00   up to 8 songs
Set II   70:00   up to 8 songs
Encore   10:00   up to 3 songs  + whatever the two sets left behind
```

Those budgets are the archive's own medians, not invented: Goose's Set I runs
75:07 across 7 songs, Set II 70:13 across 5, the encore 10:58 across 1.

Each round spins two reels — a **year**, then a **night from that year** — and
reveals one show. (The show is drawn first; the reels animate toward a result
already decided, so what you see is never a lie. Tap to skip.) Pick a song and
it goes into the set you are
currently building, spending its running time. A song that will not fit is shown
but dead, and says why — "needs 4:12 more" — because *no room for a 22-minute
Drive* is the game, not an error to hide. Close a set whenever you like; the
leftover flows to the encore.

**What you have built stays on screen.** A compact read of the set you are
filling sits above the song list — order, segue marks, running times — with the
earlier sets one tap away. The full clock panel is still in the sheet; this is
the part a decision actually depends on.

**The clock says what it is and grades itself**: normal, amber under fifteen
minutes, red and pulsing under five.

**Closing a set keeps the show on screen.** The show is the night's source
material, not a per-set handout, so closing Set I while holding a good one drops
you into Set II still holding it.

**Respins cost stage time**, taken from the set you are building: 5:00, then
10:00, then 15:00, then no more. Time spent spinning is gone — it does not reach
the encore — so a reroll is a real decision rather than a button to mash.

**Closing a set is a first-class action**, not a footnote — it states what it
banks, and turns urgent when the set is nearly spent or nothing on offer fits.
The encore's row shows time banked from the sets and time burned on spins, so
the trade is visible while it is being made rather than only at the end.

After the final score, **the one that got away**: the best song you were shown
and did not play, scored in the role it best suits, so the sting is specific.

The show ends when the encore closes. **Round count is emergent**: chase monsters
and the night is over in nine picks, play tight and it runs past fifteen.

**Segues are visible now, and buildable.** A song that ran into the next one
carries a `>` and says what it ran into — *"Borne › ran into The Way It Is"*.
Play one and the set is left mid-segue; the header says so, and any song that
would finish it is flagged **COMPLETES SEGUE**. Chains are the point.

That visibility is the whole change. The bonus already existed, but nothing on
screen said which pairs were canonical, so 45 points fired by luck or by knowing
Goose by heart. Measured over 400 games, a player who hunts segues scores ~15%
above one who just takes the best song each round (1379 vs 1202) and gives up
song quality to do it (748 vs 808) — a real trade rather than a dominant line,
so `SEGUE_POINTS` is unchanged.

A song's role comes from where it lands, not from a slot you chose. First of a
set is the opener, last is the closer, Set II's back half is peak territory. You
cannot know which song will close a set until you close it — same as the band.

Only shows where **every** song has a recorded length are drawable, since time is
the currency and 17% of the archive is untimed. That leaves 425 of 655.

## The show

The score is not handed over as a number. When the encore closes the night is
**played back** — set by set, song by song, the running total climbing as each
one lands, with the room reacting to it:

```
SET I
  Turbulence & The Night Rays   +39   Polite. A few people sat down.
  Atlas Dogs                    +41   Fine. Just fine.
  › No gap — straight into it.  +75
  Hot Tea                      +118   The place came apart.
```

Reactions are keyed to **why** the pick landed, not just what it scored — a
100-show bustout and a twenty-two minute type II are different nights and get
different sentences. The vocabulary is the community's own: across the 753
jamchart write-ups the curators say *peak* 769 times, *bliss* 93, *patient* 54,
*whale* 50, *hose* 17, plus *type II*, *jam vehicle*, *bustout* and *plink*. If
a word is not in the notes it is not in the reactions.

Every beat derives from the already-computed result, so the playback cannot
disagree with the scorecard that follows it. Tap to skip.

## Scoring

`scoring.js` is the source of truth; this is a summary, not a spec.

```
perSong = base            SONG       is this a song people treasure?
        x versionMult     VERSION    was this a special night for it?
        x placementMult   PLACEMENT  does it suit where it landed?

total   = sum(perSong) + time + flow
```

**SONG** is `crowd_rating` — 30 ordinary, up to 75 at the top of the jamcharts.
See `DATA_CONTRACT.md` for how it is derived.

**VERSION** is additive: recommended +0.55 (or jamcharted +0.30), 20+ min +0.25
(or 15+ min +0.12), rarity by show gap 100+ +0.40 · 50+ +0.25 · 20+ +0.15 ·
8+ +0.07.

**PLACEMENT** 1.30 all wanted tags · 1.12 some · 0.90 neutral · 0.55 clash.

**TIME** 100 points per set, paid linearly on how much of the budget you used —
"you played 82% of Set I, you get 82% of its time points" is a sentence a player
can hold in their head. Overrunning is impossible, so there is no over-run case.

**FLOW** 45 per real segue (adjacent *and* inside one set), up to 60 for an
energy arc — scored on the **average** miss, so it does not punish a longer show
— and up to 30 for covering a range of roles.

**The fan headline** is keyed to what you actually did, most specific first:
`Not a second wasted. Not a segue missed.` · `Played the curfew like a fourth
instrument.` · `Left the fans wanting more. And wanting a full set.` · `Four
songs an hour. The heads loved it.`

### What v4 changed, and why

v3's eight fixed slots were the unrealistic part: bands are not handed a slot
count. Measured over 500 simulated shows per strategy, the time model gives the
round count real meaning:

| Strategy | Picks | Stage time used | Typical headline |
|---|---|---|---|
| Chase the longest song | 8.6 | 97% | *Played the curfew like a fourth instrument.* |
| Best song each round | 10.2 | 96% | *Heavy, patient, and right up to the curfew.* |
| Random | 14.8 | 95% | *Every minute spent.* |
| Always the shortest | 19.0 | **39%** | *Left the fans wanting more.* |

That last row is the design working: picking short songs hits the eight-song cap
long before the clock, so the night ends 61% empty and the fans say so.

## Mode

**One mode, on purpose.** Every run draws a fresh random eight shows and can be
replayed as often as you like. The structure is still being worked out, so
there is deliberately nothing to perfect around yet — no daily, no streak, no
carry-over state.

A daily existed and was removed: it was seeded by `hash(band + local date)` so
everyone got the same eight shows, allowed one attempt per band per day, and
persisted to `localStorage` under `setlist_daily_<band>_<date>`. Reinstating it
means re-seeding the draw in `start()` and restoring that read/write — the
scoring, draw and share paths are all mode-agnostic now, so nothing else has to
change. Nothing is written to `localStorage` today except the shared theme key.

There is deliberately **no backend** — no database, no auth, no leaderboard.

## Open questions

Both of the first two surfaced only once the real Goose archive landed — the
sample data is uniformly well-formed and hid them.

1. **The same song could be locked into two slots — fixed.** A staple turns up
   in many shows, so nothing stopped a player putting "Arrow" in both Set I
   Closer and Set II Peak. `lockedSongIds()` now disables any song already in
   the setlist, struck through and labelled, with guards in the click handler
   and `lockIn()` so no path can write a duplicate.

   **Song sandwiches are unaffected**, which is worth understanding before
   changing this. A sandwich — play it, jam out, segue away, segue back — puts
   the same `song_id` in one show twice, and 151 of 655 Goose shows contain
   some kind of repeat. But a round draws one *distinct* show and locks exactly
   one song from it, so the two halves of a sandwich can never both be picked;
   the dedup only ever fires across two different nights. If picks-per-show ever
   goes above one, this becomes a real decision, and note that the data cannot
   help: elgoose has `isreprise` and `isjam` fields but both are `0` on every
   Goose row, so a reprise is not distinguishable from a fresh play.

2. **Thin shows made choiceless rounds — fixed.** 18 shows in the archive are a
   single song and 28 are three or fewer (early bar gigs the archive only partly
   logged), which put a no-decision round in ~20% of games. `drawableShows()` in
   `index.html` now requires `MIN_SONGS_PER_SHOW` (8), leaving 529 of 655 Goose
   shows. It falls back to the unfiltered set for any band too sparse to fill
   eight rounds. Raising or lowering that constant changes every daily result.

Two more worth revisiting:

3. **Tag inference is a proxy.** elgoose has no field saying a song is a ballad,
   so all six tags are derived from each song's own play history — see
   `DATA_CONTRACT.md`. Thresholds live in one `TAGS` block in `ingest_band.mjs`.
   These drive every placement multiplier, so they are the highest-leverage
   thing to tune against real Goose data. Two signals in the CSV are still
   unused and would likely beat the current ones: **length variance** (a song
   running 5:00 one night and 22:00 another is a jam vehicle; one that is always
   4:10 is not) and **segue-out rate**.

4. **Segues used to score across set breaks — fixed in v3.** Slots 2→3 and 6→7
   paid the bonus for a canonical pair, which cannot happen in a real setlist.
   `hasSegue()` now requires both slots to share a `set`.

5. **Song esteem is a proxy for a proxy.** `crowd_rating` is derived from
   jamchart standing because the fan *Jam of the Year* brackets — the real
   ranking, six years of community voting — live in PDFs on sites that 403
   automated fetches. The correlation is good (eight of nine known bracket
   standouts land in the top 18 of 91) but it measures *jamminess*, so a beloved
   song that is never a jam vehicle reads as ordinary. Hand-transcribing the
   brackets into a lookup keyed on song + date would beat it, and would also
   give per-*performance* esteem rather than per-song.
