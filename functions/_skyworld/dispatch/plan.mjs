#!/usr/bin/env node
/* The dispatcher's first step. Reads list_sessions' answer (saved to a file), writes the Sky World's status
 * file, and prints what to deliver: one JSON line per queued task.
 *
 *   node functions/_skyworld/dispatch/plan.mjs <sessions-file> <vault-status-checkout> <site-checkout> <vault-main-checkout>
 *
 * Writes <vault-status-checkout>/status/agents.json, and status/waiting.json: the chats waiting on the owner,
 * whose last words the dispatcher reads for dispatch/asks.mjs. Prints lines of
 *   { "task": id, "action": "send", "session": id, "message": "..." }
 *   { "task": id, "action": "create", "title": "...", "prompt": "..." }
 * A chat stays an agent's for 30 days after it was last used; after that a task starts a new chat. */
import fs from 'node:fs';
import path from 'node:path';
import { agentsFrom, ownerOf, sessionsFrom } from './lib.mjs';

export function plan({ sessionsText, prev, agents, queued, now = Date.now() }){
  const all = sessionsFrom(sessionsText).filter(s => s.status !== 'archived');
  const recent = all.filter(s => now - Date.parse(s.updated) < 14 * 864e5);
  const before = Object.fromEntries(((prev && prev.sessions) || []).map(s => [s.id, s]));
  const sessions = recent.map(s => { const p = before[s.id], same = p && p.bucket === s.bucket && p.branch === s.branch;
    return { id: s.id, agent: ownerOf(s.title, agents), title: s.title, bucket: s.bucket, summary: s.summary, branch: s.branch, created: s.created, updated: s.updated,
      since: same ? p.since : s.updated }; });
  const status = { asOf: new Date(now).toISOString(), sessions };
  const lines = [];
  for (const t of queued) {
    const a = agents.find(x => x.id === t.agent); if (!a) { lines.push({ task: t.id, action: 'fail', note: 'no such agent' }); continue; }
    const chat = all.filter(s => ownerOf(s.title, agents) === a.id && now - Date.parse(s.updated) < 30 * 864e5).sort((x, y) => String(y.updated).localeCompare(String(x.updated)))[0];
    const where = t.place && t.place.game ? '\n\nWhere: ' + t.place.game + (t.place.layer ? ' · ' + t.place.layer : '') + '.' : '';
    const message = (t.kind === 'answer' ? 'An answer from ' + (t.by || 'a tester') + ' to what you asked, sent through the Sky World:\n\n' : 'A task from ' + (t.by || 'a tester') + ', sent through the Sky World:\n\n') + t.text + where +
      '\n\nThis came through the Sky World tasking queue (agents/README.md, "Tasks from the Sky World"). Do it if it is your job. If it belongs to another agent, say which here and stop.';
    if (chat) lines.push({ task: t.id, action: 'send', session: chat.id, message });
    else lines.push({ task: t.id, action: 'create', title: a.name, prompt: 'You are the ' + a.name + ' for Run The Games. This chat is yours and does that job only. Read .claude/agents/' + a.id +
      '.md in the site repo and your spec in the vault (sellybros711/runthe-gg-kb, agents/' + a.id + '/; attach it with add_repo if it is not cloned), then:\n\n' + message });
  }
  return { status, lines };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [sf, statusDir, site, vault] = process.argv.slice(2);
  const read = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
  const qd = path.join(statusDir, 'tasks/queued');
  const queued = (fs.existsSync(qd) ? fs.readdirSync(qd) : []).filter(f => f.endsWith('.json')).sort().map(f => read(path.join(qd, f))).filter(Boolean);
  const out = plan({ sessionsText: fs.readFileSync(sf, 'utf8'), prev: read(path.join(statusDir, 'status/agents.json')), agents: agentsFrom(site, vault), queued });
  fs.mkdirSync(path.join(statusDir, 'status'), { recursive: true });
  fs.writeFileSync(path.join(statusDir, 'status/agents.json'), JSON.stringify(out.status, null, 1) + '\n');
  for (const l of out.lines) console.log(JSON.stringify(l));
  fs.writeFileSync(path.join(statusDir, 'status/waiting.json'), JSON.stringify(out.status.sessions.filter(s => ['blocked', 'review_ready'].includes(s.bucket)).map(s => s.id)) + '\n');
  console.error(out.status.sessions.length + ' chats, ' + out.status.sessions.filter(s => s.agent).length + ' of them agents\'; ' + out.lines.length + ' tasks to deliver');
}
