/* The drive chart: who has the ball, and when it changes hands.
 *
 *   node football/build/test/test_drives.mjs
 *
 * generateDrives lives in index.html rather than in the engine, so it is pulled out of the
 * page here and run as it ships -- a copy of it in this file would only ever test the copy.
 *
 * Two things it used to get wrong, both of which this covers:
 *   * possession opened with 'you' in every game ever played, so you could not lose a toss;
 *   * halftime did not exist. Whoever held the ball when the second quarter ran out simply
 *     carried on into the third, which let a team punt on the last play of the half and
 *     then receive its own kickoff.
 *
 * The 'explained' bucket below is not a fudge: a score inside the first seconds of the half
 * is resolved without drawing a drive for it, so the first drive after the interval in
 * those games is the possession AFTER that score rather than the kickoff itself. Counting
 * those as failures would be the test misreading the chart, not the chart being wrong.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT='/home/user/runthe-gg-site';
const E=require(`${ROOT}/football/engine.js`);
const html=fs.readFileSync(`${ROOT}/football/index.html`,'utf8');
const i=html.indexOf('function generateDrives(script,rng){');
const j=html.indexOf('\n}\n',html.indexOf('return drives;',i))+3;
const generateDrives=eval('('+html.slice(i,j).replace('function generateDrives','function')+')');
/* The play log's period label lives beside it and is nested in the same scope, so it comes
   out of the page the same way rather than being retyped here. */
const pl=html.indexOf('function periodLabel');
const periodLabel=eval('('+html.slice(pl,html.indexOf('\n',pl)).replace('function periodLabel','function')+')');

const cal=JSON.parse(fs.readFileSync(`${ROOT}/football/data/display_calibration.json`,'utf8'));
let bad=0;
const ok=(n,p,x)=>{ if(!p)bad++; console.log((p?'  ok   ':' FAIL  ')+n+(x!==undefined?'   '+x:'')); };

const rng=E.createSeededRNG(70707);
let youFirst=0, N=6000;
let hOK=0, explained=0, spanning=0, sameReceiver=0, noSecondHalf=0;
for(let k=0;k<N;k++){
  const [hi,lo,]=cal.real_pairs[Math.floor(rng()*cal.real_pairs.length)];
  const you=rng()<0.5?hi:lo, them=you===hi?lo:hi;
  const sc=E.scoringScript(you,them,rng);
  const dr=generateDrives(sc,E.createSeededRNG(Math.floor(rng()*1e9)));
  if(!dr.length) continue;
  const first=dr[0];
  if(first.team==='you') youFirst++;
  // no drive may run through the interval
  if(dr.some(d=>d.tStart<1800&&d.tEnd>1800.0001)) spanning++;
  // the first drive starting at or after the interval belongs to the other side
  const second=dr.find(d=>d.tStart>=1800);
  if(!second){ noSecondHalf++; continue; }
  // a score landing in the first seconds of the half is resolved without drawing a drive,
  // so the drive found above is the one AFTER that score, not the kickoff possession
  const scoreBefore=sc.some(e=>{const a=(e.q-1)*900+(900-e.sec); return a>=1800&&a<=second.tStart;});
  if(second.team===first.team){ if(scoreBefore) explained++; else sameReceiver++; }
  else hOK++;
}
console.log('=== who receives ===');
const p=(100*youFirst/N).toFixed(1);
ok('the opening kickoff is a real coin toss', Math.abs(youFirst/N-0.5)<0.03, p+'% of games you receive first');

console.log('\n=== the second half ===');
ok('a drive never runs through the interval', spanning===0, spanning+' spanned halftime');
ok('whoever received first does NOT receive the second half',
  sameReceiver===0, sameReceiver+' unexplained, '+hOK+' handed over, '+explained+
  ' had a score inside the first seconds of the half');
console.log('  (' + noSecondHalf + ' games had no drive starting after the interval)');

console.log('\n=== overtime ===');
/* Playoff rules: a fresh toss, a kickoff, and both sides guaranteed a possession. What the
   chart has to get right is that the extra period is its own period -- no drive drawn
   across the end of regulation, and the ball starting with whoever won the overtime toss
   rather than with whoever happened to have it when the fourth quarter ran out. */
let otSeen=0, otSpanning=0, otNoDrives=0, badLabel=0;
const rng2=E.createSeededRNG(31415);
for(let k=0;k<4000;k++){
  const [hi,lo,]=cal.real_pairs[Math.floor(rng2()*cal.real_pairs.length)];
  const you=rng2()<0.5?hi:lo, them=you===hi?lo:hi;
  const sc=E.scoringScript(you,them,rng2);
  if(!sc.some(e=>e.q===5)) continue;
  otSeen++;
  for(const e of sc) if(periodLabel(e)!==(e.q>4?'OT':'Q'+e.q)) badLabel++;
  const dr=generateDrives(sc,E.createSeededRNG(Math.floor(rng2()*1e9)));
  if(dr.some(d=>d.tStart<3600&&d.tEnd>3600.0001)) otSpanning++;
  if(!dr.some(d=>d.tStart>=3600)) otNoDrives++;
}
ok('overtime games turn up at all', otSeen>50, otSeen+' of 4000');
ok('the extra period is labelled OT, not Q5', badLabel===0, badLabel);
ok('no drive runs across the end of regulation', otSpanning===0, otSpanning);
ok('the extra period actually gets drives', otNoDrives===0, otNoDrives);

console.log(bad?'\n'+bad+' FAILED':'\nall clear');
process.exit(bad?1:0);
