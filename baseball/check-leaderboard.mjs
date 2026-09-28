#!/usr/bin/env node
/* The leaderboard: a row opens into its twelve, every mode has a today, this
 * week and all time window, and a champion and a record season look it.
 * The board is a stand-in: no request leaves the page. */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import http from 'http';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EXE = process.env.CHROMIUM
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const PORT = 8147;

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json' };
const server = await new Promise((res) => {
  const s = http.createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      rep.writeHead(404).end('no'); return;
    }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
      .end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});

const FAKE_AUTH = (pro) => `window.RTD_AUTH=(function(){const L=[];
  const st=()=>({ready:true,waiting:false,signedIn:true,userId:'lineup-1',name:'lineup'});
  return {API_VERSION:1,boot(){setTimeout(()=>L.forEach(f=>f(st())),30);return true;},
  state:st,onChange(f){L.push(f);return()=>{};},token:()=>null,signOut:()=>Promise.resolve(),
  premiumProducts:async()=>${pro ? "['rtd_premium']" : '[]'},
  modeState:async()=>null,modeSpend:async(m)=>({ok:true,pro:${pro},mode:m})};})();`;

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const pool = JSON.parse(readFileSync(path.join(HERE, 'data/players.json'), 'utf8'));
const keyOf = (p) => p.i + '|' + p.s + '|' + p.r;
const bats = pool.filter((p) => p.r === 'b').slice(0, 9);
const arms = pool.filter((p) => p.r === 'p').slice(0, 3);
const roster = { picks: bats.concat(arms).map(keyOf).concat([]),
  slots: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP1', 'SP2', 'CL'] };
const row = (i, o) => Object.assign({ id: 'r' + i, created_at: new Date().toISOString(), user_id: null,
  display_name: 'p' + i, wins: 100 - i, losses: 62 + i, made_playoffs: true, seed_label: 'Division winner',
  title_won: false, is_goat: false, tied_record: false, run_mode: 'free', rating: 90 }, roster, o);
/* 230 seasons: four marked ones on top, then filler, so paging has three pages. */
const N = 230;
const ROWS = [row(0, { wins: 120, losses: 42, title_won: true, is_goat: true }),
  row(1, { wins: 118, losses: 44, is_goat: true }), row(2, { title_won: true }), row(3, {})];
for (let i = 4; i < N; i++) ROWS.push(row(i, { wins: 99 - Math.floor(i / 4), losses: 63 + Math.floor(i / 4) }));
ROWS.forEach((r, i) => { r.score = 100000 - i; });
/* A stand-in for PostgREST that honours order, offset, limit and the exact count. */
function answer(u) {
  const q = new URL(u).searchParams;
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  if (q.get('select') === 'id') {
    return { status: 200, headers: { ...cors, 'content-range': '0-0/' + N }, contentType: 'application/json', body: '[]' };
  }
  const asc = /score\.asc/.test(q.get('order') || '');
  const list = asc ? ROWS.slice().reverse() : ROWS;
  const off = +(q.get('offset') || 0), lim = +(q.get('limit') || 25);
  return { status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(list.slice(off, off + lim)) };
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const asked = [];
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (u.includes('/rest/v1/rtd_runs')) {
    asked.push(decodeURIComponent(u));
    return route.fulfill(answer(u));
  }
  if (u.includes('/rest/v1/')) return route.fulfill({ contentType: 'application/json', body: '[]' });
  return u.startsWith('http://localhost:' + PORT) ? route.continue() : route.abort();
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('rtd_seen_intro_v1', '1'); } catch (_) {} });
await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
await p.waitForSelector('#s-intro.on', { timeout: 20000 });
await p.waitForFunction(() => !!document.querySelector('#b-board'), null, { timeout: 20000 });
await p.waitForTimeout(600);

head('1. A ROW OPENS INTO ITS TEAM');
await p.click('#b-board');
await p.waitForSelector('.bd-ent', { timeout: 15000 });
claim(await p.$eval('.bd-ent .bd-team', (t) => t.hidden), 'a row starts folded');
await p.click('.bd-ent .bd-row');
const team = await p.evaluate(() => {
  const t = document.querySelector('.bd-ent .bd-team');
  return { hidden: t.hidden, rows: t.querySelectorAll('.rslot').length,
    names: [...t.querySelectorAll('.rname')].map((n) => n.textContent),
    open: document.querySelector('.bd-ent .bd-row').getAttribute('aria-expanded') };
});
claim(!team.hidden && team.open === 'true', 'tapping it opens it');
claim(team.rows === 12, 'and shows all twelve', `${team.rows} rows`);
claim(team.names.includes(bats[0].n) && team.names.includes(arms[0].n),
  'named off the pool, bats and arms', team.names.join(', '));
await p.click('.bd-ent .bd-row');
claim(await p.$eval('.bd-ent .bd-team', (t) => t.hidden), 'and tapping again folds it');

