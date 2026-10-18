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

const cache = {};
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
  if (o.status !== 'over') return { ok: false, why: 'the calls do not finish the outing' };
  if (o.calls.length !== calls.length) return { ok: false, why: 'calls after the outing ended' };
  const res = E.finishOuting(o);
  const strip = typeof row.strip === 'string' ? JSON.parse(row.strip) : row.strip;
  const diffs = [];
  if (res.outcome !== row.outcome) diffs.push(`outcome ${row.outcome} replays as ${res.outcome}`);
  if (res.pitches !== row.pitches) diffs.push(`pitches ${row.pitches} replays as ${res.pitches}`);
  if (res.score !== row.score) diffs.push(`score ${row.score} replays as ${res.score}`);
  if (JSON.stringify(res.strip) !== JSON.stringify(strip)) diffs.push('the strip differs');
  if (res.percentile != null && Math.abs(res.percentile - row.percentile) > 1) diffs.push(`percentile ${row.percentile} replays as ${res.percentile}`);
  return { ok: !diffs.length, why: diffs.join('; '), res };
}

function selfTest() {
  const ids = ['std-2025-ws7-yamamoto', 'std-2016-ws7-chapman'];
  let fails = 0;
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
    for (const r of rows) {
      const x = replayRow(r);
      if (!x.ok) { bad++; console.log(`FLAG ${r.user_id || '?'} ${r.day} ${r.scenario_id}: ${x.why}`); }
    }
    console.log(`${rows.length} rows replayed, ${bad} flagged`);
    process.exit(bad ? 1 : 0);
  }
}
