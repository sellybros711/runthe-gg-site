// ── the court ──────────────────────────────────────────────────────────────

/* WHERE THESE MEN ACTUALLY STAND. The five sit where their position plays:
   the point at the top of the key, the wings out beyond the arc, the forward
   on the weak side block and the centre in the paint.

   THERE IS NO SIXTH SPOT, and that is the picture this screen was always
   trying to draw. The sixth man used to sit BELOW the sideline, off the floor,
   because he was not on it and a picture that put him there would have been
   telling a small lie. Five men is five spots, so the lie has nothing left to
   avoid and the court is simply the team. */
/* ── ARENAS AND THE CAMERA ────────────────────────────────────────────────
 *
 * hoops/courts.js is the catalogue and the art; this is the page's half. Which
 * arena a court wears is ASKED, never stored as earned: the account's choice is
 * the one stored thing (on its profile row, 129, with rtf.arena.v1 as the
 * browser's copy), and a choice the account cannot back (signed out, another account on this browser,
 * a Pro arena after Pro lapses) falls back to the highest rung of the ladder
 * the account has reached (CT.best), which is the Blacktop for everybody on day
 * one and for every guest. That is baseball's road to the Show, rule for rule.
 *
 * THE CAMERA IS ON THE PROFILE (rtf.cam.v1 is the browser's copy) and
 * three-quarter is the default. A guest's is the browser's alone.
 *
 * A blocked or stale courts.js draws plain maple boards, flat, with NO LINES:
 * the court lines are drawn in feet by courts.js (lines()) and the page keeps
 * no second copy of the geometry, because two copies of a court drift. Nothing
 * throws; it is a court with the paint missing until the file arrives. */
var NEED_COURTS = 2;
var CT = (window.RTF_COURTS && window.RTF_COURTS.COURTS_API_VERSION === NEED_COURTS)
  ? window.RTF_COURTS : null;
var ARENA_KEY = 'rtf.arena.v1', CAM_KEY = 'rtf.cam.v1';
var arenaMemo = null;

function camera(){
  if (!CT) return 'top';
  try { return localStorage.getItem(CAM_KEY) === 'top' ? 'top' : 'tq'; } catch (e) { return 'tq'; }
}
function setCamera(c){
  c = c === 'top' ? 'top' : 'tq';
  try { localStorage.setItem(CAM_KEY, c); } catch (e) {}
  profileSend({ camera: c });
  redressCourts();
}
/* What the unlock rules are asked of: the career the cabinet reads, the badges
   it has earned, and whether the account is Pro. Guests are asked nothing: the
   career on a signed out browser is nobody's. */
function arenaInfoFor(c){
  var st = A.state(), signed = !!(st && st.signedIn), badges = 0;
  var BG = window.RTF_BADGES, MU = window.RTF_MODES_UI;
  if (signed && BG && typeof BG.earned === 'function') {
    try { badges = BG.earned(c).length; } catch (e) { badges = 0; }
  }
  return { signed: signed, pro: !!(MU && MU.pro && MU.pro()), badges: badges, c: c };
}
function arenaInfo(){ return arenaInfoFor(loadCareer() || blankCareer()); }
function arenaChoices(){
  try { var m = JSON.parse(localStorage.getItem(ARENA_KEY) || '{}'); return (m && typeof m === 'object') ? m : {}; }
  catch (e) { return {}; }
}
var arenaForced = null;   /* a checker's handle, below. Nothing on the page sets it. */
function currentArena(){
  if (!CT) return 'blacktop';
  if (arenaForced && CT.BY_ID[arenaForced]) return arenaForced;
  if (arenaMemo) return arenaMemo;
  var st = A.state(), uid = st && st.signedIn ? st.userId : null;
  var id = uid ? arenaChoices()[uid] : null, info = arenaInfo();
  /* No choice, or one this account cannot back: the highest rung it has
     reached, which is the Blacktop for everybody on day one. */
  if (!id || !CT.BY_ID[id] || !CT.status(CT.BY_ID[id], info).ok) id = CT.best(info);
  arenaMemo = id;
  return id;
}
function setArena(id){
  var st = A.state(), uid = st && st.signedIn ? st.userId : null;
  if (!CT || !uid || !CT.BY_ID[id]) return;
  var m = arenaChoices();
  m[uid] = id;
  try { localStorage.setItem(ARENA_KEY, JSON.stringify(m)); } catch (e) {}
  profileSend({ arena: id });
  redressCourts();
}
/* Anything that can move an unlock (a run filed, a feat, a pull, a sign in, Pro)
   forgets the answer, and the next court painted asks again. */
