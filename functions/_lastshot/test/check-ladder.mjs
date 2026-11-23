#!/usr/bin/env node
/* The Ladder in Chromium, on a phone (390x844, touch) and a desktop
 * (1440x900): the home card and its stars, the Ladder screen (24 tiles, the
 * unlock rule, locked tiles that cannot be tapped), a level on the clipboard
 * (its clock, its score, its set, the scout line, Go at), a three star run
 * with its card (the stars, the checklist, New best, Next level), the play
 * kept per level across a reload, down 2 on the scoreboard, a down 3 two
 * that is not enough, overtime with its own beat, and garbage in storage.
 *
 *   node functions/_lastshot/test/check-ladder.mjs   (SHOTS=dir for screenshots) */
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
import { LEVELS, levelScenario, CLUTCH } from '../levels.js';

const PORT = 8794, BASE = 'http://localhost:' + PORT;
const OUT = process.env.SHOTS || null;
const { server } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const DASHES = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');

/* A screen for O2 to a spot, the pass and the shot, the shape test/levels.test.mjs
   uses for its reference plays (a few of them, enough to win and to tie). */
const P = (x, y) => ({ x, y });
const REF = { '1-1': ['O4', [35, 27], 5.4], '1-5': ['O4', [35, 27], 5.4], '2-1': ['O4', [35, 27], 5.4], '4-1': ['O4', [35, 27], 5.4] };
function refPlay(id) {
  const L = LEVELS.find(l => l.id === id), sc = levelScenario(L), [s, [tx, ty], g] = REF[id], a = sc.spots.O2;
  const scr = P((a.x + tx) / 2 + 0.5, (a.y + ty) / 2);
  return { spots: sc.spots, goAt: g, steps: [{ kind: 'screen', who: s, pts: [scr] }, { kind: 'move', who: 'O2', pts: [P(scr.x - 1, scr.y - 1), P(tx, ty)] },
    { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] };
}

async function run(name, viewport, mobile) {
  console.log('\n' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|googlesyndication\.com|doubleclick\.net|adtrafficquality\.google|fundingchoicesmessages\.google\.com|googletagmanager\.com|google-analytics\.com/, r => r.abort());
  const shot = async f => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '-' + f + '.png') }); };
  const L = (fn, a) => page.evaluate(fn, a);
  const boot = async () => { await page.reload(); await page.waitForFunction(() => window.__lastShot && window.__lastShot.view); };
  const seedFor = (want) => L(want => { for (let s = 1; s < 600; s++) { const r = window.__lastShot.simulate(s);
    if (want === '3' ? r.stars === 3 : want === 'ot' ? r.how === 'ot' && r.outcome === 'win' && r.ot.after === 'end' : r.how === want) return s; } return null; }, want);
  const runTo = async seed => { await L(s => window.__lastShot.run(s), seed); await page.waitForSelector('#sheet.on', { timeout: 40000 }); };

  await page.goto(BASE + '/last-shot/');
  await L(() => { try { localStorage.clear(); } catch (e) {} });
  await boot();

  // home: Play, then the Ladder with its stars, then My Playbooks
  const hp = await page.locator('#hPlay').boundingBox(), hl = await page.locator('#hLadder').boundingBox(), hb = await page.locator('#hBooks').boundingBox();
  /* reading order: a line above, or on the same line (desktop puts the Ladder and My Playbooks in one row) and to the left */
  const before = (a, b) => a.y < b.y - 4 || (Math.abs(a.y - b.y) <= 4 && a.x < b.x);
  ok(before(hp, hl) && before(hl, hb), 'home has the Ladder between Play and My Playbooks');
  ok((await page.textContent('#hLadderStars')) === '0 of 72 stars', 'the Ladder card counts the stars: ' + await page.textContent('#hLadderStars'));
  ok((await L(() => document.querySelectorAll('.sheet.on, .fsheet.on').length)) === 0, 'no guide opens by itself');
  await shot('1-home');

  // the Ladder: four chapters, 24 tiles, only 1-1 open
  await page.click('#hLadder');
  await page.waitForSelector('#vLadder:not([hidden])');
  ok((await page.locator('.chap').count()) === 4 && (await page.locator('.tile').count()) === 24, 'four chapters and 24 tiles');
  const notes = await page.locator('.cnote').allTextContents();
  ok(notes[1] === 'A two ties it. Overtime is a coin flip. A three wins.', 'each chapter shows its rule');
  const open0 = await L(() => [...document.querySelectorAll('.tile')].filter(b => !b.disabled).map(b => b.dataset.level));
  ok(open0.join() === '1-1', 'only 1-1 is open at the start: ' + open0.join());
  await L(() => document.querySelector('[data-level="1-3"]').click());
  ok((await L(() => window.__lastShot.level)) === null && await page.isVisible('#vLadder'), 'a locked tile cannot be tapped');
  ok((await page.textContent('[data-level="3-1"] .tscout')) === 'Scout: 2-3 zone', 'a tile shows the scout: ' + await page.textContent('[data-level="3-1"] .tscout'));

  // 1-1 on the clipboard: its clock, a blank play on its set, Go at 8.0
  await page.click('[data-level="1-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await L(() => window.__lastShot.level)) === '1-1' && await page.isVisible('#lvlBar') && (await page.textContent('#lvlTitle')) === 'Draw it up', 'the level bar names the level');
  ok((await page.textContent('#lvlSit')) === '22.0 · Down 1' && await page.isHidden('#lvlScout'), 'the level bar: 22.0 · Down 1, no scout');
  ok((await L(() => window.__lastShot.play.steps.length)) === 0 && (await page.textContent('#goChip')) === 'Go at 8.0' && await page.isDisabled('#bRun'), 'a first visit: no steps, Go at 8.0, Run It waiting');
  ok((await page.textContent('#sUs')) === '87' && (await page.textContent('#sThem')) === '88' && (await page.textContent('#clock')) === '22.0', 'the scoreboard: 87-88, 22.0');

  // the reference play, kept for the level as it is set
  await L(p => window.__lastShot.setPlay(p), refPlay('1-1'));
  await L(() => window.__lastShot.board.draw());
  ok((await L(() => JSON.parse(localStorage.getItem('last_shot_ladder')).plays['1-1'].steps.length)) === 4, 'the play is stored for 1-1');

  // three stars
  const s3 = await seedFor('3');
  ok(s3 != null, 'a seed for three stars: ' + s3);
  await runTo(s3);
  await page.waitForTimeout(1900);
  ok((await page.locator('#card .star.got').count()) === 3 && (await page.textContent('.verdict')) === 'WINNER', 'three stars on the card');
  const checks = await page.locator('.checks li').evaluateAll(ls => ls.map(l => l.className + ':' + l.querySelector('b').textContent));
  ok(checks.join('|') === 'met:Win|met:Win with an open look|met:And let it go with ' + CLUTCH.toFixed(1) + ' or less', 'the checklist: ' + checks.join('|'));
  ok((await page.textContent('.newbest')) === 'New best.' && await page.isVisible('.perfecttag'), 'New best, and the three star party');
  ok(await page.isVisible('#bNextLvl') && await page.isVisible('#bReplay') && await page.isHidden('#bLadder'), 'the card docks: Next level and Try again, the rest behind More');
  await page.click('#bMore');
  ok(await page.isVisible('#bLadder') && await page.isVisible('.checks'), 'More opens Back to Ladder and the checklist');
  ok(!DASHES.test(await page.textContent('#card')), 'no dashes on the card');
  await shot('4-three-stars');
  ok((await L(() => JSON.parse(localStorage.getItem('last_shot_ladder')).best['1-1'])) === 3, 'the best is stored');

  // Try again: a fresh seed, the same play
  await page.click('#bReplay');
  ok((await L(() => window.__lastShot.phase)) != null, 'Try again runs at once');
  await page.waitForSelector('#sheet.on', { timeout: 40000 });
  ok(await page.isHidden('.newbest') || (await page.locator('.newbest').count()) === 0, 'no New best when it does not beat three');

  // Next level: 1-2, its own clock and set
  await page.click('#bNextLvl');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await L(() => window.__lastShot.level)) === '1-2' && (await page.textContent('#lvlSit')) === '9.0 · Down 1' && (await page.textContent('#clock')) === '9.0', 'Next level opens 1-2 at 9.0');
  ok((await page.textContent('#goChip')) === 'Go at 8.0', 'Go at starts at 8.0 under a 9.0 clock');

  // back to the Ladder: 1-1 starred, 1-2 open, 1-3 locked
  await page.click('#back');
  await page.waitForSelector('#vLadder:not([hidden])');
  ok((await page.textContent('[data-level="1-1"] .tstars')) === '★★★' && !(await page.isDisabled('[data-level="1-2"]')) && await page.isDisabled('[data-level="1-3"]'), 'the Ladder shows the stars and the unlock');
  ok((await page.textContent('.lsum')) === '3 of 72 stars', 'the Ladder totals the stars');

  // a reload keeps it all: the stars, and the play for 1-1
  await boot();
  ok((await page.textContent('#hLadderStars')) === '3 of 72 stars', 'the home card keeps the stars after a reload');
  await page.click('#hLadder');
  await page.click('[data-level="1-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await L(() => window.__lastShot.play.steps.length)) === 4 && (await L(() => window.__lastShot.play.goAt)) === 5.4 && (await page.textContent('#lvlStars')) === '★★★', 'a level\'s play and best come back after a reload');

  // a mix for the picture: some stars, the next ones open, the rest locked
  await L(() => localStorage.setItem('last_shot_ladder', JSON.stringify({ v: 1, best: { '1-1': 3, '1-2': 2, '1-3': 1, '1-4': 3, '1-5': 2, '1-6': 1, '2-1': 2, '2-2': 0 }, plays: {} })));
  await boot();
  ok((await page.textContent('#hLadderStars')) === '14 of 72 stars', 'stars from storage on the home card');
  await page.click('#hLadder');
  const open1 = await L(() => [...document.querySelectorAll('.tile')].filter(b => !b.disabled).map(b => b.dataset.level).join());
  ok(open1 === '1-1,1-2,1-3,1-4,1-5,1-6,2-1,2-2', 'unlocks follow the wins (a 0 star 2-2 opens nothing): ' + open1);
  await shot('2-ladder');
  await page.locator('[data-level="2-1"]').scrollIntoViewIfNeeded();
  await shot('2-ladder-down');

  // the scout line on a level, and the defense set up as the scout says
  await page.click('[data-level="1-5"]');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await page.textContent('#lvlScout')) === 'Scout: Switch on screens' && await page.isVisible('#lvlScout'), 'the scout line on the board: ' + await page.textContent('#lvlScout'));
  await shot('3-level-scout');
  await L(p => window.__lastShot.setPlay(p), refPlay('1-5'));
  ok((await L(() => [1, 2, 3].map(s => window.__lastShot.simulate(s).scheme).join())) === 'switch,switch,switch', 'the level plays the scout\'s scheme');
  await page.click('#back');
  await L(() => { const d = JSON.parse(localStorage.getItem('last_shot_ladder')); d.best['2-2'] = 1; d.best['2-3'] = 1; d.best['2-4'] = 1; d.best['2-5'] = 1; d.best['2-6'] = 1; localStorage.setItem('last_shot_ladder', JSON.stringify(d)); });
  await page.click('#back');
  await page.click('#hLadder');
  await page.click('[data-level="3-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await page.textContent('#lvlScout')) === 'Scout: 2-3 zone', 'a zone level: Scout: 2-3 zone');
  await shot('3-level-zone');

  // down 2 on the scoreboard, and overtime with its own beat
  await page.click('#back');
  await page.click('[data-level="2-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await page.textContent('#sUs')) === '86' && (await page.textContent('#sThem')) === '88' && (await page.textContent('#lvlSit')) === '22.0 · Down 2', 'down 2: the scoreboard reads 86-88');
  /* a two at the horn ties it: the reference screen, run to a spot inside the arc */
  const tie = refPlay('2-1'); tie.steps[1].pts[1] = P(31, 12);
  await L(p => window.__lastShot.setPlay(p), tie);
  const sot = await seedFor('ot');
  ok(sot != null, 'a seed for overtime: ' + sot);
  if (sot != null) {
    const R = await L(s => window.__lastShot.simulate(s), sot);
    await L(s => window.__lastShot.run(s), sot);
    await page.waitForFunction(() => window.__lastShot.phase && window.__lastShot.phase !== 'beat' && window.__lastShot.phase !== 'hold', null, { timeout: 5000 });
    ok(Number(await page.textContent('#sUs')) === 86, 'the run starts at 86');
    await page.waitForFunction(() => window.__lastShot.phase === 'ot', null, { timeout: 40000 });
    ok((await page.textContent('#big')) === 'OVERTIME' && await page.isVisible('#big'), 'OVERTIME gets its own beat (after ' + R.ot.after + ')');
    await page.evaluate(() => { window.__lastShot.paused = true; });
    await shot('5-overtime-beat');
    await page.evaluate(() => { window.__lastShot.paused = false; });
    await page.waitForSelector('#sheet.on', { timeout: 15000 });
    ok((await page.textContent('#card .finalscore')) === R.us + '-' + R.them + ' · OT' && R.us === R.them, 'the card: a tie, then OT: ' + await page.textContent('#card .finalscore'));
    ok((await page.textContent('.verdict')) === (R.outcome === 'win' ? 'WINNER' : 'LOSE') && /overtime/.test(await page.textContent('.reason')), R.outcome + ' in overtime, and the reason says so');
    await page.waitForTimeout(1500);
    await shot('6-overtime-result');
  }

  // an early two that ties: the cutaway says they tied it (or missed, still tied), then OVERTIME
  /* down 2, an early two ties it and they miss; down 1 (1-1), an early three
     puts you up 2 and their two ties it */
  const early = JSON.parse(JSON.stringify(tie)); early.goAt = 14;
  const early3 = refPlay('1-1'); early3.goAt = 14;
  for (const [lv, pl, after, v, sub] of [['2-1', early, 'stop', 'They missed', 'Still tied.'], ['1-1', early3, 'answer', 'GOOD', 'They tied it.']]) {
    if ((await L(() => window.__lastShot.level)) !== lv) { await page.click('#back'); await page.click('[data-level="' + lv + '"]'); await page.waitForSelector('#board', { state: 'visible' }); }
    await L(p => window.__lastShot.setPlay(p), pl);
    const sd = await L(after => { for (let s = 1; s < 800; s++) { const r = window.__lastShot.simulate(s); if (r.how === 'ot' && r.ot.after === after) return s; } return null; }, after);
    ok(sd != null, 'a seed for overtime after ' + after + ': ' + sd);
    if (sd == null) continue;
    await L(s => window.__lastShot.run(s), sd);
    await page.waitForSelector('#cutV.on', { timeout: 40000 });
    ok((await page.textContent('#cutV')) === v && (await page.textContent('#cutSub')) === sub, 'the cutaway: ' + v + ' / ' + sub);
    await page.waitForFunction(() => window.__lastShot.phase === 'ot', null, { timeout: 10000 });
    ok((await page.textContent('#big')) === 'OVERTIME' && await page.isHidden('#cut'), 'then OVERTIME on its own');
    await page.waitForSelector('#sheet.on', { timeout: 15000 });
    ok(/ · OT$/.test(await page.textContent('#card .finalscore')), 'and the card says OT');
  }

  // down 3: a made two is not enough
  await L(() => { const d = JSON.parse(localStorage.getItem('last_shot_ladder')); for (const l of ['2-3', '2-4', '2-5', '2-6', '3-1', '3-2', '3-3', '3-4', '3-5', '3-6']) d.best[l] = 1; localStorage.setItem('last_shot_ladder', JSON.stringify(d)); });
  await boot();
  await page.click('#hLadder');
  ok(!(await page.isDisabled('[data-level="4-1"]')), 'a chapter opens with the last level of the one before');
  await page.click('[data-level="4-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await page.textContent('#sUs')) === '85', 'down 3: the scoreboard reads 85-88');
  const two = refPlay('4-1'); two.steps[1].pts[1] = P(31, 12);
  await L(p => window.__lastShot.setPlay(p), two);
  const sshort = await seedFor('short');
  ok(sshort != null, 'a seed for a two that is not enough: ' + sshort);
  if (sshort != null) {
    await page.evaluate(() => { window.__pops = []; const el = document.getElementById('pop'); new MutationObserver(() => window.__pops.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); });
    await runTo(sshort);
    const pops = await L(() => window.__pops);
    ok(pops.includes('Not enough') && (await page.textContent('.verdict')) === 'LOSE' && (await page.locator('#card .star.got').count()) === 0, 'Not enough, a loss, no stars');
  }

  // garbage in storage never breaks the page
  for (const junk of ['{not json', '[]', '"x"', 'null', JSON.stringify({ v: 9, best: { '1-1': 'x', '9-9': 3, '1-2': 7, '1-3': 2.5 }, plays: { '1-1': { spots: 5 }, '1-2': { spots: {}, steps: 'no' } } }),
    JSON.stringify({ best: { '1-1': 2 }, plays: { '1-1': { spots: { O1: P(1, 1) }, steps: [] }, '1-2': { spots: refPlay('1-1').spots, steps: [{ kind: 'move', who: 'O9', pts: [] }] } } })]) {
    await L(j => localStorage.setItem('last_shot_ladder', j), junk);
    await boot();
    await page.click('#hLadder');
    await page.click('[data-level="1-1"]');
    await page.waitForSelector('#board', { state: 'visible' });
    const st = await L(() => ({ n: window.__lastShot.play.steps.length, best: window.__lastShot.ladder.best }));
    ok(st.n === 0 && Object.keys(st.best).every(k => k === '1-1'), 'garbage in storage: ' + junk.slice(0, 40) + ' read as ' + JSON.stringify(st.best));
  }

  // free play is as it was
  await page.click('#back'); await page.click('#back');
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });
  ok(await page.isHidden('#lvlBar') && (await page.textContent('#sUs')) === '87' && (await L(() => window.__lastShot.mode)) === 'game', 'free Play: no level bar, 87-88');

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

/* THE ACCOUNT'S COPY (2026-11-17): the ladder in the shared cloud saves,
   game last_shot, slot ladder. The cloud is in memory (sessionStorage, so it
   outlives a reload and a cleared localStorage), the sign in a stand in, and
   the write interval 1.5 s instead of 30. */
async function cloud(name, viewport, mobile) {
  console.log('\nthe account\'s copy, ' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
  await ctx.route(/\/arcade\/auth\.js/, r => r.fulfill({ contentType: 'text/javascript', body:
    'window.RTG_AUTH={API_VERSION:1,boot:function(){return true},state:function(){return{resolved:true,signedIn:sessionStorage.getItem("__in")==="1",userId:"check"}},onChange:function(f){f(this.state());return function(){}},token:function(){return sessionStorage.getItem("__in")==="1"?"tok":null}};' }));
  await ctx.addInitScript(() => {
    window.__lastShotSyncMs = Number(sessionStorage.getItem('__syncMs')) || 1500;
    const read = () => { try { return JSON.parse(sessionStorage.getItem('__cloud') || '{}'); } catch (e) { return {}; } };
    const write = m => sessionStorage.setItem('__cloud', JSON.stringify(m));
    window.RTG_SAVE = { API_VERSION: 1, idle: () => true, signedIn: () => sessionStorage.getItem('__in') === '1',
      all: g => Promise.resolve(sessionStorage.getItem('__in') === '1' ? Object.entries(read()).filter(([k]) => k.startsWith(g + '/')).map(([k, v]) => ({ slot: k.split('/')[1], progress: v.progress, payload: v.payload })) : null),
      queue: (g, sl, fn) => { const m = fn(); if (!m) return Promise.resolve(null); const mem = read(), k = g + '/' + sl;
        sessionStorage.setItem('__writes', String(Number(sessionStorage.getItem('__writes') || 0) + 1));
        if (mem[k] && mem[k].progress > m.progress) return Promise.resolve({ ok: false, payload: mem[k].payload, progress: mem[k].progress });
        mem[k] = { progress: m.progress, payload: JSON.parse(JSON.stringify(m.payload)) }; write(mem); return Promise.resolve({ ok: true, progress: m.progress, payload: m.payload }); },
      drop: () => Promise.resolve(null) };
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|googlesyndication\.com|doubleclick\.net|adtrafficquality\.google|fundingchoicesmessages\.google\.com|googletagmanager\.com|google-analytics\.com/, r => r.abort());
  const L = (fn, a) => page.evaluate(fn, a);
  const boot = async () => { await page.reload(); await page.waitForFunction(() => window.__lastShot && window.__lastShot.view && window.__lastShot.ladderSynced); await L(() => window.__lastShot.ladderSynced()); await page.waitForTimeout(100); };
  const writes = () => L(() => Number(sessionStorage.getItem('__writes') || 0));
  const stored = () => L(() => { const c = JSON.parse(sessionStorage.getItem('__cloud') || '{}')['last_shot/ladder']; return c || null; });
  const setCloud = (payload, progress) => L(([p, n]) => { const m = JSON.parse(sessionStorage.getItem('__cloud') || '{}'); m['last_shot/ladder'] = { progress: n, payload: p }; sessionStorage.setItem('__cloud', JSON.stringify(m)); }, [payload, progress]);
  const old = Date.now() - 86400000, ref = refPlay('1-1'), ref2 = { ...refPlay('1-1'), goAt: 7, steps: refPlay('1-1').steps.slice(1) };

  await page.goto(BASE + '/last-shot/');
  await L(() => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('__in', '1'); });

  // a cleared browser gets its stars and plays back after sign in
  await setCloud({ v: 1, best: { '1-1': 3, '1-2': 2 }, plays: { '1-1': ref }, at: { '1-1': old }, days: ['2026-11-15'], rev: 4 }, 4);
  await boot();
  ok((await page.textContent('#hLadderStars')) === '5 of 72 stars', 'a cleared browser restores its stars after sign in: ' + await page.textContent('#hLadderStars'));
  const back = await L(() => JSON.parse(localStorage.getItem('last_shot_ladder')));
  ok(back.best['1-1'] === 3 && back.plays['1-1'].steps.length === 4 && back.days.join() === '2026-11-15', 'the plays and the filed days come back with them');
  await page.click('#hLadder');
  await page.click('[data-level="1-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await L(() => window.__lastShot.play.steps.length)) === 4 && (await page.textContent('#lvlStars')) === '★★★', 'and 1-1 opens on its kept play');

  // two copies merge: the best stars per level, the newer play per level
  const mine = { v: 1, best: { '1-1': 1, '1-2': 3, '1-3': 2 }, plays: { '1-1': ref2, '1-2': ref2 }, at: { '1-1': Date.now(), '1-2': old - 5000 }, days: ['2026-11-16'], rev: 1 };
  await L(d => localStorage.setItem('last_shot_ladder', JSON.stringify(d)), mine);
  await setCloud({ v: 1, best: { '1-1': 3, '1-2': 2, '1-4': 1 }, plays: { '1-1': ref, '1-2': ref }, at: { '1-1': old, '1-2': old }, days: ['2026-11-15'], rev: 6 }, 6);
  await boot();
  const m = await L(() => JSON.parse(localStorage.getItem('last_shot_ladder')));
  ok(JSON.stringify(m.best) === JSON.stringify({ '1-1': 3, '1-2': 3, '1-3': 2, '1-4': 1 }), 'two copies merge to the best stars: ' + JSON.stringify(m.best));
  const same = (a, b) => JSON.stringify([a.steps, a.goAt]) === JSON.stringify([b.steps, b.goAt]);
  ok(same(m.plays['1-1'], mine.plays['1-1']) && same(m.plays['1-2'], ref) && !same(ref, ref2), 'the newer play wins each level (this browser\'s 1-1, the account\'s 1-2)');
  ok(m.days.join() === '2026-11-15,2026-11-16', 'the filed days are the union');
  ok((await page.textContent('#hLadderStars')) === '9 of 72 stars', 'the home card shows the merge: ' + await page.textContent('#hLadderStars'));
  const up = await stored();
  ok(!!up && up.progress > 6 && JSON.stringify(up.payload.best) === JSON.stringify(m.best), 'the merge goes up to the account (progress ' + (up && up.progress) + ')');

  // one write per burst of runs: nothing during it, one on page hide (the
  // 30 s interval here is 60 s, longer than the burst)
  await L(() => { sessionStorage.setItem('__syncMs', '60000'); localStorage.setItem('last_shot_speed', '2'); });
  await boot();
  await page.click('#hLadder');
  await page.click('[data-level="1-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  const w0 = await writes();
  await L(p => window.__lastShot.setPlay(p), ref);
  const s3 = await L(() => { for (let s = 1; s < 600; s++) if (window.__lastShot.simulate(s).stars === 3) return s; return null; });
  for (let i = 0; i < 3; i++) { await L(s => window.__lastShot.run(s), s3); await page.waitForSelector('#sheet.on', { timeout: 40000 }); await L(([p, i]) => { const q = JSON.parse(JSON.stringify(p)); q.goAt = 5 + i * 0.5; window.__lastShot.setPlay(q); }, [ref, i]); }
  ok((await writes()) === w0, 'a burst of three runs writes nothing as it happens (' + ((await writes()) - w0) + ')');
  await L(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(100);
  ok((await writes()) === w0 + 1 && (await stored()).payload.plays['1-1'].goAt === 6, 'page hide writes the burst once, its last play with it (' + ((await writes()) - w0) + ')');
  // and the interval: changes inside it are one write when it ends
  await L(() => { sessionStorage.setItem('__syncMs', '1500'); localStorage.setItem('last_shot_speed', '1'); });
  await boot();
  await page.click('#hLadder');
  await page.click('[data-level="1-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  const w1 = await writes();
  for (let i = 0; i < 5; i++) await L(([p, i]) => { const q = JSON.parse(JSON.stringify(p)); q.goAt = 7 - i * 0.5; window.__lastShot.setPlay(q); }, [ref, i]);
  ok((await writes()) === w1, 'five changes write nothing at once');
  await page.waitForTimeout(2200);
  const w2 = await writes();
  ok(w2 === w1 + 1 && (await stored()).payload.plays['1-1'].goAt === 5, 'then one write when the interval ends (' + (w2 - w1) + ')');
  await L(() => document.dispatchEvent(new Event('visibilitychange')));
  await L(() => window.dispatchEvent(new Event('pagehide')));
  ok((await writes()) === w2, 'page hide with nothing new writes nothing');
  await L(p => { const q = JSON.parse(JSON.stringify(p)); q.goAt = 4; window.__lastShot.setPlay(q); }, ref);
  await L(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(100);
  ok((await writes()) === w2 + 1 && (await stored()).payload.plays['1-1'].goAt === 4, 'a change then page hide writes at once');

  // a stale write is refused, merged and sent again
  await setCloud({ v: 1, best: { '1-1': 3, '1-5': 2 }, plays: {}, at: {}, days: [], rev: 900 }, 900);
  await L(p => { const q = JSON.parse(JSON.stringify(p)); q.goAt = 3; window.__lastShot.setPlay(q); }, ref);
  await L(() => window.__lastShot.flushLadder());
  await page.waitForTimeout(100);
  const st = await stored();
  ok(st.progress > 900 && st.payload.best['1-5'] === 2 && st.payload.plays['1-1'].goAt === 3, 'a stale write merges what the account holds and goes again (progress ' + st.progress + ')');
  ok((await L(() => window.__lastShot.ladder.best['1-5'])) === 2, 'and the page has the account\'s stars');

  // garbage in the account's copy never breaks the page
  for (const junk of ['junk', 7, null, [], { best: 'x', plays: { '1-1': { spots: 3 } }, at: 'y', days: [5, '2026-13-45', 'x'], rev: -3 }]) {
    await setCloud(junk, 999);
    await boot();
    const st2 = await L(() => ({ best: window.__lastShot.ladder.best, n: Object.keys(window.__lastShot.ladder.plays).length, days: window.__lastShot.ladder.days }));
    ok(st2.best['1-1'] === 3 && st2.n >= 1 && st2.days.every(d => /^\d{4}-\d\d-\d\d$/.test(d)), 'garbage in the cloud: ' + JSON.stringify(junk).slice(0, 40) + ' leaves this browser\'s ladder alone');
  }
  // garbage in this browser, with the cloud good: the account's copy stands
  await setCloud({ v: 1, best: { '1-1': 2 }, plays: {}, at: {}, days: [], rev: 2000 }, 2000);
  await L(() => localStorage.setItem('last_shot_ladder', '{not json'));
  await boot();
  ok((await L(() => window.__lastShot.ladder.best['1-1'])) === 2, 'garbage in this browser: the account\'s copy restores it');

  // signed out: local only, as before
  await L(() => { sessionStorage.setItem('__in', '0'); sessionStorage.setItem('__writes', '0'); });
  const before = JSON.stringify(await stored());
  await boot();
  await page.click('#hLadder');
  await page.click('[data-level="1-1"]');
  await page.waitForSelector('#board', { state: 'visible' });
  await L(p => window.__lastShot.setPlay(p), ref2);
  await L(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(1800);
  ok((await writes()) === 0 && JSON.stringify(await stored()) === before, 'signed out: nothing goes to the account');
  ok((await L(() => JSON.parse(localStorage.getItem('last_shot_ladder')).plays['1-1'].goAt)) === 7, 'and the play is kept on this browser');

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

try {
  await run('phone', { width: 390, height: 844 }, true);
  await run('desktop', { width: 1440, height: 900 }, false);
  await cloud('phone', { width: 390, height: 844 }, true);
} finally {
  await browser.close(); server.close();
}
console.log(fails ? '\n' + fails + ' failed' : '\nall good');
process.exit(fails ? 1 : 0);
