/* ══ THE PLAYOFF BRACKET ══════════════════════════════════════════════════════
 *
 * Sixteen seats in the NBA's shape: eight seeds a conference, a FIXED tree
 * (1/8 meets 4/5, 2/7 meets 3/6, no reseeding, which is the real rule and is
 * simpler than the football game's), three rounds to a conference final and
 * then the Finals across the middle. Walked forward a round at a time, the
 * other games flipping to their winners one after another and the player's
 * held back, which is `s-nbrk`'s shape in The Perfect Season.
 *
 * IT DECIDES NOTHING. The opponent each round is a net rating drawn by
 * `poBeginRound`, and the whole postseason model is fitted against the title
 * rate of every team-season in the data. A bracket that picked the opponent
 * instead would quietly rebuild the difficulty curve. What is drawn here is
 * the field AROUND that path, and the fourteen games the player is not in are
 * simulated for the reveal alone.
 *
 * ── EVERY SEAT IS A CLUB AND A SEED, AND NEVER A SEASON ─────────────────────
 *
 * Asked for by the owner: the bracket says who you are playing, a team and a
 * seed, the way an NBA bracket reads. It used to name nobody and print a
 * record on every seat, on the argument that "the 1996 Bulls" over a number
 * the model rolled tells somebody they beat a team that was never in the
 * room. That argument is about a SEASON, and it still holds: no seat carries
 * a year, so no seat is a claim about anybody who ever played. A seat is a
 * club of today's league in its own conference, the way a bracket for a
 * season nobody has played yet would read.
 *
 * WHICH CLUB IS DRAWN OFF THE RUN'S SEED, on a stream of its own, so a reload
 * or a replay shows the same field and no draw that decides anything moves.
 * A One Franchise run sits in its own club's conference and never meets
 * itself.
 *
 * ── THE RECORD IS GONE FROM THE SEAT AND THE STRENGTH STAYS IN THE NOTE ─────
 *
 * The seed is the FIELD's shape. The strength the engine actually drew is
 * what you are playing against, and the draw is deliberately wide (see
 * TITLE.SERIES_SD), so the two disagree and should. The seat carries the club
 * and the seed, and the note under the bracket carries the form: "Next up:
 * the Nuggets, the 3 seed. They play like a 58 win team."
 */
var BRK_CONFS = ['East', 'West'];

/* THE TWO CONFERENCES AS THEY ARE TODAY. Fifteen clubs a side, so a
   conference fills its seven other seats and the play-in with room to spare
   even when a One Franchise run takes its own club out of it. */
var BRK_CLUBS = {
  East: ['ATL', 'BOS', 'BRK', 'CHI', 'CHO', 'CLE', 'DET', 'IND', 'MIA', 'MIL',
    'NYK', 'ORL', 'PHI', 'TOR', 'WAS'],
  West: ['DAL', 'DEN', 'GSW', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NOP', 'OKC',
    'PHO', 'POR', 'SAC', 'SAS', 'UTA'],
};

/* The name a seat prints. Two nicknames are cut to what a broadcast graphic
   calls them, because a seat is about eighty pixels of text on a phone and
   "Timberwolves" does not fit it. */
var BRK_NICK = { MIN: 'Wolves', POR: 'Blazers' };
function brkClubName(e){
  if (!e || !e.code) return '';
  return BRK_NICK[e.code] || E.teamName(e.code);
}

function brkConfOf(code){
  for (var c in BRK_CLUBS) if (BRK_CLUBS[c].indexOf(code) >= 0) return c;
  return null;
}

/* A FISHER-YATES SHUFFLE ON THE CLUB STREAM, never on the field's. */
function brkShuffle(list, rng){
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1)), t = a[i];
    a[i] = a[j]; a[j] = t;
  }
  return a;
}
/* The tree, in the order the boxes are drawn down a column, so a reader can
   follow a line rather than hunt for it: the top half of the conference is
   1/8 with 4/5 and the bottom half is 3/6 with 2/7. Seed numbers, not
   indexes, because that is what the screen prints. */
var BRK_TREE = [[1, 8], [4, 5], [3, 6], [2, 7]];

/* How far above the top six line a record has to be for each seed. Written as
   offsets rather than as win totals, so tuning TOP_SIX_WINS moves the whole
   ladder with it instead of leaving six numbers behind that describe the old
   game. Only used for the far conference, which has no player to anchor on. */
var BRK_OVER = [12, 8, 5, 3, 1, 0];

function brkWins(){
  var w = 0;
  for (var i = 0; i < (run.season || []).length; i++) if (run.season[i].won) w++;
  return w;
}

/* THE PLAYER'S SEED, off the record, the way the real thing is seeded. A run
   that came through the play-in is the 7 seed whatever it won, because that
   is what the play-in is: the engine's own `seedFromRecord` splits at exactly
   the same line, so this cannot disagree with which rounds the run plays. */
function brkSeedOf(wins){
  var base = E.CONSTANTS.TOP_SIX_WINS;
  for (var s = 0; s < BRK_OVER.length; s++) if (wins >= base + BRK_OVER[s]) return s + 1;
  return BRK_OVER.length;
}

/* A CONFERENCE BUILT AROUND ONE FIXED RECORD. The player's own seat carries
   their real win total and everybody else is spread away from it, upward for
   the better seeds and downward for the worse, so the column can never print
   a 7 seed above an 8 seed with more wins. Built this way rather than from
   per-seed bands because the player's record is the one number here that is
   not ours to choose: a 43 win play-in run sits below a band that starts at
   45, and a field drawn independently of it reads as a mistake on the one row
   the reader is looking at. */
function brkColumnWins(anchorSeed, anchorWins, rng){
  var out = new Array(8), cur = anchorWins;
  out[anchorSeed - 1] = anchorWins;
  for (var s = anchorSeed - 1; s >= 1; s--) {
    cur = Math.max(cur + 1 + Math.floor(rng() * 3), brkLadder(s) - 2);
    out[s - 1] = Math.min(E.CONSTANTS.REGULAR_SEASON_GAMES, cur);
  }
  cur = anchorWins;
  for (var t = anchorSeed + 1; t <= 8; t++) {
    cur = Math.min(cur - 1 - Math.floor(rng() * 3), brkLadder(t) + 2);
    out[t - 1] = Math.max(20, cur);
  }
  return out;
}

/* WHERE A SEED USUALLY LANDS, and the walk above is held near it. Stepping one
   to three wins a seed from a single anchor is monotone and is also far too
   narrow: a real conference runs about twenty wins from its 1 seed to its 8,
   and the walk ran fourteen. From a 67 win top seed it drew a 56 win 8 seed,
   so every club in the far conference was better than every club in the
   player's own, which a fan reads in one glance. The six seeds with a place
   come off BRK_OVER, the two play-in seats sit between the play-in line and
   the top six line, and the walk may not wander more than two wins from any
   of it. The player's own record is still never moved. */
function brkLadder(seed){
  var C = E.CONSTANTS;
  if (seed <= BRK_OVER.length) return C.TOP_SIX_WINS + BRK_OVER[seed - 1] + 1;
  return seed === BRK_OVER.length + 1 ? C.TOP_SIX_WINS - 3 : C.PLAY_IN_WINS + 2;
}

/* How often the better seed takes the series, and how long it goes. Nothing
   downstream reads either: this is the reveal and only the reveal. */
function brkOdds(hi, lo){
  return Math.max(0.5, Math.min(0.93, 0.5 + 0.055 * (lo - hi)));
}
function brkResolve(hi, lo, rng){
  var p = brkOdds(hi.seed, lo.seed);
  var better = rng() < p;
  var edge = (p - 0.5) * 2;
  var r = rng();
  /* A lopsided pairing sweeps more often. Four to three is the tail. */
  var lost = r < 0.16 + 0.30 * edge ? 0 : r < 0.46 + 0.26 * edge ? 1 : r < 0.80 ? 2 : 3;
  return { win: better ? hi : lo, lose: better ? lo : hi, w: 4, l: lost };
}

var brk = null;

