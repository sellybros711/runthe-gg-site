/* Bake the roster into V2_SPRITES.

     node mythiball/sprites/tools/build_rig.mjs           write the table into mythiball/index.html
     node mythiball/sprites/tools/build_rig.mjs --sheet   a contact sheet only, written to --out (default sheet.png)
     node mythiball/sprites/tools/build_rig.mjs --dry     build and report, write nothing

   The rig lives in the page, between RIG BEGIN and RIG END, because the custom
   player is drawn by it live. This loads the page, hands it sprites/cast.js,
   and asks the page's own rig for every roster character, so the baked table
   and the live player can never be drawn by two different versions of it.

   Every character in ROSTER needs a spec, and every spec needs a character:
   either missing is a refusal, not a gap in the table. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, '../../index.html');
const CAST = path.resolve(HERE, '../cast.js');
const N = 96, SS = 6;
const args = process.argv.slice(2);
const SHEET = args.includes('--sheet'), DRY = args.includes('--dry');
const outArg = args.indexOf('--out');
const OUT = outArg >= 0 ? args[outArg + 1] : 'sheet.png';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(pathToFileURL(PAGE).href);
await page.waitForFunction(() => typeof RIG !== 'undefined' && typeof ROSTER !== 'undefined');
await page.addScriptTag({ content: fs.readFileSync(CAST, 'utf8') + '\nwindow.RIG_CAST = RIG_CAST;' });

const res = await page.evaluate(({ N, SS, sheet }) => {
  const keys = ROSTER.map(c => c.k), specs = Object.keys(RIG_CAST);
  const missing = keys.filter(k => !RIG_CAST[k]), extra = specs.filter(k => keys.indexOf(k) < 0);
  if (missing.length || extra.length) return { missing, extra };
  if (sheet) {
    const T = N * 2, C = 12, cv = document.createElement('canvas');
    cv.width = C * T; cv.height = Math.ceil(keys.length / C) * T;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.fillStyle = '#6aa65a'; c.fillRect(0, 0, cv.width, cv.height);
    keys.forEach((k, i) => {
      const spec = Object.assign({}, RIG_CAST[k], { scale: RIG.fit(RIG_CAST[k], N) });
      c.drawImage(RIG.frame(spec, 'idle', N, SS), (i % C) * T, Math.floor(i / C) * T, T, T);
    });
    return { png: cv.toDataURL() };
  }
  const table = {};
  for (const k of keys) { const e = RIG.entry(RIG_CAST[k], N, SS); table[k] = { b: e.b, f: e.f, p: e.p }; }
  return { json: JSON.stringify(table) };
}, { N, SS, sheet: SHEET });
await browser.close();

if (errs.length) { console.error('page errors:\n  ' + errs.join('\n  ')); process.exit(1); }
if (res.missing) {
  console.error('roster and cast disagree.\n  no spec for: ' + (res.missing.join(', ') || 'none') + '\n  no character for: ' + (res.extra.join(', ') || 'none'));
  process.exit(1);
}
if (SHEET) { fs.writeFileSync(OUT, Buffer.from(res.png.split(',')[1], 'base64')); console.log('wrote ' + OUT); process.exit(0); }

const kb = (res.json.length / 1024).toFixed(0);
if (DRY) { console.log('built the table: ' + kb + ' KB, nothing written'); process.exit(0); }
let html = fs.readFileSync(PAGE, 'utf8');
const line = /^const V2_SPRITES = .*;$/m;
const dims = /^const V2_W = \d+, V2_H = \d+;$/m;
if (!line.test(html) || !dims.test(html)) { console.error('could not find V2_SPRITES or V2_W in the page'); process.exit(1); }
html = html.replace(line, () => 'const V2_SPRITES = ' + res.json + ';');
html = html.replace(dims, 'const V2_W = ' + N + ', V2_H = ' + N + ';');
fs.writeFileSync(PAGE, html);
console.log('wrote V2_SPRITES (' + kb + ' KB) and V2_W = V2_H = ' + N + ' into ' + path.relative(process.cwd(), PAGE));
