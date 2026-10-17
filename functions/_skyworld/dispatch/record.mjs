#!/usr/bin/env node
/* The dispatcher's second step, once per task: moves it from tasks/queued/ to the top of tasks/log.json.
 *
 *   node functions/_skyworld/dispatch/record.mjs <vault-status-checkout> <task-id> <delivered|started|failed> [session-id] [note]
 */
import fs from 'node:fs';
import path from 'node:path';

export function record(log, task, state, session, note, now = Date.now()){
  return [{ ...task, state, session: session || null, note: note || null, delivered: new Date(now).toISOString() }].concat(log || []).slice(0, 200); }

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [dir, id, state, session, note] = process.argv.slice(2);
  if (!/^[\w-]+$/.test(id || '') || !['delivered', 'started', 'failed'].includes(state)) { console.error('usage: record.mjs <dir> <task-id> <delivered|started|failed> [session] [note]'); process.exit(2); }
  const q = path.join(dir, 'tasks/queued', id + '.json'), lp = path.join(dir, 'tasks/log.json');
  const task = JSON.parse(fs.readFileSync(q, 'utf8')); let log = []; try { log = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch (e) {}
  fs.writeFileSync(lp, JSON.stringify(record(log, task, state, session, note), null, 1) + '\n'); fs.unlinkSync(q);
  console.log(state + ' ' + id);
}
