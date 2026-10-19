/* The trailer's drawn parts: a phone, a laptop, the background and the title cards, each a PNG with a
   transparent background, drawn by a browser in the games' own type (Anton, Barlow Semi Condensed).

   A device is drawn with a black screen, and the compositor lays the game over it at the screen's place
   (masked to its rounded corners on the phone), so the device's own chrome (the phone's status bar, the laptop's browser bar with the
   address in it) is part of the drawing and the footage is exactly the page's viewport.

   draw(dir, spec) writes the PNGs and returns where each screen's hole is, in the PNG's pixels. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FONT_DIR = path.join(os.tmpdir(), 'clip-fonts');
function font(url) {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const f = path.join(FONT_DIR, crypto.createHash('sha1').update(url).digest('hex'));
  if (!fs.existsSync(f) && spawnSync('curl', ['-sSfL', '-A', UA, '-o', f, url]).status !== 0) return { status: 404, body: '' };
  return { status: 200, body: fs.readFileSync(f), contentType: /googleapis/.test(url) ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } };
}
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Semi+Condensed:wght@500;600;700;800&display=block">';
const BASE = `<!doctype html><meta charset="utf-8">${FONTS}<style>
  html,body{margin:0;background:transparent} *{box-sizing:border-box}
  :root{--gold:#f5c542;--gold2:#ffdf7a;--ink:#07140e;--green:#1d6b45}
  .anton{font-family:Anton,Impact,sans-serif;letter-spacing:.01em}
  .barlow{font-family:'Barlow Semi Condensed',system-ui,sans-serif}
</style>`;

/* THE PHONE: a modern handset, titanium edge, black bezel, an island in the status bar. The screen is
   the status bar (drawn) over the game's 390 x 844 viewport (the hole). */
const PHONE = (k) => `${BASE}<style>
  body{padding:${150 * k}px}
  .ph{position:relative;width:${(390 + 28) * k}px;height:${(44 + 844 + 28) * k}px;border-radius:${62 * k}px;
    background:linear-gradient(135deg,#6b7078,#2a2d33 30%,#4b5058 52%,#1d1f23 80%,#555a62);padding:${4 * k}px;
    box-shadow:0 ${40 * k}px ${70 * k}px rgba(0,0,0,.55),0 ${8 * k}px ${18 * k}px rgba(0,0,0,.35)}
  .bz{width:100%;height:100%;border-radius:${58 * k}px;background:#050607;padding:${10 * k}px;position:relative}
  .sc{position:relative;width:${390 * k}px;height:${(44 + 844) * k}px;border-radius:${48 * k}px;overflow:hidden}
  .sb{height:${44 * k}px;background:#0b1a12;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 ${30 * k}px;
    font:600 ${15 * k}px -apple-system,'Barlow Semi Condensed',system-ui,sans-serif}
  .isl{position:absolute;left:50%;top:${9 * k}px;width:${118 * k}px;height:${32 * k}px;margin-left:${-59 * k}px;border-radius:${18 * k}px;background:#000}
  .bat{display:flex;gap:${5 * k}px;align-items:center}
  .bat i{display:block;width:${24 * k}px;height:${11 * k}px;border:${1.5 * k}px solid #fff;border-radius:${3 * k}px;position:relative}
  .bat i:after{content:'';position:absolute;inset:${1.5 * k}px;width:70%;background:#fff;border-radius:${1 * k}px}
  .bars{display:flex;gap:${2 * k}px;align-items:flex-end}.bars b{display:block;width:${3 * k}px;background:#fff;border-radius:${1 * k}px}
  .hole{height:${844 * k}px;background:#000}
  .btn{position:absolute;width:${4 * k}px;border-radius:${2 * k}px;background:#3a3e45}
</style>
<div class="ph" id="dev"><div class="btn" style="left:${-3 * k}px;top:${150 * k}px;height:${30 * k}px"></div>
  <div class="btn" style="left:${-3 * k}px;top:${200 * k}px;height:${56 * k}px"></div><div class="btn" style="left:${-3 * k}px;top:${266 * k}px;height:${56 * k}px"></div>
  <div class="btn" style="right:${-3 * k}px;top:${220 * k}px;height:${90 * k}px"></div>
  <div class="bz"><div class="sc"><div class="sb"><span>9:41</span><span class="bat"><span class="bars"><b style="height:${4 * k}px"></b><b style="height:${6 * k}px"></b><b style="height:${8 * k}px"></b><b style="height:${10 * k}px"></b></span><i></i></span></div>
  <div class="isl"></div><div class="hole" id="hole"></div></div></div></div>`;

/* THE LAPTOP: a thin black bezel on a dark aluminium lid, a browser bar with the address in it ("in your
   browser" is the point), the 1440 x 900 viewport as the hole, and the base underneath. */
