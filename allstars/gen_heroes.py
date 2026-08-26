#!/usr/bin/env python3
"""Chibi hero sprite generator for Run The All-Stars.

Composes a 24x32 chibi baseball player (big head, small body, facing the
camera at a slight downward tilt) with top-left light-and-shadow shading
and a 3-frame run cycle. Emits JS `art` arrays.

Palette key convention per region:
  outline 'k'
  skin    L(light) s(base) S(shadow)
  hair/cap/shirt/pants each get 3 tones too.
"""
import math

W, H = 24, 32

def blank():
    return [['.' for _ in range(W)] for _ in range(H)]

def put(g, x, y, c):
    if 0 <= x < W and 0 <= y < H:
        g[y][x] = c

def get(g, x, y):
    if 0 <= x < W and 0 <= y < H:
        return g[y][x]
    return '.'

def fill_ellipse(g, cx, cy, rx, ry, base, light, shadow, outline='k'):
    """Filled ellipse with top-left highlight, bottom-right shadow, outline."""
    for y in range(H):
        for x in range(W):
            dx = (x - cx) / rx
            dy = (y - cy) / ry
            d = dx*dx + dy*dy
            if d <= 1.0:
                # shading by position relative to a top-left light
                shade = (dx * 0.7 + dy * 0.7)
                if shade < -0.35:
                    g[y][x] = light
                elif shade > 0.45:
                    g[y][x] = shadow
                else:
                    g[y][x] = base
    # outline: any base/light/shadow cell adjacent to empty
    outline_cells(g, {base, light, shadow}, outline)

def fill_rrect(g, x0, y0, x1, y1, base, light, shadow, outline='k', round_c=1):
    for y in range(y0, y1+1):
        for x in range(x0, x1+1):
            # rounded corners
            if round_c:
                cxr = round_c
                corner = ((x < x0+cxr and y < y0+cxr and (x0+cxr-1-x)+(y0+cxr-1-y) >= cxr) or
                          (x > x1-cxr and y < y0+cxr and (x-(x1-cxr+1))+(y0+cxr-1-y) >= cxr) or
                          (x < x0+cxr and y > y1-cxr and (x0+cxr-1-x)+(y-(y1-cxr+1)) >= cxr) or
                          (x > x1-cxr and y > y1-cxr and (x-(x1-cxr+1))+(y-(y1-cxr+1)) >= cxr))
                if corner:
                    continue
            tl = (x - x0) + (y - y0)
            br = (x1 - x) + (y1 - y)
            if x <= x0+1 or y <= y0+1:
                g[y][x] = light
            elif x >= x1-1 or y >= y1-1:
                g[y][x] = shadow
            else:
                g[y][x] = base
    outline_cells(g, {base, light, shadow}, outline)

def outline_cells(g, region_chars, outline='k'):
    adds = []
    for y in range(H):
        for x in range(W):
            if g[y][x] == '.':
                for ddx, ddy in ((1,0),(-1,0),(0,1),(0,-1)):
                    if get(g, x+ddx, y+ddy) in region_chars:
                        adds.append((x,y)); break
    for (x,y) in adds:
        g[y][x] = outline

def eyes(g, cx, eyeY, spread=3, whites=True):
    for sx in (-spread, spread):
        x = cx + sx
        if whites:
            put(g, x-0, eyeY, 'e')  # dark pupil
            put(g, x, eyeY-1, 'W')
        else:
            put(g, x, eyeY, 'e')

def emit(g):
    return [''.join(r) for r in g]

# ---- base chibi builder ----
def chibi(params, leg='mid', arm='mid'):
    g = blank()
    cx = 11
    # torso first (drawn behind head slightly)
    tb = params['shirt']; tl = params['shirtL']; ts = params['shirtS']
    fill_rrect(g, 7, 17, 16, 25, tb, tl, ts, round_c=2)
    # arms
    sb = params['skin']; sl = params['skinL']; ss = params['skinS']
    arm_y = {'mid':19, 'up':18, 'down':20}[arm]
    # left arm
    for i in range(4):
        put(g, 5, arm_y+i, tb if i < 2 else sb)
        put(g, 6, arm_y+i, tl if i < 2 else sl)
    # right arm
    ay2 = {'mid':19, 'up':20, 'down':18}[arm]
    for i in range(4):
        put(g, 17, ay2+i, ts if i < 2 else ss)
        put(g, 18, ay2+i, tb if i < 2 else sb)
    outline_cells(g, {tb,tl,ts,sb,sl,ss}, 'k')
    # legs
    pb = params['pants']; pl = params['pantsL']; ps = params['pantsS']
    bt = params.get('boot','B')
    if leg == 'mid':
        lx, rx = (9,10), (13,14); lo, ro = 0, 0
    elif leg == 'a':  # left fwd, right back
        lx, rx = (8,9), (14,15); lo, ro = 0, 1
    else:  # 'b' right fwd, left back
        lx, rx = (9,10), (13,14); lo, ro = 1, 0
    for i in range(5):
        put(g, lx[0], 25+i+lo, pl); put(g, lx[1], 25+i+lo, pb)
        put(g, rx[0], 25+i+ro, pb); put(g, rx[1], 25+i+ro, ps)
    # feet
    put(g, lx[0], 30+lo, bt); put(g, lx[1], 30+lo, bt)
    put(g, rx[0], 30+ro, bt); put(g, rx[1], 30+ro, bt)
    outline_cells(g, {pb,pl,ps,bt}, 'k')
    # head (big, on top)
    fill_ellipse(g, cx, 10, 7.0, 6.5, sb, sl, ss)
    return g, cx

