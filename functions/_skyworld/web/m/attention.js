/* What needs you, everywhere you look.
 *
 *   On the map: a badge over every island where something waits on you, with how many. Red when something is
 *   stuck (an agent asking you, failing checks, a conflict), blue when it only waits for your review or merge.
 *   In the top bar: "Needs you", the inbox of all of it across every world.
 *   In a world: an agent that waits on you wears a blinking "!" bubble, and its district's sign gets a badge.
 *   On an agent's panel, and in the inbox: what it is waiting on (its question, from its chat), a box to
 *   answer it, and Merge on a PR that is green and clean (admins only; the server checks it all again).
 *
 * It reads the agents through window.SKY_AGENTS (agents.js) and is told when they change. */
(function(){
var S = window.SKY_W, DPR = S.DPR, admin = false, btn = null, inbox = null, byGame = {}, items = [], blinkT = null;
var RED = '#e5483a', BLUE = '#2a6fd0';
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function gameOf(a){ return (a.at && a.at.game) || a.home; }
function gname(id){ var g = S.games.filter(function(x){ return x.id === id; })[0]; return g ? g.name : id; }

/* what one agent needs from you: its question, PRs to merge, PRs that are failing or conflicted. stuck means red. */
function needs(a){ var out = [], c = a.chat;
  if (c && (c.state === 'blocked' || c.state === 'review_ready')) out.push({ kind:c.state === 'blocked' ? 'ask' : 'review', stuck:c.state === 'blocked', text:c.ask || c.summary || (c.state === 'blocked' ? 'It is waiting on you.' : 'It is waiting for your review.') });
  (a.prs || []).forEach(function(r){
    if (r.ready) out.push({ kind:'merge', pr:r, stuck:false, text:'#' + r.n + ' is green and ready to merge.' });
    else if (r.checks === 'fail') out.push({ kind:'failing', pr:r, stuck:true, text:'#' + r.n + ' has failing checks.' });
    else if (r.conflict) out.push({ kind:'conflict', pr:r, stuck:true, text:'#' + r.n + ' has a merge conflict.' }); });
  return out; }

function update(d){ items = []; byGame = {};
  ((d && d.agents) || []).concat((d && d.builders) || []).forEach(function(a){ var n = needs(a); if (!n.length) return; var gid = gameOf(a), lay = a.at && a.at.layer;
    items.push({ a:a, n:n, game:gid });
    var b = byGame[gid] || (byGame[gid] = { count:0, stuck:false, layers:{} }); b.count += n.length; b.stuck = b.stuck || n.some(function(x){ return x.stuck; });
    if (lay){ var l = b.layers[lay] || (b.layers[lay] = { count:0, stuck:false }); l.count += n.length; l.stuck = l.stuck || n.some(function(x){ return x.stuck; }); } });
  items.sort(function(x, y){ return (y.n.some(function(i){ return i.stuck; }) - x.n.some(function(i){ return i.stuck; })) || x.a.name.localeCompare(y.a.name); });
  var total = items.reduce(function(t, it){ return t + it.n.length; }, 0), stuck = items.some(function(it){ return it.n.some(function(i){ return i.stuck; }); });
  if (btn){ btn.innerHTML = '<span class="t">Needs you</span>' + (total ? '<b style="background:' + (stuck ? RED : BLUE) + '">' + total + '</b>' : ''); btn.classList.toggle('calm', !total); }
  if (inbox && inbox.classList.contains('on')) renderInbox();
  // a blink while anything that needs you is on screen: two frames a second, never a running loop
  clearInterval(blinkT); if (total) blinkT = setInterval(function(){ if (!document.hidden) S.overlay(); }, 600);
  S.overlay(); }

// ---- the badges: over islands on the map, over district signs in a world
function badge(o, x, y, n, stuck, big){ var r = (big ? 13 : 10) * DPR; o.fillStyle = '#ffffff'; o.beginPath(); o.arc(x, y, r + 2.5 * DPR, 0, 7); o.fill();
  o.fillStyle = stuck ? RED : BLUE; o.beginPath(); o.arc(x, y, r, 0, 7); o.fill();
  o.fillStyle = '#ffffff'; o.font = '900 ' + Math.round(r * 1.15) + 'px system-ui, sans-serif'; o.textAlign = 'center'; o.fillText(n > 9 ? '9+' : String(n), x, y + r * 0.4); o.textAlign = 'left'; }
window.SKY_DRAW_TOP = function(o, now, sc){ var any = false;
  if (!sc.world){ S.games.forEach(function(g){ var b = byGame[g.id]; if (!b || g.sx == null) return; any = true;
      var pulse = 1 + 0.12 * (Math.floor(now / 600) % 2), x = (g.sx + g.sw / 2) * DPR + 4 * DPR, y = g.sy * DPR;
      o.save(); o.translate(x, y); o.scale(pulse, pulse); badge(o, 0, 0, b.count, b.stuck, true); o.restore(); }); }
  else { var b2 = byGame[sc.g.id]; if (b2 && sc.w.dist) sc.w.dist.forEach(function(d){ var l = b2.layers[d.id]; if (!l || d.sx == null) return; any = true; badge(o, (d.sx + d.sw / 2) * DPR + 2 * DPR, d.sy * DPR, l.count, l.stuck, false); }); }
  return false; };
// the bubble over an agent that waits on you: a speech bubble with "!", blinking
window.SKY_ATTENTION = { update:update,
  bubble:function(o, p, s, u, now, sc){ var n = needs(p.a); if (!n.length) return; var stuck = n.some(function(i){ return i.stuck; }), on = Math.floor(now / 600) % 2 === 0;
    var bx = s[0] + 6 * u, by = s[1] - 24 * u, w = 7 * u, h = 8 * u;
    o.fillStyle = on ? (stuck ? RED : BLUE) : '#ffffff'; o.strokeStyle = stuck ? RED : BLUE; o.lineWidth = Math.max(2, u * 0.6);
    o.beginPath(); o.moveTo(bx - w / 2, by - h / 2); o.lineTo(bx + w / 2, by - h / 2); o.lineTo(bx + w / 2, by + h / 2); o.lineTo(bx - w / 6, by + h / 2); o.lineTo(bx - w / 2, by + h / 2 + 2.5 * u); o.lineTo(bx - w / 2, by - h / 2); o.closePath(); o.fill(); o.stroke();
    o.fillStyle = on ? '#ffffff' : (stuck ? RED : BLUE); o.font = '900 ' + Math.round(7 * u) + 'px system-ui'; o.textAlign = 'center'; o.fillText('!', bx, by + 2.6 * u); o.textAlign = 'left'; },
  section:function(a){ var n = needs(a); return n.length ? '<div class="sw-sec sw-att"><h3 style="color:' + (n.some(function(i){ return i.stuck; }) ? RED : BLUE) + '">Waiting on you</h3>' + body(a, n, 'p') + '</div>' : ''; },
  bind:function(a){ bindItem(a, 'p'); } };

// ---- what it is waiting on, the answer box and the Merge buttons (on its panel, 'p', and in the inbox, 'i<n>')
function body(a, n, key){ var ask = n.filter(function(i){ return i.kind === 'ask' || i.kind === 'review'; })[0], html = '';
  if (ask) html += '<div class="sw-ask">' + esc(ask.text) + '</div>';
  n.filter(function(i){ return i.pr; }).forEach(function(i){ var r = i.pr;
    html += '<div class="sw-row"><span class="k"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">#' + r.n + '</a> ' + esc(r.title) + '<br><span class="sw-asof" style="color:' + (i.stuck ? RED : '#2fa84a') + '">' + esc(i.text) + '</span></span>' +
      (i.kind === 'merge' ? (admin ? '<button class="sw-merge" data-k="' + key + '" data-pr="' + r.n + '" data-sha="' + esc(r.sha) + '" data-title="' + esc(r.title) + '">Merge</button>' : '<span class="sw-asof">An admin merges</span>') : '') + '</div>'; });
  // a builder chat is no agent the dispatcher can reach, so its answer goes in its chat
  if (!a.builder && (ask || n.some(function(i){ return i.kind === 'failing' || i.kind === 'conflict'; })))
    html += '<textarea class="sw-ans" data-k="' + key + '" rows="2" maxlength="4000" placeholder="' + (ask ? 'Answer it' : 'Tell it what to do') + '"></textarea><button class="sw-ansgo" data-k="' + key + '">' + (ask ? 'Send answer' : 'Send') + '</button><div class="sw-asof sw-ansnote" data-k="' + key + '">It reaches its chat on the dispatcher\'s next run (hourly, 8am to midnight ET).</div>';
  if (a.chat) html += '<div style="margin-top:6px"><a href="' + esc(a.chat.link) + '" target="_blank" rel="noopener" style="font-weight:800;color:#2a6fd0;font-size:13px">Or answer in its chat now ›</a></div>';
  return html; }
function bindItem(a, key){ var root = key === 'p' ? document.querySelector('.sw-panel') : inbox; if (!root) return;
  var ta = root.querySelector('.sw-ans[data-k="' + key + '"]'), go = root.querySelector('.sw-ansgo[data-k="' + key + '"]'), note = root.querySelector('.sw-ansnote[data-k="' + key + '"]');
  if (go) go.onclick = function(){ var t = ta.value.trim(); if (t.length < 2){ note.textContent = 'Write a few words first.'; return; } go.disabled = true; note.textContent = 'Sending.';
    var kind = needs(a).some(function(i){ return i.kind === 'ask' || i.kind === 'review'; }) ? 'answer' : 'task';
    SKY_AGENTS.post(a.id, t, kind, a.at).then(function(x){ go.disabled = false;
      note.textContent = x.ok ? 'Sent. It reaches its chat on the dispatcher\'s next run.' : x.j && x.j.error === 'tasking_off' ? 'Tasking is not connected yet: the vault token is missing.' : 'That did not send. Try again.';
      if (x.ok) ta.value = ''; }).catch(function(){ go.disabled = false; note.textContent = 'That did not send. Try again.'; }); };
  [].forEach.call(root.querySelectorAll('.sw-merge[data-k="' + key + '"]'), function(b){ b.onclick = function(){
    if (!confirm('Merge #' + b.dataset.pr + ' "' + b.dataset.title + '" into main? It goes live on runthe.gg.')) return;
    b.disabled = true; b.textContent = 'Merging';
    fetch('/skyworld/api/merge', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ pr:+b.dataset.pr, sha:b.dataset.sha }) })
      .then(function(r){ return r.json(); }).then(function(j){
        if (j.ok){ b.textContent = 'Merged'; b.style.background = '#2fa84a'; setTimeout(function(){ SKY_AGENTS.reload(); }, 1200); return; }
        b.disabled = false; b.textContent = 'Merge';
        alert({ admins_only:'Only an admin can merge.', merge_off:'Merging is not connected yet: the merge token is missing.', changed:'Something was pushed since. Look again, then merge.', checks_running:'Its checks are still running.',
          checks_failing:'Its checks are failing.', not_clean:'GitHub says it does not merge cleanly right now.', not_open:'It is no longer open.', draft:'It is still a draft.', not_an_agents_pr:'That PR is not an agent\'s.' }[j.why || j.error] || 'That did not merge. Try again.'); })
      .catch(function(){ b.disabled = false; b.textContent = 'Merge'; }); }; }); }

