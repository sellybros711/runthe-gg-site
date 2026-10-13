/* Run The Floor: the closet.
 *
 * window.RTF_CLOSET. Draws one look's pane (off court or on court) into a
 * host, for the Look sheet in hoops/career-ui.js. The record is
 * hoops/wardrobe.js and the catalogue hoops/catalog.js; this file only draws
 * and presses.
 *
 * WHAT A PRESS DOES. A piece he owns goes on at once and is saved: there is
 * no Save button to forget. A piece he does not own is TRIED ON: the figure
 * wears it, the panel says which pack holds it and the odds of one open
 * pulling it, and "Back to my fit" takes it off. Nothing he does not own is
 * ever saved (wardrobe.js refuses it), so trying on is free and safe.
 *
 * EVERY PIECE IS PACK ONLY (Run The Tour's rule): there is no Buy. The odds
 * are hoops/packs.js chance(), the arithmetic an open rolls, so the "1 in N"
 * on screen can never disagree with the pack.
 *
 * THE LOOK IS THE PACK ART'S: the figure stands on a stand in rays of the
 * piece's rarity, and every tile is a small foil card with a crimped top.
 *
 * THE PREVIEW IS THE PRODUCT: the figure is his own player, his body and his
 * face, in the piece. Never a mannequin.
 *
 * The CSS is injected by this file, so it caches with it (store.js's reason).
 */
(function(){
'use strict';

var API_VERSION = 2;
var W = window.RTF_WARD, CAT = window.RTF_CATALOG, X = window.RTF_ECON, B = window.RTF_BALLER, PK = window.RTF_PACKS;
var RCOL = { common: '#aeb4bf', rare: '#5b9bff', epic: '#b47cff', legendary: '#f2c23a' };
/* the pixel art is hoops/itemart.js; a page without it draws the old swatch */
function art(){ return window.RTF_ART || null; }
function slotIcon(s){ var A = art(); return A ? '<img class="cl-si" alt="" src="' + A.iconURL({ id: 'slot:' + s, slot: s, k: '', c: ['#c9ccd6', '#7d8396'] }) + '">' : ''; }

var LABEL = {
  hat: 'Hat', eyes: 'Glasses', top: 'Top', outer: 'Jacket', bottom: 'Pants', shoes: 'Shoes', socks: 'Socks',
  chain: 'Chain', watch: 'Watch', bag: 'Bag', phones: 'Headphones', held: 'In hand',
  band: 'Headband', goggles: 'Goggles', guard: 'Mouthguard', sleeveL: 'Left sleeve', sleeveR: 'Right sleeve',
  wrist: 'Wristbands', tape: 'Tape', tights: 'Tights', knee: 'Knees', ankle: 'Ankles', csocks: 'Socks', under: 'Undershirt', idle: 'Idle',
  plate: 'Nameplate', bg: 'Card backdrop',
};
/* the two slots that dress the player CARD rather than the man (catalog.js NOWEAR) */
var CARD_SLOT = { plate: 1, bg: 1 };
/* a slot the starter wardrobe fills cannot be left bare: "Starter" is its empty */
var STARTER = { top: 1, bottom: 1, shoes: 1 };
var RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };
/* an exclusive is never sold: its tile says how it is earned instead */
var EARN = { draft_first: 'Go 1st overall', title: 'Win a title', hof: 'Hall of Fame', career_first: 'First career' };
function earnText(it){ var m = /^pass:(\d+)$/.exec(it.earn || ''); if (m) return 'Floor Pass, Season ' + m[1]; return /^drop:/.test(it.earn) ? 'Finish the drop' : EARN[it.earn] || 'Earned'; }

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return Math.round(n).toLocaleString('en-US'); }
/* a tile is half a phone wide: 275,000 does not fit beside the rarity, 275K does */
function short(n){ return n >= 10000 ? Math.round(n / 1000) + 'K' : money(n); }

