// ============================================================================
// capture-game.js — Marketing assets built from REAL game screens only.
// No invented graphics: drives the actual index.html in headless Chrome,
// screenshots genuine game UI, then composes polished branded posts.
// Run:  node marketing/capture-game.js
// ============================================================================
const puppeteer = require('puppeteer');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT  = path.resolve('.');
const SHOTS = path.resolve('marketing/shots');
fs.mkdirSync(SHOTS, { recursive: true });

// Brand palette
const NAVY  = '#0B1324';
const GOLD  = '#F4B413';
const TEAL  = '#138A6B';
const CREAM = '#FBF4E6';

// Font TTFs — downloaded from Google Fonts to /tmp/fonts/ before running.
// If a weight is missing the capture still works (Canvas falls back gracefully).
const FONT_DIR = '/tmp/fonts';
const FONT_SPECS = [
  { family: 'Anton',   weight: 400, file: 'Anton-Regular.ttf' },
  { family: 'Archivo', weight: 400, file: 'Archivo-400.ttf'   },
  { family: 'Archivo', weight: 600, file: 'Archivo-600.ttf'   },
  { family: 'Archivo', weight: 700, file: 'Archivo-700.ttf'   },
  { family: 'Archivo', weight: 900, file: 'Archivo-900.ttf'   },
];

