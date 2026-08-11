/* GENERATOR for arcade/rosterstats.js (window.RTG_ROSTERSTATS).
 *
 * WHY: High Low's NBA and MLB counting-stat pools were tiny because they came
 * from the hand-curated, retired-only stats.js. This fills a career stat line
 * for EVERY NBA and MLB player already in the recognizable corpus, so each
 * category jumps into the low hundreds - active players included.
 *
 * SCOPE: corpus players only (arcade/match/entities.js), matched by NAME+sport,
 * so we never introduce a player the games don't already show. NFL already comes
 * from nflverse via fetch-hlstats.mjs, so this job only does NBA + MLB.
 *
 * SOURCES (reachable from CI; BOTH blocked in the dev sandbox):
 *   NBA  stats.nba.com - commonallplayers (name->id) then playercareerstats
 *        (career regular-season PTS/REB/AST/STL/BLK/FG3M). JSON, needs the
 *        standard stats.nba.com headers.
 *   MLB  statsapi.mlb.com - people search (name->id) then people/{id}/stats
 *        career hitting (HR/H/RBI/SB) and pitching (W/SO).
 *
 * OUTPUT shape mirrors hlstats.js so High Low merges it the same way:
 *   window.RTG_ROSTERSTATS = { updated, asof:{NBA,MLB}, activeIds:{}, stats:{ key:{label,unit,sport,vals:{id:val}} } }
 *
 * HOW TO RUN:  node scripts/fetch-rosterstats.mjs   (needs open network)
 * Run by .github/workflows/arcade-stats.yml. Fails soft: any player/source it
 * can't reach is simply skipped, and it prints a coverage report at the end.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YEAR = new Date().getFullYear();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function nk(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]/g,''); }

// ---- corpus ----
const cg = {};
new Function('self','module', readFileSync(path.join(ROOT,'arcade/match/entities.js'),'utf8'))(cg,{});
const ENT = cg.GRID_ENTITIES || [];
const nbaEnt = ENT.filter(e=>e.sport==='NBA');
const mlbEnt = ENT.filter(e=>e.sport==='MLB');
const nbaByName = {}; nbaEnt.forEach(e=>{ nbaByName[nk(e.name)] = e; });
const mlbByName = {}; mlbEnt.forEach(e=>{ mlbByName[nk(e.name)] = e; });

async function getJSON(url, headers, tries=3){
  for(let i=0;i<tries;i++){
    try{ const r = await fetch(url, { headers }); if(r.ok) return await r.json(); if(r.status===404) return null;
      if(r.status===429) await sleep(6000*(i+1)); }
    catch(e){}
    await sleep(700*(i+1));
  }
  return null;
}

const stats = {};   // key -> { label, unit, sport, vals:{} }
const activeIds = {};
function put(key, label, unit, sport, id, val){
  if(val==null || isNaN(val)) return;
  (stats[key] || (stats[key] = { label, unit, sport, vals:{} })).vals[id] = Math.round(val);
}

// ------------------------------- NBA -----------------------------------
const NBA_H = { 'User-Agent':'Mozilla/5.0 (compatible; runthe-arcade/1.0)', 'Referer':'https://www.nba.com/',
  'Origin':'https://www.nba.com', 'Accept':'application/json, text/plain, */*',
  'x-nba-stats-origin':'stats', 'x-nba-stats-token':'true', 'Accept-Language':'en-US,en;q=0.9' };
function rsRows(json, name){ // pull a named resultSet as array-of-objects
  if(!json || !json.resultSets) return [];
  const set = json.resultSets.find(s=>s.name===name) || json.resultSets[0];
  if(!set) return []; const h = set.headers;
  return set.rowSet.map(r=>{ const o={}; h.forEach((k,i)=>o[k]=r[i]); return o; });
}
async function buildNBA(){
  console.log('NBA: fetching player index...');
  const idx = await getJSON('https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season='+ (YEAR-1) +'-'+String(YEAR).slice(2)+'&IsOnlyCurrentSeason=0', NBA_H);
  const players = rsRows(idx, 'CommonAllPlayers');
  if(!players.length){ console.log('  NBA index unreachable - skipping NBA'); return; }
  const byName = {}; players.forEach(p=>{ byName[nk(p.DISPLAY_FIRST_LAST)] = p; });
  const targets = nbaEnt.filter(e=>byName[nk(e.name)]);
  console.log('  matched '+targets.length+'/'+nbaEnt.length+' NBA corpus players to stats.nba.com');
  let n=0;
  for(const e of targets){
    const p = byName[nk(e.name)]; const pid = p.PERSON_ID;
    const car = await getJSON('https://stats.nba.com/stats/playercareerstats?PlayerID='+pid+'&PerMode=Totals', NBA_H);
    const tot = rsRows(car, 'CareerTotalsRegularSeason')[0];
    if(tot){
      put('nba_points','career NBA points','pts','NBA',e.id,tot.PTS);
      put('nba_rebounds','career NBA rebounds','reb','NBA',e.id,tot.REB);
      put('nba_assists','career NBA assists','ast','NBA',e.id,tot.AST);
      put('nba_steals','career NBA steals','stl','NBA',e.id,tot.STL);
      put('nba_blocks','career NBA blocks','blk','NBA',e.id,tot.BLK);
      put('nba_threes','career 3-pointers made','3PM','NBA',e.id,tot.FG3M);
      if(e.act===1) activeIds[e.id]=1;
    }
    if(++n % 25 === 0) console.log('  NBA '+n+'/'+targets.length);
    await sleep(600);   // be polite to stats.nba.com
  }
}

