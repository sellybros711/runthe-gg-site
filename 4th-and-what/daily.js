/* 4th and What: the daily 4th down.
 *
 * The owner, 2026-11-01: "make 4th and what into a daily game, similar to
 * shut the door. You should get 1 4th down play that's taken place
 * throughout NFL history... You run 1 play from 1 yardage that a real team
 * faced in a crucial situation. You should still be able to save that play
 * at the end if you have a Run The Games account."
 *
 * One real NFL 4th down a day, the same for everybody: the Eastern calendar
 * day, like every daily on the site. The plays are data/fourths.json, built
 * by build/fourths.mjs from nflverse play-by-play: every crucial 4th down a
 * team went for since 1999, ranked by how much it swung the game, plus every
 * one in a title game or a Super Bowl. Every fact on the card (the teams, the
 * date, the score, the clock, the spot, what really happened) is a field of
 * that row. Nothing is typed by hand.
 *
 * The day's play is a fixed shuffle of the list (the same seed for good), so
 * nobody can tell tomorrow's from today's, and the list lasts well over a
 * year before it comes round again. The day's defense is a seed from the
 * day: same call, same play, same result for everybody.
 *
 * ONE SCORED SNAP A DAY. The first snap is the day's result; after it, every
 * snap is practice with a fresh defense and changes nothing. Signed in, the
 * result is posted (supabase/162_fourth_and_what_daily.sql) and the day's
 * conversion rate, the streak and the board come back. Signed out it plays
 * the same and keeps the result on this device.
 *
 * The node half (the schedule and the copy) is tested in test/daily.test.mjs.
 *
 * Plain script: window.FAW_DAILY in the page, module.exports in node.
 */
