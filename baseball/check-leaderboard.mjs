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
const ROWS = [row(0, { wins: 120, losses: 42, title_won: true, is_goat: true }),
  row(1, { wins: 118, losses: 44, is_goat: true }), row(2, { title_won: true }), row(3, {})];

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const asked = [];
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (u.includes('/rest/v1/rtd_runs')) {
    asked.push(decodeURIComponent(u));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ROWS) });
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
const last = () => asked[asked.length - 1] || '';
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

claim(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await ctx.close();
await browser.close();
server.close();
console.log(fails ? `\n${fails} of ${checks} checks FAILED.` : `\nAll ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
