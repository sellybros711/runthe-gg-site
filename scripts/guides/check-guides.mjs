#!/usr/bin/env node
/* Holds the guides at runthe.gg/guides/ to their sources and to the games.
 *
 * A guide is a static page, so it cannot read a number from the engine the way an in-game
 * rules sheet does. If Putt Putt moved its lives from 9 to 12, the game would play 12 and the
 * guide would go on promising 9, and nothing would fail. That is the class check-numbers.mjs
 * guards for the football, college and baseball pages. This is the same idea for the guides,
 * done with explicit pins rather than a regex over copy:
 *
 *   guides/numbers.json lists, per guide, each number it states ("say", text the guide must
 *   contain), the file it comes from, a regex whose first group reads the value out of that
 *   file, and the value the guide was written against ("want").
 *
 * It fails when:
 *   - a pinned value in the game no longer equals "want" (the game changed: fix the guide,
 *     then the pin, in one commit);
 *   - a regex no longer matches (the code moved: re-point the pin, never delete it);
 *   - a guide no longer says what its pin says (reworded: update the pin with it);
 *   - a guide has no pins at all, or a pin names a guide that does not exist;
 *   - a page is not what its source builds (scripts/guides/build-guides.mjs --check);
 *   - a guide is missing from the sitemap, or the sitemap names one that does not exist;
 *   - anything other than the home page links to /guides/ (the owner's rule, 2026-10-24:
 *     the guides are reached from the home page footer only, never from a game).
 *
 *   node scripts/guides/check-guides.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build, sources } from './build-guides.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const problems = [];
const fail = (m) => problems.push(m);

const guides = sources();
const slugs = new Set(guides.map((g) => g.meta.slug));
const pins = JSON.parse(read('guides/numbers.json'));

// 1. the pages are what their sources build
const files = build();
for (const [rel, html] of Object.entries(files)) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`${rel} is missing. Run node scripts/guides/build-guides.mjs`);
  else if (fs.readFileSync(abs, 'utf8') !== html) fail(`${rel} is stale. Run node scripts/guides/build-guides.mjs`);
}
for (const f of fs.readdirSync(path.join(ROOT, 'guides')).filter((f) => f.endsWith('.html'))) {
  if (!files[`guides/${f}`]) fail(`guides/${f} has no source in guides/src`);
}

// 2. every number is pinned and every pin holds
let held = 0;
const factCache = {};
const requireCjs = createRequire(import.meta.url);
function factsOf(name) {
  if (!factCache[name]) factCache[name] = requireCjs(`./facts/${name}.cjs`)();
  return factCache[name];
}
for (const { meta, body } of guides) {
  const list = pins[meta.slug];
  if (!Array.isArray(list) || !list.length) { fail(`${meta.slug}: no pins in guides/numbers.json`); continue; }
  for (const p of list) {
    if (!body.includes(p.say)) fail(`${meta.slug}: the guide no longer says "${p.say}". Update its pin with the wording`);
    /* A FACT PIN is a figure the guide computes from a game's data rather than reads off one
       line of code (a share of boards, an average over a decade). scripts/guides/facts/<name>.cjs
       recomputes it with the game's own engine, and "key" is a dotted path into what it returns. */
    if (p.fact) {
      const got = String(p.key).split('.').reduce((o, k) => (o == null ? o : o[k]), factsOf(p.fact));
      if (got == null) { fail(`${meta.slug}: fact ${p.fact} has no ${p.key}`); continue; }
      if (got !== p.want) { fail(`${meta.slug}: ${p.fact} ${p.key} is now ${got}, the guide was written for ${p.want} ("${p.say}"). Fix the guide, then the pin`); continue; }
      held++;
      continue;
    }
    let src;
    try { src = read(p.file); } catch { fail(`${meta.slug}: pin file ${p.file} does not exist`); continue; }
    const m = src.match(new RegExp(p.re));
    if (!m) { fail(`${meta.slug}: /${p.re}/ no longer matches ${p.file}. Re-point the pin`); continue; }
    if (Number(m[1]) !== p.want) {
      fail(`${meta.slug}: ${p.file} now gives ${m[1]}, the guide was written for ${p.want} ("${p.say}"). Fix the guide, then the pin`);
      continue;
    }
    held++;
  }
}
for (const k of Object.keys(pins)) {
  if (!k.startsWith('_') && !slugs.has(k)) fail(`guides/numbers.json pins "${k}", which is not a guide`);
}

// 3. the sitemap lists the hub and every guide, and nothing else under /guides/
const sitemap = read('sitemap.xml');
const want = ['https://runthe.gg/guides/', ...[...slugs].map((s) => `https://runthe.gg/guides/${s}.html`)];
for (const u of want) if (!sitemap.includes(`<loc>${u}</loc>`)) fail(`sitemap.xml does not list ${u}`);
for (const [, u] of sitemap.matchAll(/<loc>(https:\/\/runthe\.gg\/guides\/[^<]*)<\/loc>/g)) {
  if (!want.includes(u)) fail(`sitemap.xml lists ${u}, which is not a guide`);
}

// 4. reached from the home page footer only
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'guides', 'scripts', 'supabase'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f);
  if (rel === 'index.html') continue;
  if (/href=["'][^"']*\/guides\//.test(fs.readFileSync(f, 'utf8'))) {
    fail(`${rel} links to /guides/. The guides are reached from the home page footer only`);
  }
}

if (problems.length) {
  console.error(`guides: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`guides ok: ${guides.length} guide(s), ${held} numbers held to the games, the sitemap and the footer rule`);
