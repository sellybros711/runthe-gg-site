/* 4th and What: Print, every export export.js can make.
 *
 * Presets first (play cards, a call sheet, QB and player wristbands, scout
 * cards, a practice script, an install packet), then every option, with a
 * live preview of exactly what prints. The options are remembered per book.
 * The owner's call (2026-10-30): exporting is to be extremely customisable.
 *
 * An option shows here only if export.js has it in DEFAULTS, so the two
 * cannot drift: a new option in export.js needs a line in OPTS below to get
 * its label and its choices.
 *
 * Plain script, no exports.
 */
(function () {
  'use strict';
  var A = window.FAW_APP, X = window.FAW_EXPORT, E = window.FAW_ENGINE, B = window.FAW_BOOK;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var previewT = 0;

  /* [key, label, kind, choices | [min, max, step], showWhen(o)] */
  var CALLS = [['all', 'Every defense']].concat(E.CALL_KEYS.map(function (k) { return [k, A.CALL_LABEL[k]]; }));
  var OPTS = [
    { title: 'Which plays', rows: [
      ['plays', 'Plays', 'sel', [['all', 'Every play'], ['sections', 'Some sections'], ['chosen', 'Plays I pick']]],
      ['order', 'Order', 'sel', [['book', 'Playbook order'], ['section', 'By section'], ['name', 'By name']]],
      ['numbering', 'Numbers', 'sel', [['own', 'Each play\'s own number'], ['continuous', '1, 2, 3'], ['section', 'By section: 101, 201'], ['none', 'No numbers']]],
      ['startAt', 'Start at', 'num', [0, 999, 1], function (o) { return o.numbering === 'continuous' || o.numbering === 'section'; }]
    ] },
    { title: 'Layout', rows: [
      ['layout', 'Layout', 'sel', [['cards', 'Play cards'], ['callsheet', 'Call sheet'], ['wristband', 'Wristband cards'], ['scout', 'Scout cards'], ['script', 'Practice script'], ['install', 'Install packet']]],
      ['perPage', 'Plays a page', 'sel', null, function (o) { return o.layout === 'cards' || o.layout === 'scout'; }],
      ['backs', 'Card backs', 'sel', [['none', 'No backs'], ['below', 'Under each diagram'], ['duplex', 'On the back (two sided)']], function (o) { return o.layout === 'cards'; }],
      ['callBy', 'Call sheet by', 'sel', [['situation', 'Situation'], ['list', 'A plain list']], function (o) { return o.layout === 'callsheet'; }],
      ['callColumns', 'Columns', 'sel', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], function (o) { return o.layout === 'callsheet'; }],
      ['callThumbs', 'Small diagrams', 'chk', null, function (o) { return o.layout === 'callsheet'; }],
      ['callIfThen', 'If they, then we notes from Test it', 'chk', null, function (o) { return o.layout === 'callsheet'; }],
      ['callColors', 'Runs red, passes blue', 'chk', null, function (o) { return o.layout === 'callsheet'; }],
      ['callCodes', 'Print the shuffled codes', 'chk', null, function (o) { return o.layout === 'callsheet' && o.codes === 'shuffled'; }],
      ['bandFor', 'For', 'sel', [['', 'My settings'], ['qb', 'The QB (diagrams)'], ['player', 'Players (names only)']], function (o) { return o.layout === 'wristband'; }],
      ['bandSize', 'Wristband', 'sel', [['adult', 'Adult (4.875 x 2.75 in)'], ['youth', 'Youth (4.125 x 2.5 in)'], ['triple-large', 'Triple, large (5.5 x 3.5 in)'], ['triple-small', 'Triple, small (4 x 2.5 in)'], ['custom', 'Custom size']], function (o) { return o.layout === 'wristband'; }],
      ['bandW', 'Card width (in)', 'num', [1, 11, 0.125], function (o) { return o.layout === 'wristband' && o.bandSize === 'custom'; }],
      ['bandH', 'Card height (in)', 'num', [1, 11, 0.125], function (o) { return o.layout === 'wristband' && o.bandSize === 'custom'; }],
      ['bandCols', 'Columns', 'num', [1, 8, 1], function (o) { return o.layout === 'wristband'; }],
      ['bandRows', 'Rows', 'num', [1, 8, 1], function (o) { return o.layout === 'wristband'; }],
      ['bandCopies', 'Copies of each', 'num', [1, 10, 1], function (o) { return o.layout === 'wristband'; }],
      ['codes', 'Call numbers', 'sel', [['number', 'Play numbers'], ['shuffled', 'Shuffled codes for the week']], function (o) { return o.layout === 'wristband' || o.layout === 'callsheet'; }],
      ['bandColors', 'Coloured columns', 'colors', null, function (o) { return o.layout === 'wristband'; }],
      ['bandText', 'Names only, no diagrams', 'chk', null, function (o) { return o.layout === 'wristband' && !o.bandFor; }],
      ['bandDefense', 'The defense in each cell', 'chk', null, function (o) { return o.layout === 'wristband'; }],
      ['cutLines', 'Cut lines', 'chk', null, function (o) { return o.layout === 'wristband'; }],
      ['scoutCall', 'Scout look', 'sel', CALLS, function (o) { return o.layout === 'scout'; }],
      ['scriptReps', 'Snaps in the script (0: each play once)', 'num', [0, 200, 1], function (o) { return o.layout === 'script'; }],
      ['periods', 'Snaps a period (0: one period)', 'num', [0, 60, 1], function (o) { return o.layout === 'script'; }],
      ['scriptHash', 'Hash', 'sel', [['cycle', 'Left, middle, right'], ['L', 'Left'], ['M', 'Middle'], ['R', 'Right']], function (o) { return o.layout === 'script'; }],
      ['scriptCall', 'Against', 'sel', [['cycle', 'Every defense in turn'], ['random', 'A different one each snap'], ['none', 'No defense named']].concat(E.CALL_KEYS.map(function (k) { return [k, A.CALL_LABEL[k]]; })), function (o) { return o.layout === 'script'; }],
      ['scriptSeed', 'Shuffle number', 'num', [1, 9999, 1], function (o) { return o.layout === 'script' && o.scriptCall === 'random'; }],
      ['installTitle', 'Packet title', 'text', null, function (o) { return o.layout === 'install'; }],
      ['scriptThumbs', 'Small diagrams', 'chk', null, function (o) { return o.layout === 'script'; }]
    ] },
    { title: 'Paper', rows: [
      ['paper', 'Size', 'sel', [['letter', 'Letter'], ['legal', 'Legal'], ['tabloid', 'Tabloid'], ['a4', 'A4'], ['a5', 'A5']]],
      ['margin', 'Margin', 'sel', [[0.25, 'Narrow'], [0.4, 'Normal'], [0.6, 'Wide']]],
      ['dpi', 'Quality', 'sel', [[150, 'Standard'], [200, 'High'], [300, 'Best']]],
      ['landscape', 'Landscape', 'chk']
    ] },
    { title: 'On each play', rows: [
      ['showName', 'Play name', 'chk'], ['showNumber', 'Number', 'chk'], ['showNotes', 'Coaching points', 'chk'], ['showSection', 'Section', 'chk'],
      ['showFormation', 'Formation and distance', 'chk'], ['showStats', 'Test results', 'chk'],
      ['defense', 'The defense', 'sel', [[false, 'Not shown'], ['x', 'X\'s'], ['letters', 'Letters (E T M W C $ N F)']]],
      ['vs', 'The "vs" label', 'chk'], ['field', 'Yard lines', 'chk'], ['gain', 'Line to gain', 'chk'], ['letters', 'Player letters', 'chk'],
      ['depths', 'Route depths', 'chk'], ['routeNumbers', 'Route numbers', 'chk'], ['reads', 'The reads (1, 2, 3)', 'chk'], ['legend', 'Symbol key', 'chk']
    ] },
    { title: 'Look', rows: [
      ['color', 'Colour (off prints black and white)', 'chk'],
      ['weight', 'Lines', 'sel', [[0.7, 'Thin'], [1, 'Normal'], [1.5, 'Bold']]],
      ['fontScale', 'Text', 'sel', [[0.85, 'Small'], [1, 'Normal'], [1.2, 'Large'], [1.4, 'Extra large']]]
    ] },
    { title: 'Header', rows: [['title', 'Title', 'text'], ['team', 'Team', 'text'], ['date', 'Date', 'chk'], ['pageNumbers', 'Page numbers', 'chk']] }
  ];

  function book() {
    if (!A.signedIn() || !A.store.ready()) return null;
    var id = A.printBook || $('pBook').value, b = id ? A.store.book(id) : null;
    return b || A.store.books()[0] || null;
  }
  function opts(b) { b.exportOpt = X.withDefaults(b.exportOpt || {}); return b.exportOpt; }
  function full(b) {
    var o = A.copy(opts(b));
    o.plansFor = function (play, key, entry) {
      var sc = A.copy(A.SC); if (entry && entry.distance) { sc.distance = entry.distance; sc.ballOn = Math.max(sc.ballOn, entry.distance); }
      try { return E.plans ? E.plans(sc, play, key) : null; } catch (e) { return null; }
    };
    o.terms = A.terms();
    return o;
  }
  function render() {
    var out = $('pOpts'); out.innerHTML = ''; $('pPresets').innerHTML = ''; $('pPreview').innerHTML = '';
    if (!A.signedIn()) { out.appendChild(el('p', { class: 'help', text: 'Printing works from a playbook, and playbooks live on your Run The Games account. Sign in first.' })); return; }
    if (!A.store.ready()) { A.openStore().then(render); return; }
    var books = A.store.books();
    if (!books.length) { out.appendChild(el('p', { class: 'help', text: 'No playbooks yet. Save a play from the Studio first.' })); return; }
    var b = book(); A.fill($('pBook'), books.map(function (x) { return [x.id, x.name]; }), b.id); A.printBook = b.id;
    if (B.upgrade) B.upgrade(b);
    var o = opts(b), D = X.DEFAULTS;
    function set(k, v) { o[k] = v; A.store.put(b); schedule(); }
    /* presets */
    var P = X.PRESETS || {};
    Object.keys(P).forEach(function (name) {
      $('pPresets').appendChild(el('button', { type: 'button', text: name, on: { click: function () { b.exportOpt = X.withDefaults(Object.assign({}, o, A.copy(P[name]))); A.store.put(b); render(); } } }));
    });
    OPTS.forEach(function (g) {
      var kids = [];
      g.rows.forEach(function (r) {
        var k = r[0], label = r[1], kind = r[2], ch = r[3], when = r[4];
        if (!(k in D)) return;
        if (when && !when(o)) return;
        if (kind === 'chk') { var i = el('input', { type: 'checkbox' }); i.checked = !!o[k]; i.addEventListener('change', function () { set(k, i.checked); if (k === 'landscape') render(); }); kids.push(el('label', { class: 'chk' }, [i, label])); return; }
        if (kind === 'colors') {
          var ci = el('input', { type: 'checkbox' }); ci.checked = (o[k] || []).length > 0;
          ci.addEventListener('change', function () { set(k, ci.checked ? ['Blue', 'Red', 'Green', 'Black'].slice(0, Math.max(1, o.bandCols || 3)) : []); });
          kids.push(el('label', { class: 'chk' }, [ci, label])); return;
        }
        if (kind === 'num') { kids.push(el('label', { class: 'field' }, [el('span', { text: label }), el('input', { type: 'number', min: String(ch[0]), max: String(ch[1]), step: String(ch[2]), value: String(o[k]), on: { change: function () { var v = +this.value; if (v >= ch[0] && v <= ch[1]) set(k, v); } } })])); return; }
        if (kind === 'text') { kids.push(el('label', { class: 'field' }, [el('span', { text: label }), el('input', { maxlength: '60', value: o[k] || '', placeholder: k === 'title' ? b.name : k === 'team' ? (b.team || '') : '', on: { input: function () { set(k, this.value); } } })])); return; }
        var choices = ch || (k === 'perPage' ? Object.keys(X.GRID).map(function (n) { return [n, n]; }) : []);
        kids.push(el('label', { class: 'field' }, [el('span', { text: label }), A.select(choices.map(function (c) { return [String(c[0]), c[1]]; }), String(o[k]), function (v) {
          var val = v === 'false' ? false : v === 'true' ? true : v !== '' && !isNaN(+v) ? +v : v; set(k, val); render();
        })]));
      });
      if (g.title === 'Which plays') {
        if (o.plays === 'sections') b.sections.forEach(function (s) {
          var i = el('input', { type: 'checkbox' }); i.checked = o.sections.indexOf(s.id) >= 0;
          i.addEventListener('change', function () { o.sections = o.sections.filter(function (x) { return x !== s.id; }); if (i.checked) o.sections.push(s.id); set('sections', o.sections); });
          kids.push(el('label', { class: 'chk' }, [i, s.name]));
        });
        if (o.plays === 'chosen') b.plays.forEach(function (p) {
          var i = el('input', { type: 'checkbox' }); i.checked = o.chosen.indexOf(p.id) >= 0;
          i.addEventListener('change', function () { o.chosen = o.chosen.filter(function (x) { return x !== p.id; }); if (i.checked) o.chosen.push(p.id); set('chosen', o.chosen); });
          kids.push(el('label', { class: 'chk' }, [i, (p.num != null ? p.num + '  ' : '') + p.name]));
        });
      }
      if (kids.length) out.appendChild(el('div', { class: 'opts' }, [el('h3', { text: g.title })].concat(kids)));
    });
    schedule();
  }
  function schedule() { clearTimeout(previewT); previewT = setTimeout(preview, 200); }
  function preview() {
    var b = book(), box = $('pPreview'); if (!b) return;
    var o = full(b); o.dpi = 60;
    var pages; try { pages = X.pages(b, o); } catch (e) { box.textContent = 'This layout could not be drawn: ' + (e && e.message ? e.message : e); return; }
    box.innerHTML = '';
    var np = X.pick(b, o).length;
    box.appendChild(el('p', { class: 'help', text: np + (np === 1 ? ' play on ' : ' plays on ') + pages.length + (pages.length === 1 ? ' page.' : ' pages.') + (pages.length > 4 ? ' The first four are shown.' : '') }));
    pages.slice(0, 4).forEach(function (c) { var img = el('img', { class: 'page', alt: 'A page of the export' }); img.src = c.toDataURL('image/png'); box.appendChild(img); });
  }
  $('pBook').addEventListener('change', function () { A.printBook = this.value; render(); });
  $('pPrint').addEventListener('click', function () { var b = book(); if (b) { var o = full(b); X.print(X.pages(b, o), o); } });
  $('pPng').addEventListener('click', function () {
    var b = book(); if (!b) return;
    X.pages(b, full(b)).forEach(function (c, i) { setTimeout(function () { X.download(c, X.slug(b.name) + '-page-' + (i + 1) + '.png'); }, i * 350); });
  });
  $('pPlays').addEventListener('click', function () {
    var b = book(); if (!b) return;
    var o = full(b);
    X.pick(b, o).forEach(function (it, i) {
      setTimeout(function () {
        var c = document.createElement('canvas'); c.width = 1200; c.height = 1000;
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 1000);
        x.fillStyle = '#111'; x.font = '800 44px Inter, Arial, sans-serif'; x.textBaseline = 'top';
        x.fillText((it.number ? it.number + '  ' : '') + it.entry.name, 30, 24);
        window.FAW_DIAGRAM.draw(x, 20, 90, 1160, 890, it.entry.play, { color: o.color, defense: o.defense, distance: it.entry.distance, field: o.field, gain: o.gain, letters: o.letters, numbers: o.routeNumbers, reads: o.reads, depths: o.depths, weight: o.weight });
        X.download(c, X.slug((it.number ? it.number + ' ' : '') + it.entry.name) + '.png');
      }, i * 350);
    });
  });
  $('pFile').addEventListener('click', function () { var b = book(); if (b) X.downloadText(B.exportFile(b, A.store.terms()), X.slug(b.name) + '.4th-and-what.json'); });

  A.on('print', render);
  A.on('remote', function () { if (A.current() === 'print') render(); });
})();
