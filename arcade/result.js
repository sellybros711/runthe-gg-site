/* result.js: one result screen, everywhere. (window.RTGResult)
 *
 * Twelve games each built their own end modal, so twelve of them decided
 * separately what a result is worth saying. The stat row is the part that
 * varies most and matters most: three games print a streak and three do not,
 * eleven print a "best" that is only ever a label, and NOT ONE of them prints
 * where you came against anybody else, although the rank is one call away and
 * the leaderboard has been making it for months.
 *
 * So this owns the row under the headline number. Every game keeps its own
 * board, its own big number and its own colour; the row below it says the
 * same three things in the same order on all of them:
 *
 *    RANK     "Top 12% today", from grid_runs. The one line worth sending.
 *    BEST     a personal best as an EVENT, gold, with the old number struck
 *             through, rather than a label that reads the same on the day you
 *             set it and every day after.
 *    STREAK   this game's day streak, from the server where there is a
 *             session and the local save otherwise.
 *
 * Anything else the game already had in that row (correct, bonus, average)
 * keeps its place after those three, because it is the game talking about
 * itself and that is worth keeping.
 *
 * THE GAME'S PART OF THE CONTRACT is one object, set before the modal opens:
 *
 *    window.RTGResultSpec = { key, date, statInt, unit, best, isBest, higherBetter }
 *
 * isBest is the only thing this file cannot work out for itself: by the time a
 * modal is open the game has already written its new best to storage, so "is
 * this a best" and "was this a best" look identical from out here. The game
 * knows, because it just compared them.
 *
 * Everything is guarded and everything degrades. No spec: the row is left
 * exactly as the game built it. No session: the rank line is skipped rather
 * than faked, since a guest posts nothing and has no rank to show. Offline:
 * the chips that need the network never arrive and the rest still render.
 */
