/* TOUR TRACER IN 3D (golf/tracer3d.js). The course tile pxTerrainURL paints, given volume in the same
   pixel style as the golfers: the ground gets shape and light, and every tree, cactus, rock, dune and gorse
   bush is a small lit solid that casts its own shadow.

   IT DECIDES NOTHING. pxTerrainURL still lays the hole out and paints every surface its own colours; this
   only lifts what it painted into 3D and stands the scenery up. Where the scenery goes is the flat tile's
   own scatter, recorded rather than stamped (REC).

   THE BALL'S GROUND STAYS FLAT. The ball, the flag, the golfer and the tracer are drawn on top of this
   image at hvProj's flat positions. So nothing the ball can rest on is moved: the green, the fringe, the
   fairway, the first cut, the tee, the bunkers, the water and the rough near play keep a lift of zero and
   get their 3D from light alone (a crowned green, a bunker bowl, a raised tee). Only the land well away
   from play (LIFT_FROM pixels and more) actually rises, and that is where the scenery stands.

   IT IS FAST BECAUSE SCENERY IS STAMPED. A course draws a few hundred trees from a handful of shapes, so
   each shape (kind, size, one of four variants) is built once as a list of lit surface voxels and kept;
   a tree is then a stamp of that list into a z-buffer, recoloured per tree by slot. The template cache
   lives across tiles, so the second hole of a round builds almost nothing.

   The painter is its own rather than PXHD.Sprite.paint, for speed, but it is the same rules: the same
   light, the same five-step ramps (PXHD.ramp), the same tone thresholds, the same contact shadow and the
   same inner contour where a near object crosses a far one. */
