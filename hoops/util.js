/* Run The Floor: the helpers every screen shares.
 *
 * window.RTF_UTIL. One copy of each small helper the screens used to carry
 * their own copy of (restructure step 5b). It loads before every other
 * script on the page, so a file reads it once at the top of its closure:
 *
 *   var esc = window.RTF_UTIL.esc;
 *
 *   esc(s)     a string made safe for innerHTML. null and undefined are ''.
 *   coins(n)   a coin count as the wallet shows it: 12,400.
 *
 * The Eastern day is not here. It is economy.js's dayOf and dayStart, the
 * clock every daily on this site rolls on.
 */
(function(){
'use strict';

var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ESC[c]; }); }
function coins(n){ return Math.round(n).toLocaleString('en-US'); }

var API = { esc: esc, coins: coins };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RTF_UTIL = API;
})();
