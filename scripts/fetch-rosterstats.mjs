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
 *   NBA  basketball-reference - name->slug from the A-Z player indexes, then
 *        each player page's career-totals row (PTS/TRB/AST/STL/BLK/FG3).
 *        (stats.nba.com blocks GitHub Actions IPs, so bref is the CI source.)
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
// stats.nba.com blocks GitHub Actions datacenter IPs, so we scrape
// basketball-reference instead (the jersey job already does this from CI).
async function getText(url, tries=4){
  for(let i=0;i<tries;i++){
    try{ const r = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0 (compatible; runthe-arcade/1.0)' } });
      if(r.ok) return await r.text(); if(r.status===404) return null; if(r.status===429) await sleep(9000*(i+1)); }
    catch(e){}
    await sleep(1500*(i+1));
  }
  return null;
}
// bref hides most per-player tables inside HTML comments; strip them first.
function uncomment(h){ return String(h||'').replace(/<!--/g,'').replace(/-->/g,''); }
function cellNum(rowHtml, stat){
  const m = rowHtml.match(new RegExp('data-stat="'+stat+'"[^>]*>([\\s\\S]*?)</t[dh]>','i'));
  if(!m) return null; const v = parseInt(m[1].replace(/<[^>]*>/g,'').replace(/[^0-9-]/g,''),10);
  return isNaN(v) ? null : v;
}
async function buildNBA(){
  console.log('NBA: building name->slug index from basketball-reference...');
  const slugByName = {};
  for(const L of 'abcdefghijklmnopqrstuvwxyz'){
    const html = await getText('https://www.basketball-reference.com/players/'+L+'/');
    if(html){
      const re = /\/players\/[a-z]\/([a-z0-9]+)\.html">([^<]+)<\/a>/g; let m;
      while((m = re.exec(html))) { const k = nk(m[2]); if(!slugByName[k]) slugByName[k] = m[1]; }
    }
    await sleep(2500);
  }
  const targets = nbaEnt.filter(e=>slugByName[nk(e.name)]);
  console.log('  matched '+targets.length+'/'+nbaEnt.length+' NBA corpus players to bref');
  let n=0;
  for(const e of targets){
    const slug = slugByName[nk(e.name)];
    const page = await getText('https://www.basketball-reference.com/players/'+slug[0]+'/'+slug+'.html');
    if(page){
      const doc = uncomment(page);
      const tbl = doc.match(/<table[^>]*\bid="totals"[\s\S]*?<\/table>/i);
      if(tbl){
        // the career summary row (in tfoot): season cell reads "Career"
        const rows = tbl[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
        const career = rows.find(r=>/data-stat="season"[^>]*>\s*(<[^>]*>)*\s*Career/i.test(r));
        if(career){
          put('nba_points','career NBA points','pts','NBA',e.id,cellNum(career,'pts'));
          put('nba_rebounds','career NBA rebounds','reb','NBA',e.id,cellNum(career,'trb'));
          put('nba_assists','career NBA assists','ast','NBA',e.id,cellNum(career,'ast'));
          put('nba_steals','career NBA steals','stl','NBA',e.id,cellNum(career,'stl'));
          put('nba_blocks','career NBA blocks','blk','NBA',e.id,cellNum(career,'blk'));
          put('nba_threes','career 3-pointers made','3PM','NBA',e.id,cellNum(career,'fg3'));
          if(e.act===1) activeIds[e.id]=1;
        }
      }
    }
    if(++n % 20 === 0) console.log('  NBA '+n+'/'+targets.length);
    await sleep(3000);   // bref throttles ~20 req/min
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
