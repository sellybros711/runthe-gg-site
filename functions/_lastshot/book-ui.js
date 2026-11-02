/* The playbook screens. The pattern is 4th and What's book-ui.js, built for
 * Last Shot.
 *
 *   My Playbooks    the account's playbooks (sign in first), new, import a file, My terminology
 *   one playbook    sections and plays, each with a small diagram and how it has done:
 *                   reorder, move between sections, copy, delete, print or export
 *   a play          the clipboard in edit mode (client.js), with the edit bar above it:
 *                   name, section, situation, notes, frame note, Test it, Run against, Save this set
 *   Test it         every defense, RUNS times each, as a table, beside the runs you watched
 *   My terminology  the coach's words: preset, name order, set words, action words, series words
 *   Print or export every option export.js has, with a live preview
 *
 * Playbooks need a Run The Games account (the owner's call, 2026-10-30).
 * book.js keeps them; names.js names them; testit.js tests them.
 *
 *   mountBooks({ sc, show, openPlay, goHome, runAgainst, currentPlay, redraw })
 *     -> { open, back, showBook, playChanged, countRun, fillEditBar } */
import * as B from './book.js';
import * as N from './names.js';
import { DEFENSES, DEFENSE_NAMES, RUNS, testKey } from './testit.js';
import { simulate } from './sim.js';
import { IDS, emptyPlay, scenarioFor, situationKey, playKey, cleanSituation, CLOCK_MIN, CLOCK_MAX } from './playbook.js';
import { hashStr } from './rng.js';
import { drawPlay } from './diagram.js';
import * as X from './export.js';

const $ = id => document.getElementById(id);
function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'on') for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
    else if (k === 'class') e.className = attrs[k];
    else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  }
  (kids || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function select(opts, value, on, attrs) {
  const s = el('select', Object.assign({ on: { change: () => on(s.value) } }, attrs || {}));
  opts.forEach(o => { const x = el('option', { value: o[0], text: o[1] }); if (String(o[0]) === String(value)) x.selected = true; s.appendChild(x); });
  return s;
}
const pct = (w, n) => (n ? Math.round(100 * w / n) + '%' : '-');
const clone = o => JSON.parse(JSON.stringify(o));

/* Wait for the arcade's sign in to say who this is (or that it cannot). */
function whenAuth() {
  const A = window.RTG_AUTH;
  return new Promise(res => {
    if (!A || !A.boot || !A.boot()) return res(null);
    const s0 = A.state && A.state();
    if (s0 && s0.resolved) return res(s0);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(A.state ? A.state() : null); } }, 5000);
    A.onChange(s => { if (done || !s || !s.resolved) return; done = true; clearTimeout(t); res(s); });
  });
}

