/* RunThe.GG - favorite college team color scheme (shared).
 *
 * The College Football game lets a signed-in user pick their favorite team and
 * stores its colors. Alma Mater (and any future game) reads that here to skin
 * itself in the user's team colors, falling back to a collegiate MAROON.
 *
 * Data contract - the College Football game writes ONE of:
 *   1. Account (preferred): profiles.fav_cfb_team (jsonb) =
 *        { "name": "Texas A&M", "primary": "#500000", "secondary": "#FFFFFF" }
 *      board.js reads it for the signed-in user and mirrors it into the cache
 *      below so every page (including the lightweight hub) can read it fast.
 *   2. Local fallback: localStorage 'rtg:fav_cfb' = the same JSON shape.
 *      Written directly by the CFB game for guests / offline, and by board.js
 *      as the account mirror. Alma Mater reads THIS key on every page.
 *
 * Only { name, primary, secondary } is needed; primary/secondary are hex.
 * Everything is guarded - no favorite set → resolved() returns the maroon
 * DEFAULT, so the games look intentional out of the box.
 */
(function () {
  'use strict';
  var LS = window.localStorage;
  var KEY = 'rtg:fav_cfb';
  // Default: a collegiate maroon + gold. Shown until the user picks a team.
  var DEFAULT = { name: '', primary: '#7B1113', secondary: '#E8C87E' };

  function hex(c) {
    c = String(c == null ? '' : c).trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(c)) return c.charAt(0) === '#' ? c.toUpperCase() : '#' + c.toUpperCase();
    if (/^#?[0-9a-fA-F]{3}$/.test(c)) { c = c.replace('#', ''); return ('#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2]).toUpperCase(); }
    return null;
  }
  function normalize(o) {
    if (!o || typeof o !== 'object') return null;
    var p = hex(o.primary != null ? o.primary : o.p);
    if (!p) return null;                        // primary is required
    var s = hex(o.secondary != null ? o.secondary : o.s) || p;
    return { name: String(o.name || o.n || ''), primary: p, secondary: s };
  }
  function read() {
    try { return normalize(JSON.parse(LS.getItem(KEY))); } catch (e) { return null; }
  }
  function get() { return read(); }                    // team or null
  function resolved() { return read() || DEFAULT; }    // team or maroon default
  function set(o) {                                     // cache setter (board.js)
    var n = normalize(o);
    if (!n) return null;
    try { LS.setItem(KEY, JSON.stringify(n)); } catch (e) {}
    return n;
  }

  // ---- color math for legible theming with arbitrary team colors ----
  function rgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function lum(h) { var c = rgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function mix(h, target, amt) {
    var a = rgb(h), b = rgb(target);
    var out = a.map(function (v, i) { return Math.round(v + (b[i] - v) * amt); });
    return '#' + out.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').toUpperCase();
  }
  // A version of `color` legible as TEXT on the app background for `theme`
  // ('light' | 'dark'). Dark teams get lightened on dark bg; light teams get
  // darkened on light bg. Keeps the team hue while staying readable.
  function readable(color, theme) {
    var L = lum(color);
    if (theme === 'light') return L > 0.55 ? mix(color, '#000000', 0.5) : color;
    return L < 0.4 ? mix(color, '#FFFFFF', 0.55) : color;
  }
  // Text color to sit ON a solid fill of `color` (white on dark, near-black on light).
  function onColor(color) { return lum(color) > 0.6 ? '#20180A' : '#FFFFFF'; }

  window.RTGFavTeam = {
    KEY: KEY, DEFAULT: DEFAULT,
    get: get, resolved: resolved, set: set,
    readable: readable, onColor: onColor, mix: mix, lum: lum
  };
})();
