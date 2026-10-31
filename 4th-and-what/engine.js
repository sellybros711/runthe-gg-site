/* 4th and What: the play, simulated.
 *
 *   FAW_ENGINE.run(scenario, play, seed) -> result
 *
 * A pure function. No DOM, no clock, no Math.random: every roll comes from
 * mulberry32 off the seed, and the decisions use only + - * / and sqrt,
 * which every JavaScript engine rounds the same way. So the same seed and
 * the same drawn play give the same result, frame for frame, anywhere.
 *
 * WHAT IT SIMULATES (the vault's 4th-and-what-sim note has the long form):
 *   the call     rolled per snap: cover 0, 1, 2 or 3, man or zone, blitz or not
 *   protection   the pocket holds for a time set by blockers against rushers
 *   routes       run exactly as drawn, then on the same line; cuts cost speed
 *   coverage     man trails with a lag; zone drops to landmarks and plays the
 *                nearest receiver inside its zone
 *   the read     up to three reads, in order. He throws to the read his eyes
 *                are on when that man is open, or on time at the end of his
 *                route; covered there, his eyes move to the next read. The
 *                last read is the checkdown: if the pocket goes first, the
 *                ball goes there; if there is none, a
 *                sack or a throwaway
 *   the catch    one roll on separation, distance, pressure and direction
 *   after it     the carrier runs until a free defender reaches him; contact
 *                is a roll to break it, then a fall forward
 *   runs         each blocker holds a defender for a window; unblocked
 *                defenders pursue; a tiny fumble roll at contact
 *
 * A play is drawn relative to the ball (dx across, dy downfield); see
 * config.js. The result carries every frame for the picture, the events for
 * the captions, the call, the spot, the outcome and its one line reason.
 *
 * Plain script: window.FAW_ENGINE, module.exports in node.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var CFG = isNode ? require('./config.js') : root.FAW_CONFIG;
  var FM = isNode ? require('./formations.js') : root.FAW_FORMATIONS;
  var RNG = isNode ? require('./rng.js') : root.FAW_RNG;

  var FIELD_W = 160 / 3;

  /* ---------- small vector helpers (exact arithmetic only) ---------- */
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function dist(a, b) { return len(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* A logit squashed to a chance with no exp, so it is the same everywhere:
     the logistic curve is 0.5 + 0.5 tanh(z / 2), and tanh here is the
     rational fit x (27 + x^2) / (27 + 9 x^2), within a percent of it. */
  function chance(z) {
    var h = clamp(z / 2, -3, 3), th = h * (27 + h * h) / (27 + 9 * h * h);
    return 0.5 + 0.5 * clamp(th, -1, 1);
  }
  /* A heading in whole degrees for the picture: 0 is downfield, 90 toward
     the right sideline. Drawing only; no decision reads it. */
  function heading(vx, vy) {
    if (vx * vx + vy * vy < 0.04) return null;
    var a = Math.atan2(vx, vy) * 180 / Math.PI;
    return Math.round(a);
  }

  /* ---------- copy ---------- */

  /* "the 33", "your 45", "midfield". y is field yards from the offense's goal line. */
  function spotName(y) {
    var r = Math.round(y);
    if (r >= 100) return 'the end zone';
    if (r === 50) return 'midfield';
    return r > 50 ? 'the ' + (100 - r) : 'your ' + r;
  }
  function downName(distance, Y0) { return Y0 + distance >= 100 ? '4th and goal' : '4th and ' + distance; }
  function yardsWord(n) { return n === 1 || n === -1 ? 'yard' : 'yards'; }

  /* What the defense was in, as the result screen says it. */
  function callName(c) {
    var cov = { cover0: 'Cover 0', cover1: 'Cover 1', cover2: 'Cover 2', cover3: 'Cover 3' }[c.coverage];
    return cov + (c.man ? ' man' : ' zone') + (c.blitz ? ', blitz' : ', no blitz');
  }
  function callLine(c) {
    var deep = { cover0: 'Nobody deep.', cover1: 'One safety deep.', cover2: 'Two deep.', cover3: 'Three deep.' }[c.coverage];
    return deep + ' ' + (c.rushers > 4 ? c.rushers + ' rushers.' : 'Four man rush.');
  }

  /* A drawn route, named the way a coach would call it, for the captions. */
  function routeName(start, pts) {
    if (!pts || !pts.length) return 'route';
    var last = pts[pts.length - 1], prev = pts.length > 1 ? pts[pts.length - 2] : start;
    var dx = last[0] - prev[0], dy = last[1] - prev[1], L = len(dx, dy) || 1;
    var depth = last[1] - start[1], inward = (dx * (start[0] < 0 ? 1 : -1)) / L;
    if (dy / L < -0.4) return depth > 9 ? 'comeback' : 'curl';
    if (dy / L > 0.8) return depth > 14 ? 'go' : 'seam';
    if (dy / L > 0.35) {
      if (inward > 0) return depth > 12 ? 'post' : 'slant';
      /* outside and up: a corner deep, a fade on the way, a flat when it stays short */
      return depth > 12 ? 'corner' : depth <= 6 && dy / L < 0.65 ? 'flat' : 'fade';
    }
    if (inward > 0) return depth > 6 ? 'dig' : 'drag';
    return depth > 3 ? 'out' : 'flat';
  }

  /* ---------- the call ---------- */

  /* Every call the defense can make, by its key. Test it runs a play against
     each. Cover 0 is always a blitz. */
  var CALLS = {
    cover0: { coverage: 'cover0', blitz: true }, cover1: { coverage: 'cover1', blitz: false }, cover1b: { coverage: 'cover1', blitz: true },
    cover2: { coverage: 'cover2', blitz: false }, cover2b: { coverage: 'cover2', blitz: true },
    cover3: { coverage: 'cover3', blitz: false }, cover3b: { coverage: 'cover3', blitz: true }
  };
  var CALL_KEYS = Object.keys(CALLS);
  function callKey(c) { return c.coverage === 'cover0' ? 'cover0' : c.coverage + (c.blitz ? 'b' : ''); }

  function rollCall(T, distance, box, rnd) {
    var w = distance <= 3 ? T.calls.short : distance <= 7 ? T.calls.medium : T.calls.long;
    var keys = ['cover0', 'cover1', 'cover2', 'cover3'], sum = 0, i;
    for (i = 0; i < 4; i++) sum += w[keys[i]];
    var r = rnd() * sum, cov = keys[3];
    for (i = 0; i < 4; i++) { r -= w[keys[i]]; if (r < 0) { cov = keys[i]; break; } }
    var pb = w.blitz + Math.max(0, box - 6) * T.boxBlitz;
    var blitz = cov === 'cover0' ? true : rnd() < pb;
    return { coverage: cov, man: cov === 'cover0' || cov === 'cover1', blitz: blitz, rushers: 4 + (cov === 'cover0' ? 2 : blitz ? 1 : 0) };
  }

  /* ---------- the run ---------- */

  function run(scenario, play, seed, opt) {
    opt = opt || {};
    var T = opt.tuning || CFG.TUNING, A = CFG.ARCHETYPES;
    var rnd = RNG.mulberry32(seed >>> 0);
    var dt = T.dt, distance = scenario.distance;
    var Y0 = 100 - scenario.ballOn, BX = scenario.ballX;
    var marker = Math.min(100, Y0 + distance);
    var setDef = FM.BY_ID[play.formation] || FM.SETS[0];
    var O = FM.place(setDef.id, play.moved);
    var Dal = FM.defense(setDef.id, play.moved, distance);
    var box = FM.boxCount(Dal);
    var isRun = !!(play.handoff && play.handoff.to);
    var routes = {}, blocks = {};
    (play.routes || []).forEach(function (r, i) { if (r && r.pts && r.pts.length) routes[r.who] = { pts: r.pts, order: i + 1 }; });
    (play.blocks || []).forEach(function (b) { if (b && b.to) blocks[b.who] = b.to; });
    var targets = isRun ? [] : (play.targets || []).filter(function (id) { return routes[id] && !blocks[id]; }).slice(0, 3);
    var eye = 0, eyeAt = 0;
    var abs = function (p) { return { x: clamp(BX + p[0], 0.3, FIELD_W - 0.3), y: Y0 + p[1] }; };

    /* The call is always rolled, so the dice after it fall the same way. A
       forced call (Test it, against one defense) then replaces what it says. */
    var call = rollCall(T, distance, box, rnd);
    if (opt.call && CALLS[opt.call]) {
      var fc = CALLS[opt.call];
      call = { coverage: fc.coverage, man: fc.coverage === 'cover0' || fc.coverage === 'cover1', blitz: fc.blitz,
        rushers: 4 + (fc.coverage === 'cover0' ? 2 : fc.blitz ? 1 : 0) };
    }
    var events = [];
    var say = function (t, kind, text, extra) { var e = { t: Math.round(t * 1000) / 1000, kind: kind, text: text }; if (extra) for (var k in extra) e[k] = extra[k]; events.push(e); };

    /* ---- the players ---- */
    var E = [], byId = {};
    function mk(id, side, role, at, arch) {
      var p = abs(at);
      var e = { id: id, side: side, role: role, x: p.x, y: p.y, x0: p.x, y0: p.y, vx: 0, vy: 0, v: 0, run: 0,
        arch: arch || null, top: 7, burst: 0.5, plan: 'stand', hist: [], engaged: null, missed: 0, pose: 'idle', face: side === 'O' ? 0 : 180 };
      E.push(e); byId[id] = e; return e;
    }
    FM.LINEMEN.forEach(function (id) { var e = mk(id, 'O', 'ol', O[id]); e.top = 5; e.power = 0.65; e.plan = 'ol'; });
    FM.EDITABLE.forEach(function (id) {
      var ak = scenario.roster[id], a = A[ak];
      var e = mk(id, 'O', id === 'QB' ? 'qb' : 'skill', O[id], a);
      e.top = a.speed; e.burst = a.burst; e.cut = a.cut; e.power = a.power; e.label = a.label;
    });
    Dal.forEach(function (d) { var e = mk(d.id, 'D', d.role, d.at); e.top = T.speed[d.role]; e.burst = d.role === 'dl' ? 0.6 : 0.45; });
    var QB = byId.QB;
    var offense = E.filter(function (e) { return e.side === 'O'; }), defense = E.filter(function (e) { return e.side === 'D'; });

    /* ---- the offense's plans ---- */
    FM.ELIGIBLE.forEach(function (id) {
      var e = byId[id];
      if (blocks[id]) { e.plan = 'block'; e.blockTo = abs([O[id][0] + clampLen(blocks[id], O[id])[0], O[id][1] + clampLen(blocks[id], O[id])[1]]); }
      else if (routes[id]) { e.plan = 'route'; e.path = routes[id].pts.map(abs); e.wp = 0; e.order = routes[id].order; }
    });
    function clampLen(to, from) {
      var dx = to[0] - from[0], dy = to[1] - from[1], L = len(dx, dy);
      var k = L > 3.5 ? 3.5 / L : 1;
      return [dx * k, dy * k];
    }
    var carrier = null, ballCarrierId = null;
    if (isRun) {
      var who = byId[play.handoff.to] || QB;
      who.plan = 'carry'; who.path = (play.handoff.path || []).map(abs); who.wp = 0;
      ballCarrierId = who.id;
    }
    var stayIns = FM.ELIGIBLE.filter(function (id) { return byId[id].plan === 'block'; }).length;

    /* ---- the defense's plans ---- */
    var dlist = defense.slice();
    var rushers = dlist.filter(function (d) { return d.role === 'dl'; });
    var extra = call.rushers - 4;
    if (extra > 0) {
      /* blitzers: the backers nearest the ball first, then a nickel or a safety */
      var pool = dlist.filter(function (d) { return d.role !== 'dl'; })
        .sort(function (a, b) { return (Math.abs(a.x - BX) + (a.y - Y0) * 0.8 + (a.role === 'lb' ? 0 : 6)) - (Math.abs(b.x - BX) + (b.y - Y0) * 0.8 + (b.role === 'lb' ? 0 : 6)); });
      for (var bi = 0; bi < extra && bi < pool.length; bi++) { pool[bi].blitz = true; rushers.push(pool[bi]); }
    }
    rushers.forEach(function (d) { d.plan = 'rush'; });
    var coverers = dlist.filter(function (d) { return d.plan !== 'rush'; });
    var receivers = FM.ELIGIBLE.map(function (id) { return byId[id]; }).filter(function (e) { return e.plan !== 'block'; });

    function landmark(dx, dy) { return { x: clamp(BX + dx, 1, FIELD_W - 1), y: Y0 + dy }; }
    function takeNearest(list, pt, pref) {
      var best = null, bs = 1e9;
      list.forEach(function (d) {
        if (d.plan !== 'stand') return;
        var s = len(d.x - pt.x, d.y - pt.y) + (pref && pref.indexOf(d.role) < 0 ? 12 : 0);
        if (s < bs) { bs = s; best = d; }
      });
      return best;
    }
    coverers.forEach(function (d) { d.plan = 'stand'; });
    if (call.man) {
      if (call.coverage === 'cover1') {
        var fs = takeNearest(coverers, landmark(0, 14), ['s']);
        if (fs) { fs.plan = 'zone'; fs.mark = landmark(0, 14); fs.deep = true; fs.width = 15; }
      }
      /* outside receivers first, each to the nearest free defender who can run with him */
      receivers.slice().sort(function (a, b) { return Math.abs(b.x - BX) - Math.abs(a.x - BX); }).forEach(function (r) {
        var wide = Math.abs(r.x - BX) > 7;
        var d = takeNearest(coverers, r, wide ? ['cb'] : ['cb', 's', 'lb']);
        if (d) { d.plan = 'man'; d.man = r; d.lag = d.role === 'lb' ? T.man.lagLB : T.man.lagDB; }
      });
      coverers.forEach(function (d) { if (d.plan === 'stand') { d.plan = 'zone'; d.mark = landmark(0, 6.5); } });
    } else {
      var L = call.coverage === 'cover2'
        ? [[-11, 16, 1, ['s']], [11, 16, 1, ['s']], [-15, 5, 0, ['cb']], [15, 5, 0, ['cb']], [0, 11, 0, null], [-7, 10, 0, null], [7, 10, 0, null]]
        : [[-15, 16, 1, ['cb']], [0, 18, 1, ['s']], [15, 16, 1, ['cb']], [-12, 8, 0, null], [12, 8, 0, null], [-5, 10, 0, null], [5, 10, 0, null]];
      L.forEach(function (z) {
        var pt = landmark(z[0], z[1]), d = takeNearest(coverers, pt, z[3]);
        if (d) { d.plan = 'zone'; d.mark = pt; d.deep = !!z[2]; d.width = call.coverage === 'cover2' ? 13.5 : 9; }
      });
      coverers.forEach(function (d) { if (d.plan === 'stand') { d.plan = 'zone'; d.mark = landmark(0, 6); } });
    }

    /* ---- protection ---- */
    var blockers = 5 + stayIns;
    var Tp = T.pocket.base + T.pocket.perBlocker * (blockers - call.rushers) + T.pocket.jitter * (rnd() * 2 - 1) + (setDef.under ? T.pocket.underCenter : 0);
    Tp = clamp(Tp, T.pocket.min, T.pocket.max);

    /* ---- run blocking: each lineman takes the nearest man in front of him ---- */
    function engage(blk, def, w) { def.engaged = { by: blk, until: w }; blk.engaging = def; }
    if (isRun) {
      var front = defense.filter(function (d) { return d.y - Y0 < 7 && Math.abs(d.x - BX) < 9; });
      ['C', 'LG', 'RG', 'LT', 'RT'].forEach(function (id) {
        var b = byId[id], best = null, bs = 1e9;
        front.forEach(function (d) { if (d.engaged) return; var s = dist(b, d); if (s < bs) { bs = s; best = d; } });
        if (best && bs < 6) engage(b, best, (T.runBlock.base + T.runBlock.jitter * (rnd() * 2 - 1)) * (0.7 + b.power * 0.5));
      });
    }

    if (call.blitz) say(0.35, 'blitz', call.rushers >= 6 ? 'Everybody is coming.' : 'Blitz off the edge.');

    /* ---- the loop ---- */
    var frames = [];
    var ball = { x: BX, y: Y0, z: 0.4, holder: 'C', air: null };
    var thrown = false, windup = null, outcome = null, cause = '', spotY = null, tEnd = 0;
    var collapsed = false, collapseFate = null, sacker = null, pressureAt = 0, caught = null, thrownTo = null, throwInfo = null;
    var steps = Math.round(T.maxTime / dt);

    function accel(e, want) {
      var a = e.top / Math.max(0.1, e.burst);
      if (e.v < want) e.v = Math.min(want, e.v + a * dt); else e.v = Math.max(want, e.v - a * 1.5 * dt);
    }
    function stepToward(e, tx, ty, want) {
      if (e.stumble > 0) want *= 0.5;
      var dx = tx - e.x, dy = ty - e.y, L2 = len(dx, dy);
      accel(e, Math.min(want, L2 / dt));
      if (L2 < 1e-6) { e.vx = 0; e.vy = 0; return; }
      var s = Math.min(L2, e.v * dt);
      e.vx = dx / L2 * e.v; e.vy = dy / L2 * e.v;
      e.x += dx / L2 * s; e.y += dy / L2 * s; e.run += s;
    }
    /* Follow a path at speed. A sharp cut costs speed, more for a worse cutter. */
    function follow(e) {
      if (!e.path || e.wp >= e.path.length) return false;
      var p = e.path[e.wp], dx = p.x - e.x, dy = p.y - e.y, L2 = len(dx, dy);
      if (L2 < 0.35) {
        var nx = e.path[e.wp + 1];
        if (nx) {
          var ax = dx, ay = dy, bx = nx.x - p.x, by = nx.y - p.y, la = len(ax, ay) || 1, lb = len(bx, by) || 1;
          var turn = 1 - (ax * bx + ay * by) / (la * lb);  /* 0 straight on, 1 a right angle, 2 straight back */
          if (L2 > 0 && turn > 0.15) e.v *= 1 - (1 - (e.cut || 0.6)) * Math.min(1.6, turn);
          /* THE BREAK. Whoever is on him has to read the cut and turn too: for a
             beat he runs at half speed, longer the sharper the cut. That beat
             is the separation a route is drawn to win. */
          if (turn > 0.35 && e.side === 'O') defense.forEach(function (d) {
            /* the first break fools him fully, the second half as much, then he has seen it */
            if ((d.plan === 'man' && d.man === e) || (d.plan === 'zone' && dist(d, e) < 4)) {
              var fooled = d.fooled = (d.fooled || 0) + 1, k2 = fooled === 1 ? 1 : fooled === 2 ? 0.5 : 0;
              d.stumble = Math.max(d.stumble || 0, T.breakStumble * Math.min(1.6, turn) * k2);
            }
          });
        } else { e.lastDir = L2 > 1e-6 ? [dx / L2, dy / L2] : e.lastDir; }
        e.wp++;
        return follow(e);
      }
      e.lastDir = [dx / L2, dy / L2];
      stepToward(e, p.x, p.y, e.top);
      return true;
    }
    /* After the drawn route, keep running the same way, and stop short of the sideline or the end line. */
    function carryOn(e) {
      var d = e.lastDir || [0, 1];
      /* a route that ends coming back to the ball (a curl, a comeback) settles there */
      if (d[1] < -0.3) { stepToward(e, e.x, e.y, 0); return; }
      var tx = e.x + d[0] * 3, ty = e.y + d[1] * 3;
      if (tx < 1 || tx > FIELD_W - 1 || ty > 109) { stepToward(e, clamp(tx, 1, FIELD_W - 1), Math.min(ty, 109), 0); return; }
      stepToward(e, tx, ty, e.top);
    }
    /* Run with the ball in the open: upfield, away from whoever is closest. */
    function openField(e) {
      var wx = 0, wy = 1;
      defense.forEach(function (d) {
        if (d.engaged || d.missed > 0) return;
        var dx = e.x - d.x, dy = e.y - d.y, L2 = len(dx, dy);
        if (L2 < 6 && L2 > 0.01) { var k = T.avoid / (L2 * L2); wx += dx * k; wy += dy * k * 0.5; }
      });
      if (e.x < 2.5) wx += 0.8; if (e.x > FIELD_W - 2.5) wx -= 0.8;
      if (wy < 0.25) wy = 0.25;
      var L2 = len(wx, wy);
      stepToward(e, e.x + wx / L2 * 3, e.y + wy / L2 * 3, e.top);
    }
    function pursue(d, c, want) {
      var D2 = dist(d, c), lead = Math.min(1, D2 / (d.top * 1.4));
      stepToward(d, c.x + c.vx * lead, c.y + c.vy * lead, want || d.top);
    }
    function nearestDefender(r) {
      var best = 1e9;
      defense.forEach(function (d) { if (d.engaged) return; var s = dist(d, r); if (s < best) best = s; });
      return best;
    }
    function openBy(r) { return nearestDefender(r); }
    /* The separation that decides a catch. A defender trailing him (nearer the
       QB than he is) has his back to the ball and counts trail yards further
       off; one over the top or in the lane counts as he stands. */
    function contested(r, from) {
      var best = 1e9, rq = len(r.x - from.x, r.y - from.y);
      defense.forEach(function (d) {
        if (d.engaged) return;
        var s3 = dist(d, r), dq = len(d.x - from.x, d.y - from.y);
        if (dq < rq - 0.5) s3 += T.catch.trail;
        if (s3 < best) best = s3;
      });
      return best;
    }
    /* how long a throw from where the QB is would take to reach a point */
    function flightTo(p) { var d3 = len(p.x - QB.x, p.y - QB.y); return d3 / QB.arch.arm + T.ball.loft * d3 * d3; }
    /* where a receiver will be in tf seconds, running the rest of his route and on past its end */
    function along(e, tf) {
      var x = e.x, y = e.y, v = Math.max(e.v, 2), go = v * tf;
      if (e.path) for (var k = e.wp; k < e.path.length && go > 0; k++) {
        var dx = e.path[k].x - x, dy = e.path[k].y - y, L3 = len(dx, dy);
        if (L3 >= go) return { x: x + dx / L3 * go, y: y + dy / L3 * go };
        x = e.path[k].x; y = e.path[k].y; go -= L3;
      }
      if (go > 0 && e.lastDir && e.lastDir[1] < -0.3) go = 0;
      if (go > 0) { var u = (e.path && e.lastDir) || [e.vx / v, e.vy / v]; if (len(e.vx, e.vy) < 0.5 && !(e.path && e.wp < e.path.length)) u = [0, 0]; x += u[0] * go; y += u[1] * go; }
      return { x: x, y: y };
    }
    /* yards of drawn route still to run */
    function left(e) {
      if (!e.path || e.wp >= e.path.length) return 0;
      var s2 = len(e.path[e.wp].x - e.x, e.path[e.wp].y - e.y);
      for (var k = e.wp + 1; k < e.path.length; k++) s2 += len(e.path[k].x - e.path[k - 1].x, e.path[k].y - e.path[k - 1].y);
      return s2;
    }

    function finish(t, kind, why, y) {
      if (outcome) return;
      outcome = kind; cause = why || ''; tEnd = t; if (y != null) spotY = y;
    }

    for (var i = 0; i <= steps && !outcome; i++) {
      var t = i * dt;
      /* history for man coverage lag */
      offense.forEach(function (e) { e.hist.push(e.x, e.y); });
      var lagOf = function (r, lag) { var k = Math.max(0, i - Math.round(lag / dt)); return { x: r.hist[k * 2], y: r.hist[k * 2 + 1] }; };
      var pressure = Math.min(1, t / Tp);

      /* -- the ball: the snap, the handoff, the throw -- */
      if (i === 0) { ball.holder = 'QB'; }
      if (isRun && ballCarrierId !== 'QB' && !carrier && t >= T.handoff) { carrier = byId[ballCarrierId]; ball.holder = carrier.id; say(t, 'handoff', 'Handoff.'); }
      if (isRun && ballCarrierId === 'QB' && !carrier) { carrier = QB; }

      if (!isRun && !thrown && !windup && !collapseFate) {
        /* the progression: his eyes are on one read at a time, in the order drawn */
        var P = targets[eye] ? byId[targets[eye]] : null, C2 = targets.length > 1 ? byId[targets[targets.length - 1]] : null;
        /* "finishes the route" is a timing throw: the ball leaves as he is a beat
           from the end of what you drew, so it meets him there */
        var routeDone = P && P.path && left(P) <= Math.max(P.v, 3) * (T.read.release + T.read.timing + flightTo(P.path[P.path.length - 1]));
        if (t >= Tp && !collapsed) { collapsed = true; say(t, 'pressure', 'The pocket is gone.'); }
        if (!collapsed && P && t >= eyeAt && (routeDone || (t >= T.read.minRead && openBy(P) >= T.read.separation))) {
          /* covered at the top of his route, and there is another read: move on */
          if (routeDone && eye < targets.length - 1 && openBy(P) < T.read.covered) {
            eye++; eyeAt = t + T.read.shift;
            say(t, 'progress', eye === 1 ? 'Covered. Second read.' : 'Covered. Third read.');
          } else windup = { to: P, at: t + T.read.release, primary: eye === 0 };
        }
        else if (collapsed) {
          if (C2) { windup = { to: C2, at: t + T.read.release * 0.6, primary: false }; say(t, 'checkdown', 'Checks it down.'); }
          else {
            collapseFate = rnd() < T.sackShare ? 'sack' : 'throwaway';
            if (collapseFate === 'sack') {
              var bs2 = 1e9; rushers.forEach(function (d) { var s = dist(d, QB); if (s < bs2) { bs2 = s; sacker = d; } });
            } else { say(t, 'throwaway', 'Throws it away.'); finish(t + 0.6, 'throwaway', 'nobody'); }
          }
        }
      }
      if (windup && t >= windup.at && !thrown) {
        thrown = true; thrownTo = windup.to;
        var r0 = windup.to, d0 = dist(QB, r0), arm = QB.arch.arm;
        var px = r0.x, py = r0.y, tf = 0;
        for (var it = 0; it < 3; it++) {
          var dd2 = len(px - QB.x, py - QB.y); tf = dd2 / arm + T.ball.loft * dd2 * dd2;
          var ahead = along(r0, tf); px = clamp(ahead.x, 0.5, FIELD_W - 0.5); py = Math.min(109.5, ahead.y);
        }
        var sp = len(r0.vx, r0.vy), tw = len(QB.x - r0.x, QB.y - r0.y) || 1;
        var toward = sp > 1 ? (r0.vx * (QB.x - r0.x) + r0.vy * (QB.y - r0.y)) / (sp * tw) : 0.5;
        throwInfo = { from: { x: QB.x, y: QB.y }, to: { x: px, y: py }, t0: t, t1: t + tf, dist: len(px - QB.x, py - QB.y), pressure: pressure, toward: toward, openAtThrow: openBy(r0), primary: windup.primary };
        ball.holder = null; ball.air = throwInfo;
        r0.chase = { x: px, y: py, t1: throwInfo.t1 };
        var nm = routeName([r0.x0 - BX, r0.y0 - Y0], routes[r0.id] ? routes[r0.id].pts : null);
        if (throwInfo.openAtThrow >= 3) say(t, 'throw', 'Wide open on the ' + nm + '.');
        else if (throwInfo.openAtThrow < 1.2) say(t, 'throw', 'Throws it into coverage.');
        else say(t, 'throw', 'Fires it to the ' + nm + '.');
      }
      /* the sack */
      if (collapseFate === 'sack' && sacker && dist(sacker, QB) < 1.0) {
        say(t, 'sack', 'Sacked.'); finish(t, 'sack', 'nobody', QB.y); break;
      }

      /* -- the catch -- */
      if (ball.air && t >= ball.air.t1 && !caught) {
        var r = thrownTo, sep = contested(r, ball.air.from), I = ball.air;
        var deepBy = Math.max(0, I.dist - T.catch.deepFrom);
        var z = T.catch.base + T.catch.perSep * (Math.min(sep, T.catch.sepCap) - 2) - T.catch.perTen * (I.dist - 12) / 10 - T.catch.deep * deepBy * deepBy / 100
          - T.catch.pressure * I.pressure + T.catch.toward * I.toward - (sep < 1 ? T.catch.tight : 0)
          + (r.arch.hands || 0) + (QB.arch.accuracy || 0);
        var pc = chance(z), roll = rnd();
        I.sep = sep; I.p = pc;
        ball.air = null;
        if (roll < pc) {
          caught = r; carrier = r; ball.holder = r.id; r.chase = null; r.catchT = t;
          say(t, 'catch', r.y >= 100 ? 'Caught in the end zone.' : 'Caught at ' + spotName(r.y) + '.');
          if (r.y >= 100) { finish(t, 'touchdown', 'catch', r.y); break; }
        } else {
          var why = sep < 1 ? 'tight' : I.pressure > 0.85 ? 'pressure' : I.dist > 28 ? 'long' : 'drop';
          say(t, 'incomplete', why === 'tight' ? 'Broken up.' : why === 'long' ? 'Just out of reach.' : why === 'pressure' ? 'Off target under pressure.' : 'Dropped.');
          finish(t, 'incomplete', why, null); ball.drop = { x: I.to.x, y: I.to.y };
        }
      }

      /* -- the offense moves -- */
      offense.forEach(function (e) {
        if (e === carrier && (caught || isRun)) {
          if (e.plan === 'carry' && follow(e)) return;
          openField(e); return;
        }
        if (e.plan === 'ol') {
          if (isRun) {
            var df = e.engaging;
            if (df && df.engaged && t < df.engaged.until) { var dx = df.x - e.x, dy = df.y - e.y, L2 = len(dx, dy) || 1; stepToward(e, df.x - dx / L2 * 0.9, df.y - dy / L2 * 0.9, 3); }
            else stepToward(e, e.x0, e.y0 + 1.5, 2.5);
          } else stepToward(e, e.x0, e.y0 - 1.3, 2.5);
          return;
        }
        if (e === QB) {
          if (isRun && carrier !== QB) { stepToward(e, e.x0, e.y0 - 1, 2); return; }
          if (!isRun) { stepToward(e, e.x0, setDef.under ? Y0 - 6.5 : e.y0 - 1, t < 1.2 ? 6 : 1.5); return; }
        }
        if (e.plan === 'carry') { if (!follow(e)) openField(e); return; }
        /* he keeps running what you drew; in the last beat he adjusts to the ball */
        if (e.chase && e.chase.t1 - t < T.adjust) { var rem = Math.max(dt, e.chase.t1 - t); stepToward(e, e.chase.x, e.chase.y, Math.min(e.top, dist(e, e.chase) / rem + 0.5)); return; }
        if (e.plan === 'route') { if (!follow(e)) carryOn(e); return; }
        if (e.plan === 'block') {
          if (isRun) {
            if (!e.engaging) {
              if (dist(e, e.blockTo) > 0.6) { stepToward(e, e.blockTo.x, e.blockTo.y, e.top * 0.9); }
              var best = null, bs = 2.6;
              defense.forEach(function (d) { if (d.engaged) return; var s = dist(e, d); if (s < bs) { bs = s; best = d; } });
              if (best) engage(e, best, t + (T.runBlock.base + T.runBlock.leadBonus + T.runBlock.jitter * (rnd() * 2 - 1)) * (0.7 + e.power * 0.5));
            } else stepToward(e, e.engaging.x, e.engaging.y - 0.8, 3);
          } else stepToward(e, e.blockTo.x, e.blockTo.y, 4);
          return;
        }
        e.vx = 0; e.vy = 0; e.v = 0;   /* nothing drawn: he stays home */
      });

      /* -- the defense moves -- */
      var readRun = function (d) { return isRun && t >= T.readRun[d.role === 'dl' ? 'dl' : d.role === 'lb' ? 'lb' : 'db']; };
      defense.forEach(function (d) {
        if (d.missed > 0) { d.missed -= dt; stepToward(d, d.x, d.y, 0); return; }
        if (d.stumble > 0) d.stumble -= dt;
        if (d.engaged) {
          if (t < d.engaged.until) { var c = carrier || QB; var dx = c.x - d.x, dy = c.y - d.y, L2 = len(dx, dy) || 1; stepToward(d, d.x + dx / L2, d.y + dy / L2, d.top * T.runBlock.heldSpeed); return; }
          d.engaged = null;
        }
        if (carrier && (caught || readRun(d))) { pursue(d, carrier); return; }
        /* the ball is in the air. A defender in front of the receiver, near the
           catch, plays the spot; anybody behind him keeps playing his coverage,
           so what decides the catch is the separation the route won. */
        if (thrown && ball.air && t >= ball.air.t0 + T.breakOnBall && d.plan !== 'rush') {
          var tr = thrownTo, at = ball.air.to;
          if (len(d.x - at.x, d.y - at.y) < T.breakRange && len(d.x - at.x, d.y - at.y) < len(tr.x - at.x, tr.y - at.y)) { stepToward(d, at.x, at.y, d.top * T.breakSpeed); return; }
        }
        if (d.plan === 'rush') {
          if (isRun) { pursue(d, carrier || QB, d.top * 0.6); return; }
          if (d === sacker) { stepToward(d, QB.x, QB.y, 7.5); return; }
          /* the rush closes as the pocket's clock runs: legible, and it is the clock that decides */
          var u = Math.min(1, t / Tp), f = Math.min(0.9, u * Math.sqrt(u)) * (d.blitz ? 1 : 0.95);
          var tx = d.x0 + (QB.x - d.x0) * f, ty = d.y0 + (QB.y + 0.8 - d.y0) * f;
          stepToward(d, tx, ty, d.top); return;
        }
        if (d.plan === 'man') {
          var r = d.man;
          if (r.plan === 'block' || (r.plan === 'stand')) { stepToward(d, r.x, r.y + 2, d.top * 0.6); return; }
          /* over the top of him: his depth now, plus the cushion; his side to side
             as it was lag seconds ago, which is the beat a break wins */
          var lp = lagOf(r, d.lag), cush = T.man.cushion;
          /* a man running straight at him eats the cushion: by eatBy seconds he is level, and the faster man wins */
          if (r.vy > 4) cush *= Math.max(0, 1 - t / T.man.eatBy);
          stepToward(d, lp.x, r.y + cush, d.top); return;
        }
        if (d.plan === 'zone') {
          if (d.deep) {
            /* A DEEP DEFENDER keeps everything in front. His depth answers the
               deepest man coming anywhere near his side of the field; his side
               to side follows the man in his own column, seen a beat late. */
            var deepest = null, col = null, cs = 1e9;
            receivers.forEach(function (r) {
              var off = Math.abs(r.x - d.mark.x);
              if (off < d.width * T.zone.reach && r.y > d.mark.y - T.zone.threat && (!deepest || r.y > deepest.y)) deepest = r;
              if (off < d.width && r.y > d.mark.y - T.zone.threat && 100 - r.y < cs) { cs = 100 - r.y; col = r; }
            });
            var dy3 = deepest && t > T.zone.react ? deepest.y + T.zone.cushion + Math.max(0, deepest.vy) * T.zone.bail : d.mark.y;
            var sx3 = col && t > T.zone.react ? lagOf(col, T.zone.deepLag).x : d.mark.x;
            stepToward(d, d.mark.x + (sx3 - d.mark.x) * T.zone.pull, Math.min(109, Math.max(d.mark.y - 3, dy3)), d.top); return;
          }
          var R = T.zone.radius, best = null, bs = 1e9;
          receivers.forEach(function (r) { var s = len(r.x - d.mark.x, r.y - d.mark.y); if (s < R && s < bs) { bs = s; best = r; } });
          /* he leans toward the man in his zone from his landmark, never all the way
             onto him: that is where the windows in a zone come from */
          if (best && t > T.zone.react) {
            var pull = T.zone.pull, tx2 = d.mark.x + (best.x - d.mark.x) * pull;
            var ty2 = d.mark.y + (best.y - d.mark.y) * pull;
            stepToward(d, tx2, ty2, d.top * T.zone.speed); return;
          }
          stepToward(d, d.mark.x, d.mark.y, d.top * 0.9); return;
        }
        stepToward(d, d.x, d.y, 0);
      });

      /* -- the ball's place -- */
      if (ball.air) {
        var I2 = ball.air, k = clamp((t - I2.t0) / Math.max(0.01, I2.t1 - I2.t0), 0, 1);
        ball.x = I2.from.x + (I2.to.x - I2.from.x) * k; ball.y = I2.from.y + (I2.to.y - I2.from.y) * k;
        ball.z = T.ball.height + (1.2 - T.ball.height) * k + 4 * k * (1 - k) * (0.6 + I2.dist * 0.045);
      } else if (ball.holder) { var h = byId[ball.holder]; ball.x = h.x; ball.y = h.y; ball.z = 1.1; }

      /* -- contact -- */
      if (carrier && !outcome) {
        if (carrier.y >= 100) { say(t, 'td', 'Touchdown.'); finish(t, 'touchdown', isRun ? 'run' : 'yac', carrier.y); }
        else if (carrier.x < 0 || carrier.x > FIELD_W) { say(t, 'oob', 'Out of bounds at ' + spotName(carrier.y) + '.'); finish(t, 'down', 'oob', carrier.y); }
        else if (!isRun || carrier !== QB || t > 0.2) {
          for (var di = 0; di < defense.length && !outcome; di++) {
            var dd = defense[di];
            if (dd.missed > 0) continue;
            if (dist(dd, carrier) > T.tackle.reach) continue;
            /* a man still tied up in a block can only get an arm on him: the pile.
               The carrier wins that most of the time. */
            if (dd.engaged) {
              if (rnd() < T.tackle.pile) { dd.tackler = true; finish(t, 'down', 'tackle', carrier.y + rnd() * T.tackle.fall * 0.5); break; }
              dd.missed = T.tackle.missed; continue;
            }
            var crowd = 0; defense.forEach(function (o2) { if (o2 !== dd && !o2.engaged && dist(o2, carrier) < 2.5) crowd++; });
            var pBreak = Math.max(0.02, T.tackle.broken + (carrier.arch.elusive || 0) - crowd * T.tackle.crowd);
            if (rnd() < pBreak) { dd.missed = T.tackle.missed; say(t, 'broken', 'Breaks a tackle.'); continue; }
            if (isRun && rnd() < T.tackle.fumble) { say(t, 'fumble', 'Fumble.'); finish(t, 'fumble', 'fumble', carrier.y); break; }
            var sp2 = len(carrier.vx, carrier.vy), fwd = sp2 > 0.5 ? clamp(carrier.vy / sp2, 0.2, 1) : 0.4;
            var headOn = dd.y > carrier.y ? 0.55 : 1;
            /* the fall: his momentum, how square he was hit, how strong he is, and a roll */
            var fall = (sp2 * T.tackle.momentum + rnd() * T.tackle.fall) * fwd * headOn * (0.7 + (carrier.arch.power || 0.4) * 0.6);
            dd.tackler = true;
            var y2 = carrier.y + fall;
            if (y2 >= 100) { say(t, 'td', 'Falls in for six.'); finish(t, 'touchdown', 'fall', 100); }
            else finish(t, 'down', 'tackle', y2);
          }
        }
      }
      if (i === steps && !outcome) finish(t, 'down', 'whistle', carrier ? carrier.y : QB.y);

      /* -- the frame -- */
      frames.push(snapshot(t));
    }
    /* hold the end for the picture: the tackle on the ground, the ball dead */
    var hold = Math.round(1.1 / dt);
    for (var hI = 1; hI <= hold; hI++) {
      offense.concat(defense).forEach(function (e) { e.vx *= 0.8; e.vy *= 0.8; e.x += e.vx * dt; e.y += e.vy * dt; });
      frames.push(snapshot(tEnd + hI * dt, true));
    }

    function poseOf(e, t, after) {
      if (after && e === carrier && (outcome === 'down' || outcome === 'fumble') && cause !== 'oob') return ['down', 0];
      if (after && e.tackler) return ['down', 0];
      if (after && outcome === 'sack' && e === QB) return ['down', 0];
      var moving = len(e.vx, e.vy) > 0.6, fr = Math.floor(e.run / 0.9) % 4;
      if (e === carrier && ball.holder === e.id) return [moving ? 'carry' : 'idle', moving ? fr : 0];
      if (e.catchT != null && t - e.catchT < 0.25) return ['catch', 0];
      if (e === thrownTo && ball.air && ball.air.t1 - t < 0.25) return ['catch', 0];
      if (e === QB && !isRun) {
        if (windup && !thrown) return ['throw', 0];
        if (thrown && throwInfo && t - throwInfo.t0 < 0.35) return ['throw', 1];
      }
      if (e.tackler) return ['dive', 0];
      if (e.role === 'ol' || e.engaging || (e.side === 'D' && e.engaged) || (e.plan === 'block' && !moving)) return ['block', Math.floor(t * 3) % 2];
      if (e.side === 'D' && e.plan === 'rush' && !isRun && !moving) return ['block', Math.floor(t * 3) % 2];
      return moving ? ['run', fr] : ['idle', 0];
    }
    function snapshot(t, after) {
      var P2 = [];
      for (var j = 0; j < E.length; j++) {
        var e = E[j], h = heading(e.vx, e.vy);
        if (h != null && len(e.vx, e.vy) > 1.2) e.face = h;
        var ps = poseOf(e, t, after);
        P2.push([Math.round(e.x * 100) / 100, Math.round(e.y * 100) / 100, ps[0], ps[1], e.face]);
      }
      var bz = ball.air ? ball.z : ball.holder ? 1.1 : 0.15;
      var bx = ball.x, by = ball.y;
      if (!ball.air && !ball.holder && ball.drop) { bx = ball.drop.x; by = ball.drop.y; }
      return { t: Math.round(t * 1000) / 1000, p: P2, ball: [Math.round(bx * 100) / 100, Math.round(by * 100) / 100, Math.round(bz * 100) / 100], held: !!ball.holder, pressure: isRun ? 0 : Math.round(Math.min(1, t / Tp) * 100) / 100 };
    }

    /* ---------- the verdict ---------- */
    var gained = spotY != null ? spotY - Y0 : 0;
    var win = outcome === 'touchdown' || (outcome === 'down' && spotY >= marker);
    var shown = Math.round(gained);
    if (win && outcome !== 'touchdown') shown = Math.max(distance, shown);
    if (!win && outcome === 'down' && shown >= distance) shown = distance - 1;
    var title = outcome === 'touchdown' ? 'TOUCHDOWN' : win ? 'FIRST DOWN' : 'TURNOVER ON DOWNS';
    var reason = reasonOf();
    function reasonOf() {
      var need = 'Needed ' + distance + '.';
      if (outcome === 'touchdown') {
        if (cause === 'catch') return 'Caught it in the end zone. Six.';
        if (cause === 'run') return 'Nobody laid a hand on him. Six.';
        return 'Got in from ' + spotName(Y0) + '. Six.';
      }
      if (outcome === 'sack') return 'Sacked. The pocket held ' + (Math.round(Tp * 10) / 10) + ' seconds and there was no checkdown.';
      if (outcome === 'throwaway') return 'Threw it away. The pocket went and there was no checkdown.';
      if (outcome === 'fumble') return 'Fumbled at ' + spotName(spotY) + '. Ball game.';
      if (outcome === 'incomplete') {
        if (cause === 'tight') return 'Incomplete. The throw went into tight coverage.';
        if (cause === 'long') return 'Incomplete. A ' + Math.round(throwInfo.dist) + ' yard throw, just out of reach.';
        if (cause === 'pressure') return 'Incomplete. He threw it with a man in his face.';
        return 'Incomplete. It hit him in the hands.';
      }
      if (win) {
        if (cause === 'oob') return 'Got out of bounds past the marker. ' + need + ' Got ' + shown + '.';
        return 'Moved the chains. ' + need + ' Got ' + shown + '.';
      }
      var short = marker - (spotY || Y0);
      if (cause === 'oob') return 'Pushed out ' + (short < 1 ? 'inches' : Math.round(short) + ' ' + yardsWord(Math.round(short))) + ' short.';
      if (short < 0.6) return 'Stopped inches short. ' + need;
      if (gained < 0) return 'Dropped for a loss of ' + Math.round(-gained) + '. ' + need;
      return 'Tackled ' + Math.round(short) + ' ' + yardsWord(Math.round(short)) + ' short. ' + need;
    }
    if (outcome === 'down') say(tEnd, 'spot', win ? 'First down.' : (marker - spotY < 1 ? 'Tackled a yard short.' : 'Short of the sticks.'));

    return {
      seed: seed >>> 0, distance: distance, callKey: callKey(call), down: downName(distance, Y0), Y0: Y0, BX: BX, marker: marker, box: box,
      formation: setDef.id, isRun: isRun, call: call, callName: callName(call), callLine: callLine(call),
      pocket: Math.round(Tp * 100) / 100, outcome: outcome, win: win, title: title,
      yards: shown, spotY: spotY, spot: spotY != null ? spotName(spotY) : null, reason: reason,
      throwInfo: throwInfo ? { dist: Math.round(throwInfo.dist * 10) / 10, sep: throwInfo.sep != null ? Math.round(throwInfo.sep * 10) / 10 : null, p: throwInfo.p != null ? Math.round(throwInfo.p * 1000) / 1000 : null, to: thrownTo ? thrownTo.id : null, primary: throwInfo.primary } : null,
      events: events, ids: E.map(function (e) { return { id: e.id, side: e.side, role: e.role, big: e.role === 'ol' || e.role === 'dl', label: e.label || '' }; }),
      dt: dt, frames: frames, tEnd: tEnd
    };
  }

  var API = { run: run, rollCall: rollCall, CALLS: CALLS, CALL_KEYS: CALL_KEYS, callKey: callKey, spotName: spotName, downName: downName, routeName: routeName, callName: callName, chance: chance, FIELD_W: FIELD_W };
  if (isNode) module.exports = API;
  else root.FAW_ENGINE = API;
})(typeof window !== 'undefined' ? window : this);