(function (root) {
  'use strict';
  var RNG = root.FAW_RNG || (typeof require === 'function' ? require('./rng.js') : null);

  /* ---------------- the schedule ---------------- */
  var EPOCH = '2026-10-31';                 /* daily #1, the Eastern day it was built */
  var ORDER_SEED = 'fourth-and-what-daily-v1';

  /* the Eastern calendar day of a moment, 'YYYY-MM-DD' */
  function dayOf(date) {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(date || new Date());
  }
  function utc(d) { var p = d.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function numberOf(day) { return Math.round((utc(day) - utc(EPOCH)) / 86400000) + 1; }
  /* The fixed shuffle: Fisher-Yates off one seed, so it never changes. The
     list is ranked (the biggest swing first), and the shuffle stays inside
     blocks of BLOCK ranks: the most famous plays come up in the first months,
     in an order nobody can guess. */
  var BLOCK = 100, orderCache = {};
  function order(n) {
    if (orderCache[n]) return orderCache[n];
    var a = [], r = RNG.mulberry32(RNG.hashStr(ORDER_SEED));
    for (var i = 0; i < n; i++) a.push(i);
    for (var s0 = 0; s0 < n; s0 += BLOCK) {
      var e0 = Math.min(n, s0 + BLOCK);
      for (var j = e0 - 1; j > s0; j--) { var k = s0 + Math.floor(r() * (j - s0 + 1)), t = a[j]; a[j] = a[k]; a[k] = t; }
    }
    return (orderCache[n] = a);
  }
  function playFor(plays, number) {
    var n = plays.length, i = ((number - 1) % n + n) % n;
    return plays[order(n)[i]];
  }
  /* the day's defense: one seed for everybody */
  function seedFor(day) { return RNG.hashStr('faw-daily-' + day); }

  /* ---------------- the copy, every word of it from the row ---------------- */
  var NAME = { ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals',
    CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars',
    KC: 'Chiefs', LA: 'Rams', LAC: 'Chargers', LV: 'Raiders', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints',
    NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers', TEN: 'Titans',
    WAS: 'Washington' };
  /* nflverse writes today's code for every season: show the one on the field that year */
  function code(t, season) {
    if (t === 'LV' && season < 2020) return 'OAK';
    if (t === 'LAC' && season < 2017) return 'SD';
    if (t === 'LA' && season < 2016) return 'STL';
    return t;
  }
  function name(t) { return NAME[t] || t; }
  /* the AFC since 2002; Seattle was AFC before it moved that year */
  var AFC = { BAL: 1, BUF: 1, CIN: 1, CLE: 1, DEN: 1, HOU: 1, IND: 1, JAX: 1, KC: 1, LAC: 1, LV: 1, MIA: 1, NE: 1, NYJ: 1, PIT: 1, TEN: 1 };
  function conf(t, season) { return AFC[t] || (t === 'SEA' && season < 2002) ? 'AFC' : 'NFC'; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateText(d) { var p = d.split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
  function roman(n) {
    var v = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], s = '';
    v.forEach(function (x) { while (n >= x[0]) { s += x[1]; n -= x[0]; } });
    return s;
  }
  /* Super Bowl numbers run from the 1966 season; the 2015 one was written 50 */
  function roundText(p) {
    if (p.round === 'Super Bowl') { var n = p.season - 1965; return 'Super Bowl ' + (n === 50 ? '50' : roman(n)); }
    if (p.round === 'Conference Championship') return p.season + ' ' + conf(p.off, p.season) + ' Championship';
    if (p.round) return p.season + ' ' + conf(p.off, p.season) + ' ' + p.round + ' round';
    return p.season + ' · Week ' + p.week;
  }
  /* offense first: "Eagles vs Patriots" in a Super Bowl, "at" on the road */
  function teamsText(p) { return name(p.off) + (p.round === 'Super Bowl' ? ' vs ' : p.off === p.away ? ' at ' : ' vs ') + name(p.def); }
  function clockText(p) { var c = String(p.clock || '').replace(/^0(\d:)/, '$1'); return (p.qtr >= 5 ? 'OT' : 'Q' + p.qtr) + ' · ' + c; }
  function scoreText(p) { return code(p.off, p.season) + ' ' + p.offScore + ' · ' + code(p.def, p.season) + ' ' + p.defScore; }
  /* yardline_100 is yards to the end zone: inside 50 it is their side */
  function spotText(p) {
    if (p.ballOn === 50) return 'midfield';
    return 'the ' + (p.ballOn < 50 ? code(p.def, p.season) + ' ' + p.ballOn : code(p.off, p.season) + ' ' + (100 - p.ballOn));
  }
  function downText(p) { return '4th & ' + (p.goal || p.togo >= p.ballOn ? 'Goal' : p.togo); }
  /* what really happened: the play-by-play line, without its clock and formation tags */
  function realText(p) {
    return String(p.desc || '').replace(/^\([^)]*\)\s*/, '').replace(/^\((Shotgun|No Huddle|No Huddle, Shotgun|Shotgun, No Huddle)\)\s*/i, '')
      .replace(/\s*\[[^\]]*\]/g, '').trim();
  }
  function verdictText(p) {
    if (p.td) return 'They scored.';
    if (p.conv) return 'They converted. ' + (p.yards >= 0 ? 'Gained ' + p.yards + '.' : '');
    return 'They were stopped.';
  }
  /* the share line: no spoilers, never the call */
  function shareText(p, number, r) {
    var y = r.yards > 0 ? '+' + r.yards : String(r.yards);
    return '4th and What Daily #' + number + ' · ' + downText(p) + '\n' +
      teamsText(p) + ', ' + roundText(p) + '\n' +
      (r.win ? 'Converted ' + y + ' 🏁' : 'Stopped ' + y + ' ❌') + (p.conv === r.win ? ' (same as the real thing)' : p.conv ? ' (they made it)' : ' (they did not)') + '\n' +
      'https://runthe.gg/4th-and-what#daily';
  }

  var CORE = { EPOCH: EPOCH, dayOf: dayOf, numberOf: numberOf, order: order, playFor: playFor, seedFor: seedFor,
    code: code, name: name, conf: conf, dateText: dateText, roundText: roundText, teamsText: teamsText, clockText: clockText,
    scoreText: scoreText, spotText: spotText, downText: downText, realText: realText, verdictText: verdictText, shareText: shareText };
  if (typeof module !== 'undefined' && module.exports) { module.exports = CORE; return; }

  /* ================= the page ================= */
  var A = root.FAW_APP, E = root.FAW_ENGINE;
  var $ = function (id) { return document.getElementById(id); };
  var DATA = 'data/fourths.json?v=1';
  var plays = null, day = dayOf(), number = numberOf(day), today = null, active = false, stash = null, server = null, dayStats = null;
  var KEY = 'faw_daily_' + day;

  function kept() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function keep(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  /* ---- the server: supabase/162. Every call answers null on any failure. ---- */
  var SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';
  function token() { var a = root.RTG_AUTH; return a && typeof a.token === 'function' ? a.token() : null; }
  function rpc(fn, body, signed) {
    var tok = token();
    if (signed && !tok) return Promise.resolve(null);
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(body || {}),
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + (tok || SB_ANON), 'Content-Type': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  /* a check swaps in its own stand-in, so no check ever writes a real row */
  var API = root.FAW_DAILY_API || {
    submit: function (row) { return rpc('faw_daily_submit', { p_day: row.day, p_number: row.number, p_play_id: row.playId, p_converted: row.converted,
      p_yards: row.yards, p_call: row.callKey, p_seed: row.seed, p_drawn: row.drawn }, true); },
    day: function (d) { return rpc('faw_daily_day', { p_day: d }); },
    mine: function () { return rpc('faw_daily_my_stats', {}, true); }
  };

  /* ---- Home: the Daily card under the banner ---- */
  function renderHome() {
    var box = $('hDaily'); if (!box) return;
    if (!today) { box.hidden = true; return; }
    box.hidden = false;
    var k = kept();
    $('hdNum').textContent = 'Daily #' + number;
    $('hdTeams').textContent = teamsText(today) + ' · ' + roundText(today);
    $('hdDown').textContent = downText(today) + ' at ' + spotText(today);
    $('hdGame').textContent = clockText(today) + ' · ' + scoreText(today);
    $('hdGo').textContent = k ? (k.win ? 'You converted. See it' : 'You were stopped. See it') : 'Play today';
  }

  /* ---- the intro: the situation, big ---- */
  function renderIntro() {
    if (!today) return;
    var k = kept();
    $('dNum').textContent = 'Daily #' + number + ' · ' + dateText(day);
    $('dDown').textContent = downText(today);
    $('dSpot').textContent = 'at ' + spotText(today);
    $('dTeams').textContent = teamsText(today);
    $('dRound').textContent = roundText(today) + ' · ' + dateText(today.date);
    $('dScore').textContent = scoreText(today);
    $('dClock').textContent = clockText(today);
    $('dGo').textContent = k ? 'Practice it' : 'Draw your call';
    $('dDone').hidden = !k;
    if (k) {
      $('dMine').textContent = (k.win ? 'You converted. ' : 'You were stopped. ') + (k.yards >= 0 ? 'Gained ' + k.yards + '.' : 'Lost ' + (-k.yards) + '.');
      $('dReal').textContent = realText(today);
      $('dVerdict').textContent = verdictText(today);
    }
    renderStats();
  }
  function renderStats() {
    var t = $('dStats'), r = $('rDayStats');
    var line = '';
    if (dayStats && dayStats.players) line = Math.round(dayStats.converted * 100 / dayStats.players) + '% converted today · ' + dayStats.players + ' played';
    if (server && server.streak) line += (line ? ' · ' : '') + 'Streak ' + server.streak;
    if (t) { t.textContent = line; t.hidden = !line; }
    if (r) { r.textContent = line; r.hidden = !line || !kept(); }
  }
  function refreshStats() {
    return Promise.all([API.day(day), API.mine()]).then(function (x) {
      if (x[0] && typeof x[0] === 'object') dayStats = x[0];
      if (x[1] && typeof x[1] === 'object') {
        server = x[1];
        /* played on another device: that result is the day's here too */
        var t = server.today;
        if (t && t.day === day && !kept()) keep({ win: !!t.converted, yards: t.yards, callKey: t.callKey, seed: t.seed, drawn: t.drawn, title: t.converted ? 'FIRST DOWN' : 'TURNOVER ON DOWNS' });
      }
      renderHome(); renderStats();
    });
  }

  /* ---- in and out of the daily ---- */
  function enter() {
    if (!today) return;
    if (!active) {
      stash = { sc: A.copy(A.SC), draft: A.copy(A.draft) };
      active = true;
      document.body.classList.add('daily');
      A.SC.down = 4; A.SC.distance = Math.min(today.togo, today.ballOn); A.SC.ballOn = today.ballOn; A.SC.ballX = E.FIELD_W / 2;
      var k = kept();
      var play = k && k.drawn ? k.drawn : A.emptyPlay('gun3x1');
      A.setDraft({ play: A.copy(play), name: '', nameEdited: false, tag: A.tagOf(play), fav: false, notes: '', situations: [], ref: null });
    }
    A.show('studio', { mode: 'game' });
  }
  function leave() {
    if (!active) return;
    active = false;
    document.body.classList.remove('daily');
    if (stash) { Object.keys(stash.sc).forEach(function (k) { A.SC[k] = stash.sc[k]; }); A.setDraft(stash.draft); stash = null; }
    if (root.FAW_FLOW && root.FAW_FLOW.refresh) root.FAW_FLOW.refresh();
  }

  /* flow.js asks: the seed for the next snap, or null for a fresh one */
  function seed() { return active && !kept() ? seedFor(day) : null; }
  /* flow.js tells: a snap finished. The first one is the day's. */
  function snapped(res, play) {
    if (!active) return;
    var first = !kept();
    if (first) {
      keep({ win: res.win, yards: res.yards, callKey: res.callKey, seed: res.seed, drawn: play, title: res.title });
      if (API.signedIn ? API.signedIn() : token()) API.submit({ day: day, number: number, playId: today.id, converted: res.win, yards: res.yards, callKey: res.callKey, seed: res.seed, drawn: play })
        .then(function (r) { if (r && typeof r === 'object') { server = { streak: r.streak, best: r.best }; dayStats = { players: r.players, converted: r.convertedAll }; renderStats(); } });
      else API.day(day).then(function (x) { if (x && typeof x === 'object') { dayStats = x; renderStats(); } });
    }
    lastFirst = first;
    renderHome();
  }
  var lastFirst = false;
  /* the card's daily block: what really happened, the day so far */
  function card(res) {
    var box = $('rDaily'); if (!box) return;
    box.hidden = !active;
    if (!active) return;
    var k = kept();
    $('rDailyHead').textContent = lastFirst ? 'Daily #' + number + ' is in.' : 'Practice. Your daily stands: ' + (k && k.win ? 'converted' : 'stopped') + '.';
    $('rReal').textContent = realText(today);
    $('rVerdict').textContent = verdictText(today);
    $('rDown').textContent = 'Daily #' + number + ' · ' + downText(today) + ' · ' + spotText(today);
    renderStats();
  }
  function share(res) { return shareText(today, number, res); }

  $('hdGo') && $('hdGo').addEventListener('click', function () { A.show('daily'); });
  $('dGo') && $('dGo').addEventListener('click', enter);
  $('dBack') && $('dBack').addEventListener('click', function () { leave(); A.show('home'); });
  A.on('daily', renderIntro);
  A.on('home', function () { leave(); renderHome(); });
  A.on('play', leave);
  A.on('books', leave); A.on('learn', leave); A.on('test', leave); A.on('print', leave); A.on('replay', function () {});

  fetch(DATA).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.plays || !d.plays.length) return;
    plays = d.plays; today = playFor(plays, number);
    renderHome(); if (A.current() === 'daily') renderIntro();
    refreshStats();
  }).catch(function () {});
  if (root.RTG_AUTH && root.RTG_AUTH.onChange) root.RTG_AUTH.onChange(function (s) { if (s && s.resolved && today) refreshStats(); });

  root.FAW_DAILY = { active: function () { return active; }, today: function () { return today; }, day: function () { return day; }, number: function () { return number; },
    seed: seed, snapped: snapped, card: card, share: share, enter: enter, leave: leave, kept: kept, core: CORE };
})(typeof window !== 'undefined' ? window : this);