function arenaChanged(){
  arenaMemo = null;
  redressCourts();
  if ($('sheet') && $('sheet').classList.contains('open')) {
    renderIdentity();
    if (badgeTab === 'locker') renderLocker();
  }
}
/* The arenas a change of career opened, asked the same way as the badges: the
   same question either side of the write. */
function freshArenas(before, after){
  if (!CT) return [];
  try {
    var had = {};
    CT.unlockedIds(arenaInfoFor(before)).forEach(function(id){ had[id] = 1; });
    return CT.unlockedIds(arenaInfoFor(after)).filter(function(id){ return !had[id]; })
      .map(function(id){ return CT.BY_ID[id]; });
  } catch (e) { return []; }
}

/* ── YOUR JERSEY ────────────────────────────────────────────────────────
 *
 * The one thing on the profile you wear. The football game's circle is a club
 * colourway and two initials; this is the sport's version of the same idea, a
 * jersey in a club's colours with your number on it.
 *
 * A CLUB'S COLOURS ARE EARNED BY PLAYING ONE FRANCHISE WITH THAT CLUB, which is
 * the football crest's rule arriving here. Read off career.byClub, so it is
 * derived like everything else on this sheet: retroactive, and on the account.
 * The house colours are everybody's, and Pro opens every club. Stored is only
 * the choice, on the account's profile row (rtf.look.v1 is the browser's
 * copy), and a club the account cannot back falls back to the house colors. */
var LOOK_KEY = 'rtf.look.v1';
var HOUSE_KIT = { code: 'house', name: 'Run The Floor', bg: '#f0782d', accent: '#1a1f2b', on: '#10131a' };
function lookOwner(){ var st = A.state(); return (st && st.signedIn && st.userId) ? st.userId : 'guest'; }
function lookMap(){
  try { var m = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}'); return (m && typeof m === 'object') ? m : {}; }
  catch (e) { return {}; }
}
function kitOwned(code, info){
  if (code === 'house') return true;
  if (!info.signed) return false;
  if (info.pro) return true;
  var s = info.c && info.c.byClub && info.c.byClub[code];
  return !!(s && s.runs > 0);
}
function kitOf(code){
  if (code === 'house' || !E.hasTeam || !E.hasTeam(code)) return HOUSE_KIT;
  var k = E.clubSkin(code);
  return { code: code, name: E.teamName(code), bg: k.bg, accent: k.accent, on: k.on };
}
function myLook(){
  var l = lookMap()[lookOwner()] || {};
  var info = arenaInfo();
  var code = (l.club && kitOwned(l.club, info)) ? l.club : 'house';
  var num = /^\d{1,2}$/.test(String(l.num == null ? '' : l.num)) ? String(l.num) : '1';
  return { club: code, num: num };
}
function setLook(patch){
  var m = lookMap(), k = lookOwner();
  m[k] = Object.assign({}, m[k] || {}, patch);
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(m)); } catch (e) {}
  profileSend({ club: patch.club, num: patch.num });
  renderIdentity();
}

