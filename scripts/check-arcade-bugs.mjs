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

/* ------------------------------------------------------------------- bug 9 */
if ('fact'.includes(only) || !only) {
  R.section('Bug 9: the fact line keeps its space and stays until a tap or 4 seconds');
  for (const g of ['almamater', 'career', 'oddone', 'table']) {
    const { ctx, p } = await open(g, { mobile: true });
    const h = await p.evaluate(() => { const f = document.getElementById('factline'); const lh = parseFloat(getComputedStyle(f).lineHeight);
      return { empty: f.getBoundingClientRect().height, lh }; });
    R.ok(h.empty >= h.lh * 3 - 1, g + ' reserves three lines for the fact before it is written', JSON.stringify(h));
    await ctx.close();
  }
  const { ctx, p } = await open('almamater', { mobile: true });
  await p.click('#bailBtn'); await sleep(400);
  const before = await p.evaluate(() => ({ name: document.getElementById('pName').textContent,
    hint: document.getElementById('hintline').getBoundingClientRect().top, fact: document.getElementById('factline').getBoundingClientRect().height }));
  await p.click('#choices .choice >> nth=0'); await sleep(150);
  const shown = await p.evaluate(() => ({ on: document.getElementById('factline').classList.contains('on'),
    hint: document.getElementById('hintline').getBoundingClientRect().top, fact: document.getElementById('factline').getBoundingClientRect().height }));
  R.ok(shown.on, 'a fact is shown after the answer');
  R.ok(Math.abs(shown.hint - before.hint) < 1 && Math.abs(shown.fact - before.fact) < 1, 'writing the fact moves nothing below it', JSON.stringify({ before, shown }));
  await sleep(2600);
  const mid = await p.evaluate(() => ({ name: document.getElementById('pName').textContent, over: !document.getElementById('scrim').classList.contains('hidden') }));
  R.ok(mid.name === before.name && !mid.over, 'at 2.75 seconds the fact is still up and the game has not moved on', JSON.stringify(mid));
  await p.mouse.click(20, 200); await sleep(700);
  const after = await p.evaluate(() => ({ name: document.getElementById('pName').textContent, over: !document.getElementById('scrim').classList.contains('hidden') }));
  R.ok(after.name !== before.name || after.over, 'a tap moves on at once', JSON.stringify(after));
  await ctx.close();
}

/* -------------------------------------------------------------- bugs 11, 12 */
if ('sportegories'.includes(only) || !only) {
  R.section('Bugs 11 and 12: the Sportegories clock stays put, and the result is one card above the rows');
  const { ctx, p } = await open('sportegories', { mobile: true });
  await p.click('#startBtn'); await sleep(6500);
  await p.evaluate(() => window.scrollTo(0, document.getElementById('rows').getBoundingClientRect().bottom + window.scrollY - 200));
  await sleep(400);
  const pin = await p.evaluate(() => { const tb = document.querySelector('.rtg-topbanner'); const c = document.getElementById('clock').getBoundingClientRect();
    return { clockTop: c.top, clockBottom: c.bottom, banner: tb ? tb.getBoundingClientRect().bottom : 0, vh: innerHeight, scrolled: scrollY }; });
  R.ok(pin.scrolled > 100 && pin.clockTop >= pin.banner - 1 && pin.clockBottom < pin.vh / 2, 'scrolled down the card, the clock is still on screen under the banner', JSON.stringify(pin));
  await p.fill('#in0', 'zzz');
  await p.click('#doneBtn');
  await p.waitForFunction(() => !document.getElementById('scrim').classList.contains('hidden'), null, { timeout: 20000 });
  await sleep(500);
  const res = await p.evaluate(() => { const sc = document.getElementById('scrim'); const cs = getComputedStyle(sc);
    const rows = document.getElementById('rows').getBoundingClientRect(), card = sc.getBoundingClientRect();
    return { inPanel: !!sc.closest('#panelPlay'), pos: cs.position, cardAboveRows: card.bottom <= rows.top + 1,
      score: document.getElementById('mScore').textContent, tally: document.getElementById('tallyN').textContent,
      tallyShown: document.getElementById('tally').classList.contains('on') }; });
  R.ok(res.inPanel && res.pos === 'static', 'the result is a card in the board, not an overlay', JSON.stringify(res));
  R.ok(res.cardAboveRows, 'it sits above the scored rows, which stay readable under it');
  R.ok(res.score === res.tally && !res.tallyShown, 'the score is said once: the tally becomes the card and is not counted again', JSON.stringify(res));
  await ctx.close();
}

