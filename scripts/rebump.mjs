#!/usr/bin/env node
/*
 * REBUMP: THE ?v= PINS AFTER A MERGE OF MAIN.
 *
 * Two branches that change one versioned file both move its pin, usually to the same number. Merged,
 * the pin lines conflict (or, worse, agree, and the merged file ships under a version main already
 * served with other content). This resolves that, and only that:
 *
 *   git merge origin/main            (conflicts or not)
 *   node scripts/rebump.mjs          then read the diff, git add, commit
 *
 *   --main REF     what main is (default origin/main)
 *   --dry-run      say what it would do, write nothing
 *   --self-test    build a throwaway repo, merge, rebump, check the result (no network)
 *
 * WHAT IT DOES, IN ORDER
 *   1. Every conflicted file (git diff --diff-filter=U) is read. A conflict hunk whose two sides are
 *      the same lines but for their ?v= numbers, every line a pin line, is resolved to that line with
 *      each pin at the higher of the two. If ANY hunk anywhere has anything else in it (a line with no
 *      pin, a side with more lines, text that differs past the numbers), nothing is written and it
 *      exits 1: that merge is a person's to resolve. scripts/cachebust.json is the exception: it is a
 *      record, rebuilt in step 3.
 *   2. Every versioned file (a .js or .json some page or module asks for with ?v=N) whose content
 *      differs from main's record of it (main's scripts/cachebust.json; a file main's record lacks is
 *      compared with main's own copy) gets one version in every page and module that asks for it:
 *      one past the higher of main's version and the branch's (HEAD's), or the version already there
 *      if that is higher. A module whose pins moved now differs from main too, so the next round bumps
 *      it in its own importers: inplay.js in stage.js, then stage.js in boot.js, then boot.js in
 *      index.html, and the lab's scene.js and lab/index.html the same way (modulepreload links too).
 *      It repeats until nothing moves.
 *   3. node scripts/check-cachebust.mjs --update, then the check itself.
 *
 * It only ever rewrites the number in a pin (`name.js?v=N` inside quotes); no other character of any
 * file changes. Run it once per merge, before the merge commit: the branch's version is read off HEAD.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

/* a pin: a quoted local path to a .js, .mjs or .json with ?v=N on it */
const PIN = /(["'])([A-Za-z0-9_./-]+\.(?:js|mjs|json))\?v=(\d+)\1/g;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', '.cache', 'scripts']);

function git(root, args, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 30, ...opts });
}

/* Many files at one ref in one git process: { path: content | null } */
function showMany(root, ref, rels) {
  const out = {};
  if (!rels.length) return out;
  const buf = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: rels.map((r) => `${ref}:${r}`).join('\n') + '\n', maxBuffer: 1 << 30 });
  let at = 0;
  for (const rel of rels) {
    const nl = buf.indexOf(10, at);
    const head = buf.subarray(at, nl).toString('utf8');
    at = nl + 1;
    if (/ missing$/.test(head)) { out[rel] = null; continue; }
    const size = +head.split(' ')[2];
    out[rel] = buf.subarray(at, at + size).toString('utf8');
    at += size + 1;
  }
  return out;
}

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

/* The files that can hold a pin: pages and modules, not the scripts that describe pins */
function importers(root, dir = root, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // (the root's scripts/ holds the checkers, whose comments quote pins; any other scripts/ is a game's)
    if (e.isDirectory()) { const skip = e.name === 'scripts' ? dir === root : SKIP_DIRS.has(e.name); if (!skip) importers(root, path.join(dir, e.name), out); continue; }
    if (!e.isFile() || e.name.startsWith('__') || !/\.(html|js|mjs)$/.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (fs.statSync(full).size > 4 << 20) continue;
    out.push(path.relative(root, full));
  }
  return out;
}

/* the repo path a pin in `from` points at, or null when it is not a file here */
function target(root, from, p) {
  const rel = p.startsWith('/') ? path.normalize(p.slice(1)) : path.normalize(path.join(path.dirname(from), p));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).isFile() ? rel : null;
}

/* every pin in a text: [{ at, file, v }] */
function pinsIn(root, from, text) {
  const out = [];
  for (const m of text.matchAll(PIN)) { const file = target(root, from, m[2]); if (file) out.push({ file, v: +m[3], path: m[2] }); }
  return out;
}