(function(root){
'use strict';

const EL = 46*Math.PI/180, SE = Math.sin(EL), CE = Math.cos(EL);
const LIGHT = (()=>{ const v=[-.55,-.72,.72], l=Math.hypot(v[0],v[1],v[2]); return [v[0]/l,v[1]/l,v[2]/l]; })();
const camN = (nx,ny,nz)=>{ const v=[nx,-nz*CE+ny*SE,nz*SE+ny*CE], l=Math.hypot(v[0],v[1],v[2])||1; return [v[0]/l,v[1]/l,v[2]/l]; };
const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const D0 = dot(camN(0,0,1), LIGHT);
const GROUND_BIAS = 0.6 - D0;            // flat ground lands on the middle of its ramp
const OBJ_BIAS = GROUND_BIAS + 0.14;     // a canopy's top reads as lit, not as shade
const LS = [0.62, 0.5];                  // where a voxel's shadow lands, per unit of height (sun top-left)
const LIFT_FROM = 6, LIFT_FULL = 14;     // pixels from play before the land is allowed to rise
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const bay = (x,y)=>(BAYER[(y&3)*4+(x&3)]+0.5)/16;
const sm = (a,b,t)=>{ t=Math.max(0,Math.min(1,(t-a)/(b-a))); return t*t*(3-2*t); };
const toneOf = d=>d>0.80?3:d>0.40?2:d>0.08?1:0;
const clamp255 = v=>v<0?0:v>255?255:v|0;
const shadeRGB = (c,d)=>[clamp255(c[0]+d),clamp255(c[1]+d),clamp255(c[2]+d)];
const hexOf = c=>'#'+((1<<24)|(clamp255(c[0])<<16)|(clamp255(c[1])<<8)|clamp255(c[2])).toString(16).slice(1);
const rgbOf = h=>{ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; };

// ---- ramps, as RGB triples, shared across tiles
const RAMPS = [], RAMP_ID = new Map();
function rampId(rgb){ const h=hexOf(rgb); let id=RAMP_ID.get(h); if(id!=null) return id;
  const r=root.PXHD.ramp(h).map(rgbOf); id=RAMPS.length; RAMPS.push(r); RAMP_ID.set(h,id); return id; }

// tiny deterministic noise for the templates (they must not depend on where a tree stands)
function h3(a,b,c){ let h=(a*374761393+b*668265263+c*982451653)|0; h=Math.imul(h^h>>>13,1274126177); return ((h^h>>>16)>>>0)/4294967296; }
function vn(x,y,s){ const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=h3(xi,yi,s),b=h3(xi+1,yi,s),c=h3(xi,yi+1,s),d=h3(xi+1,yi+1,s); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }

/* ---- TEMPLATES. Built once and kept. fn(x,y,z) answers which slot fills a point (1 main, 2 trunk, 3 accent, 4 alt) or 0.
   Units are tile pixels, the ground at z=0, y toward the camera. */
const SHAPES = {
  broad(R,v){ const H=R*1.0, L=[[0,0,H+R*0.95,R]];
    for(let k=0;k<4;k++){ const a=k*1.57+v*0.9; L.push([Math.cos(a)*R*0.55,Math.sin(a)*R*0.45,H+R*(0.75+h3(v,k,3)*0.4),R*0.68]); }
    const tr=Math.max(0.6,R*0.16);
    return { box:[-R*1.7,R*1.7,-R*1.5,R*1.5,0,H+R*2.1], fn:(x,y,z)=>{
      if(z<H+R*0.3&&Math.hypot(x,y)<tr) return 2;
      for(const l of L){ const r=l[3]*(0.86+vn(x*0.9/Math.max(1,R/4)+v,y*0.9/Math.max(1,R/4)+z*0.7,7)*0.28); if(Math.hypot(x-l[0],y-l[1],z-l[2])<r) return 1; }
      return 0; } }; },
  pine(R,v,cyp){ const H=R*(cyp?3.2:2.7), Rb=R*(cyp?0.55:0.85), zt=R*0.45, tr=Math.max(0.6,R*0.14);
    return { box:[-Rb-1,Rb+1,-Rb-1,Rb+1,0,H+zt+1], fn:(x,y,z)=>{ const r=Math.hypot(x,y);
      if(z<zt+0.6) return r<tr?2:0; const h=(z-zt)/H; if(h>1) return 0;
      const tier=h*3.2, f=tier-Math.floor(tier), rad=Rb*(1-h)*(0.7+0.38*(1-f))*(0.92+vn(x/Math.max(1,R/4)+v,z*0.8/Math.max(1,R/4),3)*0.16);
      return r<rad?(f>0.62?4:1):0; } }; },
  saguaro(R,v){ const r=Math.max(0.7,R*0.2), H=R*1.8;
    return { box:[-R,R,-r-0.5,r+0.5,0,H+1], fn:(x,y,z)=>{ if(Math.hypot(x,y)<r&&z<H) return 1;
      for(const s of[-1,1]){ const ax=s*R*(0.5+0.2*h3(v,s+2,5)), az=H*(s<0?0.45:0.55);
        if(Math.abs(y)<r*0.9&&((Math.hypot(x-ax,y)<r*0.85&&z>az&&z<az+H*0.32)||(Math.abs(z-az)<r*0.85&&x*s>0&&x*s<Math.abs(ax)))) return 1; }
      return 0; } }; },
  palm(R,v){ const H=R*2.3, lean=(h3(v,1,9)-0.5)*R*0.9, tr=Math.max(0.55,R*0.13);
    const F=[]; for(let k=0;k<7;k++){ const a=k/7*6.283+v; F.push([Math.cos(a),Math.sin(a)*0.8]); }
    return { box:[-R*1.7,R*1.7,-R*1.4,R*1.4,0,H+R*0.6], fn:(x,y,z)=>{ const t=z/H;
      if(t<=1&&Math.hypot(x-lean*t*t,y)<tr) return 2;
      const dx=x-lean, dz=z-H; if(Math.hypot(dx,y,dz)<R*0.25) return 4;
      for(const f of F){ const al=dx*f[0]+y*f[1]; if(al<0||al>R*1.5) continue;
        const off=Math.hypot(dx-f[0]*al,y-f[1]*al), sag=R*0.2-al*al/(R*2.4);
        if(Math.abs(dz-sag)<Math.max(0.6,R*0.12)&&off<R*0.3*(1-al/(R*1.7))) return al>R*0.8?1:4; }
      return 0; } }; },
  lump(R,v,wx,hz,zc){ // rocks, dunes, gorse, scrub, bushes: a lumpy blob
    return { box:[-R*wx,R*wx,-R,R,0,R*hz*2], fn:(x,y,z)=>{
      const r=R*(0.86+vn(x*1.2/Math.max(1,R/3)+v,y*1.2/Math.max(1,R/3)+z,11)*0.28);
      return Math.hypot(x/wx,y,(z-R*zc)/hz)<r ? (h3(Math.round(x*2),Math.round(z*2)+v*31,13)<0.16?3:1) : 0; } }; },
  tuft(R,v){ return { box:[-R,R,-0.6,0.6,0,R*2.2], fn:(x,y,z)=>{ if(Math.abs(y)>0.45) return 0;
      for(let b=-1;b<=1;b++) if(Math.abs(x-b*z*0.35-b*0.4)<0.45) return z>R*1.6?3:1; return 0; } }; },
};
const TPL = new Map();
// the neighbourhood a normal is read from: the 3x3x3 shell plus the six axis points two out. Wide enough that a
// canopy is lit as a shape rather than as speckle, a fifth of the cost of the full 5x5x5.
const NB = (()=>{ const a=[]; for(let k=-1;k<=1;k++)for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++) if(i||j||k) a.push(i,j,k);
  a.push(2,0,0,-2,0,0,0,2,0,0,-2,0,0,0,2,0,0,-2); return a; })();
function template(kind, R, v){
  const key=kind+'|'+R+'|'+v; let t=TPL.get(key); if(t) return t;
  if(TPL.size>600) TPL.clear();
  let S;
  switch(kind){
    case 'pine': S=SHAPES.pine(R,v,false); break;
    case 'cypress': S=SHAPES.pine(R,v,true); break;
    case 'saguaro': S=SHAPES.saguaro(R,v); break;
    case 'palm': S=SHAPES.palm(R,v); break;
    case 'rock': S=SHAPES.lump(R,v,1.15,0.7,0.0); break;
    case 'dune': S=SHAPES.lump(R,v,1.3,0.45,0.0); break;
    case 'gorse': S=SHAPES.lump(R,v,1,0.85,0.4); break;
    case 'scrub': S=SHAPES.lump(R,v,1,0.85,0.4); break;
    case 'bush': S=SHAPES.lump(R,v,1,0.75,0.35); break;
    case 'flower': S=SHAPES.lump(R,v,1,0.7,0.3); { const f0=S.fn; S.fn=(x,y,z)=>{ const c=f0(x,y,z); return c&&z>R*0.55?3:c; }; } break;   // blooms on top, leaves under
    case 'tuft': S=SHAPES.tuft(R,v); break;
    default: S=SHAPES.broad(R,v);
  }
  // a fixed number of voxels across a shape whatever its size; a voxel wider than a pixel is stamped as a block
  const [x0,x1,y0,y1,z0,z1]=S.box, span=Math.max(x1-x0,z1-z0), st=Math.max(0.6, span/32), blk=Math.max(1,Math.ceil(st));
  const nx=Math.ceil((x1-x0)/st)+1, ny=Math.ceil((y1-y0)/st)+1, nz=Math.ceil((z1-z0)/st)+1, A=new Uint8Array(nx*ny*nz);
  const id=(i,j,k)=>(k*ny+j)*nx+i, occ=(i,j,k)=>(i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz&&A[id(i,j,k)])?1:0;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++) A[id(i,j,k)]=S.fn(x0+i*st,y0+j*st,z0+k*st);
  const ox=[],oy=[],od=[],sl=[],tn=[], sh=new Set();
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){ const c=A[id(i,j,k)]; if(!c) continue;
    const lx=x0+i*st, ly=y0+j*st, lz=z0+k*st;
    sh.add(Math.round(lx+lz*LS[0])+','+Math.round((ly+lz*LS[1])*SE));
    if(occ(i,j+1,k)&&occ(i,j,k+1)&&occ(i-1,j,k)&&occ(i+1,j,k)&&occ(i,j-1,k)) continue;   // hidden from the camera
    let gx=0,gy=0,gz=0; for(let q=0;q<NB.length;q+=3){ const di=NB[q],dj=NB[q+1],dk=NB[q+2]; if(occ(i+di,j+dj,k+dk)) continue; gx+=di; gy+=dj; gz+=dk; }
    const n=camN(gx,gy,gz||0.0001);
    ox.push(lx); oy.push(ly*SE-lz*CE); od.push(ly*CE+lz*SE); sl.push(c); tn.push(toneOf(dot(n,LIGHT)+OBJ_BIAS));
  }
  const shadow=[]; sh.forEach(s=>{ const p=s.split(','); shadow.push(+p[0],+p[1]); });
  // FLATTENED: a shape is opaque, so only its front-most voxel in each screen pixel can ever be seen, and if
  // that one loses the depth test every voxel behind it does too. Keeping one entry per pixel makes a
  // stamp cost the tree's silhouette rather than its surface, which is what makes the close-up affordable.
  const best=new Map();
  for(let k=0;k<ox.length;k++){ const sx0=Math.floor(ox[k]+0.5), sy0=Math.floor(oy[k]+0.5);
    for(let by=0;by<blk;by++)for(let bx=0;bx<blk;bx++){ const key=(sx0+bx)*4096+(sy0+by); const b=best.get(key); if(!b||od[k]>b[0]) best.set(key,[od[k],sl[k],tn[k],sx0+bx,sy0+by]); } }
  const fx=[],fy=[],fd=[],fs=[],ft=[]; best.forEach(b=>{ fd.push(b[0]); fs.push(b[1]); ft.push(b[2]); fx.push(b[3]); fy.push(b[4]); });
  t={ fx:Int16Array.from(fx), fy:Int16Array.from(fy), fd:Float32Array.from(fd), fs:Uint8Array.from(fs), ft:Int8Array.from(ft), shadow };
  TPL.set(key,t); return t;
}

