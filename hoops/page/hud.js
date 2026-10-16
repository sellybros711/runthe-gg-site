// ── the pinned HUD ─────────────────────────────────────────────────────────

function renderHud(justSlot){
  var remaining = R.remaining(run), left = R.slotsLeft(run), spendable = R.spendable(run);
  var cap = E.CONSTANTS.CAP_MUSD;

  $('c-amt').textContent = money(remaining);
  $('c-amt').className = 'capamt' + (remaining < cap * 0.14 ? ' bad' : remaining < cap * 0.3 ? ' warn' : '');
  /* THE SLOT COUNTER IS THE SLOT LIST, twice: the ceiling and the total were
     both a literal 6, so a five man draft counted "1 of 6" under a court with
     five spots on it, all the way to a last pick that read "6 of 6". A number
     on the HUD is the one number a drafter is actually watching. */
  var full = E.SLOTS.length;
  $('d-count').textContent = Math.min(run.roster.length + 1, full) + ' of ' + full;

  var pct = Math.max(0, Math.min(100, (remaining / cap) * 100));
  $('c-bar').style.width = pct + '%';
  $('c-barwrap').className = 'capbar' + (pct < 14 ? ' broke' : pct < 30 ? ' tight' : '');

  /* WHAT IS LEFT PER REMAINING SLOT, which is the number that actually decides
     the next pick and the one nobody works out in their head mid-draft.
     A CAP IS A BUDGET TO SPEND. Finishing under it is not thrift, it is thirteen
     wins, measured: drafting on value alone leaves $45M unspent and the season
     falls apart. So the HUD says what is available PER SLOT rather than treating
     a large remaining balance as a good sign, and says so out loud when a draft
     is drifting toward finishing rich and bad. */
  var per = $('c-per');
  per.textContent = '';
  per.className = 'perslot';
  if (left <= 0) {
    per.textContent = 'Roster full.';
  } else if (left === 1) {
    /* One slot left, so the average IS the money and there is nothing to
       average it over. Saying "$14.2M a man across 1 slot" is arithmetic
       performed on the reader for no reason. */
    per.appendChild(document.createTextNode('Last pick. Up to '));
    per.appendChild(bold(money(Math.max(0, spendable))));
  } else {
    /* THE AVERAGE FIRST, because it is the number the next pick is actually
       measured against. "$124M available" is true and it is not the question:
       spend it here and the other five men are minimum-salary filler. What a
       player has to be WORTH is the money divided by the slots it still has to
       cover, and nobody works that out in their head mid-draft.
       The ceiling comes second because it is a rule rather than a guide: it is
       what the cap will actually let through on this pick once the cheapest
       legal player for every other slot is set aside. */
    /* ONE LINE, MEASURED. "a man across 6 slots · up to $116.0M on this one"
       wrapped to two lines at 390px and at 360px, and this strip is pinned
       under the app bar on every pick, so those eighteen pixels are paid for
       on every screen of the draft. The slot count came out because "Slot 1
       of 6" is printed two inches above it. */
    per.appendChild(bold(money(remaining / left)));
    per.appendChild(document.createTextNode(' a spot · up to '));
    per.appendChild(bold(money(Math.max(0, spendable))));
    per.appendChild(document.createTextNode(' here'));
  }

  var note = $('c-note');
  note.textContent = '';
  note.className = '';
  /* Only once there is enough draft behind you for the warning to be true. */
  if (left > 0 && left < 6) {
    var perSlot = remaining / left;
    if (perSlot > 26 && left <= 3) {
      note.className = 'warn';
      note.textContent = money(remaining) + ' left for ' + left + ' spot'
        + (left === 1 ? '' : 's') + '. Spend it. Unused cap buys nothing.';
    }
  }

  var chem = E.resolveChemistry(run.roster);
  var head = $('r-chem');
  if (head) {
    head.textContent = run.roster.length < 2 ? ''
      : 'chemistry ' + (chem.bonus >= 0 ? '+' : '') + chem.bonus.toFixed(2) + ' rating';
  }
  var cv = $('c-chem');
  cv.textContent = run.roster.length < 2 ? 'None'
    : (chem.bonus >= 0 ? '+' : '') + chem.bonus.toFixed(2);
  cv.className = 'chemval' + (run.roster.length >= 2 && chem.bonus > 0.01 ? ' up' : ' zero');

  var pips = $('d-pips');
  pips.textContent = '';
  var filled = {};
  for (var r = 0; r < run.roster.length; r++) filled[E.SLOTS[run.slotIndex[r]]] = run.roster[r];
  for (var s = 0; s < E.SLOTS.length; s++) {
    var slot = E.SLOTS[s], p = filled[slot];
    var pip = document.createElement('span');
    pip.className = 'dpip' + (p ? ' on' : '') + (p && slot === justSlot ? ' just' : '');
    if (p) pip.style.background = posPaint(slot);
    pip.textContent = slot;
    pips.appendChild(pip);
  }
  return chem;
}

