#!/usr/bin/env node
/* Run The Pitch: a guest plays the Daily Challenge (supabase/189, /api/pitch-guest).
 *
 *   node soccer/check-guest-daily.mjs            the Function, then a guest's Daily in Chromium
 *   node soccer/check-guest-daily.mjs --quick    the Function only, no browser
 *
 * The Function (the real functions/api/pitch-guest.js, Supabase faked):
 *   - a guest id is a v4 uuid derived from the device under a server secret, its own key space
 *   - the IP is keyed, never sent raw
 *   - the body is checked before the database, and NO SCORE is ever passed on
 *   - a guest row's id comes back negative (its id on daily_board)
 *   - the cap answers 429, another origin 403, a claim without a sign-in 401
 * The page (Chromium, the Function served for real, the database faked behind it):
 *   - a guest starts the Daily with no account prompt
 *   - the result posts eleven ids and no score, shows the generated name, the rank and the ask
 *     for an account; the home button reads Played; a replay says the first attempt counted
 *   - a guest row on the board carries a "guest" tag
 *   - signing in claims the guest's days with the account's token, once
 *   - with the Function missing or 189 not run, a guest still plays and sees a rank
 *
 * The SQL half is supabase/test/soccer_daily_guest_test.sql against a real Postgres.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { onRequestPost } from '../functions/api/pitch-guest.js';
import { guestId, ipKey, readDaily } from '../functions/_pitchguest/core.js';
import { guestId as arcadeGuestId } from '../functions/_arcadeguest/core.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let fails = 0;
const ok = (c, what, detail) => { console.log((c ? 'ok   ' : 'FAIL ') + what + (!c && detail ? '\n       ' + detail : '')); if (!c) fails++; };

// ---------- the Function ----------
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE: 'service-secret', SUPABASE_ANON: 'anon' };
const DEVICE = '11112222-3333-4444-8555-666677778888';
const ACCT = 'cccccccc-3333-4333-8333-333333333333';
const IDS = ['ARG_1986_a', 'ARG_1986_b', 'BRA_1970_c', 'BRA_1970_d', 'FRA_1998_e', 'FRA_1998_f', 'GER_2014_g', 'ITA_1982_h', 'ESP_2010_i', 'NED_1974_j', 'ENG_1966_k'];
const SLOTS = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'DEF', 'MID', 'FWD'];
let calls = [];
// The database behind the Function: one row per guest per day, the first kept.
const db = { rows: new Map(), cap: false, claimed: 0 };
const realFetch = globalThis.fetch;
const fakeSupabase = async (url, init) => {
  calls.push({ url, init });
  if (/\/auth\/v1\/user$/.test(url)) {
    const a = ((init.headers && (init.headers.Authorization || init.headers.authorization)) || '').slice(7);
    return new Response(JSON.stringify(a === 'acct-jwt' ? { id: ACCT } : {}), { status: a === 'acct-jwt' ? 200 : 401 });
  }
  const body = JSON.parse(init.body || '{}');
  if (/rpc\/soccer_daily_guest_submit$/.test(url)) {
    if (db.cap) return new Response(JSON.stringify({ message: 'guest limit' }), { status: 400 });
    const had = db.rows.has(body.p_guest);
    if (!had) db.rows.set(body.p_guest, { id: 41 + db.rows.size, name: 'SillyStriker46' });
    const r = db.rows.get(body.p_guest);
    return new Response(JSON.stringify({ id: r.id, name: r.name, first: !had }), { status: 200 });
  }
  if (/rpc\/soccer_daily_guest_claim$/.test(url)) {
    const n = db.rows.has(body.p_guest) ? 1 : 0; db.rows.delete(body.p_guest); db.claimed += n;
    return new Response(JSON.stringify({ moved: n }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};
globalThis.fetch = fakeSupabase;
const req = (body, headers = {}) => new Request('https://runthe.gg/api/pitch-guest', { method: 'POST',
  headers: Object.assign({ Origin: 'https://runthe.gg', 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, headers),
  body: typeof body === 'string' ? body : JSON.stringify(body) });
const daily = (b) => Object.assign({ device: DEVICE, player_ids: IDS, progress: 4, result: 'Quarter-Finalists', furthest: 'Quarter-final', slots: SLOTS, theme: 'The 90s' }, b);

{
  const a = await guestId('k1', DEVICE), b = await guestId('k1', DEVICE), c = await guestId('k2', DEVICE);
  ok(a === b && a !== c && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a), 'a guest id is a v4 uuid, the same for one device, different under another secret');
  ok(a !== await arcadeGuestId('k1', DEVICE), 'and is not the arcade\'s guest id for that device');
  ok((await ipKey('k1', '1.2.3.4')).length === 32 && !(await ipKey('k1', '1.2.3.4')).includes('1.2.3.4'), 'the IP is keyed, never sent raw');
  ok(readDaily(daily({ device: 'x' })).error === 'bad device' && readDaily(daily({ player_ids: IDS.slice(0, 10) })).error === 'bad squad'
    && readDaily(daily({ player_ids: [...IDS.slice(0, 10), IDS[0]] })).error === 'bad squad' && readDaily(daily({ player_ids: [...IDS.slice(0, 10), 'x y;drop'] })).error === 'bad squad'
    && readDaily(daily({ progress: 7 })).error === 'bad progress' && readDaily(daily({ progress: 1.5 })).error === 'bad progress', 'ten players, a duplicate, a strange id and bad progress are refused before the database');
  ok(readDaily(daily({ slots: ['GK', 'x'] })).args.p_slots === null && readDaily(daily({ result: 'x'.repeat(50) })).args.p_result === null, 'bad slots and an overlong word are dropped');

  calls = [];
  let r = await onRequestPost({ request: req(daily({ overall: 99.9, score: 120, name: 'Hacker', date: '2020-01-01' })), env });
  let j = await r.json();
  const sent = JSON.parse(calls[0].init.body);
  ok(r.status === 200 && j.id === -41 && j.name === 'SillyStriker46' && j.first === true, 'a good post answers the board id (negative for a guest), the generated name, first');
  ok(/rpc\/soccer_daily_guest_submit$/.test(calls[0].url) && calls[0].init.headers.Authorization === 'Bearer service-secret', 'it calls soccer_daily_guest_submit with the service role');
  ok(Object.keys(sent).sort().join() === 'p_furthest,p_guest,p_ip_key,p_player_ids,p_progress,p_result,p_slots,p_theme', 'no score, name or date from the page reaches the database', Object.keys(sent).join());
  ok(sent.p_guest === await guestId('service-secret', DEVICE) && !JSON.stringify(sent).includes('203.0.113.9') && !JSON.stringify(sent).includes(DEVICE), 'the guest id is derived; neither the device id nor the raw IP is sent on');
  r = await onRequestPost({ request: req(daily({})), env }); j = await r.json();
  ok(r.status === 200 && j.first === false && j.id === -41, 'a second post answers the same row, not first');
  db.cap = true; r = await onRequestPost({ request: req(daily({ device: '99992222-3333-4444-8555-666677778888' })), env }); db.cap = false;
  ok(r.status === 429, 'the per-IP cap answers 429');
  calls = []; r = await onRequestPost({ request: req(daily({}), { Origin: 'https://evil.example' }), env });
  ok(r.status === 403 && calls.length === 0, 'another origin is refused before the database');
  r = await onRequestPost({ request: req('x'.repeat(5000)), env });
  ok(r.status === 413, 'an oversized body is refused');
  calls = []; r = await onRequestPost({ request: req({ action: 'claim', device: DEVICE }), env });
  ok(r.status === 401 && !calls.some(c => /rpc\//.test(c.url)), 'a claim without a sign-in is refused');
  r = await onRequestPost({ request: req({ action: 'claim', device: DEVICE }, { Authorization: 'Bearer acct-jwt' }), env }); j = await r.json();
  const claim = JSON.parse(calls[calls.length - 1].init.body);
  ok(r.status === 200 && j.moved === 1 && claim.p_account === ACCT && claim.p_guest === await guestId('service-secret', DEVICE), 'a signed-in claim moves the device\'s guest days to the verified account');
  r = await onRequestPost({ request: req(daily({})), env: {} });
  ok(r.status === 503, 'unconfigured, it answers 503 and the page carries on');
}

if (args.includes('--quick')) { console.log(fails ? `\n${fails} failed` : '\nall passed (the Function only)'); process.exit(fails ? 1 : 0); }

// ---------- the page ----------
globalThis.fetch = realFetch;
const { chromium } = require('playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
const server = http.createServer((q, res) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

async function open({ fn = true, board = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const posts = [], errors = [], rest = [];
  page.on('pageerror', e => errors.push(e.message));
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
  await page.route('**/*', async (route) => {
    const rq = route.request(), u = new URL(rq.url());
    if (u.hostname === '127.0.0.1' && u.pathname === '/api/pitch-guest') {
      if (!fn) return route.fulfill({ status: 404, body: '' });
      // the real Function, with the faked database behind it
      const body = rq.postData() || '';
      posts.push({ body: JSON.parse(body), auth: rq.headers().authorization || null });
      globalThis.fetch = fakeSupabase;
      const r = await onRequestPost({ request: new Request('https://runthe.gg/api/pitch-guest', { method: 'POST',
        headers: Object.assign({ Origin: 'https://runthe.gg', 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, rq.headers().authorization ? { Authorization: rq.headers().authorization.replace('tok', 'acct-jwt') } : {}), body }), env });
      globalThis.fetch = realFetch;
      return route.fulfill({ status: r.status, contentType: 'application/json', body: await r.text() });
    }
    if (u.hostname === '127.0.0.1') return route.continue();
    if (!u.hostname.endsWith('supabase.co')) return route.fulfill({ status: 204, body: '' });
    if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    rest.push(u.pathname + u.search);
    if (u.pathname === '/rest/v1/daily_board' && !board) return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"message":"no such relation"}' });
    if (/\/rest\/v1\/daily_(board|results)$/.test(u.pathname)) {
      if (u.searchParams.get('limit') === '1') return route.fulfill({ status: 200, headers: Object.assign({ 'content-range': `0-0/${u.search.includes('or=') ? 4 : 30}` }, cors), contentType: 'application/json', body: '[]' });
      const rows = [1, 2, 3, 4].map(i => ({ id: i === 2 ? -41 : i, name: i === 2 ? 'SillyStriker46' : 'Player' + i, flag: '', overall: 95 - i, progress: 3, result: 'Round of 16', furthest: 'Round of 16', player_ids: [], slots: [], guest: i === 2 }));
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: 'null' });
  });
  await page.goto(base + '/soccer/', { waitUntil: 'load' });
  await page.waitForFunction(() => Array.isArray(window.PLAYERS) && window.PLAYERS.length > 0 && !document.getElementById('btn-start').disabled, null, { timeout: 30000 });
  // supabase-js is blocked with every other outside host; a small stand-in for the board read
  await page.evaluate(() => {
    const from = (src) => { const q = { select: () => q, eq: () => q, order: () => q, maybeSingle: async () => ({ data: null }), gt: () => q,
      limit: async (n) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${src}?limit=${n}`, { headers: sbHeaders() }); return r.ok ? { data: await r.json(), error: null } : { data: null, error: { message: 'http ' + r.status } }; } }; return q; };
    sbClient = { from, rpc: async () => ({ data: null, error: null }) };
  });
  return { ctx, page, posts, errors, rest };
}
// A whole Daily through the real result screen, squad built in place of eleven spins.
const playDaily = (page) => page.evaluate(async () => {
  startDailyChallenge();
  const started = { daily: !!(gs && gs.daily), modal: !!document.querySelector('#acct-bg.show, .acct-bg.show') };
  const order = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'FLEX', 'FLEX', 'FLEX'], used = new Set();
  const pick = (pos) => window.PLAYERS.find(p => p.position === pos && !used.has(p.player_id));
  gs.picks = order.map(slot => { const p = pick(slot === 'FLEX' ? 'MID' : slot); used.add(p.player_id); return { player: p, slot: slot === 'FLEX' ? 'MID' : slot }; });
  gs.openSlots = [];
  gs.result = G.computeResult(gs); applyLeadershipBonus();
  simResult = simulateTournament(gs.picks.map(p => p.player), gs.result.teamOverall, buildOpponentPool(null, null), getUserPositionalRatings(gs.picks));
  goToResults();
  for (let i = 0; i < 80 && !(gs.result && gs.result._lb); i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  return { started, lb: gs.result._lb, line: document.getElementById('res-rank-line').innerText, rec: guestDailyRec(), sub: document.getElementById('daily-btn-sub').textContent };
});

{
  db.rows.clear(); db.claimed = 0;
  const { ctx, page, posts, errors } = await open();
  ok(await page.evaluate(() => { openDailyIntro(); const b = document.getElementById('daily-intro-start'); return b.textContent === 'Start Challenge' && !b.classList.contains('gated'); }), 'a guest sees Start Challenge, not "Sign in to play"');
  const a = await playDaily(page);
  ok(a.started.daily && !a.started.modal, 'a guest starts the Daily with no account prompt');
  const sent = posts[0] && posts[0].body;
  ok(posts.length === 1 && sent.player_ids.length === 11 && !('overall' in sent) && !('score' in sent) && !('name' in sent), 'the result posts eleven ids and no score or name');
  ok(/SillyStriker46/.test(a.line) && /#5/.test(a.line) && /30/.test(a.line), `the result shows the generated name and the rank (${a.line.replace(/\s+/g, ' ').slice(0, 90)})`);
  ok(/free account/i.test(a.line) && !/First attempt counted/.test(a.line), 'and asks for a free account, at the result');
  ok(a.rec && a.rec.name === 'SillyStriker46' && a.rec.id === -41 && /Played/.test(a.sub), 'the device remembers the run and the home button reads Played');
  // the board marks the guest, and "you" is the guest's own row
  const boardHtml = await page.evaluate(async () => { await openDailyBoard(); await new Promise(r => setTimeout(r, 300)); return { html: document.getElementById('daily-list').innerHTML, your: document.getElementById('daily-yourline').textContent, play: document.getElementById('daily-play-btn').textContent }; });
  ok((boardHtml.html.match(/lb-guest/g) || []).length === 1 && /SillyStriker46/.test(boardHtml.html), 'the board tags the guest row, and only that row');
  ok(/Playing as SillyStriker46/.test(boardHtml.your) && /Replay/.test(boardHtml.play), 'the board says who the guest is playing as, and offers a replay');
  await page.evaluate(() => closeDailyBoard());
  // a replay
  const b = await playDaily(page);
  ok(posts.length === 2 && /First attempt counted/i.test(b.line) && b.rec.id === -41, 'a replay keeps the first attempt and says so', `${posts.length} posts; ${b.line.replace(/\s+/g, ' ')}`);
  // signing in claims the days, once, with the account's token
  const claimed = await page.evaluate(async () => { authUser = { id: 'u1' }; sbAccessToken = 'tok'; authProfile = { username: 'Real', current_streak: 1 }; const n = await claimGuestDaily(); const again = await claimGuestDaily(); return { n, again, rec: guestDailyRec(), flag: !!gs.result._claimed }; });
  const claimPost = posts.find(p => p.body.action === 'claim');
  ok(claimed.n === 1 && claimPost && /^Bearer /.test(claimPost.auth || '') && claimPost.body.device && posts.filter(p => p.body.action === 'claim').length === 1, 'signing in claims the guest days with the account\'s token, once');
  ok(claimed.rec === null && claimed.again === 0 && claimed.flag && db.claimed === 1, 'the guest record is spent and today\'s run is marked as the account\'s');
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
{
  // the Function missing (not deployed yet): a guest still plays and sees a rank
  const { ctx, page, errors } = await open({ fn: false });
  const a = await playDaily(page);
  ok(a.started.daily && a.lb && a.lb.rank === 5 && /Sign in/.test(a.line) && !a.rec, 'with the Function missing a guest still plays and sees a rank, with the sign-in ask');
  ok(errors.length === 0, 'and no page errors');
  await ctx.close();
}
{
  // 189 not run: no daily_board, so the page falls back to daily_results
  const { ctx, page, rest, errors } = await open({ board: false });
  const a = await playDaily(page);
  ok(a.lb && a.lb.rank === 5 && a.lb.total === 30 && rest.some(r => r.startsWith('/rest/v1/daily_results?')), 'before 189 is run the rank falls back to daily_results');
  const rows = await page.evaluate(async () => (await fetchDailyBoard(10)).length);
  ok(rows === 4 && errors.length === 0, 'and the board list falls back too');
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
