/* Shut The Door: the share image, og.png (1200x630), what a chat app draws for a shared link.
 *
 *   node shut-the-door/brand/og-shots.mjs     (only when the game's look changes: the two screens)
 *   node shut-the-door/brand/og.mjs           (the image, from the screens and the brand)
 *
 * The owner's pick (2026-11-21, "E2"): PITCH THE 9TH. GET THE SAVE. in Anton over the real game in a
 * browser window, with the same spot on a phone over its lower corner, so a fan sees it plays on
 * both. Pills either side, then PLAY NOW AT RUNTHE.GG as the call to action.
 *
 * Where things sit, and why:
 *   - the headline is centred and inside the middle 560 px, so the square crop (iMessage and
 *     Discord thumbnails, Reddit, WhatsApp) keeps it whole;
 *   - the call to action is centred above the foot bar and inside the 2:1 crop X draws (y 15-615),
 *     clear of the domain label X lays over the bottom left corner;
 *   - the pills stay off the window and the phone.
 * The build fails if any of that stops being true.
 *
 * The page's og:description and twitter:description name how many real spots there are. That is
 * static text, so this reads the count from data/schedule.json and fails if the page says another
 * number. The page names this file in og:image, twitter:image and the JSON-LD image; bump their
 * ?v= when it changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const pw = (() => {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
})();
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const b64 = (f, type) => 'data:' + type + ';base64,' + fs.readFileSync(path.join(GAME, f)).toString('base64');

/* the count the page's description claims, held to the data */
const N = Object.keys(JSON.parse(fs.readFileSync(path.join(GAME, 'data/schedule.json'), 'utf8')).packs).length;
const page = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
for (const tag of ['property="og:description"', 'name="twitter:description"']) {
  const m = new RegExp('<meta ' + tag + ' content="([^"]*)"').exec(page);
  const said = m && /^(\d+) real save situations/.exec(m[1]);
  if (said && +said[1] !== N) throw new Error(`index.html ${tag} says ${said[1]} real save situations; data/schedule.json has ${N} packs`);
}

