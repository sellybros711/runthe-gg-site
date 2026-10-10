// node scripts/check-sportegories-challenge.mjs
//
// The Sportegories challenge, end to end, with no network.
//
// It drives the real route (functions/api/sportegories-challenge.js) with the
// real game data served as the static asset and Wikidata answered by canned
// entities, so the ruling, the shaping of a Wikidata item and the reading of
// the data file are the code that ships. The memory is an in-memory stand-in
// for 135's table, read and written through the same object shape.
//
// What it holds:
//   1. A won challenge is upheld, remembered, and the engine then counts the
//      answer on a fresh card with nobody asking the server again.
//   2. A challenge the record contradicts is denied, and remembered.
//   3. A name that is two people is ruled on whichever of them fits.
//   4. A search that wanders to a different surname rules on nothing.
//   5. What Wikidata cannot know (a career total) comes back unsure, logged
//      for a person, and is never remembered as a ruling.
//   6. The game's own rules (the letter, a full name) are not challengeable,
//      and a card from an older build is told to reload.
//   7. Wikidata down is "offline", and nothing is written.
//   8. An admin's ruling is final: the server answers with it unasked.
//   9. A remembered upheld ruling is answered from memory, Wikidata untouched.
//  10. The page carries the button, the flag and the memory read.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ok   ' + msg); else { fails++; console.log('  FAIL ' + msg); } };

const DATA_TEXT = readFileSync('arcade/sportegories-data.js', 'utf8');

/* ---------- canned Wikidata ---------- */
const OCC_BASKETBALL = 'Q3665646';
const TEAM_Q = { Q1: 'Chicago Bulls', Q2: 'Washington Wizards', Q3: 'Miami Heat', Q4: 'Los Angeles Lakers' };
function claim(q, start) {
  const st = { mainsnak: { datavalue: { value: { id: q } } } };
  if (start) st.qualifiers = { P580: [{ datavalue: { value: { time: '+' + start + '-01-01T00:00:00Z' } } }] };
  return st;
}
function athlete(id, name, teams) {
  return { id, labels: { en: { value: name } },
    claims: { P106: [claim(OCC_BASKETBALL)], P54: teams.map((t) => claim(t, 1990)) } };
}
let SEARCH = {}, ENTS = {}, wikiCalls = 0, wikiDown = false;
function resetWiki() { SEARCH = {}; ENTS = {}; wikiCalls = 0; wikiDown = false; }
function label(q) { return TEAM_Q[q] || (q === OCC_BASKETBALL ? 'basketball player' : null); }

const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname !== 'www.wikidata.org') throw new Error('unexpected request ' + url);
  wikiCalls++;
  if (wikiDown) return new Response('down', { status: 503 });
  const act = u.searchParams.get('action');
  if (act === 'wbsearchentities') {
    const ids = SEARCH[u.searchParams.get('search').toLowerCase()] || [];
    return Response.json({ search: ids.map((id) => ({ id })) });
  }
  if (act === 'wbgetentities') {
    const out = {};
    u.searchParams.get('ids').split('|').forEach((q) => {
      if (ENTS[q]) out[q] = ENTS[q];
      else if (label(q)) out[q] = { id: q, labels: { en: { value: label(q) } } };
      else out[q] = { id: q, missing: '' };
    });
    return Response.json({ entities: out });
  }
  throw new Error('unexpected wikidata action ' + act);
};

/* ---------- memory stand-in for 135 ---------- */
const MEM = new Map(), GAPS = [];
const mem = {
  async get(key, label) { return MEM.get(key + '#' + label) || null; },
  async put(row) {
    const k = row.answer_key + '#' + row.category, old = MEM.get(k);
    if (old && old.source === 'admin') return;                 // 135's trigger
    MEM.set(k, { ...old, ...row, as_typed: old ? old.as_typed : row.as_typed, created_at: old ? old.created_at : new Date().toISOString() });
  },
  async gap(row) { GAPS.push(row); },
  async upheld(labels) {
    return [...MEM.values()].filter((r) => r.verdict === 'upheld' && labels.includes(r.category)).map((r) => ({ a: r.answer_key, c: r.category }));
  }
};

/* ---------- the route, as Pages runs it ---------- */
const route = await import('../functions/api/sportegories-challenge.js');
const { rule } = await import('../functions/_sportegories/challenge.js');
const { wikidata } = await import('../functions/api/player-check.js');
const SP = require('../arcade/sportegories.js');
const LC = require('../arcade/livecheck.js');

