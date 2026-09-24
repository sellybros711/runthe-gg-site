/* Run The Diamond in both themes.
 *
 *   node baseball/check-theme.mjs
 *
 * A DARK MODE RETROFITTED ONTO A LIGHT PAGE FAILS SILENTLY, three different ways,
 * and none of them throws:
 *
 *   a panel nobody tokenised stays cream on a charcoal page. Its text is dark on
 *   cream and passes every contrast rule there is. It is simply the wrong colour
 *   for the page it is on, and no contrast probe can see that.
 *
 *   a hairline written rgba(0,0,0,.10) stops existing. The border still renders,
 *   at an alpha nobody can distinguish from the panel behind it, so every card on
 *   the screen quietly loses its edge.
 *
 *   an accent solved against cream goes unreadable. #1a5276 is a fine link on
 *   paper and 2.1:1 on charcoal.
 *
 * So this measures all three, on the real screens, in a real browser, in both
 * themes. It is the arcade's scripts/check-contrast.mjs idea with two claims it
 * does not make, because that one walks pages that are a single load and this game
 * keeps most of itself behind a draft.
 *
 * AND IT GUARDS THE LIGHT THEME, which is the half most easily lost: the whole
 * point of --edge carrying channels rather than finished colours is that the light
 * page is byte for byte what it was. Section 4 asserts that from both ends.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const { createRequire } = await import('node:module');
const require_ = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require_('playwright')); }
catch (_) { try { ({ chromium } = require_('/opt/node22/lib/node_modules/playwright')); } catch (e) { chromium = null; } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((f) => existsSync(f));

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = 8901;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
/* Its own server, for check-contrast.mjs's reason: a check with a setup step
   outside itself is a check nobody runs. */
const server = await new Promise((res) => {
  const s = createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { rep.writeHead(404).end('no'); return; }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});

let fails = 0, checks = 0;
const ok = (msg) => { checks++; console.log('  ok    ' + msg); };
const bad = (msg, detail) => { checks++; fails++; console.log('  FAIL  ' + msg); if (detail) console.log('        ' + detail); };
const claim = (cond, msg, detail) => cond ? ok(msg) : bad(msg, detail);

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

