// ── sharing ────────────────────────────────────────────────────────────────

/* A RUN NOBODY CAN SHOW ANYBODY IS A RUN THAT HAPPENED TO ONE PERSON. This is
 * the football game's share card rebuilt for basketball: two lines of text that
 * read before the link does, and a portrait card drawn to a canvas.
 *
 * Trailing slash, matching the canonical link. /hoops is a directory, so the
 * bare path is a 301 and this URL gets pasted into a chat by every share: a
 * redirect hop on each one, and two URLs for the same page for anything that
 * counts links.
 */
var SHARE_URL = 'https://runthe.gg/hoops/';

/* THE LINE THAT MAKES IT A DARE RATHER THAN A SCOREBOARD. A shared result with
   no invitation in it gives the person reading it nothing to do. Which dare
   depends on what happened: telling somebody who won 74 games to draft better
   is nonsense. */
function shareDare(out){
  /* THE DAILY'S DARE IS A DIFFERENT KIND OF QUESTION and it belongs on the
     card as well as in the text. Every other dare asks somebody to go and
     play a game, which they can answer with any roster at all. This one asks
     them to play the SAME spins, which is the only dare here with one
     answer, and it is the whole reason the mode exists. */
  if (run && run.daily) return 'Same ' + NUMWORD(E.SLOTS.length) + ' spins. Can you beat it?';
  if (out.isGOAT) return 'Can you win 74?';
  if (out.titleWon) return 'Can you win a ring?';
  return 'Can you build a better ' + NUMWORD(E.SLOTS.length) + '?';
}

/* THE DRAFT, AS A ROW OF SQUARES. A shared record says how the season went
 * and nothing about how it was built, and the build is the half this game is
 * about. So the text carries one square a man, in the order he fills the
 * floor, coloured by the same verdict his tile wore on the board: green for a
 * bargain, white for the going rate, red for paying for points, black for a
 * man too cheap for the question to mean anything. A friend who has played
 * reads it without a legend, and one who has not can see five decisions.
 *
 * THE SQUARES ARE DATA AND NOT PROSE, which is the one reason emoji are here
 * at all. A chat app shows text and nothing else, so a row of colours is the
 * only picture a shared result can carry, and it is the shape every daily
 * puzzle's share has taught people to read.
 *
 * Pure over its arguments so verify.mjs can lift it: the keys come from
 * dealOf, which needs the pool, and the page is what has the pool. */
var DEAL_SQ = { good: '\uD83D\uDFE9', fair: '\u2B1C', bad: '\uD83D\uDFE5', none: '\u2B1B' };
function gridLine(keys){
  return keys.map(function(k){ return DEAL_SQ[k] || DEAL_SQ.none; }).join('');
}

/* The roster in slot order, each with his verdict. One walk, read by the share
   text, the card and the results screen, so the three cannot disagree about a
   man. */
function draftCells(r){
  var filled = {};
  for (var i = 0; i < r.roster.length; i++) filled[E.SLOTS[r.slotIndex[i]]] = r.roster[i];
  return E.SLOTS.map(function(slot){
    var p = filled[slot] || null;
    var d = p ? dealOf(p) : null;
    return { slot: slot, p: p, key: d ? d.key : 'none', label: d ? d.label : 'Role player' };
  });
}

/* THE POSTSEASON, A SERIES AT A TIME. "Lost in the conference finals" says
   where it ended; 4-1, 4-3, 2-4 says how, and a 4-3 is a Game 7 somebody
   played. Null for a run that never got there, because a line reading
   nothing is a line that looks broken. */
var ROUND_SHORT = { 'Play-In': 'Play-in', 'First Round': 'R1',
  'Conference Semifinals': 'R2', 'Conference Finals': 'CF', 'NBA Finals': 'Finals' };
function pathLine(rounds, won){
  if (!rounds || !rounds.length) return null;
  var bits = rounds.map(function(r){
    var name = ROUND_SHORT[r.round] || r.round;
    if (r.round === 'Play-In') return name + ' ' + (r.won ? 'W' : 'L');
    return name + ' ' + r.yourWins + '-' + r.oppWins;
  });
  return bits.join(' \u00B7 ') + (won ? ' \uD83C\uDFC6' : '');
}

