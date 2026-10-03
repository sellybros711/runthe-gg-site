#!/usr/bin/env node
/* Phase 5: every game played to its end, at a phone and a desktop width, as a
   guest, a free account and an Arcade Card holder.

   One run is one game, one tier, one width. It opens the page and records what
   a player of that tier meets: whether the game is open at all, how many taps
   stand between the page and the first move, and (on a phone) whether the
   board is on the first screen. Then it makes the first move, reloads in the
   middle and asserts the game comes back, plays to the end screen, and presses
   Share. A screenshot is taken at the start, the middle and the end.

     node scripts/check-arcade-phase5.mjs                 every run, and the asserts
     node scripts/check-arcade-phase5.mjs --out DIR       also write runs.json and the shots
     node scripts/check-arcade-phase5.mjs --only guess    one game
     node scripts/check-arcade-phase5.mjs --record        write runs.json, assert nothing
                                                          (how the "before" table is made on main)
     node scripts/check-arcade-phase5.mjs --before scripts/arcade-phase5-before.json
                                                          the table against main as it was at
                                                          5a38ca58, recorded with this harness

   Reading the "before" side: main has no resume, so a reload mid-game puts a
   guest or free player on a wall (the play is gone) and a card holder back on
   the start screen. A card holder could start a new game there; the drivers
   only finish a game in progress, so those runs read as not ending.

   Offline by construction (the harness refuses Supabase, analytics and ads),
   so nothing is filed to a live board. gtag is the page's own inline stub, so
   the events a run fires land in window.dataLayer and are read from there.

   The last section tests the two analytics events no playthrough can reach:
   arcade_abandon (a game left in progress) and arcade_return (the first page
   of a new day). */
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, page, reporter, GAMES, FREE } from './lib/arcade-harness.mjs';
import { table, markdown } from './lib/arcade-play-report.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = opt('--out');
const ONLY = opt('--only');
const RECORD = args.includes('--record');
const BEFORE = opt('--before');
const JOBS = +(opt('--jobs') || 4);
const TIERS = opt('--tier') ? opt('--tier').split(',') : ['guest', 'free', 'card'];
const VIEWLIST = opt('--view') ? opt('--view').split(',').map(Number) : [375, 1280];
const R = reporter();
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const { srv, base } = await serve();
const browser = await launch();

/* ---- per game ------------------------------------------------------------ */
/* FIRST is the move that spends the play. FINISH plays from there to the end
   screen by the shortest legal path (usually giving up, or a deliberate wrong
   answer until the game ends): the end screen is what is under test, not how
   well a bot plays. A game whose end is on a clock is fast-forwarded. */
const vis = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const clickIf = async (p, sel) => { if (await vis(p, sel)) { await p.locator(sel).first().click({ timeout: 3000 }).catch(() => {}); return true; } return false; };
async function until(p, cond, step, max = 60){
  for (let i = 0; i < max; i++) {
    if (await cond()) return true;
    await step(i);
  }
  return cond();
}
/* The end screen is the result sheet with a share on it. Once the result card
   has drawn, the sheet's own Share is hidden and the card carries it, so
   either counts. */
const ended = p => p.evaluate(() => {
  const sh = document.querySelector('#scrim:not(.hidden) .sheet, #scrim:not(.hidden) .modal, #resultModal:not([hidden])');
  return !!(sh && sh.getClientRects().length && sh.querySelector('#mShare, #resShare'));
}).catch(() => false);
const shareBtn = async p => (await vis(p, '[data-rtgart-share]')) ? p.locator('[data-rtgart-share]').first() : p.locator('#mShare, #resShare').first();

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

