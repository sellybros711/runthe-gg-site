// Marketing-only graphics generator (NOT part of the game/site build).
// Produces Instagram/TikTok-ready images that reuse the RunThePitch brand kit:
//   • feed post   1080×1080  -> marketing/ig-feed.png
//   • story/reel  1080×1920  -> marketing/ig-story.png
//   • "how it works" 1080×1350 -> marketing/ig-howto.png
// Run: node marketing/make-ig-assets.js
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');

GlobalFonts.registerFromPath('/tmp/fonts/Anton-Regular.ttf', 'AntonR');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-Black.ttf', 'ArchivoBlack');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-Bold.ttf', 'ArchivoBold');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-SemiBold.ttf', 'ArchivoSemi');

const ink='#16120F', cream='#FDF6E3', teal='#138A6B', gold='#F4B413', pitch='#2FD673';

function rrect(x,X,Y,W,H,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+W,Y,X+W,Y+H,r); x.arcTo(X+W,Y+H,X,Y+H,r); x.arcTo(X,Y+H,X,Y,r); x.arcTo(X,Y,X+W,Y,r); x.closePath(); }

// Shared dark hero background with gold + teal glows and a faint pitch arc.
function background(x,W,H){
  x.fillStyle='#0b1324'; x.fillRect(0,0,W,H);
  let g=x.createRadialGradient(W/2,H*0.30,40,W/2,H*0.30,W*0.95);
  g.addColorStop(0,'rgba(244,180,19,0.30)'); g.addColorStop(.45,'rgba(244,180,19,0.10)'); g.addColorStop(1,'rgba(244,180,19,0)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  g=x.createRadialGradient(W/2,H+40,80,W/2,H+40,H*1.15);
  g.addColorStop(0,'rgba(19,138,107,0.34)'); g.addColorStop(1,'rgba(19,138,107,0)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  // pitch markings near the bottom
  x.save();
  x.strokeStyle='rgba(47,214,115,0.14)'; x.lineWidth=3;
  const ly=H-90;
  x.beginPath(); x.moveTo(0,ly); x.lineTo(W,ly); x.stroke();
  x.beginPath(); x.ellipse(W/2,ly,W*0.16,28,0,Math.PI,0,true); x.stroke();
  x.restore();
  // gold top stripe
  const stripe=x.createLinearGradient(0,0,W,0);
  stripe.addColorStop(0,'#9C6C18'); stripe.addColorStop(.32,'#F4B413'); stripe.addColorStop(.5,'#FCEFA8'); stripe.addColorStop(.68,'#F4B413'); stripe.addColorStop(1,'#9C6C18');
  x.fillStyle=stripe; x.fillRect(0,0,W,Math.round(W*0.013));
}

// RUN·THE·PITCH wordmark centered at baseline y, given font px size.
function wordmark(x,CX,y,size){
  x.textBaseline='alphabetic'; x.font=`400 ${size}px AntonR`;
  const seg=[['RUN',cream],['THE',teal],['PITCH',cream]];
  let tot=0; for(const [t] of seg) tot+=x.measureText(t).width;
  let lx=CX-tot/2;
  x.save(); x.shadowColor='rgba(0,0,0,.45)'; x.shadowBlur=size*0.12; x.shadowOffsetY=size*0.04; x.textAlign='left';
  for(const [t,col] of seg){ x.fillStyle=col; x.fillText(t,lx,y); lx+=x.measureText(t).width; }
  x.restore();
}

// "WORLD CUP GAME" gold pill, centered, top at py0.
function pill(x,CX,py0,fontPx,padX,height){
  x.textAlign='left'; x.font=`900 ${fontPx}px ArchivoBlack`;
  const label='WORLD CUP GAME', sp=fontPx*0.22;
  let pw=0; for(const ch of label) pw+=x.measureText(ch).width+sp; pw-=sp;
  const box=pw+padX*2, x0=CX-box/2;
  const pg=x.createLinearGradient(0,py0,0,py0+height); pg.addColorStop(0,'#FCEFA8'); pg.addColorStop(1,'#F4B413');
  rrect(x,x0,py0,box,height,height*0.28); x.fillStyle=pg; x.fill(); x.lineWidth=3; x.strokeStyle=ink; x.stroke();
  x.fillStyle=ink; let wx=x0+padX; for(const ch of label){ x.fillText(ch,wx,py0+height*0.68); wx+=x.measureText(ch).width+sp; }
}

// Footer URL block: small "PLAY NOW AT" label above a large gold "RunThe.gg".
// `cy` is the baseline of the big URL line; `s` scales the whole block.
function footer(x,CX,cy,s){
  x.textAlign='center';
  // small kicker label
  x.fillStyle='rgba(253,246,227,.8)'; x.font=`900 ${22*s}px ArchivoBlack`;
  const kick='PLAY NOW AT', ksp=4*s;
  let kw=0; for(const ch of kick) kw+=x.measureText(ch).width+ksp; kw-=ksp;
  let kx=CX-kw/2; x.textAlign='left';
  for(const ch of kick){ x.fillText(ch,kx,cy-62*s); kx+=x.measureText(ch).width+ksp; }
  // large URL with letter-spacing + soft shadow so it stands out
  x.save(); x.shadowColor='rgba(0,0,0,.45)'; x.shadowBlur=10*s; x.shadowOffsetY=3*s;
  x.fillStyle=gold; x.font=`400 ${58*s}px AntonR`;
  const url='RunThe.gg', usp=2*s;
  let uw=0; for(const ch of url) uw+=x.measureText(ch).width+usp; uw-=usp;
  let ux=CX-uw/2;
  for(const ch of url){ x.fillText(ch,ux,cy); ux+=x.measureText(ch).width+usp; }
  x.restore();
  x.textAlign='center';
}

// Big CTA button (filled) with label + sublabel, centered.
function ctaButton(x,CX,by,bw,bh,fill,label,sub){
  const bx=CX-bw/2;
  x.fillStyle=ink; rrect(x,bx+8,by+8,bw,bh,18); x.fill();
  x.fillStyle=fill; rrect(x,bx,by,bw,bh,18); x.fill();
  x.lineWidth=4; x.strokeStyle=ink; rrect(x,bx,by,bw,bh,18); x.stroke();
  x.textAlign='center';
  x.fillStyle='#fff'; x.font=`400 ${bh*0.34}px AntonR`; x.fillText(label, CX, by+bh*0.46);
  x.fillStyle='rgba(255,255,255,.92)'; x.font=`900 ${bh*0.13}px ArchivoBlack`; x.fillText(sub, CX, by+bh*0.74);
}

// ----------------------------------------------------------------------------
// 1) FEED POST  1080×1080
// ----------------------------------------------------------------------------
(function feed(){
  const W=1080,H=1080,CX=W/2; const c=createCanvas(W,H),x=c.getContext('2d');
  background(x,W,H);
  wordmark(x,CX,300,118);
  pill(x,CX,330,30,26,58);
  // headline
  x.textAlign='center'; x.save(); x.shadowColor='rgba(0,0,0,.4)'; x.shadowBlur=10; x.shadowOffsetY=3;
  x.fillStyle=cream; x.font='400 104px AntonR';
  x.fillText('SPIN. PICK.', CX, 520);
  x.fillStyle=gold; x.fillText('CONQUER.', CX, 628);
  x.restore();
  // subline
  x.fillStyle='rgba(253,246,227,.92)'; x.font='700 34px ArchivoBold';
  x.fillText('Draft a squad from 60+ years of World Cup', CX, 708);
  x.fillText('legends — then simulate your run to glory.', CX, 752);
  // two CTAs
  ctaButton(x,CX-262,800,490,118,'#1Fa34f','FRIENDLIES','CHALLENGE A FRIEND');
  ctaButton(x,CX+262,800,490,118,'#E5402A','SOLO DRAFT','SIMULATE A WORLD CUP');
  // url
  footer(x,CX,H-58,1.0);
  fs.writeFileSync('marketing/ig-feed.png', c.toBuffer('image/png'));
  console.log('wrote marketing/ig-feed.png');
})();

// ----------------------------------------------------------------------------
// 2) STORY / REEL COVER  1080×1920
// ----------------------------------------------------------------------------
(function story(){
  const W=1080,H=1920,CX=W/2; const c=createCanvas(W,H),x=c.getContext('2d');
  background(x,W,H);
  wordmark(x,CX,430,128);
  pill(x,CX,470,32,28,62);
  // headline
  x.textAlign='center'; x.save(); x.shadowColor='rgba(0,0,0,.4)'; x.shadowBlur=10; x.shadowOffsetY=3;
  x.fillStyle=cream; x.font='400 132px AntonR';
  x.fillText('BUILD YOUR', CX, 800);
  x.fillText('DREAM', CX, 940);
  x.fillStyle=gold; x.fillText('WORLD CUP', CX, 1080);
  x.fillStyle=cream; x.fillText('SQUAD', CX, 1220);
  x.restore();
  x.fillStyle='rgba(253,246,227,.9)'; x.font='700 40px ArchivoBold';
  x.fillText('Spin a year & nation. Draft legends.', CX, 1320);
  x.fillText('Challenge a friend head-to-head.', CX, 1372);
  // single CTA
  ctaButton(x,CX,1480,720,150,'#1Fa34f','PLAY FREE','NO APP · JUST TAP');
  footer(x,CX,1800,1.25);
  fs.writeFileSync('marketing/ig-story.png', c.toBuffer('image/png'));
  console.log('wrote marketing/ig-story.png');
})();

// ----------------------------------------------------------------------------
// 3) "HOW IT WORKS"  1080×1350 (4:5 portrait feed)
// ----------------------------------------------------------------------------
(function howto(){
  const W=1080,H=1350,CX=W/2; const c=createCanvas(W,H),x=c.getContext('2d');
  background(x,W,H);
  wordmark(x,CX,180,76);
  x.textAlign='center'; x.fillStyle=gold; x.font='400 88px AntonR'; x.fillText('HOW IT WORKS', CX, 300);
  const steps=[
    ['1','Spin a random year & nation','From 1966 to 2026 — anyone could come up.'],
    ['2','Draft your squad, slot by slot','Build your dream lineup.'],
    ['3','Simulate your World Cup run','Face historic squads and chase the trophy.'],
    ['4','Or challenge a friend','Head-to-head Friendly, winner takes bragging rights.'],
  ];
  let ry=410; const cardX=70, cardW=W-140;
  steps.forEach(([n,t,s])=>{
    const ch=172;
    x.fillStyle='rgba(8,14,26,.55)'; rrect(x,cardX,ry,cardW,ch,24); x.fill();
    x.lineWidth=2; x.strokeStyle='rgba(244,180,19,.4)'; rrect(x,cardX,ry,cardW,ch,24); x.stroke();
    // number circle
    x.fillStyle=gold; x.beginPath(); x.arc(cardX+90,ry+ch/2,52,0,Math.PI*2); x.fill();
    x.lineWidth=4; x.strokeStyle=ink; x.stroke();
    x.fillStyle=ink; x.font='400 64px AntonR'; x.textAlign='center'; x.fillText(n,cardX+90,ry+ch/2+22);
    // text
    x.textAlign='left';
    x.fillStyle=cream; x.font='900 42px ArchivoBlack'; x.fillText(t,cardX+180,ry+ch/2-6);
    x.fillStyle='rgba(253,246,227,.78)'; x.font='600 30px ArchivoSemi'; x.fillText(s,cardX+180,ry+ch/2+42);
    ry+=ch+22;
  });
  footer(x,CX,H-46,1.0);
  fs.writeFileSync('marketing/ig-howto.png', c.toBuffer('image/png'));
  console.log('wrote marketing/ig-howto.png');
})();

// ----------------------------------------------------------------------------
// 4) PLAYER SPOTLIGHT  1080×1080 — a draft "rating card" template.
//    Edit the `card` object to feature any player. Data shown here matches the
//    in-game rating (Ronaldo, Brazil 2002, 99 OVR, FWD).
// ----------------------------------------------------------------------------
(function spotlight(){
  const card={ name:'RONALDO', country:'BRAZIL', year:'2002', ovr:'99', pos:'FWD' };
  const W=1080,H=1080,CX=W/2; const c=createCanvas(W,H),x=c.getContext('2d');
  background(x,W,H);
  wordmark(x,CX,160,66);
  x.textAlign='center'; x.fillStyle=gold; x.font='400 50px AntonR'; x.fillText('DRAFT LEGENDS LIKE THIS', CX, 232);

  // ---- the rating card ----
  const cw=560, chh=600, cx0=CX-cw/2, cy0=290;
  // drop shadow + gold gradient panel
  x.save(); x.shadowColor='rgba(0,0,0,.5)'; x.shadowBlur=40; x.shadowOffsetY=18;
  const pg=x.createLinearGradient(0,cy0,0,cy0+chh); pg.addColorStop(0,'#FCEFA8'); pg.addColorStop(.5,'#F4B413'); pg.addColorStop(1,'#D89A0C');
  rrect(x,cx0,cy0,cw,chh,40); x.fillStyle=pg; x.fill(); x.restore();
  x.lineWidth=5; x.strokeStyle=ink; rrect(x,cx0,cy0,cw,chh,40); x.stroke();

  // OVR (big) + position, top-left stack
  x.textAlign='center'; x.fillStyle=ink;
  x.font='400 180px AntonR'; x.fillText(card.ovr, cx0+120, cy0+170);
  x.font='400 56px AntonR';  x.fillText(card.pos, cx0+120, cy0+232);

  // divider
  x.strokeStyle='rgba(22,18,15,.35)'; x.lineWidth=3;
  x.beginPath(); x.moveTo(cx0+50, cy0+300); x.lineTo(cx0+cw-50, cy0+300); x.stroke();

  // name (auto-fit), country + year
  let ns=92; x.font=`400 ${ns}px AntonR`; while(x.measureText(card.name).width>cw-80 && ns>40){ ns-=2; x.font=`400 ${ns}px AntonR`; }
  x.fillStyle=ink; x.fillText(card.name, CX, cy0+400);
  x.font='900 40px ArchivoBlack'; x.fillStyle='#3a2c08';
  x.fillText(`${card.country} · ${card.year}`, CX, cy0+470);

  // little "WORLD CUP LEGEND" tag inside the card
  x.font='900 26px ArchivoBlack'; x.fillStyle='rgba(22,18,15,.55)';
  x.fillText('—  WORLD CUP LEGEND  —', CX, cy0+540);

  footer(x,CX,H-58,1.0);
  fs.writeFileSync('marketing/ig-spotlight.png', c.toBuffer('image/png'));
  console.log('wrote marketing/ig-spotlight.png');
})();

// ----------------------------------------------------------------------------
// 5) CHALLENGE A FRIEND  1080×1080 — head-to-head Friendlies promo.
// ----------------------------------------------------------------------------
(function challenge(){
  const W=1080,H=1080,CX=W/2; const c=createCanvas(W,H),x=c.getContext('2d');
  background(x,W,H);
  wordmark(x,CX,250,104);
  pill(x,CX,280,28,24,54);

  // headline
  x.textAlign='center'; x.save(); x.shadowColor='rgba(0,0,0,.4)'; x.shadowBlur=10; x.shadowOffsetY=3;
  x.fillStyle=cream; x.font='400 108px AntonR'; x.fillText('CHALLENGE', CX, 470);
  x.fillStyle=gold;  x.fillText('A FRIEND', CX, 580);
  x.restore();

  // VS medallion row
  function team(cx,label,col){
    x.fillStyle=ink; x.beginPath(); x.arc(cx+6,646,66,0,Math.PI*2); x.fill();
    x.fillStyle=col; x.beginPath(); x.arc(cx,640,66,0,Math.PI*2); x.fill();
    x.lineWidth=5; x.strokeStyle=ink; x.stroke();
    x.fillStyle='#fff'; x.font='900 30px ArchivoBlack'; x.textAlign='center'; x.fillText(label,cx,650);
  }
  team(CX-150,'YOU','#1Fa34f');
  x.fillStyle=gold; x.font='400 72px AntonR'; x.fillText('VS', CX, 662);
  team(CX+150,'THEM','#E5402A');

  // subline
  x.fillStyle='rgba(253,246,227,.92)'; x.font='700 34px ArchivoBold';
  x.fillText('Build your squads. Simulate the match.', CX, 770);
  x.fillText('Winner takes the group-chat bragging rights.', CX, 814);

  footer(x,CX,H-58,1.0);
  fs.writeFileSync('marketing/ig-challenge.png', c.toBuffer('image/png'));
  console.log('wrote marketing/ig-challenge.png');
})();

// Position → accent color (used by the card grid + pitch mockup).
const POS_COL={ GK:'#F4B413', DEF:'#2f7de5', MID:'#1Fa34f', FWD:'#E5402A' };

// One compact gold rating card. Scales its inner type to the card width.
function miniCard(x,cx0,cy0,cw,chh,p){
  x.save(); x.shadowColor='rgba(0,0,0,.45)'; x.shadowBlur=24; x.shadowOffsetY=10;
  const pg=x.createLinearGradient(0,cy0,0,cy0+chh); pg.addColorStop(0,'#FCEFA8'); pg.addColorStop(.5,'#F4B413'); pg.addColorStop(1,'#D89A0C');
  rrect(x,cx0,cy0,cw,chh,26); x.fillStyle=pg; x.fill(); x.restore();
  x.lineWidth=4; x.strokeStyle=ink; rrect(x,cx0,cy0,cw,chh,26); x.stroke();
  // OVR + pos chip, top-left
  x.textAlign='left'; x.fillStyle=ink; x.font='400 96px AntonR'; x.fillText(p.ovr, cx0+30, cy0+108);
  // position pill
  const pcol=POS_COL[p.pos]||ink; x.font='900 24px ArchivoBlack';
  const pw=x.measureText(p.pos).width+28; rrect(x,cx0+34,cy0+126,pw,38,12); x.fillStyle=pcol; x.fill();
  x.fillStyle='#fff'; x.textAlign='center'; x.fillText(p.pos, cx0+34+pw/2, cy0+152);
  // divider
  x.strokeStyle='rgba(22,18,15,.3)'; x.lineWidth=2; x.beginPath(); x.moveTo(cx0+30,cy0+184); x.lineTo(cx0+cw-30,cy0+184); x.stroke();
  // name (auto-fit), country · year
  x.textAlign='center'; x.fillStyle=ink;
  let ns=46; x.font=`400 ${ns}px AntonR`; while(x.measureText(p.name).width>cw-44 && ns>22){ ns-=1; x.font=`400 ${ns}px AntonR`; }
  x.fillText(p.name, cx0+cw/2, cy0+236);
  x.font='900 24px ArchivoBlack'; x.fillStyle='#3a2c08'; x.fillText(`${p.country} · ${p.year}`, cx0+cw/2, cy0+272);
}

// ----------------------------------------------------------------------------
// 6) LEGEND CARD GRID  1080×1350 — six of the most iconic names ever.
// ----------------------------------------------------------------------------
(function legends(){
  const cards=[
    { name:'PELÉ',     country:'BRAZIL',    year:'1970', ovr:'99', pos:'FWD' },
    { name:'MARADONA', country:'ARGENTINA', year:'1986', ovr:'99', pos:'MID' },
    { name:'MESSI',    country:'ARGENTINA', year:'2022', ovr:'99', pos:'FWD' },
    { name:'RONALDO',  country:'BRAZIL',    year:'2002', ovr:'99', pos:'FWD' },
    { name:'MBAPPÉ',   country:'FRANCE',    year:'2022', ovr:'99', pos:'FWD' },
    { name:'C. RONALDO',country:'PORTUGAL', year:'2018', ovr:'96', pos:'FWD' },
  ];
  const W=1080,H=1350,CX=W/2; const c=createCanvas(W,H),x=c.getContext('2d');
  background(x,W,H);
  wordmark(x,CX,150,66);
  x.textAlign='center'; x.fillStyle=gold; x.font='400 70px AntonR'; x.fillText('DRAFT THE GREATS', CX, 244);
  // 2 × 3 grid
  const mx=60, gap=40, cw=(W-mx*2-gap)/2, chh=288, gy0=300, rowGap=34;
  cards.forEach((p,i)=>{
    const col=i%2, row=(i/2|0);
    const cx0=mx+col*(cw+gap), cy0=gy0+row*(chh+rowGap);
    miniCard(x,cx0,cy0,cw,chh,p);
  });
  footer(x,CX,H-44,1.0);
  fs.writeFileSync('marketing/ig-legends.png', c.toBuffer('image/png'));
  console.log('wrote marketing/ig-legends.png');
})();

// ----------------------------------------------------------------------------
// 7) DREAM TEAM MOCKUP  1080×1350 — an all-time XI on a pitch (4-3-3).
// ----------------------------------------------------------------------------
(function dreamteam(){
  const W=1080,H=1350,CX=W/2; const c=createCanvas(W,H),x=c.getContext('2d');
  background(x,W,H);
  wordmark(x,CX,140,62);
  x.textAlign='center'; x.fillStyle=gold; x.font='400 64px AntonR'; x.fillText('YOUR DREAM SQUAD', CX, 226);

  // ---- pitch ----
  const px0=60,py0=270,pw=W-120,ph=940;
  // turf with stripes
  const turf=x.createLinearGradient(0,py0,0,py0+ph); turf.addColorStop(0,'#157a3e'); turf.addColorStop(1,'#0f5e30');
  rrect(x,px0,py0,pw,ph,28); x.fillStyle=turf; x.fill();
  x.save(); rrect(x,px0,py0,pw,ph,28); x.clip();
  for(let i=0;i<8;i++){ if(i%2){ x.fillStyle='rgba(255,255,255,.04)'; x.fillRect(px0,py0+i*ph/8,pw,ph/8); } }
  x.restore();
  x.lineWidth=3; x.strokeStyle='rgba(255,255,255,.55)'; rrect(x,px0,py0,pw,ph,28); x.stroke();
  // markings: halfway line + center circle + penalty boxes
  x.beginPath(); x.moveTo(px0,py0+ph/2); x.lineTo(px0+pw,py0+ph/2); x.stroke();
  x.beginPath(); x.arc(CX,py0+ph/2,70,0,Math.PI*2); x.stroke();
  x.strokeRect(CX-150,py0,300,120);           // top box
  x.strokeRect(CX-150,py0+ph-120,300,120);     // bottom box

  // ---- player node ----
  function node(cx,cy,p){
    const r=42, col=POS_COL[p.pos]||ink;
    x.fillStyle='rgba(0,0,0,.35)'; x.beginPath(); x.arc(cx+4,cy+5,r,0,Math.PI*2); x.fill();
    x.fillStyle=col; x.beginPath(); x.arc(cx,cy,r,0,Math.PI*2); x.fill();
    x.lineWidth=4; x.strokeStyle='#fff'; x.stroke();
    x.fillStyle='#fff'; x.font='400 40px AntonR'; x.textAlign='center'; x.fillText(p.ovr,cx,cy+14);
    // name plate
    x.font='900 26px ArchivoBlack'; const nm=p.name.toUpperCase();
    const nw=x.measureText(nm).width+24; const ny=cy+r+10;
    rrect(x,cx-nw/2,ny,nw,38,10); x.fillStyle='rgba(11,19,36,.9)'; x.fill();
    x.fillStyle=cream; x.fillText(nm,cx,ny+27);
  }
  // lines from top (FWD) to bottom (GK)
  const line=(y,arr)=>{ const n=arr.length; arr.forEach((p,i)=>{ const cx=px0+pw*(i+1)/(n+1); node(cx,y,p); }); };
  line(py0+120, [
    {name:'Messi',ovr:'99',pos:'FWD'},{name:'Pelé',ovr:'99',pos:'FWD'},{name:'Ronaldo',ovr:'99',pos:'FWD'} ]);
  line(py0+360, [
    {name:'Zidane',ovr:'99',pos:'MID'},{name:'Maradona',ovr:'99',pos:'MID'},{name:'Xavi',ovr:'92',pos:'MID'} ]);
  line(py0+600, [
    {name:'Cafu',ovr:'92',pos:'DEF'},{name:'Beckenbauer',ovr:'99',pos:'DEF'},{name:'Maldini',ovr:'93',pos:'DEF'},{name:'R. Carlos',ovr:'92',pos:'DEF'} ]);
  line(py0+820, [ {name:'Yashin',ovr:'93',pos:'GK'} ]);

  footer(x,CX,H-44,1.0);
  fs.writeFileSync('marketing/ig-team.png', c.toBuffer('image/png'));
  console.log('wrote marketing/ig-team.png');
})();
