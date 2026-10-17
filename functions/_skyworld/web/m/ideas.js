/* The Ideas page: the Advisor Agent's weekly suggestions (more players, new games, ads, revenue, anything else),
 * read from its notes in the vault through /skyworld/api/ideas. A button in the top bar on the map, with how
 * many are new; a large panel on a desktop, a full screen sheet on a phone. */
(function(){
var CSS = '\
.sw-ideas-btn{ pointer-events:auto; width:auto; margin:0; height:34px; padding:0 12px; border-radius:999px; border:1px solid var(--line); background:#fff; color:var(--ink); font:inherit; font-size:13px; font-weight:800; cursor:pointer; white-space:nowrap; }\
.sw-ideas-btn b{ display:inline-block; min-width:18px; margin-left:6px; padding:1px 6px; border-radius:999px; background:#e5483a; color:#fff; font-size:11px; }\
body.sw-in .sw-ideas-btn{ display:none; }\
.sw-ideas{ position:fixed; inset:0; z-index:8; display:none; background:rgba(29,53,80,.35); }\
.sw-ideas.on{ display:grid; place-items:center; }\
.sw-ideas .box{ width:min(760px, calc(100vw - 32px)); height:min(86vh, 900px); background:var(--card); border:1px solid var(--line); border-radius:18px; box-shadow:0 20px 50px rgba(29,53,80,.3); display:flex; flex-direction:column; overflow:hidden; }\
.sw-ideas .hd{ padding:16px 56px 10px 18px; border-bottom:1px solid var(--line); position:relative; }\
.sw-ideas h2{ margin:0 0 4px; font-size:21px; }\
.sw-ideas .sub{ font-size:12.5px; color:var(--mute); }\
.sw-ideas .x{ position:absolute; right:14px; top:14px; width:34px; height:34px; margin:0; border:0; border-radius:9px; background:#efe9d8; font-weight:900; color:var(--ink); cursor:pointer; }\
.sw-ideas .bar{ display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }\
.sw-ideas .chip{ width:auto; margin:0; height:30px; padding:0 11px; border-radius:999px; border:1px solid var(--line); background:#fff; color:var(--ink); font:inherit; font-size:12.5px; font-weight:700; cursor:pointer; }\
.sw-ideas .chip.on{ background:var(--ink); color:#fff; border-color:var(--ink); }\
.sw-ideas .list{ overflow:auto; padding:12px 18px 24px; flex:1; }\
.sw-ideas .card{ border:1px solid var(--line); border-radius:14px; padding:12px 14px; margin:0 0 10px; background:#fff; }\
.sw-ideas .card h3{ margin:0 0 6px; font-size:16px; }\
.sw-ideas .tags{ display:flex; gap:5px; flex-wrap:wrap; margin-bottom:6px; font-size:11.5px; font-weight:800; }\
.sw-ideas .tag{ border-radius:6px; padding:2px 7px; background:#efe9d8; color:var(--ink); }\
.sw-ideas .txt{ font-size:14px; line-height:1.45; max-height:4.4em; overflow:hidden; }\
.sw-ideas .card.open .txt{ max-height:none; }\
.sw-ideas .txt p{ margin:0 0 8px; } .sw-ideas .txt ul{ margin:0 0 8px; padding-left:18px; }\
.sw-ideas .more{ all:unset; cursor:pointer; color:#2a6fd0; font-weight:800; font-size:13px; margin-top:4px; display:inline-block; }\
.sw-ideas .empty{ color:var(--mute); padding:30px 4px; text-align:center; }\
@media (max-width:700px){ .sw-ideas.on{ place-items:stretch; } .sw-ideas .box{ width:100vw; height:100%; border-radius:0; border:0; padding-top:env(safe-area-inset-top); } }';
var CAT = { players:['More players', '#2fa84a'], games:['New games', '#7a5cff'], ads:['Ads', '#d99a16'], revenue:['Revenue', '#2a6fd0'], product:['Product', '#e5483a'] };
var VERDICT = { 'new':['New', '#e5483a'], yes:['Yes', '#2fa84a'], no:['No', '#8a8a8a'], later:['Later', '#d99a16'], done:['Done', '#1d3550'] };
var data = null, wk = 0, cat = 'all', root = null, btn = null;
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function et(iso){ try { return new Date(iso).toLocaleTimeString('en-US', { timeZone:'America/New_York', hour:'numeric', minute:'2-digit' }) + ' ET'; } catch (e) { return '-'; } }
function day(d){ try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month:'short', day:'numeric' }); } catch (e) { return d; } }
// the little markdown a suggestion uses: paragraphs, bullets, bold, and links (https only)
function md(s){ var out = [], list = null;
  function inline(t){ return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, function(m, a, u){ return '<a href="' + u + '" target="_blank" rel="noopener">' + a + '</a>'; }); }
  String(s || '').split(/\n\s*\n/).forEach(function(block){ var lines = block.split('\n');
    if (lines.every(function(l){ return /^\s*[-*]\s+/.test(l); })) out.push('<ul>' + lines.map(function(l){ return '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>'; }).join('') + '</ul>');
    else out.push('<p>' + inline(block.replace(/\n/g, ' ')) + '</p>'); });
  return out.join(''); }
