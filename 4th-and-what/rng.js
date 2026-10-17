/* 4th and What: the seeded dice.
 *
 * Every roll in a play comes from mulberry32 off the play's seed, so the
 * same seed and the same drawn play give the same result on any device.
 * Nothing in the sim may call Math.random. hashStr turns a string (a seed
 * typed into the debug box, a date for a future daily) into a seed.
 *
 * Plain script: window.FAW_RNG, module.exports in node.
 */
(function (root) {
  'use strict';
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 0x811c9dc5;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /* A fresh seed for a snap. Only the page calls this; the sim never does. */
  function freshSeed() {
    try { var b = new Uint32Array(1); root.crypto.getRandomValues(b); return b[0] >>> 0; }
    catch (e) { return (Date.now() * 2654435761) >>> 0; }
  }
  var API = { mulberry32: mulberry32, hashStr: hashStr, freshSeed: freshSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_RNG = API;
})(typeof window !== 'undefined' ? window : this);
