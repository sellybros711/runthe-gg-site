/*
 * check-freespin.mjs : the free re-spin a player earns by watching a short ad.
 *
 *   node football/check-freespin.mjs
 *
 * The owner's call (2026-10-28): a yellow FREE RESPIN button under New year and New team.
 * Watching the video to the end throws the draw back for nothing: no fee, and not one of the
 * three paid re-spins. Backing out earns nothing. Signed in only; a guest's tap opens the
 * sign in sheet. Three a day, which is the server's (ad_reward_*, kind 'ps_respin').
 *
 * THE VIDEO PLAYER IS A STAND-IN, installed as window.RTG_AD before the page loads, because
 * the real one (assets/rewarded.js) has no network behind it until the ad program approves
 * the site. What this proves is the page's half: when the button shows, and what a granted,
 * a closed and a capped answer each do to the run.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';

let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('Playwright is not available here, so this check cannot run.');
  process.exit(0);
}

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webp': 'image/webp' };
const INJECT = 'beginDraft,dataNow,R:R,getRun:()=>run,remaining:()=>R.remaining(run),'
  + "signIn:()=>{authState={ready:true,signedIn:true,name:'tester',userId:'u-tester'};},"
  + 'setPremium:(v)=>{premiumSet=v;},'
  + 'sheetOn:()=>!!document.querySelector(".sheet.on")';

/* The stand-in player. `__ad` is set by the test: whether a video can play, what the server
   says before it, and what the claim answers after it. */
const STUB = `
  window.__ad = { ready: false, status: { ok: true, left: 3 }, answer: { ok: true, left: 2 },
                  statusCalls: 0, watchCalls: 0 };
  window.RTG_AD = {
    ready: () => window.__ad.ready,
    status: () => { window.__ad.statusCalls++; return Promise.resolve(window.__ad.status); },
    watch: (kind) => { window.__ad.watchCalls++; window.__ad.kind = kind;
      return Promise.resolve(window.__ad.answer); },
    setPlayer: () => {}
  };`;

const browser = await pw.chromium.launch({ executablePath: CHROME });

async function open(withStub) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  if (withStub) await page.addInitScript(STUB);
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    let body = fs.readFileSync(f);
    if (rel === '/football/index.html') {
      const s = body.toString('utf8');
      if (s.indexOf('\nboot();') < 0) throw new Error('no boot() anchor to inject at');
      body = Buffer.from(s.replace('\nboot();', '\nwindow.__t={' + INJECT + '};\nboot();'), 'utf8');
    }
    await r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
  await page.goto('http://local.test/football/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.click('#frg-x', { timeout: 1500 }).catch(() => {});
  return { page, boom };
}
const draft = async (page) => {
  await page.evaluate(() => window.__t.beginDraft({}));
  await page.waitForTimeout(4500);
};
const state = (page) => page.evaluate(() => {
  const r = window.__t.getRun();
  return { id: r.currentDraw && r.currentDraw.team_season_id, paid: r.respinsUsed,
    free: r.freeRespins || 0, money: window.__t.remaining(),
    button: !!document.querySelector('#b-freespin'),
    note: (document.querySelector('#d-respin .freesay') || {}).textContent || '' };
});

console.log('\nNO VIDEO PLAYER, NO BUTTON');
{
  const { page, boom } = await open(false);
  await draft(page);
  ok('without the shared player the draft has no free respin', !(await state(page)).button);
  ok('and the paid re-spins are still there',
    await page.evaluate(() => document.querySelectorAll('#d-respin button.respin').length > 0));
  ok('no page errors', !boom.length, boom[0]);
  await page.close();
}

console.log('\nA PLAYER THAT CANNOT PLAY YET');
{
  const { page, boom } = await open(true);
  await draft(page);
  ok('ready() false hides the button', !(await state(page)).button);
  ok('no page errors', !boom.length, boom[0]);
  await page.close();
}

console.log('\nA GUEST');
{
  const { page, boom } = await open(true);
  await page.evaluate(() => { window.__ad.ready = true; });
  await draft(page);
  const before = await state(page);
  ok('a guest sees the button', before.button);
  await page.click('#b-freespin');
  await page.waitForTimeout(600);
  const after = await state(page);
  ok('a tap opens the sign in sheet', await page.evaluate(() => window.__t.sheetOn()));
  ok('and plays no video', (await page.evaluate(() => window.__ad.watchCalls)) === 0);
  ok('and the draw is untouched', after.id === before.id && after.free === 0);
  ok('no page errors', !boom.length, boom[0]);
  await page.close();
}

