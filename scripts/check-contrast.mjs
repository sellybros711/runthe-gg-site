/* Contrast audit for the arcade.
 *
 * Walks every page in BOTH themes and measures the real, COMPUTED contrast of
 * every element that paints its own text on a filled background. This is the
 * check that would have caught the 1.61:1 "Get Arcade Card" button: nothing in
 * the source looks wrong, because the fill came from a CSS variable that a
 * script overwrote at runtime.
 *
 * Needs a static server on :8899 from the repo root:
 *   python3 -m http.server 8899 &
 *   node scripts/check-contrast.mjs
 */
/* Walk every arcade page in BOTH themes and measure the real, computed
 * contrast of every element that paints text on a filled background.
 * This is the check that would have caught the 1.61:1 button. */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const PAGES = ['', 'match/', 'crossword/', 'guess/', 'table/',
               'oddone/', 'career/', 'rankit/', 'almamater/', 'highlow/', 'archive/'];

const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
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
  // Chromium reports color-mix() results as `color(srgb 0.9 0.97 0.98)` — 0..1
  // floats, not 0..255. Reading those as bytes turns a near-white chip into
  // near-black and invents failures that do not exist.
  const parse = s => {
    s = s || '';
    const m = s.match(/[\d.]+/g); if (!m) return null;
    if (/^color\(/.test(s)) return m.slice(1,4).map(v => Math.round(Number(v)*255));
    return m.slice(0,3).map(Number);
  };
  const alpha = s => {
    s = s || '';
    if (/^transparent$/.test(s)) return 0;
    const m = s.match(/[\d.]+/g); if (!m) return 1;
    if (/^color\(/.test(s)) return m.length > 4 ? Number(m[4]) : 1;
    return m.length > 3 ? Number(m[3]) : 1;
  };
  // walk up for the first opaque background behind an element
  const bgOf = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (alpha(c) > 0.85) { const p = parse(c); if (p) return p; }
      n = n.parentElement;
    }
    const p = parse(getComputedStyle(document.body).backgroundColor); return p || [255,255,255];
  };
  const out = [];
  for (const el of document.querySelectorAll('button, a, span, div, li')) {
    const cs = getComputedStyle(el);
    if (alpha(cs.backgroundColor) < 0.85) continue;      // only real fills
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
for (const p of PAGES) {
  for (const theme of ['dark','light']) {
    const ctx = await mkctx(theme);
    const page = await ctx.newPage();
    await page.goto('http://localhost:8899/arcade/'+p, { waitUntil:'domcontentloaded' });
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
}
await browser.close();
if (!worst.length) { console.log('PASS — no text-on-fill below its WCAG threshold on any page, either theme'); process.exit(0); }
worst.sort((a,b)=>a.r-b.r);
console.log('FAIL — '+worst.length+' element(s) below threshold:');
worst.slice(0,40).forEach(w => console.log(
  `  ${String(w.r).padStart(5)}:1 (needs ${w.need})  ${w.page.padEnd(12)} ${w.theme.padEnd(5)} "${w.t}"  .${w.cls}`));
process.exit(1);
