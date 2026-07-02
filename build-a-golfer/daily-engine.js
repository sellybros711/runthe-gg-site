// RunTheTour Daily Challenge — hole-by-hole round engine (Phase 1, headless).
// Pure module: (course, skills{dist,acc,app,sht,scr,bnk,put,clu}, opts) -> 18-hole round.
// Anchored to the season model (SIM.reg base 0.91, sigma 2.80, SKILLSLOPE 0.238) so daily
// scores feel consistent with career mode, then layered with per-hole skill texture +
// strategy (game plan, signature attack) + conditions.

const CATS = [
  {k:'dist',w:0.11},{k:'acc',w:0.12},{k:'app',w:0.21},{k:'sht',w:0.10},
  {k:'scr',w:0.08},{k:'bnk',w:0.06},{k:'put',w:0.19},{k:'clu',w:0.13},
];
const KEYS = CATS.map(c=>c.k);

// ---- tunable config (calibrated in Phase 1) ----
const CFG = {
  SCORE_SHIFT: -0.06,     // per-hole baseline nudge — daily plays a touch more rewarding than the season anchor
  SLOPE_H: 0.019,         // per-hole skill slope (tuned so a round ≈ season skill sensitivity ~0.238/ovr pt)
  COURSE_DIFF_SCALE: 0.045,// per-hole mu per (yards-per-par-stroke) above the set mean
  COURSE_DIFF_CLAMP: 0.22,
  SHAPE_SCALE: 1.5,       // amplifies hole-archetype scoring shape (par-5 easier, long par-4 harder)
  FIT_POWER: 4.0,         // sharpens course-fit tilt of hole weights → drafting for the course matters more
  LATENT_S: 0.92,         // per-hole latent sd
  // latent thresholds in z (lower = better) → real PGA hole frequencies at mu=0:
  // eagle ~0.4% / birdie ~18% / par ~62% / bogey ~15% / double ~2.6% / triple+ ~1.4%
  TH: { eagle:-2.65, birdie:-0.90, par:0.856, bogey:1.68, double:2.20 },
  PLAN: {            // game plan: mean nudge + latent-sd multiplier
    conservative:{mean:+0.10, sd:0.85},
    balanced:    {mean: 0.00, sd:1.00},
    aggressive:  {mean:+0.07, sd:1.30},   // wider tails; fit-bonus added separately
  },
  AGG_FIT_BONUS: 0.014,    // aggressive/attack: per skill-pt the hole's key skill exceeds 80, mean improves
  COND: {            // daily conditions: mean + sd + skill-weight tilt (mult on dist/acc/app)
    calm:   {mean:-0.06, sd:0.96, tilt:{dist:1.00,acc:1.00,app:1.00}},
    breezy: {mean: 0.00, sd:1.00, tilt:{dist:1.00,acc:1.05,app:1.03}},
    windy:  {mean:+0.11, sd:1.08, tilt:{dist:0.90,acc:1.18,app:1.12}},
    gusting:{mean:+0.21, sd:1.16, tilt:{dist:0.84,acc:1.26,app:1.18}},
  },
};

// ---- per-hole skill-weight templates (unnormalized; clu present everywhere) ----
const TPL = {
  p3s:{dist:0.02,acc:0.05,app:0.42,sht:0.14,scr:0.10,bnk:0.07,put:0.26,clu:0.08}, // short par 3
  p3m:{dist:0.08,acc:0.06,app:0.42,sht:0.11,scr:0.10,bnk:0.06,put:0.24,clu:0.08},
  p3l:{dist:0.15,acc:0.08,app:0.40,sht:0.08,scr:0.10,bnk:0.06,put:0.22,clu:0.08}, // long par 3
  p4d:{dist:0.28,acc:0.06,app:0.14,sht:0.16,scr:0.12,bnk:0.05,put:0.18,clu:0.08}, // drivable par 4
  p4m:{dist:0.14,acc:0.16,app:0.28,sht:0.08,scr:0.06,bnk:0.04,put:0.22,clu:0.08},
  p4l:{dist:0.22,acc:0.14,app:0.28,sht:0.06,scr:0.06,bnk:0.04,put:0.20,clu:0.08}, // long par 4
  p5r:{dist:0.28,acc:0.07,app:0.20,sht:0.10,scr:0.07,bnk:0.05,put:0.22,clu:0.08}, // reachable par 5
  p5m:{dist:0.24,acc:0.10,app:0.23,sht:0.09,scr:0.06,bnk:0.04,put:0.21,clu:0.08},
  p5l:{dist:0.20,acc:0.14,app:0.26,sht:0.08,scr:0.06,bnk:0.04,put:0.20,clu:0.08}, // long par 5
};
// raw archetype difficulty (expected to-par shape for an eff-80 player, before course shift)
const DRAW = { p3s:-0.02,p3m:0.06,p3l:0.18, p4d:-0.12,p4m:0.04,p4l:0.22, p5r:-0.28,p5m:-0.18,p5l:-0.08 };

