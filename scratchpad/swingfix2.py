"""
CS500: keep our side-on view + the fixed head (so hats/cap stay aligned), but the
BODY now shows real swing MECHANICS - torso coil/turn, weight shift, BACK HEEL UP
at the finish, and a club path that goes up over the trail shoulder (toward camera)
then wraps over the lead shoulder. Built region-by-region off the exact current E
body so the head (rows 0-10) is byte-identical to today (novelty hats + baked cap
align on every frame). Only E matters (CS494 shows E and its W mirror); other
facings keep the CS499 moving-arm swing. Emits merged PXG_DIR8 / PXG_DIR8_L.
"""
import json, math
from PIL import Image, ImageDraw
W,H=24,26; CX=11
def blank(): return [['.']*W for _ in range(H)]
def box(f,x0,x1,y0,y1,ch):
    for y in range(int(round(y0)),int(round(y1))+1):
        for x in range(int(round(x0)),int(round(x1))+1):
            if 0<=x<W and 0<=y<H: f[y][x]=ch
def disc(f,cx,cy,rx,ry,ch):
    for y in range(cy-ry,cy+ry+1):
        for x in range(cx-rx,cx+rx+1):
            if 0<=x<W and 0<=y<H and ((x-cx)/rx)**2+((y-cy)/ry)**2<=1.05: f[y][x]=ch
def seg(f,x0,y0,x1,y1,ch,wide=True):
    n=int(max(abs(x1-x0),abs(y1-y0),1))
    for i in range(n+1):
        t=i/n; x=x0+(x1-x0)*t; y=y0+(y1-y0)*t; xi,yi=int(round(x)),int(round(y))
        if 0<=xi<W and 0<=yi<H: f[yi][xi]=ch
        if wide and 0<=xi+1<W and 0<=yi<H: f[yi][xi+1]=ch
def rows(f): return [''.join(r) for r in f]
def legs(f):
    box(f,CX-4,CX-2,17,21,'p'); box(f,CX+2,CX+4,17,21,'p')
    box(f,CX-4,CX-4,17,21,'q'); box(f,CX+4,CX+4,17,21,'q')
    box(f,CX-4,CX-2,22,22,'o'); box(f,CX+2,CX+4,22,22,'o')
# ---- exact current body() (dir8b) for every direction ----
def body(f,d):
    if d=='N':
        disc(f,CX,7,5,4,'h'); box(f,CX-4,CX+4,3,4,'i')
        box(f,CX-6,CX+6,11,12,'t'); box(f,CX-5,CX+5,13,16,'t')
        box(f,CX-6,CX-5,11,14,'d'); box(f,CX+5,CX+6,11,14,'v'); box(f,CX-1,CX+1,12,16,'d')
        legs(f); disc(f,CX,6,6,5,'c'); box(f,CX-5,CX+5,2,3,'b'); f[6][CX]='w'; box(f,CX-6,CX+6,9,9,'b')
    elif d=='NE':
        disc(f,CX,7,5,4,'h'); box(f,CX-4,CX+3,3,4,'i')
        box(f,CX-5,CX+6,11,12,'t'); box(f,CX-4,CX+5,13,16,'t')
        box(f,CX-5,CX-4,11,14,'d'); box(f,CX+5,CX+6,11,14,'v'); box(f,CX-1,CX+2,12,16,'d')
        legs(f); disc(f,CX,6,6,5,'c'); box(f,CX-5,CX+4,2,3,'b'); f[6][CX]='w'
        box(f,CX+4,CX+7,7,8,'c'); box(f,CX+5,CX+7,8,8,'b')
    elif d=='E':
        disc(f,CX-1,7,4,4,'h')
        box(f,CX-4,CX+5,11,16,'t'); box(f,CX-4,CX-3,11,16,'d'); box(f,CX+4,CX+5,11,15,'v')
        legs(f); disc(f,CX-1,6,5,5,'c'); box(f,CX-5,CX-1,3,4,'b'); f[6][CX-1]='w'
        box(f,CX+4,CX+7,6,7,'c'); box(f,CX+4,CX+7,7,7,'b')
    elif d=='SE':
        disc(f,CX,7,5,4,'h')
        box(f,CX-5,CX+6,11,12,'t'); box(f,CX-4,CX+5,13,16,'t')
        box(f,CX-5,CX-4,11,14,'v'); box(f,CX+5,CX+6,11,14,'v')
        legs(f); disc(f,CX,5,6,4,'c'); box(f,CX-5,CX+4,2,3,'b'); f[5][CX]='w'
        box(f,CX+3,CX+6,8,9,'c'); box(f,CX+3,CX+6,9,9,'b'); f[9][CX-2]='s'; f[9][CX-1]='s'
    elif d=='S':
        disc(f,CX,7,5,4,'h')
        box(f,CX-6,CX+6,11,12,'t'); box(f,CX-5,CX+5,13,16,'t')
        box(f,CX-6,CX-5,11,14,'v'); box(f,CX+5,CX+6,11,14,'v'); box(f,CX-2,CX+2,12,15,'t')
        legs(f); disc(f,CX,5,6,4,'c'); box(f,CX-5,CX+5,2,3,'b'); f[5][CX]='w'
        box(f,CX-5,CX+5,8,8,'c'); box(f,CX-5,CX+5,9,9,'b')
        box(f,CX-3,CX+3,10,10,'s'); f[10][CX-2]='j'; f[10][CX+2]='j'

