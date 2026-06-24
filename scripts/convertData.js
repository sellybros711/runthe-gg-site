// RunThePitch: World Cup Game — Player data pipeline (dataset v2)
// Reads the RERATED CSV and emits data/players_all.json in the shape the game engine expects.
//
// wc_overall (integer 60-99) is the rating the game engine uses for individual
// players. skill_rating is carried through as a fallback rating. Fields with no
// data in this dataset are set to null explicitly (null = unknown).
//
// To record a rating upgrade: in the CSV set pre_wc_overall=<old rating>, bump
// wc_overall to the new rating, optionally add a wc_note, and set
// is_community_request=1 if it was community-requested. Then re-run this script.

const fs = require('fs');
const path = require('path');

const IN_PATH  = path.join(__dirname, '..', 'data', 'world_cup_full_rosters_1966_2026_4.json');
const OUT_PATH = path.join(__dirname, '..', 'data', 'players_all.json');
const JS_PATH  = path.join(__dirname, '..', 'data', 'players_all.js');

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    // handle quoted fields
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { vals.push(cur); cur = ''; }
      else { cur += c; }
    }
    vals.push(cur);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
    return row;
  });
}

// ─── FIFA 3-letter country codes ──────────────────────────────────────────────
const COUNTRY_CODES = {
  'England':'ENG','France':'FRA','Brazil':'BRA','Argentina':'ARG',
  'Germany':'GER','West Germany':'GER','Italy':'ITA','Spain':'ESP',
  'Netherlands':'NED','Portugal':'POR','Uruguay':'URU','Croatia':'CRO',
  'Belgium':'BEL','Mexico':'MEX','USA':'USA','Japan':'JPN','South Korea':'KOR',
  'Australia':'AUS','Denmark':'DEN','Switzerland':'SUI','Poland':'POL',
  'Senegal':'SEN','Morocco':'MAR','Ghana':'GHA','Cameroon':'CMR',
  'Saudi Arabia':'KSA','Iran':'IRN','Wales':'WAL','Ecuador':'ECU',
  'Qatar':'QAT','Serbia':'SRB','Tunisia':'TUN','Costa Rica':'CRC',
  'Canada':'CAN','Algeria':'ALG','Czechoslovakia':'TCH',
  'Soviet Union':'URS','Yugoslavia':'YUG','East Germany':'DDR',
  'Scotland':'SCO','Bulgaria':'BUL','Romania':'ROU','Hungary':'HUN',
  'Sweden':'SWE','Chile':'CHI','Colombia':'COL','Nigeria':'NGA',
  'Ivory Coast':'CIV',"Côte d'Ivoire":'CIV','Togo':'TOG','Angola':'ANG','Trinidad':'TRI',
  'Trinidad and Tobago':'TRI','Honduras':'HON','Slovakia':'SVK',
  'Slovenia':'SVN','Greece':'GRE','Turkey':'TUR','Paraguay':'PAR',
  'Peru':'PER','Bolivia':'BOL','Republic of Ireland':'IRL',
  'Northern Ireland':'NIR','Russia':'RUS','Ukraine':'UKR','Norway':'NOR',
  'Austria':'AUT','New Zealand':'NZL','Cuba':'CUB','Egypt':'EGY',
  'Iraq':'IRQ','Kuwait':'KUW','North Korea':'PRK','Haiti':'HAI',
  'Zaire':'ZAI','El Salvador':'SLV','Israel':'ISR','Indonesia':'IDN',
  'Jamaica':'JAM','China':'CHN','South Africa':'RSA',
};
function countryCode(country) {
  if (COUNTRY_CODES[country]) return COUNTRY_CODES[country];
  return country.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

// ─── Position mapping ─────────────────────────────────────────────────────────
const POSITION_MAP = { GK:'GK', DF:'DEF', MF:'MID', FW:'FWD' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function lastName(name) {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] || name;
  return stripAccents(last).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
// pass an integer through; blank/missing → null (values are already typed ints)
function intOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}
// award value: null if blank, an array if pipe-separated, otherwise a string
function awardOrNull(v) {
  const t = strOrNull(v);
  if (t === null) return null;
  if (t.includes('|')) return t.split('|').map(s => s.trim()).filter(Boolean);
  return t;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const text = fs.readFileSync(IN_PATH, 'utf8');
  const rows = IN_PATH.endsWith('.json') ? JSON.parse(text) : parseCSV(text);

  const players = [];
  const idCounts = new Map(); // base id → count, for _2/_3 suffixes

  for (const row of rows) {
    const name = (row.player_name || row.name || '').trim();
    if (!name) continue;
    const country = (row.country || '').trim();
    const year    = intOrNull(row.wc_year);
    const rawPos  = (row.position || '').trim();
    const position = POSITION_MAP[rawPos] || rawPos;
    const is2026  = year === 2026;

    // player_id: [3letter_country]_[year]_[lastname]
    const baseId = `${countryCode(country)}_${year}_${lastName(name)}`;
    let id = baseId;
    if (idCounts.has(baseId)) {
      const n = idCounts.get(baseId) + 1;
      idCounts.set(baseId, n);
      id = `${baseId}_${n}`;
    } else {
      idCounts.set(baseId, 1);
    }

    players.push({
      player_id:           id,
      name:                name,                       // keep accents
      country:             country,
      year:                year,
      position:            position,
      height:              null,
      // 2026 squads have not played: no goals, no result, no team rating.
      appearances:         intOrNull(row.career_caps_at_tournament),
      goals:               is2026 ? null : intOrNull(row.tournament_goals),
      assists:             null,
      minutes:             null,
      clean_sheets:        null,
      goals_conceded:      null,
      saves:               null,
      save_pct:            null,
      tackles:             null,
      interceptions:       null,
      clearances:          null,
      pass_completion:     null,
      key_passes:          null,
      chances_created:     null,
      dribbles:            null,
      shots_per90:         null,
      shots_on_target_pct: null,
      yellow_cards:        null,
      red_cards:           null,
      is_2026:             is2026,
      club_league_tier:    null,
      is_captain:          intOrNull(row.is_captain) === 1,
      wc_overall:          intOrNull(row.wc_overall),        // engine rating (60-99)
      skill_rating:        intOrNull(row.skill_rating),      // fallback rating
      wc_performance:      intOrNull(row.wc_performance),    // not displayed during draft
      team_overall:        is2026 ? null : intOrNull(row.team_overall),
      tournament_result:   is2026 ? null : strOrNull(row.tournament_result),
      age_at_tournament:   intOrNull(row.age_at_tournament),
      birth_year:          intOrNull(row.birth_year),
      club_at_tournament:  strOrNull(row.club_at_tournament),
      award:               awardOrNull(row.award),
      // upgrade tracking: set pre_wc_overall to the OLD rating before bumping wc_overall
      // wc_note is an optional short reason (e.g. "2 goals vs France")
      // is_community_request=1 routes the upgrade to the Community Requests tab instead
      pre_wc_overall:      intOrNull(row.pre_wc_overall),
      wc_note:             strOrNull(row.wc_note),
      wc_date:             strOrNull(row.wc_date),
      is_community_request: intOrNull(row.is_community_request) === 1,
    });
  }

  // ─── Reporting ──────────────────────────────────────────────────────────────
  const years     = [...new Set(players.map(p => p.year))].sort((a, b) => a - b);
  const countries = [...new Set(players.map(p => p.country))].sort();
  const confirm = (nm, yr) => {
    const p = players.find(x => x.name.includes(nm) && x.year === yr);
    return p ? p.wc_overall : 'NOT FOUND';
  };

  console.log('=== convertData.js (dataset v2) ===');
  console.log('Total players converted:', players.length);
  console.log('Years covered (' + years.length + '):', years.join(', '));
  console.log('Countries covered (' + countries.length + '):', countries.join(', '));
  console.log('wc_overall >= 90 (elite):', players.filter(p => p.wc_overall >= 90).length);
  console.log('wc_overall === 60 (floor):', players.filter(p => p.wc_overall === 60).length);
  console.log('2026 players:', players.filter(p => p.year === 2026).length);
  console.log('Pelé 1970 wc_overall:', confirm('Pelé', 1970));
  console.log('Maradona 1986 wc_overall:', confirm('Maradona', 1986));
  console.log('Messi 2022 wc_overall:', confirm('Messi', 2022));

  // uniqueness check
  const ids = players.map(p => p.player_id);
  const unique = new Set(ids);
  if (unique.size === ids.length) {
    console.log('All player_ids unique: YES (' + ids.length + ')');
  } else {
    const seen = new Set(), dupes = new Set();
    ids.forEach(i => { if (seen.has(i)) dupes.add(i); else seen.add(i); });
    console.log('All player_ids unique: NO — duplicates:', [...dupes].slice(0, 20));
  }

  // ─── Shrink the shipped dataset ───────────────────────────────────────────
  // Drop null/undefined fields from every player. The game reads each field with
  // ?? / || / truthy / != null checks, so a MISSING key behaves exactly like null
  // — but omitting them removes ~19 always-empty columns (height, minutes, tackles,
  // saves, …) plus per-row nulls, roughly halving the file and its parse time.
  for (const p of players) {
    for (const k of Object.keys(p)) {
      if (p[k] === null || p[k] === undefined) delete p[k];
    }
  }

  // Minified (no indentation) — the file is fetched, not read by humans.
  fs.writeFileSync(OUT_PATH, JSON.stringify(players));
  console.log('Wrote', OUT_PATH, '(' + (fs.statSync(OUT_PATH).size/1048576).toFixed(2) + ' MB)');
  // Also write the JS wrapper (file:// fallback only — loaded on demand).
  fs.writeFileSync(JS_PATH, `window.PLAYERS = ${JSON.stringify(players)};\n`);
  console.log('Wrote', JS_PATH, '(' + (fs.statSync(JS_PATH).size/1048576).toFixed(2) + ' MB)');
  // Summary of upgrades recorded
  const upgraded = players.filter(p => p.pre_wc_overall != null);
  if (upgraded.length) {
    console.log(`\nUpgrades recorded (${upgraded.length}):`);
    upgraded.forEach(p => console.log(`  ${p.name} (${p.country}): ${p.pre_wc_overall} → ${p.wc_overall}${p.wc_note ? ' — ' + p.wc_note : ''}`));
  } else {
    console.log('\nNo upgrades recorded yet (pre_wc_overall column is empty for all players).');
  }
}

main();
