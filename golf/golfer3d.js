/* The course golfer, in the profile golfer's own style (Run The Tour).

   The tracer used to play a shot with small hand-drawn sprites: 24 by 26, four facings, and an older set
   for lefties. This draws the same shot from a small posed 3D model of the player's golfer instead, and
   hands every cell to the profile renderer's own paint step (PXHD in index.html). So the light, the five
   step colour ramps, the contact shadows, the inner contours and the soft outline in the part's own
   shadow colour are exactly the profile picture's. The model only decides WHAT is in each cell and which
   way that surface faces.

   One model gives every aim, both hands and every swing frame:
     full  address (A), top (B), impact (D), finish (C)
     chip  address, a short top, impact, a short finish
     putt  address, take back, through
   The golfer stands side-on to the line like a real golfer. A righty's lead shoulder points down it.

   It is a tester preview. index.html asks g3dOn() and falls back to the old sprites otherwise.
   Nothing here decides anything about a shot. */
(function(){
  if(typeof PXHD==='undefined'||!PXHD.Sprite) return;   // a page whose renderer does not export the parts
  const PQ=PXHD, GW=64, GH=80, OX=32, OY=58;
  const V=(x,y,z)=>[x,y,z], add=(...v)=>v.reduce((a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]), sc=(a,k)=>[a[0]*k,a[1]*k,a[2]*k],
    sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
    cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    norm=a=>{const l=Math.hypot(...a)||1;return sc(a,1/l)}, D2R=Math.PI/180,
    rot=(v,axis,ang)=>{axis=norm(axis);const c=Math.cos(ang),s=Math.sin(ang);return add(sc(v,c),sc(cross(axis,v),s),sc(axis,dot(axis,v)*(1-c)))},
    rotAbout=(p,o,axis,ang)=>add(o,rot(sub(p,o),axis,ang));
  let ce=Math.cos(26*D2R), se=Math.sin(26*D2R);
  const setEl=d=>{ce=Math.cos(d*D2R);se=Math.sin(d*D2R)};
  const cam=p=>[p[0],-p[1]*ce+p[2]*se,p[1]*se+p[2]*ce], camv=cam;
  const ellipsoid=(c,ax,r,mat,o)=>({k:'e',c:cam(c),u:ax.map(camv),r,mat,o:o||{}});
  const capsule=(a,b,r,mat,o)=>({k:'c',a:cam(a),b:cam(b),r,mat,o:o||{}});
  function hitE(P,x,y){ const d=[x-P.c[0],y-P.c[1],1000-P.c[2]], dir=[0,0,-1];
    const lo=P.u.map((u,i)=>dot(d,u)/P.r[i]), ld=P.u.map((u,i)=>dot(dir,u)/P.r[i]);
    const A=dot(ld,ld),B=2*dot(lo,ld),C=dot(lo,lo)-1,disc=B*B-4*A*C; if(disc<0) return null;
    for(const t of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)]){ const l=add(lo,sc(ld,t)); if(P.o.cut&&!P.o.cut(l)) continue;
      let n=[0,0,0]; for(let i=0;i<3;i++) n=add(n,sc(P.u[i],l[i]/P.r[i])); return {D:1000-t,n:norm(n)}; }
    return null; }
  function hitC(P,x,y){ const ax=P.b[0]-P.a[0],ay=P.b[1]-P.a[1],L=ax*ax+ay*ay; let best=null;
    const tryAt=t=>{ const q=[P.a[0]+t*(P.b[0]-P.a[0]),P.a[1]+t*ay,P.a[2]+t*(P.b[2]-P.a[2])]; q[1]=P.a[1]+t*ay;
      const dx=x-q[0],dy=y-q[1],d2=dx*dx+dy*dy; if(d2>P.r*P.r) return; const dz=Math.sqrt(P.r*P.r-d2);
      const h={D:q[2]+dz,n:[dx/P.r,dy/P.r,dz/P.r]}; if(!best||h.D>best.D) best=h; };
    tryAt(Math.max(0,Math.min(1,L>1e-6?((x-P.a[0])*ax+(y-P.a[1])*ay)/L:.5))); tryAt(0); tryAt(1); return best; }

  // the poses. phi: arms round the swing plane (+ is away from the target). hinge: wrists. turn: shoulders.
  const POSES={
    A:{phi:0,hinge:0,turn:0,hip:0,head:0,heel:0}, B:{phi:100,hinge:88,turn:78,hip:32,head:0,heel:0},
    D:{phi:-4,hinge:0,turn:-14,hip:-28,head:0,heel:.3}, C:{phi:-128,hinge:-82,turn:-92,hip:-62,head:62,heel:1},
    chipB:{phi:52,hinge:28,turn:26,hip:10,head:0,heel:0}, chipC:{phi:-58,hinge:-18,turn:-34,hip:-20,head:18,heel:.2},
    pA:{phi:0,hinge:0,turn:0,hip:0,head:0,heel:0}, pB:{phi:17,hinge:0,turn:0,hip:0,head:0,heel:0}, pC:{phi:-14,hinge:0,turn:0,hip:0,head:8,heel:0} };
  const CLUBS={ putter:{hand:[4.6,-10.6],head:[7.4,-25.0],len:'putter'}, driver:{hand:[6.6,-9.6],head:[16.5,-24.6],len:'driver'}, iron:{hand:[6.0,-10],head:[13.2,-24.8],len:'iron'} };

  function model(aimV,lefty,kind,pose){
    const U=V(0,1,0), T=norm(aimV);
    const F=lefty?norm(cross(U,T)):norm(cross(T,U));   // the chest. A righty's lead shoulder points down the line.
    const P=(f,u,t)=>add(sc(F,f),sc(U,u),sc(T,t));
    const parts=[]; const push=p=>parts.push(p);
    const club=kind==='putt'?CLUBS.putter:kind==='chip'?CLUBS.iron:CLUBS.driver;
    const lean=(kind==='putt'?22:28)*D2R, spine=norm(add(sc(F,Math.sin(lean)),sc(U,Math.cos(lean))));
    // a turn moves the chest away from the target: pick the sign that does
    const sgn=dot(rot(F,U,0.1),T)<0?1:-1, turnA=a=>a*D2R*sgn;
    // legs, hips, shoes
    const hipC=P(-1.2,15.2,0), hipAx=a=>rot(a,U,turnA(pose.hip));
    for(const s of [1,-1]){ const lead=s>0, l=(kind==='putt'?3.9:4.8)*s;
      const heel=lead?0:pose.heel; const ank=add(P(0.4,3.2+heel*1.8,l),sc(T,heel*1.6));
      push(capsule(rotAbout(P(-1,14,l*0.95),hipC,U,turnA(pose.hip)),ank,2.7,'pants'));
      push(ellipsoid(add(P(1.4,1.5+heel*1.2,l),sc(T,heel*1.4)),[F,U,T],[4.6,1.7,2.5],'shoe',{gloss:2,bias:.15})); }
    push(ellipsoid(hipC,[hipAx(F),U,hipAx(T)],[4.8,4.2,7.2],'pants'));
    push(ellipsoid(add(hipC,P(0.6,2.4,0)),[hipAx(F),spine,hipAx(T)],[5.3,1.15,7.7],'belt',{gloss:1}));
    // the torso turns about the spine
    const tc=P(1.2,23,0), tr=v=>rot(v,spine,turnA(pose.turn)), tp=p=>rotAbout(p,tc,spine,turnA(pose.turn));
    push(ellipsoid(tc,[tr(F),spine,tr(T)],[5.6,7.6,8.3],'shirt'));
    push(capsule(tp(P(3.2,28.8,0)),tp(P(4.2,30.4,0)),2.6,'skin',{dt:-1}));
    push(ellipsoid(tp(P(3.0,28.6,0)),[tr(F),spine,tr(T)],[3.6,1.3,4.3],'shirt',{dt:1}));
    // the swing plane holds the address club and the target line
    const piv=tp(P(3.4,26.4,0));
    const hand0=P(club.hand[0],club.hand[1]+26.4,0), head0=P(club.head[0],club.head[1]+26.4,0);
    let ax=norm(cross(sub(head0,hand0),T)); if(dot(rot(sub(head0,hand0),ax,0.1),T)>dot(sub(head0,hand0),T)) ax=sc(ax,-1);
    const handsW=rotAbout(rotAbout(P(club.hand[0]+3.4-3.4,club.hand[1]+26.4,0),P(3.4,26.4,0),ax,pose.phi*D2R),tc,spine,turnA(pose.turn)*0.35);
    const cvec=rot(rot(sub(head0,hand0),ax,(pose.phi+pose.hinge)*D2R),spine,turnA(pose.turn)*0.35);
    const head=add(handsW,cvec), cdir=norm(cvec);
    for(const s of [1,-1]){ const sh=tp(P(2.2,27.6,6.6*s)); const toH=sub(handsW,sh);
      const elb=add(sh,sc(toH,.5),sc(norm(cross(toH,spine)),-1.0*s));
      push(capsule(sh,elb,2.6,'shirt')); push(capsule(elb,add(handsW,sc(cdir,-1.2*s)),1.75,'skin')); }
    push(ellipsoid(add(handsW,sc(cdir,-1.0)),[F,U,T],[2.4,2.4,2.4],'glove'));
    push(ellipsoid(add(handsW,sc(cdir,1.2)),[F,U,T],[2.1,2.1,2.1],'skin'));
    push(capsule(add(handsW,sc(cdir,-2.6)),add(handsW,sc(cdir,3.6)),0.95,'x:#26262e'));
    push(capsule(add(handsW,sc(cdir,3.6)),head,0.6,'x:#c4ccd4',{gloss:2}));
    const face=norm(rot(T,ax,(pose.phi+pose.hinge)*D2R));
    if(kind==='putt') push(capsule(add(head,sc(face,1.9)),add(head,sc(face,-1.9)),1.15,'x:#5a636e',{gloss:2}));
    else if(kind==='chip') push(ellipsoid(head,[face,cdir,norm(cross(face,cdir))],[0.9,1.6,2.6],'x:#b8c0c8',{gloss:2}));
    else push(ellipsoid(head,[face,cdir,norm(cross(face,cdir))],[2.2,1.8,3.2],'x:#2a2f3b',{gloss:2}));
    // head
    const hc=tp(P(kind==='putt'?6.2:5.4,34.2,0));
    let gaze=norm(add(sc(F,.72),sc(U,kind==='putt'?-.69:-.6)));
    if(pose.head) gaze=norm(rot(gaze,U,-turnA(pose.head)));
    if(pose.head>30) gaze=norm(add(gaze,sc(U,.55)));
    const hup=norm(cross(cross(gaze,U),gaze)), side=norm(cross(hup,gaze)), hr=8.3;
    push(ellipsoid(hc,[gaze,hup,side],[hr,hr*1.04,hr*0.98],'skin',{bias:.06}));
    for(const s of [1,-1]) push(ellipsoid(add(hc,sc(side,hr*0.95*s),sc(gaze,-0.6)),[gaze,hup,side],[1.4,1.9,1.2],'skin'));
    const ballR=1.8;
    const head0Ball=add(head0,sc(T,kind==='putt'?4.3:kind==='chip'?3.3:5.0),sc(U,kind==='putt'?0.6:0));
    return {parts,hc,look:gaze,hup,Lf:side,hr,F,U,T,ball:head0Ball};
  }

  function hairHat(M,L){ const {hc,look,hup,Lf,hr,F,U}=M; const out=[];
    const style=L.hairStyle||'short', capOn=L.cap!==false, hatStyle=capOn?(L.hatStyle||'cap'):'';
    const visor=hatStyle==='visor', cap=capOn&&!visor;
    const big=style==='afro'?1.32:style==='curly'?1.08:style==='buzz'?1.0:1.03;
    out.push(ellipsoid(hc,[look,hup,Lf],[hr*big,hr*big*1.02,hr*big],'hair',{gloss:1,bias:-.08,cut:l=>l[0]<0.22+(cap?0:0.15)&&(cap?l[1]<0.1:true)&&!(l[0]>-0.3&&l[1]<-0.3)}));
    if(style==='long'||style==='mullet') out.push(capsule(add(hc,sc(F,-hr*0.75),sc(U,hr*0.1)),add(hc,sc(F,-hr*0.95),sc(U,-hr*(style==='long'?1.35:0.85))),hr*(style==='long'?0.7:0.55),'hair',{gloss:1}));
    if(style==='ponytail') out.push(capsule(add(hc,sc(F,-hr*1.12),sc(U,hr*0.45)),add(hc,sc(F,-hr*1.3),sc(U,-hr*0.8)),2.2,'hair',{gloss:1}));
    if(style==='topknot') out.push(ellipsoid(add(hc,sc(F,-hr*0.4),sc(U,hr*0.95)),[F,U,Lf],[2.8,2.6,2.8],'hair',{gloss:1}));
    if(style==='mohawk'&&!cap) out.push(ellipsoid(add(hc,sc(hup,hr*0.9)),[look,hup,Lf],[hr*0.9,2.6,1.6],'hair',{gloss:1}));
    if(cap){ out.push(ellipsoid(add(hc,sc(hup,hr*0.18)),[look,hup,Lf],[hr*1.06,hr*0.95,hr*1.06],'hat',{cut:l=>l[1]>-0.12}));
      out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.02)),[look,hup,Lf],[hr*0.75,0.75,hr*0.82],'hat',{dt:-1,cut:l=>l[0]>-0.15}));
      out.push(ellipsoid(add(hc,sc(hup,hr*1.1)),[look,hup,Lf],[1.1,0.8,1.1],'hatbtn'));
      out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.48)),[look,hup,Lf],[0.6,1.5,2.0],'patch',{t:2})); }
    if(visor){ out.push(ellipsoid(add(hc,sc(hup,hr*0.3)),[look,hup,Lf],[hr*1.04,1.1,hr*1.04],'hat'));
      out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.2)),[look,hup,Lf],[hr*0.75,0.75,hr*0.82],'hat',{dt:-1,cut:l=>l[0]>-0.15})); }
    return out; }


  // eyewear lenses and a novelty hat need no 3D shape of their own: the lenses sit on the eyes, and the
  // hat is the standing art, stamped on the head the way the old swing sprites stamped it.
  function stampHat(ctx,px,map,pal,cx,brow,headW){
    const SCX=22, SBROW=12, SHW=16, k=headW/SHW;
    let t=99,b=-1,l=99,r=-1;
    for(let y=0;y<map.length;y++){ const rw=map[y]; for(let x=0;x<rw.length;x++){ const c=rw[x]; if(c!=='.'&&c!==' '){ if(y<t)t=y; if(y>b)b=y; if(x<l)l=x; if(x>r)r=x; } } }
    if(b<0) return;
    const dx0=Math.floor(cx+(l-SCX)*k), dx1=Math.ceil(cx+(r+1-SCX)*k), dy0=Math.floor(brow+(t-SBROW)*k), dy1=Math.ceil(brow+(b+1-SBROW)*k);
    const dm=[];
    for(let ty=0;ty<dy1-dy0;ty++){ dm.push([]); for(let tx=0;tx<dx1-dx0;tx++){
      const sx=Math.floor(SCX+(dx0+tx+0.5-cx)/k), sy=Math.floor(SBROW+(dy0+ty+0.5-brow)/k);
      const ch=map[sy]&&map[sy][sx]; dm[ty].push(ch&&ch!=='.'&&ch!==' '?(pal[ch]||null):null); } }
    for(let ty=0;ty<dm.length;ty++)for(let tx=0;tx<dm[ty].length;tx++){ let col=dm[ty][tx]; if(!col) continue;
      if(!(dm[ty-1]&&dm[ty-1][tx])) col=pxShade(col,16); else if(!(dm[ty+1]&&dm[ty+1][tx])) col=pxShade(col,-15);
      ctx.fillStyle=col; ctx.fillRect((dx0+tx)*px,(dy0+ty)*px,px,px); } }

  function draw(look,aimDeg,kind,poseKey){
    look=look||DEFLOOK;
    const capOn=look.cap!==false;
    const novel=(capOn&&look.hatStyle&&look.hatStyle!=='cap'&&look.hatStyle!=='visor'&&PXG_HATS[look.hatStyle])?look.hatStyle:'';
    const L=novel?Object.assign({},look,{cap:false}):look;   // a stamped hat sits on hair, not on a cap
    const aim=V(Math.sin(aimDeg*D2R),0,-Math.cos(aimDeg*D2R));
    const M=model(aim,!!look.lefty,kind,POSES[poseKey]); const parts=M.parts.concat(hairHat(M,L));
    const s=new PQ.Sprite(GW,GH);
    // each part's box on the screen, so a cell only tests the parts that can reach it
    for(const p of parts){ if(p.k==='e'){ const m=Math.max(...p.r); p.bb=[p.c[0]-m,p.c[1]-m,p.c[0]+m,p.c[1]+m]; }
      else p.bb=[Math.min(p.a[0],p.b[0])-p.r,Math.min(p.a[1],p.b[1])-p.r,Math.max(p.a[0],p.b[0])+p.r,Math.max(p.a[1],p.b[1])+p.r]; }
    for(let y=0;y<GH;y++){ const Y=y+.5-OY, row=parts.filter(p=>Y>=p.bb[1]&&Y<=p.bb[3]); if(!row.length) continue;
     for(let x=0;x<GW;x++){ const X=x+.5-OX; let best=null,bp=null;
      for(const p of row){ if(X<p.bb[0]||X>p.bb[2]) continue; const h=p.k==='e'?hitE(p,X,Y):hitC(p,X,Y); if(h&&(!best||h.D>best.D)){best=h;bp=p} }
      if(best){ const n=best.n; s.g[y][x]={m:bp.mat,n:()=>n,z:best.D,dt:bp.o.dt||0,gloss:bp.o.gloss||0,bias:bp.o.bias||0,t:bp.o.t!=null?bp.o.t:null,tag:''}; } } }
    const shades=look.eyewear&&PXG_EYEWEAR&&PXG_EYEWEAR[look.eyewear];
    const put=(p,m)=>{ const c=cam(p),x=Math.floor(c[0]+OX),y=Math.floor(c[1]+OY); const g=s.g[y]&&s.g[y][x]; if(g&&g.m==='skin'&&Math.abs(g.z-c[2])<1.6) s.set(x,y,m,0,{noCast:1,z:g.z}); };
    const {hc,look:lk,hup,Lf,hr}=M;
    for(const sd of [1,-1]){ const e=add(hc,sc(lk,hr*0.93),sc(Lf,hr*0.36*sd),sc(hup,-hr*0.1));
      if(shades){ put(e,'lens'); put(add(e,sc(hup,-1)),'lens'); put(add(e,sc(Lf,sd)),'lens'); }
      else { put(e,'pupil'); put(add(e,sc(hup,-1)),'pupil'); }
      put(add(e,sc(hup,1.9)),'brow'); }
    for(const k of [-1,0,1]) put(add(hc,sc(lk,hr*0.9),sc(Lf,k),sc(hup,-hr*0.48)),'mouth');
    const bc=cam(M.ball), hcc=cam(hc);
    const cv=document.createElement('canvas'); cv.width=GW; cv.height=GH; const ctx=cv.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(OX+1,OY+.5,kind==='putt'?11:13,4.5,0,0,7); ctx.fill();
    // the look, coloured exactly as the profile golfer colours it
    const av=avLook(look), mix=PQ.mix, ramp=PQ.ramp;
    const top=(look.top&&PXG_TOPS[look.top])?look.top:'', legw=(look.leg&&PXG_LEGS[look.leg])?look.leg:'', cle=(look.cleats&&PXG_CLEATS[look.cleats])?look.cleats:'';
    let shirt=av.shirtHex, pants=pantsHexOf(look), shoes=av.shoesHex;
    if(top&&top!=='duckfloatie') shirt=(PXG_TOP_PAL[top]||{})['1']||shirt;
    if(legw) pants=(PXG_LEG_PAL[legw]||{})['1']||pants;
    if(cle){ const cp=PXG_CLEATS_PAL[cle]||{}; shoes=cp.T||cp.R||cp.M||cp.B||shoes; }
    const pat=(!top||top==='duckfloatie')&&look.shirtPat&&PXPAT_BY[look.shirtPat]?look.shirtPat:''; let patFn=null;
    if(pat){ const pd=PXPAT_BY[pat]; if(pd.fixed){const cols=pd.cols||[];patFn=(x,y)=>cols[pd.f(x,y)|0]||cols[0]||null}
      else { const light=pxLum(shirt)>0.55,a1=pxShade(shirt,light?-52:46),a2=pxShade(shirt,light?-90:82); patFn=(x,y)=>{const a=pd.f(x,y);return a?(a===2?a2:a1):null}; } }
    const hatHex=av.hatHex;
    const R={skin:PQ.skinRamp(av.skinHex),shirt:ramp(shirt),pants:ramp(pants),shoe:ramp(shoes),hat:ramp(hatHex),
      patch:ramp(PQ.lum(hatHex)>.6?'#1b2b4a':'#f1ede2'),hatbtn:ramp(mix(hatHex,'#000000',.18)),belt:ramp('#2a2420'),
      glove:ramp('#f7f8f5',{spread:.8}),hair:PQ.hairRamp(av.hairHex)};
    const fixed={pupil:av.pupilHex||mix(R.hair[0],'#1a1018',.6),brow:R.hair[0],mouth:av.mouthHex||mix(R.skin[1],'#7a2a34',.30),lens:'#0e1018'};
    s.paint(ctx,1,(c,x,y)=>{const m=c.m; if(m==='shirt'&&patFn){const h=patFn(x,y);if(h)return ramp(h)} if(R[m])return R[m]; if(fixed[m])return fixed[m]; if(m.startsWith('x:'))return ramp(m.slice(2)); return '#ff00ff'});
    if(novel){ const capPal={c:hatHex,b:pxShade(hatHex,-24),w:pxShade(hatHex,26)};
      const pal=Object.assign({},PXG_FIX,PXG_NOV,capPal,PXG_HERITAGE_HAT_PAL[novel]||{});
      stampHat(ctx,1,PXG_HATS[novel],pal,hcc[0]+OX,hcc[1]+OY-hr*0.15,hr*2); }
    // the figure's height in cells, so the page can size it to the old sprite's figure
    const d=ctx.getImageData(0,0,GW,GH).data; let y0=GH; for(let i=3;i<d.length;i+=4) if(d[i]>200){ y0=Math.floor((i>>2)/GW); break; }
    return {cv,ball:[bc[0]+OX,bc[1]+OY],fig:OY+2-y0};
  }

  const KEYS={full:['A','B','D','C'],chip:['A','chipB','D','chipC'],putt:['pA','pB','pC']};
  const cache=new Map();
  function lookKey(look){ return JSON.stringify(look||{}); }
  // aimDeg is snapped to eight facings so a round draws each direction once
  function set(look,aimDeg,kind){
    const a=((Math.round(aimDeg/45)*45)%360+360)%360, key=lookKey(look)+'|'+a+'|'+kind;
    let r=cache.get(key); if(r) return r;
    const frames=KEYS[kind].map(k=>draw(look,a,kind,k));
    r={urls:frames.map(f=>f.cv.toDataURL('image/png')),ball:frames[0].ball,fig:frames[0].fig,W:GW,H:GH,aim:a};
    if(cache.size>96) cache.clear(); cache.set(key,r); return r; }
  // draw a look's eight facings for a kind while the page is idle, so the first shot each way is not a stall
  const warmed=new Set();
  function warm(look,kind){ const k=lookKey(look)+'|'+kind; if(warmed.has(k)) return; warmed.add(k);
    const todo=[0,45,90,135,180,225,270,315]; const idle=window.requestIdleCallback||(f=>setTimeout(()=>f({timeRemaining:()=>8}),60));
    const step=()=>{ if(!todo.length) return; set(look,todo.shift(),kind); idle(step); }; idle(step); }
  window.RTT_G3D={API_VERSION:1, set, warm, draw};
})();
