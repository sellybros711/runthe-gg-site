/* Run The Floor: what can be worn.
 *
 * window.RTF_CATALOG, and node can require it. DATA ONLY: one row an item.
 * An item names a SHAPE baller.js knows (k) and its colours (c), so a new
 * colourway of a hoodie is a row and nothing else; only a new shape needs art
 * (baller.js, the street section, WEAR_KINDS).
 *
 *   id      stable forever: it is stored in saves and on the account row
 *   ctx     'street' (off court) or 'court' (on court); shoes can be 'both'
 *   slot    which slot it fills (STREET_SLOTS, COURT_SLOTS)
 *   rarity  common, rare, epic, legendary; free items carry free: true
 *   k, c    the shape and its colours, handed to baller.js as is
 *   boost   reserved for Career-only boosts, read only while GEAR_BOOSTS is
 *           true (economy.js). It is false: nothing bought moves a rating.
 *
 * No real brands, no real arena names, no real club's logo on anything.
 *
 * PHASE 1 HOLDS THE FIRST TEN, for review before the rest are drawn
 * (ECONOMY.md). The starter pieces are free and owned by everyone.
 */
(function(){
'use strict';

var API_VERSION = 1;
var GEAR_BOOSTS = false;

var STREET_SLOTS = ['hat', 'eyes', 'top', 'outer', 'bottom', 'shoes', 'socks', 'chain', 'watch', 'bag', 'phones', 'held'];
/* a shoe cut for the floor is a 'both' item in the shoes slot, worn on court too */
var COURT_SLOTS = ['band', 'goggles', 'guard', 'sleeveL', 'sleeveR', 'wrist', 'tape', 'tights', 'knee', 'ankle', 'csocks', 'shoes', 'under'];

var ITEMS = [
  /* the starter wardrobe: free, owned by everyone, so nobody starts bare */
  { id: 'st_tee_white', ctx: 'street', slot: 'top', name: 'Plain Tee', free: true, rarity: 'common', k: 'tee', c: ['#f1f0ea', '#d8d6cc'] },
  { id: 'st_jeans', ctx: 'street', slot: 'bottom', name: 'Everyday Jeans', free: true, rarity: 'common', k: 'jeans', c: ['#3d5a86'] },
  { id: 'st_sneaker_white', ctx: 'both', slot: 'shoes', name: 'White Sneakers', free: true, rarity: 'common', k: 'sneaker', c: ['#f2f2f0', '#c9ccd3', '#e8e2d4'] },

  /* the first ten, for review */
  { id: 'tee_black', ctx: 'street', slot: 'top', name: 'Blackout Tee', rarity: 'common', k: 'tee', c: ['#22242b', '#3b3e48'], art: 1 },
  { id: 'hoodie_heather', ctx: 'street', slot: 'top', name: 'Heather Hoodie', rarity: 'common', k: 'hoodie', c: ['#8f939c', '#f1f0ea'], art: 1 },
  { id: 'varsity_navy', ctx: 'street', slot: 'outer', name: 'Varsity Jacket', rarity: 'epic', k: 'varsity', c: ['#1f3a6b', '#efe9d8', '#c9a227'], art: 1 },
  { id: 'jeans_raw', ctx: 'street', slot: 'bottom', name: 'Raw Denim', rarity: 'common', k: 'jeans', c: ['#2c4468'], art: 1 },
  { id: 'sweats_charcoal', ctx: 'street', slot: 'bottom', name: 'Fleece Sweats', rarity: 'common', k: 'sweats', c: ['#3a3f4a', '#e6e2d6'], art: 1 },
  { id: 'hitop_red', ctx: 'both', slot: 'shoes', name: 'Court Hi-Top', rarity: 'rare', k: 'hitop', c: ['#c8352e', '#f2f2f0', '#f2efe6'], art: 1 },
  { id: 'beanie_orange', ctx: 'street', slot: 'hat', name: 'Knit Beanie', rarity: 'common', k: 'beanie', c: ['#d9772b', '#b8601f'], art: 1 },
  { id: 'bucket_khaki', ctx: 'street', slot: 'hat', name: 'Bucket Hat', rarity: 'rare', k: 'bucket', c: ['#c9b48a', '#8c7a55'], art: 1 },
  { id: 'chain_rope', ctx: 'street', slot: 'chain', name: 'Rope Chain', rarity: 'epic', k: 'chain', c: ['#e3a92f'], art: 1 },
  { id: 'shades_night', ctx: 'street', slot: 'eyes', name: 'Night Shades', rarity: 'rare', k: 'shades', c: ['#15171c', '#26303f'], art: 1 },

  /* every other shape, one colourway each, so each is drawn and checked */
  { id: 'cap_navy', ctx: 'street', slot: 'hat', name: 'Snapback', rarity: 'common', k: 'cap', c: ['#1f3a6b', '#f2f2f0'] },
  { id: 'durag_black', ctx: 'street', slot: 'hat', name: 'Silk Durag', rarity: 'rare', k: 'durag', c: ['#1d1f24'] },
  { id: 'frames_tort', ctx: 'street', slot: 'eyes', name: 'Reading Frames', rarity: 'common', k: 'frames', c: ['#5a3a22'] },
  { id: 'sport_smoke', ctx: 'street', slot: 'eyes', name: 'Wraparounds', rarity: 'rare', k: 'sport', c: ['#26303f', '#15171c'] },
  { id: 'phones_cream', ctx: 'street', slot: 'phones', name: 'Studio Cans', rarity: 'epic', k: 'over', c: ['#f1f0ea', '#5b8fe6'] },
  { id: 'watch_gold', ctx: 'street', slot: 'watch', name: 'Gold Watch', rarity: 'epic', k: 'watch', c: ['#e3a92f', '#2a2e38'] },
  { id: 'backpack_slate', ctx: 'street', slot: 'bag', name: 'Day Pack', rarity: 'common', k: 'backpack', c: ['#2c4468', '#1d2a40'] },
  { id: 'crossbody_black', ctx: 'street', slot: 'bag', name: 'Crossbody', rarity: 'common', k: 'crossbody', c: ['#2a2e38'] },
  { id: 'duffel_red', ctx: 'street', slot: 'bag', name: 'Gym Duffel', rarity: 'rare', k: 'duffel', c: ['#c8352e', '#7a1e1a'] },
  { id: 'coffee_cup', ctx: 'street', slot: 'held', name: 'Morning Coffee', rarity: 'common', k: 'coffee', c: ['#f1f0ea', '#8a5a32'] },
  { id: 'phone_blue', ctx: 'street', slot: 'held', name: 'Phone', rarity: 'common', k: 'phone', c: ['#1d1f24', '#5b8fe6'] },
  { id: 'runner_blue', ctx: 'both', slot: 'shoes', name: 'Trail Runners', rarity: 'rare', k: 'runner', c: ['#5b8fe6', '#f2f2f0', '#f2efe6'] },
  { id: 'boot_wheat', ctx: 'street', slot: 'shoes', name: 'Work Boots', rarity: 'rare', k: 'boot', c: ['#b8863a', '#3a2a1c', '#2a1d14'] },
  { id: 'slide_black', ctx: 'street', slot: 'shoes', name: 'Slides', rarity: 'common', k: 'slide', c: ['#22242b', '#f2f2f0', '#22242b'] },
  { id: 'dress_oxford', ctx: 'street', slot: 'shoes', name: 'Oxfords', rarity: 'epic', k: 'dress', c: ['#2a1d14', '#2a1d14', '#1a120c'] },
  /* on court: worn over the uniform, never in place of it */
  { id: 'band_wide_red', ctx: 'court', slot: 'band', name: 'Wide Headband', rarity: 'common', k: 'wide', c: ['#c8352e'] },
  { id: 'band_tied_black', ctx: 'court', slot: 'band', name: 'Tied Headband', rarity: 'rare', k: 'tied', c: ['#16181f'] },
  { id: 'goggles_specs', ctx: 'court', slot: 'goggles', name: 'Rec Specs', rarity: 'epic', k: 'specs', c: ['#1d1f24', '#b9d8f0'] },
  { id: 'guard_blue', ctx: 'court', slot: 'guard', name: 'Mouthguard', rarity: 'common', k: 'guard', c: ['#5b8fe6'] },
  { id: 'sleeve_l_black', ctx: 'court', slot: 'sleeveL', name: 'Shooting Sleeve (left)', rarity: 'common', k: 'arm', c: ['#16181f'] },
  { id: 'sleeve_r_white', ctx: 'court', slot: 'sleeveR', name: 'Half Sleeve (right)', rarity: 'common', k: 'half', c: ['#f4f2ec'] },
  { id: 'wrist_gold', ctx: 'court', slot: 'wrist', name: 'Wristbands', rarity: 'common', k: 'band', c: ['#e3a92f'] },
  { id: 'tape_white', ctx: 'court', slot: 'tape', name: 'Finger Tape', rarity: 'common', k: 'fingers', c: ['#f4f2ec'] },
  { id: 'tights_black', ctx: 'court', slot: 'tights', name: 'Compression Tights', rarity: 'rare', k: 'full', c: ['#16181f'] },
  { id: 'tights_white_three', ctx: 'court', slot: 'tights', name: 'Three-Quarter Tights', rarity: 'rare', k: 'three', c: ['#f4f2ec'] },
  { id: 'knee_black', ctx: 'court', slot: 'knee', name: 'Knee Pads', rarity: 'common', k: 'pad', c: ['#16181f'] },
  { id: 'knee_white_one', ctx: 'court', slot: 'knee', name: 'Single Knee Pad', rarity: 'common', k: 'one', c: ['#f4f2ec'] },
  { id: 'ankle_black', ctx: 'court', slot: 'ankle', name: 'Ankle Braces', rarity: 'common', k: 'brace', c: ['#16181f'] },
  { id: 'csocks_high_black', ctx: 'court', slot: 'csocks', name: 'High Socks', rarity: 'rare', k: 'high', c: ['#16181f'] },
  { id: 'csocks_low_white', ctx: 'court', slot: 'csocks', name: 'No-Show Socks', rarity: 'common', k: 'low', c: ['#f1f0ea'] },
  { id: 'under_tee_black', ctx: 'court', slot: 'under', name: 'Undershirt', rarity: 'common', k: 'tee', c: ['#16181f'] },
  { id: 'under_long_white', ctx: 'court', slot: 'under', name: 'Long-Sleeve Undershirt', rarity: 'rare', k: 'long', c: ['#f4f2ec'] },

  { id: 'socks_crew', ctx: 'street', slot: 'socks', name: 'Heather Crews', rarity: 'common', k: 'crew', c: ['#9aa0aa'] },
];
var BY_ID = {};
ITEMS.forEach(function(it){ BY_ID[it.id] = it; });

/* The free starter loadout for the street look. */
var STARTER_STREET = { top: 'st_tee_white', bottom: 'st_jeans', shoes: 'st_sneaker_white' };

function item(id){ return BY_ID[id] || null; }
function owns(owned, id){ var it = BY_ID[id]; return !!it && (it.free || !!(owned && (Array.isArray(owned) ? owned.indexOf(id) >= 0 : owned[id]))); }
function fits(it, ctx){ return !!it && (it.ctx === ctx || it.ctx === 'both'); }

/* A loadout (slot -> item id) to what baller.js draws (slot -> { k, c }).
   An id that is unknown, not owned or in the wrong look falls back to the
   starter piece for that slot, or to nothing: never to a blank figure. */
function resolve(loadout, ctx, owned){
  ctx = ctx || 'street';
  var base = ctx === 'street' ? STARTER_STREET : {}, out = {}, slot;
  var pick = function(slot, id){ var it = BY_ID[id]; if (it && fits(it, ctx) && it.slot === slot && (owned === true || owns(owned, id))) out[slot] = { k: it.k, c: it.c.slice() }; };
  for (slot in base) pick(slot, base[slot]);
  for (slot in loadout || {}) pick(slot, loadout[slot]);
  return out;
}

var API = {
  API_VERSION: API_VERSION, GEAR_BOOSTS: GEAR_BOOSTS,
  STREET_SLOTS: STREET_SLOTS, COURT_SLOTS: COURT_SLOTS, ITEMS: ITEMS, STARTER_STREET: STARTER_STREET,
  item: item, owns: owns, fits: fits, resolve: resolve,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_CATALOG = API;
})();
