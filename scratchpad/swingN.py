"""
CS502-anim NORTH pose (hitting up the hole / away from camera).
Owner spec: standing LEFT of the ball, FACE looking DOWN and RIGHT at the ball.
3 authored poses only: A=address, B=top-of-backswing, C=follow-through.
Impact reuses A ("hitting the ball = same as addressing"). Same 24x26 grid + palette
as swingfix2 so it drops into PXG_DIR8 as the 'N' facing.
"""
import json
from PIL import Image, ImageDraw
W,H=24,26; CX=10   # body sits slightly LEFT of centre so the ball (right) is clearly to the golfer's right
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

# ---- head: turned to look DOWN-RIGHT at the ball (cap top/back, face+eye on lower-right) ----
# release=True at follow-through: head comes UP and turns toward the target (up the line)
def head(f, release=False):
    if not release:
        # bent over, looking DOWN-RIGHT at the ball
        disc(f,CX-1,5,5,4,'c')               # cap crown (back of head, weighted upper-left)
        box(f,CX-5,CX+0,2,3,'b')             # cap dark band across the back
        f[4][CX-2]='w'                        # cap highlight
        box(f,CX+2,CX+4,5,5,'c'); f[6][CX+3]='b'; f[6][CX+4]='b'   # cap bill pointing down-right
        box(f,CX-5,CX-3,7,9,'h')             # hair fringe (back of head, lower-left)
        # face skin below the bill, cheek/jaw turned down-right toward the ball
        box(f,CX+1,CX+3,7,9,'s'); f[9][CX+2]='x'; f[9][CX+3]='x'
        f[7][CX+3]='u'                        # eye looking down-right
    else:
        # FINISH: SAME 3/4 view + head position as the address, just the BACK turned (no face; the back of
        # the head shows the cap + a hair fringe across the bottom, no down-right bill).
        disc(f,CX-1,5,5,4,'c')               # cap crown (same spot/size as address)
        box(f,CX-5,CX+0,2,3,'b')             # cap dark band
        f[4][CX-2]='w'                        # cap highlight
        box(f,CX-4,CX+3,8,9,'h')             # hair fringe across the bottom (back of head)

def legs_addr(f):
    box(f,CX-3,CX-1,17,21,'p'); box(f,CX+1,CX+3,17,21,'p')
    box(f,CX-3,CX-3,17,21,'q'); box(f,CX+3,CX+3,17,21,'q')
    box(f,CX-3,CX-1,22,22,'o'); box(f,CX+1,CX+3,22,22,'o')

def torso(f,ph):
    if ph=='A':   # square back, bent
        box(f,CX-4,CX+4,10,16,'t'); box(f,CX-4,CX-3,10,16,'d'); box(f,CX+3,CX+4,10,15,'v')
    elif ph=='B': # coil away: back/spine rotates in, shoulders turned
        box(f,CX-4,CX+3,10,16,'t'); box(f,CX-4,CX-2,10,16,'d'); box(f,CX+0,CX+1,11,16,'d')
        box(f,CX+2,CX+3,11,15,'v')
    elif ph=='C': # FINISH: same 3/4 silhouette as the address, back turned -> add a centre spine shade
        box(f,CX-4,CX+4,10,16,'t'); box(f,CX-4,CX-3,10,16,'d'); box(f,CX+3,CX+4,10,15,'v')  # = address torso
        box(f,CX-1,CX+0,12,16,'d')                                 # spine shade down the back

def legs(f,ph):
    if ph=='C':   # finish: same stance as address, trail (our-right) foot up on the toe
        box(f,CX-3,CX-1,17,22,'p'); box(f,CX-3,CX-3,17,22,'q'); box(f,CX-3,CX-1,22,22,'o')
        box(f,CX+1,CX+3,17,20,'p'); box(f,CX+3,CX+3,17,20,'q'); box(f,CX+1,CX+3,20,20,'o')  # toe
    elif ph=='B': # weight loads on the back (left) leg
        box(f,CX-3,CX-1,17,21,'p'); box(f,CX-3,CX-3,17,21,'q'); box(f,CX-3,CX-1,22,22,'o')
        box(f,CX+1,CX+3,17,21,'p'); box(f,CX+3,CX+3,17,21,'q'); box(f,CX+1,CX+3,22,22,'o')
    else: legs_addr(f)

def arms_club(f,ph):
    sx,sy=CX+1,11
    if ph=='A':   # hands low at the ball (down-right), club shaft to ball
        hx,hy=CX+5,15; seg(f,sx,sy,hx,hy,'s'); f[15][min(W-1,CX+5)]='x'
        seg(f,hx,hy,CX+8,17,'l',wide=False)
    elif ph=='B': # club up over the trail (right) shoulder, hooking back toward camera
        hx,hy=CX+2,9; seg(f,sx,sy,hx,hy,'s'); f[9][min(W-1,CX+2)]='x'
        seg(f,hx,hy,CX+5,5,'l',wide=False); seg(f,CX+5,5,CX+7,7,'l',wide=False)
    elif ph=='C': # FINISH back view: hands finished over the LEAD (our-left) shoulder, only the TOP of the
                  # club peeking up over it (the rest is behind the back, hidden).
        f[9][CX-3]='s'; f[10][CX-3]='x'                            # hands at the lead shoulder
        seg(f,CX-3,9,CX-6,6,'l',wide=False)                        # clean thin shaft over the shoulder
        f[5][max(0,CX-6)]='l'                                      # shaft tip
        box(f,max(0,CX-7),max(0,CX-6),3,4,'G'); f[3][max(0,CX-7)]='H'  # neat clubhead at the top

def frame(ph):
    f=blank()
    head(f, release=(ph=='C'))
    torso(f,ph); legs(f,ph); arms_club(f,ph)
    return rows(f)

PAL={'c':'#20304f','b':'#16223a','w':'#3a4c6b','h':'#3b2a1d','i':'#2a1d13',
     't':'#1f8f7e','d':'#166b5e','v':'#33a894','p':'#2a3350','q':'#1c2338',
     'o':'#181b22','s':'#c9926a','x':'#b07f56','j':'#a3714e','l':'#d3d6dc',
     'G':'#2d323c','H':'#1c2027','u':'#0d1526'}
def render(rws,sc=12):
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
    FR={ph:frame(ph) for ph in ['A','B','C']}
    # 4-frame playback: address, top, address(impact), follow-through
    seq=[('A','1 ADDRESS'),('B','2 TOP of backswing'),('A','3 ADDRESS = IMPACT'),('C','4 FOLLOW-THROUGH')]
    sc=11
    grid=Image.new('RGBA',(W*sc*4+90,H*sc+50),(70,116,68,255)); dr=ImageDraw.Draw(grid)
    for c,(ph,lab) in enumerate(seq):
        dr.text((20+c*(W*sc+18),6),lab,fill=(240,240,240,255))
        grid.alpha_composite(render(FR[ph],sc),(20+c*(W*sc+18),30))
    grid.save('scratchpad/swingN.png'); print('N ok')
    print(json.dumps({k:FR[k] for k in ['A','B','C']}))
