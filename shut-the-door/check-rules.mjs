#!/usr/bin/env node
/*
 * Every ball in play the engine can produce is a legal MLB play.
 *
 * Reads every pack's advancement table (pack.advance: for each in-play key and
 * base-out state, the rows [p, basesAfter, runs, outsAdded, label, moves]) and
 * plays each row through the engine's own transition (grade.js
 * Model.transitions, then engine.js endBases for the last picture), so what is
 * checked is what a PitchResult carries: inPlay.result, runnerMoves, runs,
 * outs and bases. Moves are [from, to]: 0 the batter, 1..3 a base, 4 scored,
 * -1 put out on the play. A runner with no move stayed on his bag.
 *
 * The rules (Official Baseball Rules 5.06, 5.08, 5.09, 9.05-9.07):
 *   pass       no runner passes the runner ahead of him (5.09(b)(9)), and two
 *              runners never stand on one base (5.06(a)(3)). A batter credited
 *              with a hit of k bases touched base k, so every runner still on
 *              base stands past it, whether the batter is out later or not
 *   hit        the batter on a hit of k bases reaches at least base k when he
 *              is safe; a home run scores everyone
 *   back       a runner never ends on a base behind the one he started on
 *   conserve   every runner and the batter accounted for once: the outs are
 *              the moves to -1, the runs the moves to 4, and the bases after
 *              are where the runners stand
 *   outs       no more outs than three, and no more than the men on the play
 *   third      no run counts on a play whose third out is a force or the
 *              batter before he reaches first (5.08(a)), and a run that does
 *              count is in the row; a runner shown scoring on a third out is
 *              only a run that crossed before it, so it must be counted
 *   label      the scoring fits the play: a double play has two outs, a
 *              fielder's choice puts the batter on and a runner out, a sac fly
 *              scores a run and puts the batter out
 *   after      after the third out nobody is put on base: the last picture is
 *              the bases before with the moves applied, the runners left on
 *
 * Exit 1 on any break. --list prints every break, --json the counts by kind.
 *
 *   node shut-the-door/check-rules.mjs
 *   node shut-the-door/check-rules.mjs --list
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

export const HIT_BASES = { single: 1, double: 2, triple: 3, home_run: 4, error: 1 };
export const KINDS = ['pass', 'hit', 'back', 'conserve', 'outs', 'third', 'label', 'after'];

const bit = b => 1 << (b - 1);
const onBase = (bases, b) => !!(bases & bit(b));
const count = n => [1, 2, 4].filter(m => n & m).length;

/* The breaks of one advancement row, as [kind, why] pairs. cat is the in-play
   key (single ... out_popup), outs and bases the state before. */
