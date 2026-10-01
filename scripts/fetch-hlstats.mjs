/* Run The Arcade - career stat totals for High Low (arcade/hlstats.js).
 *
 * High Low lets a Card member pick a category, then guess higher/lower on that
 * stat across the whole pool. This builds the broad, active-inclusive stat data
 * that the retired-only, hand-curated stats.js (Rank It) deliberately does not:
 *
 *   NFL  nflverse per-season player stats (offense + defense), 1999-latest.
 *        Summed across seasons to career totals. Includes active players.
 *   MLB  career WAR from baseball/data/players.json (already in the repo;
 *        Coby's scraped bWAR/fWAR blend, 1901-2025, includes active players).
 *
 * NBA is intentionally left to stats.js for now (no reachable bulk source from
 * the sandbox - basketball-reference is proxy-blocked). High Low merges this
 * file over stats.js, so NFL/MLB gain active players while NBA and the
 * pre-1999 NFL / retired-MLB counting stats keep coming from stats.js.
 *
 * Names are matched to grid/match/entities.js by sport + normalized name, so
 * every key here is a real corpus entity id. Values are regular-season career
 * totals; `asof` records the last season each sport's numbers run through, so
 * the game can flag an active player's total as "through the {asof} season".
 *
 * Run:  node scripts/fetch-hlstats.mjs        (needs open network for nflverse)
 * Out:  arcade/hlstats.js   (window.RTG_HLSTATS)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NFL_FIRST = 1999;          // nflverse offense/defense coverage starts here
const NFL_LAST_PROBE = 2026;     // stop when a season 404s
const REL = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_';

function nk(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]/g,''); }
function parseLine(line){ const out=[]; let cur='',q=false; for(let i=0;i<line.length;i++){ const c=line[i]; if(q){ if(c==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; } else { if(c==='"')q=true; else if(c===','){out.push(cur);cur='';} else cur+=c; } } out.push(cur); return out; }

// ---- corpus ----
const cg = {};
new Function('self','module', fs.readFileSync(path.join(ROOT,'arcade/match/entities.js'),'utf8'))(cg,{});
const ENT = cg.GRID_ENTITIES || [];
const entBy = {};                                  // "SPORT|nk" -> id
ENT.forEach(e => { entBy[e.sport+'|'+nk(e.name)] = e.id; });

// ---- NFL: pull each season, sum to career ----
async function fetchText(url){
  const r = await fetch(url, { headers: { 'User-Agent': 'runthe-arcade-hlstats/1.0' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('HTTP '+r.status+' for '+url);
  return await r.text();
}

// nflverse column -> our category key + label/unit
const NFL_MAP = [
  ['passing_yards',   'nfl_passyds',  'passing yards',    'yds'],
  ['passing_tds',     'nfl_passtd',   'passing TDs',      'TD'],
  ['rushing_yards',   'nfl_rushyds',  'rushing yards',    'yds'],
  ['rushing_tds',     'nfl_rushtd',   'rushing TDs',      'TD'],
  ['receptions',      'nfl_receptions','receptions',      'rec'],
  ['receiving_yards', 'nfl_recyds',   'receiving yards',  'yds'],
  ['receiving_tds',   'nfl_rectd',    'receiving TDs',    'TD'],
  ['def_sacks',       'nfl_sacks',    'sacks',            'sacks'],
  ['def_interceptions','nfl_int',     'interceptions',    'INT'],
];
// tackles = solo + assists (no single column)
const TACKLE_COLS = ['def_tackles_solo','def_tackle_assists'];

const activeIds = {};   // entity id -> 1, for players present in each sport's latest season

// nflverse's player table: rookie_season is what tells a whole career from one
// that started before NFL_FIRST and so arrives here cut off.
async function loadPlayers(){
  const txt = await fetchText('https://github.com/nflverse/nflverse-data/releases/download/players/players.csv');
  if (!txt) throw new Error('players.csv missing: cannot tell whole careers from cut-off ones');
  const lines = txt.split('\n'); const H = parseLine(lines[0]); const ci = {}; H.forEach((h,i)=>ci[h]=i);
  const out = {};
  for (let i=1;i<lines.length;i++){ const ln=lines[i]; if(!ln) continue; const f=parseLine(ln);
    const id=f[ci['gsis_id']]; if(!id) continue;
    out[id] = { rookie: parseInt(f[ci['rookie_season']])||null, group: f[ci['position_group']]||'' };
  }
  return out;
}

/* FULL CAREERS for the legends that NFL_FIRST cuts off, kept by hand.
 *
 * The drop below is honest and it costs something: Tiki Barber, Marshall
 * Faulk, Randy Moss and Ray Lewis fell out of the categories they are famous
 * for. So their real totals are written here and put back after the drop.
 *
 * Offense is summed season by season from Pro Football Reference's yearly
 * tables (the fantasydatapros/data mirror, 1970-2019, the one copy reachable
 * from the sandbox) and every total was checked against the published career
 * figure. Interceptions and sacks are not in those tables, so they are typed
 * in, and only where the career figure is certain. Tackles are left out on
 * purpose: they were not an official stat before 2001, so there is no career
 * total to be right about. A player whose number is uncertain is left OUT of
 * that category rather than shown one that might be wrong. */
