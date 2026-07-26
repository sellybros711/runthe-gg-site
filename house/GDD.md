# RunTheHouse, Game Design Document

**Version:** 0.2
**Platform:** Browser (runthe.gg/house/)
**Mode:** Single player against fifteen AI
**Genre:** Social strategy elimination simulation

Version 0.2 closes the twenty eight ambiguities raised against 0.1. Every formula
in this document has a defined range. Every rule has a defined edge case. Section
18 lists what is still genuinely open, and it is no longer empty.

---

## 1. Concept

RunTheHouse drops you into a sealed house with fifteen AI opponents and one prize.
There are no scripted storylines. Every Player is generated fresh, forms their own
opinions of you, builds their own alliances behind your back, and votes based on
their own math. You survive by managing what people think of you, and by making
sure the person they want gone is never you.

**The pitch in one line:** a social strategy sim where the drama is emergent, not
authored.

**Design pillar:** *Every AI has a reason.* No vote is random. If someone flips on
you, there is a traceable chain of trust decay, alliance pressure, or threat
perception behind it. Post game, the player can inspect that chain. That is the
replay hook.

**The pillar has teeth.** Nothing in this document may hardcode an outcome that
the simulation is supposed to produce. When a design goal is stated as a
percentage, that percentage is a *calibration target* for the harness in section
15, not a die roll in the engine. If the harness cannot reach the target by
tuning weights, the model is wrong and the model gets fixed. This rule killed
four mechanics from version 0.1 and it is the most important sentence here.

---

## 2. Glossary

Deliberately original terminology. Nothing in this document uses trademarked
vocabulary from any existing television format, and marketing copy should never
reference one. The format's real history is used as an internal calibration
reference in section 15 only, never in shipped copy.

| Term | Meaning |
|---|---|
| **Player** | A cast member in the house. The user is a Player too |
| **House Captain (HC)** | Holds weekly power, names two Players At Risk, cannot be voted out that week, cannot vote |
| **At Risk** | Facing eviction at the week's end. Cannot vote |
| **Veto** | Won in a separate comp. Can remove one At Risk Player, forcing the HC to name a replacement. The holder cannot be named as that replacement |
| **Confessional** | Private screen where the Player logs their read on the house |
| **Rations** | Weekly penalty tier. The bottom finishers in the Captain Comp take stat and decay penalties for one week |
| **Move In Night** | Pre week one dialogue sequence that seeds the player's starting trust |
| **Bounce Back** | Twist where one recently evicted Player returns |
| **The Panel** | The jury of the last seven evicted Players, who vote for the winner |
| **Comp Game / Floor Game / Long Game** | The three skill tree trunks, and the three ways to survive the house |

Retired from 0.1: **Exit Interview** is deferred out of v1. **Blind Vote** is cut,
because votes are now always anonymous and the twist would be a no op.

---

## 3. Match Structure

A standard run is **16 Players over 13 or 14 weeks**, ending in a Final 2.

Week *n* begins with `17 - n` Players. Final 5 is week 12, Final 4 is week 13,
Final 3 is week 14. Version 0.1 said thirteen weeks ending in a Final 3, which
described the state after week 13 and omitted the finale. Double Eviction removes
a week and Bounce Back adds one, so a run is 13 weeks, 14 weeks, or 14 weeks with
both twists firing.

### Weekly loop

| Phase | What happens | Player agency |
|---|---|---|
| **1. Reset** | Rations assigned, trust decays toward baseline, AI reassess threat | Read the house |
| **2. Captain Comp** | All eligible Players compete | Choose effort, or throw |
| **3. Scheming I** | Free form social phase, 4 actions | Talk, pitch, lie, eavesdrop, ally |
| **4. Naming** | HC names two At Risk | If you are HC, you choose |
| **5. Veto Comp** | HC, both At Risk, plus 3 drawn Players | Compete or throw |
| **6. Scheming II** | 3 actions, high stakes | Campaign, beg, deal make |
| **7. Veto Ceremony** | Holder uses or holds, HC names replacement | Decide |
| **8. Scheming III** | 2 actions, vote whipping | Lock votes, count heads |
| **9. Eviction** | Anonymous votes resolve, one Player leaves | Vote if eligible |
| **10. Fallout** | Blame is assigned for votes that broke promises | Watch it land |

### Eligibility and ties

- The outgoing Captain may not compete in the next Captain Comp. A new Captain is
  determined every week. The restriction lifts at Final 4, where all four compete.
- The HC and both At Risk Players cannot vote.
- **The HC breaks all ties.**
- From Final 6 the veto draw is dropped and every remaining Player competes,
  because "HC, both At Risk, plus 3 drawn" is exactly the house at Final 6 and
  oversubscribed at Final 5.

### Final 4

All four compete for the veto. The HC names two of the other three At Risk.

- If a nominee wins the veto, they remove themselves and the unnominated Player
  becomes the replacement.
- If the unnominated Player wins the veto, the noms stand.
- If the HC wins the veto, they may swap one nominee for the unnominated Player.

**The HC casts the sole vote to evict in all three cases.** The veto holder is
safe and advances. Final 3 is therefore the HC, the veto holder, and whoever
survives the vote. When the HC holds the veto, they control both the noms and the
vote, which is correct: at Final 4 the Captain should have that much power.

### Final 3

A three part Captain Comp. The winner picks who sits beside them in the Final 2.
There is no veto and no Naming phase.

**Session length target:** 25 to 40 minutes. Section 21 records that this is
optimistic and what we do about it. The run autosaves continuously, so a session
may be abandoned and resumed at any phase boundary.

---

## 4. Your Character

You are not generated. You are authored once, on your account, and you bring the
same character into every run.

### Creation

Name, gender, and home city or state. These are social inputs only.

**Hard constraint:** gender and region feed *baseline affinity between Players*
and nothing else. They never touch a competition attribute, a social attribute, a
comp outcome, or a capability of any kind. No build path in this game may imply
that one group is better at something.

### Attributes

**Comp attributes (0 to 100)**

- `physical`, endurance and athletic comps
- `mental`, puzzles, memory, trivia
- `precision`, timing, balance, dexterity
- `luck`, weight in randomized comps

**Social attributes (0 to 100)**

- `charisma`, how much trust you naturally accrue
- `deception`, how well your lies land
- `perception`, how well you detect lies, how accurately you read threat, whether
  you catch an eavesdropper, and how well you read vote intent
- `loyalty`, resistance to flipping on an alliance
- `paranoia`, how fast your trust decays without maintenance
- `ambition`, willingness to make big moves rather than coast
- `volatility`, chance of acting emotionally against your own math

`perception` is new in 0.2. Version 0.1 gave `mental` three jobs and described lie
detection three incompatible ways in three sections. Splitting perception out
gives the game exactly one detection roll, defined in section 9.

### XP, levels, and tokens

Every run pays XP by finish and by milestone, win or lose. XP raises your account
level. Each level pays **skill tokens** and **coins**.

| Finish | XP |
|---|---|
| 16th to 12th | 25 to 75 |
| 11th to 7th | 100 to 200 |
| Panel (7th to 3rd) | 225 to 375 |
| Runner up | 425 |
| Winner | 500 |

Milestones pay on top: first Captain win, first veto used on yourself, surviving a
week At Risk, a unanimous Panel vote, reaching Final 2 without ever being At Risk,
and similar. Milestone list is a Stage 1 deliverable.

**Coins** buy cosmetics only: shirts, packs, house themes, name pools, title
cards. The store is built after the game is built.

### The skill tree

Three trunks, hex nodes, prerequisites flowing down from each trunk root, a fixed
lifetime token cap, and a free respec available at any time outside a run.

| Trunk | Buys | The way you survive |
|---|---|---|
| **Comp Game** | physical, mental, precision, luck | Win your way through |
| **Floor Game** | charisma, loyalty, perception | Be liked enough that nobody moves |
| **Long Game** | deception, ambition, volatility control | Control what the house believes |

Sizing, as built and reported by `simulator.js --tree`:

- 63 nodes, 372 tokens to buy the whole thing
- Level cap 60, paying 84 tokens over an account's life
- A maxed account therefore holds 22.6 percent of the tree

**You can never buy the tree.** A maxed account holds about a quarter of it, so
veterans differ from each other and not merely from newcomers. Respec is free and
unlimited, so no account can be built wrong.

### What stops this from breaking the game

