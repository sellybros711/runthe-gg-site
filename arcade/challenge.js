/* Run The Arcade - milestone share prompts + the head-to-head challenge loop.
 *
 * Two jobs, one module, no per-game wiring:
 *
 * 1. CHALLENGE. When you share a result, the runthe.gg link at the bottom of
 *    the share text is rewritten to carry who you are and what you did:
 *      runthe.gg/arcade/career?from=hoops_hana&m=12%20in%20a%20row
 *    Whoever opens that link sees a banner naming the mark they're chasing,
 *    and their own end modal shows the two results side by side. That closes
 *    the loop a bare "I got 12" never could - the receiver arrives with a
 *    target instead of a boast.
 *
 *    Interception happens at navigator.share / clipboard.writeText rather than
 *    in nine share functions, and it is strictly conservative: if the text
 *    doesn't end in a runthe.gg/arcade line it is passed through untouched.
 *
 * 2. MILESTONE. Day 3, 7, 14, 30, 50, 100... are the moments somebody is
 *    actually proud enough to post, and every game already names them in
 *    #mMilestone. What none of them do is ASK for the share. When the end
 *    modal opens on a milestone the game itself declared, the Share button
 *    gets a line and a pulse - once per milestone per game, remembered in
 *    localStorage so it never nags.
 *
 * Everything is guarded; a missing element or a hostile URL just means the
 * module does nothing. window.RTGChallenge.
 */
