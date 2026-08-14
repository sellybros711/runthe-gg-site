#!/usr/bin/env node
/* check-livecheck.mjs — the live answer check, without a network.
 *
 * The point of livecheck.js is judgement, not plumbing: given the facts a
 * public source has about a player, does that settle the category or not? So
 * the fixtures below are hand-written in the exact shape /api/player-check
 * returns, and every assertion is about the verdict.
 *
 * The three-way verdict is the thing to protect. `null` (can't tell) must never
 * silently become `true`, or every stat and award category in the game becomes
 * free points for anyone who types a real athlete's name.
 *
 *   node scripts/check-livecheck.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

globalThis.window = globalThis.window || {};
require('../arcade/sportegories-data.js');
const D = globalThis.window.RTG_SPORTEGORIES_DATA;
const SP = require('../arcade/sportegories.js');
const LC = require('../arcade/livecheck.js');
SP.setData(D);
LC.setEngine(SP);
LC.setYear(2026);

let pass = 0, fail = 0;
const bad = [];
function is(actual, expect, what) {
  if (actual === expect) { pass++; return; }
  fail++; bad.push(`${what}\n      expected ${JSON.stringify(expect)}, got ${JSON.stringify(actual)}`);
}

/* ---------- fixtures: raw /api/player-check payloads ---------- */

// A real NFL back. He IS in the corpus now (the builder finally reads the
// active rosters), so this fixture stands in for whoever is still missing.
const chaseBrown = {
  found: true, qid: 'Q00', name: 'Chase Brown',
  occupations: ['American football player'], sports: ['American football'],
  positions: ['running back'],
  colleges: ['University of Illinois Urbana-Champaign', 'Western Michigan University'],
  awards: [],
  teams: [{ name: 'Cincinnati Bengals', start: 2023, end: null }],
  died: false,
};

// Long, well-documented career: many teams, dated stints, real awards.
const journeyman = {
  found: true, qid: 'Q01', name: 'Vinny Testaverde',
  occupations: ['American football player'], sports: ['American football'],
  positions: ['quarterback'], colleges: ['University of Miami'],
  awards: ['Pro Bowl'],
  teams: [
    { name: 'Tampa Bay Buccaneers', start: 1987, end: 1992 },
    { name: 'Cleveland Browns', start: 1993, end: 1995 },
    { name: 'Baltimore Ravens', start: 1996, end: 1997 },
    { name: 'New York Jets', start: 1998, end: 2003 },
    { name: 'Dallas Cowboys', start: 2004, end: 2004 },
  ],
  died: false,
};

// Everything a name search can land on that isn't a player.
const notFound = { found: false };

// A player with no dated stints and no positions — plenty of these exist.
const sparse = {
  found: true, qid: 'Q02', name: 'Sparse Guy',
  occupations: ['baseball player'], sports: [], positions: [], colleges: [], awards: [],
  teams: [{ name: 'Chicago Cubs', start: null, end: null }],
  died: false,
};

const P = (p) => LC.shape(p, D);
const cb = P(chaseBrown), vt = P(journeyman), sg = P(sparse);

/* ---------- shaping ---------- */
is(cb.teams.join(','), 'Cincinnati Bengals', 'shape: pro team survives');
is(cb.positions.join(','), 'Running Back', 'shape: "running back" folds into our vocab');
is(cb.colleges.indexOf('Illinois') >= 0, true, 'shape: Illinois Urbana-Champaign -> Illinois');
is(cb.sports.join(','), 'NFL', 'shape: league comes from the team, not the occupation');
is(vt.teams.length, 5, 'shape: five franchises');
is(vt.colleges.indexOf('Miami (FL)') >= 0, true, 'shape: University of Miami covers Miami (FL)');
is(P(notFound).teams.length, 0, 'shape: a miss shapes to nothing');