Version 0.1 forbade stat progression outright. Version 0.2 allows it and replaces
that rule with two mechanisms that are native to the format rather than bolted on.

**1. Strength is read as threat.** The house scores you on what it can observe:
comp results, alliance reach, how well your pitches land. A stronger build
produces stronger observations, which raises your `threat` score, which gets you
named earlier. In an elimination format, being better is dangerous. The tree makes
you more capable and more targeted at the same time, and both effects run through
the existing threat model with no special casing.

**2. The house scales to you.** AI attribute budgets are drawn around your own
total, so a level 60 account faces a level 60 house. A shared seed therefore
reproduces a house only when the level bracket matches, so the shareable string
encodes both.

**Calibration target:** a level 60 account should win no more than about 1.5 times
as often as a level 1 account. The reward for playing is expression, more viable
strategies, and knowing how the house thinks. It is not a walkover. If Stage 4
shows a wider gap, threat coupling gets stronger until it closes.

### Move In Night

Four beats drawn from a bank of **twelve**, off the `gen` stream so the opening
belongs to the seed and a shared seed opens the same way. There used to be three
beats, always the same three in the same order.

Each answer **splits the room**. The first version applied one signed number to
all fifteen people scaled by a positive multiplier, so every answer moved the
whole house the same direction and your position relative to anybody else barely
changed. Playtest, fairly: "idk how much the answers actually affect anything."
`react` is now signed per person, so taking the room wins the confident half and
puts off the wary half. `focus` goes further and spends the whole night on one
person: a real bond and fourteen strangers, which is a completely different
house to wake up in.

Measured over 120 runs, holding the answer index constant:

| Answer | House mean | Best | Worst |
|---|---|---|---|
| always the first | 10.4 | 27.1 | -1.0 |
| always the second | 14.2 | 33.6 | -0.1 |
| always the third | 7.7 | 25.5 | -7.8 |
| always the fourth | 10.7 | 28.7 | -1.5 |

The bold column is worth less on average and buys you real enemies, which is the
trade the opening is supposed to offer.

The night closes on where you actually stand: your two warmest and your two
coldest, by name. You do not start level with fifteen strangers.


## 5. Player Generation

Each run generates 15 AI from a seed. Generation is always seeded, the seed is
random by default, and it is displayed and shareable. Every run is unique in
practice and any specific house can be replayed on purpose. Determinism is not
optional: the Stage 4 harness cannot exist without it.

The **PRNG is mulberry32 across four named streams**, `gen`, `comp`, `ai`, and
`text`. One shared counter would mean any player choice reshuffles every later
roll, which makes seed sharing fragile and makes regression tests impossible.

Each AI is generated by:

1. Drawing a total attribute budget around the player's own budget
2. Walking the same skill tree the player uses, which yields their archetype
3. Applying archetype bias to the attribute rolls
4. Assigning a hidden goal

**AI are built by the same tree you are.** An opponent can be read as a level 40
Operator leaning Floor Game, and that is a thing the player can learn to
recognize. One system generates both sides.

### Hidden win condition

Every AI carries a private goal that modifies their decision weights: *reach the
Panel*, *win comps*, *take out the biggest Long Game player*, *stay loyal to first
ally*, *never be At Risk*. This is the source of behavior the player cannot fully
predict but can, in hindsight, explain.

### Names and avatars

Combinatorial first and last name pools, no licensed identities. Avatars generated
procedurally from the seed using a custom shape vocabulary.

---

## 6. Archetypes

Archetypes are **not chosen and not a list**. An archetype is a label for where a
Player's spending lands in the tree. The same function names your character and
every AI.

**Three base archetypes**, one per trunk root:

| Base | Trunk | Reads as |
|---|---|---|
| **Competitor** | Comp Game | Wins things, gets targeted for it |
| **Anchor** | Floor Game | Trust hub, hard to move against |
| **Operator** | Long Game | Runs information, plays two sides |

**Tier 1 branches** specialize within a trunk. Comp Game gives Workhorse,
Technician, and Scholar. Floor Game gives Recruiter, Confidant, and Host. Long
Game gives Reader, Illusionist, and Broker.

**Tier 2 and 3 nodes**, and any meaningful cross trunk spending, produce the
intricate archetypes. All seven of version 0.1's archetypes survive as reachable
destinations rather than being discarded: Mastermind is Long plus Floor, Analyst
is Long plus Comp, Loudmouth is Floor with the low loyalty nodes, Wildcard is the
volatility branch, Drifter is shallow spending across all three trunks. New ones
including Chameleon, Enforcer, and Lone Wolf fall out of the same geometry.

The full node list is a Stage 1 deliverable. The rule that governs it: **no node
may grant a behavior, only attributes and unlocks.** Version 0.1's archetype table
listed outcomes as if they were rules, for instance "Competitor becomes a target
by week 5" and "Drifter almost never nominated early". Those are things the threat
model should produce. If it does not produce them, the threat model is wrong.

---

## 7. The Relationship Engine

### 7.1 Baseline affinity

Before any interaction, every ordered pair has a baseline: how these two would
feel about each other with no history. It is built from archetype compatibility,
shared region, shared gender, and a charisma term. Baselines are small, roughly
the range of minus 15 to plus 20, and they exist so that the house is not inert on
day one.

Version 0.1 never specified starting trust. If everyone starts at zero and the
alliance threshold is 55, no alliance ever forms and the entire game fails to
start.

### 7.2 Trust matrix

`trust[i][j]`, how much Player *i* trusts Player *j*, stored as float in the range
minus 100 to plus 100. **Asymmetric**: you can love someone who is playing you.

| Event | Raw delta |
|---|---|
| Positive conversation | +4 to +10 |
| Alliance formed | +15 |
| Saved with veto | +25 |
| Believed to have voted to keep them | +12 |
| Believed to have voted them out | -30 |
| Named them At Risk | -20 |
| Broken promise, blame assigned | -35 |
| Caught in a lie | -25, plus a suspicion flag |

**Every delta is soft clamped by distance from the rails**, so the final twenty
points of trust cost roughly triple. Without this, deltas of 15 to 35 against a
200 wide range pin the whole matrix to plus or minus 100 within four weeks and the
label ladder collapses to its end bands.

*Calibration target:* at Final 5, no more than about two pairs in the house sit in
the top band.

### 7.3 Decay

Trust decays **toward the pair's baseline, not toward zero**, keyed to weeks since
last interaction rather than a flat weekly tick. Neglected relationships fall back
to how two strangers would feel, which is a better model than amnesia and finally
gives `lastInteractionWeek` something to do.

`paranoia` accelerates positive decay and slows negative recovery. A paranoid
Player is both "what have you done for me lately" and a grudge holder. Version
0.1's "decay toward 0 scaled by paranoia" made paranoid Players forgive fastest,
which inverts the attribute.

### 7.4 The belief layer

**This is the core mechanic and version 0.1 did not have it.**

Every Player, including the AI, stores `belief[j] = { value, asOfWeek, confidence }`
separately from the truth. Players act on beliefs. Nobody, not even the AI, reads
the true matrix.

- **On interaction**, belief refreshes toward the true value. A Player with high
  `deception` who is working you refreshes your belief toward a *false* value
  biased in the direction they want you to hold. Whether the distortion lands is
  the detection roll in section 9.
- **Between interactions**, belief holds still while truth drifts. Confidence
  decays with staleness and the label visibly ages.

The AI running on the same code path is what produces believable mistakes for
free, rather than as a special case. An AI misreads the house for the same reason
you do: it has not talked to that person in three weeks.

### 7.5 Alliances

Alliances are emergent. Each week, any pair whose *mutual belief* exceeds the
threshold has a chance to formalize, scaled by ambition. Alliances grow by
recruitment from existing members, and merge when membership overlap is high
enough.

- `members[]`, from 2 up to majority size, meaning half the house plus one
- `strength`, 0 to 100, decays weekly, rises with successful joint votes
- `leakRate`, chance per week a member reveals the alliance to a non member
- `priority{}`, per member, a normalized 0 to 1 weight rather than a rank

`priority` is a weight and not a rank because version 0.1 resolved conflicts with
`strength × trust × priority`, and multiplying by a rank rewards the alliance you
care about least.

**Size is the pressure.** Betrayal probability per member per week scales with the
square of membership, and alliances above roughly five leak within two weeks. An
alliance at majority size wins every vote by definition, so without steep scaling
the game solves itself. When the house shrinks below an alliance's size, the
alliance sheds its lowest priority members.

