/* What needs the owner: the questions chats are waiting on, and the Merge button's rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mayMerge } from '../merge.js';
import { withAsks, trimAsk } from '../dispatch/asks.mjs';
import { handle } from '../api.js';

const PR = { state: 'open', draft: false, head: { sha: 'a'.repeat(40), ref: 'claude/x' }, body: 'Fixes.\n\nAgent: golf-course\n', mergeable_state: 'clean' };
const GREEN = [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }];

test('Merge: only an open, green, clean agent PR, at the commit the page showed', () => {
  assert.deepEqual(mayMerge(PR, GREEN, ['golf-course'], [], 'a'.repeat(40)), { ok: true });
  assert.deepEqual(mayMerge({ ...PR, body: '' }, GREEN, ['golf-course'], ['claude/x'], null), { ok: true }, 'its branch is an agent chat\'s');
  for (const [pr, runs, why] of [[{ ...PR, state: 'closed' }, GREEN, 'not_open'], [{ ...PR, draft: true }, GREEN, 'draft'], [{ ...PR, body: '' }, GREEN, 'not_an_agents_pr'],
    [{ ...PR, body: 'Agent: nobody' }, GREEN, 'not_an_agents_pr'], [PR, [], 'checks_running'], [PR, [{ status: 'in_progress' }], 'checks_running'],
    [PR, [{ status: 'completed', conclusion: 'failure' }], 'checks_failing'], [{ ...PR, mergeable_state: 'dirty' }, GREEN, 'not_clean'], [{ ...PR, mergeable_state: 'blocked' }, GREEN, 'not_clean']])
    assert.deepEqual(mayMerge(pr, runs, ['golf-course'], [], null), { ok: false, why }, why);
  assert.deepEqual(mayMerge(PR, GREEN, ['golf-course'], [], 'b'.repeat(40)), { ok: false, why: 'changed' }, 'a push since the page loaded');
});

const deps = (role, more = {}) => ({ db: { role: async () => role, name: async () => 'sel' }, canMerge: () => true, merge: async (n, sha) => ({ ok: true, n, sha }), ...more });
const SHA = 'c'.repeat(40);
test('Merge is for an admin; a tester is told so; a stranger gets the 404', async () => {
  assert.deepEqual(await handle({ method: 'POST', path: 'merge', cookieUid: 'u', body: { pr: 600, sha: SHA } }, deps('admin')), { status: 200, body: { ok: true, n: 600, sha: SHA } });
  assert.deepEqual(await handle({ method: 'POST', path: 'merge', cookieUid: 'u', body: { pr: 600, sha: SHA } }, deps('tester')), { status: 403, body: { error: 'admins_only' } });
  for (const role of [null, 'player']) assert.deepEqual(await handle({ method: 'POST', path: 'merge', cookieUid: 'u', body: { pr: 600, sha: SHA } }, deps(role)), { status: 404, body: { error: 'not_found' } });
  assert.equal((await handle({ method: 'POST', path: 'merge', cookieUid: 'u', body: { pr: 'x', sha: SHA } }, deps('admin'))).status, 400);
  assert.equal((await handle({ method: 'POST', path: 'merge', cookieUid: 'u', body: { pr: 600, sha: 'short' } }, deps('admin'))).status, 400);
  assert.deepEqual(await handle({ method: 'POST', path: 'merge', cookieUid: 'u', body: { pr: 600, sha: SHA } }, deps('admin', { canMerge: () => false })), { status: 503, body: { error: 'merge_off' } });
  assert.equal((await handle({ method: 'GET', path: 'merge', cookieUid: 'u' }, deps('admin'))).status, 404, 'merging is a POST');
  assert.deepEqual(await handle({ method: 'GET', path: 'whoami', cookieUid: 'u' }, deps('tester')), { status: 200, body: { role: 'tester' } });
  assert.equal((await handle({ method: 'GET', path: 'whoami', cookieUid: null }, deps('admin'))).status, 404);
});

test('a waiting chat carries its question; one at work carries none', () => {
  const st = { asOf: 'x', sessions: [{ id: 'a', bucket: 'blocked' }, { id: 'b', bucket: 'working' }, { id: 'c', bucket: 'review_ready' }] };
  const out = withAsks(st, { a: 'Which hole first?', b: 'not asked', c: 'x'.repeat(2000) });
  assert.equal(out.sessions[0].ask, 'Which hole first?'); assert.equal(out.sessions[1].ask, null);
  assert.equal(out.sessions[2].ask.length, 1203); assert.match(out.sessions[2].ask, /^\.\.\./);
  assert.equal(trimAsk('  hi  '), 'hi');
});
