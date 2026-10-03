/* Phase 2 content rules, checked against what the games actually deal.
 *
 *   node scripts/check-content.mjs            everything
 *   node scripts/check-content.mjs --update   re-record the flag-off fingerprints
 *
 * Every Phase 2 content change sits behind a flag in arcade/flags.js, all of
 * them off by default. So this asks two different questions:
 *
 *   FLAGS ON (each game previewed with ?flags=...)
 *     ramp       Career Path, Alma Mater, Number Game, Odd One Out and High Low
 *                open on household names (fame 55 and up, fame.js) for the
 *                first three questions, and the run gets harder: the last ten
 *                are less famous on average than the first ten.
 *     decoys     Career Path's four players are one league, an overlapping or
 *                neighbouring era, and mostly one position family. Alma
 *                Mater's four schools are four different schools, none of
 *                them another school the player attended.
 *     broadcats  Sportegories: at least four Anchor categories every day for a
 *                year, and none of the retired "played for X and 3 other
 *                franchises" kind.
 *     densecw    the crossword serves the dense mini (its own validator is
 *                scripts/check-crossword-mini.mjs).
 *
 *   FLAGS OFF (the default every player gets)
 *     The deal is exactly what it was before Phase 2. That is a fingerprint of
 *     each game's daily deal on a pinned date, recorded in
 *     scripts/content.json the way check-cachebust.mjs records hashes. It was
 *     recorded against the commit before Phase 2 (15bd8d78), so a fingerprint
 *     that moves means the default game changed: either a flag is leaking or
 *     the data moved, and both want a look before --update.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { serve, launch, page, reporter, ROOT } from './lib/arcade-harness.mjs';

const UPDATE = process.argv.includes('--update');
const REC = path.join(ROOT, 'scripts/content.json');
const rec = (() => { try { return JSON.parse(readFileSync(REC, 'utf8')); } catch (e) { return {}; } })();
const next = {};
const R = reporter();
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- Sportegories, in node --------------------------------------------- */
R.section('Sportegories daily board');
function sportegories(flagOn) {
  const box = { console }; box.self = box; box.window = box; box.globalThis = box; createContext(box);
  box.RTGFlags = { on: (n) => n === 'broadcats' && flagOn };
  for (const f of ['arcade/sportegories-data.js', 'arcade/sportegories.js']) runInContext(readFileSync(path.join(ROOT, f), 'utf8'), box, { filename: f });
  const M = box.RTG_SPORTEGORIES; if (M.data) M.data(); return M;
}
{
  const off = sportegories(false), on = sportegories(true);
  const RETIRED = /\b\d\+ (teams|franchises)\b|\bother franchises?\b|exactly two franchises/i;
  const d0 = Date.UTC(2026, 6, 22);
  let minAnchors = 99, retired = 0, differ = 0, offBlob = '';
  for (let i = 0; i < 365; i++) {
    const d = new Date(d0 + i * 864e5).toISOString().slice(0, 10);
    const a = off.daily(d), b = on.daily(d);
    offBlob += d + a.letter + JSON.stringify(a.cats.map(c => c.label)) + '\n';
    minAnchors = Math.min(minAnchors, b.cats.filter(c => c.tier === 0).length);
    retired += b.cats.filter(c => RETIRED.test(c.label)).length;
    if (JSON.stringify(a.cats) !== JSON.stringify(b.cats)) differ++;
  }
  R.ok(minAnchors >= 4, `flag on: every day of a year has at least four Anchor categories (fewest: ${minAnchors})`);
  R.ok(retired === 0, `flag on: no retired "X other franchises" category is served (${retired})`);
  R.ok(differ > 0, `the flag changes the board (${differ} of 365 days differ)`);
  next.sportegories = sha(offBlob);
  R.ok(UPDATE || rec.sportegories === next.sportegories, 'flag off: the year of boards is the recorded one', `recorded ${rec.sportegories}, now ${next.sportegories}`);
}

/* ---- transfers: one school per e.col, every school in e.cols ------------- */
R.section('colleges a transfer attended');
{
  const box = { console }; box.self = box; box.window = box; box.globalThis = box; createContext(box);
  for (const f of ['arcade/match/entities.js', 'arcade/former.js', 'arcade/stars.js', 'arcade/awards.js', 'arcade/supplement.js',
                   'arcade/primary.js', 'arcade/franchise.js', 'arcade/data.js']) {
    runInContext(readFileSync(path.join(ROOT, f), 'utf8'), box, { filename: f });
  }
  const ENT = box.GRID_ENTITIES || [];
  const joined = ENT.filter(e => typeof e.col === 'string' && e.col.indexOf(';') >= 0);
  R.ok(ENT.length > 1000 && !joined.length, `no college is one string of several schools (${joined.length} of ${ENT.length})`, joined.slice(0, 3).map(e => e.name + ': ' + e.col).join(' | '));
  const many = ENT.filter(e => e.cols && e.cols.length > 1);
  R.ok(many.length > 0 && many.every(e => e.cols[0] === e.col), `a transfer keeps every school, the last one first (${many.length} players)`);
}