console.log('\nSIGNED IN');
{
  const { page, boom } = await open(true);
  await page.evaluate(() => { window.__ad.ready = true; window.__t.signIn(); });
  await draft(page);
  const s0 = await state(page);
  ok('a signed in player with one left today sees the button', s0.button);
  ok('the server was asked once, not once per paint',
    (await page.evaluate(() => window.__ad.statusCalls)) === 1);

  /* Backed out of the video: nothing. */
  await page.evaluate(() => { window.__ad.answer = { ok: false, reason: 'closed' }; });
  await page.click('#b-freespin');
  await page.waitForTimeout(800);
  const s1 = await state(page);
  ok('backing out of the video changes nothing', s1.id === s0.id && s1.free === 0 && s1.paid === 0);
  ok('and says why', /watch to the end/i.test(s1.note), s1.note);
  ok('and the button is back to try again', s1.button);
  ok('the video was asked for this game\'s kind',
    (await page.evaluate(() => window.__ad.kind)) === 'ps_respin');

  /* Watched to the end: a new draw for nothing. */
  await page.evaluate(() => { window.__ad.answer = { ok: true, left: 2 }; });
  await page.click('#b-freespin');
  await page.waitForTimeout(4500);
  const s2 = await state(page);
  ok('a watched video throws the draw back', s2.id && s2.id !== s0.id, s0.id + ' then ' + s2.id);
  ok('it is not one of the paid re-spins', s2.paid === 0);
  ok('and it costs nothing', Math.abs(s2.money - s0.money) < 1e-9, s0.money + ' then ' + s2.money);
  ok('it is counted as free', s2.free === 1);
  ok('the next paid re-spin still costs $5M',
    await page.evaluate(() => /\$5M/.test(document.querySelector('#d-respin .respin span').textContent)));
  ok('one left today keeps the button', s2.button);

  /* The last one today. */
  await page.evaluate(() => { window.__ad.answer = { ok: true, left: 0 }; });
  await page.click('#b-freespin');
  await page.waitForTimeout(4500);
  const s3 = await state(page);
  ok('the third one re-spins too', s3.id !== s2.id && s3.free === 2);
  ok('and then the button goes for the day', !s3.button);
  ok('no page errors', !boom.length, boom[0]);
  await page.close();
}

console.log('\nNONE LEFT TODAY');
{
  const { page, boom } = await open(true);
  await page.evaluate(() => {
    window.__ad.ready = true; window.__ad.status = { ok: false, reason: 'cap', left: 0 };
    window.__t.signIn();
  });
  await draft(page);
  ok('a server answer of cap shows no button', !(await state(page)).button);
  ok('no page errors', !boom.length, boom[0]);
  await page.close();
}

console.log('\nTHE ENGINE: WHAT A MODE HOLDS STILL');
{
  const { page, boom } = await open(false);
  /* One Franchise is a Pro mode, so this run is signed in and holds the bundle. */
  await page.evaluate(() => { window.__t.signIn(); window.__t.setPremium(['ps_premium']); });
  await page.evaluate(() => window.__t.beginDraft({ franchise: 'DAL' }));
  await page.waitForTimeout(4500);
  const r = await page.evaluate(() => {
    const R = window.__t.R, run = window.__t.getRun(), data = window.__t.dataNow();
    const out = { clubs: new Set(), same: 0, paid: run.respinsUsed, n: 0 };
    let last = run.currentDraw.team_season_id;
    for (let i = 0; i < 12 && R.canFreeRespin(run, data).ok; i++) {
      const d = R.freeRespin(run, data);
      out.clubs.add(d.franchise); if (d.team_season_id === last) out.same++;
      last = d.team_season_id; out.n++;
    }
    return { clubs: [...out.clubs], same: out.same, paid: run.respinsUsed, n: out.n };
  });
  ok('One Franchise: twelve free re-spins all land on the club', r.n === 12
    && r.clubs.length === 1 && r.clubs[0] === 'DAL', r.n + ' ' + r.clubs.join(','));
  ok('never straight back on the draw it threw away', r.same === 0);
  ok('and none of them is a paid re-spin', r.paid === 0);
  ok('no page errors', !boom.length, boom[0]);
  await page.close();
}

await browser.close();
console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
process.exit(fails ? 1 : 0);