function brkBuild(){
  var rounds = (run.playoffSeed && run.playoffSeed.rounds) || 0;
  if (brk && brk.forSeed === run.seed && brk.rounds === rounds) return brk;
  var rng = E.createSeededRNG(E.hashSeed(String(run.seed) + '|nbabracket'));
  var wins = brkWins();
  /* A PLAY-IN RUN IS THE 7 SEED, and the two halves of that sentence come
     from one place: `seedFromRecord` is what decided there would be a
     play-in round at all, so reading `bye` here rather than the win total
     again means the seed and the schedule cannot come apart. */
  var mySeed = run.playoffSeed && run.playoffSeed.bye ? brkSeedOf(wins) : 7;
  var nearIdx = Math.floor(rng() * 2);
  /* A ONE FRANCHISE RUN PLAYS IN ITS OWN CLUB'S CONFERENCE. The draw above is
     still made, so the field's stream is the one it always was. */
  var own = run.club && brkConfOf(run.club) ? run.club : null;
  if (own) nearIdx = BRK_CONFS.indexOf(brkConfOf(own));

  var nearWins = brkColumnWins(mySeed, wins, rng);
  /* The far conference has no player, so it is anchored on its own top seed
     rather than on anybody: the same ladder the seeds are named off, plus a
     little room. */
  var farTop = brkLadder(1) - 1 + Math.floor(rng() * 5);
  var farWins = brkColumnWins(1, farTop, rng);

  /* THE CLUBS COME OFF A STREAM OF THEIR OWN, so naming the field moves no
     number in it. */
  var crng = E.createSeededRNG(E.hashSeed(String(run.seed) + '|nbaclubs'));
  var nearClubs = brkShuffle(BRK_CLUBS[BRK_CONFS[nearIdx]].filter(function(c){ return c !== own; }), crng);
  var farClubs = brkShuffle(BRK_CLUBS[BRK_CONFS[1 - nearIdx]], crng);

  var seat = function(s, w, you, code){ return { seed: s, wins: w, you: !!you, code: you ? null : code }; };
  var near = [], far = [], k = 0;
  for (var s = 1; s <= 8; s++) {
    var mine = s === mySeed;
    near.push(seat(s, nearWins[s - 1], mine, mine ? null : nearClubs[k++]));
    far.push(seat(s, farWins[s - 1], false, farClubs[s - 1]));
  }

  brk = {
    forSeed: run.seed, rounds: rounds,
    near: near, far: far, mySeed: mySeed,
    myConf: BRK_CONFS[nearIdx], farConf: BRK_CONFS[1 - nearIdx],
    /* Which column is the first round. A play-in run has the play-in in
       front of it, so every stage below is offset by one. */
    off: rounds === E.CONSTANTS.PLAYOFF_ROUNDS_PLAY_IN ? 1 : 0,
    names: E.playoffRoundNames(rounds),
    /* The other side of the play-in: a club from the same conference that is
       on no other seat, and no seed, because the winner is the 7. */
    playIn: { seed: null, wins: Math.max(20, wins - 1 - Math.floor(rng() * 3)), you: false,
      code: nearClubs[k] },
    cache: {}, revealed: {}, rng: rng,
  };
  return brk;
}

/* WHO ACTUALLY TOOK THE SEAT THE PLAY-IN FEEDS, which is one seat and is the
   only place the first round is not just a seeding.
 *
 * Three answers and all three are needed. Undecided, and nobody is in it: the
 * first round drew the player into a seat while the game deciding whether
 * they are in it was still on the screen above. Won, and it is theirs. LOST,
 * and it belongs to whoever beat them, which is what the real bracket does
 * and is what lets the field finish: without it a play-in loss left every
 * round after it permanently TBD, so the postseason the player had just been
 * knocked out of never happened at all.
 *
 * It lives in the field rather than at draw time because everything above
 * stage zero is fed from here: a substitution made in the painter would seat
 * the right club in the first round and carry the wrong one into the semis. */
function brkEntrant(e){
  var B = brkBuild();
  if (!e || !e.you || !B.off) return e;
  var pi = brkMine(-1);
  if (!pi || !pi.over) return null;
  if (pi.won) return e;
  return { seed: e.seed, wins: B.playIn.wins, you: false, code: B.playIn.code };
}

/* Who is in a game, and who won it. Resolved once and cached, because a
   reveal draws the whole field on every frame of it and a second roll would
   redraw a different bracket each time. */
function brkGame(stage, side, idx){
  var B = brkBuild();
  var key = stage + ':' + side + ':' + idx;
  if (B.cache[key]) return B.cache[key];

  var mine = false, a = null, b = null;
  if (stage === 3) {
    a = brkGame(2, 'near', 0).won;
    b = brkGame(2, 'far', 0).won;
    mine = !!(a && a.you);
  } else if (stage === 0) {
    var col = side === 'near' ? B.near : B.far;
    a = brkEntrant(col[BRK_TREE[idx][0] - 1]);
    b = brkEntrant(col[BRK_TREE[idx][1] - 1]);
    mine = !!((a && a.you) || (b && b.you));
  } else {
    a = brkGame(stage - 1, side, idx * 2).won;
    b = brkGame(stage - 1, side, idx * 2 + 1).won;
    mine = !!((a && a.you) || (b && b.you));
  }

  var g = { key: key, stage: stage, side: side, idx: idx, mine: mine,
    pair: [a, b], won: null, lost: null, w: 0, l: 0 };

  if (mine) {
    /* THE PLAYER'S OWN GAME IS THE RUN'S, never a roll, AND IT IS NEVER
       CACHED. A series score moves while the screen is up, so an answer
       stored the first time the field was drawn would freeze the one box
       the reader is watching at 0-0. */
    var m = brkMine(stage);
    if (m && m.over) {
      var me = (a && a.you) ? a : b, them = (a && a.you) ? b : a;
      g.won = m.won ? me : them;
      g.lost = m.won ? them : me;
      g.w = Math.max(m.w, m.l);
      g.l = Math.min(m.w, m.l);
    }
    return g;
  }
  /* Both feeders have to have produced somebody. A game whose pair is not
     known yet is drawn as two empty seats and asked again later, and it must
     NOT be cached in that state or the empty answer outlives the reason. */
  if (!a || !b) return g;
  /* EACH GAME ROLLS ON A STREAM OF ITS OWN, keyed on its place in the tree.
     Off one shared stream the result depended on the ORDER the games were
     first asked for, so a bracket rebuilt after a reload, which asks a
     column at a time, could crown a different club from the one that was on
     the screen before it. */
  var grng = E.createSeededRNG(E.hashSeed(String(run.seed) + '|brkgame|' + key));
  var r = brkResolve(a.seed <= b.seed ? a : b, a.seed <= b.seed ? b : a, grng);
  g.won = r.win; g.lost = r.lose; g.w = r.w; g.l = r.l;
  B.cache[key] = g;
  return g;
}

/* The run's own row for a stage, if it has one yet. `cur` is the series being
   played and `results` is every round already finished, so between them they
   answer both halves: how it stands, and how it ended. */
function brkMine(stage){
  if (!run.po) return null;
  var B = brkBuild(), at = stage + B.off;
  var done = run.po.results[at];
  if (done) return { over: true, won: done.won, w: done.yourWins, l: done.oppWins,
    oppNet: done.oppNet };
  var cur = run.po.cur;
  if (cur && cur.roundIndex === at) return { over: false, won: false,
    w: cur.yourWins, l: cur.oppWins, oppNet: cur.oppNet };
  return null;
}

/* Every box in one column, in the order they are drawn.

   THE PLAY-IN IS ONE BOX, because the engine's play-in is one game. The real
   thing is four games over two nights and modelling that here would be a
   picture of a tournament the run never plays. Its opponent carries a club
   and NO SEED, which is the honest label: the winner is the 7 seed, so
   neither side is one yet, and a chip reading 8 beside a first round column
   that also has an 8 would be two different clubs wearing one number. */
function brkColumn(col){
  var B = brkBuild();
  if (B.off && col === 0) {
    return [{ key: 'pi', stage: -1, side: 'near', idx: 0, mine: true,
      pair: [B.near[B.mySeed - 1], B.playIn], won: null, lost: null, w: 0, l: 0 }];
  }
  var stage = col - B.off, out = [];
  if (stage === 3) { out.push(brkGame(3, 'near', 0)); return out; }
  var per = [4, 2, 1][stage];
  for (var i = 0; i < per; i++) out.push(brkGame(stage, 'near', i));
  for (var j = 0; j < per; j++) out.push(brkGame(stage, 'far', j));
  return out;
}

/* ── DRAWING IT ────────────────────────────────────────────────────────────
 *
 * The whole field, every round, from what has been revealed so far. Redrawn
 * in full on every step, which is what the football bracket does and is fine
 * here for the same reason: it is sixteen seats of text.
 *
 * SO THE ANIMATION CANNOT LIVE ON THE SEATS. A keyframe on `.brk-t.won` would
 * replay for every seat already settled on every step of the reveal, because
 * innerHTML builds a new node each time and a new node starts its animations
 * over. Exactly one key is marked `just` at a time, and only `.just` carries
 * the flip, so the game that has this moment is the only thing moving.
 */
/* A club's seed chip wears the club's colors, off the same skin the reels use,
   so the digit is measured to read on its own fill. */
function brkChip(e){
  if (!e || e.you || !e.code || !E.clubSkin) return '';
  var k = E.clubSkin(e.code);
  return ' style="--cb:' + k.bg + ';--co:' + k.on + ';--ca:' + k.accent + '"';
}
function brkSeat(e, state, score){
  if (!e) return '<div class="brk-t tbd"><span class="sd"></span>'
    + '<span class="nm">TBD</span><span class="sc"></span></div>';
  var cls = state ? ' ' + state : '';
  return '<div class="brk-t' + (e.you ? ' me' : '') + (e.code ? ' club' : '') + cls + '"'
    + (e.code ? ' data-club="' + esc(e.code) + '"' : '') + '>'
    + '<span class="sd"' + brkChip(e) + '>' + (e.seed == null ? '' : e.seed) + '</span>'
    + '<span class="nm">' + esc(e.you ? YOUR_LOT : brkClubName(e)) + '</span>'
    + '<span class="sc">' + (score == null ? '' : score) + '</span></div>';
}