/* ---------- verdicts we can confirm ---------- */
is(LC.verdict(cb, { k: 'sport', v: 'NFL' }), true, 'sport: NFL');
is(LC.verdict(cb, { k: 'sport', v: 'NBA' }), false, 'sport: not NBA');
is(LC.verdict(cb, { k: 'team', v: 'Cincinnati Bengals' }), true, 'team: Bengals');
is(LC.verdict(cb, { k: 'team', v: 'Cleveland Browns' }), false, 'team: not the Browns');
is(LC.verdict(cb, { k: 'pos', v: 'Running Back' }), true, 'pos: RB');
is(LC.verdict(cb, { k: 'pos', v: 'Quarterback' }), false, 'pos: not QB');
is(LC.verdict(cb, { k: 'col', v: 'Illinois' }), true, 'col: Illinois');
is(LC.verdict(cb, { k: 'col', v: 'Alabama' }), false, 'col: not Alabama');
is(LC.verdict(cb, { k: 'conf', v: 'Big Ten' }), true, 'conf: Illinois is Big Ten');
is(LC.verdict(cb, { k: 'conf', v: 'SEC' }), false, 'conf: not SEC');
is(LC.verdict(cb, { k: 'act' }), true, 'act: on a roster, no end date');
is(LC.verdict(vt, { k: 'act' }), false, 'act: last stint ended in 2004');
is(LC.verdict(vt, { k: 'teams', min: 3 }), true, 'teams: 5 >= 3');
is(LC.verdict(vt, { k: 'teamsMax', max: 1 }), false, 'teamsMax: 5 teams refutes one-franchise');
is(LC.verdict(vt, { k: 'decade', v: 1990 }), true, 'decade: 1990s');
is(LC.verdict(vt, { k: 'decades', min: 3 }), true, 'decades: 80s/90s/2000s');
is(LC.verdict(vt, { k: 'award', v: 'Pro Bowl' }), true, 'award: Pro Bowl listed');

/* ---------- verdicts we must refuse to guess ---------- */
/* Each of these would be a scoring exploit if it returned true, or an unfair
 * red if it returned false. null is the only honest answer. */
is(LC.verdict(cb, { k: 'stat', v: 'rec', min: 500 }), null, 'stat: never verifiable');
is(LC.verdict(cb, { k: 'draft1' }), null, 'draft1: never verifiable');
is(LC.verdict(cb, { k: 'award', v: 'Pro Bowl' }), null, 'award: absent != did not happen');
is(LC.verdict(cb, { k: 'teams', min: 3 }), null, 'teams: too few could just be an incomplete roster');
is(LC.verdict(cb, { k: 'teamsMax', max: 1 }), null, 'teamsMax: cannot prove a career was complete');
is(LC.verdict(cb, { k: 'decades', min: 3 }), null, 'decades: too few could be missing dates');
is(LC.verdict(cb, { k: 'decade', v: 1990 }), null, 'decade: absent stint proves nothing');
is(LC.verdict(sg, { k: 'pos', v: 'Pitcher' }), null, 'pos: no position claim at all');
is(LC.verdict(sg, { k: 'col', v: 'Illinois' }), null, 'col: no college claim at all');
is(LC.verdict(sg, { k: 'act' }), null, 'act: undated stints settle nothing');

/* ---------- clauses ---------- */
const all = (...xs) => ({ all: xs });
is(LC.verdict(cb, all({ k: 'sport', v: 'NFL' }, { k: 'pos', v: 'Running Back' })), true, 'all: both confirmed');
is(LC.verdict(cb, all({ k: 'sport', v: 'NFL' }, { k: 'stat', v: 'rec', min: 500 })), null, 'all: one unknown -> unknown');
is(LC.verdict(cb, all({ k: 'stat', v: 'rec', min: 500 }, { k: 'pos', v: 'Quarterback' })), false,
  'all: a contradiction beats an unknown');

/* ---------- end to end, through resolve() ---------- */
const payload = {
  'chase brown': chaseBrown,
  'vinny testaverde': journeyman,
  'zzzz nobody': notFound,
};
LC.setFetch(async (_url, opts) => {
  const names = JSON.parse(opts.body).names.map((n) => n.trim().toLowerCase());
  const players = {};
  names.forEach((n) => { players[n] = payload[n] || { found: false }; });
  return { ok: true, json: async () => ({ players }) };
});

/* A puzzle whose categories we control, built by hand against the real
 * category library so the indices are honest. */
