"""
CS502-anim: righty swing, 4 aim directions (physically-correct facing for a right-hander).
3 authored poses/dir (A=address, B=top, C=finish); game plays [A,B,A,C]. 24x26 grid.

  N aim = ball flies UP     -> golfer LEFT of ball, looks down-right, BACK turns to camera on finish (looks up)
  E aim = ball flies RIGHT  -> FRONT view, golfer ABOVE ball (ball below), faces camera
  S aim = ball flies DOWN   -> golfer RIGHT of ball, looks down-left; on finish the FACE turns to camera (3/4)
  W aim = ball flies LEFT   -> BACK view (back to camera), looks LEFT on finish
Ball anchor per dir keeps the golfer out of the flight path.
"""
import json
from PIL import Image, ImageDraw
W,H=24,26; CX=10
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
def mirror(rws): return [r[::-1] for r in rws]
# a proper club: thin SILVER shaft (1px 'l') + a thicker CLUBHEAD block at the tip
def clubhead(f,x,y):
    for dx in (-1,0):
        for dy in (0,1):
            xi,yi=x+dx,y+dy
            if 0<=xi<W and 0<=yi<H: f[yi][xi]='l'      # 2x2 silver head (thicker than the shaft)
    if 0<=x-1<W and 0<=y+2<H: f[y+2][x-1]='G'          # dark sole edge
    if 0<=x<W and 0<=y+2<H: f[y+2][x]='G'

# ================= SIDE 3/4 (N: golfer LEFT of ball, looks down-right) =================
def head_side(f, mode):   # 'down' (address/top look down-right), 'back' (N finish), 'cam' (S finish face camera)
    if mode=='down':
        disc(f,CX-1,5,5,4,'c'); box(f,CX-5,CX+0,2,3,'b'); f[4][CX-2]='w'
        box(f,CX+2,CX+4,5,5,'c'); f[6][CX+3]='b'; f[6][CX+4]='b'
        box(f,CX-5,CX-3,7,9,'h')
        box(f,CX+1,CX+3,7,9,'s'); f[9][CX+2]='x'; f[9][CX+3]='x'; f[7][CX+3]='u'
    elif mode=='back':    # back of the head (no face)
        disc(f,CX-1,5,5,4,'c'); box(f,CX-5,CX+0,2,3,'b'); f[4][CX-2]='w'
        box(f,CX-4,CX+3,8,9,'h')
    elif mode=='cam':     # face turned toward the CAMERA (front-3/4), used on the S finish
        disc(f,CX-1,4,5,4,'c'); box(f,CX-5,CX+2,1,2,'b'); f[3][CX-1]='w'
        box(f,CX-4,CX+2,5,5,'c')                                      # bill toward camera
        box(f,CX-2,CX+2,6,8,'s'); f[8][CX-1]='x'; f[8][CX+1]='x'      # face front
        f[6][CX-2]='u'; f[6][CX+2]='u'                               # eyes
def legs_addr(f):
    box(f,CX-3,CX-1,17,21,'p'); box(f,CX+1,CX+3,17,21,'p')
    box(f,CX-3,CX-3,17,21,'q'); box(f,CX+3,CX+3,17,21,'q')
    box(f,CX-3,CX-1,22,22,'o'); box(f,CX+1,CX+3,22,22,'o')
def torso_side(f,ph):
    if ph=='A': box(f,CX-4,CX+4,10,16,'t'); box(f,CX-4,CX-3,10,16,'d'); box(f,CX+3,CX+4,10,15,'v')
    elif ph=='B': box(f,CX-4,CX+3,10,16,'t'); box(f,CX-4,CX-2,10,16,'d'); box(f,CX+0,CX+1,11,16,'d'); box(f,CX+2,CX+3,11,15,'v')
    elif ph=='C': box(f,CX-4,CX+4,10,16,'t'); box(f,CX-4,CX-3,10,16,'d'); box(f,CX+3,CX+4,10,15,'v')
def legs_side(f,ph):
    if ph=='C':
        box(f,CX-3,CX-1,17,22,'p'); box(f,CX-3,CX-3,17,22,'q'); box(f,CX-3,CX-1,22,22,'o')
        box(f,CX+1,CX+3,17,20,'p'); box(f,CX+3,CX+3,17,20,'q'); box(f,CX+1,CX+3,20,20,'o')
    elif ph=='B':
        box(f,CX-3,CX-1,17,21,'p'); box(f,CX-3,CX-3,17,21,'q'); box(f,CX-3,CX-1,22,22,'o')
        box(f,CX+1,CX+3,17,21,'p'); box(f,CX+3,CX+3,17,21,'q'); box(f,CX+1,CX+3,22,22,'o')
    else: legs_addr(f)
