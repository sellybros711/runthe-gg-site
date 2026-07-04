# RunTheTour — Fictionalization Spec (courses, tournaments, cups)

Status: **PROPOSED — awaiting owner name review. Nothing implemented yet.**

## Why
Real course names, tournament names, and (worst) sponsor-branded event names ("BMW
Championship", "Rocket Mortgage Classic", "FedEx Cup"…) are trademarks used commercially in
an ad-supported game. The DataGolf license covers the *data* (pars, yardages, averages, skill
fits — facts, which we keep), not third-party names. This spec fictionalizes every venue and
event name with originals that keep the real venue's *character*, consistent with the earlier
de-branding passes (PGA → "pro season", Olympics → "The Games").

Out of scope here (flagged separately, owner decision): the real **player roster** and the
real **caddie names** (right of publicity — a bigger call than names of places).

---

## 1. The four majors

| Now | Proposed tournament | Venue (was) | Proposed venue |
|---|---|---|---|
| The Masters | **The Magnolia Invitational** | Augusta National GC | **Magnolia Hollow Golf Club**, Georgia |
| The Championship *(already generic — keep)* | The Championship | Valhalla GC | **Ironwood Ridge Golf Club**, Kentucky |
| U.S. Open | **The National Open** | Oakmont CC | **Grindstone Country Club**, Western Pennsylvania |
| The Open | **The Links Championship** | St Andrews (Old) | **The Auld Links at Carrickmoor**, Fife, Scotland |

Career Grand Slam = win all four, unchanged conceptually.
Trophy art: the **green jacket must be redrawn** (Augusta trade dress — propose a burgundy
champion's blazer for the Magnolia); Claret Jug silhouette → an original silver "links flagon";
Wanamaker-style urn → original two-handle silver cup. U.S. Open gold cup is already generic.
"Amen Corner", "Green Mile", "Postage Stamp" etc. are protected/famous nicknames → replaced
with our own (e.g. Magnolia Hollow's 11-13 = **"the Cathedral turn"**; Fox Den's 16-18 =
**"the Gauntlet"**). Augusta's flower hole names → a NEW set of Southern flora names (not the
famous sequence).

## 2. Cups & team events

| Now | Proposed |
|---|---|
| FedEx Cup / Race to the Cup / FedEx Cup Playoffs | **The Tour Cup** / Race to the Cup / **Tour Cup Playoffs** |
| Tour Championship (finale) | keep — generic words *(attorney sanity-check)* |
| Ryder Cup (USA v Europe) | **The Atlantic Cup** |
| Presidents Cup (USA v International) | **The Nations Cup** |
| Charles Schwab Cup (circuit) | **The Legends Cup** |

## 3. All 39 daily-challenge courses

Internal course KEYS stay unchanged (they live in server rows `course_key`, localStorage
course records, and seeds — changing them breaks saved data; they are never rendered to the
player). Only display fields change: `v`, `loc`, `blurb`, `sig` texts, hole nicknames.

| Key (internal, unchanged) | Display now | Proposed display name | Proposed loc |
|---|---|---|---|
| Augusta National | Augusta National Golf Club | **Magnolia Hollow Golf Club** | Georgia |
| TPC Sawgrass | TPC Sawgrass (Stadium) | **Cypress Marsh (Stadium Course)** | Northeast Florida |
| Pebble Beach Golf Links | Pebble Beach Golf Links | **Graystone Cove Golf Links** | Monterey Peninsula, California |
| St Andrews Old Course | The Old Course at St Andrews | **The Auld Links at Carrickmoor** | Fife, Scotland |
| Oakmont | Oakmont Country Club | **Grindstone Country Club** | Western Pennsylvania |
| TPC Scottsdale | TPC Scottsdale (Stadium) | **Cactus Ridge (Stadium Course)** | Scottsdale, Arizona |
| Bay Hill | Bay Hill Club & Lodge | **Osprey Bay Club & Lodge** | Orlando, Florida |
| Harbour Town Golf Links | Harbour Town Golf Links | **Lighthouse Point Golf Links** | Lowcountry, South Carolina |
| Quail Hollow Club | Quail Hollow Club | **Fox Den Club** | Charlotte, North Carolina |
| Muirfield Village | Muirfield Village Golf Club | **Founders Village Golf Club** | Dublin, Ohio |
| Valhalla | Valhalla Golf Club | **Ironwood Ridge Golf Club** | Louisville, Kentucky |
| TPC River Highlands | TPC River Highlands | **River Bend Golf Club** | Connecticut |
| Plantation Course at Kapalua | The Plantation Course at Kapalua | **Trade Winds Golf Club** | Maui, Hawaii |
| East Lake Golf Club | East Lake Golf Club | **Old Grove Golf Club** | Atlanta, Georgia |
| Glen Abbey | Glen Abbey Golf Club | **Maple Glen Golf Club** | Ontario, Canada |
| Sedgefield Country Club | Sedgefield Country Club | **Thistledown Country Club** | Greensboro, North Carolina |
| Pinehurst No. 2 | Pinehurst No. 2 | **Longleaf No. 2** | Carolina Sandhills, North Carolina |
| Royal Troon | Royal Troon GC (Old Course) | **Royal Aynsmuir (Old Course)** | Ayrshire, Scotland |
| Carnoustie | Carnoustie Golf Links | **Drumnoch Links (Championship)** | Angus, Scotland |
| Royal Portrush | Royal Portrush (Dunluce) | **Royal Causeway (Dunes Links)** | Northern Ireland |
| Turnberry | Turnberry (Ailsa) | **Craigfell Links** | Ayrshire, Scotland |
| Riviera Country Club | Riviera Country Club | **Canyon Crest Country Club** | Los Angeles, California |
| Torrey Pines South | Torrey Pines (South) | **Seacliff Municipal (South)** | San Diego, California |
| Innisbrook Copperhead | Innisbrook (Copperhead) | **Palm Grove (Diamondback Course)** | Tampa Bay, Florida |
| Waialae Country Club | Waialae Country Club | **Makani Country Club** | Honolulu, Hawaii |
| Colonial Country Club | Colonial Country Club | **Old Republic Country Club** | Fort Worth, Texas |
| Southern Hills | Southern Hills Country Club | **Cottonwood Hills Country Club** | Tulsa, Oklahoma |
| Firestone South | Firestone CC (South) | **Ironstone Country Club (South)** | Akron, Ohio |
| Winged Foot | Winged Foot GC (West) | **Quicksilver Golf Club (West)** | Westchester, New York |
| Bethpage Black | Bethpage Black Course | **Ravenwood Black Course** | Long Island, New York |
| Whistling Straits | Whistling Straits (Straits) | **Gale Harbor (Bluffs Course)** | Lake Michigan shore, Wisconsin |
| Shinnecock Hills | Shinnecock Hills Golf Club | **Seagrass Hills Golf Club** | Long Island, New York |
| Kiawah Island Ocean | The Ocean Course at Kiawah Island | **Saltmarsh Island (Ocean Course)** | South Carolina |
| Olympic Club | The Olympic Club (Lake) | **Lakeside Athletic Club (Lake Course)** | San Francisco, California |
| Baltusrol | Baltusrol GC (Lower) | **Barrowmoor Golf Club (Lower)** | New Jersey |
| The Country Club | The Country Club | **The Village Club** | Brookline, Massachusetts |
| Merion | Merion Golf Club (East) | **Hollowbrook Golf Club (East)** | Main Line, Pennsylvania |
| Oakland Hills | Oakland Hills CC (South) | **Greenmont Hills (South)** — "the Monster" | Michigan |
| TPC Southwind | TPC Southwind | **Delta Winds Golf Club** | Memphis, Tennessee |

All 39 **blurbs get rewritten** (they currently cite real architects/history — incoherent under
fictional names) keeping the same *playing character* ("glassy fall-away greens", "island-green
17th", "church-pew-style ridged bunkers" → "the Plowlines"). Real pars/yardages/averages/fits
stay (facts, DataGolf-licensed). Signature-hole texts and DSIG_HAZ scenarios keep hazards,
lose the protected nicknames.

## 4. Tour schedule (anchors + rotating pool)

| Now | Proposed |
|---|---|
| Kapalua Invitational | **Trade Winds Invitational** |
| Pebble Beach Pro-Am | **Graystone Cove Pro-Am** |
| Bay Hill Invitational | **Osprey Bay Invitational** |
| The Players | **The Stadium Classic** (at Cypress Marsh) |
| Memorial Tournament | **The Founders Invitational** |
| Travelers Championship | **River Bend Classic** |
| FedEx St. Jude Championship | **The Memphis Championship** (Tour Cup Playoffs) |
| BMW Championship | **The Crossroads Championship** (Tour Cup Playoffs) |
| Tour Championship | Tour Championship *(keep)* |
| Sony Open | **Island Open** |
| The American Express | **Desert Classic** |
| Farmers Insurance Open | **San Diego Open** |
| Phoenix Open | Phoenix Open *(generic city+Open — keep)* |
| Genesis Invitational | **Canyon Crest Invitational** |
| Mexico Open | Mexico Open *(keep)* |
| Cognizant Classic | **Palm Coast Classic** |
| Valspar Championship | **Gulf Coast Classic** |
| Houston Open / Texas Open / Charlotte Open / Canadian Open / Scottish Open | *keep (generic geographic)* |
| Hilton Head Classic | **Lighthouse Classic** |
| Zurich Team Classic | **Bayou Team Classic** |
| Charles Schwab Challenge | **Fort Worth Invitational** |
| Rocket Mortgage Classic | **Motor City Classic** |
| John Deere Classic | **Quad Cities Classic** |
| 3M Open | **Twin Cities Open** |
| Wyndham Championship | **Piedmont Classic** |

Opposite-field fallback events (makeOppoEvt) get the same treatment (generic city "Opens").
EVENT_COURSE venue subtitles: events mapping to one of the 39 dailies reuse that course's new
name; the ~12 standalone venues (Caves Valley, PGA West, Detroit GC, Renaissance Club…) each
get an original name in the same pass.

## 5. Legend Circuit

| Now | Proposed |
|---|---|
| Regions Tradition | **The Legacy Invitational** |
| Senior PGA Championship | **Legends Championship** |
| U.S. Senior Open | **National Senior Open** |
| Senior Players Championship | **Legends Stadium Classic** |
| Senior Open Championship | **Legends Links Championship** |
| Cologuard / Chubb / Hoag / Rapiscan / Mitsubishi / Insperity / Regions Charity / Ally / Boeing / Ascension | **Tucson Legends Classic / Naples Classic / Newport Classic / Ozarks Classic / Peachtree Legends Classic / Woodlands Invitational / Birmingham Classic / Great Lakes Classic / Cascade Classic / Gateway Legends Classic** |
| Charles Schwab Cup Playoffs I / II / Championship | **Legends Cup Playoffs I / II / Legends Cup Championship** |

Circuit venue names (Greystone, Broadmoor, Harbor Shores…) fictionalized in the same pass.

## 6. Technical migration plan (order of work)

1. **Course display fields** — v/loc/blurb/sig/hole-names for all 39; keys untouched → zero
   data migration for course records, daily bests, seeds, H2H course pick.
2. **Event renames** — ANCHORS/REG_POOL/CIRCUIT_* arrays + every keyed lookup that uses the
   event STRING: `COURSEFIT` keys, `EVENT_COURSE` keys, `MAJOR_NAMES`, `legendQualifies`'s
   hardcoded 4-major array, `guestMajorExemptions`, `majorTheme()` (trophy art), achievement
   regexes (`/Players/`, `/Tour Championship|Finale/`), `CUP_THEME`, race-strip/summary copy.
3. **Save-compat shim** — persisted careers hold OLD names in `majorStats` keys, `winsList`
   entries, cloud saves. Add `LEGACY_EVENT_ALIAS = {'The Masters':'The Magnolia Invitational', …}`
   and normalize at every read (career resume, cloud pull, ceremony, Grand Slam checks) so an
   in-flight career keeps its majors and Legend-Token eligibility.
4. **Cups** — FedEx/Ryder/Presidents/Schwab strings (73 mentions) + CUP_THEME wordmarks.
5. **Trophy art** — redraw green jacket → burgundy blazer; Claret Jug → original flagon;
   Wanamaker → original cup. (SVGs, self-contained.)
6. **Marketing/meta copy** — title-screen lede, How to Play, About, `<meta>` descriptions
   mention "Ryder Cup"; swap to Atlantic Cup/generic.
7. **Docs** — courses.json, EVENT_COURSE doc comments, H2H-SPEC references.
8. Playwright regression: full season (majors/cups/awards/achievements/Grand Slam), circuit,
   daily, H2H course pick, resume of an OLD-named save through the alias shim, zero errors.

Estimated size: ~1 large content changeset (names + 39 rewritten blurbs + ~120 sig lines) +
1 code changeset (lookups/shim/art). Deployable in stages: courses first (no key risk), then
events+shim together (atomic), then art/copy.

## 7. Still-real names deliberately left for a separate decision
- **Player roster** (242 real golfers) and **31 real caddies** — right of publicity, the
  larger legal exposure; fictionalizing them is a bigger design call (owner + attorney).
- "Tour Championship", "Phoenix Open"-style generic geographic names — kept, low risk.
- DataGolf attribution — stays (licensed data source, factual credit).
