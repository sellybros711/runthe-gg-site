/* Shut The Door: the sheets.
 *
 * window.STD_MENUS. The menu, how to play, stats, past dailies, settings and
 * the sign-in sheet. The menu's board row hands over to the board screen
 * (board.js) through ctx.board. Every one of them opens from a button and nothing here
 * opens by itself: no tutorial, no first-visit tour (the owner's call,
 * 2026-10-13). A sheet closes on its backdrop, its close button or Escape.
 *
 * Numbers in the copy come from the contract (the bands) or from the
 * player's own history, never typed here.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var open = null, lastFocus = null, onClose = null;

function openSheet(id, after) {
  if (open) closeSheet(true);
  var el = $(id);
  if (!el) return;
  lastFocus = document.activeElement;
  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(function () { el.classList.add('on'); });
  open = id;
  onClose = after || null;
  var f = el.querySelector('[data-autofocus]') || el.querySelector('.sh-x');
  if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
}
function closeSheet(silent) {
  if (!open) return;
  var el = $(open);
  el.classList.remove('on');
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  open = null;
  var cb = onClose; onClose = null;
  if (!silent && cb) cb();
  if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}

function wire() {
  document.querySelectorAll('.sheet').forEach(function (sh) {
    sh.addEventListener('click', function (e) {
      if (e.target === sh || e.target.closest('[data-close]')) closeSheet();
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) closeSheet(); });
  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () { api.show(b.getAttribute('data-open')); });
  });
}

/* ---- how to play -------------------------------------------------------- */

function renderHow(ctx) {
  /* The bands are relative to the moment (CONTRACT.md section 7), so the
     words say what each colour means rather than printing a cutoff. */
  var MEANS = { green: 'the best call, or close to it.', yellow: 'gave a little away.',
    orange: 'a real cost in this spot.', red: 'a big miss for this spot.' };
  var bands = C.BANDS.map(function (b) {
    var t = MEANS[b.band];
    return '<li><span class="sq ' + b.band + '"></span><b>' + b.band + '</b> ' + t + '</li>';
  }).join('');
  setTimeout(function () {
    var b = document.querySelector('#how-body [data-open-101]');
    if (b) b.addEventListener('click', function () { api.show('101'); });
  }, 0);
  $('how-body').innerHTML =
    '<button type="button" class="btn ghost p101-go" data-open-101>pitching 101: the ideas behind the grade</button>' +
    '<h3>you are the closer</h3>' +
    '<p>one real save spot a day. the real batters, in order. his real pitches. the same spot for everybody.</p>' +
    '<h3>two taps and a release</h3>' +
    '<p>pick a pitch from his arsenal. pick a spot on the grid. hit throw.</p>' +
    '<p>a needle sweeps the meter. tap when it hits the mark. that is the release.</p>' +
    '<p>a clean release misses less than his usual. a bad one misses more. the grade never sees it. it grades the call.</p>' +
    '<p>timing is hard for some. turn the meter off in settings. every pitch then goes with his usual command.</p>' +
    '<p>the grid is what you see from the mound. the middle nine are the zone. the ring around it is for chasing. inside and away are the batter\'s.</p>' +
    '<h3>where it goes</h3>' +
    '<p>the ball misses by his command and your release. then a real pitch from that spot plays out: take, swing, foul or in play.</p>' +
    '<h3>the grade</h3>' +
    '<p>every pitch is graded before it lands. the grade is the hold chance your call kept, against the best call you had. a good pitch that gets hit stays good.</p>' +
    '<p>once they tie it, the grade is the chance they never go ahead.</p>' +
    '<p>colors are measured against the moment. in a tight spot a small miss shows. with a big lead it takes a big one.</p>' +
    '<ul class="bands">' + bands + '</ul>' +
    '<h3>how it ends</h3>' +
    '<ul class="ends"><li><b>' + esc(C.OUTCOME_LABEL.door_shut) + '</b> three outs with the lead</li>' +
    '<li><b>' + esc(C.OUTCOME_LABEL.tie_held) + '</b> they tie it, then you get three outs before they go ahead</li>' +
    '<li><b>' + esc(C.OUTCOME_LABEL.doors_open) + '</b> the go-ahead run scores</li>' +
    '<li><b>' + esc(C.OUTCOME_LABEL.walk_off) + '</b> the winning run scores in their last at-bat</li></ul>' +
    '<p>a tie does not end it. keep pitching. only a door shut keeps your streak.</p>' +
    '<h3>scouting</h3>' +
    '<p>tap the batter\'s name. the grid turns into his map: where he does damage, and where he swings.</p>' +
    '<h3>one a day</h3>' +
    '<p>the daily counts once. run it back to practice. practice is never scored.</p>' +
    '<p>practice is the place to learn the meter. after each release it shows how much the miss grew or shrank.</p>' +
    (ctx && ctx.proxy ? '<p class="quiet">older spots have no pitch tracking. their pitches come from modern pitch data.</p>' : '');
}