/* One box. Four states a seat can be in and they are not the same question:
   nothing has happened, this pair is playing now, this one went through, this
   one is out. */
function brkBox(g, live, just, known){
  var B = brkBuild();
  if (!known) return '<div class="brk-g">' + brkSeat(null) + brkSeat(null) + '</div>';
  var a = g.pair[0], b = g.pair[1];
  var sa = null, sb = null, wa = null, wb = null;
  if (g.mine) {
    var m = brkMine(g.stage);
    if (m) {
      var me = a && a.you ? a : b, them = a && a.you ? b : a;
      /* NOTHING TO SHOW AT NIL APIECE. A series that has not tipped off
         printed a 0 on both seats, which is two numbers saying the same
         nothing on the one box the reader is watching. A 0 beside a 4 is a
         sweep and stays. */
      if (m.w || m.l) {
        if (me === a) { wa = m.w; wb = m.l; } else { wa = m.l; wb = m.w; }
      }
      if (m.over) {
        sa = (me === a) === m.won ? 'won' : 'out';
        sb = sa === 'won' ? 'out' : 'won';
      }
    }
  } else if (B.revealed[g.key] && g.won) {
    sa = a === g.won ? 'won' : 'out';
    sb = a === g.won ? 'out' : 'won';
    wa = a === g.won ? g.w : g.l;
    wb = a === g.won ? g.l : g.w;
  }
  /* Only once the box is settled on screen, or the tag would announce a
     result the seats have not shown yet. */
  var up = !!(sa && brkUpset(g));
  return '<div class="brk-g' + (live ? ' live' : '') + (just ? ' just' : '')
    + (up ? ' upset' : '') + '">'
    + (up ? '<span class="brk-up">Upset</span>' : '')
    + brkSeat(a, sa, wa) + brkSeat(b, sb, wb) + '</div>';
}

/* AN UPSET IS THREE SEEDS OR MORE. A 5 over a 4 is a coin flip that went one
   way, and tagging it would put the word on half the first round, where it
   stops meaning anything. A 6 over a 3 is the story of the round. Read off
   the seeds the seats print, so the tag can never disagree with the box. */
function brkUpset(g){
  if (!g || !g.won || !g.lost) return false;
  var w = g.won.seed, l = g.lost.seed;
  return w != null && l != null && w - l >= 3;
}

/* HAS THE ROUND THAT FEEDS THIS COLUMN FINISHED. Every decoration game in
   the field is decided the first time its pairing is asked for, and the
   first round's pairings are known from the tip, so without this the whole
   bracket resolves on the first screen: the conference final column named
   the 5 seed while the first round was still being revealed, which tells a
   reader who wins their own semifinal before their first round is over.
   The seats know their teams either way. This only governs whether they are
   DRAWN, and TBD is what an unfed seat says.

   THE FIRST ROUND IS ALWAYS KNOWN, and gating it behind the play-in was the
   first version of this. Its pairings are SEEDS, so they exist before a ball
   is thrown, and a play-in run came to a bracket of sixteen TBDs with one
   game in front of it. The play-in feeds exactly one SEAT, which brkEntrant
   answers, rather than seven games whose pairings are known. */
function brkKnown(){
  var B = brkBuild(), out = [];
  for (var c = 0; c <= B.off; c++) out[c] = true;
  for (var c = B.off + 1; c < B.names.length; c++) {
    var prev = brkColumn(c - 1), all = out[c - 1];
    for (var i = 0; all && i < prev.length; i++) {
      var g = prev[i];
      if (g.mine) { var m = brkMine(g.stage); all = !!(m && m.over); }
      else all = !!B.revealed[g.key];
    }
    out[c] = all;
  }
  return out;
}

function brkRender(){
  var B = brkBuild(), rail = $('brk-rail');
  if (!rail) return;
  var known = brkKnown();
  var h = '';
  for (var c = 0; c < B.names.length; c++) {
    h += '<div class="brk-col' + (c === brkCol ? ' now' : '')
      + (B.off && c === 0 ? ' pin' : '') + '">'
      + '<div class="brk-h">' + esc(BRK_SHORT[B.names[c]] || B.names[c]) + '</div>';
    var games = brkColumn(c);
    var side = null;
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (g.stage != null && g.stage < 3 && g.side !== side) {
        side = g.side;
        h += '<div class="brk-conf">'
          + esc(side === 'near' ? B.myConf : B.farConf) + '</div>';
      }
      h += brkBox(g, g.mine && c === brkCol, B.justKey === g.key, known[c]);
    }
    h += '</div>';
  }
  rail.innerHTML = h;
  /* AFTER THE SCREEN IS SHOWN, NEVER BEFORE IT. brkRender runs ahead of
     show('s-brk') on the way into the postseason, so at this instant the rail
     has no layout box and every rectangle is zero. That is showFact's own
     lesson about a scrollTop written to a hidden element, arriving at a
     measurement instead of a write. One frame later the screen is up. */
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(brkAlignPlayIn);
  else brkAlignPlayIn();
}

/* THE PLAY-IN SITS OPPOSITE THE SEAT IT FILLS.
 *
 * One game, one named seat, and centred in a column as tall as the first
 * round it floated clear of the pairing it belongs to: measured at 390x844,
 * the box sat at 306 against a target at 259, with the TBD it is about on the
 * line above it. Every other column holds a whole round, where centring the
 * group is right, so this is the one that needs an anchor.
 *
 * WHICH SEAT IS DERIVED FROM BRK_TREE, never written as an index. The play-in
 * winner is the 7 seed and 7 is in the last pairing today, and writing 3 here
 * would be a second copy of a table that already exists one screen up.
 */
function brkAlignPlayIn(){
  var rail = $('brk-rail');
  if (!rail) return;
  var B = brkBuild();
  var col0 = rail.children[0], col1 = rail.children[1];
  if (!B.off || !col0 || !col1) return;
  var anchor = col0.children[1], box = col0.querySelector('.brk-g');
  if (!anchor || !box) return;

  var idx = -1;
  for (var i = 0; i < BRK_TREE.length; i++)
    if (BRK_TREE[i][0] === B.mySeed || BRK_TREE[i][1] === B.mySeed) { idx = i; break; }
  /* The near side is emitted first, so the nth box of column one is the nth
     near pairing. A seed the tree does not hold leaves the column centred,
     which is what it did before any of this. */
  var target = idx < 0 ? null : col1.querySelectorAll('.brk-g')[idx];
  if (!target) return;

  anchor.style.marginTop = '0px';
  var a = box.getBoundingClientRect(), t = target.getBoundingClientRect();
  /* NOTHING IS WRITTEN OFF A HIDDEN RAIL. A stale frame landing after the
     screen has changed measures zero on both, and a zero delta written as a
     margin would silently un-centre the column on the way back. */
  if (!a.height || !t.height) { anchor.style.marginTop = ''; return; }
  var delta = Math.round(t.top - a.top);
  anchor.style.marginTop = (delta > 0 ? delta : 0) + 'px';
}

/* THE ROUND BEING PLAYED, IN VIEW. Five columns do not fit on a phone, so by
   the Finals the one game that matters started off the right hand edge and
   the player had to go looking for it. Same fix as the football rail. */
function brkFocus(col){
  var rail = $('brk-rail');
  if (!rail) return;
  var el = rail.children[col];
  if (!el) return;
  try { rail.scrollTo({ left: Math.max(0, el.offsetLeft - 10), behavior: 'smooth' }); }
  catch (e) { rail.scrollLeft = Math.max(0, el.offsetLeft - 10); }
}

var BRK_SHORT = {
  'Play-In': 'Play-In', 'First Round': 'First Round',
  'Conference Semifinals': 'Semifinals', 'Conference Finals': 'Conf Finals',
  'NBA Finals': 'Finals',
};

function brkNote(s){ var el = $('brk-note'); if (el) el.textContent = s || ''; }

/* ── THE SERIES CARD ───────────────────────────────────────────────────────
 *
 * EVERYTHING ON IT IS READ, NOTHING IS DECIDED. The games are the run's own
 * rows, the odds are the engine's arithmetic on the round's own means, the
 * top scorer is the box score gameDetail would open, and the opponent's seed
 * and record are the bracket's seat. Painting it can never move a result,
 * which is the one rule this screen has always had.
 */
var srsLast = null, srsTop = {};

/* The series on screen: the one being played in this column, or the one that
   finished in it, or on the finale the last one the run played at all. */
