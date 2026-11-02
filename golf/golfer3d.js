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
  // A SMOOTH SURFACE, for the menu golfer only: f(world point) is the signed distance to it, and it is ray marched.
  // It draws what ellipsoids and capsules cannot: a ring, a brim that curves down at its sides, curls carved into
  // one head of hair, a duck's neck grown out of its float. c and R bound it. o.mf(p, n) may answer [material, dt].
  // Its screen box and depth range are found once, from a coarse grid over the bounding ball, so the rays only
  // march where the surface can be.
  const field=(c,R,f,mat,o)=>{ const P={k:'f',c:cam(c),R,f,mat,o:o||{}}, n=10, st=R/n; let x0=1e9,y0=1e9,z0=1e9,x1=-1e9,y1=-1e9,z1=-1e9;
    for(let i=-n;i<=n;i++) for(let j=-n;j<=n;j++) for(let k=-n;k<=n;k++){ if(i*i+j*j+k*k>(n+1)*(n+1)) continue;
      const p=add(c,[i*st,j*st,k*st]); if(f(p)>st*0.9) continue; const q=cam(p);
      if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; if(q[2]<z0)z0=q[2]; if(q[2]>z1)z1=q[2]; }
    if(x1>=x0) P.box=[x0-st,y0-st,x1+st,y1+st,z0-st,z1+st]; return P; };
  const sdE=(p,c,AX,R)=>{ const q=sub(p,c), a=dot(q,AX[0])/R[0], b=dot(q,AX[1])/R[1], d=dot(q,AX[2])/R[2];
    const k0=Math.hypot(a,b,d), k1=Math.hypot(a/R[0],b/R[1],d/R[2]); return k1<1e-6?-Math.min(...R):k0*(k0-1)/k1; };
  const sdCap=(p,a,b,r)=>{ const pa=sub(p,a), ba=sub(b,a), h=Math.max(0,Math.min(1,dot(pa,ba)/dot(ba,ba))); return Math.hypot(...sub(pa,sc(ba,h)))-r; };
  // a cone from a (radius ra) to b (radius rb), cut flat at both ends
  const sdCone=(p,a,b,ra,rb)=>{ const ba=sub(b,a), pa=sub(p,a), baba=dot(ba,ba), papa=dot(pa,pa), paba=dot(pa,ba)/baba, rba=rb-ra;
    const x=Math.sqrt(Math.max(0,papa-paba*paba*baba)), cax=Math.max(0,x-(paba<0.5?ra:rb)), cay=Math.abs(paba-0.5)-0.5;
    const k=rba*rba+baba, f=Math.max(0,Math.min(1,(rba*(x-ra)+paba*baba)/k)), cbx=x-ra-f*rba, cby=paba-f, sg=(cbx<0&&cay<0)?-1:1;
    return sg*Math.sqrt(Math.min(cax*cax+cay*cay*baba,cbx*cbx+cby*cby*baba)); };
  const smin=(a,b,k)=>{ const h=Math.max(k-Math.abs(a-b),0)/k; return Math.min(a,b)-h*h*k/4; };
  // THE MENU CAP: a six panel crown that comes down over the hair at the temples and the back, its seams sewn in,
  // and a pre-curved brim that pitches down and bends down at its sides, as a real golf cap's does. One piece
  // (field) so it reads as a brim from the front, its underside a shade darker. cw is the crown's width (wider over
  // an afro). o: crown, brim, btn, patch and mark materials, dir -1 to wear it backwards, flat for a flat brim,
  // mark0 false for no badge, badge(pc, AX) to draw its own.
  function capParts(M,cw,o){ const {hc,hup,hr}=M, d=o.dir||1, look=sc(M.look,d), Lf=sc(M.Lf,d), out=[], AXc=[look,hup,Lf];
    const cr=o.crown||'hat', bm=o.brim||cr, cc=add(hc,sc(hup,hr*0.12)), CR=[hr*cw,hr*1.12,hr*cw], rim=l=>l[1]>0.07-0.12*(1-l[0]);
    // worn backwards, the back of the cap faces out: its strap opening over the forehead, the strap across it
    out.push(ellipsoid(cc,AXc,CR,cr,{cut:l=>rim(l)&&!(o.dir===-1&&l[0]<-0.55&&l[1]<0.3&&Math.abs(l[2])<0.3*(1-Math.max(0,l[1]-0.05)*1.6))}));
    if(o.dir===-1) out.push(over(cc,AXc,CR,o.brim||cr,l=>l[0]<-0.5&&Math.abs(l[1]-0.1)<0.05&&Math.abs(l[2])<0.34,{noCast:1}));
    for(let k=0;k<3;k++){ const a=k*Math.PI/3+Math.PI/6;   // the panel seams, over the crown from rim to button
      out.push(over(cc,AXc,CR,cr,l=>rim(l)&&Math.abs(l[0]*Math.sin(a)-l[2]*Math.cos(a))<0.025&&l[1]>0.12,{dt:-1,noCast:1})); }
    out.push(ellipsoid(add(cc,sc(hup,CR[1]-0.3)),AXc,[1.15,0.75,1.15],o.btn||'hatbtn'));
    const RB=o.flat?[hr*3,hr*1.5,hr*14]:[hr*4.0,hr*1.2,hr*2.0], Cb=add(hc,sc(hup,hr*0.24-RB[1]*Math.sqrt(1-(0.9*hr/RB[0])**2)));
    out.push(field(add(hc,sc(look,hr*1.2)),hr*1.45,p=>{ const q=sub(p,hc), a=dot(q,look), sd=dot(q,Lf);
        const shell=Math.abs(sdE(p,Cb,AXc,RB))-0.42, foot=(Math.hypot((a-hr*0.9)/(hr*1.0),sd/(hr*(cw+0.09)))-1)*hr*1.0;
        return Math.max(shell,foot,hr*0.55-a); },bm,{mf:(p,n)=>dot(n,hup)<-0.2?[bm,-1]:null}));
    if(o.mark0===false) return out;
    const pc=add(cc,sc(look,hr*(cw-0.15)),sc(hup,hr*0.45));
    if(o.badge) out.push(...o.badge(pc,AXc));
    else { out.push(ellipsoid(pc,AXc,[0.62,2.5,2.7],o.patch||'patch',{t:2,cut:l=>Math.abs(l[1])<0.7&&Math.abs(l[2])<0.7}));
      out.push(ellipsoid(add(pc,sc(look,0.38)),AXc,[0.5,0.62,1.05],o.mark||'patchmark',{t:2,noCast:1})); }
    return out; }
  function hitF(P,x,y){ const e2=P.R*P.R-(x-P.c[0])**2-(y-P.c[1])**2; if(e2<=0) return null;
    const B=P.box; if(B&&(x<B[0]||x>B[2]||y<B[1]||y>B[3])) return null;
    const f=z=>P.f(cam([x,y,z])), z1=Math.max(P.c[2]-Math.sqrt(e2),B?B[4]:-1e9); let z=Math.min(P.c[2]+Math.sqrt(e2),B?B[5]:1e9), d=f(z);
    for(let i=0;i<110&&z>z1;i++){ if(d<0.03) break; z-=Math.max(d*0.8,0.05); d=f(z); }   // a cell is a third of a unit, so 0.03 is exact enough
    if(d>=0.03||z<=z1) return null;
    const p=cam([x,y,z]), e=0.03, g=[0,1,2].map(i=>{ const a=p.slice(), b=p.slice(); a[i]+=e; b[i]-=e; return P.f(a)-P.f(b); }), nw=norm(g);
    const h={D:z,n:cam(nw)}, mm=P.o.mf&&P.o.mf(p,nw);
    if(mm){ h.m=mm[0]||P.mat; h.dt=mm[1]||0; h.gloss=P.o.gloss||0; }
    return h; }
  function hitE(P,x,y){ const d=[x-P.c[0],y-P.c[1],1000-P.c[2]], dir=[0,0,-1];
    const lo=P.u.map((u,i)=>dot(d,u)/P.r[i]), ld=P.u.map((u,i)=>dot(dir,u)/P.r[i]);
    const A=dot(ld,ld),B=2*dot(lo,ld),C=dot(lo,lo)-1,disc=B*B-4*A*C; if(disc<0) return null;
    for(const t of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)]){ const l=add(lo,sc(ld,t)); if(P.o.cut&&!P.o.cut(l)) continue;
      if(P.o.paint){ let q=P.o.paint(l); if(!q) continue; if(typeof q==='string') q={m:q}; const ln=q.n||l;   // a painted part: its colour (and a facet's normal) by where on it
        let n=[0,0,0]; for(let i=0;i<3;i++) n=add(n,sc(P.u[i],ln[i]/P.r[i])); return {D:1000-t,n:norm(n),m:q.m,dt:q.dt||0,gloss:q.gloss!=null?q.gloss:(P.o.gloss||0)}; }
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
    // at one cell a unit the head is turned square to the camera (heel to toe across the screen), so it reads as itself
    if(PP_PUTTER[id]){ const u0=norm(add(V(0,1,0),sc(cdir,-1))), sd=V(1,0,0), up=norm(sub(u0,sc(sd,dot(u0,sd)))), k=1.35;
      ppPutter(push,id,pal,hands,cdir,add(head,sc(up,-1.15),sc(sd,-1.9*k)),[norm(cross(sd,up)),up,sd],k,1); return; }
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

  /* THE PUTT PUTT WORLD PUTTERS (pu_pp...), modelled as what they are and the same in both models: a swirled
     lollipop on a striped candy stick, a neon tube mallet, a carved jade idol with gold eyes, a mammoth tusk curving
     along the grass from a frosted collar, a harvest moon crescent, and a brilliant-cut diamond on platinum. A head
     is built in its own frame: G on the grass at the heel, AX=[fw,up,sd] (sd runs heel to toe), k its scale and lo
     for the course golfer. The grip and shaft run from the hands A down cdir to the head, in each putter's finish. */
  const PP_PUTTER={pu_pplollipop:1,pu_ppneon:1,pu_ppjadeidol:1,pu_pptusk:1,pu_ppharvest:1,pu_ppdiamond:1};
  // a convex block or gem as a raymarched volume: inside every plane {n:[s,u,f],d}, painted by the facet nearest the ray
  function polyV(O,AX,k,box,planes){ planes.forEach(p=>{ const l=Math.hypot(...p.n); p.n=p.n.map(v=>v/l); p.d/=l; });
    const g=camv(AX[0]), h=camv(AX[1]), l=camv(AX[2]), Oc=cam(O), B={s:box.s.map(v=>v*k),u:box.u.map(v=>v*k),f:box.f.map(v=>v*k)};
    const test=(s,u,f)=>{ s/=k; u/=k; f/=k; let best=null,bd=-1e9; for(const p of planes){ const v=p.n[0]*s+p.n[1]*u+p.n[2]*f-p.d; if(v>0) return null; if(v>bd){ bd=v; best=p; } }
      return {r:{m:'x:'+(typeof best.c==='function'?best.c(s,u,f):best.c),dt:best.dt||0,gloss:best.gloss!=null?best.gloss:2},n:best.n}; };
    let bb=[1e9,1e9,-1e9,-1e9]; for(const a of B.s) for(const b of B.u) for(const c of B.f){ const p=add(Oc,sc(l,a),sc(h,b),sc(g,c)); bb=[Math.min(bb[0],p[0]),Math.min(bb[1],p[1]),Math.max(bb[2],p[0]),Math.max(bb[3],p[1])]; }
    return {k:'v',O:Oc,g,h,l,test,mat:'x:#ffffff',o:{},box:B,bb2:bb}; }
  // a bevelled box: its six faces and twelve chamfers, each face painted by c(face) (a colour or a function of s,u,f)
  function ppBox(s0,s1,u0,u1,fh,bev,c){ const P=[], sm=(s0+s1)/2, um=(u0+u1)/2, hs=(s1-s0)/2, hu=(u1-u0)/2;
    for(const [n,d,key] of [[[1,0,0],hs,'s'],[[-1,0,0],hs,'s'],[[0,1,0],hu,'top'],[[0,-1,0],hu,'bot'],[[0,0,1],fh,'f'],[[0,0,-1],fh,'f']]) P.push({n,d,c:c(key)});
    for(const [a,b] of [[0,1],[0,2],[1,2]]) for(const x of [1,-1]) for(const y of [1,-1]){ const n=[0,0,0]; n[a]=x; n[b]=y; const hh=[hs,hu,fh]; P.push({n,d:hh[a]+hh[b]-bev,c:c('bev')}); }
    return {planes:P.map(p=>({n:p.n,d:p.d+p.n[0]*sm+p.n[1]*um,c:p.c,gloss:p.gloss})),centre:[sm,um]}; }
  function ppPutter(push,id,pal,A,cdir,G,AX,k,lo){
    const X=h=>'x:'+h, [fw,up,sd]=AX, L=(f,u,s)=>add(G,sc(fw,f*k),sc(up,u*k),sc(sd,s*k)), along=t=>add(A,sc(cdir,t));
    const E=(f,u,s,R,c,o)=>push(ellipsoid(L(f,u,s),AX,R.map(v=>v*k),X(c),o)), Cp=(a,b,r,c,o)=>push(capsule(L(...a),L(...b),r*k,X(c),o));
    const g0=lo?-2.6:-1.1, gr=lo?0.95:0.92, sr=lo?0.6:0.36;
    const grip=(c,band)=>{ push(capsule(along(g0),along(3.6),gr,X(c))); if(band) for(const t of [g0+0.5,3.0]) push(capsule(along(t-0.25),along(t+0.25),gr*1.06,X(band),{gloss:2})); };
    const shaft=(to,c,o)=>push(capsule(along(3.6),to,sr,X(c),Object.assign({gloss:2},o||{})));
    const stripes=(to,c1,c2,n)=>{ const a=along(3.6), d=sub(to,a); for(let i=0;i<n;i++) push(capsule(add(a,sc(d,i/n)),add(a,sc(d,(i+1)/n)),sr*1.15,X(i%2?c2:c1),{gloss:2})); };
    const s0=lo?0:0.2, f1=lo?1:0;   // the course golfer's head sits a little nearer the heel
    if(id==='pu_pplollipop'){ // a lollipop: a white disc swirled pink, standing on its edge, on a striped candy stick
      const c=[0,2.75,1.75+s0], R=[0.7,2.7,2.7]; grip(pal.K||'#ff4f9a');
      stripes(L(...c),pal.K||'#ff4f9a',pal.L||'#fff4f8',lo?9:11);
      push(ellipsoid(L(...c),AX,R.map(v=>v*k),X(pal.W||'#fff1f7'),{gloss:2}));
      push(over(L(...c),AX,R.map(v=>v*k),X(pal.P||'#f0287e'),l=>{ const r=Math.hypot(l[1],l[2]); if(r>0.94) return false; const a=Math.atan2(l[1],l[2]); return (((a/(2*Math.PI)+r*(lo?1.0:1.5))%1)+1)%1<0.5; },{gloss:2}));
      push(over(L(...c),AX,R.map(v=>v*k*1.01),X(pal.l||'#ff8fc0'),l=>Math.hypot(l[1],l[2])>0.94&&Math.abs(l[0])<0.75,{gloss:1}));   // the rolled rim
      for(const z of [1,-1]) E(0.62*z,3.8,1.0+s0,[0.2,0.5,0.32],pal.h||'#ffffff',{gloss:3,noCast:1});
      return; }
    if(id==='pu_ppneon'){ // a neon sign of a mallet: a black box framed in a lit magenta tube, a cyan bar across it and a cyan sight line
      const bx=ppBox(0,3.8,0.05,2.25,0.75,0.32,()=>pal.k||'#120a1e'); grip(pal.G||'#14101e',pal.c||'#7ff6ff');
      shaft(L(0,2.2,0.7+s0),pal.l||'#3a3350');
      push(capsule(L(0,2.15,0.7+s0),L(0,2.65,0.7+s0),0.55*k,X(pal.C||'#00c8e8'),{gloss:3,bias:.4,noCast:1}));   // a lit ferrule
      push(polyV(L(0,0,s0),AX,k,{s:[-0.2,4],u:[-0.1,2.4],f:[-0.9,0.9]},bx.planes));
      const tube=(pts,c,glow,r)=>{ for(let i=1;i<pts.length;i++){ Cp(pts[i-1],pts[i],r+0.07,glow,{noCast:1}); Cp(pts[i-1],pts[i],r,c,{gloss:3,bias:.5,noCast:1}); } };
      for(const z of [0.8,-0.8]){ const pts=[], u0=0.38, u1=1.92, a0=0.4+s0, a1=3.4+s0, rr=0.32;
        const arc=(cu,cs,b0)=>{ for(let i=0;i<=3;i++){ const b=(b0+i*30)*D2R; pts.push([z,cu+rr*Math.sin(b),cs+rr*Math.cos(b)]); } };
        arc(u1-rr,a1-rr,0); arc(u1-rr,a0+rr,90); arc(u0+rr,a0+rr,180); arc(u0+rr,a1-rr,270); pts.push(pts[0]);
        tube(pts,pal.m||'#ff4fe0',pal.M||'#d10fb4',lo?0.42:0.25);
        tube([[z,1.15,1.05+s0],[z,1.15,2.75+s0]],pal.c||'#7ff6ff',pal.C||'#00c8e8',0.22); }
      tube([[0,2.32,1.3+s0],[0,2.32,3.4+s0]],pal.c||'#7ff6ff',pal.C||'#00c8e8',0.22);
      return; }
    if(id==='pu_ppjadeidol'){ // a carved jade idol: a squat block head with a crown of nubs, a brow, a broad nose, a grim mouth and gold eyes
      const J=pal.J||'#1d8a56', j=pal.j||'#5fd496', d=pal.d||'#0f4f30', Y=pal.Y||'#ffd34a', H=lo?3.4:4.0, W=lo?3.4:3.8;
      const face=(s,u)=>{ const x=s-W/2;   // the carving, on the front and the back
        if(u>H*0.66&&u<H*0.72) return d;
        if(Math.abs(x)>0.3&&Math.abs(x)<1.45&&u>H*0.44&&u<H*0.64) return d;
        if(Math.abs(x)<0.32&&u>H*0.36&&u<H*0.64) return j;
        if(Math.abs(x)<1.15&&u>H*0.17&&u<H*0.29) return Math.abs(x)<1.0&&u>H*0.2&&u<H*0.26&&(Math.floor((x+1)*2.5)%2===0)?j:d;
        return J; };
      const bx=ppBox(0,W,0.05,H,1.25,0.4,key=>key==='f'?(s,u)=>face(s,u):key==='top'||key==='bev'?j:key==='s'?(s,u)=>(Math.floor(u*1.6)%2?J:d):d);
      grip(pal.G||'#3a2412'); shaft(L(0,H,W/2+s0),pal.l||'#c9a227',{gloss:3});
      push(polyV(L(0,0,s0),AX,k,{s:[-0.2,W+0.2],u:[-0.1,H+0.2],f:[-1.4,1.4]},bx.planes));
      for(const s of [0.55,W-0.55]) E(0,H+0.35,s+s0,[0.85,0.5,0.5],j,{gloss:2});
      E(0,H+0.3,W/2+s0,[0.7,0.55,0.7],Y,{gloss:3});                                   // a gold collar where the shaft goes in
      for(const z of [1,-1]) for(const x of [-0.85,0.85]) E(z*1.18,H*0.54,W/2+x+s0,lo?[0.3,0.42,0.42]:[0.28,0.34,0.36],Y,{gloss:3,noCast:1,bias:.3});
      return; }
    if(id==='pu_pptusk'){ // a mammoth tusk lying along the grass, its root in a frosted collar at the shaft, its point curling up
      const I=pal.I||'#f7eed4', i0=pal.i||'#d2bf90', hh=pal.h||'#fffdf5', F=pal.F||'#eaf8ff', f=pal.f||'#9fd4f2';
      grip(f,F); shaft(L(0,1.9,0.05+s0),pal.w||'#7a5634',{gloss:1});
      const N=12, pt=t=>[1.6*t*t,0.95+(lo?1.9:2.2)*Math.pow(t,2.6),0.5+s0+(lo?4.6:5.4)*t], rad=t=>(lo?1.3:1.1)*(1-t*0.84);
      for(let n=1;n<=N;n++){ const a=(n-1)/N, b=n/N; Cp(pt(a),pt(b),rad(b),n>N-2?hh:I,{gloss:2}); }
      for(const t of [0.2,0.38,0.56]){ const p=pt(t), q=pt(t+0.025); Cp(p,q,rad(t)*1.07,i0,{noCast:1}); }
      E(0,0.95,0.38+s0,[1.28,1.28,0.42],F,{gloss:3});                                  // the frosted collar
      for(let n=0;n<8;n++){ const a=n*45*D2R; E(1.25*Math.cos(a),0.95+1.25*Math.sin(a),0.38+s0,[0.32,0.32,0.5],n%2?f:F,{gloss:3,noCast:1}); }
      return; }
    if(id==='pu_ppharvest'){ // a harvest moon: a fat golden crescent on its back, horns up, with craters and a lit inner rim
      const c=[0,2.7,2.0+s0], R=[0.8,2.6,2.6], bite=l=>Math.hypot(l[1]-0.42,l[2]-0.38);
      grip(pal.G||'#5a2f0c'); shaft(L(0,3.5,0.15+s0),pal.l||'#b8732a');
      push(ellipsoid(L(...c),AX,R.map(v=>v*k),X(pal.Y||'#ffbf1f'),{gloss:2,cut:l=>bite(l)>0.74}));
      push(over(L(...c),AX,R.map(v=>v*k),X(pal.A||'#d9700f'),l=>bite(l)>0.74&&Math.hypot(l[1],l[2])>0.8,{gloss:1}));
      push(over(L(...c),AX,R.map(v=>v*k*1.01),X(pal.h||'#fff2b0'),l=>bite(l)>0.74&&bite(l)<0.84&&Math.hypot(l[1],l[2])<0.8,{gloss:3,noCast:1}));
      for(const [u,s,r] of [[-0.5,-0.3,0.13],[-0.6,0.3,0.1],[-0.05,-0.6,0.1],[0.45,-0.62,0.08]]) push(over(L(...c),AX,R.map(v=>v*k*1.012),X(pal.A||'#d9700f'),l=>Math.hypot(l[1]-u,l[2]-s)<r*(lo?1.5:1)&&bite(l)>0.74,{noCast:1}));
      return; }
    if(id==='pu_ppdiamond'){ // a brilliant-cut diamond, table up and point down, on a platinum shaft, throwing glints
      const Rg=lo?2.5:2.8, Ht=lo?0.85:0.95, Hp=lo?2.25:2.5, gd=0.14, ce=Math.cos(50*D2R), se=Math.sin(50*D2R), c2=Math.cos(38*D2R), s2=Math.sin(38*D2R), P=[];
      const W=pal.W||'#ffffff', w=pal.w||'#d6f8ff', B=pal.B||'#8fe0f6', b=pal.b||'#4aa8d8';
      P.push({n:[0,1,0],d:Ht,c:W,gloss:3});
      for(let i=0;i<8;i++){ const a=i*45*D2R, a2=a+22.5*D2R;
        P.push({n:[Math.cos(a)*ce,se,Math.sin(a)*ce],d:Rg*ce+gd*se,c:i%2?w:B,gloss:3});
        P.push({n:[Math.cos(a2)*c2,s2,Math.sin(a2)*c2],d:Rg*c2+gd*s2,c:i%2?W:w,gloss:3});
        for(const [az,hp,c] of [[a,Hp,i%2?b:B],[a2,Hp*0.93,i%2?B:w]]){ const n=[Math.cos(az)*hp,-Rg,Math.sin(az)*hp]; P.push({n,d:Rg*hp+gd*Rg,c,gloss:3}); }
        P.push({n:[Math.cos(a2),0,Math.sin(a2)],d:Rg,c:W,gloss:3}); P.push({n:[Math.cos(a),0,Math.sin(a)],d:Rg,c:W,gloss:3}); }
      const O=[0,Hp+0.05,Rg+0.1+s0];
      grip(pal.G||'#2a2f3a',pal.D||'#bff4ff'); shaft(L(O[0],O[1]+Ht+0.2,O[2]),pal.l||'#eef2f7',{gloss:3});
      Cp([0,O[1]+Ht,O[2]],[0,O[1]+Ht+0.55,O[2]],0.62,pal.l||'#eef2f7',{gloss:3});        // the platinum setting
      push(polyV(L(...O),AX,k,{s:[-Rg-0.2,Rg+0.2],u:[-Hp-0.3,Ht+0.2],f:[-Rg-0.2,Rg+0.2]},P));
      const glint=(f,u,s,z)=>{ const o={gloss:3,noCast:1,t:4}; Cp([f,u,s-z],[f,u,s+z],lo?0.34:0.17,W,o); Cp([f,u-z,s],[f,u+z,s],lo?0.34:0.17,W,o); if(!lo) E(f,u,s,[0.3,0.3,0.3],W,o); };
      if(lo) glint(Rg,O[1]+1.4,O[2]+Rg*0.8,1.2);
      else { glint(Rg+0.4,O[1]+1.7,O[2]+Rg*0.75,1.0); glint(Rg+0.4,O[1]-0.9,O[2]-Rg*0.85,0.65); glint(Rg+0.4,O[1]+0.2,O[2]+Rg+0.9,0.45); }
      return; }
  }

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
      if(lg&&(!gear.leg||gear.leg==='plusfours')){ push(capsule(hip,knee,3.05,'pants')); push(ellipsoid(add(knee,sc(U,-0.8)),[F,U,T],[3.2,1.6,3.2],'pants',{dt:-1}));
        push(capsule(add(knee,sc(U,-1.4)),ank,2.35,'sock')); }
      else if(gear.leg==='shorts'){ push(capsule(hip,add(knee,sc(U,1.2)),2.95,'pants')); push(capsule(add(knee,sc(U,1.0)),ank,2.0,'skin')); push(capsule(add(sc(add(knee,ank),0.5),sc(U,-1.2)),ank,2.1,'x:'+((gear.legPal||{}).w||'#f4f4f0'))); }   // shorts: bare from the knee, plain white socks
      else { push(capsule(hip,knee,2.7,'pants')); push(capsule(knee,ank,2.7,'pants')); }
      const tip=walk?(lift>0?-0.12*lift:fw<0?0.22*(-fw/5.2):0):0;   // a lifted foot toes down, the trailing one rolls onto its toe
      const sF=walk?rot(F,T,tip):F, sU=walk?rot(U,T,tip):U;
      const sc0=walk?add(ank,sc(sF,1.0),sc(sU,-1.7)):add(P(1.4,1.5+heel*1.2,l),sc(T,heel*1.4)), sax=[sF,sU,T], sr=[4.6,1.7,2.5];
      if(cl&&CLEAT_COURSE[cl.id]){ CLEAT_COURSE[cl.id](push,sc0,sax,sr,cl.pal,ank); continue; }
      push(ellipsoid(sc0,sax,sr,'shoe',{gloss:2,bias:.15}));
      push(over(sc0,sax,sr,cl?'x:'+cl.sole:'sole',l=>l[1]<-0.5));
      if(cl&&cl.acc) push(over(sc0,sax,sr,'x:'+cl.acc,l=>l[0]>-0.38&&l[0]<0.08&&l[1]>-0.5,{gloss:1})); }
    push(ellipsoid(hipC,[hipAx(F),U,hipAx(T)],[4.8,4.2,7.2],'pants'));
    push(ellipsoid(add(hipC,P(0.6,2.4,0)),[hipAx(F),spine,hipAx(T)],[5.3,1.15,7.7],'belt',{gloss:1}));
    // the torso turns about the spine
    const tc=walk?P(0.4,23,0):P(1.2,23,0), tr=v=>rot(v,spine,turnA(pose.turn)), tp=p=>rotAbout(p,tc,spine,turnA(pose.turn));
    const TAX=[tr(F),spine,tr(T)], TR=[5.6,7.6,8.3], top=gear.top, tpal=gear.topPal||{};
    const body=top==='shacket'?'plaid':'shirt', blz=top==='blazer'||top==='ppchampjacket';
    const tsurf=(v,z)=>add(tc,sc(TAX[0],5.6*1.04*Math.sqrt(Math.max(0,1-v*v-(z/8.3)*(z/8.3)))),sc(TAX[1],7.6*v),sc(TAX[2],z));
    push(ellipsoid(tc,TAX,TR,body));
    push(capsule(tp(Pu(3.2,28.8,0)),tp(Pu(4.2,30.4,0)),2.6,'skin',{dt:-1}));
    push(ellipsoid(tp(Pu(3.0,28.6,0)),TAX,[3.6,1.3,4.3],body,{dt:1}));
    // the outerwear, over the torso
    if(top==='cardigan'||top==='shacket'){ push(over(tc,TAX,TR,'polo',l=>l[0]>0.3&&Math.abs(l[2])<0.15+0.1*Math.max(0,l[1])));
      for(const v of [-0.35,0.05,0.42]) push(ellipsoid(tsurf(v,1.9),TAX,[0.55,0.55,0.55],'x:'+(tpal['4']||'#5f4c2e'),{gloss:2})); }
    if(blz){ push(over(tc,TAX,TR,'x:'+tpal['6'],l=>l[0]>0.25&&l[1]>-0.2&&Math.abs(l[2])<0.36*(l[1]+0.2)));
      push(over(tc,TAX,TR.map(v=>v*1.01),'x:'+tpal['7'],l=>l[0]>0.25&&l[1]>-0.62&&Math.abs(l[2])<0.075));
      for(const v of [-0.42,-0.22]) push(ellipsoid(tsurf(v,1.6),TAX,[0.5,0.5,0.5],'x:'+tpal['4'],{gloss:2}));
      if(top==='ppchampjacket'){ const zs=(walk?-1:1)*(lefty?-1:1);   // the Members jacket: its lapels, and the gold crest on the wearer's left chest
        push(over(tc,TAX,TR.map(v=>v*1.005),'x:'+tpal['8'],l=>l[0]>0.25&&l[1]>-0.2&&Math.abs(l[2])>=0.36*(l[1]+0.2)&&Math.abs(l[2])<0.36*(l[1]+0.2)+0.13));
        push(ellipsoid(tsurf(0.24,zs*3.7),TAX,[0.55,1.05,0.95],'x:'+tpal.C,{gloss:2})); push(ellipsoid(add(tsurf(0.26,zs*3.7),sc(TAX[0],0.2)),TAX,[0.5,0.6,0.55],'x:'+tpal.c,{gloss:3})); } }
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
    // CURLS: one head of hair with the curls carved into it, so they run into each other as hair does. Each curl is
    // a rounded lobe of a wave over the head's surface, the grooves between them drawn a shade darker.
    const curls=(R,c,fq,amp,lo)=>{ const amp2=amp*0.35, wave=q=>{ const u=norm(q);
        const w=Math.sin(fq*u[0]+1.3)*Math.sin(fq*u[1]+0.4)*Math.sin(fq*u[2]+2.1)+0.25*Math.sin(fq*1.4*(u[0]+u[2])+0.7)*Math.sin(fq*1.4*u[1]+1.9);
        return amp*Math.sqrt(Math.min(1,Math.abs(w)*1.25)); };
      const loc=p=>{ const q=sub(p,c); return [dot(q,look)/R[0],dot(q,hup)/R[1],dot(q,Lf)/R[2]]; };
      out.push(field(c,Math.max(...R)+amp+1,p=>{ const q=sub(p,c), l=loc(p);
          return Math.max(sdE(p,c,AXh,R)-wave(q),(thr(l)+lo-l[1])*R[1]); },'hair',
        {gloss:1,bias:-.08,mf:p=>{ const d=wave(sub(p,c)); return ['hair',d<amp2?-1:d>amp*0.9?1:0]; }})); };
    if(style==='afro'){ if(under) base([S*1.13,S*1.1,S*1.15]); else curls([S*1.26,S*1.22,S*1.3],add(hc,sc(hup,1.4)),7,1.3,-0.08); }
    else if(style==='buzz') base([S*1.025,S*1.065,S*1.022],null,{dt:-1});
    else if(style==='mohawk'){ if(!under){ base([S*1.03,S*1.065,S*1.03],null,{dt:-1,cut:l=>l[1]>thr(l)+0.05&&Math.abs(l[2])<0.2});
        out.push(ellipsoid(add(hc,sc(hup,hr*0.98),sc(look,-0.2)),AXh,[hr*1.0,4.4,1.75],'hair',{gloss:1,cut:l=>l[1]>-0.55})); } else base([S*1.025,S*1.065,S*1.022],null,{dt:-1}); }
    else if(style==='curly'&&!under) curls([S*1.04,S*1.07,S*1.04],hc,6,1.5,0);
    else { const vol=style==='curly'?1.08:1.045; base([S*vol,S*(vol+0.025),S*vol]);
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
    // THE MENU CAP: a six panel crown that comes down over the hair at the temples and the back, its seams sewn in,
    // and a pre-curved brim that pitches down and bends down at its sides, as a real golf cap's does. One piece
    // (field) so it reads as a brim from the front, its underside a shade darker.
    if(cap&&MO) out.push(...capParts(M,style==='afro'?1.19:1.07,{}));
    else if(cap){ out.push(ellipsoid(add(hc,sc(hup,hr*0.18+lift)),[look,hup,Lf],[hr*1.06,hr*0.95,hr*1.06],'hat',{cut:l=>l[1]>-0.12}));
      out.push(MO?ellipsoid(add(hc,sc(look,hr*0.98),sc(hup,hr*0.0+lift)),[look,hup,Lf],[hr*1.0,0.85,hr*1.0],'hat',{dt:-1,cut:l=>l[0]>-0.2})
        :ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.02+lift)),[look,hup,Lf],[hr*0.75,0.75,hr*0.82],'hat',{dt:-1,cut:l=>l[0]>-0.15}));
      out.push(ellipsoid(add(hc,sc(hup,hr*1.1+lift)),[look,hup,Lf],[1.1,0.8,1.1],'hatbtn'));
      if(MO){ const pc=add(hc,sc(look,hr*0.93),sc(hup,hr*0.52+lift));
        out.push(ellipsoid(pc,[look,hup,Lf],[0.62,2.5,2.7],'patch',{t:2,cut:l=>Math.abs(l[1])<0.7&&Math.abs(l[2])<0.7}));
        out.push(ellipsoid(add(pc,sc(look,0.2)),[look,hup,Lf],[0.5,0.62,1.05],'patchmark',{t:2,noCast:1})); }
      else out.push(ellipsoid(add(hc,sc(look,hr*0.95),sc(hup,hr*0.48)),[look,hup,Lf],[0.6,1.5,2.0],'patch',{t:2})); }
    if(visor&&MO){ const R=(style==='afro'?1.48:style==='curly'?1.25:1.1)*hr;   // the band sits outside the hair, the brim like the cap's
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
    headband:{wrapAll:1,w:1.3}, pphallowscrown:{wrapAll:1,w:1.25,dy:-2,snug:1}, ppvisor:{wrapAll:1,w:1.3}, pptricorn:{dz:.6} };
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
  // THE CLUB HEADS AS THE REAL THINGS, each one smooth surface in the head's own frame (a out of the face, y up, s
  // toward the toe): a driver or wood is a pear shaped head with a flat scored face, a domed crown with an alignment
  // mark, a skirt and a sole plate; an iron is a lofted blade, thicker at the sole and taller at the toe, grooved, with
  // a cavity behind; a wedge is the same with more loft and a taller face; a blade putter is a milled bar on a
  // plumber's neck, a mallet a half moon with sight lines.
  function profileClub(push,hands,h0,F,U,id,pal,outV){
    const stock={driver:'driver',wood:'wood',iron:'iron',wedge:'wedge',putter:'putter'};
    const type=stock[id]||(id==='persimmon'?'wood':String(id).indexOf('pu_')===0?'putter':(typeof CLUB_RECOLOR!=='undefined'&&CLUB_RECOLOR[id])||(id==='blade'?'iron':'driver'));
    const kit=!!(pal&&pal.H), X=h=>'x:'+h;
    const out0=sub(h0,hands); const out=outV?norm(outV):norm([out0[0],0,out0[2]]), cdir=norm(sub(h0,hands));
    const along=t=>add(hands,sc(cdir,t)), hoselTop=add(h0,sc(U,1.6),sc(out,-0.25));
    push(capsule(along(-1.1),along(3.6),0.92,X(kit&&pal.G?pal.G:'#26262e')));                               // the grip
    push(capsule(along(3.6),hoselTop,0.33,X((pal&&pal.l)||'#c4ccd4'),{gloss:2}));                           // the shaft
    push(capsule(add(hoselTop,sc(cdir,-0.3)),hoselTop,0.45,'x:#1b1d22'));                                    // the ferrule
    const head=(C,R,f,mat,mf)=>{ const loc=p=>{ const q=sub(p,C); return {a:dot(q,F),y:dot(q,U),s:dot(q,out)}; };
      push(field(C,R,p=>f(loc(p)),mat,{gloss:2,mf:mf?(p,n)=>mf(loc(p),n):null})); };
    if(type==='driver'||type==='wood'){ const big=type==='driver', S=big?1:0.8;
      const crown=X(id==='persimmon'||id==='rosewood'?(pal.W||pal.H):kit?pal.H:'#24282f'), face=X(kit?(pal.F||'#cfd3da'):'#3a3f48'), sole=X(kit?(pal.S||'#cfd3da'):'#cfd3da');
      const C=add(h0,sc(out,2.6*S),sc(U,1.25*S-1.25),sc(F,-0.6*S));
      push(capsule(hoselTop,add(C,sc(out,-2.3*S),sc(F,0.9*S),sc(U,0.3*S)),0.5,crown,{gloss:2}));            // the hosel
      head(C,4.2*S,L=>{ const s=L.s/S, a=L.a/S, y=L.y/S, w=2.9-0.5*Math.max(0,-s)/2.9;                      // narrower at the heel
          const q=[a/2.55,y/(1.25+0.12*Math.max(0,-a)/2.5),s/w], k0=Math.hypot(...q), k1=Math.hypot(q[0]/2.55,q[1]/1.3,q[2]/w);
          return Math.max(k0*(k0-1)/k1,a-1.75,-y-1.05)*S; },crown,(L,n)=>{ const a=L.a/S, y=L.y/S, s=L.s/S;
          if(a>1.6) return [face,Math.abs(((y+2)*3.2)%1-0.5)<0.12&&Math.abs(s)<1.6?-1:0];            // the face and its score lines
          if(y<-0.92) return [sole,0];                                                               // the sole plate
          if(y<-0.45) return [face,-1];                                                              // the skirt
          return Math.abs(s-0.2)<0.07&&a>0.6&&y>0.6?[sole,1]:[crown,0]; });                          // the alignment mark
      return; }
    if(type==='iron'||type==='wedge'){ const wedge=type==='wedge', tl=Math.tan(wedge?0.72:0.42), body=X(kit?pal.H:'#b7bdc6'), face=X(kit?(pal.F||'#dfe4ea'):'#dfe4ea'), grv=X(kit?(pal.G||'#5a626c'):'#6f7884');
      const C=add(h0,sc(out,2.0),sc(U,-0.5)), top=s=>(wedge?1.15:0.8)+(wedge?0.3:0.42)*(s+1.6)/3.6;
      push(capsule(hoselTop,add(C,sc(out,-1.75),sc(U,0.45)),0.42,body,{gloss:2}));                        // the hosel
      head(C,4.4,L=>{ const ap=L.a+L.y*tl*0.6, th=0.22+0.42*clamp01(1-(L.y+0.75)/1.7);
          const d2=rbox(Math.max(-1.6-L.s,L.s-2.0),Math.max(-0.75-L.y,L.y-top(L.s)),0.45);
          return Math.max(d2,Math.abs(ap+th*0.5)-th); },body,(L,n)=>{ const ap=L.a+L.y*tl*0.6;
          if(dot(n,F)>0.3&&L.y>-0.6&&L.y<top(L.s)-0.15){ const g=((L.y+0.75)/0.26)%1; return [Math.abs(g-0.5)<0.14&&L.s>-1.2&&L.s<1.6?grv:face,0]; }   // the face and its grooves
          if(dot(n,F)<-0.3&&L.y>-0.45&&L.y<top(L.s)-0.35&&L.s>-1.0&&L.s<1.6) return [body,-1];                 // the cavity behind
          return null; });
      return; }
    const mallet=id==='mallet'||['pu_halfmoon','pu_counter','pu_scope','pu_bank','pu_buoy'].indexOf(id)>=0, body=X(kit?pal.H:'#5a636e'), sight=X(kit?(pal.S||'#e2e6ec'):'#f4f7fa');
    const C=add(h0,sc(out,1.9),sc(U,-0.8));
    if(mallet){ // a half moon mallet: flat face, round back, sight lines across its top
      push(capsule(hoselTop,add(C,sc(out,-0.2),sc(U,0.4)),0.4,body,{gloss:2}));
      head(C,3.4,L=>rbox(Math.max(Math.hypot(L.a-0.45,L.s/1.05)-2.1,L.a-0.45),Math.abs(L.y)-0.42,0.25),body,(L,n)=>{
        if(L.y>0.3&&(Math.abs(L.s)<0.08||Math.abs(Math.abs(L.s)-0.55)<0.07)) return [sight,1];
        if(kit&&pal.F&&dot(n,F)>0.6) return [X(pal.F),0]; if(kit&&pal.G&&L.y<-0.3) return [X(pal.G),0]; return null; });
      return; }
    // a blade putter: a milled bar with a flange behind and a plumber's neck bending into the heel
    const neck=add(C,sc(out,-1.2),sc(U,0.45),sc(F,0.1));
    push(capsule(hoselTop,add(neck,sc(U,1.2),sc(F,0.3)),0.38,body,{gloss:2})); push(capsule(add(neck,sc(U,1.2),sc(F,0.3)),add(neck,sc(U,1.2),sc(out,0.6)),0.36,body,{gloss:2}));
    push(capsule(add(neck,sc(U,1.2),sc(out,0.6)),add(neck,sc(out,0.6)),0.36,body,{gloss:2}));
    head(C,3.2,L=>Math.min(rbox(Math.abs(L.s)-1.9,Math.abs(L.y)-0.45,0.15)+Math.max(0,Math.abs(L.a)-0.38),rbox(Math.abs(L.s)-1.6,Math.abs(L.y+0.25)-0.2,0.1)+Math.max(0,Math.abs(L.a+0.6)-0.55)),body,(L,n)=>{
      if(L.y>0.38&&Math.abs(L.s)<0.07&&L.a>-0.4) return [sight,1];
      if(kit&&pal.F&&dot(n,F)>0.6&&Math.abs(L.s)<1.4) return [X(pal.F),0]; if(kit&&pal.G&&L.y<-0.3) return [X(pal.G),0]; return null; });
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
    // the Pro Shop line's tops: long sleeved (PLL), vests over the polo's own sleeves (PLV), and the mock neck
    const PLL={quarterzip:1,windbreaker:1,hoodie:1,rainjacket:1,argyle:1}, PLV={sweatervest:1,puffervest:1}, pl=!!(PLL[top]||PLV[top]||top==='mockneck');
    const body=top==='shacket'?'plaid':(top==='cardigan'||top==='sweatervest'||top==='argyle')?'k:'+tpal['1']:'shirt', AX=[F,U,T], blz=top==='blazer'||top==='ppchampjacket';   // a cardigan is knitted (k: is ribbed when painted)
    // THE BUILD: a lean golfer. BW narrows the torso, hips and belt, AW brings the arms, hands and club in to match.
    const BW=0.84, AW=0.87;
    // THE LEGS AND SHOES, as the real things. Trousers: each leg a straight, slightly tapered tube with a pressed
    // crease down the front and the hem breaking on the shoe. Plus fours: full knickers gathered into a cuff below the
    // knee, blousing over it, with argyle socks. Shoes: a golf shoe built on a last: a sole unit with a stitched welt,
    // a toe that rises to the instep and the heel collar, the toe cap, saddle and heel tab in the accent, laces over
    // a tongue.
    const legId=lg?(gear.leg||'plusfours'):'', lp=gear.legPal||{}, LX=h=>'x:'+h;
    for(const s of [1,-1]){ const t=3.6*s; tag=lg?'leg':'pants';
      const hip=P(0,16.4,t*0.94);
      // THE PRO SHOP LINE'S LEGWEAR. Shorts: a tailored leg cut square above the knee, a pressed crease, the bare leg below
      // and a low white sock. Joggers: a looser tapered leg gathered into a ribbed cuff at the ankle, a seam down the side.
      // Tartan trousers: the trouser, woven in its tartan (a set of bands each way, a fine line through the middle).
      if(legId==='shorts'){ const hem=P(0.3,10.4,t*1.02), L2=dot(sub(hem,hip),sub(hem,hip)), ank=P(0.2,3.3,t*1.02), kn=P(0.55,8.0,t*1.02);
        push(field(add(hip,sc(sub(hem,hip),0.5)),6.5,p=>sdCone(p,hip,hem,3.3,3.25)-0.1,'pants',{mf:(p,n)=>{ const q=sub(p,hip), tt=dot(q,sub(hem,hip))/L2, sd=dot(q,T)-(dot(sub(hem,hip),T))*tt;
            if(tt>0.94) return ['pants',tt>0.985?-1:0];                                                         // the turned hem
            if(tt>0.88&&tt<0.91) return ['pants',-1];                                                           // its stitching
            return dot(n,F)>0.55&&Math.abs(sd)<0.2?['pants',1]:null; }}));                                     // the crease
        tag='';
        push(field(kn,7,p=>smin(smin(sdCap(p,add(hem,sc(U,0.6)),kn,1.95),sdCap(p,kn,ank,1.75),0.6),sdE(p,P(-0.15,6.6,t*1.02),AX,[1.75,1.9,1.6]),0.8),'skin',{}));   // the knee, the calf, the shin
        push(field(add(ank,sc(U,1.6)),4.5,p=>sdCone(p,add(ank,sc(U,-0.4)),add(ank,sc(U,3.4)),1.95,1.9)-0.05,LX(lp.w||'#f4f4f0'),{mf:p=>{ const h=dot(sub(p,ank),U); return h>2.6?[LX(lp.w||'#f4f4f0'),Math.sin(Math.atan2(dot(sub(p,ank),T),dot(sub(p,ank),F))*14)>0.2?-1:0]:null; }}));   // a plain white crew sock, ribbed at the top
        tag=lg?'leg':'pants'; }
      else if(legId==='joggers'){ const ank=P(0.2,3.9,t*1.02), kn=P(0.55,9.6,t*1.04), L2=dot(sub(ank,hip),sub(ank,hip)), cuff=LX(lp['3']||'#15171b');
        push(field(kn,10,p=>smin(smin(sdCone(p,hip,kn,3.45,3.15),sdCone(p,kn,ank,3.15,2.15),0.8),sdE(p,kn,AX,[3.3,2.2,3.3]),0.9)-0.08,'pants',{mf:(p,n)=>{ const q=sub(p,hip), tt=dot(q,sub(ank,hip))/L2;
            const side=dot(n,T)*s; if(Math.abs(side-0.92)<0.06) return ['pants',-1];                          // the side seam
            if(Math.abs(tt-0.48)<0.02&&dot(n,F)>0.3) return ['pants',-1];                                      // a soft fold at the knee
            return dot(n,F)>0.6&&Math.sin(tt*40+dot(q,T)*2)>0.94?['pants',1]:null; }}));                       // gentle wrinkles
        push(field(ank,3.4,p=>sdCone(p,add(ank,sc(U,-0.9)),add(ank,sc(U,0.6)),2.2,2.25)-0.06,cuff,{mf:p=>{ const q=sub(p,ank); return [cuff,Math.sin(Math.atan2(dot(q,T),dot(q,F))*14)>0.2?1:-1]; }}));   // the ribbed cuff
        push(capsule(add(ank,sc(U,-0.7)),P(0.2,3.0,t*1.02),1.7,'skin')); }                                  // a bare ankle above the shoe
      else if(lg&&legId==='plusfours'){ const lp2=gear.legPal||{}, cuffM='x:'+(lp2['2']||lp2['1']||'#6a6040'), band=P(0.25,7.4,t*1.03);
        push(field(P(0.2,11.5,t),9,p=>smin(sdCone(p,hip,P(0.3,8.6,t*1.05),3.3,3.75),sdE(p,P(0.35,8.6,t*1.05),AX,[3.75,1.6,3.8]),1.2),'pants',{mf:p=>{ const y=dot(sub(p,band),U);
            return y>0.3&&y<1.6&&Math.sin(Math.atan2(dot(sub(p,band),T),dot(sub(p,band),F))*9)>0.4?['pants',-1]:null; }}));     // the knickers, puffed over the cuff
        push(field(band,4,p=>sdCone(p,add(band,sc(U,-0.55)),add(band,sc(U,0.55)),2.55,2.55)-0.15,cuffM,{}));                       // the gathered cuff
        push(capsule(add(band,sc(U,-0.5)),P(0.1,3.4,t*1.02),2.3,'sock')); }                                                        // argyle socks
      else { const ank=P(0.2,3.3,t*1.02), L2=dot(sub(ank,hip),sub(ank,hip)), tart=legId==='tartan';
        const sett=p=>{ const v=((dot(p,U)/3.4)%1+1)%1, h=(((dot(p,T)+dot(p,F)*0.6)/3.4)%1+1)%1, bv=v<0.3, bh=h<0.3;   // the tartan's sett, in the trouser's own space
          if(Math.abs(v-0.15)<0.03||Math.abs(h-0.15)<0.03) return LX(lp['4']||'#f2d24a'); return bv&&bh?LX(mix2(lp['2']||'#1e2f52','#000000',0.25)):bv||bh?LX(lp['2']||'#1e2f52'):'pants'; };
        push(field(add(hip,sc(sub(ank,hip),0.5)),9.5,p=>sdCone(p,hip,ank,3.3,2.7)-0.1,'pants',{mf:(p,n)=>{ const q=sub(p,hip), tt=dot(q,sub(ank,hip))/L2, sd=dot(q,T)-(dot(sub(ank,hip),T))*tt;
            if(tart){ const m=sett(p); if(tt>0.975) return [m,-1]; return [m,dot(n,F)>0.55&&Math.abs(sd)<0.22?1:0]; }
            if(tt>0.975) return ['pants',-1];                                                                     // the hem
            if(dot(n,F)>0.55&&Math.abs(sd)<0.22) return ['pants',1];                                            // the pressed crease
            if(dot(n,F)>0.55&&Math.abs(Math.abs(sd)-0.32)<0.1) return ['pants',-1];                            // its shadow
            return tt>0.9&&Math.abs(dot(n,F))>0.4&&Math.sin(sd*3)>0.6?['pants',-1]:null; }}));                // the break over the shoe
      }
      tag='';
      // the shoe, toes turned out a little as a golfer stands
      const z=3.95*s, sole=cl?'x:'+cl.sole:'sole', sad='x:'+gear.saddleHex, toe=12*D2R;
      const Fs=norm(add(sc(F,Math.cos(toe)),sc(T,s*Math.sin(toe)))), Ts=norm(cross(Fs,U)), b0=P(0.2,0,z), AXs=[Fs,U,Ts];
      const Q=(f,u,t)=>add(b0,sc(Fs,f),sc(U,u),sc(Ts,t||0));   // a reward cleat (CLEAT_MENU) is modelled in the foot's own frame
      const loc=p=>{ const q=sub(p,b0); return [dot(q,Fs),dot(q,U),dot(q,Ts)]; };
      const foot=(f,tt)=>{ const w=2.95*(f<1.5?1-0.16*((1.5-f)/5.4)**2:1); return (Math.hypot((f-1.5)/5.4,tt/w)-1)*2.9; };
      const top=(f,tt)=>{ const h=f>2.5?1.3+1.5*(1-((f-2.5)/4.4)**2):f>-1.6?2.8+(2.5-f)/4.1*1.35:4.15-(-1.6-f)*0.35; return h-0.85*(tt/2.95)**2*h/3; };
      const n0=parts.length;
      if(cl&&CLEAT_MENU[cl.id]) CLEAT_MENU[cl.id](push,Q,AXs,s,cl.pal,HD); else
      push(field(add(b0,sc(Fs,1.5),sc(U,2)),7.5,p=>{ const [f,u,tt]=loc(p);
          const dS=Math.max(foot(f,tt)-0.12,Math.abs(u-0.45)-0.45), dU=Math.max(foot(f,tt)+0.32*clamp01((u-1)/3),u-top(f,tt),0.75-u);
          return smin(dS,dU,0.25); },'shoe',{gloss:2,bias:.1,mf:p=>{ const [f,u,tt]=loc(p), h=top(f,tt);
          if(u<0.95) return [sole,u>0.8?-1:0];                                                                       // the sole and its welt
          if(f>4.7) return [sad,0];                                                                                   // the toe cap
          if(Math.abs(tt)<0.95&&f>-0.9&&f<2.9&&u>h-0.5) return ((f*2.3)%1+1)%1<0.38?['lace',1]:['shoe',-1];            // laces over the tongue
          if(f>0.1&&f<2.7&&u>1.4) return [sad,0];                                                                     // the saddle
          if(f<-3.2&&u>2.1) return [sad,0];                                                                           // the heel tab
          return null; }}));
      for(let i=n0;i<parts.length;i++){ parts[i].o.item='shoe'; parts[i].o.side=s; } }
    // hips and belt
    tag=lg?'leg':'pants'; push(ellipsoid(P(0,15.6,0),AX,[4.4,3.1,8.5*BW],'pants'));
    if(legId==='tartan'){ const HR=[4.4,3.1,8.5*BW], hp=P(0,15.6,0), at=l=>add(hp,sc(F,l[0]*HR[0]),sc(U,l[1]*HR[1]),sc(T,l[2]*HR[2])), fr=v=>v-Math.floor(v);   // the tartan carries on over the seat
      const bands=l=>{ const p=at(l), v=fr(dot(p,U)/3.4), h=fr((dot(p,T)+dot(p,F)*0.6)/3.4); return [v<0.3,h<0.3,Math.abs(v-0.15)<0.03||Math.abs(h-0.15)<0.03]; };
      push(over(hp,AX,HR.map(v=>v*1.004),LX(lp['2']||'#1e2f52'),l=>{ const b=bands(l); return (b[0]||b[1])&&!b[2]; },{noCast:1}));
      push(over(hp,AX,HR.map(v=>v*1.006),LX(lp['4']||'#f2d24a'),l=>bands(l)[2],{noCast:1})); }
    if(HD){ push(over(P(0,15.6,0),AX,[4.4,3.1,8.5*BW],'pants',l=>l[0]>0.5&&Math.abs(l[2]-0.04)<0.03&&l[1]<0.6,{dt:-1,noCast:1}));     // the fly
      for(const sd of [1,-1]) push(over(P(0,15.6,0),AX,[4.4,3.1,8.5*BW],'pants',l=>l[0]>0.2&&Math.abs(l[2]*sd-0.62+0.25*(0.6-l[1]))<0.035&&l[1]>-0.1,{dt:-1,noCast:1})); }   // slant pockets
    tag='';
    push(ellipsoid(P(0.05,17.75,0),AX,[4.8,0.72,8.95*BW],'belt',{gloss:1}));
    if(HD){ push(ellipsoid(P(4.8,17.75,0),AX,[0.5,0.85,1.15],'x:#d6a640',{gloss:2,noCast:1})); push(ellipsoid(P(5.05,17.75,0),AX,[0.4,0.42,0.6],'belt',{noCast:1})); }
    // THE SHIRT. A tall ellipsoid trimmed top and bottom (nearly straight sides, no barrel), sloped shoulders, a
    // little blousing where it tucks into the belt, and tension folds from each armpit toward the buckle.
    // The menu's phase (0 to 1) breathes it: the chest swells a touch, the shoulders lift, the folds drift.
    const ph=(MO?MO.phase:0)*2*Math.PI, br=Math.sin(ph), sw=Math.sin(ph+1.1);
    const jacket=top==='cardigan'||blz||top==='shacket'||!!PLL[top]; tag=jacket||pl?'top':'shirt';
    const puff=top==='puffervest'?1.08:1, tc=P(0,27,0), TR=[4.6*(1+0.012*br)*puff,22,8.55*BW*(1+0.014*br)*(puff>1?1.04:1)], lo=-(27-17.4)/22, hi=(33.6-27)/22, inT=l=>l[1]>lo&&l[1]<hi;
    push(ellipsoid(tc,AX,TR,body,{cut:inT}));
    for(const s of [1,-1]) push(capsule(P(-0.2,32.5+0.12*br,2.6*s),P(-0.2,30.6+0.15*br,6.5*s),2.1,body));    // the shoulders, sloping
    push(ellipsoid(P(0.2,19.0,0),AX,[4.8,1.35,8.75*BW+0.08*sw],body,{dt:0}));                                     // blousing over the belt
    push(capsule(P(0.3,32.2,0),P(0.6,35.8,0),2.85,'skin',{dt:-1}));                                              // the neck, under the head
    // the collar: a jacket's or the cape's is the old soft roll; a polo's is a real band round the neck, open at the front
    const polo=!jacket&&!blz&&top!=='mockneck';
    if((!polo||!HD)&&!(pl&&HD)) push(ellipsoid(P(0.7,33.5,0),AX,[3.7,1.15,4.7],body,{dt:1}));
    else { const n0=P(0.45,32.9,0), n1=P(0.6,34.5,0);
      push(field(add(n0,sc(U,0.8)),5.5,p=>{ const q=sub(p,n0), a=dot(q,F), sd=dot(q,T);
          return Math.max(Math.abs(sdCone(p,n0,n1,3.55,3.2))-0.32,-(a-2.2+Math.abs(sd)*1.4)); },'polo',{mf:p=>dot(sub(p,n0),U)>1.35?['polo',1]:null})); }
    if(HD&&!blz){ const d=0.02*sw;
      // folds: two from each armpit in toward the buckle, and creases just above the belt
      for(const s of [1,-1]){
        push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.15&&l[1]>-0.36&&l[1]<0.04&&Math.abs(l[2]*s-(0.80+1.45*l[1]+d))<0.05,{dt:-1,noCast:1}));
        push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.15&&l[1]>-0.40&&l[1]<-0.1&&Math.abs(l[2]*s-(0.95+1.6*l[1]-d))<0.045,{dt:-1,noCast:1}));
        push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.15&&l[1]>-0.30&&l[1]<0.02&&Math.abs(l[2]*s-(0.875+1.45*l[1]+d))<0.03,{dt:1,noCast:1})); }   // the lit side of the first fold
      for(const [y,w] of [[-0.385,0.55],[-0.405,0.35]]) push(over(tc,AX,TR,body,l=>inT(l)&&l[0]>0.2&&Math.abs(l[1]-y-0.004*sw)<0.006&&Math.abs(l[2])<w,{dt:-1,noCast:1})); }
    // the polo: the collar folded down into two flat points on the chest, outlined; a placket and two buttons
    function poloFront(){
      const tri=(x,y,a,b,c)=>{ const e=(p,q)=>(q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]); const d1=e(a,b),d2=e(b,c),d3=e(c,a); return (d1>=0&&d2>=0&&d3>=0)||(d1<=0&&d2<=0&&d3<=0); };
      for(const s of [1,-1]){ const A=[0.06*s,0.305], B=[0.46*s,0.31], C=[0.32*s,0.19], A2=[0.1*s,0.3], B2=[0.42*s,0.302], C2=[0.315*s,0.205];
        push(over(tc,AX,TR.map(v=>v*1.012),'polo',l=>l[0]>0.25&&tri(l[2],l[1],A,B,C),{noCast:1,dt:-1}));                 // its edge
        push(over(tc,AX,TR.map(v=>v*1.02),'polo',l=>l[0]>0.25&&tri(l[2],l[1],A2,B2,C2),{noCast:1,dt:1})); }              // the flap
      push(over(tc,AX,TR,'polo',l=>inT(l)&&l[0]>0.45&&Math.abs(l[2])<0.075&&l[1]>0.1&&l[1]<0.29));
      for(const u of [30.0,28.2]) push(ellipsoid(P(4.82,u,0),AX,[0.42,0.45,0.45],'polo',{dt:-1,gloss:2,noCast:1})); }
    // THE PRO SHOP LINE'S TOPS, as the garments. A collar is a ring of cloth standing round the neck (ring: open says how
    // wide its front slit is). Quarter-zip: a stand collar split by a zip that runs to mid chest, ribbed hem and cuffs.
    // Mock neck: a closed tube collar folded at the top, short sleeves. Sweater vest: knitted, a V with a trim band over the
    // polo and its collar, the polo's own sleeves. Windbreaker: a contrast yoke over the chest and shoulders, a half zip,
    // elastic hem and cuffs. Hoodie: a hood lying in a roll behind the neck, drawstrings, a kangaroo pocket. Rain jacket: a
    // tall zipped collar with a packed hood at the back, a full zip under a storm flap, a chest pocket zip, a taped seam.
    // Argyle sweater: a knitted V-neck over the polo, its diamonds and dashed lines knitted in. Puffer vest: a puffed
    // body quilted into baffles, a stand collar, a full zip, over the polo's sleeves.
    function proTop(){ const X2=h=>'x:'+h, trim=X2(tpal['3']||mix2(tpal['1']||'#555555','#000000',0.45)), TRo=TR.map(v=>v*1.012);
      const ring=(y0,y1,r0,r1,m,open)=>{ const n0=P(0.45,y0,0), n1=P(0.6,y1,0);
        push(field(add(n0,sc(U,(y1-y0)/2)),6,p=>{ const q=sub(p,n0), a=dot(q,F), sd=dot(q,T); let d=Math.abs(sdCone(p,n0,n1,r0,r1))-0.34;
            if(open) d=Math.max(d,-(a-2.6+Math.abs(sd)*open)); return d; },m,{mf:p=>dot(sub(p,n0),U)>y1-y0-0.4?[m,1]:null})); };
      const zip=(y0,y1)=>{ push(over(tc,AX,TRo,trim,l=>inT(l)&&l[0]>0.3&&Math.abs(l[2])<0.022&&l[1]>y0&&l[1]<y1,{noCast:1}));
        push(ellipsoid(P(4.78,27+22*y0-0.7,0.15),AX,[0.3,0.75,0.4],X2('#c9ced6'),{gloss:3,noCast:1})); };   // the zip and its pull
      const hemRib=m=>{ push(over(tc,AX,TR.map(v=>v*1.01),m,l=>inT(l)&&l[1]<lo+0.07,{noCast:1}));
        push(over(tc,AX,TR.map(v=>v*1.014),m,l=>inT(l)&&l[1]<lo+0.07&&Math.sin(Math.atan2(l[2],l[0])*34)>0.2,{dt:-1,noCast:1})); };
      const vE=l=>0.1+0.62*Math.max(0,l[1]), vNeck=(band)=>{ push(over(tc,AX,TR,'polo',l=>inT(l)&&l[0]>0.3&&l[1]>0.0&&Math.abs(l[2])<vE(l)));
        push(over(tc,AX,TRo,band,l=>inT(l)&&l[0]>0.25&&l[1]>-0.02&&Math.abs(l[2])>=vE(l)&&Math.abs(l[2])<vE(l)+0.075,{dt:1,noCast:1})); poloFront(); };
      if(top==='quarterzip'){ ring(32.5,35.5,3.65,3.35,body,7); zip(0.02,0.3);
        push(capsule(P(3.95,32.9,0),P(3.6,35.3,0),0.16,trim,{noCast:1})); hemRib(body); }
      else if(top==='mockneck'){ ring(32.5,35.9,3.6,3.3,body,0); push(over(tc,AX,TRo,body,l=>l[0]>0.2&&Math.abs(l[1]-0.24)<0.006&&Math.abs(l[2])<0.35,{dt:-1,noCast:1})); }
      else if(top==='sweatervest'){ vNeck('k:'+(tpal['4']||'#e7dcc6')); hemRib(body); }
      else if(top==='windbreaker'){ const yk=X2(tpal['4']||'#f2f0ea');
        push(over(tc,AX,TRo,yk,l=>inT(l)&&l[1]>0.02&&l[1]<0.16,{noCast:1}));                                                  // the colour block across the chest
        for(const y of [0.02,0.16]) push(over(tc,AX,TR.map(v=>v*1.016),trim,l=>inT(l)&&Math.abs(l[1]-y)<0.008,{noCast:1}));        // its piping
        ring(32.5,35.4,3.65,3.35,body,7); zip(0.04,0.3); hemRib(trim); }
      else if(top==='hoodie'){ const Ra=4.1, Rb=5.3, hcN=P(0.0,33.6,0);
        const roll=p=>{ const q=sub(p,hcN), a=dot(q,F), b=dot(q,T), h=dot(q,U), t2=Math.atan2(b/Rb,a/Ra); return Math.hypot(a-Ra*Math.cos(t2),b-Rb*Math.sin(t2),h)-1.05; };
        push(field(P(-1.4,34.6,0),9,p=>smin(roll(p),sdE(p,P(-3.4,35.6,0),AX,[2.6,3.3,5.4]),1.2),body,{mf:(p,n)=>dot(sub(p,hcN),F)>2.4&&dot(n,U)>0.3?[body,-1]:null}));   // the hood
        for(const s of [1,-1]){ push(capsule(P(4.25,33.0,1.25*s),P(4.95,27.6,1.5*s),0.2,X2(tpal['5']||'#f2f2f2'),{noCast:1}));
          push(capsule(P(4.95,27.6,1.5*s),P(5.0,26.9,1.52*s),0.27,X2('#c9ced6'),{gloss:2,noCast:1})); }                      // drawstrings and aglets
        const pk=(l,k)=>l[1]>-0.36+k&&l[1]<-0.08-k&&Math.abs(l[2])<0.36-k+(-0.08-l[1])*0.7;
        push(over(tc,AX,TRo,body,l=>l[0]>0.2&&pk(l,0),{dt:1,noCast:1}));
        push(over(tc,AX,TR.map(v=>v*1.016),body,l=>l[0]>0.2&&pk(l,0)&&!pk(l,0.02),{dt:-1,noCast:1}));                          // the kangaroo pocket
        hemRib(body); }
      else if(top==='rainjacket'){ ring(32.3,36.3,3.8,3.5,body,0);
        push(capsule(P(-2.3,35.5,-3.4),P(-2.3,35.5,3.4),1.45,body));                                                           // the packed hood
        push(capsule(P(4.0,32.6,0),P(3.65,36.1,0),0.15,trim,{noCast:1})); zip(lo+0.02,0.3);
        push(over(tc,AX,TR.map(v=>v*1.02),body,l=>inT(l)&&l[0]>0.3&&l[2]>0.02&&l[2]<0.085,{dt:1,noCast:1}));                  // the storm flap
        push(over(tc,AX,TR.map(v=>v*1.016),trim,l=>l[0]>0.2&&Math.abs(l[1]-0.08-(l[2]-0.25)*0.35)<0.008&&l[2]>0.22&&l[2]<0.55,{noCast:1}));   // a chest pocket zip
        push(over(tc,AX,TR.map(v=>v*1.01),body,l=>inT(l)&&Math.abs(l[1]-0.2)<0.007,{dt:-1,noCast:1})); }                       // the taped seam
      else if(top==='argyle'){ const dmd=X2(tpal['4']||'#b9a46a'), ln=X2(tpal['5']||'#e7dcc6'), fr=v=>v-Math.floor(v);
        const front=l=>inT(l)&&l[0]>0.15&&l[1]>lo+0.07&&l[1]<0.24&&!(l[1]>0.0&&Math.abs(l[2])<vE(l)+0.075);
        push(over(tc,AX,TRo,'k:'+(tpal['4']||'#b9a46a'),l=>{ if(!front(l)) return false; const u=l[2]*3.2+l[1]*5.2, v=l[2]*3.2-l[1]*5.2; return ((Math.floor(u)+Math.floor(v))&1)===0; },{noCast:1}));
        push(over(tc,AX,TR.map(v=>v*1.016),ln,l=>{ if(!front(l)) return false; const u=l[2]*3.2+l[1]*5.2+0.5, v=l[2]*3.2-l[1]*5.2+0.5;
            return (fr(u)<0.05&&fr(v*2)<0.5)||(fr(v)<0.05&&fr(u*2)<0.5); },{noCast:1}));
        vNeck(trim); hemRib(trim); void dmd; }
      else if(top==='puffervest'){ const fr=v=>v-Math.floor(v);
        push(over(tc,AX,TR.map(v=>v*1.004),body,l=>inT(l)&&fr((l[1]-lo)/0.105)<0.07,{dt:-1,noCast:1}));                       // the baffle seams
        push(over(tc,AX,TR.map(v=>v*1.006),body,l=>inT(l)&&l[0]>0.45&&Math.abs(fr((l[1]-lo)/0.105)-0.55)<0.08,{dt:1,noCast:1}));   // each baffle's puff
        ring(32.5,35.6,3.95,3.75,body,7); zip(lo+0.02,0.3); } }
    // THE JACKETS, made as the garments: their fronts, bands, pockets and collars (the sleeves are with the arms)
    const box=(l,y0,y1,x0,x1)=>l[1]>y0&&l[1]<y1&&l[2]>x0&&l[2]<x1, rim=(l,y0,y1,x0,x1,w)=>box(l,y0,y1,x0,x1)&&!box(l,y0+w,y1-w*0.5,x0+w*0.3,x1-w*0.3);
    if(top==='cardigan'){ const vE=l=>0.13+0.6*Math.max(0,l[1]-0.05), knit=body;
      push(over(tc,AX,TR,'polo',l=>inT(l)&&l[0]>0.3&&l[1]>0.06&&Math.abs(l[2])<vE(l)-0.1*clamp01((0.14-l[1])/0.08)));            // the shirt in the V, closing to the top button
      push(over(tc,AX,TR.map(v=>v*1.012),knit,l=>inT(l)&&l[0]>0.25&&Math.abs(l[2])>=vE(l)&&Math.abs(l[2])<vE(l)+0.07&&l[1]>0.05,{dt:1,noCast:1}));   // the button bands up the V
      push(over(tc,AX,TR.map(v=>v*1.012),knit,l=>inT(l)&&l[0]>0.25&&l[1]<=0.05&&l[1]>lo+0.06&&Math.abs(l[2]-0.06)<0.07,{dt:1,noCast:1}));         // and down the front
      push(over(tc,AX,TR.map(v=>v*1.014),knit,l=>inT(l)&&l[0]>0.25&&l[1]<=0.05&&Math.abs(l[2]+0.012)<0.012,{dt:-1,noCast:1}));                    // where they overlap
      push(over(tc,AX,TR.map(v=>v*1.01),knit,l=>inT(l)&&l[1]<lo+0.065,{dt:-1,noCast:1}));                                                       // the ribbed waistband
      for(const sd of [1,-1]) push(over(tc,AX,TR.map(v=>v*1.012),knit,l=>l[0]>0.2&&rim(l,-0.36,-0.2,sd>0?0.24:-0.58,sd>0?0.58:-0.24,0.03),{dt:-1,noCast:1}));   // patch pockets
      for(const u of [20.4,22.9,25.4,27.9]) push(ellipsoid(P(4.82,u,0.45),AX,[0.48,0.48,0.48],'x:'+(tpal['4']||'#5f4c2e'),{gloss:2,noCast:1})); }
    else if(top==='shacket'){ const tri=(x,y,a,b,c)=>{ const e=(p,q)=>(q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]); const d1=e(a,b),d2=e(b,c),d3=e(c,a); return (d1>=0&&d2>=0&&d3>=0)||(d1<=0&&d2<=0&&d3<=0); };
      push(over(tc,AX,TR,'polo',l=>inT(l)&&l[0]>0.3&&l[1]>0.2&&Math.abs(l[2])<0.04+0.6*Math.max(0,l[1]-0.2)));                     // the shirt at the open neck
      for(const sd of [1,-1]){ push(over(tc,AX,TR.map(v=>v*1.02),'plaid',l=>l[0]>0.25&&tri(l[2],l[1],[0.07*sd,0.31],[0.5*sd,0.31],[0.32*sd,0.16]),{dt:1,noCast:1}));   // the spread collar
        push(over(tc,AX,TR.map(v=>v*1.014),'x:'+tpal['3'],l=>l[0]>0.25&&tri(l[2],l[1],[0.05*sd,0.315],[0.53*sd,0.315],[0.32*sd,0.14]),{noCast:1}));
        push(over(tc,AX,TR.map(v=>v*1.012),'plaid',l=>l[0]>0.2&&rim(l,0.0,0.14,sd>0?0.2:-0.56,sd>0?0.56:-0.2,0.025),{dt:-1,noCast:1}));         // a chest pocket
        push(over(tc,AX,TR.map(v=>v*1.02),'plaid',l=>l[0]>0.2&&box(l,0.1,0.16,sd>0?0.19:-0.57,sd>0?0.57:-0.19),{dt:1,noCast:1}));             // its flap
        push(ellipsoid(P(4.9,30.0,3.0*sd),AX,[0.4,0.4,0.4],'x:'+tpal['4'],{gloss:2,noCast:1})); }
      push(over(tc,AX,TR.map(v=>v*1.012),'plaid',l=>inT(l)&&l[0]>0.25&&l[1]<0.18&&Math.abs(l[2])<0.06,{dt:1,noCast:1}));                       // the placket
      for(const u of [19.6,22.4,25.2]) push(ellipsoid(P(4.85,u,0),AX,[0.45,0.45,0.45],'x:'+tpal['4'],{gloss:2,noCast:1})); }
    else if(blz){ const champ=top==='ppchampjacket', vE=l=>0.5*(l[1]+0.05), cl='x:'+tpal['1'], dkc='x:'+tpal['2'];
      push(over(tc,AX,TR,'x:'+tpal['6'],l=>inT(l)&&l[0]>0.25&&l[1]>0.0&&Math.abs(l[2])<vE(l)));                                   // the shirt
      push(over(tc,AX,TR.map(v=>v*1.01),'x:'+tpal['7'],l=>inT(l)&&l[0]>0.25&&l[1]>-0.1&&Math.abs(l[2])<0.07));                      // the tie
      // the lapels: rolled back from the V, wider at the chest, with a notch where they meet the collar
      const lap=l=>l[0]>0.22&&l[1]>-0.02&&l[1]<0.31&&Math.abs(l[2])>=vE(l)&&Math.abs(l[2])<vE(l)+0.1+0.22*Math.max(0,Math.min(1,(l[1]+0.02)/0.2))*(l[1]>0.2&&l[1]<0.235?0.35:1);
      push(over(tc,AX,TR.map(v=>v*1.03),cl,lap,{dt:1,noCast:1}));
      push(over(tc,AX,TR.map(v=>v*1.022),dkc,l=>l[0]>0.22&&l[1]>-0.03&&l[1]<0.31&&Math.abs(l[2])>=vE(l)&&Math.abs(l[2])<vE(l)+0.13+0.24*Math.max(0,Math.min(1,(l[1]+0.02)/0.2)),{noCast:1}));   // its shadow
      push(over(tc,AX,TR.map(v=>v*1.012),cl,l=>l[0]>0.2&&rim(l,0.04,0.12,-0.6,-0.36,0.022),{dt:-1,noCast:1}));                   // the breast pocket
      if(!champ) push(over(tc,AX,TR.map(v=>v*1.018),'x:#f4f1e6',l=>l[0]>0.2&&l[1]>0.115&&l[1]<0.145&&l[2]>-0.56&&l[2]<-0.42&&Math.abs(l[2]+0.49)<(0.145-l[1])*2.6,{noCast:1}));   // a pocket square
      if(champ){ const X=h=>'x:'+h;
        // THE MEMBERS CHAMPION JACKET: the blazer made in deep purple, its lapels piped in a lit violet along the
        // edge, gold buttons, and the gold crest (a shield on a lighter ground) on the breast pocket
        push(over(tc,AX,TR.map(v=>v*1.032),X(tpal['8']),l=>lap(l)&&Math.abs(l[2])>=vE(l)+0.075+0.22*Math.max(0,Math.min(1,(l[1]+0.02)/0.2))*(l[1]>0.2&&l[1]<0.235?0.35:1),{dt:1,noCast:1}));
        const cv=0.075, cz=-0.48, cp=add(tc,sc(F,TR[0]*Math.sqrt(Math.max(0,1-cv*cv-cz*cz))+0.2),sc(U,22*cv),sc(T,TR[2]*cz)), sh=l=>l[1]>-0.25||Math.abs(l[0])<0.95*(l[1]+1);
        push(ellipsoid(cp,AX,[0.3,1.3,1.1],X(tpal.C),{gloss:2,noCast:1,cut:l=>sh([l[2],l[1]])}));
        push(ellipsoid(add(cp,sc(F,0.12)),AX,[0.3,1.0,0.82],X(tpal.c),{gloss:3,noCast:1,cut:l=>sh([l[2],l[1]])}));
        push(ellipsoid(add(cp,sc(F,0.28),sc(U,0.1)),AX,[0.2,0.48,0.2],X(tpal.C),{noCast:1})); push(ellipsoid(add(cp,sc(F,0.28),sc(U,0.25)),AX,[0.2,0.17,0.46],X(tpal.C),{noCast:1})); }
      for(const sd of [1,-1]) push(over(tc,AX,TR.map(v=>v*1.012),dkc,l=>l[0]>0.2&&Math.abs(l[1]+0.27)<0.007&&l[2]*sd>0.28&&l[2]*sd<0.66,{noCast:1}));   // the hip pockets
      for(const u of [20.6,22.6]) push(ellipsoid(P(4.85,u,0),AX,[0.5,0.5,0.5],'x:'+tpal['4'],{gloss:2,noCast:1})); }
    else if(pl&&HD) proTop();
    else if(HD) poloFront(); // the polo
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
    for(const s of [1,-1]){ const hold=s===dom, slv=blz?'x:'+tpal['1']:PLV[top]?'polo':body;
      const sh=P(-0.2,30.0+0.15*br,9.2*AW*s), el=hold?P(0.9,23.0,10.5*AW*s):P(0.4,23.0,10.4*AW*s), wr=hold?P(2.4,17.7,11.0*AW*s):P(1.3,17.3,10.9*AW*s);
      const se=add(sh,sc(sub(el,sh),0.48)), mid=add(el,sc(sub(wr,el),0.45)), flap=sc(F,0.12*sw*s);
      if(jacket){ // A JACKET'S SLEEVE: long, bending at the elbow, a fold inside it; the cardigan's ends in a ribbed cuff, the
        // blazer's in a plain cuff with buttons, the shacket's is rolled up to the forearm
        const roll=top==='shacket', s0=add(sh,sc(norm(sub(sh,se)),1.2),sc(U,0.4)), e1=roll?add(el,sc(sub(wr,el),0.5)):add(el,sc(sub(wr,el),0.86));
        const L1=dot(sub(el,s0),sub(el,s0)), L2=dot(sub(e1,el),sub(e1,el)), sm=blz?'x:'+tpal['1']:slv;
        push(field(add(s0,sc(sub(e1,s0),0.5)),Math.sqrt(dot(sub(e1,s0),sub(e1,s0)))/2+4,p=>smin(sdCone(p,s0,el,2.2,1.95),sdCone(p,el,e1,1.95,blz?1.72:1.68),0.9)-0.1,sm,{mf:p=>{
            const t1=dot(sub(p,s0),sub(el,s0))/L1, t2=dot(sub(p,el),sub(e1,el))/L2;
            if(t2>0.985) return [sm,-1];                                                          // the open cuff
            if(top==='cardigan'&&t2>0.74) return [sm,t2<0.77?-1:0];                               // the ribbed cuff
            if((top==='quarterzip'||top==='hoodie'||top==='argyle')&&t2>0.8) return [sm,Math.sin(Math.atan2(dot(sub(p,e1),U),dot(sub(p,e1),F))*12)>0.2?-1:0];   // ribbed cuffs
            if(top==='windbreaker'&&t2>0.82) return ['x:'+(tpal['3']||'#2a2d33'),t2<0.84?-1:0];   // an elastic cuff
            if(top==='rainjacket'&&t2>0.8&&t2<0.84) return [sm,-1];                                 // the cuff's tab
            if(blz&&t2>0.8&&t2<0.83) return [sm,-1];
            return Math.abs(t1-0.93)<0.035||Math.abs(t2-0.08)<0.03?[sm,-1]:null; }}));            // the fold at the elbow
        if(roll){ push(field(e1,4,p=>sdCone(p,add(e1,sc(sub(el,e1),0.14)),add(e1,sc(sub(wr,el),0.03)),2.05,2.05)-0.15,'x:'+tpal['2'],{mf:p=>[ 'x:'+tpal['2'],Math.sin(dot(sub(p,e1),norm(sub(wr,el)))*4)>0.3?1:-1]}));   // the roll
          push(capsule(e1,mid,1.5,'skin')); push(capsule(mid,wr,1.22,'skin')); }
        if(blz) for(const k of [0.88,0.93]) push(ellipsoid(add(el,sc(sub(e1,el),k),sc(F,-0.4),sc(T,1.65*s)),AX,[0.32,0.32,0.32],'x:'+tpal['4'],{gloss:2,noCast:1}));   // cuff buttons
      }
      else { // THE SLEEVE: a short tube from inside the shoulder, a touch wider at the hem, cut square there with the hem
        // stitched a finger above the edge and a fold across it; the hem swings a little with the breath
        const s0=add(sh,sc(norm(sub(sh,se)),1.2),sc(U,0.4)), s1=add(se,flap), L2=dot(sub(s1,s0),sub(s1,s0));
        push(field(add(s0,sc(sub(s1,s0),0.5)),Math.sqrt(L2)/2+3.2,p=>sdCone(p,s0,s1,2.15,2.4)-0.12,slv,{mf:p=>{ const t=dot(sub(p,s0),sub(s1,s0))/L2;
          if(t>0.985||(t>0.82&&t<0.87)) return [slv,-1];                                       // the open hem and its stitching
          return HD&&Math.abs(t-0.5-0.12*dot(sub(p,s0),U)*s)<0.035?[slv,-1]:null; }}));       // a fold across it
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
    // One inflated body (field): the tube, the duck's neck and head grown out of it, its beak, and a tail at the
    // back. The seam round the outside of the tube is moulded in.
    if(top==='duckfloatie'){ tag='top'; const fc=P(0.4,18.6,0), Ra=7.4, Rb=11.2*BW, rt=2.6, ring=a=>add(fc,sc(F,Ra*Math.cos(a)),sc(T,Rb*Math.sin(a)));
      const ha=-28*D2R, rp=ring(ha), o2=norm(add(sc(F,Math.cos(ha)),sc(T,Math.sin(ha)))), sd2=norm(cross(o2,U)), hd=add(rp,sc(U,5.0),sc(o2,0.6)), AXd=[o2,U,sd2];
      const bk=add(hd,sc(o2,2.8),sc(U,-0.5)), tl=add(ring(ha+Math.PI),sc(U,2.2),sc(o2,-0.6));
      const tube=p=>{ const q=sub(p,fc), a=dot(q,F), b=dot(q,T), h=dot(q,U), t=Math.atan2(b/Rb,a/Ra); return Math.hypot(a-Ra*Math.cos(t),b-Rb*Math.sin(t),h)-rt; };
      const duck=p=>smin(smin(tube(p),sdCap(p,add(rp,sc(U,1.2)),hd,1.75),1.8),smin(sdE(p,hd,AXd,[2.9,2.7,2.7]),sdE(p,tl,AXd,[1.6,2.0,1.1]),0.1),1.4);
      const beak=p=>sdE(p,bk,AXd,[1.8,0.65,1.2]);
      const box=[]; for(const i of [1,-1]) for(const j of [1,-1]) for(const u of [-rt-0.5,10]) box.push(add(fc,sc(F,i*(Ra+rt+3)),sc(T,j*(Rb+rt+0.5)),sc(U,u)));
      push(field(fc,Math.max(Ra,Rb)+rt+9,p=>Math.min(duck(p),beak(p)),'x:'+tpal['1'],{gloss:2,bias:.15,pts:box,mf:p=>{
          if(beak(p)<duck(p)) return ['x:'+tpal['4'],0];
          const q=sub(p,fc), a=dot(q,F)/Ra, b=dot(q,T)/Rb, h=dot(q,U);
          return Math.abs(h)<0.22&&a*a+b*b>1.05&&tube(p)<0.2?['x:'+tpal['1'],-1]:null; }}));
      for(const s of [1,-1]) push(ellipsoid(add(hd,sc(o2,2.1),sc(U,0.9),sc(sd2,1.35*s)),[o2,U,sd2],[0.5,0.6,0.5],'x:'+tpal['5'],{noCast:1}));
      tag=''; }
    // the club, gripped in the dominant hand, its head on the grass just outside that foot
    if(gear.ballC){ const bp=P(6.2,3.2,-10.2*dom); push(capsule(P(6.2,0.2,-10.2*dom),P(6.2,1.5,-10.2*dom),0.32,'x:#e8ebf0'));   // the tee
      push(ellipsoid(add(bp,sc(U,-1.0)),AX,[0.8,0.35,0.8],'x:#e8ebf0'));
      if(gear.ballId) ppBall(push,bp,AX,U,T,gear.ballId,PXG_BALL_PAL[gear.ballId]); else push(ellipsoid(bp,AX,[1.8,1.8,1.8],'x:'+gear.ballC,{gloss:3})); }
    const hands=add(P(2.75,16.0,11.15*AW*dom)), clubHead=P(3.8,1.3,12.9*AW*dom), out=sc(T,dom);
    const id=gear.club||'driver', c0=parts.length;
    if(NOVELTY[id]||id==='pu_magicwand'){ profileNovelty(push,hands,clubHead,F,U,out,id==='pu_magicwand'?'wand':id,gear.clubPal||{}); }
    else if(PP_PUTTER[id]) ppPutter(push,id,gear.clubPal||{},hands,norm(sub(clubHead,hands)),add(clubHead,sc(U,-1.3)),[F,U,out],1,0);
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
  // GLASSES AS THE REAL THINGS. Acetate frames (wayfarers, shades, cat-eyes) are thick and deep with rivets at the
  // hinges; wire frames (aviators, round, readers) are thin with nose pads; readers are half rims worn low; tinted
  // lenses darken toward the top; the sport, cyber and visor lenses are one shield wrapped round the face; ski goggles
  // are one wide lens in a foam frame on a strap, steampunk goggles brass cups with rings and rivets; the patch is
  // domed on a strap across the head; the Groucho is a nose, a moustache and brows on heavy black frames.
  const EW_METAL={aviators:1,goldshades:1,round:1,readers:1,rose:1,monocle:1,ghoulglow:1,star:1,diamond:1,heart:1};
  const EW_CLEAR={readers:1,threed:0};
  /* THE PUTT PUTT GLASSES, made by the real pairs they are (as), in their own colours (the art keys, read through
     the page's PXG_EW_PAL): the frame, the lens, a strap, a trim and the inside of a mask. The Phantom Mask is its
     own shape: a masquerade half mask over the brow and both eyes, swept up to points, a jewel between the brows. */
  const EW_PP={ pppixelshades:{as:'shades',frame:'%',lens:'Q'}, ppeyepatch:{as:'eyepatch',frame:'%',strap:'=',mark:'~'},
    ppaviatorgoggles:{as:'steampunk',frame:'%',lens:'R',strap:'*'}, ppsnowgoggles:{as:'goggles',frame:'%',lens:'R',strap:'~'},
    ppphantommask:{as:'mask',frame:'%',trim:'*',inner:'a',mark:'=',strap:'+'} };
  function ewColoursPP(d,EP){ const o={}; for(const k of ['frame','lens','strap','trim','inner','mark']) if(d[k]&&EP[d[k]]) o[k]='x:'+EP[d[k]];
    o.lens=o.lens||'x:#14161e'; o.frame=o.frame||'x:#26272d'; return o; }
  function eyewear3D(M,ew,map,P,cO){ const out=[], {hc,look:lk,hup,Lf,hr}=M, t=ew==='mask'?'mask':EW_SHAPE[ew]||'rect', col=cO||ewColours(map,P);
    const face=(v,h,off)=>add(hc,sc(lk,Math.sqrt(Math.max(0,hr*hr-v*v-h*h))+(off||0)),sc(Lf,h),sc(hup,v));
    const AXl=[lk,hup,Lf], metal=!!EW_METAL[ew], EV=ew==='readers'?-2.3:-1.5, EH=3.0, OFF=1.05, fw=metal?0.3:0.62, fd=metal?0.32:0.62;
    const temples=(fr,y0,r)=>{ for(const sd of [1,-1]){ let prev=add(face(y0,sd*(EH+ewSize(t)[1]*0.95),OFF*0.8));
        for(const a of [62,80,96]){ const ra=a*D2R, q=add(hc,sc(lk,Math.cos(ra)*hr*1.06),sc(Lf,sd*Math.sin(ra)*hr*1.06),sc(hup,y0-0.25*(a-62)/34));
          out.push(capsule(prev,q,r||(metal?0.26:0.42),fr,{gloss:2,noCast:1})); prev=q; } } };
    const strap=(m,v,w,tilt)=>{ const up=tilt?norm(add(hup,sc(Lf,tilt))):hup, side=norm(cross(up,lk)), fw2=norm(cross(side,up));
      out.push(ellipsoid(add(hc,sc(up,v)),[fw2,up,side],[hr*1.07,w,hr*1.07],m,{noCast:1,cut:l=>l[0]<0.8})); };
    // ONE SHIELD round the face: a shell at the face's radius, cut to a band across the eyes, notched over the nose
    const shield=(lens,frame,top,bot,span)=>{ const C=add(hc,sc(hup,EV)), R=hr+0.85;
      out.push(field(add(C,sc(lk,R*0.7)),R*1.2,p=>{ const q=sub(p,C), a=dot(q,lk), y=dot(q,hup), sd=dot(q,Lf), th=Math.atan2(sd,a), rr=Math.hypot(a,sd);
          const yb=bot+(Math.abs(th)<0.32?(0.32-Math.abs(th))*5.2:0);                                  // up over the nose
          return Math.max(Math.abs(rr-R)-0.32,Math.abs(th)-span,y-top,yb-y); },lens,{gloss:3,mf:(p,n)=>{ const y=dot(sub(p,C),hup);
          return y>top-0.45?[frame,0]:[lens,y>(top+bot)/2?-1:0]; }})); };
    if(t==='shield'){
      if(ew==='cyber'){ shield(col.lens,col.frame,1.0,-1.1,1.05); out.push(field(add(hc,sc(hup,EV),sc(lk,hr)),hr*1.2,p=>{ const q=sub(p,add(hc,sc(hup,EV))); return Math.max(Math.abs(Math.hypot(dot(q,lk),dot(q,Lf))-hr-1.22)-0.12,Math.abs(dot(q,hup)+0.1)-0.18,Math.abs(Math.atan2(dot(q,Lf),dot(q,lk)))-0.95); },'x:#ffe8f4',{gloss:3})); strap(col.frame,EV+0.2,0.7); }
      else if(ew==='visorband'){ shield(col.lens,col.frame,1.4,-1.3,1.12); strap(col.frame,EV+0.4,0.9); }
      else { shield(col.lens,col.frame,1.3,-1.4,0.98); temples(col.frame,EV+1.0,0.4); }
      return out; }
    if(t==='goggle'){
      if(ew==='goggles'){ // ski goggles: one wide curved lens in a foam frame, a strap round the head
        strap(col.strap||col.frame,EV+0.1,1.3); const C=add(hc,sc(hup,EV)), R=hr*1.04+1.3;
        out.push(field(add(C,sc(lk,R*0.7)),R*1.2,p=>{ const q=sub(p,C), a=dot(q,lk), y=dot(q,hup), sd=dot(q,Lf), th=Math.atan2(sd,a);
            return rbox(Math.hypot(a,sd)-R,Math.max(Math.abs(th)/1.05*5-3.4,Math.abs(y+(Math.abs(th)<0.3?(0.3-Math.abs(th))*2:0)*0.5)-2.3),0.7); },col.frame,{gloss:1,mf:(p,n)=>{ const q=sub(p,C), y=dot(q,hup), th=Math.atan2(dot(q,Lf),dot(q,lk));
            return Math.abs(y)<1.65&&Math.abs(th)<0.86&&dot(n,lk)>0.6?[col.lens,y>0.3?1:0]:null; }}));
        return out; }
      strap(col.strap||'x:#5a3a22',EV+0.1,1.05);   // steampunk: brass cups on a leather strap, a glass ring and rivets round each
      for(const sd of [1,-1]){ const c=face(EV,sd*EH,0.9); out.push(ellipsoid(c,AXl,[1.25,2.25,2.25],col.frame,{gloss:3,noCast:1,cut:l=>l[0]>-0.2}));
        out.push(ellipsoid(add(c,sc(lk,1.05)),AXl,[0.35,1.6,1.6],col.lens,{gloss:3,noCast:1}));
        out.push(field(add(c,sc(lk,1.0)),3,p=>{ const q=sub(p,add(c,sc(lk,1.0))); return Math.hypot(Math.hypot(dot(q,hup),dot(q,Lf))-1.75,dot(q,lk))-0.42; },col.frame,{gloss:3}));
        for(let k=0;k<8;k++){ const a=k*Math.PI/4; out.push(ellipsoid(add(c,sc(lk,1.1),sc(hup,2.05*Math.cos(a)),sc(Lf,2.05*Math.sin(a))),AXl,[0.3,0.3,0.3],'x:#6a4a1c',{gloss:2,noCast:1})); } }
      out.push(capsule(face(EV,1.6,1.4),face(EV,-1.6,1.4),0.55,col.frame,{gloss:2,noCast:1})); return out; }
    if(t==='patch'){ strap(col.strap||col.frame,EV+1.6,0.3,0.55); const c=face(EV,EH,0.35);
      if(col.mark) out.push(ellipsoid(face(EV+0.1,EH,1.45),AXl,[0.3,0.75,0.75],col.mark,{gloss:3,noCast:1}));   // a gold boss on the patch   // the patch, domed over the eye, its strap across the head
      out.push(field(c,3.5,p=>{ const q=sub(p,c), a=dot(q,lk), y=dot(q,hup), sd=dot(q,Lf); return Math.max(Math.hypot(a*2.4,y/1.05,sd/1.15)-2.1,-a-0.2); },col.frame,{gloss:1,mf:(p,n)=>{ const q=sub(p,c), y=dot(q,hup), sd=dot(q,Lf); return Math.hypot(y/1.05,sd/1.15)>1.7?[col.frame,1]:null; }}));
      return out; }
    if(t==='mask'){ strap(col.strap||col.frame,EV+0.5,0.3);
      const C=add(hc,sc(hup,EV)), R=hr+0.6, SP=1.25, edge=th=>{ const e=Math.abs(th)/SP; return {top:1.7+1.6*e*e*e, bot:-2.1+1.3*e*e+(Math.abs(th)<0.3?(0.3-Math.abs(th))*5:0)}; };
      const hole=(y,sd)=>Math.hypot((Math.abs(sd)-EH)/1.55,(y+0.05)/1.05);
      out.push(field(add(C,sc(lk,R*0.7)),R*1.25,p=>{ const q=sub(p,C), a=dot(q,lk), y=dot(q,hup), sd=dot(q,Lf), th=Math.atan2(sd,a), E=edge(th);
          return Math.max(Math.abs(Math.hypot(a,sd)-R)-0.3,Math.abs(th)-SP,y-E.top,E.bot-y,(1-hole(y,sd))*1.2); },col.frame,{gloss:2,mf:(p,n)=>{
          const q=sub(p,C), y=dot(q,hup), sd=dot(q,Lf), th=Math.atan2(sd,dot(q,lk)), E=edge(th);
          if(hole(y,sd)<1.3) return [col.inner||col.frame,1];                                        // the lit rim round each eye
          return y>E.top-0.45||y<E.bot+0.4||Math.abs(th)>SP-0.07?[col.trim||col.frame,0]:null; }}));      // its edge, trimmed
      for(const sd of [1,-1]) out.push(ellipsoid(face(EV,sd*EH,0.2),AXl,[0.25,1.0,1.45],'x:#14161e',{noCast:1}));   // the eyes behind it, in shadow
      if(col.mark) out.push(ellipsoid(face(EV+1.15,0,1.0),AXl,[0.45,0.6,0.5],col.mark,{gloss:3,noCast:1}));        // the jewel between the brows
      return out; }
    const [h,w]=ewSize(t), sides=t==='mono'?[1]:[1,-1], tinted=!EW_CLEAR[ew]&&ew!=='threed';
    for(const sd of sides){ const c=face(EV,sd*EH,OFF), K=1.5;
      const lensCut=l=>inShape(t,l[1]*K,l[2]*K*sd,sd);
      const lens=ew==='threed'?(sd>0?'x:#e0453a':'x:#3a8be0'):col.lens;
      out.push(ellipsoid(c,AXl,[0.26,h*K,w*K],lens,{gloss:3,noCast:1,cut:lensCut}));
      if(tinted) out.push(ellipsoid(add(c,sc(lk,0.04)),AXl,[0.27,h*K,w*K],lens,{gloss:3,noCast:1,dt:-1,cut:l=>lensCut(l)&&l[1]>0.15}));   // darker toward the top
      const g=fw, ho=h+g, wo=w+g, half=ew==='readers';                                    // the frame: the outline of the lens
      out.push(ellipsoid(add(c,sc(lk,0.05)),AXl,[fd,ho*K,wo*K],col.frame,{gloss:2,noCast:1,cut:l=>{ const yo=l[1]*K, xo=l[2]*K*sd;
        return (!half||yo<0.1)&&inShape(t,yo,xo,sd)&&!inShape(t,yo*ho/h,xo*wo/w,sd); }}));
      if(half) out.push(capsule(face(EV+h*0.05,sd*(EH-w),OFF+0.1),face(EV+h*0.05,sd*(EH+w),OFF+0.1),0.2,col.frame,{gloss:2,noCast:1}));   // the readers' top line
      if(t==='cat') out.push(field(face(EV+h*0.85,sd*(EH+w*0.95),OFF),2.4,p=>{ const q=sub(p,face(EV+h*0.85,sd*(EH+w*0.95),OFF)), y=dot(q,hup), x=dot(q,Lf)*sd, a=dot(q,lk);
          return Math.max(Math.abs(a)-fd*0.8,-y-0.2,y-0.9-x*0.7,x-1.6,-x-0.6); },col.frame,{gloss:2}));      // the swept up wing
      if(!metal&&t!=='cat') out.push(ellipsoid(face(EV+h*0.75,sd*(EH+w+0.2),OFF+0.35),AXl,[0.2,0.32,0.32],'x:#e8e4d8',{gloss:3,noCast:1}));   // a rivet at the hinge
      if(metal&&t!=='mono') out.push(ellipsoid(face(EV-h*0.35,sd*(EH-w+0.2),OFF+0.05),AXl,[0.35,0.42,0.3],'x:#f2f0ea',{gloss:3,noCast:1}));   // a nose pad
      out.push(ellipsoid(add(c,sc(lk,0.3),sc(hup,h*0.45),sc(Lf,sd*w*0.4)),AXl,[0.15,0.32,0.45],'x:#ffffff',{noCast:1}));   // a glint on the glass
    }
    if(t==='mono'){ const c=face(EV,EH,OFF); out.push(capsule(add(c,sc(hup,-h-0.3)),add(hc,sc(lk,hr*0.6),sc(Lf,hr*0.75),sc(hup,-hr*1.25)),0.22,col.frame,{gloss:2,noCast:1})); return out; }
    out.push(capsule(face(EV+0.35,EH-w-0.1,OFF+0.1),face(EV+0.35,-(EH-w-0.1),OFF+0.1),metal?0.24:0.42,col.frame,{gloss:2,noCast:1}));   // the bridge
    if(t==='aviator') out.push(capsule(face(EV+h*0.9,EH-w*0.4,OFF),face(EV+h*0.9,-(EH-w*0.4),OFF),0.24,col.frame,{gloss:2,noCast:1}));   // the brow bar
    temples(col.frame,EV+h*0.45);
    if(t==='groucho'){ const hair='x:#2a1d16', nose=face(EV-2.2,0,1.2);
      out.push(field(nose,4,p=>{ const q=sub(p,nose), a=dot(q,lk), y=dot(q,hup), sd=dot(q,Lf);
          return smin(Math.hypot(a,y+0.6,sd)-1.55,Math.hypot(a*1.6+0.6,y-1.4,sd*1.4)-0.8,1.2); },'x:#e8a08a',{gloss:2}));                    // the big nose
      const mc=face(EV-4.1,0,0.55);
      out.push(field(mc,4.5,p=>{ const q=sub(p,mc), a=dot(q,lk), y=dot(q,hup), sd=dot(q,Lf), u=Math.abs(sd);
          return Math.max(Math.hypot(a*1.5,(y+0.06*u*u)*1.25,u/2.9)-1,-a-0.7); },hair,{mf:p=>{ const sd=dot(sub(p,mc),Lf); return [hair,Math.sin(sd*5)>0.4?1:0]; }}));   // the moustache, bushy
      for(const sd of [1,-1]){ const bc=face(EV+h+0.85,sd*EH,0.6);
        out.push(field(bc,3,p=>{ const q=sub(p,bc), a=dot(q,lk), y=dot(q,hup), x=dot(q,Lf)*sd; return Math.hypot(a*1.6,(y-0.12*x)*1.4,x/2.0)-0.85; },hair,{})); } }   // the brows
    return out; }

  /* MODELLED HATS for the menu golfer: the shapes a hull spun from the flat art cannot hold. Colours come from the
     hat's own art, most used first. */
  function hatColours(map,pal,P){ const cnt={};
    for(const row of map) for(const ch of row){ if(ch==='.'||ch===' ') continue; cnt[ch]=(cnt[ch]||0)+1; }
    const out=[]; for(const ch of Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])){ const r=roleFor(ch,pal,P,false); if(r&&r.m&&r.m.startsWith('x:')&&out.indexOf(r.m)<0) out.push(r.m); }
    return out; }
  // ---------------------------------------------------------------------------------------------------
  // MODELLED HATS, for the menu golfer. Most hats are solids of revolution round the head's up axis: a crown (a
  // rounded cylinder or cone that can taper, bend, dent and pinch), a brim (a disc that can roll up at the sides,
  // droop, snap down at the front or turn up into a tricorn), a band, a ball. hatSolid() makes them ONE smooth
  // surface (field), each piece in its own material, with an optional texture (knit, straw, tweed, stars).
  // A piece reads L: a forward, y up, s to the side, r out from the axis and th round it, in units from the head's
  // centre, in the hat's own frame, which is tipped forward by tilt so a brim shows from the menu's level camera.
  const clamp01=v=>v<0?0:v>1?1:v;
  const rbox=(dx,dy,rr)=>{ const qx=dx+rr, qy=dy+rr; return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-rr; };
  const HP={
    // a crown from y0 to y1, radius r0 at the bottom to r1 at the top. o: rr rounding, sq (front to back squash),
    // bend (the top swept back), dent (a crease down the middle of the top), pinch (the front pinched), grow, clip
    crown:(y0,y1,r0,r1,m,o)=>{ o=o||{}; const rr=o.rr==null?0.6:o.rr, sl=Math.hypot(1,(r1-r0)/(y1-y0));
      return {m,dt:o.dt,k:o.k,tex:o.tex,b:[(o.a0||0)-(o.bend||0)/2,(y0+y1)/2,0,Math.hypot(Math.max(r0,r1)*(o.sq||1)+(o.bend||0)/2+(o.grow||0)+1,(y1-y0)/2+1)],d:L=>{ const t=clamp01((L.y-y0)/(y1-y0)); let a=L.a-(o.a0||0)+(o.bend||0)*t*t, s2=L.s;
        if(o.pinch&&a>0) s2=s2/(1-o.pinch*clamp01(a/r0)*t);
        const r=Math.hypot(a/(o.sq||1),s2), R=r0+(r1-r0)*t, top=y1-(o.dent?o.dent*Math.exp(-(L.s*L.s)/(r1*r1*0.18))*clamp01(1-Math.abs(L.a)/(r1*1.4)):0);
        let d=rbox((r-R)/sl,Math.max(y0-L.y,L.y-top),rr)-(o.grow||0);
        if(o.clip) d=Math.max(d,o.clip[0]-L.y,L.y-o.clip[1]); return d; }}; },
    // a brim at height yb out to radius R, t thick. o.r0 where it leaves the crown, o.curl(L,u) lifts it (u is 0 at
    // the crown and 1 at the edge), o.Rth(th) varies its radius round the hat
    brim:(yb,R,t,m,o)=>{ o=o||{}; return {m,dt:o.dt,k:o.k,tex:o.tex,b:[0,yb,0,R*1.45],d:L=>{ const Rr=R*(o.Rth?o.Rth(L.th):1), r0=o.r0||R*0.5, u=clamp01((L.r-r0)/(Rr-r0));
        const off=o.curl?o.curl(L,u):0; return rbox(L.r-Rr,Math.abs(L.y-yb-off)-t/2,t/2)/(o.lip||1); }}; },
    band:(yc,R,rt,m,o)=>({m,dt:o&&o.dt,b:[0,yc,0,R+rt],d:L=>Math.hypot(L.r-R,L.y-yc)-rt}),
    ball:(a,y,s,rad,m,o)=>({m,dt:o&&o.dt,k:o&&o.k,tex:o&&o.tex,b:[a,y,s,rad],d:L=>Math.hypot(L.a-a,L.y-y,L.s-s)-rad}),
    stick:(a0,y0,s0,a1,y1,s1,rad,m,o)=>({m,dt:o&&o.dt,k:o&&o.k,b:[(a0+a1)/2,(y0+y1)/2,(s0+s1)/2,Math.hypot(a1-a0,y1-y0,s1-s0)/2+rad],d:L=>sdCap([L.a,L.y,L.s],[a0,y0,s0],[a1,y1,s1],rad)}),
    egg:(a,y,s,ra,ry,rs,m,o)=>({m,dt:o&&o.dt,k:o&&o.k,tex:o&&o.tex,b:[a,y,s,Math.max(ra,ry,rs)],d:L=>{ const q=[(L.a-a)/ra,(L.y-y)/ry,(L.s-s)/rs], k0=Math.hypot(...q), k1=Math.hypot(q[0]/ra,q[1]/ry,q[2]/rs);
      let d=k1<1e-6?-Math.min(ra,ry,rs):k0*(k0-1)/k1; if(o&&o.cut) d=Math.max(d,o.cut(L)); return d; }}) };
  // a box (half sizes ha, hy, hs), turned by rot round the up axis
  HP.box=(a,y,s,ha,hy,hs,rr,m,o)=>{ o=o||{}; const c=Math.cos(o.rot||0), sn=Math.sin(o.rot||0);
    return {m,dt:o.dt,k:o.k,tex:o.tex,b:[a,y,s,Math.hypot(ha,hy,hs)],d:L=>{ const x=(L.a-a)*c+(L.s-s)*sn, z=-(L.a-a)*sn+(L.s-s)*c, qx=Math.abs(x)-ha+rr, qy=Math.abs(L.y-y)-hy+rr, qz=Math.abs(z)-hs+rr;
      return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0)-rr; }}; };
  // textures: [material or null, dt]
  const TEX={
    knit:(m)=>L=>{ const v=Math.sin(L.th*26); return [m,v>0.35?1:v<-0.35?-1:0]; },
    straw:(m)=>L=>{ const w=(Math.floor(L.th*22/Math.PI)+Math.floor(L.y*0.9)+Math.floor(L.r*0.9))%2; return [m,w?1:-1]; },
    tweed:(m)=>L=>{ const v=Math.sin(L.th*34+(Math.sin(L.y*1.6+L.r*1.6)>0?1:-1)*(L.y+L.r)*2.2); return [m,v>0.8?1:v<-0.8?-1:0]; },
    stars:(m,st)=>L=>{ const u=Math.sin(L.th*9+L.y*0.9)*Math.sin(L.y*1.7-L.th*3); return u>0.9?[st,1]:[m,0]; } };
  function hatSolid(M,pieces,o){ o=o||{}; const {hc,look,hup,Lf,hr}=M, ct=Math.cos(o.tilt||0), st=Math.sin(o.tilt||0);
    const loc=p=>{ const q=sub(p,hc), a0=dot(q,look), y0=dot(q,hup), s=dot(q,Lf), a=a0*ct-y0*st, y=y0*ct+a0*st; return {a,y,s,r:Math.hypot(a,s),th:Math.atan2(s,a)}; };
    const all=L=>pieces.map(pc=>pc.d(L));
    // a piece whose bounding ball is farther than the surface found so far cannot change the answer, so it is skipped
    const f=p=>{ const L=loc(p); let d=pieces[0].d(L);
      for(let i=1;i<pieces.length;i++){ const pc=pieces[i], b=pc.b, k=pc.k||0;
        if(b&&Math.hypot(L.a-b[0],L.y-b[1],L.s-b[2])-b[3]>d+k) continue;
        const di=pc.d(L); d=k?smin(d,di,k):Math.min(d,di); }
      return d; };
    return field(add(hc,sc(hup,o.cy==null?hr*1.0:o.cy)),o.R||hr*2.4,f,pieces[0].m,{gloss:o.gloss==null?1:o.gloss,bias:o.bias||0,mf:p=>{ const L=loc(p), ds=all(L); let b=0;
      for(let i=1;i<ds.length;i++) if(ds[i]<ds[b]) b=i; const pc=pieces[b]; if(pc.tex){ const t=pc.tex(L); return [t[0]||pc.m,t[1]||0]; } return [pc.m,pc.dt||0]; }}); }
  // how wide the hair under a closed hat is, so the hat goes over it
  const hairR=M=>M.hr*(M.hairStyle==='afro'?1.17:1.07);
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

  // THE HATS AS THE REAL THINGS. Each is modelled from the hat itself (its crown, brim, band and trim), never
  // from the old flat art; only the colours are the item's own (c, its art's colours, most used first).
  const X=h=>'x:'+h, cx=(c,i,d)=>c[i]||X(d), HAT_OVER_HAIR={santa:1,witch:1,wizard:1,elf:1,beret:1};
  Object.assign(HAT_MODEL,{
    // a western hat: an oval crown with a deep crease down the middle and pinched at the front, a band, and a
    // wide brim rolled up hard at the sides and dipping front and back
    cowboy(M,c){ const H=M.hr, rh=hairR(M), felt=cx(c,0,'#a86e38'), band=cx(c,1,'#6e4420');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.22,rh,H*0.86,felt,{rr:1.4,sq:1.16,dent:H*0.34,pinch:0.32}),
        HP.crown(H*0.28,H*1.22,rh,H*0.86,band,{rr:1.4,sq:1.16,grow:0.25,clip:[H*0.3,H*0.5]}),
        HP.brim(H*0.3,H*1.95,1.0,felt,{r0:rh,lip:1.8,curl:(L,u)=>{ const sn=L.s/(L.r||1); return H*0.62*u*u*sn*sn-H*0.12*u*(1-sn*sn); }})],
        {tilt:0.12,R:H*2.5}) ]; },
    // a sombrero: a tall peaked crown and a huge brim, flat out to a lip rolled up at its edge, braided trim
    sombrero(M,c){ const H=M.hr, rh=hairR(M), straw=cx(c,1,'#a86e38'), dk=cx(c,0,'#6e4420'), gold=cx(c,3,'#c9a52a');
      return [hatSolid(M,[
        HP.crown(H*0.3,H*2.05,rh,H*0.42,straw,{rr:2.2,tex:TEX.straw(straw)}),
        HP.crown(H*0.3,H*2.05,rh,H*0.42,gold,{rr:2.2,grow:0.3,clip:[H*0.32,H*0.62]}),
        HP.brim(H*0.32,H*2.85,1.0,straw,{r0:rh,tex:TEX.straw(straw),curl:(L,u)=>H*0.55*Math.pow(clamp01((u-0.62)/0.38),2)}),
        HP.band(H*0.32+H*0.55+0.4,H*2.85-0.6,0.7,dk)],
        {tilt:0.1,R:H*3.2,cy:H*0.9}) ]; },
    // a bucket hat: a short soft crown and a brim sloping down all round, stitched in rings
    bucket(M,c){ const H=M.hr, rh=hairR(M);
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.18,rh*1.02,H*0.9,'hat',{rr:2.0}),
        HP.brim(H*0.32,H*1.6,0.9,'hat',{r0:rh,curl:(L,u)=>-H*0.5*u,tex:L=>['hat',Math.sin(L.r*2.4)>0.75?-1:0]})],
        {tilt:0.08,R:H*2.0}) ]; },
    // a flat cap: a crown sloping forward over a short stiff peak, snug at the back
    flat(M,c){ const H=M.hr, rh=hairR(M);
      return [hatSolid(M,[
        HP.crown(H*0.3,H*1.16,rh*1.04,rh*1.0,'hat',{rr:2.4,sq:1.24,a0:H*0.2}),
        HP.brim(H*0.4,H*1.4,0.8,'hat',{r0:H*0.9,Rth:th=>Math.cos(th)>0.45?1:0.5,curl:(L,u)=>-H*0.12*u})],
        {tilt:0.22,R:H*2.0}) ]; },
    // a tweed newsboy: a full eight panel crown with a button, a short peak, in herringbone
    tweed(M,c){ const H=M.hr, rh=hairR(M), t1=cx(c,1,'#7a6a48'), t0=cx(c,0,'#5c4f34');
      return [hatSolid(M,[
        HP.crown(H*0.3,H*1.18,rh*1.04,rh*1.16,t1,{rr:3.2,sq:1.2,a0:H*0.16,tex:TEX.tweed(t1)}),
        HP.ball(H*0.16,H*1.21,0,0.9,t0),
        HP.brim(H*0.4,H*1.4,0.8,t0,{r0:H*0.9,Rth:th=>Math.cos(th)>0.45?1:0.5,curl:(L,u)=>-H*0.12*u,tex:TEX.tweed(t0)})],
        {tilt:0.22,R:H*2.0}) ]; },
    // a fedora: a tapered crown with a centre dent and front pinches, a band, a brim snapped down in front and up behind
    fedora(M,c){ const H=M.hr, rh=hairR(M), felt=cx(c,0,'#f2ecd6'), band=cx(c,1,'#40424a');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.2,rh,H*0.88,felt,{rr:1.3,sq:1.12,dent:H*0.3,pinch:0.38}),
        HP.crown(H*0.28,H*1.2,rh,H*0.88,band,{rr:1.3,sq:1.12,grow:0.28,clip:[H*0.3,H*0.56]}),
        HP.brim(H*0.3,H*1.58,0.9,felt,{r0:rh,curl:(L,u)=>{ const cs=L.a/(L.r||1); return u*(cs>0?-H*0.26*cs:H*0.3*-cs)+H*0.08*u*u; }})],
        {tilt:0.1,R:H*2.0}) ]; },
    // a top hat: a tall cylinder flaring a touch at the top, a band, a brim rolled up at the sides
    tophat(M,c){ const H=M.hr, rh=hairR(M), silk=cx(c,0,'#1a1a1f'), band=cx(c,1,'#30303a');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*2.0,rh,rh*1.07,silk,{rr:0.5}),
        HP.crown(H*0.28,H*2.0,rh,rh*1.07,band,{rr:0.5,grow:0.25,clip:[H*0.3,H*0.62]}),
        HP.brim(H*0.3,H*1.48,0.8,silk,{r0:rh,curl:(L,u)=>{ const sn=L.s/(L.r||1); return H*0.3*u*u*sn*sn-H*0.05*u; }})],
        {tilt:0.08,R:H*2.4,cy:H*1.1,gloss:2}) ]; },
    // a straw boater: a flat topped cylinder, a ribbon, a flat brim, all woven
    straw(M,c){ const H=M.hr, rh=hairR(M), st=cx(c,1,'#f2e3b0'), rib=cx(c,2,'#2a4d8f');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*0.98,rh,rh*0.98,st,{rr:0.4,tex:TEX.straw(st)}),
        HP.crown(H*0.28,H*0.98,rh,rh*0.98,rib,{rr:0.4,grow:0.25,clip:[H*0.3,H*0.58]}),
        HP.brim(H*0.3,H*1.65,0.75,st,{r0:rh,tex:TEX.straw(st)})],
        {tilt:0.12,R:H*2.0}) ]; },
    // a pilgrim's capotain: a tall tapered flat topped crown, a band with a square gold buckle, a flat brim
    pilgrim(M,c){ const H=M.hr, rh=hairR(M), bk=cx(c,0,'#1f1c24'), band=cx(c,1,'#3a3642'), gold=cx(c,3,'#d8b24a');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.7,rh,H*0.8,bk,{rr:0.6}),
        HP.crown(H*0.28,H*1.7,rh,H*0.8,band,{rr:0.6,grow:0.25,clip:[H*0.32,H*0.66]}),
        HP.box(rh+0.1,H*0.49,0,0.45,H*0.2,H*0.2,0.15,gold,{}),
        HP.box(rh+0.35,H*0.49,0,0.3,H*0.1,H*0.1,0.1,band,{}),
        HP.brim(H*0.3,H*1.6,0.8,bk,{r0:rh,curl:(L,u)=>-H*0.06*u})],
        {tilt:0.1,R:H*2.3,cy:H*1.0}) ]; },
    // a pith helmet: a long dome with a vent on top, a band, and a brim that sweeps down all round, longer front and back
    safari(M,c){ const H=M.hr, rh=hairR(M), cl=cx(c,0,'#f2ecd6'), band=cx(c,1,'#237038');
      return [hatSolid(M,[
        HP.egg(0,H*0.3,0,rh*1.18,H*0.95,rh*1.08,cl,{cut:L=>H*0.26-L.y}),
        HP.band(H*0.4,rh*1.12,0.75,band),
        HP.ball(0,H*1.25,0,1.0,cl),
        HP.brim(H*0.3,H*1.5,0.8,cl,{r0:rh,Rth:th=>1+0.16*Math.cos(th)**2,curl:(L,u)=>-H*0.32*u,k:1.0})],
        {tilt:0.08,R:H*2.1}) ]; },
    // a witch's hat: a tall cone bent back at the tip, a band with a buckle, and a wide brim with a wavy droop
    witch(M,c){ const H=M.hr, rh=hairR(M), felt=cx(c,0,'#4a3568'), band=cx(c,1,'#1a1a1f'), gold=cx(c,3,'#f2d24a');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*2.55,rh,H*0.08,felt,{rr:0.5,bend:H*0.9}),
        HP.crown(H*0.28,H*2.55,rh,H*0.08,band,{rr:0.5,bend:H*0.9,grow:0.28,clip:[H*0.3,H*0.62]}),
        HP.box(rh*0.94+0.2,H*0.46,0,0.4,H*0.15,H*0.17,0.12,gold,{}),
        HP.brim(H*0.3,H*2.05,0.8,felt,{r0:rh,curl:(L,u)=>-H*0.24*u*u*(0.6+0.4*Math.sin(3*L.th+0.5))})],
        {tilt:0.1,R:H*3.0,cy:H*1.3}) ]; },
    // a wizard's hat: a tall cone with a soft bend, scattered with stars, over a drooping brim
    wizard(M,c){ const H=M.hr, rh=hairR(M), felt=cx(c,0,'#5a2f8f'), band=cx(c,1,'#3f1f68'), star=cx(c,2,'#fff7cc');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*2.35,rh,H*0.12,felt,{rr:0.5,bend:H*0.55,tex:TEX.stars(felt,star)}),
        HP.crown(H*0.28,H*2.35,rh,H*0.12,band,{rr:0.5,bend:H*0.55,grow:0.25,clip:[H*0.3,H*0.55]}),
        HP.brim(H*0.3,H*1.8,0.8,felt,{r0:rh,curl:(L,u)=>-H*0.2*u*u,tex:TEX.stars(felt,star)})],
        {tilt:0.1,R:H*2.8,cy:H*1.2}) ]; },
    // a party hat: a striped cone on top of the head with a pompom
    party(M,c){ const H=M.hr, y=cx(c,0,'#f2c53d'), w=cx(c,1,'#e8e8e8'), b=cx(c,2,'#3a9bd9'), pk=cx(c,3,'#ec5aa8');
      return [hatSolid(M,[
        HP.crown(H*0.6,H*2.3,H*0.8,H*0.05,y,{rr:0.3,tex:L=>{ const v=((Math.floor((L.th/Math.PI*3+L.y*0.35)%3)+3)%3); return [[y,b,pk][v],0]; }}),
        HP.ball(0,H*2.33,0,1.8,w,{k:0.5})],
        {tilt:-0.15,R:H*2.0,cy:H*1.4}) ]; },
    // an elf's hat: a soft cone flopping back to a bell, over a folded cuff cut in points
    elf(M,c){ const H=M.hr, rh=hairR(M), gr=cx(c,0,'#39b56b'), cuff=cx(c,2,'#f2ecd6');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.95,rh,H*0.12,gr,{rr:0.6,bend:H*1.05}),
        HP.crown(H*0.28,H*1.95,rh,H*0.12,cuff,{rr:0.6,bend:H*1.05,grow:0.55,clip:[H*0.26,H*0.5]}),
        HP.ball(-H*1.05,H*1.92,0,1.5,'x:#f2d24a')],
        {tilt:0.08,R:H*2.6,cy:H*1.1,gloss:1}) ]; },
    // Santa's hat: a red cone flopping back and down, a thick fur cuff and a fur pompom
    santa(M,c){ const H=M.hr, rh=hairR(M), red=cx(c,1,'#d23a34'), fur=cx(c,0,'#f2ecd6'), fuzz=L=>[fur,Math.sin(L.th*31+L.y*3)>0.6?-1:0];
      return [hatSolid(M,[
        HP.crown(H*0.3,H*1.7,rh,H*0.16,red,{rr:0.9,bend:H*1.35}),
        HP.band(H*0.38,rh+0.5,H*0.2,fur,{}),
        HP.ball(-H*1.35,H*1.62,0,H*0.27,fur,{k:0.6})],
        {tilt:0.08,R:H*2.6,cy:H*1.0,gloss:0}) ]; },
    // a knit beanie: a ribbed dome, a folded cuff, a pompom
    beanie(M,c){ const H=M.hr, rh=hairR(M), knit=cx(c,0,'#d23a34'), pom=cx(c,1,'#f2ecd6'), cuff=cx(c,2,'#c23b34');
      return [hatSolid(M,[
        HP.crown(H*0.25,H*1.22,rh,H*0.5,knit,{rr:2.6,tex:TEX.knit(knit)}),
        HP.crown(H*0.25,H*1.22,rh,H*0.5,cuff,{rr:2.6,grow:0.55,clip:[H*0.22,H*0.58],tex:TEX.knit(cuff)}),
        HP.ball(0,H*1.28,0,H*0.3,pom,{k:0.8,tex:L=>[pom,Math.sin(L.th*19+L.y*4)>0.5?-1:0]})],
        {tilt:0.05,R:H*1.8}) ]; },
    // the harvest beanie: a knit beanie ribbed into pumpkin lobes, a cuff, and a stem and leaf on top
    harvestbeanie(M,c){ const H=M.hr, rh=hairR(M), knit=cx(c,0,'#c8641e'), cuff=cx(c,5,'#b0561a'), stem=cx(c,4,'#7a4a22'), leaf=cx(c,6,'#4f7a2a');
      const lobes=L=>{ const v=Math.cos(L.th*8); return [knit,v>0.75?1:v<-0.6?-1:0]; };
      return [hatSolid(M,[
        HP.crown(H*0.25,H*1.14,rh*1.03,H*0.72,knit,{rr:2.8,tex:lobes}),
        HP.crown(H*0.25,H*1.14,rh*1.03,H*0.72,cuff,{rr:2.8,grow:0.55,clip:[H*0.22,H*0.56],tex:TEX.knit(cuff)}),
        HP.stick(0,H*1.05,0,-0.6,H*1.5,0.3,0.75,stem,{k:0.5}),
        HP.egg(-0.4,H*1.22,H*0.32,H*0.32,0.35,H*0.18,leaf,{})],
        {tilt:0.05,R:H*1.9}) ]; },
    // a beret: a soft flat disc worn tilted to one side, a band and a stub on top
    beret(M,c){ const H=M.hr, rh=hairR(M), wool=cx(c,0,'#d23a34'), dk=cx(c,1,'#1a1a1f');
      return [hatSolid(M,[
        HP.egg(-H*0.05,H*0.78,H*0.2,H*1.28,H*0.32,H*1.3,wool,{}),
        HP.band(H*0.48,rh*0.98,0.75,wool,{k:1.6}),
        HP.stick(0,H*1.05,H*0.2,0,H*1.25,H*0.2,0.45,dk,{})],
        {tilt:0.12,R:H*1.9}) ]; },
    // a football helmet: a hard shell over the whole head, open at the face, a stripe down the middle,
    // ear holes, and a cage of bars across the face
    football(M,c){ const H=M.hr, shell=cx(c,0,'#3a9bd9'), bar=cx(c,2,'#b0b5bd'), stripe=cx(c,3,'#e8e8e8');
      const face=L=>Math.max(L.a-H*0.4,Math.min(L.y-H*0.2,H*0.82-Math.abs(L.s)))<0?0:1;
      const shellP={m:shell,d:L=>{ const q=[L.a/(H*1.2),(L.y-H*0.1)/(H*1.22),L.s/(H*1.16)], k0=Math.hypot(...q), k1=Math.hypot(q[0]/(H*1.2),q[1]/(H*1.22),q[2]/(H*1.16));
          let d=Math.abs(k0*(k0-1)/k1)-0.7;
          d=Math.max(d,-L.y-H*0.7);                                                             // the bottom edge
          d=Math.max(d,-(Math.max(H*0.25-L.a,L.y-H*0.18,Math.abs(L.s)-H*0.78)));               // the face opening
          return Math.max(d,-(Math.hypot(Math.abs(L.s)-H*1.1,L.y+H*0.15,L.a+H*0.05)-H*0.18)); },  // the ear holes
        tex:L=>[Math.abs(L.s)<H*0.12&&L.y>H*0.05?stripe:shell,0]};
      const ps=[shellP];
      for(const yb of [-H*0.18,-H*0.48]) for(const sd of [1,-1]) ps.push(HP.stick(H*0.95,yb,0,H*0.62,yb+H*0.08,sd*H*0.85,0.42,bar,{}));
      ps.push(HP.stick(H*1.0,-H*0.15,0,H*0.98,-H*0.6,0,0.42,bar,{}));
      return [hatSolid(M,ps,{tilt:0,R:H*1.9,cy:H*0.1,gloss:3})]; },
    // a viking helmet: an iron dome with a gold brow band and a nose guard, and two horns curving up and out
    viking(M,c){ const H=M.hr, rh=hairR(M), iron=cx(c,0,'#b0b5bd'), horn=cx(c,1,'#f2ecd6'), gold=cx(c,2,'#c9a52a');
      const ps=[HP.egg(0,H*0.22,0,rh*1.06,H*1.02,rh*1.06,iron,{cut:L=>H*0.2-L.y}),
        HP.band(H*0.28,rh*1.07,0.9,gold),
        HP.box(rh*1.05,H*0.0,0,0.45,H*0.3,0.55,0.25,iron,{})];
      for(const sd of [1,-1]){ let prev=[0,H*0.55,sd*rh*0.95];
        for(let i=1;i<=6;i++){ const t=i/6, q=[-H*0.1*t,H*0.5+H*1.15*t*t+H*0.3*t,sd*(rh*0.95+H*0.95*Math.sin(t*1.7))];
          ps.push(HP.stick(...prev,...q,1.9*(1-t)+0.35,horn,{k:0.4})); prev=q; } }
      return [hatSolid(M,ps,{tilt:0.05,R:H*2.4,cy:H*0.9,gloss:2})]; },
    // a pirate's tricorn: a round crown with the brim turned up into three walls, gold trimmed, a skull at the front
    pirate(M,c){ const H=M.hr, rh=hairR(M), felt=cx(c,0,'#30303a'), gold=cx(c,2,'#f2d24a'), bone=cx(c,3,'#e8e8e8');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.02,rh,H*0.78,felt,{rr:2.2}),
        HP.brim(H*0.3,H*1.62,0.8,felt,{r0:rh*0.98,Rth:th=>0.8+0.2*Math.cos(3*th),curl:(L,u)=>H*0.55*Math.pow(u,1.6),lip:2.2,tex:L=>[L.y>H*0.85-0.7&&L.r>rh*1.05?gold:felt,0]}),
        HP.egg(H*1.35,H*0.72,0,0.5,H*0.16,H*0.14,bone,{})],
        {tilt:0.08,R:H*2.2}) ]; },
    // a graduate's mortarboard: a skull cap, a square board on top, a button and a tassel hanging over the side
    grad(M,c){ const H=M.hr, rh=hairR(M), bk=cx(c,1,'#1a1a1f'), cap=cx(c,0,'#30303a'), gold=cx(c,2,'#f2d24a');
      return [hatSolid(M,[
        HP.crown(H*0.24,H*0.9,rh,H*0.92,cap,{rr:0.8}),
        HP.box(0,H*0.98,0,H*1.25,0.4,H*1.25,0.2,bk,{rot:Math.PI/4}),
        HP.ball(0,H*1.06,0,0.75,gold),
        HP.stick(0,H*1.06,0,0,H*1.04,H*1.2,0.3,gold),
        HP.stick(0,H*1.04,H*1.2,0.2,H*0.4,H*1.32,0.55,gold,{k:0.3})],
        {tilt:0.22,R:H*2.1}) ]; },
    // a propeller beanie: a four panel dome with a short peak, a stalk and a two bladed propeller
    propeller(M,c){ const H=M.hr, rh=hairR(M), cols=[cx(c,0,'#e34b4b'),cx(c,1,'#39b56b'),cx(c,2,'#3a9bd9'),cx(c,4,'#f2c53d')], dk=cx(c,5,'#30303a');
      return [hatSolid(M,[
        HP.crown(H*0.25,H*1.15,rh,H*0.5,cols[0],{rr:2.6,tex:L=>[cols[((Math.floor((L.th+Math.PI)/(Math.PI/2))%4)+4)%4],0]}),
        HP.brim(H*0.28,H*1.45,0.75,cols[2],{r0:H*0.9,Rth:th=>Math.cos(th)>0.5?1:0.5,curl:(L,u)=>-H*0.1*u}),
        HP.stick(0,H*1.1,0,0,H*1.42,0,0.45,dk),
        HP.egg(0,H*1.45,H*0.55,0.6,0.9,H*0.5,cols[3],{}),
        HP.egg(0,H*1.45,-H*0.55,0.6,0.9,H*0.5,cols[0],{})],
        {tilt:0.05,R:H*1.9}) ]; },
    // headphones: a padded band over the top and two round ear cups with cushions
    headphones(M,c){ const H=M.hr, band=cx(c,0,'#40424a'), cup=cx(c,1,'#2e78be'), pad=cx(c,3,'#1a1a1f'), R=H*1.13;
      return [hatSolid(M,[
        {m:band,d:L=>Math.max(Math.hypot(Math.hypot(L.s,L.y+H*0.05)-R,L.a)-0.75,-L.y-H*0.05)},
        {m:cup,d:L=>rbox(Math.hypot(L.a,L.y+H*0.08)-H*0.5,Math.abs(Math.abs(L.s)-R-0.3)-0.9,0.5)},
        {m:pad,d:L=>rbox(Math.hypot(L.a,L.y+H*0.08)-H*0.42,Math.abs(Math.abs(L.s)-R+0.9)-0.5,0.4)}],
        {tilt:0,R:H*1.7,cy:H*0.3,gloss:2}) ]; },
    // a floppy sun hat: a low crown with a ribbon and a wide brim drooping in soft waves
    floppy(M,c){ const H=M.hr, rh=hairR(M), st=cx(c,1,'#f2c53d'), rib=cx(c,2,'#ec5aa8');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.0,rh,rh*0.95,st,{rr:1.6,tex:TEX.straw(st)}),
        HP.crown(H*0.28,H*1.0,rh,rh*0.95,rib,{rr:1.6,grow:0.25,clip:[H*0.3,H*0.56]}),
        HP.egg(-H*0.3,H*0.44,-rh-0.4,H*0.22,H*0.16,0.5,rib,{}),
        HP.brim(H*0.32,H*2.25,0.8,st,{r0:rh,tex:TEX.straw(st),curl:(L,u)=>-H*0.38*u*u*(0.65+0.35*Math.cos(4*L.th))})],
        {tilt:0.12,R:H*2.6}) ]; },
    // a scarecrow's hat: a battered straw hat, its crown crushed, its brim ragged and drooping, a patch sewn on
    scarecrow(M,c){ const H=M.hr, rh=hairR(M), st=cx(c,0,'#d9b15a'), band=cx(c,3,'#5a3a1e'), patch=cx(c,5,'#7a3a8a');
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.05,rh,H*0.84,st,{rr:1.2,dent:H*0.18,tex:TEX.straw(st)}),
        HP.crown(H*0.28,H*1.05,rh,H*0.84,band,{rr:1.2,grow:0.25,clip:[H*0.3,H*0.5]}),
        HP.box(rh*0.92+0.2,H*0.78,-H*0.3,0.4,H*0.18,H*0.2,0.1,patch,{rot:0.3}),
        HP.brim(H*0.3,H*1.95,0.8,st,{r0:rh,Rth:th=>1+0.07*Math.sin(9*th)+0.04*Math.sin(23*th),tex:TEX.straw(st),curl:(L,u)=>-H*0.32*u*u*(0.5+0.5*Math.sin(5*L.th+1))})],
        {tilt:0.14,R:H*2.3}) ]; },
    // a knight's close helm, in polished steel (the owner's reference, 2026-10-16: a burgonet, a knight in shining
    // armour): a rounded skull with a tall crest from brow to nape, a sight slit, a pointed visor jutting over the
    // face with a row of slots under its edge and pierced crosses down its sides, a chin bevor, a pivot rivet at each
    // side, and a gorget flaring onto the shoulders in overlapping plates. It hides all the hair (M.noHair).
    knight(M,c){ const H=M.hr, steel=X('#c9ced6'), dk=X('#16181d'), lame=X('#9aa1ab'), vis=X('#b4bac4');
      const vTop=-H*0.08, vBot=-H*0.78;
      const skullTex=L=>{ if(L.a>H*0.35&&Math.abs(L.y-(vTop+H*0.07))<H*0.045) return [dk,0];   // the sight slit
        return [steel,0]; };
      const visorTex=L=>{ if(L.y>vTop-H*0.13&&L.y<vTop-H*0.05&&Math.sin(L.s*2.6)>0.15) return [dk,0];   // the slots under the edge
        const u=(L.a/(H*0.3)), v=(L.y-vBot)/(H*0.26), fu=u-Math.floor(u), fv=v-Math.floor(v);
        if(Math.abs(L.s)>H*0.5&&L.y<vTop-H*0.2&&L.y>vBot+H*0.1&&((Math.abs(fu-0.5)<0.11&&Math.abs(fv-0.5)<0.36)||(Math.abs(fv-0.5)<0.11&&Math.abs(fu-0.5)<0.34))) return [dk,0];   // the crosses
        if(Math.abs(L.s)<H*0.04) return [vis,1];                                              // the keel of the visor
        return [vis,0]; };
      const prow=L=>Math.abs(L.s)-(H*1.62-L.a)*0.9;                                            // the visor comes to a point
      const ps=[
        HP.egg(-H*0.05,H*0.1,0,H*1.16,H*1.14,H*1.19,steel,{cut:L=>-L.y-H*0.95,tex:skullTex}),                  // the skull
        HP.egg(-H*0.2,H*0.3,0,H*1.2,H*1.24,H*0.17,steel,{k:0.6,cut:L=>H*0.6-L.y}),                         // the crest
        {m:vis,k:0.5,b:[H*0.6,(vTop+vBot)/2,0,H*1.3],tex:visorTex,d:L=>{ const q=[(L.a-H*0.28)/(H*1.3),(L.y-(vTop+vBot)/2)/((vTop-vBot)/2),L.s/(H*1.08)], k0=Math.hypot(...q), k1=Math.hypot(q[0]/(H*1.3),q[1]/((vTop-vBot)/2),q[2]/(H*1.08));
          return Math.max(k0*(k0-1)/k1,prow(L)*0.7); }},                                                       // the visor
        HP.egg(H*0.12,-H*0.92,0,H*1.02,H*0.34,H*1.0,steel,{k:0.6}),                                           // the bevor at the chin
        HP.crown(-H*1.42,-H*0.88,H*1.24,H*1.04,steel,{rr:0.5,k:0.6,tex:L=>[steel,Math.sin((L.y+H*1.42)/(H*0.54)*Math.PI*3)>0.8?-1:0]}),   // the gorget, in lames
        HP.band(-H*1.4,H*1.24,0.55,lame)];
      for(const sd of [1,-1]) ps.push(HP.ball(-H*0.12,-H*0.22,sd*H*1.19,1.0,lame));                        // the visor pivots
      return [hatSolid(M,ps,{tilt:0,R:H*2.2,cy:H*0.0,gloss:3,bias:.08})]; },
    // caps: a flat brim snapback, a cap worn backwards, and the No. 1 cap with its gold numeral
    flatbrim(M,c){ return capParts(M,hairR(M)/M.hr,{crown:cx(c,1,'#2e78be'),brim:cx(c,0,'#40424a'),btn:cx(c,0,'#40424a'),flat:true,mark0:false}); },
    backwards(M,c){ return capParts(M,hairR(M)/M.hr,{crown:cx(c,0,'#2e78be'),brim:cx(c,1,'#1a1a1f'),btn:cx(c,1,'#1a1a1f'),dir:-1,mark0:false}); },
    no1cap(M,c){ const gold=cx(c,2,'#d9ae32');
      return capParts(M,hairR(M)/M.hr,{crown:cx(c,0,'#1f1d26'),brim:cx(c,1,'#2c2a34'),btn:gold,badge:(pc,AX)=>{ const [f,u,s]=AX, o=add(pc,sc(f,0.5));
        return [capsule(add(o,sc(u,1.9)),add(o,sc(u,-1.9)),0.5,gold,{gloss:2,noCast:1}), capsule(add(o,sc(u,1.9)),add(o,sc(u,1.1),sc(s,-1.0)),0.45,gold,{gloss:2,noCast:1}),
          capsule(add(o,sc(u,-1.9),sc(s,-0.9)),add(o,sc(u,-1.9),sc(s,0.9)),0.45,gold,{gloss:2,noCast:1})]; }}); } });
  HAT_MODEL.pptricorn=(M,c,P)=>tricorn(M,c,P);
  /* THE PRO SHOP LINE'S HATS. Rope cap: a structured cap with a braided rope across the peak. Trucker: a tall foam front
     panel with a patch, mesh round the sides and back. Tam o' Shanter: a wide, flat knitted bonnet in tartan on a ribbed
     band, the toorie (a pompom) on top. Panama: a pinched, dented crown in woven straw, a black band, a brim snapped down
     in front. Colours are each hat's own palette. */
  Object.assign(HAT_MODEL,{
    ropecap(M,c,P){ const X2=h=>'x:'+h, cw=hairR(M)/M.hr, out=capParts(M,cw,{crown:X2(P.A),brim:X2(P.C),btn:X2(P.N),mark0:false});
      const {hc,look,hup,Lf,hr}=M;
      for(let i=-9;i<=9;i++){ const a=i/9*0.85, d=add(sc(look,Math.cos(a)),sc(Lf,Math.sin(a))), r=hr*cw+0.42;   // the braid across the peak
        out.push(ellipsoid(add(hc,sc(d,r),sc(hup,hr*0.27)),[d,hup,norm(cross(hup,d))],[0.55,0.55,0.8],X2(i&1?P.R:P.r),{gloss:1,noCast:1})); }
      return out; },
    trucker(M,c,P){ const X2=h=>'x:'+h, cw=hairR(M)/M.hr, out=capParts(M,cw,{crown:X2(P.A),brim:X2(P.C),btn:X2(P.N),patch:X2(P.P),mark:X2(P.A)});
      const {hc,look,hup,Lf,hr}=M, cc=add(hc,sc(hup,hr*0.12)), CR=[hr*cw*1.004,hr*1.12*1.004,hr*cw*1.004], AXc=[look,hup,Lf];
      out.push(over(cc,AXc,CR,X2(P.M),l=>l[0]<0.42&&l[1]>0.07-0.12*(1-l[0]),{noCast:1}));                         // the mesh panels
      out.push(over(cc,AXc,CR.map(v=>v*1.002),X2(P.m),l=>l[0]<0.42&&l[1]>0.07-0.12*(1-l[0])&&Math.sin(l[1]*70)*Math.sin(Math.atan2(l[2],l[0])*48)>0.35,{noCast:1}));   // its holes
      return out; },
    tam(M,c,P){ const H=M.hr, rh=hairR(M), X2=h=>'x:'+h, G=X2(P.G), K=X2(P.K), R=X2(P.R);
      const sett=L=>{ const fr=v=>v-Math.floor(v), u=fr(L.a/3.2), v=fr(L.s/3.2); if(Math.abs(u-0.5)<0.05||Math.abs(v-0.5)<0.05) return [R,0];
        return [(u<0.3)||(v<0.3)?K:G,(u<0.3)&&(v<0.3)?-1:0]; };
      return [hatSolid(M,[
        HP.crown(H*0.36,H*1.0,rh*1.03,rh*1.12,G,{rr:1.2,tex:sett}),
        HP.crown(H*0.18,H*0.4,rh*1.01,rh*1.02,X2(P.k),{rr:0.5,tex:TEX.knit(X2(P.k))}),
        HP.egg(-H*0.05,H*0.98,H*0.3,H*1.42,H*0.3,H*1.52,G,{k:0.8,tex:sett}),
        HP.ball(H*0.02,H*1.3,H*0.38,H*0.24,X2(P.P),{k:0.5,tex:L=>[X2(P.P),Math.sin(L.th*19+L.y*4)>0.5?-1:0]})],
        {tilt:0.12,R:H*2.2}) ]; },
    panama(M,c,P){ const H=M.hr, rh=hairR(M), X2=h=>'x:'+h, st=X2(P.S), band=X2(P.K);
      return [hatSolid(M,[
        HP.crown(H*0.28,H*1.18,rh,H*0.86,st,{rr:1.3,sq:1.14,dent:H*0.3,pinch:0.4,tex:TEX.straw(st)}),
        HP.crown(H*0.28,H*1.18,rh,H*0.86,band,{rr:1.3,sq:1.14,grow:0.28,clip:[H*0.3,H*0.52]}),
        HP.brim(H*0.3,H*1.72,0.8,st,{r0:rh,tex:TEX.straw(st),curl:(L,u)=>{ const cs=L.a/(L.r||1); return u*(cs>0?-H*0.3*cs:H*0.22*-cs)+H*0.05*u*u; }})],
        {tilt:0.1,R:H*2.1}) ]; } });   // the Putt Putt tricorn, modelled (and on the course golfer too)
  const HAT_COURSE={pptricorn:1};   // a modelled hat that is modelled on the course golfer too
  /* THE PUTT PUTT WORLD REWARDS, each modelled as the thing it is and keyed by its own id, so nothing else changes.
     A painted part (o.paint) picks its colour cell by cell from where on it the cell is (its unit coordinates),
     which is how a crack, a scale or a sprinkle follows the surface. Colours are the item's own palette. */
  const h01=i=>{ const x=Math.sin(i*127.1+311.7)*43758.5453; return x-Math.floor(x); };
  const fib=(i,n)=>{ const y=1-2*(i+.5)/n, r=Math.sqrt(1-y*y), a=i*2.39996323; return [r*Math.cos(a),y,r*Math.sin(a)]; };
  const seeds=(n,o)=>Array.from({length:n},(_,i)=>norm(add(fib(i,n),[h01(i+o)*.6-.3,h01(i+o+50)*.6-.3,h01(i+o+90)*.6-.3])));
  const vor=(p,S)=>{ let d1=9,d2=9,k=0; for(let i=0;i<S.length;i++){ const d=Math.hypot(p[0]-S[i][0],p[1]-S[i][1],p[2]-S[i][2]); if(d<d1){ d2=d1; d1=d; k=i; } else if(d<d2) d2=d; } return {e:d2-d1,k}; };
  // magma between plates of rock (a lava cleat, the lava ball): a, b are how wide the glow and its hot core are
  const magma=(P,S,a,b)=>l=>{ const v=vor(norm(l),S); if(v.e<b) return {m:'x:'+(P.y||'#ffd04a'),dt:1,gloss:0}; if(v.e<a) return {m:'x:'+(P.o||P.r||'#ff7a1a'),gloss:0};
    return {m:'x:'+(v.k%4===1?(P.r||P.s):v.k%5===2?(P.q||P.h||P.R||P.C):(P.R||P.C)),n:norm(add(sc(norm(l),.55),sc(S[v.k],.45))),gloss:1}; };
  // scales: offset rows round the part, each scale lit on top and dark at its edge (the dino claw)
  const scales=(P,na,nb)=>l=>{ const a=Math.atan2(l[2],l[0])/Math.PI*na, b=l[1]*nb, row=Math.floor(b), x=a+(row&1)*0.5, fa=x-Math.floor(x)-0.5, fb=b-row-0.5, d=fa*fa+fb*fb*1.4;
    if(d>0.19) return {m:'x:'+P.b,dt:0}; return {m:'x:'+(fb>0.08?P.g:P.T),n:norm(add(l,[fa*0.5,fb*0.6,0]))}; };
  /* THE CLEATS. Menu: the golf shoe rebuilt per pair (Q is the shoe's own frame: f toe-ward, u up, t across).
     Clubhouse: cream saddle shoes, a deep green saddle piped in green, a gold crest on the outer side and the tongue,
     a deep green sole on gold studs. Lava Rock: black rock boots cracked with glowing magma, on a molten sole.
     Dino Claw: green scaly boots with three bone-white claws curling off the toe and spines down the back. */
  const CLEAT_MENU={
    ppclubhouse(push,Q,AXs,s,P,HD){ const X=h=>'x:'+h;
      push(ellipsoid(Q(1.5,0.6),AXs,[5.4,0.62,3.15],X(P.C),{gloss:1}));                                      // the sole
      push(ellipsoid(Q(1.5,1.12),AXs,[5.32,0.27,3.12],X(P.y),{gloss:2,noCast:1}));                             // a gold welt
      for(const f of [-2.8,-0.5,1.8,4.1]) for(const d of [1,-1]) push(ellipsoid(Q(1.5+f,0.12,d*2.45),AXs,[0.66,0.5,0.66],X(P.s),{gloss:3,noCast:1}));   // gold studs
      push(ellipsoid(Q(4.0,1.85),AXs,[2.75,1.3,2.85],'shoe',{gloss:2,bias:.12}));                               // the toe box
      push(ellipsoid(Q(1.1,2.4),AXs,[3.2,1.95,2.85],'shoe',{gloss:2,bias:.12}));                                // the vamp
      push(ellipsoid(Q(-1.8,2.2),AXs,[1.85,1.85,2.7],'shoe',{gloss:1}));                                        // the heel counter
      push(over(Q(1.1,2.4),AXs,[3.2,1.95,2.85],X(P.M),l=>l[0]>-0.62&&l[0]<0.4&&l[1]>-0.55,{gloss:1}));          // the saddle
      push(over(Q(1.1,2.4),AXs,[3.24,1.98,2.89],X(P.g),l=>(Math.abs(l[0]-0.4)<0.05||Math.abs(l[0]+0.62)<0.05)&&l[1]>-0.55,{noCast:1}));   // its piping
      push(over(Q(1.5,0.6),AXs,[5.4,0.62,3.15],X(P.c),l=>Math.abs(l[1]-0.3)<0.12&&l[0]>-0.7,{noCast:1}));        // a mint stripe round the sole
      const cr=Q(1.0,2.75,2.68*s);                                                                               // the crest, on the outer side
      push(ellipsoid(cr,AXs,[1.05,1.15,0.32],X(P.y),{gloss:2,noCast:1,cut:l=>l[1]>-0.25||Math.abs(l[0])<0.95*(l[1]+1)}));
      push(ellipsoid(add(cr,sc(AXs[2],0.12*s)),AXs,[0.78,0.88,0.3],X(P.Y),{gloss:3,noCast:1,cut:l=>l[1]>-0.25||Math.abs(l[0])<0.95*(l[1]+1)}));
      push(over(Q(4.0,1.85),AXs,[2.75,1.3,2.85],X(P.M),l=>l[0]<0.05&&l[1]>0.2,{gloss:1}));                     // the saddle runs on over the instep
      push(ellipsoid(Q(1.9,3.75),AXs,[1.35,0.45,1.15],X(P.M),{noCast:1}));                                     // the tongue
      push(ellipsoid(Q(2.35,4.0),AXs,[0.55,0.62,0.62],X(P.Y),{gloss:3,noCast:1}));                              // its gold crest
      push(ellipsoid(Q(-3.45,3.4),AXs,[0.45,1.0,0.85],X(P.Y),{gloss:3,noCast:1}));                              // the gold heel tab
      if(HD) for(const k of [0.9,1.85]) push(capsule(Q(k,3.2+0.09*(2.8-k),-1.15),Q(k,3.2+0.09*(2.8-k),1.15),0.28,X(P.H),{noCast:1})); },
    pplavarock(push,Q,AXs,s,P,HD){ const X=h=>'x:'+h, S1=seeds(11,s>0?3:17), S2=seeds(9,s>0?31:47), S3=seeds(12,s>0?61:77);
      push(ellipsoid(Q(1.5,0.55),AXs,[5.6,0.72,3.3],X(P.s),{gloss:0,dt:1}));                                    // the molten sole
      push(ellipsoid(Q(1.5,1.15),AXs,[5.5,0.3,3.25],X(P.y),{gloss:0,dt:1,noCast:1}));                           // its white-hot edge
      for(const [f,d,r] of [[-2.2,1,0.55],[0.6,-1,0.7],[2.6,1,0.5],[4.6,-1,0.45]]) push(ellipsoid(Q(1.5+f,-0.05,d*2.7),AXs,[r,r*1.3,r],X(P.o),{gloss:0,dt:1,noCast:1}));   // drips
      push(ellipsoid(Q(4.0,1.95),AXs,[2.9,1.45,3.0],'shoe',{paint:magma(P,S1,0.14,0.05)}));                     // the toe, a rock
      push(ellipsoid(Q(1.0,2.55),AXs,[3.3,2.1,3.0],'shoe',{paint:magma(P,S2,0.13,0.05)}));
      push(ellipsoid(Q(-1.6,2.3),AXs,[2.0,2.0,2.85],'shoe',{paint:magma(P,S1,0.13,0.05)}));
      push(ellipsoid(Q(-0.2,4.8),AXs,[3.75,3.0,3.8],'shoe',{paint:magma(P,S3,0.11,0.04)}));                     // the boot, up over the trouser hem
      push(ellipsoid(Q(-0.2,7.3),AXs,[3.0,0.5,3.05],X('#120a0c'),{noCast:1}));                                 // its dark mouth
      for(let i=0;i<9;i++){ const a=i/9*2*Math.PI+0.4*s, r=0.85+0.45*h01(i+s), c=Q(-0.2+3.35*Math.cos(a),7.0+0.4*h01(i*3),3.4*Math.sin(a));   // a jagged rock rim
        push(ellipsoid(c,AXs,[r,r*1.2,r],'shoe',{paint:magma(P,S2,0.16,0.06)})); }
      for(const [f,u,t,r] of [[4.9,2.6,1.4,0.9],[2.5,3.5,-1.9,1.0],[0.2,1.6,2.6,0.9],[-2.6,3.6,-2.0,0.95]]) push(ellipsoid(Q(f,u,t*s),AXs,[r,r*0.8,r],'shoe',{paint:magma(P,S3,0.2,0.07)})); },   // lumps of rock
    ppdinoclaw(push,Q,AXs,s,P,HD){ const X=h=>'x:'+h;
      push(ellipsoid(Q(1.6,0.6),AXs,[5.6,0.66,3.3],X(P.s),{gloss:1}));                                      // the sole
      push(ellipsoid(Q(4.1,1.9),AXs,[2.9,1.4,3.1],'shoe',{paint:scales(P,7,4),gloss:2}));                    // the toe
      push(ellipsoid(Q(1.1,2.5),AXs,[3.3,2.05,3.0],'shoe',{paint:scales(P,8,5),gloss:2}));
      push(ellipsoid(Q(-1.7,2.3),AXs,[2.0,2.0,2.85],'shoe',{paint:scales(P,7,4),gloss:1}));
      push(ellipsoid(Q(-0.2,4.8),AXs,[3.75,3.0,3.8],'shoe',{paint:scales(P,9,5),gloss:2}));                  // the boot, up over the trouser hem
      push(ellipsoid(Q(-0.2,7.2),AXs,[3.9,0.8,3.95],X(P.b),{gloss:1,cut:l=>Math.hypot(l[0],l[2])>0.78}));   // its collar
      push(ellipsoid(Q(-0.2,7.3),AXs,[3.1,0.5,3.15],X('#0c1a0e'),{noCast:1}));                             // and the dark inside
      for(let j=0;j<4;j++) push(ellipsoid(Q(-3.9-0.1*j,7.0-1.5*j,0),[AXs[0],AXs[1],AXs[2]],[0.9,0.75,0.42],X(P.g),{gloss:2,noCast:1}));   // spines down the back
      for(const k of [-1.55,0,1.55]){ let prev=Q(5.9,1.75,k*1.05);                                          // three claws, curling down off the toe
        for(let j=0;j<5;j++){ const c=Q(6.3+0.72*j,1.75-0.075*j*j-0.05*j,k*(1.05+0.06*j)), r=0.78*(1-0.16*j);
          push(ellipsoid(c,AXs,[r*1.15,r,r],X(j<1?P.F:j<2?P.f:P.c),{gloss:3,noCast:j>0?1:0})); prev=c; } } } };
  /* THE PRO SHOP LINE'S SHOES. Spikeless: a knit upper on a deep white foam midsole and a grey rubber outsole of nubs,
     a coloured stripe along the side, white laces. Kiltie brogues: polished leather on a thin welted sole, a wingtip toe
     cap punched with brogueing, and the kiltie: a fringed leather flap laid over the laces. Tour dial: a sleek white
     athletic shoe, a coloured heel and side panel, and the dial on the tongue that its cables run from. */
  Object.assign(CLEAT_MENU,{
    spikeless(push,Q,AXs,s,P,HD){ const X=h=>'x:'+h;
      push(ellipsoid(Q(1.5,0.35),AXs,[5.4,0.42,3.15],X(P.s),{gloss:1,paint:l=>({m:X(P.s),dt:Math.sin(l[0]*22)*Math.sin(l[2]*14)>0.3&&l[1]<0?-1:0})}));   // the nubbed outsole
      push(ellipsoid(Q(1.5,1.0),AXs,[5.36,0.62,3.14],X(P.W),{gloss:1}));                                         // the foam midsole
      const knit=l=>({m:'shoe',dt:Math.sin(l[0]*30+Math.sin(l[1]*9))>0.85?-1:0});
      push(ellipsoid(Q(4.0,1.9),AXs,[2.75,1.3,2.85],'shoe',{paint:knit}));                                        // the toe box
      push(ellipsoid(Q(1.1,2.45),AXs,[3.2,1.95,2.85],'shoe',{paint:knit}));                                       // the vamp
      push(ellipsoid(Q(-1.8,2.25),AXs,[1.85,1.85,2.7],'shoe',{paint:knit}));                                      // the heel
      push(over(Q(1.1,2.45),AXs,[3.24,1.98,2.89],X(P.M),l=>Math.abs(l[2])>0.45&&Math.abs(l[1]+0.1-l[0]*0.55)<0.16,{noCast:1}));   // the side stripe
      push(ellipsoid(Q(-2.4,3.2),AXs,[0.5,0.9,1.0],X(P.M),{noCast:1}));                                         // the heel tab
      if(HD) for(const k of [0.6,1.5,2.4]) push(capsule(Q(k,3.75-0.12*k,-1.1),Q(k,3.75-0.12*k,1.1),0.24,X(P.L||'#ffffff'),{noCast:1})); },
    kiltie(push,Q,AXs,s,P,HD){ const X=h=>'x:'+h;
      push(ellipsoid(Q(1.5,0.45),AXs,[5.5,0.5,3.2],X(P.s),{gloss:1}));                                          // the sole
      push(ellipsoid(Q(1.5,0.95),AXs,[5.45,0.22,3.18],X(P.p),{noCast:1}));                                       // the welt
      push(ellipsoid(Q(4.0,1.75),AXs,[2.8,1.2,2.8],'shoe',{gloss:3}));                                           // the toe
      push(ellipsoid(Q(1.1,2.3),AXs,[3.2,1.9,2.8],'shoe',{gloss:3}));                                            // the vamp
      push(ellipsoid(Q(-1.8,2.15),AXs,[1.85,1.8,2.65],'shoe',{gloss:2}));                                        // the heel
      const wing=l=>l[0]>0.15-0.35*Math.abs(l[2])&&l[0]<0.3-0.35*Math.abs(l[2]);
      push(over(Q(4.0,1.75),AXs,[2.84,1.23,2.84],X(P.p),l=>wing(l),{noCast:1}));                                // the wingtip's edge
      push(over(Q(4.0,1.75),AXs,[2.86,1.25,2.86],X(P.p),l=>l[0]>0.33-0.35*Math.abs(l[2])&&l[0]<0.39-0.35*Math.abs(l[2])&&Math.sin(Math.atan2(l[2],l[1])*30)>0.6,{noCast:1}));   // the brogueing along the wing
      push(over(Q(4.0,1.75),AXs,[2.86,1.25,2.86],X(P.p),l=>l[0]>0.8&&Math.hypot(l[2],l[1]-0.35)<0.32&&Math.sin(l[2]*44)*Math.sin(l[1]*44)>0.7,{noCast:1}));   // the medallion on the toe
      push(ellipsoid(Q(2.0,4.1),[norm(add(AXs[0],sc(AXs[1],-0.45))),norm(add(AXs[1],sc(AXs[0],0.45))),AXs[2]],[1.9,0.3,2.1],X(P.M),{gloss:1}));   // the kiltie flap, laid on the laces
      for(let k=-3;k<=3;k++) push(capsule(Q(3.55,3.4,k*0.5),Q(4.25,2.55,k*0.53),0.24,X(k&1?P.M:P.m),{gloss:1,noCast:1}));   // its fringe, over the toe
      if(HD) for(const k of [-1,1]) push(ellipsoid(Q(1.2,4.55,k*0.6),AXs,[0.3,0.3,0.3],X(P.p),{noCast:1})); },   // the lace ends
    tourdial(push,Q,AXs,s,P,HD){ const X=h=>'x:'+h;
      push(ellipsoid(Q(1.5,0.35),AXs,[5.4,0.4,3.15],X(P.s),{gloss:1}));                                         // the outsole
      push(ellipsoid(Q(1.5,0.95),AXs,[5.36,0.58,3.14],X(P.W),{gloss:1}));                                        // the midsole
      push(ellipsoid(Q(4.0,1.9),AXs,[2.75,1.3,2.85],'shoe',{gloss:2}));
      push(ellipsoid(Q(1.1,2.45),AXs,[3.2,1.95,2.85],'shoe',{gloss:2}));
      push(ellipsoid(Q(-1.8,2.25),AXs,[1.9,1.9,2.72],X(P.M),{gloss:2}));                                         // the coloured heel
      push(over(Q(1.1,2.45),AXs,[3.24,1.98,2.89],X(P.M),l=>Math.abs(l[2])>0.5&&l[0]<0.1&&l[1]<0.35-l[0]*0.6,{noCast:1}));   // the side panel
      if(HD) for(const k of [0.5,1.4,2.3]) push(capsule(Q(k,3.75-0.12*k,-1.15),Q(1.6,4.05,0),0.13,X(P.k||'#c9ced6'),{noCast:1}));   // the cables
      push(ellipsoid(Q(1.6,4.05),AXs,[0.95,0.45,0.95],X(P.d),{gloss:2}));                                        // the dial
      push(ellipsoid(Q(1.6,4.35),AXs,[0.55,0.2,0.55],X(P.M),{gloss:3,noCast:1})); } });
  // On the course a shoe is one rounded block (sc0, axes sax, radii sr) a few cells long: each pair keeps its colours,
  // its band and its signature (the saddle and gold welt, the magma cracks and molten sole, the white claws).
  const CLEAT_COURSE={
    ppclubhouse(push,sc0,sax,sr,P){ push(ellipsoid(sc0,sax,sr,'shoe',{gloss:2,bias:.15}));
      push(over(sc0,sax,sr,'x:'+P.C,l=>l[1]<-0.5)); push(over(sc0,sax,sr,'x:'+P.Y,l=>l[1]>=-0.5&&l[1]<-0.28,{gloss:2}));
      push(over(sc0,sax,sr,'x:'+P.M,l=>l[0]>-0.42&&l[0]<0.18&&l[1]>=-0.28,{gloss:1})); },
    pplavarock(push,sc0,sax,sr,P,ank){ const S=seeds(7,5); push(ellipsoid(sc0,sax,sr,'shoe',{paint:magma(P,S,0.2,0.08),gloss:1}));
      push(over(sc0,sax,sr,'x:'+P.s,l=>l[1]<-0.45,{dt:1,gloss:0})); push(over(sc0,sax,sr.map(v=>v*1.01),'x:'+P.y,l=>l[1]>=-0.45&&l[1]<-0.25,{dt:1,gloss:0}));
      push(ellipsoid(add(ank,sc(sax[1],0.4)),sax,[2.75,2.3,2.85],'shoe',{paint:magma(P,seeds(6,9),0.2,0.08),gloss:1})); },
    ppdinoclaw(push,sc0,sax,sr,P,ank){ push(ellipsoid(sc0,sax,sr,'shoe',{paint:scales(P,4,2),gloss:2}));
      push(over(sc0,sax,sr,'x:'+P.s,l=>l[1]<-0.5));
      push(ellipsoid(add(ank,sc(sax[1],0.4)),sax,[2.75,2.3,2.85],'shoe',{paint:scales(P,4,2),gloss:2}));
      for(const k of [-1.2,0,1.2]) push(ellipsoid(add(sc0,sc(sax[0],sr[0]*0.98),sc(sax[1],-0.2),sc(sax[2],k)),sax,[1.0,0.55,0.5],'x:'+P.c,{gloss:3})); } };

  /* THE BALLS. Each motif is drawn on the ball's own sphere (p: x right, y up, z toward the viewer), the same for
     its tile and for the ball teed by the menu golfer's feet: a white star, sprinkles, magma cracks between rock
     plates, a cloud on a blue sky, a speckled egg (taller), a faceted nugget with a glint, a golden leaf, and a
     carved face lit from inside (with its stem). ry stretches it tall, lump roughs the tile's outline. */
  const starR=(th,Ro,Ri)=>{ const k=2*Math.PI/5, a0=((th%k)+k)%k, a=Math.min(a0,k-a0); return Ro*Ri*Math.sin(k/2)/(Ro*Math.sin(a)+Ri*Math.sin(k/2-a)); };
  const SPR=Array.from({length:34},(_,i)=>{ const c=fib(i,34), t0=norm(cross(c,[0.3,1,0.2])), t1=cross(c,t0), a=h01(i+7)*Math.PI; return {c,t:add(sc(t0,Math.cos(a)),sc(t1,Math.sin(a))),k:i%5}; });
  const LAV=seeds(13,101), NUG=seeds(11,211), SPOT=Array.from({length:24},(_,i)=>({c:norm(add(fib(i,24),[h01(i+3)*.3-.15,0,h01(i+5)*.3-.15])),r:0.09+0.12*h01(i+13),k:h01(i+11)<0.42}));
  const jackEye=(x,y)=>y>-0.02&&y<0.36&&x>0.12&&x<0.56&&(y+0.02)<0.38*(1-Math.abs(x-0.34)/0.22);
  const jackMouth=(x,y)=>{ if(Math.abs(x)>0.6||y>-0.12||y<-0.52) return false; const lo=-0.52+0.17*(1-(x/0.6)**2), hi=-0.12-0.1*(x/0.6)**2;
    if(y<lo||y>hi) return false; const t=((x+0.6)/0.2)|0; return !((t%2===0)&&(y>hi-0.1||y<lo+0.1)); };
  const BALL_PP={
    // the Pro Shop line's balls: dimpled, a range ball's red band, a bright optic yellow, an alignment line to aim down
    range:{ f:(p,P)=>Math.abs(p[1])<0.2?{c:P.R,gloss:2}:{c:P.C,dt:Math.sin(p[0]*24)*Math.sin(p[1]*24)>0.75?-1:0} },
    optic:{ f:(p,P)=>({c:P.C,dt:Math.sin(p[0]*24)*Math.sin(p[1]*24)>0.75?-1:0,gloss:2}) },
    alignment:{ f:(p,P)=>Math.abs(p[1])<0.075&&p[2]>-0.2?{c:P.L,gloss:2}:{c:P.C,dt:Math.sin(p[0]*24)*Math.sin(p[1]*24)>0.75?-1:0} },
    ppgoldstar:{ f:(p,P)=>{ if(p[2]>0){ const r=Math.hypot(p[0],p[1]), th=Math.atan2(p[0],p[1]), R=starR(th,0.7,0.3);
        if(r<R-0.09) return {c:P.S,gloss:3}; if(r<R) return {c:P.G,gloss:3}; }
      for(const [x,y] of [[-0.62,0.5],[0.66,-0.42],[-0.5,-0.62]]) if(Math.hypot(p[0]-x,p[1]-y)<0.07&&p[2]>0) return {c:P.G};   // twinkles
      return {c:P.C}; } },
    ppsprinkle:{ f:(p,P)=>{ for(const s of SPR){ const d=sub(p,s.c), al=dot(d,s.t); if(Math.abs(al)>0.17) continue; if(Math.hypot(...sub(d,sc(s.t,al)))<0.065) return {c:[P.y,P.b,P.g,P.w,P.r][s.k],gloss:2}; }
      return {c:P.C}; } },
    pplava:{ f:(p,P)=>{ const v=vor(p,LAV); if(v.e<0.04) return {c:P.y,dt:1,gloss:0}; if(v.e<0.1) return {c:P.r,gloss:0}; if(v.e<0.14) return {c:P.e||P.r,dt:-1,gloss:0};
      return {c:v.k%3?P.C:P.s,n:norm(add(sc(p,.55),sc(LAV[v.k],.45))),gloss:1}; } },
    ppcloud:{ f:(p,P)=>{ const x=p[0],y=p[1]; if(p[2]>0.05){ let c=y>-0.27&&y<0.02&&x>-0.62&&x<0.68;
        for(const [a,b,r] of [[-0.32,0.0,0.3],[0.04,0.17,0.37],[0.38,0.02,0.29],[-0.56,-0.11,0.2],[0.6,-0.11,0.19]]) if(Math.hypot(x-a,y-b)<r) c=true;
        if(c) return {c:y<-0.15?P.w:P.W,gloss:1}; }
      if(p[2]<-0.1&&Math.hypot(x+0.3,y-0.35)<0.3) return {c:P.W,gloss:1};                                      // a little one round the back
      return {c:y>0.6?P.h:P.C}; } },
    // Moon Base: a moon with its craters (lit upper left), and a banded planet with a pale ring round its middle
    ppmoon:{ f:(p,P)=>{ for(const [x,y,z,r] of [[-0.35,-0.3,0.88,0.28],[0.4,0.25,0.88,0.22],[0.05,0.6,0.8,0.17],[0.55,-0.45,0.7,0.14],[-0.2,0.2,-0.95,0.3]])
        if(Math.hypot(p[0]-x,p[1]-y,p[2]-z)<r) return {c:P.d,dt:-1}; return {c:p[0]+p[1]<-0.4?P.h:P.C}; } },
    ppplanet:{ f:(p,P)=>{ if(Math.abs(p[1]+0.22*p[0])<0.08) return {c:P.R,gloss:2}; return {c:((Math.floor((p[1]+1)*3.5))&1)?P.B:P.C,gloss:1}; } },
    ppdinoegg:{ ry:1.2, f:(p,P)=>{ for(const s of SPOT) if(Math.hypot(...sub(p,s.c))<s.r) return {c:s.k?P.d:P.g,gloss:2}; return {c:P.C,gloss:2}; } },
    ppnugget:{ lump:th=>0.07*Math.sin(5*th+0.5)+0.05*Math.sin(3*th+2.1), f:(p,P)=>{ const v=vor(p,NUG), n=norm(add(sc(p,.4),sc(NUG[v.k],.6)));
      if(v.e<0.045) return {c:P.s,n,gloss:2}; if((v.k===2||v.k===7)&&Math.hypot(...sub(p,NUG[v.k]))<0.13) return {c:P.w,n,gloss:3};
      return {c:[P.C,P.h,P.C,P.s][v.k%4],n,gloss:3}; } },
    ppgoldleaf:{ f:(p,P)=>{ if(p[2]>0.05){ const a=0.85, u=p[0]*Math.cos(a)+p[1]*Math.sin(a), v=-p[0]*Math.sin(a)+p[1]*Math.cos(a);
        if(u>-0.82&&u<-0.56&&Math.abs(v)<0.045) return {c:P.l};                                                // the stem
        if(u>-0.6&&u<0.66){ const w=0.37*Math.pow(Math.sin(Math.PI*(u+0.6)/1.26),0.8); if(Math.abs(v)<w){
          if(Math.abs(v)<0.04||Math.abs(v)>w-0.05) return {c:P.l,gloss:3};
          const q=u-Math.abs(v)*0.9; if(Math.abs(((q%0.24)+0.24)%0.24-0.12)<0.025) return {c:P.l,gloss:3};
          return {c:P.L,gloss:3}; } } }
      return {c:p[1]>0.55?P.h:P.C}; } },
    // an iron lantern cage: six bars, a band round its back and caps top and bottom, purple glass between them
    // and a white-violet flame burning at the heart of the face that looks at you
    pphallowslantern:{ f:(p,P)=>{ const ph=Math.atan2(p[0],p[2]), rb=Math.abs(((ph*6/(2*Math.PI)+0.5)%1+1)%1-0.5);
      if(rb>0.43||Math.abs(p[1])>0.8||(Math.abs(p[1])<0.06&&p[2]<0.55)) return {c:P.o,gloss:3};
      const fl=Math.hypot(p[0]*1.25,p[1]+0.1); if(p[2]>0.6&&fl<0.36) return {c:fl<0.2?P.W:P.L,dt:1,gloss:0};
      return {c:p[2]>0.5?P.C:P.P,dt:1,gloss:1}; } } };
  // the menu golfer's teed ball, painted with its motif: p is (x right, y up, z front) of the ball facing the camera
  function ppBall(push,bp,AX,U,T,id,P){ const B=BALL_PP[id], ry=B.ry||1, c=add(bp,sc(U,1.8*(ry-1)));
    push(ellipsoid(c,AX,[1.8,1.8*ry,1.8],'x:'+P.C,{gloss:3,paint:l=>{ const q=B.f([-l[2],l[1],l[0]],P); return {m:'x:'+q.c,dt:q.dt||0,gloss:q.gloss!=null?q.gloss:3,n:q.n?[q.n[2],q.n[1],-q.n[0]]:null}; }}));
    if(B.stem) push(capsule(add(c,sc(U,1.5)),add(c,sc(U,2.5),sc(T,-0.35)),0.36,'x:'+(P.g||'#3f7a2a'),{gloss:1})); }
  // its tile: the same sphere, big, on a white tee
  function ballPicPP(id,B,pal){ const R=22, ry=B.ry||1, N=2*R+8, TH=16, PAD=B.stem?8:3, cx=N/2, cy=PAD+R*ry+1, H=Math.ceil(cy+R*ry*0.92)+TH+1, s=new PQ.Sprite(N,H);
    for(let y=0;y<H;y++) for(let x=0;x<N;x++){ const nx=(x+.5-cx)/R, ny=(y+.5-cy)/(R*ry), rr=1+(B.lump?B.lump(Math.atan2(ny,nx)):0), r2=(nx*nx+ny*ny)/(rr*rr);
      if(r2<=1){ const nz=Math.sqrt(1-r2), p=norm([nx/rr,-ny/rr,nz]), q=B.f(p,pal), m=q.n||p, n=norm([m[0],-m[1]/ry,m[2]]);
        s.g[y][x]={m:'x:'+q.c,n:()=>n,z:nz*R,dt:q.dt||0,gloss:q.gloss!=null?q.gloss:3,bias:0,t:null,noCast:0,tag:''}; continue; }
      if(B.stem){ const top=cy-R*ry, sx=cx+(top-(y+.5))*0.3+1, tx=(x+.5-sx)/2.4; if(y+.5>top-6&&y+.5<top+3&&Math.abs(tx)<1){ const n=[tx,-0.3,Math.sqrt(1-tx*tx)];
        s.g[y][x]={m:'x:'+(pal.g||'#3f7a2a'),n:()=>n,z:R*0.5,dt:0,gloss:1,bias:0,t:null,noCast:0,tag:''}; continue; } }
      const ty=y-(cy+R*ry*0.92); if(ty>=0&&ty<TH){ const w=ty<4?5.5-ty*0.6:3.0-ty*0.08, tx=(x+.5-cx)/w;
        if(Math.abs(tx)<1){ const n=[tx,0,Math.sqrt(1-tx*tx)]; s.g[y][x]={m:'x:'+(pal.T||'#e8ebf0'),n:()=>n,z:-5,dt:0,gloss:1,bias:0,t:null,noCast:0,tag:''}; } } }
    const cv=document.createElement('canvas'); cv.width=N; cv.height=H; const rc=new Map();
    s.paint(cv.getContext('2d'),1,c=>{ const h=c.m.slice(2); let r=rc.get(h); if(!r){ r=PQ.ramp(h); rc.set(h,r); } return r; });
    return {url:cv.toDataURL('image/png'),w:cv.width,h:cv.height}; }

  /* A HAT'S OWN VOLUME: a part whose surface is a test in the head's frame (s across, u up, f forward), marched like
     a hull, for a shape no ellipsoid holds. */
  function vol(M,test,box){ const {hc,look:g,hup:h,Lf:l}=M, O=cam(hc), lc=camv(l), hcv=camv(h), gc=camv(g);
    let bb=[1e9,1e9,-1e9,-1e9]; for(const a of box.s) for(const b of box.u) for(const c of box.f){ const p=add(O,sc(lc,a),sc(hcv,b),sc(gc,c)); bb=[Math.min(bb[0],p[0]),Math.min(bb[1],p[1]),Math.max(bb[2],p[0]),Math.max(bb[3],p[1])]; }
    return {k:'v',O,g:gc,h:hcv,l:lc,test,mat:'hat',o:{},box,bb2:bb}; }
  /* THE TRICORN: a brown crown, and its brim turned up into three peaks (one at the front, two behind), trimmed in
     gold along the top edge. The brim is one sheet that runs out flat from the crown and curls up to a rounded
     triangle, highest at its corners. A skull and crossbones on the front, and a red feather up the side. */
  function tricorn(M,c,P){ const {hc,look,hup,Lf,hr}=M, out=[], X=h=>'x:'+h, AXh=[look,hup,Lf];
    const br=P.T||'#7a4b2e', dk=P.U||'#553220', gold=P.G||'#f2c94c', y0=hr*0.06, Ri=hr*0.93, ri=hr*1.1, TH=hr*0.08;
    out.push(ellipsoid(add(hc,sc(hup,hr*0.22)),AXh,[hr*1.05,hr*0.98,hr*1.05],X(br),{gloss:1,cut:l=>l[1]>-0.17}));      // the crown
    out.push(over(add(hc,sc(hup,hr*0.22)),AXh,[hr*1.05,hr*0.98,hr*1.05],X(dk),l=>l[1]>-0.17&&l[1]<0.0,{noCast:1}));   // its band
    const edge=th=>{ const k=2*Math.PI/3, d=((th%k)+k)%k-k/2, cs=Math.cos(d); const cn=(1-cs)*2; return {re:ri/Math.pow(cs,0.62),Hb:hr*(0.3+cn*(0.62+0.22*Math.max(0,Math.cos(th))))}; };
    const surf=(th,t)=>{ const {re,Hb}=edge(th), r=Ri+t*(re-Ri); return add(hc,sc(look,r*Math.cos(th)),sc(Lf,r*Math.sin(th)),sc(hup,y0+Hb*Math.pow(t,1.8))); };
    const test=(s,u,f)=>{ const r=Math.hypot(s,f); if(r<Ri) return null; const {re,Hb}=edge(Math.atan2(s,f)); if(r>re) return null;
      const t=(r-Ri)/(re-Ri), ub=y0+Hb*Math.pow(t,1.8), sl=Hb*1.8*Math.pow(t,0.8)/(re-Ri), du=u-ub;
      if(Math.abs(du)>TH*Math.sqrt(1+sl*sl)) return null; const sg=du>=0?1:-1;
      return {r:{m:X(sg>0?dk:br),dt:0,gloss:1},n:[-sl*s/r*sg,sg,-sl*f/r*sg]}; };
    const RM=ri/Math.pow(0.5,0.62)+1, UM=y0+hr*1.15+1;
    out.push(vol(M,test,{s:[-RM,RM],u:[y0-1,UM],f:[-RM,RM]}));
    for(let i=0;i<48;i++) out.push(capsule(surf(i/48*2*Math.PI,1),surf((i+1)/48*2*Math.PI,1),hr*0.075,X(gold),{gloss:3}));   // the gold braid along the brim's edge
    // the skull and crossbones, on the front peak
    const sk=add(surf(0,0.62),sc(look,1.5),sc(hup,-0.3)), kw=P.K||'#f3eee0', ks=P.J||'#b8b2a0', ke=P.E||'#181019';
    for(const d of [1,-1]) out.push(capsule(add(sk,sc(Lf,1.45*d),sc(hup,-1.25),sc(look,-0.3)),add(sk,sc(Lf,-1.45*d),sc(hup,1.05),sc(look,-0.3)),0.34,X(ks),{gloss:2,noCast:1}));
    out.push(ellipsoid(add(sk,sc(hup,0.25)),AXh,[0.7,1.05,1.0],X(kw),{gloss:2,noCast:1}));
    out.push(ellipsoid(add(sk,sc(hup,-0.65)),AXh,[0.6,0.5,0.62],X(kw),{gloss:2,noCast:1}));
    for(const d of [1,-1]) out.push(ellipsoid(add(sk,sc(look,0.55),sc(hup,0.2),sc(Lf,0.42*d)),AXh,[0.25,0.32,0.3],X(ke),{noCast:1}));
    // the feather, up and back off the side
    let prev=add(hc,sc(hup,hr*0.75),sc(Lf,-hr*0.62),sc(look,-hr*0.15));
    for(let j=1;j<=8;j++){ const k=j/8, p=add(hc,sc(hup,hr*(0.75+1.0*k)),sc(Lf,-hr*(0.62+0.5*k)),sc(look,-hr*(0.15+0.55*k*k))), w=1.7*Math.sin(Math.PI*Math.min(1,k*1.1))+0.35;
      const d=norm(sub(p,prev)), sd=norm(cross(d,look)); out.push(ellipsoid(sc(add(p,prev),0.5),[d,sd,norm(cross(d,sd))],[hr*0.09+0.5,w,0.4],X(j>6?(P.F||'#ff9a78'):(P.R||'#e8402e')),{gloss:2}));
      out.push(capsule(prev,p,0.2,X(P.D||'#a02018'),{noCast:1})); prev=p; }
    return out; }
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
      cleats={main:p.T||p.R||p.D||v[0], acc:p.M||p.W||p.b||p.f||v[1], sole:p.s||p.k||p.p||p.B||'#2a2f38', id:cle, pal:p}; }
    const gear={top, topPal:top?PXG_TOP_PAL[top]:null, leg:legw, legPal:legw?PXG_LEG_PAL[legw]:null, cleats,
      club:PXG_CLUBS[cid]?cid:'driver', clubPal:Object.assign({},PXG_CLUB_PAL[cid]||{})};
    { gear.lefty=!!look.lefty; gear.fx=look.fx||''; gear.body=look.body||''; gear.bodyPal=(look.body&&typeof BODY_SKINS!=='undefined'&&BODY_SKINS[look.body])||null; const bpal=look.ball&&typeof PXG_BALL_PAL!=='undefined'&&PXG_BALL_PAL[look.ball]; gear.ballC=bpal?(bpal.C||null):null; gear.ballId=bpal&&BALL_PP[look.ball]?look.ball:''; const sh=cleats?cleats.main:av.shoesHex; gear.saddleHex=cleats&&cleats.acc?cleats.acc:(PQ.lum(sh)>0.6?'#2c3a58':mix(sh,'#ffffff',0.55)); }
    const M=MO?profileModel(aim,gear):model(aim,!!look.lefty,kind,kind==='walk'?walkPose(poseKey):POSES[poseKey],gear);
    const P=Object.assign({k:PXG_FIX.k,l:PXG_FIX.l,g:PXG_FIX.g,n:PXG_FIX.n,G:PXG_FIX.G,H:PXG_FIX.H,F:PXG_FIX.F,E:'#20242c',S:'#e8ebf0'},typeof PXG_NOV!=='undefined'?PXG_NOV:{});
    // the menu's modelled cone hats, the beret and Santa's hat go over the hair, as real hats do (the flat art perches them)
    const closed=!!novel&&(!(typeof PXG_HAT_OPEN!=='undefined'&&PXG_HAT_OPEN[novel])||!!(MO&&HAT_MODEL[novel]&&HAT_OVER_HAIR[novel]));
    const hs=look.hairStyle||'short'; M.hairStyle=hs; M.hairK=closed?1.06:hs==='afro'?1.32:hs==='curly'?1.08:1.03;   // a band sits on the hair, not in it
    if(MO&&novel==='knight') M.noHair=true;   // the great helm covers every hair
    const parts=M.parts.concat(hairHat(M,L,closed));
    if(novel){ const cfg=HAT3D[novel]||{}, pal=PXG_HERITAGE_HAT_PAL[novel]||null;
      if((MO||HAT_COURSE[novel])&&HAT_MODEL[novel]) parts.push(...HAT_MODEL[novel](M,hatColours(PXG_HATS[novel],pal,P),pal||{}));
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
      else if(MO&&EW_PP[ew]&&typeof PXG_EW_PAL!=='undefined'&&PXG_EW_PAL[ew]){ const e3=eyewear3D(M,EW_PP[ew].as,map,P,ewColoursPP(EW_PP[ew],PXG_EW_PAL[ew])); e3.forEach(q=>{ q.o.item='ew'; }); parts.push(...e3); }
      else if(MO&&EW_SHAPE[ew]){ const e3=eyewear3D(M,ew,map,P); e3.forEach(q=>{ q.o.item='ew'; }); parts.push(...e3); } else {
      // an item with its own eyewear palette (the page's PXG_EW_PAL, the Putt Putt rewards) reads its colours there first
      const ep=typeof PXG_EW_PAL!=='undefined'&&PXG_EW_PAL[ew], EP=ep?Object.assign({},P,ep):P;
      const dv=hull(map,ch=>roleFor(ch,null,EP,true),M,{decal:1,dx,dy}); parts.push(dv);
      const tagEw=MO&&ep?q=>{ q.o=Object.assign({},q.o||{},{item:'ew'}); }:()=>{}; tagEw(dv);   // so its closet tile can draw it alone
      // the arms run back over the ears, which is most of what shows of a pair of glasses from above
      const fr=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0], frR=fr&&roleFor(fr,null,EP,true);
      if(frR&&nL>0&&nR>0&&ew!=='eyeblack'){ const {hc,look:g,hup,Lf,hr}=M, eu=-hr*0.1;
        const rr=hr*Math.max(1.08,(M.hairK||1.03)+0.06), on=(f,sd)=>add(hc,sc(norm(add(sc(g,f),sc(Lf,sd*Math.sqrt(1-f*f)))),rr),sc(hup,eu));
        for(const sd of [1,-1]){ const a=on(0.62,sd), b=on(-0.3,sd);
          const cq=capsule(a,b,0.5,frR.m,{gloss:2,noCast:1}); tagEw(cq); parts.push(cq); } } } }
    const ONLY=MO?MO.only:''; if(ONLY){ const hatSet=new Set(parts.slice(M.parts.length));
      for(let i=parts.length-1;i>=0;i--){ const q=parts[i], keep=ONLY==='hat'?(hatSet.has(q)&&q.mat!=='hair'&&q.mat!=='skin'&&!(q.o&&q.o.item==='ew')):ONLY==='ew'?(q.o&&q.o.item==='ew'):ONLY==='club'?(q.o&&q.o.item==='club'):(ONLY==='top'||ONLY==='leg'||ONLY==='shirt'||ONLY==='pants')?(q.o&&q.o.item===ONLY&&q.mat!=='skin'&&q.mat!=='glove'&&q.mat.indexOf('x:#d8b04e')<0):(q.o&&q.o.item==='shoe'&&q.o.side===1); if(!keep) parts.splice(i,1); } }
    const K=MO?MO.K:1; const s=new PQ.Sprite(GW*K,GH*K);
    // each part's box on the screen, so a cell only tests the parts that can reach it
    for(const p of parts){ if(p.k==='e'){ const m=Math.max(...p.r); p.bb=[p.c[0]-m,p.c[1]-m,p.c[0]+m,p.c[1]+m]; }
      else if(p.k==='v') p.bb=p.bb2;
      else if(p.k==='f'){ p.bb=p.box?p.box.slice(0,4):[p.c[0]-p.R,p.c[1]-p.R,p.c[0]+p.R,p.c[1]+p.R];
        if(p.o.pts){ const q=p.o.pts.map(cam); p.bb=[Math.min(...q.map(v=>v[0])),Math.min(...q.map(v=>v[1])),Math.max(...q.map(v=>v[0])),Math.max(...q.map(v=>v[1]))]; } }
      else p.bb=[Math.min(p.a[0],p.b[0])-p.r,Math.min(p.a[1],p.b[1])-p.r,Math.max(p.a[0],p.b[0])+p.r,Math.max(p.a[1],p.b[1])+p.r]; }
    for(let y=0;y<GH*K;y++){ const Y=(y+.5)/K-OY, row=parts.filter(p=>Y>=p.bb[1]&&Y<=p.bb[3]); if(!row.length) continue;
     for(let x=0;x<GW*K;x++){ const X=(x+.5)/K-OX; let best=null,bp=null;
      for(const p of row){ if(p.k==='v'||X<p.bb[0]||X>p.bb[2]) continue; const h=p.k==='e'?hitE(p,X,Y):p.k==='f'?hitF(p,X,Y):hitC(p,X,Y); if(h&&(!best||h.D>best.D)){best=h;bp=p} }
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
      else { const light=pxLum(shirt)>0.55, a1=pxShade(shirt,MO?(light?-108:92):(light?-52:46)),a2=pxShade(shirt,MO?(light?-150:130):(light?-90:82)); patFn=(x,y)=>{const a=pd.f(x,y);return a?(a===2?a2:a1):null}; } }   // the menu lights the cloth, so its tints are stronger
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
    const PK=Math.max(1,Math.round(K/2));
    // THE MENU'S PATTERNS WRAP THE CLOTH. A cell is turned back into its point on the body, and the pattern is read
    // by the distance round the torso (its angle times its girth) and the height, so stripes run round the body and
    // down the sleeves rather than lying flat on the picture. PC is a pattern cell, in units.
    // The pattern's own frame is the flat art's (44 by 56, the shirt's front centred on column 22 from row 24 at the
    // neckline down to the belt), so a pattern drawn at set places on it (flames low down, a cow's spots, a ripple's
    // centre) lands where its art puts it.
    // A sparse pattern (stars, dots, hearts, bolts: under 15% of the cloth) is drawn at one and a half times the size,
    // so its marks read at the menu's scale.
    let dens=0; if(patFn&&MO){ let n=0; for(let y=20;y<44;y++) for(let x=10;x<34;x++){ n++; if(patFn(x,y)) dens++; } dens/=n; }
    const PC=dens>0&&dens<0.15?1.5:1.0, wrapAt=(x0,y0,z)=>{ const w=cam([(x0+.5)/K-OX,(y0+.5)/K-OY,z]), q=sub(w,M.tc);
      return [Math.max(0,Math.floor(22+Math.atan2(dot(q,M.T),dot(q,M.F))*7.4/PC)), Math.max(0,Math.floor(24+(33.6-w[1])/PC))]; };
    s.paint(ctx,1,(c,x0,y0)=>{const m=c.m, x=Math.floor(x0/PK), y=Math.floor(y0/PK);
      if((m==='shirt'||m==='polo')&&patFn&&!(m==='shirt'&&top&&top!=='duckfloatie'&&top!=='cape')){ const uv=MO?wrapAt(x0,y0,c.z):[x,y], h=patFn(uv[0],uv[1]); if(h) return rampOf(h); }
      if(m==='plaid'){ const uv=MO?wrapAt(x0,y0,c.z):[x,y], a=(uv[0]%5===0), b=(uv[1]%5===0); return rampOf(a&&b?plaidC[2]:(a||b)?plaidC[1]:plaidC[0]); }
      if(m.startsWith('k:')){ const h=m.slice(2), uv=MO?wrapAt(x0,y0,c.z):[x,y]; return rampOf(uv[0]%2?h:pxShade(h,-18)); }   // knit, in ribs
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
    club:{K:6,EL:24,aim:205,only:'club'}, top:{K:3,EL:10,aim:200,only:'top'}, shirt:{K:3,EL:8,aim:200,only:'shirt'}, pants:{K:3,EL:12,aim:200,only:'pants'}, leg:{K:3,EL:10,aim:200,only:'leg'}, shoe:{K:5,EL:20,aim:235,only:'shoe'} };
  function menu(look,aimDeg,o){ MO={K:o.K||3,EL:o.EL!=null?o.EL:2,phase:o.phase||0,only:o.only||'',part:o.part||''};
    try{ return draw(look,aimDeg,'walk','ws').cv; } finally{ MO=null; } }
  const pcache=new Map();
  const picKey=(look,part)=>part+'|'+lookKey(look);
  function crop(cv,x,y,w,h){ const c=document.createElement('canvas'); c.width=Math.max(1,w); c.height=Math.max(1,h); c.getContext('2d').drawImage(cv,x,y,w,h,0,0,w,h); return c; }
  function pic(look,part){ const k=picKey(look,part); if(pcache.has(k)) return pcache.get(k);
    if(part==='ball'){ const r=ballPic(look.ball); if(pcache.size>400) pcache.clear(); pcache.set(k,r); return r; }
    const o=PIC[part]; if(!o) return null;
    // a cape's tile is drawn from behind
    const cv=menu(look,part==='top'&&look.top==='cape'?20:o.aim,Object.assign({part},o)), W=cv.width, H=cv.height, d=cv.getContext('2d').getImageData(0,0,W,H).data, A=(x,y)=>d[(y*W+x)*4+3]>8;
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
    if(BALL_PP[id]) return ballPicPP(id,BALL_PP[id],pal);
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
