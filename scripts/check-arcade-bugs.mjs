/* Regression checks for the arcade bug pass (Phase 1).
 *
 * Each section reproduces one reported bug in a real browser and asserts the
 * fixed behaviour, so a later change that reopens it fails here. Everything
 * runs offline against a local server (scripts/lib/arcade-harness.mjs blocks
 * Supabase, analytics and ads).
 *
 *   node scripts/check-arcade-bugs.mjs            every section
 *   node scripts/check-arcade-bugs.mjs lockout    sections whose name matches
 */
import { serve, launch, page, reporter, today, GAMES, FREE } from './lib/arcade-harness.mjs';

const only = process.argv[2] || '';
const R = reporter();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { srv, base } = await serve();
const browser = await launch();

async function open(game, opts = {}){
  const tier = opts.tier || (FREE.includes(game) ? 'guest' : 'free');
  const { ctx, p } = await page(browser, base, { ...opts, tier });
  await p.goto(base + '/arcade/' + (game ? game + '/' : ''), { waitUntil: 'load' });
  await sleep(opts.settle || 1800);
  return { ctx, p, tier };
}
const wall = p => p.evaluate(() => { const s = document.querySelector('.rtgpg-scrim'); return s ? s.innerText.replace(/\s+/g, ' ').trim() : null; });

/* The first action that spends today's play, per game. A card game is opened
   as a free account, whose single trial play is the one at stake. */
const FIRST = {
  match:        async p => { await p.click('.tile >> nth=0'); },
  crossword:    async p => { await p.click('#board .cell:not(.block) >> nth=0'); },
  highlow:      async p => { await p.click('.catchip >> nth=0'); await sleep(800); await p.click('#results button >> nth=0'); },
  oddone:       async p => { await p.click('.choice >> nth=0'); },
  sportegories: async p => { await p.click('#startBtn'); await sleep(6000); await p.fill('#cats input >> nth=0', 'Barry Bonds').catch(() => {}); },
  career:       async p => { await p.click('#revealBtn'); },
  guess:        async p => { await p.click('#btnClue'); },
  rankit:       async p => { await p.click('#rows .rrow >> nth=0'); },
  almamater:    async p => { await p.click('#bailBtn'); },
  table:        async p => { await p.fill('#answerIn', '7'); await p.click('#answerGo'); },
  rollcall:     async p => { await p.click('#startBtn'); await sleep(1500); },
  chain:        async p => { await p.click('#startBtn'); await sleep(1500); },
};

async function pastTrialGate(p){
  const go = await p.$('#rtgpgGo:visible');
  if (go) { await go.click(); await sleep(500); }
}

/* ------------------------------------------------------------- bugs 1 and 2 */
if ('lockout'.includes(only) || !only) {
  R.section('Bug 1: leaving an unfinished game resumes it, it does not lock you out');
  for (const g of GAMES) {
    const { ctx, p, tier } = await open(g);
    await pastTrialGate(p);
    try { await FIRST[g](p); } catch (e) { R.ok(false, g + ' first action ran', e.message.slice(0, 120)); }
    await sleep(1400);
    const mid = await p.evaluate(g => ({ prog: !!(window.RTGTokens && RTGTokens.inProgress && RTGTokens.inProgress(g)),
      rec: Object.keys(localStorage).filter(k => k.indexOf('rtg:resume:' + g) === 0).length }), g);
    R.ok(mid.prog, g + ' [' + tier + '] is marked in progress after its first action');
    R.ok(mid.rec > 0, g + ' saves its game the moment the play is spent', JSON.stringify(mid));
    await p.reload({ waitUntil: 'load' }); await sleep(2500);
    const w = await wall(p);
    R.ok(!w, g + ' reload shows no lockout wall', w && w.slice(0, 140));
    const after = await p.evaluate(g => ({
      prog: !!(window.RTGTokens && RTGTokens.inProgress && RTGTokens.inProgress(g)),
      locked: !!(window.RTGTokens && document.body.innerText.indexOf(RTGTokens.lockLine(g)) >= 0),
    }), g);
    R.ok(after.prog && !after.locked, g + ' reload lands back in the game', JSON.stringify(after));
    R.ok(p.errs.length === 0, g + ' no page errors', p.errs.join(' | ').slice(0, 200));
    await ctx.close();
  }

  R.section('Bug 2: the games-left counter drops on completion, not on the first move');
  {
    const { ctx, p } = await open('almamater');
    const chip = () => p.evaluate(() => { const e = document.getElementById('rtbTokens'); return e ? e.innerText.trim() : null; });
    const c0 = await chip();
    await FIRST.almamater(p); await sleep(800);
    const c1 = await chip();
    R.ok(c0 === c1 && /4 games left/.test(c1), 'first move leaves the counter alone', c0 + ' -> ' + c1);
    // a wrong pick ends an Alma Mater run: that is completion
    await p.evaluate(() => { const r = document.querySelectorAll('#choices .choice'); for (const b of r) { if (!b.classList.contains('correct')) { b.click(); return; } } });
    await p.click('#choices .choice >> nth=0').catch(() => {});
    await sleep(3200);
    const c2 = await chip();
    const done = await p.evaluate(() => RTGTokens.inProgress('almamater'));
    R.ok(!done && /3 games left/.test(c2), 'finishing the game drops it', c2);
    await ctx.close();
  }
}

