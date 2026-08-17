/* Everything that has to be true before the game is listed to the public.
 *
 *   (node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_launch.mjs
 *
 * The other suites here each prove one subsystem. This one proves the things that
 * are nobody's subsystem and are therefore the things that ship broken: a link to a
 * file that is not there, a canonical pointing at the wrong URL, an og:image that is
 * a relative path, a page that scrolls sideways on a small phone, a payload that
 * costs a minute of somebody's data, a console full of errors that nobody was
 * watching for. None of it is caught by playing the game, which is exactly why it
 * has to be checked by something that is not playing the game.
 *
 * EXTERNALS ARE REFUSED, DELIBERATELY. Google Fonts, AdSense and Analytics are all
 * aborted at the network. That is two things at once: it is the ad-blocker case,
 * which is a large minority of real visitors, and it is the only way to measure the
 * game rather than the network in front of it. This container's proxy hangs on
 * fonts.googleapis.com rather than refusing it, so a render-blocking stylesheet sits
 * there for thirteen seconds; the already-live NFL page measures identically, and
 * both come back under 150ms the moment the request is refused instead of hung.
 *
 * Sections:
 *   links      every internal href, src and sitemap loc on the four public pages
 *   cold       what a first visit costs and how fast it becomes playable
 *   head       title, description, canonical, og, manifest, robots, a11y, overflow
 *   fold       every front-page button reachable on five real phones, address bar included
 *   play       a whole season with every screen opened and nothing allowed to log
 *   home       the card on the site's front page, and where it sits
 */
import { chromium } from 'playwright';

const HOST = process.argv[2] || 'http://localhost:8081';
const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
/* Everything that leaves the origin. Refused, per the note above. */
const EXTERNAL =
  /googlesyndication|googletagmanager|google-analytics|doubleclick|fonts\.googleapis|fonts\.gstatic|gstatic|supabase/;

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const only = process.argv[3] || null;
const want = (s) => !only || only === s;

