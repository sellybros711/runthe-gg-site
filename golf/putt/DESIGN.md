# The Putting Green

A tester preview inside Run The Tour. Not launched. The door is drawn only for the accounts in
`PUTT_TESTERS` in `golf/index.html`, and flipping `PUTT_LIVE` to true is the launch.

```
node golf/putt/check-putt.mjs             physics, the real greens, every themed hole, 21 dailies
node golf/putt/check-putt.mjs --days 120  a longer run of dailies
node golf/putt/check-putt.mjs --quick     physics and the real greens only
```

## Why

Everything else in Run The Tour is a simulation. You draft, you decide, and the round plays itself.
This is the one place a player actually hits the ball. It has to feel like part of the same game,
so it reuses the game's own greens, palettes, venue names, golfer and sounds.

## What the mini golf and putting games teach

Read across the games people actually play on a phone and on a console, and the same handful of
decisions keep separating the good ones from the rest.

| Game | What it gets right | What we take |
|---|---|---|
| Mini Golf King, Golf Battle | One gesture: pull back, let go. Power is the length of the pull. | The pull back is the whole input on a mini hole. |
| Golf Clash | Putts are aim plus a separate power meter, so precision does not fight power. | On a real green the aim is a ring you drag, and the pull only sets the pace. |
| PGA Tour 2K, Mario Golf | A slope grid with arrows, toggled on and off. The read is information, not the answer. | The Read button: arrows downhill, coloured by how steep. |
| Everybody's Golf | Pace said in feet, the unit a golfer thinks in. | Pace reads in feet of roll on flat ground. |
| Walkabout Mini Golf | Holes are short, readable and fair. Obstacles run on fixed clocks you can learn. | Windmills and sliders on fixed periods. Every hole is proven makeable in par. |
| Golf With Your Friends | A stroke cap so nobody is stuck on a hole for ever. Water is a stroke and a replay. | Pick up at par plus three. Water costs one stroke and the ball goes back. |
| Wordle and every daily | The same puzzle for everybody, one line to share. | The Daily Hole, one per Eastern day, the same for everyone, with a copy line. |
| Seasonal events everywhere | Themes are skins on mechanics people already know. | Eight themes over nine hole shapes. The theme never changes the rules. |

What we deliberately leave out: power ups, random bounces, anything bought that changes a roll,
and a drawn line that shows the break. The skill is reading the green.

## How it works

### The physics is real, and it is one rule each

- A ball on a green slows at `v0^2 / (2 x stimp)`. A Stimpmeter releases at 6 ft/s, so that is
  what a stimp reading means. The checker rolls a ball at 6 ft/s and gets the stimp back.
- A slope pulls at `5/7 g sin(theta)`, the pull a rolling sphere feels.
- Over the cup the ball falls under gravity. It drops if it falls far enough to catch the far lip
  before its centre leaves the hole. That one rule gives a capture speed near 4.8 ft/s for a
  centred putt and a lip out for an edge hit, with nothing tuned to make it happen.
- Everything is deterministic. The same putt from the same spot always does the same thing.

### Tour Greens are the real greens

`fromHost()` reads the green off the page's own `hvGeom`: its size (`greenR`), its outline
(`gMod`, `onGreenPaint`), its four pin spots (`pinCands`), its greenside bunkers and its water.
The colours come from `hvBiome`, the name from the course's fictional venue name. So the green you
putt on is the green the hole view draws.

What the hole view does not have is slope, so the surface is built for it. Speed and contour come
from the course's own putting difficulty (`fit.put`), and its blurb names the shape: turtleback
greens crown, double greens get humps, tiers get a tier, glassy greens run faster. A pin is always
cut where the green is under 3%, and a ball is never left where it could not have stopped.

### Mini golf is nine shapes and eight skins

Nine hole shapes (straight, dogleg, tiers, windmill, island, S bend, tunnels, volcano, gauntlet,
plus a bowl for the dailies). Each is mirrored at random, so the same shape is a new hole.

Eight themes, each a palette, a set of skins and a list of hole names: Haunted Hollow (Halloween),
Harvest Hills (Thanksgiving), Frostbite Pines (the holidays, where the water is ice), Sweetheart
Greens, Shamrock Glen, Bloom Gardens, Firecracker Fairways and Seashell Shores. The calendar picks
which one the Daily Hole wears. The Daily is dressed up with extra bumpers and a roll in the carpet.

### What the checker proves

A hole nobody can make, a ball that escapes through a wall and a ball that never stops all render
perfectly, so the checker plays every hole. It searches shots from the tee, keeps the best places
they left the ball by walking distance round the walls, and searches again from there. Every
themed hole and every daily it walks is holed in par or better, and not one shot escapes or rolls
for ever. The first run of it found a real bug: a ball resting on a rail was called out of bounds
because the material grid rounds to a quarter foot.

## Still to do before launch

- A server leaderboard for the Daily Hole. Today the best score is kept on the device.
- Tester feedback on pace: how far a full pull should hit, and how big a mini cup should be.
- A home for it in the career, if the owner wants one (a practice green between events).
- The how to play page and the cachebust and copy guards for launch day.
