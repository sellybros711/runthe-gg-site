/* Run The Course is served and unlisted until the owner puts it live.
 *
 *   node course/check-posture.mjs
 *
 * Anyone handed runthe.gg/course can play it (the owner's call, 2026-11-25:
 * no tester gate, built at /course, kept off the home page until launch).
 * Nothing on the site points at it and nothing invites a crawler in. This
 * holds the facts that keep it that way: noindexed, no ad tag, not in the
 * sitemap, linked from no page and named in no script outside its own
 * folders, not in games.json and not on the newsletter's list.
 *
 * This is 4th and What's and Shut The Door's posture before their launches.
 *
 * LAUNCHING IT IS A DELIBERATE EDIT TO THIS FILE, in the same commit as the
 * launch: flip INDEXED and LINKED, add the home page tile and the sitemap
 * entry, take the noindex off, and put it on scripts/newsletter/games.json.
 * It runs on every PR with no path filter: a link added anywhere on the site
 * is what would launch it, and a filter on course/** would never see it.
 *
 * It cannot look for the bare word "course": golf uses it everywhere. It
 * looks for the game's name, a link to /course, and its code folders. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* THE TWO DECLARATIONS. Both false until the owner launches it. */
const INDEXED = false;
const LINKED = false;

const problems = [];
if (LINKED && !INDEXED) problems.push('LINKED without INDEXED: a page the site sends visitors to while telling crawlers to stay away.');

const page = read('course/index.html');
const noindex = /name=["']robots["'][^>]*noindex/i.test(page);
if (!INDEXED && !noindex) problems.push('course/index.html is not noindexed.');
if (INDEXED && noindex) problems.push('course/index.html is noindexed, but INDEXED is true.');
if (!INDEXED && page.includes('pagead2.googlesyndication.com')) problems.push('course/index.html carries the AdSense tag before launch.');

const LINK = /(["'(=\s>])\/course(\/|["'#?)\s<]|$)|runthe\.gg\/course\b/m;
const inSitemap = LINK.test(read('sitemap.xml'));
if (!INDEXED && inSitemap) problems.push('sitemap.xml lists /course before launch.');
if (INDEXED && !inSitemap) problems.push('INDEXED is true and sitemap.xml does not list /course.');

/* Named or linked from nowhere: every page, script and data file outside
   the game's own folders. Skipped on purpose: the game, its server code, CI
   workflows, the migrations, the agent's own definition, and the shared
   checks that list its files (dashes, copy, the cache record, the save ledger). */
const NAMES = [/Run The Course/i, LINK, /functions\/_course|api\/course/];
const SKIP_DIRS = new Set(['.git', 'node_modules', '.github', 'supabase', 'docs']);
const SKIP_PATHS = new Set(['course', 'functions/_course', 'functions/api/course']);
const SKIP_FILES = new Set(['.claude/agents/run-the-course.md', '.claude/skills/kb/SKILL.md', 'scripts/check-dashes.mjs', 'scripts/check-copy.mjs',
  'scripts/cachebust.json', 'scripts/save-writes.json']);
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue;
    const p = dir === '.' ? e.name : dir + '/' + e.name;
    if (SKIP_DIRS.has(e.name) || SKIP_PATHS.has(p)) continue;
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(html|js|mjs|json|xml|txt|md|webmanifest)$/.test(e.name) && !SKIP_FILES.has(p) && fs.statSync(path.join(ROOT, p)).size < 4e6) out.push(p);
  }
  return out;
}
const linkers = walk('.').filter((p) => { const s = read(p); return NAMES.some(n => n.test(s)); });
if (!LINKED && linkers.length) problems.push('named or linked before launch in: ' + linkers.join(', ') + '.');
if (LINKED && !linkers.includes('index.html')) problems.push('LINKED is true and the home page does not link /course.');

/* The listings a launch would touch, named one by one. */
for (const f of ['index.html', 'games.json', 'arcade/index.html', 'arcade/nav.js', 'robots.txt', 'scripts/newsletter/games.json', 'manifest.json']) {
  if (!exists(f)) continue;
  const s = read(f);
  if (!LINKED && (LINK.test(s) || /Run The Course/i.test(s))) problems.push(f + ' lists Run The Course before launch.');
}

/* The server code is never served as files, and the route answers no page. */
if (!/^\/functions\/\*\s+\/404\.html\s+404\s*$/m.test(read('_redirects'))) problems.push('_redirects no longer 404s /functions/*');
const fn = read('functions/api/course/[[path]].js');
if (!/verifyUser\(/.test(fn)) problems.push('the save route must resolve the account from the session, never from the body');
if (/text\/html/.test(fn)) problems.push('the save route serves a page; the game is the static folder, the route is saves and events only');
const sql = fs.readdirSync(path.join(ROOT, 'supabase')).filter(f => /course/.test(f) && f.endsWith('.sql')).map(f => read('supabase/' + f)).join('\n');
if (/grant[^;]*\bto\s+(anon|authenticated|public)\b/i.test(sql)) problems.push('a course migration grants something to a browser role; only the service role may write a course');

if (problems.length) {
  console.error('Run The Course posture: ' + problems.length + ' problem(s)\n');
  for (const p of problems) console.error('  ' + p);
  console.error('\nIf one of these is now intentional, change INDEXED or LINKED in this file in the same commit.');
  process.exit(1);
}
console.log('Run The Course posture: ' + (INDEXED ? 'indexed' : 'noindexed, no ad tag, not in the sitemap') + ', ' + (LINKED ? 'linked' : 'linked from nowhere, not on the newsletter list') + '.');
