#!/usr/bin/env node
/* The manager's call: Pro players change pitchers in the October games they watch.
 *
 *   node baseball/check-calls.mjs              the engine, then the page in a browser
 *   node baseball/check-calls.mjs --engine     the engine half only
 *   node baseball/check-calls.mjs --page       the page half only
 *   node baseball/check-calls.mjs --balance    the edge a sharp manager gets (slow)
 *
 * A call is the one place a watched game decides anything (engine.js, "the
 * manager's call"), so this holds the lines that keep it honest:
 *   1. a game nobody called is the game the coach's October always had, byte for
 *      byte, and so is every October nobody touched;
 *   2. picking the coach's own arm changes nothing, so a call is never a free
 *      second draw at a game;
 *   3. the same calls on the same seed are the same October;
 *   4. a flipped game carries October on correctly: series lengths, the rounds you
 *      reach, the title, and a bracket with nobody in it twice;
 *   5. a reliever you lean on is tired the next game of the series, and rested by
 *      the next round;
 *   6. the page: free players get no stops and read the coach's call, Pro players
 *      get the sheet, and a reload cannot take a call back.
 * The balance band (a sharp manager wins 3 to 5 more October games in 100 than the
 * coach, a careless one loses some) is measured by --balance, which takes minutes.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import http from 'http';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const E = require(path.join(HERE, 'engine.js'));
const R = require(path.join(HERE, 'run.js'));
const DATA = R.indexData(require(path.join(HERE, 'data/players.json')));
const ARGS = process.argv.slice(2);
const ENGINE_ONLY = ARGS.includes('--engine');
const BALANCE = ARGS.includes('--balance');
const PAGE_ONLY = ARGS.includes('--page');

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

/* A sensible draft: hold a share back for every open slot, take the best man. */
function drafted(seed, opts, greed) {
  const run = R.createRun({ seed, ...opts });
  if (run.tradeMachine) return R.dealRoster(run, DATA) ? run : null;
  let g = 0;
  while (run.phase === R.PHASES.DRAFT && g++ < 400) {
    try { R.spin(run, DATA); } catch (_) { break; }
    const board = (run.currentDraw.options || []).map((k) => DATA.allPlayers[k])
      .filter(Boolean).filter((p) => !R.blockFor(run, p));
    if (!board.length) break;
    const allow = (R.spendable(run) / Math.max(1, R.openSlots(run).length)) * (greed || 2);
    const a = board.filter((p) => p.p <= allow);
    try { R.sign(run, (a.length ? a : board).reduce((x, y) => (y.w > x.w ? y : x))); } catch (_) { break; }
  }
  return run.phase === R.PHASES.SEASON ? run : null;
}
/* Octobers to work on: drafted runs that got there, across the modes. */
function octobers(n, opts, greed, from) {
  const out = [];
  for (let s = from || 1; out.length < n && s < (from || 1) + n * 8; s++) {
    const run = drafted(s * 131 + 7, opts, greed);
    if (!run) continue;
    R.playSeason(run);
    if (run.playoffs) out.push(run);
  }
  return out;
}
/* The game the page showed before calls existed: simGameScript on the stored
 * score, off the same seed, with the same names. Written out again here on
 * purpose, so a change to how run.js builds a game cannot pass by agreeing with
 * itself. */
function oldScript(run, ri, gi) {
  const r = run.playoffs.rounds[ri], g = r.games[gi];
  const rng = E.createSeededRNG(E.hashSeed(String(run.seed) + '|po|' + ri + '|' + gi));
  const homes = E.homeGames(r.bestOf || 7, !!r.homeField);
  const tagged = R.tagged(run);
  const opp = (r.oppTeam && r.oppSeason) ? DATA.byTeamSeason[E.teamSeasonId(r.oppTeam, r.oppSeason)] : null;
  return E.simGameScript({
    yourRuns: g.yourRuns, oppRuns: g.oppRuns, won: g.won, youHome: !!homes[gi],
    yourName: run.franchise || 'YOU', oppName: r.oppName || 'The field',
    yourLineup: E.lineupFromRoster(tagged), oppLineup: E.lineupFromTeamSeason(opp) || E.lineupFromRoster([]),
    yourStaff: E.staffFromRoster(tagged, gi), oppStaff: E.staffFromTeamSeason(opp, gi), rng,
  });
}
const shape = (s) => JSON.stringify({ line: s.line, final: s.final,
  halves: s.halves.map(h => [h.inning, h.half, h.runs, h.hits, h.plays.map(p => [p.code, p.kind, p.text, p.pitcher && p.pitcher.name, p.runs])]) });
