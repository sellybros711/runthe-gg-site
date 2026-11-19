/* Shut The Door custom challenges (challenge.js, matchups.js, api.js, supabase/183).
 *   node shut-the-door/test/challenge.mjs
 *
 *   1. A daily start plays exactly as it did. Rows played by main's engine before custom
 *      challenges (34c15c9e, two a pack, fixtures/replays-rules12-pre-challenges.json) replay
 *      to every pitch's result and points lost, the strip, the outcome, the score and the
 *      percentile. Every daily pack reads its table as before: no tableLead, the start of old.
 *   2. challenge.js checks a spec as 183 does (the same cases as its SQL test).
 *   3. A real matchup (fixtures/matchup-*.json.gz, built by pipeline/build_matchups.py and
 *      matchups.js): its table is the engine's own solve at every start a player can pick,
 *      best play is all green, the same seed and calls replay the same, and every number the
 *      setup line holds is the spec's.
 *   4. The page's calls against a stand-in server with 183's rules: Pro makes one, anyone plays
 *      it, one counted try, a guest posts after signing in, practice never posts, and a
 *      challenge never reaches the daily's submit, Survivor or the archive.
 */
import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, 'data');

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
}

const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

const E = require('../engine.js');
const G = require('../grade.js');
const R = require('../rng.js');
const CH = require('../challenge.js');
const packOf = id => JSON.parse(readFileSync(join(DATA, 'packs', id + '.json'), 'utf8'));

/* ---- 1. a daily start, exactly as main played it ---- */
{
  const rows = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'replays-rules12-pre-challenges.json'), 'utf8'));
  const packs = {};
  let same = 0;
  const off = [];
  for (const r of rows) {
    const pack = packs[r.scenario_id] || (packs[r.scenario_id] = packOf(r.scenario_id));
    const o = E.replay(pack, E.seedFor('daily', r.day), r.calls, { mode: 'daily' });
    const res = E.finishOuting(o);
    const results = o.log.map(p => p.result && (p.result.key || p.result.kind || JSON.stringify(p.result)).slice(0, 40));
    const ok = res.outcome === r.outcome && res.pitches === r.pitches && res.score === r.score && res.percentile === r.percentile
      && JSON.stringify(res.strip) === JSON.stringify(r.strip) && JSON.stringify(o.grades.map(g => g.lost)) === JSON.stringify(r.lost)
      && JSON.stringify(results) === JSON.stringify(r.results);
    if (ok) same++; else off.push(r.scenario_id + ' ' + r.day);
  }
  check(`a daily start plays as main played it: ${same} of ${rows.length} rows to every pitch`, same === rows.length && rows.length >= 60, off.join(', '));

  const ids = readdirSync(join(DATA, 'packs')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  const bad = [];
  for (const id of ids) {
    const p = packs[id] || packOf(id);
    const m = new G.Model(p), s = p.scenario.situation;
    const st = m.startState();
    const lead = s.score.us - s.score.them;
    if (p.scenario.tableLead != null || s.bi != null || s.balls != null || s.strikes != null) bad.push(id + ' carries a challenge field');
    if (m.M !== p.hold.margins || m.M !== Math.max(1, lead + m.rest[0])) bad.push(id + ' M');
    if (st.bi !== 0 || st.b !== 0 || st.s !== 0 || st.outs !== s.outs || st.bases !== s.bases || st.margin !== lead) bad.push(id + ' start');
  }
  check(`every daily pack (${ids.length}) reads its own table from the start it always had`, !bad.length, bad.join('; '));
}

