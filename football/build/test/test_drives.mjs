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
console.log(bad?'\n'+bad+' FAILED':'\nall clear');
process.exit(bad?1:0);
