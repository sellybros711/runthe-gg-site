// Generate og-challenge.png (1200×630) — challenge-specific link-preview card.
// Mirrors scripts/og-image.html's dark hero aesthetic, with challenge copy.
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');

GlobalFonts.registerFromPath('/tmp/fonts/Anton-Regular.ttf', 'AntonR');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-Black.ttf', 'ArchivoBlack');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-SemiBold.ttf', 'ArchivoSemi');

const W=1200, H=630, CX=W/2;
const c=createCanvas(W,H), x=c.getContext('2d');
const ink='#16120F', cream='#FDF6E3', teal='#138A6B', gold='#F4B413';

// ---- background: dark navy + gold glow (top) + teal glow (bottom) ----
x.fillStyle='#0b1324'; x.fillRect(0,0,W,H);
let g=x.createRadialGradient(CX,210,40,CX,210,620);
g.addColorStop(0,'rgba(244,180,19,0.34)'); g.addColorStop(.45,'rgba(244,180,19,0.12)'); g.addColorStop(1,'rgba(244,180,19,0)');
x.fillStyle=g; x.fillRect(0,0,W,H);
g=x.createRadialGradient(CX,H+40,80,CX,H+40,760);
g.addColorStop(0,'rgba(19,138,107,0.30)'); g.addColorStop(1,'rgba(19,138,107,0)');
x.fillStyle=g; x.fillRect(0,0,W,H);

// ---- subtle pitch markings near the bottom ----
x.save();
x.strokeStyle='rgba(47,214,115,0.16)'; x.lineWidth=2.5;
x.beginPath(); x.moveTo(0,582); x.lineTo(W,582); x.stroke();
x.beginPath(); x.ellipse(CX,582,150,28,0,Math.PI,0,true); x.stroke();
x.restore();

// ---- gold top accent stripe ----
const stripe=x.createLinearGradient(0,0,W,0);
stripe.addColorStop(0,'#9C6C18'); stripe.addColorStop(.32,'#F4B413'); stripe.addColorStop(.5,'#FCEFA8'); stripe.addColorStop(.68,'#F4B413'); stripe.addColorStop(1,'#9C6C18');
x.fillStyle=stripe; x.fillRect(0,0,W,14);

// ---- wordmark: RUN (cream) · THE (teal) · PITCH (cream) ----
x.textBaseline='alphabetic';
x.font='400 122px AntonR';
const seg=[['RUN',cream],['THE',teal],['PITCH',cream]];
let tot=0; for(const [t] of seg) tot+=x.measureText(t).width;
let lx=CX-tot/2; const baseY=200;
x.save(); x.shadowColor='rgba(0,0,0,.45)'; x.shadowBlur=14; x.shadowOffsetY=5; x.textAlign='left';
for(const [t,col] of seg){ x.fillStyle=col; x.fillText(t,lx,baseY); lx+=x.measureText(t).width; }
x.restore();

// ---- "WORLD CUP GAME" gold pill ----
x.textAlign='left';
x.font='900 26px ArchivoBlack'; const pill='WORLD CUP GAME'; const sp=6;
let pw=0; for(const ch of pill) pw+=x.measureText(ch).width+sp; pw-=sp;
const ph=50, pwBox=pw+44, px0=CX-pwBox/2, py0=224;
const pg=x.createLinearGradient(0,py0,0,py0+ph); pg.addColorStop(0,'#FCEFA8'); pg.addColorStop(1,'#F4B413');
const r=13;
x.beginPath();
x.moveTo(px0+r,py0); x.arcTo(px0+pwBox,py0,px0+pwBox,py0+ph,r); x.arcTo(px0+pwBox,py0+ph,px0,py0+ph,r);
x.arcTo(px0,py0+ph,px0,py0,r); x.arcTo(px0,py0,px0+pwBox,py0,r); x.closePath();
x.fillStyle=pg; x.fill(); x.lineWidth=3; x.strokeStyle=ink; x.stroke();
x.fillStyle=ink; let wx=px0+22; for(const ch of pill){ x.fillText(ch,wx,py0+34); wx+=x.measureText(ch).width+sp; }

// ---- main headline (two lines), auto-fit to width ----
function fitFont(text, family, start, maxW){
  let s=start; x.font=`400 ${s}px ${family}`;
  while(x.measureText(text).width>maxW && s>20){ s-=1; x.font=`400 ${s}px ${family}`; }
  return s;
}
x.textAlign='center';
x.save(); x.shadowColor='rgba(0,0,0,.4)'; x.shadowBlur=8; x.shadowOffsetY=3;
x.fillStyle=cream;
const L1="YOU'VE BEEN CHALLENGED", L2='TO A FRIENDLY';
let s1=fitFont(L1,'AntonR',70,1080); x.font=`400 ${s1}px AntonR`; x.fillText(L1, CX, 360);
let s2=fitFont(L2,'AntonR',70,1080); x.font=`400 ${s2}px AntonR`; x.fillText(L2, CX, 428);
x.restore();

// ---- call to action: a drawn play-triangle + "CLICK TO ACCEPT" (gold) ----
x.font='900 36px ArchivoBlack'; x.fillStyle=gold;
const cta='CLICK TO ACCEPT';
x.textAlign='left';
const ctaW=x.measureText(cta).width, triW=26, gap=16;
const groupW=triW+gap+ctaW, gx=CX-groupW/2, ctaY=498;
x.save(); x.shadowColor='rgba(0,0,0,.35)'; x.shadowBlur=6; x.shadowOffsetY=2;
// play triangle
x.beginPath(); x.moveTo(gx, ctaY-28); x.lineTo(gx+triW, ctaY-14); x.lineTo(gx, ctaY); x.closePath();
x.fillStyle=gold; x.fill();
x.fillStyle=gold; x.fillText(cta, gx+triW+gap, ctaY);
x.restore();
x.textAlign='center';

// ---- URL at the bottom ----
x.font='900 30px ArchivoBlack'; x.fillStyle=gold;
const url='runthe.gg', usp=3;
let uw=0; for(const ch of url) uw+=x.measureText(ch).width+usp; uw-=usp;
let ux=CX-uw/2; x.textAlign='left';
for(const ch of url){ x.fillText(ch,ux,602); ux+=x.measureText(ch).width+usp; }

fs.writeFileSync('og-challenge.png', c.toBuffer('image/png'));
console.log('wrote og-challenge.png', fs.statSync('og-challenge.png').size, 'bytes');
