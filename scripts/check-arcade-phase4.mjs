/* Phase 4 of the arcade brief: the rules every screen has to keep.
 *
 *   node scripts/check-arcade-phase4.mjs              all of it
 *   node scripts/check-arcade-phase4.mjs --report     list every finding, exit 0
 *   node scripts/check-arcade-phase4.mjs hub career   only those pages
 *
 * Every page (the hub and the twelve games) is opened in BOTH themes, on a
 * 375px phone and a 1280px desktop, and on a phone again with the "?" sheet
 * open, and measured for:
 *
 *   contrast   WCAG AA for every piece of visible text, against what is really
 *              behind it (every translucent layer composited over the first
 *              opaque one). 4.5:1, or 3:1 for large text (24px, or 18.66px
 *              bold). A disabled control is exempt, as WCAG exempts it.
 *   text       16px for body text. Body text is a run of five or more words:
 *              a sentence somebody reads. A label, a chip, a button's two
 *              words, a number, a heading, an uppercase eyebrow or the site
 *              footer's small print is not body text and is not held to it.
 *              (Sizes are read where the text is, so a 13px sentence
 *              inside a 16px card still fails.)
 *   taps       on a phone, every control answers a tap across 44px in both
 *              directions (a crossword key is held to 44 tall only: ten
 *              across a 375px phone cannot be 44 wide), measured with
 *              elementFromPoint from its centre, so
 *              an invisible hit area (a ::after reaching out) counts and a
 *              neighbour sitting on top of it does not.
 *   shift      the page does not move under the reader after it first paints:
 *              cumulative layout shift from the browser's own layout-shift
 *              entries over the first three seconds, under 0.01. Measured
 *              for a cardholder and again for a free account.
 *   motion     with prefers-reduced-motion: reduce, nothing on the page is
 *              moving, scaling or sliding. An opacity fade is allowed (WCAG
 *              2.3.3 is about motion, and a fade is not motion).
 *
 * Offline: every request off the site is refused by the harness.
 */
import { serve, launch, page, reporter, GAMES } from './lib/arcade-harness.mjs';

const args = process.argv.slice(2);
const REPORT = args.includes('--report');
const only = args.filter(a => !a.startsWith('--'));
const PAGES = ['hub', ...GAMES].filter(p => !only.length || only.includes(p));
const R = reporter();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TIME = new Date('2026-10-02T12:00:00');