const PRE1999 = {
  'ahman-green': { passyds: 20, passtd: 1, rushyds: 9205, rushtd: 60, receptions: 378, recyds: 2883, rectd: 14 },
  'brett-favre': { passyds: 71838, passtd: 508, rushyds: 1844, rushtd: 14, receptions: 2 },
  'brian-dawkins': { int: 37, sacks: 26 },
  'charles-woodson': { int: 65, sacks: 20 },
  'corey-dillon': { rushyds: 11241, rushtd: 82, receptions: 244, recyds: 1913, rectd: 7 },
  'cris-carter': { rushyds: 41, receptions: 1101, recyds: 13899, rectd: 130 },
  'curtis-martin': { passyds: 36, passtd: 2, rushyds: 14101, rushtd: 90, receptions: 484, recyds: 3329, rectd: 10 },
  'darren-woodson': { int: 23 },
  'deion-sanders': { int: 53, receptions: 60, recyds: 784, rectd: 3 },
  'derrick-brooks': { int: 25, sacks: 13.5 },
  'drew-bledsoe': { passyds: 44611, passtd: 251, rushyds: 764, rushtd: 10, receptions: 1 },
  'emmitt-smith': { passyds: 21, passtd: 1, rushyds: 18355, rushtd: 164, receptions: 515, recyds: 3224, rectd: 11 },
  'fred-taylor': { rushyds: 11695, rushtd: 66, receptions: 290, recyds: 2384, rectd: 8 },
  'hines-ward': { passyds: 17, rushyds: 428, rushtd: 1, receptions: 1000, recyds: 12083, rectd: 85 },
  'isaac-bruce': { passyds: 81, rushyds: 139, receptions: 1024, recyds: 15208, rectd: 91 },
  'jerome-bettis': { passyds: 63, passtd: 3, rushyds: 13662, rushtd: 91, receptions: 200, recyds: 1449, rectd: 3 },
  'jerry-rice': { passyds: 71, passtd: 1, rushyds: 645, rushtd: 10, receptions: 1549, recyds: 22895, rectd: 197 },
  'john-lynch': { int: 26, sacks: 13 },
  'junior-seau': { int: 18, sacks: 56.5 },
  'kurt-warner': { passyds: 32344, passtd: 208, rushyds: 286, rushtd: 3, receptions: 1 },
  'london-fletcher': { int: 23, sacks: 39 },
  'marshall-faulk': { rushyds: 12279, rushtd: 100, receptions: 767, recyds: 6875, rectd: 36 },
  'marvin-harrison': { rushyds: 28, receptions: 1102, recyds: 14580, rectd: 128 },
  'michael-irvin': { rushyds: 6, receptions: 750, recyds: 11904, rectd: 65 },
  'peyton-manning': { passyds: 71940, passtd: 539, rushyds: 667, rushtd: 18, receptions: 1 },
  'priest-holmes': { rushyds: 8172, rushtd: 86, receptions: 339, recyds: 2962, rectd: 8 },
  'randy-moss': { passyds: 106, passtd: 2, rushyds: 159, receptions: 982, recyds: 15292, rectd: 156 },
  'ray-lewis': { int: 31, sacks: 41.5 },
  'rod-woodson': { int: 71 },
  'rodney-harrison': { int: 34, sacks: 30.5 },
  'shannon-sharpe': { rushyds: 9, receptions: 815, recyds: 10060, rectd: 62 },
  'steve-mcnair': { passyds: 31304, passtd: 174, rushyds: 3590, rushtd: 37, receptions: 1, recyds: 4 },
  'steve-young': { passyds: 33124, passtd: 232, rushyds: 4239, rushtd: 43, receptions: 2, recyds: 2 },
  'terrell-davis': { rushyds: 7607, rushtd: 60, receptions: 169, recyds: 1280, rectd: 5 },
  'terrell-owens': { rushyds: 251, rushtd: 3, receptions: 1078, recyds: 15934, rectd: 153 },
  'thurman-thomas': { rushyds: 12074, rushtd: 65, receptions: 472, recyds: 4458, rectd: 23 },
  'tiki-barber': { rushyds: 10449, rushtd: 55, receptions: 586, recyds: 5183, rectd: 12 },
  'tim-brown': { rushyds: 190, rushtd: 1, receptions: 1094, recyds: 14934, rectd: 100 },
  'tony-gonzalez': { passyds: 40, rushyds: 14, receptions: 1325, recyds: 15127, rectd: 111 },
  'troy-aikman': { passyds: 32942, passtd: 165, rushyds: 1016, rushtd: 9, receptions: 2 },
  'ty-law': { int: 53 },
  'warren-moon': { passyds: 49325, passtd: 291, rushyds: 1736, rushtd: 22 },
  'warrick-dunn': { rushyds: 10967, rushtd: 49, receptions: 510, recyds: 4339, rectd: 15 },
  'zach-thomas': { int: 17, sacks: 20.5 },
};