/* ---------------------------------------------------------------- bugs 7, 8 */
if ('franchise'.includes(only) || !only) {
  R.section('Bugs 7 and 8: each team under its name of the day, and a franchise counted once');
  const { ctx, p } = await open('table');
  const r = await p.evaluate(() => {
    const F = window.RTGFranchise, E = window.GRID_ENTITIES, out = { anach: [], dup: [], named: {} };
    for (const e of E) {
      if (!e.tk || !e.t) continue;
      if (new Set(e.tk).size !== e.tk.length) out.dup.push(e.name);
      const sp = F.span(e); if (!sp) continue;
      for (const n of e.t) {   // a name from the table must have been in use at some point of the career
        const k = F.key(e.sport, n, sp[0], sp[1]), eras = (F._F[e.sport] || {})[k]; if (!eras) continue;
        const mine = eras.filter(x => x[2] === n);
        const ov = x => Math.max(0, Math.min(x[1], sp[1]) - Math.max(x[0], sp[0]) + 1);
        if (mine.length && !mine.some(x => ov(x) >= Math.min(2, sp[1] - sp[0] + 1, x[1] - x[0] + 1))) out.anach.push(e.name + ': ' + n);
      }
    }
    const by = n => E.find(e => e.name === n);
    for (const n of ['Sammy Baugh', 'Oscar Robertson', 'Bruce Matthews', 'Hank Aaron', 'Patrick Ewing', 'Albert Haynesworth', 'George Mikan'])
      { const e = by(n); out.named[n] = e ? { t: e.t, tk: e.tk } : null; }
    out.wasEarly = (window.RTG_TABLE_POOL || []).length;
    out.fact = window.RTGFact ? [0, 1, 2, 3].map(k => RTGFact.of(by('Bruce Matthews'), { seed: k })).join(' ') : null;
    return out;
  });
  R.ok(r.anach.length === 0, 'no player carries a club name from outside his career years', r.anach.slice(0, 6).join(' | '));
  R.ok(r.dup.length === 0, 'no franchise appears twice in a player’s franchise list', r.dup.slice(0, 6).join(', '));
  const N = r.named;
  R.ok(N['Sammy Baugh'] && N['Sammy Baugh'].t.includes('Washington Redskins') && !N['Sammy Baugh'].t.includes('Washington Commanders'), 'Sammy Baugh played for the Washington Redskins', JSON.stringify(N['Sammy Baugh']));
  R.ok(N['Albert Haynesworth'] && !N['Albert Haynesworth'].t.includes('Washington Commanders'), 'a 2009 career is not filed under a name from 2022', JSON.stringify(N['Albert Haynesworth']));
  R.ok(N['Oscar Robertson'] && N['Oscar Robertson'].t.includes('Cincinnati Royals'), 'Oscar Robertson played for the Cincinnati Royals, not the Sacramento Kings', JSON.stringify(N['Oscar Robertson']));
  R.ok(N['George Mikan'] && N['George Mikan'].t.includes('Minneapolis Lakers'), 'George Mikan played for the Minneapolis Lakers', JSON.stringify(N['George Mikan']));
  R.ok(N['Bruce Matthews'] && N['Bruce Matthews'].tk.length === 1, 'Bruce Matthews (Oilers and Titans) is one franchise', JSON.stringify(N['Bruce Matthews']));
  R.ok(N['Hank Aaron'] && N['Hank Aaron'].tk.length === 2, 'Hank Aaron (Milwaukee and Atlanta Braves, Brewers) is two franchises', JSON.stringify(N['Hank Aaron']));
  R.ok(N['Patrick Ewing'] && !N['Patrick Ewing'].t.includes('Oklahoma City Thunder'), 'Patrick Ewing never played for the Thunder', JSON.stringify(N['Patrick Ewing']));
  R.ok(r.fact && /the Houston Oilers \/ Tennessee Titans/.test(r.fact) && !/ the Tennessee Titans\./.test(r.fact), 'his fact line names his one franchise under both names', r.fact);
  // Stint games show the club as it was called in those seasons.
  const nums = await p.evaluate(() => { const F = window.RTGFranchise; return (window.RTG_JERSEYS ? RTG_JERSEYS.stints : [])
    .filter(s => s.sport === 'NFL' && s.team === 'Washington Commanders' && s.y1 < 2020).slice(0, 50)
    .map(s => F.nameAt('NFL', s.team, s.y0, s.y1)); });
  R.ok(nums.length > 0 && nums.every(n => n === 'Washington Redskins'), 'pre-2020 Washington stints show as the Redskins', JSON.stringify(nums.slice(0, 3)));
  await ctx.close();
  // Sportegories: a team category names every era it accepts.
  const sg = await open('sportegories');
  const lab = await sg.p.evaluate(() => { const S = window.RTG_SPORTEGORIES, out = [];
    for (let i = 0; i < 365; i++) { const d = new Date(2026, 0, 1 + i); const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      S.daily(ds).cats.forEach(c => out.push(c.label)); }
    return out; });
  const bad = lab.filter(l => /the (Washington Commanders|Tennessee Titans|Oklahoma City Thunder|Cleveland Guardians)\b/.test(l) && !/ \/ /.test(l));
  R.ok(bad.length === 0, 'a Sportegories team that took other names reads with them (Houston Oilers / Tennessee Titans)', bad.slice(0, 4).join(' | '));
  R.ok(lab.some(l => /Houston Oilers \/ Tennessee Titans/.test(l)), 'and the relabel is actually exercised over a year of cards');
  await sg.ctx.close();
}

