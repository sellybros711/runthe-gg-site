/* The Sky World. Two places, both painted by Putt Putt's own renderer (golf/putt/hole3d.js, loaded read only at the
   versions Golf ships) from land these modules build:

   THE MAP: RunThe.GG in the middle, the live games and Marketing round it on stone bridges, and every game not yet
   live out on the edge, still being built, on bridges still being built.
   A WORLD: click an island and you go into it, full screen and at full size: its landmark, a district for every
   layer of the game, and (stage c) the agents working there.

   This module lays them out: where every island is, its bridges and its districts, and the scenes (the map, and
   one per world) the rest paint and show. The shape of everything comes from the server
   (functions/_skyworld/discover.js); nothing here lists a game. */
(function(){
var S = window.SKY_W, h3 = S.h3;
var W = S.W = window.SKY_WORLD;
S.ART = 1 / 8; S.ELEV = 42; S.se = Math.sin(S.ELEV * Math.PI / 180); S.ce = Math.cos(S.ELEV * Math.PI / 180);
S.RENDER_V = 4;   // bump when the land, the landmarks or the layout change, so cached pictures are painted again

// an island's own seed for its wobble, its ground and its trees: from its id, so a new game in the list moves nobody
// else's island and an old picture in IndexedDB still matches what would be painted. Kept small: h3 feeds it to sin().
function seedOf(id){ var h = 2166136261; for (var i = 0; i < id.length; i++){ h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 997; }

// ---- the islands. How built each one looks follows its status: a live game is finished, the rest are still going up.
var ORDER = (W.layers || []).map(function(l){ return l.id; });
var games = S.games = W.games.map(function(g){ return Object.assign({}, g, { i:seedOf(String(g.id)), counts:g.layers, health:'none', built:S.status(g).built,
  layers:ORDER.filter(function(id){ return (g.layers || {})[id] > 0; }) }); });
var hub = S.hub = games.filter(function(g){ return g.id === 'site'; })[0] || games[0];
var inner = games.filter(function(g){ return g !== hub && (g.status === 'live' || g.status === 'hub'); }).sort(function(a, b){ return (a.status === 'hub') - (b.status === 'hub') || a.name.localeCompare(b.name); });
var outer = games.filter(function(g){ return g !== hub && inner.indexOf(g) < 0; }).sort(function(a, b){ return (S.status(a).rank - S.status(b).rank) || a.name.localeCompare(b.name); });
games.forEach(function(g){ var finished = g.built >= 1; g.s = g === hub ? 1.15 : finished ? 1 : 0.8; g.r = (g === hub ? 11.5 : finished ? 9.6 : 7.8) + g.layers.length * 0.22; });
// RunThe.GG in the middle, the finished ring round it, the ring still being built round that
var rIn = Math.max.apply(null, inner.map(function(g){ return g.r; }).concat([8])), rOut = Math.max.apply(null, outer.map(function(g){ return g.r; }).concat([7]));
var R1 = hub.r + rIn + 9, R2 = R1 + rIn + rOut + 11;
hub.x = 0; hub.y = 0; hub.z = 1.4;
inner.forEach(function(g, j){ var a = -Math.PI / 2 + j * Math.PI * 2 / inner.length; g.x = Math.cos(a) * R1 * 1.15; g.y = Math.sin(a) * R1 * 0.92; g.z = 0.8 + h3(g.i, 3, 1) * 0.6; g.ring = 1; });
outer.forEach(function(g, j){ var a = -Math.PI / 2 + (j + 0.5) * Math.PI * 2 / Math.max(1, outer.length); g.x = Math.cos(a) * R2 * 1.18; g.y = Math.sin(a) * R2 * 0.95; g.z = 1.8 + h3(g.i, 3, 1) * 1.0; g.ring = 2; });
// the outer ring moves apart until nothing touches; the middle stays put
for (var it = 0; it < 200; it++) outer.forEach(function(a){ games.forEach(function(b){ if (a === b) return; var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, need = a.r + b.r + 7;
  if (d < need){ var p = (need - d) / d; if (b.ring === 2){ p /= 2; b.x -= dx * p; b.y -= dy * p; } a.x += dx * p; a.y += dy * p; } }); });
// stone bridges from the middle to every finished island; a bridge being built from each unfinished one to its nearest neighbour inside
var bridges = inner.map(function(g){ return [hub, g, 'stone']; });
outer.forEach(function(g){ var best = null; [hub].concat(inner).forEach(function(b){ var d = Math.hypot(g.x - b.x, g.y - b.y) - g.r - b.r; if (!best || d < best[1]) best = [b, d]; }); bridges.push([best[0], g, 'build']); });
games.forEach(function(g){ g.links = []; }); bridges.forEach(function(b){ b[0].links.push(b[1]); b[1].links.push(b[0]); });
// where a bridge leaves one island's rim and meets the other's
function rims(p){ var a = p[0], b = p[1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  return { a:a, b:b, kind:p[2], ax:a.x + ux * (a.r - 1.2), ay:a.y + uy * (a.r - 1.2), bx:b.x - ux * (b.r - 1.2), by:b.y - uy * (b.r - 1.2), ux:ux, uy:uy }; }
bridges = S.bridges = bridges.map(rims);
// districts: wedges round the landmark, one per layer the game has
function districts(g, ring){ var n = g.layers.length; g.dist = g.layers.map(function(id, k){ var a = -Math.PI / 2 + (k + 0.5) / n * Math.PI * 2, rr = g.r * ring;
  return { id:id, a:a, x:g.x + Math.cos(a) * rr * 1.1, y:g.y + Math.sin(a) * rr * 0.9 }; }); }
games.forEach(function(g){ districts(g, 0.74); });
function bounds(list, mx, my){ var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(function(g){ x0 = Math.min(x0, g.x - g.r); y0 = Math.min(y0, g.y - g.r); x1 = Math.max(x1, g.x + g.r); y1 = Math.max(y1, g.y + g.r); });
  return [x0 - mx, y0 - my - 4, x1 + mx, y1 + my]; }

// a world: one game's island alone, at full size, its districts a neighbourhood each
function worldOf(g){ var w = Object.assign({}, g, { x:0, y:0, z:0.6, r:22 + g.layers.length * 0.8, s:(g.built >= 1 ? 2.9 : 2.5) * (g === hub ? 1.1 : 1), bs:1.9, world:true });
  districts(w, 0.72); return { list:[w], bridges:[], B:bounds([w], 16, 34), g:g, w:w }; }

// the scenes: the map, and each world as it is first asked for. paint.js keeps a scene's picture on it (sc.R, sc.P).
S.MAP = { id:'map', list:games, bridges:bridges, B:bounds(games, 26, 22), world:false };
var worlds = {};
S.sceneFor = function(g){ return worlds[g.id] || (worlds[g.id] = Object.assign(worldOf(g), { id:'w:' + g.id, world:true })); };
})();
