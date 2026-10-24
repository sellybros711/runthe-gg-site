/* The dispatcher's scripts: whose chat is whose, the status file, and how a task reaches its agent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerOf, sessionsFrom } from '../dispatch/lib.mjs';
import { plan } from '../dispatch/plan.mjs';
import { record } from '../dispatch/record.mjs';

const AGENTS = [{ id: 'golf-ui', name: 'Golf UI Agent' }, { id: 'run-the-floor', name: 'Run The Floor Agent' }, { id: 'run-the-floor-art', name: 'Run The Floor Art Agent' },
  { id: 'qa', name: 'QA Agent' }, { id: 'store', name: 'Store Agent' }, { id: '4th-and-what', name: '4th and What Agent' }];

test('a chat is an agent\'s when its title says agent and names it; the longest name wins', () => {
  assert.equal(ownerOf('GOLF UI/UX AGENT', AGENTS), 'golf-ui');
  assert.equal(ownerOf('Run The Floor engine agent', AGENTS), 'run-the-floor');
  assert.equal(ownerOf('Run The Floor Art Agent', AGENTS), 'run-the-floor-art');
  assert.equal(ownerOf('Store Agent for RunThe.GG', AGENTS), 'store');
  assert.equal(ownerOf('4th and What Agent setup', AGENTS), '4th-and-what');
  assert.equal(ownerOf('Run The Floor career mode', AGENTS), null, 'no "agent" in the title: a builder, not an agent');
  assert.equal(ownerOf('Fix the QA flake', AGENTS), null);
});

const S = (id, title, bucket, updated, branch) => ({ id, title, session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_' + bucket.toUpperCase(), created_at: updated, updated_at: updated,
  external_metadata: { current_branches: branch ? { '': branch } : {}, task_summary: 'doing ' + id } });
const NOW = Date.parse('2026-10-17T20:00:00Z');
const TEXT = 'Saved output:\n<other-session nonce="x">\n' + JSON.stringify({ ccr: { data: [
  S('s1', 'GOLF UI/UX AGENT', 'working', '2026-10-17T19:00:00Z', 'claude/golf-ui-home'),
  S('s2', 'QA Agent', 'completed', '2026-09-01T00:00:00Z'),
  S('s3', 'Shut The Door game build', 'review_ready', '2026-10-17T18:00:00Z', 'claude/shut-the-door'),
  { ...S('s4', 'Store Agent', 'completed', '2026-10-17T10:00:00Z'), session_status: 'SESSION_STATUS_ARCHIVED' }] } }) + '\n</other-session>\ntrailing text';

test('list_sessions\' answer is read however it was saved', () => {
  const s = sessionsFrom(TEXT);
  assert.equal(s.length, 4); assert.deepEqual(s[0], { id: 's1', title: 'GOLF UI/UX AGENT', status: 'idle', bucket: 'working', summary: 'doing s1', branch: 'claude/golf-ui-home', created: '2026-10-17T19:00:00Z', updated: '2026-10-17T19:00:00Z' });
});

test('the status file: recent chats, whose they are, and how long each has been at it', () => {
  const prev = { sessions: [{ id: 's1', bucket: 'working', branch: 'claude/golf-ui-home', since: '2026-10-17T15:00:00Z' }] };
  const { status } = plan({ sessionsText: TEXT, prev, agents: AGENTS, queued: [], now: NOW });
  assert.deepEqual(status.sessions.map(s => [s.id, s.agent]), [['s1', 'golf-ui'], ['s3', null]], 'archived and month old chats left out');
  assert.equal(status.sessions[0].since, '2026-10-17T15:00:00Z', 'same state and branch: still at it since then');
  assert.equal(plan({ sessionsText: TEXT, prev: { sessions: [{ id: 's1', bucket: 'blocked', since: 'x' }] }, agents: AGENTS, queued: [], now: NOW }).status.sessions[0].since, '2026-10-17T19:00:00Z');
});

test('a task goes to the agent\'s chat; with no chat in 30 days it starts one; an unknown agent fails', () => {
  const q = [{ id: 't1', agent: 'golf-ui', text: 'Tidy the menu', place: { game: 'golf', layer: 'ui' }, by: 'sel' }, { id: 't2', agent: 'qa', text: 'Sweep golf', by: 'sel' }, { id: 't3', agent: 'ghost', text: 'x' }];
  const { lines } = plan({ sessionsText: TEXT, prev: null, agents: AGENTS, queued: q, now: NOW });
  assert.equal(lines[0].action, 'send'); assert.equal(lines[0].session, 's1');
  assert.match(lines[0].message, /^A task from sel, sent through the Sky World:\n\nTidy the menu\n\nWhere: golf · ui\./);
  assert.match(lines[0].message, /Tasks from the Sky World/);
  assert.equal(lines[1].action, 'create'); assert.equal(lines[1].title, 'QA Agent'); assert.match(lines[1].prompt, /\.claude\/agents\/qa\.md[\s\S]*Sweep golf/);
  assert.deepEqual(lines[2], { task: 't3', action: 'fail', note: 'no such agent' });
  const ans = plan({ sessionsText: TEXT, prev: null, agents: AGENTS, queued: [{ id: 't4', agent: 'golf-ui', kind: 'answer', text: 'Yes, the left menu.', by: 'sel' }], now: NOW }).lines[0];
  assert.match(ans.message, /^An answer from sel to what you asked, sent through the Sky World:\n\nYes, the left menu\./);
});

test('recording moves a task to the top of the log, which keeps the newest 200', () => {
  const log = record(Array.from({ length: 200 }, (_, i) => ({ id: 'old' + i })), { id: 't1', agent: 'qa' }, 'delivered', 's9', null, NOW);
  assert.equal(log.length, 200); assert.deepEqual(log[0], { id: 't1', agent: 'qa', state: 'delivered', session: 's9', note: null, delivered: '2026-10-17T20:00:00.000Z' });
});
