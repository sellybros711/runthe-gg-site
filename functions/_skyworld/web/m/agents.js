/* The characters: every agent, and every chat at work on a game, as a small pixel figure. On the map each walks the
 * bridges from RunThe.GG to the island it is working on and potters about its district; in a world, the ones working
 * there stand at their district. Click one (tap on a phone) for its panel: what it is doing, for how long, its PRs,
 * its last runs, its chat, and a box to give it a task. The data is /skyworld/api/agents (agents.js on the server),
 * fetched again every three minutes; the dispatcher refreshes it on its schedule, and the panel says how fresh it is. */
(function(){
var S = window.SKY_W, DPR = S.DPR, ART = S.ART;
var data = null, people = [], tasks = null, runs = {};
var STATE = { working:['Working', '#2fa84a'], review_ready:['Waiting on your review', '#2a9fd6'], blocked:['Waiting on you', '#d99a16'], completed:['Done, resting', '#8a8a8a'],
  idle:['Resting', '#8a8a8a'], failed:['Stopped with an error', '#e5483a'] };
function state(p){ var c = p.a.chat; return STATE[c ? c.state : 'idle'] || STATE.idle; }
function busy(p){ var c = p.a.chat; return !!c && (c.state === 'working' || c.state === 'blocked' || c.state === 'review_ready'); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function et(iso){ try { return new Date(iso).toLocaleTimeString('en-US', { timeZone:'America/New_York', hour:'numeric', minute:'2-digit' }) + ' ET'; } catch (e) { return '-'; } }
function ago(iso){ var m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); if (!isFinite(m)) return ''; if (m < 60) return m + 'm'; var h = Math.floor(m / 60); if (h < 48) return h + 'h ' + (m % 60) + 'm'; return Math.floor(h / 24) + 'd'; }
function hash(s){ var h = 2166136261; for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function gameById(id){ return S.games.filter(function(g){ return g.id === id; })[0] || S.hub; }

// ---- the look: skin, hair and shirt from the id; the tool and hat from the name
var SKIN = ['#f1c7a0', '#d9a07a', '#a86e4a', '#7a4a2e'], HAIR = ['#3a2410', '#1d1410', '#8a5a2a', '#d8a83a', '#6a3a1a'];
var SHIRT = ['#3aa05a', '#7a5cff', '#d8a83a', '#ff7a1a', '#e5483a', '#f4f1e8', '#ff5a7a', '#2f6fd0', '#b8342a', '#1d3550', '#2e8b57', '#4fb0e8', '#16a3a3', '#c03a8a'];
var KITS = [[/golf|course|putt/i, 'putter', 'cap'], [/\bui\b|ux|design/i, 'tablet'], [/econom|coin/i, 'coins'], [/art\b/i, 'brush', 'beret'], [/floor|hoop|basket/i, 'ball', 'band'],
  [/\bqa\b|test/i, 'clipboard'], [/market/i, 'megaphone'], [/roster/i, 'scroll'], [/store|money|pay/i, 'till'], [/last shot|coach/i, 'whistle', 'cap'], [/4th|football/i, 'football', 'helmet'],
  [/sky/i, 'kite'], [/advis|idea/i, 'bulb']];
function look(a){ var h = hash(a.id), k = null; for (var i = 0; i < KITS.length && !k; i++) if (KITS[i][0].test(a.name)) k = KITS[i];
  if (a.builder) k = [null, 'hammer', 'hard'];
  return { skin:SKIN[h % 4], hair:HAIR[(h >> 3) % 5], shirt:SHIRT[(h >> 6) % SHIRT.length], kit:k ? k[1] : 'satchel', hat:k && k[2] || 'none' }; }
// an 11 by 15 figure, f the walking frame: [x, y, colour] cells
function sprite(L, f){ var P = [], x, y; function px(a, b, c){ P.push([a, b, c]); }
  for (y = 2; y < 5; y++) for (x = 3; x < 8; x++) px(x, y, L.skin);
  for (x = 3; x < 8; x++) px(x, 1, L.hair); px(3, 2, L.hair); px(7, 2, L.hair); px(4, 3, '#1d1410'); px(6, 3, '#1d1410');
  if (L.hat === 'cap'){ for (x = 3; x < 9; x++) px(x, 1, L.shirt); for (x = 4; x < 7; x++) px(x, 0, L.shirt); }
  if (L.hat === 'beret'){ for (x = 2; x < 8; x++) px(x, 1, '#2a2a3a'); px(4, 0, '#2a2a3a'); px(5, 0, '#2a2a3a'); }
  if (L.hat === 'hard' || L.hat === 'helmet'){ var hc = L.hat === 'hard' ? '#ffc020' : L.shirt; for (x = 2; x < 9; x++) px(x, 1, hc); for (x = 3; x < 8; x++) px(x, 0, hc); }
  if (L.hat === 'band') for (x = 3; x < 8; x++) px(x, 2, '#ffffff');
  for (y = 5; y < 10; y++) for (x = 3; x < 8; x++) px(x, y, L.shirt);
  px(2, 6, L.shirt); px(8, 6, L.shirt); px(2, 7, L.skin); px(8, 7, L.skin);
  for (y = 10; y < 13; y++){ px(4, y + (f && y === 12 ? 0 : 0), '#2a3a5a'); px(6, y, '#2a3a5a'); }
  px(4, 13, '#1d1410'); px(6, 13, '#1d1410'); px(f ? 3 : 7, 13, '#1d1410');
  var K = { putter:function(){ for (var y = 4; y < 14; y++) px(9, y, '#c8c8c8'); px(9, 14, '#2a2a2a'); px(10, 14, '#2a2a2a'); },
    tablet:function(){ for (var y = 5; y < 9; y++){ px(9, y, '#2a2f3a'); px(10, y, y === 6 ? '#5fd0f0' : '#2a2f3a'); } },
    coins:function(){ px(9, 8, '#a8763f'); px(10, 8, '#a8763f'); px(9, 9, '#a8763f'); px(10, 9, '#a8763f'); px(9, 7, '#ffd23f'); px(10, 7, '#ffd23f'); },
    ball:function(){ px(9, 7, '#ff7a1a'); px(10, 7, '#ff7a1a'); px(9, 8, '#ff7a1a'); px(10, 8, '#c84a10'); },
    brush:function(){ for (var y = 3; y < 8; y++) px(9, y, '#8a5a2a'); px(9, 2, '#ff5a7a'); px(9, 1, '#ff5a7a'); },
    clipboard:function(){ for (var y = 5; y < 9; y++){ px(9, y, '#a8763f'); px(10, y, '#f4f1e8'); } },
    megaphone:function(){ px(9, 5, '#ffd23f'); px(10, 4, '#ffd23f'); px(10, 5, '#ffd23f'); px(10, 6, '#ffd23f'); },
    scroll:function(){ for (var y = 5; y < 10; y++) px(9, y, '#f4ead0'); px(9, 5, '#c8a070'); px(9, 9, '#c8a070'); },
    till:function(){ for (var y = 7; y < 10; y++){ px(9, y, '#3a3e4a'); px(10, y, '#3a3e4a'); } px(9, 6, '#5fd06a'); },
    whistle:function(){ px(5, 5, '#c8c8c8'); px(5, 6, '#c8c8c8'); px(9, 6, '#f4f1e8'); px(10, 6, '#f4f1e8'); px(9, 7, '#f4f1e8'); },
    football:function(){ px(9, 7, '#8a4a20'); px(10, 7, '#8a4a20'); px(9, 8, '#8a4a20'); px(10, 8, '#ffffff'); },
    kite:function(){ for (var y = 2; y < 9; y++) px(9, y, '#c8c8c8'); px(10, 0, '#ff5a3c'); px(9, 1, '#ffd23f'); px(10, 1, '#4fb0e8'); px(11, 1, '#ff5a3c'); px(10, 2, '#ffd23f'); },
    bulb:function(){ px(9, 3, '#ffe36a'); px(10, 3, '#ffe36a'); px(9, 4, '#ffe36a'); px(10, 4, '#fff2b0'); px(9, 5, '#8a8e96'); },
    hammer:function(){ for (var y = 4; y < 9; y++) px(9, y, '#8a5a2a'); px(8, 4, '#8a8a8a'); px(10, 4, '#8a8a8a'); },
    satchel:function(){ px(8, 5, '#6a4a2a'); px(9, 8, '#a8763f'); px(10, 8, '#a8763f'); px(9, 9, '#8a5a2a'); px(10, 9, '#8a5a2a'); } };
  (K[L.kit] || K.satchel)(); return P; }

// ---- where each one goes: its district on its island, else round the landmark; the way there, bridge by bridge
function spot(p, g, sc){ var w = sc && sc.world ? sc.w : g, d = p.a.at && p.a.at.layer ? w.dist.filter(function(k){ return k.id === p.a.at.layer; })[0] : null, h = hash(p.a.id);
  if (d){ var a = (h % 628) / 100, r = (w.bs || 1) * 1.6; return [d.x + Math.cos(a) * r, d.y + 1.4 * (w.bs || 1) + Math.abs(Math.sin(a)) * r * 0.5]; }
  var a2 = (h % 628) / 100, r2 = w.r * (0.52 + ((h >> 9) % 10) / 100); return [w.x + Math.cos(a2) * r2, w.y + Math.sin(a2) * r2 * 0.86]; }
function route(from, to){ if (from === to) return [];
  var prev = {}, q = [from], seen = {}; seen[from.id] = 1;
  while (q.length){ var g = q.shift(); if (g === to) break; g.links.forEach(function(n){ if (!seen[n.id]){ seen[n.id] = 1; prev[n.id] = g; q.push(n); } }); }
  var path = [], c = to; while (c && c !== from){ var pv = prev[c.id]; if (!pv) return [];
    var br = S.bridges.filter(function(b){ return (b.a === pv && b.b === c) || (b.a === c && b.b === pv); })[0];
    if (br){ var fw = br.a === pv; path.unshift(fw ? [br.ax, br.ay] : [br.bx, br.by], fw ? [br.bx, br.by] : [br.ax, br.ay], [c.x + (c.r * 0.5) * (fw ? -br.ux : br.ux), c.y + (c.r * 0.5) * (fw ? -br.uy : br.uy)]); }
    c = pv; }
  return path; }
// the ground under a walker: its island, or the deck of the bridge it is on
function zAt(x, y, sc){ var list = sc.list, best = null, bv = -1;
  for (var i = 0; i < list.length; i++){ var g = list[i], v = S.shape(g, x, y); if (v > bv){ bv = v; best = g; } }
  if (best && bv > -0.3) return S.topAt(best, x, y);
  for (var j = 0; j < (sc.bridges || []).length; j++){ var b = sc.bridges[j], L = Math.hypot(b.bx - b.ax, b.by - b.ay), u = ((x - b.ax) * b.ux + (y - b.ay) * b.uy) / L;
    if (u > -0.05 && u < 1.05){ var za = S.topAt(b.a, b.ax, b.ay), zb = S.topAt(b.b, b.bx, b.by), uu = Math.max(0, Math.min(1, u)); return za + (zb - za) * uu - Math.sin(uu * Math.PI) * (b.kind === 'stone' ? 0.1 : 0.35) - 0.05; } }
  return 0; }

// ---- the people: placed when the agents arrive, and placed again when the scene changes
function build(){ var list = (data.agents || []).concat(data.builders || []), old = {}; people.forEach(function(p){ old[p.a.id] = p; });
  people = list.map(function(a){ var p = old[a.id] || { x:S.hub.x, y:S.hub.y + 1, wp:[], f:0, face:1, ph:(hash(a.id) % 1000) / 100, next:0 }; p.a = a; p.L = look(a);
    p.g = gameById((a.at && a.at.game) || a.home); return p; });
  place(true); }
var placedFor = null;
function place(walk){ var sc = S.cur; placedFor = sc;
  people.forEach(function(p){ var home = spot(p, p.g, sc);
    if (sc.world){ p.here = sc.g === p.g || sc.g.id === p.g.id; p.x = home[0]; p.y = home[1]; p.wp = []; return; }
    p.here = true;
    if (walk && !p.placed){ p.x = S.hub.x + Math.cos(p.ph) * 2.2; p.y = S.hub.y + 2.5 + Math.sin(p.ph) * 1.2; p.wp = route(S.hub, p.g).concat([home]); p.placed = true; }
    else if (!p.placed || walk){ p.x = home[0]; p.y = home[1]; p.wp = []; p.placed = true; } });
  S.wake(); }
var lastT = 0;
function tick(now){ var dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now; var moving = false;
  people.forEach(function(p){ if (!p.here || !p.wp.length) return; var w = p.wp[0], dx = w[0] - p.x, dy = w[1] - p.y, d = Math.hypot(dx, dy), sp = (p.wp.length > 1 ? 4.2 : 1.6) * dt;
    if (d < sp){ p.x = w[0]; p.y = w[1]; p.wp.shift(); } else { p.x += dx / d * sp; p.y += dy / d * sp; p.f += dt * 7; if (Math.abs(dx) > 0.05) p.face = dx > 0 ? 1 : -1; }
    moving = true; });
  return moving; }
// now and then somebody at work takes a few steps round its spot
setInterval(function(){ if (!people.length || document.hidden || S.moving()) return; var sc = S.cur;
  people.forEach(function(p){ if (!p.here || p.wp.length || !busy(p) || Math.random() > 0.35) return; var home = spot(p, p.g, sc), a = Math.random() * 6.28, r = sc.world ? 1.4 : 0.8;
    p.wp = [[home[0] + Math.cos(a) * r, home[1] + Math.sin(a) * r * 0.7]]; });
  S.wake(); }, 2600);

// ---- drawing, from world.js's overlay pass; true while anybody walks, so the loop keeps going
window.SKY_DRAW = function(o, now, sc){ if (!people.length || !S.R) return false;
  if (placedFor !== sc) place(false);
  var moving = tick(now), u = S.cam.k * (sc.world ? 1.6 : 1), sel = S.sel && S.sel.p, hov = S.hov && S.hov.p;
  people.filter(function(p){ return p.here; }).sort(function(a, b){ return a.y - b.y; }).forEach(function(p){
    var q = S.R.pr(p.x, p.y, zAt(p.x, p.y, sc)), s = S.toScreen(q[0], q[1]), fr = p.wp.length ? (p.f | 0) % 2 : 0, P = sprite(p.L, fr);
    if (s[0] < -40 * u || s[1] < -40 * u || s[0] > o.canvas.width + 40 * u || s[1] > o.canvas.height + 40 * u){ p.sx = null; return; }
    o.fillStyle = 'rgba(29,53,80,0.28)'; o.beginPath(); o.ellipse(s[0], s[1], 4 * u, 1.6 * u, 0, 0, 7); o.fill();
    for (var i = 0; i < P.length; i++){ var c = P[i], xx = p.face > 0 ? c[0] : 10 - c[0]; o.fillStyle = c[2]; o.fillRect(Math.round(s[0] + (xx - 5.5) * u), Math.round(s[1] + (c[1] - 14) * u), Math.ceil(u), Math.ceil(u)); }
    if (p === sel || p === hov){ o.strokeStyle = p === sel ? '#ffd23f' : '#ffffff'; o.lineWidth = Math.max(2, u * 0.5); o.strokeRect(s[0] - 6.5 * u, s[1] - 16.5 * u, 13 * u, 17.5 * u); }
    // the state over its head: a dot, and "!" when it is waiting on you
    var st = state(p); o.fillStyle = '#1d3550'; o.fillRect(s[0] - 1.6 * u, s[1] - 19.2 * u, 3.2 * u, 3.2 * u); o.fillStyle = st[1]; o.fillRect(s[0] - u, s[1] - 18.6 * u, 2 * u, 2 * u);
    if (p.a.chat && (p.a.chat.state === 'blocked' || p.a.chat.state === 'review_ready')){ o.fillStyle = '#ffffff'; o.font = '900 ' + Math.round(7 * u) + 'px system-ui'; o.textAlign = 'center'; o.fillText('!', s[0] + 4.5 * u, s[1] - 16 * u); o.textAlign = 'left'; }
    p.sx = s[0] / DPR; p.sy = s[1] / DPR; p.su = u / DPR; });
  return moving; };
window.SKY_HIT = function(sx, sy){ var hit = null;
  people.forEach(function(p){ if (!p.here || p.sx == null) return; var u = p.su; if (sx > p.sx - 7 * u && sx < p.sx + 7 * u && sy > p.sy - 20 * u && sy < p.sy + 2 * u && (!hit || p.y > hit.p.y)) hit = { p:p }; });
  return hit; };

// ---- the hover card and the panel
function where(a){ var g = gameById(a.at && a.at.game), LN = SKY_UI.layerNames(); return g.name + (a.at && a.at.layer ? ' · ' + (LN[a.at.layer] || a.at.layer) : '') + (a.at && a.at.how === 'home' ? ' (its home)' : ''); }
window.SKY_HOVER_CARD = function(h){ var p = h.p, st = state(p), c = p.a.chat;
  return '<b>' + esc(p.a.name) + '</b><span style="color:' + st[1] + ';font-weight:800">' + st[0] + '</span>' + (c && busy(p) ? ' · ' + esc(ago(c.since)) : '') + '<br>' + esc(where(p.a)) +
    (c && c.summary ? '<br>' + esc(c.summary.slice(0, 90)) : '') + '<br><span class="sw-asof">Click for more</span>'; };
window.SKY_PANEL = function(h){ var p = h.p, a = p.a, st = state(p), c = a.chat, R0 = runs[a.id];
  var prs = a.prs.length ? a.prs.map(function(r){ var cl = { pass:['checks pass', '#e3f6e6', '#1e7a34'], fail:['checks failing', '#fde4e0', '#b8342a'], running:['checks running', '#fff3d6', '#9a6a00'], none:['no checks', '#eee', '#666'] }[r.checks];
    return '<div class="sw-row"><span class="k"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">#' + r.n + '</a> ' + esc(r.title) + '</span><span style="font-size:11px;font-weight:800;border-radius:6px;padding:1px 6px;background:' + cl[1] + ';color:' + cl[2] + '">' + cl[0] + '</span></div>'; }).join('') : '<div class="sw-asof">None open.</div>';
  var mine = tasks ? tasks.queued.concat(tasks.log).filter(function(t){ return t.agent === a.id; }).slice(0, 4) : [];
  setTimeout(function(){ bindTask(a); if (!R0 && !a.builder) fetchRuns(a); }, 0);
  return '<div class="sw-ph"><button class="sw-x" aria-label="Close">×</button><h2>' + esc(a.name) + '</h2><span class="sw-pill" style="background:' + st[1] + '">' + st[0] + '</span>' +
      (c && busy(p) ? ' <span class="sw-asof">for ' + esc(ago(c.since)) + '</span>' : '') + '</div>' +
    '<div class="sw-sec"><h3>Now</h3>' + (c ? esc(c.summary || c.title) : 'No chat in the last two weeks.') + '<br><span class="sw-asof">' + esc(where(a)) + ' · from its chat, as of ' + esc(data.asOf ? et(data.asOf) : 'never yet') + '</span></div>' +
    (a.builder ? '' : '<div class="sw-sec"><h3>Open pull requests</h3>' + prs + '<div class="sw-asof">GitHub as of ' + esc(et(data.fetchedAt)) + '</div></div>' +
      '<div class="sw-sec"><h3>Last runs</h3><div id="sw-runs">' + (R0 ? runsHtml(R0) : '<div class="sw-asof">Loading.</div>') + '</div><div class="sw-asof">From its log in the vault</div></div>') +
    (c ? '<div class="sw-sec"><a href="' + esc(c.link) + '" target="_blank" rel="noopener" style="font-weight:800;color:#2a6fd0">Open its chat ›</a></div>' : '') +
    (a.builder ? '' : taskBox(a, mine)); };
function runsHtml(r){ return r.length ? r.map(function(l){ return '<div class="sw-row"><span class="k">' + esc(l) + '</span></div>'; }).join('') : '<div class="sw-asof">No runs logged yet.</div>'; }
function fetchRuns(a){ fetch('/skyworld/api/agent?id=' + encodeURIComponent(a.id), { credentials:'same-origin' }).then(function(r){ return r.ok ? r.json() : { runs:[] }; })
  .then(function(d){ runs[a.id] = d.runs || []; var el = document.getElementById('sw-runs'); if (el) el.innerHTML = runsHtml(runs[a.id]); }).catch(function(){}); }

// ---- tasking: a box on an agent's panel, and on a district's or an island's panel in a world ("ask an agent")
var TSTATE = { queued:['Queued', '#d99a16'], delivered:['Delivered', '#2fa84a'], started:['New chat', '#2fa84a'], failed:['Failed', '#e5483a'] };
function taskList(list){ return list.length ? list.map(function(t){ var s = TSTATE[t.state] || TSTATE.queued;
  return '<div class="sw-row"><span class="k">' + esc(t.text.slice(0, 120)) + '<br><span class="sw-asof">' + esc(t.by || '') + ' · ' + esc(et(t.at)) + '</span></span><span style="font-size:11px;font-weight:800;color:' + s[1] + '">' + s[0] + '</span></div>'; }).join('') : ''; }
function taskBox(a, mine, picker){ return '<div class="sw-sec"><h3>' + (picker ? 'Ask an agent' : 'Give it a task') + '</h3>' + (picker || '') +
  '<textarea id="sw-task" rows="3" maxlength="4000" placeholder="What should ' + (picker ? 'it' : esc(a.name.replace(/ Agent$/, ''))) + ' do?" style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:inherit;font-size:14px;resize:vertical;margin-top:4px"></textarea>' +
  '<button id="sw-send" style="width:auto;margin:8px 0 0;height:36px;padding:0 16px;border:0;border-radius:10px;background:#2f6fd0;color:#fff;font:inherit;font-weight:800;cursor:pointer">Send</button>' +
  '<div id="sw-task-note" class="sw-asof" style="margin-top:6px">It reaches the agent\'s chat when the dispatcher next runs (every 15 minutes, 8am to midnight ET).</div>' +
  '<div id="sw-task-list">' + taskList(mine || []) + '</div></div>'; }
function bindTask(a, place){ var b = document.getElementById('sw-send'), t = document.getElementById('sw-task'), n = document.getElementById('sw-task-note'), pick = document.getElementById('sw-task-agent'); if (!b) return;
  b.onclick = function(){ var text = t.value.trim(), id = pick ? pick.value : a.id; if (text.length < 3){ n.textContent = 'Write a few words first.'; return; }
    var pl = place || (a.at ? { game:a.at.game, layer:a.at.layer } : {});
    b.disabled = true; n.textContent = 'Sending.';
    fetch('/skyworld/api/task', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ agent:id, text:text, game:pl.game, layer:pl.layer }) })
      .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, status:r.status, j:j }; }); })
      .then(function(x){ b.disabled = false;
        if (x.ok){ t.value = ''; n.textContent = 'Queued. It reaches the chat on the dispatcher\'s next run.'; loadTasks(); return; }
        n.textContent = x.j && x.j.error === 'tasking_off' ? 'Tasking is not connected yet: the vault token is missing.' : 'That did not send. Try again.'; })
      .catch(function(){ b.disabled = false; n.textContent = 'That did not send. Try again.'; }); }; }