/* Summed PER PLAYER ID, never per name, and a career that began before
 * NFL_FIRST is dropped rather than summed.
 *
 * Both were live defects. Michael Irvin played 1988 to 1999 and nflverse
 * starts in 1999, so High Low showed his four game 1999 as his career: 167
 * receiving yards. Reported by a player. Every pre-1999 career that ran into
 * 1999 came out the same way. And keyed on the name, two men who share one
 * (nflverse has two Jerry Rices) were one career.
 *
 * Dropping is the honest answer: a legend with a hand-kept full total (stats.js,
 * or PRE1999 above) still plays, and one without is simply not in that
 * category rather than shown a number that is false. */
async function buildNFL(){
  const players = await loadPlayers();
  const career = {};   // gsis -> { col: total }
  const nameOf = {}, seasons = {};   // gsis -> display name, [years]
  let last = NFL_FIRST - 1;
  let lastSeasonIds = [];
  for (let y = NFL_FIRST; y < NFL_LAST_PROBE; y++){
    const txt = await fetchText(REL + y + '.csv');
    if (!txt){ if (y > 2020) break; else continue; }   // stop after the newest present
    last = y; lastSeasonIds = [];
    const lines = txt.split('\n');
    const H = parseLine(lines[0]); const ci = {}; H.forEach((h,i)=>ci[h]=i);
    for (let i=1;i<lines.length;i++){
      const ln = lines[i]; if(!ln) continue; const f = parseLine(ln);
      if (f[ci['season_type']] && f[ci['season_type']] !== 'REG') continue;
      const nm = f[ci['player_display_name']]; const pid = f[ci['player_id']];
      if(!nm || !pid) continue;
      if(!entBy['NFL|'+nk(nm)]) continue;                 // corpus names only
      nameOf[pid] = nm; (seasons[pid] || (seasons[pid] = [])).push(y);
      lastSeasonIds.push(pid);
      const rec = career[pid] || (career[pid] = {});
      for (const [col] of NFL_MAP){ const v = parseFloat(f[ci[col]]); if(!isNaN(v)) rec[col] = (rec[col]||0)+v; }
      let tk = 0, any=false; for (const c of TACKLE_COLS){ const v=parseFloat(f[ci[c]]); if(!isNaN(v)){ tk+=v; any=true; } }
      if (any) rec.tackles = (rec.tackles||0) + tk;
    }
    console.log('  NFL '+y+' merged');
  }
  // A career that started before NFL_FIRST is cut off. With no rookie season on
  // file, one first seen IN NFL_FIRST cannot be told apart, so it goes too.
  let cut = 0;
  const whole = pid => {
    const r = players[pid] && players[pid].rookie;
    if (r) return r >= NFL_FIRST;
    return Math.min.apply(null, seasons[pid]) > NFL_FIRST;
  };
  // One entity, one career. Namesakes are settled by POSITION first (the
  // Saints receiver Michael Thomas and the safety of the same name played the
  // same decade), then by which one played in the entity's own decades, then by
  // the longer career.
  //
  // Position is a FAMILY, not a code, and it is a preference rather than a
  // filter. nflverse files edge rushers as linebackers (Myles Garrett, Cameron
  // Jordan) where the corpus says defensive lineman, and a two-way player
  // (Travis Hunter) is a corner there and a receiver here. Filtering on the code
  // dropped all four; ranking on the family keeps them and still separates two
  // men of one name at different ends of the field.
  const FAMILY = { QB:'QB', RB:'SK', WR:'SK', TE:'SK', OL:'OL', DL:'FR', LB:'FR', DB:'DB', SPEC:'SP' };
  const ENT_FAMILY = { 'Quarterback':'QB', 'Running Back':'SK', 'Wide Receiver':'SK', 'Tight End':'SK',
    'Offensive Lineman':'OL', 'Center':'OL', 'Defensive Lineman':'FR', 'Linebacker':'FR',
    'Cornerback':'DB', 'Safety':'DB', 'Kicker':'SP', 'Punter':'SP' };
  const entById = {}; ENT.forEach(e => { entById[e.id] = e; });
  const pick = {};   // entity id -> gsis
  const fit = (pid, e) => { const ds = e.decade || []; return seasons[pid].filter(y => ds.indexOf(Math.floor(y/10)*10) >= 0).length; };
  const posOk = (pid, e) => { const want = ENT_FAMILY[e.pos], g = players[pid] && players[pid].group; const got = FAMILY[g]; return (!want || !got || want === got) ? 1 : 0; };
  const score = (pid, e) => [posOk(pid, e), fit(pid, e), seasons[pid].length];
  const better = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; };
  let namesakes = 0;
  for (const pid in career){
    const id = entBy['NFL|'+nk(nameOf[pid])];
    const e = entById[id];
    const prev = pick[id];
    if (prev == null) { pick[id] = pid; continue; }
    namesakes++;
    if (better(score(pid, e), score(prev, e))) pick[id] = pid;
  }
  console.log('  NFL namesakes set aside:', namesakes);
  const byEnt = {};
  for (const id in pick){ const pid = pick[id]; if (whole(pid)) byEnt[id] = career[pid]; else cut++; }
  console.log('  NFL careers cut off before '+NFL_FIRST+', dropped:', cut);
  lastSeasonIds.forEach(pid => { const id = entBy['NFL|'+nk(nameOf[pid])]; if (id && pick[id] === pid && byEnt[id]) activeIds[id] = 1; });
  // shape into stat categories
  const out = {};
  const defcat = (key,label,unit,col)=>{ const vals={}; for(const id in byEnt){ const v=byEnt[id][col]; if(v!=null && v>0) vals[id]=Math.round(v); } out[key]={label,unit,sport:'NFL',vals}; };
  for (const [col,key,label,unit] of NFL_MAP) defcat(key,label,unit,col);
  { const vals={}; for(const id in byEnt){ const v=byEnt[id].tackles; if(v!=null && v>0) vals[id]=Math.round(v); } out['nfl_tackles']={label:'tackles',unit:'tkl',sport:'NFL',vals}; }
  // The hand-kept full careers above. Only a career the drop cut off is
  // touched, and a whole one can never be overwritten by this table.
  let restored = 0;
  for (const slug in PRE1999){
    const id = 'nfl_' + slug;
    if (!entById[id]) throw new Error('PRE1999 names '+id+', which is not in the corpus');
    if (byEnt[id]) throw new Error('PRE1999 names '+id+', whose career nflverse already has whole');
    for (const k in PRE1999[slug]){ const v = PRE1999[slug][k]; if (!out['nfl_'+k]) throw new Error('PRE1999 category '+k+' does not exist'); if (v > 0) out['nfl_'+k].vals[id] = v; }
    restored++;
  }
  console.log('  NFL full careers restored by hand:', restored);
  return { cats: out, asof: last, pick };
}

