/* The poll ticker, pinned along the bottom of the front page.
 *
 *   (node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_ticker.mjs
 *
 * Three things, and none of them can be checked by reading the CSS.
 *
 * WHERE IT ACTUALLY LANDS. `position:fixed` is only fixed to the viewport when no
 * ancestor has a transform, and `.screen.on` animates one: `animation-fill-mode:
 * both` keeps the final keyframe applied, and Chromium resolves that
 * `transform:none` to an identity matrix rather than to no transform at all. An
 * identity matrix still makes the ancestor the containing block, so the bar pinned
 * itself to the bottom of the intro SCREEN and sat 916px down an 844px phone,
 * which is to say off the bottom of it. Nothing about the rule that put it there
 * looked wrong. So this measures the rectangle rather than trusting the property.
 *
 * WHAT IT COVERS. A bar taken out of the flow covers whatever was under it. The
 * clearance is #s-intro's padding-bottom, and the only moment it matters is with
 * the page scrolled to the very bottom, which is exactly the state a screenshot
 * taken on load does not show.
 *
 * WHERE IT IS NOT. It belongs to the front page alone. That is enforced by it
 * being a child of #s-intro rather than by any code, which is worth an assertion
 * precisely because there is no code to read.
 */
import { chromium } from 'playwright';

const HOST = process.argv[2] || 'http://localhost:8081';
const EXTERNAL = /googlesyndication|googletagmanager|google-analytics|doubleclick|fonts\.googleapis|fonts\.gstatic|gstatic|supabase/;
const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function open(vp) {
  const p = await b.newPage({ viewport: vp });
  p.errs = [];
  await p.route('**/*', (r) => EXTERNAL.test(r.request().url()) ? r.abort() : r.continue());
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()); });
  await p.goto(HOST + '/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  /* The strip is empty until the team data lands and buildTicker() unhides it. */
  await p.waitForFunction(() => { const t = document.getElementById('h-ticker'); return t && !t.hidden; },
    { timeout: 30000 });
  await p.waitForTimeout(900);
  return p;
}

/* Phone and a small phone, where the mobile ad strip owns the bottom 54px, and a
   desktop where it does not. Both sides of that branch have to be right. */
