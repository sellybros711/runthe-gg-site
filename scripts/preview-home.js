// Preview mock (NOT deployed) of the proposed home-screen tagline + CTA buttons.
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
GlobalFonts.registerFromPath('/tmp/fonts/Anton-Regular.ttf', 'AntonR');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-Black.ttf', 'ArchivoBlack');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-Bold.ttf', 'ArchivoBold');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-SemiBold.ttf', 'ArchivoSemi');

const W=960, H=560, x=createCanvas(W,H).getContext('2d');
const c=x.canvas;
const cream='#FDF6E3', ink='#16120F', gold='#F4B413';

// background: dark navy → pitch green (mirrors the hero)
let bg=x.createLinearGradient(0,0,0,H);
bg.addColorStop(0,'#0b1324'); bg.addColorStop(.5,'#102b2a'); bg.addColorStop(1,'#13532f');
x.fillStyle=bg; x.fillRect(0,0,W,H);

function rrect(X,Y,WD,HT,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+WD,Y,X+WD,Y+HT,r); x.arcTo(X+WD,Y+HT,X,Y+HT,r); x.arcTo(X,Y+HT,X,Y,r); x.arcTo(X,Y,X+WD,Y,r); x.closePath(); }

// ---- tagline (two lines, Archivo) with 'over 60 years' bolded ----
x.textAlign='center'; x.fillStyle=cream;
function lineMixed(parts, y, size){
  // parts: [{t, bold}]; draw centered as one line
  let total=0;
  for(const p of parts){ x.font=`${p.bold?'900':'700'} ${size}px ${p.bold?'ArchivoBlack':'ArchivoBold'}`; total+=x.measureText(p.t).width; }
  let lx=W/2-total/2; x.textAlign='left';
  for(const p of parts){ x.font=`${p.bold?'900':'700'} ${size}px ${p.bold?'ArchivoBlack':'ArchivoBold'}`; x.fillStyle=p.bold?gold:cream; x.fillText(p.t,lx,y); lx+=x.measureText(p.t).width; }
  x.textAlign='center';
}
lineMixed([{t:'Build your squad of footballers from '}], 90, 30);
lineMixed([{t:'over 60 years',bold:true},{t:' of World Cup legends'}], 132, 30);

// ---- CTA buttons (green FRIENDLIES, red SOLO DRAFT) ----
function button(bx, by, bw, bh, fill, label, sub){
  // shadow
  x.fillStyle=ink; rrect(bx+7,by+7,bw,bh,16); x.fill();
  // body + ink border
  x.fillStyle=fill; rrect(bx,by,bw,bh,16); x.fill();
  x.lineWidth=4; x.strokeStyle=ink; rrect(bx,by,bw,bh,16); x.stroke();
  // label (Anton) + sub (Archivo)
  x.textAlign='center';
  x.fillStyle='#fff'; x.font='400 42px AntonR';
  x.fillText(label, bx+bw/2, by+bh/2+4);
  x.fillStyle='rgba(255,255,255,.92)'; x.font='900 16px ArchivoBlack';
  let s=sub, sw=x.measureText(s).width;
  while(sw>bw-30 && s.length>4){ s=s.slice(0,-1); sw=x.measureText(s+'…').width; }
  if(s!==sub) s+='…';
  x.fillText(s, bx+bw/2, by+bh/2+34);
}
const gap=28, bw=(W-120-gap)/2, bh=140, by=250;
button(60, by, bw, bh, '#1Fa34f', 'FRIENDLIES', 'CHALLENGE A FRIEND');
button(60+bw+gap, by, bw, bh, '#E5402A', 'SOLO DRAFT', 'ORIGINAL WORLD CUP SIMULATOR');

// ---- labels: old vs new note ----
x.textAlign='center'; x.fillStyle='rgba(255,255,255,.55)'; x.font='700 18px ArchivoBold';
x.fillText('— proposed (preview only, not live) —', W/2, 470);
x.fillStyle='rgba(255,255,255,.45)'; x.font='600 15px ArchivoSemi';
x.fillText('red button:  DRAFT NOW → SOLO DRAFT   ·   "World Cup Simulator" → "Original World Cup Simulator"', W/2, 506);

fs.writeFileSync('/tmp/preview-home.png', c.toBuffer('image/png'));
console.log('ok');
