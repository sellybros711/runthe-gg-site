/* resultstats.js - what the result screen owes you after the score.
 *
 * The end modal told you your time and offered you a button. Three things were
 * missing that a daily game should always answer, and every one of them is
 * built from data the page already has:
 *
 *   WHERE DID I COME? A number means nothing on its own. "1:14" is a good time
 *       or a bad one depending on the room, and the room is already fetched:
 *       board.js pulls your rank and the field size to draw the leaderboard.
 *       So say it. Third of forty-seven, top seven percent.
 *
 *   WHAT IS MY WEEK? A streak counter is an abstract number. Seven dots with
 *       four filled is a picture of a chain with a gap in it, and the gap is
 *       the thing that brings people back. Every game already writes
 *       rtg:<game>:done:<date> when it finishes, so the week is on disk.
 *
 *   WHAT IS NEXT? funnel.js promotes one next game as a button. That is the
 *       right primary action, but a list of two more, each with its own mark
 *       and colour, turns one finished puzzle into a session.
 *
 * Self-mounting, like resultart.js and funnel.js, and it uses the same modal
 * resolver. Everything degrades: no board, no rank line; no log, no week strip;
 * nothing left to play, no list. window.RTGResultStats.
 */
(function () {
  'use strict';

  function gameKey() { var m = (location.pathname || '').match(/\/arcade\/([a-z]+)\//); return m ? m[1] : null; }
  var GAME = gameKey();
  if (!GAME) return;

  var GAMES = [
    ['match', 'Common Ground', 'var(--blue,#2F6BFF)'],
    ['sportegories', 'Sportegories', 'var(--spg,#DA6BE6)'],
    ['crossword', 'Daily Crossword', 'var(--gray,#AAB6C4)'],
    ['rankit', 'Rank It', 'var(--pink,#F65C9C)'],
    ['guess', 'Guess the Player', 'var(--coral,#F06A5F)'],
    ['almamater', 'Alma Mater', 'var(--moss,#96B93C)'],
    ['career', 'Career Path', 'var(--green,#48D17A)'],
    ['table', 'Number Game', 'var(--gold,#F2B632)'],
    ['oddone', 'Odd One Out', 'var(--violet,#A982F3)'],
    ['highlow', 'High Low', 'var(--teal,#37C5D5)'],
    ['rollcall', 'Roll Call', 'var(--teal,#37C5D5)'],
    ['chain', 'Chain', 'var(--moss,#96B93C)']
  ];

  function findSheet() {
    return document.querySelector('#scrim .sheet') ||
           document.querySelector('#scrim .modal') ||
           document.querySelector('#resultModal .sheet') ||
           document.querySelector('#resultModal .modal');
  }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function played(key) {
    try { return !!(window.RTGTokens && RTGTokens.playsOf && RTGTokens.playsOf(key) > 0); } catch (e) { return false; }
  }
  function locked(key) {
    try { return !!(window.RTGTokens && RTGTokens.locked && RTGTokens.locked(key)); } catch (e) { return false; }
  }

  /* This calendar week, Monday first, from the completion log every game
     already writes on finish. Sunday-first would put today in a different
     column depending on the day, which defeats the point of a fixed shape. */
  function week() {
    var now = new Date(), dow = (now.getDay() + 6) % 7;        // 0 = Monday
    var monday = new Date(now); monday.setDate(now.getDate() - dow);
    var out = [], t = todayStr();
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday); d.setDate(monday.getDate() + i);
      var s = iso(d), done = false;
      try { done = !!localStorage.getItem('rtg:' + GAME + ':done:' + s); } catch (e) {}
      out.push({ d: s, done: done, today: s === t, future: s > t, lab: 'MTWTFSS'[i] });
    }
    return out;
  }

  function streakOf(w) {
    // count back from today (or yesterday, if today is not done yet)
    var n = 0, i = w.length - 1;
    while (i >= 0 && w[i].future) i--;
    if (i >= 0 && !w[i].done) i--;                             // today still open
    for (; i >= 0 && w[i].done; i--) n++;
    return n;
  }

  var styled = false;
  function styles() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.id = 'rtgrs-css';
    s.textContent = [
      '.rtgrs{margin:14px 0 0;display:flex;flex-direction:column;gap:10px;text-align:left;}',
      '.rtgrs-box{border:1px solid var(--line2,rgba(255,255,255,.14));border-radius:13px;',
      '  background:var(--card2,rgba(255,255,255,.04));padding:11px 13px;}',
      /* rank: the one line that turns a time into a placing */
      '.rtgrs-rank{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}',
      '.rtgrs-rank .p{font:900 11px var(--f,system-ui);letter-spacing:.06em;text-transform:uppercase;',
      '  color:var(--onAccent,#160B02);background:var(--goldT,#F2B632);border-radius:999px;padding:4px 9px;}',
      '.rtgrs-rank .t{font-size:12.5px;font-weight:800;color:var(--ink,#F4F7FB);}',
      '.rtgrs-rank .t b{color:var(--goldT,#F2B632);}',
      /* week: a chain with a visible gap */
      '.rtgrs-wk .hd{display:flex;align-items:baseline;gap:8px;margin:0 0 9px;}',
      '.rtgrs-wk .hd b{font:900 13px var(--f,system-ui);color:var(--goldT,#F2B632);}',
      '.rtgrs-wk .hd span{font-size:11.5px;font-weight:700;color:var(--mut,#8aa0b8);}',
      '.rtgrs-days{display:flex;justify-content:space-between;gap:4px;}',
      '.rtgrs-day{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;}',
      '.rtgrs-day i{font-style:normal;font:900 9px var(--f,system-ui);letter-spacing:.06em;color:var(--dim,#7C8DA3);}',
      '.rtgrs-day u{text-decoration:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;',
      '  border:1.5px solid var(--line2,rgba(255,255,255,.16));color:transparent;font:900 11px var(--f,system-ui);}',
      '.rtgrs-day.on u{background:var(--goldT,#F2B632);border-color:var(--goldT,#F2B632);color:var(--onAccent,#160B02);}',
      '.rtgrs-day.now u{box-shadow:0 0 0 2px color-mix(in srgb, var(--goldT,#F2B632) 45%, transparent);}',
      '.rtgrs-day.fut{opacity:.45;}',
      /* next up: one finished puzzle should hand you the next one */
      '.rtgrs-next .hd{font:900 10px var(--f,system-ui);letter-spacing:.1em;text-transform:uppercase;',
      '  color:var(--mut,#8aa0b8);margin:0 0 8px;}',
      '.rtgrs-go{display:flex;align-items:center;gap:10px;padding:7px 0;text-decoration:none;color:inherit;}',
      '.rtgrs-go + .rtgrs-go{border-top:1px solid var(--line,rgba(255,255,255,.08));}',
      '.rtgrs-go .ic{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;overflow:hidden;',
      '  background:color-mix(in srgb, var(--gc) 16%, transparent);border:1px solid color-mix(in srgb, var(--gc) 34%, transparent);}',
      '.rtgrs-go .ic svg{width:20px;height:20px;display:block;}',
      '.rtgrs-go .nm{flex:1;min-width:0;font-size:13.5px;font-weight:900;color:var(--ink,#F4F7FB);',
      '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtgrs-go .btn{flex:0 0 auto;font:900 11.5px var(--f,system-ui);letter-spacing:.04em;border-radius:999px;',
      '  padding:7px 14px;background:var(--gc);color:var(--onAccent,#160B02);}',
      '.rtgrs-go:hover .btn{filter:brightness(1.08);}',
      '@media (max-width:380px){.rtgrs-go .nm{font-size:12.5px;} .rtgrs-go .btn{padding:6px 11px;font-size:11px;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function weekHTML() {
    var w = week();
    if (!w.some(function (d) { return d.done; })) return '';    // nothing to show yet
    var n = streakOf(w);
    var msg = n >= 7 ? 'A full week. Untouchable.' :
              n >= 4 ? 'Do not drop it now.' :
              n >= 2 ? 'You are heating up.' : 'Come back tomorrow to build it.';
    return '<div class="rtgrs-box rtgrs-wk">' +
      '<div class="hd"><b>' + n + '-day streak</b><span>' + esc(msg) + '</span></div>' +
      '<div class="rtgrs-days">' + w.map(function (d) {
        return '<span class="rtgrs-day' + (d.done ? ' on' : '') + (d.today ? ' now' : '') + (d.future ? ' fut' : '') + '">' +
          '<i>' + d.lab + '</i><u>&#10003;</u></span>';
      }).join('') + '</div></div>';
  }

  function nextHTML() {
    var rows = [];
    for (var i = 0; i < GAMES.length && rows.length < 2; i++) {
      var g = GAMES[i];
      if (g[0] === GAME || played(g[0]) || locked(g[0])) continue;
      var mark = '';
      try { mark = (window.RTGGameMarks && RTGGameMarks.svg(g[0])) || ''; } catch (e) {}
      rows.push('<a class="rtgrs-go" href="/arcade/' + g[0] + '/" style="--gc:' + g[2] + '">' +
        '<span class="ic" aria-hidden="true">' + mark + '</span>' +
        '<span class="nm">' + esc(g[1]) + '</span>' +
        '<span class="btn">Solve</span></a>');
    }
    if (!rows.length) return '';
    return '<div class="rtgrs-box rtgrs-next"><div class="hd">Play another game</div>' + rows.join('') + '</div>';
  }

  /* Rank is the only part that needs the network, so it lands on its own once
     the board answers. Below five players a percentile is noise dressed up as a
     fact, so it stays a plain placing. */
  function fillRank(host) {
    var B = window.RTG_BOARD;
    if (!B || !B.myRun || !B.rank || !B.playerCount) return;
    var st = (B.state && B.state()) || {};
    if (!st.signedIn) return;
    var key = GAME, date = todayStr();
    try { if (window.RTGMode && RTGMode.boardKey) key = RTGMode.boardKey(GAME); } catch (e) {}
    try { if (window.RTGArchive && RTGArchive.active && RTGArchive.active()) return; } catch (e) {}
    B.myRun(key, date).then(function (mine) {
      if (!mine) return;
      return Promise.all([B.rank(key, date, mine.score), B.playerCount(key, date)]).then(function (r) {
        var pos = r[0], total = r[1];
        if (!pos || !total) return;
        var pct = Math.max(1, Math.round((pos / total) * 100));
        var line = '<span class="t">' + ord(pos) + ' of <b>' + total + '</b> today</span>';
        var pill = (total >= 5 && pct <= 50) ? '<span class="p">Top ' + pct + '%</span>' : '';
        host.innerHTML = '<div class="rtgrs-box rtgrs-rank">' + pill + line + '</div>';
      });
    })['catch'](function () {});
  }

  /* Where a block goes decides whether it is read.
   *
   * Placing all of this at the foot of the sheet put the two things worth
   * seeing, your placing and your week, below the buttons, which is below the
   * fold on a phone and after the player has already decided what to do next.
   * So they go ABOVE the first action instead, and only the next-game list
   * stays at the bottom where a list of onward links belongs. */
  function isDismiss(b) {
    var cls = (b.className || '').toString().toLowerCase();
    if (/(^|\s)(x|close|dismiss)(\s|$)/.test(cls)) return true;
    var lab = (b.getAttribute('aria-label') || '').toLowerCase();
    if (lab.indexOf('close') >= 0 || lab.indexOf('dismiss') >= 0) return true;
    var t = (b.textContent || '').trim();
    return t === '\u2715' || t === '\u00d7' || t === '\u2716' || t === 'X';
  }

  function firstActionBlock(sheet) {
    /* Skip anything inside the share card. resultart.js puts that card at the
       very top and it carries its own Share button, so treating it as the first
       action wedged these blocks between the card and the headline, splitting
       the result in half. The first REAL action is the one below the score. */
    var all = sheet.querySelectorAll('button, a[class*="btn"], a[class*="cta"]');
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      if (b.closest && (b.closest('.rtgart') || b.closest('.rtgrs'))) continue;
      /* The modal's own close control is a button and sits near the top, so it
         was winning this race and dragging these blocks up above the headline.
         A dismiss control is not the screen's action. */
      if (isDismiss(b)) continue;
      /* Anchor at sheet level: walk up to the direct child of the sheet that
         holds this button, and insert before that. Anchoring to the button
         itself dropped these blocks inside the "Play again" wrapper. */
      var el = b;
      while (el && el.parentNode !== sheet) el = el.parentNode;
      if (el) return el;
      continue;
    }
    return null;
  }

  var lastKey = '';
  function decorate() {
    var sheet = findSheet(); if (!sheet) return;
    var sig = GAME + '|' + todayStr() + '|' + (sheet.textContent || '').length;
    var top = sheet.querySelector('.rtgrs:not(.rtgrs-foot)');
    var fresh = !top || lastKey !== sig;
    styles();
    if (!top) {
      top = document.createElement('div');
      top.className = 'rtgrs';
      sheet.appendChild(top);
    }
    /* Re-anchor every time, not just on creation. The first decorate can run
       while the modal is still empty, and resultart.js prepends its card a beat
       later, so a position chosen once ends up wrong: these blocks were landing
       between the share card and the headline, cutting the result in half.
       insertBefore MOVES an existing node, so this settles as the sheet fills. */
    /* Placement is checked on EVERY pass, before any early return. The first
       decorate can run while the modal is still empty and resultart.js prepends
       its card a beat later, so a position chosen once is a position chosen
       wrong. insertBefore moves an existing node, so this settles as the sheet
       fills instead of freezing the first guess. */
    var anchor = firstActionBlock(sheet);
    if (anchor && anchor.parentNode === sheet && top.nextSibling !== anchor) sheet.insertBefore(top, anchor);
    if (!fresh) return;
    lastKey = sig;
    var foot = sheet.querySelector('.rtgrs-foot');
    if (!foot) {
      foot = document.createElement('div');
      foot.className = 'rtgrs rtgrs-foot';
      sheet.appendChild(foot);
    }
    top.innerHTML = '<div class="rtgrs-rankhost"></div>' + weekHTML();
    foot.innerHTML = nextHTML();
    fillRank(top.querySelector('.rtgrs-rankhost'));
  }

  function watch() {
    if (!window.MutationObserver) return;
    var scrim = document.getElementById('scrim');
    var rm = document.getElementById('resultModal');
    var check = function () {
      if (scrim && !scrim.classList.contains('hidden') && !scrim.hasAttribute('hidden')) decorate();
      if (rm && !rm.hasAttribute('hidden')) decorate();
    };
    if (scrim) new MutationObserver(check).observe(scrim, { attributes: true, attributeFilter: ['class', 'hidden'] });
    if (rm) new MutationObserver(check).observe(rm, { attributes: true, attributeFilter: ['hidden'] });
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();

  window.RTGResultStats = { refresh: decorate, week: week };
})();
