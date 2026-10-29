/*
 * fantasy-promo.js : the lock day reminder for the weekly Fantasy Challenge.
 *
 * Both football games carry a weekly competition with a prize, and the one thing a player
 * can miss is the lock. The door on the front page says "locks in 6h" to anybody who looks
 * at it, and a door is something you have to look at. So on the day a week locks, the
 * front page asks once: a sheet with a live countdown to the first kickoff, the prize, and
 * a way in.
 *
 *   RTG_FANPROMO.init({ league, nowUrl, href, entryPrefix, auth, show })
 *   RTG_FANPROMO.check()     ask again now (the page calls it on every auth change)
 *   RTG_FANPROMO.open()      draw it whatever the rules say (a check's handle)
 *
 * ONE SHARED FILE FOR BOTH GAMES, which is /assets/store.js's argument about a price. The
 * rule for when this appears is the same sentence in both games, and two copies of it would
 * be two answers the first time somebody tuned one.
 *
 * WHEN IT APPEARS. All of these, read off the week's own pointer and never off a weekday:
 *   - the Eastern calendar date is the date of the lock (so it switches on at midnight),
 *   - the lock has not passed yet,
 *   - this week has not been entered on this browser (the mode's own record, written only
 *     after the server said yes, so a refused entry can never hide the reminder),
 *   - the page draws the fantasy door at all (`show`),
 *   - the front page is the screen, and no sheet or first visit guide is up,
 *   - and this account has not been shown it for this week.
 * A Thursday night NFL lock and a Friday night college lock are the same rule. A London
 * game at 9:30am still gives the morning, because the day starts at midnight Eastern.
 *
 * ONCE PER ACCOUNT, PER WEEK, AND THE ACCOUNT IS THE SERVER'S. It is marked seen the moment
 * it is on screen, which is the football game's guide rule (hasSeen). The mark goes to this
 * browser and, signed in, to the account's shelf (`ps_saves`, game `rtg_promo`, one slot a
 * league), so a reminder dismissed on a phone does not come back on the laptop. The two
 * marks are a UNION: seen anywhere counts. That is generous in the quiet direction. Two
 * accounts on one browser share the device's mark, and the worst it costs is a reminder not
 * shown, never one shown twice.
 *
 * THE SHELF IS ASKED BEFORE THE SHEET OPENS, and the answer is waited for (about four
 * seconds at most). Null means no opinion, which is cloudsave.js's rule: a dropped
 * connection shows the reminder rather than hiding it, because the browser's own mark
 * still stands.
 *
 * IT IS NEVER DRAWN UNDER AUTOMATION unless a check asks for it (window.RTG_FANPROMO_TEST).
 * This is a modal that appears on one day a week, so without that every front page suite in
 * the repo would pass six days in seven and fail on the seventh, with nothing about the page
 * having changed. A check that wants it sets the flag and gets the real rule.
 */
