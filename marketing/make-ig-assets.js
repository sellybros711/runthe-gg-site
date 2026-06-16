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
  for(const ch of kick){ x.fillText(ch,kx,cy-46*s); kx+=x.measureText(ch).width+ksp; }
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
  x.fillText('SPIN. PICK.', CX, 560);
  x.fillStyle=gold; x.fillText('CONQUER.', CX, 668);
  x.restore();
  // subline
  x.fillStyle='rgba(253,246,227,.92)'; x.font='700 34px ArchivoBold';
  x.fillText('Draft a squad from 60+ years of World Cup', CX, 748);
  x.fillText('legends — then simulate your run to glory.', CX, 792);
  // two CTAs
  ctaButton(x,CX-262,840,490,118,'#1Fa34f','FRIENDLIES','CHALLENGE A FRIEND');
  ctaButton(x,CX+262,840,490,118,'#E5402A','SOLO DRAFT','SIMULATE A WORLD CUP');
  // url
  footer(x,CX,H-46,1.0);
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
  x.fillText('BUILD YOUR', CX, 860);
  x.fillText('DREAM', CX, 1000);
  x.fillStyle=gold; x.fillText('WORLD CUP', CX, 1140);
  x.fillStyle=cream; x.fillText('SQUAD', CX, 1280);
  x.restore();
  x.fillStyle='rgba(253,246,227,.9)'; x.font='700 40px ArchivoBold';
  x.fillText('Spin a year & nation. Draft legends.', CX, 1380);
  x.fillText('Challenge a friend head-to-head.', CX, 1432);
  // single CTA
  ctaButton(x,CX,1540,720,150,'#1Fa34f','PLAY FREE','NO APP · JUST TAP');
  footer(x,CX,1810,1.25);
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
