#!/usr/bin/env node
/*
 * Shut The Door: delete every ump call file that no clip row names (supabase/175).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node shut-the-door/ump-purge.mjs
 *   node shut-the-door/ump-purge.mjs --self-test      offline, against a fake Supabase
 *
 * Hourly in .github/workflows/shut-the-door-ump-purge.yml. A clip row goes when its account goes
 * (the user_id cascade) and a rejected row drops its path (175's trigger), so a file with no row is
 * a file nobody may keep. SQL cannot remove it: a delete from storage.objects leaves the file in the
 * backing store (newer Supabase refuses it outright), so this asks the database which files are
 * orphaned (shutdoor_ump_orphans, service role only) and removes them through the Storage API,
 * the same call supabase-js remove() makes. Then it asks again: a file it asked to delete that is
 * still listed fails the run, so a red run means a voice is still on disk.
 *
 * It logs counts, never paths: a path starts with the player's user id.
 */

import fs from 'node:fs';

export const BUCKET = 'shutdoor-ump-voices';
const BATCH = 100;      // names per Storage API delete
const ROUNDS = 20;      // at most 20 x 1000 files a run; the next hour takes the rest

export async function purge({ url, key, fetch: f = globalThis.fetch, log = console.log }) {
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE are both needed');
  const base = url.replace(/\/+$/, '');
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  async function orphans() {
    const r = await f(base + '/rest/v1/rpc/shutdoor_ump_orphans', { method: 'POST', headers: H, body: JSON.stringify({ p_limit: 1000 }) });
    const text = await r.text();
    if (!r.ok) throw new Error('shutdoor_ump_orphans: HTTP ' + r.status + ' (has supabase/175 been run?) ' + text.slice(0, 200));
    const list = JSON.parse(text);
    if (!Array.isArray(list)) throw new Error('shutdoor_ump_orphans: not a list');
    return list.filter((x) => typeof x === 'string' && x);
  }
  async function remove(names) {
    const r = await f(base + '/storage/v1/object/' + BUCKET, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: names }) });
    if (!r.ok) throw new Error('storage delete: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const out = await r.json().catch(() => null);
    return Array.isArray(out) ? out.length : 0;
  }

  let found = 0, deleted = 0, asked = new Set();
  for (let round = 0; round < ROUNDS; round++) {
    const list = await orphans();
    const stuck = list.filter((n) => asked.has(n));
    if (stuck.length) throw new Error(stuck.length + ' file(s) still in the bucket after the Storage API was asked to delete them');
    if (!list.length) break;
    found += list.length;
    for (let i = 0; i < list.length; i += BATCH) {
      const part = list.slice(i, i + BATCH);
      part.forEach((n) => asked.add(n));
      deleted += await remove(part);
    }
    if (round === ROUNDS - 1) {
      const left = await orphans();
      if (left.some((n) => asked.has(n))) throw new Error('files still in the bucket after the Storage API was asked to delete them');
      if (left.length) log(left.length + ' more for the next run');
    }
  }
  log(found ? 'orphaned files: ' + found + ', deleted: ' + deleted + ', none left' : 'nothing to delete');
  return { found, deleted };
}

/* ---- the self-test: a fake database and bucket ---------------------------- */

function fake(objects, rows, { failDelete = false, keep = new Set() } = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });
  const fn = async (u, o) => {
    calls.push([o.method, u, o.headers.Authorization]);
    if (u.endsWith('/rest/v1/rpc/shutdoor_ump_orphans')) {
      const lim = JSON.parse(o.body).p_limit;
      return res(200, [...objects].filter((n) => !rows.has(n)).slice(0, lim));
    }
    if (u.endsWith('/storage/v1/object/' + BUCKET) && o.method === 'DELETE') {
      if (failDelete) return res(500, { message: 'down' });
      const names = JSON.parse(o.body).prefixes;
      const gone = names.filter((n) => objects.has(n) && !keep.has(n));
      gone.forEach((n) => objects.delete(n));
      return res(200, gone.map((name) => ({ name })));
    }
    return res(404, { message: 'no route' });
  };
  return { fn, calls };
}

async function selfTest() {
  let fails = 0;
  const ok = (c, what) => { console.log((c ? 'ok    ' : 'FAIL  ') + what); if (!c) fails++; };
  const quiet = () => {};
  const throws = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

  {
    const objects = new Set(['u1/a.webm', 'u1/b.webm', 'u2/c.m4a']);
    const rows = new Set(['u1/a.webm']);
    const F = fake(objects, rows);
    const r = await purge({ url: 'https://x.supabase.co/', key: 'k', fetch: F.fn, log: quiet });
    ok(r.found === 2 && r.deleted === 2 && objects.size === 1 && objects.has('u1/a.webm'), 'the two files no row names go, the named one stays');
    ok(F.calls.every((c) => c[2] === 'Bearer k') && F.calls.some((c) => c[0] === 'DELETE'), 'every call carries the service role, the delete is the Storage API');
  }
  {
    const objects = new Set(), rows = new Set();
    for (let i = 0; i < 2500; i++) objects.add('u/' + i + '.webm');
    const F = fake(objects, rows);
    const r = await purge({ url: 'https://x', key: 'k', fetch: F.fn, log: quiet });
    ok(r.found === 2500 && objects.size === 0 && F.calls.filter((c) => c[0] === 'DELETE').length === 25, '2,500 orphans go in batches of 100 over three lists');
  }
  {
    const F = fake(new Set(['u/a.webm']), new Set(['u/a.webm']));
    const r = await purge({ url: 'https://x', key: 'k', fetch: F.fn, log: quiet });
    ok(r.found === 0 && !F.calls.some((c) => c[0] === 'DELETE'), 'nothing orphaned: nothing deleted');
  }
  {
    const F = fake(new Set(['u/a.webm', 'u/b.webm']), new Set(), { keep: new Set(['u/b.webm']) });
    ok(/still in the bucket/.test(await throws(purge({ url: 'https://x', key: 'k', fetch: F.fn, log: quiet }))), 'a file the Storage API kept fails the run');
  }
  {
    const F = fake(new Set(['u/a.webm']), new Set(), { failDelete: true });
    ok(/HTTP 500/.test(await throws(purge({ url: 'https://x', key: 'k', fetch: F.fn, log: quiet }))), 'a failed delete fails the run');
  }
  {
    const F = { fn: async () => ({ ok: false, status: 404, text: async () => '{"code":"PGRST202"}' }) };
    ok(/175/.test(await throws(purge({ url: 'https://x', key: 'k', fetch: F.fn, log: quiet }))), 'no 175 yet: the run fails and says so');
    ok(/both needed/.test(await throws(purge({ url: '', key: 'k', fetch: F.fn, log: quiet }))), 'no secrets: the run fails');
  }
  {
    const lines = [];
    const F = fake(new Set(['00000000-0000-0000-0000-0000000000c1/a.webm']), new Set());
    await purge({ url: 'https://x', key: 'k', fetch: F.fn, log: (s) => lines.push(s) });
    ok(lines.length && !lines.join(' ').includes('0000000000c1'), 'the log carries counts, never a user id');
  }
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
}

const main = import.meta.url === new URL('file://' + process.argv[1]).href;
if (main) {
  if (process.argv.includes('--self-test')) selfTest();
  else purge({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE })
    .then((r) => {
      if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Ump purge\n\nOrphaned files found: ' + r.found + '. Deleted: ' + r.deleted + '.\n');
      }
    })
    .catch((e) => { console.error('::error::' + e.message); process.exit(1); });
}
