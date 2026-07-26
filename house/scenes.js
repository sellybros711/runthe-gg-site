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
 * They are independent on purpose. 40 scenes against 75 beats is 3,000 distinct
 * moments out of authored fragments, and adding one scene adds 75 more. That is
 * the only way to get "a ton of scenarios" and still hand author every line,
 * which GDD §17 requires. It is the same authored-fragments-plus-deterministic-
 * assembly rule as strings.js, one level up.
 *
 *   LIVE    a third bank, added after the playtest note "the chats need to be
 *           way more specific". Same authored fragments, given REAL ARGUMENTS:
 *           who is on the block, who the Captain wants, who lied last week.
 *           Each one asks whether its situation is currently true and only
 *           turns up when it is, so the more is going on, the more the house
 *           talks about it. About sixty percent of conversations are one.
 *
 * ── FOUR ANSWERS, NONE OF THEM LABELLED ────────────────────────────────────
 *
 * There used to be three, tagged SAFE, EVEN and RISKY, always in that order.
 * Playtest: "I don't like that we tell the user which option is risky. I want
 * to just give them 4 choices and they can choose based on what they think the
 * decision is." Correct. A badge saying RISKY does the reading for the player,
 * which is the one job the player came here to do.
 *
 * So the kinds still exist, because they drive the gain and the roll, and
 * nothing surfaces them:
 *
 *   safe     always works, small gain, tells you nothing new
 *   neutral  usually works, better gain, often refreshes your read
 *   risky    rolls against them. Wins big AND does something mechanical:
 *            moves a vote, opens an alliance, turns somebody. Loses hard, and
 *            if it named a person, that person hears about it.
 *
 * The order is shuffled so position cannot become a badge either. What tells
 * you the cost is the text: "Say you are with the house" and "Tell them the
 * house is wrong" do not need a tag to be told apart.
 *
 * The fourth answer is built from the house rather than the bank, so even a
 * conversation that starts somewhere ordinary has one way out of it that is
 * about somebody real.
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
  /*
   * Pulling a group into one room. One energy per person you are trying to get
   * there, so a three way costs three, which is most of a week's budget for a
   * thing that can fail. It should be a decision, not a habit.
   */
  GATHER_PER_HEAD: 1,
  GATHER_MIN: 2, GATHER_MAX: 4,
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
/*
 * MOVE IN NIGHT.
 *
 * Playtest: "the beginning asks the same 3 questions every time and idk how
 * much the answers actually affect anything."
 *
 * Both true, and the second explains the first. There were three beats, always
 * the same three in the same order, and every option applied ONE signed number
 * to all fifteen people scaled by a positive multiplier. So the whole room
 * moved together, your position relative to anybody else barely changed, and
 * three questions produced roughly one outcome.
 *
 * The fix is not more questions, it is answers that SPLIT THE ROOM. `react`
 * returns a signed response per person, so taking the room wins the confident
 * half and puts off the wary half, and the house you wake up in on day two is
 * different depending on what you did. `focus` goes further: some answers spend
 * the whole night on one person and give you a real bond and fourteen
 * strangers, which is a legitimate and very different way to start.
 *
 * Twelve beats, four of them per run, drawn off the `gen` stream so the opening
 * is part of the seed rather than part of the session.
 */
const MOVE_IN_SHOWN = 4;

/* Handy shorthands. p is the person reacting; every function returns a signed
   multiplier, roughly -1.2 to +1.5, applied to the beat's spread. */
const conf = (p) => (p.social.charisma - 50) / 50;
const wary = (p) => (p.social.paranoia - 50) / 50;
const loyal = (p) => (p.social.loyalty - 50) / 50;
const sharp = (p) => (p.social.perception - 50) / 50;
const sly = (p) => (p.social.deception - 50) / 50;

const MOVE_IN = [
  { id: 'first_word',
    line: 'The door closes behind sixteen people who have never met. Somebody has to speak first.',
    options: [
      { t: 'Let somebody else.', spread: [2, 6], react: (p) => 0.4 + wary(p) * 0.8 - conf(p) * 0.4 },
      { t: 'Say your name and where you are from, and nothing else.',
        spread: [3, 8], react: (p) => 0.7 + loyal(p) * 0.4 },
      { t: 'Take the room.', spread: [4, 14], react: (p) => conf(p) * 1.3 - wary(p) * 0.9 + 0.2 },
      { t: 'Speak last, after everybody else, and make it count.',
        spread: [3, 11], react: (p) => sharp(p) * 1.0 - conf(p) * 0.3 + 0.3 },
    ] },

  { id: 'first_night',
    line: 'First night. Nobody is sleeping and everybody is pretending to.',
    options: [
      { t: 'Go to bed anyway.', spread: [1, 4], react: (p) => 0.3 + wary(p) * 0.3 },
      { t: 'Sit up in the kitchen with whoever is still awake.',
        spread: [3, 10], react: (p) => 0.6 + conf(p) * 0.7 },
      { t: 'Find the one person nobody has spoken to and stay with them.',
        spread: [8, 20], focus: 'quietest', react: () => -0.05 },
      { t: 'Walk the house on your own and learn where everything is.',
        spread: [2, 7], react: (p) => sharp(p) * 0.9 - 0.1 },
    ] },

  { id: 'the_problem',
    line: 'First morning. Someone asks, lightly, who you think is going to be a problem in here.',
    options: [
      { t: 'Say it is far too early to know.', spread: [2, 6], react: (p) => 0.5 + sharp(p) * 0.4 },
      { t: 'Say you are more interested in who is going to be fun.',
        spread: [3, 9], react: (p) => 0.6 + conf(p) * 0.6 - sharp(p) * 0.3 },
      { t: 'Give them a name.', spread: [5, 16], react: (p) => sly(p) * 1.2 - loyal(p) * 1.0 },
      { t: 'Turn it round and ask who they would name.',
        spread: [3, 10], react: (p) => sly(p) * 0.7 + sharp(p) * 0.5 - wary(p) * 0.4 },
    ] },

  { id: 'the_beds',
    line: 'There are not enough good beds and everybody has worked that out at the same time.',
    options: [
      { t: 'Take one and say nothing.', spread: [2, 8], react: (p) => conf(p) * 0.6 - loyal(p) * 0.5 },
      { t: 'Give yours up before anybody asks.', spread: [4, 12], react: (p) => 0.7 + loyal(p) * 0.8 - sly(p) * 0.5 },
      { t: 'Suggest drawing for them.', spread: [3, 9], react: (p) => 0.6 + sharp(p) * 0.3 },
      { t: 'Let the argument run and see who wants it most.',
        spread: [2, 11], react: (p) => sharp(p) * 0.9 - conf(p) * 0.6 - 0.1 },
    ] },

  { id: 'the_toast',
    line: 'Somebody finds a bottle and decides there should be a toast.',
    options: [
      { t: 'Raise your glass and let them talk.', spread: [2, 6], react: (p) => 0.5 },
      { t: 'Make the toast yourself.', spread: [4, 13], react: (p) => conf(p) * 1.1 - wary(p) * 0.6 + 0.2 },
      { t: 'Toast the one person who looks like they would rather be anywhere else.',
        spread: [7, 18], focus: 'quietest', react: (p) => 0.2 - sly(p) * 0.3 },
      { t: 'Skip it and start washing up.', spread: [1, 6], react: (p) => loyal(p) * 0.8 - conf(p) * 0.4 + 0.2 },
    ] },

  { id: 'the_cameras',
    line: 'Somebody points out how many cameras there are. The room goes quiet for a second.',
    options: [
      { t: 'Laugh it off.', spread: [2, 7], react: (p) => 0.5 + conf(p) * 0.4 },
      { t: 'Say you have stopped noticing them, which is a lie.',
        spread: [3, 10], react: (p) => sly(p) * 0.9 + 0.2 },
      { t: 'Say out loud that everything either of you says is being kept.',
        spread: [3, 12], react: (p) => sharp(p) * 1.1 - conf(p) * 0.5 },
      { t: 'Wave at one.', spread: [2, 9], react: (p) => conf(p) * 0.8 - sharp(p) * 0.4 + 0.2 },
    ] },

  { id: 'the_pairs',
    line: 'Two people have found each other already and everybody else has noticed.',
    options: [
      { t: 'Leave them to it.', spread: [2, 6], react: (p) => 0.4 + loyal(p) * 0.3 },
      { t: 'Sit down with them and make it three.',
        spread: [4, 13], react: (p) => conf(p) * 0.9 - wary(p) * 0.5 + 0.2 },
      { t: 'Say something about it where the rest of the room can hear.',
        spread: [4, 14], react: (p) => sly(p) * 0.8 - loyal(p) * 0.9 + sharp(p) * 0.4 },
      { t: 'Go and find whoever is on their own instead.',
        spread: [7, 17], focus: 'quietest', react: () => 0 },
    ] },

  { id: 'the_job',
    line: 'The questions get round to what everybody does on the outside.',
    options: [
      { t: 'Tell the truth.', spread: [3, 9], react: (p) => 0.6 + loyal(p) * 0.5 - sharp(p) * 0.2 },
      { t: 'Tell the truth and make it sound duller than it is.',
        spread: [3, 11], react: (p) => sly(p) * 0.5 + 0.5 - sharp(p) * 0.4 },
      { t: 'Lie, and pick something nobody will ask about twice.',
        spread: [4, 15], react: (p) => sly(p) * 1.2 - sharp(p) * 1.1 },
      { t: 'Ask everybody else first and answer last.',
        spread: [3, 10], react: (p) => sharp(p) * 0.8 + 0.2 },
    ] },

  { id: 'the_loud_one',
    line: 'One of them has been talking since the door shut and shows no sign of stopping.',
    options: [
      { t: 'Let them go.', spread: [2, 7], react: (p) => 0.4 + wary(p) * 0.3 },
      { t: 'Match them.', spread: [3, 13], react: (p) => conf(p) * 1.2 - 0.2 },
      { t: 'Catch somebody else\'s eye about it.',
        spread: [5, 14], react: (p) => sly(p) * 0.7 + sharp(p) * 0.6 - loyal(p) * 0.4 },
      { t: 'Ask them a question that makes them stop and think.',
        spread: [4, 12], react: (p) => sharp(p) * 0.9 + 0.3 },
    ] },

  { id: 'the_rules',
    line: 'The rules get read out. Somebody asks whether anybody actually understood the part about the Veto.',
    options: [
      { t: 'Say you did, and hope.', spread: [2, 8], react: (p) => conf(p) * 0.5 - sharp(p) * 0.6 + 0.2 },
      { t: 'Admit you did not.', spread: [3, 10], react: (p) => 0.7 + loyal(p) * 0.5 - sly(p) * 0.3 },
      { t: 'Explain it to the room.', spread: [4, 14], react: (p) => sharp(p) * 0.6 + conf(p) * 0.6 - wary(p) * 0.7 },
      { t: 'Say nothing and work out who else is pretending.',
        spread: [2, 9], react: (p) => sharp(p) * 1.0 - 0.2 },
    ] },

  { id: 'the_photo',
    line: 'Everybody is asked to put one thing from home on the shelf in the hallway.',
    options: [
      { t: 'Put up something ordinary.', spread: [2, 7], react: (p) => 0.5 },
      { t: 'Put up the thing you would actually miss.',
        spread: [4, 13], react: (p) => 0.6 + loyal(p) * 0.9 - sly(p) * 0.4 },
      { t: 'Put up nothing.', spread: [2, 11], react: (p) => wary(p) * 0.9 - conf(p) * 0.5 - 0.1 },
      { t: 'Ask about somebody else\'s before you put up your own.',
        spread: [5, 15], focus: 'random', react: (p) => 0.3 },
    ] },

  { id: 'the_first_read',
    line: 'Late, and somebody asks you straight out who you have got a good feeling about.',
    options: [
      { t: 'Say you have not decided.', spread: [2, 7], react: (p) => 0.4 + wary(p) * 0.4 },
      { t: 'Say them.', spread: [6, 16], focus: 'asker', react: (p) => 0.1 - sharp(p) * 0.3 },
      { t: 'Name two other people and watch their face.',
        spread: [4, 13], react: (p) => sly(p) * 0.9 + sharp(p) * 0.4 - loyal(p) * 0.5 },
      { t: 'Say the honest answer, whoever it is.',
        spread: [4, 12], react: (p) => 0.6 + loyal(p) * 0.7 - sly(p) * 0.5 },
    ] },
];