function who(id){ if (!id) return ''; if (id === 'owner') return 'You'; return id.split('-').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ') + ' Agent'; }
function render(){ var box = root.querySelector('.list'), bar = root.querySelector('.bar'), sub = root.querySelector('.sub');
  if (!data){ box.innerHTML = '<div class="empty">Loading ideas.</div>'; return; }
  if (data.error){ box.innerHTML = '<div class="empty">Could not load the ideas. Try again in a minute.</div>'; return; }
  var weeks = data.weeks || [];
  if (!weeks.length){ sub.textContent = 'From the Advisor Agent, every Monday morning.'; bar.innerHTML = ''; box.innerHTML = '<div class="empty">The Advisor\'s first ideas are on the way.</div>'; return; }
  var w = weeks[wk] || weeks[0], items = w.items || [];
  sub.innerHTML = 'From the Advisor Agent · week of ' + esc(day(w.date)) + ' · as of ' + esc(et(data.asOf)) + (w.summary ? '<br>' + esc(w.summary) : '');
  var n = { all:items.length }; items.forEach(function(it){ n[it.category] = (n[it.category] || 0) + 1; });
  bar.innerHTML = weeks.map(function(x, i){ return '<button class="chip' + (i === wk ? ' on' : '') + '" data-w="' + i + '">' + (i ? esc(day(x.date)) : 'This week') + '</button>'; }).join('') + '<span style="flex-basis:100%"></span>' +
    ['all'].concat(Object.keys(CAT)).filter(function(c){ return c === 'all' || n[c]; }).map(function(c){ return '<button class="chip' + (c === cat ? ' on' : '') + '" data-c="' + c + '">' + (c === 'all' ? 'All' : CAT[c][0]) + ' ' + (n[c] || 0) + '</button>'; }).join('');
  var shown = items.filter(function(it){ return cat === 'all' || it.category === cat; });
  box.innerHTML = shown.length ? shown.map(function(it, i){ var c = CAT[it.category], v = VERDICT[it.verdict] || VERDICT['new'];
    return '<div class="card"><h3>' + esc(it.title) + '</h3><div class="tags">' +
      (c ? '<span class="tag" style="background:' + c[1] + ';color:#fff">' + c[0] + '</span>' : '') +
      '<span class="tag" style="background:' + v[1] + ';color:#fff">' + v[0] + '</span>' +
      (it.impact ? '<span class="tag">' + esc(it.impact) + ' impact</span>' : '') + (it.effort ? '<span class="tag">' + esc(it.effort) + ' effort</span>' : '') +
      (it['for'] ? '<span class="tag">For: ' + esc(who(it['for'])) + '</span>' : '') +
      '</div><div class="txt">' + md(it.body) + '</div><button class="more">More</button></div>'; }).join('') : '<div class="empty">Nothing here this week.</div>';
  [].forEach.call(box.querySelectorAll('.card'), function(cd){ var t = cd.querySelector('.txt'), m = cd.querySelector('.more'); if (t.scrollHeight <= t.clientHeight + 2) m.style.display = 'none';
    m.onclick = function(){ var o = cd.classList.toggle('open'); m.textContent = o ? 'Less' : 'More'; }; });
  [].forEach.call(bar.querySelectorAll('[data-w]'), function(b){ b.onclick = function(){ wk = +b.dataset.w; cat = 'all'; render(); }; });
  [].forEach.call(bar.querySelectorAll('[data-c]'), function(b){ b.onclick = function(){ cat = b.dataset.c; render(); }; }); }
function load(){ return fetch('/skyworld/api/ideas', { credentials:'same-origin' }).then(function(r){ if (!r.ok) throw 0; return r.json(); })
  .then(function(d){ data = d; var w = (d.weeks || [])[0], fresh = w ? w.items.filter(function(it){ return it.verdict === 'new'; }).length : 0;
    btn.innerHTML = 'Ideas' + (fresh ? '<b>' + fresh + '</b>' : ''); if (root.classList.contains('on')) render(); })
  .catch(function(){ data = { error:true }; if (root.classList.contains('on')) render(); }); }
function open(){ root.classList.add('on'); render(); if (!data || data.error) load(); }
function close(){ root.classList.remove('on'); }
function mount(){ var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  btn = document.createElement('button'); btn.className = 'sw-ideas-btn'; btn.textContent = 'Ideas'; btn.onclick = open;
  var top = document.querySelector('.sw-top'), sp = top && top.querySelector('.sw-sp'); if (top) top.insertBefore(btn, sp || null);
  root = document.createElement('div'); root.className = 'sw-ideas'; root.innerHTML = '<div class="box" role="dialog" aria-label="Ideas"><div class="hd"><h2>Ideas</h2><div class="sub"></div><button class="x" aria-label="Close">×</button><div class="bar"></div></div><div class="list"></div></div>';
  document.body.appendChild(root);
  root.querySelector('.x').onclick = close; root.onclick = function(e){ if (e.target === root) close(); };
  // Escape closes this first, before the world behind it sees the key
  addEventListener('keydown', function(e){ if (e.key === 'Escape' && root.classList.contains('on')){ e.stopImmediatePropagation(); close(); } }, true);
  setTimeout(load, 1200); }
if (window.SKY) mount(); else window.addEventListener('sky-ready', mount, { once:true });
window.SKY_IDEAS = { open:open, close:close };
})();