def add_cap(g, cx, base, light, shadow):
    # cap dome over the top of the head
    for y in range(H):
        for x in range(W):
            dx = (x-cx)/7.0; dy=(y-4.2)/4.6
            if dx*dx+dy*dy <= 1.0 and y <= 6:
                g[y][x] = light if (dx<-0.2 or dy<-0.3) else (shadow if dx>0.4 else base)
    # brim
    for x in range(cx-8, cx+3):
        if 0 <= x < W:
            g[6][x] = base
            g[7][x] = shadow
    outline_cells(g, {base,light,shadow}, 'k')

def face_default(g, cx):
    eyes(g, cx, 9, spread=3)
    # mouth
    for x in range(cx-2, cx+3):
        put(g, x, 13, 'm')

# ---------------- Heroes ----------------
def gen_popeye():
    p = dict(skin='s', skinL='L', skinS='S',
             shirt='w', shirtL='V', shirtS='X',
             pants='p', pantsL='P', pantsS='Q', boot='b')
    palette = {'k':'#0a0a10','L':'#ffe0b0','s':'#f0c088','S':'#b8895a',
               'V':'#ffffff','w':'#e8e8e8','X':'#b8b8b8',
               'P':'#2a5a9a','p':'#12407a','Q':'#08285a','b':'#2a2018',
               'e':'#0a0a10','W':'#ffffff','m':'#8a3a2a','h':'#c25c1a','r':'#c94b1a'}
    frames = {}
    for name, leg, arm in (('idle','mid','mid'),('run1','a','up'),('run2','b','down')):
        g, cx = chibi(p, leg=leg, arm=arm)
        add_cap(g, cx, 'w', 'V', 'X')
        # ginger hair band under cap
        for x in range(cx-6, cx+5):
            if get(g,x,7) in ('s','L','S'): put(g,x,7,'h')
        # squint eyes (one squint)
        put(g, cx-3, 9, 'e'); put(g, cx-2, 9, 'S')
        put(g, cx+3, 9, 'e')
        # pipe
        put(g, cx+4, 12, 'h'); put(g, cx+5, 12, 'h'); put(g, cx+6, 11, 'r')
        # mouth
        for x in range(cx-2, cx+2): put(g,x,13,'m')
        frames[name] = emit(g)
    return palette, frames

def gen_kong():
    p = dict(skin='d', skinL='b', skinS='D',
             shirt='d', shirtL='b', shirtS='D',
             pants='d', pantsL='b', pantsS='D', boot='k')
    palette = {'k':'#050302','D':'#1a0d05','d':'#3a2413','b':'#6a4a24',
               'f':'#a88458','L':'#c8a074','s':'#8b6a3a','S':'#5a4020',
               'e':'#f5e6c8','W':'#f5e6c8','m':'#2a1008'}
    frames = {}
    for name, leg, arm in (('idle','mid','mid'),('run1','a','up'),('run2','b','down')):
        g, cx = chibi(p, leg=leg, arm=arm)
        # lighter muzzle patch on the face
        for y in range(9,14):
            for x in range(cx-3, cx+4):
                if get(g,x,y) in ('d','b','D'): put(g,x,y,'f')
        # brow
        for x in range(cx-4, cx+5):
            if get(g,x,7) in ('d','b','D','f'): put(g,x,7,'D')
        eyes(g, cx, 9, spread=2)
        for x in range(cx-2, cx+3): put(g,x,12,'m')
        # big long arms hanging (overwrite arm area lower)
        for i in range(6):
            put(g,4,18+i,'d'); put(g,5,18+i,'b')
            put(g,18,18+i,'D'); put(g,19,18+i,'d')
        outline_cells(g, {'d','b','D','f'}, 'k')
        frames[name] = emit(g)
    return palette, frames

