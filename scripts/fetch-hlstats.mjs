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

async function buildNFL(){
  const career = {};   // id -> { col: total }
  let last = NFL_FIRST - 1;
  let lastSeasonRows = [];
  for (let y = NFL_FIRST; y < NFL_LAST_PROBE; y++){
    const txt = await fetchText(REL + y + '.csv');
    if (!txt){ if (y > 2020) break; else continue; }   // stop after the newest present
    last = y; lastSeasonRows = [];
    const lines = txt.split('\n');
    const H = parseLine(lines[0]); const ci = {}; H.forEach((h,i)=>ci[h]=i);
    for (let i=1;i<lines.length;i++){
      const ln = lines[i]; if(!ln) continue; const f = parseLine(ln);
      if (f[ci['season_type']] && f[ci['season_type']] !== 'REG') continue;
      const nm = f[ci['player_display_name']]; if(!nm) continue;
      const id = entBy['NFL|'+nk(nm)]; if(!id) continue;    // corpus players only
      lastSeasonRows.push(id);
      const rec = career[id] || (career[id] = {});
      for (const [col] of NFL_MAP){ const v = parseFloat(f[ci[col]]); if(!isNaN(v)) rec[col] = (rec[col]||0)+v; }
      let tk = 0, any=false; for (const c of TACKLE_COLS){ const v=parseFloat(f[ci[c]]); if(!isNaN(v)){ tk+=v; any=true; } }
      if (any) rec.tackles = (rec.tackles||0) + tk;
    }
    console.log('  NFL '+y+' merged');
  }
  lastSeasonRows.forEach(id => { activeIds[id] = 1; });   // players in the latest NFL season
  // shape into stat categories
  const out = {};
  const defcat = (key,label,unit,col)=>{ const vals={}; for(const id in career){ const v=career[id][col]; if(v!=null && v>0) vals[id]=Math.round(v); } out[key]={label,unit,sport:'NFL',vals}; };
  for (const [col,key,label,unit] of NFL_MAP) defcat(key,label,unit,col);
  { const vals={}; for(const id in career){ const v=career[id].tackles; if(v!=null && v>0) vals[id]=Math.round(v); } out['nfl_tackles']={label:'tackles',unit:'tkl',sport:'NFL',vals}; }
  return { cats: out, asof: last };
}

// ---- NFL draft position (overall pick) from nflverse draft_picks ----
async function buildDraft(){
  const txt = await fetchText('https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv');
  if (!txt) return { cats:{}, };
  const lines = txt.split('\n'); const H = parseLine(lines[0]); const ci={}; H.forEach((h,i)=>ci[h]=i);
  const vals = {};
  for (let i=1;i<lines.length;i++){ const ln=lines[i]; if(!ln) continue; const f=parseLine(ln);
    const nm = f[ci['pfr_player_name']]; const pick = parseInt(f[ci['pick']]);
    if(!nm || !pick) continue; const id = entBy['NFL|'+nk(nm)]; if(!id) continue;
    if (vals[id]==null) vals[id] = pick;                 // first (only) draft slot
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
const draft = await buildDraft();
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
