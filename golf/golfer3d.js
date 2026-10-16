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
  const PQ=PXHD, GW=64, GH=94, OX=32, OY=72, HEADTOP=1.16;
  const V=(x,y,z)=>[x,y,z], add=(...v)=>v.reduce((a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]), sc=(a,k)=>[a[0]*k,a[1]*k,a[2]*k],
    sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
    cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    norm=a=>{const l=Math.hypot(...a)||1;return sc(a,1/l)}, D2R=Math.PI/180,
    rot=(v,axis,ang)=>{axis=norm(axis);const c=Math.cos(ang),s=Math.sin(ang);return add(sc(v,c),sc(cross(axis,v),s),sc(axis,dot(axis,v)*(1-c)))},
    rotAbout=(p,o,axis,ang)=>add(o,rot(sub(p,o),axis,ang));
  // MO is set only while menu() draws: the menu golfer (profileModel) at K cells a unit, camera EL degrees,
  // breathing phase, and only one item when only is 'hat', 'ew', 'club' or 'shoe'. Null draws the course golfer.
  let MO=null;
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

  // a part's own surface: an overlay sits a hair outside the part it dresses, cut to where it shows
  const over=(c,ax,r,mat,cut,o)=>ellipsoid(c,ax,r.map(v=>v*1.035),mat,Object.assign({cut},o||{}));

  // the clubs. A stock set or a recoloured kit is a real club for the shot (driver, iron, putter) in the
  // kit's own finish. A novelty club is the novelty, whatever the shot: a scepter putts too.
  const NOVELTY={scepter:1,candycane:1,excalibur:1,wand:1,hockey:1,glizzy:1,poolnoodle:1,coffin:1,broomstick:1,pitchfork:1};
  function clubParts(push,hands,cdir,face,head,kind,id,pal){
    const n3=norm(cross(face,cdir)), along=t=>add(hands,sc(cdir,t)), L=Math.hypot(...sub(head,hands));
    const X=h=>'x:'+h, grip=(c,r)=>push(capsule(along(-2.6),along(3.6),r||0.95,X(c||'#26262e')));
    const shaft=(c,r,from)=>push(capsule(along(from==null?3.6:from),head,r||0.6,X(c||'#c4ccd4'),{gloss:2}));
    const AX=[face,cdir,n3];
    if(NOVELTY[id]){
      if(id==='scepter'){ push(ellipsoid(along(-3.1),AX,[1,1,1],X(pal['4']),{gloss:2})); push(capsule(along(-2.8),head,0.72,X(pal['4']),{gloss:2}));
        push(ellipsoid(head,AX,[2.3,2.3,2.3],X(pal['4']),{gloss:2})); push(ellipsoid(add(head,sc(face,1.9)),AX,[1.05,1.05,1.05],X(pal.A),{gloss:3}));
        push(ellipsoid(add(head,sc(cdir,2.2)),AX,[0.8,0.8,0.8],X(pal['6']),{gloss:2})); return; }
      if(id==='candycane'){ const seg=(a,b,i)=>push(capsule(a,b,0.78,X(i%2?pal.L:pal.K),{gloss:1}));
        const n=Math.max(3,Math.round((L+3)/1.7)); for(let i=0;i<n;i++) seg(along(-3+(L+3)*i/n),along(-3+(L+3)*(i+1)/n),i);
        const c=add(head,sc(face,2.2)); let prev=head;
        for(let i=1;i<=6;i++){ const a=i*Math.PI*1.1/6, p=add(c,sc(face,-2.2*Math.cos(a)),sc(cdir,2.2*Math.sin(a))); seg(prev,p,n+i); prev=p; } return; }
      if(id==='excalibur'){ push(ellipsoid(along(-3.3),AX,[1.15,1.15,1.15],X(pal.P),{gloss:2})); push(capsule(along(-2.6),along(2.3),0.82,X(pal.g)));
        push(capsule(add(along(2.9),sc(face,2.8)),add(along(2.9),sc(face,-2.8)),0.68,X(pal.X),{gloss:2}));
        push(ellipsoid(add(along(2.9),sc(n3,0.5)),AX,[0.75,0.75,0.75],X(pal.M),{gloss:3}));
        const tip=add(head,sc(cdir,1.4)), mid=sc(add(along(3.3),tip),0.5), hl=Math.hypot(...sub(tip,along(3.3)))/2;
        push(ellipsoid(mid,[cdir,face,n3],[hl,1.55,0.5],X(pal.S),{gloss:3}));
        push(ellipsoid(mid,[cdir,face,n3],[hl*0.96,0.36,0.56],X(pal.s),{gloss:2})); return; }
      if(id==='wand'){ push(capsule(along(-2.8),head,0.58,X(pal.l),{gloss:1}));
        for(const t of [0.6,L*0.45]) push(capsule(along(t-0.35),along(t+0.35),0.72,X(pal.b),{gloss:2}));
        const s0=add(head,sc(cdir,1.3)); push(ellipsoid(s0,AX,[1.25,1.25,0.7],X(pal.T),{gloss:2}));
        for(let i=0;i<5;i++){ const a=i*72*D2R, dir=norm(add(sc(cdir,Math.cos(a)),sc(face,Math.sin(a))));
          push(ellipsoid(add(s0,sc(dir,1.5)),[dir,norm(cross(dir,n3)),n3],[1.35,0.55,0.5],X(i%2?pal.t:pal.T),{gloss:2})); } return; }
      if(id==='hockey'){ push(capsule(along(-2.8),head,0.78,X(pal.H),{gloss:1})); push(capsule(along(L*0.42-0.5),along(L*0.42+0.5),0.86,X(pal.K)));
        const bc=add(head,sc(face,2.3),sc(cdir,0.4)); push(ellipsoid(bc,AX,[3.5,1.05,0.5],X(pal.W),{gloss:1}));
        push(over(bc,AX,[3.5,1.05,0.5],X(pal.t),l=>l[0]>-0.15&&l[0]<0.55)); return; }
      if(id==='glizzy'){ grip(); shaft(PXG_FIX.l);
        push(capsule(add(head,sc(face,-2.8),sc(cdir,0.9)),add(head,sc(face,2.8),sc(cdir,0.9)),1.3,X(pal.B)));
        push(capsule(add(head,sc(face,-3.0)),add(head,sc(face,3.0)),1.0,X(pal.D),{gloss:2}));
        for(const k of [-1.9,-0.6,0.7,2.0]) push(ellipsoid(add(head,sc(face,k),sc(cdir,-0.85),sc(n3,k*0.15)),AX,[0.55,0.45,0.55],X(pal.M),{gloss:1})); return; }
      if(id==='poolnoodle'){ push(capsule(along(-3),head,1.35,X(pal.N),{gloss:1}));
        push(ellipsoid(add(head,sc(cdir,1.25)),[cdir,face,n3],[0.35,0.85,0.85],X(pal.O))); return; }
      if(id==='coffin'){ grip(); shaft(pal.W,0.62);
        const bc=add(head,sc(face,1.8)), CR=[4.6,2.0,1.45]; push(ellipsoid(bc,AX,CR,X(pal.W),{gloss:1}));
        push(over(bc,AX,CR,X(pal.L),l=>l[1]<-0.45,{gloss:2}));
        push(over(bc,AX,CR,X(pal.k),l=>l[1]>-0.45&&l[1]<-0.15)); return; }
      if(id==='broomstick'){ push(capsule(along(-2.8),head,0.66,X(pal.W),{gloss:1})); push(capsule(head,add(head,sc(cdir,0.8)),0.85,X(pal.R),{gloss:1}));
        const bc=add(head,sc(cdir,3.4)); push(ellipsoid(bc,[cdir,face,n3],[3.2,2.8,1.25],X(pal.Y),{gloss:1}));
        push(over(bc,[cdir,face,n3],[3.2,2.8,1.25],X(pal.y),l=>Math.abs(l[1])<0.12||Math.abs(Math.abs(l[1])-0.55)<0.1)); return; }
      if(id==='pitchfork'){ push(capsule(along(-2.8),head,0.62,X(pal.W),{gloss:1}));
        push(capsule(add(head,sc(face,-2.2)),add(head,sc(face,2.2)),0.6,X(pal.G),{gloss:2}));
        for(const k of [-2.1,0,2.1]){ const b=add(head,sc(face,k)); push(capsule(b,add(b,sc(cdir,3.8)),0.45,X(pal.S),{gloss:2}));
          push(ellipsoid(add(b,sc(cdir,4.0)),AX,[0.45,0.45,0.45],X(pal.L),{gloss:2})); } return; }
    }
    // a real club. Stock is the old finish; a kit (and the two classics) wear their palette.
    const wood=id==='persimmon', blade=id==='blade', kit=!!(pal&&pal.H&&!wood);
    const shaftC=wood?pal.H:(pal&&pal.l)||'#c4ccd4';
    grip(kit?mix2(pal.G,'#26262e',.5):null); shaft(shaftC,0.6);
    if(kind==='putt'){ const c=wood?pal.W:blade?pal.S:kit?pal.H:'#5a636e';
      push(capsule(add(head,sc(face,1.9)),add(head,sc(face,-1.9)),1.15,X(c),{gloss:2}));
      if(kit||wood) push(capsule(add(head,sc(face,1.6),sc(n3,0.5)),add(head,sc(face,-1.6),sc(n3,0.5)),0.5,X(wood?pal.I:pal.F),{gloss:2})); }
    else if(kind==='chip'){ const c=wood?pal.W:blade?pal.S:kit?pal.H:'#b8c0c8';
      push(ellipsoid(head,AX,[0.9,1.6,2.6],X(c),{gloss:2}));
      if(kit||blade) push(over(head,AX,[0.9,1.6,2.6],X(blade?pal.n:pal.G),l=>l[1]>0.55)); }
    else { const c=wood?pal.W:blade?pal.S:kit?pal.H:'#2a2f3b';
      push(ellipsoid(head,AX,[2.2,1.8,3.2],X(c),{gloss:2}));
      push(over(head,AX,[2.2,1.8,3.2],X(wood?pal.I:kit?pal.F:'#cfd3da'),l=>l[0]>0.72,{gloss:2}));
      push(over(head,AX,[2.2,1.8,3.2],X(wood?pal.B:kit?pal.G:'#2d323c'),l=>l[1]>0.62)); }
  }
  const mix2=(a,b,t)=>{ try{ return PQ.mix(a,b,t); }catch(e){ return a; } };

  function model(aimV,lefty,kind,pose,gear){
    gear=gear||{};
    /* WALKING the golfer faces the way he goes (F), so T is his carrying side, and the frame's phase (pose.ph,
       0 to 1 over two steps) swings the legs, the arms and the hips and lifts the body at each passing step */
    const walk=kind==='walk', ph=walk?pose.ph*2*Math.PI:0, cyc=pose.stand?0:Math.cos(ph), syc=pose.stand?0:Math.sin(ph);   // ws stands, feet together
    const yb=walk?0.75*Math.abs(syc)-0.3:0;
    const U=V(0,1,0);
    let T,F; if(walk){ F=norm(aimV); T=lefty?norm(cross(U,F)):norm(cross(F,U)); }
    else { T=norm(aimV); F=lefty?norm(cross(U,T)):norm(cross(T,U)); }   // the chest. A righty's lead shoulder points down the line.
    const P0=(f,u,t)=>add(sc(F,f),sc(U,u),sc(T,t));
    const P=(f,u,t)=>P0(f,u>8?u+yb:u,t);
    // the swing's coordinates above the hips assume a forward bend; walking is nearly upright
    const Pu=walk?(f,u,t)=>P(f-(u-23)*0.44,u,t):P;
    const parts=[]; const push=p=>parts.push(p);
    const club=kind==='putt'?CLUBS.putter:kind==='chip'?CLUBS.iron:CLUBS.driver;
    const lean=(walk?5:kind==='putt'?22:28)*D2R, spine=norm(add(sc(F,Math.sin(lean)),sc(U,Math.cos(lean))));
    // a turn moves the chest away from the target: pick the sign that does
    const sgn=dot(rot(F,U,0.1),T)<0?1:-1, turnA=a=>a*D2R*sgn;
    // legs, hips, shoes. A leg bends at the knee, which is where plus fours end.
    const hipC=walk?P(-0.3,15.2,0):P(-1.2,15.2,0), hipAx=a=>rot(a,U,turnA(pose.hip));
    const lg=gear.legPal, cl=gear.cleats;
    for(const s of [1,-1]){ const lead=s>0, l=(walk?3.4:kind==='putt'?3.9:4.8)*s;
      const heel=lead||walk?0:pose.heel;
      // walking: this leg's foot is forward of the hips by fw, and lifts while it swings through
      const fw=walk?5.2*s*cyc:0, lift=walk?Math.max(0,-s*syc)*2.6:0;
      const ank=walk?P0(fw,3.2+lift,l):add(P(0.4,3.2+heel*1.8,l),sc(T,heel*1.6));
      const hip=rotAbout(P(walk?0:-1,14,l*0.95),hipC,U,turnA(pose.hip)), knee=add(sc(add(hip,ank),0.5),sc(F,1.1+lift*0.9));
      if(lg){ push(capsule(hip,knee,3.05,'pants')); push(ellipsoid(add(knee,sc(U,-0.8)),[F,U,T],[3.2,1.6,3.2],'pants',{dt:-1}));
        push(capsule(add(knee,sc(U,-1.4)),ank,2.35,'sock')); }
      else { push(capsule(hip,knee,2.7,'pants')); push(capsule(knee,ank,2.7,'pants')); }
      const tip=walk?(lift>0?-0.12*lift:fw<0?0.22*(-fw/5.2):0):0;   // a lifted foot toes down, the trailing one rolls onto its toe
      const sF=walk?rot(F,T,tip):F, sU=walk?rot(U,T,tip):U;
      const sc0=walk?add(ank,sc(sF,1.0),sc(sU,-1.7)):add(P(1.4,1.5+heel*1.2,l),sc(T,heel*1.4)), sax=[sF,sU,T], sr=[4.6,1.7,2.5];
      push(ellipsoid(sc0,sax,sr,'shoe',{gloss:2,bias:.15}));
      push(over(sc0,sax,sr,cl?'x:'+cl.sole:'sole',l=>l[1]<-0.5));
      if(cl&&cl.acc) push(over(sc0,sax,sr,'x:'+cl.acc,l=>l[0]>-0.38&&l[0]<0.08&&l[1]>-0.5,{gloss:1})); }
    push(ellipsoid(hipC,[hipAx(F),U,hipAx(T)],[4.8,4.2,7.2],'pants'));
    push(ellipsoid(add(hipC,P(0.6,2.4,0)),[hipAx(F),spine,hipAx(T)],[5.3,1.15,7.7],'belt',{gloss:1}));
    // the torso turns about the spine
    const tc=walk?P(0.4,23,0):P(1.2,23,0), tr=v=>rot(v,spine,turnA(pose.turn)), tp=p=>rotAbout(p,tc,spine,turnA(pose.turn));
    const TAX=[tr(F),spine,tr(T)], TR=[5.6,7.6,8.3], top=gear.top, tpal=gear.topPal||{};
    const body=top==='shacket'?'plaid':'shirt';
    const tsurf=(v,z)=>add(tc,sc(TAX[0],5.6*1.04*Math.sqrt(Math.max(0,1-v*v-(z/8.3)*(z/8.3)))),sc(TAX[1],7.6*v),sc(TAX[2],z));
    push(ellipsoid(tc,TAX,TR,body));
    push(capsule(tp(Pu(3.2,28.8,0)),tp(Pu(4.2,30.4,0)),2.6,'skin',{dt:-1}));
    push(ellipsoid(tp(Pu(3.0,28.6,0)),TAX,[3.6,1.3,4.3],body,{dt:1}));
    // the outerwear, over the torso
    if(top==='cardigan'||top==='shacket'){ push(over(tc,TAX,TR,'polo',l=>l[0]>0.3&&Math.abs(l[2])<0.15+0.1*Math.max(0,l[1])));
      for(const v of [-0.35,0.05,0.42]) push(ellipsoid(tsurf(v,1.9),TAX,[0.55,0.55,0.55],'x:'+(tpal['4']||'#5f4c2e'),{gloss:2})); }
    if(top==='blazer'){ push(over(tc,TAX,TR,'x:'+tpal['6'],l=>l[0]>0.25&&l[1]>-0.2&&Math.abs(l[2])<0.36*(l[1]+0.2)));
      push(over(tc,TAX,TR.map(v=>v*1.01),'x:'+tpal['7'],l=>l[0]>0.25&&l[1]>-0.62&&Math.abs(l[2])<0.075));
      for(const v of [-0.42,-0.22]) push(ellipsoid(tsurf(v,1.6),TAX,[0.5,0.5,0.5],'x:'+tpal['4'],{gloss:2})); }
    if(top==='cape'){ const cc=tp(Pu(-4.9,19.5,0)); push(ellipsoid(cc,TAX,[1.6,11.2,8.8],'x:'+tpal['1'],{cut:l=>l[1]<0.55||l[0]<0.2}));
      push(over(cc,TAX,[1.6,11.2,8.8],'x:'+tpal['4'],l=>l[0]>0.55&&l[1]<0.4));
      push(ellipsoid(tp(Pu(0.4,29.4,0)),TAX,[5.4,1.6,6.8],'x:'+tpal['4'],{cut:l=>l[0]<0.35}));
      for(const s of [1,-1]) push(ellipsoid(tp(Pu(4.4,28.3,3.6*s)),TAX,[0.75,0.75,0.75],'x:'+tpal['5'],{gloss:2})); }
    if(top==='duckfloatie'){ const fc=add(hipC,P(0.7,2.6,0)), A=hipAx(F), B=hipAx(T), ring=a=>add(fc,sc(A,7.4*Math.cos(a)),sc(B,9.8*Math.sin(a)));
      const N=22; for(let i=0;i<N;i++) push(capsule(ring(i/N*2*Math.PI),ring((i+1)/N*2*Math.PI),2.55,'x:'+tpal['1'],{gloss:1,bias:.15}));
      const ha=-38*D2R, rp=ring(ha), out=norm(add(sc(A,Math.cos(ha)),sc(B,Math.sin(ha)))), hd=add(rp,sc(U,4.8),sc(out,0.9));
      push(capsule(add(rp,sc(U,1.2)),hd,1.45,'x:'+tpal['1'],{gloss:1})); push(ellipsoid(hd,[out,U,norm(cross(out,U))],[2.9,2.7,2.7],'x:'+tpal['1'],{gloss:1}));
      push(ellipsoid(add(hd,sc(out,2.9),sc(U,-0.5)),[out,U,norm(cross(out,U))],[1.7,0.7,1.1],'x:'+tpal['4'],{gloss:1}));
      for(const s of [1,-1]) push(ellipsoid(add(hd,sc(out,2.1),sc(U,0.9),sc(norm(cross(out,U)),1.35*s)),[out,U,T],[0.55,0.6,0.55],'x:'+tpal['5'])); }
    let head0=null;
    if(walk){
      // the arms swing against the legs, and the putter rides in the carrying hand, its head off the grass
      for(const s of [1,-1]){ const carry=s>0, ang=-s*cyc*(carry?0.32:0.55), sh=tp(Pu(2.2,27.6,6.2*s));
        const hand=add(sh,rot(sc(U,-12.2),T,ang),sc(T,s*0.9)), elb=add(sc(add(sh,hand),0.5),sc(F,-0.7+Math.max(0,ang)*1.6),sc(T,s*0.5));
        push(capsule(sh,elb,2.6,body)); push(capsule(elb,hand,1.75,'skin'));
        push(ellipsoid(hand,[F,U,T],[2.1,2.1,2.1],carry?'skin':'glove'));
        if(carry){ const cdir=norm(rot(norm(add(sc(U,-0.86),sc(F,0.5))),T,ang*0.8)), head=add(hand,sc(cdir,14.2));
          clubParts(push,add(hand,sc(cdir,0.6)),cdir,F,head,'putt',gear.club||'',gear.clubPal||{}); } }
    } else {
    // the swing plane holds the address club and the target line
      const hand0=P(club.hand[0],club.hand[1]+26.4,0); head0=P(club.head[0],club.head[1]+26.4,0);
      let ax=norm(cross(sub(head0,hand0),T)); if(dot(rot(sub(head0,hand0),ax,0.1),T)>dot(sub(head0,hand0),T)) ax=sc(ax,-1);
      const handsW=rotAbout(rotAbout(P(club.hand[0],club.hand[1]+26.4,0),P(3.4,26.4,0),ax,pose.phi*D2R),tc,spine,turnA(pose.turn)*0.35);
      const cvec=rot(rot(sub(head0,hand0),ax,(pose.phi+pose.hinge)*D2R),spine,turnA(pose.turn)*0.35);
      const head=add(handsW,cvec), cdir=norm(cvec);
      for(const s of [1,-1]){ const sh=tp(P(2.2,27.6,6.6*s)); const toH=sub(handsW,sh);
        const elb=add(sh,sc(toH,.5),sc(norm(cross(toH,spine)),-1.0*s));
        push(capsule(sh,elb,2.6,body)); push(capsule(elb,add(handsW,sc(cdir,-1.2*s)),1.75,'skin')); }
      push(ellipsoid(add(handsW,sc(cdir,-1.0)),[F,U,T],[2.4,2.4,2.4],'glove'));
      push(ellipsoid(add(handsW,sc(cdir,1.2)),[F,U,T],[2.1,2.1,2.1],'skin'));
      const face=norm(rot(T,ax,(pose.phi+pose.hinge)*D2R));
      clubParts(push,handsW,cdir,face,head,kind,gear.club||'',gear.clubPal||{});
    }
    // head
    const hc=tp(Pu(kind==='putt'?6.2:5.4,34.2,0));
    let gaze=walk?norm(add(F,sc(U,-0.14))):norm(add(sc(F,.72),sc(U,kind==='putt'?-.69:-.6)));
    if(pose.head) gaze=norm(rot(gaze,U,-turnA(pose.head)));
    if(pose.head>30) gaze=norm(add(gaze,sc(U,.55)));
    const hup=norm(cross(cross(gaze,U),gaze)), side=norm(cross(hup,gaze)), hr=8.3;
    push(ellipsoid(hc,[gaze,hup,side],[hr,hr*1.04,hr*0.98],'skin',{bias:.06}));
    for(const s of [1,-1]) push(ellipsoid(add(hc,sc(side,hr*0.95*s),sc(gaze,-0.6)),[gaze,hup,side],[1.4,1.9,1.2],'skin'));
    const head0Ball=walk?V(0,0,0):add(head0,sc(T,kind==='putt'?4.3:kind==='chip'?3.3:5.0),sc(U,kind==='putt'?0.6:0));
    return {parts,hc,look:gaze,hup,Lf:side,hr,F,U,T,ball:head0Ball,tc};
  }


  /* THE MENU GOLFER'S HAIR, seen from the front. It covers the top of the head down to a hairline: the forehead
     at the front, the temples above the ears at the sides (with short sideburns), the nape at the back. Under a cap
     or a closed hat only what is below the hat band shows. Each style is that base plus its own shape. */
  function profileHair(M,style,under,cap){ const {hc,look,hup,Lf,hr}=M, out=[], AXh=[look,hup,Lf];
    const thr=(l)=>{ const f=l[0];   // the hairline's height on the head, as the local up coordinate
      if(Math.abs(l[2])>0.78&&f>-0.15&&f<0.32) return -0.34;                                           // sideburns, in front of the ear
      return f>=0?-0.12+0.56*Math.pow(Math.min(1,f/0.85),1.3):-0.12-0.62*Math.min(1,-f/0.9); };
    const capTop=under?0.24:9;
    const base=(R,c,o)=>out.push(ellipsoid(c||hc,AXh,R,'hair',Object.assign({gloss:1,bias:-.08,cut:l=>l[1]>thr(l)&&l[1]<capTop},o||{})));
    const S=hr;
    if(style==='afro'){ if(under) base([S*1.13,S*1.1,S*1.15]); else base([S*1.32,S*1.28,S*1.36],add(hc,sc(hup,1.4)),{cut:l=>l[1]>thr(l)-0.08}); }
    else if(style==='buzz') base([S*1.025,S*1.065,S*1.022],null,{dt:-1});
    else if(style==='mohawk'){ if(!under){ base([S*1.03,S*1.065,S*1.03],null,{dt:-1,cut:l=>l[1]>thr(l)+0.05&&Math.abs(l[2])<0.2});
        out.push(ellipsoid(add(hc,sc(hup,hr*0.98),sc(look,-0.2)),AXh,[hr*1.0,4.4,1.75],'hair',{gloss:1,cut:l=>l[1]>-0.55})); } else base([S*1.025,S*1.065,S*1.022],null,{dt:-1}); }
    else { const vol=style==='curly'?1.08:1.045; base([S*vol,S*(vol+0.025),S*vol]);
      if(style==='curly'&&!under) for(let i=0;i<9;i++){ const a=i/9*2*Math.PI, d=norm(add(sc(hup,0.62),sc(look,0.62*Math.cos(a)),sc(Lf,0.7*Math.sin(a))));
        out.push(ellipsoid(add(hc,sc(d,hr*1.06)),AXh,[1.9,1.7,1.9],'hair',{gloss:1})); }
      if(style==='swoop'&&!under) out.push(ellipsoid(add(hc,sc(look,hr*0.55),sc(hup,hr*0.74),sc(Lf,hr*0.2)),AXh,[hr*0.6,hr*0.32,hr*0.72],'hair',{gloss:1,bias:-.05}));
      if(style==='spiky'&&!under) for(let i=0;i<7;i++){ const a=(i/7)*2*Math.PI, d=norm(add(sc(hup,1),sc(look,0.5*Math.cos(a)),sc(Lf,0.5*Math.sin(a))));
        out.push(ellipsoid(add(hc,sc(d,hr*1.0)),[d,norm(cross(d,Lf)),norm(cross(d,cross(d,Lf)))],[2.6,1.1,1.1],'hair',{gloss:1})); }
      if(style==='topknot'&&!under) out.push(ellipsoid(add(hc,sc(look,-hr*0.35),sc(hup,hr*1.02)),AXh,[2.7,2.5,2.7],'hair',{gloss:1}));
      if(style==='long'){ out.push(capsule(add(hc,sc(look,-hr*0.55),sc(hup,hr*0.1)),add(hc,sc(look,-hr*0.7),sc(hup,-hr*1.35)),hr*0.72,'hair',{gloss:1}));
        for(const sd of [1,-1]) out.push(capsule(add(hc,sc(Lf,sd*hr*0.9),sc(look,hr*0.05),sc(hup,-hr*0.05)),add(hc,sc(Lf,sd*hr*0.98),sc(look,-hr*0.12),sc(hup,-hr*1.3)),1.9,'hair',{gloss:1,bias:-.05})); }
      if(style==='mullet') out.push(capsule(add(hc,sc(look,-hr*0.8),sc(hup,hr*0.05)),add(hc,sc(look,-hr*0.9),sc(hup,-hr*0.95)),hr*0.55,'hair',{gloss:1}));
      if(style==='ponytail') out.push(capsule(add(hc,sc(look,-hr*1.05),sc(hup,hr*(cap?0.05:0.4))),add(hc,sc(look,-hr*1.3),sc(hup,-hr*0.85)),2.1,'hair',{gloss:1})); }
    return out; }
  function hairHat(M,L,closedHat){ const {hc,look,hup,Lf,hr,F,U}=M; const out=[];
    const style=L.hairStyle||'short', capOn=L.cap!==false, hatStyle=capOn?(L.hatStyle||'cap'):'';
    const visor=hatStyle==='visor', cap=capOn&&!visor, under=cap||closedHat;
    const big=under?Math.min(1.06,style==='afro'?1.06:1.03):style==='afro'?1.32:style==='curly'?1.08:style==='buzz'?1.055:1.03;
    if(MO){ if(!M.noHair) out.push(...profileHair(M,style,under,!!capOn&&!visor)); }
    else {
    out.push(ellipsoid(hc,[look,hup,Lf],[hr*big,hr*big*1.02,hr*big],'hair',{gloss:1,bias:-.08,cut:l=>l[0]<0.22+(under?0:0.15)&&(under?l[1]<0.1:true)&&!(l[0]>-0.3&&l[1]<-0.3)}));
    if(style==='long'||style==='mullet') out.push(capsule(add(hc,sc(F,-hr*0.75),sc(U,hr*0.1)),add(hc,sc(F,-hr*0.95),sc(U,-hr*(style==='long'?1.35:0.85))),hr*(style==='long'?0.7:0.55),'hair',{gloss:1}));
    if(style==='ponytail') out.push(capsule(add(hc,sc(F,-hr*1.12),sc(U,hr*0.45)),add(hc,sc(F,-hr*1.3),sc(U,-hr*0.8)),2.2,'hair',{gloss:1}));
    if(style==='topknot'&&!under) out.push(ellipsoid(add(hc,sc(F,-hr*0.4),sc(U,hr*0.95)),[F,U,Lf],[2.8,2.6,2.8],'hair',{gloss:1}));
    if(style==='mohawk'&&!under) out.push(ellipsoid(add(hc,sc(hup,hr*0.9)),[look,hup,Lf],[hr*0.9,2.6,1.6],'hair',{gloss:1}));
    if(style==='swoop'&&!under) out.push(ellipsoid(add(hc,sc(look,hr*0.55),sc(hup,hr*0.72),sc(Lf,hr*0.22)),[look,hup,Lf],[hr*0.62,hr*0.34,hr*0.7],'hair',{gloss:1,bias:-.05}));
    if(style==='spiky'&&!under) for(let i=0;i<7;i++){ const a=(i/7)*2*Math.PI, d=norm(add(sc(hup,1),sc(look,0.55*Math.cos(a)),sc(Lf,0.55*Math.sin(a))));
      out.push(ellipsoid(add(hc,sc(d,hr*1.0)),[d,norm(cross(d,Lf)),norm(cross(d,cross(d,Lf)))],[2.6,1.1,1.1],'hair',{gloss:1})); }
    }
    const lift=MO?hr*0.16:0;
    if(cap){ out.push(ellipsoid(add(hc,sc(hup,hr*0.18+lift)),[look,hup,Lf],[hr*1.06,hr*0.95,hr*1.06],'hat',{cut:l=>l[1]>-0.12}));
      out.push(MO?ellipsoid(add(hc,sc(look,hr*0.98),sc(hup,hr*0.0+lift)),[look,hup,Lf],[hr*1.0,0.85,hr*1.0],'hat',{dt:-1,cut:l=>l[0]>-0.2})
        :ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.02+lift)),[look,hup,Lf],[hr*0.75,0.75,hr*0.82],'hat',{dt:-1,cut:l=>l[0]>-0.15}));
      out.push(ellipsoid(add(hc,sc(hup,hr*1.1+lift)),[look,hup,Lf],[1.1,0.8,1.1],'hatbtn'));
      if(MO){ const pc=add(hc,sc(look,hr*0.93),sc(hup,hr*0.52+lift));
        out.push(ellipsoid(pc,[look,hup,Lf],[0.62,2.5,2.7],'patch',{t:2,cut:l=>Math.abs(l[1])<0.7&&Math.abs(l[2])<0.7}));
        out.push(ellipsoid(add(pc,sc(look,0.2)),[look,hup,Lf],[0.5,0.62,1.05],'patchmark',{t:2,noCast:1})); }
      else out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.48)),[look,hup,Lf],[0.6,1.5,2.0],'patch',{t:2})); }
    if(visor&&MO){ const R=(style==='afro'?1.4:style==='curly'?1.14:1.1)*hr;   // the band sits outside the hair, the brim like the cap's
      out.push(ellipsoid(add(hc,sc(hup,hr*0.28)),[look,hup,Lf],[R,1.35,R],'hat',{gloss:1}));
      out.push(ellipsoid(add(hc,sc(look,R*0.93),sc(hup,hr*0.24)),[look,hup,Lf],[hr*0.95,0.8,hr*0.95],'hat',{dt:-1,cut:l=>l[0]>-0.15})); }
    else if(visor){ out.push(ellipsoid(add(hc,sc(hup,hr*0.3)),[look,hup,Lf],[hr*1.04,1.1,hr*1.04],'hat'));
      out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.2)),[look,hup,Lf],[hr*0.75,0.75,hr*0.82],'hat',{dt:-1,cut:l=>l[0]>-0.15})); }
    return out; }

  // ---------------------------------------------------------------------------------------------------
  // A hat or a pair of glasses is built from the profile picture's OWN art, so all of them come out of
  // one rule and each wears exactly its own colours. The art is the front view on the profile head
  // (centre x 22, y 14, about 8 cells to the rim). Each row of it is spun round the head's own up axis:
  // the run through the middle of the row is a solid slice (a crown, a cone, a brim), a row with a hole
  // in the middle is a band round the head (a wreath, a hood round the face), and a piece standing off
  // on its own (antlers, horns, a feather) is a flat cut-out. Glasses are a thin layer on the face.
  // The art rides with the head, so a hat tips when the golfer looks down at the ball.
  const HAT3D={ halo:{ring:1}, headphones:{flat:1,T:2.3}, antlers:{flat:1,T:1.0}, horns:{flat:1,T:1.5},
    pirate:{dz:.42}, grad:{sq:1}, turkey:{fF:-3.2}, laurel:{wrapAll:1,w:1.7,snug:1}, crown:{wrapAll:1,w:1.25,dy:-2,snug:1},
    headband:{wrapAll:1,w:1.3} };
  function roleFor(ch,pal,P,lens){
    if(lens&&ch==='E') return {m:'x:#14161e',gloss:3};
    if(pal&&pal[ch]) return {m:'x:'+pal[ch]};
    switch(ch){ case 'c': return {m:'hat'}; case 'b': return {m:'hat',dt:-1}; case 'w': return {m:'hat',dt:1};
      case 't': return {m:'shirt'}; case 'd': return {m:'shirt',dt:-1}; case 'v': return {m:'shirt',dt:1};
      case 's': return {m:'skin'}; case 'j': return {m:'skin',dt:-1}; case 'x': return {m:'skin',dt:1};
      case 'h': return {m:'hair'}; case 'i': return {m:'hair',dt:-1};
      case 'p': return {m:'pants'}; case 'q': return {m:'pants',dt:-1}; case 'm': return {m:'pants',dt:1};
      case 'o': return {m:'shoe'}; case 'z': return {m:'shoe',dt:-1}; case 'u': return {m:'shoe',dt:1}; }
    return P[ch]?{m:'x:'+P[ch]}:null; }
  function hull(map,roleOf,M,cfg){
    const {hc,look:g,hup:h,Lf:l,hr}=M, k=hr/8.15, dx=cfg.dx|0, dy=cfg.dy|0, dz=cfg.dz||1, CX=22, CY=14;
    const H=map.length, Wd=map[0].length, grid=[];
    // nothing a hat or a pair of glasses draws is below the shoulders (row 27): the top hat's art carries a
    // stray strip at row 55, hidden behind the body on the profile and lying on the grass in 3D
    for(let y=0;y<H;y++){ grid.push([]); for(let x=0;x<Wd;x++){ const ch=map[y][x]; grid[y].push(y+dy<=27&&ch&&ch!=='.'&&ch!==' '?roleOf(ch):null); } }
    const at=(x,y)=>(grid[y]&&grid[y][x])||null, rows=[]; let Rb=0;
    for(let y=0;y<H;y++){ let a=-1,b=-1,mn=99,mx=-1; const c0=at(CX-1-dx,y)?CX-1-dx:at(CX-dx,y)?CX-dx:-1;
      if(c0>=0){ a=c0; b=c0; while(at(a-1,y)) a--; while(at(b+1,y)) b++; }
      for(let x=0;x<Wd;x++) if(grid[y][x]){ mn=Math.min(mn,x); mx=Math.max(mx,x);
        const px=x+dx, py=y+dy; Rb=Math.max(Rb,Math.hypot(Math.max(Math.abs(px-CX),Math.abs(px+1-CX)),Math.max(Math.abs(py-CY),Math.abs(py+1-CY)))*k); }
      let both=false; if(mx>=0) both=mn+dx<CX&&mx+dx>=CX;
      let w=0; if(mx>=0){ let e=mn; while(at(e+1,y)) e++; w=(e-mn+1)*k; }
      rows.push(mx<0?null:{core:c0>=0?[a+dx,b+dx]:null, Rc:c0>=0?Math.max(CX-(a+dx),b+dx+1-CX)*k:0,
        Rout:Math.max(CX-(mn+dx),mx+dx+1-CX)*k, w:Math.max(cfg.w||1.2,Math.min(w,3*k)), left:grid[y][mn], right:grid[y][mx],both}); }
    const rowAt=my=>rows[my-dy]||null, Rc=my=>{ const r=rowAt(my); return r&&r.core?r.Rc:0; };
    const T=cfg.T||1.4, fF=cfg.fF||0, sh=cfg.decal;
    const headR=u=>hr*0.98*Math.sqrt(Math.max(0,1-(u/(hr*1.04))*(u/(hr*1.04)))), fit=(R,u)=>{ const hR=headR(u); return R>=hR*0.6?Math.max(R,hR*(M.hairK||1.03)+(cfg.snug?0.25:0.6)):R; };
    function test(s,u,f){
      const pxF=CX+s/k, pyF=CY-u/k, px=Math.floor(pxF), py=Math.floor(pyF), cell=at(px-dx,py-dy), row=rowAt(py);
      if(sh){ if(!cell||f<=0) return null; const q=Math.hypot(f/hr,u/(hr*1.04),s/(hr*0.98)); if(q<1.0||q>1+0.75/hr) return null;
        return {r:cell,n:[s/(hr*0.98),u/(hr*1.04),f/hr]}; }
      if(!row) return null;
      if(cfg.flat){ if(!cell||Math.abs(f-fF)>T) return null; return {r:cell,n:flatN(px,py,f-fF)}; }
      const wrap=cfg.wrapAll||(!row.core);
      if(!wrap&&px>=row.core[0]&&px<=row.core[1]){
        const R=fit(row.Rc,u), r=Math.hypot(s,f/dz);
        if(cfg.sq&&R>8.6*k){ if(Math.abs(f)>R*0.85) return null; return {r:cell||row.left,n:Math.abs(f)>R*0.85-0.6?[0,0,Math.sign(f)]:[0,1,0]}; }
        if(r>R) return null;
        const dR=(Rc(py-1)-Rc(py+1))/(2*k);   // the slope of the slice: a cone narrows going up, a brim flares
        return {r:cell||row.left,n:[s/(r||1),-dR*1.2,f/((r||1)*dz*dz)]}; }
      if(wrap&&(row.both||cfg.wrapAll)){
        const Ro=fit(row.Rout,u), r=Math.hypot(s,f/dz); if(r>Ro||r<Ro-row.w) return null;
        if(!cell&&!(f<0&&!cfg.wrapAll)) return null;
        return {r:cell||(s<0?row.left:row.right),n:[s/r,0,f/(r*dz*dz)]}; }
      if(!cell||Math.abs(f-fF)>T) return null; return {r:cell,n:flatN(px,py,f-fF)}; }
    function flatN(px,py,df){ const e=(x,y)=>at(x-dx,y-dy)?0:1;
      return [(e(px+1,py)-e(px-1,py))*0.8,(e(px,py-1)-e(px,py+1))*0.8,Math.sign(df)||1]; }
    // the crown's colour and where the brim is: a closed hat is domed over the head in it (dome())
    let wide=-1,wR=0,low=-1; rows.forEach((r,i)=>{ if(r&&r.core){ low=i; if(r.Rc>wR){ wR=r.Rc; wide=i; } } });
    const cnt=new Map(); let crownRole=null, ci=0;
    // a brim hat is domed down to the brim; a hat with nothing above its widest row (a board, a bicorne) to its bottom
    let crownTop=false; for(let i=0;i<wide;i++) if(rows[i]&&rows[i].core&&rows[i].core[1]-rows[i].core[0]>=3) crownTop=true;
    if(!crownTop) wide=low+1;
    for(let i=0;i<wide&&ci<2;i++){ const r=rows[i]; if(!r||!r.core||r.core[1]-r.core[0]<3) continue; ci++;
      for(let x=r.core[0]-dx;x<=r.core[1]-dx;x++){ const c=at(x,i); if(c){ const n=(cnt.get(c.m+'|'+(c.dt||0))||0)+1; cnt.set(c.m+'|'+(c.dt||0),n); if(!crownRole||n>cnt.get(crownRole.m+'|'+(crownRole.dt||0))) crownRole=c; } } }
    const O=cam(hc);
    // the hull's own box in its local axes: a ray is only marched where it is inside all three slabs
    let umin=1e9,umax=-1e9,Rs=0; rows.forEach((r,i)=>{ if(!r) return; const y=i+dy; umin=Math.min(umin,(CY-y-1)*k); umax=Math.max(umax,(CY-y)*k); Rs=Math.max(Rs,r.Rout); });
    Rs=Math.max(Rs,hr*(M.hairK||1.06)+0.7)+0.5;
    const box=sh?{s:[-hr-1,hr+1],u:[umin-0.5,umax+0.5],f:[0,hr+1.2]}:{s:[-Rs,Rs],u:[umin-0.5,umax+0.5],f:[-Math.max(Rs*dz,Math.abs(fF)+T)-0.5,Math.max(Rs*dz,Math.abs(fF)+T)+0.5]};
    const lc=camv(l),hcv=camv(h),gc=camv(g);
    let bb=[1e9,1e9,-1e9,-1e9]; for(const a of box.s) for(const b of box.u) for(const c of box.f){ const p=add(O,sc(lc,a),sc(hcv,b),sc(gc,c)); bb=[Math.min(bb[0],p[0]),Math.min(bb[1],p[1]),Math.max(bb[2],p[0]),Math.max(bb[3],p[1])]; }
    return {k:'v',O,g:gc,h:hcv,l:lc,Rb:Rb+Math.max(T,3)+1,test,mat:'hat',o:{},box,bb2:bb,
      crownRole, brimU:wide>=0?(CY-(wide+dy+0.5))*k:0};
  }
  function hitV(P,x,y,floor){ const qx=x-P.O[0], qy=y-P.O[1];
    // clip the ray (dz along the view) to the three slabs of the hull's box
    let t0=-1e9,t1=1e9;
    for(const [ax,rg] of [[P.l,P.box.s],[P.h,P.box.u],[P.g,P.box.f]]){ const c=qx*ax[0]+qy*ax[1], d=ax[2];
      if(Math.abs(d)<1e-6){ if(c<rg[0]||c>rg[1]) return null; continue; }
      let a=(rg[0]-c)/d, b=(rg[1]-c)/d; if(a>b){ const t=a; a=b; b=t; } if(a>t0) t0=a; if(b<t1) t1=b; if(t0>t1) return null; }
    const hi=P.O[2]+t1, lo=Math.max(P.O[2]+t0,floor==null?-1e9:floor); if(hi<lo) return null;
    const at=D=>{ const dz=D-P.O[2];
      return P.test(qx*P.l[0]+qy*P.l[1]+dz*P.l[2], qx*P.h[0]+qy*P.h[1]+dz*P.h[2], qx*P.g[0]+qy*P.g[1]+dz*P.g[2]); };
    for(let D=hi;D>=lo;D-=0.4){ let h=at(D); if(!h) continue;
      let a=D+0.4,b=D; for(let i=0;i<4;i++){ const m=(a+b)/2, hm=at(m); if(hm){ b=m; h=hm; } else a=m; }
      const ln=h.n, n=norm(add(sc(P.l,ln[0]),sc(P.h,ln[1]),sc(P.g,ln[2])));
      return {D:b,n,m:h.r.m,dt:h.r.dt||0,gloss:h.r.gloss!=null?h.r.gloss:1}; }
    return null; }
  function haloParts(M,pal){ const {hc,look,hup,Lf,hr}=M, c=add(hc,sc(hup,hr*1.32)), out=[], N=18, R=hr*0.82;
    for(let i=0;i<N;i++){ const a=i/N*2*Math.PI, b=(i+1)/N*2*Math.PI, p=t=>add(c,sc(look,R*Math.cos(t)),sc(Lf,R*Math.sin(t)));
      out.push(capsule(p(a),p(b),0.85,'x:'+(i%3?pal['4']:pal['6']),{gloss:3})); } return out; }

  // a walk frame is a phase of the step (w0 to w7) and is seen from higher up, the tour map's camera
  const WALK_N=8, WALK_EL=42;   // the trail camera (putt/trail.js) looks down at 42 degrees, the same as the holes
  function walkPose(key){ if(key==='ws') return {ph:0,stand:1,phi:0,hinge:0,turn:0,hip:0,head:0,heel:0};
    const ph=(+key.slice(1)||0)/WALK_N, c=Math.cos(ph*2*Math.PI);
    return {ph,phi:0,hinge:0,turn:-5*c,hip:7*c,head:0,heel:0}; }

  /* THE MENU GOLFER (MO): the profile golfer's own proportions, as a 3D model. Every size and
     height below is read off the 44 by 56 profile drawing in cells (feet at u=0, head top near 50): a head that
     sits on the collar, a broad straight torso, short sleeves, both hands on the grip above the belt, full
     trouser legs and the shoes. Facing the camera along F. */
  // a club head that looks like its type: a driver's pear-shaped head with a dark crown, a fairway wood, an iron or
  // wedge blade with grooves, or a putter. Its colours are the club's own kit (head H, face F, highlight S, trim G).
  function profileClub(push,hands,h0,F,U,id,pal,outV){
    const type=id==='persimmon'?'wood':String(id).indexOf('pu_')===0?'putter':(typeof CLUB_RECOLOR!=='undefined'&&CLUB_RECOLOR[id])||(id==='blade'?'iron':'driver');
    const kit=!!(pal&&pal.H), X=h=>'x:'+h;
    const out0=sub(h0,hands); const out=outV?norm(outV):norm([out0[0],0,out0[2]]), cdir=norm(sub(h0,hands));
    const along=t=>add(hands,sc(cdir,t)), hoselTop=add(h0,sc(U,1.6),sc(out,-0.25));
    push(capsule(along(-1.1),along(3.6),0.92,X(kit&&pal.G?pal.G:'#26262e')));                               // the grip
    push(capsule(along(3.6),hoselTop,0.33,X((pal&&pal.l)||'#c4ccd4'),{gloss:2}));                           // the shaft
    push(capsule(add(hoselTop,sc(cdir,-0.3)),hoselTop,0.45,'x:#1b1d22'));                                    // the ferrule
    const AXc=[F,U,out];
    if(type==='driver'||type==='wood'){ const big=type==='driver', R=big?[2.45,1.2,2.85]:[1.95,0.95,2.3];
      const crown=id==='persimmon'||id==='rosewood'?(pal.W||pal.H):kit?pal.H:'#24282f', face=kit?(pal.F||'#cfd3da'):'#3a3f48', sole=kit?(pal.S||'#cfd3da'):'#cfd3da';
      const C=add(h0,sc(out,R[2]*0.9),sc(U,R[1]-1.3+0.05),sc(F,-0.25));
      push(capsule(hoselTop,add(C,sc(out,-R[2]*0.82),sc(U,R[1]*0.2)),0.52,X(crown),{gloss:2}));             // the hosel
      push(ellipsoid(C,AXc,R,X(crown),{gloss:3}));                                                           // the head, crown up
      push(over(C,AXc,R,X(face),l=>l[0]>0.62&&l[1]<0.55,{gloss:1}));                                         // the face
      push(over(C,AXc,R,X(sole),l=>l[1]<-0.45,{gloss:2}));                                                   // the sole plate
      push(over(C,AXc,R.map(v=>v*1.01),X(kit?(pal.S||'#f4f7fa'):'#e8ebf0'),l=>l[1]>0.55&&l[0]>0.15&&Math.abs(l[2])<0.06)); }   // the alignment line on the crown
    else if(type==='iron'||type==='wedge'){ const R=type==='wedge'?[0.62,1.75,2.0]:[0.55,1.45,2.15];
      const body=kit?pal.H:'#b7bdc6', face=kit?(pal.F||'#dfe4ea'):'#dfe4ea', C=add(h0,sc(out,R[2]*0.95),sc(U,R[1]-1.15));
      push(capsule(hoselTop,add(C,sc(out,-R[2]*0.85),sc(U,-R[1]*0.35)),0.45,X(body),{gloss:2}));
      push(ellipsoid(C,AXc,R,X(body),{gloss:2}));
      push(over(C,AXc,R,X(face),l=>l[0]>0.35,{gloss:2}));
      for(const g of [-0.45,-0.15,0.15,0.45]) push(over(C,AXc,R.map(v=>v*1.01),X(kit?(pal.G||'#5a626c'):'#6f7884'),l=>l[0]>0.45&&Math.abs(l[1]-g)<0.05&&Math.abs(l[2])<0.7)); }   // the grooves
    else { const mallet=id==='mallet'||['pu_halfmoon','pu_counter','pu_scope','pu_bank','pu_buoy'].indexOf(id)>=0, R=mallet?[1.8,0.7,1.9]:[0.75,0.72,2.35], body=kit?pal.H:'#5a636e';
      const C=add(h0,sc(out,R[2]*0.75),sc(U,R[1]-1.25));
      push(capsule(hoselTop,add(C,sc(out,-R[2]*0.55),sc(U,R[1]*0.5)),0.42,X(body),{gloss:2}));
      push(ellipsoid(C,AXc,R,X(body),{gloss:2}));
      push(over(C,AXc,R.map(v=>v*1.01),X(kit?(pal.S||'#e2e6ec'):'#f4f7fa'),l=>l[1]>0.6&&Math.abs(l[2])<0.06));   // the sight line
      if(kit&&pal.F) push(over(C,AXc,R,X(pal.F),l=>l[0]>0.55&&Math.abs(l[1])<0.6,{gloss:2}));                          // the face insert
      if(kit&&pal.G) push(over(C,AXc,R,X(pal.G),l=>l[1]<-0.45)); }                                                      // the sole
  }

  /* THE MENU GOLFER'S NOVELTY CLUBS. Each is modelled as the thing it is, at the menu golfer's scale, held in the
     dominant hand with its business end on the grass. Anything wide (a blade, a crossguard, a fork) is laid flat
     to the camera along `out` (away from the body) so it reads from the front: the course model lays them along
     the face, which the menu camera sees edge on. Colours are each club's own palette. */
  function profileNovelty(push,A,B,F,U,out,id,pal){
    const X=h=>'x:'+h, d=norm(sub(B,A)), L=Math.hypot(...sub(B,A)), at=t=>add(A,sc(d,t)), up=sc(d,-1);
    const sd=norm(sub(out,sc(d,dot(out,d)))), fw=norm(cross(sd,d)), AXd=[d,sd,fw];
    const ring=(t,r,c,h)=>push(ellipsoid(at(t),AXd,[h||0.35,r,r],X(c),{gloss:2}));
    if(id==='excalibur'){ // a longsword, point down: pommel, wrapped grip, crossguard with its gem, a tapering blade
      push(ellipsoid(at(-2.0),AXd,[0.85,0.95,0.95],X(pal.P),{gloss:3}));
      push(capsule(at(-1.6),at(1.5),0.62,X(pal.g)));
      for(const t of [-1.1,1.1]) ring(t,0.68,pal.x,0.16);
      const g0=at(2.1); push(capsule(add(g0,sc(sd,-3.0)),add(g0,sc(sd,3.0)),0.5,X(pal.X),{gloss:3}));
      for(const k of [-1,1]) push(ellipsoid(add(g0,sc(sd,3.1*k),sc(d,0.45)),AXd,[0.6,0.45,0.45],X(pal.X),{gloss:3}));
      push(ellipsoid(add(g0,sc(fw,0.45)),AXd,[0.55,0.55,0.35],X(pal.M),{gloss:3,noCast:1}));
      const b0=2.6, n=18, len=L-b0+0.6;   // the blade: straight edges tapering to the point (many short overlapping slices)
      for(let i=0;i<n;i++){ const t0=b0+len*i/n, t1=b0+len*(i+1)/n, k=i/(n-1), w=k<0.78?1.3-0.25*k:1.1*(1-k)/0.22+0.08;
        push(ellipsoid(at((t0+t1)/2),AXd,[(t1-t0)*1.1,w,0.3],X(pal.S),{gloss:3})); }
      push(capsule(at(b0+0.2),at(b0+len*0.82),0.2,X(pal.s),{noCast:1}));                                   // the fuller
      push(capsule(add(at(b0+0.3),sc(sd,1.05),sc(fw,0.15)),add(at(b0+len*0.7),sc(sd,0.45),sc(fw,0.15)),0.13,X(pal.l),{noCast:1}));   // a lit edge
      return; }
    if(id==='coffin'){ // the scythe: a wooden snath with two nibs, and a long curved blade on the grass
      push(capsule(at(-1.3),at(L-0.6),0.62,X(pal.W),{gloss:1}));
      for(const t of [4.2]) push(capsule(at(t),add(at(t+0.4),sc(fw,1.9),sc(sd,0.3)),0.42,X(pal.w)));
      const base=add(at(L-1.0)), dir=norm(add(sd,sc(fw,0.2))); let prev=base;   // the blade sweeps away from the body
      push(ellipsoid(base,AXd,[0.9,0.9,0.9],X(pal.G),{gloss:2}));                                          // the collar
      for(let i=1;i<=10;i++){ const k=i/10, p=add(base,sc(dir,9.5*k),sc(U,1.6*k*k)), w=1.75*(1-0.7*k)+0.15;
        const tan=norm(sub(p,prev)), nrm=norm(cross(fw,tan)), m=sc(add(prev,p),0.5), seg=Math.hypot(...sub(p,prev));
        push(ellipsoid(add(m,sc(nrm,w*0.35)),[tan,nrm,fw],[seg*0.62,w,0.26],X(pal.L),{gloss:3}));
        push(ellipsoid(add(m,sc(nrm,-w*0.55)),[tan,nrm,fw],[seg*0.6,0.32,0.34],X(pal.S),{gloss:2,noCast:1}));   // the spine
        prev=p; }
      return; }
    if(id==='scepter'){ // a royal sceptre, its jewelled orb on the grass
      push(ellipsoid(at(-1.9),AXd,[0.9,0.9,0.9],X(pal['4']),{gloss:3})); push(ellipsoid(at(-2.7),AXd,[0.5,0.5,0.5],X(pal.A),{gloss:3}));
      push(capsule(at(-1.4),at(L-3.4),0.55,X(pal['4']),{gloss:3}));
      for(const t of [3,6.5,10]) ring(t,0.72,pal['5'],0.22);
      const o=at(L-1.8); push(ellipsoid(at(L-3.6),AXd,[0.5,1.25,1.25],X(pal['5']),{gloss:2}));
      push(ellipsoid(o,AXd,[1.8,1.8,1.8],X(pal['4']),{gloss:3}));
      push(ellipsoid(o,AXd,[0.35,1.86,1.86],X(pal['5']),{noCast:1}));
      for(const v of [fw,sd,sc(sd,-1)]) push(ellipsoid(add(o,sc(v,1.75)),[v,d,norm(cross(v,d))],[0.45,0.7,0.6],X(pal.A),{gloss:3,noCast:1}));
      return; }
    if(id==='candycane'){ // a striped cane, the hook curling forward at the grass
      const pts=[]; for(let i=0;i<=10;i++) pts.push(at(-1.3+(L-2.2+1.3)*i/10));
      const c=add(at(L-2.2),sc(sd,2.0)); for(let i=1;i<=7;i++){ const a=i*Math.PI/7; pts.push(add(c,sc(sd,-2.0*Math.cos(a)),sc(d,2.0*Math.sin(a)))); }
      for(let i=1;i<pts.length;i++) push(capsule(pts[i-1],pts[i],0.75,X(i%2?pal.L:pal.K),{gloss:2}));
      return; }
    if(id==='wand'){ // a wizard's wand with gold bands, a gold star at its end and sparkles
      push(capsule(at(-1.3),at(L-2.6),0.5,X(pal.l),{gloss:2}));
      for(const t of [1.8,L*0.5]) ring(t,0.62,pal.b,0.25);
      const s0=at(L-1.4), pl=[sd,up];
      push(ellipsoid(s0,[fw,sd,d],[0.55,1.0,1.0],X(pal.T),{gloss:3}));
      for(let i=0;i<5;i++){ const a=(i*72+180)*D2R, v=norm(add(sc(sd,Math.sin(a)),sc(up,Math.cos(a))));
        push(ellipsoid(add(s0,sc(v,1.3)),[v,norm(cross(fw,v)),fw],[1.2,0.5,0.45],X(i%2?pal.t:pal.T),{gloss:3})); }
      for(const [a,b] of [[2.6,0.8],[-2.2,1.6],[1.4,-2.4]]) push(ellipsoid(add(s0,sc(sd,a),sc(up,b)),AXd,[0.32,0.32,0.32],X(pal.s),{noCast:1}));
      return; }
    if(id==='hockey'){ // a wooden stick, taped, its blade along the grass
      push(capsule(at(-1.3),at(L-1.0),0.62,X(pal.H),{gloss:1}));
      push(capsule(at(-1.2),at(0.8),0.7,X(pal.K)));
      const h0=at(L-1.0), bd=norm(add(sd,sc(fw,0.25))), bc=add(h0,sc(bd,2.9),sc(U,-0.1));
      push(capsule(h0,add(h0,sc(bd,1.2)),0.65,X(pal.W)));
      push(ellipsoid(bc,[bd,U,fw],[3.4,1.0,0.45],X(pal.W),{gloss:1}));
      push(over(bc,[bd,U,fw],[3.4,1.0,0.45],X(pal.t),l=>l[0]>-0.1&&l[0]<0.6));
      return; }
    if(id==='glizzy'){ // a hot dog in its bun, mustard on top, for a club head
      push(capsule(at(-1.3),at(1.6),0.85,X('#26262e'))); push(capsule(at(1.6),at(L-1.8),0.42,X('#c4ccd4'),{gloss:2}));
      const hc=add(at(L-1.2),sc(sd,1.6)), AXh=[sd,U,fw];
      push(ellipsoid(add(hc,sc(U,-0.25)),AXh,[3.2,1.0,1.35],X(pal.B),{gloss:1}));
      push(capsule(add(hc,sc(sd,-3.6),sc(U,0.25)),add(hc,sc(sd,3.6),sc(U,0.25)),0.82,X(pal.D),{gloss:2}));
      for(let i=0;i<7;i++){ const x=-2.7+i*0.9; push(ellipsoid(add(hc,sc(sd,x),sc(U,1.05),sc(fw,(i%2?0.3:-0.3))),AXh,[0.55,0.22,0.3],X(pal.M),{noCast:1})); }
      return; }
    if(id==='poolnoodle'){ // a foam pool noodle, bending as it meets the grass
      const pts=[]; for(let i=0;i<=8;i++){ const k=i/8; pts.push(add(at(0.5+(L-3.3)*k),sc(sd,3.4*k*k*k))); }
      for(let i=1;i<pts.length;i++) push(capsule(pts[i-1],pts[i],1.3,X(i%3===0?pal.n:pal.N),{gloss:1}));
      push(ellipsoid(pts[0],AXd,[0.4,1.0,1.0],X(pal.O)));
      return; }
    if(id==='broomstick'){ // a witch's broom: a wooden handle, a red binding and a straw bundle
      push(capsule(at(-1.3),at(L-5.0),0.58,X(pal.W),{gloss:1}));
      push(ellipsoid(at(L-5.0),AXd,[0.65,1.0,1.0],X(pal.R),{gloss:2}));
      for(let i=0;i<6;i++){ const k=i/5, c=at(L-4.4+4.0*k); push(ellipsoid(c,AXd,[0.75,1.2+2.0*k,1.0+1.0*k],X(i%2?pal.y:pal.Y),{gloss:1})); }
      for(const k of [-1.8,-0.6,0.6,1.8]) push(capsule(add(at(L-3),sc(sd,k*0.8)),add(at(L-0.1),sc(sd,k*1.5)),0.22,X(pal.y),{noCast:1}));
      return; }
    if(id==='pitchfork'){ // a wooden shaft, a steel crossbar and three tines down to the grass
      push(capsule(at(-1.3),at(L-4.6),0.55,X(pal.W),{gloss:1}));
      const cb=at(L-4.6); push(ellipsoid(cb,AXd,[0.55,0.8,0.8],X(pal.G),{gloss:2}));
      push(capsule(add(cb,sc(sd,-2.3)),add(cb,sc(sd,2.3)),0.45,X(pal.G),{gloss:2}));
      for(const k of [-2.3,0,2.3]){ const t0=add(cb,sc(sd,k)); push(capsule(t0,add(t0,sc(d,4.2)),0.36,X(pal.S),{gloss:3}));
        push(ellipsoid(add(t0,sc(d,4.3)),AXd,[0.3,0.3,0.3],X(pal.L),{gloss:3,noCast:1})); }
      return; }
  }

  /* THE BODY SKINS ON THE MENU GOLFER, built the way their art draws them. Pumpkin Head is a scarecrow: a lobed
     pumpkin for a head with a carved face lit from inside and a stem, straw for arms poking out of the sleeves,
     and a patched shirt and trousers. Zombie keeps the golfer's body in grey-green and tears the shirt: holes
     with the skin showing through and frayed edges, old blood at the shoulder and a ragged hem. */
  function pumpkinHead(push,hc,gz,up,sd,hr,z){ const AXh=[gz,up,sd], R=[hr*1.08,hr*0.9,hr*1.16], c=add(hc,sc(up,-0.6));
    const org=z.skin||'#e8801f', X=h=>'x:'+h, rib=mix2(org,'#7a3410',0.45), glow=z.eye||'#ffd23a', rim='#5a2a0c';
    push(ellipsoid(c,AXh,R,X(org),{gloss:2,bias:.08}));
    for(let k=0;k<8;k++){ const a0=k*Math.PI/4;   // the ribs: grooves from the stem to the base
      push(over(c,AXh,R,X(rib),l=>{ const a=Math.atan2(l[2],l[0]); let d=Math.abs(((a-a0)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI); return d<0.07&&Math.abs(l[1])<0.92; },{dt:-1,noCast:1})); }
    const R2=R.map(v=>v*1.01), face=l=>l[0]>0.45;
    const eye=(l,s)=>{ const x=l[2]*s, y=l[1]; return y>0.02&&y<0.38&&x>0.16&&x<0.56&&(y-0.02)<(0.36)*(1-Math.abs(x-0.36)/0.2); };   // a triangle, point up
    const mouth=l=>{ const x=l[2], y=l[1]; if(Math.abs(x)>0.6||y>-0.12||y<-0.5) return false; const lo=-0.5+0.16*(1-(x/0.6)**2), hi=-0.12-0.1*(x/0.6)**2;
      if(y<lo||y>hi) return false; const t=((x+0.6)/0.2)|0; return !((t%2===0)&&(y>hi-0.09||y<lo+0.09)); };   // a grin with square teeth
    const nose=l=>{ const x=Math.abs(l[2]), y=l[1]; return y>-0.1&&y<0.06&&x<0.1-(y+0.1)*0.4; };
    const cut=l=>face(l)&&(eye(l,1)||eye(l,-1)||mouth(l)||nose(l));
    push(over(c,AXh,R2.map(v=>v*1.005),X(rim),l=>face(l)&&(eye({0:l[0],1:l[1]+0.03,2:l[2]*0.95},1)||eye({0:l[0],1:l[1]+0.03,2:l[2]*0.95},-1)||mouth({0:0,1:l[1]+0.02,2:l[2]*0.97})||nose(l)),{noCast:1}));
    push(over(c,AXh,R2.map(v=>v*1.01),X(glow),cut,{noCast:1,gloss:0,dt:1}));
    const top=add(c,sc(up,R[1]*0.93)), st=add(top,sc(up,2.6),sc(sd,0.9),sc(gz,-0.3));
    push(capsule(top,st,0.9,X(z.hair||'#3f5a1e'),{gloss:1}));                                   // the stem
    push(ellipsoid(add(top,sc(sd,-2.0),sc(up,0.4)),[sd,up,gz],[2.1,0.4,1.1],X(mix2(z.hair||'#3f5a1e','#9ac040',0.4))));   // a leaf
  }
  function profileModel(aimV,gear){ gear=gear||{};
    const F=norm(aimV), U=V(0,1,0), T=norm(cross(F,U)), P=(f,u,t)=>add(sc(F,f),sc(U,u),sc(T,t));
    let tag='';   // the item the parts being pushed belong to, so a tile can draw it alone (MO.only)
    const HD=(MO?MO.K:1)>=2, parts=[], push=p=>{ if(tag) p.o.item=tag; parts.push(p); }, top=gear.top, tpal=gear.topPal||{}, cl=gear.cleats, lg=gear.legPal;
    const body=top==='shacket'?'plaid':'shirt', AX=[F,U,T];
    // THE BUILD: a lean golfer. BW narrows the torso, hips and belt, AW brings the arms, hands and club in to match.
    const BW=0.84, AW=0.87;
    // shoes and legs
    for(const s of [1,-1]){ const t=3.6*s; tag=lg?'leg':'pants';
      if(lg){ const knee=P(0.4,9.2,t*1.02); push(capsule(P(0,15.8,t),knee,3.3,'pants')); push(ellipsoid(add(knee,sc(U,-0.6)),AX,[3.35,1.9,3.35],'pants',{dt:-1})); push(capsule(add(knee,sc(U,-1.6)),P(0,3.2,t),2.35,'sock')); }
      else { push(capsule(P(0,15.8,t),P(0.15,9.4,t*1.01),3.2,'pants')); push(capsule(P(0.15,9.4,t*1.01),P(0.1,4.6,t*1.02),2.8,'pants'));
        if(HD){ push(capsule(P(3.15,14.6,t),P(3.0,9.4,t*1.01),0.42,'pants',{dt:1,noCast:1})); push(capsule(P(3.0,9.4,t*1.01),P(2.75,5.0,t*1.02),0.4,'pants',{dt:1,noCast:1})); } }
      tag='';
      // a golf shoe, toes turned out a little as a golfer stands, so its saddle and laces show
      const z=3.95*s, sole=cl?'x:'+cl.sole:'sole', sad='x:'+gear.saddleHex, toe=12*D2R;
      const Fs=norm(add(sc(F,Math.cos(toe)),sc(T,s*Math.sin(toe)))), Ts=norm(cross(Fs,U)), AXs=[Fs,U,Ts], b0=P(0.2,0,z);
      const Q=(f,u,t)=>add(b0,sc(Fs,f),sc(U,u),sc(Ts,t||0)), n0=parts.length;
      push(ellipsoid(Q(1.5,0.6),AXs,[5.4,0.62,3.15],sole,{gloss:1}));                                    // the sole
      push(ellipsoid(Q(1.5,1.12),AXs,[5.3,0.27,3.1],'x:#4a3b2e',{noCast:1}));                             // the welt
      for(const f of [-2.6,1.2,4.4]) for(const d of [1.1,-1.1]) push(ellipsoid(Q(1.5+f,0.05,d),AXs,[0.5,0.32,0.5],'x:#2a2a30',{noCast:1}));   // spikes
      push(ellipsoid(Q(4.0,1.85),AXs,[2.75,1.3,2.85],'shoe',{gloss:2,bias:.12}));                         // the toe box
      push(ellipsoid(Q(1.1,2.4),AXs,[3.2,1.95,2.85],'shoe',{gloss:2,bias:.12}));                          // the vamp
      push(ellipsoid(Q(-1.8,2.2),AXs,[1.85,1.85,2.7],'shoe',{gloss:1}));                                 // the heel counter
      push(over(Q(1.1,2.4),AXs,[3.2,1.95,2.85],sad,l=>l[0]>-0.5&&l[0]<0.42&&l[1]>-0.5,{gloss:1}));         // the saddle
      push(over(Q(4.0,1.85),AXs,[2.75,1.3,2.85],sad,l=>l[0]>0.55&&l[1]>-0.4,{gloss:1}));                   // the toe cap
      push(ellipsoid(Q(1.9,3.75),AXs,[1.35,0.45,1.15],'shoe',{noCast:1}));                                // the tongue
      if(HD) for(const k of [0.9,1.85,2.8]) push(capsule(Q(k,3.2+0.09*(2.8-k),-1.15),Q(k,3.2+0.09*(2.8-k),1.15),0.28,'lace',{noCast:1}));
      for(let i=n0;i<parts.length;i++){ parts[i].o.item='shoe'; parts[i].o.side=s; } }
    // hips and belt
    tag=lg?'leg':'pants'; push(ellipsoid(P(0,15.6,0),AX,[4.4,3.1,8.5*BW],'pants')); tag='';
    push(ellipsoid(P(0.05,17.75,0),AX,[4.8,0.72,8.95*BW],'belt',{gloss:1}));
    if(HD){ push(ellipsoid(P(4.8,17.75,0),AX,[0.5,0.85,1.15],'x:#d6a640',{gloss:2,noCast:1})); push(ellipsoid(P(5.05,17.75,0),AX,[0.4,0.42,0.6],'belt',{noCast:1})); }
    // THE SHIRT. A tall ellipsoid trimmed top and bottom (nearly straight sides, no barrel), sloped shoulders, a
    // little blousing where it tucks into the belt, and tension folds from each armpit toward the buckle.
    // The menu's phase (0 to 1) breathes it: the chest swells a touch, the shoulders lift, the folds drift.
    const ph=(MO?MO.phase:0)*2*Math.PI, br=Math.sin(ph), sw=Math.sin(ph+1.1);
    const jacket=top==='cardigan'||top==='blazer'||top==='shacket'; tag=jacket?'top':'shirt';
    const tc=P(0,27,0), TR=[4.6*(1+0.012*br),22,8.55*BW*(1+0.014*br)], lo=-(27-17.4)/22, hi=(33.6-27)/22, inT=l=>l[1]>lo&&l[1]<hi;
    push(ellipsoid(tc,AX,TR,body,{cut:inT}));
    for(const s of [1,-1]) push(capsule(P(-0.2,32.5+0.12*br,2.6*s),P(-0.2,30.6+0.15*br,6.5*s),2.1,body));    // the shoulders, sloping
    push(ellipsoid(P(0.2,19.0,0),AX,[4.8,1.35,8.75*BW+0.08*sw],body,{dt:0}));                                     // blousing over the belt
    push(capsule(P(0.3,32.2,0),P(0.6,35.8,0),2.85,'skin',{dt:-1}));                                              // the neck, under the head
    push(ellipsoid(P(0.7,33.5,0),AX,[3.7,1.15,4.7],body,{dt:1}));                                                // the collar
    if(HD&&top!=='blazer'){ const d=0.02*sw;
      // folds: two from each armpit in toward the buckle, and creases just above the belt
      for(const s of [1,-1]){
        push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.15&&l[1]>-0.36&&l[1]<0.04&&Math.abs(l[2]*s-(0.80+1.45*l[1]+d))<0.05,{dt:-1,noCast:1}));
        push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.15&&l[1]>-0.40&&l[1]<-0.1&&Math.abs(l[2]*s-(0.95+1.6*l[1]-d))<0.045,{dt:-1,noCast:1}));
        push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.15&&l[1]>-0.30&&l[1]<0.02&&Math.abs(l[2]*s-(0.875+1.45*l[1]+d))<0.03,{dt:1,noCast:1})); }   // the lit side of the first fold
      for(const [y,w] of [[-0.385,0.55],[-0.405,0.35]]) push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.2&&Math.abs(l[1]-y-0.004*sw)<0.006&&Math.abs(l[2])<w,{dt:-1,noCast:1})); }
    if(top==='cardigan'||top==='shacket'){ push(over(tc,AX,TR,'polo',l=>inT(l)&&l[0]>0.3&&Math.abs(l[2])<0.13+0.6*Math.max(0,l[1]-0.05)));
      for(const u of [20.4,23.6,26.8]) push(ellipsoid(P(4.85,u,0.9),AX,[0.5,0.5,0.5],'x:'+(tpal['4']||'#5f4c2e'),{gloss:2,noCast:1})); }
    else if(top==='blazer'){ push(over(tc,AX,TR,'x:'+tpal['6'],l=>inT(l)&&l[0]>0.25&&l[1]>0.0&&Math.abs(l[2])<0.5*(l[1]+0.05)));
      push(over(tc,AX,TR.map(v=>v*1.01),'x:'+tpal['7'],l=>inT(l)&&l[0]>0.25&&l[1]>-0.1&&Math.abs(l[2])<0.07));
      for(const u of [20.6,22.6]) push(ellipsoid(P(4.85,u,0),AX,[0.5,0.5,0.5],'x:'+tpal['4'],{gloss:2,noCast:1})); }
    else if(HD){ // the polo: collar points, a placket and two buttons, in their own material so the seams are drawn
      for(const s of [1,-1]) push(ellipsoid(P(4.2,32.4,1.9*s),AX,[0.65,1.35,1.55],'polo',{dt:1,noCast:1}));
      push(over(tc,AX,TR,'polo',l=>inT(l)&&l[0]>0.45&&Math.abs(l[2])<0.075&&l[1]>0.1&&l[1]<0.29));
      for(const u of [30.0,28.2]) push(ellipsoid(P(4.82,u,0),AX,[0.42,0.45,0.45],'polo',{dt:-1,gloss:2,noCast:1})); }
    // THE ARMS, at rest. Each joins the body only at the shoulder and hangs clear of the shirt. The dominant hand
    // (the right for a righty) holds the club, its head on the grass beside that foot; the other hand wears the glove.
    const dom=gear.lefty?-1:1, scare=gear.body==='pumpkinhead', zomb=gear.body==='zombie', bp=gear.bodyPal||{};
    // the body skins' clothes, as their art draws them
    if(scare&&!jacket){ const pc=P(4.6,24.2,-3.2);   // a burlap patch on the chest, stitched at its corners
      push(ellipsoid(pc,AX,[0.4,1.55,1.5],'x:#a8844e',{noCast:1}));
      for(const a of [-1,1]) for(const b of [-1,1]) push(ellipsoid(add(pc,sc(F,0.25),sc(U,1.2*a),sc(T,1.15*b)),AX,[0.3,0.32,0.32],'x:#5a4428',{noCast:1}));
      push(ellipsoid(P(3.1,10.2,3.6),AX,[0.45,1.4,1.3],'x:#8a6a3c',{noCast:1})); }        // and one on the knee
    if(zomb&&!jacket){ const skn='skin', fr='x:#2e241a', n=(u,t)=>0.35*Math.sin(u*90+t*23)+0.25*Math.sin(u*37-t*61);   // ragged edges
      const tear=(u0,t0,ru,rt)=>l=>{ const a=(l[1]-u0)/ru, b=(l[2]-t0)/rt, du=0.8*a+0.6*b, dt2=-0.6*a+0.8*b; return du*du*2.4+dt2*dt2*0.55+n(l[1],l[2])<1; };   // a rip, on the diagonal
      const ring=(u0,t0,ru,rt)=>l=>{ const a=(l[1]-u0)/ru, b=(l[2]-t0)/rt, du=0.8*a+0.6*b, dt2=-0.6*a+0.8*b, d=du*du*2.4+dt2*dt2*0.55+n(l[1],l[2]); return d>=1&&d<1.6; };
      for(const [u0,t0,ru,rt] of [[-0.02,0.34,0.09,0.2],[-0.24,-0.4,0.06,0.14]]){   // holes torn in the shirt, frayed round the edge
        push(over(tc,AX,TR.map(v=>v*1.005),fr,l=>inT(l)&&l[0]>0.2&&ring(u0,t0,ru,rt)(l),{noCast:1}));
        push(over(tc,AX,TR.map(v=>v*1.01),skn,l=>inT(l)&&l[0]>0.2&&tear(u0,t0,ru,rt)(l),{dt:-1,noCast:1})); }
      push(over(tc,AX,TR.map(v=>v*1.005),'x:#6a2424',l=>inT(l)&&l[0]>0.1&&tear(0.2,-0.62,0.06,0.16)(l),{noCast:1}));        // old blood at the shoulder
      push(over(tc,AX,TR.map(v=>v*1.01),skn,l=>inT(l)&&l[0]>0.1&&l[1]<-0.37&&((l[2]*7+9)%2)<0.9&&l[1]<-0.37-0.04*Math.abs(Math.sin(l[2]*11)),{noCast:1}));   // the hem, torn into strips
    }
    for(const s of [1,-1]){ const hold=s===dom, slv=top==='blazer'?'x:'+tpal['1']:body;
      const sh=P(-0.2,30.0+0.15*br,9.2*AW*s), el=hold?P(0.9,23.0,10.5*AW*s):P(0.4,23.0,10.4*AW*s), wr=hold?P(2.4,17.7,11.0*AW*s):P(1.3,17.3,10.9*AW*s);
      const se=add(sh,sc(sub(el,sh),0.48)), mid=add(el,sc(sub(wr,el),0.45)), flap=sc(F,0.12*sw*s);
      if(top==='blazer'){ push(capsule(sh,el,2.15,slv)); push(capsule(el,wr,1.85,slv)); }
      else { push(capsule(sh,add(se,flap),2.3,slv)); if(HD) push(capsule(add(sh,sc(sub(se,sh),0.78)),add(se,flap),2.42,slv,{dt:-1,noCast:1}));   // the sleeve, its hem moving a little
        if(HD) push(over(add(sh,sc(sub(se,sh),0.45)),AX,[2.4,2.4,2.4],slv,l=>Math.abs(l[1]+0.35*l[0]*s-0.1)<0.07&&l[0]>-0.2,{dt:-1,noCast:1}));   // a crease across the sleeve
        push(capsule(se,el,1.6,'skin')); push(ellipsoid(el,AX,[1.55,1.5,1.6],'skin'));                                  // the upper arm and elbow
        push(capsule(el,mid,1.5,'skin')); push(capsule(mid,wr,1.22,'skin'));                                             // the forearm, to the wrist
        if(scare){ const strw='x:'+(bp.straw||'#d8b04e'), dk='x:#a8843a';   // straw arms, tufts out of the sleeve and the cuff
          for(let k=0;k<6;k++){ const a=k*Math.PI/3, o=add(sc(F,Math.cos(a)*1.9),sc(T,Math.sin(a)*1.9*s));
            push(capsule(add(se,o),add(se,sc(o,1.35),sc(U,-1.4)),0.32,k%2?strw:dk,{noCast:1}));
            push(capsule(add(wr,sc(o,0.55)),add(wr,sc(o,0.95),sc(U,-1.5)),0.26,k%2?strw:dk,{noCast:1})); }
          if(!hold&&!jacket) push(ellipsoid(add(sh,sc(sub(se,sh),0.55),sc(F,2.45)),AX,[0.4,1.25,1.2],'x:#9c3a2e',{noCast:1})); } }   // a red patch on the sleeve
      const hand=add(wr,sc(U,-1.5),sc(F,hold?0.35:0.15));
      push(ellipsoid(hand,AX,[1.75,2.0,1.55],hold?'skin':'glove'));                                                       // a closed hand
      if(hold){ for(let k=0;k<4;k++) push(ellipsoid(add(hand,sc(F,1.45),sc(U,0.95-k*0.62),sc(T,s*0.15)),AX,[0.55,0.42,0.75],'skin',{dt:k===0?1:0}));   // the fingers round the grip
        push(ellipsoid(add(hand,sc(F,0.9),sc(U,1.35),sc(T,-s*0.35)),AX,[0.75,0.5,0.6],'skin',{dt:1})); }                                // the thumb over the top
      if(!hold) push(over(hand,AX,[1.75,2.0,1.55],'x:#d8d4c8',l=>l[1]>0.55,{noCast:1}));                                  // the glove's cuff
    }
    tag='';
    // THE CAPE: a sheet hung from the shoulders down to the calves behind the golfer, red lined, its high collar
    // behind the head and two gold clasps on the chest. Its edges show past the arms and legs from the front.
    if(top==='cape'){ tag='top';
      // the sheet: one shell behind the golfer, cut to a flare (narrow at the shoulders, wide at the calves), with a
      // red lining a touch inside it, which is what shows past the arms and legs from the front
      const cc=P(-3.8,14,0), CR=[4.2,30,16.5*BW], zl=l=>0.885-(l[1]+0.27)*0.342, keep=l=>l[0]<0.1&&l[1]<0.65&&l[1]>-0.29&&Math.abs(l[2])<zl(l);
      push(ellipsoid(cc,AX,CR,'x:'+tpal['1'],{cut:keep}));
      push(ellipsoid(add(cc,sc(F,0.3)),AX,CR.map(v=>v*0.96),'x:'+tpal['4'],{cut:keep,dt:-1}));
      push(ellipsoid(P(-0.8,32.7,0),AX,[5.0,1.9,9.6*BW],'x:'+tpal['1'],{cut:l=>l[0]<0.45}));                        // over the shoulders
      push(ellipsoid(P(-2.6,36.4,0),AX,[2.2,3.4,7.0],'x:'+tpal['4'],{cut:l=>l[0]<0.3&&l[1]>-0.6}));               // the high collar
      for(const s of [1,-1]) push(capsule(P(-1.8,34.0,4.6*s),P(-1.4,40.2,7.4*s),0.95,'x:'+tpal['4'],{gloss:1}));   // its two points
      for(const s of [1,-1]) push(ellipsoid(P(4.6,32.6,3.2*s),AX,[0.7,0.8,0.8],'x:'+tpal['5'],{gloss:3,noCast:1}));
      push(capsule(P(4.7,32.6,-3.0),P(4.7,32.6,3.0),0.2,'x:'+tpal['5'],{noCast:1}));
      tag=''; }
    // THE RUBBER DUCKY FLOATIE: an inflated ring round the waist with the duck's head and beak at the front
    if(top==='duckfloatie'){ tag='top'; const fc=P(0.4,18.6,0), ring=a=>add(fc,sc(F,7.4*Math.cos(a)),sc(T,11.2*BW*Math.sin(a)));
      const N=26; for(let i=0;i<N;i++) push(capsule(ring(i/N*2*Math.PI),ring((i+1)/N*2*Math.PI),2.5,'x:'+tpal['1'],{gloss:2,bias:.15}));
      for(let i=0;i<N;i+=2) push(capsule(add(ring(i/N*2*Math.PI),sc(U,1.9)),add(ring((i+1)/N*2*Math.PI),sc(U,1.9)),0.7,'x:'+tpal['3'],{noCast:1}));   // the shine
      const ha=-28*D2R, rp=ring(ha), o2=norm(add(sc(F,Math.cos(ha)),sc(T,Math.sin(ha)))), sd2=norm(cross(o2,U)), hd=add(rp,sc(U,5.0),sc(o2,0.6));
      push(capsule(add(rp,sc(U,1.2)),hd,1.6,'x:'+tpal['1'],{gloss:1})); push(ellipsoid(hd,[o2,U,sd2],[2.9,2.7,2.7],'x:'+tpal['1'],{gloss:2}));
      push(ellipsoid(add(hd,sc(o2,2.8),sc(U,-0.5)),[o2,U,sd2],[1.8,0.65,1.2],'x:'+tpal['4'],{gloss:2}));
      for(const s of [1,-1]) push(ellipsoid(add(hd,sc(o2,2.1),sc(U,0.9),sc(sd2,1.35*s)),[o2,U,sd2],[0.5,0.6,0.5],'x:'+tpal['5'],{noCast:1}));
      tag=''; }
    // the club, gripped in the dominant hand, its head on the grass just outside that foot
    if(gear.ballC){ const bp=P(6.2,3.2,-10.2*dom); push(capsule(P(6.2,0.2,-10.2*dom),P(6.2,1.5,-10.2*dom),0.32,'x:#e8ebf0'));   // the tee
      push(ellipsoid(add(bp,sc(U,-1.0)),AX,[0.8,0.35,0.8],'x:#e8ebf0')); push(ellipsoid(bp,AX,[1.8,1.8,1.8],'x:'+gear.ballC,{gloss:3})); }
    const hands=add(P(2.75,16.0,11.15*AW*dom)), clubHead=P(3.8,1.3,12.9*AW*dom), out=sc(T,dom);
    const id=gear.club||'driver', c0=parts.length;
    if(NOVELTY[id]||id==='pu_magicwand'){ profileNovelty(push,hands,clubHead,F,U,out,id==='pu_magicwand'?'wand':id,gear.clubPal||{}); }
    else profileClub(push,hands,clubHead,F,U,id,gear.clubPal||{},out);
    for(let i=c0;i<parts.length;i++) parts[i].o.item='club';
    // the head: on the collar, the profile's size
    const hc=P(0.7,42.0,0), gaze=norm(add(F,sc(U,-0.04))), hup=norm(cross(cross(gaze,U),gaze)), side=norm(cross(hup,gaze)), hr=7.8;
    if(gear.body==='pumpkinhead'){ const strw='x:'+((gear.bodyPal||{}).straw||'#d8b04e');
      for(const q of parts) if(q.mat==='skin') q.mat=strw;
      pumpkinHead(push,hc,gaze,hup,side,hr,gear.bodyPal||{});
      return {parts,hc,look:gaze,hup,Lf:side,hr:hr*1.14,F,U,T,ball:V(0,0,0),tc,noHair:true}; }
    push(ellipsoid(hc,[gaze,hup,side],[hr,hr*1.04,hr*0.98],'skin',{bias:.06}));
    push(ellipsoid(add(hc,sc(hup,-3.3),sc(gaze,0.3)),[gaze,hup,side],[hr*0.86,hr*0.6,hr*0.86],'skin',{bias:.06}));   // the jaw
    for(const s of [1,-1]) push(ellipsoid(add(hc,sc(side,hr*0.95*s),sc(gaze,-0.6),sc(hup,-1.4)),[gaze,hup,side],[1.4,1.9,1.2],'skin'));
    return {parts,hc,look:gaze,hup,Lf:side,hr,F,U,T,ball:V(0,0,0),tc};
  }

  /* GLASSES IN 3D, for the menu golfer. A pair is real objects on the head: each lens stands off the face in
     front of its eye, a frame runs round it, a bridge crosses the nose and the arms run back over the ears.
     The shape comes from EW_SHAPE; the colours are read off the pair's own profile art (the lens colour from its
     lens characters, the frame from the rest). Eyeblack is paint, so it stays a decal. */
  const EW_SHAPE={ shades:'rect', wayfarer:'trap', threed:'rect', prismshades:'rect', patriot:'rect', beach:'trapbig', goldshades:'aviator',
    aviators:'aviator', round:'round', rose:'round', ghoulglow:'round', readers:'half', cateye:'cat', heart:'heart', star:'star', diamond:'diamond',
    sport:'shield', cyber:'shield', visorband:'shield', goggles:'goggle', steampunk:'goggle', monocle:'mono', eyepatch:'patch', groucho:'groucho' };
  function ewColours(map,P){ const LENS='EOPQRaefry', cl={}, cf={};
    for(const row of map) for(const ch of row){ if(ch==='.'||ch===' ') continue; (LENS.indexOf(ch)>=0?cl:cf)[ch]=((LENS.indexOf(ch)>=0?cl:cf)[ch]||0)+1; }
    const pick=(cnt,lens)=>{ for(const ch of Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])){ const r=roleFor(ch,null,P,lens); if(r&&r.m&&r.m.startsWith('x:')) return r.m; } return null; };
    return {lens:pick(cl,true)||'x:#14161e', frame:pick(cf,false)||'x:#26272d'}; }
  function inShape(t,y,x,s){ const a=Math.abs(x), b=Math.abs(y);
    switch(t){
      case 'round': return x*x+y*y<1;
      case 'rect': return a**4+b**4<1;
      case 'trap': case 'trapbig': return y<1&&y>-1&&a<0.84+0.16*y&&a**4+b**4<1.05;
      case 'aviator': { const yy=y+0.12; return x*x/(1)+yy*yy/(y<0?1.1:0.82)<1&&!(y>0.55&&x*s<-0.2); }
      case 'cat': return a**4+b**4<1&&!(y>0.45&&x*s<0&&y-0.45>-x*s*0.8);
      case 'half': return y<0.25&&a**4+(b/1.25)**4<1&&y>-1;
      case 'heart': { const X=x*1.15, Y=y*1.15+0.15; return (X*X+Y*Y-1)**3-X*X*Y*Y*Y<0; }
      case 'star': { const r=Math.hypot(x,y), th=Math.atan2(y,x)+Math.PI/2; return r<0.5+0.5*Math.abs(Math.cos(2.5*th)); }
      case 'diamond': return a+b<1;
      default: return x*x+y*y<1; } }
  function ewSize(t){ return t==='trapbig'?[2.25,2.3]:t==='aviator'?[2.05,2.1]:t==='half'?[1.15,1.95]:t==='heart'||t==='star'?[2.0,2.0]:t==='diamond'?[1.95,1.95]:t==='round'?[1.75,1.75]:[1.55,2.05]; }
  function eyewear3D(M,ew,map,P){ const out=[], {hc,look:lk,hup,Lf,hr}=M, t=EW_SHAPE[ew]||'rect', col=ewColours(map,P);
    const face=(v,h,off)=>add(hc,sc(lk,Math.sqrt(Math.max(0,hr*hr-v*v-h*h))+(off||0)),sc(Lf,h),sc(hup,v));
    const AXl=[lk,hup,Lf], EV=-1.5, EH=3.0, OFF=1.05;
    const temples=(fr,y0)=>{ for(const sd of [1,-1]){ let prev=add(face(y0,sd*(EH+ewSize(t)[1]*0.95),OFF*0.8));
        for(const a of [62,80,96]){ const r=a*D2R, q=add(hc,sc(lk,Math.cos(r)*hr*1.06),sc(Lf,sd*Math.sin(r)*hr*1.06),sc(hup,y0-0.25*(a-62)/34));
          out.push(capsule(prev,q,0.3,fr,{gloss:2,noCast:1})); prev=q; } } };
    const strap=(m,v,w)=>out.push(ellipsoid(add(hc,sc(hup,v)),[lk,hup,Lf],[hr*1.07,w,hr*1.07],m,{noCast:1,cut:l=>l[0]<0.75}));
    if(t==='shield'){ // one wrap-round lens, curved to the head
      out.push(ellipsoid(add(hc,sc(hup,EV+0.5)),[lk,hup,Lf],[hr*1.13,1.75,hr*1.1],col.lens,{gloss:3,noCast:1,cut:l=>l[0]>0.55}));
      out.push(ellipsoid(add(hc,sc(hup,EV+2.15)),[lk,hup,Lf],[hr*1.12,0.42,hr*1.09],col.frame,{gloss:2,noCast:1,cut:l=>l[0]>0.5}));
      if(ew==='visorband') strap(col.frame,EV+0.6,0.9); else temples(col.frame,EV+1.2);
      return out; }
    if(t==='goggle'){ strap(col.frame,EV+0.1,1.05);
      for(const sd of [1,-1]){ const c=face(EV,sd*EH,0.9); out.push(ellipsoid(c,AXl,[1.25,2.25,2.25],col.frame,{gloss:2,noCast:1,cut:l=>l[0]>-0.2}));
        out.push(ellipsoid(add(c,sc(lk,1.0)),AXl,[0.35,1.6,1.6],col.lens,{gloss:3,noCast:1})); }
      out.push(capsule(face(EV,1.6,1.4),face(EV,-1.6,1.4),0.55,col.frame,{gloss:2,noCast:1})); return out; }
    if(t==='patch'){ strap(col.frame,EV+1.4,0.32); const c=face(EV,EH,0.5);
      out.push(ellipsoid(c,AXl,[0.6,2.0,1.9],col.frame,{gloss:1,noCast:1})); return out; }
    const [h,w]=ewSize(t), sides=t==='mono'?[1]:[1,-1];
    for(const sd of sides){ const c=face(EV,sd*EH,OFF), K=1.5;
      const lensCut=l=>inShape(t,l[1]*K,l[2]*K*sd,sd);
      out.push(ellipsoid(c,AXl,[0.26,h*K,w*K],col.lens,{gloss:3,noCast:1,cut:lensCut}));
      const g=0.42, ho=h+g, wo=w+g;                                                       // the frame: the outline of the lens, g wide
      out.push(ellipsoid(add(c,sc(lk,0.05)),AXl,[0.36,ho*K,wo*K],col.frame,{gloss:2,noCast:1,cut:l=>{ const yo=l[1]*K, xo=l[2]*K*sd;
        return inShape(t,yo,xo,sd)&&!inShape(t,yo*ho/h,xo*wo/w,sd); }}));
      out.push(ellipsoid(add(c,sc(lk,0.3),sc(hup,h*0.45),sc(Lf,sd*w*0.4)),AXl,[0.15,0.32,0.45],'x:#ffffff',{noCast:1}));   // a glint on the glass
    }
    if(t==='mono'){ const c=face(EV,EH,OFF); out.push(capsule(add(c,sc(hup,-h-0.3)),add(hc,sc(lk,hr*0.6),sc(Lf,hr*0.75),sc(hup,-hr*1.25)),0.22,col.frame,{gloss:2,noCast:1})); return out; }
    out.push(capsule(face(EV+0.35,EH-w-0.1,OFF+0.1),face(EV+0.35,-(EH-w-0.1),OFF+0.1),0.32,col.frame,{gloss:2,noCast:1}));   // the bridge
    if(t==='aviator') out.push(capsule(face(EV+h*0.9,EH-w*0.4,OFF),face(EV+h*0.9,-(EH-w*0.4),OFF),0.24,col.frame,{gloss:2,noCast:1}));   // the brow bar
    temples(col.frame,EV+h*0.45);
    if(t==='groucho'){ out.push(ellipsoid(face(EV-2.4,0,0.6),AXl,[1.6,1.5,1.25],'x:#e8a08a',{gloss:1}));                     // the nose
      out.push(ellipsoid(face(EV-4.0,0,0.25),AXl,[0.8,0.75,2.6],'x:#2a1d16',{noCast:1}));                                  // the moustache
      for(const sd of [1,-1]) out.push(ellipsoid(face(EV+h+0.6,sd*EH,0.5),AXl,[0.7,0.55,1.7],'x:#2a1d16',{noCast:1})); }   // the brows
    return out; }

  /* MODELLED HATS for the menu golfer: the shapes a hull spun from the flat art cannot hold. Colours come from the
     hat's own art, most used first. */
  function hatColours(map,pal,P){ const cnt={};
    for(const row of map) for(const ch of row){ if(ch==='.'||ch===' ') continue; cnt[ch]=(cnt[ch]||0)+1; }
    const out=[]; for(const ch of Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])){ const r=roleFor(ch,pal,P,false); if(r&&r.m&&r.m.startsWith('x:')&&out.indexOf(r.m)<0) out.push(r.m); }
    return out; }
  const HAT_MODEL={
    // a great helm that closes over the whole head: a visor slit at the eyes, breaths below it, a ridge down the
    // front, a rolled rim and a red plume
    knight(M,c){ const {hc,look,hup,Lf,hr}=M, out=[], X=h=>'x:'+h, st=(c[0]||'x:#a9b2bc').slice(2), dk='#1a1d22', AXh=[look,hup,Lf];
      const C=add(hc,sc(hup,hr*0.08)), R=[hr*1.14,hr*1.26,hr*1.12], ys=(-1.5-hr*0.08)/R[1];
      out.push(ellipsoid(C,AXh,R,X(st),{gloss:3,cut:l=>l[1]>-0.86}));
      out.push(over(C,AXh,R,X(dk),l=>l[0]>0.4&&Math.abs(l[1]-ys)<0.075&&Math.abs(l[2])<0.62,{noCast:1}));                    // the visor slit
      for(const x of [-0.3,-0.15,0,0.15,0.3]) for(const dy of [0.24,0.36]) out.push(over(C,AXh,R,X(dk),l=>l[0]>0.55&&Math.abs(l[1]-(ys-dy))<0.035&&Math.abs(l[2]-x)<0.035,{noCast:1}));   // the breaths
      out.push(over(C,AXh,R.map(v=>v*1.01),X(mix2(st,'#ffffff',0.35)),l=>l[0]>0.5&&Math.abs(l[2])<0.045&&l[1]>ys+0.09,{noCast:1}));   // the ridge
      out.push(ellipsoid(add(C,sc(hup,-R[1]*0.8)),AXh,[R[0]*0.88,1.0,R[2]*0.86],X(mix2(st,'#000000',0.25)),{gloss:2}));   // the rim
      const pt=add(C,sc(hup,R[1]*0.95),sc(look,-1));
      for(const [a,b] of [[0,0],[1.4,0.5],[-1.4,0.5],[0,1.2]]) out.push(capsule(add(pt,sc(Lf,a*0.4)),add(pt,sc(hup,3.6+b),sc(look,-3.2),sc(Lf,a)),0.9,X('#c0303a'),{gloss:1}));   // the plume
      return out; },
    // a chef's toque: a pleated band round the head and a tall puffed top, overhanging the band
    chef(M,c){ const {hc,look,hup,Lf,hr}=M, out=[], X=h=>'x:'+h, wh='#f4f3ee', sh='#d9d6cc', AXh=[look,hup,Lf];
      const bc=add(hc,sc(hup,hr*0.62)), BR=[hr*1.05,hr*0.5,hr*1.05];
      out.push(ellipsoid(bc,AXh,BR,X(wh),{gloss:1,cut:l=>Math.abs(l[1])<0.8}));
      for(let k=0;k<12;k++){ const a0=k*Math.PI/6; out.push(over(bc,AXh,BR,X(sh),l=>{ const a=Math.atan2(l[2],l[0]); let d=Math.abs(((a-a0)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI); return d<0.05&&Math.abs(l[1])<0.8; },{noCast:1})); }   // the pleats
      const tc=add(hc,sc(hup,hr*1.55));
      out.push(ellipsoid(tc,AXh,[hr*1.2,hr*0.72,hr*1.2],X(wh),{gloss:1}));
      for(let k=0;k<6;k++){ const a=k*Math.PI/3+0.3, d=add(sc(look,Math.cos(a)),sc(Lf,Math.sin(a)));
        out.push(ellipsoid(add(tc,sc(d,hr*0.62),sc(hup,hr*0.28)),AXh,[hr*0.55,hr*0.5,hr*0.55],X(k%2?wh:'#ebe9e2'),{gloss:1})); }   // the puffs
      out.push(ellipsoid(add(tc,sc(hup,hr*0.52)),AXh,[hr*0.62,hr*0.42,hr*0.62],X(wh),{gloss:1}));
      return out; },
    crown(M,c){ const {hc,look,hup,Lf,hr}=M, out=[], gold=c[0]||'x:#e6b93c', R=hr*1.05, y=hr*0.42, gems=['x:#e0455a','x:#3a7bd6','x:#2fae6a'];
      out.push(ellipsoid(add(hc,sc(hup,y)),[look,hup,Lf],[R,1.5,R],gold,{gloss:2,cut:l=>Math.hypot(l[0],l[2])>0.9}));       // the band
      for(let i=0;i<8;i++){ const a=i/8*2*Math.PI, d=add(sc(look,Math.cos(a)),sc(Lf,Math.sin(a))), b0=add(hc,sc(hup,y+1.0),sc(d,R*0.98));
        const tip=add(b0,sc(hup,2.9),sc(d,0.35)); out.push(capsule(b0,tip,0.62,gold,{gloss:2}));                              // a prong
        out.push(ellipsoid(tip,[look,hup,Lf],[0.7,0.7,0.7],'x:#fff3c4',{gloss:3,noCast:1}));                                    // its pearl
        out.push(ellipsoid(add(hc,sc(hup,y),sc(d,R*1.01)),[d,hup,norm(cross(hup,d))],[0.35,0.62,0.62],gems[i%3],{gloss:3,noCast:1})); }   // a jewel on the band
      out.push(ellipsoid(add(hc,sc(hup,y+0.9)),[look,hup,Lf],[R*0.96,hr*0.42,R*0.96],'x:#8a1f2b',{cut:l=>l[1]>0}));      // the velvet cap inside
      return out; },
    laurel(M,c){ const {hc,look,hup,Lf,hr}=M, out=[], g1=c[0]||'x:#5fa040', g2=c[1]||'x:#3f7a2e', R=hr*1.04, y=hr*0.32;
      for(let i=0;i<18;i++){ const a=i/18*2*Math.PI; if(Math.cos(a)>0.93) continue;                                            // open at the front
        const d=add(sc(look,Math.cos(a)),sc(Lf,Math.sin(a))), t=norm(cross(hup,d)), up=i%2?1:-1;
        const pc=add(hc,sc(hup,y+0.55*up),sc(d,R));
        out.push(ellipsoid(pc,[t,norm(add(hup,sc(t,0.6*up))),d],[1.5,0.62,0.45],i%2?g1:g2,{gloss:1})); }
      return out; },
    turkey(M,c){ const {hc,look,hup,Lf,hr}=M, out=[], brown=c[0]||'x:#b8742e', bone='x:#f4efe2', top=add(hc,sc(hup,hr*0.95));
      out.push(ellipsoid(top,[look,hup,Lf],[hr*0.82,hr*0.52,hr*0.95],brown,{gloss:2,bias:.1}));                               // the roast
      for(const s of [1,-1]){ const a=add(top,sc(Lf,s*hr*0.55),sc(look,hr*0.35)), b=add(a,sc(look,hr*0.55),sc(hup,hr*0.25),sc(Lf,s*hr*0.25));
        out.push(capsule(a,b,1.45,brown,{gloss:2})); out.push(capsule(b,add(b,sc(look,1.2),sc(hup,0.5)),0.55,bone)); out.push(ellipsoid(add(b,sc(look,1.6),sc(hup,0.7)),[look,hup,Lf],[0.75,0.75,0.75],bone)); }
      out.push(ellipsoid(add(hc,sc(hup,hr*0.5)),[look,hup,Lf],[hr*1.04,1.0,hr*1.04],'x:#e8dcc0',{cut:l=>Math.hypot(l[0],l[2])>0.88}));   // the platter it sits on
      return out; } };
  function draw(look,aimDeg,kind,poseKey){
    if(kind==='walk'){ setEl(MO?MO.EL:WALK_EL); try{ return draw0(look,aimDeg,kind,poseKey); } finally{ setEl(26); } }
    return draw0(look,aimDeg,kind,poseKey); }
  function draw0(look,aimDeg,kind,poseKey){
    look=look||DEFLOOK;
    const capOn=look.cap!==false;
    const novel=(capOn&&look.hatStyle&&look.hatStyle!=='cap'&&look.hatStyle!=='visor'&&PXG_HATS[look.hatStyle])?look.hatStyle:'';
    const L=novel?Object.assign({},look,{cap:false}):look;   // a novelty hat sits on hair, not on a cap
    const aim=V(Math.sin(aimDeg*D2R),0,-Math.cos(aimDeg*D2R));
    const av=avLook(look), mix=PQ.mix, ramp=PQ.ramp;
    const top=(look.top&&PXG_TOPS[look.top])?look.top:'', legw=(look.leg&&PXG_LEGS[look.leg])?look.leg:'', cle=(look.cleats&&PXG_CLEATS[look.cleats])?look.cleats:'';
    const cid=(typeof normClub==='function'?normClub(look.club):look.club)||'driver';
    let cleats=null; if(cle){ const p=PXG_CLEATS_PAL[cle]||{}, v=Object.values(p);
      cleats={main:p.T||p.R||p.D||v[0], acc:p.M||p.W||p.b||p.f||v[1], sole:p.s||p.k||p.p||p.B||'#2a2f38'}; }
    const gear={top, topPal:top?PXG_TOP_PAL[top]:null, legPal:legw?PXG_LEG_PAL[legw]:null, cleats,
      club:PXG_CLUBS[cid]?cid:'driver', clubPal:Object.assign({},PXG_CLUB_PAL[cid]||{})};
    { gear.lefty=!!look.lefty; gear.body=look.body||''; gear.bodyPal=(look.body&&typeof BODY_SKINS!=='undefined'&&BODY_SKINS[look.body])||null; const bpal=look.ball&&typeof PXG_BALL_PAL!=='undefined'&&PXG_BALL_PAL[look.ball]; gear.ballC=bpal?(bpal.C||null):null; const sh=cleats?cleats.main:av.shoesHex; gear.saddleHex=cleats&&cleats.acc?cleats.acc:(PQ.lum(sh)>0.6?'#2c3a58':mix(sh,'#ffffff',0.55)); }
    const M=MO?profileModel(aim,gear):model(aim,!!look.lefty,kind,kind==='walk'?walkPose(poseKey):POSES[poseKey],gear);
    const P=Object.assign({k:PXG_FIX.k,l:PXG_FIX.l,g:PXG_FIX.g,n:PXG_FIX.n,G:PXG_FIX.G,H:PXG_FIX.H,F:PXG_FIX.F,E:'#20242c',S:'#e8ebf0'},typeof PXG_NOV!=='undefined'?PXG_NOV:{});
    const closed=!!novel&&!(typeof PXG_HAT_OPEN!=='undefined'&&PXG_HAT_OPEN[novel]);
    const hs=look.hairStyle||'short'; M.hairK=closed?1.06:hs==='afro'?1.32:hs==='curly'?1.08:1.03;   // a band sits on the hair, not in it
    const parts=M.parts.concat(hairHat(M,L,closed));
    if(novel){ const cfg=HAT3D[novel]||{}, pal=PXG_HERITAGE_HAT_PAL[novel]||null;
      if(MO&&HAT_MODEL[novel]) parts.push(...HAT_MODEL[novel](M,hatColours(PXG_HATS[novel],pal,P)));
      else if(cfg.ring) parts.push(...haloParts(M,Object.assign({},P,pal||{})));
      else { const hv=hull(PXG_HATS[novel],ch=>{ if('sjxhi'.indexOf(ch)>=0&&!(pal&&pal[ch])) return null;   // the face and hair under a brim are the model's own
          return roleFor(ch,pal,P,false); },M,cfg); parts.push(hv);
        // the profile head is a little shorter than the model's, so a closed hat's crown is domed over the top
        if(closed&&hv.crownRole&&!cfg.flat){ const {hc,look:g,hup,Lf,hr}=M, cut=Math.max(-0.2,hv.brimU/(hr*1.07));
          parts.push(ellipsoid(add(hc,sc(hup,0.3)),[g,hup,Lf],[hr*1.07,hr*1.07,hr*1.06],hv.crownRole.m,{dt:hv.crownRole.dt||0,gloss:1,cut:l=>l[1]>cut})); } } }
    const ew=look.eyewear&&PXG_EYEWEAR&&PXG_EYEWEAR[look.eyewear]?look.eyewear:'';
    if(ew){ const map=PXG_EYEWEAR[ew], LENS='EOPQRaefry'; let mn=99,mx=-1,nL=0,nR=0,ly=99; const cnt={};
      for(let y=0;y<map.length;y++){ const row=map[y]; for(let x=0;x<row.length;x++){ const c=row[x]; if(c==='.'||c===' ') continue;
        if(LENS.indexOf(c)<0){ cnt[c]=(cnt[c]||0)+1; continue; } if(x<mn)mn=x; if(x>mx)mx=x; if(y<ly)ly=y; if(x<22)nL++; else if(x>22)nR++; } }
      const dx=(mx>=0&&nL>0&&nR>0)?Math.round(22-(mn+mx)/2):0, dy=ew==='visorband'?0:(ly<99?Math.max(0,Math.min(3,15-ly)):1);
      if(MO&&novel==='knight'){}   // a closed great helm hides the glasses under it
      else if(MO&&EW_SHAPE[ew]){ const e3=eyewear3D(M,ew,map,P); e3.forEach(q=>{ q.o.item='ew'; }); parts.push(...e3); } else {
      parts.push(hull(map,ch=>roleFor(ch,null,P,true),M,{decal:1,dx,dy}));
      // the arms run back over the ears, which is most of what shows of a pair of glasses from above
      const fr=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0], frR=fr&&roleFor(fr,null,P,true);
      if(frR&&nL>0&&nR>0&&ew!=='eyeblack'){ const {hc,look:g,hup,Lf,hr}=M, eu=-hr*0.1;
        const rr=hr*Math.max(1.08,(M.hairK||1.03)+0.06), on=(f,sd)=>add(hc,sc(norm(add(sc(g,f),sc(Lf,sd*Math.sqrt(1-f*f)))),rr),sc(hup,eu));
        for(const sd of [1,-1]){ const a=on(0.62,sd), b=on(-0.3,sd);
          parts.push(capsule(a,b,0.5,frR.m,{gloss:2,noCast:1})); } } } }
    const ONLY=MO?MO.only:''; if(ONLY){ const hatSet=new Set(parts.slice(M.parts.length));
      for(let i=parts.length-1;i>=0;i--){ const q=parts[i], keep=ONLY==='hat'?(hatSet.has(q)&&q.mat!=='hair'&&q.mat!=='skin'&&!(q.o&&q.o.item==='ew')):ONLY==='ew'?(q.o&&q.o.item==='ew'):ONLY==='club'?(q.o&&q.o.item==='club'):(ONLY==='top'||ONLY==='leg'||ONLY==='shirt'||ONLY==='pants')?(q.o&&q.o.item===ONLY&&q.mat!=='skin'&&q.mat!=='glove'&&q.mat.indexOf('x:#d8b04e')<0):(q.o&&q.o.item==='shoe'&&q.o.side===1); if(!keep) parts.splice(i,1); } }
    const K=MO?MO.K:1; const s=new PQ.Sprite(GW*K,GH*K);
    // each part's box on the screen, so a cell only tests the parts that can reach it
    for(const p of parts){ if(p.k==='e'){ const m=Math.max(...p.r); p.bb=[p.c[0]-m,p.c[1]-m,p.c[0]+m,p.c[1]+m]; }
      else if(p.k==='v') p.bb=p.bb2;
      else p.bb=[Math.min(p.a[0],p.b[0])-p.r,Math.min(p.a[1],p.b[1])-p.r,Math.max(p.a[0],p.b[0])+p.r,Math.max(p.a[1],p.b[1])+p.r]; }
    for(let y=0;y<GH*K;y++){ const Y=(y+.5)/K-OY, row=parts.filter(p=>Y>=p.bb[1]&&Y<=p.bb[3]); if(!row.length) continue;
     for(let x=0;x<GW*K;x++){ const X=(x+.5)/K-OX; let best=null,bp=null;
      for(const p of row){ if(p.k==='v'||X<p.bb[0]||X>p.bb[2]) continue; const h=p.k==='e'?hitE(p,X,Y):hitC(p,X,Y); if(h&&(!best||h.D>best.D)){best=h;bp=p} }
      for(const p of row){ if(p.k!=='v'||X<p.bb[0]||X>p.bb[2]) continue; const h=hitV(p,X,Y,best?best.D:null); if(h&&(!best||h.D>best.D)){best=h;bp=p} }
      if(best){ const n=best.n, o=bp.o; s.g[y][x]={m:best.m||bp.mat,n:()=>n,z:best.D,dt:best.m?best.dt:(o.dt||0),gloss:best.m?best.gloss:(o.gloss||0),bias:o.bias||0,t:o.t!=null?o.t:null,noCast:o.noCast||0,tag:''}; } } }
    const put=(p,m,w,h,ox,oy)=>{ w=w||1; h=h||1; const c=cam(p),x0=Math.floor((c[0]+OX)*K)+(ox|0),y0=Math.floor((c[1]+OY)*K)+(oy|0);
      for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const g=s.g[y]&&s.g[y][x]; if(g&&(g.m==='skin'||g.m==='socket')&&Math.abs(g.z-c[2])<1.6) s.set(x,y,m,0,{noCast:1,z:g.z}); } };
    const {hc,look:lk,hup,Lf,hr}=M;
    // the menu golfer's face, where the profile drawing puts it: brows, eyes, blush and mouth, on the head's surface
    const onFace=(v,h)=>add(hc,sc(lk,Math.sqrt(Math.max(0,hr*hr-v*v-h*h))),sc(Lf,h),sc(hup,v));
    if(MO&&!ONLY){ const ew=Math.max(1,K), eh=2*K, bw=2*K, bh=Math.max(1,Math.round(K*0.6)), mw=3*K, mh=Math.max(1,Math.round(K*0.8));
      for(const sd of [1,-1]){ const h=3.0*sd;
        if(look.body==='zombie') put(onFace(-1.5,h),'socket',ew+2*K,eh+K,-((ew+2*K)>>1),-((eh+K)>>1));
        put(onFace(-1.5,h),'pupil',ew,eh,-(ew>>1),-(eh>>1)); if(K>=2) put(onFace(-1.5,h),'glint',1,1,-(ew>>1),-(eh>>1));
        if(look.cap===false||look.hatStyle==='visor') put(onFace(0.35,h+0.3*sd),'brow',bw,bh,-(bw>>1),0);   // under a cap the brim hides the brows, as on the profile
        put(onFace(-3.9,4.9*sd),'blush',K,K,-(K>>1),0); }
      put(onFace(-4.9,0),'mouth',mw,mh,-(mw>>1),0); }
    else if(!MO) for(const sd of [1,-1]){ const e=add(hc,sc(lk,hr*0.93),sc(Lf,hr*0.36*sd),sc(hup,-hr*0.1));   // the course golfer, at one cell
      put(e,'pupil'); put(add(e,sc(hup,-1)),'pupil'); put(add(e,sc(hup,1.9)),'brow'); }
    if(!MO) for(const k of [-1,0,1]) put(add(hc,sc(lk,hr*0.9),sc(Lf,k),sc(hup,-hr*0.48)),'mouth');
    const bc=cam(M.ball);
    const cv=document.createElement('canvas'); cv.width=GW*K; cv.height=GH*K; const ctx=cv.getContext('2d'); ctx.save(); ctx.scale(K,K);
    if(!ONLY){ ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(OX+1,OY+.5,kind==='putt'?11:kind==='walk'?9:13,kind==='walk'?3.6:4.5,0,0,7); ctx.fill(); } ctx.restore();
    // the look, coloured exactly as the profile golfer colours it
    let shirt=av.shirtHex, pants=pantsHexOf(look), shoes=av.shoesHex;
    const tpal=gear.topPal||{}; if(top&&top!=='duckfloatie'&&top!=='cape') shirt=tpal['1']||shirt;
    if(legw) pants=(gear.legPal||{})['1']||pants;
    if(cleats) shoes=cleats.main||shoes;
    const pat=(!top||top==='duckfloatie'||top==='cape')&&look.shirtPat&&PXPAT_BY[look.shirtPat]?look.shirtPat:''; let patFn=null;
    if(pat){ const pd=PXPAT_BY[pat]; if(pd.fixed){const cols=pd.cols||[];patFn=(x,y)=>cols[pd.f(x,y)|0]||cols[0]||null}
      else { const light=pxLum(shirt)>0.55,a1=pxShade(shirt,light?-52:46),a2=pxShade(shirt,light?-90:82); patFn=(x,y)=>{const a=pd.f(x,y);return a?(a===2?a2:a1):null}; } }
    // a body skin's rags: its tears are placed on the profile torso, so the torso's cells are mapped onto it
    const bodySkin=(look.body&&typeof BODY_SKINS!=='undefined'&&BODY_SKINS[look.body])||null;
    if(bodySkin&&bodySkin.rags&&!MO){ const t0=cam(M.tc), under=patFn, tx=t0[0]+OX, ty=t0[1]+OY;
      patFn=(x,y)=>bodySkin.rags(Math.round(22+(x-tx)*1.25),Math.round(30+(y-ty)*1.25),av.skinHex)||(under?under(x,y):null); }
    const hatHex=av.hatHex;
    const lp=gear.legPal||{}, plaidC=[tpal['1'],tpal['2'],tpal['4']];
    const R={skin:PQ.skinRamp(av.skinHex),shirt:ramp(shirt),pants:ramp(pants),shoe:ramp(shoes),hat:ramp(hatHex),
      patch:ramp(PQ.lum(hatHex)>.6?'#1b2b4a':'#f1ede2'),patchmark:ramp(PQ.lum(hatHex)>.6?'#f4f1e6':'#1b2b4a'),hatbtn:ramp(mix(hatHex,'#000000',.18)),belt:ramp('#2a2420'),
      glove:ramp('#f7f8f5',{spread:.8}),hair:PQ.hairRamp(av.hairHex),sole:ramp('#e8e2d4'),polo:ramp(av.shirtHex),saddle:ramp(shoes)};
    const fixed={socket:mix(R.skin[3]||R.skin[2],'#141410',.55),pupil:av.pupilHex||mix(R.hair[0],'#1a1018',.6),brow:R.hair[0],mouth:av.mouthHex||mix(R.skin[1],'#7a2a34',.30),glint:'#fbfaf2',blush:mix(R.skin[2],'#e0586a',.22),lace:mix(ramp(shoes)[1],'#000000',.25)};
    const rc=new Map(), rampOf=h=>{ let r=rc.get(h); if(!r){ r=ramp(h); rc.set(h,r); } return r; };
    const PK=Math.max(1,Math.round(K/2)); s.paint(ctx,1,(c,x0,y0)=>{const m=c.m, x=Math.floor(x0/PK), y=Math.floor(y0/PK);
      if((m==='shirt'||m==='polo')&&patFn&&!(m==='shirt'&&top&&top!=='duckfloatie'&&top!=='cape')){const h=patFn(x,y);if(h)return rampOf(h)}
      if(m==='plaid'){ const a=(x%5===0), b=(y%5===0); return rampOf(a&&b?plaidC[2]:(a||b)?plaidC[1]:plaidC[0]); }
      if(m==='sock'){ const d=((x+y)%4===0)||(((x-y)%4+4)%4===0); return rampOf(d?(lp['4']||'#9a4436'):(y%5===0?(lp['5']||lp['3']):(lp['3']||'#ded3b4'))); }
      if(R[m])return R[m]; if(fixed[m])return fixed[m]; if(m.startsWith('x:'))return rampOf(m.slice(2)); return '#ff00ff'});
    // the figure's height in cells, so the page can size it to the old sprite's figure
    // read off the head rather than the top pixel, so a tall hat never shrinks the golfer
    const y0=Math.floor(cam(hc)[1]+OY-hr*HEADTOP);
    return {cv,ball:[bc[0]+OX,bc[1]+OY],fig:OY+2-y0};
  }

  const KEYS={full:['A','B','D','C'],chip:['A','chipB','D','chipC'],putt:['pA','pB','pC'],walk:['w0','w1','w2','w3','w4','w5','w6','w7','ws']};   // ws (index 8) is standing still, for the roam
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
  /* ONE FRAME AT A TIME, for the walk. A walk is eight frames a facing and a facing is drawn the first time it
     is walked, so frame() draws and keeps a single frame (null for a key the kind does not have), has() asks
     without drawing, and warmAim() draws one facing's frames while the page is idle. */
  const fcache=new Map();
  function fkey(look,aimDeg,kind,i){ const a=((Math.round(aimDeg/45)*45)%360+360)%360; return lookKey(look)+'|'+a+'|'+kind+'|'+i; }
  function frame(look,aimDeg,kind,i){
    const keys=KEYS[kind]; if(!keys||!keys[i]) return null;
    const k=fkey(look,aimDeg,kind,i); let r=fcache.get(k); if(r) return r;
    const a=((Math.round(aimDeg/45)*45)%360+360)%360, f=draw(look,a,kind,keys[i]);
    r={url:f.cv.toDataURL('image/png'),ball:f.ball,fig:f.fig,W:GW,H:GH,aim:a,n:kind==='walk'?WALK_N:keys.length};
    if(fcache.size>160) fcache.clear(); fcache.set(k,r); return r; }
  function has(look,aimDeg,kind,i){ return fcache.has(fkey(look,aimDeg,kind,i)); }
  function warmAim(look,aimDeg,kind){ const keys=KEYS[kind]; if(!keys) return; let i=0;
    const idle=window.requestIdleCallback||(f=>setTimeout(()=>f({timeRemaining:()=>8}),60));
    const step=()=>{ while(i<keys.length&&has(look,aimDeg,kind,i)) i++; if(i>=keys.length) return; frame(look,aimDeg,kind,i++); idle(step); }; idle(step); }

  /* THE MENU GOLFER'S PICTURES (First Tee, Me, the closet, player cards, leaderboards). pic() draws a look once
     and keeps it: the full figure centred on the body (the head, so the club in the hand never pushes the golfer
     off centre), a square head chip, or one item drawn alone for its tile. A drawing costs 10 to 45 ms, so
     cached() lets a page ask without drawing and draw later while idle. */
  const PIC={ fig:{K:3,EL:2,aim:180}, chip:{K:2,EL:2,aim:180}, hat:{K:4,EL:20,aim:200,only:'hat'}, ew:{K:5,EL:6,aim:200,only:'ew'},
    club:{K:4,EL:24,aim:205,only:'club'}, top:{K:3,EL:10,aim:200,only:'top'}, shirt:{K:3,EL:8,aim:200,only:'shirt'}, pants:{K:3,EL:12,aim:200,only:'pants'}, leg:{K:3,EL:10,aim:200,only:'leg'}, shoe:{K:5,EL:20,aim:235,only:'shoe'} };
  function menu(look,aimDeg,o){ MO={K:o.K||3,EL:o.EL!=null?o.EL:2,phase:o.phase||0,only:o.only||''};
    try{ return draw(look,aimDeg,'walk','ws').cv; } finally{ MO=null; } }
  const pcache=new Map();
  const picKey=(look,part)=>part+'|'+lookKey(look);
  function crop(cv,x,y,w,h){ const c=document.createElement('canvas'); c.width=Math.max(1,w); c.height=Math.max(1,h); c.getContext('2d').drawImage(cv,x,y,w,h,0,0,w,h); return c; }
  function pic(look,part){ const k=picKey(look,part); if(pcache.has(k)) return pcache.get(k);
    if(part==='ball'){ const r=ballPic(look.ball); if(pcache.size>400) pcache.clear(); pcache.set(k,r); return r; }
    const o=PIC[part]; if(!o) return null;
    // a cape's tile is drawn from behind
    const cv=menu(look,part==='top'&&look.top==='cape'?20:o.aim,o), W=cv.width, H=cv.height, d=cv.getContext('2d').getImageData(0,0,W,H).data, A=(x,y)=>d[(y*W+x)*4+3]>8;
    let x0=W,y0=H,x1=-1,y1=-1; for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(A(x,y)){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    let r=null;
    if(x1>=0){ let c;
      if(part==='fig'||part==='chip'){ let sx=0,n=0; const top=y0+Math.round((y1-y0)*0.25);   // the head's centre, from the top quarter
        for(let y=y0;y<top;y++) for(let x=x0;x<=x1;x++) if(A(x,y)){ sx+=x; n++; }
        const cx=n?sx/n:(x0+x1)/2;
        if(part==='fig'){ const half=Math.ceil(Math.max(cx-x0,x1-cx))+1; c=crop(cv,Math.round(cx-half),y0,half*2,y1-y0+1); }
        else { const side=Math.round((y1-y0)*0.42); c=crop(cv,Math.round(cx-side/2),y0-Math.round(side*0.03),side,side); } }
      else if(part==='club'&&!NOVELTY[look.club]&&look.club!=='pu_magicwand'){ const h=y1-y0; c=crop(cv,x0,y0+Math.round(h*0.66),x1-x0+1,Math.round(h*0.34)+1); }   // the head of the club
      else c=crop(cv,x0,y0,x1-x0+1,y1-y0+1);
      r={url:c.toDataURL('image/png'),w:c.width,h:c.height}; }
    if(pcache.size>400) pcache.clear(); pcache.set(k,r); return r; }
  /* A BALL IN 3D, for its tile: a lit sphere wearing the ball's own art (its outline and shading characters are
     the base colour, since the light now does that job), sat on a white tee. */
  function ballPic(id){ const map=typeof PXG_BALL!=='undefined'&&PXG_BALL[id], pal=typeof PXG_BALL_PAL!=='undefined'&&PXG_BALL_PAL[id];
    if(!map||!pal) return null;
    let bx0=99,by0=99,bx1=-1,by1=-1; map.forEach((row,y)=>{ for(let x=0;x<row.length;x++){ const ch=row[x]; if(ch==='.'||ch===' '||ch==='T') continue;
      if(x<bx0)bx0=x; if(x>bx1)bx1=x; if(y<by0)by0=y; if(y>by1)by1=y; } });
    if(bx1<0) return null;
    const R=22, N=2*R+6, TH=16, s=new PQ.Sprite(N,N+TH), cx=N/2, cy=R+3, base=pal.C||Object.values(pal)[0];
    const colAt=(nx,ny)=>{ const x=Math.min(bx1,Math.floor(bx0+(nx+1)/2*(bx1-bx0+1))), y=Math.min(by1,Math.floor(by0+(ny+1)/2*(by1-by0+1)));
      const ch=(map[y]||'')[x]; return (!ch||ch==='.'||ch==='o'||ch==='s'||ch==='h'||ch==='T')?base:(pal[ch]||base); };
    for(let y=0;y<N+TH;y++) for(let x=0;x<N;x++){ const nx=(x+.5-cx)/R, ny=(y+.5-cy)/R, r2=nx*nx+ny*ny;
      if(r2<=1){ const nz=Math.sqrt(1-r2), n=[nx,ny,nz]; s.g[y][x]={m:'x:'+colAt(nx,ny),n:()=>n,z:nz*R,dt:0,gloss:3,bias:0,t:null,noCast:0,tag:''}; continue; }
      const ty=y-(cy+R*0.92); if(ty>=0&&ty<TH){ const w=ty<4?5.5-ty*0.6:3.0-ty*0.08, tx=(x+.5-cx)/w;      // the tee: a cup, then the peg
        if(Math.abs(tx)<1){ const n=[tx,0,Math.sqrt(1-tx*tx)]; s.g[y][x]={m:'x:'+(pal.T||'#e8ebf0'),n:()=>n,z:-5,dt:0,gloss:1,bias:0,t:null,noCast:0,tag:''}; } } }
    const cv=document.createElement('canvas'); cv.width=N; cv.height=N+TH; const rc=new Map();
    s.paint(cv.getContext('2d'),1,c=>{ const h=c.m.slice(2); let r=rc.get(h); if(!r){ r=PQ.ramp(h); rc.set(h,r); } return r; });
    return {url:cv.toDataURL('image/png'),w:cv.width,h:cv.height}; }
  function cached(look,part){ return pcache.has(picKey(look,part)); }
  window.RTT_G3D={API_VERSION:2, set, warm, draw, frame, has, warmAim, WALK_N, pic, cached};
})();