function srsSource(){
  if (!run || !run.po) return null;
  var po = run.po, cur = po.cur;
  if (cur && cur.roundIndex === brkCol) return { live: true, s: cur, round: cur.roundIndex };
  if (po.results[brkCol]) return { live: false, s: po.results[brkCol], round: brkCol };
  var last = po.results.length - 1;
  if (last >= 0 && brkCol > last) return { live: false, s: po.results[last], round: last };
  return null;
}

/* Who is across from you in a column, off the same seat the rail draws. */
function brkThem(col){
  var g = brkColumn(col).filter(function(x){ return x.mine; })[0];
  if (!g || !g.pair) return null;
  return g.pair[0] && g.pair[0].you ? g.pair[1] : g.pair[0];
}

/* THE SAME CLUB EVERYWHERE A ROUND IS NAMED: the rail, the series card, the
   box score and the results screen all ask the bracket's own seat, so a round
   cannot be the Nuggets on one screen and somebody else on the next. Empty
   when the bracket cannot answer, and the caller then says what it always
   said. */
function brkOppLabel(roundName){
  try {
    if (!run || !run.po) return '';
    var B = brkBuild(), col = B.names.indexOf(roundName);
    if (col < 0) return '';
    var t = brkThem(col);
    if (!t || !t.code) return '';
    return 'the ' + (t.seed != null ? t.seed + ' seed ' : '') + brkClubName(t);
  } catch (e) { return ''; }
}

/* The man who led your five in scoring, off the box score the strip opens.
   Kept per game because gameDetail draws a whole box to answer it, and the
   card is repainted after every game of the series. */
function srsTopScorer(round, gi){
  var k = run.seed + ':' + round + ':' + gi;
  if (Object.prototype.hasOwnProperty.call(srsTop, k)) return srsTop[k];
  var d = R.gameDetail(run, { kind: 'playoff', round: round, game: gi });
  var best = null;
  if (d && d.box) for (var i = 0; i < d.box.length; i++) {
    if (!best || (d.box[i].pts || 0) > (best.pts || 0)) best = d.box[i];
  }
  srsTop[k] = best ? { n: E.lastNameOf(best.n), pts: best.pts || 0 } : null;
  return srsTop[k];
}

function srsStamp(s, bestOf){
  var n = s.games.length;
  if (bestOf === 1) return s.won ? 'Won it' : 'Out';
  if (s.won) return s.oppWins === 0 ? 'Sweep' : 'Won in ' + n;
  return s.yourWins === 0 ? 'Swept' : 'Out in ' + n;
}

/* A number counting up to where it landed, over half a second. The final
   figure is written into the markup first and the count ends on it, so the
   only window in which the text is not the answer is the count itself. */
function srsCount(el, to){
  if (!el || reduceMotion() || typeof requestAnimationFrame !== 'function') return;
  var t0 = null, DUR = 520;
  var step = function(ts){
    if (!el.isConnected) return;
    if (t0 == null) t0 = ts;
    var k = Math.min(1, (ts - t0) / DUR);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step); else el.textContent = String(to);
  };
  requestAnimationFrame(step);
}

/* `played` says a game has just been added, so the newest pip flips, the
   score pops, the numbers count and the odds say how far they moved. */
function srsPaint(played){
  var card = $('brk-srs');
  if (!card) return;
  var src = srsSource();
  if (!src) { card.hidden = true; srsLast = null; return; }
  card.hidden = false;

  var B = brkBuild(), s = src.s, round = src.round;
  var bestOf = s.bestOf || (s.round === 'Play-In' ? 1 : 7);
  var need = s.need || Math.ceil(bestOf / 2);
  var games = s.games || [];
  var over = !src.live;
  var next = src.live ? R.pendingGame(run) : null;
  if (next && next.roundIndex !== round) next = null;

  /* The heading and the tag: which game is next and what it is worth. */
  var nm = BRK_SHORT[s.round] === 'Finals' ? 'The Finals' : (BRK_SHORT[s.round] || s.round);
  $('srs-eye').textContent = nm + (bestOf > 1
    ? (next ? ' · Game ' + (next.game + 1) : ' · Best of ' + bestOf) : ' · One game');
  /* ONLY WHEN THE GAME IS WORTH A WORD. Home and away are already on the
     strip, lit on the next game, and a tag saying so on every game pushed the
     heading into an ellipsis on a 320 phone. */
  var tag = $('srs-tag'), label = next ? gameTag(next) : '';
  var hot = !!(next && (next.elimination || next.closeout || next.bestOf === 1));
  tag.hidden = !label;
  tag.textContent = label;
  tag.className = 'srs-tag' + (hot ? ' hot' : '');

  /* The two sides. Your seed is the bracket's, and a play-in run has none
     yet: the winner of that game is what becomes the 7. */
  var them = brkThem(round);
  var finals = BRK_SHORT[s.round] === 'Finals';
  var mysd = $('srs-mysd'), thsd = $('srs-thsd');
  mysd.textContent = bestOf === 1 ? '' : String(B.mySeed);
  mysd.hidden = bestOf === 1;
  $('srs-mynm').innerHTML = esc(YOUR_LOT) + '<small>' + esc(simWins + '-' + simLosses) + '</small>';
  var thSeed = them && them.seed != null ? them.seed : null;
  /* THE CLUB AND ITS SEED, never a record. The chip carries the seed in the
     club's own colors and the line under the name says where it comes from,
     so a Finals opponent reads as the other conference's top club. */
  thsd.textContent = thSeed == null ? '' : String(thSeed);
  thsd.hidden = thSeed == null;
  thsd.setAttribute('style', them && them.code && E.clubSkin
    ? (function(k){ return 'background:' + k.bg + ';color:' + k.on + ';box-shadow:inset 0 0 0 1px ' + k.accent; })(E.clubSkin(them.code))
    : '');
  var thWhere = thSeed == null ? 'Play-in'
    : (finals ? B.farConf + ' ' : '') + thSeed + ' seed';
  $('srs-thnm').innerHTML = esc(them && them.code ? brkClubName(them) : 'The field')
    + '<small>' + esc(thWhere) + '</small>';

  /* The score. A one game round has no series score, so it says VS until the
     game is in and then the game's own score. */
  var sc = $('srs-score');
  sc.className = 'srs-score num' + (bestOf === 1 && games[0] ? ' game' : '');
  if (bestOf === 1) {
    var g1 = games[0];
    sc.textContent = g1 ? g1.yourPoints + '-' + g1.oppPoints : 'VS';
  } else {
    sc.textContent = s.yourWins + '-' + s.oppWins;
  }
  if (played && !reduceMotion()) { sc.classList.remove('pop'); void sc.offsetWidth; sc.classList.add('pop'); }

  /* The odds. Over is over: the bar sits at the end it finished at. */
  var p = over ? (s.won ? 1 : 0) : (E.seriesChance ? E.seriesChance(s) : null);
  var fill = $('srs-fill'), pct = $('srs-pct'), dl = $('srs-delta');
  $('srs-olab').textContent = bestOf === 1 ? 'Win chance' : 'Series odds';
  if (p == null) { fill.style.transform = 'scaleX(.5)'; pct.textContent = ''; }
  else {
    fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, p)).toFixed(3) + ')';
    pct.textContent = Math.round(p * 100) + '%';
  }
  var moved = played && p != null && srsLast && srsLast.round === round
    ? Math.round(p * 100) - Math.round(srsLast.p * 100) : 0;
  if (moved) {
    dl.hidden = false;
    dl.textContent = (moved > 0 ? '+' : '') + moved;
    dl.className = 'srs-delta num ' + (moved > 0 ? 'up' : 'down');
    void dl.offsetWidth;
  } else if (!played) {
    dl.hidden = true;
  }
  if (p != null) srsLast = { round: round, p: p };

  /* The strip: every game of the series, played or still to come. */
  var strip = $('srs-strip'), home = (E.PO_HOME && E.PO_HOME[bestOf]) || [1];
  strip.className = 'srs-strip' + (bestOf === 1 ? ' one' : '');
  var h = '';
  for (var i = 0; i < bestOf; i++) {
    var gm = games[i], isHome = gm ? !!gm.home : home[i] === 1;
    var cls = 'srs-pip' + (isHome ? ' home' : '');
    var tagG = bestOf === 1 ? 'Play-in' : 'G' + (i + 1);
    if (gm) {
      cls += gm.won ? ' w' : ' l';
      if (played && i === games.length - 1) cls += ' just';
      h += '<button type="button" class="' + cls + '" data-g="' + i + '" aria-label="'
        + esc(tagG + ', ' + (gm.won ? 'won ' : 'lost ') + gm.yourPoints + ' to ' + gm.oppPoints
          + '. Open the box score') + '">'
        + '<span class="g">' + esc(tagG) + '</span>'
        + '<span class="r">' + (gm.won ? 'W' : 'L') + '</span>'
        /* THE MARGIN, NOT THE SCORE. Two three digit scores do not fit a
           seventh of a phone, and cut to "122-1..." they said nothing. The
           margin is what a strip of games is for; the score is one tap away
           and on the line under the strip. */
        + '<span class="s num">' + (gm.won ? '+' : '-') + Math.abs(gm.yourPoints - gm.oppPoints) + '</span>'
        + '</button>';
    } else {
      var moot = over || s.yourWins >= need || s.oppWins >= need;
      if (!moot && next && i === games.length) cls += ' next';
      else if (moot) cls += ' moot';
      h += '<div class="' + cls + '"><span class="g">' + esc(tagG) + '</span>'
        + '<span class="h">' + (isHome ? 'Home' : 'Away') + '</span></div>';
    }
  }
  strip.innerHTML = h;

  /* The last line: how the newest game went and whose night it was, or
     before the first one, where the games are. */
  var last = $('srs-last');
  if (games.length) {
    var gi = games.length - 1, lg = games[gi], top = srsTopScorer(round, gi);
    last.innerHTML = '<b class="' + (lg.won ? 'w' : 'l') + '">' + (lg.won ? 'Won' : 'Lost') + '</b> '
      + esc(bestOf === 1 ? 'the play-in' : 'Game ' + (gi + 1)) + ', '
      + '<b class="num" data-n="y">' + lg.yourPoints + '</b>-'
      + '<b class="num" data-n="t">' + lg.oppPoints + '</b>'
      + (lg.ot ? (lg.ot > 1 ? ' ' + lg.ot + 'OT' : ' OT') : '')
      + (top ? ' · ' + esc(top.n) + ' ' + top.pts : '');
    if (played) {
      srsCount(last.querySelector('[data-n="y"]'), lg.yourPoints);
      srsCount(last.querySelector('[data-n="t"]'), lg.oppPoints);
    }
  } else {
    var nums = [];
    for (var k = 0; k < home.length; k++) if (home[k] === 1) nums.push(k + 1);
    last.textContent = bestOf === 1 ? 'On your floor.'
      : 'Games ' + nums.slice(0, -1).join(', ') + ' and ' + nums[nums.length - 1] + ' on your floor.';
  }

  /* The stamp, once the series is decided. */
  var st = $('srs-stamp');
  var decided = over || s.yourWins >= need || s.oppWins >= need;
  if (decided) {
    var won = over ? !!s.won : s.yourWins >= need;
    var txt = srsStamp({ won: won, games: games, yourWins: s.yourWins, oppWins: s.oppWins }, bestOf);
    if (st.hidden || st.textContent !== txt) { st.hidden = true; void st.offsetWidth; }
    st.textContent = txt;
    st.className = 'srs-stamp ' + (won ? 'w' : 'l');
    st.hidden = false;
  } else {
    st.hidden = true;
  }
}

