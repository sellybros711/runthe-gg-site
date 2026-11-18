#!/usr/bin/env node
/* Last Shot in Chromium on a phone (390x844, touch): draw a play with all
 * four tools by pointer, run it, watch it to the result, check the reason,
 * the scheme, the share line and the seed panel, replay, go back to the
 * clipboard with the play kept, and check nothing threw. Then a guest (the
 * game is live): the page and a module, and the 404 for a server file.
 *
 * First THE FEEL, on a phone and on a desktop (1440x900): the starter play a
 * first-time player finds on the clipboard, the Go at chip and the hold, 2x
 * and mute (both remembered), the shot readout at the release, GAME WINNER,
 * the answer cutaway and its tap to skip, and the time from a tap on Run It
 * to the result at 1x and 2x.
 *   node functions/_lastshot/test/check-browser.mjs   (SHOTS=dir for screenshots) */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';

const PORT = 8792, base = 'http://localhost:' + PORT;
const SHOTS = process.env.SHOTS || null;
const { server, setWho } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
/* The two banned dashes, built from their code points so this file holds neither. */
const DASHES = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };

/* The first seed (from 1) whose run ends as `how` wants, through the page's own sim. */
const seedFor = (page, how) => page.evaluate(how => { for (let s = 1; s < 400; s++) { const r = window.__lastShot.simulate(s); if (how === 'answer' ? !!r.answer : r.how === how) return s; } return null; }, how);
const goAt = (page, g) => page.evaluate(g => { const p = JSON.parse(JSON.stringify(window.__lastShot.play)); p.goAt = g; window.__lastShot.setPlay(p); }, g);
/* Run with a seed from the page, wait for the result, and say how long it took from the call. */
async function timed(page, seed) {
  await page.evaluate(s => window.__lastShot.run(s), seed);
  await page.waitForSelector('#sheet.on', { timeout: 30000 });
  return page.evaluate(() => window.__lastShot.timing);
}
const TIMES = [];

