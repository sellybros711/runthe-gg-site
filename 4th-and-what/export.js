/* 4th and What: playbooks printed, saved and downloaded the way a team wants them.
 *
 *   FAW_EXPORT.DEFAULTS                       every option, and its default
 *   FAW_EXPORT.PRESETS                        named option bundles for the export screen
 *   FAW_EXPORT.pick(book, opt)                the plays to export, numbered, in order
 *   FAW_EXPORT.plan(book, opt)                what lands on which page, without drawing
 *   FAW_EXPORT.pages(book, opt) -> [canvas]   the pages, drawn
 *   FAW_EXPORT.print(canvases, opt)           the browser's print dialog ("Save as PDF" keeps it)
 *   FAW_EXPORT.download(canvas, filename)     one PNG
 *
 * The owner's call (2026-10-30): exporting is to be extremely customisable,
 * so coaches print or download a book the way their team uses it. So nearly
 * everything is an option: which plays, their order and numbers, the paper,
 * the layout (cards, a call sheet, wristbands, scout cards, a practice script,
 * an install packet), how many to a page, what each card shows, colour or
 * black and white, line weight, and a header. The standard it is measured
 * against is the vault's 4th-and-what-playbook-research note.
 *
 * ONE NUMBER A PLAY, EVERYWHERE: numbering 'own' prints each play's own number
 * (entry.num, FAW_BOOK.ensureNumbers), so the cards, the call sheet and both
 * wristbands agree. codes 'shuffled' swaps it for a code shuffled by the
 * book's week (FAW_BOOK.bandCodes), on the bands and, with callCodes, the sheet.
 *
 * THE PLANNING IS PURE. pick and the plan* functions read the book and the
 * options and answer plain objects (which items on which page, the codes, the
 * call sheet's boxes and their "if they, then we" lines, the script's rows),
 * so test/print.test.mjs checks them in node with no canvas. The draw*
 * functions only paint a plan. Pages are drawn on canvases at `dpi` dots an
 * inch and printed as images, so what the preview shows is exactly what prints.
 *
 * Plain script: window.FAW_EXPORT, module.exports in node (the planning parts work there).
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var D = function () { return isNode ? require('./diagram.js') : root.FAW_DIAGRAM; };
  var BK = function () { return isNode ? require('./book.js') : root.FAW_BOOK; };
  var CARDS = function () { try { return isNode ? require('./cards.js') : root.FAW_CARDS || null; } catch (e) { return null; } };

  var PAPER = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17], a4: [8.27, 11.69], a5: [5.83, 8.27] };
  /* cards to a page, as columns x rows on portrait paper (landscape swaps them) */
  var GRID = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 12: [3, 4], 16: [4, 4], 20: [4, 5], 24: [4, 6] };
  /* wristband inserts, width x height in inches: the Martin style windows and the triple inserts */
  var BAND_SIZES = { adult: [4.875, 2.75], youth: [4.125, 2.5], 'triple-large': [5.5, 3.5], 'triple-small': [4, 2.5] };
  var CALL_KEYS = ['cover0', 'cover1', 'cover1b', 'cover2', 'cover2b', 'cover3', 'cover3b'];
  var CALL_NAME = { cover0: 'Cover 0 blitz', cover1: 'Cover 1', cover1b: 'Cover 1 blitz', cover2: 'Cover 2', cover2b: 'Cover 2 blitz', cover3: 'Cover 3', cover3b: 'Cover 3 blitz' };
  var TAG_COLOR = { run: '#c8392a', pass: '#1f4fa8', rpo: '#6b3fa0', special: '#111' };
  var BAND_COLOR = { blue: '#1f4fa8', red: '#c8392a', green: '#1d7f45', black: '#111', orange: '#e07a12', purple: '#6b3fa0', gold: '#c99a10', white: '#888', gray: '#666', grey: '#666', yellow: '#c9b010' };
  var FAM = 'Inter, Arial, sans-serif';

  var DEFAULTS = {
    /* which plays */
    plays: 'all',            /* 'all', 'sections' (with sections: [ids]) or 'chosen' (with chosen: [ids]) */
    sections: [], chosen: [],
    order: 'book',           /* 'book', 'section', 'name', 'number' */
    numbering: 'own',        /* 'own' (each play's own num), 'continuous', 'section' (101, 102, 201 ...), 'none' */
    startAt: 1,              /* where 'continuous' starts */
    codes: 'number',         /* what a wristband cell is called by: 'number', or 'shuffled' (codes from the book's week) */
    codeDigits: 'auto',      /* shuffled codes: 'auto', 2 or 3 digits */
    callCodes: false,        /* the call sheet prints the shuffled codes too */
    /* the paper */
    paper: 'letter', landscape: false, margin: 0.4, dpi: 150,
    /* the layout */
    layout: 'cards',         /* 'cards', 'callsheet', 'wristband', 'scout', 'script', 'install' */
    perPage: 4,              /* cards, scout cards and the install packet's cards: a key of GRID */
    backs: 'none',           /* card backs: 'none', 'below' (on the card, under the diagram), 'duplex'
                                (a back page after each front, cells mirrored for flipping on the long edge:
                                columns mirrored on portrait paper, rows on landscape) */
    /* the call sheet */
    callBy: 'situation',     /* 'situation' (a box a situation, in the standard order) or 'list' (by section) */
    callColumns: 2, callThumbs: true,
    callColors: true,        /* runs in red, passes in blue, RPOs in purple */
    callIfThen: true,        /* "vs Cover 2: 14 Snag (64%)" lines from Test it, in each box */
    /* wristbands */
    bandSize: 'adult',       /* 'adult' (4.875 x 2.75 in), 'youth' (4.125 x 2.5), 'triple-large' (5.5 x 3.5),
                                'triple-small' (4 x 2.5), 'custom' (bandW x bandH) */
    bandW: 4.875, bandH: 2.75, bandCols: 3, bandRows: 3, bandCopies: 1, bandText: false, cutLines: true,
    bandColors: [],          /* column headers, e.g. ['Blue', 'Red', 'Green', 'Black']: a column each, cells read "Blue 14" */
    bandFor: '',             /* '' (use bandText), 'qb' (diagrams) or 'player' (names only) */
    bandDefense: false,      /* the defense in a wristband cell (it is small) */
    /* scout cards */
    scoutCall: 'all',        /* 'all' (a card for every call) or a call key, or an array of them */
    plansFor: null,          /* function (play, callKey, entry) -> the defense's plans (FAW_ENGINE.plans). The
                                export screen passes it, so this file never calls the engine itself */
    /* the practice script */
    scriptReps: 0,           /* snaps in the script, cycling through the plays (0: each play once) */
    periods: 0,              /* snaps a period, with a header each (0: one period) */
    periodNames: [],         /* a name for each period, in place of "Period 1" */
    scriptHash: 'cycle',     /* 'cycle' (L M R), or 'L', 'M', 'R' */
    scriptCall: 'cycle',     /* the look each snap is against: 'cycle', 'random' (by scriptSeed), 'none', or a call key */
    scriptCalls: [],         /* the calls it cycles or draws from (empty: all seven) */
    scriptSeed: 1,
    scriptThumbs: false,     /* a small diagram on each row */
    /* the install packet: a cover page by section (a day each), then cards with backs below */
    installTitle: 'Install',
    /* what a card shows */
    showName: true, showNumber: true, showNotes: true, showSection: false, showFormation: false, showStats: false,
    defense: 'letters',      /* false, true or 'x' (X's), 'letters' (E T M W C $ N F) */
    vs: true,                /* the "vs Nickel 4-2-5" label when the defense is drawn */
    depths: true,            /* each route's depth at its break */
    field: true, gain: false, letters: true, routeNumbers: false, reads: true,
    legend: true,            /* the symbol key in each page's footer */
    /* the look */
    color: false, weight: 1, fontScale: 1,
    /* the header */
    title: '', team: '', date: true, pageNumbers: true
  };
  /* Named bundles for the export screen. Apply one over the coach's own options:
     withDefaults(Object.assign({}, current, PRESETS[name])). */
  var PRESETS = {
    'Play cards': { layout: 'cards', perPage: 4, backs: 'none', numbering: 'own', defense: 'letters', vs: true, depths: true, legend: true, showNotes: true },
    'Call sheet': { layout: 'callsheet', callBy: 'situation', callColumns: 3, callThumbs: false, callColors: true, callIfThen: true, landscape: true, numbering: 'own', legend: false },
    'QB wristband': { layout: 'wristband', bandFor: 'qb', bandSize: 'adult', bandCols: 3, bandRows: 3, bandCopies: 2, numbering: 'own', bandDefense: false, depths: false, legend: false },
    'Player wristband': { layout: 'wristband', bandFor: 'player', bandSize: 'adult', bandCols: 4, bandRows: 6, bandCopies: 1, numbering: 'own', legend: false },
    'Scout cards': { layout: 'scout', perPage: 4, scoutCall: 'all', defense: 'letters', legend: true },
    'Practice script': { layout: 'script', periods: 8, scriptHash: 'cycle', scriptCall: 'cycle', scriptThumbs: false, legend: false },
    'Install packet': { layout: 'install', perPage: 2, order: 'section', backs: 'below', defense: 'letters', depths: true, legend: true }
  };
  function withDefaults(o) {
    var r = {};
    for (var k in DEFAULTS) r[k] = o && o[k] !== undefined ? o[k] : DEFAULTS[k];
    return r;
  }

  /* ---------- the planning (pure) ---------- */

  function validNum(n) { return typeof n === 'number' && n >= 1 && Math.floor(n) === n; }
  /* The plays to export, in order, each with its number, its code and its section. */
  function pick(book, opt) {
    opt = withDefaults(opt);
    var secName = {}, secIdx = {};
    book.sections.forEach(function (s, i) { secName[s.id] = s.name; secIdx[s.id] = i; });
    var list = book.plays.slice();
    if (opt.plays === 'sections') list = list.filter(function (p) { return opt.sections.indexOf(p.section) >= 0; });
    if (opt.plays === 'chosen') list = list.filter(function (p) { return opt.chosen.indexOf(p.id) >= 0; });
    if (opt.order === 'section') list.sort(function (a, b) { return (secIdx[a.section] || 0) - (secIdx[b.section] || 0) || book.plays.indexOf(a) - book.plays.indexOf(b); });
    if (opt.order === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (opt.order === 'number') list.sort(function (a, b) { return (a.num || 1e9) - (b.num || 1e9) || book.plays.indexOf(a) - book.plays.indexOf(b); });
    var codes = opt.codes === 'shuffled' ? BK().bandCodes(book, { digits: opt.codeDigits === 2 || opt.codeDigits === 3 ? opt.codeDigits : (+opt.codeDigits || null) }) : null;
    var n = opt.startAt | 0, perSec = {};
    return list.map(function (p, i) {
      var num = '';
      if (opt.numbering === 'own') num = validNum(p.num) ? String(p.num) : String((opt.startAt | 0) + i);
      else if (opt.numbering === 'continuous') num = String(n++);
      else if (opt.numbering === 'section') { var si = (secIdx[p.section] || 0) + 1; perSec[si] = (perSec[si] || 0) + 1; num = String(si * 100 + perSec[si]); }
      var code = codes ? codes[p.id] || '' : '';
      return { entry: p, number: num, code: code, call: code || num, section: secName[p.section] || '', sectionId: p.section,
        tag: BK().tagOf(p), situations: BK().situationsOf(p) };
    });
  }

  function gridOf(opt) { var g = GRID[opt.perPage] || GRID[4]; return opt.landscape ? [g[1], g[0]] : [g[0], g[1]]; }
  /* Cards onto pages. With duplex backs, each front page is followed by its
     back, every cell moved to where it lands when the sheet is flipped. */
  function planCards(items, o) {
    var opt = withDefaults(o), g = gridOf(opt), cols = g[0], rows = g[1], per = cols * rows, pages = [];
    for (var i = 0; i < items.length || (i === 0 && !items.length); i += per) {
      var cells = items.slice(i, i + per).map(function (it, k) { return { item: it, slot: k, col: k % cols, row: Math.floor(k / cols) }; });
      pages.push({ kind: 'front', cells: cells });
      if (opt.backs === 'duplex' && cells.length) pages.push({ kind: 'back', cells: cells.map(function (c) {
        var col = opt.landscape ? c.col : cols - 1 - c.col, row = opt.landscape ? rows - 1 - c.row : c.row;
        return { item: c.item, slot: row * cols + col, col: col, row: row };
      }) });
      if (!items.length) break;
    }
    return { cols: cols, rows: rows, pages: pages };
  }

  /* A play's Test it results summed over the distances a box is for (its own
     distance when the box has no range). Only tests count, never live snaps. */
  function testsFor(entry, range) {
    var out = {}, st = entry.stats || {};
    var ds = range ? Object.keys(st).filter(function (d) { return +d >= range[0] && +d <= range[1]; }) : [String(entry.distance)];
    ds.forEach(function (d) {
      var t = st[d] && st[d].test; if (!t) return;
      CALL_KEYS.forEach(function (k) { var a = t[k]; if (a && a.n) { var o = out[k] = out[k] || { n: 0, w: 0 }; o.n += a.n; o.w += a.w; } });
    });
    return out;
  }
  /* "If they, then we": for each call, the best tested play in the box. Best is
     the highest rate, then the most snaps, then the earlier play. */
  function ifThen(items, range, opt) {
    opt = opt || {};
    var out = [];
    var tests = items.map(function (it) { return testsFor(it.entry, range); });
    CALL_KEYS.forEach(function (k) {
      var best = null, bi = -1, br = -1, bn = -1;
      items.forEach(function (it, i) {
        var a = tests[i][k]; if (!a || !a.n) return;
        var r = a.w / a.n;
        if (r > br || (r === br && a.n > bn)) { best = it; bi = i; br = r; bn = a.n; }
      });
      if (!best) return;
      var rate = Math.round(br * 100), label = callLabel(best, opt);
      out.push({ call: k, label: CALL_NAME[k], item: best, rate: rate, n: bn,
        text: 'vs ' + CALL_NAME[k] + ': ' + (label ? label + ' ' : '') + best.entry.name + ' (' + rate + '%)' });
    });
    return out;
  }
  function callLabel(it, opt) { return opt && opt.callCodes && it.code ? it.code : it.number; }
  /* The call sheet's boxes. By situation: one a situation that has plays, in
     the standard order. By list: one a section, in the order picked. */
  function planCallSheet(book, items, o) {
    var opt = withDefaults(o), boxes = [];
    var row = function (it) { return { item: it, tag: it.tag, color: TAG_COLOR[it.tag] || '#111', label: callLabel(it, opt) }; };
    if (opt.callBy === 'list') {
      var last = null;
      items.forEach(function (it) {
        if (!last || last.key !== it.sectionId) { last = { key: it.sectionId, label: it.section || 'Plays', range: null, plays: [] }; boxes.push(last); }
        last.plays.push(row(it));
      });
    } else {
      BK().SITUATIONS.forEach(function (s) {
        var mine = items.filter(function (it) { return it.situations.indexOf(s.key) >= 0; });
        if (mine.length) boxes.push({ key: s.key, label: s.label, range: s.range || null, plays: mine.map(row) });
      });
    }
    boxes.forEach(function (b) { b.ifThen = opt.callIfThen ? ifThen(b.plays.map(function (r) { return r.item; }), b.range, opt) : []; });
    return boxes;
  }

  function bandSize(opt) { return BAND_SIZES[opt.bandSize] ? BAND_SIZES[opt.bandSize].slice() : [+opt.bandW || 4.875, +opt.bandH || 2.75]; }
  function bandText(opt) { return opt.bandFor === 'player' ? true : opt.bandFor === 'qb' ? false : !!opt.bandText; }
  /* Wristbands: the plays cut into bands of cols x rows, each copied, each cell
     with the label the QB reads off it. Coloured columns put the colour first. */
  function planWristband(items, o) {
    var opt = withDefaults(o), colors = (opt.bandColors || []).filter(Boolean).map(String);
    var cols = colors.length ? colors.length : Math.max(1, opt.bandCols | 0), rows = Math.max(1, opt.bandRows | 0), per = cols * rows;
    var bands = [];
    for (var i = 0; i < items.length || (i === 0 && !items.length); i += per) {
      var cells = items.slice(i, i + per).map(function (it, j) {
        var c = j % cols, color = colors.length ? colors[c] : '';
        return { item: it, col: c, row: Math.floor(j / cols), color: color, label: (color ? color + ' ' : '') + (it.call || '') };
      });
      for (var k = 0; k < Math.max(1, opt.bandCopies | 0); k++) bands.push(cells);
      if (!items.length) break;
    }
    return { size: bandSize(opt), cols: cols, rows: rows, colors: colors, text: bandText(opt), bands: bands };
  }

  function callList(opt) {
    var c = Array.isArray(opt.scriptCalls) && opt.scriptCalls.length ? opt.scriptCalls.filter(function (k) { return CALL_NAME[k]; }) : [];
    return c.length ? c : CALL_KEYS.slice();
  }
  /* The practice script: snaps in order, by period, each with a hash and a look. */
  function planScript(items, o) {
    var opt = withDefaults(o), reps = (opt.scriptReps | 0) > 0 ? opt.scriptReps | 0 : items.length, calls = callList(opt);
    var seed = (opt.scriptSeed >>> 0) || 1, rnd = function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    var rows = [];
    for (var r = 0; items.length && r < reps; r++) {
      var it = items[r % items.length];
      var hash = opt.scriptHash === 'L' || opt.scriptHash === 'M' || opt.scriptHash === 'R' ? opt.scriptHash : 'LMR'.charAt(r % 3);
      var call = opt.scriptCall === 'none' ? null : opt.scriptCall === 'random' ? calls[rnd() % calls.length] : CALL_NAME[opt.scriptCall] ? opt.scriptCall : calls[r % calls.length];
      rows.push({ n: r + 1, hash: hash, item: it, call: call, callLabel: call ? CALL_NAME[call] : '' });
    }
    var per = (opt.periods | 0) > 0 ? opt.periods | 0 : Math.max(1, rows.length), periods = [];
    for (var i = 0; i < rows.length || (i === 0 && !rows.length); i += per) {
      var pi = periods.length;
      periods.push({ title: (opt.periodNames && opt.periodNames[pi]) || 'Period ' + (pi + 1), rows: rows.slice(i, i + per) });
      if (!rows.length) break;
    }
    return { periods: periods };
  }

  /* Scout cards: a card for each play and each call asked for. */
  function scoutCalls(opt) {
    if (Array.isArray(opt.scoutCall)) return opt.scoutCall.filter(function (k) { return CALL_NAME[k]; });
    return CALL_NAME[opt.scoutCall] ? [opt.scoutCall] : CALL_KEYS.slice();
  }
  function planScout(items, o) {
    var opt = withDefaults(o), calls = scoutCalls(opt), out = [];
    items.forEach(function (it) { calls.forEach(function (k) { out.push({ item: it, call: k, title: CALL_NAME[k] }); }); });
    return out;
  }

  /* The install packet: a day for each section, in book order, then the cards. */
  function planInstall(book, items, o) {
    var opt = withDefaults(o), days = [];
    book.sections.forEach(function (s) {
      var mine = items.filter(function (it) { return it.sectionId === s.id; });
      if (mine.length) days.push({ day: days.length + 1, section: s.name, title: 'Day ' + (days.length + 1) + ': ' + s.name, items: mine });
    });
    var ordered = []; days.forEach(function (d) { ordered = ordered.concat(d.items); });
    return { days: days, cards: planCards(ordered, Object.assign({}, opt, { backs: 'below' })) };
  }

  /* Everything a layout will print, as data. */
  function plan(book, o) {
    var opt = withDefaults(o), items = pick(book, opt);
    if (opt.layout === 'callsheet') return { layout: 'callsheet', items: items, boxes: planCallSheet(book, items, opt) };
    if (opt.layout === 'wristband') return { layout: 'wristband', items: items, band: planWristband(items, opt) };
    if (opt.layout === 'script') return { layout: 'script', items: items, script: planScript(items, opt) };
    if (opt.layout === 'scout') { var sc = planScout(items, opt); return { layout: 'scout', items: items, scout: sc, cards: planCards(sc, opt) }; }
    if (opt.layout === 'install') return { layout: 'install', items: items, install: planInstall(book, items, opt) };
    return { layout: 'cards', items: items, cards: planCards(items, opt) };
  }

  function statLine(p) {
    var st = p.stats && p.stats[p.distance];
    if (!st) return '';
    var t = st.test, out = [];
    if (t) { var n = 0, w = 0; for (var k in t) if (t[k] && t[k].n) { n += t[k].n; w += t[k].w; } if (n) out.push('Tested ' + Math.round(w * 100 / n) + '% on 4th and ' + p.distance); }
    if (st.byCall) { var n2 = 0, w2 = 0; for (var k2 in st.byCall) { n2 += st.byCall[k2].n; w2 += st.byCall[k2].w; } if (n2) out.push('Live ' + w2 + ' of ' + n2); }
    return out.join(' · ');
  }

  /* ---------- drawing ---------- */

  /* Text that fits a width: shrink, then cut with an ellipsis. */
  function fit(ctx, text, maxW, px, weight, family) {
    var size = px;
    ctx.font = weight + ' ' + size + 'px ' + family;
    while (ctx.measureText(text).width > maxW && size > px * 0.7) { size -= 1; ctx.font = weight + ' ' + size + 'px ' + family; }
    if (ctx.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1);
    return t + '...';
  }
  function wrap(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...'; }
    return lines;
  }

  function diagramOpt(opt, p, book, extra) {
    var o = { color: opt.color, defense: opt.defense, vs: opt.vs, distance: p.distance, field: opt.field, gain: opt.gain, letters: opt.letters,
      numbers: opt.routeNumbers, reads: opt.reads, depths: opt.depths, weight: opt.weight };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function headLine(it, opt) { return (opt.showNumber && it.number ? it.number + '  ' : '') + (opt.showName ? it.entry.name : ''); }

  /* The back of a card, as text, fitted to its box: the font shrinks until it all fits. */
  function drawBack(ctx, x, y, w, h, it, opt, dpi, withHead) {
    var C = CARDS(); if (!C) return;
    var bk = C.back(it.entry, { terms: opt.terms });
    var rows = bk.lines.map(function (l) { return [l.who, l.text]; });
    rows.push(['Line', bk.line]);
    var qb = bk.qb.replace(/^QB:\s*/, '');
    rows.push(['QB', qb.charAt(0).toUpperCase() + qb.slice(1)]);
    if (bk.notes) rows.push(['Notes', bk.notes]);
    if (bk.vs.length) rows.push(['Tested', bk.vs.map(function (v) { return v.label + ' ' + v.rate + '%'; }).join(' · ')]);
    var pad = Math.round(dpi * 0.05), base = Math.round(dpi * (withHead ? 0.16 : 0.105) * opt.fontScale), head = withHead ? headLine(it, opt) : '';
    for (var fs = base; fs >= Math.max(6, base * 0.45); fs = Math.floor(fs * 0.9)) {
      ctx.font = '800 ' + fs + 'px ' + FAM;
      var keyW = Math.max(ctx.measureText('Tested').width, ctx.measureText('Notes').width) + pad;
      ctx.font = '400 ' + fs + 'px ' + FAM;
      var laid = rows.map(function (r) { return [r[0], wrap(ctx, r[1], w - pad * 2 - keyW, 6)]; });
      var lh = Math.round(fs * 1.25), need = (head ? fs * 1.6 : 0) + laid.reduce(function (a, r) { return a + r[1].length * lh + fs * 0.2; }, 0);
      if (need <= h - pad * 2 || fs * 0.9 < Math.max(6, base * 0.45)) break;
    }
    var yy = y + pad;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    if (head) { ctx.fillStyle = '#111'; ctx.fillText(fit(ctx, head, w - pad * 2, Math.round(fs * 1.2), '800', FAM), x + pad, yy); yy += fs * 1.6; }
    laid.forEach(function (r) {
      if (yy > y + h - lh) return;
      ctx.fillStyle = '#111'; ctx.font = '800 ' + fs + 'px ' + FAM; ctx.fillText(r[0], x + pad, yy);
      ctx.font = '400 ' + fs + 'px ' + FAM; ctx.fillStyle = '#222';
      r[1].forEach(function (ln) { if (yy <= y + h - lh) { ctx.fillText(ln, x + pad + keyW, yy); } yy += lh; });
      yy += fs * 0.2;
    });
  }

  /* One card front: a header line, the diagram, then whatever lines are on.
     With backs 'below', the back's text takes the lower part of the card. */
  function card(ctx, x, y, w, h, it, opt, book, dpi, extra) {
    var p = it.entry, pad = Math.round(dpi * 0.06), fs = Math.round(dpi * 0.13 * opt.fontScale), small = Math.round(fs * 0.8);
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, dpi / 100); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    var top = y + pad, head = extra && extra.head !== undefined ? extra.head : headLine(it, opt);
    if (head) {
      ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(fit(ctx, head, w - pad * 2, fs, '800', FAM), x + pad, top);
      top += fs + pad * 0.6;
    }
    if (extra && extra.big) {
      var bs = Math.round(fs * 1.6);
      ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(fit(ctx, extra.big, w - pad * 2, bs, '900', FAM), x + pad, top);
      top += bs + pad * 0.6;
    }
    var below = opt.backs === 'below' && !(extra && extra.noBack) ? Math.round((y + h - top) * 0.45) : 0;
    var foot = [];
    if (opt.showSection && it.section) foot.push(it.section);
    if (opt.showFormation) foot.push(root.FAW_NAMES ? (root.FAW_NAMES.FORMATION_WORD[p.play.formation] || p.play.formation) + ' · 4th and ' + p.distance : '');
    if (opt.showStats) { var sl = statLine(p); if (sl) foot.push(sl); }
    ctx.font = '400 ' + small + 'px ' + FAM;
    var noteLines = opt.showNotes && p.notes && !below && !(extra && extra.noNotes) ? wrap(ctx, p.notes, w - pad * 2, h > dpi * 3 ? 3 : 1) : [];
    var footH = (foot.length ? small + pad * 0.4 : 0) + noteLines.length * (small + 2);
    var dh = y + h - pad - footH - below - top;
    if (dh > 10) D().draw(ctx, x + pad, top, w - pad * 2, dh, p.play, diagramOpt(opt, p, book, extra && extra.diagram));
    var fy = y + h - pad - footH - below;
    ctx.fillStyle = '#333'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    noteLines.forEach(function (ln) { ctx.font = '400 ' + small + 'px ' + FAM; ctx.fillText(ln, x + pad, fy); fy += small + 2; });
    if (foot.length) { ctx.fillStyle = '#555'; ctx.fillText(fit(ctx, foot.join(' · '), w - pad * 2, small, '600', FAM), x + pad, fy); }
    if (below) {
      var by = y + h - below;
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + pad, by); ctx.lineTo(x + w - pad, by); ctx.stroke();
      drawBack(ctx, x, by, w, below - pad * 0.5, it, opt, dpi, false);
    }
  }
  function cardBack(ctx, x, y, w, h, it, opt, dpi) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, dpi / 100); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    drawBack(ctx, x + dpi * 0.02, y + dpi * 0.02, w - dpi * 0.04, h - dpi * 0.04, it, opt, dpi, true);
  }

  function newPage(opt) {
    var size = PAPER[opt.paper] || PAPER.letter, wIn = opt.landscape ? size[1] : size[0], hIn = opt.landscape ? size[0] : size[1];
    var c = root.document.createElement('canvas');
    c.width = Math.round(wIn * opt.dpi); c.height = Math.round(hIn * opt.dpi);
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    c.inches = [wIn, hIn];
    return c;
  }
  /* the room the footer takes: the page number and the symbol key */
  function footRoom(opt) { return opt.dpi * ((opt.pageNumbers ? 0.15 : 0) + (opt.legend ? 0.22 : 0)); }
  /* The symbol key: what every mark on the page means. */
  function legend(ctx, x, y, w, h, opt) {
    var dpi = opt.dpi, fs = Math.max(7, Math.round(dpi * 0.075)), u = fs, ink = '#111', blue = opt.color ? '#1f4fa8' : '#111', green = opt.color ? '#1d7f45' : '#111', red = opt.color ? '#c8392a' : '#555';
    var items = [
      ['read', 'Reads in order'], ['route', 'Route'], ['block', 'Block'], ['run', 'Run'], ['dash', 'Decoy or fake'], ['zig', 'Motion'], ['zone', 'Zone'], ['def', 'Defense: E T S M W C $ N F']
    ];
    ctx.save(); ctx.font = '600 ' + fs + 'px ' + FAM; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var widths = items.map(function (t) { return u * 2.2 + ctx.measureText(t[1]).width + u * 1.2; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0), k = total > w ? w / total : 1;
    if (k < 1) { fs = Math.max(6, Math.floor(fs * k)); u = fs; ctx.font = '600 ' + fs + 'px ' + FAM; widths = items.map(function (t) { return u * 2.2 + ctx.measureText(t[1]).width + u * 1.2; }); total = widths.reduce(function (a, b) { return a + b; }, 0); }
    var cx = x + Math.max(0, (w - total) / 2), cy = y + h / 2, lw = Math.max(1, dpi / 110);
    items.forEach(function (t, i) {
      var g = t[0], gx = cx, gw = u * 1.8;
      ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.setLineDash([]);
      if (g === 'read') { ctx.beginPath(); ctx.arc(gx + gw / 2, cy, u * 0.55, 0, 7); ctx.stroke(); ctx.textAlign = 'center'; ctx.font = '800 ' + Math.round(fs * 0.8) + 'px ' + FAM; ctx.fillText('1', gx + gw / 2, cy + 0.5); ctx.textAlign = 'left'; ctx.font = '600 ' + fs + 'px ' + FAM; }
      if (g === 'route' || g === 'run' || g === 'dash') {
        ctx.strokeStyle = g === 'run' ? green : blue; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = g === 'run' ? lw * 2 : lw;
        if (g === 'dash') ctx.setLineDash([lw * 2.5, lw * 2]);
        ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(gx + gw - u * 0.4, cy); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(gx + gw, cy); ctx.lineTo(gx + gw - u * 0.5, cy - u * 0.3); ctx.lineTo(gx + gw - u * 0.5, cy + u * 0.3); ctx.closePath(); ctx.fill();
      }
      if (g === 'block') { ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(gx + gw, cy); ctx.moveTo(gx + gw, cy - u * 0.45); ctx.lineTo(gx + gw, cy + u * 0.45); ctx.stroke(); }
      if (g === 'zig') { ctx.strokeStyle = blue; ctx.beginPath(); for (var z = 0; z <= 6; z++) { var zx = gx + gw * z / 6, zy = cy + (z % 2 ? -u * 0.3 : u * 0.3); if (z) ctx.lineTo(zx, zy); else ctx.moveTo(zx, zy); } ctx.stroke(); }
      if (g === 'zone') { ctx.fillStyle = opt.color ? 'rgba(42,111,214,0.18)' : 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(gx + gw / 2, cy, gw / 2, u * 0.45, 0, 0, 7); ctx.fill(); }
      if (g === 'def') { ctx.fillStyle = red; ctx.font = '800 ' + fs + 'px ' + FAM; ctx.fillText('E', gx + u * 0.4, cy); ctx.font = '600 ' + fs + 'px ' + FAM; }
      ctx.fillStyle = '#333'; ctx.fillText(t[1], gx + u * 2.2, cy);
      cx += widths[i];
    });
    ctx.restore();
  }
  /* the header across the top of a page and the footer; answers where the content starts */
  function header(c, opt, book, pageNo) {
    var x = c.getContext('2d'), dpi = opt.dpi, m = opt.margin * dpi;
    var title = opt.title || book.name, team = opt.team || book.team || '';
    var hasHead = title || team || opt.date;
    var y = m;
    if (hasHead) {
      var fs = Math.round(dpi * 0.17 * opt.fontScale);
      x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
      x.font = '800 ' + fs + 'px ' + FAM; x.fillText(title, m, y);
      x.textAlign = 'right'; x.font = '600 ' + Math.round(fs * 0.75) + 'px ' + FAM;
      var right = [team, opt.date ? new Date().toLocaleDateString() : ''].filter(Boolean).join(' · ');
      x.fillText(right, c.width - m, y + fs * 0.15);
      y += fs + dpi * 0.08;
      x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 75); x.beginPath(); x.moveTo(m, y); x.lineTo(c.width - m, y); x.stroke();
      y += dpi * 0.08;
    }
    if (opt.pageNumbers) {
      x.fillStyle = '#555'; x.textAlign = 'center'; x.textBaseline = 'bottom'; x.font = '600 ' + Math.round(dpi * 0.1) + 'px ' + FAM;
      x.fillText(String(pageNo), c.width / 2, c.height - m * 0.4);
    }
    if (opt.legend) legend(x, m, c.height - m - footRoom(opt) + dpi * 0.03, c.width - m * 2, dpi * 0.18, opt);
    return y;
  }

  /* Cards (and scout cards) as the plan lays them out. draw(ctx, x, y, w, h, cell, kind) paints one. */
  function gridPages(book, cp, opt, paint, firstPage) {
    var out = [], from = firstPage || 1;
    cp.pages.forEach(function (pg) {
      var c = newPage(opt), x = c.getContext('2d'), dpi = opt.dpi, m = opt.margin * dpi;
      var top = header(c, opt, book, out.length + from), bottom = c.height - m - footRoom(opt);
      var gap = dpi * 0.1, cw = (c.width - m * 2 - gap * (cp.cols - 1)) / cp.cols, ch = (bottom - top - gap * (cp.rows - 1)) / cp.rows;
      pg.cells.forEach(function (cell) {
        paint(x, Math.round(m + cell.col * (cw + gap)), Math.round(top + cell.row * (ch + gap)), Math.round(cw), Math.round(ch), cell.item, pg.kind);
      });
      out.push(c);
    });
    return out;
  }
  function cardPages(book, items, opt) {
    return gridPages(book, planCards(items, opt), opt, function (x, cx, cy, cw, ch, it, kind) {
      if (kind === 'back') cardBack(x, cx, cy, cw, ch, it, opt, opt.dpi);
      else card(x, cx, cy, cw, ch, it, opt, book, opt.dpi);
    });
  }

  /* Scout cards: the defense the scout team shows, big, with the offense faint. */
  function scoutPages(book, items, opt) {
    var sc = planScout(items, opt);
    var o2 = Object.assign({}, opt, { backs: 'none' });
    return gridPages(book, planCards(sc, o2), o2, function (x, cx, cy, cw, ch, s) {
      var it = s.item, plans = null;
      if (typeof opt.plansFor === 'function') { try { plans = opt.plansFor(it.entry.play, s.call, it.entry); } catch (e) { plans = null; } }
      var Dd = D(), def = plans && plans.length ? plans : Dd.defenseFor(it.entry.play, { distance: it.entry.distance });
      var big = Dd.frontName(def) + ' · ' + CALL_NAME[s.call];
      card(x, cx, cy, cw, ch, it, o2, book, opt.dpi, { head: 'Scout: ' + headLine(it, opt), big: big, noBack: true, noNotes: true,
        diagram: { defense: 'letters', coverage: plans, faint: true, vs: false, call: s.call, reads: false, depths: false } });
    });
  }

  /* The call sheet, as the plan lays it out: boxes flowing down columns. */
  function callSheet(book, items, opt) {
    var boxes = planCallSheet(book, items, opt);
    var out = [], dpi = opt.dpi;
    var c = null, x = null, col = 0, y = 0, top = 0, bottom = 0, cw = 0, m = opt.margin * dpi, gap = dpi * 0.15;
    var cols = Math.max(1, opt.callColumns | 0);
    var rowH = Math.round(dpi * (opt.callThumbs ? 0.62 : 0.22) * opt.fontScale), fs = Math.round(dpi * 0.11 * opt.fontScale), ifH = Math.round(fs * 1.3);
    function page() {
      c = newPage(opt); x = c.getContext('2d'); top = header(c, opt, book, out.length + 1);
      bottom = c.height - m - footRoom(opt);
      cw = (c.width - m * 2 - gap * (cols - 1)) / cols; col = 0; y = top; out.push(c);
    }
    function room(hh) { if (y + hh > bottom && y > top) { col++; y = top; if (col >= cols) page(); } }
    page();
    /* the colour key, once, above the first box */
    if (opt.callColors && boxes.length) {
      x.font = '700 ' + Math.round(fs * 0.85) + 'px ' + FAM; x.textBaseline = 'middle'; x.textAlign = 'left';
      var kx = m;
      [['Run', TAG_COLOR.run], ['Pass', TAG_COLOR.pass], ['RPO', TAG_COLOR.rpo]].forEach(function (t) {
        x.fillStyle = t[1]; x.fillText(t[0], kx, y + fs * 0.6); kx += x.measureText(t[0]).width + dpi * 0.15;
      });
      y += fs * 1.4;
    }
    boxes.forEach(function (bx) {
      room(fs * 1.8 + rowH);
      var cx = m + col * (cw + gap);
      x.fillStyle = '#111'; x.fillRect(cx, y, cw, fs * 1.5);
      x.fillStyle = '#fff'; x.font = '800 ' + fs + 'px ' + FAM; x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(String(bx.label).toUpperCase(), cx + dpi * 0.05, y + fs * 0.75);
      y += fs * 1.7;
      bx.plays.forEach(function (r) {
        room(rowH);
        var cx2 = m + col * (cw + gap), thumbW = opt.callThumbs ? Math.round(rowH * 1.5) : 0, it = r.item;
        if (opt.callThumbs) { x.strokeStyle = '#bbb'; x.lineWidth = 1; x.strokeRect(cx2, y, thumbW, rowH - 4); D().draw(x, cx2 + 2, y + 2, thumbW - 4, rowH - 8, it.entry.play, diagramOpt(opt, it.entry, book, { defense: false, depths: false, vs: false })); }
        x.fillStyle = opt.callColors ? r.color : '#111'; x.textBaseline = 'middle'; x.textAlign = 'left';
        var label = (opt.showNumber && r.label ? r.label + '  ' : '') + it.entry.name;
        x.fillText(fit(x, label, cw - thumbW - dpi * 0.1, fs, '700', FAM), cx2 + thumbW + dpi * 0.06, y + (rowH - 4) / 2);
        x.strokeStyle = '#ddd'; x.beginPath(); x.moveTo(cx2, y + rowH - 2); x.lineTo(cx2 + cw, y + rowH - 2); x.stroke();
        y += rowH;
      });
      if (bx.ifThen.length) {
        room(ifH * Math.min(2, bx.ifThen.length));
        var ix = m + col * (cw + gap);
        bx.ifThen.forEach(function (t) {
          room(ifH);
          ix = m + col * (cw + gap);
          x.fillStyle = '#333'; x.textBaseline = 'middle'; x.textAlign = 'left';
          x.fillText(fit(x, t.text, cw - dpi * 0.1, Math.round(fs * 0.88), 'italic 600', FAM), ix + dpi * 0.06, y + ifH / 2);
          y += ifH;
        });
      }
      y += fs * 0.6;
    });
    return out;
  }

  /* Wristband cards: the plan's bands at their size, as many to a page as fit, with cut lines. */
  function wristbands(book, items, opt) {
    var wp = planWristband(items, opt), out = [], dpi = opt.dpi;
    var bw = wp.size[0] * dpi, bh = wp.size[1] * dpi;
    var probe = { width: Math.round((opt.landscape ? (PAPER[opt.paper] || PAPER.letter)[1] : (PAPER[opt.paper] || PAPER.letter)[0]) * dpi), height: Math.round((opt.landscape ? (PAPER[opt.paper] || PAPER.letter)[0] : (PAPER[opt.paper] || PAPER.letter)[1]) * dpi) };
    var m = opt.margin * dpi, gap = dpi * 0.12;
    var across = Math.max(1, Math.floor((probe.width - m * 2 + gap) / (bw + gap))), down = Math.max(1, Math.floor((probe.height - m * 2 - dpi * 0.5 - footRoom(opt) + gap) / (bh + gap)));
    var headH = wp.colors.length ? Math.round(Math.min(bh * 0.1, dpi * 0.16)) : 0;
    for (var p = 0; p < wp.bands.length; p += across * down) {
      var c = newPage(opt), x = c.getContext('2d'), top = header(c, opt, book, out.length + 1);
      wp.bands.slice(p, p + across * down).forEach(function (band, k) {
        var bx = m + (k % across) * (bw + gap), by = top + Math.floor(k / across) * (bh + gap);
        if (opt.cutLines) { x.setLineDash([dpi * 0.05, dpi * 0.04]); x.strokeStyle = '#888'; x.lineWidth = 1; x.strokeRect(bx - gap / 2, by - gap / 2, bw + gap, bh + gap); x.setLineDash([]); }
        x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 100); x.strokeRect(bx, by, bw, bh);
        var cw = bw / wp.cols, chh = (bh - headH) / wp.rows, fs = Math.round(Math.min(chh * (wp.text ? 0.34 : 0.2), dpi * 0.12) * opt.fontScale);
        wp.colors.forEach(function (name, j) {
          x.fillStyle = BAND_COLOR[String(name).toLowerCase()] || '#111'; x.fillRect(bx + j * cw, by, cw, headH);
          x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillText(fit(x, String(name).toUpperCase(), cw - 4, Math.round(headH * 0.7), '800', FAM), bx + j * cw + cw / 2, by + headH / 2);
        });
        band.forEach(function (cell) {
          var it = cell.item, cx = bx + cell.col * cw, cy = by + headH + cell.row * chh;
          x.strokeStyle = '#999'; x.lineWidth = 1; x.strokeRect(cx, cy, cw, chh);
          x.fillStyle = cell.color ? BAND_COLOR[cell.color.toLowerCase()] || '#111' : '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
          var label = (cell.label ? cell.label + ' ' : '') + (wp.text || opt.showName ? it.entry.name : '');
          if (wp.text) { x.font = '800 ' + fs + 'px ' + FAM; var ls = wrap(x, label, cw - 6, 2); ls.forEach(function (ln, li) { x.fillText(fit(x, ln, cw - 6, fs, '800', FAM), cx + 3, cy + 2 + li * fs * 1.1); }); }
          else {
            x.fillText(fit(x, label, cw - 6, fs, '800', FAM), cx + 3, cy + 2);
            D().draw(x, cx + 2, cy + fs + 4, cw - 4, chh - fs - 6, it.entry.play, diagramOpt(opt, it.entry, book, { defense: opt.bandDefense ? opt.defense : false, vs: false }));
          }
        });
      });
      out.push(c);
    }
    return out;
  }

  /* The practice script: a table by period. */
  function scriptPages(book, items, opt) {
    var sp = planScript(items, opt), out = [], dpi = opt.dpi, m = opt.margin * dpi;
    var fs = Math.round(dpi * 0.11 * opt.fontScale), rowH = Math.round(dpi * (opt.scriptThumbs ? 0.6 : 0.3) * opt.fontScale), headH = Math.round(fs * 1.7);
    var c, x, y, top, bottom, W;
    var colsW = [['#', 0.06], ['Hash', 0.08], ['No.', 0.08]].concat(opt.scriptThumbs ? [['', 0.13]] : []).concat([['Play', 0], ['vs', 0.2], ['Result', 0.2]]);
    function page() { c = newPage(opt); x = c.getContext('2d'); top = header(c, opt, book, out.length + 1); bottom = c.height - m - footRoom(opt); W = c.width - m * 2; y = top; out.push(c); }
    function widths() { var fixed = colsW.reduce(function (a, k) { return a + k[1]; }, 0); return colsW.map(function (k) { return (k[1] || 1 - fixed) * W; }); }
    function heads(ws) {
      var cx = m; x.fillStyle = '#eee'; x.fillRect(m, y, W, headH); x.fillStyle = '#111'; x.font = '800 ' + fs + 'px ' + FAM; x.textBaseline = 'middle'; x.textAlign = 'left';
      colsW.forEach(function (k, i) { x.fillText(k[0], cx + dpi * 0.04, y + headH / 2); cx += ws[i]; });
      y += headH;
    }
    page();
    var ws = widths();
    sp.periods.forEach(function (pd) {
      if (y + headH * 2 + rowH > bottom) page();
      x.fillStyle = '#111'; x.fillRect(m, y, W, headH); x.fillStyle = '#fff'; x.font = '800 ' + fs + 'px ' + FAM; x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(String(pd.title).toUpperCase(), m + dpi * 0.05, y + headH / 2); y += headH;
      heads(ws);
      pd.rows.forEach(function (r) {
        if (y + rowH > bottom) { page(); heads(ws); }
        var cx = m, it = r.item, cells = [String(r.n), r.hash, it.call || it.number || ''];
        if (opt.scriptThumbs) cells.push(null);
        cells.push(it.entry.name, r.callLabel, '');
        x.strokeStyle = '#bbb'; x.lineWidth = 1;
        cells.forEach(function (t, i) {
          x.strokeRect(cx, y, ws[i], rowH);
          if (t === null) D().draw(x, cx + 2, y + 2, ws[i] - 4, rowH - 4, it.entry.play, diagramOpt(opt, it.entry, book, { defense: false, depths: false, vs: false }));
          else if (t) { x.fillStyle = i === 3 + (opt.scriptThumbs ? 1 : 0) && opt.callColors ? TAG_COLOR[it.tag] || '#111' : '#111'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(fit(x, t, ws[i] - dpi * 0.08, fs, i === 2 ? '800' : '600', FAM), cx + dpi * 0.04, y + rowH / 2); }
          cx += ws[i];
        });
        y += rowH;
      });
      y += fs;
    });
    return out;
  }

  /* The install packet: the cover page by day, then the cards with backs below. */
  function installPages(book, items, opt) {
    var ip = planInstall(book, items, opt), dpi = opt.dpi, m = opt.margin * dpi;
    var c = newPage(opt), x = c.getContext('2d'), y = header(c, opt, book, 1), bottom = c.height - m - footRoom(opt);
    var fs = Math.round(dpi * 0.13 * opt.fontScale);
    x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
    x.font = '900 ' + Math.round(fs * 2) + 'px ' + FAM; x.fillText(opt.installTitle || 'Install', m, y + dpi * 0.1); y += fs * 2 + dpi * 0.3;
    var colW = (c.width - m * 2) / 2, col = 0, y0 = y;
    ip.days.forEach(function (d) {
      var need = fs * 1.6 + d.items.length * fs * 1.3;
      if (y + Math.min(need, fs * 4) > bottom && col === 0) { col = 1; y = y0; }
      var cx = m + col * colW;
      x.fillStyle = '#111'; x.font = '800 ' + Math.round(fs * 1.15) + 'px ' + FAM; x.fillText(d.title, cx, y); y += fs * 1.6;
      d.items.forEach(function (it) {
        if (y + fs * 1.3 > bottom) { if (col === 0) { col = 1; y = y0; cx = m + colW; } else return; }
        x.fillStyle = TAG_COLOR[it.tag] || '#111'; x.font = '600 ' + fs + 'px ' + FAM;
        x.fillText(fit(x, (it.number ? it.number + '  ' : '') + it.entry.name, colW - dpi * 0.2, fs, '600', FAM), cx + dpi * 0.12, y); y += fs * 1.3;
      });
      y += fs * 0.6;
    });
    var o2 = Object.assign({}, opt, { backs: 'below' }), out = [c];
    /* the cards' page numbers follow the cover */
    return out.concat(gridPages(book, ip.cards, o2, function (xx, cx, cy, cw, ch, it) { card(xx, cx, cy, cw, ch, it, o2, book, opt.dpi); }, 2));
  }

  function pages(book, o) {
    var opt = withDefaults(o), items = pick(book, opt);
    if (o && o.terms) opt.terms = o.terms;
    if (opt.layout === 'callsheet') return callSheet(book, items, opt);
    if (opt.layout === 'wristband') return wristbands(book, items, opt);
    if (opt.layout === 'scout') return scoutPages(book, items, opt);
    if (opt.layout === 'script') return scriptPages(book, items, opt);
    if (opt.layout === 'install') return installPages(book, items, opt);
    return cardPages(book, items, opt);
  }

  /* Print the pages as they were drawn. The print-only area sits outside the
     app and is removed after the dialog closes. */
  function print(canvases, o) {
    var doc = root.document;
    var old = doc.getElementById('fawPrint'); if (old) old.remove();
    var oldS = doc.getElementById('fawPrintStyle'); if (oldS) oldS.remove();
    var wrapEl = doc.createElement('div'); wrapEl.id = 'fawPrint';
    var inches = canvases[0] ? canvases[0].inches : [8.5, 11];
    canvases.forEach(function (c) { var img = doc.createElement('img'); img.src = c.toDataURL('image/png'); img.alt = ''; wrapEl.appendChild(img); });
    var st = doc.createElement('style'); st.id = 'fawPrintStyle';
    st.textContent = '@page{size:' + inches[0] + 'in ' + inches[1] + 'in;margin:0}' +
      '#fawPrint{display:none}' +
      '@media print{body>*:not(#fawPrint){display:none!important}#fawPrint{display:block}#fawPrint img{display:block;width:' + inches[0] + 'in;height:' + inches[1] + 'in;page-break-after:always;break-after:page}}';
    doc.head.appendChild(st); doc.body.appendChild(wrapEl);
    root.setTimeout(function () { root.print(); }, 60);
  }

  function download(canvas, filename) {
    var a = root.document.createElement('a');
    a.href = canvas.toDataURL('image/png'); a.download = filename;
    root.document.body.appendChild(a); a.click(); a.remove();
  }
  function downloadText(text, filename, type) {
    var a = root.document.createElement('a'), blob = new Blob([text], { type: type || 'application/json' });
    a.href = URL.createObjectURL(blob); a.download = filename;
    root.document.body.appendChild(a); a.click(); a.remove();
    root.setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function slug(s) { return String(s || 'play').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'play'; }

  var API = { DEFAULTS: DEFAULTS, PRESETS: PRESETS, PAPER: PAPER, GRID: GRID, BAND_SIZES: BAND_SIZES, CALL_KEYS: CALL_KEYS, CALL_NAME: CALL_NAME, TAG_COLOR: TAG_COLOR,
    withDefaults: withDefaults, pick: pick, plan: plan, planCards: planCards, planCallSheet: planCallSheet, ifThen: ifThen, testsFor: testsFor,
    planWristband: planWristband, planScript: planScript, planScout: planScout, planInstall: planInstall, bandSize: bandSize,
    pages: pages, print: print, download: download, downloadText: downloadText, slug: slug, statLine: statLine };
  if (isNode) module.exports = API;
  else root.FAW_EXPORT = API;
})(typeof window !== 'undefined' ? window : this);