const FINISH = {
  // four real misses; random fours, since a free miss costs nothing and a repeat is refused
  match: async p => {
    await until(p, () => ended(p), async () => {
      await clickIf(p, '#btnDeselect');
      const n = await p.locator('#pool .tile').count();
      const pick = new Set(); while (pick.size < Math.min(4, n)) pick.add(Math.floor(Math.random() * n));
      for (const i of pick) await p.locator('#pool .tile').nth(i).click({ timeout: 2000 }).catch(() => {});
      await clickIf(p, '#btnSubmit'); await sleep(1300);
    }, 40);
  },
  // no losing path: type the grid's own answers
  crossword: async p => {
    const cells = await p.evaluate(() => {
      const D = RTGArchive.date();
      const P = (window.RTG_PUZZLES && RTG_PUZZLES.puzzles && RTG_PUZZLES.puzzles.find(x => x.id === D))
        || (window.RTGFlags && RTGFlags.on('densecw', D) && window.RTG_CWMINI && RTG_CWMINI.forDate(D))
        || (window.RTG_CWGEN && RTG_CWGEN.forDate(D)) || RTG_PUZZLES.forDate(D);
      const out = []; P.rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '#') out.push([r, c, ch]); }));
      return out;
    });
    const all = p.locator('#board .cell');
    const cols = await p.evaluate(() => { const b = document.querySelectorAll('#board .cell'); const t0 = b[0].getBoundingClientRect().top; let n = 0; for (const e of b) { if (Math.abs(e.getBoundingClientRect().top - t0) < 2) n++; else break; } return n; });
    for (const [r, c, ch] of cells) {
      if (await ended(p)) break;
      await all.nth(r * cols + c).click({ timeout: 2000 }).catch(() => {});
      await p.keyboard.press(ch.toUpperCase());
    }
  },
  // one wrong call ends a run; both values are on the page before the reveal
  highlow: async p => {
    await until(p, () => ended(p), async () => {
      const v = await p.evaluate(() => { const n = id => parseFloat((document.getElementById(id) || {}).textContent.replace(/[^\d.]/g, '')); return [n('baseVal'), n('oppVal')]; }).catch(() => [NaN, NaN]);
      if (isNaN(v[0]) || isNaN(v[1])) { await sleep(500); return; }
      await clickIf(p, v[1] > v[0] ? '#btnLower' : '#btnHigher'); await sleep(1500);
    }, 20);
  },
  // a pick that is not the odd one out ends it; the why step and the fact are skippable
  oddone: async p => {
    await until(p, () => ended(p), async () => {
      if (await clickIf(p, '#whySkip')) { await sleep(400); return; }
      const t = await p.evaluate(() => { try { const d = window.__rtgDeal(200); const ids = [...document.querySelectorAll('#choices .choice')].map(e => e.dataset.id).sort().join(); const r = d.find(x => x.five.map(f => f.id).sort().join() === ids); return r ? r.target.id : null; } catch (e) { return null; } });
      const ch = p.locator('#choices .choice' + (t ? ':not([data-id="' + t + '"])' : '')).first();
      if (await ch.isVisible().catch(() => false)) await ch.click({ timeout: 2000 }).catch(() => {});
      else await p.mouse.click(5, 300);
      await sleep(900);
    }, 30);
  },
  sportegories: async p => { await until(p, () => vis(p, '#doneBtn'), () => sleep(500), 20); await clickIf(p, '#doneBtn'); await sleep(800); await clickIf(p, '#skipBtn'); },
  // bail is the first move, so a wrong choice and its go end it
  career: async p => {
    await until(p, () => ended(p), async () => {
      if (!(await vis(p, '#choices .choice'))) { await clickIf(p, '#bailBtn'); await sleep(500); }
      const t = await p.evaluate(() => { try { return window.__rtgDeal(1)[0].target.id; } catch (e) { return null; } });
      const ch = p.locator('#choices .choice' + (t ? ':not([data-id="' + t + '"])' : '')).first();
      await ch.click({ timeout: 2000 }).catch(() => {});
      await clickIf(p, '#choiceGo'); await sleep(900); await p.mouse.click(5, 300);
    }, 20);
  },
  guess: async p => {
    await until(p, () => ended(p), async () => {
      await p.fill('#q', 'an').catch(() => {}); await sleep(300);
      await clickIf(p, '#go'); await sleep(700);
    }, 14);
  },
  rankit: async p => {
    await until(p, () => ended(p), async () => {
      if (await clickIf(p, '.pod-next')) { await sleep(600); return; }
      await clickIf(p, '#checkBtn'); await sleep(1400);
    }, 20);
  },
  almamater: async p => {
    await until(p, () => ended(p), async () => {
      if (!(await vis(p, '#choices .choice'))) { await clickIf(p, '#bailBtn'); await sleep(500); }
      const k = await p.evaluate(() => { try { const nm = document.getElementById('pName').textContent.trim(); const r = window.__rtgDeal(200).find(x => x.target.name === nm); return r ? r.schools.findIndex(s => s !== r.col) : 0; } catch (e) { return 0; } });
      await p.locator('#choices .choice[data-i="' + k + '"]').first().click({ timeout: 2000 }).catch(() => {});
      await sleep(900); await p.mouse.click(5, 300);
    }, 20);
  },
  // two misses end it; 0 and 99 cannot both be within two of the answer
  table: async p => {
    let i = 0;
    await until(p, () => ended(p), async () => {
      await p.fill('#answerIn', i++ % 2 ? '0' : '99').catch(() => {}); await clickIf(p, '#answerGo');
      await sleep(900); await p.mouse.click(5, 300); await sleep(300);
    }, 30);
  },
  rollcall: async p => { await clickIf(p, '#doneBtn'); },
  chain:    async p => { await clickIf(p, '#giveBtn'); },
};

