/* Shut The Door: the two game screens the share image shows, shot from the real game.
 *
 *   node shut-the-door/brand/og-shots.mjs      (then node shut-the-door/brand/og.mjs)
 *
 * Serves the repo, opens the game at 1440x900 (desktop) and 390x844 (phone), takes the mound and
 * shoots the screen as a player sees it: the 3D mound, the scorebar, the pitch picker.
 *
 * The spot is PACK (Rivera, Twins at Yankees, September 19, 2011, top of the 9th). The page plays
 * the day's daily, so the clock is moved to the first day from 2027-01-01 whose default daily is
 * that pack (modes.js defaultPack): a spot far from the dailies around a release, so the image
 * never shows the next few days. Software GL here, so each shot takes a few minutes.
 * Writes brand/og-screen-desktop.jpg and brand/og-screen-phone.jpg.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const ROOT = path.join(GAME, '..');
const PACK = 'std-2011-rivera-min';
const pw = (() => {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
})();
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

const M = require(path.join(GAME, 'modes.js'));
const SCH = JSON.parse(fs.readFileSync(path.join(GAME, 'data/schedule.json'), 'utf8'));
if (!SCH.packs[PACK]) throw new Error(PACK + ' is not in data/schedule.json');
let DAY = null;
for (let i = 0; i < 1500 && !DAY; i++) { const d = M.addDays('2027-01-01', i); if (M.defaultPack(SCH, d) === PACK) DAY = d; }
if (!DAY) throw new Error('no day from 2027-01-01 plays ' + PACK + ' by default');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/shut-the-door/';
const at = new Date(DAY + 'T18:00:00Z').getTime();   // midday Eastern on DAY

const browser = await pw.chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function shoot(w, h, out) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());   // no server, no ads: the page plays the default daily
  await ctx.addInitScript(`(() => { const off = ${at} - Date.now(); const RD = Date;
    class D extends RD { constructor(...a) { if (a.length === 0) super(RD.now() + off); else super(...a); } static now() { return RD.now() + off; } }
    window.Date = D; })()`);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.click('#b-take', { timeout: 300000 });
  await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 300000 });
  const pitcher = await page.evaluate(() => (document.querySelector('#s-mound') || document.body).textContent);
  if (!/Mariano Rivera/.test(pitcher)) throw new Error('the mound is not ' + PACK + ' (' + DAY + ')');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(HERE, out), type: 'jpeg', quality: 90, timeout: 120000 });
  await ctx.close();
  console.log('  ' + out + ' (' + w + 'x' + h + ', ' + PACK + ' on ' + DAY + ')');
}
try {
  await shoot(1440, 900, 'og-screen-desktop.jpg');
  await shoot(390, 844, 'og-screen-phone.jpg');
} finally {
  await browser.close();
  server.close();
}
