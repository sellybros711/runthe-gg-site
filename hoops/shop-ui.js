/* Run The Floor: the shop.
 *
 * window.RTF_SHOP. Draws the Shop tab of the Look sheet into a host: the
 * welcome panel, free packs, the four packs (odds printed on every one), the
 * shards and the exchange, and the reveal. Every press goes through
 * RTF_WARD.shop, the one door that touches the wardrobe and the wallet; this
 * file only draws and presses. The rules are hoops/packs.js.
 *
 * THE REVEAL IS HIS OWN PLAYER WEARING IT, the closet's rule: a pulled piece
 * is shown on his body in the look it belongs to, and an idle plays.
 *
 * The CSS is injected by this file, so it caches with it (store.js's reason).
 */
(function(){
'use strict';

var API_VERSION = 1;
var W = window.RTF_WARD, CAT = window.RTF_CATALOG, X = window.RTF_ECON, PK = window.RTF_PACKS, B = window.RTF_BALLER;

var COLORS = { street: ['#e8660f', '#6a2a08'], league: ['#3a6fd8', '#14244f'], hof: ['#e3a92f', '#5a3e0a'], season: ['#8a4fd4', '#2e1652'] };
var BLURB = {
  street: 'Where everybody starts. Mostly commons.',
  league: 'Better odds at a rare or an epic.',
  hof: 'The best odds in the game at an epic or a legendary.',
  season: 'The live drop\'s pieces turn up four times in ten.',
};
var RLABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
var LOOKNAME = { street: 'Off court', court: 'On court', both: 'Either look' };

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return Math.round(n).toLocaleString('en-US'); }
function errText(e){
  return { signin: 'Sign in to open packs and keep what you get.', coins: 'Not enough coins.', shards: 'Not enough shards yet.',
    credit: 'That free pack has been opened.', pack: 'That pack is not on the shelf right now.', empty: 'Nothing left to pull.', off: 'The shop is not available right now.' }[e] || 'That did not go through.';
}
/* how many badges the account already held when the wallet started */
function heldBadges(){
  try {
    var w = window.RTF_WALLET && window.RTF_WALLET.load();
    var n = 0; for (var k in (w && w.e) || {}) if (/^bg:/.test(k) && k !== 'bg:base' && w.e[k][2] === 'mark') n++;
    return n;
  } catch (e) { return 0; }
}

/* host: an element. o: { look, c1, c2, num } */
function pane(host, o){
  if (!W || !W.shop || !CAT || !X || !PK || !B) { host.innerHTML = '<p class="cash">The shop is not available right now.</p>'; return; }
  var S = W.shop, msg = '', reveal = null, confirmB = null;

  function figFor(it){
    var ctx = it.ctx === 'court' ? 'court' : 'street', lo = W.loadout(ctx);
    lo[it.slot] = it.id;
    var opts = W.dress({ c1: o.c1, c2: o.c2, num: o.num, pose: 'stand', scale: 3, still: it.slot !== 'idle' }, ctx, lo, true);
    if (it.slot === 'idle' && W.idle) opts = W.idle(opts, ctx, lo, true);
    return B.img(o.look, opts, 'sh-figimg');
  }
  function card(r){
    var it = r.item;
    var note = r.dup ? 'Duplicate. +1 ' + RLABEL[it.rarity].toLowerCase() + ' shard' + (r.refund ? ', +' + money(r.refund) + ' coins' : '') : 'New';
    return '<div class="sh-card r-' + it.rarity + '"><div class="sh-cfig">' + figFor(it) + '</div>'
      + '<b class="sh-cr">' + RLABEL[it.rarity] + '</b><span class="sh-cn">' + esc(it.name) + '</span>'
      + '<span class="sh-cl">' + LOOKNAME[it.ctx] + (it.slot === 'idle' ? ' · Idle' : '') + '</span>'
      + '<span class="sh-cd' + (r.dup ? ' dup' : '') + '">' + note + '</span></div>';
  }

  function draw(){
    var signed = S.signedIn(), coins = window.RTF_WALLET ? window.RTF_WALLET.balance() : 0;
    var sh = S.shards(), cr = S.credits(), pend = S.pending(), pity = S.pity();
    var html = '<div class="sh">';
    html += '<div class="sh-top"><span class="sh-coins"><b>' + money(coins) + '</b> coins</span>'
      + '<span class="sh-shards">' + PK.RANK.map(function(r){ return '<i class="r-' + r + '" title="' + RLABEL[r] + ' shards">' + (sh[r] || 0) + '</i>'; }).join('') + '</span></div>';
    if (msg) html += '<p class="sh-msg" role="status">' + esc(msg) + '</p>';

    if (reveal) {
      html += '<div class="sh-reveal" role="dialog" aria-label="What you got"><div class="k k-label">' + esc(reveal.title) + '</div>'
        + '<div class="sh-cards' + (reveal.results.length > 1 ? ' many' : '') + '">' + reveal.results.map(card).join('') + '</div>'
        + (reveal.offer ? '' : '<div class="sh-row"><button type="button" class="k-btn sh-done">Nice</button></div>') + '</div>';
    }
    if (pend) {
      html += '<div class="sh-reveal sh-choose"><div class="k k-label">Choose one legendary</div><div class="sh-cards many">'
        + pend.offer.map(function(it){ return '<button type="button" class="sh-card sh-pick r-legendary" data-choose="' + it.id + '"><div class="sh-cfig">' + figFor(it) + '</div>'
          + '<b class="sh-cr">Legendary</b><span class="sh-cn">' + esc(it.name) + '</span><span class="sh-cl">' + LOOKNAME[it.ctx] + '</span>'
          + (W.owns(it.id) ? '<span class="sh-cd dup">You have it</span>' : '<span class="sh-cd">Take it</span>') + '</button>'; }).join('')
        + '</div></div>';
    }

    /* THE WELCOME. Badges held before the wallet started were counted, not
       paid, and the account gets one free pack to start. Said once. */
    if (signed && !S.welcomeSeen() && window.RTF_WALLET && window.RTF_WALLET.has('bg:base')) {
      var nb = heldBadges();
      html += '<div class="k-panel k-gold sh-welcome"><div class="k-eyebrow">Welcome to the shop</div>'
        + '<p>' + (nb ? 'Your <b>' + nb + '</b> badge' + (nb === 1 ? ' was' : 's were') + ' already counted. They do not pay again. Every badge from here on pays coins.' : 'Every badge you earn from here on pays coins.') + '</p>'
        + (cr.some(function(c){ return c.key === 'welcome'; }) ? '<p>Here is a free Streetball Pack to start.</p>' : '<p>Your free Streetball Pack is opened. Packs and shards are below.</p>')
        + '<button type="button" class="k-btn k-sec sh-wok">Got it</button></div>';
    }

    if (cr.length) {
      html += '<div class="sh-sec"><span class="k k-label">Free packs</span><div class="sh-free">' + cr.map(function(c){
        var P = PK.packOf(c.pack);
        return '<button type="button" class="k-btn sh-freebtn" data-free="' + esc(c.key) + '" data-pack="' + c.pack + '">Open ' + esc(P.name) + '</button>';
      }).join('') + '</div></div>';
    }

    html += '<div class="sh-sec"><span class="k k-label">Packs</span><p class="sh-note">One item a pack. Either look. Five for the price of four.'
      + ' Epic or better within <b>' + Math.max(1, X.PACKS.street.pity[0] - pity.sinceEpic) + '</b> Streetball Packs.</p><div class="sh-packs">';
    PK.IDS.forEach(function(id){
      if (!PK.available(id)) return;
      var P = PK.packOf(id), c = COLORS[id], drop = id === 'season' ? PK.liveDrop() : null;
      html += '<div class="sh-pack" style="--pa:' + c[0] + ';--pb:' + c[1] + '"><div class="sh-pt"><b>' + esc(drop ? drop.name + ' Pack' : P.name) + '</b><span>' + money(P.price) + '</span></div>'
        + '<p class="sh-pb">' + esc(BLURB[id]) + '</p><p class="sh-odds">' + esc(PK.oddsText(id)) + '</p>'
        + '<div class="sh-row"><button type="button" class="k-btn sh-open" data-open="' + id + '">' + (signed ? 'Open · ' + money(P.price) : 'Sign in to open') + '</button>'
        + (signed ? '<button type="button" class="k-btn k-sec sh-open5" data-open5="' + id + '">Open 5 · ' + money(P.price * X.BUNDLE_PAY) + '</button>' : '') + '</div></div>';
    });
    html += '</div></div>';

    html += '<div class="sh-sec"><span class="k k-label">Shards</span><p class="sh-note">A duplicate gives a shard of its rarity. '
      + X.EXCHANGE_COST + ' shards spin for an item one rarity up. ' + X.EXCHANGE_COST + ' legendary shards are ' + money(X.LEG_EXCHANGE_COINS) + ' coins, a Hall of Fame Pack and your pick of three legendaries.</p><div class="sh-ex">';
    PK.RANK.forEach(function(r){
      var n = sh[r] || 0, can = signed && n >= X.EXCHANGE_COST;
      html += '<div class="sh-exr r-' + r + '"><span class="sh-exn"><b class="cl-r">' + RLABEL[r] + '</b>' + n + ' / ' + X.EXCHANGE_COST + '</span>'
        + '<span class="sh-exbar"><i style="width:' + Math.min(100, n / X.EXCHANGE_COST * 100) + '%"></i></span>'
        + '<button type="button" class="k-chip sh-xbtn" data-ex="' + r + '"' + (can ? '' : ' disabled') + '>' + (r === 'legendary' ? 'Cash in' : 'For a ' + RLABEL[PK.NEXT[r]].toLowerCase()) + '</button></div>';
    });
    html += '</div></div>';
    if (!signed) html += '<p class="cl-guest">Sign in to open packs. Everything here can be tried on in the closet first.</p>';
    html += '</div>';
    host.innerHTML = html;
    wire();
  }

  function act(r, title){
    if (!r || r.err) { msg = errText(r && r.err); reveal = null; draw(); return; }
    msg = '';
    if (r.results) reveal = { title: title, results: r.results };
    else if (r.offer) reveal = null;
    else if (r.item) reveal = { title: title, results: [r] };
    draw();
    var rv = host.querySelector('.sh-reveal');
    if (rv && rv.scrollIntoView) rv.scrollIntoView({ block: 'nearest' });
  }
  function wire(){
    var q = function(sel, fn){ host.querySelectorAll(sel).forEach(function(b){ b.onclick = function(){ fn(b); }; }); };
    q('.sh-done', function(){ reveal = null; draw(); });
    q('.sh-wok', function(){ S.seenWelcome(); draw(); });
    q('[data-free]', function(b){ act(S.open(b.getAttribute('data-pack'), { credit: b.getAttribute('data-free') }), PK.packOf(b.getAttribute('data-pack')).name); });
    /* A coin pack asks twice: the first press names the price on the button,
       the second spends it. A free pack opens on one press. */
    var twice = function(b, key, go){
      if (!S.signedIn()) { msg = errText('signin'); draw(); return; }
      if (confirmB !== key) { confirmB = key; draw(); var nb = host.querySelector('[data-' + key.split(':')[0] + '="' + key.split(':')[1] + '"]'); if (nb) { nb.textContent = 'Tap again to spend'; nb.classList.add('is-arm'); } return; }
      confirmB = null; go();
    };
    q('[data-open]', function(b){ var id = b.getAttribute('data-open'); twice(b, 'open:' + id, function(){ act(S.open(id), PK.packOf(id).name); }); });
    q('[data-open5]', function(b){ var id = b.getAttribute('data-open5'); twice(b, 'open5:' + id, function(){ act(S.bundle(id), 'Five ' + PK.packOf(id).name + 's'); }); });
    q('[data-ex]', function(b){ var r = b.getAttribute('data-ex'); twice(b, 'ex:' + r, function(){ act(S.exchange(r), 'Shard exchange'); }); });
    q('[data-choose]', function(b){ act(S.choose(S.pending().id, b.getAttribute('data-choose')), 'Your legendary'); });
  }
  draw();
  cur = { host: host, draw: draw };
}
var cur = null;
if (W) W.onChange(function(){ if (cur && document.body.contains(cur.host)) cur.draw(); });
if (window.RTF_WALLET) window.RTF_WALLET.onChange(function(){ if (cur && document.body.contains(cur.host)) cur.draw(); });

var CSS = [
'.sh{text-align:left;font:600 13px/1.4 var(--k-f-text);color:var(--k-ink-2);}',
'.sh-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:2px 0 10px;}',
'.sh-coins b{font:400 15px var(--k-f-pixel);color:var(--k-gold);margin-right:4px;}',
'.sh-shards{display:flex;gap:4px;}',
'.sh-shards i{font-style:normal;font:800 12px var(--k-f-text);min-width:30px;text-align:center;padding:3px 6px;background:var(--k-panel-2);}',
'.sh-shards i::before{content:"";display:inline-block;width:7px;height:7px;transform:rotate(45deg);margin-right:5px;background:currentColor;vertical-align:1px;}',
'.r-common.sh-exr .cl-r,.sh-shards .r-common{color:#aeb4bf;}.sh-shards .r-rare{color:#6fa8ff;}.sh-shards .r-epic{color:#c08cff;}.sh-shards .r-legendary{color:var(--k-gold);}',
'.r-rare.sh-exr .cl-r{color:#6fa8ff;}.r-epic.sh-exr .cl-r{color:#c08cff;}.r-legendary.sh-exr .cl-r{color:var(--k-gold);}',
'.sh-msg{background:#3a1d1d;color:#ffd3c8;padding:8px 10px;margin:0 0 10px;}',
'.sh-sec{margin:14px 0 0;}',
'.sh-note{margin:4px 0 8px;font-size:12.5px;color:var(--k-ink-3);}',
'.sh-note b{color:var(--k-ink);}',
'.sh-welcome{margin:0 0 10px;}',
'.sh-welcome p{margin:6px 0;}',
'.sh-free{display:flex;flex-wrap:wrap;gap:6px;}',
'.sh-packs{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;}',
'@media (min-width:560px){.sh-packs{grid-template-columns:repeat(2,minmax(0,1fr));}}',
'.sh-pack{background:linear-gradient(160deg,var(--pa) 0 6px,var(--k-panel-2) 6px);padding:10px 10px 4px 16px;position:relative;}',
'.sh-pack::after{content:"";position:absolute;right:10px;top:10px;width:26px;height:32px;background:linear-gradient(180deg,var(--pa),var(--pb));box-shadow:inset 0 0 0 2px rgba(0,0,0,.35);}',
'.sh-pt{display:flex;flex-direction:column;gap:2px;padding-right:40px;}',
'.sh-pt b{font:400 13px var(--k-f-pixel);color:var(--k-ink);}',
'.sh-pt span{font:800 13px var(--k-f-text);color:var(--k-gold);font-variant-numeric:tabular-nums;}',
'.sh-pb{margin:6px 0 2px;}',
'.sh-odds{margin:0 0 6px;font-size:11.5px;color:var(--k-ink-3);font-variant-numeric:tabular-nums;}',
'.sh-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
'.sh-row .k-btn{min-height:44px;padding:10px 14px;font-size:13px;}',
'.k-btn.is-arm{filter:brightness(1.25);}',
'.sh-ex{display:flex;flex-direction:column;gap:6px;}',
'.sh-exr{display:grid;grid-template-columns:minmax(0,9em) minmax(0,1fr) auto;gap:8px;align-items:center;}',
'.sh-exn{white-space:nowrap;font-variant-numeric:tabular-nums;}',
'.sh-exbar{height:8px;background:var(--k-panel-3);}',
'.sh-exbar i{display:block;height:100%;background:currentColor;}',
'.r-common.sh-exr{color:#aeb4bf;}.r-rare.sh-exr{color:#6fa8ff;}.r-epic.sh-exr{color:#c08cff;}.r-legendary.sh-exr{color:var(--k-gold);}',
'.sh-xbtn{min-height:38px;white-space:nowrap;}',
'.sh-xbtn[disabled]{opacity:.45;cursor:default;}',
'.sh-reveal{background:var(--k-panel-2);padding:10px;margin:0 0 10px;animation:sh-in .35s ease-out;}',
'@keyframes sh-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}',
'@media (prefers-reduced-motion:reduce){.sh-reveal{animation:none;}}',
'.sh-cards{display:flex;justify-content:center;gap:8px;margin:8px 0;}',
'.sh-cards.many{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));}',
'.sh-card{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;padding:8px 6px;background:var(--k-panel);border:0;color:var(--k-ink);font:700 12px/1.25 var(--k-f-text);min-width:0;}',
'button.sh-card{cursor:pointer;}',
'.sh-card.r-legendary{box-shadow:inset 0 0 0 2px var(--k-gold);}',
'.sh-card.r-epic{box-shadow:inset 0 0 0 2px #c08cff;}',
'.sh-card.r-rare{box-shadow:inset 0 0 0 2px #6fa8ff;}',
'.sh-cfig{line-height:0;min-height:96px;}',
'.sh-cfig img,.sh-cfig canvas{width:72px;height:auto;image-rendering:pixelated;}',
'.sh-cards:not(.many) .sh-cfig img,.sh-cards:not(.many) .sh-cfig canvas{width:120px;}',
'.sh-cr{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;}',
'.r-common .sh-cr{color:#aeb4bf;}.r-rare .sh-cr{color:#6fa8ff;}.r-epic .sh-cr{color:#c08cff;}.r-legendary .sh-cr{color:var(--k-gold);}',
'.sh-cn{max-width:100%;overflow:hidden;text-overflow:ellipsis;}',
'.sh-cl{font:600 11px var(--k-f-text);color:var(--k-ink-3);}',
'.sh-cd{font:800 11px var(--k-f-text);color:#7fe0a0;}',
'.sh-cd.dup{color:var(--k-ink-3);}',
].join('\n');
if (typeof document !== 'undefined' && !document.getElementById('rtf-shop-css')) {
  var st = document.createElement('style'); st.id = 'rtf-shop-css'; st.textContent = CSS; document.head.appendChild(st);
}

window.RTF_SHOP = { API_VERSION: API_VERSION, pane: pane };
})();
