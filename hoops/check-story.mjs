/*
 * Run The Floor: the story engine holds together.
 *
 *   node hoops/check-story.mjs            six hundred story careers and the rules they keep
 *   node hoops/check-story.mjs --quick    two hundred
 *
 * Phase C made events data, gave a career memory, people, arcs, hidden traits,
 * a build, a living league, goals and a media feed. Each of those can go wrong
 * in a way nothing throws for: a card about a game dealt after the season is
 * over, a partner named while single, an arc that only ever ends one way, a
 * trait that is revealed and was never there, a real coach in a story. This
 * file plays careers and asks for each property directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const C = require('./career.js');
const E = require('./engine.js');
const ROWS = require('./data/players.json');
const FX = JSON.parse(fs.readFileSync(path.join(HERE, 'build/fixtures/career-v1-saves.json'), 'utf8'));
const QUICK = process.argv.includes('--quick');
const N = QUICK ? 200 : 600;

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }
const clone = (x) => JSON.parse(JSON.stringify(x));
const league = C.seedLeague(ROWS);
const words = (s) => String(s).replace(/\{[a-z0-9]+(?::\w+)?\}/gi, 'X').split(/\s+/).filter(Boolean).length;
const POOLS = { nba: C.EVENTS, am: C.AM_EVENTS, arc: C.ARC_EVENTS };

/* One career, every card it was dealt and the state it was dealt in. */
function play(seed, start, pickFn) {
  const L = C.newLife({ seed, league, start });
  const r = E.createSeededRNG(E.hashSeed(seed + ':pol'));
  const cards = [];
  let g = 0;
  while (!L.retired && g++ < 4000) {
    if (L.pending.length) {
      const c = L.pending[0];
      cards.push({ c: clone(c), year: L.year, am: !!(L.am && L.stage !== 'nba'), cont: C.continuity(L, c) });
      C.choose(L, pickFn ? pickFn(c, r) : Math.floor(r() * c.options.length));
    } else C.step(L);
  }
  return { L, cards };
}

section('1. every event is data the picker can read');
{
  const L = C.newLife({ seed: 'schema', league });
  for (const k in POOLS) for (const id in POOLS[k]) {
    const ev = POOLS[k][id];
    ok(ev.id === id && Array.isArray(ev.phases) && ev.phases.length && Array.isArray(ev.tags) && C.RARITY[ev.rarity] && typeof ev.weight === 'function' && typeof ev.when === 'function',
      `${id}: id, phases, tags, rarity, weight and when are all filled in`);
    let threw = null;
    try { C.reqOk(L, ev.req); } catch (e) { threw = e.message; }
    ok(!threw, `${id}: its prerequisites are all known fields (${threw || 'ok'})`);
  }
  let threw = false;
  try { C.reqOk(L, { nonsense: 1 }); } catch (e) { threw = true; }
  ok(threw, 'an unknown prerequisite is refused, never silently true');
}

section('2. a save from before plays without any of it');
{
  for (const k in FX.saves) {
    const L = C.migrate(clone(FX.saves[k]));
    let g = 0;
    while (!L.retired && g++ < 120) { if (L.pending.length) C.choose(L, 0); else C.step(L); }
    ok(!C.storyOn(L) && !L.evlog && !L.feed && !L.arcs && !L.badges && !L.goals, `${k}: no story ledger, feed, arcs, badges or goals`);
  }
  const off = C.newLife({ seed: 'off', league, story: false });
  ok(!C.storyOn(off) && !('story' in off.opt), 'a career started with story off carries no story flag at all');
  ok(C.storyOn(C.newLife({ seed: 'on', league })), 'a new career is a story career');
}

const runs = [];
for (let i = 0; i < N; i++) runs.push(play('st' + i, i % 2 ? 'hs' : 'draft'));

