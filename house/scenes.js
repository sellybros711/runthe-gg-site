/* RunTheHouse, scenes and beats.
 *
 * Headless and dependency-free. Browser: window.RH_SCENES. Node: require.
 *
 * This replaces the abstract verb list from GDD §9. "Talk" and "Pitch a target"
 * are what the ENGINE does. They are not what a week feels like from a chair.
 * What a week feels like is playing chess in the kitchen with somebody who
 * keeps asking who you would take to the end.
 *
 * ── THE SHAPE: SCENE x BEAT ────────────────────────────────────────────────
 *
 * A moment is assembled from two independent banks:
 *
 *   SCENES  where you are and what your hands are doing. Pure flavour, no
 *           mechanics. "playing chess in the kitchen", "floating in the pool".
 *   BEATS   what the conversation is actually about, and the three answers.
 *           All the mechanics live here.
 *
 * They are independent on purpose. 40 scenes against 54 beats is 2,160 distinct
 * moments out of 94 authored fragments, and adding one scene adds 54 more. That
 * is the only way to get "a ton of scenarios" and still hand author every line,
 * which GDD §17 requires. It is the same authored-fragments-plus-deterministic-
 * assembly rule as strings.js, one level up.
 *
 * ── A / B / C ──────────────────────────────────────────────────────────────
 *
 * Every beat offers exactly three, and they always mean the same thing, so the
 * player learns the grammar once:
 *
 *   A  SAFE     always works, small gain, tells you nothing new
 *   B  NEUTRAL  usually works, better gain, often refreshes your read
 *   C  RISKY    rolls against them. Wins big AND does something mechanical:
 *               sets a vote, opens an alliance, buys information. Loses hard.
 *
 * The risky option is the only one that can move the game. That is the trade:
 * you cannot win this from the safe column, and you cannot survive playing
 * nothing but the risky one.
 */

'use strict';

