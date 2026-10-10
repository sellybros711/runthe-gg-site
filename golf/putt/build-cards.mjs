/* golf/putt/build-cards.mjs: the home card's picture for each world, cut from the game's own render.

   node golf/putt/build-cards.mjs

   It opens the real page, plays each world's signature hole, takes the still picture hole3d.js drew
   (the land and the course, no ball and no golfer), and keeps the top band, where the world's landmark
   stands. So the card is the same pixel art as the courses, not a second drawing of them.
   Re-run after changing land.js or a signature hole, and bump the ?v= in puttCard. */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'golf/putt/cards');
const T = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.css':'text/css', '.svg':'image/svg+xml' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e){ r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type':T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
await new Promise(res => srv.listen(0, res));
const b = await chromium.launch(), pg = await b.newPage({ viewport:{ width:1280, height:760 } });
await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await pg.goto('http://127.0.0.1:' + srv.address().port + '/golf/');
await pg.waitForFunction(() => window.RTT_PUTT && window.RTT_PUTT_3D);
await pg.evaluate(() => { sbUser = { id:'build' }; puttOn = () => true; openPutt(); });
const ASPECT = 2.4;   // the card is about 2.4 wide to 1 tall on a phone; it is cut to fit by object-fit
for (const [theme, n] of [['clubhouse', 18], ['temple', 36], ['pirate', 54], ['canyon', 72], ['volcano', 90], ['frozen', 108], ['sky', 126], ['neon', 144]]) {
  await pg.evaluate((n) => window.RTT_PUTT._level(n), n);
  await pg.waitForFunction(() => { const P = window.RTT_PUTT._state().play; return P && P.v3 && P.v3.cv; }, null, { timeout:120000 });
  const url = await pg.evaluate((A) => { const c = window.RTT_PUTT._state().play.v3.cv, h = Math.round(c.width / A), o = document.createElement('canvas');
    o.width = c.width; o.height = h; o.getContext('2d').drawImage(c, 0, 0, c.width, h, 0, 0, c.width, h); return o.toDataURL('image/png'); }, ASPECT);
  fs.writeFileSync(path.join(OUT, theme + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log(theme, 'from hole', n);
}
await b.close(); srv.close();
