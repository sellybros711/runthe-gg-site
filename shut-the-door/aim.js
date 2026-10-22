/* Shut The Door: aim on the field (the owner's call, 2026-10-22).
 *
 * window.STD_AIM. The player aims on the strike zone the 3D stage draws, not on a separate grid:
 * a crosshair dragged or tapped over the zone, snapping to the same 25 cells the engine plays, so
 * the call is still { type, cell, q }. The batter's heat colours, the outing's pitch dots and the
 * break preview's thin line are drawn in the same box, so scouting and aiming are one place.
 *
 * GEOMETRY. The box is the stage's own projection of the zone (stage.js gridRect, placed with
 * place()), five columns and five rows of a third. Data is catcher's view; the screen is the
 * pitcher's: a cell's column on screen is STD_CONTRACT.screenCol(cell), and a point on screen is
 * turned back into a cell through screenCol() too, never by flipping x here.
 *
 * INPUT. One pointer: a tap picks the cell under it, a drag moves the crosshair cell by cell and
 * picks where it is let go (a drag that leaves the box keeps to the nearest edge cell). The box
 * takes touch-action none, so a drag never scrolls the page. A mouse with no button down only
 * hovers (opts.onHover), for the break preview. The cells stay real buttons, each named in inside
 * and away words, so a keyboard or a screen reader picks one too, and the arrow keys move the aim.
 *
 * The surface is the old Grid's (place, setHand, setDisabled, setSelected, setMarks, setPitches,
 * setHeat, cells, el), so ui.js drives it the same way. The coach's mini grid stays mound.js Grid.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT, M = window.STD_MOUND;
var N = 5;

/* the cell in this row whose column on screen is sc: through screenCol(), the one mirror */
function cellAtScreen(row, sc) {
  for (var c = 0; c < N; c++) { var cell = C.cellOf(row, c); if (C.screenCol(cell) === sc) return cell; }
  return C.cellOf(row, 2);
}

