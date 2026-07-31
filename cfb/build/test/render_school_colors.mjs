/* Draws every school's landed reel tile, the way the draft screen draws it, onto one
 * sheet you can look at.
 *
 *   node cfb/build/test/render_school_colors.mjs [out.png]
 *
 * WHY A PICTURE. "Are the colours right" is not a question a unit test can answer:
 * the answer is whether Kentucky looks like Kentucky. What a test CAN answer is
 * whether anything is invisible or invented, so this also prints a report of the
 * cases worth a second look: a trim that cannot be told from its background, and a
 * school whose stored pair does not match the one it is known by.
 *
 * The tile is built from the same wheelColors() the game calls and the same CSS
 * variables the reel box uses, so what is on the sheet is what a player sees.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const E = require('../../engine.js');
const OUT = process.argv[2] ||
  '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/school_colors.png';

const teams = JSON.parse(readFileSync('cfb/data/cfb_team_seasons.json', 'utf8'));
const by = new Map();
for (const t of teams) if (!by.has(t.school)) by.set(t.school, t);
const schools = [...by.values()].sort((a, b) => a.school.localeCompare(b.school));

/* Relative luminance, for the two checks below. */
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* HOW DIFFERENT TWO COLOURS LOOK, which is not the same question as how different
   their brightnesses are. Luminance contrast alone called Syracuse's blue trim on
   its orange box invisible, because the two happen to be equally bright; they are
   about as different as two colours get. A border disappears when it is close in
   ALL THREE channels, so that is what gets measured, with luminance as a second
   route to visibility for a pair that shares a hue. */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbDist = (a, b) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.sqrt(x.reduce((t, v, i) => t + (v - y[i]) * (v - y[i]), 0));
};

const rows = schools.map((t) => {
  const w = E.wheelColors(t.color, t.alt_color);
  return { ...t, bg: w.bg, accent: w.accent,
    dist: rgbDist(w.bg, w.accent), trim: contrast(w.bg, w.accent),
    text: contrast(w.bg, '#ffffff') };
});

/* Invisible means close in colour AND close in brightness. Either one on its own is
   a perfectly good border. */
const dimTrim = rows.filter((r) => r.dist < 60 && r.trim < 1.35);
const dimText = rows.filter((r) => r.text < 3);
console.log('schools: ' + rows.length);
console.log('trim indistinguishable from its background: ' + dimTrim.length +
  (dimTrim.length ? '  ' + dimTrim.map((r) => r.school + ' d=' + r.dist.toFixed(0) +
    ' c=' + r.trim.toFixed(2)).join(', ') : ''));
console.log('white lettering below 3:1: ' + dimText.length +
  (dimText.length ? '  ' + dimText.map((r) => r.school + ' ' + r.text.toFixed(2)).join(', ') : ''));
/* An accent that is not the school's own is worth knowing about even when it looks
   fine: it means a dark neutral trim was substituted, which is a decision this made
   rather than a fact about the school. */
const substituted = rows.filter((r) => {
  const c = rgb(r.alt_color);
  return Math.max(...c) - Math.min(...c) < 20 && (0.299*c[0]+0.587*c[1]+0.114*c[2]) < 128;
});
console.log('dark neutral trim, drawn as a lift of the primary instead: ' +
  substituted.length + '  ' + substituted.map((r) => r.school).join(', '));

const tile = (r) => `
  <div class="cell">
    <div class="box" style="--c1:${r.bg};--c2:${r.accent}">
      <div class="win"></div><div class="name">${r.school.toUpperCase()}</div>
    </div>
    <div class="src"><i style="background:${r.color}"></i><i style="background:${r.alt_color}"></i>
      <span>${r.color} ${r.alt_color}</span></div>
  </div>`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 800 } });
await page.setContent(`<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#080b14;color:#eef2f9;font:13px system-ui;padding:22px}
  h1{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .box{position:relative;height:76px;border-radius:14px;border:1.5px solid var(--c2);
    background:var(--c1);display:grid;place-items:center;overflow:hidden}
  .win{position:absolute;left:5px;right:5px;top:50%;height:38px;margin-top:-19px;
    border-radius:9px;border:1.5px solid var(--c2);background:rgba(255,255,255,.13)}
  .name{position:relative;z-index:1;font:900 16px/1 'Arial Black',system-ui;
    letter-spacing:.03em;color:#fff;text-align:center;padding:0 8px}
  .src{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10px;color:#64748b}
  .src i{width:12px;height:12px;border-radius:3px;flex:0 0 auto;box-shadow:0 0 0 1px rgba(255,255,255,.2)}
</style>
<h1>Every school, as the reel draws it when you land on them</h1>
<div class="grid">${rows.map(tile).join('')}</div>`);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('wrote ' + OUT);