/* ---- 2. the spec, as 183 checks it ---- */
const SPEC = { v: 1, pitcher: 'std-2016-ws7-chapman', lineup: 'std-2025-ws7-yamamoto', up: 4, on: [3, null, 1],
  outs: 1, balls: 2, strikes: 1, lead: 1, them: 4, inning: 9, home: false };
{
  const why = (x) => CH.normalize(Object.assign({}, SPEC, x)).error || null;
  check('a challenge is a challenge', why({}) === null);
  check('a lead of four, and a tie, are not offered', why({ lead: 4 }) === 'the lead is 1 to 3 runs' && why({ lead: 0 }) === 'the lead is 1 to 3 runs');
  check('the 7th is not offered', why({ inning: 7 }) !== null);
  check('four balls and three outs are not a start', why({ balls: 4 }) === 'pick the count' && why({ outs: 3 }) === 'pick the outs');
  check('the man up is not on base, one man one base', why({ on: [4, null, null] }) === 'the man up cannot be on base' && why({ on: [3, 3, null] }) === 'a runner on two bases');
  check('a runner batted in the four before him', why({ on: [5, null, null] }) !== null && why({ on: [0, null, null] }) === null);
  check('a number is a number', why({ outs: '1' }) !== null && why({ up: 1.5 }) !== null);
  check('the canonical spec has every field 183 asks for', JSON.stringify(Object.keys(CH.normalize(SPEC).spec).sort())
    === JSON.stringify(['balls', 'home', 'inning', 'lead', 'lineup', 'on', 'outs', 'pitcher', 'strikes', 'them', 'up', 'v']));
  // 183's spec check reads the same cases (supabase/test/shut_the_door_challenges_test.sql)
  const sql = readFileSync(join(ROOT, '..', 'supabase', '183_shut_the_door_challenges.sql'), 'utf8');
  const reasons = ['pick a pitcher', 'pick a lineup', 'pick who is up', 'pick the outs', 'pick the count', 'the lead is 1 to 3 runs',
    'pick the score', 'the 8th, the 9th or the 10th', 'pick the runners', 'the man up cannot be on base', 'a runner on two bases',
    'a runner is one of the four hitters before the man up'];
  const js = readFileSync(join(ROOT, 'challenge.js'), 'utf8');
  check('the page and the server give the same reasons', reasons.every(r => sql.includes(`'${r}'`) && js.includes(`'${r}'`)),
    reasons.filter(r => !sql.includes(`'${r}'`) || !js.includes(`'${r}'`)).join(', '));
}