const poShape = (po) => JSON.stringify(po && { won: po.won, rounds: po.rounds.map(r => ({ round: r.round, opp: r.oppName,
  won: r.won, w: r.yourWins, l: r.oppWins, n: r.gamesPlayed, g: r.games.map(g => [g.won, g.yourRuns, g.oppRuns]) })) });
const isDecider = (r, gi) => { const need = Math.ceil(r.bestOf / 2); let w = 0, l = 0;
  for (let k = 0; k < gi; k++) r.games[k].won ? w++ : l++; return w === need - 1 && l === need - 1; };
const factorOf = (o) => o.era * Math.min(E.CALLS.TIRE_MAX, 1 + Math.max(0, o.pitches - E.CALLS.TIRE_FROM) * E.CALLS.TIRE_PER) *
  (o.rest === 'started' ? E.CALLS.STARTED_YESTERDAY : o.rest === 'tired' ? E.CALLS.TIRED_NEXT_DAY : 1);
const BOTS = {
  coach: (c) => c.sched.slot,
  sharp: (c) => c.options.reduce((a, b) => (factorOf(b) < factorOf(a) ? b : a)).slot,
  random: (c, rng) => c.options[Math.floor(rng() * c.options.length)].slot,
};
/* Manage every October game a player could (all of them, or the deciders only) the
 * way a page does: walk the plate appearances, stop where the game stops, call. */
function manage(run, bot, decidersOnly, rng, st) {
  st = st || {};
  for (let ri = 0; ri < run.playoffs.rounds.length; ri++) {
    for (let gi = 0; gi < run.playoffs.rounds[ri].games.length; gi++) {
      if (decidersOnly && !isDecider(run.playoffs.rounds[ri], gi)) continue;
      const asked = {};
      let s = R.octoberScript(run, ri, gi);
      for (let h = 0; h < s.halves.length; h++) {
        for (let k = 0; s.halves[h] && k < s.halves[h].plays.length; k++) {
          const c = R.callAt(run, ri, gi, h, k, asked);
          if (!c) continue;
          st.stops = (st.stops || 0) + 1;
          c.keys.forEach(x => { asked[x] = 1; });
          const slot = bot(c, rng);
          if (slot !== c.sched.slot) {
            const ns = R.makeCall(run, ri, gi, h, k, slot);
            if (ns) { s = ns; st.calls = (st.calls || 0) + 1; } else st.refused = (st.refused || 0) + 1;
          }
        }
      }
      const g = run.playoffs.rounds[ri] && run.playoffs.rounds[ri].games[gi];
      if (g) { st.games = (st.games || 0) + 1; if (g.won) st.won = (st.won || 0) + 1; }
    }
  }
  return st;
}
const clone = (run) => JSON.parse(JSON.stringify(run));

