#!/usr/bin/env node
/* THE ROOM PICTURES.
 *
 *   node scripts/setlist/make_venue_thumbs.mjs            every room
 *   node scripts/setlist/make_venue_thumbs.mjs rocks pub  just these
 *
 * Every room in setlist/venues.js, rendered by the stage itself and saved as a small pixel PNG in
 * setlist/venues/<id>.png. The picker, the profile shelf, the reveal and the share card all show these
 * instead of building a world per room: a world is about a second of a phone's CPU, and the shelf
 * shows every room at once.
 *
 * IT DOUBLES AS THE CHECK THAT EVERY ROOM BUILDS. A room that throws, or logs an error while it is
 * drawn, fails the run and writes nothing for it. Bump VENUE_ART_V in setlist/index.html after a run
 * that changed a picture, or a returning visitor keeps the old one.
 *
 * Serves the repo itself and hands the harness page over in memory, so nothing is left in the tree.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { VENUE_LIST } from '../../setlist/venues.js';

// Through require, which honours NODE_PATH, where a CI image or a dev box keeps its global playwright.
const pw = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'setlist/venues');
const W = 384, H = 240;
/* How far into the night each picture is taken. Most rooms read best under the rig after dark; a
   few are about the light outside. */
const PROGRESS = { cabo: .5, rocks: .62, lawn: .7, gorge: .5, farm: .62, greek: .6 };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.csv': 'text/csv', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const HARNESS = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#0B0818}#h{position:relative;width:${W}px;height:${H}px;overflow:hidden}
#h canvas{position:absolute;left:0;top:0}</style>
<div id="h"><canvas id="c"></canvas></div>
<script type="module">
const q = new URLSearchParams(location.search);
const { createStage } = await import('/setlist/stage.js?v=' + Date.now());
const st = createStage(document.getElementById('c'), { seed: 41, venue: q.get('v'), reduce: true });
const p = +q.get('p');
st.cue({ kind: 'set', progress: p, instant: true });
st.cue({ kind: 'song', progress: p, energy: .8, palette: 'jam', instant: true });
window.__done = true;
</script>`;

const want = process.argv.slice(2);
const list = VENUE_LIST.filter(v => !want.length || want.includes(v.id));
fs.mkdirSync(OUT, { recursive: true });
const CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
const browser = await pw.chromium.launch(CHROME ? { executablePath: CHROME } : {});
let bad = 0;
for (const v of list){
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/__thumb.html*', r => r.fulfill({ status: 200, contentType: 'text/html', body: HARNESS }));
  await page.goto(`http://localhost:${PORT}/__thumb.html?v=${v.id}&p=${PROGRESS[v.id] ?? .72}`);
  const ok = await page.waitForFunction(() => window.__done, null, { timeout: 90000 }).then(() => true, () => false);
  if (!ok || errs.length){
    bad++;
    console.log(`FAIL ${v.id}: ${ok ? errs.join(' | ') : 'the room never finished building'}`);
  } else {
    await page.waitForTimeout(200);
    const file = path.join(OUT, `${v.id}.png`);
    await page.locator('#h').screenshot({ path: file });
    /* 256 colours, no dither: a third of the bytes and the same picture, because pixel art is made of
       a few hundred colours anyway. Skipped (and said so) where Pillow is not installed. */
    const q = spawnSync('python3', ['-c', 'import sys\nfrom PIL import Image\nf=sys.argv[1]\n' +
      'Image.open(f).convert("RGB").quantize(256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).save(f,optimize=True)', file]);
    if (q.status !== 0) console.log(`     (not quantized: ${String(q.stderr || 'no python3').trim().split('\n').pop()})`);
    console.log(`ok   ${v.id}  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
  }
  await page.close();
}
await browser.close();
server.close();
if (bad){ console.log(`\n${bad} room(s) failed to build.`); process.exit(1); }