// ---- NFL draft position (overall pick) from nflverse draft_picks ----
async function buildDraft(pick){
  const gsisToEnt = {}; for (const id in (pick||{})) gsisToEnt[pick[id]] = id;
  const txt = await fetchText('https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv');
  if (!txt) return { cats:{}, };
  const lines = txt.split('\n'); const H = parseLine(lines[0]); const ci={}; H.forEach((h,i)=>ci[h]=i);
  const vals = {}, locked = {};
  for (let i=1;i<lines.length;i++){ const ln=lines[i]; if(!ln) continue; const f=parseLine(ln);
    const nm = f[ci['pfr_player_name']]; const slot = parseInt(f[ci['pick']]); const gid = f[ci['gsis_id']];
    if(!nm || !slot) continue;
    // By the player id when this man is the one the stats chose, so the
    // Chiefs' Chris Jones is pick 37 and not the 2013 Chris Jones's 78. By name
    // only for a man with no stats row to settle it (a pre-1999 draftee, a
    // lineman), and then never over an id match.
    const byId = gid && gsisToEnt[gid];
    const id = byId || entBy['NFL|'+nk(nm)]; if(!id) continue;
    if (byId) { vals[id] = slot; locked[id] = 1; }
    else if (vals[id]==null && !locked[id] && !(pick && pick[id])) vals[id] = slot;
  }
  console.log('  NFL draft picks matched:', Object.keys(vals).length);
  return { cats: { nfl_draft: { label:'draft position', unit:'', sport:'NFL', lowbest:true, vals } } };
}

