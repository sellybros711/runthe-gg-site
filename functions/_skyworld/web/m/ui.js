/* The Sky World's chrome: the top bar with its "as of" times, the legend, the zoom buttons, the hover card
 * (desktop), and the panel for whatever is chosen: a side panel on a desktop, a bottom sheet on a phone. */
(function(){
var CSS = '\
:root{ --ink:#1d3550; --card:#fffdf6; --line:#e3dcc8; --mute:#6b7a8c; --live:#2fa84a; --test:#d99a16; --dev:#7a5cff; --unl:#2a9fd6; }\
html,body{ overflow:hidden; touch-action:none; overscroll-behavior:none; }\
#world,#over{ position:fixed; inset:0; image-rendering:pixelated; }\
#over{ cursor:grab; }\
.sw-top{ position:fixed; left:12px; right:12px; top:max(10px,env(safe-area-inset-top)); display:flex; gap:8px; align-items:center; pointer-events:none; z-index:3; }\
.sw-brand{ pointer-events:auto; white-space:nowrap; background:var(--ink); color:#fff; border-radius:12px; padding:8px 12px; font-weight:800; letter-spacing:.06em; font-size:13px; box-shadow:0 2px 0 rgba(0,0,0,.18); }\
.sw-chips{ display:flex; gap:6px; flex-wrap:wrap; pointer-events:auto; }\
.sw-chip{ background:rgba(255,253,246,.94); border:1px solid var(--line); border-radius:999px; padding:5px 10px; font-size:12px; font-weight:600; white-space:nowrap; }\
.sw-chip b{ font-weight:800; }\
.sw-sp{ flex:1; }\
.sw-btn{ width:auto; margin:0; pointer-events:auto; background:rgba(255,253,246,.94); border:1px solid var(--line); border-radius:10px; height:36px; min-width:36px; padding:0 10px; font:inherit; font-weight:800; color:var(--ink); cursor:pointer; }\
.sw-legend{ position:fixed; left:12px; bottom:max(14px,env(safe-area-inset-bottom)); background:rgba(255,253,246,.94); border:1px solid var(--line); border-radius:12px; padding:8px 10px; font-size:12px; display:flex; gap:10px; z-index:2; }\
.sw-dot{ display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:4px; vertical-align:-1px; }\
.sw-zoom{ position:fixed; right:12px; bottom:max(14px,env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:6px; z-index:2; }\
.sw-hover{ position:fixed; pointer-events:none; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:8px 10px; box-shadow:0 6px 18px rgba(29,53,80,.18); max-width:260px; font-size:12.5px; display:none; z-index:4; }\
.sw-hover b{ display:block; font-size:13.5px; }\
.sw-panel{ position:fixed; top:64px; right:12px; bottom:12px; width:380px; background:var(--card); border:1px solid var(--line); border-radius:16px; box-shadow:0 10px 30px rgba(29,53,80,.22); overflow:auto; transform:translateX(420px); transition:transform .25s ease; z-index:5; }\
.sw-panel.on{ transform:none; }\
.sw-ph{ padding:16px 52px 10px 16px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--card); }\
.sw-ph h2{ margin:0 0 6px; font-size:19px; }\
.sw-pill{ display:inline-block; font-size:11.5px; font-weight:800; border-radius:999px; padding:2px 8px; color:#fff; }\
.sw-sec{ padding:12px 16px; border-bottom:1px solid var(--line); }\
.sw-sec h3{ margin:0 0 8px; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--mute); }\
.sw-row{ display:flex; gap:8px; align-items:flex-start; padding:5px 0; }\
.sw-row .k{ flex:1; }\
.sw-row button{ all:unset; cursor:pointer; flex:1; font-weight:600; }\
.sw-asof{ font-size:11.5px; color:var(--mute); }\
.sw-x{ margin:0; position:absolute; right:12px; top:12px; border:0; background:#efe9d8; border-radius:8px; width:32px; height:32px; font-weight:900; color:var(--ink); cursor:pointer; }\
.sw-grab{ display:none; }\
.sw-load{ position:fixed; inset:0; display:grid; place-items:center; font-weight:800; color:#fff; text-shadow:0 1px 0 rgba(0,0,0,.2); font-size:16px; z-index:6; pointer-events:none; }\
.sw-load.sw-small{ inset:auto; left:50%; transform:translateX(-50%); bottom:max(18px,env(safe-area-inset-bottom)); top:auto; background:rgba(29,53,80,.86); color:#fff; text-shadow:none; border-radius:999px; padding:7px 14px; font-size:13px; }\
.sw-back{ width:auto; margin:0; pointer-events:auto; display:none; white-space:nowrap; background:#fff; color:var(--ink); border:1px solid var(--line); border-radius:12px; height:38px; padding:0 14px; font:inherit; font-weight:800; cursor:pointer; box-shadow:0 2px 0 rgba(0,0,0,.08); }\
.sw-title{ pointer-events:auto; display:none; background:rgba(255,253,246,.96); border:1px solid var(--line); border-radius:12px; padding:6px 12px; font-weight:800; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60vw; }\
.sw-title .sw-pill{ margin-left:8px; vertical-align:1px; }\
body.sw-in .sw-back, body.sw-in .sw-title{ display:inline-block; }\
body.sw-in .sw-brand, body.sw-in .sw-chips .sw-chip:not(.m), body.sw-in .sw-legend{ display:none; }\
@media (max-width:700px){ body.sw-in .sw-chips{ display:none; } .sw-title{ max-width:calc(100vw - 120px); } }\
.sw-fade{ position:fixed; inset:0; z-index:7; pointer-events:none; opacity:0; transition:opacity .38s ease; display:grid; place-items:center;\
  background:radial-gradient(60% 50% at 30% 40%,#ffffff 0%,rgba(255,255,255,0) 70%),radial-gradient(55% 45% at 70% 60%,#f4f8fc 0%,rgba(244,248,252,0) 70%),linear-gradient(#eaf3fb,#dde9f5); }\
.sw-fade.on{ opacity:1; pointer-events:auto; }\
.sw-fade span{ background:rgba(29,53,80,.86); color:#fff; border-radius:999px; padding:8px 16px; font-weight:800; font-size:14px; opacity:0; transition:opacity .2s; }\
.sw-fade span.on{ opacity:1; }\
.sw-warn{ position:fixed; left:50%; transform:translateX(-50%); top:60px; background:#fff3d6; color:#7a5200; border:1px solid #f0d8a0; border-radius:10px; padding:6px 10px; font-size:12.5px; font-weight:700; z-index:3; }\
@media (max-width:700px){\
  .sw-chips .sw-chip:not(.m){ display:none; }\
  .sw-legend,.sw-zoom{ display:none; }\
  .sw-panel{ top:auto; left:0; right:0; bottom:0; width:auto; max-height:62vh; border-radius:18px 18px 0 0; transform:translateY(105%); padding-bottom:env(safe-area-inset-bottom); }\
  .sw-panel.on{ transform:none; }\
  .sw-grab{ display:block; width:40px; height:5px; border-radius:3px; background:#d8d0bc; margin:8px auto 0; }\
}';
var S = window.SKY_W;   // status.js: each status's name and colour
var W = null, LN = {}, $ = {}, ticks = 0;
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function et(iso){ try { return new Date(iso).toLocaleTimeString('en-US', { timeZone:'America/New_York', hour:'numeric', minute:'2-digit' }) + ' ET'; } catch (e) { return '-'; } }
function mk(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; document.body.appendChild(e); return e; }
function plural(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }

window.SKY_UI = {
  el:function(id){ return document.getElementById(id); },
  mount:function(world, games, on){ W = world; var gs = games.filter(function(g){ return g.status !== 'hub'; }); (W.layers || []).forEach(function(l){ LN[l.id] = l.name; });
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var gate = document.getElementById('gate'); if (gate) gate.style.display = 'none';
    document.title = 'Sky World';
    var c1 = document.createElement('canvas'); c1.id = 'world'; document.body.appendChild(c1);
    var c2 = document.createElement('canvas'); c2.id = 'over'; document.body.appendChild(c2);
    var counts = {}; gs.forEach(function(g){ counts[g.status] = (counts[g.status] || 0) + 1; });
    $.top = mk('div', 'sw-top', '<div class="sw-brand">SKY WORLD</div><button class="sw-back" aria-label="Back to the map">‹ Map</button><div class="sw-title"></div><div class="sw-chips"><span class="sw-chip m">Games as of <b>' + esc(et(W.asOf)) + '</b></span>' +
      '<span class="sw-chip">' + esc(plural(gs.length, 'game')) + ' · ' + (counts.live || 0) + ' live · ' + (counts.testers || 0) + ' for testers · ' + ((counts.dev || 0) + (counts.unlisted || 0)) + ' more</span></div><div class="sw-sp"></div>');
    mk('div', 'sw-legend', Object.keys(S.STATUS).filter(function(k){ return S.STATUS[k].legend; }).map(function(k){ var st = S.STATUS[k]; return '<span><i class="sw-dot" style="background:' + st.col + '"></i>' + esc(st.legend) + '</span>'; }).join(''));
    var z = mk('div', 'sw-zoom', '<button class="sw-btn" aria-label="Zoom in">+</button><button class="sw-btn" aria-label="Zoom out">-</button>');
    z.children[0].onclick = function(){ SKY.zoom(1); }; z.children[1].onclick = function(){ SKY.zoom(-1); };
    $.hover = mk('div', 'sw-hover'); $.panel = mk('div', 'sw-panel', '<div class="sw-grab"></div><div></div>'); $.pc = $.panel.children[1];
    $.load = mk('div', 'sw-load', 'Raising the islands');
    $.top.querySelector('.sw-back').onclick = function(){ on.leave(); };
    $.fade = mk('div', 'sw-fade', '<span></span>'); },
  fade:function(on){ $.fade.classList.toggle('on', !!on); if (!on) $.fade.firstChild.classList.remove('on'); return new Promise(function(ok){ setTimeout(ok, 400); }); },
  flying:function(g){ $.fade.firstChild.textContent = 'Flying to ' + g.name; $.fade.firstChild.classList.add('on'); },
  entered:function(g, w){ document.body.classList.add('sw-in');
    $.top.querySelector('.sw-title').innerHTML = esc(g.name) + '<span class="sw-pill" style="background:' + S.status(g).col + '">' + esc(S.statusLabel(g)) + '</span>'; document.title = g.name + ' · Sky World'; },
  left:function(){ document.body.classList.remove('sw-in'); document.title = 'Sky World'; },
  layerNames:function(){ return LN; },
  progress:function(){ ticks++; if ($.load) $.load.textContent = 'Raising the islands' + '...'.slice(0, 1 + (ticks >> 3) % 3); },
  painting:function(){ if ($.load){ $.load.className = 'sw-load sw-small'; } },
  ready:function(warn){ if ($.load){ $.load.remove(); $.load = null; } if (arguments.length) SKY_UI.warn(warn); },
  // the note that this place is a flat map: the map's own, or a world's while it is open
  warn:function(text){ if (!text){ if ($.warn) $.warn.style.display = 'none'; return; } if (!$.warn) $.warn = mk('div', 'sw-warn'); $.warn.textContent = text; $.warn.style.display = ''; },
  hover:function(h, x, y){ var html = null;
    if (h && h.p && window.SKY_HOVER_CARD) html = window.SKY_HOVER_CARD(h);
    else if (h && h.g && !h.d && !h.g.world){ html = '<b>' + esc(h.g.name) + '</b><span style="color:' + S.status(h.g).col + ';font-weight:800">' + esc(S.statusLabel(h.g)) + '</span>' + (h.g.note ? ' · ' + esc(h.g.note) : '') + '<br>' + esc(plural(h.g.layers.length, 'district')) + '<br><span class="sw-asof">Click to go in</span>'; }
    else if (h && h.d) html = '<b>' + esc(LN[h.d.id]) + '</b>' + esc(h.g.name) + ' · ' + esc(plural(h.g.counts[h.d.id] || 0, 'file')) + '<br><span class="sw-asof">Click for more</span>';
    if (!html){ $.hover.style.display = 'none'; return; }
    $.hover.innerHTML = html; $.hover.style.display = 'block'; $.hover.style.left = Math.min(innerWidth - 270, x + 16) + 'px'; $.hover.style.top = (y + 12) + 'px'; },
  select:function(h){ $.hover.style.display = 'none'; if (!h){ $.panel.classList.remove('on'); return; }
    if (h.p && window.SKY_PANEL){ $.pc.innerHTML = window.SKY_PANEL(h); }
    else if (h.d){ var g = h.g, n = g.counts[h.d.id] || 0; SKY.focus(h.d.x, h.d.y, g.z);
      $.pc.innerHTML = head(LN[h.d.id], g) + '<div class="sw-sec"><h3>On ' + esc(g.name) + '</h3>' + esc(plural(n, 'file')) + ' in this layer.<div class="sw-asof">As of ' + esc(et(W.asOf)) + '</div></div>';
    } else if (h.g){ var g2 = h.g;
      $.pc.innerHTML = head(g2.name, g2) +
        '<div class="sw-sec"><h3>Where it lives</h3>' + (g2.where ? '<code>' + esc(g2.where) + '</code>' : 'Not on the site yet.') + (g2.branch ? '<br><span class="sw-asof">Branch ' + esc(g2.branch) + '</span>' : '') + '</div>' +
        '<div class="sw-sec"><h3>Districts</h3>' + (g2.layers.length ? g2.layers.map(function(l){ return '<div class="sw-row"><button data-d="' + l + '">' + esc(LN[l]) + '</button><span class="sw-asof">' + esc(plural(g2.counts[l] || 0, 'file')) + '</span></div>'; }).join('') : '<div class="sw-asof">No files yet.</div>') +
        '<div class="sw-asof">As of ' + esc(et(W.asOf)) + '</div></div>';
      [].forEach.call($.pc.querySelectorAll('[data-d]'), function(b){ b.onclick = function(){ var d = g2.dist.filter(function(k){ return k.id === b.dataset.d; })[0]; SKY.select({ g:g2, d:d }); }; });   // select() focuses on it
      SKY.focus(g2.x, g2.y, g2.z); }
    var x = $.pc.querySelector('.sw-x'); if (x) x.onclick = function(){ SKY.select(null); };
    $.panel.classList.add('on'); }
};
function head(title, g){ var st = S.status(g); return '<div class="sw-ph"><button class="sw-x" aria-label="Close">×</button><h2>' + esc(title) + '</h2><span class="sw-pill" style="background:' + st.col + '">' + esc(st.label) + '</span>' + (g.note ? ' <span class="sw-asof">' + esc(g.note) + '</span>' : '') + '</div>'; }
})();