head('2. EVERY MODE HAS TODAY, THIS WEEK AND ALL TIME');
const last = () => asked.filter((u) => u.includes('order=')).pop() || '';
claim(await p.$eval('.bd-win.on', (b) => b.dataset.w) === 'all', 'it opens on All time');
claim(!/created_at=gte/.test(last()), 'and All time asks with no window');
await p.click('.bd-win[data-w="day"]'); await p.waitForTimeout(300);
const day = /created_at=gte\.([^&]+)/.exec(last());
claim(!!day, 'Today asks from a start time', last());
claim(day && /T0[45]:00:00\.000Z$/.test(day[1]), 'and the start is Eastern midnight', day && day[1]);
await p.click('.bd-win[data-w="week"]'); await p.waitForTimeout(300);
const wk = /created_at=gte\.([^&]+)/.exec(last());
claim(!!wk && new Date(wk[1]).getUTCDay() === 1, 'This week starts on a Monday', wk && wk[1]);
for (const m of ['era', 'franchise', 'staff', 'trade']) {
  await p.click(`.bd-tab[data-k="${m}"]`); await p.waitForTimeout(250);
  const shown = await p.$eval('#bd-wins', (w) => !w.hidden && w.querySelectorAll('.bd-win').length === 3);
  claim(shown, `the ${m} board has the three windows`);
}
await p.click('.bd-tab[data-k="daily"]'); await p.waitForTimeout(250);
claim(await p.$eval('#bd-wins', (w) => w.hidden), 'the daily board is one day already, so it has none');

head('3. A CHAMPION AND A RECORD SEASON LOOK IT');
await p.click('.bd-tab[data-k="free"]'); await p.waitForSelector('.bd-ent');
const looks = await p.evaluate(() => [...document.querySelectorAll('.bd-ent')].map((e) => ({
  champ: e.classList.contains('champ'), rec: e.classList.contains('record'),
  tags: [...e.querySelectorAll('.bd-tag')].map((t) => t.textContent.trim()),
  border: getComputedStyle(e.querySelector('.bd-row')).borderTopColor,
  anim: getComputedStyle(e.querySelector('.bd-row')).animationName })));
claim(looks[0].champ && looks[0].rec && looks[0].tags.length === 2, 'a record that won it all wears both', JSON.stringify(looks[0]));
claim(!looks[1].champ && looks[1].rec && /Record/.test(looks[1].tags.join()), 'a record season is tagged', JSON.stringify(looks[1]));
claim(looks[2].champ && !looks[2].rec && /Champions/.test(looks[2].tags.join()), 'a champion is tagged', JSON.stringify(looks[2]));
claim(!looks[3].champ && !looks[3].rec && !looks[3].tags.length, 'an ordinary season is plain');
claim(looks[2].border !== looks[3].border, 'a champion row has its own edge', looks[2].border + ' vs ' + looks[3].border);
claim(looks[1].anim === 'bdrec' && looks[2].anim === 'none', 'only a record season moves', looks[1].anim + ' / ' + looks[2].anim);

head('4. MORE THAN FIFTY, A PAGE AT A TIME');
const state = () => p.evaluate(() => ({
  n: document.querySelectorAll('#bd-list .bd-ent').length,
  count: document.getElementById('bd-count').textContent,
  more: document.getElementById('bd-more').hidden ? '' : document.getElementById('bd-more').textContent,
  first: document.querySelector('#bd-list .bd-ent .bd-pos').textContent,
  firstName: document.querySelector('#bd-list .bd-ent .bd-name').textContent,
  last: [...document.querySelectorAll('#bd-list .bd-ent .bd-pos')].pop().textContent,
  sort: document.getElementById('bd-sort').textContent }));
let st = await state();
claim(st.count === '230 seasons', 'the board says how many seasons it holds', st.count);
claim(st.n === 100, 'the first page is 100, not 50', `${st.n}`);
claim(st.more === 'Show 100 more', 'and offers the next hundred', st.more);
await p.click('#bd-more'); await p.waitForFunction(() => document.querySelectorAll('#bd-list .bd-ent').length === 200);
st = await state();
claim(st.last === '200' && /offset=100/.test(last()), 'Show more loads 101 to 200 from where it stopped', st.last);
claim(st.more === 'Show 30 more', 'and says how many are left', st.more);
await p.click('#bd-more'); await p.waitForFunction(() => document.querySelectorAll('#bd-list .bd-ent').length === 230);
st = await state();
claim(st.more === '' && st.last === '230', 'the last page ends the list and takes the button away', st.more || '(no button)');
await p.click('.bd-ent:last-child .bd-row');
claim(await p.$eval('.bd-ent:last-child .bd-team', (t) => !t.hidden && t.querySelectorAll('.rslot').length === 12),
  'a row loaded on a later page still opens into its team');

head('5. HIGH TO LOW, AND LOW TO HIGH');
claim(/High to low/.test(st.sort), 'the board opens high to low', st.sort);
await p.click('#bd-sort'); await p.waitForTimeout(400);
st = await state();
claim(/Low to high/.test(st.sort) && /score\.asc/.test(last()), 'the button turns it round', st.sort);
claim(st.firstName === 'p229' && st.first === '230', 'the worst season leads, still ranked 230th', `${st.firstName} at ${st.first}`);
claim(st.n === 100 && st.more === 'Show 100 more', 'and it pages the same way', `${st.n} / ${st.more}`);
await p.click('#bd-more'); await p.waitForFunction(() => document.querySelectorAll('#bd-list .bd-ent').length === 200);
st = await state();
claim(st.last === '31', 'counting down as it goes', st.last);
await p.click('.bd-win[data-w="week"]'); await p.waitForTimeout(400);
claim(/Low to high/.test((await state()).sort), 'the order holds across a window change');
await p.click('#bd-sort'); await p.waitForTimeout(400);
st = await state();
claim(st.first === '1' && st.firstName === 'p0' && /score\.desc/.test(last()), 'and turns back to best first', `${st.firstName} at ${st.first}`);

claim(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await ctx.close();
await browser.close();
server.close();
console.log(fails ? `\n${fails} of ${checks} checks FAILED.` : `\nAll ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
