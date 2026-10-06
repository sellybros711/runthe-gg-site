/* THE TOUR MAP'S LAND. Each world on the level map is one continuous place of its own theme, drawn
   into a single pixel buffer so the ground, the trail, the water, the trees and the buildings share
   one light and one grid: a haunted pine wood with a river and a chapel, a snowed-in pine valley,
   a beach with the sea along one side, a clubhouse lawn, a tournament park. Owner's rule: a built
   place, never a scatter of stickers and never a picture of a hole cropped and faded.

   It decides nothing. putt.js hands it the band's size and the trail through the badges, and gets a
   canvas back. One cell is two CSS pixels; the page shows it pixelated at exactly 2x.

   Wrapped in an IIFE: a plain script's top-level function is a global, and this page already has
   a render() that a stray declaration here would replace. */
(function(){
'use strict';
var hex = function(h){ return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; };
var mix = function(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; };
function hash(x,y,s){ var h=(x*374761393+y*668265263+s*982451653)|0; h=Math.imul(h^h>>>13,1274126177); return ((h^h>>>16)>>>0)/4294967296; }
function vn(x,y,s){ var xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  var a=hash(xi,yi,s),b=hash(xi+1,yi,s),c=hash(xi,yi+1,s),d=hash(xi+1,yi+1,s); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
function fbm(x,y,s){ return vn(x,y,s)*.55+vn(x*2.1,y*2.1,s+7)*.3+vn(x*4.3,y*4.3,s+13)*.15; }
var BAY=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(function(v){ return (v+.5)/16; });
function bay(x,y){ return BAY[(y&3)*4+(x&3)]; }

function Px(w,h){
  var c=document.createElement('canvas'); c.width=w; c.height=h; var ctx=c.getContext('2d'), im=ctx.createImageData(w,h), D=im.data;
  var P={ c:c, w:w, h:h,
    set:function(x,y,col){ x|=0; y|=0; if(x<0||y<0||x>=w||y>=h)return; var o=(y*w+x)*4; D[o]=col[0]; D[o+1]=col[1]; D[o+2]=col[2]; D[o+3]=255; },
    get:function(x,y){ x|=0; y|=0; if(x<0||y<0||x>=w||y>=h)return [0,0,0]; var o=(y*w+x)*4; return [D[o],D[o+1],D[o+2]]; },
    shade:function(x,y,f){ x|=0; y|=0; if(x<0||y<0||x>=w||y>=h)return; var o=(y*w+x)*4; D[o]*=f; D[o+1]*=f; D[o+2]*=f; },
    tint:function(x,y,col,t){ P.set(x,y,mix(P.get(x,y),col,t)); },
    rect:function(x0,y0,x1,y1,fn){ for(var y=Math.round(y0);y<Math.round(y1);y++)for(var x=Math.round(x0);x<Math.round(x1);x++)fn(x,y); },
    ell:function(cx,cy,rx,ry,fn){ for(var y=Math.floor(cy-ry);y<=cy+ry;y++)for(var x=Math.floor(cx-rx);x<=cx+rx;x++){ var dx=(x+.5-cx)/rx,dy=(y+.5-cy)/ry; if(dx*dx+dy*dy<=1)fn(x,y,dx,dy); } },
    flush:function(){ ctx.putImageData(im,0,0); return c; } };
  return P;
}

/* the palettes. Ground runs dark to light in four steps, dithered */
var PAL={
  clubhouse:{ g:['#5f9e45','#6cae4f','#79bb58','#86c663'], sp:[['#f6e8a8',.008],['#ffffff',.006]], tree:'round', leaf:['#24552a','#2f6d33','#3f8a3e','#5aa84c'], trunk:'#5a3d26', path:['#d9caa0','#e6d9b4'], water:['#2e6f9e','#3e86b8','#5aa3d3','#cfeaf7'], shadow:.62 },
  haunted:{ g:['#24223a','#2b2843','#322e4c','#3a3556'], sp:[['#4f4868',.03],['#5d3a5a',.008]], tree:'dead', leaf:['#0f1519','#172126','#22313a','#2f4249'], trunk:'#1a1418', path:['#6e6185','#82749a'], water:['#1f4a4a','#2a6058','#3a7a68','#7fb59a'], shadow:.55, fog:'#8a6fb8' },
  winter:{ g:['#d4e1ee','#dde8f3','#e7eff8','#f3f7fc'], sp:[['#c2d0e0',.02],['#ffffff',.02]], tree:'pine', leaf:['#173d30','#21503e','#2c644d','#3b7a5c'], snow:'#f6f9fd', trunk:'#4a3626', path:['#a9b9ca','#bccad8'], water:['#8cc0e2','#a3cdea','#c0def3','#eaf5fc'], shadow:.72 },
  beach:{ g:['#e2c47c','#eacf8c','#f1da9c','#f6e5b6'], sp:[['#fff6dc',.02],['#c9a964',.012]], tree:'palm', leaf:['#256b31','#2f8139','#3f9a46','#5bb352'], trunk:'#8a6a3e', path:['#8f6539','#a8794a'], water:['#165f86','#1f7aa6','#2e95c2','#55b6db'], shadow:.7 },
  tour:{ g:['#3f7f37','#468a3c','#4f9643','#59a24a'], sp:[['#e9f0c0',.004]], tree:'round', leaf:['#1d4a24','#265c2c','#327236','#428a41'], trunk:'#4a3220', path:['#c7b88f','#d6c8a0'], water:['#2b6a95','#357fae','#4d97c6','#cfe8f5'], shadow:.62 },
  temple:{ g:['#2f6a32','#377a39','#3f8a40','#4a9a48'], sp:[['#7fb04a',.01],['#e8d27a',.004]], tree:'round', leaf:['#123f1c','#1b5426','#266b31','#3a8a3e'], trunk:'#4a3220', path:['#a69c72','#b9ae84'], water:['#1f6a5a','#2a8270','#3fa088','#a8e0c8'], shadow:.6 },
  pirate:{ g:['#d9bb72','#e2c47c','#eacf8c','#f1da9c'], sp:[['#fff6dc',.02],['#b8954e',.012]], tree:'palm', leaf:['#256b31','#2f8139','#3f9a46','#5bb352'], trunk:'#8a6a3e', path:['#9a6a3e','#ae7c4c'], water:['#0f4f74','#176890','#2584ad','#4aa6cf'], shadow:.7 },
  canyon:{ g:['#c98a52','#d49860','#dca66e','#e3b47e'], sp:[['#a6562e',.02],['#f0cf9c',.01]], tree:'cactus', leaf:['#2f5a2a','#3a6e33','#4a8540','#5f9c50'], trunk:'#6a4a2a', path:['#9e6b40','#b07c4e'], water:['#3a6e8a','#4a86a2','#64a0bb','#cde6f0'], shadow:.66 },
  volcano:{ g:['#2a272c','#323036','#3b383f','#45414a'], sp:[['#5a1e14',.02],['#7a6e66',.012]], tree:'palm', leaf:['#1e4a26','#26602f','#317a3a','#46944a'], trunk:'#5a3d26', path:['#5a5258','#6a6268'], water:['#b0300c','#d84a14','#ff7a1a','#ffd25a'], shadow:.6 },
  harvest:{ g:['#8a7a3a','#9a8a44','#a8984e','#b5a65a'], sp:[['#d07a2a',.012],['#5a3818',.01]], tree:'round', leaf:['#7a2e10','#a8461a','#d06a22','#e8a03a'], trunk:'#3a2416', path:['#c4a46a','#d4b47a'], water:['#2e5a6e','#3a7088','#4f88a0','#c6dde6'], shadow:.6, fog:'#e8a03a' }
};

function ground(P,th,seed){
  var g=th.g.map(hex), x, y;
  for(y=0;y<P.h;y++)for(x=0;x<P.w;x++){
    var n=fbm(x*.05,y*.05,seed)+(fbm(x*.22,y*.22,seed+3)-.5)*.25;
    var v=Math.max(0,Math.min(.999,(n-.18)*1.55))*3, i=Math.floor(v), f=v-i;
    P.set(x,y,g[Math.min(3,i+(f>bay(x,y)?1:0))]);
  }
  th.sp.forEach(function(s){ var col=hex(s[0]); for(y=0;y<P.h;y++)for(x=0;x<P.w;x++)if(hash(x,y,seed+99+s[1]*1e4)<s[1])P.set(x,y,col); });
}
function water(P,th,fn,seed,foam){
  var c=th.water.map(hex), x, y;
  for(y=0;y<P.h;y++)for(x=0;x<P.w;x++){ var d=fn(x,y); if(d<=0)continue;
    if(d<.06){ P.set(x,y,foam?[255,255,255]:c[3]); continue; }
    var v=Math.min(.999,d)*2.9, i=Math.floor(v), f=v-i, col=c[2-Math.min(2,i+(f>bay(x,y)?1:0))];
    if(hash(x>>1,y,seed+5)<.04&&d>.15)col=mix(col,c[3],.5);
    if(foam&&((y+Math.round(Math.sin(x*.4)*1.2))%7===0)&&d<.5)col=mix(col,[255,255,255],.45);
    P.set(x,y,col); }
  for(y=1;y<P.h-1;y++)for(x=1;x<P.w-1;x++)if(fn(x,y)<=0&&(fn(x+1,y)>0||fn(x-1,y)>0||fn(x,y+1)>0||fn(x,y-1)>0))P.shade(x,y,.8);
}
// the trail: every pixel's distance to the polyline through the badges, kept so the rest can avoid it
function trail(P,th,pts,wid,seed){
  var c=th.path.map(hex), half=wid/2, mask=new Float32Array(P.w*P.h), x, y, i;
  for(y=0;y<P.h;y++)for(x=0;x<P.w;x++){ var m=1e9, px=x+.5, py=y+.5;
    for(i=0;i<pts.length-1;i++){ var a=pts[i][0],b=pts[i][1],e=pts[i+1][0],f=pts[i+1][1],dx=e-a,dy=f-b,L=dx*dx+dy*dy;
      if(Math.min(b,f)-30>py||Math.max(b,f)+30<py)continue;
      var t=L?((px-a)*dx+(py-b)*dy)/L:0; t=Math.max(0,Math.min(1,t)); var qx=a+t*dx-px,qy=b+t*dy-py; m=Math.min(m,Math.sqrt(qx*qx+qy*qy)); }
    var d=m+(fbm(x*.3,y*.3,seed)-.5)*1.6; mask[y*P.w+x]=d;
    if(d<half)P.set(x,y,c[hash(x,y,seed)<.5+((half-d)/half)*.3?1:0]); else if(d<half+1)P.shade(x,y,.82); }
  P.pathD=function(x,y){ x|=0; y|=0; if(x<0||y<0||x>=P.w||y>=P.h)return 99; return mask[y*P.w+x]; };
}

function tree(P,th,x,y,s,seed){
  var L=th.leaf.map(hex), tr=hex(th.trunk), k=th.shadow, r, xx, yy;
  if(th.tree==='round'){
    P.ell(x+2,y+2,s*1.05,s*.7,function(a,b){ P.shade(a,b,k); });
    P.set(x,y+1,tr); P.set(x,y,tr);
    P.ell(x,y-s*.6,s,s*.9,function(a,b,dx,dy){ var l=-(dx*.7+dy*.9)+(hash(a,b,seed)-.5)*.5; P.set(a,b,L[l>.55?3:l>0?2:l>-.5?1:0]); });
  }else if(th.tree==='pine'){
    P.ell(x+2,y+1,s*.9,s*.45,function(a,b){ P.shade(a,b,k); });
    P.set(x,y,tr);
    var hgt=s*2.4, step=Math.max(2,Math.round(s*.55));
    for(r=0;r<hgt;r++){ yy=Math.round(y-1-r); var wdt=Math.max(0,(s*(1-r/hgt))*(1.05-((r%step)/(s*1.6))));
      for(xx=Math.round(x-wdt);xx<=x+wdt;xx++){ var side=(xx-x)/(wdt+.01), col=L[side<-.3?3:side<.25?2:1];
        if(th.snow&&((r%step)===0||hash(xx,yy,seed)<.12)&&side<.4)col=hex(th.snow); P.set(xx,yy,col); } }
  }else if(th.tree==='palm'){
    P.ell(x+4,y+1,s*1.2,s*.45,function(a,b){ P.shade(a,b,k); });
    var ph=Math.round(s*2); for(r=0;r<ph;r++){ xx=Math.round(x+Math.sin(r/ph*1.6)*s*.35); P.set(xx,y-r,r%2?tr:mix(tr,[0,0,0],.25)); }
    var tx=Math.round(x+Math.sin(1.6)*s*.35), ty=y-ph;
    for(var f=0;f<7;f++){ var ang=f/7*Math.PI*2+.3, len=s*1.15; for(var t=0;t<len;t++){ xx=tx+Math.cos(ang)*t; yy=ty+Math.sin(ang)*t*.55+(t*t)/(len*3.2); P.set(xx,yy,L[t<2?3:f%2?1:2]); if(t>2&&t%2)P.set(xx,yy+1,L[0]); } }
    P.set(tx,ty,hex('#7a5a2c')); P.set(tx+1,ty,hex('#7a5a2c'));
  }else if(th.tree==='cactus'){
    P.ell(x+2,y+1,s*.7,s*.3,function(a,b){ P.shade(a,b,k); });
    var ch=Math.round(s*1.8); P.rect(x-1,y-ch,x+1,y+1,function(a,b){ P.set(a,b,L[a===x-1?3:a===x?2:1]); });
    var ay=y-Math.round(ch*.55); P.rect(x-3,ay,x-1,ay+1,function(a,b){ P.set(a,b,L[1]); }); P.rect(x-3,ay-3,x-2,ay+1,function(a,b){ P.set(a,b,L[2]); });
    var by=y-Math.round(ch*.35); P.rect(x+1,by,x+3,by+1,function(a,b){ P.set(a,b,L[1]); }); P.rect(x+2,by-3,x+3,by+1,function(a,b){ P.set(a,b,L[0]); });
  }else if(th.tree==='dead'){
    P.ell(x+2,y+1,s*.8,s*.35,function(a,b){ P.shade(a,b,k); });
    var bark=hex('#120e14'), dh=Math.round(s*1.9);
    for(r=0;r<dh;r++)P.set(x+Math.round(Math.sin(r*.5+seed)*.6),y-r,bark);
    for(var bi=0;bi<4;bi++){ yy=y-dh+2+bi*Math.round(s*.35); var dir=bi%2?1:-1; for(var ti=0;ti<s*.9;ti++)P.set(x+dir*ti,yy-Math.round(ti*.6),bark); }
  }
}
// trees are drawn back to front so a stand reads as one mass
function forest(P,th,dens,seed,avoid,step,size){
  var pts=[];
  for(var gy=0;gy<P.h+step;gy+=step)for(var gx=0;gx<P.w+step;gx+=step){
    var x=gx+(hash(gx,gy,seed)-.5)*step*.9, y=gy+(hash(gy,gx,seed+1)-.5)*step*.9;
    if(dens(x,y)<hash(gx,gy,seed+2))continue; if(avoid(x,y))continue;
    pts.push([x|0,y|0,size*(.8+hash(gx,gy,seed+3)*.45)]); }
  pts.sort(function(a,b){ return a[1]-b[1]; }); pts.forEach(function(p){ tree(P,th,p[0],p[1],p[2],seed); });
}
function building(P,x,y,w,h,o){
  var wall=hex(o.wall), roof=hex(o.roof), dark=mix(wall,[0,0,0],.35);
  P.rect(x+2,y+h-1,x+w+3,y+h+2,function(a,b){ P.shade(a,b,.6); });
  P.rect(x,y+3,x+w,y+h,function(a,b){ P.set(a,b,a>x+w*.6?dark:wall); });
  for(var r=0;r<6;r++)P.rect(x-1+r*.6,y+3-r,x+w+1-r*.6,y+4-r,function(a,b){ P.set(a,b,mix(roof,[0,0,0],a>x+w*.55?.3:0)); });
  if(o.snow)P.rect(x+1,y-2,x+w,y-1,function(a,b){ P.set(a,b,hex(o.snow)); });
  P.rect(x+(w>>1)-1,y+h-4,x+(w>>1)+1,y+h,function(a,b){ P.set(a,b,mix(dark,[0,0,0],.4)); });
  if(o.win){ var wc=hex(o.win); for(var i=2;i<w-3;i+=4){ P.set(x+i,y+6,wc); P.set(x+i+1,y+6,wc); }
    if(o.glow)P.ell(x+w/2,y+h,w*.9,4,function(a,b){ P.tint(a,b,wc,.14); }); }
  if(o.spire){ P.rect(x+(w>>1)-1,y-8,x+(w>>1)+1,y-2,function(a,b){ P.set(a,b,roof); }); P.set(x+(w>>1),y-10,roof); P.set(x+(w>>1),y-9,roof); }
  if(o.flag){ var fx=x+w-3; for(var k=1;k<9;k++)P.set(fx,y-k,hex('#eeeeee')); P.rect(fx+1,y-8,fx+5,y-5,function(a,b){ P.set(a,b,hex(o.flag)); }); }
}
function graveyard(P,x,y,w,h,seed){
  var st=hex('#8d8aa0'), stD=hex('#5c5a72'), post=hex('#151018'), i, j;
  for(i=0;i<w;i++){ if(i%3===0){ P.set(x+i,y,post); P.set(x+i,y-1,post); P.set(x+i,y+h,post); P.set(x+i,y+h-1,post); } P.set(x+i,y-1+(i%3?1:0),post); P.set(x+i,y+h-1+(i%3?1:0),post); }
  for(j=0;j<h;j++)if(j%3===0){ P.set(x,y+j,post); P.set(x+w,y+j,post); }
  for(var gy=y+3;gy<y+h-2;gy+=5)for(var gx=x+3;gx<x+w-3;gx+=5){ if(hash(gx,gy,seed)<.2)continue; var lean=hash(gx,gy,seed+1)<.3?1:0;
    P.set(gx+2,gy+3,stD); P.shade(gx+3,gy+3,.6); (function(gx,gy,lean){ P.rect(gx,gy,gx+2,gy+3,function(a,b){ P.set(a+(b<gy+1?lean:0),b,a===gx?st:stD); }); })(gx,gy,lean); P.set(gx,gy-1,st); }
}
function lamp(P,x,y,night){ var p=hex('#1d1a22'); for(var r=0;r<6;r++)P.set(x,y-r,p); P.set(x-1,y-6,p); P.set(x+1,y-6,p); var l=hex('#ffd77a'); P.set(x,y-7,l);
  if(night)P.ell(x,y-6,6,6,function(a,b,dx,dy){ P.tint(a,b,l,.22*(1-Math.sqrt(dx*dx+dy*dy))); }); P.shade(x+1,y+1,.7); P.shade(x+2,y+1,.7); }
function rocks(P,x,y,s,col){ P.ell(x+1,y+1,s,s*.6,function(a,b){ P.shade(a,b,.65); }); P.ell(x,y,s,s*.7,function(a,b,dx,dy){ P.set(a,b,mix(hex(col),[0,0,0],dx+dy>.2?.35:dx+dy<-.4?-.2:0)); }); }
function green(P,x,y,rx,ry,col,flag){ // a practice green with its own pin
  P.ell(x+2,y+2,rx,ry,function(a,b){ P.shade(a,b,.75); });
  P.ell(x,y,rx,ry,function(a,b,dx,dy){ P.set(a,b,mix(hex(col),[255,255,255],(((a+b)>>2)&1)?.06:0)); });
  P.ell(x,y,1.4,1.1,function(a,b){ P.set(a,b,hex('#0b0f0c')); }); for(var r=1;r<9;r++)P.set(x,y-r,hex('#eeeeee'));
  P.rect(x+1,y-8,x+5,y-5,function(a,b){ P.set(a,b,hex(flag||'#e14a33')); });
}
function sand(P,x,y,rx,ry){ P.ell(x,y,rx,ry,function(a,b,dx,dy){ P.set(a,b,mix(hex('#ecd9a3'),[0,0,0],dx+dy>.6?.18:hash(a,b,4)<.15?.06:0)); }); }
function fog(P,col,seed,amt){ var c=hex(col); for(var y=0;y<P.h;y++)for(var x=0;x<P.w;x++){ var n=fbm(x*.04+y*.01,y*.09,seed); if(n>.5)P.tint(x,y,c,(n-.5)*amt*(bay(x,y)>.3?1:.6)); } }
// darken the far left and right, where the phone does not reach, and the seam into the next world
function edges(P,k){ for(var y=0;y<P.h;y++)for(var x=0;x<P.w;x++){ var dx=Math.abs(x/P.w-.5)*2, ey=Math.min(y,P.h-1-y); var d=Math.max(0,dx-.55)*1.6+Math.max(0,1-ey/14)*.35; if(d>0)P.shade(x,y,1-Math.min(.85,d*k)); } }

// a free spot near (x,y) for a w by h piece, clear of the trail by m cells, on the visible strip
function spot(P,x,y,w,h,m,taken){
  var best=null, bd=1e9;
  for(var yy=6;yy<P.h-h-6;yy+=2)for(var xx=P.vx0;xx<P.vx1-w;xx+=2){
    var ok=true;
    for(var sy=0;sy<=h&&ok;sy+=3)for(var sx=0;sx<=w&&ok;sx+=3)if(P.pathD(xx+sx,yy+sy)<m)ok=false;
    for(var i=0;i<taken.length&&ok;i++){ var t=taken[i]; if(xx<t[0]+t[2]+4&&xx+w+4>t[0]&&yy<t[1]+t[3]+4&&yy+h+4>t[1])ok=false; }
    if(!ok)continue; var d=(xx-x)*(xx-x)+(yy-y)*(yy-y); if(d<bd){ bd=d; best=[xx,yy]; } }
  if(best)taken.push([best[0],best[1],w,h]);
  return best;
}

/* -------------------------------------------------------------------------- the worlds */
var WORLD={};
WORLD.clubhouse=function(P,th,seed){
  var tk=[], s=spot(P,P.w*.25,P.h*.18,30,16,9,tk);
  var pond=function(x,y){ var dx=(x-P.w*.8)/26,dy=(y-P.h*.62)/18; return (1-Math.sqrt(dx*dx+dy*dy))*.8+(fbm(x*.1,y*.1,1)-.5)*.3; };
  water(P,th,function(x,y){ return P.pathD(x,y)<6?-1:pond(x,y); },1,false);
  if(s){ building(P,s[0],s[1],30,16,{ wall:'#f3eadb', roof:'#2f4a6b', win:'#cfe0f0', flag:'#e14a33' }); for(var i=0;i<4;i++)P.ell(s[0]+3+i*8,s[1]+20,2.5,1.6,function(a,b,dx,dy){ P.set(a,b,hex(dy<0?'#f4a7c0':'#3f8a3e')); }); }
  [[.2,.45],[.78,.3],[.24,.82]].forEach(function(g,i){ var p=spot(P,P.w*g[0],P.h*g[1],18,10,8,tk); if(p){ green(P,p[0]+9,p[1]+6,9,5,'#3e9a4d',['#e14a33','#f1d04a','#2b6a95'][i]); sand(P,p[0]+17,p[1]+9,3,2); } });
  var b=spot(P,P.w*.7,P.h*.85,8,4,6,tk); if(b){ P.rect(b[0],b[1],b[0]+8,b[1]+2,function(a,c){ P.set(a,c,hex('#7a5232')); }); P.rect(b[0]+1,b[1]+2,b[0]+2,b[1]+4,function(a,c){ P.set(a,c,hex('#4a3020')); }); P.rect(b[0]+6,b[1]+2,b[0]+7,b[1]+4,function(a,c){ P.set(a,c,hex('#4a3020')); }); }
  forest(P,th,function(x,y){ return x<P.vx0-4||x>P.vx1+4?.85:fbm(x*.05,y*.05,7)>.66?.55:.03; },seed+10,function(x,y){ return P.pathD(x,y)<7||pond(x,y)>-.08||P.clear(x,y,tk); },9,7);
  for(var y=10;y<P.h;y+=46){ var lx=P.pathX(y); if(lx!=null){ lamp(P,lx-7,y,0); } }
};
WORLD.haunted=function(P,th,seed){
  var tk=[], ry=P.h*.55;
  var river=function(x,y){ var cy=ry+Math.sin(x*.07)*10+fbm(x*.04,0,2)*8; return (7-Math.abs(y-cy))/7; };
  water(P,th,river,8,false);
  // a bridge where the trail crosses the river
  for(var y=0;y<P.h;y++)for(var x=0;x<P.w;x++)if(P.pathD(x,y)<4&&river(x,y)>-.3)P.set(x,y,hex((x+y)%3?'#6b4a2e':'#4f341f'));
  var g=spot(P,P.w*.25,P.h*.78,30,24,8,tk); if(g)graveyard(P,g[0],g[1],30,24,3);
  var c=spot(P,P.w*.72,P.h*.12,20,14,8,tk); if(c)building(P,c[0],c[1]+10,20,14,{ wall:'#4a4060', roof:'#221c30', win:'#ffb347', spire:1, glow:1 });
  var h=spot(P,P.w*.2,P.h*.25,14,10,8,tk); if(h)building(P,h[0],h[1],14,10,{ wall:'#5a4a5e', roof:'#2a2236', win:'#ffb347', glow:1 });
  var pines=Object.assign({},th,{ tree:'pine', snow:null }), near=function(x,y){ return P.pathD(x,y)<9; };
  forest(P,pines,function(x,y){ var n=fbm(x*.045,y*.045,12); return n>.58?.8:x<P.vx0-4||x>P.vx1+4?.9:.03; },seed+11,function(x,y){ return near(x,y)||river(x,y)>-.2||P.clear(x,y,tk); },7,6);
  forest(P,th,function(){ return .18; },seed+13,function(x,y){ return near(x,y)||river(x,y)>-.2||P.clear(x,y,tk); },13,6);
  for(var yy=20;yy<P.h;yy+=40){ var lx=P.pathX(yy); if(lx!=null)lamp(P,lx+6,yy,1); }
  for(var k=0;k<5;k++){ var p=spot(P,P.w*(.2+.6*hash(k,1,seed)),P.h*hash(k,2,seed),4,4,6,tk); if(p){ P.ell(p[0]+2,p[1]+2,1.6,1.4,function(a,b){ P.set(a,b,hex('#e8761f')); }); P.ell(p[0]+2,p[1]+2,5,4,function(a,b,dx,dy){ P.tint(a,b,hex('#ffb347'),.15*(1-Math.sqrt(dx*dx+dy*dy))); }); } }
  fog(P,th.fog,9,.45);
};
WORLD.winter=function(P,th,seed){
  var tk=[];
  var pond=function(x,y){ var dx=(x-P.w*.3)/30,dy=(y-P.h*.4)/20; return (1-Math.sqrt(dx*dx+dy*dy))*.7+(fbm(x*.1,y*.1,3)-.5)*.3; };
  water(P,th,function(x,y){ return P.pathD(x,y)<6?-1:pond(x,y); },7,false);
  // skating marks on the frozen pond
  for(var i=0;i<60;i++){ var a=hash(i,3,seed)*6.28, r=8+hash(i,4,seed)*14, x=P.w*.3+Math.cos(a)*r*1.4, y=P.h*.4+Math.sin(a)*r*.8; if(pond(x,y)>.15)P.set(x,y,hex('#ffffff')); }
  var c1=spot(P,P.w*.75,P.h*.2,18,12,8,tk); if(c1)building(P,c1[0],c1[1],18,12,{ wall:'#7a4e30', roof:'#f3f7fc', win:'#ffd77a', snow:'#ffffff', glow:1 });
  var c2=spot(P,P.w*.25,P.h*.8,16,11,8,tk); if(c2)building(P,c2[0],c2[1],16,11,{ wall:'#6a4026', roof:'#e7eff8', win:'#ffd77a', snow:'#ffffff', glow:1 });
  var sm=spot(P,P.w*.72,P.h*.7,8,10,7,tk); if(sm){ var sx=sm[0]+4,sy=sm[1]; P.ell(sx+1,sy+9,4,1.5,function(a,b){ P.shade(a,b,.8); }); P.ell(sx,sy+6,3.4,3,function(a,b,dx,dy){ P.set(a,b,mix(hex('#ffffff'),hex('#b9c9da'),dx+dy>.4?.6:0)); }); P.ell(sx,sy+1,2.3,2.1,function(a,b,dx,dy){ P.set(a,b,mix(hex('#ffffff'),hex('#b9c9da'),dx+dy>.4?.6:0)); }); P.set(sx+2,sy+1,hex('#f08a24')); P.rect(sx-3,sy+3,sx+3,sy+4,function(a,b){ P.set(a,b,hex('#d62f2f')); }); }
  forest(P,th,function(x,y){ var n=fbm(x*.04,y*.04,6); return x<P.vx0-4||x>P.vx1+4?.95:n>.6?.8:.05; },seed+31,function(x,y){ return P.pathD(x,y)<7||pond(x,y)>-.05||P.clear(x,y,tk); },8,6);
  for(var yy=14;yy<P.h;yy+=44){ var lx=P.pathX(yy); if(lx!=null)lamp(P,lx-6,yy,0); }
  for(var y2=0;y2<P.h;y2++)for(var x2=0;x2<P.w;x2++)if(hash(x2,y2,seed+77)<.004)P.set(x2,y2,[255,255,255]); // falling snow
};
WORLD.beach=function(P,th,seed){
  var tk=[];
  // the sea along the left with a wavy shore, never over the trail
  var sea=function(x,y){ var sh=P.vx0+18+Math.sin(y*.045)*9+fbm(x*.05,y*.05,4)*10; return (sh-x)/26; };
  water(P,th,function(x,y){ return P.pathD(x,y)<7?Math.min(-.01,sea(x,y)):sea(x,y); },4,true);
  for(var y=0;y<P.h;y++)for(var x=0;x<P.w;x++){ if(sea(x,y)>-.12||P.pathD(x,y)<5)continue; var d=fbm(x*.08,y*.08,9); if(x>P.vx1-30&&d>.55&&hash(x,y,8)<(d-.5)*.6){ P.set(x,y,hex('#7f9a3e')); P.set(x,y-1,hex('#a3b85a')); } }
  var h=spot(P,P.w*.78,P.h*.3,12,12,8,tk); if(h){ P.rect(h[0]+2,h[1]+6,h[0]+3,h[1]+13,function(a,b){ P.set(a,b,hex('#8a6a3e')); }); P.rect(h[0]+9,h[1]+6,h[0]+10,h[1]+13,function(a,b){ P.set(a,b,hex('#8a6a3e')); }); building(P,h[0],h[1]-2,12,8,{ wall:'#f2efe6', roof:'#e14a33' }); }
  for(var k=0;k<5;k++){ var u=spot(P,P.w*(.55+.3*hash(k,5,seed)),P.h*hash(k,6,seed),10,8,7,tk); if(u){ var ux=u[0]+5,uy=u[1]+4; P.ell(ux+2,uy+3,4,1.5,function(a,b){ P.shade(a,b,.75); }); P.set(ux,uy+1,hex('#7a5a2c')); P.set(ux,uy+2,hex('#7a5a2c')); var cl=['#e14a33','#f1d04a','#2e95c2'][k%3]; P.ell(ux,uy-1,5,2.5,function(a,b,dx){ P.set(a,b,hex(((dx*5+5)|0)%4<2?cl:'#ffffff')); }); P.rect(ux+3,uy+3,ux+8,uy+5,function(a,b){ P.set(a,b,hex(k%2?'#ff7a59':'#55b6db')); }); } }
  for(var r=0;r<4;r++){ var q=spot(P,P.w*.7,P.h*(.2+r*.2),6,4,6,tk); if(q)rocks(P,q[0]+3,q[1]+2,2.2,'#b9a98a'); }
  forest(P,th,function(x,y){ return x>P.vx1-10?.7:fbm(x*.05,y*.05,3)>.68?.4:0; },seed+21,function(x,y){ return P.pathD(x,y)<8||sea(x,y)>-.15||P.clear(x,y,tk); },11,7);
};
WORLD.tour=function(P,th,seed){
  var tk=[], x, y;
  // mown stripes everywhere, like a course in tournament week
  for(y=0;y<P.h;y++)for(x=0;x<P.w;x++)if(P.pathD(x,y)>5)P.tint(x,y,((y>>3)&1)?[150,205,110]:[30,80,30],.14);
  var lake=function(x,y){ var dx=(x-P.w*.27)/26,dy=(y-P.h*.6)/16; return (1-Math.sqrt(dx*dx+dy*dy))*.8; };
  water(P,th,function(x,y){ return P.pathD(x,y)<6?-1:lake(x,y); },3,false);
  var gs=spot(P,P.w*.72,P.h*.1,30,14,8,tk);
  if(gs){ for(var r=0;r<5;r++)P.rect(gs[0],gs[1]+r*3,gs[0]+30,gs[1]+r*3+3,function(a,b){ P.set(a,b,hex(r%2?'#5b6b84':'#7a8aa4')); if(hash(a,b,seed)<.5)P.set(a,b,hex(['#e14a33','#f1d04a','#ffffff','#2b6a95','#f4b8cb'][(hash(a,b,9)*5)|0])); });
    P.rect(gs[0]+2,gs[1]+15,gs[0]+31,gs[1]+17,function(a,b){ P.shade(a,b,.6); }); }
  var lb=spot(P,P.w*.25,P.h*.2,18,12,8,tk);
  if(lb){ P.rect(lb[0]+2,lb[1]+11,lb[0]+19,lb[1]+13,function(a,b){ P.shade(a,b,.6); }); P.rect(lb[0],lb[1],lb[0]+18,lb[1]+10,function(a,b){ P.set(a,b,hex('#1d2a44')); });
    for(var i=0;i<4;i++)P.rect(lb[0]+2,lb[1]+2+i*2,lb[0]+16,lb[1]+3+i*2,function(a,b){ P.set(a,b,hex(a<lb[0]+12?'#f3efe4':(i%2?'#e14a33':'#ffffff'))); });
    P.rect(lb[0]+3,lb[1]+10,lb[0]+4,lb[1]+13,function(a,b){ P.set(a,b,hex('#0f1626')); }); P.rect(lb[0]+14,lb[1]+10,lb[0]+15,lb[1]+13,function(a,b){ P.set(a,b,hex('#0f1626')); }); }
  [[.75,.45],[.3,.88],[.78,.8]].forEach(function(g,i){ var p=spot(P,P.w*g[0],P.h*g[1],20,12,8,tk); if(p){ green(P,p[0]+10,p[1]+6,10,6,'#6fb04a','#ffd84a'); sand(P,p[0]+2,p[1]+10,3.5,2); sand(P,p[0]+19,p[1]+3,3,2); } });
  // gallery ropes beside the trail
  for(y=0;y<P.h;y+=2){ var lx=P.pathX(y); if(lx==null)continue; P.set(lx-8,y,hex(y%10<1?'#f3efe4':'#d6c8a0')); P.set(lx+8,y,hex(y%10<1?'#f3efe4':'#d6c8a0')); }
  forest(P,th,function(x,y){ return x<P.vx0-6||x>P.vx1+6?.9:fbm(x*.05,y*.05,5)>.68?.45:0; },seed+71,function(x,y){ return P.pathD(x,y)<10||lake(x,y)>-.1||P.clear(x,y,tk); },8,7);
};
WORLD.temple=function(P,th,seed){
  var tk=[];
  // a jade stream winding down the world, bridged where the trail crosses it
  var sx=P.vx0+(P.vx1-P.vx0)*.3, river=function(x,y){ var cx=sx+Math.sin(y*.05)*14+fbm(0,y*.04,4)*10; return (5-Math.abs(x-cx))/5; };
  water(P,th,river,6,false);
  for(var y=0;y<P.h;y++)for(var x=0;x<P.w;x++)if(P.pathD(x,y)<4&&river(x,y)>-.3)P.set(x,y,hex((x+y)%3?'#8f8766':'#6f6a4e'));
  var py=spot(P,P.w*.7,P.h*.2,26,22,9,tk);   // the stepped pyramid: four tiers and a shrine
  if(py){ var bx=py[0],by=py[1]; P.rect(bx+3,by+21,bx+29,by+24,function(a,b){ P.shade(a,b,.6); });
    for(var k=0;k<4;k++){ var x0=bx+k*3,x1=bx+26-k*3,y0=by+6+k*4,y1=by+22-k*0; P.rect(x0,by+22-(k+1)*4,x1,by+22-k*4,function(a,b){ P.set(a,b,hex(b%4===0?'#7b7354':(a>x1-3?'#8f8766':((a+b)%7===0?'#4f7a3a':'#a69c72')))); }); }
    P.rect(bx+11,by+2,bx+15,by+22,function(a,b){ P.set(a,b,hex(b%2?'#c9bf94':'#b3a97e')); });
    P.rect(bx+9,by,bx+17,by+6,function(a,b){ P.set(a,b,hex(b<1?'#c9a227':'#6f6a4e')); }); P.rect(bx+12,by+3,bx+14,by+6,function(a,b){ P.set(a,b,hex('#141008')); }); }
  for(var c=0;c<6;c++){ var q=spot(P,P.w*(.2+.6*hash(c,1,seed)),P.h*hash(c,2,seed),4,8,6,tk); if(q){ var hgt=3+((hash(c,3,seed)*5)|0); P.rect(q[0]+1,q[1]+8-hgt,q[0]+3,q[1]+8,function(a,b){ P.set(a,b,hex(a===q[0]+1?'#c2b88e':'#a69c72')); }); P.shade(q[0]+3,q[1]+8,.6); } }
  forest(P,th,function(x,y){ return x<P.vx0-4||x>P.vx1+4?.95:fbm(x*.05,y*.05,8)>.55?.75:.08; },seed+41,function(x,y){ return P.pathD(x,y)<7||river(x,y)>-.2||P.clear(x,y,tk); },8,7);
  fog(P,'#bfe8c8',12,.25);
};
WORLD.pirate=function(P,th,seed){
  var tk=[];
  var sea=function(x,y){ var sh=P.vx1-20-Math.sin(y*.04)*8-fbm(x*.05,y*.05,6)*10; return (x-sh)/24; };
  water(P,th,function(x,y){ return P.pathD(x,y)<7?Math.min(-.01,sea(x,y)):sea(x,y); },5,true);
  var sp=spot(P,P.w*.85,P.h*.35,26,14,9,tk);   // a ship at anchor, off the beach
  if(sp){ var x0=sp[0],y0=sp[1]; P.ell(x0+14,y0+12,14,3,function(a,b){ P.shade(a,b,.75); });
    P.rect(x0+2,y0+8,x0+26,y0+12,function(a,b){ var u=(a-x0-14)/12; if(Math.abs(u)>1-(b-y0-8)*.06)return; P.set(a,b,hex(b===y0+9?'#c9a227':(b%2?'#6b4426':'#5a3818'))); });
    for(var m=0;m<2;m++){ var mx=x0+9+m*9; for(var r=0;r<14;r++)P.set(mx,y0+8-r,hex('#4a2c16')); P.rect(mx-5,y0-5,mx+5,y0+3,function(a,b){ P.set(a,b,hex((b-y0)%4<2?'#f4efe2':'#e3d8bd')); }); }
    P.rect(x0+18,y0-9,x0+22,y0-6,function(a,b){ P.set(a,b,hex('#111')); }); }
  var dk=spot(P,P.w*.7,P.h*.7,14,4,7,tk); if(dk)P.rect(dk[0],dk[1],dk[0]+14,dk[1]+3,function(a,b){ P.set(a,b,hex(a%3?'#9a6a3e':'#86592f')); });
  for(var k=0;k<6;k++){ var q=spot(P,P.w*(.3+.4*hash(k,3,seed)),P.h*hash(k,4,seed),4,4,6,tk); if(q){ var bx=q[0]+2,by=q[1]+2; if(k%2){ P.ell(bx+1,by+1,2,1.2,function(a,b){ P.shade(a,b,.65); }); P.ell(bx,by,1.8,2,function(a,b,dx,dy){ P.set(a,b,hex(Math.abs(dy)>.5&&Math.abs(dy)<.7?'#3d3a3a':(dx<0?'#b07440':'#9a6236'))); }); }
    else { P.rect(bx-2,by-1,bx+2,by+2,function(a,b){ P.set(a,b,hex(b===by?'#c9a227':(b<by?'#7a4a24':'#8f5a2c'))); }); } } }
  forest(P,th,function(x,y){ return x<P.vx0-4?.8:fbm(x*.05,y*.05,3)>.66?.4:.02; },seed+51,function(x,y){ return P.pathD(x,y)<8||sea(x,y)>-.15||P.clear(x,y,tk); },11,7);
};
WORLD.canyon=function(P,th,seed){
  var tk=[], x, y;
  // red mesas filling both sides, in layered bands, and the trail running up the dry wash between them
  var mesa=function(x,y){ var e=Math.min(x-P.vx0,P.vx1-x), w=10+fbm(0,y*.03,7)*14; return (w-e)/6; };
  for(y=0;y<P.h;y++)for(x=0;x<P.w;x++){ var m=mesa(x,y); if(P.pathD(x,y)<9||m<=0)continue; var tq=m*1.1+fbm(x*.06,y*.06,5)*.9, tr=Math.floor(tq), ed=tq-tr; P.set(x,y,hex(['#c27a4a','#b0663c','#c9874e','#a95a35'][tr%4])); if(ed<.08)P.shade(x,y,.7); else if(ed>.93)P.tint(x,y,hex('#f0b47a'),.25); }
  var rail=function(x,y){ var cx=P.vx0+(P.vx1-P.vx0)*.68+Math.sin(y*.03)*6; return Math.abs(x-cx); };
  for(y=0;y<P.h;y++)for(x=0;x<P.w;x++){ var d=rail(x,y); if(P.pathD(x,y)<5||mesa(x,y)>0)continue; if(d<3)P.set(x,y,hex(d<.7||Math.abs(d-2.2)<.6?'#9a9aa2':(y%3?'#7a6a5a':'#6a4a2a'))); }
  var mn=spot(P,P.w*.3,P.h*.15,14,10,8,tk); if(mn){ P.rect(mn[0],mn[1],mn[0]+14,mn[1]+10,function(a,b){ P.set(a,b,hex('#93492b')); }); P.rect(mn[0]+3,mn[1]+3,mn[0]+11,mn[1]+10,function(a,b){ P.set(a,b,hex('#120c08')); }); P.rect(mn[0]+2,mn[1]+2,mn[0]+12,mn[1]+3,function(a,b){ P.set(a,b,hex('#8a5a30')); }); P.rect(mn[0]+2,mn[1]+3,mn[0]+3,mn[1]+10,function(a,b){ P.set(a,b,hex('#7a4a24')); }); P.rect(mn[0]+11,mn[1]+3,mn[0]+12,mn[1]+10,function(a,b){ P.set(a,b,hex('#7a4a24')); }); }
  var ct=Object.assign({},th,{ tree:'cactus' });
  forest(P,ct,function(x,y){ return fbm(x*.05,y*.05,9)>.55?.35:.06; },seed+61,function(x,y){ return P.pathD(x,y)<7||mesa(x,y)>-.3||rail(x,y)<4||P.clear(x,y,tk); },10,6);
  for(var k=0;k<8;k++){ var q=spot(P,P.w*(.25+.5*hash(k,5,seed)),P.h*hash(k,6,seed),5,4,6,tk); if(q)rocks(P,q[0]+2,q[1]+2,2.2,'#b8693e'); }
};
WORLD.volcano=function(P,th,seed){
  var tk=[], lava=Object.assign({},th,{ water:['#e04a10','#ff6a1a','#ff9a3a','#ffd25a'] });
  var flow=function(x,y){ var cx=P.vx0+(P.vx1-P.vx0)*.28+Math.sin(y*.045)*12+fbm(0,y*.05,3)*8; return (3.5-Math.abs(x-cx))/3.5; };
  var flow2=function(x,y){ var cx=P.vx1-14+Math.sin(y*.06+2)*8; return (2.5-Math.abs(x-cx))/2.5; };
  water(P,lava,function(x,y){ var d=Math.max(flow(x,y),flow2(x,y)); return P.pathD(x,y)<5?Math.min(-.01,d):d; },7,false);
  for(var y=0;y<P.h;y++)for(var x=0;x<P.w;x++){ if(P.pathD(x,y)<4&&Math.max(flow(x,y),flow2(x,y))>-.4)P.set(x,y,hex((x+y)%3?'#3a343a':'#2e292e')); else if(Math.max(flow(x,y),flow2(x,y))>-.5&&Math.max(flow(x,y),flow2(x,y))<=0)P.tint(x,y,hex('#ff6a1a'),.18); }
  var vc=spot(P,P.w*.72,P.h*.12,30,20,9,tk);   // a cone with a glowing crater
  if(vc){ var cx=vc[0]+15, by=vc[1]+20; for(var r=0;r<20;r++){ var hw=15-r*.55; P.rect(cx-hw,by-r,cx+hw,by-r+1,function(a,b){ P.set(a,b,hex(a>cx+hw*.3?'#232023':(b%3?'#3a343a':'#2e292e'))); }); }
    P.ell(cx,by-19,4,1.6,function(a,b){ P.set(a,b,hex('#ff6a1a')); }); P.ell(cx,by-22,9,6,function(a,b,dx,dy){ P.tint(a,b,hex('#ffb347'),.18*(1-Math.sqrt(dx*dx+dy*dy))); });
    for(var s=0;s<14;s++)P.set(cx+((hash(s,1,seed)-.5)*6|0),by-18+s,hex(s%2?'#ff6a1a':'#ffd25a')); }
  for(var k=0;k<6;k++){ var q=spot(P,P.w*(.3+.4*hash(k,7,seed)),P.h*hash(k,8,seed),3,7,6,tk); if(q){ var tx=q[0]+1; P.rect(tx,q[1]+2,tx+1,q[1]+7,function(a,b){ P.set(a,b,hex('#5a3818')); }); P.set(tx,q[1]+1,hex('#ff7a1a')); P.set(tx,q[1],hex('#ffd25a')); P.ell(tx,q[1]+1,4,4,function(a,b,dx,dy){ P.tint(a,b,hex('#ffb347'),.14*(1-Math.sqrt(dx*dx+dy*dy))); }); } }
  forest(P,th,function(x,y){ return x<P.vx0-4||x>P.vx1+4?.6:fbm(x*.05,y*.05,4)>.66?.35:.02; },seed+71,function(x,y){ return P.pathD(x,y)<8||Math.max(flow(x,y),flow2(x,y))>-.4||P.clear(x,y,tk); },11,7);
};
WORLD.harvest=function(P,th,seed){
  var tk=[], x, y;
  // fields in strips either side of the trail: corn in rows, stubble, a ploughed one
  for(y=0;y<P.h;y++)for(x=0;x<P.w;x++){ if(P.pathD(x,y)<8)continue; var f=Math.floor((y+fbm(x*.02,y*.02,4)*30)/34)%3, side=x<P.pathX(y)?0:1;
    if((f+side)%3===0){ P.set(x,y,hex(x%4<2?'#d9b45a':'#8a6a2a')); } else if((f+side)%3===1){ P.set(x,y,hex(y%3?'#7a4a24':'#6a4020')); } }
  var bn=spot(P,P.w*.72,P.h*.2,22,14,9,tk); if(bn)building(P,bn[0],bn[1],22,14,{ wall:'#a83024', roof:'#5c5f66', win:'#ffd77a', glow:1 });
  var sl=bn?spot(P,bn[0]+30,bn[1],8,18,8,tk):null; if(sl){ P.rect(sl[0]+2,sl[1]+16,sl[0]+9,sl[1]+19,function(a,b){ P.shade(a,b,.6); }); P.rect(sl[0],sl[1]+4,sl[0]+7,sl[1]+18,function(a,b){ P.set(a,b,hex(a>sl[0]+4?'#b8bec8':'#d6dbe2')); }); P.ell(sl[0]+3.5,sl[1]+4,3.5,3,function(a,b){ P.set(a,b,hex('#8e2a20')); }); }
  for(var k=0;k<14;k++){ var q=spot(P,P.w*(.2+.6*hash(k,1,seed)),P.h*hash(k,2,seed),4,4,6,tk); if(q){ P.ell(q[0]+3,q[1]+3,2.2,1,function(a,b){ P.shade(a,b,.65); }); P.ell(q[0]+2,q[1]+2,2,1.6,function(a,b,dx){ P.set(a,b,hex(dx<-.2?'#ff9a3a':'#e8761f')); }); P.set(q[0]+2,q[1],hex('#3a5a1a')); } }
  forest(P,th,function(x,y){ return x<P.vx0-4||x>P.vx1+4?.8:fbm(x*.05,y*.05,6)>.67?.45:.02; },seed+81,function(x,y){ return P.pathD(x,y)<8||P.clear(x,y,tk); },9,7);
  for(var yy=16;yy<P.h;yy+=42){ var lx=P.pathX(yy); if(lx!=null)lamp(P,lx+7,yy,0); }
};

/* make(theme, w, h, pts, opt): a w by h cell picture, pts the trail in cells, opt.vx0/vx1 the strip
   the phone actually shows (pieces go there), opt.seed. Returns a canvas. */
function make(theme, w, h, pts, opt){
  opt = opt || {}; var th = PAL[theme] || PAL.clubhouse, seed = opt.seed || 1, P = Px(w, h);
  P.vx0 = Math.max(0, opt.vx0 | 0); P.vx1 = Math.min(w, opt.vx1 || w);
  P.clear = function(x, y, tk){ for (var i = 0; i < tk.length; i++){ var t = tk[i]; if (x > t[0] - 4 && x < t[0] + t[2] + 4 && y > t[1] - 4 && y < t[1] + t[3] + 8) return true; } return false; };
  P.pathX = function(y){ for (var i = 0; i < pts.length - 1; i++){ var a = pts[i], b = pts[i + 1]; if ((y - a[1]) * (y - b[1]) <= 0 && a[1] !== b[1]) return Math.round(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])); } return null; };
  ground(P, th, seed);
  trail(P, th, pts, 6, seed + 4);
  (WORLD[theme] || WORLD.clubhouse)(P, th, seed);
  edges(P, theme === 'haunted' ? .8 : .5);
  return P.flush();
}
window.RTT_PUTT_MAPLAND = { make:make, themes:Object.keys(WORLD) };
})();
