# The match has to look like the finish, 2026-09-03

Two things in one document, because they came from one complaint: "it said I won by
count-out and nobody ever left the ring."

1. An audit of every way a match in RunTheRopes can end and every spot inside one,
   against what the stage actually showed. Then what changed.
2. A longer piece on what wrestling does to a crowd, spot by spot, and the events
   the game can still add that feed the same reflex. The backlog at the end is ranked.

Everything here is about `wrestling/index.html`. Line references are to the code as it
stands after this pass; search for the function name if they drift.

---

## Part one: the audit

The live match is a stage (`stageInit`, `fmv`, `POSES`) with three bodies on it: you,
the opponent and the referee. Every move has a routine (`CHOREO`) and the pin has a
ceremony (`pinSequence`) that was, until today, the only finish anyone had bothered to
choreograph. Everything else was a caption over two people standing in their corners.

| Scenario | What the log said | What the stage showed before | What it shows now |
|---|---|---|---|
| Count-out, you win | "rolled to the floor, the referee gets to ten" | Both standing in the ring | Whip over the ropes, the camera pulls back, the body is on the floor, the referee counts through the ropes, TEN |
| Count-out, you lose | Did not exist | | Same, on you. A tap window at eight: BEAT THE COUNT. Roll in at nine and it is a near-fall |
| Disqualification, on you | "You crossed the line" | Nothing | Referee turned away, the low blow, the referee turns round, the bell |
| Run-in | "sprints down the aisle and lays you out" | An impact ring on you | A fourth wrestler, in the rival's own gear, runs in from behind you and lays you out. The referee throws his arms out |
| Stable interference | "hits the ring" | An impact ring on them | The stable-mate runs in, lays the opponent out, leaves |
| Loyal ally at ringside | "pulls the referee's eye" | Nothing | The ally on the apron, the referee turned to them, your thumb to the eye |
| Manager at ringside | "climbs onto the apron" | Nothing | Same choreography, in the manager's gear |
| Belt shot | "The belt lands flush" | Nothing, then the result | Referee turned, a gold belt prop swung, the body folds, and a real 1-2-3. Caught: the referee turns round and it is a DQ |
| Thumb to the eye | one line | Nothing | The shot, the stagger |
| Hot tag | "gets the tag and clears house" | A callout | Partner on the apron in their own gear, you crawl to the corner, the slap, the partner runs in and flattens them |
| Tag out | one line | Nothing | Partner on the apron, the slap, you on the apron for a beat |
| Last Man Standing finish | "won by ten-count" | A PINFALL sequence, then the result said ten count | No cover. The referee stands over the body and counts to ten. Up at nine is the near-fall. GET UP is the tap window |
| Time-limit draw | "The referee waves it off" | Nothing | Both wrestlers on their feet, the referee waving |
| Screwjob | "He is saying you tapped" | Nothing | You on the mat in a hold, the referee calling for the bell over it |
| Forced finish (long stretch) | "Somebody has to lose" | Straight to the result | A counted pin, a held submission, or a standing ten, whichever the stipulation allows |
| Battle Royal | eight log lines | Two figures standing still for the whole thing | Each victim wears the opp figure, the eliminator is you or the fourth body, and they go over the top rope. Final two is a real exchange with a DUMP THEM window |
| Result pose | winner celebrates, loser prone | Same for a DQ, which is wrong | DQ: the offender stands arguing with the referee. Count-out: the loser stays on the floor with the camera wide. No contest: both standing, referee waving |

Things found on the way that were not about visuals:

- `moves.js` and the other three data files were loaded with no cache version. Every
  data change this week reached returning visitors as a stale file behind a new page.
  All seven sibling scripts across the two pages now carry `?v=2` and the checker
  records them.
- Ten finishers were the trademarked names of the wrestlers who own them (a Boston
  crab called after a Canadian, a stretch called after an Englishman). Renamed. The
  regression blocklist carries the old names.
- One commentary line was a real announcer's catchphrase. Rewritten.
- The pre-match explainer said "There are no draws." There is a time-limit draw on
  title matches, and now there are count-outs and disqualifications the player can
  see. It says so.

### Moves

The catalogue had three moves per tier per category, 120 in all. Two wrestlers with
the same style ended every match with the same three finishers. There are 144 now: a
fourth Signature and two more Finishers in every category, every name original.

### How it is verified

