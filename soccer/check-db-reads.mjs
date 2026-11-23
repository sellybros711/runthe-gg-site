#!/usr/bin/env node
/* Run The Pitch: what a finished game reads, and that no poll runs while the tab is hidden.
 *
 *   node soccer/check-db-reads.mjs
 *
 * The page half of the site's save rule (platform-database-saves in the knowledge base). It
 * serves the repo, loads soccer/ in Chromium with every outside host answered locally (Supabase
 * by a fake that counts requests), signs a fake player in, and asserts:
 *
 *   1. The history (drafts and daily_results by user_id) is read once a visit, however many
 *      times the profile asks for it.
 *   2. After a recorded game nothing rereads the history: one get_my_stats, and the game is
 *      folded into the Legends collection from the picks on the page.
 *   3. Before the history is read, a game reads nothing extra (the profile reads it fresh).
 *   4. The daily rank is two counts, never the board's rows.
 *   5. Hidden, the friendly lobby, the pool and the pool watcher send nothing. Visible again,
 *      each polls at once.
 *
 * It failed on main before site PR "Run The Pitch: read only what changed": main read the
 * history after every game and pulled 500 board rows for a daily rank.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const log = [];   // every Supabase request: { method, path, query }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  const method = route.request().method();
  if (u.hostname === '127.0.0.1') return route.continue();
  if (!u.hostname.endsWith('supabase.co')) return route.fulfill({ status: 204, body: '' });
  // Real Supabase answers CORS and exposes content-range (the counts ride on it).
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
  const fulfill = route.fulfill.bind(route);
  route = { fulfill: (o) => fulfill({ ...o, headers: { ...cors, ...(o.headers || {}) } }) };
  log.push({ method, path: u.pathname, query: u.search });
  const p = u.pathname;
  if (/\/rest\/v1\/(drafts|daily_results)$/.test(p) && u.searchParams.get('user_id')) {
    const rows = [{ player_ids: ['ARG_1986_10', 'BRA_1970_10'], overall: 84, progress: 3 }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (p === '/rest/v1/daily_results') {   // a count: 7 beat us when filtered, 40 today
    const n = u.search.includes('or=') ? 7 : 40;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-0/${n}` }, body: '[]' });
  }
  if (p.endsWith('/rpc/submit_draft')) return route.fulfill({ status: 200, contentType: 'application/json', body: '123' });
  if (p === '/rest/v1/drafts') {   // the solo rank counts, and the board
    if (u.searchParams.get('limit') === '1') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-0/${u.search.includes('or=') ? 30 : 900}` }, body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
  if (p.endsWith('/rpc/soccer_wc_my_entry')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ season_id: 's', entrant_id: 'e', status: 'waiting' }) });
  if (p.endsWith('/rpc/soccer_wc_pool_state')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ season_id: 's', count: 12 }) });
  if (p.endsWith('/rpc/soccer_h2h_state')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'drafting', host: 'a', guest: null }) });
  return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
});

const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(base + '/soccer/', { waitUntil: 'load' });
await page.waitForFunction(() => Array.isArray(window.PLAYERS) && window.PLAYERS.length > 0, null, { timeout: 30000 });

// A signed-in player. The page's own fetches go through the route above; sbClient.rpc is the
// supabase-js path, faked here to post to the same host so it is counted the same way.
await page.evaluate(() => {
  authUser = { id: 'u-test' }; sbAccessToken = 'tok'; authProfile = { username: 'tester', current_streak: 0 };
  sbClient = { rpc: async (fn) => {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sbHeaders(), body: '{}' });
    if (fn === 'submit_daily') return { data: 55, error: null };
    return { data: fn === 'get_my_stats' ? { games: 3, confed_breadth: 2, decade_breadth: 2, underdog_progress: 3 } : null, error: null };
  } };
});
const count = (re) => log.filter(r => re.test(r.path + r.query)).length;
const HIST = /\/rest\/v1\/(drafts|daily_results)\?user_id=/;
const someIds = await page.evaluate(() => window.PLAYERS.slice(0, 11).map(p => String(p.player_id)));

// 3. A game before anything has read the history reads no history.
log.length = 0;
await page.evaluate((ids) => afterGameAchievementCheck(ids, 88, 4), someIds);
ok(count(HIST) === 0, `a game before the profile reads no history (read ${count(HIST)})`);
ok(count(/rpc\/get_my_stats/) === 1, 'a game makes one get_my_stats call');

// 1. The history is read once a visit.
log.length = 0;
await page.evaluate(async () => { await loadMyDrafts(); await loadMyDrafts(); await loadMyDrafts(); });
ok(count(HIST) === 2, `three profile opens read the history once, one request per table (read ${count(HIST)})`);

// 2. After a game: no reread, and the picks join the collection.
log.length = 0;
await page.evaluate((ids) => afterGameAchievementCheck(ids, 88, 4), someIds);
ok(count(HIST) === 0, `after a recorded game nothing rereads the history (read ${count(HIST)})`);
const folded = await page.evaluate((ids) => ids.every(id => myCollected.has(id)), someIds);
ok(folded, 'the finished game is folded into the Legends collection');
ok(await page.evaluate(() => achMetricsReady()), 'badges are ready from the server stats');

// 4. The daily rank is two counts.
log.length = 0;
const dr = await page.evaluate(() => typeof fetchDailyRank === 'function' ? fetchDailyRank(90.4, 4) : {});
ok(dr.rank === 8 && dr.total === 40, `daily rank from counts: #${dr.rank} of ${dr.total}`);
const drReq = log.filter(r => r.path === '/rest/v1/daily_results');
ok(drReq.length === 2 && drReq.every(r => /select=id&limit=1/.test(r.query)), 'the daily rank sends two count queries and reads no rows');

// 5. Polls: silent while hidden, at once when visible.
const setHidden = (h) => page.evaluate((hidden) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
}, h);
await page.evaluate(() => {
  h2hMatchId = 'm'; h2hRole = 'host';
  h2hPollTimer = setInterval(h2hPoll, 1600);
  wcPollTimer = setInterval(wcPoll, 4000);
  wcNotifyPollTimer = setInterval(wcNotifyCheck, 20000);
});
await setHidden(true);
log.length = 0;
await page.evaluate(async () => { await h2hPoll(); await wcPoll(); await wcNotifyCheck(); });
await page.waitForTimeout(4500);   // one tick of the lobby and the pool, and more
ok(log.length === 0, `hidden: no poll reaches the server (${log.length} requests)`);
await setHidden(false);
await page.waitForTimeout(300);
ok(count(/rpc\/soccer_h2h_state/) >= 1, 'visible again: the friendly lobby polls at once');
ok(count(/rpc\/soccer_wc_pool_state/) >= 1, 'visible again: the pool polls at once');
await page.evaluate(() => { h2hStopAll(); clearInterval(wcPollTimer); wcPollTimer = null; stopWcNotifyWatcher(); });

// 6. End to end: a finished solo game and a finished Daily through the real result screen.
const finish = (daily) => page.evaluate(async (daily) => {
  const order = ['GK','DEF','DEF','DEF','MID','MID','FWD','FWD','FLEX','FLEX','FLEX'];
  const pool = window.PLAYERS;
  const pick = (pos) => pool.find(p => p.position === pos && !used.has(p.player_id)) || pool.find(p => !used.has(p.player_id));
  const used = new Set();
  draftType = 'full'; gameMode = 'easy';
  gs = G.createGameState({ draftType: 'full', openSlots: FULL_OPEN_SLOTS, respins: { full: 0 } });
  gs.picks = order.map(slot => { const p = pick(slot === 'FLEX' ? 'MID' : slot); used.add(p.player_id); return { player: p, slot }; });
  gs.openSlots = []; gs.daily = daily; if (daily) { gs.dailyTheme = 'uefa'; gs.dailyThemeName = 'European Nations'; }
  gs.result = G.computeResult(gs); applyLeadershipBonus();
  simResult = simulateTournament(gs.picks.map(p => p.player), gs.result.teamOverall, buildOpponentPool(null, null), getUserPositionalRatings(gs.picks));
  goToResults();
  for (let i = 0; i < 80 && !(gs.result && gs.result._lb); i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 400));   // let the after-game check land
  return { lb: gs.result._lb, line: (document.getElementById('res-rank-line') || {}).textContent || '' };
}, daily);
log.length = 0;
const solo = await finish(false);
ok(solo.lb && solo.lb.rank === 31, `solo result: rank line filled (#${solo.lb && solo.lb.rank})`);
ok(count(HIST) === 0, `solo result: no history reread (read ${count(HIST)})`);
log.length = 0;
const daily = await finish(true);
ok(daily.lb && daily.lb.rank === 8 && daily.lb.total === 40, `daily result: #${daily.lb && daily.lb.rank} of ${daily.lb && daily.lb.total}`);
ok(count(HIST) === 0, `daily result: no history reread (read ${count(HIST)})`);
const boardRows = log.filter(r => r.path === '/rest/v1/daily_results' && !/limit=1/.test(r.query));
ok(boardRows.every(r => !/limit=500/.test(r.query)), 'daily result: no 500 row board read for the rank');
ok(pageErrors.length === 0, `no page errors${pageErrors.length ? ': ' + pageErrors.slice(0, 3).join(' | ') : ''}`);

await browser.close();
server.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
