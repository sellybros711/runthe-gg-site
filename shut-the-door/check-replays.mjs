/* Shut The Door: replay stored daily results and flag any the calls do not produce.
 *
 *   node shut-the-door/check-replays.mjs rows.json     rows exported from shutdoor_outings (or
 *                                                      shutdoor_survivor: a row with entries)
 *   node shut-the-door/check-replays.mjs --self-test   plays some outings, checks them, and
 *                                                      checks that a doctored row is caught
 *
 * A submitted result is trusted the way other games' are (PLAN.md risks), but
 * every row keeps its calls, and a daily is deterministic: the day gives the
 * seed, the scenario id gives the pack, and the calls give everything else. So
 * any row can be replayed here with the engine and compared field by field:
 * outcome, pitches, score, the strip. (The percentile is compared too, against
 * the pack as it is now.)
 *
 * ROWS FROM BEFORE THE TIE RULE (2026-10-20). A run that tied used to end the
 * outing as doors_open; now the inning goes on. Every other row replays as it
 * was: grades before a tie are unchanged and the result bonus of door_shut,
 * doors_open and walk_off is unchanged, so the score is the same. A row that
 * ended on its tying run is still live when its calls run out under the new
 * rules. Such a row (outcome doors_open, the calls end with the score tied by
 * the last pitch) is replayed under the old rule: the same pitches, grades
 * and strip, scored as doors_open (legacy). Its percentile is not compared,
 * since the pool was replayed under the new rules. The percentile of any row
 * submitted before the new packs can move for the same reason.
 *
 * THE RELEASE (2026-10-22). A call may carry q, the release meter's timing
 * (contract.js RELEASE). It is replayed like the rest of the call: q scales
 * the miss of the same draws. A call without q is 1.0x, so every row from
 * before the meter replays exactly as it was (the self-test holds three such
 * rows, made by the engine before the meter, in fixtures/replays-pre-meter.json).
 * The server cannot see a tap, so q is trusted like the score. Over a file of
 * rows this prints the players' mean spread (the number meter.js is tuned
 * on) and notes, without flagging, a row whose every release is near perfect.
 *
 * RULES 2 (2026-10-22). The hitter adjusts, the arm tires (CONTRACT.md 5b). A
 * new outing's calls carry r: 2 and replay under rules 2. A row whose calls
 * carry no r was played under rules 1 and replays under rules 1, exactly:
 * the same pitches, grades, strip, outcome and score (the self-test holds the
 * three pre-meter rows to every pitch). Its percentile is not compared: the
 * packs' closer pool was replayed under rules 2, so a rules 1 row's
 * percentile against today's pool can move.
 *
 * EFFORT (2026-10-22, CONTRACT.md 5c). A rules 2 call may carry e beside q.
 * It replays like the rest of the call. A call without e is his ordinary
 * pitch, so every rules 2 row from before effort replays exactly (the
 * self-test holds three such rows, made by main's engine before effort, in
 * fixtures/replays-rules2-pre-effort.json, to every pitch, speed and arm).
 * The free aim point (CONTRACT.md 5d) rides the same way: at, where inside its
 * cell a call was aimed; a call without at aims at the centre.
 *
 * RULES 3 (2026-10-24). A run that crosses before a legal third out counts
 * (grade.js THE THIRD OUT), and the pack's hold table is solved that way. A
 * row from before (calls with r 2, or none) replays under its own rules, where
 * a third out scores none: on a model that scores none and solves its own
 * table (legacyOf below), which on today's advancement table is the old table
 * exactly, since each half-ending row was split into real plays that sum to
 * it. So every stored row replays to its score, pitch by pitch.
 *
 * RULES 4 (2026-10-24). A take is called where it crossed, ABS challenges,
 * and the bright band's release (engine.js 7). A new outing's calls carry r 4,
 * and a call whose called ball the player challenged carries ch: 1. A row with
 * r 3 replays under rules 3 exactly (the self-test holds three, made by main's
 * engine before rules 4, in fixtures/replays-rules3-pre-abs.json). The pool
 * was replayed under rules 4, so a rules 3 row's percentile is not compared.
 *
 * RULES 7 (2026-10-26). The running game (contract.js THE RUNNING GAME,
 * engine.js 10): steals on a stream of their own, the pickoff (pa on the call
 * before, the throws made after that pitch) and the quick delivery (ss: 1). A
 * new outing's calls carry r 7. A row with r 6 replays under rules 6 exactly
 * (fixtures/replays-rules6-pre-steals.json: three rows whose calls see a steal
 * under rules 7). A rules 7 row with steals and pickoffs replays exactly, and
 * with its pickoffs taken out it is flagged (the self-test).
 *
 * RULES 6 (2026-10-26). The runners read the ball (contract.js THE RUNNERS
 * READ THE BALL, engine.js 9). A new outing's calls carry r 6. A row with r 5
 * replays under rules 5 exactly (the self-test holds three, made by main's
 * engine before rules 6, each with a ball in play whose runners go another way
 * under rules 6, in fixtures/replays-rules5-pre-runners.json).
 *
 * RULES 5 (2026-10-25). An error on a routine play is extremely rare
 * (contract.js ROUTINE, engine.js 8). A new outing's calls carry r 5. A row
 * with r 4 replays under rules 4 exactly, its routine errors and all (the
 * self-test holds three, made by main's engine before rules 5, each with an
 * error on a routine ball, in fixtures/replays-rules4-pre-routine.json).
 *
 * Export the rows from the Supabase SQL editor, for example:
 *   select json_agg(o) from shutdoor_outings o where day >= current_date - 7;
 * and save the array as rows.json. Exit code 1 when a row is flagged.
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const G = require('./grade.js');
const E = require('./engine.js');
const R = require('./rng.js');
const K = require('./contract.js');

const cache = {};

/* The releases of one row: how many calls were timed, and their mean spread. */
export function releaseOf(calls) {
  const timed = (calls || []).filter(c => c && c.q != null);
  const spread = timed.reduce((a, c) => a + K.spreadOf(c.q), 0);
  return { timed: timed.length, of: (calls || []).length, spread, perfect: timed.filter(c => c.q >= 0.95).length };
}
function packOf(id) {
  if (cache[id]) return cache[id];
  const path = join(HERE, 'data', 'packs', id + '.json');
  if (!existsSync(path)) return null;
  const pack = JSON.parse(readFileSync(path, 'utf8'));
  cache[id] = { pack, model: new G.Model(pack) };
  return cache[id];
}
/* The model a row is replayed on: today's, or for a row played before rules
   3 one where a third out scores none, its table solved here (a few seconds
   a pack, once). */