const WW = 470, SH = Math.round(WW * 900 / 1440), BAR = 24;   // the window: the 1440x900 screen under a title bar
const WX = 600 - WW / 2 - 46, WY = 182;
const PW = 104, PH = Math.round(PW * 844 / 390);              // the phone's screen
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: AN; src: url(${b64('brand/fonts/Anton-Regular.ttf', 'font/ttf')}) format('truetype'); font-weight: 400; }
  @font-face { font-family: IN; src: url(${b64('test/fonts/inter-latin.woff2', 'font/woff2')}) format('woff2'); font-weight: 100 900; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0b0f17; }
  * { box-sizing: border-box; }
  .bg { position: absolute; inset: 0; background: radial-gradient(42% 60% at 50% 60%, rgba(255, 79, 31, .3), rgba(11, 15, 23, 0) 72%), linear-gradient(180deg, #0e1420, #0b0f17); }
  .crest { position: absolute; left: 36px; top: 24px; height: 116px; filter: drop-shadow(0 6px 18px rgba(0, 0, 0, .55)); }
  h1 { position: absolute; left: 0; right: 0; top: 16px; margin: 0; font: 400 76px/.95 AN, sans-serif; text-transform: uppercase; letter-spacing: .5px; text-align: center; color: #fff; }
  h1 span { display: block; white-space: nowrap; } h1 .o { color: #ff4f1f; margin-top: 4px; }
  .win { position: absolute; left: ${WX}px; top: ${WY}px; width: ${WW}px; border-radius: 12px; overflow: hidden; background: #1b2231; box-shadow: 0 0 0 1.5px #2f3747, 0 30px 70px rgba(0, 0, 0, .65); }
  .bar { height: ${BAR}px; display: flex; align-items: center; gap: 7px; padding: 0 12px; }
  .bar i { width: 10px; height: 10px; border-radius: 50%; background: #3a4354; }
  .bar b { margin-left: 14px; flex: 1; height: 14px; border-radius: 7px; background: #11161f; }
  .win img { display: block; width: ${WW}px; height: ${SH}px; }
  .ph { position: absolute; left: ${WX + WW - 52}px; top: ${WY + BAR + SH - PH + 18}px; border-radius: 22px; background: #05070b; padding: 5px; box-shadow: 0 0 0 1.5px #2f3747, 0 20px 50px rgba(0, 0, 0, .7); }
  .ph img { display: block; width: ${PW}px; height: ${PH}px; border-radius: 17px; }
  .side { position: absolute; top: 236px; display: flex; flex-direction: column; gap: 12px; }
  .side.l { right: ${1200 - WX + 22}px; align-items: flex-end; } .side.r { left: ${WX + WW + PW - 52 + 10 + 22}px; align-items: flex-start; }
  .pill { font: 800 19px/1 IN, sans-serif; color: #fff; letter-spacing: .8px; text-transform: uppercase; padding: 13px 16px; border-radius: 999px; background: rgba(255, 255, 255, .08); border: 2px solid rgba(255, 255, 255, .2); white-space: nowrap; }
  .pill.hot { background: #ff4f1f; border-color: #ff4f1f; }
  .cta { position: absolute; left: 0; right: 0; top: 534px; text-align: center; }
  .cta span { display: inline-block; font: 400 44px/1 AN, sans-serif; letter-spacing: 1px; text-transform: uppercase; color: #fff; background: #ff4f1f; padding: 10px 30px 12px; border-radius: 999px; box-shadow: 0 10px 30px rgba(255, 79, 31, .35); }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; height: 12px; background: #ff4f1f; }
</style></head><body><div class="bg"></div><img class="crest" src="${b64('brand/lockup-dark.svg', 'image/svg+xml')}" alt="">
<h1><span>Pitch the 9th.</span><span class="o">Get the save.</span></h1>
<div class="win"><div class="bar"><i></i><i></i><i></i><b></b></div><img src="${b64('brand/og-screen-desktop.jpg', 'image/jpeg')}" alt=""></div>
<div class="ph"><img src="${b64('brand/og-screen-phone.jpg', 'image/jpeg')}" alt=""></div>
<div class="side l"><span class="pill hot">Phone or desktop</span><span class="pill">New spot daily</span><span class="pill">Survivor mode</span></div>
<div class="side r"><span class="pill">Leaderboards</span><span class="pill">Free in your browser</span></div>
<div class="cta"><span>Play now at RunThe.gg</span></div><div class="foot"></div></body></html>`;

const browser = await pw.chromium.launch(CHROME ? { executablePath: CHROME } : {});
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await tab.setContent(html);
await tab.evaluate(() => document.fonts.ready);
await tab.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
const box = await tab.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  const text = (el) => { const g = document.createRange(); g.selectNodeContents(el); return r(g); };
  return {
    head: [...document.querySelectorAll('h1 span')].map(text),
    cta: r(document.querySelector('.cta span')),
    pills: [...document.querySelectorAll('.pill')].map((p) => ({ t: p.textContent, ...r(p) })),
    dev: [r(document.querySelector('.win')), r(document.querySelector('.ph'))],
    fonts: [...document.fonts].map((f) => f.family + ':' + f.status),
  };
});
const bad = [];
for (const h of box.head) if (h.l < 320 || h.r > 880) bad.push(`a headline line leaves the middle 560 px (${Math.round(h.l)}-${Math.round(h.r)})`);
if (box.cta.l < 240 || box.cta.r > 960 || box.cta.t < 15 || box.cta.b > 615) bad.push('the call to action leaves the 2:1 crop or the clear centre');
for (const p of box.pills) {
  if (p.l < 0 || p.r > 1200) bad.push(`the pill ${p.t} leaves the frame`);
  if (box.dev.some((d) => p.l < d.r && p.r > d.l && p.t < d.b && p.b > d.t)) bad.push(`the pill ${p.t} sits on a device`);
}
if (box.fonts.some((f) => !/:loaded$/.test(f))) bad.push('a font did not load: ' + box.fonts.join(', '));
if (bad.length) { await browser.close(); throw new Error('og.png layout:\n  ' + bad.join('\n  ')); }
await tab.screenshot({ path: path.join(GAME, 'og.png') });
await browser.close();
console.log(`  og.png (1200x630); the page's description may claim ${N} real save situations`);