export function mountBooks(app) {
  const SC = app.sc;
  const root = $('vBooks');
  const store = B.createStore(() => { toast('Updated from your other device.'); rerender(); });
  let screen = 'list', bookId = null, saveTimer = 0, termsTimer = 0, previewTimer = 0, opened = false;
  let rerender = () => {};

  function toast(t) {
    const e = $('toast'); e.textContent = t; e.classList.add('on');
    clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 2400);
  }
  const terms = () => N.clean(store.terms());
  const book = () => (bookId ? store.book(bookId) : null);
  /* the saved set this play starts in, by name, if any */
  function setNameOf(bk, play) {
    const s = (bk.sets || []).find(f => IDS.every(id => f.spots[id] && Math.hypot(f.spots[id].x - play.spots[id].x, f.spots[id].y - play.spots[id].y) < 0.6));
    return s ? s.name : null;
  }
  const suggestFor = (bk, entry) => N.suggest(scenarioFor(SC, entry.situation), entry.play, terms(), { setName: setNameOf(bk, entry.play) || undefined });
  function rename(bk) {
    let changed = false;
    for (const e of bk.plays) if (!e.nameEdited) { const n = suggestFor(bk, e).name; if (n !== e.name) { e.name = n; changed = true; } }
    return changed;
  }
  function put(bk) {
    if (!store.put(bk)) toast('This playbook is full. Start a second one.');
  }
  function saveSoon(bk) { clearTimeout(saveTimer); saveTimer = setTimeout(() => put(bk), 350); }

  /* ---------- My Playbooks ---------- */
  async function open() {
    app.show('vBooks'); screen = 'list'; bookId = null;
    root.innerHTML = ''; root.appendChild(el('p', { class: 'muted', text: 'Opening your playbooks.' }));
    if (!opened) {
      const who = await whenAuth();
      if (who && who.signedIn) { await store.open(); opened = true; }
    }
    renderList();
  }
  function renderList() {
    screen = 'list'; rerender = renderList;
    root.innerHTML = '';
    root.appendChild(el('h2', { text: 'My Playbooks' }));
    if (!store.ready()) {
      root.appendChild(el('p', { text: 'Playbooks live on your Run The Games account. Sign in to keep them.' }));
      root.appendChild(el('a', { class: 'btn go', href: '/arcade/', id: 'pbSignIn', text: 'Sign in at the Arcade' }));
      root.appendChild(el('p', { class: 'muted', text: 'Nothing is kept while you are signed out.' }));
      return;
    }
    const list = el('div', { class: 'blist', id: 'pbList' });
    const all = store.books();
    if (!all.length) list.appendChild(el('p', { class: 'muted', text: 'No playbooks yet. Start one.' }));
    for (const b of all) {
      list.appendChild(el('button', { class: 'bitem', on: { click: () => showBook(b.id) } }, [
        el('b', { text: b.name }), el('small', { text: b.plays.length + (b.plays.length === 1 ? ' play' : ' plays') + (b.team ? ' · ' + b.team : '') })]));
    }
    root.appendChild(list);
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'pbImportFile', on: { change: () => importFrom(file) } });
    root.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn go', id: 'pbNew', text: 'New playbook', on: { click: () => { const b = B.newBook('My playbook'); put(b); showBook(b.id); } } }),
      el('button', { class: 'btn alt', id: 'pbImport', text: 'Import a file', on: { click: () => file.click() } }), file]));
    root.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn alt', id: 'pbTerms', text: 'My terminology', on: { click: renderTerms } })]));
  }
  function importFrom(input) {
    const f = input.files && input.files[0]; if (!f) return;
    f.text().then(text => {
      const r = B.importFile(text);
      put(r.book);
      if (r.terms && confirm('Use the terminology in this file too?')) store.setTerms(N.clean(r.terms));
      toast('Imported ' + r.book.name + '.');
      showBook(r.book.id);
    }).catch(e => toast(e.message || 'That file did not open.'));
  }

  /* ---------- one playbook ---------- */
  function showBook(id) {
    bookId = id; app.show('vBooks'); renderBook();
  }
  function renderBook() {
    const bk = book(); if (!bk) return renderList();
    screen = 'book'; rerender = renderBook;
    root.innerHTML = '';
    const name = el('input', { class: 'bname', id: 'pbName', value: bk.name, maxlength: 60, 'aria-label': 'Playbook name',
      on: { input: () => { bk.name = name.value.slice(0, 60) || 'My playbook'; saveSoon(bk); } } });
    const team = el('input', { class: 'bteam', id: 'pbTeam', value: bk.team || '', placeholder: 'Team', maxlength: 60, 'aria-label': 'Team',
      on: { input: () => { bk.team = team.value.slice(0, 60); saveSoon(bk); } } });
    root.appendChild(el('div', { class: 'bhead' }, [name, team]));
    bk.sections.forEach((sec, si) => {
      const plays = bk.plays.filter(p => p.section === sec.id);
      const head = el('div', { class: 'shead' }, [
        el('input', { class: 'sname', value: sec.name, maxlength: 40, 'aria-label': 'Section name', on: { input: e => { sec.name = e.target.value.slice(0, 40) || 'Plays'; saveSoon(bk); } } }),
        el('button', { class: 'mini', text: '▲', 'aria-label': 'Move section up', disabled: si === 0, on: { click: () => { bk.sections.splice(si - 1, 0, bk.sections.splice(si, 1)[0]); put(bk); renderBook(); } } }),
        el('button', { class: 'mini', text: '▼', 'aria-label': 'Move section down', disabled: si === bk.sections.length - 1, on: { click: () => { bk.sections.splice(si + 1, 0, bk.sections.splice(si, 1)[0]); put(bk); renderBook(); } } }),
        el('button', { class: 'mini', text: '✕', 'aria-label': 'Remove section', disabled: bk.sections.length === 1, on: { click: () => {
          if (!confirm('Remove ' + sec.name + '? Its plays move to ' + bk.sections.find(x => x !== sec).name + '.')) return;
          const to = bk.sections.find(x => x !== sec).id; bk.plays.forEach(p => { if (p.section === sec.id) p.section = to; });
          bk.sections.splice(si, 1); put(bk); renderBook(); } } })]);
      root.appendChild(head);
      const box = el('div', { class: 'plays' });
      if (!plays.length) box.appendChild(el('p', { class: 'muted', text: 'No plays here yet.' }));
      plays.forEach(e => box.appendChild(playRow(bk, e)));
      box.appendChild(el('button', { class: 'btn alt newplay', text: 'New play', on: { click: () => newPlayIn(bk, sec.id) } }));
      root.appendChild(box);
    });
    root.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn alt', id: 'pbAddSection', text: 'Add a section', on: { click: () => { bk.sections.push({ id: B.newId(), name: 'Section ' + (bk.sections.length + 1) }); put(bk); renderBook(); } } }),
      el('button', { class: 'btn go', id: 'pbExport', text: 'Print or export', on: { click: renderExport } })]));
    root.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn alt', id: 'pbFile', text: 'Playbook file', on: { click: () => downloadText(B.exportFile(bk, store.terms()), fileName(bk) + '.last-shot.json') } }),
      el('button', { class: 'btn alt danger', text: 'Delete playbook', on: { click: () => { if (confirm('Delete ' + bk.name + ' and every play in it?')) { store.remove(bk.id); renderList(); } } } })]));
  }
  function playRow(bk, e) {
    const cv = el('canvas', { class: 'thumb', width: 132, height: 124 });
    try { const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 132, 124); drawPlay(g, 0, 0, 132, 124, scenarioFor(SC, e.situation), e.play, { letters: 'numbers', stepNumbers: false, weight: 0.8 }); } catch (err) {}
    const st = e.stats[situationKey(SC, e.situation)], t = st && st.test;
    const stale = t && t.key !== testKey(SC, e.play, e.situation);
    const line = t ? DEFENSES.filter(d => t.rows[d]).map(d => DEFENSE_NAMES[d] + ' ' + pct(t.rows[d].w, t.rows[d].n)).join(' · ') + (stale ? ' · out of date' : '') : 'Not tested yet';
    const idx = bk.plays.indexOf(e);
    const same = bk.plays.filter(p => p.section === e.section);
    const pos = same.indexOf(e);
    const swap = d => { const other = same[pos + d]; if (!other) return; const j = bk.plays.indexOf(other); bk.plays[idx] = other; bk.plays[j] = e; put(bk); renderBook(); };
    return el('div', { class: 'prow', 'data-play': e.id }, [
      el('button', { class: 'popen', on: { click: () => app.openPlay(bk, e) } }, [cv, el('span', {}, [el('b', { text: e.name }), el('small', { class: stale ? 'stale' : '', text: line })])]),
      el('div', { class: 'pctl' }, [
        el('button', { class: 'mini', text: '▲', 'aria-label': 'Move up', disabled: pos === 0, on: { click: () => swap(-1) } }),
        el('button', { class: 'mini', text: '▼', 'aria-label': 'Move down', disabled: pos === same.length - 1, on: { click: () => swap(1) } }),
        bk.sections.length > 1 ? select(bk.sections.map(s => [s.id, s.name]), e.section, v => { e.section = v; put(bk); renderBook(); }, { 'aria-label': 'Section' }) : null,
        el('button', { class: 'mini', text: 'Copy', on: { click: () => { const c = clone(e); c.id = B.newId(); c.name = e.name + ' copy'; c.nameEdited = true; bk.plays.splice(idx + 1, 0, c); put(bk); renderBook(); } } }),
        el('button', { class: 'mini', text: 'Delete', on: { click: () => { if (confirm('Delete ' + e.name + '?')) { bk.plays.splice(idx, 1); put(bk); renderBook(); } } } })])]);
  }
  function newPlayIn(bk, sectionId) {
    if (bk.plays.length >= B.MAX_PLAYS) { toast('A playbook holds ' + B.MAX_PLAYS + ' plays. Start a second one.'); return; }
    const e = B.newPlay(bk, emptyPlay(SC), { section: sectionId });
    e.name = suggestFor(bk, e).name;
    bk.plays.push(e); put(bk);
    app.openPlay(bk, e);
  }

  /* ---------- the edit bar (a play on the clipboard) ---------- */
  function fillEditBar(ed) {
    const bk = ed.book, e = ed.entry, bar = $('editBar');
    bar.innerHTML = '';
    const sug = el('button', { class: 'link', id: 'pbSuggest' });
    const name = el('input', { class: 'pname', id: 'pbPlayName', value: e.name, maxlength: 80, 'aria-label': 'Play name',
      on: { input: () => { e.name = name.value.slice(0, 80) || 'New play'; e.nameEdited = true; showSug(); saveSoon(bk); } } });
    function showSug() {
      const s = suggestFor(bk, e).name;
      sug.textContent = e.nameEdited && s !== e.name ? 'Suggested: ' + s : 'Named from your words';
      sug.disabled = !(e.nameEdited && s !== e.name);
    }
    sug.addEventListener('click', () => { e.nameEdited = false; e.name = suggestFor(bk, e).name; name.value = e.name; showSug(); saveSoon(bk); });
    showSug(); ed.showSug = () => { if (!e.nameEdited) name.value = e.name; showSug(); };
    const sit = e.situation || {};
    const clock = el('input', { type: 'number', id: 'pbClock', min: CLOCK_MIN, max: CLOCK_MAX, step: 0.5, value: (sit.clock ?? SC.clock).toFixed(1), 'aria-label': 'Clock',
      on: { change: () => { e.situation = cleanSituation({ ...(e.situation || {}), clock: Number(clock.value) }); if (e.situation && e.situation.clock === SC.clock && !e.situation.handler) e.situation = null; clock.value = scenarioFor(SC, e.situation).clock.toFixed(1); afterEdit(ed); app.redraw(); } } });
    const handler = select(IDS.map(id => [id, id.slice(1) + ' has the ball']), sit.handler || SC.handler, v => {
      e.situation = cleanSituation({ ...(e.situation || {}), handler: v }); if (e.situation && e.situation.handler === SC.handler && e.situation.clock == null) e.situation = null;
      afterEdit(ed); app.redraw(); }, { id: 'pbHandler', 'aria-label': 'Who has the ball' });
    const sec = select(bk.sections.map(s => [s.id, s.name]), e.section, v => { e.section = v; saveSoon(bk); }, { 'aria-label': 'Section' });
    const notes = el('textarea', { id: 'pbNotes', rows: 2, maxlength: 500, placeholder: 'Notes for the team', 'aria-label': 'Notes', on: { input: () => { e.notes = notes.value.slice(0, 500); saveSoon(bk); } } });
    notes.value = e.notes || '';
    const fnote = el('input', { id: 'pbFrameNote', maxlength: 120, placeholder: 'Frame note (prints under the frame)', 'aria-label': 'Frame note',
      on: { input: () => { const b = beat(); e.frameNotes = e.frameNotes || {}; if (fnote.value.trim()) e.frameNotes[b] = fnote.value.slice(0, 120); else delete e.frameNotes[b]; saveSoon(bk); } } });
    ed.syncFrameNote = () => { const b = beat(); fnote.value = (e.frameNotes && e.frameNotes[b]) || ''; fnote.placeholder = 'Frame ' + b + ' note (prints under it)'; };
    ed.syncFrameNote();
    const against = select([['', 'Random defense']].concat(DEFENSES.map(d => [d, DEFENSE_NAMES[d]])), '', () => {}, { id: 'pbAgainst', 'aria-label': 'Run against' });
    const chip = el('span', { class: 'sitchip', id: 'pbSit' });
    ed.syncChip = () => { const S = scenarioFor(SC, e.situation); chip.textContent = 'Down ' + (S.them - S.us) + ' · ' + S.clock.toFixed(1) + ' · ' + S.handler.slice(1) + ' has it'; };
    ed.syncChip();
    bar.appendChild(el('div', { class: 'erow nowrap' }, [name, el('button', { class: 'btn dark tbtn', id: 'pbTest', text: 'Test it', on: { click: () => testSheet(ed) } })]));
    const more = el('details', { class: 'more', id: 'pbMore' }, [el('summary', {}, [chip, el('span', { class: 'muted', text: ' · more' })]),
      el('div', { class: 'erow small' }, [sug]),
      el('div', { class: 'erow' }, [el('label', { class: 'lab' }, ['Clock ', clock]), handler, sec]),
      el('div', { class: 'erow' }, [el('label', { class: 'lab', text: 'Run against' }), against,
        el('button', { class: 'btn alt', id: 'pbRunAgainst', text: 'Run', on: { click: () => { more.open = false; app.runAgainst(against.value || null); } } })]),
      notes, fnote,
      el('button', { class: 'btn alt', id: 'pbSaveSet', text: 'Save this set', on: { click: () => saveSet(ed) } })]);
    bar.appendChild(more);
  }
  const beat = () => (window.__lastShot && window.__lastShot.board ? window.__lastShot.board.beat : 1);
  function afterEdit(ed) {
    const e = ed.entry;
    if (!e.nameEdited) e.name = suggestFor(ed.book, e).name;
    if (ed.showSug) ed.showSug();
    if (ed.syncChip) ed.syncChip();
    saveSoon(ed.book);
  }
  function playChanged(ed, p) {
    ed.entry.play = clone(p); ed.entry.updated = new Date().toISOString();
    afterEdit(ed);
    if (ed.syncFrameNote) ed.syncFrameNote();
  }
  function saveSet(ed) {
    const nm = prompt('Name this set (where the five start).', 'My set');
    if (!nm) return;
    const bk = ed.book; bk.sets = bk.sets || [];
    bk.sets.push({ id: B.newId(), name: nm.slice(0, 30), spots: clone(ed.entry.play.spots) });
    afterEdit(ed); toast('Saved ' + nm.slice(0, 30) + '. Plays that start like this use the name.');
  }
  /* A run the coach watched counts against the scheme the sim used. */
  function countRun(ed, res) {
    if (!res || !res.scheme) return;
    B.countRun(ed.entry, situationKey(SC, ed.entry.situation), res.scheme, res.outcome === 'win');
    saveSoon(ed.book);
  }

  /* ---------- Test it ---------- */
  async function testSheet(ed) {
    const e = ed.entry, S = scenarioFor(SC, e.situation), play = app.currentPlay();
    const card = $('testCard'); $('testSheet').classList.add('on');
    card.innerHTML = '';
    card.appendChild(el('h2', { text: 'Test it' }));
    const prog = el('p', { class: 'muted', id: 'testProg', text: 'Running ' + RUNS + ' possessions against each defense.' });
    card.appendChild(prog);
    let res;
    try { res = await testAsync(S, play, n => { prog.textContent = 'Running. ' + n + ' of ' + RUNS * DEFENSES.length + ' done.'; }); }
    catch (err) { prog.textContent = 'This play cannot run yet: ' + err.message.replace('play cannot run: ', ''); addClose(card); return; }
    const key = situationKey(SC, e.situation);
    const st = e.stats[key] = e.stats[key] || {};
    st.test = { key: testKey(SC, play, e.situation), at: new Date().toISOString(), rows: res.rows, runs: res.runs };
    saveSoon(ed.book);
    prog.textContent = 'Each defense, ' + res.runs + ' possessions, from ' + S.clock.toFixed(1) + ' with ' + S.handler.slice(1) + ' on the ball.';
    const mine = st.byScheme || {};
    const tbl = el('table', { class: 'ttable', id: 'testTable' }, [el('tr', {}, [el('th', { text: 'Defense' }), el('th', { text: 'Wins' }), el('th', { text: 'Shot went up' }), el('th', { text: 'Your runs' })])]);
    for (const d of DEFENSES) {
      const r = res.rows[d], m = mine[d];
      tbl.appendChild(el('tr', { 'data-def': d }, [el('td', { text: DEFENSE_NAMES[d] }), el('td', { text: pct(r.w, r.n) }),
        el('td', { text: r.avgShotAt != null ? r.avgShotAt.toFixed(1) + ' left' : '-' }), el('td', { text: m ? m.w + ' of ' + m.n : '-' })]));
    }
    const tm = B.totals(mine);
    tbl.appendChild(el('tr', { class: 'tall' }, [el('td', { text: 'Every defense' }), el('td', { text: pct(res.all.w, res.all.n) }), el('td', { text: '' }), el('td', { text: tm.n ? tm.w + ' of ' + tm.n : '-' })]));
    card.appendChild(tbl);
    card.appendChild(el('p', { class: 'muted', text: 'Zones are coming next. Your runs count against the defense the game picked.' }));
    addClose(card);
    if (screen === 'book') renderBook();
  }
  function addClose(card) { card.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn alt', id: 'testClose', text: 'Close', on: { click: () => $('testSheet').classList.remove('on') } })])); }
  /* testit.js in chunks, so a phone stays responsive. Same seeds as testPlay. */
  async function testAsync(S, play, onProgress) {
    const base = hashStr(playKey(play)), rows = {};
    let N = 0, W = 0, done = 0;
    for (const d of DEFENSES) {
      const r = { n: 0, w: 0, made: 0, sum: 0, shots: 0 };
      for (let i = 1; i <= RUNS; i++) {
        const res = simulate(S, play, (base ^ Math.imul(i, 0x9E3779B1)) >>> 0, { scheme: d });
        r.n++; if (res.outcome === 'win') r.w++;
        if (res.shot) { r.shots++; r.sum += res.shotAt; if (res.shot.made) r.made++; }
        if (++done % 8 === 0) { onProgress(done); await new Promise(f => setTimeout(f, 0)); }
      }
      rows[d] = { n: r.n, w: r.w, made: r.made, avgShotAt: r.shots ? Math.round(r.sum / r.shots * 10) / 10 : null };
      N += r.n; W += r.w;
    }
    return { rows, all: { n: N, w: W }, runs: RUNS };
  }

  /* ---------- My terminology ---------- */
  const SAMPLE = { spots: { O1: { x: 25, y: 31 }, O2: { x: 32, y: 6.5 }, O3: { x: 18, y: 6.5 }, O4: { x: 18.5, y: 18.5 }, O5: { x: 31.5, y: 18.5 } },
    steps: [{ kind: 'screen', who: 'O5', pts: [{ x: 35, y: 10.5 }] }, { kind: 'move', who: 'O2', pts: [{ x: 33.5, y: 9 }, { x: 38, y: 14 }, { x: 43, y: 23 }] },
      { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] };
  function renderTerms() {
    if (!store.ready()) return renderList();
    screen = 'terms'; rerender = renderTerms;
    const t = terms();
    const commit = () => {
      store.setTerms(t);
      clearTimeout(termsTimer);
      termsTimer = setTimeout(() => { for (const bk of store.books()) if (rename(bk)) put(bk); }, 400);
      example.textContent = 'A pin-down for the 2 from Box reads: ' + N.suggest(SC, SAMPLE, t).name;
    };
    root.innerHTML = '';
    root.appendChild(el('h2', { text: 'My terminology' }));
    root.appendChild(el('p', { class: 'muted', text: 'Your words name every play you never named yourself. A name you type never changes.' }));
    const example = el('p', { class: 'example', id: 'termExample', text: 'A pin-down for the 2 from Box reads: ' + N.suggest(SC, SAMPLE, t).name });
    root.appendChild(example);
    root.appendChild(el('div', { class: 'erow' }, [el('label', { class: 'lab', text: 'Call players by' }),
      select([['numbers', 'Number (Pin 2)'], ['positions', 'Position (Pin SG)']], t.preset, v => { t.preset = v; commit(); }, { id: 'termPreset' })]));
    const PAT = { 'set,play': 'Set, then play (Box Pin 2)', 'set,side,play': 'Set, side, play (Box Right Pin 2)', 'play,set': 'Play, then set (Pin 2 Box)', 'play': 'Play only (Pin 2)' };
    root.appendChild(el('div', { class: 'erow' }, [el('label', { class: 'lab', text: 'Name order' }),
      select(Object.entries(PAT), t.pattern.join(','), v => { t.pattern = v.split(','); commit(); }, { id: 'termPattern' })]));
    root.appendChild(el('h3', { text: 'Set words' }));
    for (const k of N.SET_KEYS.filter(k => k !== 'other')) {
      root.appendChild(el('div', { class: 'erow' }, [el('label', { class: 'lab', text: N.SETS[k] }),
        el('input', { 'data-set': k, value: t.sets[k] || '', placeholder: N.SETS[k], maxlength: 30, on: { input: ev => { if (ev.target.value.trim()) t.sets[k] = ev.target.value.slice(0, 30); else delete t.sets[k]; commit(); } } })]));
    }
    root.appendChild(el('h3', { text: 'Action words' }));
    root.appendChild(el('p', { class: 'muted', text: 'For example: a flare for the 2 on the left is Wing.' }));
    const acts = el('div', { id: 'termActions' }); root.appendChild(acts);
    const drawActs = () => {
      acts.innerHTML = '';
      t.actions.forEach((r, i) => acts.appendChild(el('div', { class: 'rule' }, [
        select(N.ACTIONS.map(a => [a, a]), r.action, v => { r.action = v; commit(); }),
        select([['any', 'for anyone']].concat(IDS.map(id => [id, 'for ' + id.slice(1)])), r.who || 'any', v => { r.who = v; commit(); }),
        select([['any', 'either side'], ['left', 'on the left'], ['right', 'on the right']], r.side || 'any', v => { r.side = v; commit(); }),
        el('input', { value: r.word || '', placeholder: 'Your word', maxlength: 30, on: { input: ev => { r.word = ev.target.value.slice(0, 30); commit(); } } }),
        el('button', { class: 'mini', text: '✕', 'aria-label': 'Remove', on: { click: () => { t.actions.splice(i, 1); commit(); drawActs(); } } })])));
    };
    drawActs();
    root.appendChild(el('button', { class: 'btn alt', id: 'termAddAction', text: 'Add an action word', on: { click: () => { t.actions.push({ action: 'pin-down', who: 'any', side: 'any', word: '' }); drawActs(); } } }));
    root.appendChild(el('h3', { text: 'Series words' }));
    root.appendChild(el('p', { class: 'muted', text: 'A set and actions together. For example: Horns plus a pick and roll is Horns Twist.' }));
    const ser = el('div', { id: 'termSeries' }); root.appendChild(ser);
    const drawSeries = () => {
      ser.innerHTML = '';
      t.series.forEach((r, i) => {
        r.actions = r.actions || [];
        const slots = [0, 1, 2].map(k => select([['', k === 0 ? 'an action' : 'and another']].concat(N.ACTIONS.map(a => [a, a])), r.actions[k] || '', v => {
          const a = r.actions.slice(); a[k] = v; r.actions = a.filter(Boolean); commit(); }));
        ser.appendChild(el('div', { class: 'rule' }, [
          select([['any', 'any set']].concat(N.SET_KEYS.filter(k => k !== 'other').map(k => [k, N.SETS[k]])), r.set || 'any', v => { r.set = v; commit(); }), ...slots,
          el('input', { value: r.word || '', placeholder: 'Your word', maxlength: 30, on: { input: ev => { r.word = ev.target.value.slice(0, 30); commit(); } } }),
          el('button', { class: 'mini', text: '✕', 'aria-label': 'Remove', on: { click: () => { t.series.splice(i, 1); commit(); drawSeries(); } } })]));
      });
    };
    drawSeries();
    root.appendChild(el('button', { class: 'btn alt', id: 'termAddSeries', text: 'Add a series word', on: { click: () => { t.series.push({ set: 'any', actions: [], word: '' }); drawSeries(); } } }));
  }

  /* ---------- Print or export ---------- */
  function renderExport() {
    const bk = book(); if (!bk) return renderList();
    screen = 'export'; rerender = renderExport;
    bk.exportOpt = X.withDefaults(bk.exportOpt || {});
    const o = bk.exportOpt;
    if (!o.title) o.title = bk.name;
    if (!o.team) o.team = bk.team || '';
    root.innerHTML = '';
    root.appendChild(el('h2', { text: 'Print or export' }));
    const form = el('div', { class: 'xform', id: 'xForm' });
    const prev = el('div', { class: 'xprev', id: 'xPreview' });
    /* only the options that matter for the layout picked show */
    const FOR = { perPage: 'cards', frames: 'cards', framesAcross: 'cards', storyRows: 'storyboard', callColumns: 'callsheet', callThumbs: 'callsheet',
      bandW: 'wristband', bandH: 'wristband', bandCols: 'wristband', bandCopies: 'wristband', bandText: 'wristband', cutLines: 'wristband' };
    const relayout = () => form.querySelectorAll('[data-for]').forEach(n => { n.hidden = n.dataset.for.split(' ').indexOf(o.layout) < 0; });
    const set = (k, v) => { o[k] = v; saveSoon(bk); if (k === 'layout') relayout(); if (k === 'plays') { renderExport(); return; } preview(); };
    const forOf = ctrl => { const k = ctrl.dataset && ctrl.dataset.opt || (ctrl.querySelector && ctrl.querySelector('[data-opt]') && ctrl.querySelector('[data-opt]').dataset.opt); return FOR[k] || null; };
    const row = (label, ctrl) => el('div', { class: 'erow', 'data-for': forOf(ctrl) }, [el('label', { class: 'lab', text: label }), ctrl]);
    const check = (k, label) => el('label', { class: 'chk', 'data-for': FOR[k] || null }, [el('input', { type: 'checkbox', 'data-opt': k, checked: !!o[k], on: { change: ev => set(k, ev.target.checked) } }), ' ' + label]);
    const num = (k, min, max, step) => el('input', { type: 'number', 'data-opt': k, min, max, step: step || 1, value: o[k], on: { change: ev => set(k, Number(ev.target.value)) } });
    const sel = (k, opts) => select(opts, o[k], v => set(k, typeof o[k] === 'number' ? Number(v) : v === 'true' ? true : v === 'false' ? false : v), { 'data-opt': k });
    form.append(
      el('h3', { text: 'Which plays' }),
      row('Plays', sel('plays', [['all', 'Every play'], ['sections', 'Some sections'], ['chosen', 'Plays I pick']])),
      el('div', { class: 'chips' }, o.plays === 'sections' ? bk.sections.map(s => el('label', { class: 'chk' }, [el('input', { type: 'checkbox', checked: o.sections.includes(s.id), on: { change: ev => { o.sections = ev.target.checked ? o.sections.concat(s.id) : o.sections.filter(x => x !== s.id); saveSoon(bk); preview(); } } }), ' ' + s.name]))
        : o.plays === 'chosen' ? bk.plays.map(p => el('label', { class: 'chk' }, [el('input', { type: 'checkbox', checked: o.chosen.includes(p.id), on: { change: ev => { o.chosen = ev.target.checked ? o.chosen.concat(p.id) : o.chosen.filter(x => x !== p.id); saveSoon(bk); preview(); } } }), ' ' + p.name])) : []),
      row('Order', sel('order', [['book', 'Playbook order'], ['section', 'By section'], ['name', 'By name']])),
      row('Numbers', sel('numbering', [['continuous', '1, 2, 3'], ['section', 'By section (101, 201)'], ['none', 'None']])),
      row('Start at', num('startAt', 1, 999)),
      el('h3', { text: 'Layout' }),
      row('Layout', sel('layout', [['cards', 'Play cards'], ['storyboard', 'Storyboard sheet'], ['callsheet', 'Call sheet'], ['wristband', 'Wristband cards']])),
      row('Cards a page', sel('perPage', [1, 2, 4, 6, 8, 12].map(n => [n, String(n)]))),
      row('Frames on a card', sel('frames', [['row', 'Side by side'], ['grid', 'A grid'], ['one', 'One diagram']])),
      row('Frames across', sel('framesAcross', [2, 3, 4].map(n => [n, String(n)]))),
      row('Plays a sheet', sel('storyRows', [2, 3, 4, 5, 6].map(n => [n, String(n)]))),
      row('Call sheet columns', sel('callColumns', [1, 2, 3, 4].map(n => [n, String(n)]))), check('callThumbs', 'Small diagrams on the call sheet'),
      row('Wristband width (in)', num('bandW', 2, 8, 0.25)), row('Wristband height (in)', num('bandH', 1, 6, 0.25)),
      row('Wristband grid', el('span', {}, [num('bandCols', 1, 6), ' x ', num('bandRows', 1, 8)])), row('Copies', num('bandCopies', 1, 6)),
      check('bandText', 'Names only'), check('cutLines', 'Cut lines'),
      el('h3', { text: 'Paper' }),
      row('Size', sel('paper', [['letter', 'Letter'], ['legal', 'Legal'], ['tabloid', 'Tabloid'], ['a4', 'A4'], ['a5', 'A5']])),
      row('Orientation', sel('landscape', [['false', 'Portrait'], ['true', 'Landscape']])),
      row('Margin (in)', num('margin', 0, 1.5, 0.1)), row('Quality', sel('dpi', [[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']])),
      el('h3', { text: 'On each play' }),
      el('div', { class: 'chips' }, [check('showName', 'Name'), check('showNumber', 'Number'), check('showNotes', 'Notes'), check('showSection', 'Section'),
        check('showSituation', 'Situation'), check('showStats', 'Test results'), check('defense', 'Defense'), check('stepNumbers', 'Step numbers'), check('ball', 'Ball')]),
      row('Players', sel('letters', [['numbers', 'Numbers'], ['positions', 'Positions'], ['false', 'No labels']])),
      row('Frame captions', sel('captions', [['auto', 'Mine, else written for me'], ['notes', 'Only mine'], ['off', 'None']])),
      el('h3', { text: 'Look' }),
      row('Colour', sel('color', [['false', 'Black and white'], ['true', 'Colour']])),
      row('Lines', sel('weight', [[0.7, 'Thin'], [1, 'Normal'], [1.5, 'Bold']])), row('Text size', sel('fontScale', [[0.85, 'Small'], [1, 'Normal'], [1.2, 'Large']])),
      el('h3', { text: 'Header' }),
      row('Title', el('input', { value: o.title, maxlength: 60, 'data-opt': 'title', on: { input: ev => set('title', ev.target.value) } })),
      row('Team', el('input', { value: o.team, maxlength: 60, 'data-opt': 'team', on: { input: ev => set('team', ev.target.value) } })),
      el('div', { class: 'chips' }, [check('date', 'Date'), check('pageNumbers', 'Page numbers')]));
    if (o.layout === 'storyboard' || o.layout === 'cards') form.querySelectorAll('[data-opt=framesAcross]').forEach(n => { const r = n.closest('.erow'); if (r) r.dataset.for = 'cards storyboard'; });
    relayout();
    root.appendChild(form);
    root.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn go', id: 'xPrint', text: 'Print or save as PDF', on: { click: async () => { await X.ready(); X.print(X.pages(SC, bk, terms(), o), o); } } }),
      el('button', { class: 'btn alt', id: 'xPngs', text: 'Pages as images', on: { click: async () => { await X.ready(); X.pages(SC, bk, terms(), o).forEach((c, i) => X.download(c, fileName(bk) + '-page-' + (i + 1) + '.png')); } } })]));
    root.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn alt', id: 'xEach', text: 'Each play as an image', on: { click: async () => { await X.ready(); X.pick(bk, o).forEach(it => X.download(X.playPng(SC, it.entry || it, terms(), o), fileName(bk) + '-' + slug((it.entry || it).name) + '.png')); } } }),
      el('button', { class: 'btn alt', id: 'xFile', text: 'Playbook file', on: { click: () => downloadText(B.exportFile(bk, store.terms()), fileName(bk) + '.last-shot.json') } })]));
    root.appendChild(prev);
    function preview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(async () => {
        await X.ready();
        prev.innerHTML = '';
        let pages = [];
        try { pages = X.pages(SC, bk, terms(), Object.assign({}, o, { dpi: 72 })); } catch (err) { prev.appendChild(el('p', { class: 'muted', text: 'The preview did not draw.' })); return; }
        if (!pages.length) prev.appendChild(el('p', { class: 'muted', text: 'No plays to print.' }));
        pages.forEach(c => { c.className = 'xpage'; prev.appendChild(c); });
      }, 120);
    }
    preview();
  }

  const slug = s => String(s || 'play').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'play';
  const fileName = bk => slug(bk.name);
  function downloadText(text, name) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  return {
    open, showBook, fillEditBar, playChanged, countRun, store,
    /* the header arrow from a playbook screen: up one level, or false at the top */
    back() {
      if (screen === 'terms') { renderList(); return true; }
      if (screen === 'export') { renderBook(); return true; }
      if (screen === 'book') { renderList(); return true; }
      return false;
    }
  };
}