const LAPTOP = (k) => `${BASE}<style>
  body{padding:${200 * k}px ${260 * k}px ${240 * k}px}
  .lid{position:relative;width:${(1440 + 48) * k}px;border-radius:${26 * k}px ${26 * k}px ${8 * k}px ${8 * k}px;padding:${3 * k}px;
    background:linear-gradient(180deg,#5d6168,#2b2e33)}
  .bz{border-radius:${23 * k}px ${23 * k}px ${6 * k}px ${6 * k}px;background:#050607;padding:${22 * k}px ${21 * k}px ${26 * k}px}
  .cam{position:absolute;left:50%;top:${11 * k}px;width:${7 * k}px;height:${7 * k}px;margin-left:${-3.5 * k}px;border-radius:50%;background:#1d2a33}
  .sc{width:${1440 * k}px;border-radius:${4 * k}px;overflow:hidden}
  .tabs{height:${40 * k}px;background:#1f2328;display:flex;align-items:flex-end;padding:0 ${14 * k}px;gap:${8 * k}px}
  .dots{display:flex;gap:${8 * k}px;align-self:center;margin-right:${10 * k}px}.dots i{width:${12 * k}px;height:${12 * k}px;border-radius:50%;display:block}
  .tab{height:${32 * k}px;width:${240 * k}px;background:#353a41;border-radius:${10 * k}px ${10 * k}px 0 0;color:#e8eaed;display:flex;align-items:center;gap:${8 * k}px;
    padding:0 ${12 * k}px;font:600 ${14 * k}px 'Barlow Semi Condensed',system-ui,sans-serif}
  .fav{width:${16 * k}px;height:${16 * k}px;border-radius:${4 * k}px;background:radial-gradient(circle at 35% 35%,#fff,#cfd6cf 60%,#8fa08f);box-shadow:0 0 0 ${2 * k}px #1d6b45}
  .bar{height:${40 * k}px;background:#353a41;display:flex;align-items:center;gap:${14 * k}px;padding:0 ${14 * k}px;color:#9aa0a6;font:700 ${18 * k}px system-ui}
  .url{flex:1;height:${28 * k}px;border-radius:${14 * k}px;background:#202328;display:flex;align-items:center;padding:0 ${14 * k}px;gap:${8 * k}px;
    color:#e8eaed;font:600 ${16 * k}px 'Barlow Semi Condensed',system-ui,sans-serif;letter-spacing:.01em}
  .url .lock{width:${10 * k}px;height:${8 * k}px;border:${2 * k}px solid #9aa0a6;border-radius:${2 * k}px}
  .url b{color:#fff;font-weight:700}.url span{color:#9aa0a6}
  .hole{height:${900 * k}px;background:#000}
  .base{position:relative;margin:0 ${-90 * k}px;height:${30 * k}px;border-radius:0 0 ${40 * k}px ${40 * k}px;
    background:linear-gradient(180deg,#9a9fa6,#5b5f66 45%,#2c2f34);box-shadow:0 ${30 * k}px ${50 * k}px rgba(0,0,0,.55)}
  .base:before{content:'';position:absolute;left:50%;top:0;width:${230 * k}px;height:${10 * k}px;margin-left:${-115 * k}px;border-radius:0 0 ${12 * k}px ${12 * k}px;background:#3b3f45}
  .base:after{content:'';position:absolute;left:0;right:0;top:0;height:${3 * k}px;background:#c9cdd2;opacity:.6}
</style>
<div id="dev" style="display:inline-block"><div class="lid"><div class="bz"><div class="cam"></div><div class="sc">
  <div class="tabs"><span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span><span class="tab"><span class="fav"></span>Run The Tour</span></div>
  <div class="bar">&#8592; &#8594; &#8635;<div class="url"><span class="lock"></span><b>runthe.gg</b><span>/golf</span></div></div>
  <div class="hole" id="hole"></div></div></div></div><div class="base"></div></div>`;

/* THE BACKGROUND: night green, two soft lights and a scatter of gold specks, bigger than the frame so it
   can drift. */
const BG = (W, H) => `${BASE}<style>
  body{width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(ellipse at 30% 20%,#1f6b46 0%,#0f3a27 38%,#07170f 75%,#040c08 100%)}
  .l{position:absolute;border-radius:50%;filter:blur(${Math.round(W / 14)}px)}
  .s{position:absolute;border-radius:50%;background:#f5c542}
</style>
<div class="l" style="left:${W * 0.55}px;top:${H * 0.45}px;width:${W * 0.6}px;height:${W * 0.6}px;background:rgba(245,197,66,.16)"></div>
<div class="l" style="left:${-W * 0.15}px;top:${H * 0.6}px;width:${W * 0.5}px;height:${W * 0.5}px;background:rgba(80,200,140,.14)"></div>
${Array.from({ length: 70 }, (_, i) => { const r = (n) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  const s = 2 + r(3) * 5; return `<i class="s" style="left:${r(1) * W}px;top:${r(2) * H}px;width:${s}px;height:${s}px;opacity:${0.08 + r(4) * 0.3}"></i>`; }).join('')}`;

