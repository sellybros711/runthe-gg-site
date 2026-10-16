// ── the front page, playing itself ─────────────────────────────────────────

/* THE LANDING ANIMATION.
 *
 * It drives the game's own spinReel(), dressReel() and paintCourt(), so there
 * is no second implementation of the spin or the floor to keep in step with the
 * first. Three signings, then it holds the roster it built and starts over.
 *
 * THE ROSTER IT BUILDS HAS TO BE ONE THE GAME WOULD ALLOW. The football game's
 * front page shipped with three hardcoded names adding up to $144M against a
 * $140M cap: a roster the game itself would have refused, advertised on the
 * page you arrive at. So these are drawn from the real data, under the real
 * position rules, and the running total is checked against the real cap.
 */
/* THE BEAT AFTER A SIGNING IS NOT DECORATION. Without it the next season reel
   starts tumbling in the same frame the player lands on the floor, so the draw
   and the man it produced are never on screen together, and the sequence stops
   explaining itself: it becomes two animations that happen near each other. */
var HERO = { season: 620, stagger: 240, club: 760, sign: 560, beat: 900,
             hold: 2200, gap: 260 };

/* WHICH PLAYERS SIGN ON THE FRONT PAGE. Drawn fresh every loop, so somebody who
   watches it twice sees two different teams being built rather than the same
   three names forever.
   TOP N RATHER THAN THE WHOLE POOL, because this is a shop window. A random
   draw from 16,057 player-seasons mostly surfaces people nobody recognizes,
   which makes the game look like it is about obscure players when it is about
   the famous ones.
   NINETY AND NOT FORTY, measured. Forty gave a two-man roster in four draws out
   of five even after each pick was held to a fair share of the cap: the top of
   the league by win shares is expensive by construction, so a tight pool has
   nothing left to fill a third spot with. Ninety fills three in 400 draws out
   of 400 and is still 90 seasons out of 16,057. */
var HERO_TOP_N = 90;
var heroPoolCache = null;

function heroPool(){
  if (heroPoolCache) return heroPoolCache;
  var by = {};
  for (var i = 0; i < DATA.players.length; i++) {
    var p = DATA.players[i];
    var slots = E.SLOTS.filter(function(s){ return E.canFillSlot(p, s); });
    for (var j = 0; j < slots.length; j++) (by[slots[j]] = by[slots[j]] || []).push(p);
  }
  for (var k in by) {
    by[k].sort(function(a, b){ return b.w - a.w; });
    by[k] = by[k].slice(0, HERO_TOP_N);
  }
  heroPoolCache = by;
  return heroPoolCache;
}

/* Three signings on three different spots, each filled by somebody who can
   actually play there, nobody signed twice, and the three of them inside the
   cap the real game would hold them to. */
function heroPicks(){
  var pool = heroPool();
  var slots = E.SLOTS.slice();
  for (var i = slots.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = slots[i]; slots[i] = slots[j]; slots[j] = t;
  }
  var out = [], used = {}, spent = 0;
  var cap = E.CONSTANTS.CAP_MUSD;
  /* Room left for the three spots this will NOT fill, at the game's own
     minimum, so the three shown could genuinely be the first three of a legal
     six rather than a roster that has already broken the cap. */
  var reserve = 3 * (E.CONSTANTS.MIN_RESERVE_PER_SLOT_MUSD || 2);

  /* AFFORDABLE FIRST, THEN RANDOM AMONG THOSE. The first version drew at random
     and skipped the pick when the man it drew did not fit, which meant the
     front page regularly showed TWO signings instead of three: the pool is the
     top of the league by win shares, so it is expensive by construction, and
     two big contracts leave nothing a third elite player fits into. Filtering
     to what the remaining budget can actually take means a third man is found
     whenever one exists, and he is still a random one. */
  for (var s = 0; s < slots.length && out.length < 3; s++) {
    var cand = pool[slots[s]];
    if (!cand || !cand.length) continue;
    /* A FAIR SHARE OF WHAT IS LEFT, not all of it.
       Filtering on the whole remaining budget was not enough on its own: this
       pool is the top of the league by win shares and is therefore expensive by
       construction, so the first two picks ate the cap and the front page showed
       TWO men in four draws out of five. Each pick may take its share of the
       money the picks still to come have to split, plus a third again so the
       roster is not three identically priced players. */
    var left = 3 - out.length;
    var room = Math.min(cap - reserve - spent, (cap - reserve - spent) / left * 1.35);
    var afford = [];
    for (var c = 0; c < cand.length; c++) {
      if (!used[cand[c].i] && cand[c].p <= room) afford.push(cand[c]);
    }
    if (!afford.length) continue;
    var p = afford[Math.floor(Math.random() * afford.length)];
    used[p.i] = 1; spent += p.p;
    out.push({ slot: slots[s], p: p });
  }
  return out;
}

