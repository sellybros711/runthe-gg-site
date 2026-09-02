/* day.js: today, as one thing. (window.RTGDay)
 *
 * THE DAY IS THE UNIT OF THE HABIT, and nothing on the site knew what a day
 * was. The hub derived "which games are done" inline, the ticket derived it
 * again with a different filter, funnel.js derived it a third time on every
 * result screen, and the three could disagree in the corners (a free player's
 * spent trial, played today, was in one count and out of another). None of
 * them could say "what is next" or "is the day finished" in a way another
 * page could ask.
 *
 * So: one module that reads the same per-game saves the games write, and
 * answers four questions for whoever is looking.
 *
 *   state()        which games this player can open today, which are done,
 *                  one line of result each, how many of how many, and the
 *                  next one to play
 *   next(from)     the first unplayed game after `from` in hub order
 *   ring(host, o)  a progress ring, drawn once, updated in place
 *   shareDay()     the day as a card: one emoji line per game, the count, the link
 *
 * Pure reads. Nothing here writes a save or spends a play. The games keep
 * owning their own storage; this only knows the shape of it, in ONE place,
 * which is the point. When a game changes what it saves, this is the file
 * that changes with it, and scripts/check-day.mjs is what notices.
 *
 * Fail-safe: no network, synchronous, every read guarded. A missing save is
 * "not played", never a throw.
 */
