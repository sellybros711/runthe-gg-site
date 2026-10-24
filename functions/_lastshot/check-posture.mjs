/* The things that keep Last Shot a tester-only game.
 *
 *   node functions/_lastshot/check-posture.mjs
 *
 * In the spirit of hoops/check-posture.mjs: hiding a game is a set of
 * DELIBERATE choices, and each one is a line somebody could delete without
 * anything else failing. So each is asserted here.
 *
 *   no public copy         nothing outside the gated code names it or links it:
 *                          no nav entry, no home page card, no sitemap entry, not
 *                          in scripts/newsletter/games.json
 *   no static folder       a folder at the site root is served to anybody
 *   source never served    _redirects 404s /functions/*, where the code lives
 *   one gate, one answer   the Function refuses with the same 404 as Stumpire,
 *                          and gates on the one tester list, with no flag of its own
 *   noindexed              the page tells a crawler to stay out
 *
 * test/gate.test.mjs drives the two Functions side by side; this file holds the
 * repo around them. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const problems = [];

/* 1. Nothing public names it. Every file the deploy could serve as a page or
   an asset, which is everything but:
     functions/   Pages Function code, never served as files (check 3 holds
                  that). Other gated tester tools live there too and may name
                  the game.
     .claude/, .github/   the repo's own tooling (agents, skills, workflows).
   A public Function that rendered the game would still be caught: it would
   have to answer a path, and test/gate.test.mjs and check 4 hold the one
   Function that does. */
const SKIP_TOP = new Set(['functions', '.claude', '.github']);
const SKIP_ANY = new Set(['.git', 'node_modules']);
/* Not last_shot: hoops names its own buzzer beater variables that way. */
const NAMES = [/Last Shot/, /last-shot/i, /lastshot/i];
const TEXT = /\.(html?|js|mjs|cjs|json|xml|txt|md|css|svg|webmanifest|ya?ml|toml)$|^_redirects$|^_headers$|^CNAME$/i;
function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? dir + '/' + e.name : e.name;
    if (SKIP_ANY.has(e.name) || (!dir && SKIP_TOP.has(e.name))) continue;
    if (e.isDirectory()) {
      if (NAMES.some(n => n.test(e.name))) problems.push(rel + '/ is a folder named for the game; a folder at the site root is public');
      walk(rel); continue;
    }
    if (NAMES.some(n => n.test(e.name))) problems.push(rel + ' is a file named for the game outside its gated code');
    if (!TEXT.test(e.name) || fs.statSync(path.join(ROOT, rel)).size > 4e6) continue;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const n of NAMES) if (n.test(src)) { problems.push(rel + ' mentions the game (' + n + ')'); break; }
  }
}
walk('');

/* 2. The places a public listing would go, named one by one so a reader of
   this file knows they were checked on purpose. */
for (const f of ['sitemap.xml', 'robots.txt', 'index.html', 'arcade/index.html', 'arcade/nav.js', 'scripts/newsletter/games.json']) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  if (/last.?shot/i.test(read(f))) problems.push(f + ' lists the game');
}

/* 3. The source is never served as files. */
if (!/^\/functions\/\*\s+\/404\.html\s+404\s*$/m.test(read('_redirects'))) problems.push('_redirects no longer 404s /functions/*');

/* 4. One gate, one answer. */
const fn = read('functions/last-shot/[[path]].js');
const stump = read('functions/arcade/stumpire/[[path]].js');
const notFound = s => (s.match(/async function notFound\(context\) \{[\s\S]*?\n\}/) || [''])[0];
if (!notFound(fn) || notFound(fn) !== notFound(stump)) problems.push('the Last Shot 404 is not byte for byte Stumpire\'s notFound()');
if (!/pageGate\(/.test(fn) || /PAGE\b/.test(fn)) problems.push('the Function must answer only through pageGate()');
if (!/_stumpire\/cookie\.js/.test(fn)) problems.push('the Function must verify the shared tester cookie');
const db = read('functions/_lastshot/db-supabase.js');
if (!/stumpire_testers/.test(db)) problems.push('the gate must read the one tester list, stumpire_testers');
if (/flag|mode|settings/i.test(db.replace(/\/\*[\s\S]*?\*\//g, ''))) problems.push('the gate grew a flag or a mode; it has none on purpose');

/* 5. Noindexed, and says who it is for. */
const page = read('functions/_lastshot/web/play.html');
if (!/<meta name="robots" content="noindex, nofollow">/.test(page)) problems.push('the page is not noindexed');
if (!/TESTERS ONLY/.test(page)) problems.push('the page does not say TESTERS ONLY');

if (problems.length) {
  console.error('Last Shot posture: ' + problems.length + ' problem(s)\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Last Shot posture: tester only, linked from nowhere, same 404 as Stumpire.');
