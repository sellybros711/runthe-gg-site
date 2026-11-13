#!/usr/bin/env node
/* The Daily Last Shot in Chromium, on a phone (390x844, touch) and a desktop
 * (1440x900), against the Arcade Lab's real daily handler on an in-memory
 * database (test/fake-arcade.mjs), routed into the page with page.route. The
 * server half runs the real daily.js, so a forged score is refused the way
 * the server refuses it.
 *
 * Covers: the home card (today's number and title, the countdown, nothing
 * opening by itself), the daily clipboard (spots, clock, score, no scout),
 * practice (random seeds, unlimited, labelled, never posted), the start guard
 * (once, not again on a reload), the inline confirm, errors on a 400, a 429
 * and a dropped connection (one line, the play kept, nothing played), a forged
 * score refused, the scored run posting the score daily.js gives, the result
 * card (stars, score text, today's defense, the rank, the top ten with me,
 * gems), the share text (no spoiler, the arcade link), Beat my play from the
 * daily, practice after, a reload after playing, already played from another
 * device, and #daily straight in.
 *
 *   node functions/_lastshot/test/check-daily.mjs   (SHOTS=dir for screenshots) */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';
import { fakeArcade } from './fake-arcade.mjs';
import { dailyConfig, dailyScenario, replay, scoreText, squares, gems, cleanPlay } from '../daily.js';
import { simulate } from '../sim.js';
import { scoreOf } from '../daily.js';
import { decode } from '../challenge.js';
import { SCHEME_NAMES } from '../scenario.js';
import { dateKey, seedFor, dayNumber } from '../../_arcadelab/shared/seed.js';

const PORT = 8795, BASE = 'http://localhost:' + PORT;
const OUT = process.env.SHOTS || null;
const { server } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const DASHES = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');

/* The day as the server sees it. */
const TODAY = dateKey(Date.now()), SEED = seedFor(TODAY, 'last-shot'), CFG = dailyConfig(SEED), NUM = dayNumber(TODAY);
const SC = dailyScenario(CFG);

/* Everybody on the board: 40 testers before us, and a token per signed in tester. */
const TOKENS = { 'tok-dev': 'dev', 'tok-dev2': 'dev2', 'tok-dev3': 'dev3' };
const names = {}; for (let i = 1; i <= 40; i++) names['u' + i] = 'Coach ' + i;
const fake = fakeArcade({ roles: { dev2: 'tester', dev3: 'tester', ...Object.fromEntries(Object.keys(names).map(u => [u, 'tester'])) }, names,
  uidOf: h => { const m = /^Bearer (.+)$/.exec(h.authorization || ''); return m ? TOKENS[m[1]] || null : null; } });
for (let i = 1; i <= 40; i++) {
  await fake.db.insertRun({ user_id: 'u' + i, guest_id: null, game_id: 'last-shot', date_key: TODAY, mode: 'daily', seed: SEED,
    score: i % 3 === 0 ? 10 + i : 1000 + (i % 4) * 100 + 20 + i, detail_json: {}, input_log_json: [], duration_ms: 9000, gems_awarded: 5, client_version: 'x', tester: true, restarted: false });
}
let abortNext = false;

