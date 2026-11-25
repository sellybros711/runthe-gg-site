#!/usr/bin/env node
/* Run The Course in a real browser: a whole shift, on a phone and a desktop.
 *
 *   node course/test/check-browser.mjs
 *
 * Chromium, 390x844 and 1440x900, against test/serve.mjs (the real save
 * route over an in-memory database). It holds what only a browser can:
 *
 *   it boots straight into day 1 with no console error and no guide open
 *   one thumb plays it: a drag walks, a tap travels, WASD on a desktop,
 *   walking into the cart rides it and Leave gets out
 *   a whole shift, played by the goal line bot, ends on the results card
 *   under 150 draw calls and 100,000 triangles, every control 44 by 44
 *   the first load is under 2 MB and playable in under 3 s on a 4G link
 *   a guest's course is on the device; a refresh mid-shift starts that day again
 *   a guest's shift sends nothing; a signed in shift is filed once, and a
 *   second device gets the course
 *
 * The frame rate on a real phone is not something a headless software
 * renderer can say. The page reports its own (?debug), for a person to read. */
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }

const problems = [], notes = [];
const ok = (cond, what) => { if (!cond) problems.push(what); return cond; };
const s = await serve(0);
const base = 'http://localhost:' + s.port + '/course/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(ctxOpts, { signedAs = null, throttle = false, url = base } = {}) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const errors = [], sizes = { bytes: 0, files: [] };
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('response', async r => { try { const b = await r.body(); sizes.bytes += b.length; sizes.files.push([r.url().replace(/^https?:\/\/[^/]+/, ''), b.length]); } catch (e) {} });
  /* the sign in scripts and the CDN are not this game's to test; a stand-in says who is signed in */
  await page.route(/cdn\.jsdelivr\.net|supabase\.co|\/arcade\/auth(-ui)?\.js/, r => r.abort());
  await page.addInitScript(id => {
    const st = { ready: true, resolved: true, signedIn: !!id, userId: id, name: id ? 'Tester' : null };
    window.RTG_AUTH = { state: () => st, token: () => (id ? 'token-' + id : null), onChange(f) { f(st); }, boot() {} };
  }, signedAs);
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
  }
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__course && window.__course.state() && window.__course.state().tick > 0, null, { timeout: 30000 });
  return { context, page, errors, sizes, bootMs: Date.now() - t0 };
}
const sum = page => page.evaluate(() => window.__course.summary());
async function playShift(page) {
  await page.evaluate(() => { window.__course.auto(true); window.__course.scale(16); });
  await page.waitForFunction(() => document.getElementById('results').classList.contains('on'), null, { timeout: 120000 });
  await page.waitForFunction(() => !/^Saving/.test(document.getElementById('resSave').textContent), null, { timeout: 15000 });
}