/**
 * The four beats this run opens with, off the `gen` stream so they belong to the
 * seed. Shared seeds have to open the same way or the seed means nothing.
 */
function moveInFor(rng) {
  const pool = MOVE_IN.slice();
  rng.shuffle(pool);
  return pool.slice(0, MOVE_IN_SHOWN);
}

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
  { pool: 'bond', line: '{name} is doing the thing where they laugh a beat after everybody else.', needs: 'history',
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
  { pool: 'probe', line: 'You want to know where {name} actually is this week.', needs: 'noms',
    a: { t: 'Ask what they make of the noms.' },
    b: { t: 'Ask who they think is running things.', fx: ['read'] },
    c: { t: 'Ask them flat out who they are voting for.', fx: ['read', 'info'] } },
  { pool: 'probe', line: '{name} has been in a lot of rooms with a lot of people this week.', needs: 'history',
    a: { t: 'Mention it lightly.' },
    b: { t: 'Ask what everybody has been telling them.', fx: ['info'] },
    c: { t: 'Tell them it looks bad and ask what they are doing.', fx: ['info', 'suspicion'] } },
  { pool: 'probe', line: 'There is a name that keeps coming up and you cannot tell who started it.', needs: 'history',
    a: { t: 'Ask if they have heard it too.' },
    b: { t: 'Ask where they think it came from.', fx: ['info'] },
    c: { t: 'Tell them you think it came from them.', fx: ['info', 'suspicion'] } },
  { pool: 'probe', line: '{name} keeps saying we. You would like to know who is in it.',
    a: { t: 'Let the we go unexamined.' },
    b: { t: 'Ask who we is.', fx: ['read'] },
    c: { t: 'Ask whether you are in it.', fx: ['read', 'ally'] } },
  { pool: 'probe', line: 'Somebody told you {name} said your name. It might not be true.', needs: 'history',
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
  { pool: 'deflect', line: '{name} has been watching you since the vote and is not hiding it.', needs: 'history',
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
  { pool: 'gossip', line: '{name} wants to know what people say about them.', needs: 'history',
    a: { t: 'Say only good things, which is a lie they will accept.' },
    b: { t: 'Tell them the mild version of the truth.', fx: ['read'] },
    c: { t: 'Tell them exactly who said what.', fx: ['info', 'heat'] } },
  { pool: 'gossip', line: 'Two other people are working together and you are fairly sure of it.', needs: 'history',
    a: { t: 'Keep it to yourself a while longer.' },
    b: { t: 'Ask {name} whether they have noticed.', fx: ['info'] },
    c: { t: 'Tell {name} it exists and let them do something about it.', fx: ['heat', 'info'] } },
  { pool: 'gossip', line: '{name} is repeating something back to you that you told somebody else.', needs: 'history',
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
  { pool: 'captain', line: 'You are the Captain and {name} has come upstairs to find out what that means for them.', needs: 'noms',
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
  { pool: 'late', line: 'You are both counting jury votes and pretending you are not.', needs: 'history',
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
  { pool: 'bond', line: 'Somebody left and the house is quieter than it was.', needs: 'history',
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
  { pool: 'probe', line: '{name} answered the same question differently to two people today.', needs: 'history',
    a: { t: 'File it away.' },
    b: { t: 'Ask the question a third time and see which version you get.', fx: ['read'] },
    c: { t: 'Tell them you have heard both versions.', fx: ['read', 'suspicion'] } },
  { pool: 'probe', line: 'You want to know whether {name} would ever put you up.',
    a: { t: 'Do not hand them the idea.' },
    b: { t: 'Ask what they would do with the power.', fx: ['read'] },
    c: { t: 'Ask whether you would be safe.', fx: ['read', 'ally'] } },
  { pool: 'probe', line: '{name} has been very careful with you all week.', needs: 'history',
    a: { t: 'Be careful back.' },
    b: { t: 'Ask them why they are being careful.', fx: ['read'] },
    c: { t: 'Say something reckless and watch what they do with it.', fx: ['read', 'info'] } },

  // ── float, continued ──
  { pool: 'float', line: 'There is a name that would solve this week for both of you.', needs: 'noms',
    a: { t: 'Wait for them to get there.' },
    b: { t: 'Describe the problem without naming the solution.', fx: ['read'] },
    c: { t: 'Name it and ask them to carry it.', fx: ['intent', 'heat'] } },
  { pool: 'float', line: '{name} has the Captaincy and has not decided yet.', needs: 'noms',
    a: { t: 'Stay out of their room.' },
    b: { t: 'Go up and talk about anything else.', fx: ['read'] },
    c: { t: 'Go up and give them a name.', fx: ['intent'] } },
  { pool: 'float', line: 'The house has half agreed on somebody and it is not who you want.', needs: 'noms',
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
  { pool: 'deflect', line: 'Your name has been in the air for two days and nobody has said it to you.', needs: 'history',
    a: { t: 'Wait for somebody to.' },
    b: { t: 'Ask {name} whether they have heard it.', fx: ['read', 'info'] },
    c: { t: 'Say it yourself, first, and dare them to agree.', fx: ['heat'] } },
  { pool: 'deflect', line: '{name} watched you come out of a room you had no reason to be in.',
    a: { t: 'Behave as though it was nothing.' },
    b: { t: 'Explain it before they ask.', fx: ['read'] },
    c: { t: 'Tell them who you were actually in there with.', fx: ['info', 'heat'] } },
  { pool: 'deflect', line: 'Somebody has been telling people you are running this house.', needs: 'history',
    a: { t: 'Be smaller for a week.' },
    b: { t: 'Ask {name} where they think it started.', fx: ['info'] },
    c: { t: 'Point out who benefits from you looking like that.', fx: ['heat', 'suspicion'] } },

  // ── gossip, continued ──
  { pool: 'gossip', line: '{name} wants to trade. They have something and they want something.',
    a: { t: 'Decline politely.' },
    b: { t: 'Trade something you were going to lose anyway.', fx: ['info'] },
    c: { t: 'Trade something real and take what they have.', fx: ['info', 'ally'] } },
  { pool: 'gossip', line: 'Two people had an argument and you were the only one who saw it.', needs: 'history',
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
  { pool: 'captain', line: 'You have to name two and there are four people you would happily see gone.', needs: 'noms',
    a: { t: 'Tell {name} you have not decided.' },
    b: { t: 'Ask {name} who they would name.', fx: ['read', 'info'] },
    c: { t: 'Tell {name} they are safe and ask for something in return.', fx: ['ally', 'intent'] } },
  { pool: 'captain', line: '{name} has come to tell you they are loyal, which is what people say when they are not.',
    a: { t: 'Thank them and believe none of it.' },
    b: { t: 'Ask them to prove it with a name.', fx: ['read', 'info'] },
    c: { t: 'Tell them you know they were in the other room this morning.', fx: ['suspicion', 'heat'] } },
  { pool: 'captain', line: 'Naming these two costs you both of them for the rest of the game.', needs: 'noms',
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

/*
 * What has actually happened yet.
 *
 * Playtest caught this immediately and it was everywhere: week one offered "say
 * out loud that they have been off since the vote" when there had been no vote,
 * and "ask what they make of the noms" before anybody had been named. A beat
 * that refers to an event the run has not reached breaks the fiction harder
 * than a dull beat ever could, because it tells the player the house is not
 * really tracking anything.
 *
 *   noms      two people are on the block RIGHT NOW
 *   history   at least one eviction has already happened
 */
function beatAllowed(state, b) {
  if (!b.needs) return true;
  if (b.needs === 'noms') return state.atRisk && state.atRisk.length >= 2;
  if (b.needs === 'history') return (state.weeks && state.weeks.length > 0);
  return true;
}

/*
 * A RUN DOES NOT ASK YOU THE SAME THING TWICE.
 *
 * Measured before this: 82.7 percent of the conversations offered in a single
 * run were repeats, and three live beats accounted for 39 percent of
 * everything. Playtest: "I feel like I see the same questions be asked in
 * multiple plays and that makes me not want to play the game." Nothing was
 * stopping it. Selection was uniform over whatever currently applied, and the
 * beats that apply most often are by definition the ones that apply nearly
 * always.
 *
 * `seen` is a per-run tally kept on the state, so the weight is remembered
 * across a save and a reload. A beat you have had drops to a twelfth of its
 * weight, and a second time to a fiftieth. It never reaches zero: at Final 5
 * with four beats legal, "you have had them all" has to resolve to something.
 */
const REPEAT_WEIGHT = [1, 1 / 12, 1 / 50];

function seenCount(state, key) {
  return (state.beatsSeen && state.beatsSeen[key]) || 0;
}
function markSeen(state, key) {
  if (!key) return;
  if (!state.beatsSeen) state.beatsSeen = {};
  state.beatsSeen[key] = (state.beatsSeen[key] || 0) + 1;
}
function repeatWeight(state, key) {
  return REPEAT_WEIGHT[Math.min(REPEAT_WEIGHT.length - 1, seenCount(state, key))];
}

function pickBeat(state, rng, me, them) {
  const pools = poolFor(state, me, them);
  const pool = pools[Math.floor(rng() * pools.length)];
  let list = BEATS.filter((b) => b.pool === pool && beatAllowed(state, b));
  if (!list.length) list = BEATS.filter((b) => b.pool === 'bond' && beatAllowed(state, b));
  if (!list.length) list = BEATS.filter((b) => !b.needs);
  if (!list.length) return BEATS[0];
  return rng.weighted(list, list.map((b) => repeatWeight(state, 'b' + BEATS.indexOf(b))));
}

/** Everything the UI needs to render one moment. */
// ─── live beats ──────────────────────────────────────────────────────────────

/*
 * CONVERSATIONS ABOUT THIS HOUSE, NOT A HOUSE.
 *
 * Playtest: "the chats need to be way more specific and unique. For example
 * someone can say to you 'I heard people want to vote this person out, should
 * we follow?'"
 *
 * Exactly right, and the reason it did not happen is that BEATS are authored
 * with one slot in them, {name}, so the most specific a beat could ever get was
 * the person you were standing next to. Everything else in the run, who is on
 * the block, who the Captain wants, who lied to whom last Thursday, was
 * invisible to the conversation system.
 *
 * These are the same authored fragments, given real arguments. Each one asks
 * whether its situation is currently true, and only turns up when it is. A live
 * beat is preferred over a generic one when any are available, so the more is
 * going on in the house, the more the house talks about it.
 *
 * They are ALSO where the mechanical weight now lives. A generic beat moves
 * trust; these move votes, expose rooms, and put names in people's mouths.
 */
function first(a) { return a && a.length ? a[0] : null; }

const LIVE = [
  /* The one the playtest asked for by name. */
  { id: 'follow_house', w: 5,
    when: (st, me, them) => {
      if (st.atRisk.length !== 2 || st.atRisk.indexOf(them) !== -1) return null;
      if (st.atRisk.indexOf(me) !== -1) return null;
      const lean = st.voteIntent[them];
      if (lean == null) return null;
      const other = st.atRisk.filter((i) => i !== lean)[0];
      return { lean, other };
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} says the house is going for ${N(st, c.lean)}. They want to know if you are with it.`,
      options: [
        { t: `Say you are with the house.`, kind: 'safe', fx: [] },
        { t: `Say you have not decided and ask who told them.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Tell them the house is wrong and it should be ${N(st, c.other)}.`,
          kind: 'risky', fx: ['swing:' + c.other] },
        { t: `Agree out loud and quietly work out who started it.`, kind: 'neutral', fx: ['info', 'suspicion'] },
      ] }) },

  /* Your name is being said. */
  { id: 'your_name', w: 6,
    when: (st, me, them) => {
      if (st.captain == null || st.captain === me || st.captain === them) return null;
      if (st.hohTarget == null) return null;
      /* Your name, or the name of somebody you are actually in a room with,
         which is the same problem arriving one step away. */
      const mine = st.hohTarget === me;
      const ours = !mine && E.sharedAlliances(st.alliances, me, st.hohTarget)
        .some((a) => a.alive);
      if (!mine && !ours) return null;
      if (mine && st.atRisk.indexOf(me) !== -1) return null;
      return { cap: st.captain, mine, who: st.hohTarget };
    },
    build: (st, me, them, c) => ({
      line: c.mine
        ? `${N(st, them)} tells you ${N(st, c.cap)} has been saying your name in the other room.`
        : `${N(st, them)} tells you ${N(st, c.cap)} is coming for ${N(st, c.who)}, who is one of yours.`,
      options: [
        { t: `Thank them and act as though it is nothing.`, kind: 'safe', fx: [] },
        { t: `Ask them exactly what was said.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Ask them to go back in and put somebody else's name up instead.`,
          kind: 'risky', fx: ['heat:' + c.cap, 'ally'] },
        { t: `Say you already knew, which you did not.`, kind: 'risky', fx: ['suspicion', 'read'] },
      ] }) },

  /* A room you have found out about. */
  { id: 'known_room', w: 5,
    when: (st, me, them) => {
      const seen = st.alliances.filter((a) => a.alive && a.known && a.known[me] != null
        && a.members.indexOf(me) === -1 && a.members.indexOf(them) === -1);
      const al = first(seen);
      return al ? { members: al.members.slice(0, 2) } : null;
    },
    build: (st, me, them, c) => ({
      line: `You know something ${N(st, them)} does not: ${N(st, c.members[0])} and ${N(st, c.members[1])} are working together.`,
      options: [
        { t: `Keep it.`, kind: 'safe', fx: [] },
        { t: `Hint at it and see whether they already knew.`, kind: 'neutral', fx: ['read'] },
        { t: `Tell them straight. Give them the room.`, kind: 'risky',
          fx: ['heat:' + c.members[0], 'ally'] },
        { t: `Tell them, and ask what they will do with it.`, kind: 'risky', fx: ['info', 'suspicion'] },
      ] }) },

  /* Somebody got blindsided last week and is still counting. */
  { id: 'last_vote', w: 4,
    when: (st, me, them) => {
      const w = st.weeks[st.weeks.length - 1];
      if (!w || !w.evicted) return null;
      const v = (w.votes || []).filter((x) => x.voter === them)[0];
      if (!v || !v.promisedTarget || v.promisedTarget === v.target) return null;
      return { gone: w.evicted, said: v.promisedTarget };
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} is still going over last week. They told somebody they were voting ${N(st, c.said)} and then they did not.`,
      options: [
        { t: `Let them talk.`, kind: 'safe', fx: ['read'] },
        { t: `Ask who changed their mind for them.`, kind: 'neutral', fx: ['info'] },
        { t: `Say you know, because you counted.`, kind: 'risky', fx: ['read', 'suspicion'] },
        { t: `Tell them it was the right call and you would have done it too.`,
          kind: 'neutral', fx: ['ally'] },
      ] }) },

  /* You are on the block and this person can vote. */
  { id: 'campaign', w: 6,
    when: (st, me, them) => (st.atRisk.indexOf(me) !== -1 && st.atRisk.indexOf(them) === -1
      && st.captain !== them) ? { other: st.atRisk.filter((i) => i !== me)[0] } : null,
    build: (st, me, them, c) => ({
      line: `${N(st, them)} has a vote and you are sitting there. They are not going to raise it, so you have to.`,
      options: [
        { t: `Ask them to keep you, and leave it at that.`, kind: 'safe', fx: [] },
        { t: `Ask them where their head is first, then ask.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: c.other != null
            ? `Make the case that ${N(st, c.other)} is the bigger problem for them.`
            : `Make the case that you are worth more to them alive.`,
          kind: 'risky', fx: c.other != null ? ['swing:' + c.other] : ['ally'] },
        { t: `Promise them the next three weeks.`, kind: 'risky', fx: ['ally', 'suspicion'] },
      ] }) },

  /* The Veto is sitting in somebody's pocket. */
  { id: 'veto_pocket', w: 4,
    when: (st, me, them) => (st.vetoHolder != null && !st.vetoUsed && st.atRisk.length === 2
      && st.phase === 'scheme2') ? { holder: st.vetoHolder } : null,
    build: (st, me, them, c) => ({
      line: c.holder === them
        ? `${N(st, them)} has the Veto and has not said what they are doing with it.`
        : `${N(st, them)} wants to know what ${N(st, c.holder)} is going to do with the Veto.`,
      options: [
        { t: `Say it is not your business.`, kind: 'safe', fx: [] },
        { t: `Say what you would do, and watch them.`, kind: 'neutral', fx: ['read'] },
        { t: c.holder === them
            ? `Ask them to use it, and say who should go up instead.`
            : `Tell them you will go and find out.`,
          kind: 'risky', fx: c.holder === them ? ['ally', 'intent'] : ['info'] },
        { t: `Say you have heard something about it that you have not.`,
          kind: 'risky', fx: ['heat:' + c.holder, 'suspicion'] },
      ] }) },

  /* Somebody has won too much and everybody has noticed. */
  { id: 'the_beast', w: 1.5,
    when: (st, me, them) => {
      const pool = st.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them
        && p.compWins.length >= 2);
      pool.sort((a, b) => b.compWins.length - a.compWins.length);
      return pool.length ? { beast: pool[0].id } : null;
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} brings up ${N(st, c.beast)} again. Nobody in this house has won more and everybody has counted.`,
      options: [
        { t: `Agree and say nothing else.`, kind: 'safe', fx: [] },
        { t: `Ask whether they would put them up.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say the two of you should take them out and mean it.`, kind: 'risky', fx: ['ally', 'heat:' + c.beast] },
        { t: `Defend them, and see what that costs you.`, kind: 'risky', fx: ['read', 'suspicion'] },
      ] }) },

  /* Hungry people say things. */
  { id: 'rations', w: 2,
    when: (st, me, them) => (st.rations && st.rations.indexOf(them) !== -1) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} is on Rations and has not eaten properly in three days. It is in their face.`,
      options: [
        { t: `Sit with them and do not mention it.`, kind: 'safe', fx: [] },
        { t: `Ask how bad it actually is.`, kind: 'neutral', fx: ['read'] },
        { t: `Say you will remember this when you have the power.`, kind: 'risky', fx: ['ally'] },
        { t: `Point out who put them there.`, kind: 'risky', fx: ['heat:' + '@captain', 'read'] },
      ] }) },

  /* The end is close enough to name. */
  { id: 'the_end', w: 3,
    when: (st, me, them) => (st.cast.filter((p) => p.status === 'active').length <= 6) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} asks it straight. Who are you sitting next to at the end.`,
      options: [
        { t: `Say you have not thought about it.`, kind: 'safe', fx: [] },
        { t: `Turn it round and ask them first.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say their name.`, kind: 'risky', fx: ['ally'] },
        { t: `Say their name, knowing it is not true.`, kind: 'risky', fx: ['ally', 'suspicion'] },
      ] }) },

  /* Who you are always with, and who has noticed. */
  { id: 'the_pair', w: 4,
    when: (st, me, them) => {
      const pool = st.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them);
      pool.sort((a, b) => st.rel.trust[me][b.id] - st.rel.trust[me][a.id]);
      return (pool.length && st.rel.trust[me][pool[0].id] > 45) ? { close: pool[0].id } : null;
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} has noticed that you and ${N(st, c.close)} are always in the same room.`,
      options: [
        { t: `Laugh it off.`, kind: 'safe', fx: [] },
        { t: `Say you talk to everybody, and prove it by talking to them.`, kind: 'neutral', fx: ['read'] },
        { t: `Admit it and offer them the same.`, kind: 'risky', fx: ['ally'] },
        { t: `Say ${N(st, c.close)} is not as close to you as people think.`,
          kind: 'risky', fx: ['heat:' + c.close, 'suspicion'] },
      ] }) },

  /* Somebody has gone quiet on you and it shows. */
  { id: 'gone_cold', w: 4,
    when: (st, me, them) => {
      const pool = st.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them
        && st.rel.trust[p.id][me] < -10);
      pool.sort((a, b) => st.rel.trust[a.id][me] - st.rel.trust[b.id][me]);
      return pool.length ? { cold: pool[0].id } : null;
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} asks, carefully, what happened between you and ${N(st, c.cold)}.`,
      options: [
        { t: `Say nothing happened.`, kind: 'safe', fx: [] },
        { t: `Ask what they have heard.`, kind: 'neutral', fx: ['info', 'read'] },
        { t: `Give them your version first, before ${N(st, c.cold)} gives theirs.`,
          kind: 'risky', fx: ['heat:' + c.cold, 'ally'] },
        { t: `Say you would rather they made their own mind up.`, kind: 'neutral', fx: ['read'] },
      ] }) },

  /* Two people who cannot stand each other, which is useful to somebody. */
  { id: 'bad_blood', w: 4,
    when: (st, me, them) => {
      const act = st.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them);
      let worst = null, low = -5;
      for (const a of act) for (const b of act) {
        if (a.id === b.id) continue;
        const v = st.rel.trust[a.id][b.id];
        if (v < low) { low = v; worst = { a: a.id, b: b.id }; }
      }
      return worst;
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} says ${N(st, c.a)} and ${N(st, c.b)} nearly went at it in the kitchen.`,
      options: [
        { t: `Stay out of it.`, kind: 'safe', fx: [] },
        { t: `Ask which one they would keep.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say the two of you should let it run and pick up the pieces.`, kind: 'risky', fx: ['ally'] },
        { t: `Go and make it worse.`, kind: 'risky', fx: ['heat:' + c.a, 'suspicion'] },
      ] }) },

  /* Somebody who has never sat on the block, which people count. */
  { id: 'untouched', w: 4,
    when: (st, me, them) => {
      if (st.week < 4) return null;
      const pool = st.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them
        && !p.timesAtRisk);
      return pool.length ? { safe: pool[0].id } : null;
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} points out that ${N(st, c.safe)} has not sat up there once. Not one week.`,
      options: [
        { t: `Say that is just how it has fallen.`, kind: 'safe', fx: [] },
        { t: `Ask whether they think it is luck.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Agree, loudly, and put the idea in their head.`, kind: 'risky', fx: ['heat:' + c.safe] },
        { t: `Say you would rather talk about who is actually dangerous.`,
          kind: 'neutral', fx: ['read'] },
      ] }) },

  /* The person with the power, whoever it is. */
  { id: 'the_captain', w: 3,
    when: (st, me, them) => (st.captain != null && st.captain !== me && st.captain !== them
      && st.atRisk.length === 0) ? { cap: st.captain } : null,
    build: (st, me, them, c) => ({
      line: `${N(st, c.cap)} has the power and has not said a word about it. ${N(st, them)} wants to know what you make of that.`,
      options: [
        { t: `Say it is too early to read anything into it.`, kind: 'safe', fx: [] },
        { t: `Ask where they think they stand with them.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say you will go and find out, and come back to them with it.`,
          kind: 'risky', fx: ['ally', 'info'] },
        { t: `Say you think ${N(st, c.cap)} has already decided and it is not good.`,
          kind: 'risky', fx: ['heat:' + c.cap, 'suspicion'] },
      ] }) },

  /* ── more of them, because fifteen was not enough ────────────────────────
   *
   * With fifteen, the three that are true nearly every week took 39 percent of
   * every conversation in the game. Twenty five more, most keyed to situations
   * that come and go, so the bank the picker draws from is wide at any moment
   * rather than wide across a season.
   */

  { id: 'who_saved', w: 5,
    when: (st, me, them) => (st.vetoUsed && st.saved != null && st.saved !== them
      && st.vetoHolder != null && st.vetoHolder !== them) ? { s: st.saved, h: st.vetoHolder } : null,
    build: (st, me, them, c) => ({
      line: `${N(st, c.h)} used the Veto on ${N(st, c.s)}. ${N(st, them)} wants to know what that was about.`,
      options: [
        { t: `Say they are close and leave it there.`, kind: 'safe', fx: [] },
        { t: `Ask what they think ${N(st, c.h)} got for it.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say it means those two are a pair and should be treated as one.`,
          kind: 'risky', fx: ['heat:' + c.h, 'ally'] },
        { t: `Say you would have done the same, which tells them something.`,
          kind: 'risky', fx: ['read', 'suspicion'] },
      ] }) },

  { id: 'you_captain', w: 6,
    when: (st, me, them) => (st.captain === me && st.atRisk.length === 0) ? {} : null,
    build: (st, me, them) => ({
      line: `You have the power and ${N(st, them)} has found a reason to be in the same room as you.`,
      options: [
        { t: `Tell them nothing.`, kind: 'safe', fx: [] },
        { t: `Ask who they would put up.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Promise them they are safe.`, kind: 'risky', fx: ['ally'] },
        { t: `Promise them they are safe and mean the opposite.`,
          kind: 'risky', fx: ['ally', 'suspicion'] },
      ] }) },

  { id: 'they_captain', w: 6,
    when: (st, me, them) => (st.captain === them && st.atRisk.length === 0) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} has the power this week and everybody in this house wants five minutes.`,
      options: [
        { t: `Do not ask for anything.`, kind: 'safe', fx: ['read'] },
        { t: `Ask straight out whether you are safe.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Give them a name to look at instead of yours.`,
          kind: 'risky', fx: ['heat:@coldest', 'suspicion'] },
        { t: `Offer them your vote for the rest of the month.`, kind: 'risky', fx: ['ally'] },
      ] }) },

  { id: 'you_on_block', w: 6,
    when: (st, me, them) => (st.atRisk.indexOf(me) !== -1 && st.captain === them) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} put you up and is now standing in the kitchen as if that did not happen.`,
      options: [
        { t: `Be pleasant about it.`, kind: 'safe', fx: [] },
        { t: `Ask why it was you.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Tell them exactly what you think of it.`, kind: 'risky', fx: ['read', 'suspicion'] },
        { t: `Say you understand, and start counting.`, kind: 'neutral', fx: ['read'] },
      ] }) },

  { id: 'rations_you', w: 5,
    when: (st, me, them) => (st.rations && st.rations.indexOf(me) !== -1
      && st.rations.indexOf(them) === -1) ? {} : null,
    build: (st, me, them) => ({
      line: `You are on Rations and ${N(st, them)} is eating in front of you without meaning anything by it.`,
      options: [
        { t: `Say nothing about it.`, kind: 'safe', fx: [] },
        { t: `Make a joke of it.`, kind: 'neutral', fx: ['read'] },
        { t: `Ask them to save you something.`, kind: 'risky', fx: ['ally'] },
        { t: `Point out who put you here.`, kind: 'risky', fx: ['heat:@captain'] },
      ] }) },

  { id: 'week_one', w: 5,
    when: (st, me, them) => (st.week <= 1) ? {} : null,
    build: (st, me, them) => ({
      line: `Nothing has happened yet and ${N(st, them)} is already trying to work out who is with who.`,
      options: [
        { t: `Say it is far too early.`, kind: 'safe', fx: [] },
        { t: `Compare notes.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say the two of you should decide it before anybody else does.`,
          kind: 'risky', fx: ['ally'] },
        { t: `Give them a read that is not true and see where it turns up.`,
          kind: 'risky', fx: ['heat:@coldest', 'suspicion'] },
      ] }) },

  { id: 'the_numbers', w: 5,
    when: (st, me, them) => {
      const n = st.cast.filter((p) => p.status === 'active').length;
      return (n <= 9 && n > 6) ? { n } : null;
    },
    build: (st, me, them, c) => ({
      line: `${c.n} left. ${N(st, them)} says out loud that the numbers are about to stop being on anybody's side.`,
      options: [
        { t: `Agree and change the subject.`, kind: 'safe', fx: [] },
        { t: `Ask them who they count as theirs.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Count out loud with them, and put yourself in their column.`,
          kind: 'risky', fx: ['ally'] },
        { t: `Tell them their numbers are wrong and say why.`,
          kind: 'risky', fx: ['info', 'suspicion'] },
      ] }) },

  { id: 'they_suspect', w: 6,
    when: (st, me, them) => (st.rel.suspicion[them][me] > 35) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} has stopped finishing sentences around you. They think you did something.`,
      options: [
        { t: `Let it sit.`, kind: 'safe', fx: [] },
        { t: `Ask them straight what they have heard.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Deny it before they have accused you of anything.`,
          kind: 'risky', fx: ['suspicion', 'read'] },
        { t: `Give them somebody else to be suspicious of.`,
          kind: 'risky', fx: ['heat:@coldest'] },
      ] }) },

  { id: 'they_owe', w: 5,
    when: (st, me, them) => (st.rel.trust[them][me] > 55
      && E.sharedAlliances(st.alliances, me, them).some((a) => a.alive)) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} is in a room with you and has been for weeks. Neither of you has ever tested it.`,
      options: [
        { t: `Leave it untested.`, kind: 'safe', fx: [] },
        { t: `Ask what they would do if you were up.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Ask them to say your name out loud to somebody else.`,
          kind: 'risky', fx: ['ally', 'read'] },
        { t: `Tell them you have been carrying it and you want something back.`,
          kind: 'risky', fx: ['ally', 'suspicion'] },
      ] }) },

  { id: 'the_quiet_one', w: 4,
    when: (st, me, them) => {
      const pool = st.cast.filter((p) => p.status === 'active' && p.id !== me && p.id !== them);
      pool.sort((a, b) => a.social.charisma - b.social.charisma);
      return pool.length ? { q: pool[0].id } : null;
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} says nobody has heard ${N(st, c.q)} say a full sentence since the door shut.`,
      options: [
        { t: `Say some people are like that.`, kind: 'safe', fx: [] },
        { t: `Ask whether that worries them.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say quiet people are the ones who get to the end.`,
          kind: 'risky', fx: ['heat:' + c.q] },
        { t: `Say you will go and find out what they are actually doing.`,
          kind: 'risky', fx: ['info', 'ally'] },
      ] }) },

  { id: 'the_comp_next', w: 4,
    when: (st, me, them) => (st.phase === 'reset' || st.phase === 'scheme1') ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} is trying to work out what the next competition is going to be.`,
      options: [
        { t: `Say you never guess right.`, kind: 'safe', fx: [] },
        { t: `Compare what you have both noticed.`, kind: 'neutral', fx: ['read'] },
        { t: `Agree that whichever of you gets it will keep the other safe.`,
          kind: 'risky', fx: ['ally'] },
        { t: `Tell them you would rather not win it, and watch what they do with that.`,
          kind: 'risky', fx: ['read', 'suspicion'] },
      ] }) },

  { id: 'the_promise', w: 5,
    when: (st, me, them) => (st.voteIntent[them] != null
      && st.atRisk.indexOf(them) === -1 && st.atRisk.length === 2) ? { said: st.voteIntent[them] } : null,
    build: (st, me, them, c) => ({
      line: `${N(st, them)} has told you they are voting ${N(st, c.said)}. They have told other people other things.`,
      options: [
        { t: `Take them at their word.`, kind: 'safe', fx: [] },
        { t: `Ask them to say it again in front of somebody.`, kind: 'neutral', fx: ['read'] },
        { t: `Tell them you know what they said in the other room.`,
          kind: 'risky', fx: ['read', 'suspicion'] },
        { t: `Say it back to them as though it were your idea.`, kind: 'risky', fx: ['ally'] },
      ] }) },

  { id: 'the_target_friend', w: 5,
    when: (st, me, them) => {
      if (st.hohTarget == null || st.hohTarget === me || st.hohTarget === them) return null;
      return (st.rel.trust[them][st.hohTarget] > 45) ? { t: st.hohTarget } : null;
    },
    build: (st, me, them, c) => ({
      line: `The house is coming for ${N(st, c.t)}, and ${N(st, them)} is closer to them than anybody.`,
      options: [
        { t: `Say nothing and let them find out.`, kind: 'safe', fx: [] },
        { t: `Tell them what you have heard.`, kind: 'neutral', fx: ['info', 'read'] },
        { t: `Offer to help them save ${N(st, c.t)}.`, kind: 'risky', fx: ['ally'] },
        { t: `Tell them ${N(st, c.t)} is finished and they should get clear of it.`,
          kind: 'risky', fx: ['heat:' + c.t, 'suspicion'] },
      ] }) },

  { id: 'evicted_ghost', w: 4,
    when: (st, me, them) => {
      const w = st.weeks[st.weeks.length - 1];
      return (w && w.evicted != null) ? { gone: w.evicted } : null;
    },
    build: (st, me, them, c) => ({
      line: `${N(st, them)} keeps talking about ${N(st, c.gone)} as though they are still in the house.`,
      options: [
        { t: `Let them.`, kind: 'safe', fx: ['read'] },
        { t: `Ask what they think went wrong there.`, kind: 'neutral', fx: ['info'] },
        { t: `Tell them who actually did it.`, kind: 'risky', fx: ['heat:@coldest', 'info'] },
        { t: `Say it will be one of you next if you do not do something.`,
          kind: 'risky', fx: ['ally'] },
      ] }) },

  { id: 'you_won_it', w: 5,
    when: (st, me, them) => (st.cast[me].compWins.length >= 2 && st.captain !== me) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} points out, lightly, that you have won a few of these now.`,
      options: [
        { t: `Say you have been lucky.`, kind: 'safe', fx: [] },
        { t: `Ask whether people are talking about it.`, kind: 'neutral', fx: ['info', 'read'] },
        { t: `Say you will go out early in the next one if they will do the same.`,
          kind: 'risky', fx: ['ally'] },
        { t: `Own it, and let them decide what to do with that.`,
          kind: 'risky', fx: ['read', 'suspicion'] },
      ] }) },

  { id: 'no_room', w: 4,
    when: (st, me, them) => (!E.allianceOf(st.alliances, me).some((a) => a.alive)
      && st.week >= 3) ? {} : null,
    build: (st, me, them) => ({
      line: `Everybody in here belongs to something except you, and ${N(st, them)} has worked that out.`,
      options: [
        { t: `Say you like it that way.`, kind: 'safe', fx: [] },
        { t: `Ask what is actually out there.`, kind: 'neutral', fx: ['info', 'read'] },
        { t: `Ask them for a way in.`, kind: 'risky', fx: ['ally'] },
        { t: `Say being in nothing means being nobody's problem.`,
          kind: 'neutral', fx: ['read'] },
      ] }) },

  { id: 'the_double', w: 5,
    when: (st, me, them) => (st.twists && st.twists.double === st.week) ? {} : null,
    build: (st, me, them) => ({
      line: `Something is wrong with the schedule and ${N(st, them)} has noticed before anybody else.`,
      options: [
        { t: `Say you had not thought about it.`, kind: 'safe', fx: [] },
        { t: `Work out what it means together.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Agree now on who goes if it happens twice.`, kind: 'risky', fx: ['ally', 'intent'] },
        { t: `Let them work it out wrong.`, kind: 'risky', fx: ['read', 'suspicion'] },
      ] }) },

  { id: 'panel_watching', w: 4,
    when: (st, me, them) => (st.panel && st.panel.length >= 3) ? { n: st.panel.length } : null,
    build: (st, me, them, c) => ({
      line: `${c.n} of them are out there now with a vote each, and ${N(st, them)} has started counting them.`,
      options: [
        { t: `Say you have not thought about the end.`, kind: 'safe', fx: [] },
        { t: `Ask who they think is out there for them.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Tell them who you think is out there for you, honestly.`,
          kind: 'risky', fx: ['ally', 'read'] },
        { t: `Say the jury already hates one of you.`, kind: 'risky', fx: ['heat:@coldest'] },
      ] }) },

  { id: 'they_are_up', w: 6,
    when: (st, me, them) => (st.atRisk.indexOf(them) !== -1 && st.atRisk.indexOf(me) === -1)
      ? { other: st.atRisk.filter((i) => i !== them)[0] } : null,
    build: (st, me, them, c) => ({
      line: `${N(st, them)} is sitting up there and has come to find you about it.`,
      options: [
        { t: `Say you have not decided.`, kind: 'safe', fx: [] },
        { t: `Hear them out properly.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Tell them you are keeping them.`,
          kind: 'risky', fx: c.other != null ? ['swing:' + c.other, 'ally'] : ['ally'] },
        { t: `Tell them you are keeping them and vote the other way.`,
          kind: 'risky', fx: ['ally', 'suspicion'] },
      ] }) },

  { id: 'the_veto_field', w: 4,
    when: (st, me, them) => (st.vetoFieldIds && st.vetoFieldIds.length
      && st.vetoFieldIds.indexOf(them) !== -1 && st.vetoHolder == null) ? {} : null,
    build: (st, me, them) => ({
      line: `${N(st, them)} is playing for the Veto in an hour and cannot sit still.`,
      options: [
        { t: `Wish them luck.`, kind: 'safe', fx: [] },
        { t: `Ask what they will do if they win it.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Ask them to use it a particular way.`, kind: 'risky', fx: ['ally', 'intent'] },
        { t: `Tell them not to win it.`, kind: 'risky', fx: ['read', 'suspicion'] },
      ] }) },

  /* Somebody came down and somebody else went up. */
  { id: 'after_veto', w: 4,
    when: (st, me, them) => (st.vetoUsed && st.replacement != null && st.saved != null
      && st.replacement !== them) ? { saved: st.saved, repl: st.replacement } : null,
    build: (st, me, them, c) => ({
      line: `${N(st, c.saved)} came down and ${N(st, c.repl)} went up in their place. ${N(st, them)} has been quiet about it.`,
      options: [
        { t: `Say it was always going to happen.`, kind: 'safe', fx: [] },
        { t: `Ask what they made of it.`, kind: 'neutral', fx: ['read', 'info'] },
        { t: `Say ${N(st, c.repl)} was set up and you both know by whom.`,
          kind: 'risky', fx: ['heat:' + '@captain', 'ally'] },
        { t: `Say you are voting to keep ${N(st, c.repl)}.`, kind: 'risky', fx: ['swing:' + c.saved] },
      ] }) },
];

