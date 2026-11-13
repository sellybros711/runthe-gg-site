#!/usr/bin/env node
/* Beat my play links in Chromium, on a phone (390x844, touch) and a desktop
 * (1440x900): a link opens the Challenge screen with their result worked out
 * from their play, Watch their play runs it on its seed and scheme, Draw
 * yours opens their spot blank, a run of mine uses the same seed and scheme,
 * the card says You beat it or They still have it by beats(), Try again keeps
 * the seed, my own link carries my play, a link made from a free play and a
 * ladder level card makes the round trip, a garbage link says so and goes
 * home, and leaving clears the hash so a reload lands on home.
 *
 *   node functions/_lastshot/test/check-beat.mjs   (SHOTS=dir for screenshots) */
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
import { encode, decode, resultOf, challengeScenario, challengeOpt, beats } from '../challenge.js';
import { simulate } from '../sim.js';
import { scoreOf } from '../daily.js';
import { summaryOf } from '../cards.js';
import { LEVELS, levelScenario } from '../levels.js';

const PORT = 8796, BASE = 'http://localhost:' + PORT;
const OUT = process.env.SHOTS || null;
const { server } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };
const DASHES = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');

/* Their spot: 12.0, down 1, the box set, a scout that says they go under. */
const P = (x, y) => ({ x, y });
const BASEC = { clock: 12, down: 1, set: 'box', scheme: 'under', seed: 987654 };
const SC = challengeScenario(BASEC);
const mk = (tx, ty, g) => ({ spots: SC.spots, goAt: g, steps: [{ kind: 'screen', who: 'O5', pts: [P(31, 12.3)] }, { kind: 'move', who: 'O2', pts: [P(40, 6), P(tx, ty)] },
  { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] });
const THEIRS = mk(22, 24, 6), BETTER = mk(14, 16, 6), WORSE = mk(46, 28, 2);
const CODE = encode({ ...BASEC, play: THEIRS });
const T = resultOf(decode(CODE));
const scoreAs = p => scoreOf(simulate(SC, p, BASEC.seed, challengeOpt(BASEC)));

async function run(name, viewport, mobile) {
  console.log('\n' + name);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.abort());
  const shot = async f => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '-' + f + '.png') }); };
  const L = (fn, a) => page.evaluate(fn, a);
  const ready = () => page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  const clip = () => L(() => navigator.clipboard.readText());
  const codeOf = s => (/#beat=([A-Za-z0-9_-]+)$/.exec(s) || [])[1];

  await page.goto(BASE + '/last-shot');
  await L(() => { try { localStorage.clear(); } catch (e) {} });

  // a link opens the Challenge screen: their result from their play
  await page.goto(BASE + '/last-shot#beat=' + CODE);
  await ready();
  await page.waitForSelector('#vBeat:not([hidden])');
  ok((await page.textContent('#beatHead')) === 'Their play: ' + summaryOf(T.res), 'the header: ' + await page.textContent('#beatHead'));
  ok((await page.textContent('#beatSpot')) === '12.0 · Down 1 · Box' && (await page.textContent('#beatScoutIntro')) === 'Scout: Go under on screens', 'the spot and the scout');
  ok(await page.isVisible('#bWatch') && await page.isVisible('#bDraw'), 'Watch their play and Draw yours');
  ok(!DASHES.test(await page.textContent('#vBeat')), 'no dashes on the Challenge screen');
  await shot('1-challenge');

  // Watch their play: their play, on their seed and scheme, on the court
  await page.click('#bWatch');
  ok((await L(() => window.__lastShot.phase)) != null, 'their play runs on the court');
  await page.waitForSelector('#sheet.on', { timeout: 40000 });
  const w = await L(() => { const r = window.__lastShot.result; return { seed: r.seed, scheme: r.scheme, outcome: r.outcome, shotAt: r.shotAt }; });
  ok(w.seed === BASEC.seed && w.scheme === 'under' && w.outcome === T.res.outcome && w.shotAt === T.res.shotAt, 'watched: seed ' + w.seed + ', ' + w.scheme + ', ' + w.outcome);
  ok((await page.textContent('#card .lvlname')) === 'Their play' && (await page.textContent('#card .dscore')) === summaryOf(T.res), 'the card says it was their play');

  // Draw yours: their spot, blank, the scout set up
  await page.click('#bDraw2');
  await page.waitForSelector('#board', { state: 'visible' });
  ok((await page.textContent('#beatTheirs')) === 'Their play: ' + summaryOf(T.res) && (await page.textContent('#beatSit')) === '12.0 · Down 1 · Box', 'the bar: their play and the spot');
  ok(await page.isVisible('#beatBar') && (await page.textContent('#beatScout')) === 'Scout: Go under on screens' && (await page.textContent('#clock')) === '12.0', 'the clipboard on their spot, with the scout');
  ok((await L(() => window.__lastShot.play.steps.length)) === 0 && JSON.stringify(await L(() => window.__lastShot.play.spots)) === JSON.stringify(SC.spots), 'a blank play on their set');
  ok((await page.textContent('#bRun')) === 'Run It' && /#beat=/.test(await L(() => location.hash)), 'Run It, and the link stays while in it');

  // mine: the same seed and scheme, and the verdict by beats()
  for (const [label, p, file] of [['the same play', THEIRS, null], ['a worse one', WORSE, null], ['a better one', BETTER, '2-you-beat-it']]) {
    await L(p => window.__lastShot.setPlay(p), p);
    await page.click('#bRun');
    await page.waitForSelector('#sheet.on #beatVerdict', { timeout: 40000 });
    const r = await L(() => ({ seed: window.__lastShot.result.seed, scheme: window.__lastShot.result.scheme }));
    const mine = scoreAs(p), won = beats(mine, T.score);
    ok(r.seed === BASEC.seed && r.scheme === 'under', label + ': the same seed and scheme');
    ok((await page.textContent('#beatVerdict')) === (won ? 'You beat it' : 'They still have it'), label + ': ' + mine + ' against ' + T.score + ', ' + await page.textContent('#beatVerdict'));
    ok((await page.textContent('#beatThem')) === 'Them: ' + summaryOf(T.res), label + ': their line');
    if (file) { await page.waitForTimeout(900); await shot(file); }
    if (label !== 'a better one') { await page.click('#bReplay'); ok(await page.isVisible('#board') && (await L(() => window.__lastShot.play.steps.length)) === 4, 'Try again: back to the clipboard, the play kept'); }
  }
  ok(!DASHES.test(await page.textContent('#card')), 'no dashes on the card');

  // my own link: my play, the same seed, spot and scheme
  await page.click('#bBeat');
  const mineLink = await clip();
  const mc = decode(codeOf(mineLink) || '');
  ok(mineLink.startsWith('I drew this one. Beat it.\n') && mc && mc.seed === BASEC.seed && mc.scheme === 'under' && mc.clock === 12 && JSON.stringify(mc.play.steps) === JSON.stringify(BETTER.steps), 'my Beat my play link carries my play');

  // leaving clears the hash, and a reload lands home
  await page.click('#bCardHome');
  ok(await page.isVisible('#vHome') && (await L(() => location.hash)) === '', 'Home clears the hash');
  await page.reload(); await ready();
  ok(await page.isVisible('#vHome') && await page.isHidden('#vBeat'), 'a reload after leaving is home, not the challenge');

  // the back arrow from the clipboard goes to the Challenge screen, then home
  await page.goto(BASE + '/last-shot#beat=' + CODE); await ready();
  await page.click('#bDraw');
  await page.click('#back');
  ok(await page.isVisible('#vBeat'), 'back from the clipboard: the Challenge screen');
  await page.click('#back');
  ok(await page.isVisible('#vHome') && (await L(() => location.hash)) === '', 'back again: home, the hash cleared');

  // a garbage link: one line and a way home, never a crash
  for (const junk of ['nope', '%%%', CODE.slice(0, 30), 'e30', '']) {
    await page.goto(BASE + '/last-shot#beat=' + junk); await ready();
    ok(await page.isVisible('#beatBad') && (await page.textContent('#beatBad')) === 'That link didn\'t work.', 'garbage ' + JSON.stringify(junk.slice(0, 12)) + ': That link didn\'t work.');
  }
  await shot('3-bad-link');
  await page.click('#bBeatHome');
  ok(await page.isVisible('#vHome') && (await L(() => location.hash)) === '', 'and Home clears it');

  // a link opened while the page is up
  await L(c => { location.hash = '#beat=' + c; }, CODE);
  await page.waitForSelector('#vBeat:not([hidden]) #beatHead');
  ok(true, 'a link opened on the page opens the challenge');

  // the round trip from a free play card
  await page.click('#bBeatHome');
  await page.click('#hPlay');
  await page.waitForSelector('#board', { state: 'visible' });
  await L(() => window.__lastShot.setPlay(window.__lastShot.starter()));
  await L(() => window.__lastShot.run(4242));
  await page.waitForSelector('#sheet.on #bBeat', { timeout: 40000 });
  const free = await L(() => { const r = window.__lastShot.result; return { outcome: r.outcome, shot: r.shot, shotAt: r.shotAt }; });
  await page.click('#bBeat');
  const fl = await clip(), fc = decode(codeOf(fl) || '');
  ok(fc && fc.seed === 4242 && fc.clock === 22 && fc.down === 1 && fc.set === 'box' && fc.scheme === null, 'a free play link: 22.0, down 1, the box, its seed, no scheme');
  await page.goto(fl.split('\n')[1]); await ready();
  await page.waitForSelector('#vBeat:not([hidden]) #beatHead');
  const freeLine = summaryOf(free);
  ok((await page.textContent('#beatHead')) === 'Their play: ' + freeLine, 'opened, it shows what that run did: ' + freeLine);

  // and from a ladder level, with its scout scheme
  await page.click('#bBeatHome');
  await L(() => window.__lastShot.openLevel('1-5'));
  await page.waitForSelector('#board', { state: 'visible' });
  const L5 = LEVELS.find(l => l.id === '1-5'), s5 = levelScenario(L5).spots;
  await L(p => window.__lastShot.setPlay(p), { ...THEIRS, spots: s5 });
  await L(() => window.__lastShot.run(77));
  await page.waitForSelector('#sheet.on #bBeat', { timeout: 40000 });
  await page.click('#bBeat');
  const lc = decode(codeOf(await clip()) || '');
  ok(lc && lc.scheme === 'switch' && lc.clock === 22 && lc.seed === 77 && lc.set === 'box', 'a level link carries its scout scheme: ' + (lc && lc.scheme));

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

try {
  ok(T.score === scoreAs(THEIRS) && beats(scoreAs(BETTER), T.score) && !beats(scoreAs(WORSE), T.score), 'the reference plays: theirs ' + T.score + ', better ' + scoreAs(BETTER) + ', worse ' + scoreAs(WORSE));
  await run('phone', { width: 390, height: 844 }, true);
  await run('desktop', { width: 1440, height: 900 }, false);
} finally {
  await browser.close(); server.close();
}
console.log(fails ? '\n' + fails + ' failed' : '\nall good');
process.exit(fails ? 1 : 0);