/* The box score line a fan reads a season by. Win shares are what the game
   RATES a man on and the board prints them; a roster row is the man, and a man
   is his points, rebounds and assists. */
function oddsWord(pct){
  return pct >= 30 ? 'Title favorite' : pct >= 15 ? 'Contender'
    : pct >= 5 ? 'Dark horse' : pct >= 1 ? 'Long shot' : 'No shot';
}

/* The pips stand in for the court once it has scrolled up behind the pinned
   bar, and not before. Asked of the court's own rectangle, so it is right
   whatever height the bar or the court comes out at on this screen. */
function pipsFollowCourt(){
  var cap = document.querySelector('#s-draft .capwrap'), court = $('court');
  if (!cap || !court) return;
  var on = $('s-draft').classList.contains('active') &&
    court.getBoundingClientRect().bottom < cap.getBoundingClientRect().bottom + 8;
  if (cap.classList.contains('pipsup') !== on) cap.classList.toggle('pipsup', on);
}
(function(){
  var queued = false;
  function soon(){ if (queued) return; queued = true;
    requestAnimationFrame(function(){ queued = false; pipsFollowCourt(); }); }
  window.addEventListener('scroll', soon, { passive: true });
  window.addEventListener('resize', soon);
})();

function statLine(p){
  return p.pts + ' pts · ' + p.reb + ' reb · ' + p.ast + ' ast';
}

/* A tab that comes up empty says which spot it is short of, in the words a
   fan uses for the position rather than its code. */
var POS_PLURAL = { PG: 'point guards', SG: 'shooting guards', SF: 'small forwards',
  PF: 'power forwards', C: 'centers' };

var BLOCK_TEXT = {
  drafted: 'already on your team',
  no_spot: 'no open spot for him',
  position_full: 'that spot is filled',
  price: 'too expensive'
};

var activeTab = 'ALL';

function renderDraft(justSlot){
  var chem = renderHud(justSlot);
  renderCourt(justSlot);

  var draw = run.currentDraw;
  if (!draw) {
    $('d-note2').textContent = 'Spin a season and a team.';
    $('tabs').textContent = '';
    $('opts').textContent = '';
    $('tabs').className = 'tabs';
    $('opts').className = 'opts';
  } else if (!reelBusy && !$('reel-c').firstChild) {
    /* A draw with nothing on the reels is a restored run: the spin that would
       have filled them happened in a tab that is gone. Put the answer up
       without animating it. Guarded on reelBusy so this can never fire in the
       middle of a live spin, where the strip is deliberately mid-flight. */
    showDraw(draw);
  }
  if (draw) {
    $('d-note2').textContent = drawNote(draw);
    renderTabs(draw);
    renderOptions(draw);
    $('tabs').className = 'tabs' + (reelBusy ? ' pending' : '');
    $('opts').className = 'opts' + (reelBusy ? ' pending' : '');
  }

  /* A DISABLED BUTTON READING "Pick a player" IS NOT A BUTTON, it is a caption
     taking up a tap target. It only exists between draws, so it is only on
     screen between draws. */
  var canSpin = !draw && run.phase === R.PHASES.DRAFT;
  $('b-spin').style.display = canSpin ? '' : 'none';
  $('b-spin').disabled = reelBusy;

  var re = R.canRespin(run);
  $('b-respin').disabled = !re.ok || !draw || reelBusy;
  /* FREE IS A WORD AND NOT A PRICE OF ZERO. The last slot's re-spin costs
     nothing, and "Re-spin ($0M)" reads as a rendering fault rather than as the
     one thing that screen has to offer. */
  $('b-respin').textContent = re.cost > 0
    ? 'Re-spin (' + money(re.cost) + ')'
    : 'Re-spin (free)';
  $('d-note').textContent = re.ok ? '' : (draw ? re.reason : '');

  renderFit();
  drawRail();
  /* The spin and the re-spin swap places as a draw comes and goes, so the dock
     has to be rebuilt on every draft render rather than only on a screen
     change. */
  renderDock('s-draft');
  renderAppBar('s-draft');
}

