/* The things that keep an unreleased product out of the public site.
 *
 *   node fantasy/check-posture.mjs
 *
 * Needs no network and no browser. fantasy/check-gate.mjs is the other half:
 * this file reads the repo, that one drives a real browser. Neither replaces
 * the other, and the split is deliberate. A posture check can tell you the
 * robots line is there; only a browser can tell you the gate actually holds.
 *
 *
 * WHY THIS IS A CHECK AND NOT A HABIT
 * ---------------------------------------------------------------------------
 * hoops/check-posture.mjs makes the argument and it applies here with one
 * difference worth stating. There, the four properties (noindexed, absent from
 * the sitemap, no ad tag, linked from nowhere) ARE the gate, and that file
 * says so: "Unlisted is the whole of the gate. It is not access control."
 *
 * Here they are not the gate. The gate is a Pages Function that answers 404
 * and an allowlist in the database. These properties are the layer above it,
 * and the reason they still matter is that defence in depth only works while
 * every layer is actually there. A deleted robots line fails nothing, breaks
 * nothing, and quietly removes one of them.
 *
 *
 * THE ONE THAT IS NOT LIKE THE OTHERS
 * ---------------------------------------------------------------------------
 * Section 5 greps for a leaked odds API key. Every other check here is about
 * discoverability and is recoverable; that one is about a credential that
 * would be scraped and spent. It is written against the SERVED tree rather
 * than against a list of files somebody remembered to include, because the
 * brief asks for the built output to be checked and this site has no build
 * step: what is in the repo is what is served.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p) => fs.existsSync(path.join(ROOT, p));

const problems = [];
const fail = (m) => problems.push(m);

/* Everything that belongs to this feature. A link to /fantasy from inside one
 * of these is expected; from anywhere else it is the leak. */
const FEATURE = [
  'fantasy/',
  'fantasy-pipeline/',
  'functions/fantasy/',
  'functions/api/fantasy/',
  'supabase/109_fantasy_access.sql',
  'supabase/110_fantasy_core.sql',
  'supabase/111_fantasy_model.sql',
  'supabase/test/fantasy_',
  'CLAUDE.md',
];
const inFeature = (rel) => FEATURE.some((f) => rel.startsWith(f) || rel === f);

