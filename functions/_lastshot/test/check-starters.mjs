#!/usr/bin/env node
/* Start from a play and Save this play, in Chromium, on a phone (390x844,
 * touch) and a desktop (1440x900). The cloud saves are in memory and the
 * account is a stand in, so no check ever writes a row on a real account.
 *
 *   the Plays sheet   the four starters, each loading its own spots, Go at and steps;
 *                     Replace your play? on a clipboard with steps; Undo puts it back
 *   a level           a starter there keeps the scout scheme
 *   Save this play    signed out it reads Sign in to save; signed in it saves once,
 *                     named from the terminology, with its situation and the run counted,
 *                     then Saved · Open lands on the play
 *   home              Daily, Play (big), Ladder, then My Playbooks smaller
 *
 *   node functions/_lastshot/test/check-starters.mjs   (SHOTS=dir for screenshots) */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import './setup-playbook.mjs';
import { STARTERS, starterPlay } from '../starters.js';
import { SCENARIO } from '../scenario.js';
import { scenarioFor, situationKey } from '../playbook.js';
import { suggest, defaults } from '../names.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';

const PORT = 8797, BASE = 'http://localhost:' + PORT;
const OUT = process.env.SHOTS || null;
const { server } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* the fields a starter puts on the clipboard */
const body = p => p && { spots: p.spots, goAt: p.goAt, steps: p.steps };
const nameOf = (play, sit) => suggest(scenarioFor(SCENARIO, sit), play, defaults()).name;

