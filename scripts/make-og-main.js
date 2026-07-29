#!/usr/bin/env node
// Renders runthegames-og-source.html to runthegames-og_1200x630.png
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 630 });

  const srcPath = path.resolve(__dirname, 'runthegames-og-source.html');
  await page.goto('file://' + srcPath, { waitUntil: 'networkidle' });
  // Extra wait for fonts
  await page.waitForTimeout(1500);

  const outPath = path.resolve(__dirname, '../assets/runthegames-og_1200x630.png');
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('Saved:', outPath);
  await browser.close();
})();
