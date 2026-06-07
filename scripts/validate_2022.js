// validate_2022.js — Quality checks for data/players_2022.json

const fs = require('fs');
const players = JSON.parse(fs.readFileSync('data/players_2022.json', 'utf8'));

const REQUIRED_FIELDS = [
  'player_id','name','country','year','position','height','appearances',
  'goals','assists','minutes','clean_sheets','goals_conceded','saves',
  'save_pct','tackles','interceptions','clearances','pass_completion',
  'key_passes','chances_created','dribbles','shots_per90',
  'shots_on_target_pct','yellow_cards','red_cards','is_2026','club_league_tier'
];
const VALID_POSITIONS = new Set(['GK','DEF','MID','FWD']);
const NON_NULL_FIELDS = ['name','country','position','height','appearances','goals','assists','minutes'];

let allPass = true;

function check(label, passed, detail) {
  const status = passed ? 'PASS' : 'FAIL';
  if (!passed) allPass = false;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}

// Check 1: Total player count 500-750
check(
  'Check 1: Total player count between 500 and 750',
  players.length >= 500 && players.length <= 750,
  `${players.length} players`
);

// Check 2: All required fields present on every object
const missingFields = [];
players.forEach(p => {
  REQUIRED_FIELDS.forEach(f => {
    if (!(f in p)) missingFields.push(`${p.player_id} missing ${f}`);
  });
});
check(
  'Check 2: Every object has all required fields',
  missingFields.length === 0,
  missingFields.length > 0 ? missingFields.slice(0,3).join(', ') + (missingFields.length > 3 ? '...' : '') : ''
);

// Check 3: No invalid position values
const invalidPos = players.filter(p => !VALID_POSITIONS.has(p.position));
check(
  'Check 3: No invalid position values',
  invalidPos.length === 0,
  invalidPos.length > 0 ? invalidPos.map(p => `${p.player_id}:${p.position}`).slice(0,3).join(', ') : ''
);

// Check 4: All player_id values are unique
const ids = players.map(p => p.player_id);
const idSet = new Set(ids);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
check(
  'Check 4: All player_id values are unique',
  idSet.size === players.length,
  duplicates.length > 0 ? 'Duplicates: ' + [...new Set(duplicates)].slice(0,5).join(', ') : ''
);

// Check 5: year is 2022 for every player
const wrongYear = players.filter(p => p.year !== 2022);
check(
  'Check 5: year is 2022 for every player',
  wrongYear.length === 0,
  wrongYear.length > 0 ? wrongYear.map(p => p.player_id).slice(0,3).join(', ') : ''
);

// Check 6: is_2026 is false for every player
const wrongFlag = players.filter(p => p.is_2026 !== false);
check(
  'Check 6: is_2026 is false for every player',
  wrongFlag.length === 0,
  wrongFlag.length > 0 ? wrongFlag.map(p => p.player_id).slice(0,3).join(', ') : ''
);

// Check 7: No null for required non-null fields
const nullRequired = [];
players.forEach(p => {
  NON_NULL_FIELDS.forEach(f => {
    if (p[f] === null || p[f] === undefined) nullRequired.push(`${p.player_id}.${f}`);
  });
});
check(
  'Check 7: No null for name/country/position/height/appearances/goals/assists/minutes',
  nullRequired.length === 0,
  nullRequired.length > 0 ? nullRequired.slice(0,3).join(', ') : ''
);

console.log('');
if (allPass) {
  console.log('ALL CHECKS PASSED — players_2022.json is ready');
} else {
  console.log('SOME CHECKS FAILED — see details above');
  process.exit(1);
}
