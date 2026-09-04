/*
 * metrics.js - the tape, and the arithmetic for drawing it.
 *
 * The mode computes a great many numbers and keeps almost none of them. Meters move on
 * every ruling, nine blocs move with them, three pressures accumulate, the pool grows and
 * shrinks, and all of it is overwritten the instant it changes. The office shows you where
 * a number IS. Nothing has ever shown you where it has BEEN, which is the only way to see
 * that the thing you did in year two is still costing you in year four.
 *
 * So: a tape. One row per beat and per ruling, appended as the term runs, and a catalog
 * of series read off it.
 *
 * TWO HALVES, KEPT APART.
 *
 *   THE TAPE       sample() and record(). Small keys, because this rides in the save file
 *                  and localStorage is not free. Idempotent per (year, beat, rulings), so
 *                  calling record() twice on the same state appends once.
 *
 *   THE MATH       extent, path, area, ticks, nearest, indexed, change. All pure, all
 *                  testable in node with no browser: given points and a box, they return
 *                  numbers and path strings. The screen does the drawing and holds no
 *                  arithmetic of its own, because a chart that lies is a chart whose
 *                  arithmetic nobody could check.
 *
 * ---------------------------------------------------------------------------
 * ONE AXIS, EVER. THE CHART DOES NOT GET TWO.
 * ---------------------------------------------------------------------------
 * Viewership is about 1.4 (millions a game), the pool is about 1.3 (billions a year), the
 * meters are 0 to 100 and the player share is a fraction. The obvious move is to put two of
 * them on one plot with a scale down each side, and that move is a lie: the alignment of the
 * two scales is arbitrary, so the reader sees a correlation that the numbers do not contain.
 * Slide one axis and the same data tells the opposite story.
 *
 * This module makes that impossible rather than discouraged. A chart draws ONE series, at
 * its own scale, the way a stock app draws one ticker. Comparing is a separate mode with a
 * separate function: indexed() rebases every series to 100 at the left edge, which puts them
 * on one axis honestly, in percent moved, and that is the only way more than one line is ever
 * drawn here.
 */
