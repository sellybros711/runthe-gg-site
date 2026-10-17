/* 4th and What: the top-down pixel players.
 *
 * The house pixel style is golf's (golf/pxgolfer.js): a sprite is a grid of
 * strings, one character per pixel, each character a palette key, with a dark
 * outline and shades worked out from the base colour. These players are seen
 * from straight above, so they are built for the field rather than borrowed.
 *
 * Every pose is drawn ONCE, facing up the screen (toward the end zone the
 * offense attacks). The other three facings are exact quarter turns of the
 * grid, which a square pixel grid survives with no loss, and "down" (a player
 * on the ground) is the standing pose turned on its side.
 *
 * A pose is a stack of layers (torso, arms, legs, helmet, ball), each a 16x16
 * grid where '.' is see-through. Layers are composed once and cached, so the
 * run cycle and the poses share one torso and one helmet and cannot drift.
 *
 * Palette keys
 *   k outline        H helmet      h helmet shade   W helmet stripe   M facemask
 *   J jersey         j jersey shade T trim (shoulder numbers)
 *   A skin           P pants       p pants shade     S shoes
 *   B ball           L laces
 *
 * Plain script: window.FAW_SPRITES in the browser, module.exports in node.
 */
(function (root) {
  'use strict';
  var N = 16;

  /* ---------- the layers, all facing up ---------- */

  var HELMET = [
    '................',
    '......kkkk......',
    '.....kMMMMk.....',
    '....kHHWWHHk....',
    '....kHHWWHHk....',
    '....khHWWHhk....',
    '.....khhhhk.....',
    '................'
  ];

  var TORSO = [
    '', '', '', '', '',
    '..kkkkkkkkkkkk..',
    '.kJJJJJJJJJJJJk.',
    '.kJTTJJJJJJTTJk.',
    '.kjJJJJJJJJJJjk.',
    '..kjjJJJJJJjjk..',
    '...kkPPPPPPkk...'
  ];

  /* Linemen are a size bigger, so the box is easy to count. */
  var TORSO_BIG = [
    '', '', '', '', '',
    '.kkkkkkkkkkkkkk.',
    'kJJJJJJJJJJJJJJk',
    'kJTTJJJJJJJJTTJk',
    'kjJJJJJJJJJJJJjk',
    '.kjjJJJJJJJJjjk.',
    '..kkPPPPPPPPkk..'
  ];

  /* Arms. Each is the LEFT arm; the right is its mirror. */
  var ARM_SIDE = ['', '', '', '', '', '', 'k', 'kA', 'kA', '.k'];
  var ARM_FWD = ['', '', '.k', 'kAk', 'kAk', 'kAk', '.k'];
  var ARM_BACK = ['', '', '', '', '', '', '', '', 'k', 'kA', 'kA', '.k'];
  var ARM_REACH = ['', '', '', '..kk', '.kAk', '.kAk', 'kAk'];
  var ARM_FWD_BIG = ['', '', '..k', '.kAk', '.kAk', '.kAk', '..k'];
  /* Both hands up and together in front of the facemask: a catch. */
  var ARMS_CATCH = [
    '....kk....kk....',
    '...kAAk..kAAk...',
    '...kAk....kAk...',
    '..kAk......kAk..',
    '..kAk......kAk..',
    '.kAk........kAk.'
  ];

  var LEGS = [
    '', '', '', '', '', '', '', '', '', '', '',
    '....kPPkkPPk....',
    '....kPpkkpPk....',
    '....kSSkkSSk....',
    '.....kk..kk.....'
  ];
  /* Left leg pushing off behind, right foot planted under the body. */
  var LEGS_STRIDE = [
    '', '', '', '', '', '', '', '', '', '', '',
    '....kPPkkPPk....',
    '....kPpkkSSk....',
    '....kPpk.kk.....',
    '....kSSk........',
    '.....kk.........'
  ];
  var LEGS_WIDE = [
    '', '', '', '', '', '', '', '', '', '', '',
    '...kPPk..kPPk...',
    '..kPpk....kpPk..',
    '..kSSk....kSSk..',
    '...kk......kk...'
  ];
  var LEGS_WIDE_BIG = [
    '', '', '', '', '', '', '', '', '', '', '',
    '..kPPPk..kPPPk..',
    '.kPPpk....kpPPk.',
    '.kSSSk....kSSSk.',
    '..kkk......kkk..'
  ];

  /* The ball, tucked against the right side, and cocked behind the right
     shoulder for the throw. The loose ball is its own little sprite below. */
  var BALL_TUCK = ['', '', '', '', '', '',
    '...........kkkk.',
    '..........kBLBAk',
    '..........kBLBAk',
    '...........kkkk.'];
  var BALL_COCKED = ['', '', '', '', '', '', '', '', '',
    '............kkk.',
    '...........kBLBk',
    '...........kBLBk',
    '............kkk.'];
  var ARM_BACK_THROW = ['', '', '', '', '', '', '', '', 'k', 'kA', 'kA', '.k'];

  /* Seen from above: pointed ends, the laces along the long axis. */
  var BALL = [
    '..kkkk..',
    '.kBBBBk.',
    'kBLLLLBk',
    '.kBBBBk.',
    '..kkkk..'
  ];

  /* ---------- composing ---------- */

  function blank() { var g = []; for (var y = 0; y < N; y++) g.push(new Array(N + 1).join('.')); return g; }
  function rowOf(layer, y) { var r = layer[y] || ''; while (r.length < N) r += '.'; return r; }
  function mirror(layer) {
    var out = [];
    for (var y = 0; y < layer.length; y++) out.push(rowOf(layer, y).split('').reverse().join(''));
    return out;
  }
  /* Paint layers over one another, top layer last. dy shifts a layer down. */
  function stack(parts) {
    var g = blank().map(function (r) { return r.split(''); });
    parts.forEach(function (p) {
      var layer = p.l || p, dy = p.dy || 0;
      for (var y = 0; y < N; y++) {
        var r = rowOf(layer, y), ty = y + dy;
        if (ty < 0 || ty >= N) continue;
        for (var x = 0; x < N; x++) if (r[x] !== '.') g[ty][x] = r[x];
      }
    });
    return g.map(function (r) { return r.join(''); });
  }
  /* A quarter turn clockwise. */
  function turn(g) {
    var out = [];
    for (var x = 0; x < N; x++) { var r = ''; for (var y = N - 1; y >= 0; y--) r += g[y][x]; out.push(r); }
    return out;
  }

  var L = function (a) { return a; }, R = mirror;
  function body(big) { return big ? TORSO_BIG : TORSO; }

  /* Every pose, as a function of size (big = a lineman). A pose is a list of
     frames; a still pose has one. */
  var POSES = {
    idle: function (big) {
      return [stack([body(big), L(ARM_SIDE), R(ARM_SIDE), big ? LEGS_WIDE_BIG : LEGS, HELMET])];
    },
    run: function (big) {
      var torso = body(big);
      return [
        stack([torso, L(ARM_FWD), R(ARM_BACK), LEGS_STRIDE, HELMET]),
        stack([torso, L(ARM_SIDE), R(ARM_SIDE), LEGS, HELMET]),
        stack([torso, R(ARM_FWD), L(ARM_BACK), R(LEGS_STRIDE), HELMET]),
        stack([torso, L(ARM_SIDE), R(ARM_SIDE), LEGS, HELMET])
      ];
    },
    /* Set before the snap. A lineman has a hand on the ground. */
    stance: function (big) {
      return big ? [stack([TORSO_BIG, L(ARM_SIDE), R(ARM_REACH), LEGS_WIDE_BIG, HELMET])]
        : [stack([TORSO, L(ARM_SIDE), R(ARM_SIDE), LEGS_WIDE, HELMET])];
    },
    /* Engaged: two hands forward, feet wide. Two frames of churning feet. */
    block: function (big) {
      var arms = big ? ARM_FWD_BIG : ARM_FWD;
      var legs = big ? LEGS_WIDE_BIG : LEGS_WIDE;
      return [stack([body(big), L(arms), R(arms), legs, HELMET]),
        stack([body(big), L(arms), R(arms), { l: legs, dy: 1 }, HELMET])];
    },
    catch: function (big) {
      return [stack([body(big), LEGS_STRIDE, HELMET, ARMS_CATCH])];
    },
    /* Running with the ball tucked under the right arm. */
    carry: function (big) {
      var torso = body(big);
      return [
        stack([torso, L(ARM_FWD), LEGS_STRIDE, HELMET, BALL_TUCK]),
        stack([torso, L(ARM_SIDE), LEGS, HELMET, BALL_TUCK]),
        stack([torso, L(ARM_BACK), R(LEGS_STRIDE), HELMET, BALL_TUCK]),
        stack([torso, L(ARM_SIDE), LEGS, HELMET, BALL_TUCK])
      ];
    },
    /* The QB: ball cocked behind the right shoulder, then released. */
    throw: function (big) {
      return [stack([body(big), L(ARM_FWD), R(ARM_BACK_THROW), LEGS_WIDE, HELMET, BALL_COCKED]),
        stack([body(big), L(ARM_SIDE), R(ARM_FWD), R(LEGS_STRIDE), HELMET])];
    },
    /* Laid out for a tackle: arms long, body stretched. */
    dive: function (big) {
      return [stack([{ l: body(big), dy: -1 }, { l: L(ARM_FWD), dy: -2 }, { l: R(ARM_FWD), dy: -2 }, { l: LEGS_STRIDE, dy: 1 }, { l: HELMET, dy: -1 }])];
    },
    /* On the ground: the standing player turned on his side. */
    down: function (big) {
      return [turn(stack([body(big), L(ARM_FWD), R(ARM_SIDE), LEGS, HELMET]))];
    }
  };
  var POSE_NAMES = Object.keys(POSES);

  /* ---------- colour ---------- */

  function shade(hex, amt) {
    hex = (hex || '#888888').replace('#', '');
    if (hex.length < 6) hex = '888888';
    var f = function (v) { return Math.max(0, Math.min(255, parseInt(v, 16) + amt)).toString(16); };
    var p = function (s) { return s.length < 2 ? '0' + s : s; };
    return '#' + p(f(hex.slice(0, 2))) + p(f(hex.slice(2, 4))) + p(f(hex.slice(4, 6)));
  }

  /* Two generic sides, no real team. Offense in red and gold, defense in
     road white and navy, so they never blur together on green. */
  var TEAMS = {
    offense: { H: '#e0a82e', W: '#7a1712', J: '#c23a26', T: '#fff4d6', P: '#f1e6c8' },
    defense: { H: '#1f3b73', W: '#f4efe4', J: '#f4efe4', T: '#1f3b73', P: '#1f3b73' }
  };
  var SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e', '#a86b3c'];
  var FIXED = { k: '#181019', M: '#cfd3da', S: '#232733', B: '#8a4b22', L: '#f4efe4' };

  function palette(team, skin) {
    var t = TEAMS[team] || TEAMS.offense;
    return {
      k: FIXED.k, M: FIXED.M, S: FIXED.S, B: FIXED.B, L: FIXED.L,
      H: t.H, h: shade(t.H, -48), W: t.W,
      J: t.J, j: shade(t.J, -38), T: t.T,
      P: t.P, p: shade(t.P, -34),
      A: SKINS[(skin || 0) % SKINS.length]
    };
  }

  /* ---------- the public grid API (node and browser) ---------- */

  /* The grid for one pose, frame and facing (0 up, 1 right, 2 down, 3 left). */
  function grid(pose, frame, facing, big) {
    var frames = (POSES[pose] || POSES.idle)(!!big);
    var g = frames[((frame || 0) % frames.length + frames.length) % frames.length];
    for (var i = 0; i < ((facing || 0) & 3); i++) g = turn(g);
    return g;
  }
  function frameCount(pose) { return (POSES[pose] || POSES.idle)(false).length; }

  /* ---------- drawing (browser) ---------- */

  var cache = {};
  function canvasFor(pose, frame, facing, team, skin, big) {
    var key = [pose, frame, facing, team, skin, big ? 1 : 0].join('|');
    if (cache[key]) return cache[key];
    var g = grid(pose, frame, facing, big), pal = palette(team, skin);
    var c = document.createElement('canvas'); c.width = N; c.height = N;
    var x2 = c.getContext('2d');
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var ch = g[y][x]; if (ch === '.') continue;
      x2.fillStyle = pal[ch] || '#ff00ff'; x2.fillRect(x, y, 1, 1);
    }
    return (cache[key] = c);
  }
  var ballCanvas = null;
  function ballImage() {
    if (ballCanvas) return ballCanvas;
    var pal = palette('offense', 0), c = document.createElement('canvas');
    c.width = BALL[0].length; c.height = BALL.length;
    var x2 = c.getContext('2d');
    for (var y = 0; y < BALL.length; y++) for (var x = 0; x < BALL[y].length; x++) {
      var ch = BALL[y][x]; if (ch === '.') continue;
      x2.fillStyle = pal[ch]; x2.fillRect(x, y, 1, 1);
    }
    return (ballCanvas = c);
  }

  /* Draw a player centred on (cx, cy). cell is device pixels per sprite pixel. */
  function draw(ctx, o, cx, cy, cell) {
    var img = canvasFor(o.pose || 'idle', o.frame || 0, o.facing || 0, o.team || 'offense', o.skin || 0, !!o.big);
    var s = N * cell;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
  }
  function drawBall(ctx, cx, cy, cell, vertical) {
    var img = ballImage(), w = img.width * cell, h = img.height * cell;
    ctx.imageSmoothingEnabled = false;
    ctx.save(); ctx.translate(Math.round(cx), Math.round(cy));
    if (vertical) ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, Math.round(-w / 2), Math.round(-h / 2), w, h);
    ctx.restore();
  }

  var API = {
    N: N, POSES: POSE_NAMES, TEAMS: TEAMS, SKINS: SKINS, BALL: BALL,
    grid: grid, frameCount: frameCount, palette: palette, shade: shade,
    draw: draw, drawBall: drawBall
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_SPRITES = API;
})(typeof window !== 'undefined' ? window : this);