/* ---- 3. a real matchup ---- */
const FIX = readdirSync(join(ROOT, 'fixtures')).find(f => f.startsWith('matchup-') && f.endsWith('.json.gz'));
const MTEXT = gunzipSync(readFileSync(join(ROOT, 'fixtures', FIX))).toString();
const MATCHUP = JSON.parse(MTEXT);
const MSHA = createHash('sha256').update(MTEXT).digest('hex');
const MM = MATCHUP.scenario.matchup;
SPEC.pitcher = MM.pitcher; SPEC.lineup = MM.lineup;
{
  check(`the fixture is a real pair: ${MM.pitcher} against ${MM.lineup}`, MM.pitcher !== MM.lineup && MATCHUP.v === E.PACK_VERSION
    && MATCHUP.scenario.batters.length === 9 && MATCHUP.library.length === 9 && MATCHUP.hold.margins === 3 && !MATCHUP.hold.halves);
  const P = packOf(MM.pitcher), Q = packOf(MM.lineup);
  check('the pitcher is his pack\'s own: arsenal, command, release', JSON.stringify(MATCHUP.scenario.pitcher) === JSON.stringify(P.scenario.pitcher));
  const qOrder = Q.scenario.halves ? Q.scenario.halves[0].lineup : Q.scenario.batters.map((_, i) => i);
  check('the hitters are the lineup\'s first nine, in its order, each with his own zone and stance',
    MATCHUP.scenario.batters.every((b, i) => { const q = Q.scenario.batters[qOrder[i]]; return b.id === q.id && b.name === q.name && b.szTop === q.szTop && b.szBot === q.szBot && b.stanceIn === q.stanceIn; }));
  check('a switch hitter bats away from the pitcher\'s hand', MATCHUP.scenario.batters.every(b => b.bats === 'L' || b.bats === 'R'));
  check('the advancement and runner tables are every pack\'s (check-rules holds their rows)',
    JSON.stringify(MATCHUP.advance) === JSON.stringify(P.advance) && JSON.stringify(MATCHUP.advance) === JSON.stringify(Q.advance)
    && JSON.stringify(MATCHUP.runners) === JSON.stringify(P.runners));
  check('every real pitch the tables name is in the pack', MATCHUP.library.every(lib => Object.values(lib).every(e => e.x.every(row => row.every(x => x < 0 || x / 3 < MATCHUP.pitches.length)))));
  check('the pack holds only what the data decides (no solve time), so two builds make the same bytes',
    !('solveMs' in MATCHUP.build) && typeof MATCHUP.build.startHold === 'number');
  check('no percentile: no pool scores, the closers for pitched like', MATCHUP.pool.scores.length === 0 && MATCHUP.pool.closers.length >= 30);
  check('the running game is the pitcher\'s spot with the lineup\'s runners', !MATCHUP.steal || (MATCHUP.steal.pitcher && JSON.stringify(MATCHUP.steal.pitcher) === JSON.stringify(P.steal.pitcher)
    && MATCHUP.scenario.batters.every(b => MATCHUP.steal.runners[String(b.id)])));

  // the table is the engine's own solve, at starts a player can pick
  const rng = R.mulberry32(R.hashSeed('challenge-table'));
  const fresh = new G.Model(MATCHUP, { fresh: true }), table = new G.Model(MATCHUP);
  let worst = 0;
  for (let k = 0; k < 6; k++) {
    const st = { bi: Math.floor(rng() * 9), b: Math.floor(rng() * 4), s: Math.floor(rng() * 3), outs: Math.floor(rng() * 3), bases: Math.floor(rng() * 8), margin: 1 + Math.floor(rng() * 3) };
    worst = Math.max(worst, Math.abs(fresh.solve(st).hold - table.solve(st).hold));
  }
  check(`the stored table is the engine's solve at six random picks (worst ${worst.toExponential(1)})`, worst < 2e-6);

  const pack = CH.packFor(MATCHUP, SPEC);
  const m = new G.Model(pack);
  const st = m.startState();
  check('a custom start is the spec\'s state', st.bi === 4 && st.b === 2 && st.s === 1 && st.outs === 1 && st.bases === 5 && st.margin === 1 && m.M === 3);
  check('the matchup is not changed by a challenge', MATCHUP.scenario.situation.outs === 0 && !MATCHUP.scenario.situation.bi && JSON.stringify(MATCHUP.steal && MATCHUP.steal.start) === '{}');
  const on = pack.steal ? pack.steal.start : {};
  check('the runners are on by name', !pack.steal || (on['1'] === String(pack.scenario.batters[3].id) && on['3'] === String(pack.scenario.batters[1].id) && !on['2']));
  const sit = pack.scenario.situation;
  check('on the road in the 9th a walk-off is live; at home the top', sit.half === 'bottom' && sit.walkOffLive
    && CH.situationOf(Object.assign({}, SPEC, { home: true })).half === 'top' && !CH.situationOf(Object.assign({}, SPEC, { home: true })).walkOffLive
    && !CH.situationOf(Object.assign({}, SPEC, { inning: 8 })).walkOffLive);
  check('the score reads the spec: up 1, 5 to 4', sit.score.us === 5 && sit.score.them === 4);
  const setup = pack.scenario.setup;
  check('the setup line holds the spec\'s numbers and names', setup.includes('Up 1') && setup.includes('One out') && setup.includes(', 2-1.')
    && setup.includes(pack.scenario.batters[4].name) && setup.includes(MATCHUP.scenario.pitcher.name), setup);
  const DASHES = [0x2013, 0x2014].map(c => String.fromCharCode(c));
  check('the setup line has no long dash', !DASHES.some(d => setup.includes(d)));

  // best play is all green; the same seed and calls replay the same; another seed plays its own luck
  const play = (seed, pick) => {
    const o = E.createOuting(pack, { seed, mode: 'challenge', model: m });
    let n = 0;
    while (o.status === 'live' && n++ < 120) E.throwPitch(o, pick(o));
    return o;
  };
  const best = (o) => { const b = E.bestCall(o); return { type: b.type, cell: b.cell }; };
  const a = play(777, best);
  check('best play is all green', a.status === 'over' && a.grades.every(g => g.band === 'green'), a.grades.map(g => g.band).join(','));
  const ra = E.finishOuting(a);
  check('no percentile, no reveal, pitched like names a real closer', ra.percentile === null && ra.reveal === null && !!ra.pitchedLike.name);
  const b = E.replay(pack, 777, a.calls, { mode: 'challenge', model: m });
  const rb = E.finishOuting(b);
  check('the same seed and calls replay the same', rb.score === ra.score && rb.outcome === ra.outcome && JSON.stringify(rb.strip) === JSON.stringify(ra.strip));
  const pol = R.mulberry32(9);
  const wild = play(4242, (o) => ({ type: m.types[Math.floor(pol() * m.types.length)], cell: Math.floor(pol() * 25), q: Math.round(pol() * 100) / 100, e: 0.5 }));
  const rw = E.finishOuting(wild);
  check('a wild outing is graded by the same rules: points lost, a lower score', rw.score < ra.score && wild.grades.some(g => g.band !== 'green'));
  check('every lead 1 to 3 starts from the table', [1, 2, 3].every(l => { const pk = CH.packFor(MATCHUP, Object.assign({}, SPEC, { lead: l })); const mm = new G.Model(pk); return mm.table && mm.solve(mm.startState()).hold > 0; }));
}

