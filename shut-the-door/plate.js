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
 * Since 2026-11-17 (the owner: "all clubs, including historic clubs ... and maybe one special
 * diamond one that is for pro users only"): all 30 of today's clubs (a club no situation has yet is
 * shown, and says so), the THROWBACKS below (another era's name or colours, unlocked by a save in a
 * situation from that era), and Diamond, open only while the account is Pro (supabase/178).
 *
 * Unlocks, signed in, are the server's (shutdoor_my_plates, from the stored saves). A guest's live
 * on this device (localStorage) and are shown with the account's once they sign in.
 */
(function () {
  'use strict';
  var LS = 'std_plates_v1';
  var NEUTRAL = { pri: '#1d2536', sec: '#ff4f1f' };
  /* the optical middle of the plate, in viewBox units: the zone frame's centre (218) and the shield's
     area centroid (221) agree to within 3, so the letters' caps centre between them */
  var PLATE_MID = 220;

  function clubs() { return window.STD_CLUBS || []; }
  function keyOfClub(c) { return c ? String(c.nick).toLowerCase().replace(/[^a-z]/g, '') : null; }

  /* THROWBACKS (the owner, 2026-11-17: "all clubs, including historic clubs"): a franchise as it was
     in another era, by name or by colours. These live here and not in 3d/clubs.js, which is the 3D
     scene's table of today's 30. Like clubs.js, the hex values are approximations for a fan project.
     A renamed club (names) is matched by the name a pack's pitcher.team carries, inside its years.
     A club that only changed colours (no names) is matched by today's club and the pack's year.
     A save there unlocks today's club too (the unlock rule never changed: his club's closer). */
  var THROWBACKS = [
    { key: 'expos', name: 'Expos', era: '1969-2004', from: 1969, to: 2004, franchise: 'nationals', names: ['montreal expos', 'expos'], pri: '#003087', sec: '#E4002B' },
    { key: 'flmarlins', name: 'Florida Marlins', era: '1993-2011', from: 1993, to: 2011, franchise: 'marlins', names: ['florida marlins'], pri: '#00A3AD', sec: '#000000' },
    { key: 'devilrays', name: 'Devil Rays', era: '1998-2007', from: 1998, to: 2007, franchise: 'rays', names: ['tampa bay devil rays', 'devil rays'], pri: '#00704A', sec: '#000000' },
    { key: 'indians', name: 'Indians', era: '1915-2021', from: 1915, to: 2021, franchise: 'guardians', names: ['cleveland indians', 'indians'], pri: '#0C2340', sec: '#E31937' },
    { key: 'calangels', name: 'California Angels', era: '1965-1996', from: 1965, to: 1996, franchise: 'angels', names: ['california angels'], pri: '#0C2340', sec: '#C8102E' },
    { key: 'anaheimangels', name: 'Anaheim Angels', era: '1997-2001', from: 1997, to: 2001, franchise: 'angels', names: ['anaheim angels'], pri: '#1B2A55', sec: '#8DA9D9' },
    { key: 'astrosbrick', name: 'Astros', era: '2000-2012', from: 2000, to: 2012, franchise: 'astros', pri: '#9A2A2A', sec: '#D7C9A0' },
    { key: 'dbackspurple', name: 'Diamondbacks', era: '1998-2006', from: 1998, to: 2006, franchise: 'diamondbacks', pri: '#5A2D82', sec: '#00A3AD' },
    { key: 'brewersgold', name: 'Brewers', era: '2000-2019', from: 2000, to: 2019, franchise: 'brewers', pri: '#0A2351', sec: '#B6922E' },
  ];
  /* the Pro plate: one key, drawn as a cut gem (svg below). Worn only while the account is Pro. */
  var DIAMOND = 'diamond';
  function throwback(key) {
    for (var i = 0; i < THROWBACKS.length; i++) if (THROWBACKS[i].key === key) return THROWBACKS[i];
    return null;
  }
  function club(key) {
    if (!key) return null;
    var list = clubs();
    for (var i = 0; i < list.length; i++) if (keyOfClub(list[i]) === key) return list[i];
    return throwback(key);
  }
  /* the key for a pack's pitcher.team ("Los Angeles Dodgers"), through clubs.js's own matcher */
  function keyOfTeam(team) {
    var f = window.STD_CLUB_NAMED;
    return f && team ? keyOfClub(f(team)) : null;
  }
  /* Every plate a save as this team's closer in this year unlocks: the club the pack names (a
     renamed club inside its years is its throwback, never today's name), then the colours of that
     era when they differ from today's. test/modes.mjs reads the packs through this and holds
     PACK_CLUBS, PACK_THROWBACKS and the server's list to it. */
  function keysFor(team, year) {
    var n = String(team || '').trim().toLowerCase(), y = +year || 0, i, t;
    if (!n) return [];
    for (i = 0; i < THROWBACKS.length; i++) {
      t = THROWBACKS[i];
      if (t.names && t.names.indexOf(n) >= 0) return y >= t.from && y <= t.to ? [t.key] : [t.franchise];
    }
    var k = keyOfTeam(team);
    if (!k) return [];
    var out = [k];
    for (i = 0; i < THROWBACKS.length; i++) {
      t = THROWBACKS[i];
      if (!t.names && t.franchise === k && y >= t.from && y <= t.to) out.push(t.key);
    }
    return out;
  }
  function nameOf(key) {
    if (key === DIAMOND) return 'Diamond';
    var t = throwback(key);
    if (t) return t.name + ' ' + t.era;
    var c = club(key);
    return c ? c.nick : '';
  }

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
  var gem = 0;   // each drawn diamond's own gradient ids, so many on one page never share one
  function svg(key, letters, opts) {
    opts = opts || {};
    var L = String(letters || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
    var cls = 'plate' + (opts.cls ? ' ' + opts.cls : '') + (opts.locked ? ' locked' : '');
    /* The letters' caps are centred on PLATE_MID, on the alphabetic baseline: y is the mid plus half
       Inter's cap height (0.727 em). Never dominant-baseline: Safari and Chromium place "middle"
       differently, and it sat the letters low on a phone (the owner, 2026-11-16). x sits 3 left of
       the axis because the last letter's -6 spacing pulls the anchor's middle right by half of it. */
    var fs = L.length > 1 ? 176 : 200;
    var text = function (ink) {
      return L ? '<text x="253" y="' + Math.round(PLATE_MID + fs * 0.727 / 2) + '" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="' + fs + '" letter-spacing="-6" fill="' + ink + '">' + L + '</text>' : '';
    };
    var SHIELD = 'M70 64H442V283.52L256 456L70 283.52Z';
    if (key === DIAMOND) return diamond(cls, L, text, SHIELD);
    var c = club(key), pri = c ? c.pri : NEUTRAL.pri, sec = c ? c.sec : NEUTRAL.sec;
    /* a club whose second colour is near its first (or near black on black) rims in white */
    if (Math.abs(lum(pri) - lum(sec)) < 0.06) sec = '#ffffff';
    var ink = lum(pri) > 0.36 ? '#0b0f17' : '#ffffff';
    var zone = L ? '<rect x="156" y="118" width="200" height="200" rx="20" fill="none" stroke="' + ink + '" stroke-opacity=".22" stroke-width="18"/>' :
      '<rect x="156" y="118" width="200" height="200" rx="20" fill="none" stroke="#ffffff" stroke-width="26"/>' +
      '<path d="M285 130L348 118Q357 118 357 127V309Q357 318 348 318L285 306Z" fill="' + sec + '"/>';
    return '<svg class="' + cls + '" viewBox="40 40 432 440" aria-hidden="true" focusable="false">' +
      '<path d="' + SHIELD + '" fill="' + pri + '" stroke="' + sec + '" stroke-width="30" stroke-linejoin="round"/>' +
      zone + text(ink) + '</svg>';
  }
  /* THE DIAMOND (Pro): the same shield cut as a gem. An ice field, facets from a crown line to the
     point, a platinum rim and one fixed glint. Nothing moves, so it reads the same in every still. */
  function diamond(cls, L, text, SHIELD) {
    var id = 'pg' + (++gem), ink = '#0b1a2e';
    var f = function (pts, fill, op) { return '<path d="M' + pts + 'Z" fill="' + fill + '" fill-opacity="' + op + '"/>'; };
    var zone = L ? '<rect x="156" y="118" width="200" height="200" rx="20" fill="none" stroke="' + ink + '" stroke-opacity=".16" stroke-width="18"/>' :
      '<rect x="156" y="118" width="200" height="200" rx="20" fill="none" stroke="' + ink + '" stroke-opacity=".7" stroke-width="22"/>' +
      '<path d="M285 130L348 118Q357 118 357 127V309Q357 318 348 318L285 306Z" fill="#ff4f1f"/>';
    return '<svg class="' + cls + ' gem" viewBox="40 40 432 440" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="' + id + 'f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4fbff"/><stop offset=".45" stop-color="#bfe6ff"/><stop offset=".7" stop-color="#d9d2ff"/><stop offset="1" stop-color="#8fc9f2"/></linearGradient>' +
      '<linearGradient id="' + id + 'r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9fb4c8"/><stop offset="1" stop-color="#e8f2fb"/></linearGradient>' +
      '<clipPath id="' + id + 'c"><path d="' + SHIELD + '"/></clipPath></defs>' +
      '<path d="' + SHIELD + '" fill="url(#' + id + 'f)"/>' +
      '<g clip-path="url(#' + id + 'c)">' +
      f('70 64L256 64L160 170', '#ffffff', '.55') + f('256 64L442 64L352 170', '#ffffff', '.25') +
      f('160 170L256 64L352 170', '#ffffff', '.7') + f('70 64L160 170L70 284', '#5aa8e0', '.28') +
      f('442 64L352 170L442 284', '#9a8cf0', '.22') + f('70 284L160 170L256 456', '#ffffff', '.3') +
      f('160 170L352 170L256 456', '#7cc4f5', '.16') + f('352 170L442 284L256 456', '#4f8fd0', '.3') +
      '<path d="M70 64L160 170L256 64L352 170L442 64M70 284L160 170H352L442 284M160 170L256 456L352 170" fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width="5"/></g>' +
      '<path d="' + SHIELD + '" fill="none" stroke="url(#' + id + 'r)" stroke-width="30" stroke-linejoin="round"/>' +
      zone + text(ink) +
      '<path d="M404 52L412 84L444 92L412 100L404 132L396 100L364 92L396 84Z" fill="#ffffff"/></svg>';
  }

  /* ---- unlocks ----------------------------------------------------------------------------- */
  function local() {
    try { var o = JSON.parse(localStorage.getItem(LS) || '{}'); return { unlocked: Array.isArray(o.unlocked) ? o.unlocked : [], plate: o.plate || null }; }
    catch (e) { return { unlocked: [], plate: null }; }
  }
  function saveLocal(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  var server = null;   // {plate, unlocked} from the account, or null
  var pro = false;     // the game's one Pro gate (shutdoor_entitlements, the archive's), set by ui.js
  /* a save as a situation's closer: unlocks his club (and his era's colours) on this device, by the
     same lists the server reads. Answers the keys that are new, [] when none. */
  function earn(scenarioId) {
    var ks = [PACK_CLUBS[scenarioId], PACK_THROWBACKS[scenarioId]].filter(Boolean), out = [], o = local();
    ks.forEach(function (k) {
      var had = o.unlocked.indexOf(k) >= 0 || (server && server.unlocked.indexOf(k) >= 0);
      if (o.unlocked.indexOf(k) < 0) o.unlocked.push(k);
      if (server && server.unlocked.indexOf(k) < 0) server.unlocked.push(k);
      if (!had) out.push(k);
    });
    if (ks.length) saveLocal(o);
    return out;
  }
  /* Diamond is never earned on a device: it is open while the account is Pro (the gate here, or the
     server's own list, which adds it only for Pro), and shut the moment it is not. */
  function unlocked() {
    var o = local(), out = o.unlocked.slice();
    if (server) server.unlocked.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    out = out.filter(function (k) { return k !== DIAMOND && (!!club(k) || !clubs().length); });
    if (pro || (server && server.unlocked.indexOf(DIAMOND) >= 0)) out.push(DIAMOND);
    return out;
  }
  /* the plate worn: the account's when signed in, else this device's */
  function current() {
    var k = server ? server.plate : local().plate;
    return k && unlocked().indexOf(k) >= 0 ? k : null;
  }
  function setServer(s) { server = s ? { plate: s.plate || null, unlocked: (s.unlocked || []).slice() } : null; }
  function setPro(on) { pro = !!on; }
  function chooseLocal(k) { var o = local(); o.plate = k || null; saveLocal(o); }

  /* Each situation's closer's club: the packs' pitcher.team keyed. The same list is the server's
     shutdoor_pack_clubs (supabase/162, plus 167); test/modes.mjs holds both to the packs. */
  var PACK_CLUBS = {
    'std-1988-ws1-eckersley': 'athletics', 'std-2001-ws7-rivera': 'yankees', 'std-2005-nlcs5-lidge': 'astros',
    'std-2007-ws4-papelbon': 'redsox', 'std-2008-alcs7-price': 'rays',
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
  /* The extra plate a situation unlocks: its era's colours or its old name (keysFor's second key).
     The server's shutdoor_pack_clubs.throwback (supabase/178); test/modes.mjs holds both to the packs. */
  var PACK_THROWBACKS = {
    'std-2005-nlcs5-lidge': 'astrosbrick', 'std-2010-hoffman-stl': 'brewersgold', 'std-2019-nlwc-hader': 'brewersgold',
  };
  /* Every plate in the picker, in its group: today's 30 in clubs.js's order, then the throwbacks.
     A plate no situation unlocks yet is still shown, and says so (status). */
  function inPacks() {
    var have = {}, id;
    for (id in PACK_CLUBS) have[PACK_CLUBS[id]] = 1;
    for (id in PACK_THROWBACKS) have[PACK_THROWBACKS[id]] = 1;
    return have;
  }
  function current30() { return clubs().map(keyOfClub); }
  function throwbacks() { return THROWBACKS.map(function (t) { return t.key; }); }
  /* the clubs a save can unlock today, in the picker's order */
  function earnable() {
    var have = inPacks();
    return current30().concat(throwbacks()).filter(function (k) { return have[k]; });
  }
  /* how a plate opens: 'pro' (Diamond), 'save' (a situation unlocks it) or 'soon' (none yet) */
  function status(k) {
    if (!k) return 'open';
    if (k === DIAMOND) return 'pro';
    return inPacks()[k] ? 'save' : 'soon';
  }
  /* every plate the picker counts: the 30, the throwbacks and Diamond (plain is everyone's) */
  function all() { return current30().concat(throwbacks(), [DIAMOND]); }

  window.STD_PLATE = {
    svg: svg, initials: initials, club: club, nameOf: nameOf, keyOfTeam: keyOfTeam, keysFor: keysFor,
    earn: earn, unlocked: unlocked, current: current, setServer: setServer, setPro: setPro, chooseLocal: chooseLocal,
    earnable: earnable, status: status, all: all, current30: current30, throwbacks: throwbacks, throwback: throwback,
    local: local, PACK_CLUBS: PACK_CLUBS, PACK_THROWBACKS: PACK_THROWBACKS, THROWBACKS: THROWBACKS, DIAMOND: DIAMOND,
  };
})();
