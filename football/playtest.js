/* The Perfect Season — play one full run as readable text.
 *
 *   node football/playtest.js
 *   PS_SEED=7 PS_TEAM=NE node football/playtest.js
 *   PS_DAILY=2026-07-25 node football/playtest.js
 *
 * A stand-in for the UI: draft, chemistry, schedule, week-by-week results and
 * the outcome card, exactly the information the season page will show. Use it to
 * judge whether the game FEELS right — prices, wheel luck, score magnitudes —
 * before any of it is wired to a screen.
 *
 * The draft policy here maximizes points per dollar, which is deliberately a
 * MEDIOCRE strategy: because the price curve is convex, points-per-dollar is
 * always best at the cheap end, so this policy underspends badly and finishes
 * with money left over. That is worth seeing — it is the trap a real player
 * falls into, and the reason the UI has to keep unspent budget in their face.
 */
'use strict';
const fs=require('fs'), path=require('path');
const E=require('./engine.js');
const R=require('./run.js');
const D=path.join(__dirname,'data');
const load=f=>JSON.parse(fs.readFileSync(path.join(D,f),'utf8'));
const players=load('player_seasons.json'), teamSeasons=load('team_seasons.json');
const leagueContext=load('league_context.json').league_avg_pts_allowed_by_season;
const ctx={battery:load('battery.json'),coaches:load('coaches.json'),curated:load('curated.json')};
const data=R.indexData(players,teamSeasons);
const byKey=new Map(players.map(p=>[`${p.player_id}|${p.season}`,p]));

const daily=process.env.PS_DAILY||null;
const run=R.createRun(daily?{daily}:{seed:Number(process.env.PS_SEED??20260725)});
const franchise=process.env.PS_TEAM||'BUF';
R.pickFranchise(run,franchise);

console.log(`\n=== THE PERFECT SEASON — ${daily?'daily '+daily:'seed '+run.seed} — you are ${franchise} ===`);
console.log(`cap $${E.CONSTANTS.CAP_MUSD}M | re-spin $${E.CONSTANTS.RESPIN_COST_MUSD}M from cap, ${E.CONSTANTS.MAX_RESPINS} max | ${E.CONSTANTS.LIVES} loss allowed\n`);

let slotNo=0;
while(run.phase===R.PHASES.DRAFT){
  slotNo++;
  const slot=R.currentSlot(run);
  const draw=R.spin(run,data);
  const opts=draw.options.map(k=>byKey.get(k));
  console.log(`SPIN ${slotNo}/6 — filling ${slot}   (budget $${R.remaining(run).toFixed(1)}M, must keep $${R.reserveFloor(run)}M for later slots)`);
  console.log(`  wheel landed on: ${draw.display}`);
  console.log(`  affordable ${slot} options:`);
  for(const p of opts.slice(0,4)) console.log(`     $${p.price_musd.toFixed(1).padStart(5)}M  ${p.position} ${p.name.padEnd(22)} ${p.ppr_ppg_mean} ppg (sd ${p.ppr_ppg_sd})`);
  if(opts.length>4) console.log(`     ... ${opts.length-4} more`);
  // policy: best points per dollar that still leaves room, i.e. a sensible human
  const budget=R.remaining(run)-R.reserveFloor(run);
  const choice=opts.filter(p=>p.price_musd<=budget)
    .sort((a,b)=>(b.ppr_ppg_mean/Math.max(3,b.price_musd))-(a.ppr_ppg_mean/Math.max(3,a.price_musd)))[0];
  R.sign(run,choice);
  console.log(`  -> SIGNED ${choice.name} (${choice.season} ${choice.team_display}) for $${choice.price_musd.toFixed(1)}M\n`);
}

const spent=run.roster.reduce((s,p)=>s+p.price_musd,0);
console.log('FINAL ROSTER');
run.roster.forEach((p,i)=>console.log(`  ${E.SLOTS[i].padEnd(5)} $${p.price_musd.toFixed(1).padStart(5)}M  ${p.name.padEnd(22)} ${p.season} ${p.team_display}  ${p.ppr_ppg_mean} ppg`));
console.log(`  spent $${spent.toFixed(1)}M + $${(run.respinsUsed*E.CONSTANTS.RESPIN_COST_MUSD)}M fees = $${(spent+run.respinsUsed*E.CONSTANTS.RESPIN_COST_MUSD).toFixed(1)}M of $100M`);

R.startSeason(run,data,ctx);
const chem=run.season;
console.log(`\nCHEMISTRY  x${chem.chemistry.toFixed(3)}`);
if(!chem.chemistryLinks.length) console.log('  (no links — six strangers)');
for(const l of chem.chemistryLinks) console.log(`  ${l.value>0?'+':''}${(l.value*100).toFixed(0)}%  ${l.type.padEnd(12)} ${l.label}`);

console.log(`\nSCHEDULE (revealed after the draft)`);
const ids=run.schedule.concat(run.playoffs);
console.log('  '+run.schedule.map(id=>data.byTeamSeasonId[id].display.replace(/^(\d{4}) /,'$1 ')).join('\n  '));
console.log('  playoffs: '+run.playoffs.map(id=>data.byTeamSeasonId[id].display).join(' | '));

console.log(`\nSEASON`);
while(run.phase===R.PHASES.SEASON){
  const r=R.advanceWeek(run,data,leagueContext);
  const tag=r.playoff?'PLAYOFF':'Week '+r.week;
  console.log(`  ${tag.padEnd(9)} ${r.won?'W':'L'} ${r.yourScore.toFixed(1).padStart(5)}-${r.oppScore.toFixed(1).padStart(5)}  vs ${r.opponent}`);
}
const o=run.outcome;
console.log(`\n=== ${o.perfect?'PERFECT SEASON — 20-0':(o.beatBenchmark?'BEAT THE PATRIOTS — '+o.record:'RUN OVER')} ===`);
const last=chem.results[chem.results.length-1];
console.log(o.perfect?`You did what the 2007 Patriots couldn't.`
  :o.beatBenchmark?`${o.record}. Better than 18-1, but not perfect.`
  :`Perfect through Week ${o.weekReached-1}. Lost ${last.yourScore.toFixed(0)}-${last.oppScore.toFixed(0)} to ${last.opponent}.`);
console.log(`record ${o.record}, reached week ${o.weekReached} of ${ids.length}\n`);