/* ------------------------------------------------- bug 1: what comes back */
if ('restore'.includes(only) || !only) {
  R.section('Bug 1: a reload brings back what was played, not a fresh board');
  {
    const { ctx, p } = await open('crossword');
    await p.click('#board .cell:not(.block) >> nth=0'); await p.keyboard.type('Q'); await sleep(1200);
    await p.reload({ waitUntil: 'load' }); await sleep(2500);
    const got = await p.evaluate(() => [...document.querySelectorAll('#board .cell')].some(c => /Q/.test(c.innerText)));
    R.ok(got, 'crossword keeps the letter typed before the reload');
    await ctx.close();
  }
  {
    const { ctx, p } = await open('sportegories');
    await p.click('#startBtn'); await sleep(6000);
    await p.fill('#in0', 'Barry Bonds'); await p.dispatchEvent('#in0', 'input'); await sleep(300);
    const before = await p.evaluate(() => document.getElementById('clockT').textContent);
    await p.reload({ waitUntil: 'load' }); await sleep(2500);
    const after = await p.evaluate(() => ({ v: (document.getElementById('in0') || {}).value, clock: document.getElementById('clockT').textContent,
      play: document.getElementById('panelPlay').classList.contains('on') }));
    R.ok(after.play && after.v === 'Barry Bonds', 'sportegories keeps the typed answer', JSON.stringify(after));
    const secs = t => { const m = String(t).split(':'); return (+m[0]) * 60 + (+m[1]); };
    R.ok(secs(after.clock) <= secs(before), 'sportegories clock does not reset on reload', before + ' -> ' + after.clock);
    await ctx.close();
  }
  {
    const { ctx, p } = await open('highlow');
    await pastTrialGate(p); await FIRST.highlow(p); await sleep(1200);
    const before = await p.evaluate(() => [document.getElementById('baseName').textContent, document.getElementById('oppName').textContent]);
    await p.reload({ waitUntil: 'load' }); await sleep(2500);
    const after = await p.evaluate(() => [document.getElementById('baseName').textContent, document.getElementById('oppName').textContent,
      document.getElementById('panelPlay').classList.contains('on')]);
    R.ok(after[2] && after[0] === before[0] && after[1] === before[1], 'high low comes back to the same matchup', JSON.stringify([before, after]));
    await ctx.close();
  }
  {
    const { ctx, p } = await open('almamater');
    await FIRST.almamater(p); await sleep(800);
    await p.reload({ waitUntil: 'load' }); await sleep(2500);
    const n = await p.evaluate(() => document.querySelectorAll('#choices .choice').length);
    R.ok(n === 4, 'alma mater comes back with the four choices it had opened', 'choices ' + n);
    await ctx.close();
  }
}