/* SCORE makes one right move, so the run ends with a score and the game
   submits it. Used by the scored-run section to prove a finish that reaches
   the board is counted once, not once by board.js and again by metrics.js. */
const SCORE = {
  oddone: async p => {
    const t = await p.evaluate(() => { const d = window.__rtgDeal(200); const ids = [...document.querySelectorAll('#choices .choice')].map(e => e.dataset.id).sort().join(); const r = d.find(x => x.five.map(f => f.id).sort().join() === ids); return r ? r.target.id : null; });
    if (!t) return false;
    await p.click('#choices .choice[data-id="' + t + '"]'); await sleep(900);
    await clickIf(p, '#whySkip'); await sleep(600); await p.mouse.click(5, 300); await sleep(900);
    return true;
  },
  almamater: async p => {
    if (!(await vis(p, '#choices .choice'))) { await clickIf(p, '#bailBtn'); await sleep(500); }
    const k = await p.evaluate(() => { const nm = document.getElementById('pName').textContent.trim(); const r = window.__rtgDeal(200).find(x => x.target.name === nm); return r ? r.schools.findIndex(s => s === r.col) : -1; });
    if (k < 0) return false;
    await p.click('#choices .choice[data-i="' + k + '"]'); await sleep(900); await p.mouse.click(5, 300); await sleep(900);
    return true;
  },
  highlow: async p => {
    const v = await p.evaluate(() => { const n = id => parseFloat((document.getElementById(id) || {}).textContent.replace(/[^\d.]/g, '')); return [n('baseVal'), n('oppVal')]; });
    if (isNaN(v[0]) || isNaN(v[1]) || v[0] === v[1]) return false;
    await p.click(v[1] > v[0] ? '#btnHigher' : '#btnLower'); await sleep(1800);
    return true;
  },
};

/* ---- one run ------------------------------------------------------------- */
const VIEWS = { 375: { mobile: true, vp: { width: 375, height: 740 } }, 1280: { mobile: false, vp: { width: 1280, height: 900 } } };

async function shot(p, name){
  if (!OUT) return;
  await p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
}
const events = p => p.evaluate(() => (window.dataLayer || []).filter(a => a && a[0] === 'event').map(a => ({ ev: a[1], p: a[2] || {} }))).catch(() => []);

