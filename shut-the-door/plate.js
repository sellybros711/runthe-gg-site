/*
 * plate.js: the player's plate, window.STD_PLATE. The owner's call (2026-11-03): the avatar is the
 * game's home plate crest (brand/mark.svg, the plate and the zone) in a club's two colours, with the
 * player's initials in it. Everyone starts with the neutral plate. Shutting the door as a club's
 * closer unlocks that club's colours.
 *
 * The same bargain the football and college games make (supabase/53, 66): the server stores a key
 * ('dodgers'), never a colour, and the client owns what a key looks like. A key this file does not
 * know draws the neutral plate. No stored value ever reaches a style attribute: the colours come
 * from 3d/clubs.js (window.STD_CLUBS, set by index.html) and the letters are cut to A-Z and 0-9.
 *
 * Unlocks, signed in, are the server's (shutdoor_my_plates, from the stored saves). A guest's live
 * on this device (localStorage) and are shown with the account's once they sign in.
 */
(function () {
  'use strict';
  var LS = 'std_plates_v1';
  var NEUTRAL = { pri: '#1d2536', sec: '#ff4f1f' };

  function clubs() { return window.STD_CLUBS || []; }
  function keyOfClub(c) { return c ? String(c.nick).toLowerCase().replace(/[^a-z]/g, '') : null; }
  function club(key) {
    if (!key) return null;
    var list = clubs();
    for (var i = 0; i < list.length; i++) if (keyOfClub(list[i]) === key) return list[i];
    return null;
  }
  /* the key for a pack's pitcher.team ("Los Angeles Dodgers"), through clubs.js's own matcher */
  function keyOfTeam(team) {
    var f = window.STD_CLUB_NAMED;
    return f && team ? keyOfClub(f(team)) : null;
  }
  function nameOf(key) { var c = club(key); return c ? c.nick : ''; }

  /* the initials: the site-wide avatar_initials when it is set, else the first letters of the name's
     first two words (or its first two letters). Guests and nameless players get none. */
  function initials(name, set) {
    var s = String(set || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
    if (s) return s;
    var w = String(name || '').replace(/[^A-Za-z0-9 _.-]/g, '').split(/[\s_.-]+/).filter(Boolean);
    if (!w.length) return '';
    s = w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2);
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
  }

  /* relative luminance, for the letters: white on a dark field, ink on a light one */
  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    var n = parseInt(m[1], 16), ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  /* the brand plate: the outline plate and the zone, from brand/mark.svg's own geometry. With letters
     the zone steps back to a faint frame so the letters read at 24px. */
  function svg(key, letters, opts) {
    opts = opts || {};
    var c = club(key), pri = c ? c.pri : NEUTRAL.pri, sec = c ? c.sec : NEUTRAL.sec;
    /* a club whose second colour is near its first (or near black on black) rims in white */
    if (Math.abs(lum(pri) - lum(sec)) < 0.06) sec = '#ffffff';
    var ink = lum(pri) > 0.36 ? '#0b0f17' : '#ffffff';
    var L = String(letters || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
    var cls = 'plate' + (opts.cls ? ' ' + opts.cls : '') + (opts.locked ? ' locked' : '');
    var zone = L ? '<rect x="156" y="118" width="200" height="200" rx="20" fill="none" stroke="' + ink + '" stroke-opacity=".22" stroke-width="18"/>' :
      '<rect x="156" y="118" width="200" height="200" rx="20" fill="none" stroke="#ffffff" stroke-width="26"/>' +
      '<path d="M285 130L348 118Q357 118 357 127V309Q357 318 348 318L285 306Z" fill="' + sec + '"/>';
    var text = L ? '<text x="256" y="' + (L.length > 1 ? 266 : 270) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="' + (L.length > 1 ? 176 : 200) + '" letter-spacing="-6" fill="' + ink + '">' + L + '</text>' : '';
    return '<svg class="' + cls + '" viewBox="40 40 432 440" aria-hidden="true" focusable="false">' +
      '<path d="M70 64H442V283.52L256 456L70 283.52Z" fill="' + pri + '" stroke="' + sec + '" stroke-width="30" stroke-linejoin="round"/>' +
      zone + text + '</svg>';
  }

  /* ---- unlocks ----------------------------------------------------------------------------- */
  function local() {
    try { var o = JSON.parse(localStorage.getItem(LS) || '{}'); return { unlocked: Array.isArray(o.unlocked) ? o.unlocked : [], plate: o.plate || null }; }
    catch (e) { return { unlocked: [], plate: null }; }
  }
  function saveLocal(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  var server = null;   // {plate, unlocked} from the account, or null
  /* a save as a situation's closer: unlocks his club on this device (by the same list the server reads). Answers the key when it is new. */
  function earn(scenarioId) {
    var k = PACK_CLUBS[scenarioId] || null;
    if (!k) return null;
    var o = local(), had = o.unlocked.indexOf(k) >= 0 || (server && server.unlocked.indexOf(k) >= 0);
    if (o.unlocked.indexOf(k) < 0) { o.unlocked.push(k); saveLocal(o); }
    if (server && server.unlocked.indexOf(k) < 0) server.unlocked.push(k);
    return had ? null : k;
  }
  function unlocked() {
    var o = local(), out = o.unlocked.slice();
    if (server) server.unlocked.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out.filter(function (k) { return !!club(k) || !clubs().length; });
  }
  /* the plate worn: the account's when signed in, else this device's */
  function current() {
    var k = server ? server.plate : local().plate;
    return k && unlocked().indexOf(k) >= 0 ? k : null;
  }
  function setServer(s) { server = s ? { plate: s.plate || null, unlocked: (s.unlocked || []).slice() } : null; }
  function chooseLocal(k) { var o = local(); o.plate = k || null; saveLocal(o); }

  /* Each situation's closer's club: the packs' pitcher.team keyed. The same list is the server's
     shutdoor_pack_clubs (supabase/162); test/modes.mjs holds both to the packs. */
  var PACK_CLUBS = {
    'std-1988-ws1-eckersley': 'athletics', 'std-2001-ws7-rivera': 'yankees', 'std-2008-alcs7-price': 'rays',
    'std-2008-krod-sea': 'angels', 'std-2008-ws5-lidge': 'phillies', 'std-2009-alcs6-rivera': 'yankees',
    'std-2010-hoffman-stl': 'brewers', 'std-2010-ws5-wilson': 'giants', 'std-2011-rivera-min': 'yankees',
    'std-2011-ws6-feliz': 'rangers', 'std-2012-ws4-romo': 'giants', 'std-2013-alcs6-uehara': 'redsox',
    'std-2014-ws7-bumgarner': 'giants', 'std-2015-alcs6-davis': 'royals', 'std-2016-ws7-chapman': 'cubs',
    'std-2017-ws2-jansen': 'dodgers', 'std-2018-alcs4-kimbrel': 'redsox', 'std-2019-nlwc-hader': 'brewers',
    'std-2021-nlcs6-smith': 'braves', 'std-2022-ws6-pressly': 'astros', 'std-2023-hader-stl': 'padres',
    'std-2023-williams-sd': 'brewers', 'std-2023-ws1-sewald': 'diamondbacks', 'std-2024-ws5-buehler': 'dodgers',
    'std-2025-diaz-cin': 'mets', 'std-2025-scott-kc': 'dodgers', 'std-2025-ws6-glasnow': 'dodgers',
    'std-2025-ws7-yamamoto': 'dodgers',
  };
  /* the clubs a save can unlock, in clubs.js's order */
  function earnable() {
    var have = {};
    for (var id in PACK_CLUBS) have[PACK_CLUBS[id]] = 1;
    return clubs().map(keyOfClub).filter(function (k) { return have[k]; });
  }

  window.STD_PLATE = {
    svg: svg, initials: initials, club: club, nameOf: nameOf, keyOfTeam: keyOfTeam,
    earn: earn, unlocked: unlocked, current: current, setServer: setServer, chooseLocal: chooseLocal,
    earnable: earnable, local: local, PACK_CLUBS: PACK_CLUBS,
  };
})();
