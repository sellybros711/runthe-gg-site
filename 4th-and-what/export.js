/* 4th and What: playbooks printed, saved and downloaded the way a team wants them.
 *
 *   FAW_EXPORT.DEFAULTS                       every option, and its default
 *   FAW_EXPORT.pick(book, opt)                the plays to export, numbered, in order
 *   FAW_EXPORT.pages(book, opt) -> [canvas]   the pages, drawn
 *   FAW_EXPORT.print(canvases, opt)           the browser's print dialog ("Save as PDF" keeps it)
 *   FAW_EXPORT.download(canvas, filename)     one PNG
 *
 * The owner's call (2026-10-30): exporting is to be extremely customisable,
 * so coaches print or download a book the way their team uses it. So nearly
 * everything is an option: which plays, their order and numbers, the paper,
 * the layout (cards, a call sheet, wristband cards), how many to a page, what
 * each card shows, colour or black and white, line weight, and a header.
 *
 * Pages are drawn on canvases at `dpi` dots an inch and printed as images, so
 * what the preview shows is exactly what prints, on any browser.
 *
 * Plain script: window.FAW_EXPORT.
 */
(function (root) {
  'use strict';
  var D = function () { return root.FAW_DIAGRAM; };

  var PAPER = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17], a4: [8.27, 11.69], a5: [5.83, 8.27] };
  /* cards to a page, as columns x rows on portrait paper (landscape swaps them) */
  var GRID = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 12: [3, 4], 16: [4, 4], 20: [4, 5], 24: [4, 6] };

  var DEFAULTS = {
    /* which plays */
    plays: 'all',            /* 'all', 'sections' (with sections: [ids]) or 'chosen' (with chosen: [ids]) */
    sections: [], chosen: [],
    order: 'book',           /* 'book', 'section', 'name' */
    numbering: 'continuous', /* 'continuous', 'section' (101, 102, 201 ...), 'none' */
    startAt: 1,
    /* the paper */
    paper: 'letter', landscape: false, margin: 0.4, dpi: 150,
    /* the layout */
    layout: 'cards',         /* 'cards', 'callsheet', 'wristband' */
    perPage: 4,
    callColumns: 2, callThumbs: true,
    bandW: 4.5, bandH: 2.75, bandCols: 3, bandRows: 3, bandCopies: 1, bandText: false, cutLines: true,
    /* what a card shows */
    showName: true, showNumber: true, showNotes: true, showSection: false, showFormation: false, showStats: false,
    defense: false, field: true, gain: false, letters: true, routeNumbers: false, reads: true,
    /* the look */
    color: false, weight: 1, fontScale: 1,
    /* the header */
    title: '', team: '', date: true, pageNumbers: true
  };
  function withDefaults(o) { var r = {}; for (var k in DEFAULTS) r[k] = o && o[k] !== undefined ? o[k] : DEFAULTS[k]; return r; }

  /* The plays to export, in order, each with its number and section name. */
  function pick(book, opt) {
    opt = withDefaults(opt);
    var secName = {}, secIdx = {};
    book.sections.forEach(function (s, i) { secName[s.id] = s.name; secIdx[s.id] = i; });
    var list = book.plays.slice();
    if (opt.plays === 'sections') list = list.filter(function (p) { return opt.sections.indexOf(p.section) >= 0; });
    if (opt.plays === 'chosen') list = list.filter(function (p) { return opt.chosen.indexOf(p.id) >= 0; });
    if (opt.order === 'section') list.sort(function (a, b) { return (secIdx[a.section] || 0) - (secIdx[b.section] || 0) || book.plays.indexOf(a) - book.plays.indexOf(b); });
    if (opt.order === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var n = opt.startAt | 0, perSec = {};
    return list.map(function (p) {
      var num = '';
      if (opt.numbering === 'continuous') num = String(n++);
      else if (opt.numbering === 'section') { var si = (secIdx[p.section] || 0) + 1; perSec[si] = (perSec[si] || 0) + 1; num = String(si * 100 + perSec[si]); }
      return { entry: p, number: num, section: secName[p.section] || '' };
    });
  }

  function statLine(p) {
    var st = p.stats && p.stats[p.distance];
    if (!st) return '';
    var t = st.test, out = [];
    if (t) { var n = 0, w = 0; for (var k in t) if (t[k] && t[k].n) { n += t[k].n; w += t[k].w; } if (n) out.push('Tested ' + Math.round(w * 100 / n) + '% on 4th and ' + p.distance); }
    if (st.byCall) { var n2 = 0, w2 = 0; for (var k2 in st.byCall) { n2 += st.byCall[k2].n; w2 += st.byCall[k2].w; } if (n2) out.push('Live ' + w2 + ' of ' + n2); }
    return out.join(' · ');
  }

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

  function diagramOpt(opt, p, book) {
    var f = null; if (p.play.customFormation) (book.formations || []).forEach(function (x) { if (x.id === p.play.customFormation) f = x; });
    return { color: opt.color, defense: opt.defense, distance: p.distance, field: opt.field, gain: opt.gain, letters: opt.letters, numbers: opt.routeNumbers, reads: opt.reads, weight: opt.weight };
  }

  /* One card: a header line, the diagram, then whatever lines are switched on. */
  function card(ctx, x, y, w, h, it, opt, book, dpi) {
    var p = it.entry, pad = Math.round(dpi * 0.06), fs = Math.round(dpi * 0.13 * opt.fontScale), small = Math.round(fs * 0.8), fam = 'Inter, Arial, sans-serif';
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, dpi / 100); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    var top = y + pad, head = '';
    if (opt.showNumber && it.number) head += it.number + '  ';
    if (opt.showName) head += p.name;
    if (head) {
      ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(fit(ctx, head, w - pad * 2, fs, '800', fam), x + pad, top);
      top += fs + pad * 0.6;
    }
    var foot = [];
    if (opt.showSection && it.section) foot.push(it.section);
    if (opt.showFormation) foot.push(root.FAW_NAMES ? (root.FAW_NAMES.FORMATION_WORD[p.play.formation] || p.play.formation) + ' · 4th and ' + p.distance : '');
    if (opt.showStats) { var sl = statLine(p); if (sl) foot.push(sl); }
    ctx.font = '400 ' + small + 'px ' + fam;
    var noteLines = opt.showNotes && p.notes ? wrap(ctx, p.notes, w - pad * 2, h > dpi * 3 ? 3 : 1) : [];
    var footH = (foot.length ? small + pad * 0.4 : 0) + noteLines.length * (small + 2);
    var dh = y + h - pad - footH - top;
    if (dh > 10) D().draw(ctx, x + pad, top, w - pad * 2, dh, p.play, diagramOpt(opt, p, book));
    var fy = y + h - pad - footH;
    ctx.fillStyle = '#333'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    noteLines.forEach(function (ln) { ctx.font = '400 ' + small + 'px ' + fam; ctx.fillText(ln, x + pad, fy); fy += small + 2; });
    if (foot.length) { ctx.fillStyle = '#555'; ctx.fillText(fit(ctx, foot.join(' · '), w - pad * 2, small, '600', fam), x + pad, fy); }
  }

  function newPage(opt) {
    var size = PAPER[opt.paper] || PAPER.letter, wIn = opt.landscape ? size[1] : size[0], hIn = opt.landscape ? size[0] : size[1];
    var c = root.document.createElement('canvas');
    c.width = Math.round(wIn * opt.dpi); c.height = Math.round(hIn * opt.dpi);
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    c.inches = [wIn, hIn];
    return c;
  }
  /* the header across the top of a page; answers where the content starts */
  function header(c, opt, book, pageNo) {
    var x = c.getContext('2d'), dpi = opt.dpi, m = opt.margin * dpi, fam = 'Inter, Arial, sans-serif';
    var title = opt.title || book.name, team = opt.team || book.team || '';
    var hasHead = title || team || opt.date;
    var y = m;
    if (hasHead) {
      var fs = Math.round(dpi * 0.17 * opt.fontScale);
      x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
      x.font = '800 ' + fs + 'px ' + fam; x.fillText(title, m, y);
      x.textAlign = 'right'; x.font = '600 ' + Math.round(fs * 0.75) + 'px ' + fam;
      var right = [team, opt.date ? new Date().toLocaleDateString() : ''].filter(Boolean).join(' · ');
      x.fillText(right, c.width - m, y + fs * 0.15);
      y += fs + dpi * 0.08;
      x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 75); x.beginPath(); x.moveTo(m, y); x.lineTo(c.width - m, y); x.stroke();
      y += dpi * 0.08;
    }
    if (opt.pageNumbers) {
      x.fillStyle = '#555'; x.textAlign = 'center'; x.textBaseline = 'bottom'; x.font = '600 ' + Math.round(dpi * 0.1) + 'px ' + fam;
      x.fillText(String(pageNo), c.width / 2, c.height - m * 0.4);
    }
    return y;
  }

  function cardPages(book, items, opt) {
    var g = GRID[opt.perPage] || GRID[4], cols = opt.landscape ? g[1] : g[0], rows = opt.landscape ? g[0] : g[1];
    var out = [], per = cols * rows;
    for (var i = 0; i < items.length || (i === 0 && !items.length); i += per) {
      var c = newPage(opt), x = c.getContext('2d'), dpi = opt.dpi, m = opt.margin * dpi;
      var top = header(c, opt, book, out.length + 1), bottom = c.height - m - (opt.pageNumbers ? dpi * 0.15 : 0);
      var gap = dpi * 0.1, cw = (c.width - m * 2 - gap * (cols - 1)) / cols, ch = (bottom - top - gap * (rows - 1)) / rows;
      items.slice(i, i + per).forEach(function (it, k) {
        card(x, Math.round(m + (k % cols) * (cw + gap)), Math.round(top + Math.floor(k / cols) * (ch + gap)), Math.round(cw), Math.round(ch), it, opt, book, dpi);
      });
      out.push(c);
      if (!items.length) break;
    }
    return out;
  }

  /* A call sheet: plays by section, in columns, each a line with a small diagram. */
  function callSheet(book, items, opt) {
    var out = [], dpi = opt.dpi, fam = 'Inter, Arial, sans-serif';
    var c = null, x = null, col = 0, y = 0, top = 0, bottom = 0, cw = 0, m = opt.margin * dpi, gap = dpi * 0.15;
    var rowH = Math.round(dpi * (opt.callThumbs ? 0.62 : 0.24) * opt.fontScale), fs = Math.round(dpi * 0.12 * opt.fontScale);
    function page() {
      c = newPage(opt); x = c.getContext('2d'); top = header(c, opt, book, out.length + 1);
      bottom = c.height - m - (opt.pageNumbers ? dpi * 0.15 : 0);
      cw = (c.width - m * 2 - gap * (opt.callColumns - 1)) / opt.callColumns; col = 0; y = top; out.push(c);
    }
    function room(hh) { if (y + hh > bottom) { col++; y = top; if (col >= opt.callColumns) page(); } }
    page();
    var last = null;
    items.forEach(function (it) {
      if (it.section !== last) {
        room(fs * 1.8 + rowH);
        var cx = m + col * (cw + gap);
        x.fillStyle = '#111'; x.fillRect(cx, y, cw, fs * 1.5);
        x.fillStyle = '#fff'; x.font = '800 ' + fs + 'px ' + fam; x.textBaseline = 'middle'; x.textAlign = 'left';
        x.fillText((it.section || 'Plays').toUpperCase(), cx + dpi * 0.05, y + fs * 0.75);
        y += fs * 1.7; last = it.section;
      }
      room(rowH);
      var cx2 = m + col * (cw + gap), thumbW = opt.callThumbs ? Math.round(rowH * 1.5) : 0;
      if (opt.callThumbs) { x.strokeStyle = '#bbb'; x.lineWidth = 1; x.strokeRect(cx2, y, thumbW, rowH - 4); D().draw(x, cx2 + 2, y + 2, thumbW - 4, rowH - 8, it.entry.play, diagramOpt(opt, it.entry, book)); }
      x.fillStyle = '#111'; x.textBaseline = 'middle'; x.textAlign = 'left';
      var label = (opt.showNumber && it.number ? it.number + '  ' : '') + it.entry.name;
      x.fillText(fit(x, label, cw - thumbW - dpi * 0.1, fs, '700', fam), cx2 + thumbW + dpi * 0.06, y + (rowH - 4) / 2);
      x.strokeStyle = '#ddd'; x.beginPath(); x.moveTo(cx2, y + rowH - 2); x.lineTo(cx2 + cw, y + rowH - 2); x.stroke();
      y += rowH;
    });
    return out;
  }

  /* Wristband cards: a grid of numbered cells at a set size, as many to a page
     as fit, with cut lines. bandText prints names only, no diagrams. */
  function wristbands(book, items, opt) {
    var out = [], dpi = opt.dpi, fam = 'Inter, Arial, sans-serif';
    var bw = opt.bandW * dpi, bh = opt.bandH * dpi, per = opt.bandCols * opt.bandRows;
    var bands = [];
    for (var i = 0; i < items.length || (i === 0 && !items.length); i += per) { bands.push(items.slice(i, i + per)); if (!items.length) break; }
    var all = [];
    bands.forEach(function (b) { for (var k = 0; k < Math.max(1, opt.bandCopies | 0); k++) all.push(b); });
    var probe = newPage(opt), m = opt.margin * dpi, gap = dpi * 0.12;
    var across = Math.max(1, Math.floor((probe.width - m * 2 + gap) / (bw + gap))), down = Math.max(1, Math.floor((probe.height - m * 2 - dpi * 0.5 + gap) / (bh + gap)));
    for (var p = 0; p < all.length; p += across * down) {
      var c = newPage(opt), x = c.getContext('2d'), top = header(c, opt, book, out.length + 1);
      all.slice(p, p + across * down).forEach(function (band, k) {
        var bx = m + (k % across) * (bw + gap), by = top + Math.floor(k / across) * (bh + gap);
        if (opt.cutLines) { x.setLineDash([dpi * 0.05, dpi * 0.04]); x.strokeStyle = '#888'; x.lineWidth = 1; x.strokeRect(bx - gap / 2, by - gap / 2, bw + gap, bh + gap); x.setLineDash([]); }
        x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 100); x.strokeRect(bx, by, bw, bh);
        var cw = bw / opt.bandCols, chh = bh / opt.bandRows, fs = Math.round(Math.min(chh * 0.2, dpi * 0.12) * opt.fontScale);
        band.forEach(function (it, j) {
          var cx = bx + (j % opt.bandCols) * cw, cy = by + Math.floor(j / opt.bandCols) * chh;
          x.strokeStyle = '#999'; x.lineWidth = 1; x.strokeRect(cx, cy, cw, chh);
          x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
          var label = (it.number ? it.number + ' ' : '') + (opt.bandText || opt.showName ? it.entry.name : '');
          x.fillText(fit(x, label, cw - 6, fs, '800', fam), cx + 3, cy + 2);
          if (!opt.bandText) D().draw(x, cx + 2, cy + fs + 4, cw - 4, chh - fs - 6, it.entry.play, diagramOpt(opt, it.entry, book));
        });
      });
      out.push(c);
    }
    return out;
  }

  function pages(book, o) {
    var opt = withDefaults(o), items = pick(book, opt);
    if (opt.layout === 'callsheet') return callSheet(book, items, opt);
    if (opt.layout === 'wristband') return wristbands(book, items, opt);
    return cardPages(book, items, opt);
  }

  /* Print the pages as they were drawn. The print-only area sits outside the
     app and is removed after the dialog closes. */
  function print(canvases, o) {
    var opt = withDefaults(o), doc = root.document;
    var old = doc.getElementById('fawPrint'); if (old) old.remove();
    var oldS = doc.getElementById('fawPrintStyle'); if (oldS) oldS.remove();
    var wrap = doc.createElement('div'); wrap.id = 'fawPrint';
    var inches = canvases[0] ? canvases[0].inches : [8.5, 11];
    canvases.forEach(function (c) { var img = doc.createElement('img'); img.src = c.toDataURL('image/png'); img.alt = ''; wrap.appendChild(img); });
    var st = doc.createElement('style'); st.id = 'fawPrintStyle';
    st.textContent = '@page{size:' + inches[0] + 'in ' + inches[1] + 'in;margin:0}' +
      '#fawPrint{display:none}' +
      '@media print{body>*:not(#fawPrint){display:none!important}#fawPrint{display:block}#fawPrint img{display:block;width:' + inches[0] + 'in;height:' + inches[1] + 'in;page-break-after:always;break-after:page}}';
    doc.head.appendChild(st); doc.body.appendChild(wrap);
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

  root.FAW_EXPORT = { DEFAULTS: DEFAULTS, PAPER: PAPER, GRID: GRID, withDefaults: withDefaults, pick: pick, pages: pages, print: print, download: download, downloadText: downloadText, slug: slug, statLine: statLine };
})(typeof window !== 'undefined' ? window : this);