export function rowBreaks(cat, outs, bases, row) {
  const [, nb, runs, oa, label, moves] = row;
  const out = [];
  const add = (k, why) => out.push([k, why]);
  const ending = outs + oa >= 3;

  // who is on the play, and where each ends: a base 1..3, 4 scored, -1 out
  const men = [0, 1, 2, 3].filter(f => f === 0 || onBase(bases, f));
  const end = new Map();
  for (const f of men) if (f > 0) end.set(f, f);
  const seen = new Set();
  for (const [f, t] of moves) {
    if (!men.includes(f)) { add('conserve', `a move from ${f}, where nobody stood`); continue; }
    if (seen.has(f)) add('conserve', `two moves from ${f}`);
    seen.add(f);
    if (!(t === -1 || (t >= 1 && t <= 4))) add('conserve', `a move to ${t}`);
    if (t !== -1 && f > 0 && t <= f) add('back', `the runner from ${f} ends on ${t}`);
    end.set(f, t);
  }
  if (!seen.has(0)) add('conserve', 'the batter has no move');

  const outsMade = [...end.values()].filter(t => t === -1).length;
  const scored = [...end.values()].filter(t => t === 4).length;
  if (outs + oa > 3) add('outs', `${outs} out and ${oa} more`);
  if (oa > men.length) add('outs', `${oa} outs with ${men.length} men on the play`);
  if (outsMade !== oa) add('conserve', `${oa} outs added, ${outsMade} men put out`);

  // the order: lead runner first, the batter last
  const order = men.slice().sort((a, b) => b - a);
  const safe = order.filter(f => end.get(f) !== -1);
  for (let i = 0; i < safe.length; i++) for (let j = i + 1; j < safe.length; j++) {
    const a = end.get(safe[i]), b = end.get(safe[j]);   // a is ahead of b
    if (a === 4) continue;
    if (b === 4) add('pass', `the runner from ${safe[j]} scores past the runner from ${safe[i]} on ${a}`);
    else if (b === a) add('pass', `the runners from ${safe[i]} and ${safe[j]} both on ${a}`);
    else if (b > a) add('pass', `the runner from ${safe[j]} on ${b} has passed the runner from ${safe[i]} on ${a}`);
  }
  const k = HIT_BASES[label] || 0;
  if (k) {
    const bt = end.get(0);
    if (bt !== -1 && bt != null && bt < k) add('hit', `a ${label} with the batter on ${bt}`);
    if (k === 4 && [...end.values()].some(t => t !== 4)) add('hit', 'a home run where not everyone scores');
    // he touched base k: everyone still on base stands past it
    if (bt === -1) for (const f of order) {
      const t = end.get(f);
      if (f > 0 && t !== -1 && t !== 4 && t <= k) add('pass', `a ${label} with the batter out and the runner from ${f} on ${t}`);
    }
  }

  // the bases after and the runs
  let after = 0;
  for (const [f, t] of end) if (f > 0 || t !== -1) { if (t >= 1 && t <= 3) after |= bit(t); }
  if (!ending) {
    if (after !== nb) add('conserve', `bases after ${nb}, the runners stand at ${after}`);
    if (scored !== runs) add('conserve', `${runs} runs, ${scored} men score`);
  } else {
    if (nb !== after) add('after', `bases after ${nb}, the runners left on stand at ${after}`);
    // a run on the third out: none when it is the batter before first or a
    // force (5.08(a)). With one out on the play that out is the third: the
    // batter out on a ball that is not a hit never reached first, and a
    // runner forced (every base behind him filled, the batter safe) put out
    // on a fielder's choice is a force. With two or three outs on one play
    // the row cannot say which came last (a 3-6 double play takes the force
    // off before the tag), so the official score's runs stand.
    if (runs > 0 && oa === 1) {
      const man = [...end].find(([, t]) => t === -1)[0];
      const forced = f => [...Array(f).keys()].every(x => x === 0 || onBase(bases, x));
      if (man === 0 && !k) add('third', `${runs} run on a third out made by the batter before first`);
      if (man > 0 && label === 'fielders_choice' && end.get(0) !== -1 && forced(man)) add('third', `${runs} run on a third out made by a force at ${man + 1}`);
    }
    if (scored !== runs) add('third', `${scored} men shown scoring and ${runs} runs counted on a third out`);
  }

  // the scoring
  // (a fielder's choice with nobody out is real scoring: the fielder went
  // after a runner and got nobody, 9.05(b). A sac fly with the batter safe is
  // a dropped fly the runner would have scored on anyway, 9.08(d).)
  if (label === 'double_play' && oa < 2) add('label', `a double play with ${oa} out`);
  if (label === 'sac_fly' && runs < 1 && !ending) add('label', 'a sac fly without a run');
  if (label === 'home_run' && oa > 0) add('label', 'a home run with an out on the play');
  return out;
}