function holeArch(h){
  if(h.par===3) return h.yards<175?'p3s':(h.yards>=215?'p3l':'p3m');
  if(h.par===4) return h.yards<=335?'p4d':(h.yards>=460?'p4l':'p4m');
  return h.yards<=565?'p5r':(h.yards>=600?'p5l':'p5m');
}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gauss(rng){let u=0,v=0;while(!u)u=rng();while(!v)v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

// normalized per-hole weights with course fit + condition tilt applied
function holeWeights(h, fit, cond){
  const tpl=TPL[holeArch(h)]; const tilt=cond?cond.tilt:null; let sum=0; const w={};
  for(const k of KEYS){ let v=tpl[k]*(fit?Math.pow(fit[k],CFG.FIT_POWER):1); if(tilt&&tilt[k]) v*=tilt[k]; w[k]=v; sum+=v; }
  for(const k of KEYS) w[k]/=sum;
  return w;
}
function effForHole(skills, w){ let e=0; for(const k of KEYS) e+=skills[k]*w[k]; return e; }
function overall(skills){ let e=0; for(const c of CATS) e+=skills[c.k]*c.w; return e; }

// per-hole course difficulty add (length-per-par-stroke vs set mean; flag: replace with DataGolf scoring avg)
function courseDiff(course, meanYPP){
  const ypp=course.yardage/course.par;
  return Math.max(-CFG.COURSE_DIFF_CLAMP, Math.min(CFG.COURSE_DIFF_CLAMP, (ypp-meanYPP)*CFG.COURSE_DIFF_SCALE));
}
// per-hole baseline mu for an eff-80 player: archetype scoring SHAPE (recentered to 0 across the round so
// the course's overall difficulty rides only on courseDiff) + the per-hole course difficulty.
// The tour-average +~1/round bias is intrinsic to the discrete outcome distribution at mu=0.
function holeBaseDiffs(course, meanYPP){
  const raw=course.holes.map(h=>DRAW[holeArch(h)]);
  const mean=raw.reduce((s,x)=>s+x,0)/18;
  const cd=courseDiff(course, meanYPP);
  return raw.map(x=>CFG.SHAPE_SCALE*(x-mean)+cd);
}

// one hole → {toPar, label}
function simHole(h, baseDiff, skills, fit, cond, plan, attack, rng){
  const w=holeWeights(h, fit, cond);
  const eff=effForHole(skills, w);
  const planK = attack ? CFG.PLAN.aggressive : CFG.PLAN[plan];
  const safeK = (attack===false) ? CFG.PLAN.conservative : null;   // signature "play safe"
  const K = safeK || planK;
  let mu = CFG.SCORE_SHIFT + baseDiff - (eff-80)*CFG.SLOPE_H + K.mean + (cond?cond.mean:0);
  // aggressive / attack: extra reward when the hole's key skill is strong (fit-aware gamble)
  if((attack===true) || (attack==null && plan==='aggressive')) mu -= Math.max(0, eff-80)*CFG.AGG_FIT_BONUS;
  let sd = CFG.LATENT_S * K.sd * (cond?cond.sd:1);
  const z = mu + gauss(rng)*sd;
  let d;
  const T=CFG.TH;
  if(z<T.eagle) d=-2; else if(z<T.birdie) d=-1; else if(z<T.par) d=0; else if(z<T.bogey) d=1; else if(z<T.double) d=2; else d=3;
  // par 3 can't make a 2-better-than-par (ace ~never) → cap eagle to birdie
  if(h.par===3 && d===-2) d=-1;
  return {toPar:d};
}

// full round. opts: {plan, cond, attacks:{holeN:true/false}, daySeed, courseKey, meanYPP}
function simRoundDaily(course, skills, opts){
  const meanYPP=opts.meanYPP;
  const cond = opts.cond ? CFG.COND[opts.cond] : CFG.COND.breezy;
  const plan = opts.plan || 'balanced';
  const diffs=holeBaseDiffs(course, meanYPP);
  const chash=hashStr(opts.courseKey||course.venue||'');
  let total=0; const holes=[];
  for(let i=0;i<18;i++){
    const h=course.holes[i];
    const rng=mulberry32(((opts.daySeed||0) ^ chash ^ (Math.imul(i+1,0x9e3779b1))) >>> 0);
    const attack = opts.attacks && (h.n in opts.attacks) ? opts.attacks[h.n] : null;
    const r=simHole(h, diffs[i], skills, course.fit, cond, plan, attack, rng);
    total+=r.toPar; holes.push({n:h.n,par:h.par,toPar:r.toPar,strokes:h.par+r.toPar});
  }
  return {total, holes};
}

module.exports = { CFG, CATS, KEYS, overall, simRoundDaily, holeWeights, holeBaseDiffs, courseDiff, holeArch };
