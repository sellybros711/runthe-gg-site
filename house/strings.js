/* RunTheHouse, the string banks.
 *
 * Browser: window.RH_STRINGS. Node: require. Linted by lint-strings.js.
 *
 * GDD §17. Every fragment in this file is hand authored. Sentences are
 * ASSEMBLED from them, deterministically, off the `text` RNG stream. A run
 * needs several hundred distinct beats across sixteen people and fourteen
 * weeks, which cannot all be written out individually and cannot be generated
 * freely without losing the voice. Authored fragments plus deterministic
 * assembly is the only honest reading of "every string is hand authored".
 *
 * THE RULES, enforced at build time by lint-strings.js, not by discipline:
 *   no emoji, ever
 *   no em dashes, anywhere
 *   no exclamation points outside the reaction bank
 *   nothing that sounds like an assistant explaining itself
 *
 * Voice: dry, observational, a little cold. The house has seen this before and
 * is not impressed by any of it. Second person for the player, third for
 * everyone else. Short sentences. No adverbs doing emotional work.
 */

'use strict';

/* WRAPPED IN AN IIFE, and it is not optional.
 *
 * These are plain <script> tags, not modules, so every file shares one global
 * scope in the browser. Unwrapped, `const api` in seven files, `const E` in
 * comps.js and run.js, `const T` in generate.js and run.js and `const BY_ID` in
 * tree.js and comps.js all collide, and a colliding top-level const does not
 * warn: the whole file fails to parse and its global is simply never defined.
 * Measured symptom was six of seven modules missing and the page rendering
 * nothing. football/engine.js hit the same wall and name-spaced its way out;
 * a closure is the version that does not need policing as files grow.
 */
