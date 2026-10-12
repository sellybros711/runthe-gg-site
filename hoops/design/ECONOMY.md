# Run The Floor economy: the plan (Phase 0)

The port of Run The Tour's user side (`golf/`) into Run The Floor (`hoops/`).
Nothing in this file is built yet. It is the map, the measured numbers and the
decisions, written down before any code so the next phases have something to be
held to. `docs/economy-2026-09-04.md` (the wrestling port) is the playbook and
its two lessons are the spine of this one: coins are a meta currency that never
scale with the career, and the pass is balanced by a daily cap.

Status: 2026-10-11, for review. Every number below is a proposal. Phase 2 and
Phase 4 each re-measure them with a headless suite before anything ships.

---

## 1. What golf has, and where each piece lands

| golf system | golf identifiers | hoops home | notes |
|---|---|---|---|
| Coin wallet | `coinState`, `coinsEarned`, `coinBalance`, `coinCharge`, `addBonusCoins`, `COIN_EPOCH` | `economy.js`: `awardCoins()`, `coinCharge()`, `balance()` | a keyed ledger, not golf's derived total (section 4) |
| Coin history | `coinLog`, `overlayCoinLog` (last 150, device only) | falls out of the ledger | the ledger IS the history, so it follows the account |
| Store and tabs | `overlayShop`, `SHOP_SECS` | `shop.js`: Team Shop | tabs in section 6 |
| Prices | `RARITY_PRICE`, `ACC_RARITY`, `accPrice`, `COLOR_PRICE` | `catalog.js` | no boost premium (decision 4) |
| Accessories and slots | `ACC_SLOTS` (8), `ACCESSORIES` (33), `MILESTONE_ITEMS` (5) | `catalog.js`: 23 slots over two looks | section 5 |
| Packs, odds, pity, 5 for 4 | `PACK_TYPES`, `PACK_ODDS`, `rollPackWin`, `packState` | `economy.js` + `catalog.js` | one item per pack, as golf |
| Duplicates, shards | `dupeRefund`, `PACK_DUPE_REFUND`, `shardEarn`, `shardSpend` | `economy.js` | coins back only from coin bought packs |
| Shard Exchange | `EXCHANGE_COST` (10), `NEXT_RARITY`, `overlayLegendaryChoice`, `LEG_EXCHANGE_COINS` | `shop.js` | golf's UI says 5 and the constant says 10: hoops says 10 everywhere |
| Drops, set rewards | `DROPS`, `dropLive`, `DROP_REWARDS` | `catalog.js` | a launch drop and one seasonal drop |
| Customization | `DEFLOOK`, `scrSetup` wardrobe, `cosOwned`, `FREE_COSMETICS` | `wardrobe.js` (closet UI) + `wear.js` (art) | body and face stay in the career's Look editor |
| Auras | `AURA_SHAPE` (11) | `catalog.js`, drawn by `wear.js` | sold outside both looks |
| Player card | `PLATES` (13), `overlayPlayerCard`, `overlayPassport` | Phase 5 | nameplate, backdrop, rep frame |
| Season pass | `TOURPASS_*`, `PASS_*` | `economy.js` + `pass.js` UI: Floor Pass | section 8 |
| Prize wheel | `overlayWheel`, `WHEEL_*` (13 wedges, scales with rank) | `economy.js` | 1 free spin a day |
| Quests, weeklies | `DAILY_QUEST_DEFS` (4), `WEEKLY_POOL` (12) | `economy.js` | written for hoops' modes |
| Streak week, login | `bumpStreak`, `STREAK_WEEK_TRACK`, `LOGIN_TRACK` | `economy.js` | same seven day shapes, hoops numbers |
| Rep ladder | `REP_TIERS` (19 + G.O.A.T.), fractions of achievement points | `economy.js`: Floor Rep | reads `badges.js` |
| Boards | `LB_TABS`, `LB_SORTS`, `overlayStreakBoard` | `board.js` (exists) | Phase 5 draws the worn look on rows |
| Cloud merge | `mergeCoins`, `mergePacks`, `cloudPush` | `cloud.js` new slots | section 4 |
| Real money | `BUCKETS` (5), `TOURPASS` $14.99, `DAILY_TOKENS` (4), `beginCheckout` | Phase 6, dark | this repo's Stripe path, not golf's |

