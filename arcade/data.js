/* Shared data loader for the arcade.
 *
 * Folds the generated former-player dataset (former.js -> window.RTG_FORMER)
 * into window.GRID_ENTITIES, so every game that reads the corpus automatically
 * gets the larger, self-updating pool with no per-game changes. Hand-curated
 * corpus entries WIN on conflict (their data is richer and verified); a former
 * player already represented in the corpus is skipped.
 *
 * Load order in each game: entities.js -> former.js -> data.js -> game script.
 * Everything is guarded, so a missing/empty former.js leaves the game exactly
 * as it was.
 */
(function (root) {
  'use strict';
  var ENT = root.GRID_ENTITIES;
  if (!ENT || typeof ENT.push !== 'function') return;
  var F = root.RTG_FORMER;
  if (!F || !F.players || !F.players.length) return;

  var have = {};
  ENT.forEach(function (e) { if (e && e.name && e.sport) have[e.name + '|' + e.sport] = 1; });

  var added = 0;
  F.players.forEach(function (p) {
    if (!p || !p.name || !p.sport) return;
    var k = p.name + '|' + p.sport;
    if (have[k]) return;                 // corpus already covers this player
    have[k] = 1;
    ENT.push(p);
    added++;
  });
  F.merged = added;   // for debugging: how many former players were folded in
})(typeof self !== 'undefined' ? self : this);
