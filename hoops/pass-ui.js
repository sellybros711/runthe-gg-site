/* Run The Floor: the Floor Pass on screen.
 *
 * window.RTF_PASS_UI. Three things:
 *
 *   - THE BANNER on the front page (#hp-pass): the season, the tier on a
 *     shield, the XP bar, today against the cap, the clock, and a pulsing
 *     count of tiers waiting to be claimed.
 *   - THE TRACK, over the whole screen: a hero with the season's capstone on a
 *     lit plinth, then sixty tiers across, the free lane over the rail and the
 *     premium lane under it, with Claim and Claim all.
 *   - POPS: "+N Pass XP" as play pays, and a tier card when a tier is reached.
 *
 * Every press goes through RTF_WARD.pass; the rules are hoops/pass.js and the
 * pixels hoops/itemart.js. The premium lane ships dark (pass.js
 * PASS_PAID_ENABLED): it is drawn, with a lock, and says it is coming.
 *
 * The CSS is injected by this file, so it caches with it.
 */
(function(){
'use strict';

var API_VERSION = 1;
var W = window.RTF_WARD, P = window.RTF_PASS, A = window.RTF_ART, CAT = window.RTF_CATALOG;
if (!W || !W.pass || !P || !A || !CAT) return;
var PD = W.pass;

var RCOL = { common: '#aeb4bf', rare: '#5b9bff', epic: '#b47cff', legendary: '#f2c23a' };
var PCOL = { street: '#e8660f', league: '#3a6fd8', hof: '#e3a92f', season: '#8a4fd4' };
var PACKNAME = { street: 'Streetball Pack', league: 'League Pack', hof: 'Hall of Fame Pack', season: 'Seasonal Pack' };

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return Math.round(n).toLocaleString('en-US'); }
function reduced(){ try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
function signed(){ return PD.signedIn(); }
function confetti(){ try { if (window.RTF_PAGE && window.RTF_PAGE.confetti) window.RTF_PAGE.confetti(); } catch (e) {} }

/* the pass's mark: a shield with a ball on it, in the season's colours */
var SHIELD = ['.kkkkkkkkkkkk.', 'kaaaaaaaaaaaak', 'kallllllllllak', 'kalbbbbbbbblak', 'kalbbbbbbbblak', 'kalbbbbbbbblak', 'kalbbbbbbbblak',
  'kalbbbbbbbblak', 'kalbbbbbbbblak', 'kalbbbbbbbblak', 'kalbbbbbbbblak', '.kalbbbbbblak.', '..kalbbbblak..', '...kalbblak...', '....kallak....', '.....kaak.....', '......kk......'];
function shieldURL(d){ return A.spriteURL('fps:' + d.accent + d.accent2, SHIELD, { k: '#0b0d16', a: d.accent, l: A.lite ? A.lite(d.accent, 0.45) : '#fff3c0', b: A.dark(d.accent2, 0.7) }, 4); }
function lockURL(){ return A.spriteURL('fplock', ['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kyyyyyyk', 'kyyddyyk', 'kyyddyyk', 'kyyyyyyk', 'kkkkkkkk'], { k: '#0b0d16', y: '#f2c23a', d: '#5a3e0a' }, 4); }

function itemName(id){ var it = CAT.item(id); return it ? it.name : id; }
function itemIcon(id, cls){ var it = CAT.item(id); return it ? A.icon(it, cls) : ''; }
function rewardTitle(r){
  if (r.items && r.items.length) return r.items.map(itemName).join(' + ');
  if (r.pack) return PACKNAME[r.pack];
  if (r.shard && !r.coins) return r.shard[1] + ' ' + r.shard[0] + ' shard' + (r.shard[1] === 1 ? '' : 's');
  if (r.spin && !r.coins) return 'A wheel spin';
  return money(r.coins || 0) + ' coins';
}
function rarityOf(r){
  if (r.items && r.items.length) { var best = 'common', order = ['common', 'rare', 'epic', 'legendary']; r.items.forEach(function(id){ var it = CAT.item(id); if (it && order.indexOf(it.rarity) > order.indexOf(best)) best = it.rarity; }); return best; }
  if (r.pack === 'hof') return 'legendary';
  if (r.pack === 'league') return 'epic';
  if (r.shard && (r.shard[0] === 'legendary' || r.shard[0] === 'epic')) return r.shard[0];
  if (r.pack) return 'rare';
  return 'common';
}
function colOf(r){ return r.items && r.items.length ? RCOL[rarityOf(r)] : r.pack ? PCOL[r.pack] : r.shard ? RCOL[r.shard[0]] : r.spin && !r.coins ? '#ff7ab8' : '#f2c23a'; }
/* the one big picture a tier shows */
function bigIcon(r, cls){
  cls = cls || 'fp-ti';
  if (r.items && r.items.length) return itemIcon(r.items[0], cls + ' it');
  if (r.pack) return A.pack(r.pack, cls + ' pk');
  if (r.shard && !r.coins) return A.gem(r.shard[0], cls);
  if (r.spin && !r.coins) return A.wheelIcon(cls);
  return A.coin(cls);
}
function chips(r){
  var h = '';
  if (r.items) r.items.forEach(function(id){ var it = CAT.item(id); if (it) h += '<span class="fp-chip" style="--fpc:' + RCOL[it.rarity] + '">' + A.icon(it, 'fp-ci') + esc(it.name) + '</span>'; });
  if (r.pack) h += '<span class="fp-chip" style="--fpc:' + PCOL[r.pack] + '">' + A.pack(r.pack, 'fp-cp') + esc(PACKNAME[r.pack]) + '</span>';
  if (r.shard) h += '<span class="fp-chip" style="--fpc:' + RCOL[r.shard[0]] + '">' + A.gem(r.shard[0], 'fp-ci') + r.shard[1] + ' ' + r.shard[0] + '</span>';
  if (r.spin) h += '<span class="fp-chip" style="--fpc:#ff7ab8">' + A.wheelIcon('fp-ci') + 'Spin</span>';
  if (r.coins) h += '<span class="fp-chip">' + A.coin('fp-ci') + money(r.coins) + '</span>';
  return h;
}
function clockText(c){ return c.d > 0 ? c.d + 'd ' + c.h + 'h' : c.h + 'h ' + (c.m < 10 ? '0' : '') + c.m + 'm'; }

/* ─── the banner on the front page ─────────────────────────────────────── */
function banner(){
  var el = $('hp-pass'); if (!el) return;
  var s = P.season(), d = P.def(s.n);
  var vars = 'style="--fpa:' + d.accent + ';--fpb:' + d.accent2 + '"';
  if (!signed()) {
    el.innerHTML = '<button type="button" class="fp-ban guest" ' + vars + ' data-fp="open"><span class="fp-bshine"></span><img class="fp-shield" alt="" src="' + shieldURL(d) + '">'
      + '<span class="fp-bt"><i>Floor Pass · Season ' + s.n + '</i><b>' + esc(d.name) + '</b><em>Sign in to climb 60 tiers of gear.</em></span>'
      + '<span class="fp-cap">' + itemIcon(d.capstone, 'fp-capi') + '</span></button>';
    el.hidden = false; wire(el); return;
  }
  var st = PD.state(); if (!st) { el.hidden = true; return; }
  var pct = st.tier >= P.TIERS ? 100 : Math.round(st.into / st.need * 100), tpct = Math.round(st.today / st.cap * 100);
  el.innerHTML = '<button type="button" class="fp-ban' + (st.claimable ? ' hot' : '') + '" ' + vars + ' data-fp="open"><span class="fp-bshine"></span>'
    + '<span class="fp-tierb"><img class="fp-shield" alt="" src="' + shieldURL(d) + '"><b>' + st.tier + '</b></span>'
    + '<span class="fp-bt"><i>Floor Pass · ' + esc(d.name) + '</i>'
    + '<span class="fp-bar"><i style="width:' + pct + '%"></i></span>'
    + '<em>' + (st.tier >= P.TIERS ? 'Every tier reached' : money(st.need - st.into) + ' XP to tier ' + (st.tier + 1)) + ' · ' + clockText(P.countdown(s.n)) + ' left</em>'
    + '<span class="fp-today"><span class="fp-tbar"><i style="width:' + tpct + '%"></i></span><span>Today ' + money(st.today) + ' / ' + money(st.cap) + ' XP</span></span></span>'
    + (st.claimable ? '<span class="fp-claimb">' + st.claimable + '</span>' : '<span class="fp-cap">' + itemIcon(d.capstone, 'fp-capi') + '</span>') + '</button>';
  el.hidden = false; wire(el);
}
function wire(el){ el.querySelectorAll('[data-fp]').forEach(function(b){ b.onclick = function(){ open(); }; }); }

/* HE WEARS IT: the player the front page shows, tried on in the season's
   tier 60 pieces and doing the capstone idle. Display only, owned or not. */
function heroFig(ids){
  var B = window.RTF_BALLER, CU = window.RTF_CAREER_UI;
  if (!B || !B.img || !CU || !CU.me || !W.dress) return '';
  try {
    var me = CU.me(), lo = W.loadout('street');
    ids.forEach(function(id){ var it = CAT.item(id); if (it && (it.ctx === 'street' || it.ctx === 'both')) lo[it.slot] = id; });
    var opts = W.dress({ c1: me.c1, c2: me.c2, num: me.num, pose: 'stand', scale: 3, still: false }, 'street', lo, true);
    if (W.idle) opts = W.idle(opts, 'street', lo, true);
    return '<span class="fp-fig">' + B.img(me.look, opts, 'fp-figimg') + '</span>';
  } catch (e) { return ''; }
}

/* ─── the track ────────────────────────────────────────────────────────── */
var ov = null, clockT = null;
function close(){ if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; clearInterval(clockT); document.removeEventListener('keydown', onKey); banner(); }
function onKey(e){ if (e.key === 'Escape') close(); }
function open(){
  if (!signed()) { try { if (window.RTF_PAGE && window.RTF_PAGE.openProfile) window.RTF_PAGE.openProfile(); } catch (e) {} return; }
  PD.settle();
  hideTier();
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'fp-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Floor Pass');
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
  }
  draw(true);
}
function cell(t, lane, st, paidOpen){
  var r = P.reward(t, lane, st.season.n), reached = st.tier >= t, got = PD.claimed(t, lane), locked = lane === 'prem' && !paidOpen;
  var big = !!(r.items || r.pack), cls = 'fp-cell ' + lane + (big ? ' big' : '') + (got ? ' got' : reached && !locked ? ' ready' : '') + (!reached ? ' dim' : '') + (locked ? ' lock' : '');
  return '<div class="' + cls + '" style="--fpc:' + colOf(r) + '" data-tier="' + t + '" data-lane="' + lane + '"' + (reached && !got && !locked ? ' role="button" tabindex="0" aria-label="Claim tier ' + t + '"' : '') + '>'
    + '<span class="fp-cglow"></span>' + bigIcon(r)
    + '<span class="fp-cn">' + esc(r.items ? itemName(r.items[0]) + (r.items.length > 1 ? ' +' + (r.items.length - 1) : '') : r.pack ? PACKNAME[r.pack].replace(' Pack', '') : r.shard && !r.coins ? r.shard[0] : r.spin && !r.coins ? 'Spin' : money(r.coins)) + '</span>'
    + (got ? '<span class="fp-got">Got</span>' : reached && !locked ? '<span class="fp-claim">Claim</span>' : '')
    + (locked ? '<img class="fp-lk" alt="Locked" src="' + lockURL() + '">' : '') + '</div>';
}
function draw(scroll){
  if (!ov) return;
  var st = PD.state(), s = st.season, d = st.def, paidOpen = PD.paidOpen();
  var pct = st.tier >= P.TIERS ? 100 : Math.round(st.into / st.need * 100), c = P.countdown(s.n);
  var cap = (d.prem || {})[P.TIERS] || [], free60 = (d.free || {})[P.TIERS] || [];
  var h = '<div class="fp-box" style="--fpa:' + d.accent + ';--fpb:' + d.accent2 + '">'
    + '<div class="fp-head"><img class="fp-shield sm" alt="" src="' + shieldURL(d) + '"><div class="fp-ht"><i>Floor Pass · Season ' + s.n + '</i><b>' + esc(d.name) + '</b></div>'
    + '<span class="fp-clock" data-clock>' + c.d + 'd ' + c.h + 'h ' + c.m + 'm ' + c.s + 's</span><button type="button" class="fp-x" aria-label="Close">x</button></div>'
    /* the hero: the capstones on a lit plinth */
    + '<div class="fp-hero"><span class="fp-rays"></span><span class="fp-spot"></span>'
    + '<div class="fp-plinth">' + cap.map(function(id, i){ return '<span class="fp-pz p' + i + '" style="--fpc:' + RCOL[(CAT.item(id) || {}).rarity || 'legendary'] + '">' + itemIcon(id, 'fp-hi') + '</span>'; }).join('')
    + heroFig(free60.concat(cap)) + '<span class="fp-base"></span></div>'
    + '<div class="fp-hcap"><b>Tier 60</b><span>' + esc(cap.map(itemName).join(' + ')) + '</span><em>Premium. Free lane: ' + esc(free60.map(itemName).join(' + ')) + '.</em></div>'
    + (d.lede ? '<p class="fp-lede">' + esc(d.lede) + '</p>' : '') + '</div>'
    /* where you are */
    + '<div class="fp-me"><span class="fp-tierb lg"><img class="fp-shield" alt="" src="' + shieldURL(d) + '"><b>' + st.tier + '</b></span>'
    + '<div class="fp-mt"><span class="fp-bar lg"><i style="width:' + pct + '%"></i></span>'
    + '<span class="fp-mx">' + (st.tier >= P.TIERS ? 'Every tier reached. Nice season.' : money(st.into) + ' / ' + money(st.need) + ' XP to tier ' + (st.tier + 1)) + '</span>'
    + '<span class="fp-today"><span class="fp-tbar"><i style="width:' + Math.round(st.today / st.cap * 100) + '%"></i></span><span>Today ' + money(st.today) + ' / ' + money(st.cap) + ' XP</span></span></div></div>'
    + (st.claimable ? '<button type="button" class="k-btn fp-all">Claim all (' + st.claimable + ')</button>' : '')
    /* the track */
    + '<div class="fp-lanes"><span class="fp-ln free">Free</span><span class="fp-ln prem">Premium' + (paidOpen ? '' : ' · soon') + '</span></div>'
    + '<div class="fp-track" tabindex="0" aria-label="The tiers">';
  for (var t = 1; t <= P.TIERS; t++) {
    var mile = !!((d.free || {})[t] || (d.prem || {})[t]) || t % 5 === 0;
    h += '<div class="fp-col' + (st.tier >= t ? ' on' : '') + (st.tier + 1 === t ? ' next' : '') + (mile ? ' mile' : '') + '">'
      + cell(t, 'free', st, paidOpen)
      + '<span class="fp-node"><b>' + t + '</b></span>'
      + cell(t, 'prem', st, paidOpen) + '</div>';
  }
  h += '</div>'
    + (paidOpen ? '<p class="fp-note">Premium is open to you as a tester.</p>'
      : '<div class="fp-premcta"><img alt="" src="' + lockURL() + '"><div><b>Premium is coming</b><span>It doubles the packs and carries the season\'s exclusives, ending with ' + esc(cap.map(itemName).join(' and ')) + '. The free lane is yours now.</span></div></div>')
    + '<div class="fp-reveal" aria-live="polite"></div>'
    + '<details class="fp-how"><summary>How the Floor Pass works</summary><ul>'
    + '<li>Play earns Pass XP: ' + P.XP_RATE + ' XP for every coin a game pays, before a Coin Rush doubles it. Quests pay XP too.</li>'
    + '<li>At most ' + money(P.DAY_CAP) + ' XP a day counts, so the season rewards coming back, not one long night.</li>'
    + '<li>' + P.TIERS + ' tiers over ' + P.LEN + ' days. Season ' + s.n + ' ends ' + esc(s.end) + ' (Eastern).</li>'
    + '<li>Anything you reach and forget to claim is paid to you when the season ends.</li>'
    + '<li>The Floor Pass is not Run The Floor Pro. Pro is the endless puzzles.</li></ul></details></div>';
  var keepX = 0, tr0 = ov.querySelector('.fp-track'); if (tr0) keepX = tr0.scrollLeft;
  ov.innerHTML = h;
  ov.querySelector('.fp-x').onclick = close;
  var all = ov.querySelector('.fp-all'); if (all) all.onclick = function(){ claimAll(); };
  ov.querySelectorAll('.fp-cell[role="button"]').forEach(function(el){
    var go = function(){ claimOne(+el.getAttribute('data-tier'), el.getAttribute('data-lane'), el); };
    el.onclick = go; el.onkeydown = function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
  ov.querySelectorAll('.fp-cell.lock').forEach(function(el){ el.onclick = function(){ var p = ov.querySelector('.fp-premcta'); if (p) { p.classList.remove('nudge'); void p.offsetWidth; p.classList.add('nudge'); p.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } }; });
  var tr = ov.querySelector('.fp-track');
  if (scroll) { var nx = tr.querySelector('.fp-col.next') || tr.querySelector('.fp-col:last-child'); if (nx) tr.scrollLeft = Math.max(0, nx.offsetLeft - tr.clientWidth / 2 + nx.clientWidth / 2); }
  else tr.scrollLeft = keepX;
  clearInterval(clockT);
  clockT = setInterval(function(){ var el = ov && ov.querySelector('[data-clock]'); if (!el) return; var k = P.countdown(s.n); el.textContent = k.d + 'd ' + k.h + 'h ' + k.m + 'm ' + k.s + 's'; }, 1000);
}

/* ─── claiming ─────────────────────────────────────────────────────────── */
function show(list){
  var rv = ov && ov.querySelector('.fp-reveal'); if (!rv || !list.length) return;
  var merged = { coins: 0 }, items = [], best = 'common', order = ['common', 'rare', 'epic', 'legendary'];
  list.forEach(function(x){
    var r = P.reward(x.tier, x.lane, x.season || P.season().n);
    if (r.coins) merged.coins += r.coins;
    if (r.items) items = items.concat(r.items);
    ['pack', 'shard', 'spin'].forEach(function(k){ if (r[k] && !merged[k]) merged[k] = r[k]; });
    var ra = rarityOf(r); if (order.indexOf(ra) > order.indexOf(best)) best = ra;
  });
  if (items.length) merged.items = items;
  if (!merged.coins) delete merged.coins;
  var head = list.length === 1 ? 'Tier ' + list[0].tier + (list[0].lane === 'prem' ? ' · Premium' : '') : list.length + ' tiers claimed';
  rv.innerHTML = '<div class="fp-won ' + best + '" style="--fpc:' + RCOL[best] + '"><span class="fp-wrays"></span>' + bigIcon(merged, 'fp-wi')
    + '<b>' + esc(head) + '</b><span class="fp-wt">' + esc(rewardTitle(merged)) + '</span><span class="fp-wc">' + chips(merged) + '</span>'
    + (items.length ? '<span class="fp-wnote">In your closet now.</span>' : merged.pack ? '<span class="fp-wnote">Your pack is waiting in the Shop.</span>' : '') + '</div>';
  rv.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  if (best === 'legendary' || best === 'epic') confetti();
}
function claimOne(t, lane, el){
  if (el && !reduced()) { el.classList.add('popping'); }
  var r = PD.claim(t, lane);
  if (!r || r.err) return;
  setTimeout(function(){ draw(false); show([{ tier: t, lane: lane }]); }, reduced() ? 0 : 260);
}
function claimAll(){
  var r = PD.claimAll(); if (!r || r.err) return;
  draw(false); show(r.all || []);
}

/* ─── pops ─────────────────────────────────────────────────────────────── */
var xpEl = null, xpT = null, xpSum = 0;
function xpPop(n){
  if (!n) return;
  xpSum += n;
  if (!xpEl) { xpEl = document.createElement('div'); xpEl.className = 'fp-xpop'; xpEl.setAttribute('role', 'status'); document.body.appendChild(xpEl); }
  var d = P.def(P.season().n);
  xpEl.style.setProperty('--fpa', d.accent);
  xpEl.innerHTML = '<img alt="" src="' + shieldURL(d) + '"><span>+' + money(xpSum) + ' Pass XP</span>';
  xpEl.classList.add('on');
  clearTimeout(xpT);
  xpT = setTimeout(function(){ xpEl.classList.remove('on'); xpSum = 0; }, 2600);
}
/* one card however many tiers one press crossed: it shows the highest */
var tpEl = null, tpT = null;
function tierPop(tier){
  var d = P.def(P.season().n);
  if (!tpEl) {
    tpEl = document.createElement('button');
    tpEl.type = 'button'; tpEl.className = 'fp-tpop';
    tpEl.onclick = function(){ hideTier(); open(); };
    document.body.appendChild(tpEl);
  }
  tpEl.style.setProperty('--fpa', d.accent); tpEl.style.setProperty('--fpb', d.accent2);
  tpEl.innerHTML = '<span class="fp-tierb"><img class="fp-shield" alt="" src="' + shieldURL(d) + '"><b>' + tier + '</b></span><span><i>Floor Pass</i><b>Tier ' + tier + ' reached</b><em>Tap to claim</em></span>';
  requestAnimationFrame(function(){ if (tpEl) tpEl.classList.add('on'); });
  if (tier % 5 === 0) confetti();
  clearTimeout(tpT);
  tpT = setTimeout(hideTier, 4200);
}
function hideTier(){ clearTimeout(tpT); var el = tpEl; tpEl = null; if (!el) return; el.classList.remove('on'); setTimeout(function(){ el.remove(); }, 320); }
var lastTier = null;
PD.on(function(r){
  var st = PD.state();
  if (!ov && r.kind === 'xp' && r.moved > 0) xpPop(r.moved);
  if (!ov && st && lastTier != null && st.tier > lastTier) tierPop(st.tier);
  if (st) lastTier = st.tier;
  banner();
  if (ov && r.kind !== 'claim') draw(false);
});

function render(){ var st = signed() ? PD.state() : null; lastTier = st ? st.tier : null; banner(); }
if (W.onChange) W.onChange(function(){ banner(); });
if (window.RTF_AUTH && window.RTF_AUTH.onChange) window.RTF_AUTH.onChange(function(){ setTimeout(render, 0); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();

var CSS = [
'.hp-pass{margin:0 0 12px;}',
'.hp-pass img,.fp-ov img,.fp-xpop img,.fp-tpop img{image-rendering:pixelated;}',
'.fp-ban{position:relative;width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:0;cursor:pointer;text-align:left;color:var(--k-ink,#fff);overflow:hidden;',
' background:radial-gradient(70% 140% at 0% 50%,color-mix(in srgb,var(--fpb) 45%,transparent),transparent 70%),radial-gradient(60% 120% at 100% 50%,color-mix(in srgb,var(--fpa) 30%,transparent),transparent 70%),linear-gradient(180deg,#191d33,#0f1220);',
' box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--fpa) 70%,#2c3350),inset 0 -4px 0 rgba(0,0,0,.4);font:600 12px var(--k-f-text,system-ui);}',
'.fp-ban:active{transform:translateY(2px);}',
'.fp-ban.hot{box-shadow:inset 0 0 0 2px var(--fpa),0 0 22px -6px var(--fpa),inset 0 -4px 0 rgba(0,0,0,.4);}',
'.fp-bshine{position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.14) 48%,transparent 60%);transform:translateX(-120%);animation:fp-shine 4.5s ease-in-out infinite;pointer-events:none;}',
'@keyframes fp-shine{0%,55%{transform:translateX(-120%);}85%,100%{transform:translateX(120%);}}',
'.fp-shield{width:48px;height:58px;display:block;filter:drop-shadow(0 4px 0 rgba(0,0,0,.45)) drop-shadow(0 0 10px color-mix(in srgb,var(--fpa) 60%,transparent));}',
'.fp-shield.sm{width:32px;height:39px;}',
'.fp-tierb{position:relative;display:block;line-height:0;}',
'.fp-tierb b{position:absolute;left:0;right:0;top:44%;text-align:center;font:400 13px/1 var(--k-f-pixel,monospace);color:#fff;text-shadow:0 2px 0 #000,0 0 6px #000;}',
'.fp-tierb.lg .fp-shield{width:70px;height:85px;}.fp-tierb.lg b{font-size:18px;}',
'.fp-bt{display:flex;flex-direction:column;gap:4px;min-width:0;}',
'.fp-bt i{font-style:normal;font:800 10px var(--k-f-text);text-transform:uppercase;letter-spacing:.08em;color:var(--fpa);}',
'.fp-bt b{font:400 14px/1.3 var(--k-f-pixel,monospace);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.5);}',
'.fp-bt em,.fp-mx{font-style:normal;font-size:11.5px;color:var(--k-ink-2,#cdd3e6);}',
'.fp-bar{display:block;height:10px;background:#20253c;box-shadow:inset 0 0 0 1px #343c5c;overflow:hidden;}',
'.fp-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--fpb),var(--fpa));box-shadow:0 0 10px var(--fpa);position:relative;}',
'.fp-bar i::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0 6px,transparent 6px 12px);animation:fp-march 1.2s linear infinite;}',
'@keyframes fp-march{to{background-position:12px 0;}}',
'.fp-bar.lg{height:14px;}',
'.fp-today{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--k-ink-3,#8a93b0);font-variant-numeric:tabular-nums;}',
'.fp-tbar{flex:0 0 64px;height:5px;background:#20253c;}.fp-tbar i{display:block;height:100%;background:#7fe0a0;}',
'.fp-cap{line-height:0;}.fp-capi{width:48px;height:48px;filter:drop-shadow(0 0 10px var(--fpa));animation:fp-bob 2.4s ease-in-out infinite;}',
'@keyframes fp-bob{50%{transform:translateY(-4px);}}',
'.fp-claimb{min-width:34px;height:34px;padding:0 8px;display:flex;align-items:center;justify-content:center;background:#e0483e;color:#fff;font:400 12px var(--k-f-pixel,monospace);box-shadow:0 0 0 3px #11141f,0 0 16px rgba(224,72,62,.7);animation:fp-pulse 1.3s ease-in-out infinite;}',
'@keyframes fp-pulse{50%{transform:scale(1.12);}}',
'.fp-ban.guest em{color:var(--k-ink-3,#8a93b0);}',
/* the screen */
'.fp-ov{position:fixed;inset:0;z-index:89;display:flex;justify-content:center;align-items:flex-start;overflow-y:auto;padding:12px 10px 28px;background:radial-gradient(circle at 50% 10%,#1b1f3b,#05070d 70%);animation:fp-in .22s ease-out;font:600 13px/1.4 var(--k-f-text,system-ui);color:var(--k-ink-2,#cdd3e6);}',
'@keyframes fp-in{from{opacity:0;}to{opacity:1;}}',
'.fp-box{width:100%;max-width:640px;}',
'.fp-head{display:flex;align-items:center;gap:10px;padding:10px;background:linear-gradient(180deg,#1d2236,#141826);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--fpa) 55%,#2c3350);}',
'.fp-ht{flex:1;min-width:0;display:flex;flex-direction:column;}.fp-ht i{font-style:normal;font:800 10px var(--k-f-text);text-transform:uppercase;letter-spacing:.08em;color:var(--fpa);}',
'.fp-ht b{font:400 12px/1.4 var(--k-f-pixel,monospace);color:#fff;}',
'.fp-head{flex-wrap:wrap;}@media (max-width:440px){.fp-clock{order:3;flex-basis:100%;text-align:center;}}',
'.fp-clock{font:800 12px var(--k-f-text);color:#fff;font-variant-numeric:tabular-nums;padding:6px 8px;background:#0e1120;box-shadow:inset 0 0 0 1px #343c5c;white-space:nowrap;}',
'.fp-x{border:0;background:#262c44;color:#fff;min-width:40px;min-height:40px;font:800 15px var(--k-f-text);cursor:pointer;}',
'.fp-hero{position:relative;margin-top:10px;padding:8px 12px 12px;overflow:hidden;text-align:center;background:radial-gradient(60% 80% at 50% 70%,color-mix(in srgb,var(--fpb) 50%,transparent),transparent 75%),linear-gradient(180deg,#0d1020,#161a2e);box-shadow:inset 0 0 0 2px #262c44;}',
'.fp-rays{position:absolute;left:50%;top:46%;width:620px;height:620px;margin:-310px;border-radius:50%;background:repeating-conic-gradient(var(--fpa) 0 6deg,transparent 6deg 20deg);opacity:.16;-webkit-mask:radial-gradient(circle,#000 8%,transparent 60%);mask:radial-gradient(circle,#000 8%,transparent 60%);animation:fp-spin 30s linear infinite;pointer-events:none;}',
'@keyframes fp-spin{to{transform:rotate(360deg);}}',
'.fp-spot{position:absolute;left:50%;top:-10%;width:60%;height:110%;transform:translateX(-50%);background:linear-gradient(180deg,rgba(255,240,200,.18),transparent 80%);clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);pointer-events:none;}',
'.fp-plinth{position:relative;display:flex;justify-content:center;align-items:flex-end;gap:4px;height:196px;}',
'.fp-pz{position:relative;z-index:1;display:block;line-height:0;filter:drop-shadow(0 0 16px var(--fpc));animation:fp-bob 2.6s ease-in-out infinite;}',
'.fp-pz.p1{animation-delay:-1.3s;order:3;}',
'.fp-fig{position:relative;z-index:2;order:2;display:block;line-height:0;filter:drop-shadow(0 8px 10px rgba(0,0,0,.6)) drop-shadow(0 0 18px color-mix(in srgb,var(--fpa) 45%,transparent));}',
'.fp-figimg{height:176px;width:auto;image-rendering:pixelated;}',
'.fp-plinth .fp-pz{align-self:center;}',
'.fp-hi{width:72px;height:72px;}',
'.fp-base{position:absolute;bottom:0;left:50%;width:240px;height:26px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,color-mix(in srgb,var(--fpa) 60%,transparent),transparent 70%);}',
'.fp-hcap{position:relative;display:flex;flex-direction:column;gap:2px;margin-top:6px;}',
'.fp-hcap b{font:400 11px var(--k-f-pixel,monospace);color:var(--fpa);}.fp-hcap span{font:800 15px var(--k-f-text);color:#fff;}.fp-hcap em{font-style:normal;font-size:11.5px;color:var(--k-ink-3,#8a93b0);}',
'.fp-lede{position:relative;margin:6px 0 0;font-size:12px;color:var(--k-ink-2,#cdd3e6);}',
'.fp-me{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;margin-top:10px;padding:10px 12px;background:linear-gradient(180deg,#1a1f34,#121626);box-shadow:inset 0 0 0 2px #2c3350;}',
'.fp-mt{display:flex;flex-direction:column;gap:6px;min-width:0;}',
'.fp-all{width:100%;margin-top:8px;min-height:48px;animation:fp-pulse 1.6s ease-in-out infinite;}',
'.fp-lanes{display:flex;justify-content:space-between;margin:14px 0 6px;font:400 10px var(--k-f-pixel,monospace);}',
'.fp-ln.free{color:#7fe0a0;}.fp-ln.prem{color:var(--fpa);}',
'.fp-track{display:flex;gap:6px;overflow-x:auto;padding:4px 2px 12px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:thin;}',
'.fp-col{flex:0 0 92px;display:flex;flex-direction:column;align-items:stretch;gap:6px;scroll-snap-align:center;}',
'.fp-node{position:relative;height:28px;display:flex;align-items:center;justify-content:center;}',
'.fp-node::before{content:"";position:absolute;left:-3px;right:-3px;top:50%;height:6px;margin-top:-3px;background:#20253c;}',
'.fp-col.on .fp-node::before{background:linear-gradient(90deg,var(--fpb),var(--fpa));box-shadow:0 0 8px var(--fpa);}',
'.fp-node b{position:relative;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;font:400 10px var(--k-f-pixel,monospace);color:var(--k-ink-3,#8a93b0);background:#151a2b;box-shadow:0 0 0 2px #2c3350;}',
'.fp-col.on .fp-node b{color:#0b0d16;background:var(--fpa);box-shadow:0 0 0 2px #0b0d16,0 0 10px var(--fpa);}',
'.fp-col.next .fp-node b{box-shadow:0 0 0 2px var(--fpa);color:#fff;animation:fp-pulse 1.4s ease-in-out infinite;}',
'.fp-col.mile .fp-node b{min-width:32px;}',
'.fp-cell{position:relative;height:118px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px 4px;overflow:hidden;',
' background:linear-gradient(180deg,color-mix(in srgb,var(--fpc) 14%,#171b2c),#11141f);box-shadow:inset 0 0 0 1px #2a3048;}',
'.fp-cell.prem{background:linear-gradient(180deg,color-mix(in srgb,var(--fpa) 16%,#1a1626),#11141f);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fpa) 40%,#2a3048);}',
'.fp-cell.big{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--fpc) 70%,transparent);}',
'.fp-cglow{position:absolute;inset:-30%;background:radial-gradient(circle,color-mix(in srgb,var(--fpc) 40%,transparent),transparent 60%);opacity:.5;pointer-events:none;}',
'.fp-ti{position:relative;width:46px;height:46px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5));}.fp-ti.pk{width:32px;height:48px;}.fp-ti.it{width:56px;height:56px;}',
'.fp-cn{position:relative;font:800 10px/1.2 var(--k-f-text);color:var(--k-ink,#fff);text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:capitalize;}',
'.fp-cell.dim{filter:saturate(.45) brightness(.62);}',
'.fp-cell.ready{cursor:pointer;box-shadow:inset 0 0 0 2px var(--fpc),0 0 18px -4px var(--fpc);animation:fp-ready 1.5s ease-in-out infinite;}',
'.fp-cell.ready .fp-cglow{opacity:1;animation:fp-pulse 1.5s ease-in-out infinite;}',
'@keyframes fp-ready{50%{transform:translateY(-3px);}}',
'.fp-claim{position:relative;padding:2px 8px;background:var(--fpc);color:#0b0d16;font:800 10px var(--k-f-text);text-transform:uppercase;letter-spacing:.06em;}',
'.fp-cell.got{background:linear-gradient(180deg,rgba(47,174,106,.18),#11141f);box-shadow:inset 0 0 0 1px #2fae6a;}',
'.fp-got{position:absolute;top:5px;right:5px;font:800 9px var(--k-f-text);color:#7fe0a0;text-transform:uppercase;transform:rotate(8deg);box-shadow:inset 0 0 0 2px #7fe0a0;padding:2px 4px;}',
'.fp-cell.lock{filter:saturate(.55) brightness(.7);}',
'.fp-lk{position:absolute;top:5px;right:5px;width:16px;height:18px;}',
'.fp-cell.popping{animation:fp-popc .26s ease-in forwards;}',
'@keyframes fp-popc{60%{transform:scale(1.12);filter:brightness(1.8);}100%{transform:scale(.9);opacity:.4;}}',
'.fp-note{font-size:11.5px;color:var(--k-ink-3,#8a93b0);text-align:center;}',
'.fp-premcta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;margin-top:6px;padding:10px 12px;background:linear-gradient(90deg,color-mix(in srgb,var(--fpa) 20%,#121625),#121625);box-shadow:inset 3px 0 0 var(--fpa);}',
'.fp-premcta img{width:24px;height:27px;}.fp-premcta b{display:block;font:400 11px/1.5 var(--k-f-pixel,monospace);color:var(--fpa);}.fp-premcta span{font-size:12px;}',
'.fp-premcta.nudge{animation:fp-nudge .5s ease;}',
'@keyframes fp-nudge{25%{transform:translateX(-6px);}75%{transform:translateX(6px);}}',
'.fp-reveal{margin-top:10px;}',
'.fp-won{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 14px;overflow:hidden;text-align:center;background:linear-gradient(180deg,color-mix(in srgb,var(--fpc) 24%,#161a2a),#121625);box-shadow:inset 0 0 0 2px var(--fpc),0 0 30px -6px var(--fpc);animation:fp-wpop .5s cubic-bezier(.2,1.5,.4,1);}',
'.fp-wrays{position:absolute;left:50%;top:36%;width:420px;height:420px;margin:-210px;border-radius:50%;background:repeating-conic-gradient(var(--fpc) 0 7deg,transparent 7deg 22deg);opacity:.22;-webkit-mask:radial-gradient(circle,#000 10%,transparent 62%);mask:radial-gradient(circle,#000 10%,transparent 62%);animation:fp-spin 18s linear infinite;pointer-events:none;}',
'.fp-won.legendary .fp-wrays,.fp-won.epic .fp-wrays{opacity:.38;}',
'@keyframes fp-wpop{0%{transform:scale(.6);opacity:0;}70%{transform:scale(1.05);}100%{transform:scale(1);opacity:1;}}',
'.fp-wi{position:relative;width:84px;height:84px;filter:drop-shadow(0 6px 8px rgba(0,0,0,.5)) drop-shadow(0 0 14px var(--fpc));}.fp-wi.pk{width:56px;height:84px;}',
'.fp-won b{position:relative;font:400 12px/1.5 var(--k-f-pixel,monospace);color:var(--fpc);}',
'.fp-wt{position:relative;font:800 15px var(--k-f-text);color:#fff;}',
'.fp-wc{position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:4px;}',
'.fp-wnote{position:relative;font-size:11.5px;color:var(--k-ink-3,#8a93b0);}',
'.fp-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;font:800 11px var(--k-f-text);color:var(--fpc,#f2c23a);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fpc,#f2c23a) 50%,transparent);background:rgba(0,0,0,.25);white-space:nowrap;text-transform:capitalize;}',
'.fp-ci{width:14px;height:14px;}.fp-cp{width:11px;height:16px;}',
'.fp-how{margin-top:12px;background:#121625;box-shadow:inset 0 0 0 1px #262c44;padding:8px 10px;}',
'.fp-how summary{cursor:pointer;font:700 12px var(--k-f-text);color:#fff;}.fp-how ul{margin:8px 0 0;padding-left:18px;font-size:12px;}.fp-how li{margin:3px 0;}',
/* pops */
'.fp-xpop{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 102px);z-index:90;transform:translate(-50%,-8px);opacity:0;pointer-events:none;display:flex;align-items:center;gap:7px;',
' padding:6px 12px 6px 8px;background:#0f1226;border:1px solid var(--fpa,#f2b632);color:#fff;font:700 13px/1 var(--k-f-text,system-ui);font-variant-numeric:tabular-nums;box-shadow:0 6px 18px rgba(0,0,0,.45),0 0 14px -4px var(--fpa,#f2b632);transition:opacity .2s,transform .2s;}',
'.fp-xpop.on{opacity:1;transform:translate(-50%,0);}',
'.fp-xpop img{width:18px;height:22px;}',
'.fp-tpop{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 156px);z-index:95;display:flex;align-items:center;gap:12px;padding:10px 16px 10px 10px;border:0;cursor:pointer;text-align:left;color:#fff;',
' transform:translate(-50%,-20px) scale(.85);opacity:0;transition:transform .35s cubic-bezier(.2,1.5,.4,1),opacity .25s;',
' background:radial-gradient(80% 140% at 0% 50%,color-mix(in srgb,var(--fpb) 50%,transparent),transparent 70%),linear-gradient(180deg,#1d2140,#0f1226);box-shadow:inset 0 0 0 2px var(--fpa),0 12px 30px rgba(0,0,0,.6),0 0 30px -6px var(--fpa);}',
'.fp-tpop.on{transform:translate(-50%,0) scale(1);opacity:1;}',
'.fp-tpop i{display:block;font-style:normal;font:800 10px var(--k-f-text);text-transform:uppercase;letter-spacing:.08em;color:var(--fpa);}',
'.fp-tpop b{display:block;font:400 12px/1.5 var(--k-f-pixel,monospace);}.fp-tpop em{font-style:normal;font-size:11px;color:var(--k-ink-3,#8a93b0);}',
'@media (prefers-reduced-motion:reduce){.fp-bshine,.fp-bar i::after,.fp-capi,.fp-claimb,.fp-rays,.fp-pz,.fp-all,.fp-col.next .fp-node b,.fp-cell.ready,.fp-cell.ready .fp-cglow,.fp-wrays,.fp-won,.fp-ov{animation:none!important;}.fp-xpop,.fp-tpop{transition:none;}}',
].join('\n');
if (!document.getElementById('rtf-pass-css')) { var st = document.createElement('style'); st.id = 'rtf-pass-css'; st.textContent = CSS; document.head.appendChild(st); }

window.RTF_PASS_UI = { API_VERSION: API_VERSION, open: open, close: close, render: render, _shield: SHIELD };
})();
