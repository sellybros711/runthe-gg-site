/* golf/putt/clips.js: share clips of your putts in Putt Putt Tour.

   While a hole is played, every putt is recorded from the moment it is struck until the ball stops, drops or is
   lost, and so is the whole hole (every putt in order, the aiming between them cut out). When the hole is holed,
   the card after it offers each putt as its own clip and the whole hole as one, shared through the phone's share
   sheet (navigator.share with files) or saved as a download where a browser cannot share a file.

   HOW IT WATCHES WITHOUT TOUCHING THE GAME. putt.js is not edited: this file reads the open game through
   RTT_PUTT._state() once a frame while Putt Putt is open (body.pt-open), and sees a putt start when the play
   state goes to 'roll' and end when it leaves 'roll' (and 'cheer', for a ball that dropped). The picture is the
   play canvas itself (S.cv), which is everything the player sees: putt.js composites the 3D hole (hole3d.js
   renders it once, ahead) and every moving piece into that one 2D canvas each frame. Each frame of a putt is
   copied, scaled down, into a small canvas of our own that carries the overlay (the hole, the stroke, runthe.gg),
   and that canvas is what MediaRecorder encodes. So the game's own canvas is never read back or resized.

   WHAT IT COSTS, AND WHAT IT NEVER DOES.
   - Nothing at all without MediaRecorder and canvas.captureStream: feature detected once, and the loop never starts.
   - Between putts it records nothing: the recorders are stopped or paused, and the loop only reads a few fields.
   - While a putt rolls: one drawImage at 30 frames a second into a canvas at most CAP pixels on its long side.
   - A watchdog: if the page falls under about 20 frames a second while recording, recording stops for the rest
     of the visit. Play always wins over the clip.
   - Memory is one hole's clips. A new hole, a replay, the trail or closing Putt Putt drops them.
   - Nothing opens by itself. The share row only appears inside the card the game already shows, and only when
     there is a clip with something in it. Every share or save is a tap.
   - Every call into the browser is in a try. A failure here turns clips off; it never throws into the game.

   Only RTT_PUTT_CLIPS leaves the wrapper. */
