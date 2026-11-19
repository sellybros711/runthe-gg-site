#!/usr/bin/env node
/* Sets every <lastmod> in sitemap.xml to the date its page last changed in git.
 *
 * A crawler and an AdSense reviewer both read lastmod as "is this site kept up". Ours had
 * drifted: most entries still said July while the pages changed almost daily. Stamping
 * today's date on every entry would be just as wrong the other way, so the date is the
 * last commit that touched the page's own file. Rerun it before asking AdSense for a review.
 *
 *   node scripts/sitemap-lastmod.mjs          rewrite sitemap.xml
 *   node scripts/sitemap-lastmod.mjs --check  exit 1 if any lastmod is behind its file
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'sitemap.xml');
const check = process.argv.includes('--check');
let xml = fs.readFileSync(FILE, 'utf8');
const behind = [];
let changed = 0;

xml = xml.replace(/<url>([\s\S]*?)<\/url>/g, (whole, inner) => {
  const loc = (inner.match(/<loc>https:\/\/runthe\.gg\/([^<]*)<\/loc>/) || [])[1];
  if (loc == null) return whole;
  const rel = loc === '' || loc.endsWith('/') ? loc + 'index.html' : loc;
  if (!fs.existsSync(path.join(ROOT, rel))) return whole;
  const day = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!day) return whole;
  const now = (inner.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
  if (now === day) return whole;
  if (now && now > day) return whole;          // never move a date backwards
  behind.push(`${rel}: ${now || 'none'} -> ${day}`);
  changed++;
  return now ? whole.replace(`<lastmod>${now}</lastmod>`, `<lastmod>${day}</lastmod>`)
             : whole.replace(/(<loc>[^<]*<\/loc>)/, `$1<lastmod>${day}</lastmod>`);
});

if (check) {
  if (behind.length) { console.error('sitemap lastmod behind its page:\n  ' + behind.join('\n  ')); process.exit(1); }
  console.log('sitemap lastmod: every entry matches its page');
} else {
  fs.writeFileSync(FILE, xml);
  console.log(`sitemap lastmod: ${changed} updated`);
  for (const b of behind) console.log('  ' + b);
}
