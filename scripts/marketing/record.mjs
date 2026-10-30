#!/usr/bin/env node
/* Records a gameplay clip for a social post: a phone-shaped screen, a real play-through, the taps
   visible. Video first is the owner's call (2026-10-15): the game sells itself.

   node scripts/marketing/record.mjs football                 run shots/football.mjs
   node scripts/marketing/record.mjs football --out marketing/clips/2026-10-16-football.mp4
   node scripts/marketing/record.mjs football --keep          also keep the raw frames, to look at
   node scripts/marketing/record.mjs football --speed 1.5     play it back faster (a long draft, a short clip)
   node scripts/marketing/record.mjs putt-ace --arg 60 --viewport 1440x900 --scale 1    a laptop's view of one thing

   A SHOT is a module in scripts/marketing/shots/ that plays one moment of one game:

     export const page = '/football/';               the page to open, served from this repo
     export async function setup(page, t) {}         before the camera rolls (dismiss a card, sign in)
     export async function play(page, t) {}          what the clip shows
     export const seconds = 20;                      optional: the most it may run
     export const hide = ['/baseball/board.js'];     optional: files served as missing (see below)
     export const init = 'window.x = 1';             optional: a script run before the page's own
     export const track = { budget: '#c-amt' };      optional: parts to follow, logged every frame (below)
     export const viewport = { width: 504, height: 896 };   optional: CSS pixels, 9:16 (432x768 default)

   `t` holds the helpers: t.tap(locator or selector) moves a visible finger there and taps it,
   t.hold(ms) pauses on screen, t.until(fn, ms) waits for something on the page. All three count
   the PAGE's time, not the machine's (see THE CLOCK below), so a shot reads the same on any computer.

   A bigger viewport fits more of a screen at once and draws it smaller. A draft whose board and
   choices do not fit on one phone screen wants one, or the clip spends its time scrolling past
   the thing it is about.

   The page is served from disk, the way the site's own browser checks do it, so a clip shows the
   code in this checkout and nothing on the network. That also means no real account, no real
   player and no real data appears on camera: the clip is a stranger playing as a guest.

   A recording has no network, so anything that reaches a server says it could not: a leaderboard
   tile reading "unreachable" is a bug on camera. A shot lists such a script in `hide` and the page
   gets a 404 for it, which every game here treats as "no board" and draws as a plain dash. Never
   stub a server with made-up answers: a rank or a count on camera has to be real.

   THE CLOCK. A frame is taken every 1/30 of a second of the page's own time, however long the
   machine takes to draw it. The browser's clock is paused between frames (virtual time) and each
   frame is drawn on request (begin-frame control), so timers, requestAnimationFrame and CSS
   animations all move exactly one frame's worth per frame. The first version filmed with Chrome's
   screencast, which sends a frame whenever it manages to draw one: at full phone resolution that
   was about 20 a second, unevenly, and the owner called the clips laggy (2026-10-15). This way a
   slow machine only makes a recording take longer, never look worse.

   The output is H.264 1080x1920 at 30 fps with a silent audio track, which X, Instagram Reels and
   Facebook all take. publish.mjs --check reads the result and refuses anything they would not.

   Needs Playwright (npm install --no-save playwright, or the sandbox's global copy), Chromium's
   headless shell (npx playwright install chromium-headless-shell) and ffmpeg. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const name = args.find((a, i) => !a.startsWith('--') && !['--out', '--speed', '--viewport', '--scale', '--arg'].includes(args[i - 1]));
if (!name) { console.error('usage: node scripts/marketing/record.mjs <shot> [--out marketing/clips/x.mp4] [--speed 1.5] [--keep]'); process.exit(2); }
const shotFile = path.join(ROOT, 'scripts/marketing/shots', `${name}.mjs`);
if (!fs.existsSync(shotFile)) {
  const have = fs.readdirSync(path.dirname(shotFile)).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
  console.error(`no shot "${name}". Shots: ${have.join(', ')}`); process.exit(2);
}
const shot = await import(pathToFileURL(shotFile).href);
const day = new Date().toISOString().slice(0, 10);
const out = path.resolve(ROOT, opt('--out', `marketing/clips/${day}-${name}.mp4`));
const SPEED = Math.max(0.25, +opt('--speed', 1) || 1);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// The frame is always 1080x1920. The page's CSS size sets how much fits on it.
/* The screen. A post is 1080x1920 (9:16) and that is the default: a 9:16 viewport scaled to 1080 wide.
   Footage for something else, a trailer that puts the game on a drawn phone and laptop, asks for the
   device's own screen: --viewport 1440x900 --scale 1 is a laptop's desktop layout, --viewport 390x844
   --scale 2 a phone's. The page is told it is a phone (touch, mobile) when it is taller than wide. */