Not ported: golf's daily tokens. Hoops' dailies are free, one a day, and selling
a second attempt at a shared-question puzzle is selling a better score.

---

## 2. The faucet, measured

### What a career produces

Measured headless, 60 careers off `C.generateRoad` (the free draft-night start),
random answers, today's rosters and ratings:

| per career | value |
|---|---|
| NBA seasons | 10.6 mean, 12 median |
| cards answered | 106.8 |
| steps pressed (Next) | 67.6 |
| seasons in October (play-in counted) | 8.05 |
| playoff rounds won | 4.4 |
| titles | 0.13 |
| All-Star nods | 1.20 |
| other awards (All-NBA, All-D, DPOY, ROY, MIP, MVP, FMVP) | 3.4 |

Playoff paths over the 636 seasons: Missed 153, Play-in 94, R1 233, R2 86, CF 38,
Finals 24, Champion 8.

### The rule this sets

**A typical player plays one to three careers a day** (the owner's figure,
2026-10-11). That moves the anchor. Golf's rule (one career is worth about the
smallest bucket, about two packs) was written for a 30 year golf career, which is
weeks of play. Here a career is a session, so paying it two packs would hand a
typical player four to six packs a day and empty the catalogue in weeks.

So the anchor is the DAY, not the career: **a typical day (two careers and the
dailies) earns about what the smallest bucket holds, about two base packs.** A
career pays about 5,200 coins before its badges (random answers, the table above,
the rates in section 3), about 8,000 for a good one, and up to 12,800 for a Hall
of Fame career with a title.

### Careers are the main loop, so they are not the thing discounted

The old draft cut career pay to a quarter after four seasons a day. At one to
three careers a day that would have cut the core player's second career almost
to nothing. **The diminishing rule now counts whole careers: the first three
finished each Eastern day pay full, the fourth and later a quarter.** Classic
runs keep their own three a day. A grinder still earns more than a typical
player, just not three times more. The shared-question dailies pay once a day.

Target days, in coins (base, before any multiplier):

| player | what they do | coins a day |
|---|---|---|
| light | one career, one daily, the login | about 8,000 |
| typical | two careers, the dailies, quests, the streak, the wheel | about 15,200 |
| heavy | three careers and all of the above | about 20,800 |
| grinder | six careers | about 24,800 (the quarter-rate tail) |

A typical player opens about two base packs a day from play, plus the two League
Packs a week from weekly challenges: about 70 packs a month. With about 310 items
that is most of the commons and about half the rares in month one, and the
legendaries are a season long chase. Phase 2's suite simulates each row for 60
days and asserts the pace: a typical player owns about a third of the catalogue
after 30 days, and nobody owns all of it in one season.

---|---|---|
| casual | one daily, a Classic run, the login | about 200 |
| engaged | all three dailies, quests, the streak, a run, a career season or two, the wheel | about 450 to 550 |
| grinder | the above plus three hours of Classic and career | about 700 (the diminishing tail) |

An engaged player opens a base pack about every two days from play, plus the
two League Packs a week from weekly challenges. Phase 2's suite asserts these
three rows by simulating each player for 60 days.

---

## 3. The faucet table (proposed)

Every line goes through `awardCoins(key, amount, src)`. `key` makes it
idempotent (section 4). `src` is what the daily diminishing rule counts.

| source | coins | full each day | key |
|---|---|---|---|
| welcome grant | 2,400, plus a Streetball Pack | once ever | `welcome` |
| Daily Draft filed | 480, +320 made the playoffs, +480 each series won, +1,200 title | 1 | `dd:<day>` |
| Fix History daily | 400 + round(640 x title odds) | 1 | `fx:<day>` |
| Six Passes daily | 400, +400 at par or under, +240 easy mode not used | 1 | `ps:<day>` |
| Endless Fix or Passes (Pro) | 80 | 5 | `fxe:<id>`, `pse:<id>` |
| Classic run | 240, +160 October, +120 a series won, +800 title | 3 | `run:<seed>` |
| One Franchise or Decades run | as Classic | shares Classic's 3 | `run:<seed>` |
| Conquest | 40 a win, +480 a clear | the wins: 1,200 coins a day | `cq:<seed>:<rung>`, `cqc:<seed>` |
| Career season closed | 240, +60 a playoff round won, +120 All-Star, +160 each other award, +600 title | counted by career (below) | `cs:<seed>:<year>` |
| Career finished (reached the league) | 1,600, plus Hall tier 0 to 1,600 | the first 3 careers a day full, later ones (and their seasons) a quarter | `cf:<seed>` |
| A badge earned for the first time | bronze 120, silver 240, gold 480, ring 1,200 | not counted | `bg:<id>` |
| Daily quests | 320 each, +480 for all three | 1 set | `dq:<day>:<n>` |
| Weekly challenges | 3,200 + a shard, the first two a League Pack | 4 a week | `wk:<week>:<n>` |
| Streak week, login track, wheel | section 7 | once a day | `st:<day>`, `lg:<day>`, `wh:<day>` |