/* Every row of one pack, played through the engine. */
export function auditPack(pack) {
  const G = require('./grade.js');
  // the rows themselves, on the first half alone (where a third out ends it); the switch between
  // halves is auditHalves below
  const model = new G.Model(pack, { single: true });
  const breaks = [];
  const margin = pack.scenario.situation.score.us - pack.scenario.situation.score.them;
  for (const cat of G.IN_PLAY) for (let o = 0; o < 3; o++) for (let b = 0; b < 8; b++) {
    const rows = pack.advance[cat][o * 8 + b] || [];
    const trans = model.transitions({ bi: 0, b: 0, s: 0, outs: o, bases: b, margin }, 'ip:' + cat);
    rows.forEach((row, i) => {
      for (const [kind, why] of rowBreaks(cat, o, b, row)) breaks.push({ cat, outs: o, bases: b, state: o * 8 + b, i, p: row[0], kind, why, row });
      // what a PitchResult carries
      const t = trans[i][1];
      const outsAfter = t.end === 'hold' ? 3 : t.st ? t.st.outs : o;
      if (outsAfter > 3) breaks.push({ cat, outs: o, bases: b, state: o * 8 + b, i, p: row[0], kind: 'outs', why: 'the engine reports more than 3 outs', row });
      // the runs the engine counts are the row's, on a third out too (5.08(a))
      if ((t.runs || 0) !== row[2]) breaks.push({ cat, outs: o, bases: b, state: o * 8 + b, i, p: row[0], kind: 'third', why: `the row counts ${row[2]} runs and the engine ${t.runs || 0}`, row });
      if (t.st && t.st.outs >= 3) breaks.push({ cat, outs: o, bases: b, state: o * 8 + b, i, p: row[0], kind: 'after', why: 'play goes on after the third out', row });
    });
  }
  return breaks;
}

/* Rules 8: the switch between halves, legal. The halves are his team's defensive halves in order,
   each later one from no outs and nobody on, with the walk-off rule where it belongs; his team's
   half between two is the right half of the right inning, and every plate appearance in it keeps
   the runners (on before + the batter = on after + runs + outs added), its outs climb to three and
   its runs are the half's. Then outings are played through the engine: at each switch the next half
   starts at 0-0, no outs, nobody on, the batter after the last one he faced leading off (the same
   one when the third out was made on the bases), and the score is the half's plus his team's runs. */