**Breadth is the other pressure.** Belonging to many alliances raises your
exposure: more people can catch you working against them, and Captains
increasingly read you as playing the house too hard. More plans is not more
safety.

### 7.6 The label ladder

The player never sees a relationship number. They see a band, derived from their
*belief*, never from truth.

| Belief range | Label |
|---|---|
| -100 to -70 | Done with you |
| -70 to -40 | Cold |
| -40 to -15 | Wary |
| -15 to 15 | Neutral |
| 15 to 40 | Warm |
| 40 to 70 | Solid |
| 70 to 100 | Ride or die |

Bands are contiguous and half open on the upper bound, so a float never falls in a
gap. Version 0.1's ladder left 14 to 15, 39 to 40, and 69 to 70 undefined.

Labels age visibly when you neglect someone. The post game recap reveals the true
values alongside what you believed, which is the payoff of the whole system.

---

### 7.7 Naming

A group of two who trust each other has a deal. A group that is three, or that
is two and has held for five weeks, gets **called something**, once, and keeps
that name for the rest of its life.

Names are assembled from an authored bank on the `text` stream, so a seed
produces the same house every time. Seventy percent are an identity (The
Brigade, The Cookout, The Quiet Room) and thirty percent are a headcount (Core
Four, The Six, Three Deep). **The headcount is baked in at the moment of naming
and never revised.** The Six being down to three and still calling itself The
Six is the cheapest piece of storytelling in the build and it comes free.

Measured, at `ALLY_NAME_WEEKS` 3, 5, 6 and 7: five gives a mean of 2.9 named
groups per run with four percent of runs producing none. On the size route
alone it was 26 percent of runs with no named group at all, which is a feature
a quarter of players would never see.

**What naming does mechanically is spread.** An unnamed group leaks to one
person a week, when somebody lets something slip; a group that lives four weeks
therefore caps out at four of thirteen knowing about it however high the rate
goes. A name is different in kind, because a name is repeatable: you do not
have to witness The Committee to have heard of it. So a named group rolls per
outsider, every week. That took visibility of a named group from 4.1 percent of
outsiders to 18.7 percent, and it is the number the alliance map is drawn from.

**What naming does NOT do is make you a target, and the design tried hard to
make it.** See the third correction in §15 Stage 12.

### 7.8 Showmances

The one bond in this format that the house treats as a single number.

An alliance is an agreement about the game. A showmance is not, and it behaves
differently on every axis: it does not decay on neglect, it cannot be kept
quiet (each outsider learns of it at 45 percent a week), and neither half will
move against the other for any reason the model can express. In exchange the
house stops seeing two players and starts seeing one number, and removing
numbers is what this format is.

They are stored **outside** `alliances` deliberately. Everything that reads
alliances reads them as strategic groups: breadth exposure, betrayal scaling
with the square of membership, the majority-size shed. None of that is true of
a couple, and folding them in would have quietly broken all three.

| Term | Effect |
|---|---|
| `SHOW_FORM_TRUST` 68 | mutual, well above the alliance threshold |
| `SHOW_MAX` 2 | in the house at once |
| `SHOW_SHIELD_NOM` 60 | a Captain does not name their partner |
| `PAWN_SHOWMANCE` -45 | and does not seat them as a pawn either |
| `SHOW_SHIELD_VOTE` 30 | and does not vote them out |
| `SHOW_HEAT_FLOOR` 7, `SHOW_HEAT_SHARE` 0.20 | once seen, each half carries part of the other's threat |

Once it has ended in front of the house it does not restart. Without that, the
same two people broke up and got back together every other week, which reads as
a bug however true to life it is.

**The shield needed two terms, and finding out why took an ablation.** The
nomination shield alone left a Captain naming their own partner 15 percent of
the time, and raising it from 44 to 110 did not move that by a tenth of a point.
The shield was never on that path: the pawn seat is chosen by a separate `fit`
score whose ingredients are low house appetite, high Captain trust, shared
alliance and prior pawn duty, which is a description of a showmance partner. The
Captain was shielding their partner from being the target and then seating them
as the pawn. With `PAWN_SHOWMANCE` in, it is 0.4 percent; with both terms off it
is 22.2 percent.

### 7.9 Does being liked pay

For most of this build it did not, and that was the oldest structural defect in
the model.

Trust feeds `socialReach`. `socialReach` feeds `threatScore`. So being widely
liked buys protection through `cover` and paints a target through threat at the
same time, and for a long while the target won. Handing the player a flat trust
gift from the whole house every week:

| Gift per head per week | Reached the last five, before | after |
|---|---|---|
| none | 45.0% | 36.1% |
| +3 | 36.0% | 37.0% |
| +8 | **31.6%** | **43.6%** |
| +20 | 50.6% | 64.1% |

The gift is artificial on purpose. It is the only way to move one input and hold
everything else still, which is what a controlled measurement is.

**Being liked made you worse off**, which is wrong for the genre and quietly
blunted every social mechanic built on top of it. The information layer in §20
had to invent a second currency to be worth building at all.

**Where the damage actually was.** Not where it looked. Nomination rate barely
moved with likeability (15.9 to 18.4 percent of weeks) and loss-when-nominated
was flat (44.8 to 43.6), so neither of the obvious channels explained a ten
point drop in survival. A per-week hazard curve localised it: the well-liked
player was dying in **weeks two to eight**, at roughly double the rate, while
actually being safer late. That is backwards. Social threat is a late-game
phenomenon in this format; being liked early is supposed to be pure upside.

Two defects, both in how the Panel term entered threat:

1. **`TH_PANEL` did not ramp.** `wSocial` was carefully faded in across the run
   and `TH_PANEL` sat beside it at full weight from the instant the first person
   was evicted. A term worth nothing in week six and thirty percent of the
   threat score in week seven is a cliff nobody in the house could explain.
2. **`panelEquity` reported a coin flip as a fact.** A one person Panel can only
   answer 0 or 100. That got handed to `threatScore` at full weight, so anybody
   the first juror happened to like read as a maximum jury threat for the rest
   of that week.

Both land hardest on exactly the players the ramp existed to protect, because a
well-liked player reads high the moment there is anybody to read them against.
`TH_PANEL_EARLY` fixes the first. `PANEL_PRIOR`, two and a half
pseudo-observations at even odds, fixes the second: one juror who likes you now
reads 67 rather than 100, and a full Panel swamps the prior and tells the truth.

That removed the dip. `COVER_SOCIAL` from 0.35 to 0.45 supplied the slope:
measured at 700 runs a setting, 0.35 gives +0.3pp from none to +8 (flat, inside
its own error bar), 0.45 gives +3.4pp, and 0.55 gives +8.9pp but drops the
baseline and pushes three other proxies toward their limits.

**The shape this now wants, and the gate that holds it:** never negative, mildly
positive in the normal range, clearly positive at the top. `node simulator.js
--curve` fails if the slope goes back below zero.

## 8. Threat and Vote Resolution

### 8.1 Threat

Every input is normalized to 0 to 100 before weighting, so the weights mean what
they say.

```
compNorm   = percentile of j's comp wins within the active house
socialNorm = (count of belief[*][j] > 40) / (activePlayers - 1) * 100
panelNorm  = (Panel members with belief > 20 toward j) / panelSize * 100

threat[i][j] = 0.40 * compNorm
             + 0.30 * socialNorm
             + 0.30 * panelNorm
```

Before the Panel exists, the panel weight redistributes across the other two
rather than sitting at zero and then lurching.

`isolation` from version 0.1 is deleted: it was the inverse of social reach and
was double counting. Version 0.1 also had `compWins * 12` reaching about 150 while
`socialReach * 0.4` capped at 6, which made social reach four percent of the
signal in a game about social play.

Threat is **subjective and indexed by both parties**. Each AI computes it from
their own beliefs, with error scaled by `(100 - perception)`. The error is a
**persistent per pair bias**, re-rolled only on major new information, not fresh
noise every tick. A persistent bias reads as a Player who is wrong about someone.
Fresh noise reads as a Player who is broken.

### 8.2 Nomination intent

A Captain does not name two people. They pick **one person they want gone** and
then work out how to get them out. Version 0.2 had only the first half, both
names carried equal weight, and the house had nothing to read, which removed the
strategy the genre is built on.