/* WRAPPED IN AN IIFE. See the note in rng.js. */
(function () {

const E = (typeof require !== 'undefined') ? require('./engine.js') : window.RH_ENGINE;

// ─── energy ──────────────────────────────────────────────────────────────────

/*
 * One pool for the whole week, spendable across all three Scheming windows
 * rather than 4 then 3 then 2.
 *
 * That is a real strategic choice and not just a UI convenience: energy spent
 * in Scheming I buys information before the Captain names anybody, energy held
 * for Scheming III buys votes after the Veto ceremony when the week has taken
 * its final shape. Dumping it all early is a legitimate way to play and a
 * legitimate way to lose.
 *
 * Sized so a full week cannot cover the house. At 12 energy and 2 a scene you
 * get six real conversations against fifteen people, and everybody you skip
 * decays back toward how they felt about you on day one. Neglect has to bite or
 * the relationship engine is decorative.
 */
const ENERGY = {
  BASE: 12,
  RATIONS_PENALTY: 3,       // GDD §10, poor food and a hard floor
  AT_RISK_BONUS: 2,         // fighting for your life buys you a little more
  SCENE_COST: 2,
  RISKY_SURCHARGE: 1,       // the C option costs more, decided before you answer
  EAVESDROP_COST: 2,
  CONFESSIONAL_COST: 0,     // free, per GDD §9
};

function weeklyEnergy(state, id) {
  let e = ENERGY.BASE;
  if (state.cast[id].onRations) e -= ENERGY.RATIONS_PENALTY;
  if (state.atRisk.indexOf(id) !== -1) e += ENERGY.AT_RISK_BONUS;
  return Math.max(4, e);
}


// ─── Move In Night ───────────────────────────────────────────────────────────

/*
 * GDD §4. This is the on-ramp, and it exists so that a level 1 account is not
 * socially poorer than a level 60 one: the route to being liked on day one is a
 * conversation, not a stat.
 *
 * It was one choice, which is not a sequence and did not carry the weight §4
 * puts on it. Three beats now, and each one lands differently on different
 * people. `affinity` returns a multiplier on the trust each Player extends,
 * read off THEIR attributes, so the same answer wins the room over with one
 * half of the house and costs you the other half. There is no correct opening.
 */
const MOVE_IN = [
  {
    line: 'The door closes behind sixteen people who have never met. Somebody has to speak first.',
    options: [
      { key: 'a', kind: 'safe', text: 'Let somebody else.',
        base: [1, 5], affinity: (p) => 1 + (p.social.paranoia - 50) / 200 },
      { key: 'b', kind: 'neutral', text: 'Say your name and where you are from and nothing else.',
        base: [3, 9], affinity: (p) => 1 + (p.social.loyalty - 50) / 160 },
      { key: 'c', kind: 'risky', text: 'Take the room.',
        base: [-4, 16], affinity: (p) => 1 + (p.social.charisma - 50) / 110 },
    ],
  },
  {
    line: 'First night. Nobody is sleeping and everybody is pretending to.',
    options: [
      { key: 'a', kind: 'safe', text: 'Go to bed anyway.',
        base: [1, 4], affinity: () => 1 },
      { key: 'b', kind: 'neutral', text: 'Sit up in the kitchen with whoever is still awake.',
        base: [4, 11], affinity: (p) => 1 + (p.social.charisma - 50) / 200 },
      { key: 'c', kind: 'risky', text: 'Find the one person nobody has spoken to and stay with them.',
        base: [-2, 18], affinity: (p) => 1 + (50 - p.social.charisma) / 90 },
    ],
  },
  {
    line: 'First morning. Someone asks, lightly, who you think is going to be a problem in here.',
    options: [
      { key: 'a', kind: 'safe', text: 'Say it is far too early to know.',
        base: [2, 6], affinity: (p) => 1 + (p.social.perception - 50) / 220 },
      { key: 'b', kind: 'neutral', text: 'Say you are more interested in who is going to be fun.',
        base: [3, 10], affinity: (p) => 1 + (p.social.charisma - 50) / 170 },
      { key: 'c', kind: 'risky', text: 'Give them a name.',
        base: [-8, 20], affinity: (p) => 1 + (p.social.deception - 50) / 100 },
    ],
  },
];

// ─── scenes: where you are, what your hands are doing ────────────────────────

/*
 * Flavour only. `tone` lets the beat picker prefer a matching setting, so a
 * confrontation does not get staged in a hammock, but any scene can carry any
 * beat if the draw needs it.
 *
 *   idle    nothing happening, easy to talk
 *   close   physically private, good for real conversation
 *   busy    hands occupied, easy to be casual
 *   public  other people around, everything is on the record
 */
const SCENES = [
  { t: 'playing chess in the kitchen with {name}', tone: 'idle' },
  { t: 'sat on the counter while {name} makes eggs at two in the morning', tone: 'close' },
  { t: 'floating at opposite ends of the pool with {name}', tone: 'idle' },
  { t: 'doing the dishes while {name} dries', tone: 'busy' },
  { t: 'in the storage room with {name}, taking longer than the errand needs', tone: 'close' },
  { t: 'sharing the hammock rope with {name} while the yard empties out', tone: 'close' },
  { t: 'lifting in the yard, {name} counting for you', tone: 'busy' },
  { t: 'on the back patio with {name}, both pretending to look at the sky', tone: 'close' },
  { t: 'folding laundry with {name} in the hallway', tone: 'busy' },
  { t: 'up in the Captain room with {name}, door shut', tone: 'close' },
  { t: 'in the pantry with {name}, counting what is left of the coffee', tone: 'busy' },
  { t: 'at the long table with {name} while four other people eat', tone: 'public' },
  { t: 'in the bathroom mirror next to {name}, both brushing teeth', tone: 'idle' },
  { t: 'sat on the end of {name}s bed at four in the morning', tone: 'close' },
  { t: 'walking laps of the yard with {name}, neither of you stopping', tone: 'close' },
  { t: 'on the sofa with {name} while the house pretends to watch nothing', tone: 'public' },
  { t: 'in the Rations room with {name}, both cold', tone: 'close' },
  { t: 'shuffling cards with {name} that neither of you is going to deal', tone: 'idle' },
  { t: 'painting {name}s nails badly at the kitchen table', tone: 'idle' },
  { t: 'stretching on the grass, {name} lying next to you', tone: 'idle' },
  { t: 'stacking dishes with {name} long after they are clean', tone: 'busy' },
  { t: 'in the hallway with {name}, both aware of the camera', tone: 'public' },
  { t: 'watching {name} rack weights they are not going to lift', tone: 'busy' },
  { t: 'sat with {name} in the have-not beds, neither of you sleeping', tone: 'close' },
  { t: 'making tea for {name} because there is nothing else to do', tone: 'idle' },
  { t: 'sweeping the kitchen while {name} holds the pan', tone: 'busy' },
  { t: 'on the swing seat with {name}, both facing the fence', tone: 'close' },
  { t: 'cutting {name}s hair with the blunt scissors', tone: 'idle' },
  { t: 'in the corner of the lounge with {name} while the rest of them cook', tone: 'public' },
  { t: 'sat on the stairs with {name}, blocking the way up', tone: 'close' },
  { t: 'sorting the fridge with {name} into things nobody wants', tone: 'busy' },
  { t: 'in the yard with {name} at sunrise, first two awake', tone: 'close' },
  { t: 'throwing a ball back and forth with {name} without talking about it', tone: 'busy' },
  { t: 'sat under the awning with {name} while it rains on the yard', tone: 'close' },
  { t: 'at the kitchen island with {name}, everybody else asleep', tone: 'close' },
  { t: 'holding the ladder while {name} changes a bulb nobody asked about', tone: 'busy' },
  { t: 'sat across the table from {name} with a deck of cards between you', tone: 'idle' },
  { t: 'in the doorway with {name}, one of you half in the room', tone: 'public' },
  { t: 'rinsing plates with {name} while two others argue behind you', tone: 'public' },
  { t: 'lying on the yard grass next to {name}, both looking straight up', tone: 'idle' },
];

// ─── beats: what it is actually about ────────────────────────────────────────

/*
 * `pool` is the context in which this beat can be drawn. The picker in
 * pickBeat() chooses a pool from game state, then a beat from it, so being on
 * the block produces a different conversation from being safe in week two.
 *
 * Effect keys, resolved in resolve():
 *   read      refresh your read on them, accurately
 *   intent    set their vote intent, which is what winning a vote is made of
 *   ally      opens an alliance if the trust is already there
 *   info      learn something about a third party
 *   suspicion they start watching you
 *   heat      pulls their attention toward a third party and off you
 */
const BEATS = [
  // ── bond: no agenda, available always ──
  { pool: 'bond', line: 'They ask what you actually do on the outside. Nobody has asked you that in eleven days.',
    a: { t: 'Give them the short version.' },
    b: { t: 'Give them the real version.', fx: ['read'] },
    c: { t: 'Give them the real version and ask for theirs.', fx: ['read', 'ally'] } },
  { pool: 'bond', line: '{name} says they have not slept properly since they got here. It sounds true.',
    a: { t: 'Say nobody has.' },
    b: { t: 'Tell them about your worst night in here.', fx: ['read'] },
    c: { t: 'Tell them you sleep fine because you know where you stand with them.', fx: ['ally'] } },
  { pool: 'bond', line: '{name} is doing the thing where they laugh a beat after everybody else.',
    a: { t: 'Let it go.' },
    b: { t: 'Ask if they are alright.', fx: ['read'] },
    c: { t: 'Say out loud that they have been off since the vote.', fx: ['read', 'info'] } },
  { pool: 'bond', line: 'They want to talk about absolutely nothing for twenty minutes.',
    a: { t: 'Let them.' },
    b: { t: 'Let them, and remember three things they said.', fx: ['read'] },
    c: { t: 'Steer it, gently, toward the house.', fx: ['info'] } },
  { pool: 'bond', line: '{name} tells you a story about their family that they have not told the room.',
    a: { t: 'Say the right things.' },
    b: { t: 'Tell them one back.', fx: ['read'] },
    c: { t: 'Tell them one back, and say you would take them to the end.', fx: ['ally'] } },
  { pool: 'bond', line: 'You both notice at the same moment that neither of you has mentioned the game.',
    a: { t: 'Keep it that way.' },
    b: { t: 'Say it out loud and keep it that way anyway.', fx: ['read'] },
    c: { t: 'Break it. Ask them straight where they are.', fx: ['read', 'info'] } },
  { pool: 'bond', line: '{name} says they do not know who to trust in here.',
    a: { t: 'Agree without naming anybody.' },
    b: { t: 'Say they can trust you and let them decide.', fx: ['read'] },
    c: { t: 'Name the person you trust least and watch their face.', fx: ['info', 'heat'] } },

  // ── probe: trying to get a read ──
  { pool: 'probe', line: 'You want to know where {name} actually is this week.',
    a: { t: 'Ask what they make of the noms.' },
    b: { t: 'Ask who they think is running things.', fx: ['read'] },
    c: { t: 'Ask them flat out who they are voting for.', fx: ['read', 'info'] } },
  { pool: 'probe', line: '{name} has been in a lot of rooms with a lot of people this week.',
    a: { t: 'Mention it lightly.' },
    b: { t: 'Ask what everybody has been telling them.', fx: ['info'] },
    c: { t: 'Tell them it looks bad and ask what they are doing.', fx: ['info', 'suspicion'] } },
  { pool: 'probe', line: 'There is a name that keeps coming up and you cannot tell who started it.',
    a: { t: 'Ask if they have heard it too.' },
    b: { t: 'Ask where they think it came from.', fx: ['info'] },
    c: { t: 'Tell them you think it came from them.', fx: ['info', 'suspicion'] } },
  { pool: 'probe', line: '{name} keeps saying we. You would like to know who is in it.',
    a: { t: 'Let the we go unexamined.' },
    b: { t: 'Ask who we is.', fx: ['read'] },
    c: { t: 'Ask whether you are in it.', fx: ['read', 'ally'] } },
  { pool: 'probe', line: 'Somebody told you {name} said your name. It might not be true.',
    a: { t: 'Say nothing about it.' },
    b: { t: 'Bring it up sideways and watch them.', fx: ['read'] },
    c: { t: 'Put it to them directly.', fx: ['read', 'suspicion'] } },
  { pool: 'probe', line: '{name} asks you a question that is really a test.',
    a: { t: 'Give the answer they want.' },
    b: { t: 'Give the honest answer.', fx: ['read'] },
    c: { t: 'Point out that it was a test.', fx: ['read', 'info'] } },

  // ── float: putting a name in the air ──
  { pool: 'float', line: 'The conversation has an opening in it the size of a name.',
    a: { t: 'Do not use it.' },
    b: { t: 'Mention the name and move on quickly.', fx: ['read'] },
    c: { t: 'Put the name down and leave it there.', fx: ['intent'] } },
  { pool: 'float', line: '{name} asks who you would put up if it were you.',
    a: { t: 'Say you have not thought about it.' },
    b: { t: 'Name somebody safe and uninteresting.', fx: ['read'] },
    c: { t: 'Name the person you actually want gone.', fx: ['intent'] } },
  { pool: 'float', line: 'They are almost there on their own. One more push does it.',
    a: { t: 'Let them get there alone.' },
    b: { t: 'Agree with the half of it they have already said.', fx: ['read'] },
    c: { t: 'Say the rest of it for them.', fx: ['intent', 'suspicion'] } },
  { pool: 'float', line: '{name} is angry at somebody and it is pointing in a useful direction.',
    a: { t: 'Let them vent.' },
    b: { t: 'Agree that it was out of order.', fx: ['read'] },
    c: { t: 'Sharpen it into a plan.', fx: ['intent', 'heat'] } },
  { pool: 'float', line: 'You have been carrying this name around for two days.',
    a: { t: 'Carry it another day.' },
    b: { t: 'Test it as a joke first.', fx: ['read'] },
    c: { t: 'Say it seriously and hold their eye.', fx: ['intent'] } },
  { pool: 'float', line: '{name} says they will do whatever the house does.',
    a: { t: 'Say the house has not decided.' },
    b: { t: 'Tell them what you think the house is doing.', fx: ['read'] },
    c: { t: 'Tell them what the house is doing, and make it what you want.', fx: ['intent'] } },

  // ── recruit: building something ──
  { pool: 'recruit', line: 'Neither of you has said the word and both of you are thinking it.',
    a: { t: 'Do not say it.' },
    b: { t: 'Say you have each others backs and leave it vague.', fx: ['read'] },
    c: { t: 'Say the word.', fx: ['ally'] } },
  { pool: 'recruit', line: '{name} has nobody. That is either an opportunity or a warning.',
    a: { t: 'Be friendly and nothing more.' },
    b: { t: 'Offer them information they did not have.', fx: ['read', 'info'] },
    c: { t: 'Offer them a seat at something.', fx: ['ally'] } },
  { pool: 'recruit', line: 'You are two people who have never been on opposite sides of a vote.',
    a: { t: 'Note it and move on.' },
    b: { t: 'Point it out to them.', fx: ['read'] },
    c: { t: 'Point it out and suggest keeping it that way to the end.', fx: ['ally'] } },
  { pool: 'recruit', line: '{name} is the only person in here who has never lied to you. You think.',
    a: { t: 'Enjoy the quiet.' },
    b: { t: 'Tell them so.', fx: ['read'] },
    c: { t: 'Tell them so and ask them to make it formal.', fx: ['ally'] } },
  { pool: 'recruit', line: 'They are already in something. You can hear it in what they will not say.',
    a: { t: 'Leave it alone.' },
    b: { t: 'Ask them to keep you out of whatever it is.', fx: ['read'] },
    c: { t: 'Ask them to bring you into it.', fx: ['ally', 'info'] } },

  // ── defend: you are At Risk ──
  { pool: 'defend', line: 'You need this vote and you both know that is why you are here.',
    a: { t: 'Ask, plainly, and accept whatever they say.' },
    b: { t: 'Make the case that you are not the bigger threat.', fx: ['read'] },
    c: { t: 'Promise them something for after.', fx: ['intent', 'ally'] } },
  { pool: 'defend', line: '{name} will not quite look at you, which is usually an answer.',
    a: { t: 'Do not make them say it.' },
    b: { t: 'Ask them to tell you to your face.', fx: ['read'] },
    c: { t: 'Tell them you know, and ask what it would take.', fx: ['intent'] } },
  { pool: 'defend', line: 'You have one argument that works on {name} specifically.',
    a: { t: 'Save it. There is another day.' },
    b: { t: 'Use half of it.', fx: ['read'] },
    c: { t: 'Use all of it now.', fx: ['intent'] } },
  { pool: 'defend', line: 'They ask what you would do for them if you stay.',
    a: { t: 'Say you would remember it.' },
    b: { t: 'Offer a week of safety from you.', fx: ['read'] },
    c: { t: 'Offer them the other nominee, and mean it.', fx: ['intent', 'heat'] } },
  { pool: 'defend', line: 'The other nominee has been in this room already today.',
    a: { t: 'Do not mention it.' },
    b: { t: 'Ask what they said.', fx: ['info'] },
    c: { t: 'Tell {name} what the other one said about them last week.', fx: ['intent', 'heat', 'suspicion'] } },

  // ── deflect: you are being looked at ──
  { pool: 'deflect', line: '{name} has been watching you since the vote and is not hiding it.',
    a: { t: 'Behave normally and wait it out.' },
    b: { t: 'Ask them what is on their mind.', fx: ['read'] },
    c: { t: 'Get in front of it and give them a different name to think about.', fx: ['heat'] } },
  { pool: 'deflect', line: 'They ask you a question you have already answered differently to somebody else.',
    a: { t: 'Repeat the version they will have heard.' },
    b: { t: 'Come clean about the discrepancy.', fx: ['read'] },
    c: { t: 'Give a third version and commit to it.', fx: ['heat', 'suspicion'] } },
  { pool: 'deflect', line: 'There is a version of this week where you are the one who gets blamed for it.',
    a: { t: 'Say nothing and hope it passes.' },
    b: { t: 'Point out you were not even in the room.', fx: ['read'] },
    c: { t: 'Point out who was.', fx: ['heat', 'info'] } },
  { pool: 'deflect', line: '{name} says they heard something about you and will not say what.',
    a: { t: 'Let them keep it.' },
    b: { t: 'Ask who told them.', fx: ['info'] },
    c: { t: 'Tell them the person who told them has a reason to.', fx: ['heat', 'suspicion'] } },

  // ── gossip: trading in other people ──
  { pool: 'gossip', line: 'You know something about a third person that {name} does not.',
    a: { t: 'Keep it.' },
    b: { t: 'Give them the harmless half.', fx: ['read'] },
    c: { t: 'Give them all of it.', fx: ['heat', 'info'] } },
  { pool: 'gossip', line: '{name} wants to know what people say about them.',
    a: { t: 'Say only good things, which is a lie they will accept.' },
    b: { t: 'Tell them the mild version of the truth.', fx: ['read'] },
    c: { t: 'Tell them exactly who said what.', fx: ['info', 'heat'] } },
  { pool: 'gossip', line: 'Two other people are working together and you are fairly sure of it.',
    a: { t: 'Keep it to yourself a while longer.' },
    b: { t: 'Ask {name} whether they have noticed.', fx: ['info'] },
    c: { t: 'Tell {name} it exists and let them do something about it.', fx: ['heat', 'info'] } },
  { pool: 'gossip', line: '{name} is repeating something back to you that you told somebody else.',
    a: { t: 'Act like it is new.' },
    b: { t: 'Note where it must have travelled from.', fx: ['read', 'info'] },
    c: { t: 'Tell them it came from you and ask who passed it on.', fx: ['info', 'suspicion'] } },

  // ── power: you are holding something ──
  { pool: 'power', line: 'You are holding something the house is currently trying to find.',
    a: { t: 'Say nothing about it.' },
    b: { t: 'Complain about not having it, loudly.', fx: ['read'] },
    c: { t: 'Tell {name} you have it.', fx: ['ally', 'suspicion'] } },
  { pool: 'power', line: '{name} is guessing out loud about who has it. They are close.',
    a: { t: 'Let them guess.' },
    b: { t: 'Point them somewhere else gently.', fx: ['heat'] },
    c: { t: 'Give them a name with confidence.', fx: ['heat', 'suspicion'] } },

  // ── captain: you hold the power this week ──
  { pool: 'captain', line: 'You are the Captain and {name} has come upstairs to find out what that means for them.',
    a: { t: 'Tell them they are fine this week.' },
    b: { t: 'Tell them nothing is decided.', fx: ['read'] },
    c: { t: 'Tell them who you are naming and ask them to keep it.', fx: ['intent', 'ally'] } },
  { pool: 'captain', line: 'Everybody has been nice to you for three days and it is starting to be tiring.',
    a: { t: 'Take it at face value.' },
    b: { t: 'Say out loud that you know why they are being nice.', fx: ['read'] },
    c: { t: 'Ask {name} who has been working you hardest.', fx: ['info', 'heat'] } },
  { pool: 'captain', line: '{name} is pitching you a name and it is not a bad name.',
    a: { t: 'Say you will think about it.' },
    b: { t: 'Ask why that name and listen properly.', fx: ['read', 'info'] },
    c: { t: 'Tell them you will do it if they do something for you after.', fx: ['ally', 'intent'] } },

  // ── late: Final 6 and below, everything is sharper ──
  { pool: 'late', line: 'There are few enough of you left that this conversation is arithmetic.',
    a: { t: 'Keep it warm and say nothing.' },
    b: { t: 'Do the arithmetic out loud with them.', fx: ['read'] },
    c: { t: 'Tell them which two of you go to the end.', fx: ['ally', 'intent'] } },
  { pool: 'late', line: '{name} asks whether you would take them over the other one.',
    a: { t: 'Say of course, and let it be worth what it is worth.' },
    b: { t: 'Say yes and give them a reason that is true.', fx: ['read'] },
    c: { t: 'Say no, and tell them why, and see if they respect it.', fx: ['read', 'ally'] } },
  { pool: 'late', line: 'Whoever wins the next one decides both of your games.',
    a: { t: 'Acknowledge it and change the subject.' },
    b: { t: 'Agree to not put each other up if either of you wins.', fx: ['ally'] },
    c: { t: 'Ask them to throw it to you.', fx: ['intent', 'suspicion'] } },
  { pool: 'late', line: 'You are both counting jury votes and pretending you are not.',
    a: { t: 'Keep pretending.' },
    b: { t: 'Admit you have been counting.', fx: ['read'] },
    c: { t: 'Tell them who you think they cannot beat.', fx: ['info', 'heat'] } },

  // ── recruit, continued ──
  { pool: 'recruit', line: '{name} says the word first, and waits.',
    a: { t: 'Say you are with them without saying what that means.' },
    b: { t: 'Agree, and name one person you both stay away from.', fx: ['read'] },
    c: { t: 'Agree, and tell them who you are already working with.', fx: ['ally', 'info'] } },
  { pool: 'recruit', line: 'You need a third and {name} is the obvious one.',
    a: { t: 'Do not bring it up yet.' },
    b: { t: 'Feel out how they would take it.', fx: ['read'] },
    c: { t: 'Bring them in tonight.', fx: ['ally'] } },

  // ── bond, continued ──
  { pool: 'bond', line: '{name} has been here eleven days and has not mentioned home once.',
    a: { t: 'Respect it.' },
    b: { t: 'Ask, once, and drop it if they deflect.', fx: ['read'] },
    c: { t: 'Tell them about yours until they tell you about theirs.', fx: ['read', 'ally'] } },
  { pool: 'bond', line: 'Somebody left and the house is quieter than it was.',
    a: { t: 'Sit in it with {name}.' },
    b: { t: 'Say the thing everybody is thinking.', fx: ['read'] },
    c: { t: 'Say you are glad it was not either of you, and mean the second half.', fx: ['ally'] } },
  { pool: 'bond', line: '{name} is cooking for the house again and nobody has thanked them.',
    a: { t: 'Thank them.' },
    b: { t: 'Help, badly.', fx: ['read'] },
    c: { t: 'Point out to the room that they have done it every night.', fx: ['ally', 'heat'] } },
  { pool: 'bond', line: 'You are the only two awake and neither of you has anything to say.',
    a: { t: 'Let the quiet be fine.' },
    b: { t: 'Break it with something true.', fx: ['read'] },
    c: { t: 'Break it with something you should not say.', fx: ['read', 'ally'] } },

  // ── probe, continued ──
  { pool: 'probe', line: '{name} answered the same question differently to two people today.',
    a: { t: 'File it away.' },
    b: { t: 'Ask the question a third time and see which version you get.', fx: ['read'] },
    c: { t: 'Tell them you have heard both versions.', fx: ['read', 'suspicion'] } },
  { pool: 'probe', line: 'You want to know whether {name} would ever put you up.',
    a: { t: 'Do not hand them the idea.' },
    b: { t: 'Ask what they would do with the power.', fx: ['read'] },
    c: { t: 'Ask whether you would be safe.', fx: ['read', 'ally'] } },
  { pool: 'probe', line: '{name} has been very careful with you all week.',
    a: { t: 'Be careful back.' },
    b: { t: 'Ask them why they are being careful.', fx: ['read'] },
    c: { t: 'Say something reckless and watch what they do with it.', fx: ['read', 'info'] } },

  // ── float, continued ──
  { pool: 'float', line: 'There is a name that would solve this week for both of you.',
    a: { t: 'Wait for them to get there.' },
    b: { t: 'Describe the problem without naming the solution.', fx: ['read'] },
    c: { t: 'Name it and ask them to carry it.', fx: ['intent', 'heat'] } },
  { pool: 'float', line: '{name} has the Captaincy and has not decided yet.',
    a: { t: 'Stay out of their room.' },
    b: { t: 'Go up and talk about anything else.', fx: ['read'] },
    c: { t: 'Go up and give them a name.', fx: ['intent'] } },
  { pool: 'float', line: 'The house has half agreed on somebody and it is not who you want.',
    a: { t: 'Go with the house.' },
    b: { t: 'Ask {name} whether they are sure.', fx: ['read'] },
    c: { t: 'Try to turn it, starting here.', fx: ['intent', 'suspicion'] } },

  // ── defend, continued ──
  { pool: 'defend', line: 'You have three days and you are two votes short.',
    a: { t: 'Ask {name} straight and let them think.' },
    b: { t: 'Give them a reason that is about them, not you.', fx: ['read'] },
    c: { t: 'Tell them the other one has been saying their name.', fx: ['intent', 'heat'] } },
  { pool: 'defend', line: '{name} has been avoiding the room you are in.',
    a: { t: 'Let them.' },
    b: { t: 'Catch them somewhere they cannot leave.', fx: ['read'] },
    c: { t: 'Say out loud, in front of people, that they have been avoiding you.', fx: ['heat', 'suspicion'] } },
  { pool: 'defend', line: 'They want to know why they should keep you over somebody they like more.',
    a: { t: 'Say you would do the same for them.' },
    b: { t: 'Say the other one is further ahead than they look.', fx: ['read'] },
    c: { t: 'Say you will go up next week in their place if it comes to it.', fx: ['intent', 'ally'] } },

  // ── deflect, continued ──
  { pool: 'deflect', line: 'Your name has been in the air for two days and nobody has said it to you.',
    a: { t: 'Wait for somebody to.' },
    b: { t: 'Ask {name} whether they have heard it.', fx: ['read', 'info'] },
    c: { t: 'Say it yourself, first, and dare them to agree.', fx: ['heat'] } },
  { pool: 'deflect', line: '{name} watched you come out of a room you had no reason to be in.',
    a: { t: 'Behave as though it was nothing.' },
    b: { t: 'Explain it before they ask.', fx: ['read'] },
    c: { t: 'Tell them who you were actually in there with.', fx: ['info', 'heat'] } },
  { pool: 'deflect', line: 'Somebody has been telling people you are running this house.',
    a: { t: 'Be smaller for a week.' },
    b: { t: 'Ask {name} where they think it started.', fx: ['info'] },
    c: { t: 'Point out who benefits from you looking like that.', fx: ['heat', 'suspicion'] } },

  // ── gossip, continued ──
  { pool: 'gossip', line: '{name} wants to trade. They have something and they want something.',
    a: { t: 'Decline politely.' },
    b: { t: 'Trade something you were going to lose anyway.', fx: ['info'] },
    c: { t: 'Trade something real and take what they have.', fx: ['info', 'ally'] } },
  { pool: 'gossip', line: 'Two people had an argument and you were the only one who saw it.',
    a: { t: 'Keep it.' },
    b: { t: 'Mention it to {name} without taking a side.', fx: ['info'] },
    c: { t: 'Tell {name} and pick a side while you do it.', fx: ['heat', 'info'] } },
  { pool: 'gossip', line: '{name} is about to find out something on their own by tomorrow.',
    a: { t: 'Let them find out.' },
    b: { t: 'Get there first.', fx: ['read'] },
    c: { t: 'Get there first and shape it on the way.', fx: ['heat', 'info'] } },

  // ── power, continued ──
  { pool: 'power', line: 'You could spend it this week or hold it and be safe for two.',
    a: { t: 'Hold it and say nothing.' },
    b: { t: 'Sound out {name} on what they would do.', fx: ['read'] },
    c: { t: 'Tell {name} it exists and make them useful.', fx: ['ally', 'suspicion'] } },
  { pool: 'power', line: 'The house has narrowed it down to four people and you are one of them.',
    a: { t: 'Act exactly as you have all week.' },
    b: { t: 'Volunteer a theory about one of the other three.', fx: ['heat'] },
    c: { t: 'Suggest the four of you rule each other out in public.', fx: ['heat', 'read'] } },

  // ── captain, continued ──
  { pool: 'captain', line: 'You have to name two and there are four people you would happily see gone.',
    a: { t: 'Tell {name} you have not decided.' },
    b: { t: 'Ask {name} who they would name.', fx: ['read', 'info'] },
    c: { t: 'Tell {name} they are safe and ask for something in return.', fx: ['ally', 'intent'] } },
  { pool: 'captain', line: '{name} has come to tell you they are loyal, which is what people say when they are not.',
    a: { t: 'Thank them and believe none of it.' },
    b: { t: 'Ask them to prove it with a name.', fx: ['read', 'info'] },
    c: { t: 'Tell them you know they were in the other room this morning.', fx: ['suspicion', 'heat'] } },
  { pool: 'captain', line: 'Naming these two costs you both of them for the rest of the game.',
    a: { t: 'Do it and take the cost.' },
    b: { t: 'Tell {name} in advance so it is not a surprise.', fx: ['read'] },
    c: { t: 'Tell {name} it was somebody else pushing for it.', fx: ['heat', 'suspicion'] } },

  // ── late, continued ──
  { pool: 'late', line: 'One of you is going next week and you both know which.',
    a: { t: 'Do not say it out loud.' },
    b: { t: 'Say it out loud and be kind about it.', fx: ['read'] },
    c: { t: 'Say it out loud and offer them a way out of it.', fx: ['ally', 'intent'] } },
  { pool: 'late', line: '{name} is the last person in here who has never lied to you.',
    a: { t: 'Leave that intact.' },
    b: { t: 'Tell them it is true and that it matters.', fx: ['read'] },
    c: { t: 'Tell them, and then ask them for the thing you need.', fx: ['intent', 'ally'] } },
  { pool: 'late', line: 'You are going to be sat in front of these people asking for their vote.',
    a: { t: 'Do not remind them.' },
    b: { t: 'Start being somebody they would vote for.', fx: ['read'] },
    c: { t: 'Ask {name} outright what it would take.', fx: ['read', 'info'] } },
];


// ─── picking ─────────────────────────────────────────────────────────────────

/**
 * Which conversation is available right now. Context first, then a draw inside
 * it, so the week's shape decides what kind of scene you get and the seed
 * decides which one.
 */
function poolFor(state, me, them) {
  const pools = [];
  const active = state.cast.filter((p) => p.status === 'active').length;

  if (state.atRisk.indexOf(me) !== -1) pools.push('defend', 'defend', 'probe');
  if (state.captain === me) pools.push('captain', 'captain');
  if (state.myPowers && state.myPowers.length) pools.push('power');
  if (active <= 6) pools.push('late', 'late');

  const suspicious = state.rel.suspicion[them][me] > 25;
  if (suspicious) pools.push('deflect', 'deflect');

  const trust = state.rel.trust[them][me];
  const allied = E.sharedAlliances(state.alliances, me, them).length > 0;
  if (trust > 35 && !allied) pools.push('recruit');
  if (trust > 10) pools.push('float');
  pools.push('bond', 'probe');
  /* Gossip needs there to have been a week worth gossiping about. In week one
     nobody has done anything yet and "two people are working together and you
     are fairly sure of it" is a line about a house that does not exist. */
  if (state.week > 1) pools.push('gossip');
  return pools;
}

const fill = (t, name) => t.replace(/\{name\}/g, name);

function pickScene(rng, them) {
  return SCENES[Math.floor(rng() * SCENES.length)];
}

function pickBeat(state, rng, me, them) {
  const pools = poolFor(state, me, them);
  const pool = pools[Math.floor(rng() * pools.length)];
  const opts = BEATS.filter((b) => b.pool === pool);
  const list = opts.length ? opts : BEATS.filter((b) => b.pool === 'bond');
  return list[Math.floor(rng() * list.length)];
}

/** Everything the UI needs to render one moment. */
function compose(state, rng, me, them) {
  const scene = pickScene(rng, them);
  const beat = pickBeat(state, rng, me, them);
  const name = state.cast[them].first;
  return {
    target: them,
    scene: fill(scene.t, name),
    line: fill(beat.line, name),
    beat: BEATS.indexOf(beat),
    pool: beat.pool,
    /* The slot fill has to run over the OPTIONS as well as the line. It did not,
       and the answer column shipped reading "Ask {name} whether they have
       noticed." A fragment bank is only as good as its assembly step. */
    options: [
      { key: 'a', kind: 'safe', text: fill(beat.a.t, name), fx: beat.a.fx || [], cost: ENERGY.SCENE_COST },
      { key: 'b', kind: 'neutral', text: fill(beat.b.t, name), fx: beat.b.fx || [], cost: ENERGY.SCENE_COST },
      { key: 'c', kind: 'risky', text: fill(beat.c.t, name), fx: beat.c.fx || [],
        cost: ENERGY.SCENE_COST + ENERGY.RISKY_SURCHARGE },
    ],
  };
}

// ─── resolution ──────────────────────────────────────────────────────────────

const GAIN = {
  safe: [2, 5],
  neutral: [4, 9],
  risky_win: [12, 22],
  risky_lose: [-12, -5],
};

/*
 * The risky roll, extracted from inline literals for the same reason the Panel
 * noise was: a number that cannot be swept cannot be tuned, and these turned out
 * to decide whether the whole C column is worth touching.
 *
 * MEASURED, with policy.js playing the seat over 200 runs a setting. At a base
 * of 0.34 with a 10-to-18 win against a 16-to-8 loss, C carried NEGATIVE
 * expected trust, about minus 3 a scene against B's plus 5.6. So the more
 * risky answers a player took the worse they finished, from 7.0 percent wins
 * at risk 0 down to 2.5 percent at risk 1. The column the design calls the
 * only one that can move the game was strictly a trap.
 *
 * The intended shape is that C costs you a LITTLE expected trust and buys you a
 * lever: a vote, an alliance, a piece of information. Slightly below B on trust
 * alone, clearly above it once the effect lands. Never negative.
 */
const RISK = {
  BASE: 0.42,
  DRIVE: 0.005,          // per point of (your drive - their perception)
  TRUST_COVER: 0.0032,   // people extend the benefit of the doubt
  SUSPICION: 0.28,       // and stop extending it once they have caught you
  FAIL_SUSPICION: 10,    // what a failed risky answer costs you in their head
  MIN: 0.08, MAX: 0.90,
};

/**
 * Does the risky option land?
 *
 * Charisma carries the honest versions, deception carries the manipulative
 * ones, and their perception is what you are working against. Existing trust
 * helps, because people give the benefit of the doubt to people they like. This
 * is deliberately the SAME shape as engine.detectChance so that a player who
 * learns how lying works has also learned how this works.
 */
function riskyChance(state, me, them, beatFx) {
  const a = state.cast[me], b = state.cast[them];
  const manipulative = beatFx.indexOf('heat') !== -1 || beatFx.indexOf('intent') !== -1;
  const drive = manipulative
    ? (a.social.deception * 0.6 + a.social.charisma * 0.4)
    : (a.social.charisma * 0.7 + a.social.deception * 0.3);
  let p = RISK.BASE
    + (drive - b.social.perception) * RISK.DRIVE
    + Math.max(0, state.rel.trust[them][me]) * RISK.TRUST_COVER
    - (state.rel.suspicion[them][me] / 100) * RISK.SUSPICION;
  return E.clamp(p, RISK.MIN, RISK.MAX);
}

/**
 * Play one option. Returns what happened, in enough detail for the UI to narrate
 * it and for the recap to reconstruct it.
 */
function resolve(state, moment, key, rng) {
  const me = state.human, them = moment.target;
  const opt = moment.options.filter((o) => o.key === key)[0];
  const out = { target: them, kind: opt.kind, fx: [], text: opt.text, landed: true };

  let gain;
  if (opt.kind === 'safe') {
    gain = rng.range(GAIN.safe[0], GAIN.safe[1]);
  } else if (opt.kind === 'neutral') {
    /* Neutral is not free. It fails occasionally and when it does it simply
       does nothing, which is a different feeling from backfiring. */
    if (rng.chance(0.86)) gain = rng.range(GAIN.neutral[0], GAIN.neutral[1]);
    else { gain = rng.range(-2, 1); out.landed = false; }
  } else {
    const p = riskyChance(state, me, them, opt.fx);
    out.chance = p;
    if (rng.chance(p)) gain = rng.range(GAIN.risky_win[0], GAIN.risky_win[1]);
    else {
      gain = rng.range(GAIN.risky_lose[0], GAIN.risky_lose[1]);
      out.landed = false;
      state.rel.suspicion[them][me] = Math.min(100, state.rel.suspicion[them][me] + RISK.FAIL_SUSPICION);
    }
  }

  gain *= (0.6 + state.cast[me].social.charisma / 160);
  E.applyTrust(state.rel, them, me, gain);
  /* You warm to people you spend time with, whatever you were doing to them. */
  E.applyTrust(state.rel, me, them, Math.abs(gain) * 0.35 * (gain > 0 ? 1 : -0.4));
  state.rel.lastWeek[me][them] = state.week;
  state.rel.lastWeek[them][me] = state.week;
  out.gain = gain;

  if (out.landed) applyEffects(state, out, opt.fx, rng);
  else if (opt.kind === 'risky') out.fx.push({ k: 'backfire' });

  /* Every conversation refreshes your read whether or not it went well. Sitting
     with somebody tells you something even when the plan fails. */
  E.refreshBelief(state.rel, state.cast, me, them, state.week, rng,
    { confessional: opt.fx.indexOf('read') !== -1 });
  out.read = E.read(state.rel, me, them);
  return out;
}

function applyEffects(state, out, fx, rng) {
  const me = state.human, them = out.target;

  for (const f of fx) {
    if (f === 'read') {
      out.fx.push({ k: 'read' });
    } else if (f === 'ally') {
      const mutual = state.rel.trust[them][me] >= E.K.ALLY_FORM_TRUST - 8
        && state.rel.trust[me][them] >= E.K.ALLY_FORM_TRUST - 16;
      if (mutual && !E.sharedAlliances(state.alliances, me, them).length
          && E.allianceOf(state.alliances, me).length < E.K.ALLY_MAX_PER_PLAYER) {
        const al = E.makeAlliance([me, them], state.week);
        state.alliances.push(al);
        E.applyTrust(state.rel, me, them, E.K.D_ALLIANCE);
        E.applyTrust(state.rel, them, me, E.K.D_ALLIANCE);
        out.fx.push({ k: 'ally', id: al.id });
      } else out.fx.push({ k: 'ally_declined' });
    } else if (f === 'intent') {
      if (state.atRisk.length === 2) {
        /* You steer them toward whichever nominee you are further from. */
        const pick = state.rel.trust[me][state.atRisk[0]] < state.rel.trust[me][state.atRisk[1]]
          ? state.atRisk[0] : state.atRisk[1];
        state.voteIntent[them] = pick;
        out.fx.push({ k: 'intent', target: pick });
      }
    } else if (f === 'info') {
      const pool = state.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them);
      if (pool.length) {
        const who = rng.pick(pool);
        out.fx.push({ k: 'info', a: them, b: who.id, band: E.band(state.rel.trust[them][who.id]).label });
        const al = E.sharedAlliances(state.alliances, them, who.id)[0];
        if (al) { al.known[me] = state.week; out.fx.push({ k: 'alliance_seen', members: al.members.slice() }); }
      }
    } else if (f === 'heat') {
      const pool = state.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them);
      if (pool.length) {
        /* Point them at somebody they already half dislike. Heat only travels
           downhill. */
        const who = pool.sort((x, y) => state.rel.trust[them][x.id] - state.rel.trust[them][y.id])[0];
        E.applyTrust(state.rel, them, who.id, -rng.range(7, 15));
        state.rel.suspicion[them][who.id] = Math.min(100, state.rel.suspicion[them][who.id] + 12);
        out.fx.push({ k: 'heat', who: who.id });
      }
    } else if (f === 'suspicion') {
      state.rel.suspicion[them][me] = Math.min(100, state.rel.suspicion[them][me] + 8);
      out.fx.push({ k: 'watched' });
    }
  }
}

const api = {
  ENERGY, SCENES, BEATS, RISK, MOVE_IN, weeklyEnergy,
  poolFor, pickScene, pickBeat, compose, riskyChance, resolve, GAIN,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_SCENES = api;

})();