export function auditHalves(pack, outings = 60) {
  const G = require('./grade.js'), E = require('./engine.js'), R = require('./rng.js');
  const sc = pack.scenario, hs = sc.halves || [], out = [];
  const add = why => out.push(why);
  if (hs.length < 2) return out;
  const side = sc.situation.usHome ? 'top' : 'bottom';
  hs.forEach((h, k) => {
    if (h.half !== side) add(`half ${k} is the ${h.half}, he pitches the ${side}`);
    if (k && h.inning !== hs[k - 1].inning + 1) add(`half ${k} is inning ${h.inning} after ${hs[k - 1].inning}`);
    if (k && (h.outs !== 0 || h.bases !== 0)) add(`half ${k} does not start empty`);
    if (h.walkOffLive !== (!sc.situation.usHome && h.inning >= 9)) add(`half ${k}: the walk-off rule`);
    if (!Array.isArray(h.lineup) || h.lineup.length !== 9 || h.lineup.some(i => !(i >= 0 && i < sc.batters.length))) add(`half ${k}: the lineup`);
  });
  if (!sc.between || sc.between.length !== hs.length - 1) add('one half of his team\'s between each two of his');
  (sc.between || []).forEach((bt, k) => {
    const inn = side === 'bottom' ? hs[k].inning + 1 : hs[k].inning;
    if (bt.half === side || bt.inning !== inn) add(`between ${k} is the ${bt.half} ${bt.inning}`);
    let on = 0, outs = 0, runs = 0;
    const count = b => [1, 2, 4].filter(x => b & x).length;
    bt.pas.forEach((pa, i) => {
      const dOuts = pa.outs - outs;
      if (dOuts < 0 || pa.outs > 3) add(`between ${k} PA ${i}: outs ${outs} to ${pa.outs}`);
      if (count(on) + 1 !== count(pa.bases) + pa.runs + dOuts) add(`between ${k} PA ${i} (${pa.short}): ${count(on)} on and the batter, ${count(pa.bases)} on after, ${pa.runs} in, ${dOuts} out`);
      if ([1, 2, 4].some((x, j) => !!(pa.bases & x) !== (pa.runners[j] != null))) add(`between ${k} PA ${i}: the runners and the bases differ`);
      on = pa.bases; outs = pa.outs; runs += pa.runs;
    });
    if (outs !== 3) add(`between ${k} ends with ${outs} outs`);
    if (runs !== bt.runs) add(`between ${k}: the plays score ${runs}, the half ${bt.runs}`);
  });
  const model = new G.Model(pack);
  for (let n = 0; n < outings; n++) {
    const rng = R.mulberry32(R.hashSeed(sc.id + '|halves|' + n));
    const o = E.createOuting(pack, { seed: R.hashSeed(sc.id + '|halves-seed|' + n), model });
    let guard = 0;
    while (o.status === 'live' && guard++ < 300) {
      const before = { bi: o.st.bi, h: o.st.h || 0, us: o.score.us, them: o.score.them };
      let rec = null;
      if (E.pickoffLive(o) && rng() < 0.1) rec = E.pickoff(o).pickoff.halfOver;
      else {
        const r = E.throwPitch(o, { type: model.types[Math.floor(rng() * model.types.length)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100 });
        rec = r.pitchResult.halfOver;
        if (rec && !r.pitchResult.paOver && !(r.pitchResult.steal && r.pitchResult.steal.result === 'out')) add(`outing ${n}: a half ended on a pitch that ended no plate appearance and made no out on the bases`);
        if (rec) {
          const same = !r.pitchResult.paOver;
          const want = same ? before.bi : (before.bi + 1) % model.N;
          if (o.st.bi !== want) add(`outing ${n}: the next half leads off with ${o.st.bi}, not ${want}`);
        }
      }
      if (!rec) continue;
      const st = o.st, bt = sc.between[before.h];
      if (st.h !== before.h + 1 || st.outs || st.bases || st.b || st.s) add(`outing ${n}: the next half does not start at 0-0, no outs, nobody on`);
      if (o.score.us !== before.us + bt.runs) add(`outing ${n}: his team's ${bt.runs} runs are not on the score`);
      if (st.margin !== o.score.us - o.score.them) add(`outing ${n}: the margin ${st.margin} is not the score`);
      if (rec.next.leadoff.index !== model.who(st)) add(`outing ${n}: the card's leadoff is not the batter up`);
    }
  }
  return out;
}

export function packFiles() {
  const dir = join(HERE, 'data', 'packs');
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => join(dir, f));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const list = process.argv.includes('--list');
  const json = process.argv.includes('--json');
  const total = Object.fromEntries(KINDS.map(k => [k, 0]));
  let rows = 0, bad = 0;
  const byPack = {}, halvesOk = [];
  for (const f of packFiles()) {
    const pack = JSON.parse(readFileSync(f, 'utf8'));
    const breaks = auditPack(pack);
    const id = pack.scenario.id;
    const badRows = new Set(breaks.map(x => `${x.cat}|${x.state}|${x.i}`));
    for (const cat of Object.keys(pack.advance)) for (const st of Object.keys(pack.advance[cat])) rows += pack.advance[cat][st].length;
    bad += badRows.size;
    const kinds = {};
    const once = new Set();
    for (const x of breaks) {
      const key = `${x.kind}|${x.cat}|${x.state}|${x.i}`;
      if (once.has(key)) continue;
      once.add(key);
      kinds[x.kind] = (kinds[x.kind] || 0) + 1;
      total[x.kind]++;
      if (list) console.log(`${id}  ${x.cat} state ${x.state} (${x.outs} out, bases ${x.bases}) row ${x.i} p ${x.p}  ${x.kind}: ${x.why}  ${JSON.stringify(x.row)}`);
    }
    byPack[id] = kinds;
    // rules 8: the switch between halves
    const hb = auditHalves(pack);
    if (hb.length) { bad += hb.length; total.half = (total.half || 0) + hb.length; kinds.half = hb.length; for (const w of hb) console.log(`${id}  half: ${w}`); }
    else if ((pack.scenario.halves || []).length > 1) halvesOk.push(`${id} (${pack.scenario.halves.length} halves)`);
  }
  if (json) console.log(JSON.stringify({ rows, bad, total, byPack }, null, 1));
  const line = KINDS.concat(['half']).filter(k => total[k]).map(k => `${k} ${total[k]}`).join(', ');
  if (bad) {
    console.error(`check-rules: ${bad} of ${rows} in-play rows break an MLB rule (${line})`);
    process.exit(1);
  }
  console.log(`check-rules: all ${rows} in-play rows in ${packFiles().length} packs are legal MLB plays`);
  if (halvesOk.length) console.log(`check-rules: the switch between halves is legal in ${halvesOk.join(', ')}`);
}
