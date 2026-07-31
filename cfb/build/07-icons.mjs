/* Stage 7, the icon set.
 *
 *   node cfb/build/07-icons.mjs
 *
 * Renders the CFB brand SVGs to the PNG sizes a browser, a phone home screen and an
   Android launcher each want. Chromium is the rasteriser because it is the one already
   in this environment and because it is the same engine that will draw the SVG live.
   Run from the repo root. */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

async function render(svgPath, outPath, size, transparent, height) {
  const h = height || size;
  const svg = readFileSync(svgPath, 'utf8');
  const page = await browser.newPage({
    viewport: { width: size, height: h },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    '<style>html,body{margin:0;padding:0;width:' + size + 'px;height:' + h + 'px;' +
    (transparent ? 'background:transparent' : 'background:#111827') + '}' +
    'svg{display:block;width:' + size + 'px;height:' + h + 'px}</style>' + svg,
    { waitUntil: 'load' }
  );
  const buf = await page.screenshot({ omitBackground: !!transparent, type: 'png' });
  writeFileSync(outPath, buf);
  await page.close();
  console.log(outPath, size + 'x' + h, buf.length + ' bytes');
}

const B = 'cfb/brand/';
await render(B + 'mark.svg', 'cfb/mark.png', 90, true, 81);
await render(B + 'icon.svg', 'cfb/favicon-16.png', 16, false);
await render(B + 'icon.svg', 'cfb/favicon-32.png', 32, false);
await render(B + 'icon.svg', 'cfb/favicon-48.png', 48, false);
await render(B + 'icon.svg', 'cfb/apple-touch-icon.png', 180, false);
await render(B + 'icon.svg', 'cfb/icon-192.png', 192, false);
await render(B + 'icon.svg', 'cfb/icon-512.png', 512, false);
await render(B + 'icon-maskable.svg', 'cfb/icon-maskable-512.png', 512, false);

/* A contact sheet, so the set can be looked at rather than trusted. */
const page = await browser.newPage({ viewport: { width: 700, height: 260 } });
const files = ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
await page.setContent(
  '<body style="margin:0;background:#0b1220;color:#94a3b8;font:11px system-ui;' +
  'display:flex;gap:18px;align-items:flex-end;padding:22px">' +
  files.map((f) => {
    const b64 = readFileSync('cfb/' + f).toString('base64');
    return '<div style="text-align:center"><img src="data:image/png;base64,' + b64 +
      '" style="image-rendering:pixelated;display:block;margin:0 auto 6px"><span>' + f + '</span></div>';
  }).join('') + '</body>');
await page.screenshot({ path: '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/brand_sheet.png' });
await page.close();

await browser.close();
