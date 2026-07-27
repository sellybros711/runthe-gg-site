/* The Perfect Season, play one full run as readable text.
 *
 *   node football/playtest.js
 *   PS_SEED=7 PS_TEAM=NE node football/playtest.js
 *   PS_DAILY=2026-07-25 node football/playtest.js
 *
 * A stand-in for the UI: draft, chemistry, schedule, week-by-week results and
 * the outcome card, exactly the information the season page will show. Use it to
 * judge whether the game FEELS right, prices, wheel luck, score magnitudes,
 * before any of it is wired to a screen.
 *
 * The draft policy here maximizes points per dollar, which is deliberately a
 * MEDIOCRE strategy: because the price curve is convex, points-per-dollar is
 * always best at the cheap end, so this policy underspends badly and finishes
 * with money left over. That is worth seeing, it is the trap a real player
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
/* No franchise to pick: the schedule is 17 random historic team-seasons and the playoffs are a
   fixed ladder, so nothing in a run depends on a favourite club. */
console.log(`\n=== THE PERFECT SEASON, ${daily?'daily '+daily:'seed '+run.seed} ===`);
console.log(`cap $${E.CONSTANTS.CAP_MUSD}M | re-spins $${E.CONSTANTS.RESPIN_LADDER_MUSD.join('M then $')}M from cap, ${E.CONSTANTS.MAX_RESPINS} max`);
console.log(`playoffs at ${E.CONSTANTS.PLAYOFF_WINS} wins, first round off at ${E.CONSTANTS.BYE_SEED_WINS}\n`);

let slotNo=0;
while(run.phase===R.PHASES.DRAFT){
  slotNo++;
  const draw=R.spin(run,data);
  const opts=draw.options.map(k=>byKey.get(k));
  console.log(`SPIN ${slotNo}/6   open spots: ${R.openSlotNames(run).join(' ')}   (budget $${R.remaining(run).toFixed(1)}M, keep $${R.reserveFloor(run)}M back)`);
  console.log(`  year ${draw.season}  ->  ${draw.teamName}   (${opts.length} players you can sign)`);
  for(const p of opts.slice(0,5)) console.log(`     $${p.price_musd.toFixed(1).padStart(5)}M  ${p.position.padEnd(3)} -> ${E.SLOTS[R.slotForPlayer(run,p)].padEnd(4)} ${p.name.padEnd(22)} ${p.ppr_ppg_mean} ppg`);
  if(opts.length>5) console.log(`     ... ${opts.length-5} more`);
  // policy: best points per dollar that still leaves room, i.e. a sensible human
  const budget=R.remaining(run)-R.reserveFloor(run);
  const choice=opts.filter(p=>p.price_musd<=budget)
    .sort((a,b)=>(b.ppr_ppg_mean/Math.max(3,b.price_musd))-(a.ppr_ppg_mean/Math.max(3,a.price_musd)))[0];
  // Resolve the spot BEFORE signing: afterwards the roster has changed and
  // slotForPlayer would answer for the next empty spot, not the one he took.
  const took=E.SLOTS[R.slotForPlayer(run,choice)];
  R.sign(run,choice);
  console.log(`  -> SIGNED ${choice.name} into ${took} for $${choice.price_musd.toFixed(1)}M\n`);
}

const spent=run.roster.reduce((s,p)=>s+p.price_musd,0);
console.log('FINAL ROSTER');
run.roster.forEach((p,i)=>console.log(`  ${E.SLOTS[run.slotIndex[i]].padEnd(5)} $${p.price_musd.toFixed(1).padStart(5)}M  ${p.name.padEnd(22)} ${p.season} ${E.nickname(p.franchise)}  ${p.ppr_ppg_mean} ppg`));
console.log(`  spent $${spent.toFixed(1)}M + $${E.respinFees(run.respinsUsed)}M fees = $${(spent+E.respinFees(run.respinsUsed)).toFixed(1)}M of $${E.CONSTANTS.CAP_MUSD}M`);

R.startSeason(run,data,ctx);
const chem=run.season;
console.log(`\nCHEMISTRY  x${chem.chemistry.toFixed(3)}`);
if(!chem.chemistryLinks.length) console.log('  (no links, six strangers)');
for(const l of chem.chemistryLinks) console.log(`  ${l.value>0?'+':''}${(l.value*100).toFixed(0)}%  ${l.type.padEnd(12)} ${l.label}`);

console.log(`\nSCHEDULE (revealed after the draft)`);
const ids=run.schedule.concat(run.playoffs);
console.log('  '+run.schedule.map(id=>data.byTeamSeasonId[id].display.replace(/^(\d{4}) /,'$1 ')).join('\n  '));
console.log('  playoffs: '+run.playoffs.map(id=>data.byTeamSeasonId[id].display).join(' | '));

const cal=load('display_calibration.json');
console.log(`\nREGULAR SEASON`);
while(run.phase===R.PHASES.SEASON){
  const r=R.advanceWeek(run,data,leagueContext,cal);
  console.log(`  Week ${String(r.week).padStart(2)}  ${r.won?'W':'L'} ${String(r.shownYou).padStart(2)}-${String(r.shownThem).padStart(2)}  vs ${r.opponent}`);
}
console.log(`\n  final record ${run.season.wins}-${run.season.losses}`);
console.log(`  ${run.playoffSeed.label}${run.playoffSeed.made?', '+run.playoffSeed.rounds+' games to the title':''}`);

if(run.phase===R.PHASES.SEEDING){
  R.startPlayoffs(run);
  console.log(`\nPLAYOFFS`);
  while(run.phase===R.PHASES.PLAYOFFS){
    const r=R.advanceWeek(run,data,leagueContext,cal);
    console.log(`  ${r.round.padEnd(24)} ${r.won?'W':'L'} ${String(r.shownYou).padStart(2)}-${String(r.shownThem).padStart(2)}  vs ${r.opponent}`);
  }
}

const o=run.outcome;
console.log('');
if(o.perfect) console.log(`=== PERFECT SEASON. 20-0. ===`);
else if(o.titleWon) console.log(`=== CHAMPIONS. ${o.record}. ===`);
else if(o.eliminatedIn) console.log(`=== Out in the ${o.eliminatedIn}. ${o.record}. ===`);
else console.log(`=== Missed the playoffs. ${o.record}. ===`);
console.log(`regular season ${o.regularRecord}, ${o.seedLabel.toLowerCase()}\n`);
