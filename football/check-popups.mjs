/*
 * check-popups.mjs - a guide is shown ONCE, and a player with a history never sees it.
 *
 *   node football/check-popups.mjs
 *
 * Reported by a player: the same pop-ups and directions, ten times, after saying they did not
 * need them. Every guide on this page was remembered in ONE BROWSER, so a new phone, a private
 * window or a cleared jar put it back in front of somebody who had played for months, and the
 * dynasty rules stood in front of every run unless a box was ticked.
 *
 * What is asserted, each as the thing a player would notice:
 *   a stranger on a fresh browser still gets the first-run guide (the guard must not simply
 *     switch the guide off for everybody, which would pass every other claim here)
 *   a browser holding a saved run does not
 *   a signed in account with runs does not, even on a browser that has never seen it
 *   whatever the account has seen comes down from the shelf and retires it here
 *   whatever this browser has seen goes up to the shelf, signed in, and never signed out
 *   a dynasty on the account retires the dynasty rules, a Trade Machine season its rules
 *   the old per-guide keys still count, so nobody sees a thing again on the day this ships
 *   the crest's "what's new" sheet never opens by itself
 *
 * Nothing leaves the page: the board, the shelf and auth are stood in for, so no request can
 * write a row on anybody's account.
 */
import fs from 'fs';
import path from 'path';
import * as pw from 'playwright';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

const INJECT = 'hasSeen,markSeen,seenMerge,seenFromRows,firstRunGuide,frgUp,frgClose,'
  + 'dynIntroOff,setAuth:(v)=>{authState=v;},setCareer:(v)=>{career=v;},'
  + 'getAuth:()=>authState,setMine:(f)=>{B.mine=f;},guideTimer:()=>0';

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
  if (!pass) bad++;
};

const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* A fresh browser each time: a new context is a new localStorage, which is the "new phone". */
async function openPage(init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  if (init) await page.addInitScript(init);
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (rel === '/football/index.html') {
      body = Buffer.from(body.toString('utf8')
        .replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
    }
    await r.fulfill({ status: 200,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  return { ctx, page, boom };
}
const guideUp = (page) => page.evaluate(() => { const el = document.getElementById('frg');
  return !!el && !el.hidden; });

console.log('A STRANGER STILL GETS THE GUIDE');
{
  const { ctx, page, boom } = await openPage();
  await page.waitForFunction(() => { const el = document.getElementById('frg');
    return el && !el.hidden; }, null, { timeout: 12000 }).catch(() => {});
  ok('a fresh browser with no account is shown the first-run guide', await guideUp(page));
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('ps_seen_v1') || '{}'));
  await page.evaluate(() => window.__t.frgClose());
  ok('  and closing it marks it seen', (await page.evaluate(() => window.__t.hasSeen('guide'))) === true,
    JSON.stringify(seen));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  ok('  so the next visit does not show it', !(await guideUp(page)));
  ok('  nothing threw', boom.length === 0, boom[0] || '');
  await ctx.close();
}

console.log('\nA BROWSER HOLDING A SAVED RUN IS NOT NEW');
{
  const { ctx, page } = await openPage(() => {
    try { localStorage.setItem('ps_trade_save', JSON.stringify({ v: 1, at: Date.now(),
      run: { tradeMachine: true, phase: 'season', roster: ['x'] } })); } catch (e) {}
  });
  const shown = await page.evaluate(() => {
    /* Whatever the trade slot's reader makes of the planted save, the question is what the
       guide does with a browser that has one, so it is asked directly. */
    const T = window.__t; T.setAuth({ ready: true, signedIn: false });
    return { up: T.firstRunGuide(), read: !!localStorage.getItem('ps_trade_save') };
  });
  /* The planted save is only a run if the page's own reader accepts it. If it does not, this
     arm proves nothing, so it says so rather than passing. */
  const counted = await page.evaluate(() => window.__t.hasSeen('guide'));
  ok('a saved run retires the guide', shown.up === false && counted === true, JSON.stringify(shown));
  await ctx.close();
}

console.log('\nA SIGNED IN ACCOUNT WITH A HISTORY, ON A BROWSER THAT HAS NEVER SEEN ANYTHING');
{
  const { ctx, page } = await openPage();
  const r = await page.evaluate(() => {
    const T = window.__t;
    document.getElementById('frg').hidden = true;
    try { localStorage.clear(); } catch (e) {}
    T.setAuth({ ready: true, signedIn: true, userId: 'u-vet', name: 'vet' });
    T.setCareer(null);
    /* The rows a board read hands back for an account that has played. */
    T.seenFromRows([{ run_mode: 'offense' }, { run_mode: 'dynasty', dynasty_id: 'd1' },
      { run_mode: 'trade' }]);
    T.setCareer({ userId: 'u-vet', rows: [{}], total: 1 });
    return { guide: T.hasSeen('guide'), dyn: T.dynIntroOff(), tm: T.hasSeen('tmintro'),
      shows: T.firstRunGuide() };
  });
  ok('runs on the account retire the first-run guide', r.guide && r.shows === false, JSON.stringify(r));
  ok('a dynasty on the account retires the dynasty rules', r.dyn === true);
  ok('a Trade Machine season retires its rules', r.tm === true);
  const fresh = await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    window.__t.seenFromRows([{ run_mode: 'offense' }]);
    return { guide: window.__t.hasSeen('guide'), dyn: window.__t.dynIntroOff() };
  });
  ok('  but a quick draft alone does not retire the dynasty rules', fresh.guide && !fresh.dyn,
    JSON.stringify(fresh));
  await ctx.close();
}

