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
    const U=V(0,1,0), T=norm(aimV);
    const F=lefty?norm(cross(U,T)):norm(cross(T,U));   // the chest. A righty's lead shoulder points down the line.
    const P=(f,u,t)=>add(sc(F,f),sc(U,u),sc(T,t));
    const parts=[]; const push=p=>parts.push(p);
    const club=kind==='putt'?CLUBS.putter:kind==='chip'?CLUBS.iron:CLUBS.driver;
    const lean=(kind==='putt'?22:28)*D2R, spine=norm(add(sc(F,Math.sin(lean)),sc(U,Math.cos(lean))));
    // a turn moves the chest away from the target: pick the sign that does
    const sgn=dot(rot(F,U,0.1),T)<0?1:-1, turnA=a=>a*D2R*sgn;
    // legs, hips, shoes. A leg bends at the knee, which is where plus fours end.
    const hipC=P(-1.2,15.2,0), hipAx=a=>rot(a,U,turnA(pose.hip));
    const lg=gear.legPal, cl=gear.cleats;
    for(const s of [1,-1]){ const lead=s>0, l=(kind==='putt'?3.9:4.8)*s;
      const heel=lead?0:pose.heel; const ank=add(P(0.4,3.2+heel*1.8,l),sc(T,heel*1.6));
      const hip=rotAbout(P(-1,14,l*0.95),hipC,U,turnA(pose.hip)), knee=add(sc(add(hip,ank),0.5),sc(F,1.1));
      if(lg){ push(capsule(hip,knee,3.05,'pants')); push(ellipsoid(add(knee,sc(U,-0.8)),[F,U,T],[3.2,1.6,3.2],'pants',{dt:-1}));
        push(capsule(add(knee,sc(U,-1.4)),ank,2.35,'sock')); }
      else { push(capsule(hip,knee,2.7,'pants')); push(capsule(knee,ank,2.7,'pants')); }
      const sc0=add(P(1.4,1.5+heel*1.2,l),sc(T,heel*1.4)), sax=[F,U,T], sr=[4.6,1.7,2.5];
      push(ellipsoid(sc0,sax,sr,'shoe',{gloss:2,bias:.15}));
      push(over(sc0,sax,sr,cl?'x:'+cl.sole:'sole',l=>l[1]<-0.5));
      if(cl&&cl.acc) push(over(sc0,sax,sr,'x:'+cl.acc,l=>l[0]>-0.38&&l[0]<0.08&&l[1]>-0.5,{gloss:1})); }
    push(ellipsoid(hipC,[hipAx(F),U,hipAx(T)],[4.8,4.2,7.2],'pants'));
    push(ellipsoid(add(hipC,P(0.6,2.4,0)),[hipAx(F),spine,hipAx(T)],[5.3,1.15,7.7],'belt',{gloss:1}));
    // the torso turns about the spine
    const tc=P(1.2,23,0), tr=v=>rot(v,spine,turnA(pose.turn)), tp=p=>rotAbout(p,tc,spine,turnA(pose.turn));
    const TAX=[tr(F),spine,tr(T)], TR=[5.6,7.6,8.3], top=gear.top, tpal=gear.topPal||{};
    const body=top==='shacket'?'plaid':'shirt';
    const tsurf=(v,z)=>add(tc,sc(TAX[0],5.6*1.04*Math.sqrt(Math.max(0,1-v*v-(z/8.3)*(z/8.3)))),sc(TAX[1],7.6*v),sc(TAX[2],z));
    push(ellipsoid(tc,TAX,TR,body));
    push(capsule(tp(P(3.2,28.8,0)),tp(P(4.2,30.4,0)),2.6,'skin',{dt:-1}));
    push(ellipsoid(tp(P(3.0,28.6,0)),TAX,[3.6,1.3,4.3],body,{dt:1}));
    // the outerwear, over the torso
    if(top==='cardigan'||top==='shacket'){ push(over(tc,TAX,TR,'polo',l=>l[0]>0.3&&Math.abs(l[2])<0.15+0.1*Math.max(0,l[1])));
      for(const v of [-0.35,0.05,0.42]) push(ellipsoid(tsurf(v,1.9),TAX,[0.55,0.55,0.55],'x:'+(tpal['4']||'#5f4c2e'),{gloss:2})); }
    if(top==='blazer'){ push(over(tc,TAX,TR,'x:'+tpal['6'],l=>l[0]>0.25&&l[1]>-0.2&&Math.abs(l[2])<0.36*(l[1]+0.2)));
      push(over(tc,TAX,TR.map(v=>v*1.01),'x:'+tpal['7'],l=>l[0]>0.25&&l[1]>-0.62&&Math.abs(l[2])<0.075));
      for(const v of [-0.42,-0.22]) push(ellipsoid(tsurf(v,1.6),TAX,[0.5,0.5,0.5],'x:'+tpal['4'],{gloss:2})); }
    if(top==='cape'){ const cc=tp(P(-4.9,19.5,0)); push(ellipsoid(cc,TAX,[1.6,11.2,8.8],'x:'+tpal['1'],{cut:l=>l[1]<0.55||l[0]<0.2}));
      push(over(cc,TAX,[1.6,11.2,8.8],'x:'+tpal['4'],l=>l[0]>0.55&&l[1]<0.4));
      push(ellipsoid(tp(P(0.4,29.4,0)),TAX,[5.4,1.6,6.8],'x:'+tpal['4'],{cut:l=>l[0]<0.35}));
      for(const s of [1,-1]) push(ellipsoid(tp(P(4.4,28.3,3.6*s)),TAX,[0.75,0.75,0.75],'x:'+tpal['5'],{gloss:2})); }
    if(top==='duckfloatie'){ const fc=add(hipC,P(0.7,2.6,0)), A=hipAx(F), B=hipAx(T), ring=a=>add(fc,sc(A,7.4*Math.cos(a)),sc(B,9.8*Math.sin(a)));
      const N=22; for(let i=0;i<N;i++) push(capsule(ring(i/N*2*Math.PI),ring((i+1)/N*2*Math.PI),2.55,'x:'+tpal['1'],{gloss:1,bias:.15}));
      const ha=-38*D2R, rp=ring(ha), out=norm(add(sc(A,Math.cos(ha)),sc(B,Math.sin(ha)))), hd=add(rp,sc(U,4.8),sc(out,0.9));
      push(capsule(add(rp,sc(U,1.2)),hd,1.45,'x:'+tpal['1'],{gloss:1})); push(ellipsoid(hd,[out,U,norm(cross(out,U))],[2.9,2.7,2.7],'x:'+tpal['1'],{gloss:1}));
      push(ellipsoid(add(hd,sc(out,2.9),sc(U,-0.5)),[out,U,norm(cross(out,U))],[1.7,0.7,1.1],'x:'+tpal['4'],{gloss:1}));
      for(const s of [1,-1]) push(ellipsoid(add(hd,sc(out,2.1),sc(U,0.9),sc(norm(cross(out,U)),1.35*s)),[out,U,T],[0.55,0.6,0.55],'x:'+tpal['5'])); }
    // the swing plane holds the address club and the target line
    const hand0=P(club.hand[0],club.hand[1]+26.4,0), head0=P(club.head[0],club.head[1]+26.4,0);
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
    // head
    const hc=tp(P(kind==='putt'?6.2:5.4,34.2,0));
    let gaze=norm(add(sc(F,.72),sc(U,kind==='putt'?-.69:-.6)));
    if(pose.head) gaze=norm(rot(gaze,U,-turnA(pose.head)));
    if(pose.head>30) gaze=norm(add(gaze,sc(U,.55)));
    const hup=norm(cross(cross(gaze,U),gaze)), side=norm(cross(hup,gaze)), hr=8.3;
    push(ellipsoid(hc,[gaze,hup,side],[hr,hr*1.04,hr*0.98],'skin',{bias:.06}));
    for(const s of [1,-1]) push(ellipsoid(add(hc,sc(side,hr*0.95*s),sc(gaze,-0.6)),[gaze,hup,side],[1.4,1.9,1.2],'skin'));
    const head0Ball=add(head0,sc(T,kind==='putt'?4.3:kind==='chip'?3.3:5.0),sc(U,kind==='putt'?0.6:0));
    return {parts,hc,look:gaze,hup,Lf:side,hr,F,U,T,ball:head0Ball,tc};
  }

  function hairHat(M,L,closedHat){ const {hc,look,hup,Lf,hr,F,U}=M; const out=[];
    const style=L.hairStyle||'short', capOn=L.cap!==false, hatStyle=capOn?(L.hatStyle||'cap'):'';
    const visor=hatStyle==='visor', cap=capOn&&!visor, under=cap||closedHat;
    const big=under?Math.min(1.06,style==='afro'?1.06:1.03):style==='afro'?1.32:style==='curly'?1.08:style==='buzz'?1.055:1.03;
    out.push(ellipsoid(hc,[look,hup,Lf],[hr*big,hr*big*1.02,hr*big],'hair',{gloss:1,bias:-.08,cut:l=>l[0]<0.22+(under?0:0.15)&&(under?l[1]<0.1:true)&&!(l[0]>-0.3&&l[1]<-0.3)}));
    if(style==='long'||style==='mullet') out.push(capsule(add(hc,sc(F,-hr*0.75),sc(U,hr*0.1)),add(hc,sc(F,-hr*0.95),sc(U,-hr*(style==='long'?1.35:0.85))),hr*(style==='long'?0.7:0.55),'hair',{gloss:1}));
    if(style==='ponytail') out.push(capsule(add(hc,sc(F,-hr*1.12),sc(U,hr*0.45)),add(hc,sc(F,-hr*1.3),sc(U,-hr*0.8)),2.2,'hair',{gloss:1}));
    if(style==='topknot'&&!under) out.push(ellipsoid(add(hc,sc(F,-hr*0.4),sc(U,hr*0.95)),[F,U,Lf],[2.8,2.6,2.8],'hair',{gloss:1}));
    if(style==='mohawk'&&!under) out.push(ellipsoid(add(hc,sc(hup,hr*0.9)),[look,hup,Lf],[hr*0.9,2.6,1.6],'hair',{gloss:1}));
    if(style==='swoop'&&!under) out.push(ellipsoid(add(hc,sc(look,hr*0.55),sc(hup,hr*0.72),sc(Lf,hr*0.22)),[look,hup,Lf],[hr*0.62,hr*0.34,hr*0.7],'hair',{gloss:1,bias:-.05}));
    if(style==='spiky'&&!under) for(let i=0;i<7;i++){ const a=(i/7)*2*Math.PI, d=norm(add(sc(hup,1),sc(look,0.55*Math.cos(a)),sc(Lf,0.55*Math.sin(a))));
      out.push(ellipsoid(add(hc,sc(d,hr*1.0)),[d,norm(cross(d,Lf)),norm(cross(d,cross(d,Lf)))],[2.6,1.1,1.1],'hair',{gloss:1})); }
    if(cap){ out.push(ellipsoid(add(hc,sc(hup,hr*0.18)),[look,hup,Lf],[hr*1.06,hr*0.95,hr*1.06],'hat',{cut:l=>l[1]>-0.12}));
      out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.02)),[look,hup,Lf],[hr*0.75,0.75,hr*0.82],'hat',{dt:-1,cut:l=>l[0]>-0.15}));
      out.push(ellipsoid(add(hc,sc(hup,hr*1.1)),[look,hup,Lf],[1.1,0.8,1.1],'hatbtn'));
      out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.48)),[look,hup,Lf],[0.6,1.5,2.0],'patch',{t:2})); }
    if(visor){ out.push(ellipsoid(add(hc,sc(hup,hr*0.3)),[look,hup,Lf],[hr*1.04,1.1,hr*1.04],'hat'));
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

  function draw(look,aimDeg,kind,poseKey){
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
    const M=model(aim,!!look.lefty,kind,POSES[poseKey],gear);
    const P=Object.assign({k:PXG_FIX.k,l:PXG_FIX.l,g:PXG_FIX.g,n:PXG_FIX.n,G:PXG_FIX.G,H:PXG_FIX.H,F:PXG_FIX.F,E:'#20242c',S:'#e8ebf0'},typeof PXG_NOV!=='undefined'?PXG_NOV:{});
    const closed=!!novel&&!(typeof PXG_HAT_OPEN!=='undefined'&&PXG_HAT_OPEN[novel]);
    const hs=look.hairStyle||'short'; M.hairK=closed?1.06:hs==='afro'?1.32:hs==='curly'?1.08:1.03;   // a band sits on the hair, not in it
    const parts=M.parts.concat(hairHat(M,L,closed));
    if(novel){ const cfg=HAT3D[novel]||{}, pal=PXG_HERITAGE_HAT_PAL[novel]||null;
      if(cfg.ring) parts.push(...haloParts(M,Object.assign({},P,pal||{})));
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
      parts.push(hull(map,ch=>roleFor(ch,null,P,true),M,{decal:1,dx,dy}));
      // the arms run back over the ears, which is most of what shows of a pair of glasses from above
      const fr=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0], frR=fr&&roleFor(fr,null,P,true);
      if(frR&&nL>0&&nR>0&&ew!=='eyeblack'){ const {hc,look:g,hup,Lf,hr}=M, eu=-hr*0.1;
        const rr=hr*Math.max(1.08,(M.hairK||1.03)+0.06), on=(f,sd)=>add(hc,sc(norm(add(sc(g,f),sc(Lf,sd*Math.sqrt(1-f*f)))),rr),sc(hup,eu));
        for(const sd of [1,-1]){ const a=on(0.62,sd), b=on(-0.3,sd);
          parts.push(capsule(a,b,0.5,frR.m,{gloss:2,noCast:1})); } } }
    const s=new PQ.Sprite(GW,GH);
    // each part's box on the screen, so a cell only tests the parts that can reach it
    for(const p of parts){ if(p.k==='e'){ const m=Math.max(...p.r); p.bb=[p.c[0]-m,p.c[1]-m,p.c[0]+m,p.c[1]+m]; }
      else if(p.k==='v') p.bb=p.bb2;
      else p.bb=[Math.min(p.a[0],p.b[0])-p.r,Math.min(p.a[1],p.b[1])-p.r,Math.max(p.a[0],p.b[0])+p.r,Math.max(p.a[1],p.b[1])+p.r]; }
    for(let y=0;y<GH;y++){ const Y=y+.5-OY, row=parts.filter(p=>Y>=p.bb[1]&&Y<=p.bb[3]); if(!row.length) continue;
     for(let x=0;x<GW;x++){ const X=x+.5-OX; let best=null,bp=null;
      for(const p of row){ if(p.k==='v'||X<p.bb[0]||X>p.bb[2]) continue; const h=p.k==='e'?hitE(p,X,Y):hitC(p,X,Y); if(h&&(!best||h.D>best.D)){best=h;bp=p} }
      for(const p of row){ if(p.k!=='v'||X<p.bb[0]||X>p.bb[2]) continue; const h=hitV(p,X,Y,best?best.D:null); if(h&&(!best||h.D>best.D)){best=h;bp=p} }
      if(best){ const n=best.n, o=bp.o; s.g[y][x]={m:best.m||bp.mat,n:()=>n,z:best.D,dt:best.m?best.dt:(o.dt||0),gloss:best.m?best.gloss:(o.gloss||0),bias:o.bias||0,t:o.t!=null?o.t:null,noCast:o.noCast||0,tag:''}; } } }
    const put=(p,m)=>{ const c=cam(p),x=Math.floor(c[0]+OX),y=Math.floor(c[1]+OY); const g=s.g[y]&&s.g[y][x]; if(g&&g.m==='skin'&&Math.abs(g.z-c[2])<1.6) s.set(x,y,m,0,{noCast:1,z:g.z}); };
    const {hc,look:lk,hup,Lf,hr}=M;
    for(const sd of [1,-1]){ const e=add(hc,sc(lk,hr*0.93),sc(Lf,hr*0.36*sd),sc(hup,-hr*0.1));
      put(e,'pupil'); put(add(e,sc(hup,-1)),'pupil'); put(add(e,sc(hup,1.9)),'brow'); }
    for(const k of [-1,0,1]) put(add(hc,sc(lk,hr*0.9),sc(Lf,k),sc(hup,-hr*0.48)),'mouth');
    const bc=cam(M.ball);
    const cv=document.createElement('canvas'); cv.width=GW; cv.height=GH; const ctx=cv.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(OX+1,OY+.5,kind==='putt'?11:13,4.5,0,0,7); ctx.fill();
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
    if(bodySkin&&bodySkin.rags){ const t0=cam(M.tc), under=patFn, tx=t0[0]+OX, ty=t0[1]+OY;
      patFn=(x,y)=>bodySkin.rags(Math.round(22+(x-tx)*1.25),Math.round(30+(y-ty)*1.25),av.skinHex)||(under?under(x,y):null); }
    const hatHex=av.hatHex;
    const lp=gear.legPal||{}, plaidC=[tpal['1'],tpal['2'],tpal['4']];
    const R={skin:PQ.skinRamp(av.skinHex),shirt:ramp(shirt),pants:ramp(pants),shoe:ramp(shoes),hat:ramp(hatHex),
      patch:ramp(PQ.lum(hatHex)>.6?'#1b2b4a':'#f1ede2'),hatbtn:ramp(mix(hatHex,'#000000',.18)),belt:ramp('#2a2420'),
      glove:ramp('#f7f8f5',{spread:.8}),hair:PQ.hairRamp(av.hairHex),sole:ramp('#e8e2d4'),polo:ramp(av.shirtHex)};
    const fixed={pupil:av.pupilHex||mix(R.hair[0],'#1a1018',.6),brow:R.hair[0],mouth:av.mouthHex||mix(R.skin[1],'#7a2a34',.30)};
    const rc=new Map(), rampOf=h=>{ let r=rc.get(h); if(!r){ r=ramp(h); rc.set(h,r); } return r; };
    s.paint(ctx,1,(c,x,y)=>{const m=c.m;
      if((m==='shirt'||m==='polo')&&patFn&&!(m==='shirt'&&top&&top!=='duckfloatie'&&top!=='cape')){const h=patFn(x,y);if(h)return rampOf(h)}
      if(m==='plaid'){ const a=(x%5===0), b=(y%5===0); return rampOf(a&&b?plaidC[2]:(a||b)?plaidC[1]:plaidC[0]); }
      if(m==='sock'){ const d=((x+y)%4===0)||(((x-y)%4+4)%4===0); return rampOf(d?(lp['4']||'#9a4436'):(y%5===0?(lp['5']||lp['3']):(lp['3']||'#ded3b4'))); }
      if(R[m])return R[m]; if(fixed[m])return fixed[m]; if(m.startsWith('x:'))return rampOf(m.slice(2)); return '#ff00ff'});
    // the figure's height in cells, so the page can size it to the old sprite's figure
    // read off the head rather than the top pixel, so a tall hat never shrinks the golfer
    const y0=Math.floor(cam(hc)[1]+OY-hr*HEADTOP);
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