/* THE LINE UNDER THE REELS: what this draw is for, and one thing about it.
 *
 * THE NOTE NAMES THE CLUB, so it waits for the reel like everything else.
 * "founded 1976 · 1 championship" under a strip that has not stopped moving
 * is the club's identity card, handed over a beat before the wheel gets to
 * say it. Same reason dressReel holds the colours back.
 *
 * AND UNDER A LOCK IT IS THE SAME CLUB EVERY TIME, so teamNote's founding
 * year and title list is the identical sentence six picks running, wrapped
 * over two lines. That is "2011 Spurs on every tile" one level up. What
 * changes in a locked run is the SEASON, so what gets said is the one thing
 * about the season a fan would want to know first.
 */
function drawNote(draw){
  var slots = draw.openSlots.length === E.SLOTS.length
    ? 'Open: all ' + NUMWORD(E.SLOTS.length)
    : 'Open: ' + draw.openSlots.join(' / ');
  if (reelBusy) return slots;
  if (run.club) {
    return slots + (E.wonTitle(draw.team, draw.season) ? ' · won the title that year' : '');
  }
  var note = E.teamNote(draw.team, draw.season);
  return slots + (note ? ' · ' + note : '');
}

/* THE TABS ARE THE OPEN SLOTS, not every position. A board is six players and
   the question is which hole each one fills, so a tab that cannot be filled is
   shown struck through rather than hidden: knowing the centre spot is already
   gone is part of reading the board. */
function renderTabs(draw){
  var el = $('tabs');
  el.textContent = '';
  var counts = {}, any = 0;
  for (var i = 0; i < draw.board.length; i++) {
    var p = DATA.allPlayers[draw.board[i].key];
    if (!p || draw.board[i].block) continue;
    any++;
    for (var s = 0; s < E.SLOTS.length; s++) {
      if (E.canFillSlot(p, E.SLOTS[s])) counts[E.SLOTS[s]] = (counts[E.SLOTS[s]] || 0) + 1;
    }
  }
  if (activeTab !== 'ALL' && !counts[activeTab]) activeTab = 'ALL';

  var mk = function(key, label, n, full){
    var b = document.createElement('button');
    b.className = 'tab' + (activeTab === key ? ' on' : '') + (full ? ' full' : '');
    b.setAttribute('role', 'tab');
    if (key !== 'ALL') {
      b.style.borderColor = 'transparent';
      b.style.background = activeTab === key ? posPaint(key)
        : 'linear-gradient(160deg,rgba(255,255,255,.07),rgba(0,0,0,.3))';
      if (activeTab === key) b.style.color = '#fff';
    }
    b.appendChild(document.createTextNode(label));
    if (n != null) {
      var sm = document.createElement('span');
      sm.className = 'n';
      sm.textContent = String(n);
      b.appendChild(sm);
    }
    b.onclick = function(){ activeTab = key; renderTabs(draw); renderOptions(draw); };
    el.appendChild(b);
  };
  mk('ALL', 'All', any, false);
  for (var t = 0; t < E.SLOTS.length; t++) {
    var slot = E.SLOTS[t];
    mk(slot, slot, counts[slot] || 0, !counts[slot]);
  }
}

var optSort = 'best';

/* HOW THE BOARD IS ARRANGED, which used to be "whatever order the club's roster
 * came in". Six names in roster order is a list to read rather than a decision
 * to make.
 *
 * Signable men come first and the ones you cannot have are pushed to the bottom
 * rather than hidden, because "the centre here is out of your price range" is
 * information. Within that, the sort is the player's choice, and it defaults to
 * the one that answers the question the draft actually asks: who is the best
 * player here that I can afford.
 */
