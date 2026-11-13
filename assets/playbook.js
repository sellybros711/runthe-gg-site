/*
 * playbook.js : the playbook plumbing two coaching games share.
 *
 *   window.RTG_PLAYBOOK in a page, module.exports in node. Load it as
 *   /assets/playbook.js?v=1 (a plain script, so classic pages and ES module pages can both use it).
 *
 * WHY IT IS SHARED. Two coaching games (one football, one basketball) each built a playbook: books
 * kept on the account, a playbook file a coach can hand to another, and pages printed for the team.
 * The parts that do not care about the sport were the same code twice, and two copies of a sync rule
 * is two chances to get the conflict wrong (the argument /assets/cloudsave.js makes). The owner asked
 * for one copy (2026-11-02). What stays in each game: how a play is drawn, the editor, Test it (it runs
 * each game's own sim), every word a coach reads, the layouts, and the terminology's vocabulary.
 *
 *   STORE   createStore({ game, prefix, maxBytes, onRemote })   a local copy first, the account behind it
 *   MODEL   newId, LIMITS, newBook, newPlay, statsOf, countRun, totals
 *   FILE    exportFile, importFile (fresh ids, game hooks), downloadText
 *   PRINT   PAPER, GRID, withDefaults, pick, page, footer, print, download, ready
 *   TERMS   bestRule, biggestFirst   (optional helpers; each game keeps its own words)
 *
 * THE STORE. A playbook needs a Run The Games account (both games, the owner's call). Signed in,
 * books and the coach's terminology live in the shared cloud saves (/assets/cloudsave.js, table
 * ps_saves): slot 'index' (the books and the terms) and one slot 'b-<id>' per book, under the game's
 * own key. Every edit writes a copy in this browser at once, under the account's id (two accounts on
 * one browser never see each other's books), and the cloud catches up behind it. Opening reads the
 * copy, then the account, and the newer of the two wins. Each save carries `rev`, raised on every
 * edit; the server refuses an older one and hands back the newer copy, which replaces ours
 * (onRemote is told, and the page says so).
 *
 * Nothing here draws a play or reads a game's fields: each game passes hooks.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  if (!isNode && root.RTG_PLAYBOOK) return;

  var INDEX = 'index';

  function now() { return new Date().toISOString(); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  var idCount = 0;
  function newId() {
    var a = '', cr = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : root.crypto;
    try { var b = new Uint8Array(6); cr.getRandomValues(b); for (var i = 0; i < 6; i++) a += (b[i] % 36).toString(36); }
    catch (e) { a = (Date.now() % 2176782336).toString(36) + (idCount++).toString(36); }
    return a;
  }
  function bytesOf(o) { var s = JSON.stringify(o); return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length; }

  /* ---------- the model ---------- */

  /* How long a name may be. Each game can pass its own. */
  var LIMITS = { book: 60, play: 80, notes: 500, section: 40, list: 30 };
  function limitsOf(opt) { var l = {}, o = (opt && opt.limits) || {}; for (var k in LIMITS) l[k] = o[k] || LIMITS[k]; return l; }

  /* A book: a name, a team, sections and plays, plus whatever the game keeps (extra). */
  function newBook(name, extra, opt) {
    var L = limitsOf(opt);
    var b = { id: newId(), name: String(name || 'My playbook').slice(0, L.book), rev: 1, updated: now(), team: '',
      sections: [{ id: newId(), name: 'Plays' }], plays: [] };
    for (var k in extra || {}) b[k] = extra[k];
    return b;
  }
  /* A play in a book: its name, whether that name was typed, its section, notes, the drawing, stats. */
  function newPlay(book, play, opt, extra) {
    opt = opt || {}; var L = limitsOf(opt);
    var p = { id: newId(), name: String(opt.name || 'New play').slice(0, L.play), nameEdited: !!opt.nameEdited,
      section: opt.section || (book.sections[0] && book.sections[0].id) || null, notes: String(opt.notes || '').slice(0, L.notes),
      play: copy(play), stats: {}, updated: now() };
    for (var k in extra || {}) p[k] = extra[k];
    return p;
  }
  /* Where a play keeps its stats: `stats`, or statsBy[bucket] (a level, for a game that has them). */
  function statsOf(entry, bucket) {
    if (!bucket) return entry.stats = entry.stats || {};
    entry.statsBy = entry.statsBy || {};
    return entry.statsBy[bucket] = entry.statsBy[bucket] || {};
  }
  /* Count a run the coach watched, against the defense the sim actually used.
     field names the tally ('byCall' in the football game, 'byScheme' in the basketball one), so neither
     game's saves move. */
  function countRun(entry, situationKey, defenseKey, win, field, bucket) {
    var all = statsOf(entry, bucket), st = all[situationKey] = all[situationKey] || {};
    var f = field || 'byDefense', b = st[f] = st[f] || {};
    var c = b[defenseKey] = b[defenseKey] || { n: 0, w: 0 };
    c.n++; if (win) c.w++;
    return c;
  }
  function totals(byDefense) {
    var n = 0, w = 0;
    for (var k in byDefense || {}) { n += byDefense[k].n; w += byDefense[k].w; }
    return { n: n, w: w };
  }

  /* ---------- the playbook file ---------- */

  function exportFile(book, terms, opt) {
    return JSON.stringify({ format: opt && opt.format, version: 1, exported: now(), book: book, terms: terms || null }, null, 1);
  }
  /* Read a playbook file into a NEW book: every book, section, list item and play gets a fresh id, so
     an import never overwrites anything. The game's own fields come across only through its hooks:
       keepPlay(src)              false drops a play
       lists: { name: fix }       each book list (formations, sets): fix(item, newId) -> item or null
       mapPlay(src, base)         copy the game's play fields onto base (fresh id, section remapped)
       mapBook(src, base)         the same for the book
       afterImport(book, maps)    maps.sections and maps[list] hold old id -> new id */
  function importFile(text, opt) {
    opt = opt || {};
    var L = limitsOf(opt), o = JSON.parse(text), label = opt.label || 'playbook';
    if (!o || o.format !== opt.format || !o.book || !Array.isArray(o.book.plays) || !Array.isArray(o.book.sections)) throw new Error('That is not a ' + label + ' playbook file.');
    var src = o.book, maps = { sections: {} };
    var b = { id: newId(), name: String(src.name || 'Imported playbook').slice(0, L.book), rev: 1, updated: now(), team: String(src.team || '').slice(0, L.book), sections: [], plays: [] };
    b.sections = src.sections.filter(function (s) { return s && s.id; }).map(function (s) { var id = newId(); maps.sections[s.id] = id; return { id: id, name: String(s.name || 'Plays').slice(0, L.section) }; });
    if (!b.sections.length) b.sections = [{ id: newId(), name: 'Plays' }];
    var lists = opt.lists || {};
    Object.keys(lists).forEach(function (name) {
      maps[name] = {};
      b[name] = (Array.isArray(src[name]) ? src[name] : []).map(function (item) {
        if (!item) return null;
        var id = newId(), fixed = lists[name](copy(item), id);
        if (!fixed) return null;
        fixed.id = id; if (fixed.name != null) fixed.name = String(fixed.name).slice(0, L.list);
        if (item.id != null) maps[name][item.id] = id;
        return fixed;
      }).filter(Boolean);
    });
    var keep = opt.keepPlay || function (p) { return !!(p && p.play); };
    b.plays = src.plays.filter(function (p) { return p && keep(p); }).slice(0, opt.maxPlays || 400).map(function (p) {
      var base = { id: newId(), name: String(p.name || 'Play').slice(0, L.play), nameEdited: !!p.nameEdited,
        section: maps.sections[p.section] || b.sections[0].id, notes: String(p.notes || '').slice(0, L.notes),
        play: copy(p.play), stats: p.stats ? copy(p.stats) : {}, updated: now() };
      return opt.mapPlay ? opt.mapPlay(p, base) || base : base;
    });
    if (opt.mapBook) b = opt.mapBook(src, b) || b;
    if (opt.afterImport) b = opt.afterImport(b, maps) || b;
    return { book: b, terms: o.terms || null };
  }
  function downloadText(text, filename, type) {
    var doc = root.document, a = doc.createElement('a'), blob = new Blob([text], { type: type || 'application/json' });
    a.href = URL.createObjectURL(blob); a.download = filename;
    doc.body.appendChild(a); a.click(); a.remove();
    root.setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- the store (browser) ---------- */

  function auth() {
    var A = root.RTG_AUTH, s = A && A.state ? A.state() : null;
    return s && s.signedIn && s.userId ? s : null;
  }
  function createStore(cfg) {
    var GAME = cfg.game, PREFIX = cfg.prefix, MAX = cfg.maxBytes || 524288, onRemote = cfg.onRemote;
    var uid = null, data = null;
    function lsKey() { return PREFIX + uid; }
    function readLocal() { try { return JSON.parse(root.localStorage.getItem(lsKey()) || 'null'); } catch (e) { return null; } }
    function save() { if (uid) { try { root.localStorage.setItem(lsKey(), JSON.stringify(data)); } catch (e) {} } }
    function blank() { return { index: { rev: 1, books: [], terms: null }, books: {} }; }
    function cloud() { return root.RTG_SAVE || null; }
    function pushIndex() {
      var S = cloud(); if (!S) return;
      S.queue(GAME, INDEX, function () { return { payload: data.index, progress: data.index.rev }; }).then(function (r) {
        if (r && r.ok === false && r.payload) { data.index = r.payload; save(); if (onRemote) onRemote('index'); }
      });
    }
    function pushBook(id) {
      var S = cloud(); if (!S) return;
      S.queue(GAME, 'b-' + id, function () { var b = data.books[id]; return b ? { payload: b, progress: b.rev } : null; }).then(function (r) {
        if (r && r.ok === false && r.payload) { data.books[id] = r.payload; save(); if (onRemote) onRemote('book', id); }
      });
    }
    function touchIndex() {
      data.index.rev++;
      data.index.books = Object.keys(data.books).map(function (id) { var b = data.books[id]; return { id: id, name: b.name, updated: b.updated, plays: b.plays.length }; })
        .sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
      save(); pushIndex();
    }
    return {
      who: auth,
      open: function () {
        var a = auth(); if (!a) { uid = null; data = null; return Promise.resolve(null); }
        uid = a.userId; data = readLocal() || blank();
        var S = cloud(); if (!S || !S.all) return Promise.resolve(data);
        return S.all(GAME).then(function (rows) {
          if (!rows || !uid || uid !== a.userId) return data;
          rows.forEach(function (r) {
            if (!r || !r.payload) return;
            if (r.slot === INDEX) { if ((r.progress || 0) >= (data.index.rev || 0)) data.index = r.payload; }
            else if (r.slot.indexOf('b-') === 0) { var id = r.slot.slice(2), mine = data.books[id]; if (!mine || (r.progress || 0) >= (mine.rev || 0)) data.books[id] = r.payload; }
          });
          /* a book only this browser has (saved while offline) goes up now */
          Object.keys(data.books).forEach(function (id) { if (!rows.some(function (r) { return r.slot === 'b-' + id; })) pushBook(id); });
          var listed = data.index.books.map(function (b) { return b.id; });
          if (Object.keys(data.books).some(function (id) { return listed.indexOf(id) < 0; })) touchIndex();
          save();
          return data;
        }, function () { return data; });
      },
      ready: function () { return !!data; },
      books: function () { return data ? Object.keys(data.books).map(function (id) { return data.books[id]; }).sort(function (a, b) { return a.updated < b.updated ? 1 : -1; }) : []; },
      book: function (id) { return (data && data.books[id]) || null; },
      terms: function () { return (data && data.index.terms) || null; },
      setTerms: function (t) { if (!data) return; data.index.terms = t; data.index.rev++; save(); pushIndex(); },
      /* Every change to a book goes through here: it raises rev and saves it. A book over maxBytes
         (the cloud's cap) is refused with null, and the caller tells the coach. */
      put: function (book) {
        if (!data) return null;
        if (bytesOf(book) > MAX) return null;
        book.rev = (book.rev || 0) + 1; book.updated = now();
        data.books[book.id] = book; save(); pushBook(book.id); touchIndex();
        return book;
      },
      remove: function (id) {
        if (!data || !data.books[id]) return;
        delete data.books[id]; save();
        var S = cloud(); if (S && S.drop) S.drop(GAME, 'b-' + id);
        touchIndex();
      }
    };
  }

  /* ---------- print: the page, not the play ---------- */

  var PAPER = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17], a4: [8.27, 11.69], a5: [5.83, 8.27] };
  /* cards to a page, as columns x rows on portrait paper (landscape swaps them) */
  var GRID = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 12: [3, 4], 16: [4, 4], 20: [4, 5], 24: [4, 6] };
  var FAM = '"DM Sans", Inter, Arial, sans-serif';

  function withDefaults(defaults, o) { var r = {}; for (var k in defaults) r[k] = o && o[k] !== undefined ? o[k] : defaults[k]; return r; }
  function validNum(n) { return typeof n === 'number' && n >= 1 && Math.floor(n) === n; }

  /* The plays to print, in order, each with its number, code and section.
       opt.plays      'all' | 'sections' (opt.sections) | 'chosen' (opt.chosen)
       opt.order      'book' | 'section' | 'name' | 'number' (play.num, ties in book order)
       opt.numbering  'continuous' (from startAt) | 'section' (101, 102, 201) | 'own' (play.num) | 'none'
       opt.codes      'shuffled': item.code from hooks.codesFn(book, opt), and call = code || number
     hooks.decorate(item, play) adds a game's own fields last. */
  function pick(book, opt, hooks) {
    opt = opt || {}; hooks = hooks || {};
    var secName = {}, secIdx = {};
    book.sections.forEach(function (s, i) { secName[s.id] = s.name; secIdx[s.id] = i; });
    var list = book.plays.slice();
    if (opt.plays === 'sections') list = list.filter(function (p) { return (opt.sections || []).indexOf(p.section) >= 0; });
    if (opt.plays === 'chosen') list = list.filter(function (p) { return (opt.chosen || []).indexOf(p.id) >= 0; });
    var at = function (p) { return book.plays.indexOf(p); };
    if (opt.order === 'section') list.sort(function (a, b) { return (secIdx[a.section] || 0) - (secIdx[b.section] || 0) || at(a) - at(b); });
    if (opt.order === 'name') list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    if (opt.order === 'number') list.sort(function (a, b) { return (validNum(a.num) ? a.num : 1e9) - (validNum(b.num) ? b.num : 1e9) || at(a) - at(b); });
    var codes = opt.codes === 'shuffled' && hooks.codesFn ? hooks.codesFn(book, opt) || {} : null;
    var start = opt.startAt == null ? 1 : opt.startAt | 0, n = start, perSec = {};
    return list.map(function (p, i) {
      var num = '';
      if (opt.numbering === 'own') num = validNum(p.num) ? String(p.num) : String(start + i);
      else if (opt.numbering === 'section') { var si = (secIdx[p.section] || 0) + 1; perSec[si] = (perSec[si] || 0) + 1; num = String(si * 100 + perSec[si]); }
      else if (opt.numbering !== 'none') num = String(n++);
      var code = codes ? codes[p.id] || '' : '';
      var item = { entry: p, number: num, code: code, call: code || num, section: secName[p.section] || '', sectionId: p.section };
      if (hooks.decorate) item = hooks.decorate(item, p) || item;
      return item;
    });
  }

  /* A blank page with the header drawn: { canvas, ctx, dpi, area: { x, y, w, h } }, where area is
     what is left for the plays. opt: paper, landscape, margin (inches), dpi, fontScale, title, team,
     date (true, or a string), and the book for the title's fallback. footRoom (inches, or a
     function(opt) -> inches) is kept clear at the bottom for footer(). */
  function page(opt, extra) {
    extra = extra || {};
    var size = PAPER[opt.paper] || PAPER.letter, wIn = opt.landscape ? size[1] : size[0], hIn = opt.landscape ? size[0] : size[1];
    var dpi = opt.dpi || 150, c = root.document.createElement('canvas');
    c.width = Math.round(wIn * dpi); c.height = Math.round(hIn * dpi); c.inches = [wIn, hIn];
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    var m = (opt.margin == null ? 0.4 : opt.margin) * dpi, fsc = opt.fontScale || 1;
    var book = extra.book || {};
    var title = opt.title || book.name || '', team = opt.team || book.team || '';
    var date = opt.date === true ? new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : opt.date || '';
    var y = m;
    if (title || team || date) {
      var fs = Math.round(dpi * 0.17 * fsc);
      x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left';
      x.font = '800 ' + fs + 'px ' + (extra.titleFont || FAM); x.fillText(title, m, y);
      x.textAlign = 'right'; x.font = '600 ' + Math.round(fs * 0.75) + 'px ' + FAM;
      x.fillText([team, date].filter(Boolean).join(' · '), c.width - m, y + fs * 0.15);
      y += fs + dpi * 0.08;
      x.strokeStyle = '#111'; x.lineWidth = Math.max(1, dpi / 75); x.beginPath(); x.moveTo(m, y); x.lineTo(c.width - m, y); x.stroke();
      y += dpi * 0.08;
    }
    var fr = typeof extra.footRoom === 'function' ? extra.footRoom(opt) : extra.footRoom;
    var foot = (fr == null ? (opt.pageNumbers ? 0.15 : 0) : fr) * dpi;
    return { canvas: c, ctx: x, dpi: dpi, area: { x: m, y: y, w: c.width - m * 2, h: c.height - m - foot - y } };
  }
  /* The page number at the bottom ("Page 2 of 5", or "Page 2" when total is unknown), then
     drawExtra(ctx, rect, dpi) for anything a game keeps there (a symbol key). */
  function footer(ctx, opt, n, total, drawExtra) {
    var c = ctx.canvas, dpi = opt.dpi || 150, m = (opt.margin == null ? 0.4 : opt.margin) * dpi;
    if (opt.pageNumbers) {
      ctx.save(); ctx.fillStyle = '#555'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '600 ' + Math.round(dpi * 0.1) + 'px ' + FAM;
      ctx.fillText(total ? 'Page ' + n + ' of ' + total : 'Page ' + n, c.width / 2, c.height - m * 0.4); ctx.restore();
    }
    if (drawExtra) drawExtra(ctx, { x: m, y: c.height - m, w: c.width - m * 2 }, dpi);
  }

  /* Print the pages exactly as drawn, through a hidden frame sized with @page. Returns a promise that
     settles when the dialog closes. */
  function print(canvases, opt) {
    return new Promise(function (resolve) {
      var doc = root.document;
      if (!canvases || !canvases.length) return resolve();
      var inches = canvases[0].inches || [8.5, 11];
      var f = doc.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      doc.body.appendChild(f);
      var d = f.contentDocument;
      d.open();
      d.write('<!doctype html><html><head><title>' + String((opt && opt.title) || 'Playbook').replace(/[<&]/g, '') + '</title><style>@page{size:' + inches[0] + 'in ' + inches[1] + 'in;margin:0}' +
        'html,body{margin:0;padding:0}img{display:block;width:' + inches[0] + 'in;height:' + inches[1] + 'in;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body></body></html>');
      d.close();
      var loads = canvases.map(function (cv) {
        return new Promise(function (ok) { var img = d.createElement('img'); img.onload = ok; img.onerror = ok; img.src = cv.toDataURL('image/png'); img.alt = ''; d.body.appendChild(img); });
      });
      Promise.all(loads).then(function () {
        var w = f.contentWindow, done = function () { root.setTimeout(function () { f.remove(); resolve(); }, 0); };
        w.addEventListener('afterprint', done, { once: true });
        w.focus(); w.print();
        root.setTimeout(done, 60000);
      });
    });
  }
  function download(canvas, filename) {
    return new Promise(function (resolve) {
      var doc = root.document, a = doc.createElement('a');
      a.href = canvas.toDataURL('image/png'); a.download = filename;
      doc.body.appendChild(a); a.click(); a.remove(); resolve();
    });
  }
  /* Wait for the page's fonts before drawing, so the first print is not in a fallback face. */
  function ready(fonts) {
    var F = root.document && root.document.fonts;
    if (!F || !F.load) return Promise.resolve();
    var list = fonts || ['400 14px "DM Sans"', '600 14px "DM Sans"', '700 14px "DM Sans"', '800 20px Outfit'];
    return Promise.all(list.map(function (f) { return F.load(f).catch(function () { return null; }); })).then(function () {});
  }

  /* ---------- terminology helpers ---------- */

  /* The most specific rule for an item: scoreFn(rule, item) is a number, or -1 when the rule does
     not apply. Ties go to the rule written first. */
  function bestRule(item, rules, scoreFn) {
    var best = null, bs = -1;
    (rules || []).forEach(function (r) { var s = scoreFn(r, item); if (s > bs) { bs = s; best = r; } });
    return best;
  }
  /* The order to try concepts or series in: the biggest first, ties in the order written. */
  function biggestFirst(rules, sizeFn) {
    return (rules || []).map(function (r, i) { return { r: r, i: i, s: sizeFn(r) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return x.r; });
  }

  var API = { API_VERSION: 1, newId: newId, LIMITS: LIMITS, newBook: newBook, newPlay: newPlay, statsOf: statsOf, countRun: countRun, totals: totals,
    bytesOf: bytesOf, exportFile: exportFile, importFile: importFile, downloadText: downloadText, createStore: createStore,
    PAPER: PAPER, GRID: GRID, withDefaults: withDefaults, pick: pick, page: page, footer: footer, print: print, download: download, ready: ready,
    bestRule: bestRule, biggestFirst: biggestFirst };
  if (isNode) module.exports = API;
  else root.RTG_PLAYBOOK = API;
})(typeof window !== 'undefined' ? window : globalThis);
