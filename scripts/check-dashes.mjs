/* No em dashes. No en dashes.
 *
 * They are banned outright in the wrestling game: in prose the reader sees, in
 * placeholder strings, in code comments, in titles, everywhere. This script is
 * the enforcement. It walks the guarded directories and fails on any dash
 * character or HTML entity that resolves to one.
 *
 * Usage:
 *   node scripts/check-dashes.mjs              check the guarded paths
 *   node scripts/check-dashes.mjs path/to/dir  check something else
 *
 * The rest of the repo predates this rule and is full of em dashes, so the
 * guarded list is deliberately narrow. Widen it by adding to GUARDED once a
 * directory has been cleaned; do not widen it before, or the check turns into
 * noise everybody learns to ignore.
 *
 * What to write instead, in rough order of how often it is the right answer:
 *   a colon        when what follows explains or names what came before
 *   a full stop    when what follows is its own sentence
 *   a comma        when what follows is "and ...", "but ...", "so ..."
 *   parentheses    for a genuine aside
 *   a hyphen       inside number ranges: 1-8 weeks, 82-88
 *   a middot ·     between fields on one line: NAME · TIER · YEAR
 *   nothing at all when the dash was only propping up a fragment
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/* Widened only for directories that are already clean, per CLAUDE.md. hoops was
   written under the rule from its first commit, so it went on the list in the
   same commit rather than as a promise to clean it later. */
const GUARDED = ['wrestling', 'hoops'];
const EXT = /\.(html|js|mjs|css|json|md|txt|svg)$/i;
const SKIP = /(^|\/)(node_modules|\.git)(\/|$)/;

// the characters themselves, plus every way to smuggle one in
const BAD = [
  ['—', 'em dash'],
  ['–', 'en dash'],
  ['‒', 'figure dash'],
  ['―', 'horizontal bar'],
  ['&mdash;', '&mdash; entity'],
  ['&ndash;', '&ndash; entity'],
  ['&#8212;', '&#8212; entity'],
  ['&#8211;', '&#8211; entity'],
  ['\\u2014', '\\u2014 escape'],
  ['\\u2013', '\\u2013 escape'],
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : GUARDED;
const hits = [];

for (const root of roots) {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [needle, label] of BAD) {
        let at = line.indexOf(needle);
        while (at !== -1) {
          hits.push({
            file: relative(process.cwd(), file), line: i + 1, label,
            text: line.trim().slice(0, 140),
          });
          at = line.indexOf(needle, at + needle.length);
        }
      }
    });
  }
}

if (hits.length) {
  console.error(`\n${hits.length} dash${hits.length === 1 ? '' : 'es'} found. None are allowed.\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  (${h.label})\n    ${h.text}`);
  console.error('\nRewrite each one. A colon, a full stop, a comma, parentheses, a hyphen');
  console.error('inside a number range, or a middot between fields will cover every case.\n');
  process.exit(1);
}

console.log(`No em or en dashes in: ${roots.join(', ')}`);
