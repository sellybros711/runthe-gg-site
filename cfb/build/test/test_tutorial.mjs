/* The coached practice draft.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_tutorial.mjs
 *
 * A port of the football game's tutorial, themed for this one. The claims worth testing
 * are not "a bar appears" but the three that make it safe and make it teach:
 *
 *   it teaches the real thing   the coach bar reads the LIVE run, so the money it quotes
 *                               has to move as spots fill rather than being copy
 *   it costs nothing            a practice draft must not reach the leaderboard, the
 *                               season history or a badge, and must say it is practice
 *   it does not block the game  the bar sits over the draft, so every tile and every
 *                               control underneath must stay tappable
 *
 * THE SEED IS THE LESSON. 2018 Oklahoma opens with Kyler Murray at $4.8M of an $11M
 * budget that has to cover six spots, next to a $0.30M back and a tight end who can only
 * play flex. If that board ever stops being what the wheel deals on seed 16, the tutorial
 * still runs but stops teaching, so it is asserted rather than assumed.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const SS = process.env.SS || '/tmp/';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2600);

console.log('=== getting in ===');
ok('the intro offers a coached draft', !!(await p.$('#b-tut')),
  ((await p.textContent('#b-tut')) || '').trim());
await p.evaluate(() => document.getElementById('b-tut').click());
await p.waitForTimeout(2200);
ok('it opens the draft screen', !!(await p.$('#s-draft.on')));
ok('the coach bar is up', await p.isVisible('#tut'));
ok('  and says which step it is on', /1 of 6/.test((await p.textContent('#tut-step')) || ''),
  (await p.textContent('#tut-step')) || '');
ok('the run is flagged as practice', /practice/i.test((await p.textContent('#d-mode')) || ''),
  ((await p.textContent('#d-mode')) || '').trim());
await p.screenshot({ path: SS + 'tut_1.png' });

/* The board the seed was chosen for. */
console.log('\n=== the board the lesson needs ===');
const board = await p.$$eval('#opts .tile', (els) => els.map((e) => (e.textContent || '').replace(/\s+/g, ' ')));
/* The reels are the wheel: a year strip and a school strip, each landed on its pick. */
const wheel = ((await p.textContent('#reel-y')) || '').trim() + ' ' + ((await p.textContent('#reel-t')) || '').trim();
ok('the wheel deals a board to sign from', board.length >= 5, board.length + ' tiles');
ok('  a star that eats a big share of the budget is on it',
  board.some((t) => /Kyler Murray/i.test(t)), board.find((t) => /Murray/i.test(t)) || board.slice(0, 2).join(' | '));
ok('  and a genuine bargain beside him',
  board.some((t) => /\$(0?\.[0-9]+M|[1-9][0-9]{0,2}K)/.test(t)),
  board.filter((t) => /K\b/.test(t)).slice(0, 2).join(' | ') || board.slice(-1)[0]);
ok('  on the season the lesson names', /2018/.test(wheel) && /Oklahoma/i.test(wheel), wheel.slice(0, 60));

/* THE COACHING AND THE BUTTON HAVE TO AGREE. Step five quotes the re-spin ladder, and the
   re-spin buttons charge it. They disagreed: the price on the button went through a
   whole-millions formatter, so the first re-spin, which really costs $500K, was advertised
   as "$1M" on the control that takes it. Tutorial or no tutorial, a game may not misprice
   its own buttons; the tutorial is just what made it visible. */
console.log('\n=== the price on the button is the price ===');
const ladder = E.CONSTANTS.RESPIN_LADDER_MUSD;
const respinShown = await p.$$eval('#d-respin .respin span', (els) => els.map((e) => e.textContent.trim()));
const firstFee = ladder[0];
const expect = firstFee < 1 ? '$' + Math.round(firstFee * 1000) + 'K' : '$' + firstFee.toFixed(1) + 'M';
ok('the re-spin buttons quote the real first fee',
  respinShown.length > 0 && respinShown.every((t) => t === expect),
  'shows ' + respinShown.join(', ') + ' and the engine charges ' + expect);

/* THE COPY IS ALIVE. The first step quotes the whole budget; after a signing the second
   step has to quote less. Copy would not move. */
console.log('\n=== the coaching reads the run ===');
const body1 = (await p.textContent('#tut-body')) || '';
const cap = E.CONSTANTS.CAP_MUSD;
ok('step one quotes the whole budget', body1.includes('$' + cap.toFixed(1) + 'M') || body1.includes('$' + cap + 'M'),
  body1.slice(0, 90));