Two rules that are easy to get wrong:

- **Easy pays half.** An Easy career already files no badges and no board row,
  for the same reason.
- **Badges held when the economy ships pay nothing.** Badges are derived and
  retroactive, so paying for them at launch would hand a long-time player
  about 98,500 coins on day one (213 badges: 33 bronze, 71 silver, 74 gold, 35
  ring). The first load records the earned set as the baseline, the
  way golf's `COIN_EPOCH` does, and a panel says so.

---

## 4. Storage: a coin is a keyed entry

### The wallet is a ledger, not a total

Golf derives earned coins from career stats and merges counters by max. Merged by
max, two devices that both earned since their last sync lose one side's coins.
The wrestling port accepted that (it only under-counts). Hoops can do better for
no extra cost, because every award already has a natural key:

```
wallet slot: {
  e: { "<key>": [amount, t, src] },   earned, union by key
  s: { "<key>": [amount, t, what] },  spent, union by key
  z: { "<device>": [e, s] }           compacted totals, per device max
}
balance = sum(e) + sum(z.e) - sum(s) - sum(z.s) + paid (server, Phase 6)
```

- **Idempotent.** The same daily filed on two devices is one key, paid once.
- **Exact.** Nothing earned on either device is lost in a merge.
- **A spend is keyed too.** Buying an item is `buy:<item>`, so the same purchase
  on two offline devices is one charge for one item. A pack open is
  `pk:<random id>` and its contents are rolled off that id, so it is the same
  pack wherever it is replayed.
- **It is the coin history.** The ledger screen reads the newest entries.
- **Compaction** folds entries older than 60 days into this device's `z` row once
  there are more than 2,000 keys, so the slot stays small. A folded key can be
  paid again only if an old device that never synced replays it, which costs at
  most a handful of coins.
- **Negative is possible after a merge** (two devices spending the same balance
  offline). The shop then refuses a spend until the balance is back above zero.
  Nothing owned is taken away.

### Slots and merge rules

All on `ps_saves` (103), game `rtf`. No migration: slots are free form. Each is a
new entry in `cloud.js` `MODE_KEYS` and `MODE_MERGE`, and `cloud.js` and
`NEED_CLOUD` move to API 6 so a cached page cannot run a merge it does not know.

| slot | holds | merge |
|---|---|---|
| `wallet` | the ledger above | union of `e` and `s` by key; per device max of `z` |
| `owned` | item ids, shards earned and spent per rarity, drop claims | union of ids and claims; shard counters per device max, like `z` |
| `packs` | opens as `{id, tier, t, rarity, item}` | union by id. Pity is DERIVED: opens since the last epic or legendary, in time order. Nothing to merge |
| `pass` | season, XP by day, claimed tiers per lane | same season: max XP per day, union of claims. Newer season wins wholesale |
| `quests` | today's three, this week's four, progress | newer day or week wins; same day max progress, union of done |
| `streak` | days played, freezes | union of days played; the streak is derived |
| `wheel` | last spin day, banked spins earned and used | later day; per device max of earned and used |

**What the player wears is on the account row, not the shelf**, because a board
needs it to draw somebody else's circle: see migration 139 in section 10.