`wrestling/verify.mjs` has a new section, "every stipulation plays out live". It
starts a career, then for each of seventeen cases builds a booking, sets the fight
speed to 40x, installs answers for the tap button and the decision cards
(`RTR_AUTO`), names the spot the next eligible beat must take (`RTR_FORCE`), and
plays the match on the real stage to the result screen. It asserts the finish type is
one the stipulation allows and that the stage did the thing: the camera went wide for
a floor spot, a fourth body appeared for interference, a ten was counted, a cheap shot
happened behind the referee. It also asserts the camera and the fourth body were put
away before the result.

The force hook exists because a count-out fires on a 6% roll behind three state gates.
Waiting for it in a suite is not testing it.

---

## Part two: what wrestling does to a crowd, and what the game can still do

The word the brief used is dopamine. Wrestling's version of it is older than the
word: it is the pop. A pop is a crowd making one noise together because something
they wanted happened, or something they feared happened, or something they did not
know they wanted happened and now cannot imagine the show without. Every mechanism
below is a way of making a person lean forward and then letting them fall.

The game already has the biggest ones: the near-fall at two and nine, the hot tag,
the comeback, the title change, the turn. What follows is what is missing, organised
by the reflex it feeds rather than by feature. The ranking at the end is by how much
of the reflex the game gets for the work.

### 1. Anticipation: the pop happens before the thing

The count is a machine for this. ONE. A beat. TWO. A longer beat. The whole building
holds its breath on the gap, not on the number. The game has this for pins and now for
the ten count, and it should have it everywhere a number climbs.

- **The countdown clock.** A surprise entrant in a Battle Royal has a clock. Ten,
  nine, eight, and the crowd chants it. The game's rumble has no entrances at all: eight
  are simply in the ring. Staggered entries with a clock, a name reveal on zero, and a
  one-in-six chance it is somebody the player did not expect (a mentor, a retired
  rival, a wrestler from another promotion) is the single biggest thing the rumble can
  add, and it is mostly choreography that now exists (`chRunIn`).
- **The music hit.** The half-second between a theme starting and the wrestler
  appearing is the purest anticipation in the business. The game has a theme cue
  banner. A run-in should have one too: the rival's theme line flashes BEFORE the body
  appears, and the crowd noise goes up on the cue. Cheap, and it turns "somebody is
  coming" into a thing the player reads a beat early.
- **The referee's hand going up.** Already there for the pin. For a submission, the
  referee lifting the arm three times (one, two, and on three it stays up or drops)
  is the same machine and the game does not use it. `submissionAttempt` should do the
  arm drop at the finish.

### 2. Denial: the near-miss is worth more than the hit

A two-and-nine kickout pops harder than a three. The game knows this (near-falls
score quality). The principle generalises to every finish, and most finishes in the
game have no near-miss.

- **The rope break at the last second.** A foot on the bottom rope at two and nine,
  spotted by the referee AFTER the three. The count is waved off. This is a
  different reflex from a kickout (the crowd goes from elation to argument) and heels
  should get it more than faces.
- **The count-out at nine** now exists. The submission equivalent, the fingers
  reaching the rope while the arm is already dropping, does not.
- **The ladder that tips.** In a ladder match the climber gets a hand on the prize,
  the other wrestler shoves the ladder, and the climber falls. The game has "caught
  before the top". The version where the hand touches the briefcase and then the fall
  is the one people remember.
- **The finisher countered into a finisher.** You go for yours, they reverse it into
  theirs, and the cover is on you. Two pops in three seconds, one of them a groan.
  `spotEscape` does the reversal; it should sometimes continue into their finisher
  and a pin on you.

### 3. Recognition: the crowd knows what is coming and cheers the knowing

This is the signature spot. The ten punches in the corner where the crowd counts.
The set-up pose before the finisher where the whole building does the gesture. The
pop is for being in on it.

- **Signature spots that the crowd counts.** A move whose choreography includes a
  count the player can tap along to (ten punches, the three amigos suplexes). The
  tap window already exists as a primitive. A signature that asks for three taps in
  rhythm and pops bigger for a clean set is a new kind of decision.
- **The finisher tell.** Before your finisher the wrestler does a thing. The game has
  a catchphrase on the character. A one-frame pose plus a burst of the catchphrase
  text before the finisher animation, once the finisher has landed enough times to be
  known, turns the finisher into an event the crowd sees coming. The visual is a
  `taunt` pose and a burst; the rule is "after five career finisher hits".
- **The call-back spot.** A move that beat you in the last match against this
  opponent, reversed this time. The commentary already knows about scouting. The
  choreography should mark it: a burst that says SCOUTED IT when you counter the move
  that finished you last time.

