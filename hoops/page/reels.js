// ── the loading bar ────────────────────────────────────────────────────────

/* FIVE STEPS, AND EVERY ONE OF THEM IS SOMETHING THAT ACTUALLY FINISHED. The
 * bar reports rather than performs, so it moves at whatever speed the
 * connection is really going. Every lookup is guarded because this also runs
 * after the error branch has replaced the screen with a message, and a boot
 * that throws inside its own progress meter turns a readable failure into a
 * blank one. */
var BOOT_STEPS = 5, bootAt = 0;

function bootStep(say){
  bootAt++;
  var bar = $('boot-bar'), msg = $('loadmsg');
  if (bar) bar.style.width = Math.min(100, Math.round(100 * bootAt / BOOT_STEPS)) + '%';
  if (msg && say) msg.textContent = say;
}

function bootFailed(message){
  var box = $('boot'), msg = $('loadmsg');
  if (box) box.className = 'boot failed';
  if ($('boot-bar')) $('boot-bar').style.width = '100%';
  if (msg) msg.textContent = message;
}

// ── the connection rail ────────────────────────────────────────────────────

/* TIERED BY WHAT THE LINK IS WORTH, and carried three ways at once: colour,
 * thickness and dash. A bond's strength stays legible to somebody who cannot
 * separate the colours, which is roughly one man in twelve. */
var RAIL_TIERS = [
  { min: 0.9, color: '#f2c14e', w: 2.6, dash: 'none', op: 0.95 },
  { min: 0.5, color: '#22c55e', w: 2.0, dash: '5 3',  op: 0.8 },
  { min: 0.0, color: '#6aa9ff', w: 1.4, dash: '2 3',  op: 0.62 }
];
var RAIL = { NODE_BLOCK: 44, MIN_DEPTH: 13, PER_SPAN: 7, MAX_DEPTH: 40, PAD: 8 };
var railFocus = null;

function railTier(v){
  for (var i = 0; i < RAIL_TIERS.length; i++) if (v >= RAIL_TIERS[i].min) return RAIL_TIERS[i];
  return RAIL_TIERS[RAIL_TIERS.length - 1];
}

/* THE PAGE HAS NO OPINION ABOUT A SURNAME ANY MORE.
 *
 * This used to be everything after the first token, which is right about
 * "Jackson Jr." and wrong about "Ray Richardson", while the engine's
 * lastNameOf took the final token, which is the other way round. So the court
 * and the live board printed different names for one man, and a live game's
 * verdict card read "Jaren Jackson Jr. had 32." over a chip reading "Jr.".
 * The rule lives in engine.js now and this is the one call into it, kept as a
 * name rather than inlined because the two courts and the rail all want it. */
function lastName(n){ return E.lastNameOf(n); }