async function feel(name, viewport, mobile) {
  console.log('\nthe feel, ' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  const snap = async f => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '-' + f + '.png' }); };
  setWho('dev');
  await page.goto(base + '/last-shot');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.view);

  // home: Play first and big, My Playbooks under it and smaller
  const hp = await page.locator('#hPlay').boundingBox(), hb = await page.locator('#hBooks').boundingBox();
  ok(hp.y < hb.y && hp.height > hb.height, 'home puts Play first and biggest');
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });

  // first run: the starter play, ready, Run It pulsing, and no popup
  const st = await page.evaluate(() => ({ kinds: window.__lastShot.play.steps.map(s => s.kind).join(' '), goAt: window.__lastShot.play.goAt, beats: window.__lastShot.play.steps.map(s => s.beat).join('') }));
  ok(st.kinds === 'screen move pass shoot' && st.goAt === 6 && st.beats === '1111', 'a first-time player finds the starter pin-down holding till 6.0: ' + JSON.stringify(st));
  ok(!(await page.isDisabled('#bRun')) && /\bpulse\b/.test(await page.getAttribute('#bRun', 'class')), 'Run It is ready and pulsing');
  ok((await page.locator('.sheet.on, .fsheet.on').count()) === 0, 'no guide or popup opened by itself');
  ok((await page.textContent('#goChip')) === 'Go at 6.0' && (await page.textContent('#goLab')) === 'Hold till 6.0', 'the Go at chip reads Go at 6.0, Hold till 6.0');
  await snap('1-starter');

  // Go at: half a second a tap, clamped to 1.0 and the clock
  await page.click('#goMinus');
  ok((await page.evaluate(() => window.__lastShot.play.goAt)) === 5.5 && (await page.textContent('#goChip')) === 'Go at 5.5', 'minus holds half a second longer');
  await page.click('#goPlus'); await page.click('#goPlus');
  ok((await page.evaluate(() => window.__lastShot.play.goAt)) === 6.5, 'plus goes half a second sooner');
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('last_shot_play_v1')).goAt)) === 6.5, 'Go at is saved with the play');
  await goAt(page, 21.5); await page.click('#goPlus');
  ok((await page.textContent('#goChip')) === 'Go at 22.0' && (await page.textContent('#goLab')) === 'Go at once' && await page.isDisabled('#goPlus'), 'Go at stops at the clock, and then it goes at once');
  await goAt(page, 1.5); await page.click('#goMinus');
  ok((await page.evaluate(() => window.__lastShot.play.goAt)) === 1 && await page.isDisabled('#goMinus'), 'Go at stops at 1.0');

  // a play that goes at once skips the hold; one that holds runs the clock down fast first
  await goAt(page, 22);
  await page.evaluate(() => window.__lastShot.run(7));
  ok((await page.evaluate(() => window.__lastShot.phase)) === 'beat', 'Go at the clock skips the hold');
  await page.click('#sheet', { timeout: 100 }).catch(() => {});
  await goAt(page, 6);
  await page.evaluate(() => window.__lastShot.run(7));
  ok((await page.evaluate(() => window.__lastShot.phase)) === 'hold', 'a held play starts with the hold');
  await page.waitForTimeout(350);
  const mid = Number(await page.textContent('#clock'));
  ok(mid < 22 && mid > 6, 'the clock races down through the hold: ' + mid);
  await page.waitForFunction(() => window.__lastShot.phase === 'play', null, { timeout: 2000 });
  const held = await page.evaluate(() => performance.now());
  ok(Number(await page.textContent('#clock')) <= 6.0, 'the play starts at Go at');
  void held;
  await page.waitForSelector('#sheet.on', { timeout: 30000 });

  // 2x and mute, remembered
  ok((await page.textContent('#bSpeed')) === '1x' && (await page.getAttribute('#bMute', 'aria-pressed')) === 'false', 'speed starts at 1x and sound starts on');
  await page.click('#bSpeed'); await page.click('#bMute');
  ok((await page.evaluate(() => [localStorage.getItem('last_shot_speed'), localStorage.getItem('last_shot_mute')]).then(a => a.join())) === '2,1', '2x and mute are stored');
  await page.reload();
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  ok((await page.textContent('#bSpeed')) === '2x' && (await page.getAttribute('#bMute', 'aria-pressed')) === 'true', '2x and mute are remembered');
  ok((await page.evaluate(() => window.__lastShot.sound.state)) === 'none', 'no AudioContext before a gesture');
  await page.click('#hPlay');
  ok((await page.evaluate(() => window.__lastShot.sound.state)) === 'none', 'muted, a tap makes no sound at all');
  await page.click('#bMute');
  ok((await page.evaluate(() => window.__lastShot.sound)).state !== 'none' && (await page.getAttribute('#bMute', 'aria-pressed')) === 'false', 'unmuting is a tap, and it makes the AudioContext');
  await page.click('#bSpeed');
  ok(await page.evaluate(() => window.__lastShot.speed) === 1, 'back to 1x');

  // the shot readout at the release, then GAME WINNER on a make in the window
  await goAt(page, 6);
  const win = await seedFor(page, 'make');
  ok(win != null, 'a seed for a winner: ' + win);
  await page.evaluate(() => { window.__pops = []; const el = document.getElementById('pop'); new MutationObserver(() => window.__pops.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); });
  await page.evaluate(s => window.__lastShot.run(s), win);
  await page.waitForFunction(() => document.getElementById('pop').classList.contains('shot'), null, { timeout: 15000 });
  await page.evaluate(() => { window.__lastShot.paused = true; });
  const read = await page.textContent('#pop');
  ok(/^(Wide open|Open look|Hand in the face|Contested|Bail out) · \d+%$/.test(read), 'the shot readout at the release: ' + read);
  const ev = await page.evaluate(() => window.__lastShot.result.events.find(e => e.shot));
  ok(read.endsWith(' · ' + Math.round(ev.p * 100) + '%'), 'the readout is the sim\'s own number');
  await snap('2-release');
  await page.evaluate(() => { window.__lastShot.paused = false; });
  await page.waitForSelector('#big:not([hidden])', { timeout: 15000 });
  ok((await page.textContent('#big')) === 'GAME WINNER', 'GAME WINNER on a make in the window');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__lastShot.paused = true; });
  ok(Number(await page.textContent('#sUs')) === (await page.evaluate(() => window.__lastShot.result.us)), 'the score has flipped');
  await snap('3-winner');
  await page.evaluate(() => { window.__lastShot.paused = false; });
  await page.waitForSelector('#sheet.on', { timeout: 15000 });
  ok((await page.textContent('.verdict')) === 'WINNER' && await page.isHidden('#big'), 'then the result, the banner gone');

  // the answer cutaway: their ball, their clock, their shot, then the word
  await goAt(page, 9);
  const ans = await seedFor(page, 'answer');
  ok(ans != null, 'a seed for an early make: ' + ans);
  const A = await page.evaluate(s => window.__lastShot.simulate(s).answer, ans);
  await page.evaluate(s => window.__lastShot.run(s), ans);
  await page.waitForSelector('#cut:not([hidden])', { timeout: 20000 });
  ok((await page.textContent('#cutHead')) === 'Their ball, ' + A.startAt.toFixed(1) + ' left', 'the cutaway says their ball and the time left: ' + await page.textContent('#cutHead'));
  await page.waitForTimeout(500);
  const ck = Number(await page.textContent('#clock'));
  ok(ck <= A.startAt && ck >= A.at, 'their clock runs from ' + A.startAt + ' to ' + A.at + ': ' + ck);
  await page.waitForSelector('#cutV.on', { timeout: 5000 });
  await page.evaluate(() => { window.__lastShot.paused = true; });
  const said = await page.textContent('#cutV');
  ok(said === (A.scored ? 'GOOD' : 'They missed. You win'), 'and how it went: ' + said);
  await snap('4-cutaway');
  await page.evaluate(() => { window.__lastShot.paused = false; });
  await page.waitForSelector('#sheet.on', { timeout: 10000 });
  ok(await page.isHidden('#cut'), 'the cutaway is gone on the result');
  // tap to skip
  await page.evaluate(s => window.__lastShot.run(s), ans);
  await page.waitForSelector('#cut:not([hidden])', { timeout: 20000 });
  const t0 = Date.now();
  await page.click('#cut');
  await page.waitForSelector('#sheet.on', { timeout: 3000 });
  ok(Date.now() - t0 < 1500, 'a tap skips the cutaway: result in ' + (Date.now() - t0) + ' ms');

  // the retry loop: tap Replay to the result, the starter at 1x and 2x
  await page.evaluate(s => window.__lastShot.setPlay(window.__lastShot.starter()), 0);
  const miss = await seedFor(page, 'miss');
  for (const sp of [1, 2]) {
    if ((await page.evaluate(() => window.__lastShot.speed)) !== sp) await page.click('#bSpeed');
    for (const [kind, seed] of [['make', win], ['miss', miss]]) {
      await page.evaluate(s => window.__lastShot.run(s), seed);
      await page.waitForSelector('#sheet.on', { timeout: 30000 });
      const t1 = Date.now();
      await page.click('#bReplay');
      const started = await page.evaluate(() => window.__lastShot.phase);
      await page.waitForSelector('#sheet.on', { timeout: 30000 });
      const ms = await page.evaluate(() => window.__lastShot.timing);
      TIMES.push(name + ' ' + sp + 'x ' + kind + ' ' + Math.round(ms) + ' ms');
      ok(started === 'hold' && Date.now() - t1 < 15000, 'Replay starts at once at ' + sp + 'x (' + kind + ', tap to result ' + Math.round(ms) + ' ms)');
      if (sp === 2) ok(ms < 10000, 'the retry loop is under 10 s at 2x');
    }
  }
  await page.click('#bBack');
  ok(await page.isVisible('#board'), 'Back to Clipboard is one tap');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* THE LAUNCH FIXES (2026-11-17): the court takes the stage while a play
   runs, the card docks under the ball, every control is at least 44 by 44,
   the sheets close on Escape and on a screen change, reduced motion holds. */
