/* Shut The Door: replay stored daily results and flag any the calls do not produce.
 *
 *   node shut-the-door/check-replays.mjs rows.json     rows exported from shutdoor_outings
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

export function replayRow(row) {
  const p = packOf(row.scenario_id);
  if (!p) return { ok: false, why: 'no pack ' + row.scenario_id };
  const calls = typeof row.calls === 'string' ? JSON.parse(row.calls) : row.calls;
  const o = E.replay(p.pack, E.seedFor('daily', row.day), calls, { mode: 'daily', model: p.model });
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
    // rules 2: the row's calls carry r 2; the same calls without it replay under rules 1, a different outing
    const noR = Object.assign({}, row, { calls: row.calls.map(c => { const x = Object.assign({}, c); delete x.r; return x; }) });
    const c2 = replayRow(noR);
    const okR = row.calls.every(c => c.r === G.RULES) && !c2.ok;
    console.log((okR ? 'ok   ' : 'FAIL ') + `${id}: a rules 2 row carries r 2, and with r taken out it is flagged`);
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
      while (o.status === 'live') E.throwPitch(o, { type: p.model.types[Math.floor(rng() * p.model.types.length)], cell: Math.floor(rng() * 25), q: Math.round(rng() * 100) / 100, e: Math.round(rng() * 4) / 4 });
      const res = E.finishOuting(o);
      const row = { day, scenario_id: id, calls: JSON.parse(JSON.stringify(o.calls)), outcome: res.outcome, pitches: res.pitches, score: res.score, percentile: res.percentile, strip: res.strip };
      const stripped = Object.assign({}, row, { calls: row.calls.map(c => { const x = Object.assign({}, c); delete x.e; return x; }) });
      if (!replayRow(stripped).ok) pair = { row, stripped };
    }
    say(!!pair, `${id}: an outing whose effort changed what happened exists`);
    if (pair) {
      say(replayRow(pair.row).ok && pair.row.calls.every(c => typeof c.e === 'number'), `${id}: a row with e replays exactly (${pair.row.pitches} pitches)`);
      say(!replayRow(pair.stripped).ok, `${id}: the same row with its e taken out is flagged`);
    }
    const noQ = { day: '2026-12-01', scenario_id: id, calls: [{ type: p.model.types[0], cell: 12, e: 1, r: 2 }], outcome: 'door_shut', pitches: 1, score: 0, percentile: 0, strip: ['green'] };
    let refused = false;
    try { refused = !replayRow(noQ).ok; } catch (e) { refused = true; }
    say(refused, `${id}: a row with an effort and no release is refused`);
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