/** First name, short. */
function N(st, id) { return id == null ? 'somebody' : st.cast[id].first; }

/**
 * Which live beats are currently true. Deterministic order, so the same seed at
 * the same point in the same run offers the same conversation.
 */
function liveFor(state, me, them) {
  const out = [];
  for (const b of LIVE) {
    let ctx = null;
    try { ctx = b.when(state, me, them); } catch (e) { ctx = null; }
    if (ctx) out.push({ def: b, ctx, w: b.w || 1 });
  }
  return out;
}

function compose(state, rng, me, them) {
  const scene = pickScene(rng, them);
  const name = state.cast[them].first;

  /*
   * FOUR ANSWERS, NONE OF THEM LABELLED.
   *
   * Playtest: "I don't like that we tell the user which option is risky. I want
   * to just give them 4 choices and they can choose based on what they think
   * the decision is." Correct, and it makes the previous build's odds-read
   * redundant too: a tag saying RISKY and a sentence saying "this could go
   * either way" were both doing the reading FOR the player, which is the one
   * job the player came here to do.
   *
   * So the kinds still exist under the hood, because they drive the gain and
   * the roll, and nothing surfaces them. What tells you the cost is the text.
   * "Say you are with the house" and "Tell them the house is wrong" do not need
   * a badge to be told apart, and the order is shuffled so position cannot
   * become a badge either.
   */
  const live = liveFor(state, me, them);
  let base, poolName, beatIdx;
  if (live.length && rng.chance(LIVE_SHARE)) {
    /* Weighted, because "somebody has won a lot of comps" is true from week
       three onward and would otherwise crowd out every conversation that is
       actually about this week. The rarer and more urgent the situation, the
       harder it pulls. */
    const pickLive = rng.weighted(live,
      live.map((x) => x.w * repeatWeight(state, 'L' + x.def.id)));
    const built = pickLive.def.build(state, me, them, pickLive.ctx);
    base = { line: built.line, opts: built.options };
    poolName = 'live:' + pickLive.def.id;
    beatIdx = -1;
  } else {
    const beat = pickBeat(state, rng, me, them);
    base = { line: fill(beat.line, name),
      opts: [
        { t: beat.a.t, kind: 'safe', fx: beat.a.fx || [] },
        { t: beat.b.t, kind: 'neutral', fx: beat.b.fx || [] },
        { t: beat.c.t, kind: 'risky', fx: beat.c.fx || [] },
        fourth(state, rng, me, them),
      ] };
    poolName = beat.pool;
    beatIdx = BEATS.indexOf(beat);
  }

  /* The slot fill has to run over the OPTIONS as well as the line. It did not,
     and the answer column once shipped reading "Ask {name} whether they have
     noticed." A fragment bank is only as good as its assembly step. */
  const opts = base.opts.filter(Boolean).map((o) => ({
    kind: o.kind,
    text: fill(o.t, name),
    fx: o.fx || [],
    cost: o.kind === 'risky' ? ENERGY.SCENE_COST + ENERGY.RISKY_SURCHARGE : ENERGY.SCENE_COST,
  }));
  rng.shuffle(opts);
  opts.forEach((o, i) => { o.key = 'abcd'[i]; });

  return {
    target: them,
    scene: fill(scene.t, name),
    line: base.line,
    beat: beatIdx,
    pool: poolName,
    options: opts,
  };
}