Every naming now produces a plan in one of three shapes:

| Shape | What it is | Rate |
|---|---|---|
| direct | two people the Captain would be happy to lose either way | ~70% |
| pawn | one target, and beside them somebody the house will not take | ~23% |
| backdoor | neither nominee is the target, and the Veto is the plan | ~7% |

That is roughly one backdoor attempt per run, of which two thirds land. It is
deliberately not more: pushing the rate up moves comp beast survival back to
parity with the field, because a plan that misses is a week the target got for
free, and the proxy in §15 is the gate.

The plan's `target` is the field everything else reads. It leaks to the house
(see 8.3), it drives the replacement nomination, and it is the only thing that
makes a pawn a pawn rather than a second nominee.

**Pawn.** The second seat goes to whoever scores highest on "the house will not
take you": low house appetite, low threat, and enough trust from the Captain that
it can be sold to them. The pawn still goes home about 15 to 20 percent of the
time, which is the entire folklore of the move and needs no special case: if the
room dislikes the pawn more than the target, the private leans outvote the pull.

**Not worth the week.** A Captain does not spend their week on somebody who is
no threat and is not coming for them. Three things must all be true: they hold
no power the Captain can see, the Captain reads them as friendly, and they have
never put the Captain up before. Multiplied rather than added, so any one of
them failing brings you back into range, and scaled by how full the house is so
it switches off entirely by Final 6. Pawn duty also concentrates: the pawn is
somebody the Captain can actually talk to first, which means their own alliance,
and often somebody who has sat there before and survived. Together those take
the last eight from 2.75 clean to 3.26.

**Backdoor.** Appeal reads off two things already modelled: the target's comp
record, because they would win the Veto and walk, and their **cover**, because
the room would not forgive a straight shot. Cover is weighted higher than comps.
The attempt is then multiplied by a **route** term, which is what a real Captain
checks first: their own comp standing, plus how much of the house is committed to
them. Without the route gate the move was a free week for exactly the people it
was aimed at, because it fired on comp record and then failed a third of the
time with the target never on the block at all.

A backdoor only lands if somebody opens the seat. The Captain executes their own
plan; an ally mostly goes along, since taking a pawn down costs them nothing; a
nominee saving themselves opens it by accident. Anybody else never hears the plan
and it simply dies, which is the correct failure and is why winning the Veto
yourself matters.

### 8.3 Eviction

Votes are **always anonymous**. The tally is read aloud, never attributed.

```
evictScore(voter, target) =
      0.35 * (100 - belief[voter][target]) / 2      // 0 to 100
    + 0.30 * threat[voter][target]                  // 0 to 100
    + 0.25 * alliancePressure(voter, target)        // 0 to 100
    + 0.10 * panelThreat(voter, target)             // 0 to 100
    + volatilityNoise(voter)                        // zero mean, scaled by volatility
```

Each voter scores both At Risk Players and evicts the higher. `alliancePressure`
is where campaigning pays: a successful pitch sets a vote intent flag that
alliance members can see and mirror, scaled by alliance strength.

Members of a solidified alliance, and a Final 2 partner, get probabilistic
visibility into their allies' intent, scaled by strength and by `perception`.
There is a standing small chance of AI to AI side deals producing a vote you did
not see coming. You should be blindsided sometimes.

**The Panel weight grows as the Panel fills.** "Can I beat them at the end" is
the whole late game of this format, and it was a flat 0.10 term from week one,
which is wrong at both ends: in week two nobody is thinking about a jury that
does not exist, and at Final 5 it is often the only thing anybody is thinking
about. `EV_PANEL` is now 0.30 scaled by how many seats are filled, from 18
percent of that at an empty Panel to all of it at seven. It is the deciding term
in 0.9 / 2.4 / 6.2 percent of votes across the first half, the jury forming, and
the last five, and switching it off changes half of all evictions at six or
fewer. Stopped at 0.30: at 0.45 voters start keeping whoever the jury does not
respect, an uncovered comp beast is exactly that, and the design pillar dies.

The player can see it. Once the Panel starts filling it appears as a fifth bar
on the stage and as its own section in the House panel, in bands with no
figures. Before that the people who decide the winner were the only people in
the game you could not look at, because jurors dropped off the wall the week
they were evicted.

**Coalescence.** The formula above is what each voter privately wants. It is not
what they do. A house votes as a house, and version 0.2 did not: sixteen
independent calculators produced 31.5 percent minority vote share, 27.8 percent
one-vote margins and 12 percent ties, which is nothing like a real season.

Resolution is therefore two passes. Pass one collects every private lean and the
margin behind it. `houseConsensus` then works out where the house is going: the
Captain's target if the room read it, otherwise the lean with the most social
weight behind it. Pass two lets each voter decide whether to go there.

```
hold   = margin * 0.011                       // how wrong it feels privately
       + loyalty  * 0.35   if allied to the consensus target
       + volatility * 0.30                    // some people do their own thing
       - paranoia * 0.30                      // fear of being the odd vote out
follow = 0.74 - hold
```

`HOH_INTENT_LEAK` is how reliably the room reads the Captain, at 0.72. Swept:
the Captain's target went home 82.0 / 83.2 / 85.4 / 88.0 percent at 0.60 / 0.66 /
0.72 / 0.80, and the pawn went home 21.2 / 19.9 / 19.6 / 17.9. Real seasons sit
near 80 to 85 and near 15 to 20, and 0.80 put the Captain above both.

Measured after: unanimous 41 percent (the most common outcome, as it should be),
minority vote share 14 percent, ties 3.6 percent.

### 8.4 The reveal, and blame

The reveal is sequential and anonymous. Votes stack up one at a time without
names. A 6 to 5 flip still lands, and arguably lands harder, because you are
watching the count and not the credits.

Because votes are anonymous, **discovery becomes inference**. When the tally
contradicts what you were promised, each injured party distributes suspicion
across the plausible flippers, weighted by prior suspicion, threat, alliance
membership, and `perception`. Blame can land on the wrong person, and often
should.

The Fallout phase is therefore not a readout. It is where the house decides who it
thinks lied, and it is the drama engine.

---

## 9. The Week, From a Chair

Version 0.2 listed a verb set: Talk, Pitch, Lie, Form alliance, Eavesdrop, Leak.
Those are what the ENGINE does. They are not what a week feels like to play, and
a UI built directly on them is a menu of abstractions.

What a week feels like is playing chess in the kitchen with somebody who keeps
asking who you would take to the end.

### Energy

One pool for the whole week, not a fixed budget per Scheming window.

| | |
|---|---|
| Base | 12 |
| On Rations | minus 3 |
| Sitting At Risk | plus 2 |
| A scene | 2 |
| The risky answer | 3 |
| Eavesdrop | 2 |
| Confessional | free |

Six real conversations a week against fifteen people. Everyone you skip decays
back toward how they felt about you on day one, so neglect has to bite.

Energy carries across all three Scheming windows, which makes *when* you spend
it a decision. Spend early and you buy information before the Captain has named
anybody. Hold it back and you buy votes after the Veto ceremony, when the week
has taken its final shape. Both are real plans and both can lose.

### Scenes

A moment is assembled from two independent banks:

- **SCENES**, where you are and what your hands are doing. Pure flavour.
- **BEATS**, what the conversation is actually about, and the three answers. All
  the mechanics.

40 scenes against 54 beats is over two thousand distinct moments from 283
authored fragments, and adding one scene adds another 54. That is the only way
to get real variety and still hand author every line, which §17 requires. Same
authored-fragments-plus-deterministic-assembly rule as the string banks, one
level up.

Which beat you get is chosen by the state of your week, then drawn from the
seed. Being on the block produces a different conversation from being safe in
week two. The pools are `bond`, `probe`, `float`, `recruit`, `defend`,
`deflect`, `gossip`, `power`, `captain`, `late`.

### Four answers

Every moment offers **four**, and none of them is labelled. There used to be
three, tagged SAFE, EVEN and RISKY, always in that order. A badge saying RISKY
does the reading for the player, which is the one job the player came here to
do, so the badges are gone, the order is shuffled, and what tells you the cost
is what the option says.

Under the hood there are still three kinds. `safe` always works for a small
gain. `neutral` usually works, gains more, and often refreshes your read.
`risky` rolls against them: it wins big and does something mechanical, and when
it loses, if it named a person, that person hears about it by the evening.

