#!/usr/bin/env node
/* Records a gameplay clip for a social post: a phone-shaped screen, a real play-through, the taps
   visible. Video first is the owner's call (2026-10-15): the game sells itself.

   node scripts/marketing/record.mjs football                 run shots/football.mjs
   node scripts/marketing/record.mjs football --out marketing/clips/2026-10-16-football.mp4
   node scripts/marketing/record.mjs football --keep          also keep the raw frames, to look at

   A SHOT is a module in scripts/marketing/shots/ that plays one moment of one game:

     export const page = '/football/';               the page to open, served from this repo
     export async function setup(page, t) {}         before the camera rolls (dismiss a card, sign in)
     export async function play(page, t) {}          what the clip shows
     export const seconds = 20;                      optional: the most it may run

   `t` holds the helpers: t.tap(locator or selector) moves a visible finger there and taps it,
   t.hold(ms) pauses on screen, t.until(fn, ms) waits for something on the page.

   The page is served from disk, the way the site's own browser checks do it, so a clip shows the
   code in this checkout and nothing on the network. That also means no real account, no real
   player and no real data appears on camera: the clip is a stranger playing as a guest.

   The output is H.264 1080x1920 at 30 fps with a silent audio track, which X, Instagram Reels and
   Facebook all take. publish.mjs --check reads the result and refuses anything they would not.

   Needs Playwright (npm install --no-save playwright, or the sandbox's global copy) and ffmpeg. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const name = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');
if (!name) { console.error('usage: node scripts/marketing/record.mjs <shot> [--out marketing/clips/x.mp4] [--keep]'); process.exit(2); }
const shotFile = path.join(ROOT, 'scripts/marketing/shots', `${name}.mjs`);
if (!fs.existsSync(shotFile)) {
  const have = fs.readdirSync(path.dirname(shotFile)).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
  console.error(`no shot "${name}". Shots: ${have.join(', ')}`); process.exit(2);
}
const shot = await import(pathToFileURL(shotFile).href);
const day = new Date().toISOString().slice(0, 10);
const out = path.resolve(ROOT, opt('--out', `marketing/clips/${day}-${name}.mp4`));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// A phone: 432x768 CSS pixels at 2.5x is exactly 1080x1920, so frames need no scaling.
const VIEW = { width: 432, height: 768 }, DPR = 2.5, W = 1080, H = 1920;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.txt': 'text/plain' };

/* The finger. A soft ring where a tap lands, drawn by the page itself so it is in every frame. */
const FINGER = `(() => {
  const ring = (x, y) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:' + (x - 22) + 'px;top:' + (y - 22) + 'px;width:44px;height:44px;'
      + 'border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.9);'
      + 'box-shadow:0 0 0 2px rgba(0,0,0,.25);pointer-events:none;z-index:2147483647;'
      + 'transition:transform .45s ease-out,opacity .45s ease-out;transform:scale(.6);opacity:1';
    (document.body || document.documentElement).appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = 'scale(1.3)'; d.style.opacity = '0'; }));
    setTimeout(() => d.remove(), 600);
  };
  window.addEventListener('pointerdown', (e) => ring(e.clientX, e.clientY), true);
})();`;

let pw;
try { pw = await import('playwright'); } catch {
  console.error('Playwright is not installed. Run: npm install --no-save playwright'); process.exit(2);
}
// Without the flag Chrome's screencast sends CSS pixels (432x768) whatever the page's scale factor.
const browser = await pw.chromium.launch({ args: [`--force-device-scale-factor=${DPR}`], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await context.addInitScript(FINGER);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  // Nothing leaves the machine: no payment, no account, no analytics on a recording.
  if (u.hostname !== 'local.test') return r.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
  await r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const t = {
  hold: (ms) => page.waitForTimeout(ms),
  async until(fn, ms = 15000, arg) { await page.waitForFunction(fn, arg, { timeout: ms }); },
  /* A tap the viewer can follow: a beat to see where it goes, the tap, a beat to see what it did. */
  async tap(target, { before = 250, after = 450 } = {}) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    // To the middle of the screen, not just into it: a sticky header can cover the top edge.
    await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(350);
    const box = await loc.boundingBox();
    if (!box) throw new Error(`nothing on screen to tap: ${target}`);
    await page.waitForTimeout(before);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    // page.mouse fires the pointer events the finger listens for; touchscreen.tap does not.
    await page.mouse.click(x, y);
    await page.waitForTimeout(after);
  },
};

await page.goto(`http://local.test${shot.page}`, { waitUntil: 'domcontentloaded' });
if (shot.setup) await shot.setup(page, t);

/* The camera. Chrome's screencast sends a frame only when the screen changes, each stamped with
   its time, so a still moment costs nothing and the timing is the page's own. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), `clip-${name}-`));
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', async (f) => {
  const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
  fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
  frames.push({ file, at: f.metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const started = Date.now() / 1000;
const limit = (shot.seconds || 60) * 1000;
let failed;
await Promise.race([
  shot.play(page, t).catch((e) => { failed = e; }),
  sleep(limit).then(() => console.log(`stopped at the shot's ${limit / 1000}s limit`)),
]);
await page.waitForTimeout(400);
const stopped = Date.now() / 1000;
await cdp.send('Page.stopScreencast');
await browser.close();
if (failed) { console.error(`the shot failed: ${failed.message}`); process.exit(1); }
if (frames.length < 2) { console.error('the screen never changed, so there is nothing to cut'); process.exit(1); }

/* Each frame is held until the next one arrived, the last until the camera stopped. The first frame
   starts the clip, so the setup never shows. */
const list = [];
for (let i = 0; i < frames.length; i++) {
  const next = i + 1 < frames.length ? frames[i + 1].at : stopped;
  list.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, next - frames[i].at).toFixed(4)}`);
}
list.push(`file '${frames[frames.length - 1].file}'`);
fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n') + '\n');
fs.mkdirSync(path.dirname(out), { recursive: true });
const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error',
  '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
  '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`,
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '21', '-r', '30',
  '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (ff.status !== 0) { console.error(`ffmpeg failed (${ff.error ? ff.error.message : 'exit ' + ff.status})`); process.exit(1); }
if (!args.includes('--keep')) fs.rmSync(dir, { recursive: true, force: true });
else console.log(`raw frames kept in ${dir}`);

const size = fs.statSync(out).size / 1048576;
console.log(`${path.relative(ROOT, out)}: ${(stopped - started).toFixed(1)}s, ${frames.length} frames, ${size.toFixed(1)} MB`);
if (errors.length) console.log(`the page threw ${errors.length} error(s) while recording; watch the clip before using it:\n  ${errors.slice(0, 5).join('\n  ')}`);
