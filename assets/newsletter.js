/* RunThe.GG release newsletter: the one checkbox every game's profile shows.
 *
 * A signed-in player ticks "Email me when big releases ship" and the account's
 * own address goes on the list (supabase/121_newsletter.sql, newsletter_set).
 * The page never sends an address: the server reads it off the account, so a
 * checkbox cannot be used to put somebody else on the list.
 *
 * TWO WAYS TO MOUNT IT, because the profiles are built two ways:
 *
 *   RTG_NEWS.el({ source: 'hoops' })        an element, for createElement painters
 *   '<div data-rtg-news="football"></div>'  a placeholder in an innerHTML string,
 *   RTG_NEWS.fill(root)                     then filled once the string is on the page
 *
 * THE TOKEN comes from whichever auth module the page loaded, the same list
 * /assets/cloudsave.js reads, plus the three that file does not need. A page with
 * its own raw supabase client (golf, soccer, the home page) passes getToken.
 *
 * IT FAILS SOFT AND OUT OF SIGHT. No token, or a database without 121, and the
 * row removes itself rather than showing a box that does nothing when pressed.
 */
(function (root) {
  'use strict';
  if (root.RTG_NEWS) return;

  var SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';
  var LABEL = 'Email me when big releases ship';
  var SUB = 'New games and major updates only. Unsubscribe anytime.';

  function base() { return (root.RTG_NEWS_URL || root.PS_BOARD_URL || root.RTF_BOARD_URL || SB_URL) + '/rest/v1/rpc/'; }

  function defaultToken() {
    var a = root.PS_AUTH || root.PS_CFB_AUTH || root.RTF_AUTH || root.RTD_AUTH ||
            root.SEGUE_AUTH || root.RTG_AUTH || root.RTG_HOME_AUTH;
    try { return a && typeof a.token === 'function' ? a.token() : null; } catch (e) { return null; }
  }

  function call(fn, args, getToken) {
    return Promise.resolve(getToken ? getToken() : defaultToken()).then(function (tok) {
      if (!tok) return { skip: true };
      return fetch(base() + fn, {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      }).then(function (r) {
        if (!r.ok) return { skip: r.status === 404 || r.status === 401, error: true };
        return r.json().then(function (v) { return { value: v }; });
      });
    }).catch(function () { return { error: true }; });
  }

  var css = '.rtg-news{display:flex;align-items:flex-start;gap:11px;margin:14px 0 0;padding:12px 14px;border-radius:12px;'
    + 'border:1px solid rgba(127,127,127,.28);background:rgba(127,127,127,.07);text-align:left;cursor:pointer;color:inherit;font:inherit}'
    + '.rtg-news input{flex:0 0 auto;width:18px;height:18px;margin:1px 0 0;accent-color:#46bd30;cursor:pointer}'
    + '.rtg-news .rn-t{display:block;font-weight:800;font-size:14px;line-height:1.3}'
    + '.rtg-news .rn-s{display:block;font-size:12px;line-height:1.4;opacity:.72;margin-top:2px}'
    + '.rtg-news.busy{opacity:.6;pointer-events:none}'
    + '.rtg-news[hidden]{display:none}';
  function injectCss() {
    if (!root.document || root.document.getElementById('rtg-news-css')) return;
    var s = root.document.createElement('style');
    s.id = 'rtg-news-css'; s.textContent = css;
    (root.document.head || root.document.documentElement).appendChild(s);
  }

  function el(opts) {
    opts = opts || {};
    injectCss();
    var doc = root.document;
    var row = doc.createElement('label');
    row.className = 'rtg-news busy';
    row.innerHTML = '<input type="checkbox"><span><span class="rn-t"></span><span class="rn-s"></span></span>';
    var box = row.querySelector('input'), t = row.querySelector('.rn-t'), s = row.querySelector('.rn-s');
    t.textContent = LABEL; s.textContent = SUB;
    var source = String(opts.source || '').slice(0, 40);

    function paint(status) {
      row.classList.remove('busy');
      box.checked = status === 'active';
      s.textContent = status === 'pending' ? 'Check your inbox for a confirm link.' : SUB;
    }

    call('newsletter_status', {}, opts.getToken).then(function (r) {
      if (r.skip) { row.hidden = true; return; }
      if (r.error) { row.hidden = true; return; }
      paint(r.value);
    });

    box.addEventListener('change', function () {
      var want = box.checked;
      row.classList.add('busy');
      call('newsletter_set', { p_on: want, p_source: source }, opts.getToken).then(function (r) {
        if (r.error || r.skip) {
          row.classList.remove('busy');
          box.checked = !want;
          s.textContent = 'That did not save. Please try again.';
          return;
        }
        paint(r.value);
        if (want) s.textContent = 'You\'re on the list. ' + SUB;
      });
    });
    return row;
  }

  function fill(scope, opts) {
    var d = root.document;
    var list = (scope || d).querySelectorAll('[data-rtg-news]');
    for (var i = 0; i < list.length; i++) {
      var ph = list[i];
      if (ph.getAttribute('data-rtg-news-done')) continue;
      ph.setAttribute('data-rtg-news-done', '1');
      var o = {};
      for (var k in (opts || {})) o[k] = opts[k];
      o.source = o.source || ph.getAttribute('data-rtg-news');
      ph.appendChild(el(o));
    }
  }

  root.RTG_NEWS = { API_VERSION: 1, el: el, fill: fill };
})(typeof window !== 'undefined' ? window : this);
