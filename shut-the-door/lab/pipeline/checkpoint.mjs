/* Checkpoint, resume, sample and shard for the long lab checks (check-jolt, check-camera, check-frame,
 * check-catch, check-inplay, check-contact; check-leak keeps a log only, see below).
 *
 *   --resume          pick up from the last finished chunk of the same run of the same code
 *   --sample N        about N cases, spread evenly over the check's held set (a subset of it)
 *   --stride K        every Kth case (a multiple of the held set's own stride is held, scaled)
 *   --shard I/N       the I-th of N parts (0-based), for parallel CI jobs: the parts together are the run
 *
 * THE CHECKPOINT. Every chunk a check finishes is appended, one JSON line, to
 *   .cache/checks/<check>-<tree>-<args>.jsonl          (at the repo root; .cache/ is gitignored)
 * <tree> is the git tree hash of shut-the-door/ AS IT IS ON DISK (staged, unstaged and untracked files
 * alike, through a throwaway copy of the index), so the checkpoint is keyed to the code under test: any
 * change anywhere in the game, its data or the checks is a new file, and a stale one is never read. The
 * game loads nothing from outside shut-the-door/ (the page's only root paths are the footer's links).
 * <args> is a hash of everything that picks the cases (stride, sample, shard, limit, the chunk size).
 * The first line is a header that repeats both, and is checked again on read. A line cut short by a
 * kill is dropped, so a resumed run redoes at most the chunk that was running.
 *
 * A run without --resume starts its file afresh, but still writes it, so a run killed by a container
 * restart can be resumed by the next one. A chunk is a pure function of its cases: each case is staged
 * from nothing (inplay.js begin, or stage.js setScenario for check-contact), so a chunk measured in a
 * resumed page is the chunk a straight run measures, and the final verdict is the same.
 *
 * HOLDING A SAMPLE. Each check's CEILING and FLOOR were measured on one set of cases, its held set (the
 * check says which: every case, or every 20th for check-jolt). A run of exactly that set is held to them
 * as they are. A run of a subset of it (a stride that is a multiple of the held stride) is held to the
 * same RATE: a ceiling of C plays over the held set's N becomes C * n / N over the sample's n, not
 * rounded, so a sample fails whenever its share of bad plays is over the ceiling's share. A ceiling of 0
 * stays 0, and a floor on a percentile is already a rate, so it is held as it is. Any other run (--limit,
 * --only, a stride that is not a multiple) is reported, not held.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const CACHE = path.join(ROOT, '.cache', 'checks');

const argv = process.argv;
const has = (k) => argv.includes(k);
const val = (k) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };

/* The git tree hash of `dir` (relative to the repo root) with the working tree's changes in it. */
export function treeHash(dir = 'shut-the-door') {
  const git = (args, env) => execFileSync('git', args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const index = path.resolve(ROOT, git(['rev-parse', '--git-path', 'index']));
    const tmp = path.join(os.tmpdir(), `std-check-index-${process.pid}-${Date.now()}`);
    // (a copy of the real index keeps its stat cache, so only changed files are hashed)
    if (fs.existsSync(index)) fs.copyFileSync(index, tmp);
    try {
      const env = { GIT_INDEX_FILE: tmp };
      git(['add', '-A', '--', dir], env);
      const tree = git(['write-tree'], env);
      return git(['rev-parse', `${tree}:${dir}`]);
    } finally { fs.rmSync(tmp, { force: true }); }
  } catch (e) {
    // (not a git checkout: hash the files themselves)
    const h = crypto.createHash('sha1');
    const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'node_modules' && f.name !== '__pycache__') walk(p); }
      else if (f.isFile()) { h.update(path.relative(ROOT, p)); h.update('\0'); h.update(fs.readFileSync(p)); }
    } };
    walk(path.join(ROOT, dir));
    return 'files-' + h.digest('hex');
  }
}

/* The run's cases, from the flags. heldStride is the stride the check's ceilings were measured at;
   defaultStride what a bare run takes. Returns the stride, the shard and how the run is held. */