(function () {
  'use strict';
  var LS = window.localStorage;
  function g(k, d) { try { var v = LS.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function J(k) { try { return JSON.parse(g(k, '{}')) || {}; } catch (e) { return {}; } }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    try { if (window.RTGTokens && RTGTokens.today) return RTGTokens.today(); } catch (e) {}
    var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  // Which day is the page ON. The archive can pin a past date, and a day card
  // for a past day is that day's card, not today's.
  function dateStr() {
    try { if (window.RTGArchive && RTGArchive.active && RTGArchive.active() && RTGArchive.date) return RTGArchive.date(); } catch (e) {}
    return todayStr();
  }
  function runLine(sv, unit) { return (sv.last && sv.last.run != null) ? (sv.last.run + ' ' + (unit || 'in a row')) : 'Played'; }

  /* Hub order. The hub's own list is the authority on order and this must
     match it; check-day.mjs asserts that it does. Each entry knows how its
     game says "done today" and what one line of result reads. These are the
     rules the hub's mark() calls used to carry inline. */
  var GAMES = [
    { key: 'sportegories', name: 'Sportegories', done: function (t) { var s = J('rtg_sportegories_v1'); return !!(s.last && s.last.d === t); },
      line: function () { var s = J('rtg_sportegories_v1'); return (s.last && s.last.score != null) ? (s.last.score + ' pts') : 'Played'; } },
    { key: 'crossword', name: 'Daily Crossword', done: function (t) { return J('rtg:cw:v1').lastDone === t; },
      line: function () { var s = J('rtg:cw:v1'); var b = s.lastTime != null ? s.lastTime : (s.last && s.last.seconds); return (b != null) ? (Math.floor(b / 60) + ':' + pad(Math.round(b % 60))) : 'Solved'; } },
    { key: 'almamater', name: 'Alma Mater', done: function (t) { return J('rtg:almamater:v1').lastDone === t; },
      line: function () { return runLine(J('rtg:almamater:v1'), 'pts'); } },
    { key: 'career', name: 'Career Path', done: function (t) { return J('rtg:career:v1').lastDone === t; },
      line: function () { return runLine(J('rtg:career:v1'), 'pts'); } },
    { key: 'match', name: 'Common Ground', done: function (t) { try { return !!JSON.parse(g('grid_match_result_' + t, 'null')); } catch (e) { return false; } },
      line: function (t) { var r = null; try { r = JSON.parse(g('grid_match_result_' + t, 'null')); } catch (e) {} return (r && r.grade) ? r.grade : 'Solved'; } },
    { key: 'rollcall', name: 'Roll Call', done: function (t) { var s = J('rtg_rollcall_v1'); return !!(s.last && s.last.d === t); },
      line: function () { var s = J('rtg_rollcall_v1'); return (s.last && s.last.score != null) ? ('Named ' + s.last.score + '/' + s.last.total) : 'Played'; } },
    { key: 'chain', name: 'Chain', done: function (t) { var s = J('rtg_chain_v1'); return !!(s.last && s.last.d === t); },
      line: function () { var s = J('rtg_chain_v1'); return (s.last && s.last.solved) ? 'Chained' : 'Played'; } },
    { key: 'rankit', name: 'Rank It', done: function (t) { return J('rtg:rankit:v2').lastDone === t; },
      line: function () { return 'Solved'; } },
    { key: 'guess', name: 'Guess the Player', done: function (t) { return J('rtg:guess:v1').lastDone === t; },
      line: function () { var s = J('rtg:guess:v1'); return (s.last && s.last.won === false) ? 'Missed' : ((s.last && s.last.tries) ? (s.last.tries + '/8') : 'Solved'); } },
    { key: 'table', name: 'Number Game', done: function (t) { return J('rtg:table:v1').lastDone === t; },
      line: function () { return runLine(J('rtg:table:v1')); } },
    { key: 'oddone', name: 'Odd One Out', done: function (t) { return J('rtg:oddone:v1').lastDone === t; },
      line: function () { return runLine(J('rtg:oddone:v1'), 'pts'); } },
    // High Low is endless, so "done" is simply having run it today.
    { key: 'highlow', name: 'High Low', done: function () { try { return !!(window.RTGTokens && RTGTokens.playsOf && RTGTokens.playsOf('highlow') > 0); } catch (e) { return false; } },
      line: function () { return runLine(J('rtg:highlow:v1')); } }
  ];

  /* Can this player open this game today? Not behind the card, OR already
     played today: a free account that spends its one try on Roll Call and
     plays it has played five games, and a ring that then reads 4 of 4 is
     lying to somebody who just did the thing it counts. */
  function available(key, done) {
    if (done) return true;
    try { return !(window.RTGTokens && RTGTokens.cardOnly && RTGTokens.cardOnly(key)); } catch (e) { return true; }
  }

  function state() {
    var t = dateStr();
    var out = [], avail = [], doneN = 0, next = null;
    for (var i = 0; i < GAMES.length; i++) {
      var G = GAMES[i], d = false, line = '';
      try { d = !!G.done(t); } catch (e) { d = false; }
      var av = available(G.key, d);
      if (d) { try { line = G.line(t); } catch (e) { line = 'Played'; } }
      out.push({ key: G.key, name: G.name, done: d, avail: av, line: line });
      if (av) { avail.push(G.key); if (d) doneN++; else if (!next) next = G.key; }
    }
    // Signed out, nothing is "available" by the token rule until you play;
    // the hub shows the four on offer, so the ring counts those.
    if (!avail.length) { avail = GAMES.slice(0, 4).map(function (x) { return x.key; }); next = avail[0]; }
    var total = avail.length;
    return { date: t, games: out, avail: avail, doneN: doneN, total: total, allDone: total > 0 && doneN >= total, next: next };
  }
  function nameOf(key) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].key === key) return GAMES[i].name; return key; }
  /* The next thing to play, AFTER the game you are on, wrapping round. Not the
     first unplayed in the list: leaving Career Path and being sent back up
     to Crossword reads as the page not knowing where you are. */
  function next(from) {
    var s = state();
    if (s.allDone) return null;
    var keys = s.avail, start = Math.max(0, keys.indexOf(from) + 1);
    var doneMap = {}; s.games.forEach(function (x) { doneMap[x.key] = x.done; });
    for (var n = 0; n < keys.length; n++) {
      var k = keys[(start + n) % keys.length];
      if (!doneMap[k] && k !== from) return k;
    }
    return null;
  }

  /* ---- the ring ---------------------------------------------------------- */
  var STYLED = false;
  function styles() {
    if (STYLED) return; STYLED = true;
    var s = document.createElement('style'); s.id = 'rtgday-style';
    s.textContent =
      '.rtgring{display:inline-grid;place-items:center;position:relative;flex:0 0 auto;}' +
      '.rtgring svg{display:block;transform:rotate(-90deg);}' +
      '.rtgring .tr{stroke:color-mix(in srgb, var(--ink,#F4F7FB) 14%, transparent);}' +
      '.rtgring .fl{stroke:var(--green,#48D17A);stroke-linecap:round;transition:stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1);}' +
      '.rtgring.full .fl{stroke:var(--gold,#F2B632);}' +
      '.rtgring .n{position:absolute;inset:0;display:grid;place-items:center;font:900 var(--rs,12px)/1 var(--f,system-ui,sans-serif);color:var(--ink,#F4F7FB);letter-spacing:-.02em;font-variant-numeric:tabular-nums;}' +
      '.rtgring.full .n{color:var(--goldT,#F2B632);}';
    (document.head || document.documentElement).appendChild(s);
  }
  /* ring(host, {n, total, size}) draws once and updates in place after that,
     so a live page can call it on every rtg:tokens without rebuilding. */
  function ring(host, o) {
    if (!host) return null;
    styles();
    o = o || {};
    var size = o.size || 44, sw = o.stroke || Math.max(3, Math.round(size / 11));
    var r = (size - sw) / 2, C = 2 * Math.PI * r;
    var n = Math.max(0, o.n | 0), total = Math.max(1, o.total | 0);
    var frac = Math.min(1, n / total);
    var el = host.querySelector('.rtgring');
    if (!el) {
      el = document.createElement('span'); el.className = 'rtgring';
      el.setAttribute('role', 'img');
      el.innerHTML =
        '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
          '<circle class="tr" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + sw + '"/>' +
          '<circle class="fl" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + sw + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"/>' +
        '</svg><span class="n"></span>';
      el.style.setProperty('--rs', Math.round(size * 0.3) + 'px');
      host.appendChild(el);
      // paint the empty ring first, then fill, so the fill animates on first draw
      requestAnimationFrame(function () { requestAnimationFrame(function () { fill(); }); });
    } else fill();
    function fill() {
      var fl = el.querySelector('.fl');
      if (fl) fl.setAttribute('stroke-dashoffset', (C * (1 - frac)).toFixed(2));
      el.classList.toggle('full', n >= total);
      el.querySelector('.n').textContent = o.label != null ? o.label : String(n);
      el.setAttribute('aria-label', n + ' of ' + total + ' played');
    }
    return el;
  }

  /* ---- the day as a card --------------------------------------------------- */
  // Puzzle number: days since the first archived day, the same count the game
  // shares carry, sourced from the archive's own launch date where it is
  // loaded and pinned here for the hub, which does not load share.js.
  var EPOCH_ISO = '2026-07-22';
  function dayNo(iso) {
    var e = EPOCH_ISO; try { if (window.RTGArchive && RTGArchive.LAUNCH) e = RTGArchive.LAUNCH; } catch (x) {}
    var t = Date.parse(iso + 'T00:00:00Z'), b = Date.parse(e + 'T00:00:00Z');
    if (isNaN(t) || isNaN(b)) return null;
    var n = Math.floor((t - b) / 86400000) + 1; return n > 0 ? n : null;
  }
  function shareText() {
    var s = state(), no = dayNo(s.date);
    var lines = ['Run The Arcade · Day' + (no ? ' #' + no : '') + ' · ' + s.doneN + '/' + s.total];
    s.games.forEach(function (x) {
      if (!x.avail) return;
      lines.push((x.done ? '✅ ' : '⬜ ') + x.name + (x.done && x.line ? ' · ' + x.line : ''));
    });
    lines.push('https://runthe.gg/arcade/');
    return lines.join('\n');
  }
  function note(msg) {
    try {
      var t = document.getElementById('rtgShareToast');
      if (!t) {
        var st = document.createElement('style');
        st.textContent = '#rtgShareToast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0));transform:translateX(-50%) translateY(8px);z-index:9800;background:var(--ink,#0d1b2c);color:var(--bg,#fff);font:800 13px/1 var(--f,system-ui,sans-serif);padding:11px 16px;border-radius:10px;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);opacity:0;transition:opacity .18s,transform .18s;pointer-events:none;max-width:80vw;text-align:center;}#rtgShareToast.on{opacity:1;transform:translateX(-50%) translateY(0);}';
        (document.head || document.documentElement).appendChild(st);
        t = document.createElement('div'); t.id = 'rtgShareToast'; t.setAttribute('role', 'status'); document.body.appendChild(t);
      }
      t.textContent = msg; requestAnimationFrame(function () { t.classList.add('on'); });
      clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
    } catch (e) {}
  }
  function shareDay() {
    var text = shareText();
    try { if (window.RTGShare && RTGShare.fire) { RTGShare.fire(text, null); return; } } catch (e) {}
    try {
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { note('Copied. Paste it anywhere'); }).catch(function () { note('Copy failed'); });
        return;
      }
    } catch (e) {}
    note('Sharing isn’t supported here');
  }

  window.RTGDay = {
    GAMES: GAMES.map(function (x) { return x.key; }),
    nameOf: nameOf,
    date: dateStr,
    state: state,
    next: next,
    ring: ring,
    dayNo: dayNo,
    shareText: shareText,
    shareDay: shareDay
  };
})();