function catIndexWhere(fn) {
  for (let i = 0; i < D.cats.length; i++) if (fn(D.cats[i])) return i;
  throw new Error('no category matched');
}
const iRB = catIndexWhere((c) => c.l === 'NFL Running Back');
const iStat = catIndexWhere((c) => c.p.k === 'stat');
const iQB = catIndexWhere((c) => c.l === 'NFL Quarterback');
const puz = { letter: 'C', cats: [{ i: iRB }, { i: iStat }, { i: iQB }] };

const pending = [
  { i: 0, text: 'Chase Brown' },
  { i: 1, text: 'Vinny Testaverde' },
  { i: 2, text: 'Zzzz Nobody' },
];

LC.clearCache();
const out = await LC.resolve(puz, pending, {});
is(out[0].ok, true, 'resolve: verified answer scores');
is(out[0].points, 1 + 2, 'resolve: one leading C plus the rare bonus');
is(out[0].rarity.tier, 'Rare', 'resolve: outside the corpus scores as rare');
is(out[1].ok, false, 'resolve: unverifiable category does not score');
is(out[1].reason, 'unverified', 'resolve: and says so, rather than calling it wrong');
is(out[2].reason, 'unknown', 'resolve: a name nobody has heard of is unknown');
is(out[2].live, 'missing', 'resolve: flagged as a genuine miss');

// Same player twice on one card is still the same player.
LC.clearCache();
const dup = await LC.resolve(puz, [{ i: 0, text: 'Chase Brown' }], { 'chase brown': 1 });
is(dup[0].reason, 'dup', 'resolve: cannot reuse a player already on the card');

// The letter rule is settled before we ever reach the network.
is(SP.check({ letter: 'Q', cats: [{ i: iRB }] }, 0, 'Chase Brown', {}).reason, 'letter',
  'check: wrong letter short-circuits before the live lookup');
/* Regression guard for the report that started this: Chase Brown is a current
 * Bengals back sitting in arcade/rosters.js, and the builder used not to read
 * that file, so the game said it had never heard of him. He grades from the
 * corpus now, with no network involved. */
const cbLocal = SP.check(puz, 0, 'Chase Brown', {});
is(cbLocal.ok, true, 'corpus: Chase Brown is in the data and scores');
is(cbLocal.live, undefined, 'corpus: and never reaches the live check');
is(cbLocal.rarity.tier, 'Rare', 'corpus: an active-roster deep cut scores as rare');
is(SP.check(puz, 0, 'Chase Brown', {}).player.sport, 'NFL', 'corpus: as an NFL player');

// Only a name in neither place takes the live path.
const unk = SP.check(puz, 0, 'Corbin Thistlewaite', {});
is(unk.reason, 'unknown', 'check: absent from the corpus');
is(unk.live, true, 'check: flagged for the live lookup');
is(unk.msg, 'Couldn\u2019t verify that one.', 'check: claims only that WE could not confirm them');

// A network that falls over must not turn a real player into a fake one.
LC.clearCache();
LC.setFetch(async () => { throw new Error('offline'); });
const offline = await LC.resolve(puz, [{ i: 0, text: 'Chase Brown' }], {});
is(offline[0].reason, 'unknown', 'resolve: a failed lookup falls back, it does not crash');

/* ---------- the endpoint's own parsing ---------- */
/* Wikidata is unreachable from CI, so the wire format is pinned here instead:
 * a claim with a qualifier range, a claim without one, and a name-search hit
 * that is a person but not a player. */
