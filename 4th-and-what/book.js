/* 4th and What: playbooks, kept on the player's Run The Games account.
 *
 * The owner's call (2026-10-30): a playbook needs an account. Signed out, the
 * page offers sign in and keeps nothing. Signed in, every playbook and the
 * coach's terminology live in the site's shared cloud saves
 * (assets/cloudsave.js, supabase/103_cloud_saves.sql, which signs in through
 * the arcade's RTG_AUTH on this page): game 'fourth_and_what',
 * one slot for the index (the list of playbooks and the terms) and one slot
 * per playbook. No new table.
 *
 * LOCAL FIRST, AS EVERY GAME ON THE SITE: an edit writes a copy in this
 * browser at once (under the account's id, so two accounts on one browser
 * never see each other's books) and the cloud catches up behind it. Opening
 * the page reads the copy, then the account, and the newer of the two wins.
 *
 * THE CONFLICT RULE is the shared table's: each save carries `rev`, which
 * every edit raises, and the server refuses a save older than what it holds,
 * handing back the newer copy. That copy replaces ours and the page says so.
 * Edits on two devices at once: the later-saved one wins, whole.
 *
 * A playbook:
 *   { id, name, rev, updated, team, week, sections: [{ id, name }], formations: [{ id, name, base, moved }],
 *     plays: [{ id, num, name, nameEdited, section, notes, distance, play, stats, situations, tag, fav, updated }] }
 * stats: { [distance]: { byCall: { cover1: { n, w }, ... }, test: { cover1: { n, w, yds }, ..., at } } }
 *
 *   week        the week the wristband codes are shuffled for (bandCodes). 1 to start.
 *   num         the play's own number, unique in the book. It is the number the
 *               call sheet, the QB's band and the players' bands all print. A new
 *               play takes the next one (one past the highest, so a deleted play's
 *               number is never handed to another play mid season).
 *   situations  the call sheet boxes it goes in: keys of SITUATIONS. A new play
 *               starts in the box for its distance (short, medium or long).
 *   tag         'pass', 'run', 'rpo' or 'special'. null means read it off the
 *               play (tagOf): a handoff is a run, a handoff with reads is an RPO.
 *   fav         a coach's favourite, for picking plays fast.
 * Old books get these with upgrade(book) (ensureNumbers is the numbering part).
 *
 * Plain script: window.FAW_BOOK, module.exports in node (the model only).
 */