function renderOptions(draw){
  var boardEl = $('opts');
  boardEl.textContent = '';

  var rows = [];
  for (var i = 0; i < draw.board.length; i++) {
    var p = DATA.allPlayers[draw.board[i].key];
    if (!p) continue;
    if (activeTab !== 'ALL' && !E.canFillSlot(p, activeTab)) continue;
    rows.push({ p: p, block: draw.board[i].block });
  }

  var afford = R.spendable(run);
  var rank = {
    best: function(a, b){ return b.p.w - a.p.w; },
    value: function(a, b){
      var ra = (goingRate(a.p.w) || a.p.p) / a.p.p, rb = (goingRate(b.p.w) || b.p.p) / b.p.p;
      return rb - ra;
    },
    cheap: function(a, b){ return a.p.p - b.p.p; }
  }[optSort];

  rows.sort(function(a, b){
    /* Blocked to the bottom, then unaffordable, then the chosen sort. */
    var ba = a.block ? 2 : (a.p.p > afford ? 1 : 0);
    var bb = b.block ? 2 : (b.p.p > afford ? 1 : 0);
    if (ba !== bb) return ba - bb;
    return rank(a, b);
  });

  renderSortBar(draw);

  /* ── WHAT THIS PICK DOES TO THE LAST ONE ─────────────────────────────────
   *
   * The reserve floor promises a LEGAL ROSTER AND NEVER A CHOICE: it earmarks
   * the cheapest man for every open slot, so a drafter who spends down to it
   * reaches the last slot able to afford precisely that man. Measured, the
   * last board is a single forced option on 47.6% of best-available runs and
   * 61.0% of runs that spend the cap, against 10.2% for a bot that hoards
   * money. The game was taking the last of its five decisions away from the
   * player who had drafted the way it rewards, and nothing on screen said so
   * until it had happened.
   *
   * So it is said BEFORE the tap, which is the rule the dynasty door in the
   * football game already runs on.
   *
   * MARKED PER TILE, OR ONCE, AND NEVER BOTH. Measured over 450 second to last
   * boards: 21.9% of signable tiles would carry the mark, 51.1% of boards
   * carry none at all, and on 23.3% EVERY signable man leaves it tight. That
   * last case is the divider rule below arriving one line up: a mark that is
   * on everything marks nothing, and what it is really saying is a fact about
   * the board rather than about any man on it. */
  var signableRows = rows.filter(function(row){ return !row.block && row.p.p <= afford; });
  var tightRows = signableRows.filter(function(row){ return R.leavesNoChoice(run, row.p); });
  var allTight = signableRows.length > 0 && tightRows.length === signableRows.length;
  var markTight = tightRows.length > 0 && !allTight;

  if (allTight) {
    var warn = document.createElement('p');
    warn.className = 'dim tightall';
    warn.textContent = 'Anyone here leaves your last pick thin. Re-spinning the last pick is free.';
    boardEl.appendChild(warn);
  }

  /* A HEADING OVER THE WHOLE LIST IS NOT A HEADING. On an opening board every
     man is affordable, so "SIGNABLE" sat alone above ten signable players and
     told nobody anything, for 26px off the top of the one screen that matters.
     It is a divider, so it only earns its line when there is something on the
     other side of it. */
  var groupOf = function(row){
    return row.block ? 'Cannot sign' : (row.p.p > afford ? 'Out of budget' : 'Signable');
  };
  var grouped = rows.length > 0 && rows.some(function(row){
    return groupOf(row) !== groupOf(rows[0]); });

  var lastGroup = null;
  for (var r = 0; r < rows.length; r++) {
    var p = rows[r].p, block = rows[r].block;
    var tooDear = !block && p.p > afford;
    var group = groupOf(rows[r]);
    if (grouped && group !== lastGroup) {
      lastGroup = group;
      var g = document.createElement('div');
      g.className = 'optgroup';
      var lb = document.createElement('span');
      lb.className = 'lbl';
      lb.textContent = group;
      var rule = document.createElement('span');
      rule.className = 'rule';
      g.appendChild(lb); g.appendChild(rule);
      boardEl.appendChild(g);
    }
    boardEl.appendChild(playerTile(p, block, tooDear, r,
      markTight && !block && !tooDear && R.leavesNoChoice(run, p)
        ? R.marginAfter(run, p) : null));
  }

  if (!rows.length) {
    var none = document.createElement('p');
    none.className = 'dim';
    none.style.cssText = 'font-size:13px;margin:8px 0';
    none.textContent = activeTab === 'ALL' ? 'Nobody here you can sign.'
      : 'No ' + (POS_PLURAL[activeTab] || activeTab) + ' on this roster. Try another tab.';
    boardEl.appendChild(none);
  }
}

function renderSortBar(draw){
  var bar = document.createElement('div');
  bar.className = 'sortbar';
  var lbl = document.createElement('span');
  lbl.textContent = 'Sort';
  bar.appendChild(lbl);
  var opts = [['best', 'Best player'], ['value', 'Best value'], ['cheap', 'Cheapest']];
  for (var i = 0; i < opts.length; i++) {
    (function(key, text){
      var b = document.createElement('button');
      b.className = optSort === key ? 'on' : '';
      b.textContent = text;
      b.onclick = function(){ optSort = key; renderOptions(draw); };
      bar.appendChild(b);
    })(opts[i][0], opts[i][1]);
  }
  $('opts').appendChild(bar);
}