const b = await chromium.launch({

  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
/* THE ARCADE HOUSE AD IS TURNED OFF FOR THIS SUITE, the same way a player turns it off:
   this writes the shared localStorage key on the way in, exactly as ticking the box does.
   Still needed even though the college game no longer runs the ad, because this suite is
   the one that also visits the SITE front page, where it does. It covers the screen, so a
   suite that idles there and then clicks would be clicking a backdrop.
   test_arcade_ad.mjs is where the ad itself is checked. */
/* rtg_arcade_ad_off, not cfb_. The key was renamed when the panel moved into
   /assets/arcade-ad.js to be shared site-wide, and this guard went on writing the old one
   for a while, which is a guard that silently guards nothing. */
const NO_ARCADE_AD = () => { try { localStorage.setItem('rtg_arcade_ad_off', '1'); } catch (e) {} };

/* A page with the outside world switched off and a log that is watched.
   "Failed to load resource" is the browser narrating a request that failed, and the
   requestfailed handler judges those on their origin, so counting both would fail
   the run on the refusals this test is making on purpose. */
async function newPage(vp) {
  const p = await b.newPage({ viewport: vp });
  await p.addInitScript(NO_ARCADE_AD);
  const errs = [], failed = [];
  await p.route('**/*', (r) => EXTERNAL.test(r.request().url()) ? r.abort() : r.continue());
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on('requestfailed', (r) => { if (!EXTERNAL.test(r.url())) failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText); });
  p.errs = errs; p.failed = failed;
  return p;
}

/* Sheets animate out, so "clicked close" is not "gone": wait for the overlay to drop
   its .on before touching anything underneath it. */
async function shut(p) {
  await p.evaluate(() => {
    for (const id of ['sh-x', 'lb-x', 'pr-x']) {
      const e = document.getElementById(id);
      if (e && e.offsetParent !== null) { e.click(); return; }
    }
    const s = document.getElementById('sheet'); if (s) s.classList.remove('on');
  });
  await p.waitForFunction(() => {
    const s = document.getElementById('sheet');
    return !s || !s.classList.contains('on');
  }, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(450);
}

/* ── links ─────────────────────────────────────────────────────────────────── */
if (want('links')) {
  console.log('\n=== every internal link resolves ===');
  const PAGES = ['/index.html', '/cfb/index.html', '/cfb/how-to-play.html', '/about.html', '/sitemap.xml'];
  const seen = new Set();
  let missing = 0;
  for (const page of PAGES) {
    const r = await fetch(HOST + page);
    if (!r.ok) { ok('the page itself is served: ' + page, false, r.status); continue; }
    const s = await r.text();
    const urls = new Set();
    for (const m of s.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) urls.add(m[1]);
    for (const m of s.matchAll(/content\s*=\s*["'](https:\/\/runthe\.gg[^"']*)["']/gi)) urls.add(m[1]);
    for (const m of s.matchAll(/<(?:loc|image:loc)>([^<]+)<\/(?:loc|image:loc)>/g)) urls.add(m[1]);
    for (let u of urls) {
      u = u.replace(/^https:\/\/runthe\.gg/, '').split('#')[0];
      if (!u.startsWith('/') || u.startsWith('//')) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      const res = await fetch(HOST + u).catch(() => null);
      if (!res || !res.ok) { console.log('  MISSING ' + (res ? res.status : 'ERR') + '  ' + u + '   (from ' + page + ')'); missing++; }
    }
  }
  ok('nothing is linked that is not there', missing === 0, seen.size + ' urls checked, ' + missing + ' missing');
}

/* ── cold visit ────────────────────────────────────────────────────────────── */
if (want('cold')) {
  console.log('\n=== what a first visit costs ===');
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
    const p = await newPage(vp);
    let wire = 0;
    p.on('response', (r) => { try { if (EXTERNAL.test(r.url())) return; const h = r.headers()['content-length']; if (h) wire += +h; } catch (e) {} });
    const t0 = Date.now();
    await p.goto(HOST + '/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('#s-intro.on', { timeout: 30000 });
    const tIntro = Date.now() - t0;
    await p.waitForFunction(() => { const el = document.getElementById('b-play-intro'); return el && !el.disabled; }, { timeout: 40000 });
    const tReady = Date.now() - t0;
    await p.waitForTimeout(2500);
    ok(label + ': the intro paints under 3s', tIntro < 3000, tIntro + 'ms');
    ok(label + ': the draft button is live under 6s', tReady < 6000, tReady + 'ms');
    ok(label + ': the cold visit is under 1.5MB on the wire', wire < 1.5 * 1024 * 1024, (wire / 1024).toFixed(0) + 'K');
    ok(label + ': nothing logged', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    ok(label + ': no same-origin request failed', p.failed.length === 0, p.failed.slice(0, 3).join(' | '));
    await p.close();
  }
}

/* ── head, a11y, overflow ──────────────────────────────────────────────────── */
if (want('head')) {
  console.log('\n=== the head, and what a reader needs ===');
  const EXPECT = {
    '/cfb/index.html': { canon: 'https://runthe.gg/cfb/', h1: 1 },
    '/cfb/how-to-play.html': { canon: 'https://runthe.gg/cfb/how-to-play.html', h1: 1 },
  };
  for (const [path, exp] of Object.entries(EXPECT)) {
    const p = await newPage({ width: 390, height: 844 });
    await p.goto(HOST + path, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await p.waitForTimeout(1800);
    const h = await p.evaluate(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      desc: (document.querySelector('meta[name=description]') || {}).content,
      robots: (document.querySelector('meta[name=robots]') || {}).content,
      canonical: (document.querySelector('link[rel=canonical]') || {}).href,
      ogimg: (document.querySelector('meta[property="og:image"]') || {}).content,
      ogurl: (document.querySelector('meta[property="og:url"]') || {}).content,
      twcard: (document.querySelector('meta[name="twitter:card"]') || {}).content,
      viewport: (document.querySelector('meta[name=viewport]') || {}).content,
      h1: document.querySelectorAll('h1').length,
      imgsNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
      btnsNoName: [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null
        && !x.textContent.trim() && !x.getAttribute('aria-label') && !x.title).length,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
    }));
    const n = path.split('/').pop().replace('.html', '');
    ok(n + ': html lang is en', h.lang === 'en', h.lang);
    ok(n + ': the title fits a result', !!h.title && h.title.length <= 70, h.title.length + ' chars');
    ok(n + ': the description is a sentence, not a stub', (h.desc || '').length >= 70, (h.desc || '').length + ' chars');
    ok(n + ': indexable', /index/.test(h.robots || '') && !/noindex/.test(h.robots || ''), h.robots);
    ok(n + ': canonical is the real URL', h.canonical === exp.canon, h.canonical);
    ok(n + ': og:url matches the canonical', h.ogurl === exp.canon, h.ogurl);
    ok(n + ': og:image is absolute', /^https:\/\//.test(h.ogimg || ''), h.ogimg);
    ok(n + ': twitter card is the large one', h.twcard === 'summary_large_image', h.twcard);
    ok(n + ': viewport set for phones', /width=device-width/.test(h.viewport || ''));
    ok(n + ': exactly one h1', h.h1 === exp.h1, h.h1);
    ok(n + ': every image has alt text', h.imgsNoAlt === 0, h.imgsNoAlt + ' without');
    ok(n + ': every visible button has a name', h.btnsNoName === 0, h.btnsNoName + ' without');
    let ldOk = h.ld.length > 0;
    for (const s of h.ld) { try { JSON.parse(s); } catch (e) { ldOk = false; } }
    ok(n + ': the structured data parses', ldOk, h.ld.length + ' blocks');
    /* A page that scrolls sideways is a page that feels broken, and it only ever
       shows up at the widths nobody develops at. */
    for (const w of [320, 360, 390, 414, 768, 1024, 1280, 1440]) {
      await p.setViewportSize({ width: w, height: 900 });
      await p.waitForTimeout(350);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(n + ': no sideways scroll at ' + w, over <= 1, over + 'px');
    }
    ok(n + ': nothing logged', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await p.close();
  }
}

/* ── the front page fits a phone ───────────────────────────────────────────────
   Every button on the front page has to be reachable without scrolling, and the
   trap is that innerHeight is NOT what a player can see. iOS Safari's address bar
   takes about ninety pixels that the viewport never mentions, so a layout can
   measure as fitting and still be cut off on the device: that is exactly how
   Leaderboard and How to play went out below the fold, sixteen pixels clear of
   the poll bar by the numbers and under it in a real hand.

   So the bar is not the viewport, it is the viewport minus a chrome allowance,
   and the ceiling is the poll bar rather than the bottom edge, because a button
   behind the poll is as unreachable as one off the screen.

   Real CSS viewports, not invented ones. The SE is the hard case and the reason
   the field is dropped under 760px: there is no arrangement of a top bar, two
   reels, a headline, four buttons and the poll that fits 667px once the address
   bar has taken its share. */
if (want('fold')) {
  console.log('\n=== every front-page button is above the fold ===');
  const CHROME = 90;
  const PHONES = [['iPhone SE', 375, 667], ['13 mini', 375, 812], ['iPhone 14', 390, 844],
    ['15 Pro Max', 430, 932], ['Pixel 7', 412, 915]];
  for (const [name, w, h] of PHONES) {
    const p = await newPage({ width: w, height: h });
    await p.goto(HOST + '/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await p.waitForSelector('#s-intro.on', { timeout: 20000 });
    await p.waitForFunction(() => { const t = document.getElementById('h-ticker'); return t && !t.hidden; },
      { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const tick = document.getElementById('h-ticker').getBoundingClientRect();
      const out = { ceiling: tick.height > 0 ? tick.top : innerHeight, buttons: {} };
      for (const id of ['b-play-intro', 'b-modes', 'b-lb-intro', 'b-how']) {
        const e = document.getElementById(id);
        out.buttons[id] = e ? e.getBoundingClientRect().bottom : null;
      }
      return out;
    });
    const last = Math.max(...Object.values(m.buttons).filter((v) => v !== null));
    const slack = m.ceiling - last;
    ok(name + ' (' + w + 'x' + h + '): all four buttons clear the poll bar and the address bar',
      slack >= CHROME, 'slack ' + slack.toFixed(0) + 'px, need ' + CHROME);
    ok(name + ':   and nothing logged', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
    await p.close();
  }
}

/* ── a whole season, everything opened ─────────────────────────────────────── */
if (want('play')) {
  console.log('\n=== a whole season, with the outside world switched off ===');
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
    console.log('  -- ' + label + ' --');
    const p = await newPage(vp);
    await p.goto(HOST + '/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('#s-intro.on', { timeout: 20000 });
    await p.waitForTimeout(1200);

    await p.click('#b-how'); await p.waitForTimeout(800);
    ok('the how-to-play sheet opens', await p.isVisible('#sheet-in'));
    const how = await p.textContent('#sheet-in');
    /* The sheet builds these out of the constants, so if the engine's budget or
       ladder move and the copy does not, this is what says so. */
    ok('  and states the budget and the season', /\$11(\.0)?M/.test(how) && /12 games/.test(how));
    ok('  and the two-back cap', /two running backs/i.test(how));
    await shut(p);

    await p.click('#b-modes'); await p.waitForTimeout(800);
    ok('the mode menu opens', await p.isVisible('#sheet-in'));
    await shut(p);

    await p.click('#b-lb-intro'); await p.waitForTimeout(2500);
    ok('the leaderboard screen opens with no board behind it', !!(await p.$('#s-board.on')));
    /* Refused at the network is a network failure, not a missing table: the table
       being absent is a 404 with a body, which the ranks suite covers. Both have to
       say something true, and they must not say the same thing. */
    ok('  and says the board did not answer, without inventing rows',
      /not reachable right now/.test(await p.textContent('#lb-note') || '')
        && ((await p.textContent('#lb-rows')) || '').trim() === '');
    await shut(p);
    if (!await p.$('#s-intro.on')) await p.evaluate(() => { const h = document.getElementById('b-home'); if (h) h.click(); });
    await p.waitForTimeout(800);

    await p.evaluate(() => document.getElementById('b-play-intro').click());
    await p.waitForTimeout(1500);
    let picks = 0;
    for (let i = 0; i < 26 && picks < 6; i++) {
      /* Taking a dual-position player opens the slot sheet over the wheel, and
         the sheet swallows every click until it is answered. A loop that only
         knows about tiles retries until the suite times out, and whether it
         happens at all depends on what the wheel offered, which makes it read
         like a flake. Answer it with the first slot and carry on. */
      const slot = await p.$('#sheet.on .slotopt');
      if (slot) { await slot.click(); await p.waitForTimeout(900); continue; }
      const t = await p.$('#opts .tile:not(.off)');
      if (!t) { await p.waitForTimeout(1200); continue; }
      await t.click(); picks++; await p.waitForTimeout(2300);
      if (await p.$('#s-squad.on')) break;
    }
    ok('six signings fill the squad', !!(await p.$('#s-squad.on')), picks + ' picks');

    await p.evaluate(() => document.getElementById('b-play').click());
    await p.waitForTimeout(1400);
    for (let i = 0; i < 40; i++) {
      if (await p.$('#s-over.on')) break;
      await p.evaluate(() => {
        for (const id of ['b-sim', 'b-po-fast', 'b-po-skip', 'b-po', 'b-bowl-fast', 'b-bowl']) {
          const el = document.getElementById(id);
          if (el && !el.hidden && el.offsetParent !== null) { el.click(); return; }
        }
      });
      await p.waitForTimeout(1100);
    }
    ok('the season reaches the results screen', !!(await p.$('#s-over.on')));

    const tabs = await p.$$eval('.overtab', (els) => els.map((e) => e.getAttribute('data-t')));
    ok('the results screen has its tabs', tabs.length >= 3, tabs.join(','));
    for (const t of tabs) {
      await p.click('.overtab[data-t="' + t + '"]'); await p.waitForTimeout(1600);
      const on = await p.$('#op-' + t + '.on');
      ok('  tab "' + t + '" opens and paints', !!on && ((await p.textContent('#op-' + t)) || '').trim().length > 10);
    }
    await p.evaluate(() => { const e = document.getElementById('b-profile') || document.getElementById('o-case'); if (e) e.click(); });
    await p.waitForTimeout(1500);
    ok('the trophy case opens', await p.isVisible('#sheet-in, #s-profile'));
    await shut(p);

    ok('nothing logged across the whole run', p.errs.length === 0, p.errs.slice(0, 4).join(' | '));
    await p.screenshot({ path: SS + 'launch_' + label + '.png' });
    await p.close();
  }
}

/* ── the card on the front page ────────────────────────────────────────────── */
if (want('home')) {
  console.log('\n=== the game is listed on the site ===');
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 1000 }]]) {
    const p = await newPage(vp);
    await p.goto(HOST + '/index.html', { waitUntil: 'load', timeout: 40000 });
    await p.waitForTimeout(1200);
    const card = await p.$('article.feat.cfb');
    ok(label + ': the card is on the page', !!card);
    if (card) {
      const box = await card.boundingBox();
      ok(label + ':   it has real size', box.width > 200 && box.height > 150, Math.round(box.width) + 'x' + Math.round(box.height));
      ok(label + ':   its crest loaded', await p.$eval('article.feat.cfb .crest img', (i) => i.naturalWidth > 0));
      ok(label + ':   its play link points at /cfb/', await p.$eval('article.feat.cfb a.play', (a) => a.getAttribute('href')) === '/cfb/');
      /* Green, not the NFL card's red: the two cards are the same markup and only
         the class separates them, so a typo in the class is invisible except here. */
      ok(label + ':   it is green, not red',
        (await p.$eval('article.feat.cfb .play', (e) => getComputedStyle(e).backgroundImage)).includes('16, 185, 129'));
      const order = await p.$$eval('main.games article.feat', (els) => els.map((e) => e.className.split(' ')[1]));
      ok(label + ':   and sits second, after the NFL game', order[1] === 'cfb', order.join(' > '));
    }
    ok(label + ': the hero counts four games', /4\s*games live/.test(await p.textContent('.hero-status')));
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(label + ': no sideways scroll', over <= 1, over + 'px');
    ok(label + ': nothing logged', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await p.close();
  }
}

await b.close();
console.log(bad ? ('\n' + bad + ' FAILURES') : '\nall clear');
process.exit(bad ? 1 : 0);
