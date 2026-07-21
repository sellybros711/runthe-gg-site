import re, io
HTML='build-a-golfer/build-a-golfer.html'
src=open(HTML,encoding='utf-8').read()
const=open('scratchpad/swing4_const.js',encoding='utf-8').read().strip()

FUNCS = r'''
// CS502-anim: NEW 4-direction righty SWING (address/top/impact=address/finish). Owner-authored poses per aim
// (N=up back-turn finish, E=right front view, S=down face-to-camera finish, W=left back view). Recolours from
// the look + shirt patterns like pxDir8Canvas; the cap is baked (recoloured to the hat colour). Novelty-hat
// OVERLAYS are not yet authored for these poses, so a novelty hat falls back to the baked cap on the full
// swing only (chip/putt/lefty keep the pxDir8 system). 24x26 grid.
function pxSw4Canvas(look, dir, poseKey){
  look=look||S.look||DEFLOOK; const av=avLook(look);
  const pantsHex=((typeof PANTS!=='undefined'&&PANTS.find(x=>x.id===(look.pants||'stone')))||{a:'#c7bfa8'}).a;
  const capOn=look.cap!==false, noCap=!capOn;
  const pat=(look.shirtPat&&PXPAT_BY[look.shirtPat])?look.shirtPat:'';
  const BODY=PXG_SW4[dir]&&PXG_SW4[dir][poseKey]; if(!BODY) return null;
  const key='SW4'+dir+poseKey+'|'+av.key+'|cap'+(capOn?'1':'0')+'|pn'+(look.pants||'stone')+'|pt'+pat;
  let cached=_pxCanvas.get(key); if(cached) return cached;
  const P={ l:PXG_FIX.l, G:PXG_FIX.G, H:PXG_FIX.H, u:'#101a30',
    s:av.skinHex, j:pxShade(av.skinHex,-26), x:pxShade(av.skinHex,20),
    t:av.shirtHex, d:pxShade(av.shirtHex,-26), v:pxShade(av.shirtHex,34),
    p:pantsHex, q:pxShade(pantsHex,-22), o:av.shoesHex,
    h:av.hairHex, i:pxShade(av.hairHex,-26),
    c:noCap?av.hairHex:av.hatHex, b:noCap?pxShade(av.hairHex,-26):pxShade(av.hatHex,-24), w:noCap?av.hairHex:pxShade(av.hatHex,26) };
  const px=7, cv=document.createElement('canvas'); cv.width=PXG_DIR8_W*px; cv.height=PXG_DIR8_H*px;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(11*px,22*px,6*px,2*px,0,0,7); ctx.fill();
  for(let y=0;y<BODY.length;y++){ const row=BODY[y];
    for(let X=0;X<row.length;X++){ const ch=row[X]; if(ch==='.'||ch===' ')continue; const col=P[ch]; if(!col)continue;
      ctx.fillStyle=col; ctx.fillRect(X*px,y*px,px,px); } }
  if(pat){ const pd=PXPAT_BY[pat];
    if(pd.fixed){ const cols=pd.cols||[];
      for(let y=0;y<BODY.length;y++){ const row=BODY[y]; for(let X=0;X<row.length;X++){ const ch=row[X];
        if(ch!=='t'&&ch!=='d'&&ch!=='v')continue; let col=cols[pd.f(X,y)|0]||cols[0]; if(!col)continue;
        if(ch==='d') col=pxShade(col,-20); else if(ch==='v') col=pxShade(col,16);
        ctx.fillStyle=col; ctx.fillRect(X*px,y*px,px,px); } }
    } else {
      const light=pxLum(av.shirtHex)>0.55, a1=pxShade(av.shirtHex, light?-52:46), a2=pxShade(av.shirtHex, light?-90:82);
      for(let y=0;y<BODY.length;y++){ const row=BODY[y]; for(let X=0;X<row.length;X++){ const ch=row[X];
        if(ch!=='t'&&ch!=='d'&&ch!=='v')continue; const a=pd.f(X,y); if(!a)continue;
        let col=(a===2)?a2:a1; if(ch==='d') col=pxShade(col,-16); else if(ch==='v') col=pxShade(col,14);
        ctx.fillStyle=col; ctx.fillRect(X*px,y*px,px,px); } }
    } }
  _pxCanvas.set(key,cv); return cv;
}
function pxSw4(look, dir){
  const url=(k)=>{ const cv=pxSw4Canvas(look,dir,k); if(!cv) return '';
    let u=_pxURL.get(cv); if(!u){ u=cv.toDataURL('image/png'); _pxURL.set(cv,u); } return u; };
  const a=url('A'); return { full:[a, url('B'), a, url('C')], dir };   // 4 frames: address, top, address(impact), finish
}
// snap a screen-space aim vector to one of 4 facings: N=up, S=down, E=right, W=left
function sw4For(vx, vy){
  if(Math.abs(vx) > Math.abs(vy)) return vx>0?'E':'W';
  return vy>0?'S':'N';
}
'''