/* ── HARDWARE ──────────────────────────────────────────────────────────────
 *
 * The board used to describe each player with badges worked out from his own
 * box score: RIM PROTECTOR, CREATOR, NO RANGE. Both halves of that were wrong.
 *
 * It printed the fit model's answer on every tile, so a draft became a matching
 * exercise (collect one of each colour) rather than a basketball decision, and
 * the knowledge a fan brings is supposed to be the whole edge.
 *
 * And a badge inferred from one season's rate stats makes claims about a PLAYER
 * that his career flatly contradicts. Karl-Anthony Towns took 1.1 threes a game
 * in 2016, which is a fair reading of that column and an absurd thing to say
 * about one of the best shooting big men who has ever played.
 *
 * What a man WON has neither problem. It is a fact rather than an inference,
 * it is the thing a fan already carries in their head, and a 1990 Celtics tile
 * that says five-time All-Star is rewarding recall instead of replacing it.
 *
 * Codes rather than names in the data file, because this ships to every visitor
 * 16,000 times and "All-Defensive 2nd Team" is 22 bytes of the same three
 * words. The list on each player is already sorted by prestige at BUILD time,
 * so the first entry is the best one and nothing here has to rank anything.
 */
var AWARD_LABEL = {
  mvp: 'MVP', fmvp: 'Finals MVP', an1: 'All-NBA 1st', dpoy: 'Defensive POY',
  ring: 'Champion', an2: 'All-NBA 2nd', an3: 'All-NBA 3rd', roy: 'Rookie of the Year',
  smoy: 'Sixth Man', mip: 'Most Improved', ad1: 'All-Defensive 1st',
  ad2: 'All-Defensive 2nd', star: 'All-Star'
};
/* The full plate is for the five a fan would lead with. Everything else keeps
   the shape in a duller metal, so six All-Stars do not read as six MVPs. */
var AWARD_MAJOR = { mvp: 1, fmvp: 1, an1: 1, dpoy: 1, ring: 1 };

function awardChip(code){
  var el = document.createElement('span');
  el.className = 'awd' + (AWARD_MAJOR[code] ? '' : ' minor');
  el.textContent = AWARD_LABEL[code] || code;
  return el;
}

/* Up to `max` plates and a count for the rest. A tile is four lines tall and a
   man with an MVP, a ring, a first team and an All-Star nod would take two of
   them on hardware alone. Returns null when there is nothing to show, which is
   most players: the row is only added when it has something in it. */
function awardRow(p, max){
  var won = p.aw;
  if (!won || !won.length) return null;
  var row = document.createElement('span');
  row.className = 'badges';
  var shown = Math.min(max || won.length, won.length);
  for (var i = 0; i < shown; i++) row.appendChild(awardChip(won[i]));
  if (won.length > shown) {
    var more = document.createElement('span');
    more.className = 'awdmore';
    more.textContent = '+' + (won.length - shown);
    /* The full list for a screen reader and for a hover, since the plate it is
       standing in for is the only place the name exists. */
    more.title = won.slice(shown).map(function(c){ return AWARD_LABEL[c] || c; }).join(', ');
    row.appendChild(more);
  }
  return row;
}

function statBit(value, label, key, warn){
  var st = document.createElement('span');
  st.className = 'st' + (key ? ' key' : '') + (warn ? ' warn' : '');
  var b = document.createElement('b');
  b.textContent = value;
  var i = document.createElement('i');
  i.textContent = label;
  st.appendChild(b); st.appendChild(i);
  return st;
}

/* The links signing this man would ADD, as one line, or nothing at all.
   Blocked men get none: there is no decision to inform.
   Named rather than counted. "+2 links" is a number with no basketball in it,
   and "Duke men · 1997 draft class" is the reason somebody takes the cheaper
   guard. Two at most, because three is a paragraph inside a button. */
function chemHint(p, block){
  if (block || !run || !run.roster.length) return null;
  var pv;
  try { pv = R.previewSigning(run, p); } catch (e) { return null; }
  if (!pv || !pv.newLinks.length) return null;
  var el = document.createElement('span');
  el.className = 'chemline';
  var plus = document.createElement('b');
  plus.textContent = '+' + pv.delta.toFixed(2);
  el.appendChild(plus);
  var names = pv.newLinks.slice(0, 2).map(function(l){ return l.label; }).join(' · ');
  var more = pv.newLinks.length - 2;
  var t = document.createElement('i');
  t.textContent = names + (more > 0 ? ' +' + more + ' more' : '');
  el.appendChild(t);
  return el;
}