/* How often a live beat wins when one is available. Not 1.0: a house where
   every single conversation is about the block is as flat as one where none of
   them are, and the bond beats are what make anybody worth keeping. */
const LIVE_SHARE = 0.62;

/*
 * The fourth answer on a generic beat, built from the house rather than the
 * bank. This is the other half of "the chats need to be more specific": even
 * when the conversation starts somewhere ordinary, one of the ways out of it
 * should be about somebody real.
 */
function fourth(state, rng, me, them) {
  const active = state.cast.filter((p) => p.status === 'active'
    && p.id !== me && p.id !== them).map((p) => p.id);
  if (!active.length) return null;

  /* On the block: the most useful thing anybody can say is a vote. */
  if (state.atRisk.length === 2 && state.atRisk.indexOf(them) === -1
    && state.atRisk.indexOf(me) === -1) {
    const a = state.atRisk[0], b = state.atRisk[1];
    const want = state.rel.trust[me][a] < state.rel.trust[me][b] ? a : b;
    return { t: `Tell them you are voting ${N(state, want)} out and ask them to come with you.`,
      kind: 'risky', fx: ['swing:' + want] };
  }
  /* Somebody they can be pointed at. */
  const cold = active.slice().sort((x, y) => state.rel.trust[them][x] - state.rel.trust[them][y])[0];
  if (rng.chance(0.5)) {
    return { t: `Bring up ${N(state, cold)} and let them do the talking.`,
      kind: 'neutral', fx: ['info', 'read'] };
  }
  return { t: `Ask them straight what ${N(state, cold)} has been saying about you.`,
    kind: 'risky', fx: ['info', 'suspicion'] };
}

