/*
 * check-cloudsave.mjs - the run, the career and the daily, kept against the account.
 *
 *   node hoops/check-cloudsave.mjs           the merges, then a real second device
 *   node hoops/check-cloudsave.mjs --quick   the merges only, no browser
 *
 * TWO ARMS BECAUSE THERE ARE TWO CLAIMS, and neither can see the other's failure.
 *
 * cloud.js is arithmetic over two careers and it can be swept in node, which is the only way
 * to ask the question that actually matters: does a merge ever take a badge away. That is a
 * property over the REAL catalog in badges.js rather than a spot check, because the way it
 * would break is somebody swapping a maximum for a sum or a minimum in one field of twelve,
 * and a fixture built around the fields somebody thought of would pass.
 *
 * The page is the other half, and EVERY WAY IT BREAKS RENDERS PERFECTLY. A pull that adopted
 * nothing, a push that was refused, a merge that never ran: all three look exactly like a
 * healthy page belonging to somebody who has not played yet. So the browser arm plays a run on
 * one device and opens a SECOND, EMPTY one, which is the whole feature stated as a test.
 *
 * NOTHING EVER REACHES THE REAL PROJECT. The shelf here is an in-memory stand-in holding the
 * same rule supabase/103_cloud_saves.sql holds, and every request to any other host is aborted.
 * A checker that could write to ps_saves would be putting its fixtures on somebody's account,
 * which is the rule the Stripe checks and check-fantasy.mjs already run on.
 *
 * THE STAND-IN KEEPS 103's REFUSAL, deliberately, rather than accepting everything. Two of the
 * page's rules exist only because a write can be refused: startRun deletes before it saves, and
 * cloudAdoptRun compares before it pushes. Against a shelf that accepted anything, both would
 * pass with the rule removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = '/opt/node22/lib/node_modules/playwright/index.js';
const QUICK = process.argv.includes('--quick');

const CL = require(path.join(HERE, 'cloud.js'));
const BADGES = require(path.join(HERE, 'badges.js'));
/* Every feat key the catalog can read, off its own source: the plain keys, and
   a real member of each collection a prefix names. */