# 1) insert const + funcs right before pxGolferURL (after dir8For)
marker='function pxGolferURL(look){'
assert src.count(marker)==1, 'pxGolferURL marker'
src=src.replace(marker, const+'\n'+FUNCS.strip()+'\n'+marker, 1)

# 2) hvSwingMarkup: use pxSw4 for the righty FULL swing
old_hsm = '''  const down = vy > 0;   // shot travels DOWN-screen = toward the camera
  const dir = look.lefty ? (down?'E':'W') : (down?'W':'E');
  let set; try{ set=pxDir8(look,dir); }catch(e){ return ''; }
  const frames=set[kind]||set.full; if(!frames||!frames[0]) return '';
  const clsBase = kind==='full'?['sw0','sw1','sw2','sw3'] : (kind==='chip'?['ch0','ch1'] : ['pt0','pt1']);
  const cam=hvCamFor2(g,p);
  const W=PXG_DIR8_W, H=PXG_DIR8_H;
  // putt plays under the tight green close-up → size to that frame; full/chip use a fixed small size.
  const GH = kind==='putt' ? Math.max(13, Math.min(21, cam[3]*0.16)) : 22;
  const GW=GH*W/H;
  const anch=dir8Anchor(dir, kind, !!look.lefty);   // CS493: lefty anchor (ball on the golfer's left)'''
new_hsm = '''  // CS502-anim: the FULL swing (righty) uses the new 4-direction poses snapped to the shot's aim; chip/putt
  // and lefty keep the pxDir8 system. N=up S=down E=right W=left.
  const useSw4 = (kind==='full' && !look.lefty);
  let set, dir, anch;
  if(useSw4){
    dir = sw4For(vx, vy);
    try{ set=pxSw4(look,dir); }catch(e){ return ''; }
    anch = PXG_SW4_ANCH[dir] || [12,18];
  } else {
    const down = vy > 0;   // shot travels DOWN-screen = toward the camera
    dir = look.lefty ? (down?'E':'W') : (down?'W':'E');
    try{ set=pxDir8(look,dir); }catch(e){ return ''; }
    anch = dir8Anchor(dir, kind, !!look.lefty);
  }
  const frames=set[kind]||set.full; if(!frames||!frames[0]) return '';
  const clsBase = kind==='full'?['sw0','sw1','sw2','sw3'] : (kind==='chip'?['ch0','ch1'] : ['pt0','pt1']);
  const cam=hvCamFor2(g,p);
  const W=PXG_DIR8_W, H=PXG_DIR8_H;
  // putt plays under the tight green close-up → size to that frame; full/chip use a fixed small size.
  const GH = kind==='putt' ? Math.max(13, Math.min(21, cam[3]*0.16)) : 22;
  const GW=GH*W/H;'''
assert old_hsm in src, 'hvSwingMarkup block not found'
src=src.replace(old_hsm, new_hsm, 1)

# 3) hvAddressGolfer: righty over-the-ball address uses the new N (up) address frame
old_hag = '''  const dir=look.lefty?'W':'E';   // CS494: side-on stance, trail shoulder to camera (matches hvSwingMarkup)
  let set; try{ set=pxDir8(look,dir); }catch(e){ return ''; }
  if(!set) return '';'''
new_hag = '''  const useSw4=!look.lefty;   // CS502-anim: righty uses the new N (up-the-hole) address; lefty keeps pxDir8
  const dir=useSw4?'N':'W';
  let set; try{ set=useSw4?pxSw4(look,dir):pxDir8(look,dir); }catch(e){ return ''; }
  if(!set) return '';'''
assert old_hag in src, 'hvAddressGolfer block not found'
src=src.replace(old_hag, new_hag, 1)

# hvAddressGolfer anchor: it uses dir8Anchor('N',...) which is fine for lefty; for sw4 use PXG_SW4_ANCH.N
old_hag2 = '''  const GH=22, GW=GH*W/H, anch=dir8Anchor('N','full', !!look.lefty);   // CS493: lefty anchor'''
new_hag2 = '''  const GH=22, GW=GH*W/H, anch=(useSw4?(PXG_SW4_ANCH.N||[12,18]):dir8Anchor('N','full', !!look.lefty));'''
assert old_hag2 in src, 'hvAddressGolfer anchor not found'
src=src.replace(old_hag2, new_hag2, 1)

open(HTML,'w',encoding='utf-8').write(src)
print('spliced OK')
