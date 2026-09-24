/* The front page: two designs, and the reel geometry underneath both.
 *
 *   node baseball/check-home.mjs
 *
 * THE PHONE AND THE DESKTOP ARE TWO DESIGNS RATHER THAN TWO SIZES OF ONE, which is
 * the clubhouse's own lesson in mythiball. What differs is the STAGE: a phone stacks
 * the two reels over the field because there is no room beside it, and a desktop
 * stands them either side of it. The name of the game is a caption under the picture
 * on both. What the two widths really disagree about is the DAILY: on a phone it is
 * the markup's own order, under the name, and on a desktop it leads, because it is
 * the offer with a clock on it and the only thing on this page that is different
 * today from yesterday.
 *
 * The order is CSS `order` over the phone's markup, so EVERY WAY THIS BREAKS IS
 * SILENT. A block that leaks under the breakpoint renders a perfectly good page in
 * the wrong order. A `display:contents` that stops applying puts the two reels back
 * above the field and leaves two empty side columns, and nothing throws. An element
 * added to the screen with no `order` lands at the very top, above the title, which
 * is also a page that renders.
 *
 * AND THE REEL IS THE ONE WITH TEETH. A reel box is three rows and the middle one is
 * the band the pick lands in, and until this pass that was six copies of the number
 * 38: the box height, the band's height and offset, the row height, the wash, and a
 * REEL_H in the script. The desktop draws a bigger reel, so the copies had to become
 * one `--reel-h`. Get that wrong and the reel spins perfectly, eases perfectly, lands
 * perfectly, and draws the highlight around the row above or below the pick. No error,
 * no wrong value anywhere, just a wheel that is lying about what it stopped on.
 *
 * So section 1 measures the landed face against its own band, at BOTH sizes, at the
 * instant the spin ends rather than on a wall clock: these reels spin on a loop, so a
 * fixed wait measures wherever the next spin has got to.
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
const PORT = 8903;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
/* Its own server, because a check with a setup step outside itself is a check
   nobody runs. */
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
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

/* Read out of the page, so the fixture cannot describe a stored daily the page
   has stopped recognising. */
const PAGE_SRC = readFileSync(path.join(ROOT, 'baseball', 'index.html'), 'utf8');
const DAILY_V = Number((/\bconst\s+DAILY_V\s*=\s*(\d+)/.exec(PAGE_SRC) || [])[1]);
if (!DAILY_V) { console.log('  FAIL  could not read DAILY_V out of index.html'); process.exit(1); }

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const errors = [];

/* The one-per-browser first-visit guide sits over the field as a modal. Every claim
   here is about the page a RETURNING visitor meets, which is the page. */
