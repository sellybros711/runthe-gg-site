/* Shut The Door: the mock API, for building the UI before the engine lands.
 *
 * window.STD_API, ONLY when the real one (api.js, Agent A's) is absent. The
 * same four async calls as CONTRACT.md section 9, served over the FICTIONAL
 * fixture in fixtures/mock-scenario.json. Nothing here is the real engine:
 * the grade is a rough stand-in so the bands have a spread, the resolution is
 * a few dice so every screen gets visited. The UI must never read anything off
 * this file that the contract does not promise, so when api.js arrives this
 * file steps aside and nothing else changes.
 *
 * It also stands in for two other files Agent A owns:
 *   STD_SHARE  the share text (CONTRACT.md section 11), until share.js
 *   STD_AUTH   accounts, shaped like baseball/auth.js's RTD_AUTH, until auth.js
 * The interfaces assumed are written down in CONTRACT_REQUESTS.md.
 *
 * Deterministic like the real one: one mulberry32 stream per outing, drawn in
 * a fixed order per pitch (miss x, miss z, the library draw, the runner draw),
 * so a reload replays the stored calls to the same state.
 */
(function () {

/* A mock test switch in the address (?mockEnd=, ?mockLesson= and the rest)
   puts the mock in front of the real files, for test/check-browser.mjs.
   Without one, the real api.js, share.js and auth.js stand. */
var FORCE = /[?&]mock/i.test(location.search);

'use strict';
var C = window.STD_CONTRACT;
if (!C) return;

/* ---- share text (section 11) ------------------------------------------- */

/* the outcome in words: contract.js's label, in lower case, as share.js has it */
function shareText(r, number) {
  var lines = [C.SHARE_TITLE + ' #' + number];
  lines.push(String(C.OUTCOME_LABEL[r.outcome] || '').toLowerCase() + ' · better than ' + Math.round(r.percentile) + '% of closers');
  if (r.pitchedLike && r.pitchedLike.name) lines.push('pitched like ' + r.pitchedLike.name);
  var sq = (r.strip || []).map(function (b) { return C.SQUARE[b]; });
  for (var i = 0; i < sq.length; i += C.SQUARES_PER_LINE) lines.push(sq.slice(i, i + C.SQUARES_PER_LINE).join(''));
  lines.push(C.SHARE_URL);
  return lines.join('\n');
}
if (!window.STD_SHARE || FORCE) window.STD_SHARE = { text: shareText, MOCK: true };

/* ---- accounts stub (the RTD_AUTH shape) --------------------------------- */

/* ?mockAuth=1 signs the stub in as a fictional player, so the account paths
   (the stats sheet's myStats(), the result's account block) can be built and
   checked before auth.js lands. */
/* shutdoor_board()'s rows (153), FICTIONAL: made up handles, scores and
   outcomes, so the board screen can be built and checked without a server.
   ?mockBoard=empty answers no rows, fail answers null (the call failed),
   deep puts your row far below the top, anything else a full board.
   ?mockAuth=1 makes one of the rows yours. */
var BOARD_NAMES = ['paintsblack', 'highcheese', 'backdoorslider', 'ninthinning', 'lockdownlefty', 'gasmonkey', 'splitfinger', 'bullpencart',
  'framejob', 'chinmusic', 'upstairs', 'sweeperking', 'knucklepuck', 'tunnelvision', 'fullcount', 'corners', 'runnersonsecond', 'pitchclock'];
function mockBoard(day, limit) {
  var mode = (/[?&]mockBoard=([^&]*)/.exec(location.search) || [])[1] || 'full';
  if (mode === 'fail') return Promise.resolve(null);
  if (mode === 'empty') return Promise.resolve([]);
  var signed = mockSignedIn();
  var players = 240, mine = signed ? (mode === 'deep' ? 131 : 18) : 0, lim = Math.max(1, Math.min(100, limit || 50));
  var rows = [];
  for (var rk = 1; rk <= players; rk++) {
    if (rk > lim && rk !== mine) continue;
    var f = rk / players;
    /* in score order, as the real scores fall: doors shut, held ties, doors open, walk-offs */
    var outcome = rk <= 24 ? 'door_shut' : rk <= 34 ? 'tie_held' : rk <= 44 ? 'doors_open' : 'walk_off';
    var pitches = 8 + ((rk * 7) % 17);
    var score = Math.round(940 - f * 860);
    var strip = [];
    for (var i = 0; i < pitches; i++) strip.push(['green', 'green', 'yellow', 'orange', 'red'][(rk + i * 3) % (f < 0.3 ? 3 : 5)]);
    rows.push({
      rank: rk, username: rk === mine ? 'mockplayer' : BOARD_NAMES[rk % BOARD_NAMES.length] + (rk > BOARD_NAMES.length ? rk : ''),
      outcome: outcome, pitches: pitches, score: score, percentile: Math.round((1 - f) * 100), pitched_like: null,
      strip: strip, mine: rk === mine, players: players,
    });
  }
  return Promise.resolve(rows);
}
/* ?mockAuth=late starts signed out and lets the sheet's sign in succeed (any email and password), so
   "sign in to save your score" can be walked end to end: the listeners hear it, as auth.js's do. */
var AUTH_MODE = (/[?&]mockAuth=([^&]*)/.exec(location.search) || [])[1] || '';
var mockIn = AUTH_MODE === '1';
var authListeners = [];
function mockSignedIn() { return mockIn; }
if (!window.STD_AUTH || FORCE) {
  var none = function () { return Promise.resolve({ error: 'accounts are not available here yet.' }); };
  var authState = function () { return mockIn ? { ready: true, waiting: false, signedIn: true, name: 'mockplayer', email: 'mock@example.com', userId: 'mock-user' } : { ready: AUTH_MODE === 'late', waiting: false, signedIn: false }; };
  var lateIn = function () {
    mockIn = true;
    setTimeout(function () { authListeners.slice().forEach(function (f) { try { f(authState()); } catch (e) {} }); }, 0);
    return Promise.resolve({ error: null });
  };
  window.STD_AUTH = {
    API_VERSION: 0,
    MOCK: true,
    boot: function () { return false; },
    state: authState,
    onChange: function (f) { authListeners.push(f); return function () { authListeners = authListeners.filter(function (x) { return x !== f; }); }; },
    signIn: AUTH_MODE === 'late' ? lateIn : none, signUp: none, signInGoogle: none, signOut: function () { return Promise.resolve({ error: null }); },
    token: function () { return null; },
    board: mockBoard,
    /* shutdoor_my_stats()'s shape (153, and tieHeld from 155), plus the
       bands and recent rows the device history also carries */
    myStats: function () {
      if (!mockIn) return Promise.resolve(null);
      return Promise.resolve({
        played: 12, doorShut: 7, tieHeld: 2, doorsOpen: 1, walkOff: 2, streak: 3, best: 5, avgPercentile: 61,
        bands: { green: 71, yellow: 30, orange: 14, red: 6 },
        recent: [
          { day: '2026-10-16', number: 12, outcome: 'door_shut', strip: ['green', 'green', 'yellow', 'green', 'green'] },
          { day: '2026-10-15', number: 11, outcome: 'tie_held', strip: ['yellow', 'orange', 'green', 'red', 'green', 'green'] },
          { day: '2026-10-14', number: 10, outcome: 'walk_off', strip: ['yellow', 'orange', 'green', 'red'] },
        ],
      });
    },
  };
}

if (window.STD_API && !FORCE) return;

/* Test switches, read off the page's own address. Mock only; they never
   reach the real API. ?mockEnd= door_shut | tie_held | doors_open | walk_off
   forces a scripted outing that ends that way (the end rules: a solo home run
   ties it and play goes on; tie_held then strikes out the side; doors_open
   runs a runner put out on a double play, ties it, then goes ahead with the
   walk-off off, as in an 8th inning; walk_off scores runners for the lead);
   ?mockProxy=1 marks the spot proxy;
   ?mockNull=1 gives the reveal no pitch count, only its note;
   ?mockLesson=none and ?mockPro=none give the result no lesson, or a
   lesson with no pro example (CONTRACT.md section 15).
   ?mockAbs= (rules 4, ABS challenges; a comma list) reaches the states a real
   outing rarely does: miss has the umpire call every take within MISS_IN of
   the edge the wrong way, so a challenge can win; batter has the batter
   challenge every called strike while he has one left. */
var QS = (function () { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; } })();
var SCRIPTS = {
  door_shut: ['K'],
  tie_held: ['home_run', 'K'],
  doors_open: ['single', 'double_play', 'home_run', 'home_run'],
  walk_off: ['single', 'single', 'home_run'],
};
var MOCK = { lessonNone: QS.get('mockLesson') === 'none', proNone: QS.get('mockPro') === 'none', script: SCRIPTS[QS.get('mockEnd')] || null, proxy: QS.get('mockProxy') === '1', nullPitches: QS.get('mockNull') === '1',
  /* a go-ahead run is door's open only with the walk-off off (the fixture's 9th has it on) */
  noWalkOff: QS.get('mockEnd') === 'doors_open',
  absMiss: /(^|,)miss(,|$)/.test(QS.get('mockAbs') || ''), absBatter: /(^|,)batter(,|$)/.test(QS.get('mockAbs') || '') };
var MISS_IN = 4;

/* ---- the seeded stream ---------------------------------------------------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashSeed(s) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/* one uniform to a rough standard normal (a logistic with unit spread) */
function gauss(u) { u = Math.min(0.999, Math.max(0.001, u)); return Math.log(u / (1 - u)) * 0.5513; }

/* ---- the fixture ------------------------------------------------------------ */

var FIX = null;
function load() {
  if (FIX) return Promise.resolve(FIX);
  return fetch('fixtures/mock-scenario.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('the mock scenario did not load'); return r.json(); })
    .then(function (j) { if (MOCK.noWalkOff) j.scenario.situation.walkOffLive = false; FIX = j; return j; });
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---- the state machine -------------------------------------------------------- */

function freshState(scn, mode, seed, id) {
  var s = scn.situation;
  return {
    outingId: id, scenarioId: scn.id, mode: mode, seed: seed, status: 'live',
    pitchNo: 0, count: { b: 0, s: 0 }, outs: s.outs, bases: s.bases,
    score: { us: s.score.us, them: s.score.them }, batterIndex: 0,
    strip: [], shutItLive: false, log: [], grades: [],
    /* rules 4 (CONTRACT.md 5f): challenges left a side, whether one is live, the events */
    abs: { left: { pitcher: C.ABS.PER_SIDE, batter: C.ABS.PER_SIDE }, challengeLive: false, events: [] },
    debug: { seed: seed, tiers: [] },
  };
}
function batterOf(scn, i) { return scn.batters[i % scn.batters.length]; }
function pitchOf(scn, type) { var a = scn.pitcher.arsenal; for (var i = 0; i < a.length; i++) if (a[i].type === type) return a[i]; return null; }

/* The stand-in grade. A call is worth the hold% it leaves, roughly: strikes
   and whiffs help, balls hurt more with three of them, contact in his damage
   cells hurts most with men on and a thin lead. Averaged over the pitcher's
   miss (a 3x3 spread at his sigma), so command matters. */
function baseHold(st) {
  var margin = st.score.us - st.score.them;
  var on = (st.bases & 1 ? 1 : 0) + (st.bases & 2 ? 1.3 : 0) + (st.bases & 4 ? 1.6 : 0);
  var h = 0.74 + 0.06 * (margin - 1) + 0.07 * st.outs - 0.06 * on + 0.012 * (st.count.s - st.count.b);
  return Math.max(0.05, Math.min(0.985, h));
}
function callValue(scn, st, call) {
  var bt = batterOf(scn, st.batterIndex), pr = bt.profile, ap = pitchOf(scn, call.type);
  var tgt = C.targetOf(call.cell), sig = ap.sigmaFt, zr = bt.szTop - bt.szBot;
  var b = st.count.b, s = st.count.s;
  var S = s === 2 ? 0.07 : 0.028, B = b === 3 ? 0.075 : 0.016;
  var margin = st.score.us - st.score.them;
  var D = 0.2 * (1 + 0.35 * ((st.bases & 1 ? 1 : 0) + (st.bases & 2 ? 1 : 0) + (st.bases & 4 ? 1 : 0))) * (margin <= 1 ? 1.35 : 1);
  var wh = (pr.whiff[call.type] != null ? pr.whiff[call.type] : 0.25) + (call.type === 'FF' ? (ap.velo - 94) * 0.012 : 0);
  var ev = 0, W = [0.25, 0.5, 0.25], O = [-1.1, 0, 1.1];
  for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
    var w = W[i] * W[j];
    var a = C.cellAt(tgt.x + O[i] * sig, tgt.zn + O[j] * sig / zr);
    var z = C.inZone(a);
    var sw = pr.swing[a] + (s === 2 ? (z ? 0.1 : 0.14) : 0) - (b === 3 && !z ? 0.06 : 0);
    sw = Math.max(0, Math.min(0.97, sw));
    var whf = Math.max(0.03, Math.min(0.8, wh * (z ? 0.85 : 1.5)));
    var pStrike = (1 - sw) * (z ? 1 : 0) + sw * whf;
    var pBall = (1 - sw) * (z ? 0 : 1);
    var pContact = sw * (1 - whf);
    var dmg = pContact * 0.55 * pr.heat[a] * (z ? 1 : 0.55);
    ev += w * (pStrike * S - pBall * B - dmg * D);
  }
  return Math.max(0.5, Math.min(99.5, (baseHold(st) + ev) * 100));
}
function gradeCall(scn, st, call) {
  var value = callValue(scn, st, call), best = -1, bestCall = null;
  scn.pitcher.arsenal.forEach(function (ap) {
    for (var c = 0; c < C.GRID.CELLS; c++) {
      var v = callValue(scn, st, { type: ap.type, cell: c });
      if (v > best) { best = v; bestCall = { type: ap.type, cell: c }; }
    }
  });
  var lost = Math.max(0, Math.round((best - value) * 10) / 10);
  var bt = batterOf(scn, st.batterIndex), pr = bt.profile, ap = pitchOf(scn, call.type), bp = pitchOf(scn, bestCall.type);
  var reason;
  if (lost <= 0.5) {
    reason = C.inZone(call.cell)
      ? 'he misses the ' + ap.name + ' ' + Math.round((pr.whiff[call.type] || 0.25) * 100) + '% of the time he swings.'
      : 'he chases ' + Math.round(pr.chase * 100) + '% of the time.';
  } else if (C.inZone(call.cell) && pr.heat[call.cell] >= 0.33) {
    reason = 'that is his hot spot. ' + pr.heat[call.cell].toFixed(3).replace(/^0/, '') + ' xwoba on contact there.';
  } else if (st.count.b === 3 && !C.inZone(call.cell)) {
    reason = 'three balls. a miss there walks him.';
  } else if (st.count.s === 2 && pr.notes && pr.notes[0]) {
    reason = pr.notes[0] + '.';
  } else {
    reason = 'the ' + bp.name + ' was the better pitch here.';
  }
  return {
    band: C.bandOf(lost), value: Math.round(value * 10) / 10, best: Math.round(best * 10) / 10,
    lost: lost, bestCall: bestCall, reason: reason, reDelta: -Math.round(lost * 10) / 1000,
    tied: st.score.us === st.score.them,
  };
}

var FIELD_GB = ['third', 'short', 'second', 'first'];
function fieldOf(spray, ground) {
  if (ground) return FIELD_GB[Math.max(0, Math.min(3, Math.floor((spray + 45) / 22.5)))];
  return spray < -15 ? 'left' : spray > 15 ? 'right' : 'center';
}

/* Runners. moves: from 0 (batter) or 1..3 to 1..3 or 4 (scored). Processed
   lead runner first so nobody passes anybody. */
function advance(bases, plan) {
  var occ = [0, bases & 1 ? 1 : 0, bases & 2 ? 1 : 0, bases & 4 ? 1 : 0];
  var moves = [], runs = 0, nb = 0, lead = 5;
  for (var b = 3; b >= 0; b--) {
    if (b > 0 && !occ[b]) continue;
    var to = Math.min(4, plan(b));
    if (b === 0 && to <= 0) continue;            // the batter is out: the caller says so with to -1
    if (to < 4 && to >= lead) to = lead - 1;
    if (to <= b && b > 0) { lead = b; nb |= (1 << (b - 1)); continue; }
    moves.push({ from: b, to: to });
    if (to === 4) runs++; else { nb |= (1 << (to - 1)); lead = to; }
  }
  return { bases: nb, moves: moves, runs: runs };
}
function forced(bases) {
  return advance(bases, function (b) {
    if (b === 0) return 1;
    if (b === 1) return 2;
    if (b === 2) return (bases & 1) ? 3 : 2;
    return (bases & 1) && (bases & 2) ? 4 : 3;
  });
}

function resolve(scn, st, call, rng, absRng) {
  var bt = batterOf(scn, st.batterIndex), pr = bt.profile, ap = pitchOf(scn, call.type);
  var tgt = C.aimPoint ? C.aimPoint(call.cell, call.at) : C.targetOf(call.cell), zr = bt.szTop - bt.szBot;
  /* the fixed order: miss x, miss z, the library draw, the runner draw */
  /* the release scales the miss, as in the engine (contract.js spreadOf; no q is 1.0x) */
  var sg = ap.sigmaFt * (C.spreadOf ? C.spreadOf(call.q) : 1);
  var mx = gauss(rng()) * sg, mz = gauss(rng()) * sg / zr;
  var lib = rng(), run = rng();
  var actual = { x: Math.round((tgt.x + mx) * 1000) / 1000, zn: Math.round((tgt.zn + mz) * 1000) / 1000 };
  var cell = C.cellAt(actual.x, actual.zn), z = C.inZone(cell);
  var b = st.count.b, s = st.count.s;
  var sw = Math.max(0, Math.min(0.97, pr.swing[cell] + (s === 2 ? (z ? 0.1 : 0.14) : 0)));
  var whf = Math.max(0.03, Math.min(0.8, (pr.whiff[call.type] || 0.25) * (z ? 0.85 : 1.5)));
  /* the library draw, cut into the decisions a real pitch would carry */
  var u1 = lib, u2 = (lib * 7.13) % 1, u3 = (lib * 31.7) % 1, u4 = (lib * 97.3) % 1;
  var swing = u1 < sw;
  var scr = st._script || MOCK.script;
  var forcedR = scr ? scr[Math.min(st.pitchNo, scr.length - 1)] : null;
  if (forcedR) swing = true;
  var res = { batter: swing ? 'swing' : 'take' };
  var inBatterSide = bt.bats === 'R' ? C.colOf(cell) === 0 : C.colOf(cell) === 4;
  /* rules 4: a take is called where it crossed, by the umpire's chance there (contract.js UMPIRE).
     The call reads the same library draw, so there is no new draw. */
  var dIn = C.zoneDist(actual.x, actual.zn, zr);
  if (!swing) {
    if (inBatterSide && u2 < 0.06 && C.rowOf(cell) >= 1 && C.rowOf(cell) <= 3) res.result = 'hit_by_pitch';
    else if (MOCK.absMiss && Math.abs(dIn) < MISS_IN) res.result = dIn >= 0 ? 'ball' : 'called_strike';
    else res.result = ((lib * 211.7) % 1) < C.calledStrikeP(dIn) ? 'called_strike' : 'ball';
  } else if (u2 < whf) res.result = 'swinging_strike';
  else if (u3 < (z ? 0.42 : 0.55)) res.result = (s === 2 && u4 < 0.12) ? 'foul_tip' : 'foul';
  else res.result = 'in_play';
  if (forcedR) res.result = forcedR === 'K' ? 'swinging_strike' : 'in_play';

  var out = { n: st.pitchNo + 1, call: { type: call.type, cell: call.cell }, actual: actual, actualCell: cell,
    velo: call.e != null && C.stuffAt ? C.stuffAt(ap, call.e).velo : Math.round((ap.velo + gauss(u4) * 0.8) * 10) / 10, batter: res.batter, result: res.result,
    countBefore: { b: b, s: s }, runnerMoves: [], runs: 0, paOver: false,
    drawn: { id: 'mock:' + st.pitchNo + ':' + Math.floor(lib * 1e6), tier: u3 < 0.6 ? 'batter' : u3 < 0.9 ? 'similar' : 'league' } };
  var outs = st.outs, bases = st.bases, nb = b, ns = s;
  if (res.result === 'ball' || res.result === 'called_strike') {
    /* the ABS zone's answer, for the challenge and the quick replay (contract.js ABS) */
    out.abs = { called: res.result, strike: dIn >= 0, d: Math.round(dIn * 100) / 100 };
    /* the batter's challenge, right away, on a called strike: a draw from the outing's second
       stream, taken only when he can challenge */
    if (res.result === 'called_strike' && st.abs.left.batter > 0) {
      var g = absRng();
      if (MOCK.absBatter || g < C.challengeP('batter', -dIn, s === 2)) {
        var over = dIn < 0;
        out.challenge = { by: 'batter', call: 'called_strike', abs: over ? 'ball' : 'strike', overturned: over };
        if (!over) st.abs.left.batter--;
        if (over) out.result = res.result = 'ball';
      }
    }
  }

  if (res.result === 'ball') {
    nb++;
    if (nb === 4) { var w = forced(bases); bases = w.bases; out.runnerMoves = w.moves; out.runs = w.runs; out.paOver = true; }
  } else if (res.result === 'hit_by_pitch') {
    var hb = forced(bases); bases = hb.bases; out.runnerMoves = hb.moves; out.runs = hb.runs; out.paOver = true;
  } else if (res.result === 'called_strike' || res.result === 'swinging_strike' || res.result === 'foul_tip') {
    ns++;
    if (ns === 3) { outs++; out.paOver = true; }
  } else if (res.result === 'foul') {
    if (ns < 2) ns++;
  } else {
    /* in play: a batted ball off the heat map */
    var dmg = pr.heat[cell] * (z ? 1 : 0.6);
    var hit = forcedR ? /single|double$|triple|home_run/.test(forcedR) : u2 < dmg * 1.15;
    var spray = Math.round((u3 * 90 - 45) * 10) / 10;
    var bb, r, ev, la;
    if (hit) {
      r = forcedR || (u4 < 0.1 + dmg * 0.25 ? 'home_run' : u4 < 0.38 ? 'double' : u4 < 0.41 ? 'triple' : u4 < 0.44 ? 'error' : 'single');
      bb = r === 'home_run' ? 'fly' : r === 'single' || r === 'error' ? (u3 < 0.5 ? 'ground' : 'line') : 'line';
    } else {
      bb = u4 < 0.45 ? 'ground' : u4 < 0.75 ? 'fly' : u4 < 0.88 ? 'line' : 'popup';
      r = 'out';
      if (bb === 'ground' && outs < 2 && (bases & 1) && run < 0.45) r = 'double_play';
      if (bb === 'fly' && outs < 2 && (bases & 4) && run < 0.7) r = 'sac_fly';
      if (forcedR) { r = forcedR; bb = r === 'double_play' ? 'ground' : bb; }
    }
    ev = bb === 'ground' ? 84 + u2 * 16 : bb === 'line' ? 95 + u2 * 13 : bb === 'fly' ? (r === 'home_run' ? 104 : 88) + u2 * 10 : 70 + u2 * 10;
    la = bb === 'ground' ? -10 + u3 * 14 : bb === 'line' ? 10 + u3 * 12 : bb === 'fly' ? 24 + u3 * 14 : 52 + u3 * 12;
    var adv;
    if (r === 'home_run') adv = advance(bases, function () { return 4; });
    else if (r === 'triple') adv = advance(bases, function (bb2) { return bb2 === 0 ? 3 : 4; });
    else if (r === 'double') adv = advance(bases, function (bb2) { return bb2 === 0 ? 2 : bb2 === 1 ? (run < 0.4 ? 4 : 3) : 4; });
    else if (r === 'single' || r === 'error') adv = advance(bases, function (bb2) { return bb2 === 0 ? 1 : bb2 === 1 ? (run < 0.3 ? 3 : 2) : bb2 === 2 ? (run < 0.6 ? 4 : 3) : 4; });
    else if (r === 'double_play') {
      outs += 2;
      var rest = bases & ~1;
      adv = outs >= 3 ? { bases: rest, moves: [], runs: 0 } : advance(rest, function (bb2) { return bb2 === 0 ? 0 : bb2 + 1; });
      adv.moves = [{ from: 1, to: -1 }, { from: 0, to: -1 }].concat(adv.moves);
    } else if (r === 'sac_fly') {
      outs += 1;
      adv = advance(bases, function (bb2) { return bb2 === 3 ? 4 : bb2 === 0 ? 0 : bb2; });
      adv.moves = [{ from: 0, to: -1 }].concat(adv.moves);
    } else {
      outs += 1;
      if (outs >= 3) adv = { bases: bases, moves: [], runs: 0 };
      else if (bb === 'ground') adv = advance(bases, function (bb2) { return bb2 === 0 ? 0 : bb2 === 3 ? (run < 0.5 ? 4 : 3) : bb2 + 1; });
      else adv = { bases: bases, moves: [], runs: 0 };
      adv.moves = [{ from: 0, to: -1 }].concat(adv.moves);
    }
    bases = adv.bases; out.runnerMoves = adv.moves; out.runs = adv.runs; out.paOver = true;
    var f = fieldOf(spray, bb === 'ground');
    var text = {
      single: 'single to ' + f, double: 'double to ' + f, triple: 'triple to ' + f, home_run: 'home run to ' + f,
      error: 'error on the ' + (bb === 'ground' ? f : f + ' fielder'), double_play: 'double play',
      sac_fly: 'sac fly to ' + f,
      out: bb === 'ground' ? 'grounded out to ' + f : bb === 'fly' ? 'flied out to ' + f : bb === 'line' ? 'lined out to ' + f : 'popped out',
    }[r];
    out.inPlay = { bb: bb, ev: Math.round(ev * 10) / 10, la: Math.round(la), spray: spray, result: r, text: text };
  }
  if (out.paOver) { nb = 0; ns = 0; }
  out.count = { b: nb, s: ns };
  out.outs = Math.min(3, outs);
  out.bases = out.outs >= 3 ? 0 : bases;
  return out;
}

function apply(scn, st, call, rng, absRng) {
  var grade = gradeCall(scn, st, call);
  (st._pre = st._pre || []).push({ count: { b: st.count.b, s: st.count.s }, outs: st.outs, bases: st.bases, batterIndex: st.batterIndex, margin: st.score.us - st.score.them });
  /* for the pitcher's side's challenge on this pitch */
  st._undo = { count: { b: st.count.b, s: st.count.s }, outs: st.outs, bases: st.bases, batterIndex: st.batterIndex, them: st.score.them };
  var pr = resolve(scn, st, call, rng, absRng);
  st.pitchNo = pr.n;
  st.count = pr.count; st.outs = pr.outs; st.bases = pr.bases;
  st.score.them += pr.runs;
  if (pr.paOver) st.batterIndex++;
  st.strip.push(grade.band);
  st.log.push(pr); st.grades.push(grade);
  st.debug.tiers.push(pr.drawn.tier);
  endRules(scn, st);
  return { pitchResult: pr, pitchGrade: grade };
}
/* the end rules (CONTRACT.md section 8): a tie plays on */
function endRules(scn, st) {
  st.status = 'live'; st.outcome = null;
  var sit = scn.situation;
  if (st.score.them > st.score.us) { st.status = 'over'; st.outcome = sit.walkOffLive ? 'walk_off' : 'doors_open'; }
  else if (st.outs >= 3) { st.status = 'over'; st.outcome = st.score.them === st.score.us ? 'tie_held' : 'door_shut'; }
  st.shutItLive = st.status === 'live' && st.count.s === 2 && st.outs === 2;
}

/* rules 4: the pitcher's side may challenge the last pitch right now: a ball the umpire called (not
   one a batter's challenge made), not yet challenged, with a challenge left. Also on a ball four
   that ended the outing, until finishOuting. As engine.js challengeLive. */
function absLive(o) {
  var st = o.st, p = st.log[st.log.length - 1];
  return !o.result && !!p && !!p.abs && p.abs.called === 'ball' && !p.challenge && st.abs.left.pitcher > 0;
}
/* rules 4: the pitcher's side challenges the last called ball (engine.js challengePitch). The ABS
   zone decides. Overturned, the pitch is a called strike: the count, the outs and the end as if it
   had been called one. Upheld, a challenge is gone. The call carries ch: 1, so a resume replays it. */
function challengePitch(o) {
  if (!absLive(o)) throw new Error('no challenge to make');
  var st = o.st, pr = st.log[st.log.length - 1], over = pr.abs.strike;
  pr.challenge = { by: 'pitcher', call: 'ball', abs: over ? 'strike' : 'ball', overturned: over };
  o.calls[o.calls.length - 1].ch = 1;
  pr.call.ch = 1;
  if (!over) { st.abs.left.pitcher--; return pr; }
  var u = st._undo, b = u.count.b, s = u.count.s + 1, paOver = s === 3;
  st.count = paOver ? { b: 0, s: 0 } : { b: b, s: s };
  st.outs = Math.min(3, u.outs + (paOver ? 1 : 0));
  st.bases = st.outs >= 3 ? 0 : u.bases;
  st.batterIndex = u.batterIndex + (paOver ? 1 : 0);
  st.score.them = u.them;
  pr.result = 'called_strike';
  pr.count = { b: st.count.b, s: st.count.s }; pr.outs = st.outs; pr.bases = st.bases;
  pr.runnerMoves = []; pr.runs = 0; pr.paOver = paOver;
  endRules(o.scn, st);
  return pr;
}

/* ---- the four calls ------------------------------------------------------------- */

var OUTINGS = {};
function snapshot(o) {
  var s = clone(o.st); delete s.outcome; delete s._pre; delete s._undo; delete s._script;
  s.abs.challengeLive = absLive(o);
  s.abs.events = s.log.filter(function (p) { return p.challenge; }).map(function (p) { return Object.assign({ n: p.n }, p.challenge); });
  return s;
}
function saveDaily(o) {
  if (o.st.mode !== 'daily') return;
  try { localStorage.setItem(C.OUTING_KEY, JSON.stringify({ day: o.day, scenarioId: o.scn.id, calls: o.calls })); } catch (e) {}
}

function getScenario(day) {
  return load().then(function (j) {
    var s = clone(j.scenario);
    delete s.reveal;
    s.day = day || s.day;
    if (day && day !== C.easternDay()) s.number = C.dayNumberOf(day);
    if (MOCK.proxy) s.resolution = 'proxy';
    if (VOTE_MODE === 'locked' && (!day || day === C.easternDay())) s.pick = 'vote';
    return s;
  });
}

function startOuting(scenarioId, seed, opts) {
  var mode = (opts && opts.mode) === 'practice' ? 'practice' : (opts && opts.mode) === 'archive' ? 'archive' : 'daily';
  if (mode === 'archive' && !ENT_PRO) return Promise.reject(new Error('the archive is for Pro'));
  if (mode === 'archive' && !(opts.day && opts.day < C.easternDay())) return Promise.reject(new Error('not an archive day'));
  return load().then(function (j) {
    var scn = j.scenario;
    if (scenarioId !== scn.id) throw new Error('no such scenario: ' + scenarioId);
    var day = mode === 'archive' ? opts.day : C.easternDay();
    if (mode === 'archive') seed = hashSeed(C.DAILY_SEED_PREFIX + day);
    var sd = mode === 'daily' ? hashSeed(C.DAILY_SEED_PREFIX + day) : (seed >>> 0);
    if (mode === 'archive' && OUTINGS['archive:' + day + ':' + sd]) return snapshot(OUTINGS['archive:' + day + ':' + sd]);
    var id = mode + ':' + day + ':' + sd;
    var o = { scn: scn, day: day, calls: [], rng: mulberry32(sd), absRng: mulberry32(hashSeed('abs|' + sd)), st: freshState(scn, mode, sd, id) };
    if (mode === 'daily') {
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(C.OUTING_KEY) || 'null'); } catch (e) {}
      if (saved && saved.day === day && saved.scenarioId === scn.id && Array.isArray(saved.calls)) {
        saved.calls.forEach(function (c) {
          if (o.st.status !== 'live') return;
          var ch = c.ch === 1;
          c = Object.assign({}, c); delete c.ch;
          o.calls.push(c); apply(scn, o.st, c, o.rng, o.absRng);
          if (ch && absLive(o)) challengePitch(o);   // a challenge made right after this pitch
        });
      }
    }
    OUTINGS[id] = o;
    if (mode === 'daily') DAILY = o;
    return snapshot(o);
  });
}