// a district or island panel in a world gets a box to ask one of the agents
window.SKY_PANEL_EXTRA = function(h){ if (!data || !h || !h.g || !h.g.world) return null;
  var g = S.cur.g, ids = (data.agents || []).slice().sort(function(x, y){ var hx = (x.at && x.at.game === g.id) || x.home === g.id, hy = (y.at && y.at.game === g.id) || y.home === g.id; return (hy - hx) || x.name.localeCompare(y.name); });
  var pick = '<select id="sw-task-agent" style="width:100%;height:36px;border:1px solid var(--line);border-radius:10px;padding:0 8px;font:inherit;background:#fff">' + ids.map(function(a){ return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('') + '</select>';
  return { html:taskBox(null, [], pick), bind:function(){ bindTask(null, { game:g.id, layer:h.d ? h.d.id : null }); } }; };
function loadTasks(){ fetch('/skyworld/api/tasks', { credentials:'same-origin' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){ if (d) tasks = d;
  var el = document.getElementById('sw-task-list'), sel = S.sel && S.sel.p; if (el && sel && tasks) el.innerHTML = taskList(tasks.queued.concat(tasks.log).filter(function(t){ return t.agent === sel.a.id; }).slice(0, 4)); }).catch(function(){}); }

// ---- the data, now and every three minutes
function load(){ return fetch('/skyworld/api/agents', { credentials:'same-origin' }).then(function(r){ if (!r.ok) throw 0; return r.json(); })
  .then(function(d){ var first = !data; data = d; build(); if (first) loadTasks(); }).catch(function(){}); }
function start(){ load(); setInterval(function(){ if (!document.hidden) { load(); loadTasks(); } }, 180000); }
if (window.SKY) start(); else window.addEventListener('sky-ready', start, { once:true });
})();
