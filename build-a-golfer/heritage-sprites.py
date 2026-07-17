import re
h=open('/home/user/runthe-gg-site/build-a-golfer/build-a-golfer.html').read()
def getmap(name):
    m=re.search(r'const '+name+r'=\[(.*?)\];', h, re.S)
    return re.findall(r'"([^"]*)"', m.group(1))
BODY=getmap('PXG_BODY'); W=44; Hh=56
def blank(): return [['.' for _ in range(W)] for _ in range(Hh)]
def torso_cells():
    return [(x,y) for y in range(Hh) for x in range(W) if BODY[y][x] in 'tdv']
def leg_cells():
    return [(x,y) for y in range(Hh) for x in range(W) if BODY[y][x] in 'pqm']

# ---- CARDIGAN: knit button-up, V-neck collar, center placket + buttons ----
def cardigan():
    g=blank(); cells=torso_cells()
    ys=[y for _,y in cells]; top=min(ys); bot=max(ys)
    for (x,y) in cells:
        # mostly-solid knit: base '1', body's shade cells -> '2'; a faint knit fleck '5' (sparse, low-contrast)
        if BODY[y][x]=='d': g[y][x]='2'
        elif (x*2+y)%7==0: g[y][x]='5'
        else: g[y][x]='1'
    cx=21
    # V-NECK COLLAR: a ribbed collar band forming a shallow V at the top of the torso
    for k,y in enumerate(range(top, top+3)):
        for x in range(cx-4, cx+6):
            if 0<=x<W and g[y][x] in '125': g[y][x]='3'
        # open the very center of the V so the collar reads (inner neck shade)
        for x in range(cx-k, cx+2+k):
            if 0<=x<W and g[y][x]=='3' and k<2: g[y][x]='2'
    # center button placket + buttons
    for y in range(top+3,bot+1):
        for x in (cx,cx+1):
            if g[y][x] in '125': g[y][x]='3'
    for y in range(top+4,bot-1,3):
        if g[y][cx] in '3': g[y][cx]='4'; g[y][cx+1]='4'   # buttons
    return g

# ---- BLAZER: jacket + notched lapels showing inner shirt + tie, gold buttons ----
def blazer():
    g=blank(); cells=torso_cells()
    ys=[y for _,y in cells]; top=min(ys); bot=max(ys)
    for (x,y) in cells:
        g[y][x] = '2' if BODY[y][x]=='d' else '1'   # burgundy base + shade
    cx=21
    # chest V opening: rows top..top+7, widening down, center = inner shirt + tie
    for k,y in enumerate(range(top, min(top+8,bot))):
        halfw = 1 + k//2
        for x in range(cx-halfw+1, cx+halfw+1):
            if 0<=x<W and g[y][x] in '12': g[y][x]='6'   # inner shirt (cream)
        # tie down the very center
        if g[y][cx] in '6': g[y][cx]='7'
        if k>0 and g[y][cx+1] in '6': g[y][cx+1]='7'
        # lapel edges just outside the V
        for x in (cx-halfw, cx+halfw+1):
            if 0<=x<W and g[y][x] in '12': g[y][x]='8'
    # gold buttons lower on the jacket
    for y in range(top+8, bot, 3):
        if 0<=cx+1<W and g[y][cx+1] in '12': g[y][cx+1]='4'
    # breast pocket square hint (upper right of jacket)
    if g[top+3][cx+5] in '12': g[top+3][cx+5]='8'; g[top+3][cx+6]='8' if g[top+3][cx+6] in '12' else g[top+3][cx+6]
    return g

# ---- PLUS-FOURS: tweed knickers (upper) + argyle long socks (lower) ----
def plusfours():
    g=blank(); cells=leg_cells()
    ys=[y for _,y in cells]; top=min(ys); bot=max(ys); knee=top+5
    for (x,y) in cells:
        if y<knee:
            g[y][x] = '2' if BODY[y][x]=='q' else '1'     # tweed knicker base + shade
        else:
            # argyle sock: cream base with a diamond accent lattice
            lx=x%6; ly=y%4
            dia = (abs(lx-2)+abs((y-knee)%4-1))<=1
            g[y][x] = '4' if dia else ('3' if (BODY[y][x]!='q') else '5')
    # cuff band at the knee (buckled plus-four cuff)
    for (x,y) in cells:
        if knee-1<=y<=knee: g[y][x]='2'
    return g

# ---- TWEED CAP: flat/newsboy shape with heather-tweed color + subtle check ----
def tweed():
    FLAT=getmap('PXG_FLAT'); g=blank()
    for y in range(Hh):
        for x in range(W):
            c=FLAT[y][x]
            if c=='c': g[y][x] = '3' if ((x+y)%3==0) else '1'   # crown tweed + check specks
            elif c=='b': g[y][x]='2'                            # brim/shade
    return g

# ---- STRAW BOATER: flat-top straw hat with a navy band ----
def straw():
    g=blank()
    # crown rows 8-11, flat top; brim row 12 wide; band row 11
    for x in range(15,29): g[8][x]='1'
    for y in (9,10):
        for x in range(14,30): g[y][x]='1' if (x+y)%2 else '5'
    for x in range(14,30): g[11][x]='3'          # navy band
    for x in range(11,33): g[12][x]='2'          # brim
    for x in range(12,32): g[13][x]='1'          # brim front edge (straw)
    # weave specks on crown
    for y in (9,10):
        for x in range(14,30):
            if (x*3+y)%5==0: g[y][x]='4'
    return g

def emit(name,g):
    print('const '+name+'=[')
    print(',\n'.join('"'+''.join(r)+'"' for r in g)+'];')

emit('PXG_CARDIGAN',cardigan())
emit('PXG_BLAZER',blazer())
emit('PXG_PLUSFOURS',plusfours())
emit('PXG_TWEED',tweed())
emit('PXG_STRAW',straw())
