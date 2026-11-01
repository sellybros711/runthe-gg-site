/* 4th and What: the play, simulated.
 *
 *   FAW_ENGINE.run(scenario, play, seed, opt) -> result
 *   FAW_ENGINE.plans(scenario, play, callKey) -> each defender's job at the snap
 *   FAW_ENGINE.situationName(down, distance, ballOn) -> "3rd and 7 · Own 28"
 *
 * The scenario: { down 1 to 4, distance, ballOn (yards to the goal line the
 * offense attacks, 1 to 99), ballX, roster }. The distance is capped by the
 * goal line. The down changes only what the defense calls.
 *
 * A pure function. No DOM, no clock, no Math.random: every roll comes from
 * mulberry32 off the seed, and the decisions use only + - * / and sqrt,
 * which every JavaScript engine rounds the same way. So the same seed and
 * the same drawn play give the same result, frame for frame, anywhere.
 *
 * WHAT IT SIMULATES (the vault's 4th-and-what-sim note has the long form):
 *   the call     rolled per snap: cover 0, 1, 2 or 3, man or zone, blitz or not
 *   motion       play.motion { who, pts }: one eligible man runs a path in the
 *                backfield before the snap (result.pre has the frames). The
 *                defense aligned to the set before it; man is matched at the
 *                snap, and he starts his route from the motion's end, moving
 *   play action  play.playAction on a pass: the QB fakes to the back, the
 *                zone backers and safeties bite, the fake costs pocket time
 *   protection   the pocket holds for a time set by blockers against rushers
 *   routes       run exactly as drawn, then on the same line; cuts cost speed
 *   coverage     man trails with a lag; zone drops to landmarks (underneath
 *                ones defend the sticks) and plays the nearest receiver inside
 *                its zone; the spare men in man coverage rob crossers
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
 *   the field    everybody stays inside the sidelines and the end lines; a
 *                carrier downed in his own end zone is a safety
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

  var ORD = ['', '1st', '2nd', '3rd', '4th'];
  /* "the 33", "your 45", "midfield". y is field yards from the offense's goal line. */
  function spotName(y) {
    var r = Math.round(y);
    if (r >= 100) return 'the end zone';
    if (r <= 0) return 'your end zone';
    if (r === 50) return 'midfield';
    return r > 50 ? 'the ' + (100 - r) : 'your ' + r;
  }
  /* "4th and 5", "3rd and goal". The down is 4 when it is not given. */
  function downName(distance, Y0, down) {
    var d = clamp(Math.round(+down || 4), 1, 4);
    return ORD[d] + ' and ' + (Y0 + distance >= 100 ? 'goal' : distance);
  }
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

  /* The weights by distance band, shaded by the down: early downs blitz less
     and rarely bring everybody. 4th down plays the bands as they stand. */
  function rollCall(T, distance, box, rnd, down) {
    var w0 = distance <= 3 ? T.calls.short : distance <= 7 ? T.calls.medium : T.calls.long;
    var dm = T.calls.byDown && T.calls.byDown[down], w = w0;
    if (dm) w = { cover0: w0.cover0 * dm.cover0, cover1: w0.cover1, cover2: w0.cover2, cover3: w0.cover3, blitz: w0.blitz * dm.blitz };
    var keys = ['cover0', 'cover1', 'cover2', 'cover3'], sum = 0, i;
    for (i = 0; i < 4; i++) sum += w[keys[i]];
    var r = rnd() * sum, cov = keys[3];
    for (i = 0; i < 4; i++) { r -= w[keys[i]]; if (r < 0) { cov = keys[i]; break; } }
    var pb = w.blitz + Math.max(0, box - 6) * T.boxBlitz;
    var blitz = cov === 'cover0' ? true : rnd() < pb;
    return { coverage: cov, man: cov === 'cover0' || cov === 'cover1', blitz: blitz, rushers: 4 + (cov === 'cover0' ? 2 : blitz ? 1 : 0) };
  }

  /* ---------- the situation ---------- */

  /* The scenario as the sim plays it. ballOn is yards to the goal line the
     offense attacks (1 is the opponent's 1, 99 the offense's own 1), the
     distance is capped by that goal line, and the down is 1 to 4 (4 if it is
     not given). */
  function situation(sc) {
    var ballOn = clamp(+sc.ballOn || 40, 1, 99);
    var down = clamp(Math.round(+sc.down || 4), 1, 4);
    var distance = Math.min(clamp(+sc.distance || 10, 1, 99), ballOn);
    return { down: down, distance: distance, ballOn: ballOn, Y0: 100 - ballOn, goal: distance >= ballOn };
  }
  /* "3rd and 7 · Own 28", "4th and Goal · Opp 3", "1st and 10 · Opp 40". */
  function situationName(down, distance, ballOn) {
    var s = situation({ down: down, distance: distance, ballOn: ballOn });
    var b = Math.round(s.ballOn);
    var spot = b === 50 ? 'Midfield' : b > 50 ? 'Own ' + (100 - b) : 'Opp ' + b;
    return ORD[s.down] + ' and ' + (s.goal ? 'Goal' : Math.round(s.distance)) + ' · ' + spot;
  }

  /* ---------- the setup: everything decided before the ball moves ---------- */

  /* The motion a play asks for, made legal: an eligible receiver, a path of
     points that stays in the backfield. Returns null when there is none. */
  function motionOf(play) {
    var m = play && play.motion;
    if (!m || FM.ELIGIBLE.indexOf(m.who) < 0 || !m.pts || !m.pts.length) return null;
    var pts = [];
    for (var i = 0; i < m.pts.length; i++) {
      var p = m.pts[i];
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      pts.push([+p[0], Math.min(-0.5, +p[1])]);
    }
    return pts.length ? { who: m.who, pts: pts } : null;
  }

  /* Who lines up where, what the defense calls, and every man's plan at the
     snap. run() and plans() both start here, so a scout card shows exactly
     the setup the sim plays. The only dice it rolls are the call's. */
  function setup(scenario, play, opt, rnd) {
    var T = opt.tuning || CFG.TUNING, A = CFG.ARCHETYPES;
    var S = situation(scenario);
    var distance = S.distance, Y0 = S.Y0, BX = scenario.ballX != null ? scenario.ballX : FIELD_W / 2;
    var marker = Math.min(100, Y0 + distance);
    var setDef = FM.BY_ID[play.formation] || FM.SETS[0];
    /* the defense aligns to the formation before any motion */
    var Oal = FM.place(setDef.id, play.moved);
    var Dal = FM.defense(setDef.id, play.moved, distance);
    var box = FM.boxCount(Dal);
    var mo = motionOf(play);
    /* O is where everybody is at the snap: the motion man at the end of his motion */
    var O = FM.place(setDef.id, play.moved);
    if (mo) O[mo.who] = mo.pts[mo.pts.length - 1].slice();
    var isRun = !!(play.handoff && play.handoff.to);
    var routes = {}, blocks = {};
    (play.routes || []).forEach(function (r, i) { if (r && r.pts && r.pts.length) routes[r.who] = { pts: r.pts, order: i + 1 }; });
    (play.blocks || []).forEach(function (b) { if (b && b.to) blocks[b.who] = b.to; });
    var targets = isRun ? [] : (play.targets || []).filter(function (id) { return routes[id] && !blocks[id]; }).slice(0, 3);
    /* field yards, kept on the field: inside the sidelines and the end lines */
    var abs = function (p) { return { x: clamp(BX + p[0], 0.3, FIELD_W - 0.3), y: clamp(Y0 + p[1], -9.7, 109.7) }; };

    /* The call is always rolled, so the dice after it fall the same way. A
       forced call (Test it, against one defense) then replaces what it says. */
    var call = rollCall(T, distance, box, rnd, S.down);
    if (opt.call && CALLS[opt.call]) {
      var fc = CALLS[opt.call];
      call = { coverage: fc.coverage, man: fc.coverage === 'cover0' || fc.coverage === 'cover1', blitz: fc.blitz,
        rushers: 4 + (fc.coverage === 'cover0' ? 2 : fc.blitz ? 1 : 0) };
    }

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

    /* ---- the offense's plans, every one from the snap spot ---- */
    function clampLen(to, from) {
      var dx = to[0] - from[0], dy = to[1] - from[1], L = len(dx, dy);
      var k = L > 3.5 ? 3.5 / L : 1;
      return [dx * k, dy * k];
    }
    FM.ELIGIBLE.forEach(function (id) {
      var e = byId[id];
      if (blocks[id]) { var cl = clampLen(blocks[id], O[id]); e.plan = 'block'; e.blockTo = abs([O[id][0] + cl[0], O[id][1] + cl[1]]); }
      else if (routes[id]) { e.plan = 'route'; e.path = routes[id].pts.map(abs); e.wp = 0; e.order = routes[id].order; }
    });
    var ballCarrierId = null;
    if (isRun) {
      var who = byId[play.handoff.to] || QB;
      who.plan = 'carry'; who.path = (play.handoff.path || []).map(abs); who.wp = 0;
      ballCarrierId = who.id;
    }
    var stayIns = FM.ELIGIBLE.filter(function (id) { return byId[id].plan === 'block'; }).length;

    /* ---- motion: the path he ran before the snap, and his running start ---- */
    var track = null, motion = null;
    if (mo) {
      var mm = byId[mo.who], from = abs(Oal[mo.who]), path = [from].concat(mo.pts.map(abs));
      var snapV = mm.top * T.motion.speed, x = from.x, y = from.y, v = 0, k = 1, a = mm.top / Math.max(0.1, mm.burst);
      var steps = 0, maxSteps = Math.round(T.motion.maxTime / T.dt);
      track = [[x, y, 0, 0]];
      while (k < path.length && steps < maxSteps) {
        var rest = len(path[k].x - x, path[k].y - y);
        for (var q = k + 1; q < path.length; q++) rest += len(path[q].x - path[q - 1].x, path[q].y - path[q - 1].y);
        /* he jogs it, and opens up over the last few yards so he is moving at the snap */
        var want = rest <= T.motion.build ? snapV : Math.min(snapV, T.motion.jog);
        v = v < want ? Math.min(want, v + a * T.dt) : Math.max(want, v - a * T.dt);
        var go = v * T.dt, ux = 0, uy = 0;
        while (go > 0 && k < path.length) {
          var dx = path[k].x - x, dy = path[k].y - y, L = len(dx, dy);
          if (L < 1e-9) { k++; continue; }
          ux = dx / L; uy = dy / L;
          if (L <= go) { x = path[k].x; y = path[k].y; go -= L; k++; } else { x += ux * go; y += uy * go; go = 0; }
        }
        track.push([x, y, ux * v, uy * v]);
        steps++;
      }
      var end = path[path.length - 1];
      track[track.length - 1][0] = end.x; track[track.length - 1][1] = end.y;
      /* at the snap he is moving along the last leg of his motion */
      var pv = path[path.length - 2], lx = end.x - pv.x, ly = end.y - pv.y, lL = len(lx, ly);
      if (lL > 1e-6) {
        var ux2 = lx / lL, uy2 = ly / lL, v0 = snapV;
        /* turning from that line into what was drawn costs speed, like any cut */
        var nxt = mm.path && mm.path.length ? mm.path[0] : mm.blockTo || null;
        if (nxt) {
          var bx = nxt.x - end.x, by = nxt.y - end.y, bL = len(bx, by);
          if (bL > 1e-6) {
            var turn = 1 - (ux2 * bx + uy2 * by) / bL;
            if (turn > 0.15) v0 *= 1 - (1 - (mm.cut || 0.6)) * Math.min(1.6, turn);
          }
        }
        mm.v = v0; mm.vx = ux2 * v0; mm.vy = uy2 * v0; mm.lastDir = [ux2, uy2];
      }
      var c2 = function (v) { return Math.round(v * 100) / 100; };
      motion = { who: mo.who, from: [c2(from.x - BX), c2(from.y - Y0)], to: [c2(end.x - BX), c2(end.y - Y0)], time: Math.round((track.length - 1) * T.dt * 1000) / 1000 };
    }

    /* ---- the defense answers the motion, before the snap ----
       The man over him is the nearest defender who could run with him where
       he lined up. In man that defender travels with him: he runs a mirror of
       the motion seen trail seconds late, so at the snap he is on him again,
       a step behind. In zone the defense bumps: the man over him and the
       nearest backer slide toward where the motion ends, and cover 3 spins
       its safeties on a motion that crosses the ball. Nobody else moves. */
    var traveler = null;
    defense.forEach(function (d) { d.ax = d.x; d.ay = d.y; });
    if (track) {
      var M = T.motion, nT = track.length, mDx = end.x - from.x;
      var wideFrom = Math.abs(from.x - BX) > 7, over = null, os = 1e9;
      defense.forEach(function (d) {
        if (d.role === 'dl' || d.y - Y0 > 9) return;
        var s = len(d.x - from.x, d.y - from.y) + (wideFrom && d.role !== 'cb' ? 12 : 0);
        if (s < os) { os = s; over = d; }
      });
      var movers = [];
      if (over && call.man) {
        traveler = over;
        var lagF = Math.round(M.trail / T.dt), offX = over.x - from.x, offY = over.y - from.y;
        movers.push({ d: over, speed: over.top * M.chase, at: function (k) { var q = track[Math.max(0, k - lagF)]; return { x: q[0] + offX, y: Math.max(Y0 + 1, q[1] + offY) }; } });
      } else if (over && !call.man && Math.abs(mDx) > 2) {
        var fixed = function (d, x, y, sp) { movers.push({ d: d, speed: d.top * sp, at: function () { return { x: x, y: y }; } }); };
        fixed(over, over.x + mDx * M.bump, over.y, M.shuffle);
        var bk = null, bs3 = 1e9;
        defense.forEach(function (d) { if (d.role === 'lb' && d !== over) { var s = Math.abs(d.x - from.x); if (s < bs3) { bs3 = s; bk = d; } } });
        if (bk) fixed(bk, bk.x + mDx * M.backer, bk.y, M.shuffle);
        /* the spin: a cover 3 with two high safeties rotates to the motion */
        var sf = defense.filter(function (d) { return d.role === 's' && d.y - Y0 > 9; });
        var sFrom = from.x - BX, sEnd = end.x - BX;
        if (call.coverage === 'cover3' && sf.length === 2 && sFrom * sEnd < 0 && Math.abs(sEnd) > M.spinFrom) {
          var sg = sEnd > 0 ? 1 : -1, down = (sf[0].x - BX) * sg > (sf[1].x - BX) * sg ? sf[0] : sf[1], up = down === sf[0] ? sf[1] : sf[0];
          fixed(down, BX + sg * M.spin[0], Y0 + M.spin[1], 1);
          fixed(up, BX, Y0 + M.spin[2], 1);
        }
      }
      movers.forEach(function (mv) {
        var d = mv.d, x = d.x, y = d.y, v = 0, a = d.top / Math.max(0.1, d.burst), react = Math.round(M.react / T.dt);
        d.ptrack = [[x, y, 0, 0]];
        for (var k = 1; k < nT; k++) {
          var tg = mv.at(k), dx = tg.x - x, dy = tg.y - y, L = len(dx, dy), vx = 0, vy = 0;
          if (k >= react && L > 1e-6) {
            v = Math.min(mv.speed, v + a * T.dt, L / T.dt);
            var go = Math.min(L, v * T.dt); vx = dx / L * v; vy = dy / L * v;
            x += dx / L * go; y += dy / L * go;
          } else v = 0;
          d.ptrack.push([x, y, vx, vy]);
        }
        d.x = d.x0 = x; d.y = d.y0 = y;
        /* still moving at the snap */
        var lt = d.ptrack[d.ptrack.length - 1]; d.vx = lt[2]; d.vy = lt[3]; d.v = len(lt[2], lt[3]);
      });
    }

    /* ---- play action: a pass with a back to fake to ---- */
    var faker = null;
    if (!isRun && play.playAction) {
      if (FM.isBackfield(O.RB)) faker = byId.RB;
      else FM.ELIGIBLE.forEach(function (id) { if (FM.isBackfield(O[id]) && (!faker || byId[id].y < faker.y)) faker = byId[id]; });
    }
    var pa = null;
    if (faker) {
      var sgn = faker.x0 >= QB.x0 ? 1 : -1;
      pa = { faker: faker, fake: T.pa.fake, carry: T.pa.carry, freeze: T.pa.freeze + T.pa.box * Math.max(0, box - 6),
        /* the mesh is at the QB's hip; the back carries it out across his face toward the line */
        mesh: { x: QB.x0 + sgn * 0.7, y: setDef.under ? QB.y0 - 1.2 : QB.y0 },
        fakeTo: { x: QB.x0 - sgn * 1.5, y: Y0 - 0.8 } };
    }

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

    function landmark(dx, dy) { return { x: clamp(BX + dx, 1, FIELD_W - 1), y: Math.min(109.5, Y0 + dy) }; }
    /* an underneath dropper defends the sticks: no deeper than sticks past the
       marker, no shallower than floor */
    var under = function (dy) { return T.zone.sticks ? Math.min(dy, Math.max(T.zone.floor, distance + T.zone.sticks)) : dy; };
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
      /* the man who travelled with the motion has him */
      if (traveler && traveler.plan === 'stand') { traveler.plan = 'man'; traveler.man = byId[mo.who]; traveler.lag = traveler.role === 'lb' ? T.man.lagLB : T.man.lagDB; }
      if (call.coverage === 'cover1') {
        var fs = takeNearest(coverers, landmark(0, 14), ['s']);
        if (fs) { fs.plan = 'zone'; fs.mark = landmark(0, 14); fs.deep = true; fs.width = 15; }
      }
      /* outside receivers first, each to the nearest free defender who can run
         with him, read off where he is at the snap (after any motion) */
      receivers.slice().sort(function (a, b) { return Math.abs(b.x - BX) - Math.abs(a.x - BX); }).forEach(function (r) {
        if (traveler && traveler.man === r) return;
        var wide = Math.abs(r.x - BX) > 7;
        var d = takeNearest(coverers, r, wide ? ['cb'] : ['cb', 's', 'lb']);
        if (d) { d.plan = 'man'; d.man = r; d.lag = d.role === 'lb' ? T.man.lagLB : T.man.lagDB; }
      });
      /* the men left over are rats: they sit in the hole and rob what crosses it */
      coverers.forEach(function (d) { if (d.plan === 'stand') { d.plan = 'zone'; d.mark = landmark(0, under(6.5)); d.rat = true; } });
    } else {
      var L = call.coverage === 'cover2'
        ? [[-11, 16, 1, ['s']], [11, 16, 1, ['s']], [-15, 5, 0, ['cb']], [15, 5, 0, ['cb']], [0, 11, 0, null], [-7, 10, 0, null], [7, 10, 0, null]]
        : [[-15, 16, 1, ['cb']], [0, 18, 1, ['s']], [15, 16, 1, ['cb']], [-12, 8, 0, null], [12, 8, 0, null], [-5, 10, 0, null], [5, 10, 0, null]];
      /* a fire zone, three under: two seam-curl-flat players and one hook in the middle */
      if (call.coverage === 'cover3' && coverers.length <= 6) L = L.slice(0, 3).concat(T.zone.fire);
      L.forEach(function (z) {
        var pt = landmark(z[0], z[2] ? z[1] : under(z[1])), d = takeNearest(coverers, pt, z[3]);
        if (d) { d.plan = 'zone'; d.mark = pt; d.deep = !!z[2]; d.width = call.coverage === 'cover2' ? 13.5 : 9; }
      });
      coverers.forEach(function (d) { if (d.plan === 'stand') { d.plan = 'zone'; d.mark = landmark(0, under(6)); } });
    }

    return { T: T, S: S, distance: distance, Y0: Y0, BX: BX, marker: marker, setDef: setDef, O: O, Oal: Oal, Dal: Dal, box: box,
      isRun: isRun, routes: routes, blocks: blocks, targets: targets, abs: abs, call: call, E: E, byId: byId, QB: QB,
      offense: offense, defense: defense, ballCarrierId: ballCarrierId, stayIns: stayIns, rushers: rushers, receivers: receivers,
      track: track, motion: motion, pa: pa };
  }

  /* Each defender's job at the snap, relative to the ball, for a scout card:
     at is where he lined up, snap where the motion left him. */
  function plansOf(ctx) {
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    return ctx.defense.map(function (d) {
      return { id: d.id, role: d.role, at: [r2(d.ax - ctx.BX), r2(d.ay - ctx.Y0)], snap: [r2(d.x0 - ctx.BX), r2(d.y0 - ctx.Y0)], plan: d.plan === 'rush' ? 'rush' : d.plan === 'man' ? 'man' : 'zone',
        blitz: !!d.blitz, man: d.plan === 'man' && d.man ? d.man.id : null, mark: d.mark ? [r2(d.mark.x - ctx.BX), r2(d.mark.y - ctx.Y0)] : null,
        deep: !!d.deep, width: d.width || null };
    });
  }

  /* plans(scenario, play, callKey): the defense's setup against one call, no
     simulation. With no valid call key it shows the call seed 0 would roll. */
  function plans(scenario, play, callKey) {
    var ctx = setup(scenario, play, { call: callKey }, RNG.mulberry32(0));
    return plansOf(ctx);
  }

  /* ---------- the run ---------- */

  function run(scenario, play, seed, opt) {
    opt = opt || {};
    var rnd = RNG.mulberry32(seed >>> 0);
    var ctx = setup(scenario, play, opt, rnd);
    var T = ctx.T, dt = T.dt, S = ctx.S, distance = ctx.distance, Y0 = ctx.Y0, BX = ctx.BX, marker = ctx.marker;
    var setDef = ctx.setDef, box = ctx.box, isRun = ctx.isRun, routes = ctx.routes, targets = ctx.targets, call = ctx.call;
    var E = ctx.E, byId = ctx.byId, QB = ctx.QB, offense = ctx.offense, defense = ctx.defense;
    var ballCarrierId = ctx.ballCarrierId, stayIns = ctx.stayIns, rushers = ctx.rushers, receivers = ctx.receivers, pa = ctx.pa;
    var carrier = null;
    var eye = 0, eyeAt = pa ? pa.fake : 0, minRead = Math.max(T.read.minRead, pa ? pa.fake : 0);
    var events = [];
    var say = function (t, kind, text, extra) { var e = { t: Math.round(t * 1000) / 1000, kind: kind, text: text }; if (extra) for (var k in extra) e[k] = extra[k]; events.push(e); };

    /* ---- protection ---- */
    var blockers = 5 + stayIns;
    var Tp = T.pocket.base + T.pocket.perBlocker * (blockers - call.rushers) + T.pocket.jitter * (rnd() * 2 - 1) + (setDef.under ? T.pocket.underCenter : 0);
    /* play action turns his back to the rush: that is pocket time spent on the fake */
    if (pa) Tp -= T.pa.pocket;
    Tp = clamp(Tp, T.pocket.min, T.pocket.max);
    /* THE FREE RUSHER. On a blitz, now and then a man comes clean: the pocket
       goes at freeAt seconds (plus up to freeJit), whatever the protection, and
       the QB has to get it out hot or eat it. Rolled only on a blitz, so a
       snap against a straight rush rolls exactly what it did before. */
    if (call.blitz && T.pocket.free && rnd() < T.pocket.free) Tp = Math.min(Tp, T.pocket.freeAt + T.pocket.freeJit * rnd());

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

    if (pa) say(Math.min(0.3, pa.fake * 0.5), 'fake', 'Play action.');
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
      var x = e.x, y = e.y, v = Math.max(e.v, 2), go = v * tf, fin = e.lastDir;
      if (e.path) for (var k = e.wp; k < e.path.length && go > 0; k++) {
        var dx = e.path[k].x - x, dy = e.path[k].y - y, L3 = len(dx, dy);
        if (L3 >= go) return { x: x + dx / L3 * go, y: y + dy / L3 * go };
        /* past the end he runs on the way the last leg of the route goes */
        if (L3 > 1e-6) fin = [dx / L3, dy / L3];
        x = e.path[k].x; y = e.path[k].y; go -= L3;
      }
      if (go > 0 && fin && fin[1] < -0.3) go = 0;
      if (go > 0) { var u = (e.path && fin) || [e.vx / v, e.vy / v]; if (len(e.vx, e.vy) < 0.5 && !(e.path && e.wp < e.path.length)) u = [0, 0]; x += u[0] * go; y += u[1] * go; }
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
      /* downed with the ball in his own end zone: a safety */
      if ((kind === 'down' || kind === 'sack') && y != null && y <= 0) { cause = kind === 'sack' ? 'sack' : why || 'tackle'; kind = 'safety'; say(t, 'safety', 'Safety.'); }
      else cause = why || '';
      outcome = kind; tEnd = t; if (y != null) spotY = y;
    }

    for (var i = 0; i <= steps && !outcome; i++) {
      var t = i * dt;
      /* history for man coverage lag */
      offense.forEach(function (e) { e.hist.push(e.x, e.y); });
      var lagOf = function (r, lag) { var k = Math.max(0, i - Math.round(lag / dt)); return { x: r.hist[k * 2], y: r.hist[k * 2 + 1] }; };
      var pressure = Math.min(1, t / Tp);

      /* -- the ball: the snap, the handoff, the throw -- */
      if (i === 0) { ball.holder = 'QB'; }
      /* THE MESH. The QB meets the man drawn to get it and the ball changes
         hands where they meet. If the path drawn takes him away (a toss, a
         reverse), the QB pitches it to him and it is in the air until he has it. */
      if (isRun && ballCarrierId !== 'QB' && !carrier) {
        var bk2 = byId[ballCarrierId], gap = dist(QB, bk2);
        if (ball.toss) {
          var tk = clamp((t - ball.toss.t0) / (ball.toss.t1 - ball.toss.t0), 0, 1);
          if (tk >= 1) { ball.toss = null; carrier = bk2; ball.holder = bk2.id; say(t, 'catch', 'He has it.'); }
        } else if (t >= T.mesh.min && gap <= T.mesh.reach) { carrier = bk2; ball.holder = bk2.id; say(t, 'handoff', 'Handoff.'); }
        else if (t >= T.mesh.pitchAt) {
          ball.holder = null; ball.toss = { from: { x: QB.x, y: QB.y }, t0: t, t1: t + clamp(gap / T.mesh.pitchSpeed, 0.15, 0.6) };
          say(t, 'pitch', 'The pitch.');
        }
      }
      if (isRun && ballCarrierId === 'QB' && !carrier) { carrier = QB; }

      if (!isRun && !thrown && !windup && !collapseFate) {
        /* the progression: his eyes are on one read at a time, in the order drawn */
        var P = targets[eye] ? byId[targets[eye]] : null, C2 = targets.length > 1 ? byId[targets[targets.length - 1]] : null;
        /* "finishes the route" is a timing throw: the ball leaves as he is a beat
           from the end of what you drew, so it meets him there */
        var routeDone = P && P.path && left(P) <= Math.max(P.v, 3) * (T.read.release + T.read.timing + flightTo(P.path[P.path.length - 1]));
        if (t >= Tp && !collapsed) { collapsed = true; say(t, 'pressure', 'The pocket is gone.'); }
        if (!collapsed && P && t >= eyeAt && (routeDone || (t >= minRead && openBy(P) >= T.read.separation))) {
          /* covered at the top of his route, and there is another read: move on */
          if (routeDone && eye < targets.length - 1 && openBy(P) < T.read.covered) {
            eye++; eyeAt = t + T.read.shift;
            say(t, 'progress', eye === 1 ? 'Covered. Second read.' : 'Covered. Third read.');
          } else windup = { to: P, at: t + T.read.release, primary: eye === 0 };
        }
        else if (collapsed) {
          if (C2) { windup = { to: C2, at: Math.max(t + T.read.release * 0.6, pa ? pa.fake : 0), primary: false }; say(t, 'checkdown', 'Checks it down.'); }
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
          /* WHY IT FELL. The same roll says why, so no new dice: where it landed
             inside the miss. A drop is a catchable ball he did not hold, about
             catch.drop of all targets (the NFL's rate), fewer for good hands, so
             it is a share of the miss and rarer the likelier the catch was.
             Otherwise it was the coverage, the pressure, the distance or the throw. */
          var u = (roll - pc) / Math.max(1e-6, 1 - pc);
          var dropShare = Math.min(1, Math.max(0, T.catch.drop - (r.arch.hands || 0) * T.catch.dropHands) / Math.max(1e-6, 1 - pc));
          var why = u < dropShare ? 'drop' : sep < T.catch.brokenSep ? 'tight' : I.pressure > 0.85 ? 'pressure' : I.dist > 28 ? 'long' : 'off';
          var missText = { drop: 'Dropped.', tight: 'Broken up.', pressure: 'Off target under pressure.', long: 'Just out of reach.' }[why] ||
            (u - dropShare < (1 - dropShare) / 2 ? 'Overthrown.' : 'Thrown behind him.');
          say(t, 'incomplete', missText);
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
          if (isRun && carrier !== QB) {
            /* to the mesh: toward the man getting it, until it is handed or pitched */
            var bk3 = byId[ballCarrierId];
            if (!carrier && !ball.toss && ball.holder === 'QB') { stepToward(e, bk3.x, bk3.y, T.mesh.qb); return; }
            stepToward(e, e.x, e.y, 0); return;
          }
          /* the fake: he rides the mesh before he can set up */
          if (pa && t < pa.fake) { stepToward(e, pa.mesh.x, pa.mesh.y, 3); return; }
          if (!isRun) { stepToward(e, e.x0, setDef.under ? Y0 - 6.5 : e.y0 - 1, t < 1.2 ? 6 : 1.5); return; }
        }
        if (e.plan === 'carry') { if (!follow(e)) openField(e); return; }
        /* the back carries out the fake, then runs or blocks what you drew */
        if (pa && e === pa.faker && t < pa.carry) { stepToward(e, pa.fakeTo.x, pa.fakeTo.y, e.top * 0.7); return; }
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
        /* a man who bit has to stop and turn before he can play the call */
        if (d.bit && pa && t >= pa.freeze) { d.bit = false; d.stumble = Math.max(d.stumble || 0, T.pa.recover); }
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
        /* PLAY ACTION. The underneath zone (the hook players, a safety down in
           the box, the rats in the hole) reads the backfield: they step up to
           the run they see for a beat before they play what was called. A deep
           defender keeps his depth, and a man defender's eyes are on his man. */
        if (pa && t < pa.freeze && (d.role === 'lb' || d.role === 's') && d.plan === 'zone' && !d.deep) {
          d.bit = true;
          stepToward(d, d.x, Math.max(Y0 + 1.5, d.y0 - T.pa.bite), d.top * T.pa.step);
          return;
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
          /* THE RUB. Another receiver in his path costs him a step, once each */
          if (T.man.rub) for (var ri = 0; ri < receivers.length; ri++) {
            var ro = receivers[ri];
            if (ro === r || (d.rubbed && d.rubbed[ro.id]) || dist(ro, d) > T.man.rubRange) continue;
            d.rubbed = d.rubbed || {}; d.rubbed[ro.id] = true; d.stumble = Math.max(d.stumble || 0, T.man.rub);
          }
          var lp = lagOf(r, d.lag), cush = T.man.cushion;
          /* a man running straight at him eats the cushion: by eatBy seconds he is level, and the faster man wins */
          if (r.vy > 4) cush *= Math.max(0, 1 - t / T.man.eatBy);
          /* he runs where he saw him heading: the side to side speed he saw lag
             seconds ago, carried lead of the way forward. A steady crosser is
             run down; a break still beats him, he was reading the old line */
          var lq = lagOf(r, d.lag + 0.1), lx = lp.x + (lp.x - lq.x) / 0.1 * d.lag * (T.man.lead || 0);
          stepToward(d, lx, Math.min(109.5, r.y + cush), d.top); return;
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
          /* a rat robs crossers (a man running across, away from the side he lined
             up on): he looks for one from where he stands and runs with him;
             anybody else he plays from the hole like any underneath zone */
          var rob = null, rs = d.rat ? T.zone.ratRadius : 0;
          if (d.rat) receivers.forEach(function (r) { var s = dist(r, d); if (Math.abs(r.vx) > 2 * Math.abs(r.vy) + 1 && r.vx * (r.x0 - BX) < 0 && s < rs) { rs = s; rob = r; } });
          if (rob && t > T.zone.react) { stepToward(d, d.mark.x + (rob.x - d.mark.x) * T.zone.ratPull, d.mark.y + (rob.y - d.mark.y) * T.zone.pull, d.top); return; }
          /* his zone runs from his landmark down to the line: a man underneath it
             counts under of the yards he is in front of the landmark */
          receivers.forEach(function (r) { var ry = r.y - d.mark.y; var s = len(r.x - d.mark.x, ry < 0 ? ry * (T.zone.under || 1) : ry); if (s < R && s < bs) { bs = s; best = r; } });
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

      /* nobody runs off the field: inside the end lines, and only a step past a sideline */
      for (var ci = 0; ci < E.length; ci++) { var ce = E[ci]; ce.y = clamp(ce.y, -9.9, 109.9); ce.x = clamp(ce.x, -1.5, FIELD_W + 1.5); }

      /* -- the ball's place -- */
      if (ball.air) {
        var I2 = ball.air, k = clamp((t - I2.t0) / Math.max(0.01, I2.t1 - I2.t0), 0, 1);
        ball.x = I2.from.x + (I2.to.x - I2.from.x) * k; ball.y = I2.from.y + (I2.to.y - I2.from.y) * k;
        ball.z = T.ball.height + (1.2 - T.ball.height) * k + 4 * k * (1 - k) * (0.6 + I2.dist * 0.045);
      } else if (ball.toss) {
        var to2 = byId[ballCarrierId], k3 = clamp((t - ball.toss.t0) / (ball.toss.t1 - ball.toss.t0), 0, 1);
        ball.x = ball.toss.from.x + (to2.x - ball.toss.from.x) * k3; ball.y = ball.toss.from.y + (to2.y - ball.toss.from.y) * k3;
        ball.z = 1.2 + 2 * k3 * (1 - k3);
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
            var pBreak = Math.max(0.02, T.tackle.broken + (isRun ? T.tackle.runBroken : 0) + (carrier.arch.elusive || 0) - crowd * T.tackle.crowd);
            if (rnd() < pBreak) { dd.missed = T.tackle.missed; say(t, 'broken', 'Breaks a tackle.'); continue; }
            if (isRun && rnd() < T.tackle.fumble) { say(t, 'fumble', 'Fumble.'); finish(t, 'fumble', 'fumble', carrier.y); break; }
            var sp2 = len(carrier.vx, carrier.vy), fwd = sp2 > 0.5 ? clamp(carrier.vy / sp2, 0.2, 1) : 0.4;
            var headOn = dd.y > carrier.y ? 0.55 : 1;
            /* the fall: his momentum, how square he was hit, how strong he is, and a roll */
            var fall = (sp2 * T.tackle.momentum + rnd() * T.tackle.fall + (isRun ? rnd() * T.tackle.drive : 0)) * fwd * headOn * (0.7 + (carrier.arch.power || 0.4) * 0.6);
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
      offense.concat(defense).forEach(function (e) { e.vx *= 0.8; e.vy *= 0.8; e.x = clamp(e.x + e.vx * dt, -1.5, FIELD_W + 1.5); e.y = clamp(e.y + e.vy * dt, -9.9, 109.9); });
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
      var bz = ball.air || ball.toss ? ball.z : ball.holder ? 1.1 : 0.15;
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
    var down = S.down;
    var title = outcome === 'touchdown' ? 'TOUCHDOWN' : outcome === 'safety' ? 'SAFETY' : win ? 'FIRST DOWN'
      : down === 4 ? 'TURNOVER ON DOWNS' : outcome === 'fumble' ? 'FUMBLE' : 'SHORT OF THE STICKS';
    var reason = reasonOf();
    function reasonOf() {
      var need = 'Needed ' + distance + '.';
      if (outcome === 'touchdown') {
        if (cause === 'catch') return 'Caught it in the end zone. Six.';
        if (cause === 'run') return 'Nobody laid a hand on him. Six.';
        return 'Got in from ' + spotName(Y0) + '. Six.';
      }
      if (outcome === 'safety') {
        if (cause === 'sack') return 'Sacked in your own end zone. Safety.';
        if (cause === 'oob') return 'Out of bounds in your own end zone. Safety.';
        return 'Tackled in your own end zone. Safety.';
      }
      if (outcome === 'sack') return 'Sacked. The pocket held ' + (Math.round(Tp * 10) / 10) + ' seconds and there was no checkdown.';
      if (outcome === 'throwaway') return 'Threw it away. The pocket went and there was no checkdown.';
      if (outcome === 'fumble') return 'Fumbled at ' + spotName(spotY) + '. Ball game.';
      if (outcome === 'incomplete') {
        if (cause === 'tight') return 'Incomplete. The throw went into tight coverage.';
        if (cause === 'long') return 'Incomplete. A ' + Math.round(throwInfo.dist) + ' yard throw, just out of reach.';
        if (cause === 'pressure') return 'Incomplete. He threw it with a man in his face.';
        if (cause === 'drop') return 'Incomplete. It hit him in the hands.';
        return 'Incomplete. The throw missed him.';
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

    /* the next snap, when the drive goes on: a first down, or the next down from the spot */
    var next = null;
    if (outcome !== 'touchdown' && outcome !== 'safety' && outcome !== 'fumble' && (win || down < 4)) {
      var nb = clamp(S.ballOn - shown, 1, 99);
      next = win ? { down: 1, distance: Math.min(10, nb), ballOn: nb } : { down: down + 1, distance: Math.max(1, distance - shown), ballOn: nb };
    }

    /* the pre-snap picture: the motion man running his motion, and the defenders who answer it */
    var pre = [];
    if (ctx.track) {
      var mi = E.indexOf(byId[ctx.motion.who]), n = ctx.track.length, runAt = 0;
      for (var pk = 0; pk < n; pk++) {
        var tr2 = ctx.track[pk], P3 = [];
        if (pk) runAt += len(tr2[0] - ctx.track[pk - 1][0], tr2[1] - ctx.track[pk - 1][1]);
        for (var j2 = 0; j2 < E.length; j2++) {
          var e2 = E[j2];
          if (j2 === mi) {
            var hh = heading(tr2[2], tr2[3]), mv = len(tr2[2], tr2[3]) > 0.6;
            P3.push([Math.round(tr2[0] * 100) / 100, Math.round(tr2[1] * 100) / 100, mv ? 'run' : 'idle', mv ? Math.floor(runAt / 0.9) % 4 : 0, hh != null && mv ? hh : 0]);
          } else if (e2.ptrack) {
            var dq = e2.ptrack[pk], dmv = len(dq[2], dq[3]) > 0.6, dh = heading(dq[2], dq[3]);
            P3.push([Math.round(dq[0] * 100) / 100, Math.round(dq[1] * 100) / 100, dmv ? 'run' : 'idle', dmv ? Math.floor(pk / 8) % 4 : 0, dmv && dh != null ? dh : 180]);
          } else P3.push([Math.round(e2.x0 * 100) / 100, Math.round(e2.y0 * 100) / 100, 'idle', 0, e2.side === 'O' ? 0 : 180]);
        }
        pre.push({ t: Math.round((pk - (n - 1)) * dt * 1000) / 1000, p: P3, ball: [Math.round(BX * 100) / 100, Math.round(Y0 * 100) / 100, 0.4], held: true, pressure: 0 });
      }
    }

    return {
      seed: seed >>> 0, distance: distance, callKey: callKey(call), down: downName(distance, Y0, down), downNum: down, ballOn: S.ballOn, goal: S.goal,
      situation: situationName(down, distance, S.ballOn), next: next, Y0: Y0, BX: BX, marker: marker, box: box,
      formation: setDef.id, isRun: isRun, call: call, callName: callName(call), callLine: callLine(call),
      pocket: Math.round(Tp * 100) / 100, outcome: outcome, win: win, title: title,
      yards: shown, spotY: spotY, spot: spotY != null ? spotName(spotY) : null, reason: reason,
      throwInfo: throwInfo ? { dist: Math.round(throwInfo.dist * 10) / 10, sep: throwInfo.sep != null ? Math.round(throwInfo.sep * 10) / 10 : null, p: throwInfo.p != null ? Math.round(throwInfo.p * 1000) / 1000 : null, to: thrownTo ? thrownTo.id : null, primary: throwInfo.primary } : null,
      events: events, ids: E.map(function (e) { return { id: e.id, side: e.side, role: e.role, big: e.role === 'ol' || e.role === 'dl', label: e.label || '' }; }),
      motion: ctx.motion, playAction: !!pa, plans: plansOf(ctx),
      dt: dt, pre: pre, frames: frames, tEnd: tEnd
    };
  }

  var API = { run: run, plans: plans, situationName: situationName, situation: situation, rollCall: rollCall, CALLS: CALLS, CALL_KEYS: CALL_KEYS, callKey: callKey, spotName: spotName, downName: downName, routeName: routeName, callName: callName, chance: chance, FIELD_W: FIELD_W };
  if (isNode) module.exports = API;
  else root.FAW_ENGINE = API;
})(typeof window !== 'undefined' ? window : this);