/* the pane remembers where it was between redraws */
var view = { street: { slot: 'top', owned: false }, court: { slot: 'band', owned: false } };

var RLABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
/* "1 in 214": the odds of one open, never shown as a percent under 1 */
function oneIn(c){ var n = Math.max(1, Math.round(1 / c)); return '1 in ' + money(n); }
/* the try-on's pack panel: which pack holds it and how often one open pulls it */
function packHtml(id, toShop){
  var it = CAT.item(id);
  if (!it) return '';
  if (it.excl) return '<div class="cl-pk is-earn"><span class="cl-pkt"><b>' + esc(earnText(it)) + '</b><i>Earned, never in a pack</i></span></div>';
  var b = PK && PK.best ? PK.best(id) : null;
  if (!b) return '<div class="cl-pk is-off"><span class="cl-pkt"><b>Out of season</b><i>Its pack comes back with its drop</i></span></div>';
  var P = PK.packOf(b.pack);
  return '<div class="cl-pk" style="--pa:' + (PACKCOL[b.pack] || PACKCOL.street)[0] + '">'
    + '<span class="cl-pkart"><span class="cl-pkrays"></span>' + (art() ? art().pack(b.pack, 'cl-pkimg') : '') + '</span>'
    + '<span class="cl-pkt"><i>Best odds</i><b>' + esc(P.name) + '</b><em>' + oneIn(b.chance) + ' an open</em></span>'
    + (toShop ? '<button type="button" class="k-btn cl-topacks">Open packs</button>' : '') + '</div>';
}
var PACKCOL = { street: ['#e8660f'], league: ['#3a6fd8'], hof: ['#e3a92f'], season: ['#8a4fd4'] };
function priceText(it, owned){
  if (owned) return it.free ? 'Starter' : 'Owned';
  if (it.excl) return 'Earned';
  return 'In packs';
}
function itemsFor(ctx, slot){
  return CAT.ITEMS.filter(function(it){ return it.slot === slot && CAT.fits(it, ctx); });
}