def gen_dracula():
    p = dict(skin='s', skinL='L', skinS='S',
             shirt='b', shirtL='c', shirtS='B',
             pants='b', pantsL='c', pantsS='B', boot='k')
    palette = {'k':'#050508','L':'#e8e0e0','s':'#cabcbc','S':'#8a8080',
               'b':'#0f0f16','c':'#26263a','B':'#050508',
               'r':'#8a1a1a','R':'#c94b1a','w':'#eaeaea',
               'e':'#c94b1a','W':'#eaeaea','m':'#6a1010','h':'#0a0a12'}
    frames = {}
    for name, leg, arm in (('idle','mid','mid'),('run1','a','up'),('run2','b','down')):
        g, cx = chibi(p, leg=leg, arm=arm)
        # slicked black hair with a widow's peak
        for x in range(cx-6, cx+6):
            if get(g,x,5) in ('s','L','S'): put(g,x,5,'h')
        for x in range(cx-6, cx+6):
            if get(g,x,6) in ('s','L','S'): put(g,x,6,'h')
        put(g, cx, 7, 'h')  # peak
        # red eyes
        put(g,cx-3,9,'e'); put(g,cx+3,9,'e')
        # fangs mouth
        for x in range(cx-2,cx+3): put(g,x,12,'m')
        put(g,cx-1,13,'w'); put(g,cx+1,13,'w')
        # white collar + red cape edges
        put(g,7,17,'w'); put(g,8,17,'w'); put(g,15,17,'w'); put(g,16,17,'w')
        for i in range(6):
            put(g,4,17+i,'r'); put(g,19,17+i,'r')
        outline_cells(g, {'b','c','B','r','w','h'}, 'k')
        frames[name] = emit(g)
    return palette, frames

def gen_medusa():
    p = dict(skin='g', skinL='G', skinS='d',
             shirt='g', shirtL='G', shirtS='d',
             pants='g', pantsL='G', pantsS='d', boot='k')
    palette = {'k':'#0a0c08','d':'#245524','g':'#4a9a5a','G':'#7ec06a',
               'L':'#c8e8a0','s':'#4a9a5a','S':'#245524',
               'y':'#f4c25a','e':'#f4c25a','W':'#f4c25a','m':'#3a5a20',
               'v':'#2a7a4a','V':'#5aaa6a'}
    frames = {}
    for name, leg, arm in (('idle','mid','mid'),('run1','a','up'),('run2','b','down')):
        g, cx = chibi(p, leg=leg, arm=arm)
        # snakes for hair: little green nubs around the top of the head
        snake_pts = [(cx-6,3),(cx-3,2),(cx,1),(cx+3,2),(cx+6,3),(cx-5,4),(cx+5,4)]
        for (sx,sy) in snake_pts:
            put(g,sx,sy,'v'); put(g,sx,sy+1,'V'); put(g,sx,sy-1,'v')
        # glowing yellow eyes
        put(g,cx-3,9,'e'); put(g,cx+3,9,'e')
        for x in range(cx-2,cx+3): put(g,x,12,'m')
        # scale pattern on the dress
        for y in range(19,24,2):
            for x in range(9,16,2):
                if get(g,x,y) in ('g','G','d'): put(g,x,y,'d')
        outline_cells(g, {'g','G','d','v','V'}, 'k')
        frames[name] = emit(g)
    return palette, frames

def js_frames(key, palette, frames):
    pal_str = ', '.join(f"{k}:'{v}'" for k,v in palette.items())
    out = [f"  {key}: {{"]
    out.append(f"    pal:{{ {pal_str} }},")
    out.append(f"    frames: {{")
    for fn in ('idle','run1','run2'):
        rows = frames[fn]
        rowstr = ',\n      '.join(f"'{r}'" for r in rows)
        out.append(f"      {fn}: [\n      {rowstr}\n      ],")
    out.append("    },")
    out.append("  },")
    return '\n'.join(out)

def validate(frames):
    for fn, rows in frames.items():
        assert len(rows) == H, f"{fn} has {len(rows)} rows"
        for i,r in enumerate(rows):
            assert len(r) == W, f"{fn} row {i} len {len(r)}"

heroes = [('kong', gen_kong()), ('popeye', gen_popeye()),
          ('dracula', gen_dracula()), ('medusa', gen_medusa())]
blocks = []
for key, (pal, frames) in heroes:
    validate(frames)
    blocks.append(js_frames(key, pal, frames))

print("const HERO_W = 24, HERO_H = 32;")
print("const HERO_SPRITES = {")
print('\n'.join(blocks))
print("};")
