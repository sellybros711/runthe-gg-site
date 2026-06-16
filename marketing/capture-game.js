// ============================================================================
// capture-game.js — Marketing assets built from REAL game screens only.
// No invented graphics: this drives the actual index.html in headless Chrome,
// screenshots genuine game UI, and pads each shot onto the game's own cream
// background (--paper #FBF4E6) at Instagram sizes. Run:  node marketing/capture-game.js
// ============================================================================
const puppeteer = require('puppeteer');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve('.');
const SHOTS = path.resolve('marketing/shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PAPER = '#FBF4E6';   // the game's --paper background, so padding is seamless

// The six featured legends (real players that exist in data/players_all.json).
const LEGENDS = [
  ['Lionel Messi', 2022], ['Pelé', 1970], ['Ronaldo', 2002],
  ['Diego Maradona', 1986], ['Kylian Mbappé', 2022], ['Cristiano Ronaldo', 2018],
];

async function captureScreens() {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files', '--force-color-profile=srgb'] });
  const p = await b.newPage();
  const url = 'file://' + path.join(ROOT, 'index.html');
  const load = async (w, h) => {
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 3 });
    await p.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await p.evaluate(() => document.fonts && document.fonts.ready);
    await sleep(1300);
  };

  // 1) START screen — full hero. Needs width >=525 so the clamp()'d headline
  //    stops scaling and fits its overflow-hidden frame (see .hero h1 in CSS).
  await load(600, 1040);
  await p.screenshot({ path: path.join(SHOTS, 'start.png'), fullPage: true });
  console.log('shot start.png');

  // 2) Solo → setup → the real "YOUR STARTING VI" pitch.
  await load(430, 932);
  await p.click('#btn-start'); await sleep(700);
  await p.click('#btn-setup-go'); await sleep(1000);
  await p.screenshot({ path: path.join(SHOTS, 'pitch.png'), fullPage: true });
  console.log('shot pitch.png');

  // 3) Spin → the real draft selection grid (genuine player cards).
  await p.click('#btn-go-spin');
  for (let i = 0; i < 12; i++) { await sleep(1000); if (await p.evaluate(() => document.querySelectorAll('.pcard').length)) break; }
  await sleep(400);
  await p.screenshot({ path: path.join(SHOTS, 'draft.png'), fullPage: true });
  console.log('shot draft.png');

  // 4) Render the six legends through the game's OWN renderGrid() so the cards
  //    are real game DOM, then tight-crop to just the cards.
  const ok = await p.evaluate((want) => {
    const picks = want.map(([nm, yr]) => window.PLAYERS.find(x => x.name === nm && x.year === yr)).filter(Boolean);
    if (picks.length !== want.length) return false;
    window.gameMode = 'easy';
    renderGrid(picks);
    return true;
  }, LEGENDS);
  if (ok) {
    const box = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('#player-grid .pcard')];
      const r = cs.map(c => c.getBoundingClientRect());
      const x = Math.min(...r.map(b => b.left)), y = Math.min(...r.map(b => b.top));
      const x2 = Math.max(...r.map(b => b.right)), y2 = Math.max(...r.map(b => b.bottom));
      const pad = 10;
      return { x: x - pad, y: y - pad, width: (x2 - x) + pad * 2, height: (y2 - y) + pad * 2 };
    });
    await p.screenshot({ path: path.join(SHOTS, 'legends.png'), clip: box });
    console.log('shot legends.png');
  }
  await b.close();
}

// Pad a real screenshot onto a cream IG canvas (contain, centered).
async function compose(srcName, outName, W, H, marginFrac = 0.05) {
  const img = await loadImage(path.join(SHOTS, srcName));
  const c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
  const maxW = W * (1 - marginFrac * 2), maxH = H * (1 - marginFrac * 2);
  const s = Math.min(maxW / img.width, maxH / img.height);
  const dw = img.width * s, dh = img.height * s;
  x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  fs.writeFileSync(path.join('marketing', outName), c.toBuffer('image/png'));
  console.log('wrote marketing/' + outName);
}

(async () => {
  await captureScreens();
  // Instagram portrait 4:5 (1080×1350) for all — clean, consistent feed look.
  await compose('start.png',   'game-start.png',   1080, 1350, 0.04);
  await compose('pitch.png',   'game-pitch.png',   1080, 1350, 0.06);
  await compose('draft.png',   'game-draft.png',   1080, 1350, 0.05);
  await compose('legends.png', 'game-legends.png', 1080, 1080, 0.05);
  console.log('done');
})();
