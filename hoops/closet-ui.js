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

var LABEL = {
  hat: 'Hat', eyes: 'Glasses', top: 'Top', outer: 'Jacket', bottom: 'Pants', shoes: 'Shoes', socks: 'Socks',
  chain: 'Chain', watch: 'Watch', bag: 'Bag', phones: 'Headphones', held: 'In hand',
  band: 'Headband', goggles: 'Goggles', guard: 'Mouthguard', sleeveL: 'Left sleeve', sleeveR: 'Right sleeve',
  wrist: 'Wristbands', tape: 'Tape', tights: 'Tights', knee: 'Knees', ankle: 'Ankles', csocks: 'Socks', under: 'Undershirt',
};
/* a slot the starter wardrobe fills cannot be left bare: "Starter" is its empty */
var STARTER = { top: 1, bottom: 1, shoes: 1 };
var RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };
/* an exclusive is never sold: its tile says how it is earned instead */
var EARN = { draft_first: 'Go 1st overall', title: 'Win a title', hof: 'Hall of Fame', career_first: 'First career' };
function earnText(it){ return /^drop:/.test(it.earn) ? 'Finish the drop' : EARN[it.earn] || 'Earned'; }

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return Math.round(n).toLocaleString('en-US'); }
/* a tile is half a phone wide: 275,000 does not fit beside the rarity, 275K does */
function short(n){ return n >= 10000 ? Math.round(n / 1000) + 'K' : money(n); }