/* ------------------------------------------- the saved plays keep their shape */
if ('migration'.includes(only) || !only) {
  R.section('Migration: a wallet saved before this change still reads correctly');
  const { ctx, p } = await page(browser, base, { tier: 'guest' });
  const t = today();
  await ctx.addInitScript(t => {
    // the exact shape tokens.js wrote before the in-progress state existed
    localStorage.setItem('runthegrid_tokens_v3', JSON.stringify({ date: t, plays: { crossword: 1 }, sf: {}, bonus: 0 }));
    localStorage.setItem('rtg:lifetime:v1', JSON.stringify({ plays: { crossword: 12 }, perfect: 3, since: '2026-08-01', last: {} }));
    localStorage.setItem('rtg:crossword:v1', JSON.stringify({ streak: 9, lastDone: t, best: 61 }));
  }, t);
  await p.goto(base + '/arcade/', { waitUntil: 'load' }); await sleep(1800);
  const m = await p.evaluate(() => ({ left: RTGTokens.remaining(), prog: RTGTokens.inProgress('crossword'), can: RTGTokens.canPlay('crossword'),
    life: RTGTokens.lifetime().plays.crossword, perfect: RTGTokens.lifetime().perfect,
    save: JSON.parse(localStorage.getItem('rtg:crossword:v1')) }));
  R.ok(m.left === 3 && !m.prog && !m.can, 'an old played game counts as finished, not in progress', JSON.stringify(m));
  R.ok(m.life === 12 && m.perfect === 3, 'lifetime totals are untouched');
  R.ok(m.save.streak === 9 && m.save.best === 61, 'streak and best are untouched');
  await ctx.close();
}

/* ------------------------------------------------------------------- bug 3 */
if ('stillfree'.includes(only) || !only) {
  R.section('Bug 3: "Still free today" lists only games not yet played');
  const t = today();
  for (const played of [['almamater','crossword'], FREE]) {
    const { ctx, p } = await page(browser, base, { tier: 'guest' });
    await ctx.addInitScript(({ t, played }) => {
      const plays = {}, st = {}; played.forEach(g => { plays[g] = 1; st[g] = 'd'; });
      localStorage.setItem('runthegrid_tokens_v3', JSON.stringify({ date: t, plays, sf: {}, bonus: 0, st }));
    }, { t, played });
    await p.goto(base + '/arcade/almamater/', { waitUntil: 'load' }); await sleep(1800);
    const w = (await wall(p)) || '';
    const listed = await p.evaluate(() => [...document.querySelectorAll('.rtgpg-alt-a')].map(a => a.textContent.trim()));
    if (played.length < 4) {
      R.ok(listed.length === 2 && listed.indexOf('Daily Crossword') < 0, 'lists the two unplayed games only', JSON.stringify(listed));
    } else {
      R.ok(listed.length === 0, 'lists nothing when all four are played', JSON.stringify(listed));
      R.ok(/played all four/i.test(w), 'says plainly that all four are done', w.slice(0, 200));
    }
    await ctx.close();
  }
}

/* ------------------------------------------------------------------- bug 4 */
if ('units'.includes(only) || !only) {
  R.section('Bug 4: one point is "1 pt", and every count of points says so');
  const fs = await import('node:fs');
  const files = ['arcade/leaderboard.js', 'arcade/day.js', 'arcade/index.html'].concat(GAMES.map(g => 'arcade/' + g + '/index.html'));
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    src.split('\n').forEach((ln, i) => {
      // a number glued to a plural unit with no check for one
      if (/\+ ?'( points| pts)/.test(ln) && !/===\s*1/.test(ln)) bad.push(f + ':' + (i + 1));
    });
  }
  R.ok(bad.length === 0, 'no number is glued to "points" or "pts" without a singular', bad.join(', '));
  const { ctx, p } = await open('almamater');
  // valueOf is lifted out of leaderboard.js and run, never re-typed here.
  const lbSrc = fs.readFileSync(new URL('../arcade/leaderboard.js', import.meta.url), 'utf8');
  const fnSrc = lbSrc.match(/function valueOf\(row\) \{[\s\S]*?\n  \}/)[0];
  const lb = [[1, null, 'pts'], [2, null, 'pts'], [1, 'points', 'run'], [1, 'in a row', 'run']].map(([n, unit, kind]) =>
    new Function('CFG', 'fmtTime', fnSrc + '; return valueOf;')({ unit, kind }, () => '')({ run_len: n }));
  R.ok(JSON.stringify(lb) === JSON.stringify(['1 pt', '2 pts', '1 point', '1 in a row']), 'board units read naturally', JSON.stringify(lb));
  const names = await p.evaluate(() => [RTG_BOARD.generatedName('22222222-2222-4222-8222-222222222222'), RTG_BOARD.generatedName('33333333-3333-4333-8333-333333333333')]);
  R.ok(names[0] && names[1] && names[0] !== names[1] && !/Player/.test(names.join()), 'two unnamed accounts get two different names', JSON.stringify(names));
  await ctx.close();
}

