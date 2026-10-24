/* What each status looks like, in one place: its name in the chrome, its colour, the dot on its sign, how built
   its island looks, and where it sits in the outer ring. The status itself comes from the server (discover.js).
   ui.js reads the labels and colours; layout.js the building and the ring; world.js the dots. */
(function(){
var S = window.SKY_W;
// legend: the short name in the legend; null keeps it out. rank: order round the outer ring (the live and the hubs are in the middle)
S.STATUS = {
  hub:      { label:'Always on',      legend:null,             col:'var(--ink)',  dot:'#ffffff', built:1,    rank:0 },
  live:     { label:'Live',           legend:'Live',           col:'var(--live)', dot:'#5fd06a', built:1,    rank:0 },
  unlisted: { label:'Unlisted',       legend:'Unlisted',       col:'var(--unl)',  dot:'#7fd8ff', built:0.9,  rank:1 },
  testers:  { label:'Testers only',   legend:'Testers',        col:'var(--test)', dot:'#ffc94a', built:0.75, rank:0 },
  dev:      { label:'In development', legend:'In development', col:'var(--dev)',  dot:'#c8a8ff', built:0.5,  rank:2 }
};
// an unknown status (a new rule on the server) reads as still being built
S.status = function(g){ return S.STATUS[g.status] || S.STATUS.dev; };
// the two hubs are places, not games: they are called by what they are
S.statusLabel = function(g){ return g.status === 'hub' ? (g.id === 'site' ? 'Home' : 'Studio') : S.status(g).label; };
})();