const SKIP_DIRS = new Set(['.git', 'node_modules', '.github']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. robots.txt disallows the path.
// ---------------------------------------------------------------------------
const robots = read('robots.txt');
if (!/^\s*Disallow:\s*\/fantasy\s*$/mi.test(robots)) {
  fail('robots.txt does not carry "Disallow: /fantasy". The route answers 404 so a '
    + 'crawler would drop it anyway, but that is one layer and this is the cheap one.');
}

// ---------------------------------------------------------------------------
// 2. NOTHING STATIC IS SERVED UNDER /fantasy, which is the whole design.
// ---------------------------------------------------------------------------
// The catch-all route intercepts every request under /fantasy, so a .html file
// in this directory would never be reachable. It would still be the wrong
// thing to have: it reads as a page, and the next person to touch this will
// assume pages here are served and gate one in JavaScript instead.
if (has('fantasy')) {
  const strays = walk(path.join(ROOT, 'fantasy'))
    .map((p) => path.relative(ROOT, p))
    .filter((p) => p.endsWith('.html'));
  if (strays.length) {
    fail(`html under fantasy/: ${strays.join(', ')}. Nothing here is served as a page. `
      + 'The views are modules delivered by /api/fantasy/app after a server-side '
      + 'allowlist check, and an .html file here is either dead or a hole.');
  }
}

// ---------------------------------------------------------------------------
// 3. The catch-all and the endpoint both exist.
// ---------------------------------------------------------------------------
// If the route file is renamed or removed, every file under fantasy/ becomes a
// directly fetchable static asset and nothing else in the repo would complain.
// That is the single worst silent failure here.
if (!has('functions/fantasy/[[path]].js')) {
  fail('functions/fantasy/[[path]].js is missing. Without the catch-all, every file '
    + 'under fantasy/ is served as a static asset to anybody who asks.');
}
if (!has('functions/api/fantasy/app.js')) {
  fail('functions/api/fantasy/app.js is missing. Nothing can deliver the views.');
} else {
  const app = read('functions/api/fantasy/app.js');
  if (!/verifyUser/.test(app)) {
    fail('functions/api/fantasy/app.js does not call verifyUser. The session is not '
      + 'being verified server side.');
  }
  if (!/fantasy_access_allowlist/.test(app)) {
    fail('functions/api/fantasy/app.js never reads fantasy_access_allowlist. A verified '
      + 'session is not the same as an allowed one.');
  }
  /* EVERY VIEW IN THE MAP HAS A FILE, AND EVERY FILE IS IN THE MAP. A view in
     the map with no file is a 404 a member cannot explain; a file with no map
     entry is a tool nobody can reach, which is this repo's oldest bug (a
     leaderboard that rendered perfectly and had no way in). */
  const mapped = [...app.matchAll(/'([a-z-]+)':\s*'(\/fantasy\/app\/[a-z-]+\.js)'/g)];
  if (!mapped.length) {
    fail('could not read the VIEWS map out of functions/api/fantasy/app.js, so this '
      + 'check is not checking anything. Has its shape changed?');
  }
  for (const [, name, file] of mapped) {
    if (!has(file.replace(/^\//, ''))) fail(`VIEWS names "${name}" but ${file} does not exist.`);
  }
  if (has('fantasy/app')) {
    const onDisk = fs.readdirSync(path.join(ROOT, 'fantasy/app')).filter((f) => f.endsWith('.js'));
    const inMap = new Set(mapped.map(([, , f]) => path.basename(f)));
    const orphan = onDisk.filter((f) => !inMap.has(f));
    if (orphan.length) {
      fail(`fantasy/app holds views nothing can serve: ${orphan.join(', ')}. Add them to `
        + 'the VIEWS map in functions/api/fantasy/app.js or delete them.');
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Not in the sitemap, and linked from nowhere.
// ---------------------------------------------------------------------------
if (read('sitemap.xml').includes('/fantasy')) {
  fail('sitemap.xml lists /fantasy. That is an invitation to exactly the crawler the '
    + 'rest of this is keeping out.');
}

/* Repo wide, which is the brief's acceptance criterion rather than the three
 * nav pages hoops/check-posture.mjs checks. The stricter version is right here
 * because the risk is not a visitor stumbling in, it is a link existing at
 * all: one href in a commit is enough to put the path in front of somebody. */
for (const abs of walk(ROOT)) {
  const rel = path.relative(ROOT, abs);
  if (inFeature(rel)) continue;
  if (!/\.(html|js|mjs|css|json|md|txt|xml|yml|yaml)$/i.test(rel)) continue;
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
  if (/href=["'][^"']*\/fantasy\b/i.test(src)) {
    fail(`${rel} links to /fantasy. Nothing outside the feature directory may.`);
  }
}

// ---------------------------------------------------------------------------
// 5. NO ODDS API KEY ANYWHERE IN THE SERVED TREE.
// ---------------------------------------------------------------------------
// The brief: verify by grepping the build output, not the source. This site
// has no build step, so the repo IS the output and the whole tree is checked.
//
// Two shapes. A named assignment is what a careless commit looks like; the
// bare 32 hex characters is what the key itself looks like, and it is checked
// separately so a key pasted with no variable name around it is still caught.
const KEYISH = [
  [/\bapi[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{16,}['"]/i, 'a hardcoded apiKey assignment'],
  [/\bodds[_-]?api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, 'a hardcoded odds api key'],
  [/\b[a-f0-9]{32}\b/, 'a bare 32 character hex string, which is the shape of an odds api key'],
];
/* The Supabase anon key is deliberately exempt. It is published in the page
 * source of every game on this site and RLS is what protects the data. It is a
 * JWT, so it is matched by shape and never by a filename allowlist. */
const ANON_JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./;

for (const abs of walk(ROOT)) {
  const rel = path.relative(ROOT, abs);
  if (!inFeature(rel)) continue;
  if (!/\.(js|mjs|json|html|css|py|toml|yml|yaml|md|sql)$/i.test(rel)) continue;
  if (rel === 'fantasy/check-posture.mjs') continue;   // it holds the patterns
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
  for (const [re, what] of KEYISH) {
    const m = src.match(re);
    if (!m) continue;
    if (ANON_JWT.test(m[0])) continue;
    fail(`${rel} contains ${what}: ${m[0].slice(0, 24)}... The odds key lives in `
      + 'Cloudflare Worker secrets and GitHub Actions secrets. Nowhere else, ever.');
  }
}

// ---------------------------------------------------------------------------
// 6. The dash rule covers this directory.
// ---------------------------------------------------------------------------
// CLAUDE.md: GUARDED and the workflow's paths: are two copies of one answer,
// and they have already drifted once. A new directory is clean by
// construction, so there is no reason for it not to be on the list from the
// first commit.
const dashes = read('scripts/check-dashes.mjs');
if (!/const GUARDED = \[[^\]]*'fantasy'/.test(dashes)) {
  fail("scripts/check-dashes.mjs GUARDED does not include 'fantasy'.");
}
if (has('.github/workflows/dash-check.yml')) {
  const wf = read('.github/workflows/dash-check.yml');
  if (!/fantasy/.test(wf)) {
    fail(".github/workflows/dash-check.yml has no fantasy path. GUARDED and the "
      + "workflow's paths: are two copies of one answer and they drift.");
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (problems.length) {
  console.error(`Run The Fantasy League posture: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nIf one of these is now intentional, change THIS FILE in the same commit,');
  console.error('so opening the product up is a decision somebody made rather than a guard');
  console.error('nobody noticed. See the header for what each check is holding up.');
  process.exit(1);
}

console.log('Run The Fantasy League posture:');
console.log('  disallowed in robots.txt, absent from the sitemap, linked from nowhere.');
console.log('  nothing static under /fantasy, and the catch-all that guarantees it is present.');
console.log('  the endpoint verifies a session AND checks the allowlist.');
console.log('  no odds api key anywhere in the feature tree.');
