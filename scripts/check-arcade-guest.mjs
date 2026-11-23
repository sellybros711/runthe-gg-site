/* check-arcade-guest.mjs: /api/arcade-guest, the server half of a guest's run
 * on the daily board (185). Runs the real Function in Node with Supabase faked.
 *
 *   node scripts/check-arcade-guest.mjs
 *
 * The SQL half (the cap, the refusals, the claim) is
 * supabase/test/arcade_guest_server_test.sql against a real Postgres.
 */
import { onRequestPost } from '../functions/api/arcade-guest.js';
import { guestId, ipKey, readRun } from '../functions/_arcadeguest/core.js';

let fails = 0;
const ok = (c, what, detail) => { if (c) console.log('  ok   ' + what); else { fails++; console.log('  FAIL ' + what + (detail ? '\n       ' + detail : '')); } };

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE: 'service-secret', SUPABASE_ANON: 'anon' };
const DEVICE = '11112222-3333-4444-8555-666677778888';
let calls = [], rpcAnswer = { status: 200, body: { id: 7 } };
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  if (/\/auth\/v1\/user$/.test(url)) {
    const a = (init.headers.Authorization || '').slice(7);
    return new Response(JSON.stringify(a === 'acct-jwt' ? { id: 'cccccccc-3333-4333-8333-333333333333' } : {}), { status: a === 'acct-jwt' ? 200 : 401 });
  }
  return new Response(JSON.stringify(rpcAnswer.body), { status: rpcAnswer.status });
};
function req(body, headers = {}) {
  return new Request('https://runthe.gg/api/arcade-guest', { method: 'POST',
    headers: Object.assign({ Origin: 'https://runthe.gg', 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, headers),
    body: typeof body === 'string' ? body : JSON.stringify(body) });
}
const run = (b) => Object.assign({ device: DEVICE, game: 'almamater', date: '2026-11-23', seconds: 60, mistakes: 0, reveals: 0, runLen: 7 }, b);

// the ids
const a = await guestId('k1', DEVICE), b = await guestId('k1', DEVICE), c = await guestId('k2', DEVICE);
ok(a === b && a !== c && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a), 'a guest id is a v4 uuid, the same for one device, different under another secret');
ok((await ipKey('k1', '1.2.3.4')).length === 32 && !(await ipKey('k1', '1.2.3.4')).includes('1.2.3.4'), 'the IP is keyed, never sent raw');
ok(readRun(run({ game: 'oddone' })).error === 'not a free game' && readRun(run({ device: 'x' })).error === 'bad device' && readRun(run({ seconds: 1.5 })).error === 'bad time', 'the body is checked before the database');

// a good run
calls = []; rpcAnswer = { status: 200, body: { id: 7 } };
let r = await onRequestPost({ request: req(run()), env });
let j = await r.json();
const sent = calls[0] && JSON.parse(calls[0].init.body);
ok(r.status === 200 && j.uid === await guestId('service-secret', DEVICE), 'a run returns the board id derived from the device', JSON.stringify(j));
ok(calls.length === 1 && /rpc\/arcade_guest_submit$/.test(calls[0].url) && calls[0].init.headers.Authorization === 'Bearer service-secret', 'it calls arcade_guest_submit with the service role');
ok(sent && sent.p_guest === j.uid && sent.p_ip_key === await ipKey('service-secret', '203.0.113.9') && sent.p_game === 'almamater' && sent.p_run_len === 7 && !('device' in sent),
  'with the derived id, the keyed IP and the run, and never the device id', JSON.stringify(sent));

// refusals
calls = [];
r = await onRequestPost({ request: req(run({ game: 'rankit' })), env });
ok(r.status === 400 && calls.length === 0, 'a card game is refused before the database');
r = await onRequestPost({ request: req(run(), { Origin: 'https://evil.example' }), env });
ok(r.status === 403 && calls.length === 0, 'another site cannot post');
r = await onRequestPost({ request: req('x'.repeat(3000)), env });
ok(r.status === 413, 'a large body is refused');
rpcAnswer = { status: 400, body: { message: 'guest limit' } };
r = await onRequestPost({ request: req(run()), env });
ok(r.status === 429, 'the IP cap comes back as 429');
rpcAnswer = { status: 400, body: { message: 'not a guest' } };
r = await onRequestPost({ request: req(run()), env });
ok(r.status === 400, 'an account id refused by the database comes back as 400');
r = await onRequestPost({ request: req(run()), env: {} });
ok(r.status === 503, 'unconfigured, it refuses rather than guess');

// the claim
calls = []; rpcAnswer = { status: 200, body: { moved: 2 } };
r = await onRequestPost({ request: req({ action: 'claim', device: DEVICE }), env });
ok(r.status === 401 && !calls.some(x => /rpc\//.test(x.url)), 'a claim with no account is refused');
r = await onRequestPost({ request: req({ action: 'claim', device: DEVICE }, { Authorization: 'Bearer acct-jwt' }), env });
j = await r.json();
const cl = calls.find(x => /rpc\/arcade_guest_claim$/.test(x.url));
const cb = cl && JSON.parse(cl.init.body);
ok(r.status === 200 && j.moved === 2 && cb && cb.p_account === 'cccccccc-3333-4333-8333-333333333333' && cb.p_guest === await guestId('service-secret', DEVICE),
  'a signed-in claim moves the device\'s guest onto the verified account', JSON.stringify(cb));

console.log(fails ? `\n${fails} problem(s)` : '\narcade guest server ok');
process.exit(fails ? 1 : 0);
