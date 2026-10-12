/* Run The Floor: the daily loop on screen.
 *
 * window.RTF_DAILY_UI. Three things:
 *
 *   - THE STRIP on the front page (#hp-daily): the streak's flame, the wheel
 *     with its spins, the quests done today. A guest gets one card saying
 *     what an account adds.
 *   - THE HUB, over the whole screen: Floor Rep at the top, then the Wheel,
 *     the Streak and the Quests.
 *   - A REWARD POP when a login slot, a streak day or a quest pays.
 *
 * Every press goes through RTF_WARD.daily; the rules are hoops/daily.js and
 * the pixels hoops/itemart.js. A WHEEL SPIN IS DECIDED BEFORE IT TURNS, the
 * pack reel's rule: the wedge it stops on IS the prize, and check-daily.mjs
 * reads the angle and compares.
 *
 * The CSS is injected by this file, so it caches with it.
 */
(function(){
'use strict';

var API_VERSION = 1;
var W = window.RTF_WARD, DY = window.RTF_DAILY, A = window.RTF_ART, X = window.RTF_ECON, PK = window.RTF_PACKS;
if (!W || !W.daily || !DY || !A || !X) return;
var D = W.daily;

var RCOL = { common: '#aeb4bf', rare: '#5b9bff', epic: '#b47cff', legendary: '#f2c23a' };
var PCOL = { street: '#e8660f', league: '#3a6fd8', hof: '#e3a92f', season: '#8a4fd4' };
var SPIN_MS = 5200;

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ return Math.round(n).toLocaleString('en-US'); }
function short(n){ return n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, '') + 'k' : String(n); }
function reduced(){ try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
function signed(){ return D.signedIn(); }
function career(){ try { return window.RTF_PAGE && window.RTF_PAGE.career ? window.RTF_PAGE.career() : {}; } catch (e) { return {}; } }
function rep(){ try { return DY.rep(window.RTF_BADGES ? window.RTF_BADGES.evaluate(career()) : []); } catch (e) { return DY.rep([]); } }
var PACKNAME = { street: 'Streetball Pack', league: 'League Pack', hof: 'Hall of Fame Pack', season: 'Seasonal Pack' };

/* a reward's pieces as little icons and numbers */
function chips(rew){
  if (!rew) return '';
  var h = '';
  if (rew.coins) h += '<span class="dy-chip">' + A.coin('dy-ci') + money(rew.coins) + '</span>';
  if (rew.shard) h += '<span class="dy-chip" style="--dyc:' + RCOL[rew.shard[0]] + '">' + A.gem(rew.shard[0], 'dy-ci') + rew.shard[1] + '</span>';
  if (rew.pack) h += '<span class="dy-chip" style="--dyc:' + PCOL[rew.pack] + '">' + A.pack(rew.pack, 'dy-cp') + 'Pack</span>';
  if (rew.spin) h += '<span class="dy-chip" style="--dyc:#ff7ab8">' + A.wheelIcon('dy-ci') + 'Spin</span>';
  if (rew.rush) h += '<span class="dy-chip" style="--dyc:#7fe0a0">2x ' + rew.rush + 'm</span>';
  return h;
}
function bigIcon(rew){
  if (rew.pack) return A.pack(rew.pack, 'dy-ti pk');
  if (rew.spin) return A.wheelIcon('dy-ti');
  if (rew.shard && !rew.coins) return A.gem(rew.shard[0], 'dy-ti');
  return A.coin('dy-ti');
}

/* ─── the strip on the front page ─────────────────────────────────────── */
var flameF = 0, flameT = null;
function strip(){
  var el = $('hp-daily'); if (!el) return;
  if (!signed()) {
    el.innerHTML = '<button type="button" class="dy-guest" data-dy="streak"><span class="dy-gfx">' + A.flame(0, false, 'dy-gfl') + A.wheelIcon('dy-gwh') + '</span>'
      + '<span><b>Streaks, a daily spin and quests</b><i>Sign in and every day pays.</i></span></button>';
    el.hidden = false; wireStrip(el); return;
  }
  var s = D.streak(), sp = D.spins(), q = D.quests() || { daily: [] }, done = q.daily.filter(function(x){ return x.done; }).length;
  var ring = 'conic-gradient(var(--k-gold) ' + (done / 3 * 360) + 'deg,#262c44 0)';
  el.innerHTML = '<button type="button" class="dy-tile dy-t-streak' + (s.played ? ' lit' : '') + '" data-dy="streak"><span class="dy-flame">' + A.flame(flameF, false, 'dy-fl') + '</span>'
    + '<span class="dy-tt"><b>' + s.cur + '</b><i>day' + (s.cur === 1 ? '' : 's') + '</i></span>'
    + (s.freezes ? '<span class="dy-frz">' + A.snow('dy-snw') + s.freezes + '</span>' : '')
    + '<span class="dy-tl">' + (s.played ? 'Safe today' : s.cur ? 'Keep it' : 'Streak') + '</span></button>'
    + '<button type="button" class="dy-tile dy-t-wheel' + (sp.total ? ' ready' : '') + '" data-dy="wheel"><span class="dy-mini" aria-hidden="true"></span>'
    + (sp.total ? '<span class="dy-badge">' + sp.total + '</span>' : '')
    + '<span class="dy-tl">' + (sp.free ? 'Free spin' : sp.total ? sp.total + ' spin' + (sp.total === 1 ? '' : 's') : 'Back tomorrow') + '</span></button>'
    + '<button type="button" class="dy-tile dy-t-quest' + (q.dailyAll ? ' done' : '') + '" data-dy="quests"><span class="dy-ring" style="background:' + ring + '"><span>' + done + '/3</span></span>'
    + '<span class="dy-tl">' + (q.dailyAll ? 'All done' : 'Quests') + '</span></button>'
    + lockerTile();
  el.hidden = false;
  wireStrip(el);
}
/* THE LOCKER, fourth in the row: the shop and the closet are one tap from the
   front page, the way Run The Tour's are, rather than only from inside a
   career's Look sheet. */
function lockerTile(){
  var CU = window.RTF_CAREER_UI, K = window.RTF_KIT;
  if (!CU || !CU.openLocker || !K) return '';
  var free = 0; try { free = W.shop && W.shop.credits ? W.shop.credits().length : 0; } catch (e) {}
  return '<button type="button" class="dy-tile dy-t-locker" data-locker="shop"><span class="dy-well">' + K.iconHtml('shirt', 4) + '</span>'
    + (free ? '<span class="dy-badge">' + free + '</span>' : '')
    + '<span class="dy-tl">' + (free ? 'Free pack' : 'Locker') + '</span></button>';
}
function wireStrip(el){
  el.querySelectorAll('[data-dy]').forEach(function(b){ b.onclick = function(){ open(b.getAttribute('data-dy')); }; });
  el.querySelectorAll('[data-locker]').forEach(function(b){ b.onclick = function(){ window.RTF_CAREER_UI.openLocker(b.getAttribute('data-locker')); }; });
}
/* the flame flickers on its three frames, only while it is on screen */
function flicker(){
  clearInterval(flameT);
  if (reduced()) return;
  flameT = setInterval(function(){
    flameF = (flameF + 1) % 3;
    document.querySelectorAll('.dy-fl,.dy-bigfl').forEach(function(im){ var cold = im.classList.contains('cold'); im.src = A.flameURL(flameF, cold); });
  }, 160);
}

/* ─── the hub ───────────────────────────────────────────────────────────── */
var ov = null, tab = 'wheel', spinning = false;
function close(){ if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; spinning = false; document.removeEventListener('keydown', onKey); strip(); }
function onKey(e){ if (e.key === 'Escape' && !spinning) close(); }
function open(t){
  if (t) tab = t;
  if (!signed()) { try { if (window.RTF_PAGE && window.RTF_PAGE.openProfile) window.RTF_PAGE.openProfile(); } catch (e) {} return; }
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'dy-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Your daily');
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
  }
  draw();
}
function draw(){
  if (!ov) return;
  var r = rep(), coins = window.RTF_WALLET ? window.RTF_WALLET.balance() : 0, rush = D.rushUntil() - Date.now();
  var h = '<div class="dy-box"><div class="dy-head"><div class="dy-rep"><span class="dy-rank">' + esc(r.name) + '</span>'
    + '<span class="dy-repbar"><i style="width:' + Math.round(r.frac * 100) + '%"></i></span>'
    + '<span class="dy-repn">Floor Rep ' + r.pts + (r.next ? ' · ' + (r.nextAt - r.pts) + ' to ' + esc(r.next) : '') + '</span></div>'
    + '<span class="dy-bal">' + A.coin('dy-ci') + money(coins) + '</span>' + (window.RTF_KIT ? RTF_KIT.closeX('Close', 'dy-x') : '<button type="button" class="dy-x" aria-label="Close">x</button>') + '</div>'
    + (rush > 0 ? '<div class="dy-rush">Coin Rush: play pays double for <b data-rush>' + clock(rush) + '</b></div>' : '')
    + '<div class="dy-tabs" role="tablist">' + [['wheel', 'Wheel'], ['streak', 'Streak'], ['quests', 'Quests']].map(function(x){
      return '<button type="button" role="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>'
    + '<div class="dy-body">' + (tab === 'wheel' ? wheelHtml(r) : tab === 'streak' ? streakHtml() : questHtml()) + '</div></div>';
  ov.innerHTML = h;
  ov.querySelector('.dy-x').onclick = close;
  ov.querySelectorAll('[data-tab]').forEach(function(b){ b.onclick = function(){ if (spinning) return; tab = b.getAttribute('data-tab'); draw(); }; });
  if (tab === 'wheel') wireWheel(r);
  flicker();
}
function clock(ms){ var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
setInterval(function(){ var el = ov && ov.querySelector('[data-rush]'); if (el) el.textContent = clock(D.rushUntil() - Date.now()); }, 1000);

/* ─── the wheel ────────────────────────────────────────────────────────── */
function prizeRew(p){ return p.kind === 'coins' ? { coins: p.amt } : p.kind === 'shard' ? { shard: [p.r, p.n] } : p.kind === 'pack' ? { pack: p.pack } : p.kind === 'spin' ? { spin: 1 } : { rush: p.mins }; }
function prizeName(p){ return p.kind === 'coins' ? money(p.amt) + ' coins' : p.kind === 'shard' ? (p.r[0].toUpperCase() + p.r.slice(1)) + ' shard' : p.kind === 'pack' ? PACKNAME[p.pack] : p.kind === 'spin' ? 'Bonus spin' : 'Coin Rush, ' + p.mins + ' minutes'; }
function wedgeCol(p){ return p.kind === 'coins' ? '#f2c23a' : p.kind === 'shard' ? RCOL[p.r] : p.kind === 'pack' ? PCOL[p.pack] : p.kind === 'spin' ? '#ff7ab8' : '#7fe0a0'; }
/* the face, drawn once per rank: wedges in their prize's colour, a gold rim,
   and each wedge's prize as a pixel icon and a short number */
var faceCache = {};
function face(pz, idx){
  if (faceCache[idx]) return faceCache[idx];
  var S = 560, cv = document.createElement('canvas'); cv.width = cv.height = S;
  var x = cv.getContext('2d'), c = S / 2, R = c - 18, n = pz.length, a0 = -Math.PI / 2 - Math.PI / n;
  x.imageSmoothingEnabled = false;
  pz.forEach(function(p, i){
    var a = a0 + i * 2 * Math.PI / n, b = a + 2 * Math.PI / n, col = wedgeCol(p);
    var gr = x.createRadialGradient(c, c, R * 0.15, c, c, R);
    gr.addColorStop(0, A.dark(col, i % 2 ? 0.72 : 0.62)); gr.addColorStop(1, A.dark(col, i % 2 ? 0.4 : 0.28));
    x.fillStyle = gr; x.beginPath(); x.moveTo(c, c); x.arc(c, c, R, a, b); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(255,240,200,.35)'; x.lineWidth = 3; x.stroke();
  });
  /* the rim, then the hub */
  x.lineWidth = 18; x.strokeStyle = '#7a560a'; x.beginPath(); x.arc(c, c, R + 6, 0, 7); x.stroke();
  x.lineWidth = 8; x.strokeStyle = '#f2c23a'; x.beginPath(); x.arc(c, c, R + 4, 0, 7); x.stroke();
  cv._ready = false;
  var pending = 0, done = function(){ if (--pending <= 0) cv._ready = true; };
  pz.forEach(function(p, i){
    var mid = a0 + (i + 0.5) * 2 * Math.PI / n;
    var url = p.kind === 'coins' ? A.coinURL() : p.kind === 'shard' ? A.gemURL(p.r) : p.kind === 'pack' ? A.packURL(p.pack) : p.kind === 'spin' ? A.wheelIconURL() : rushURL();
    var label = p.kind === 'coins' ? short(p.amt) : p.kind === 'shard' ? 'x' + p.n : p.kind === 'pack' ? 'PACK' : p.kind === 'spin' ? '+1' : '2x';
    x.save(); x.translate(c, c); x.rotate(mid + Math.PI / 2);
    x.fillStyle = '#fff6e0'; x.font = '24px "Press Start 2P", monospace'; x.textAlign = 'center';
    x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowOffsetY = 3;
    x.fillText(label, 0, -R + 58);
    x.restore();
    var im = new Image(); pending++;
    im.onload = function(){ x.save(); x.translate(c, c); x.rotate(mid + Math.PI / 2); var w = p.kind === 'pack' ? 30 : 40, hh = p.kind === 'pack' ? 45 : 40; x.drawImage(im, -w / 2, -R + 76, w, hh); x.restore(); done(); };
    im.onerror = done;
    im.src = url;
  });
  faceCache[idx] = cv;
  return cv;
}
var RUSH = ['..yyy..', '.y...y.', 'y..k..y', 'y..kk.y', 'y.....y', '.y...y.', '..yyy..'];
function rushURL(){ return A.spriteURL('rush', RUSH, { y: '#7fe0a0', k: '#e8fff0' }, 4); }

var rot = 0;
function wheelHtml(r){
  var sp = D.spins(), pz = DY.wheel(r.idx);
  var odds = pz.map(function(p){ return p; }), tot = odds.reduce(function(a, p){ return a + p.w; }, 0);
  var bulbs = ''; for (var i = 0; i < 24; i++) bulbs += '<i style="--a:' + (i * 15) + 'deg;--d:' + (i % 2 ? 0 : 0.5) + 's"></i>';
  return '<div class="dy-wheel"><div class="dy-wwrap"><span class="dy-wglow"></span><span class="dy-bulbs">' + bulbs + '</span>'
    + '<span class="dy-wface"></span><span class="dy-whub">' + A.wheelIcon('dy-whi') + '</span><span class="dy-wptr"></span></div>'
    + '<button type="button" class="k-btn dy-spin"' + (sp.total ? '' : ' disabled') + '>' + (sp.free ? 'Spin free' : sp.total ? 'Spin (' + sp.total + ' left)' : 'Next free spin tomorrow') + '</button>'
    + '<div class="dy-prize" aria-live="polite"></div>'
    + '<details class="dy-odds"><summary>What is on the wheel</summary><ul>' + odds.map(function(p){
      return '<li><span style="color:' + wedgeCol(p) + '">' + esc(prizeName(p)) + '</span><b>' + (Math.round(p.w / tot * 1000) / 10) + '%</b></li>'; }).join('') + '</ul>'
    + '<p>Your Floor Rep makes every wedge better. A Coin Rush doubles the coins your games pay while it runs.</p></details></div>';
}
function wireWheel(r){
  var pz = DY.wheel(r.idx), cv = face(pz, r.idx), holder = ov.querySelector('.dy-wface');
  holder.appendChild(cv);
  holder.style.transform = 'rotate(' + rot + 'deg)';
  var btn = ov.querySelector('.dy-spin');
  btn.onclick = function(){
    if (spinning) return;
    /* spinning is set FIRST: the spin's own update would otherwise redraw the
       hub under this press, and the wheel would turn on a detached copy */
    spinning = true;
    var res = D.spin(r.idx);
    if (!res || res.err) { spinning = false; ov.querySelector('.dy-prize').textContent = res && res.err === 'nospin' ? 'No spins left today.' : 'That did not go through.'; return; }
    btn.disabled = true;
    var n = pz.length, seg = 360 / n, jitter = (Math.random() - 0.5) * seg * 0.6;
    /* wedge i is centred at i * seg from the top; turning the wheel by -that brings it under the pointer */
    var target = -(res.index * seg) + jitter;
    var base = rot - (rot % 360) + 360 * 6;
    rot = base + ((target % 360) + 360) % 360;
    holder.setAttribute('data-index', res.index);
    holder.setAttribute('data-rot', rot);
    var land = function(){
      if (!ov) return;
      spinning = false;
      var w = ov.querySelector('.dy-wwrap'); if (w) w.classList.add('won');
      var p = res.prize, big = p.kind === 'pack' || (p.kind === 'coins' && p.amt >= 2000) || p.kind === 'shard' && p.r !== 'common';
      var pr = ov.querySelector('.dy-prize');
      pr.innerHTML = '<div class="dy-won' + (big ? ' big' : '') + '" style="--dyc:' + wedgeCol(p) + '" data-prize="' + p.id + '"><span class="dy-wrays"></span>' + bigIcon(prizeRew(p))
        + '<b>' + esc(prizeName(p)) + '</b><span>' + (p.kind === 'rush' ? 'Every game pays double while it runs.' : p.kind === 'pack' ? 'It is waiting in the Shop.' : p.kind === 'spin' ? 'Spin again.' : 'Yours.') + '</span></div>';
      if (big && window.RTF_PAGE && window.RTF_PAGE.confetti) { try { window.RTF_PAGE.confetti(); } catch (e) {} }
      setTimeout(function(){ if (ov && tab === 'wheel') { var keep = pr.innerHTML; draw(); var np = ov.querySelector('.dy-prize'); if (np) np.innerHTML = keep; } }, 1600);
    };
    if (reduced()) { holder.style.transition = 'none'; holder.style.transform = 'rotate(' + rot + 'deg)'; land(); return; }
    ov.querySelector('.dy-wwrap').classList.add('spinning');
    holder.style.transition = 'transform ' + SPIN_MS + 'ms cubic-bezier(.12,.62,.08,1)';
    requestAnimationFrame(function(){ holder.style.transform = 'rotate(' + rot + 'deg)'; });
    setTimeout(function(){ var w = ov && ov.querySelector('.dy-wwrap'); if (w) w.classList.remove('spinning'); land(); }, SPIN_MS + 80);
  };
}

/* ─── the streak ────────────────────────────────────────────────────────── */
function track(list, cur, nextPos, playedToday, kind){
  var h = '<div class="dy-track">';
  for (var d = 1; d <= 7; d++) {
    var rew = list[d], got = playedToday ? d <= cur : d < nextPos, now = playedToday ? d === cur : d === nextPos;
    h += '<div class="dy-slot' + (got ? ' got' : '') + (now ? ' now' : '') + (d === 7 ? ' last' : '') + '"><i>Day ' + d + '</i>' + bigIcon(rew) + '<span class="dy-sc">' + chips(rew) + '</span>' + (got ? '<b class="dy-ok">Got</b>' : '') + '</div>';
  }
  return h + '</div>';
}
function streakHtml(){
  var s = D.streak(), wkPos = s.cur ? ((s.cur - 1) % 7) + 1 : 0, lp = D.loginPos(), logged = D.logged();
  var cal = '', nd = DY.dnum(DY.today());
  for (var i = 27; i >= 0; i--) { var d = DY.dstr(nd - i), cls = s.pos[d] ? 'on' : s.bridged.indexOf(d) >= 0 ? 'fz' : ''; cal += '<i class="' + cls + (i === 0 ? ' td' : '') + '" title="' + d + '"></i>'; }
  var frz = ''; for (var f = 0; f < DY.FREEZE_MAX; f++) frz += A.snow('dy-snb' + (f < s.freezes ? '' : ' off'));
  return '<div class="dy-streak"><div class="dy-sh"><span class="dy-bigflame' + (s.cur ? '' : ' out') + '"><span class="dy-fglow"></span>' + A.flame(flameF, false, 'dy-bigfl') + '</span>'
    + '<div class="dy-sn"><b>' + s.cur + '</b><i>day streak</i><span>Best ' + s.best + '</span></div>'
    + '<div class="dy-frzs"><span>Freezes</span><span class="dy-frow">' + frz + '</span><em>A freeze saves a missed day. Earn one at 7, 30 and 100.</em></div></div>'
    + '<p class="dy-hint">' + (s.played ? 'Today is in. Come back tomorrow to keep it going.' : 'Finish today\'s Daily Draft, Fix History or Six Passes to keep the streak.') + '</p>'
    + '<div class="dy-h">The streak week</div>' + track(DY.STREAK, wkPos, s.played ? wkPos : (s.cur % 7) + 1, s.played, 'streak')
    + '<div class="dy-h">Coming back</div><p class="dy-hint">Every day you open the game moves one slot.</p>' + track(DY.LOGIN, lp, lp, logged, 'login')
    + '<div class="dy-h">The last four weeks</div><div class="dy-cal">' + cal + '</div></div>';
}

/* ─── the quests ────────────────────────────────────────────────────────── */
/* a quest wears what it asks for */
var QSPR = {
  ball: [['..kkkk..', '.koookk.', 'kookooko', 'kkkkkkkk', 'kookoook', 'kookooko', '.kokook.', '..kkkk..'], { k: '#2a1406', o: '#e8660f' }],
  trophy: [['yyyyyyyy', 'yywyyyyy', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '...yy...', '..yyyy..', '.dddddd.'], { y: '#f2c23a', w: '#fff3c0', d: '#7a560a' }],
  cal: [['.r....r.', 'rrrrrrrr', 'wwwwwwww', 'wkwkwkww', 'wwwwwwww', 'wkwkwkrw', 'wwwwwwww', 'wwwwwwww'], { r: '#e0483e', w: '#f4f2ec', k: '#3a3f4a' }],
  crown: [['y..y..y.', 'y..y..y.', 'yy.y.yy.', 'yyyyyyy.', 'yryybyy.', 'yyyyyyy.', 'dddddd..'], { y: '#f2c23a', r: '#e0483e', b: '#5b9bff', d: '#7a560a' }],
  pass: [['.....b..', '.....bb.', 'bbbbbbbb', 'bbbbbbbb', '.....bb.', '.....b..'], { b: '#7fb0ff' }],
  clock: [['..kkkk..', '.kwwwwk.', 'kwwwkwwk', 'kwwwkwwk', 'kwwkkwwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'], { k: '#3a6fd8', w: '#f4f2ec' }],
  ring: [['..yyyy..', '.y.bb.y.', 'y.bwwb.y', 'y......y', 'y......y', '.y....y.', '..yyyy..'], { y: '#f2c23a', b: '#5b9bff', w: '#dff0ff' }],
};
var QMAP = { dd: 'cal', run: 'ball', cs: 'trophy', cf: 'trophy', cq: 'crown', pspar: 'pass', ps: 'pass', fx: 'clock', title: 'ring' };
function qIcon(ev){
  if (ev === 'pack') return A.pack('street', 'dy-qpk');
  if (ev === 'spin') return A.wheelIcon('dy-qi');
  if (ev === 'look') return A.icon({ id: 'q:look', slot: 'top', k: 'hoodie', c: ['#e8660f', '#16181f'] }, 'dy-qi');
  var q = QSPR[QMAP[ev]];
  return q ? '<img class="dy-qi" alt="" src="' + A.spriteURL('q' + ev, q[0], q[1], 5) + '">' : A.questIcon('dy-qi');
}
function qCard(x, rew){
  var pct = Math.round(x.have / x.n * 100);
  return '<div class="dy-q' + (x.done ? ' done' : '') + '">' + qIcon(x.ev) + '<div class="dy-qt"><b>' + esc(x.label) + '</b>'
    + '<span class="dy-qbar"><i style="width:' + pct + '%"></i></span><span class="dy-qn">' + x.have + ' / ' + x.n + '</span></div>'
    + '<span class="dy-qr">' + chips(rew) + '</span>' + (x.done ? '<span class="dy-stamp">Done</span>' : '') + '</div>';
}
function questHtml(){
  var q = D.quests(), R = DY.rewards();
  if (!q) return '<p class="dy-hint">Quests are not available right now.</p>';
  var left = Math.max(0, DY.dnum(q.ends) - DY.dnum(q.day));
  return '<div class="dy-quests"><div class="dy-h">Today</div>' + q.daily.map(function(x){ return qCard(x, R.quest); }).join('')
    + '<div class="dy-all' + (q.dailyAll ? ' done' : '') + '"><span>All three</span><span class="dy-qr">' + chips(R.all) + '</span></div>'
    + '<div class="dy-h">This week <em>' + (left ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'Last day') + '</em></div>'
    + q.weekly.map(function(x){ return qCard(x, R.weekly); }).join('')
    + '<div class="dy-all' + (q.weeklyAll ? ' done' : '') + '"><span>All four</span><span class="dy-qr">' + chips(R.weekAll) + '</span></div></div>';
}

/* ─── a reward pop ──────────────────────────────────────────────────────── */
var popQ = [], popOn = false;
function pop(title, rew){
  popQ.push([title, rew]);
  if (!popOn) nextPop();
}
function nextPop(){
  var p = popQ.shift(); if (!p) { popOn = false; return; }
  popOn = true;
  var el = document.createElement('button');
  el.type = 'button'; el.className = 'dy-pop';
  el.innerHTML = bigIcon(p[1]) + '<span><b>' + esc(p[0]) + '</b><span class="dy-pc">' + chips(p[1]) + '</span></span>';
  el.onclick = function(){ el.remove(); open(/Quest/.test(p[0]) ? 'quests' : 'streak'); };
  (window.RTF_KIT && RTF_KIT.lane ? RTF_KIT.lane() : document.body).appendChild(el);
  requestAnimationFrame(function(){ el.classList.add('on'); });
  setTimeout(function(){ el.classList.remove('on'); setTimeout(function(){ el.remove(); nextPop(); }, 300); }, 3600);
}
function has(g){ return g && (g.coins || g.shard || g.pack || g.spin); }
D.on(function(r){
  if (r.kind === 'login' && r.fresh && has(r.got)) pop('Day ' + r.pos + ' · Welcome back', r.rew);
  if (r.kind === 'streak' && has(r.got)) pop(r.cur + ' day streak', r.rew);
  (r.quests || []).forEach(function(label){ pop('Quest done', { coins: X.RATE.quest }); });
  strip();
  if (ov && !spinning) draw();
});

function render(){ strip(); flicker(); }
if (W.onChange) W.onChange(function(){ strip(); });
if (window.RTF_AUTH && window.RTF_AUTH.onChange) window.RTF_AUTH.onChange(function(){ setTimeout(render, 0); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();

var CSS = [
/* ONE PANEL, FOUR KEYS, Run The Tour's quick row: a raised panel holding the
   keys, each an icon in its own well with a label under it. */
'.hp-daily{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));grid-auto-flow:column;gap:4px;margin:0 0 12px;padding:6px;',
' background:linear-gradient(180deg,#171c30,#0e111d);box-shadow:inset 0 0 0 2px #2a3150,inset 0 2px 0 2px rgba(255,255,255,.05),0 4px 0 0 #05070d,0 10px 24px -10px rgba(0,0,0,.7);}',
'.hp-daily:has(.dy-guest){grid-auto-flow:row;padding:0;background:none;box-shadow:none;}',
'.hp-daily img{image-rendering:pixelated;}',
'.dy-tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;min-height:92px;padding:8px 2px 6px;border:0;cursor:pointer;color:var(--k-ink,#fff);',
' background:transparent;box-shadow:none;font:700 11px var(--k-f-text,system-ui);overflow:hidden;transition:background .15s;}',
'.dy-tile:hover{background:rgba(255,255,255,.04);}',
'.dy-well{display:grid;place-items:center;width:56px;height:56px;background:radial-gradient(70% 70% at 50% 35%,#2b3354,#141829);box-shadow:inset 0 0 0 2px #333c60,inset 0 -3px 0 rgba(0,0,0,.45);}',
'.dy-t-locker .dy-well img{width:28px;height:28px;filter:drop-shadow(0 0 6px rgba(127,178,255,.45));}',
'.dy-tile:active{transform:translateY(2px);}',
'.dy-tl{font:800 10px var(--k-f-text,system-ui);text-transform:uppercase;letter-spacing:.06em;color:var(--k-ink-2,#cdd3e6);white-space:nowrap;}',
'.dy-t-streak{flex-direction:row;justify-content:center;flex-wrap:wrap;align-content:flex-end;}',
'.dy-t-streak.lit{box-shadow:inset 0 0 0 2px #e8660f,0 0 18px -6px #ff8a1e,inset 0 -4px 0 rgba(0,0,0,.4);background:radial-gradient(80% 70% at 50% 40%,rgba(255,138,30,.22),transparent 70%),linear-gradient(180deg,#1b2034,#11141f);}',
'.dy-flame{display:block;line-height:0;}',
'.dy-fl{width:36px;height:42px;filter:drop-shadow(0 0 8px rgba(255,138,30,.7));}',
'.dy-t-streak:not(.lit) .dy-fl{filter:grayscale(.6) brightness(.7);}',
'.dy-tt{display:flex;flex-direction:column;align-items:flex-start;line-height:1;margin-left:4px;}',
'.dy-tt b{font:400 20px var(--k-f-pixel,monospace);color:#ffd23a;text-shadow:0 2px 0 #7a2a08;}',
'.dy-tt i{font-style:normal;font-size:10px;color:var(--k-ink-3,#8a93b0);text-transform:uppercase;}',
'.dy-frz{position:absolute;top:6px;right:6px;display:flex;align-items:center;gap:2px;font:800 11px var(--k-f-text);color:#a8dcff;}',
'.dy-snw{width:14px;height:14px;}',
'.dy-t-streak .dy-tl{flex-basis:100%;text-align:center;}',
'.dy-mini{width:52px;height:52px;border-radius:50%;background:conic-gradient(#f2c23a 0 28deg,#b33a2a 28deg 56deg,#3a6fd8 56deg 84deg,#f2c23a 84deg 112deg,#8a4fd4 112deg 140deg,#2fae6a 140deg 168deg,#f2c23a 168deg 196deg,#e8660f 196deg 224deg,#3a6fd8 224deg 252deg,#f2c23a 252deg 280deg,#ff7ab8 280deg 308deg,#5b9bff 308deg 336deg,#f2c23a 336deg);',
' box-shadow:0 0 0 3px #7a560a,0 0 0 5px #f2c23a,inset 0 0 0 10px rgba(0,0,0,.2);animation:dy-idle 9s linear infinite;}',
'.dy-t-wheel.ready{box-shadow:inset 0 0 0 2px #f2c23a,0 0 20px -6px #f2c23a,inset 0 -4px 0 rgba(0,0,0,.4);}',
'.dy-t-wheel.ready .dy-mini{animation-duration:3s;}',
'@keyframes dy-idle{to{transform:rotate(360deg);}}',
'.dy-badge{position:absolute;top:6px;right:6px;min-width:20px;height:20px;padding:0 5px;display:flex;align-items:center;justify-content:center;background:#e0483e;color:#fff;font:800 11px var(--k-f-text);box-shadow:0 0 0 2px #11141f;animation:dy-pulse 1.4s ease-in-out infinite;}',
'@keyframes dy-pulse{50%{transform:scale(1.15);}}',
'.dy-ring{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;}',
'.dy-ring span{width:40px;height:40px;border-radius:50%;background:#11141f;display:flex;align-items:center;justify-content:center;font:400 10px var(--k-f-pixel,monospace);color:var(--k-gold,#f2c23a);}',
'.dy-t-quest.done{box-shadow:inset 0 0 0 2px #2fae6a,0 0 18px -6px #2fae6a,inset 0 -4px 0 rgba(0,0,0,.4);}',
'.dy-guest{grid-column:1 / -1;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;padding:10px 12px;border:0;cursor:pointer;text-align:left;color:var(--k-ink,#fff);',
' background:linear-gradient(100deg,rgba(255,138,30,.18),#11141f 60%);box-shadow:inset 0 0 0 2px #2c3350;}',
'.dy-guest b{display:block;font:700 13px var(--k-f-text);}.dy-guest i{font-style:normal;font-size:12px;color:var(--k-ink-3,#8a93b0);}',
'.dy-gfx{display:flex;align-items:flex-end;gap:2px;}.dy-gfl{width:30px;height:35px;}.dy-gwh{width:30px;height:30px;}',
/* the hub */
'.dy-ov{position:fixed;inset:0;z-index:88;display:flex;justify-content:center;align-items:flex-start;overflow-y:auto;padding:12px 10px 28px;background:radial-gradient(circle at 50% 20%,#1d2240,#05070d 70%);animation:dy-in .22s ease-out;font:600 13px/1.4 var(--k-f-text,system-ui);color:var(--k-ink-2,#cdd3e6);}',
'@keyframes dy-in{from{opacity:0;}to{opacity:1;}}',
'.dy-ov img{image-rendering:pixelated;}',
'.dy-box{width:100%;max-width:520px;}',
'.dy-head{display:flex;align-items:center;gap:8px;padding:10px;background:linear-gradient(180deg,#1d2236,#141826);box-shadow:inset 0 0 0 2px #2c3350;}',
'.dy-rep{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}',
'.dy-rank{font:400 12px var(--k-f-pixel,monospace);color:var(--k-gold,#f2c23a);text-shadow:0 2px 0 #5a3e0a;}',
'.dy-repbar{height:8px;background:#232840;box-shadow:inset 0 0 0 1px #343c5c;}.dy-repbar i{display:block;height:100%;background:linear-gradient(90deg,#c98a12,#ffd970);box-shadow:0 0 8px rgba(242,194,58,.6);}',
'.dy-repn{font-size:11px;color:var(--k-ink-3,#8a93b0);}',
'.dy-bal{display:flex;align-items:center;gap:5px;font:800 14px var(--k-f-text);color:var(--k-gold,#f2c23a);font-variant-numeric:tabular-nums;}',
'.dy-x:not(.k-x){border:0;background:#262c44;color:var(--k-ink,#fff);min-width:40px;min-height:40px;font:800 15px var(--k-f-text);cursor:pointer;}',
'.dy-rush{margin:8px 0 0;padding:8px 10px;background:linear-gradient(90deg,rgba(127,224,160,.22),#11141f);box-shadow:inset 3px 0 0 #7fe0a0;color:#c8ffd9;font-weight:700;}',
'.dy-rush b{font-variant-numeric:tabular-nums;}',
'.dy-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:10px 0;}',
'.dy-tabs button{border:0;min-height:44px;background:#161a2a;color:var(--k-ink-3,#8a93b0);font:800 12px var(--k-f-text);text-transform:uppercase;letter-spacing:.1em;cursor:pointer;box-shadow:inset 0 -3px 0 #232840;}',
'.dy-tabs button[aria-selected="true"]{background:#232a44;color:var(--k-ink,#fff);box-shadow:inset 0 -3px 0 var(--k-gold,#f2c23a);}',
'.dy-ci{width:14px;height:14px;}.dy-cp{width:11px;height:16px;}',
'.dy-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;font:800 11px var(--k-f-text);color:var(--dyc,var(--k-gold,#f2c23a));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dyc,#f2c23a) 50%,transparent);background:rgba(0,0,0,.25);white-space:nowrap;}',
'.dy-h{margin:16px 0 8px;font:400 11px var(--k-f-pixel,monospace);color:var(--k-ink,#fff);display:flex;justify-content:space-between;align-items:baseline;}',
'.dy-h em{font:700 11px var(--k-f-text);font-style:normal;color:var(--k-ink-3,#8a93b0);}',
'.dy-hint{margin:6px 0;font-size:12px;color:var(--k-ink-3,#8a93b0);text-align:center;}',
/* the wheel */
'.dy-wheel{display:flex;flex-direction:column;align-items:center;gap:12px;}',
'.dy-wwrap{position:relative;width:min(86vw,340px);aspect-ratio:1;}',
'.dy-wglow{position:absolute;inset:-8%;border-radius:50%;background:radial-gradient(circle,rgba(242,194,58,.28),transparent 66%);}',
'.dy-wwrap.spinning .dy-wglow{animation:dy-glow .5s ease-in-out infinite;}',
'@keyframes dy-glow{50%{transform:scale(1.06);opacity:.7;}}',
'.dy-wface{position:absolute;inset:4%;border-radius:50%;overflow:hidden;will-change:transform;box-shadow:0 10px 30px rgba(0,0,0,.6);}',
'.dy-wface canvas{width:100%;height:100%;display:block;}',
'.dy-bulbs{position:absolute;inset:0;}',
'.dy-bulbs i{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px;border-radius:50%;background:#fff3b0;box-shadow:0 0 8px #ffd23a;transform:rotate(var(--a)) translateY(calc(-1 * min(43vw,170px)));animation:dy-blink 1s steps(1) infinite;animation-delay:var(--d);}',
'.dy-wwrap.spinning .dy-bulbs i{animation-duration:.25s;}',
'@keyframes dy-blink{50%{background:#7a560a;box-shadow:none;}}',
'.dy-whub{position:absolute;left:50%;top:50%;width:20%;height:20%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffe9a0,#c98a12 60%,#5a3e0a);box-shadow:0 0 0 4px #7a560a,0 4px 10px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;}',
'.dy-whi{width:58%;height:58%;}',
'.dy-wptr{position:absolute;left:50%;top:-2%;width:0;height:0;transform:translateX(-50%);border-left:16px solid transparent;border-right:16px solid transparent;border-top:30px solid #e0483e;filter:drop-shadow(0 3px 0 #7a1a12) drop-shadow(0 0 6px rgba(224,72,62,.8));z-index:2;}',
'.dy-wwrap.won .dy-wptr{animation:dy-ptr .5s ease;}',
'@keyframes dy-ptr{30%{transform:translateX(-50%) translateY(-6px);}}',
'.dy-spin{min-height:52px;padding:14px 30px;font-size:15px;}',
'.dy-spin[disabled]{opacity:.5;}',
'.dy-prize{min-height:20px;width:100%;}',
'.dy-won{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--dyc) 22%,#161a2a),#121625);box-shadow:inset 0 0 0 2px var(--dyc),0 0 26px -6px var(--dyc);overflow:hidden;animation:dy-wpop .5s cubic-bezier(.2,1.5,.4,1);}',
'.dy-won b{font:400 13px/1.5 var(--k-f-pixel,monospace);color:var(--k-ink,#fff);text-align:center;}',
'.dy-won > span:last-child{font-size:12px;color:var(--k-ink-3,#8a93b0);}',
'.dy-wrays{position:absolute;left:50%;top:40%;width:360px;height:360px;margin:-180px;border-radius:50%;background:repeating-conic-gradient(var(--dyc) 0 7deg,transparent 7deg 22deg);opacity:.18;-webkit-mask:radial-gradient(circle,#000 10%,transparent 62%);mask:radial-gradient(circle,#000 10%,transparent 62%);animation:dy-idle 18s linear infinite;pointer-events:none;}',
'.dy-won.big .dy-wrays{opacity:.34;}',
'@keyframes dy-wpop{0%{transform:scale(.6);opacity:0;}70%{transform:scale(1.05);}100%{transform:scale(1);opacity:1;}}',
'.dy-ti{width:48px;height:48px;position:relative;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5));}.dy-ti.pk{width:40px;height:60px;}',
'.dy-odds{width:100%;background:#121625;box-shadow:inset 0 0 0 1px #262c44;padding:8px 10px;}',
'.dy-odds summary{cursor:pointer;font:700 12px var(--k-f-text);color:var(--k-ink,#fff);}',
'.dy-odds ul{list-style:none;margin:8px 0 0;padding:0;}.dy-odds li{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05);}',
'.dy-odds li b{font-variant-numeric:tabular-nums;}.dy-odds p{font-size:11.5px;color:var(--k-ink-3,#8a93b0);}',
/* the streak */
'.dy-sh{display:grid;grid-template-columns:72px minmax(84px,auto) minmax(0,1fr);gap:12px;align-items:center;padding:12px;background:radial-gradient(70% 90% at 15% 50%,rgba(255,138,30,.22),transparent 70%),linear-gradient(180deg,#1b2034,#11141f);box-shadow:inset 0 0 0 2px #2c3350;}',
'.dy-bigflame{position:relative;width:72px;height:84px;display:flex;align-items:flex-end;justify-content:center;}',
'.dy-fglow{position:absolute;inset:-20%;border-radius:50%;background:radial-gradient(circle,rgba(255,138,30,.45),transparent 65%);animation:dy-pulse 1.6s ease-in-out infinite;}',
'.dy-bigfl{position:relative;width:72px;height:84px;}',
'.dy-bigflame.out .dy-bigfl{filter:grayscale(1) brightness(.5);}.dy-bigflame.out .dy-fglow{display:none;}',
'.dy-sn{display:flex;flex-direction:column;line-height:1;}',
'.dy-sn b{font:400 34px var(--k-f-pixel,monospace);color:#ffd23a;text-shadow:0 3px 0 #7a2a08,0 0 16px rgba(255,138,30,.5);}',
'.dy-sn i{font-style:normal;font:800 11px var(--k-f-text);text-transform:uppercase;letter-spacing:.1em;color:var(--k-ink,#fff);margin-top:6px;}',
'.dy-sn span{font-size:11px;color:var(--k-ink-3,#8a93b0);margin-top:3px;}',
'.dy-frzs{display:flex;flex-direction:column;gap:4px;font-size:11px;}.dy-frzs > span:first-child{font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#a8dcff;}',
'.dy-frow{display:flex;gap:4px;}.dy-snb{width:22px;height:22px;filter:drop-shadow(0 0 5px #5aa8ff);}.dy-snb.off{filter:grayscale(1) brightness(.4);}',
'.dy-frzs em{font-style:normal;color:var(--k-ink-3,#8a93b0);font-size:10.5px;}',
'.dy-track{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;}',
'.dy-slot{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px 5px;background:#141826;box-shadow:inset 0 0 0 1px #262c44;min-width:0;}',
'.dy-slot i{font-style:normal;font:800 9px var(--k-f-text);text-transform:uppercase;color:var(--k-ink-3,#8a93b0);}',
'.dy-slot .dy-ti{width:26px;height:26px;}.dy-slot .dy-ti.pk{width:20px;height:30px;}',
'.dy-sc{display:flex;flex-direction:column;gap:2px;align-items:center;}.dy-slot .dy-chip{padding:1px 3px;font-size:9px;box-shadow:none;background:none;}.dy-slot .dy-chip img{display:none;}',
'.dy-slot.got{background:linear-gradient(180deg,rgba(47,174,106,.25),#141826);box-shadow:inset 0 0 0 1px #2fae6a;}',
'.dy-slot.now{box-shadow:inset 0 0 0 2px var(--k-gold,#f2c23a),0 0 14px -4px var(--k-gold,#f2c23a);animation:dy-now 1.6s ease-in-out infinite;}',
'@keyframes dy-now{50%{transform:translateY(-3px);}}',
'.dy-slot.last:not(.got){background:linear-gradient(180deg,rgba(242,194,58,.16),#141826);}',
'.dy-ok{position:absolute;bottom:2px;right:3px;font:800 8px var(--k-f-text);color:#7fe0a0;text-transform:uppercase;}',
'.dy-cal{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:3px;}',
'.dy-cal i{aspect-ratio:1;background:#1a1f32;}.dy-cal i.on{background:#ff8a1e;box-shadow:0 0 6px rgba(255,138,30,.6);}.dy-cal i.fz{background:#5aa8ff;}.dy-cal i.td{box-shadow:inset 0 0 0 2px var(--k-gold,#f2c23a);}',
/* quests */
'.dy-q{position:relative;display:grid;grid-template-columns:40px minmax(0,1fr);gap:10px;align-items:center;padding:10px;margin-bottom:6px;background:linear-gradient(180deg,#1a1f32,#141826);box-shadow:inset 0 0 0 1px #2c3350;overflow:hidden;}',
'.dy-qi{width:36px;height:36px;}.dy-qpk{width:24px;height:36px;justify-self:center;}',
'.dy-qt{display:flex;flex-direction:column;gap:4px;min-width:0;}',
'.dy-qt b{font:700 13px var(--k-f-text);color:var(--k-ink,#fff);}',
'.dy-qbar{height:8px;background:#232840;}.dy-qbar i{display:block;height:100%;background:linear-gradient(90deg,#3a6fd8,#7fb0ff);}',
'.dy-qn{font-size:11px;color:var(--k-ink-3,#8a93b0);font-variant-numeric:tabular-nums;}',
'.dy-qr{grid-column:2;display:flex;flex-wrap:wrap;gap:4px;}',
'.dy-q.done{box-shadow:inset 0 0 0 2px #2fae6a;background:linear-gradient(180deg,rgba(47,174,106,.18),#141826);}',
'.dy-q.done .dy-qbar i{background:linear-gradient(90deg,#2fae6a,#7fe0a0);}',
'.dy-stamp{position:absolute;right:10px;top:50%;transform:translateY(-50%) rotate(-12deg);font:400 12px var(--k-f-pixel,monospace);color:#7fe0a0;padding:6px 8px;box-shadow:inset 0 0 0 3px #7fe0a0;animation:dy-stamp .4s cubic-bezier(.2,1.6,.4,1);}',
'@keyframes dy-stamp{0%{transform:translateY(-50%) rotate(-12deg) scale(2.2);opacity:0;}100%{transform:translateY(-50%) rotate(-12deg) scale(1);opacity:1;}}',
'.dy-all{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;margin-top:4px;background:linear-gradient(90deg,rgba(242,194,58,.14),#121625);box-shadow:inset 3px 0 0 var(--k-gold,#f2c23a);font:800 12px var(--k-f-text);text-transform:uppercase;letter-spacing:.06em;color:var(--k-ink,#fff);}',
'.dy-all.done{box-shadow:inset 3px 0 0 #2fae6a;background:linear-gradient(90deg,rgba(47,174,106,.2),#121625);}',
/* the pop */
'.dy-pop{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 58px);z-index:95;display:flex;align-items:center;gap:10px;padding:10px 14px 10px 10px;border:0;cursor:pointer;text-align:left;',
' transform:translate(-50%,-20px) scale(.9);opacity:0;transition:transform .3s cubic-bezier(.2,1.4,.4,1),opacity .25s;background:linear-gradient(180deg,#2a2412,#171307);box-shadow:inset 0 0 0 2px #f2c23a,0 10px 26px rgba(0,0,0,.55);color:#fff;}',
'.dy-pop.on{transform:translate(-50%,0) scale(1);opacity:1;}',
'.dy-pop .dy-ti{width:36px;height:36px;}.dy-pop .dy-ti.pk{width:26px;height:39px;}',
'.dy-pop b{display:block;font:400 11px/1.5 var(--k-f-pixel,monospace);color:#ffd970;}',
'.dy-pc{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;}',
'@media (prefers-reduced-motion:reduce){.dy-mini,.dy-badge,.dy-bulbs i,.dy-wglow,.dy-fglow,.dy-slot.now,.dy-wrays,.dy-won,.dy-stamp,.dy-ov{animation:none!important;}.dy-pop{transition:none;}}',
].join('\n');
if (!document.getElementById('rtf-daily-css')) { var st = document.createElement('style'); st.id = 'rtf-daily-css'; st.textContent = CSS; document.head.appendChild(st); }

window.RTF_DAILY_UI = { API_VERSION: API_VERSION, open: open, close: close, render: render };
})();
