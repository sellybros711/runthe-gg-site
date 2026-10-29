/* Run The Floor: the daily loop. The streak, the login track, the wheel,
 * the quests and Floor Rep.
 *
 * window.RTF_DAILY, and node can require it (hoops/check-daily.mjs). The plan
 * is hoops/design/ECONOMY.md section 7; every number is Run The Tour's.
 *
 * EVERYTHING HERE IS A KEYED LOG ON THE WARDROBE RECORD, beside the pack logs,
 * so two devices merge by union and nothing is stored that could be derived:
 *
 *   dp  { day: [t] }               a day a daily was played (the streak)
 *   dl  { day: [t] }               a day the game was opened (the login track)
 *   dw  { spinKey: [t, prize, rank] }  a wheel spin, decided when it was spun
 *   dg  { key: [t, n] }            banked spins given (a streak day, all quests)
 *   de  { ev:key: [t, ev] }        a thing a quest counts
 *   db  { key: [t, minutes] }      a Coin Rush won on the wheel
 *
 * The streak, its freezes, the spins left, the quests done and how long a Coin
 * Rush has to run are all READ off those logs. A reward is paid under a key
 * (coins into the wallet's ledger, shards and free packs into the pack logs,
 * a spin into dg), so asking twice pays once and two devices pay once.
 *
 * A DAY IS EASTERN (economy.js dayOf), the day every other daily here uses.
 */
