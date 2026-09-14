/* The arcade house ad, and the fact that neither football game runs one.
 *
 *   node cfb/build/test/test_arcade_ad.mjs          (static checks only)
 *   (nohup node cfb/build/test/gzip_server.mjs &)   then the browser half runs too
 *
 * WHAT THIS FILE USED TO BE, because the change is the whole story. It tested the panel in
 * /assets/arcade-ad.js against the promises it makes: once a visit, never again once the box
 * is ticked, never stacked on a sheet somebody already opened, the opt-out on screen without
 * scrolling at six widths. It was DRIVEN THROUGH THE HOMEPAGE, on the belief that the panel
 * ran there as well as on the games.
 *
 * IT DID NOT, AND THIS FILE HAD BEEN FAILING ON ITS FIRST ASSERTION FOR SOME TIME. The
 * homepage has never carried the script (`git log -S arcade-ad -- index.html` finds nothing),
 * and the mentions in golf/index.html are comments about the shared storage keys rather than
 * a script tag. The college game had already had it removed. So the NFL game was the only
 * surface that ever loaded the panel, the homepage run timed out waiting for `.rtgaa` to
 * appear, and everything below that point, including the college game's own removal guard,
 * never ran at all. A suite that throws in its first section is not a weaker suite, it is no
 * suite, and this one had been quietly protecting nothing.
 *
 * THE PANEL IS NOW ON NO SURFACE, by request: the college game first, then the NFL game. So
 * there is nothing left to drive, and what this file can still usefully do is hold the
 * removal in place. `assets/arcade-ad.js` is deliberately still in the repo and deliberately
 * loaded by nothing. If it is ever wanted again, the rules it used to be held to are in this
 * file's history and they should come back with it.
 *
 * TWO HALVES, AND THE STATIC ONE MATTERS MORE. A browser can only answer for the page it
 * opened, and "the panel did not appear" is also exactly what a page that loads the script
 * and simply never calls show() looks like: still one line from putting it back, and still
 * shipping the bytes and the storage writes to everybody. So the markup is read directly as
 * well, and that half needs no server, which is why it runs first and runs alone if the
 * server is not up.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CFB = 'http://localhost:8081/cfb/index.html';
const NFL = 'http://localhost:8081/football/index.html';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const PAGES = [['the NFL game', 'football/index.html'], ['the college game', 'cfb/index.html']];

/* A LIVE SCRIPT TAG, not any mention of the name. Both pages carry a comment saying why they
   do not load it, and a check written against the word would fail on its own explanation. */
const LOADS = /<script[^>]+src\s*=\s*["'][^"']*arcade-ad[^"']*["']/i;

console.log('=== the markup, read directly ===');
for (const [who, file] of PAGES) {
  const src = readFileSync(path.join(ROOT, file), 'utf8');
  ok(who + ' has no script tag for the panel', !LOADS.test(src),
    (LOADS.exec(src) || [''])[0].slice(0, 90));
  /* THE CALL AS WELL AS THE TAG. askArcadeAd() was the NFL game's own decision about when it
     was polite to interrupt, and a page that kept the function while dropping the tag is a
     page one script tag away from being back where it started. */
  ok('  and nothing left calling it',
    !/askArcadeAd\s*\(\s*\)\s*[;,]/.test(src) && !/RTG_ARCADE_AD\s*\./.test(src));
}

/* THE BROWSER HALF IS OPTIONAL, and skipped rather than failed when the server is not up.
   The static half above is the load-bearing one and it must never be skipped; making the
   whole file exit non-zero because somebody forgot to start a server is how a check earns
   the reputation that gets it ignored. */
let up = false;
try {
  const r = await fetch(NFL, { method: 'HEAD' });
  up = r.ok;
} catch (e) { up = false; }

if (!up) {
  console.log('\n(the browser half needs cfb/build/test/gzip_server.mjs on :8081, skipped)');
} else {
  const { chromium } = await import('playwright');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const adUp = (p) => p.evaluate(() => !!document.querySelector('.rtgaa'));

  /* One context is one visit: sessionStorage lives and dies with it, localStorage does not.
     Fresh per game, so neither can be passing because of a "seen it already" the other left. */
  const visit = async (ctx, url) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + e.message); });
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    return p;
  };

  console.log('\n=== and neither game puts it up in a browser ===');
  /* BOTH GAMES, NOT ONE EACH. They are the same game twice over and a change made to one is
     routinely copied across to the other, which is exactly how a removal gets undone. */
  for (const [who, url] of [['the NFL game', NFL], ['the college game', CFB]]) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await visit(c, url);
    await p.waitForSelector('#s-intro.on', { timeout: 30000 });
    /* The old trigger fired 1.2s after the intro landed, so this is well past it. */
    await p.waitForTimeout(3200);
    ok(who + ' never puts it up', !(await adUp(p)));
    ok('  and does not even load the shared panel', await p.evaluate(() =>
      !window.RTG_ARCADE_AD && ![...document.scripts].some((x) => /arcade-ad/.test(x.src || ''))));
    /* Sitting on the front page for a while is the case that used to trigger it. */
    await p.waitForTimeout(2500);
    ok('  nor after a long look at it', !(await adUp(p)));
    /* AND NOT WHEN ASKED FOR BY NAME. ?arcadead=1 bypasses every "have they seen it" rule,
       so it is the case that catches a page which kept its caller and was merely relying on
       the once-a-session storage to stay quiet on this particular run.
       IT DOES NOT CATCH A PAGE THAT KEPT ONLY THE SCRIPT TAG, and that is worth stating
       rather than assuming: arcade-ad.js never shows itself, it only exports forced() for
       the host page to consult, so a page with the tag and no caller sits silent through
       every browser assertion here. Putting the tag back and running this file is how that
       was established, and it is the whole reason the static half above exists. */
    const f = await visit(c, url + '?arcadead=1');
    await f.waitForTimeout(3200);
    ok('  nor when the URL demands it', !(await adUp(f)));
    await f.close();
    await p.close();
    await c.close();
  }
  await b.close();
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
