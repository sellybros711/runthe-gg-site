#!/usr/bin/env node
/* The dispatcher's third step: what each chat that waits on the owner is asking. The dispatcher reads the last
 * thing each such chat said (list_events, its last assistant text) into a JSON file { "<session id>": "<text>" },
 * and this puts it on that chat in the status file, so the Sky World can show the question and an answer box.
 *
 *   node functions/_skyworld/dispatch/asks.mjs <vault-status-checkout> <asks-file>
 */
import fs from 'node:fs';
import path from 'node:path';

export const WAITING = ['blocked', 'review_ready'];
// the question, kept short: the last 1200 characters, which is where a chat puts what it needs
export function trimAsk(t){ t = String(t || '').trim(); return t.length > 1200 ? '...' + t.slice(-1200) : t; }
export function withAsks(status, asks){
  return { ...status, sessions: (status.sessions || []).map(s => WAITING.includes(s.bucket) && asks[s.id] ? { ...s, ask: trimAsk(asks[s.id]) } : { ...s, ask: WAITING.includes(s.bucket) ? s.ask || null : null }) }; }

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [dir, file] = process.argv.slice(2), sp = path.join(dir, 'status/agents.json');
  const status = JSON.parse(fs.readFileSync(sp, 'utf8')); let asks = {}; try { asks = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  fs.writeFileSync(sp, JSON.stringify(withAsks(status, asks), null, 1) + '\n');
  console.log(Object.keys(asks).length + ' questions');
}