/* ------------------------------------------------------------------ bug 13 */
if ('career'.includes(only) || !only) {
  R.section('Bug 13: Career Path keeps the suggestions away from the four names, and a pick needs a confirm');
  const { ctx, p } = await open('career', { mobile: true });
  await p.fill('#answerIn', 'Mich'); await sleep(500);
  const geo = await p.evaluate(() => { const b = document.getElementById('bailBtn'), cs = getComputedStyle(b);
    const box = document.querySelector('.rtgtype-box:not([hidden])'); const br = b.getBoundingClientRect(), xr = box ? box.getBoundingClientRect() : null;
    const hit = xr && !(br.bottom <= xr.top || br.top >= xr.bottom || br.right <= xr.left || br.left >= xr.right);
    return { box: !!box, visible: cs.visibility !== 'hidden' && cs.pointerEvents !== 'none', overlap: !!hit,
      bailAbove: br.bottom <= document.getElementById('answerIn').getBoundingClientRect().top }; });
  R.ok(geo.box, 'typing opens the name suggestions');
  R.ok(!geo.visible && geo.bailAbove, 'while a name is typed, the four-name button sits above the field and takes no taps', JSON.stringify(geo));
  await p.fill('#answerIn', ''); await p.dispatchEvent('#answerIn', 'input'); await sleep(200);
  await p.click('#bailBtn'); await sleep(300);
  await p.click('#choices .choice >> nth=0'); await sleep(600);
  const mid = await p.evaluate(() => ({ go: document.getElementById('choiceGo') && !document.getElementById('choiceGo').disabled,
    label: (document.getElementById('choiceGo') || {}).textContent, judged: !!document.querySelector('#choices .choice.correct, #choices .choice.wrong') }));
  R.ok(mid.go && /^Lock in /.test(mid.label) && !mid.judged, 'tapping a name selects it and does not answer', JSON.stringify(mid));
  await p.click('#choiceGo'); await sleep(500);
  const end = await p.evaluate(() => !!document.querySelector('#choices .choice.correct'));
  R.ok(end, 'Lock it in answers the round');
  await ctx.close();
}

