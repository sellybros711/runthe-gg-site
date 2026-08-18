#!/usr/bin/env node
/* Every indexable page must be able to carry an ad and must reach the policy pages.
 *
 * Two AdSense rejections were traced to pages that quietly failed one of these. The
 * whole Arcade, eleven pages, shipped with the Consent Mode defaults and the GA tag
 * but no adsbygoogle.js, so a third of the indexable site could not serve an ad; the
 * ten game pages also had no route to Privacy or Terms. Nothing failed loudly. The
 * pages looked finished, and the gap only turned up under a deliberate audit.
 *
 * So it is a check rather than a habit. A new game page that forgets the ad tag, or a
 * refactor that drops a footer link, fails here instead of surviving to the next review.
 *
 * WORD COUNT is measured with <script> and <style> stripped, which is the crawler's
 * view, NOT the reader's. A single-page game keeps every screen it can ever show in
 * the DOM, most of them display:none, and all of that text counts here. Treat the
 * number as "is there markup at all", never as "does this page read as substantial".
 * The only honest answer to the second question is a rendered browser.
 *
 *   node scripts/check-adsense.mjs
 *
 * Exits non-zero and names every offender.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts', 'supabase', 'functions']);

const PUB = 'pagead2.googlesyndication.com';
const MIN_WORDS = 250;

/* Pages that are indexable but legitimately short. A contact page is a contact page;
 * padding it to clear an arbitrary floor would be the exact "written for the crawler"
 * move the floor exists to catch. Add to this list only with a reason. */
const SHORT_OK = new Set([
  'contact.html',            // a form and an address
  'soccer/contact.html',     // same, on the RunThePitch side
  'soccer/about.html',       // short by design, the long one is /about.html
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const problems = [];
let checked = 0;

for (const file of walk(ROOT).sort()) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');

  // noindexed pages are exempt: redirect stubs, OG templates, unlisted prototypes
  if (/name=["']robots["'][^>]*noindex/i.test(src)) continue;
  checked++;

  const fail = (msg) => problems.push(`${rel}: ${msg}`);

  if (!src.includes(PUB)) fail('no AdSense publisher tag');
  if (!/rel=["']canonical["']/i.test(src)) fail('no canonical');
  if (!/<title>\s*\S/i.test(src)) fail('no title');
  if (!/name=["']description["'][^>]*content=["']\s*\S/i.test(src)) fail('no meta description');

  /* The root pages link relatively (href="privacy.html"), the game pages absolutely
   * (href="/privacy.html"). Both resolve, so match the href itself rather than a
   * leading slash. A page that is itself the target does not need to link to itself. */
  for (const page of ['privacy', 'terms']) {
    if (rel.endsWith(`${page}.html`)) continue;
    const linked = new RegExp(`href=["'][^"']*\\b${page}\\.html`, 'i').test(src);
    if (!linked) fail(`no link to ${page}.html`);
  }

  if (!SHORT_OK.has(rel)) {
    const words = src
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .split(/\s+/)
      .filter((w) => /[a-z]/i.test(w)).length;
    if (words < MIN_WORDS) fail(`only ${words} words of markup text (floor ${MIN_WORDS})`);
  }
}

// Anything listed in the sitemap must actually exist and must not be noindexed.
const sitemap = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemap)) {
  const urls = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const url of urls) {
    let rel = url.replace(/^https?:\/\/runthe\.gg\//, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const target = path.join(ROOT, rel);
    if (!fs.existsSync(target)) {
      problems.push(`sitemap.xml: ${url} does not resolve to a file`);
    } else if (/name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(target, 'utf8'))) {
      problems.push(`sitemap.xml: ${url} is listed but the page is noindexed`);
    }
  }
}

if (!fs.existsSync(path.join(ROOT, 'ads.txt'))) problems.push('ads.txt is missing');

if (problems.length) {
  console.error(`AdSense readiness: ${problems.length} problem(s) across ${checked} indexable pages\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nSee the header of scripts/check-adsense.mjs for what each check is for.');
  process.exit(1);
}

console.log(`AdSense readiness: ${checked} indexable pages, all clean.`);