const FPS = 30, FRAME = 1000 / FPS;
const wh = (v) => { const m = /^(\d+)x(\d+)$/.exec(v || ''); return m ? { width: +m[1], height: +m[2] } : null; };
const VIEW = wh(opt('--viewport')) || shot.viewport || { width: 432, height: 768 };
const DPR = +opt('--scale', 0) || shot.scale || 1080 / VIEW.width;
const even = (n) => Math.round(n / 2) * 2;
const W = even(VIEW.width * DPR), H = even(VIEW.height * DPR);
const MOBILE = VIEW.width < VIEW.height;
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
/* Begin-frame control is a headless-shell feature, so this launches the shell itself and attaches
   Playwright to it: Playwright's own launch cannot open a page that waits to be told to draw. */
function findShell() {
  if (process.env.PS_HEADLESS) return process.env.PS_HEADLESS;
  for (const base of ['/opt/pw-browsers', path.join(os.homedir(), '.cache/ms-playwright')]) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) {
      for (const f of ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-mac/headless_shell']) {
        if (fs.existsSync(path.join(base, d, f))) return path.join(base, d, f);
      }
    }
  }
  return null;
}
const SHELL = findShell();
if (!SHELL) { console.error('No Chromium headless shell. Run: npx playwright install chromium-headless-shell (or set PS_HEADLESS)'); process.exit(2); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-profile-'));
const proc = spawn(SHELL, ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-sandbox',
  '--deterministic-mode', '--enable-begin-frame-control', '--disable-threaded-animation', '--disable-threaded-scrolling',
  '--run-all-compositor-stages-before-draw', `--force-device-scale-factor=${DPR}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  proc.on('exit', (c) => rej(new Error(`the headless shell exited (${c}): ${buf.slice(-300)}`)));
  setTimeout(() => rej(new Error('the headless shell did not start')), 20000);
});
const browser = await pw.chromium.connectOverCDP(wsUrl);
const context = browser.contexts()[0];
const opened = context.waitForEvent('page');
await (await browser.newBrowserCDPSession()).send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true });
const page = await opened;
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: DPR, mobile: MOBILE });
if (MOBILE) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await page.addInitScript(FINGER);
// a shot's own init script (a stand-in account, say) runs before the page's scripts
if (shot.init) await page.addInitScript(shot.init);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
/* Google Fonts, fetched once with curl (it goes through the environment's proxy, the browser does not) and
   kept in a cache, so every take of every clip draws the same type. A font that cannot be fetched is a
   404, and the page falls back as it would offline. */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const FONT_DIR = path.join(os.tmpdir(), 'clip-fonts');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
function font(url) {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const f = path.join(FONT_DIR, crypto.createHash('sha1').update(url).digest('hex'));
  if (!fs.existsSync(f) && spawnSync('curl', ['-sSfL', '-A', UA, '-o', f, url]).status !== 0) { try { fs.rmSync(f); } catch {} return { status: 404, body: '' }; }
  const body = fs.readFileSync(f), css = /fonts\.googleapis\.com/.test(url);
  return { status: 200, body, contentType: css ? 'text/css' : /\.ttf/.test(url) ? 'font/ttf' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } };
}
await page.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  // Nothing leaves the machine: no payment, no account, no analytics on a recording. The one exception is
  // the pages' web fonts, or the clip is drawn in fallback fonts a player never sees.
  if (FONT_HOSTS.includes(u.hostname)) return r.fulfill(font(u.href));
  if (u.hostname !== 'local.test') return r.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  if ((shot.hide || []).includes(rel)) return r.fulfill({ status: 404, body: '' });
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
  await r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});

/* ---- the clock: one frame at a time, forever, until the shot is done --------------------------- */
let now = 0, ticks = Number(process.hrtime.bigint()) / 1e6, rolling = false, rolledAt = 0, written = 0, last = null, stop = false;
let ff = null, pumpError = null;
const keepDir = args.includes('--keep') ? fs.mkdtempSync(path.join(os.tmpdir(), `clip-${name}-`)) : null;
let waiters = [];
/* TRACKING, for a trailer's camera: where each part named in the shot's `track` sits on screen, every
   frame, and every tap, in the clip's own pixels (CSS px times the scale). It goes beside the clip as
   <clip>.track.json, so an edit can frame the thing a caption talks about instead of guessing. A part
   that is missing or hidden on a frame is null there. */
const TRACK = shot.track || null, track = { fps: FPS, scale: DPR, view: VIEW, frames: [], taps: [] };
const trackFrame = async () => {
  if (!TRACK) return;
  track.frames.push(await page.evaluate((T) => { const o = {};
    for (const [k, sel] of Object.entries(T)) { const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent || e.getClientRects().length);
      const r = el && el.getBoundingClientRect(); o[k] = r && r.width && r.height ? [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10) : null; }
    return o; }, TRACK).catch(() => null));
};
const nextFrame = () => new Promise((res, rej) => { if (pumpError) rej(pumpError); else waiters.push({ res, rej }); });
await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
const advance = (ms) => new Promise((res) => {
  cdp.once('Emulation.virtualTimeBudgetExpired', res);
  cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms });
});
async function write(buf) {
  if (keepDir) fs.writeFileSync(path.join(keepDir, `f${String(written).padStart(5, '0')}.jpg`), buf);
  written++;
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
const pump = (async () => {
  try {
    while (!stop) {
      await advance(FRAME);
      now += FRAME; ticks += FRAME;
      const f = await cdp.send('HeadlessExperimental.beginFrame',
        { frameTimeTicks: ticks, interval: FRAME, ...(rolling ? { screenshot: { format: 'jpeg', quality: 92 } } : {}) });
      if (rolling) {
        // A frame with nothing new to draw repeats the last one, so the clip keeps time.
        if (f.screenshotData) last = Buffer.from(f.screenshotData, 'base64');
        if (last) { await write(last); await trackFrame(); }
      }
      const w = waiters; waiters = [];
      for (const x of w) x.res();
    }
  } catch (e) {
    pumpError = e;
    for (const x of waiters) x.rej(e);
  }
})();

const frames = async (n) => { for (let i = 0; i < n; i++) await nextFrame(); };
const hold = async (ms) => { const end = now + ms; while (now < end) await nextFrame(); };
const onScreen = (box) => box && box.y >= 64 && box.y + box.height <= VIEW.height - 8;
const t = {
  view: { ...VIEW, mobile: MOBILE },
  // --arg, for a shot that films one of several things (which hole, which world)
  arg: opt('--arg', ''),
  hold,
  async until(fn, ms = 15000, arg) {
    const end = now + ms;
    while (!(await page.evaluate(fn, arg))) {
      if (now > end) throw new Error(`waited ${ms / 1000}s of page time for: ${String(fn).slice(0, 120)}`);
      await frames(3);
    }
  },
  /* A tap the viewer can follow: a beat to see where it goes, the tap, a beat to see what it did.
     The page only scrolls when the target is not already in full view, so a screen that fits
     stays still. Then to the middle, not just into view: a sticky header can cover the top edge. */
  async tap(target, { before = 250, after = 450 } = {}) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    let box = await loc.boundingBox();
    if (!onScreen(box)) {
      await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      // A long smooth scroll takes a while: tap only once the target has stopped moving.
      for (let prev = null, i = 0; i < 40; i++) {
        await hold(100);
        box = await loc.boundingBox();
        if (prev && box && Math.abs(box.y - prev.y) < 0.5) break;
        prev = box;
      }
    }
    if (!box) throw new Error(`nothing on screen to tap: ${target}`);
    await hold(before);
    if (rolling) track.taps.push({ frame: written, box: [box.x, box.y, box.width, box.height].map((v) => Math.round(v)), what: String(typeof target === 'string' ? target : 'locator') });
    // page.mouse fires the pointer events the finger listens for; touchscreen.tap does not.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await hold(after);
  },
};

let failed;
try {
  await page.goto(`http://local.test${shot.page}`, { waitUntil: 'domcontentloaded' });
  if (shot.setup) await shot.setup(page, t);
} catch (e) { failed = e; }

/* The camera rolls from here. The setup never shows. */
if (!failed) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff = spawn(FFMPEG, ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS * SPEED), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res) => ff.on('exit', res));
  rolling = true; rolledAt = now;
  const limit = (shot.seconds || 60) * 1000;
  try {
    await Promise.race([
      shot.play(page, t),
      (async () => { while (now - rolledAt < limit) await frames(FPS); console.log(`stopped at the shot's ${limit / 1000}s limit`); })(),
    ]);
    await hold(400);
  } catch (e) { failed = e; }
  rolling = false;
  ff.stdin.end();
  const code = await ffDone;
  if (code !== 0 && !failed) failed = new Error(`ffmpeg exited ${code}`);
}
stop = true;
await pump.catch(() => {});
await browser.close().catch(() => {});
// Wait for the shell to exit before clearing its profile, or it is still writing into it.
await new Promise((res) => { if (proc.exitCode !== null) return res(); proc.once('exit', res); proc.kill(); setTimeout(res, 5000); });
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}
if (failed) { console.error(`the shot failed: ${failed.message}`); process.exit(1); }
if (keepDir) console.log(`raw frames kept in ${keepDir}`);
const size = fs.statSync(out).size / 1048576;
if (TRACK || track.taps.length) fs.writeFileSync(out.replace(/\.mp4$/, '') + '.track.json', JSON.stringify(track));
console.log(`${path.relative(ROOT, out)}: ${(written / FPS / SPEED).toFixed(1)}s${SPEED !== 1 ? ` at ${SPEED}x` : ''}, ${written} frames, ${size.toFixed(1)} MB`);
if (errors.length) console.log(`the page threw ${errors.length} error(s) while recording; watch the clip before using it:\n  ${errors.slice(0, 5).join('\n  ')}`);