(function(){
var CAP = 864, FPS = 30, MAX_PUTT_MS = 20000, MAX_HOLE_MS = 60000, MAX_PUTTS = 12, TAIL_MS = 500, BITS = 2500000;
var MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'];

var mime = null, off = false, why = '';
function detect(){
  try{
    if (typeof window.MediaRecorder !== 'function'){ why = 'no MediaRecorder'; return null; }
    if (!window.HTMLCanvasElement || typeof HTMLCanvasElement.prototype.captureStream !== 'function'){ why = 'no captureStream'; return null; }
    var ok = typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported : function(){ return false; };
    for (var i = 0; i < MIMES.length; i++) if (ok.call(MediaRecorder, MIMES[i])) return MIMES[i];
    why = 'no video type'; return null;
  }catch(e){ why = 'detect threw'; return null; }
}
function ext(){ return /mp4/.test(mime) ? 'mp4' : 'webm'; }
function baseType(){ return mime.split(';')[0]; }

/* ---- one hole's recording */
var H = null;   // the hole being recorded: its play (P), our canvas (rc), the putts' clips, the whole hole's recorder (full)
function dropHole(){
  if (!H) return; var h = H; H = null;
  try{ if (h.cur && h.cur.mr.state !== 'inactive') h.cur.mr.stop(); }catch(e){}
  try{ if (h.full && h.full.mr.state !== 'inactive') h.full.mr.stop(); }catch(e){}
  try{ if (h.st) h.st.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
  (h.urls || []).forEach(function(u){ try{ URL.revokeObjectURL(u); }catch(e){} });
  h.putts = []; h.fullBlob = null;
}
function newHole(S){
  dropHole();
  var W = S.cv.width, Hh = S.cv.height, k = Math.min(1, CAP / Math.max(W, Hh));
  var rc = document.createElement('canvas'); rc.width = Math.max(2, Math.round(W * k / 2) * 2); rc.height = Math.max(2, Math.round(Hh * k / 2) * 2);
  var hd = S.ov && S.ov.querySelector('.pt-hd b'), sub = S.ov && S.ov.querySelector('.pt-hd span'), tag = sub ? String(sub.textContent).split(' · ')[0] : '';
  H = { P:S.play, rc:rc, rx:rc.getContext('2d'), st:null, putts:[], cur:null, full:null, fullBlob:null, fullMs:0, name:(hd ? hd.textContent : 'Putt Putt Tour') + (/^Hole /.test(tag) ? ' · ' + tag : ''), par:S.play.C && S.play.C.par,
    done:false, card:null, urls:[], lastDraw:0, wasRoll:false };
  try{ H.st = rc.captureStream(FPS); }catch(e){ return kill('captureStream threw'); }
}
function recorder(onBlob){
  var parts = [], mr;
  try{ mr = new MediaRecorder(H.st, { mimeType:mime, videoBitsPerSecond:BITS }); }catch(e){ try{ mr = new MediaRecorder(H.st); }catch(e2){ kill('MediaRecorder threw'); return null; } }
  var R = { mr:mr, t0:performance.now(), ms:0, from:null };
  mr.ondataavailable = function(e){ if (e.data && e.data.size) parts.push(e.data); };
  mr.onstop = function(){ var b = parts.length ? new Blob(parts, { type:(mr.mimeType || mime).split(';')[0] }) : null; parts = []; onBlob(b, R); };
  mr.onerror = function(){ kill('recorder error'); };
  return R;
}
// a putt is struck: a recorder of its own, and the whole hole's recorder started or resumed
function strike(P){
  if (!H || H.putts.length >= MAX_PUTTS) return;
  var h = H, n = P.strokes;
  paint(P, true);
  var R = recorder(function(b, R0){ if (h !== H || h.dead) return; h.stopped = (h.stopped || 0) + 1;
    if (b && b.size){ h.putts.push({ blob:b, n:R0.n, ms:R0.ms, i:R0.i }); h.putts.sort(function(a, c){ return a.i - c.i; }); } settleCard(); });
  if (!R) return; R.n = n; R.i = h.seq = (h.seq || 0) + 1; h.cur = R;
  try{ R.mr.start(1000); }catch(e){ return kill('start threw'); }
  if (!h.full){ var F = recorder(function(b){ if (h !== H || h.dead) return; h.fullBlob = b && b.size ? b : null; h.fullDone = true; settleCard(); });
    if (F){ h.full = F; try{ F.mr.start(1000); }catch(e){ h.full = null; } } }
  else if (h.full.mr.state === 'paused'){ try{ h.full.mr.resume(); }catch(e){} }
  if (h.full) h.full.from = performance.now();
}
// the ball has stopped, dropped or gone: the putt's clip ends, the whole hole's pauses
function stopPutt(){
  var h = H; if (!h || !h.cur) return;
  var R = h.cur; h.cur = null; R.ms = performance.now() - R.t0;
  try{ if (R.mr.state !== 'inactive'){ R.mr.requestData && R.mr.requestData(); R.mr.stop(); } }catch(e){}
  if (h.full && h.full.from != null){ h.fullMs += performance.now() - h.full.from; h.full.from = null;
    try{ if (h.full.mr.state === 'recording'){ if (h.fullMs > MAX_HOLE_MS) h.full.mr.stop(); else h.full.mr.pause(); } }catch(e){} }
}
// the hole is over (the card is up): the whole hole's clip is closed
function closeHole(){
  var h = H; if (!h || h.done) return; h.done = true;
  if (h.cur) stopPutt();
  try{ if (h.full && h.full.mr.state !== 'inactive') h.full.mr.stop(); else if (!h.full) h.fullDone = true; }catch(e){ h.fullDone = true; }
}

/* ---- the picture: the play canvas, scaled, with a small band along the bottom */
function paint(P, force){
  var now = performance.now(); if (!force && now - H.lastDraw < 1000 / FPS - 2) return; H.lastDraw = now;
  var S = state(), src = S && S.cv; if (!src || !src.width) return;
  var x = H.rx, W = H.rc.width, Hh = H.rc.height, k = Math.min(W / src.width, Hh / src.height), w = src.width * k, hh = src.height * k;
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#0a1a12'; x.fillRect(0, 0, W, Hh);
  x.imageSmoothingEnabled = k < 1; x.drawImage(src, (W - w) / 2, (Hh - hh) / 2, w, hh);
  var u = Math.max(10, Math.round(Math.min(W, Hh) / 26)), bh = Math.round(u * 3.1), y = Hh - bh;
  var g = x.createLinearGradient(0, y - u, 0, Hh); g.addColorStop(0, 'rgba(6,16,11,0)'); g.addColorStop(0.35, 'rgba(6,16,11,.72)'); g.addColorStop(1, 'rgba(6,16,11,.9)');
  x.fillStyle = g; x.fillRect(0, y - u, W, bh + u);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  x.fillStyle = '#fbf2e0'; x.font = '800 ' + Math.round(u * 1.15) + 'px system-ui,sans-serif'; x.fillText(H.name, u, y + u * 1.25, W * 0.62);
  x.fillStyle = '#cfe0d8'; x.font = '700 ' + Math.round(u * 0.9) + 'px system-ui,sans-serif';
  x.fillText((H.par ? 'Par ' + H.par + ' · ' : '') + 'Stroke ' + (P.strokes || 1), u, y + u * 2.45, W * 0.62);
  x.textAlign = 'right'; x.fillStyle = '#F1D04A'; x.font = '900 ' + Math.round(u * 1.05) + 'px system-ui,sans-serif'; x.fillText('runthe.gg', W - u, y + u * 1.9);
}

/* ---- the loop: only while Putt Putt is open */
var raf = 0, lastT = 0, slow = 0;
function state(){ try{ return window.RTT_PUTT && window.RTT_PUTT._state && window.RTT_PUTT._state(); }catch(e){ return null; } }
function tick(t){
  raf = requestAnimationFrame(tick);
  var dt = lastT ? t - lastT : 16; lastT = t;
  try{ step(dt); }catch(e){ kill('step threw'); }
}
function step(dt){
  var S = state();
  if (!S || (S.screen !== 'play' && S.screen !== 'card')){ dropHole(); return; }
  var P = S.play;
  if (S.screen === 'card'){   // the Daily Hole's result is its own screen, put up the moment the ball drops
    if (H && H.P === P && !H.done){ if (P && P.sunk) H.sunk = true; closeHole(); }
    if (H && H.done && H.sunk) settleCard(); else dropHole();
    return;
  }
  if (!P || !S.cv) return;
  if (!H || H.P !== P){ if (P.state === 'roll' || !S.cv.width) return; newHole(S); if (!H) return; }
  if (H.done){ if (H.sunk) settleCard(); return; }
  var now = performance.now(), moving = P.state === 'roll' || P.state === 'cheer';
  if (H.cur){
    // the watchdog: a phone that cannot keep up gets its frames back
    // (a gap over a second is the tab put away or a stall, not a slow phone, so it is not counted)
    if (dt < 1000) slow = dt > 50 ? slow + dt : Math.max(0, slow - dt);
    if (slow > 1500){ kill('the page fell under 20 frames a second'); return; }
    paint(P, false);
    if (now - H.cur.t0 > MAX_PUTT_MS) stopPutt();
    else if (!moving){ if (!H.cur.endAt) H.cur.endAt = now; if (now - H.cur.endAt >= TAIL_MS || P.state === 'done') stopPutt(); }
    else if (H.cur.endAt) stopPutt();   // struck again inside the last one's tail
  }
  if (P.state === 'roll' && !H.wasRoll) strike(P);
  H.wasRoll = P.state === 'roll';
  if (P.sunk) H.sunk = true;
  if (P.state === 'done'){ closeHole(); if (!H.sunk) freeClips(H); }   // over par: nothing to share
}
function freeClips(h){ h.dead = true; h.putts = []; h.fullBlob = null; }
function kill(reason){ off = true; why = reason || why; dropHole(); if (raf){ cancelAnimationFrame(raf); raf = 0; } }
function watch(){
  if (!mime || off) return;
  var on = document.body.classList.contains('pt-open');
  if (on && !raf){ lastT = 0; slow = 0; raf = requestAnimationFrame(tick); }
  else if (!on && raf){ cancelAnimationFrame(raf); raf = 0; dropHole(); }
}

/* ---- the share row, inside the card the game already put up */
var CSS = '.ppc-row{margin:2px 0 12px;display:flex;flex-direction:column;gap:8px;align-items:stretch}' +
  '.ppc-main{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:8px 12px 8px 8px;border-radius:14px;border:1px solid rgba(241,208,74,.55);background:rgba(241,208,74,.08);color:#fbf2e0;font:inherit;cursor:pointer;text-align:left}' +
  '.ppc-main:hover,.ppc-main:focus-visible{background:rgba(241,208,74,.16);outline:none}' +
  '.ppc-main video{width:40px;height:52px;object-fit:cover;border-radius:9px;background:#0a1a12;flex:none;pointer-events:none}' +
  '.ppc-main b{display:block;font-size:15px;font-weight:900}.ppc-main small{display:block;font-size:12px;color:#cfe0d8;font-weight:700;margin-top:1px}' +
  '.ppc-main span{flex:1;min-width:0}.ppc-main i{flex:none;width:30px;height:30px;border-radius:50%;background:#F1D04A;display:grid;place-items:center}' +
  '.ppc-main i svg{width:16px;height:16px}' +
  '.ppc-putts{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.ppc-putts::-webkit-scrollbar{display:none}' +
  '.ppc-putts button{flex:1 0 auto;min-width:64px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 10px;border-radius:11px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fbf2e0;font:inherit;font-size:13px;font-weight:800;cursor:pointer}' +
  '.ppc-putts button svg{width:16px;height:16px;flex:none}' +
  '.ppc-main .ppc-thumb{position:relative;flex:none;display:block;min-width:0}.ppc-thumb svg{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}' +
  '.ppc-putts button:hover,.ppc-putts button:focus-visible{border-color:#F1D04A;outline:none}' +
  '.ppc-row[data-busy] button{opacity:.6}' +
  '.pp-dres+.ppc-row,.pt-menu>.ppc-row{margin:0}';
// share: an arrow up out of a tray; save: an arrow down into one
function icon(share){ return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + (share ? 'M8 1.5v8.2M4.9 4.4 8 1.3l3.1 3.1' : 'M8 1.5v8.2M4.9 6.6 8 9.7l3.1-3.1') + 'M3 7.5v6h10v-6" fill="none" stroke="#1c1606" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
// play: a yellow disc with a dark triangle, so a putt button reads as a video
var PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5" fill="#F1D04A"/><path d="M6.4 4.9v6.2L11.2 8z" fill="#1c1606"/></svg>';
function css(){ if (document.getElementById('ppc-css')) return; var s = document.createElement('style'); s.id = 'ppc-css'; s.textContent = CSS; document.head.appendChild(s); }
function canShareFile(){
  try{ if (!navigator.share || !navigator.canShare) return false; return navigator.canShare({ files:[new File([new Blob([''], { type:baseType() })], 'clip.' + ext(), { type:baseType() })] }); }catch(e){ return false; }
}
function secs(ms){ var s = Math.max(1, Math.round(ms / 1000)); return s + ' s'; }
function settleCard(){
  var h = H; if (!h || !h.done || !h.sunk || !h.fullDone) return;
  if (h.cur || (h.stopped || 0) < (h.seq || 0)) return;   // every putt's recorder has handed its clip over
  var S = state(); if (!S || !S.ov) return;
  if (h.card && S.ov.contains(h.card)) return;
  var host = S.ov.querySelector('.pt-stage .pt-pop'), before = null, after = null;
  if (host){ var rows = host.querySelectorAll(':scope > .row'); before = rows.length ? rows[rows.length - 1] : null; if (!before) return; }
  else { var dres = S.ov.querySelector('.pp-dres'); if (!dres) return; after = dres; }
  var putts = h.putts.filter(function(c){ return c.blob && c.blob.size; }), full = h.fullBlob && h.fullBlob.size ? h.fullBlob : null;
  if (!full && putts.length === 1) full = putts[0].blob;
  if (!full && !putts.length) return;
  css();
  var share = canShareFile(), verb = share ? 'Share' : 'Save', one = putts.length <= 1;
  var url = URL.createObjectURL(full || putts[0].blob); h.urls.push(url);
  var row = document.createElement('div'); row.className = 'ppc-row'; row.setAttribute('data-clips', '');
  var fullMs = h.fullMs || putts.reduce(function(a, c){ return a + c.ms; }, 0);
  row.innerHTML = '<button class="ppc-main" data-clip="hole" aria-label="' + verb + ' the hole clip"><span class="ppc-thumb"><video muted loop playsinline autoplay preload="metadata" src="' + url + '"></video>' + PLAY + '</span>' +
    '<span><b>' + verb + ' ' + (one ? 'the clip' : 'the hole') + '</b><small>' + (one ? 'Your putt' : putts.length + ' putts') + ' · ' + secs(fullMs) + '</small></span><i>' + icon(share) + '</i></button>' +
    (one ? '' : '<div class="ppc-putts">' + putts.map(function(c, j){ return '<button data-clip="' + j + '" aria-label="' + verb + ' putt ' + (j + 1) + '">' + PLAY + 'Putt ' + (j + 1) + '</button>'; }).join('') + '</div>');
  if (before) before.parentNode.insertBefore(row, before); else after.parentNode.insertBefore(row, after.nextSibling);
  h.card = row;
  var nm = String(h.name || 'putt').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'putt';
  row.querySelectorAll('[data-clip]').forEach(function(b){ b.onclick = function(e){ e.stopPropagation();
    var k = b.getAttribute('data-clip'), blob = k === 'hole' ? (full || putts[0].blob) : putts[+k].blob;
    give(blob, 'putt-putt-' + nm + (k === 'hole' ? '' : '-putt-' + (+k + 1)) + '.' + ext(), share, row, k === 'hole' && !one ? 'My hole' : 'My putt'); }; });
}
/* putt.js owns the link (RTT_PUTT.SHARE_URL, the full https:// form); this is only its stand-in if putt.js
   is somehow not there, so a shared clip still carries a tappable link. */
function shareUrl(){ var P = window.RTT_PUTT; return (P && P.SHARE_URL) || 'https://runthe.gg/golf/'; }
function give(blob, name, share, row, what){
  var type = baseType();
  if (share){
    var f; try{ f = new File([blob], name, { type:type }); }catch(e){ f = null; }
    if (f){ row.setAttribute('data-busy', '');
      try{ navigator.share({ files:[f], title:'Putt Putt Tour', text:what + ' on Putt Putt Tour. Play at ' + shareUrl() })
        .catch(function(){}).then(function(){ row.removeAttribute('data-busy'); }); return; }catch(e){ row.removeAttribute('data-busy'); } }
  }
  try{ var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ try{ URL.revokeObjectURL(u); }catch(e){} }, 60000); }catch(e){}
}

/* ---- start */
mime = detect();
function boot(){
  if (!mime) return;
  try{ new MutationObserver(watch).observe(document.body, { attributes:true, attributeFilter:['class'] }); }catch(e){ return; }
  watch();
}
if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);

// for checks: what is supported, and what this hole holds right now. Nothing on the page calls it.
window.RTT_PUTT_CLIPS = { API_VERSION:1, on:function(){ return !!mime && !off; }, mime:function(){ return mime; }, why:function(){ return why; },
  now:function(){ return H ? { putts:H.putts.map(function(c){ return { n:c.n, size:c.blob.size, ms:Math.round(c.ms) }; }), full:H.fullBlob ? H.fullBlob.size : 0, fullMs:Math.round(H.fullMs), done:H.done, sunk:!!H.sunk } : null; } };
})();
