#!/usr/bin/env node
/* The lineup: after the draft, all twelve read as a batting order and a staff, set by
 * the coach, and Pro can move men around until the first pitch.
 *
 *   node baseball/check-lineup.mjs
 *
 * Two halves, because they fail in different places.
 *
 * THE ENGINE. The coach's order is the BASELINE the season was always played in, so
 * it must cost nothing, and it must be the best order these weights can produce, or
 * a Pro player could buy runs by moving a man. Both are asserted against every
 * permutation of a small fixture rather than against the function's own answer:
 * asking coachOrder whether coachOrder is optimal is asking a function whether it
 * agrees with itself.
 *
 * THE PAGE. A free account sees the order and cannot touch it; Pro taps two rows to
 * swap them, reads what the swap costs, and can put the coach's order back. Every
 * request out of the page is refused at the route, the same as check-run: the board
 * is a live project, and a submit that got out would file a fabricated season on it. */
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
const PORT = 8141;

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

/* ══ 1. the engine ═══════════════════════════════════════════════════════════ */
head('1. THE COACH\'S ORDER COSTS NOTHING AND NOTHING BEATS IT');
const E = require(path.join(HERE, 'engine.js'));
const W = E.LINEUP_WEIGHT;
claim(W.length === 9, 'nine lineup spots', `${W.length}`);
const mean = W.reduce((s, x) => s + x, 0) / W.length;
claim(Math.abs(mean - 1) < 1e-9, 'the weights average exactly one, so equal hitters are equal in any order', mean.toFixed(4));

const SL = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const pool = JSON.parse(readFileSync(path.join(HERE, 'data/players.json'), 'utf8'))
  .filter((p) => p.r === 'b' && p.pp);
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const nineOf = () => SL.map((s) => ({ ...pool[Math.floor(rnd() * pool.length)], _slot: s }));
const withOrder = (arr) => arr.map((p, i) => ({ ...p, _bat: i + 1 }));

let zero = 0, neg = 0, beaten = 0;
for (let t = 0; t < 300; t++) {
  const nine = nineOf();
  const coach = E.coachOrder(nine);
  if (E.orderLoss(withOrder(coach)) < 1e-9) zero++;
  for (let j = 0; j < 20; j++) {
    const shuf = coach.slice().sort(() => rnd() - 0.5);
    const loss = E.orderLoss(withOrder(shuf));
    if (loss < -1e-9) neg++;
    const off = E.rosterOffense(withOrder(shuf), 1, 1), base = E.rosterOffense(withOrder(coach), 1, 1);
    if (off > base + 1e-9) beaten++;
  }
}
claim(zero === 300, 'the coach\'s order gives up nothing, on 300 rosters', `${zero} of 300`);
claim(neg === 0, 'no order is charged a negative cost', `${neg}`);
claim(beaten === 0, 'no shuffled order out-scores the coach\'s, 6,000 tries', `${beaten} beat it`);
const nobat = nineOf();
claim(E.orderLoss(nobat) === 0, 'a roster nobody ordered is the coach\'s by definition');
/* The whole claim of "nothing beats it" by exhaustion, on distinct values: every one
   of the 9! orders of one nine. */
{
  const nine = nineOf().map((p, i) => ({ ...p, w: 1 + i * 0.7 + rnd() * 0.1, pp: SL[i] }));
  const best = E.rosterOffense(withOrder(E.coachOrder(nine)), 1, 1);
  let better = 0;
  const perm = (arr, k) => {
    if (k === arr.length) { if (E.rosterOffense(withOrder(arr), 1, 1) > best + 1e-9) better++; return; }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  perm(nine.slice(), 0);
  claim(better === 0, 'and by exhaustion: none of the 362,880 orders of one nine beats it', `${better} beat it`);
}

/* ══ 2. the page ═════════════════════════════════════════════════════════════ */
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
const errors = [];

async function openAt(pro) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    return u.startsWith('http://localhost:' + PORT) ? route.continue() : route.abort();
  });
  await ctx.route('**/baseball/auth.js*', (route) => route.fulfill({
    contentType: 'application/javascript', body: FAKE_AUTH(pro) }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('rtd_seen_intro_v1', '1'); } catch (_) {} });
  await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  await p.click('#b-start');
  await p.waitForSelector('#s-draft.on', { timeout: 20000 });
  for (let i = 0; i < 12; i++) {
    await p.waitForFunction(() => document.querySelectorAll('#opts .tile').length > 0
      || document.querySelector('#s-squad.on'), null, { timeout: 25000 });
    if (await p.$('#s-squad.on')) break;
    const took = await p.evaluate(() => {
      const t = [...document.querySelectorAll('#opts .tile')].filter((x) => !x.classList.contains('off') && !x.disabled)[0];
      if (!t) return false; t.click(); return true;
    });
    await p.waitForTimeout(60);
    await p.evaluate(() => {
      if (!document.querySelector('#s-draft.picking')) return;
      const t = document.querySelector('#field .target.natural') || document.querySelector('#field .target');
      if (t) t.click();
    });
    if (!took) await p.evaluate(() => { const b = document.getElementById('b-respin'); if (b) b.click(); });
    await p.waitForTimeout(300);
  }
  await p.waitForSelector('#s-squad.on', { timeout: 30000 });
  return { ctx, p };
}