/* ------------------------------------------------------------------- bug 5 */
if ('week'.includes(only) || !only) {
  R.section('Bug 5: the week dots mark only the days played, and say so in words');
  const { ctx, p } = await page(browser, base, { tier: 'guest', time: new Date('2026-10-01T12:00:00') });
  await ctx.addInitScript(() => { localStorage.setItem('rtg:almamater:done:2026-09-30', '1'); localStorage.setItem('rtg:almamater:done:2026-10-01', '1'); });
  await p.goto(base + '/arcade/almamater/', { waitUntil: 'load' }); await sleep(1500);
  await p.evaluate(() => { document.getElementById('scrim').classList.remove('hidden'); RTGResultStats.refresh(); });
  await sleep(400);
  const w = await p.evaluate(() => { const box = document.querySelector('.rtgrs-days'); if (!box) return null;
    return { ticks: (box.textContent.match(/\u2713/g) || []).length, labels: [...box.children].map(c => c.getAttribute('aria-label')) }; });
  R.ok(w && w.ticks === 2, 'two played days, two ticks in the page (not seven)', JSON.stringify(w));
  R.ok(w && w.labels[2] === 'Wednesday: played' && w.labels[3] === 'Thursday, today: played' && w.labels[0] === 'Monday: not played' && w.labels[6] === 'Sunday: still to come',
    'each day has a spoken label', w && JSON.stringify(w.labels));
  await ctx.close();
}

/* ------------------------------------------------------------------- bug 6 */
if ('review'.includes(only) || !only) {
  R.section('Bug 6: every result screen can show the player their own answers');
  // Every page: the module loads, and a logged game shows the button in the
  // result sheet and lists the rows when pressed.
  for (const g of GAMES) {
    const { ctx, p } = await open(g, { settle: 1200 });
    const r = await p.evaluate(g => {
      if (!window.RTGReview) return { loaded: false };
      RTGReview.set(g, [{ q: 'Probe question', you: 'Probe answer', answer: 'Right answer', ok: false }]);
      const c = document.getElementById('scrim') || document.getElementById('resultModal');
      if (!c) return { loaded: true, box: false };
      c.classList.add('hidden'); c.setAttribute('hidden', ''); c.classList.remove('hidden'); c.removeAttribute('hidden');
      return { loaded: true, box: true };
    }, g);
    await sleep(300);
    const shown = await p.evaluate(() => { const b = document.querySelector('.rtgrv-btn'); if (!b) return null; b.click();
      const l = document.querySelector('.rtgrv-list'); return { hidden: l.hasAttribute('hidden'), text: l.innerText.replace(/\s+/g, ' ') }; });
    R.ok(r.loaded && r.box, g + ' loads the review module and has a result sheet', JSON.stringify(r));
    R.ok(shown && !shown.hidden && /Probe question/.test(shown.text) && /Probe answer/.test(shown.text) && /Right answer/.test(shown.text),
      g + ' result sheet opens a list of the player’s answers', JSON.stringify(shown));
    await ctx.close();
  }
  // A real game, played to the end: the Number Game, two misses (the save, then out).
  {
    const { ctx, p } = await open('table');
    await pastTrialGate(p);
    const typed = [];
    for (let i = 0; i < 6; i++) {
      const done = await p.evaluate(() => { const s = document.getElementById('scrim'); return s && !s.classList.contains('hidden'); });
      if (done) break;
      const n = String((i * 37 + 3) % 100); typed.push('#' + n);
      await p.fill('#answerIn', n); await p.click('#answerGo'); await sleep(2600);
    }
    await sleep(1200);
    const log = await p.evaluate(() => { const r = RTGReview.read('table'); return r ? r.rows : null; });
    R.ok(log && log.length >= 1 && log.every((row, i) => row.you === typed[i]), 'the Number Game logs every number typed, in order', JSON.stringify(log && log.map(r => r.you)));
    const shown = await p.evaluate(() => { const b = document.querySelector('#scrim .rtgrv-btn'); if (!b) return null; b.click(); return document.querySelector('.rtgrv-list').innerText; });
    R.ok(shown && log && log.every(row => shown.indexOf(row.q) >= 0), 'its result sheet lists each player asked about', shown && shown.slice(0, 160));
    await ctx.close();
  }
}

await browser.close(); srv.close();
console.log(R.fails() ? '\n' + R.fails() + ' failed' : '\narcade bugs ok');
process.exit(R.fails() ? 1 : 0);
