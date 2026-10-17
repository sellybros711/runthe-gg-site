/* Loads the world once the server has said yes: the world's data, then the Putt Putt renderer at the
 * versions Golf ships today (read by the server from golf/index.html), then the world's own modules. */
(function(){
  function script(src){ return new Promise(function(ok, no){ var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.body.appendChild(s); }); }
  fetch('/skyworld/api/world', { credentials:'same-origin' }).then(function(r){ if (!r.ok) throw new Error('world ' + r.status); return r.json(); }).then(function(W){
    window.SKY_WORLD = W; var v = W.art || {};
    var px = document.createElement('script'); px.type = 'module';
    px.textContent = "import P from '/setlist/pxhd.js?v=" + (v.pxhd || '2') + "'; window.PXHD = P; window.dispatchEvent(new Event('sky-pxhd'));";
    return new Promise(function(ok){ window.addEventListener('sky-pxhd', ok, { once:true }); document.body.appendChild(px); setTimeout(ok, 8000); })
      .then(function(){ return script('/golf/putt/putt.js?v=' + (v.putt || '')); })
      .then(function(){ return script('/golf/putt/land.js?v=' + (v.land || '')); })
      .then(function(){ return script('/golf/putt/hole3d.js?v=' + (v.hole3d || '')); })
      .catch(function(){ /* the world falls back to a flat map */ })
      .then(function(){ return script('/skyworld/m/landmarks.js'); })
      .then(function(){ return script('/skyworld/m/ui.js'); })
      .then(function(){ return script('/skyworld/m/world.js'); });
  }).catch(function(){ var c = document.getElementById('wait'); if (c) c.innerHTML = '<h1>Could not load</h1><p>Reload to try again.</p>'; });
})();