// ---- the inbox
function renderInbox(){ var list = inbox.querySelector('.list');
  if (!items.length){ list.innerHTML = '<div class="empty">Nothing needs you right now.</div>'; return; }
  list.innerHTML = items.map(function(it, i){ var stuck = it.n.some(function(x){ return x.stuck; }), LN = SKY_UI.layerNames();
    return '<div class="idea" style="border-left:5px solid ' + (stuck ? RED : BLUE) + '"><h3>' + esc(it.a.name) + '</h3><div class="sw-asof">' + esc(gname(it.game)) + (it.a.at && it.a.at.layer ? ' · ' + esc(LN[it.a.at.layer] || it.a.at.layer) : '') +
      ' · <a href="#" data-go="' + esc(it.a.id) + '" style="color:#2a6fd0;font-weight:800">Go there ›</a></div>' + body(it.a, it.n, 'i' + i) + '</div>'; }).join('');
  items.forEach(function(it, i){ bindItem(it.a, 'i' + i); });
  [].forEach.call(list.querySelectorAll('[data-go]'), function(l){ l.onclick = function(e){ e.preventDefault(); inbox.classList.remove('on'); SKY_AGENTS.go(l.dataset.go); }; }); }
function mount(){ var st = document.createElement('style'); st.textContent = '\
.sw-needs-btn{ flex:none; pointer-events:auto; width:auto; margin:0; height:34px; padding:0 12px; border-radius:999px; border:0; background:#1d3550; color:#fff; font:inherit; font-size:13px; font-weight:800; cursor:pointer; white-space:nowrap; }\
.sw-needs-btn.calm{ background:#fff; color:var(--ink); border:1px solid var(--line); }\
.sw-needs-btn b{ display:inline-block; min-width:18px; margin-left:6px; padding:1px 6px; border-radius:999px; color:#fff; font-size:11px; }\
body.sw-in .sw-needs-btn{ display:inline-block; }\
@media (max-width:700px){ .sw-chip.m .l{ display:none; } .sw-needs-btn{ padding:0 10px; } .sw-needs-btn b{ margin-left:0; } .sw-needs-btn:not(.calm) .t{ display:none; } .sw-needs-btn:not(.calm)::before{ content:"!"; margin-right:5px; } }\
.sw-ask{ white-space:pre-wrap; font-size:14px; line-height:1.45; background:#fff8e6; border:1px solid #f0dca8; border-radius:10px; padding:8px 10px; margin-bottom:8px; max-height:220px; overflow:auto; }\
.sw-row .sw-merge{ all:unset; box-sizing:border-box; flex:none; height:32px; line-height:32px; padding:0 14px; border-radius:9px; background:#2fa84a; color:#fff; font-size:13px; font-weight:800; cursor:pointer; }\
.sw-ans{ width:100%; box-sizing:border-box; border:1px solid var(--line); border-radius:10px; padding:8px 10px; font:inherit; font-size:14px; margin-top:8px; resize:vertical; }\
.sw-ansgo{ width:auto; margin:6px 0 0; height:34px; padding:0 14px; border:0; border-radius:10px; background:#2f6fd0; color:#fff; font:inherit; font-weight:800; cursor:pointer; }';
  document.head.appendChild(st);
  btn = document.createElement('button'); btn.className = 'sw-needs-btn calm'; btn.textContent = 'Needs you';
  btn.onclick = function(){ inbox.classList.add('on'); renderInbox(); };
  var top = document.querySelector('.sw-top'), sp = top && top.querySelector('.sw-sp'); if (top) top.insertBefore(btn, sp || null);
  // the inbox borrows the Ideas page's sheet
  inbox = document.createElement('div'); inbox.className = 'sw-ideas'; inbox.innerHTML = '<div class="box" role="dialog" aria-label="Needs you"><div class="hd"><h2>Needs you</h2><div class="sub">Agents waiting on you, PRs to merge, and anything stuck, in every world.</div><button class="x" aria-label="Close">×</button></div><div class="list"></div></div>';
  document.body.appendChild(inbox); inbox.querySelector('.x').onclick = function(){ inbox.classList.remove('on'); }; inbox.onclick = function(e){ if (e.target === inbox) inbox.classList.remove('on'); };
  addEventListener('keydown', function(e){ if (e.key === 'Escape' && inbox.classList.contains('on')){ e.stopImmediatePropagation(); inbox.classList.remove('on'); } }, true);
  fetch('/skyworld/api/whoami', { credentials:'same-origin' }).then(function(r){ return r.ok ? r.json() : {}; }).then(function(j){ admin = j.role === 'admin'; }).catch(function(){});
  if (SKY_AGENTS && SKY_AGENTS.data()) update(SKY_AGENTS.data()); }
if (window.SKY) mount(); else window.addEventListener('sky-ready', mount, { once:true });
})();