function modelFor(p, calls) {
  if (E.rulesOf(calls) >= G.THIRD_OUT_RULES) return p.model;
  if (!p.legacy) p.legacy = new G.Model(p.pack, { thirdOutRuns: false });
  return p.legacy;
}

export function replayRow(row) {
  const p = packOf(row.scenario_id);
  if (!p) return { ok: false, why: 'no pack ' + row.scenario_id };
  const calls = typeof row.calls === 'string' ? JSON.parse(row.calls) : row.calls;
  const o = E.replay(p.pack, E.seedFor('daily', row.day), calls, { mode: 'daily', model: modelFor(p, calls) });
  if (o.calls.length !== calls.length) return { ok: false, why: 'calls after the outing ended' };
  const legacy = o.status === 'live' && endedOnTheTie(o, row);
  if (o.status !== 'over' && !legacy) return { ok: false, why: 'the calls do not finish the outing' };
  const res = legacy ? legacyResult(o) : E.finishOuting(o);
  const strip = typeof row.strip === 'string' ? JSON.parse(row.strip) : row.strip;
  const diffs = [];
  if (res.outcome !== row.outcome) diffs.push(`outcome ${row.outcome} replays as ${res.outcome}`);
  if (res.pitches !== row.pitches) diffs.push(`pitches ${row.pitches} replays as ${res.pitches}`);
  if (res.score !== row.score) diffs.push(`score ${row.score} replays as ${res.score}`);
  if (JSON.stringify(res.strip) !== JSON.stringify(strip)) diffs.push('the strip differs');
  // the pool plays the current rules, so a rules 1 row's percentile is not compared (RULES 2 above)
  if (!legacy && o.rules === G.RULES && res.percentile != null && Math.abs(res.percentile - row.percentile) > 1) diffs.push(`percentile ${row.percentile} replays as ${res.percentile}`);
  return { ok: !diffs.length, why: diffs.join('; '), res, legacy };
}

/* SURVIVOR (2026-10-30, CONTRACT.md 17). A row from shutdoor_survivor: {day, run, entries
   [{scenarioId, calls, outcome, pitches, score}], saves, points, over}. Each entry must be the
   situation modes.js gives that (day, run, index), played on its seed; it is replayed like a daily
   row. Every entry but the last is a door shut, and saves, points and over add up. */