**A guest sees, an account owns.** A guest browses the shop, previews anything on
their own player and spins nothing. The first claim or purchase opens the
sign-in sheet. A guest's earnings are not banked, so signing in after a guest
session is not a way to collect it (the baseball cabinet's rule).

---

## 5. The wardrobe

### Two looks

| | off court (`street`) | on court (`court`) |
|---|---|---|
| where it is drawn | front page hero, Career hub, Locker, Team Shop preview, player card, board avatar, every off-floor scene, the new tunnel walk-in | every on-floor moment in `court.js`, the in-game sprite |
| who owns the design | the player | the team: the uniform is never sold, club colours stay earned |
| slots | hat, eyewear, top, outerwear, bottoms, shoes, socks, chain, watch, bag, headphones, held item | headband, goggles, mouthguard, sleeve L, sleeve R, wristbands, finger tape, tights or leg sleeve, knee pad, ankle brace, socks, shoes, undershirt |
| also | up to three named street outfits | one loadout |

Shoes are one item that can be worn in both looks. Sold outside both: ball skin,
shot trail, aura, nameplate, card backdrop, celebration, and idles (section 6).

**The look follows the account, not the career.** Body, face, hair and beard stay
on `L.look` (each career's own man, a son included). The wardrobe and both
loadouts are the account's and dress whichever invented player is on screen.

**The context is the only switch.** `B.paint(look, { ctx: 'street' | 'court',
wear })` and nothing else decides which is drawn. Today's `dress: 'suit'` and
`'cap'` become street outfits (the draft suit, a cap), so the ceremonies in
`court.js` (`suitOf`) and the beats in `scenes.js` pass `ctx` instead.

**Today's free options become starter items.** `BANDS`, `SLEEVES` and `SHOES` in
`baller.js` map to the court slots, so every look saved today draws exactly as
it does now. `check-sprite.mjs` holds the 960 existing hashes through every phase.

### The art: `wear.js`

The survey of `baller.js` says what this costs. Today clothing is mostly a
MATERIAL painted over the body volumes (the jersey over the torso, socks by
height on the leg); only the shorts, the suit jacket and trousers, the cap and
brim and the band are volumes of their own. Street clothes need volumes:

- Each garment is an `add(name, group, material, sdf)` call in `build()`, plus a
  ramp in `paint0`. Loose cloth is a torso or limb volume grown a little and
  softened, so it follows every pose the limb takes, sitting at a press table
  included.
- Layering is draw order plus clipping: outerwear over top, a chain over a tee and
  under a zipped jacket, a hood up or down as two volumes, trousers over or tucked
  into boots.
- **`wear.js` registers builders into `baller.js`** rather than growing it, so the
  catalogue is data plus a builder per garment shape (about 30 shapes cover 170
  street items through colourways and patterns). `baller.js` gains an
  `API_VERSION` and a hook; the page pins it the way `NEED_BOARD` pins `board.js`.
- **Every cache key takes the wear**: `keyOf`, the `paintAsync` key, the `live`
  key and `court.js`'s key. Missing one draws a stale outfit with nothing thrown.
- **Real men never wear anything.** `faceless` drops `wear`, and `court.js`
  passes it only for the invented player.
- A store tile, a pack card and a reveal are `B.paint` of the buyer's own player
  in the item, so the preview is the product.

### The catalogue: `catalog.js`

Data, one row an item: `{id, ctx, slot, name, rarity, art, colors, drop, boost}`.
`boost` exists and is ignored while `GEAR_BOOSTS` is false (decision 4).

| | common | rare | epic | legendary | total |
|---|---|---|---|---|---|
| off court | 70 | 55 | 33 | 12 | 170 |
| on court | 30 | 26 | 16 | 8 | 80 |
| everything else (auras, trails, ball skins, plates, backdrops, celebrations) | 6 | 10 | 8 | 6 | 30 |

Plus about 30 idles (section 6) and exclusives that are earned and never sold: a
draft night suit (first overall), a ring night fit (a title), the Hall of Fame
gold jacket fit, a rookie tee (first career). A free starter wardrobe: plain tee,
hoodie, sweats, jeans, two sneakers, and the starter court items.

No real brands, no real arena names, no logos of real clubs on anything. An
invented club's jersey is fine and is the only club wear sold.

---

## 6. Idles

Today `live()` in `baller.js` has two modes, `dribble` (pose `ball`) and
`breath`. Both become idles in a slot, one per look, and the rest come from
packs.

- **Standing** (the breath, no ball) is the new free default. **Standing Dribble**
  is today's dribble, free, unchanged. `heroCast` and `buildView` in
  `career-ui.js` stop hardcoding `pose: 'ball'` and read the equipped idle.
  Cutscenes keep choosing their own poses.
- An idle is keyframes on the rig, advanced on `court.js`'s 12 a second tick
  with position blended between ticks, and the ball drawn by the existing prop
  tracer. Loops of 2 to 6 seconds meet themselves with no pop. A rare flourish
  fires one loop in five.
- Silent. Reduced motion and small avatars show the idle's signature still.
  Only the on-screen player animates, and it pauses when hidden.
- The launch list in the brief is the plan: about 6 common, 8 rare, 8 epic, 7
  legendary, 4 exclusive. Nothing that belongs to a real person.

Cost to watch: an idle is frames painted in the worker, per look and wear. Phase
1b measures a throttled phone before the set is finished.

### As built (Phase 1b)

- `hoops/idles.js` holds 33 keyframe idles plus the two built in (`id_stand`,
  `id_dribble`). A key is the two arms as angles, the knees, the stance and a
  lifted foot. In-betweens are written by blending, and an arm swung through
  the side bends at the elbow (`ARC`, `BEND`, `ELBOW`), because a straight blend
  held the arm out level and the hand left the grid on a big man.
- A loop is at most 12 painted frames. The frames travel to the worker as plain
  data (paint's `fr` option, read by `frOf` in baller.js, which refuses anything
  that is not a frame and draws the standing figure instead).
- `live()` has a third mode, `idle`, that plays the sequence by the clock, the
  flourish one loop in five. Reduced motion and a still figure get the
  signature frame (`idleStill`). baller.js is API 2.
- The catalogue has 35 idle rows in an `idle` slot in both looks (`ctx: 'both'`).
  `resolve()` never hands one to baller.js as wear; `wardrobe.js idle()` turns
  the equipped one into paint options, and an idle he does not own is the
  look's default. The front page hero, the builder and the closet's Idle tab
  play the equipped court idle. Cutscenes keep their own poses.
- `check-idles.mjs` paints every frame on four bodies and fails on a part at the
  grid's edge, a missing head, hand or shoe, a loop that does not close or move,
  a ball that is or is not there, and checks the page plays it live.

---

## 7. Prices, packs and the daily loop

### Direct buy and packs

Run The Tour's prices exactly (the owner's call, 2026-10-11), so a coin means the
same thing in both games. Every earning in this file is scaled to match:

| rarity | direct buy | dupe refund (coin packs only) | shards to step up |
|---|---|---|---|
| common | 15,000 | 2,000 | 10 common: a rare spin |
| rare | 45,000 | 5,000 | 10 rare: an epic spin |
| epic | 110,000 | 12,000 | 10 epic: a legendary spin |
| legendary | 275,000 | 25,000 | 10 legendary: 25,000 coins, a Hall of Fame Pack, choose 1 of 3 legendaries |

Idles price one step up (a common idle costs as a rare item): they are the most
visible thing a player owns.

| pack | coins | odds C / R / E / L | pity: epic+ / legendary |
|---|---|---|---|
| Streetball Pack | 8,000 | 55 / 30 / 12 / 3 | 10 / 40 |
| League Pack | 22,000 | 30 / 40 / 22 / 8 | 6 / 24 |
| Hall of Fame Pack | 45,000 | 10 / 35 / 38 / 17 | 4 / 12 |
| seasonal pack (drop live) | 30,000 | as League, 40% toward the drop | 6 / 24 |

One item a pack. Five for the price of four, same tier. Pity is shared across
tiers and derived from the open log. A pack can pull either look; the reveal
labels Off Court or On Court. Odds are printed on every pack.

### The daily loop

| | day 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| streak week (a daily played) | 150 | 350, 2 common shards | a spin | Streetball Pack | 1,000, 2 rare shards | a spin | League Pack |
| login track (opened the game) | 50 | 75 | 100, a common shard | Streetball Pack | 150, a rare shard | a spin | Streetball Pack |

Both tracks are golf's own numbers. Freezes at 7, 30 and 100 days, as golf. The wheel: one free spin an Eastern day,
13 wedges with golf's weights, coin wedges 50 to 2,500 (golf's) scaled up to 1.8x by Floor
Rep, plus shard, pack, XP boost and bonus spin wedges.