section('3. every card says when it is, and the story happens in order');
{
  const NBA = /^(September|December|February|April|Summer) \d{4}$/;
  const AM = /^(Freshman|Sophomore|Junior|Senior) year · (January|December|March|October|Summer)$/;
  let events = 0, bad = [], cont = [];
  for (const x of runs) for (const k of x.cards) {
    if (k.c.kind !== 'event' || !(C.EVENTS[k.c.id] || C.AM_EVENTS[k.c.id] || C.ARC_EVENTS[k.c.id])) continue;
    events++;
    if (!(k.am ? AM : NBA).test(k.c.eyebrow)) bad.push(k.c.id + ' "' + k.c.eyebrow + '"');
    for (const c of k.cont) cont.push(c);
  }
  ok(events > N * 20, `the sweep met plenty of events (${events})`);
  ok(bad.length === 0, `every event card carries its month (${bad.slice(0, 4).join('; ') || 'all of them'})`);
  ok(cont.length === 0, `no continuity hit on any card (${cont.slice(0, 4).join('; ') || 'none'})`);
  const logs = runs.flatMap((x) => C.continuityLog(x.L));
  ok(logs.length === 0, `no life logged out of order and no memory from the future (${logs.slice(0, 3).join('; ') || 'none'})`);
  /* The scan has to be able to fail: put the regular season back into April. */
  const saved = Object.assign({}, C.STORY_PHASES);
  for (const k in C.STORY_PHASES) delete C.STORY_PHASES[k];
  let hits = 0;
  for (let i = 0; i < 40 && !hits; i++) hits += play('mut' + i, 'draft').cards.reduce((s, k) => s + k.cont.length, 0);
  Object.assign(C.STORY_PHASES, saved);
  ok(hits > 0, `with the April rule removed, the scan reports it (${hits} hits)`);
  const ol = runs.filter((x) => x.cards.some((k) => k.c.id === 'olympics'));
  ok(ol.every((x) => x.cards.filter((k) => k.c.id === 'olympics').every((k) => k.year % 4 === 0)), 'the Olympics come only in Olympic years');
}

section('4. the copy is short');
{
  const L = C.newLife({ seed: 'copy', league });
  const long = [];
  for (const k in POOLS) for (const id in POOLS[k]) {
    const ev = POOLS[k][id];
    const title = typeof ev.title === 'function' ? ev.title(L) : ev.title;
    let text = '';
    try { text = ev.text(L); } catch (e) { text = ''; }
    if (words(title) > 10) long.push(id + ' title ' + words(title));
    if (words(text) > 22) long.push(id + ' text ' + words(text));
    if ((String(text).match(/[.!?](\s|$)/g) || []).length > 3) long.push(id + ' text has more than three sentences');
    for (const o of ev.options) {
      if (words(o.label) > 7) long.push(id + ' label "' + o.label + '"');
      for (const m of o.run.toString().matchAll(/return '([^']+)'/g)) if (words(m[1]) > 16) long.push(id + ' result ' + words(m[1]) + ': ' + m[1].slice(0, 40));
    }
  }
  ok(long.length === 0, `titles under 11 words, card text under 23 and three sentences, answers under 8, results under 17 (${long.slice(0, 5).join('; ') || 'all'})`);
}

section('5. arcs: set up, escalate, pay off, and end more than one way');
{
  const how = {}, nodes = {};
  let early = 0;
  for (const x of runs) {
    for (const id in x.L.arcs || {}) { const a = x.L.arcs[id]; if (a.done && a.done !== 'faded') (how[id] = how[id] || new Set()).add(a.done); }
    for (const k of x.cards) if (C.ARC_EVENTS[k.c.id]) { nodes[k.c.id] = (nodes[k.c.id] || 0) + 1; const id = k.c.id.split('_')[1]; const a = x.L.arcs[id]; if (a && k.year < a.at) early++; }
  }
  const arcs = [...new Set(Object.keys(C.ARC_EVENTS).map((n) => n.split('_')[1]))];
  ok(arcs.length >= 6, `six arcs or more (${arcs.join(', ')})`);
  for (const id of arcs) ok(how[id] && how[id].size >= 2, `${id} settles at least two ways (${how[id] ? [...how[id]].join(', ') : 'never'})`);
  const dark = Object.keys(C.ARC_EVENTS).filter((n) => !nodes[n]);
  ok(dark.length === 0, `every arc node is dealt somewhere (${dark.join(', ') || 'all'})`);
  ok(early === 0, 'no arc node comes before its setup');
  const once = runs.every((x) => { const seen = {}; return x.cards.every((k) => !C.ARC_EVENTS[k.c.id] || !(seen[k.c.id] = (seen[k.c.id] || 0) + 1) || seen[k.c.id] === 1); });
  ok(once, 'an arc node is dealt at most once in a career');
}