/* ---- 1. the conflicts -------------------------------------------------------------------- */
const norm = (line) => line.replace(/\?v=\d+/g, '?v=#');
function resolveText(text, file) {
  const lines = text.split('\n'), out = [], bad = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('<<<<<<< ')) { out.push(lines[i]); continue; }
    const start = i + 1, ours = [], theirs = [];
    let side = ours;
    for (i++; i < lines.length && !lines[i].startsWith('>>>>>>> '); i++) {
      if (lines[i].startsWith('||||||| ')) { side = null; continue; }
      if (lines[i] === '=======') { side = theirs; continue; }
      if (side) side.push(lines[i]);
    }
    if (i >= lines.length) { bad.push(`${file}:${start}: a conflict hunk with no end`); break; }
    const pinOnly = ours.length === theirs.length && ours.length > 0 &&
      ours.every((l, k) => /\?v=\d+/.test(l) && norm(l) === norm(theirs[k]));
    if (!pinOnly) { bad.push(`${file}:${start}: a conflict with more than ?v= numbers in it (${ours.length} lines against ${theirs.length})`); continue; }
    ours.forEach((l, k) => {
      const tv = [...theirs[k].matchAll(/\?v=(\d+)/g)].map((m) => +m[1]);
      let j = 0;
      out.push(l.replace(/\?v=(\d+)/g, (_, v) => `?v=${Math.max(+v, tv[j++])}`));
    });
  }
  return { text: out.join('\n'), bad };
}