/* opts: { onPick(cell), onHover(cell | null), label(cell) for the tag over the crosshair } */
function create(host, opts) {
  opts = opts || {};
  var el = document.createElement('div');
  el.className = 'aim';
  el.id = 'm-aim';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Aim. Drag or tap in the zone.');
  /* the heat: one tile a cell, under everything, its outer ring faded into the field */
  var heat = document.createElement('div');
  heat.className = 'aim-heat';
  heat.setAttribute('aria-hidden', 'true');
  var tiles = [], cells = [];
  for (var cell = 0; cell < C.GRID.CELLS; cell++) {
    var t = document.createElement('i');
    t.className = C.inZone(cell) ? 'zone' : 'chase';
    t.style.left = (C.screenCol(cell) * 20) + '%';
    t.style.top = (C.rowOf(cell) * 20) + '%';
    heat.appendChild(t);
    tiles.push(t);
  }
  el.appendChild(heat);
  /* the zone as a broadcast draws it: the outline and its thirds */
  var zone = document.createElement('span');
  zone.className = 'aim-zone';
  zone.setAttribute('aria-hidden', 'true');
  zone.innerHTML = '<i class="v1"></i><i class="v2"></i><i class="h1"></i><i class="h2"></i>';
  el.appendChild(zone);
  /* the hit targets: invisible buttons, one a cell */
  for (cell = 0; cell < C.GRID.CELLS; cell++) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell' + (C.inZone(cell) ? ' zone' : ' chase');
    b.dataset.cell = cell;
    b.style.left = (C.screenCol(cell) * 20) + '%';
    b.style.top = (C.rowOf(cell) * 20) + '%';
    b.tabIndex = -1;
    b.addEventListener('click', (function (c) {
      /* a pointer picks on its own (below); this is the keyboard's Enter or Space */
      return function (e) { if (e.detail === 0 && !api.disabled && opts.onPick) opts.onPick(c); };
    })(cell));
    el.appendChild(b);
    cells.push(b);
  }
  cells[12].tabIndex = 0;
  /* the crosshair and its tag. Neither takes a tap. */
  var cross = document.createElement('div');
  cross.className = 'aim-x';
  cross.setAttribute('aria-hidden', 'true');
  cross.innerHTML = '<svg viewBox="-50 -50 100 100"><circle class="ax-halo" r="30"/><circle class="ax-ring" r="30"/>' +
    '<path class="ax-halo" d="M0-46V-36M0 36V46M-46 0H-36M36 0H46"/><path class="ax-tick" d="M0-46V-36M0 36V46M-46 0H-36M36 0H46"/>' +
    '<circle class="ax-dot" r="4.5"/></svg><span class="aim-tag"></span>';
  el.appendChild(cross);
  var tag = cross.querySelector('.aim-tag');
  host.appendChild(el);

  var api = {
    el: el, cells: cells, tiles: tiles, bats: 'R', disabled: false, sel: null, shown: null, drag: null,
    place: function (r) {
      var s = el.style;
      s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
      el.style.setProperty('--cw', (r.w / N).toFixed(1) + 'px');
    },
    setHand: function (bats) {
      api.bats = bats;
      for (var i = 0; i < cells.length; i++) cells[i].setAttribute('aria-label', M.cellWords(i, bats));
      paint();
    },
    setDisabled: function (d) { api.disabled = !!d; el.classList.toggle('off', !!d); if (d) endDrag(); },
    setSelected: function (c) {
      api.sel = c == null ? null : c;
      for (var i = 0; i < cells.length; i++) {
        cells[i].classList.toggle('sel', i === api.sel);
        cells[i].setAttribute('aria-pressed', i === api.sel ? 'true' : 'false');
      }
      if (api.sel != null) roving(api.sel);
      paint();
    },
    /* marks: { target } after a pitch, the cell that was called */
    setMarks: function (m) {
      m = m || {};
      for (var i = 0; i < cells.length; i++) cells[i].classList.toggle('m-target', m.target === i);
    },
    setPitches: setPitches,
    setHeat: setHeat,
  };

  /* the crosshair sits on the shown cell: the one being dragged over, else the picked one */
  function paint() {
    var c = api.drag ? api.drag.cell : api.sel;
    api.shown = c;
    el.classList.toggle('aiming', c != null);
    el.classList.toggle('dragging', !!api.drag);
    if (c == null) return;
    cross.style.left = ((C.screenCol(c) + 0.5) * 20) + '%';
    cross.style.top = ((C.rowOf(c) + 0.5) * 20) + '%';
    cross.classList.toggle('low', C.rowOf(c) === 0);
    /* the tag keeps to the field: from the crosshair's edge on the outer columns */
    cross.classList.toggle('sl', C.screenCol(c) === 0);
    cross.classList.toggle('sr', C.screenCol(c) === N - 1);
    tag.textContent = opts.label ? opts.label(c) : M.cellWords(c, api.bats);
  }
  function roving(c) {
    for (var i = 0; i < cells.length; i++) cells[i].tabIndex = i === c ? 0 : -1;
  }

  /* a point on screen to a cell: the nearest, so a drag past the edge keeps to the edge */
  function cellFrom(e) {
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var sc = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - r.left) / r.width * N)));
    var row = Math.max(0, Math.min(N - 1, Math.floor((e.clientY - r.top) / r.height * N)));
    return cellAtScreen(row, sc);
  }
  function endDrag() {
    if (!api.drag) return;
    try { el.releasePointerCapture(api.drag.id); } catch (e) {}
    api.drag = null;
    paint();
  }
  el.addEventListener('pointerdown', function (e) {
    if (api.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    var c = cellFrom(e);
    if (c == null) return;
    api.drag = { id: e.pointerId, cell: c };
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
    paint();
    if (opts.onHover) opts.onHover(c);
  });
  el.addEventListener('pointermove', function (e) {
    if (api.disabled) return;
    var c = cellFrom(e);
    if (api.drag && e.pointerId === api.drag.id) {
      if (c != null && c !== api.drag.cell) { api.drag.cell = c; paint(); if (opts.onHover) opts.onHover(c); }
      return;
    }
    /* a mouse over the zone with no button down: the preview follows it */
    if (e.pointerType === 'mouse' && !e.buttons && c !== api.hover) { api.hover = c; if (opts.onHover) opts.onHover(c); }
  });
  el.addEventListener('pointerup', function (e) {
    if (!api.drag || e.pointerId !== api.drag.id) return;
    var c = api.drag.cell;
    endDrag();
    if (opts.onHover) opts.onHover(null);
    if (!api.disabled && opts.onPick) opts.onPick(c);
  });
  el.addEventListener('pointercancel', function () { endDrag(); if (opts.onHover) opts.onHover(null); });
  el.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && !api.drag && api.hover != null) { api.hover = null; if (opts.onHover) opts.onHover(null); }
  });
  /* the arrow keys move the aim a cell, as the player sees it: left on screen is screen left */
  el.addEventListener('keydown', function (e) {
    if (api.disabled) return;
    var d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    var c = api.sel == null ? 12 : api.sel;
    var row = Math.max(0, Math.min(N - 1, C.rowOf(c) + d[0])), sc = Math.max(0, Math.min(N - 1, C.screenCol(c) + d[1]));
    var next = cellAtScreen(row, sc);
    if (opts.onPick) opts.onPick(next);
    try { cells[next].focus({ preventScroll: true }); } catch (x) {}
  });

  /* The outing's pitches as dots where each crossed (catcher's view x, mirrored on screen like the
     cells: 5 - the data column). This batter's bright, the earlier ones faint. The colour is the
     result's kind, never a grade. */
  var DOT_KIND = { ball: 'ball', hit_by_pitch: 'ball', called_strike: 'called', swinging_strike: 'swing', foul: 'foul' };
  var dots = document.createElement('div');
  dots.className = 'dots';
  dots.setAttribute('aria-hidden', 'true');
  el.insertBefore(dots, cross);
  function setPitches(log, from) {
    var html = '';
    (log || []).forEach(function (p, i) {
      if (!p.actual) return;
      var cx = Math.max(0, Math.min(5, p.actual.x / C.GRID.COL_FT + 2.5));
      var ry = Math.max(0, Math.min(5, (1 - p.actual.zn) / C.GRID.ROW_ZN + 1));
      html += '<i class="pd ' + (DOT_KIND[p.result] || 'inplay') + (i >= from ? ' cur' : '') + '" style="left:' + ((5 - cx) * 20).toFixed(2) + '%;top:' + (ry * 20).toFixed(2) + '%"></i>';
    });
    dots.innerHTML = html;
  }

  /* The heat, from the batter's profile: mode 'damage' or 'swing'. The colour scale is mound.js's,
     so the legend and the coach's mini grid agree. The value of the aimed cell rides on the tag. */
  function setHeat(profile, mode) {
    var H = mode && M.HEAT[mode], arr = mode === 'damage' ? profile && profile.heat : mode === 'swing' ? profile && profile.swing : null;
    api.heatVals = H && arr ? { H: H, arr: arr } : null;
    el.classList.toggle('heat', !!api.heatVals);
    for (var i = 0; i < tiles.length; i++) {
      if (!H || !arr || arr[i] == null) { tiles[i].style.background = ''; continue; }
      var t = Math.max(0, Math.min(1, (arr[i] - H.lo) / (H.hi - H.lo)));
      tiles[i].style.background = M.heatColor(t, 1);
    }
    paint();
  }
  api.heatOf = function (c) {
    var h = api.heatVals;
    return h && h.arr[c] != null ? h.H.fmt(h.arr[c]) : '';
  };
  return api;
}

window.STD_AIM = { create: create, cellAtScreen: cellAtScreen };
})();
