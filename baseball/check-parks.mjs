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
head('1. EVERY PARK IS IN THE CATALOGUE ONCE, AND EVERYBODY STARTS ON THE SANDLOT');
const ids = PK.PARKS.map((p) => p.id);
claim(new Set(ids).size === ids.length, `${ids.length} parks, no id twice`);
claim(PK.PARKS[0].id === PK.START && PK.START === 'sandlot' && PK.status(PK.PARKS[0], null).ok, 'the sandlot is first and yours as a guest');
claim(PK.PARKS.every((p) => PK.GROUPS.some((g) => g[0] === p.group)), 'every park sits in one of the shelf\'s groups');
/* The server keeps the choice, and 128's check constraint is the list it will take. A
   park the page offers and the server refuses works on this device and is gone on the
   next, so the two lists are held together here. */
{
  const sql = readFileSync(path.join(HERE, '..', 'supabase', '128_baseball_parks.sql'), 'utf8');
  const listed = [...((/park in \(([\s\S]*?)\)\);/.exec(sql) || [])[1] || '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  claim(listed.join() === ids.slice().sort().join(), `128 lets the server save exactly the parks the shelf offers (${listed.length})`,
    'missing ' + ids.filter((i) => !listed.includes(i)).join(',') + '; extra ' + listed.filter((i) => !ids.includes(i)).join(','));
}
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
  claim(new Set(list).size === list.length, `all ${PK.PARKS.length} in one document share no id`);
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
const infoOf = (rows, pro) => ({ signed: true, pro: !!pro, rows, badges: ACH.evaluate(rows).earned.length, ctx: ACH.buildCtx(rows) });
claim(PK.unlockedIds(null).join() === 'sandlot', 'a guest has the sandlot and nothing else');
claim(PK.unlockedIds(infoOf([])).join() === 'sandlot', 'a new account has the sandlot and nothing else');
/* A career that has done every thing the rules ask for: the whole season track (350),
   five titles, and October in every mode, built from the modes the badge file itself
   lists, so it cannot drift from what the game records. */
const flags = { era: { era: '1950s' }, franchise: { franchise: 'NYY' }, division: { division: 'AL East' },
  survivor: { capSurvivor: true }, staff: { staff: true }, trade: { tradeMachine: true }, classic: {} };
const vet = [];
for (let i = 0; i < 350; i++) {
  const m = ACH.MODES[i % ACH.MODES.length][0];
  vet.push(row(Object.assign({ ts: 1.7e12 + i * 864e5, wins: 72 + (i % 30), losses: 90 - (i % 30),
    madePlayoffs: i % 7 < 7 && i > 20, titleWon: i >= 340 && i < 345 }, flags[m] || {})));
}
/* and the seasons that open the seasonal and hidden parks: one inside each window,
   one after midnight Eastern, one terrible year and one record year */
const et = (y, mo, d, h) => Date.UTC(y, mo - 1, d, h + 4, 0, 0);
for (const [mo, d] of [[3, 25], [7, 4], [10, 30], [12, 24]]) vet.push(row({ ts: et(2025, mo, d, 15) }));
vet.push(row({ ts: et(2025, 5, 12, 1) }), row({ ts: et(2025, 5, 13, 15), wins: 50, losses: 112 }),
  row({ ts: et(2025, 5, 14, 15), wins: 116, losses: 46 }));
const vi = infoOf(vet), vp = infoOf(vet, true);
const notPro = PK.PARKS.filter((p) => !p.unlock.pro);
const stuck = notPro.filter((p) => !PK.status(p, vi).ok).map((p) => p.name);
claim(!stuck.length, 'a career that finished the track and every task has every park that is not Pro', stuck.join(', ') + ` (badges ${vi.badges})`);
claim(PK.PARKS.filter((p) => p.unlock.pro).every((p) => !PK.status(p, vi).ok && PK.status(p, vp).ok), 'a Pro park is Pro and only Pro');
claim(ACH.MODES.length === 7 && /7 modes/.test(PK.BY_ID.bayside.unlock.label), 'the rule that says "all 7 modes" counts the modes the game has');
claim(PK.PARKS.filter((p) => p.unlock.of > 1).every((p) => { const s = PK.status(p, infoOf([])); return s.have === 0 && s.of > 1; }),
  'a park with a count reports how far along an account is');