const FEAT_KEYS = (() => {
  const src = fs.readFileSync(path.join(HERE, 'badges.js'), 'utf8');
  const plain = [...src.matchAll(/has\('([a-z0-9.]+)'/g)].map((m) => m[1]);
  return [...new Set(plain.concat(
    BADGES.REUNIONS.map((x) => 're:' + x[0]),
    BADGES.DREAM_TEAM.map((i) => 'id:' + i),
    ['mvp:1996', 'mvp:2016', 'mvp:1987', 'fmvp:1998', 'fmvp:2014', 'fring:CHI', 'fring:BOS',
      'ering:eighties', 'aw:roy', 'aw:dpoy', 'aw:smoy', 'aw:mip', 'aw:an1', 'aw:fmvp']))];
})();
const R = require(path.join(HERE, 'run.js'));

let pass = 0;
const failures = [];
const ok = (cond, what) => { if (cond) pass++; else failures.push(what); };
const is = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${what}\n      expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const J = (v) => JSON.stringify(v);
/* THROUGH JSON, ALWAYS. Every payload in this feature goes to the shelf as JSON and comes back
   parsed, so a merge asserted on in-memory objects is asserting about a shape the page never
   actually holds. It is also the exact seam the `id: undefined` trap lives in. */
const wire = (v) => JSON.parse(JSON.stringify(v));

// ── 1) the merges, over the real catalog ───────────────────────────────────

function rnd(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* A career shaped the way recordRun writes one, with enough spread that a badge threshold is
   sometimes met and sometimes not. The point is not realism, it is COVERAGE of every field a
   badge reads: counters, four count maps, the two shelves and the rows. */
function fakeCareer(seed) {
  const r = rnd(seed);
  const pick = (n, from) => {
    const out = {};
    for (let i = 0; i < n; i++) out[from + Math.floor(r() * 60)] = 1 + Math.floor(r() * 4);
    return out;
  };
  const rows = [];
  const n = Math.floor(r() * 14);
  for (let i = 0; i < n; i++) {
    const w = Math.floor(r() * 74);
    rows.push({
      id: Math.floor(r() * 1e9), w, l: 82 - w, ring: r() < 0.2, po: r() < 0.6,
      rating: Math.floor(r() * 100), chem: Math.round(r() * 250) / 100,
      spend: Math.round(r() * 1700) / 10, left: Math.round(r() * 300) / 10,
      top: Math.round(r() * 600) / 10, pairs: Math.floor(r() * 3),
      aw: r() < 0.5 ? ['mvp'] : [], decorated: Math.floor(r() * 5),
      club: r() < 0.4 ? 'CHI' : null, era: r() < 0.3 ? 'eighties' : null,
      swept: r() < 0.1, lostFinals: r() < 0.15,
    });
  }
  return {
    version: 1,
    runs: Math.floor(r() * 60), rings: Math.floor(r() * 6), playoffs: Math.floor(r() * 30),
    bestWins: Math.floor(r() * 74), bestRating: Math.floor(r() * 100),
    totalWins: Math.floor(r() * 900), totalLosses: Math.floor(r() * 900),
    beat72: r() < 0.2 ? 1 : 0,
    bestLabel: '60-22',
    clubs: pick(Math.floor(r() * 40), 'club'), shapes: pick(Math.floor(r() * 14), 'shape'),
    seasons: pick(Math.floor(r() * 50), '19'), colleges: pick(Math.floor(r() * 25), 'col'),
    /* The feats the catalog reads, drawn off the real keys so the fuzz lights the
       feat badges too: a merge that dropped the map would lose them, and a fuzz
       that never produced one could not see it. */
    feats: FEAT_KEYS.reduce((o, k) => { if (r() < 0.35) o[k] = 1 + Math.floor(r() * 30); return o; }, {}),
    byClub: { CHI: { runs: Math.floor(r() * 9), rings: Math.floor(r() * 3),
      bestWins: Math.floor(r() * 74), bestLabel: '70-12' } },
    rows,
    last: { wins: 50, losses: 32, label: '50-32', headline: 'x', shape: 'y', club: null },
  };
}

const lit = (c) => new Set(BADGES.earned(c).map((b) => b.id));
const covers = (big, small) => [...small].every((k) => big.has(k));

let everLit = new Set();
let sawAGain = false;
for (let s = 1; s <= 220; s++) {
  const a = wire(fakeCareer(s * 7919));
  const b = wire(fakeCareer(s * 104729 + 3));
  const m = CL.mergeCareer(a, b);
  const la = lit(a), lb = lit(b), lm = lit(m);
  for (const k of lm) everLit.add(k);
  if (lm.size > la.size || lm.size > lb.size) sawAGain = true;
  if (!covers(lm, la) || !covers(lm, lb)) {
    failures.push(`seed ${s}: the merge lost a badge. a=${[...la]} b=${[...lb]} merged=${[...lm]}`);
    break;
  }
  /* COMMUTATIVE ON WHAT A BADGE READS. The two sides are not byte-identical, because `last`
     and bestLabel follow whichever career played more and that is an ordering, so the claim is
     made where it has to hold rather than over the whole object. */
  if (J([...lit(CL.mergeCareer(b, a))].sort()) !== J([...lm].sort())) {
    failures.push(`seed ${s}: merging the other way round lights a different cabinet`);
    break;
  }
  /* IDEMPOTENT, WHICH IS WHAT STOPS A BOOT DOUBLING THE ROWS. Both shapes: merging the answer
     with itself, and merging it with a side it already contains, which is what every boot
     after the first one actually does. */
  if (J(CL.mergeCareer(m, m)) !== J(m)) { failures.push(`seed ${s}: merge(m, m) is not m`); break; }
  if (J(CL.mergeCareer(m, b)) !== J(m)) { failures.push(`seed ${s}: re-merging b changes m`); break; }
  if (m.version !== 1) { failures.push(`seed ${s}: version ${m.version}, which loadCareer refuses`); break; }
}
ok(failures.length === 0, failures[0] || 'the merge never took a badge away');
/* A SWEEP THAT LIT NOTHING PROVES NOTHING. Both halves: the catalog has to be genuinely
   reachable from these careers, and a merge has to have actually GAINED a square somewhere,
   or "never lost one" is a claim about two empty sets. */
ok(everLit.size >= 12, `the sweep lit ${everLit.size} distinct badges, which is too few to be a test`);
ok(sawAGain, 'no merge in 220 ever gained a badge, so the superset claim is vacuous');

/* A ROW'S IDENTITY. */
{
  const a = { version: 1, runs: 1, rows: [{ id: 5, w: 60 }] };
  const b = { version: 1, runs: 1, rows: [{ id: 5, w: 60 }] };
  is(CL.mergeCareer(a, b).rows.length, 1, 'one row by id merges to one row');
  const c = { version: 1, runs: 1, rows: [{ id: 6, w: 60 }] };
  is(CL.mergeCareer(a, c).rows.length, 2, 'two ids are two rows even when the numbers match');
  /* A LEGACY ROW HAS NO ID AND STILL HAS TO DEDUPE, or every boot doubles a career written
     before this existed. */
  const d = { version: 1, runs: 1, rows: [{ w: 41, l: 41, ring: false }] };
  const e = { version: 1, runs: 1, rows: [{ ring: false, l: 41, w: 41 }] };
  is(CL.mergeCareer(d, e).rows.length, 1,
    'a legacy row keys on its contents whatever order the fields parsed in');
  /* THE `id: undefined` SEAM. recordRun writes the key even when there is no seed, and JSON
     drops it, so a row keyed one way in memory and another way on the wire would be held
     twice by a union that is supposed to be idempotent. */
  const raw = { id: undefined, w: 55, l: 27 };
  is(CL.rowKey(raw), CL.rowKey(wire(raw)),
    'a row built with an undefined id keys the same before and after JSON');
}

/* THE CAP, AND WHICH SIDE SURVIVES IT. */
{
  const mk = (from, n) => ({ version: 1, runs: n,
    rows: Array.from({ length: n }, (_, i) => ({ id: from + i, w: i })) });
  const m = CL.mergeCareer(mk(0, 200), mk(1000, 200));
  is(m.rows.length, CL.ROW_CAP, 'a merge over the cap is trimmed to the cap');
  ok(m.rows[m.rows.length - 1].id === 199,
    'the trim keeps this device\'s most recent evidence at the newest end');
}

/* bestLabel FOLLOWS bestWins rather than being maxed on its own, or a shelf reports one
   club's win total under another's scoreline. */
{
  const a = { version: 1, runs: 2, bestWins: 60, bestLabel: '60-22',
    byClub: { CHI: { runs: 1, rings: 0, bestWins: 60, bestLabel: '60-22' } } };
  const b = { version: 1, runs: 1, bestWins: 70, bestLabel: '70-12',
    byClub: { CHI: { runs: 1, rings: 1, bestWins: 70, bestLabel: '70-12' } } };
  const m = CL.mergeCareer(a, b);
  is([m.bestWins, m.bestLabel], [70, '70-12'], 'the career best keeps its own scoreline');
  is([m.byClub.CHI.bestWins, m.byClub.CHI.bestLabel, m.byClub.CHI.rings], [70, '70-12', 1],
    'a club shelf keeps its own scoreline and maxes its rings');
}

// ── 2) the daily ───────────────────────────────────────────────────────────
{
  const phone = { v: 1, played: 9, streak: 4, bestStreak: 7, lastDone: 100, best: 61,
    day: 100, iso: '2026-09-20', done: true, wins: 61, losses: 21, label: '61-21' };
  const laptop = { v: 1, played: 6, streak: 2, bestStreak: 3, lastDone: 102, best: 55,
    day: 102, iso: '2026-09-22', done: true, wins: 55, losses: 27, label: '55-27' };
  const m = CL.mergeDaily(phone, laptop);
  is(m.played, 9, 'the daily count takes the maximum');
  is(m.bestStreak, 7, 'a best streak set on the other device survives');
  is(m.best, 61, 'the best daily takes the maximum');
  /* THE DAY GROUP MOVES TOGETHER. `done` and `day` are what refuse a second attempt at today,
     and `streak` is a statement about the most recent day rather than a high-water mark, so a
     record claiming today's streak under yesterday's scoreline is the thing to catch. */
  is([m.day, m.iso, m.streak, m.label], [102, '2026-09-22', 2, '55-27'],
    'the later day supplies the day, the streak and the scoreline as one group');
  is(J(CL.mergeDaily(m, m)), J(m), 'merging a daily with itself changes nothing');
  is(J(CL.mergeDaily(laptop, phone)), J(m), 'the daily merge is commutative');
  ok(CL.mergeDaily({}, {}) === null, 'two empty records merge to nothing rather than to a record');
  /* A STREAK CANNOT EXCEED ITS OWN BEST, or the next maximum reads as a drop. */
  const odd = CL.mergeDaily({ v: 1, played: 1, streak: 9, bestStreak: 0, day: 5 }, {});
  ok(odd.bestStreak >= odd.streak, 'a merged best streak covers the streak it is carrying');
}

// ── 3) how far along a run is ──────────────────────────────────────────────
{
  /* EVERY PHASE THE GAME HAS NEEDS A RANK. A phase missing from the ladder silently ranks
     zero, so a bracket would compare equal to an empty draft and the wrong device would win.
     The way that arrives is somebody adding a phase to run.js, which is why this reads
     R.PHASES rather than a list written here. */
  const src = fs.readFileSync(path.join(HERE, 'cloud.js'), 'utf8');
  const m = /var PHASE_RANK = \{([^}]*)\}/.exec(src);
  ok(!!m, 'cloud.js still declares PHASE_RANK');
  const ranked = m ? m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean) : [];
  const phases = Object.values(R.PHASES);
  for (const p of phases) ok(ranked.includes(p), `the phase "${p}" has a rank in cloud.js`);
  is(ranked.length, phases.length, 'the ladder ranks the phases the game has and no others');

  const at = (o) => CL.runProgress(o);
  ok(at({ phase: 'draft', roster: [] }) < at({ phase: 'draft', roster: [1, 2] }),
    'a fuller draft is further along than an emptier one');
  ok(at({ phase: 'draft', roster: [1, 2, 3, 4, 5] }) < at({ phase: 'season' }),
    'a played season is further along than any draft');
  ok(at({ phase: 'season' }) < at({ phase: 'playoffs', po: { results: [] } }),
    'a bracket is further along than a season');
  ok(at({ phase: 'playoffs', po: { results: [1] } })
     < at({ phase: 'playoffs', po: { results: [1, 2] } }),
    'a later round is further along than an earlier one');
  ok(at({ phase: 'playoffs', po: { results: [1, 2, 3, 4] } }) < at({ phase: 'over' }),
    'a finished run is further along than a bracket');
  is(at(null), 0, 'no run at all is zero rather than a throw');

  /* DRIVEN THROUGH A REAL DRAFT, because the fixtures above are hand-built and a ladder that
     agreed with itself and disagreed with run.js would pass all of them. */
  const data = R.indexData(JSON.parse(
    fs.readFileSync(path.join(HERE, 'data', 'players.json'), 'utf8')));
  void data;
  const run = R.createRun({ seed: 12345 });
  let last = CL.runProgress(run);
  ok(last === CL.runProgress(wire(run)), 'a run measures the same through JSON as in memory');
  is(run.phase, R.PHASES.DRAFT, 'a fresh run starts in the draft, which is the bottom rung');
  ok(last >= 0, 'a fresh run has a progress');
}

