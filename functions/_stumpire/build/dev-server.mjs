#!/usr/bin/env node
/* A local Stumpire server for testers' screenshots and the browser check:
 * the real API (functions/_stumpire/api.js) over the in-memory database,
 * seeded with the test slate for today, and the real page shells.
 *
 *   node functions/_stumpire/build/dev-server.mjs [--port 8787]
 *   open http://localhost:8787/arcade/stumpire/        (as the tester "dev")
 *        http://localhost:8787/arcade/stumpire/admin   (as the admin)
 *
 * Sign-in is faked: /arcade/auth.js is replaced by a stub whose token names a
 * user, picked with ?as=admin|tester|nobody on the page URL. Nothing here
 * talks to Supabase.
 */
import http from 'node:http';
import { handle } from '../api.js';
import { memoryDb } from '../db-memory.js';
import { PLAY_PAGE, ADMIN_PAGE } from '../pages.js';
import { slateDate } from '../slate.js';
import { seedMemory, SEARCH } from './seed-slate.mjs';

const args = process.argv.slice(2);
const PORT = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 8787);
const USERS = { admin: 'u-admin', tester: 'u-tester', nobody: 'u-nobody' };
export async function makeServer(opts = {}) {
  const db = memoryDb({ testers: { 'u-admin': 'admin', 'u-tester': 'tester' }, users: { dev: 'u-tester', boss: 'u-admin', other: 'u-nobody' } });
  const clock = { offset: 0 };
  const now = () => Date.now() + clock.offset;
  await seedMemory(db, slateDate(now()));
  const stubAuth = who => 'window.RTG_AUTH={boot:function(){return true},onChange:function(f){f({resolved:true,signedIn:' + (who ? 'true' : 'false') + '})},state:function(){return{signedIn:' + (who ? 'true' : 'false') + '}},token:function(){return ' + JSON.stringify(who || null) + '}};';
  const strip = html => html.replace(/<script src="https:\/\/cdn[^"]*"><\/script>\n?/, '');
  const server = http.createServer(async (rq, rs) => {
    const url = new URL(rq.url, 'http://x');
    const who = url.searchParams.get('as') || (rq.headers.referer ? new URL(rq.headers.referer).searchParams.get('as') : null) || 'tester';
    if (url.pathname === '/arcade/auth.js') { rs.writeHead(200, { 'Content-Type': 'text/javascript' }); return rs.end(stubAuth(USERS[who] ? 'tok-' + who : null)); }
    if (url.pathname.startsWith('/api/stumpire/')) {
      let body = '';
      for await (const c of rq) body += c;
      const tok = (rq.headers.authorization || '').replace(/^Bearer\s+tok-/, '');
      const res = await handle({ method: rq.method, path: url.pathname.slice('/api/stumpire/'.length), query: Object.fromEntries(url.searchParams),
        body: body ? JSON.parse(body) : null, uid: USERS[tok] || null, guestId: rq.headers['x-stumpire-guest'] || null },
        { db, now, searchAvg: () => SEARCH.values });
      rs.writeHead(res.status, { 'Content-Type': 'application/json' }); return rs.end(JSON.stringify(res.body));
    }
    const access = USERS[who] ? await db.access(USERS[who]) : null;
    if (url.pathname === '/arcade/stumpire/' && access) { rs.writeHead(200, { 'Content-Type': 'text/html' }); return rs.end(strip(PLAY_PAGE)); }
    if (url.pathname === '/arcade/stumpire/admin' && access === 'admin') { rs.writeHead(200, { 'Content-Type': 'text/html' }); return rs.end(strip(ADMIN_PAGE)); }
    rs.writeHead(404, { 'Content-Type': 'text/plain' }); rs.end('Not found');
  });
  await new Promise(r => server.listen(opts.port || 0, r));
  return { server, db, clock, port: server.address().port };
}
if (process.argv[1] && process.argv[1].endsWith('dev-server.mjs')) {
  const s = await makeServer({ port: PORT });
  console.log('Stumpire dev server on http://localhost:' + s.port + '/arcade/stumpire/  (admin: /arcade/stumpire/admin?as=admin)');
}
