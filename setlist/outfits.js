/* THE BAND'S OUTFITS.
 *
 * Each of the four players is known by a signature (hair, glasses, hats, gear) and wears one of six
 * outfits. The owner's calls, 2026-10-27 and 2026-10-28: recognisable by signature, faces stay two
 * dots, outfits in the band's spirit, earned through play, never sold. An outfit changes how the band
 * looks, never a score: nothing here is read by scoring.js.
 *
 * NO PLAYER IS NAMED ON SCREEN. A player is their instrument ("Guitar", "Keys"). Outfit names are
 * plain clothes words. check_data.mjs fails on a band member's name in this file.
 *
 * UNLOCKS ARE DERIVED, NEVER STORED, the same as the rooms. Every player climbs the same ladder: the
 * first outfit is free, and rung n opens outfit n+1. The rungs ask what venues.js `tally` already
 * counts from the account's segue_runs rows, so a show filed yesterday counts today. Only the choice
 * is stored (segue_outfits_v1), and a choice the rows do not back falls back to the first outfit.
 *
 * `look` is laid over world.js's own BAND look for that player, after `base` (the signature, the same
 * in every outfit). `gear` is laid over the player's instrument.
 */

export const ROLES = [
  { id: 'guitar', label: 'Guitar' },
  { id: 'keys', label: 'Keys' },
  { id: 'bass', label: 'Bass' },
  { id: 'drums', label: 'Drums' },
];

/* What every outfit starts from, so one outfit's hat or jacket never leaks into the next. */
export const RESET = { dye: 0, sleeveless: false, hat: null, vest: null, jacket: null, jacketEyes: false,
  jacketSpot: null, pattern: null, stripe: null, tint: null, beads: false };

export const SIGNATURE = {
  // Long dark curls to the shoulders, a full beard, a pendant. The guitar is natural flame maple with
  // f-holes on a rainbow woven strap.
  guitar: { base: { style: 'mop', hair: '#33221a', beard: true, pendant: true },
    gear: { axe: '#d9a35e', flame: true, fholes: true, rainbow: true } },
  // The parted shag, round glasses and a mustache, the boards on three sides and the red guitar.
  keys: { base: { parted: true }, gear: {} },
  // Long sandy hair falling in front of the shoulders, dark shades, a light mustache. A five-string
  // with a burl body.
  bass: { base: { style: 'long', mane: true, hair: '#a8804e', beard: false, mustache: true, tint: '#101016' },
    gear: { axe: '#c8a06a', burl: true } },
  // A full beard, short hair, and bare arms. The shades and the cap come with the outfit.
  drums: { base: { style: 'short', hair: '#6b4428', beard: true }, gear: {} },
};

