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
/* Today's rosters when the repo has them (hoops/data/rosters.json, written by
   the roster workflow), so every section plays the league a career joins. */
const ROSTERS = fs.existsSync(path.join(HERE, 'data', 'rosters.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'rosters.json'), 'utf8')) : null;
const league = C.seedLeague(ROWS, C.withRatings(ROSTERS, (() => { const f = new URL('./data/ratings.json', import.meta.url); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; })()));
const words = (s) => String(s).replace(/\{[a-z0-9]+(?::\w+)?\}/gi, 'X').split(/\s+/).filter(Boolean).length;
const POOLS = { nba: C.EVENTS, am: C.AM_EVENTS, arc: C.ARC_EVENTS, story: C.STORY_EV, team: C.TEAM_EV };

/* One career, every card it was dealt and the state it was dealt in. */
function play(seed, start, pickFn, more) {
  const L = C.newLife(Object.assign({ seed, league, start }, more || {}));
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
  /* Phase D's moments between the two: the year away, the weeks before a
     draft, and draft night itself. */
  const AWAY = new RegExp('^(' + Object.values(C.ALT_NAME).join('|') + ') · January$|^Before the \\d{4} draft$|^Draft night \\d{4}$');
  let events = 0, bad = [], cont = [];
  for (const x of runs) for (const k of x.cards) {
    const sev = C.STORY_EV[k.c.id];
    if (k.c.kind !== 'event' || !(C.EVENTS[k.c.id] || C.AM_EVENTS[k.c.id] || C.ARC_EVENTS[k.c.id] || (sev && sev.pool !== 'post'))) continue;
    events++;
    if (!(k.am ? AM : NBA).test(k.c.eyebrow) && !AWAY.test(k.c.eyebrow)) bad.push(k.c.id + ' "' + k.c.eyebrow + '"');
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
    /* A second take is held to the same limits as the card it stands in for. */
    for (const t of ev.takes || []) {
      const tt = typeof t.title === 'function' ? t.title(L) : t.title;
      let tx = ''; try { tx = t.text(L); } catch (e) { tx = ''; }
      if (words(tt) > 10) long.push(id + ' take title ' + words(tt));
      if (words(tx) > 22) long.push(id + ' take text ' + words(tx));
      if ((String(tx).match(/[.!?](\s|$)/g) || []).length > 3) long.push(id + ' take text has more than three sentences');
      for (const o of t.options) {
        if (words(o.label) > 7) long.push(id + ' take label "' + o.label + '"');
        if (!o.hint || words(o.hint) > 6 || o.hint === o.label) long.push(id + ' take "' + o.label + '" hint');
        if (!Array.isArray(o.rep)) long.push(id + ' take "' + o.label + '" carries no reputation');
        for (const m of o.run.toString().matchAll(/return '([^']+)'/g)) if (words(m[1]) > 16) long.push(id + ' take result ' + words(m[1]) + ': ' + m[1].slice(0, 40));
      }
    }
  }
  ok(long.length === 0, `titles under 11 words, card text under 23 and three sentences, answers under 8, results under 17 (${long.slice(0, 5).join('; ') || 'all'})`);
  /* Run The Tour's shape: a place over the title, and a line under every
     answer saying what the choice is really about. */
  const bare = [];
  for (const k in POOLS) for (const id in POOLS[k]) {
    const ev = POOLS[k][id];
    const tag = typeof ev.tag === 'function' ? ev.tag(L) : ev.tag;
    if (!tag || words(tag) > 3) bare.push(id + ' tag');
    for (const o of ev.options) if (!o.hint || words(o.hint) > 6 || o.hint === o.label) bare.push(id + ' "' + o.label + '"');
  }
  ok(bare.length === 0, `every card names its place in three words or less, and every answer has a line under it of six or less (${bare.length} missing: ${bare.slice(0, 5).join('; ') || 'none'})`);
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
  /* Every arc is WRITTEN to end two ways or more: read off the nodes. */
  const SRC = fs.readFileSync(path.join(HERE, 'career.js'), 'utf8');
  for (const id of arcs) {
    const tags = new Set();
    for (const m of SRC.matchAll(new RegExp("end: \\['" + id + "', '([a-z]+)'\\]", 'g'))) tags.add(m[1]);
    for (const m of SRC.matchAll(new RegExp("arcEnd\\(L, '" + id + "', ([^)]*)\\)", 'g'))) for (const q of m[1].matchAll(/'([a-z]+)'/g)) tags.add(q[1]);
    ok(tags.size >= 2, `${id} is written to end at least two ways (${[...tags].join(', ') || 'none'})`);
  }
  /* And the ones this sweep settled often enough to judge DID end two ways.
     A rare arc (a legend one, a farewell season) is judged by the 1,000
     career simulator's "events never dealt", not by a sample of two hundred. */
  for (const id of arcs) {
    const n = runs.filter((x) => x.L.arcs && x.L.arcs[id] && x.L.arcs[id].done && x.L.arcs[id].done !== 'faded').length;
    if (n >= 12) ok(how[id].size >= 2, `${id} settles at least two ways in the sweep (${[...how[id]].join(', ')} over ${n})`);
  }
  const dark = Object.keys(C.ARC_EVENTS).filter((n) => !nodes[n] && !C.ARC_EVENTS[n].authored);
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

section('12. Phase D: origins, routes, endings, epilogues and the legend switch');
{
  /* Every origin can be chosen, and it is the one the career reports. */
  for (const k of C.ORIGIN_KEYS) {
    const L = C.newLife({ seed: 'or' + k, league, start: 'hs', origin: k });
    ok(L.origin === k && C.legacy(L).origin === C.ORIGINS[k].name, `the ${k} origin is kept and reported`);
  }
  const anyOrigin = C.newLife({ seed: 'or-any', league });
  ok(C.ORIGIN_KEYS.indexOf(anyOrigin.origin) >= 0, 'with none chosen, one is drawn from the list');
  /* The legend switch, off: no legend card in a single career, ever. */
  let legendOff = 0, legendOn = 0;
  for (let i = 0; i < Math.ceil(N / 4); i++) {
    for (const k of play('lgoff' + i, i % 2 ? 'hs' : 'draft', null, { legend: false }).cards) if (C.evById(k.c.id) && C.evById(k.c.id).legend) legendOff++;
  }
  for (const x of runs) for (const k of x.cards) if (C.evById(k.c.id) && C.evById(k.c.id).legend) legendOn++;
  ok(legendOff === 0, `with legend moments switched off, none is dealt (${legendOff})`);
  ok(legendOn > 0, `with them on, the sweep meets some (${legendOn}), so the zero above means something`);
  /* Routes are recognized from what the career did, and only known ones. */
  const met = new Set();
  let unknown = [];
  for (const x of runs) for (const r of C.routesOf(x.L)) { met.add(r); if (!C.ROUTES[r]) unknown.push(r); }
  ok(unknown.length === 0, `every recognized route is in the catalog (${unknown.slice(0, 3).join(', ') || 'all'})`);
  ok(met.size >= 12, `the sweep recognized many routes (${met.size} of ${Object.keys(C.ROUTES).length})`);
  /* Endings: a catalog of thirty or more, and every finished career has one. */
  ok(C.ENDING_COUNT() >= 30, `thirty endings or more in the catalog (${C.ENDING_COUNT()})`);
  const done = runs.filter((x) => x.L.history.length && x.L.retired);
  const bare = done.filter((x) => !(x.L.final && x.L.final.ending && x.L.final.ending.tier));
  ok(done.length > 20 && bare.length === 0, `every finished NBA career carries an ending (${done.length - bare.length} of ${done.length})`);
  const tierIds = new Set(Object.keys(C.HOF_TIERS));
  ok(done.every((x) => tierIds.has(x.L.final.ending.tier)), 'every ending tier is one of the catalog\'s');
  /* Every road out of the game has its epilogue, and it closes the career. */
  for (const p of C.AFTER_PATHS) ok(!!C.STORY_EV['ep_' + p[0]], `the ${p[0]} path has an epilogue`);
  const eps = done.filter((x) => x.cards.some((k) => /^ep_/.test(k.c.id)));
  ok(eps.length > 10, `finished careers meet their epilogue (${eps.length})`);
  /* Real people stay on the court in everything Phase D wrote. */
  const L = C.newLife({ seed: 'tok', league });
  const real = [];
  const AUTH = Object.assign({}, C.STORY_EV);
  for (const id in C.ARC_EVENTS) if (C.ARC_EVENTS[id].authored) AUTH[id] = C.ARC_EVENTS[id];
  const SRC = fs.readFileSync(path.join(HERE, 'career.js'), 'utf8');
  for (const id in AUTH) {
    const at = SRC.search(new RegExp('\\n  ' + id + ': '));
    if (at < 0) { real.push(id + ' (not found in the source)'); continue; }
    const rest = SRC.slice(at + 4);
    const m = rest.search(/\n  [a-z0-9_]+: |\n\}\);/);
    const chunk = rest.slice(0, m < 0 ? 3000 : m);
    if (C.BASKETBALL_ONLY[id]) continue;
    for (const t of C.REAL_TOKENS) if (new RegExp('\\{' + t + '(:[a-z]+)?\\}').test(chunk)) real.push(id + ' {' + t + '}');
  }
  ok(real.length === 0, `no Phase D card puts a real player or coach in a story (${real.slice(0, 4).join(', ') || 'none'})`);
  ok(Object.keys(AUTH).length >= 150, `Phase D wrote the content it claims (${Object.keys(AUTH).length} cards)`);
  void L;
}

section('14. the game narrates, and a card that comes back comes back different');
{
  /* The narrator's line, the second takes and the varied system cards are a
     story career's alone. Played here as a player meets them: the line is
     short, true to the moment, never unfilled, and not on every card; a card
     dealt again in one career never repeats the take it was last dealt in;
     every take is met somewhere; and a career from before the story engine
     sees none of it. */
  const DASH = new RegExp('[' + String.fromCharCode(8211, 8212) + ']');
  const runs = [];
  for (let i = 0; i < 40; i++) runs.push(play('narr' + i, i % 2 ? 'hs' : 'draft'));
  let cards = 0, led = 0, bad = [], longLead = [];
  const takeSeen = {}, takeN = {}, repeatSame = [], titles = {};
  for (const x of runs) {
    const last = {};
    for (const k of x.cards) {
      const c = k.c;
      cards++;
      if (c.lead) {
        led++;
        if (/\{[a-z0-9]+(?::\w+)?\}|undefined|NaN/.test(c.lead) || DASH.test(c.lead)) bad.push(c.id + ': ' + c.lead);
        if (words(c.lead) > 16) longLead.push(c.lead);
      }
      if (c.take != null) {
        (takeSeen[c.id] = takeSeen[c.id] || new Set()).add(c.take); takeN[c.id] = (takeN[c.id] || 0) + 1;
        if (last[c.id] != null && last[c.id] === c.take) repeatSame.push(c.id);
        last[c.id] = c.take;
      } else if (C.EVENTS[c.id] && C.EVENTS[c.id].takes || C.AM_EVENTS[c.id] && C.AM_EVENTS[c.id].takes) {
        (takeSeen[c.id] = takeSeen[c.id] || new Set()).add(0); takeN[c.id] = (takeN[c.id] || 0) + 1;
        if (last[c.id] === 0) repeatSame.push(c.id);
        last[c.id] = 0;
      }
      (titles[c.id] = titles[c.id] || new Set()).add(c.title.replace(/\d+/g, '#'));
    }
  }
  const share = led / cards;
  ok(share > 0.15 && share < 0.6, `the narrator speaks on some cards and not all of them (${(share * 100).toFixed(0)}% of ${cards})`);
  ok(!bad.length, `every narrator line is filled in and carries no dash (${bad.slice(0, 3).join(' | ') || 'all'})`);
  ok(!longLead.length, `every narrator line is sixteen words or less (${longLead.slice(0, 2).join(' | ') || 'all'})`);
  ok(!repeatSame.length, `a card dealt again in one career never comes back as the same take (${repeatSame.slice(0, 4).join(', ') || 'none'})`);
  const withTakes = [...Object.keys(C.EVENTS), ...Object.keys(C.AM_EVENTS)].filter((id) => (C.EVENTS[id] || C.AM_EVENTS[id]).takes);
  const dark = [];
  for (const id of withTakes) { const n = ((C.EVENTS[id] || C.AM_EVENTS[id]).takes.length) + 1; const s = takeSeen[id]; if (s && takeN[id] >= 4 && s.size < Math.min(n, 2)) dark.push(id); }
  ok(withTakes.length >= 25 && !dark.length, `${withTakes.length} cards carry other takes, and each one dealt four times or more here showed more than one (${dark.join(', ') || 'all'})`);
  const one = ['clutch', 'retire', 'injury', 'coach_review'].filter((id) => titles[id] && titles[id].size < 2);
  ok(!one.length, `the system cards are put more than one way (${['clutch', 'retire', 'injury', 'coach_review'].map((id) => id + ' ' + (titles[id] ? titles[id].size : 0)).join(', ')})`);
  /* Off a story career: none of it. */
  let offLead = 0, offTake = 0;
  for (let i = 0; i < 6; i++) for (const k of play('narroff' + i, i % 2 ? 'hs' : 'draft', null, { story: false }).cards) { if (k.c.lead) offLead++; if (k.c.take != null || k.c.varied) offTake++; }
  ok(!offLead && !offTake, `a career from before the story engine hears no narrator and sees no take (${offLead} lines, ${offTake} takes)`);
}

section('13. the road ends in today\'s league');
{
  /* A high school career is dated back so the usual draft is the real one,
     and nothing in the league moves before it. A player reported the Thunder
     without Shai Gilgeous-Alexander, picking 10th, in a league six summers on. */
  const latest = league.latest;
  const byYear = {};
  let real = null;
  for (let i = 0; i < 120; i++) {
    const L = C.generateRoad({ seed: 'cal' + i, league });
    byYear[L.year] = (byYear[L.year] || 0) + 1;
    if (!real && L.year === latest + 1) real = L;
  }
  const early = Object.keys(byYear).filter((y) => +y > latest + 1).reduce((s2, y) => s2 + byYear[y], 0);
  ok((byYear[latest + 1] || 0) >= 120 * 0.3, `the usual draft is the real one: a third or more of roads reach the league in ${latest + 1} (${JSON.stringify(byYear)})`);
  ok(early < 120 * 0.7, 'and the rest arrive a few years later, not all of them');
  ok(real && real.opt.cal === 1, 'a high school story career carries the calendar flag');
  if (real) {
    /* No real player has changed clubs, and the only ones gone are veterans
       retiring at the end of the data's season, the same rule a draft night
       start meets. */
    const R = C.rostOf(real);
    /* A man traded during the data's season is listed by both of his clubs. */
    const dataClubs = {}, now = {};
    for (const c in league.roster || {}) for (const p of league.roster[c] || []) (dataClubs[p[0]] = dataClubs[p[0]] || []).push(c);
    for (const c in R) for (const e of R[c]) (now[e.n] = now[e.n] || []).push(c);
    const moved = [], young = [];
    for (const n in dataClubs) {
      for (const c of now[n] || []) if (dataClubs[n].indexOf(c) < 0) moved.push(n + ' to ' + c);
      const p = league.roster[dataClubs[n][0]].find((x) => x[0] === n);
      /* On today's rosters nobody has left at all: they are under contract
         for this season. Without the file, a veteran may retire at the end of
         the data's season. */
      if (!now[n] && (league.rs || real.year - p[2] < 33)) young.push(n);
    }
    ok(moved.length === 0, `arriving on the real draft, no real player has changed clubs (${moved.slice(0, 4).join(', ') || 'none'})`);
    ok(young.length === 0, `and nobody ${league.rs ? '' : 'under 33 '}has left the league (${young.slice(0, 4).join(', ') || 'none'})`);
    const okc = (R.OKC || []).map((e) => e.n);
    ok(okc.indexOf('Shai Gilgeous-Alexander') >= 0, 'the Thunder still have Shai Gilgeous-Alexander');
    const order = Object.keys(real.league.net).sort((a, b) => real.league.net[a] - real.league.net[b]);
    const top = Object.keys(league.net).sort((a, b) => league.net[b] - league.net[a])[0];
    ok(real.league.net[top] === league.net[top] && order.indexOf(top) === order.length - 1, `club strength is the data's: ${top}, the best club, picks last`);
  }
  /* The catch-up path: a screen that reads the rosters in the high school
     years, then again at the draft, replays the summers between. Those are
     the real past, so nobody may be traded in them. */
  const hsL = C.newLife({ seed: 'calhs', league, start: 'hs' });
  C.rostOf(hsL);
  hsL.year = latest + 1;
  const R2 = C.rostNow(hsL), moved2 = [];
  for (const c in R2) for (const e of R2[c]) {
    const homes = []; for (const k in league.roster || {}) if ((league.roster[k] || []).some((p) => p[0] === e.n)) homes.push(k);
    if (homes.length && homes.indexOf(c) < 0) moved2.push(e.n + ' to ' + c);
  }
  ok(moved2.length === 0, `rosters read in high school and again at the draft show no trades in between (${moved2.slice(0, 3).join(', ') || 'none'})`);
  /* A draft night career that never went to high school keeps its calendar. */
  const bg = C.newLife({ seed: 'calbg', league, story: true });
  ok(!bg.opt.cal && bg.year === latest + 1, 'a draft night start without a road is not back-dated');
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
