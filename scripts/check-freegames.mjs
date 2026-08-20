#!/usr/bin/env node
/* check-freegames.mjs
 *
 * Which games a free account may play is written down twice, and it has to be:
 *
 *   arcade/tokens.js   FREE_LIST  paints the locks before any network call
 *   supabase/*.sql     arcade_free_games()  is the gate that actually refuses
 *
 * There is no runtime reconcile between them. When they disagree the hub shows
 * FREE on a tile, the player taps it, and the spend RPC answers card_only. The
 * list had already been written out as a literal in three separate database
 * functions before this check existed.
 *
 * So: the client list must equal the list in the newest migration that defines
 * arcade_free_games(), same members, same order.
 *
 *   node scripts/check-freegames.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;

// ---- client -----------------------------------------------------------------
const tokens = readFileSync(root + 'arcade/tokens.js', 'utf8');
const cm = /var FREE_LIST\s*=\s*(\[[^\]]*\])/.exec(tokens);
if (!cm) fail('arcade/tokens.js has no FREE_LIST array');
const client = new Function('return ' + cm[1])();

// ---- server -----------------------------------------------------------------
// Newest wins: a later migration redefining the function is what the database
// is running, exactly as it would be after applying them in order.
const sql = readdirSync(root + 'supabase')
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));

let from = null, server = null;
for (const f of sql) {
  const body = readFileSync(root + 'supabase/' + f, 'utf8');
  const m = /create or replace function public\.arcade_free_games\(\)[\s\S]*?select\s+array\s*\[([^\]]*)\]/i.exec(body);
  if (!m) continue;
  const list = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  if (list.length) { from = f; server = list; }
}
if (!server) fail('no migration defines arcade_free_games() with an array literal');

// ---- compare ----------------------------------------------------------------
if (client.join('|') !== server.join('|')) {
  fail('the free list has drifted\n' +
       '  arcade/tokens.js       ' + client.join(', ') + '\n' +
       '  supabase/' + from + '  ' + server.join(', ') + '\n\n' +
       'Change both, or the hub offers a game the server refuses.');
}

console.log('free games ok: ' + client.join(', ') + ' (tokens.js = supabase/' + from + ')');

function fail(msg) { console.error(msg); process.exit(1); }
