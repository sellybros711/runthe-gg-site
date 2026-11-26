#!/usr/bin/env node
/* Run The Pitch: the club side (Club Draft and The Club Cup).
 *
 *   node soccer/check-club.mjs            the data rules, then a whole club run in Chromium
 *   node soccer/check-club.mjs --quick    the data rules only, no browser
 *   node soccer/check-club.mjs --names    print every club the side shows, and what it was called
 *
 * The data rules (soccer/club.js over data/players_all.json):
 *   - no shown club name carries a company's brand (the owner's ruling), and nobody is a "Free agent" club
 *   - every spun club and decade holds at least MIN_SPIN different men, each man once
 *   - the cup's sides sit on the World Cup pool's rating scale, with enough in every round's band
 * The browser run (outside hosts answered locally, Supabase counted):
 *   - the door is shut until /soccer/?club=1, and the World Cup side is unchanged
 *   - a whole club draft, Easy and Full Team: the wheel lands on a club and a decade, no man is
 *     drafted twice, the reveal and the cup play to a result
 *   - no screen of a club run says "World Cup" except a player's own World Cups line
 *   - a club run writes nothing to the server (step 1: its boards are not built)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = require('./club.js');
const args = process.argv.slice(2);

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------- the data rules ----------
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/players_all.json'), 'utf8'));
const players = raw.map(p => ({ ...p, overall: p.wc_overall ?? p.skill_rating }));
const units = C.build(players);
const clubs = [...new Set(units.map(u => u.club))].sort();

if (args.includes('--names')) {
  const from = {};
  raw.forEach(p => { const n = C.clubName(p.club_at_tournament); if (n && n !== p.club_at_tournament) (from[n] = from[n] || new Set()).add(p.club_at_tournament); });
  clubs.forEach(c => console.log(c + (from[c] ? '   (the data: ' + [...from[c]].join(', ') + ')' : '')));
  process.exit(0);
}

ok(units.length >= 400 && clubs.length >= 200, `${units.length} club and decade squads to spin, ${clubs.length} clubs`);
const branded = clubs.filter(c => C.BRAND_WORDS.test(c));
ok(branded.length === 0, `no shown club name carries a brand${branded.length ? ': ' + branded.join(', ') : ''}`);
ok(!clubs.some(c => C.SKIP[c]), 'no "Free agent" or federation shown as a club');
ok(units.every(u => u.squad.length >= C.MIN_SPIN), `every spun squad holds at least ${C.MIN_SPIN} men`);
ok(units.every(u => new Set(u.squad.map(C.personKey)).size === u.squad.length), 'a man appears once in a squad');
ok(units.every(u => u.squad.every(p => p.club_side && p.club_side.wcs.length && p.overall >= 1 && p.overall <= 99)), 'every man has a rating and his World Cups');
ok(Object.keys(C.NAMES).every(k => !C.SKIP[k]), 'the name list and the skip list do not overlap');
const wc = {}; raw.forEach(p => { if (p.team_overall != null && p.year !== 2026) wc[p.country + '|' + p.year] = p.team_overall; });
const opp = C.opponents(units, Object.values(wc));
ok(opp.every(o => o.squad.length >= C.MIN_OPP), `every cup side holds at least ${C.MIN_OPP} men`);
// ROUND_OPPONENTS in the page: each round draws from a rating band. Each needs a real choice.
const bands = { 'group (easy)': [50, 65, 3], 'Round of 32': [58, 72, 10], 'Round of 16': [65, 78, 10], 'Quarter-final': [75, 84, 10], 'Semi-final': [83, 91, 10], 'Final': [90, 99, 10] };
for (const [name, [lo, hi, need]] of Object.entries(bands)) {
  const n = opp.filter(o => o.teamOverall >= lo && o.teamOverall <= hi).length;
  ok(n >= need, `${name}: ${n} cup sides rated ${lo} to ${hi}`);
}
ok(Math.min(...opp.map(o => o.teamOverall)) === Math.min(...Object.values(wc)) && Math.max(...opp.map(o => o.teamOverall)) === Math.max(...Object.values(wc)), 'the cup sides span the World Cup pool\'s rating scale');
ok(C.cupWords('World Cup winners. History made.') === 'Club Cup winners. History made.' && C.cupWords('FIFA WORLD CUP') === 'THE CLUB CUP', 'the cup\'s words replace the World Cup\'s');
ok(clubs.every(c => /^[A-ZÀ-Ý0-9?]{1,3}$/.test(C.chip(c))), 'every club has a chip of one to three plain letters');
ok(new Set(units.map(u => u.club + '|' + u.era)).size === units.length, 'a shown name and decade is one squad');
// One club across its eras, under the name of its time (the owner's ruling). The data's club_id
// is the club. Made-up rows, so this holds before and after the data carries club_id.
{
  const mk = (i, year, name) => ({ player_id: `T_${year}_${i}`, name: 'Man ' + i + ' ' + year, country: 'Testland', year, position: ['GK', 'DEF', 'MID', 'FWD'][i % 4], wc_overall: 70 + i, overall: 70 + i, club_at_tournament: name, club_id: 'zenit' });
  const rows = [];
  for (let i = 0; i < 7; i++) rows.push(mk(i, 1986, 'Zenit Leningrad'));
  for (let i = 0; i < 7; i++) rows.push(mk(i, 2014, 'Zenit Saint Petersburg'));
  for (let i = 0; i < 4; i++) rows.push(mk(i + 10, 2018, 'Zenit Saint Petersburg'));
  rows.push(mk(20, 2010, 'Zenit St Petersburg'));   // one man under a third spelling that decade
  const z = C.build(rows);
  ok(z.length === 2 && z.every(u => u.id === 'zenit'), 'a renamed club is one club across its decades');
  ok(z.find(u => u.era === '1980s').club === 'Zenit Leningrad' && z.find(u => u.era === '2010s').club === 'Zenit Saint Petersburg', 'and each decade shows the name of its time');
}

// The two sides draft to the same strength. A greedy drafter (best man on offer, a re-spin when
// nothing rated 84 or more shows) plays both, on a fixed seed. If the club side drifts weaker the
// cup is unwinnable under the odds How to play publishes; stronger, and it is a gift.
{
  let seed = 20261126;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const SLOTS = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'FLEX', 'FLEX', 'FLEX'];
  const elig = (p, open, picks) => {
    const out = []; if (open.includes(p.position)) out.push(p.position);
    if (open.includes('FLEX') && p.position !== 'GK' && picks.filter(x => x.position === p.position).length < (p.position === 'FWD' ? 4 : 5)) out.push('FLEX');
    return out;
  };
  const draft = (spinFn) => {
    const open = [...SLOTS], picks = [], people = new Set(); let respins = 2;
    while (open.length) {
      let best = null;
      for (;;) {
        const squad = spinFn(open, picks, people);
        best = squad.filter(p => !people.has(C.personKey(p)) && elig(p, open, picks).length).sort((a, b) => b.overall - a.overall)[0] || null;
        if (best && (best.overall >= 84 || respins <= 0)) break;
        if (respins > 0) respins--;
      }
      open.splice(open.indexOf(elig(best, open, picks)[0]), 1); picks.push(best); people.add(C.personKey(best));
    }
    const ovs = picks.map(p => p.overall);
    let mult = 1;
    picks.forEach(p => { if (p.is_captain) mult *= 1.005; if (p.award) (Array.isArray(p.award) ? p.award : String(p.award).split('|')).filter(Boolean).forEach(() => { mult *= 1.02; }); });
    return (ovs.reduce((a, b) => a + b, 0) / 11 + ovs.filter(o => o >= 99).length * 0.15) * mult;
  };
  const byCY = {}; players.forEach(p => { ((byCY[p.year] = byCY[p.year] || {})[p.country] = byCY[p.year][p.country] || []).push(p); });
  const years = Object.keys(byCY);
  const wcSpin = () => { const y = years[Math.floor(rnd() * years.length)]; const cs = Object.keys(byCY[y]); return byCY[y][cs[Math.floor(rnd() * cs.length)]]; };
  const clubSpin = (open, picks, people) => C.spin(units, u => u.squad.some(p => !people.has(C.personKey(p)) && elig(p, open, picks).length), rnd).squad;
  const run = (fn) => { const a = Array.from({ length: 1500 }, () => draft(fn)).sort((x, y) => x - y); return { p50: a[Math.floor(a.length / 2)], over86: a.filter(x => x >= 86).length / a.length }; };
  const w = run(wcSpin), c = run(clubSpin);
  ok(Math.abs(w.p50 - c.p50) <= 1.5, `a greedy club draft is as strong as a World Cup one: median ${c.p50.toFixed(1)} against ${w.p50.toFixed(1)}`);
  ok(Math.abs(w.over86 - c.over86) <= 0.12, `and reaches 86 OVR as often: ${Math.round(c.over86 * 100)}% against ${Math.round(w.over86 * 100)}%`);
}

if (args.includes('--quick')) { console.log(fails ? `\n${fails} failed` : '\nall passed (data rules only)'); process.exit(fails ? 1 : 0); }

// ---------- a whole club run in a browser ----------
const { chromium } = require('playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
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
const browser = await chromium.launch();
const shots = (args.find(a => a.startsWith('--shots=')) || '').slice(8);

async function open(url, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const supa = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (u.hostname.endsWith('supabase.co')) { supa.push(route.request().method() + ' ' + u.pathname); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' }, body: '[]' }); }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForFunction(() => Array.isArray(window.PLAYERS) && window.PLAYERS.length > 0 && !document.getElementById('btn-start').disabled, null, { timeout: 30000 });
  return { ctx, page, supa, errors };
}
const visibleText = (page) => page.evaluate(() => {
  const sc = document.querySelector('.screen.active'); if (!sc) return '';
  // what a player can see: innerText skips hidden nodes. A man's own World Cups line is the one true use.
  const wcs = [...sc.querySelectorAll('.club-wcs')]; wcs.forEach(n => { n.dataset.was = n.style.display; n.style.display = 'none'; });
  const t = { innerText: sc.innerText };
  wcs.forEach(n => { n.style.display = n.dataset.was; });
  const ov = [...document.querySelectorAll('.match-popup-overlay,#spin-overlay,#reveal-overlay,#sheet-bg')].filter(n => getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden' && +getComputedStyle(n).opacity > 0).map(n => n.innerText).join('\n');
  const mast = document.querySelector('.masthead'); const mt = mast && getComputedStyle(mast).display !== 'none' ? mast.innerText : '';
  return mt + '\n' + t.innerText + '\n' + ov;
});

// the door is shut by default
{
  const { ctx, page } = await open('/soccer/', { width: 390, height: 844 });
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('btn-club')).display === 'none'), 'without ?club=1 the club door does not show');
  ok(await page.evaluate(() => document.querySelector('#btn-start .btn-label').textContent === 'START WORLD CUP'), 'the World Cup side\'s start button is unchanged');
  // a World Cup draft still spins a nation and a year
  const wcSpin = await page.evaluate(async () => {
    sideClub = false; draftType = 'quick'; gameMode = 'easy'; gs = G.createGameState(); goToHome(); startSpin();
    for (let i = 0; i < 100 && !(gs.currentSpin); i++) await new Promise(r => setTimeout(r, 100));
    return { club: isClub(), year: gs.currentSpin && gs.currentSpin.year, n: gs.currentSpin && gs.currentSpin.squad.length };
  });
  ok(!wcSpin.club && typeof wcSpin.year === 'number' && wcSpin.n >= 11, `a World Cup draft still spins a nation and a year (${wcSpin.year}, ${wcSpin.n} men)`);
  await ctx.close();
}

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const { ctx, page, supa, errors } = await open('/soccer/?club=1', viewport);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('btn-club')).display !== 'none'), `${label}: ?club=1 shows the club door`);
  const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/club-${label}-${name}.png` }); };
  await shot('start');
  await page.click('#btn-club');
  const setupSaid = await visibleText(page);
  await page.evaluate(() => { document.querySelector('#seg-draft [data-draft="full"]')?.click(); document.querySelector('#seg-mode [data-mode="easy"]')?.click(); });
  await page.evaluate(() => { draftType = 'full'; gameMode = 'easy'; });
  await page.click('#btn-setup-go');
  ok(await page.evaluate(() => isClub() && gs.openSlots.length === 11), `${label}: a club draft starts, Full Team`);
  supa.length = 0;
  const said = [setupSaid];   // every screen's words, to look for "World Cup"
  const seen = [];
  for (let round = 0; round < 11; round++) {
    await page.click('#btn-go-spin');
    await page.waitForFunction(() => gs.currentSpin && document.getElementById('screen-select').classList.contains('active'), null, { timeout: 15000 });
    await page.waitForTimeout(150);
    if (round === 0) await shot('squad');
    if (round === 1) {   // a re-spin lands on another club and decade and costs one
      const before = await page.evaluate(() => ({ k: gs.currentSpin.country + gs.currentSpin.year, left: gs.respins.full }));
      await page.click('#btn-respin-full');
      await page.waitForFunction((k) => gs.currentSpin && (gs.currentSpin.country + gs.currentSpin.year) !== k && document.getElementById('screen-select').classList.contains('active') && !document.getElementById('spin-overlay').classList.contains('show'), before.k, { timeout: 15000 });
      const after = await page.evaluate(() => gs.respins.full);
      ok(after === before.left - 1, `${label}: a re-spin lands on another club and decade and costs one`);
    }
    said.push(await visibleText(page));
    const info = await page.evaluate(() => {
      const sp = gs.currentSpin;
      const cards = [...document.querySelectorAll('#player-grid .pcard:not([disabled])')];
      return { club: sp.country, era: sp.year, isClubSpin: !!sp.club, n: sp.squad.length, open: cards.length, header: document.getElementById('select-country').textContent };
    });
    seen.push(info);
    // draft through the page's own buttons: a card, then the first slot offered
    await page.click('#player-grid .pcard:not([disabled])');
    await page.waitForTimeout(120);
    await page.click('#slot-opts .slot-opt');
    await page.waitForFunction((n) => gs.picks.length === n, round + 1, { timeout: 8000 });
    await page.waitForTimeout(100);
  }
  ok(seen.every(x => x.isClubSpin && /^\d{4}s$/.test(x.era) && x.n >= 6 && x.open >= 1), `${label}: eleven spins, each a club and a decade with a man to draft`);
  ok(seen.every(x => x.header === `${x.club.toUpperCase()} ${x.era}`), `${label}: the squad header names the club and decade (${seen[0].header})`);
  const picks = await page.evaluate(() => gs.picks.map(pk => ({ k: RTPClub.personKey(pk.player), id: pk.player.player_id, real: !!playerById(pk.player.player_id) })));
  ok(new Set(picks.map(p => p.k)).size === 11, `${label}: eleven different men drafted`);
  ok(picks.every(p => p.real), `${label}: every pick is a real player id the boards can resolve`);
  // the reveal, then the cup
  await page.waitForFunction(() => { const b = document.getElementById('btn-reveal-go'); return b && b.classList.contains('show'); }, null, { timeout: 60000 });
  said.push(await visibleText(page));
  ok(await page.evaluate(() => document.getElementById('btn-reveal-go').textContent === 'START THE CUP'), `${label}: the reveal's button starts the cup`);
  await shot('reveal');
  await page.click('#btn-reveal-go');
  await page.waitForFunction(() => document.getElementById('screen-sim').classList.contains('active') && typeof simResult !== 'undefined' && simResult, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  said.push(await visibleText(page));
  await shot('cup');
  const oppOk = await page.evaluate(() => {
    const gsm = simResult.groupStage, names = [];
    (gsm.matchdays || gsm.matches || []).forEach(m => names.push(m.country || (m.opponent && m.opponent.country)));
    simResult.matches.forEach(m => names.push(m.opponent.country));
    return { names, allClubs: names.length > 0 && names.every(n => CLUB.names.has(n)) };
  });
  ok(oppOk.allClubs, `${label}: every cup opponent is a club side (${oppOk.names.slice(0, 3).join(', ')})`);
  await page.evaluate(() => simSkipToResult());
  await page.waitForFunction(() => document.getElementById('screen-reveal').classList.contains('active') && document.getElementById('res-rank-line'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  said.push(await visibleText(page));
  await shot('result');
  const res = await page.evaluate(() => ({
    line: document.getElementById('res-rank-line').textContent,
    hidden: ['res-share', 'res-beatmine', 'res-leaderboard'].every(id => { const b = document.getElementById(id); return !b || getComputedStyle(b).display === 'none'; }),
    modal: document.getElementById('entry-bg').classList.contains('show'),
  }));
  ok(/not ranked yet/.test(res.line), `${label}: the result says the run is not ranked yet`);
  ok(res.hidden && !res.modal, `${label}: no board, share card or challenge link on a club result, and no modal opens`);
  const writes = supa.filter(r => /rpc\/(submit_draft|submit_daily|create_friendly_challenge|refresh_my_badges)|^POST/.test(r));
  ok(writes.length === 0, `${label}: a club run writes nothing to the server (${writes.length} writes${writes.length ? ': ' + writes.join(', ') : ''})`);
  const wcSaid = said.join('\n').split('\n').filter(l => /world cup/i.test(l));
  ok(wcSaid.length === 0, `${label}: no screen of a club run says "World Cup"${wcSaid.length ? ': ' + wcSaid.slice(0, 4).join(' | ') : ''}`);
  // Re-draft stays on the club side
  await page.click('#res-again');
  await page.click('#btn-setup-go');
  ok(await page.evaluate(() => isClub()), `${label}: Re-draft starts another club draft`);
  ok(errors.length === 0, `${label}: no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
