/* The Sky World's browser modules are classic scripts that share one namespace, window.SKY_W. This one comes
   first and makes it. boot.js loads them in the order build/pages.mjs lists them (MODULE_FILES):
   noise, landmarks, ui, status, layout, land, props, paint, camera, input, world, then ideas.

   The noise everything is drawn with: the one hash (landmarks.js uses it too, so a landmark and the ground
   under it agree), value noise and fractal noise over it. */
(function(){
var S = window.SKY_W = {};
S.h3 = function(x, y, s){ var n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
S.vn = function(x, y, s){ var h3 = S.h3, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  var a = h3(xi, yi, s), b = h3(xi + 1, yi, s), c = h3(xi, yi + 1, s), d = h3(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
S.fbm = function(x, y, s){ var vn = S.vn; return vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 9) * 0.3 + vn(x * 4.3, y * 4.3, s + 19) * 0.15; };
// a material's blotches, read off the renderer's cell (its tile coordinates)
S.blot = function(c, f, s){ return S.vn(c.ti * f, c.tj * f, s); };
})();