/* ---- pitching 101 -----------------------------------------------------------
   The principles the lesson card teaches (CONTRACT.md section 15), in plain
   words for somebody who has never thought about pitching. No numbers here:
   the numbers belong to a batter and a spot, and the lesson card has them. */
var PRINCIPLES = [
  ['first_pitch_strike', 'start with a strike', 'strike one changes everything. hitters do much less damage once they are behind in the count.'],
  ['chase_when_ahead', 'ahead? make him chase', 'with strikes to spare, you do not need the zone. a pitch just off the plate looks hittable and is not.'],
  ['strike_when_behind', 'behind? throw a strike', 'when the balls pile up, a miss is a free base. come back to the zone and make him hit it.'],
  ['avoid_his_damage', 'stay out of his hot zone', 'every hitter has spots where he crushes the ball. scout him. the red cells on his map are where not to go.'],
  ['attack_his_hole', 'pitch to his cold zone', 'every hitter has a hole too. the blue cells are where he swings and gets himself out.'],
  ['same_side_breaker_away', 'breaking ball away, same side', 'against a hitter on your side (a righty against a righty), a breaking ball starts at him and slides away. it is the hardest pitch for him to reach.'],
  ['change_eye_level', 'change his eye level', 'go up, then down. a high fastball then a low breaking ball makes him guess. the same spot twice is easier to time.'],
  ['double_play_ball', 'runner on first? keep it low', 'with fewer than two outs, a low pitch gets a ground ball. one ground ball can be two outs.'],
  ['strikeout_with_runner_on_third', 'runner on third? go for the strikeout', 'with fewer than two outs, a fly ball or a slow grounder scores him. a strikeout never does.'],
  ['dont_walk_the_tying_run', 'do not walk the tying run', 'a walk puts the tying run on base for free. make him earn it with a hit.'],
  ['use_your_best_pitch', 'trust your best pitch', 'his card shows which pitch he throws most. it is the one he trusts. in a big spot, so should you.'],
];
var PRINCIPLE = {};
PRINCIPLES.forEach(function (p) { PRINCIPLE[p[0]] = { title: p[1], line: p[2] }; });
function render101() {
  $('p101-body').innerHTML =
    '<p>the ideas behind every grade. each one is a reason a pitch was right or wrong.</p>' +
    '<ol class="p101">' + PRINCIPLES.map(function (p) {
      return '<li data-principle="' + p[0] + '"><b>' + esc(p[1]) + '</b><span>' + esc(p[2]) + '</span></li>';
    }).join('') + '</ol>' +
    '<p class="quiet">after every outing, the result screen picks your costliest pitch and shows the idea it missed.</p>';
}

/* ---- stats ---------------------------------------------------------------- */