export const OUTFITS = {
  guitar: [
    { id: 'road', name: 'Road tie-dye', look: { hat: 'cap', hatC: '#ece6d4', dye: 2, shirt: '#9cc0e8', pants: '#7a5a3a', shoes: '#f2c43a' } },
    { id: 'whitetank', name: 'White tank', look: { hat: 'cap', hatC: '#ece6d4', shirt: '#f4f1ea', sleeveless: true, pants: '#a8946a', shoes: '#4a3e36' } },
    { id: 'blacktank', name: 'Black tank', look: { shirt: '#26242a', sleeveless: true, pants: '#6b6a48', shoes: '#2a2a30' } },
    { id: 'shortsleeve', name: 'Short sleeves', look: { shirt: '#f2efe6', pants: '#8a7a5a', shoes: '#f2c43a' } },
    { id: 'cowboy', name: 'Cowboy', look: { hat: 'cowboy', hatC: '#f2ece0', shirt: '#e8dcc8', pants: '#4a5a7e', shoes: '#6a4a30' } },
    { id: 'bluetee', name: 'Blue tee', look: { shirt: '#4a7ac0', pants: '#7a5a3a', shoes: '#f2c43a' } },
  ],
  keys: [
    { id: 'suit', name: 'Painted suit', look: {} },
    { id: 'pin', name: 'Pinstripe', look: { doodle: false, pattern: 'pin', shirt: '#f4efe4', stripe: '#6f8fc8', pants: '#3d5a8a', shoes: '#1e1a1c', beads: true } },
    { id: 'chore', name: 'Chore jacket', look: { doodle: false, shirt: '#f6f4ee', jacket: '#c9d3dc', jacketEyes: true, pants: '#4a6aa0', shoes: '#2f7a4a', beads: true } },
    { id: 'plaid', name: 'Western plaid', look: { doodle: false, pattern: 'plaid', plaid: ['#3f8f9a', '#7fc0c4', '#c879a8'], pants: '#3d5a8a', shoes: '#6a4a30', beads: true } },
    { id: 'wind', name: 'Windbreaker', look: { doodle: false, pattern: 'panel', shirt: '#86e6a6', stripe: '#d43a9a', pants: '#4a4a52', shoes: '#2a2a30', tint: '#ff8fb0' } },
    { id: 'stripes', name: 'Stripes', look: { doodle: false, pattern: 'pin', shirt: '#ece2f4', stripe: '#7a4ab0', pants: '#d88a9a', shoes: '#f0ece2', beads: true } },
  ],
  bass: [
    { id: 'denim', name: 'Denim jacket', look: { jacket: '#7a9cc8', shirt: '#eeeae2', pants: '#3b4258', shoes: '#2a2a30' } },
    { id: 'captee', name: 'Cap and tee', look: { hat: 'capback', hatC: '#2e3a2e', shirt: '#4a5236', pants: '#5a5a62', shoes: '#2a2a30' } },
    { id: 'cowboy', name: 'Cowboy', look: { hat: 'cowboy', hatC: '#6a4a34', shirt: '#f2efe6', sleeveless: true, pants: '#8a7a6a', shoes: '#5a3a28' } },
    { id: 'aloha', name: 'Aloha', look: { pattern: 'flowers', shirt: '#f2efe6', stripe: '#d8402e', pants: '#3b4258', shoes: '#2a2a30' } },
    { id: 'loud', name: 'Loud shirt', look: { hat: 'capback', hatC: '#2e3a2e', pattern: 'bands', bands: ['#e8506a', '#f2c43a', '#9a4ab8', '#e8963a'], shirt: '#e8506a', pants: '#4a5a7e', shoes: '#2a2a30' } },
    { id: 'darkdenim', name: 'Dark denim', look: { jacket: '#2e3e5e', shirt: '#9a9aa4', pants: '#2e2e38', shoes: '#2a2a30' } },
  ],
  drums: [
    { id: 'vest', name: 'Cap and vest', look: { hat: 'cap', hatC: '#22222a', tint: '#101016', shirt: '#3e6a3a', vest: '#18181e', sleeveless: true, pants: '#2e2e38', shoes: '#2a2a30' } },
    { id: 'work', name: 'Work shirt', look: { hat: 'cap', hatC: '#3a4a34', shirt: '#6a6a3e', pants: '#3b4258', shoes: '#4a3e36' } },
    { id: 'tank', name: 'Grey tank', look: { hat: 'capback', hatC: '#26262c', shirt: '#7a7a82', sleeveless: true, pants: '#2e2e38', shoes: '#2a2a30' } },
    { id: 'tophat', name: 'Top hat', look: { hat: 'tophat', hatC: '#16161c', shirt: '#1c1c22', sleeveless: true, pants: '#6a6a72', shoes: '#2a2a30' } },
    { id: 'fur', name: 'Fur hat', look: { hat: 'fur', hatC: '#8a6a40', tint: '#e8d870', shirt: '#c08a64', jacket: '#24243a', jacketSpot: '#e8e4d0', pants: '#2e2e38', shoes: '#2a2a30' } },
    { id: 'jester', name: 'Jester', look: { hat: 'jester', jest: ['#c8302c', '#3a62c4'], pattern: 'harle', shirt: '#c8302c', stripe: '#3a62c4', pants: '#2a2a30', shoes: '#c8302c' } },
  ],
};

/* THE LADDER. Rung n opens outfit n+1 for every player at once. The kinds are venues.js tally's:
   shows filed, the most segues in one show, different days played, the best % of the best you could
   have built, and daily challenges played. */
export const LADDER = [
  { k: 'shows', n: 3, clue: 'Build 3 shows.' },
  { k: 'segues', n: 3, clue: 'Build a show with 3 segues.' },
  { k: 'days', n: 5, clue: 'Play on 5 different days.' },
  { k: 'pct', n: 80, clue: 'Build a show at 80% or better.' },
  { k: 'dailies', n: 5, clue: 'Play 5 daily challenges.' },
];

function have(rung, t){
  switch (rung.k){
    case 'shows': return t.shows;
    case 'segues': return t.segues;
    case 'days': return t.days.size;
    case 'pct': return Math.floor(t.pct);
    case 'dailies': return t.dailies.size;
    default: throw new Error(`outfits.js: unknown rung "${rung.k}"`);
  }
}

/* How far up the ladder a tally is: [{open, frac, clue}] per rung. `t` is venues.js tally(rows), or
   null signed out, when nothing past the first outfit is open. */
export function ladderProgress(t){
  return LADDER.map(r => {
    const h = t ? have(r, t) : 0;
    return { open: h >= r.n, frac: Math.min(1, h / r.n), clue: r.clue };
  });
}

/* Outfit index i is open when i is 0 or rung i-1 is. */
export const outfitOpen = (prog, i) => i === 0 || !!(prog[i - 1] && prog[i - 1].open);

/* The band as it will be drawn: a role to an outfit id, every one backed by the ladder. A stored
   choice the rows do not back, or one that no longer exists, is the first outfit. */
export function dressFor(choice, prog){
  const out = {};
  for (const { id } of ROLES){
    const list = OUTFITS[id], want = choice && choice[id];
    const i = list.findIndex(o => o.id === want);
    out[id] = i > 0 && outfitOpen(prog, i) ? list[i].id : list[0].id;
  }
  return out;
}

