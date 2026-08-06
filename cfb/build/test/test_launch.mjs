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

/* A page with the outside world switched off and a log that is watched.
   "Failed to load resource" is the browser narrating a request that failed, and the
   requestfailed handler judges those on their origin, so counting both would fail
   the run on the refusals this test is making on purpose. */
async function newPage(vp) {
  const p = await b.newPage({ viewport: vp });
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
    for (let i = 0; i < 20 && picks < 6; i++) {
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

/* ── the card on the front page ────────────────────────────────────────────────
   LISTED = false, ON PURPOSE. The game is built, tested and live at /cfb/, and it
   is deliberately not linked from anywhere public until it is turned on. Being
   unlisted is a decision, not an oversight, so it is asserted rather than assumed:
   an accidental relist is exactly the kind of thing that goes out in somebody
   else's commit and is noticed by a stranger.

   TO TURN THE GAME ON: put the card, the copy and the sitemap entries back (the
   comment where the card was on index.html lists all of them), then set LISTED to
   true here. Both halves are written, so this file is the checklist. */
const LISTED = false;
if (want('home')) {
  console.log('\n=== the game is ' + (LISTED ? 'listed on' : 'NOT yet listed on') + ' the site ===');
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 1000 }]]) {
    const p = await newPage(vp);
    await p.goto(HOST + '/index.html', { waitUntil: 'load', timeout: 40000 });
    await p.waitForTimeout(1200);
    const card = await p.$('article.feat.cfb');
    const body = await p.textContent('body');
    const links = await p.$$eval('a[href]', (els) => els.map((e) => e.getAttribute('href')));
    const ld = await p.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => s.textContent).join(' '));

    if (!LISTED) {
      ok(label + ': no card on the page', !card);
      /* The card is the obvious half. The copy and the structured data are the half
         that gets left behind, and a search engine reads those too. */
      ok(label + ': nothing links to /cfb/', !links.some((h) => h && h.startsWith('/cfb')), links.filter((h) => h && h.startsWith('/cfb')).join(' '));
      ok(label + ': the visible copy does not name it', !/College Football: Perfect Season/.test(body));
      ok(label + ': the structured data does not either', !/cfb|College Football/.test(ld));
      ok(label + ': the hero counts three games', /3\s*games live/.test(await p.textContent('.hero-status')));
    } else {
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
    }
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(label + ': no sideways scroll', over <= 1, over + 'px');
    ok(label + ': nothing logged', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await p.close();
  }
  /* The sitemap is the one that is expensive to undo: an indexed URL outlives the
     decision to publish it, so asking Google to crawl an unlaunched game is not a
     thing you can take back by deleting a line. */
  const sm = await (await fetch(HOST + '/sitemap.xml')).text();
  ok('the sitemap ' + (LISTED ? 'lists' : 'does not announce') + ' /cfb/', /cfb/.test(sm) === LISTED);
}

await b.close();
console.log(bad ? ('\n' + bad + ' FAILURES') : '\nall clear');
process.exit(bad ? 1 : 0);