function drawRail(){
  var el = $('rail');
  if (!el) return;
  var n = E.SLOTS.length;
  var bySlot = new Array(n).fill(null);
  for (var i = 0; i < run.roster.length; i++) bySlot[run.slotIndex[i]] = run.roster[i];

  var signed = bySlot.filter(Boolean).length;
  el.textContent = '';
  if (signed < 2) { el.className = 'rail off'; el.style.height = '0px'; return; }
  el.className = 'rail';

  var nodes = document.createElement('div');
  nodes.className = 'rnodes';
  var at = {};
  for (var r = 0; r < run.roster.length; r++) at[run.roster[r].n] = run.slotIndex[r];

  for (var s = 0; s < n; s++) {
    (function(idx, p){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rnode' + (p ? ' on' : '') + (railFocus === idx ? ' focus' : '');
      var dot = document.createElement('span');
      dot.className = 'rdot';
      dot.textContent = E.SLOTS[idx];
      if (p) dot.style.background = posPaint(E.SLOTS[idx]);
      var nm = document.createElement('span');
      nm.className = 'rnm';
      nm.textContent = p ? lastName(p.n) : '';
      b.appendChild(dot); b.appendChild(nm);
      /* Tapping the same node twice clears it, or the only way out of a filter
         is to find another node, which on six nodes is a puzzle. */
      b.onclick = function(){ railFocus = (railFocus === idx ? null : idx); drawRail(); };
      nodes.appendChild(b);
    })(s, bySlot[s]);
  }
  el.appendChild(nodes);

  var links = E.resolveChemistry(run.roster).links;
  var arcs = [];
  for (var k = 0; k < links.length; k++) {
    var l = links[k];
    if (at[l.a] == null || at[l.b] == null) continue;
    var a = Math.min(at[l.a], at[l.b]), b2 = Math.max(at[l.a], at[l.b]);
    arcs.push({ a: a, b: b2, t: railTier(l.value || 0), label: l.label });
  }
  arcs.sort(function(x, y){ return (x.b - x.a) - (y.b - y.a); });

  var cx = function(i){ return ((i + 0.5) / n) * 100; };
  var depth = function(span){
    return Math.min(RAIL.MAX_DEPTH, RAIL.MIN_DEPTH + (span - 1) * RAIL.PER_SPAN);
  };
  var deepest = 0;
  for (var d = 0; d < arcs.length; d++) deepest = Math.max(deepest, depth(arcs[d].b - arcs[d].a));

  el.style.height = (RAIL.NODE_BLOCK + (arcs.length ? deepest + RAIL.PAD : 0)) + 'px';

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'rarcs');
  svg.setAttribute('viewBox', '0 0 100 ' + (deepest + RAIL.PAD));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.height = (deepest + RAIL.PAD) + 'px';
  for (var c = 0; c < arcs.length; c++) {
    var arc = arcs[c], dd = depth(arc.b - arc.a);
    var dim = railFocus !== null && railFocus !== arc.a && railFocus !== arc.b;
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M ' + cx(arc.a).toFixed(2) + ' 0 Q '
      + ((cx(arc.a) + cx(arc.b)) / 2).toFixed(2) + ' ' + (dd * 2) + ' '
      + cx(arc.b).toFixed(2) + ' 0');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', arc.t.color);
    path.setAttribute('stroke-width', (arc.t.w * 0.5).toFixed(2));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    if (arc.t.dash !== 'none') path.setAttribute('stroke-dasharray', arc.t.dash);
    path.setAttribute('opacity', dim ? 0.09 : arc.t.op);
    svg.appendChild(path);
  }
  el.appendChild(svg);

  var note = document.createElement('p');
  note.className = 'railnote';
  if (railFocus !== null && bySlot[railFocus]) {
    var mine = arcs.filter(function(x){ return x.a === railFocus || x.b === railFocus; });
    note.textContent = bySlot[railFocus].n + ': ' + (mine.length
      ? mine.length + ' connection' + (mine.length === 1 ? '' : 's') + ', ' + mine[0].label
      : 'no connections here');
  } else {
    note.textContent = arcs.length
      ? arcs.length + ' connection' + (arcs.length === 1 ? '' : 's') + '. Tap a player to see his.'
      : 'No chemistry yet. Old teammates, college teammates and draft classmates build it.';
  }
  el.appendChild(note);
}

// ── the ring ───────────────────────────────────────────────────────────────

/* ASKED ONCE, IN ONE PLACE. Two callers now (the confetti and the front page's
   animation), and a second copy of a media query string is a second thing to
   get wrong. Read live rather than cached, because a reader can change this
   setting without reloading the page. */
function reduceMotion(){
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* WINNING USED TO CHANGE ONE WORD ON THE SCREEN. Off by default for anybody who
   has asked their system for less motion, and it removes itself. */
function fireConfetti(){
  if (reduceMotion()) return;
  /* ONE SHOWER AT A TIME. A title is celebrated on the bracket and again on
     the results screen a moment later, and the first is still falling when
     the second is asked for: two canvases is twice the pieces for no reason. */
  if (document.querySelector('.confetti-cv')) return;
  var colors = ['#f2c14e', '#f0782d', '#ffffff', '#fde68a', '#22c55e'];
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var cv = document.createElement('canvas');
  cv.className = 'confetti-cv';
  cv.width = Math.floor(window.innerWidth * dpr);
  cv.height = Math.floor(window.innerHeight * dpr);
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, parts = [];
  for (var i = 0; i < 160; i++) {
    parts.push({
      x: Math.random() * W, y: -Math.random() * H * 0.5,
      w: (5 + Math.random() * 6) * dpr, h: (8 + Math.random() * 8) * dpr,
      vy: (1.6 + Math.random() * 2.6) * dpr, vx: (Math.random() - 0.5) * 1.6 * dpr,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.22,
      c: colors[Math.floor(Math.random() * colors.length)]
    });
  }
  var start = Date.now(), DUR = 3600;
  (function frame(){
    var t = Date.now() - start;
    if (t > DUR) { if (cv.parentNode) cv.parentNode.removeChild(cv); return; }
    ctx.clearRect(0, 0, W, H);
    var fade = t > DUR - 900 ? Math.max(0, (DUR - t) / 900) : 1;
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j];
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > H + 40) { p.y = -40; p.x = Math.random() * W; }
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  })();
}

// ── position pills ─────────────────────────────────────────────────────────

/* ONE PLACE THAT PAINTS A POSITION, which is the football game's rule and the
 * reason a palette change there is one edit rather than a hunt through the call
 * sites writing the same gradient four slightly different ways. */
var POS_COL = { PG: '--pg', SG: '--sg', SF: '--sf', PF: '--pf', C: '--c',
  G: '--g', F: '--f', GF: '--sf', FC: '--pf' };

