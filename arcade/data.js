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
    // Fields where former.js's auto-scrape is authoritative when the curated
    // entity lacks them. col (college), hs (high school), hp (high-draft-pick
    // bool), ns (notable seasons), dp (draft position) unlock recognizability
    // gates and Alma Mater's college pool; without this backfill, ~450 curated
    // stars (Jordan, Curry, Brady, Judge, Ohtani…) are absent from Alma
    // because entities.js never carried college data.
    var ENRICH = ['col','hs','hp','ns','dp'];
    var byKey = {};
    ENT.forEach(function (e) {
      if (e && e.name && e.sport) byKey[e.name + '|' + e.sport] = e;
    });
    var added = 0, enriched = 0;
    F.players.forEach(function (p) {
      if (!p || !p.name || !p.sport) return;
      var k = p.name + '|' + p.sport;
      var cur = byKey[k];
      if (cur){
        // Curated entry wins on identity, but backfill the enrichment fields
        // it lacks so gates that key on col / ns / hp all light up.
        var touched = false;
        ENRICH.forEach(function(f){
          if ((cur[f] === undefined || cur[f] === null || cur[f] === '') && p[f] !== undefined && p[f] !== null && p[f] !== ''){
            cur[f] = p[f];
            touched = true;
          }
        });
        if (touched) enriched++;
        return;
      }
      byKey[k] = p;
      ENT.push(p);
      added++;
    });
    F.merged = added;
    F.enriched = enriched;
  }

  /* ------------------------------------------------------------------
   * Hand-curated supplement (supplement.js -> window.RTG_SUPPLEMENT).
   * Same shape as former.js: add if unseen, enrich if seen. This is
   * where recognizable role players and cultural figures land that the
   * auto-scrape doesn't rank (Tebow, Manziel, Tyree, El Duque, etc.).
   * ---------------------------------------------------------------- */
  var SUP = root.RTG_SUPPLEMENT;
  if (SUP && SUP.players && SUP.players.length){
    var ENRICH2 = ['col','hs','hp','ns','dp','pos','decade'];
    var byKey2 = {};
    ENT.forEach(function(e){ if (e && e.name && e.sport) byKey2[e.name + '|' + e.sport] = e; });
    var supAdded = 0, supEnriched = 0;
    SUP.players.forEach(function (p) {
      if (!p || !p.name || !p.sport) return;
      var k = p.name + '|' + p.sport;
      var cur = byKey2[k];
      if (cur){
        var touched2 = false;
        ENRICH2.forEach(function(f){
          if ((cur[f] === undefined || cur[f] === null || cur[f] === '') && p[f] !== undefined && p[f] !== null && p[f] !== ''){
            cur[f] = p[f];
            touched2 = true;
          }
        });
        // teams: union rather than backfill — supplement can add stints
        if (Array.isArray(p.t) && p.t.length){
          if (!Array.isArray(cur.t)) cur.t = [];
          p.t.forEach(function(tm){ if (cur.t.indexOf(tm) === -1){ cur.t.push(tm); touched2 = true; } });
        }
        if (touched2) supEnriched++;
        return;
      }
      byKey2[k] = p;
      ENT.push(p);
      supAdded++;
    });
    SUP.added = supAdded;
    SUP.enriched = supEnriched;
  }

  /* ------------------------------------------------------------------
   * Elite-awards overlay from awards.js (window.RTG_AWARDS). Merges
   * award tags (MVP, All-Star, Cy Young, Gold Glove, HOF, Pro Bowl, …)
   * onto matching corpus entities so any auto-detected credentials gate
   * finds real evidence. Same normalization as the star overlay.
   * ---------------------------------------------------------------- */
  function normName(n){ return String(n||'').toLowerCase().replace(/[\.']/g,'').replace(/\s+/g,' ').trim(); }
  var A = root.RTG_AWARDS;
  if (A && A.players){
    var awMap = {};
    ENT.forEach(function(e){ if(e && e.name && e.sport){ awMap[e.sport+'|'+normName(e.name)] = e; } });
    var awHit = 0;
    Object.keys(A.players).forEach(function(k){
      var e = awMap[k]; if (!e) return;
      var tags = (A.players[k] && A.players[k].aw) || [];
      if (!e.aw) e.aw = [];
      var have = {}; e.aw.forEach(function(t){ have[t]=1; });
      tags.forEach(function(t){ if(!have[t]) e.aw.push(t); });
      awHit++;
    });
    A.matched = awHit;
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