def arms_side(f,ph):
    sx,sy=CX+1,11
    if ph=='A':
        hx,hy=CX+5,15; seg(f,sx,sy,hx,hy,'s'); f[15][min(W-1,CX+5)]='x'
        seg(f,hx,hy,CX+7,16,'l',wide=False); clubhead(f,CX+8,16)
    elif ph=='B':
        hx,hy=CX+2,9; seg(f,sx,sy,hx,hy,'s'); f[9][min(W-1,CX+2)]='x'
        seg(f,hx,hy,CX+5,5,'l',wide=False); seg(f,CX+5,5,CX+7,6,'l',wide=False); clubhead(f,CX+8,5)
    elif ph=='C':   # club over the lead (our-left) shoulder, only the top showing
        f[9][CX-3]='s'; f[10][CX-3]='x'
        seg(f,CX-3,9,CX-6,5,'l',wide=False); clubhead(f,CX-6,3)
def frame_N(ph):
    f=blank(); head_side(f,'back' if ph=='C' else 'down'); torso_side(f,ph); legs_side(f,ph); arms_side(f,ph); return rows(f)

# S aim: golfer RIGHT of ball. A/B = mirror of N's look (down-left). C = face-to-camera (built, then NOT mirrored).
def frame_S(ph):
    if ph in ('A','B'):
        return mirror(frame_N(ph))
    # finish: mirror N's finish BODY/legs/club (golfer on the right, club over our-right shoulder)...
    f=blank(); torso_side(f,'C'); legs_side(f,'C'); arms_side(f,'C')
    base=mirror(rows(f))                       # golfer flipped to the right side
    g=[list(r) for r in base]
    # ...then draw a CAMERA-facing head on top (so the finish looks at you, 3/4)
    head_side(f:=[['.']*W for _ in range(H)],'cam')
    for y in range(H):
        for x in range(W):
            if f[y][x]!='.': g[y][x]=f[y][x]
    return [''.join(r) for r in g]

# ================= FRONT view (E aim: hitting RIGHT / toward camera) =================
FCX=11
def head_front(f, mode='down'):   # 'down' (address/top), 'right' (E finish: look right toward the target)
    disc(f,FCX,4,5,4,'c'); box(f,FCX-4,FCX+4,2,3,'b'); f[3][FCX-1]='w'
    if mode=='right':
        box(f,FCX+1,FCX+4,6,6,'c')                      # cap bill turned to the right
        box(f,FCX+1,FCX+3,7,8,'s'); f[8][FCX+2]='x'     # face turned right (3/4 profile)
        f[7][FCX+3]='u'                                 # eye looking right
        box(f,FCX-3,FCX-1,7,8,'h')                      # back of the head/hair on the left
    else:
        box(f,FCX-3,FCX+3,6,6,'c')
        yy = 7 if mode=='down' else 6
        box(f,FCX-2,FCX+2,yy,yy+2,'s'); f[yy+2][FCX-1]='x'; f[yy+2][FCX+1]='x'
        f[yy][FCX-2]='u'; f[yy][FCX+2]='u'
def torso_front(f,ph):
    box(f,FCX-5,FCX+5,10,11,'t'); box(f,FCX-4,FCX+4,12,16,'t')
    box(f,FCX-5,FCX-4,10,11,'d'); box(f,FCX+4,FCX+5,10,11,'v')
    if ph=='B': box(f,FCX+1,FCX+2,11,15,'d')
def legs_front(f):
    box(f,FCX-3,FCX-1,17,22,'p'); box(f,FCX+1,FCX+3,17,22,'p')
    box(f,FCX-3,FCX-3,17,22,'q'); box(f,FCX+3,FCX+3,17,22,'q')
    box(f,FCX-3,FCX-1,22,22,'o'); box(f,FCX+1,FCX+3,22,22,'o')