function streakOf(hist, today) {
  var days = Object.keys(hist).sort();
  var best = 0, run = 0, prev = null;
  days.forEach(function (d) {
    var shut = hist[d].outcome === 'door_shut';
    if (shut && prev && dayDiff(prev, d) === 1 && hist[prev].outcome === 'door_shut') run++;
    else run = shut ? 1 : 0;
    best = Math.max(best, run);
    prev = d;
  });
  /* the current run counts only if it reaches today or yesterday */
  var cur = 0;
  var d0 = today;
  if (!hist[d0]) d0 = shiftDay(today, -1);
  while (hist[d0] && hist[d0].outcome === 'door_shut') { cur++; d0 = shiftDay(d0, -1); }
  return { cur: cur, best: best };
}
function dayDiff(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
function shiftDay(d, n) { return new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

/* One renderer, two sources. Signed in, the account's record from
   STD_AUTH.myStats() (shutdoor_my_stats() on the server). Signed out, or when
   that read fails, this device's history. */
function deviceStats(hist, today) {
  var rows = Object.keys(hist).sort().map(function (d) { return hist[d]; });
  var st = streakOf(hist, today);
  var tally = { green: 0, yellow: 0, orange: 0, red: 0 };
  rows.forEach(function (r) { (r.strip || []).forEach(function (b) { if (tally[b] != null) tally[b]++; }); });
  return {
    src: 'device', played: rows.length, shut: rows.filter(function (r) { return r.outcome === 'door_shut'; }).length,
    outcomes: C.OUTCOMES.reduce(function (a, k) { a[k] = rows.filter(function (r) { return r.outcome === k; }).length; return a; }, {}),
    streak: st.cur, best: st.best,
    avgPercentile: rows.length ? Math.round(rows.reduce(function (a, r) { return a + (r.percentile || 0); }, 0) / rows.length) : null,
    bands: tally, recent: rows.slice(-7).reverse(),
  };
}
/* the four results, from the account (doorShut, tieHeld, doorsOpen, walkOff) or the device's history */
var OUTCOME_KEY = { door_shut: 'doorShut', tie_held: 'tieHeld', doors_open: 'doorsOpen', walk_off: 'walkOff' };
function outcomeCounts(m) {
  var out = {};
  C.OUTCOMES.forEach(function (k) { var v = m.outcomes ? m.outcomes[k] : m[OUTCOME_KEY[k]]; out[k] = v == null ? null : v | 0; });
  return out;
}
function renderStats(m) {
  var counts = outcomeCounts(m);
  var n = m.played || 0, shut = m.shut != null ? m.shut : counts.door_shut || 0;
  var ends = C.OUTCOMES.filter(function (k) { return counts[k] != null; }).map(function (k) {
    return counts[k] + ' ' + C.OUTCOME_LABEL[k].toLowerCase();
  }).join(' \u00b7 ');
  var tally = m.bands || {}, all = 0;
  C.BANDS.forEach(function (b) { all += tally[b.band] || 0; });
  function tile(v, l) { return '<div class="tile"><b>' + (v == null ? '-' : esc(v)) + '</b><span>' + l + '</span></div>'; }
  var bar = all ? C.BANDS.map(function (b) {
    var w = (tally[b.band] || 0) / all * 100;
    return w ? '<i class="' + b.band + '" style="width:' + w.toFixed(1) + '%" title="' + b.band + ' ' + tally[b.band] + '"></i>' : '';
  }).join('') : '';
  var recent = (m.recent || []).slice(0, 7).map(function (r) {
    return '<li><span class="rd">#' + esc(r.number) + '</span><span class="ro">' + esc(C.OUTCOME_LABEL[r.outcome] || '') + '</span><span class="rs">' +
      (r.strip || []).map(function (b) { return '<i class="sq ' + esc(b) + '"></i>'; }).join('') + '</span></li>';
  }).join('');
  $('stats-body').innerHTML =
    '<p class="src-tag ' + m.src + '">' + (m.src === 'account' ? 'your account' : 'this device') + '</p>' +
    '<div class="tiles">' + tile(n, 'played') + tile(shut, 'doors shut') + tile(n ? Math.round(shut / n * 100) + '%' : null, 'shut rate') +
    tile(m.streak, 'streak') + tile(m.best, 'best streak') + tile(m.avgPercentile, 'avg percentile') + '</div>' +
    (n && ends ? '<p class="quiet ends-tally">' + esc(ends) + '</p>' : '') +
    '<h3>your pitches</h3>' +
    (all ? '<div class="bandbar">' + bar + '</div><p class="quiet">' + C.BANDS.map(function (b) { return (tally[b.band] || 0) + ' ' + b.band; }).join(' \u00b7 ') + '</p>'
      : '<p class="quiet">no pitches graded yet.</p>') +
    (recent ? '<h3>recent</h3><ul class="recent">' + recent + '</ul>' : '') +
    (m.src === 'account' ? '<p class="quiet">kept on your account, on every device.</p>' : '<p class="quiet">kept on this device. sign in to keep it on your account.</p>');
}
function showStats() {
  var A = window.STD_AUTH, st = {};
  try { st = (A && A.state && A.state()) || {}; } catch (e) {}
  var dev = function () { renderStats(deviceStats(ctx.hist(), ctx.today)); };
  if (st.signedIn && A.myStats) {
    $('stats-body').innerHTML = '<p class="quiet">loading your record.</p>';
    Promise.resolve().then(function () { return A.myStats(); }).then(function (m) {
      if (m && typeof m === 'object') { m.src = 'account'; renderStats(m); } else dev();
    }).catch(dev);
  } else dev();
  openSheet('sheet-stats');
}

/* ---- past dailies (locked in v1) ---------------------------------------- */

function renderPast(scn) {
  var n = scn ? scn.number : 1, tiles = '';
  /* THE ARCHIVE (Pro, CONTRACT.md 17): every past daily, played on its own spot and seed, never on the
     board. Only when entitlements() says archive, which is false for everyone until Pro exists, so
     today every player sees the locked tiles below. No price and no buy button here. */
  if (ctx.ent && ctx.ent.archive && ctx.archiveDays && ctx.onArchive) {
    var days = ctx.archiveDays(ctx.today);
    $('past-body').innerHTML = days.length
      ? '<p>pick a day. it plays on that day\'s spot and luck. it never goes on the leaderboard.</p><div class="arc-list">' +
        days.map(function (d) { return '<button type="button" data-day="' + esc(d.day) + '"><b>#' + esc(d.number) + '</b><span>' + esc(shortDay(d.day)) + '</span></button>'; }).join('') + '</div>'
      : '<p>nothing before #' + esc(n) + ' yet.</p>';
    $('past-body').querySelectorAll('[data-day]').forEach(function (b) {
      b.addEventListener('click', function () { ctx.onArchive(b.getAttribute('data-day')); });
    });
    return;
  }
  for (var i = n - 1; i >= Math.max(1, n - 12); i--) tiles += '<div class="past-t"><b>#' + i + '</b><span class="lock" aria-hidden="true"></span></div>';
  $('past-body').innerHTML =
    '<p>past dailies open later. today\'s is #' + esc(n) + '.</p>' +
    (tiles ? '<div class="past-grid">' + tiles + '</div>' : '<div class="past-grid"><div class="past-t empty"><span class="lock" aria-hidden="true"></span><span>nothing before #' + esc(n) + '</span></div></div>');
}

function shortDay(day) {
  var d = new Date(Date.parse(day + 'T12:00:00Z'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toLowerCase();
}

/* ---- settings ---------------------------------------------------------------- */

function renderSettings(prefs, onChange) {
  var theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  function row(id, label, sub, on) {
    return '<label class="set-row" for="' + id + '"><span><b>' + label + '</b><small>' + sub + '</small></span>' +
      '<input type="checkbox" class="sw" id="' + id + '"' + (on ? ' checked' : '') + '></label>';
  }
  $('set-body').innerHTML =
    row('set-sound', 'sound', 'the glove, the bat, the call', !!prefs.sound) +
    row('set-quick', 'quick pitches', 'shorter animation', !!prefs.quick) +
    row('set-meter', 'release meter', 'time each release. off throws his usual command', prefs.meter !== false) +
    row('set-dark', 'dark mode', 'shared with every runthe.gg game', theme === 'dark');
  $('set-sound').addEventListener('change', function (e) { onChange('sound', e.target.checked); });
  $('set-quick').addEventListener('change', function (e) { onChange('quick', e.target.checked); });
  $('set-meter').addEventListener('change', function (e) { onChange('meter', e.target.checked); });
  $('set-dark').addEventListener('change', function (e) { onChange('theme', e.target.checked ? 'dark' : 'light'); });
}

/* ---- sign in ------------------------------------------------------------------ */
/* Against window.STD_AUTH, shaped like baseball/auth.js's RTD_AUTH: boot,
   state, onChange, signIn, signUp, signInGoogle, signOut, token. */

var authMode = 'in';
function renderAuth() {
  var A = window.STD_AUTH, st = {};
  try { st = A.state() || {}; } catch (e) {}
  var body = $('auth-body');
  if (st.signedIn) {
    body.innerHTML = '<p>signed in as <b>' + esc(st.name || st.email || 'you') + '</b>.</p>' +
      '<p class="quiet">your daily result, streak and stats are kept on your account.</p>' +
      '<button class="btn ghost" id="au-out" type="button">sign out</button>';
    $('au-out').addEventListener('click', function () {
      Promise.resolve(A.signOut && A.signOut()).then(function () { renderAuth(); });
    });
    return;
  }
  var up = authMode === 'up';
  body.innerHTML =
    '<div class="seg" role="tablist"><button type="button" role="tab" id="au-tin" aria-selected="' + !up + '">sign in</button>' +
    '<button type="button" role="tab" id="au-tup" aria-selected="' + up + '">new account</button></div>' +
    '<form id="au-form" novalidate>' +
    '<label>email<input type="email" id="au-email" autocomplete="email" required data-autofocus></label>' +
    '<label>password<input type="password" id="au-pass" autocomplete="' + (up ? 'new-password' : 'current-password') + '" required minlength="6"></label>' +
    (up ? '<label>username<input type="text" id="au-name" autocomplete="username" required maxlength="20"></label>' : '') +
    '<p class="au-err" id="au-err" role="alert"></p>' +
    '<button class="btn go" type="submit">' + (up ? 'create account' : 'sign in') + '</button>' +
    '</form>' +
    '<button class="btn ghost" id="au-google" type="button">continue with google</button>' +
    '<p class="quiet">one account covers every runthe.gg game. it keeps your streak across devices.</p>' +
    (st.ready === false && !st.waiting ? '<p class="quiet">accounts are not available right now. you can still play.</p>' : '');
  $('au-tin').addEventListener('click', function () { authMode = 'in'; renderAuth(); });
  $('au-tup').addEventListener('click', function () { authMode = 'up'; renderAuth(); });
  $('au-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var em = $('au-email').value, pw = $('au-pass').value, nm = up ? $('au-name').value.trim() : '';
    var err = $('au-err');
    if (!em || !pw || (up && !nm)) { err.textContent = 'fill in every field.'; return; }
    err.textContent = '';
    var p = up ? A.signUp(em, pw, nm) : A.signIn(em, pw);
    Promise.resolve(p).then(function (r) {
      if (r && r.error) { err.textContent = String(r.error).toLowerCase(); return; }
      if (up) err.textContent = 'check your email to confirm.';
      else renderAuth();
    }).catch(function () { err.textContent = 'that did not work. try again.'; });
  });
  $('au-google').addEventListener('click', function () {
    var g = A.signInGoogle || A.google;
    Promise.resolve(g && g()).then(function (r) { if (r && r.error) $('au-err').textContent = String(r.error).toLowerCase(); });
  });
}

/* the menu's three tiles: the streak, the best, the last percentile */
function renderMenuTiles() {
  var h = ctx.hist(), st = streakOf(h, ctx.today), days = Object.keys(h).sort();
  var last = days.length ? h[days[days.length - 1]] : null;
  function tl(v, l) { return '<div class="tl"><b>' + (v == null ? '-' : esc(v)) + '</b><span>' + l + '</span></div>'; }
  $('menu-tiles').innerHTML = tl(st.cur, 'doors shut in a row') + tl(st.best, 'best streak') +
    tl(last && last.percentile != null ? Math.round(last.percentile) : null, 'last percentile');
}

var ctx = { hist: function () { return {}; }, today: '', scn: null, prefs: {}, onPref: function () {}, board: null, ent: null, onArchive: null, archiveDays: null };
var api = {
  init: function (c) { for (var k in c) ctx[k] = c[k]; if (!api.wired) { api.wired = true; wire(); } },
  open: openSheet,
  close: closeSheet,
  isOpen: function () { return !!open; },
  current: function () { return open; },
  streakOf: streakOf,
  PRINCIPLE: PRINCIPLE,
  renderAuth: renderAuth,
  show: function (which) {
    if (which === 'how') { renderHow({ proxy: ctx.scn && ctx.scn.resolution === 'proxy' }); openSheet('sheet-how'); }
    else if (which === 'stats') showStats();
    else if (which === '101') { render101(); openSheet('sheet-101'); }
    else if (which === 'past') { renderPast(ctx.scn); openSheet('sheet-past'); }
    else if (which === 'settings') { renderSettings(ctx.prefs, ctx.onPref); openSheet('sheet-settings'); }
    else if (which === 'auth') { renderAuth(); openSheet('sheet-auth'); }
    else if (which === 'menu') { renderMenuTiles(); openSheet('sheet-menu'); }
    else if (which === 'board') { closeSheet(true); if (ctx.board) ctx.board(); }
  },
};
window.STD_MENUS = api;
})();