/* THE ROAD TO THE SHOW, then the long grind. Everybody starts on the sandlot and
   climbs Little League, high school, college and the three minor league levels to
   the Show, and the track goes on through the big league parks. Strictly
   increasing, each step opens exactly one park, the Show is a real climb and the
   last step is hundreds of seasons out. */
const track = PK.PARKS.filter((p) => p.unlock.track);
const steps = track.map((p) => p.unlock.of);
claim(steps.every((v, i) => i === 0 || v > steps[i - 1]), 'the season track climbs: ' + steps.join(', '));
claim(steps[0] >= 3 && steps[steps.length - 1] >= 300, 'it starts a few seasons in and ends hundreds of seasons out');
const road = PK.PARKS.filter((p) => p.group === 'road');
claim(road.map((p) => p.tier).join() === 'Sandlot,Little League,High School,College,Single-A,Double-A,Triple-A,The Show',
  'the road runs sandlot, Little League, high school, college, A, AA, AAA, the Show', road.map((p) => p.tier).join());
claim(road.slice(1).every((p) => p.unlock.track), 'every rung past the sandlot is on the track');
const show = PK.BY_ID.home.unlock.of;
claim(show >= 40 && show <= 100, `the Show takes a real climb (${show} seasons)`);
claim(PK.PARKS.filter((p) => p.group === 'majors').every((p) => p.unlock.track && p.unlock.of > show), 'the big league parks come after the Show');
const seasons = (n) => { const r = []; for (let i = 0; i < n; i++) r.push(row({ ts: 1.6e12 + i * 1000, wins: 85, losses: 77 })); return infoOf(r); };
const opened = (n) => PK.unlockedIds(seasons(n)).length;
claim(opened(steps[0] - 1) === 1, 'before the first step the sandlot is the only park', String(opened(steps[0] - 1)));
claim(steps.every((v) => opened(v) === opened(v - 1) + 1), 'each step of the track opens exactly one park');
const offTrack = PK.PARKS.filter((p) => p.special || p.hidden || p.unlock.seasonal);
claim(offTrack.length >= 9 && offTrack.every((p) => !p.unlock.track && !PK.status(p, seasons(400)).ok),
  `the ${offTrack.length} special, seasonal and hidden parks are not on the track, and four hundred plain seasons open none of them`);
const nx = PK.nextOnTrack(seasons(12));
claim(nx && nx.park.id === 'singlea' && nx.left === 8, 'the shelf names the next park and how far off it is', JSON.stringify(nx && { id: nx.park.id, left: nx.left }));