/* ---- the run games, in a browser on a pinned day ------------------------ */
const TIME = new Date('2026-10-02T12:00:00');
const RUNS = ['career', 'almamater', 'table', 'oddone', 'highlow'];
const { srv, base } = await serve();
const browser = await launch();
async function deal(game, flags, n = 30) {
  const { ctx, p } = await page(browser, base, { tier: 'card', mobile: false, time: TIME });
  await p.goto(base + '/arcade/' + game + '/?flags=' + flags, { waitUntil: 'load' });
  await sleep(2500);
  const out = await p.evaluate((n) => {
    if (!window.__rtgDeal) return null;
    const F = window.RTGFame;
    const deal = window.__rtgDeal(n) || [];
    return deal.map(r => {
      const t = r.target || r;
      const fam = F ? F.of(t) : null;
      return {
        name: t.name, sport: t.sport, fame: fam, fam: F ? F.posFamily(t) : null, decade: t.decade || [],
        opts: (r.opts || []).filter(o => o && o.name !== t.name).map(o => ({ name: o.name, sport: o.sport, fam: F.posFamily(o), era: F.eraScore(t, o) })),
        col: r.col || null, schools: r.schools || null, cols: (r.target && r.target.cols) || null, extra: r.extra || null
      };
    });
  }, n);
  const errs = p.errs.slice();
  await ctx.close();
  return { deal: out, errs };
}

const CUT = 55; // fame.js household
for (const g of RUNS) {
  R.section(g);
  const on = await deal(g, 'ramp,decoys');
  R.ok(on.deal && on.deal.length >= 12, `flag on: a run is dealt (${on.deal ? on.deal.length : 0} questions)`, on.errs.join(' | '));
  if (!on.deal || !on.deal.length) continue;
  const first = on.deal.slice(0, 3);
  R.ok(first.every(r => r.fame >= CUT), 'flag on: the first three are household names',
    first.map(r => `${r.name} ${r.fame}`).join(', '));
  const avg = a => a.reduce((s, r) => s + r.fame, 0) / Math.max(1, a.length);
  const head = on.deal.slice(0, 10), tail = on.deal.slice(-10);
  R.ok(avg(head) > avg(tail), `flag on: it gets harder (fame ${avg(head).toFixed(0)} in the first ten, ${avg(tail).toFixed(0)} in the last ten)`);
  if (g === 'career') {
    const opts = on.deal.flatMap(r => r.opts.map(o => ({ o, r })));
    R.ok(opts.every(({ o, r }) => o.sport === r.sport), 'decoys: every option is from the same league');
    R.ok(opts.every(({ o }) => o.era >= 1), 'decoys: every option shares or neighbours the era',
      opts.filter(({ o }) => o.era < 1).slice(0, 3).map(({ o, r }) => `${r.name} vs ${o.name}`).join(', '));
    const known = opts.filter(({ o, r }) => o.fam && r.fam);
    const same = known.filter(({ o, r }) => o.fam === r.fam).length;
    R.ok(same >= 0.75 * known.length, `decoys: most options share the position family (${same} of ${known.length})`);
  }
  if (g === 'almamater') {
    const bad = on.deal.filter(r => !r.schools || new Set(r.schools.map(s => s.toLowerCase())).size !== r.schools.length || r.schools.indexOf(r.col) < 0);
    R.ok(!bad.length, 'decoys: four different schools, the right one among them', bad.slice(0, 2).map(r => r.name).join(', '));
  }
  // the default game: a fingerprint of the daily deal
  if (g !== 'highlow') {   // High Low deals at random by design; nothing to pin
    const off = await deal(g, '-ramp,-decoys,-broadcats,-densecw');
    const blob = (off.deal || []).map(r => r.name + '|' + (r.extra || r.col || '') + '|' + (r.schools || []).join(',') + '|' + r.opts.map(o => o.name).join(',')).join('\n');
    next[g] = sha(blob);
    R.ok(!!blob && (UPDATE || rec[g] === next[g]), 'flag off: the daily deal is the recorded one', `recorded ${rec[g]}, now ${next[g]}`);
  }
}

R.section('crossword');
for (const [flags, want] of [['densecw', 'mini-'], ['-densecw', 'gen-']]) {
  const { ctx, p } = await page(browser, base, { tier: 'card', mobile: true, time: TIME });
  await p.goto(base + '/arcade/crossword/?flags=' + flags, { waitUntil: 'load' });
  await sleep(1500);
  const n = await p.evaluate(() => document.querySelectorAll('#board .cell, #board [data-r]').length);
  R.ok(want === 'mini-' ? (n === 25 || n === 36) : n > 36, `flags=${flags}: the board is ${want === 'mini-' ? 'the dense mini' : 'the usual grid'} (${n} cells)`, p.errs.join(' | '));
  await ctx.close();
}

await browser.close(); srv.srv ? srv.srv.close() : srv.close && srv.close();
if (UPDATE) { writeFileSync(REC, JSON.stringify(next, null, 2) + '\n'); console.log('\nrecorded ' + REC); }
console.log(R.fails() ? `\n${R.fails()} problem(s)` : '\nall content rules hold');
process.exit(R.fails() ? 1 : 0);