/* ── THE WALK ──────────────────────────────────────────────────────────────
 *
 * A round is three beats: the field around you settles, your series plays,
 * and your seat settles. The door for a game worth playing opens in the
 * middle beat, ABOVE the rail, because the rail is tall and a control the
 * game is waiting on must never be the thing you scroll to find.
 */
var brkTimer = null, brkCol = -1;

function stopBracket(){ if (brkTimer) { clearTimeout(brkTimer); brkTimer = null; } }

function toBracket(){
  if (!run.po) {
    var el = $('sim-bracket');
    el.textContent = '';
    var none = document.createElement('p');
    none.className = 'dim';
    none.style.cssText = 'margin:6px 0 0;font-size:13px';
    none.textContent = 'No playoffs. ' + E.CONSTANTS.PLAY_IN_WINS + ' wins reaches the play-in.';
    el.appendChild(none);
    brTimerEnd();
    return;
  }
  brkEnter();
}
function brTimerEnd(){ brkTimer = setTimeout(endRun, 900); }

/* Everything before this column has already happened, so it is drawn settled.
   Used on a reload, where nothing was animated and the field still has to
   read as a bracket rather than as a page of TBD. */
function brkRevealThrough(col){
  var B = brkBuild();
  for (var c = 0; c < col; c++) {
    var games = brkColumn(c);
    for (var i = 0; i < games.length; i++) if (games[i].key) B.revealed[games[i].key] = true;
  }
}

function brkHead(enter){
  var B = brkBuild();
  var name = B.names[brkCol] || 'Playoffs';
  $('brk-round').textContent = BRK_SHORT[name] === 'Finals' ? 'The Finals' : name;
  $('brk-eyebrow').textContent = B.myConf + ' · ' + B.mySeed + ' seed · '
    + simWins + '-' + simLosses;
  var hero = document.querySelector('#s-brk .brk-hero');
  if (!hero) return;
  hero.classList.remove('champ');
  /* ONCE PER ROUND, ON THE WAY IN. Removing the class and reading a layout
     property is what restarts a CSS animation on a node that already has it;
     a repaint between rounds never calls this with `enter`, so the title
     never twitches while the reader is looking at it. */
  if (enter) { hero.classList.remove('enter'); void hero.offsetWidth; hero.classList.add('enter'); }
}

/* A round begins. pendingGame is what DRAWS the opponent, so the bracket
   cannot be painted before it: the note under the rail says what that
   opponent is playing like, and asking earlier would print the last round's
   answer under this round's heading. */
function brkEnter(){
  stopBracket();
  var next = R.pendingGame(run);
  if (!next) { brkFinale(); return; }
  save();
  var B = brkBuild();
  brkCol = next.roundIndex;
  brkRevealThrough(brkCol);
  B.justKey = null;
  brkHead(true);
  brkNote('');
  $('lvdoor').hidden = true;
  brkRender();
  show('s-brk');
  srsPaint(false);
  brkFocus(brkCol);

  var games = [];
  var col = brkColumn(brkCol);
  for (var i = 0; i < col.length; i++) {
    if (!col[i].mine && col[i].key && !B.revealed[col[i].key] && col[i].won) games.push(col[i]);
  }
  /* THE WHOLE REVEAL IS ABOUT THE SAME LENGTH WHATEVER THE ROUND IS. A first
     round is eight games and a conference final is two, so a fixed step makes
     the first round four times the wait for the same beat. */
  var step = games.length ? Math.max(170, Math.round(2400 / games.length)) : 0;
  var k = 0;
  var go = function(){
    if (k >= games.length) {
      B.justKey = null;
      brkRender();
      brkLater(brkSeries, 460);
      return;
    }
    var g = games[k];
    B.revealed[g.key] = true;
    B.justKey = g.key;
    k++;
    brkRender();
    /* THE UPSET IS CALLED AS IT LANDS, the way a studio show cuts in. The
       note is the one line under the rail, and brkSeriesNote takes it back
       for the reader's own series the moment the reveal is done. */
    if (brkUpset(g)) {
      brkNote('Upset in the ' + (g.side === 'near' ? B.myConf : B.farConf) + '. The '
        + g.won.seed + ' seed ' + brkClubName(g.won) + ' knock out the '
        + g.lost.seed + ' seed ' + brkClubName(g.lost) + '.');
    }
    brkLater(go, step);
  };
  brkFastArm(function(){
    stopBracket();
    for (var z = 0; z < games.length; z++) B.revealed[games[z].key] = true;
    B.justKey = null;
    brkRender();
    brkLater(brkSeries, 200);
  });
  brkLater(go, games.length ? 560 : 240);
}

/* THE WALK WAITS FOR A BOX SCORE. A played game in the series card opens its
   box score over this screen, and a walk that carried on underneath would
   play the next three games while somebody was reading the last one. So
   every beat of the walk is scheduled through here and holds while the sheet
   is open. stopBracket still clears it, because it is the same timer. */
function brkLater(fn, ms){
  brkTimer = setTimeout(function(){
    brkTimer = null;
    var gs = $('gamesheet');
    if (gs && gs.classList.contains('open')) { brkLater(fn, 300); return; }
    fn();
  }, ms);
}

/* WHAT SKIP DOES RIGHT NOW, and null when there is nothing to hurry. Held
   rather than derived, because the games it would finish are the ones the
   reveal's own closure is walking.

   ARMING IT IS WHAT SETS THE BUTTON, in one place, because the two came
   apart the moment there were three callers: a live Skip over a reveal that
   had already finished is a control that does nothing, which is the same
   defect as a docked button on a screen that cannot use it. */
var brkFast = null;
function brkFastArm(fn){
  brkFast = fn || null;
  var b = $('b-brk-fast');
  if (b) b.disabled = !brkFast;
}

/* Your series, a game at a time. A Game 7 stops here and offers the door;
   everything else lands on the seat and carries on. */
