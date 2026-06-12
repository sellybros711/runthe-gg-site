// Preview mock (NOT deployed) of the proposed home-screen copy: rules 3 & 4,
// the tagline, and the two CTA buttons.
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
GlobalFonts.registerFromPath('/tmp/fonts/Anton-Regular.ttf', 'AntonR');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-Black.ttf', 'ArchivoBlack');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-Bold.ttf', 'ArchivoBold');
GlobalFonts.registerFromPath('/tmp/fonts/Archivo-SemiBold.ttf', 'ArchivoSemi');

const W=960, H=900, x=createCanvas(W,H).getContext('2d');
const c=x.canvas;
const cream='#FDF6E3', ink='#16120F', gold='#F4B413';

let bg=x.createLinearGradient(0,0,0,H);
bg.addColorStop(0,'#0b1324'); bg.addColorStop(.55,'#102b2a'); bg.addColorStop(1,'#13532f');
x.fillStyle=bg; x.fillRect(0,0,W,H);
function rrect(X,Y,WD,HT,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+WD,Y,X+WD,Y+HT,r); x.arcTo(X+WD,Y+HT,X,Y+HT,r); x.arcTo(X,Y+HT,X,Y,r); x.arcTo(X,Y,X+WD,Y,r); x.closePath(); }

// ---- tagline ----
x.textAlign='center';
(function(){
  const parts=[{t:'Build your squad of footballers from '},{t:'over 60 years',bold:true},{t:' of World Cup legends'}];
  // line 1 + line 2 wrap manually
  x.font='700 28px ArchivoBold'; x.fillStyle=cream;
  x.fillText('Build your squad of footballers from', W/2, 58);
  let l2a='over 60 years', l2b=' of World Cup legends';
  x.font='900 28px ArchivoBlack'; const aw=x.measureText(l2a).width;
  x.font='700 28px ArchivoBold'; const bw2=x.measureText(l2b).width;
  let lx=W/2-(aw+bw2)/2; x.textAlign='left';
  x.font='900 28px ArchivoBlack'; x.fillStyle=gold; x.fillText(l2a,lx,96); lx+=aw;
  x.font='700 28px ArchivoBold'; x.fillStyle=cream; x.fillText(l2b,lx,96);
  x.textAlign='center';
})();

// ---- rules card ----
const cardX=60, cardY=130, cardW=W-120, cardH=440;
x.fillStyle='rgba(8,14,26,.55)'; rrect(cardX,cardY,cardW,cardH,22); x.fill();
x.lineWidth=2; x.strokeStyle='rgba(244,180,19,.45)'; rrect(cardX,cardY,cardW,cardH,22); x.stroke();

const rules=[
  [{t:'Spin a random year & nation.'}],
  [{t:'Draft a player to fill your starting VI: GK · DEF · DEF · MID · FWD · FLEX.'}],
  [{t:'Repeat until you complete your squad.',hl:true}],
  [{t:'Simulate a World Cup against historic squads to lift the trophy — or challenge a friend to a Friendly.',hl:true}],
];
function wrap(text, font, maxW){
  x.font=font; const words=text.split(' '); const lines=[]; let cur='';
  for(const w of words){ const t=cur?cur+' '+w:w; if(x.measureText(t).width>maxW && cur){ lines.push(cur); cur=w; } else cur=t; }
  if(cur) lines.push(cur); return lines;
}
let ry=cardY+58;
rules.forEach((r,i)=>{
  // gold number circle
  x.fillStyle=gold; x.beginPath(); x.arc(cardX+50, ry-6, 24, 0, Math.PI*2); x.fill();
  x.lineWidth=3; x.strokeStyle=ink; x.stroke();
  x.fillStyle=ink; x.font='400 28px AntonR'; x.textAlign='center'; x.fillText(String(i+1), cardX+50, ry+4);
  // text (wrapped)
  x.textAlign='left';
  const font='700 23px ArchivoBold';
  const lines=wrap(r[0].t, font, cardW-150);
  x.font=font; x.fillStyle = r[0].hl ? '#FFE9A8' : cream;
  lines.forEach((ln,li)=>{ x.fillText(ln, cardX+92, ry+li*30); });
  ry += Math.max(70, lines.length*30+34);
});

// ---- CTA buttons ----
function button(bx, by, bw, bh, fill, label, sub){
  x.fillStyle=ink; rrect(bx+7,by+7,bw,bh,16); x.fill();
  x.fillStyle=fill; rrect(bx,by,bw,bh,16); x.fill();
  x.lineWidth=4; x.strokeStyle=ink; rrect(bx,by,bw,bh,16); x.stroke();
  x.textAlign='center';
  x.fillStyle='#fff'; x.font='400 40px AntonR'; x.fillText(label, bx+bw/2, by+bh/2+2);
  x.fillStyle='rgba(255,255,255,.92)'; x.font='900 15px ArchivoBlack';
  x.fillText(sub, bx+bw/2, by+bh/2+30);
}
const gap=28, bw=(W-120-gap)/2, bh=120, by=620;
button(60, by, bw, bh, '#1Fa34f', 'FRIENDLIES', 'CHALLENGE A FRIEND');
button(60+bw+gap, by, bw, bh, '#E5402A', 'SOLO DRAFT', 'ORIGINAL WORLD CUP SIMULATOR');

x.textAlign='center'; x.fillStyle='rgba(255,255,255,.5)'; x.font='700 17px ArchivoBold';
x.fillText('— proposed (preview only, not live) —', W/2, 800);

fs.writeFileSync('/tmp/preview-home.png', c.toBuffer('image/png'));
console.log('ok');
