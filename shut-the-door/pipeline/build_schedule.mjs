/* data/schedule.json: each day to a pack and a daily number.
 *
 *   node shut-the-door/pipeline/build_schedule.mjs [--days 400]
 *
 * Daily #1 is contract.js's EPOCH (the lead sets it). The scenarios rotate
 * in scenarios/scenarios.json order, day number mod their count. New ones go
 * on the end, so every day already served keeps its pack: days 1-10 were the
 * first ten, and since 2026-10-30 there are 30. Past the last listed day
 * api.js keeps rotating by the same rule, so the schedule never runs out.
 *
 * previewRotation is the rotation the preview days before the epoch were
 * served from (the first ten). api.js walks it backwards for those days, so
 * a longer rotation never moves a day that was already played.
 *
 * Each pack also carries a card (title, pitcher, team, year, hand, the
 * situation, real or proxy) for a screen that shows it without its pack.
 *
 * Each pack carries a `v` for its URL (packs/<id>.json?v=N). It is bumped only
 * when the pack's bytes changed since the last schedule (the sha1 is kept
 * beside it), so rebuilding an unchanged pack moves no cache.
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const C = require(join(GAME, 'contract.js'));

const args = process.argv.slice(2);
const days = args.includes('--days') ? +args[args.indexOf('--days') + 1] : 400;
const spec = JSON.parse(readFileSync(join(GAME, 'scenarios', 'scenarios.json'), 'utf8')).scenarios;
const out = join(GAME, 'data', 'schedule.json');
const old = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { packs: {} };

const packs = {};
for (const s of spec) {
  const file = `packs/${s.id}.json`;
  const path = join(GAME, 'data', file);
  if (!existsSync(path)) throw new Error('missing pack ' + path);
  const sha = createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 12);
  const prev = old.packs && old.packs[s.id];
  const v = prev ? (prev.sha === sha ? prev.v : prev.v + 1) : 1;
  // a card for a screen that shows a situation without loading its pack (the vote, Survivor's
  // list): the facts the home screen shows before play. Never the reveal
  const sc = JSON.parse(readFileSync(path, 'utf8')).scenario;
  const card = {
    title: sc.title, pitcher: sc.pitcher.name, team: sc.pitcher.team, year: sc.pitcher.year, throws: sc.pitcher.throws,
    situation: { inning: sc.situation.inning, half: sc.situation.half, outs: sc.situation.outs, bases: sc.situation.bases,
      score: sc.situation.score }, resolution: sc.resolution,
  };
  packs[s.id] = { file, v, sha, card };
}
const rotation = spec.map(s => s.id);
// the previews were served from the first rotation; keep it for them once and for all
const previewRotation = old.previewRotation || old.rotation || rotation;
const sched = {};
const start = Date.UTC(+C.EPOCH.slice(0, 4), +C.EPOCH.slice(5, 7) - 1, +C.EPOCH.slice(8, 10));
for (let i = 0; i < days; i++) {
  const day = new Date(start + i * 86400000).toISOString().slice(0, 10);
  const number = C.dayNumberOf(day);
  sched[day] = { pack: rotation[(number - 1) % rotation.length], number };
}
writeFileSync(out, JSON.stringify({ v: 1, epoch: C.EPOCH, rotation, previewRotation, packs, days: sched }) + '\n');
console.log(`schedule: ${days} days from ${C.EPOCH}, ${rotation.length} packs: ` +
  Object.entries(packs).map(([k, p]) => `${k} v${p.v}`).join(', '));