/* SEASONAL PARKS OPEN ON THE EASTERN CALENDAR, and one season inside the window is
   enough. The winter window wraps the new year, which is the case a naive range test
   gets wrong. */
{
  const one = (ts) => infoOf([row({ ts })]);
  const has = (id, ts) => PK.status(PK.BY_ID[id], one(ts)).ok;
  claim(has('fireworks', et(2026, 7, 4, 20)) && !has('fireworks', et(2026, 7, 8, 20)), 'Fireworks Night opens on July 4 and not July 8');
  claim(has('winter', et(2026, 12, 31, 12)) && has('winter', et(2027, 1, 2, 12)) && !has('winter', et(2027, 1, 5, 12)),
    'Winter Classic wraps the new year: Dec 31 and Jan 2 yes, Jan 5 no');
  claim(has('opener', et(2026, 3, 20, 9)) && has('opener', et(2026, 4, 10, 22)) && !has('opener', et(2026, 4, 11, 9)), 'Opening Day holds both ends of its window, inclusive');
  /* 11pm Eastern on Oct 31 is Nov 1 in UTC. The window is Eastern. */
  claim(has('haunted', et(2026, 10, 31, 23)), 'the window is the Eastern day, not the UTC one (11pm Oct 31)');
  claim(PK.seasonOpen(PK.BY_ID.fireworks, et(2026, 7, 3, 12)) && !PK.seasonOpen(PK.BY_ID.fireworks, et(2026, 7, 9, 12)), 'the shelf can tell when a window is open now');
}
/* HIDDEN PARKS KEEP THEIR SECRET from a guest, and the page hides it from a signed in
   account until earned. What opens each is asked of real rows. */
{
  const hid = PK.PARKS.filter((p) => p.hidden);
  claim(hid.length >= 3 && hid.every((p) => p.unlock.hint && !PK.status(p, null).label.includes(p.unlock.label.slice(0, 12))),
    'every hidden park has a hint, and a guest is not told the rule');
  const one = (o) => infoOf([row(o)]);
  claim(PK.status(PK.BY_ID.moonlight, one({ ts: et(2026, 5, 1, 2) })).ok && !PK.status(PK.BY_ID.moonlight, one({ ts: et(2026, 5, 1, 5) })).ok,
    'Moonlight Park opens on a season finished at 2am Eastern and not at 5am');
  claim(PK.status(PK.BY_ID.rainout, one({ losses: 110, wins: 52 })).ok && !PK.status(PK.BY_ID.rainout, one({ losses: 109, wins: 53 })).ok, 'Rain Delay opens at 110 losses');
  claim(PK.status(PK.BY_ID.golden, one({ wins: 116, losses: 46 })).ok && !PK.status(PK.BY_ID.golden, one({ wins: 115, losses: 47 })).ok, 'the Golden Diamond opens at 116 wins');
}