for (const [name, vp] of [['phone 390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['desktop 1440x900', { viewport: { width: 1440, height: 900 } }]]) {
  const phone = !!vp.isMobile;
  const { context, page, errors, sizes, bootMs } = await open(vp, { throttle: phone });
  if (phone) {
    notes.push('first load ' + (sizes.bytes / 1024).toFixed(0) + ' KB in ' + sizes.files.length + ' files, playable in ' + bootMs + ' ms on a 9 Mbps link with 150 ms latency');
    ok(sizes.bytes < 2e6, name + ': the first load is ' + sizes.bytes + ' bytes, over 2 MB');
    /* 3 s is the target. A CI runner draws with a software renderer on two shared cores, so its
       start says little about a phone: there the limit is 6 s, and the 3 s is held on a dev machine. */
    const limit = process.env.CI ? 6000 : 3000;
    ok(bootMs < limit, name + ': playable in ' + bootMs + ' ms, over ' + limit / 1000 + ' s on 4G');
    const cdp = await context.newCDPSession(page); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  /* straight into day 1: no guide, no card, the goal line says what to do */
  const first = await page.evaluate(() => ({ menu: document.getElementById('menu').classList.contains('on'), how: document.getElementById('how').hidden,
    results: document.getElementById('results').classList.contains('on'), goal: document.getElementById('goalText').textContent, day: document.getElementById('dayLabel').textContent,
    robots: document.querySelector('meta[name=robots]').content, title: document.title }));
  ok(!first.menu && first.how && !first.results, name + ': something opened by itself on the first screen');
  ok(/mower/i.test(first.goal), name + ': the goal line at dawn should send the player to the mower, it says "' + first.goal + '"');
  ok(first.day === 'Day 1', name + ': not day 1');
  ok(/noindex/.test(first.robots), name + ': the page is not noindexed');

  /* one thumb: a drag walks, a tap travels */
  const before = await page.evaluate(() => ({ x: window.__course.state().player.x, y: window.__course.state().player.y }));
  const cx = vp.viewport.width / 2, cy = vp.viewport.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 60, cy, { steps: 4 });
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('stick')).display) === 'block', name + ': no joystick under the thumb');
  await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ x: window.__course.state().player.x, y: window.__course.state().player.y, dir: window.__course.state().player.dir }));
  ok(after.x > before.x + 1.5 && Math.abs(after.y - before.y) < 0.6, name + ': a drag to the right did not walk east (' + JSON.stringify([before, after]) + ')');
  ok(after.dir === -1, name + ': letting go did not stop');
  await page.mouse.click(cx - 80, cy + 60);
  await page.waitForTimeout(900);
  const tapped = await page.evaluate(() => ({ x: window.__course.state().player.x, y: window.__course.state().player.y }));
  ok(tapped.x < after.x - 1, name + ': a tap did not travel there');
  if (!phone) {
    await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
    const w = await page.evaluate(() => window.__course.state().player.y);
    ok(w > tapped.y + 1, name + ': W did not walk north');
  }
  /* the cart: walk in, ride, Leave */
  await page.evaluate(() => { const c = window.__course, S = c.state(); S.player.x = S.cart.x - 3; S.player.y = S.cart.y; });   // stand beside the cart (the check's shortcut, not a command)
  await page.keyboard.down('KeyD'); await page.waitForFunction(() => window.__course.state().player.mode === 'cart', null, { timeout: 5000 }).catch(() => {}); await page.keyboard.up('KeyD');
  ok((await sum(page)).mode === 'cart', name + ': walking into the cart did not ride it');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('leave')).display) === 'block', name + ': no Leave button in the cart');
  await page.click('#leave'); await page.waitForTimeout(300);
  ok((await sum(page)).mode === 'walk', name + ': Leave did not get out of the cart');

  /* every control is at least 44 by 44 */
  await page.click('#menuBtn');
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && !b.closest('#debug')).map(b => { const r = b.getBoundingClientRect(); return [b.id || b.textContent, Math.round(r.width), Math.round(r.height)]; }).filter(v => v[1] < 44 || v[2] < 44));
  ok(small.length === 0, name + ': controls under 44 px: ' + JSON.stringify(small));
  ok(await page.evaluate(() => document.getElementById('how').hidden), name + ': the guide is open without its button');
  await page.click('#howBtn'); ok(await page.evaluate(() => !document.getElementById('how').hidden), name + ': How it works did not open');
  await page.click('#closeMenu');

  /* a refresh mid-shift starts that same day again */
  await page.reload(); await page.waitForFunction(() => window.__course && window.__course.state() && window.__course.state().tick > 0);
  const re = await sum(page);
  ok(re.no === 1 && re.tick < 60, name + ': a refresh did not restart day 1 (' + JSON.stringify(re) + ')');

  /* a whole shift on the goal line alone */
  await playShift(page);
  const res = await page.evaluate(() => ({ title: document.getElementById('resTitle').textContent, rows: [...document.querySelectorAll('#resRows span')].map(x => x.textContent),
    save: document.getElementById('resSave').textContent, goal: document.getElementById('resGoal').textContent, info: window.__course.info(), tally: window.__course.state().tally,
    stored: JSON.parse(localStorage.getItem('rtc_course_v1')) }));
  ok(res.title === 'Day 1 done', name + ': the results card says "' + res.title + '"');
  for (const label of ['Rounds played', 'Average round', 'Cash earned', 'Tips', 'Star rating', 'Lowest round']) ok(res.rows.includes(label), name + ': the results card has no ' + label);
  ok(/Goal met/.test(res.goal), name + ': the bot missed the day 1 goal: ' + res.goal);
  ok(res.tally.stuck === 0 && res.tally.cutOff === 0, name + ': a group was stuck or cut off');
  ok(res.tally.rounds >= 2, name + ': fewer than two rounds were played');
  ok(res.info.calls < 150 && res.info.triangles < 100000, name + ': over the draw budget: ' + JSON.stringify(res.info));
  ok(/on this device/.test(res.save), name + ': a guest\'s save line says "' + res.save + '"');
  ok(res.stored && res.stored.course.shiftsFiled === 1 && res.stored.queue.length === 1, name + ': the course is not on the device after the shift');
  notes.push(name + ': day 1 ' + res.rows.join(' ').replace(/\s+/g, ' ') + ' · ' + res.info.calls + ' draw calls, ' + res.info.triangles + ' triangles');
  await page.click('#nextDay');
  await page.waitForFunction(() => window.__course.state().no === 2 && window.__course.state().tick > 0);
  ok((await sum(page)).no === 2, name + ': Next day did not start day 2');
  ok(errors.length === 0, name + ': console errors: ' + errors.slice(0, 4).join(' | '));
  ok(!s.log.some(l => /shift|state/.test(l)), name + ': a guest sent a save: ' + s.log.join(', '));
  await context.close();
}