async function run(game, tier, view, opts = {}){
  const V = VIEWS[view];
  const tag = view + '-' + tier + '-';
  const r = { game, tier, view, playable: false, gateTaps: 0, boardOnScreen: null, moved: false, resumed: false,
              finished: false, shareText: false, errors: 0, firstMoveEvent: false, completedEvent: false, shareEvent: false, notes: [] };
  const { ctx, p } = await page(browser, base, { tier, mobile: V.mobile, vp: V.vp, time: new Date() });
  await ctx.addInitScript(() => {
    window.__shared = [];
    try {
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push({ kind: 'share', text: d && d.text, files: !!(d && d.files && d.files.length) }); return Promise.resolve(); } });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__shared.push({ kind: 'clip', text: t }); return Promise.resolve(); } } });
    } catch (e) {}
  });
  try {
    await p.goto(base + '/arcade/' + game + '/', { waitUntil: 'load' });
    await sleep(1800);

    // the pregame screen (rules, or a trial notice) is a tap a player makes
    if (await clickIf(p, '#rtgpgGo')) { r.gateTaps++; await sleep(600); }
    const walled = await p.evaluate(() => { const s = document.querySelector('.rtgpg-scrim'); return !!(s && s.offsetParent !== null); });
    const canPlay = await p.evaluate(g => !!(window.RTGTokens && RTGTokens.canPlay ? RTGTokens.canPlay(g) : true), game);
    r.playable = !walled && canPlay;
    await shot(p, tag + 'start-' + game);
    if (!r.playable) { r.notes.push('walled'); return r; }

    if (view === 375) r.boardOnScreen = await p.evaluate(BOARD_PROBE, game);

    await FIRST[game](p);
    await sleep(1400);
    r.moved = await p.evaluate(SPENT, game);
    const ev1 = await events(p);
    r.firstMoveEvent = ev1.some(e => e.ev === 'arcade_first_move' && e.p.arcade_game);
    if (!r.moved) { r.notes.push('first move did not spend the play'); return r; }

    await p.reload({ waitUntil: 'load' });
    await sleep(2500);
    // a pregame sheet with a way in is a rules tap; one without is a wall
    if (await clickIf(p, '#rtgpgGo')) { await sleep(600); r.notes.push('a rules tap after reload'); }
    r.wallAfterReload = await p.evaluate(() => { const s = document.querySelector('.rtgpg-scrim'); return !!(s && s.getClientRects().length); });
    if (r.wallAfterReload) r.notes.push('a wall after reload');
    r.resumed = await p.evaluate(g => {
      const s = document.querySelector('.rtgpg-scrim');
      // a build with no inProgress (main, before Phase 1) has no resume at all
      return !!(RTGTokens.inProgress && RTGTokens.inProgress(g)) && !(s && s.offsetParent !== null);
    }, game);
    if (!r.resumed) r.notes.push('did not resume');
    await shot(p, tag + 'mid-' + game);

    // a walled page can still show a result sheet ("come back tomorrow"),
    // and that is not this run reaching its end
    if (r.wallAfterReload) { await shot(p, tag + 'end-' + game); return r; }
    // no wall and no game: back on the start screen, where a player starts over
    if (!r.resumed) {
      try { await FIRST[game](p); await sleep(1400); r.restarted = true; r.notes.push('restarted from the start screen'); }
      catch (e) { r.notes.push('restart: ' + e.message.split('\n')[0].slice(0, 100)); }
    }
    if (opts.score) {
      try { r.scored = await SCORE[game](p); } catch (e) { r.notes.push('score: ' + e.message.split('\n')[0].slice(0, 120)); }
    }
    try { await FINISH[game](p, ctx); } catch (e) { r.notes.push('finish: ' + e.message.split('\n')[0].slice(0, 120)); }
    r.finished = await until(p, () => ended(p), () => sleep(500), 20);
    await sleep(1200);
    await shot(p, tag + 'end-' + game);
    if (!r.finished) return r;

    // the "sound is off" note a first win brings must not sit on the result card
    r.nudgeOverSheet = await p.evaluate(() => !!document.getElementById('rtgSoundNudge'));
    await (await shareBtn(p)).click({ timeout: 3000 });
    await sleep(1500);
    const shared = await p.evaluate(() => window.__shared || []);
    const first = shared[0];
    r.shareText = !!(first && !first.files && /Run The Arcade/.test(first.text || ''));
    const evs = await events(p);
    r.shareEvent = evs.some(e => e.ev === 'arcade_share' && e.p.share_kind === 'text');
    const done = evs.filter(e => e.ev === 'arcade_game_completed');
    r.completedEvent = done.length === 1;
    r.completedKind = done.map(e => e.p.submitted ? 'submitted' : 'unsubmitted').join(',');
    if (!first) r.notes.push('share sent nothing');
  } catch (e) {
    r.notes.push('run: ' + e.message.split('\n')[0].slice(0, 160));
  } finally {
    r.errors = p.errs.length;
    if (p.errs.length) r.notes.push('errors: ' + p.errs.slice(0, 3).join(' | ').slice(0, 200));
    await ctx.close();
  }
  return r;
}