for (const [label, vp] of [['phone 390', { width: 390, height: 844 }],
  ['small 320', { width: 320, height: 568 }],
  ['desktop 1440', { width: 1440, height: 900 }]]) {
  console.log('\n=== ' + label + ' ===');
  const p = await open(vp);

  const m = await p.evaluate(() => {
    const t = document.getElementById('h-ticker');
    const r = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    const strip = getComputedStyle(document.documentElement).getPropertyValue('--adstrip').trim();
    /* What --adstrip resolves to in pixels, which is what the bar must clear. */
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;height:var(--adstrip,0px);visibility:hidden';
    document.body.appendChild(probe);
    const adPx = probe.getBoundingClientRect().height;
    probe.remove();
    return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right,
      vw: innerWidth, vh: innerHeight, pos: cs.position, z: +cs.zIndex, strip, adPx };
  });

  ok('it is fixed to the viewport', m.pos === 'fixed', m.pos);
  /* THE ASSERTION THE BUG WOULD HAVE FAILED. Fixed to the wrong containing block
     still reports position:fixed; only the rectangle gives it away. */
  ok('and its rectangle is actually on screen', m.top >= 0 && m.bottom <= m.vh + 1,
    'top ' + m.top.toFixed(1) + ', bottom ' + m.bottom.toFixed(1) + ' of ' + m.vh);
  /* FLUSH TO THE EDGE WHILE THE AD SLOT IS EMPTY, which is nearly always: the
     units still carry placeholder slot ids and an ad blocker is the common case.
     --adstrip is space RESERVED for an ad, and sitting on top of reserved-but-empty
     space left the bar hovering a finger's width off the bottom of the screen. */
  ok('it is flush with the bottom edge while no ad is serving',
    Math.abs(m.vh - m.bottom) <= 1,
    'bottom ' + m.bottom.toFixed(1) + ' of ' + m.vh + ' (--adstrip ' + m.strip + ' reserved but empty)');
  ok('it spans the full width', m.left <= 0.5 && m.right >= m.vw - 0.5,
    m.left.toFixed(1) + '..' + m.right.toFixed(1) + ' of ' + m.vw);
  ok('it is under the ad strip, the rails and the sheets', m.z < 40, 'z ' + m.z);
  ok('and it is a bar, not a block', m.height > 20 && m.height < 48, m.height.toFixed(1) + 'px');

  /* SCROLLED TO THE BOTTOM, which is the only place the clearance matters. */
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(500);
  const clear = await p.evaluate(() => {
    const t = document.getElementById('h-ticker').getBoundingClientRect();
    const out = [];
    /* Everything on the front page that a player has to be able to read or press. */
    for (const sel of ['#b-play-intro', '#b-modes', '#b-lb-intro', '#b-how', '.hnote', '.legal']) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (r.bottom > t.top && r.top < t.bottom) out.push(sel + ' overlaps by ' + (r.bottom - t.top).toFixed(1) + 'px');
    }
    return out;
  });
  ok('nothing on the page ends up behind it', clear.length === 0, clear.join('; '));

  /* AND IT GETS OUT OF THE WAY OF AN AD THAT IS GENUINELY THERE. Nothing serves in
     a test, so the state is staged the way AdSense stages it: the strip stamps
     data-ad-status="filled" on its <ins>, which is the same signal the strip uses
     to decide whether to paint its own background. Below 1200px only, because
     that is the only width where the strip exists at all. */
  const stepped = await p.evaluate(() => {
    const ins = document.querySelector('.rtp-ad-mobile-bottom ins');
    if (!ins) return null;
    ins.setAttribute('data-ad-status', 'filled');
    const t = document.getElementById('h-ticker').getBoundingClientRect();
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;height:var(--adstrip,0px);visibility:hidden';
    document.body.appendChild(probe);
    const adPx = probe.getBoundingClientRect().height;
    probe.remove();
    ins.removeAttribute('data-ad-status');
    return { bottom: t.bottom, want: innerHeight - adPx, adPx };
  });
  if (stepped === null) {
    ok('no mobile ad strip at this width, so nothing to step over', m.adPx === 0, 'adstrip ' + m.adPx);
  } else {
    ok('it steps up over an ad that is actually serving',
      Math.abs(stepped.want - stepped.bottom) <= 1,
      'bottom ' + stepped.bottom.toFixed(1) + ', expected ' + stepped.want + ' (ad ' + stepped.adPx + 'px)');
  }

  ok('nothing logged', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: SS + 'ticker_' + label.split(' ')[0] + '.png' });
  await p.close();
}

console.log('\n=== it belongs to the front page alone ===');
{
  const p = await open({ width: 390, height: 844 });
  const seen = await p.evaluate(() => document.getElementById('h-ticker').getBoundingClientRect().height > 0);
  ok('shown on the front page', seen);
  /* Into the draft, which is a different screen. No code hides the bar: it stops
     being rendered because its parent screen stops being displayed, and a fixed
     child of a display:none parent is not laid out. */
  await p.evaluate(() => document.getElementById('b-play-intro').click());
  await p.waitForTimeout(1800);
  const gone = await p.evaluate(() => {
    const t = document.getElementById('h-ticker');
    return { onDraft: !!document.querySelector('#s-draft.on, #s-opts.on'),
      h: t.getBoundingClientRect().height, vis: getComputedStyle(t).display };
  });
  ok('gone the moment another screen takes over', gone.h === 0,
    'height ' + gone.h + ', display ' + gone.vis);
  ok('nothing logged', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await p.close();
}

await b.close();
console.log(bad ? ('\n' + bad + ' FAILURES') : '\nall clear');
process.exit(bad ? 1 : 0);