const PROBE = (opts) => {
  const out = { contrast: [], text: [], taps: [] };
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const nums = s => String(s || '').replace(/^color\(\s*[a-z0-9-]+\s*/i, '').match(/[\d.]+/g);
  const parse = s => { const m = nums(s); if (!m || m.length < 3) return null; const f = /^color\(/.test(s || ''); return m.slice(0, 3).map(v => f ? Math.round(+v * 255) : +v); };
  const alpha = s => { if (/^transparent$/.test(s || '')) return 0; const m = nums(s); if (!m) return 1; return m.length > 3 ? +m[3] : 1; };
  const over = (layers, base) => { let o = base.slice(); for (let i = layers.length - 1; i >= 0; i--) { const [c, a] = layers[i]; o = [0, 1, 2].map(k => c[k] * a + o[k] * (1 - a)); } return o; };
  /* What is behind the text. A gradient is not skipped: the page ground on
     every arcade page is one (a faint stage light), and skipping it would
     leave every line of text on the page unchecked. So each colour stop of
     a gradient is composited as its own candidate and the WORST candidate is
     the one the text is held to. Only a real image (url) is skipped. */
  const stopsOf = img => (img.match(/(rgba?\([^)]*\)|color\([^)]*\))/g) || []).map(c => [parse(c), alpha(c)]).filter(x => x[0]);
  const bgOf = el => {
    const layers = []; let n = el, img = false, grads = [];
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const bi = cs.backgroundImage || 'none';
      if (/url\(/.test(bi)) img = true;
      else if (/gradient/.test(bi)) {
        const stops = stopsOf(bi);
        // a gradient with no see-through stop is the ground: nothing under it shows
        if (stops.length && stops.every(st => st[1] > 0.996)) return { bgs: stops.map(st => over(layers, st[0])), img };
        grads.push({ depth: layers.length, stops });
      }
      const c = cs.backgroundColor, a = alpha(c), p = parse(c);
      if (p && a > 0.004) { if (a > 0.996) return { bgs: cands(layers, p, grads), img }; layers.push([p, a]); }
      n = n.parentElement;
    }
    const b = parse(getComputedStyle(document.body).backgroundColor) || parse(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255];
    return { bgs: cands(layers, b, grads), img };
  };
  // the plain stack, plus one candidate per gradient stop laid in at its depth
  const cands = (layers, base, grads) => {
    const out = [over(layers, base)];
    for (const g of grads) for (const st of g.stops) {
      const L2 = layers.slice(0, g.depth).concat([st], layers.slice(g.depth));
      out.push(over(L2, base));
    }
    return out;
  };
  const shown = el => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight * 3;
  };
  const label = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = (el.className && el.className.baseVal == null ? String(el.className) : '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (c.length) s += '.' + c.join('.');
    return s;
  };
  // every element that owns visible text
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const txt = t.nodeValue.replace(/\s+/g, ' ').trim();
    if (!txt || !/[A-Za-z0-9]/.test(txt)) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) continue;
    seen.add(el);
    if (!shown(el)) continue;
    if (el.closest('[aria-hidden="true"], svg')) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize), bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    // whole sentence the element carries (its own text plus inline children)
    const full = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const words = full.split(' ').filter(w => /[A-Za-z]/.test(w)).length;
    const disabled = el.closest('button:disabled, [aria-disabled="true"], input:disabled');
    if (!disabled) {
      const fg = parse(cs.color), fa = alpha(cs.color) * (+cs.opacity || 1);
      const { bgs, img } = bgOf(el);
      if (fg && bgs && !img) {
        let r = Infinity;
        for (const bg of bgs) {
          const f = fa < 1 ? fg.map((v, k) => v * fa + bg[k] * (1 - fa)) : fg;
          const l1 = L(f), l2 = L(bg); r = Math.min(r, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
        }
        const large = fs >= 24 || (fs >= 18.66 && bold);
        const need = large ? 3 : 4.5;
        if (r < need - 0.005) out.contrast.push({ el: label(el), t: txt.slice(0, 40), r: +r.toFixed(2), need });
      }
    }
    // Not body text: a heading, the site footer's small print, or an uppercase
    // eyebrow (a label set in capitals with tracking is read as a label).
    const notBody = el.closest('button, a, label, summary, .chip, input, select, textarea, h1, h2, h3, h4, h5, h6, footer, .foot, .gjfoot')
      || cs.textTransform === 'uppercase';
    if (words >= 5 && fs < 15.5 && !notBody) {
      // the run has to be the element's own sentence, not a container of other runs
      const inlineOnly = [...el.children].every(c => /^(B|STRONG|EM|I|SPAN|A|SMALL|CODE|BR|SUP|SUB|S|U|MARK|KBD|ABBR|TIME)$/.test(c.tagName) && getComputedStyle(c).display.startsWith('inline'));
      if (inlineOnly) out.text.push({ el: label(el), t: full.slice(0, 50), px: +fs.toFixed(1) });
    }
  }
  if (opts.taps) {
    const ctl = document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], label[for], [onclick]');
    for (const el of ctl) {
      if (!shown(el) || el.disabled) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      const b = el.getBoundingClientRect();
      if (b.top < 0 || b.bottom > innerHeight) continue;   // only what is on screen right now
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const mine = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h) || (h.closest && h.closest('label') === el)); };
      if (!mine(cx, cy)) continue;                           // covered by something else on purpose
      let up = 0, dn = 0, lf = 0, rt = 0;
      while (up < 30 && mine(cx, cy - up - 1)) up++; while (dn < 30 && mine(cx, cy + dn + 1)) dn++;
      while (lf < 30 && mine(cx - lf - 1, cy)) lf++; while (rt < 30 && mine(cx + rt + 1, cy)) rt++;
      const h = up + dn + 1, w = lf + rt + 1;
      // an inline link inside a sentence is exempt (WCAG 2.5.8 inline exception)
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /[a-z]{3}/i.test((el.parentElement.textContent || '').replace(el.textContent, ''));
      // The one exception, and it is about arithmetic rather than taste: ten
      // keyboard keys across a 375px phone are 37px each with their gaps, so
      // a key cannot be 44 wide. Its hit area takes the whole gap around it
      // instead, and it is still held to 44 tall.
      const kbKey = el.matches('.krow .key');
      if ((h < 43 || (w < 43 && !kbKey)) && !inline) out.taps.push({ el: label(el), t: (el.textContent || el.getAttribute('aria-label') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 30), h, w });
    }
  }
  return out;
};

const MOTION = () => {
  const moving = [];
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running') continue;
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
    if (!t.duration || t.duration < 1) continue;
    let props = [];
    try { props = a.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !/^(offset|easing|composite|computedOffset)$/.test(k)); } catch (e) {}
    if (a.transitionProperty) props.push(a.transitionProperty);
    const moves = props.filter(p => !/^(opacity|color|background|backgroundColor|border|borderColor|boxShadow|fill|stroke|filter|visibility)/i.test(p));
    if (!moves.length) continue;
    const tg = a.effect && a.effect.target;
    moving.push({ el: tg ? (tg.tagName ? tg.tagName.toLowerCase() : '') + (tg.id ? '#' + tg.id : '') + (tg.className && typeof tg.className === 'string' ? '.' + tg.className.trim().split(/\s+/)[0] : '') : '?',
                  name: a.animationName || a.transitionProperty || 'js', props: [...new Set(moves)].join(',') });
  }
  return moving;
};