{
  /* WHAT AN ACCOUNT EARNED UNDER THE OLD LADDER IS KEPT, and only that. The old
     rules are asked of the rows filed before the road to the Show; a season played
     after it earns by the new ladder alone. The page's parkLegacy is mirrored here. */
  const legacyOf = (rows) => { const old = rows.filter((r) => Number(r.ts) < PK.LEGACY_UNTIL);
    return old.length ? { badges: ACH.evaluate(old).earned.length, ctx: ACH.buildCtx(old) } : null; };
  const withLegacy = (rows) => Object.assign(infoOf(rows), { legacy: legacyOf(rows) });
  const before = PK.LEGACY_UNTIL - 86400000, after = PK.LEGACY_UNTIL + 86400000;
  const champ = (ts) => [row({ ts, wins: 101, losses: 61, madePlayoffs: true, titleWon: true })];
  const kept = (rows) => ['cornfield', 'warehouse', 'ravine', 'milehigh', 'frieze'].filter((id) => PK.status(PK.BY_ID[id], withLegacy(rows)).ok);
  claim(kept(champ(before)).length === 5, 'a title season filed before the ladder keeps the five big league parks it opened', kept(champ(before)).join());
  claim(kept(champ(after)).length === 0, 'the same season filed after it keeps none of them: the road decides', kept(champ(after)).join());
  claim(Object.keys(PK.LEGACY).every((id) => PK.BY_ID[id] && !['road', 'pro', 'seasonal', 'hidden'].includes(PK.BY_ID[id].group)),
    'the old rules only reach parks the old ladder handed out', Object.keys(PK.LEGACY).map((id) => id + ':' + (PK.BY_ID[id] || {}).group).join());
  const page = readFileSync(path.join(HERE, 'index.html'), 'utf8');
  claim(/function parkLegacy\(rows\)[\s\S]{0,200}LEGACY_UNTIL/.test(page) && (page.match(/parkLegacy\(rows\)/g) || []).length >= 3,
    'the page hands the old rows to both park readers');
}

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
  if (opts.home) return { ctx, p };
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
  claim(shelf.cards === PK.PARKS.length, `the shelf draws every park (${shelf.cards})`);
  claim(shelf.locked === 2 && /Ivy/i.test(shelf.on), `the two Pro parks are locked for a free veteran, and the one in use is marked (${shelf.locked})`);
  await p.click('.pk-use[data-park="monster"]');
  await p.evaluate(() => document.querySelector('#sheet-profile .sheet-x').click());
  await p.waitForTimeout(200);
  claim(await parkOn(p) === 'monster', 'using a park redraws the draft on it');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('rtd_park_v1')));
  claim(stored && stored.acct1 === 'monster', 'and the choice is stored against the account');
  await ctx.close();
}
head('4b. THE FRONT PAGE AND THE PROFILE SHOW THE PARK IN USE');
{
  const heroOn = (p) => p.evaluate(() => { const s = document.querySelector('#h-field svg'); return s && s.getAttribute('data-park'); });
  const { ctx, p } = await openAs({ acct: 'acct1', rows, pref: { acct1: 'ivy' }, home: true });
  claim(await heroOn(p) === 'ivy', 'the front page field is the park the account chose');
  const chipsBefore = await p.evaluate(() => document.querySelectorAll('#h-field .chip').length);
  await p.click('#b-profile');
  await p.waitForSelector('#pf-park-go');
  claim(/Ivy Corner/.test(await p.textContent('#pf-park-go')) && await p.evaluate(() => !!document.querySelector('#pf-park-go svg[data-park="ivy"]')),
    'the profile shows the same park, drawn');
  await p.click('#pf-park-go');
  await p.waitForSelector('.pk-use[data-park="monster"]');
  await p.click('.pk-use[data-park="monster"]');
  await p.waitForTimeout(200);
  claim(await heroOn(p) === 'monster', 'choosing another park redraws the front page on it');
  await p.click('#pf-in .pf-back');
  await p.waitForSelector('#pf-park-go');
  claim(/Monster|monster/.test(await p.textContent('#pf-park-go')) || await p.evaluate(() => !!document.querySelector('#pf-park-go svg[data-park="monster"]')),
    'and the profile follows');
  const chipsAfter = await p.evaluate(() => document.querySelectorAll('#h-field .chip').length);
  claim(chipsBefore >= 10 && chipsAfter === chipsBefore, `the front page keeps its chips through the change (${chipsBefore} then ${chipsAfter})`);
  await ctx.close();
}
{
  const { ctx, p } = await openAs({ rows, pref: { acct1: 'ivy' }, home: true });
  claim(await p.evaluate(() => (document.querySelector('#h-field svg') || {}).getAttribute('data-park')) === 'home', 'a guest\'s front page shows the big league park');
  await ctx.close();
}
head('5. A PARK THE ACCOUNT CANNOT BACK IS NEVER DRAWN');
{
  const { ctx, p } = await openAs({ acct: 'acct1', rows, pref: { acct1: 'dome' } });
  claim(await parkOn(p) === 'home', 'a Pro park chosen by an account without Pro falls back to the highest rung it has reached (the Show)');
  await ctx.close();
}
{
  const { ctx, p } = await openAs({ acct: 'acct2', rows, pref: { acct1: 'ivy', acct2: 'ivy' } });
  claim(await parkOn(p) === 'sandlot', 'another account\'s seasons earn this one nothing');
  await ctx.close();
}
{
  const { ctx, p } = await openAs({ rows, pref: { acct1: 'ivy' } });
  claim(await parkOn(p) === 'sandlot', 'a guest drafts on the sandlot');
  await ctx.close();
}
claim(!errors.length, 'no page error', errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`\n${fails ? fails + ' of ' + (fails + passes) + ' checks FAILED' : 'All ' + passes + ' checks passed.'}`);
process.exit(fails ? 1 : 0);