var heroRun = 0;            // bumped to cancel whatever loop is in flight
var heroFilled = {};

function heroPaint(){ paintCourt($('h-court'), heroFilled); }

function heroReset(){
  heroFilled = {};
  heroPaint();
  ['h-box-s', 'h-box-c'].forEach(function(id){
    var box = $(id);
    undressReel(box);
    box.className = 'reelbox ' + (id === 'h-box-s' ? 'season' : 'club') + ' waiting';
  });
  $('h-reel-s').textContent = '';
  $('h-reel-c').textContent = '';
}

var heroNap = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
var heroSpin = function(boxId, stripId, pool, answer, ms){
  return new Promise(function(res){ spinReel($(boxId), $(stripId), pool, answer, res, ms); });
};

/* NO ANIMATION AT ALL for anyone who has asked their device for less of it.
   They get the end of the sequence, held still, which carries exactly the same
   information: three men on a floor and the club the last one came from. */
function heroStatic(){
  var picks = heroPicks();
  if (!picks.length) return;
  heroFilled = {};
  for (var i = 0; i < picks.length; i++) heroFilled[picks[i].slot] = picks[i].p;
  heroPaint();
  var last = picks[picks.length - 1].p;
  reelFill($('h-reel-s'), [String(last.s)], 0);
  reelFill($('h-reel-c'), [E.teamName(last.t)], 0);
  var mid = ($('h-box-s').clientHeight - ROW_H) / 2;
  ['h-box-s', 'h-box-c'].forEach(function(id, n){
    var box = $(id), strip = $(n ? 'h-reel-c' : 'h-reel-s');
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(' + mid + 'px)';
    box.className = 'reelbox ' + (n ? 'club' : 'season') + ' done';
    dressReel(box, last.t);
  });
}

function heroLoop(seq){
  var live = function(){ return seq === heroRun; };
  var picks = heroPicks();
  var step = function(i){
    if (!live()) return Promise.resolve();
    if (i >= picks.length) {
      return heroNap(HERO.hold).then(function(){
        if (!live()) return;
        heroReset();
        return heroNap(HERO.gap).then(function(){ if (live()) heroLoop(seq); });
      });
    }
    var pk = picks[i];
    var pools = reelPools();
    /* THE TWO REELS OVERLAP HERE AND NOT IN THE DRAFT. The draft spins the
       season, waits, and only then spins the club, because the answer to the
       second question depends on the first. That is right there and wrong
       here: it left half the picture blank and dim for a third of every beat,
       which reads as a broken render rather than a pending one. The club reel
       is already tumbling while the season settles and still lands after it,
       so the ORDER the answers arrive in, which is the part that carries the
       meaning, is unchanged. */
    var spinS = heroSpin('h-box-s', 'h-reel-s', pools.seasons, String(pk.p.s), HERO.season);
    return heroNap(HERO.stagger).then(function(){
      if (!live()) return;
      var spinC = heroSpin('h-box-c', 'h-reel-c', pools.clubs, E.teamName(pk.p.t), HERO.club);
      return Promise.all([spinS, spinC]);
    }).then(function(){
      if (!live()) return;
      dressReel($('h-box-s'), pk.p.t);
      dressReel($('h-box-c'), pk.p.t);
      return heroNap(HERO.sign);
    }).then(function(){
      if (!live()) return;
      heroFilled[pk.slot] = pk.p;
      heroPaint();
      return heroNap(HERO.beat);
    }).then(function(){
      if (!live()) return;
      return step(i + 1);
    });
  };
  return step(0);
}

function heroStart(){
  if (!DATA || !$('h-court')) return;
  heroRun++;
  heroReset();
  if (reduceMotion()) { heroStatic(); return; }
  heroLoop(heroRun);
}

/* STOPPED THE MOMENT THE HOME SCREEN IS NOT ON SCREEN. A loop left running
   behind the draft is spinning reels nobody can see, on a phone, forever. */
function heroStop(){ heroRun++; }
