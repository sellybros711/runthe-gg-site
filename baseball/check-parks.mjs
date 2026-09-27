#!/usr/bin/env node
/* Run The Diamond: the ballparks.
 *
 *   node baseball/check-parks.mjs          the catalogue, the art, the unlocks, the page
 *   node baseball/check-parks.mjs --quick  no browser
 *
 * Everything that goes wrong with a park goes wrong silently. An SVG with a url()
 * pointing at an id that is not there draws nothing and throws nothing; two parks on
 * one page sharing a gradient id paint each other; a rule nobody can meet is a park
 * nobody will ever see; and a chosen park the account cannot back has to fall back
 * to the home park rather than draw something it does not own. So each of those is
 * asked here, of the real parks.js and the real page.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PK = require('./parks.js');
const ACH = require('./achievements.js');
const QUICK = process.argv.includes('--quick');

let fails = 0, passes = 0;
const claim = (ok, what, why) => {
  if (ok) { passes++; console.log('  ok    ' + what); }
  else { fails++; console.log('  FAIL  ' + what + (why ? '  (' + why + ')' : '')); }
};
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

// ══ 1. the catalogue ═════════════════════════════════════════════════════════
head('1. EVERY PARK IS IN THE CATALOGUE ONCE, AND THE HOME PARK IS FREE');
const ids = PK.PARKS.map((p) => p.id);
claim(new Set(ids).size === ids.length, `${ids.length} parks, no id twice`);
claim(PK.PARKS[0].id === 'home' && PK.status(PK.PARKS[0], null).ok, 'the home park is first and yours as a guest');
claim(PK.PARKS.every((p) => p.name && p.nod && p.rarity && p.unlock && p.unlock.label), 'each has a name, a line, a rarity and a rule');
claim(new Set(PK.PARKS.map((p) => p.name)).size === PK.PARKS.length, 'no two parks share a name');

// ══ 2. the art ═══════════════════════════════════════════════════════════════
head('2. EVERY PARK DRAWS, AND DRAWS ONLY WHAT IT DEFINES');
for (const p of PK.PARKS) {
  const svg = PK.markings(p.id, 't', PK.SKY);
  const defs = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  const missing = [...new Set(refs.filter((r) => !defs.has(r)))];
  const dup = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) !== i);
  claim(!/NaN|undefined|Infinity/.test(svg) && !missing.length && !dup.length && !/var\(/.test(svg),
    `${p.name}: no NaN, every url() resolves, no id twice, literal colours`,
    [missing.length && 'missing ' + missing.join(','), dup.length && 'dup ' + dup.join(','), /var\(/.test(svg) && 'a theme variable'].filter(Boolean).join('; '));
}
/* Thirteen cards are drawn into one sheet, and a field and a results card beside
   them: every id has to be the park's own, or the second park paints with the
   first one's gradient. */
{
  const all = PK.PARKS.map((p) => PK.markings(p.id, 'pv', PK.SKY)).join('');
  const list = [...all.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  claim(new Set(list).size === list.length, 'all thirteen in one document share no id');
  const two = PK.markings('ivy', 'field', PK.SKY) + PK.markings('ivy', 'pv', PK.SKY);
  const l2 = [...two.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  claim(new Set(l2).size === l2.length, 'and one park drawn twice on a page under two suffixes does not either');
}
/* The field under the art is the same field in every park: the chips stand on the
   same spots, so the bases have to be where the page thinks they are. */
{
  const base = (s) => [...s.matchAll(/rotate\(45 ([\d.]+) ([\d.]+)\)" fill="#fbfaf5"/g)].map((m) => m[1] + ',' + m[2]).join(' ');
  const ref = base(PK.markings('home', 'x', PK.SKY));
  claim(PK.PARKS.every((p) => base(PK.markings(p.id, 'x', PK.SKY)) === ref), 'every park puts the three bases in the same place', ref);
  const vb = (s) => (/viewBox="([^"]+)"/.exec(s) || [])[1];
  claim(vb(PK.markings('ivy', 'x', PK.SKY)) === '0 -' + PK.SKY + ' 100 ' + (68 + PK.SKY) && vb(PK.markings('ivy', 'x', 0)) === '0 0 100 68',
    'the sky extends the box upward and a hero field gets none');
}

/* EVERYBODY STANDS ON THE FIELD. The chips are placed by the page's DIAMOND_SPOTS
   and the grass is drawn by parks.js's lower-camera projection, two copies of one
   picture. A fielder whose spot sits above the foot of the wall is standing in the
   stands, which is what a player reported of center field; a catcher far from the
   plate is not catching. So the spots are held to the projection. */
{
  const page = readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const tbl = (/const DIAMOND_SPOTS=\[([\s\S]*?)\];/.exec(page) || [])[1] || '';
  const spots = [...tbl.matchAll(/\{x:([\d.]+),y:([\d.]+)\}/g)].map((m) => ({ x: +m[1], y: +m[2] * 0.68 }));
  const gy = (y) => PK.GROUND_A - (62.6 - y) * PK.GROUND_K;
  const t = (x) => x / 100, foot = (x) => { const y0 = gy(13.6), c = 2 * gy(7.2) - y0; return (1 - t(x)) ** 2 * y0 + 2 * t(x) * (1 - t(x)) * c + t(x) ** 2 * y0; };
  claim(spots.length === 12, 'the page has twelve spots to check', String(spots.length));
  const inStands = spots.slice(0, 9).map((p, i) => ({ i, d: p.y - foot(p.x) })).filter((p) => p.d < 3);
  claim(!inStands.length, 'every fielder stands on the grass, at least 3 units below the foot of the wall',
    inStands.map((p) => 'slot ' + p.i + ' at ' + p.d.toFixed(1)).join(', '));
  const cGap = PK.GROUND_A - spots[0].y;
  claim(cGap > 3 && cGap < 6.2, `the catcher sits just in front of the plate (${cGap.toFixed(1)} units)`);
}

// ══ 3. the unlocks ═══════════════════════════════════════════════════════════
head('3. EVERY PARK CAN BE EARNED, AND A GUEST EARNS NOTHING');
const row = (o) => Object.assign({ ts: Date.now(), wins: 81, losses: 81, madePlayoffs: false, titleWon: false, picks: [] }, o);
const infoOf = (rows, pro) => ({ signed: true, pro: !!pro, badges: ACH.evaluate(rows).earned.length, ctx: ACH.buildCtx(rows) });
claim(PK.unlockedIds(null).join() === 'home', 'a guest has the home park and nothing else');
claim(PK.unlockedIds(infoOf([])).join() === 'home', 'a new account has the home park and nothing else');
/* A career that has done every thing the rules ask for, built from the modes the
   badge file itself lists, so it cannot drift from what the game records. */
const flags = { era: { era: '1950s' }, franchise: { franchise: 'NYY' }, division: { division: 'AL East' },
  survivor: { capSurvivor: true }, staff: { staff: true }, trade: { tradeMachine: true }, classic: {} };
const vet = [];
for (let i = 0; i < 30; i++) {
  const m = ACH.MODES[i % ACH.MODES.length][0];
  vet.push(row(Object.assign({ ts: Date.now() - i * 864e5, wins: 72 + i, losses: 90 - i, madePlayoffs: i > 5, titleWon: i === 29 }, flags[m] || {})));
}
const vi = infoOf(vet), vp = infoOf(vet, true);
const notPro = PK.PARKS.filter((p) => !p.unlock.pro);
const stuck = notPro.filter((p) => !PK.status(p, vi).ok).map((p) => p.name);
claim(!stuck.length, 'a thirty season veteran has every park that is not Pro', stuck.join(', ') + ` (badges ${vi.badges})`);
claim(PK.PARKS.filter((p) => p.unlock.pro).every((p) => !PK.status(p, vi).ok && PK.status(p, vp).ok), 'a Pro park is Pro and only Pro');
claim(ACH.MODES.length === 7 && /7 modes/.test(PK.BY_ID.bayside.unlock.label), 'the rule that says "all 7 modes" counts the modes the game has');
claim(PK.PARKS.filter((p) => p.unlock.of > 1).every((p) => { const s = PK.status(p, infoOf([])); return s.have === 0 && s.of > 1; }),
  'a park with a count reports how far along an account is');
/* A badge count may not ask for more badges than exist. */
const maxBadge = Math.max(...PK.PARKS.filter((p) => /badges/.test(p.unlock.label)).map((p) => p.unlock.of));
claim(maxBadge < ACH.CATALOGUE.length / 3, `the most badges a park asks for (${maxBadge}) is a fraction of the ${ACH.CATALOGUE.length} there are`);

if (QUICK) { console.log(`\n${fails ? fails + ' of ' + (fails + passes) + ' checks FAILED' : 'All ' + passes + ' checks passed.'}`); process.exit(fails ? 1 : 0); }

// ══ 4. the page ══════════════════════════════════════════════════════════════
const { chromium } = (() => { try { return require('playwright'); } catch (_) { return createRequire('/opt/node22/lib/node_modules/playwright/')('/opt/node22/lib/node_modules/playwright'); } })();
const PORT = Number(process.env.PORT || 8080);
const browser = await chromium.launch();
const errors = [];
async function openAs(opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.route('**/*', (r) => r.request().url().startsWith('http://localhost:' + PORT) ? r.continue() : r.abort());
  if (opts.acct) await ctx.route('**/baseball/auth.js*', (route) => route.fulfill({ contentType: 'application/javascript',
    body: `window.RTD_AUTH={API_VERSION:1,boot:()=>true,state:()=>({ready:true,waiting:false,signedIn:true,userId:${JSON.stringify(opts.acct)},name:'parks'}),onChange:()=>()=>{},token:()=>null,signOut:()=>Promise.resolve()};` }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.addInitScript((o) => {
    localStorage.setItem('rtd_seen_intro_v1', '1');
    if (o.rows) localStorage.setItem('rtd_history', JSON.stringify(o.rows));
    if (o.pref) localStorage.setItem('rtd_park_v1', JSON.stringify(o.pref));
  }, opts);
  await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  await p.click('#b-start');
  await p.waitForSelector('#s-draft.on');
  await p.waitForFunction(() => document.querySelectorAll('#opts .tile').length > 0, null, { timeout: 25000 });
  return { ctx, p };
}
const parkOn = (p) => p.evaluate(() => { const s = document.querySelector('#field svg'); return s && s.getAttribute('data-park'); });

head('4. THE ACCOUNT\'S PARK IS THE ONE THE DRAFT IS PLAYED ON');
const rows = vet.map((r) => Object.assign({ u: 'acct1' }, r));
{
  const { ctx, p } = await openAs({ acct: 'acct1', rows, pref: { acct1: 'ivy' } });
  claim(await parkOn(p) === 'ivy', 'a chosen, earned park is drawn');
  const geo = await p.evaluate(() => {
    const f = document.getElementById('field').getBoundingClientRect();
    const chips = [...document.querySelectorAll('#field .chip')].filter((c) => c.style.display !== 'none').map((c) => c.querySelector('.disc').getBoundingClientRect());
    return { ratio: f.height / f.width, out: chips.filter((d) => d.top < f.top || d.bottom > f.bottom || d.left < f.left - 2 || d.right > f.right + 2).length, n: chips.length,
      tag: (document.getElementById('park-tag') || {}).textContent || '' };
  });
  claim(Math.abs(geo.ratio - (68 + 10) / 100) < 0.02, `the parked field is taller by its sky (${geo.ratio.toFixed(3)})`);
  claim(geo.n >= 10 && geo.out === 0, `every chip stands inside the field (${geo.n} drawn)`);
  claim(/Ivy Corner/i.test(geo.tag), 'the field names its park');
  /* the tag opens the shelf, and the shelf changes the park */
  await p.click('#park-tag');
  await p.waitForSelector('#sheet-profile .pk-card');
  const shelf = await p.evaluate(() => ({ cards: document.querySelectorAll('.pk-card').length,
    locked: document.querySelectorAll('.pk-card.locked').length, on: (document.querySelector('.pk-card.on .pk-name') || {}).textContent }));
  claim(shelf.cards === 13, `the shelf draws every park (${shelf.cards})`);
  claim(shelf.locked === 2 && /Ivy/i.test(shelf.on), `the two Pro parks are locked for a free veteran, and the one in use is marked (${shelf.locked})`);
  await p.click('.pk-use[data-park="monster"]');
  await p.evaluate(() => document.querySelector('#sheet-profile .sheet-x').click());
  await p.waitForTimeout(200);
  claim(await parkOn(p) === 'monster', 'using a park redraws the draft on it');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('rtd_park_v1')));
  claim(stored && stored.acct1 === 'monster', 'and the choice is stored against the account');
  await ctx.close();
}
head('5. A PARK THE ACCOUNT CANNOT BACK IS NEVER DRAWN');
{
  const { ctx, p } = await openAs({ acct: 'acct1', rows, pref: { acct1: 'dome' } });
  claim(await parkOn(p) === 'home', 'a Pro park chosen by an account without Pro falls back to the home park');
  await ctx.close();
}
{
  const { ctx, p } = await openAs({ acct: 'acct2', rows, pref: { acct1: 'ivy', acct2: 'ivy' } });
  claim(await parkOn(p) === 'home', 'another account\'s seasons earn this one nothing');
  await ctx.close();
}
{
  const { ctx, p } = await openAs({ rows, pref: { acct1: 'ivy' } });
  claim(await parkOn(p) === 'home', 'a guest drafts on the home park');
  await ctx.close();
}
claim(!errors.length, 'no page error', errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`\n${fails ? fails + ' of ' + (fails + passes) + ' checks FAILED' : 'All ' + passes + ' checks passed.'}`);
process.exit(fails ? 1 : 0);