let SCHED = null;
const MODES = () => require('./modes.js');
function schedOf() {
  if (!SCHED) SCHED = JSON.parse(readFileSync(join(HERE, 'data', 'schedule.json'), 'utf8'));
  return SCHED;
}
export function replaySurvivor(row) {
  const entries = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
  const diffs = [];
  let saves = 0, points = 0;
  entries.forEach((e, i) => {
    const at = MODES().survivorAt(schedOf(), String(row.day).slice(0, 10), row.run, i);
    if (e.scenarioId !== at.pack) { diffs.push(`#${i} is ${e.scenarioId}, the run plays ${at.pack} there`); return; }
    const p = packOf(e.scenarioId);
    if (!p) { diffs.push(`#${i}: no pack ${e.scenarioId}`); return; }
    const o = E.replay(p.pack, at.seed, e.calls, { mode: 'survivor', model: p.model });
    if (o.status !== 'over' || o.calls.length !== e.calls.length) { diffs.push(`#${i}: the calls do not finish the outing`); return; }
    const res = E.finishOuting(o);
    if (res.outcome !== e.outcome) diffs.push(`#${i}: outcome ${e.outcome} replays as ${res.outcome}`);
    if (res.pitches !== e.pitches) diffs.push(`#${i}: pitches ${e.pitches} replays as ${res.pitches}`);
    if (res.score !== e.score) diffs.push(`#${i}: score ${e.score} replays as ${res.score}`);
    if (e.outcome !== 'door_shut' && i !== entries.length - 1) diffs.push(`#${i}: the run went on after ${e.outcome}`);
    if (e.outcome === 'door_shut') saves++;
    points += e.score;
  });
  const over = entries.some(e => e.outcome !== 'door_shut');
  if (row.saves != null && row.saves !== saves) diffs.push(`saves ${row.saves}, the entries make ${saves}`);
  if (row.points != null && row.points !== points) diffs.push(`points ${row.points}, the entries make ${points}`);
  if (row.over != null && !!row.over !== over) diffs.push(`over ${row.over}, the entries say ${over}`);
  return { ok: !diffs.length, why: diffs.join('; '), saves, points, over };
}

/* A row from before the tie rule that ended on its tying run: stored as
   doors_open, and its last pitch tied the game. */
function endedOnTheTie(o, row) {
  const last = o.log[o.log.length - 1];
  return row.outcome === 'doors_open' && !!last && last.runs > 0 && o.score.us === o.score.them;
}
/* That row's result under the old rule: the tie ended it, doors_open. */
function legacyResult(o) {
  const outcome = 'doors_open';
  const score = E.outingScore({ grades: o.grades, outcome });
  return { outcome, pitches: o.log.length, strip: o.grades.map(g => g.band), score, percentile: null };
}

