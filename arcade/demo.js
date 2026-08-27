/* demo.js: the game, played for you, in about four seconds. window.RTGDemo
 *
 * WHY THIS EXISTS
 * A rules list tells you what the game is. It does not tell you what to DO,
 * and on a phone it is four lines of grey text between a player and a board
 * they have not seen. Watching one round happen answers both at once: where to
 * type, what turns green, what a point looks like. Every puzzle app that has
 * solved onboarding solved it this way.
 *
 * WHAT IT IS
 * A tiny timeline over plain DOM. No canvas, no library, no network: a scene
 * is a list of {at, fn} pairs in milliseconds, played on a stage the scene
 * builds out of four primitives that cover all twelve games:
 *
 *   tiles(n)     a row of cells that fill, colour and pop
 *   field()      an input line that types itself
 *   rows()       stacked lines that reveal, reorder or strike out
 *   note()       the one line of chrome a round needs (score, clock, label)
 *
 * A scene LOOPS. You can watch it twice without tapping anything, which is
 * what people actually do, and it means no step needs to be complete on the
 * first pass.
 *
 * REDUCED MOTION is not a degraded path here: play(0) jumps every action to
 * its end state at once, so the stage still shows the finished round, just
 * without the motion. Same code, no second implementation to keep in step.
 *
 * ADDING A GAME is a SCENES entry: two steps, each a caption and a build
 * function. Nothing else in the file knows the games exist.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.RTGDemo = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STYLE_ID = 'rtgDemoStyle';
  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var css = [
      /* The stage is a fixed-height box on purpose. A scene that grows as it
         plays shoves the caption and the button down the card mid-animation,
         which reads as a bug even when it is the animation working. */
      /* min-height, not height: a three-row scene plus a note plus a typing
         field is taller than 132 and was being clipped by overflow. Every
         node a scene uses is built at mount, so the box is settled before
         the first frame and nothing grows mid-animation, which was the
         reason for pinning it in the first place. */
      '.rtgd-stage{position:relative;min-height:132px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;',
      '  background:var(--card2,rgba(255,255,255,.04));border:1px solid var(--line,rgba(255,255,255,.08));border-radius:12px;padding:12px;overflow:hidden;}',
      '.rtgd-row{display:flex;gap:5px;align-items:center;justify-content:center;flex-wrap:nowrap;}',
      '.rtgd-cell{min-width:30px;height:34px;padding:0 5px;border-radius:6px;display:flex;align-items:center;justify-content:center;',
      '  background:var(--card3,rgba(255,255,255,.07));border:1.5px solid var(--line2,rgba(255,255,255,.14));',
      '  font-family:var(--hero,inherit);font-weight:400;font-size:19px;line-height:1;color:var(--ink,#F4F7FB);',
      '  transition:background .22s ease,border-color .22s ease,color .22s ease,transform .22s ease;}',
      '.rtgd-cell.sm{min-width:23px;height:27px;font-size:13px;padding:0 4px;}',
      '.rtgd-cell.on{transform:translateY(-2px);}',
      '/* Green means right in every one of these games, so the verdict colours are\n'+
      '   fixed and the game accent is left to the chrome. Painting hit with the\n'+
      '   accent turned Guess red at the exact moment its caption said green. */'+
      '.rtgd-cell.hit{background:var(--green,#48D17A);border-color:var(--green,#48D17A);color:#08131F;}',
      '.rtgd-cell.near{background:var(--gold,#F2B632);border-color:var(--gold,#F2B632);color:#20180a;}',
      '.rtgd-cell.miss{background:transparent;border-color:var(--red,#FF625F);color:var(--red,#FF625F);}',
      '.rtgd-cell.blank{background:transparent;border-style:dashed;}',
      '.rtgd-field{min-width:150px;max-width:100%;height:32px;padding:0 10px;border-radius:8px;display:flex;align-items:center;',
      '  background:var(--card,rgba(0,0,0,.25));border:1.5px solid var(--line2,rgba(255,255,255,.14));',
      '  font-weight:800;font-size:13.5px;color:var(--ink,#F4F7FB);white-space:nowrap;overflow:hidden;}',
      '.rtgd-field.go{border-color:var(--green,#48D17A);}',
      /* A clue is read, not typed, so it takes the width it needs and a size
         that fits it. The nowrap above exists so a name being typed does not
         reflow mid-keystroke; a clue never changes once it is printed. */
      '.rtgd-field.clue{font-size:11.5px;font-weight:700;min-width:0;width:100%;white-space:normal;height:auto;min-height:32px;padding:6px 10px;line-height:1.35;}',
      '.rtgd-caret{display:inline-block;width:1.5px;height:15px;margin-left:1px;background:var(--a,#F4F7FB);animation:rtgdBlink 1s steps(1) infinite;}',
      '@keyframes rtgdBlink{50%{opacity:0}}',
      '.rtgd-line{display:flex;align-items:center;gap:7px;width:100%;max-width:236px;padding:5px 9px;border-radius:8px;',
      '  background:var(--card3,rgba(255,255,255,.06));border:1px solid var(--line,rgba(255,255,255,.08));',
      '  font-weight:800;font-size:12.5px;color:var(--ink,#F4F7FB);',
      '  transition:background .25s ease,border-color .25s ease,opacity .25s ease,transform .3s cubic-bezier(.34,1.56,.64,1);}',
      '.rtgd-line .rtgd-k{font-size:10px;font-weight:900;color:var(--mut,#A9B8CB);min-width:13px;}',
      '.rtgd-line .rtgd-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtgd-line .rtgd-v{margin-left:auto;padding-left:7px;font-size:11px;font-weight:900;color:var(--mut,#A9B8CB);white-space:nowrap;}',
      '.rtgd-line.hit{background:color-mix(in srgb,var(--green,#48D17A) 20%,transparent);border-color:var(--green,#48D17A);}',
      '.rtgd-line.hit .rtgd-v{color:var(--ink,#F4F7FB);}',
      '.rtgd-line.out{opacity:.32;}',
      '.rtgd-line.gone{opacity:0;transform:scale(.94);}',
      '.rtgd-note{font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--mut,#A9B8CB);',
      '  transition:color .2s ease,opacity .2s ease;}',
      '.rtgd-note.pop{color:var(--a,#48D17A);}',
      '.rtgd-cap{font-size:13px;font-weight:700;line-height:1.45;color:var(--mut,#A9B8CB);text-align:center;margin:11px 0 0;min-height:37px;}',
      '@media (prefers-reduced-motion:reduce){',
      '  .rtgd-cell,.rtgd-line,.rtgd-note{transition:none!important;}',
      '  .rtgd-caret{animation:none;}',
      '}'
    ].join('');
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function reduced() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  function el(cls, txt) {
    var d = document.createElement('div');
    if (cls) d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }

  /* ---- primitives ---------------------------------------------------------
     Each returns the node plus the handful of verbs a scene needs. Deliberately
     small: anything a scene cannot say with these is a sign the demo is trying
     to teach more than one thing. */
  function tiles(word, opts) {
    opts = opts || {};
    var row = el('rtgd-row'), cells = [];
    for (var i = 0; i < word.length; i++) {
      var c = el('rtgd-cell' + (opts.small ? ' sm' : '') + (opts.blank ? ' blank' : ''));
      if (!opts.blank) c.textContent = word[i] === ' ' ? '' : word[i];
      row.appendChild(c); cells.push(c);
    }
    return {
      node: row,
      set: function (i, ch, cls) {
        var c = cells[i]; if (!c) return;
        if (ch != null) c.textContent = ch;
        c.className = 'rtgd-cell' + (opts.small ? ' sm' : '') + (cls ? ' ' + cls : '');
      },
      all: function (cls) { cells.forEach(function (c, i) { setTimeout(function () {
        c.className = 'rtgd-cell' + (opts.small ? ' sm' : '') + ' ' + cls; }, i * 55); }); },
      reset: function () { cells.forEach(function (c, i) {
        c.className = 'rtgd-cell' + (opts.small ? ' sm' : '') + (opts.blank ? ' blank' : '');
        if (opts.blank) c.textContent = ''; else c.textContent = word[i] === ' ' ? '' : word[i];
      }); }
    };
  }

  function field(placeholder, cls) {
    var f = el('rtgd-field' + (cls ? ' ' + cls : ''));
    var span = document.createElement('span');
    var caret = el('rtgd-caret');
    f.appendChild(span); f.appendChild(caret);
    span.textContent = placeholder || '';
    return {
      node: f,
      text: function (s) { span.textContent = s; },
      good: function (on) { f.className = 'rtgd-field' + (cls ? ' ' + cls : '') + (on ? ' go' : ''); },
      reset: function () { span.textContent = placeholder || ''; f.className = 'rtgd-field' + (cls ? ' ' + cls : ''); }
    };
  }

  function rows(items) {
    var wrap = el('rtgd-row'); wrap.style.flexDirection = 'column'; wrap.style.gap = '5px';
    wrap.style.width = '100%'; wrap.style.alignItems = 'stretch';
    var made = items.map(function (it) {
      var line = el('rtgd-line');
      if (it.k != null) line.appendChild(el('rtgd-k', it.k));
      line.appendChild(el('rtgd-t', it.t));
      // always built, even empty: Roll Call fills the shirt number in later and
      // val() had nothing to write to when the row started without one
      line.appendChild(el('rtgd-v', it.v == null ? '' : it.v));
      wrap.appendChild(line);
      return line;
    });
    return {
      node: wrap,
      cls: function (i, c) { if (made[i]) made[i].className = 'rtgd-line' + (c ? ' ' + c : ''); },
      text: function (i, s) { var n = made[i] && made[i].querySelector('.rtgd-t'); if (n) n.textContent = s; },
      val: function (i, s) { var n = made[i] && made[i].querySelector('.rtgd-v'); if (n) n.textContent = s; },
      swap: function (a, b) {
        var ta = made[a].querySelector('.rtgd-t').textContent;
        made[a].querySelector('.rtgd-t').textContent = made[b].querySelector('.rtgd-t').textContent;
        made[b].querySelector('.rtgd-t').textContent = ta;
      },
      reset: function () { made.forEach(function (m, i) {
        m.className = 'rtgd-line';
        var t = m.querySelector('.rtgd-t'); if (t) t.textContent = items[i].t;
        var v = m.querySelector('.rtgd-v'); if (v) v.textContent = items[i].v == null ? '' : items[i].v;
      }); }
    };
  }

  function note(txt) {
    var n = el('rtgd-note', txt);
    return {
      node: n,
      text: function (s, pop) { n.textContent = s; n.className = 'rtgd-note' + (pop ? ' pop' : ''); },
      reset: function () { n.textContent = txt; n.className = 'rtgd-note'; }
    };
  }

  // type a string into a field one character at a time, as timeline actions
  function typeInto(f, text, from, step) {
    var acts = [], i;
    for (i = 1; i <= text.length; i++) {
      (function (n) { acts.push({ at: from + n * step, fn: function () { f.text(text.slice(0, n)); } }); })(i);
    }
    return acts;
  }

  /* ---- the player ---------------------------------------------------------
     One timer, cancelled on stop, restarted on loop. Actions are sorted so a
     scene can be written in whatever order reads best. */
  function play(stage, scene, speed, onLoop) {
    var timers = [], stopped = false, pass = 0;
    var acts = scene.acts.slice().sort(function (a, b) { return a.at - b.at; });
    var span = scene.loop || (acts.length ? acts[acts.length - 1].at + 1400 : 1400);
    function run() {
      if (stopped) return;
      if (scene.reset) scene.reset();
      if (onLoop) onLoop(pass++);
      if (speed === 0) {                       // reduced motion: end state, at once
        acts.forEach(function (a) { try { a.fn(); } catch (e) {} });
        return;
      }
      acts.forEach(function (a) {
        timers.push(setTimeout(function () { if (!stopped) { try { a.fn(); } catch (e) {} } }, a.at));
      });
      timers.push(setTimeout(run, span));
    }
    run();
    return function stop() {
      stopped = true;
      timers.forEach(clearTimeout); timers.length = 0;
    };
  }

  /* ---- the scenes ---------------------------------------------------------
     Two per game. The first shows the ASK, the second shows what a right
     answer looks like, because those are the two things a rules list is worst
     at. Times are milliseconds from the start of the loop. */
  var SCENES = {
    sportegories: function () {
      var n = note('Letter D'), t = tiles('DUNCAN', { small: true, blank: true }), f = field('Type a name');
      var word = 'DUNCAN';
      return {
        cap: ['First OR last name starts with the letter.', 'Rarer names score more. Two minutes, eight categories.'],
        nodes: [n, t, f],
        acts: [{ at: 300, fn: function () { n.text('NBA · Power forwards'); } }]
          .concat(typeInto(f, 'Duncan', 700, 130))
          .concat([
            { at: 1650, fn: function () { f.good(true); t.all('hit'); } },
            { at: 1700, fn: function () { for (var i = 0; i < word.length; i++) t.set(i, word[i], 'hit'); } },
            { at: 2100, fn: function () { n.text('+14 · only 3% said him', true); } }
          ]),
        loop: 4200,
        reset: function () { n.reset(); t.reset(); f.reset(); }
      };
    },
    crossword: function () {
      var n = note('4 down'), t = tiles('    ', { blank: true }), f = field('Sports mini crossword', 'clue');
      var w = 'RUTH';
      return {
        cap: ['A clue about a career, not a category.', 'Fill the grid against the clock.'],
        nodes: [n, t, f],
        acts: [
          { at: 250, fn: function () { f.text('Yankees slugger who called his own shot'); } },
          { at: 800, fn: function () { t.set(0, w[0], 'on'); } },
          { at: 1050, fn: function () { t.set(1, w[1], 'on'); } },
          { at: 1300, fn: function () { t.set(2, w[2], 'on'); } },
          { at: 1550, fn: function () { t.set(3, w[3], 'on'); } },
          { at: 1900, fn: function () { t.all('hit'); n.text('Solved · 1:12', true); } }
        ],
        loop: 4000,
        reset: function () { n.reset(); t.reset(); f.reset(); }
      };
    },
    almamater: function () {
      var n = note('NFL · Indianapolis Colts'), r = rows([{ t: 'Philip Rivers' }]), f = field('Name the school');
      return {
        cap: ['Where did they go to college? Type it.', 'NC State, North Carolina State, either one counts.'],
        nodes: [n, r, f],
        acts: typeInto(f, 'NC State', 500, 120).concat([
          { at: 1900, fn: function () { f.good(true); r.cls(0, 'hit'); } },
          { at: 2200, fn: function () { n.text('+2 · North Carolina State', true); } }
        ]),
        loop: 4200,
        reset: function () { n.reset(); r.reset(); f.reset(); }
      };
    },
    career: function () {
      var n = note('Career path'), r = rows([{ k: '1', t: '· · ·' }, { k: '2', t: '· · ·' }, { k: '3', t: '· · ·' }]), f = field('Name the player');
      return {
        cap: ['A career, one club at a time.', 'Name him off the first club and it is worth 5.'],
        nodes: [n, r, f],
        acts: [
          { at: 400, fn: function () { r.text(0, 'Seattle Mariners'); } },
          { at: 1100, fn: function () { r.text(1, 'Cincinnati Reds'); } },
          { at: 1800, fn: function () { r.text(2, 'Chicago White Sox'); } }
        ].concat(typeInto(f, 'Ken Griffey Jr.', 2200, 90)).concat([
          { at: 3700, fn: function () { f.good(true); r.cls(0, 'hit'); r.cls(1, 'hit'); r.cls(2, 'hit'); } },
          { at: 4000, fn: function () { n.text('+3', true); } }
        ]),
        loop: 5600,
        reset: function () { n.reset(); r.reset(); f.reset(); }
      };
    },
    match: function () {
      var n = note('Find four that belong'), t = tiles('ABCDEFGH', { small: true });
      var NAMES = ['Bird', 'Rice', 'Ruth', 'Ali', 'Magic', 'Judge', 'Brady', 'Kobe'];
      var t2 = tiles('        ', { small: true });
      return {
        cap: ['Sixteen names hide four secret groups.', 'Lock four that share a thread. Four wrong ends the day.'],
        nodes: [n, t, t2],
        acts: [
          { at: 200, fn: function () { for (var i = 0; i < 8; i++) t.set(i, NAMES[i][0], null); } },
          { at: 700, fn: function () { t.set(0, 'B', 'on'); n.text('Boston legends?'); } },
          { at: 1000, fn: function () { t.set(4, 'M', 'on'); } },
          { at: 1300, fn: function () { t.set(7, 'K', 'on'); } },
          { at: 1600, fn: function () { t.set(2, 'R', 'on'); } },
          { at: 2100, fn: function () { t.set(0, 'B', 'hit'); t.set(4, 'M', 'hit'); t.set(7, 'K', 'hit'); t.set(2, 'R', 'hit'); } },
          { at: 2400, fn: function () { n.text('Group locked · 3 to go', true); } }
        ],
        loop: 4400,
        reset: function () { n.reset(); t.reset(); t2.reset(); }
      };
    },
    rollcall: function () {
      var n = note('Spurs · 2009-10 · 0:90'), r = rows([{ k: '1', t: '· · ·' }, { k: '2', t: '· · ·' }, { k: '3', t: '· · ·' }]), f = field('Name a player');
      return {
        cap: ['One club, one season, ninety seconds.', 'Name as many of that roster as you can.'],
        nodes: [n, r, f],
        acts: typeInto(f, 'Tim Duncan', 300, 90).concat([
          { at: 1300, fn: function () { r.text(0, 'Tim Duncan'); r.val(0, '#21'); r.cls(0, 'hit'); f.text(''); } }
        ]).concat(typeInto(f, 'Manu Ginobili', 1600, 80)).concat([
          { at: 2800, fn: function () { r.text(1, 'Manu Ginobili'); r.val(1, '#20'); r.cls(1, 'hit'); f.text(''); } },
          { at: 3200, fn: function () { r.text(2, 'DeJuan Blair'); r.val(2, 'deep cut'); r.cls(2, 'hit'); n.text('3 named', true); } }
        ]),
        loop: 5000,
        reset: function () { n.reset(); r.reset(); f.reset(); }
      };
    },
    chain: function () {
      var r = rows([{ k: 'A', t: 'LeBron James' }, { k: '', t: '· · ·' }, { k: '', t: '· · ·' }, { k: 'B', t: 'Ray Allen' }]);
      var f = field('Name a teammate');
      return {
        cap: ['Get from one player to the other through teammates.', 'Each name has to have played alongside the one above.'],
        nodes: [r, f],
        acts: typeInto(f, 'Dwyane Wade', 400, 85).concat([
          { at: 1450, fn: function () { r.text(1, 'Dwyane Wade'); r.cls(1, 'hit'); f.text(''); } },
          { at: 1900, fn: function () { r.text(2, 'Chris Bosh'); r.cls(2, 'hit'); } },
          { at: 2400, fn: function () { r.cls(0, 'hit'); r.cls(3, 'hit'); } }
        ]),
        loop: 4200,
        reset: function () { r.reset(); f.reset(); }
      };
    },
    rankit: function () {
      var n = note('Most career home runs');
      var r = rows([{ k: '1', t: 'Babe Ruth', v: '714' }, { k: '2', t: 'Barry Bonds', v: '762' }, { k: '3', t: 'Hank Aaron', v: '755' }]);
      return {
        cap: ['Five players, one career stat, most at the top.', 'Tap two to swap them. Five tries.'],
        nodes: [n, r],
        acts: [
          { at: 500, fn: function () { r.cls(0, 'out'); r.cls(1, 'out'); n.text('Swap these two'); } },
          { at: 1100, fn: function () { r.swap(0, 1); r.val(0, '762'); r.val(1, '714'); } },
          { at: 1500, fn: function () { r.swap(1, 2); r.val(1, '755'); r.val(2, '714'); } },
          { at: 2000, fn: function () { r.cls(0, 'hit'); r.cls(1, 'hit'); r.cls(2, 'hit'); n.text('In order · 2 tries', true); } }
        ],
        loop: 4000,
        reset: function () { n.reset(); r.reset(); }
      };
    },
    guess: function () {
      var n = note('NBA · guess 1 of 8');
      var t = tiles('PSDCH', { small: true });
      var f = field('Guess any NBA player');
      return {
        cap: ['One mystery player. Every guess tells you more.', 'Green matches, gold is close, arrows point up or down.'],
        nodes: [n, f, t],
        acts: typeInto(f, 'Kevin Durant', 300, 85).concat([
          { at: 1400, fn: function () { t.set(0, 'F', 'hit'); } },
          { at: 1600, fn: function () { t.set(1, 'OKC', 'near'); } },
          { at: 1800, fn: function () { t.set(2, '↓', 'miss'); } },
          { at: 2000, fn: function () { t.set(3, 'TEX', 'miss'); } },
          { at: 2200, fn: function () { t.set(4, 'MVP', 'hit'); n.text('Forward, later era, not Texas', true); } }
        ]),
        loop: 4400,
        reset: function () { n.reset(); t.reset(); f.reset(); }
      };
    },
    table: function () {
      var n = note('Michael Jordan · Bulls'), t = tiles('  ', { blank: true }), f = field('What number?');
      return {
        cap: ['What number did he wear for that club?', 'Exact is a bullseye. Within two still counts.'],
        nodes: [n, t, f],
        acts: [
          { at: 600, fn: function () { t.set(0, '2', 'on'); } },
          { at: 900, fn: function () { t.set(1, '3', 'on'); } },
          { at: 1400, fn: function () { t.all('hit'); f.good(true); f.text('23'); } },
          { at: 1800, fn: function () { n.text('Bullseye', true); } }
        ],
        loop: 3800,
        reset: function () { n.reset(); t.reset(); f.reset(); }
      };
    },
    oddone: function () {
      var n = note('Four share a thread');
      var r = rows([{ t: 'Tom Brady' }, { t: 'Joe Montana' }, { t: 'Jerry Rice' }, { t: 'Peyton Manning' }]);
      return {
        cap: ['Four belong together, one does not.', 'Spot it, then name the link for a second point.'],
        nodes: [n, r],
        acts: [
          { at: 900, fn: function () { r.cls(2, 'out'); } },
          { at: 1400, fn: function () { r.cls(2, 'gone'); n.text('The other three are quarterbacks', true); } },
          { at: 2100, fn: function () { r.cls(0, 'hit'); r.cls(1, 'hit'); r.cls(3, 'hit'); } }
        ],
        loop: 4000,
        reset: function () { n.reset(); r.reset(); }
      };
    },
    highlow: function () {
      var n = note('Career points');
      var r = rows([{ t: 'Kobe Bryant', v: '33,643' }, { t: 'Dirk Nowitzki', v: '?' }]);
      return {
        cap: ['One stat, two players. Higher or lower?', 'Call every athlete that follows until you miss.'],
        nodes: [n, r],
        acts: [
          { at: 800, fn: function () { n.text('Higher or lower?'); r.cls(1, 'out'); } },
          { at: 1600, fn: function () { r.val(1, '31,560'); r.cls(1, 'hit'); n.text('Lower · correct · streak 4', true); } }
        ],
        loop: 3800,
        reset: function () { n.reset(); r.reset(); }
      };
    }
  };

  /* ---- mount --------------------------------------------------------------
     Returns a stop() so a modal can kill the timers when it closes. A demo
     still ticking behind a closed modal is a battery leak nobody would ever
     notice by looking. */
  function mount(host, game, accent, opts) {
    if (!host || !SCENES[game]) return null;
    opts = opts || {};
    injectStyle();
    var scene = SCENES[game]();
    var stage = el('rtgd-stage');
    if (accent) stage.style.setProperty('--a', accent);
    scene.nodes.forEach(function (n) { stage.appendChild(n.node); });
    /* The caption is optional because it is not always additive. On the pregame
       gate the rules sit directly under the stage and say the same sentence, so
       printing both is a stutter; in the how-to modal the bullets are longer and
       the caption still earns its line. */
    var cap = opts.caption === false ? null : el('rtgd-cap', scene.cap[0]);
    host.appendChild(stage);
    if (cap) host.appendChild(cap);
    /* The caption rotates with the loop rather than sitting still. A scene has
       two things to say and only one of them fits under a four-second clip, so
       the second pass says the other. Under reduced motion the loop never comes
       round, which is why the first line is always the one that matters most. */
    var stop = play(stage, scene, reduced() ? 0 : 1, cap ? function (pass) {
      cap.textContent = scene.cap[pass % scene.cap.length];
    } : null);
    return { stop: stop };
  }

  function has(game) { return !!SCENES[game]; }

  return { mount: mount, has: has, games: Object.keys(SCENES) };
});