// ------------------------------- MLB -----------------------------------
const MLB_H = { 'User-Agent':'runthe-arcade/1.0' };
async function mlbId(name){
  for(const param of ['names','q']){
    const j = await getJSON('https://statsapi.mlb.com/api/v1/people/search?'+param+'='+encodeURIComponent(name), MLB_H, 2);
    const ppl = j && (j.people||j.results||[]);
    if(ppl && ppl.length){ const hit = ppl.find(p=>nk(p.fullName)===nk(name)) || ppl[0]; if(hit && hit.id) return hit.id; }
  }
  return null;
}
async function buildMLB(){
  console.log('MLB: resolving '+mlbEnt.length+' corpus players via statsapi...');
  let n=0, matched=0;
  for(const e of mlbEnt){
    const id = await mlbId(e.name);
    if(id){
      matched++;
      const hit = await getJSON('https://statsapi.mlb.com/api/v1/people/'+id+'/stats?stats=career&group=hitting', MLB_H, 2);
      const hs = hit && hit.stats && hit.stats[0] && hit.stats[0].splits && hit.stats[0].splits[0] && hit.stats[0].splits[0].stat;
      if(hs){ put('mlb_hr','career home runs','HR','MLB',e.id,hs.homeRuns); put('mlb_hits','career hits','H','MLB',e.id,hs.hits);
        put('mlb_rbi','career RBIs','RBI','MLB',e.id,hs.rbi); put('mlb_sb','career stolen bases','SB','MLB',e.id,hs.stolenBases); }
      const pit = await getJSON('https://statsapi.mlb.com/api/v1/people/'+id+'/stats?stats=career&group=pitching', MLB_H, 2);
      const ps = pit && pit.stats && pit.stats[0] && pit.stats[0].splits && pit.stats[0].splits[0] && pit.stats[0].splits[0].stat;
      if(ps){ put('mlb_wins','career pitcher wins','W','MLB',e.id,ps.wins); put('mlb_strikeouts','career pitcher strikeouts','K','MLB',e.id,ps.strikeOuts); }
      if(e.act===1) activeIds[e.id]=1;
    }
    if(++n % 30 === 0) console.log('  MLB '+n+'/'+mlbEnt.length+' ('+matched+' matched)');
    await sleep(120);
  }
  console.log('  MLB matched '+matched+'/'+mlbEnt.length);
}

// ------------------------------- run -----------------------------------
try { await buildNBA(); } catch(e){ console.error('NBA failed:', e.message); }
try { await buildMLB(); } catch(e){ console.error('MLB failed:', e.message); }

const payload = { updated: new Date().toISOString().slice(0,10), asof:{ NBA: YEAR, MLB: YEAR }, activeIds, stats };
const banner = '/* GENERATED by scripts/fetch-rosterstats.mjs. Do not edit by hand.\n'+
  ' * Career NBA (stats.nba.com) + MLB (statsapi) counting stats for every\n'+
  ' * corpus player. Merged OVER stats.js/hlstats.js inside High Low only. */\n';
writeFileSync(path.join(ROOT,'arcade/rosterstats.js'), banner+'window.RTG_ROSTERSTATS = '+JSON.stringify(payload)+';\n');

console.log('\nCoverage (players per category):');
Object.keys(stats).sort().forEach(k=>console.log('  '+k.padEnd(16)+Object.keys(stats[k].vals).length));
console.log('active:', Object.keys(activeIds).length, '| wrote arcade/rosterstats.js');
