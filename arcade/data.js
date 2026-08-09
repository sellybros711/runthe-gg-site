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
  if (F && F.players && F.players.length){
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
  }

  /* ------------------------------------------------------------------
   * Star / icon overlay from stars.js (window.RTG_STARS). Marks
   * matching corpus entities with `.star=true`, and for the ICONS tier
   * bumps `.f` to 5 so any legacy fame-5 gate lights up too. This is
   * the source of truth for "recognizable" — game gates check .star
   * first, and only fall back to auto-detected credentials for names
   * not on the curated list.
   * ---------------------------------------------------------------- */
  var S = root.RTG_STARS;
  if (S){
    function normName(n){ return String(n||'').toLowerCase().replace(/[\.']/g,'').replace(/\s+/g,' ').trim(); }
    var byKey = {};
    ENT.forEach(function(e){ if(e && e.name && e.sport){ byKey[e.sport+'|'+normName(e.name)] = e; } });
    function apply(sport, names, iconTier){
      var hit = 0;
      (names||[]).forEach(function(n){
        var e = byKey[sport+'|'+normName(n)];
        if (!e) return;
        e.star = true;
        if (iconTier){ if ((e.f||0) < 5) e.f = 5; }
        else         { if ((e.f||0) < 4) e.f = 4; }
        hit++;
      });
      return hit;
    }
    var iconHit = 0, starHit = 0;
    ['NBA','NFL','MLB'].forEach(function(sp){
      var pack = S[sp]; if (!pack) return;
      iconHit += apply(sp, pack.icons, true);
      starHit += apply(sp, pack.stars, false);
    });
    S.matched = { icons: iconHit, stars: starHit };
  }
})(typeof self !== 'undefined' ? self : this);