The fourth answer is built from the house rather than the bank, so even an
ordinary conversation has one way out of it that is about somebody real.

**Live beats.** A third bank alongside SCENES and BEATS, whose lines take real
arguments: who is on the block, who the Captain wants gone, who told somebody
one thing last Thursday and did another. **Thirty five** of them, each declaring
the situation it needs, weighted so the rare and urgent ones beat the ones that
are true every week. About sixty percent of conversations are one.

**A run does not ask you the same thing twice.** Measured before this rule: 10.8
percent of a player's conversations in a run were repeats and the top beat was
16.2 percent of everything, because selection was uniform over whatever
currently applied and the beats that apply most often are the ones that apply
nearly always. A per-run tally drops a beat you have had to a twelfth of its
weight, and a second time to a fiftieth. It never reaches zero: at Final 5 with
four beats legal, "you have had them all" has to resolve to something.

| | before | after |
|---|---|---|
| repeat rate within a run | high, top beat 16.2% of all | 10.8%, top beat 4.9% |
| distinct beats over 60 runs | 38 | 91 |

The tally lives on the state, not in a module variable, so it survives a save
and a reload.

    "Jules says the house is going for Noor. They want to know if you are with it."
    "Kabir tells you Lachlan has been saying your name in the other room."
    "Devora points out that Sunny has not sat up there once. Not one week."


### The verbs that survive

Eavesdrop and the Confessional stay as they were. One is not a conversation and
the other is not with anybody.

## 10. Competitions

Comps are short skill or luck minigames, 20 to 45 seconds, six to eight types at
launch, rotated.

**Every comp is a blend with a named primary:** 60 percent primary attribute, 25
percent secondary, 15 percent luck. Version 0.1's section 8 mapped each comp to
one attribute and its section 4 promised a weighted blend. Both are now true.

- Reaction timing bar, primary `precision`
- Memory sequence, primary `mental`
- Hold the button with escalating distraction, primary `physical`
- Trivia on in game events, primary `mental`
- Slider balance, primary `precision`
- Pure randomizer, primary `luck`

Comps are the hardest thing to keep fresh, so the comp layer is built as a
**framework with a shared scoring interface**: a new minigame is a module that
returns a normalized 0 to 100, and adding one never touches the engine.

The human performance to attribute normalization curve is the hardest number in
the build. It is solved by sweep in Stage 4, not by guessing.

### Throwing

Throwing is first class and must be surfaced in the UI. A thrown comp resolves
instantly by simulation, which also claws back session time.

**A throw is a gamble, resolved by the house, not by a die.** Whether it worked
depends on who wins:

- An ally wins, and their own trust and alliance math means they have no reason to
  name you. The throw worked.
- A non ally wins, and their math frequently points at you or your allies. The
  throw backfired.

That second case is a **calibration target of roughly 70 percent**, not a 70
percent roll. The nomination weights get tuned in Stage 4 until non ally Captains
target the thrower or their allies about that often. Sometimes a non ally wins and
it does not touch you, and that happens because their math genuinely pointed
elsewhere.

**Costs.** A throw lands you in the bottom band, so you take Rations. Throwing
**three or more comps in a row**, counting Captain and Veto comps together, raises
suspicion across the house. AI throw comps too, using the same self assessment,
so this is not a player only verb.

### Rations

The bottom three or four finishers in the Captain Comp go on Rations for one week:
a penalty to next week's comp performance and faster trust decay. Poor food and
poor sleep.

---

## 11. Endgame

- **The Panel** is the last seven Players evicted. A Player evicted twice counts
  once, at their later eviction.
- Panel members carry their exit day belief and threat values, plus `bitterness`
  derived from how they left: whether they were blindsided, whether a promise to
  them was broken, who they believe named and evicted them, and whether that
  belief is correct.
- Final 2 face questioning. The player answers by choosing strategic framings,
  own your moves or play humble, and each framing lands differently against each
  Panel member's archetype and bitterness.
- Panel votes on `respect`, meaning threat read with bitterness inverted, blended
  with belief.

A Mastermind rewards big moves. An Anchor punishes betrayal.

**Bitter jury.** If you lied to or betrayed a Player who reaches the Panel, there
is a probability they withhold their vote regardless of your game. It scales with
the size of the betrayal and inversely with their `loyalty`.

Seven Panel members means no ties.

*Calibration targets:* unanimous Panel votes under about 20 percent of runs, and 4
to 3 finishes at least 25 percent.

---

## 12. Twists and Powers

### Scheduled twists

- **Double Eviction**, every run, on a week drawn from 5 to 9. Removes a week.
- **Bounce Back**, 33 percent of runs, week drawn from 6 to 10 and never
  adjacent to the Double Eviction. The returning Player is drawn from the **last
  six evicted**, whether or not the Panel has started forming. A returnee can be
  evicted again and rejoins the Panel. Adds a week.

**Blind Vote is cut.** Votes are always anonymous, so hiding the tally would
delete the sequential reveal and turn Fallout into a no op.

### Powers

Six, replacing version 0.2's single vague Envelope. A run draws 0 to 2, on
scheduled weeks between 3 and 10, and each expires 3 weeks after it is awarded.
Use it or lose it.

| Power | Secrecy | Played at | Overrides |
|---|---|---|---|
| **Extra Vote** | known | Eviction | Cast two votes instead of one |
| **Lose a Vote** | victim only | Eviction | Silently stripped of your vote |
| **Veto Player Selection** | public | Veto draw | Pick one player into the Veto Comp |
| **Diamond Veto** | hidden | Veto ceremony | Pull a nominee AND name the replacement |
| **Back to Back** | public | Captain Comp | Play the comp you are barred from |
| **Week of Safety** | known | Before Naming | Cannot be named or evicted |

**Secrecy is a game state, not a UI flag,** and the three levels behave
differently. `public` means everyone knows who holds it from the moment it is
awarded. `hidden` means nobody knows anything until it fires. `known` is the most
interesting: the house is told a power is loose but not who has it, which turns
the week into a hunt and makes every unexpected vote count deniable. A `known`
power raises suspicion across the whole house whether or not it is ever played,
because paranoia about an unseen vote is a real cost.

**Lose a Vote is never drawn on its own.** A power that only takes something away
and gives the holder nothing is a bad beat rather than a mechanic. It is attached
as the *price* of another power, roughly 45 percent of the time, which is the
shape that makes it interesting: somebody in this house accepted something, and
somebody else is paying for it without knowing.

Powers are weighted **away** from the sitting Captain and **toward** players who
have been At Risk. A power landing on whoever is already running the week
compounds an advantage; one landing on somebody who has been on the block twice
is a lever. That is the only deliberate thumb on the scale in the system.

Every power needs an AI policy legible enough to put in a recap sentence, per §1.
An AI plays a Diamond Veto because their closest ally was named and they had
somewhere to put the heat, not on a coin flip. Measured play rates: Diamond 84
percent, Extra Vote 73, Week of Safety 55, Veto Player Selection 48, Back to Back
29.

### Still unspecified

**Split House** has no voting rule. See §18.

## 13. Data Model

```
Account
  handle, gender, homeRegion
  xp, level, tokens, coins
  tree: { nodeId: purchased }
  attributes derived from tree
  career: wins, panelAppearances, avgFinish, compWinRate, evictions, streak

Run
  seed, levelBracket, week, phase, twists[], rng: { gen, comp, ai, text }

Player
  id, name, gender, homeRegion, archetype, treePath, avatarSeed
  comp:   { physical, mental, precision, luck }
  social: { charisma, deception, perception, loyalty, paranoia, ambition, volatility }
  hiddenGoal, bitterness
  status: active | evicted | panel
  compWins[], compsThrown[], timesAtRisk, weeksAsCaptain, onRations

Relationships
  baseline[i][j]
  trust[i][j]
  belief[i][j]: { value, asOfWeek, confidence }
  suspicion[i][j]
  lastInteractionWeek[i][j]
  threatBias[i][j]

Alliance
  id, members[], strength, leakRate, formedWeek, priority{}

Promise
  id, from, to, week, claim, kept

WeekLog
  captain, atRisk[], vetoHolder, vetoUsed, replacement,
  compResults[], throws[], tally{}, votes[{voter, target, promisedTarget}],
  evicted, blameAssigned[], trustDeltas[]
```

`WeekLog` is the whole game history. It powers the post game recap, the trivia
comp, and the share card. Note that `votes[]` records the truth for the recap even
though the truth is never shown during the run.

