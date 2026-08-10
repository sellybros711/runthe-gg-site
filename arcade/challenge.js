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

  // ---------- the incoming challenge ----------
  var TARGET = null;
  function readTarget() {
    try {
      var q = new URLSearchParams(location.search);
      var who = (q.get('from') || '').slice(0, 24).trim();
      var mark = (q.get('m') || '').slice(0, MAXMARK).trim();
      if (!who || !mark) return null;
      return { who: who, mark: mark };
    } catch (e) { return null; }
  }

  // A mark like "12 in a row" or "4:07 · 1 hint" is free text somebody else
  // wrote, so we only ever claim a winner when both sides are plainly the same
  // shape: a leading integer followed by the same words. Anything else is shown
  // side by side and left for the player to judge.
  function unitOf(mark) {
    var m = /^(\d+)\s+(.+)$/.exec(mark);
    return m ? { n: parseInt(m[1], 10), unit: m[2].toLowerCase().replace(/s\b/g, '') } : null;
  }
  function verdict(mine) {
    if (!TARGET || !mine) return '';
    var a = unitOf(mine), b = unitOf(TARGET.mark);
    if (!a || !b || a.unit !== b.unit) return '';
    if (a.n > b.n) return 'You beat ' + TARGET.who + '.';
    if (a.n < b.n) return (b.n - a.n) + ' short of ' + TARGET.who + '.';
    return 'Dead level with ' + TARGET.who + '.';
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
  // Every game's share text ends:  <result line>\nrunthe.gg/arcade/<game>
  // Rewrite that last line into a challenge link and leave everything else -
  // the emoji grid, the header - exactly as the game wrote it.
  var LASTMARK = '';
  function decorate(txt) {
    try {
      if (typeof txt !== 'string') return txt;
      var lines = txt.split('\n');
      var i = lines.length - 1;
      while (i >= 0 && !lines[i].trim()) i--;
      if (i < 1) return txt;
      var url = lines[i].trim();
      if (!/^runthe\.gg\/arcade\/[a-z]+$/.test(url)) return txt;   // already decorated, or not our shape
      var mark = '';
      for (var j = i - 1; j >= 0; j--) {
        var t = lines[j].trim();
        // the result line is the last one carrying words, not just emoji squares
        if (t && /[A-Za-z0-9]/.test(t)) { mark = t; break; }
      }
      if (!mark) return txt;
      mark = mark.replace(/\s*·\s*best\s+\d+\s*$/i, '').slice(0, MAXMARK).trim();
      LASTMARK = mark;
      var me = myName();
      if (!me) return txt;   // an anonymous challenge has nobody to beat
      lines[i] = url + '?from=' + encodeURIComponent(me) + '&m=' + encodeURIComponent(mark);
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
  // The player's own mark, in the same words the game uses for it, so the two
  // halves of the head-to-head are comparable: "14 in a row" beside "12 in a
  // row", not a bare "14". The unit is taken from the game's own caption (the
  // <h2> under the big number, or the .rstat label) - never invented here,
  // which is also what keeps verdict() from comparing unlike things.
  function myMark(sheet) {
    var big = sheet.querySelector('#mRun');
    if (big) {
      var cap = big.nextElementSibling;
      while (cap && !/^(H2|H3)$/.test(cap.tagName)) cap = cap.nextElementSibling;
      var unit = cap ? (cap.textContent || '').trim().toLowerCase() : '';
      var n = (big.textContent || '').trim();
      return (n + (unit ? ' ' + unit : '')).slice(0, MAXMARK);
    }
    var stat = sheet.querySelector('.rstat .v');
    if (stat) {
      var lab = stat.parentNode && stat.parentNode.querySelector('.l');
      return ((stat.textContent || '').trim() + (lab ? ' ' + (lab.textContent || '').trim().toLowerCase() : '')).slice(0, MAXMARK);
    }
    return '';
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
      // the mark this player just put up is whatever their own share would say
      var mine = LASTMARK || myMark(sheet);
      var vs = document.createElement('div');
      vs.className = 'chlVs';
      vs.innerHTML = '<div><span class="k">' + esc(TARGET.who) + '</span><span class="v">' + esc(TARGET.mark) + '</span></div>' +
        '<div><span class="k">You</span><span class="v">' + esc(mine || '—') + '</span></div>';
      put(vs);
      var v = verdict(mine);
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