/* host: an element. o: { ctx, look, c1, c2, num } */
function pane(host, o){
  if (!W || !CAT || !X || !B) { host.innerHTML = '<p class="cash">The closet is not available right now.</p>'; return; }
  var ctx = o.ctx === 'court' ? 'court' : 'street', v = view[ctx];
  var slots = W.slotsOf(ctx);
  if (slots.indexOf(v.slot) < 0) v.slot = slots[0];
  /* what is on the figure: the saved fit, with any try-on laid over it */
  var trying = null;

  function draw(){
    var om = W.ownedMap(), lo = W.loadout(ctx), shown = Object.assign({}, lo);
    if (trying) shown[trying.slot] = trying.id;
    /* the figure stands still while he dresses, and moves while he picks an idle */
    var moving = v.slot === 'idle';
    var fo = W.dress({ c1: o.c1, c2: o.c2, num: o.num, pose: 'stand', scale: 4, still: !moving, sharp: true }, ctx, shown, true);
    if (moving && W.idle) fo = W.idle(fo, ctx, shown, true);
    var fig = B.img(o.look, fo, 'cl-figimg');
    /* picking a nameplate or a backdrop shows the card it goes on */
    var cardNow = CARD_SLOT[v.slot] && window.RTF_CARD && window.RTF_CARD.html;
    if (cardNow) {
      var me = window.RTF_CARD.mine ? window.RTF_CARD.mine() : null;
      fig = window.RTF_CARD.html(Object.assign({ look: o.look, name: 'Your Player', num: o.num, pos: '', c1: o.c1, c2: o.c2, rep: 0 }, me || {}, { look: o.look }), shown, { size: 'mini', tryOn: true });
    }
    var nw = CAT.NOWEAR || {};
    var wearing = slots.map(function(s){ var it = nw[s] ? null : CAT.item(shown[s]); return it ? it.name : null; }).filter(Boolean);
    var coins = window.RTF_WALLET ? window.RTF_WALLET.balance() : 0;
    var signedIn = !!(window.RTF_AUTH && window.RTF_AUTH.state && window.RTF_AUTH.state().signedIn);

    var chips = slots.map(function(s){
      var n = itemsFor(ctx, s).filter(function(it){ return om[it.id] && !it.free; }).length;
      var on = s === v.slot;
      return '<button type="button" class="k-chip cl-slot' + (shown[s] ? ' has' : '') + '" data-slot="' + s + '" aria-pressed="' + on + '">' + slotIcon(s) + esc(LABEL[s] || s) + (n ? ' <i>' + n + '</i>' : '') + '</button>';
    }).join('');

    var list = itemsFor(ctx, v.slot).filter(function(it){ return !v.owned || om[it.id]; });
    list.sort(function(a, b){
      return (om[b.id] ? 1 : 0) - (om[a.id] ? 1 : 0) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name);
    });
    /* THE CHASE: how much of this slot he has, by rarity, the way a set's
       progress reads in a pack game */
    var forSlot = itemsFor(ctx, v.slot).filter(function(it){ return !it.free; });
    var have = forSlot.filter(function(it){ return om[it.id]; }).length;
    var segs = ['common', 'rare', 'epic', 'legendary'].map(function(r){
      var t = forSlot.filter(function(it){ return it.rarity === r; }), h = t.filter(function(it){ return om[it.id]; }).length;
      return t.length ? '<i style="flex:' + t.length + ';--rc:' + RCOL[r] + ';--f:' + Math.round(100 * h / t.length) + '%" title="' + RLABEL[r] + ' ' + h + ' of ' + t.length + '"></i>' : '';
    }).join('');
    var tryIt = trying ? CAT.item(trying.id) : null;
    var stageCol = tryIt ? RCOL[tryIt.rarity] : '#f2c23a';
    var none = '<button type="button" class="cl-tile cl-none' + (!shown[v.slot] ? ' is-on' : '') + '" data-id="">'
      + '<span class="cl-sw"></span><span class="cl-n">' + (CARD_SLOT[v.slot] ? 'House' : STARTER[v.slot] && ctx === 'street' ? 'Starter' : 'Nothing') + '</span><span class="cl-p">' + (CARD_SLOT[v.slot] || (STARTER[v.slot] && ctx === 'street') ? 'Always yours' : 'Take it off') + '</span></button>';
    var tiles = list.map(function(it){
      var own = !!om[it.id], on = shown[v.slot] === it.id;
      var a = it.c[0], b = it.c[1] || it.c[0];
      return '<button type="button" class="cl-tile r-' + it.rarity + (it.excl ? ' excl' : '') + (own ? ' own' : ' lock') + (on ? ' is-on' : '') + '" data-id="' + it.id + '" aria-pressed="' + on + '">'
        + '<span class="cl-sw" style="--a:' + a + ';--b:' + b + ';--rc:' + RCOL[it.rarity] + '">' + (art() ? art().icon(it, 'cl-ic') : '') + '</span>'
        + '<span class="cl-n">' + esc(it.name) + '</span>'
        + '<span class="cl-p">' + (it.excl && !own ? '<b class="cl-x">' + esc(earnText(it)) + '</b>' : '<b class="cl-r">' + it.rarity + '</b>' + esc(priceText(it, own))) + '</span>'
        + (own ? '<span class="cl-ck" aria-hidden="true"></span>' : '') + '</button>';
    }).join('');

    var fits = W.fits().filter(function(f){ return f.ctx === ctx; });
    var fitsHtml = fits.map(function(f){
      return '<span class="cl-fit"><button type="button" class="k-chip" data-fit="' + f.id + '">' + esc(f.n) + '</button><button type="button" class="cl-fitx" data-fitx="' + f.id + '" aria-label="Delete ' + esc(f.n) + '">x</button></span>';
    }).join('');

    /* THE FIGURE STAYS ON SCREEN. A press low in the list is a try-on the
       player has to see, so the figure and the slots are pinned to the top
       of the sheet while the pieces scroll under them. */
    host.innerHTML = '<div class="cl"><div class="cl-head">'
      + '<div class="cl-top"><div class="cl-fig' + (cardNow ? ' cl-figcard' : '') + (tryIt ? ' is-try' : '') + '" style="--sc:' + stageCol + '"><span class="cl-srays" aria-hidden="true"></span><span class="cl-spot" aria-hidden="true"></span>' + fig + (tryIt ? '<span class="cl-stag">' + RLABEL[tryIt.rarity] + '</span>' : '') + '</div><div class="cl-side">'
      + '<div class="cl-coins">' + (art() ? art().coin('cl-coin') : '') + '<b>' + money(coins) + '</b> coins</div>'
      + '<div class="cl-wear">' + (wearing.length ? wearing.length + ' piece' + (wearing.length === 1 ? '' : 's') + ' on' : (ctx === 'street' ? 'Starter clothes' : 'The plain uniform')) + '</div>'
      + (tryIt ? '<div class="cl-try r-' + tryIt.rarity + '" style="--rc:' + RCOL[tryIt.rarity] + '"><span class="cl-tryn">Trying on <b>' + esc(tryIt.name) + '</b></span>' + packHtml(trying.id, !!o.toShop) + '<button type="button" class="cl-back">Back to my fit</button></div>' : '')
      + '</div></div>'
      + '<div class="cl-slots" role="group" aria-label="Slots">' + chips + '</div></div>'
      + '<div class="cl-bar"><span class="cl-bl"><span class="k k-label">' + esc(LABEL[v.slot] || v.slot) + '</span>' + (forSlot.length ? '<span class="cl-col"><b>' + have + '</b> of ' + forSlot.length + ' collected</span>' : '') + '</span>'
      + '<button type="button" class="cl-own" aria-pressed="' + v.owned + '">' + (v.owned ? 'Showing what you own' : 'Showing everything') + '</button></div>'
      + (forSlot.length ? '<div class="cl-cbar" aria-hidden="true">' + segs + '</div>' : '')
      + '<div class="cl-grid">' + none + tiles + (list.length ? '' : '<p class="cl-empty">Nothing here yet. Every piece comes from a pack.</p>') + '</div>'
      + (!signedIn ? '<p class="cl-guest">Sign in to earn coins and keep what you pull.</p>' : '')
      + '<div class="cl-fits"><span class="k k-label">Outfits</span><div class="cl-fitrow">' + fitsHtml
      + (fits.length < W.MAX_FITS ? '<button type="button" class="k-chip cl-savefit">Save this fit</button>' : '') + '</div></div>'
      + histHtml()
      + '</div>';
    wire();
  }

  function wire(){
    host.querySelectorAll('[data-slot]').forEach(function(b){ b.onclick = function(){ v.slot = b.getAttribute('data-slot'); trying = null; draw(); }; });
    host.querySelectorAll('.cl-tile').forEach(function(b){
      b.onclick = function(){
        var id = b.getAttribute('data-id') || null;
        if (!id) { trying = null; W.equip(ctx, v.slot, null); draw(); return; }
        if (W.owns(id)) { trying = null; W.equip(ctx, v.slot, id); }
        else trying = { slot: v.slot, id: id };
        draw();
      };
    });
    /* there is no Buy: the try-on's button takes him to the packs */
    var tp = host.querySelector('.cl-topacks');
    if (tp) tp.onclick = function(){ if (o.toShop) o.toShop(trying && trying.id); };
    var back = host.querySelector('.cl-back');
    if (back) back.onclick = function(){ trying = null; draw(); };
    var own = host.querySelector('.cl-own');
    if (own) own.onclick = function(){ v.owned = !v.owned; draw(); };
    host.querySelectorAll('[data-fit]').forEach(function(b){ b.onclick = function(){ trying = null; W.applyFit(b.getAttribute('data-fit')); draw(); }; });
    host.querySelectorAll('[data-fitx]').forEach(function(b){ b.onclick = function(){ W.delFit(b.getAttribute('data-fitx')); draw(); }; });
    var sf = host.querySelector('.cl-savefit');
    if (sf) sf.onclick = function(){ W.saveFit('Fit ' + (W.fits().length + 1), ctx); draw(); };
  }

  /* WHERE THE COINS CAME FROM, newest first. A folded entry (economy.js
     compact) is past its sixty days and is in the balance, not the list. */
  function histHtml(){
    var Wl = window.RTF_WALLET;
    var rows = Wl && Wl.history ? Wl.history(30) : [];
    if (!rows.length) return '';
    var lines = rows.map(function(r){
      var d = new Date(r.t), when = (d.getMonth() + 1) + '/' + d.getDate();
      return '<li><span>' + esc(coinLabel(r)) + '</span><i>' + when + '</i><b class="' + (r.a < 0 ? 'neg' : '') + '">' + (r.a < 0 ? '' : '+') + money(r.a) + '</b></li>';
    }).join('');
    return '<details class="cl-hist"><summary>Coin history</summary><ul>' + lines + '</ul></details>';
  }

  draw();
  cur = { host: host, draw: draw };
}
var SRC = { run: 'Draft run', dd: 'Daily Draft', fx: 'Fix History', ps: 'Six Passes', endless: 'Endless puzzle',
  cq: 'Conquest win', cqclear: 'Conquest cleared', welcome: 'Welcome to the Floor' };