Daily quests (three of): play today's Daily Draft, finish a Classic run, close a
career season, win a Conquest game, solve Six Passes at par, open the Locker and
change something. Weekly pool of twelve, four a week: one career, one daily, one
Classic or Conquest, one collection.

### Floor Rep

Badge points: bronze 1, silver 2, gold 4, ring 8, which is 751 points over today's
213 badges. Twenty ranks at golf's fractions of the total (Rookie at 1% up to
Icon at 96.5%), and a twentieth, G.O.A.T., for every badge. Read by the wheel and
by rep-gated cosmetics. Derived, so it needs no storage and never disagrees with
the cabinet.

---

## 8. Floor Pass

| | |
|---|---|
| season | 60 days from a fixed Eastern epoch; the countdown is to Eastern midnight |
| tiers | 60, golf's curve: cost(t) = 800 + 20.338(t - 1), about 84,000 XP total |
| XP | 0.13 per base coin earned (before multipliers), plus quests at their own XP |
| daily cap | 2,100 XP: a perfectly capped player needs 40 days |
| expected | light (8,000 coins, 1,040 XP a day) reaches about tier 48; typical (15,200 coins, 1,976 XP) finishes about day 43; heavy and grinder sit on the cap and finish day 40 |
| rollover | unclaimed tiers settle into the ledger, the season locks |

