/* The things that keep Last Shot UNLISTED.
 *
 *   node functions/_lastshot/check-posture.mjs
 *
 * Since 2026-10-26 the game is open to anybody with the link (the owner's
 * call; it was tester-only before). It is not launched: nothing points a
 * visitor or a crawler at it. In the spirit of hoops/check-posture.mjs, that
 * is a set of DELIBERATE choices, each a line somebody could delete without
 * anything else failing, so each is asserted here. Launching it (a home page
 * card, the newsletter) is an edit to this file, on purpose.
 *
 *   no public copy         nothing outside its own code names it or links it:
 *                          no nav entry, no home page card, no sitemap entry, not
 *                          in scripts/newsletter/games.json
 *   one way in             the code lives under functions/ and is served by its
 *                          own Function; no static last-shot/ folder beside it
 *   source never served    _redirects 404s /functions/*, where the code lives
 *   noindexed              the page and its response tell a crawler to stay out
 *
 * test/serve.test.mjs drives the Function; this file holds the repo around it. */
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
                  that). Other tools live there too (some gated) and may name
                  the game.
     .claude/, .github/   the repo's own tooling (agents, skills, workflows).
   test/serve.test.mjs and check 4 hold the one Function that serves it. */
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
    if (NAMES.some(n => n.test(e.name))) problems.push(rel + ' is a file named for the game outside its own code');
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

/* 4. One way in: the Function, answering through serve(), with the robots header. */
const fn = read('functions/last-shot/[[path]].js');
if (!/serve\(/.test(fn)) problems.push('the Function must answer through serve()');
if (!/'X-Robots-Tag': 'noindex, nofollow'/.test(fn)) problems.push('the Function no longer sends X-Robots-Tag: noindex, nofollow');

/* 5. Noindexed. */
const page = read('functions/_lastshot/web/play.html');
if (!/<meta name="robots" content="noindex, nofollow">/.test(page)) problems.push('the page is not noindexed');

if (problems.length) {
  console.error('Last Shot posture: ' + problems.length + ' problem(s)\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Last Shot posture: unlisted (noindexed, linked from nowhere public).');