function throwPitch(outingId, call) {
  return Promise.resolve().then(function () {
    var o = OUTINGS[outingId];
    if (!o) throw new Error('no such outing');
    if (o.st.status !== 'live') throw new Error('the outing is over');
    if (!pitchOf(o.scn, call.type)) throw new Error('not in his arsenal: ' + call.type);
    if (!(call.cell >= 0 && call.cell < C.GRID.CELLS)) throw new Error('no such cell');
    var c = { type: call.type, cell: call.cell | 0 }; if (Array.isArray(call.at)) c.at = [+call.at[0], +call.at[1]];
    if (call.q != null && C.releaseQ) c.q = C.releaseQ(call.q);
    if (call.e != null && C.effortE) c.e = C.effortE(call.e);
    if (call.at != null && C.aimAt) c.at = C.aimAt(call.at);
    o.calls.push(c);
    var r = apply(o.scn, o.st, c, o.rng, o.absRng);
    saveDaily(o);
    return { pitchResult: clone(r.pitchResult), pitchGrade: clone(r.pitchGrade), state: snapshot(o) };
  });
}

/* rules 4 (CONTRACT.md section 9): the pitcher's side challenges the last pitch's called ball. Only
   while state.abs.challengeLive, before the next throw and before finishOuting. */
function challenge(outingId) {
  return Promise.resolve().then(function () {
    var o = OUTINGS[outingId];
    if (!o) throw new Error('no such outing');
    if (o.result) throw new Error('the outing is finished');
    var pr = challengePitch(o);
    saveDaily(o);
    return { pitchResult: clone(pr), state: snapshot(o) };
  });
}