/* THE TRANSPORT HAS TO KNOW THIS GAME'S AUTH MODULE. A game missing from that list saves
   nothing at all, silently, because `token` answering null is also what signed out looks
   like: no request, no error, no save, and a cabinet that never arrives. */
{
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'cloudsave.js'), 'utf8');
  ok(/root\.RTF_AUTH/.test(src), 'cloudsave.js reads window.RTF_AUTH for a token');
  ok(/root\.RTF_BOARD_URL/.test(src),
    'cloudsave.js honours RTF_BOARD_URL, so a hoops check cannot point a save at the live project');
}

/* AND THE PAGE HAS TO ASK. Every push and the pull itself are wired into functions this file
   cannot reach from node, so the wiring is read: a pull that nothing calls is a feature that
   never runs, and it looks exactly like an account with nothing on the shelf. */
{
  const page = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  /* THE SPAN IS AN ARGUMENT BECAUSE recordRun IS A HUNDRED AND FIFTY LINES. Written as one
     window for every function, the two career assertions below reported a page that does not
     push at all, which is a reader failing rather than a defect and is the shape three
     extractors in this repo have already got wrong. */
  const after = (name, body, span) => {
    const i = page.indexOf(name);
    return i >= 0 && page.slice(i, i + (span || 2600)).includes(body);
  };
  ok(after('A.onChange(function()', 'cloudPull()'),
    'the pull is asked on every change of account, which is where a sign in lands');
  ok(after('function save(', 'cloudPushRun()'), 'saving a run pushes it');
  ok(after('function abandonRun(', 'cloudDropRun()'), 'abandoning a run deletes it from the shelf');
  ok(after('function recordRun(', 'cloudPushCareer(c)', 9000), 'recording a run pushes the career');
  ok(after('function recordRun(', 'cloudPushDaily(day)', 9000), 'and the daily beside it');
  /* AND NOT FROM THE LIFTED ONE. verify.mjs brace-matches dailyRecord out of this page and
     drives it in node, so a page-level call inside it is a ReferenceError in a suite that has
     nothing to do with the shelf. It already shipped that way once. */
  ok(!after('function dailyRecord(', 'cloudPushDaily'),
    'the daily push is not inside dailyRecord, which verify.mjs lifts out of the page');
  ok(after('function clearCareer(', 'SLOT_CAREER'), 'clearing the career deletes it from the shelf');
  /* THE DROP HAS TO COME BEFORE THE NEW RUN EXISTS. A fresh run is progress zero, so a put
     over a stored bracket is refused and this device would go on drafting while every boot
     anywhere resumed the run that was just abandoned. */
  const sr = page.indexOf('function startRun(');
  const drop = page.indexOf('cloudDropRun()', sr);
  const made = page.indexOf('run = R.createRun(', sr);
  ok(sr >= 0 && drop >= 0 && made >= 0 && drop < made,
    'startRun drops the stored run BEFORE it builds the new one');
}