// Build base64 @font-face CSS for injection into the puppeteer page.
// This fixes the headless-Chrome CDN cert failure that caused Impact fallback.
function buildFontFaceCSS() {
  return FONT_SPECS
    .filter(({ file }) => fs.existsSync(path.join(FONT_DIR, file)))
    .map(({ family, weight, file }) => {
      const b64 = fs.readFileSync(path.join(FONT_DIR, file)).toString('base64');
      return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;`
           + `src:url('data:font/truetype;base64,${b64}') format('truetype');}`;
    })
    .join('\n');
}

// Register fonts for @napi-rs/canvas (branded layout compositing).
function registerCanvasFonts() {
  for (const { file, family } of FONT_SPECS) {
    const fp = path.join(FONT_DIR, file);
    if (fs.existsSync(fp)) GlobalFonts.registerFromPath(fp, family);
  }
}

const LEGENDS = [
  ['Lionel Messi', 2022], ['Pelé', 1970], ['Ronaldo', 2002],
  ['Diego Maradona', 1986], ['Kylian Mbappé', 2022], ['Cristiano Ronaldo', 2018],
];

// ── Puppeteer capture ────────────────────────────────────────────────────────

async function captureScreens() {
  const fontCSS = buildFontFaceCSS();
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files', '--force-color-profile=srgb'],
  });
  const p = await b.newPage();
  const url = 'file://' + path.join(ROOT, 'index.html');

  const load = async (w, h) => {
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 3 });
    await p.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    // Inject real font data so headless Chrome uses Anton/Archivo, not Impact.
    if (fontCSS) {
      await p.addStyleTag({ content: fontCSS });
      await p.evaluate(async () => {
        await Promise.all([
          document.fonts.load("400 1em 'Anton'"),
          document.fonts.load("400 1em 'Archivo'"),
          document.fonts.load("600 1em 'Archivo'"),
          document.fonts.load("700 1em 'Archivo'"),
          document.fonts.load("900 1em 'Archivo'"),
        ]);
        await document.fonts.ready;
      });
    }
    await sleep(800);
  };

  // 1) START screen — wide enough so the clamped headline fits overflow-hidden.
  await load(600, 1040);
  await p.screenshot({ path: path.join(SHOTS, 'start.png'), fullPage: true });
  console.log('shot start.png');

  // 2) Solo → setup → "YOUR STARTING VI" pitch.
  await load(430, 932);
  await p.click('#btn-start');  await sleep(700);
  await p.click('#btn-setup-go'); await sleep(1000);
  await p.screenshot({ path: path.join(SHOTS, 'pitch.png'), fullPage: true });
  console.log('shot pitch.png');

  // 3) Spin → real draft selection grid.
  await p.click('#btn-go-spin');
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    if (await p.evaluate(() => document.querySelectorAll('.pcard').length)) break;
  }
  await sleep(400);
  await p.screenshot({ path: path.join(SHOTS, 'draft.png'), fullPage: true });
  console.log('shot draft.png');

  // 4) Render the six GOATs through the game's own renderGrid().
  const ok = await p.evaluate((want) => {
    const picks = want
      .map(([nm, yr]) => window.PLAYERS.find(x => x.name === nm && x.year === yr))
      .filter(Boolean);
    if (picks.length !== want.length) return false;
    window.gameMode = 'easy';
    renderGrid(picks);
    return true;
  }, LEGENDS);
  if (ok) {
    const box = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('#player-grid .pcard')];
      const rects = cs.map(c => c.getBoundingClientRect());
      const lx = Math.min(...rects.map(r => r.left));
      const ty = Math.min(...rects.map(r => r.top));
      const rx = Math.max(...rects.map(r => r.right));
      const by = Math.max(...rects.map(r => r.bottom));
      const pad = 10;
      return { x: lx - pad, y: ty - pad, width: (rx - lx) + pad * 2, height: (by - ty) + pad * 2 };
    });
    await p.screenshot({ path: path.join(SHOTS, 'legends.png'), clip: box });
    console.log('shot legends.png');
  }
  await b.close();
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

// Draw "RUN·THE·PITCH" with the middle word in teal.
function drawWordmark(ctx, cx, y, fontSize) {
  const parts  = ['RUN·', 'THE', '·PITCH'];
  const colors = [CREAM,  TEAL,  CREAM];
  ctx.font = `${fontSize}px 'Anton'`;
  ctx.textBaseline = 'alphabetic';
  const widths = parts.map(t => ctx.measureText(t).width);
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < parts.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.textAlign = 'left';
    ctx.fillText(parts[i], x, y);
    x += widths[i];
  }
}

// Subtle pitch markings as background decoration.
function drawPitchDeco(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1.5;
  const cx = W / 2;
  // Centre circle
  ctx.beginPath(); ctx.arc(cx, H * 0.5, W * 0.34, 0, Math.PI * 2); ctx.stroke();
  // Halfway line
  ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(W, H * 0.5); ctx.stroke();
  // Penalty arcs top/bottom
  ctx.beginPath(); ctx.arc(cx, H * 0.1,  W * 0.19, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, H * 0.9,  W * 0.19, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ── Branded post compositor ───────────────────────────────────────────────────

async function brandedPost(shotFile, outFile, W, H, opts = {}) {
  const {
    marginFrac = 0.055,
    headline   = null,
    kicker     = 'PLAY NOW AT',
    footer     = 'RunThe.gg',
  } = opts;

  const img = await loadImage(path.join(SHOTS, shotFile));
  const c   = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Background
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  drawPitchDeco(ctx, W, H);

  // Top wordmark
  const topH = H * 0.135;
  drawWordmark(ctx, W / 2, topH * 0.76, Math.round(H * 0.068));

  // Thin teal rule under wordmark
  ctx.fillStyle = TEAL;
  ctx.fillRect(W * 0.3, topH - 4, W * 0.4, 2);

  // Image placement zone
  const footerTop   = H * 0.85;
  const headlineH   = headline ? H * 0.07 : 0;
  const imgZoneTop  = topH + H * 0.01;
  const imgZoneBot  = footerTop - headlineH - H * 0.015;
  const imgZoneH    = imgZoneBot - imgZoneTop;
  const imgZoneW    = W * (1 - marginFrac * 2);

  const scale = Math.min(imgZoneW / img.width, imgZoneH / img.height);
  const dw = img.width  * scale;
  const dh = img.height * scale;
  const dx = (W - dw) / 2;
  const dy = imgZoneTop + (imgZoneH - dh) / 2;

  // Drop-shadow behind the screenshot frame
  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur    = 32;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle     = '#000';
  roundedRectPath(ctx, dx - 4, dy - 4, dw + 8, dh + 8, 10);
  ctx.fill();
  ctx.restore();

  // Screenshot (clipped to rounded rect)
  ctx.save();
  roundedRectPath(ctx, dx - 4, dy - 4, dw + 8, dh + 8, 10);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();

  // Cream border around screenshot
  ctx.save();
  ctx.strokeStyle = 'rgba(251,244,230,0.22)';
  ctx.lineWidth   = 2;
  roundedRectPath(ctx, dx - 4, dy - 4, dw + 8, dh + 8, 10);
  ctx.stroke();
  ctx.restore();

  // Headline (optional one-liner between image and footer)
  if (headline) {
    const hlY = imgZoneBot + H * 0.01;
    ctx.fillStyle    = CREAM;
    ctx.font         = `700 ${Math.round(H * 0.032)}px 'Archivo'`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(headline, W / 2, hlY);
  }

  // Gold divider
  ctx.fillStyle = GOLD;
  ctx.fillRect(W * 0.28, footerTop - 3, W * 0.44, 2);

  // "PLAY NOW AT" kicker
  ctx.fillStyle    = 'rgba(251,244,230,0.6)';
  ctx.font         = `600 ${Math.round(H * 0.026)}px 'Archivo'`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(kicker, W / 2, footerTop + H * 0.006);

  // Big gold URL
  ctx.fillStyle    = GOLD;
  ctx.font         = `${Math.round(H * 0.07)}px 'Anton'`;
  ctx.textBaseline = 'top';
  ctx.fillText(footer, W / 2, footerTop + H * 0.038);

  fs.writeFileSync(path.join('marketing', outFile), c.toBuffer('image/png'));
  console.log('wrote marketing/' + outFile);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  registerCanvasFonts();
  await captureScreens();

  await brandedPost('start.png', 'post-start.png', 1080, 1350, {
    headline: 'Build your dream World Cup squad.',
  });
  await brandedPost('pitch.png', 'post-pitch.png', 1080, 1350, {
    headline: 'GK · DEF · DEF · MID · FWD · FLEX',
  });
  await brandedPost('draft.png', 'post-draft.png', 1080, 1350, {
    headline: 'Real players. Real ratings. Every era.',
  });
  await brandedPost('legends.png', 'post-legends.png', 1080, 1080, {
    headline: 'Messi · Pelé · R9 · Maradona · Mbappé · CR7',
    marginFrac: 0.04,
  });

  console.log('\nAll done. Posts in marketing/post-*.png');
})();