/* WHICH GAME THIS WAS, IN ONE LINE, and it is derived rather than written.
 * The football game's share card fell through to "Classic Mode. Six spins,
 * one roster" three separate times, once per mode added after it, because the
 * tagline was a literal with no branch to forget. Every mode here gets its
 * answer from the run, so a fourth one cannot inherit the third one's words.
 *
 * It is one sentence at 25px across 928px of card, so it has to stay short:
 * the club's own name is already the longest thing that goes in it.
 */
function cardTag(r){
  /* EVERY COUNT HERE IS THE SLOT LIST, because a tagline is the one string on
     this card nobody re-reads and the football game's own card fell through to
     "Classic Mode. Six spins, one roster" three separate times. A literal has
     no branch to forget AND no number to update. */
  var n = NUMWORD(E.SLOTS.length);
  if (r && r.daily) return 'Daily, day ' + r.daily + '. Same ' + n + ' spins for everyone.';
  if (r && r.club) return 'One franchise: ' + E.team(r.club).full + '. ' + NUMWORD(E.SLOTS.length, true) + ' seasons of it.';
  if (r && r.era) return (ERA_NAMES[r.era] || r.era) + '. ' + NUMWORD(E.SLOTS.length, true)
    + ' from one decade.';
  return NUMWORD(E.SLOTS.length, true) + ' NBA seasons. One cap. 82 games.';
}

function shareText(out){
  var head = 'Run The Floor';
  /* The mode goes in the FIRST line, beside the name, because that is the
     line a chat app shows as the preview and the one somebody reads before
     deciding whether to open anything. A 58-24 off one franchise and a 58-24
     off the whole league are two different results. */
  var mode = modeLabel(run);
  if (run && run.daily) head += ', day ' + run.daily;
  else if (mode) head += ', ' + mode;
  var shape = out.structure && out.structure.archetype ? out.structure.archetype.name : null;
  var sys = shape && shape !== 'No Identity' ? ' ' + shape + '.' : '';
  var line = out.wins + '-' + out.losses + '. ' + headline(out) + '.'
    + sys + ' Rating ' + out.rating.toFixed(0) + '.';
  /* A DAILY DARES DIFFERENTLY, and that is the whole of why it exists. The
     ordinary dare asks somebody to go and play a game; this one asks them to
     play the SAME game, which is a question with an answer. The streak is
     read off the stored day rather than off the run, because the run does
     not know how many days came before it. */
  var d = (run && run.daily) ? dailyState() : null;
  var dare = d ? DAILY_DARE
    + (d.streak > 1 ? '\n' + d.streak + ' days in a row.' : '')
    : shareDare(out);
  /* The grid goes under the result and above the dare, which is where every
     daily puzzle's share puts it: the verdict, then the picture, then the
     invitation. */
  var grid = gridLine(draftCells(run).map(function(c){ return c.key; }));
  var path = run.playoffs ? pathLine(run.playoffs.rounds, run.playoffs.won) : null;
  return head + '\n' + line + '\n' + grid + (path ? '\n' + path : '')
    + '\n' + dare + '\n' + SHARE_URL;
}

/* THE CARD, DRAWN TO A CANVAS AT 1080x1350.
 *
 * Portrait 4:5 because that is what survives being posted anywhere: it is the
 * tall limit on most feeds and it still reads as a thumbnail in a message.
 *
 * EVERY VERTICAL POSITION IS A NAMED CONSTANT rather than an accumulator. The
 * football card's first version added up as it went and its footer landed on
 * top of its stats row, printing one line straight through another. With the
 * anchors written down, a six man card always lands the same and the gaps
 * between blocks can be read off without running it.
 */