function finishOuting(outingId) {
  return Promise.resolve().then(function () {
    var o = OUTINGS[outingId];
    if (!o) throw new Error('no such outing');
    if (o.st.status !== 'over') throw new Error('the outing is not over');
    if (o.result) return clone(o.result);
    var st = o.st, j = FIX;
    var q = st.grades.reduce(function (a, g) { return a + Math.max(0, 100 - g.lost * 9); }, 0) / Math.max(1, st.grades.length);
    var score = Math.round(q * 6 + { door_shut: 320, tie_held: 215, doors_open: 110, walk_off: 0 }[st.outcome]);
    var sc = j.pool.scores, below = 0;
    for (var i = 0; i < sc.length; i++) if (sc[i] < score) below++;
    var fam = { hard: 0, breaking: 0, offspeed: 0 };
    o.calls.forEach(function (c) { fam[C.FAMILY_OF[c.type]]++; });
    var n = Math.max(1, o.calls.length);
    var pl = fam.breaking / n > 0.45 ? j.pool.closers[0] : fam.hard / n > 0.6 ? j.pool.closers[2] : j.pool.closers[1];
    var rv = clone(o.scn.reveal);
    if (MOCK.nullPitches) { rv.pitches = null; rv.pitchesNote = 'at least 13 pitches'; }
    var runs = st.score.them - o.scn.situation.score.them;
    var mine = C.OUTCOME_RANK[st.outcome], his = C.OUTCOME_RANK[rv.outcome];
    var hp = typeof rv.pitches === 'number' ? rv.pitches : null;
    var vs = mine > his ? 'beat' : mine < his ? 'lost' : runs < rv.runs ? 'beat' : runs > rv.runs ? 'lost' :
      hp == null || st.pitchNo === hp ? 'matched' : st.pitchNo < hp ? 'beat' : 'lost';
    var r = {
      outcome: st.outcome, pitches: st.pitchNo, strip: st.strip.slice(), score: score,
      percentile: Math.round(below / sc.length * 100), pitchedLike: { name: pl.name, reason: pl.reason },
      reveal: rv, vsReal: vs,
    };
    r.lesson = MOCK.lessonNone ? null : mockLesson(o);
    /* the pool's scores for the end screen's chart (CONTRACT_REQUESTS.md B11) */
    r.pool = { scores: sc.slice() };
    if (o.st.mode !== 'survivor') r.share = window.STD_SHARE.text(r, o.scn.number);
    var au = window.STD_AUTH && window.STD_AUTH.state && window.STD_AUTH.state();
    if (o.st.mode === 'daily' && au && au.signedIn) { r.account = mockAccount(st.outcome); o.posted = true; }
    if (o.st.mode === 'archive') r.archive = { kept: true, taken: true };
    if (o.surv) r.survivor = survivorFinished(o, r);
    o.result = r;
    return clone(r);
  });
}