/* ─── the measurement, run inside the page ─── */
const PROBE = () => {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  /* The colour space is stripped first: Chromium reports color-mix() as
     `color(srgb 0.9 0.97 0.98)`, 0..1 floats rather than bytes, and reading those
     as bytes turns a near-white chip into near-black. check-contrast.mjs's note. */
  const nums = (s) => String(s || '').replace(/^color\(\s*[a-z0-9-]+\s*/i, '').match(/[\d.]+/g);
  const parse = (s) => { const m = nums(s); if (!m || m.length < 3) return null;
    const f = /^color\(/.test(s || ''); return m.slice(0, 3).map((v) => (f ? Math.round(Number(v) * 255) : Number(v))); };
  const alpha = (s) => { if (/^transparent$/.test(s || '')) return 0; const m = nums(s); if (!m) return 1;
    return m.length > 3 ? Number(m[3]) : 1; };
  /* What is ACTUALLY behind the text: every translucent layer composited down to
     the first opaque one, so a tint measures as the tint rather than as the card
     under it. */
  const over = (layers, base) => {
    let out = base.slice();
    for (let i = layers.length - 1; i >= 0; i--) {
      const c = layers[i][0], a = layers[i][1];
      out = [0, 1, 2].map((k) => c[k] * a + out[k] * (1 - a));
    }
    return out;
  };
  /* A GRADIENT HAS AN ALPHA TOO, and the first draft of this read one as opaque:
     it averaged the stops of `linear-gradient(135deg,rgba(184,134,11,.10),
     rgba(184,134,11,.02))` into a solid gold, so the daily card's gold eyebrow
     measured 1:1 against a fill that is really a 6% tint over the page. Four
     failures, in BOTH themes, all invented. Stops carry their alpha into the
     layer stack like any other translucent paint. */
  const gradOf = (s) => {
    const st = (String(s || '').match(/rgba?\([^)]*\)/g) || []);
    const cols = st.map(parse).filter(Boolean);
    if (!cols.length) return null;
    const al = st.map(alpha);
    return [cols.reduce((a, c) => [0, 1, 2].map((k) => a[k] + c[k] / cols.length), [0, 0, 0]),
      al.reduce((a, x) => a + x, 0) / al.length];
  };
  const bgOf = (el) => {
    const layers = []; let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const g = /gradient/.test(cs.backgroundImage) ? gradOf(cs.backgroundImage) : null;
      if (g) { if (g[1] > 0.996) return over(layers, g[0]); if (g[1] > 0.004) layers.push(g); }
      const c = cs.backgroundColor, a = alpha(c), p = parse(c);
      if (p && a > 0.004) { if (a > 0.996) return over(layers, p); layers.push([p, a]); }
      n = n.parentElement;
    }
    return over(layers, parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255]);
  };

  const text = [], surfaces = [], borders = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (!el.offsetWidth || !el.offsetHeight) continue;

    /* CONTRAST: only elements that own their own text. Reading a container's
       colour against its own background measures nothing real. */
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    const txt = own.trim();
    if (txt && txt.length <= 60 && el.offsetWidth >= 24 && el.offsetHeight >= 12 && Number(cs.opacity) > 0.55) {
      const fg = parse(cs.color), bg = bgOf(el);
      if (fg && bg) {
        const r = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05);
        const size = parseFloat(cs.fontSize), bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        text.push({ t: txt.slice(0, 40), r: +r.toFixed(2), need: large ? 3 : 4.5,
          cls: (el.className || '').toString().slice(0, 36) });
      }
    }

    /* SURFACES: a box big enough to read as a panel, painting its own opaque fill. */
    if (el.offsetWidth >= 90 && el.offsetHeight >= 26) {
      let fill = null;
      if (alpha(cs.backgroundColor) > 0.9) fill = parse(cs.backgroundColor);
      else if (/gradient/.test(cs.backgroundImage)) {
        const g = gradOf(cs.backgroundImage);
        if (g && g[1] > 0.9) fill = g[0];
      }
      if (fill) surfaces.push({ lum: +L(fill).toFixed(3), rgb: fill.map(Math.round).join(','),
        cls: (el.className || '').toString().slice(0, 40), id: el.id || '' });
    }

    /* BORDERS: the edge --edge is supposed to paint, on a named handful of panels.
       Asking every translucent border on the page is the version that does not
       work: the reel's band and the empty position disc are drawn against their
       OWN dark or cream fill rather than against the page, so they are correctly
       white in the light theme and correctly black in the dark one, and a count
       over the lot cannot tell those apart from a swap that was missed. */
    const bc = cs.borderTopColor;
    if (parseFloat(cs.borderTopWidth) > 0 && alpha(bc) > 0.02 && alpha(bc) < 0.6) {
      const p = parse(bc);
      if (p) borders.push({ white: p[0] > 200 && p[1] > 200 && p[2] > 200,
        black: p[0] < 40 && p[1] < 40 && p[2] < 40, cls: (el.className || '').toString().slice(0, 36),
        panel: ['tile', 'lineupcard', 'hdr-btn', 'sbtn', 'modecard'].some((c) => el.classList.contains(c)) });
    }
  }
  return { text, surfaces, borders };
};

/* ─── driving the game ─── */
async function open(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem('runthegrid_theme', t); } catch (e) {} }, theme);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  /* Nothing third party resolves in the sandbox, and a hung analytics request is
     not this file's subject. */
  await page.route('**', (r) => (/^http:\/\/127\.0\.0\.1|^http:\/\/localhost/.test(r.request().url())
    ? r.continue() : r.abort()));
  await page.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}
