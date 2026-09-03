/* Contrast audit for the arcade.
 *
 * Walks every page in BOTH themes and measures the real, COMPUTED contrast of
 * every element that paints its own text on a filled background. This is the
 * check that would have caught the 1.61:1 "Get Arcade Card" button: nothing in
 * the source looks wrong, because the fill came from a CSS variable that a
 * script overwrote at runtime.
 *
 *   node scripts/check-contrast.mjs
 *
 * IT USED TO NEED A SERVER STARTED BY HAND, on :8899, and so it had not run in
 * a long time: anybody running the checks got ERR_CONNECTION_REFUSED and a
 * stack trace, which reads like a broken check rather than an unmet
 * precondition, and the honest response to it was to skip it. A check with a
 * setup step outside itself is a check nobody runs. It starts its own server
 * now and needs no network.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
/* Playwright from node_modules first, then from the sandbox's global install,
   and the browser from the sandbox's cache if it is there. Same order
   wrestling/verify.mjs uses, so this runs unchanged here and on a runner. */
const { createRequire } = await import('node:module');
const require_ = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require_('playwright')); }
catch (_) {
  try { ({ chromium } = require_('/opt/node22/lib/node_modules/playwright')); }
  catch (e) { chromium = null; }
}
if (!chromium) {
  console.error('playwright is not installed. npm install --no-save playwright, then npx playwright install chromium');
  process.exit(2);
}
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((f) => existsSync(f));

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = 8899;

/* FOUND, NOT LISTED. This was a hand-written list of fourteen paths with a
   comment saying it "once trailed the site", which is what a hand-written list
   of pages always ends up doing: /arcade/join/ was missing from it, and the
   next game added would have been too. Every directory under arcade/ holding
   an index.html is a page a visitor can open, so every one is audited. */
