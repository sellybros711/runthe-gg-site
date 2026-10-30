#!/usr/bin/env node
/* Film a trailer page frame by frame.

   node scripts/marketing/trailer/render-html.mjs <page> --fmt reels|x --foot <dir> --out <file.mp4> [--music <wav>] [--fps 30] [--from s --to s]

   <page> is a path in this repo (scripts/marketing/trailer/commish/index.html). The page draws one frame
   for `await render(t)` and says how long it runs in `window.DURATION`; nothing on it moves by itself,
   so every frame is exactly the frame at its time, however long a screenshot takes. The repo is served
   at http://local.test/, the footage directory at /foot/, and Google Fonts through a curl cache (the
   same one record.mjs keeps). Every other host is refused. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2), opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const pageRel = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
const FMT = opt('--fmt', 'reels'), FOOT = path.resolve(opt('--foot', '.')), OUT = path.resolve(opt('--out', `trailer-${FMT}.mp4`));
const FPS = +opt('--fps', 30), MUSIC = opt('--music', null);
const SIZE = { reels: [1080, 1920], x: [1350, 1080] }[FMT];
if (!pageRel || !SIZE) { console.error('usage: render-html.mjs <page> --fmt reels|x --foot <dir> --out <mp4>'); process.exit(1); }

const FONT_DIR = path.join(os.tmpdir(), 'clip-fonts');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
function font(url) {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const f = path.join(FONT_DIR, crypto.createHash('sha1').update(url).digest('hex'));
  if (!fs.existsSync(f) && spawnSync('curl', ['-sSfL', '-A', UA, '-o', f, url]).status !== 0) { try { fs.rmSync(f); } catch {} return { status: 404, body: '' }; }
  const css = /fonts\.googleapis\.com/.test(url);
  return { status: 200, body: fs.readFileSync(f), contentType: css ? 'text/css' : /\.ttf/.test(url) ? 'font/ttf' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } };
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const pw = await import('playwright');
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await pw.chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return r.fulfill(font(u.href));
  if (u.hostname !== 'local.test') return r.abort();
  const rel = decodeURIComponent(u.pathname);
  const f = rel.startsWith('/foot/') ? path.join(FOOT, rel.slice(6)) : path.join(ROOT, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
});
await page.goto(`http://local.test/${pageRel}?fmt=${FMT}`, { waitUntil: 'load' });
await page.evaluate(() => window.ready);
const DUR = await page.evaluate(() => window.DURATION);
const from = +opt('--from', 0), to = Math.min(DUR, +opt('--to', DUR));
const n = Math.round((to - from) * FPS);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...(MUSIC ? ['-ss', String(from), '-i', MUSIC] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  ...(MUSIC ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = 0; i < n; i++) {
  const t = from + i / FPS;
  await page.evaluate((t) => window.render(t), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 60 === 0) process.stderr.write(`\r${FMT} ${t.toFixed(1)}s / ${to.toFixed(1)}s `);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`\n${path.relative(process.cwd(), OUT)}: ${(n / FPS).toFixed(1)}s`);