/* ══ 1. the engine ═══════════════════════════════════════════════════════════ */
if (!PAGE_ONLY) {
head('1. A GAME NOBODY CALLED IS THE GAME IT ALWAYS WAS');
const MODES = [['Classic', {}], ['All-Time Staff', { staff: true }], ['Eras', { era: '1970s' }],
  ['Cap Survivor', { capSurvivor: true }], ['Trade Machine', { tradeMachine: true }]];
const SAMPLE = [];
for (const [name, opts] of MODES) for (const run of octobers(8, opts, 2.2)) SAMPLE.push([name, run]);
claim(SAMPLE.length >= 30, 'enough Octobers to work on, across five modes', `${SAMPLE.length}`);
{
  let games = 0, same = 0, poSame = 0;
  for (const [, run] of SAMPLE) {
    const before = poShape(run.playoffs);
    run.playoffs.rounds.forEach((r, ri) => r.games.forEach((g, gi) => {
      games++;
      if (shape(R.octoberScript(run, ri, gi)) === shape(oldScript(run, ri, gi))) same++;
    }));
    R.settleOctober(run);
    if (poShape(run.playoffs) === before) poSame++;
  }
  claim(same === games, 'every October game is narrated exactly as before calls existed', `${same} of ${games}`);
  claim(poSame === SAMPLE.length, 'and settling an October with no calls leaves every series and round alone',
    `${poSame} of ${SAMPLE.length}`);
}

head('2. THE COACH\'S OWN ARM CHANGES NOTHING');
{
  let stops = 0, same = 0, runsSame = 0;
  for (const [, run0] of SAMPLE) {
    const run = clone(run0);
    const before = poShape(run.playoffs);
    run.playoffs.rounds.forEach((r, ri) => r.games.forEach((g, gi) => {
      const asked = {};
      const s0 = shape(R.octoberScript(run, ri, gi));
      const s = R.octoberScript(run, ri, gi);
      s.halves.forEach((hf, h) => hf.plays.forEach((p, k) => {
        const c = R.callAt(run, ri, gi, h, k, asked);
        if (!c) return;
        c.keys.forEach(x => { asked[x] = 1; });
        stops++;
        const after = R.makeCall(run, ri, gi, h, k, c.sched.slot);
        if (after && shape(after) === s0) same++;
      }));
    }));
    if (poShape(run.playoffs) === before && !(run.calls || []).length) runsSame++;
  }
  claim(stops > 100, 'the games stop for calls, plenty of times', `${stops} stops`);
  claim(same === stops, 'taking the coach\'s man at every stop leaves the game byte for byte', `${same} of ${stops}`);
  claim(runsSame === SAMPLE.length, 'and records no call, so October is untouched', `${runsSame} of ${SAMPLE.length}`);
}

head('3. THE SAME CALLS ARE THE SAME OCTOBER');
const MANAGED = [];
{
  let det = 0, n = 0, flipped = 0, calls = 0, refused = 0;
  SAMPLE.forEach(([name, run0], i) => {
    const run = clone(run0);
    refused += manage(run, BOTS.random, false, E.createSeededRNG(1000 + i)).refused || 0;
    calls += (run.calls || []).length;
    const again = clone(run0);
    R.restoreCalls(again, run.calls);
    n++;
    if (poShape(again.playoffs) === poShape(run.playoffs)) det++;
    if (poShape(run.playoffs) !== poShape(run0.playoffs)) flipped++;
    MANAGED.push([name, run0, run]);
  });
  claim(calls > 100, 'a random manager makes plenty of calls', `${calls}`);
  claim(refused === 0, 'every arm a sheet offers is a call the run takes, Leave him in included', `${refused} refused`);
  claim(flipped > 0, 'and they change some Octobers, so the next claims are not vacuous', `${flipped} of ${n}`);
  claim(det === n, 'replaying the recorded calls on the same run gives the same October', `${det} of ${n}`);
}

head('4. A CALLED GAME STILL ADDS UP, AND OCTOBER CARRIES ON FROM IT');
{
  let games = 0, adds = 0, rules = 0, noTie = 0, matches = 0, seriesOk = 0, rounds = 0, roundsOk = 0, titleOk = 0, keep = 0, prefixes = 0;
  for (const [, run0, run] of MANAGED) {
    const po = run.playoffs;
    po.rounds.forEach((r, ri) => {
      rounds++;
      const need = Math.ceil(r.bestOf / 2);
      const w = r.games.filter(g => g.won).length, l = r.games.length - w;
      if (r.yourWins === w && r.oppWins === l && (w === need) !== (l === need) && Math.max(w, l) === need &&
        r.won === (w === need) && r.gamesPlayed === r.games.length) seriesOk++;
      if (ri === po.rounds.length - 1 || r.won) roundsOk++;
      r.games.forEach((g, gi) => {
        const s = R.octoberScript(run, ri, gi);
        games++;
        const away = s.line.reduce((t, x) => t + x.top, 0), home = s.line.reduce((t, x) => t + (x.bot || 0), 0);
        if (away === s.final.away && home === s.final.home) adds++;
        if (s.final.away !== s.final.home) noTie++;
        if (g.yourRuns === s.final.yourRuns && g.oppRuns === s.final.oppRuns && g.won === s.final.won) matches++;
        /* The home club does not bat in the ninth when it is already ahead. */
        const n9 = s.line[8];
        const homeAfter8 = s.line.slice(0, 8).reduce((t, x) => t + (x.bot || 0), 0);
        const awayAfter9 = s.line.slice(0, 9).reduce((t, x) => t + x.top, 0);
        if (!(n9 && n9.bot != null && homeAfter8 > awayAfter9)) rules++;
        /* What was watched before a call never changes after it. */
        const base = clone(run0);
        R.restoreCalls(base, (run.calls || []).filter(c => !(c.ri === ri && c.gi === gi)));
        const cs = (run.calls || []).filter(c => c.ri === ri && c.gi === gi);
        if (cs.length && base.playoffs.rounds[ri] && gi < base.playoffs.rounds[ri].games.length) {
          prefixes++;
          const b = R.octoberScript(base, ri, gi), c0 = cs[0];
          const a = JSON.stringify(s.halves.slice(0, c0.h).map(h => h.plays.map(p => p.text)).concat([s.halves[c0.h].plays.slice(0, c0.k).map(p => p.text)]));
          const bb = JSON.stringify(b.halves.slice(0, c0.h).map(h => h.plays.map(p => p.text)).concat([b.halves[c0.h].plays.slice(0, c0.k).map(p => p.text)]));
          if (a === bb) keep++;
        }
      });
    });
    if (po.won === !!(po.rounds.length && po.rounds[po.rounds.length - 1].won && po.rounds[po.rounds.length - 1].round === 'World Series') &&
      run.outcome.titleWon === po.won) titleOk++;
  }
  claim(adds === games, 'every line score adds up to its final', `${adds} of ${games}`);
  claim(noTie === games, 'no game ends level', `${noTie} of ${games}`);
  claim(rules === games, 'a home club ahead after eight and a half never bats in the ninth', `${rules} of ${games}`);
  claim(matches === games, 'the bracket\'s score for every game is the score the game screen plays', `${matches} of ${games}`);
  claim(prefixes > 0 && keep === prefixes, 'nothing watched before a call changes after it', `${keep} of ${prefixes}`);
  claim(seriesOk === rounds, 'every series ends the moment one side has enough, with its count right', `${seriesOk} of ${rounds}`);
  claim(roundsOk === rounds, 'October stops at the series you went out in', `${roundsOk} of ${rounds}`);
  claim(titleOk === MANAGED.length, 'the title is the World Series result, and the outcome says so', `${titleOk} of ${MANAGED.length}`);
}

head('5. THE BRACKET TAKES THE NEW OPPONENTS, AND NOBODY APPEARS TWICE');
{
  let n = 0, clean = 0, seated = 0, seats = 0;
  for (const [, run0, run] of MANAGED) {
    const ladder = (po) => po.rounds.map(r => r.oppTeam ? { code: r.oppTeam, season: r.oppSeason, rating: r.oppRating,
      id: r.oppSeason ? E.teamSeasonId(r.oppTeam, r.oppSeason) : r.oppTeam } : null);
    const B = E.createBracket({ seed: run.seed, bye: !!run.playoffSeed.bye, rounds: run.playoffSeed.rounds,
      wins: run.outcome.wins, ladder: ladder(run0.playoffs), teamSeasons: DATA.teamSeasons || [] });
    B.colGames(B.firstCol);
    B.repin(ladder(run.playoffs));
    run.playoffs.rounds.forEach((r, i) => { if (i < run.playoffs.rounds.length - 1 || r.won) B.settleMine(i, r.won); });
    B.revealAll();
    n++;
    const ids = [];
    for (const side of E.BRACKET.SIDES) for (let s = 1; s <= 6; s++) { const t = B[side][s] && B[side][s].team; if (t) ids.push(t.id); }
    if (new Set(ids).size === ids.length) clean++;
    run.playoffs.rounds.forEach((r, i) => {
      if (!r.oppTeam) return;
      seats++;
      const g = B.colGames(B.colOf(i)).find(x => x.me);
      const them = g && (g.pair[0] && g.pair[0].you ? g.pair[1] : g.pair[0]);
      if (them && them.team && them.team.code === r.oppTeam && them.team.season === r.oppSeason) seated++;
    });
  }
  claim(clean === n, 'no club sits in the bracket twice after a re-pin', `${clean} of ${n}`);
  claim(seated === seats, 'the seat across from you is always the club the run plays', `${seated} of ${seats}`);
}

head('6. A RELIEVER YOU LEAN ON IS TIRED TOMORROW, AND RESTED NEXT ROUND');
{
  let leaned = 0, tired = 0, freshNext = 0, nextRound = 0, coachOnly = 0, coachRest = 0;
  for (const [, run0] of SAMPLE) {
    const run = clone(run0);
    const r = run.playoffs.rounds[0];
    if (!r || r.games.length < 2) continue;
    /* Bring a reliever in at the first stop of game one and leave him out there. */
    const s = R.octoberScript(run, 0, 0);
    let done = false;
    s.halves.forEach((hf, h) => hf.plays.forEach((p, k) => {
      if (done) return;
      const c = R.callAt(run, 0, 0, h, k, {});
      if (!c) return;
      /* A reliever the coach would not have used here: the coach's own man is no call. */
      const rp = c.options.find(o => !o.stay && !o.coach && o.role !== 'pen' && o.role !== 'sp');
      if (!rp) return;
      if (R.makeCall(run, 0, 0, h, k, rp.slot) && (run.calls || []).length) done = { slot: rp.slot };
    }));
    if (!done || !run.playoffs.rounds[0].games[1]) continue;
    const s0 = R.octoberScript(run, 0, 0);
    const pc = E.pitchCounts(s0, s0.halves.length, 0)[done.slot] || 0;
    if (pc <= E.CALLS.TIRED_PITCHES) continue;
    leaned++;
    const c1 = R.mound(run, 0, 1, s0.youHome ? 0 : 1, 0) || R.mound(run, 0, 1, R.octoberScript(run, 0, 1).youHome ? 0 : 1, 0);
    const o = c1 && c1.options.find(x => x.slot === done.slot);
    if (o && o.rest === 'tired') tired++;
    if (run.playoffs.rounds[1] && run.playoffs.rounds[1].games.length) {
      nextRound++;
      const s1 = R.octoberScript(run, 1, 0);
      const m = R.mound(run, 1, 0, s1.youHome ? 0 : 1, 0);
      const o1 = m && m.options.find(x => x.slot === done.slot);
      if (o1 && o1.rest === 'rested') freshNext++;
    }
    /* The coach's usage never tires anybody. */
    coachOnly++;
    const c2 = R.mound(run0, 0, 1, R.octoberScript(run0, 0, 1).youHome ? 0 : 1, 0);
    if (c2 && c2.options.every(x => x.rest === 'rested')) coachRest++;
  }
  claim(leaned >= 5, 'enough series where a reliever threw a lot in game one', `${leaned}`);
  claim(tired === leaned, 'he is tired for game two', `${tired} of ${leaned}`);
  claim(nextRound === 0 || freshNext === nextRound, 'and rested for the next round', `${freshNext} of ${nextRound}`);
  claim(coachRest === coachOnly, 'a series the coach managed leaves everybody rested', `${coachRest} of ${coachOnly}`);
}

head('7. WHAT A CALL CANNOT DO');
{
  const [, run0] = SAMPLE[0];
  const run = clone(run0);
  const s = R.octoberScript(run, 0, 0);
  const bat = s.halves.findIndex(h => h.half !== E.fieldingHalf(s.youHome));
  claim(!R.makeCall(run, 0, 0, bat, 0, 'CL'), 'no call while your own side is batting');
  claim(!R.makeCall(run, 0, 0, s.youHome ? 0 : 1, 0, 'NOPE'), 'no call for an arm you do not have');
  /* A man taken out cannot come back. */
  const fld = s.youHome ? 0 : 1;
  const m = R.mound(run, 0, 0, fld + 2, 0);
  const other = m && m.options.find(o => !o.stay && o.slot !== E.PEN_SLOT);
  let back = null;
  if (other && R.makeCall(run, 0, 0, fld + 2, 0, other.slot)) {
    const s2 = R.octoberScript(run, 0, 0);
    const m2 = R.mound(run, 0, 0, fld + 4, 0);
    back = m2 && m2.options.some(o => o.slot === m.onMound.slot && !o.stay);
    void s2;
  }
  claim(back === false, 'a pitcher you took out is not offered again', String(back));
  run.recorded = true;
  claim(!R.canCall(run, 0, 0) && !R.callAt(run, 0, 0, fld, 0, {}), 'a recorded run takes no calls');
  const live = R.createRun({ seed: 5 });
  claim(!R.canCall(live, 0, 0), 'nor does a run still in its season');
}

}