function brkSeries(){
  stopBracket();
  brkFastArm(null);
  $('lvdoor').hidden = true;
  var next = R.pendingGame(run);
  if (!next) { renderDock('s-brk'); brkFinale(); return; }
  if (next.roundIndex !== brkCol) { renderDock('s-brk'); brkEnter(); return; }
  brkSeriesNote();
  srsPaint(false);
  if (next.big) { renderDock('s-brk'); showDoor(next); return; }
  /* SKIP HURRIES YOUR SERIES AND NEVER PAST A GAME 7. The door is the mode;
     Skip is pacing. Same rule as Sim the rest on the live board. */
  brkFastArm(brkRushSeries);
  renderDock('s-brk');
  /* A GAME THAT CAN END SOMETHING GETS A BEAT BEFORE THE TIP. The card's tag
     is lit for it, and a moment on the tag is what makes it land as a big
     game rather than as the next number in a list. */
  var stakes = next.elimination || next.closeout || next.bestOf === 1;
  brkLater(brkPlayOne, stakes ? 700 : 240);
}

/* One game of your series: settled the way every game is, then shown. */
function brkPlayOne(){
  var next = R.pendingGame(run);
  if (!next || next.roundIndex !== brkCol || next.big) { brkSeries(); return; }
  var before = run.po.results.length;
  R.simGame(run);
  save();
  brkRender();
  srsPaint(true);
  if (run.po.results.length > before) { brkFastArm(null); brkLater(brkRoundDone, 1100); return; }
  brkLater(brkSeries, 700);
}

/* THE REST OF THIS SERIES AT ONCE, up to a Game 7 and never through one. It
   plays the same games in the same order off the same stream, so the result
   is the one the slow walk would have shown: only the waiting goes. */
function brkRushSeries(){
  stopBracket();
  brkFastArm(null);
  var before = run.po.results.length, played = false, guard = 0;
  while (guard++ < 10) {
    var next = R.pendingGame(run);
    if (!next || next.roundIndex !== brkCol || next.big) break;
    R.simGame(run);
    played = true;
    if (run.po.results.length > before) break;
  }
  if (played) save();
  brkRender();
  srsPaint(played);
  if (run.po.results.length > before) { brkLater(brkRoundDone, 700); return; }
  brkSeries();
}

/* THE SEED AND THE FORM ARE TWO FACTS AND THE SENTENCE KEEPS THEM APART. The
   seat says which seed, which is the FIELD's shape. This says what they are
   playing like, which is the net rating the engine drew and the only number
   here that decides anything. The draw is deliberately wide, so the two
   disagree and should: read as one claim they would make the bracket look
   like it was lying about its own seeding.

   OFF `run.po.cur`, NEVER OFF THE PENDING GAME. `pendingGame` answers with
   the points and the home court, which are the rating already converted for
   this matchup; the rating itself lives on the round. */
function brkSeriesNote(){
  var cur = run.po && run.po.cur;
  if (!cur) { brkNote(''); return; }
  var g = brkColumn(brkCol).filter(function(x){ return x.mine; })[0];
  var them = null;
  if (g && g.pair) them = g.pair[0] && g.pair[0].you ? g.pair[1] : g.pair[0];
  var form = 'They play like a ' + oppWins(cur.oppNet) + ' win team.';
  var who = them && them.code ? 'the ' + brkClubName(them) : null;
  brkNote(them && them.seed != null
    ? 'Next up: ' + (who ? who + ', ' : '') + 'the ' + them.seed + ' seed. ' + form
    : 'One game to get in' + (who ? ', against ' + who : '') + '. ' + form);
}

function brkRoundDone(){
  stopBracket();
  var B = brkBuild();
  var done = run.po.results[brkCol];
  brkRender();
  if (done && done.won) {
    var nx = B.names[brkCol + 1];
    brkNote(brkCol + 1 < B.names.length
      ? 'Through to the ' + (BRK_SHORT[nx] === 'Finals' ? 'Finals' : nx) + '.'
      : 'Champions.');
  } else {
    brkNote('Bounced in ' + roundPhrase(B.names[brkCol]) + '.');
  }
  srsPaint(false);
  brkLater(run.po.done ? brkFinale : brkEnter, 1300);
}

/* THE BRACKET FINISHES WITHOUT YOU, and that is worth the beat. A run that
   goes out in the first round has watched a field it is now not in, and
   walking the rest of it out says what the postseason did rather than
   stopping the screen the moment the reader stops mattering to it. */
function brkFinale(){
  stopBracket();
  brkFastArm(null);
  var B = brkBuild();
  brkRevealThrough(B.names.length);
  brkCol = B.names.length - 1;
  brkRender();
  var last = brkColumn(B.names.length - 1)[0];
  var champ = last && last.won;
  srsPaint(false);
  if (champ && champ.you) {
    /* THE TITLE IS WON ON THE BRACKET, so it is celebrated there first. The
       results screen used to be the first place anything happened, which put
       the moment one screen after the game that decided it. */
    brkNote('Champions.');
    $('brk-round').textContent = 'Champions';
    var hero = document.querySelector('#s-brk .brk-hero');
    if (hero) { hero.classList.remove('enter'); void hero.offsetWidth; hero.classList.add('champ'); }
    fireConfetti();
  } else if (champ) {
    brkNote(champ.seed === 1 ? 'The top seed takes it.' : 'The ' + champ.seed + ' seed takes it.');
  }
  brkFocus(brkCol);
  brkLater(endRun, champ && champ.you ? 2800 : 1600);
}

/* A reload lands here rather than on the season screen: the bracket is where
   the run actually is, and the strip behind it is a season already played. */
function brkResume(){
  var B = brkBuild();
  brkFastArm(null);
  var at = run.po.cur ? run.po.cur.roundIndex : run.po.results.length;
  brkCol = Math.min(at, B.names.length - 1);
  brkRevealThrough(brkCol + 1);
  B.justKey = null;
  brkHead(true);
  brkNote('');
  $('lvdoor').hidden = true;
  brkRender();
  show('s-brk');
  srsPaint(false);
  brkFocus(brkCol);
  brkLater(brkSeries, 420);
}

/* What the game is, in the words that make somebody want to play it. */
function gameTitle(next){
  if (next.bestOf === 1) return next.round;
  return next.round + ' · Game ' + (next.game + 1);
}

function gameTag(next){
  /* A ONE GAME ROUND IS NOT A SERIES, and the play-in is the only one there
     is. Asked first, because elimination and closeout are BOTH true there by
     arithmetic and either label would be a sentence about a series that does
     not exist. */
  if (next.bestOf === 1) return 'Win or go home';
  if (next.decider) return 'Game 7';
  if (next.elimination) return 'Elimination';
  if (next.closeout) return 'Close it out';
  return next.round === 'NBA Finals' ? 'The Finals' : '';
}

/* Where the series stands, or nothing when there is no series. NEVER ENDS IN
   A STOP: the caller joins it to the line below, and a trailing one there is
   what put "the run is over.. Nothing left" on the door. */
function seriesLine(next){
  if (next.bestOf === 1) return null;
  return 'Series ' + next.yourWins + '-' + next.oppWins + ' · '
    + (next.home ? 'your floor' : 'their floor');
}

/* The door opens on a Game 7 and nothing else (poNext's `big`), so the first
   line is the one a player meets. The rest are what a harness that widens the
   door reads, and they stay true about the game they describe. */
function doorWhy(next){
  if (next.decider) return 'Winner take all. Forty-eight minutes for the round.';
  if (next.elimination && next.closeout) return 'Winner moves on.';
  if (next.elimination) return 'Lose and the season is over.';
  if (next.closeout) return 'Win and you move on.';
  return "It's the Finals. Every game counts.";
}