function playerTile(p, block, tooDear, idx, tightLeft){
  var off = !!block || tooDear;
  var b = document.createElement('button');
  b.className = 'ptile' + (off ? ' off' : '');
  b.disabled = off;
  b.style.animationDelay = Math.min(idx * 30, 260) + 'ms';

  var top = document.createElement('span');
  top.className = 'top';
  top.appendChild(posPills(p));
  var nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = p.n;
  top.appendChild(nm);
  b.appendChild(top);

  var money = document.createElement('span');
  money.className = 'money';
  var price = document.createElement('span');
  price.className = 'price' + (tooDear ? ' no' : '');
  price.textContent = '$' + p.p.toFixed(1) + 'M';
  money.appendChild(price);
  var deal = dealOf(p);
  if (deal && !block) {
    var d = document.createElement('span');
    d.className = 'deal ' + deal.key;
    d.textContent = deal.label;
    money.appendChild(d);
  }
  b.appendChild(money);

  /* WHAT USED TO BE HERE WAS "2011 Spurs", ON EVERY TILE. A board is one
     team-season, so that line said the same words as the two reels directly
     above it, once per player, and on a ten man board it was a column of the
     answer the wheel had just given. Measured, it cost about 18px a tile.

     What goes in its place is the one thing the board could not say and the
     player cannot work out: what this man does to the chemistry, BEFORE the
     signing. previewSigning reports only the NEW links, which is exactly the
     question ("what am I buying"), and most men on most boards make none, so
     the line is absent far more often than it is present and the tile is
     shorter on average than it was. */
  var chem = chemHint(p, block);
  if (chem) b.appendChild(chem);

  /* What signing him leaves for the last slot, on the tiles where that is the
     thing worth knowing. Null on every other pick and on every other board,
     so this line is absent far more often than it is present. */
  if (tightLeft !== null && tightLeft !== undefined) {
    var tl = document.createElement('span');
    tl.className = 'tight';
    tl.textContent = 'Leaves $' + tightLeft.toFixed(1) + 'M for your last pick.';
    b.appendChild(tl);
  }

  var stats = document.createElement('span');
  stats.className = 'stats';
  stats.appendChild(statBit(p.w.toFixed(1), 'win shares', true));
  stats.appendChild(statBit(String(p.pts), 'pts'));
  stats.appendChild(statBit(String(p.reb), 'reb'));
  stats.appendChild(statBit(String(p.ast), 'ast'));
  /* GAMES, BECAUSE THE PRICE NOW DEPENDS ON IT. A season is priced by how much
     of it the man actually played, so a 34 game year is cheap on purpose. Not
     saying so would leave the board full of bargains whose only explanation was
     invisible, which is the trap this whole change was meant to remove.
     ONLY WHEN IT IS WORTH REMARKING ON. The first cut flagged anything under 68
     games, which is 49% of the board: a mark on half the cards is not a remark,
     it is a second colour. Measured, the league's median is 68 games and its
     first quartile is 49, so under 45 is genuinely short rather than merely
     modern, and it lands on 20% of cards. */
  if (typeof p.g === 'number' && p.g > 0 && p.g < 45) {
    stats.appendChild(statBit(String(p.g), 'games', false, true));
  }
  b.appendChild(stats);

  var hardware = awardRow(p, 2);
  if (hardware) b.appendChild(hardware);

  if (block || tooDear) {
    var why = document.createElement('span');
    why.className = 'why';
    why.textContent = block ? (BLOCK_TEXT[block] || block)
      : '$' + (p.p - R.spendable(run)).toFixed(1) + 'M over what you can spend';
    b.appendChild(why);
  } else {
    b.onclick = function(){ sign(p); };
  }
  return b;
}


function sign(p){
  var before = run.roster.length;
  try {
    R.sign(run, p);
  } catch (err) {
    $('d-note').textContent = err.message;
    return;
  }
  save();
  /* Which slot he just went into, so the court and the pips can land that one
     chip rather than re-animating all six every time. */
  var justSlot = run.roster.length > before ? E.SLOTS[run.slotIndex[run.roster.length - 1]] : null;
  if (justSlot) stampDeal(p);
  activeTab = 'ALL';
  if (run.phase === R.PHASES.SEASON) { renderDraft(justSlot); toSeason(); return; }
  renderDraft(justSlot);
  /* BACK TO THE WHEEL. A signing happens from wherever on the board the man
     was, which on a phone is most of a screen down, and the next thing the
     game does is spin two reels that are up at the top. Left alone the player
     signs somebody and then watches an unexplained shimmer in the middle of a
     list. Smooth rather than instant, so it reads as the page following the
     decision rather than as a reload. */
  backToWheel();
  /* A beat to watch the chip land before the reels start again. */
  setTimeout(spin, 240);
}