function coinLabel(r){
  if (r.a < 0) { var it = CAT && CAT.item(r.src); return it ? it.name : (r.src || 'Spent'); }
  if (r.src === 'career') return /^cf:/.test(r.k) ? 'Career finished' : 'Career season';
  if (r.src === 'badge') {
    var id = r.k.slice(3), BD = window.RTF_BADGES, b = null;
    try { b = BD && BD.catalog().filter(function(x){ return x.id === id; })[0]; } catch (e) {}
    return 'Badge: ' + (b ? b.name : id);
  }
  return SRC[r.src] || 'Coins';
}
/* a copy from another device lands while the closet is open: one listener,
   for whichever pane is on screen */
var cur = null;
if (W) W.onChange(function(){ if (cur && document.body.contains(cur.host)) cur.draw(); });
if (window.RTF_WALLET) window.RTF_WALLET.onChange(function(){ if (cur && document.body.contains(cur.host)) cur.draw(); });

var CSS = [
'.cl-hist{margin:14px 0 4px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px;}',
'.cl-hist summary{cursor:pointer;font:700 13px var(--k-f-text);color:var(--k-ink);}',
'.cl-hist ul{list-style:none;margin:8px 0 0;padding:0;}',
'.cl-hist li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:baseline;padding:5px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,.06);}',
'.cl-hist li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.cl-hist li i{font-style:normal;color:var(--k-ink-3);font-size:12px;}',
'.cl-hist li b{font-variant-numeric:tabular-nums;color:var(--k-gold);}',
'.cl-hist li b.neg{color:var(--k-ink-3);}',
'.cl-head{position:sticky;top:calc(-1 * var(--k-s-5, 20px));z-index:2;background:var(--k-panel);margin:0 -4px;padding:8px 4px 0;box-shadow:0 8px 10px -8px rgba(0,0,0,.6);}',
'.cl-top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;margin:4px 0 8px;}',
'.cl-fig{position:relative;padding:14px 10px 6px;line-height:0;overflow:hidden;background:radial-gradient(70% 55% at 50% 42%,color-mix(in srgb,var(--sc,#f2c23a) 26%,transparent),transparent 72%),linear-gradient(180deg,#1b2034,#0d1019);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--sc,#f2c23a) 45%,#2c3350),inset 0 -5px 0 rgba(0,0,0,.45);}',
/* the stand: rays of the piece's rarity behind him, the pack art's light */
'.cl-srays{position:absolute;left:50%;top:44%;width:240px;height:240px;margin:-120px 0 0 -120px;border-radius:50%;pointer-events:none;opacity:.16;background:repeating-conic-gradient(from 0deg,var(--sc,#f2c23a) 0deg 7deg,transparent 7deg 22deg);-webkit-mask:radial-gradient(circle,#000 12%,transparent 64%);mask:radial-gradient(circle,#000 12%,transparent 64%);animation:cl-spin 26s linear infinite;}',
'.cl-fig.is-try .cl-srays{opacity:.42;animation-duration:12s;}',
'@keyframes cl-spin{to{transform:rotate(360deg);}}',
'.cl-spot{position:absolute;left:14%;right:14%;bottom:4px;height:12px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.65),transparent 70%);}',
'.cl-fig::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.12) 50%,transparent 62%);background-size:260% 100%;animation:cl-foil 5s ease-in-out infinite;}',
'.cl-stag{position:absolute;top:0;left:50%;transform:translateX(-50%);background:var(--sc);color:#10131d;font:800 9px/1 var(--k-f-text);letter-spacing:.14em;text-transform:uppercase;padding:4px 10px;line-height:1;}',
'.cl-fig img{position:relative;}',
'.cl-figcard{padding:11px;line-height:normal;}',
'.cl-figcard img{width:100%;height:100%;}',
'.cl-figcard .pc-fig img{height:auto;}',
'.cl-figcard .pc-card.pc-mini{width:100px;}',
'@media (min-height:760px){.cl-figcard .pc-card.pc-mini{width:120px;}}',
'.cl-side{display:flex;flex-direction:column;gap:6px;min-width:0;text-align:left;font:600 12.5px/1.3 var(--k-f-text);color:var(--k-ink-2);}',
'.cl-coins{display:flex;align-items:center;gap:6px;}',
'.cl-coin{width:18px;height:18px;image-rendering:pixelated;filter:drop-shadow(0 0 5px rgba(242,194,58,.5));}',
'.cl-coins b{font:400 15px var(--k-f-pixel);color:var(--k-gold);margin-right:4px;text-shadow:0 2px 0 #5a3e0a;}',
'.cl-try{position:relative;display:flex;flex-direction:column;gap:6px;align-items:stretch;padding:9px 9px 6px;color:var(--k-ink);overflow:hidden;background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 24%,#1a1f32),#121625 80%);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--rc) 70%,transparent),0 0 18px -8px var(--rc);}',
/* the crimp along the top, the pack's sealed edge */
'.cl-try::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:repeating-linear-gradient(90deg,var(--rc) 0 4px,transparent 4px 8px);opacity:.85;}',
'.cl-try::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);background-size:260% 100%;animation:cl-foil 4s ease-in-out infinite;}',
'.cl-tryn{font:600 12px/1.3 var(--k-f-text);color:var(--k-ink-2);}.cl-tryn b{color:var(--rc);}',
'.cl-pk{position:relative;z-index:1;display:grid;grid-template-columns:46px minmax(0,1fr);column-gap:8px;row-gap:6px;align-items:center;}',
'.cl-pkart{position:relative;height:58px;display:flex;align-items:center;justify-content:center;}',
'.cl-pkrays{position:absolute;left:50%;top:50%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;opacity:.4;background:repeating-conic-gradient(from 0deg,var(--pa) 0deg 8deg,transparent 8deg 24deg);-webkit-mask:radial-gradient(circle,#000 14%,transparent 64%);mask:radial-gradient(circle,#000 14%,transparent 64%);animation:cl-spin 16s linear infinite;}',
'.cl-pkimg{position:relative;width:38px;image-rendering:pixelated;filter:drop-shadow(0 0 6px var(--pa));animation:cl-bob 2.8s ease-in-out infinite;}',
'@keyframes cl-bob{0%,100%{transform:translateY(0) rotate(-3deg);}50%{transform:translateY(-4px) rotate(3deg);}}',
'.cl-pkt{display:flex;flex-direction:column;gap:1px;min-width:0;line-height:1.2;}',
'.cl-pkt i{font:800 9px var(--k-f-text);font-style:normal;text-transform:uppercase;letter-spacing:.12em;color:var(--k-ink-3);}',
'.cl-pkt b{font:400 17px/1 var(--k-f-display);text-transform:uppercase;letter-spacing:.01em;color:var(--k-ink);overflow-wrap:anywhere;}',
'.cl-pkt em{font:800 12px var(--k-f-text);font-style:normal;color:var(--k-gold);font-variant-numeric:tabular-nums;}',
'.cl-pk.is-earn,.cl-pk.is-off{grid-template-columns:minmax(0,1fr);}',
'.cl-pk.is-earn .cl-pkt b{color:var(--k-gold);}',
'.cl-topacks{grid-column:1 / -1;min-height:40px;padding:8px 12px;font-size:13px;}',
'.cl-back{border:0;background:none;color:var(--k-ink);font:800 12px var(--k-f-text);text-decoration:underline;text-underline-offset:3px;padding:6px 0;min-height:32px;cursor:pointer;}',
'.cl-guest{margin:10px 0 0;color:var(--k-ink-3);font:600 12.5px var(--k-f-text);text-align:left;}',
'.cl-slots{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -4px 8px;padding:2px 4px 6px;}',
'.cl-slots::-webkit-scrollbar{display:none;}',
'.cl-slot{flex:0 0 auto;min-height:38px;padding:6px 12px 6px 8px;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;}',
'.cl-si{width:20px;height:20px;image-rendering:pixelated;opacity:.85;}',
'.cl-slot[aria-pressed="true"] .cl-si{opacity:1;filter:drop-shadow(0 0 4px rgba(242,194,58,.6));}',
'.cl-slot i{font-style:normal;color:var(--k-gold);margin-left:3px;}',
'.cl-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0 8px;}',
'.cl-own{border:0;background:none;color:var(--k-ink-3);font:700 12px var(--k-f-text);cursor:pointer;min-height:36px;padding:0 4px;text-decoration:underline;text-underline-offset:3px;}',
'.cl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}',
'@media (min-width:560px){.cl-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}',
'.cl-tile{display:grid;grid-template-columns:44px minmax(0,1fr);grid-template-rows:auto auto;column-gap:8px;align-items:center;text-align:left;min-height:56px;padding:8px;border:0;cursor:pointer;',
' background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--rc,#3a4058) 70%,transparent) 0 3px,transparent 3px 6px) top / 100% 3px no-repeat,linear-gradient(180deg,color-mix(in srgb,var(--rc,#3a4058) 13%,#1a1f32),#131725);color:var(--k-ink);font:700 12.5px/1.25 var(--k-f-text);position:relative;padding-right:20px;box-shadow:inset 3px 0 0 var(--rc,#3a4058);overflow:hidden;}',
'.cl-tile.r-common{--rc:#aeb4bf;}.cl-tile.r-rare{--rc:#5b9bff;}.cl-tile.r-epic{--rc:#b47cff;}.cl-tile.r-legendary{--rc:#f2c23a;}',
'.cl-tile.r-epic::after,.cl-tile.r-legendary::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 40%,rgba(255,236,170,.13) 50%,transparent 60%);background-size:260% 100%;animation:cl-foil 4s ease-in-out infinite;}',
'@keyframes cl-foil{0%{background-position:120% 0;}60%,100%{background-position:-60% 0;}}',
'.cl-tile.r-epic::after{opacity:.6;}',
'@media (prefers-reduced-motion:reduce){.cl-tile::after,.cl-srays,.cl-pkrays,.cl-pkimg,.cl-fig::after,.cl-try::after{animation:none!important;}}',
'.cl-tile:hover{background:var(--k-panel-3);}',
'.cl-tile.is-on{background:linear-gradient(180deg,#3a2f12,#221c0c);box-shadow:0 -2px 0 0 var(--k-gold),0 2px 0 0 var(--k-gold),-2px 0 0 0 var(--k-gold),2px 0 0 0 var(--k-gold);}',
'.cl-tile:focus-visible{outline:2px solid var(--k-gold);outline-offset:2px;}',
'.cl-sw{grid-row:1 / span 2;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--rc,#aeb4bf) 30%,#121625),#0d1019 75%);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc,#aeb4bf) 55%,transparent);}',
'.cl-sw:not(:has(img)){background:linear-gradient(135deg,var(--a,#3a3f4a) 0 55%,var(--b,#22242b) 55% 100%);}',
'.cl-ic{width:40px;height:40px;image-rendering:pixelated;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5));}',
'.cl-tile.lock .cl-ic{opacity:.75;}',
'.cl-none .cl-sw{background:repeating-linear-gradient(45deg,var(--k-panel-3) 0 4px,transparent 4px 8px);}',
'.cl-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.cl-p{font:600 11px var(--k-f-text);color:var(--k-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.cl-r{font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-right:6px;font-size:9.5px;}',
'.r-common .cl-r{color:#aeb4bf;}.r-rare .cl-r{color:#6fa8ff;}.r-epic .cl-r{color:#c08cff;}.r-legendary .cl-r{color:var(--k-gold);}',
'.cl-tile.lock .cl-n{color:var(--k-ink-2);}',
'.cl-tile.lock .cl-sw{filter:saturate(.55) brightness(.85);}',
'.cl-ck{position:absolute;top:5px;right:5px;width:12px;height:12px;background:var(--k-gold);box-shadow:0 0 6px rgba(242,194,58,.6);}',
'.cl-ck::after{content:"";position:absolute;left:3px;top:1px;width:3px;height:6px;border:solid #16181f;border-width:0 2px 2px 0;transform:rotate(45deg);}',
'.cl-tile.excl{box-shadow:inset 3px 0 0 var(--rc,#3a4058),inset 0 0 0 1px rgba(242,194,58,.35);}',
'.cl-bl{display:flex;align-items:baseline;gap:10px;min-width:0;}',
'.cl-col{font:600 12px var(--k-f-text);color:var(--k-ink-3);white-space:nowrap;}.cl-col b{color:var(--k-gold);font-variant-numeric:tabular-nums;}',
'.cl-cbar{display:flex;gap:2px;height:6px;margin:-2px 0 10px;}',
'.cl-cbar i{display:block;min-width:4px;background:linear-gradient(90deg,var(--rc) var(--f),#232840 var(--f));box-shadow:0 0 6px -2px var(--rc);}',
'.cl-x{color:var(--k-gold);font-weight:800;}',
'.r-legendary.own .cl-sw{box-shadow:inset 0 0 0 2px var(--k-gold),0 0 10px -2px var(--k-gold);}',
'.cl-empty{grid-column:1 / -1;color:var(--k-ink-3);font:600 13px var(--k-f-text);margin:6px 0;}',
'.cl-fits{margin:14px 0 4px;}',
'.cl-fitrow{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}',
'.cl-fit{display:inline-flex;}',
'.cl-fitx{border:0;background:var(--k-panel-3);color:var(--k-ink-3);min-width:32px;min-height:40px;margin:2px 2px 2px -4px;cursor:pointer;font:700 12px var(--k-f-text);}',
].join('\n');
if (typeof document !== 'undefined' && !document.getElementById('rtf-closet-css')) {
  var st = document.createElement('style'); st.id = 'rtf-closet-css'; st.textContent = CSS; document.head.appendChild(st);
}

/* open the closet on a slot (the player card's Change button) */
function focus(ctx, slot){ ctx = ctx === 'court' ? 'court' : 'street'; if (W && W.slotsOf(ctx).indexOf(slot) >= 0) view[ctx].slot = slot; }
window.RTF_CLOSET = { API_VERSION: API_VERSION, pane: pane, LABEL: LABEL, focus: focus };
})();
