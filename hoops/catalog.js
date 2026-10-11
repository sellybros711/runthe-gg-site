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
 * The starter pieces are free and owned by everyone. Exclusives (excl) are
 * earned in a career (earn names the feat) and are never sold or packed.
 */
(function(){
'use strict';

var API_VERSION = 1;
var GEAR_BOOSTS = false;

var STREET_SLOTS = ['hat', 'eyes', 'top', 'outer', 'bottom', 'shoes', 'socks', 'chain', 'watch', 'bag', 'phones', 'held'];
/* a shoe cut for the floor is a 'both' item in the shoes slot, worn on court too */
var COURT_SLOTS = ['band', 'goggles', 'guard', 'sleeveL', 'sleeveR', 'wrist', 'tape', 'tights', 'knee', 'ankle', 'csocks', 'shoes', 'under'];

/* line(shape, slot, ctx, rows): one row a colourway, [suffix, name, rarity,
   colours, extra]. The id is shape_suffix and is stored forever, so a suffix
   is never renamed. The colours mean what that shape's builder reads:
     tops, bottoms, hats, bags, phones, held  [main, second]
     outerwear                                 [body, sleeves or panel, trim]
     shoes                                     [upper, accent, sole]
     eyes                                      [frame, lens]
     watch                                     [face, band]
     chains, socks and every court piece       [colour] */
var ITEMS = [];
function line(k, slot, ctx, rows){
  rows.forEach(function(r){
    var it = { id: k + '_' + r[0], ctx: ctx, slot: slot, name: r[1], rarity: r[2], k: k, c: r[3] };
    for (var x in r[4] || {}) it[x] = r[4][x];
    ITEMS.push(it);
  });
}
/* the shape a slot's id prefix names when it is not the shape itself */
function lineAs(prefix, k, slot, ctx, rows){ line(k, slot, ctx, rows.map(function(r){ return [r[0], r[1], r[2], r[3], r[4]]; })); ITEMS.slice(-rows.length).forEach(function(it, i){ it.id = prefix + '_' + rows[i][0]; }); }
var S = 'street', C = 'court', BOTH = 'both';
var OPEN = { drop: 'opening' }, HAL = { drop: 'hallows' };

/* THE STARTER WARDROBE: free, owned by everyone, so nobody starts bare */
ITEMS.push(
  { id: 'st_tee_white', ctx: S, slot: 'top', name: 'Plain Tee', free: true, rarity: 'common', k: 'tee', c: ['#f1f0ea', '#d8d6cc'] },
  { id: 'st_hoodie_navy', ctx: S, slot: 'top', name: 'Everyday Hoodie', free: true, rarity: 'common', k: 'hoodie', c: ['#24324f', '#e6e2d6'] },
  { id: 'st_jeans', ctx: S, slot: 'bottom', name: 'Everyday Jeans', free: true, rarity: 'common', k: 'jeans', c: ['#3d5a86'] },
  { id: 'st_sweats_black', ctx: S, slot: 'bottom', name: 'Everyday Sweats', free: true, rarity: 'common', k: 'sweats', c: ['#22242b'] },
  { id: 'st_sneaker_white', ctx: BOTH, slot: 'shoes', name: 'White Sneakers', free: true, rarity: 'common', k: 'sneaker', c: ['#f2f2f0', '#c9ccd3', '#e8e2d4'] },
  { id: 'st_sneaker_black', ctx: BOTH, slot: 'shoes', name: 'Black Sneakers', free: true, rarity: 'common', k: 'sneaker', c: ['#22242b', '#3b3e48', '#e8e2d4'] },
  { id: 'st_band_white', ctx: C, slot: 'band', name: 'White Headband', free: true, rarity: 'common', k: 'band', c: ['#f4f2ec'] },
  { id: 'st_wrist_white', ctx: C, slot: 'wrist', name: 'White Wristbands', free: true, rarity: 'common', k: 'band', c: ['#f4f2ec'] }
);

/* EXCLUSIVES: earned in a career and never sold or packed. earn names the feat. */
ITEMS.push(
  { id: 'ex_draft_blazer', ctx: S, slot: 'outer', name: 'Draft Night Jacket', rarity: 'legendary', excl: true, earn: 'draft_first', set: 'draftnight', k: 'blazer', c: ['#1b2238', '#e3a92f', '#e3a92f'] },
  { id: 'ex_draft_trousers', ctx: S, slot: 'bottom', name: 'Draft Night Trousers', rarity: 'legendary', excl: true, earn: 'draft_first', set: 'draftnight', k: 'trousers', c: ['#1b2238'] },
  { id: 'ex_ring_cuban', ctx: S, slot: 'chain', name: 'Ring Night Chain', rarity: 'legendary', excl: true, earn: 'title', k: 'cuban', c: ['#f0c24a'] },
  { id: 'ex_hof_blazer', ctx: S, slot: 'outer', name: 'The Gold Jacket', rarity: 'legendary', excl: true, earn: 'hof', k: 'blazer', c: ['#c9a227', '#c9a227', '#7a5c12'] },
  { id: 'ex_rookie_tee', ctx: S, slot: 'top', name: 'Rookie Tee', rarity: 'rare', excl: true, earn: 'career_first', k: 'tee', c: ['#e8660f', '#16181f'] }
);

/* ---------- OFF COURT ---------- */
line('tee', 'top', S, [
  ['black', 'Blackout Tee', 'common', ['#22242b', '#3b3e48']],
  ['heather', 'Heather Tee', 'common', ['#9aa0aa', '#7d838c']],
  ['navy', 'Navy Tee', 'common', ['#24324f', '#3a4a6e']],
  ['olive', 'Olive Tee', 'common', ['#5a6038', '#474c2c']],
  ['rust', 'Rust Tee', 'common', ['#a4502c', '#83401f']],
  ['cream', 'Cream Tee', 'common', ['#eee4cc', '#d8ccb0']],
  ['ringer', 'Ringer Tee', 'rare', ['#f1f0ea', '#c8352e']],
  ['sky', 'Sky Tee', 'common', ['#8fc0e6', '#6aa0cc']],
  ['tour', 'Tour Tee', 'rare', ['#16181f', '#e8660f'], OPEN],
  ['pixel', 'Pixel Art Tee', 'epic', ['#16181f', '#5b8fe6']],
  ['pumpkin', 'Pumpkin Tee', 'rare', ['#e2762a', '#16181f'], HAL],
]);
line('longsleeve', 'top', S, [
  ['white', 'White Long Sleeve', 'common', ['#f1f0ea', '#d8d6cc']],
  ['forest', 'Forest Long Sleeve', 'common', ['#2f5a3a', '#244a2e']],
  ['wine', 'Wine Long Sleeve', 'rare', ['#6e2436', '#55192a']],
  ['neon', 'Neon Long Sleeve', 'epic', ['#c8e04a', '#16181f']],
  ['stripe', 'Two-Tone Long Sleeve', 'common', ['#24324f', '#f1f0ea']],
]);
line('tank', 'top', S, [
  ['white', 'White Tank', 'common', ['#f1f0ea', '#d8d6cc']],
  ['black', 'Black Tank', 'common', ['#22242b', '#3b3e48']],
  ['red', 'Red Tank', 'common', ['#c8352e', '#9c241f']],
  ['mesh', 'Gym Tank', 'common', ['#5b8fe6', '#f1f0ea']],
]);
line('jersey', 'top', S, [
  ['owls', 'Night Owls Jersey', 'rare', ['#2a1f4a', '#e3a92f']],
  ['harbor', 'Harbor Gulls Jersey', 'rare', ['#1f6b6b', '#f1f0ea']],
  ['canyon', 'Canyon Coyotes Jersey', 'rare', ['#b8601f', '#16181f']],
  ['pine', 'Pine Valley Jersey', 'epic', ['#24502f', '#e6e2d6'], OPEN],
  ['retro', 'Gold Era Jersey', 'legendary', ['#e3a92f', '#2a1f4a']],
]);
line('polo', 'top', S, [
  ['white', 'White Polo', 'common', ['#f1f0ea', '#24324f']],
  ['navy', 'Navy Polo', 'common', ['#24324f', '#f1f0ea']],
  ['mint', 'Mint Polo', 'common', ['#9fd3b8', '#2f5a3a']],
  ['coral', 'Coral Polo', 'rare', ['#e8806a', '#f1f0ea']],
  ['club', 'Clubhouse Polo', 'epic', ['#16181f', '#e3a92f']],
]);
line('buttonup', 'top', S, [
  ['oxford', 'Oxford Shirt', 'common', ['#c9d8ee', '#a8bcd8']],
  ['white', 'White Shirt', 'common', ['#f4f4ef', '#d8d8d0']],
  ['black', 'Black Shirt', 'rare', ['#1d1f24', '#33363e']],
  ['silk', 'Silk Shirt', 'epic', ['#7a2e5a', '#5e1f44']],
]);
line('flannel', 'top', S, [
  ['red', 'Red Flannel', 'common', ['#a8302a', '#22242b']],
  ['green', 'Green Flannel', 'common', ['#2f5a3a', '#22242b']],
  ['blue', 'Blue Flannel', 'common', ['#2c4468', '#c9d8ee']],
  ['autumn', 'Autumn Flannel', 'rare', ['#c46a2a', '#3a2a1c'], HAL],
]);
line('knit', 'top', S, [
  ['oat', 'Oatmeal Knit', 'common', ['#d8cbb0', '#bfb092']],
  ['burgundy', 'Burgundy Knit', 'rare', ['#7a2e2e', '#5e2020']],
  ['navy', 'Navy Cable Knit', 'rare', ['#24324f', '#1a2540']],
  ['moss', 'Moss Knit', 'epic', ['#6a7a3a', '#55622c']],
]);
line('turtleneck', 'top', S, [
  ['black', 'Black Turtleneck', 'rare', ['#1d1f24', '#33363e']],
  ['camel', 'Camel Turtleneck', 'rare', ['#b8905a', '#9c7848']],
  ['ivory', 'Ivory Turtleneck', 'epic', ['#efe9d8', '#d8d0bc']],
]);
line('hoodie', 'top', S, [
  ['heather', 'Heather Hoodie', 'common', ['#8f939c', '#f1f0ea']],
  ['black', 'Black Hoodie', 'common', ['#22242b', '#f1f0ea']],
  ['forest', 'Forest Hoodie', 'common', ['#2f5a3a', '#e6e2d6']],
  ['sand', 'Sand Hoodie', 'common', ['#c9b48a', '#8c7a55']],
  ['orange', 'Court Orange Hoodie', 'rare', ['#e8660f', '#16181f'], OPEN],
  ['lilac', 'Lilac Hoodie', 'rare', ['#a890c8', '#f1f0ea']],
  ['ghost', 'Ghost Hoodie', 'epic', ['#e8e6f0', '#5a3a7a'], HAL],
  ['gilded', 'Gilded Hoodie', 'legendary', ['#d9a42a', '#16181f']],
]);
line('varsity', 'outer', S, [
  ['navy', 'Varsity Jacket', 'epic', ['#1f3a6b', '#efe9d8', '#c9a227']],
  ['red', 'Red Varsity', 'rare', ['#a8302a', '#efe9d8', '#16181f']],
  ['green', 'Green Varsity', 'rare', ['#24502f', '#efe9d8', '#e3a92f']],
  ['orange', 'Opening Night Varsity', 'epic', ['#e8660f', '#16181f', '#f1f0ea'], OPEN],
  ['midnight', 'Midnight Varsity', 'legendary', ['#16181f', '#22242b', '#e3a92f']],
]);
line('bomber', 'outer', S, [
  ['olive', 'Olive Bomber', 'common', ['#5a6038', '#e2762a', '#3a3e24']],
  ['black', 'Black Bomber', 'common', ['#22242b', '#e2762a', '#16181f']],
  ['navy', 'Navy Bomber', 'rare', ['#24324f', '#c9a227', '#1a2540']],
  ['satin', 'Satin Bomber', 'epic', ['#2a1f4a', '#e3a92f', '#1d1636']],
  ['chrome', 'Chrome Bomber', 'legendary', ['#c9ccd3', '#5b8fe6', '#8f939c']],
]);
line('puffer', 'outer', S, [
  ['black', 'Black Puffer', 'common', ['#22242b', '#3b3e48']],
  ['navy', 'Navy Puffer', 'common', ['#24324f', '#3a4a6e']],
  ['red', 'Red Puffer', 'rare', ['#c8352e', '#9c241f']],
  ['cream', 'Cream Puffer', 'rare', ['#eee4cc', '#d8ccb0']],
  ['purple', 'Midnight Puffer', 'epic', ['#3a2a5e', '#e2762a'], HAL],
  ['gold', 'Gold Standard Puffer', 'legendary', ['#e3a92f', '#b8861f']],
]);
line('denim', 'outer', S, [
  ['mid', 'Denim Jacket', 'common', ['#4a6a9a']],
  ['dark', 'Dark Denim Jacket', 'rare', ['#2c4468']],
  ['bleach', 'Bleached Denim Jacket', 'epic', ['#a8bcd8']],
]);
line('blazer', 'outer', S, [
  ['charcoal', 'Charcoal Blazer', 'rare', ['#3a3f4a', '#3a3f4a', '#22242b']],
  ['navy', 'Navy Blazer', 'rare', ['#24324f', '#24324f', '#1a2540']],
  ['plaid', 'Check Blazer', 'epic', ['#7a6a52', '#5a4c3a', '#3a2a1c']],
  ['velvet', 'Velvet Blazer', 'legendary', ['#4a1f5e', '#4a1f5e', '#e3a92f']],
]);
line('trench', 'outer', S, [
  ['khaki', 'Khaki Trench', 'rare', ['#c9b48a', '#c9b48a', '#8c7a55']],
  ['black', 'Black Trench', 'epic', ['#1d1f24', '#1d1f24', '#33363e']],
  ['champagne', 'Champagne Trench', 'legendary', ['#e8d8b0', '#e8d8b0', '#c9a227']],
]);
line('track', 'outer', S, [
  ['navy', 'Navy Track Jacket', 'common', ['#1f3a6b', '#f2f2f0']],
  ['red', 'Red Track Jacket', 'common', ['#c8352e', '#f2f2f0']],
  ['green', 'Green Track Jacket', 'rare', ['#24502f', '#e3a92f']],
  ['black', 'Black Track Jacket', 'rare', ['#16181f', '#e8660f']],
  ['retro', 'Retro Track Jacket', 'epic', ['#6e2436', '#e3a92f']],
]);
line('jeans', 'bottom', S, [
  ['raw', 'Raw Denim', 'common', ['#2c4468']],
  ['black', 'Black Jeans', 'common', ['#22242b']],
  ['light', 'Light Wash Jeans', 'common', ['#7a98c0']],
  ['grey', 'Grey Jeans', 'rare', ['#6a6e78']],
  ['cream', 'Cream Jeans', 'rare', ['#e6dcc4']],
  ['selvedge', 'Indigo Selvedge', 'epic', ['#1d2a50']],
]);
line('sweats', 'bottom', S, [
  ['charcoal', 'Fleece Sweats', 'common', ['#3a3f4a', '#e6e2d6']],
  ['heather', 'Heather Sweats', 'common', ['#9aa0aa']],
  ['navy', 'Navy Sweats', 'common', ['#24324f', '#f1f0ea']],
  ['red', 'Red Track Pants', 'rare', ['#c8352e', '#f1f0ea']],
  ['orange', 'Court Orange Sweats', 'rare', ['#e8660f', '#16181f'], OPEN],
]);
line('cargos', 'bottom', S, [
  ['olive', 'Olive Cargos', 'common', ['#5a5a3a']],
  ['khaki', 'Khaki Cargos', 'common', ['#b8a67a']],
  ['black', 'Black Cargos', 'rare', ['#22242b']],
  ['camo', 'Woodland Cargos', 'epic', ['#4a5434', '#2c3420']],
]);
line('shorts', 'bottom', S, [
  ['khaki', 'Khaki Shorts', 'common', ['#b8a67a']],
  ['navy', 'Navy Shorts', 'common', ['#24324f']],
  ['mesh', 'Mesh Shorts', 'common', ['#3a3f4a']],
  ['coral', 'Coral Shorts', 'rare', ['#e8806a']],
  ['tropic', 'Tropic Shorts', 'epic', ['#2fa08a']],
]);
line('trousers', 'bottom', S, [
  ['charcoal', 'Charcoal Trousers', 'rare', ['#3a3f4a']],
  ['camel', 'Camel Trousers', 'epic', ['#b8905a']],
]);
line('boot', 'shoes', S, [
  ['wheat', 'Work Boots', 'rare', ['#b8863a', '#3a2a1c', '#2a1d14']],
  ['black', 'Black Boots', 'common', ['#22242b', '#16181f', '#16181f']],
  ['brown', 'Brown Boots', 'rare', ['#6a4428', '#3a2a1c', '#2a1d14']],
  ['snow', 'Winter Boots', 'epic', ['#e8e2d4', '#8a5a32', '#3a2a1c']],
]);
line('slide', 'shoes', S, [
  ['black', 'Slides', 'common', ['#22242b', '#f2f2f0', '#22242b']],
  ['white', 'White Slides', 'common', ['#f2f2f0', '#22242b', '#f2f2f0']],
  ['orange', 'Orange Slides', 'rare', ['#e8660f', '#16181f', '#16181f']],
  ['gold', 'Gold Slides', 'epic', ['#16181f', '#e3a92f', '#e3a92f']],
]);
line('dress', 'shoes', S, [
  ['oxford', 'Oxfords', 'epic', ['#2a1d14', '#2a1d14', '#1a120c']],
  ['tan', 'Tan Loafers', 'rare', ['#a06a3a', '#a06a3a', '#3a2a1c']],
  ['patent', 'Patent Oxfords', 'legendary', ['#0f1014', '#0f1014', '#e3a92f']],
]);
line('beanie', 'hat', S, [
  ['orange', 'Knit Beanie', 'common', ['#d9772b', '#b8601f']],
  ['black', 'Black Beanie', 'common', ['#22242b', '#16181f']],
  ['grey', 'Grey Beanie', 'common', ['#8f939c', '#6a6e78']],
  ['hallows', 'Hallows Beanie', 'epic', ['#5a3a7a', '#e2762a'], HAL],
  ['cream', 'Fisherman Beanie', 'common', ['#e6dcc4', '#c9bc9c']],
]);
line('bucket', 'hat', S, [
  ['khaki', 'Bucket Hat', 'rare', ['#c9b48a', '#8c7a55']],
  ['black', 'Black Bucket', 'common', ['#22242b', '#3b3e48']],
  ['denim', 'Denim Bucket', 'rare', ['#4a6a9a', '#2c4468']],
]);
line('cap', 'hat', S, [
  ['navy', 'Snapback', 'common', ['#1f3a6b', '#f2f2f0']],
  ['black', 'Black Snapback', 'common', ['#22242b', '#e8660f']],
  ['red', 'Red Snapback', 'common', ['#c8352e', '#16181f']],
  ['owls', 'Night Owls Cap', 'rare', ['#2a1f4a', '#e3a92f']],
  ['gold', 'Gold Snapback', 'epic', ['#16181f', '#e3a92f']],
  ['orange', 'Opening Night Cap', 'epic', ['#e8660f', '#16181f'], OPEN],
]);
line('durag', 'hat', S, [
  ['black', 'Silk Durag', 'rare', ['#1d1f24']],
  ['wine', 'Wine Durag', 'rare', ['#6e2436']],
  ['gold', 'Gold Durag', 'epic', ['#e3a92f']],
]);
line('shades', 'eyes', S, [
  ['night', 'Night Shades', 'rare', ['#15171c', '#26303f']],
  ['tort', 'Tortoise Shades', 'common', ['#5a3a22', '#2a1d14']],
  ['gold', 'Gold Aviators', 'legendary', ['#e3a92f', '#3a2a1c']],
]);
line('frames', 'eyes', S, [
  ['tort', 'Reading Frames', 'common', ['#5a3a22']],
  ['black', 'Black Frames', 'common', ['#16181d']],
  ['gold', 'Wire Frames', 'rare', ['#c9a227']],
]);
line('sport', 'eyes', S, [
  ['smoke', 'Wraparounds', 'rare', ['#26303f', '#15171c']],
  ['ice', 'Ice Wraparounds', 'epic', ['#c9ccd3', '#8fc0e6']],
]);
line('chain', 'chain', S, [
  ['rope', 'Rope Chain', 'epic', ['#e3a92f']],
  ['silver', 'Silver Chain', 'rare', ['#c9ccd3']],
]);
line('cuban', 'chain', S, [
  ['silver', 'Silver Cuban', 'epic', ['#c9ccd3']],
  ['gold', 'Gold Cuban', 'legendary', ['#e3a92f']],
]);
line('beads', 'chain', S, [
  ['wood', 'Wood Beads', 'common', ['#8a5a32']],
  ['jade', 'Jade Beads', 'rare', ['#4a8a6a']],
]);
lineAs('socks', 'crew', 'socks', S, [
  ['crew', 'Heather Crews', 'common', ['#9aa0aa']],
  ['black', 'Black Crews', 'common', ['#22242b']],
]);
lineAs('socks', 'high', 'socks', S, [
  ['stripe', 'Tube Socks', 'common', ['#f1f0ea']],
  ['red', 'Red Tube Socks', 'rare', ['#c8352e']],
]);
lineAs('socks', 'ankle', 'socks', S, [
  ['ankle', 'Ankle Socks', 'common', ['#e6e2d6']],
]);
line('watch', 'watch', S, [
  ['gold', 'Gold Watch', 'epic', ['#e3a92f', '#2a2e38']],
  ['steel', 'Steel Watch', 'rare', ['#c9ccd3', '#8f939c']],
  ['field', 'Field Watch', 'common', ['#e6dcc4', '#5a5a3a']],
  ['ice', 'Iced Out Watch', 'legendary', ['#e8f0f8', '#c9ccd3']],
]);
line('backpack', 'bag', S, [
  ['slate', 'Day Pack', 'common', ['#2c4468', '#1d2a40']],
  ['red', 'Red Backpack', 'rare', ['#c8352e', '#7a1e1a']],
  ['orange', 'Opening Night Pack', 'epic', ['#e8660f', '#16181f'], OPEN],
]);
line('crossbody', 'bag', S, [
  ['black', 'Crossbody', 'common', ['#2a2e38']],
  ['tan', 'Leather Crossbody', 'rare', ['#a06a3a', '#6a4428']],
]);
line('duffel', 'bag', S, [
  ['red', 'Gym Duffel', 'rare', ['#c8352e', '#7a1e1a']],
  ['black', 'Black Duffel', 'common', ['#22242b', '#16181f']],
]);
lineAs('phones', 'over', 'phones', S, [
  ['cream', 'Studio Cans', 'epic', ['#f1f0ea', '#5b8fe6']],
  ['black', 'Black Headphones', 'rare', ['#1d1f24', '#3b3e48']],
  ['gold', 'Gold Headphones', 'legendary', ['#e3a92f', '#16181f']],
]);
lineAs('coffee', 'coffee', 'held', S, [
  ['cup', 'Morning Coffee', 'common', ['#f1f0ea', '#8a5a32']],
]);
lineAs('phone', 'phone', 'held', S, [
  ['blue', 'Phone', 'common', ['#1d1f24', '#5b8fe6']],
  ['spooky', 'Spooky Phone', 'rare', ['#16181f', '#e2762a'], HAL],
]);

/* ---------- ON COURT ---------- */
/* floor shoes: worn on court and on the street */
line('hitop', 'shoes', BOTH, [
  ['red', 'Court Hi-Top', 'rare', ['#c8352e', '#f2f2f0', '#f2efe6']],
  ['white', 'White Hi-Tops', 'common', ['#f2f2f0', '#c9ccd3', '#e8e2d4']],
  ['black', 'Black Hi-Tops', 'common', ['#22242b', '#c8352e', '#f2efe6']],
  ['royal', 'Royal Hi-Tops', 'rare', ['#1f4fb0', '#f2f2f0', '#f2efe6']],
  ['orange', 'Opening Night Hi-Tops', 'epic', ['#e8660f', '#16181f', '#f2efe6'], OPEN],
  ['gold', 'Gold Rush Hi-Tops', 'legendary', ['#e3a92f', '#16181f', '#f2efe6']],
  ['ice', 'Ice Hi-Tops', 'legendary', ['#e8f0f8', '#8fc0e6', '#c9e0f0']],
]);
line('sneaker', 'shoes', BOTH, [
  ['grey', 'Grey Low-Tops', 'common', ['#8f939c', '#f2f2f0', '#e8e2d4']],
  ['green', 'Green Low-Tops', 'rare', ['#2f7a4a', '#f2f2f0', '#f2efe6']],
  ['purple', 'Hallows Low-Tops', 'epic', ['#5a3a7a', '#e2762a', '#16181f'], HAL],
  ['chrome', 'Chrome Low-Tops', 'legendary', ['#c9ccd3', '#16181f', '#f2efe6']],
]);
line('runner', 'shoes', BOTH, [
  ['blue', 'Trail Runners', 'rare', ['#5b8fe6', '#f2f2f0', '#f2efe6']],
  ['volt', 'Volt Runners', 'epic', ['#c8e04a', '#16181f', '#f2efe6']],
  ['aurora', 'Aurora Runners', 'legendary', ['#7a4ac8', '#4ac8b8', '#f2efe6']],
]);
lineAs('band', 'band', 'band', C, [
  ['black', 'Black Headband', 'common', ['#16181f']],
  ['red', 'Red Headband', 'common', ['#c8352e']],
  ['royal', 'Royal Headband', 'rare', ['#1f4fb0']],
]);
lineAs('band', 'wide', 'band', C, [
  ['wide_red', 'Wide Headband', 'common', ['#c8352e']],
  ['wide_black', 'Wide Black Headband', 'common', ['#16181f']],
  ['wide_orange', 'Opening Night Headband', 'rare', ['#e8660f'], OPEN],
]);
lineAs('band', 'tied', 'band', C, [
  ['tied_black', 'Tied Headband', 'rare', ['#16181f']],
  ['tied_white', 'White Tied Headband', 'rare', ['#f4f2ec']],
  ['tied_purple', 'Hallows Tied Headband', 'epic', ['#5a3a7a'], HAL],
  ['crown', 'Crown Band', 'legendary', ['#e3a92f']],
]);
lineAs('goggles', 'specs', 'goggles', C, [
  ['specs', 'Rec Specs', 'epic', ['#1d1f24', '#b9d8f0']],
  ['white', 'White Rec Specs', 'epic', ['#f4f2ec', '#b9d8f0']],
  ['gold', 'Gold Specs', 'legendary', ['#e3a92f', '#f0d890']],
]);
lineAs('guard', 'guard', 'guard', C, [
  ['blue', 'Mouthguard', 'common', ['#5b8fe6']],
  ['clear', 'Clear Mouthguard', 'common', ['#e8f0f8']],
  ['black', 'Black Mouthguard', 'common', ['#16181f']],
  ['gold', 'Gold Grill Guard', 'rare', ['#e3a92f']],
]);
lineAs('sleeve_l', 'arm', 'sleeveL', C, [
  ['black', 'Shooting Sleeve (left)', 'common', ['#16181f']],
  ['white', 'White Sleeve (left)', 'common', ['#f4f2ec']],
  ['red', 'Red Sleeve (left)', 'rare', ['#c8352e']],
  ['gold', 'Gilded Sleeve (left)', 'legendary', ['#e3a92f']],
]);
lineAs('sleeve_l', 'half', 'sleeveL', C, [
  ['half_black', 'Half Sleeve (left)', 'common', ['#16181f']],
  ['half_royal', 'Royal Half Sleeve (left)', 'rare', ['#1f4fb0']],
]);
lineAs('sleeve_r', 'arm', 'sleeveR', C, [
  ['black', 'Shooting Sleeve (right)', 'common', ['#16181f']],
  ['arm_white', 'White Sleeve (right)', 'common', ['#f4f2ec']],
  ['orange', 'Opening Night Sleeve (right)', 'rare', ['#e8660f'], OPEN],
]);
lineAs('sleeve_r', 'half', 'sleeveR', C, [
  ['white', 'Half Sleeve (right)', 'common', ['#f4f2ec']],
  ['half_black', 'Shadow Half Sleeve (right)', 'epic', ['#16181f']],
  ['half_purple', 'Hallows Half Sleeve (right)', 'epic', ['#5a3a7a'], HAL],
]);
lineAs('wrist', 'band', 'wrist', C, [
  ['gold', 'Wristbands', 'common', ['#e3a92f']],
  ['black', 'Black Wristbands', 'common', ['#16181f']],
  ['red', 'Red Wristbands', 'rare', ['#c8352e']],
  ['royal', 'Royal Wristbands', 'rare', ['#1f4fb0']],
  ['orange', 'Hallows Wristbands', 'epic', ['#e2762a'], HAL],
]);
lineAs('tape', 'fingers', 'tape', C, [
  ['white', 'Finger Tape', 'common', ['#f4f2ec']],
  ['black', 'Black Finger Tape', 'rare', ['#16181f']],
  ['gold', 'Gold Finger Tape', 'epic', ['#e3a92f']],
]);
lineAs('tights', 'full', 'tights', C, [
  ['black', 'Compression Tights', 'rare', ['#16181f']],
  ['white', 'White Tights', 'rare', ['#f4f2ec']],
  ['royal', 'Royal Tights', 'epic', ['#1f4fb0']],
]);
lineAs('tights', 'three', 'tights', C, [
  ['white_three', 'Three-Quarter Tights', 'rare', ['#f4f2ec']],
  ['black_three', 'Black Three-Quarters', 'rare', ['#16181f']],
  ['orange_three', 'Opening Night Three-Quarters', 'epic', ['#e8660f'], OPEN],
]);
lineAs('knee', 'pad', 'knee', C, [
  ['black', 'Knee Pads', 'common', ['#16181f']],
  ['white', 'White Knee Pads', 'common', ['#f4f2ec']],
  ['red', 'Red Knee Pads', 'rare', ['#c8352e']],
  ['purple', 'Hallows Knee Pads', 'epic', ['#5a3a7a'], HAL],
]);
lineAs('knee', 'one', 'knee', C, [
  ['white_one', 'Single Knee Pad', 'common', ['#f4f2ec']],
  ['black_one', 'Single Black Knee Pad', 'common', ['#16181f']],
]);
lineAs('ankle', 'brace', 'ankle', C, [
  ['black', 'Ankle Braces', 'common', ['#16181f']],
  ['white', 'White Ankle Braces', 'common', ['#f4f2ec']],
  ['royal', 'Royal Ankle Braces', 'rare', ['#1f4fb0']],
]);
lineAs('csocks', 'high', 'csocks', C, [
  ['high_black', 'High Socks', 'rare', ['#16181f']],
  ['high_white', 'White High Socks', 'common', ['#f4f2ec']],
  ['high_red', 'Red High Socks', 'rare', ['#c8352e']],
  ['high_gold', 'Gold High Socks', 'legendary', ['#e3a92f']],
]);
lineAs('csocks', 'crew', 'csocks', C, [
  ['crew_black', 'Black Crew Socks', 'common', ['#16181f']],
  ['crew_purple', 'Hallows Crew Socks', 'epic', ['#5a3a7a'], HAL],
]);
lineAs('csocks', 'low', 'csocks', C, [
  ['low_white', 'No-Show Socks', 'common', ['#f1f0ea']],
  ['low_black', 'Black No-Shows', 'rare', ['#16181f']],
]);
lineAs('under', 'tee', 'under', C, [
  ['tee_black', 'Undershirt', 'common', ['#16181f']],
  ['tee_white', 'White Undershirt', 'common', ['#f4f2ec']],
  ['tee_grey', 'Grey Undershirt', 'rare', ['#8f939c']],
]);
lineAs('under', 'long', 'under', C, [
  ['long_white', 'Long-Sleeve Undershirt', 'rare', ['#f4f2ec']],
  ['long_black', 'Black Long-Sleeve Undershirt', 'epic', ['#16181f']],
  ['long_royal', 'Royal Long-Sleeve Undershirt', 'epic', ['#1f4fb0']],
]);

/* DROPS: a set sold for a window. The seasonal pack weights its window's
   items, and owning every piece earns the set's reward (an exclusive). */
var DROPS = [
  { id: 'opening', name: 'Opening Night', from: '2026-10-20', to: '2026-11-30', reward: 'ex_opening_jacket' },
  { id: 'hallows', name: 'Hallows', from: '2026-10-24', to: '2026-11-08', reward: 'ex_hallows_hoodie' },
];
ITEMS.push(
  { id: 'ex_opening_jacket', ctx: S, slot: 'outer', name: 'Opening Night Satin', rarity: 'legendary', excl: true, earn: 'drop:opening', k: 'bomber', c: ['#e8660f', '#16181f', '#f1f0ea'] },
  { id: 'ex_hallows_hoodie', ctx: S, slot: 'top', name: 'Hallows Hoodie', rarity: 'legendary', excl: true, earn: 'drop:hallows', k: 'hoodie', c: ['#3a2a5e', '#e2762a'] }
);
var BY_ID = {};
ITEMS.forEach(function(it){ BY_ID[it.id] = it; });

/* The free starter loadout for each look. */
var STARTER_STREET = { top: 'st_tee_white', bottom: 'st_jeans', shoes: 'st_sneaker_white' };

/* sold: in the shop and in packs. Exclusives and free pieces are neither. */
function sold(it){ return !!it && !it.free && !it.excl; }
function dropLive(id, day){ var d = DROPS.filter(function(x){ return x.id === id; })[0]; return !!d && day >= d.from && day <= d.to; }

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
  STREET_SLOTS: STREET_SLOTS, COURT_SLOTS: COURT_SLOTS, ITEMS: ITEMS, STARTER_STREET: STARTER_STREET, DROPS: DROPS,
  item: item, owns: owns, fits: fits, resolve: resolve, sold: sold, dropLive: dropLive,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_CATALOG = API;
})();