(function (root) {
  'use strict';

  /* The nine blocs, in one fixed order, because the tape stores their satisfactions as a
     bare array to keep the save file small and the order IS the schema. Appending is safe;
     reordering silently relabels four years of somebody's term. */
  var BLOC_ORDER = ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Group of Five',
    'Networks', 'Players', 'Presidents', 'Fans'];

  /* ── the tape ────────────────────────────────────────────────────────────────
     SHORT KEYS ON PURPOSE. A term is about ninety rows and every row is written to
     localStorage on every ruling; `revenue` against `rv` across ninety rows and nine blocs
     is most of a kilobyte for nothing. The catalog below is where the names live. */
  function sample(world) {
    var m = world.meters || {};
    var p = world.pressure || {};
    var b = world.blocs || {};
    var pl = world.playoff || {};
    var lb = world.labour || {};
    var mo = world.money || {};
    return {
      y: world.year,
      b: world.beat || 0,
      /* HOW MANY RULINGS DEEP, which is what separates two rows inside one beat: the beat is
         entered, then something is ruled on. Also the join back to world.history, so a point
         on the line can name the decision that made it move. */
      n: (world.history || []).length,
      rv: r2(m.revenue), he: r2(m.health), st: r2(m.standing),
      po: r3(mo.pool), sh: r3(lb.revShare),
      pt: pl.teams, pa: pl.autobids,
      lg: r2(p.legal), cg: r2(p.congress), un: r2(p.union),
      bl: BLOC_ORDER.map(function (k) { return r2(b[k]); }),
    };
  }
  function r2(v) { return v == null ? null : Math.round(Number(v) * 100) / 100; }
  function r3(v) { return v == null ? null : Math.round(Number(v) * 1000) / 1000; }

  /* IDEMPOTENT, and that is not a nicety. The screen records on entering a beat and again
     after a ruling, and both of those can run twice: a re-render, a reload landing on the
     same state, a player pressing carry-on twice. A tape with the same beat in it four times
     draws four flat segments and reports a term as calmer than it was. */
  function record(world) {
    if (!world) return world;
    if (!world.tape) world.tape = [];
    var row = sample(world);
    var last = world.tape[world.tape.length - 1];
    if (last && last.y === row.y && last.b === row.b && last.n === row.n) {
      /* SAME POSITION, NEW NUMBERS: overwrite rather than append. A ruling lands its edit
         and its fallout in one press, and the row written when the beat opened is now
         stale rather than a second point. */
      world.tape[world.tape.length - 1] = row;
      return world;
    }
    world.tape.push(row);
    return world;
  }

  /* ── the catalog ───────────────────────────────────────────────────────────
     `from` says which store a series is read out of and therefore how dense it is:

       'tape'   every beat and every ruling. Ninety odd points across a term.
       'year'   one point a completed season, out of world.ratings.
       'week'   one point a week inside the season being played, out of the live sim.

     `good` is which direction is the good one, and null where there is no such thing: a
     bigger playoff is not better or worse, it is a choice, and coloring it green would be
     the mode taking a side in the argument it is about.

     COLORS ARE FIXED PER SERIES rather than assigned when a chart is drawn, so a reader who
     learns that viewership is the blue line does not have that repainted under them by
     changing what else is on screen. The three used together in compare mode were run
     through the palette validator against this page's card surface: lightness band, chroma
     floor, CVD separation, normal vision floor and contrast against the surface all pass.
     Changing one means running it again, not squinting at it. */
  var SERIES = [
    /* ---- what the sport drew ---- */
    { id: 'perGame', label: 'Viewership', sub: 'millions a game', group: 'The sport',
      from: 'year', color: '#0b8fcc', good: 'up', dp: 2, suffix: 'M',
      pick: function (r) { return r.perGame; },
      about: 'What an average game drew. Every television argument in this job is settled '
        + 'against this number.' },
    { id: 'total', label: 'Total audience', sub: 'millions, whole season', group: 'The sport',
      from: 'year', color: '#0b8fcc', good: 'up', dp: 0, suffix: 'M',
      pick: function (r) { return r.total; },
      about: 'Everybody who watched anything, added up. Moves with the size of the '
        + 'postseason as well as with the size of the audience.' },
    { id: 'title', label: 'The title game', sub: 'millions', group: 'The sport',
      from: 'year', color: '#0b8fcc', good: 'up', dp: 1, suffix: 'M',
      pick: function (r) { return r.title; },
      about: 'The one broadcast the whole year is sold against.' },
    { id: 'outsiders', label: 'Outsiders in the field', sub: 'teams', group: 'The sport',
      from: 'year', color: '#9333ea', good: null, dp: 0, suffix: '',
      pick: function (r) { return r.outsiders; },
      about: 'How many teams from outside the power four reached the playoff. A guaranteed '
        + 'bid nobody can reach shows up here as a flat line at zero.' },

    /* ---- the money ---- */
    { id: 'pool', label: 'The pool', sub: 'billions a year', group: 'The money',
      from: 'tape', color: '#c27a06', good: 'up', dp: 2, prefix: '$', suffix: 'B',
      pick: function (r) { return r.po; },
      about: 'What there is to distribute. Not what the football earned: see viewership '
        + 'for that, and the gap between them is the whole job.' },
    { id: 'share', label: 'The player share', sub: 'percent of the pool', group: 'The money',
      from: 'tape', color: '#c27a06', good: null, dp: 1, suffix: '%', scale: 100,
      pick: function (r) { return r.sh; },
      about: 'What reaches the players. There is no correct value and every group in the '
        + 'room has a different one.' },

    /* ---- the office ---- */
    { id: 'revenue', label: 'Revenue', sub: 'out of 100', group: 'The office',
      from: 'tape', color: '#c27a06', good: 'up', dp: 0, suffix: '',
      pick: function (r) { return r.rv; },
      about: 'What the sport makes, as the office scores it.' },
    { id: 'health', label: 'The state of the game', sub: 'out of 100', group: 'The office',
      from: 'tape', color: '#0b8fcc', good: 'up', dp: 0, suffix: '',
      pick: function (r) { return r.he; },
      about: 'Whether the thing on the field is still recognizably college football and '
        + 'still open to somebody new.' },
    { id: 'standing', label: 'Your standing', sub: 'out of 100', group: 'The office',
      from: 'tape', color: '#9333ea', good: 'up', dp: 0, suffix: '',
      pick: function (r) { return r.st; },
      about: 'Whether the room still wants you. Below about thirty they start counting '
        + 'votes.' },

    /* ---- the shape of the sport ---- */
    { id: 'playoff', label: 'Playoff size', sub: 'teams', group: 'The sport',
      from: 'tape', color: '#9333ea', good: null, dp: 0, suffix: '',
      pick: function (r) { return r.pt; },
      about: 'How many get in. Every other line on this page moves when this one does.' },
    { id: 'autobids', label: 'Guaranteed bids', sub: 'seats', group: 'The sport',
      from: 'tape', color: '#9333ea', good: null, dp: 0, suffix: '',
      pick: function (r) { return r.pa; },
      about: 'Seats a conference champion cannot be left out of.' },

    /* ---- the fuses ---- */
    { id: 'legal', label: 'Legal', sub: 'pressure', group: 'The pressure',
      from: 'tape', color: '#c27a06', good: 'down', dp: 0, suffix: '',
      pick: function (r) { return r.lg; },
      about: 'These do not tick down, they go off. Every drop in this line is something '
        + 'having already happened to you.' },
    { id: 'congress', label: 'Congress', sub: 'pressure', group: 'The pressure',
      from: 'tape', color: '#c27a06', good: 'down', dp: 0, suffix: '',
      pick: function (r) { return r.cg; }, about: 'Washington, accumulating.' },
    { id: 'union', label: 'The union', sub: 'pressure', group: 'The pressure',
      from: 'tape', color: '#c27a06', good: 'down', dp: 0, suffix: '',
      pick: function (r) { return r.un; }, about: 'Organizing, accumulating.' },
  ];

  /* The nine blocs are series too, generated rather than typed, and they carry the color
     the rest of the mode already draws them in: a reader who has learned that the Big Ten is
     the blue chip should not meet a Big Ten line in some other color. */
  var BLOC_COLOR = {
    SEC: '#ef4444', 'Big Ten': '#3b82f6', ACC: '#f97316', 'Big 12': '#a855f7',
    'Group of Five': '#14b8a6', Networks: '#ec4899', Players: '#eab308',
    Presidents: '#818cf8', Fans: '#38bdf8',
  };
  BLOC_ORDER.forEach(function (name, i) {
    SERIES.push({
      id: 'bloc:' + name, label: name, sub: 'satisfaction', group: 'The room',
      from: 'tape', color: BLOC_COLOR[name], good: 'up', dp: 0, suffix: '',
      bloc: name,
      pick: function (r) { return r.bl ? r.bl[i] : null; },
      about: 'Fifty is indifferent. Under thirty they are looking for somebody else.',
    });
  });

  var BY_ID = {};
  SERIES.forEach(function (s) { BY_ID[s.id] = s; });
  var GROUPS = [];
  SERIES.forEach(function (s) { if (GROUPS.indexOf(s.group) < 0) GROUPS.push(s.group); });

  /* THE THREE THAT MAY BE DRAWN TOGETHER. Everything else is one at a time, because more
     than one line on one axis is only honest when they are indexed, and indexing more than
     three lines on a phone is a plate of spaghetti. These three are the answer to "how am I
     doing and how is the sport doing": two of them are the sport and one of them is you. */
  var COMPARE = ['revenue', 'health', 'standing'];

  /* ── reading a series off the world ──────────────────────────────────────────
     Comes back as {x, v, at} where x is a position on the axis and `at` is enough to name
     the point in a tooltip. Null values are DROPPED rather than plotted as zero: a season
     that has not been played has no viewership, and drawing that as the floor of the chart
     invents a collapse.

     `range` is 'term' or 'season'. A season range on a yearly series is one point, which is
     not a line, and the screen is expected to say so rather than draw a dot and call it a
     chart. */
  function points(world, id, range, live) {
    var s = BY_ID[id];
    if (!s || !world) return [];
    if (s.from === 'year') return yearPoints(world, s);
    if (s.from === 'week') return weekPoints(live);
    return tapePoints(world, s, range);
  }

  function tapePoints(world, s, range) {
    var tape = world.tape || [];
    var rows = range === 'season'
      ? tape.filter(function (r) { return r.y === world.year; })
      : tape;
    var out = [];
    rows.forEach(function (r) {
      var v = s.pick(r);
      if (v == null || !isFinite(v)) return;
      out.push({ x: out.length, v: v * (s.scale || 1), at: { y: r.y, b: r.b, n: r.n } });
    });
    return out;
  }

  function yearPoints(world, s) {
    var r = world.ratings || {};
    var ys = Object.keys(r).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    ys.forEach(function (y) {
      var v = s.pick(r[y]);
      if (v == null || !isFinite(v)) return;
      out.push({ x: out.length, v: v * (s.scale || 1), at: { y: y, b: null, n: null } });
    });
    return out;
  }

  /* The season being played right now, week by week, off the live sim rather than off the
     tape: it is not the office's memory, it is what is happening. */
  function weekPoints(live) {
    if (!live || !live.weeks) return [];
    var out = [];
    live.weeks.forEach(function (w) {
      if (w.viewers == null || !isFinite(w.viewers) || !w.games || !w.games.length) return;
      out.push({ x: out.length, v: w.viewers, at: { y: live.year, week: w.week } });
    });
    return out;
  }

  /* WHERE THE RULINGS ARE, so the line can be annotated with what moved it. This is the
     thing that makes it a chart of a term rather than a chart of a number: a stock chart
     with earnings marks on it. Only meaningful on tape series, which are the ones with a
     point per ruling. */
  function rulings(world, range) {
    var h = world.history || [];
    var tape = (world.tape || []).filter(function (r) {
      return range === 'season' ? r.y === world.year : true;
    });
    var out = [];
    tape.forEach(function (r, i) {
      /* Row n is the state AFTER n rulings, so the ruling that produced it is h[n - 1], and
         only when this row is the first to carry that count. */
      if (!r.n) return;
      if (i > 0 && tape[i - 1].n === r.n) return;
      var rec = h[r.n - 1];
      if (!rec) return;
      out.push({ x: i, label: rec.label || '', id: rec.id || null, y: r.y, b: r.b });
    });
    return out;
  }

  /* ── the arithmetic ──────────────────────────────────────────────────────────
     Everything below is pure. Given points and a box it returns numbers, and that is the
     whole reason a chart in this mode can be checked without a browser. */

  /* THE VERTICAL RANGE, and it is the decision a chart lies with. Two rules:

     A SERIES ON A KNOWN SCALE KEEPS ITS SCALE at the ends. Standing running 48 to 52 across
     a term is a flat term, and auto-fitting it to the data would draw the same picture as a
     collapse from 90 to 10. So a bounded series is padded out to at least MIN_SPAN of its
     own scale before it is allowed to fill the box.

     AND ZERO IS NOT ASSUMED. A viewership series running 1.38 to 1.44 anchored at zero is a
     flat line with nothing readable on it. Stock charts do not start at zero either, and the
     honest guard against the resulting exaggeration is the span floor above, not a baseline
     nobody asked for. */
  var MIN_SPAN = { 100: 12, 1: 0.25 };
  function extent(pts, s) {
    if (!pts || !pts.length) return null;
    var lo = pts[0].v, hi = pts[0].v;
    pts.forEach(function (p) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    var span = hi - lo;
    /* What counts as a small move depends on the series' own scale. A meter out of 100 and
       a pool in billions cannot share a floor. */
    var floor = s && s.suffix === '%' ? 4
      : s && (s.prefix === '$') ? 0.2
      : s && s.dp === 0 && hi <= 100 ? MIN_SPAN[100]
      : Math.max(hi * 0.06, 0.05);
    if (span < floor) {
      var mid = (hi + lo) / 2;
      lo = mid - floor / 2; hi = mid + floor / 2;
    } else {
      var pad = span * 0.12;
      lo -= pad; hi += pad;
    }
    /* Nothing here goes below zero in life, so the box should not either. */
    if (lo < 0 && pts.every(function (p) { return p.v >= 0; })) lo = 0;
    return { lo: lo, hi: hi };
  }

  /* Axis ticks a person would have chosen: 1, 2, 2.5, 5 or 10 times a power of ten. */
  function ticks(lo, hi, want) {
    if (!(hi > lo)) return [lo];
    var n = Math.max(2, want || 4);
    var raw = (hi - lo) / n;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm > 5 ? 10 : norm > 2.5 ? 5 : norm > 2 ? 2.5 : norm > 1 ? 2 : 1) * mag;
    var out = [];
    for (var t = Math.ceil(lo / step) * step; t <= hi + step * 0.001; t += step) {
      out.push(Math.round(t * 1e6) / 1e6);
    }
    return out;
  }

  /* Points to pixels. `box` is {x, y, w, h} in the svg's own units. */
  function scaler(pts, box, ext) {
    var e = ext || { lo: 0, hi: 1 };
    var span = (e.hi - e.lo) || 1;
    var n = Math.max(1, (pts.length - 1));
    return {
      /* A SINGLE POINT SITS IN THE MIDDLE, not at the left edge, or year one of a term draws
         a dot in the corner that reads as a rendering fault. */
      X: function (i) { return pts.length < 2 ? box.x + box.w / 2 : box.x + (i / n) * box.w; },
      Y: function (v) { return box.y + box.h - ((v - e.lo) / span) * box.h; },
    };
  }

  function path(pts, box, ext) {
    if (!pts || !pts.length) return '';
    var sc = scaler(pts, box, ext);
    return pts.map(function (p, i) {
      return (i ? 'L' : 'M') + round(sc.X(i)) + ' ' + round(sc.Y(p.v));
    }).join(' ');
  }

  /* The same line, closed down to the floor of the box, for the wash under it. */
  function area(pts, box, ext) {
    if (!pts || pts.length < 2) return '';
    var sc = scaler(pts, box, ext);
    var base = box.y + box.h;
    return path(pts, box, ext)
      + ' L' + round(sc.X(pts.length - 1)) + ' ' + round(base)
      + ' L' + round(sc.X(0)) + ' ' + round(base) + ' Z';
  }

  function round(n) { return Math.round(n * 10) / 10; }

  /* WHICH POINT THE POINTER IS NEAREST, in x only. The reader aims at a moment in the term,
     never at a two pixel line, so the whole height of the plot is a hit target for the
     nearest column and there is no way to miss. */
  function nearest(pts, box, px) {
    if (!pts || !pts.length) return -1;
    if (pts.length < 2) return 0;
    var t = (px - box.x) / (box.w || 1);
    var i = Math.round(t * (pts.length - 1));
    return Math.max(0, Math.min(pts.length - 1, i));
  }

  /* ── comparing ───────────────────────────────────────────────────────────────
     REBASED TO 100 AT THE LEFT EDGE, which is the only honest way to put a series in
     billions beside one out of a hundred. The axis then reads in percent moved from where
     the term started, one scale, no arbitrary alignment, and "revenue is up 9 and your
     standing is down 22" is a sentence the picture actually supports.

     A series whose first value is zero cannot be rebased, because everything after it is an
     infinite percentage of nothing. It is dropped, and the caller is expected to say which,
     rather than have a line quietly missing. */
  function indexed(pts) {
    if (!pts || !pts.length) return null;
    var base = pts[0].v;
    if (!base) return null;
    return pts.map(function (p) {
      return { x: p.x, v: (p.v / base) * 100, raw: p.v, at: p.at };
    });
  }

  /* From, to, and how far. `pct` is null where the start is zero, for the same reason. */
  function change(pts) {
    if (!pts || !pts.length) return null;
    var a = pts[0].v, b = pts[pts.length - 1].v;
    return {
      from: a, to: b, delta: b - a,
      pct: a ? ((b - a) / Math.abs(a)) * 100 : null,
      points: pts.length,
    };
  }

  /* The high and the low of the visible window, and where they are, for the two direct
     labels a line gets. Selective, per the rule that a number on every point is chaos. */
  function peaks(pts) {
    if (!pts || pts.length < 2) return null;
    var hi = 0, lo = 0;
    pts.forEach(function (p, i) {
      if (p.v > pts[hi].v) hi = i;
      if (p.v < pts[lo].v) lo = i;
    });
    return hi === lo ? null : { hi: hi, lo: lo };
  }

  /* PUSHING LABELS APART. Direct labels at the end of two lines that finished a point from
     each other land on top of one another, and three numbers in three colors stacked into
     one smudge sit at exactly the end of the line a reader looks at first.

     Takes the wanted positions, returns positions at least `gap` apart, inside [lo, hi], in
     the SAME ORDER IT WAS GIVEN so a caller can zip them back against their colors. Returns
     null when they cannot all fit, which is a real answer: the legend already carries every
     name and its move, so no labels beats a smudge.

     Here rather than in the page because it is arithmetic, and the whole reason the chart's
     arithmetic lives in this file is so somebody can check it without a browser. */
  function spread(want, gap, lo, hi) {
    if (!want || !want.length) return [];
    if (want.length * gap > (hi - lo)) return null;
    var order = want.map(function (v, i) { return { v: v, i: i }; })
      .sort(function (a, b) { return a.v - b.v; });
    /* Down the list first, opening each pair to the gap. */
    for (var k = 1; k < order.length; k++) {
      if (order[k].v - order[k - 1].v < gap) order[k].v = order[k - 1].v + gap;
    }
    /* Then slide the whole stack back inside the box if it has run off the bottom, and open
       upward from the top if that pushed the first one off the other end. */
    var over = order[order.length - 1].v - hi;
    if (over > 0) for (var j = 0; j < order.length; j++) order[j].v -= over;
    if (order[0].v < lo) {
      var under = lo - order[0].v;
      for (var q = 0; q < order.length; q++) order[q].v += under;
      if (order[order.length - 1].v > hi) return null;
    }
    var out = [];
    order.forEach(function (o) { out[o.i] = o.v; });
    return out;
  }

  /* ── saying it ───────────────────────────────────────────────────────────────
     One number, formatted the way its series is written everywhere else in the mode. */
  function fmt(v, s) {
    if (v == null || !isFinite(v)) return '--';
    var d = s && s.dp != null ? s.dp : 1;
    return (s && s.prefix ? s.prefix : '') + Number(v).toFixed(d) + (s && s.suffix ? s.suffix : '');
  }
  /* A signed one, for a change. */
  function fmtDelta(v, s) {
    if (v == null || !isFinite(v)) return '--';
    var d = s && s.dp != null ? s.dp : 1;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + (s && s.prefix ? s.prefix : '')
      + Math.abs(Number(v)).toFixed(d) + (s && s.suffix ? s.suffix : '');
  }

  /* WHETHER A MOVE IS GOOD NEWS, which is not the same question as whether it is up. A
     pressure falling is good and a pressure rising is not, and a playoff getting bigger is
     neither: `good` is null on every series that is a choice rather than a score, and this
     returns '' for those so nothing on the screen takes a side. */
  function tone(delta, s) {
    if (!s || !s.good || !delta) return '';
    if (Math.abs(delta) < 1e-9) return '';
    var up = delta > 0;
    return (s.good === 'up') === up ? 'up' : 'dn';
  }

  /* Where a point sits in the term, in words, for a tooltip. */
  function whenOf(at, beats) {
    if (!at) return '';
    if (at.week) return 'Week ' + at.week + ', ' + at.y;
    if (at.b == null) return String(at.y);
    var names = beats || [];
    return (names[at.b] ? names[at.b] + ', ' : '') + at.y;
  }

  var api = {
    API_VERSION: 1,
    BLOC_ORDER: BLOC_ORDER, BLOC_COLOR: BLOC_COLOR,
    SERIES: SERIES, BY_ID: BY_ID, GROUPS: GROUPS, COMPARE: COMPARE,
    sample: sample, record: record,
    points: points, rulings: rulings,
    extent: extent, ticks: ticks, scaler: scaler, path: path, area: area,
    nearest: nearest, indexed: indexed, change: change, peaks: peaks, spread: spread,
    fmt: fmt, fmtDelta: fmtDelta, tone: tone, whenOf: whenOf,
  };
  root.PS_CFB_METRICS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
