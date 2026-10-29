/* golf/putt/gymkinds/example.js: THE WORKED EXAMPLE KIND (RTT_GYMKIND_EXAMPLE). Test only: its one gym is in no world
   (world:null, test:true) and golf/index.html does not load this file, so no player ever meets it. check-putt solves
   it, replays its proof and audits it like any other gym, and its page section loads this file into the real page and
   plays it in a real room by tapping. Copy it to start a new kind (gyms.js has the KINDS README).

   THE PUZZLE: three lamps in a row. A tap on a lamp flips it and the lamps either side of it. Light all three and the
   vault opens. A tap kind: the golfer stands where he came in, and the state is only the lamps. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var GYMS = [
  { id:'example1', kind:'example', world:null, test:true, leg:0, name:'The Lamp Room', badge:'Lamp Badge', pay:0, look:{ wall:'stone' },
    moves:2, proof:'16,18',
    who:{ look:{ skin:'light', polo:'green', hat:'white', pants:'navy', hair:'brown', hairStyle:'short', cap:false, gender:'male' } },
    say:['Those lamps are wired together. Funny how one switch is never just one switch.',
      'The middle one touches all three. The ends only touch two.',
      'Try the two ends and see what the middle does.'],
    // a lamp is 'a' (dark) or 'A' (lit) at the start; lamps are counted left to right along the room
    rows:[
      '#######',
      '#..C..#',
      '#.aAa.#',
      '#.....#',
      '#L.@..#',
      '###G###'
    ] }
];
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
/* THE ROOM: the frame's five characters through lib.room, and this kind's own: the lamps. Q.lamps is their tiles,
   Q.lit0 the mask lit at the start (bit k is lamp k). */
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var lamps = [], lit = 0;
  var Q = LIB().room(G, function(ch, i){ if (ch !== 'a' && ch !== 'A') return false; if (ch === 'A') lit |= 1 << lamps.length; lamps.push(i); });
  Q.lamps = lamps; Q.lit0 = lit; return PARSED[G.id] = Q; }
// the state is the lamps as a bit mask, a plain number: a new number a move, never one changed in place
function init(G){ return { m:parse(G).lit0 }; }
function key(s){ return '' + s.m; }
// a tap on a lamp flips it and its neighbours along the row; a tap anywhere else does nothing
function act(G, s, i){ var Q = parse(G), k = Q.lamps.indexOf(i); if (k < 0) return { s:s, ev:'bump', moves:[] };
  var m = s.m; for (var j = k - 1; j <= k + 1; j++) if (j >= 0 && j < Q.lamps.length) m ^= 1 << j;
  return { s:{ m:m }, ev:'flip', moves:[['lamp', i, i, 'flip']] }; }
function moves(G){ return parse(G).lamps.slice(); }
function won(G, s){ return s.m === (1 << parse(G).lamps.length) - 1; }
// the recorded proof is the tapped tiles, comma separated
function proof(G){ return (G.proof || '').split(',').filter(Boolean).map(Number); }
function enc(path){ return path.join(','); }
// a lamp on its post: lit warm with a glow on the floor, or dark (the frame highlights the ones a tap changes)
function view(R){ var Q = R.Q, on = 0;
  function draw(t){ var x = t.x, y = t.y, lit = on & (1 << t.k), ctx = R.ctx, kk = R.kk(), p = R.scr(x, y, R.DECK + 1.1), b = R.scr(x, y, R.DECK);
    ctx.fillStyle = '#3a3a42'; ctx.fillRect(Math.round(b[0] - kk), Math.round(p[1]), Math.max(2, Math.round(kk * 2)), Math.round(b[1] - p[1]));
    if (lit){ ctx.fillStyle = 'rgba(255,214,90,0.28)'; ctx.beginPath(); ctx.ellipse(b[0], b[1], 7 * kk, 3 * kk, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = lit ? '#ffd65a' : '#2a2e3a'; ctx.strokeStyle = '#1a1a20'; ctx.lineWidth = Math.max(1, kk * 0.6);
    ctx.beginPath(); ctx.arc(p[0], p[1], 3.2 * kk, 0, 7); ctx.fill(); ctx.stroke(); }
  return {
    lay:function(s){ on = s.m; },
    move:function(){},
    things:function(ds){ Q.lamps.forEach(function(i, k){ var q = R.at(i); ds.push({ x:q[0], y:q[1], k:k, kd:draw }); }); },
    ground:function(){} }; }

root.RTT_GYMKIND_EXAMPLE = { id:'example', gyms:GYMS, input:'tap', parse:parse, init:init, key:key, act:act, moves:moves, won:won, proof:proof, enc:enc,
  goal:function(){ return 'Light every lamp.'; }, hello:'Tap a lamp to flip it. Undo takes one back.', unit:'tap', view:view };
})();