/* Was the play spent. inProgress is the answer on this branch; a build
   without it (main) is read off the plays counter tokens.js keeps. */
function SPENT(g){
  if (RTGTokens.inProgress) return RTGTokens.inProgress(g);
  try { return ((JSON.parse(localStorage.getItem('runthegrid_tokens_v3') || '{}').plays || {})[g] || 0) > 0; } catch (e) { return false; }
}

/* Is the board on the first screen of a phone. Each game names the thing a
   player plays on; it has to start inside the window (some of it showing is
   enough: a crossword grid taller than the phone still starts on screen). */
function BOARD_PROBE(game){
  const SEL = { match: '.tile', crossword: '#board', highlow: '.catchip', oddone: '.choice', sportegories: '#startBtn',
    career: '#revealBtn', guess: '#btnClue', rankit: '#rows', almamater: '#bailBtn', table: '#answerIn',
    rollcall: '#startBtn', chain: '#startBtn' };
  const e = document.querySelector(SEL[game]);
  if (!e) return false;
  const b = e.getBoundingClientRect();
  return b.height > 0 && b.top >= 0 && b.top < innerHeight - 24;
}

/* ---- the runs ------------------------------------------------------------ */
const games = ONLY ? ONLY.split(',') : GAMES;
const jobs = [];
for (const view of VIEWLIST) for (const tier of TIERS) for (const g of games) jobs.push([g, tier, view]);

const runs = [];
let next = 0;
async function worker(){
  while (next < jobs.length) {
    const [g, t, v] = jobs[next++];
    const r = await run(g, t, v);
    runs.push(r);
    const flag = r.playable ? [r.moved ? 'moved' : 'NOMOVE', r.resumed ? 'resumed' : 'NORESUME', r.finished ? 'end' : 'NOEND', r.shareText ? 'text' : 'NOTEXT'].join(' ') : 'walled';
    console.log('  ' + v + ' ' + t.padEnd(5) + ' ' + g.padEnd(12) + ' ' + flag + (r.errors ? ' ERR' + r.errors : '') + (r.notes.length ? '  (' + r.notes.join('; ') + ')' : ''));
  }
}
console.log('Playthroughs: ' + jobs.length + ' runs');
await Promise.all(Array.from({ length: JOBS }, worker));
runs.sort((a, b) => a.view - b.view || a.tier.localeCompare(b.tier) || a.game.localeCompare(b.game));
if (OUT) fs.writeFileSync(path.join(OUT, 'runs.json'), JSON.stringify(runs, null, 1));

const T = table(runs);
let before = null;
if (BEFORE) before = table(JSON.parse(fs.readFileSync(BEFORE, 'utf8')));
console.log('\n' + markdown(before, T));

if (!RECORD) {
  R.section('What every tier must get');
  for (const r of runs) {
    const id = r.game + ' [' + r.tier + ', ' + r.view + ']';
    const shouldOpen = r.tier !== 'guest' || FREE.includes(r.game);
    R.ok(r.playable === shouldOpen, id + (shouldOpen ? ' opens' : ' is walled for a guest'), r.notes.join('; '));
    if (!shouldOpen) continue;
    R.ok(r.gateTaps <= 1, id + ' at most one tap before the first move', 'taps ' + r.gateTaps);
    if (r.view === 375) R.ok(r.boardOnScreen, id + ' board is on the first screen');
    R.ok(r.moved, id + ' first move spends the play', r.notes.join('; '));
    R.ok(r.firstMoveEvent, id + ' sends arcade_first_move');
    R.ok(r.resumed, id + ' reload resumes the game', r.notes.join('; '));
    R.ok(r.finished, id + ' reaches the end screen', r.notes.join('; '));
    if (r.finished) {
      R.ok(r.completedEvent, id + ' sends arcade_game_completed exactly once', r.completedKind);
      R.ok(r.shareText, id + ' Share sends text first');
      R.ok(r.shareEvent, id + ' sends arcade_share (text)');
    }
    R.ok(!r.nudgeOverSheet, id + ' no sound note over the result card');
    R.ok(r.errors === 0, id + ' no page errors', r.notes.join('; '));
  }
}