/* THE CARD'S TAIL IS DERIVED FROM THE ROSTER, and the reason is the football
 * game's share card, whose own section records every y between the two rules
 * being a constant written for a six man roster: the day that mode drafted
 * twelve, the seventh row printed THROUGH the closing rule and the next five
 * on top of the footer, and it still rendered, still saved and still shared.
 *
 * THIS GAME LOST A ROW RATHER THAN GAINING SIX, so the failure is the quiet
 * one in the other direction: nothing overlaps, the card simply carries 92px
 * of empty stock between the last man and the rule under him, on every card
 * anybody posts. Nothing throws and no check that reads the layout function's
 * own numbers can see it, because they still add up.
 *
 * So the row pitch and the type are fixed and everything AFTER the roster
 * hangs off where the roster actually ends. A card at five men is byte for
 * byte the six man card with one row taken out of the middle. */
var CARD = (function(){
  var PAD = 76, ROWS = 552, ROW = 92;
  var n = (E && E.SLOTS) ? E.SLOTS.length : 5;
  /* The last man's baseline, and then the gap the closing rule always sat at
     under it: 1064 against a six man card's last baseline of 1012. */
  var lastBaseline = ROWS + (n - 1) * ROW;
  var RULE2 = lastBaseline + 52;
  return {
    W: 1080, H: RULE2 + 286, PAD: PAD,
    TITLE: 96, TAG: 126,
    REC: 372, VERDICT: 436, PATH: 476,
    RULE1: 496,
    ROWS: ROWS, ROW: ROW,
    RULE2: RULE2,
    STAT: RULE2 + 86, STAT_LABEL: RULE2 + 128,
    DARE: RULE2 + 194,
    LINK_T: RULE2 + 218, LINK_H: 58,
    KEEL: 10
  };
})();