---

## 14. Technical Notes

- **File layout follows The Perfect Season**, not a single file. RunTheRopes is
  already 7,400 lines across four files and this simulation is larger. Planned:
  `rng.js`, `generate.js`, `engine.js`, `run.js`, `belief.js`, `comps/`,
  `strings/`, `board.js`, `simulator.js`, `playtest.js`, `index.html`.
- The presentation layer is built for this game specifically. It should not read
  as a sibling of the football game.
- **Desktop first, fully responsive to mobile.** Both are first class.
- Seedable mulberry32 across four named streams.
- Full state serializable to one JSON blob. Continuous autosave to localStorage.
  Supabase later for accounts, the career layer, leaderboards, and seed sharing.
- Because progression lives on the account, run results submitted to a board are
  forgeable client side. Either the board accepts that, or runs are validated by
  server side replay from the seed and the action log. Decide before Stage 10.
- Procedural avatars from the seed, custom shape vocabulary, no purchased pack.

---

## 15. Build Roadmap

**Stage 1, deterministic spine.** DONE. RNG streams, name pools, the skill tree data and
its archetype resolver, account and character creation, generation, JSON round
trip, and the string lint. Exit: one seed produces a byte identical house twice,
in Node and in browser.

**Stage 2, relationship engine, headless.** DONE. Baseline affinity, trust, decay,
belief, the detection roll, alliance formation and growth and betrayal, threat,
vote resolution, blame assignment. Exit: alliances form and break with no human
present, and trust does not pin to the rails by week four.

**Stage 3, week loop, headless.** DONE. All fourteen weeks including Final 5, 4, and 3,
plus an AI stand in for the human seat. `playtest.js` prints a full run as
readable text. This is the design instrument. Most tuning happens by reading these.

**Stage 4, calibration harness.** DONE, all proxies green. `simulator.js`, 1,000 headless runs, sweep mode
for every weight. **Nothing reaches the UI until this passes.**

Targets:

| Proxy | Target |
|---|---|
| Week 1 boot | Almost never the most trusted Player |
| Comp beasts | 3+ wins by week 6 means below average survival to Final 5 |
| Winner profile | Above median trust at Final 5 in about two thirds of runs |
| Archetype win rate | Per Player, within a few points of the 6.25 percent baseline |
| At Risk spread | At least 60 percent of the cast At Risk once before Final 5 |
| Alliance lifespan | Median 3 to 5 weeks, under 10 percent survive to Final 3 |
| Blindsides | At least one per run where the tally contradicts stated intent |
| Panel spread | Unanimous under 20 percent, 4 to 3 at least 25 percent |
| Thrown comp backfire | Non ally Captain targets thrower or allies about 70 percent |
| Level parity | Level 60 wins no more than about 1.5 times as often as level 1 |

**Stage 5, belief layer surfaced.** DONE. Built before the UI, not inside it. Retrofitting
fog onto screens built on true values is a rewrite.

**Stage 6, week loop UI.** DONE. Text driven phases, action budget, anonymous sequential
reveal, house as physical space.

**Stage 7, comps.** DONE, six minigames. The framework, six minigames, the normalization sweep, throwing.

**Stage 8, character and progression.** DONE. Creator, Move In Night, tree UI, XP, levels.

**Stage 9, endgame.** DONE. Panel, bitterness, questioning, bitter jury.

**Stage 10, twists.** Double Eviction and Bounce Back in. Flavour twists pending. Last, because most of them modify a loop that has to be
stable first.

**Stage 11, recap, share, board, store.** Truth-reveal recap in. Board and store pending.

**Stage 12, alignment with the format.** In progress. Playthroughs against real
seasons found six places where the simulation was structurally honest but did not
behave like the genre it is modelling.

| # | What | Status |
|---|---|---|
| 1 | Vote coalescence: the house votes as a house | DONE, §8.3 |
| 2 | Nomination intent: pawn and backdoor | DONE, §8.2 |
| 3 | Named alliances with size and identity, plus showmances that draw heat as a unit | DONE, §7.7 and §7.8, and see the third correction below |
| 4 | Floater logic, so some people genuinely skate | DONE, §8.2, and see the correction below |
| 5 | Jury management: make the Panel matter in the last three weeks | DONE, §8.3 |
| 6 | Rituals: Captain's room, nomination speeches, rations bonding, campaigning from the block | DONE, §19 |

**Two corrections to the numbers this roadmap was written from**, kept because
the mistakes are more instructive than the fixes.

*Item 4 was measured wrong.* The stated problem was "15.5 of 16 are nominated
per run against 2 to 4 who never are in a real season". Both halves are bad.
Nearly everybody being nominated eventually is FORCED by the rules: thirteen of
sixteen are evicted and every eviction needs a nomination, so the ceiling on
never-nominated is three and real seasons sit at zero to two. And the count that
does mean something, how many of the last eight got there without ever sitting
on the block, was measured at the END of the run, which scores somebody who
coasted to the final eight and was then nominated at Final 7 the same as
somebody who sat there in week two. Snapshotted correctly at the moment the
house hits eight, the game was already at **2.75 of 8**, inside the range real
seasons produce. The "not worth the week" term shipped anyway, sized small, on
the grounds that the behaviour was genuinely missing and it opens a way of
playing the game did not have. It lands at 3.26.

*Item 5 was nearly the same mistake in reverse.* The stated problem was that the
Panel term "decides 0.4 percent of votes", which is true and misleading:
switching the term off entirely still changed 17.2 percent of evictions. It was
never inert. It was a tiebreaker that never got to be the reason. So the fix was
not a bigger flat weight, it was a curve.

*Item 3 produced a mechanic that could not be made to work, and it was deleted
rather than shipped.* The roadmap asked for named groups that get hunted as a
unit, so `pairHeat` shipped with a named-alliance term and the harness got a
proxy for it. The proxy read 19.5 percent of named-group member-weeks At Risk
against 14.9 percent for unnamed, which looks like a pass. **With the constant
zeroed it read 19.6 against 14.7.** The gap was entirely a confound: members of
named groups are better connected, and everything about them differs from
non-members besides the name.

Paired ablation on identical seeds then killed it properly. Sweeping
`HEAT_NAMED` from 0 to 45 across three formulations, at n around 6500, never
moved the nomination rate of named-group members outside noise and never moved
it monotonically. Three separate diagnoses were each real and each insufficient:
almost nobody could see a named group (2.6 percent of outsiders, so the
visibility gate was false 96 percent of the time); the size term discounted the
first two members, so the 63 percent of named groups that are pairs drew exactly
zero; and three-plus groups are 327 member-weeks in 6500, far too rare to
measure anything against. Fixing all three still moved nothing, because **the
nomination block holds exactly two seats a week and named-group members already
take a disproportionate share of them.** A conserved quantity cannot be pushed.

So the term is gone, and what replaced it is the thing naming demonstrably does:
it spreads. That proxy reads 18.5 percent against 1.8 and drops to 2.0 percent
when `ALLY_LEAK_NAMED` is zeroed.

The general lesson, now a rule: **a proxy that cannot fail is not a test**, and
the only way to know is to switch the mechanic off and re-run. The old "at least
60 percent of the cast sit At Risk once" reported 99 percent every run while
measuring the rules rather than the model. It was replaced with the
clean-to-eight band, which can fail in both directions. Item 3 added the
sharper version of the same rule: a cross-sectional comparison between two
populations can never isolate a constant, because the populations differ in
everything else too. **Ablate on identical seeds, or do not claim the mechanic
works.** Of the three proxies written for items 3 and 6, that test killed one
outright, promoted one to a gate, and demoted one to a reported number whose
effect is real but too small to gate on without flaking.

---

## 16. Meta Layer

Version 0.1's hard rule was "no competitive advantage from playtime" and an
explicit ban on stat boosts. **That rule is retired.** It was also already false:
comps are real skill minigames, and a veteran is better at a reaction bar than a
newcomer. The document forbade a mild version of an advantage it was shipping a
strong version of.

The replacement principle:

> **Playtime buys expression and range, and the house scales to meet it.**

Progression is real. Tokens buy attributes. What keeps it fair is that the house
gets stronger with you, and that every point you spend makes you a bigger target,
because in this format being good at things is how you get evicted.

Enforcement is the Stage 4 level parity target, not a promise in a design doc.