/* A screen for O2 off O5, the pass and the shot: legal on every set. */
const P = (x, y) => ({ x, y });
function refPlay(tx = 36, ty = 22) {
  const a = SC.spots.O2, scr = P((a.x + tx) / 2, (a.y + ty) / 2);
  return { spots: SC.spots, goAt: Math.min(SC.clock, 5), steps: [{ kind: 'screen', who: 'O5', pts: [scr] }, { kind: 'move', who: 'O2', pts: [P(scr.x - 1, scr.y - 1), P(tx, ty)] },
    { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] };
}

async function run(name, viewport, mobile, uid) {
  console.log('\n' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const tok = Object.keys(TOKENS).find(k => TOKENS[k] === uid);
  /* the arcade's sign in, signed in as this tester (no Supabase in a check) */
  await ctx.route(/\/arcade\/auth\.js/, r => r.fulfill({ contentType: 'text/javascript', body:
    'window.RTG_AUTH={API_VERSION:1,boot:function(){return true},state:function(){return{resolved:true,signedIn:true}},onChange:function(f){f(this.state());return function(){}},token:function(){return ' + JSON.stringify(tok) + '}};' }));
  await ctx.route(/\/api\/arcade\//, async r => {
    if (abortNext) { abortNext = false; return r.abort(); }
    const q = r.request(), u = new URL(q.url());
    const out = await fake.answer({ method: q.method(), path: u.pathname.slice('/api/arcade/'.length), query: Object.fromEntries(u.searchParams),
      body: q.method() === 'GET' ? null : JSON.parse(q.postData() || '{}'), headers: q.headers() });
    return r.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::|status of (400|409|429)/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  const shot = async f => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '-' + f + '.png') }); };
  const L = (fn, a) => page.evaluate(fn, a);
  const boot = async () => { await page.reload(); await page.waitForFunction(() => window.__lastShot && window.__lastShot.dayState !== 'loading'); };
  const starts = () => fake.db.starts('u:' + uid, 'last-shot', TODAY);
  const clip = () => L(() => navigator.clipboard.readText());

  const posts0 = fake.posts.length;
  await page.goto(BASE + '/last-shot');
  await L(() => { try { localStorage.clear(); } catch (e) {} });
  await boot();

  // home: the Daily card on top, today's number and title, the countdown
  ok((await L(() => window.__lastShot.dayState)) === 'ok', 'today loaded');
  const hd = await page.locator('#hDaily').boundingBox(), hp = await page.locator('#hPlay').boundingBox();
  ok(hd.y < hp.y, 'the Daily card is at the top of home');
  ok((await page.textContent('#hDailyName')) === 'Daily Last Shot #' + NUM && (await page.textContent('#hDailyTitle')) === CFG.title, 'the card: Daily Last Shot #' + NUM + ', ' + CFG.title);
  ok((await page.textContent('#hDailyGo')) === 'Play' && await page.isHidden('#hDailySq'), 'Play, and no squares before playing');
  ok(/^Next one in \d{1,2}:\d\d:\d\d$/.test(await page.textContent('#hDailyCount')), 'the countdown: ' + await page.textContent('#hDailyCount'));
  ok((await L(() => document.querySelectorAll('.sheet.on, .fsheet.on').length)) === 0, 'no guide opens by itself');
  const call = fake.calls.find(c => c.path === 'last-shot/today' && c.uid === uid);
  ok(!!call && /^[0-9a-f]{32}$/.test(call.guest), 'today carries the bearer and the guest id header');
  await shot('1-home');

  // the daily clipboard: the day's spots, clock and score, no scout
  await page.click('#hDaily');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await L(() => window.__lastShot.mode)) === 'daily' && await page.isVisible('#dayBar') && await page.isHidden('#lvlBar'), 'the Daily opens on the clipboard');
  ok((await page.textContent('#dayNo')) === '#' + NUM && (await page.textContent('#dayTitle')) === CFG.title, 'the day bar: #' + NUM + ' and the title');
  ok((await page.textContent('#clock')) === CFG.clock.toFixed(1) && Number(await page.textContent('#sUs')) === 88 - CFG.down, 'the scoreboard: ' + await page.textContent('#sUs') + '-88, ' + await page.textContent('#clock'));
  ok(JSON.stringify(await L(() => window.__lastShot.play.spots)) === JSON.stringify(SC.spots) && (await L(() => window.__lastShot.play.steps.length)) === 0, 'a blank play on the day\'s set');
  ok((await page.textContent('#bRun')) === 'Practice' && await page.isDisabled('#bShot'), 'Run It is Practice, and Take your shot waits for a play');
  ok((await starts()) === 1, 'a fresh daily posts start once');

  await L(p => window.__lastShot.setPlay(p), refPlay());
  await L(() => window.__lastShot.board.draw());
  ok(!(await page.isDisabled('#bShot')) && !(await page.isDisabled('#bRun')), 'a legal play: Practice and Take your shot are ready');
  await shot('2-clipboard');

  // practice: random seeds, as many as you like, labelled, never posted
  const seeds = [];
  for (let i = 0; i < 2; i++) {
    await page.click('#bRun');
    await page.waitForSelector('#sheet.on', { timeout: 40000 });
    seeds.push(await L(() => window.__lastShot.result.seed));
    ok((await page.textContent('.practag')) === 'Practice · not scored' && /Practice defense: /.test(await page.textContent('#card .facts')), 'practice ' + (i + 1) + ' is labelled, and its defense is the practice roll\'s');
    ok(await page.isHidden('#bShare') || (await page.locator('#bShare').count()) === 0, 'a practice card has no share line');
    await page.click('#bBack');
  }
  ok(seeds.every(s => s !== SEED) && seeds[0] !== seeds[1], 'practice runs on random seeds, never the day\'s');
  ok(fake.posts.length === posts0, 'practice posts nothing');

  // the confirm: inline, not a popup
  await page.click('#bShot');
  ok(await page.isVisible('#dayConfirm') && await page.isHidden('#dayShot') && (await page.textContent('#dayConfirm b')) === 'One shot. Ready?', 'Take your shot asks One shot. Ready? inline');
  ok((await L(() => document.querySelectorAll('.sheet.on, .fsheet.on').length)) === 0, 'the confirm is not a popup');
  await shot('3-confirm');
  await page.click('#bShotNo');
  ok(await page.isVisible('#dayShot') && await page.isHidden('#dayConfirm'), 'Not yet steps back');
  await page.click('#bShot');

  // errors: one line, the play kept, nothing played, nothing filed
  const steps0 = await L(() => window.__lastShot.play.steps.length);
  for (const [fail, line] of [[{ status: 400, error: 'stale_day' }, 'A new day started. Reload for today\'s.'], [{ status: 429, error: 'slow_down' }, 'Too many tries. Wait a few minutes.'], ['abort', 'No connection. Your play is kept. Try again.']]) {
    if (fail === 'abort') abortNext = true; else fake.failNext = fail;
    await page.click('#bShotYes');
    await page.waitForFunction(() => window.__lastShot.daily && window.__lastShot.daily.err, null, { timeout: 15000 });
    ok((await page.textContent('#dayErr')) === line && await page.isVisible('#dayErr'), 'a ' + (fail.status || 'dropped') + ': ' + line);
    ok((await L(() => window.__lastShot.play.steps.length)) === steps0 && (await L(() => window.__lastShot.phase)) === null && await page.isVisible('#board'), 'the play is kept and nothing played');
  }
  ok((await fake.db.getRun({ uid }, 'last-shot', TODAY)) === null, 'nothing was filed');

  // a forged score is refused the way the server refuses it
  const forged = await L(async ({ seed, date, play }) => {
    const r = await fetch('/api/arcade/last-shot/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + window.RTG_AUTH.token(), 'X-Arcade-Guest': localStorage.getItem('arcade_lab_guest_v1') },
      body: JSON.stringify({ mode: 'daily', dateKey: date, seed, inputs: [play], score: 1399, durationMs: 9000 }) });
    return { status: r.status, body: await r.json() };
  }, { seed: SEED, date: TODAY, play: refPlay() });
  ok(forged.status === 400 && forged.body.error === 'score_mismatch' && !(await fake.db.getRun({ uid }, 'last-shot', TODAY)), 'a forged score: score_mismatch, nothing filed');

  // the scored run: filed with the score daily.js gives, then played
  const before = fake.posts.length;
  await page.click('#bShotYes');
  await page.waitForSelector('#card.daily', { timeout: 60000 });
  const post = fake.posts[before];
  const expect = replay(SEED, post.inputs, CFG);
  ok(post.seed === SEED && post.dateKey === TODAY && post.mode === 'daily' && post.score === expect.score && post.score === scoreOf(simulate(SC, cleanPlay(refPlay()), SEED)), 'the post carries the day\'s seed and the score the server gets: ' + post.score);
  ok(post.durationMs >= 2400 && /^last-shot\//.test(post.clientVersion), 'durationMs ' + post.durationMs + ', clientVersion ' + post.clientVersion);
  const filed = await fake.db.getRun({ uid }, 'last-shot', TODAY);
  ok(!!filed && filed.score === post.score, 'the run is filed');
  ok((await L(() => window.__lastShot.result.seed)) === SEED, 'the court played the day\'s seed');
  await page.waitForFunction(() => /^#\d+ of \d+ today$/.test((document.getElementById('dRank') || {}).textContent || ''), null, { timeout: 10000 });
  const d = expect.detail;
  ok((await page.textContent('#card .verdict')) === (d.outcome === 'win' ? 'WINNER' : 'LOSE'), 'the verdict: ' + await page.textContent('#card .verdict'));
  ok((await page.locator('#card .star.got').count()) === (d.outcome === 'win' ? d.stars : 0) && (await page.locator('#card .checks li').count()) === 3, 'the stars and the checklist: ' + d.stars);
  ok((await page.textContent('#dScore')) === scoreText(post.score), 'the score text: ' + scoreText(post.score));
  ok((await page.textContent('#dScheme')) === 'Today they played: ' + d.schemeName, 'the defense, after the run: ' + d.schemeName);
  const above = await fake.db.countAbove('last-shot', TODAY, post.score, true), total = await fake.db.countAll('last-shot', TODAY, true);
  ok((await page.textContent('#dRank')) === '#' + (above + 1) + ' of ' + total + ' today', 'the rank: ' + await page.textContent('#dRank'));
  const rows = await page.locator('.dboard li').count();
  ok(rows >= 10 && rows <= 11 && (await page.locator('.dboard li.me').count()) === 1 && (await page.textContent('.dboard li.me .dnm')) === 'You', 'the top ten, with me highlighted (' + rows + ' rows)');
  ok((await page.textContent('#dGems')) === '+' + gems(post.score) + ' gems', 'gems earned: ' + await page.textContent('#dGems'));
  ok(!DASHES.test(await page.textContent('#card')), 'no dashes on the card');
  await page.waitForTimeout(1600);
  await shot('4-result');
  await L(() => { const c = document.getElementById('card'); c.scrollTop = c.scrollHeight; });
  await shot('4-result-board');

  // share: the number, the squares, the score text, the arcade; no spoiler
  await page.click('#bDayShare');
  const shared = await clip();
  const want = ['Last Shot #' + NUM, squares(d).join(''), scoreText(post.score), 'https://runthe.gg/arcade/'].join('\n');
  ok(shared === want, 'the share text: ' + JSON.stringify(shared));
  ok(!Object.values(SCHEME_NAMES).some(n => shared.includes(n)) && !/last-shot/.test(shared), 'no defense and no gated path in it');

  // Beat my play from the daily: the day's seed, the situation, no scheme
  await page.click('#bBeat');
  const beat = await clip();
  const code = (/#beat=([A-Za-z0-9_-]+)$/.exec(beat) || [])[1];
  const ch = code ? decode(code) : null;
  ok(beat.startsWith('I drew this one. Beat it.\n' + BASE + '/last-shot#beat=') && !!ch, 'Beat my play copies the line and a link');
  ok(ch && ch.seed === SEED && ch.scheme === null && ch.clock === CFG.clock && ch.down === CFG.down && ch.set === CFG.set && ch.play.steps.length === 4, 'the link: the day\'s seed and spot, no scheme');

  // practice after: allowed, the scored button gone
  await page.click('#bDayPractice');
  ok(await page.isVisible('#board') && await page.isHidden('#dayShot') && await page.isHidden('#dayConfirm') && (await page.textContent('#dayDoneText')) === 'Filed: ' + scoreText(post.score), 'practice after: Take your shot is gone, the filed score shows');
  await page.click('#bRun');
  await page.waitForSelector('#sheet.on .practag', { timeout: 40000 });
  ok(fake.posts.length === before + 1, 'practice after posts nothing');
  await page.click('#bBack');
  await page.click('#bDayResult');
  ok(await page.isVisible('#card.daily'), 'Your result opens the card again');

  // a reload after playing: home shows what was filed; the card and the board come back
  await boot();
  ok((await page.textContent('#hDailyTitle')) === scoreText(post.score) && (await page.textContent('#hDailySq')) === squares(d).join('') && (await page.textContent('#hDailyGo')) === 'Result', 'home after playing: the squares and the score text');
  await shot('5-home-played');
  await page.click('#hDaily');
  await page.waitForSelector('#card.daily', { timeout: 10000 });
  ok((await page.textContent('#dScore')) === scoreText(post.score) && await page.isHidden('#dayShot'), 'a second visit: the filed card, no scored button');
  await page.waitForFunction(() => document.querySelectorAll('.dboard li').length > 0, null, { timeout: 10000 });
  ok((await page.locator('.dboard li.me').count()) === 1 && await page.isVisible('#bBeat'), 'the board, and Beat my play from the kept play');
  const st = await starts();
  ok(st === 1, 'reloads never post start again (still ' + st + ')');

  // posting again is already_played
  const again = await L(async ({ seed, date, play, score }) => {
    const r = await fetch('/api/arcade/last-shot/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + window.RTG_AUTH.token() },
      body: JSON.stringify({ mode: 'daily', dateKey: date, seed, inputs: [play], score, durationMs: 9000 }) });
    return r.status;
  }, { seed: SEED, date: TODAY, play: post.inputs[0], score: post.score });
  ok(again === 409, 'a second run is already_played: ' + again);

  // #daily goes straight to the Daily
  await page.goto(BASE + '/last-shot#daily');
  await page.waitForSelector('#dayBar', { state: 'visible', timeout: 10000 });
  ok((await L(() => window.__lastShot.mode)) === 'daily', '#daily opens the Daily');
  await page.click('#bDayHome');
  ok(await page.isVisible('#vHome') && (await L(() => location.hash)) === '', 'Home clears #daily');

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* Filed on another device first: the button finds it already played and shows it. */
async function otherDevice() {
  console.log('\nalready played on another device, desktop');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/\/arcade\/auth\.js/, r => r.fulfill({ contentType: 'text/javascript', body:
    'window.RTG_AUTH={API_VERSION:1,boot:function(){return true},state:function(){return{resolved:true,signedIn:true}},onChange:function(f){f(this.state());return function(){}},token:function(){return "tok-dev3"}};' }));
  await ctx.route(/\/api\/arcade\//, async r => {
    const q = r.request(), u = new URL(q.url());
    const out = await fake.answer({ method: q.method(), path: u.pathname.slice('/api/arcade/'.length), query: Object.fromEntries(u.searchParams),
      body: q.method() === 'GET' ? null : JSON.parse(q.postData() || '{}'), headers: q.headers() });
    return r.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::|status of (400|409|429)/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  await page.goto(BASE + '/last-shot#daily');
  await page.waitForSelector('#dayBar', { state: 'visible', timeout: 10000 });
  await page.evaluate(p => window.__lastShot.setPlay(p), refPlay());
  // the other device files a different play
  const other = refPlay(31, 12), score = replay(SEED, [cleanPlay(other)], CFG).score;
  const filed = await fake.answer({ method: 'POST', path: 'last-shot/run', headers: { authorization: 'Bearer tok-dev3' },
    body: { mode: 'daily', dateKey: TODAY, seed: SEED, inputs: [cleanPlay(other)], score, durationMs: 9000 } });
  ok(filed.status === 200, 'the other device filed ' + score);
  await page.click('#bShot');
  await page.click('#bShotYes');
  await page.waitForSelector('#card.daily', { timeout: 20000 });
  ok((await page.textContent('#dScore')) === scoreText(score) && await page.isHidden('#dayShot'), 'already played: the filed result shows, the button is gone');
  ok(await page.isHidden('#dayErr'), 'and no error line');
  ok((await page.locator('#bBeat').count()) === 0, 'no Beat my play without the filed play on this device');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

try {
  await run('phone', { width: 390, height: 844 }, true, 'dev');
  await run('desktop', { width: 1440, height: 900 }, false, 'dev2');
  await otherDevice();
} finally {
  await browser.close(); server.close();
}
console.log(fails ? '\n' + fails + ' failed' : '\nall good');
process.exit(fails ? 1 : 0);