(function(){
'use strict';

var API_VERSION = 1;
var isNode = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';
var X = isNode ? require('./economy.js') : (typeof window !== 'undefined' ? window.RTF_ECON : null);
var PK = isNode ? require('./packs.js') : (typeof window !== 'undefined' ? window.RTF_PACKS : null);

function obj(x){ return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function uid(){ return Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }
function rnd(rng){ return (rng || Math.random)(); }
function today(t){ return X.dayOf(t); }
/* a day as a whole number, so two days can be subtracted */
function dnum(d){ var p = String(d).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
function dstr(n){ var d = new Date(n * 864e5), p = function(x){ return (x < 10 ? '0' : '') + x; }; return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()); }
/* the Monday that starts a day's week */
function weekOf(d){ var n = dnum(d), wd = (new Date(n * 864e5).getUTCDay() + 6) % 7; return dstr(n - wd); }
function hash(s){ var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

var LOGS = ['dp', 'dl', 'dw', 'dg', 'de', 'db'];
function ensure(st){ LOGS.forEach(function(m){ if (!st[m] || typeof st[m] !== 'object') st[m] = {}; }); return st; }
function rows(st, m){ var o = obj(st[m]), out = []; for (var k in o) out.push([k].concat(o[k])); return out.sort(function(a, b){ return a[1] - b[1] || (a[0] < b[0] ? -1 : 1); }); }

/* ─── rewards ─────────────────────────────────────────────────────────────
   Run The Tour's tracks. A spin is the wheel; a mulligan there is a spin here. */
var STREAK = [null,
  { coins: 150 }, { coins: 350, shard: ['common', 2] }, { spin: 1 }, { pack: 'street' },
  { coins: 1000, shard: ['rare', 2] }, { spin: 1 }, { pack: 'league' }];
var LOGIN = [null,
  { coins: 50 }, { coins: 75 }, { coins: 100, shard: ['common', 1] }, { pack: 'street' },
  { coins: 150, shard: ['rare', 1] }, { spin: 1 }, { pack: 'street' }];
var FREEZE_AT = [7, 30, 100], FREEZE_MAX = 3;

/* pay one reward under one key: each part is keyed, so a replay pays nothing */
function grant(st, w, key, rew, src, t){
  var got = {};
  if (rew.coins && w) { var r = X.award(w, key, rew.coins, src || 'daily', { t: t }); if (r.paid) got.coins = r.amount; }
  if (rew.shard && PK.grantShards(st, key, rew.shard[0], rew.shard[1], t)) got.shard = rew.shard;
  if (rew.pack && PK.grantCredit(st, key, rew.pack, t)) got.pack = rew.pack;
  if (rew.spin && !st.dg[key]) { st.dg[key] = [t == null ? Date.now() : t, rew.spin]; got.spin = rew.spin; }
  return got;
}

/* ─── the streak ───────────────────────────────────────────────────────────
   Walked off the days played, oldest first. A day after the last carries it
   on; one missed day is bridged by a freeze if there is one; anything else
   starts again. A freeze is earned the day the streak reaches 7, 30 or 100.
   The streak is alive if its last day is today or yesterday (or the day
   before, with a freeze to bridge it). */
function streak(st, t){
  var days = Object.keys(obj(st.dp)).filter(function(d){ return /^\d{4}-\d\d-\d\d$/.test(d); }).map(dnum).sort(function(a, b){ return a - b; });
  var cur = 0, best = 0, fr = 0, last = null, pos = {}, bridged = [], seen = {};
  days.forEach(function(d){
    if (seen[d]) return; seen[d] = 1;
    if (last != null && d === last + 1) cur++;
    else if (last != null && d === last + 2 && fr > 0) { fr--; cur++; bridged.push(dstr(d - 1)); }
    else cur = 1;
    if (FREEZE_AT.indexOf(cur) >= 0) fr = Math.min(FREEZE_MAX, fr + 1);
    best = Math.max(best, cur);
    pos[dstr(d)] = ((cur - 1) % 7) + 1;
    last = d;
  });
  var n = dnum(today(t)), alive = last != null && (last >= n - 1 || (last === n - 2 && fr > 0));
  return { cur: alive ? cur : 0, best: best, freezes: alive ? fr : 0, played: last === n, last: last == null ? null : dstr(last), pos: pos, bridged: bridged,
    /* the next day's slot on the 7 day track */
    next: alive ? (last === n ? (cur % 7) + 1 : (cur % 7) + 1) : 1, today: dstr(n) };
}
/* a daily was finished today: file the day and pay its slot on the track */
function notePlayed(st, w, t){
  ensure(st);
  var d = today(t);
  if (!st.dp[d]) st.dp[d] = [t == null ? Date.now() : t];
  var s = streak(st, t), p = s.pos[d] || 1;
  return { day: d, pos: p, cur: s.cur, got: grant(st, w, 'sw:' + d, STREAK[p], 'streak', t), rew: STREAK[p] };
}

/* ─── the login track ──────────────────────────────────────────────────────
   Every day the game is opened moves it one slot, round seven. It never
   resets: it pays for coming back, not for a run of days. */
function loginPos(st, d){
  var all = Object.keys(obj(st.dl)).sort(), i = all.indexOf(d);
  return i < 0 ? (all.length % 7) + 1 : (i % 7) + 1;
}
function noteLogin(st, w, t){
  ensure(st);
  var d = today(t), fresh = !st.dl[d];
  if (fresh) st.dl[d] = [t == null ? Date.now() : t];
  var p = loginPos(st, d);
  return { day: d, pos: p, fresh: fresh, got: grant(st, w, 'lg:' + d, LOGIN[p], 'login', t), rew: LOGIN[p] };
}

/* ─── Floor Rep ────────────────────────────────────────────────────────────
   Badge points (bronze 1, silver 2, gold 4, ring 8) against the catalogue's
   total, at Run The Tour's fractions, and G.O.A.T. for every badge. Derived
   from the cabinet, so it never disagrees with it and needs no storage. */
var TIER_PTS = { bronze: 1, silver: 2, gold: 4, ring: 8 };
var RANKS = [['Walk-On', 0], ['Rookie', 0.01], ['Benchwarmer', 0.025], ['Garbage Time', 0.045], ['Rotation', 0.07],
  ['Sixth Man', 0.10], ['Starter', 0.135], ['Glue Guy', 0.175], ['Spark Plug', 0.22], ['Rising Star', 0.27],
  ['Star', 0.33], ['All-Star', 0.40], ['All-League', 0.47], ['Franchise', 0.55], ['Elite', 0.63],
  ['Superstar', 0.72], ['MVP', 0.81], ['Legend', 0.90], ['Icon', 0.965]];
var RANK_NAMES = RANKS.map(function(r){ return r[0]; }).concat(['G.O.A.T.']);
/* badges: the evaluated catalogue, [{ tier, got }] */
function rep(badges){
  var tot = 0, pts = 0, n = 0, got = 0;
  (badges || []).forEach(function(b){ var p = TIER_PTS[b.tier] || 1; tot += p; n++; if (b.got) { pts += p; got++; } });
  var idx = 0;
  for (var i = 0; i < RANKS.length; i++) if (pts >= Math.round(RANKS[i][1] * tot)) idx = i;
  if (n && got >= n) idx = RANKS.length;
  var at = idx < RANKS.length ? Math.round(RANKS[idx][1] * tot) : tot;
  var nx = idx + 1 < RANKS.length ? Math.round(RANKS[idx + 1][1] * tot) : tot;
  return { pts: pts, total: tot, idx: idx, name: RANK_NAMES[idx], next: idx >= RANKS.length ? null : RANK_NAMES[idx + 1],
    at: at, nextAt: nx, frac: idx >= RANKS.length ? 1 : Math.max(0, Math.min(1, (pts - at) / Math.max(1, nx - at))) };
}

/* ─── the wheel ────────────────────────────────────────────────────────────
   Thirteen wedges, Run The Tour's weights and coin ladder, scaled by Floor
   Rep (f is 0 at Walk-On and 1 at G.O.A.T.), so a promotion is always a
   strictly better wheel. Run The Tour's XP boosts are a COIN RUSH here: play
   pays double while one runs. */
var SHARD_STEPS = [[17, 'epic'], [7, 'rare'], [0, 'common']], PACK_STEPS = [[16, 'hof'], [10, 'league'], [0, 'street']];
function step(steps, i){ for (var k = 0; k < steps.length; k++) if (i >= steps[k][0]) return steps[k][1]; return steps[steps.length - 1][1]; }
function wheel(idx){
  idx = Math.max(0, Math.min(RANKS.length, idx | 0));
  var f = idx / RANKS.length;
  var sc = function(base, m){ return Math.round(base * (1 + m * f) / 10) * 10; };
  var cn = function(id, wt, amt){ return { id: id, w: wt, kind: 'coins', amt: amt }; };
  var sh = step(SHARD_STEPS, idx), pk = step(PACK_STEPS, idx);
  return [
    cn('cTn', 9 - 2 * f, sc(50, 1.2)),
    { id: 'r15', w: 8 - 2 * f, kind: 'rush', mins: 15 },
    cn('cXs', 9 - f, sc(100, 1.6)),
    { id: 'r30', w: 5, kind: 'rush', mins: 30 },
    cn('cSb', 10 - 2 * f, sc(160, 1.7)),
    { id: 'sh', w: 6 + f, kind: 'shard', r: sh, n: 1 },
    cn('cSm', 10 - f, sc(250, 1.9)),
    { id: 'pack', w: 3 + 1.5 * f, kind: 'pack', pack: pk },
    cn('cMd', 13, sc(600, 1.6)),
    { id: 'r60', w: 4 + f, kind: 'rush', mins: 60 },
    cn('cLg', 12 + 2 * f, sc(1200, 1.7)),
    { id: 'spin', w: 4 - 0.5 * f, kind: 'spin', n: 1 },
    cn('cBg', 6 + 2 * f, sc(2500, 1.8)),
  ];
}
function spins(st, t){
  var d = today(t), free = !obj(st.dw)['f:' + d], given = 0, used = 0;
  rows(st, 'dg').forEach(function(r){ given += Math.max(0, Math.round(+r[2] || 0)); });
  rows(st, 'dw').forEach(function(r){ if (/^b:/.test(r[0])) used++; });
  var banked = Math.max(0, given - used);
  return { free: free, banked: banked, total: (free ? 1 : 0) + banked };
}
function pick(pz, rng){
  var tot = pz.reduce(function(a, p){ return a + p.w; }, 0), r = rnd(rng) * tot;
  for (var i = 0; i < pz.length; i++) { r -= pz[i].w; if (r <= 0) return i; }
  return pz.length - 1;
}
/* spin(st, w, rankIdx, opts) -> { key, index, prize, got } or { err }.
   The free spin goes first, then a banked one. */
function spin(st, w, rankIdx, opts){
  var o = opts || {};
  ensure(st);
  var t = o.t == null ? Date.now() : o.t, s = spins(st, t);
  if (!s.total) return { err: 'nospin' };
  var key = s.free ? 'f:' + today(t) : 'b:' + (o.id || uid());
  if (st.dw[key]) return { err: 'already' };
  var pz = wheel(rankIdx), i = pick(pz, o.rng), p = pz[i];
  st.dw[key] = [t, p.id, rankIdx | 0];
  var got = {}, gk = 'wh:' + key;
  if (p.kind === 'coins') { var r = X.award(w, gk, p.amt, 'wheel', { t: t }); if (r.paid) got.coins = r.amount; }
  else if (p.kind === 'shard') { if (PK.grantShards(st, gk, p.r, p.n, t)) got.shard = [p.r, p.n]; }
  else if (p.kind === 'pack') { if (PK.grantCredit(st, gk, p.pack, t)) got.pack = p.pack; }
  else if (p.kind === 'spin') { st.dg[gk] = [t, p.n]; got.spin = p.n; }
  else if (p.kind === 'rush') { st.db[gk] = [t, p.mins]; got.rush = p.mins; }
  return { key: key, index: i, prize: p, got: got };
}
/* A Coin Rush is a window of real time. A second one won while the first runs
   adds to the end of it, never over it. */
function rushUntil(st){
  var until = 0;
  rows(st, 'db').forEach(function(r){ until = Math.max(until, r[1]) + Math.max(0, +r[2] || 0) * 60000; });
  return until;
}
function rushMult(st, t){ return rushUntil(st) > (t == null ? Date.now() : t) ? 2 : 1; }

/* ─── quests ───────────────────────────────────────────────────────────────
   Three a day out of six, four a week out of twelve (one from each group),
   picked by the day and the week, so every device sees the same ones. A quest
   counts events, and a pack opened or a spin spun is read off its own log. */
var DAILY = [
  { id: 'dd', ev: 'dd', n: 1, label: 'Play today\'s Daily Draft' },
  { id: 'run', ev: 'run', n: 1, label: 'Finish a Classic run' },
  { id: 'cs', ev: 'cs', n: 1, label: 'Close a career season' },
  { id: 'cq', ev: 'cq', n: 1, label: 'Win a Conquest game' },
  { id: 'ps', ev: 'pspar', n: 1, label: 'Solve Six Passes at par' },
  { id: 'look', ev: 'look', n: 1, label: 'Change your look' },
];
var WEEKLY = [
  [{ id: 'cs5', ev: 'cs', n: 5, label: 'Close 5 career seasons' }, { id: 'cf', ev: 'cf', n: 1, label: 'Finish a career' }, { id: 'cs8', ev: 'cs', n: 8, label: 'Close 8 career seasons' }],
  [{ id: 'dd3', ev: 'dd', n: 3, label: 'Play 3 Daily Drafts' }, { id: 'fx3', ev: 'fx', n: 3, label: 'Finish Fix History 3 times' }, { id: 'ps3', ev: 'ps', n: 3, label: 'Solve Six Passes 3 times' }],
  [{ id: 'run5', ev: 'run', n: 5, label: 'Finish 5 Classic runs' }, { id: 'cq8', ev: 'cq', n: 8, label: 'Win 8 Conquest games' }, { id: 'title', ev: 'title', n: 1, label: 'Win a title in Classic' }],
  [{ id: 'pk3', ev: 'pack', n: 3, label: 'Open 3 packs' }, { id: 'lk3', ev: 'look', n: 3, label: 'Change your look on 3 days' }, { id: 'sp4', ev: 'spin', n: 4, label: 'Spin the wheel 4 times' }],
];
function todays(d){
  var h = hash('dq:' + d), idx = [0, 1, 2, 3, 4, 5];
  for (var i = idx.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; var j = h % (i + 1), tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; }
  return idx.slice(0, 3).sort().map(function(i){ return DAILY[i]; });
}
function weeks(wk){ return WEEKLY.map(function(g, i){ return g[hash('wq:' + wk + ':' + i) % g.length]; }); }
/* how many of one event fall inside a range of days */
function count(st, ev, from, to){
  var a = dnum(from), b = dnum(to), n = 0, inR = function(t){ var d = dnum(today(t)); return d >= a && d <= b; };
  if (ev === 'pack') { rows(st, 'po').forEach(function(r){ if (inR(r[1])) n++; }); return n; }
  if (ev === 'spin') { rows(st, 'dw').forEach(function(r){ if (inR(r[1])) n++; }); return n; }
  rows(st, 'de').forEach(function(r){ if (r[2] === ev && inR(r[1])) n++; });
  return n;
}
function quests(st, t){
  var d = today(t), wk = weekOf(d), end = dstr(dnum(wk) + 6);
  var dq = todays(d).map(function(q){ var c = count(st, q.ev, d, d); return Object.assign({ have: Math.min(q.n, c), done: c >= q.n }, q); });
  var wq = weeks(wk).map(function(q){ var c = count(st, q.ev, wk, end); return Object.assign({ have: Math.min(q.n, c), done: c >= q.n }, q); });
  return { day: d, week: wk, ends: end, daily: dq, weekly: wq,
    dailyAll: dq.every(function(q){ return q.done; }), weeklyAll: wq.every(function(q){ return q.done; }) };
}
var QREW = function(){ return {
  quest: { coins: X.RATE.quest }, all: { coins: X.RATE.questAll, shard: ['common', 1], spin: 1 },
  weekly: { coins: X.RATE.weekly, shard: ['rare', 1] }, weekAll: { pack: 'league' } }; };
/* pay every quest that is done and not yet paid. Idempotent. */
function settleQuests(st, w, t){
  ensure(st);
  var q = quests(st, t), R = QREW(), out = [];
  q.daily.forEach(function(x){ if (x.done) { var g = grant(st, w, 'qd:' + q.day + ':' + x.id, R.quest, 'quest', t); if (g.coins) out.push(x.label); } });
  if (q.dailyAll) grant(st, w, 'qda:' + q.day, R.all, 'quest', t);
  q.weekly.forEach(function(x){ if (x.done) { var g = grant(st, w, 'qw:' + q.week + ':' + x.id, R.weekly, 'quest', t); if (g.coins) out.push(x.label); } });
  if (q.weeklyAll) grant(st, w, 'qwa:' + q.week, R.weekAll, 'quest', t);
  return out;
}
/* one event, keyed: the same thing noted twice counts once */
function note(st, ev, key, t){
  ensure(st);
  var k = ev + ':' + key;
  if (st.de[k]) return false;
  st.de[k] = [t == null ? Date.now() : t, ev];
  /* an event older than sixty days counts for nothing and is let go */
  var old = dnum(today(t)) - 60;
  for (var x in st.de) if (dnum(today(st.de[x][0])) < old) delete st.de[x];
  return true;
}

/* ─── the logs on the record (cleaned and merged with the wardrobe) ───────── */
function cleanLogs(out, s){
  s = obj(s);
  LOGS.forEach(function(m){
    var src = obj(s[m]), dst = out[m] = {};
    for (var k in src) { var v = src[k]; if (Array.isArray(v) && typeof v[0] === 'number') dst[k] = v.slice(); }
  });
  return out;
}
function mergeLogs(out, a, b){
  LOGS.forEach(function(m){
    var all = {}, k, x = obj(a[m]), y = obj(b[m]);
    for (k in x) all[k] = x[k];
    for (k in y) { var p = all[k], q = y[k]; if (!p || q[0] < p[0] || (q[0] === p[0] && JSON.stringify(q) < JSON.stringify(p))) all[k] = q; }
    out[m] = {};
    Object.keys(all).sort().forEach(function(k2){ out[m][k2] = all[k2]; });
  });
  return out;
}
function logCount(s){ var n = 0; LOGS.forEach(function(m){ n += Object.keys(obj(s[m])).length; }); return n; }

var API = {
  API_VERSION: API_VERSION, LOGS: LOGS, STREAK: STREAK, LOGIN: LOGIN, FREEZE_AT: FREEZE_AT, FREEZE_MAX: FREEZE_MAX,
  RANK_NAMES: RANK_NAMES, TIER_PTS: TIER_PTS, DAILY: DAILY, WEEKLY: WEEKLY,
  dnum: dnum, dstr: dstr, weekOf: weekOf, today: today,
  streak: streak, notePlayed: notePlayed, loginPos: loginPos, noteLogin: noteLogin,
  rep: rep, wheel: wheel, spins: spins, spin: spin, rushUntil: rushUntil, rushMult: rushMult,
  todays: todays, weeks: weeks, count: count, quests: quests, settleQuests: settleQuests, note: note, rewards: QREW,
  cleanLogs: cleanLogs, mergeLogs: mergeLogs, logCount: logCount, ensure: ensure,
};
if (isNode) module.exports = API;
else if (typeof window !== 'undefined') window.RTF_DAILY = API;
})();