const dismiss = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /played before/i.test(x.textContent));
  if (b) b.click();
});
async function draft(page, picks, onBoard) {
  await dismiss(page);
  await page.evaluate(() => document.querySelector('#b-start').click());
  await page.waitForTimeout(1100);
  await dismiss(page);
  for (let i = 0; i < picks; i++) {
    /* Wait for a board that can be signed off rather than sleeping past the reels:
       .tile.off has no handler, and a sheet still open swallows the click. */
    try {
      await page.waitForFunction(() => !!document.querySelector('#opts .tile:not(.off)')
        && !document.querySelector('#sheet-pos.on'), null, { timeout: 15000 });
    } catch (_) { return false; }
    /* THE BOARD ITSELF, WHILE IT IS UP. A full twelve finishes the draft and hands
       off to the squad screen, so a probe placed after this loop has never once
       read a tile: the black-name buttons shipped dark for a player to report
       while section 3 was green, because the tile's ink was collected on NO run.
       Mid-draft is the only moment the board exists to be read. */
    if (onBoard) { await page.waitForTimeout(i === 0 ? 300 : 0); await onBoard(i); }
    await page.evaluate(() => document.querySelector('#opts .tile:not(.off)').click());
    await page.waitForTimeout(420);
    await page.evaluate(() => { const o = document.querySelector('#sheet-pos.on .pos-opt'); if (o) o.click(); });
    await page.waitForTimeout(420);
  }
  /* WAIT FOR THE BOARD, never for a clock. The draft loop ends the moment the last
     signing lands and the reels then spin for as long as they spin, so a sleep here
     leaves the walk looking at a screen with no tiles on it. Section 2 read 14
     surfaces that way against the 26 that are really there, which is a coverage
     floor measuring the harness. */
  try {
    await page.waitForFunction(() => document.querySelectorAll('#opts .tile').length > 0,
      null, { timeout: 15000 });
  } catch (_) { /* a full twelve finishes the draft, and then there is no board. */ }
  await page.waitForTimeout(600);
  return true;
}

/* ═══ 1. the theme is honoured, and the toggle sticks ═══ */
console.log('\n1. The theme boots from the shared key and the toggle sticks');
{
  for (const t of ['dark', 'light']) {
    const { ctx, page, errs } = await open(t);
    const got = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    claim(got === t, `a stored '${t}' boots the page in ${t}`, `read back ${got}`);
    claim(!errs.length, `no page error booting ${t}`, errs.join(' | '));
    await ctx.close();
  }
  /* NO INIT SCRIPT ON THIS ONE. addInitScript runs on every document, so a context
     that pins the key would re-pin it during the reload and the persistence claim
     would be measuring the harness. The first draft did exactly that and reported
     the page losing a choice it had stored correctly. */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**', (r) => (/^http:\/\/127\.0\.0\.1|^http:\/\/localhost/.test(r.request().url())
    ? r.continue() : r.abort()));
  await page.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem('runthegrid_theme', 'light'); } catch (e) {} });
  await page.evaluate(() => document.querySelector('#b-theme').click());
  const after = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('runthegrid_theme'),
    meta: document.querySelector('#themeMeta').getAttribute('content'),
  }));
  claim(after.attr === 'dark', 'pressing it switches the page', after.attr);
  claim(after.stored === 'dark', 'and writes the key the whole suite shares', after.stored);
  /* The meta tag is most of what a dark mode is asked for on a phone: left cream
     it is a bright bar above a dark page. */
  claim(/#14171c/i.test(after.meta), 'and moves theme-color with it', after.meta);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const kept = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  claim(kept === 'dark', 'and it survives a reload', kept);
  await ctx.close();
}

