/* Shut The Door: the custom challenges' matchups, finished with the engine.
 *
 * Node only, at build time (the page never loads it):
 *   node shut-the-door/matchups.js <stage dir> <out dir> [--pros pipeline/cache/pros.json] [--shard i/n] [--only P__Q,...]
 *   node shut-the-door/matchups.js --index <out dir> <build>     writes data/matchups.json from what is built
 *
 * The stage dir holds pipeline/build_matchups.py's pairs (cache/matchups/stage/<P>__<Q>.json).
 * For each one, as pool.js does for a daily pack:
 *   1. the pack format (E.PACK_VERSION) and the runners' table (data/runners.json, rules 6)
 *   2. the hold table, solved for every state of the one half with every lead 0 to
 *      scenario.tableLead (3), so a challenge can start anywhere a player can pick (challenge.js)
 *   3. the rules 2 centre: the closer pool's real sequencing played through the pair (pool.js
 *      seqCenter), as every daily pack has it
 *   4. the lesson's pro examples the table can show (pool.js attachPros)
 *   5. the closer pool's names and style vectors for pitched like. No pool scores: a challenge
 *      has no percentile (the owner's call, 2026-11-18), so nothing is played for one
 * and writes <out dir>/<P>/<Q>.json.gz (gzip of the minified JSON) with <P>/<Q>.meta.json beside
 * it: the sha256 of the JSON (the page checks it before it plays), its size and the start's hold%.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const E = require('./engine.js');
const G = require('./grade.js');
const P = require('./pool.js');

const DATA = path.join(__dirname, 'data');

function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function finish(pack, closersFile, pros) {
  pack.v = E.PACK_VERSION;
  const rn = path.join(DATA, 'runners.json');
  if (fs.existsSync(rn)) { const r = JSON.parse(fs.readFileSync(rn, 'utf8')); pack.runners = { source: r.source, dist: { coef: r.dist.coef }, edges: r.edges, ratio: r.ratio }; }
  const t0 = Date.now();
  pack.hold = new G.Model(pack, { fresh: true }).holdTable();
  const solveMs = Date.now() - t0;
  delete pack.seq;
  pack.seq = P.seqCenter(pack, closersFile.closers, new G.Model(pack));
  const model = new G.Model(pack);
  P.attachPros(pack, pros, model);
  pack.pool = { scores: [], closers: closersFile.closers.map(c => ({ name: c.name, vec: c.vec, reason: c.reason })) };
  const start = model.solve(model.startState());
  // only what the data decides goes in the pack, so two builds of one library make the same bytes;
  // the solve's time is the machine's and goes in the meta beside it (writePair)
  pack.build = Object.assign(pack.build || {}, { startHold: Math.round(start.hold * 10000) / 100 });
  Object.defineProperty(pack, 'solveMs', { value: solveMs, enumerable: false });
  return pack;
}

function writePair(outDir, pack) {
  const m = pack.scenario.matchup;
  const dir = path.join(outDir, m.pitcher);
  fs.mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(pack);
  const gz = zlib.gzipSync(Buffer.from(text), { level: 9 });
  fs.writeFileSync(path.join(dir, m.lineup + '.json.gz'), gz);
  const meta = { sha: sha(text), bytes: text.length, gz: gz.length, startHold: pack.build.startHold, solveMs: pack.solveMs };
  fs.writeFileSync(path.join(dir, m.lineup + '.meta.json'), JSON.stringify(meta));
  return meta;
}

/* data/matchups.json: what the builder screen lists without loading a pair, and the sha the page
   checks each pair against. A pair absent here was not built (build_matchups.py left it out). */
function index(outDir, build) {
  const packs = path.join(DATA, 'packs');
  const ids = fs.readdirSync(packs).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  const read = id => JSON.parse(fs.readFileSync(path.join(packs, id + '.json'), 'utf8'));
  const pitchers = [], lineups = [], pairs = {};
  for (const id of ids) {
    const pk = read(id), sc = pk.scenario;
    pitchers.push({ id, name: sc.pitcher.name, team: sc.pitcher.team, year: sc.pitcher.year, throws: sc.pitcher.throws,
      resolution: sc.resolution });
    const order = sc.halves && sc.halves.length ? sc.halves[0].lineup : sc.batters.map((_, i) => i);
    lineups.push({ id, year: sc.pitcher.year, resolution: sc.resolution, team: null,
      batters: order.slice(0, 9).map(i => ({ id: String(sc.batters[i].id), name: sc.batters[i].name })) });
  }
  for (const p of ids) for (const q of ids) {
    const f = path.join(outDir, p, q + '.meta.json');
    if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    pairs[p + '__' + q] = { sha: m.sha, gz: m.gz, startHold: m.startHold };
    // the lineup's club, as its pairs name it (build_matchups.py reads it from the verified game)
    const l = lineups.find(x => x.id === q);
    if (!l.team) {
      const pk = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(outDir, p, q + '.json.gz'))).toString());
      l.team = pk.scenario.matchup.lineupTeam;
    }
  }
  return { v: 1, build, pitchers, lineups, pairs };
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (a[0] === '--index') {
    const out = index(a[1], a[2]);
    const dest = path.join(DATA, 'matchups.json');
    fs.writeFileSync(dest, JSON.stringify(out));
    console.log(`${dest}: ${Object.keys(out.pairs).length} pairs, build ${out.build}`);
  } else {
    const [stage, outDir] = a.filter((x, i) => !x.startsWith('--') && !(a[i - 1] || '').startsWith('--'));
    const pros = opt('--pros') && fs.existsSync(opt('--pros')) ? JSON.parse(fs.readFileSync(opt('--pros'), 'utf8')) : null;
    const closers = JSON.parse(fs.readFileSync(path.join(DATA, 'closers.json'), 'utf8'));
    const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
    let files = fs.readdirSync(stage).filter(f => f.endsWith('.json')).sort();
    if (only) files = files.filter(f => only.has(f.slice(0, -5)));
    if (opt('--shard')) { const [i, n] = opt('--shard').split('/').map(Number); files = files.filter((_, k) => k % n === i); }
    const skip = a.includes('--skip-built');
    for (const f of files) {
      const [p, q] = f.slice(0, -5).split('__');
      if (skip && fs.existsSync(path.join(outDir, p, q + '.meta.json'))) continue;
      const t0 = Date.now();
      const pack = finish(JSON.parse(fs.readFileSync(path.join(stage, f), 'utf8')), closers, pros);
      const m = writePair(outDir, pack);
      console.log(`${p} x ${q}: ${(m.gz / 1e3).toFixed(0)} KB gz (${(m.bytes / 1e6).toFixed(2)} MB), start hold ${m.startHold}%, solve ${m.solveMs} ms, ${Date.now() - t0} ms`);
    }
  }
}

module.exports = { finish, writePair, index, sha };