/* ── THE PROFILE LIVES ON THE ACCOUNT ─────────────────────────────────────
 *
 * supabase/129_hoops_profiles.sql. Every choice on this page that is the
 * player's (the jersey, the arena, the camera, the last club and decade, the
 * guide) is written to the account's row the moment it is made, and read back
 * on every sign in, where the SERVER'S ANSWER WINS. The browser keeps a copy so
 * the page draws before the round trip lands, and that copy is a cache of the
 * row rather than the record.
 *
 * A CHOICE THE SERVER HAS NEVER HEARD OF GOES UP ON THE WAY IN, which is how
 * everything chosen before this existed, or while the database was a
 * migration behind, reaches the account. Only when the browser is this
 * account's (the same owner rule the cloud save runs on): another account's
 * leftovers are never claimed.
 *
 * FAILS SOFT, both ways. A null answer from getProfile is no opinion and moves
 * nothing; a write that does not land leaves the choice where it was on screen
 * and it goes up again on the next sign in. A guest has no row, so a guest's
 * choices are the one thing that stays on the device, until they sign in. */
var profileWho = null;
function profileSend(f){
  var st = A.state();
  if (!st || !st.signedIn || typeof A.setProfile !== 'function' || !f) return;
  var clean = {}, any = false;
  for (var k in f) if (f[k] !== undefined && f[k] !== null) { clean[k] = f[k]; any = true; }
  if (!any) return;
  try { A.setProfile(clean); } catch (e) {}
}
function profilePull(){
  var st = A.state(), uid = st && st.signedIn ? st.userId : null;
  if (!uid || typeof A.getProfile !== 'function') { profileWho = null; return null; }
  if (profileWho === uid) return null;
  profileWho = uid;
  var mine = !cloudOwner() || cloudOwner() === uid;
  return A.getProfile().then(function(row){
    if (!row || profileWho !== uid) return;
    var up = {};
    /* the jersey and the arena are keyed by account on the device already */
    var looks = lookMap(), l = looks[uid] || {};
    if (row.jersey_club) l.club = row.jersey_club; else if (l.club) up.club = l.club;
    if (row.jersey_num) l.num = row.jersey_num; else if (l.num) up.num = String(l.num);
    /* a number picked as a guest on this browser comes with the sign in */
    else if (mine && looks.guest && looks.guest.num) { l.num = String(looks.guest.num); up.num = l.num; }
    looks[uid] = l;
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(looks)); } catch (e) {}
    var arenas = arenaChoices();
    if (row.arena) arenas[uid] = row.arena; else if (arenas[uid]) up.arena = arenas[uid];
    try { localStorage.setItem(ARENA_KEY, JSON.stringify(arenas)); } catch (e) {}
    /* the rest are one per device, so a previous account's are not claimed */
    var dev = function(key, col, field, val){
      var here = null;
      try { here = localStorage.getItem(key); } catch (e) {}
      if (row[col] != null && row[col] !== '') {
        try { localStorage.setItem(key, String(val(row[col]))); } catch (e) {}
      } else if (mine && here) up[field] = field === 'guide' ? here === '1' : here;
    };
    dev(CAM_KEY, 'camera', 'camera', function(v){ return v; });
    dev(CLUBKEY, 'last_club', 'lastClub', function(v){ return v; });
    dev(ERAKEY, 'last_era', 'lastEra', function(v){ return v; });
    dev(FRG_KEY, 'guide_seen', 'guide', function(v){ return v ? '1' : '0'; });
    if (Object.keys(up).length) profileSend(up);
    arenaChanged();
    renderIdentity();
    renderHome();
  });
}
var jzSeq = 0;
function jerseySvg(code, num){
  var k = kitOf(code), id = 'jz' + (++jzSeq);
  var n = String(num == null ? '' : num).slice(0, 2);
  var fs = n.length > 1 ? 21 : 24;
  return '<svg viewBox="0 0 60 64" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>' +
    '<path d="M16,4 Q21,4 23,9 Q30,14 37,9 Q39,4 44,4 L50,6 Q47,16 52,25 L52,60 Q30,63.5 8,60 L8,25 Q13,16 10,6 Z" fill="' + k.bg + '"/>' +
    '<path d="M16,4 Q21,4 23,9 Q30,14 37,9 Q39,4 44,4 L50,6 Q47,16 52,25 L52,60 Q30,63.5 8,60 L8,25 Q13,16 10,6 Z" fill="url(#' + id + ')"/>' +
    '<path d="M16,4 Q21,4 23,9 Q30,14 37,9 Q39,4 44,4" fill="none" stroke="' + k.accent + '" stroke-width="2.6"/>' +
    '<path d="M10,6 Q13,16 8,25 M50,6 Q47,16 52,25" fill="none" stroke="' + k.accent + '" stroke-width="2.4"/>' +
    '<text x="30" y="45" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="' + fs + '" fill="' + k.on + '"' +
    ' stroke="' + k.accent + '" stroke-width=".9" paint-order="stroke">' + esc(n) + '</text></svg>';
}