async function open(w, h, extra) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w}x${h}: ${e}`));
  await p.addInitScript((o) => {
    try {
      localStorage.setItem('rtd_seen_intro_v1', '1');
      if (o && o.played) {
        /* TWO THINGS THE PAGE ASKS OF A STORED DAILY, and this fixture got both
           wrong the day the daily moved to an Eastern rolling day. It wrote a
           UTC date, which is the next day's puzzle for four hours every night,
           and it carried no `v`, which the page reads as a record from before the
           migration and correctly discards. So the card came up on its OPEN state
           in the arm testing the PLAYED one, and what failed was the harness.
           The version is read out of the page rather than typed here, or the two
           drift again the next time it moves. */
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
          .format(new Date());
        localStorage.setItem('rtd_daily', JSON.stringify(
          { v: o.dailyV, date, n: 1, wins: 97, losses: 65, grid: 'xxox', madePlayoffs: true }));
      }
    } catch (_) {}
  }, { ...(extra || {}), dailyV: DAILY_V });
  await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  return { ctx, p };
}

const box = (p, sel) => p.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2),
           top: +r.top.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2), bottom: +r.bottom.toFixed(2) };
}, sel);

/* ══ 1. a pick lands in its own band, at every reel size ══════════════════════ */
head('1. THE LANDED FACE IS THE ONE IN THE BAND');

/* Read at the instant `hit` is written, which is the frame the spin ends on. The
   offset is compared against the reel's own row height rather than against a pixel
   count, because the whole point of --reel-h is that the geometry holds at any row. */
async function bandOffsets(w, h) {
  const { ctx, p } = await open(w, h);
  await p.evaluate(() => {
    window.__hits = [];
    for (const id of ['h-box-y', 'h-box-t']) {
      const b = document.getElementById(id);
      new MutationObserver(() => {
        if (!b.classList.contains('hit')) return;
        const land = b.querySelector('.reel-i.land');
        if (!land) return;
        const br = b.querySelector('.band').getBoundingClientRect();
        const lr = land.getBoundingClientRect();
        window.__hits.push({
          id,
          rh: parseFloat(getComputedStyle(b).getPropertyValue('--reel-h')),
          boxH: b.getBoundingClientRect().height,
          dTop: +(lr.top - br.top).toFixed(2),
          dH: +(lr.height - br.height).toFixed(2),
        });
      }).observe(b, { attributes: true, attributeFilter: ['class'] });
    }
  });
  await p.waitForFunction(() => window.__hits.length >= 4, null, { timeout: 45000 });
  const hits = await p.evaluate(() => window.__hits);
  await ctx.close();
  return hits;
}

const offsets = {};
for (const [label, w, h] of [['phone 390', 390, 844], ['desktop 1440', 1440, 900]]) {
  const hits = await bandOffsets(w, h);
  const rh = hits[0].rh;
  /* A row height has to come back at all: read as NaN the fallback is silently in
     charge and a later --reel-h would move the box and not the maths. */
  claim(rh > 0 && hits.every((x) => x.rh === rh),
    `${label}: the reel reports one row height (${rh}px)`,
    JSON.stringify(hits.map((x) => x.rh)));
  /* Three rows by construction. This is what makes the band and the landing agree
     without either being written down. */
  claim(hits.every((x) => Math.abs(x.boxH - rh * 3) <= 4.5),
    `${label}: the box is three rows tall`,
    JSON.stringify(hits.map((x) => [x.boxH, rh * 3])));
  /* THE TOLERANCE IS AN ABSOLUTE FEW PIXELS AND NOT A SHARE OF THE ROW, and the
     first draft of this used a quarter of a row, which is 16px at the desktop size:
     loose enough that a band written back as a hardcoded 38px slipped through it at
     13px out. What the page actually reads is 2px, at BOTH sizes, and that 2 is the
     box's own border rather than a misalignment. A derivation error is a fraction of
     a row and so grows with the row; a border does not. */
  const worst = Math.max(...hits.map((x) => Math.abs(x.dTop)));
  offsets[label] = worst;
  claim(worst <= 4,
    `${label}: every landed face sits in its band (worst ${worst}px of a ${rh}px row)`,
    JSON.stringify(hits));
  claim(hits.every((x) => Math.abs(x.dH) < 1),
    `${label}: the band is exactly one row tall`,
    JSON.stringify(hits.map((x) => x.dH)));
}

/* And it is the SAME offset at both sizes, which is the property no single reading
   can make: anything that scales with the row is the geometry coming apart, and
   anything constant is the border it has always had. */
{
  const a = offsets['phone 390'], b2 = offsets['desktop 1440'];
  claim(Math.abs(a - b2) < 1,
    `the offset does not grow with the row (${a}px against ${b2}px)`, `${a} / ${b2}`);
}

/* The desktop really does draw a bigger reel, or the section above is measuring one
   size twice and proving nothing about the property it exists for. */
{
  const a = (await bandOffsets(390, 844))[0].rh;
  const b2 = (await bandOffsets(1440, 900))[0].rh;
  claim(b2 > a * 1.3, `and the two widths are genuinely different reels (${a}px against ${b2}px)`,
    `${a} / ${b2}`);
}

/* ══ 2. the phone is untouched ════════════════════════════════════════════════ */
head('2. THE PHONE READS FIELD FIRST AND NAME AFTER');

for (const [w, h] of [[390, 844], [360, 740], [320, 568], [768, 1024], [999, 900]]) {
  const { ctx, p } = await open(w, h);
  const hero = await box(p, '.hero');
  const title = await box(p, '.htitle');
  const daily = await box(p, '.dailycard');
  const y = await box(p, '#h-box-y');
  const t = await box(p, '#h-box-t');
  const field = await box(p, '.field.hero-field');
  const go = await p.evaluate(() => {
    const e = document.querySelector('.dc-go');
    return e ? getComputedStyle(e).display : 'missing';
  });
  claim(hero.top < title.top, `${w}px: the field comes before the name`,
    `hero ${hero.top}, title ${title.top}`);
  /* THE DAILY IS WHAT THE TWO WIDTHS DISAGREE ABOUT, now that the name sits under
     the picture on both. On a phone it is the markup's own order, under the name;
     on a desktop it leads. Without this the phone section would assert only things
     that are true of the desktop too, and could not catch the block leaking down. */
  claim(title.top < daily.top, `${w}px: the daily sits under the name`,
    `title ${title.top}, daily ${daily.top}`);
  /* The two reels share a row above the field, which is what the game's own draft
     screen does and is what a phone was asked to keep. */
  claim(Math.abs(y.top - t.top) < 2 && y.bottom <= field.top + 1,
    `${w}px: the two reels share one line above the field`,
    `year ${y.top}-${y.bottom}, team ${t.top}, field ${field.top}`);
  claim(go === 'none', `${w}px: the daily card carries no second control`, `display ${go}`);
  /* THE SEAMS STAND INSIDE THE BALL, AND THE LABEL KEEPS THE MIDDLE. The seam
     strip is one button-height square positioned by a share of the button, and
     the label does not shrink while the button does, so there is a width where
     the two meet: measured in the fallback face the gap is about 35px a side at
     358 and about 4px at 320, which is an iPhone SE rather than a hypothetical,
     which is why the narrowest phones pull the seam back a point.

     THE INK IS READ WITH getBBox THROUGH THE SYMBOL, and the two obvious handles
     are both wrong. The <svg> BOX is wider than the drawing inside it, so it
     reports a collision that is not there. And getBoundingClientRect on the
     <use> answered 23.3px in a place the ink was 50.5 wide: Chromium is not
     reporting the referenced geometry there, and a guard built on it certified a
     ball a fifth of its real size. getBBox on the path inside the <symbol> works
     even though a symbol never renders, and it reads the SHIPPED drawing rather
     than a second copy of the numbers that generated it. */
  const seam = await p.evaluate(() => {
    const el = document.querySelector('#b-start');
    if (!el || !el.offsetWidth) return null;
    const sym = document.querySelector('#seam');
    const stitches = sym && sym.querySelectorAll('path')[1];
    const boxes = [...el.querySelectorAll('.bs')].map((s) => s.getBoundingClientRect());
    if (!stitches || boxes.length !== 2) return null;
    const bb = stitches.getBBox();
    const vb = sym.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    const sw = Number(stitches.getAttribute('stroke-width') || 0);
    const scale = boxes[0].height / vb[3];
    /* How far across its own box the drawing reaches, as a fraction. */
    const f = (bb.x + bb.width + sw / 2) / vb[2];
    const lab = el.querySelector('span').getBoundingClientRect();
    return { l: +(lab.left - (boxes[0].left + f * boxes[0].width)).toFixed(1),
      /* The right seam is the same symbol mirrored, so its ink is the same
         fraction measured back from the box's right edge. */
      r: +((boxes[1].right - f * boxes[1].width) - lab.right).toFixed(1),
      /* What a lace is drawn at on screen, and how much of the button's height
         the seam sweeps. */
      lace: +(sw * scale).toFixed(2),
      sweep: +((bb.height + sw) * scale).toFixed(1) };
  });
  claim(seam && seam.l > 0 && seam.r > 0,
    `${w}px: the seams never touch the label`,
    seam ? `gap ${seam.l} left, ${seam.r} right` : 'no ball button found');
  /* And the seam is still LACES rather than a thin curl at each end.

     THE DISCRIMINATOR IS THE RENDERED STROKE, because the width of the ink is not
     one: the first guard asked ink width over button height and the seam this
     page ships is deliberately NARROW and bold, near-vertical like the reference
     photo, so a width test cannot tell it from the defect. Both bad states this
     button has actually shipped (the tight bow at the ends and the 2.1x stretch
     that read as a pair of wings) drew their laces at 1.7px; the rebuild draws
     at 2.9 and up, scaling with the button. 2.3 is the middle of that gap.

     The sweep is the other half: a seam that stopped spanning the ball would be
     a badge stuck on the leather, so the ink has to run at least the button's
     full height. Every shape this button has worn passes that one, so it is a
     backstop rather than a discriminator, and the stroke is the claim with
     teeth. */
  const btn = await box(p, '#b-start');
  claim(seam && seam.lace > 2.3,
    `${w}px: and the laces are drawn bold rather than as a hairline`,
    seam ? `stroke ${seam.lace}px` : '');
  claim(seam && btn && seam.sweep >= btn.h,
    `${w}px: and the seam sweeps the ball's full height`,
    seam && btn ? `sweep ${seam.sweep}px on a ${btn.h}px button` : '');
  await ctx.close();
}