function hexAt(hex, a){
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(function(c){ return c + c; }).join('');
  var n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* WHOSE COLORS THE CARD WEARS. Six players from six different clubs, so there
   is no one franchise to take them from the way the football game does in One
   Franchise mode. The anchor is the club of the best man on the roster by win
   shares: he is the reason the season went how it went, and it means two people
   with the same record still get cards that look like their own team. */
function cardClub(){
  var best = null;
  for (var i = 0; i < run.roster.length; i++) {
    if (!best || run.roster[i].w > best.w) best = run.roster[i];
  }
  return best ? best.t : null;
}

function drawShareCard(){
  var c = document.createElement('canvas');
  c.width = CARD.W; c.height = CARD.H;
  var x = c.getContext('2d');
  var out = run.outcome;
  var code = cardClub();
  var skin = code ? E.clubSkin(code) : { bg: '#7a2f0a', accent: '#f0782d', on: '#ffffff' };
  var PAD = CARD.PAD, mid = CARD.W / 2;

  // Ground: near-black with one wash of the club's color at the top.
  x.fillStyle = '#0d1117'; x.fillRect(0, 0, CARD.W, CARD.H);
  var g = x.createRadialGradient(mid, -150, 40, mid, -150, CARD.W * 1.15);
  g.addColorStop(0, skin.bg); g.addColorStop(1, 'rgba(13,17,23,0)');
  x.globalAlpha = 0.75; x.fillStyle = g; x.fillRect(0, 0, CARD.W, CARD.H * 0.6); x.globalAlpha = 1;

  /* THE HALF COURT, VERY FAINTLY, UNDER EVERYTHING. The same lines the game
     draws on its own court. At these alphas it is texture rather than a
     picture, which is the point: it has to say basketball without competing
     with a 210px record sitting on top of it. */
  x.save();
  x.strokeStyle = hexAt(skin.accent, 0.09); x.lineWidth = 3;
  var cy = 300, keyW = 300, keyH = 340;
  x.strokeRect(mid - keyW / 2, cy, keyW, keyH);                       // the paint
  x.beginPath(); x.arc(mid, cy + keyH, 92, 0, Math.PI * 2); x.stroke(); // free throw circle
  x.beginPath(); x.arc(mid, cy + 62, 250, 0.18 * Math.PI, 0.82 * Math.PI); x.stroke();  // the arc
  x.beginPath(); x.arc(mid, cy + 62, 20, 0, Math.PI * 2); x.stroke();  // the rim
  x.restore();

  // The keel: one bar of the club's second color down the left edge.
  x.fillStyle = skin.accent; x.fillRect(0, 0, CARD.KEEL, CARD.H);

  x.textAlign = 'left';
  x.fillStyle = '#eef2f9';
  x.font = '700 42px Archivo, system-ui, sans-serif';
  x.fillText('RUN THE FLOOR', PAD, CARD.TITLE);
  x.fillStyle = hexAt('#94a3b8', 0.95);
  x.font = '600 25px Archivo, system-ui, sans-serif';
  /* Clipped rather than trusted to fit. The longest franchise name in the
     table is what decides this line's width and nothing in the source says
     so, which is exactly how a name runs off the edge of a card nobody
     rendered before shipping. */
  x.fillText(clip(x, cardTag(run), CARD.W - PAD * 2), PAD, CARD.TAG);

  // The record, which is the whole point of the card.
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  x.font = '700 210px Archivo, system-ui, sans-serif';
  x.fillText(out.wins + '-' + out.losses, mid, CARD.REC);
  x.fillStyle = out.titleWon ? '#f2c14e' : skin.accent;
  x.font = '700 44px Archivo, system-ui, sans-serif';
  x.fillText(headline(out).toUpperCase(), mid, CARD.VERDICT);
  /* How it went, a series at a time, quietly under how it ended. Drawn
     without the trophy glyph, because an emoji in a canvas is whatever the
     machine's emoji font is and the verdict above already says champions. */
  var path = run.playoffs ? pathLine(run.playoffs.rounds, false) : null;
  if (path) {
    x.fillStyle = hexAt('#94a3b8', 0.95);
    x.font = '700 26px Archivo, system-ui, sans-serif';
    x.fillText(clip(x, path.toUpperCase(), CARD.W - PAD * 2), mid, CARD.PATH);
  }

  var rule = function(y){
    x.fillStyle = hexAt(skin.accent, 0.3);
    x.fillRect(PAD, y, CARD.W - PAD * 2, 2);
  };
  rule(CARD.RULE1);

  /* THE ROSTER, in the order it fills the floor rather than the order it was
     signed, so two cards of the same roster read the same way. Each carries the
     colour its position wears everywhere else in the game. */
  var cells = draftCells(run);
  for (var i = 0; i < cells.length; i++) {
    var slot = cells[i].slot, p = cells[i].p;
    var y = CARD.ROWS + i * CARD.ROW;
    x.textAlign = 'left';
    // the position chip
    x.fillStyle = POS_HEX[slot] || '#6366f1';
    roundRect(x, PAD, y - 34, 78, 44, 9); x.fill();
    x.fillStyle = '#0d1117';
    x.font = '700 25px Archivo, system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillText(slot, PAD + 39, y);
    if (!p) continue;
    x.textAlign = 'left';
    x.fillStyle = '#eef2f9';
    x.font = '700 38px Archivo, system-ui, sans-serif';
    x.fillText(clip(x, p.n, 560), PAD + 100, y);
    x.fillStyle = '#94a3b8';
    x.font = '600 26px Archivo, system-ui, sans-serif';
    x.fillText(p.s + ' ' + E.teamName(p.t), PAD + 100, y + 33);
    x.textAlign = 'right';
    x.fillStyle = skin.accent;
    x.font = '700 34px Archivo, system-ui, sans-serif';
    x.fillText('$' + p.p.toFixed(1) + 'M', CARD.W - PAD, y);
    /* THE VERDICT HIS TILE WORE, under his price, in the tile's own colours.
       It is the card's version of the square row in the share text, and it
       is the line that says whether this roster was built or bought. */
    x.fillStyle = DEAL_HEX[cells[i].key];
    x.font = '800 20px Archivo, system-ui, sans-serif';
    x.fillText(cells[i].label.toUpperCase(), CARD.W - PAD, y + 33);
  }

  rule(CARD.RULE2);

  // Three numbers, evenly spaced, each with its label underneath.
  var spend = E.CONSTANTS.CAP_MUSD - R.remaining(run);
  var chemBonus = (out.chemistry && typeof out.chemistry.bonus === 'number')
    ? out.chemistry.bonus : 0;
  var stats = [
    [out.rating.toFixed(0), 'TEAM RATING'],
    /* .bonus, not the object. Chemistry travels as {bonus, links, ...} and
       every other reader in this file already knew that; this one did not, and
       the throw was swallowed by the catch below, so the card silently became
       no card at all. */
    [(chemBonus >= 0 ? '+' : '') + chemBonus.toFixed(2), 'CHEMISTRY'],
    ['$' + spend.toFixed(0) + 'M', 'SPENT OF $' + E.CONSTANTS.CAP_MUSD + 'M']
  ];
  x.textAlign = 'center';
  for (var s2 = 0; s2 < stats.length; s2++) {
    var cx = PAD + (CARD.W - PAD * 2) * (s2 + 0.5) / stats.length;
    x.fillStyle = '#eef2f9';
    x.font = '700 50px Archivo, system-ui, sans-serif';
    x.fillText(stats[s2][0], cx, CARD.STAT);
    x.fillStyle = '#94a3b8';
    x.font = '700 21px Archivo, system-ui, sans-serif';
    x.fillText(stats[s2][1], cx, CARD.STAT_LABEL);
  }

  x.fillStyle = '#94a3b8';
  x.font = '600 27px Archivo, system-ui, sans-serif';
  x.fillText(shareDare(out), mid, CARD.DARE);

  // The link, as a pill, because that is where the dare gets accepted.
  var pillW = 430, pillX = mid - pillW / 2;
  x.fillStyle = hexAt(skin.accent, 0.16);
  roundRect(x, pillX, CARD.LINK_T, pillW, CARD.LINK_H, CARD.LINK_H / 2); x.fill();
  x.strokeStyle = hexAt(skin.accent, 0.5); x.lineWidth = 2; x.stroke();
  x.fillStyle = '#eef2f9';
  x.font = '700 28px Archivo, system-ui, sans-serif';
  x.fillText('RUNTHE.GG/HOOPS', mid, CARD.LINK_T + 39);

  return c;
}

/* The position colours as flat hex. The page paints these as gradients off CSS
   custom properties, which a canvas cannot read, so the values live here too.
   verify.mjs asserts the two agree. */
/* The deal chip's text colours, flat, for the same reason. */
var DEAL_HEX = { good: '#4ade80', fair: '#94a3b8', bad: '#fca5a5', none: '#64748b' };
var POS_HEX = { PG: '#3b82f6', SG: '#06b6d4', SF: '#22c55e', PF: '#f59e0b',
  C: '#ef4444', G: '#6366f1', F: '#84cc16' };

/* WHAT THE SQUARES COUNTED, in words, because the results screen is where a
   player learns what the row in their share text means. */
var GRID_WORDS = { good: ['bargain', 'bargains'], fair: ['at the going rate', 'at the going rate'],
  bad: ['overpay', 'overpays'], none: ['role player', 'role players'] };
function renderDraftGrid(){
  var box = $('o-grid');
  if (!box) return;
  box.textContent = '';
  if (!run || !run.roster || run.roster.length < E.SLOTS.length) return;
  var cells = draftCells(run), n = {};
  cells.forEach(function(c){ n[c.key] = (n[c.key] || 0) + 1; });
  var sq = document.createElement('span');
  sq.className = 'sq';
  sq.textContent = gridLine(cells.map(function(c){ return c.key; }));
  sq.setAttribute('aria-hidden', 'true');
  var ct = document.createElement('span');
  ct.className = 'ct';
  /* Each count is one unbreakable piece, so a narrow phone wraps BETWEEN
     counts rather than leaving "role player" alone on a line under "1". */
  ['good', 'fair', 'bad', 'none'].filter(function(k){ return n[k]; }).forEach(function(k, i){
    if (i) ct.appendChild(document.createTextNode(' \u00B7 '));
    var b = document.createElement('span');
    b.style.whiteSpace = 'nowrap';
    b.textContent = n[k] + ' ' + GRID_WORDS[k][n[k] === 1 ? 0 : 1];
    ct.appendChild(b);
  });
  box.appendChild(sq);
  box.appendChild(ct);
}

function roundRect(x, left, top, w, h, r){
  x.beginPath();
  x.moveTo(left + r, top);
  x.arcTo(left + w, top, left + w, top + h, r);
  x.arcTo(left + w, top + h, left, top + h, r);
  x.arcTo(left, top + h, left, top, r);
  x.arcTo(left, top, left + w, top, r);
  x.closePath();
}

/* A long name has to stop rather than run under the price beside it. */
function clip(x, text, max){
  if (x.measureText(text).width <= max) return text;
  var t = text;
  while (t.length > 1 && x.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

var toastTimer = null;
/* One place that speaks. Cleared first, because a live region only announces a
   CHANGE and setting it to the text it already holds says nothing. */
function say(msg){
  var el = $('say');
  if (!el) return;
  el.textContent = '';
  setTimeout(function(){ el.textContent = msg; }, 60);
}

function toast(msg){
  var el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('on'); }, 2200);
}

var canvasBlob = function(c){
  return new Promise(function(res){ c.toBlob(res, 'image/png'); });
};

/* THREE WAYS DOWN, AND THE FIRST ONE THAT WORKS WINS. A phone gets the share
   sheet with the picture in it. A desktop browser with a share sheet but no
   file support gets the text. Everything else gets the text on the clipboard
   and the picture as a download, which is the path that has to work because it
   is the one a laptop takes. */
function shareRun(){
  if (!run || !run.outcome) return;
  var text = shareText(run.outcome);
  /* THE FONTS HAVE TO BE IN BEFORE ANYTHING IS MEASURED, or the card lays
     itself out against a fallback face and every column lands in the wrong
     place. */
  var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

  return ready.then(function(){
    /* A CARD THAT FAILS TO DRAW MUST NOT EAT ITS OWN REASON. The first version
       returned null here and said nothing, so a typo in one field turned into
       "the picture just does not appear", which took a patched build to find.
       The share still goes ahead as text, which is the right fallback, but the
       throw goes to the console where somebody can read it. */
    try {
      return canvasBlob(drawShareCard());
    } catch (e) {
      if (window.console && console.error) console.error('share card failed to draw', e);
      return null;
    }
  }).then(function(blob){
    var file = null;
    try { if (blob) file = new File([blob], 'run-the-floor.png', { type: 'image/png' }); }
    catch (e) { file = null; }

    var sheet;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      sheet = navigator.share({ text: text, files: [file] });
    } else if (navigator.share) {
      sheet = navigator.share({ text: text });
    } else {
      sheet = Promise.reject(new Error('no share sheet'));
    }

    /* ONE BLOB, RENDERED ONCE, CARRIED INTO THE FALLBACK. The first version
       drew the card a second time down here and the download never fired: by
       then the click that started all this had been through two promise turns,
       and a programmatic download wants a live user gesture. Reusing the blob
       is fewer moving parts AND it is the picture the share sheet was offered,
       so the two paths cannot hand out different cards. */
    return sheet.catch(function(err){
      if (err && err.name === 'AbortError') return;   // they closed the sheet
      copyAndDownload(text, blob);
    });
  });
}

/* The path a laptop takes, and therefore the one that has to work: the text on
   the clipboard and the picture as a file. The anchor is put INTO the document
   before it is clicked, because a detached one is ignored in some browsers,
   and taken out again straight after. */
function copyAndDownload(text, blob){
  var save = function(){
    if (!blob) return;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'run-the-floor.png';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
      .then(function(){ toast(blob ? 'Copied, and the card is downloading' : 'Copied'); save(); })
      .catch(function(){ toast('Could not copy'); save(); });
  }
  toast(blob ? 'Downloading the card' : 'Could not copy');
  save();
}