(function (root) {
  'use strict';
  var GAME = 'fourth_and_what', INDEX = 'index', LS_PREFIX = 'faw_pb_';
  var MAX_PLAYS = 400;

  function now() { return new Date().toISOString(); }
  var idCount = 0;
  function newId() {
    var a = '', cr = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : root.crypto;
    try { var b = new Uint8Array(6); cr.getRandomValues(b); for (var i = 0; i < 6; i++) a += (b[i] % 36).toString(36); }
    catch (e) { a = (Date.now() % 2176782336).toString(36) + (idCount++).toString(36); }
    return a;
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- the model (pure) ---------- */

  function newBook(name) {
    var s = { id: newId(), name: 'Plays' };
    return { id: newId(), name: String(name || 'My playbook').slice(0, 60), rev: 1, updated: now(), team: '',
      week: 1, sections: [s], formations: [], plays: [] };
  }

  /* ---------- situations, tags, numbers and codes (pure) ---------- */

  /* The call sheet's boxes, in the order a call sheet runs. range is the
     distance a box is for, where it has one: Test it results at those distances
     are what its "if they, then we" lines read. */
  var SITUATIONS = [
    { key: 'openers', label: 'Openers' },
    { key: 'first10', label: '1st and 10', range: [10, 10] },
    { key: 'second-long', label: '2nd and long', range: [7, 99] },
    { key: 'second-short', label: '2nd and short', range: [1, 3] },
    { key: 'short', label: 'Short: 1-3', range: [1, 3] },
    { key: 'medium', label: 'Medium: 4-6', range: [4, 6] },
    { key: 'long', label: 'Long: 7+', range: [7, 99] },
    { key: 'redzone', label: 'Red zone' },
    { key: 'goalline', label: 'Goal line' },
    { key: 'twominute', label: '2 minute' },
    { key: 'backedup', label: 'Backed up' }
  ];
  var SITUATION_KEYS = SITUATIONS.map(function (s) { return s.key; });
  function situationFor(distance) { var d = +distance || 5; return d <= 3 ? 'short' : d <= 6 ? 'medium' : 'long'; }
  function situationsOf(entry) {
    var s = Array.isArray(entry.situations) ? entry.situations.filter(function (k) { return SITUATION_KEYS.indexOf(k) >= 0; }) : null;
    return s && s.length ? s : [situationFor(entry.distance)];
  }
  var TAGS = ['pass', 'run', 'rpo', 'special'];
  function tagOf(entry) {
    if (entry && TAGS.indexOf(entry.tag) >= 0) return entry.tag;
    var p = entry && entry.play ? entry.play : entry || {};
    if (p.handoff && p.handoff.to) return p.targets && p.targets.length ? 'rpo' : 'run';
    return 'pass';
  }
  function validNum(n) { return typeof n === 'number' && n >= 1 && n <= 9999 && Math.floor(n) === n; }
  function nextNum(book) {
    var hi = 0; (book.plays || []).forEach(function (p) { if (validNum(p.num) && p.num > hi) hi = p.num; });
    return hi + 1;
  }
  /* Every play gets a number, and no two share one. A play keeps its number
     unless an earlier play has it; the rest take the next ones, in book order. */
  function ensureNumbers(book) {
    var seen = {}, need = [];
    (book.plays || []).forEach(function (p) { if (validNum(p.num) && !seen[p.num]) seen[p.num] = true; else need.push(p); });
    var hi = 0; Object.keys(seen).forEach(function (k) { if (+k > hi) hi = +k; });
    need.forEach(function (p) { p.num = ++hi; });
    return book;
  }
  /* An old book brought up to date: numbers, situations, tag, fav, week. */
  function upgrade(book) {
    if (!validNum(book.week)) book.week = 1;
    ensureNumbers(book);
    (book.plays || []).forEach(function (p) {
      if (!Array.isArray(p.situations)) p.situations = [situationFor(p.distance)];
      if (p.tag === undefined || (p.tag !== null && TAGS.indexOf(p.tag) < 0)) p.tag = null;
      p.fav = !!p.fav;
    });
    return book;
  }
  function hash(str) {
    var h = 2166136261; str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /* Wristband codes shuffled by the week: { playId: '47' }. The same book and
     week give the same codes every time, a new week gives new ones, and no two
     plays share one. Two digits while the book is small enough to spread out
     (45 plays), three past that; opt.digits (2 or 3) fixes it. Worked in id
     order, so the order of the book never moves a code. */
  function bandCodes(book, opt) {
    opt = opt || {};
    var plays = (book.plays || []).slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var digits = opt.digits === 2 || opt.digits === 3 ? opt.digits : plays.length <= 45 ? 2 : 3;
    if (digits === 2 && plays.length > 90) digits = 3;
    var lo = digits === 2 ? 10 : 100, size = digits === 2 ? 90 : 900, taken = {}, out = {};
    var week = validNum(book.week) ? book.week : 1;
    plays.forEach(function (p) {
      var c = hash('wk' + week + ':' + p.id) % size;
      for (var k = 0; k < size && taken[c]; k++) c = (c + 1) % size;
      taken[c] = true; out[p.id] = String(lo + c);
    });
    return out;
  }
  function newPlay(book, play, opt) {
    opt = opt || {};
    return { id: newId(), name: String(opt.name || 'New play').slice(0, 80), nameEdited: !!opt.nameEdited,
      section: opt.section || (book.sections[0] && book.sections[0].id) || null, notes: String(opt.notes || '').slice(0, 500),
      distance: opt.distance || 5, play: copy(play), stats: {}, updated: now(),
      num: validNum(opt.num) ? opt.num : nextNum(book),
      situations: Array.isArray(opt.situations) ? opt.situations.slice() : [situationFor(opt.distance || 5)],
      tag: TAGS.indexOf(opt.tag) >= 0 ? opt.tag : null, fav: !!opt.fav };
  }
  /* Count a snap the player watched against whatever the defense rolled. */
  function countSnap(entry, distance, callKey, win) {
    var st = entry.stats[distance] = entry.stats[distance] || {};
    var b = st.byCall = st.byCall || {};
    var c = b[callKey] = b[callKey] || { n: 0, w: 0 };
    c.n++; if (win) c.w++;
  }
  function totals(byCall) {
    var n = 0, w = 0;
    for (var k in byCall) { n += byCall[k].n; w += byCall[k].w; }
    return { n: n, w: w };
  }

  /* A file a coach can keep or hand to another coach. Import gives every
     playbook, section and play a fresh id, so it never overwrites anything. */
  var FORMAT = '4th-and-what-playbook';
  function exportFile(book, terms) { return JSON.stringify({ format: FORMAT, version: 1, exported: now(), book: book, terms: terms || null }, null, 1); }
  function importFile(text) {
    var o = JSON.parse(text);
    if (!o || o.format !== FORMAT || !o.book || !Array.isArray(o.book.plays) || !Array.isArray(o.book.sections)) throw new Error('That is not a 4th and What playbook file.');
    var b = copy(o.book), map = {};
    b.id = newId(); b.rev = 1; b.updated = now();
    b.name = String(b.name || 'Imported playbook').slice(0, 60);
    b.sections = b.sections.filter(function (s) { return s && s.id; }).map(function (s) { var id = newId(); map[s.id] = id; return { id: id, name: String(s.name || 'Plays').slice(0, 40) }; });
    if (!b.sections.length) b.sections = [{ id: newId(), name: 'Plays' }];
    b.formations = (b.formations || []).filter(function (f) { return f && f.base; }).map(function (f) { return { id: newId(), name: String(f.name || 'Formation').slice(0, 30), base: f.base, moved: f.moved || {} }; });
    b.plays = b.plays.filter(function (p) { return p && p.play && p.play.formation; }).slice(0, MAX_PLAYS).map(function (p) {
      return { id: newId(), name: String(p.name || 'Play').slice(0, 80), nameEdited: !!p.nameEdited, section: map[p.section] || b.sections[0].id,
        notes: String(p.notes || '').slice(0, 500), distance: p.distance || 5, play: p.play, stats: p.stats || {}, updated: now(),
        num: p.num, situations: Array.isArray(p.situations) ? p.situations.filter(function (k) { return SITUATION_KEYS.indexOf(k) >= 0; }) : undefined,
        tag: TAGS.indexOf(p.tag) >= 0 ? p.tag : null, fav: !!p.fav };
    });
    b.team = String(b.team || '').slice(0, 60);
    upgrade(b);
    return { book: b, terms: o.terms || null };
  }

  /* ---------- the store (browser) ---------- */

  function auth() {
    var A = root.RTG_AUTH, s = A && A.state ? A.state() : null;
    return s && s.signedIn && s.userId ? s : null;
  }
  function lsKey(uid) { return LS_PREFIX + uid; }
  function readLocal(uid) { try { return JSON.parse(root.localStorage.getItem(lsKey(uid)) || 'null'); } catch (e) { return null; } }
  function writeLocal(uid, data) { try { root.localStorage.setItem(lsKey(uid), JSON.stringify(data)); } catch (e) {} }

  function createStore(onRemote) {
    var uid = null, data = null;
    function blank() { return { index: { rev: 1, books: [], terms: null }, books: {} }; }
    function save() { if (uid) writeLocal(uid, data); }
    function cloud() { return root.RTG_SAVE || null; }

    function pushIndex() {
      var S = cloud(); if (!S) return;
      S.queue(GAME, INDEX, function () { return { payload: data.index, progress: data.index.rev }; }).then(function (r) {
        if (r && r.ok === false && r.payload) { data.index = r.payload; save(); onRemote && onRemote('index'); }
      });
    }
    function pushBook(id) {
      var S = cloud(); if (!S) return;
      S.queue(GAME, 'b-' + id, function () { var b = data.books[id]; return b ? { payload: b, progress: b.rev } : null; }).then(function (r) {
        if (r && r.ok === false && r.payload) { data.books[id] = r.payload; save(); onRemote && onRemote('book', id); }
      });
    }
    function touchIndex() {
      data.index.rev++;
      data.index.books = Object.keys(data.books).map(function (id) { var b = data.books[id]; return { id: id, name: b.name, updated: b.updated, plays: b.plays.length }; })
        .sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
      save(); pushIndex();
    }

    return {
      /* Who is signed in, or null. */
      who: auth,
      /* Open the account's playbooks: the local copy at once, the cloud after. */
      open: function () {
        var a = auth(); if (!a) { uid = null; data = null; return Promise.resolve(null); }
        uid = a.userId; data = readLocal(uid) || blank();
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
          Object.keys(data.books).forEach(function (id) { if (listed.indexOf(id) < 0) listed = null; });
          if (!listed) touchIndex();
          save();
          return data;
        }, function () { return data; });
      },
      ready: function () { return !!data; },
      books: function () { return data ? Object.keys(data.books).map(function (id) { return data.books[id]; }).sort(function (a, b) { return a.updated < b.updated ? 1 : -1; }) : []; },
      book: function (id) { return data && data.books[id] || null; },
      terms: function () { return data && data.index.terms || null; },
      setTerms: function (t) { if (!data) return; data.index.terms = t; data.index.rev++; save(); pushIndex(); },
      /* Every change to a book goes through here: it raises rev and saves it. */
      put: function (book) {
        if (!data) return null;
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

  var API = { GAME: GAME, FORMAT: FORMAT, MAX_PLAYS: MAX_PLAYS, newBook: newBook, newPlay: newPlay, newId: newId,
    countSnap: countSnap, totals: totals,
    SITUATIONS: SITUATIONS, SITUATION_KEYS: SITUATION_KEYS, situationFor: situationFor, situationsOf: situationsOf, TAGS: TAGS, tagOf: tagOf,
    nextNum: nextNum, ensureNumbers: ensureNumbers, upgrade: upgrade, bandCodes: bandCodes, exportFile: exportFile, importFile: importFile, createStore: createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_BOOK = API;
})(typeof window !== 'undefined' ? window : this);