// ─── resolution ──────────────────────────────────────────────────────────────

/*
 * What each answer is worth, and the arithmetic that had to be redone.
 *
 * Playtest note: "none of my risky talks have worked so far". Measured, the C
 * option lands 41 percent of the time for a level one player, which is a fair
 * coin flip and not the complaint. The complaint was correct about something
 * else: risky COST three energy against two and returned LESS. At the old
 * numbers its expected trust was +2.0 against safe's +3.5, so the strictly
 * worse play was also the expensive one, and the only reason to ever take it
 * was the information and alliances riding on the beat.
 *
 * The downside is now a sting rather than a week undone, which puts risky
 * marginally ahead per point of energy and leaves the variance as the real
 * cost. It is still the only route to intent, alliances and reads.
 */
const GAIN = {
  safe: [2, 5],
  neutral: [4, 9],
  risky_win: [12, 22],
  risky_lose: [-8, -3],
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
  BASE: 0.50,
  DRIVE: 0.005,          // per point of (your drive - their perception)
  TRUST_COVER: 0.0032,   // people extend the benefit of the doubt
  SUSPICION: 0.28,       // and stop extending it once they have caught you
  FAIL_SUSPICION: 10,    // what a failed risky answer costs you in their head
  SPILL: 0.55,           // odds a failed answer gets back to whoever it named
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

/*
 * The same number as a sentence, because the player was being asked to pick
 * between three options with no way to tell which one they could get away with.
 * Reads, not percentages: §17 keeps figures off anything to do with what
 * somebody thinks of you, and "they are watching you too closely" is the useful
 * version of 22 percent anyway.
 */
function riskyRead(state, me, them, beatFx) {
  const c = riskyChance(state, me, them, beatFx || []);
  if (c >= 0.68) return 'They would buy this from you.';
  if (c >= 0.52) return 'You could probably sell this.';
  if (c >= 0.38) return 'This could go either way.';
  if (c >= 0.24) return 'They are paying more attention than that.';
  return 'They are watching you too closely for this.';
}

/**
 * Play one option. Returns what happened, in enough detail for the UI to narrate
 * it and for the recap to reconstruct it.
 */
function resolve(state, moment, key, rng) {
  const me = state.human, them = moment.target;
  /* Marked here rather than in compose, because composing happens every time
     you so much as look at somebody and playing is what you actually saw. */
  markSeen(state, moment.pool && moment.pool.indexOf('live:') === 0
    ? 'L' + moment.pool.slice(5) : 'b' + moment.beat);
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
  else if (opt.kind === 'risky') {
    out.fx.push({ k: 'backfire' });
    /*
     * A failed answer that NAMED somebody now travels to them.
     *
     * Ten backfires a run and every one of them was the same flat trust hit,
     * which is the other half of "the chats don't have a big enough impact":
     * losing was as anonymous as winning was. The option told the room a name,
     * so when it misses, the person you named hears about it, and the house you
     * were trying to move moves against you instead.
     */
    for (const raw of opt.fx) {
      const cut = String(raw).indexOf(':');
      if (cut <= 0) continue;
      let who = String(raw).slice(cut + 1);
      if (who === '@captain') who = state.captain;
      else if (who === '@coldest') {
        const pool = state.cast.filter((p) => p.status === 'active'
          && p.id !== me && p.id !== them);
        pool.sort((a, b) => state.rel.trust[them][a.id] - state.rel.trust[them][b.id]);
        who = pool.length ? pool[0].id : null;
      } else who = Number(who);
      if (who == null || Number.isNaN(who) || !state.cast[who]
        || state.cast[who].status !== 'active' || who === me) continue;
      if (!rng.chance(RISK.SPILL)) continue;
      E.applyTrust(state.rel, who, me, -rng.range(6, 13));
      state.rel.suspicion[who][me] = Math.min(100, state.rel.suspicion[who][me] + 14);
      out.fx.push({ k: 'got_back', who });
      break;
    }
  }

  /* Every conversation refreshes your read whether or not it went well. Sitting
     with somebody tells you something even when the plan fails. */
  E.refreshBelief(state.rel, state.cast, me, them, state.week, rng,
    { confessional: opt.fx.indexOf('read') !== -1 });
  out.read = E.read(state.rel, me, them);
  return out;
}

function applyEffects(state, out, fx, rng) {
  const me = state.human, them = out.target;

  for (const raw of fx) {
    /*
     * TARGETED EFFECTS.
     *
     * Playtest: "I feel like the chats don't have a big enough impact." They
     * did not. Every effect was aimed by the engine at whoever it felt like:
     * `intent` steered a vote toward whichever nominee the PLAYER liked less,
     * `heat` pointed at whoever the other person already disliked. So the
     * player was never actually naming anybody, and a conversation could not
     * be a decision about a specific person.
     *
     * `swing:ID` and `heat:ID` carry the name the option said out loud, so
     * choosing "tell them you are voting Bandele out" now means Bandele, and
     * the option text and the mechanic cannot drift apart. `@captain` resolves
     * late, because the line is authored before there is a Captain.
     */
    let f = raw, arg = null;
    const cut = typeof raw === 'string' ? raw.indexOf(':') : -1;
    if (cut > 0) {
      f = raw.slice(0, cut);
      arg = raw.slice(cut + 1);
      /* Late-resolved names. A beat is authored before there is a Captain, and
         "whoever they already dislike" is a person the line cannot know. */
      if (arg === '@captain') arg = state.captain;
      else if (arg === '@coldest') {
        const pool = state.cast.filter((p) => p.status === 'active'
          && p.id !== me && p.id !== them);
        pool.sort((a, b) => state.rel.trust[them][a.id] - state.rel.trust[them][b.id]);
        arg = pool.length ? pool[0].id : null;
      } else arg = Number(arg);
      if (arg == null || Number.isNaN(arg) || !state.cast[arg]
        || state.cast[arg].status !== 'active') { continue; }
    }

    if (f === 'swing') {
      /*
       * A vote you actually moved, and the one effect in the game that can
       * change who leaves. Their loyalty to whoever they were already with is
       * what stands in the way, so this works on the persuadable and bounces
       * off somebody's number two, which is the correct shape.
       */
      const held = state.voteIntent[them];
      const loyal = (state.cast[them].social.loyalty / 100)
        * (held != null && E.sharedAlliances(state.alliances, them, held).length ? 1.6 : 0.7);
      const push = E.clamp01(0.78 - loyal * 0.55
        + state.rel.trust[them][me] / 320);
      if (rng.chance(push)) {
        state.voteIntent[them] = arg;
        out.fx.push({ k: 'swung', who: them, target: arg });
      } else {
        out.fx.push({ k: 'swing_refused', who: them, target: arg });
      }
    } else if (f === 'heat') {
      E.applyTrust(state.rel, them, arg, -rng.range(10, 20));
      state.rel.suspicion[them][arg] = Math.min(100, state.rel.suspicion[them][arg] + 16);
      out.fx.push({ k: 'heat', who: arg });
    } else if (f === 'read') {
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
    } else if (f === 'suspicion') {
      state.rel.suspicion[them][me] = Math.min(100, state.rel.suspicion[them][me] + 8);
      out.fx.push({ k: 'watched' });
    }
  }
}

/**
 * Get several people in one room and try to make it a thing.
 *
 * Alliances were previously something the player could only stumble into
 * pairwise, while the AI formed and grew groups behind their back all game.
 * This is the verb that was missing: name the people you think are already with
 * you and try to put a name on it.
 *
 * It is harder than a two way and it should be. EVERY pair in the room has to
 * hold, not just each person's feeling about you, because a group where two
 * members quietly cannot stand each other is not an alliance, it is a meeting.
 * That is also why the failure is expensive: you have just shown four people
 * exactly who you think your people are.
 */
function gatherChance(state, ids) {
  const me = state.human;
  let worst = 1;
  for (const a of [me].concat(ids)) {
    for (const b of [me].concat(ids)) {
      if (a === b) continue;
      const t = state.rel.trust[a][b];
      const p = E.clamp01((t + 10) / 90);
      if (p < worst) worst = p;
    }
  }
  /* Your own charisma is what holds a room together that would not hold itself. */
  const lift = 0.72 + state.cast[me].social.charisma / 260;
  const size = 1 - (ids.length - 1) * 0.12;
  return E.clamp(worst * lift * size, 0.05, 0.88);
}

function gather(state, ids, rng) {
  const me = state.human;
  const chance = gatherChance(state, ids);
  const out = { kind: 'gather', ids: ids.slice(), chance, landed: false, fx: [] };

  if (rng.chance(chance)) {
    const members = [me].concat(ids);
    const al = E.makeAlliance(members, state.week);
    state.alliances.push(al);
    for (const a of members) for (const b of members) {
      if (a !== b) E.applyTrust(state.rel, a, b, E.K.D_ALLIANCE * 0.8);
    }
    out.landed = true; out.alliance = al.id; out.members = members;
  } else {
    /* Everybody now knows who you counted on, including the people you left
       out of the room and the people in it who were not ready. */
    for (const id of ids) {
      E.applyTrust(state.rel, id, me, -rng.range(3, 9));
      state.rel.suspicion[id][me] = Math.min(100, state.rel.suspicion[id][me] + 12);
    }
  }
  for (const id of ids) {
    state.rel.lastWeek[me][id] = state.week;
    E.refreshBelief(state.rel, state.cast, me, id, state.week, rng);
  }
  return out;
}

const api = {
  ENERGY, SCENES, BEATS, RISK, MOVE_IN, MOVE_IN_SHOWN, moveInFor, weeklyEnergy, gatherChance, gather,
  poolFor, pickScene, pickBeat, beatAllowed, compose, riskyChance, riskyRead, resolve, GAIN,
  LIVE, liveFor, markSeen, seenCount,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_SCENES = api;

})();