def clear_rows(f,y0,y1):
    for y in range(y0,y1+1):
        for x in range(W): f[y][x]='.'

# ===================== E rotating (head fixed) =====================
def torso_E(f,ph):   # rows 11-16
    clear_rows(f,11,16)
    if ph in ('A','D'):
        box(f,CX-4,CX+5,11,16,'t'); box(f,CX-4,CX-3,11,16,'d'); box(f,CX+4,CX+5,11,15,'v')
        if ph=='D': box(f,CX+2,CX+5,15,16,'v')   # hips opening toward target
    elif ph=='B':      # coil away: spine rotates into view, front narrows
        box(f,CX-4,CX+4,11,16,'t'); box(f,CX-4,CX-2,11,16,'d'); box(f,CX+0,CX+1,12,16,'d')  # back + spine
        box(f,CX+3,CX+4,12,15,'v')
    elif ph=='C':      # rotate to face target: chest (front) fills, reverse-C - top leans back-left
        box(f,CX-5,CX+5,11,16,'t')
        box(f,CX+1,CX+5,11,16,'v'); box(f,CX-1,CX+0,12,16,'v')   # chest to camera-target
        box(f,CX-5,CX-3,11,15,'d')                               # trail-side shade (high side)
        box(f,CX-5,CX-4,11,11,'.'); box(f,CX-4,CX-3,10,10,'t')   # top leans left (reverse-C hint)
def legs_E(f,ph):    # rows 17-22
    clear_rows(f,17,22)
    if ph=='C':        # finish: RIGHT (lead) leg the straight post; LEFT (back) foot up on the toe
        box(f,CX+1,CX+3,17,21,'p'); box(f,CX+3,CX+3,17,21,'q'); box(f,CX+1,CX+3,22,22,'o')
        box(f,CX-2,CX-1,17,20,'p'); box(f,CX-2,CX-2,17,20,'q'); box(f,CX-2,CX-1,20,20,'o')  # toe
    elif ph=='B':      # weight on the back (left) leg, front (right) knee eases in
        box(f,CX-4,CX-2,17,21,'p'); box(f,CX-4,CX-4,17,21,'q'); box(f,CX-4,CX-2,22,22,'o')
        box(f,CX+2,CX+3,17,21,'p'); box(f,CX+3,CX+3,17,21,'q'); box(f,CX+2,CX+3,22,22,'o')
    else:
        legs(f)