const { _test } = await import('../functions/api/player-check.js');
const wdEntity = {
  labels: { en: { value: 'Chase Brown' } },
  claims: {
    P106: [{ mainsnak: { datavalue: { value: { id: 'Q19204627' } } } }],
    P413: [{ mainsnak: { datavalue: { value: { id: 'Qpos' } } } }],
    P69: [{ mainsnak: { datavalue: { value: { id: 'Qcol' } } } }],
    P54: [
      { mainsnak: { datavalue: { value: { id: 'Qteam' } } },
        qualifiers: { P580: [{ datavalue: { value: { time: '+2023-00-00T00:00:00Z' } } }] } },
      { mainsnak: { datavalue: { value: { id: 'Qteam2' } } },
        qualifiers: { P580: [{ datavalue: { value: { time: '+2021-00-00T00:00:00Z' } } }],
                      P582: [{ datavalue: { value: { time: '+2022-00-00T00:00:00Z' } } }] } },
    ],
    P166: [{ mainsnak: { datavalue: { value: { id: 'Qaward' } } } }],
  },
};
const wdLabels = { Q19204627: 'American football player', Qpos: 'running back', Qcol: 'University of Illinois Urbana-Champaign', Qteam: 'Cincinnati Bengals', Qteam2: 'Illinois Fighting Illini football', Qaward: 'Pro Bowl' };
const parsed = _test.profileOf('Q00', wdEntity, wdLabels);
is(parsed.name, 'Chase Brown', 'endpoint: label becomes the name');
is(parsed.positions.join(','), 'running back', 'endpoint: position label resolved');
is(parsed.teams.length, 2, 'endpoint: both stints kept — the client filters, not us');
is(parsed.teams[0].start, 2023, 'endpoint: start qualifier parsed');
is(parsed.teams[0].end, null, 'endpoint: a missing end stays null, not 0');
is(parsed.teams[1].end, 2022, 'endpoint: end qualifier parsed');
is(parsed.died, false, 'endpoint: no death claim');
is(_test.isAthlete(wdEntity), true, 'endpoint: recognised as an athlete');
is(_test.isAthlete({ claims: { P106: [{ mainsnak: { datavalue: { value: { id: 'Qwriter' } } } }] } }), false,
  'endpoint: a non-athlete namesake is rejected');
is(_test.isAthlete({ missing: '' }), false, 'endpoint: a missing entity is rejected');
// The college side is exactly what the client has to throw away.
is(LC.shape(parsed, D).teams.join(','), 'Cincinnati Bengals', 'endpoint+client: college side filtered out');

/* ---------- reported: real answers the game called wrong ----------
 * From a live card: "Jericho Cotchery" on Played for the New York Jets and
 * "Julius Erving" on 20,000+ NBA points both came back "No player by that
 * name" / "Doesn't fit". Cotchery is in none of our files; Erving is, but we
 * hold no career stats for him. Neither is a wrong answer. */
LC.clearCache();
LC.setFetch(async (_u, o) => {
  const names = JSON.parse(o.body).names.map((n) => n.trim().toLowerCase());
  const db = {
    'jericho cotchery': {
      found: true, qid: 'Q10', name: 'Jericho Cotchery',
      occupations: ['American football player'], sports: [], positions: ['wide receiver'],
      colleges: ['North Carolina State University'], awards: [],
      teams: [
        { name: 'New York Jets', start: 2004, end: 2010 },
        { name: 'Pittsburgh Steelers', start: 2011, end: 2012 },
        { name: 'Carolina Panthers', start: 2014, end: 2015 },
      ], died: false,
    },
    'julius erving': {
      found: true, qid: 'Q11', name: 'Julius Erving',
      occupations: ['basketball player'], sports: [], positions: ['small forward'],
      colleges: ['University of Massachusetts Amherst'], awards: ['Naismith Memorial Basketball Hall of Fame'],
      teams: [{ name: 'Philadelphia 76ers', start: 1976, end: 1987 }], died: false,
    },
  };
  const players = {}; names.forEach((n) => { players[n] = db[n] || { found: false }; });
  return { ok: true, json: async () => ({ players }) };
});

const iJets = catIndexWhere((c) => c.l === 'Played for the New York Jets');
const iPts  = catIndexWhere((c) => c.l === '20,000+ NBA points');
const rep = await LC.resolve({ letter: 'J', cats: [{ i: iJets }, { i: iPts }] },
  [{ i: 0, text: 'Jericho Cotchery' }, { i: 1, text: 'Julius Erving' }], {});

is(rep[0].ok, true, 'reported: Cotchery is confirmed a Jet and scores');
is(rep[0].player.name, 'Jericho Cotchery', 'reported: scored under his own name');
// A points threshold is not in any public structured source, so the honest
// answer stays "we could not verify" — never "wrong".
is(rep[1].ok, false, 'reported: a points threshold cannot be confirmed live');
is(rep[1].reason, 'unverified', 'reported: and it is NOT called a wrong answer');

console.log(bad.length ? bad.map((b) => '  FAIL ' + b).join('\n') : '');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
