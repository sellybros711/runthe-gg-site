/* Run The Floor: the shop.
 *
 * window.RTF_SHOP. Draws the Shop tab of the Look sheet into a host, and
 * plays a pack open over the whole screen. Every press goes through
 * RTF_WARD.shop, the one door that touches the wardrobe and the wallet; this
 * file only draws and presses. The rules are hoops/packs.js, the pixels are
 * hoops/itemart.js.
 *
 * AN OPEN IS DECIDED BEFORE IT IS SHOWN. The press spends and rolls at once
 * (so a closed tab mid spin loses nothing), and then the show plays: the
 * pack on its stand, the tear, a reel that slows onto the item already won,
 * and the reveal. The reel's winning cell IS the granted item, and
 * check-packs.mjs reads both and compares them.
 *
 * THE REVEAL IS HIS OWN PLAYER WEARING IT, the closet's rule.
 *
 * REDUCED MOTION skips the show and lands on the reveal.
 *
 * The CSS is injected by this file, so it caches with it (store.js's reason).
 */
(function(){
'use strict';

var API_VERSION = 3;
var W = window.RTF_WARD, CAT = window.RTF_CATALOG, X = window.RTF_ECON, PK = window.RTF_PACKS, B = window.RTF_BALLER, A = window.RTF_ART;

var COLORS = { street: ['#e8660f', '#6a2a08'], league: ['#3a6fd8', '#14244f'], hof: ['#e3a92f', '#5a3e0a'], season: ['#8a4fd4', '#2e1652'] };
var BLURB = {
  street: 'Where everybody starts. Mostly commons.',
  league: 'Better odds at a rare or an epic.',
  hof: 'The best odds in the game at an epic or a legendary.',
  season: 'The live drop\'s pieces turn up four times in ten.',
};
var RLABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
var RCOL = { common: '#aeb4bf', rare: '#5b9bff', epic: '#b47cff', legendary: '#f2c23a' };
var LOOKNAME = { street: 'Off court', court: 'On court', both: 'Either look' };
var REEL_N = 34, REEL_WIN = 28, CELL = 92, GAP = 8, SPIN_MS = 4600;
/* how long each piece of five holds the spotlight, and the most the five may take */
var DWELL = { common: 950, rare: 1200, epic: 1650, legendary: 2000 }, SPOT_MAX = 6200;

var esc = window.RTF_UTIL.esc;
var money = window.RTF_UTIL.coins;
function reduced(){ try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
function errText(e){
  return { signin: 'Sign in to open packs and keep what you get.', coins: 'Not enough coins.', shards: 'Not enough shards yet.',
    credit: 'That free pack has been opened.', pack: 'That pack is not on the shelf right now.', empty: 'Nothing left to pull.', off: 'The shop is not available right now.' }[e] || 'That did not go through.';
}
function coin(cls){ return A ? A.coin(cls || 'sh-coin') : ''; }
function gem(r, cls){ return A ? A.gem(r, cls || 'sh-gem') : ''; }
function packImg(id, cls){ return A ? A.pack(id, cls || 'sh-packimg') : ''; }
function icon(it, cls){ return A ? A.icon(it, cls || 'sh-icon') : ''; }
/* how many badges the account already held when the wallet started */
function heldBadges(){
  try {
    var w = window.RTF_WALLET && window.RTF_WALLET.load();
    var n = 0; for (var k in (w && w.e) || {}) if (/^bg:/.test(k) && k !== 'bg:base' && w.e[k][2] === 'mark') n++;
    return n;
  } catch (e) { return 0; }
}

/* the reel's filler: drawn from the same pool at the pack's own odds, so it
   looks like what the pack holds. Display only; the winner is already rolled. */
function reelItems(pack, rarity, win){
  var pool = PK.pool(), P = PK.packOf(pack), out = [];
  for (var i = 0; i < REEL_N; i++) {
    var r = rarity;
    if (!r) { var x = Math.random(), a = 0; r = 'common'; for (var j = 0; j < 4; j++) { a += P.odds[j]; if (x < a) { r = PK.RANK[j]; break; } } }
    var tier = pool.filter(function(it){ return it.rarity === r; });
    if (!tier.length) tier = pool;
    out.push(tier[Math.floor(Math.random() * tier.length)]);
  }
  out[REEL_WIN] = win;
  return out;
}

/* host: an element. o: { look, c1, c2, num } */
function pane(host, o){
  if (!W || !W.shop || !CAT || !X || !PK || !B) { host.innerHTML = '<p class="cash">The shop is not available right now.</p>'; return; }
  var S = W.shop, msg = '', confirmB = null;

  function figFor(it, scale){
    var ctx = it.ctx === 'court' ? 'court' : 'street', lo = W.loadout(ctx);
    lo[it.slot] = it.id;
    var opts = W.dress({ c1: o.c1, c2: o.c2, num: o.num, pose: 'stand', scale: scale || 3, still: it.slot !== 'idle' }, ctx, lo, true);
    if (it.slot === 'idle' && W.idle) opts = W.idle(opts, ctx, lo, true);
    return B.img(o.look, opts, 'sh-figimg');
  }
  function dupNote(r){
    var it = r.item;
    if (!r.dup) return '<span class="sh-chip new">New</span>';
    return '<span class="sh-chip" style="--rc:' + RCOL[it.rarity] + '">' + gem(it.rarity, 'sh-gemi') + '+1 shard</span>'
      + (r.refund ? '<span class="sh-chip gold">' + coin('sh-coini') + '+' + money(r.refund) + '</span>' : '');
  }
  /* the small card: the bundle's flip and the summary */
  function card(r, best){
    var it = r.item;
    return '<div class="sh-card r-' + it.rarity + (best ? ' is-best' : '') + '" style="--rc:' + RCOL[it.rarity] + '" data-id="' + it.id + '">' + (best ? '<span class="sh-ribbon">Best pull</span>' : '') + '<div class="sh-cfig">' + figFor(it, best ? 3 : 2) + '</div>'
      + '<b class="sh-cr">' + RLABEL[it.rarity] + '</b><span class="sh-cn">' + esc(it.name) + '</span>'
      + '<span class="sh-cl">' + LOOKNAME[it.ctx] + (it.slot === 'idle' ? ' · Idle' : '') + '</span>'
      + '<span class="sh-cd' + (r.dup ? ' dup' : '') + '">' + (r.dup ? 'Duplicate' : 'New') + '</span></div>';
  }

  /* ─── the shelf ─────────────────────────────────────────────────────── */
  function draw(){
    var signed = S.signedIn(), coins = window.RTF_WALLET ? window.RTF_WALLET.balance() : 0;
    var sh = S.shards(), cr = S.credits(), pend = S.pending(), pity = S.pity();
    var html = '<div class="sh">';
    html += '<div class="sh-wallet"><span class="sh-bal">' + coin('sh-coinbig') + '<b>' + money(coins) + '</b><i>coins</i></span>'
      + '<span class="sh-gems">' + PK.RANK.map(function(r){ return '<span class="sh-gemc" style="--rc:' + RCOL[r] + '" title="' + RLABEL[r] + ' shards">' + gem(r) + '<i>' + (sh[r] || 0) + '</i></span>'; }).join('') + '</span></div>';
    /* THE COLLECTION: every piece comes from a pack, so the shop says how much
       of the game's wardrobe is his, by rarity */
    var om = W.ownedMap(), packed = CAT.ITEMS.filter(CAT.sold), got = packed.filter(function(it){ return om[it.id]; }).length;
    html += '<div class="sh-coll"><span class="sh-colt"><b>' + got + '</b> of ' + packed.length + ' pieces collected</span><span class="sh-colbar">' + PK.RANK.map(function(r){
      var t = packed.filter(function(it){ return it.rarity === r; }), h = t.filter(function(it){ return om[it.id]; }).length;
      return '<i style="flex:' + t.length + ';--rc:' + RCOL[r] + ';--f:' + Math.round(100 * h / Math.max(1, t.length)) + '%" title="' + RLABEL[r] + ' ' + h + ' of ' + t.length + '"></i>';
    }).join('') + '</span></div>';
    if (msg) html += '<p class="sh-msg" role="status">' + esc(msg) + '</p>';

    if (pend) {
      html += '<div class="sh-choosebar k-panel k-gold"><div class="k-eyebrow">A legendary is waiting</div><p>Pick one of three.</p><button type="button" class="k-btn sh-pickopen">Choose</button></div>';
    }
    /* THE WELCOME. Badges held before the wallet started were counted, not
       paid, and the account gets one free pack to start. Said once. */
    if (signed && !S.welcomeSeen() && window.RTF_WALLET && window.RTF_WALLET.has('bg:base')) {
      var nb = heldBadges();
      html += '<div class="k-panel k-gold sh-welcome"><div class="sh-wfx" aria-hidden="true">' + packImg('street', 'sh-wpack') + '</div><div class="sh-wtx"><div class="k-eyebrow">Welcome to the shop</div>'
        + '<p>' + (nb ? 'Your <b>' + nb + '</b> badge' + (nb === 1 ? ' was' : 's were') + ' already counted. They do not pay again. Every badge from here on pays coins.' : 'Every badge you earn from here on pays coins.') + '</p>'
        + (cr.some(function(c){ return c.key === 'welcome'; }) ? '<p>Here is a free Streetball Pack to start.</p>' : '<p>Your free Streetball Pack is opened. Packs and shards are below.</p>')
        + '<button type="button" class="k-btn k-sec sh-wok">Got it</button></div></div>';
    }

    if (cr.length) {
      html += '<div class="sh-sec"><div class="sh-h"><span class="k k-label">Free packs</span><span class="sh-count">' + cr.length + '</span></div><div class="sh-free">' + cr.map(function(c){
        var P = PK.packOf(c.pack), col = COLORS[c.pack] || COLORS.street;
        return '<button type="button" class="sh-freecard" data-free="' + esc(c.key) + '" data-pack="' + c.pack + '" style="--pa:' + col[0] + ';--pb:' + col[1] + '">'
          + '<span class="sh-fstage"><span class="sh-rays"></span>' + packImg(c.pack, 'sh-fpack') + '</span>'
          + '<span class="sh-ftx"><b>' + esc(P.name) + '</b><i>On the house</i></span><span class="sh-fgo">Open</span></button>';
      }).join('') + '</div></div>';
    }

    /* the pity meter: every pack without an epic fills a cell */
    var need = X.PACKS.street.pity[0], since = Math.min(need - 1, pity.sinceEpic);
    var cells = ''; for (var i = 0; i < need; i++) cells += '<i' + (i < since ? ' class="on"' : i === need - 1 ? ' class="goal"' : '') + '></i>';
    html += '<div class="sh-sec"><div class="sh-h"><span class="k k-label">Packs</span><span class="sh-note">One item each. Either look. Five for the price of four.</span></div>'
      + '<div class="sh-pity"><span class="sh-pl">Epic or better within <b>' + Math.max(1, need - pity.sinceEpic) + '</b> Streetball Packs</span><span class="sh-pcells">' + cells + '</span></div><div class="sh-packs">';
    PK.IDS.forEach(function(id){
      if (!PK.available(id)) return;
      var P = PK.packOf(id), c = COLORS[id], drop = id === 'season' ? PK.liveDrop() : null;
      var seg = P.odds.map(function(p, j){ return '<i style="flex:' + p + ';background:' + RCOL[PK.RANK[j]] + '"></i>'; }).join('');
      html += '<div class="sh-pack" style="--pa:' + c[0] + ';--pb:' + c[1] + '">'
        + '<div class="sh-stand" aria-hidden="true"><span class="sh-rays"></span><span class="sh-floor"></span><span class="sh-bob">' + packImg(id) + '</span></div>'
        + '<div class="sh-pinfo"><div class="sh-pt"><b>' + esc(drop ? drop.name + ' Pack' : P.name) + '</b><span class="sh-price">' + coin('sh-coini') + money(P.price) + '</span></div>'
        + '<p class="sh-pb">' + esc(BLURB[id]) + '</p><span class="sh-obar" aria-hidden="true">' + seg + '</span><p class="sh-odds">' + esc(PK.oddsText(id)) + '</p>'
        + '<div class="sh-row"><button type="button" class="k-btn sh-open" data-open="' + id + '">' + (signed ? 'Open' : 'Sign in to open') + '</button>'
        + (signed ? '<button type="button" class="sh-open5" data-open5="' + id + '"><span>Open 5</span><b>' + coin('sh-coini') + money(P.price * X.BUNDLE_PAY) + '</b><em>Save ' + money(P.price) + '</em></button>' : '') + '</div></div></div>';
    });
    html += '</div></div>';

    /* COIN BUCKETS, shipped dark: drawn only while economy.js BUCKETS_ENABLED
       is true. A press opens the site's one checkout; the coins land on the
       server (141) and the packs as free packs here. */
    if (X.BUCKETS_ENABLED && X.BUCKETS) {
      html += '<div class="sh-sec"><div class="sh-h"><span class="k k-label">Coins</span><span class="sh-note">Bought coins are kept on your account.</span></div><div class="sh-buckets">';
      Object.keys(X.BUCKETS).forEach(function(k){
        var B = X.BUCKETS[k];
        html += '<button type="button" class="sh-bucket" data-bucket="' + esc(k) + '"' + (signed ? '' : ' disabled') + '>'
          + coin('sh-coinbig') + '<b>' + money(B.coins) + '</b><i>' + esc(B.name) + '</i>'
          + (B.packs.length ? '<em>+' + B.packs.length + ' ' + esc(PK.packOf(B.packs[0]).name) + (B.packs.length > 1 ? 's' : '') + '</em>' : '')
          + '<span class="sh-bprice">$' + (B.cents / 100).toFixed(2) + '</span></button>';
      });
      html += '</div></div>';
    }

    html += '<div class="sh-sec"><div class="sh-h"><span class="k k-label">Shards</span></div><p class="sh-note">A duplicate gives a shard of its rarity. '
      + X.EXCHANGE_COST + ' shards spin for an item one rarity up. ' + X.EXCHANGE_COST + ' legendary shards are ' + money(X.LEG_EXCHANGE_COINS) + ' coins, a Hall of Fame Pack and your pick of three legendaries.</p><div class="sh-ex">';
    PK.RANK.forEach(function(r){
      var n = sh[r] || 0, can = signed && n >= X.EXCHANGE_COST, bar = '';
      for (var j = 0; j < X.EXCHANGE_COST; j++) bar += '<i' + (j < n ? ' class="on"' : '') + '></i>';
      html += '<div class="sh-exr r-' + r + (can ? ' ready' : '') + '" style="--rc:' + RCOL[r] + '">' + gem(r, 'sh-gembig')
        + '<span class="sh-exn"><b>' + RLABEL[r] + '</b><i>' + n + ' / ' + X.EXCHANGE_COST + '</i></span>'
        + '<span class="sh-exbar">' + bar + '</span>'
        + '<button type="button" class="k-chip sh-xbtn" data-ex="' + r + '"' + (can ? '' : ' disabled') + '>' + (r === 'legendary' ? 'Cash in' : 'For a ' + RLABEL[PK.NEXT[r]].toLowerCase()) + '</button></div>';
    });
    html += '</div></div>';
    if (!signed) html += '<p class="cl-guest">Sign in to open packs. Everything here can be tried on in the closet first.</p>';
    html += '</div>';
    host.innerHTML = html;
    wire();
  }

  function act(r, show){
    if (!r || r.err) { msg = errText(r && r.err); draw(); return; }
    msg = '';
    draw();
    if (r.offer) { showChoose(); return; }
    playOpen(r, show);
  }
  function wire(){
    var q = function(sel, fn){ host.querySelectorAll(sel).forEach(function(b){ b.onclick = function(){ fn(b); }; }); };
    q('.sh-wok', function(){ S.seenWelcome(); draw(); });
    q('.sh-pickopen', function(){ showChoose(); });
    q('[data-free]', function(b){ var p = b.getAttribute('data-pack'); act(S.open(p, { credit: b.getAttribute('data-free') }), { pack: p }); });
    /* A coin pack asks twice: the first press names the price on the button,
       the second spends it. A free pack opens on one press. */
    var twice = function(key, go){
      if (!S.signedIn()) { msg = errText('signin'); draw(); return; }
      if (confirmB !== key) { confirmB = key; draw(); var nb = host.querySelector('[data-' + key.split(':')[0] + '="' + key.split(':')[1] + '"]'); if (nb) { nb.innerHTML = '<span>Tap again to spend</span>'; nb.classList.add('is-arm'); } return; }
      confirmB = null; go();
    };
    /* a coin pack the ledger cannot cover may be covered by bought coins */
    var cov = function(price, go, show){ (S.covered ? S.covered(price, go) : Promise.resolve(go())).then(function(r){ act(r, show); }); };
    q('[data-open]', function(b){ var id = b.getAttribute('data-open'); twice('open:' + id, function(){ cov(PK.packOf(id).price, function(){ return S.open(id); }, { pack: id }); }); });
    q('[data-open5]', function(b){ var id = b.getAttribute('data-open5'); twice('open5:' + id, function(){ cov(PK.packOf(id).price * X.BUNDLE_PAY, function(){ return S.bundle(id); }, { pack: id, bundle: true }); }); });
    q('[data-bucket]', function(b){ buyBucket(b); });
    q('[data-ex]', function(b){ var r = b.getAttribute('data-ex'); twice('ex:' + r, function(){ act(S.exchange(r), { exchange: r }); }); });
  }

  /* a bucket is the site's one checkout, never a second payment path */
  function buyBucket(b){
    var a = window.RTF_AUTH, t = a && a.token ? a.token() : null;
    if (!X.BUCKETS_ENABLED) return;
    if (!t) { msg = errText('signin'); draw(); return; }
    b.disabled = true;
    fetch('/api/stripe/checkout-bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ bucket: b.getAttribute('data-bucket'), return_path: '/hoops/' })
    }).then(function(r){ return r.json().catch(function(){ return {}; }); })
      .catch(function(){ return {}; })
      .then(function(d){
        if (d && d.url) { location.href = d.url; return; }
        msg = "Checkout couldn't start. Try again."; draw();
      });
  }

  /* ─── the show ───────────────────────────────────────────────────────── */
  var ov = null;
  function closeOv(){ if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; document.removeEventListener('keydown', onKey); draw(); }
  function onKey(e){ if (e.key === 'Escape' && ov && ov.getAttribute('data-phase') !== 'reel') closeOv(); }
  function openOv(cls, pal){
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    ov = document.createElement('div');
    ov.className = 'sh-ov ' + cls;
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.style.setProperty('--pa', pal[0]); ov.style.setProperty('--pb', pal[1]);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
    return ov;
  }
  function phase(p, html){ if (!ov) return; ov.setAttribute('data-phase', p); ov.innerHTML = html; }
  function live(){ return !!(ov && ov.parentNode); }

  function playOpen(r, show){
    var res = r.results || [r], it = res[0].item;
    var pack = show.pack || 'street', ex = show.exchange;
    var pal = ex ? [RCOL[it.rarity], A ? A.dark(RCOL[it.rarity], 0.6) : '#222'] : (COLORS[pack] || COLORS.street);
    openOv(ex ? 'is-ex' : 'is-pack', pal);
    var title = ex ? 'Shard Exchange' : (show.bundle ? 'Five ' + PK.packOf(pack).name + 's' : PK.packOf(pack).name);
    if (reduced()) { reveal(res, title, show); return; }
    if (ex) { reel(res[0], title, show); return; }
    phase('stage', '<div class="sh-ovt">' + esc(title) + (show.bundle ? '<span class="sh-x5">x5</span>' : '') + '</div>'
      + '<button type="button" class="sh-hero" aria-label="Tear it open"><span class="sh-hrays"></span><span class="sh-halo"></span>'
      + '<span class="sh-float"><span class="sh-pbody">' + packImg(pack, 'sh-heroimg') + '</span><span class="sh-ptop">' + packImg(pack, 'sh-heroimg') + '</span></span><span class="sh-hfloor"></span></button>'
      + '<button type="button" class="k-btn sh-tear">Tear it open</button><p class="sh-ovs">' + esc(PK.oddsText(pack)) + '</p>');
    var go = function(){
      var h = ov.querySelector('.sh-hero'); if (!h || h.classList.contains('rip')) return;
      h.classList.add('rip'); ov.querySelector('.sh-tear').disabled = true;
      setTimeout(function(){ if (!live()) return; if (show.bundle) flip(res, title, show); else reel(res[0], title, show); }, 760);
    };
    ov.querySelector('.sh-hero').onclick = go; ov.querySelector('.sh-tear').onclick = go;
  }

  function reel(r, title, show){
    var it = r.item, items = reelItems(show.pack || 'street', show.exchange ? it.rarity : null, it);
    var cells = items.map(function(x, i){
      return '<span class="sh-cell r-' + x.rarity + '" style="--rc:' + RCOL[x.rarity] + '"' + (i === REEL_WIN ? ' data-win="' + x.id + '"' : '') + '>'
        + '<b>' + RLABEL[x.rarity] + '</b>' + icon(x, 'sh-cicon') + '<i>' + esc(x.name) + '</i></span>';
    }).join('');
    phase('reel', '<div class="sh-ovt">' + esc(title) + '</div><div class="sh-reel"><span class="sh-strip">' + cells + '</span><span class="sh-ptr"></span></div>'
      + '<p class="sh-ovs">' + (show.exchange ? 'Guaranteed ' + RLABEL[it.rarity] : 'Good luck') + '</p><button type="button" class="sh-skip">Skip</button>');
    var box = ov.querySelector('.sh-reel'), strip = ov.querySelector('.sh-strip'), vw = box.clientWidth || 340;
    var pitch = CELL + GAP, jitter = Math.round((Math.random() * 2 - 1) * CELL * 0.3);
    var start = vw / 2 - (4 * pitch + CELL / 2), end = vw / 2 - (REEL_WIN * pitch + CELL / 2) + jitter;
    strip.style.transform = 'translateX(' + start + 'px)';
    var done = false;
    function land(){
      if (done || !live()) return; done = true;
      strip.style.transition = 'none'; strip.style.transform = 'translateX(' + end + 'px)';
      box.classList.remove('tense'); box.classList.add('landed');
      var wc = strip.children[REEL_WIN]; if (wc) wc.classList.add('win');
      setTimeout(function(){ if (live()) reveal([r], title, show); }, 650);
    }
    strip.getBoundingClientRect();
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      strip.style.transition = 'transform ' + SPIN_MS + 'ms cubic-bezier(.09,.74,.1,1)';
      strip.style.transform = 'translateX(' + end + 'px)';
    }); });
    setTimeout(function(){ if (!done && live()) box.classList.add('tense'); }, SPIN_MS * 0.55);
    setTimeout(land, SPIN_MS + 120);
    strip.addEventListener('transitionend', land);
    ov.querySelector('.sh-skip').onclick = land;
  }

  /* FIVE AT ONCE IS FIVE MOMENTS, not a list. The five are dealt face down
     in a row; then each comes up into the spotlight in turn, the commons
     first and the rarest last, in its rarity's light (a shake before an
     epic or better, and the confetti when it lands). A tap moves on, Skip
     goes to the hand, and the whole show is held under SPOT_MAX so five
     legendaries do not keep a player waiting. Every granted item has its
     turn in the spotlight and its card in the hand (check-closet 9). */
  function flip(res, title, show){
    var pack = show.pack || 'street';
    var order = res.map(function(r, i){ return i; }).sort(function(a, b){ return PK.RANK.indexOf(res[a].item.rarity) - PK.RANK.indexOf(res[b].item.rarity) || a - b; });
    var dw = order.map(function(i){ return DWELL[res[i].item.rarity] || DWELL.common; });
    var sum = dw.reduce(function(a, b){ return a + b; }, 0), fit = Math.min(1, SPOT_MAX / sum);
    dw = dw.map(function(d){ return Math.round(d * fit); });
    phase('flip', '<div class="sh-ovt">' + esc(title) + '</div><div class="sh-spot" aria-live="polite"></div><div class="sh-n5"></div><div class="sh-flips">' + res.map(function(r, i){
      var it = r.item;
      return '<span class="sh-fl" data-i="' + i + '" style="--rc:' + RCOL[it.rarity] + '"><span class="sh-fli"><span class="sh-flb">' + packImg(pack, 'sh-flimg') + '</span><span class="sh-flf"><span class="sh-thumb"><b>' + RLABEL[it.rarity] + '</b>' + icon(it, 'sh-ticon') + '</span></span></span></span>';
    }).join('') + '</div><button type="button" class="sh-skip">Skip</button>');
    var fl = ov.querySelectorAll('.sh-fl'), spot = ov.querySelector('.sh-spot'), n5 = ov.querySelector('.sh-n5');
    var k = -1, timer = null, done = false;
    function finish(){ if (done || !live()) return; done = true; clearTimeout(timer); reveal(res, title, show); }
    function step(){
      if (!live() || done) return;
      k++;
      if (k >= order.length) { finish(); return; }
      var i = order[k], r = res[i], rr = r.item.rarity, big = rr === 'epic' || rr === 'legendary', el = fl[i];
      fl.forEach(function(x){ x.classList.remove('lit'); });
      var pre = big ? 420 : 0;
      if (big) el.classList.add('shake');
      setTimeout(function(){
        if (!live() || done) return;
        el.classList.remove('shake'); el.classList.add('on', 'lit');
        spot.innerHTML = spotCard(r);
        spot.style.setProperty('--rc', RCOL[rr]);
        n5.textContent = (k + 1) + ' of ' + order.length;
        flash(RCOL[rr]);
        if (big) boom(RCOL[rr]);
      }, pre);
      timer = setTimeout(step, dw[k] + (k === order.length - 1 ? 500 : 0));
    }
    spot.onclick = function(){ if (k >= 0 && !done) { clearTimeout(timer); step(); } };
    ov.querySelector('.sh-skip').onclick = finish;
    timer = setTimeout(step, 420);
  }
  /* the spotlight's card: the single reveal's card, a size down */
  function spotCard(r){
    var it = r.item;
    return '<div class="sh-card sh-scard r-' + it.rarity + '" data-id="' + it.id + '" style="--rc:' + RCOL[it.rarity] + '"><span class="sh-ribbon">' + RLABEL[it.rarity] + '</span>'
      + '<div class="sh-cfig">' + figFor(it, 3) + '</div>'
      + '<span class="sh-rmeta">' + icon(it, 'sh-ricon') + '<span><span class="sh-cn">' + esc(it.name) + '</span><span class="sh-cl">' + LOOKNAME[it.ctx] + (it.slot === 'idle' ? ' · Idle' : '') + '</span></span></span>'
      + '<span class="sh-chips">' + dupNote(r) + '</span></div>';
  }
  /* the room lights in the rarity's colour for a beat as a piece lands */
  function flash(col){
    if (reduced() || !ov) return;
    var f = document.createElement('span'); f.className = 'sh-flash'; f.style.setProperty('--fc', col); ov.appendChild(f);
    setTimeout(function(){ if (f.parentNode) f.parentNode.removeChild(f); }, 700);
  }

  function reveal(res, title, show){
    if (!live()) return;
    var one = res.length === 1, r = res[0], it = r.item, big = one && (it.rarity === 'epic' || it.rarity === 'legendary');
    var html = '<div class="sh-ovt">' + esc(title) + '</div><div class="sh-reveal">';
    if (one) {
      html += '<div class="sh-rwrap' + (big ? ' big' : '') + '" style="--rc:' + RCOL[it.rarity] + '"><span class="sh-rrays r-' + it.rarity + '"></span>' + (big ? '<span class="sh-burst"></span>' : '')
        + '<div class="sh-card sh-rcard r-' + it.rarity + '" data-id="' + it.id + '"><span class="sh-ribbon">' + RLABEL[it.rarity] + '</span>'
        + '<div class="sh-cfig">' + figFor(it, 4) + '</div>'
        + '<span class="sh-rmeta">' + icon(it, 'sh-ricon') + '<span><span class="sh-cn">' + esc(it.name) + '</span><span class="sh-cl">' + LOOKNAME[it.ctx] + (it.slot === 'idle' ? ' · Idle' : '') + '</span></span></span>'
        + '<span class="sh-chips">' + dupNote(r) + '</span></div></div>';
    } else {
      var gained = res.filter(function(x){ return !x.dup; }).length, back = res.reduce(function(a, x){ return a + (x.refund || 0); }, 0);
      /* THE HAND: best first, and the best pull stands bigger than the rest */
      var hand = res.slice().sort(function(a, b){ return PK.RANK.indexOf(b.item.rarity) - PK.RANK.indexOf(a.item.rarity); });
      html += '<div class="sh-cards many sh-hand">' + hand.map(function(x, j){ return j ? card(x) : card(x, true); }).join('') + '</div>'
        + '<p class="sh-ovs">' + gained + ' new' + (back ? ' · ' + money(back) + ' coins back for duplicates' : '') + '</p>';
    }
    html += '<div class="sh-ovbtns">';
    if (one && !r.dup && it.slot) html += '<button type="button" class="k-btn sh-wear">Put it on</button>';
    html += '<button type="button" class="k-btn k-sec sh-done">' + (one ? 'Nice' : 'Done') + '</button></div></div>';
    phase('reveal', html);
    if (one) flash(RCOL[it.rarity]);
    if (big) boom(RCOL[it.rarity]);
    var w = ov.querySelector('.sh-wear');
    if (w) w.onclick = function(){ var ctx = it.ctx === 'court' ? 'court' : 'street'; W.equip(ctx, it.slot, it.id); w.disabled = true; w.textContent = 'On him now'; };
    ov.querySelector('.sh-done').onclick = closeOv;
  }

  function showChoose(){
    var pend = S.pending(); if (!pend) return;
    openOv('is-ex', [RCOL.legendary, '#5a3e0a']);
    phase('choose', '<div class="sh-ovt">Choose one legendary</div><div class="sh-cards many sh-choose">' + pend.offer.map(function(it, i){
      return '<button type="button" class="sh-card sh-pick r-legendary" style="--rc:' + RCOL.legendary + ';animation-delay:' + (i * 140) + 'ms" data-choose="' + it.id + '"><div class="sh-cfig">' + figFor(it, 2) + '</div>'
        + '<b class="sh-cr">Legendary</b><span class="sh-cn">' + esc(it.name) + '</span><span class="sh-cl">' + LOOKNAME[it.ctx] + '</span>'
        + (W.owns(it.id) ? '<span class="sh-cd dup">You have it</span>' : '<span class="sh-cd">Take it</span>') + '</button>';
    }).join('') + '</div><button type="button" class="sh-skip sh-later">Later</button>');
    ov.querySelectorAll('[data-choose]').forEach(function(b){ b.onclick = function(){
      var rr = S.choose(pend.id, b.getAttribute('data-choose'));
      if (!rr || rr.err) { closeOv(); msg = errText(rr && rr.err); draw(); return; }
      reveal([rr], 'Your legendary', { exchange: 'legendary' });
    }; });
    ov.querySelector('.sh-later').onclick = closeOv;
  }

  /* confetti, for an epic or better: one canvas, gone when it lands */
  function boom(col){
    if (reduced() || !ov) return;
    var cv = document.createElement('canvas'); cv.className = 'sh-conf'; ov.appendChild(cv);
    var w = cv.width = innerWidth, h = cv.height = innerHeight, x = cv.getContext('2d'); if (!x) return;
    var cols = [col, '#ffffff', '#f2c23a', col], bits = [];
    for (var i = 0; i < 90; i++) { var side = i % 2; bits.push({ x: side ? w + 10 : -10, y: h * 0.62, vx: (side ? -1 : 1) * (4 + Math.random() * 7), vy: -(8 + Math.random() * 9), s: 4 + Math.floor(Math.random() * 3) * 2, c: cols[i % 4], r: Math.random() * 6 }); }
    var t0 = performance.now();
    (function tick(t){
      if (!cv.parentNode) return;
      x.clearRect(0, 0, w, h);
      bits.forEach(function(b){ b.vy += 0.32; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; x.fillStyle = b.c; x.fillRect(Math.round(b.x), Math.round(b.y), b.s, Math.max(2, b.s * Math.abs(Math.cos(b.r + t / 120)))); });
      if (t - t0 < 2600) requestAnimationFrame(tick); else if (cv.parentNode) cv.parentNode.removeChild(cv);
    })(t0);
  }

  draw();
  cur = { host: host, draw: draw, ov: function(){ return ov; } };
}
var cur = null;
if (W) W.onChange(function(){ if (cur && document.body.contains(cur.host)) cur.draw(); });
if (window.RTF_WALLET) window.RTF_WALLET.onChange(function(){ if (cur && document.body.contains(cur.host)) cur.draw(); });