section('6. memory and callbacks point backwards');
{
  const L = C.newLife({ seed: 'mem', league });
  C.remember(L, 'arc.feud.won', true);
  ok(C.callback(L, 'arc.feud.won') === '', 'a memory from this season is not called back yet');
  L.year += 2;
  ok(/two seasons ago\.$/.test(C.callback(L, 'arc.feud.won')), `two seasons on it says so (${C.callback(L, 'arc.feud.won')})`);
  L.year += 5;
  ok(/back in \d{4}-\d{2}\.$/.test(C.callback(L, 'arc.feud.won')), `seven seasons on it names the season (${C.callback(L, 'arc.feud.won')})`);
  const fut = runs.filter((x) => Object.values(x.L.mem || {}).some((m) => m.y > x.L.year));
  ok(fut.length === 0, 'no career remembers anything from after it ended');
}

section('7. traits are revealed by play, and only the ones you have');
{
  const seen = {};
  let wrong = 0;
  for (const x of runs) for (const k in x.L.traits) { const t = x.L.traits[k]; if (t.known) { seen[k] = (seen[k] || 0) + 1; if (!t.has || !t.why) wrong++; } }
  ok(wrong === 0, 'every revealed trait is one the career has, with a reason');
  const dark = C.TRAITS.filter((k) => !seen[k]);
  ok(dark.length === 0, `every trait is revealed somewhere (${dark.join(', ') || 'all fifteen'})`);
}

section('8. the people are invented, and the card about them is about them');
{
  const real = new Set(C.COACH_NAMES);
  for (const c in (league.roster || {})) for (const p of league.roster[c] || []) real.add(p.n);
  const leak = [];
  for (const x of runs) for (const id in x.L.people || {}) if (real.has(x.L.people[id].n)) leak.push(x.L.people[id].n);
  ok(leak.length === 0, `no real player or coach in any person ledger (${leak.slice(0, 3).join(', ') || 'none'})`);
  const feedLeak = [];
  for (const x of runs) for (const f of x.L.feed || []) for (const n of C.COACH_NAMES) if (f.t.indexOf(n) >= 0) feedLeak.push(n);
  ok(feedLeak.length === 0, `no real coach in the news feed (${feedLeak.slice(0, 3).join(', ') || 'none'})`);
  /* An agent card is about the agent you had when it was dealt. */
  const L = C.newLife({ seed: 'agent', league });
  const was = C.say(L, '{agent}');
  L.pending.unshift({ id: 'agent_pitch', kind: 'event', key: 'off:agent_pitch', title: '', text: '', options: [{ label: 'a' }, { label: 'b' }] });
  C.choose(L, 0);
  const p = L.people['agent:' + was];
  ok(p && p.rel <= -40, `switching agents is held against the old one, not the new (${was}: ${p ? p.rel : 'missing'})`);
  const avg = runs.reduce((s, x) => s + Object.keys(x.L.people || {}).length, 0) / runs.length;
  ok(avg >= 8, `a career meets a real cast of people (${avg.toFixed(1)} a career)`);
}

section('9. a living league: one MVP, one champion, every season');
{
  let seasons = 0, noMvp = 0, noChamp = 0, clash = 0;
  for (const x of runs) {
    const L = x.L;
    const names = (L.league.figs || []).map((f) => f.n);
    if (names.indexOf(L.name) >= 0 || (L.rival && names.indexOf(L.rival.name) >= 0)) clash++;
    for (const h of L.history) {
      seasons++;
      if (!L.league.champs || !L.league.champs[h.y]) noChamp++;
    }
    if (L.history.some((h) => !h.mvpBy)) noMvp++;
    if (L.history.some((h) => (h.aw || []).indexOf('mvp') >= 0 && h.mvpBy !== L.name)) noMvp++;
  }
  ok(seasons > N * 5, `the sweep played seasons (${seasons})`);
  ok(noChamp === 0, `every NBA season has a champion on record (${noChamp} missing)`);
  ok(noMvp === 0, `every season names an MVP, you or somebody else (${noMvp} careers short)`);
  ok(clash === 0, 'no invented league star shares a name with you or your rival');
}