/* The verdict on the man just signed, off the same dealOf his tile read, so
   the stamp can never say something the board did not. Restarted rather than
   queued: two quick signings show the second verdict, not the first one late. */
var stampTimer = null;
function stampDeal(p){
  var el = $('stamp');
  if (!el || !p) return;
  var d = dealOf(p);
  var key = d ? d.key : 'none';
  $('stamp-w').textContent = d ? d.label : 'Role player';
  $('stamp-s').textContent = p.n +' \u00B7 ' + money(p.p);
  el.className = 'stamp ' + key;
  void el.offsetWidth;
  el.className = 'stamp ' + key + ' on';
  clearTimeout(stampTimer);
  stampTimer = setTimeout(function(){ el.className = 'stamp ' + key; }, 1200);
  say(($('stamp-w').textContent) + '. ' + p.n + ' signed for ' + money(p.p) + '.');
}

function backToWheel(){
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  catch (e) { window.scrollTo(0, 0); }
}


var FIT_ROWS = [
  { key: 'spacing', name: 'Spacing',
    get: function(P){ return P.spacing; }, target: E.FIT.SPACING_FLOOR, good: E.FIT.SPACING_GOOD,
    /* A WORD, NOT A MULTIPLIER. The index is shooting against the player's own
       league, so "0.73x" was a ratio nobody could read at a glance. The bands
       are the meter's own floor and good line, so the word and the bar agree. */
    fmt: function(v){
      return v < E.FIT.SPACING_FLOOR ? 'Cramped'
        : v < 1 ? 'Okay' : v < E.FIT.SPACING_GOOD ? 'Good' : 'Elite';
    } },
  { key: 'rim', name: 'Rim',
    get: function(P){ return P.bestRim; }, target: E.FIT.RIM_ANCHOR, good: E.FIT.RIM_ANCHOR * 1.7,
    fmt: function(v){ return v.toFixed(1) + ' blk'; } },
  { key: 'creation', name: 'Passing',
    get: function(P){ return P.bestCreator; }, target: E.FIT.CREATOR, good: E.FIT.CREATOR * 1.5,
    fmt: function(v){ return v.toFixed(1) + ' ast'; } },
  { key: 'glass', name: 'Boards',
    get: function(P){ return P.reb; }, target: E.FIT.REB_TARGET, good: E.FIT.REB_TARGET * 1.2,
    fmt: function(v){ return v.toFixed(0) + ' reb'; } },
  { key: 'shots', name: 'Shots', invert: true,
    get: function(P){ return P.shots; }, target: E.FIT.SHOT_BUDGET, good: E.FIT.SHOT_BUDGET,
    fmt: function(v){ return v.toFixed(0) + '/' + E.FIT.SHOT_BUDGET; } },
];