(function () {


const S = {
  /* Slotted with {name}. Kept short because they sit under a monitor tile. */
  talkGood: [
    'You find {name} in the kitchen and stay longer than you meant to.',
    '{name} does most of the talking. You let them.',
    'Nothing strategic. That is the point of it.',
    '{name} tells you something they did not have to tell you.',
    'You agree about a third person. It is enough for now.',
  ],
  talkFlat: [
    '{name} is polite about it. Nothing lands.',
    'You talk for a while. Neither of you says anything.',
    '{name} keeps one eye on the door.',
  ],
  talkCold: [
    '{name} answers in the shortest sentences available.',
    'You get the version of {name} that everyone gets.',
    '{name} was already leaving when you started.',
  ],

  pitchOk: [
    '{name} says the name back to you. That usually means it stuck.',
    '{name} was already most of the way there.',
    'You make the case. {name} does not argue with it.',
  ],
  pitchFail: [
    '{name} hears you out and changes the subject.',
    'You misread the room. {name} likes {target} more than you thought.',
    '{name} will remember that you asked.',
  ],

  lieOk: [
    '{name} takes it at face value.',
    'It holds. For now it holds.',
    '{name} thanks you for telling them.',
  ],
  lieCaught: [
    '{name} lets you finish before telling you they already knew.',
    'You watch {name} decide not to believe you.',
    'The pause is too long. {name} has you.',
  ],

  allyOk: [
    'You and {name} agree on the shape of it. Nobody writes anything down.',
    '{name} puts a hand out. That is the whole ceremony.',
  ],
  allyFail: [
    '{name} says they are not ready to lock anything in.',
    '{name} smiles at it and gives you nothing.',
  ],

  eavesOk: [
    'Two voices in the storage room. You stay in the hallway.',
    'You hear enough of it to be sure who they mean.',
    'The talking stops when the door opens. It had already told you something.',
  ],
  eavesCaught: [
    '{name} finds you standing where you should not be standing.',
    'You are three steps too slow leaving the hallway.',
  ],

  leakOk: [
    '{name} takes the information and does not ask where it came from.',
    'You hand it over. {name} looks at {target} differently after.',
  ],
  leakTraced: [
    'It gets back to {target} by the evening.',
    '{target} works out who else could have known.',
  ],

  /* Phase furniture. The house narrating, not a UI label. */
  reset: [
    'The house wakes up slowly. Somebody has already been up for hours.',
    'Nobody says much before the announcement.',
    'The week resets. The grudges do not.',
  ],
  captainWon: [
    '{name} takes the Captaincy.',
    '{name} holds the power this week.',
  ],
  captainYou: [
    'You take the Captaincy. Everybody watched you take it.',
  ],
  naming: [
    '{captain} names {a} and {b} At Risk.',
  ],
  namingYou: [
    'You name {a} and {b}. Neither of them looks at you after.',
  ],
  /* Intent, GDD §5. The house is told there is a pawn and not which one, which
     is the read the whole mechanic hangs on. */
  namingPawn: [
    'Only one of those names is the point of it. The house starts working out which.',
    'Somebody up there is a pawn. Nobody has said so out loud yet.',
  ],
  namingYouPawn: [
    'One of them is there to make the numbers look easy. You know which.',
  ],
  backdoorLanded: [
    '{name} goes up in a seat that was open before the ceremony started.',
    '{name} never played for the Veto and is now At Risk.',
  ],
  backdoorFailed: [
    'The Veto stays in a pocket. The names stand and your week goes with them.',
  ],
  vetoUsed: [
    '{holder} uses the Veto on {saved}.',
  ],
  /* Somebody saving themselves is the common case and it read as
     "Carlota W. uses the Veto on Carlota W.." which is two bugs in one line. */
  vetoSelf: [
    '{holder} takes themselves off the block.',
    '{holder} uses the Veto on themselves. Nobody is surprised.',
  ],
  vetoHeld: [
    '{holder} keeps the Veto in their pocket. The names stand.',
  ],
  rations: [
    'Rations this week: {names}. Cold food and a hard floor.',
  ],
  throwing: [
    'You go out early and make it look ordinary.',
    'You let it go. Somebody will notice eventually.',
  ],
  throwSuspicion: [
    'That is three in a row. The house is counting.',
  ],

  /* The vote. Anonymous, one at a time, and this is the one place the game
     slows down (GDD §17). */
  voteOpen: [
    'The votes are cast one at a time and read without names.',
  ],
  voteLine: [
    'A vote to evict {name}.',
  ],
  evicted: [
    '{name} is evicted from the house.',
  ],
  evictedYou: [
    'You are evicted from the house.',
  ],
  blindside: [
    '{name} did not see it. It was in their face before the door opened.',
  ],

  panelOpen: [
    'Seven people who are here because of something you did.',
  ],
  win: [
    'You win. The house was never going to say so out loud.',
  ],
  lose: [
    'Second. The Panel had its reasons and you will get to read them.',
  ],

  /*
   * ALLIANCE NAMES, GDD §7.7.
   *
   * A group with a name is a different object from a group without one. It gets
   * talked about, it gets counted, and it gets hunted. The bank is deliberately
   * plain: these are names people in a house would actually land on at two in
   * the morning, not names a writer would give them.
   *
   * Assembled two ways. The word bank produces an identity, the count bank
   * produces a size, and a name that states a size does not update when the
   * size changes, which is the best drama in the whole system: The Six is down
   * to three and still calling itself The Six.
   */
  allyWord: [
    'Brigade', 'Committee', 'Cookout', 'Leftovers', 'Detonators', 'Renegades',
    'Nightshift', 'Company', 'Firm', 'Quiet Room', 'Back Half', 'Long Table',
    'Late Shift', 'Understudies', 'Regulars', 'Clean Slate', 'Split Level',
    'Others', 'Cold Kitchen', 'Second Floor', 'Overnight', 'Standing Order',
    'Usual Suspects', 'Dry Spell', 'Slow Burn', 'Handshake',
  ],
  allyCount: [
    'The {n}', 'Core {n}', 'Level {n}', 'Final {n}', '{n} Deep', 'The Big {n}',
  ],
  allyNum: ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'],

  /*
   * NOMINATION SPEECHES, GDD §19.2. The Captain has to say something, and what
   * they say is the only public statement of intent in the format.
   */
  speechPawnYou: [
    'You tell the room this is not personal and that one of these two is a formality. Everybody hears which one.',
  ],
  speechPawn: [
    '{captain} calls it a numbers decision and looks at exactly one of them while saying it.',
  ],
  speechThreatYou: [
    'You say the word threat out loud. It is a compliment nobody has ever enjoyed receiving.',
  ],
  speechThreat: [
    '{captain} says they are going after the biggest game in the house. Two people believe it and the rest count seats.',
  ],
  speechPersonalYou: [
    'You do not dress it up. The room gets very quiet and very interested.',
  ],
  speechPersonal: [
    '{captain} makes it personal in front of everybody. Nobody looks at their hands.',
  ],
  speechFlatYou: [
    'You keep it to eleven words and sit down. Nothing to argue with, nothing to repeat.',
  ],
  speechFlat: [
    '{captain} says almost nothing and sits down. It reads as either mercy or cowardice, depending who is listening.',
  ],

  /* CAMPAIGNING FROM THE BLOCK, GDD §19.4. */
  campNumbers: [
    'You put it in seats. {name} does the arithmetic while you talk, which is the point of doing it that way.',
  ],
  campThreat: [
    'You spend the whole conversation on the other one. {name} does not disagree, which is not the same as agreeing.',
  ],
  campMercy: [
    'You ask straight out. {name} does not enjoy being asked and does not forget it either.',
  ],
  campDeal: [
    'You offer {name} the next two weeks. Both of you know what that promise is worth from where you are sitting.',
  ],

  /* THE CAPTAIN'S ROOM, GDD §19.1. */
  roomYou: [
    'They come up in ones and twos, look at your photographs, and say the right things.',
  ],
  roomInvited: [
    '{name} takes you up first. You get the version of the room nobody else gets.',
  ],
  roomLeftOut: [
    '{name} took people up before you and you found out from somebody else.',
  ],

  /* SHOWMANCES, GDD §7.8. */
  showFormed: [
    '{a} and {b} have stopped pretending. The house counts them as one number now.',
  ],
  showYou: [
    'You and {name} are a thing the house has noticed. That is worth a vote and costs you a hiding place.',
  ],
  showBroken: [
    '{a} and {b} are not doing that any more. Everybody noticed that too.',
  ],

  /* The ONLY bank where an exclamation point is permitted, and it is still
     not used, because the house does not shout. Kept so the lint has something
     to allow rather than a rule with no exception. */
  reaction: [
    'Nobody moves for a second.',
  ],
};

/**
 * Fill {slots}. Missing keys are left visible rather than silently blanked,
 * because a string with a hole in it should fail loudly in a playtest.
 */
function fill(tpl, vars) {
  const out = tpl.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  /*
   * Collapse doubled terminal punctuation.
   *
   * First names are disambiguated with an initial when two people share one,
   * so a slot can hold "Carlota W." and any template ending in a full stop then
   * produces "Carlota W..". Fixing it at assembly is the only place it can be
   * fixed once, rather than in every template that happens to end on a name.
   */
  return out.replace(/([.?])\1+/g, '$1');
}

/** Deterministic pick off the `text` stream, then filled. */
function say(rng, bank, vars) {
  const list = S[bank];
  if (!list || !list.length) return '';
  return fill(list[Math.floor(rng() * list.length)], vars);
}

/** Pick a conversation bank by how the other person currently feels. */
function talkBank(trustValue) {
  if (trustValue >= 25) return 'talkGood';
  if (trustValue >= -10) return 'talkFlat';
  return 'talkCold';
}

const api = { S, fill, say, talkBank };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_STRINGS = api;

})();
