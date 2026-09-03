#!/usr/bin/env node
/* check-outbox.mjs — a finished run must reach the leaderboard, or be kept.
 *
 * The reported symptom was "sometimes my name isn't on the daily board".
 * submit() had exactly one attempt with an 8s ceiling and swallowed every
 * failure, so a phone switching networks mid-request silently lost the score.
 * These tests drive the real board.js against a scripted fetch, because the
 * behaviour that matters is which failures are retried and which are not:
 * re-sending a run the server deliberately refused would spin forever.
 *
 *   node scripts/check-outbox.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const bad = [];
function is(actual, expect, what) {
  if (actual === expect) { pass++; return; }
  fail++; bad.push(`${what}\n      expected ${JSON.stringify(expect)}, got ${JSON.stringify(actual)}`);
}

/* Load board.js into a sandbox with just enough browser to run: a localStorage,
   a scripted fetch, and a Supabase stub that hands it a session. */
function load(fetchImpl) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const listeners = {};
  const win = {
    localStorage,
    fetch: fetchImpl,
    setTimeout, clearTimeout,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    location: { hostname: 'runthe.gg', search: '', pathname: '/arcade/table/' },
    supabase: {
      createClient: () => ({
        auth: {
          onAuthStateChange: () => {},
          getSession: async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1' } } } }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { username: 'tester' } }),
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    },
  };
  win.window = win;
  const doc = { addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); }, hidden: false };
  const src = readFileSync(path.join(ROOT, 'arcade/board.js'), 'utf8');
  new Function('window', 'self', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', 'navigator', src)(
    win, win, doc, localStorage, fetchImpl, setTimeout, clearTimeout, { onLine: true });
  return { B: win.RTG_BOARD, localStorage, listeners };
}

const ok = (body = { id: 1, streak: 3, best_streak: 5 }) => ({
  ok: true, status: 200, json: async () => body,
  text: async () => JSON.stringify(body), headers: { get: () => null },
});
const err = (status, message) => ({
  ok: false, status,
  json: async () => ({ message }),
  text: async () => JSON.stringify({ message }),
  headers: { get: () => null },
});
const hang = () => new Promise(() => {});          // never resolves → timeout path

const RUN = ['table', '2026-08-14', { seconds: 40, mistakes: 0, reveals: 0, runLen: 7 }];
const settle = () => new Promise((r) => setTimeout(r, 30));

/* ---------- the happy path still works ---------- */
{
  let calls = 0;
  const { B, localStorage } = load(async () => { calls++; return ok(); });
  B.boot(); await settle();
  const res = await B.submit(...RUN);
  is(!!res, true, 'success: submit resolves the RPC result');
  is(res && res.streak, 3, 'success: streak comes back');
  is(calls, 1, 'success: exactly one request');
  is(B.pending(), 0, 'success: nothing queued');
  is(localStorage.getItem('rtg:lbq:v1'), null, 'success: outbox untouched');
}

/* ---------- a transient failure is retried, not swallowed ---------- */
{
  let calls = 0;
  const { B } = load(async () => { calls++; return calls === 1 ? err(503, 'upstream') : ok(); });
  B.boot(); await settle();
  const res = await B.submit(...RUN);
  is(calls, 2, 'transient: retried once');
  is(res && res.streak, 3, 'transient: the retry landed, and its result is returned');
  is(B.pending(), 0, 'transient: nothing left queued');
}

/* ---------- a run that never gets an answer is kept ---------- */
{
  let calls = 0;
  const { B, localStorage } = load(async () => { calls++; return hang(); });
  B.boot(); await settle();
  const res = await B.submit(...RUN);
  is(res, null, 'timeout: submit reports failure rather than pretending');
  is(calls, 2, 'timeout: tried twice before giving up');
  is(B.pending(), 1, 'timeout: the run is queued, not lost');
  const q = JSON.parse(localStorage.getItem('rtg:lbq:v1'));
  is(q[0].game, 'table', 'timeout: queued with its game');
  is(q[0].runLen, 7, 'timeout: queued with its score');
}

/* ---------- a refusal is NOT retried ---------- */
/* These are the server's decisions — an unknown game key, a date outside the
 * window, a free account past its daily cap. Queuing them would retry forever. */
for (const [status, msg, label] of [
  [400, 'unknown game', 'unknown game'],
  [400, 'daily ranked limit reached', 'daily cap'],
  [400, 'implausible run', 'implausible run'],
  [403, 'permission denied', 'forbidden'],
]) {
  let calls = 0;
  const { B } = load(async () => { calls++; return err(status, msg); });
  B.boot(); await settle();
  const res = await B.submit(...RUN);
  is(res, null, `refused (${label}): reports failure`);
  is(calls, 1, `refused (${label}): no pointless retry`);
  is(B.pending(), 0, `refused (${label}): not queued`);
}

/* ---------- the queue drains ---------- */
{
  let calls = 0;
  const { B, localStorage } = load(async () => { calls++; return ok(); });
  localStorage.setItem('rtg:lbq:v1', JSON.stringify([
    { game: 'table', date: '2026-08-14', seconds: 40, mistakes: 0, reveals: 0, runLen: 7 },
    { game: 'match', date: '2026-08-14', seconds: 90, mistakes: 1, reveals: 0, runLen: null },
  ]));
  B.boot(); await settle();
  is(calls, 2, 'flush: both queued runs were re-sent on boot');
  is(B.pending(), 0, 'flush: queue emptied');
}

/* ---------- a queued run that is still refused stops being retried ---------- */
{
  const { B, localStorage } = load(async () => err(400, 'unknown game'));
  localStorage.setItem('rtg:lbq:v1', JSON.stringify([
    { game: 'wordsearch', date: '2026-08-14', seconds: 40, mistakes: 0, reveals: 0, runLen: null },
  ]));
  B.boot(); await settle();
  is(B.pending(), 0, 'flush: a permanently-refused run is dropped, not retried forever');
}

/* ---------- a replay supersedes the run queued before it ---------- */
{
  const { B } = load(async () => hang());
  B.boot(); await settle();
  await B.submit('table', '2026-08-14', { seconds: 40, runLen: 7 });
  await B.submit('table', '2026-08-14', { seconds: 30, runLen: 9 });
  is(B.pending(), 1, 'replay: one entry per game+date, not two');
}

console.log(bad.length ? bad.map((b) => '  FAIL ' + b).join('\n') : '');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