/* ---- 4. the page's calls, against 183's rules ---- */
{
  const S = { rows: {}, results: {}, user: null, pro: false, up: true, n: 0, daily: 0, survivor: 0, archive: 0 };
  const auth = {
    state: () => ({ ready: true, waiting: false, signedIn: !!S.user, userId: S.user }),
    onChange: () => () => {},
    async entitlements() { return S.up ? { signedIn: !!S.user, pro: S.pro, archive: S.pro, survivorRuns: S.pro ? null : 1 } : null; },
    async submit() { S.daily++; return { taken: true }; },
    async survivorPost() { S.survivor++; return { data: null }; },
    async archiveSubmit() { S.archive++; return { data: { taken: true } }; },
    async challengeCreate(c) {
      if (!S.up) return null;
      if (!S.user) return { error: 'sign in to make a challenge' };
      if (!S.pro) return { error: 'making a challenge is for Pro' };
      const code = 'ABCDE' + 'FGHJKM'[S.n++];
      S.rows[code] = { code, spec: c.spec, build: c.build, sha: c.sha, seed: 123456 + S.n, rules: c.rules, creator: S.user };
      return { data: { code, seed: S.rows[code].seed, rules: c.rules } };
    },
    async challengeGet(code) {
      if (!S.up) return null;
      const r = S.rows[code];
      if (!r) return null;
      const res = Object.entries(S.results[code] || {}).sort((x, y) => y[1].score - x[1].score);
      return Object.assign({}, r, { creator: r.creator, mine: r.creator === S.user, players: res.length,
        results: res.map(([u, x], i) => ({ rank: i + 1, username: u, score: x.score, outcome: x.outcome, pitches: x.pitches, creator: u === r.creator, mine: u === S.user })),
        myResult: S.user && S.results[code] && S.results[code][S.user] ? S.results[code][S.user] : null });
    },
    async challengeSubmit(row) {
      if (!S.up) return null;
      if (!S.user) return { error: 'sign in to post your score' };
      S.results[row.code] = S.results[row.code] || {};
      const taken = !S.results[row.code][S.user];
      if (taken) S.results[row.code][S.user] = { calls: row.calls, outcome: row.outcome, pitches: row.pitches, score: row.score };
      return { data: { taken, result: await auth.challengeGet(row.code) } };
    },
    async myChallenges() { return Object.values(S.rows).filter(r => r.creator === S.user).map(r => ({ code: r.code, spec: r.spec, made: true })); },
  };
  globalThis.window = { STD_AUTH: auth };
  const api = require('../api.js');
  const index = { v: 1, build: 'm1', pitchers: [], lineups: [], pairs: { [MM.pitcher + '__' + MM.lineup]: { sha: MSHA, gz: 1, startHold: MATCHUP.build.startHold } } };
  let loads = 0;
  api.configure({
    load: async p => (p.startsWith('data/matchups.json') ? index : JSON.parse(readFileSync(join(DATA, p.replace(/^data\//, '').replace(/\?v=\d+$/, '')), 'utf8'))),
    loadMatchup: async (build, p, q) => { loads++; if (build !== 'm1' || p !== MM.pitcher || q !== MM.lineup) throw new Error('no such file'); return MTEXT; },
  });

  const opts = await api.challengeOptions();
  check('the builder lists the built pairs and the limits', opts.build === 'm1' && opts.pairs[MM.pitcher + '__' + MM.lineup] && opts.limits.lead[1] === 3 && opts.pro === false);
  const pv = await api.previewChallenge(SPEC);
  check('a preview gives the best-play hold% from the table', typeof pv.bestHold === 'number' && pv.bestHold > 0 && pv.bestHold < 100 && pv.scenario.setup.length > 20, JSON.stringify(pv).slice(0, 200));
  check('a preview refuses a bad spec with the reason', (await api.previewChallenge(Object.assign({}, SPEC, { lead: 9 }))).error === 'the lead is 1 to 3 runs');
  check('a pair that is not built is refused', (await api.previewChallenge(Object.assign({}, SPEC, { lineup: 'std-2001-ws7-rivera' }))).error === 'that matchup is not built yet');

  check('signed out: no challenge made', (await api.createChallenge(SPEC)).error === 'sign in to make a challenge');
  S.user = 'maker';
  check('free: no challenge made', (await api.createChallenge(SPEC)).error === 'making a challenge is for Pro');
  S.pro = true;
  const made = await api.createChallenge(SPEC);
  check('Pro makes one, with an https link', made.code === 'ABCDEF' && made.url === 'https://runthe.gg/shut-the-door/?c=ABCDEF');
  check('the server keeps the build, the sha and the rules', S.rows.ABCDEF.build === 'm1' && S.rows.ABCDEF.sha === MSHA && S.rows.ABCDEF.rules === G.RULES);

  // the maker plays his one counted try
  const st = await api.startChallenge('abcdef');
  check('the try is the challenge\'s own start', st.challenge.code === 'ABCDEF' && st.count.b === 2 && st.count.s === 1 && st.outs === 1 && st.bases === 5 && st.batterIndex === 4);
  const playOut = async (id, pick) => { let s = null, n = 0; do { s = await api.throwPitch(id, pick()); } while (s.state.status === 'live' && ++n < 150); return s; };
  const rng = R.mulberry32(5);
  const types = MATCHUP.scenario.pitcher.arsenal.map(a => a.type);
  await playOut(st.outingId, () => ({ type: types[Math.floor(rng() * types.length)], cell: Math.floor(rng() * 25), q: 0.5 }));
  const r1 = await api.finishOuting(st.outingId);
  check('the maker\'s result: no percentile, posted once', r1.percentile === null && r1.challenge.taken === true && S.results.ABCDEF.maker.score === r1.score);
  check('the result names the standings', r1.challenge.players === 1 && r1.challenge.results[0].creator === true);
  const again = await api.finishOuting(st.outingId);
  check('finishing again posts nothing more', again.score === r1.score && Object.keys(S.results.ABCDEF).length === 1);
  check('never the daily, Survivor or the archive', S.daily === 0 && S.survivor === 0 && S.archive === 0);

  // a practice run of the same spot: a fresh seed, never posted
  const pr = await api.startChallenge('ABCDEF', { practice: true });
  await playOut(pr.outingId, () => ({ type: types[0], cell: 12 }));
  const rp = await api.finishOuting(pr.outingId);
  check('practice never posts', rp.challenge.practice === true && S.results.ABCDEF.maker.score === r1.score);

  // a friend: signed out, the same challenge; then signs in and posts
  S.user = null;
  for (const k of Object.keys(mem)) delete mem[k];
  const api2 = (() => { delete require.cache[require.resolve('../api.js')]; return require('../api.js'); })();
  api2.configure({
    load: async p => (p.startsWith('data/matchups.json') ? index : JSON.parse(readFileSync(join(DATA, p.replace(/^data\//, '').replace(/\?v=\d+$/, '')), 'utf8'))),
    loadMatchup: async () => MTEXT,
  });
  const g = await api2.getChallenge('ABCDEF');
  check('a guest opens the link: the maker, his score, the setup, best-play hold%', g.creator === 'maker' && g.players === 1 && g.results[0].score === r1.score
    && g.scenario.setup === pv.scenario.setup && g.bestHold === pv.bestHold);
  const fs1 = await api2.startChallenge('ABCDEF');
  // the friend throws the maker's calls: the same seed and rules, so the same outing
  for (const c of S.results.ABCDEF.maker.calls) { const s = await api2.throwPitch(fs1.outingId, c); if (s.state.status !== 'live') break; }
  const rf = await api2.finishOuting(fs1.outingId);
  check('the same calls on the same challenge make the same score (one game for everyone)', rf.score === r1.score && rf.outcome === r1.outcome);
  check('a guest plays free and keeps it on the device', !rf.challenge.taken && !S.results.ABCDEF.friend);
  S.user = 'friend';
  const cl = await api2.claimChallenge('ABCDEF');
  check('signed in, the guest\'s try posts', cl.posted === true && S.results.ABCDEF.friend.score === rf.score);
  check('a second claim posts nothing', (await api2.claimChallenge('ABCDEF')).posted === false);

  // a broken file is refused, never played
  const api3 = (() => { delete require.cache[require.resolve('../api.js')]; return require('../api.js'); })();
  api3.configure({ load: async () => index, loadMatchup: async () => MTEXT.replace('"keys":', '"keys" :') });
  const broken = await api3.getChallenge('ABCDEF').catch(e => ({ error: e.message }));
  check('a matchup that did not load whole is refused', !!broken.error);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
