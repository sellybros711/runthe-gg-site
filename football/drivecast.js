(function(){
  var fieldLogo=new Image(); fieldLogo.src='/football/field-r.png?v=1';
function generateDrives(script,rng){
  const GAME=3600,drives=[],ticks=[];
  for(const e of script) ticks.push({sec:(e.q-1)*900+(900-e.sec),team:e.team,kind:e.kind,points:e.points});
  let pos='you',at=20+Math.floor(rng()*10),t=0;
  const flip=()=>{pos=pos==='you'?'them':'you';};
  const youKO=()=>18+Math.floor(rng()*12);
  const themKO=()=>82-Math.floor(rng()*12);

  for(let i=0;i<=ticks.length;i++){
    const ns=i<ticks.length?ticks[i]:null;
    const tE=ns?ns.sec:GAME,gap=tE-t;
    if(gap<5){
      if(ns){
        if(ns.kind==='SAFETY'){pos=ns.team;at=ns.team==='you'?youKO()+12:themKO()-12;}
        else{pos=ns.team==='you'?'them':'you';at=pos==='you'?youKO():themKO();}
      }
      t=tE;continue;
    }
    const scorePoss=ns?(ns.kind==='SAFETY'?(ns.team==='you'?'them':'you'):ns.team):null;
    let filler=Math.max(0,Math.round(gap/220)-1+(rng()<0.45?1:0));
    if(scorePoss){
      const af=filler%2===0?pos:(pos==='you'?'them':'you');
      if(af!==scorePoss) filler++;
    }
    const total=scorePoss?filler+1:Math.max(1,filler);
    const sl=gap/total;

    for(let d=0;d<total;d++){
      const ds=t+d*sl,de=t+(d+1)*sl;
      const sy=Math.max(1,Math.min(99,at));
      let ey,res;

      if(scorePoss&&d===total-1){
        if(ns.kind==='TOUCHDOWN'){
          ey=pos==='you'?100:0;res='touchdown';
        }else if(ns.kind==='FIELD GOAL'){
          if(pos==='you'){ey=Math.min(97,Math.max(sy+2,60+Math.floor(rng()*18)));}
          else{ey=Math.max(3,Math.min(sy-2,40-Math.floor(rng()*18)));}
          res='field goal';
        }else{
          if(pos==='you'){
            const sc=Math.min(sy,8+Math.floor(rng()*5));
            drives.push({team:pos,startYard:sc,endYard:Math.max(0,sc-1-Math.floor(rng()*3)),result:'safety',tStart:ds,tEnd:de});
          }else{
            const sc=Math.max(sy,92-Math.floor(rng()*5));
            drives.push({team:pos,startYard:sc,endYard:Math.min(100,sc+1+Math.floor(rng()*3)),result:'safety',tStart:ds,tEnd:de});
          }
          pos=ns.team;at=ns.team==='you'?youKO()+12:themKO()-12;
          continue;
        }
        drives.push({team:pos,startYard:sy,endYard:ey,result:res,tStart:ds,tEnd:de});
        pos=ns.team==='you'?'them':'you';at=pos==='you'?youKO():themKO();
      }else{
        const roll=rng();
        if(pos==='you'){
          const g=5+Math.floor(rng()*28);ey=Math.min(sy+g,88);
          if(roll<0.68){res='punt';at=ey+32+Math.floor(rng()*18);if(at>=100)at=80;}
          else{res='turnover';at=ey;}
        }else{
          const g=5+Math.floor(rng()*28);ey=Math.max(sy-g,12);
          if(roll<0.68){res='punt';at=ey-32-Math.floor(rng()*18);if(at<=0)at=20;}
          else{res='turnover';at=ey;}
        }
        drives.push({team:pos,startYard:sy,endYard:ey,result:res,tStart:ds,tEnd:de});
        flip();
      }
    }
    t=tE;
  }
  return drives;
}
function drawDriveChart(ctx,w,h,drives,upTo,youColor,themColor,youName,themName,style){
  if(!ctx)return;
  const dpr=window.devicePixelRatio||1;
  ctx.save();ctx.clearRect(0,0,w,h);

  const pad={l:4*dpr,r:4*dpr,t:10*dpr,b:14*dpr};
  const fw=w-pad.l-pad.r,fh=h-pad.t-pad.b;
  const fl=pad.l,ft=pad.t;

  /* end zones sit outside the goal lines; playing field is yards 0–100 mapped
     to the inner area between the two end-zone strips */
  const ezW=Math.round(fw*0.06);
  const pfL=fl+ezW,pfW=fw-ezW*2;

  /* field background — the college field is a cooler green with mowing stripes and bolder
     end zones so it reads clearly apart from the pro field. */
  const college=style==='college';
  ctx.fillStyle=college?'#14402a':'#1a3a1a';ctx.fillRect(fl,ft,fw,fh);
  if(college){
    ctx.fillStyle='rgba(255,255,255,0.05)';
    for(let syd=0;syd<100;syd+=20){ ctx.fillRect(pfL+(syd/100)*pfW, ft, (10/100)*pfW, fh); }
  }

  /* end-zone color wash (bolder on the college field) */
  ctx.globalAlpha=college?0.34:0.18;
  ctx.fillStyle=youColor;ctx.fillRect(fl,ft,ezW,fh);
  ctx.fillStyle=themColor;ctx.fillRect(fl+fw-ezW,ft,ezW,fh);
  ctx.globalAlpha=1;

  /* TEAM NAMES PAINTED IN THE END ZONES, turned to read up the field the way they are on a
     real one: yours on the left, the opponent on the right. */
  const endName=(cx,txt,dir)=>{
    if(!txt) return;
    ctx.save();ctx.translate(cx,ft+fh/2);ctx.rotate(dir*Math.PI/2);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='700 '+(9*dpr)+'px sans-serif';
    ctx.fillStyle='rgba(255,255,255,.62)';
    ctx.fillText(String(txt).toUpperCase().slice(0,10),0,0);
    ctx.restore();
  };
  endName(fl+ezW/2,youName,-1);
  endName(fl+fw-ezW/2,themName,1);

  /* goal lines */
  ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.2*dpr;
  ctx.beginPath();ctx.moveTo(pfL,ft);ctx.lineTo(pfL,ft+fh);ctx.stroke();
  ctx.beginPath();ctx.moveTo(pfL+pfW,ft);ctx.lineTo(pfL+pfW,ft+fh);ctx.stroke();

  /* yard lines (every 10 yards inside the playing field) */
  for(let yd=10;yd<=90;yd+=10){
    const x=pfL+(yd/100)*pfW;
    if(yd===50){ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1*dpr;}
    else{ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=0.5*dpr;}
    ctx.beginPath();ctx.moveTo(x,ft);ctx.lineTo(x,ft+fh);ctx.stroke();
  }

  /* The midfield logo, faint, under the drives the way a painted logo sits under the
     players. Drawn after the yard lines so the lines read through it. */
  if(fieldLogo.complete&&fieldLogo.naturalWidth){
    /* 0.44 of the field's height, not the 0.78 this arrived with. The glyph is very nearly
       square (352x325), so at 0.78 it stood almost the full height of the field and read as a
       watermark laid over the play rather than a logo painted at midfield. A real one sits
       inside the middle third. */
    const lh=fh*0.44, lw=lh*(fieldLogo.naturalWidth/fieldLogo.naturalHeight);
    ctx.globalAlpha=0.11;
    ctx.drawImage(fieldLogo,pfL+pfW/2-lw/2,ft+fh/2-lh/2,lw,lh);
    ctx.globalAlpha=1;
  }

  /* yard labels */
  const labels=[10,20,30,40,50,40,30,20,10];
  ctx.fillStyle='rgba(255,255,255,.2)';ctx.font=(7*dpr)+'px sans-serif';ctx.textAlign='center';
  labels.forEach((n,i)=>ctx.fillText(n,pfL+((i+1)/10)*pfW,ft+fh+10*dpr));

  /* collect visible drives + detect in-progress */
  const visible=[];let active=null;
  for(const d of drives){
    if(d.tStart>upTo)break;
    visible.push(d);
    if(d.tEnd>upTo)active=d;
  }
  if(!visible.length){ctx.restore();return;}

  const maxRows=7,rowH=fh/maxRows;
  const start=Math.max(0,visible.length-maxRows);
  const shown=visible.slice(start);

  const barPath=(l,t2,bw,bh,rad)=>{
    ctx.beginPath();
    if(ctx.roundRect){ctx.roundRect(l,t2,bw,bh,rad);}
    else{ctx.moveTo(l+rad,t2);ctx.lineTo(l+bw-rad,t2);
      ctx.arcTo(l+bw,t2,l+bw,t2+rad,rad);ctx.lineTo(l+bw,t2+bh-rad);
      ctx.arcTo(l+bw,t2+bh,l+bw-rad,t2+bh,rad);ctx.lineTo(l+rad,t2+bh);
      ctx.arcTo(l,t2+bh,l,t2+bh-rad,rad);ctx.lineTo(l,t2+rad);
      ctx.arcTo(l,t2,l+rad,t2,rad);}
  };

  for(let i=0;i<shown.length;i++){
    const d=shown[i],isActive=d===active;
    const y=ft+i*rowH;
    const barH=Math.max(rowH*0.42,3*dpr);
    const barY=y+(rowH-barH)/2;

    /* animate in-progress drive; clamp to goal lines so TD bars
       stop at the front of the end zone, not inside it */
    let drawEnd=Math.max(0,Math.min(100,d.endYard));
    if(isActive){
      const p=Math.min(1,(upTo-d.tStart)/Math.max(1,d.tEnd-d.tStart));
      drawEnd=d.startYard+(d.endYard-d.startYard)*p;
    }
    const clampStart=Math.max(0,Math.min(100,d.startYard));
    drawEnd=Math.max(0,Math.min(100,drawEnd));

    const x1=pfL+(clampStart/100)*pfW,x2=pfL+(drawEnd/100)*pfW;
    const left=Math.min(x1,x2),right=Math.max(x1,x2);
    const barW=Math.max(right-left,2*dpr);

    /* fade older drives — quadratic ease for smoother falloff */
    const age=shown.length-1-i;
    const t2=Math.max(0,1-age/(maxRows-1));
    const alpha=isActive?0.92:Math.max(0.22,t2*t2*0.75+0.1);
    const color=d.team==='you'?youColor:themColor;

    /* rounded bar with gradient sheen */
    const r=Math.min(barH/2,3*dpr);
    ctx.globalAlpha=alpha;
    ctx.fillStyle=color;
    barPath(left,barY,barW,barH,r);
    ctx.fill();

    /* subtle top-light gradient overlay */
    const grad=ctx.createLinearGradient(0,barY,0,barY+barH);
    grad.addColorStop(0,'rgba(255,255,255,0.14)');
    grad.addColorStop(0.5,'rgba(255,255,255,0)');
    grad.addColorStop(1,'rgba(0,0,0,0.12)');
    ctx.fillStyle=grad;
    barPath(left,barY,barW,barH,r);
    ctx.fill();

    /* directional arrow at leading edge */
    if(!isActive||(upTo-d.tStart)>(d.tEnd-d.tStart)*0.12){
      const tipX=d.team==='you'?right:left;
      const dir=d.team==='you'?1:-1;
      const sz=Math.min(barH*0.35,3*dpr);
      ctx.fillStyle=color;
      ctx.beginPath();
      ctx.moveTo(tipX,barY+barH/2-sz);
      ctx.lineTo(tipX+dir*sz*1.4,barY+barH/2);
      ctx.lineTo(tipX,barY+barH/2+sz);
      ctx.closePath();ctx.fill();
    }

    /* result markers on completed drives */
    if(!isActive){
      const scored=d.result==='touchdown'||d.result==='field goal';
      if(scored){
        ctx.globalAlpha=Math.max(alpha,0.7);
        const dx=d.team==='you'?right+4*dpr:left-4*dpr;
        ctx.beginPath();ctx.arc(dx,barY+barH/2,2.5*dpr,0,Math.PI*2);
        ctx.fillStyle=d.result==='touchdown'?'#fbbf24':'#67e8f9';ctx.fill();
      }else if(d.result==='turnover'){
        ctx.globalAlpha=Math.max(alpha,0.55);
        ctx.fillStyle='#ef4444';const s=2.5*dpr;
        ctx.save();ctx.translate(d.team==='you'?right:left,barY+barH/2);
        ctx.rotate(Math.PI/4);
        ctx.fillRect(-s,-0.7*dpr,s*2,1.4*dpr);ctx.fillRect(-0.7*dpr,-s,1.4*dpr,s*2);
        ctx.restore();
      }
    }
    ctx.globalAlpha=1;
  }
  ctx.restore();
}

  function randomScript(){
    var evs=[]; ['you','them'].forEach(function(tm){
      var nTD=Math.floor(Math.random()*4), nFG=Math.floor(Math.random()*3), i;
      for(i=0;i<nTD;i++) evs.push({team:tm,kind:'TOUCHDOWN',points:7,t:Math.floor(Math.random()*3600)});
      for(i=0;i<nFG;i++) evs.push({team:tm,kind:'FIELD GOAL',points:3,t:Math.floor(Math.random()*3600)});
    });
    if(evs.length<2){ evs.push({team:'you',kind:'TOUCHDOWN',points:7,t:Math.floor(Math.random()*1800)});
                      evs.push({team:'them',kind:'FIELD GOAL',points:3,t:1800+Math.floor(Math.random()*1800)}); }
    evs.sort(function(a,b){return a.t-b.t;});
    return evs.map(function(e){ var q=Math.min(4,Math.floor(e.t/900)+1); return {q:q,sec:900-(e.t%900),team:e.team,kind:e.kind,points:e.points}; });
  }
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  function pick2(a){ var i=Math.floor(Math.random()*a.length),j; do{j=Math.floor(Math.random()*a.length);}while(j===i); return [a[i],a[j]]; }

  function mount(canvas, opts){
    opts=opts||{}; var teams=opts.teams||[['HOME','#3aa0ff'],['AWAY','#ff6a6a']]; var field=opts.field||'';
    var reduce=false; try{ reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    var ctx=canvas.getContext('2d'), GAME=3600, DUR=opts.dur||22000, HOLD=2600;
    var W,H,drives,youC,themC,youN,themN,startT=null,raf=0;
    function size(){ var dpr=window.devicePixelRatio||1, r=canvas.getBoundingClientRect();
      W=Math.max(220,Math.round((r.width||220)*dpr)); H=Math.round((r.height||150)*dpr);
      canvas.width=W; canvas.height=H; }
    function newGame(){ var t=pick2(teams); youN=t[0][0]; themN=t[1][0]; youC=t[0][1]; themC=t[1][1];
      drives=generateDrives(randomScript(), Math.random); startT=null; }
    function draw(upTo){ drawDriveChart(ctx,W,H,drives,upTo,youC,themC,youN,themN,field); }
    size(); newGame();
    if(reduce){ draw(GAME); return; }
    function frame(ts){ if(startT==null) startT=ts; var el=ts-startT;
      draw(Math.min(GAME, el/DUR*GAME));
      if(el>=DUR+HOLD){ newGame(); startT=ts; }
      raf=requestAnimationFrame(frame); }
    raf=requestAnimationFrame(frame);
    var rt; window.addEventListener('resize',function(){ clearTimeout(rt); rt=setTimeout(size,150); });
  }
  window.RTDrive={ mount:mount };
})();