function posPaint(pos){
  return 'linear-gradient(160deg,var(' + (POS_COL[pos] || '--g') + '),rgba(0,0,0,.42))';
}

function posPill(pos, small){
  var el = document.createElement('span');
  el.className = 'pos' + (small ? ' sm' : '');
  el.style.background = posPaint(pos);
  el.textContent = pos;
  return el;
}

/* A MAN WHO PLAYS TWO SPOTS GETS TWO PILLS, each its own colour, rather than one
   pill reading "PG/SG" painted whichever position the data listed first. The
   old line said the right words in the wrong colour, and the two positions that
   make a player worth drafting looked like one. */
function posPills(p, small){
  var wrap = document.createElement('span');
  wrap.className = 'poss';
  var list = E.positionsOf(p);
  for (var i = 0; i < list.length; i++) wrap.appendChild(posPill(list[i], small));
  return wrap;
}

// ── what a price is worth ──────────────────────────────────────────────────

/* THE MONEY WAS THE PART NOBODY COULD READ, and that is a UI failure rather than
 * a model one. Price comes off a market score and value is win shares, so the
 * two deliberately disagree, and the whole game lives in that gap. A board that
 * prints both numbers and leaves the player to divide one by the other in their
 * head has hidden the game inside arithmetic.
 *
 * WHY NOT JUST SHOW WIN SHARES PER DOLLAR. Because it is a trap, and a measured
 * one: drafting purely on it buys six minimum-salary players, spends $45M of the
 * cap and wins THIRTEEN GAMES. Cheap men have wonderful ratios and no value. The
 * useful question is not "how much value per dollar" but "is this man dear or
 * cheap FOR A PLAYER OF HIS CALIBRE", which is the market residual and the thing
 * the pricing model actually encodes.
 *
 * So the league is bucketed by win shares and each bucket's median price becomes
 * the going rate. A player at 60% of the going rate is a bargain; one at 150% is
 * being paid for his points.
 */
var GOING_RATE = null;

function buildGoingRate(rows){
  var buckets = {};
  for (var i = 0; i < rows.length; i++) {
    var b = Math.max(0, Math.round(rows[i].w));
    (buckets[b] = buckets[b] || []).push(rows[i].p);
  }
  var rate = {};
  for (var k in buckets) {
    var v = buckets[k].sort(function(a, b2){ return a - b2; });
    rate[k] = v[Math.floor(v.length / 2)];
  }
  GOING_RATE = rate;
}

function goingRate(w){
  if (!GOING_RATE) return null;
  var b = Math.max(0, Math.round(w));
  /* Walk outward for a bucket that exists, because the top of the league is
     thin: there is no median price for 21 win shares off two seasons. */
  for (var step = 0; step <= 6; step++) {
    if (GOING_RATE[b - step] != null) return GOING_RATE[b - step];
    if (GOING_RATE[b + step] != null) return GOING_RATE[b + step];
  }
  return null;
}

/* Returns null for a player too cheap for the question to mean anything. At two
   million everybody is a bargain by ratio and none of them helps. */
function dealOf(p){
  if (p.w < 3) return null;
  var fair = goingRate(p.w);
  if (!fair || !p.p) return null;
  var ratio = fair / p.p;
  if (ratio >= 1.25) return { key: 'good', label: 'Bargain' };
  if (ratio <= 0.78) return { key: 'bad', label: 'Paying for points' };
  return { key: 'fair', label: 'Going rate' };
}

// ── the reels ──────────────────────────────────────────────────────────────

/* WHAT YOU DREW, DRAWN. The football and college games spin two reels for the
 * year and the school, and a basketball draw is the same two questions, so this
 * is the same component: a strip of candidates that slides and settles on the
 * one you got.
 *
 * IT IS A DECORATION OVER A DECISION ALREADY MADE. run.js has picked the club
 * before a pixel moves, and the strip is built to END on that pick. Nothing
 * here can change what was drawn, and if the animation is skipped or never
 * runs, the same club is on screen either way.
 */
var ROW_H = 34, SPIN_MS = 560;
var reelBusy = false;

/* ── DRESSING THE WHEEL IN THE CLUB'S COLORS ────────────────────────────────
 *
 * Both boxes, not just the club one: the season and the club are two halves of
 * one draw, and a 1996 in the game's own gold beside a Bulls red is two
 * results rather than one team.
 *
 * The palette is worked out in engine.js, where every one of the 45 franchises
 * this game can draw was measured against this page. What arrives here is a
 * fill, a band and a text color that are already known to work.
 */
var CLUB_VARS = ['--c1', '--c1rgb', '--c2', '--on'];