export function rebump(root, { main = 'origin/main', dry = false, log = console.log } = {}) {
  const conflicted = git(root, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  const RECORD = 'scripts/cachebust.json';
  const resolved = {}, bad = [];
  for (const f of conflicted) {
    if (f === RECORD) continue;
    const full = path.join(root, f);
    if (!fs.existsSync(full)) { bad.push(`${f}: conflicted and not on disk (a delete against an edit)`); continue; }
    const text = fs.readFileSync(full, 'utf8');
    // (no markers left: resolved already, by hand or by an earlier run, and only waiting on git add)
    if (!/^<<<<<<< /m.test(text)) continue;
    const r = resolveText(text, f);
    bad.push(...r.bad);
    resolved[f] = r.text;
  }
  if (bad.length) {
    log('rebump: refusing. These conflicts are not only ?v= pins, so they are yours to resolve first:');
    for (const b of bad) log('  ' + b);
    log('Nothing was written.');
    return { ok: false, refused: bad };
  }
  // (from here on the tree is read as it will be: the resolved texts over what is on disk)
  const files = {};
  const read = (rel) => (rel in files ? files[rel] : (files[rel] = rel in resolved ? resolved[rel] : fs.readFileSync(path.join(root, rel), 'utf8')));
  for (const f of Object.keys(resolved)) { read(f); log(`resolved the ?v= conflicts in ${f}`); }

  /* ---- 2. the versions --------------------------------------------------------------------- */
  const mainRec = JSON.parse(showMany(root, main, [RECORD])[RECORD] || '{}');
  const recSha = {};   // file -> main's recorded sha
  for (const [page, scripts] of Object.entries(mainRec)) for (const [name, r] of Object.entries(scripts)) {
    const t = target(root, page, name);
    if (t) recSha[t] = r.sha;
  }
  const imps = importers(root).filter((f) => /\?v=\d/.test(read(f)));
  const pinsAt = (ref) => {
    const texts = showMany(root, ref, imps), at = {};
    for (const f of imps) if (texts[f]) for (const p of pinsIn(root, f, texts[f])) at[p.file] = Math.max(at[p.file] || 0, p.v);
    return at;
  };
  const mainV = pinsAt(main), oursV = pinsAt('HEAD');
  const pinned = new Set();
  for (const f of imps) for (const p of pinsIn(root, f, read(f))) pinned.add(p.file);
  const mainCopy = showMany(root, main, [...pinned].filter((f) => !(f in recSha)));
  const differs = (f) => {
    const now = sha(read(f));
    if (f in recSha) return now !== recSha[f];
    return mainCopy[f] != null && mainCopy[f] !== read(f);
  };
  const bumped = {};
  for (let round = 0; round < 50; round++) {
    let moved = 0;
    for (const f of [...pinned].sort()) {
      if (!differs(f)) continue;
      let cur = 0;
      for (const g of imps) for (const p of pinsIn(root, g, read(g))) if (p.file === f) cur = Math.max(cur, p.v);
      const want = Math.max(Math.max(mainV[f] || 0, oursV[f] || 0) + 1, cur);
      for (const g of imps) {
        const t0 = read(g);
        const t1 = t0.replace(PIN, (all, q, p, v) => (target(root, g, p) === f && +v !== want ? `${q}${p}?v=${want}${q}` : all));
        if (t1 !== t0) { files[g] = t1; moved++; (bumped[f] ||= { v: want, in: new Set() }).in.add(g); }
      }
    }
    if (!moved) break;
  }
  for (const [f, b] of Object.entries(bumped)) log(`${f} -> v=${b.v} (main ${mainV[f] || '-'}, the branch ${oursV[f] || '-'}) in ${[...b.in].sort().join(', ')}`);
  if (!Object.keys(bumped).length) log('no pin needed to move');
  const changed = Object.keys(files).filter((f) => {
    const disk = fs.readFileSync(path.join(root, f), 'utf8');
    return disk !== files[f];
  });
  if (dry) { log(`dry run: would write ${changed.length} files: ${changed.join(', ')}`); return { ok: true, changed, bumped }; }
  for (const f of changed) fs.writeFileSync(path.join(root, f), files[f]);

  /* ---- 3. the record ----------------------------------------------------------------------- */
  const cb = path.join(root, 'scripts', 'check-cachebust.mjs');
  execFileSync(process.execPath, [cb, '--update'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, [cb], { cwd: root, stdio: 'inherit' });
  if (conflicted.length) log(`now read the diff, then: git add ${conflicted.join(' ')}`);
  return { ok: true, changed, bumped };
}

/* ---- the self-test ------------------------------------------------------------------------- */
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rebump-'));
  const g = (...a) => git(tmp, a);
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
  const r = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');
  const sub = (rel, a, b) => { const t = r(rel); if (!t.includes(a)) throw new Error(`${rel}: no "${a}"`); w(rel, t.replace(a, b)); };
  const record = () => execFileSync(process.execPath, ['scripts/check-cachebust.mjs', '--update'], { cwd: tmp, stdio: 'pipe' });
  let fails = 0;
  const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
  try {
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
    fs.mkdirSync(path.join(tmp, 'scripts'));
    fs.copyFileSync(path.join(path.dirname(SELF), 'check-cachebust.mjs'), path.join(tmp, 'scripts', 'check-cachebust.mjs'));
    const filler = Array.from({ length: 8 }, (_, k) => `export const f${k} = ${k};`).join('\n');
    w('game/index.html', '<!doctype html>\n<title>t</title>\n<script src="ui.js?v=1"></script>\n<script type="module" src="3d/boot.js?v=1"></script>\n');
    w('game/ui.js', 'window.UI = 1;\nwindow.UI_COPY = "one";\n');
    w('game/3d/boot.js', "export const load = () => import('./stage.js?v=1');\n");
    w('game/3d/stage.js', "import { a } from './inplay.js?v=1';\nexport const s = a;\n");
    w('game/3d/inplay.js', `export const a = 1;\n${filler}\n`);
    w('game/lab/index.html', '<!doctype html>\n<link rel="modulepreload" href="./scene.js?v=1">\n<script type="module">\nimport { s } from \'./scene.js?v=1\';\n</script>\n');
    w('game/lab/scene.js', "import { a } from '../3d/inplay.js?v=1';\nexport const s = a;\n");
    record();
    g('add', '-A'); g('commit', '-qm', 'base');
    g('branch', 'feature');
    // main: inplay.js changed at its end, its pins moved to 2 up the chain
    sub('game/3d/inplay.js', 'export const f7 = 7;', 'export const f7 = 7;\nexport const fromMain = 1;');
    sub('game/3d/stage.js', 'inplay.js?v=1', 'inplay.js?v=2');
    sub('game/lab/scene.js', 'inplay.js?v=1', 'inplay.js?v=2');
    sub('game/3d/boot.js', 'stage.js?v=1', 'stage.js?v=2');
    sub('game/index.html', 'boot.js?v=1', 'boot.js?v=2');
    sub('game/lab/index.html', 'href="./scene.js?v=1"', 'href="./scene.js?v=2"');
    sub('game/lab/index.html', "'./scene.js?v=1'", "'./scene.js?v=2'");
    record(); g('commit', '-qam', 'main moves inplay');
    // the branch: inplay.js changed at its start (twice, so its pin is at 3), ui.js changed too
    g('checkout', '-q', 'feature');
    sub('game/3d/inplay.js', 'export const a = 1;', 'export const a = 2;');
    sub('game/3d/stage.js', 'inplay.js?v=1', 'inplay.js?v=3');
    sub('game/lab/scene.js', 'inplay.js?v=1', 'inplay.js?v=3');
    sub('game/3d/boot.js', 'stage.js?v=1', 'stage.js?v=2');
    sub('game/index.html', 'boot.js?v=1', 'boot.js?v=2');
    sub('game/lab/index.html', 'href="./scene.js?v=1"', 'href="./scene.js?v=2"');
    sub('game/lab/index.html', "'./scene.js?v=1'", "'./scene.js?v=2'");
    sub('game/ui.js', 'window.UI = 1;', 'window.UI = 2;');
    sub('game/index.html', 'ui.js?v=1', 'ui.js?v=2');
    record(); g('commit', '-qam', 'the branch moves inplay and ui');
    try { g('merge', '-q', '--no-edit', 'main'); } catch (e) { /* conflicts expected */ }
    const unmerged = g('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    ok(unmerged.includes('game/3d/stage.js') && unmerged.includes('scripts/cachebust.json'), `the merge conflicts on the pins and the record (${unmerged.join(', ')})`);
    const res = rebump(tmp, { main: 'main', log: () => {} });
    ok(res.ok, 'rebump ran');
    ok(!/^(<<<<<<<|=======|>>>>>>>)/m.test(['game/3d/stage.js', 'game/lab/scene.js', 'scripts/cachebust.json'].map(r).join('\n')), 'no conflict markers are left');
    ok(r('game/3d/inplay.js').includes('export const a = 2;') && r('game/3d/inplay.js').includes('fromMain'), 'the merged inplay.js has both changes');
    ok(r('game/3d/stage.js') === "import { a } from './inplay.js?v=4';\nexport const s = a;\n", 'inplay.js is one past max(main 2, the branch 3) in stage.js: v=4');
    ok(r('game/lab/scene.js').includes("'../3d/inplay.js?v=4'"), 'and in the lab\'s scene.js');
    ok(r('game/3d/boot.js').includes("'./stage.js?v=3'"), 'stage.js moved in boot.js: v=3');
    ok(r('game/index.html').includes('3d/boot.js?v=3'), 'boot.js moved in index.html: v=3');
    ok(r('game/lab/index.html').includes('href="./scene.js?v=3"') && r('game/lab/index.html').includes("'./scene.js?v=3'"), 'scene.js moved in the lab page, the modulepreload with it: v=3');
    ok(r('game/index.html').includes('ui.js?v=3'), 'ui.js (changed on the branch only) is one past max(main 1, the branch 2): v=3');
    let clean = true;
    try { execFileSync(process.execPath, ['scripts/check-cachebust.mjs'], { cwd: tmp, stdio: 'pipe' }); } catch (e) { clean = false; }
    ok(clean, 'check-cachebust passes on the result');
    const diff = g('diff', 'HEAD', '--', 'game').split('\n').filter((l) => /^[-+][^-+]/.test(l));
    ok(diff.every((l) => /\?v=\d/.test(l) || /fromMain|export const f7/.test(l)), 'against the branch, every changed line is a pin or main\'s own change');
    const again = rebump(tmp, { main: 'main', dry: true, log: () => {} });
    ok(again.ok && again.changed.length === 0, 'a second run in the same merge changes nothing');
    g('add', '-A'); g('commit', '-qm', 'merge');

    // a conflict that is not only pins: refused, nothing written
    g('checkout', '-q', '-b', 'other', 'HEAD~1');
    sub('game/ui.js', 'window.UI_COPY = "one";', 'window.UI_COPY = "branch";');
    sub('game/index.html', 'ui.js?v=2', 'ui.js?v=5');
    record(); g('commit', '-qam', 'other copy');
    g('checkout', '-q', 'main');
    sub('game/ui.js', 'window.UI_COPY = "one";', 'window.UI_COPY = "main";');
    sub('game/index.html', 'ui.js?v=1', 'ui.js?v=4');
    record(); g('commit', '-qam', 'main copy');
    g('checkout', '-q', 'other');
    try { g('merge', '-q', '--no-edit', 'main'); } catch (e) { /* conflicts expected */ }
    const before = ['game/ui.js', 'game/index.html', 'game/3d/stage.js'].map(r).join('\0');
    const ref = rebump(tmp, { main: 'main', log: () => {} });
    ok(!ref.ok && ref.refused.some((b) => b.startsWith('game/ui.js')), 'a hunk with a non-pin line is refused (' + (ref.refused || []).join('; ') + ')');
    ok(['game/ui.js', 'game/index.html', 'game/3d/stage.js'].map(r).join('\0') === before, 'and nothing was written');
    let cli = 0;
    try { execFileSync(process.execPath, [SELF, '--main', 'main'], { cwd: tmp, stdio: 'pipe' }); } catch (e) { cli = e.status; }
    ok(cli === 1, 'the command line exits 1 on a refusal');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fails ? `\n${fails} failed` : '\nrebump self-test: all ok');
  process.exit(fails ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  if (flag('--self-test')) selfTest();
  else {
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const res = rebump(root, { main: val('--main', 'origin/main'), dry: flag('--dry-run') });
    process.exit(res.ok ? 0 : 1);
  }
}