function showDoor(next){
  $('lvd-eye').textContent = gameTitle(next);
  $('lvd-title').textContent = gameTag(next) || 'The Finals';
  $('lvd-why').textContent = [seriesLine(next), doorWhy(next)]
    .filter(Boolean).join('. ');
  /* WHAT TONIGHT IS WORTH, off the arithmetic the game is settled with. It is
     the same whichever button is pressed: playing it forward is fitted to
     land on the same odds, which is what makes Play it a choice about
     watching rather than about winning. */
  var odds = $('lvd-odds'), pc = E.gameChance
    ? Math.round(100 * E.gameChance(next.pointsFor, next.pointsAgainst, next.adv)) : null;
  if (odds) {
    odds.hidden = pc == null;
    if (pc != null) odds.textContent = 'You win this one ' + pc + '% of the time.';
  }
  $('lvdoor').hidden = false;
  renderDock('s-brk');
  brkFastArm(null);
  /* It sits above the rail, so on a tall bracket it can be above the fold
     rather than below it, and scrolling to it is what makes that true on a
     screen the reader may have scrolled down. */
  try { $('lvdoor').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}

/* Sim it: the one game, and back to the series. */
function doorSim(){
  $('lvdoor').hidden = true;
  var before = run.po.results.length;
  R.simGame(run);
  save();
  brkRender();
  srsPaint(true);
  brkLater(run.po.results.length > before ? brkRoundDone : brkSeries, 1100);
}

/* The bracket is finished, so the run is. */
function endRun(){
  stopBracket();
  var out = R.finishRun(run);
  /* ONCE PER RUN, AND THE FLAG RIDES IN THE SAVED RUN. renderOver is also what
     a restored finished run calls, so recording there would add a ring every
     time somebody reopened the tab on a season they had already won. */
  /* WHAT THE RUN EARNED RIDES IN THE SAVED RUN, because it is a difference
     and the difference only exists at this moment: asked again on a reload,
     every badge is already held and every best is already tied. Kept rather
     than shown once, because it is a receipt and not a notification. Somebody
     reopening a finished season should still see which badges that season
     lit, the same way they still see its record. */
  if (!run.recorded) {
    run.recorded = true;
    var got = recordRun(out);
    run.earned = { fresh: got.fresh.map(function(b){
      return { id: b.id, name: b.name, why: b.why, tier: b.tier }; }), bests: got.bests,
      arenas: (got.arenas || []).map(function(a){ return a.id; }) };
  }
  save();
  renderOver(out);
  show('s-over');
  if (out.titleWon) fireConfetti();
}

/* ── ONE GAME, PLAYED FORWARD ──────────────────────────────────────────────
 *
 * PACE IS PER QUARTER AND THE LAST TWO MINUTES ARE THEIR OWN THING. A game is
 * 198 possessions, so one flat pace is either a twenty second blur or a four
 * minute sit, and what anybody actually came for is the fourth quarter. This
 * is the resolved broadcast's escalation arriving at a live board.
 *
 * SIM THE REST HURRIES THE BASKETBALL AND NEVER A CALL, which is the football
 * boss battle's rule verbatim. A run lost to a decision the page made for you
 * is the worst thing this screen could do, so it still stops and asks.
 */
var LV_PACE = { 1: 78, 2: 78, 3: 92, 4: 135 };
var LV_CLUTCH_MS = 300;      // inside the last two minutes of a close game
var LV_CLUTCH_S = 120;
var LV_CLUTCH_M = 6;
var LV_SCORE_MS = 70;        // a bucket is worth a beat on top of the pace
var LV_CALL_HOLD = 950;      // after a call is answered, before the next play
var LV_QUARTER = 0;          // seconds in a quarter, filled at wiring time
var LV = null;

/* THE LIVE BOARD'S STATE, PUBLISHED, AND NOTHING ON THIS PAGE READS IT.
 *
 * It is here so hoops/check-live.mjs can put the board into a genuine last
 * shot and then press the page's own loop, rather than playing games until
 * one turns up. A call happens in about one game in five and a played game
 * is most of a minute, so a guard that waited for one would be dark on most
 * runs, which is the unearnable badge in a different coat. What it drives is
 * the real sim through the real tick: nothing about the decision is faked.
 *
 * `resume` exists rather than exporting lvTick because a caller that has just
 * rewritten the state has a timer pending on the old one, and every version
 * of this that forgot to clear it ran two loops at once. */
window.RTF_LIVE = {
  get sim(){ return LV ? LV.sim : null; },
  get state(){ return LV; },
  resume: function(){ if (!LV) return; clearTimeout(LV.timer); LV.timer = null; lvTick(); }
};

function lvFmt(s){
  var t = Math.max(0, Math.ceil(s));
  var m = Math.floor(t / 60), ss = t % 60;
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}

/* The clock on the wall, which is not the clock the sim keeps. The sim counts
   regulation down as one number, because that is what the two call windows are
   measured against; a scoreboard counts a quarter. */
function lvQuarterClock(sim){
  if (sim.ot) return sim.clock;
  return sim.clock - (4 - sim.quarter) * LV_QUARTER;
}

/* THE QUARTER IS PART OF THE TIME, and leaving it off made the log read as
   though it ran backwards. Newest first, so a row at 0:12 of the first
   quarter sits directly under a row at 11:53 of the second, and there was
   nothing on either to say they were different quarters. */
function lvRowTime(p){
  if (p.q.charAt(0) === 'O') return p.q + ' ' + lvFmt(p.clock);
  var qn = parseInt(p.q.slice(1), 10) || 1;
  return p.q + ' ' + lvFmt(p.clock - (4 - qn) * LV_QUARTER);
}

/* What just happened, in a sentence. The opponent has no names, because the
   bracket draws a strength rather than a roster, so their half is the plainest
   thing that is true. */
function lvWords(p){
  if (!p.mine) {
    if (p.kind === 'to') return ['They turn it over', ''];
    if (p.kind === 'miss') return ['They miss', ''];
    if (p.kind === 'three') return ['They hit a three', ''];
    if (p.kind === 'ft') return [p.pts ? 'They score at the line' : 'They miss at the line', ''];
    if (p.kind === 'and1') return ['And one for them', ''];
    return ['They score', ''];
  }
  var who = p.name ? boxName(p.name) : YOUR_LOT;
  if (p.kind === 'to') return ['', 'Turnover'];
  if (p.kind === 'miss') return [who, ' misses'];
  if (p.kind === 'three') return [who, ' from three'];
  if (p.kind === 'two') return [who, ' scores'];
  if (p.kind === 'and1') return [who, ', and one'];
  if (p.kind === 'ft') return [who, p.pts ? ' from the line' : ' misses at the line'];
  return [who, ''];
}

function startLive(){
  var g = R.liveGame(run);
  if (!g) { brkSeries(); return; }
  stopBracket();
  LV = { next: g.next, sim: g.sim, rng: g.rng, timer: null, fast: false,
    shown: 0, men: [], over: false };

  $('lv-eye').textContent = gameTitle(g.next);
  var tag = gameTag(g.next);
  $('lv-tag').hidden = !tag;
  $('lv-tag').textContent = tag;
  $('lv-you').textContent = '0';
  $('lv-them').textContent = '0';
  $('lv-q').textContent = 'Q1';
  $('lv-clock').textContent = lvFmt(LV_QUARTER);
  $('lv-last').textContent = '';
  $('lv-last').className = 'lvlast';
  $('lv-log').textContent = '';
  $('lv-call').hidden = true;
  $('lv-verdict').hidden = true;
  $('lv-fill').className = '';
  $('lv-fill').style.transform = 'scaleX(0)';
  $('b-lv-fast').disabled = false;
  $('b-lv-fast').style.display = '';
  $('b-lv-fast').textContent = 'Sim the rest';
  $('lv-syou').classList.remove('lead');
  $('lv-sthem').classList.remove('lead');
  lvBuildMen();
  show('s-live');
  LV.timer = setTimeout(lvTick, 620);
}

function lvBuildMen(){
  var wrap = $('lv-men');
  wrap.textContent = '';
  LV.men = [];
  for (var i = 0; i < LV.sim.men.length; i++) {
    var m = LV.sim.men[i];
    var d = document.createElement('div');
    d.className = 'lvman';
    var n = document.createElement('span');
    n.className = 'mn';
    n.textContent = E.lastNameOf(m.p.n);
    n.title = m.p.n;
    var v = document.createElement('span');
    v.className = 'mp';
    v.textContent = '0';
    d.appendChild(n); d.appendChild(v);
    wrap.appendChild(d);
    LV.men.push({ box: d, val: v, pts: 0 });
  }
}

function lvDelay(sim, scored){
  if (LV.fast) return 0;
  var left = lvQuarterClock(sim);
  var m = Math.abs(sim.you - sim.them);
  var base = (sim.ot || sim.quarter === 4) && left <= LV_CLUTCH_S && m <= LV_CLUTCH_M
    ? LV_CLUTCH_MS
    : (sim.ot ? LV_PACE[4] : (LV_PACE[sim.quarter] || 90));
  return base + (scored ? LV_SCORE_MS : 0);
}

function lvTick(){
  if (!LV || LV.over) return;
  var sim = LV.sim;
  if (sim.over) { lvFinish(); return; }
  var step = E.liveAdvance(sim, LV.rng, {});
  if (step && step.pending) { lvAsk(step.pending); return; }
  lvPaint();
  if (sim.over) { LV.timer = setTimeout(lvFinish, LV.fast ? 260 : 700); return; }
  LV.timer = setTimeout(lvTick, lvDelay(sim, step && step.pts > 0));
}

/* Everything the board says, read off the sim rather than accumulated here.
   Two copies of a score is how a scoreboard ends up disagreeing with its own
   play by play, which is the boss battle's own bug. */
function lvPaint(){
  var sim = LV.sim;
  var you = $('lv-you'), them = $('lv-them');
  var p = sim.plays[sim.plays.length - 1];

  if (you.textContent !== String(sim.you)) { you.textContent = sim.you; lvPop(you); }
  if (them.textContent !== String(sim.them)) { them.textContent = sim.them; lvPop(them); }

  $('lv-q').textContent = sim.ot ? (sim.ot > 1 ? sim.ot + 'OT' : 'OT') : 'Q' + sim.quarter;
  $('lv-clock').textContent = lvFmt(lvQuarterClock(sim));
  var mid = $('lv-clock').parentNode;
  var close = (sim.ot || sim.quarter === 4)
    && lvQuarterClock(sim) <= LV_CLUTCH_S && Math.abs(sim.you - sim.them) <= LV_CLUTCH_M;
  mid.classList.toggle('clutch', close);

  /* The lead, as a transform on one bar. Twenty points fills it, which is
     where a basketball game stops being in the balance. */
  var lead = sim.you - sim.them;
  var fill = $('lv-fill');
  fill.className = lead < 0 ? 'neg' : '';
  fill.style.transform = 'scaleX(' + Math.min(1, Math.abs(lead) / 20).toFixed(3) + ')';
  $('lv-syou').classList.toggle('lead', lead > 0);
  $('lv-sthem').classList.toggle('lead', lead < 0);

  if (!p) return;
  lvLast(p);
  lvLog(p);
  if (p.mine && p.who != null && p.pts > 0) lvMan(p.who);
}

function lvPop(el){
  el.classList.remove('pop');
  /* Reading offsetWidth is what restarts a transition that is already on the
     element, and it is the one layout read in this loop. */
  void el.offsetWidth;
  el.classList.add('pop');
  setTimeout(function(){ el.classList.remove('pop'); }, 190);
}

function lvLast(p){
  var el = $('lv-last');
  el.textContent = '';
  el.className = 'lvlast in' + (p.mine ? ' mine' : '');
  void el.offsetWidth;
  el.className = 'lvlast in' + (p.mine ? ' mine' : '');
  if (p.pts > 0) {
    var b = document.createElement('span');
    b.className = 'lvl-pts';
    b.textContent = '+' + p.pts;
    el.appendChild(b);
  }
  var t = document.createElement('span');
  t.className = 'lvl-txt';
  var w = lvWords(p);
  if (w[0]) { var strong = document.createElement('b'); strong.textContent = w[0]; t.appendChild(strong); }
  if (w[1]) t.appendChild(document.createTextNode(w[1]));
  if (p.note) {
    t.appendChild(document.createTextNode(' · '));
    var n = document.createElement('b');
    n.textContent = p.note;
    t.appendChild(n);
  }
  el.appendChild(t);
}

/* NEWEST FIRST, because the thing worth reading is what just happened and a
   log that grows downward on a phone is a log nobody scrolls back up. Capped,
   because two hundred rows of DOM under an animating board is the one way this
   screen could get slow. */
function lvLog(p){
  var log = $('lv-log');
  var row = document.createElement('div');
  row.className = 'lvrow new' + (p.mine ? ' mine' : '') + (p.note ? ' call' : '');
  var t = document.createElement('span');
  t.className = 'lvt';
  t.textContent = lvRowTime(p);
  var w = document.createElement('span');
  w.className = 'lvw';
  var words = lvWords(p);
  if (words[0]) { var b = document.createElement('b'); b.textContent = words[0]; w.appendChild(b); }
  if (words[1]) w.appendChild(document.createTextNode(words[1]));
  if (p.note) {
    w.appendChild(document.createTextNode(' · '));
    var n = document.createElement('b');
    n.textContent = p.note;
    w.appendChild(n);
  }
  var s = document.createElement('span');
  s.className = 'lvs';
  s.textContent = p.you + '-' + p.them;
  row.appendChild(t); row.appendChild(w); row.appendChild(s);
  log.insertBefore(row, log.firstChild);
  while (log.childNodes.length > 60) log.removeChild(log.lastChild);
}

function lvMan(i){
  for (var k = 0; k < LV.men.length; k++) {
    if (LV.sim.men[k].i !== i) continue;
    var m = LV.men[k];
    m.val.textContent = LV.sim.men[k].pts;
    m.box.classList.remove('pop');
    void m.box.offsetWidth;
    m.box.classList.add('pop');
    setTimeout((function(box){ return function(){ box.classList.remove('pop'); }; })(m.box), 190);
  }
  /* Whose night it is, recomputed rather than tracked, because a leader that
     is tracked is a second copy of the answer. */
  var best = -1, at = -1;
  for (var z = 0; z < LV.sim.men.length; z++) {
    if (LV.sim.men[z].pts > best) { best = LV.sim.men[z].pts; at = z; }
  }
  for (var y = 0; y < LV.men.length; y++) {
    LV.men[y].box.classList.toggle('hot', y === at && best > 0);
  }
}

/* THE CALL. The board stops, the question goes above the log, and nothing
   about the game moves until it is answered. */
function lvAsk(d){
  lvPaint();
  var box = $('lv-call');
  $('lvc-q').textContent = d.kind === 'foul'
    ? 'Up three, ' + lvFmt(lvQuarterClock(LV.sim)) + ' left. They have the ball.'
    : (d.margin > 0 ? 'Up ' + d.margin : d.margin < 0 ? 'Down ' + (-d.margin) : 'Tied')
      + ', ' + lvFmt(lvQuarterClock(LV.sim)) + ' left. Last shot.';
  var wrap = $('lvc-opts');
  wrap.textContent = '';
  for (var i = 0; i < d.options.length; i++) {
    (function(o){
      var b = document.createElement('button');
      b.className = 'lvc-opt';
      var t = document.createElement('b');
      t.textContent = o.label;
      var s = document.createElement('span');
      s.textContent = o.why;
      b.appendChild(t); b.appendChild(s);
      b.onclick = function(){ lvAnswer(o.id); };
      wrap.appendChild(b);
    })(d.options[i]);
  }
  box.hidden = false;
  try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}

function lvAnswer(id){
  if (!LV || LV.over) return;
  $('lv-call').hidden = true;
  E.liveStep(LV.sim, LV.rng, id);
  lvPaint();
  if (LV.sim.over) { LV.timer = setTimeout(lvFinish, 700); return; }
  LV.timer = setTimeout(lvTick, LV.fast ? 0 : LV_CALL_HOLD);
}

function lvFast(){
  if (!LV || LV.over) return;
  LV.fast = true;
  $('b-lv-fast').disabled = true;
  $('b-lv-fast').textContent = 'Simming';
  /* ONE WAY, and the flag survives the decisions it pauses at. Somebody who
     asked for the rest of it fast meant after the call too. */
  if (LV.timer) { clearTimeout(LV.timer); LV.timer = null; }
  if (!$('lv-call').hidden) return;      // still waiting on a real decision
  lvTick();
}

function lvFinish(){
  if (!LV || LV.over) return;
  LV.over = true;
  if (LV.timer) { clearTimeout(LV.timer); LV.timer = null; }
  var res = E.liveResult(LV.sim);
  /* READ BEFORE THE WRITE, because whether the round is over is the whole
     difference between "Series 3-2" and "Series won 4-2", and after the record
     lands there is no way left to ask. */
  var roundsBefore = run.po.results.length;
  R.recordGame(run, LV.next, res);
  save();
  var closed = run.po.results.length > roundsBefore;

  var v = $('lv-verdict');
  v.className = 'card lvverdict ' + (res.won ? 'w' : 'l');
  $('lvv-res').textContent = res.won ? 'You take it' : 'They take it';
  $('lvv-score').textContent = res.yourPoints + '-' + res.oppPoints
    + (res.ot ? (res.ot > 1 ? ' ' + res.ot + 'OT' : ' OT') : '');
  var top = res.lines.slice().sort(function(a, b){ return b.pts - a.pts; })[0];
  var series = LV.next.yourWins + (res.won ? 1 : 0);
  var theirs = LV.next.oppWins + (res.won ? 0 : 1);
  var line = top ? top.n + ' had ' + top.pts + '.' : '';
  if (LV.next.bestOf > 1) {
    line += (line ? ' ' : '') + (closed
      ? (res.won ? 'Series won ' : 'Series lost ') + series + '-' + theirs
      : 'Series ' + series + '-' + theirs);
  }
  $('lvv-line').textContent = line;
  v.hidden = false;
  /* HIDDEN, NOT JUST DISABLED, which is the same note the Play button on the
     season screen carries. A spent control reading "Simming" under a verdict
     is a caption rather than a button, and the dock reads offsetParent, so
     hiding it here is also what keeps it out of the bar. */
  $('b-lv-fast').disabled = true;
  $('b-lv-fast').style.display = 'none';
  renderDock('s-live');
  try { v.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}

/* A RELOAD IN THE MIDDLE OF A BRACKET comes back to the BRACKET, which is
   where the run actually is. The season strip behind it is 82 games already
   played, and replaying them is a reveal of something the player has seen. */
function resumeBracket(){
  var w = 0, l = 0;
  for (var i = 0; i < (run.season || []).length; i++) {
    if (run.season[i].won) w++; else l++;
  }
  simWins = w; simLosses = l;
  $('b-play').disabled = true;
  $('b-play').style.display = 'none';
  /* A run that missed the play-in is in the playoffs phase with no bracket:
     there is nothing to draw and nothing to resume, so it finishes. */
  if (!run.po) { endRun(); return; }
  brkResume();
}

function lvContinue(){
  LV = null;
  show('s-brk');
  brkRender();
  srsPaint(true);
  /* The round's own row lands on the way out rather than while the verdict
     was up, so a player reads the game and then the series, in that order. */
  brkTimer = setTimeout(brkSeries, 420);
}