The free lane is real: packs at 5, 10, 20, 30 and 40, a cosmetic at 15 and 35,
shards and coins between, a League Pack and an exclusive fit at 60. The paid lane
doubles the packs, carries the season's exclusives and an exclusive idle at 60.

The suite throws 2,000,000 coins of farming at one day and asserts the track moves
2,100 XP.

**Floor Pass is not Run The Floor Pro.** Pro (`rtf_premium`, $14.99 a year) is the
endless puzzles; the pass is a season's cosmetics. Different names in copy,
different products in the catalog, different code paths. Pro buys nothing in the
economy.

---

## 9. Real money, dark (Phase 6)

All behind flags that default to off: `BUCKETS_ENABLED`, `PASS_PAID_ENABLED`.
Coin buckets at golf's own prices and amounts:

| bucket | coins | extra |
|---|---|---|
| $1.99 | 15,000 | |
| $4.99 | 45,000 | |
| $9.99 | 102,000 | a League Pack |
| $19.99 | 285,000 | a Hall of Fame Pack |
| $49.99 | 750,000 | three Hall of Fame Packs |

Paid coins live only on the server. The client never grants one: `coinCharge`
spends earned coins first, then calls the server to spend paid ones. This uses
this repo's checkout (`functions/api/stripe/checkout-bundle.js`, `_bundles.js`,
the webhook), not golf's `create-checkout` edge function, which is not in this
repo. The pass is a `premium_unlocks` row with an end date, the shape 124 already
handles.

---

## 10. Migrations

Hand deployed, each with a preflight row in `launch_preflight.sql`, each failing
soft: without it the game plays and the thing it holds stays on the device.

| number | phase | what |
|---|---|---|
| 139 `hoops_wardrobe` | 1 | `rtf_profiles` gains `wear_street`, `wear_court`, `idle`, `plate`, `card` (jsonb or short text, shape checked like `ps_set_crest`, not entitlement checked); `rtf_set_profile` gains the arguments; the board read asks for them and drops them on a 400 |
| 140 `hoops_wallet` | 6 | `rtf_wallet` (paid coins only), `rtf_wallet_spend`, purchase rows |
| 141 `hoops_pass` | 6 | `rtf_pass` product in `premium_unlocks` with `expires_at` |

The earned economy (sections 3 to 8) needs no migration at all.

---

## 11. Files

| file | phase | what |
|---|---|---|
| `hoops/economy.js` | 1 to 4 | wallet ledger, faucet, packs, shards, quests, streak, wheel, rep, pass. Pure, node requirable, `ECON_API_VERSION` |
| `hoops/catalog.js` | 1 | items, idles, packs, drops. Data only |
| `hoops/baller.js` (street section) | 1 | garment and accessory shapes, drawn behind `ctx: 'street'` (section 13) |
| `hoops/idles.js` | 1b | idle keyframes |
| `hoops/shop.js` | 1 to 4 | Team Shop, closet, pack reveal, pass and wheel sheets, on `career-kit.js` |
| `hoops/wardrobe.js` | 1 | what he owns and wears (`rtf.ward.v1`), and the wallet's one door (`RTF_WALLET`, `rtf.wallet.v1`) |
| `hoops/closet-ui.js` | 1 | the closet in the Look sheet, the outfits and the coin history |
| `hoops/earn.js` | 1 | who earns and when (section 14) |
| `hoops/check-closet.mjs` | 1 | owning, wearing, two devices, the closet on a phone, the coin history |
| `hoops/check-earn.mjs` | 1 | a guest earns nothing, every award pays once, nothing before the baseline pays |
| `hoops/check-economy.mjs` | 1 | ledger merge, idempotence, compaction, diminishing tail, the three player days |
| `hoops/check-wardrobe.mjs` | 1 | every item in both looks, every pose, no part off the grid, cache keys move, old looks unchanged |
| `hoops/check-idles.mjs` | 1b | every loop closes, reduced motion still, phone budget |
| `hoops/check-shop.mjs` | 2 | odds by sampling, pity at the boundary, dupes, exchange, guest wall, the browser walk |
| `hoops/check-pass.mjs` | 4 | the cap, rollover, settlement |