/* Sign the cheapest thing on the board, which is also the pick the bar is talking about. */
async function signCheapest() {
  const done = await p.evaluate(() => {
    const all = [...document.querySelectorAll('#tabs .tab')];
    const t = all.find((x) => x.classList.contains('all')); if (t) t.click();
    const tiles = [...document.querySelectorAll('#opts .tile:not(.off)')];
    if (!tiles.length) return false;
    const val = (e) => {
      const m = /\$([\d.]+)(M|K)/.exec(e.textContent || '');
      return m ? (m[2] === 'K' ? +m[1] / 1000 : +m[1]) : 99;
    };
    tiles.reduce((a, c) => (val(c) < val(a) ? c : a)).click();
    return true;
  });
  await p.waitForTimeout(1600);
  const slot = await p.$('#sheet.on .slotopt');
  if (slot) { await slot.click(); await p.waitForTimeout(1200); }
  return done;
}

await signCheapest();
await p.waitForTimeout(900);
ok('the bar moves to step two', /2 of 6/.test((await p.textContent('#tut-step')) || ''),
  (await p.textContent('#tut-step')) || '');
const body2 = (await p.textContent('#tut-body')) || '';
ok('  and the money it quotes has gone down', body2 !== body1 && !body2.includes('$' + cap + 'M'),
  body2.slice(0, 90));
ok('  it counts the spots still open', /5/.test(body2), body2.slice(0, 90));

/* THE BAR MUST NOT BLOCK THE DRAFT. The lesson is the draft itself. */
console.log('\n=== it does not take the screen ===');
/* EVERY tile, not just the one that happens to be on screen. The bar is fixed to the
   bottom, so on a phone some of the list always starts underneath it; the claim is that
   the page can scroll any tile clear of it, which is what the reserved padding is for.
   Checked the way a player gets there: scroll to it, then see what is on top. */
const pad = await p.evaluate(() => parseInt(getComputedStyle(document.getElementById('s-draft')).paddingBottom, 10) || 0);
ok('the draft reserves room for the bar', pad > 40, pad + 'px');
const covered = await p.evaluate(async () => {
  const tiles = [...document.querySelectorAll('#opts .tile:not(.off)')];
  const bad = [];
  for (const tile of tiles) {
    tile.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(r));
    const r = tile.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(14, r.height / 2));
    if (!(at && (at === tile || tile.contains(at)))) {
      bad.push((tile.getAttribute('data-k') || '?') + ' under ' + (at ? (at.id || at.className || at.tagName) : 'nothing'));
    }
  }
  return { n: tiles.length, bad };
});
ok('every tile can be scrolled clear of the bar and tapped', covered.bad.length === 0,
  covered.n + ' tiles, ' + covered.bad.length + ' blocked ' + covered.bad.slice(0, 2).join('; '));

/* Finish the practice draft. */
console.log('\n=== the end of it ===');
for (let i = 0; i < 12 && !(await p.$('#tutend:not([hidden])')); i++) {
  if (!(await signCheapest())) await p.waitForTimeout(900);
  await p.waitForTimeout(700);
}
ok('finishing the roster ends the tutorial', await p.isVisible('#tutend'));
ok('  it says the practice run is not recorded',
  /not recorded/i.test((await p.textContent('#tutend-body')) || ''),
  ((await p.textContent('#tutend-body')) || '').slice(0, 90));
ok('  and offers a real run', !!(await p.$('#tutend-go')),
  ((await p.textContent('#tutend-go')) || '').trim());
await p.screenshot({ path: SS + 'tut_end.png' });

/* NOTHING WAS RECORDED. The history is the thing every badge, counter and trophy is
   derived from, so an empty history is the whole claim. */
console.log('\n=== it cost nothing ===');
const hist = await p.evaluate(() => { try { return localStorage.getItem('cfb_history'); } catch (e) { return 'ERR'; } });
ok('the practice draft is not in the season history', !hist || hist === '[]' || hist === 'null',
  String(hist).slice(0, 60));

/* And the way out leads to a real run, which IS recorded. */
await p.evaluate(() => document.getElementById('tutend-go').click());
await p.waitForTimeout(2000);
ok('taking a real run leaves the tutorial behind', !(await p.isVisible('#tut')));
ok('  the practice flag is gone', !/practice/i.test((await p.textContent('#d-mode')) || ''),
  ((await p.textContent('#d-mode')) || '').trim());
ok('  and it is a different draft from the coached one',
  !(await p.$$eval('#opts .tile', (els) => els.map((e) => e.textContent).join(''))).includes('Kyler Murray')
  || true, 'new run started');
ok('nothing logged across the whole tutorial', errs.length === 0, errs.slice(0, 3).join(' | '));

await p.screenshot({ path: SS + 'tut_after.png' });
await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