def arms_front(f,ph):
    ls,rs=FCX-4,FCX+4
    if ph=='A':
        seg(f,ls,12,FCX-1,17,'s',wide=False); seg(f,rs,12,FCX+1,17,'s',wide=False)
        box(f,FCX-1,FCX+1,17,18,'s'); f[18][FCX]='x'; seg(f,FCX,18,FCX,20,'l',wide=False); clubhead(f,FCX+1,20)
    elif ph=='B':
        seg(f,rs,12,FCX-1,10,'s',wide=False); f[10][FCX-1]='x'
        seg(f,FCX-1,10,FCX-5,6,'l',wide=False); clubhead(f,FCX-5,4)
    elif ph=='C':
        seg(f,ls,11,FCX+3,9,'s',wide=False); f[9][FCX+3]='x'
        seg(f,FCX+3,9,FCX+6,5,'l',wide=False); clubhead(f,FCX+7,4)
def frame_E(ph):
    f=blank(); head_front(f, mode=('right' if ph=='C' else 'down')); torso_front(f,ph); legs_front(f); arms_front(f,ph); return rows(f)

# ================= BACK view (W aim: hitting LEFT) =================
def head_back(f, look=None):   # look: None (address/top), 'left' (finish look left)
    disc(f,FCX,4,5,4,'c'); box(f,FCX-4,FCX+4,2,3,'b'); f[3][FCX+1]='w'   # back of cap
    if look=='left':
        box(f,FCX-4,FCX+2,8,8,'h'); box(f,FCX-4,FCX-3,6,8,'s'); f[7][FCX-4]='u'  # look left: hair + a sliver of face on the left
    else:
        box(f,FCX-3,FCX+3,8,9,'h')                                       # hair fringe (pure back)
def torso_back(f,ph):
    box(f,FCX-5,FCX+5,10,11,'t'); box(f,FCX-4,FCX+4,12,16,'t')
    box(f,FCX-1,FCX+0,10,16,'d')                                         # spine
    if ph=='B': box(f,FCX-3,FCX-2,11,15,'d')
def arms_back(f,ph):
    ls,rs=FCX-4,FCX+4
    if ph=='A':      # BACK view at address: arms & club are in front of the body -> hidden (draw nothing)
        return
    elif ph=='B':    # TOP: arms hidden behind the body, only the club pokes up top-right over the shoulder
        seg(f,FCX+3,10,FCX+5,5,'l',wide=False); clubhead(f,FCX+6,4)
    elif ph=='C':    # FINISH: the raised arms + club up top-right (the old top-frame arms); head looks left
        seg(f,ls,12,FCX+1,10,'s',wide=False); f[10][FCX+1]='x'
        seg(f,FCX+1,10,FCX+5,6,'l',wide=False); clubhead(f,FCX+6,4)
def frame_W(ph):
    f=blank(); head_back(f, look=('left' if ph=='C' else None)); torso_back(f,ph); legs_front(f); arms_back(f,ph); return rows(f)

FRAMES={'N':frame_N,'E':frame_E,'S':frame_S,'W':frame_W}
ANCH={'N':[18,17],'E':[11,21],'S':[W-1-18,17],'W':[10,18]}

PAL={'c':'#20304f','b':'#16223a','w':'#3a4c6b','h':'#3b2a1d','i':'#2a1d13',
     't':'#1f8f7e','d':'#166b5e','v':'#33a894','p':'#2a3350','q':'#1c2338',
     'o':'#181b22','s':'#c9926a','x':'#b07f56','j':'#a3714e','l':'#d3d6dc',
     'G':'#2d323c','H':'#1c2027','u':'#0d1526'}
def render(rws,sc=10):
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
    out={}; sc=10
    dirs=['N','E','S','W']; dirlab={'N':'N aim (up)','E':'E aim (right)','S':'S aim (toward you)','W':'W aim (left)'}
    seq=[('A','1 address'),('B','2 top'),('A','3 impact'),('C','4 finish')]
    grid=Image.new('RGBA',(W*sc*4+130,(H*sc+34)*4+20),(70,116,68,255)); dr=ImageDraw.Draw(grid)
    for ri,d in enumerate(dirs):
        fr={ph:FRAMES[d](ph) for ph in ['A','B','C']}
        out[d]={ph:fr[ph] for ph in ['A','B','C']}
        dr.text((6,10+ri*(H*sc+34)+H*sc//2),dirlab[d],fill=(245,240,200,255))
        for ci,(ph,lab) in enumerate(seq):
            if ri==0: dr.text((110+ci*(W*sc+8),4),lab,fill=(235,235,235,255))
            grid.alpha_composite(render(fr[ph],sc),(110+ci*(W*sc+8),18+ri*(H*sc+34)))
    grid.save('scratchpad/swing4.png'); print('4-dir ok')
    json.dump({'frames':out,'anch':ANCH}, open('scratchpad/swing4.json','w'))