/* ------------------------------------------------------------- bugs 14 to 16 */
if ('crossword'.includes(only) || !only) {
  R.section('Bugs 14 to 16: the crossword starts on a clue, fits a phone, and takes a real keyboard');
  const state = p => p.evaluate(() => { const cells = [...document.querySelectorAll('#board .cell')], n = Math.round(Math.sqrt(cells.length));
    const i = cells.findIndex(c => c.classList.contains('sel')), s = cells[i];
    return { i, r: Math.floor(i / n), c: i % n, block: s ? s.classList.contains('block') : null, num: s && s.querySelector('.num') ? s.querySelector('.num').textContent : '',
      tag: document.getElementById('clueTag').textContent.trim(), active: !!document.querySelector('.list li.active'),
      firstA: (document.querySelector('#listA li .n') || {}).textContent, letters: cells.map(c => (c.querySelector('.ch') || {}).textContent || '').join('') }; });

  // 14: before anything is pressed, the cursor is on the first Across clue.
  const d = await open('crossword', { vp: { width: 1280, height: 860 } });
  let s = await state(d.p);
  R.ok(s.i >= 0 && !s.block && s.active, 'the page opens with a lit cell and a highlighted clue', JSON.stringify(s));
  R.ok(new RegExp('^' + s.firstA + ' ACROSS', 'i').test(s.tag) && s.num === s.firstA, 'and it is the first Across clue, on its first square', s.tag + ' / num ' + s.num);

  // 16: arrows, letters, Backspace, Tab.
  const start = s;
  await d.p.keyboard.press('ArrowRight'); s = await state(d.p);
  R.ok(s.r === start.r && s.c === start.c + 1, 'ArrowRight moves along the Across word', start.r + ',' + start.c + ' -> ' + s.r + ',' + s.c);
  await d.p.keyboard.press('ArrowLeft'); await d.p.keyboard.press('q'); s = await state(d.p);
  R.ok(s.letters.includes('Q') && s.c === start.c + 1, 'a letter fills the square and steps on', JSON.stringify({ c: s.c }));
  await d.p.keyboard.press('Backspace'); s = await state(d.p);
  R.ok(!s.letters.includes('Q') && s.c === start.c, 'Backspace steps back and clears it', JSON.stringify({ c: s.c, has: s.letters.includes('Q') }));
  await d.p.keyboard.press('Tab'); const t1 = (await state(d.p)).tag;
  R.ok(t1 !== start.tag, 'Tab moves to the next clue', start.tag + ' -> ' + t1);
  await d.p.keyboard.press('Shift+Tab'); s = await state(d.p);
  R.ok(s.tag === start.tag, 'Shift+Tab comes back', s.tag);
  // On a square two words cross, an arrow across the current word turns the
  // cursor before it moves anywhere.
  const cross = await d.p.evaluate(() => { const cells = [...document.querySelectorAll('#board .cell')], n = Math.round(Math.sqrt(cells.length));
    const w = (r, c) => r >= 0 && c >= 0 && r < n && c < n && !cells[r * n + c].classList.contains('block');
    for (let i = 0; i < cells.length; i++) { const r = Math.floor(i / n), c = i % n;
      if (w(r, c) && (w(r, c - 1) || w(r, c + 1)) && (w(r - 1, c) || w(r + 1, c))) return i; } return -1; });
  R.ok(cross >= 0, 'the puzzle has a square where two words cross');
  if (cross >= 0) {
    await d.p.click('#board .cell >> nth=' + cross); const pre = await state(d.p);
    await d.p.keyboard.press(/ACROSS/.test(pre.tag) ? 'ArrowDown' : 'ArrowRight'); s = await state(d.p);
    R.ok(s.i === pre.i && /ACROSS/.test(s.tag) !== /ACROSS/.test(pre.tag), 'an arrow across the word turns the cursor first, without moving', pre.tag + ' -> ' + s.tag + ' at ' + pre.i + '/' + s.i);
  }
  // Keys typed into a page field are not grid input.
  const before = (await state(d.p)).letters;
  await d.p.evaluate(() => { const i = document.createElement('input'); i.id = 'cwProbe'; document.body.appendChild(i); i.focus(); });
  await d.p.keyboard.type('zzz'); await d.p.keyboard.press('Backspace');
  R.ok((await state(d.p)).letters === before, 'typing in a text field leaves the grid alone');
  await d.ctx.close();

  // 15: the whole grid is above the pinned clue and keyboard on a phone.
  for (const vp of [[375, 667], [360, 640], [390, 844]]) {
    const m = await open('crossword', { mobile: true, vp: { width: vp[0], height: vp[1] } });
    await m.p.click('#board .cell:not(.block) >> nth=0'); await sleep(500);
    await m.p.click('#kbd .key:not(.wide) >> nth=0'); await sleep(400);
    const g = await m.p.evaluate(() => { const r = e => e.getBoundingClientRect(), b = r(document.getElementById('board')), bar = r(document.querySelector('.playbar')),
      tb = document.querySelector('.rtg-topbanner'); return { top: Math.round(b.top), bot: Math.round(b.bottom), barTop: Math.round(bar.top),
      banner: tb ? Math.round(r(tb).bottom) : 0, wide: document.documentElement.scrollWidth > innerWidth }; });
    R.ok(g.bot <= g.barTop && g.top >= g.banner, vp.join('x') + ': the whole grid is in view between the banner and the keyboard', JSON.stringify(g));
    R.ok(!g.wide, vp.join('x') + ': and the page does not scroll sideways');
    await m.ctx.close();
  }
}

await browser.close(); srv.close();
console.log(R.fails() ? '\n' + R.fails() + ' failed' : '\narcade bugs ok');
process.exit(R.fails() ? 1 : 0);