Every sibling script carries a `?v=` in `index.html` and goes into
`scripts/cachebust.json`. Every one is added to `NEED_*` pins where the page reads
an API.

---

## 12. Decisions (settled 2026-10-11)

1. **Numbers.** Run The Tour's pack and item prices exactly (base pack 8,000).
   A career earns about 5,200 to 8,000 and a typical day (two careers) about
   15,200, which is the $1.99 bucket, as in golf. A typical player plays one to
   three careers a day.
2. **The keyed ledger**, not golf's derived total and max merge.
3. **Badges held at launch pay nothing.** A baseline is recorded on first load
   and a panel says so.
4. **The account owns the wardrobe**; each career keeps its own body and face.
5. **Floor Pass: $9.99 a season**, kept apart from Pro ($14.99 a year). Ships
   dark.
6. **Guests browse and preview, and earn nothing until they sign in.**
7. **Golf's daily tokens are not ported.**

## 13. A change from the plan, found while building

**The garments live in `baller.js`, not in a `wear.js` beside it.** The figure
is painted in a Web Worker that loads `baller.js` and nothing else
(`getWorker`), so a shape registered by a second file would draw in the first
frame and vanish from every frame the worker paints. `catalog.js` is the data
(an item is a shape plus colours) and `baller.js` holds the shapes, in its
street section, behind `ctx: 'street'`. A new colourway is a row; only a new
shape needs art. `baller.js` carries `API_VERSION` 1 for the page to pin.

## 14. Where coins are earned (`earn.js`)

`economy.js` says what a thing pays; `earn.js` is the one place the game asks
for it, and it holds three rules.

- **Only a signed in account earns.** `RTF_EARN.pay` answers `guest` and
  writes nothing otherwise. A guest still plays everything.
- **Every award is keyed**, so the places that ask can ask often: a Conquest
  win is asked after every steal (`cq:<seed>:<rung>`), a career season on every
  save (`cs:<seed>:<year>`), and each pays once.
- **Nothing earned before the account had a wallet pays.** `economy.js mark`
  holds a key at nought, and `baseline(base, keys)` marks a whole set the first
  time `base` is seen. Two baselines:
  - `bg:base`, set by `settle()` the first time a pull for the account comes
    back, marks every badge held then. It waits for the pull because the
    career it reads must already hold every badge another device earned.
  - `cb:<seed>`, set the first time a career is saved while signed in, marks
    the seasons it has already played. A career started signed in has none.
  A merge keeps the earlier of two entries for one key, so a mark against a
  payment can only make a device pay less. Marks are never folded away by
  `compact` (a folded key would be paid again) and are not lines in the
  history.

Where the game asks:

| moment | where | key |
|---|---|---|
| a pull for the account has come back | `cloudPull`, after every slot is adopted | `welcome`, then `bg:base` or the new badges |
| a run is filed | `recordRun` (`earnRun`) | `run:<seed>` or `dd:<day>`, then the badges it lit |
| a mode files a feat | `recordFeats` | the badges it lit |
| Conquest, Fix History, Six Passes | `cqFeats`, `fxFeats`, `psFeats` in `modes-ui.js` | as section 3 |
| a career saves, a career finishes | `save()` and `finish()` in `career-ui.js` | `cs:`, `cf:` |

What it says: a gold pill under the top bar, `+N coins`, gathering everything
paid in one moment. It is its own element rather than the page's toast,
because a mode says something in the same tick and the toast is one element.

Not built yet, and said rather than implied: the panel telling a long-time
player their badges were counted as already earned, the welcome's Streetball
Pack (packs are Phase 2), quests, weeklies, the streak and the wheel (Phase 3).