section('10. goals are offered, chased, and judged');
{
  const G = runs.flatMap((x) => x.L.goals || []);
  ok(G.length > N * 5, `goals are set most seasons (${G.length})`);
  const share = G.filter((g) => g.met).length / Math.max(1, G.length);
  ok(share > 0.25 && share < 0.8, `a goal is a real ask: met ${(share * 100).toFixed(0)}% of the time`);
  const kinds = new Set(G.map((g) => g.k));
  ok(kinds.size >= 7, `goals fit many careers (${[...kinds].join(', ')})`);
}

section('11. the page shows it: people, legacy, news, and what you are known for');
await (async () => {
  const ROOT = path.join(HERE, '..');
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (!fs.existsSync(CHROME)) { console.log('  no browser here; skipped'); return; }
  const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
  async function serve(route) {
    const u = new URL(route.request().url());
    if (u.hostname !== 'local.test') return route.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  /* A story career seven seasons in, and an old save, side by side. */
  const story = runs.find((x) => x.L.history.length >= 9 && Object.keys(x.L.people).length >= 6);
  const mid = C.newLife({ seed: story.L.seed, league, start: story.L.amHist.length ? 'hs' : 'draft' });
  const r = E.createSeededRNG(E.hashSeed(story.L.seed + ':pol'));
  let g = 0;
  while (!mid.retired && g++ < 4000 && mid.history.length < 7) { if (mid.pending.length) C.choose(mid, Math.floor(r() * mid.pending[0].options.length)); else C.step(mid); }
  const old = C.migrate(clone(FX.saves.nba_mid));
  const b = await pw.chromium.launch({ executablePath: CHROME });
  async function open(L) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    await page.addInitScript((sv) => { try { localStorage.setItem('rtf.guide.v1', '1'); localStorage.setItem('rtf.scenes.v1', 'off'); localStorage.setItem('rtf.life.v1', sv); } catch (e) {} },
      JSON.stringify({ cur: L, hof: [], last: null }));
    await page.route('**/*', serve);
    await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#b-career:not([disabled])', { state: 'attached', timeout: 30000 });
    await page.evaluate(() => document.querySelector('#b-career').click());
    await page.waitForSelector('.cr-tabs', { timeout: 15000 });
    return { ctx, page, errs };
  }
  const s1 = await open(mid);
  const tabs = await s1.page.$$eval('.cr-tabs [data-tab]', (a) => a.map((x) => x.getAttribute('data-tab')));
  ok(['people', 'legacy', 'news'].every((t) => tabs.indexOf(t) >= 0), `a story career has the People, Legacy and News tabs (${tabs.join(', ')})`);
  for (const t of ['people', 'legacy', 'news']) {
    await s1.page.click('[data-tab="' + t + '"]');
    const html = await s1.page.$eval('.cr-tabs + [role="tabpanel"]', (e) => e.textContent);
    ok(html.length > 60 && !/undefined|NaN|\{[a-z]+\}/.test(html), `the ${t} tab draws real content (${html.slice(0, 50).replace(/\s+/g, ' ')})`);
  }
  const wide = await s1.page.$$eval('.cr-tabs [data-tab]', (a) => a.every((x) => x.scrollWidth <= x.clientWidth + 1));
  ok(wide, 'every tab label fits its tab on a phone');
  ok(s1.errs.length === 0, `no page error (${s1.errs.join(' | ') || 'none'})`);
  await s1.ctx.close();
  const s2 = await open(old);
  const tabs2 = await s2.page.$$eval('.cr-tabs [data-tab]', (a) => a.map((x) => x.getAttribute('data-tab')));
  ok(tabs2.length === 3, `an old save keeps its three tabs (${tabs2.join(', ')})`);
  ok(s2.errs.length === 0, `an old save opens without an error (${s2.errs.join(' | ') || 'none'})`);
  await s2.ctx.close();
  await b.close();
})();

console.log(`\n${failures.length ? failures.map((f) => '  FAIL: ' + f).join('\n') + '\n\n' : ''}${passed} passed${failures.length ? ', ' + failures.length + ' FAILED' : ''}.`);
process.exit(failures.length ? 1 : 0);
