/* No body snaps, pops, teleports or slides in the ball in play: every fielder and runner, every frame.
 *
 *   node shut-the-door/lab/pipeline/check-jolt.mjs              every 20th case check-inplay plans (2,925)
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --all        every case (about three and a half hours)
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --stride N   every Nth case
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --limit N    the first N of those (reported, not held)
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --show N     print N of the worst in full
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --sample N   about N of the held 2,925 (held at the ceilings' rate)
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --resume     pick up a killed run (checkpoint.mjs says how)
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --shard I/4 --rows-out F   a quarter of the run, its plays to F
 *   node shut-the-door/lab/pipeline/check-jolt.mjs --combine DIR the shards' files in DIR, held as one run
 *   (CI runs the held 2,925 as four shards and then --combine: the same plays, the same verdict, exactly)
 *
 * The owner (2026-10-24): "the fielding is extremely glitchy". check-catch holds the glove on the ball at
 * the moment of each catch; this holds every moment in between. Each case is staged the way the game
 * stages it (inplay.js begin) and played at 60 frames a second of real time through the broadcast's cut
 * (the slow motion beat slowed, a jump cut starting the bodies afresh), the camera's own culling on, so
 * what is measured is what is drawn. On every body drawn in three frames running (the nine fielders,
 * the runners) seven points are followed: the root, the pelvis, the head, both hands, both feet. Two
 * things are counted:
 *
 *   pop    a point moving faster than a body can: the root, the pelvis or the head over BODY_MS, a hand
 *          or a foot over LIMB_MS against the pelvis (a sprinter's hips are near 9 m/s, a thrower's hand
 *          near 30). Speeds are in scene time, so a pop in the slow motion beat is no smaller for it.
 *   skate  a foot planted (the lower foot, under PLANT_M for PLANT_N frames running (a tenth of a
 *          second: a swing foot passing low under a jogger is there for less), barely moving up or
 *          down) sliding over SKATE_MS: a body carried along the grass with its feet still.
 *
 * Each is counted as the plays that have one, by who (fielder or runner) and what he was last doing
 * (his last act: a catch, a throw, a tag, a cover, '-' before any), held to CEILING: a ceiling that only
 * comes down. A change that pops more fails; one that pops less lowers the number in the same commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inplayCases } from './inplay-cases.mjs';
import { selection, holding, capStr, openCheckpoint, treeHash } from './checkpoint.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const ALL = process.argv.includes('--all');
const SEL = selection({ heldStride: 20, total: [...inplayCases()].length });
const STRIDE = ALL ? 1 : SEL.stride, LIMIT = arg('--limit', Infinity), SHOW = arg('--show', 0);
const FPS = 60;
// (--only N plays case N alone; JOLT_TRACE=F9:2.4:2.6 prints that body's points frame by frame)
const ONLY = process.argv.includes('--only') ? arg('--only', 0) : null, TRACE = process.env.JOLT_TRACE || '';
export const BODY_MS = 16, LIMB_MS = 40, PLANT_M = 0.09, PLANT_N = 6, SKATE_MS = 4;
// What is still there, all of it measured on the default sample (every 20th case, 2026-10-25): plays
// with a pop or a skate, by who and his last act. On main before this check (#708) a pop was in
// 2,920 of these 2,925 plays and a skate in 2,522; with its first fixes, 909 and 1,643. A ceiling
// that only comes down.
// The wider broadcast (#710) draws more of the field, so more bodies are on screen and measured: the
// count rose to 1,043 plays with a pop and 1,704 with a skate (runners and covering fielders, now in
// frame) with the worst of each unchanged. The same motion, more of it seen; recorded here once.
// The eased broadcast (2026-10-26) holds each shot longer and keeps throws and runners in frame, so again
// more bodies are measured (runners and covering fielders). The motion is the same: with every body measured
// whether on screen or not, main had 9,147 plays over and this change 8,978, with no body code touched.
// Recorded here once, for that reason only.
// The broadcast camera plan (site PR #741, 2026-10-27) holds an infield play in one high shot and cuts less:
// 108 fewer jump cuts and 2.0% more of each play shown (every 40th case), so frames a jump cut skipped are now
// measured. With every body measured, on screen or not, main had 801 plays with a pop and 993 with a skate,
// and #741 811 and 1,003. The rise is the frames shown, not motion: every fielder's and runner's track and
// every act is identical to main's at every plan time (1,463 plays, max difference 0 ft), the posing change
// (fielders.js aimFast) gives the same bones to the bit, and each row's worst speed holds. Accepted by the
// coordinator on the terms of #710 and #725; these are the on screen counts at the default stride, once.
// The flight and who catches it (site PR #742, 2026-10-27) changes the plays themselves: the same rows now have
// new flights, catch spots and catchers, so a row's count is a count of different plays. Three pops it brought
// were fixed at the source first (a run through catch held dead, the held glove dropped at a windup, a
// backpedal that spun divers, reverted). With every body measured against main (0ed4342): plays with a pop
// 1,641 against 1,635, with a skate 2,001 against 2,039. Recorded here once, on the coordinator's decision.
// Close plays (site PR #743, 2026-10-27) tighten a tag-up thrown out to bang bang. Three rows rose: skate runner run
// 863 to 869, pop fielder - 433 to 437, skate fielder - 212 to 215. The new runner skates are runners thrown out
// tagging who slide into the tag faster (a real slide moves its feet over the dirt). The F7 and F8 hits come from
// tracks and acts identical to main, read at the threshold (40.6 m/s against 40) on frames the slowed beat moved.
// With every body measured against main (c6922cc) the totals fall: plays with a pop 1,641 to 1,624, with a skate
// 2,001 to 1,968. Recorded here once, on the coordinator's decision.
const CEILING = {
  'pop fielder -': 437,
  'pop fielder bobble': 106,
  'pop fielder catch': 12,
  'pop fielder catch_throw': 2,
  'pop fielder cover': 71,
  'pop fielder dive': 16,
  'pop fielder dive_short': 75,
  'pop fielder field': 100,
  'pop fielder leap_miss': 2,
  'pop fielder pickup': 19,
  'pop fielder reach': 10,
  'pop fielder set': 16,
  'pop fielder tag': 195,
  'pop fielder throw': 8,
  'pop runner run': 614,
  'skate fielder -': 215,
  'skate fielder bobble': 22,
  'skate fielder catch_throw': 3,
  'skate fielder cover': 434,
  'skate fielder dive': 14,
  'skate fielder field': 461,
  'skate fielder leap_miss': 0,
  'skate fielder pickup': 619,
  'skate fielder reach': 12,
  'skate fielder receive': 22,
  'skate fielder set': 28,
  'skate fielder tag': 331,
  'skate fielder throw': 6,
  'skate runner run': 869,
};

function loadPlaywright() {
  for (const t of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(t); } catch (e) {} }
  throw new Error('playwright not found');
}
const CHROME = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
// (the page is opened only when there is something to measure: not for --combine, nor for a run whose
// every chunk is in the checkpoint)
let server = null, browser = null;
async function openPage() {
server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
browser = await loadPlaywright().chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('page error', String(e).slice(0, 300)));
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') return route.continue();
  if (/fonts\./.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  if (u.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  return route.abort();
});
await page.goto(`http://127.0.0.1:${server.address().port}/shut-the-door/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded, null, { timeout: 400000 });
// the clips (fielder.glb) in, so the bodies run as the game shows them; nothing drawn
await page.evaluate(async () => { const st = window.STD_STAGE.current; await st.inplay.motion; st.renderer.render = () => {}; });
return page;
}
const COMBINE = process.argv.includes('--combine') ? process.argv[process.argv.indexOf('--combine') + 1] : null;
const ROWS_OUT = process.argv.includes('--rows-out') ? process.argv[process.argv.indexOf('--rows-out') + 1] : null;

const cases = [];
let idx = 0;
for (const c of inplayCases()) {
  if ((ONLY != null ? idx === ONLY : idx % STRIDE === 0 && Math.floor(idx / STRIDE) % SEL.shard.n === SEL.shard.i) && cases.length < LIMIT) cases.push({ pr: c.pr, hand: c.hand, tag: `#${idx} ${c.pack} ${c.key}/${c.label} st ${c.st}` });
  idx++;
}
const rows = [];
const CHUNK = 50;
const t0 = Date.now();
let page = null, nCases = cases.length, shardOf = SEL.shard;
if (COMBINE) {
  // the shards' plays, one run: each file the same code (its tree), stride and number of shards, every
  // shard there once
  const tree = treeHash();
  const parts = fs.readdirSync(COMBINE).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(COMBINE, f), 'utf8')));
  const n = parts[0] ? parts[0].shard.n : 0, got = new Set(parts.map((q) => q.shard.i));
  for (const q of parts) if (q.tree !== tree || q.stride !== STRIDE || q.shard.n !== n || q.limit !== String(LIMIT) || q.only !== ONLY) throw new Error('--combine: a shard of another run (tree, stride, shards or limit differ)');
  if (!n || got.size !== n || parts.length !== n) throw new Error(`--combine: ${parts.length} files for ${n} shards (${[...got].sort().join(', ')})`);
  // (in the order a single run takes them: by case number, the tag's #N)
  for (const q of parts) rows.push(...q.rows);
  rows.sort((a, b) => +a.tag.slice(1, a.tag.indexOf(' ')) - +b.tag.slice(1, b.tag.indexOf(' ')));
  nCases = parts.reduce((a, q) => a + q.n, 0);
  shardOf = { i: 0, n: 1 };
  console.log(`combined ${n} shards: ${nCases} plays`);
}
const CK = COMBINE ? null : openCheckpoint('check-jolt', { STRIDE, LIMIT: String(LIMIT), ONLY, SHARD: SEL.shard, CHUNK, TRACE });
for (let i = 0; !COMBINE && i < cases.length; i += CHUNK) {
  if (CK.has(i)) { rows.push(...CK.get(i)); continue; }
  page ||= await openPage();
  const got = await page.evaluate(({ part, FPS, BODY_MS, LIMB_MS, PLANT_M, PLANT_N, SKATE_MS, TRACE }) => {
    const st = window.STD_STAGE.current, ip = st.inplay, out = [];
    const facts0 = ip.facts, stub = { after: { t0: 0 }, f: { at: () => ({ x: 0, y: 1.2, z: 2.6 }) }, ball: st.pitch.ball, overlays: false };
    const J = ['pelvis', 'head', 'hand_l', 'hand_r', 'foot_l', 'foot_r'];
    const FT = 0.3048, dt = 1 / FPS;
    for (const c of part) {
      ip.facts = { ...facts0, batter: { ...facts0.batter, bats: c.hand } };
      let run;
      try { run = ip.begin(c.pr, stub, {}); } catch (e) { out.push({ tag: c.tag, err: String(e) }); continue; }
      const plan = run.plan, hist = new Map(), hits = [], trace = [];
      const lastAct = (n, s) => { const a = plan.fielders[n].acts.filter((x) => x.t <= s + 1e-6).pop(); return a ? a.kind : '-'; };
      let sPrev = null;
      try {
        for (let r = 0; r <= run.realDur; r += dt) {
          const s = run.sceneAt(r);
          // (a jump cut skips scene time: the bodies start afresh in the new shot)
          if (sPrev != null && (s - sPrev > dt * 1.5 || s < sPrev)) hist.clear();
          sPrev = s;
          if (s < 0.3) continue;
          ip.update(s, st.camera);
          const bodies = [];
          for (let n = 1; n <= 9; n++) bodies.push(['F' + n, ip.fielders[n], n]);
          for (const rr of plan.runners) if (rr.fig) bodies.push(['R' + rr.from, rr.fig, 0]);
          // (the base umpires: held to no pop and no skate at all, CEILING has no row for them)
          if (ip.umps && plan.umps) for (const k of [1, 2, 3]) bodies.push(['U' + k, ip.umps[k], -k]);
          for (const [id, f, n] of bodies) {
            if (!f.root.visible) { hist.delete(id); continue; }
            f.root.updateMatrixWorld(true);
            const P = {};
            const rp = f.root.position;
            P.root = { x: -rp.x / FT, y: rp.z / FT, z: rp.y / FT };
            for (const j of J) P[j] = f.jointPoint(j);
            const h = hist.get(id) || [];
            if (TRACE) { const [tid, ta, tb] = TRACE.split(':'); if (tid === id && s >= +ta && s <= +tb) trace.push({ id, s: +s.toFixed(3), act: n > 0 ? lastAct(n, s) : 'run', pitch: +(f.pitch || 0).toFixed(2), vis: f.root.visible, sp: f.lastSpec && { gw: f.lastSpec.gloveW, g: f.lastSpec.glove, tw: f.lastSpec.throwW, hw: f.lastSpec.handW, th: f.lastSpec.throw }, yaw: +(f.yaw || 0).toFixed(2), g0: +(f.g0 || 0).toFixed(2), sc: f.scale, P: Object.fromEntries(Object.entries(P).map(([q, v]) => [q, [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]])) }); }
            h.push({ s, P }); if (h.length > PLANT_N) h.shift(); hist.set(id, h);
            if (h.length < 3) continue;
            const [a, b, cc] = h.slice(-3);
            const d1 = b.s - a.s, d2 = cc.s - b.s;
            if (d1 < 1e-5 || d2 < 1e-5) continue;
            const who = id[0] === 'F' ? 'fielder' : id[0] === 'U' ? 'umpire' : 'runner';
            const act = n > 0 ? lastAct(n, s) : n < 0 ? ((plan.umps[-n].acts.filter((x) => x.t <= s + 1e-6).pop() || {}).kind || '-') : 'run';
            for (const k of ['root', ...J]) {
              const rel = k !== 'root' && k !== 'pelvis' && k !== 'head';
              const base = (q) => (rel ? q.pelvis : { x: 0, y: 0, z: 0 });
              const v = (p, q) => ({ x: (p.P[k].x - base(p.P).x) - (q.P[k].x - base(q.P).x), y: (p.P[k].y - base(p.P).y) - (q.P[k].y - base(q.P).y), z: (p.P[k].z - base(p.P).z) - (q.P[k].z - base(q.P).z) });
              const v2 = v(cc, b), sp = Math.hypot(v2.x, v2.y, v2.z) * FT / d2;
              if (sp > (rel ? LIMB_MS : BODY_MS)) hits.push({ what: 'pop', who, act, id, k, s: +s.toFixed(3), ms: +sp.toFixed(1) });
              if (k === 'foot_l' || k === 'foot_r') {
                const other = k === 'foot_l' ? 'foot_r' : 'foot_l';
                const low = cc.P[k].z <= cc.P[other].z + 0.02 / FT;
                const vz = Math.abs(cc.P[k].z - b.P[k].z) * FT / d2;
                if (low && h.length === PLANT_N && h.every((q) => q.P[k].z * FT < PLANT_M) && vz < 0.25) {
                  const sk = Math.hypot(cc.P[k].x - b.P[k].x, cc.P[k].y - b.P[k].y) * FT / d2;
                  if (sk > SKATE_MS) hits.push({ what: 'skate', who, act, id, k, s: +s.toFixed(3), ms: +sk.toFixed(1) });
                }
              }
            }
          }
        }
      } catch (e) { out.push({ tag: c.tag, err: String(e && e.stack || e).slice(0, 400) }); ip.end(st.camera); continue; }
      out.push({ tag: c.tag, hits, trace });
      ip.end(st.camera);
    }
    ip.facts = facts0;
    return out;
  }, { part: cases.slice(i, i + CHUNK), FPS, BODY_MS, LIMB_MS, PLANT_M, PLANT_N, SKATE_MS, TRACE });
  rows.push(...got);
  CK.put(i, got);
  process.stdout.write(`\r${Math.min(i + CHUNK, cases.length)} of ${cases.length} cases`);
}
if (CK) CK.close();
console.log('');
if (ROWS_OUT) fs.writeFileSync(ROWS_OUT, JSON.stringify({ tree: treeHash(), stride: STRIDE, limit: String(LIMIT), only: ONLY, shard: SEL.shard, n: cases.length, rows }));
const errs = rows.filter((r) => r.err);
for (const e of errs.slice(0, 5)) console.log('  threw:', e.tag, e.err);
// plays with each, by what and who and his last act
const by = {};
const worst = [];
for (const r of rows) {
  if (r.err) continue;
  const seen = new Set();
  for (const h of r.hits) {
    const key = `${h.what} ${h.who} ${h.act}`;
    const b = (by[key] ||= { plays: 0, worst: 0 });
    if (!seen.has(key)) { seen.add(key); b.plays++; }
    b.worst = Math.max(b.worst, h.ms);
  }
  if (r.hits.length) worst.push({ tag: r.tag, ...r.hits.reduce((x, y) => (y.ms > x.ms ? y : x)) });
}
// (held: the default 2,925, as the ceilings were measured; a sample of them, --sample or a stride that
// is a multiple of 20, at the same rate; anything else reported)
const HOLD = holding({ stride: STRIDE, heldStride: 20, n: nCases, heldN: Math.ceil(SEL.total / 20), partial: LIMIT !== Infinity || ONLY != null, shard: shardOf });
const held = HOLD.mode !== 'report';
let fails = 0;
const any = (w) => rows.filter((r) => !r.err && r.hits.some((h) => h.what === w)).length;
console.log(`\nbodies on screen at ${FPS} frames a second, ${rows.length - errs.length} plays (every ${STRIDE}${STRIDE === 1 ? 'st' : 'th'} case), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`  plays with a pop: ${any('pop')}, with a skate: ${any('skate')}`);
const keys = new Set([...Object.keys(by), ...(held ? Object.keys(CEILING) : [])]);
for (const key of [...keys].sort((a, b) => (by[b]?.plays ?? 0) - (by[a]?.plays ?? 0))) {
  const b = by[key] || { plays: 0, worst: 0 };
  const cap = held ? HOLD.cap(CEILING[key] ?? 0) : Infinity;
  const over = b.plays > cap;
  if (over) fails += Math.ceil(b.plays - cap);
  console.log(`  ${over ? 'FAIL' : 'ok  '} ${key.padEnd(28)} ${String(b.plays).padStart(6)} plays${cap !== Infinity ? ' (ceiling ' + capStr(cap) + ')' : ''}  worst ${b.worst.toFixed(1)} m/s`);
}
for (const r of rows) for (const q of r.trace || []) console.log('TRACE', JSON.stringify(q));
if (process.env.JOLT_DUMP) for (const r of rows) for (const h of (r.hits || []).filter((x) => !process.env.JOLT_WHAT || `${x.what} ${x.who} ${x.act}` === process.env.JOLT_WHAT)) console.log('HIT', r.tag, JSON.stringify(h));
if (SHOW) for (const w of worst.sort((a, b) => b.ms - a.ms).slice(0, SHOW)) console.log(JSON.stringify(w));
if (process.env.JOLT_CEILING) console.log('\nCEILING = ' + JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, b]) => [k, b.plays]).sort())));
console.log(`\n${rows.length - errs.length} plays, ${fails} over the ceiling (${HOLD.label})`);
if (browser) await browser.close();
if (server) server.close();
process.exit(fails || errs.length ? 1 : 0);