/* ---- the lesson (section 15), FICTIONAL ------------------------------------
   A stand-in for Agent A's lesson.js: the costliest pitch, a principle picked
   from that pitch's state by a few plain rules, and copy built from the
   fixture's own numbers. The pro example is invented and says so: the pitcher
   is "Mock Pro". The real one is a real pitch from the library. */
function pct(v) { return Math.round(v * 100) + '%'; }
function xw(v) { return v.toFixed(3).replace(/^0/, ''); }
function mockLesson(o) {
  var st = o.st, scn = o.scn, worst = -1, lost = -1;
  st.grades.forEach(function (g, i) { if (g.lost > lost) { lost = g.lost; worst = i; } });
  if (worst < 0 || lost <= C.BANDS[0].maxLost) return null;
  var g = st.grades[worst], pre = st._pre[worst], call = st.log[worst].call, best = g.bestCall;
  var bt = batterOf(scn, pre.batterIndex), pr = bt.profile, c = pre.count;
  var ap = pitchOf(scn, call.type), bp = pitchOf(scn, best.type);
  var sameSide = bt.bats === scn.pitcher.throws, bestBreaking = C.FAMILY_OF[best.type] === 'breaking';
  var p;
  if ((pre.bases & 4) && pre.outs < 2) p = 'strikeout_with_runner_on_third';
  else if ((pre.bases & 1) && pre.outs < 2 && C.rowOf(best.cell) >= 3) p = 'double_play_ball';
  else if (c.b === 3 && pre.margin <= 1) p = 'dont_walk_the_tying_run';   // tied, it is the go-ahead run
  else if (c.b > c.s) p = 'strike_when_behind';
  else if (c.s > c.b && !C.inZone(best.cell)) p = 'chase_when_ahead';
  else if (c.b === 0 && c.s === 0) p = 'first_pitch_strike';
  else if (C.inZone(call.cell) && pr.heat[call.cell] >= 0.33) p = 'avoid_his_damage';
  else if (sameSide && bestBreaking) p = 'same_side_breaker_away';
  else p = 'use_your_best_pitch';
  var cnt = c.b + '-' + c.s;
  var bWh = pr.whiff[best.type], cHeat = pr.heat[call.cell], bHeat = pr.heat[best.cell];
  var T = {
    strikeout_with_runner_on_third: ['runner on third. go for the strikeout', 'next time, with a man on third, throw the pitch he misses.'],
    double_play_ball: ['runner on first. get the ground ball', 'next time, with a man on first, keep it down.'],
    dont_walk_the_tying_run: [cnt + '. do not walk the ' + (pre.margin === 0 ? 'go-ahead' : 'tying') + ' run', 'next time at three balls, make him hit his way on.'],
    strike_when_behind: ['behind ' + cnt + '. throw a strike', 'next time behind in the count, come back to the zone.'],
    chase_when_ahead: ['ahead ' + cnt + '. make him chase', 'next time ahead ' + cnt + ', put the ' + bp.name + ' just off the plate.'],
    first_pitch_strike: ['0-0. get strike one', 'next time, start him with a strike he does not hit.'],
    avoid_his_damage: ['you went to his hot spot', 'next time, scout him first. stay out of the red.'],
    same_side_breaker_away: ['same side. breaking ball away', 'next time, against a ' + (bt.bats === 'R' ? 'righty' : 'lefty') + ', slide the ' + bp.name + ' away from him.'],
    use_your_best_pitch: ['trust the ' + bp.name, 'next time, in a big spot, lean on the ' + bp.name + '.'],
  }[p];
  var why = [];
  if (bWh != null) why.push('he misses the ' + bp.name + ' ' + pct(bWh) + ' of the time he swings.');
  why.push(C.inZone(call.cell) ? 'where you threw it he hits ' + xw(cHeat) + ' on contact.' : 'he chases ' + pct(pr.chase) + ' of pitches off the plate.');
  if (bHeat < cHeat) why.push('the better spot drops that to ' + xw(bHeat) + '.');
  var fam = { hard: 0, breaking: 0, offspeed: 0 };
  o.calls.forEach(function (x) { fam[C.FAMILY_OF[x.type]]++; });
  var pattern;
  if (o.calls.length >= 5 && fam.hard / o.calls.length >= 0.6) pattern = 'you threw ' + fam.hard + ' of ' + o.calls.length + ' fastballs. this lineup chased breaking balls.';
  return {
    pitchN: worst + 1, call: { type: call.type, cell: call.cell }, bestCall: { type: best.type, cell: best.cell },
    count: { b: c.b, s: c.s }, outs: pre.outs, bases: pre.bases, tied: pre.margin === 0, batter: bt.name, principle: p,
    headline: T[0], why: why.slice(0, 3), nextTime: T[1],
    numbers: { lostPts: g.lost, callValue: g.value, bestValue: g.best },
    pro: MOCK.proNone ? null : {
      pitcher: 'Mock Pro', batter: 'Mock Hitter', date: '2024-10-01', game: 'mock series game 1',
      count: { b: c.b, s: c.s }, outs: pre.outs, bases: pre.bases, type: best.type, cell: best.cell,
      result: p === 'double_play_ball' ? 'ground ball double play' : 'swinging strike', id: 'mock:0:0:0',
    },
    pattern: pattern,
  };
}