/* the pane remembers where it was between redraws */
var view = { street: { slot: 'top', owned: false }, court: { slot: 'band', owned: false } };

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
  var trying = null;

  function draw(){
    var om = W.ownedMap(), lo = W.loadout(ctx), shown = Object.assign({}, lo);
    if (trying) shown[trying.slot] = trying.id;
    var fig = B.img(o.look, W.dress({ c1: o.c1, c2: o.c2, num: o.num, pose: 'stand', scale: 4, still: true }, ctx, shown, true), 'cl-figimg');
    var wearing = slots.map(function(s){ var it = CAT.item(shown[s]); return it ? it.name : null; }).filter(Boolean);
    var coins = window.RTF_WALLET ? window.RTF_WALLET.balance() : 0;
    var signedIn = !!(window.RTF_AUTH && window.RTF_AUTH.state && window.RTF_AUTH.state().signedIn);

    var chips = slots.map(function(s){
      var n = itemsFor(ctx, s).filter(function(it){ return om[it.id] && !it.free; }).length;
      var on = s === v.slot;
      return '<button type="button" class="k-chip cl-slot' + (shown[s] ? ' has' : '') + '" data-slot="' + s + '" aria-pressed="' + on + '">' + esc(LABEL[s] || s) + (n ? ' <i>' + n + '</i>' : '') + '</button>';
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
        + '<span class="cl-sw" style="--a:' + a + ';--b:' + b + '"></span>'
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
      + '<div class="cl-top"><div class="cl-fig">' + fig + '</div><div class="cl-side">'
      + '<div class="cl-coins"><b>' + money(coins) + '</b> coins</div>'
      + '<div class="cl-wear">' + (wearing.length ? wearing.length + ' piece' + (wearing.length === 1 ? '' : 's') + ' on' : (ctx === 'street' ? 'Starter clothes' : 'The plain uniform')) + '</div>'
      + (trying ? '<div class="cl-try"><span>Trying on <b>' + esc(CAT.item(trying.id).name) + '</b></span><button type="button" class="cl-back">Back to my fit</button></div>' : '')
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
        if (W.owns(id)) { trying = null; W.equip(ctx, v.slot, id); }
        else trying = { slot: v.slot, id: id };
        draw();
      };
    });
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
'.cl-fig{background:var(--k-panel-2);padding:4px;line-height:0;}',
'.cl-fig img{width:88px;height:auto;image-rendering:pixelated;display:block;}',
'@media (min-height:760px){.cl-fig img{width:110px;}}',
'.cl-side{display:flex;flex-direction:column;gap:6px;min-width:0;text-align:left;font:600 12.5px/1.3 var(--k-f-text);color:var(--k-ink-2);}',
'.cl-coins b{font:400 15px var(--k-f-pixel);color:var(--k-gold);margin-right:4px;}',
'.cl-try{background:#2a2412;padding:6px 8px;color:var(--k-ink);display:flex;flex-direction:column;gap:4px;align-items:flex-start;}',
'.cl-try b{color:var(--k-gold);}',
'.cl-back{border:0;background:none;color:var(--k-ink);font:800 12px var(--k-f-text);text-decoration:underline;text-underline-offset:3px;padding:6px 0;min-height:32px;cursor:pointer;}',
'.cl-guest{margin:10px 0 0;color:var(--k-ink-3);font:600 12.5px var(--k-f-text);text-align:left;}',
'.cl-slots{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -4px 8px;padding:2px 4px 6px;}',
'.cl-slots::-webkit-scrollbar{display:none;}',
'.cl-slot{flex:0 0 auto;min-height:38px;padding:6px 12px;white-space:nowrap;}',
'.cl-slot i{font-style:normal;color:var(--k-gold);margin-left:3px;}',
'.cl-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0 8px;}',
'.cl-own{border:0;background:none;color:var(--k-ink-3);font:700 12px var(--k-f-text);cursor:pointer;min-height:36px;padding:0 4px;text-decoration:underline;text-underline-offset:3px;}',
'.cl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}',
'@media (min-width:560px){.cl-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}',
'.cl-tile{display:grid;grid-template-columns:30px minmax(0,1fr);grid-template-rows:auto auto;column-gap:8px;align-items:center;text-align:left;min-height:56px;padding:8px;border:0;cursor:pointer;',
' background:var(--k-panel-2);color:var(--k-ink);font:700 12.5px/1.25 var(--k-f-text);position:relative;padding-right:20px;}',
'.cl-tile:hover{background:var(--k-panel-3);}',
'.cl-tile.is-on{background:#2a2412;box-shadow:0 -2px 0 0 var(--k-gold),0 2px 0 0 var(--k-gold),-2px 0 0 0 var(--k-gold),2px 0 0 0 var(--k-gold);}',
'.cl-tile:focus-visible{outline:2px solid var(--k-gold);outline-offset:2px;}',
'.cl-sw{grid-row:1 / span 2;width:30px;height:30px;background:linear-gradient(135deg,var(--a,#3a3f4a) 0 55%,var(--b,#22242b) 55% 100%);box-shadow:inset 0 0 0 2px rgba(0,0,0,.35);}',
'.cl-none .cl-sw{background:repeating-linear-gradient(45deg,var(--k-panel-3) 0 4px,transparent 4px 8px);}',
'.cl-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.cl-p{font:600 11px var(--k-f-text);color:var(--k-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.cl-r{font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-right:6px;font-size:9.5px;}',
'.r-common .cl-r{color:#aeb4bf;}.r-rare .cl-r{color:#6fa8ff;}.r-epic .cl-r{color:#c08cff;}.r-legendary .cl-r{color:var(--k-gold);}',
'.cl-tile.lock .cl-n{color:var(--k-ink-2);}',
'.cl-x{color:var(--k-gold);font-weight:800;}',
'.cl-tile.lock::after{content:"";position:absolute;top:6px;right:6px;width:7px;height:6px;border:2px solid var(--k-ink-3);border-top:0;}',
'.cl-tile.lock::before{content:"";position:absolute;top:2px;right:8px;width:3px;height:4px;border:2px solid var(--k-ink-3);border-bottom:0;}',
'.r-legendary.own .cl-sw{box-shadow:inset 0 0 0 2px var(--k-gold);}',
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