const tap = (p, kind, i) => p.evaluate(([k, n]) => {
  document.querySelectorAll('#sq-roster .rslot[data-kind="' + k + '"]')[n].click();
}, [kind, i]);

const read = (p) => p.evaluate(() => {
  const host = document.getElementById('sq-roster');
  const heads = [...host.querySelectorAll('.lu-head .eyebrow')].map((e) => e.textContent.trim());
  const lists = [...host.querySelectorAll('.roster-final')];
  const bat = lists[0] ? [...lists[0].querySelectorAll('.rslot')] : [];
  const arms = lists[1] ? [...lists[1].querySelectorAll('.rslot')] : [];
  return {
    heads,
    nums: bat.map((r) => (r.querySelector('.rnum') || {}).textContent),
    names: bat.map((r) => r.querySelector('.rname').textContent),
    armSlots: arms.map((r) => r.querySelector('.rpos').textContent),
    armWar: arms.map((r) => parseFloat(r.querySelector('.rwar').textContent)),
    buttons: host.querySelectorAll('button.rslot').length,
    upsell: !!host.querySelector('#b-lu-pro'),
    reset: host.querySelectorAll('.lu-reset').length,
    cost: (host.querySelector('.lu-cost') || {}).textContent || '',
    hint: (host.querySelector('.lu-hint') || {}).textContent || '',
    verdict: document.getElementById('sq-verdict').textContent,
  };
});

head('2. A FREE ACCOUNT READS THE COACH\'S LINEUP AND CANNOT MOVE IT');
{
  const { ctx, p } = await openAt(false);
  const r = await read(p);
  claim(r.heads[0] === 'Batting order' && r.heads[1] === 'Pitching staff',
    'the list is a batting order, then the staff', r.heads.join(' / '));
  claim(r.nums.join(',') === '1,2,3,4,5,6,7,8,9', 'nine hitters numbered one to nine', r.nums.join(','));
  claim(r.armSlots.join(',') === 'SP1,SP2,CL', 'the staff reads SP1, SP2, CL', r.armSlots.join(','));
  claim(r.buttons === 0, 'no row is a control', `${r.buttons} buttons`);
  claim(r.upsell, 'and the list says Pro is how to move players');
  await ctx.close();
}

head('3. PRO SWAPS TWO HITTERS, READS THE COST, AND CAN PUT THE COACH BACK');
{
  const { ctx, p } = await openAt(true);
  await p.waitForFunction(() => document.querySelectorAll('#sq-roster button.rslot').length === 12,
    null, { timeout: 8000 }).catch(() => {});
  const before = await read(p);
  claim(before.buttons === 12, 'all twelve rows are buttons for Pro', `${before.buttons}`);
  claim(!before.upsell, 'and Pro sees no upsell');
  claim(before.reset === 0, 'the coach\'s order carries no reset button');
  /* Swap the leadoff man with the ninth. */
  await tap(p, 'bat', 0);
  const mid = await read(p);
  claim(/swaps with/.test(mid.hint), 'the first tap asks for the second', mid.hint);
  await tap(p, 'bat', 8);
  const after = await read(p);
  claim(after.names[0] === before.names[8] && after.names[8] === before.names[0],
    'the two hitters traded spots', `${before.names[0]} / ${before.names[8]} -> ${after.names[0]} / ${after.names[8]}`);
  claim(/costs about [\d.]+ wins/.test(after.cost), 'the list says what the swap costs', after.cost || '(no cost line)');
  claim(after.reset === 1, 'and offers the coach\'s order back');
  await p.click('#sq-roster .lu-reset');
  const back = await read(p);
  claim(back.names.join('|') === before.names.join('|'), 'the reset puts the coach\'s order back');
  claim(!back.cost, 'and the cost line goes');
  /* Swap SP1 and SP2: a legal swap inside the rotation. */
  await tap(p, 'arm', 0);
  await tap(p, 'arm', 1);
  const arms = await read(p);
  claim(arms.armWar[0] === before.armWar[1] && arms.armWar[1] === before.armWar[0],
    'SP1 and SP2 traded places', `${before.armWar.join(',')} -> ${arms.armWar.join(',')}`);
  /* A starter and the closer are different jobs, so that tap does not swap. */
  await tap(p, 'arm', 0);
  await tap(p, 'arm', 2);
  const cl = await read(p);
  claim(cl.armSlots.join(',') === 'SP1,SP2,CL' && cl.armWar[2] === arms.armWar[2],
    'a starter cannot be swapped into the closer\'s job', cl.armWar.join(','));
  /* Once the season starts, the lineup is locked. */
  await p.evaluate(() => { const b = document.getElementById('b-playball'); if (b) b.click(); });
  await p.waitForSelector('#s-season.on', { timeout: 20000 });
  await ctx.close();
}

claim(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
console.log(fails ? `\n${fails} of ${checks} checks FAILED.` : `\nAll ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