function selfTest() {
  const ids = ['std-2025-ws7-yamamoto', 'std-2016-ws7-chapman'];
  let fails = 0;
  const say = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
  for (const id of ids) {
    const p = packOf(id);
    if (!p) { console.log('skip ' + id + ' (no pack)'); continue; }
    const day = '2026-10-21';
    const rng = R.mulberry32(R.hashSeed(id));
    const o = E.createOuting(p.pack, { seed: E.seedFor('daily', day), mode: 'daily', model: p.model });
    while (o.status === 'live') {
      const types = p.model.types;
      E.throwPitch(o, { type: types[Math.floor(rng() * types.length)], cell: Math.floor(rng() * 25) });
    }
    const res = E.finishOuting(o);
    const row = { day, scenario_id: id, calls: o.calls, outcome: res.outcome, pitches: res.pitches, score: res.score, percentile: res.percentile, strip: res.strip };
    const a = replayRow(row);
    console.log((a.ok ? 'ok   ' : 'FAIL ') + `${id}: a played outing replays to its own row` + (a.ok ? '' : ': ' + a.why));
    if (!a.ok) fails++;
    const b = replayRow(Object.assign({}, row, { score: row.score + 50 }));
    console.log((!b.ok ? 'ok   ' : 'FAIL ') + `${id}: a doctored score is flagged`);
    if (b.ok) fails++;
    // the row's calls carry r 3 (G.RULES); the same calls without it replay under rules 1, a different outing
    const noR = Object.assign({}, row, { calls: row.calls.map(c => { const x = Object.assign({}, c); delete x.r; return x; }) });
    const c2 = replayRow(noR);
    const okR = row.calls.every(c => c.r === G.RULES) && !c2.ok;
    console.log((okR ? 'ok   ' : 'FAIL ') + `${id}: a new row carries r ${G.RULES}, and with r taken out it is flagged`);
    if (!okR) fails++;
  }
  /* the tie rule: a held tie replays, and a row from before it that ended on
     its tying run still replays against its stored score */
  {
    const id = 'std-2025-ws7-yamamoto', p = packOf(id);
    let found = null;
    for (let d = 1; d <= 400 && !found; d++) {
      const day = `2026-${String(10 + Math.floor((d - 1) / 28)).padStart(2, '0')}-${String(1 + ((d - 1) % 28)).padStart(2, '0')}`;
      const rng = R.mulberry32(R.hashSeed(id + '|tie|' + d));
      const o = E.createOuting(p.pack, { seed: E.seedFor('daily', day), mode: 'daily', model: p.model });
      let tieAt = -1;
      while (o.status === 'live') {
        E.throwPitch(o, { type: p.model.types[Math.floor(rng() * p.model.types.length)], cell: Math.floor(rng() * 25) });
        if (tieAt < 0 && o.score.us === o.score.them) tieAt = o.log.length;
      }
      if (o.outcome === 'tie_held') found = { day, o, tieAt };
    }
    say(!!found, `${id}: a random outing that holds a tie exists`);
    if (found) {
      const { day, o, tieAt } = found;
      const res = E.finishOuting(o);
      const row = { day, scenario_id: id, calls: o.calls, outcome: 'tie_held', pitches: res.pitches, score: res.score, percentile: res.percentile, strip: res.strip };
      say(replayRow(row).ok, `${id}: a held tie replays to its own row (${res.pitches} pitches, tied on pitch ${tieAt})`);
      // the same outing as the old rule stored it: it ended on the tying run, doors_open
      const old = E.replay(p.pack, E.seedFor('daily', day), o.calls.slice(0, tieAt), { mode: 'daily', model: p.model });
      const oldScore = Math.max(0, Math.round(E.SCORE_BASE - E.SCORE_PER_PT * old.grades.reduce((a, g) => a + g.lost, 0))) + E.RESULT_BONUS.doors_open;
      const oldRow = { day, scenario_id: id, calls: old.calls, outcome: 'doors_open', pitches: tieAt, score: oldScore, percentile: 0, strip: old.grades.map(g => g.band) };
      const a = replayRow(oldRow);
      say(a.ok && a.legacy, `${id}: a row from before the tie rule, ended on its tying run, replays against its stored score (legacy)` + (a.ok ? '' : ': ' + a.why));
      say(!replayRow(Object.assign({}, oldRow, { score: oldScore + 50 })).ok, `${id}: a doctored legacy row is flagged`);
      say(!replayRow(Object.assign({}, oldRow, { outcome: 'door_shut' })).ok, `${id}: a cut-short row that claims a door shut is flagged`);
      say(K.OUTCOMES.includes(row.outcome), `${id}: tie_held is an outcome`);
    }
  }
  /* the release: rows made before the meter (no q) replay exactly, pitch by pitch, and a
     row with q replays exactly too */
  {
    const old = JSON.parse(readFileSync(join(HERE, 'fixtures', 'replays-pre-meter.json'), 'utf8'));
    for (const row of old) {
      const a = replayRow(row);
      const p = packOf(row.scenario_id);
      const o = E.replay(p.pack, E.seedFor('daily', row.day), row.calls, { mode: 'daily', model: p.model });
      const same = JSON.stringify(o.log.map(x => [x.actual.x, x.actual.zn, x.actualCell])) === JSON.stringify(row.actual);
      say(a.ok && same && row.calls.every(c => !('q' in c)), `${row.scenario_id}: a row from before the meter (no q) replays exactly, every pitch where it was (${row.pitches} pitches)` + (a.ok ? '' : ': ' + a.why));
    }
    const id = 'std-2025-ws7-yamamoto', p = packOf(id);
    let pair = null;
    for (let d = 1; d <= 60 && !pair; d++) {
      const day = `2026-11-${String(d % 28 + 1).padStart(2, '0')}`;
      const rng = R.mulberry32(R.hashSeed(id + '|release|' + d));
      const o = E.createOuting(p.pack, { seed: E.seedFor('daily', day), mode: 'daily', model: p.model });
      while (o.status === 'live') E.throwPitch(o, { type: p.model.types[Math.floor(rng() * p.model.types.length)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100 });
      const res = E.finishOuting(o);
      const row = { day, scenario_id: id, calls: JSON.parse(JSON.stringify(o.calls)), outcome: res.outcome, pitches: res.pitches, score: res.score, percentile: res.percentile, strip: res.strip };
      const stripped = Object.assign({}, row, { calls: row.calls.map(c => ({ type: c.type, cell: c.cell })) });
      if (!replayRow(stripped).ok) pair = { row, stripped };
    }
    say(!!pair, `${id}: an outing whose release changed what happened exists`);
    if (pair) {
      say(replayRow(pair.row).ok, `${id}: a row with q replays exactly (${pair.row.pitches} pitches, ${releaseOf(pair.row.calls).timed} timed)`);
      say(!replayRow(pair.stripped).ok, `${id}: the same row with its q taken out is flagged`);
    }
  }
  /* effort: rules 2 rows made before effort (no e, by main's engine at 73e228d) replay exactly,
     pitch by pitch, and a row with e replays exactly too */
  {
    const old = JSON.parse(readFileSync(join(HERE, 'fixtures', 'replays-rules2-pre-effort.json'), 'utf8'));
    for (const row of old) {
      const a = replayRow(row);
      const p = packOf(row.scenario_id);
      const o = E.replay(p.pack, E.seedFor('daily', row.day), row.calls, { mode: 'daily', model: p.model });
      const same = JSON.stringify(o.log.map(x => [x.actual.x, x.actual.zn, x.actualCell])) === JSON.stringify(row.actual)
        && JSON.stringify(o.log.map(x => x.velo)) === JSON.stringify(row.velo)
        && JSON.stringify(o.log.map(x => x.arm)) === JSON.stringify(row.arm)
        && JSON.stringify(o.log.map(x => x.result)) === JSON.stringify(row.result);
      say(a.ok && same && o.rules === 2 && row.calls.every(c => !('e' in c)), `${row.scenario_id}: a rules 2 row from before effort (no e) replays exactly, every pitch, speed and arm (${row.pitches} pitches)` + (a.ok ? '' : ': ' + a.why));
    }
    const id = 'std-2025-ws7-yamamoto', p = packOf(id);
    let pair = null;
    for (let d = 1; d <= 60 && !pair; d++) {
      const day = `2026-12-${String(d % 28 + 1).padStart(2, '0')}`;
      const rng = R.mulberry32(R.hashSeed(id + '|effort|' + d));
      const o = E.createOuting(p.pack, { seed: E.seedFor('daily', day), mode: 'daily', model: p.model });
      while (o.status === 'live') E.throwPitch(o, { type: p.model.types[Math.floor(rng() * p.model.types.length)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100, e: Math.round(rng() * 4) / 4, at: [Math.round(rng() * 100 - 50) / 100, Math.round(rng() * 100 - 50) / 100] });
      const res = E.finishOuting(o);
      const row = { day, scenario_id: id, calls: JSON.parse(JSON.stringify(o.calls)), outcome: res.outcome, pitches: res.pitches, score: res.score, percentile: res.percentile, strip: res.strip };
      const stripped = Object.assign({}, row, { calls: row.calls.map(c => { const x = Object.assign({}, c); delete x.e; return x; }) });
      if (!replayRow(stripped).ok) pair = { row, stripped };
    }
    say(!!pair, `${id}: an outing whose effort changed what happened exists`);
    if (pair) {
      say(replayRow(pair.row).ok && pair.row.calls.every(c => typeof c.e === 'number'), `${id}: a row with e and at replays exactly (${pair.row.pitches} pitches)`);
      say(!replayRow(pair.stripped).ok, `${id}: the same row with its e taken out is flagged`);
      const noAt = Object.assign({}, pair.row, { calls: pair.row.calls.map(c => { const x = Object.assign({}, c); delete x.at; return x; }) });
      say(pair.row.calls.every(c => Array.isArray(c.at)) && !replayRow(noAt).ok, `${id}: a row with free aim points replays exactly, and with them taken out it is flagged`);
    }
    const noQ = { day: '2026-12-01', scenario_id: id, calls: [{ type: p.model.types[0], cell: 12, e: 1, r: 2 }], outcome: 'door_shut', pitches: 1, score: 0, percentile: 0, strip: ['green'] };
    let refused = false;
    try { refused = !replayRow(noQ).ok; } catch (e) { refused = true; }
    say(refused, `${id}: a row with an effort and no release is refused`);
  }
  /* rules 4: rules 3 rows made before it (by main's engine at f0df2b2, with q, e and at) replay
     exactly, pitch by pitch; a rules 4 row with a pitcher's challenge (ch) replays exactly, and
     with the challenge taken out it is flagged */
  {
    const old = JSON.parse(readFileSync(join(HERE, 'fixtures', 'replays-rules3-pre-abs.json'), 'utf8'));
    for (const row of old) {
      const a = replayRow(row);
      const p = packOf(row.scenario_id);
      const o = E.replay(p.pack, E.seedFor('daily', row.day), row.calls, { mode: 'daily', model: p.model });
      const same = JSON.stringify(o.log.map(x => [x.actual.x, x.actual.zn, x.actualCell])) === JSON.stringify(row.actual)
        && JSON.stringify(o.log.map(x => x.velo)) === JSON.stringify(row.velo)
        && JSON.stringify(o.log.map(x => x.arm)) === JSON.stringify(row.arm)
        && JSON.stringify(o.log.map(x => x.result)) === JSON.stringify(row.result);
      say(a.ok && same && o.rules === 3 && !o.abs, `${row.scenario_id}: a rules 3 row from before ABS replays exactly, every pitch, call, speed and arm (${row.pitches} pitches)` + (a.ok ? '' : ': ' + a.why));
    }
    const id = 'std-2025-ws7-yamamoto', p = packOf(id);
    let pair = null;
    for (let d = 1; d <= 120 && !pair; d++) {
      const day = `2027-01-${String(d % 28 + 1).padStart(2, '0')}`;
      const rng = R.mulberry32(R.hashSeed(id + '|abs|' + d));
      const o = E.createOuting(p.pack, { seed: E.seedFor('daily', day), mode: 'daily', model: p.model });
      while (o.status === 'live' || E.challengeLive(o)) {
        if (E.challengeLive(o)) { E.challengePitch(o); if (o.status !== 'live') break; continue; }
        E.throwPitch(o, { type: p.model.types[Math.floor(rng() * p.model.types.length)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100 });
      }
      const res = E.finishOuting(o);
      const row = { day, scenario_id: id, calls: JSON.parse(JSON.stringify(o.calls)), outcome: res.outcome, pitches: res.pitches, score: res.score, percentile: res.percentile, strip: res.strip };
      const stripped = Object.assign({}, row, { calls: row.calls.map(c => { const x = Object.assign({}, c); delete x.ch; return x; }) });
      if (row.calls.some(c => c.ch === 1) && !replayRow(stripped).ok) pair = { row, stripped };
    }
    say(!!pair, `${id}: an outing whose challenges changed what happened exists`);
    if (pair) {
      say(replayRow(pair.row).ok && pair.row.calls.every(c => c.r === G.RULES), `${id}: a rules ${G.RULES} row with challenges replays exactly (${pair.row.pitches} pitches, ${pair.row.calls.filter(c => c.ch).length} challenged)`);
      say(!replayRow(pair.stripped).ok, `${id}: the same row with its challenges taken out is flagged`);
    }
  }
  /* rules 5: rules 4 rows made before it (main's engine at 35239d4, with q, e, at and challenges),
     each with an error on a routine ball, replay exactly, pitch by pitch, the error included */
  {
    const old = JSON.parse(readFileSync(join(HERE, 'fixtures', 'replays-rules4-pre-routine.json'), 'utf8'));
    for (const row of old) {
      const a = replayRow(row);
      const p = packOf(row.scenario_id);
      const o = E.replay(p.pack, E.seedFor('daily', row.day), row.calls, { mode: 'daily', model: p.model });
      const ip = o.log.map(x => x.inPlay ? x.inPlay.result : null);
      const same = JSON.stringify(o.log.map(x => [x.actual.x, x.actual.zn, x.actualCell])) === JSON.stringify(row.actual)
        && JSON.stringify(o.log.map(x => x.velo)) === JSON.stringify(row.velo)
        && JSON.stringify(o.log.map(x => x.arm)) === JSON.stringify(row.arm)
        && JSON.stringify(o.log.map(x => x.result)) === JSON.stringify(row.result)
        && JSON.stringify(ip) === JSON.stringify(row.inPlay);
      const routineErr = o.log.some(x => x.inPlay && x.inPlay.result === 'error' && K.routineOf(x.inPlay.bb, x.inPlay.ev, x.inPlay.la, x.inPlay.spray));
      say(a.ok && same && routineErr && o.rules === G.ABS_RULES, `${row.scenario_id}: a rules 4 row from before the routine play replays exactly, its routine error included (${row.pitches} pitches)` + (a.ok ? '' : ': ' + a.why));
    }
  }
  /* rules 6: rules 5 rows made before it (main's engine at 88dd6bf), each with a ball in play whose
     runners would go another way under rules 6, replay exactly under rules 5, every runner's move */
  {
    const old = JSON.parse(readFileSync(join(HERE, 'fixtures', 'replays-rules5-pre-runners.json'), 'utf8'));
    for (const row of old) {
      const a = replayRow(row);
      const p = packOf(row.scenario_id);
      const o = E.replay(p.pack, E.seedFor('daily', row.day), row.calls, { mode: 'daily', model: p.model });
      const same = JSON.stringify(o.log.map(x => x.runnerMoves || null)) === JSON.stringify(row.moves)
        && JSON.stringify(o.log.map(x => x.inPlay ? x.inPlay.result : null)) === JSON.stringify(row.inPlay)
        && JSON.stringify(o.log.map(x => x.result)) === JSON.stringify(row.result);
      const o6 = E.replay(p.pack, E.seedFor('daily', row.day), row.calls.map(c => Object.assign({}, c, { r: G.RUNNER_RULES })), { mode: 'daily', model: p.model });
      const moved = JSON.stringify(o6.log.map(x => x.runnerMoves || null)) !== JSON.stringify(row.moves.slice(0, o6.log.length));
      say(a.ok && same && moved && o.rules === G.ROUTINE_RULES, `${row.scenario_id}: a rules 5 row from before the runners read the ball replays exactly, every runner's move (${row.pitches} pitches)` + (a.ok ? '' : ': ' + a.why));
    }
  }
  /* rules 7: rules 6 rows made before it (the rules 6 engine at f346b75), where the same calls
     under rules 7 see a steal, replay exactly under rules 6, every runner's move */
  {
    const old = JSON.parse(readFileSync(join(HERE, 'fixtures', 'replays-rules6-pre-steals.json'), 'utf8'));
    for (const row of old) {
      const a = replayRow(row);
      const p = packOf(row.scenario_id);
      const o = E.replay(p.pack, E.seedFor('daily', row.day), row.calls, { mode: 'daily', model: p.model });
      const same = JSON.stringify(o.log.map(x => x.runnerMoves || null)) === JSON.stringify(row.moves)
        && JSON.stringify(o.log.map(x => x.result)) === JSON.stringify(row.result) && o.log.every(x => !x.steal);
      say(a.ok && same && o.rules === G.RUNNER_RULES, `${row.scenario_id}: a rules 6 row from before the running game replays exactly, no steal (${row.pitches} pitches)` + (a.ok ? '' : ': ' + a.why));
    }
  }
  /* rules 7: a row with steals, pickoffs and quick deliveries replays exactly, and is flagged with
     its pickoffs taken out */
  {
    const id = 'std-2016-ws7-chapman', p = packOf(id);
    let found = null;
    for (let d = 1; d <= 200 && !found; d++) {
      const day = `2027-03-${String(d % 28 + 1).padStart(2, '0')}`;
      const rng = R.mulberry32(R.hashSeed(id + '|run|' + d));
      const o = E.createOuting(p.pack, { seed: E.seedFor('daily', day), mode: 'daily', model: p.model });
      while (o.status === 'live') {
        if (E.pickoffLive(o) && rng() < 0.3) { E.pickoff(o); continue; }
        E.throwPitch(o, { type: p.model.types[Math.floor(rng() * p.model.types.length)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100, ss: rng() < 0.5 ? 1 : undefined });
      }
      const res = E.finishOuting(o);
      if (o.log.some(x => x.steal && x.steal.result !== 'back' && x.steal.result !== 'moot') && o.calls.some(c => c.pa)) {
        const row = { day, scenario_id: id, calls: JSON.parse(JSON.stringify(o.calls)), outcome: res.outcome, pitches: res.pitches, score: res.score, percentile: res.percentile, strip: res.strip };
        const stripped = Object.assign({}, row, { calls: row.calls.map(c => { const x = Object.assign({}, c); delete x.pa; return x; }) });
        let flagged = true;
        try { flagged = !replayRow(stripped).ok; } catch (e) { flagged = true; }
        if (flagged) found = row;   // one whose pickoffs changed what happened
      }
    }
    say(!!found, `${id}: an outing whose steal and pickoffs changed what happened exists`);
    if (found) {
      say(replayRow(found).ok && found.calls.every(c => c.r === G.RULES), `${id}: a rules ${G.RULES} row with steals, pickoffs (${found.calls.reduce((a, c) => a + (c.pa || 0), 0)}) and quick deliveries replays exactly`);
      const stripped = Object.assign({}, found, { calls: found.calls.map(c => { const x = Object.assign({}, c); delete x.pa; return x; }) });
      let flagged = true;
      try { flagged = !replayRow(stripped).ok; } catch (e) { flagged = true; }
      say(flagged, `${id}: the same row with its pickoffs taken out is flagged`);
    }
  }
  // Survivor: a run played through the engine replays; a doctored score, a situation out of its
  // place in the run, and a run that went on after a blown save are each flagged
  {
    const day = '2026-11-20', M = MODES(), sched = schedOf();
    const rng = R.mulberry32(R.hashSeed('survivor-self-test'));
    const entries = [];
    for (let i = 0; i < 4; i++) {
      const at = M.survivorAt(sched, day, 0, i), p = packOf(at.pack);
      if (!p) break;
      const o = E.createOuting(p.pack, { seed: at.seed, mode: 'survivor', model: p.model });
      // the grade's best call, so the run tends to go on for a few situations
      while (o.status === 'live') E.throwPitch(o, Object.assign({ cell: 12 }, E.bestCall(o) || { type: p.model.types[0] }, { q: 0.9, e: 0.5 + rng() * 0.1 }));
      const res = E.finishOuting(o);
      entries.push({ scenarioId: at.pack, calls: JSON.parse(JSON.stringify(o.calls)), outcome: res.outcome, pitches: res.pitches, score: res.score });
      if (res.outcome !== 'door_shut') break;
    }
    const sum = (es) => ({ saves: es.filter(e => e.outcome === 'door_shut').length, points: es.reduce((a, e) => a + e.score, 0), over: es.some(e => e.outcome !== 'door_shut') });
    const row = Object.assign({ day, run: 0, entries }, sum(entries));
    const ok = replaySurvivor(row);
    say(entries.length > 0 && ok.ok, `survivor: a run of ${entries.length} (${row.saves} saves) replays, every situation in its place` + (ok.ok ? '' : ': ' + ok.why));
    const doctored = JSON.parse(JSON.stringify(row)); doctored.entries[0].score += 40; doctored.points += 40;
    say(!replaySurvivor(doctored).ok, 'survivor: a doctored score is flagged');
    if (entries.length > 1) {
      const swapped = JSON.parse(JSON.stringify(row));
      [swapped.entries[0], swapped.entries[1]] = [swapped.entries[1], swapped.entries[0]];
      say(!replaySurvivor(swapped).ok, 'survivor: a situation out of its place in the run is flagged');
    }
    const other = Object.assign({}, row, { run: 1 });
    say(!replaySurvivor(other).ok, 'survivor: the same entries claimed for another run are flagged');
    const padded = JSON.parse(JSON.stringify(row)); padded.saves += 1;
    say(!replaySurvivor(padded).ok, 'survivor: saves the entries do not make are flagged');
  }
  process.exit(fails ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('check-replays.mjs')) {
  const a = process.argv.slice(2);
  if (a.includes('--self-test')) selfTest();
  else {
    if (!a[0]) { console.log('usage: node shut-the-door/check-replays.mjs rows.json | --self-test'); process.exit(2); }
    const rows = JSON.parse(readFileSync(a[0], 'utf8'));
    let bad = 0;
    const rel = { timed: 0, of: 0, spread: 0 };
    for (const r of rows) {
      if (r.entries != null) {     // a Survivor row (shutdoor_survivor)
        const x = replaySurvivor(r);
        if (!x.ok) { bad++; console.log(`FLAG ${r.user_id || '?'} ${r.day} survivor run ${r.run}: ${x.why}`); }
        continue;
      }
      const x = replayRow(r);
      if (!x.ok) { bad++; console.log(`FLAG ${r.user_id || '?'} ${r.day} ${r.scenario_id}: ${x.why}`); }
      const calls = typeof r.calls === 'string' ? JSON.parse(r.calls) : r.calls;
      const q = releaseOf(calls);
      rel.timed += q.timed; rel.of += q.of; rel.spread += q.spread;
      if (q.timed >= 8 && q.perfect === q.timed) console.log(`note ${r.user_id || '?'} ${r.day} ${r.scenario_id}: every release near perfect (${q.timed} timed)`);
    }
    console.log(`${rows.length} rows replayed, ${bad} flagged`);
    if (rel.of) console.log(`release: ${rel.timed} of ${rel.of} pitches timed` + (rel.timed ? `, mean spread ${(rel.spread / rel.timed).toFixed(3)}x (meter.js is tuned for 1.0)` : ''));
    process.exit(bad ? 1 : 0);
  }
}