### 4. Reversal of fortune: the story in one movement

The comeback is the whole art form in miniature. The game has the Hulk-up fire spot.
It is missing the reasons for a comeback, which are what make it land.

- **The bump that turns the crowd.** A heel does something so cheap the crowd turns
  on them mid-match, and the face's comeback lands twice as hard. The game has heel
  cheap-heat spots. They should raise a `MS.heatOnOpp` number that multiplies the pop
  on the next comeback. Nothing visual; a number that makes the existing spot bigger.
- **The blood.** A wrestler bleeding changes a match. The audience decides the match
  is real. The game has hardcore stipulations and a `hitflash`. A "busted open" state
  after a big hardcore shot, a red tint on the figure, a commentary line, and a
  quality bonus for finishing a match while bleeding, is the cheapest big change here.
- **The injured limb that gives out.** The game works limbs. A limb at 80+ should
  sometimes give out on its own: you go for a move and the knee buckles. The crowd
  groans. It is the setup for the comeback and it makes the limb work visible.

### 5. Transgression: the thing that is not supposed to happen

The run-in, the turn, the screwjob. The game has all three. The reflex is "I cannot
believe they did that", and it needs the setup to be sacred first.

- **The referee bump.** The referee goes down, and for thirty seconds there are no
  rules. A pin with no one to count it. A heel's partner in the ring. The referee
  crawling back to count a two-and-nine that would have been a three. This is the
  most-used tool in televised wrestling and the game does not have it. Everything it
  needs is on the stage now: a `prone` referee pose, the fourth body, the count.
- **The double count-out brawl.** Both wrestlers fight on the floor, both get counted
  out, and the crowd wants the rematch. The floor exists now.
- **The turn in the ring.** Betrayal happens in scenes and in the weekly tick. The
  version everybody remembers is the partner who comes in for the hot tag and hits
  YOU. `chHotTag` is one branch away from this. It should fire on the same loyalty
  floor that triggers the backstage turn, and be the betrayal scene's opening.
- **The stolen pin.** In a triple threat one wrestler hits the finisher, and the other
  throws them out and takes the cover. The game has no three-way matches. The fourth
  body makes a three-way possible: a second opponent who trades in and out.

### 6. Consequence: the pop that lasts past the show

Wrestling's real trick is that a moment on Sunday changes Monday. The game is strong
here (the dirt sheet, what moved, the rooms). What is missing is the match as a place
that things happen TO, not only a place that produces a number.

- **The injury angle.** A wrestler carried out on a stretcher is a different image
  from "out four weeks" in an inbox. The count-out choreography can carry the player
  to the floor; a stretcher is a prop and a pose. When the injury is the serious kind,
  show it.
- **The post-match beatdown.** The match ends and then the rival comes down. The
  fourth body plus the run-in choreography, after the bell, with the winner's
  celebration interrupted. It is the run-in without the DQ, and it is how a feud goes
  from stage one to stage two on television rather than in a hallway.
- **The handshake refused.** After a respect finish the loser offers a hand. The
  winner takes it or walks. The choice is the player's, it is one tap, and it is the
  clearest face-or-heel decision in the game. Currently the alignment tilts on numbers
  nobody sees.

### The ranking

By reflex delivered per hour, with the reflex named:

1. **Referee bump** (transgression). Every piece is on the stage. Two hours.
2. **Post-match beatdown** (consequence). The run-in, after the bell. One hour.
3. **Busted open** (reversal). A state, a tint, a line, a bonus. Two hours.
4. **Rumble entrances with a countdown clock** (anticipation). Three hours, and the
   rumble goes from a list to a show.
5. **The hot tag that is a turn** (transgression). One branch. One hour.
6. **Finisher tell** (recognition). A pose and a burst after five hits. One hour.
7. **Handshake refused** (consequence). One decision card at the end. One hour.
8. **Rope break at two and nine** (denial). Inside `pinSequence`. Two hours.
9. **Submission arm drop** (anticipation). Inside `submissionAttempt`. One hour.
10. **Double count-out brawl** (transgression). The floor exists. Two hours.
11. **Limb gives out** (reversal). A roll on a limb at 80+. One hour.
12. **Triple threat** (transgression). The fourth body as a second opponent. Six
    hours, and it touches booking and the result screen.

The first seven are a day's work and would change what a match feels like more than
anything since the pin count got its rhythm.
