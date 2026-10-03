/* The arcade's generated board names, held to one answer in two places.
 *
 * An account with no username is filed on the board under a generated name
 * (supabase/131_arcade_generated_names.sql). The page derives the same name in
 * arcade/board.js to find its own row and mark it "(you)". If the two drift,
 * nothing fails: the row is simply never marked, and the player cannot find
 * themselves on a board full of strangers. So the word lists are compared here
 * and the arithmetic is held to values read out of a real Postgres
 * (supabase/test/arcade_names_test.sql prints them).
 *
 *   node scripts/check-arcade-names.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(path.join(ROOT, 'supabase/131_arcade_generated_names.sql'), 'utf8');
const js = readFileSync(path.join(ROOT, 'arcade/board.js'), 'utf8');

let fails = 0;
const ok = (c, what, d) => { if (c) console.log('  ok   ' + what); else { fails++; console.log('  FAIL ' + what + (d ? '\n       ' + d : '')); } };

const sqlArrays = [...sql.matchAll(/array\[([^\]]+)\]/g)].map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
const jsArr = name => { const m = js.match(new RegExp('var ' + name + ' = \\[([^\\]]+)\\]')); return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null; };
const ADJ = jsArr('ADJ'), NOUN = jsArr('NOUN');

ok(sqlArrays.length === 2, 'the migration carries two word lists');
ok(ADJ && ADJ.length === 32 && NOUN && NOUN.length === 32, 'board.js carries two lists of 32');
ok(JSON.stringify(ADJ) === JSON.stringify(sqlArrays[0]), 'adjectives match the SQL, word for word, in order');
ok(JSON.stringify(NOUN) === JSON.stringify(sqlArrays[1]), 'nouns match the SQL, word for word, in order');
ok(new Set(ADJ.concat(NOUN).map(w => w.toLowerCase())).size === 64, 'no word appears twice across the two lists');

// The function itself, run out of board.js.
const body = js.match(/function generatedName\(uid\) \{[\s\S]*?\n  \}/);
ok(!!body, 'generatedName is found in board.js');
const gen = new Function('ADJ', 'NOUN', body[0] + '; return generatedName;')(ADJ, NOUN);
// Read from Postgres 16 running arcade_names_test.sql.
const FIX = {
  '22222222-2222-4222-8222-222222222222': 'Steady Scout 852',
  '00000000-0000-4000-8000-000000000001': 'Swift Shortstop 100',
  'fedcba98-7654-4321-8abc-def012345678': 'Fresh Fielder 978',
};
for (const [id, want] of Object.entries(FIX)) ok(gen(id) === want, id + ' is ' + want + ' in the browser too', 'got ' + gen(id));
ok(gen('not-a-uuid') === null, 'a malformed id gives no name rather than a wrong one');
ok(!/\s{2}|^\s|\s$/.test(gen('fedcba98-7654-4321-8abc-def012345678')), 'names are single spaced');

console.log(fails ? '\n' + fails + ' failed' : '\narcade names ok');
process.exit(fails ? 1 : 0);