function renderFit(){
  var box = $('r-fit'), card = $('fitcard');
  if (!box) return;
  box.textContent = '';
  if (card) card.style.display = run.roster.length ? '' : 'none';
  if (!run.roster.length) return;

  var f = R.fitNow(run, null);
  var P = f.profile;

  for (var i = 0; i < FIT_ROWS.length; i++) {
    var row = FIT_ROWS[i];
    var v = row.get(P);
    var part = f.parts[row.key] || 0;

    var el = document.createElement('div');
    el.className = 'fitrow';

    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = row.name;

    var meter = document.createElement('span');
    meter.className = 'meter';
    var bar = document.createElement('i');
    /* Scaled so the target line lands at 60% of the width, which leaves room to
       show being comfortably past it rather than pinning every good roster at
       the right edge. */
    var scale = row.target > 0 ? (v / row.target) * 60 : 0;
    bar.style.width = Math.max(2, Math.min(100, scale)) + '%';
    bar.className = part < -0.05 ? 'bad' : part > 0.05 ? '' : 'warn';
    var mark = document.createElement('u');
    mark.style.left = '60%';
    meter.appendChild(bar);
    meter.appendChild(mark);

    var val = document.createElement('span');
    val.className = 'val';
    val.textContent = row.fmt(v);

    el.appendChild(nm); el.appendChild(meter); el.appendChild(val);
    box.appendChild(el);
  }

  /* HOW FAST IT CAN PLAY, drafted toward rather than found out afterwards.
     The plan is picked at tip-off, and a fit a player cannot see while
     drafting is a dice roll rather than a strategy, which is this card's own
     argument about spacing. */
  var tagged = R.taggedRoster(run);
  var fits = E.paceFits(tagged, P);
  [['run', 'Run', fits.run], ['grind', 'Half court', fits.grind]].forEach(function(r){
    var el = document.createElement('div');
    el.className = 'fitrow pace ' + r[0];
    var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r[1];
    var meter = document.createElement('span'); meter.className = 'meter';
    var bar = document.createElement('i'); bar.style.width = Math.max(2, Math.round(r[2] * 100)) + '%';
    meter.appendChild(bar);
    var val = document.createElement('span'); val.className = 'val'; val.textContent = String(Math.round(r[2] * 100));
    el.appendChild(nm); el.appendChild(meter); el.appendChild(val);
    box.appendChild(el);
  });
  var sty = E.rosterStyle(tagged, P, fits);
  var styl = document.createElement('p');
  styl.className = 'styline';
  ['size', 'speed', 'range'].forEach(function(k){
    var t = document.createElement('span');
    t.className = 'sty' + (sty[k] === 'Balanced' ? ' mid' : '');
    t.textContent = sty[k] === 'Balanced' ? (k === 'size' ? 'Mid size' : k === 'speed' ? 'Mid pace' : 'Some range') : sty[k];
    styl.appendChild(t);
  });
  box.appendChild(styl);

  /* The identity, once there is enough roster for one to mean anything. */
  var line = document.createElement('p');
  line.className = 'sysline';
  if (run.roster.length < 4) {
    line.textContent = 'Sign a few more. Then this team gets an identity.';
  } else if (f.system) {
    var b = document.createElement('b');
    b.textContent = f.system.name;
    line.appendChild(b);
    /* THIS ROSTER'S OWN NAMES, not the system's dictionary entry: the story
       says who is doing it (E.systemStory). The blurb is the fallback for a
       cached engine that does not tell one. */
    line.appendChild(document.createTextNode(f.system.story || f.system.blurb));
  } else {
    var b2 = document.createElement('b');
    b2.textContent = 'No system';
    line.appendChild(b2);
    line.appendChild(document.createTextNode(
      NUMWORD(E.SLOTS.length, true)
        + ' good players. Nothing they do together.'
        + (E.systemStory ? ' ' + E.systemStory('none', tagged, P) : '')));
  }
  box.appendChild(line);
}

/* THE SYSTEM LINE on the season and results screens: the name, then the
   story in this roster's own names (E.systemStory). Hidden with no system,
   because "no identity" is already said by the tag and the fit card. */
function paintSysLine(el, sys){
  if (!el) return;
  el.textContent = '';
  el.hidden = !sys;
  if (!sys) return;
  var b = document.createElement('b');
  b.textContent = sys.name;
  el.appendChild(b);
  el.appendChild(document.createTextNode(sys.story || sys.blurb || ''));
}

function renderRoster(slotsEl){
  slotsEl.textContent = '';

  var filled = {};
  for (var i = 0; i < run.roster.length; i++) filled[run.slotIndex[i]] = run.roster[i];

  for (var s = 0; s < E.SLOTS.length; s++) {
    var p = filled[s];
    var row = document.createElement('div');
    row.className = 'slot' + (p ? '' : ' empty');

    var pos = document.createElement('div');
    pos.className = 'poswrap';
    pos.appendChild(posPill(E.SLOTS[s]));

    var who = document.createElement('div');
    who.className = 'who';
    if (p) {
      who.appendChild(document.createTextNode(p.n));
      var sub = document.createElement('small');
      sub.textContent = p.s + ' ' + E.teamName(p.t) + ' · ' + statLine(p);
      who.appendChild(sub);
      /* THE WHOLE LIST HERE, not the two a board tile has room for. This is the
         roster you built, read at leisure, and "MVP · Champion · All-NBA 1st"
         is the sentence a fan wants about the man they just signed. */
      var hardware = awardRow(p);
      if (hardware) who.appendChild(hardware);
    } else {
      who.textContent = 'open';
    }

    var cost = document.createElement('div');
    cost.className = 'cost';
    cost.textContent = p ? money(p.p) : '';

    row.appendChild(pos); row.appendChild(who); row.appendChild(cost);
    slotsEl.appendChild(row);
  }

  renderFit();

}
