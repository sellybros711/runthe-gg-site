/* 4th and What: the formations, and the defense each one draws.
 *
 * Five offensive sets. Each puts the same eleven players somewhere: five
 * linemen (locked, they block by play type), the QB and five eligible
 * receivers (RB, WR1, WR2, SLOT, TE), which the player may drag and draw for.
 * In 12 personnel the slot plays a second tight end; in the I he is the
 * inline tight end and the TE is the fullback. Positions are yards from the
 * ball: dx across (negative is the offense's left), dy downfield.
 *
 * The defense lines up against the set it sees, never against the play: a
 * corner on each outside receiver, a nickel or a safety on the slot, the
 * rest in the box or deep. Short yardage brings a safety down. The box count
 * the clipboard shows is read off this alignment, so the player reads the
 * same box the sim plays.
 *
 * Plain script: window.FAW_FORMATIONS, module.exports in node.
 */
(function (root) {
  'use strict';

  /* The linemen are two yards apart: wider than real splits, so the drawn
     players never overlap, and the same in every set. */
  var OL = [['LT', -4, -0.9], ['LG', -2, -0.8], ['C', 0, -0.7], ['RG', 2, -0.8], ['RT', 4, -0.9]];
  var LINEMEN = OL.map(function (o) { return o[0]; });
  var ELIGIBLE = ['RB', 'WR1', 'WR2', 'SLOT', 'TE'];
  var EDITABLE = ['QB'].concat(ELIGIBLE);

  var SETS = [
    { id: 'gun3x1', name: 'Shotgun 3x1', under: false,
      at: { QB: [0, -5], RB: [1.8, -5.2], WR1: [-13.5, -0.9], SLOT: [-9.5, -1.6], TE: [-6.2, -1.4], WR2: [13.5, -0.9] } },
    { id: 'gun2x2', name: 'Shotgun 2x2', under: false,
      at: { QB: [0, -5], RB: [-1.8, -5.2], WR1: [-13.5, -0.9], SLOT: [-8.5, -1.6], TE: [8.5, -1.6], WR2: [13.5, -0.9] } },
    { id: 'uc12', name: 'Under center 12', under: true,
      at: { QB: [0, -1.4], RB: [0, -6.5], WR1: [-13.5, -0.9], SLOT: [-6.1, -1.0], TE: [6.1, -1.0], WR2: [13.5, -0.9] } },
    { id: 'empty', name: 'Empty', under: false,
      at: { QB: [0, -5], RB: [-5.5, -1.6], WR1: [-13.5, -0.9], SLOT: [-9.5, -1.6], TE: [8.5, -1.6], WR2: [13.5, -0.9] } },
    { id: 'iform', name: 'I formation', under: true,
      at: { QB: [0, -1.4], TE: [0, -4.2], RB: [0, -6.8], WR1: [-13.5, -0.9], SLOT: [6.1, -1.0], WR2: [13.5, -0.9] } }
  ];
  var BY_ID = {}; SETS.forEach(function (s) { BY_ID[s.id] = s; });

  /* The eleven, placed: { id: [dx, dy] }. moved overrides where the player dragged one. */
  function place(setId, moved) {
    var s = BY_ID[setId] || SETS[0], out = {};
    OL.forEach(function (o) { out[o[0]] = [o[1], o[2]]; });
    EDITABLE.forEach(function (id) { out[id] = (moved && moved[id]) ? moved[id].slice() : s.at[id].slice(); });
    return out;
  }
  function isBackfield(p) { return Math.abs(p[0]) < 4.5 && p[1] < -2.5; }

  /* ---------- the defense ---------- */

  /* roles: dl, lb, cb, s (a nickel is a cb lined up inside). Returns eleven
     { id, role, at: [dx, dy] }. */
  function defense(setId, moved, distance) {
    var O = place(setId, moved);
    var wide = ELIGIBLE.map(function (id) { return { id: id, at: O[id] }; })
      .filter(function (r) { return Math.abs(r.at[0]) > 7 && !isBackfield(r.at); });
    var left = wide.filter(function (r) { return r.at[0] < 0; }).sort(function (a, b) { return a.at[0] - b.at[0]; });
    var right = wide.filter(function (r) { return r.at[0] > 0; }).sort(function (a, b) { return b.at[0] - a.at[0]; });
    var D = [];
    var add = function (id, role, x, y) { D.push({ id: id, role: role, at: [x, y] }); };
    add('DE1', 'dl', -5, 1.1); add('DT1', 'dl', -1.6, 1.0); add('DT2', 'dl', 1.6, 1.0); add('DE2', 'dl', 5, 1.1);
    var shortYd = distance <= 2;
    /* corners on the outside man each side, then an inside man on the next */
    var nCB = 0, nNB = 0;
    [left, right].forEach(function (side, k) {
      if (side[0]) { nCB++; add('CB' + nCB, 'cb', side[0].at[0] + (k ? -0.6 : 0.6), shortYd ? 2.2 : 5.5); }
      if (side[1]) { nNB++; add('NB' + nNB, 'cb', side[1].at[0] + (k ? -0.5 : 0.5), shortYd ? 2.5 : 4.5); }
    });
    var left11 = 11 - D.length;
    /* two deep, one if it is short yardage or the defense is out of bodies */
    var deep = shortYd ? 1 : left11 >= 4 ? 2 : 1;
    if (deep === 2) { add('FS', 's', -7.5, 12.5); add('SS', 's', 7.5, 12.5); }
    else add('FS', 's', 0, shortYd ? 10.5 : 13);
    left11 = 11 - D.length;
    var lbX = left11 === 1 ? [0] : left11 === 2 ? [-2.5, 2.5] : left11 === 3 ? [-3.8, 0, 3.8] : [-5.5, -1.8, 1.8, 5.5];
    var lbY = shortYd ? 3.2 : 4.6;
    for (var i = 0; i < left11; i++) add('LB' + (i + 1), 'lb', lbX[i] !== undefined ? lbX[i] : (i - 2) * 2, lbY);
    /* a corner with no wide man on his side is a third backer in the box */
    if (nCB === 0) add('CB1', 'cb', -9, 6);
    return D.slice(0, 11);
  }

  /* The box: defenders inside the tackles plus a step, within seven yards. */
  function boxCount(D) {
    return D.filter(function (d) { return Math.abs(d.at[0]) <= 5.6 && d.at[1] <= 7.5; }).length;
  }

  var API = { SETS: SETS, BY_ID: BY_ID, OL: OL, LINEMEN: LINEMEN, ELIGIBLE: ELIGIBLE, EDITABLE: EDITABLE,
    place: place, defense: defense, boxCount: boxCount, isBackfield: isBackfield };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_FORMATIONS = API;
})(typeof window !== 'undefined' ? window : this);