(function (root) {
  'use strict';
  if (root.RTG_FANPROMO) return;

  var GAME = 'rtg_promo';
  var LOCAL = 'rtg_fanpromo_v1';
  var CFG = null, week = null, asked = 0, opened = false, tick = null, pulled = {};

  function $(id) { return document.getElementById(id); }

  /* THE EASTERN DATE, which is what every calendar clock on this site uses. en-CA formats
     as YYYY-MM-DD. A browser with no zone data answers the local date rather than throwing. */
  function eastern(ms) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    } catch (e) { return new Date(ms).toISOString().slice(0, 10); }
  }
  function weekKey(w) { return w.season + '_w' + w.week; }

  function localSeen() {
    try { return JSON.parse(localStorage.getItem(LOCAL) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function markLocal(k) {
    var o = localSeen(); o[CFG.league + ':' + k] = 1;
    try { localStorage.setItem(LOCAL, JSON.stringify(o)); } catch (e) {}
  }
  function seenHere(k) { return !!localSeen()[CFG.league + ':' + k]; }

  /* The account's copy, kept as a set of week keys for this league. */
  var cloud = {};
  function cloudSeen(uid, k) { return !!(cloud[uid] && cloud[uid][k]); }
  function pull(uid) {
    if (pulled[uid]) return pulled[uid];
    var S = root.RTG_SAVE;
    if (!S || typeof S.get !== 'function') return (pulled[uid] = Promise.resolve(null));
    var done = false;
    pulled[uid] = new Promise(function (resolve) {
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 4000);
      S.get(GAME, CFG.league).then(function (r) {
        if (done) return; done = true; clearTimeout(t);
        var seen = (r && r.payload && r.payload.seen) || {};
        cloud[uid] = Object.assign(cloud[uid] || {}, seen);
        resolve(r);
      }, function () { if (!done) { done = true; clearTimeout(t); resolve(null); } });
    });
    return pulled[uid];
  }
  function push(uid, k) {
    var S = root.RTG_SAVE;
    cloud[uid] = cloud[uid] || {};
    cloud[uid][k] = 1;
    if (!S || typeof S.queue !== 'function') return;
    /* Progress is the count of weeks seen, which only grows, so the server's "never move a
       save backwards" rule is exactly the rule a seen list wants. A refusal hands back what
       is stored, which is folded in and sent again with this week on top. */
    S.queue(GAME, CFG.league, function () {
      var o = cloud[uid] || {};
      return { payload: { seen: o }, progress: Object.keys(o).length };
    }).then(function (r) {
      if (r && r.ok === false && r.payload && r.payload.seen) {
        var before = Object.keys(cloud[uid]).length;
        Object.assign(cloud[uid], r.payload.seen);
        if (Object.keys(cloud[uid]).length >= before) push(uid, k);
      }
    });
  }

  function entered(w) {
    try {
      var s = JSON.parse(localStorage.getItem(CFG.entryPrefix + w.season + '_w' + w.week) || 'null');
      return !!s && s.submitted != null;
    } catch (e) { return false; }
  }

  function blocked() {
    if (document.querySelector('.sheet.on')) return true;
    var g = $('frg'); if (g && !g.hidden) return true;
    var home = $('s-intro');
    return !home || !home.classList.contains('on');
  }

  function fetchWeek() {
    asked = Date.now();
    return fetch(CFG.nowUrl, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (n) {
        if (n && n.season != null && n.week != null && n.locks_at) week = n;
      }).catch(function () {});
  }

  /* Every question except the account's, which needs a round trip and is asked last. */
  function eligible(now) {
    if (!week || opened || $('fpromo')) return false;
    var lock = Date.parse(week.locks_at);
    if (!(lock > now)) return false;
    if (eastern(now) !== eastern(lock)) return false;
    if (CFG.show && !CFG.show()) return false;
    if (entered(week)) return false;
    if (seenHere(weekKey(week))) return false;
    return !blocked();
  }

  var checking = false;
  function check() {
    if (!CFG || checking) return;
    if (navigator.webdriver && !root.RTG_FANPROMO_TEST) return;
    /* The pointer moves on the Tuesday build, so it is asked again every half hour. */
    if (Date.now() - asked > 30 * 60000) fetchWeek();
    if (!week) return;
    if (!eligible(Date.now())) return;
    var a = (CFG.auth && CFG.auth()) || {};
    /* WAIT FOR THE ANSWER ABOUT WHO THIS IS. Before auth resolves every visit reads as a
       guest, and the mark has to land on the right account. */
    if (!a.ready) return;
    var k = weekKey(week);
    if (!a.signedIn || !a.userId) { open(); return; }
    checking = true;
    pull(a.userId).then(function () {
      checking = false;
      if (cloudSeen(a.userId, k)) { markLocal(k); return; }
      if (eligible(Date.now())) open();
    });
  }

  /* ---- THE SHEET ---- */
  var CSS = '#fpromo{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;'
    + 'justify-content:center;padding:16px;background:rgba(4,7,14,.74);'
    + 'animation:fpIn .25s ease both}'
    + '#fpromo .fp-card{position:relative;width:100%;max-width:400px;max-height:calc(100vh - 32px);'
    + 'overflow:auto;border-radius:20px;padding:22px 20px 18px;color:#eef2f8;text-align:center;'
    + 'background:radial-gradient(120% 80% at 50% 0%,#1c2a4a 0%,#0d1322 62%,#0a0e19 100%);'
    + 'border:1px solid rgba(240,201,107,.55);'
    + 'box-shadow:0 0 0 1px rgba(240,201,107,.12) inset,0 24px 60px rgba(0,0,0,.55),'
    + '0 0 44px rgba(240,201,107,.12);animation:fpUp .32s cubic-bezier(.2,.9,.3,1.2) both;'
    + 'font-family:inherit;outline:none}'
    + '#fpromo .fp-x{position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;'
    + 'border-radius:50%;background:rgba(255,255,255,.06);color:#c5cddc;font-size:20px;'
    + 'line-height:36px;cursor:pointer}'
    + '#fpromo .fp-crest{width:52px;height:52px;display:block;margin:0 auto 8px;'
    + 'filter:drop-shadow(0 4px 12px rgba(240,201,107,.35))}'
    + '#fpromo .fp-eye{font-size:11px;letter-spacing:.16em;text-transform:uppercase;'
    + 'color:#f0c96b;font-weight:800}'
    + '#fpromo .fp-h{margin:6px 0 2px;font-size:28px;line-height:1.05;font-weight:900;'
    + 'letter-spacing:.01em;text-transform:uppercase;font-family:Anton,Impact,"Arial Narrow",sans-serif}'
    + '#fpromo .fp-clock{display:flex;justify-content:center;gap:8px;margin:16px 0 4px}'
    + '#fpromo .fp-seg{min-width:64px;padding:8px 4px 6px;border-radius:12px;'
    + 'background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.08)}'
    + '#fpromo .fp-seg b{display:block;font-size:34px;line-height:1;font-weight:900;'
    + 'font-variant-numeric:tabular-nums;color:#fff;font-family:Anton,Impact,"Arial Narrow",sans-serif}'
    + '#fpromo .fp-seg i{display:block;margin-top:4px;font-style:normal;font-size:10px;'
    + 'letter-spacing:.14em;text-transform:uppercase;color:#93a0b6}'
    + '#fpromo .fp-when{font-size:12.5px;color:#93a0b6;margin:2px 0 14px}'
    + '#fpromo .fp-prize{display:flex;align-items:center;gap:10px;text-align:left;margin:0 0 14px;'
    + 'padding:10px 12px;border-radius:12px;background:linear-gradient(90deg,rgba(240,201,107,.16),'
    + 'rgba(240,201,107,.04));border:1px solid rgba(240,201,107,.32);font-size:13px;line-height:1.35}'
    + '#fpromo .fp-prize b{color:#f0c96b}'
    + '#fpromo .fp-pro{flex:none;padding:4px 8px;border-radius:7px;background:#f0c96b;color:#1a1204;'
    + 'font-weight:900;font-size:12px;letter-spacing:.08em}'
    + '#fpromo .fp-body{font-size:14px;line-height:1.45;color:#c5cddc;margin:0 0 16px}'
    + '#fpromo .fp-go{display:block;padding:14px 16px;border-radius:12px;text-decoration:none;'
    + 'background:linear-gradient(180deg,#22c55e,#15803d);color:#fff;font-weight:900;'
    + 'font-size:16px;letter-spacing:.04em;text-transform:uppercase;'
    + 'box-shadow:0 8px 22px rgba(34,197,94,.28)}'
    + '#fpromo .fp-later{margin-top:8px;border:0;background:none;color:#93a0b6;font-size:13px;'
    + 'padding:8px 12px;cursor:pointer;font-family:inherit}'
    + '@keyframes fpIn{from{opacity:0}to{opacity:1}}'
    + '@keyframes fpUp{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}'
    + '@media (prefers-reduced-motion:reduce){#fpromo,#fpromo .fp-card{animation:none}}'
    + '@media (max-width:359px){#fpromo .fp-seg{min-width:56px}#fpromo .fp-seg b{font-size:28px}'
    + '#fpromo .fp-h{font-size:24px}}';

  var CREST = '<svg class="fp-crest" viewBox="0 0 32 32" aria-hidden="true">'
    + '<path d="M16 1.8 28.4 6v9.4c0 7.4-5.3 12.6-12.4 15-7.1-2.4-12.4-7.6-12.4-15V6Z" '
    + 'fill="rgba(10,14,26,.85)" stroke="#f0c96b" stroke-width="1.8"/>'
    + '<path d="M11 8.6h10v4.2a5 5 0 0 1-10 0Z" fill="#f0c96b"/>'
    + '<path d="M11 9.8H8.6a2.6 2.6 0 0 0 2.9 3.8M21 9.8h2.4a2.6 2.6 0 0 1-2.9 3.8" '
    + 'fill="none" stroke="#f0c96b" stroke-width="1.4"/>'
    + '<rect x="15" y="17.4" width="2" height="2.8" fill="#d9a13a"/>'
    + '<rect x="11.8" y="20.2" width="8.4" height="2.4" rx="1" fill="#f0c96b"/></svg>';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function lockClock(ms) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
        hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) + ' ET';
    } catch (e) { return ''; }
  }

  function paint() {
    var el = $('fpromo'); if (!el || !week) return;
    var left = Date.parse(week.locks_at) - Date.now();
    var segs = el.querySelectorAll('.fp-seg b');
    if (left > 0) {
      var s = Math.floor(left / 1000);
      segs[0].textContent = pad(Math.floor(s / 3600));
      segs[1].textContent = pad(Math.floor(s % 3600 / 60));
      segs[2].textContent = pad(s % 60);
    } else {
      /* LEFT OPEN PAST THE LOCK, the sheet stops selling an entry nobody can make. */
      segs[0].textContent = segs[1].textContent = segs[2].textContent = '00';
      el.querySelector('.fp-h').textContent = 'Lineups are locked';
      el.querySelector('.fp-when').textContent = 'Week ' + week.week + ' is live.';
      el.querySelector('.fp-go').textContent = 'See the board';
      if (tick) { clearInterval(tick); tick = null; }
    }
  }

  function close() {
    var el = $('fpromo');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (tick) { clearInterval(tick); tick = null; }
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    if (!CFG || !week || $('fpromo')) return;
    opened = true;
    var k = weekKey(week);
    markLocal(k);
    var a = (CFG.auth && CFG.auth()) || {};
    if (a.signedIn && a.userId) push(a.userId, k);
    if (!$('fpromo-css')) {
      var st = document.createElement('style'); st.id = 'fpromo-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    var lock = Date.parse(week.locks_at);
    var el = document.createElement('div');
    el.id = 'fpromo';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'fpromo-h');
    el.innerHTML = '<div class="fp-card" tabindex="-1">'
      + '<button class="fp-x" type="button" aria-label="Close">&times;</button>'
      + CREST
      + '<div class="fp-eye">Fantasy Challenge &middot; Week ' + week.week + '</div>'
      + '<h2 class="fp-h" id="fpromo-h">Lineups lock today</h2>'
      + '<div class="fp-clock" role="timer" aria-live="off">'
      + '<div class="fp-seg"><b>00</b><i>Hrs</i></div>'
      + '<div class="fp-seg"><b>00</b><i>Min</i></div>'
      + '<div class="fp-seg"><b>00</b><i>Sec</i></div></div>'
      + '<div class="fp-when">Locks at ' + lockClock(lock) + '. That\'s the first kickoff.</div>'
      + '<div class="fp-prize"><span class="fp-pro">PRO</span>'
      + '<span><b>Top score wins 30 days of Pro.</b></span></div>'
      + '<p class="fp-body">Draft six. Enter one lineup. Free to play.</p>'
      + '<a class="fp-go" href="' + CFG.href + '">Draft my lineup</a>'
      + '<button class="fp-later" type="button">Not now</button>'
      + '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    el.querySelector('.fp-x').onclick = close;
    el.querySelector('.fp-later').onclick = close;
    document.body.appendChild(el);
    document.addEventListener('keydown', onKey);
    paint();
    tick = setInterval(paint, 1000);
    /* Focus goes to the card rather than the button, so a screen reader starts at the top
       and no focus ring is drawn round the button before anybody has touched anything. */
    try { el.querySelector('.fp-card').focus({ preventScroll: true }); } catch (e) {}
  }

  function init(cfg) {
    if (CFG) return;
    CFG = cfg;
    fetchWeek().then(check);
    /* The day turns over at midnight with nobody touching anything, and the front page can be
       the screen again after a run, so the rule is asked again on a slow clock. */
    setInterval(check, 20000);
  }

  root.RTG_FANPROMO = { init: init, check: check, close: close,
    open: function () { if (!week) return fetchWeek().then(open); open(); },
    _eastern: eastern };
})(window);
