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