/* ══ 3. the desktop flanks the field, and leads with the daily ════════════════ */
head('3. THE DESKTOP LEADS WITH THE DAILY AND FLANKS THE FIELD');

for (const [w, h] of [[1000, 900], [1280, 900], [1440, 900], [1680, 1050]]) {
  const { ctx, p } = await open(w, h);
  const title = await box(p, '.htitle');
  const daily = await box(p, '.dailycard');
  const field = await box(p, '.field.hero-field');
  const note = await box(p, '.hnote');
  const start = await box(p, '.hp-start');
  const row = await box(p, '.hrow');
  const legal = await box(p, '.legal');
  const y = await box(p, '#h-box-y');
  const t = await box(p, '#h-box-t');

  /* THE DAILY IS THE ONLY THING ABOVE THE PICTURE. It is the offer with a clock on
     it, so it leads; the name of the game is a caption on something already looked
     at and sits under the field here exactly as it does on a phone. */
  claim(daily.top < field.top && field.bottom <= title.top,
    `${w}px: the daily, then the field, then the name`,
    `daily ${daily.top}, field ${field.top}-${field.bottom}, title ${title.top}`);
  claim(field.bottom <= note.top && note.bottom <= title.top && title.bottom <= start.top
        && start.top < row.top && row.top < legal.top,
    `${w}px: the tagline, the name, the button and the three doors follow the field`,
    `field ${field.bottom}, note ${note.top}, title ${title.top}, start ${start.top}, row ${row.top}`);
  /* THE REELS FLANK IT, which is the claim `display:contents` carries. Asked as a
     SIDE rather than as a coordinate: the year is entirely left of the field and the
     team entirely right of it, at any width. */
  claim(y.right <= field.left && t.left >= field.right,
    `${w}px: the year reel is left of the field and the team reel right of it`,
    `year ${y.left}-${y.right}, field ${field.left}-${field.right}, team ${t.left}-${t.right}`);
  /* And on the same line as it, or they are flanking nothing. */
  claim(y.top > field.top && y.bottom < field.bottom && t.top > field.top && t.bottom < field.bottom,
    `${w}px: both reels stand beside the field rather than above or below it`,
    `field ${field.top}-${field.bottom}, year ${y.top}-${y.bottom}, team ${t.top}-${t.bottom}`);
  await ctx.close();
}