/* ---- a run with a score ------------------------------------------------ */
if (!RECORD && !ONLY) {
  R.section('A finish with a score is counted once');
  for (const g of Object.keys(SCORE)) {
    const r = await run(g, 'card', 375, { score: true });
    R.ok(r.scored, g + ' made a right move', r.notes.join('; '));
    R.ok(r.finished, g + ' reached the end screen', r.notes.join('; '));
    R.ok(r.completedKind === 'submitted', g + ' sends arcade_game_completed once, from board.js (submitted)', r.completedKind || 'none');
    R.ok(r.errors === 0, g + ' no page errors', r.notes.join('; '));
  }
}

/* ---- the sound note waits for the sheet --------------------------------- */
if (!RECORD && !ONLY) {
  R.section('The sound note waits until the result sheet closes');
  const { ctx, p } = await page(browser, base, { tier: 'card' });
  await p.goto(base + '/arcade/crossword/', { waitUntil: 'load' }); await sleep(1800);
  await FIRST.crossword(p); await sleep(600);
  await FINISH.crossword(p);
  await until(p, () => ended(p), () => sleep(400), 20); await sleep(1500);
  const over = await p.evaluate(() => !!document.getElementById('rtgSoundNudge'));
  await p.evaluate(() => document.getElementById('scrim').classList.add('hidden')); await sleep(400);
  const after = await p.evaluate(() => ({ on: !!document.getElementById('rtgSoundNudge'), seen: localStorage.getItem('runthegrid_sound_nudged') }));
  R.ok(!over, 'a first win does not put the note over the result card');
  R.ok(after.on && after.seen === '1', 'it shows once the sheet closes, and only then is marked seen', JSON.stringify(after));
  await ctx.close();
}

/* ---- the two events a playthrough cannot reach ---------------------------- */
if (!RECORD && !ONLY) {
  R.section('arcade_abandon and arcade_return');
  {
    const { ctx, p } = await page(browser, base, { tier: 'free' });
    await p.goto(base + '/arcade/guess/', { waitUntil: 'load' }); await sleep(1500);
    await clickIf(p, '#rtgpgGo'); await sleep(500);
    await FIRST.guess(p); await sleep(800);
    await p.focus('#q').catch(() => {}); await p.keyboard.type('ab');
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
    const ab = (await events(p)).filter(e => e.ev === 'arcade_abandon');
    R.ok(ab.length === 1, 'leaving a game in progress sends arcade_abandon once', JSON.stringify(ab));
    R.ok(ab[0] && ab[0].p.transport_type === 'beacon' && ab[0].p.arcade_game === 'Guess the Player' && ab[0].p.inputs >= 3, 'it says which game, how far in, and goes as a beacon', JSON.stringify(ab[0] && ab[0].p));
    await ctx.close();
  }
  {
    const { ctx, p } = await page(browser, base, { tier: 'free' });
    await p.goto(base + '/arcade/guess/', { waitUntil: 'load' }); await sleep(1500);
    await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
    const ab = (await events(p)).filter(e => e.ev === 'arcade_abandon');
    R.ok(ab.length === 0, 'a page left before the first move is not an abandon');
    await ctx.close();
  }
  {
    const { ctx, p } = await page(browser, base, { tier: 'guest' });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); const d = new Date(Date.now() - 864e5); localStorage.setItem('rtg:visit:v1', JSON.stringify({ last: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') })); } });
    await p.goto(base + '/arcade/', { waitUntil: 'load' }); await sleep(1000);
    let ret = (await events(p)).filter(e => e.ev === 'arcade_return');
    R.ok(ret.length === 1 && ret[0].p.next_day === true && ret[0].p.gap_days === 1, 'the first page the next day sends arcade_return, next_day true', JSON.stringify(ret));
    await p.reload({ waitUntil: 'load' }); await sleep(800);
    ret = (await events(p)).filter(e => e.ev === 'arcade_return');
    R.ok(ret.length === 0, 'a second page the same day does not');
    await ctx.close();
  }
}

await browser.close(); srv.close();
if (!RECORD) {
  console.log('\n' + (R.fails() ? R.fails() + ' failed' : 'all passed'));
  process.exit(R.fails() ? 1 : 0);
}