/* ---- the board's paths, the vote, Survivor, the archive (CONTRACT.md 9, 16, 17) ------------
   Test switches, mock only:
   ?mockAuth=late   signed out, and the account sheet's sign in succeeds (see the stub above)
   ?mockVote=       open: tomorrow's two candidates, a vote to cast; voted: already cast; locked:
                    today's daily was picked by a vote (the home says so). Without it the vote is
                    not on yet, as before VOTE.EPOCH. The two cards are the real schedule's
                    candidates for the vote's first day (modes.js), never a reveal.
   ?mockSurv=N      Survivor: situations before index N are doors shut, N is a walk-off (default 2)
   ?mockSurvBoard=  empty | fail, for the Survivor board's states
   ?mockEnt=pro     entitlements say Pro: the archive and unlimited Survivor runs. The real gate is
                    false for everyone. */
var DAILY = null;
var VOTE_MODE = QS.get('mockVote') || '';
var ENT_PRO = QS.get('mockEnt') === 'pro';
var SURV_END = QS.get('mockSurv') != null ? Math.max(0, +QS.get('mockSurv') | 0) : 2;
var SURV_KEY = 'std_mock_survivor_v1';
function signedIn() { var a = window.STD_AUTH; try { return !!(a && a.state && a.state().signedIn); } catch (e) { return false; } }
function mockAccount(outcome) { return { streak: outcome === 'door_shut' ? 4 : 0, best: 5, rank: 18, players: 240, taken: true, keptScore: null }; }