/* A TITLE CARD: a big Anton line with a gold rule, and a Barlow line under it. */
const CARD = (W, c, k) => `${BASE}<style>
  body{width:${W}px;padding:${20 * k}px ${40 * k}px;text-align:center;color:#fff}
  .kick{font:800 ${22 * k}px 'Barlow Semi Condensed',system-ui;letter-spacing:.32em;text-transform:uppercase;color:var(--gold)}
  .big{font-family:Anton,Impact,sans-serif;font-size:${(c.size || 92) * k}px;line-height:1.02;text-transform:uppercase;letter-spacing:.015em;
    text-shadow:0 ${4 * k}px 0 rgba(0,0,0,.35),0 0 ${30 * k}px rgba(0,0,0,.35)}
  .big em{font-style:normal;color:var(--gold);}
  .rule{width:${110 * k}px;height:${5 * k}px;border-radius:${3 * k}px;background:linear-gradient(90deg,var(--gold),var(--gold2));margin:${14 * k}px auto ${12 * k}px}
  .sub{font:600 ${30 * k}px 'Barlow Semi Condensed',system-ui;color:#e3efe7;letter-spacing:.02em}
  .url{display:inline-block;margin-top:${16 * k}px;padding:${10 * k}px ${26 * k}px;border-radius:${40 * k}px;background:var(--gold);color:#07140e;
    font:800 ${34 * k}px 'Barlow Semi Condensed',system-ui;letter-spacing:.02em}
  /* the lobby's own type (.ft-dt, .ft-dk on the First Tee): cream Anton with a soft shadow, a gold kicker */
  .lobby .kick{color:#f1d04a;letter-spacing:.24em;text-shadow:0 ${2 * k}px ${6 * k}px rgba(0,0,0,.6)}
  .lobby .big{color:#f4e8d6;text-shadow:0 ${6 * k}px ${24 * k}px rgba(0,0,0,.6)}
  .lobby .big em{color:#f4e8d6}
  .lobby .sub{color:#f4e8d6;text-shadow:0 ${2 * k}px ${8 * k}px rgba(0,0,0,.7)}
  .logo{display:block;margin:0 auto ${18 * k}px;height:${(c.imgH || 120) * k}px;image-rendering:pixelated}
</style><div id="card" class="${c.style || ''}">${c.img ? `<img class="logo" src="${c.img}">` : ''}${c.kick ? `<div class="kick">${c.kick}</div>` : ''}<div class="big">${c.big}</div>${c.rule === false ? '' : '<div class="rule"></div>'}${c.sub ? `<div class="sub">${c.sub}</div>` : ''}${c.url ? `<div class="url">${c.url}</div>` : ''}</div>`;

async function shot(pw, browser, html, { width = 1600, height = 1200, sel = '#dev' } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.route('**/*', (r) => { const u = new URL(r.request().url()); if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return r.fulfill(font(u.href)); return r.abort(); });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const el = page.locator(sel);
  const box = await el.boundingBox();
  const hole = await page.evaluate(() => { const h = document.getElementById('hole'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  // room round a device for its shadow, which falls mostly downwards
  const pad = sel === '#dev' ? Math.min(box.x, 180) : 0;
  const clip = { x: box.x - pad, y: Math.max(0, box.y - pad * 0.6), width: box.width + 2 * pad, height: box.height + pad * 1.9 };
  const buf = await page.screenshot({ omitBackground: true, clip });
  await page.close();
  return { buf, w: Math.round(clip.width), h: Math.round(clip.height), hole: hole && { x: Math.round(hole.x - clip.x), y: Math.round(hole.y - clip.y), w: Math.round(hole.w), h: Math.round(hole.h) } };
}

export async function draw(dir, { formats, cards }) {
  const pw = await import('playwright');
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await pw.chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  fs.mkdirSync(dir, { recursive: true });
  const out = { phone: null, laptop: null, bg: {}, cards: {} };
  const save = (name, s) => { fs.writeFileSync(path.join(dir, name), s.buf); return { file: path.join(dir, name), w: s.w, h: s.h, hole: s.hole }; };
  out.phone = save('phone.png', await shot(pw, browser, PHONE(2), { width: 1500, height: 2600 }));
  out.phone.radius = 48 * 2;   // the screen's bottom corners (.sc), which the footage is masked to
  out.laptop = save('laptop.png', await shot(pw, browser, LAPTOP(1), { width: 2600, height: 1700 }));
  for (const [id, f] of Object.entries(formats)) {
    const bw = Math.round(f.W * 1.12), bh = Math.round(f.H * 1.12);
    out.bg[id] = save(`bg-${id}.png`, await shot(pw, browser, BG(bw, bh), { width: bw, height: bh, sel: 'body' }));
    for (const [cid, c] of Object.entries(cards)) {
      const k = f.textScale || 1;
      out.cards[id + ':' + cid] = save(`card-${id}-${cid}.png`, await shot(pw, browser, CARD(f.W, c, k), { width: f.W, height: 900, sel: '#card' }));
    }
  }
  await browser.close();
  return out;
}