const ctx = (body) => ({
  request: new Request('https://runthe.gg/api/sportegories-challenge', { method: 'POST', body: JSON.stringify(body) }),
  env: { ASSETS: { fetch: async () => new Response(DATA_TEXT) } }
});
// The first POST loads the data through ASSETS, the way a fresh isolate does.
async function viaRoute(body) { const r = await route.onRequestPost(ctx(body)); return r.json(); }
async function viaRule(body) { return rule(body, { SP, LC, wiki: wikidata, db: mem }); }

console.log('\nthe route reads the data file the build writes');
const first = await viaRoute({ answer: 'Zzz Qqq', letter: 'Z', cat: 0, label: 'nope' });
ok(first.verdict === 'stale', 'a label that disagrees with the index is stale, after a real data load (' + first.verdict + ')');
const D = SP.data();
ok(D && D.cats.length > 100, 'the data parsed (' + (D && D.cats.length) + ' categories)');
const parsed = route.parseData(DATA_TEXT);
ok(parsed.cats.length === D.cats.length, 'parseData reads the shipped file shape');

const catOf = (l) => D.cats.find((c) => c.l === l);
const HEAT = catOf('Played for the Miami Heat');
const LAKERS = catOf('Played for the Los Angeles Lakers');
const STAT = D.cats.find((c) => c.p.k === 'stat');
ok(HEAT && LAKERS && STAT, 'the fixture categories exist');

// Our file holds Michael Jordan with the Bulls and the Wizards.
const card = (cat, letter) => ({ letter, cats: [{ i: cat.i, label: cat.l }] });
ok(SP.check(card(HEAT, 'J'), 0, 'Michael Jordan', {}).reason === 'category', 'our file marks Michael Jordan wrong for the Heat');