function entitlements() { return Promise.resolve({ signedIn: signedIn(), pro: ENT_PRO, archive: ENT_PRO, survivorRuns: ENT_PRO ? null : 1 }); }

/* today's finished daily that is not on the board yet (the real one reads std_outing_v1) */
function pending() {
  var o = DAILY;
  if (!o || !o.result || o.posted || o.day !== C.easternDay()) return null;
  return { day: o.day, number: o.scn.number, scenarioId: o.scn.id, score: o.result.score, outcome: o.result.outcome, pitches: o.result.pitches };
}
function claim() {
  if (!signedIn()) return Promise.resolve(null);
  if (!pending()) return Promise.resolve({ posted: false });
  DAILY.result.account = mockAccount(DAILY.result.outcome);
  DAILY.posted = true;
  return Promise.resolve({ posted: true, account: clone(DAILY.result.account) });
}
/* a sign-in posts the day's finished daily by itself and says so, as api.js does */
if (window.STD_AUTH && window.STD_AUTH.onChange) window.STD_AUTH.onChange(function (st) {
  if (!st || !st.signedIn) return;
  claim().then(function (r) { if (r && r.posted) window.dispatchEvent(new CustomEvent('std-claimed', { detail: r })); });
});

var SCH = null;
function schedule() {
  if (!SCH) SCH = fetch('data/schedule.json').then(function (r) { if (!r.ok) throw new Error('no schedule'); return r.json(); });
  return SCH;
}
function addDay(d, n) { return new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
function voteShape(day) {
  var M = window.STD_MODES, today = C.easternDay(), tmrw = addDay(today, 1);
  var none = { day: day, open: false, candidates: [], myVote: null, votes: null, winner: null, canVote: false, why: 'no vote for that day', offline: false };
  if (!VOTE_MODE || !M) return Promise.resolve(none);
  if (day === today && VOTE_MODE !== 'locked') return Promise.resolve(none);
  if (day === tmrw && VOTE_MODE === 'locked') return Promise.resolve(none);
  return Promise.all([schedule(), load()]).then(function (got) {
    var sch = got[0], fx = got[1].scenario;
    var ids = M.candidates(sch, M.VOTE.EPOCH), cards = ids.map(function (id) { return Object.assign({ id: id }, sch.packs[id].card); });
    /* today's locked vote: the mock's own spot won it */
    if (day === today) return Object.assign(none, { candidates: [{ id: fx.id, title: fx.title, pitcher: fx.pitcher.name, year: fx.pitcher.year, situation: fx.situation }, cards[1]],
      winner: fx.id, votes: { a: 63, b: 48 }, why: 'voting is closed' });
    var mine = MY_VOTE || (VOTE_MODE === 'voted' ? ids[1] : null);
    var done = !!(DAILY && DAILY.result);
    return Object.assign(none, {
      open: true, candidates: cards, myVote: mine,
      votes: mine ? { a: 41 + (mine === ids[0] ? 1 : 0), b: 56 + (mine === ids[1] ? 1 : 0) } : null,
      canVote: !mine && signedIn() && done,
      why: mine ? 'you voted' : !signedIn() ? 'sign in to vote' : !done ? 'finish today\'s daily to vote' : null,
    });
  });
}
var MY_VOTE = null;
function vote(day) { return voteShape(day || addDay(C.easternDay(), 1)); }
function castVote(id) {
  var tmrw = addDay(C.easternDay(), 1);
  return voteShape(tmrw).then(function (v) {
    if (!signedIn()) return Object.assign(v, { error: 'sign in to vote' });
    if (!v.canVote) return Object.assign(v, { error: v.why || 'voting is closed' });
    if (!v.candidates.some(function (c) { return c.id === id; })) return Object.assign(v, { error: 'not a candidate' });
    MY_VOTE = id;
    return voteShape(tmrw);
  });
}

/* Survivor over the fixture: every situation is the mock spot on its own seed */
function survRead() { try { var r = JSON.parse(localStorage.getItem(SURV_KEY) || 'null'); return r && r.day === C.easternDay() ? r : null; } catch (e) { return null; } }
function survWrite(r) { try { localStorage.setItem(SURV_KEY, JSON.stringify(r)); } catch (e) {} }
function survSum(r) {
  var e = r ? r.entries : [];
  return { run: r ? r.run : null, index: e.length, saves: e.filter(function (x) { return x.outcome === 'door_shut'; }).length,
    points: e.reduce(function (a, x) { return a + x.score; }, 0), over: e.some(function (x) { return x.outcome !== 'door_shut'; }) };
}
function survivorState() {
  return load().then(function (j) {
    var r = survRead(), sum = survSum(r);
    return Object.assign(sum, {
      day: C.easternDay(), signedIn: signedIn(), pro: ENT_PRO, canStart: !r || !sum.over || ENT_PRO,
      entries: r ? r.entries.map(function (x) { return { scenarioId: x.scenarioId, title: j.scenario.title, outcome: x.outcome, pitches: x.pitches, score: x.score }; }) : [],
      runs: [], offline: false,
    });
  });
}
function survivorStart() {
  return load().then(function (j) {
    var day = C.easternDay(), r = survRead();
    if (r && survSum(r).over) {
      if (!ENT_PRO) throw new Error('one run a day');
      r = { day: day, run: r.run + 1, entries: [] };
    }
    if (!r) r = { day: day, run: 0, entries: [] };
    survWrite(r);
    var i = r.entries.length, scn = j.scenario;
    var sd = hashSeed('mock-survivor-' + day + '-' + r.run + '-' + i), id = 'survivor:' + day + ':' + r.run + ':' + i;
    var o = OUTINGS[id];
    if (!o) {
      o = { scn: scn, day: day, calls: [], rng: mulberry32(sd), absRng: mulberry32(hashSeed('abs|' + sd)), st: freshState(scn, 'survivor', sd, id), surv: { run: r.run, index: i } };
      o.st._script = SCRIPTS[i >= SURV_END ? 'walk_off' : 'door_shut'];
      OUTINGS[id] = o;
    }
    var sc = clone(scn); delete sc.reveal;
    sc.day = day; sc.number = null; sc.survivor = { run: r.run, index: i };
    return { run: r.run, index: i, saves: survSum(r).saves, scenario: sc, state: snapshot(o) };
  });
}
function survivorFinished(o, res) {
  var r = survRead() || { day: o.day, run: o.surv.run, entries: [] };
  if (r.run === o.surv.run && r.entries.length === o.surv.index) {
    r.entries.push({ scenarioId: o.scn.id, outcome: res.outcome, pitches: res.pitches, score: res.score });
    survWrite(r);
  }
  var sum = survSum(r);
  return { run: o.surv.run, index: o.surv.index, saves: sum.saves, over: sum.over, posted: signedIn() };
}
function survivorClaim() { return Promise.resolve(signedIn() ? { posted: false } : null); }
/* the Survivor board, FICTIONAL: made up handles, run 0 of each */
function survivorBoard(day, limit) {
  var mode = QS.get('mockSurvBoard') || 'full';
  if (mode === 'fail') return Promise.resolve(null);
  if (mode === 'empty') return Promise.resolve([]);
  var r = survRead(), sum = survSum(r), mine = signedIn() && r && r.run === 0 ? sum : null;
  var players = 96, lim = Math.max(1, Math.min(100, limit || 50)), rows = [];
  var at = mine ? Math.max(1, 31 - mine.saves * 6) : 0;
  for (var rk = 1, k = 0; rk <= players; rk++) {
    if (rk === at) { rows.push({ rank: rk, username: 'mockplayer', saves: mine.saves, points: mine.points, over: mine.over, mine: true, players: players }); continue; }
    if (rk > lim) continue;
    k++;
    var saves = Math.max(0, 9 - Math.floor(rk / 6)), pts = saves * 410 + 380 - (rk % 6) * 37;
    rows.push({ rank: rk, username: BOARD_NAMES[k % BOARD_NAMES.length] + (k > BOARD_NAMES.length ? k : ''), saves: saves, points: pts, over: rk % 7 !== 3, mine: false, players: players });
  }
  return Promise.resolve(rows);
}

window.STD_API = { API_VERSION: 1, MOCK: true, getScenario: getScenario, startOuting: startOuting, throwPitch: throwPitch, challenge: challenge, finishOuting: finishOuting,
  pending: pending, claim: claim, entitlements: entitlements, vote: vote, castVote: castVote,
  survivorState: survivorState, survivorStart: survivorStart, survivorClaim: survivorClaim, survivorBoard: survivorBoard };
})();