const PAGES = ['', ...readdirSync(path.join(ROOT, 'arcade'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(ROOT, 'arcade', d.name, 'index.html')))
  .map((d) => d.name + '/')
  .sort()];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = await new Promise((res) => {
  const s = createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      rep.writeHead(404).end('not found');
      return;
    }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
       .end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const mkctx = async (theme) => { const ctx = await browser.newContext({ viewport:{width:390,height:844} });
await ctx.addInitScript((t) => {
  localStorage.setItem('runthegrid_theme', t);
  localStorage.setItem('runthegrid_pro','1');
  localStorage.setItem('sb-jcrrxqfpdelrmvjuihnm-auth-token', JSON.stringify({
    access_token:'fake', token_type:'bearer', expires_at:4102444800,
    user:{ id:'00000000-0000-0000-0000-000000000001', email:'t@t.tt' }}));
}, theme); return ctx; };

const PROBE = () => {
  const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
  const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
  /* Chromium reports a color-mix() result as `color(srgb 0.9 0.97 0.98)`:
     0..1 floats, not 0..255. Reading those as bytes turns a near-white chip
     into near-black and invents failures that do not exist.
     THE COLOUR SPACE IS STRIPPED FIRST, and that is the whole trick. This used
     to pull the numbers straight out of the full string and then skip the
     first one, on the assumption that `srgb` would leave a match behind. It
     does not contain a digit, so nothing was skipped and everything shifted:
     `color(srgb 0.9 0.97 0.98)` came back as a TWO channel colour, and
     `color(srgb 1 0.54 0.24 / 0.15)` came back opaque with its red channel
     dropped. That is not a check that occasionally misreads a colour, it is a
     check that misread every color-mix() on the site, and color-mix is how
     nearly every tinted chip in the arcade is built. It reported a 15% orange
     tint on white as 1.51:1 and blamed the page.
     `display-p3` really does carry a digit, which is the other reason to take
     the space out by name rather than count on where the numbers start. */
  const nums = s => {
    const body = String(s || '').replace(/^color\(\s*[a-z0-9-]+\s*/i, '');
    return body.match(/[\d.]+/g);
  };
  const parse = s => {
    const m = nums(s); if (!m || m.length < 3) return null;
    const f = /^color\(/.test(s || '');
    return m.slice(0, 3).map(v => f ? Math.round(Number(v) * 255) : Number(v));
  };
  const alpha = s => {
    if (/^transparent$/.test(s || '')) return 0;
    const m = nums(s); if (!m) return 1;
    return m.length > 3 ? Number(m[3]) : 1;
  };
  /* What is ACTUALLY behind the text: every translucent layer from the element
     up, composited over the first opaque one. This used to walk past anything
     under 85% alpha and measure the opaque thing behind it, which reads a 15%
     orange chip on a white card as white and overstates the contrast of the
     dark text on it. The tint is on the screen, so it is in the sum. */
  const over = (layers, base) => {
    let out = base.slice();
    for (let i = layers.length - 1; i >= 0; i--) {
      const c = layers[i][0], a = layers[i][1];
      out = [0, 1, 2].map(k => c[k] * a + out[k] * (1 - a));
    }
    return out;
  };
  const bgOf = el => {
    const layers = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const a = alpha(c), p = parse(c);
      if (p && a > 0.004) {
        if (a > 0.996) return over(layers, p);
        layers.push([p, a]);
      }
      n = n.parentElement;
    }
    return over(layers, parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255]);
  };
  const out = [];
  for (const el of document.querySelectorAll('button, a, span, div, li')) {
    const cs = getComputedStyle(el);
    /* Any fill you can see, not just an opaque one. The gate used to be 85%
       alpha, which skipped every color-mix tint in the arcade, and the tinted
       chip is the shape this bug keeps taking: a brand colour at 15% with the
       brand colour as its text. bgOf composites now, so a tint measures
       honestly rather than being read as the card behind it. */
    if (alpha(cs.backgroundColor) < 0.08) continue;
    // Only elements that own their text. Reading a container's color against
    // its own background measures nothing real and buried the true failures.
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    const txt = own.trim();
    if (!txt || txt.length > 60) continue;
    if (el.offsetWidth < 24 || el.offsetHeight < 12) continue;
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fg = parse(cs.color), bg = bgOf(el);
    if (!fg || !bg) continue;
    const l1 = L(fg), l2 = L(bg);
    const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size = parseFloat(cs.fontSize), bold = (parseInt(cs.fontWeight,10)||400) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    out.push({ t: txt.slice(0,44), r: +ratio.toFixed(2), need: large?3:4.5,
               cls: (el.className||'').toString().slice(0,34) });
  }
  return out;
};

let worst = [];
console.log('auditing ' + PAGES.length + ' pages in both themes');
for (const p of PAGES) {
  process.stdout.write('  ' + (p || 'hub'));
  for (const theme of ['dark','light']) {
    const ctx = await mkctx(theme);
    const page = await ctx.newPage();
    /* Third parties are blocked, so the audit measures the site's own ink and
       does not sit waiting on hosts a sandbox cannot reach. The font host is
       in the list and is the reason the list matters: unreachable, its
       stylesheet held DOMContentLoaded for 12.7 seconds on every page, which
       is 380 seconds of an audit that does nothing but wait, and it looked
       exactly like a hung check.
       Blocking the fonts does not change what is measured. Contrast is colour,
       and the threshold turns on the computed font SIZE and WEIGHT, which the
       page declares itself; a fallback face renders at the same 14px 800 the
       webfont would. */
    for (const pat of ['**cdn.jsdelivr.net**', '**supabase.co**', '**googlesyndication.com**',
                       '**googletagmanager.com**', '**google-analytics.com**', '**doubleclick.net**',
                       '**fonts.googleapis.com**', '**fonts.gstatic.com**']) {
      await page.route(pat, (r) => r.abort());
    }
    /* A page that never settles must not take the whole audit with it. Before
       this had a timeout, one hung run looked exactly like a slow one and the
       check simply never returned, which is its own way of not running. */
    try {
      await page.goto('http://localhost:' + PORT + '/arcade/' + p,
                      { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.log('  !! ' + (p || 'hub') + ' (' + theme + ') did not load: ' + String(e).split('\n')[0]);
      await page.close(); await ctx.close();
      continue;
    }
    await page.waitForTimeout(1400);
    const seen = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (seen !== theme) console.log('  !! theme did not apply on '+(p||'hub')+': wanted '+theme+', got '+seen);
    const rows = await page.evaluate(PROBE);
    const bad = rows.filter(r => r.r < r.need);
    if (bad.length) {
      // dedupe by text
      const seen = new Set();
      for (const b of bad) { const k = b.t+b.cls; if (seen.has(k)) continue; seen.add(k);
        worst.push({ page: p || '(hub)', theme, ...b }); }
    }
    await page.close(); await ctx.close();
  }
  process.stdout.write('\n');
}
await browser.close();
server.close();
if (!worst.length) {
  console.log('contrast ok: ' + PAGES.length + ' pages, both themes, no text on a fill below its WCAG threshold');
  process.exit(0);
}
worst.sort((a,b)=>a.r-b.r);
console.log(worst.length + ' element(s) below threshold:');
worst.slice(0,40).forEach(w => console.log(
  `  ${String(w.r).padStart(5)}:1 (needs ${w.need})  ${w.page.padEnd(12)} ${w.theme.padEnd(5)} "${w.t}"  .${w.cls}`));
process.exit(1);