async function run(name, viewport, mobile) {
  console.log('\n' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
  /* THE CLOUD, IN MEMORY (as check-playbook.mjs has it). */
  await ctx.addInitScript(() => {
    const mem = {}; window.__mem = mem;
    window.RTG_SAVE = { API_VERSION: 1, idle: () => true, signedIn: () => true,
      all: g => Promise.resolve(Object.keys(mem).filter(k => k.startsWith(g + '/')).map(k => ({ slot: k.split('/')[1], progress: mem[k].progress, payload: JSON.parse(JSON.stringify(mem[k].payload)) }))),
      queue: (g, sl, fn) => { const m = fn(); const k = g + '/' + sl; if (!m) return Promise.resolve(null);
        if (mem[k] && mem[k].progress > m.progress) return Promise.resolve({ ok: false, payload: mem[k].payload, progress: mem[k].progress });
        mem[k] = { progress: m.progress, payload: JSON.parse(JSON.stringify(m.payload)) }; return Promise.resolve({ ok: true }); },
      drop: (g, sl) => { delete mem[g + '/' + sl]; return Promise.resolve(null); } };
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|supabase\.co/, r => r.abort());
  const shot = async f => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '-' + f + '.png') }); };
  const L = (fn, a) => page.evaluate(fn, a);
  const clip = () => L(() => { const p = window.__lastShot.play; return { spots: p.spots, goAt: p.goAt, steps: p.steps }; });
  const runTo = async seed => { await L(s => window.__lastShot.run(s), seed); await page.waitForSelector('#sheet.on', { timeout: 40000 }); };
  const books = () => L(() => window.__lastShot.books.store.books());

  await page.goto(BASE + '/last-shot');
  await L(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('last_shot_speed', '2'); });
  await page.reload();
  await page.waitForFunction(() => window.__lastShot && window.__lastShot.books);

  /* ---------- home ---------- */
  const box = id => page.locator('#' + id).boundingBox();
  const [hd, hp, hl, hb] = [await box('hDaily'), await box('hPlay'), await box('hLadder'), await box('hBooks')];
  ok(hd.y < hp.y && hp.y < hl.y && hl.y < hb.y, 'home reads Daily, Play, Ladder, then My Playbooks');
  ok(hp.height > hb.height && hp.height >= hl.height, 'Play is the big card and My Playbooks is smaller (' + Math.round(hp.height) + ' vs ' + Math.round(hb.height) + ')');
  ok((await L(() => document.querySelectorAll('.sheet.on, .fsheet.on').length)) === 0, 'no sheet opens by itself');
  await shot('1-home');

  /* ---------- the first run is the Pin-down starter ---------- */
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });
  ok(same(await clip(), body(starterPlay('pin-down'))), 'a first visit opens on the Pin-down starter');
  ok(await L(() => document.getElementById('bRun').classList.contains('pulse')), 'and Run It pulses');
  ok(same(body(await L(() => window.__lastShot.starter())), body(starterPlay('pin-down'))), 'the first run play is starters.js, one copy');

  /* ---------- the Plays sheet ---------- */
  await page.click('#bClear');
  await page.click('#bPlays');
  await page.waitForSelector('#playsSheet.on');
  const listed = await L(() => [...document.querySelectorAll('#playsList .sitem')].map(b => ({ id: b.dataset.starter, name: b.querySelector('b').textContent, note: b.querySelector('small').textContent })));
  ok(same(listed, STARTERS.map(s => ({ id: s.id, name: s.name, note: s.note }))), 'Plays lists the four starters with their notes: ' + listed.map(s => s.name).join(', '));
  ok((await page.locator('#playsList canvas.thumb').count()) === 4, 'each with a small diagram');
  await shot('2-plays-sheet');
  await page.click('[data-starter=floppy]');
  ok(!(await page.isVisible('#playsSheet')), 'an empty clipboard takes the play with no question');
  ok(same(await clip(), body(starterPlay('floppy'))), 'Floppy loads its spots, Go at and steps');
  ok((await page.textContent('#goChip')) === 'Go at 6.0', 'the Go at chip reads the starter: ' + await page.textContent('#goChip'));

  for (const s of STARTERS) {
    const before = await clip();
    await page.click('#bPlays');
    await page.click('[data-starter=' + s.id + ']');
    ok(await page.isVisible('#playsAsk') && (await page.textContent('#playsAsk b')) === 'Replace your play?', s.name + ': a clipboard with steps asks first');
    ok(same(await clip(), before), s.name + ': nothing changes until Replace');
    await page.click('#playsCancel');
    ok(!(await page.isVisible('#playsAsk')) && same(await clip(), before), s.name + ': Cancel leaves the play alone');
    await page.click('[data-starter=' + s.id + ']');
    await page.click('#playsReplace');
    ok(same(await clip(), body(starterPlay(s.id))), s.name + ': Replace loads its spots, Go at ' + s.play.goAt + ' and ' + s.play.steps.length + ' steps');
    ok((await page.textContent('#goChip')) === 'Go at ' + s.play.goAt.toFixed(1), s.name + ': the chip reads ' + await page.textContent('#goChip'));
    if (s.id === 'horns-twist') { await page.waitForTimeout(150); await shot('3-horns-twist'); }
  }

  /* Undo straight after a starter puts the old play back */
  const mine = { spots: starterPlay('pin-down').spots, goAt: 7, steps: [{ kind: 'move', who: 'O1', pts: [{ x: 30, y: 30 }, { x: 34, y: 27 }], beat: 1 }] };
  await L(p => window.__lastShot.setPlay(p), mine);
  await page.click('#bPlays');
  await page.click('[data-starter=horns-twist]');
  await page.click('#playsReplace');
  ok(same(await clip(), body(starterPlay('horns-twist'))), 'Horns Twist replaces my play');
  await page.click('#bUndo');
  ok(same(await clip(), mine), 'Undo restores my play');
  await page.click('#bUndo');
  ok((await clip()).steps.length === 0, 'and the next Undo is the board\'s own');

  /* ---------- Save this play, signed out ---------- */
  await page.click('#bPlays');
  await page.click('[data-starter=pin-down]');
  await runTo(11);
  ok((await page.textContent('#bSavePlay')) === 'Sign in to save', 'signed out, the card reads Sign in to save');
  ok((await page.locator('.fsheet.on').count()) === 0, 'and nothing pops up');
  await page.click('#bBack');

  /* ---------- signed in: a free run ---------- */
  await L(() => { const A = window.RTG_AUTH || (window.RTG_AUTH = {}); A.boot = () => true; A.state = () => ({ ready: true, resolved: true, signedIn: true, userId: 'check-user' }); A.onChange = f => f(A.state()); A.token = () => 'check'; });
  await runTo(11);
  ok((await page.textContent('#bSavePlay')) === 'Save this play', 'signed in, the card reads Save this play');
  await page.waitForTimeout(250);
  await shot('4-card-save');
  const res1 = await L(() => ({ scheme: window.__lastShot.result.scheme, win: window.__lastShot.result.outcome === 'win' }));
  await L(() => { const b = document.getElementById('bSavePlay'); b.click(); b.click(); });
  await page.waitForFunction(() => document.getElementById('bSavePlay').textContent === 'Saved · Open', null, { timeout: 8000 });
  await page.waitForTimeout(250);
  await shot('5-card-saved');
  let bks = await books();
  ok(bks.length === 1 && bks[0].name === 'My plays', 'no playbook yet, so it starts one: ' + bks.map(b => b.name).join(', '));
  ok(bks[0].plays.length === 1, 'two quick taps save it once');
  let e = bks[0].plays[0];
  const pin = starterPlay('pin-down');
  ok(e.name === nameOf(pin, null) && !e.nameEdited, 'named from the terminology: ' + e.name);
  ok(e.situation === null, 'the game\'s own situation is left off');
  ok(same(body(e.play), body(pin)), 'it saves the play that ran');
  let tally = e.stats[situationKey(SCENARIO, null)];
  ok(tally && tally.byScheme[res1.scheme] && tally.byScheme[res1.scheme].n === 1 && tally.byScheme[res1.scheme].w === (res1.win ? 1 : 0), 'the run counts in the stats, under ' + res1.scheme);
  ok((await L(() => Object.keys(window.__mem).filter(k => k.startsWith('last_shot/b-')).length)) === 1, 'it reaches the account');
  /* the card built again for the same run still says Saved */
  await page.click('#bSavePlay');
  await page.waitForSelector('#editBar', { state: 'visible' });
  ok((await L(() => window.__lastShot.mode)) === 'edit' && (await L(() => window.__lastShot.edit.entry.id)) === e.id, 'Saved · Open lands on that play');
  ok((await page.inputValue('#pbPlayName')) === e.name, 'with its name in the edit bar');
  ok((await books())[0].plays.length === 1, 'and opening it saves nothing new');

  /* ---------- a level: the starter keeps the scout, the save keeps the situation ---------- */
  await page.click('#back');
  await page.click('#back');
  await page.click('#back');
  await L(() => window.__lastShot.openLevel('2-4'));
  await page.waitForSelector('#lvlBar', { state: 'visible' });
  const scout = await page.textContent('#lvlScout');
  await page.click('#bPlays');
  await page.click('[data-starter=horns-twist]');
  if (await page.isVisible('#playsAsk')) await page.click('#playsReplace');
  ok(same(await clip(), body(starterPlay('horns-twist'))), 'a level takes Horns Twist, spots and all');
  ok((await page.textContent('#lvlScout')) === scout && /Fight over/i.test(scout), 'the scout line stays: ' + scout);
  ok((await L(() => [1, 2, 3, 4].map(s => window.__lastShot.simulate(s).scheme).join())) === 'over,over,over,over', 'and the level still plays the scout\'s scheme');
  ok(same(body(await L(() => window.__lastShot.ladder.plays['2-4'])), body(starterPlay('horns-twist'))), 'the level keeps the starter as its play');
  await runTo(5);
  ok((await page.textContent('#bSavePlay')) === 'Save this play', 'the level card has Save this play');
  await page.click('#bSavePlay');
  await page.waitForFunction(() => document.getElementById('bSavePlay').textContent === 'Saved · Open', null, { timeout: 8000 });
  bks = await books();
  ok(bks.length === 1 && bks[0].plays.length === 2, 'it goes in the first playbook');
  e = bks[0].plays[1];
  const sit = { clock: 20, down: 2 };
  ok(same(e.situation, sit), 'with the level\'s situation: ' + JSON.stringify(e.situation));
  ok(e.name === nameOf(starterPlay('horns-twist'), sit), 'named from the terminology: ' + e.name);
  tally = e.stats[situationKey(SCENARIO, sit)];
  ok(tally && tally.byScheme.over && tally.byScheme.over.n === 1, 'the run counts under Fight over, down 2 from 20.0');
  await page.click('#bSavePlay');
  await page.waitForSelector('#editBar', { state: 'visible' });
  ok((await L(() => window.__lastShot.edit.entry.id)) === e.id, 'Saved · Open lands on the level play');
  ok((await page.textContent('#pbSit')) === 'Down 2 · 20.0 · 1 has it', 'and its situation chip: ' + await page.textContent('#pbSit'));
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

try {
  await run('phone', { width: 390, height: 844 }, true);
  await run('desktop', { width: 1440, height: 900 }, false);
} finally { await browser.close(); server.close(); }
console.log(fails ? '\n' + fails + ' failed' : '\nall good');
process.exit(fails ? 1 : 0);
