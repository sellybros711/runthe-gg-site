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

    var top = 320, boxH = 620;
    // Each game gets its OWN picture of how the run went - never the generic
    // Wordle squares. Daily Match draws a solve timeline; the rest dispatch to a
    // bespoke renderer below (streak motifs for the streak games, a time hero for
    // the timed ones, a dossier for Guess). All read the stat the game already
    // passes (statInt / stat), so no per-game wiring is needed. handledStat=true
    // means the art already shows the score, so we skip the generic ribbon.
    var handledStat = false;
    var tl = (spec.timeline && spec.timeline.length) ? spec.timeline : null;
    var ART = { table:artLadder, oddone:artStreak, career:artPath, almamater:artPennant,
                rankit:artRank, guess:artDossier, wordsearch:artClock, crossword:artCross,
                match:artMatch };
    if (tl) { drawTimeline(tl, spec.total, top, boxH); }
    else if (ART[spec.key]) { ART[spec.key](spec, top, boxH); handledStat = true; }
    else { drawGrid(spec, top, boxH); }

    function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    function cbig(txt, y, size, color) { g.textAlign = 'center'; g.font = '400 ' + size + 'px Anton, Impact, sans-serif'; g.fillStyle = color; g.fillText(txt, W / 2, y); }
    function clabel(txt, y, color) { g.textAlign = 'center'; g.font = '900 30px Archivo, sans-serif'; ls('.14em'); g.fillStyle = color || '#8AA0B8'; g.fillText(String(txt).toUpperCase(), W / 2, y); ls('0px'); }

    // fallback: the old emoji grid, for any key without a bespoke renderer
    function drawGrid(spec, top, boxH) {
      var rows = String(spec.grid || '').split('\n').map(emojiCells).filter(function (r) { return r.length; });
      var boxW2 = 860;
      if (!rows.length) return;
      var cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
      var gap, cell = Math.min(150, Math.floor(boxW2 / cols) - 16, Math.floor(boxH / rows.length) - 16);
      cell = Math.max(28, cell); gap = Math.max(8, Math.round(cell * 0.14));
      var gh = rows.length * cell + (rows.length - 1) * gap, oy = top + (boxH - gh) / 2;
      rows.forEach(function (r, ri) {
        var ox = (W - (r.length * cell + (r.length - 1) * gap)) / 2;
        r.forEach(function (col, ci) { g.fillStyle = col; rr(ox + ci * (cell + gap), oy + ri * (cell + gap), cell, cell, Math.round(cell * 0.2)); g.fill(); });
      });
    }

    // ---- Number Game: the run as a rising staircase of bars ----
    function artLadder(spec) {
      var run = Math.max(0, spec.statInt | 0);
      cbig(String(run), 560, 240, accent); clabel('in a row', 628);
      var n = Math.min(Math.max(run, 1), 12), bw = 46, gap = 16;
      var bx = (W - (n * bw + (n - 1) * gap)) / 2, baseY = 850, maxH = 150;
      for (var i = 0; i < n; i++) { var h = Math.round(maxH * ((i + 1) / n)); g.fillStyle = (i === n - 1 ? accent : accent + '55'); rr(bx + i * (bw + gap), baseY - h, bw, h, 9); g.fill(); }
    }
    // ---- Odd One Out: a run of correct picks, then the miss that ended it ----
    function artStreak(spec) {
      var run = Math.max(0, spec.statInt | 0);
      cbig(String(run), 560, 240, accent); clabel('in a row', 628);
      var n = Math.min(run, 8), items = n + 1, r = 30, gap = 26;
      var tw = items * (r * 2) + (items - 1) * gap, sx = (W - tw) / 2 + r, y = 800;
      for (var i = 0; i < items; i++) {
        var x = sx + i * (r * 2 + gap), miss = i === items - 1 && run >= 0;
        g.beginPath(); g.arc(x, y, r, 0, 7);
        g.fillStyle = miss ? '#E5484D' : accent; g.fill();
        g.fillStyle = '#0B1B30'; g.font = '900 30px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(miss ? '✕' : '✓', x, y + 2); g.textBaseline = 'alphabetic';
      }
    }
    // ---- Career Path: the run drawn as a journey of connected nodes ----
    function artPath(spec) {
      var run = Math.max(0, spec.statInt | 0);
      cbig(String(run), 560, 240, accent); clabel('in a row', 628);
      var n = Math.min(Math.max(run, 2), 7), bx = 150, bw = W - 300, y0 = 790, amp = 60;
      g.strokeStyle = accent; g.lineWidth = 8; g.lineJoin = 'round'; g.beginPath();
      var pts = [];
      for (var i = 0; i < n; i++) { var x = bx + (n === 1 ? bw / 2 : bw * i / (n - 1)); var y = y0 + (i % 2 ? amp : -amp); pts.push([x, y]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      pts.forEach(function (p, i) { g.beginPath(); g.arc(p[0], p[1], 17, 0, 7); g.fillStyle = '#0B1B30'; g.fill(); g.beginPath(); g.arc(p[0], p[1], 13, 0, 7); g.fillStyle = accent; g.fill(); });
    }
    // ---- Alma Mater: the run flown as a row of pennants ----
    function artPennant(spec) {
      var run = Math.max(0, spec.statInt | 0);
      cbig(String(run), 560, 240, accent); clabel('in a row', 628);
      var n = Math.min(Math.max(run, 1), 9), pw = 70, gap = 18, sx = (W - (n * pw + (n - 1) * gap)) / 2, y = 760;
      for (var i = 0; i < n; i++) { var x = sx + i * (pw + gap);
        g.fillStyle = i % 2 ? accent : accent + '99'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + pw, y); g.lineTo(x + pw, y + 70); g.lineTo(x + pw / 2, y + 50); g.lineTo(x, y + 70); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.stroke(); }
    }
    // ---- Rank It: a leaderboard-style stack of bars ----
    function artRank(spec) {
      var r = Math.max(0, spec.statInt | 0);
      cbig(String(r), 540, 220, accent); clabel('best run', 604);
      var rows = 5, bw0 = 300, step = 90, bx = W / 2 - 250, y0 = 690, bh = 40, gap = 20;
      for (var i = 0; i < rows; i++) { var w = bw0 + i * step; g.fillStyle = i === rows - 1 ? accent : accent + (i < 2 ? '44' : '77'); rr(bx, y0 + i * (bh + gap), w, bh, 12); g.fill(); }
    }
    // ---- Guess the Player: a scouting dossier - cracked in N of 8 ----
    function artDossier(spec) {
      var won = spec.statInt != null && !isNaN(spec.statInt), used = won ? (spec.statInt | 0) : 8;
      clabel('scouting report', 430);
      cbig(won ? (used + '/8') : 'MISS', 600, won ? 200 : 150, won ? accent : '#E5484D');
      clabel(won ? 'cracked it' : 'the one that got away', 668, won ? '#8AA0B8' : '#E5A5A5');
      var pips = 8, r = 26, gap = 22, tw = pips * (r * 2) + (pips - 1) * gap, sx = (W - tw) / 2 + r, y = 800;
      for (var i = 0; i < pips; i++) { var x = sx + i * (r * 2 + gap), lit = won && i < used;
        g.beginPath(); g.arc(x, y, r, 0, 7);
        if (lit) { g.fillStyle = accent; g.fill(); } else { g.fillStyle = 'rgba(255,255,255,.06)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.18)'; g.stroke(); }
      }
    }
    // ---- Word Search / Crossword: a stopwatch hero + the game's own icon feel ----
    function artClock(spec) {
      var secs = Math.max(0, spec.statInt | 0);
      var cx = W / 2, cy = 560, R = 150;
      g.lineWidth = 16; g.strokeStyle = 'rgba(255,255,255,.09)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
      g.strokeStyle = accent; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.5); g.stroke(); g.lineCap = 'butt';
      // stem + crown so it reads as a stopwatch
      g.fillStyle = accent; rr(cx - 22, cy - R - 34, 44, 22, 6); g.fill(); rr(cx - 6, cy - R - 46, 12, 16, 4); g.fill();
      cbig(fmtT(secs), cy + 22, 108, '#F4F7FB');
      clabel('to clear the board', 780);
    }
    // ---- Crossword: a mini crossword grid hero + the solve time (distinct from
    // Word Search's stopwatch so the two timed games never share a card) ----
    function artCross(spec) {
      var secs = Math.max(0, spec.statInt | 0);
      clabel('mini crossword', 420);
      var N = 5, cell = 58, gap = 8, tw = N * cell + (N - 1) * gap, sx = (W - tw) / 2, sy = 452;
      var blocks = { '0,4':1, '2,2':1, '4,0':1 };                 // classic blocked cells
      var letters = { '0,0':'R', '0,1':'T', '0,2':'G', '2,0':'G', '4,4':'G' };
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        var x = sx + c * (cell + gap), y = sy + r * (cell + gap), k = r + ',' + c;
        if (blocks[k]) { g.fillStyle = 'rgba(255,255,255,.10)'; rr(x, y, cell, cell, 9); g.fill(); continue; }
        g.fillStyle = '#F4F7FB'; rr(x, y, cell, cell, 9); g.fill();
        if (letters[k]) { g.fillStyle = '#10233A'; g.textAlign = 'center'; g.font = '400 40px Anton, Impact, sans-serif'; g.fillText(letters[k], x + cell / 2, y + cell / 2 + 15); }
      }
      cbig(fmtT(secs), 850, 96, accent); clabel('to solve', 908);
    }
    // ---- Daily Match, no-timeline case (a loss or a resumed board): groups
    // solved out of five, so the losing/partial share still gets a bespoke card
    // instead of the generic emoji grid. ----
    function artMatch(spec) {
      var m = /(\d)\s*\/\s*5/.exec(spec.stat || '');
      var solved = m ? (+m[1]) : (spec.statInt != null ? 5 : 0);
      var won = solved >= 5;
      clabel('daily match', 430);
      cbig(solved + '/5', 600, 200, won ? accent : '#E5484D');
      clabel(won ? 'board cleared' : 'groups found', 668, won ? '#8AA0B8' : '#E5A5A5');
      var n = 5, cw = 128, gap = 20, tw = n * cw + (n - 1) * gap, sx = (W - tw) / 2, y = 770, ch = 74;
      for (var i = 0; i < n; i++) {
        var x = sx + i * (cw + gap), lit = i < solved;
        if (lit) { g.fillStyle = accent; rr(x, y, cw, ch, 16); g.fill(); }
        else { g.fillStyle = 'rgba(255,255,255,.06)'; rr(x, y, cw, ch, 16); g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.18)'; rr(x, y, cw, ch, 16); g.stroke(); }
      }
    }
    function drawTimeline(items, total, top, boxH) {
      total = total || items[items.length - 1].t || 1; if (total <= 0) total = 1;
      var bx0 = 130, bx1 = W - 130, bw = bx1 - bx0, by = top + 120, th = 24;
      // track
      g.fillStyle = 'rgba(255,255,255,.09)'; rr(bx0, by - th / 2, bw, th, th / 2); g.fill();
      // progress fill up to the last group
      var lastX = bx0 + Math.min(1, items[items.length - 1].t / total) * bw;
      var fg = g.createLinearGradient(bx0, 0, lastX, 0); fg.addColorStop(0, accent + 'AA'); fg.addColorStop(1, accent);
      g.fillStyle = fg; rr(bx0, by - th / 2, Math.max(th, lastX - bx0), th, th / 2); g.fill();
      // a dot per group at its lock time (dark halo so light dots read on the bar)
      items.forEach(function (s) {
        var x = bx0 + Math.min(1, s.t / total) * bw;
        g.fillStyle = '#0B1B30'; g.beginPath(); g.arc(x, by, 34, 0, 7); g.fill();
        g.fillStyle = s.color; g.beginPath(); g.arc(x, by, 26, 0, 7); g.fill();
        g.lineWidth = 5; g.strokeStyle = '#F4F7FB'; g.beginPath(); g.arc(x, by, 26, 0, 7); g.stroke();
      });
      // end labels (a touch below the dots so they never kiss the halos)
      g.font = '800 30px Archivo, sans-serif'; g.fillStyle = '#8AA0B8';
      g.textAlign = 'left'; g.fillText('0:00', bx0, by + 78);
      g.textAlign = 'right'; g.fillText(fmtT(total), bx1, by + 78);
      g.textAlign = 'center';
      // splits list: rank · color chip · cumulative time · (+split), in solve order.
      // Vertically centered in the gap between the timeline and the stat pill so
      // the five rows breathe evenly instead of crowding the pill below.
      var lx = W / 2 - 210, listTop = by + 128, rowH = 62;
      items.forEach(function (s, i) {
        var cy = listTop + i * rowH, prev = i ? items[i - 1].t : 0;
        g.textAlign = 'left';
        g.font = '900 30px Archivo, sans-serif'; g.fillStyle = accent; g.fillText(String(i + 1), lx, cy + 38);
        g.fillStyle = s.color; rr(lx + 42, cy + 4, 46, 46, 12); g.fill();
        g.font = '400 52px Anton, Impact, sans-serif'; g.fillStyle = '#F4F7FB'; g.fillText(fmtT(s.t), lx + 116, cy + 44);
        g.font = '800 29px Archivo, sans-serif'; g.fillStyle = '#6E8298'; g.fillText('+' + fmtT(s.t - prev), lx + 296, cy + 40);
        g.textAlign = 'center';
      });
    }

    // stat ribbon - font auto-fits so a long line (a Word Search theme + time)
    // stays inside the pill and the card instead of bleeding off both edges.
    // Skipped when a bespoke renderer already shows the score (handledStat).
    var sy = top + boxH + 70, label = handledStat ? '' : stripEmoji(spec.stat);
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
          // Explicit empty title: omitting it lets some targets fall back to the
          // page's document.title ("Run The Arcade: ...") and print it as a line
          // ABOVE the text, which already opens with "Run The Arcade — <game> #N".
          // title:'' suppresses that duplicate; the text carries everything.
          navigator.share({ files: [file], text: text, title: '' })
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