/* ═══ 2. nothing stayed light ═══ */
console.log('\n2. No surface stayed light in the dark theme');
{
  const { ctx, page, errs } = await open('dark');
  const seen = [];
  const sweep = async (label) => {
    const { surfaces } = await page.evaluate(PROBE);
    /* 0.45 is a long way above any charcoal and a long way below any cream, so
       nothing lands near the line by accident. */
    /* THE BALL IS THE ONE LIGHT SURFACE ALLOWED AT NIGHT, and it is exempt by name
       rather than by luminance. The draft button is a close crop of a baseball, and
       a baseball is white under lights: it belongs with the field's green and the
       club plates on the list of things that are the SPORT rather than the page,
       so inverting it would draw a charcoal ball, which is not a thing.
       An exemption on its own is a hole, so section 4 carries the other half and
       asserts the hide and the lace are the SAME colour in both themes. That pair
       is what tells a deliberate sport colour from a surface nobody tokenised:
       an unconverted panel would be light here AND light there for no reason
       anybody wrote down. */
    /* THE CLUBBED REEL IS THE OTHER SPORT SURFACE, and it is stateful: the reel
       is painted in the drawn CLUB's own published colours once it lands, so on
       the draws that land a light club (Milwaukee's gold is rgb(255,197,47))
       this sweep reads a bright surface that is a fact about the Brewers rather
       than about the theme. Whether it fired depended on the draw, which is the
       shape section 4's `.tile:not(.hot)` reading had too, and there it turned
       out to be fixable by sampling the one board on which no tile can be hot.
       Here there is no such board: a light club is a light club whenever it is
       drawn, so this is an exemption rather than a sampling fix. The paint is inline from
       E.teamColors, the same table both themes read, so there is no second
       theme-varying copy for an identity claim to hold. */
    const light = surfaces.filter((s) => s.lum >= 0.45 && !/\bball\b/.test(s.cls)
      && !/\bclubbed\b|\bwash\b/.test(s.cls));
    const uniq = [...new Map(light.map((s) => [s.cls + '#' + s.id, s])).values()];
    claim(!uniq.length, `${label}: every surface is a dark-theme surface`,
      uniq.map((s) => `${s.cls || s.id} rgb(${s.rgb}) L=${s.lum}`).join('; '));
    seen.push(...surfaces);
  };
  await sweep('the front page');
  await draft(page, 6);
  await sweep('mid draft');
  /* Twelve finishes the draft, so this lands on the squad screen: a different set
     of panels, and the one the results cards are built out of. */
  await draft(page, 6);
  await sweep('a finished roster');
  /* --warm and --cool are the two surfaces that are not a panel: the win hero, the
     champion's row and a run scoring all wear the pale gold, and they carry --ink,
     so a dark theme that left them alone would put near-white type on cream. They
     are asserted here rather than measured on screen because reaching the results
     screen means playing a season, and a token that resolves light in the dark
     theme is the whole of the defect. */
  const two = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { warm: cs.getPropertyValue('--warm').trim(), cool: cs.getPropertyValue('--cool').trim() };
  });
  const darkStops = (s) => (s.match(/rgba?\([^)]*\)|#[0-9a-f]{6}/gi) || []).length > 0
    && !/rgb\(2[0-5][0-9]|#[ef]/i.test(s);
  claim(darkStops(two.warm), 'the good-outcome card is a dark gold at night', two.warm);
  claim(darkStops(two.cool), 'and the bad-outcome card is a dark slate', two.cool);
  /* Coverage is half the check: a sweep that found no surfaces would report the
     same clean pass as a page with nothing wrong. Measured at 26 across the two
     screens (the field, the card, the reels, the panels and a board of tiles), so
     a floor of 18 catches a walk that never reached the draft. */
  claim(seen.length >= 18, 'and it looked at enough of them to mean something', `${seen.length} surfaces`);
  claim(!errs.length, 'no page error through a draft in dark', errs.join(' | '));
  await ctx.close();
}

/* ═══ 3. contrast ═══
 *
 * WHAT FAILS HERE IS A REGRESSION, NOT AN ABSOLUTE, and that is deliberate.
 *
 * The light theme's accents predate every line of this work and several of them
 * are under 4.5:1 on their own: --gold is 2.40:1 on the page's cream, --leather
 * 3.53 and --green 3.79. Those are a palette somebody chose, and repainting the
 * brand colour of a live game is a design decision rather than a side effect of
 * adding a night mode, so this file REPORTS them and does not fail on them. It
 * would be the easiest thing in the world to "fix" them into a check that passes
 * and a game that looks like somebody else's.
 *
 * What the dark theme genuinely owns is the COMPARISON: an element that reads in
 * light and stops reading in dark is this work's defect, and a floor of 3:1 is
 * unreadable in anybody's theme. Both of those fail.
 */
console.log('\n3. The dark theme never reads worse than the light one');
{
  const by = {};
  for (const theme of ['dark', 'light']) {
    const { ctx, page } = await open(theme);
    const all = [];
    all.push(...(await page.evaluate(PROBE)).text);
    await draft(page, 12, async (i) => {
      if (i === 6) { await page.waitForTimeout(500); all.push(...(await page.evaluate(PROBE)).text); }
    });
    all.push(...(await page.evaluate(PROBE)).text);
    /* Keyed on the WORDS plus the rule, because the two runs are two drafts and
       the players are not the same; the chrome is. */
    by[theme] = new Map(all.map((x) => [x.cls + '|' + x.t, x]));
    claim(all.length > 120, `${theme}: read enough text to mean something`, `${all.length} elements`);
    await ctx.close();
  }
  const regressed = [], floor = [], both = [], lightOnly = [];
  for (const [k, d] of by.dark) {
    const l = by.light.get(k);
    if (d.r < 3) floor.push(d);
    if (!l) continue;
    if (l.r >= l.need && d.r < d.need) regressed.push({ d, l });
    else if (l.r < l.need && d.r < d.need) both.push(d);
    /* FAILS IN LIGHT AND PASSES IN DARK is its own bucket, and leaving it out was
       a hole that read like a clean page: `.dc-eye` is --gold at 2.4:1 on cream and
       fine on charcoal, so it fell through all three and the note printed 0. */
    else if (l.r < l.need) lightOnly.push({ d, l });
  }
  const one = (rows, f) => [...new Map(rows.map((r) => [f(r).cls, r])).values()];
  claim(!regressed.length, 'nothing that reads in light stops reading in dark',
    one(regressed, (x) => x.d).slice(0, 8).map((x) => `.${x.d.cls} ${x.l.r}:1 light to ${x.d.r}:1 dark "${x.d.t}"`).join('; '));
  claim(!floor.length, 'and nothing in dark is under 3:1',
    one(floor, (x) => x).slice(0, 8).map((x) => `${x.r}:1 .${x.cls} "${x.t}"`).join('; '));
  const pre = one(both, (x) => x), lo = one(lightOnly, (x) => x.l);
  console.log(`  note  ${pre.length + lo.length} rules under their floor in the LIGHT theme and not because`);
  console.log('        of this work. Reported, never failed on: see the header.');
  for (const x of pre.slice(0, 10)) console.log(`          .${x.cls || '(no class)'} ${x.r}:1 in both  "${x.t}"`);
  for (const x of lo.slice(0, 10)) console.log(`          .${x.l.cls || '(no class)'} ${x.l.r}:1 light, ${x.d.r}:1 dark  "${x.l.t}"`);
}

/* ═══ 4. the light theme did not move ═══ */
console.log('\n4. --edge flips, and only --edge');
{
  /* NAMED SELECTORS, NOT A COUNT. The first version filtered every translucent
     border on the page and asserted a total, which is a number that moves with
     whatever happened to be on screen: it read 22 edges in dark and 4 in light and
     could say nothing about whether that was a missed swap or a slower draft.
     Asking five selectors by name answers per selector, and a selector that is not
     there at all is its own failure rather than a smaller total. */
  /* Each of these really is an --edge border, which the first list was not:
     .modecard's edge is --blue at 34% and the first .sbtn on screen is the active
     one wearing --gold, so two of five were reporting an accent colour failing to
     be black. The :not() are what keep them off the selected state.

     AND `.tile` WAS A THIRD OF THOSE AND STAYED LATENT FOR A RELEASE, because unlike
     the other two its state is a coin flip on the draw. `.tile.hot` is a board's
     chemistry mark and paints its own green edge, and a tile can only be hot once
     there is somebody on the roster to have chemistry with, so the first board is
     never hot and the board this section reads sometimes is. Measured over 30 real
     drafts at this width: the first tile is hot on 17% of them, so the two arms of
     this comparison are looking at different states about ONE RUN IN FOUR. It went
     red on a change to the front page that never touched a tile, which is what the
     repo's own note about a band a sample cannot resolve is describing.

     A tile can also be `.off`, and that one is safe: an unaffordable tile is still
     an --edge border, at a different alpha, and only the channels are compared. */
  const SEL = ['.hdr-btn', '.btn.ghost', '.tile:not(.hot)', '.lineupcard', '.sbtn:not(.on)', '.tab:not(.on)'];
  const vals = {};
  for (const theme of ['dark', 'light']) {
    const { ctx, page } = await open(theme);
    await dismiss(page);
    /* The modes sheet, then a draft: between them every selector above is painted. */
    await page.evaluate(() => document.querySelector('#b-modes').click());
    await page.waitForTimeout(500);
    /* SAMPLED ON EVERY BOARD, KEEPING THE FIRST READING OF EACH SELECTOR rather
       than the last, and `.tile:not(.hot)` is the whole reason. A tile goes hot
       when the man on it would add chemistry to what is already signed, so by
       the fourth board every tile can be hot at once, the selector then matches
       nothing, and the claim fails reporting `dark undefined` about a page with
       nothing wrong with it. That is the flake this file has carried for
       months, and it is a fact about WHEN the reading was taken.
       The first board has nobody signed, so no tile on it can be hot: a reading
       taken there cannot go missing, whatever the draw does afterwards. */
    const seen = {};
    const grab = async () => {
      const got = await page.evaluate((sel) => {
        const out = {};
        for (const s of sel) { const el = document.querySelector(s);
          if (el && el.offsetWidth) out[s] = getComputedStyle(el).borderTopColor; }
        return out;
      }, SEL);
      for (const k of Object.keys(got)) if (seen[k] === undefined) seen[k] = got[k];
    };
    await grab();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await draft(page, 3, grab);
    await grab();
    vals[theme] = { ...seen, ...await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const g = (n) => cs.getPropertyValue(n).trim();
      /* The hide is read off the BUTTON rather than off :root, because what a
         reader sees is the painted fill and a token nothing reads flips just as
         happily as one everything reads. That is this section's own argument
         about --edge, applied to the pair that must NOT flip. */
      const b = document.querySelector('.btn.ball');
      const bs = b ? getComputedStyle(b) : null;
      return { _edge: g('--edge'), _hide: bs ? bs.backgroundColor : '', _lace: bs ? bs.color : '' };
    }) };
    await ctx.close();
  }
  claim(vals.light._edge === '0,0,0', 'light resolves --edge to black', vals.light._edge);
  claim(vals.dark._edge === '255,255,255', 'dark resolves it to white', vals.dark._edge);
  /* AND ONLY --edge, which is the half of this section's title that had nothing
     under it. The draft button is a baseball, so its hide and its lace are the
     SPORT and are the same colour on paper and at night. Section 2 excuses that
     button from the light-surface sweep; this is what stops the excuse covering a
     surface somebody simply forgot to convert. */
  claim(!!vals.light._hide && vals.light._hide === vals.dark._hide,
    'the ball is the same hide in both themes', `light ${vals.light._hide} / dark ${vals.dark._hide}`);
  claim(!!vals.light._lace && vals.light._lace === vals.dark._lace,
    'and the same lace red', `light ${vals.light._lace} / dark ${vals.dark._lace}`);
  /* THE REAL CLAIM IS ON PAINTED BORDERS, not on the token. A token nothing reads
     flips just as happily as one everything reads, which is how a sweep that missed
     half the file would pass a check written against :root alone. */
  const ch = (s) => { const m = String(s || '').match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  for (const s of SEL) {
    const l = ch(vals.light[s]), d = ch(vals.dark[s]);
    if (!l || !d) { bad(`${s} was painted in both themes`, `light ${vals.light[s]}, dark ${vals.dark[s]}`); continue; }
    claim(l.every((x) => x < 40) && d.every((x) => x > 200),
      `${s}: black edge on paper, white edge at night`, `light ${vals.light[s]} / dark ${vals.dark[s]}`);
  }
}

await browser.close();
server.close();
console.log(`\n${fails ? fails + ' of ' + checks + ' checks FAILED' : 'All ' + checks + ' checks passed.'}`);
process.exit(fails ? 1 : 0);