**Tracked across runs:** wins, Panel appearances, average finish, comp win rate,
career eviction count, longest survival streak, archetype counters.

**Coins buy cosmetics only:** shirts, packs, house themes, Confessional framings
and voice options, alternate name pools, title cards, and optional challenge
modifiers the player turns on themselves, which make runs harder rather than
easier.

---

## 17. Art and Copy Direction

The look must be authored, not assembled.

**Copy rules**

- No emojis, anywhere, ever
- No em dashes in any UI string, Confessional line, or generated text
- No generic assistant phrasing. Nothing sounds like a chatbot explaining itself
- Voice is dry, observational, a little cold. The house narrates like it has seen
  this before
- No filler, no "Great job", no exclamation points outside genuine reaction moments

**How strings are actually produced.** Every fragment is hand authored. Sentences
are assembled from fragment banks keyed by beat, archetype, relationship band, and
phase, drawn deterministically from the `text` RNG stream. A run needs hundreds of
distinct beats, which cannot all be individually written and cannot be freely
generated without breaking the voice. Authored fragments plus deterministic
assembly is the only honest reading of "every string is hand authored".

A build time lint fails on em dashes, emoji, stray exclamation points, banned
phrasing, and any fragment pair that assembles into doubled spaces or orphaned
punctuation. It is cheap now and expensive to retrofit.

**The no numbers rule scopes to player to player relationship values only.**
Numbers are fine everywhere else: timers, comp scores, career stats, the tree.

**Visual rules**

- Light. Cream page, white cards, blue ink, one red stamp
- Custom typeface pairing, one display face with real personality plus one
  workhorse for body, and both of them chosen for READING, not for mood
- No stock icon sets. Every glyph drawn for this game
- Procedural avatars from a custom shape vocabulary
- Restrained palette, one aggressive accent reserved for eviction and betrayal
- Motion deliberate and sparse. The sequential vote reveal is the one place the
  game slows down

**The relationship ramp moves through hue, not just temperature.** Seven bands
have to be tellable apart at a glance on a wall of sixteen tiles. The first
light pass ran red through brown through grey into blue, which is elegant and
useless: Cold, Wary and Neutral were three muddy neighbours. Playtest: "the
colors that represent your relationship status feel way too dull and need to be
way more clear and identifiable."

| Band | | Meaning |
|---|---|---|
| Done with you | `#c81e14` red | they want you gone |
| Cold | `#e2601d` orange | |
| Wary | `#c99000` amber | |
| Neutral | `#8c98a5` grey | nothing either way |
| Warm | `#1c9e63` green | |
| Solid | `#1668dc` blue | |
| Ride or die | `#5b2bc4` violet | they are with you |

Grey sits at the middle and is the only desaturated step in the set, because
"nothing either way" should look like the absence of a reading rather than like
a reading. The band is drawn as a filled chip in its own colour, not four pixels
of border, because a wall of sixteen has to be readable in one sweep.

**The palette.**

| Token | Value | What it means |
|---|---|---|
| `--cream` | `#f7f3ea` | the page, warm paper stock |
| `--panel` | `#ffffff` | cards and panels |
| `--blue` | `#1c56c2` | the brand, and every primary action |
| `--ink` | `#17222f` | body copy, blue-black rather than black |
| `--signal` | `#c0392b` | eviction and betrayal, and nothing else |
| `--ok` | `#1f7a4d` | saved, landed, survived |
| `--hand` | `#a8762b` | powers and secrets |

**Type:** Archivo for display, Inter for body, 15.5px base. The first build set
body copy in letter-spaced monospace under condensed uppercase headings, which
looked like the reference and was tiring to read a sentence in. Uppercase now
belongs only to labels two words long, never to sentences.

**Why not dark.** Version 0.2 was a dark surveillance monitor. It photographed
well and read badly: sixteen relationship states, a log, and four bars of your
own game are a lot of small text, and small text on glass at low contrast is
where players stop reading and start guessing. The design idea did not change,
only the surface it is printed on.

**Reference feel:** a casting file on a producer's desk. Cream stock, white
cards clipped to it, blue pen, and one red stamp for the thing that is final.

### 17.1 The shell

The look is ours. The **shape** is borrowed from BitLife, deliberately and
specifically, because that interface is legible to millions of people who never
read a tutorial, and the reasons are structural rather than cosmetic:

1. **One blue button.** The thing that advances time is always in the same
   place, always the same colour, and always says what it is about to do:
   "Start the week", "Play for the Veto", "Hold the vote". A player is never
   looking for what to press. It was green first, matching the reference; once
   the brand was named as cream and blue, blue became the go colour and the
   interface was down an accent it did not need. Green survives only as an
   OUTCOME: saved, landed, survived.
2. **One decision at a time.** Everything that is being asked of you arrives as
   a card over a dimmed screen. Everything that is not being asked of you is
   either history you can scroll or a panel you chose to open.
3. **The log is the main surface**, grouped by week the way a life sim groups by
   age. It holds the whole run, not the last ninety lines, because the run is
   the story and the recap should not be the first place you can read it.
4. **Cards have a fixed anatomy**: a header strip with the kind of beat and who
   it is about, an icon and a title, one to three sentences, then either one
   button or choices stacked full width and thumb sized.
5. **Your own game as four bars**, pinned above the dock: Standing, Reach,
   Exposure, Energy. Wordless, because §17 keeps numbers off relationships and
   these are aggregates of exactly that.

What is NOT borrowed: the palette, the typography, the emoji, the exclamation
points, and the bright cartoon chrome. Those are the parts that would cost us
the voice, and none of them are what makes that interface work.

Choosing a person is a **list**, not the sixteen tile wall. The wall is still
the House panel, where reading the whole room at once is the point, but on a
phone a picker built on it was four rows of scrolling before you could see
everybody's name, which is exactly when a player stops knowing what the screen
is asking them.

One press, one beat: the loop stops as soon as there is anything to look at, a
card or a decision or even a single new line in the log. Phases that produce
nothing visible are absorbed, so it does not become twelve presses a week.

---

## 18. Open Questions

Version 0.1 said there were none. There were about thirty. These are what is left.

1. **Split House voting rule.** Who votes on which pair, how one of four survives,
   whether there are two vetoes. Unbuildable until answered. Twist is Stage 10, so
   this is not blocking.
2. **Move In Night is one beat.** It seeds starting trust off a single choice
   where it should be a short sequence, so a new account's on-ramp is thinner
   than §4 promises.
3. **Session length.** Roughly 27 comps and 117 action resolutions and paced vote
   reveals put the floor near 30 minutes with zero thinking time, against a 25 to
   40 minute target. Instant thrown comps help. If Stage 3 playtests come in long,
   the lever is the action budget, not the week count.
4. **Board integrity.** Client side results are forgeable. Server replay or accept
   it. Decide before Stage 10.
5. **Milestone XP list.** Stage 1 deliverable, not yet written.
6. **Full skill tree node list.** Stage 1 deliverable. The constraint is fixed:
   nodes grant attributes and unlocks, never behavior.
7. **Does the player's own belief distortion apply to AI reading the player.**
   Currently yes, symmetric. Worth confirming it feels right in playtest.
8. **Being liked used to be a liability. FIXED, see §7.9,** and the entry is
   kept because the diagnosis was worth more than the fix. The obvious channels
   (nominated more, evicted more when nominated) were both flat and explained
   none of it; a per-week hazard curve found the damage in weeks two to eight,
   caused by the Panel term entering threat at full weight from the first
   eviction and by a one person Panel reporting a coin flip as a fact. What is
   still open is whether the same class of defect is hiding elsewhere: no other
   ramped term in `threatScore` has been checked for a cliff at its boundary.
9. **Skill is currently a mild liability.** `--skill` shows that the better a
   player's hands, the more comps they win and the worse they finish, because
   power paints you. The weight is set at 0.45 to keep that from becoming a tax,
   but the real release valve is knowing when to throw, and nothing has measured
   whether a player who throws well beats both ends of that table.
10. **Comps still cost a socially strong player a little.** The `cover` mechanism
   fixed the case where a floor game made a comp winner worse, but holding power
   means naming people and the house remembers. The right way to close the last
   of it is to make comp wins pay MORE, not to soften the social game further.
11. **The risky answer is level with the safe one, not better.** It should be a
   lever worth pulling when the effect is needed. Right now a selective player
   should beat a spammer, which is correct, but the policy is not selective
   enough to prove a selective player also beats a cautious one.