(function () {
  'use strict';
  var LS = window.localStorage;
  var MAXMARK = 60;   // a shared mark is one short result line, never a payload

  function gameKey() {
    var m = location.pathname.match(/\/arcade\/([a-z]+)\//);
    return m ? m[1] : null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function myName() {
    try {
      var s = window.RTGAuthUI && RTGAuthUI.state && RTGAuthUI.state();
      if (s && s.name) return s.name;
    } catch (e) {}
    return '';
  }

  // Per-game comparison: what the shared integer means, and which way is better.
  // The URL only ever carries the integer (&s=), so the unit and direction live
  // here, keyed by the game the challenge is opened ON - which is always the
  // game it was created on, since the link points at that game.
  var CH = {
    table: { unit: 'in a row', dir: 'high' },
    career: { unit: 'in a row', dir: 'high' },
    oddone: { unit: 'in a row', dir: 'high' },
    almamater: { unit: 'in a row', dir: 'high' },
    rankit: { unit: 'sets cleared', dir: 'high' },
    guess: { unit: 'guesses', dir: 'low' },
    wordsearch: { unit: '', dir: 'low', time: true },
    crossword: { unit: '', dir: 'low', time: true },
    match: { unit: '', dir: 'low', time: true }
  };
  function fmtTime(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  // The integer rendered the way its game shows it: a time for the timed games,
  // "10 in a row" / "7 sets cleared" for the counters, "3 guesses" otherwise.
  function markOf(key, n) {
    var c = CH[key] || {};
    if (c.time) return fmtTime(n);
    return n + (c.unit ? ' ' + c.unit : '');
  }

  // ---------- the incoming challenge ----------
  var TARGET = null;   // { who, n:int|null, mark:displayString }
  function readTarget() {
    try {
      var q = new URLSearchParams(location.search);
      var who = (q.get('vs') || q.get('from') || '').slice(0, 24).trim();
      if (!who) return null;
      var raw = q.get('s');
      var n = (raw != null && raw !== '') ? parseInt(raw, 10) : NaN;
      if (!isNaN(n)) return { who: who, n: n, mark: markOf(gameKey(), n) };
      var legacy = (q.get('m') || '').slice(0, MAXMARK).trim();   // pre-clean links still in the wild
      if (legacy) return { who: who, n: null, mark: legacy };
      return null;
    } catch (e) { return null; }
  }

  // The player's own comparable integer, read from the end modal: the big
  // number for the counters, the clock for the timed games.
  function mineInt(sheet) {
    var c = CH[gameKey()] || {};
    if (c.time) {
      var tm = sheet.querySelector('#mTime, #resTime');
      var t = tm ? /(\d+):(\d{2})/.exec(tm.textContent || '') : null;
      return t ? (+t[1] * 60 + +t[2]) : null;
    }
    var big = sheet.querySelector('#mRun, #mScore');
    if (big) { var v = parseInt((big.textContent || '').replace(/[^\d]/g, ''), 10); return isNaN(v) ? null : v; }
    return null;
  }
  function verdict(sheet) {
    if (!TARGET || TARGET.n == null) return '';
    var mine = mineInt(sheet);
    if (mine == null) return '';
    var dir = (CH[gameKey()] || {}).dir || 'high';
    if (mine === TARGET.n) return 'Dead level with ' + TARGET.who + '.';
    var better = dir === 'low' ? mine < TARGET.n : mine > TARGET.n;
    if (better) return 'You beat ' + TARGET.who + '!';
    var gap = Math.abs(mine - TARGET.n);
    if ((CH[gameKey()] || {}).time) return fmtTime(gap) + ' behind ' + TARGET.who + '.';
    var unit = (CH[gameKey()] || {}).unit || '';
    return gap + (unit ? ' ' + unit.replace(/s\b/, '') : '') + ' short of ' + TARGET.who + '.';
  }

  var styled = false;
  function injectCSS() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.chlBanner{display:flex;align-items:center;gap:10px;background:color-mix(in srgb,var(--gold,#F2B632) 13%,transparent);' +
        'border:1px solid color-mix(in srgb,var(--gold,#F2B632) 45%,transparent);border-radius:12px;padding:10px 13px;margin:0 0 13px;}' +
      '.chlBanner .cw{flex:1;min-width:0;font-size:12.5px;font-weight:700;color:var(--ink,#F4F7FB);line-height:1.35;}' +
      '.chlBanner .cw b{color:var(--goldT,#F2B632);}' +
      '.chlBanner .cx{flex:0 0 auto;background:none;border:0;color:var(--mut,#8aa0b8);font:900 15px/1 var(--f,system-ui);cursor:pointer;padding:4px 2px;}' +
      '.chlVs{display:flex;gap:8px;margin:12px 0 2px;}' +
      '.chlVs div{flex:1;background:var(--card2,#16233a);border:1px solid var(--line2,#22304a);border-radius:11px;padding:9px 10px;text-align:center;min-width:0;}' +
      '.chlVs .k{display:block;font-size:9.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--mut,#8aa0b8);' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.chlVs .v{display:block;font-size:14px;font-weight:900;color:var(--ink,#F4F7FB);margin-top:3px;}' +
      '.chlVerdict{text-align:center;font-size:12.5px;font-weight:900;color:var(--goldT,#F2B632);margin:9px 0 0;}' +
      '.chlMile{background:color-mix(in srgb,var(--gold,#F2B632) 16%,transparent);border:1px solid color-mix(in srgb,var(--gold,#F2B632) 50%,transparent);' +
        'border-radius:12px;padding:10px 13px;margin:12px 0 2px;text-align:center;font-size:12.5px;font-weight:800;color:var(--ink,#F4F7FB);}' +
      '.chlMile b{color:var(--goldT,#F2B632);}' +
      '.chlPulse{animation:chlpulse 1.5s ease 3;}' +
      '@keyframes chlpulse{0%,100%{transform:scale(1);}12%{transform:scale(1.045);}24%{transform:scale(1);}}' +
      '@media (prefers-reduced-motion:reduce){.chlPulse{animation:none;}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function mountBanner() {
    if (!TARGET || document.getElementById('chlBanner')) return;
    var host = document.querySelector('main.gameCol') || document.querySelector('.wrap');
    if (!host) return;
    injectCSS();
    var d = document.createElement('div');
    d.className = 'chlBanner'; d.id = 'chlBanner';
    d.innerHTML = '<span class="cw"><b>' + esc(TARGET.who) + '</b> put up <b>' + esc(TARGET.mark) +
      '</b> here. Beat it.</span><button class="cx" type="button" aria-label="Dismiss challenge">✕</button>';
    d.querySelector('.cx').onclick = function () { d.remove(); };
    // under the game title if there is one, otherwise at the very top
    var title = host.querySelector('.a-gametitle');
    if (title && title.nextSibling) host.insertBefore(d, title.nextSibling);
    else host.insertBefore(d, host.firstChild);
  }

  // ---------- the outgoing share ----------
  // Every game's card ends:  ...\nrunthe.gg/arcade/<game>
  // Rewrite that last line into a challenge link and leave the header, grid and
  // stat line exactly as the game wrote them. The mark that used to travel as
  // prose (?m=1%20in%20a%20row) is gone: RTGShare.fire stashes the one integer
  // worth comparing in window.RTGShareStat, and only that rides the URL
  // (?vs=You&s=10). The receiving page turns it back into "10 in a row" from
  // its own vocabulary, so the link stays clean no matter the game.
  function decorate(txt) {
    try {
      if (typeof txt !== 'string') return txt;
      var stat = window.RTGShareStat;
      if (stat == null || (typeof stat === 'number' && isNaN(stat))) return txt;   // nothing beatable to offer
      var me = myName();
      if (!me) return txt;   // an anonymous challenge has nobody to beat
      var lines = txt.split('\n');
      var i = lines.length - 1;
      while (i >= 0 && !lines[i].trim()) i--;
      if (i < 0) return txt;
      // Matches the canonical footer https://runthe.gg/arcade/<game>/ (and the
      // older bare/no-slash forms, so a card built before this still decorates).
      var m = /^(?:https:\/\/)?runthe\.gg\/arcade\/([a-z]+)\/?$/.exec(lines[i].trim());
      if (!m) return txt;   // already decorated, or not our footer
      lines[i] = 'https://runthe.gg/arcade/' + m[1] + '/?vs=' + encodeURIComponent(me) + '&s=' + (stat | 0);
      return lines.join('\n');
    } catch (e) { return txt; }
  }

  function hookShare() {
    try {
      if (navigator.share && !navigator.share.__rtgChl) {
        var orig = navigator.share.bind(navigator);
        var wrapped = function (data) {
          if (data && typeof data.text === 'string') data.text = decorate(data.text);
          return orig(data);
        };
        wrapped.__rtgChl = 1;
        navigator.share = wrapped;
      }
    } catch (e) {}
    try {
      var c = navigator.clipboard;
      if (c && c.writeText && !c.writeText.__rtgChl) {
        var ow = c.writeText.bind(c);
        var ww = function (t) { return ow(decorate(t)); };
        ww.__rtgChl = 1;
        c.writeText = ww;
      }
    } catch (e) {}
  }

  // ---------- the end modal ----------
  // Every game already decides for itself when a streak is worth calling out
  // and writes it into #mMilestone ("One-week streak!"). Read that rather than
  // re-deriving a milestone list here: it can't disagree with what's on screen,
  // and it can't announce a milestone the game didn't think it had earned.
  // What no game does is ASK for the share, which is what this adds.
  function milestoneNow() {
    var el = document.getElementById('mMilestone');
    var t = el ? (el.textContent || '').trim() : '';
    return t ? t.replace(/^[^\w]+/, '') : '';
  }
  // The player's own mark for the head-to-head, in the same words the target
  // carries: the comparable integer read from the modal, rendered through the
  // same markOf() the target used. So "14 in a row" sits beside "12 in a row",
  // and a timed game shows "2:41" beside "2:13" - never a bare number.
  function myMark(sheet) {
    var n = mineInt(sheet);
    if (n != null) return markOf(gameKey(), n);
    // last resort for a game with no comparable integer: the big number as-is
    var big = sheet.querySelector('#mRun, #mScore, .rstat .v');
    return big ? (big.textContent || '').trim().slice(0, MAXMARK) : '';
  }
  function mileSeen(g, n) {
    try { return LS.getItem('rtg:mile:' + g + ':' + n) === '1'; } catch (e) { return true; }
  }
  function markMile(g, n) { try { LS.setItem('rtg:mile:' + g + ':' + n, '1'); } catch (e) {} }

  function decorateModal() {
    var sheet = document.querySelector('#scrim .sheet');
    if (!sheet) return;
    injectCSS();
    var share = document.getElementById('mShare');
    if (!share) return;
    // Share sits inside a flex CTA row, so anything inserted next to it lands
    // BESIDE the buttons. Insert above that whole row instead - and fall back
    // to the button itself if it happens not to be wrapped in one.
    var row = share.parentNode;
    var host = row && row.parentNode;
    if (!host || row === sheet) { host = row; row = share; }
    var put = function (el) { host.insertBefore(el, row); };

    // head-to-head, if we arrived on somebody's challenge
    if (TARGET && !sheet.querySelector('.chlVs')) {
      var mine = myMark(sheet);
      var vs = document.createElement('div');
      vs.className = 'chlVs';
      vs.innerHTML = '<div><span class="k">' + esc(TARGET.who) + '</span><span class="v">' + esc(TARGET.mark) + '</span></div>' +
        '<div><span class="k">You</span><span class="v">' + esc(mine || '—') + '</span></div>';
      put(vs);
      var v = verdict(sheet);
      if (v) {
        var vd = document.createElement('div');
        vd.className = 'chlVerdict'; vd.textContent = v;
        put(vd);
      }
    }

    // milestone prompt - the game has already said WHAT the milestone is, so
    // this only has to ask for the share and point at the button.
    var g = gameKey(), mile = milestoneNow();
    if (g && mile && !mileSeen(g, mile) && !sheet.querySelector('.chlMile')) {
      markMile(g, mile);
      var m = document.createElement('div');
      m.className = 'chlMile';
      m.textContent = 'That one is worth telling somebody about.';
      put(m);
      share.classList.add('chlPulse');
    }
  }

  function watchModal() {
    var scrim = document.getElementById('scrim');
    if (!scrim || !window.MutationObserver) return;
    new MutationObserver(function () {
      if (!scrim.classList.contains('hidden')) decorateModal();
    }).observe(scrim, { attributes: true, attributeFilter: ['class'] });
    if (!scrim.classList.contains('hidden')) decorateModal();
  }

  function init() {
    TARGET = readTarget();
    hookShare();
    mountBanner();
    watchModal();
    window.RTGChallenge = {
      target: function () { return TARGET; },
      decorate: decorate,
      verdict: verdict
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