/* ══ 4. the daily card says what pressing it does ═════════════════════════════ */
head('4. THE CARD IS THE BUTTON, AND IT SAYS SO');

/* The card has always BEEN the button, so this is a label rather than a second
   control. What it must never do is carry one sentence for two states: the card
   opens the draft on one and last night's result on the other. */
for (const played of [false, true]) {
  const { ctx, p } = await open(1440, 900, { played });
  const seen = await p.evaluate(() => {
    const card = document.querySelector('.dailycard');
    const go = document.querySelector('.dc-go');
    const inside = go ? card.contains(go) : false;
    return { text: go ? go.textContent.trim() : null, display: go ? getComputedStyle(go).display : null,
             inside, played: card.classList.contains('played'),
             buttons: card.querySelectorAll('button,a').length };
  });
  claim(seen.played === played, `the ${played ? 'played' : 'open'} day is in the right state`);
  claim(seen.display && seen.display !== 'none', `the ${played ? 'played' : 'open'} day shows its label`,
    `display ${seen.display}`);
  claim(seen.inside && seen.buttons === 0,
    'the label is inside the card and is not a control of its own',
    `inside ${seen.inside}, nested controls ${seen.buttons}`);
  claim(/\w/.test(seen.text || ''), `the ${played ? 'played' : 'open'} day names what the press does: ${JSON.stringify(seen.text)}`);
  await ctx.close();
  if (played) {
    const other = seen.text;
    globalThis.__playedText = other;
  } else {
    globalThis.__openText = seen.text;
  }
}
claim(globalThis.__openText !== globalThis.__playedText,
  'and the two states do not share one sentence',
  `${JSON.stringify(globalThis.__openText)} / ${JSON.stringify(globalThis.__playedText)}`);

/* ══ 5. nothing on the screen is unplaced ═════════════════════════════════════ */
head('5. EVERY CHILD OF THE SCREEN HAS A PLACE');

/* An element added later with no `order` takes 0 and jumps to the very top of the
   screen, which is a page that renders and reads wrong. The default is 9, so the
   claim is that every child carries one and that none of them is 0. */
{
  const { ctx, p } = await open(1440, 900);
  const orders = await p.evaluate(() => [...document.querySelectorAll('#s-intro.on > *')]
    .map((e) => ({ tag: e.className || e.id || e.tagName, order: getComputedStyle(e).order })));
  claim(orders.length >= 8, `the screen has its children (${orders.length})`);
  claim(orders.every((o) => o.order !== '0' && o.order !== 'auto'),
    'no child of the front page falls back to order 0',
    JSON.stringify(orders));
  const daily = orders.find((o) => /dailycard/.test(o.tag));
  claim(daily && Math.min(...orders.map((o) => +o.order)) === +daily.order,
    'and the daily challenge is the first of them',
    JSON.stringify(orders));
  await ctx.close();
}

/* ══ 6. nothing threw ════════════════════════════════════════════════════════ */
head('6. THE PAGE BOOTS CLEAN AT EVERY WIDTH');
claim(errors.length === 0, 'no page error at any width walked above', errors.join(' | '));

await browser.close();
server.close();

console.log('');
console.log(fails ? `${fails} of ${checks} checks FAILED` : `All ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
