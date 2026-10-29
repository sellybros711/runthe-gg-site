/* review.js - "Review my game" on every arcade result screen (shared).
 *
 * Finishing a game used to leave the player with a score and no way to see
 * what they had actually answered against what was right. Each game now logs
 * its rounds here as it plays them, and this module adds a "Review my game"
 * button to the result sheet that opens the list in place.
 *
 *   RTGReview.start(game)        a new attempt: forget the last one
 *   RTGReview.add(game, row)     one round: { q, you, answer, ok, note }
 *                                  q       what was asked (a player, a pair, a clue)
 *                                  you     what the player gave ('' = no answer)
 *                                  answer  what was right
 *                                  ok      true right, false wrong, null neither
 *   RTGReview.set(game, rows)    replace the whole log (games that settle at the end)
 *
 * The log is kept in localStorage for the day, so it survives a reload and is
 * still there when the locked end screen is shown again. Sport editions share
 * their base game's log ('career_nba' writes to 'career'). It shows inside the
 * sheet rather than as a second popup, so the result modal's focus trap and
 * Escape key (modal-a11y.js) keep working unchanged. Fail-soft throughout.
 */
(function () {
  'use strict';
  var PREFIX = 'rtg:review:';
  function base(g) { return String(g || '').replace(/_(nba|nfl|mlb)$/, ''); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function pageGame() { var m = (location.pathname || '').match(/\/arcade\/([a-z]+)\//); return m ? m[1] : null; }
  function read(g) {
    try { var r = JSON.parse(localStorage.getItem(PREFIX + base(g))); if (r && r.d === today() && Array.isArray(r.rows)) return r; } catch (e) {}
    return null;
  }
  function write(g, rows) { try { localStorage.setItem(PREFIX + base(g), JSON.stringify({ d: today(), rows: rows.slice(-60) })); } catch (e) {} }
  function start(g) { write(g, []); }
  function add(g, row) { var r = read(g); var rows = r ? r.rows : []; rows.push(clean(row)); write(g, rows); }
  function set(g, rows) { write(g, (rows || []).map(clean)); }
  function clean(row) {
    row = row || {};
    return { q: String(row.q == null ? '' : row.q), you: String(row.you == null ? '' : row.you),
             answer: String(row.answer == null ? '' : row.answer),
             ok: row.ok === true ? true : (row.ok === false ? false : null), note: row.note ? String(row.note) : '' };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent = [
      '.rtgrv{margin:12px 0 4px;}',
      '.rtgrv-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;border-radius:12px;',
      '  border:1.5px solid var(--line2,rgba(255,255,255,.18));background:transparent;color:var(--ink,#F4F7FB);',
      '  font:800 15px var(--f,system-ui);cursor:pointer;}',
      '.rtgrv-btn:focus-visible{outline:3px solid var(--accent,#F2B632);outline-offset:2px;}',
      '.rtgrv-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px;text-align:left;}',
      '.rtgrv-list[hidden]{display:none;}',
      '.rtgrv-row{border-radius:10px;padding:10px 12px;background:rgba(127,127,127,.10);border-left:4px solid var(--dim,#7C8DA3);}',
      '.rtgrv-row.ok{border-left-color:#3FB950;} .rtgrv-row.no{border-left-color:#E5484D;}',
      '.rtgrv-q{font:800 15px/1.3 var(--f,system-ui);color:var(--ink,#F4F7FB);}',
      '.rtgrv-a{margin-top:3px;font:600 14px/1.4 var(--f,system-ui);color:var(--mut,#A9B6C6);}',
      '.rtgrv-a b{color:var(--ink,#F4F7FB);font-weight:800;}',
      '.rtgrv-mk{float:right;font:900 12px var(--f,system-ui);letter-spacing:.04em;}',
      '.rtgrv-row.ok .rtgrv-mk{color:#3FB950;} .rtgrv-row.no .rtgrv-mk{color:#E5484D;}'
    ].join('');
    document.head.appendChild(s);
  }

  function rowHTML(r) {
    var cls = r.ok === true ? ' ok' : (r.ok === false ? ' no' : '');
    var mk = r.ok === true ? 'Right' : (r.ok === false ? 'Missed' : '');
    var you = r.you ? esc(r.you) : '<i>no answer</i>';
    var lines = '<div class="rtgrv-a">You: <b>' + you + '</b></div>';
    if (r.answer && (r.ok !== true || r.answer !== r.you)) lines += '<div class="rtgrv-a">Answer: <b>' + esc(r.answer) + '</b></div>';
    if (r.note) lines += '<div class="rtgrv-a">' + esc(r.note) + '</div>';
    return '<li class="rtgrv-row' + cls + '">' + (mk ? '<span class="rtgrv-mk">' + mk + '</span>' : '') +
      '<div class="rtgrv-q">' + esc(r.q) + '</div>' + lines + '</li>';
  }

  function sheetOf(c) { return c.querySelector('.sheet') || c.querySelector('.modal') || c; }
  function decorate(container) {
    var g = pageGame(); if (!g) return;
    var log = read(g);
    var sheet = sheetOf(container);
    var box = sheet.querySelector('.rtgrv');
    if (!log || !log.rows.length) { if (box) box.remove(); return; }
    style();
    if (!box) {
      box = document.createElement('div'); box.className = 'rtgrv';
      box.innerHTML = '<button type="button" class="rtgrv-btn" aria-expanded="false" aria-controls="rtgrvList">Review my game</button>' +
        '<ol class="rtgrv-list" id="rtgrvList" hidden></ol>';
      var foot = sheet.querySelector('.rtgrs-foot');
      if (foot) sheet.insertBefore(box, foot); else sheet.appendChild(box);
      box.querySelector('.rtgrv-btn').addEventListener('click', function () {
        var list = box.querySelector('.rtgrv-list'), open = list.hasAttribute('hidden');
        if (open) { var l = read(g); list.innerHTML = (l ? l.rows : []).map(rowHTML).join(''); list.removeAttribute('hidden'); }
        else list.setAttribute('hidden', '');
        this.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.textContent = open ? 'Hide my answers' : 'Review my game';
      });
    }
  }
  function watch() {
    if (!window.MutationObserver) return;
    [document.getElementById('scrim'), document.getElementById('resultModal')].forEach(function (c) {
      if (!c) return;
      var check = function () {
        var open = c.id === 'scrim' ? !c.classList.contains('hidden') && !c.hasAttribute('hidden') : !c.hasAttribute('hidden');
        if (open) { try { decorate(c); } catch (e) {} }
      };
      new MutationObserver(check).observe(c, { attributes: true, attributeFilter: ['class', 'hidden'] });
      check();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  window.RTGReview = { start: start, add: add, set: set, read: read };
})();