/* signed in: the shift is filed once, by the server's own replay, and a second device gets it */
{
  s.log.length = 0;
  const a = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { signedAs: 'u1' });
  await a.page.waitForFunction(() => window.__course.store.pending() === 0);
  await playShift(a.page);
  const save = await a.page.evaluate(() => document.getElementById('resSave').textContent);
  ok(/Saved to your account/.test(save), 'signed in: the save line says "' + save + '"');
  ok(s.db.shifts.length === 1 && s.db.shifts[0].verified === 'replay', 'signed in: the server did not file exactly one replayed shift');
  ok(s.log.filter(l => l === 'POST shift').length === 1, 'signed in: the shift was sent ' + s.log.filter(l => l === 'POST shift').length + ' times');
  const mine = await a.page.evaluate(() => window.__course.store.course());
  ok(mine.cash === s.db.courses.get('u1').cash && mine.shiftsFiled === 1, 'signed in: the page\'s course is not the server\'s');
  ok(a.errors.length === 0, 'signed in: console errors: ' + a.errors.slice(0, 4).join(' | '));
  const b = await open({ viewport: { width: 1440, height: 900 } }, { signedAs: 'u1' });
  await b.page.waitForFunction(() => window.__course.state().no === 2, null, { timeout: 10000 }).catch(() => {});
  const there = await b.page.evaluate(() => ({ no: window.__course.state().no, cash: window.__course.state().cash0 }));
  ok(there.no === 2 && there.cash === mine.cash, 'a second device did not get the course: ' + JSON.stringify(there));
  notes.push('signed in: one POST shift, filed by replay, and a second device opened on day 2 with $' + there.cash);
  await a.context.close(); await b.context.close();
}

await browser.close(); await s.close();
for (const n of notes) console.log('  ' + n);
if (problems.length) { console.error('Run The Course browser check: ' + problems.length + ' problem(s)\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('Run The Course browser check: a whole shift on a phone and a desktop, saved, no console errors.');