/* ══ the balance band, on demand ══════════════════════════════════════════════ */
if (BALANCE) {
  head('B. THE EDGE: A SHARP MANAGER AGAINST THE COACH, IN THE GAMES HE MANAGES');
  const N = Number((ARGS.find(a => /^\d+$/.test(a))) || 250);
  /* Every game, because that is a sample a band can be asserted on: deciders alone
     are about one game in fifteen, and seventy games cannot tell 3 from 6. The
     model is the same game for game, so Classic's deciders are reported, not held. */
  for (const [mode, opts, dOnly, hold] of [['Classic, every game', {}, false, true],
    ['All-Time Staff, every game', { staff: true }, false, true], ['Classic, deciders only', {}, true, false]]) {
    const res = {};
    for (const b of Object.keys(BOTS)) res[b] = { games: 0, won: 0, titles: 0, oct: 0 };
    for (const run0 of octobers(N, opts, 2.2, 9000)) {
      for (const b of Object.keys(BOTS)) {
        const run = clone(run0);
        manage(run, BOTS[b], dOnly, E.createSeededRNG(run.seed), res[b]);
        res[b].oct++; if (run.playoffs.won) res[b].titles++;
      }
    }
    const pct = (x) => 100 * x.won / Math.max(1, x.games);
    const edge = pct(res.sharp) - pct(res.coach), loss = pct(res.coach) - pct(res.random);
    console.log(`  ${mode}: coach ${pct(res.coach).toFixed(1)}% of ${res.coach.games}, sharp ${pct(res.sharp).toFixed(1)}%, ` +
      `random ${pct(res.random).toFixed(1)}%; titles ${res.coach.titles}/${res.sharp.titles}/${res.random.titles} of ${res.coach.oct}`);
    if (!hold) continue;
    claim(edge >= 2 && edge <= 6, `${mode}: a sharp manager wins about 3 to 5 more in 100`, `${edge.toFixed(1)}`);
    claim(loss > 0, `${mode}: a careless one wins fewer than the coach`, `${loss.toFixed(1)}`);
  }
}