console.log('\nTHROUGH THE REAL PATH: THE GUIDE WAITS FOR THE ACCOUNT\'S ROWS');
{
  /* firstRunGuide asks careerLoad, careerLoad asks the board and files what it finds. Driven
     end to end with only the board's answer stood in, because the arm above calls
     seenFromRows by hand and would pass with the call taken out of careerLoad. */
  const { ctx, page } = await openPage();
  await page.evaluate(() => {
    const T = window.__t;
    T.frgClose();
    try { localStorage.clear(); } catch (e) {}
    T.setCareer(null);
    T.setMine(async () => ({ rows: [{ run_mode: 'offense' }], total: 1, capped: false }));
    T.setAuth({ ready: true, signedIn: true, userId: 'u-real', name: 'real' });
    T.firstRunGuide();
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ seen: window.__t.hasSeen('guide') }));
  ok('a signed in account with a run is never shown the guide', r.seen && !(await guideUp(page)),
    JSON.stringify(r));
  await page.evaluate(() => {
    const T = window.__t;
    try { localStorage.clear(); } catch (e) {}
    T.setCareer(null);
    T.setMine(async () => ({ rows: [], total: 0, capped: false }));
    T.setAuth({ ready: true, signedIn: true, userId: 'u-new', name: 'new' });
    T.firstRunGuide();
  });
  await page.waitForTimeout(1500);
  ok('  while a brand new account still is', await guideUp(page));
  await ctx.close();
}

console.log('\nTHE SEEN LIST RIDES ON THE ACCOUNT');
{
  const { ctx, page } = await openPage();
  const r = await page.evaluate(() => {
    const T = window.__t;
    document.getElementById('frg').hidden = true;
    try { localStorage.clear(); } catch (e) {}
    /* Every write the page would send, captured rather than sent. */
    const sent = [];
    window.RTG_SAVE = Object.assign({}, window.RTG_SAVE || {}, {
      queue: (game, slot, build) => { sent.push({ game, slot, made: build() });
        return Promise.resolve(null); } });
    T.setAuth({ ready: true, signedIn: false });
    T.markSeen('tmintro');
    const signedOut = sent.length;
    T.setAuth({ ready: true, signedIn: true, userId: 'u1', name: 'one' });
    /* Down from the shelf: another device saw the guide and the dynasty rules. */
    T.seenMerge({ slot: 'seen', payload: { seen: { guide: 1, dynintro: 1 } }, progress: 2 });
    return { signedOut, sent, guide: T.hasSeen('guide'), dyn: T.dynIntroOff(),
      tm: T.hasSeen('tmintro') };
  });
  ok('nothing is sent while signed out', r.signedOut === 0, String(r.signedOut));
  ok('what another device saw retires it here', r.guide && r.dyn, JSON.stringify(r));
  ok('  and what this browser saw is kept', r.tm === true);
  const up = r.sent[r.sent.length - 1];
  ok('the union goes up to the account, on the run shelf, in its own slot', !!up
    && up.game === 'ps_dynasty' && up.slot === 'seen'
    && up.made.payload.seen.guide === 1 && up.made.payload.seen.tmintro === 1
    && up.made.progress === 3, JSON.stringify(up));
  await ctx.close();
}

console.log('\nTHE OLD KEYS STILL COUNT');
{
  const { ctx, page } = await openPage(() => {
    try {
      localStorage.setItem('ps_seen_guide', '1');
      localStorage.setItem('ps_dynintro_off', '1');
      localStorage.setItem('ps_tmintro', '1');
    } catch (e) {}
  });
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => ({ guide: window.__t.hasSeen('guide'),
    dyn: window.__t.dynIntroOff(), tm: window.__t.hasSeen('tmintro') }));
  ok('a guide dismissed before this shipped stays dismissed', r.guide && !(await guideUp(page)));
  ok('  and so does the dynasty rules box somebody ticked', r.dyn);
  ok('  and the Trade Machine rules', r.tm);
  await ctx.close();
}

console.log('\nTHE CREST ANNOUNCEMENT NEVER OPENS BY ITSELF');
{
  const src = fs.readFileSync(path.join(ROOT, 'football/index.html'), 'utf8');
  ok('nothing calls the what\'s new sheet', !/whatsNew(Maybe|Sheet)\s*\(/.test(src));
}

await browser.close();
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