---

## 19. The Rituals

The format is not only its rules. It is a set of things that happen every week
in the same order, and the game had almost none of them: the Captaincy was worth
exactly two nominations, the nominees appeared without anybody saying anything,
rations were a stat penalty, and a player At Risk made small talk like everybody
else. All four are cheap in model terms and none of them are cheap to a player.

Every one is a trust delta on top of a decision the model already made. None of
them is a second economy.

### 19.1 The Captain's room

A door that locks, a bed nobody else has slept in, and photographs of people who
are not in the house. The Captain takes up to two people up first, and the other
twelve find out about it afterwards.

| Term | Value |
|---|---|
| `ROOM_GUEST` | +9 to each guest, half of that back to the Captain |
| `ROOM_SNUB` | -2 from everybody who was not asked |

Roughly net neutral per week and heavily concentrated, which is the point:
picking the same two people every week costs you the room. Skipped on the second
leg of a Double, because there is no evening in a Double.

### 19.2 Nomination speeches

The only public statement of intent the format contains. Four framings:

| Speech | Effect |
|---|---|
| **pawn** | +11 to the pawn, -4 to the target. **If there is no pawn, -6 with the whole room** |
| **threat** | -9 to the target, +3 to the other, and +9 threat bias on the target with everybody who heard it |
| **personal** | -15 to both nominees, -4 with the room for making them watch |
| **flat** | -2 to the nominees. Nothing gained, nothing given away |

The pawn line is the one that matters, because **the house checks it**. Calling
somebody a formality when there is no formality is a lie told standing up in
front of everybody, and it is priced that way. That check is what makes the
choice a choice rather than a free softener.

AI Captains choose by weight: pawn tracks `nomMode` (and a backdoor is a lie by
construction, so it leans hard on pawn), threat scales with ambition, personal
is gated on volatility **and** on actually disliking the target. Measured over
600 runs the mix is threat 40, flat 32, pawn 24, personal 4. Personal was 25
percent before the spite gate, which is a Captain making it personal every
fourth week and reads as a house full of lunatics.

### 19.3 Rations bonding

Four people cold and hungry in the same room for a week come out of it closer
than they went in, whatever they think of each other's game. `RATIONS_BOND` is
+4 mutual across the four, once a week, at the moment rations are handed out.

Small on purpose. It is a week, not an alliance.

### 19.4 Campaigning from the block

The one thing every nominee in this format actually does. It is **free**,
because begging for your life is not a strategic expenditure, and capped at one
conversation per person per week, because the second time you ask is worse than
the first (`CAMP_REPEAT` -0.16 per repeat).

Four pitches, each checked against something real where the listener is
standing rather than rolled flat:

| Pitch | Checked against | If it lands |
|---|---|---|
| **I am a number for you** | whether they fear the other nominee more, and whether you are already allied | moves their vote, +5 |
| **They are the one to fear** | how dangerous they already find the other one | moves their vote, +3, and +8 threat bias on the other |
| **Just keep me** | whether they already like you | moves their vote, +2, and costs you a little with everybody else |
| **You get me for the next two weeks** | how exposed they feel themselves | moves their vote, +8, and -10 if it does not |

The card shows which of the four is true where that listener is standing,
because that read is the whole decision and hiding it would make this a lottery
with four tickets. A landed pitch writes a real `voteIntent`, so it feeds the
existing broken-promise and blame machinery with no special case.

---

## 20. The Information Layer

Before this section the game had exactly one verb for information. `eavesdrop`
listened at a door, updated your belief matrix, and the thing you learned was
gone: you could not hold it, choose a moment for it, or give it to anybody.
There was a `leak` action in run.js that was never wired to a button, and it did
not know WHAT was being leaked, only who it was about.

That is the wrong shape. Knowing a thing is not the power. Knowing who it is
worth something to, and picking the week to hand it over, is the power.

### 20.1 A secret is an object

Five kinds, each with a real source. A sixth, "X lied to Y", was designed and
cut before shipping because there was no honest way for the player to come by
it: the detection roll fires when the player lies, not when they catch somebody
else at it. A kind with no source is a dead branch.

| Kind | What it is | Where it comes from |
|---|---|---|
| `read` | what X thinks of Y | listening at a door |
| `room` | there is a group with these people in it | listening at a door |
| `name` | the group is called this | a named group leaking to you (§7.7) |
| `pair` | those two are one number | a showmance leaking to you (§7.8) |
| `intent` | the Captain is actually after X | being close enough to the Captain to be told |

Each carries an age, a witness count, and a record of who you have already told.
They go stale over four weeks. The hand caps at fourteen and the oldest thing
falls out of it.

### 20.2 Worth is per listener, and that is the mechanic

A secret has no value of its own. It has a value **to a person**, and the gap
between the best ear in the house and the worst is what makes choosing an ear a
decision instead of a formality.

| Situation | Worth |
|---|---|
| It is about them | 1.00, scaled by how bad it was |
| It is about somebody they are in a room with | 0.55 |
| It is about somebody they already fear | up to 0.45 |
| Anything else | 0.14, and it is just something to say |

Anyone who can already see it is worth zero, and the UI says so rather than
letting somebody spend a turn on it.

Telling somebody what was said about **them** is the single most valuable move
in the layer, which is correct for the format and is also why it is the easiest
one to get caught doing: two people behind a door is the narrowest provenance in
the game.

### 20.3 What it buys, and why it is not affection

**This is the part that was measured and then redesigned.**

The first build paid the whole reward in trust. At 800 paired seeds it produced
**no effect whatsoever** on where the player finished: +0.10 places against a
standard error of 0.21, while the trading player handed over eleven secrets a
run and netted around ninety trust. The mechanic was fully exercised and
completely inert.

The reason turned out to be a property of the model rather than of the feature.
Handing the player a flat trust gift from the entire house every week makes them
finish **worse** over most of the range:

| Gift per person per week | Average finish | Reached the last five |
|---|---|---|
| none | 7.24 | 45.0% |
| +3 | 7.72 | 36.0% |
| +8 | 8.79 | 31.6% |
| +20 | 6.99 | 50.6% |

Trust feeds `socialReach`, `socialReach` feeds `threatScore`, and being widely
liked paints a target about as fast as it buys protection. The curve only turns
back up once you are so beloved that cover overwhelms threat. **Any mechanic
that pays in likeability pays into that dead zone**, which is a finding well
beyond this feature and is related to open questions 8 and 9.

So a secret pays mostly into a different quantity. `rel.owed[i][j]` is what i
feels they owe j for being useful. It lowers how much i wants to nominate or
evict j and contributes **nothing** to `socialReach`, so it never raises j's
threat. It decays at 6 a week and caps at 40, because nobody remembers a favour
for a month and no run of good information should buy permanent immunity.

Being useful to somebody is a different quantity from being liked by them, and
it is the one the quiet winners of this format actually accumulate.

**The curve above has since been fixed, see §7.9, and the debt design stands
anyway.** Being liked now pays rather than costing, but it still pays by making
you a bigger presence in the house, and a bigger presence is a bigger target.
Debt is the channel that buys protection without buying visibility, which is a
distinction worth keeping whatever the slope on likeability happens to be. With
the curve repaired the same paired ablation reads +1.09 places rather than
+0.92: the information layer got better when the tax on being liked came off.

With the payout split 26 into debt and 7 into liking, the same paired ablation
reads **+0.92 places, standard error 0.21**. That is the feature working.

### 20.4 The cost

Handing something over can be traced back to you, and the fewer people who could
have known it, the louder your fingerprints. Trace chance starts at 0.24, rises
with how narrow the provenance was, and falls with your `deception` and with the
listener's `loyalty`. Measured at 11 percent of tells across a run. When it
lands, the person who had a reason to keep it quiet takes 26 off you and gains
26 suspicion.

For an `intent` secret the person who minds is the **Captain**, not the target
you just warned, which is a bug worth recording because the first version took
`about[0]` for every kind and that field is the target.

### 20.5 Scope, stated plainly

This is a **player** inventory. The AI house already moves information through
`socialTick`, alliance leaks and the belief layer, and giving fifteen AI a
second parallel information economy is a much larger change needing its own
calibration pass. The harness measures this through `policy.js`, which drives
the only seat that has it, via `node simulator.js --info`.

That is a real asymmetry and it is written here rather than implied away.
