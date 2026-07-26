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

Before week one, a short dialogue sequence where you meet the house and choose how
to answer. Your choices seed your starting trust with each Player. This exists so
that a new account is not socially poorer than a veteran account: the on ramp to
being liked is a conversation, not a stat.

---

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

### A, B and C

Every beat offers exactly three answers, and they always mean the same thing, so
the player learns the grammar once.

| | | |
|---|---|---|
| **A** | Safe | Always works. Small gain. Tells you nothing new. |
| **B** | Even | Usually works. Better gain. Often refreshes your read. |
| **C** | Risky | Rolls against them. Wins big AND does something mechanical. Loses hard. |

The risky answer is the only one that can move the game: set a vote intent, open
an alliance, buy information about a third party, push heat onto somebody else.
That is the trade. You cannot win this from the safe column, and you cannot
survive playing nothing but the risky one.

The risky roll has deliberately the same shape as the lie-detection roll in the
engine, so a player who learns how lying works has also learned how this works.
Charisma carries the honest versions, deception carries the manipulative ones,
their perception is what you are working against, and existing trust helps
because people extend the benefit of the doubt to people they like.

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
| 3 | Named alliances with size and identity, plus showmances that draw heat as a unit | pending |
| 4 | Floater logic, so some people genuinely skate. 15.5 of 16 are nominated per run against 2 to 4 who never are in a real season | pending |
| 5 | Jury management: the panel term currently decides 0.4 percent of votes and should matter in the last three weeks | pending |
| 6 | Rituals: Captain's room, nomination speeches, rations bonding, campaigning from the block | pending |

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

- Custom typeface pairing, one display face with real personality plus one
  workhorse for body
- No stock icon sets. Every glyph drawn for this game
- Procedural avatars from a custom shape vocabulary
- Layout built around the house as a physical space, not a dashboard of cards
- Restrained palette per house theme, one aggressive accent reserved for eviction
  and betrayal
- Motion deliberate and sparse. The sequential vote reveal is the one place the
  game slows down

**Reference feel:** surveillance monitor, casting file paperwork, chalk scratched
vote tallies. Cold institutional surfaces with human handwriting on top.

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
8. **Skill is currently a mild liability.** `--skill` shows that the better a
   player's hands, the more comps they win and the worse they finish, because
   power paints you. The weight is set at 0.45 to keep that from becoming a tax,
   but the real release valve is knowing when to throw, and nothing has measured
   whether a player who throws well beats both ends of that table.
9. **Comps still cost a socially strong player a little.** The `cover` mechanism
   fixed the case where a floor game made a comp winner worse, but holding power
   means naming people and the house remembers. The right way to close the last
   of it is to make comp wins pay MORE, not to soften the social game further.
10. **The risky answer is level with the safe one, not better.** It should be a
   lever worth pulling when the effect is needed. Right now a selective player
   should beat a spammer, which is correct, but the policy is not selective
   enough to prove a selective player also beats a cautious one.
