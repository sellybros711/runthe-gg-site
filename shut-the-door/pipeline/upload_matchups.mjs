/* Shut The Door: put the built matchups in their public bucket (supabase/183_shut_the_door_challenges.sql).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node shut-the-door/pipeline/upload_matchups.mjs <out dir> <build>
 *   node shut-the-door/pipeline/upload_matchups.mjs --self-test
 *
 * <out dir> is matchups.js's: <pitcher>/<lineup>.json.gz with its .meta.json. Each file goes to
 * shutdoor-matchups/<build>/<pitcher>/<lineup>.json.gz (an upsert, so a rerun finishes a cut-off
 * upload), then is read back from its PUBLIC url and checked against its meta's sha: what the
 * page will fetch is what was built. Exit code 1 on any file that did not land whole.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';

const BUCKET = 'shutdoor-matchups';
const sha = (b) => createHash('sha256').update(b).digest('hex');

export function listOut(out) {
  const files = [];
  for (const p of readdirSync(out).sort()) {
    if (!existsSync(join(out, p)) || p.startsWith('.')) continue;
    let names;
    try { names = readdirSync(join(out, p)); } catch (e) { continue; }
    for (const f of names.filter(x => x.endsWith('.json.gz')).sort()) {
      const q = f.slice(0, -'.json.gz'.length);
      files.push({ p, q, gz: join(out, p, f), meta: JSON.parse(readFileSync(join(out, p, q + '.meta.json'), 'utf8')) });
    }
  }
  return files;
}

export async function upload(files, build, { url, key, fetchFn = fetch, jobs = 8, log = console.log }) {
  const bad = [];
  let i = 0;
  async function one(f) {
    const path = `${build}/${f.p}/${f.q}.json.gz`;
    const body = readFileSync(f.gz);
    for (let t = 1; t <= 4; t++) {
      try {
        const put = await fetchFn(`${url}/storage/v1/object/${BUCKET}/${path}`, {
          method: 'POST', body,
          headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/gzip', 'x-upsert': 'true', 'cache-control': '31536000' },
        });
        if (!put.ok) throw new Error('upload HTTP ' + put.status + ' ' + (await put.text()).slice(0, 120));
        const got = await fetchFn(`${url}/storage/v1/object/public/${BUCKET}/${path}`);
        if (!got.ok) throw new Error('read back HTTP ' + got.status);
        const text = gunzipSync(Buffer.from(await got.arrayBuffer()));
        if (sha(text) !== f.meta.sha) throw new Error('read back sha differs');
        return;
      } catch (e) {
        if (t === 4) { bad.push(path + ': ' + e.message); log('FAIL ' + path + ': ' + e.message); }
      }
    }
  }
  await Promise.all(Array.from({ length: jobs }, async () => { while (i < files.length) await one(files[i++]); }));
  log(`${files.length - bad.length} of ${files.length} matchups in ${BUCKET}/${build}`);
  return bad;
}

async function selfTest() {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { gzipSync } = await import('zlib');
  const dir = mkdtempSync(join(tmpdir(), 'std-up-'));
  mkdirSync(join(dir, 'std-a'));
  const text = JSON.stringify({ hello: 'pack' });
  writeFileSync(join(dir, 'std-a', 'std-b.json.gz'), gzipSync(text));
  writeFileSync(join(dir, 'std-a', 'std-b.meta.json'), JSON.stringify({ sha: sha(text) }));
  const store = {};
  const fake = async (u, o) => {
    if (o && o.method === 'POST') { store[u.split('/object/' + BUCKET + '/')[1]] = o.body; return { ok: true }; }
    const k = u.split('/object/public/' + BUCKET + '/')[1];
    return store[k] ? { ok: true, arrayBuffer: async () => store[k] } : { ok: false, status: 404 };
  };
  const files = listOut(dir);
  const ok = (await upload(files, 'm0', { url: 'x', key: 'k', fetchFn: fake, log: () => {} })).length === 0;
  const broken = async (u, o) => (o && o.method === 'POST' ? { ok: true } : { ok: true, arrayBuffer: async () => gzipSync('{"other":1}') });
  const caught = (await upload(files, 'm0', { url: 'x', key: 'k', fetchFn: broken, log: () => {} })).length === 1;
  console.log((ok ? 'ok   ' : 'FAIL ') + 'a file uploads and reads back whole');
  console.log((caught ? 'ok   ' : 'FAIL ') + 'a file that reads back other bytes is caught');
  if (!ok || !caught) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--self-test') await selfTest();
  else {
    const [out, build] = process.argv.slice(2);
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE;
    if (!out || !build || !url || !key) { console.error('usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... upload_matchups.mjs <out dir> <build>'); process.exit(2); }
    const bad = await upload(listOut(out), build, { url, key });
    if (bad.length) process.exit(1);
  }
}
