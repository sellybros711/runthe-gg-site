/* Run The Floor: the closet.
 *
 * window.RTF_CLOSET. Draws one look's pane (off court or on court) into a
 * host, for the Look sheet in hoops/career-ui.js. The record is
 * hoops/wardrobe.js and the catalogue hoops/catalog.js; this file only draws
 * and presses.
 *
 * WHAT A PRESS DOES. A piece he owns goes on at once and is saved: there is
 * no Save button to forget. A piece he does not own is TRIED ON: the figure
 * wears it, the tile says what it costs, and "Back to my fit" takes it off.
 * Nothing he does not own is ever saved (wardrobe.js refuses it), so trying
 * on is free and safe.
 *
 * THE PREVIEW IS THE PRODUCT: the figure is his own player, his body and his
 * face, in the piece. Never a mannequin.
 *
 * The CSS is injected by this file, so it caches with it (store.js's reason).
 */
(function(){
'use strict';

var API_VERSION = 1;
var W = window.RTF_WARD, CAT = window.RTF_CATALOG, X = window.RTF_ECON, B = window.RTF_BALLER;
var RCOL = { common: '#aeb4bf', rare: '#5b9bff', epic: '#b47cff', legendary: '#f2c23a' };
/* the pixel art is hoops/itemart.js; a page without it draws the old swatch */
function art(){ return window.RTF_ART || null; }
function slotIcon(s){ var A = art(); return A ? '<img class="cl-si" alt="" src="' + A.iconURL({ id: 'slot:' + s, slot: s, k: '', c: ['#c9ccd6', '#7d8396'] }) + '">' : ''; }

var LABEL = {
  hat: 'Hat', eyes: 'Glasses', top: 'Top', outer: 'Jacket', bottom: 'Pants', shoes: 'Shoes', socks: 'Socks',
  chain: 'Chain', watch: 'Watch', bag: 'Bag', phones: 'Headphones', held: 'In hand',
  band: 'Headband', goggles: 'Goggles', guard: 'Mouthguard', sleeveL: 'Left sleeve', sleeveR: 'Right sleeve',
  wrist: 'Wristbands', tape: 'Tape', tights: 'Tights', knee: 'Knees', ankle: 'Ankles', csocks: 'Socks', under: 'Undershirt', idle: 'Idle',
};
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

/* the try-on's buy button: sold pieces only, and only for an account */
function buyHtml(id, signedIn, coins){
  var it = CAT.item(id);
  if (!it || !CAT.sold(it) || !W.shop) return '';
  if (!signedIn) return '<span class="cl-buynote">Sign in to buy</span>';
  var p = X.priceOf(it);
  if (coins < p) return '<span class="cl-buynote">' + money(p) + ' coins. ' + money(p - coins) + ' short</span>';
  return '<button type="button" class="k-btn cl-buy">Buy · ' + money(p) + '</button>';
}
function priceText(it, owned){
  if (owned) return it.free ? 'Starter' : 'Owned';
  if (it.excl) return 'Earned';
  return short(X.priceOf(it));
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
  var trying = null, buyArm = null, bought = null;

  function draw(){
    var om = W.ownedMap(), lo = W.loadout(ctx), shown = Object.assign({}, lo);
    if (trying) shown[trying.slot] = trying.id;
    /* the figure stands still while he dresses, and moves while he picks an idle */
    var moving = v.slot === 'idle';
    var fo = W.dress({ c1: o.c1, c2: o.c2, num: o.num, pose: 'stand', scale: 4, still: !moving }, ctx, shown, true);
    if (moving && W.idle) fo = W.idle(fo, ctx, shown, true);
    var fig = B.img(o.look, fo, 'cl-figimg');
    var wearing = slots.map(function(s){ var it = CAT.item(shown[s]); return it ? it.name : null; }).filter(Boolean);
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
    var none = '<button type="button" class="cl-tile cl-none' + (!shown[v.slot] ? ' is-on' : '') + '" data-id="">'
      + '<span class="cl-sw"></span><span class="cl-n">' + (STARTER[v.slot] && ctx === 'street' ? 'Starter' : 'Nothing') + '</span><span class="cl-p">' + (STARTER[v.slot] && ctx === 'street' ? 'Always yours' : 'Take it off') + '</span></button>';
    var tiles = list.map(function(it){
      var own = !!om[it.id], on = shown[v.slot] === it.id;
      var a = it.c[0], b = it.c[1] || it.c[0];
      return '<button type="button" class="cl-tile r-' + it.rarity + (own ? ' own' : ' lock') + (on ? ' is-on' : '') + '" data-id="' + it.id + '" aria-pressed="' + on + '">'
        + '<span class="cl-sw" style="--a:' + a + ';--b:' + b + ';--rc:' + RCOL[it.rarity] + '">' + (art() ? art().icon(it, 'cl-ic') : '') + '</span>'
        + '<span class="cl-n">' + esc(it.name) + '</span>'
        + '<span class="cl-p">' + (it.excl && !own ? '<b class="cl-x">' + esc(earnText(it)) + '</b>' : '<b class="cl-r">' + it.rarity + '</b>' + esc(priceText(it, own))) + '</span></button>';
    }).join('');

    var fits = W.fits().filter(function(f){ return f.ctx === ctx; });
    var fitsHtml = fits.map(function(f){
      return '<span class="cl-fit"><button type="button" class="k-chip" data-fit="' + f.id + '">' + esc(f.n) + '</button><button type="button" class="cl-fitx" data-fitx="' + f.id + '" aria-label="Delete ' + esc(f.n) + '">x</button></span>';
    }).join('');

    /* THE FIGURE STAYS ON SCREEN. A press low in the list is a try-on the
       player has to see, so the figure and the slots are pinned to the top
       of the sheet while the pieces scroll under them. */
    host.innerHTML = '<div class="cl"><div class="cl-head">'
      + '<div class="cl-top"><div class="cl-fig"><span class="cl-spot" aria-hidden="true"></span>' + fig + '</div><div class="cl-side">'
      + '<div class="cl-coins">' + (art() ? art().coin('cl-coin') : '') + '<b>' + money(coins) + '</b> coins</div>'
      + '<div class="cl-wear">' + (wearing.length ? wearing.length + ' piece' + (wearing.length === 1 ? '' : 's') + ' on' : (ctx === 'street' ? 'Starter clothes' : 'The plain uniform')) + '</div>'
      + (trying ? '<div class="cl-try"><span>Trying on <b>' + esc(CAT.item(trying.id).name) + '</b></span>' + buyHtml(trying.id, signedIn, coins) + (bought ? '<span class="cl-buynote" role="status">' + (bought === 'coins' ? 'Not enough coins.' : 'That did not go through.') + '</span>' : '') + '<button type="button" class="cl-back">Back to my fit</button></div>' : '')
      + '</div></div>'
      + '<div class="cl-slots" role="group" aria-label="Slots">' + chips + '</div></div>'
      + '<div class="cl-bar"><span class="k k-label">' + esc(LABEL[v.slot] || v.slot) + '</span>'
      + '<button type="button" class="cl-own" aria-pressed="' + v.owned + '">' + (v.owned ? 'Showing what you own' : 'Showing everything') + '</button></div>'
      + '<div class="cl-grid">' + none + tiles + (list.length ? '' : '<p class="cl-empty">Nothing here yet. Pieces come from the shop and from packs.</p>') + '</div>'
      + (!signedIn ? '<p class="cl-guest">Sign in to earn coins and keep what you buy.</p>' : '')
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
        buyArm = null; bought = null;
        if (W.owns(id)) { trying = null; W.equip(ctx, v.slot, id); }
        else trying = { slot: v.slot, id: id };
        draw();
      };
    });
    /* BUY asks twice: the first press names the price, the second spends it */
    var buy = host.querySelector('.cl-buy');
    if (buy) buy.onclick = function(){
      if (!buyArm) { buyArm = trying.id; buy.textContent = 'Tap again to spend ' + money(X.priceOf(CAT.item(trying.id))); buy.classList.add('is-arm'); return; }
      var r = W.shop.buy(trying.id);
      buyArm = null;
      if (r && !r.err) { W.equip(ctx, v.slot, trying.id); trying = null; }
      else bought = r && r.err;
      draw();
    };
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
'.cl-fig{position:relative;padding:6px 8px 4px;line-height:0;overflow:hidden;background:radial-gradient(70% 55% at 50% 30%,rgba(255,214,140,.16),transparent 70%),linear-gradient(180deg,#1b2034,#11141f);box-shadow:inset 0 0 0 2px #2c3350,inset 0 -4px 0 rgba(0,0,0,.4);}',
'.cl-spot{position:absolute;left:14%;right:14%;bottom:4px;height:12px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.6),transparent 70%);}',
'.cl-fig::before{content:"";position:absolute;left:50%;top:-30%;width:70%;height:120%;transform:translateX(-50%);background:linear-gradient(180deg,rgba(255,232,180,.14),transparent 75%);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);pointer-events:none;}',
'.cl-fig img{position:relative;}',
'.cl-fig img{width:88px;height:auto;image-rendering:pixelated;display:block;}',
'@media (min-height:760px){.cl-fig img{width:110px;}}',
'.cl-side{display:flex;flex-direction:column;gap:6px;min-width:0;text-align:left;font:600 12.5px/1.3 var(--k-f-text);color:var(--k-ink-2);}',
'.cl-coins{display:flex;align-items:center;gap:6px;}',
'.cl-coin{width:18px;height:18px;image-rendering:pixelated;filter:drop-shadow(0 0 5px rgba(242,194,58,.5));}',
'.cl-coins b{font:400 15px var(--k-f-pixel);color:var(--k-gold);margin-right:4px;text-shadow:0 2px 0 #5a3e0a;}',
'.cl-try{background:#2a2412;padding:6px 8px;color:var(--k-ink);display:flex;flex-direction:column;gap:4px;align-items:flex-start;}',
'.cl-try b{color:var(--k-gold);}',
'.cl-buy{min-height:40px;padding:8px 14px;font-size:13px;margin:2px 0;}',
'.cl-buy.is-arm{filter:brightness(1.25);}',
'.cl-buynote{font:700 12px var(--k-f-text);color:var(--k-ink-3);}',
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
' background:linear-gradient(180deg,#1a1f32,#141826);color:var(--k-ink);font:700 12.5px/1.25 var(--k-f-text);position:relative;padding-right:20px;box-shadow:inset 3px 0 0 var(--rc,#3a4058);overflow:hidden;}',
'.cl-tile.r-common{--rc:#aeb4bf;}.cl-tile.r-rare{--rc:#5b9bff;}.cl-tile.r-epic{--rc:#b47cff;}.cl-tile.r-legendary{--rc:#f2c23a;}',
'.cl-tile.r-legendary::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 40%,rgba(255,236,170,.13) 50%,transparent 60%);background-size:260% 100%;animation:cl-foil 4s ease-in-out infinite;}',
'@keyframes cl-foil{0%{background-position:120% 0;}60%,100%{background-position:-60% 0;}}',
'@media (prefers-reduced-motion:reduce){.cl-tile.r-legendary::after{animation:none;}}',
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
'.cl-x{color:var(--k-gold);font-weight:800;}',
'.cl-tile.lock::after{content:"";position:absolute;top:6px;right:6px;width:7px;height:6px;border:2px solid var(--k-ink-3);border-top:0;}',
'.cl-tile.lock::before{content:"";position:absolute;top:2px;right:8px;width:3px;height:4px;border:2px solid var(--k-ink-3);border-bottom:0;}',
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

window.RTF_CLOSET = { API_VERSION: API_VERSION, pane: pane, LABEL: LABEL };
})();