export function selection({ heldStride = 1, defaultStride = heldStride, total }) {
  const sample = val('--sample') != null ? Math.max(1, +val('--sample')) : null;
  let stride = val('--stride') != null ? Math.max(1, Math.round(+val('--stride'))) : defaultStride;
  if (sample != null) {
    // (a subset of the held set: a multiple of its stride, as near N cases as that allows)
    const heldN = Math.ceil(total / heldStride);
    stride = heldStride * Math.max(1, Math.floor(heldN / sample));
  }
  const sh = val('--shard');
  const shard = sh ? { i: +sh.split('/')[0], n: +sh.split('/')[1] } : { i: 0, n: 1 };
  if (!(shard.n >= 1 && shard.i >= 0 && shard.i < shard.n)) throw new Error('--shard I/N: I from 0 to N-1');
  return { stride, sample, shard, heldStride, total };
}

/* How a run of n cases is held: { mode: 'held' | 'scaled' | 'report', scale, cap(C) }.
   heldN is the size of the held set; partial is true for --limit, --only and the like. */
export function holding({ stride, heldStride, n, heldN, partial = false, shard = { n: 1 } }) {
  let mode = 'report', scale = Infinity;
  if (!partial && shard.n === 1) {
    if (stride === heldStride && n === heldN) { mode = 'held'; scale = 1; }
    else if (stride % heldStride === 0 && n > 0) { mode = 'scaled'; scale = n / heldN; }
  }
  const cap = (C) => (C === Infinity || C == null ? C : mode === 'report' ? Infinity : C * scale);
  const label = mode === 'held' ? 'held to the ceilings as they are'
    : mode === 'scaled' ? `a sample of ${n} of the held ${heldN}: each ceiling scaled to ${(scale * 100).toFixed(2)}% (the same rate)`
    : 'reported, not held';
  return { mode, scale, cap, label };
}
/* A cap for printing: whole numbers as they are, a scaled one to two places. */
export const capStr = (c) => (Number.isInteger(c) ? String(c) : c.toFixed(2));

/* The checkpoint for one run. params: everything that picks the cases. */
export function openCheckpoint(name, params) {
  const resume = has('--resume');
  const tree = treeHash();
  const args = crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex').slice(0, 10);
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${name}-${tree.slice(0, 16)}-${args}.jsonl`);
  const header = { check: name, tree, params };
  const done = new Map();
  if (resume && fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let ok = false;
    try { const h = JSON.parse(lines[0]); ok = h.check === name && h.tree === tree && JSON.stringify(h.params) === JSON.stringify(params); } catch (e) { ok = false; }
    if (ok) for (const ln of lines.slice(1)) { if (!ln) continue; try { const r = JSON.parse(ln); done.set(r.chunk, r.data); } catch (e) { /* cut short by a kill */ } }
  }
  // rewrite the file with what is kept (so a torn last line is gone before we append)
  fs.writeFileSync(file, JSON.stringify(header) + '\n' + [...done].map(([chunk, data]) => JSON.stringify({ chunk, data }) + '\n').join(''));
  const fd = fs.openSync(file, 'a');
  const note = resume ? (done.size ? `resuming: ${done.size} chunks already done` : 'nothing to resume, starting afresh') : 'a fresh run';
  console.log(`checkpoint ${path.relative(ROOT, file)} (${note})`);
  return {
    file, tree, resumed: done.size,
    has: (chunk) => done.has(chunk),
    get: (chunk) => done.get(chunk),
    put(chunk, data) { done.set(chunk, data); fs.writeSync(fd, JSON.stringify({ chunk, data }) + '\n'); fs.fsyncSync(fd); },
    close() { fs.closeSync(fd); },
  };
}

/** The day the lab's game page plays (a page's clock pinned to it, before it loads). The checks that stage
    the ball in play on the game page (check-jolt, check-catch, check-frame, check-camera) use the stage the
    home screen boots, and that is the day's scenario: its hitters and fielders, so the bodies and their
    speeds. Left to the calendar, the same code gave a different count on another day, a row or two over its
    ceiling on main the morning after #825 merged (the day turned at midnight Eastern, Chapman 2016 to
    Buehler 2024). Pinned to the day the ceilings were measured (2026-10-30, Eastern), every run is the same
    run. The clock still runs from there, so nothing that times itself changes. */
export const LAB_DAY = '2026-10-30T21:00:00-04:00';
export function pinDay(page, at = LAB_DAY) {
  return page.addInitScript((at) => {
    const R = Date, T = new R(at).getTime(), t0 = R.now();
    class D extends R {
      constructor(...a) { if (a.length) super(...a); else super(T + (R.now() - t0)); }
      static now() { return T + (R.now() - t0); }
    }
    window.Date = D;
  }, at);
}