const TARGETS = () => [...document.querySelectorAll('button, a[href], summary, [role=button], select, input:not([type=hidden])')]
  .filter(e => e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && e.getClientRects().length)
  .map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.className || e.tagName, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; })
  .filter(t => t.w < 44 || t.h < 44);
async function launch(name, viewport, mobile) {
  console.log('\nthe launch fixes, ' + name);
  for (const reduce of [false, true]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
    setWho('dev');
    await page.goto(base + '/last-shot');
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    await page.waitForFunction(() => window.__lastShot && window.__lastShot.view && window.__lastShot.dayState !== 'loading');
    const tag = reduce ? ' (reduced motion)' : '';
    if (!reduce) {
      let small = await page.evaluate(TARGETS);
      ok(small.length === 0, 'home: every control is 44 by 44 or more' + (small.length ? ': ' + JSON.stringify(small) : ''));
      // How it works: Escape closes it, and so does going to another screen
      await page.click('#hHow');
      ok(await page.isVisible('#howSheet'), 'How it works opens on a tap');
      await page.keyboard.press('Escape');
      ok(await page.isHidden('#howSheet'), 'Escape closes How it works');
      await page.click('#hHow');
      await page.evaluate(() => window.__lastShot.openLadder());
      ok(await page.isHidden('#howSheet') && await page.isVisible('#vLadder'), 'a screen change closes How it works');
      await page.evaluate(() => window.__lastShot.home());
      ok(await page.isHidden('#howSheet') && await page.isVisible('#vHome'), 'and it is not open over Home');
    }
    await page.click('#hPlay', { force: true });
    await page.waitForSelector('#board', { state: 'visible' });
    if (!reduce) {
      const small = await page.evaluate(TARGETS);
      ok(small.length === 0, 'the clipboard: every control is 44 by 44 or more' + (small.length ? ': ' + JSON.stringify(small) : ''));
      // Plays: Escape closes it; going home closes it
      await page.click('#bPlays');
      ok(await page.isVisible('#playsSheet'), 'Plays opens');
      await page.keyboard.press('Escape');
      ok(await page.isHidden('#playsSheet'), 'Escape closes Plays');
      await page.click('#bPlays');
      await page.evaluate(() => window.__lastShot.home());
      ok(await page.isHidden('#playsSheet') && await page.isVisible('#vHome'), 'going home closes Plays');
      await page.click('#hPlay', { force: true });
      await page.waitForSelector('#board', { state: 'visible' });
    }
    const stage0 = (await page.locator('#stage').boundingBox()).height;
    await goAt(page, 6);
    const win = await seedFor(page, 'make');
    await page.evaluate(s => window.__lastShot.run(s), win);
    await page.waitForFunction(() => window.__lastShot.phase === 'play', null, { timeout: 5000 });
    await page.waitForTimeout(600);
    const st = await page.locator('#stage').boundingBox();
    const hidden = await page.evaluate(() => ['tools', 'actions', 'goRow'].every(id => !document.getElementById(id).checkVisibility()));
    ok(st.height > stage0 + 100 && hidden, 'a run gives the court the clipboard\'s rows: the stage ' + Math.round(stage0) + ' to ' + Math.round(st.height) + ' px' + tag);
    ok(await page.isVisible('.score') && await page.isVisible('#clock'), 'the scoreboard stays' + tag);
    const v1 = await page.evaluate(() => window.__lastShot.courtView());
    const full = Math.min((st.width - 24) / 50, (st.height - 24) / 47);
    ok(v1.s >= full - 0.01 && (!mobile || v1.s > full * 1.2), 'the court is as big as the stage allows: ' + v1.s.toFixed(1) + ' px a foot, the whole court fit ' + full.toFixed(1) + tag);
    if (!reduce) await (SHOTS && page.screenshot({ path: SHOTS + '/' + name + '-1-run-mid.png' }));
    await page.waitForTimeout(500);
    const v2 = await page.evaluate(() => window.__lastShot.courtView());
    if (reduce) ok(v1.s === v2.s && v1.ox === v2.ox && v1.oy === v2.oy, 'reduced motion: the camera holds still');
    // the ball drops with no card on it, under GAME WINNER, then the card docks below the rim
    await page.waitForFunction(() => window.__lastShot.phase === 'after', null, { timeout: 30000 });
    ok(!(await page.evaluate(() => document.getElementById('sheet').classList.contains('on'))), 'no card while the ball plays out' + tag);
    await page.waitForSelector('#big:not([hidden])', { timeout: 10000 });
    await page.waitForTimeout(reduce ? 100 : 300);
    ok(!(await page.evaluate(() => document.getElementById('sheet').classList.contains('on'))) && (await page.textContent('#big')) === 'GAME WINNER', 'GAME WINNER over the court, the card not up yet' + tag);
    if (!reduce) await (SHOTS && page.screenshot({ path: SHOTS + '/' + name + '-2-ball-drop.png' }));
    await page.waitForSelector('#sheet.on', { timeout: 15000 });
    await page.waitForTimeout(reduce ? 100 : 700);
    const card = await page.locator('#card').boundingBox(), V = await page.evaluate(() => window.__lastShot.courtView());
    const court = await page.locator('#court').boundingBox();
    const rimY = court.y + V.oy + 5.25 * V.s, dropY = court.y + V.oy + (5.25 + 3) * V.s;
    ok(card.y > dropY, 'the docked card sits under the ball: the rim at ' + Math.round(rimY) + ', the card from ' + Math.round(card.y) + tag);
    ok(await page.evaluate(() => document.getElementById('sheet').classList.contains('peek')) && card.height < st.height * 0.5, 'no veil over the court, and the card is small: ' + Math.round(card.height) + ' px' + tag);
    ok(await page.isVisible('#bReplay') && await page.isHidden('#bShare'), 'Run it again first, the rest one tap away' + tag);
    if (!reduce) {
      await (SHOTS && page.screenshot({ path: SHOTS + '/' + name + '-3-result-card.png' }));
      let small = await page.evaluate(TARGETS);
      ok(small.length === 0, 'the docked card: every control is 44 by 44 or more' + (small.length ? ': ' + JSON.stringify(small) : ''));
      await page.click('#bMore');
      small = await page.evaluate(TARGETS);
      ok(small.length === 0 && await page.isVisible('#bSeed'), 'the whole card: every control is 44 by 44 or more' + (small.length ? ': ' + JSON.stringify(small) : ''));
      await (SHOTS && page.screenshot({ path: SHOTS + '/' + name + '-4-result-more.png' }));
      await page.keyboard.press('Escape');
      ok(await page.isHidden('#bShare') && await page.isVisible('#bReplay'), 'Escape docks the card again');
    } else {
      await page.click('#bMore');
      ok(await page.isVisible('#bShare'), 'reduced motion: More opens the card');
    }
    await page.click('#bBack');
    ok(await page.isVisible('#board') && await page.isVisible('#tools') && await page.isHidden('#sheet'), 'Back to Clipboard brings the rows back' + tag);
    ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
}

try {
  await launch('phone', { width: 390, height: 844 }, true);
  await launch('desktop', { width: 1440, height: 900 }, false);
  await feel('phone', { width: 390, height: 844 }, true);
  await feel('desktop', { width: 1440, height: 900 }, false);
  console.log('\ntap to result: ' + TIMES.join(' · '));

  console.log('\na play drawn by hand, phone');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  /* the sign in's CDN and the fonts: not reachable from a check, and not under test here */
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  page.on('pageerror', e => errs.push(String(e)));
  setWho('dev');
  const res = await page.goto(base + '/last-shot');
  ok(res.status() === 200, 'a signed in player gets the page');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  ok(await page.isVisible('#hPlay') && await page.isVisible('#hBooks'), 'home offers the scenario and My Playbooks');
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });
  // Clear takes the starter off: a blank clipboard, and it stays blank
  await page.click('#bClear');
  ok(await page.isDisabled('#bRun'), 'Run It is disabled with no shooter');
  await page.reload();
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await page.evaluate(() => window.__lastShot.play.steps.length)) === 0, 'once cleared, the starter does not come back');

  /* Feet to page pixels through the board's own view. */
  const box = await page.locator('#board').boundingBox();
  const px = async (p) => { const q = await page.evaluate(p => window.__lastShot.view().px(p), p); return [box.x + q.x, box.y + q.y]; };
  const spots = await page.evaluate(() => window.__lastShot.play.spots);
  const drag = async (pts) => {
    let [x, y] = await px(pts[0]); await page.mouse.move(x, y); await page.mouse.down();
    for (const p of pts.slice(1)) { [x, y] = await px(p); await page.mouse.move(x, y, { steps: 6 }); }
    await page.mouse.up();
  };
  const tap = async (p) => { const [x, y] = await px(p); await page.mouse.click(x, y); };
  const tool = async (t) => page.click('[data-tool=' + t + ']');

  // A pin-down drawn by hand: the screener comes down, the shooter comes up off it.
  const s = spots.O4, c = spots.O2;
  await tool('screen');
  await drag([s, { x: (s.x + c.x) / 2, y: s.y + 1 }, { x: c.x - 4, y: c.y - 6 }]);
  await tool('move');
  const end = { x: c.x - 2, y: Math.min(40, c.y + 6) };
  await drag([c, { x: c.x, y: c.y - 9 }, { x: c.x - 4, y: c.y - 4 }, end]);
  await tool('pass');
  await tap(spots.O1);
  await tap(end);
  await tool('shoot');
  await tap(end);
  const steps = await page.evaluate(() => window.__lastShot.play.steps.map(s => s.kind));
  ok(['screen', 'move', 'pass', 'shoot'].every(k => steps.includes(k)), 'all four tools drew a step: ' + steps.join(', '));
  ok(!(await page.isDisabled('#bRun')), 'Run It is enabled once there is a shooter');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/last-shot-board.png' });

  // Undo takes the shot off, and it goes back on.
  await page.click('#bUndo');
  ok(await page.isDisabled('#bRun'), 'Undo removed the shooter');
  await tool('shoot'); await tool('shoot'); await tap(end);

  await page.click('#bRun');
  await page.waitForTimeout(1500);
  const clock = Number(await page.textContent('#clock'));
  ok(clock < 22 && clock > 0, 'the clock is running in tenths: ' + clock);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/last-shot-live.png' });
  await page.waitForSelector('#sheet.on', { timeout: 40000 });
  ok(await page.isHidden('#bShare') && await page.isVisible('#bReplay') && await page.isVisible('#bBack') && (await page.textContent('#bMore')) === 'More', 'the card docks: Run it again and Back to Clipboard, the rest behind More');
  await page.click('#bMore');
  ok(await page.isVisible('#bShare') && await page.isVisible('#bSavePlay') && await page.isVisible('#bBeat') && (await page.textContent('#bMore')) === 'Less', 'More opens Share, Save this play and Beat my play');
  const verdict = await page.textContent('.verdict');
  ok(/^(WINNER|LOSE)$/.test(verdict), 'a verdict: ' + verdict);
  ok(/^\d+-\d+$/.test(await page.textContent('#card .finalscore')), 'a final score');
  ok(/(Their call on screens: (Switch|Fight over|Go under)|Their defense: (2-3|1-3-1|3-2|Match-up) zone)\./.test(await page.textContent('.facts')), 'the defense is revealed');
  const reason = await page.textContent('.reason');
  ok(reason.length > 10 && !DASHES.test(reason), 'a reason with no dashes: ' + reason);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/last-shot-result.png' });

  await page.click('#bSeed');
  ok(/seed \d+/.test(await page.textContent('#seedBox')), 'the seed panel shows the seed');
  await page.click('#bShare');
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const lines = shared.split('\n');
  ok(lines.length === 3 && /^Last Shot (WINNER|LOSE) \d+-\d+/.test(lines[0]) && lines[2] === 'https://runthe.gg/last-shot/', 'the share line: ' + JSON.stringify(shared));
  ok(!/beat=|\/m\//.test(shared), 'the share line links the game, never a module or a play');

  // The same seed and play give the same result in the page.
  const again = await page.evaluate(() => { const r = window.__lastShot.result; return window.__lastShot.simulate(r.seed); });
  const first = await page.evaluate(() => window.__lastShot.result);
  ok(again.outcome === first.outcome && again.reason === first.reason && again.shotAt === first.shotAt, 'deterministic in the browser');

  await page.click('#bReplay');
  await page.waitForSelector('#sheet.on', { timeout: 40000 });
  ok(await page.isVisible('#bReplay'), 'Replay runs the same play again');
  await page.click('#bBack');
  ok(await page.isVisible('#board') && !(await page.isVisible('#court')), 'Back to Clipboard shows the clipboard');
  const kept = await page.evaluate(() => window.__lastShot.play.steps.length);
  ok(kept === steps.length, 'the play is kept for editing');
  await page.click('#bClear');
  ok((await page.evaluate(() => window.__lastShot.play.steps.length)) === 0 && await page.isDisabled('#bRun'), 'Clear empties the clipboard');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));

  // Everybody else: the game is live, so a guest gets it too.
  setWho(null);
  const guest = await page.goto(base + '/last-shot');
  ok(guest.status() === 200, 'a guest gets the page');
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  ok(await page.isVisible('#hPlay') && !/TESTERS ONLY/i.test(await page.textContent('body')), 'a guest sees home, and nothing says testers');
  const mod = await page.goto(base + '/last-shot/m/sim.js');
  ok(mod.status() === 200, 'a guest can load a module');
  const server = await page.goto(base + '/last-shot/m/gate.js');
  ok(server.status() === 404 && !(await page.content()).includes('Last Shot'), 'a server file is the 404, and the 404 page never names the game');
} finally {
  await browser.close(); server.close();
}
console.log(fails ? fails + ' failed' : 'all good');
process.exit(fails ? 1 : 0);