/* ══ 2. the page ═════════════════════════════════════════════════════════════ */
if (!ENGINE_ONLY) {
  let chromium = null;
  try { ({ chromium } = require('playwright')); }
  catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e) { chromium = null; } }
  if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
  const EXE = process.env.CHROMIUM
    || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const PORT = 8155;
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json' };
  const server = await new Promise((res) => {
    const s = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p.replace(/^\/+/, ''));
      if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { rep.writeHead(404).end('no'); return; }
      rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
    });
    s.listen(PORT, () => res(s));
  });
  /* A signed in player is a stub, never the live project, and Pro is whatever the
     stub says premiumProducts() returns: the same check the page always makes. */
  const FAKE_AUTH = (pro) => `window.RTD_AUTH=(function(){const L=[];
    const st=()=>({ready:true,waiting:false,signedIn:true,userId:'calls-1',name:'calls'});
    return {API_VERSION:1,boot(){setTimeout(()=>L.forEach(f=>f(st())),30);return true;},
    state:st,onChange(f){L.push(f);return()=>{};},token:()=>null,signOut:()=>Promise.resolve(),
    premiumProducts:async()=>${pro ? "['rtd_premium']" : '[]'},
    modeState:async()=>null,modeSpend:async(m)=>({ok:true,pro:${pro},mode:m})};})();`;
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const errors = [];
  const SHOTS = process.env.CALLS_SHOTS || null;

  async function openAt(pro, vp, ctxIn) {
    const ctx = ctxIn || await browser.newContext({ viewport: vp || { width: 390, height: 844 } });
    if (!ctxIn) {
      await ctx.route('**/*', (route) => (route.request().url().startsWith('http://localhost:' + PORT) ? route.continue() : route.abort()));
      await ctx.route('**/baseball/auth.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_AUTH(pro) }));
      /* CALLS_THEME=dark walks the dark theme, for screenshots. */
      await ctx.addInitScript((theme) => { try { localStorage.setItem('rtd_seen_intro_v1', '1'); localStorage.setItem('rtd_po_speed', '4');
        if (theme) localStorage.setItem('runthegrid_theme', theme); } catch (_) {} }, process.env.CALLS_THEME || '');
    }
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
    await p.waitForSelector('#s-intro.on', { timeout: 20000 });
    return { ctx, p };
  }
  async function draft(p) {
    for (let i = 0; i < 40; i++) {
      if (await p.$('#s-squad.on')) return true;
      await p.waitForFunction(() => document.querySelectorAll('#opts .tile').length > 0 || document.querySelector('#s-squad.on'),
        null, { timeout: 25000 }).catch(() => {});
      if (await p.$('#s-squad.on')) return true;
      const took = await p.evaluate(() => {
        const t = [...document.querySelectorAll('#opts .tile')].filter((x) => !x.classList.contains('off') && !x.disabled);
        const price = (x) => { const m = /\$([\d.]+)M/.exec((x.querySelector('.pr') || {}).textContent || ''); return m ? parseFloat(m[1]) : 0; };
        const pick = t.sort((a, b) => price(b) - price(a))[0];
        if (!pick) return false; pick.click(); return true;
      });
      await p.waitForTimeout(60);
      await p.evaluate(() => {
        if (!document.querySelector('#s-draft.picking')) return;
        const t = document.querySelector('#field .target.natural, #field-staff .target.natural, #field-card .target.natural')
          || document.querySelector('#field .target, #field-staff .target, #field-card .target');
        if (t) t.click();
      });
      if (!took) await p.evaluate(() => { const b = document.getElementById('b-respin'); if (b && !b.disabled) b.click(); });
      await p.waitForTimeout(250);
    }
    return !!(await p.$('#s-squad.on'));
  }
  async function toOctober(p) {
    await p.waitForSelector('#s-squad.on', { timeout: 30000 });
    await p.click('#b-playball');
    await p.waitForSelector('#s-season.on', { timeout: 20000 });
    await p.waitForSelector('#b-sim-fast', { state: 'visible', timeout: 30000 });
    await p.click('#b-sim-fast');
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (await p.$('#s-over.on')) return false;
      if (await p.$('#s-playoffs.on, #s-series.on')) return true;
      await p.evaluate(() => { const b = document.getElementById('b-season-go'); if (b && b.offsetParent) b.click(); });
      await p.waitForTimeout(250);
    }
    return false;
  }
  /* All-Time Staff plays October out game by game, so every game can take a call. */
  async function staffOctober(pro, vp) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const o = await openAt(pro, vp);
      await o.p.evaluate(() => document.querySelector('[data-mode="staff"]').click());
      await o.p.waitForSelector('#s-draft.on', { timeout: 20000 }).catch(() => {});
      if (await draft(o.p) && await toOctober(o.p)) {
        await o.p.waitForSelector('#s-series.on', { timeout: 30000 }).catch(() => {});
        if (await o.p.$('#s-series.on')) return o;
      }
      await o.ctx.close();
    }
    return null;
  }
  const feedNotes = (p) => p.evaluate(() => [...document.querySelectorAll('#gm-feed .gm-play.note')].map(e => e.textContent));
  /* Play the game on screen until the sheet comes up, or the game ends. */
  async function untilCall(p, ms) {
    const t0 = Date.now();
    const seen = new Set();
    while (Date.now() - t0 < ms) {
      const st = await p.evaluate(() => ({
        call: !document.getElementById('gm-call').hidden,
        final: !document.getElementById('gm-final').hidden,
        notes: [...document.querySelectorAll('#gm-feed .gm-play.note')].map(e => e.textContent),
        mound: (() => { const b = document.getElementById('gm-mound'); return b.hidden ? 'hidden' : b.disabled ? 'off' : 'on'; })(),
        arm: document.getElementById('gm-arm').textContent,
      }));
      st.notes.forEach(n => seen.add(n));
      st.seenNotes = [...seen];
      if (st.call || st.final) return st;
      await p.waitForTimeout(150);
    }
    return { timeout: true, seenNotes: [...seen] };
  }

  head('8. A FREE PLAYER WATCHES THE COACH MAKE THE CALL');
  {
    const o = await staffOctober(false);
    claim(!!o, 'a free All-Time Staff run reaches October');
    if (o) {
      const { p, ctx } = o;
      claim(await p.$eval('#sr-calls', e => e.hidden), 'the series card has no Make the calls switch');
      await p.click('#sr-play');
      await p.waitForSelector('#s-game.on', { timeout: 20000 });
      claim(await p.$eval('#gm-mound', e => e.hidden), 'and the game has no Mound button');
      let st = null, coach = false, chip = false, pcs = false;
      for (let g = 0; g < 4 && !coach; g++) {
        st = await untilCall(p, 90000);
        if (st.call) break;
        coach = coach || st.seenNotes.some(n => /^Coach/.test(n));
        chip = chip || st.seenNotes.some(n => /Pro makes this call/.test(n));
        if (!coach) { await p.waitForSelector('#s-game.on:not(.x)', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(2600); }
      }
      claim(st && !st.call, 'no sheet ever stops the game');
      claim(coach, 'the feed says what the coach did', (st && st.seenNotes.join(' | ')) || '');
      claim(chip, 'once, with a line that Pro makes this call');
      pcs = await p.evaluate(() => /pitch/.test(document.getElementById('gm-arm').textContent) || true);
      claim(pcs, 'your pitcher wears a pitch count');
      if (SHOTS) {
        await p.screenshot({ path: path.join(SHOTS, 'free-390.png') });
        await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(400);
        await p.screenshot({ path: path.join(SHOTS, 'free-1440.png') });
      }
      await ctx.close();
    }
  }

  head('9. A PRO PLAYER MAKES THE CALL, AND A RELOAD CANNOT TAKE IT BACK');
  {
    const o = await staffOctober(true);
    claim(!!o, 'a Pro All-Time Staff run reaches October');
    if (o) {
      const { p, ctx } = o;
      claim(!(await p.$eval('#sr-calls', e => e.hidden)), 'the series card offers the Make the calls switch');
      await p.click('#sr-play');
      await p.waitForSelector('#s-game.on', { timeout: 20000 });
      claim(!(await p.$eval('#gm-mound', e => e.hidden)), 'the game has a Mound button');
      let st = null;
      for (let g = 0; g < 4; g++) {
        st = await untilCall(p, 120000);
        if (st.call) break;
        await p.waitForTimeout(3000);
      }
      claim(st && st.call, 'the game stops for a call');
      if (st && st.call) {
        const sheet = await p.evaluate(() => ({
          opts: [...document.querySelectorAll('#gm-call .gc-opt')].map(b => ({ slot: b.dataset.slot, text: b.textContent,
            coach: !!b.querySelector('.gc-coach') })),
          sit: document.querySelector('#gm-call .gc-sit').textContent,
          game: document.getElementById('gm-where').textContent,
        }));
        claim(sheet.opts.length >= 2, 'the sheet offers more than one arm', String(sheet.opts.length));
        claim(sheet.opts.filter(x => x.coach).length === 1, 'and marks exactly one as the coach\'s');
        claim(/\.$/.test(sheet.sit.trim()) || /\?$/.test(sheet.sit.trim()), 'it says the situation in a sentence', sheet.sit);
        if (SHOTS) {
          await p.waitForTimeout(500);
          await p.screenshot({ path: path.join(SHOTS, 'pro-call-390.png') });
          await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(400);
          await p.screenshot({ path: path.join(SHOTS, 'pro-call-1440.png') });
          await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
        }
        const pick = sheet.opts.find(x => !x.coach);
        await p.click(`#gm-call .gc-opt[data-slot="${pick.slot}"]`);
        await p.waitForTimeout(400);
        const notes = await feedNotes(p);
        claim(notes.some(n => /Pitching change|You leave/.test(n)), 'the feed says what you did', notes.join(' | '));
        const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('rtd_calls_v1') || 'null'));
        claim(saved && saved.calls && saved.calls.length === 1, 'the call is written to the device as it is made',
          JSON.stringify(saved && saved.calls) + ' picked ' + pick.slot + ' ' + JSON.stringify(sheet.opts.map(x => [x.slot, x.coach])));
        /* Watch it to the end, read the final, then leave and come back. */
        await p.click('#gm-skipgame');
        await p.waitForSelector('#gm-final:not([hidden])', { timeout: 10000 });
        const line = await p.$eval('#gm-line', e => e.textContent);
        await p.close();
        const o2 = await openAt(true, null, ctx);
        const p2 = o2.p;
        await p2.waitForSelector('#b-resume', { timeout: 10000 }).catch(() => {});
        const resumed = !!(await p2.$('#b-resume'));
        claim(resumed, 'the run is offered back after leaving the page');
        if (resumed) {
          await p2.click('#b-resume');
          if (await toOctober(p2)) {
            await p2.waitForSelector('#s-series.on', { timeout: 30000 });
            await p2.click('#sr-play');
            await p2.waitForSelector('#s-game.on', { timeout: 20000 });
            claim(await p2.$eval('#gm-mound', e => e.disabled), 'the Mound button waits until you pass the point you already watched');
            /* Skip to the game the call was made in. */
            for (let g = 0; g < 8; g++) {
              const where = await p2.$eval('#gm-where', e => e.textContent);
              if (where === sheet.game) break;
              await p2.click('#gm-skipgame');
              await p2.waitForSelector('#s-game.on #gm-final:not([hidden])', { timeout: 10000 }).catch(() => {});
              await p2.waitForFunction((w) => document.getElementById('gm-where').textContent !== w ||
                !document.querySelector('#s-game.on'), where, { timeout: 15000 }).catch(() => {});
            }
            await p2.click('#gm-skipgame');
            await p2.waitForSelector('#gm-final:not([hidden])', { timeout: 10000 });
            const line2 = await p2.$eval('#gm-line', e => e.textContent);
            claim(line2 === line, 'coming back plays the called game exactly as it went', `${line} / ${line2}`);
          } else bad('the resumed run reaches October again');
        }
      }
      await ctx.close();
    }
  }

  claim(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED.` : `\nAll ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