function dressReel(boxEl, code){
  if (!boxEl) return;
  var skin = E.clubSkin(code);
  boxEl.style.setProperty('--c1', skin.bg);
  boxEl.style.setProperty('--c1rgb', rgbChannels(skin.bg));
  boxEl.style.setProperty('--c2', skin.accent);
  boxEl.style.setProperty('--on', skin.on);
  boxEl.classList.add('clubbed');
}

function undressReel(boxEl){
  if (!boxEl) return;
  for (var i = 0; i < CLUB_VARS.length; i++) boxEl.style.removeProperty(CLUB_VARS[i]);
  boxEl.classList.remove('clubbed');
}

/* THE PAGE, NOT JUST THE WHEEL. The cap panel, the money bar and the floor take
   the club as well, off four properties on body.
   CLEARED ON THE WAY OUT, always. A run that ends in Denver navy and then
   restarts must not draft its first Boston player on a navy floor, and the
   home screen has no club at all. */
var PAGE_VARS = ['--club1', '--club1rgb', '--club2', '--clubon'];

function dressPage(code){
  var skin = E.clubSkin(code), b = document.body;
  b.style.setProperty('--club1', skin.bg);
  b.style.setProperty('--club1rgb', rgbChannels(skin.bg));
  b.style.setProperty('--club2', skin.accent);
  b.style.setProperty('--clubon', skin.on);
  b.classList.add('clubbed');
}

function undressPage(){
  var b = document.body;
  for (var i = 0; i < PAGE_VARS.length; i++) b.style.removeProperty(PAGE_VARS[i]);
  b.classList.remove('clubbed');
}

/* "122,10,39", for the rgba() the vignette is built from. A custom property
   holding "#7a0a27" cannot be handed to rgba(), so the channels travel
   separately from the hex. */
function rgbChannels(hex){
  return [1, 3, 5].map(function(i){ return parseInt(hex.substr(i, 2), 16); }).join(',');
}

function reelFill(stripEl, items, landIndex){
  stripEl.textContent = '';
  for (var i = 0; i < items.length; i++) {
    var d = document.createElement('div');
    d.className = 'reel-i' + (i === landIndex ? ' land' : '');
    /* Inside a span so a long club name can be clipped rather than widening the
       reel, which widened the column, which pushed the board off the screen. */
    var inner = document.createElement('span');
    inner.textContent = items[i];
    d.appendChild(inner);
    stripEl.appendChild(d);
  }
}

/* A strip long enough to look like motion, ending on the answer. The window
   sits at the middle of the box, so the landing offset backs the chosen row up
   to it rather than to the top. */
function spinReel(boxEl, stripEl, pool, answer, done, ms){
  var dur = ms || SPIN_MS;
  var items = [], n = 14;
  for (var i = 0; i < n; i++) {
    items.push(pool.length ? pool[Math.floor(Math.random() * pool.length)] : answer);
  }
  items.push(answer);
  var land = items.length - 1;
  reelFill(stripEl, items, land);

  var mid = (boxEl.clientHeight - ROW_H) / 2;
  stripEl.style.transition = 'none';
  stripEl.style.transform = 'translateY(' + mid + 'px)';
  boxEl.classList.remove('waiting', 'done', 'hit');
  /* Out of the LAST club's colors before this spin starts, or a re-spin runs
     the whole way in the colors of the team you just rejected. */
  undressReel(boxEl);
  boxEl.classList.add('spin');

  /* Two frames, not one: the first commits the reset transform, the second
     starts the move. Setting both in one frame makes the browser collapse them
     and the reel jumps to the answer with no travel. */
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      stripEl.style.transition = 'transform ' + dur + 'ms cubic-bezier(.15,.85,.25,1)';
      stripEl.style.transform = 'translateY(' + (mid - land * ROW_H) + 'px)';
    });
  });

  var settle = function(){
    stripEl.removeEventListener('transitionend', settle);
    boxEl.classList.remove('spin');
    boxEl.classList.add('done', 'hit');
    setTimeout(function(){ boxEl.classList.remove('hit'); }, 520);
    if (done) done();
  };
  stripEl.addEventListener('transitionend', settle);
  /* A belt and braces timer, because a transitionend that never fires (a
     background tab, a reduced-motion setting that zeroes the duration) would
     otherwise leave the draft permanently mid-spin and unclickable. */
  setTimeout(function(){ if (boxEl.classList.contains('spin')) settle(); }, dur + 220);
}

function reelPools(){
  var seasons = {}, clubs = {};
  for (var i = 0; i < DATA.teamSeasons.length; i++) {
    var t = DATA.teamSeasons[i];
    seasons[t.season] = 1;
    clubs[E.teamName(t.team)] = 1;
  }
  return { seasons: Object.keys(seasons), clubs: Object.keys(clubs) };
}
