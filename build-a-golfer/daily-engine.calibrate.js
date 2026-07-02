const E = require('./dailyEngine.js');
const data = require('/home/user/runthe-gg-site/build-a-golfer/courses.json');
const COURSES = Object.entries(data.courses).map(([k,c])=>({key:k,...c}));
const meanYPP = COURSES.reduce((s,c)=>s+c.yardage/c.par,0)/COURSES.length;
const KEYS=E.KEYS;

function flat(ovr){ const s={}; for(const k of KEYS) s[k]=ovr; return s; }
function fitBuild(ovr, course){ // flat + boost the course's top-3 rewarded skills
  const s=flat(ovr);
  const top=KEYS.filter(k=>k!=='clu').sort((a,b)=>course.fit[b]-course.fit[a]).slice(0,3);
  for(const k of top) s[k]=Math.min(99,ovr+8);
  return s;
}
const CW=Object.fromEntries(E.CATS.map(c=>[c.k,c.w]));
// build with skills tilted toward (sign +1) or away from (-1) the course, RENORMALIZED to exact overall=ovr
function tiltBuild(ovr, course, sign){
  const top=KEYS.filter(k=>k!=='clu').sort((a,b)=>course.fit[b]-course.fit[a]);
  const s={}; top.forEach((k,i)=>{ s[k]=ovr+sign*(i<3?10:i<5?2:-8); }); s.clu=ovr;
  // shift all so weighted overall == ovr
  let o=E.overall(s); const d=ovr-o; for(const k of KEYS) s[k]=Math.max(40,Math.min(99,s[k]+d));
  return s;
}
function stat(arr){ const a=[...arr].sort((x,y)=>x-y); const m=a.reduce((s,x)=>s+x,0)/a.length;
  const v=a.reduce((s,x)=>s+(x-m)*(x-m),0)/a.length; return {mean:+m.toFixed(2),sd:+Math.sqrt(v).toFixed(2),
  p10:a[Math.floor(.10*a.length)],p50:a[Math.floor(.5*a.length)],p90:a[Math.floor(.9*a.length)],best:a[0]}; }

const DAYS=400;
function rounds(course, skills, opts){ const out=[]; for(let d=1;d<=DAYS;d++){ out.push(E.simRoundDaily(course,skills,{...opts,daySeed:d*2654435761>>>0,courseKey:course.key,meanYPP}).total); } return out; }

// 1) round score by build strength (generic flat build, balanced/breezy), averaged across all courses
console.log('=== Round score by overall (flat build, balanced plan, breezy) — pooled over 16 courses ===');
for(const ovr of [78,80,82,84,86,88,90,92]){
  const all=[]; for(const c of COURSES) all.push(...rounds(c, flat(ovr), {plan:'balanced',cond:'breezy'}));
  const s=stat(all); console.log(`ovr ${ovr}:  mean ${s.mean>=0?'+':''}${s.mean}  sd ${s.sd}  p10 ${s.p10}  p50 ${s.p50}  p90 ${s.p90}  best ${s.best}`);
}

// 2) course difficulty spread (fixed ovr 86 flat, balanced breezy)
console.log('\n=== Course difficulty (ovr 86 flat, balanced, breezy) — mean round to par, sorted hard→easy ===');
const cs=COURSES.map(c=>({key:c.key,par:c.par,yd:c.yardage,...stat(rounds(c,flat(86),{plan:'balanced',cond:'breezy'}))}))
  .sort((a,b)=>b.mean-a.mean);
cs.forEach(c=>console.log(`  ${(c.mean>=0?'+':'')+c.mean}  (p50 ${c.p50}, best ${c.best})  ${c.key}  [par ${c.par}, ${c.yd}y]`));

// 3) fit reward — equal overall 86: course-MATCHED specialist vs MISMATCHED build (isolates fit, not ovr)
console.log('\n=== Fit reward (EQUAL overall 86): course-matched specialist vs mismatched, balanced/breezy ===');
let mAll=[], xAll=[];
for(const c of COURSES){ mAll.push(...rounds(c,tiltBuild(86,c,+1),{plan:'balanced',cond:'breezy'}));
  xAll.push(...rounds(c,tiltBuild(86,c,-1),{plan:'balanced',cond:'breezy'})); }
console.log(`  matched mean ${stat(mAll).mean}   mismatched mean ${stat(xAll).mean}   (both exactly overall 86)`);

// 4) outcome rates per round (ovr 86 flat, balanced/breezy, pooled)
console.log('\n=== Outcome rates per round (ovr 86 flat, balanced, breezy) ===');
{ const cnt={['-2']:0,['-1']:0,['0']:0,['1']:0,['2']:0,['3']:0}; let n=0;
  for(const c of COURSES){ for(let d=1;d<=200;d++){ const r=E.simRoundDaily(c,flat(86),{plan:'balanced',cond:'breezy',daySeed:d*40503>>>0,courseKey:c.key,meanYPP});
    r.holes.forEach(h=>cnt[String(h.toPar>3?3:h.toPar)]++); n++; } }
  const per=k=>(cnt[k]/n).toFixed(2);
  console.log(`  per round:  eagle ${per('-2')}  birdie ${per('-1')}  par ${per('0')}  bogey ${per('1')}  double ${per('2')}  triple+ ${per('3')}`); }

// 5) strategy effects (ovr 88 fitting-ish flat build at a fitting course = Augusta short-game build)
console.log('\n=== Strategy (ovr 88 build, Augusta) — plan mean/sd ===');
{ const aug=COURSES.find(c=>c.key==='Augusta National'); const b=fitBuild(88,aug);
  for(const plan of ['conservative','balanced','aggressive']){ const s=stat(rounds(aug,b,{plan,cond:'breezy'}));
    console.log(`  ${plan.padEnd(13)} mean ${s.mean>=0?'+':''}${s.mean}  sd ${s.sd}  best ${s.best}`); }
  // aggressive with a MISMATCHED (weak-for-course) build should blow up more
  const weak=E.KEYS.reduce((o,k)=>(o[k]=k==='dist'?96:74,o),{});  // bomber at a short-game course
  for(const plan of ['balanced','aggressive']){ const s=stat(rounds(aug,weak,{plan,cond:'breezy'}));
    console.log(`  MISMATCH bomber ${plan.padEnd(11)} mean ${s.mean>=0?'+':''}${s.mean}  sd ${s.sd}  p90 ${s.p90}`); }
}

// 6) conditions effect (ovr 86 flat, Augusta)
console.log('\n=== Conditions (ovr 86 flat, balanced, Augusta) ===');
{ const aug=COURSES.find(c=>c.key==='Augusta National');
  for(const cond of ['calm','breezy','windy','gusting']){ const s=stat(rounds(aug,flat(86),{plan:'balanced',cond}));
    console.log(`  ${cond.padEnd(8)} mean ${s.mean>=0?'+':''}${s.mean}  sd ${s.sd}`); } }