/* ---- render(o): o carries pxTerrainURL's locals. It paints the finished tile into o.ctx (GW x GH). */
function render(o){
  const {GW,GH,T,XY,DIST,D,REC,os,seed,B,ID,links,desert,wooded,C,P,pickK,hvHash,vnoise,ctx}=o;
  const {RO,DE,FW,GR,FR,SA,WA,TE,OC,FC}=ID;
  // the ramp cache is trimmed BETWEEN tiles, never during one: a tile holds ramp ids from its first stamp to its
  // last pixel, and a clear in the middle hands the compose step ids that point at nothing
  if(RAMPS.length>3000){ RAMPS.length=0; RAMP_ID.clear(); }
  const HEAD=Math.round(26*os), SH=GH+HEAD, N=GW*SH;
  // distance inside each surface to its edge (bowls, crowns, plateaus)
  const DI=new Uint8Array(GW*GH);
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){ const i=y*GW+x,t=T[i]; const a=x>0&&T[i-1]===t?DI[i-1]:0, b=y>0&&T[i-GW]===t?DI[i-GW]:0; DI[i]=Math.min(a,b)+1; }
  for(let y=GH-1;y>=0;y--)for(let x=GW-1;x>=0;x--){ const i=y*GW+x,t=T[i]; const a=x<GW-1&&T[i+1]===t?DI[i+1]:0, b=y<GH-1&&T[i+GW]===t?DI[i+GW]:0; DI[i]=Math.min(DI[i],Math.min(a,b)+1); }
  // ---- RELIEF (what the light reads) and LIFT (what actually moves on screen)
  const HR=new Float32Array(GW*GH), LF=new Float32Array(GW*GH);
  for(let cy=0;cy<GH;cy++)for(let cx=0;cx<GW;cx++){ const i=cy*GW+cx, t=T[i], x=XY[i*2], y=XY[i*2+1];
    const n=vnoise(x*0.045+3,y*0.03+5), n2=vnoise(x*0.12+9,y*0.09+1), d=Math.min(DIST[i],60)/os;
    let z=0;
    if(t===RO||t===DE){ const rise=Math.min(1,d/5);
      z = links ? ((n-0.45)*4.5+(n2-0.5)*2.2)*rise
        : desert ? ((n-0.45)*2.6+(n2-0.5)*1.0)*rise+Math.min(d,12)*0.06
        : (n-0.45)*3.6*rise+(n2-0.5)*1.0+Math.min(d,14)*0.12; }
    else if(t===FC) z=(n-0.5)*0.6;
    else if(t===FW) z=(n-0.5)*0.7;
    else if(t===TE) z=1.2;
    else if(t===GR) z=0.5+2.4*sm(0,13,DI[i]/os)+(n2-0.5)*0.8;   // a crowned green with a little roll in it: light only, it never moves
    else if(t===FR) z=0.35*sm(0,3,DI[i]/os);
    else if(t===SA) z=-Math.min(DI[i]/os,3.2)*0.8;
    else if(t===WA) z=-0.5;
    else if(t===OC) z=-1.5;
    HR[i]=z*os;
    LF[i]=(t===RO||t===DE)?z*os*sm(LIFT_FROM,LIFT_FULL,d):(t===OC?-2.2*os:0);
  }
  { const tmp=new Float32Array(HR); for(let pass=0;pass<2;pass++){ for(let cy=1;cy<GH-1;cy++)for(let cx=1;cx<GW-1;cx++){ const i=cy*GW+cx,t=T[i]; if(t!==RO&&t!==DE&&t!==FC) continue;
      let s=0,c=0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ const j=i+dy*GW+dx, tj=T[j]; if(tj===RO||tj===DE||tj===FC||tj===FW){ s+=HR[j]; c++; } }
      tmp[i]=s/c; if(t!==FC) LF[i]=LF[i]===0?0:tmp[i]*sm(LIFT_FROM,LIFT_FULL,Math.min(DIST[i],60)/os); }
    HR.set(tmp); } }
  // the green's dome is read off a block distance to its edge, which has creases along its diagonals; a box blur
  // sized to the tile's pixel scale (two passes each way) rounds them off. Light only: nothing here moves.
  { const r=Math.max(1,Math.round(2.5*os)), on=i=>T[i]===GR||T[i]===FR, tmp=new Float32Array(HR);
    for(let pass=0;pass<2;pass++){
      for(let y=0;y<GH;y++){ for(let x=0;x<GW;x++){ const i=y*GW+x; if(!on(i)) continue; let sum=0,c=0; for(let k=-r;k<=r;k++){ const xx=x+k; if(xx<0||xx>=GW) continue; const j=i+k; if(on(j)){ sum+=HR[j]; c++; } } tmp[i]=sum/c; } }
      for(let y=0;y<GH;y++){ for(let x=0;x<GW;x++){ const i=y*GW+x; if(!on(i)) continue; let sum=0,c=0; for(let k=-r;k<=r;k++){ const yy=y+k; if(yy<0||yy>=GH) continue; const j=i+k*GW; if(on(j)){ sum+=tmp[j]; c++; } } HR[i]=sum/c; } } } }
  if(o.oceanSide){   // a coast ends in a cliff (or a beach), not a slope
    for(let cy=0;cy<GH;cy++)for(let cx=0;cx<GW;cx++){ const i=cy*GW+cx; if(T[i]!==RO&&T[i]!==DE) continue;
      const vy=(cy+0.5)/GH*o.cam[3]+o.cam[1], vx=(cx+0.5)/GW*o.cam[2]+o.cam[0], inland=o.oceanSide>0?o.oedge(vy)-vx:vx-o.oedge(vy);
      if(inland<14*os&&DIST[i]>=LIFT_FROM*os){ const c=(o.oBeach?1.0:3.5)*os*(1-inland/(14*os)); HR[i]=Math.max(HR[i],c); LF[i]=Math.max(LF[i],c); } } }
  const lfAt=(x,y)=>LF[(y<0?0:y>=GH?GH-1:y)*GW+(x<0?0:x>=GW?GW-1:x)];
  const hrAt=(x,y)=>HR[(y<0?0:y>=GH?GH-1:y)*GW+(x<0?0:x>=GW?GW-1:x)];
  // ---- buffers
  const ZB=new Float32Array(N).fill(-1e9), RID=new Int32Array(N).fill(-1), TON=new Int8Array(N), OBJ=new Int32Array(N).fill(-1), COL=new Uint32Array(N), SOFT=new Uint8Array(N);
  const SHD=new Uint8Array(GW*GH);
  // ---- scenery: pick each recorded spot's kind, size and colours exactly as the flat tile would have
  const pk=(a,t)=>a[(hvHash(seed,t*7,6)*a.length)|0];
  let obj=0;
  // soft scenery (fescue, gorse, dune, scrub, links and desert bushes) only takes the lit half of its ramp, so
  // it reads as the light flecks the flat tile drew rather than a field of dark dots
  const stamp=(tp,px,py,ramps,soft,shadow)=>{
    const zg=lfAt(px,py), base=Math.round(py+HEAD-zg*CE), dep=py/SE*CE+zg*SE, me=obj++;
    if(shadow){ const s=tp.shadow; for(let k=0;k<s.length;k+=2){ const sx=px+s[k], sy=py+s[k+1]; if(sx>=0&&sy>=0&&sx<GW&&sy<GH) SHD[sy*GW+sx]=1; } }
    const {fx,fy,fd,fs,ft}=tp;
    for(let k=0;k<fx.length;k++){ const sx=px+fx[k], sy=base+fy[k]; if(sx<0||sy<0||sx>=GW||sy>=SH) continue; const j=sy*GW+sx, D2=dep+fd[k];
      if(D2<=ZB[j]) continue; ZB[j]=D2; RID[j]=ramps[fs[k]-1]; TON[j]=soft?Math.max(2,ft[k]):ft[k]; OBJ[j]=me; SOFT[j]=soft?1:0; }
  };
  const LIFT=12, rr=c=>rampId(shadeRGB(c,LIFT));
  const trunkR=rr(P.trunk);
  for(let q=0;q<REC.length;q++){ const rec=REC[q], bush=rec[0]===1, px=rec[1], py=rec[2], tries=rec[3];
    const v=tries&3;
    if(bush){ const base=wooded?pk(P.tg,tries):pk(P.dune,tries), c=rr(shadeRGB(base,Math.round((vnoise(px*0.05,py*0.05)-0.5)*20)));
      const R=Math.round((wooded?1.9:1.1)*os*2)/2; stamp(template('bush',R,v),px,py,[c,c,c,c],!wooded,wooded); continue; }
    const kind=pickK(hvHash(seed,tries,5)), tvar=Math.round((vnoise(px*0.035+7,py*0.035)-0.5)*4)*6;
    const baseR=(hvHash(seed,tries*13,14)<0.08?6:3)+((hvHash(seed,tries*5,8)*3)|0), R0=Math.max(2.4,baseR*0.92*os);
    // sizes snap to a 15% ladder, so a course (and the zoomed close-up) shares a few dozen shapes instead of hundreds
    const Rq=f=>{ const r=Math.max(1,R0*f); return r<4?Math.round(r*2)/2:+Math.pow(1.15,Math.round(Math.log(r)/Math.log(1.15))).toFixed(2); };
    if(kind==='fescue'){ if(vnoise(px*0.03+3,py*0.03+40)<0.58) continue; const a=rr(shadeRGB(C.roughL,-6)), b=rr(shadeRGB(C.roughL,10));
      stamp(template('tuft',Math.max(1.2,1.5*os),v),px,py,[a,a,b,a],true,false); continue; }
    if(kind==='flower'){ if(vnoise(px*0.032+80,py*0.032+15)<0.66) continue; const f=rr(pk(P.flower,tries)), l=rr(pk(P.tg,tries));
      stamp(template('flower',Math.max(1,Math.round(1.4*os*2)/2),v),px,py,[l,l,f,l],true,false); continue; }
    if(kind==='pine'||kind==='cypress'){ const c=pk(P.pine,tries); stamp(template(kind,Rq(1),v),px,py,[rr(shadeRGB(c,tvar)),trunkR,rr(c),rr(shadeRGB(c,tvar-14))],false,true); continue; }
    if(kind==='saguaro'){ const c=rr(pk(P.cact,tries)); stamp(template('saguaro',Rq(1),v),px,py,[c,c,c,c],false,true); continue; }
    if(kind==='palm'){ const c=pk(P.cact,tries); stamp(template('palm',Rq(1),v),px,py,[rr(c),trunkR,rr(c),rr(shadeRGB(c,-12))],false,true); continue; }
    if(kind==='rock'){ const c=rr(rgbOf(B.rockA||'#c46536')); stamp(template('rock',Rq(0.55),v),px,py,[c,c,c,c],false,true); continue; }
    // links and desert scenery stays small and soft, the way the flat tile drew it: flecks, not boulders
    if(kind==='dune'){ const c=pk(P.dune,tries); stamp(template('dune',Rq(0.7),v),px,py,[rr(c),rr(c),rr(shadeRGB(c,14)),rr(c)],true,false); continue; }
    if(kind==='gorse'){ const g=rr(P.gorse[0]), y=rr(P.gorse[1]); stamp(template('gorse',Rq(0.36),v),px,py,[g,g,y,g],true,false); continue; }
    if(kind==='barrel'||kind==='scrub'||kind==='ocotillo'){ const c=rr(pk(P.cact,tries)); stamp(template('scrub',Rq(0.34),v),px,py,[c,c,c,c],true,false); continue; }
    const isA=hvHash(seed,tries*11,7)<(B.autumnP||0.12), c=shadeRGB(isA?pk(P.autumn,tries):pk(P.tg,tries),tvar);
    stamp(template('broad',Rq(1),v),px,py,[rr(c),trunkR,rr(c),rr(c)],false,true);
  }
  // ---- the ground: each pixel at its lift, lit by its relief, with a face wherever it drops
  for(let cy=0;cy<GH;cy++)for(let cx=0;cx<GW;cx++){ const i=cy*GW+cx, t=T[i], lf=LF[i], o4=i*4;
    const zx=(hrAt(cx+1,cy)-hrAt(cx-1,cy))/2, zy=(hrAt(cx,cy+1)-hrAt(cx,cy-1))/2*SE;
    const gn=t===GR?1.4+1.8*Math.min(1,(os-1)/3):t===FR?1.4+1.0*Math.min(1,(os-1)/3):t===FW||t===FC||t===TE?1.8:1.3;   // play surfaces never move, so their shape is all in the light: turned up there, most of all on the putting close-up
    const nn=camN(-zx*gn/os,-zy*gn/os,1), d=dot(nn,LIGHT)+GROUND_BIAS;
    const k=Math.max(0.5,Math.min(1.4,1+(d-0.6)*1.1)), kq=Math.floor(k/0.07+bay(cx,cy))*0.07;
    const sh=SHD[i]&&t!==OC&&t!==WA, f=sh?kq*0.84:kq;
    const r=clamp255(D[o4]*f), g=clamp255(D[o4+1]*f*(sh?1.02:1)), b=clamp255(D[o4+2]*f*(sh?1.12:1)), col=(r<<16)|(g<<8)|b;
    const sy=Math.round(cy-lf*CE+HEAD), dep=cy/SE*CE+lf*SE;
    const put=(y,dd,c)=>{ if(y<0||y>=SH) return; const j=y*GW+cx; if(dd<=ZB[j]) return; ZB[j]=dd; RID[j]=-1; OBJ[j]=-1; COL[j]=c; };
    if(cy===0) for(let y=HEAD-2;y<sy;y++) put(y,dep-0.02,col);
    put(sy,dep,col);
    const ln=cy<GH-1?lfAt(cx,cy+1):lf, sn=cy<GH-1?Math.round(cy+1-ln*CE+HEAD):SH, fc=(lf-ln>0.5*os)?(((r*0.66)|0)<<16)|(((g*0.66)|0)<<8)|((b*0.74)|0):col;
    for(let y=sy+1;y<sn;y++){ const tt=(y-sy)/(sn-sy); put(y,(cy+tt)/SE*CE+(lf+(ln-lf)*tt)*SE-0.01,fc); }
  }
  // ---- contact shadow and inner contour on the scenery, then compose
  const img=ctx.createImageData(GW,GH), out=img.data;
  for(let y=HEAD;y<SH;y++)for(let x=0;x<GW;x++){ const j=y*GW+x, oi=((y-HEAD)*GW+x)*4; let rgb;
    const rid=RID[j];
    if(rid<0){ const c=COL[j]; rgb=[(c>>16)&255,(c>>8)&255,c&255]; }
    else { let tn=TON[j]; const me=OBJ[j];
      if(!SOFT[j]){
        const up=j-GW; if(y>0&&OBJ[up]>=0&&OBJ[up]!==me&&ZB[up]>ZB[j]) tn=Math.max(0,tn-1);
        for(const n of [j+GW,j+1,j-1]){ if(n<0||n>=N) continue; if(OBJ[n]!==me&&ZB[n]<ZB[j]){ tn=Math.min(tn,1); break; } } }
      rgb=RAMPS[rid][tn]; }
    out[oi]=rgb[0]; out[oi+1]=rgb[1]; out[oi+2]=rgb[2]; out[oi+3]=255; }
  ctx.putImageData(img,0,0);
  if(root.__T3D_PROBE) root.__T3D_PROBE.push({GW,GH,os,LF,T:T.slice(),DIST:DIST.slice(),ID,REC:REC.length});   // golf/check-tracer3d.mjs reads what moved
  return true;
}

window.RTT_T3D = { API_VERSION: 1, render, EL };   // the page pins API_VERSION as T3D_API
})(window);