def arms_club_E(f,ph):
    sx,sy=CX+1,12
    if ph=='A':
        hx,hy=CX+4,14; seg(f,sx,sy,hx,hy,'s'); f[14][min(W-1,CX+4)]='x'
        seg(f,hx,hy,CX+8,17,'l',wide=False)
    elif ph=='D':
        hx,hy=CX+4,14; seg(f,sx,sy,hx,hy,'s'); f[14][min(W-1,CX+4)]='x'
        seg(f,hx,hy,CX+8,16,'l',wide=False)
    elif ph=='B':      # club up over the trail shoulder, head hooking back toward camera
        hx,hy=CX-2,10; seg(f,sx-1,sy-1,hx,hy,'s'); f[10][max(0,CX-2)]='x'
        seg(f,hx,hy,CX,5,'l',wide=False); seg(f,CX,5,CX+3,7,'l',wide=False)
    elif ph=='C':      # club wrapped over the lead shoulder behind the head
        hx,hy=CX+3,9; seg(f,sx,sy-1,hx,hy,'s'); f[9][min(W-1,CX+3)]='x'
        seg(f,hx,hy,CX+1,5,'l',wide=False); seg(f,CX+1,5,CX-3,6,'l',wide=False)
def frame_E(ph):
    f=blank(); body(f,'E'); torso_E(f,ph); legs_E(f,ph); arms_club_E(f,ph); return rows(f)
def frame_E_chip(ph):
    f=blank(); body(f,'E'); torso_E(f,'B' if ph=='CH0' else 'A'); sx,sy=CX+1,12
    if ph=='CH0':
        hx,hy=CX-1,11; seg(f,sx-1,sy-1,hx,hy,'s'); f[11][max(0,CX-1)]='x'; seg(f,hx,hy,CX+1,7,'l',wide=False)
    else:
        hx,hy=CX+4,14; seg(f,sx,sy,hx,hy,'s'); f[14][min(W-1,CX+4)]='x'; seg(f,hx,hy,CX+7,17,'l',wide=False)
    return rows(f)
def frame_E_putt(ph):
    f=blank(); body(f,'E'); sx,sy=CX+1,12; dy=-0.6 if ph=='PT0' else 0.6
    hx,hy=CX+4,14; seg(f,sx,sy,hx,hy,'s'); f[14][min(W-1,CX+4)]='x'
    ex,ey=CX+7,17+dy; seg(f,hx,hy,ex,ey,'l',wide=False)
    box(f,int(ex)-1,int(ex)+1,int(ey),int(ey),'G'); box(f,int(ex)-1,int(ex)+1,int(ey)+1,int(ey)+1,'H')
    return rows(f)

PAL={'c':'#20304f','b':'#16223a','w':'#3a4c6b','h':'#3b2a1d','i':'#2a1d13',
     't':'#1f8f7e','d':'#166b5e','v':'#33a894','p':'#2a3350','q':'#1c2338',
     'o':'#181b22','s':'#c9926a','x':'#b07f56','j':'#a3714e','l':'#d3d6dc','G':'#2d323c','H':'#1c2027','u':'#fff'}
def render(rws,sc=11):
    im=Image.new('RGBA',(W*sc,H*sc),(0,0,0,0)); px=im.load()
    for y in range(H):
        for x in range(W):
            ch=rws[y][x]
            if ch=='.' or ch not in PAL: continue
            c=tuple(int(PAL[ch][i:i+2],16) for i in (1,3,5))+(255,)
            for dy in range(sc):
                for dx in range(sc): px[x*sc+dx,y*sc+dy]=c
    return im
if __name__=='__main__':
    GE={ph:frame_E(ph) for ph in ['A','B','D','C']}
    FULL=['A','B','D','C']
    grid=Image.new('RGBA',(W*11*4+40,H*11+40),(70,116,68,255)); dr=ImageDraw.Draw(grid)
    for c,ph in enumerate(FULL):
        dr.text((20+c*(W*11+8),4),{'A':'address','B':'top (coil)','D':'impact','C':'finish (heel up)'}[ph],fill=(240,240,240,255))
        grid.alpha_composite(render(GE[ph]),(20+c*(W*11+8),18))
    grid.save('scratchpad/swingfix2_E.png'); print('E ok')