const { srv, base } = await serve();
const br = await launch();
const all = { contrast: [], text: [], taps: [], shift: [], motion: [] };

async function open(pg, theme, phone, reduce, tier) {
  const { ctx, p } = await page(br, base, { tier: tier || 'card', mobile: phone, vp: phone ? { width: 375, height: 740 } : { width: 1280, height: 900 }, time: TIME });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('runthegrid_theme', t); } catch (e) {}
    window.__cls = 0;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  }, theme);
  if (reduce) await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(base + '/arcade/' + (pg === 'hub' ? '' : pg + '/'), { waitUntil: 'load' });
  await sleep(3000);
  return { ctx, p };
}
const add = (kind, pg, theme, view, rows) => { for (const r of rows) all[kind].push({ pg, theme, view, ...r }); };

async function one(pg) {
  for (const theme of ['dark', 'light']) {
    for (const phone of [true, false]) {
      const view = phone ? '375' : '1280';
      const { ctx, p } = await open(pg, theme, phone, false);
      const cls = await p.evaluate(() => window.__cls);
      if (cls >= 0.01) add('shift', pg, theme, view, [{ cls: +cls.toFixed(3) }]);
      const r = await p.evaluate(PROBE, { taps: phone });
      add('contrast', pg, theme, view, r.contrast); add('text', pg, theme, view, r.text); add('taps', pg, theme, view, r.taps);
      if (phone && pg !== 'hub') {
        // the "?" sheet
        const q = await p.$('#rtgHowtoBtn');
        if (q) {
          await q.click(); await sleep(500);
          const s = await p.evaluate(PROBE, { taps: true });
          add('contrast', pg, theme, view + '?', s.contrast); add('text', pg, theme, view + '?', s.text); add('taps', pg, theme, view + '?', s.taps);
        }
      }
      await ctx.close();
    }
    // reduced motion, on a phone
    const { ctx, p } = await open(pg, theme, true, true);
    add('motion', pg, theme, '375', await p.evaluate(MOTION));
    await ctx.close();
  }
  // a free account sees things a cardholder does not (the free-play line on
  // a card game), so its first paint is held to the same rule
  for (const phone of [true, false]) {
    const { ctx, p } = await open(pg, 'dark', phone, false, 'free');
    const cls = await p.evaluate(() => window.__cls);
    if (cls >= 0.01) add('shift', pg, 'free', phone ? '375' : '1280', [{ cls: +cls.toFixed(3) }]);
    await ctx.close();
  }
  process.stdout.write('  ' + pg + '\n');
}
// four pages at a time: each one mostly waits out its three seconds of paint
const queue = PAGES.slice();
await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length) await one(queue.shift()); }));
await br.close(); srv.close();

// one line per distinct finding: the same element in four views is one problem
function uniq(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = key(r); const e = m.get(k); if (e) e.where.add(r.theme + '@' + r.view); else m.set(k, { ...r, where: new Set([r.theme + '@' + r.view]) }); }
  return [...m.values()];
}
const groups = {
  contrast: uniq(all.contrast, r => r.pg + r.el + r.t),
  text:     uniq(all.text, r => r.pg + r.el + r.t),
  taps:     uniq(all.taps, r => r.pg + r.el + r.t),
  shift:    uniq(all.shift, r => r.pg + r.view),
  motion:   uniq(all.motion, r => r.pg + r.el + r.name),
};
const show = { contrast: r => `${r.r}:1 (needs ${r.need})  ${r.el}  "${r.t}"`,
               text: r => `${r.px}px  ${r.el}  "${r.t}"`,
               taps: r => `${r.w}x${r.h}  ${r.el}  "${r.t}"`,
               shift: r => `CLS ${r.cls}`,
               motion: r => `${r.el}  ${r.name}  (${r.props})` };
for (const k of Object.keys(groups)) {
  R.section(k + ': ' + groups[k].length + ' finding(s)');
  const byPage = {};
  for (const g of groups[k]) (byPage[g.pg] = byPage[g.pg] || []).push(g);
  for (const pg of PAGES) {
    const list = byPage[pg] || [];
    if (REPORT) list.forEach(g => console.log(`  ${pg.padEnd(13)} ${show[k](g)}   [${[...g.where].join(' ')}]`));
    R.ok(REPORT || !list.length, `${pg}: ${k}`, list.slice(0, 6).map(show[k]).join('\n       '));
  }
}
console.log(REPORT ? '\nreport done' : (R.fails() ? `\n${R.fails()} page/rule pair(s) fail` : '\nphase 4 holds'));
process.exit(REPORT ? 0 : (R.fails() ? 1 : 0));