function renderIdentity(){
  var el = $('pf-id');
  if (!el) return;
  var st = A.state(), look = myLook(), info = arenaInfo();
  var name = (st && st.signedIn) ? (st.name || 'No name yet') : 'Guest';
  var sub = (st && st.signedIn) ? kitOf(look.club).name + ' colors · #' + look.num
    : 'Sign in to earn arenas and club colors';
  el.innerHTML = '<span class="jz">' + jerseySvg(look.club, look.num) + '</span>' +
    '<span class="who"><b>' + esc(name) + (info.pro ? '<i class="pro">PRO</i>' : '') + '</b>' +
    '<span>' + esc(sub) + '</span></span><span class="go">Locker</span>';
}

/* ── THE LOCKER ─────────────────────────────────────────────────────────── */
function arenaCard(a, info, current, sfx){
  var st = CT.status(a, info);
  var card = document.createElement('div');
  card.className = 'ar-card r-' + a.tier + (st.ok ? '' : ' lock');
  card.setAttribute('data-arena', a.id);
  var foot;
  if (a.id === current) foot = '<span class="inuse">Playing here</span>';
  else if (st.ok) foot = '<button type="button" data-use="' + a.id + '">Play here</button>';
  /* Signed in, the counts ARE the rule, so the sentence is not said twice. */
  else foot = (st.parts ? '' : '<span class="lbl">' + esc(st.label) + '</span>') +
    (st.parts ? '<div class="bar"><i style="width:' + Math.round(100 * st.have / st.of) + '%"></i></div>' +
      '<span class="lbl reqs">' + st.parts.map(function(q){
        return '<span' + (q.have >= q.of ? ' class="met"' : '') + '>' + q.have + '/' + q.of + ' ' + q.word + '</span>';
      }).join('') + '</span>' : '');
  card.innerHTML = CT.preview(a.id, sfx) +
    '<div class="ab"><span class="rar">' + esc(CT.TIERS[a.tier] || a.tier) + '</span><b>' + esc(a.name) + '</b>' +
    '<span class="nod">' + esc(a.nod) + '</span><div class="foot">' + foot + '</div></div>';
  return card;
}
function renderLocker(){
  var box = $('pf-locker');
  if (!box) return;
  box.textContent = '';
  var info = arenaInfo(), look = myLook();

  /* the jersey */
  var j = document.createElement('div');
  j.className = 'lk';
  j.innerHTML = '<h3>Your jersey <span>' + esc(kitOf(look.club).name) + ' colors</span></h3>' +
    '<div class="lk-jersey"><span class="jz" id="lk-jz">' + jerseySvg(look.club, look.num) + '</span>' +
    '<div class="lk-num"><label for="lk-num">Your number</label>' +
    '<input id="lk-num" inputmode="numeric" maxlength="2" value="' + esc(look.num) + '" aria-label="Your number"></div></div>' +
    '<div class="sw-grid" id="lk-kits"></div>' +
    '<p class="lknote">' + (info.signed
      ? (info.pro ? 'Pro wears every club.' : 'Play One Franchise with a club to wear its colors. Pro wears every club.')
      : 'Sign in, then play One Franchise with a club to wear its colors.') + '</p>';
  box.appendChild(j);
  var grid = j.querySelector('#lk-kits');
  var kits = [HOUSE_KIT.code].concat(E.franchises().map(function(f){ return f.code; }));
  kits.forEach(function(code){
    var owned = kitOwned(code, info), k = kitOf(code);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw' + (code === look.club ? ' on' : '') + (owned ? '' : ' lock');
    b.setAttribute('data-kit', code);
    b.setAttribute('aria-label', k.name + (owned ? '' : ', locked'));
    b.innerHTML = '<span class="jz">' + jerseySvg(code, look.num) + '</span>';
    b.onclick = function(){
      if (!owned) {
        toast(info.signed ? 'Play One Franchise with the ' + k.name + ' to wear their colors.'
          : 'Sign in to wear club colors.');
        return;
      }
      setLook({ club: code });
      renderLocker();
    };
    grid.appendChild(b);
  });
  var inp = j.querySelector('#lk-num');
  inp.oninput = function(){
    var v = inp.value.replace(/\D/g, '').slice(0, 2);
    if (v !== inp.value) inp.value = v;
    if (!v) return;
    setLook({ num: v });
    var big = $('lk-jz');
    if (big) big.innerHTML = jerseySvg(myLook().club, v);
  };

  /* the camera */
  var cam = document.createElement('div');
  cam.className = 'lk';
  cam.innerHTML = '<h3>Camera</h3><div class="seg" role="radiogroup">' +
    '<button type="button" data-cam="tq" role="radio">Three-quarter</button>' +
    '<button type="button" data-cam="top" role="radio">Overhead</button></div>' +
    '<p class="lknote">Three-quarter shows the arena behind the basket. Overhead is the whole floor from above.</p>';
  box.appendChild(cam);
  var mark = function(){
    cam.querySelectorAll('[data-cam]').forEach(function(b){
      var on = b.getAttribute('data-cam') === camera();
      b.className = on ? 'on' : '';
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  };
  cam.querySelectorAll('[data-cam]').forEach(function(b){
    b.onclick = function(){ setCamera(b.getAttribute('data-cam')); mark(); };
  });
  mark();

  /* the arenas */
  if (!CT) return;
  var cur = currentArena(), n = CT.unlockedIds(info).length;
  var ar = document.createElement('div');
  ar.className = 'lk';
  ar.innerHTML = '<h3>Arenas <span>' + n + ' of ' + CT.ARENAS.length + '</span></h3><div class="ar-grid" id="lk-arenas"></div>' +
    '<p class="lknote">Everybody starts on the Blacktop. The rest are earned with runs, badges and days played.' +
    (info.signed ? ' Pro adds two of its own.' : ' Sign in and everything you have played counts.') + '</p>';
  box.appendChild(ar);
  var ag = ar.querySelector('#lk-arenas');
  CT.ARENAS.forEach(function(a){ ag.appendChild(arenaCard(a, info, cur, 'lk')); });
  ag.onclick = function(ev){
    var b = ev.target.closest && ev.target.closest('[data-use]');
    if (!b) return;
    setArena(b.getAttribute('data-use'));
    toast('Playing at ' + CT.BY_ID[b.getAttribute('data-use')].name);
    renderLocker();
  };
}

/* ── AN ARENA THIS RUN OPENED ───────────────────────────────────────────── */
function renderNewArenas(){
  var card = $('o-arenacard');
  if (!card) return;
  var ids = (run && run.earned && run.earned.arenas) || [];
  if (!CT || !ids.length || !badgesOn()) { card.hidden = true; card.textContent = ''; return; }
  var a = CT.BY_ID[ids[0]];
  if (!a) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = '<h2>New arena unlocked</h2><div class="na">' + CT.preview(a.id, 'na') +
    '<div><b>' + esc(a.name) + '</b><span>' + esc(a.nod) +
    (ids.length > 1 ? ' And ' + (ids.length - 1) + ' more in your locker.' : '') + '</span>' +
    (currentArena() === a.id ? '<span>Playing here.</span>'
      : '<button type="button" id="b-na-use">Play here next</button>') + '</div></div>';
  var b = $('b-na-use');
  if (b) b.onclick = function(){ setArena(a.id); toast('Playing at ' + a.name); renderNewArenas(); };
}

/* A basket standing up, for the three-quarter camera. The rim is centred at
   (20, 20.8) of the box, which is the point .hoop's transform anchors on. */
var HOOP_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true">' +
  '<rect x="18.7" y="15" width="2.6" height="10.5" fill="#262c38"/>' +
  '<rect x="7" y="1.5" width="26" height="15.5" rx="1" fill="rgba(225,238,255,.30)" stroke="#f4f7fb" stroke-width="1.3"/>' +
  '<rect x="15" y="8" width="10" height="7.2" fill="none" stroke="#f4f7fb" stroke-width="1"/>' +
  '<path d="M 15.2,20.8 L 16.9,27.2 L 23.1,27.2 L 24.8,20.8 M 17.6,21.4 L 18.4,27.2 M 20,21.6 L 20,27.2 M 22.4,21.4 L 21.6,27.2 M 16,23.8 L 24,23.8" fill="none" stroke="rgba(255,255,255,.82)" stroke-width=".55"/>' +
  '<ellipse cx="20" cy="20.8" rx="5" ry="1.5" fill="none" style="stroke:var(--rimc,#f0782d)" stroke-width="1.25"/>' +
  '</svg>';

/* The court's height over its width. Read off the laid out box when there is
   one, and off the computed aspect ratio when the court is on a screen that is
   not showing, because a hidden box measures zero and zero is not a shape. */
function courtRatio(el){
  var w = el.clientWidth, h = el.clientHeight;
  if (w > 0 && h > 0) return h / w;
  var m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(getComputedStyle(el).aspectRatio || '');
  return m ? (+m[2]) / (+m[1]) : 0.94;
}
function dressCourt(el){
  if (!el) return;
  var id = currentArena(), cam = camera(), key = id + '|' + cam;
  if (el._dress !== key) {
    el._dress = key;
    el.style.cssText = CT ? CT.floorVars(id) : '';
    el.setAttribute('data-arena', id);
    el.setAttribute('data-surf', CT ? CT.floorOf(id).surf : 'wood');
    el.classList.toggle('tq', cam === 'tq');
    var sc = el.querySelector('.scene');
    if (sc) sc.innerHTML = (cam === 'tq' && CT) ? CT.scene(id, el.id || 'c') : '';
    var hp = el.querySelector('.hoop');
    if (hp && !hp.firstChild) hp.innerHTML = HOOP_SVG;
    var ln = el.querySelector('.lines');
    if (ln && !ln.firstChild && CT) ln.innerHTML = CT.lines(el.id || 'c');
  }
  el._ratio = courtRatio(el);
  if (cam === 'tq' && CT) {
    el.style.setProperty('--tq-d', String(CT.TQ.persp * 100));
    el.style.setProperty('--tq-tilt', CT.TQ.tilt + 'deg');
    el.style.setProperty('--tq-far', CT.farEdge(el._ratio).toFixed(3) + '%');
    var hoop = el.querySelector('.hoop');
    if (hoop) {
      var r = CT.project(CT.RIM_PCT.x, CT.RIM_PCT.y, el._ratio);
      hoop.style.left = r.x.toFixed(3) + '%';
      hoop.style.top = r.y.toFixed(3) + '%';
      hoop.style.setProperty('--s', r.s.toFixed(4));
    }
  }
}
/* Where a spot stands, in whichever camera the court is in. The flat position
   is kept on the element so a court that changes shape (a phone turned, a
   breakpoint crossed) can put everybody back without repainting the roster. */
function placeSpot(el, sp){
  var x = +sp.dataset.px, y = +sp.dataset.py;
  if (CT && el.classList.contains('tq')) {
    var r = CT.project(x, y, el._ratio || courtRatio(el));
    sp.style.left = r.x.toFixed(3) + '%';
    sp.style.top = r.y.toFixed(3) + '%';
    sp.style.setProperty('--s', Math.max(0.84, Math.min(1, r.s)).toFixed(4));
    sp.style.zIndex = String(4 + Math.round(r.y));
  } else {
    sp.style.left = x + '%';
    sp.style.top = y + '%';
    sp.style.removeProperty('--s');
    sp.style.zIndex = '';
  }
}
var COURT_IDS = ['h-court', 'court', 'o-court'];
function redressCourts(){
  arenaMemo = null;
  for (var i = 0; i < COURT_IDS.length; i++) {
    var el = $(COURT_IDS[i]);
    if (!el) continue;
    el._dress = null;
    dressCourt(el);
    var sp = el.querySelectorAll('.spot');
    for (var k = 0; k < sp.length; k++) placeSpot(el, sp[k]);
  }
}
/* A court only changes shape at a breakpoint, but a turned phone crosses one. */
window.addEventListener('resize', function(){
  for (var i = 0; i < COURT_IDS.length; i++) {
    var el = $(COURT_IDS[i]);
    if (!el || !el._dress) continue;
    var r = courtRatio(el);
    if (Math.abs(r - (el._ratio || 0)) < 0.004) continue;
    dressCourt(el);
    var sp = el.querySelectorAll('.spot');
    for (var k = 0; k < sp.length; k++) placeSpot(el, sp[k]);
  }
});

var SPOTS = {
  PG:  { x: 50, y: 62 }, SG: { x: 84, y: 46 }, SF: { x: 16, y: 46 },
  PF:  { x: 27, y: 20 }, C:  { x: 62, y: 15 }
};

function renderCourt(justSlot, into){
  var filled = {};
  for (var r = 0; r < run.roster.length; r++) filled[E.SLOTS[run.slotIndex[r]]] = run.roster[r];
  paintCourt(into || $('court'), filled, justSlot);
}

/* THE PAINTER, taking a roster rather than reading the run.
 *
 * Split out so the landing screen can use it. That screen builds a roster
 * nobody is playing, and the alternative was a second copy of this loop that
 * would have drifted the first time a spot moved. The front page has to look
 * like the game, which it cannot do if it is drawing its own picture of it. */
function paintCourt(el, filled, justSlot){
  if (!el) return;
  dressCourt(el);
  var old = el.querySelectorAll('.spot');
  for (var i = 0; i < old.length; i++) old[i].remove();

  for (var s = 0; s < E.SLOTS.length; s++) {
    var slot = E.SLOTS[s], pos = SPOTS[slot], p = filled[slot];
    var sp = document.createElement('div');
    sp.className = 'spot' + (p ? ' on' : '') + (p && slot === justSlot ? ' just' : '');
    sp.dataset.px = pos.x;
    sp.dataset.py = pos.y;
    placeSpot(el, sp);

    var disc = document.createElement('div');
    disc.className = 'disc';
    if (p) disc.style.background = posPaint(slot);
    disc.textContent = slot;
    sp.appendChild(disc);

    var nm = document.createElement('span');
    nm.className = 'nm';
    /* LAST NAMES, ON BOTH COURTS. A spot is 74px wide, so a full name does not
       fit on either of them: this went in as last-name-on-the-front-page-only,
       on the theory that the draft earns the full name because that is where
       you are deciding, and the very next screenshot showed "Damian Lill..."
       on the draft court. A truncated name earns nothing. The full name is on
       the board tile, which is where the decision is actually made; the floor
       is a glance. */
    nm.textContent = p ? lastName(p.n) : 'open';
    sp.appendChild(nm);

    if (p) {
      var yr = document.createElement('span');
      yr.className = 'yr';
      yr.textContent = p.s + ' ' + E.teamName(p.t);
      sp.appendChild(yr);
    }
    el.appendChild(sp);
  }

  /* WHICH NAMES NEED TWO LINES IS MEASURED, NOT COUNTED.
     This went in as "longer than thirteen characters", which is wrong, and
     measuring every one of the 1,624 distinct surnames in the data said so:
     Vandeweghe clips at ten while other names fit at twelve. Width is pixels
     and a character count is a proxy that is wrong in both directions. One
     layout read per spot, six per paint, and it is right for every name in the
     data at every width, including whichever one arrives next season. */
  var names = el.querySelectorAll('.spot .nm');
  for (var n = 0; n < names.length; n++) {
    if (names[n].scrollWidth > names[n].clientWidth + 1) names[n].className = 'nm long';
  }
}