(function () {
  'use strict';

  var SPEC_KEYS = { rank: 1, best: 1, streak: 1 };
  var styled = false;
  function css() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.id = 'rtgres-style';
    s.textContent = [
      '.rtgres{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 10px;margin:10px 0 2px;}',
      '.rtgres .c{display:inline-flex;align-items:baseline;gap:5px;font-size:12.5px;font-weight:700;color:var(--mut,#8aa0b8);',
      'border:1px solid var(--line2,rgba(255,255,255,.15));border-radius:999px;padding:6px 11px;line-height:1;}',
      '.rtgres .c b{font-size:14px;font-weight:900;color:var(--ink,#F4F7FB);font-variant-numeric:tabular-nums;}',
      '.rtgres .c s{color:var(--mut,#8aa0b8);font-weight:700;text-decoration-thickness:1px;}',
      /* The rank chip is the sentence people screenshot, so it is the one
         thing in this row that is allowed to be loud. */
      '.rtgres .c.rank{border-color:color-mix(in srgb,var(--green,#48D17A) 45%,transparent);',
      'background:color-mix(in srgb,var(--green,#48D17A) 10%,transparent);color:var(--greenT,#48D17A);}',
      '.rtgres .c.rank b{color:var(--greenT,#48D17A);}',
      /* Gold is a NEW best and a milestone, and nothing else in this row. */
      '.rtgres .c.new{border-color:color-mix(in srgb,var(--gold,#F2B632) 55%,transparent);',
      'background:color-mix(in srgb,var(--gold,#F2B632) 12%,transparent);color:var(--goldT,#F2B632);}',
      '.rtgres .c.new b{color:var(--goldT,#F2B632);}',
      '@media (prefers-reduced-motion:no-preference){.rtgres .c.new{animation:rtgresPop .45s cubic-bezier(.2,.9,.3,1.4);}}',
      '@keyframes rtgresPop{0%{transform:scale(.86);opacity:0;}100%{transform:scale(1);opacity:1;}}',
      '.rtgres .c.pending{opacity:.45;}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function chip(cls, value, label) {
    return '<span class="c' + (cls ? ' ' + cls : '') + '">' + value + (label ? '<span>' + label + '</span>' : '') + '</span>';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function spec() { try { return window.RTGResultSpec || null; } catch (e) { return null; } }
  function signedIn() { try { return !!(window.RTGTokens && RTGTokens.signedIn && RTGTokens.signedIn()); } catch (e) { return false; } }

  /* The game's own chips, read off the row it built, minus the two this file
     is taking over. Matched on the label rather than the id, because the ids
     agree across games and the labels are what a reader sees. */
  function keepers(row) {
    var out = [];
    if (!row) return out;
    var spans = row.querySelectorAll(':scope > span');
    for (var i = 0; i < spans.length; i++) {
      var txt = (spans[i].textContent || '').trim();
      var label = txt.replace(/^[^ ]+\s*/, '').toLowerCase();
      if (/^best/.test(label) || /streak/.test(label)) continue;   // ours now
      var b = spans[i].querySelector('b');
      if (!b || !(b.textContent || '').trim()) continue;
      out.push(chip('', '<b>' + esc(b.textContent.trim()) + '</b>', esc(label)));
    }
    return out;
  }

  /* "Top 12% today" beats "you beat 88%" on a phone: it is shorter, it reads
     as a placing, and it is the half of the sentence people repeat.
     A rank is only worth printing once the field is big enough for a
     percentage to mean anything. Under that, the count itself is the honest
     line ("3rd of 9"), and with almost nobody on the board yet, nothing. */
  var FIELD_MIN = 12;
  function ord(n) {
    var t = n % 100;
    if (t >= 11 && t <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  }
  function rankChip(rank, total) {
    if (!rank || !total || total < 4) return null;
    if (rank === 1) return chip('rank', '<b>1st</b>', 'today');
    if (total < FIELD_MIN) return chip('rank', '<b>' + ord(rank) + '</b>', 'of ' + total + ' today');
    var pct = Math.max(1, Math.round((rank / total) * 100));
    return chip('rank', '<b>Top ' + pct + '%</b>', 'today');
  }

  function render(host, parts) {
    var row = host.querySelector('.rtgres');
    if (!row) {
      row = document.createElement('div');
      row.className = 'rtgres';
      host.appendChild(row);
    }
    row.innerHTML = parts.filter(Boolean).join('');
    return row;
  }

  /* Build the row now from what is known locally, then fill the rank and the
     cloud streak in when they land. Never block the modal on the network: the
     row a player sees first is the one their own device can answer. */
  function paint(sheet) {
    var sp = spec();
    if (!sheet || !sp) return;
    css();
    var old = sheet.querySelector('.a-runline');
    var mine = keepers(old);
    if (old) old.style.display = 'none';

    var host = old ? old.parentNode : sheet;
    // sit exactly where the game's own row sat
    var row = sheet.querySelector('.rtgres');
    if (!row) {
      row = document.createElement('div'); row.className = 'rtgres';
      if (old && old.parentNode) old.parentNode.insertBefore(row, old);
      else host.appendChild(row);
    }

    var bestTxt = sp.bestText != null ? sp.bestText : sp.best;
    var parts = [];
    // rank goes first and arrives late: a placeholder holds its spot so the
    // row does not jump when it lands
    parts.push(signedIn() ? '<span class="c rank pending" data-rank><b>&middot;&middot;&middot;</b><span>today</span></span>' : null);
    if (bestTxt != null && bestTxt !== '') {
      parts.push(sp.isBest
        ? chip('new', '<b>' + esc(bestTxt) + '</b>', 'new best' + (sp.prevBest != null && sp.prevBest !== '' ? ' <s>' + esc(sp.prevBest) + '</s>' : ''))
        : chip('', '<b>' + esc(bestTxt) + '</b>', 'best'));
    }
    parts.push('<span class="c" data-streak hidden></span>');
    row.innerHTML = parts.filter(Boolean).join('') + mine.join('');

    fill(sheet, sp);
  }

  function setChip(sheet, sel, html) {
    var el = sheet.querySelector(sel);
    if (!el) return;
    if (html == null) { el.remove(); return; }
    el.outerHTML = html;
  }

  function fill(sheet, sp) {
    var B = window.RTG_BOARD;
    if (!B || !signedIn()) { setChip(sheet, '[data-rank]', null); }
    else if (B.myRun && B.rank && B.playerCount) {
      B.myRun(sp.key, sp.date).then(function (run) {
        if (!run || run.score == null) { setChip(sheet, '[data-rank]', null); return null; }
        return Promise.all([B.rank(sp.key, sp.date, run.score), B.playerCount(sp.key, sp.date)])
          .then(function (r) { setChip(sheet, '[data-rank]', rankChip(r[0], r[1])); });
      }).catch(function () { setChip(sheet, '[data-rank]', null); });
    } else setChip(sheet, '[data-rank]', null);

    // streak: the server's if there is one, the game's own save if not
    var local = sp.streak;
    function put(n) {
      if (n == null || n <= 0) { setChip(sheet, '[data-streak]', null); return; }
      setChip(sheet, '[data-streak]', chip(n >= 3 ? '' : '', '<b>' + n + '</b>', 'day streak'));
    }
    if (B && B.streakOf && signedIn()) {
      B.streakOf(sp.key).then(function (s) { put(s && s.streak != null ? s.streak : local); })
        .catch(function () { put(local); });
    } else put(local);
  }

  /* Self-mounting, on the same signal funnel.js uses: the modal becoming
     visible. A game that opens its result twice (play again) repaints. */
  function watch() {
    var scrim = document.getElementById('scrim');
    var modal = document.getElementById('resultModal');
    function go() {
      var sheet = (scrim && scrim.querySelector('.sheet, .modal')) || modal;
      if (sheet) paint(sheet);
    }
    if (scrim && window.MutationObserver) {
      new MutationObserver(function () { if (!scrim.classList.contains('hidden')) go(); })
        .observe(scrim, { attributes: true, attributeFilter: ['class'] });
      if (!scrim.classList.contains('hidden')) go();
    }
    if (modal && window.MutationObserver) {
      new MutationObserver(function () { if (!modal.hasAttribute('hidden')) go(); })
        .observe(modal, { attributes: true, attributeFilter: ['hidden'] });
      if (!modal.hasAttribute('hidden')) go();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();

  window.RTGResult = { paint: paint, rankChip: rankChip, ord: ord, FIELD_MIN: FIELD_MIN };
})();