var CSS = [
/* the shelf */
'.sh{text-align:left;font:600 13px/1.4 var(--k-f-text);color:var(--k-ink-2);}',
'.sh img{image-rendering:pixelated;}',
'.sh-wallet{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:2px 0 12px;padding:8px 10px;background:linear-gradient(180deg,#1d2236,#141826);box-shadow:inset 0 0 0 2px #2c3350,inset 0 -3px 0 0 #0b0e18;}',
'.sh-bal{display:flex;align-items:center;gap:7px;min-width:0;}',
'.sh-coinbig{width:24px;height:24px;filter:drop-shadow(0 0 6px rgba(242,194,58,.55));animation:sh-coinspin 3.2s ease-in-out infinite;}',
'@keyframes sh-coinspin{0%,72%,100%{transform:scaleX(1);}80%{transform:scaleX(.15);}88%{transform:scaleX(1);}}',
'.sh-bal b{font:400 16px var(--k-f-pixel);color:var(--k-gold);text-shadow:0 2px 0 #5a3e0a,0 0 12px rgba(242,194,58,.35);font-variant-numeric:tabular-nums;}',
'.sh-bal i{font:700 11px var(--k-f-text);font-style:normal;color:var(--k-ink-3);text-transform:uppercase;letter-spacing:.08em;}',
'.sh-gems{display:flex;gap:2px;}',
'.sh-gemc{display:flex;align-items:center;gap:2px;padding:3px 4px;background:#0e111c;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc) 45%,transparent);}',
/* a gem is 7 cells and a coin 12: each is drawn at a whole number of pixels a cell */
'.sh-gem{width:14px;height:14px;}',
'.sh-gemc i{font:800 12px var(--k-f-text);font-style:normal;color:var(--rc);font-variant-numeric:tabular-nums;}',
'.sh-coll{display:grid;gap:5px;margin:-4px 0 12px;}',
'.sh-colt{font:600 12px var(--k-f-text);color:var(--k-ink-3);}.sh-colt b{color:var(--k-gold);font-variant-numeric:tabular-nums;}',
'.sh-colbar{display:flex;gap:2px;height:6px;}',
'.sh-colbar i{display:block;min-width:4px;background:linear-gradient(90deg,var(--rc) var(--f),#232840 var(--f));box-shadow:0 0 6px -2px var(--rc);}',
'.sh-msg{background:#3a1d1d;color:#ffd3c8;padding:8px 10px;margin:0 0 10px;box-shadow:inset 3px 0 0 #e0483e;}',
'.sh-sec{margin:16px 0 0;}',
'.sh-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:6px;}',
'.sh-count{font:800 11px var(--k-f-text);color:#16181f;background:var(--k-gold);padding:1px 7px;}',
'.sh-note{margin:0;font-size:12px;color:var(--k-ink-3);}',
'.sh-welcome{margin:0 0 10px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;}',
'.sh-wpack{width:40px;display:block;transform:rotate(-8deg);filter:drop-shadow(0 6px 8px rgba(0,0,0,.5));animation:sh-bob 3s ease-in-out infinite;}',
'.sh-welcome p{margin:6px 0;}',
'.sh-free{display:grid;gap:8px;}',
'.sh-buckets{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;}',
'.sh-bucket{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 8px 10px;border-radius:0;border:2px solid #f4c25a;background:linear-gradient(180deg,#2b2214,#15110a);color:#fff;font:inherit;cursor:pointer;}',
'.sh-bucket b{font-size:20px;font-variant-numeric:tabular-nums;}',
'.sh-bucket i{font-style:normal;font-size:12px;opacity:.8;}',
'.sh-bucket em{font-style:normal;font-size:11px;color:#f4c25a;}',
'.sh-bprice{margin-top:4px;padding:3px 10px;border-radius:0;background:#f4c25a;color:#1d1406;font-weight:800;font-size:13px;}',
'.sh-bucket[disabled]{opacity:.5;cursor:default;}',
'.sh-freecard{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 10px;border:0;cursor:pointer;text-align:left;color:var(--k-ink);',
' background:linear-gradient(100deg,color-mix(in srgb,var(--pa) 30%,#141826),#141826 70%);box-shadow:inset 0 0 0 2px var(--pa),0 0 18px -6px var(--pa);position:relative;overflow:hidden;}',
'.sh-freecard::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.14) 50%,transparent 60%);background-size:260% 100%;animation:sh-foil 3.6s ease-in-out infinite;pointer-events:none;}',
'.sh-fstage{position:relative;height:70px;display:flex;align-items:center;justify-content:center;}',
'.sh-fpack{width:40px;position:relative;z-index:1;animation:sh-bob 2.6s ease-in-out infinite;filter:drop-shadow(0 0 8px var(--pa));}',
'.sh-ftx b{display:block;font:400 11px var(--k-f-pixel);line-height:1.5;color:var(--k-ink);}',
'.sh-ftx i{font:800 11px var(--k-f-text);font-style:normal;color:#7fe0a0;text-transform:uppercase;letter-spacing:.08em;}',
'.sh-fgo{font:800 13px var(--k-f-text);text-transform:uppercase;letter-spacing:.08em;color:#16181f;background:var(--k-gold);padding:10px 14px;box-shadow:inset 0 -3px 0 #a87a12;}',
'.sh-pity{display:grid;gap:5px;margin:4px 0 10px;padding:8px 10px;background:#0f1220;box-shadow:inset 0 0 0 1px #262c44;}',
'.sh-pl{font-size:12px;color:var(--k-ink-2);}.sh-pl b{color:#d9b8ff;}',
'.sh-pcells{display:flex;gap:3px;}',
'.sh-pcells i{flex:1;height:8px;background:#232840;}',
'.sh-pcells i.on{background:linear-gradient(180deg,#d2a8ff,#8a4fd4);box-shadow:0 0 6px rgba(180,124,255,.6);}',
'.sh-pcells i.goal{background:#3a2a5e;box-shadow:inset 0 0 0 1px #b47cff;}',
'.sh-packs{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;}',
'@media (min-width:640px){.sh-packs{grid-template-columns:repeat(2,minmax(0,1fr));}}',
'.sh-pack{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:10px;position:relative;overflow:hidden;',
' background:radial-gradient(120% 90% at 0% 40%,color-mix(in srgb,var(--pa) 34%,transparent),transparent 60%),linear-gradient(180deg,#1a1f32,#121625);',
' box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--pa) 60%,#1a1f32),inset 0 -4px 0 0 rgba(0,0,0,.35);}',
'.sh-stand{position:relative;height:134px;display:flex;align-items:center;justify-content:center;}',
'.sh-rays,.sh-hrays,.sh-rrays{position:absolute;left:50%;top:46%;border-radius:50%;pointer-events:none;background:repeating-conic-gradient(from 0deg,var(--pa) 0deg 8deg,transparent 8deg 24deg);',
' -webkit-mask:radial-gradient(circle,#000 14%,transparent 64%);mask:radial-gradient(circle,#000 14%,transparent 64%);animation:sh-spin 22s linear infinite;}',
'.sh-rays{width:170px;height:170px;margin:-85px 0 0 -85px;opacity:.28;}',
'.sh-fstage .sh-rays{width:100px;height:100px;margin:-50px 0 0 -50px;opacity:.4;}',
'@keyframes sh-spin{to{transform:rotate(360deg);}}',
'.sh-floor{position:absolute;left:18%;right:18%;bottom:6px;height:9px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.6),transparent 70%);animation:sh-shad 3.2s ease-in-out infinite;}',
/* the pack art is 40 by 60 cells: it is 40, 80 or 120 wide, never between */
'.sh-bob{position:relative;width:80px;animation:sh-bob 3.2s ease-in-out infinite;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--pa) 70%,transparent));}',
'.sh-bob::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.32) 50%,transparent 62%);background-size:260% 100%;animation:sh-foil 4.2s ease-in-out 1s infinite;pointer-events:none;mix-blend-mode:screen;}',
'.sh-packimg{width:100%;display:block;}',
'@keyframes sh-bob{0%,100%{transform:translateY(0) rotate(-2deg);}50%{transform:translateY(-7px) rotate(2deg);}}',
'@keyframes sh-shad{0%,100%{transform:scaleX(1);opacity:1;}50%{transform:scaleX(.76);opacity:.6;}}',
'@keyframes sh-foil{0%{background-position:120% 0;}60%,100%{background-position:-60% 0;}}',
'.sh-pinfo{min-width:0;display:flex;flex-direction:column;}',
'.sh-pt{display:flex;flex-direction:column;gap:4px;}',
'.sh-pt b{font:400 12px/1.45 var(--k-f-pixel);color:var(--k-ink);text-shadow:0 2px 0 rgba(0,0,0,.5);}',
'.sh-price{display:inline-flex;align-items:center;gap:5px;font:800 15px var(--k-f-text);color:var(--k-gold);font-variant-numeric:tabular-nums;}',
'.sh-coini{width:12px;height:12px;}',
'.sh-pb{margin:6px 0 6px;font-size:12.5px;}',
'.sh-obar{display:flex;height:6px;gap:1px;margin:0 0 4px;}',
'.sh-obar i{display:block;min-width:2px;}',
'.sh-odds{margin:0 0 8px;font-size:11px;color:var(--k-ink-3);font-variant-numeric:tabular-nums;}',
'.sh-row{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch;margin-top:auto;}',
'.sh-row .k-btn{min-height:44px;padding:10px 16px;font-size:13px;}',
'.sh-open5{display:grid;grid-template-columns:auto auto;grid-template-rows:auto auto;column-gap:8px;align-items:center;min-height:44px;padding:4px 10px;border:0;cursor:pointer;color:var(--k-ink);',
' background:linear-gradient(180deg,#232a44,#181d30);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--pa) 70%,#232a44),inset 0 -3px 0 rgba(0,0,0,.4);font:800 12px var(--k-f-text);text-transform:uppercase;letter-spacing:.06em;text-align:left;}',
'.sh-open5 b{display:inline-flex;align-items:center;gap:4px;color:var(--k-gold);grid-row:1 / span 2;grid-column:2;font-size:13px;letter-spacing:0;}',
'.sh-open5 em{font-style:normal;font-size:9.5px;color:#7fe0a0;}',
'.sh-open5.is-arm,.k-btn.is-arm{filter:brightness(1.3);box-shadow:0 0 0 2px var(--k-gold),0 0 16px rgba(242,194,58,.5);}',
'.sh-ex{display:grid;gap:6px;}',
'.sh-exr{display:grid;grid-template-columns:24px minmax(0,6.5em) minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px 8px;background:#121625;box-shadow:inset 3px 0 0 var(--rc);}',
'.sh-exr.ready{background:linear-gradient(90deg,color-mix(in srgb,var(--rc) 22%,#121625),#121625);animation:sh-ready 1.6s ease-in-out infinite;}',
'@keyframes sh-ready{50%{box-shadow:inset 3px 0 0 var(--rc),0 0 14px -4px var(--rc);}}',
'.sh-gembig{width:21px;height:21px;filter:drop-shadow(0 0 4px var(--rc));}',
'.sh-exn{display:flex;flex-direction:column;line-height:1.15;}',
'.sh-exn b{color:var(--rc);font-size:12px;}.sh-exn i{font-style:normal;font-size:11px;color:var(--k-ink-3);font-variant-numeric:tabular-nums;}',
'.sh-exbar{display:flex;gap:2px;}',
'.sh-exbar i{flex:1;height:8px;background:#232840;}',
'.sh-exbar i.on{background:var(--rc);box-shadow:0 0 5px var(--rc);}',
'.sh-xbtn{min-height:38px;white-space:nowrap;}',
'.sh-xbtn[disabled]{opacity:.4;cursor:default;}',
'.sh-choosebar{margin:0 0 10px;}',
/* the show */
'.sh-ov{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px 14px;overflow-y:auto;overflow-x:hidden;text-align:center;',
' background:radial-gradient(circle at 50% 38%,color-mix(in srgb,var(--pa) 30%,#0b0e18),#05070d 72%);font:600 13px/1.4 var(--k-f-text);color:var(--k-ink-2);animation:sh-ovin .25s ease-out;}',
'@keyframes sh-ovin{from{opacity:0;}to{opacity:1;}}',
'.sh-ov img{image-rendering:pixelated;}',
'.sh-ovt{font:400 13px/1.6 var(--k-f-pixel);color:var(--k-ink);text-shadow:0 2px 0 rgba(0,0,0,.6);letter-spacing:.04em;}',
'.sh-x5{display:inline-block;margin-left:8px;font-size:10px;color:#16181f;background:var(--k-gold);padding:2px 6px;}',
'.sh-ovs{margin:0;font-size:12px;color:var(--k-ink-3);font-variant-numeric:tabular-nums;}',
'.sh-hero{position:relative;width:240px;height:260px;border:0;background:none;cursor:pointer;padding:0;}',
'.sh-hrays{width:340px;height:340px;margin:-170px 0 0 -170px;opacity:.3;animation-duration:14s;}',
'.sh-halo{position:absolute;left:50%;top:46%;width:200px;height:200px;margin:-100px 0 0 -100px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--pa) 70%,transparent),transparent 70%);pointer-events:none;}',
'.sh-float{position:absolute;left:50%;top:50%;width:120px;height:180px;margin:-98px 0 0 -60px;animation:sh-bob 2.6s ease-in-out infinite;}',
'.sh-pbody,.sh-ptop{position:absolute;inset:0;}',
'.sh-heroimg{width:100%;height:100%;display:block;filter:drop-shadow(0 12px 16px rgba(0,0,0,.6));}',
'.sh-ptop{clip-path:inset(0 0 88% 0);}.sh-pbody{clip-path:inset(12% 0 0 0);}',
'.sh-hfloor{position:absolute;left:30%;right:30%;bottom:10px;height:12px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.65),transparent 70%);}',
'.sh-hero.rip .sh-float{animation:sh-shake .34s linear;}',
'.sh-hero.rip .sh-ptop{animation:sh-tear .5s cubic-bezier(.3,.7,.4,1) .3s forwards;}',
'.sh-hero.rip .sh-pbody{animation:sh-drop .5s ease-in .38s forwards;}',
'.sh-hero.rip .sh-halo{animation:sh-flash .6s ease-out .3s forwards;}',
'.sh-hero.rip .sh-hrays{animation:sh-spin 1.2s linear infinite,sh-fade .5s ease .4s forwards;}',
'@keyframes sh-shake{20%{transform:translateX(-6px) rotate(-4deg);}40%{transform:translateX(6px) rotate(4deg);}60%{transform:translateX(-4px) rotate(-3deg);}80%{transform:translateX(3px) rotate(2deg);}}',
'@keyframes sh-tear{to{transform:translate(44px,-80px) rotate(28deg);opacity:0;}}',
'@keyframes sh-drop{30%{filter:brightness(2.4);}100%{transform:translateY(28px) scale(.6);opacity:0;filter:brightness(1.6);}}',
'@keyframes sh-flash{40%{transform:scale(1.9);opacity:1;background:radial-gradient(circle,#fff 0%,var(--pa) 30%,transparent 70%);}100%{transform:scale(2.4);opacity:0;}}',
'@keyframes sh-fade{to{opacity:0;}}',
'.sh-tear{min-height:48px;padding:12px 24px;}',
'.sh-reel{position:relative;width:min(100%,460px);height:156px;overflow:hidden;background:linear-gradient(180deg,#121625,#0b0e18);box-shadow:inset 0 0 0 2px var(--pa),inset 0 0 30px rgba(0,0,0,.6),0 0 24px -6px var(--pa);}',
'.sh-reel::before,.sh-reel::after{content:"";position:absolute;top:0;bottom:0;width:54px;z-index:3;pointer-events:none;}',
'.sh-reel::before{left:0;background:linear-gradient(90deg,#0b0e18,transparent);}.sh-reel::after{right:0;background:linear-gradient(270deg,#0b0e18,transparent);}',
'.sh-reel.tense{animation:sh-tense 1s ease-in-out infinite;}',
'@keyframes sh-tense{50%{box-shadow:inset 0 0 0 2px var(--pa),inset 0 0 30px rgba(0,0,0,.6),0 0 44px 2px var(--pa);}}',
'.sh-strip{position:absolute;top:12px;left:0;display:flex;gap:' + GAP + 'px;will-change:transform;}',
'.sh-cell{flex:0 0 ' + CELL + 'px;height:132px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:6px 4px;',
' background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 26%,#121625),#121625 64%);box-shadow:inset 0 0 0 2px var(--rc);}',
'.sh-cell b{font:800 8.5px var(--k-f-text);text-transform:uppercase;letter-spacing:.08em;color:var(--rc);}',
'.sh-cicon{width:64px;height:64px;filter:drop-shadow(0 4px 4px rgba(0,0,0,.5));}',
'.sh-cell i{font:700 10px/1.15 var(--k-f-text);font-style:normal;color:var(--k-ink);max-height:24px;overflow:hidden;}',
'.sh-cell.win{box-shadow:inset 0 0 0 3px var(--rc),0 0 26px var(--rc);animation:sh-pop .55s ease;}',
'@keyframes sh-pop{45%{transform:scale(1.1);}}',
'.sh-reel.landed .sh-cell:not(.win){opacity:.45;transition:opacity .4s;}',
'.sh-ptr{position:absolute;left:50%;top:0;bottom:0;width:3px;margin-left:-1.5px;z-index:4;background:var(--k-gold);box-shadow:0 0 12px 2px var(--k-gold);}',
'.sh-ptr::before,.sh-ptr::after{content:"";position:absolute;left:50%;transform:translateX(-50%);border-left:8px solid transparent;border-right:8px solid transparent;}',
'.sh-ptr::before{top:0;border-top:10px solid var(--k-gold);}.sh-ptr::after{bottom:0;border-bottom:10px solid var(--k-gold);}',
'.sh-skip{border:0;background:none;color:var(--k-ink-3);font:800 12px var(--k-f-text);text-transform:uppercase;letter-spacing:.1em;text-decoration:underline;text-underline-offset:3px;min-height:40px;cursor:pointer;}',
'.sh-flips{display:flex;flex-wrap:nowrap;justify-content:center;gap:6px;max-width:520px;}',
'.sh-fl{width:62px;height:93px;perspective:700px;transition:transform .25s ease;}',
'.sh-fl.lit{transform:translateY(-8px);}',
'.sh-fl.shake .sh-fli{animation:sh-shake .42s linear;}',
'.sh-thumb{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 30%,#161a2a),#121625 70%);box-shadow:inset 0 0 0 2px var(--rc);}',
'.sh-fl.lit .sh-thumb{box-shadow:inset 0 0 0 2px var(--rc),0 0 16px var(--rc);}',
'.sh-thumb b{font:800 7.5px var(--k-f-text);letter-spacing:.08em;text-transform:uppercase;color:var(--rc);}',
'.sh-ticon{width:48px;height:48px;}',
'.sh-spot{position:relative;min-height:330px;width:min(100%,300px);display:flex;align-items:center;justify-content:center;cursor:pointer;}',
'.sh-spot::before{content:"";position:absolute;left:50%;top:50%;width:460px;height:460px;margin:-230px 0 0 -230px;border-radius:50%;pointer-events:none;opacity:.22;background:repeating-conic-gradient(from 0deg,var(--rc,transparent) 0deg 6deg,transparent 6deg 20deg);-webkit-mask:radial-gradient(circle,#000 12%,transparent 64%);mask:radial-gradient(circle,#000 12%,transparent 64%);animation:sh-spin 18s linear infinite;}',
'.sh-scard{width:100%;padding:20px 12px 12px;z-index:1;animation:sh-rpop .45s cubic-bezier(.2,1.5,.4,1) backwards;}',
'.sh-scard.r-epic,.sh-scard.r-legendary{box-shadow:inset 0 0 0 3px var(--rc),0 0 40px -4px var(--rc);}',
'.sh-scard .sh-cfig{min-height:192px;background:radial-gradient(60% 18% at 50% 96%,rgba(0,0,0,.55),transparent 70%);}',
'.sh-scard .sh-cfig img,.sh-scard .sh-cfig canvas{width:132px;}',
'.sh-scard .sh-rmeta .sh-cn{font-size:22px;}',
'.sh-n5{font:800 11px var(--k-f-text);letter-spacing:.14em;text-transform:uppercase;color:var(--k-ink-3);min-height:14px;font-variant-numeric:tabular-nums;}',
'.sh-flash{position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--fc) 55%,transparent),transparent 65%);animation:sh-flashout .6s ease-out forwards;}',
'@keyframes sh-flashout{from{opacity:1;}to{opacity:0;}}',
'.sh-hand .sh-card.is-best{grid-column:span 2;grid-row:span 2;justify-content:center;padding-top:22px;box-shadow:inset 0 0 0 3px var(--rc),0 0 30px -6px var(--rc);}',
'.sh-hand .sh-card.is-best .sh-cfig{min-height:192px;}',
'.sh-hand .sh-card.is-best .sh-cfig img,.sh-hand .sh-card.is-best .sh-cfig canvas{width:132px;}',
'.sh-fli{position:relative;display:block;width:100%;height:100%;transition:transform .6s cubic-bezier(.2,.7,.2,1);transform-style:preserve-3d;}',
'.sh-fl.on .sh-fli{transform:rotateY(180deg);}',
'.sh-flb,.sh-flf{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;align-items:center;justify-content:center;}',
'.sh-flf{transform:rotateY(180deg);}',
'.sh-flimg{width:40px;}',
'.sh-flf .sh-card{width:100%;height:100%;}',
'.sh-fl.big .sh-flf .sh-card{box-shadow:inset 0 0 0 2px var(--rc),0 0 22px var(--rc);}',
'.sh-reveal{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:520px;}',
'.sh-rwrap{position:relative;display:flex;justify-content:center;padding:10px 0;}',
'.sh-rrays{width:520px;height:520px;margin:-260px 0 0 -260px;top:50%;background:repeating-conic-gradient(from 0deg,var(--rc) 0deg 6deg,transparent 6deg 20deg);opacity:.12;}',
'.sh-rrays.r-rare{opacity:.18;}.sh-rrays.r-epic{opacity:.26;}.sh-rrays.r-legendary{opacity:.36;}',
'.sh-burst{position:absolute;left:50%;top:50%;width:560px;height:560px;border-radius:50%;transform:translate(-50%,-50%) scale(.02);background:radial-gradient(circle,var(--rc) 0%,transparent 68%);animation:sh-burst 1.15s ease-out .1s both;pointer-events:none;}',
'@keyframes sh-burst{0%{transform:translate(-50%,-50%) scale(.02);opacity:.95;}100%{transform:translate(-50%,-50%) scale(1);opacity:0;}}',
'.sh-card{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;padding:8px 6px;background:linear-gradient(180deg,color-mix(in srgb,var(--rc,#aeb4bf) 18%,#161a2a),#121625 60%);border:0;color:var(--k-ink);font:700 12px/1.25 var(--k-f-text);min-width:0;',
' box-shadow:inset 0 0 0 2px var(--rc,#3a4058);position:relative;overflow:hidden;}',
'button.sh-card{cursor:pointer;}',
'.sh-rcard{width:min(300px,86vw);padding:20px 14px 14px;z-index:1;animation:sh-rpop .55s cubic-bezier(.2,1.5,.4,1) .1s backwards;}',
'.sh-rwrap.big .sh-rcard{box-shadow:inset 0 0 0 3px var(--rc),0 0 44px -4px var(--rc);}',
'.sh-rcard::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.14) 50%,transparent 60%);background-size:260% 100%;animation:sh-foil 3.8s ease-in-out .7s infinite;}',
'@keyframes sh-rpop{0%{transform:scale(.55);opacity:0;}70%{transform:scale(1.06);}100%{transform:scale(1);opacity:1;}}',
'.sh-ribbon{position:absolute;top:0;left:50%;transform:translateX(-50%);background:var(--rc);color:#10131d;font:800 10.5px var(--k-f-text);letter-spacing:.14em;text-transform:uppercase;padding:4px 16px;}',
/* a figure is 44 art pixels wide: he is shown at 2, 3 or 4 CSS pixels to
   one (88, 132, 176), never between, or his outline shimmers */
'.sh-cfig{line-height:0;min-height:128px;display:flex;align-items:flex-end;justify-content:center;}',
'.sh-cfig img,.sh-cfig canvas{width:88px;height:auto;image-rendering:pixelated;}',
'.sh-rcard .sh-cfig{min-height:256px;background:radial-gradient(60% 18% at 50% 96%,rgba(0,0,0,.55),transparent 70%);}',
'.sh-rcard .sh-cfig img,.sh-rcard .sh-cfig canvas{width:176px;}',
'.sh-rmeta{display:flex;align-items:center;gap:8px;margin-top:8px;text-align:left;}',
'.sh-ricon{width:48px;height:48px;flex:0 0 auto;}',
'.sh-rmeta .sh-cn{display:block;font:400 26px/1 var(--k-f-display);letter-spacing:.01em;text-transform:uppercase;color:var(--k-ink);}',
'.sh-rmeta .sh-cl{display:block;}',
'.sh-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px;}',
'.sh-chip{display:inline-flex;align-items:center;gap:4px;font:800 11px var(--k-f-text);padding:3px 9px;box-shadow:inset 0 0 0 1px var(--rc,#7fe0a0);color:var(--rc,#7fe0a0);}',
'.sh-chip.new{--rc:#7fe0a0;text-transform:uppercase;letter-spacing:.12em;}',
'.sh-chip.gold{--rc:var(--k-gold);}',
'.sh-gemi{width:14px;height:14px;}.sh-coini{width:12px;height:12px;}',
'.sh-cards{display:flex;justify-content:center;gap:8px;margin:4px 0;width:100%;}',
'.sh-cards.many{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));}',
'.sh-choose .sh-card{animation:sh-rpop .5s cubic-bezier(.2,1.5,.4,1) backwards;}',
'.sh-cr{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--rc);}',
'.sh-cn{max-width:100%;overflow:hidden;text-overflow:ellipsis;}',
'.sh-cl{font:600 11px var(--k-f-text);color:var(--k-ink-3);}',
'.sh-cd{font:800 11px var(--k-f-text);color:#7fe0a0;}',
'.sh-cd.dup{color:var(--k-ink-3);}',
'.sh-ovbtns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}',
'.sh-ovbtns .k-btn{min-height:46px;padding:12px 22px;}',
'.sh-conf{position:fixed;inset:0;pointer-events:none;z-index:2;}',
'@media (prefers-reduced-motion:reduce){.sh-ov,.sh-rays,.sh-hrays,.sh-rrays,.sh-bob,.sh-bob::after,.sh-floor,.sh-fpack,.sh-wpack,.sh-freecard::after,.sh-coinbig,.sh-rcard,.sh-rcard::after,.sh-burst,.sh-exr.ready,.sh-choose .sh-card,.sh-scard,.sh-spot::before{animation:none!important;}.sh-burst,.sh-flash{display:none;}}',
].join('\n');
if (typeof document !== 'undefined' && !document.getElementById('rtf-shop-css')) {
  var st = document.createElement('style'); st.id = 'rtf-shop-css'; st.textContent = CSS; document.head.appendChild(st);
}

window.RTF_SHOP = { API_VERSION: API_VERSION, pane: pane, reelItems: reelItems, REEL_WIN: REEL_WIN };
})();
