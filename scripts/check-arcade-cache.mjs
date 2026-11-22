/* check-arcade-cache.mjs: the arcade's scripts can be cached for a year only
 * because no arcade script URL ever changes its bytes.
 *
 *   node scripts/check-arcade-cache.mjs
 *
 * _headers holds every .js under /arcade/ for a year (immutable). That is safe
 * while two things stay true, and this fails the build when either breaks:
 *
 *   1. Every <script src> on any page that loads an arcade script carries a
 *      ?v= version. A bare /arcade/x.js would be kept for a year and an edit
 *      to it would never reach a phone. (check-cachebust then makes sure a
 *      changed script gets a new version.)
 *   2. The arcade block in _headers keeps its shape: pages revalidated, scripts
 *      a year, and NO "/arcade/*" catch-all. Cloudflare joins a header two
 *      matching rules set, so a catch-all no-cache would quietly turn every
 *      cache rule under it back into no-cache.
 *
 * Offline, no network.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', 'functions']);
const fails = [];

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const f = path.join(dir, name);
    const st = statSync(f);
    if (st.isDirectory()) pages(f, out);
    else if (name.endsWith('.html')) out.push(f);
  }
  return out;
}

// 1. versioned tags
let tags = 0;
for (const f of pages(ROOT)) {
  const rel = '/' + path.relative(ROOT, f).split(path.sep).join('/');
  const html = readFileSync(f, 'utf8');
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (/^(https?:)?\/\//i.test(src) || src.includes('{{')) continue;
    const url = new URL(src, 'https://x' + rel);
    if (!url.pathname.startsWith('/arcade/') || !url.pathname.endsWith('.js')) continue;
    tags++;
    if (!/^\?v=\d+$/.test(url.search)) fails.push(rel + ' loads ' + src + ' with no ?v= version');
  }
}

// 2. the _headers block
const H = readFileSync(path.join(ROOT, '_headers'), 'utf8');
const rules = {};
let cur = null;
for (const line of H.split('\n')) {
  if (/^\//.test(line)) { cur = line.trim(); rules[cur] = rules[cur] || []; }
  else if (cur && /^\s+\S/.test(line) && !/^\s*#/.test(line)) rules[cur].push(line.trim());
  else if (!line.trim()) cur = null;
}
const cc = (p) => (rules[p] || []).filter((l) => /^Cache-Control:/i.test(l)).join(' | ');
if ('/arcade/*' in rules) fails.push('_headers has an "/arcade/*" rule: it joins onto every arcade cache rule and turns it back into no-cache');
if (!/max-age=31536000/.test(cc('/arcade/*.js')) || !/immutable/.test(cc('/arcade/*.js'))) fails.push('_headers: /arcade/*.js should be "public, max-age=31536000, immutable", found: ' + (cc('/arcade/*.js') || 'none'));
for (const p of ['/arcade/', '/arcade/*/', '/arcade/*.css']) if (!/no-cache/.test(cc(p))) fails.push('_headers: ' + p + ' should be no-cache, found: ' + (cc(p) || 'none'));

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log('arcade cache ok: ' + tags + ' arcade script tags, all versioned; _headers holds scripts a year and revalidates pages');