console.log('\n1. a won challenge is upheld and remembered');
resetWiki();
SEARCH['michael jordan'] = ['Q100'];
ENTS.Q100 = athlete('Q100', 'Michael Jordan', ['Q1', 'Q2', 'Q3']);    // a record that lists the Heat
let r = await viaRoute({ answer: 'Michael Jordan', letter: 'J', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'upheld', 'upheld when the record lists the team (' + r.verdict + ': ' + r.msg + ')');
ok(MEM.size === 0, 'the route with no Supabase secrets remembers nothing (and does not fail)');
r = await viaRule({ answer: 'Michael Jordan', letter: 'J', cat: HEAT.i, label: HEAT.l });
const row = MEM.get('michael|jordan#' + HEAT.l);
ok(r.verdict === 'upheld' && row && row.verdict === 'upheld' && row.qid === 'Q100', 'the ruling is written with its Wikidata item');
SP.setRulings(await mem.upheld([HEAT.l]));
const counted = SP.check(card(HEAT, 'J'), 0, 'michael  jordan', {});
ok(counted.ok && counted.ruled, 'a fresh card counts it from memory, any spelling of the name');
ok(counted.points >= 1, 'and it scores (' + counted.points + ')');
ok(SP.check(card(HEAT, 'J'), 0, 'Michael Jordan', { [counted.player.idx]: 1 }).reason === 'dup', 'a remembered answer still cannot be used twice');
ok(!SP.check(card(LAKERS, 'J'), 0, 'Michael Jordan', {}).ok, 'the ruling is about the Heat only, not the Lakers');
SP.setRulings([]);
ok(SP.check(card(HEAT, 'J'), 0, 'Michael Jordan', {}).reason === 'category', 'with no rulings set the engine is exactly what it was');

console.log('\n2. a challenge the record contradicts is denied');
resetWiki();
SEARCH['michael jordan'] = ['Q100'];
ENTS.Q100 = athlete('Q100', 'Michael Jordan', ['Q1', 'Q2']);
r = await viaRule({ answer: 'Michael Jordan', letter: 'J', cat: LAKERS.i, label: LAKERS.l });
ok(r.verdict === 'denied', 'denied (' + r.verdict + ')');
ok(MEM.get('michael|jordan#' + LAKERS.l).verdict === 'denied', 'and the denial is remembered');
const calls = wikiCalls;
r = await viaRule({ answer: 'Michael Jordan', letter: 'J', cat: LAKERS.i, label: LAKERS.l });
ok(r.verdict === 'denied' && r.cached && wikiCalls === calls, 'a repeat is answered from memory without Wikidata');
MEM.get('michael|jordan#' + LAKERS.l).updated_at = new Date(Date.now() - 40 * 864e5).toISOString();
await viaRule({ answer: 'Michael Jordan', letter: 'J', cat: LAKERS.i, label: LAKERS.l });
ok(wikiCalls > calls, 'a denial older than 30 days is asked again');

console.log('\n3. a name that is two people');
resetWiki();
SEARCH['jalen bend'] = ['Q201', 'Q202'];
ENTS.Q201 = athlete('Q201', 'Jalen Bend', ['Q1']);
ENTS.Q202 = athlete('Q202', 'Jalen Bend', ['Q4']);
r = await viaRule({ answer: 'Jalen Bend', letter: 'B', cat: LAKERS.i, label: LAKERS.l });
ok(r.verdict === 'upheld' && MEM.get('jalen|bend#' + LAKERS.l).qid === 'Q202', 'ruled on the second man, who fits');

console.log('\n4. a search that wanders to another surname');
resetWiki();
SEARCH['jalen zork'] = ['Q301'];
ENTS.Q301 = athlete('Q301', 'Jalen Brunson', ['Q4']);
r = await viaRule({ answer: 'Jalen Zork', letter: 'Z', cat: LAKERS.i, label: LAKERS.l });
ok(r.verdict === 'unsure' && !MEM.has('jalen|zork#' + LAKERS.l), 'unsure, and nothing remembered (' + r.verdict + ')');

console.log('\n5. what Wikidata cannot know');
resetWiki();
const gapsBefore = GAPS.length;
SEARCH['zed zebra'] = ['Q401'];
ENTS.Q401 = athlete('Q401', 'Zed Zebra', ['Q1']);
r = await viaRule({ answer: 'Zed Zebra', letter: 'Z', cat: STAT.i, label: STAT.l });
ok(r.verdict === 'unsure', 'a career total comes back unsure (' + r.verdict + ')');
ok(GAPS.length === gapsBefore + 1 && /challenge/.test(GAPS[GAPS.length - 1].gaps), 'logged to answer_gaps for a person');
ok(!MEM.has('zed|zebra#' + STAT.l), 'and never remembered as a ruling');

console.log('\n6. the game\'s own rules');
resetWiki();
r = await viaRule({ answer: 'Michael Jordan', letter: 'Q', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'refused' && wikiCalls === 0, 'a wrong letter is refused without a lookup');
r = await viaRule({ answer: 'Jordan', letter: 'J', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'refused', 'a surname alone is refused');
r = await viaRule({ answer: 'Michael Jordan', letter: 'J', cat: HEAT.i + 1, label: HEAT.l });
ok(r.verdict === 'stale', 'an index that no longer matches its label is stale');
r = await viaRule({ answer: 'x'.repeat(61), letter: 'X', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'refused', 'an over-long answer is refused');

console.log('\n7. Wikidata down');
resetWiki(); wikiDown = true;
const before = MEM.size;
r = await viaRule({ answer: 'Kyle Korvette', letter: 'K', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'offline' && MEM.size === before, 'offline, and nothing written');
r = await viaRoute({ answer: 'Kyle Korvette', letter: 'K', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'offline', 'the route says offline too');

console.log('\n8. an admin has the last word');
resetWiki();
MEM.set('kyle|kerrigan#' + HEAT.l, { answer_key: 'kyle|kerrigan', category: HEAT.l, verdict: 'denied', source: 'admin', updated_at: '2020-01-01' });
SEARCH['kyle kerrigan'] = ['Q501'];
ENTS.Q501 = athlete('Q501', 'Kyle Kerrigan', ['Q3']);
r = await viaRule({ answer: 'Kyle Kerrigan', letter: 'K', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'denied' && wikiCalls === 0, 'the admin ruling stands, Wikidata never asked');

console.log('\n9. a remembered upheld ruling');
resetWiki();
r = await viaRule({ answer: 'Michael Jordan', letter: 'J', cat: HEAT.i, label: HEAT.l });
ok(r.verdict === 'upheld' && r.cached && wikiCalls === 0, 'answered from memory');

console.log('\n10. the page');
const page = readFileSync('arcade/sportegories/index.html', 'utf8');
ok(/function challengeOn\(\)[^]*RTGFlags\.on\('challenge'\)/.test(page), 'the button and the memory ride on the challenge flag');
ok(/\/api\/sportegories-challenge\?/.test(page) && /SP\.setRulings\(/.test(page), 'the page reads the memory when a card is dealt');
ok(/className='chal'/.test(page) && /runChallenge\(i, b\)/.test(page), 'a Challenge button is offered on a row');
ok(/again:filed/.test(page), 'a won challenge re-files the card without a second completion event');
const flags = require('../arcade/flags.js');
ok(flags.FLAGS.challenge && !flags.FLAGS.challenge.since && flags.FLAGS.challenge.pct === 0, 'the flag ships off');

globalThis.fetch = realFetch;
console.log(fails ? '\n' + fails + ' FAILED' : '\nall challenge claims hold');
process.exit(fails ? 1 : 0);