/* THE COPY. This page told a reader their career was "stored in this browser only" and that
   "nothing here is sent anywhere", which was true for a year and is not true now. A page
   claiming a record is private while it is on a server is the worst kind of stale copy. */
{
  const page = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  const i = page.indexOf('function renderCareerNote(');
  const note = i >= 0 ? page.slice(i, i + 900) : '';
  ok(i >= 0, 'the page says where the career is kept, in a function rather than in markup');
  ok(/cloudReady\(\)/.test(note), 'what it says is decided by whether there is an account');
  ok(/browser only/.test(note) && /on your account/.test(note),
    'it has both sentences: this browser when signed out, the account when signed in');
  /* READ WITH THE COMMENTS OUT, because the markup and this file both QUOTE the old sentence
     in order to explain why it went. A checker that reported its own explanation as the defect
     would be this repo's own rule arriving again: if it fires inside a comment, the comment is
     not the bug. */
  const said = page.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok(!/nothing here is sent anywhere/.test(said),
    'the old claim that nothing is sent anywhere is gone from the copy');
  ok(/nothing here is sent anywhere/.test(page),
    'and the comment that replaced it still records what it used to say');
}

function report() {
  console.log(`\n${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log('  FAIL ' + f);
  process.exit(failures.length ? 1 : 0);
}

if (QUICK) report();

// ── 4) a real second device ────────────────────────────────────────────────

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const CORS = { 'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-range,content-length' };

const ROSTER_SIZE = (() => {
  const src = fs.readFileSync(path.join(HERE, 'engine.js'), 'utf8');
  const m = /const SLOTS = \[([^\]]*)\]/.exec(src);
  if (!m) throw new Error('could not read SLOTS out of engine.js');
  return m[1].split(',').filter((x) => x.trim()).length;
})();

/*
 * THE SHELF, HOLDING 103's OWN RULE.
 *
 * One row per (user, game, slot), a write that would move a save BACKWARDS is refused and hands
 * back what is stored, and a drop is the only way a row leaves. Accepting everything instead
 * would make two of the page's rules untestable: startRun's delete and cloudAdoptRun's
 * comparison both exist only because a write can be refused.
 */
const shelf = { rows: new Map(), calls: [], refused: 0, user: 'user-one' };
const shelfKey = (g, s) => shelf.user + '/' + g + '/' + s;

function shelfRpc(fn, body) {
  const g = body.p_game, s = body.p_slot;
  if (fn === 'ps_save_all') {
    const out = [];
    for (const [k, v] of shelf.rows) {
      if (k.startsWith(shelf.user + '/' + g + '/')) out.push(v);
    }
    out.sort((a, b) => a.slot < b.slot ? -1 : 1);
    return out;
  }
  if (fn === 'ps_save_get') {
    const v = shelf.rows.get(shelfKey(g, s));
    return v ? [v] : [];
  }
  if (fn === 'ps_save_drop') { shelf.rows.delete(shelfKey(g, s)); return true; }
  if (fn === 'ps_save_put') {
    const prog = Math.max(0, Math.floor(body.p_progress || 0));
    const had = shelf.rows.get(shelfKey(g, s));
    if (had && had.progress > prog) {
      shelf.refused++;
      return [{ ok: false, slot: s, progress: had.progress, payload: had.payload,
        saved_at: had.saved_at }];
    }
    const row = { ok: true, slot: s, progress: prog, payload: body.p_payload,
      saved_at: new Date().toISOString() };
    shelf.rows.set(shelfKey(g, s), row);
    return [row];
  }
  return null;
}

async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());
  /* Accounts are faked in the page below rather than loaded, so the real library is refused
     outright: a live auth client has no business in a save test. */
  if (u.hostname === 'cdn.jsdelivr.net') return route.abort();
  if (u.hostname === 'board.test') {
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json',
      headers: CORS, body: JSON.stringify(b) });
    const m = /\/rpc\/([a-z_]+)$/.exec(u.pathname);
    if (m && m[1].startsWith('ps_save_')) {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) { body = {}; }
      shelf.calls.push(m[1] + ':' + (body.p_slot || ''));
      return json(shelfRpc(m[1], body));
    }
    /* Anything else on this host is the leaderboard, which this file is not about. */
    if (/count=exact/.test(req.headers()['prefer'] || '')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        headers: Object.assign({}, CORS, { 'content-range': '0-0/0' }), body: '[]' });
    }
    return json([]);
  }
  if (u.hostname !== 'local.test') return route.abort();
  let rel = decodeURIComponent(u.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return route.abort();
  await route.fulfill({ status: 200,
    contentType: TYPES[path.extname(f)] || 'application/octet-stream',
    body: fs.readFileSync(f) });
}

/* THE ACCOUNT IS FAKED AFTER auth.js HAS RUN, not before it. auth.js assigns window.RTF_AUTH
   at the end of its own IIFE, so an init script that installed a stand-in first would simply
   be overwritten. Both the page and the transport read that object at CALL time, so replacing
   two of its functions is enough for every layer under test to believe there is a session. */
async function signIn(page, userId) {
  await page.evaluate((id) => {
    window.RTF_AUTH.token = () => 'fake-token';
    window.RTF_AUTH.state = () => ({ ready: true, waiting: false, signedIn: true, userId: id });
  }, userId);
}

async function newPage(browser, boom) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 220)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::|Failed to load resource/.test(t)) return;
    boom.push('console: ' + t.slice(0, 200));
  });
  await page.route('**/*', serve);
  await page.addInitScript(() => { window.RTF_BOARD_URL = 'http://board.test'; });
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-start:not([disabled])', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#frg-x'); if (b) b.click(); });
  await page.waitForTimeout(200);
  return { page, ctx };
}

const signedCount = (page) => page.evaluate(() => {
  try {
    const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
    return r && Array.isArray(r.roster) ? r.roster.length : -1;
  } catch (e) { return -1; }
});

/* Draft through the page's own controls, because the page is the only thing that knows how.
   `.opts:not(.pending)` is load-bearing for the reason check-board.mjs records at length: a
   pending tile is a visible box with a size, and a scripted click ignores pointer-events. */
async function draft(page, picks, start) {
  /* `start` IS A PARAMETER AND NOT A DEFAULT, because pressing Start is how a run BEGINS and
     this file also drafts on a run that was resumed. Written to always press it, the walk that
     is meant to carry the adopted run further quietly began a fresh one instead: the shelf then
     held a two man draft where the assertion above it had just asked for a full one, and the
     failure landed two steps later as a device that would not adopt. */
  if (start) await page.evaluate(() => document.querySelector('#b-start').click());
  for (let i = 0; i < picks; i++) {
    await page.waitForSelector('.opts:not(.pending) .ptile:not(.off)', { timeout: 25000 });
    await page.evaluate(() => document.querySelector('.opts:not(.pending) .ptile:not(.off)').click());
    const want = i + 1;
    await page.waitForFunction((n) => {
      try {
        const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
        return r && r.roster && r.roster.length >= n;
      } catch (e) { return false; }
    }, want, { timeout: 25000 });
  }
}

const quiet = (page) => page.waitForFunction(
  () => !window.RTG_SAVE || window.RTG_SAVE.idle(), null, { timeout: 15000 });

async function main() {
  const pw = (await import(PW)).default;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const boom = [];
  try {
    // ---- the first device ------------------------------------------------
    const one = await newPage(browser, boom);
    await signIn(one.page, 'user-one');
    /* NOTHING IS ON THE SHELF UNTIL THERE IS AN ACCOUNT, which is the state every other
       assertion here is measured against. */
    is(shelf.calls.length, 0, 'a signed out page never touches the shelf');

    await draft(one.page, 3, true);
    await quiet(one.page);
    is(await signedCount(one.page), 3, 'the first device drafted three men');
    const stored = shelf.rows.get('user-one/rtf/run');
    ok(!!stored, 'the run in progress reached the shelf');
    ok(stored && stored.payload && stored.payload.roster.length === 3,
      'and what reached it is the run as it stands rather than an earlier one');
    ok(stored && stored.progress === 3,
      `a three man draft is progress 3, got ${stored && stored.progress}`);

    /* A CAREER, PUT THERE BY HAND. Playing 82 games and a bracket through the page to file one
       row takes minutes, and what is under test is the SYNC rather than the season: the merge
       itself is swept over the real catalog in section 1 above. */
    await one.page.evaluate(() => {
      const c = { version: 1, runs: 11, rings: 2, playoffs: 7, bestWins: 66, bestRating: 91,
        bestLabel: '66-16', totalWins: 500, totalLosses: 402, beat72: 0,
        clubs: { Bulls: 3, Lakers: 2 }, shapes: { Triangle: 2 }, seasons: { 1996: 2 },
        colleges: { 'North Carolina': 1 },
        rows: [{ id: 101, w: 66, l: 16, ring: true, po: true, rating: 91 }],
        last: { wins: 66, losses: 16, label: '66-16', headline: 'Champions', shape: '', club: null } };
      localStorage.setItem('runthefloor_career_v1', JSON.stringify(c));
      localStorage.setItem('rtf.daily.v1', JSON.stringify({ v: 1, played: 4, streak: 3,
        bestStreak: 3, lastDone: 900, best: 58, day: 900, iso: '2026-09-22', done: true }));
      window.RTF_SYNC.pushCareer(c);
      window.RTF_SYNC.pushDaily(JSON.parse(localStorage.getItem('rtf.daily.v1')));
    });
    await quiet(one.page);
    ok(shelf.rows.has('user-one/rtf/career'), 'the career reached the shelf');
    ok(shelf.rows.has('user-one/rtf/daily'), 'the daily reached the shelf');

    // ---- the second device -----------------------------------------------
    /* A FRESH CONTEXT IS THE WHOLE POINT. Its localStorage is empty, so this is a phone that
       has never opened the game, and everything it ends up holding came off the shelf. */
    const two = await newPage(browser, boom);
    const empty = await two.page.evaluate(() => ({
      run: localStorage.getItem('runthefloor_run_v1'),
      career: localStorage.getItem('runthefloor_career_v1'),
    }));
    is([empty.run, empty.career], [null, null], 'the second device starts with nothing at all');
    /* AND IT SHOWS AN EMPTY CABINET FIRST, or "the badges arrived" is a claim about a screen
       that was already full. */
    const before = await two.page.evaluate(() => {
      document.querySelector('#b-mark')?.click?.();
      return (window.RTF_BADGES && window.RTF_BADGES.earned(
        JSON.parse(localStorage.getItem('runthefloor_career_v1') || 'null') || {}).length) || 0;
    });
    is(before, 0, 'and an empty cabinet to go with it');

    await signIn(two.page, 'user-one');
    await two.page.evaluate(() => window.RTF_SYNC.pull());
    await two.page.waitForFunction(
      () => !!localStorage.getItem('runthefloor_career_v1'), null, { timeout: 15000 });
    await quiet(two.page);

    const got = await two.page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('runthefloor_career_v1') || 'null');
      const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
      const d = JSON.parse(localStorage.getItem('rtf.daily.v1') || 'null');
      return { runs: c && c.runs, rings: c && c.rings, rows: c && c.rows.length,
        badges: window.RTF_BADGES.earned(c).length,
        roster: r && r.roster ? r.roster.length : -1,
        streak: d && d.bestStreak,
        note: (document.querySelector('#pf-store') || {}).textContent || '' };
    });
    is(got.runs, 11, 'the second device now holds the career');
    is(got.rings, 2, 'and its rings');
    is(got.rows, 1, 'and its rows');
    ok(got.badges > 0, 'and the cabinet has squares in it');
    is(got.roster, 3, 'and the run in progress, which is what it opened on');
    is(got.streak, 3, 'and the daily streak');

    /* THE RESUME DOOR HAS TO SAY SO. A run that arrived and is not offered is a run nobody
       can reach, which is the dynasty leaderboard that rendered perfectly and had no door. */
    const door = await two.page.evaluate(() => {
      const b = document.querySelector('#b-resume');
      return { shown: !!b && !b.hidden && getComputedStyle(b).display !== 'none' };
    });
    ok(door.shown, 'the front page offers the run that arrived');

    /* THE COPY, ON THE SCREEN RATHER THAN IN THE SOURCE. */
    /* Opened the way a reader opens it, so the note is read off the real sheet. */
    await two.page.evaluate(() => document.querySelector('#ab-action').click());
    await two.page.waitForTimeout(150);
    const note = await two.page.evaluate(
      () => (document.querySelector('#pf-store') || {}).textContent || '');
    ok(/on your account/.test(note),
      `a signed in reader is told the career is on the account, got "${note.slice(0, 80)}"`);

    // ---- further along wins, and a restart deletes ------------------------
    /* THE SECOND DEVICE PLAYS ON, so it is genuinely ahead. Then the FIRST one pulls, and the
       claim is that it adopts rather than overwriting with its own three man draft. */
    await two.page.evaluate(() => document.querySelector('#b-resume').click());
    await draft(two.page, ROSTER_SIZE - 3, false);
    await quiet(two.page);
    /* FURTHER ALONG THAN THE THREE MAN DRAFT, asserted as the property rather than as a
       number. Signing the last man ends the draft, so a full roster is already on the SEASON
       rung and pinning the roster size here would be asserting the ladder's own arithmetic
       instead of the thing under test. */
    const carried = shelf.rows.get('user-one/rtf/run');
    ok(carried && carried.progress > 3,
      `the shelf holds a run further along than the three man draft, got ${carried && carried.progress}`);
    ok(carried && carried.payload.roster.length === ROSTER_SIZE,
      'and the roster on it is the full one the second device finished');

    await one.page.evaluate(() => { document.querySelector('#b-mark').click(); });
    await one.page.evaluate(() => window.RTF_SYNC.pull());
    /* A TIMEOUT HERE HAS TO SAY WHAT THE PAGE WAS HOLDING. Waiting for an adopt that never
       comes is indistinguishable from every other way this feature fails, so the wait is
       allowed to lapse and the assertion below reports the roster it actually found. */
    await one.page.waitForFunction((n) => {
      try {
        const r = JSON.parse(localStorage.getItem('runthefloor_run_v1') || 'null');
        return r && r.roster && r.roster.length === n;
      } catch (e) { return false; }
    }, ROSTER_SIZE, { timeout: 15000 }).catch(() => {});
    is(await signedCount(one.page), ROSTER_SIZE,
      `the device that was behind adopted the fuller run (the shelf held progress `
      + `${shelf.rows.get('user-one/rtf/run')?.progress})`);
    is(shelf.refused, 0, 'and did not have to be refused to work it out');

    /* STARTING OVER DELETES. A fresh run is progress zero, so without the drop the put is
       refused and the abandoned run comes back on the next boot. */
    await one.page.evaluate(() => { document.querySelector('#b-mark').click(); });
    await one.page.evaluate(() => document.querySelector('#b-start').click());
    await one.page.waitForTimeout(400);
    await quiet(one.page);
    const after = shelf.rows.get('user-one/rtf/run');
    ok(after && after.progress === 0,
      `starting over leaves a fresh run on the shelf, got progress ${after && after.progress}`);
    is(shelf.refused, 0, 'and the fresh run was not refused by the progress rule');

    /* ABANDONING REMOVES THE ROW RATHER THAN WRITING A SMALLER ONE. */
    await one.page.evaluate(() => { document.querySelector('#b-mark').click(); });
    await one.page.evaluate(() => document.querySelector('#b-abandon').click());
    await quiet(one.page);
    ok(!shelf.rows.has('user-one/rtf/run'), 'abandoning a run takes it off the shelf');

    // ---- somebody else's browser -----------------------------------------
    /* TWO ACCOUNTS ON ONE BROWSER. Signing in as somebody else must NOT fold the previous
       reader's runs, rings and streak into their cabinet: that is a disclosure rather than a
       lost save, and nothing on the screen would say so. */
    shelf.user = 'user-two';
    await two.page.evaluate(() => { document.querySelector('#b-mark').click(); });
    await signIn(two.page, 'user-two');
    await two.page.evaluate(() => window.RTF_SYNC.pull());
    /* ALLOWED TO LAPSE, so the defect it exists for reports as a failure naming what the
       browser was left holding rather than as a timeout naming a line number. Reintroduced,
       a pull that always claims leaves the previous account's career sitting there. */
    await two.page.waitForFunction(
      () => !localStorage.getItem('runthefloor_career_v1'), null, { timeout: 15000 })
      .catch(() => {});
    await quiet(two.page);
    const second = await two.page.evaluate(() => ({
      career: localStorage.getItem('runthefloor_career_v1'),
      daily: localStorage.getItem('rtf.daily.v1'),
      owner: localStorage.getItem('rtf.owner.v1'),
    }));
    is(second.career && JSON.parse(second.career).runs, null,
      'a new account on this browser does not inherit the last one\'s career');
    is(second.daily, null, 'nor its daily streak');
    is(second.owner, 'user-two', 'and the browser records whose copy it is now holding');
    ok(!shelf.rows.has('user-two/rtf/career'),
      'and the previous account\'s career was never pushed onto the new one');

    ok(boom.length === 0, 'no page errors: ' + boom.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  report();
}

main().catch((e) => { console.error(e); process.exit(1); });
