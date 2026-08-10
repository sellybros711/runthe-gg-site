/* Run The Arcade - one voice for every share card (shared).
 *
 * Before this, nine games hand-built nine slightly different share strings:
 * "Run The Arcade · Number Game", "Run The Arcade Daily Match, Aug 9",
 * "Run The Arcade Daily Crossword 2026-08-10"... different separators, some
 * with a date, some without, none with the one thing that makes a daily-puzzle
 * share travel: a PUZZLE NUMBER. "#142" is what lets two people know they
 * played the same board and turns a score into a collectible.
 *
 * RTGShare gives every game the same header, the same footer, the same copy
 * feedback, and a single fire() that also hands the challenge loop a clean
 * integer to compare - so the link it stamps is runthe.gg/arcade/table?vs=You&s=10
 * instead of the old ?from=You&m=1%20in%20a%20row.
 *
 * window.RTGShare. Everything guarded; a missing piece degrades, never throws.
 */
(function () {
  'use strict';

  var NAMES = {
    table: 'Number Game', match: 'Daily Match', career: 'Career Path',
    oddone: 'Odd One Out', rankit: 'Rank It', almamater: 'Alma Mater',
    guess: 'Guess the Player', crossword: 'Daily Crossword', wordsearch: 'Word Search'
  };

  // Days since the first archived puzzle, 1-indexed, computed in UTC so it
  // can't drift by a day across time zones. The archive's earliest day is
  // puzzle #1 - the same first board an Arcade Card unlocks - so the number a
  // card shows lines up with the vault. Sourced from RTGArchive.LAUNCH (the one
  // place that date lives) with a literal fallback for pages that load us
  // without the archive module.
  var EPOCH_ISO = '2026-07-22';
  function epoch() {
    try { if (window.RTGArchive && RTGArchive.LAUNCH) return RTGArchive.LAUNCH; } catch (e) {}
    return EPOCH_ISO;
  }
  function puzzleNo(dateIso) {
    var t = dateIso ? Date.parse(dateIso + 'T00:00:00Z') : NaN;
    var e = Date.parse(epoch() + 'T00:00:00Z');
    if (isNaN(t) || isNaN(e)) return null;
    var n = Math.floor((t - e) / 86400000) + 1;
    return n > 0 ? n : null;
  }

  function name(key) { return NAMES[key] || 'Run The Arcade'; }
  // Full https:// with a trailing slash on purpose: a bare "runthe.gg/..."
  // only auto-links in some apps and rarely triggers the rich link preview,
  // and the trailing slash is the canonical page (no redirect hop before the
  // OG card unfurls). This is the tappable link that carries the whole share.
  function url(key) { return 'https://runthe.gg/arcade/' + key + '/'; }

  // "Run The Arcade — Number Game #142". The em-dash reads as brand→game; the
  // number is dropped only if the date can't be parsed (never, in practice).
  function header(key, dateIso) {
    var no = puzzleNo(dateIso);
    return 'Run The Arcade — ' + name(key) + (no ? ' #' + no : '');
  }

  // Assemble the whole card from its three parts, so the blank-line rhythm and
  // the footer are identical everywhere:
  //   Run The Arcade — Number Game #142
  //   <grid>
  //   <stat line>
  //   runthe.gg/arcade/table
  function card(key, dateIso, opts) {
    opts = opts || {};
    var parts = [header(key, dateIso)];
    if (opts.grid) parts.push(opts.grid);
    if (opts.stat) parts.push(opts.stat);
    parts.push(url(key));
    return parts.join('\n');
  }

  // Consistent copy feedback for the clipboard fallback - the toast each game
  // rolled itself said something slightly different ("Copied to clipboard",
  // "Result copied", "Copied"). One line, one style.
  function note(msg) {
    try {
      var t = document.getElementById('rtgShareToast');
      if (!t) {
        var s = document.createElement('style');
        s.textContent = '#rtgShareToast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0));' +
          'transform:translateX(-50%) translateY(8px);z-index:9800;background:var(--ink,#0d1b2c);color:var(--bg,#fff);' +
          'font:800 13px/1 var(--f,system-ui,sans-serif);padding:11px 16px;border-radius:10px;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);' +
          'opacity:0;transition:opacity .18s,transform .18s;pointer-events:none;max-width:80vw;text-align:center;}' +
          '#rtgShareToast.on{opacity:1;transform:translateX(-50%) translateY(0);}';
        (document.head || document.documentElement).appendChild(s);
        t = document.createElement('div'); t.id = 'rtgShareToast'; t.setAttribute('role', 'status');
        document.body.appendChild(t);
      }
      t.textContent = msg;
      requestAnimationFrame(function () { t.classList.add('on'); });
      clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
    } catch (e) {}
  }

  // Send the card. `stat` is the one integer the challenge loop compares (runs,
  // sets, guesses, or seconds) - null when there's nothing beatable to offer
  // (a loss, an unfinished board). It's stashed where challenge.js's share
  // interceptor reads it, so the challenge link carries a clean &s=<int> and no
  // encoded prose. The Web Share sheet is tried first (best on mobile), then
  // the clipboard with a toast, then a last-resort message.
  function fire(text, stat) {
    try { window.RTGShareStat = (stat == null || (typeof stat === 'number' && isNaN(stat))) ? null : stat; } catch (e) {}
    try {
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(function () { note('Copied — paste it anywhere'); })
          .catch(function () { note('Copy failed'); });
        return;
      }
    } catch (e) {}
    note('Sharing isn’t supported here');
  }

  // ---------- visual card ----------
  // A branded PNG so a share is an invitation, not just a wall of text. Two
  // games (Match, Crossword) already draw their own; this is the one every
  // other game shares, and it's fed the exact emoji grid the text card uses -
  // no per-game drawing code, no second source of truth.
  var ACCENT = {
    table: '#F2B632', career: '#48D17A', oddone: '#A982F3', rankit: '#EC5E9C',
    guess: '#F0653A', almamater: '#F2B632', wordsearch: '#37C5D5',
    match: '#2F6BFF', crossword: '#F0653A'
  };
  // Emoji square -> fill on the dark card. Blanks/absent squares become faint
  // panels rather than the glaring white/black they are as text.
  var SQ = {
    '🟩': '#3FB950', '🟥': '#E5484D', '🟨': '#E3B341', '🟧': '#F0883E',
    '🟦': '#4493F8', '🟪': '#A371F7', '🟫': '#B8804A',
    '⬜': '#33475E', '⬛': '#20304A'
  };
  function emojiCells(line) {
    // Grab only the colored squares; ignore any prose a grid line may carry
    // (Rank It's "2/5 in place", stray ellipses), so the picture stays clean.
    var out = [], chars = Array.from(line);
    for (var i = 0; i < chars.length; i++) if (SQ[chars[i]]) out.push(SQ[chars[i]]);
    return out;
  }
  function stripEmoji(s) {
    // Stat line for the canvas: drop every emoji/pictograph (canvas emoji
    // rendering is unreliable across platforms) but keep the middot and dashes,
    // collapse the game's newlines to one line, and upper-case for the poster
    // look. The wide ←-⯿ range catches the stopwatch (⏱ U+23F1) and
    // check (✅) the narrower ranges missed.
    return String(s || '')
      .replace(/[←-⯿\u{1F000}-\u{1FAFF}️]/gu, '')
      .replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function draw(spec) {
    var W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var accent = ACCENT[spec.key] || '#F2B632';
    function rr(x, y, w, h, rad) { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); }
    function ls(v) { try { g.letterSpacing = v; } catch (e) {} }

    // ground: brand navy with a soft accent glow top-right
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0B1B30'); bg.addColorStop(1, '#071426');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var gl = g.createRadialGradient(W - 120, 120, 0, W - 120, 120, 720);
    gl.addColorStop(0, accent + '2E'); gl.addColorStop(1, accent + '00'); g.fillStyle = gl; g.fillRect(0, 0, W, H);

    g.textAlign = 'center'; g.textBaseline = 'alphabetic';

    // wordmark + numbered game name
    g.font = '800 30px Archivo, sans-serif'; ls('8px'); g.fillStyle = '#8AA0B8';
    g.fillText('RUN THE ARCADE', W / 2, 118); ls('0px');
    g.font = '400 96px Anton, Impact, sans-serif'; g.fillStyle = '#F4F7FB';
    g.fillText(name(spec.key), W / 2, 214);
    var no = puzzleNo(spec.date);
    if (no) { g.font = '900 34px Archivo, sans-serif'; g.fillStyle = accent; g.fillText('#' + no, W / 2, 262); }

    // the grid, drawn as rounded squares and auto-fit to a comfortable box
    var rows = String(spec.grid || '').split('\n').map(emojiCells).filter(function (r) { return r.length; });
    var top = 320, boxH = 620, boxW = 860, bx0 = (W - boxW) / 2;
    if (rows.length) {
      var cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
      var gap, cell = Math.min(150, Math.floor(boxW / cols) - 16, Math.floor(boxH / rows.length) - 16);
      cell = Math.max(28, cell); gap = Math.max(8, Math.round(cell * 0.14));
      var gw = cols * cell + (cols - 1) * gap, gh = rows.length * cell + (rows.length - 1) * gap;
      var oy = top + (boxH - gh) / 2;
      rows.forEach(function (r, ri) {
        var ox = (W - (r.length * cell + (r.length - 1) * gap)) / 2;
        r.forEach(function (col, ci) {
          g.fillStyle = col; rr(ox + ci * (cell + gap), oy + ri * (cell + gap), cell, cell, Math.round(cell * 0.2)); g.fill();
        });
      });
    }

    // stat ribbon - font auto-fits so a long line (a Word Search theme + time)
    // stays inside the pill and the card instead of bleeding off both edges.
    var sy = top + boxH + 70, label = stripEmoji(spec.stat);
    if (label) {
      var maxRibbon = 960, pad = 44, maxText = maxRibbon - pad * 2, fs = 70;
      g.font = '400 ' + fs + 'px Anton, Impact, sans-serif';
      while (g.measureText(label).width > maxText && fs > 34) { fs -= 2; g.font = '400 ' + fs + 'px Anton, Impact, sans-serif'; }
      var tw = Math.min(maxText, g.measureText(label).width), rw = tw + pad * 2, rx = W / 2 - rw / 2;
      g.fillStyle = 'rgba(255,255,255,.05)'; rr(rx, sy - 62, rw, 92, 46); g.fill();
      g.strokeStyle = accent + '66'; g.lineWidth = 2; rr(rx, sy - 62, rw, 92, 46); g.stroke();
      g.fillStyle = '#F4F7FB'; g.fillText(label, W / 2, sy);
    }

    // the invite - the whole reason the picture exists
    g.font = '400 118px Anton, Impact, sans-serif'; g.fillStyle = accent;
    g.fillText('YOUR TURN', W / 2, sy + 168);
    g.font = '800 36px Archivo, sans-serif'; g.fillStyle = '#C7D4E3';
    g.fillText('Same puzzle. Can you beat it?', W / 2, sy + 224);

    // footer
    g.font = '900 40px Archivo, sans-serif'; ls('1px'); g.fillStyle = accent;
    g.fillText('runthe.gg/arcade', W / 2, H - 76); ls('0px');
    return cv;
  }

  function toBlob(cv) { return new Promise(function (res) { try { cv.toBlob(function (b) { res(b); }, 'image/png'); } catch (e) { res(null); } }); }
  function download(blob, key) {
    try {
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = 'runthe-arcade-' + key + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
    } catch (e) {}
  }

  // Share the visual card + the text (which still carries the tappable link and
  // the challenge). Web Share with the image on mobile; on desktop, save the
  // PNG and copy the text. Falls back to plain text if anything is unavailable.
  // spec: { key, date, grid, stat, statInt }
  function send(spec) {
    var text = card(spec.key, spec.date, { grid: spec.grid, stat: spec.stat });
    try { window.RTGShareStat = (spec.statInt == null || isNaN(spec.statInt)) ? null : spec.statInt; } catch (e) {}
    function go() {
      var blob = null;
      try { var cv = draw(spec); } catch (e) { cv = null; }
      (cv ? toBlob(cv) : Promise.resolve(null)).then(function (b) {
        blob = b;
        var file = (b && window.File) ? new File([b], 'runthe-arcade-' + spec.key + '.png', { type: 'image/png' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          navigator.share({ files: [file], text: text, title: 'Run The Arcade' })
            .catch(function (e) { if (e && e.name === 'AbortError') return; if (blob) { download(blob, spec.key); copyText(text); } else fire(text, spec.statInt); });
          return;
        }
        if (blob) { download(blob, spec.key); copyText(text); note('Image saved · caption copied'); return; }
        fire(text, spec.statInt);
      });
    }
    // fonts must be loaded or Anton/Archivo fall back to a system face mid-draw
    try { if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go, go); return; } } catch (e) {}
    go();
  }
  function copyText(text) { try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {}); } catch (e) {} }

  window.RTGShare = {
    NAMES: NAMES, name: name, url: url, puzzleNo: puzzleNo,
    header: header, card: card, fire: fire, send: send, draw: draw, note: note
  };
})();
