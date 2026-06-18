// Generates supabase/wc_players.csv (the server's authoritative ratings table
// source) from data/players_all.json. Re-run after every player-data swap, then
// re-import the CSV into Supabase (Table editor → wc_players → TRUNCATE → Import).
//
//   node scripts/makeWcPlayersCsv.js
//
// Columns line up 1:1 with the wc_players table:
//   player_id, wc_overall, position, is_captain, award
const fs = require('fs');
const path = require('path');

const IN  = path.join(__dirname, '..', 'data', 'players_all.json');
const OUT = path.join(__dirname, '..', 'supabase', 'wc_players.csv');

const players = JSON.parse(fs.readFileSync(IN, 'utf8'));

// award: array → pipe-joined; string → as-is; null/blank → ''
function awardField(a) {
  if (a == null) return '';
  if (Array.isArray(a)) return a.join('|');
  return String(a);
}

const lines = ['player_id,wc_overall,position,is_captain,award'];
let skipped = 0;
for (const p of players) {
  // wc_overall is NOT NULL in the table; skip any row without a usable rating
  if (p.wc_overall == null || Number.isNaN(+p.wc_overall)) { skipped++; continue; }
  lines.push([
    p.player_id,
    p.wc_overall,
    p.position,
    p.is_captain ? 'true' : 'false',
    awardField(p.award),
  ].join(','));
}

fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log('Wrote', OUT);
console.log('Rows:', lines.length - 1, skipped ? `(skipped ${skipped} with no wc_overall)` : '');