// ---- MLB: career WAR from the repo's baseball dataset ----
function buildMLB(){
  const bb = JSON.parse(fs.readFileSync(path.join(ROOT,'baseball/data/players.json'),'utf8'));
  const warByName = {}; let last = 0; const lastNames = {};
  bb.forEach(row => { const k = nk(row.n); warByName[k] = (warByName[k]||0) + (row.w||0); if(row.s>last){ last=row.s; } });
  bb.forEach(row => { if(row.s===last) lastNames[nk(row.n)] = 1; });   // players in the latest MLB season
  const vals = {};
  ENT.filter(e=>e.sport==='MLB').forEach(e=>{ const w = warByName[nk(e.name)]; if(w!=null){ vals[e.id] = Math.round(w*10)/10; if(lastNames[nk(e.name)]) activeIds[e.id]=1; } });
  return { cats: { mlb_war: { label:'career WAR', unit:'WAR', sport:'MLB', vals } }, asof: last };
}

const nfl = await buildNFL();
const draft = await buildDraft(nfl.pick);
const mlb = buildMLB();
const stats = Object.assign({}, nfl.cats, draft.cats, mlb.cats);

const payload = {
  updated: new Date().toISOString().slice(0,10),
  asof: { NFL: nfl.asof, MLB: mlb.asof },
  activeIds,                       // players present in their sport's latest season (drive the "* through {asof}" note)
  stats
};
console.log('active (in latest season):', Object.keys(activeIds).length);

// report
console.log('\nCategory coverage (corpus players):');
for (const k of Object.keys(stats)) console.log('  '+k.padEnd(14)+' '+Object.keys(stats[k].vals).length+'  ['+stats[k].label+']');
console.log('asof:', JSON.stringify(payload.asof));

const banner = '/* GENERATED by scripts/fetch-hlstats.mjs. Do not edit by hand.\n'+
  ' * Career stat totals for High Low: NFL via nflverse (offense+defense,\n'+
  ' * 1999-'+nfl.asof+'), MLB career WAR via baseball/data/players.json.\n'+
  ' * Keyed by grid/match/entities.js ids. Merged OVER stats.js in High Low;\n'+
  ' * NBA + pre-1999 NFL + retired-MLB counting stats still come from stats.js. */\n';
const js = banner + 'window.RTG_HLSTATS = ' + JSON.stringify(payload) + ';\n';
fs.writeFileSync(path.join(ROOT,'arcade/hlstats.js'), js);
console.log('\nwrote arcade/hlstats.js ('+(js.length/1024).toFixed(0)+' KB)');
